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
from datetime import datetime, timezone, timedelta

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
    # 요청 파일만 — 신호 파일(online__/pending__)은 앱의 parseName 도 요청으로 안 본다
    return sorted(k for k in NAS.files if k.startswith(Q_DIR + '/')
                  and not k.rsplit('/', 1)[-1].startswith(('online__', 'pending__')))


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
#  ⚠️ [2026-11-09] 질문을 한 번 보내면 그 사람은 **AI 문답 모드**다 — 뒤에 온 접두어 없는
#     "회의 참석" 도 질문으로 간다(그게 "문답창처럼"의 뜻이다). 보고로 적으려면 서식(`한일:`)
#     이나 `/보고`. 그래서 여기선 김팀원의 뒷글도 큐로 가고, 보고 파일은 안 생긴다.
reset()
UPDATES.append(upd(1011, '111', '/ai 내 일정'))
UPDATES.append(upd(1012, '222', '/q 김팀원 질문'))
UPDATES.append(upd(1013, '222', '회의 참석'))
B._daily_tg_tick()
ok('큐 3건, 각자 key', queue_files() == [Q_DIR + '/kim__tg1012.json', Q_DIR + '/kim__tg1013.json',
                                        Q_DIR + '/yhpark__tg1011.json'], queue_files())
ok('모드가 사람별이다(박용훈만 1건)', json.loads(NAS.files[Q_DIR + '/yhpark__tg1011.json']).get('key') == 'yhpark')
ok('문답 모드라 보고 파일은 안 생겼다', B._daily_rel(TODAY, 'kim') not in NAS.files, list(NAS.files))
reset()
UPDATES.append(upd(1011, '111', '/ai 내 일정'))
UPDATES.append(upd(1013, '222', '회의 참석'))      # 김팀원은 모드가 아니다
B._daily_tg_tick()
ok('모드 아닌 사람의 글은 그대로 보고로', B._daily_rel(TODAY, 'kim') in NAS.files
   and queue_files() == [Q_DIR + '/yhpark__tg1011.json'], (queue_files(), list(NAS.files)))

print('\n[9] 돌연변이 — 입구 연결이 끊기면 잡히는가(접두어 목록을 비우면 /ai 가 보고로 샌다)')
reset()
saved = list(B.TG_AI_PREFIXES)
B.TG_AI_PREFIXES[:] = []
UPDATES.append(upd(1014, '111', '/ai 재고'))
B._daily_tg_tick()
ok('(돌연변이) 큐가 비고 보고로 샜다 — 하네스가 그 차이를 본다', queue_files() == [] and B._daily_rel(TODAY, 'yhpark') in NAS.files)
B.TG_AI_PREFIXES[:] = saved


# ══════════════════════════════════════════════════════════════════════════
# 📥 /배분 — 폰에서 대기 메일 배분 (2026-11-08 5차, docs/ai-expansion-review.md §3-1 ②)
# ══════════════════════════════════════════════════════════════════════════
print('\n[10] /배분 — 앱이 올린 대기 목록을 inline 버튼으로(목록 없음·빈 목록·정상·낡음)')
B.send_telegram_msg = lambda msg, chat_id=None, reply_markup=None: (SENT.append((chat_id, msg, reply_markup)) or {'ok': True})
CALLS = []


def _fake_post(url, **kw):
    CALLS.append((url.rsplit('/', 1)[-1], kw.get('json') or {}))
    return _Resp({'ok': True, 'result': {}})


B.requests.post = _fake_post
PEND = B.TG_AI_PENDING_FILE % 'yhpark'


def pending(items, at=None, counts=None):
    doc = {'key': 'yhpark', 'at': at or datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
           'items': items, 'counts': counts or {'waiting': len(items), 'withCands': len(items), 'unclassified': 2}}
    NAS.put('/ROOT/' + PEND, json.dumps(doc, ensure_ascii=False).encode('utf-8'))


ITEM = {'uid': 'ib_1731000000000_abcde', 'subject': 'Re: STELLAR32 CTR 납품 일정', 'from': 'kim@vendor.com',
        'date': '2026-11-07 09:12', 'task': 'CTR 납품 일정 확인', 'basis': 'AI 중 — 스레드 기록 없음',
        'cands': [{'id': 'fidA', 'name': 'LNW_STELLAR32_32.0.json', 'label': 'STELLAR32 32"'},
                  {'id': 'fidB', 'name': 'LNW_STELLAR43_43.0.json', 'label': 'STELLAR43 43"'}]}
ITEM2 = dict(ITEM, uid='ib_1731000000001_fghij', subject='OBSIDIAN AG 회로 검토',
             cands=[{'id': 'fidC', 'name': 'OBSIDIAN.json', 'label': 'OBSIDIAN'}])

