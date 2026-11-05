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
        v = self.files[rel]
        return v if isinstance(v, bytes) else v.encode('utf-8')

    def put(self, path, data):
        if self.fail_write:
            raise RuntimeError('쓰기 실패')
        # 📎 JSON 은 지금처럼 글자로, 사진 바이트는 **바이트 그대로** 둔다 —
        #    여기서 decode 를 강제하면 진짜 이진이 하네스에서만 터진다.
        rel = path.replace('/ROOT/', '')
        try:
            self.files[rel] = data.decode('utf-8')
        except Exception:
            self.files[rel] = data
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


class _Bin(object):
    """파일 내려받기 응답 — `.content`·`.status_code` 만 쓴다."""
    def __init__(self, content, status=200):
        self.content = content
        self.status_code = status


GETFILE_CALLS = []
DOWNLOAD_CALLS = []
DOWNLOAD_BYTES = [b'']
DOWNLOAD_STATUS = [200]
GETFILE_REPLY = [{'ok': True, 'result': {'file_path': 'photos/f_1.jpg'}}]


def _fake_get(url, **kw):
    """텔레그램은 **주소가 세 가지**다 — 한 덯으로 답하면 엉뚱한 것을 재는다."""
    if '/getUpdates' in url:
        return _Resp({'ok': True, 'result': list(UPDATES)})
    if '/getFile' in url:
        GETFILE_CALLS.append(kw.get('params') or {})
        return _Resp(GETFILE_REPLY[0])
    if '/file/bot' in url:
        DOWNLOAD_CALLS.append(url)
        return _Bin(DOWNLOAD_BYTES[0], DOWNLOAD_STATUS[0])
    return _Resp({'ok': False, 'description': '하네스가 모를 주소: ' + url})


B.requests.get = _fake_get

STATE = os.path.join(os.path.dirname(B.DAILY_TG_STATE), '_test_daily_state.json')
B.DAILY_TG_STATE = STATE


def reset(roster=None, nonwork=None, state=None, primed=True):
    """primed=True(기본) — **이미 한 번 켜 본 상태**를 재현한다.
    첫 틱은 쌓인 것을 보고로 넣지 않고 넘기므로(2026-11-05 가드),
    수신 동작을 보려면 그 단계를 지난 상태여야 한다. 가드 자체는 primed=False 로 시험한다."""
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
    st = dict(state or {})
    if primed:
        st['primed'] = True
    if st:
        with open(STATE, 'w', encoding='utf-8') as f:
            json.dump(st, f)


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

print('\n■ 텔레그램 수신 — 처음 켤 때 쌓인 것 (2026-11-05 가드)')
# ⚠️ 봇은 알람에도 쓰여서 사람들이 답장을 보낸 적이 있다. 텔레그램은 안 읽은 업데이트를
#    ~24시간 들고 있으므로, 가드가 없으면 **옛 잡담이 오늘 보고에 들어간다.**
reset(ROSTER, FRESH, primed=False)
UPDATES.extend([
    {'update_id': 5, 'message': {'chat': {'id': 111}, 'text': '어제 하던 잡담'}},
    {'update_id': 6, 'message': {'chat': {'id': 111}, 'text': '이것도 옛것'}},
])
r = B._daily_tg_tick()
ok('첫 틱은 쌓인 것을 보고로 넣지 않는다',
   r.get('skippedBacklog') == 2 and B._daily_rel(TODAY, ME) not in NAS.files, r)
ok('첫 틱은 되읽기 메시지도 안 보낸다', len(SENT) == 0, SENT)
ok('첫 틱이 offset 을 쌓인 것 뒤로 넘긴다', B._daily_state().get('offset') == 7, B._daily_state())
ok('첫 틱 뒤에는 primed 로 적힌다', B._daily_state().get('primed') is True, B._daily_state())
# 같은 상태에서 두 번째 틱은 **정상으로 받는다**
del UPDATES[:]
UPDATES.extend([{'update_id': 7, 'message': {'chat': {'id': 111}, 'text': '이제부터 받는다'}}])
r2 = B._daily_tg_tick()
ok('두 번째 틱부터는 정상 수신', r2.get('handled') == 1 and B._daily_rel(TODAY, ME) in NAS.files, r2)

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

print('\n■ 📎 텔레그램 사진·문서 첨부')

PNG = b'\x89PNG\r\n\x1a\n' + bytes(range(200)) * 3          # utf-8 로 안 읽히는 진짜 이진


def tg_reset(photo_size=4096, status=200, blob=None, getfile=None):
    """첨부 한 건이 오는 상태를 꾸민다. 돌려주는 건 그 update 하나."""
    GETFILE_CALLS[:] = []
    DOWNLOAD_CALLS[:] = []
    DOWNLOAD_BYTES[0] = blob if blob is not None else PNG
    DOWNLOAD_STATUS[0] = status
    GETFILE_REPLY[0] = getfile if getfile is not None else {'ok': True, 'result': {'file_path': 'photos/f_1.jpg'}}
    return photo_size


