# -*- coding: utf-8 -*-
"""⏰📋 핀셋 알람 NAS 읽기 + 알림 채널 상태판 하네스 — 2026-11-21

    py -3 tests/test_alarm_nas_notify_status.py

왜: 저장소가 NAS 로 간 뒤(11-04)에도 핀셋 "기간·반복" 알람은 Drive(서비스계정)에서 프로젝트·주소록을
읽고 있었고, 스케줄러는 틱 결과를 버려 "오늘 왜 안 왔나" 를 볼 자리가 없었다.

⚠️ 가짜는 **바깥 경계에만** — NAS(`_nas()`)·텔레그램 발송·메일 발송·Drive 읽기. 입구는 진짜
   `_scheduler_tick`(→`_fire_rule`→`_fire_alarm_rule`→`_build_alarm_task_snapshot`)과
   `app.test_client().get('/notify/status')` 다.
⚠️ 실제 텔레그램·메일로 아무것도 보내지 않는다. 사용자가 돌리는 5000번 프로세스는 건드리지 않는다.
"""
import io
import json
import os
import sys
from datetime import datetime, timedelta

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import kortek_backend as B  # noqa: E402

PASS = [0]
FAIL = [0]


def ok(name, cond, detail=''):
    if cond:
        PASS[0] += 1
        print('  OK   %s' % name)
    else:
        FAIL[0] += 1
        print('  FAIL %s%s' % (name, ('  — ' + str(detail)) if detail else ''))


class FakeNas(object):
    def __init__(self):
        self.files = {}
        self.downloads = []
        self.ok = True

    def abs_path(self, rel, team=None):
        return '/ROOT/' + rel

    def download(self, path):
        rel = path.replace('/ROOT/', '')
        self.downloads.append(rel)
        if not self.ok:
            raise RuntimeError('로그인 안 됨(119)')
        if rel not in self.files:
            raise RuntimeError('파일을 찾을 수 없습니다 (404)')
        v = self.files[rel]
        return v if isinstance(v, bytes) else v.encode('utf-8')

    def status(self):
        return {'ok': self.ok, 'reason': '' if self.ok else 'no-session'}

    def load_config(self):
        return {'user': 'yhpark'}


NAS = FakeNas()
SENT = []
MAILS = []
DRIVE_READS = []
B._nas = lambda: NAS
B.send_telegram_msg = lambda msg, chat_id=None, reply_markup=None: (SENT.append((chat_id, msg)) or {'ok': True})
B._send_mail_core = lambda to, subject, body, cc='': (MAILS.append((to, subject)) or (True, '', None))


def _fake_drive_read(fid):
    DRIVE_READS.append(fid)
    raise RuntimeError('Drive 404 (가짜)')


B._drive_read_json_file = _fake_drive_read
B._drive_load_address_book = lambda force=False: []
B.TELEGRAM_TOKEN = 'fake-token'
B.TELEGRAM_CHAT_ID = ''
B.DAILY_TG_STATE = os.path.join(os.path.dirname(B.DAILY_TG_STATE), '_test_alarm_state.json')
B.SCHEDULE_FILE = os.path.join(os.path.dirname(B.DAILY_TG_STATE), '_test_alarm_rules.json')
B.MAIL_WATCH_FILE = os.path.join(os.path.dirname(B.DAILY_TG_STATE), '_test_alarm_mw.json')
for p in (B.DAILY_TG_STATE, B.SCHEDULE_FILE, B.MAIL_WATCH_FILE):
    if os.path.exists(p):
        os.remove(p)
B._nas_address_book_cache['data'] = None
B._nas_address_book_cache['loadedAt'] = 0.0
# `_daily_is_notifier` 는 `import nas_dsm` 을 직접 한다(`_nas()` 가 아니라) — 브리핑 하네스와 같은 방식으로 모듈을 갈아 끼운다
B.nas_dsm = type('X', (), {'load_config': staticmethod(lambda: {'user': 'yhpark'})})
sys.modules['nas_dsm'] = B.nas_dsm