reset()
UPDATES.append(upd(1030, '111', '/배분'))
B._daily_tg_tick()
ok('목록 파일이 없으면 "아직 올리지 않았다"(보고로 안 샌다)', len(SENT) == 1 and '올리지 않았' in SENT[0][1], SENT)
ok('큐·보고 파일 없음', queue_files() == [] and B._daily_rel(TODAY, 'yhpark') not in NAS.files, list(NAS.files))

reset()
pending([], counts={'waiting': 3, 'withCands': 0, 'unclassified': 5})
UPDATES.append(upd(1031, '111', '/대기'))
B._daily_tg_tick()
ok('빈 목록 → "후보가 있는 대기 메일이 없다" + 건수(대기 3·미분류 5)', len(SENT) == 1 and '없습니다' in SENT[0][1] and '대기 3건' in SENT[0][1] and '미분류 5건' in SENT[0][1], SENT)

reset()
pending([ITEM, ITEM2])
UPDATES.append(upd(1032, '111', '/배분'))
B._daily_tg_tick()
ok('메일 2건 → 한 건 한 통 + 꼬리 1통 = 3통', len(SENT) == 3, [m[1][:30] for m in SENT])
kb = SENT[0][2] if SENT else None
ok('첫 통에 inline 버튼: 후보 2 + ⏭ 보류 1', bool(kb) and len(kb['inline_keyboard']) == 3, kb)
ok('callback_data = pl|<uid>|<후보번호> · 보류는 |skip (64바이트 안)',
   bool(kb) and kb['inline_keyboard'][0][0]['callback_data'] == 'pl|ib_1731000000000_abcde|0'
   and kb['inline_keyboard'][1][0]['callback_data'] == 'pl|ib_1731000000000_abcde|1'
   and kb['inline_keyboard'][2][0]['callback_data'] == 'pl|ib_1731000000000_abcde|skip'
   and all(len(r[0]['callback_data'].encode('utf-8')) <= 64 for r in kb['inline_keyboard']), kb)
ok('본문에 제목·발신·근거·후보 라벨', 'STELLAR32 CTR' in SENT[0][1] and 'kim@vendor.com' in SENT[0][1] and '스레드 기록 없음' in SENT[0][1] and 'STELLAR43' in SENT[0][1], SENT[0][1])
ok('꼬리에 "실행은 PC 앱" 과 건수', '실행은 PC 앱' in SENT[2][1] and '2건' in SENT[2][1], SENT[2][1])
ok('보여 주기만 — 큐엔 아무것도 없다', queue_files() == [], queue_files())

reset()
pending([ITEM, ITEM2, dict(ITEM, uid='ib_3_aaaaa'), dict(ITEM, uid='ib_4_bbbbb'), dict(ITEM, uid='ib_5_ccccc'), dict(ITEM, uid='ib_6_ddddd'), dict(ITEM, uid='ib_7_eeeee')])
UPDATES.append(upd(1034, '111', '/배분'))
B._daily_tg_tick()
ok('7건이면 TG_DIST.max(%d)건만 + "다시 보내면 다음 것"' % B.TG_DIST['max'], len(SENT) == B.TG_DIST['max'] + 1 and '다시 보내면' in SENT[-1][1], [m[1][:30] for m in SENT])

old_at = (datetime.now(timezone.utc) - timedelta(minutes=40)).isoformat().replace('+00:00', 'Z')
reset()
pending([ITEM], at=old_at)
UPDATES.append(upd(1033, '111', '/배분'))
B._daily_tg_tick()
ok('낡은 목록(40분) → 머리에 "꺼져 있는 것 같다" 경고, 그래도 보여 준다', len(SENT) == 3 and '분 전 것' in SENT[0][1] and SENT[1][2] is not None, [m[1][:40] for m in SENT])

reset()
pending([dict(ITEM, cands=[]), ITEM2])
UPDATES.append(upd(1035, '111', '/배분'))
B._daily_tg_tick()
ok('후보 없는 항목은 건너뛴다(1건만 버튼)', len(SENT) == 2 and 'OBSIDIAN' in SENT[0][1] and SENT[0][2] is not None, [m[1][:40] for m in SENT])

print('\n[11] 버튼 답(callback_query) → 접수 파일(action place) + 버튼 떼기 + 접수 답 — 진짜 입구로')


def cb(uid, chat, data, mid=77):
    return {'update_id': uid, 'callback_query': {'id': 'cq%d' % uid, 'from': {'id': int(chat)}, 'data': data,
            'message': {'message_id': mid, 'chat': {'id': int(chat)}, 'text': '📨 1/2 Re: STELLAR32 <x>'}}}


