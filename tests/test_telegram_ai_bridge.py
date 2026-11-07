# -*- coding: utf-8 -*-
"""🤖📱 텔레그램 → AI 문답 접수(백엔드) 하네스 — 2026-11-08

    python tests/test_telegram_ai_bridge.py

⚠️ 가짜는 **바깥 경계에만** — NAS(`_nas()`)·텔레그램 발송(`send_telegram_msg`)·
   `requests.get`(getUpdates). 검사 대상은 `_daily_tg_tick` 이라는 **진짜 입구**다 —
   `_tg_ai_handle` 을 직접 부르는 시험은 보조일 뿐이다(연결이 끊겨도 잡히게 입구로 돈다).
⚠️ 실제 텔레그램으로 아무것도 보내지 않는다. 5000번 프로세스도 건드리지 않는다.
"""
import io
import json
import os
import sys
import time
from datetime import datetime

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
        self.mtimes = {}
        self.fail_write = False
        self.fail_list = False

    def abs_path(self, rel, team=None):
        return '/ROOT/' + rel

    def download(self, path):
        rel = path.replace('/ROOT/', '')
        if rel not in self.files:
            raise RuntimeError('파일을 찾을 수 없습니다 (404)')
        v = self.files[rel]
        return v if isinstance(v, bytes) else v.encode('utf-8')

    def put(self, path, data):
        if self.fail_write:
            raise RuntimeError('쓰기 실패')
        rel = path.replace('/ROOT/', '')
        self.files[rel] = data.decode('utf-8') if isinstance(data, bytes) else data
        self.mtimes[rel] = time.time()
        return {'ok': True}

    def list_folder(self, path, limit=1000):
        if self.fail_list:
            raise RuntimeError('권한 거부(105)')
        rel = path.replace('/ROOT/', '').rstrip('/') + '/'
        items = []
        for k in self.files:
            if k.startswith(rel) and '/' not in k[len(rel):]:
                items.append({'name': k[len(rel):], 'path': '/ROOT/' + k, 'isdir': False,
                              'size': len(self.files[k]), 'mtime': self.mtimes.get(k, 0)})
        return {'path': path, 'count': len(items), 'items': items}


NAS = FakeNas()
SENT = []
UPDATES = []
B._nas = lambda: NAS
B.send_telegram_msg = lambda msg, chat_id=None: (SENT.append((chat_id, msg)) or {'ok': True})
B.TELEGRAM_TOKEN = 'fake-token'


class _Resp(object):
    def __init__(self, p):
        self._p = p

    def json(self):
        return self._p


def _fake_get(url, **kw):
    if '/getUpdates' in url:
        return _Resp({'ok': True, 'result': list(UPDATES)})
    return _Resp({'ok': False, 'description': '하네스가 모를 주소: ' + url})


B.requests.get = _fake_get
STATE = os.path.join(os.path.dirname(B.DAILY_TG_STATE), '_test_tgqa_state.json')
B.DAILY_TG_STATE = STATE

ME = 'yhpark'
B.nas_dsm = type('X', (), {'load_config': staticmethod(lambda: {'user': ME})})
sys.modules['nas_dsm'] = B.nas_dsm
TODAY = datetime.now(B.KST).strftime('%Y-%m-%d')
ROSTER = [
    {'key': 'yhpark', 'name': '박용훈', 'team': '개발3팀', 'tgChatId': '111', 'notifier': True},
    {'key': 'kim', 'name': '김팀원', 'team': '개발3팀', 'tgChatId': '222'},
]
Q_DIR = B.TG_AI_QUEUE_DIR


def reset(state=None):
    NAS.files.clear()
    NAS.mtimes.clear()
    NAS.fail_write = False
    NAS.fail_list = False
    del SENT[:]
    del UPDATES[:]
    NAS.files['App_Config/DailyReport/_roster.json'] = json.dumps({'members': ROSTER}, ensure_ascii=False)
    try:
        os.remove(STATE)
    except OSError:
        pass
    st = dict(state or {})
    st['primed'] = True
    with open(STATE, 'w', encoding='utf-8') as f:
        json.dump(st, f)


def upd(uid, chat, text):
    return {'update_id': uid, 'message': {'chat': {'id': int(chat)}, 'text': text}}


def queue_files():
    return sorted(k for k in NAS.files if k.startswith(Q_DIR + '/'))


def state():
    with open(STATE, 'r', encoding='utf-8') as f:
        return json.load(f)


