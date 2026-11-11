# -*- coding: utf-8 -*-
"""🪐 JIRA(Kortek Issue Tracker) REST API 연동.

대상: http://jira.kortek.co.kr — Jira Server **5.2.11**(2013-04-15 빌드, serverInfo 실측).
PAT(개인 액세스 토큰)가 없는 시대의 버전이라(PAT는 Jira 8.14+) 모든 호출을 **Basic Auth**
(아이디:비밀번호를 매 요청에 실음)로 한다. REST API(/rest/api/2/*)가 이미 열려 있고 401에도
깨끗한 JSON을 주므로(실측: GET /rest/api/2/issue/GABKJ-1 → 401 +
{"errorMessages":[...],"errors":{}}) SAP/그룹웨어/인사관리처럼 화면 자동화가 필요 없다.

비밀번호는 Windows DPAPI로 암호화해 jira_login_config.json(.gitignore)에만 두고, 어떤
응답에도 돌려주지 않는다. ⚠️⚠️ 이 서버는 HTTP 전용(암호화 없음)이라 사내망을 벗어나면
평문으로 샌다 — 이 스크립트는 그 사실을 바꾸지 못한다.

⚠️⚠️ **CAPTCHA/계정잠금 정책을 모른다 — "모르면 안 한다".** 자격증명이 한 번 틀리면(401)
또는 CAPTCHA 요구 헤더(X-Authentication-Denied-Reason)가 오면, 그 자리에서 잠그고
**다시 시도하지 않는다**(SAP·그룹웨어·인사관리와 같은 이유). 사람이 🔑 설정에서 계정을
다시 저장해야 풀린다. 이 가드는 여기(백엔드)에 있다 — 프런트(js/36 `_jiraEnsureLogin`)는
"이미 실패했으면 또 부르지 않는다"는 자기 가드를 따로 갖되, 서버가 최종 방어선이다.
"""
import os
import json
import requests
from requests.auth import HTTPBasicAuth

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_CFG_PATH = os.path.join(BASE_DIR, 'jira_login_config.json')
JIRA_BASE = 'http://jira.kortek.co.kr'
_TIMEOUT = 15

# ⚠️ 한 번 틀리면 잠근다 — 이 서버가 몇 번까지 허용하는지 모른다(모르면 1회).
_BLOCKED = {'reason': None}


class JiraApiError(RuntimeError):
    def __init__(self, message, status=None):
        super(JiraApiError, self).__init__(message)
        self.status = status


def _dpapi_encrypt_b64(text):
    """⚠️ kortek_backend.py에도 같은 함수가 있지만 **여기에 따로 둔다** — 이 모듈을 import 않는
    PC에서도(아직 jira 기능을 안 쓰는 PC) kortek_backend.py만으로 돌아가야 한다."""
    import ctypes
    import base64
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
    raw = text.encode('utf-8')
    buf = ctypes.create_string_buffer(raw, len(raw))
    blob_in = _BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    blob_out = _BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(blob_in), 'kortek-jira-login', None, None, None, 0, ctypes.byref(blob_out)):
        raise RuntimeError('Windows 데이터 보호(DPAPI)로 비밀번호를 암호화하지 못했습니다.')
    try:
        return base64.b64encode(ctypes.string_at(blob_out.pbData, blob_out.cbData)).decode('ascii')
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def _dpapi_decrypt_b64(b64):
    import ctypes
    import base64
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
    raw = base64.b64decode(b64)
    buf = ctypes.create_string_buffer(raw, len(raw))
    bin_ = _BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    bout = _BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(bin_), None, None, None, None, 0, ctypes.byref(bout)):
        raise RuntimeError('저장된 비밀번호를 복호화하지 못했습니다'
                            '(다른 Windows 계정/PC에서 저장한 설정일 수 있음) — 다시 저장해주세요.')
    try:
        return ctypes.string_at(bout.pbData, bout.cbData).decode('utf-8')
    finally:
        ctypes.windll.kernel32.LocalFree(bout.pbData)


def _cfg():
    try:
        with open(_CFG_PATH, 'r', encoding='utf-8') as f:
            c = json.load(f)
        return c if isinstance(c, dict) else {}
    except Exception:
        return {}


def _write_cfg(c):
    with open(_CFG_PATH, 'w', encoding='utf-8') as f:
        json.dump(c, f, ensure_ascii=False, indent=2)