reset()
pending([ITEM, ITEM2])
del CALLS[:]
UPDATES.append(cb(1040, '111', 'pl|ib_1731000000000_abcde|1'))
res = B._daily_tg_tick()
qf = queue_files()
ok('접수 파일 <key>__cb<uid>.json 하나', qf == [Q_DIR + '/yhpark__cb1040.json'], qf)
doc = json.loads(NAS.files[qf[0]]) if qf else {}
ok('action place · 그 uid · 고른 후보(id fidB · idx 1 · 라벨)', doc.get('action') == 'place' and doc.get('uid') == 'ib_1731000000000_abcde'
   and (doc.get('cand') or {}).get('id') == 'fidB' and doc['cand'].get('idx') == 1 and 'STELLAR43' in doc['cand'].get('label', ''), doc)
ok('chatId·key·reply·text 가 실려 있다(앱의 빈 요청 검사를 지난다)', doc.get('chatId') == '111' and doc.get('key') == 'yhpark' and doc.get('reply') == 'telegram' and doc.get('text'), doc)
methods = [c[0] for c in CALLS]
ok('answerCallbackQuery 1회 + editMessageText 1회', methods.count('answerCallbackQuery') == 1 and methods.count('editMessageText') == 1, methods)
edit = [c[1] for c in CALLS if c[0] == 'editMessageText'][0] if 'editMessageText' in methods else {}
ok('고친 메시지: 원문(escape)+"선택: STELLAR43", 버튼은 빈 배열(두 번 누르기 방지)',
   '선택: STELLAR43' in edit.get('text', '') and '&lt;x&gt;' in edit.get('text', '') and edit.get('reply_markup', {}).get('inline_keyboard') == [] and edit.get('message_id') == 77, edit)
ok('앱 신호 없음 → "꺼져 있는 것 같다" 덧붙임', '꺼져 있는' in edit.get('text', ''), edit.get('text'))
ok('offset 올라감 · handled 1 · 보고 파일 없음', state().get('offset') == 1041 and res.get('handled') == 1 and B._daily_rel(TODAY, 'yhpark') not in NAS.files, (state(), res))

reset()
pending([ITEM])
del CALLS[:]
UPDATES.append(cb(1041, '111', 'pl|ib_1731000000000_abcde|skip'))
B._daily_tg_tick()
ok('⏭ 보류 → 접수 파일 없음 · 답 + 버튼만 뗀다', queue_files() == [] and [c[0] for c in CALLS] == ['answerCallbackQuery', 'editMessageText'] and '보류' in CALLS[1][1].get('text', ''), (queue_files(), CALLS))

reset()
pending([ITEM])
del CALLS[:]
UPDATES.append(cb(1042, '111', 'pl|ib_0000_zzzzz|0'))
B._daily_tg_tick()
ok('목록에 없는 uid → 접수 안 함 + "목록에 없음" 답 + 버튼 뗀다', queue_files() == [] and any('목록에 없' in (c[1].get('text') or '') for c in CALLS if c[0] == 'answerCallbackQuery') and 'editMessageText' in [c[0] for c in CALLS], CALLS)

reset()
pending([ITEM])
del CALLS[:]
UPDATES.append(cb(1043, '111', 'pl|ib_1731000000000_abcde|7'))
B._daily_tg_tick()
ok('후보 번호가 범위 밖 → 접수 안 함', queue_files() == [], queue_files())

reset()
pending([ITEM])
del CALLS[:]
UPDATES.append(cb(1044, '999', 'pl|ib_1731000000000_abcde|0'))
B._daily_tg_tick()
ok('모르는 chat → 접수 안 함, 등록되지 않은 사용자 답, offset 은 올림', queue_files() == [] and state().get('offset') == 1045 and any('등록되지' in (c[1].get('text') or '') for c in CALLS), (queue_files(), state(), CALLS))

reset()
pending([ITEM])
del CALLS[:]
UPDATES.append(cb(1046, '111', 'xx|whatever'))
B._daily_tg_tick()
ok('모르는 버튼 자료 → "모르는 버튼" 답, 접수 없음', queue_files() == [] and any('모르는 버튼' in (c[1].get('text') or '') for c in CALLS), CALLS)

