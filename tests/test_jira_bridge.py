# -*- coding: utf-8 -*-
"""JIRA(Kortek Issue Tracker) 연동의 잠금·조회·필드 매핑을 검증한다. (2026-11-11)

왜 — 이 서버(Jira 5.2.11, HTTP 전용)는 CAPTCHA/계정잠금 정책을 모른다. "모르면 안 한다"가
지켜지는지(401이나 CAPTCHA 헤더를 받으면 **그 자리에서 잠그고 다시 때리지 않는지**)가
가장 중요한 불변식이고, 그다음은 403(권한)을 계정 잠금과 혼동하지 않는지, 그리고
_shape_issue가 필드를 빠짐없이 옮기는지다.

가짜는 **requests.request 경계 하나뿐**(네트워크 호출 자체) — 잠금 판정·분기·이슈 모양
만들기는 전부 진짜 jira_bridge 코드가 돈다. save_config/delete_config는 **진짜 DPAPI**로
돈다(이 PC가 Windows라 가능 — NAS/SAP/그룹웨어 테스트와 같은 전제).

    python tests/test_jira_bridge.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jira_bridge as jb  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PASS, FAIL = [], []
_ORIG_AUTH = jb._auth  # stub_auth()가 갈아 끼우기 전의 진짜 함수 — [7]에서 되돌리는 데 쓴다


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail and not cond else ''))


class FakeResp(object):
    def __init__(self, status_code, body, headers=None):
        self.status_code = status_code
        self._body = body
        self.headers = headers or {}

    def json(self):
        return self._body


def fresh():
    jb._BLOCKED['reason'] = None


def stub_auth(ok=True):
    """`_auth()`가 매번 파일/DPAPI를 거치지 않게 경계를 좁힌다 — 자격증명 유무만 흉내."""
    if ok:
        jb._auth = lambda: object()
    else:
        jb._auth = lambda: None


def arm(responses):
    """requests.request 호출마다 순서대로 이 응답들을 돌려준다. 호출 횟수도 같이 센다."""
    calls = {'n': 0}
    it = iter(responses)

    def fake(method, url, **kw):
        calls['n'] += 1
        return next(it)
    jb.requests.request = fake
    return calls


print('\n[1] 401 — 그 자리에서 잠그고, 다음 호출은 네트워크를 타지 않는다')
fresh(); stub_auth(True)
calls = arm([FakeResp(401, {'errorMessages': ['Login failed'], 'errors': {}})])
try:
    jb._request('GET', '/rest/api/2/myself')
    check('401이면 예외를 던진다', False)
except jb.JiraApiError as e:
    check('401 → JiraApiError', True)
    check('잠긴다', bool(jb._BLOCKED['reason']), jb._BLOCKED)
try:
    jb._request('GET', '/rest/api/2/myself')
except jb.JiraApiError:
    pass
check('두 번째 호출은 재시도하지 않는다(네트워크 1회만)', calls['n'] == 1, calls)

print('\n[2] CAPTCHA 헤더 — 401이 아니어도 바로 잠근다')
fresh(); stub_auth(True)
calls = arm([FakeResp(200, {}, headers={'X-Authentication-Denied-Reason': 'CAPTCHA_CHALLENGE'})])
try:
    jb._request('GET', '/rest/api/2/myself')
    check('CAPTCHA면 예외를 던진다', False)
except jb.JiraApiError as e:
    check('CAPTCHA 헤더 → 잠금', bool(jb._BLOCKED['reason']) and 'CAPTCHA' in str(e), str(e))

print('\n[3] 403(권한) — 계정 잠금과 무관, 다시 시도할 수 있다')
fresh(); stub_auth(True)
calls = arm([FakeResp(403, {'errorMessages': ['no perm'], 'errors': {}}),
             FakeResp(200, {'key': 'GABKJ-1', 'fields': {}})])
try:
    jb._request('GET', '/rest/api/2/issue/GABKJ-9')
    check('403이면 예외를 던진다', False)
except jb.JiraApiError:
    check('403 → 예외', True)
check('403은 잠그지 않는다', not jb._BLOCKED['reason'], jb._BLOCKED)
r = jb._request('GET', '/rest/api/2/issue/GABKJ-1')
check('잠기지 않았으니 다음 호출이 그대로 돈다', r.json().get('key') == 'GABKJ-1')

print('\n[4] 자격증명이 아예 없으면 네트워크를 타지 않는다')
fresh(); stub_auth(False)
calls = arm([])
try:
    jb._request('GET', '/rest/api/2/myself')
    check('계정 없으면 예외', False)
except jb.JiraApiError as e:
    check('계정 없음 메시지', '계정이 없습니다' in str(e), str(e))
check('네트워크 호출 0회', calls['n'] == 0, calls)

print('\n[5] _shape_issue — 필드를 빠짐없이 옮긴다')
raw = {
    'key': 'GABKJ-1',
    'fields': {
        'summary': 'Base,Cover 내측 절단면 날카로움',
        'description': '상세 설명',
        'status': {'name': '진행중', 'id': '3'},
        'assignee': {'displayName': '홍길동', 'name': 'hong'},
        'reporter': {'displayName': '김철수', 'name': 'kim'},
        'priority': {'name': 'High', 'id': '2'},
        'issuetype': {'name': 'Bug'},
        'created': '2026-11-01T09:00:00.000+0900',
        'updated': '2026-11-10T09:00:00.000+0900',
        'components': [{'name': 'MECH'}],
        'labels': ['urgent'],
        'comment': {'comments': [{'author': {'displayName': '박영희'}, 'body': '확인했습니다', 'created': '2026-11-10T10:00:00.000+0900'}]},
    }
}
shaped = jb._shape_issue(raw)
check('key', shaped['key'] == 'GABKJ-1')
check('url', shaped['url'] == jb.JIRA_BASE + '/browse/GABKJ-1', shaped['url'])
check('summary', shaped['summary'] == 'Base,Cover 내측 절단면 날카로움')
check('status', shaped['status'] == '진행중')
check('assignee(표시이름)', shaped['assignee'] == '홍길동')
check('assigneeName(아이디)', shaped['assigneeName'] == 'hong')
check('priority', shaped['priority'] == 'High' and shaped['priorityId'] == '2')
check('components', shaped['components'] == ['MECH'])
check('labels', shaped['labels'] == ['urgent'])
check('comments 1건', len(shaped['comments']) == 1 and shaped['comments'][0]['author'] == '박영희')

print('\n[6] search — total/issues를 그대로 옮긴다')
fresh(); stub_auth(True)
calls = arm([FakeResp(200, {'total': 2, 'issues': [raw, dict(raw, key='GABKJ-2')]})])
res = jb.search('project = GABKJ', 10)
check('total', res['total'] == 2, res)
check('issues 2건, key 보존', [i['key'] for i in res['issues']] == ['GABKJ-1', 'GABKJ-2'])

print('\n[7] verify_login — /rest/api/2/myself 가 아니라 /rest/api/2/user?username= 을 쓴다')
#    ⚠️⚠️ [2026-11-11 실환경 발견] /rest/api/2/myself 는 이 서버(2013년 빌드)에 없다 —
#    인증은 성공하는데(헤더에 X-Seraph-LoginReason: OK) 그 리소스가 404("null for uri")를
#    줘서 "로그인 실패"로 오판했다. 실측으로 /rest/api/2/user?username=<계정> 이 통하는
#    걸 확인하고 바꿨다 — 이 테스트는 **그 선택이 유지되는지**를 지킨다(되돌리면 실패).
fresh(); stub_auth(True)
_orig_cfg_path_v = jb._CFG_PATH
test_path_v = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_jira_login_config_test_verify.json')
jb._CFG_PATH = test_path_v
try:
    jb._write_cfg({'user': 'yhpark', 'pw_dpapi': 'x', 'verified': False})
    seen = {}

    def fake_verify(method, url, **kw):
        seen['method'] = method
        seen['url'] = url
        seen['params'] = kw.get('params')
        return FakeResp(200, {'name': 'yhpark', 'displayName': '박용훈'})
    jb.requests.request = fake_verify
    res = jb.verify_login()
    check('myself 를 안 부른다', '/rest/api/2/myself' not in seen['url'], seen['url'])
    check('/rest/api/2/user 를 부른다', seen['url'].endswith('/rest/api/2/user'), seen['url'])
    check('username 파라미터로 내 계정을 넘긴다', seen['params'] == {'username': 'yhpark'}, seen['params'])
    check('ok + displayName', res['ok'] is True and res['displayName'] == '박용훈', res)
    check('verified 플래그가 파일에 남는다', jb._cfg().get('verified') is True)
finally:
    jb._CFG_PATH = _orig_cfg_path_v
    if os.path.exists(test_path_v):
        os.remove(test_path_v)

print('\n[8] save_config/delete_config — 진짜 DPAPI 왕복 + 잠금 해제')
_orig_cfg_path = jb._CFG_PATH
test_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_jira_login_config_test.json')
jb._CFG_PATH = test_path
try:
    jb._BLOCKED['reason'] = '이전 잠금(테스트용)'
    jb.save_config('tester', 'sup3r-secret!')
    check('저장 후 잠금 해제', not jb._BLOCKED['reason'])
    c = jb._cfg()
    check('user 평문 저장', c.get('user') == 'tester')
    check('verified는 저장 직후 False', c.get('verified') is False)
    jb._auth = _ORIG_AUTH  # 원래 함수로 복구(stub 제거) — 진짜 DPAPI 복호화를 태운다
    auth = jb._auth()
    check('DPAPI 복호화 → 원래 비밀번호', auth is not None and auth.password == 'sup3r-secret!')
    jb.delete_config()
    check('삭제 후 파일 없음', not os.path.exists(test_path))
    check('삭제도 잠금을 푼다', not jb._BLOCKED['reason'])
finally:
    jb._CFG_PATH = _orig_cfg_path
    if os.path.exists(test_path):
        os.remove(test_path)

print('\n' + ('=' * 50))
print('PASS %d / FAIL %d' % (len(PASS), len(FAIL)))
if FAIL:
    print('실패:', FAIL)
    sys.exit(1)