def status():
    """로그인은 하지 않는다 — 설정 유무 + 서버 도달 가능 여부만."""
    c = _cfg()
    out = {'ok': True, 'configured': bool(c.get('user') and c.get('pw_dpapi')),
           'user': c.get('user', ''), 'verified': bool(c.get('verified')),
           'blocked': _BLOCKED['reason']}
    try:
        requests.get(JIRA_BASE + '/rest/api/2/serverInfo', timeout=5)
        out['reachable'] = True
    except Exception as e:
        out['reachable'] = False
        out['message'] = 'JIRA 서버에 연결할 수 없습니다: %s' % e
    return out


def save_config(user, pw):
    enc = _dpapi_encrypt_b64(pw)
    _write_cfg({'user': user, 'pw_dpapi': enc, 'verified': False})
    _BLOCKED['reason'] = None  # 새 자격증명을 저장했으니 잠금을 푼다


def delete_config():
    if os.path.exists(_CFG_PATH):
        os.remove(_CFG_PATH)
    _BLOCKED['reason'] = None


def _auth():
    c = _cfg()
    if not (c.get('user') and c.get('pw_dpapi')):
        return None
    pw = _dpapi_decrypt_b64(c['pw_dpapi'])
    return HTTPBasicAuth(c['user'], pw)


def _err_text(r):
    try:
        j = r.json()
    except Exception:
        return None
    msgs = list(j.get('errorMessages') or [])
    errs = j.get('errors') or {}
    msgs += ['%s: %s' % (k, v) for k, v in errs.items()]
    return ' / '.join(msgs) if msgs else None


def _request(method, path, **kw):
    """모든 JIRA 호출의 단일 입구 — 잠금 판정·401/CAPTCHA 감지가 여기 한 곳에만 있다."""
    if _BLOCKED['reason']:
        raise JiraApiError(_BLOCKED['reason'])
    try:
        auth = _auth()
    except Exception as e:
        raise JiraApiError(str(e))
    if not auth:
        raise JiraApiError('저장된 JIRA 계정이 없습니다 — 🔑 설정에서 등록해주세요.')
    try:
        r = requests.request(method, JIRA_BASE + path, auth=auth, timeout=_TIMEOUT, **kw)
    except Exception as e:
        raise JiraApiError('JIRA 서버에 연결하지 못했습니다: %s' % e)
    # ⚠️ CAPTCHA 요구는 401이 아니라 이 헤더로 온다(그룹웨어와 달리 폼이 없어 추측만 가능하므로
    #    실제로 보이면 보수적으로 바로 잠근다) — 상태코드보다 먼저 본다.
    deny = r.headers.get('X-Authentication-Denied-Reason')
    if deny:
        _BLOCKED['reason'] = ('🔒 JIRA 가 추가 인증(보안문자 등)을 요구합니다 — 브라우저로 '
                              + JIRA_BASE + ' 에 직접 로그인해 풀어주세요. (사유: ' + deny + ')')
        raise JiraApiError(_BLOCKED['reason'])
    if r.status_code == 401:
        _BLOCKED['reason'] = ('🔒 JIRA 로그인 실패(아이디/비밀번호를 확인해주세요) — '
                              '계정을 다시 저장할 때까지 재시도하지 않습니다.')
        raise JiraApiError(_BLOCKED['reason'], status=401)
    if r.status_code == 403:
        # 권한 문제는 계정 자체가 틀린 게 아니다 — 잠그지 않는다.
        raise JiraApiError(_err_text(r) or '이 이슈를 볼 권한이 없습니다.', status=403)
    if r.status_code == 404:
        raise JiraApiError('요청한 대상을 찾을 수 없습니다 (HTTP 404, %s).' % path, status=404)
    if r.status_code >= 400:
        raise JiraApiError(_err_text(r) or ('JIRA 오류 (HTTP %d)' % r.status_code), status=r.status_code)
    return r


def verify_login():
    """자격증명을 **한 번만** 확인한다(whoami). 성공하면 verified 플래그를 남긴다.

    ⚠️⚠️ [2026-11-11 실측] `/rest/api/2/myself`는 이 서버(2013년 빌드)에 **등록돼 있지 않다**
    — 인증은 성공하는데(응답 헤더에 `X-Seraph-LoginReason: OK`, `X-AUSERNAME: <내 계정>`이
    실린다) 그 리소스 자체가 없어 **404**("null for uri")로 떨어진다. 그래서 자격증명이
    맞는데도 "로그인 실패"로 오판했다. `/rest/api/2/user?username=<내 계정>`은 실측으로
    200이 확인됐다 — 이게 이 서버에서 통하는 whoami다.
    """
    c = _cfg()
    user = c.get('user') or ''
    r = _request('GET', '/rest/api/2/user', params={'username': user})
    me = r.json()
    c['verified'] = True
    _write_cfg(c)
    return {'ok': True, 'displayName': me.get('displayName') or me.get('name'), 'name': me.get('name')}