print('\n[1] 접두어 가르기 — `_tg_ai_strip`(데이터 TG_AI_PREFIXES)')
ok('/ai 질문 → 질문', B._tg_ai_strip('/ai 999001 재고 확인') == '999001 재고 확인')
ok('AI: 대문자·콜론', B._tg_ai_strip('AI: 이번 주 마감') == '이번 주 마감')
ok('?오늘 → 오늘', B._tg_ai_strip('?오늘 일정') == '오늘 일정')
ok('/질문 — 한글 접두어', B._tg_ai_strip('/질문 BOM 보여줘') == 'BOM 보여줘')
ok('접두어 없는 보고 글은 None', B._tg_ai_strip('STELLAR32 점검\n한일: 원자재 확인') is None)
ok('"한일:" 로 시작해도 None(일일보고 태그)', B._tg_ai_strip('한일: 회의') is None)
ok('/ai 만 → 빈 문자열(도움말로 간다)', B._tg_ai_strip('/ai') == '')
ok('너무 긴 질문은 자른다', len(B._tg_ai_strip('/ai ' + 'x' * 5000)) == B.TG_AI_MAX_QUESTION)

print('\n[2] 진짜 입구 `_daily_tg_tick` — /ai 는 보고가 아니라 큐로 간다')
reset()
UPDATES.append(upd(1001, '111', '/ai 999001 재고 확인해줘'))
res = B._daily_tg_tick()
ok('처리 1건', res.get('handled') == 1, res)
qf = queue_files()
ok('큐 파일 하나 — <key>__tg<uid>.json', qf == [Q_DIR + '/yhpark__tg1001.json'], qf)
doc = json.loads(NAS.files[qf[0]]) if qf else {}
ok('질문 본문(접두어 뗀 것)', doc.get('text') == '999001 재고 확인해줘', doc)
ok('chatId·key·reply 가 실려 있다', doc.get('chatId') == '111' and doc.get('key') == 'yhpark' and doc.get('reply') == 'telegram', doc)
ok('일일보고 파일은 안 생겼다', not any(k.startswith('App_Config/DailyReport/%s' % TODAY[:7].replace('-', '_')) for k in NAS.files), [k for k in NAS.files])
ok('접수 답장 1통(앱 신호 없음 → "꺼져 있는 것 같다")', len(SENT) == 1 and '꺼져' in SENT[0][1], SENT)
ok('offset 이 올라갔다', state().get('offset') == 1002, state())

print('\n[3] 앱이 살아 있으면 "만드는 중" 으로 답한다(신호 파일 mtime)')
reset()
NAS.put('/ROOT/' + Q_DIR + '/online__yhpark.json', b'{}')          # 방금 찍힌 신호
UPDATES.append(upd(1002, '111', '/ai 이번 주 마감 업무'))
B._daily_tg_tick()
ok('"만드는 중" 답장', len(SENT) == 1 and '만드는 중' in SENT[0][1], SENT)
reset()
NAS.put('/ROOT/' + Q_DIR + '/online__yhpark.json', b'{}')
NAS.mtimes[Q_DIR + '/online__yhpark.json'] = time.time() - B.TG_AI_ONLINE_STALE_SEC - 10   # 오래된 신호
UPDATES.append(upd(1003, '111', '/ai 메일 요약'))
B._daily_tg_tick()
ok('오래된 신호 → "꺼져 있는 것 같다"', len(SENT) == 1 and '꺼져' in SENT[0][1], SENT)
reset()
NAS.fail_list = True
UPDATES.append(upd(1004, '111', '/ai 메일 요약'))
B._daily_tg_tick()
ok('목록을 못 읽으면 모른다고(중립 문구) — 거짓으로 "꺼졌다" 안 한다', len(SENT) == 1 and '꺼져' not in SENT[0][1] and '접수' in SENT[0][1], SENT)
ok('그래도 큐엔 들어갔다', queue_files() == [Q_DIR + '/yhpark__tg1004.json'], queue_files())

print('\n[4] 도움말 — /help·도움말 은 큐에 안 넣고 사용법만')
reset()
UPDATES.append(upd(1005, '111', '/help'))
UPDATES.append(upd(1006, '111', '도움말'))
UPDATES.append(upd(1007, '111', '/ai'))
B._daily_tg_tick()
ok('3통 다 도움말', len(SENT) == 3 and all('/ai' in m for _, m in SENT), [m[:40] for _, m in SENT])
ok('큐 비어 있음', queue_files() == [], queue_files())
ok('일일보고 서식도 같이 안내', all('한일:' in m for _, m in SENT))