# ── 이름 눕히기 — 프런트와 **같은 규칙**이어야 한다 ─────────────────────────
ok('경로 구분자를 지운다', B._daily_safe_name('a/b' + chr(92) + 'c.jpg') == 'a_b_c.jpg',
   B._daily_safe_name('a/b' + chr(92) + 'c.jpg'))
_bad = B._daily_safe_name('..' + chr(92) + 'pw.txt')
# ↑ 구분자를 먼저 밑줄로 바꾸니 `.._pw.txt` → 앞 점을 떼면 `_pw.txt` — 파이썬·JS 나란히 같다.
ok('경로 탈출도 숨은 파일도 나오지 않는다',
   '/' not in _bad and chr(92) not in _bad and not _bad.startswith('.') and _bad == '_pw.txt', _bad)
ok('금지 문자를 밑줄로', B._daily_safe_name('a:b*c?.pdf') == 'a_b_c_.pdf', B._daily_safe_name('a:b*c?.pdf'))
ok('빈 이름은 file', B._daily_safe_name('') == 'file')
ok('긴 이름도 확장자를 지킨다', B._daily_safe_name('x' * 120 + '.xlsx').endswith('.xlsx')
   and len(B._daily_safe_name('x' * 120 + '.xlsx')) <= 90)
ok('한글 이름은 그대로', B._daily_safe_name('현장 사진.JPG') == '현장 사진.JPG')

rel = B._daily_files_rel('2026-11-05', 'yhpark', '현장.jpg')
ok('첨부 폴더는 글자로 시작한다(files)', '/files/' in rel and rel.split('/')[2] == '2026_11', rel)
ok('첨부 이름에 날짜·계정이 들어간다', rel.endswith('2026-11-05__yhpark__현장.jpg'), rel)

# ── 어느 것을 받을지 고르기 ────────────────────────────────────────────────
att = B._tg_attachment({'photo': [{'file_id': 'small', 'file_size': 100, 'width': 90},
                                  {'file_id': 'big', 'file_size': 9000, 'width': 1280}]})
ok('사진은 **가장 큰 것**을 집는다', att and att['file_id'] == 'big', att)
att_d = B._tg_attachment({'document': {'file_id': 'd1', 'file_name': '사양서.pdf', 'file_size': 10}})
ok('문서는 파일 이름을 그대로 쓴다', att_d and att_d['name'] == '사양서.pdf', att_d)
att_v = B._tg_attachment({'voice': {'file_id': 'v1', 'file_size': 10}})
ok('이름 없는 음성에도 확장자를 붙인다', att_v and att_v['name'].endswith('.ogg'), att_v)
ok('글만 온 메시지는 첨부가 없다', B._tg_attachment({'text': '안녕'}) is None)

# ── 사진 한 장 + 설명 → 파일은 NAS, 설명은 업무 ────────────────────────────
sz = tg_reset()
reset(ROSTER, FRESH)
UPDATES[:] = [{'update_id': 11, 'message': {
    'chat': {'id': '111'}, 'caption': '현장 치수 확인',
    'photo': [{'file_id': 'ph1', 'file_size': sz, 'width': 1280}]}}]
r = B._daily_tg_tick(force=True)
doc = json.loads(NAS.files.get(B._daily_rel(TODAY, ME), '{}'))
saved = [k for k in NAS.files if '/files/' in k]
ok('사진 한 장을 받았다', r.get('handled') == 1, r)
ok('바이트가 NAS 에 들어갔다', len(saved) == 1, saved)
ok('바이트가 **그대로**다(글자로 바뀌지 않았다)',
   saved and NAS.files[saved[0]] == PNG, type(NAS.files[saved[0]]) if saved else None)
ok('보고에 참조가 남았다', len(doc.get('files') or []) == 1 and doc['files'][0]['via'] == 'telegram',
   doc.get('files'))
ok('참조의 rel 이 그 파일을 가리킨다', saved and doc['files'][0]['rel'] == saved[0], doc.get('files'))
ok('크기는 받은 바이트 수다', doc['files'][0]['size'] == len(PNG), doc['files'][0]['size'])
ok('caption 은 업무로 들어갔다',
   any(i['name'] == '현장 치수 확인' for i in (doc.get('items') or [])), doc.get('items'))
ok('되읽기 답장에 📎 가 있다', SENT and '📎' in SENT[-1][1], SENT[-1][1] if SENT else None)
ok('getFile 을 한 번만 불렀다', len(GETFILE_CALLS) == 1, GETFILE_CALLS)

