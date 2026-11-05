# -*- coding: utf-8 -*-
"""🔑 NAS 비밀번호 저장 → 문서 저장소(SMB) 자격증명 동기화 검증 (2026-11-05)

왜 있나 — 사용자 제보: "NAS 비밀번호를 바꿨는데 프로젝트는 열리는데 문서 저장소는 여전히
WinError 1326으로 막힌다 / 한 곳만 바꾸면 전부 따라가야 하는 거 아니냐". 조사 결과 NAS DSM
API 로그인(앱이 비밀번호를 직접 들고 있음, nas_dsm.save_config)과 문서 저장소 SMB 공유
로그인(Windows OS가 캐시하는 자격증명, 앱은 비밀번호를 전혀 모름)은 완전히 다른 인증
체계였다 — 그래서 `_sync_docstore_smb_credential(host, user, pw)`(kortek_backend.py)를
NAS 설정 저장 라우트 두 곳(/nas/config, /nas/setup)에 붙여 `cmdkey`로 Windows 쪽도 같이
갱신한다.

가짜는 **경계에만** — `subprocess.run`(실제 cmdkey 실행, 이 PC의 자격 증명 관리자를 건드리면
안 됨)과 `_nas()`(NAS DSM 모듈)만 가짜로 바꾼다. 호스트 정규화·잠금 해제·라우트 연결은
전부 진짜 코드로 돈다.

    python tests/test_docstore_smb_sync.py
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kortek_backend as bk  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail and not cond else ''))


class FakeRunCalls(object):
    """subprocess.run 경계 — 실제 cmdkey 를 실행하지 않고 인자만 기록한다."""

    def __init__(self, raise_exc=None):
        self.calls = []
        self.raise_exc = raise_exc

    def __call__(self, args, **kw):
        self.calls.append(list(args))
        if self.raise_exc:
            raise self.raise_exc
        class _R(object):
            returncode = 0
        return _R()


def _block(code, msg='이전 실패'):
    bk._DOCSTORE_AUTH_BLOCK['code'] = code
    bk._DOCSTORE_AUTH_BLOCK['message'] = msg


print('\n[1] 기본 동작 — cmdkey 로 호스트/계정/비밀번호를 그대로 넘긴다')
fake = FakeRunCalls()
orig_run = bk.subprocess.run
bk.subprocess.run = fake
try:
    _block(1326)
    bk._sync_docstore_smb_credential('nas.kortek.local', 'kkr034', 's3cret!')
    check('cmdkey 1회 호출', len(fake.calls) == 1, fake.calls)
    args = fake.calls[0] if fake.calls else []
    check('cmdkey 실행파일', args[:1] == ['cmdkey'], args)
    check('/add: 대상이 호스트 그대로', '/add:nas.kortek.local' in args, args)
    check('/user: 계정', '/user:kkr034' in args, args)
    check('/pass: 비밀번호', '/pass:s3cret!' in args, args)
    check('동기화 성공 후 문서저장소 잠금이 풀린다', bk._DOCSTORE_AUTH_BLOCK['code'] == 0,
          bk._DOCSTORE_AUTH_BLOCK)
finally:
    bk.subprocess.run = orig_run

print('\n[2] 호스트에 스킴/포트/경로가 섞여 있어도 순수 호스트명만 cmdkey 대상으로 쓴다')
cases = [
    ('https://nas.kortek.local:5001', 'nas.kortek.local'),
    ('192.168.1.50:5000', '192.168.1.50'),
    ('nas.kortek.local/path', 'nas.kortek.local'),
]
for raw, expected in cases:
    fake = FakeRunCalls()
    bk.subprocess.run = fake
    try:
        bk._sync_docstore_smb_credential(raw, 'user', 'pw')
        args = fake.calls[0] if fake.calls else []
        check(f'"{raw}" → /add:{expected}', ('/add:' + expected) in args, args)
    finally:
        bk.subprocess.run = orig_run

print('\n[3] 인자 중 하나라도 비면 cmdkey 를 아예 안 부른다(실수로 자격증명을 지우지 않게)')
for h, u, p in [('', 'user', 'pw'), ('host', '', 'pw'), ('host', 'user', '')]:
    fake = FakeRunCalls()
    bk.subprocess.run = fake
    try:
        bk._sync_docstore_smb_credential(h, u, p)
        check(f'host={h!r} user={u!r} pw={"*" if p else ""!r} → 호출 안 함', fake.calls == [], fake.calls)
    finally:
        bk.subprocess.run = orig_run

print('\n[4] cmdkey 자체가 실패해도(미설치 환경 등) NAS 로그인 흐름을 막지 않는다')
fake = FakeRunCalls(raise_exc=FileNotFoundError('cmdkey not found'))
bk.subprocess.run = fake
try:
    _block(1326)
    try:
        bk._sync_docstore_smb_credential('host', 'user', 'pw')
        raised = False
    except Exception:
        raised = True
    check('예외를 바깥으로 던지지 않는다(삼킴)', raised is False)
    check('실패했으면 잠금도 그대로 유지(풀지 않음)', bk._DOCSTORE_AUTH_BLOCK['code'] == 1326,
          bk._DOCSTORE_AUTH_BLOCK)
finally:
    bk.subprocess.run = orig_run
    _block(0, '')


# ── 라우트 연결 — 실제 사용자 경로(/nas/config, /nas/setup)에서도 불리는지 ──────────
class FakeNas(object):
    APP_FOLDER_NAMES = ['KORTEK_PM']

    def __init__(self):
        self.calls = []

    def load_defaults(self):
        return {}

    def save_config(self, host, port, https, user, pw):
        self.calls.append('save_config')
        return {'host': host, 'port': port, 'https': https, 'user': user}

    def login_once(self, otp=None):
        self.calls.append('login_once')
        return {'ok': True, 'result': 'ok', 'message': 'ok', 'budget': {'max': 3, 'used': 0, 'left': 3}}

    def find_app_folder(self, names=None):
        self.calls.append('find_app_folder')
        return {'hits': ['/SHARE/KORTEK_PM'], 'looked': 1, 'truncated': False}

    def set_roots(self, root=None, team_root=None):
        self.calls.append('set_roots')
        return {'root': root}

    def unc_of(self, path):
        self.calls.append('unc_of')
        return chr(92) * 2 + 'nas' + chr(92) + str(path).strip('/').replace('/', chr(92))


def setup(fake):
    bk._nas = lambda: fake
    bk._docstore_probe_root = lambda root: (True, None)
    bk.DOCSTORE_CONFIG_FILE = os.path.join(tempfile.mkdtemp(), 'docstore_config.json')
    bk._docstore_load = lambda: {'root': '', 'folders': []}


print('\n[5] /nas/config POST — 비밀번호를 같이 보내면 SMB 동기화도 불린다')
sync_calls = []
orig_sync = bk._sync_docstore_smb_credential
bk._sync_docstore_smb_credential = lambda h, u, p: sync_calls.append((h, u, p))
try:
    setup(FakeNas())
    with bk.app.test_client() as c:
        r = c.post('/nas/config', json={'host': 'nas.kortek.local', 'user': 'kkr034', 'password': 'new-pw'})
    check('응답 ok', json.loads(r.data.decode('utf-8'))['ok'] is True)
    check('SMB 동기화가 1회 불렸다', sync_calls == [('nas.kortek.local', 'kkr034', 'new-pw')], sync_calls)
finally:
    bk._sync_docstore_smb_credential = orig_sync

print('\n[6] /nas/config POST — 비밀번호를 비워 보내면(다른 항목만 수정) 동기화를 안 부른다')
sync_calls = []
bk._sync_docstore_smb_credential = lambda h, u, p: sync_calls.append((h, u, p))
try:
    setup(FakeNas())
    with bk.app.test_client() as c:
        r = c.post('/nas/config', json={'host': 'nas.kortek.local', 'user': 'kkr034', 'password': ''})
    check('응답 ok', json.loads(r.data.decode('utf-8'))['ok'] is True)
    check('비밀번호 안 바꿨으면 SMB 동기화도 안 부른다', sync_calls == [], sync_calls)
finally:
    bk._sync_docstore_smb_credential = orig_sync

print('\n[7] /nas/setup POST — 간편 전환에서도 비밀번호 저장 단계에서 같이 불린다')
sync_calls = []
bk._sync_docstore_smb_credential = lambda h, u, p: sync_calls.append((h, u, p))
try:
    setup(FakeNas())
    with bk.app.test_client() as c:
        r = c.post('/nas/setup', json={'host': 'nas.kortek.local', 'user': 'kkr034', 'password': 'new-pw'})
    d = json.loads(r.data.decode('utf-8'))
    check('응답 ok', d['ok'] is True, d)
    check('SMB 동기화가 1회 불렸다', sync_calls == [('nas.kortek.local', 'kkr034', 'new-pw')], sync_calls)
finally:
    bk._sync_docstore_smb_credential = orig_sync

print(f"\n🔑 문서 저장소 SMB 동기화 검증 결과: {len(PASS)}/{len(PASS) + len(FAIL)} 통과" +
      (' ⚠️' if FAIL else ' ✅'))
if FAIL:
    sys.exit(1)