print('\n[4b] /브리핑 — 내 브리핑을 즉시(관문 무시·나에게만), 큐엔 안 넣는다')
reset()
BRIEF_CALLS = []
_orig_brief = B._daily_brief_tick
B._daily_brief_tick = lambda force=False, only_key=None: (BRIEF_CALLS.append((force, only_key)) or {'ok': True, 'sent': [only_key]})
UPDATES.append(upd(1020, '111', '/브리핑'))
B._daily_tg_tick()
ok('브리핑 틱을 force+내 key 로 불렀다', BRIEF_CALLS == [(True, 'yhpark')], BRIEF_CALLS)
ok('큐·보고 파일 없음 · 추가 답장 없음(브리핑 본문은 틱이 직접 보낸다)', queue_files() == [] and len(SENT) == 0, (queue_files(), SENT))
B._daily_brief_tick = lambda force=False, only_key=None: {'ok': True, 'sent': [], 'empty': [only_key]}
reset()
UPDATES.append(upd(1021, '111', '브리핑'))
B._daily_tg_tick()
ok('보낼 게 없으면 그렇다고 답한다', len(SENT) == 1 and '보낼 브리핑이 없습니다' in SENT[0][1], SENT)
B._daily_brief_tick = _orig_brief

print('\n[5] 접두어 없는 글은 예전처럼 일일보고로 간다(회귀)')
reset()
UPDATES.append(upd(1008, '111', 'STELLAR32 점검\n한일: 원자재 확인'))
B._daily_tg_tick()
rel = B._daily_rel(TODAY, 'yhpark')
ok('보고 파일 생성', rel in NAS.files, list(NAS.files))
ok('큐엔 아무것도 없다', queue_files() == [])
ok('되읽기 답장', len(SENT) == 1 and '일일보고' in SENT[0][1])

print('\n[6] 모르는 chat_id 는 무시(답도 안 한다)')
reset()
UPDATES.append(upd(1009, '999', '/ai 뭐든'))
res = B._daily_tg_tick()
ok('무시 1건·발송 0', res.get('ignored') == 1 and len(SENT) == 0 and queue_files() == [], (res, SENT))

print('\n[7] 접수 쓰기 실패 → offset 안 올림(다음 틱 재시도), 답장도 없다')
reset()
NAS.fail_write = True
UPDATES.append(upd(1010, '111', '/ai 재고'))
B._daily_tg_tick()
ok('offset 그대로', state().get('offset', 0) == 0, state())
ok('답장 없음', len(SENT) == 0, SENT)
NAS.fail_write = False
B._daily_tg_tick()
ok('다음 틱에 처리됨', queue_files() == [Q_DIR + '/yhpark__tg1010.json'] and state().get('offset') == 1011, (queue_files(), state()))

print('\n[8] 두 사람이 섞여 와도 각자 key 로 간다')
reset()
UPDATES.append(upd(1011, '111', '/ai 내 일정'))
UPDATES.append(upd(1012, '222', '/q 김팀원 질문'))
UPDATES.append(upd(1013, '222', '회의 참석'))
B._daily_tg_tick()
ok('큐 2건, 각자 key', queue_files() == [Q_DIR + '/kim__tg1012.json', Q_DIR + '/yhpark__tg1011.json'], queue_files())
ok('김팀원 보고 글은 보고로', B._daily_rel(TODAY, 'kim') in NAS.files)

print('\n[9] 돌연변이 — 입구 연결이 끊기면 잡히는가(접두어 목록을 비우면 /ai 가 보고로 샌다)')
reset()
saved = list(B.TG_AI_PREFIXES)
B.TG_AI_PREFIXES[:] = []
UPDATES.append(upd(1014, '111', '/ai 재고'))
B._daily_tg_tick()
ok('(돌연변이) 큐가 비고 보고로 샜다 — 하네스가 그 차이를 본다', queue_files() == [] and B._daily_rel(TODAY, 'yhpark') in NAS.files)
B.TG_AI_PREFIXES[:] = saved

try:
    os.remove(STATE)
except OSError:
    pass
print('\n결과: %d/%d 통과' % (PASS[0], PASS[0] + FAIL[0]))
sys.exit(1 if FAIL[0] else 0)
