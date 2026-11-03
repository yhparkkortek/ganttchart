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
# 실패가 쌓이면 IP 가 차단되므로, 한 번 실패하면 "사람이 다시 시킬 때까지" 잠근다.
_BLOCKED = {'reason': None}

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


def save_config(host, port, use_https, user, password):
    """비밀번호를 비워 보내면 기존 값을 유지한다(다른 항목만 수정)."""
    old = load_config() or {}
    pw_enc = old.get('pw_dpapi')
    if password:
        pw_enc = _dpapi_encrypt_b64(password)
    if not pw_enc:
        raise ValueError('비밀번호가 필요합니다.')
    cfg = {'host': str(host).strip(), 'port': int(port), 'https': bool(use_https),
           'user': str(user).strip(), 'pw_dpapi': pw_enc}
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
        raise RuntimeError('NAS %s.%s 실패 — %s' % (api, method, _msg(code, api)))
    return j.get('data')


def is_blocked():
    return _BLOCKED['reason']


def reset_block():
    _BLOCKED['reason'] = None


def status():
    """로그인 상태. 로그인 시도는 하지 않는다."""
    cfg = load_config()
    if not cfg:
        return {'ok': False, 'configured': False, 'reason': 'not_configured',
                'message': 'NAS 로그인 정보가 저장되어 있지 않습니다.'}
    out = {'configured': True, 'host': cfg['host'], 'port': cfg['port'],
           'https': cfg['https'], 'user': cfg['user']}
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
    """저장된 계정으로 **한 번만** 로그인한다.

    ⚠️ 실패하면 `_BLOCKED` 에 적고 다시 시도하지 않는다 — DSM 은 실패가 쌓이면 IP 를 차단한다.
       사람이 설정을 다시 저장하거나 `reset_block()` 을 부를 때까지 잠긴 채로 둔다.
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
        except Exception as e:
            _BLOCKED['reason'] = str(e)
            return {'ok': False, 'result': 'failed', 'retryable': False, 'message': str(e)}
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
                    'mtime': (a.get('time') or {}).get('mtime')})
    return {'path': path, 'count': len(out), 'items': out, 'total': (d or {}).get('total')}


def download(path, timeout=120):
    """파일 하나를 바이트로. 큰 파일은 호출하는 쪽이 알아서 쓸 것."""
    cfg = _cfg_or_raise()
    r = _call(cfg, 'SYNO.FileStation.Download', 'download', 2,
              {'path': path, 'mode': 'download'}, stream=True, timeout=timeout)
    return r.content
