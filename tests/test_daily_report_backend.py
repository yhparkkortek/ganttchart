# -*- coding: utf-8 -*-
"""📔 일일보고 백엔드(텔레그램 수신 + 미작성 알림) 하네스 — 2026-11-04

    python tests/test_daily_report_backend.py

⚠️ 가짜는 **바깥 경계에만** 둔다 — NAS(`_nas()`)·텔레그램(`send_telegram_msg`,
   `requests.get`) 세 개뿐이고, 검사 대상은 `kortek_backend` 의 **진짜 함수**다.
⚠️ 사람이 돌리는 5000번 프로세스를 죽이지 않는다 — `app.test_client()` 로만 두드린다.
   (import 해도 스케줄러는 안 뜬다 — `if __name__ == '__main__'` 안에 있다. 확인함)
⚠️ 이 하네스는 **실제 텔레그램으로 아무것도 보내지 않는다.**
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


# ── 경계 가짜 ────────────────────────────────────────────────────────────────
class FakeNas(object):
    """메모리 NAS. `download` 는 없는 경로에 예외를 던진다(진짜와 같은 모양)."""

    def __init__(self):
        self.files = {}
        self.fail_read = set()
        self.fail_write = False

    def abs_path(self, rel, team=None):
        return '/ROOT/' + rel

    def download(self, path):
        rel = path.replace('/ROOT/', '')
        if rel in self.fail_read:
            raise RuntimeError('권한 거부(403)')
        if rel not in self.files:
            raise RuntimeError('파일을 찾을 수 없습니다 (404)')
        return self.files[rel].encode('utf-8')

    def put(self, path, data):
        if self.fail_write:
            raise RuntimeError('쓰기 실패')
        self.files[path.replace('/ROOT/', '')] = data.decode('utf-8')
        return {'ok': True}


NAS = FakeNas()
SENT = []
UPDATES = []

B._nas = lambda: NAS
B.send_telegram_msg = lambda msg, chat_id=None: (SENT.append((chat_id, msg)) or {'ok': True})
B.TELEGRAM_TOKEN = 'fake-token'


class _Resp(object):
    def __init__(self, payload):
        self._p = payload

    def json(self):
        return self._p


B.requests.get = lambda url, **kw: _Resp({'ok': True, 'result': list(UPDATES)})

STATE = os.path.join(os.path.dirname(B.DAILY_TG_STATE), '_test_daily_state.json')
B.DAILY_TG_STATE = STATE


def reset(roster=None, nonwork=None, state=None):
    NAS.files.clear()
    NAS.fail_read.clear()
    NAS.fail_write = False
    del SENT[:]
    del UPDATES[:]
    if roster is not None:
        NAS.files['App_Config/DailyReport/_roster.json'] = json.dumps({'members': roster}, ensure_ascii=False)
    if nonwork is not None:
        NAS.files['App_Config/DailyReport/_nonworkdays.json'] = json.dumps(nonwork, ensure_ascii=False)
    try:
        os.remove(STATE)
    except OSError:
        pass
    if state:
        with open(STATE, 'w', encoding='utf-8') as f:
            json.dump(state, f)


ME = 'yhpark'
B.nas_dsm = type('X', (), {'load_config': staticmethod(lambda: {'user': ME})})
sys.modules['nas_dsm'] = B.nas_dsm

TODAY = datetime.now(B.KST).strftime('%Y-%m-%d')
ROSTER = [
    {'key': ME, 'name': '박용훈', 'tgChatId': '111', 'notifier': True, 'active': True},
    {'key': 'jschoi', 'name': '최종석', 'tgChatId': '222', 'active': True},
    {'key': 'nobot', 'name': '봇없음', 'active': True},
]
FRESH = {'days': [], 'until': (datetime.now(B.KST) + timedelta(days=60)).strftime('%Y-%m-%d')}


print('\n■ 경로 규칙 — 프런트(js/59)와 같아야 한다')
ok('월 폴더가 밑줄이다(DSM 이 숫자+하이픈 폴더를 거부한다)',
   B._daily_rel('2026-11-04', 'yhpark') == 'App_Config/DailyReport/2026_11/2026-11-04__yhpark.json',
   B._daily_rel('2026-11-04', 'yhpark'))

print('\n■ 자유 텍스트 담기 — 서식을 외우게 하지 않는다')
d = B._daily_apply_text({'items': []}, '패널 사양서 검토\n금형 업체 회신')
ok('태그가 없으면 전부 "오늘 한 일"', len(d['items']) == 2 and not d.get('next'))
d = B._daily_apply_text({'items': []}, '패널 검토\n내일: 금형 확인\n이슈: 납기 2주 밀림')
ok('태그가 있으면 칸을 나눈다',
   len(d['items']) == 1 and '금형 확인' in d.get('next', '') and '납기' in d.get('issue', ''),
   json.dumps(d, ensure_ascii=False)[:120])
d = B._daily_apply_text({'items': [{'name': '기존'}], 'next': '먼저'}, '내일: 추가분')
ok('이어 붙인다(덮지 않는다)', d['next'].startswith('먼저') and '추가분' in d['next'], d['next'])

print('\n■ 비근무일 — 모르면 안 보낸다')
reset(ROSTER, None)
ok('비근무일 파일이 없으면 True(안 보냄)', B._daily_nonworkday(TODAY) is True)
reset(ROSTER, {'days': [], 'until': '2020-01-01'})
ok('목록이 낡았으면 True(안 보냄)', B._daily_nonworkday(TODAY) is True)
reset(ROSTER, FRESH)
sat = '2026-11-07'
ok('토요일은 True', B._daily_nonworkday(sat) is True)
reset(ROSTER, {'days': [TODAY], 'until': FRESH['until']})
ok('공휴일 목록에 있으면 True', B._daily_nonworkday(TODAY) is True)
reset(ROSTER, FRESH)
ok('평일 + 최신 목록이면 False(보낼 수 있다)', B._daily_nonworkday(TODAY) is False)

print('\n■ 담당 PC 판정 — 여러 PC 가 동시에 폴링하면 안 된다')
reset(ROSTER, FRESH)
ok('명단의 notifier 와 내 계정이 같으면 담당', B._daily_is_notifier()[0] is True)
reset([dict(m, notifier=False) for m in ROSTER], FRESH)
ok('notifier 가 아무도 아니면 아무도 안 한다', B._daily_is_notifier()[0] is False)
reset(None, FRESH)
NAS.fail_read.add('App_Config/DailyReport/_roster.json')
ok('명단을 못 읽으면 담당 아님 + roster=None', B._daily_is_notifier() == (False, None))

print('\n■ 미작성 알림')
reset(ROSTER, FRESH, {'dueAt': '00:00'})
r = B._daily_report_tick()
ok('안 쓴 사람에게만 보낸다(봇 없는 사람 제외)', sorted(r.get('sent', [])) == sorted([ME, 'jschoi']), r)
ok('보낸 메시지가 2건', len(SENT) == 2, len(SENT))
r2 = B._daily_report_tick()
ok('같은 날 두 번 안 보낸다', r2.get('sent') == [], r2)

reset(ROSTER, FRESH, {'dueAt': '00:00'})
NAS.files[B._daily_rel(TODAY, 'jschoi')] = json.dumps({'items': [{'name': 'x'}]})
r = B._daily_report_tick()
ok('쓴 사람은 건너뛴다', ME in r.get('sent', []) and 'jschoi' not in r.get('sent', []), r)

reset(ROSTER, FRESH, {'dueAt': '00:00'})
NAS.files[B._daily_rel(TODAY, 'jschoi')] = json.dumps({'dayType': 'leave', 'items': []})
r = B._daily_report_tick()
ok('휴가로 적어 두면 비어 있어도 안 보낸다', 'jschoi' not in r.get('sent', []), r)

reset([dict(m, leave=[{'from': TODAY, 'to': TODAY}]) if m['key'] == 'jschoi' else m for m in ROSTER],
      FRESH, {'dueAt': '00:00'})
r = B._daily_report_tick()
ok('명단의 휴가 구간도 면제', 'jschoi' not in r.get('sent', []), r)

reset(ROSTER, FRESH, {'dueAt': '00:00'})
NAS.fail_read.add(B._daily_rel(TODAY, 'jschoi'))
r = B._daily_report_tick()
ok('조회가 실패하면 **아무에게도 안 보낸다**', r.get('ok') is False and len(SENT) == 0,
   'sent=%d %s' % (len(SENT), r))

reset(ROSTER, FRESH, {'dueAt': '23:59'})
r = B._daily_report_tick()
ok('마감 전에는 안 보낸다', r.get('skipped') == 'before-due', r)

reset(ROSTER, None, {'dueAt': '00:00'})
r = B._daily_report_tick()
ok('비근무일 판정을 못 하면 안 보낸다', r.get('skipped') == 'non-workday' and len(SENT) == 0, r)

print('\n■ 텔레그램 수신')
reset(ROSTER, FRESH)
UPDATES.extend([{'update_id': 10, 'message': {'chat': {'id': 111}, 'text': '패널 검토\n내일: 금형 확인'}}])
r = B._daily_tg_tick()
doc = json.loads(NAS.files[B._daily_rel(TODAY, ME)])
ok('내 하루 파일에 담긴다', r.get('handled') == 1 and len(doc['items']) == 1 and '금형' in doc['next'], r)
ok('되읽어 확인 메시지를 보낸다', len(SENT) == 1 and '일일보고' in SENT[0][1], SENT[:1])
ok('offset 을 올린다', B._daily_state().get('offset') == 11, B._daily_state())

reset(ROSTER, FRESH)
UPDATES.extend([{'update_id': 20, 'message': {'chat': {'id': 999}, 'text': '누구세요'}}])
r = B._daily_tg_tick()
ok('모르는 chat_id 는 무시하고 **답하지 않는다**', r.get('ignored') == 1 and len(SENT) == 0, r)

reset(ROSTER, FRESH)
UPDATES.extend([{'update_id': 30, 'message': {'chat': {'id': 111}, 'text': '휴가'}}])
B._daily_tg_tick()
ok('"휴가" 한 단어는 일 종류로', json.loads(NAS.files[B._daily_rel(TODAY, ME)])['dayType'] == 'leave')

reset(ROSTER, FRESH)
NAS.fail_write = True
UPDATES.extend([{'update_id': 40, 'message': {'chat': {'id': 111}, 'text': '뭐라도'}}])
r = B._daily_tg_tick()
ok('쓰기 실패하면 offset 을 안 올린다(다음 틱 재시도)',
   (B._daily_state().get('offset') or 0) == 0 and r.get('handled') == 0, B._daily_state())

reset([dict(m, notifier=False) for m in ROSTER], FRESH)
UPDATES.extend([{'update_id': 50, 'message': {'chat': {'id': 111}, 'text': 'x'}}])
r = B._daily_tg_tick()
ok('담당 PC 가 아니면 폴링조차 안 한다', r.get('skipped') == 'not-notifier', r)

print('\n■ 라우트(5000번 프로세스를 건드리지 않는다)')
reset(ROSTER, FRESH, {'dueAt': '00:00'})
c = B.app.test_client()
res = c.get('/daily/config')
j = res.get_json()
ok('/daily/config 가 응답한다', res.status_code == 200 and j.get('ok') and j.get('isNotifier') is True, j)
res = c.post('/daily/config', json={'dueAt': '18:30'})
ok('/daily/config 저장', res.get_json().get('dueAt') == '18:30', res.get_json())
reset(ROSTER, FRESH, {'dueAt': '00:00'})
res = c.post('/daily/tick', json={'force': True})
j = res.get_json()
ok('/daily/tick 이 수신·알림을 둘 다 돈다', j.get('ok') and 'inbound' in j and 'notify' in j, j)

try:
    os.remove(STATE)
except OSError:
    pass

print('\n%s %d/%d 통과' % ('OK' if FAIL[0] == 0 else 'FAIL', PASS[0], PASS[0] + FAIL[0]))
print('※ 실제 텔레그램 발송·실제 NAS 쓰기는 하지 않았다 — 경계를 가짜로 뒀다.')
sys.exit(1 if FAIL[0] else 0)