reset()
pending([ITEM])
del CALLS[:]
NAS.fail_write = True
UPDATES.append(cb(1047, '111', 'pl|ib_1731000000000_abcde|0'))
B._daily_tg_tick()
ok('접수 쓰기 실패 → offset 그대로(다음 틱에 같은 답을 다시 받는다) · 버튼은 안 뗀다', state().get('offset', 0) == 0 and 'editMessageText' not in [c[0] for c in CALLS], (state(), CALLS))
NAS.fail_write = False
del CALLS[:]
B._daily_tg_tick()
ok('다음 틱에 접수됨', queue_files() == [Q_DIR + '/yhpark__cb1047.json'] and state().get('offset') == 1048, (queue_files(), state()))

reset()
pending([ITEM])
NAS.put('/ROOT/' + Q_DIR + '/online__yhpark.json', b'{}')
del CALLS[:]
UPDATES.append(cb(1048, '111', 'pl|ib_1731000000000_abcde|0'))
B._daily_tg_tick()
edit = [c[1] for c in CALLS if c[0] == 'editMessageText'][0]
ok('앱이 살아 있으면 "꺼져 있다" 를 안 붙인다', '선택: STELLAR32' in edit.get('text', '') and '꺼져 있는' not in edit.get('text', ''), edit.get('text'))

print('\n[12] 아침 브리핑에 보관함 대기 건수 — 목록이 하루 안일 때만')
reset()
pending([ITEM], counts={'waiting': 4, 'withCands': 1, 'unclassified': 0})
txt = B._brief_text_for({'key': 'yhpark', 'name': '박용훈'}, [], datetime.now(B.KST).date(), [], False)
ok('"보관함 대기 4건 — 후보 있는 1건은 /배분"', bool(txt) and '보관함 대기 4건' in txt and '후보 있는 1건' in txt and '/배분' in txt, txt)
reset()
pending([ITEM], at=(datetime.now(timezone.utc) - timedelta(days=2)).isoformat().replace('+00:00', 'Z'))
txt = B._brief_text_for({'key': 'yhpark', 'name': '박용훈'}, [], datetime.now(B.KST).date(), [], False)
ok('이틀 전 목록은 안 싣는다', bool(txt) and '보관함 대기' not in txt, txt)
reset()
txt = B._brief_text_for({'key': 'yhpark', 'name': '박용훈'}, [], datetime.now(B.KST).date(), [], False)
ok('목록 없음 → 줄 없음, 브리핑은 그대로(보고 초안 안내는 꼬리에)', bool(txt) and '보관함 대기' not in txt and '아침 브리핑' in txt and '보고 초안' in txt, txt)
NAS.fail_list = True
NAS.files.clear()
txt = B._brief_text_for({'key': 'yhpark', 'name': '박용훈'}, [], datetime.now(B.KST).date(), [], False)
ok('NAS 가 틀어져도 브리핑을 막지 않는다', bool(txt) and '아침 브리핑' in txt, txt)
NAS.fail_list = False

print('\n[13] 도움말에 /배분 · 보고 초안 안내')
reset()
UPDATES.append(upd(1050, '111', '/help'))
B._daily_tg_tick()
ok('/help 에 /배분 과 "오늘 보고 초안"', len(SENT) == 1 and '/배분' in SENT[0][1] and '오늘 보고 초안' in SENT[0][1], SENT)

print('\n[14] 돌연변이 — /배분 어휘를 비우면 보고 글로 샌다(연결이 끊기면 하네스가 본다)')
reset()
pending([ITEM])
saved = list(B.TG_DIST_WORDS)
B.TG_DIST_WORDS[:] = []
UPDATES.append(upd(1051, '111', '/배분'))
B._daily_tg_tick()
ok('(돌연변이) 버튼 메시지 0 · 보고 파일이 생겼다', not any(m[2] for m in SENT) and B._daily_rel(TODAY, 'yhpark') in NAS.files, ([m[1][:30] for m in SENT], list(NAS.files)))
B.TG_DIST_WORDS[:] = saved

print('\n[15] 🔁 AI 문답 모드 — "텔레그램 채팅창을 AI 문답창처럼"(2026-11-09 신고 대응)')
#  실측 사고: 접두어 없이 보낸 "프로젝트 요약 부탁해" 가 오늘 보고의 **업무 이름**으로
#  저장돼 있었다(조용한 실패). 이제 모드로 가른다.
reset()
UPDATES.append(upd(1060, '111', '프로젝트 요약 부탁해'))
B._daily_tg_tick()
ok('(기본) 접두어 없는 글은 여전히 보고로 — 글을 잃지 않는다', B._daily_rel(TODAY, 'yhpark') in NAS.files and not queue_files(), (queue_files(), list(NAS.files)))
ok('질문처럼 보이면 "질문이었나요?" 안내가 따라온다', any('질문이었나요' in m[1] for m in SENT), [m[1][:40] for m in SENT])