# ── 설명 없는 사진 — 글은 손대지 않는다 ────────────────────────────────────
tg_reset()
reset(ROSTER, FRESH)
NAS.files[B._daily_rel(TODAY, ME)] = json.dumps(
    {'date': TODAY, 'key': ME, 'items': [{'name': '기존 업무'}], 'next': '', 'issue': '', 'rev': 3},
    ensure_ascii=False)
UPDATES[:] = [{'update_id': 21, 'message': {
    'chat': {'id': '111'}, 'photo': [{'file_id': 'ph2', 'file_size': 10, 'width': 800}]}}]
B._daily_tg_tick(force=True)
doc = json.loads(NAS.files[B._daily_rel(TODAY, ME)])
ok('사진만 와도 기존 업무는 그대로', [i['name'] for i in doc['items']] == ['기존 업무'], doc['items'])
ok('사진만 와도 첨부는 담긴다', len(doc.get('files') or []) == 1, doc.get('files'))
ok('rev 가 올라갔다', doc['rev'] == 4, doc['rev'])

# ── 같은 이름이 두 번 — 덮지 않는다 ───────────────────────────────────────
tg_reset()
reset(ROSTER, FRESH)
NAS.files[B._daily_rel(TODAY, ME)] = json.dumps(
    {'date': TODAY, 'key': ME, 'items': [], 'next': '', 'issue': '', 'rev': 1,
     'files': [{'name': '도면.pdf', 'safe': '도면.pdf', 'rel': 'x', 'size': 1}]}, ensure_ascii=False)
UPDATES[:] = [{'update_id': 31, 'message': {
    'chat': {'id': '111'}, 'document': {'file_id': 'd2', 'file_name': '도면.pdf', 'file_size': 10}}}]
B._daily_tg_tick(force=True)
doc = json.loads(NAS.files[B._daily_rel(TODAY, ME)])
ok('같은 이름은 번호가 붙는다(먼저 올린 게 안 덮인다)',
   len(doc['files']) == 2 and doc['files'][1]['safe'] == '도면-2.pdf', doc.get('files'))

# ── 🚨 큐를 막지 않는다 — 20MB 넘는 사진 한 장이 뒤를 다 멈추면 안 된다 ────
tg_reset()
reset(ROSTER, FRESH)
UPDATES[:] = [
    {'update_id': 41, 'message': {'chat': {'id': '111'},
                                  'photo': [{'file_id': 'huge', 'file_size': 99 * 1048576, 'width': 4000}]}},
    {'update_id': 42, 'message': {'chat': {'id': '111'}, 'text': '뒤에 온 보고'}},
]
r = B._daily_tg_tick(force=True)
doc = json.loads(NAS.files.get(B._daily_rel(TODAY, ME), '{}'))
st = B._daily_state()
ok('너무 큰 사진은 내려받으러 가지도 않는다', len(DOWNLOAD_CALLS) == 0 and len(GETFILE_CALLS) == 0,
   (GETFILE_CALLS, DOWNLOAD_CALLS))
ok('뒤에 온 보고는 그대로 처리된다',
   any(i['name'] == '뒤에 온 보고' for i in (doc.get('items') or [])), doc.get('items'))
ok('오프셋이 넘어갔다(다음 틱에 같은 걸 또 받지 않는다)', st.get('offset') == 43, st)
ok('왜 안 됐는지 사람에게 말한다',
   any('첨부' in m and 'MB' in m for _, m in SENT), [m for _, m in SENT])

# ── 내려받기가 실패하면 — 글은 살리고 사유를 말한다 ────────────────────────
tg_reset(status=502, blob=b'')
reset(ROSTER, FRESH)
UPDATES[:] = [{'update_id': 51, 'message': {
    'chat': {'id': '111'}, 'caption': '사진 첨부 시도',
    'photo': [{'file_id': 'ph3', 'file_size': 10, 'width': 800}]}}]
B._daily_tg_tick(force=True)
doc = json.loads(NAS.files.get(B._daily_rel(TODAY, ME), '{}'))
ok('내려받기 실패에도 글은 기록된다',
   any(i['name'] == '사진 첨부 시도' for i in (doc.get('items') or [])), doc.get('items'))
ok('첨부는 담기지 않는다', not (doc.get('files') or []), doc.get('files'))
ok('바이트도 안 남는다', not [k for k in NAS.files if '/files/' in k])
ok('실패를 알린다', any('첨부' in m for _, m in SENT), [m for _, m in SENT])

# ── 명단에 없는 사람의 사진은 받지 않는다 ─────────────────────────────────
tg_reset()
reset(ROSTER, FRESH)
UPDATES[:] = [{'update_id': 61, 'message': {
    'chat': {'id': '999'}, 'photo': [{'file_id': 'ph4', 'file_size': 10, 'width': 800}]}}]
