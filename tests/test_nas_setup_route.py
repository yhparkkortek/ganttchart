# -*- coding: utf-8 -*-
"""🚀 /nas/setup — 전환 5단계를 **코드가** 순서대로 밟는지 검증한다. (2026-11-04)

왜 — 전환이 사람 손으로 5단계였고, 하나만 빠뜨리면 "🗄️ 는 뜨는데 프로젝트가 안 열린다"가
됐다(2026-11-04 사고 전부가 이 모양). 그 순서를 사람이 아니라 라우트가 지키게 바꿨으니,
**어떤 단계가 어떤 순서로 돌고 실패하면 어디서 멈추는지**를 여기서 못 박는다.

가짜는 **경계에만** — `_nas()` 가 돌려주는 모듈(nas_dsm)만 가짜로 바꾼다. 라우트의
판정·순서·단계기록·문서저장소 쓰기는 진짜 코드가 돈다. NAS·계정·네트워크 불필요.

    python tests/test_nas_setup_route.py
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


class FakeNas(object):
    """경계 스텁. ⚠️ 호출 순서로 분기하지 않는다 — 무엇이 불렸는지만 적는다."""

    APP_FOLDER_NAMES = ['KORTEK_PM']

    def load_defaults(self):
        return {}

    def __init__(self, login_ok=True, hits=None, truncated=False, raise_on=None):
        self.calls = []
        self.login_ok = login_ok
        self.hits = hits if hits is not None else ['/SHARE/sub/KORTEK_PM']
        self.truncated = truncated
        self.raise_on = raise_on or set()

    def _rec(self, name, **kw):
        self.calls.append(name)
        if name in self.raise_on:
            raise RuntimeError('일부러 실패: ' + name)

    def save_config(self, host, port, https, user, pw):
        self._rec('save_config')
        self.saved = {'host': host, 'port': port, 'https': https, 'user': user, 'pw': bool(pw)}
        return self.saved

    def login_once(self, otp=None):
        self._rec('login_once')
        if self.login_ok:
            return {'ok': True, 'result': 'ok', 'message': '로그인했습니다.',
                    'budget': {'max': 3, 'used': 0, 'left': 3}}
        return {'ok': False, 'result': 'bad_credentials', 'code': 400, 'retryable': True,
                'message': '아이디 또는 비밀번호가 올바르지 않습니다 — 2번 더 시도할 수 있습니다.',
                'budget': {'max': 3, 'used': 1, 'left': 2}}

    def find_app_folder(self, names=None):
        self._rec('find_app_folder')
        return {'hits': list(self.hits), 'looked': 31, 'truncated': self.truncated}

    def set_roots(self, root=None, team_root=None):
        self._rec('set_roots')
        self.root = root
        return {'root': root}

    def unc_of(self, path):
        self._rec('unc_of')
        return (chr(92) * 2) + 'nas' + chr(92) + str(path).strip('/').replace('/', chr(92))


def setup(fake, reachable=True, tmpcfg=True):
    bk._nas = lambda: fake
    bk._docstore_probe_root = lambda root: (True, None) if reachable else (False, '못 닿습니다: ' + root)
    if tmpcfg:
        bk.DOCSTORE_CONFIG_FILE = os.path.join(tempfile.mkdtemp(), 'docstore_config.json')
    bk._docstore_load = lambda: {'root': '', 'folders': ['PANEL']}
    # 🔑 [2026-11-05] /nas/setup 이 비밀번호 저장 시 실제 cmdkey 를 불러 이 PC의 Windows
    # 자격 증명 관리자를 건드리게 됐다(_sync_docstore_smb_credential) — 이 하네스는 route의
    # 단계 순서만 보는 자리라 그 경계도 가짜로 바꿔 둔다(안 바꾸면 테스트가 매번 실제
    # 'nas.invalid' 자격증명을 PC에 심는다). 그 함수 자체의 동작은 test_docstore_smb_sync.py 가 본다.
    bk._sync_docstore_smb_credential = lambda host, user, pw: None


def post(body):
    with bk.app.test_client() as c:
        r = c.post('/nas/setup', json=body)
    return json.loads(r.data.decode('utf-8')), r.status_code


BODY = {'host': 'nas.invalid', 'user': 'tester', 'password': 'pw'}

print('\n[1] 성공 — 5단계가 다 돌고 모드 전환에 필요한 값을 돌려준다')
f = FakeNas()
setup(f)
d, code = post(dict(BODY))
steps = [s['step'] for s in d['steps']]
check('ok', d['ok'] is True, d)
check('단계 순서: 계정→로그인→찾기→앱폴더→자료실',
      steps == ['config', 'login', 'find-root', 'root', 'docstore'], steps)
check('모두 성공', all(s['ok'] for s in d['steps']), d['steps'])
check('앱 폴더를 스스로 정했다', d['root'] == '/SHARE/sub/KORTEK_PM', d)
check('자료실 경로를 앱 폴더에서 만들었다',
      d['docRoot'].endswith(chr(92) + bk.NAS_DOCSTORE_FOLDER), d)
check('자료실 폴더 이름은 데이터', bk.NAS_DOCSTORE_FOLDER == '개발자료실', bk.NAS_DOCSTORE_FOLDER)
saved = json.load(open(bk.DOCSTORE_CONFIG_FILE, encoding='utf-8'))
check('문서 저장소 설정 파일에 기록', saved['root'] == d['docRoot'], saved)
check('기존 폴더 목록을 지우지 않았다', saved['folders'] == ['PANEL'], saved)

print('\n[2] 설정 코드로 앱 폴더를 받으면 찾지 않는다(쓸데없이 NAS 를 훑지 않게)')
f = FakeNas()
setup(f)
d, _ = post(dict(BODY, root='/GIVEN/KORTEK_PM', docRoot=chr(92) * 2 + 'nas' + chr(92) + 'doc'))
check('find_app_folder 를 안 불렀다', 'find_app_folder' not in f.calls, f.calls)
check('준 값을 그대로 썼다', d['root'] == '/GIVEN/KORTEK_PM', d)

print('\n[3] 로그인 실패 — 그 자리에서 멈추고 남은 횟수를 알려준다')
f = FakeNas(login_ok=False)
setup(f)
d, _ = post(dict(BODY))
check('ok=False', d['ok'] is False, d)
check('앱 폴더 단계로 넘어가지 않았다', 'set_roots' not in f.calls, f.calls)
check('남은 횟수를 올려보낸다', (d.get('budget') or {}).get('left') == 2, d)

print('\n[4] 앱 폴더를 못 찾으면 후보를 주고 멈춘다 — 짐작해서 아무 데나 쓰지 않는다')
f = FakeNas(hits=[])
setup(f)
d, _ = post(dict(BODY))
check('ok=False', d['ok'] is False, d)
check('rootHits 를 돌려준다', d.get('rootHits') == [], d)
check('set_roots 를 안 불렀다', 'set_roots' not in f.calls, f.calls)

f = FakeNas(hits=['/A/KORTEK_PM', '/B/KORTEK_PM'])
setup(f)
d, _ = post(dict(BODY))
check('2건이면 사람에게 고르게 한다', d['ok'] is False and len(d['rootHits']) == 2, d)

print('\n[5] 덜 봤으면 "못 찾았다"와 구분해 말한다')
f = FakeNas(hits=[], truncated=True)
setup(f)
d, _ = post(dict(BODY))
msg = [s['message'] for s in d['steps'] if s['step'] == 'find-root'][0]
check('상한에 걸린 사실을 밝힌다', '31곳까지만' in msg, msg)

print('\n[6] 자료실만 못 닿으면 — 전환은 성공, 그 사실은 드러낸다')
f = FakeNas()
setup(f, reachable=False)
d, _ = post(dict(BODY))
doc = [s for s in d['steps'] if s['step'] == 'docstore'][0]
check('전체는 성공', d['ok'] is True, d)
check('자료실 단계만 실패로 적힌다', doc['ok'] is False, doc)
check('사유가 보인다', '못 닿습니다' in (doc['message'] or ''), doc)

print('\n[7] 입력이 비면 아무것도 저장하지 않는다')
f = FakeNas()
setup(f)
d, code = post({'host': '', 'user': '', 'password': ''})
check('400', code == 400, code)
check('save_config 를 안 불렀다', 'save_config' not in f.calls, f.calls)

print('\n[8] 포트·HTTPS 기본값 — 안 주면 5001/HTTPS')
f = FakeNas()
setup(f)
d, _ = post(dict(BODY))
check('포트 5001', f.saved['port'] == 5001, f.saved)
check('HTTPS', f.saved['https'] is True, f.saved)
f = FakeNas()
setup(f)
d, _ = post(dict(BODY, https=False))
check('http 면 5000', f.saved['port'] == 5000 and f.saved['https'] is False, f.saved)

print('\n[9] 계정 저장이 실패하면 로그인을 시도하지 않는다(실패를 쌓지 않는다)')
f = FakeNas(raise_on={'save_config'})
setup(f)
d, _ = post(dict(BODY))
check('ok=False', d['ok'] is False, d)
check('login_once 를 안 불렀다', 'login_once' not in f.calls, f.calls)

print('\n[10] 응답에 비밀번호가 실리지 않는다')
f = FakeNas()
setup(f)
d, _ = post(dict(BODY, password='s3cr3t-should-not-appear'))
check('본문 어디에도 없다', 's3cr3t' not in json.dumps(d, ensure_ascii=False), d)

print('\n[11] 팀 공용 기본값(nas_defaults.json) — 팀원은 사번·비밀번호만 넣는다')
#    왜 이 파일이 있나: 이 저장소는 **공개**라 사내 주소를 코드에 박을 수 없다. 그렇다고
#    팀원마다 손으로 치게 하면 오타가 나고, 그 오타는 로그인 실패 → IP 차단으로 이어진다.
f = FakeNas()
setup(f)
bk._nas = lambda: f
f.load_defaults = lambda: {'host': 'nas.default', 'port': 5011, 'https': False,
                           'root': '/DEF/KORTEK_PM', 'docRoot': '\\\\nas.default\\DEF\\doc'}
d, _ = post({'user': 'tester', 'password': 'pw'})          # 주소를 **안 준다**
check('ok', d['ok'] is True, d)
check('주소를 기본값에서 가져왔다', f.saved['host'] == 'nas.default', f.saved)
check('포트·HTTPS 도 기본값', f.saved['port'] == 5011 and f.saved['https'] is False, f.saved)
check('앱 폴더도 기본값 — 찾지 않는다', d['root'] == '/DEF/KORTEK_PM' and 'find_app_folder' not in f.calls,
      (d.get('root'), f.calls))
check('자료실 경로도 기본값', d['docRoot'].endswith('doc'), d)

f = FakeNas()
setup(f)
bk._nas = lambda: f
f.load_defaults = lambda: {'host': 'nas.default'}
d, _ = post({'host': 'typed.by.hand', 'user': 'tester', 'password': 'pw'})
check('사람이 적은 값이 기본값을 이긴다', f.saved['host'] == 'typed.by.hand', f.saved)

print('\n[12] 기본값 파일에 비밀번호를 넣어도 쓰지 않는다')
import nas_dsm as _nd
import json as _json
import tempfile as _tf
_p = os.path.join(_tf.mkdtemp(), 'nas_defaults.json')
open(_p, 'w', encoding='utf-8').write(_json.dumps(
    {'host': 'h', 'port': 1, 'https': True, 'root': '/a/b', 'pw': 'secret', 'password': 'secret2'}))
_old = _nd.NAS_DEFAULTS
_nd.NAS_DEFAULTS = _p
got = _nd.load_defaults()
_nd.NAS_DEFAULTS = _old
check('주소는 읽는다', got.get('host') == 'h' and got.get('root') == '/a/b', got)
check('비밀번호 비슷한 키는 안 돌려준다', 'pw' not in got and 'password' not in got, got)
check('파일이 없으면 빈 dict', _nd.load_defaults() == {} or isinstance(_nd.load_defaults(), dict))

print('\n%d/%d 통과' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    print('실패: ' + ', '.join(FAIL))
    sys.exit(1)