reset()
UPDATES.append(upd(1061, '111', '/문답'))
B._daily_tg_tick()
ok('/문답 → 모드 전환 답장, 큐·보고 둘 다 안 건드림', len(SENT) == 1 and 'AI 문답 모드' in SENT[0][1]
   and not queue_files() and B._daily_rel(TODAY, 'yhpark') not in NAS.files, (SENT, queue_files()))
ok('모드가 상태 파일에 남는다', (state().get('tgMode') or {}).get('yhpark', {}).get('mode') == 'ai', state())
del UPDATES[:]
del SENT[:]
UPDATES.append(upd(1062, '111', '프로젝트 요약 부탁해'))
B._daily_tg_tick()
ok('그 뒤 접두어 없는 글은 **질문**으로 간다', queue_files() == [Q_DIR + '/yhpark__tg1062.json'], queue_files())
ok('질문 본문은 글 그대로', json.loads(NAS.files[Q_DIR + '/yhpark__tg1062.json']).get('text') == '프로젝트 요약 부탁해')
ok('보고 파일은 안 생겼다', B._daily_rel(TODAY, 'yhpark') not in NAS.files, list(NAS.files))

del UPDATES[:]
del SENT[:]
UPDATES.append(upd(1063, '111', '한일: 원자재 점검'))       # 문답 모드라도 보고 서식은 보고
B._daily_tg_tick()
ok('문답 모드라도 `한일:` 은 보고로 저장된다', B._daily_rel(TODAY, 'yhpark') in NAS.files
   and not [k for k in queue_files() if 'tg1063' in k], (queue_files(), list(NAS.files)))
ok('보고를 적으면 모드도 보고로 돌아온다', B._tg_mode_get(state(), 'yhpark') == 'report', state())

reset()
UPDATES.append(upd(1064, '111', '/문답'))
B._daily_tg_tick()
del UPDATES[:]
UPDATES.append(upd(1065, '111', '휴가'))
B._daily_tg_tick()
ok('문답 모드라도 `휴가` 한 단어는 그 날 종류로', json.loads(NAS.files[B._daily_rel(TODAY, 'yhpark')]).get('dayType') == 'leave',
   NAS.files.get(B._daily_rel(TODAY, 'yhpark')))

reset({'tgMode': {'yhpark': {'mode': 'ai',
                             'at': (datetime.now(B.KST) - timedelta(minutes=B.TG_MODE['ttlMin'] + 5)).isoformat()}}})
UPDATES.append(upd(1066, '111', '회의 참석'))
B._daily_tg_tick()
ok('모드는 스스로 식는다(ttl 지나면 보고로)', B._daily_rel(TODAY, 'yhpark') in NAS.files and not queue_files(), (queue_files(), list(NAS.files)))

reset({'tgMode': {'yhpark': {'mode': 'ai', 'at': '엉터리'}}})
UPDATES.append(upd(1067, '111', '회의 참석'))
B._daily_tg_tick()
ok('시각을 모르면 안전한 쪽(보고)', B._daily_rel(TODAY, 'yhpark') in NAS.files and not queue_files(), (queue_files(), list(NAS.files)))

reset()
UPDATES.append(upd(1068, '111', '/ai 재고 확인'))
B._daily_tg_tick()
ok('/ai 한 번이 모드를 켠다 + 접수 답장에 그 사실을 적는다',
   B._tg_mode_get(state(), 'yhpark') == 'ai' and any('접두어 없이' in m[1] for m in SENT), (state(), [m[1][:60] for m in SENT]))
del UPDATES[:]
del SENT[:]
UPDATES.append(upd(1069, '111', '/보고'))
B._daily_tg_tick()
ok('/보고 → 보고 모드로', len(SENT) == 1 and '일일보고 모드' in SENT[0][1] and B._tg_mode_get(state(), 'yhpark') == 'report', (SENT, state()))

print('\n[16] 돌연변이 — 모드 어휘를 비우면 "/문답" 이 보고 글로 샌다')
reset()
saved_m = dict(B.TG_MODE_WORDS)
B.TG_MODE_WORDS.clear()
UPDATES.append(upd(1070, '111', '/문답'))
B._daily_tg_tick()
ok('(돌연변이) 모드 안 바뀌고 보고 파일이 생겼다', B._daily_rel(TODAY, 'yhpark') in NAS.files, list(NAS.files))
B.TG_MODE_WORDS.update(saved_m)

try:
    os.remove(STATE)
except OSError:
    pass
print('\n결과: %d/%d 통과' % (PASS[0], PASS[0] + FAIL[0]))
sys.exit(1 if FAIL[0] else 0)