r = B._daily_tg_tick(force=True)
ok('등록되지 않은 chat 은 무시한다', r.get('ignored') == 1 and r.get('handled') == 0, r)
ok('내려받지도 않는다', len(GETFILE_CALLS) == 0 and len(DOWNLOAD_CALLS) == 0)
ok('파일도 안 생긴다', not [k for k in NAS.files if '/files/' in k])

# ── /다시 는 글만 지운다 ──────────────────────────────────────────────────
tg_reset()
reset(ROSTER, FRESH)
NAS.files[B._daily_rel(TODAY, ME)] = json.dumps(
    {'date': TODAY, 'key': ME, 'items': [{'name': 'A'}], 'next': 'B', 'issue': 'C', 'rev': 2,
     'files': [{'name': '사진.jpg', 'safe': '사진.jpg', 'rel': 'r', 'size': 9}]}, ensure_ascii=False)
UPDATES[:] = [{'update_id': 71, 'message': {'chat': {'id': '111'}, 'text': '/다시'}}]
B._daily_tg_tick(force=True)
doc = json.loads(NAS.files[B._daily_rel(TODAY, ME)])
ok('/다시 가 글을 지운다', not doc['items'] and not doc['next'] and not doc['issue'], doc)
ok('/다시 가 사진은 **안** 지운다(되돌릴 수 없다)', len(doc.get('files') or []) == 1, doc.get('files'))


print('\n■ 🖥️ /nas/app/open-native — 연결 프로그램으로 열기')

# 경계 가짜: UNC 변환 · 파일 존재 · os.startfile
STARTED = []
ISFILE = [True]
UNC = ['//KPMNAS/share/app']


def _fake_unc(path):
    return (UNC[0] + str(path).replace('/ROOT', '')) if UNC[0] else ''


def _fake_abs(rel, team=None):
    # 진짜 `nas_dsm.abs_path` 는 `_norm_rel` 로 상위 참조를 **거부한다**(ValueError).
    # 쓰기 라우트들이 이미 그 가드에 기대고 있으므로 여기서도 같은 모양으로 둔다.
    if '..' in str(rel).split('/'):
        raise ValueError('상위 폴더 참조(..)는 허용하지 않습니다')
    return '/ROOT/' + str(rel)


NAS.unc_of = _fake_unc
NAS.abs_path = _fake_abs
_real_isfile = B.os.path.isfile
_real_startfile = getattr(B.os, 'startfile', None)
B.os.path.isfile = lambda p: ISFILE[0]
B.os.startfile = lambda p: STARTED.append(p)

c2 = B.app.test_client()
REL = 'App_Config/DailyReport/2026_11/files/2026-11-05__yhpark__photo.jpg'

del STARTED[:]
r = c2.post('/nas/app/open-native', json={'rel': REL})
ok('정상이면 200', r.status_code == 200 and r.get_json().get('ok') is True, r.get_json())
ok('그 UNC 경로를 연다', STARTED == ['//KPMNAS/share/app/' + REL], STARTED)

del STARTED[:]
r = c2.post('/nas/app/open-native', json={})
ok('rel 이 없으면 400', r.status_code == 400, r.status_code)
ok('그때 아무것도 실행하지 않는다', not STARTED, STARTED)

r = c2.post('/nas/app/open-native', json={'rel': '../../Windows/System32/calc.exe'})
ok('상위 폴더 참조는 400 (아무 파일이나 실행되면 안 된다)', r.status_code == 400, r.get_json())
ok('그때도 아무것도 실행하지 않는다', not STARTED, STARTED)

r = c2.post('/nas/app/open-native', json={'rel': '/etc/passwd'})
ok('절대경로도 400', r.status_code == 400, r.get_json())

ISFILE[0] = False
r = c2.post('/nas/app/open-native', json={'rel': REL})
ok('공유에서 안 보이면 404 (조용히 성공하지 않는다)', r.status_code == 404, r.get_json())
ok('없는 파일을 실행하지 않는다', not STARTED, STARTED)
ISFILE[0] = True

UNC[0] = ''
r = c2.post('/nas/app/open-native', json={'rel': REL})
ok('NAS 설정이 없으면 400', r.status_code == 400, r.get_json())
UNC[0] = '//KPMNAS/share/app'

B.os.path.isfile = _real_isfile
if _real_startfile is not None:
    B.os.startfile = _real_startfile


try:
    os.remove(STATE)
except OSError:
    pass

print('\n%s %d/%d 통과' % ('OK' if FAIL[0] == 0 else 'FAIL', PASS[0], PASS[0] + FAIL[0]))
print('※ 실제 텔레그램 발송·실제 NAS 쓰기는 하지 않았다 — 경계를 가짜로 뒀다.')
sys.exit(1 if FAIL[0] else 0)
