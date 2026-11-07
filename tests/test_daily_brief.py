# -*- coding: utf-8 -*-
"""☀️ 아침 브리핑(백엔드, AI 없음) 하네스 — 2026-11-08

    python tests/test_daily_brief.py

⚠️ 가짜는 **바깥 경계에만** — NAS(`_nas()`)·텔레그램 발송(`send_telegram_msg`)·비근무일 판정
   (`_daily_nonworkday`, 날짜에 매이지 않게). 검사 대상은 `_daily_brief_tick` 이라는 **진짜 입구**다.
⚠️ 프로젝트 파일 픽스처는 **앱이 저장하는 모양 그대로**(`globalData` = `{data:[…], _level, _origT*, _담당구분,
   _calcStartTs, _calcPlanTs}`) — rowName 에 업무명을 넣는 식으로 계약을 흉내 내면 하네스가 거짓말한다(11-05 교훈).
⚠️ 실제 텔레그램으로 아무것도 보내지 않는다.
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
        self.fail_read = set()
        self.downloads = []

    def abs_path(self, rel, team=None):
        return '/ROOT/' + rel

    def download(self, path):
        rel = path.replace('/ROOT/', '')
        self.downloads.append(rel)
        if rel in self.fail_read:
            raise RuntimeError('권한 거부(403)')
        if rel not in self.files:
            raise RuntimeError('파일을 찾을 수 없습니다 (404)')
        v = self.files[rel]
        return v if isinstance(v, bytes) else v.encode('utf-8')

    def put(self, path, data):
        self.files[path.replace('/ROOT/', '')] = data.decode('utf-8')
        return {'ok': True}


NAS = FakeNas()
SENT = []
B._nas = lambda: NAS
B.send_telegram_msg = lambda msg, chat_id=None: (SENT.append((chat_id, msg)) or {'ok': True})
B.TELEGRAM_TOKEN = 'fake-token'
STATE = os.path.join(os.path.dirname(B.DAILY_TG_STATE), '_test_brief_state.json')
B.DAILY_TG_STATE = STATE
ME = 'yhpark'
B.nas_dsm = type('X', (), {'load_config': staticmethod(lambda: {'user': ME})})
sys.modules['nas_dsm'] = B.nas_dsm
NONWORK = [False]
B._daily_nonworkday = lambda s: NONWORK[0]

TODAY = datetime.now(B.KST).date()
D = lambda n: TODAY + timedelta(days=n)                      # noqa: E731
YMD = lambda d: d.strftime('%Y-%m-%d')                       # noqa: E731


def ms(d):
    return int(datetime(d.year, d.month, d.day, tzinfo=B.KST).timestamp() * 1000)


ROSTER = [
    {'key': 'yhpark', 'name': '박용훈', 'team': '개발3팀', 'tgChatId': '111', 'notifier': True, 'aliases': ['Y.Park']},
    {'key': 'kim', 'name': '김팀원', 'team': '개발3팀', 'tgChatId': '222'},
    {'key': 'nobot', 'name': '봇없음', 'team': '개발3팀'},
]


def row(level, name, disc, start, end, status=''):
    o = {'data': ['', name, YMD(start) if start else '', YMD(end) if end else '', status], '_level': level,
         '_담당구분': disc}
    o[['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][level]] = name
    if start:
        o['_calcStartTs'] = ms(start)
    if end:
        o['_calcPlanTs'] = ms(end)
    return o


def project_doc(rows, meta=None, m3=None):
    return {'globalData': [{'data': ['No', 'WBS', 'start', 'plan', 'status']}] + rows,
            'colIdx': {'no': 0, 'wbs': 1, 'start': 2, 'plan': 3, 'status': 4},
            'projectMeta': meta or {}, 'tabData': {'projectMembers3': m3 or []}}


def reset(projects, state=None, roster=None):
    NAS.files.clear()
    NAS.fail_read.clear()
    del NAS.downloads[:]
    del SENT[:]
    B._BRIEF_CACHE.clear()
    NONWORK[0] = False
    NAS.files['App_Config/DailyReport/_roster.json'] = json.dumps({'members': roster or ROSTER}, ensure_ascii=False)
    idx = []
    for i, (fname, doc, extra) in enumerate(projects):
        e = {'file_name': fname, 'team': '개발3팀', 'updated_at': '2026-11-08T00:00:00', 'completed': False}
        e.update(extra or {})
        idx.append(e)
        if doc is not None:
            NAS.files['개발3팀/' + fname] = json.dumps(doc, ensure_ascii=False)
    NAS.files['App_Config/project_index.json'] = json.dumps({'projects': idx}, ensure_ascii=False)
    try:
        os.remove(STATE)
    except OSError:
        pass
    if state:
        with open(STATE, 'w', encoding='utf-8') as f:
            json.dump(state, f)


def my_msg():
    return [m for c, m in SENT if c == '111']


META = {'프로젝트담당자': '박용훈', 'HW담당자': '김팀원', 'FW담당자': '조익현,Y.Park', '기구담당자': '남'}
P1 = project_doc([
    row(0, 'STELLAR32', '', D(-30), D(30)),                        # 부모(리프 아님)
    row(1, '회로 설계 지연', 'HW', D(-10), D(-2)),                   # 김팀원 — 지연
    row(1, 'PM 오늘 마감', 'PM', D(-5), D(0)),                      # 나(PM) — 오늘 마감
    row(1, 'FW 이번 주', 'FW', D(1), D(3)),                        # 나(별칭 Y.Park, 쉼표 다중) — 이번 주
    row(1, 'PM 완료된 지연', 'PM', D(-9), D(-3), '완료'),            # 완료 — 제외
    row(1, '오늘 시작 기구', '기구', D(0), D(5)),                      # 남 — 제외
    row(1, 'PM 오늘 시작', 'PM, HW', D(0), D(9)),                    # 나+김 — 둘 다 오늘 시작
    row(1, '날짜 없음', 'PM', None, None),                           # 제외
    row(1, 'PM 먼 미래', 'PM', D(20), D(40)),                       # 7일 밖 — 제외
], META)

print('\n[1] 내 업무만 · 섹션 분류(지연/오늘 마감/오늘 시작/이번 주) · 리프·완료·날짜없음 제외')
reset([('LNW_STELLAR32.json', P1, None)])
r = B._daily_brief_tick(force=True)
ok('두 사람에게 발송(봇 없는 사람 제외)', sorted(r.get('sent') or []) == ['kim', 'yhpark'], r)
m = my_msg()[0] if my_msg() else ''
ok('오늘 마감 — PM 오늘 마감', '오늘 마감' in m and 'PM 오늘 마감' in m, m)
ok('이번 주 — FW 이번 주(별칭 Y.Park, 쉼표 다중으로 잡힘)', 'FW 이번 주' in m, m)
ok('오늘 시작 — PM 오늘 시작', '오늘 시작' in m and 'PM 오늘 시작' in m, m)
ok('남의 지연(회로 설계)은 내 브리핑에 없다', '회로 설계 지연' not in m, m)
ok('완료·날짜 없음·7일 밖·부모 행은 없다', all(x not in m for x in ['PM 완료된 지연', '날짜 없음', 'PM 먼 미래', 'STELLAR32</i>']) and '• STELLAR32' not in m, m)
ok('내 지연 섹션은 없다(지연이 없으니까)', '지연(미완료)' not in m, m)
km = [x for c, x in SENT if c == '222'][0]
ok('김팀원 — 지연(회로 설계)·오늘 시작(PM, HW)', '지연' in km and '회로 설계 지연' in km and 'PM 오늘 시작' in km and 'PM 오늘 마감' not in km, km)
ok('프로젝트 이름이 붙는다', '[LNW_STELLAR32]' in m, m)

print('\n[2] 어제 보고 여부 — 없으면 한 줄, 있으면 없다')
ok('어제 보고 없음 → 안내 줄', '어제 일일보고가 <b>없습니다</b>' in m, m)
yday = YMD(D(-1))
reset([('LNW_STELLAR32.json', P1, None)])
NAS.files[B._daily_rel(yday, 'yhpark')] = json.dumps({'items': [{'name': 'x'}]})
B._daily_brief_tick(force=True)
ok('어제 보고 있음 → 그 줄 없음', '어제 일일보고' not in my_msg()[0], my_msg())

print('\n[3] 볼 게 없고 어제 보고도 있으면 안 보낸다(sendIfEmpty=False) · 어제 보고가 없으면 그것만이라도 보낸다')
EMPTY = project_doc([row(1, '남의 일', 'HW', D(0), D(0))], META)
reset([('X.json', EMPTY, None)])
NAS.files[B._daily_rel(yday, 'yhpark')] = json.dumps({'items': [{'name': 'x'}]})
r = B._daily_brief_tick(force=True, only_key='yhpark')
ok('발송 0 · empty 에 기록', not my_msg() and r.get('empty') == ['yhpark'], r)
reset([('X.json', EMPTY, None)])
r = B._daily_brief_tick(force=True, only_key='yhpark')
ok('어제 보고 없음 → "마감·지연 없음" + 보고 안내로 보낸다', len(my_msg()) == 1 and '없습니다' in my_msg()[0] and '마감·지연 업무는 없습니다' in my_msg()[0], my_msg())

print('\n[4] 모르면 안 보낸다 — 색인 실패 0건 · 파일 하나 실패는 본문에 밝힌다')
reset([('LNW_STELLAR32.json', P1, None)])
NAS.fail_read.add('App_Config/project_index.json')
r = B._daily_brief_tick(force=True)
ok('색인 실패 → ok False · 발송 0', r.get('ok') is False and not SENT, r)
reset([('LNW_STELLAR32.json', P1, None), ('BROKEN.json', None, None)])
B._daily_brief_tick(force=True, only_key='yhpark')
ok('읽지 못한 프로젝트 1개를 본문에 적는다', len(my_msg()) == 1 and '프로젝트 1개를 읽지 못해' in my_msg()[0], my_msg())

print('\n[5] 관문 — 담당 PC·켜짐·근무일·시각·하루 한 번')
reset([('LNW_STELLAR32.json', P1, None)], state={'briefAt': '23:59'})
ok('시각 전이면 건너뜀', B._daily_brief_tick().get('skipped') == 'before-time')
reset([('LNW_STELLAR32.json', P1, None)], state={'briefAt': '00:00', 'briefEnabled': False})
ok('꺼져 있으면 건너뜀', B._daily_brief_tick().get('skipped') == 'disabled')
reset([('LNW_STELLAR32.json', P1, None)], state={'briefAt': '00:00'})
NONWORK[0] = True
ok('비근무일 건너뜀', B._daily_brief_tick().get('skipped') == 'non-workday')
NONWORK[0] = False
r1 = B._daily_brief_tick()
r2 = B._daily_brief_tick()
ok('자동 틱 — 보내고, 같은 날 두 번째는 대상 없음', sorted(r1.get('sent') or []) == ['kim', 'yhpark'] and r2.get('skipped') == 'no-targets', (r1, r2))
with open(STATE, 'r', encoding='utf-8') as f:
    st = json.load(f)
ok('lastFired 에 오늘 날짜', (st.get('briefLastFired') or {}).get('yhpark') == YMD(TODAY), st)
other = [dict(m) for m in ROSTER]
other[0] = dict(other[0], notifier=False)
reset([('LNW_STELLAR32.json', P1, None)], state={'briefAt': '00:00'}, roster=other)
ok('담당 PC 가 아니면 자동 틱은 안 돈다', B._daily_brief_tick().get('skipped') == 'not-notifier')
ok('미리보기(force+only_key) 는 담당이 아니어도 나에게만', B._daily_brief_tick(force=True, only_key='yhpark').get('sent') == ['yhpark'] and len(SENT) == 1)

print('\n[6] 캐시 — updated_at 이 같으면 프로젝트 파일을 다시 안 내려받는다 · 완료 프로젝트는 안 읽는다')
reset([('LNW_STELLAR32.json', P1, None), ('DONE.json', P1, {'completed': True})])
B._daily_brief_tick(force=True, only_key='yhpark')
n1 = NAS.downloads.count('개발3팀/LNW_STELLAR32.json')
B._daily_brief_tick(force=True, only_key='yhpark')
n2 = NAS.downloads.count('개발3팀/LNW_STELLAR32.json')
ok('두 번째 틱은 내려받기 0', n1 == 1 and n2 == 1, (n1, n2))
ok('완료 프로젝트는 안 읽었다', 'DONE.json' not in ' '.join(NAS.downloads))

print('\n[7] 돌연변이 — 별칭표를 비우면 "기구" 담당이 빗나간다(하네스가 그 차이를 본다)')
META2 = {'기구담당자': '박용훈'}
P2 = project_doc([row(1, '기구 오늘 마감', '기구', D(-1), D(0))], META2)
reset([('P2.json', P2, None)])
B._daily_brief_tick(force=True, only_key='yhpark')
ok('정상: 기구 → ME → 기구담당자 로 잡힌다', my_msg() and '기구 오늘 마감' in my_msg()[0], my_msg())
saved = dict(B.BRIEF_DISC_ALIAS)
B.BRIEF_DISC_ALIAS.clear()
reset([('P2.json', P2, None)])
B._daily_brief_tick(force=True, only_key='yhpark')
ok('(돌연변이) 별칭 없이도 "기구" 는 BRIEF_ROLE_FIELD 에 직접 있어 잡힌다 — 표 두 개가 서로 보완', my_msg() and '기구 오늘 마감' in my_msg()[0], my_msg())
B.BRIEF_DISC_ALIAS.update(saved)
saved_rf = dict(B.BRIEF_ROLE_FIELD)
B.BRIEF_ROLE_FIELD.clear()
reset([('P2.json', P2, None)])
r = B._daily_brief_tick(force=True, only_key='yhpark')
ok('(돌연변이) 역할표를 비우면 그 업무가 내 것으로 안 잡힌다(어제 보고 없음 안내만 간다)',
   my_msg() and '기구 오늘 마감' not in my_msg()[0] and '마감·지연 업무는 없습니다' in my_msg()[0], (r, my_msg()))
B.BRIEF_ROLE_FIELD.update(saved_rf)

try:
    os.remove(STATE)
except OSError:
    pass
print('\n결과: %d/%d 통과' % (PASS[0], PASS[0] + FAIL[0]))
sys.exit(1 if FAIL[0] else 0)