FIELDS_DEFAULT = ('summary,description,status,assignee,reporter,priority,issuetype,'
                   'created,updated,comment,components,labels,fixVersions,attachment')


def _shape_issue(raw):
    f = raw.get('fields') or {}
    status_f = f.get('status') or {}
    assignee = f.get('assignee') or {}
    reporter = f.get('reporter') or {}
    priority = f.get('priority') or {}
    issuetype = f.get('issuetype') or {}
    comments = ((f.get('comment') or {}).get('comments')) or []
    attachments = f.get('attachment') or []
    return {
        'key': raw.get('key'),
        'url': JIRA_BASE + '/browse/' + str(raw.get('key') or ''),
        'summary': f.get('summary') or '',
        'description': f.get('description') or '',
        'status': status_f.get('name') or '',
        'statusId': status_f.get('id'),
        'assignee': assignee.get('displayName') or '',
        'assigneeName': assignee.get('name') or '',
        'reporter': reporter.get('displayName') or '',
        'priority': priority.get('name') or '',
        'priorityId': priority.get('id'),
        'issuetype': issuetype.get('name') or '',
        'created': f.get('created') or '',
        'updated': f.get('updated') or '',
        'components': [c.get('name') for c in (f.get('components') or [])],
        'labels': f.get('labels') or [],
        'comments': [{'author': (c.get('author') or {}).get('displayName'),
                      'body': c.get('body'), 'created': c.get('created')} for c in comments],
        # 📎 [2026-11-11 사용자 요청] 댓글에 "첨부 파일 참조"라고만 적혀 있고 정작 파일은
        # 안 보이는 문제 — JIRA는 첨부를 **댓글이 아니라 이슈**에 붙인다(실측 GABJQ-4,
        # 3건). 다운로드는 Basic Auth가 필요해 브라우저가 직접 못 받으므로
        # /jira/attachment 프록시를 거친다(아래 fetch_attachment).
        'attachments': [{'filename': a.get('filename') or '',
                          'size': a.get('size') or 0,
                          'mimeType': a.get('mimeType') or '',
                          'url': a.get('content') or '',
                          'author': (a.get('author') or {}).get('displayName'),
                          'created': a.get('created') or ''} for a in attachments],
    }


def get_issue(key):
    r = _request('GET', '/rest/api/2/issue/' + key, params={'fields': FIELDS_DEFAULT})
    return _shape_issue(r.json())


def search(jql, max_results=50):
    r = _request('GET', '/rest/api/2/search', params={
        'jql': jql, 'maxResults': max_results,
        'fields': 'summary,status,assignee,priority,issuetype,updated'
    })
    j = r.json()
    return {'total': j.get('total', 0), 'issues': [_shape_issue(i) for i in j.get('issues', [])]}


def add_comment(key, body):
    _request('POST', '/rest/api/2/issue/' + key + '/comment', json={'body': body})
    return {'ok': True}


# ── 👤 담당자 변경 확장(2026-11-11) — 아이디를 몰라도 이름으로 찾는다 ──────────
#  ⚠️⚠️ 실측: `/rest/api/2/user/assignable/search`의 `query` 파라미터는 이 서버에서
#  **조용히 무시된다**("hong"과 "yhpark"로 각각 질의해도 똑같은 50명이 그대로 왔다) —
#  그래서 JIRA 쪽 검색을 믿지 않고 `list_projects`/`resolve_project_key`와 같은 원칙으로
#  **우리가 전체를 받아 직접 거른다**(결정론 먼저, CLAUDE.md). `maxResults`는 실제로
#  듣는다(실측 204명 한 번에 옴) — 페이지네이션 없이 한 번에 받는다.
def assignable_users(key, q=None):
    r = _request('GET', '/rest/api/2/user/assignable/search',
                  params={'issueKey': key, 'maxResults': 500})
    out = [{'name': u.get('name'), 'displayName': u.get('displayName') or u.get('name')}
           for u in r.json()]
    if q:
        ql = q.strip().lower()
        out = [u for u in out if ql in (u['name'] or '').lower() or ql in (u['displayName'] or '').lower()]
    return out


def get_transitions(key):
    r = _request('GET', '/rest/api/2/issue/' + key + '/transitions')
    return [{'id': t.get('id'), 'name': t.get('name'), 'to': (t.get('to') or {}).get('name')}
            for t in r.json().get('transitions', [])]