TODAY = datetime.now(B.KST).date()
YMD = lambda d: d.strftime('%Y-%m-%d')                       # noqa: E731
NOW = datetime.now(B.KST)
HHMM = '%02d:%02d' % (NOW.hour, NOW.minute)


def ms(d):
    return int(datetime(d.year, d.month, d.day, tzinfo=B.KST).timestamp() * 1000)


def project(due_in_days=2, assignee='박용훈'):
    cols = ['no', 'devStage', 'taskType1', 'content', 'start', 'plan', 'status', 'assignee']
    ci = {c: i for i, c in enumerate(cols)}
    due = TODAY + timedelta(days=due_in_days)
    rows = [
        {'data': [1, '개발', '', '', YMD(TODAY), '', '진행', ''], '_level': 0, '_origDev': '개발'},
        {'data': [2, '', '회로 검토', '[%s→김검토] 검토 요청' % assignee, YMD(TODAY), YMD(due), '진행', assignee],
         '_level': 1, '_origT1': '회로 검토', '_알림': True, '_calcPlanTs': ms(due)},
    ]
    return {'globalData': rows, 'colIdx': ci, 'projectMeta': {'고객사': 'LNW', '고객모델명': 'TESTMODEL'}}


ADDR = {'addressBook': [
    {'name': '박용훈', 'email': 'yhpark@kortek.co.kr', 'telegramId': '111'},
    {'name': '김검토', 'email': 'kim@kortek.co.kr', 'telegramId': '222'},
]}
FID_OLD = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'          # 옛 Drive id(별칭) — 지도에 있다
FID_NAS = 'nas_f_' + __import__('base64').urlsafe_b64encode('개발3팀/LNW_TEST_32.0.json'.encode()).decode().rstrip('=')


def reset_nas():
    NAS.files = {
        'App_Config/nas_id_map.json': json.dumps({'map': {FID_OLD: '개발3팀/LNW_TEST_32.0.json'}}),
        'App_Config/project_index.json': json.dumps({'projects': [
            {'drive_file_id': 'IDX_ONLY_ID', 'file_name': 'LNW_IDXONLY_27.0.json', 'team': '개발3팀'}]}),
        'App_Config/AddressBook_Shared.json': json.dumps(ADDR),
        '개발3팀/LNW_TEST_32.0.json': json.dumps(project()),
        '개발3팀/LNW_IDXONLY_27.0.json': json.dumps(project(assignee='김검토')),
        'App_Config/DailyReport/_roster.json': json.dumps({'members': [
            {'key': 'yhpark', 'name': '박용훈', 'tgChatId': '111', 'notifier': True},
            {'key': 'kim', 'name': '김검토', 'tgChatId': '222'}]}),
    }
    NAS.downloads = []
    NAS.ok = True
    B._nas_address_book_cache['data'] = None
    B._nas_address_book_cache['loadedAt'] = 0.0
    del SENT[:]
    del MAILS[:]
    del DRIVE_READS[:]


def rule(fid, row_idx=1, rid='r1', title='회로 검토'):
    return {'id': rid, 'type': 'alarm', 'title': title, 'driveFileId': fid, 'rowIdx': row_idx,
            'taskNameSnapshot': title, 'ccRecipientsSnapshot': [], 'allowedExternalDomainsSnapshot': [],
            'dateMode': 'range', 'startDate': YMD(TODAY - timedelta(days=1)), 'endDate': YMD(TODAY + timedelta(days=30)),
            'dayInterval': 1, 'hourStart': HHMM, 'hourEnd': HHMM, 'hourInterval': 1, 'enabled': True}


