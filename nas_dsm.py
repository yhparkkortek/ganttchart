#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🗄️ Synology DSM(NAS) 연동 — 로그인 + 파일 조회 (읽기 전용 1단계)

왜 있나: 앱 데이터를 구글 드라이브에서 NAS로 옮기는 길에서, **접속 권한을 사내 계정으로**
        바꾸는 부분을 맡는다. DSM 계정으로 로그인하면 파일 접근이 **그 사람 권한으로**
        일어나므로, 팀별 폴더 권한을 NAS가 강제한다 — 앱 코드를 고쳐도 우회할 수 없다.
        (SMB 경유 `/doc/*` 와 달리 HTTP API라 모바일·사외에서도 쓸 수 있다.)

실측으로 확인한 것 (2026-11-03, 사내 NAS):
  · SYNO.API.Auth v7 · FileStation List/Download/Upload/Delete/Rename/CopyMove/CreateFolder 전부 있음
  · 비로그인 호출은 {"error":{"code":119},"success":false}
  · 브라우저 쿠키 세션만으로는 API 가 안 된다(119) — SSO Server 패키지도 없다
    → 그래서 **이 백엔드가 로그인해서 sid 를 들고 있는다**

⚠️⚠️ 로그인 재시도 금지 — DSM 은 실패가 쌓이면 **IP 를 자동 차단**한다(계정이 아니라 PC 전체).
      그룹웨어/SAP 과 같은 규칙: 한 번 시도하고, 실패하면 그 자리에서 멈춰 사람에게 넘긴다.
⚠️ 비밀번호는 **POST 본문**으로만 보낸다 — 쿼리스트링에 실으면 NAS 의 nginx 접근로그에 남는다.
⚠️ 비밀번호를 로그·응답·명령줄·예외 메시지에 싣지 않는다. 저장은 Windows DPAPI 로
   `nas_login_config.json`(.gitignore)에만.