def fetch_attachment(url):
    """첨부파일 바이트를 가져온다 — 브라우저가 직접 받으면 Basic Auth가 없어 401이 난다.

    ⚠️ `url` 은 프런트가 issue 조회로 받은 `attachments[].url` 그대로다 — **그 값 그대로가
    아니면 거부한다**(JIRA_BASE/secure/attachment/ 로 시작하지 않으면). 임의 주소를 우리
    자격증명으로 대신 불러오는 SSRF 통로가 되지 않게 하기 위해서다.
    """
    prefix = JIRA_BASE + '/secure/attachment/'
    if not url.startswith(prefix):
        raise JiraApiError('허용되지 않은 첨부파일 주소입니다.')
    return _request('GET', url[len(JIRA_BASE):])


def add_attachment(key, filename, content, mime_type=None):
    """이슈에 새 파일을 올린다(첨부 저장, 2026-11-11 추가).

    ⚠️ `X-Atlassian-Token: no-check` 헤더가 필수다 — 옛 Jira는 파일 업로드에 XSRF 토큰을
    요구하는데, REST API 클라이언트는 그 토큰을 받을 방법이 없어 이 헤더로 그 검사를
    건너뛴다(공식 문서에 적힌 값 그대로). `_request`가 `**kw`를 그대로 `requests.request`에
    넘기므로 `files=`/`headers=`도 기존 401/403/CAPTCHA/잠금 판정을 그대로 탄다.
    """
    r = _request('POST', '/rest/api/2/issue/' + key + '/attachments',
                  headers={'X-Atlassian-Token': 'no-check'},
                  files={'file': (filename, content, mime_type or 'application/octet-stream')})
    return [{'filename': a.get('filename') or '',
             'size': a.get('size') or 0,
             'mimeType': a.get('mimeType') or '',
             'url': a.get('content') or '',
             'author': (a.get('author') or {}).get('displayName'),
             'created': a.get('created') or ''} for a in r.json()]


def do_transition(key, transition_id, comment=None):
    body = {'transition': {'id': str(transition_id)}}
    if comment:
        body['update'] = {'comment': [{'add': {'body': comment}}]}
    _request('POST', '/rest/api/2/issue/' + key + '/transitions', json=body)
    return {'ok': True}


def update_fields(key, fields):
    """fields 예: {'summary': '...', 'assignee': {'name': 'uid'}, 'priority': {'id': '3'}}"""
    _request('PUT', '/rest/api/2/issue/' + key, json={'fields': fields})
    return {'ok': True}


def priorities():
    r = _request('GET', '/rest/api/2/priority')
    return [{'id': p.get('id'), 'name': p.get('name')} for p in r.json()]


# ── 📁 프로젝트 목록 — 코드(key)와 이름(name)으로 둘 다 찾게 (2026-11-11) ──────────
#  실측: 604개, 응답 0.1초/186KB — 매번 불러도 될 정도로 가볍다. 그래도 탭을 들락거릴
#  때마다 다시 받지 않도록 짧게(5분) 캐시한다. ⚠️ 프로젝트 **이름**은 `LNW>SHUFFLER 3.0"`
#  처럼 특수문자·끝에 따옴표가 섞여 있어(실측) JQL `project = "그 이름"` 매칭이 깨지기
#  쉽다 — 그래서 이름은 **사람이 찾는 용도로만** 쓰고, 실제 연결은 **항상 key** 로 한다.
_PROJECT_CACHE = {'ts': 0, 'list': None}
_PROJECT_CACHE_TTL = 300


def list_projects(q=None):
    import time
    now = time.time()
    if _PROJECT_CACHE['list'] is None or (now - _PROJECT_CACHE['ts']) > _PROJECT_CACHE_TTL:
        r = _request('GET', '/rest/api/2/project')
        _PROJECT_CACHE['list'] = [{'key': p.get('key'), 'name': p.get('name')} for p in r.json()]
        _PROJECT_CACHE['ts'] = now
    out = _PROJECT_CACHE['list']
    if q:
        ql = q.strip().lower()
        out = [p for p in out if ql in (p['key'] or '').lower() or ql in (p['name'] or '').lower()]
    return out


def resolve_project_key(text):
    """사람이 적은 글자(코드 또는 이름의 일부)를 **정확히 하나의** 프로젝트 key 로 바꾼다.

    ⚠️ 여러 개에 걸리거나 하나도 안 걸리면 **추측하지 않고** None 을 돌려준다 — 잘못
    고르면 엉뚱한 프로젝트의 수백 건 이슈가 딸려 온다.
    """
    text = (text or '').strip()
    if not text:
        return None
    projects = list_projects()
    for p in projects:
        if p['key'] == text.upper():
            return p['key']
    hits = [p for p in projects if text.lower() in (p['name'] or '').lower()]
    if len(hits) == 1:
        return hits[0]['key']
    return None