print('\n[1] 프로젝트 읽기 — NAS 먼저')
reset_nas()
doc, src = B._project_doc_by_id(FID_OLD)
ok('옛 Drive id 는 id 지도로 풀어 NAS 에서 읽는다', src == 'nas' and isinstance(doc.get('globalData'), list), src)
ok('Drive 는 한 번도 안 부른다', DRIVE_READS == [], DRIVE_READS)
doc, src = B._project_doc_by_id(FID_NAS)
ok('nas_f_ id 는 지도 없이도 경로로 풀린다', src == 'nas', src)
doc, src = B._project_doc_by_id('IDX_ONLY_ID')
ok('지도에 없는 id 는 색인의 drive_file_id 로 team/file_name 을 찾아 읽는다', src == 'nas' and doc['globalData'][1]['data'][7] == '김검토', src)
try:
    B._project_doc_by_id('UNKNOWN_ID')
    ok('모르는 id 는 예외', False)
except Exception as e:
    ok('모르는 id 는 NAS 사유 + Drive 폴백 사유를 함께 들고 예외', 'NAS' in str(e) and 'Drive' in str(e), e)
    ok('그때만 Drive 를 한 번 시도한다(폴백)', DRIVE_READS == ['UNKNOWN_ID'], DRIVE_READS)

print('\n[2] 주소록 — NAS 먼저')
reset_nas()
B._nas_address_book_cache['data'] = None
ab = B._load_address_book(force=True)
ok('NAS AddressBook_Shared.json 을 읽는다', any(p.get('telegramId') == '222' for p in ab), ab)
ok('Drive 주소록은 안 부른다', 'App_Config/AddressBook_Shared.json' in NAS.downloads and DRIVE_READS == [])

print('\n[3] 진짜 입구 — _scheduler_tick → _fire_rule → 텔레그램·메일')
reset_nas()
B.SCHEDULE_RULES[:] = [rule(FID_OLD)]
res = B._scheduler_tick()
ok('규칙이 지금 시각에 울린다', res.get('sent') == 1 and res.get('fired') == ['회로 검토'], res)
ok('담당자(발신)와 수신인 둘 다 텔레그램을 받는다', sorted(c for c, _ in SENT) == ['111', '222'], SENT)
ok('메일도 나간다(담당자+수신인)', len(MAILS) == 1 and 'yhpark@kortek.co.kr' in MAILS[0][0] and 'kim@kortek.co.kr' in MAILS[0][0], MAILS)
r0 = B.SCHEDULE_RULES[0]
ok('규칙에 lastResult 가 적힌다(텔레그램 2·메일 1·source nas)',
   (r0.get('lastResult') or {}).get('telegram') == 2 and r0['lastResult'].get('email') == 1 and r0['lastResult'].get('source') == 'nas', r0.get('lastResult'))
ok('텔레그램 본문에 프로젝트·업무·기한이 있다', all(s in SENT[0][1] for s in ('LNW', '회로 검토', 'D-2')), SENT[0][1])
res2 = B._scheduler_tick()
ok('같은 분에 다시 돌려도 중복 발송 없음(lastFiredBucket)', res2.get('sent') == 0 and len(SENT) == 2, res2)

print('\n[4] 실패도 규칙에 남는다')
reset_nas()
B.SCHEDULE_RULES[:] = [rule('UNKNOWN_ID', rid='r2', title='없는 프로젝트')]
res = B._scheduler_tick()
lr = B.SCHEDULE_RULES[0].get('lastResult') or {}
ok('프로젝트를 못 읽으면 errors 에 사유가 남고 발송 0', lr.get('errors') and lr.get('telegram') == 0 and SENT == [], lr)
ok('틱 요약에도 오류가 올라온다(ok:false)', res.get('ok') is False and res.get('errors'), res)
reset_nas()
NAS.files['App_Config/AddressBook_Shared.json'] = json.dumps({'addressBook': []})
B._nas_address_book_cache['data'] = None
B.SCHEDULE_RULES[:] = [rule(FID_OLD, rid='r3')]
B._scheduler_tick()
lr = B.SCHEDULE_RULES[0].get('lastResult') or {}
ok('주소록에 텔레그램 id 가 없으면 "조용히 0" 이 아니라 skipped 사유가 적힌다', '텔레그램' in (lr.get('skipped') or ''), lr)