"""
import base64
import json
import os
import threading
import time
import uuid
import time
import uuid

import requests
import urllib3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NAS_LOGIN_CFG = os.path.join(BASE_DIR, 'nas_login_config.json')

# 자체서명 인증서를 쓰는 사내 NAS 가 많다. 검증을 끄면 경고가 쏟아지므로 한 번만 잠재운다.
# (끄는 것 자체는 평문 http 보다 낫다 — 적어도 전송은 암호화된다. 사설 CA 가 생기면 verify 를 켤 것)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

_LOCK = threading.Lock()
_SESSION = {'sid': None, 'user': None, 'origin': None}

# ⚠️⚠️ 로그인 조합은 **실측으로 확정한 것**이다(2026-11-03). 추측으로 바꾸지 말 것.
#   `session` 은 아무 이름이나 되는 게 아니다 — DSM 은 이 값으로 "어느 응용 프로그램에
#   로그인하는가"를 판정하고 그 응용 프로그램에 대한 계정 권한을 본다. 처음에 임의로
#   `KortekGantt` 라고 넣었더니 **402(계정 권한 없음)** 가 나왔고, 그걸 NAS 쪽 권한 설정
#   문제로 오진해 사용자에게 관리자 화면을 뒤지게 만들었다. v7/v6/v3 전부 402 였던 것도
#   원인이 버전이 아니라 session 이름이었기 때문이다.
#   `auth.cgi` + v3 + `session=FileStation` 에서 **한 번에 성공**. (Synology FileStation 문서의 조합)
#   바꿔야 하면 `tests/nas-login-probe.py` 로 재확인하고, 402 이외 코드가 나오면 멈출 것.
_LOGIN = {'path': 'auth.cgi', 'version': 3, 'session': 'FileStation'}
# 실패가 쌓이면 IP 가 차단되므로, 몇 번까지만 해 보고 "사람이 고칠 때까지" 잠근다.
#
# 🔁 [2026-11-04] 처음엔 **1회**였다 — 팀원이 비밀번호를 한 글자 틀리면 그 PC 가 바로 막히는
#    셈이어서(한글 IME 로 `y`→`ㅛ` 가 들어간 사고 이력도 있다) 사람이 쓰기엔 너무 날카로웠다.
#    ⚠️ **진짜 IP 차단은 DSM 의 "자동 차단" 설정이 한다**(실패 N회/분 → 차단). 그 값을 코드가
#       읽어서 맞추고 싶었지만 `SYNO.Core.Security.AutoBlock` 은 **관리자만** 읽을 수 있다
#       (실측 2026-11-04: 105 권한 없음 — `tests/nas-autoblock-probe.py`). 그래서 아래 숫자는
#       "읽어서 맞춘 값"이 아니라 **보수적으로 정한 값**이다. 늘리려면 NAS 관리자에게
#       자동 차단 임계값을 확인하고 그보다 넉넉히 작게 둘 것.
_LOGIN_POLICY = {'maxFails': 3}
_BLOCKED = {'reason': None, 'fails': 0}

# ⚠️ **모든 실패가 차단 카운터에 쌓이는 건 아니다.** 자격증명을 틀린 것만 쌓인다(docs/nas-dsm.md).
#    그래서 "권한이 없다/계정이 비활성이다" 같은 설정 문제는 예산을 깎지 않는다 — 깎으면
#    고칠 수도 없는 이유로 예산이 사라져서, 정작 비밀번호를 고쳐 넣을 기회가 없어진다.
_AUTH_COUNTED   = {400, 404}            # 비밀번호/OTP 틀림 — 쌓인다
_AUTH_HARD_STOP = {407, 411}            # 이미 IP 차단 / 계정 잠김 — 즉시 멈춘다(더 두드리면 악화)
#   그 밖의 코드(401 비활성·402 권한없음·403/406 OTP 설정·408~410 비밀번호 만료)는
#   쌓이지 않으므로 잠그지 않는다. 사람이 원인을 고치면 그냥 된다.


class NasApiError(RuntimeError):
    """DSM 이 돌려준 오류 — 사람이 읽는 문구 + **코드**를 같이 들고 있다.

    코드를 버리면 "비밀번호 틀림(400)"과 "권한 없음(402)"을 구분할 수 없어, 위 분류가
    전부 무의미해진다. RuntimeError 를 상속하므로 기존 `except Exception` 들은 그대로 돈다.
    """

    def __init__(self, message, code=None, api=None):
        super().__init__(message)
        self.code = code
        self.api = api

# ⚠️⚠️ **같은 숫자가 API 마다 전혀 다른 뜻이다.** 한 표로 합치면 안 된다.
#   2026-11-03 사고: 400~411 을 로그인(Auth) 기준 하나로만 적어 뒀더니, 권한 없는 팀 폴더를
#   조회했을 때 FileStation 의 407(권한 없음)이 **"이 IP 가 차단되었습니다"** 로 찍혔다.
#   차단된 적이 없는데 차단됐다고 보고한 셈이고, 사람을 엉뚱한 복구 작업으로 보낼 문구다.
#   → 새 코드를 넣을 때 **어느 API 의 표인지** 반드시 확인할 것.
_ERRS_COMMON = {
    100: '알 수 없는 오류', 101: '잘못된 요청', 102: '그런 API 가 없습니다',
    103: '그런 기능(method)이 없습니다', 104: 'NAS 가 이 버전을 지원하지 않습니다',
    105: '권한이 없습니다', 106: '세션이 만료되었습니다', 107: '다른 곳에서 로그인해 세션이 끊겼습니다',
    119: '세션이 없거나 만료되었습니다(로그인 필요)',
}
# SYNO.API.Auth 전용
_ERRS_AUTH = {
    400: '아이디 또는 비밀번호가 올바르지 않습니다',
    401: '계정이 비활성화되었습니다', 402: '계정 권한이 없습니다',
    403: '2단계 인증(OTP) 코드가 필요합니다', 404: '2단계 인증 코드가 올바르지 않습니다',
    406: '2단계 인증을 먼저 설정해야 합니다', 407: '이 IP 가 차단되었습니다',
    408: '비밀번호가 만료되었습니다', 409: '비밀번호가 만료되어 변경해야 합니다',
    410: '비밀번호를 변경해야 합니다', 411: '계정이 잠겼습니다',
}
# SYNO.FileStation.* 전용
_ERRS_FS = {
    400: '파일 작업 인자가 잘못되었습니다', 401: '파일 작업 중 알 수 없는 오류',
    402: 'NAS 가 너무 바쁩니다', 403: '이 사용자는 이 파일 작업을 할 수 없습니다',
    404: '이 그룹은 이 파일 작업을 할 수 없습니다',
    405: '이 사용자·그룹은 이 파일 작업을 할 수 없습니다',
    406: '계정 서버에서 사용자/그룹 정보를 가져오지 못했습니다',
    407: '권한이 없습니다(폴더 ACL 거부)',
    408: '그런 파일이나 폴더가 없습니다', 409: '지원하지 않는 파일 시스템입니다',
    410: '외부 파일 시스템 연결에 실패했습니다', 411: '읽기 전용 파일 시스템입니다',
    412: '파일 이름이 너무 깁니다', 413: '파일 이름이 너무 깁니다(암호화 폴더)',
    414: '같은 이름의 파일이 이미 있습니다', 415: '디스크 할당량을 넘었습니다',
    416: '디스크 공간이 없습니다', 417: '입출력 오류', 418: '허용되지 않는 이름/경로입니다',
    419: '허용되지 않는 파일 이름입니다', 420: 'FAT 파일시스템에서 허용되지 않는 이름입니다',
    421: '장치나 자원이 사용 중입니다', 599: '그런 파일 작업 작업(task)이 없습니다',
    # 900 은 "지우지 못했다"는 뜻인데 이유를 안 준다. 권한(ACL)이 전부 허용으로 보이는데도
    # 나는 경우가 있다(2026-11-03 실측: 한 공유폴더) — 불변 스냅샷·동기화 잠금 같은
    # 공유 단위 정책일 수 있다. **권한 탓으로 단정하지 말 것.**
    900: '삭제하지 못했습니다(권한은 허용인데도 거부되면 그 공유폴더의 정책일 수 있습니다)',
}


def _msg(code, api=None):
    """오류 코드를 사람 말로. **어느 API 인지**에 따라 같은 숫자의 뜻이 달라진다."""
    if code in _ERRS_COMMON:
        return _ERRS_COMMON[code]
    table = _ERRS_FS if (api or '').startswith('SYNO.FileStation') else _ERRS_AUTH
    return table.get(code, '오류 코드 %s' % code)


# ── 설정 저장/읽기 (DPAPI) ───────────────────────────────────────────
def _dpapi_encrypt_b64(text):
    import ctypes
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
    raw = text.encode('utf-8')
    buf = ctypes.create_string_buffer(raw, len(raw))
    bin_ = _BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    bout = _BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(bin_), 'kortek-nas-login',
                                                  None, None, None, 0, ctypes.byref(bout)):
        raise RuntimeError('Windows 데이터 보호(DPAPI)로 비밀번호를 암호화하지 못했습니다.')
    try:
        return base64.b64encode(ctypes.string_at(bout.pbData, bout.cbData)).decode('ascii')
    finally:
        ctypes.windll.kernel32.LocalFree(bout.pbData)


def _dpapi_decrypt_b64(b64):
    import ctypes
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
    raw = base64.b64decode(b64)
    buf = ctypes.create_string_buffer(raw, len(raw))
    bin_ = _BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    bout = _BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(bin_), None, None, None, None,
                                                    0, ctypes.byref(bout)):
        raise RuntimeError('저장된 NAS 비밀번호를 복호화하지 못했습니다'
                           '(다른 Windows 계정/PC에서 저장한 설정일 수 있음) — 다시 저장해주세요.')
    try:
        return ctypes.string_at(bout.pbData, bout.cbData).decode('utf-8')
    finally:
        ctypes.windll.kernel32.LocalFree(bout.pbData)


NAS_DEFAULTS = os.path.join(BASE_DIR, 'nas_defaults.json')


def load_defaults():
    """팀 공용 **기본값**(주소·포트·HTTPS·앱 폴더). 없으면 {}.

    🔑 [2026-11-04] 왜 이런 파일이 따로 있나 — "그냥 주소를 코드에 박으면 되지 않나"의 답이다.
       이 저장소는 **GitHub Pages 로 공개**돼 있다(실측 확인: public). 사내 IP·공유 경로를
       코드에 박으면 그대로 인터넷에 올라간다. 그렇다고 팀원마다 주소를 손으로 치게 하면
       오타가 나고, 그 오타는 **로그인 실패 → IP 차단**으로 이어진다.
       → 주소는 **저장소를 거치지 않는 길**로 옮긴다: 이 파일(.gitignore)을 설치 폴더에
         같이 두면 앱이 알아서 채운다. 팀원은 **사번·비밀번호만** 넣는다.
    ⚠️ **비밀번호는 여기 넣지 않는다.** 비밀번호는 DPAPI 로 그 PC 에서만 풀리게
       `nas_login_config.json` 에만 들어간다(이 파일은 평문이고 여러 PC 를 돌아다닌다).
    """
    try:
        with open(NAS_DEFAULTS, 'r', encoding='utf-8') as f:
            d = json.load(f) or {}
    except Exception:
        return {}
    out = {}
    if d.get('host'):
        out['host'] = str(d['host']).strip()
    if d.get('port'):
        try:
            out['port'] = int(d['port'])
        except Exception:
            pass
    if 'https' in d:
        out['https'] = bool(d['https'])
    if d.get('root'):
        out['root'] = str(d['root']).strip()
    if d.get('docRoot'):
        out['docRoot'] = str(d['docRoot']).strip()
    out.pop('pw', None)               # 혹시 넣었더라도 절대 안 쓴다
    out.pop('password', None)
    return out


def load_config():
    """{'host','port','https','user','pw_dpapi'} 또는 None."""
    try:
        with open(NAS_LOGIN_CFG, 'r', encoding='utf-8') as f:
            cfg = json.load(f) or {}
    except Exception:
        return None
    if cfg.get('host') and cfg.get('user') and cfg.get('pw_dpapi'):
        return cfg
    return None


def _raw_config():
    """완결성 검사 없이 파일 그대로. `load_config()` 는 로그인 정보가 다 있어야 돌려주므로,
    **아직 로그인 전이라도 `root` 는 지켜야 하는** 저장 경로에서는 이쪽을 쓴다."""
    try:
        with open(NAS_LOGIN_CFG, 'r', encoding='utf-8') as f:
            return json.load(f) or {}
    except Exception:
        return {}


def save_config(host, port, use_https, user, password):
    """비밀번호를 비워 보내면 기존 값을 유지한다(다른 항목만 수정).

    ⚠️⚠️ **기존 값을 통째로 갈아엎지 말 것.** 처음엔 새 dict 를 만들어 썼는데, 그러면
       같은 파일에 들어 있는 `root`/`team_root`(앱 폴더 위치)가 **조용히 지워진다**.
       로그인만 다시 저장했을 뿐인데 다음 저장이 "앱 루트가 설정되어 있지 않습니다"로
       죽는다. 모르는 키도 그대로 두고 **아는 키만 덮어쓴다**.
    """
    cfg = _raw_config()
    pw_enc = cfg.get('pw_dpapi')
    if password:
        pw_enc = _dpapi_encrypt_b64(password)
    if not pw_enc:
        raise ValueError('비밀번호가 필요합니다.')
    cfg.update({'host': str(host).strip(), 'port': int(port), 'https': bool(use_https),
                'user': str(user).strip(), 'pw_dpapi': pw_enc})
    with open(NAS_LOGIN_CFG, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    reset_block()          # 설정을 다시 저장했으면 "사람이 다시 시킨 것" → 잠금 해제
    _SESSION.update({'sid': None, 'user': None, 'origin': None})
    return {'host': cfg['host'], 'port': cfg['port'], 'https': cfg['https'], 'user': cfg['user']}


def clear_config():
    try:
        os.remove(NAS_LOGIN_CFG)
    except FileNotFoundError:
        pass
    _SESSION.update({'sid': None, 'user': None, 'origin': None})
    reset_block()


def origin_of(cfg):
    return '%s://%s:%d' % ('https' if cfg.get('https') else 'http', cfg['host'], int(cfg['port']))


# ── API 호출 ─────────────────────────────────────────────────────────
# ⚡ 연결을 재사용한다(HTTP keep-alive). 매번 `requests.post()` 를 쓰면 **요청마다 TCP+TLS
#   핸드셰이크를 새로 한다** — 실측에서 호출 1회 고정비가 116ms 였고, 그 대부분이 이것이었다.
#   앱이 프로젝트 목록을 훑을 땐 호출이 수십 번이라 이 고정비가 곧 체감 속도가 된다.
#   (수치·측정법 → docs/nas-dsm.md "속도")
_HTTP = {'s': None}


def _http():
    s = _HTTP.get('s')
    if s is None:
        s = requests.Session()
        s.verify = False
        _HTTP['s'] = s
    return s


def _call(cfg, api, method, version, params=None, post=False, stream=False, timeout=60,
          path='entry.cgi'):
    """webapi 한 번. 성공하면 data, 실패하면 RuntimeError(사람이 읽는 말)."""
    url = '%s/webapi/%s' % (origin_of(cfg), path)
    body = dict(params or {})
    body.update({'api': api, 'method': method, 'version': version})
    if _SESSION.get('sid'):
        body['_sid'] = _SESSION['sid']
    kw = {'timeout': timeout, 'verify': False, 'stream': stream}
    s = _http()
    r = s.post(url, data=body, **kw) if post else s.get(url, params=body, **kw)
    r.raise_for_status()
    if stream:
        return r
    j = r.json()
    if not j.get('success'):
        code = ((j.get('error') or {}).get('code'))
        raise NasApiError('NAS %s.%s 실패 — %s' % (api, method, _msg(code, api)), code, api)
    return j.get('data')


def is_blocked():
    return _BLOCKED['reason']


def login_budget():
    """남은 시도 횟수. 화면이 "N번 남았습니다"를 말할 수 있게 밖으로 낸다."""
    used = int(_BLOCKED.get('fails') or 0)
    return {'max': _LOGIN_POLICY['maxFails'], 'used': used,
            'left': max(0, _LOGIN_POLICY['maxFails'] - used)}


def reset_block():
    _BLOCKED['reason'] = None
    _BLOCKED['fails'] = 0


def status():
    """로그인 상태. 로그인 시도는 하지 않는다."""
    cfg = load_config()
    if not cfg:
        return {'ok': False, 'configured': False, 'reason': 'not_configured',
                'message': 'NAS 로그인 정보가 저장되어 있지 않습니다.'}
    out = {'configured': True, 'host': cfg['host'], 'port': cfg['port'],
           'https': cfg['https'], 'user': cfg['user']}
    out['budget'] = login_budget()
    if _BLOCKED['reason']:
        out.update({'ok': False, 'reason': 'blocked', 'message': _BLOCKED['reason']})
        return out
    if not _SESSION.get('sid'):
        out.update({'ok': False, 'reason': 'no_session', 'message': '아직 로그인하지 않았습니다.'})
        return out
    try:
        _call(cfg, 'SYNO.FileStation.List', 'list_share', 2, {'limit': 1})
        out['ok'] = True
        return out
    except Exception as e:
        _SESSION['sid'] = None
        out.update({'ok': False, 'reason': 'expired', 'message': str(e)})
        return out


def login_once(otp=None):
    """저장된 계정으로 로그인한다. **자동 재시도는 없다** — 한 번 부르면 한 번 시도한다.

    ⚠️ 비밀번호를 틀린 실패는 `_LOGIN_POLICY['maxFails']` 번까지만 허용하고, 그 뒤엔
       `_BLOCKED` 에 적어 사람이 설정을 다시 저장할 때까지 잠근다 — DSM 은 실패가 쌓이면
       **계정이 아니라 그 PC 의 IP** 를 차단한다. 권한·만료처럼 카운터에 쌓이지 않는
       실패는 예산을 깎지 않는다(위 `_AUTH_COUNTED` 주석).
    """
    with _LOCK:
        if _BLOCKED['reason']:
            return {'ok': False, 'result': 'blocked', 'retryable': False, 'message': _BLOCKED['reason']}
        cfg = load_config()
        if not cfg:
            return {'ok': False, 'result': 'not_configured', 'retryable': True,
                    'message': 'NAS 로그인 정보가 없습니다 — 먼저 등록해주세요(nas_set_login.py).'}
        if _SESSION.get('sid') and _SESSION.get('origin') == origin_of(cfg):
            return {'ok': True, 'result': 'already', 'user': cfg['user'],
                    'message': '이미 로그인되어 있습니다.'}
        try:
            pw = _dpapi_decrypt_b64(cfg['pw_dpapi'])
        except Exception as e:
            return {'ok': False, 'result': 'decrypt', 'retryable': True, 'message': str(e)}

        params = {'account': cfg['user'], 'passwd': pw,
                  'session': _LOGIN['session'], 'format': 'sid'}
        if otp:
            params['otp_code'] = str(otp)
        try:
            # ⚠️ 반드시 POST — GET 이면 비밀번호가 NAS 접근로그(nginx)에 통째로 남는다.
            data = _call(cfg, 'SYNO.API.Auth', 'login', _LOGIN['version'], params,
                         post=True, timeout=30, path=_LOGIN['path'])
        except requests.RequestException as e:
            # 서버까지 못 갔다 = 실패가 쌓이지 않는다 → 잠그지 않는다.
            return {'ok': False, 'result': 'unreachable', 'retryable': True,
                    'message': 'NAS 에 닿지 못했습니다: %s' % e}
        except NasApiError as e:
            code = e.code
            if code in _AUTH_HARD_STOP:
                _BLOCKED['reason'] = str(e)
                return {'ok': False, 'result': 'failed', 'retryable': False,
                        'code': code, 'budget': login_budget(), 'message': str(e)}
            if code in _AUTH_COUNTED:
                _BLOCKED['fails'] = int(_BLOCKED.get('fails') or 0) + 1
                b = login_budget()
                if b['left'] <= 0:
                    _BLOCKED['reason'] = (str(e) +
                        ' — %d번 틀려서 더 시도하지 않습니다. 설정에서 비밀번호를 다시 저장하면 풀립니다.'
                        % b['max'])
                    return {'ok': False, 'result': 'failed', 'retryable': False,
                            'code': code, 'budget': b, 'message': _BLOCKED['reason']}
                return {'ok': False, 'result': 'bad_credentials', 'retryable': True,
                        'code': code, 'budget': b,
                        'message': str(e) + ' — %d번 더 시도할 수 있습니다.' % b['left']}
            # 쌓이지 않는 실패(권한·비활성·만료·OTP 설정) — 잠그지 않는다
            return {'ok': False, 'result': 'rejected', 'retryable': True,
                    'code': code, 'budget': login_budget(), 'message': str(e)}
        except Exception as e:
            _BLOCKED['reason'] = str(e)
            return {'ok': False, 'result': 'failed', 'retryable': False,
                    'budget': login_budget(), 'message': str(e)}
        finally:
            pw = None
        _SESSION.update({'sid': data.get('sid'), 'user': cfg['user'], 'origin': origin_of(cfg)})
        return {'ok': True, 'result': 'ok', 'user': cfg['user'], 'message': '로그인했습니다.'}


def logout():
    cfg = load_config()
    if cfg and _SESSION.get('sid'):
        try:
            _call(cfg, 'SYNO.API.Auth', 'logout', _LOGIN['version'],
                  {'session': _LOGIN['session']}, post=True, timeout=15, path=_LOGIN['path'])
        except Exception:
            pass
    _SESSION.update({'sid': None, 'user': None, 'origin': None})
    return {'ok': True}


def _cfg_or_raise():
    cfg = load_config()
    if not cfg:
        raise RuntimeError('NAS 로그인 정보가 없습니다.')
    if not _SESSION.get('sid'):
        r = login_once()
        if not r.get('ok'):
            raise RuntimeError(r.get('message') or '로그인이 필요합니다.')
    return cfg


def list_shares():
    """내 계정이 **볼 수 있는** 공유폴더 목록. 권한이 없는 공유는 애초에 안 나온다."""
    cfg = _cfg_or_raise()
    d = _call(cfg, 'SYNO.FileStation.List', 'list_share', 2,
              {'limit': 200, 'additional': '["real_path","perm"]'})
    return [{'name': s.get('name'), 'path': s.get('path'),
             'perm': (s.get('additional') or {}).get('perm')} for s in (d or {}).get('shares') or []]


def list_folder(path, limit=1000):
    """폴더 하나의 내용. 권한이 없으면 105(권한 없음)로 떨어진다 — 그게 정상 동작이다."""
    cfg = _cfg_or_raise()
    d = _call(cfg, 'SYNO.FileStation.List', 'list', 2,
              {'folder_path': path, 'limit': limit, 'additional': '["size","time","perm"]'})
    out = []
    for f in (d or {}).get('files') or []:
        a = f.get('additional') or {}
        out.append({'name': f.get('name'), 'path': f.get('path'), 'isdir': bool(f.get('isdir')),
                    'size': (a.get('size') if not f.get('isdir') else None),
                    'mtime': (a.get('time') or {}).get('mtime'),
                    # ⚠️ perm 을 버리지 말 것 — "여기에 쓸 수 있나"를 이것으로 판정한다.
                    #    예전엔 요청만 하고 응답에서 떨궈서 ACL 지도가 전부 '?' 로 나왔다.
                    'perm': a.get('perm')})
    return {'path': path, 'count': len(out), 'items': out, 'total': (d or {}).get('total')}


def path_info(paths):
    """경로 여러 개의 유효 권한을 한 번에. `list` 의 perm 이 비어 올 때 쓴다(폴더 자신의 권한)."""
    cfg = _cfg_or_raise()
    if isinstance(paths, str):
        paths = [paths]
    d = _call(cfg, 'SYNO.FileStation.List', 'getinfo', 2,
              {'path': json.dumps(paths, ensure_ascii=False),
               'additional': '["perm","real_path"]'})
    # ⚠️⚠️ **없는 경로도 항목으로 돌아온다** — 그 항목엔 `code`(408 등)가 실려 있다.
    #    그걸 안 걸러서 `exists()` 가 항상 True 였고, 그래서 "썼는지 확인" 도 무력했다.
    #    (2026-11-03: 삭제가 안 됐는데 성공으로 보고한 것도 같은 원인)
    out = []
    for f in (d or {}).get('files') or []:
        if f.get('code'):
            continue              # 읽을 수 없음/없음 — 존재로 세지 않는다
        a = f.get('additional') or {}
        out.append({'name': f.get('name'), 'path': f.get('path'),
                    'isdir': bool(f.get('isdir')), 'perm': a.get('perm')})
    return out


def download(path, timeout=120):
    """파일 하나를 바이트로.

    ⚠️ 예전엔 `stream=True` 로 받고 **응답을 닫지 않았다**. 연결을 샜다는 뜻이고,
       이 함수를 반복해 부르는 경로(목록 N건 읽기)에서 조용히 쌓인다.
       작은 파일은 스트림이 득이 없으니 통째로 받고 **반드시 닫는다**.
    ⚠️ DSM 이 **502 에 "페이지를 찾을 수 없습니다" HTML** 을 실어 보내는 상태가 있다.
       그걸 바이트로 돌려주면 호출한 쪽이 **그 HTML 을 파일 내용으로 저장한다** —
       프로젝트 JSON 이면 데이터가 조용히 깨진다. 그래서 여기서 막고 사람 말로 세운다.
    """
    cfg = _cfg_or_raise()
    url = origin_of(cfg) + '/webapi/entry.cgi'
    params = {'api': 'SYNO.FileStation.Download', 'method': 'download', 'version': 2,
              'path': path, 'mode': 'download', '_sid': _SESSION.get('sid')}
    with _http().get(url, params=params, timeout=timeout, verify=False) as r:
        if r.status_code == 502:
            # ⚠️ **DSM 은 "없는 파일" 에도 502 + "페이지를 찾을 수 없습니다" HTML 을 준다**(실측).
            #    2026-11-03 사고: 이걸 "NAS 다운로드 핸들러가 죽었다"로 오진해 한참 헤맸다.
            #    실제로는 내 put 이 최종 파일을 안 만들고 있었다 → 먼저 **있는지부터** 묻는다.
            exists_now = False
            try:
                exists_now = bool(path_info(path))
            except Exception:
                pass
            if not exists_now:
                raise RuntimeError('그 경로에 파일이 없습니다(DSM 은 없는 파일에도 502 를 줍니다): %s'
                                   % path)
            raise RuntimeError(
                'NAS 다운로드가 502 로 거부되었습니다 — 파일은 있는데 읽기만 안 되는 상태입니다. '
                'DSM 웹 File Station 에서 같은 파일을 내려받아 보세요 — 거기서도 안 되면 '
                'NAS 쪽 문제입니다(File Station 패키지 재시작).')
        r.raise_for_status()
        body = r.content
    # 성공처럼 보이지만 JSON 오류를 실어 보내는 경우가 있다(DSM 관례).
    ctype = (r.headers.get('Content-Type') or '').lower()
    if 'application/json' in ctype:
        try:
            j = json.loads(body.decode('utf-8', 'replace'))
        except Exception:
            j = None
        if isinstance(j, dict) and not j.get('success'):
            code = (j.get('error') or {}).get('code')
            raise RuntimeError('NAS 다운로드 실패 — %s'
                               % _msg(code, 'SYNO.FileStation.Download'))
    return body


# ═══════════════════════════════════════════════════════════════════════
# 📁 앱 데이터 배치 — 경로는 **설정 파일에만**, 팀 경로는 **따로**
# ═══════════════════════════════════════════════════════════════════════
# ⚠️ 사내 공유 경로를 코드에 쓰지 않는다(이 저장소는 GitHub Pages 로 공개).
#    실제 경로는 `nas_login_config.json`(.gitignore) 의 `root` / `team_root` 에만 있다.
#
# 1단계(2026-11-03 결정): **팀별 파일까지 공용 폴더 한 곳**에서 운영한다.
#    팀별 ACL 을 아직 켜지 않으므로 "권한 거부 폴더 건너뛰기"가 필요 없고,
#    메일 배분도 팀 내에서만 하므로 배분 큐도 필요 없다.
# 2단계(안정화 후): 팀별 파일만 팀 폴더로 이사한다.
#    그때 **`team_root` 를 채우는 것만으로** 끝나게 해 두는 것이 이 구조의 목적이다.
#    (경로를 코드에 박으면 그 이사가 99개 호출지점을 다시 여는 일이 된다)
#
#    root      = 공용 루트          예) <공유>/<공용폴더>/<앱폴더>
#    team_root = 팀 파일의 부모      비어 있으면 root 와 같은 곳(= 1단계)
#
# 하위 배치(이름은 지금 Drive 구조를 그대로 옮긴 것 — js/04b 주석 기준):
_LAYOUT = {
    'config': '_App_Config',       # 주소록·우선순위·휴일·AI프롬프트·메일필터·project_index
    'backups': 'Backups',          # Backups/<팀>/백업_*.json
    'mailbodies': 'MailBodies',    # 메일 원문 전문 (1건 1파일)
    'inbox_backups': 'TaskInbox_Backups',
}


def _norm_rel(rel):
    """앱 루트 기준 상대경로를 눕힌다. 상위 참조·절대경로는 거부한다."""
    s = str(rel or '').replace(chr(92), '/').strip('/')
    if not s:
        return ''
    parts = []
    for p in s.split('/'):
        if p in ('', '.'):
            continue
        if p == '..':
            raise ValueError('상위 폴더 참조(..)는 허용하지 않습니다: %s' % rel)
        parts.append(p)
    return '/'.join(parts)


def roots():
    """(공용 루트, 팀 파일 부모). 설정이 없으면 RuntimeError."""
    cfg = load_config() or {}
    root = str(cfg.get('root') or '').replace(chr(92), '/').rstrip('/')
    if not root.startswith('/'):
        raise RuntimeError('NAS 앱 루트(root)가 설정되어 있지 않습니다 — nas_set_root.py 로 지정하세요.')
    team = str(cfg.get('team_root') or '').replace(chr(92), '/').rstrip('/')
    return root, (team if team.startswith('/') else root)



def set_roots(root=None, team_root=None, make=True):
    """앱 폴더 위치를 저장한다. CLI(`nas_set_root.py`)와 설정 화면이 **같은 함수**를 쓴다.

    ⚠️ 여기서도 기존 키를 보존한다 — 로그인 정보가 같은 파일에 들어 있다.
    ⚠️ `root` 는 `/공유이름/하위폴더` 형태여야 한다. 공유 루트 자체(`/공유`)를 앱 폴더로
       삼으면 남의 자료와 섞이고, 임시 폴더 청소 같은 동작이 **남의 폴더를 건드리게 된다**.
    """
    cfg = _raw_config()
    out = {}
    if root is not None:
        r = str(root).replace(chr(92), '/').rstrip('/')
        if not r.startswith('/') or r.count('/') < 2:
            raise ValueError('앱 폴더는 /공유이름/하위폴더 형태의 절대경로여야 합니다.')
        if make:
            ensure_folder(r)          # 없으면 만든다(권한이 없으면 여기서 정직하게 실패한다)
        cfg['root'] = r
        out['root'] = r
    if team_root is not None:
        t = str(team_root).replace(chr(92), '/').rstrip('/')
        if t and not t.startswith('/'):
            raise ValueError('팀 폴더 부모는 절대경로여야 합니다(또는 비움).')
        cfg['team_root'] = t
        out['team_root'] = t
    with open(NAS_LOGIN_CFG, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return out


def _acl_rights(perm):
    acl = (perm or {}).get('acl') or {}
    if not acl:
        return ''
    return '%s%s%s' % ('R' if acl.get('read') else '-',
                       'W' if acl.get('write') else '-',
                       'A' if acl.get('append') else '-')


def writable_candidates(limit_per_share=300):
    """앱 폴더로 쓸 수 있는 곳(= 쓰기 권한이 보이는 폴더) 목록.

    설정 화면과 `nas_set_root.py --list` 가 **같은 목록**을 본다 — 두 벌로 두면
    "CLI 에선 보이는데 화면에선 안 보인다" 같은 것이 생긴다.
    ⚠️ 권한 없는 공유는 애초에 목록에 안 나오고, 권한 없는 하위 폴더는 보이지만 열면 407 이다.
       그래서 `list` 의 perm 이 비어 오면 `path_info` 로 한 번 더 묻는다.
    """
    out = []
    for s in list_shares():
        try:
            top = list_folder(s['path'], limit=limit_per_share)
        except Exception:
            continue                     # 못 여는 공유는 건너뛴다(정상 동작이다)
        subs = [i for i in top['items'] if i['isdir'] and not i['name'].startswith('#')]
        need = [i['path'] for i in subs if not isinstance(i.get('perm'), dict)]
        if need:
            try:
                got = {x['path']: x.get('perm') for x in path_info(need)}
                for i in subs:
                    if got.get(i['path']):
                        i['perm'] = got[i['path']]
            except Exception:
                pass
        for i in subs:
            rt = _acl_rights(i.get('perm'))
            if 'W' in rt or 'A' in rt:
                out.append({'path': i['path'], 'name': i['name'],
                            'share': s['name'], 'rights': rt})
    return out

# 🔎 [2026-11-04] 앱 폴더를 **사람에게 묻지 않고** 찾는다 — 팀원 전환을 "아이디·비밀번호만"
#    으로 줄이기 위한 것. 이름은 **데이터**다(코드에 박지 말 것). ⚠️ DSM 은 대소문자를 가리므로
#    후보 이름도 대소문자까지 그대로 비교한다 — `kortek_pm` 과 `KORTEK_PM` 은 다른 폴더다.
APP_FOLDER_NAMES = ['KORTEK_PM']
#    공유 바로 아래가 아니라 한 단계 더 들어가 있는 경우가 흔하다(`/공유/100_연구공통/KORTEK_PM`).
#    ⚠️ 깊이·조회 상한을 둔다 — 공유가 많은 NAS 에서 전수 조회는 수백 번 왕복이 된다(1회 61ms).
#    ⚠️ 실측(2026-11-04, 이 회사 NAS): 폴더 31곳을 열어 2.4초에 1건을 찾았다 — 상한이 40 이면
#    여유가 9곳뿐이라 공유가 조금만 늘어도 조용히 못 찾는다. 80 으로 두고, 상한에 걸렸으면
#    `truncated` 로 **밝힌다**(못 찾은 것과 덜 본 것은 다른 사실이다).
_APP_FIND = {'depth': 2, 'maxListings': 80}


def find_app_folder(names=None):
    """앱 폴더 후보를 찾아 돌려준다. {'hits': [경로…], 'looked': n}

    판정은 **코드**가 한다 — 1건이면 그걸 쓰고, 0건이나 2건 이상이면 사람에게 고르게 한다.
    (AI 에게 고르게 하지 않는다 — docs/ai-harness-environment.md)
    """
    want = list(names or APP_FOLDER_NAMES)
    hits, looked = [], 0
    level = []
    for s in list_shares():
        level.append(s['path'])
    for depth in range(_APP_FIND['depth']):
        nxt = []
        for p in level:
            if looked >= _APP_FIND['maxListings']:
                break
            looked += 1
            try:
                items = list_folder(p, limit=300)['items']
            except Exception:
                continue                       # 권한 없는 폴더는 건너뛰고 계속(ACL 은 정상 동작)
            for i in items:
                if not i['isdir'] or i['name'].startswith('#'):
                    continue
                if i['name'] in want:
                    rt = _acl_rights(i.get('perm'))
                    if (not rt) or 'W' in rt or 'A' in rt:
                        if i['path'] not in hits:
                            hits.append(i['path'])
                else:
                    nxt.append(i['path'])
        level = nxt
    return {'hits': hits, 'looked': looked,
            'truncated': looked >= _APP_FIND['maxListings']}


def unc_of(path):
    """NAS 절대경로(`/공유/하위…`) → 윈도 UNC(`\\호스트\공유\하위…`).

    문서 저장소(사양서·도면)는 브라우저가 아니라 **윈도가 직접 읽는** 경로라서, 같은 폴더를
    두 가지 주소로 가리킨다. 사람이 둘을 따로 적게 하지 않는다 — 하나에서 만든다.
    """
    p = str(path or '').replace(chr(92), '/').strip('/')
    cfg = load_config()
    if not cfg or not p:
        return ''
    return (chr(92) * 2) + cfg['host'] + chr(92) + p.replace('/', chr(92))


def abs_path(rel, team=None):
    """앱 루트 기준 상대경로 → NAS 절대경로. team 을 주면 팀 파일 경로로 만든다."""
    root, team_root = roots()
    rel = _norm_rel(rel)
    base = root
    if team:
        base = '%s/%s' % (team_root, _norm_rel(team))
    return ('%s/%s' % (base, rel)) if rel else base


def config_path(name):
    """공용 설정 파일(주소록·project_index 등) 경로."""
    return abs_path('%s/%s' % (_LAYOUT['config'], _norm_rel(name)))


def team_path(team, name=''):
    """팀 파일(프로젝트 JSON 등) 경로. 1단계에선 공용 루트 아래 <팀>/ 이 된다."""
    return abs_path(name, team=team)


_FOLDER_OK = set()      # 이번 프로세스에서 이미 보장한 폴더 (호출 1회 = 61ms 라 중복이 비싸다)


def ensure_folder(path, cache=True):
    """폴더를 보장한다(없으면 중간 단계까지 만든다). 이미 있으면 조용히 통과.

    ⚡ 같은 폴더에 반복해 쓰는 경로(자동저장)에서 매번 묻지 않도록 기억한다.
       폴더가 사라지는 일은 드물고, 사라졌으면 그다음 업로드가 실패하며 드러난다.
       (틀렸을 때 조용히 넘어가지 않으므로 캐시해도 안전하다)
    """
    cfg = _cfg_or_raise()
    key = str(path).replace(chr(92), '/').rstrip('/')
    if cache and key in _FOLDER_OK:
        return key
    path = str(path).replace(chr(92), '/').rstrip('/')
    if '/' not in path.strip('/'):
        raise ValueError('공유 루트는 만들 수 없습니다: %s' % path)
    parent, name = path.rsplit('/', 1)
    try:
        _call(cfg, 'SYNO.FileStation.CreateFolder', 'create', 2,
              {'folder_path': parent, 'name': name, 'force_parent': 'true'}, post=True)
    except RuntimeError as e:
        # 이미 있으면 414(같은 이름이 이미 있음) — 성공으로 본다.
        if '이미 있습니다' not in str(e):
            raise
    if cache:
        _FOLDER_OK.add(key)
    return path


def _upload(folder, name, data, overwrite=True, timeout=180):
    """multipart 업로드 1회. `_call` 과 content-type 이 달라 따로 둔다."""
    cfg = _cfg_or_raise()
    url = origin_of(cfg) + '/webapi/entry.cgi'
    form = {'api': 'SYNO.FileStation.Upload', 'version': '2', 'method': 'upload',
            'path': folder, 'create_parents': 'true',
            'overwrite': 'true' if overwrite else 'false', '_sid': _SESSION['sid']}
    files = {'file': (name, data, 'application/octet-stream')}
    r = _http().post(url, data=form, files=files, timeout=timeout, verify=False)
    r.raise_for_status()
    j = r.json()
    if not j.get('success'):
        code = (j.get('error') or {}).get('code')
        raise RuntimeError('NAS 업로드 실패 — %s' % _msg(code, 'SYNO.FileStation.Upload'))
    return True


def _move_over(src, dest_folder, timeout=20.0):
    """src 를 dest_folder 로 **덮어쓰며** 옮긴다(서버 측). 끝날 때까지 폴링."""
    cfg = _cfg_or_raise()
    d = _call(cfg, 'SYNO.FileStation.CopyMove', 'start', 3,
              {'path': json.dumps([src], ensure_ascii=False), 'dest_folder_path': dest_folder,
               'overwrite': 'true', 'remove_src': 'true', 'accurate_progress': 'false'},
              post=True)
    task = (d or {}).get('taskid')
    if not task:
        return True            # 즉시 끝난 경우
    # ⚠️ 고정 sleep 이 아니라 **끝났다는 신호를 폴링**한다. 상한만 둔다(기존 방식과 같은 원칙).
    deadline = time.time() + timeout
    while time.time() < deadline:
        st = _call(cfg, 'SYNO.FileStation.CopyMove', 'status', 3, {'taskid': task})
        if (st or {}).get('finished'):
            if (st or {}).get('has_fail'):
                raise RuntimeError('NAS 이동 실패 — 대상 폴더 권한이나 이름을 확인하세요.')
            return True
        time.sleep(0.05)
    raise RuntimeError('NAS 이동이 %.0f초 안에 끝나지 않았습니다.' % timeout)


def put(path, data, atomic=True):
    """파일 하나를 쓴다. **기본은 원자적 교체** — 임시 이름으로 올린 뒤 덮어쓰며 옮긴다.

    왜 원자적이어야 하나: 그냥 덮어쓰면 중간에 끊겼을 때 **반쪽 파일**이 남는다.
      사양서는 견딜 만하지만 프로젝트 JSON 은 그 자체가 데이터 전부라 못 견딘다.
      (기존 `/doc/put` 은 `f.save(fp)` 로 목적지에 직접 쓴다 — 그래서 여기선 안 쓴다)
    """
    if isinstance(data, str):
        data = data.encode('utf-8')
    path = str(path).replace(chr(92), '/').rstrip('/')
    folder, name = path.rsplit('/', 1)
    ensure_folder(folder)
    if not atomic:
        _upload(folder, name, data)
        _verify_written(path, len(data))
        return {'ok': True, 'path': path, 'bytes': len(data), 'atomic': False}

    # ⚠️⚠️ CopyMove 는 **파일 이름을 유지**한다 — 이름을 바꾸는 기능이 아니다.
    #   처음엔 `folder/name.tmp-xxx` 를 `folder` 로 옮겨 최종 이름이 되길 기대했는데,
    #   그건 **자기 자신으로 옮기는 no-op** 이었다. 그래서 최종 파일이 한 번도 안 생겼고,
    #   `put` 은 'ok' 를 돌려줬다. 게다가 DSM 은 **없는 파일 다운로드에 502** 를 주므로
    #   "NAS 다운로드가 전역으로 깨졌다"로 오진하기까지 했다.
    #   → 올바른 방법: **임시 폴더에 최종 이름으로** 올리고, 그 파일을 대상 폴더로
    #     `overwrite=true` 로 옮긴다. 이름이 이미 최종 이름이라 이동만으로 교체가 된다.
    # ⚡ 임시 폴더는 **프로세스당 하나**를 재사용한다(이름에 고유 태그가 붙어 PC·프로세스끼리
    #    절대 겹치지 않는다). 쓰기마다 만들고 지우면 호출이 2번 더 늘고, 호출 1회가 61ms 다.
    #    같은 파일에 동시에 쓰는 경우만 프로세스 안에서 잠근다.
    tmpdir = _proc_tmpdir(folder)
    with _path_lock('%s/%s' % (tmpdir, name)):
        _upload(tmpdir, name, data, overwrite=True)
        try:
            _move_over('%s/%s' % (tmpdir, name), folder)
        except Exception:
            try:                  # 실패하면 임시 파일만 치운다(폴더는 재사용하므로 남긴다)
                remove('%s/%s' % (tmpdir, name))
            except Exception:
                pass
            raise
    _verify_written(path, len(data))
    return {'ok': True, 'path': path, 'bytes': len(data), 'atomic': True}


# 프로세스마다 고유한 임시 폴더 태그. 다른 PC·다른 프로세스와 절대 겹치지 않는다.
_PROC_TAG = '%d-%s' % (os.getpid(), uuid.uuid4().hex[:6])
_PATH_LOCKS = {}


def _proc_tmpdir(folder):
    d = '%s/.ganttput-%s' % (folder, _PROC_TAG)
    ensure_folder(d)              # 캐시되므로 두 번째부터는 호출이 없다
    return d


def _path_lock(key):
    with _LOCK:
        lk = _PATH_LOCKS.get(key)
        if lk is None:
            lk = _PATH_LOCKS[key] = threading.Lock()
    return lk


def cleanup_tmpdirs(folder, stale_sec=600):
    """`.ganttput-*` 임시 폴더를 치운다. 프로세스가 중간에 죽으면 남는다(실측 확인).

    ⚠️ **다른 프로세스가 지금 쓰고 있을 수 있다.** 그래서 지우는 건 둘뿐이다:
       ① 내 태그 (내가 만든 것)
       ② **비어 있고** 마지막 수정이 `stale_sec` 보다 오래된 것
          — 쓰기 중인 임시 폴더는 1초 미만 동안만 파일을 들고 있으므로,
            "비었고 오래됐다"면 쓰는 중일 수 없다. 둘 중 하나라도 아니면 건드리지 않는다.
       (내 태그만 지우던 처음 판은 **죽은 프로세스의 폴더를 영원히 남겼다**)
    """
    removed, kept = [], []
    now = time.time()
    for it in list_folder(folder, limit=500)['items']:
        if not it['isdir'] or not it['name'].startswith('.ganttput-'):
            continue
        mine = it['name'] == '.ganttput-%s' % _PROC_TAG
        if not mine:
            try:
                inside = list_folder(it['path'], limit=5)['items']
            except Exception:
                kept.append(it['name'])
                continue
            mt = it.get('mtime') or 0
            if inside or (mt and (now - mt) < stale_sec):
                kept.append(it['name'])     # 비지 않았거나 최근 = 쓰는 중일 수 있다
                continue
        try:
            remove(it['path'])
            removed.append(it['name'])
        except Exception:
            kept.append(it['name'])
    return {'removed': removed, 'kept': kept}


def _verify_written(path, nbytes):
    """쓴 뒤 **정말 그 자리에 그 크기로 있는지** 확인한다.

    왜 매번 확인하나: 위 no-op 사고에서 `put` 은 아무것도 안 하고 'ok' 를 돌려줬다.
      반환값은 증거가 아니다. 한 번 더 묻는 비용(한 호출, 약 60ms)이
      "저장된 줄 알았는데 안 저장됨"보다 훨씬 싸다.
    """
    try:
        info = path_info(path)
    except Exception as e:
        raise RuntimeError('썼다고 했지만 확인에 실패했습니다(%s): %s' % (path, e))
    if not info:
        raise RuntimeError('썼다고 했지만 그 자리에 파일이 없습니다: %s' % path)
    return True


def remove(path, verify=True):
    """파일/폴더 삭제(되돌릴 수 없다). 부르는 쪽이 확인을 받았는지 책임진다.

    ⚠️ `delete` 는 **성공을 돌려주면서 안 지우는 경우가 있었다**(2026-11-03 실측:
       공백이 든 경로의 하위 폴더). 그래서 지운 뒤 **정말 없어졌는지 확인**하고,
       남아 있으면 비동기 `start`+`status` 경로로 한 번 더 시도한다.
       "지웠다"고 말했는데 남아 있는 상태를 만들지 않는 게 요점이다.
    """
    cfg = _cfg_or_raise()
    pj = json.dumps([path], ensure_ascii=False)
    _call(cfg, 'SYNO.FileStation.Delete', 'delete', 2,
          {'path': pj, 'recursive': 'true'}, post=True, timeout=120)
    if not verify:
        return {'ok': True, 'path': path, 'verified': False}
    if not exists(path):
        return {'ok': True, 'path': path, 'verified': True}

    # 블로킹 delete 가 조용히 실패했다 → 비동기 경로로 재시도(사람이 시킨 삭제이므로 1회 더는 허용)
    d = _call(cfg, 'SYNO.FileStation.Delete', 'start', 2,
              {'path': pj, 'recursive': 'true'}, post=True)
    task = (d or {}).get('taskid')
    if task:
        deadline = time.time() + 60
        while time.time() < deadline:
            st = _call(cfg, 'SYNO.FileStation.Delete', 'status', 2, {'taskid': task})
            if (st or {}).get('finished'):
                break
            time.sleep(0.05)
    if exists(path):
        raise RuntimeError('삭제했다고 응답했지만 그 자리에 아직 남아 있습니다: %s' % path)
    return {'ok': True, 'path': path, 'verified': True, 'async': True}


def exists(path):
    try:
        return bool(path_info(path))
    except Exception:
        return False


def rename(path, new_name):
    """이름만 바꾼다. 내용은 **건드리지 않는다**(서버 쪽 한 번의 호출이라 즉시 끝난다).

    ⚠️ `CopyMove` 로는 이름을 못 바꾼다 — 그건 **이름을 유지한 채 옮기는** 것이다
       (2026-11-03에 그걸 몰라 원자적 쓰기가 no-op 였다). 이름 바꾸기는 `Rename` 이다.
    ⚠️ 바꾼 뒤 **정말 그 이름으로 있는지 확인**한다. "바꿨다"는 응답은 증거가 아니다.
    """
    cfg = _cfg_or_raise()
    new_name = str(new_name).strip()
    if not new_name or '/' in new_name or chr(92) in new_name:
        raise ValueError('새 이름에 경로 구분자를 넣을 수 없습니다: %s' % new_name)
    _call(cfg, 'SYNO.FileStation.Rename', 'rename', 2,
          {'path': path, 'name': new_name}, post=True)
    parent = path.rstrip('/').rsplit('/', 1)[0]
    dest = parent + '/' + new_name
    if not exists(dest):
        raise RuntimeError('이름을 바꿨다고 응답했지만 그 이름이 없습니다: %s' % dest)
    _FOLDER_OK.discard(path)
    return dest