print('\n[5] 상태판 기록 — 틱 결과를 버리지 않는다')
B._notify_record('brief', {'ok': True, 'skipped': 'not-notifier'})
st = B.NOTIFY_STATUS['brief']
ok('skipped 사유가 lastResult 에 남는다', st['lastResult'].get('skipped') == 'not-notifier' and st['runs'] >= 1, st)
ok('보낸 게 없으면 lastSentAt 은 비어 있다', st['lastSentAt'] == '')
B._notify_record('brief', {'ok': True, 'sent': ['yhpark']})
ok('sent 목록이 있으면 lastSentAt 이 찍힌다', B.NOTIFY_STATUS['brief']['lastSentAt'] != '')
B._notify_record('mailWatch', {'ok': False, 'message': '그룹웨어 로그인 안 됨'})
ok('ok:false 는 lastError 로', '그룹웨어' in B.NOTIFY_STATUS['mailWatch']['lastError'])
B._notify_record('tgInbound', None, exc=RuntimeError('boom'))
ok('예외도 lastError 로', 'boom' in B.NOTIFY_STATUS['tgInbound']['lastError'])
B._notify_record('tgInbound', {'ok': True, 'handled': 2, 'ignored': 0, 'offset': 5})
ok('수신 처리 건수(handled)도 "활동" 으로 친다', B.NOTIFY_STATUS['tgInbound']['lastSentAt'] != '')

print('\n[6] GET /notify/status — 진짜 라우트')
reset_nas()
B.SCHEDULE_RULES[:] = [rule(FID_OLD, rid='r4')]
B._scheduler_tick()
c = B.app.test_client()
j = c.get('/notify/status').get_json()
ok('ok 와 채널 5개', j.get('ok') and len(j.get('channels') or []) == 5, j.get('channels') and [x['key'] for x in j['channels']])
pc = j.get('pc') or {}
ok('이 PC 가 📣 담당인지·명단 수·텔레그램 토큰이 보인다', pc.get('isNotifier') is True and pc.get('rosterCount') == 2 and pc.get('telegramToken') is True, pc)
ok('📣 담당자 이름 목록', pc.get('notifiers') == ['박용훈'], pc.get('notifiers'))
sch = next(x for x in j['channels'] if x['key'] == 'schedule')
ok('예약 채널에 규칙 수·오늘 활성·최근 결과가 실린다',
   sch['config']['rules'] == 1 and sch['config']['activeToday'] == 1 and sch['config']['recent'][0]['lastResult']['telegram'] == 2, sch['config'])
mw = next(x for x in j['channels'] if x['key'] == 'mailWatch')
ok('메일 알림 채널에 enabled·gwSession 칸이 있다', 'enabled' in mw['config'] and 'gwSession' in mw['config'], mw['config'])
br = next(x for x in j['channels'] if x['key'] == 'brief')
ok('브리핑 채널에 시각·오늘 발송 수', br['config'].get('briefAt') and 'firedToday' in br['config'], br['config'])
dr = next(x for x in j['channels'] if x['key'] == 'dailyRemind')
ok('미작성 알림 채널에 dueAt', dr['config'].get('dueAt') == '17:00', dr['config'])
NAS.ok = False
j2 = c.get('/notify/status').get_json()
ok('NAS 세션이 없어도 상태판은 뜨고 nasOk:false·사유를 말한다', j2.get('ok') and j2['pc']['nasOk'] is False and j2['pc']['rosterCount'] is None, j2.get('pc'))
ok('그때 isNotifier 는 false(명단을 못 읽었으니 모른다)', j2['pc']['isNotifier'] is False)

for p in (B.DAILY_TG_STATE, B.SCHEDULE_FILE, B.MAIL_WATCH_FILE):
    if os.path.exists(p):
        os.remove(p)
print('\n결과: %d/%d 통과' % (PASS[0], PASS[0] + FAIL[0]))
sys.exit(1 if FAIL[0] else 0)
