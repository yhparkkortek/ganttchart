# -*- coding: utf-8 -*-
"""🏢 그룹웨어(다우오피스) 브릿지 — 크롬을 CDP로 몰아 그룹웨어 내부 REST API를 읽는다.

## 왜 이 방식인가 (2026-10-16 실측으로 확정)
 · `gw.kortek.co.kr`은 **다우오피스**이고 `/api/*` 내부 REST API를 쓴다. 로그인 세션 쿠키만
   있으면 그 API가 그대로 JSON을 준다 — DOM 스크래핑이 아니라서 화면이 개편돼도 안 깨진다.
 · OAuth 클라이언트(전산팀 발급)를 기다릴 필요가 없다. **사람이 브라우저에서 한 번 로그인**하면
   그 세션으로 읽는다.
 · Playwright/Selenium을 쓰지 않는다. 이미 깔린 크롬 + `requests`/`websockets`(이미 의존성에
   있음)로 CDP를 직접 말한다 → 팀 배포 시 150MB 브라우저 바이너리를 각 PC에 안 받아도 된다.

## 안전 원칙 (SAP 로그인에서 세운 것과 동일)
 · **자동 로그인을 하지 않는다.** 로그인은 사람이 직접 한다. 실측상 이 사이트는 로그인에
   실패해야 CAPTCHA가 나타나는 구조라, 자동 로그인을 돌리면 실패가 쌓일 때 CAPTCHA에 막히고
   그 다음은 계정 잠금이다. 사내 통합 계정이 잠기면 메일·결재까지 같이 멈춘다.
 · **전용 크롬 프로필**(`%LOCALAPPDATA%\\KortekGW\\cdp-profile`)을 쓴다. 사용자의 기본 프로필에
   붙으면 ① 크롬이 이미 떠 있을 때 원격 디버깅이 거부되고 ② 그룹웨어 말고 로그인된 모든
   사이트가 조작 범위에 들어온다. 전용 프로필이면 사고 범위가 그룹웨어로 한정된다.
 · **읽기 전용.** 이 모듈은 GET만 보낸다. 쓰기(일정 등록·결재 상신)는 올리는 즉시 남에게
   보이므로 별도 확인 절차 없이 넣지 않는다.

## API 경로를 알아낸 방법
추측한 경로는 12개 전부 404였다. CDP Network 도메인으로 **그룹웨어가 자기 화면을 그리려고
실제로 보내는 요청**을 관찰해서 확정했다. 새 기능이 필요하면 같은 방법을 쓸 것.
"""
import asyncio
import json
import os
import subprocess
import time

import requests

CDP_PORT   = 9222
CDP_BASE   = f'http://127.0.0.1:{CDP_PORT}'
GW_ORIGIN  = 'https://gw.kortek.co.kr'
GW_PROFILE = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')),
                          'KortekGW', 'cdp-profile')
_CHROME_CANDIDATES = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
]


def _chrome_exe():
    for p in _CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def chrome_alive():
    try:
        return requests.get(f'{CDP_BASE}/json/version', timeout=2).json()
    except Exception:
        return None


def launch_chrome(wait=15):
    """전용 프로필로 크롬을 띄운다. 이미 떠 있으면 그대로 쓴다."""
    if chrome_alive():
        return True, '이미 실행 중'
    exe = _chrome_exe()
    if not exe:
        return False, '크롬/엣지를 찾지 못했습니다.'
    os.makedirs(GW_PROFILE, exist_ok=True)
    subprocess.Popen(
        [exe, f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={GW_PROFILE}',
         '--no-first-run', '--no-default-browser-check', GW_ORIGIN],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(int(wait / 0.5)):
        time.sleep(0.5)
        if chrome_alive():
            return True, '실행됨'
    return False, '크롬이 디버그 포트로 뜨지 않았습니다.'


def _gw_page():
    """그룹웨어가 열린 탭을 찾는다. 없으면 새 탭으로 연다."""
    try:
        tabs = requests.get(f'{CDP_BASE}/json/list', timeout=5).json()
    except Exception:
        return None
    for t in tabs:
        if t.get('type') == 'page' and 'gw.kortek.co.kr' in (t.get('url') or ''):
            return t
    try:
        requests.put(f'{CDP_BASE}/json/new?{GW_ORIGIN}', timeout=5)
    except Exception:
        try:
            requests.get(f'{CDP_BASE}/json/new?{GW_ORIGIN}', timeout=5)
        except Exception:
            return None
    for _ in range(20):
        time.sleep(0.5)
        try:
            for t in requests.get(f'{CDP_BASE}/json/list', timeout=5).json():
                if t.get('type') == 'page' and 'gw.kortek.co.kr' in (t.get('url') or ''):
                    return t
        except Exception:
            pass
    return None


async def _eval(ws_url, expr, timeout=45):
    import websockets
    async with websockets.connect(ws_url, max_size=80_000_000) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {
            'expression': expr, 'returnByValue': True, 'awaitPromise': True}}))
        while True:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
            if msg.get('id') == 1:
                r = msg.get('result', {})
                if 'exceptionDetails' in r:
                    raise RuntimeError(str(r['exceptionDetails'].get('text'))[:200])
                return r.get('result', {}).get('value')


def eval_in_gw(expr, timeout=45):
    """그룹웨어 페이지 컨텍스트에서 JS를 실행한다(= 세션 쿠키가 실린 상태)."""
    t = _gw_page()
    if not t:
        raise RuntimeError('그룹웨어 탭을 열지 못했습니다 — 크롬이 떠 있는지 확인해주세요.')
    return asyncio.run(_eval(t['webSocketDebuggerUrl'], expr, timeout))


# 내부 API를 페이지 컨텍스트에서 호출한다(same-origin이라 세션 쿠키가 자동으로 붙는다).
# ⚠️ GET 전용. 쓰기는 이 모듈에서 하지 않는다.
_GET_JSON = """
(async () => {
  const r = await fetch(%s, { credentials:'same-origin', headers:{ Accept:'application/json' } });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !ct.includes('json')) {
    return { __err: true, status: r.status, body: (await r.text()).slice(0, 200) };
  }
  return await r.json();
})()
"""


def gw_get(path, timeout=45):
    if not path.startswith('/'):
        raise ValueError('경로는 /로 시작해야 합니다.')
    res = eval_in_gw(_GET_JSON % json.dumps(path), timeout)
    if isinstance(res, dict) and res.get('__err'):
        raise RuntimeError(f'그룹웨어 API {path} → HTTP {res.get("status")}: {res.get("body")}')
    return res


# ── 1회 자동 로그인 ──────────────────────────────────────────────────
# ⚠️⚠️ 설계 전제(2026-10-16 실측): 이 사이트는 **로그인에 실패해야 CAPTCHA가 나타난다**
#   (평소엔 `#captcha`가 display:none). 그래서 규칙은 단 하나다 —
#   **딱 한 번만 시도하고, 실패하면 그 자리에서 멈춰 사람에게 넘긴다.**
#   재시도하면 실패가 쌓여 CAPTCHA에 막히고, 그다음은 사내 통합 계정 잠금이다.
#   그룹웨어 계정이 잠기면 메일·전자결재까지 같이 멈춘다(SAP보다 파장이 크다).
# 비밀번호는 Windows DPAPI로 암호화해 `gw_login_config.json`(.gitignore)에만 둔다.
# 명령줄·로그·HTTP 응답 어디에도 비밀번호를 싣지 않는다.
GW_LOGIN_CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gw_login_config.json')


def _dpapi_decrypt_b64(b64):
    import base64
    import ctypes
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
    raw = base64.b64decode(b64)
    buf = ctypes.create_string_buffer(raw, len(raw))
    bin_ = _BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    bout = _BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(bin_), None, None, None, None, 0, ctypes.byref(bout)):
        raise RuntimeError('저장된 그룹웨어 비밀번호를 복호화하지 못했습니다'
                           '(다른 Windows 계정/PC에서 저장한 설정일 수 있음) — 다시 저장해주세요.')
    try:
        return ctypes.string_at(bout.pbData, bout.cbData).decode('utf-8')
    finally:
        ctypes.windll.kernel32.LocalFree(bout.pbData)


def load_login_config():
    try:
        with open(GW_LOGIN_CFG, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    except Exception:
        return None
    if not isinstance(cfg, dict) or not cfg.get('user') or not cfg.get('pw_dpapi'):
        return None
    return cfg


# 로그인 폼을 채우고 제출한 뒤 **결과만** 돌려준다. 재시도는 절대 하지 않는다.
_LOGIN_JS = """
(async (user, pw) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (!location.pathname.startsWith('/login')) location.href = '/login';
  for (let i = 0; i < 40 && !document.querySelector('#username'); i++) await sleep(250);

  const u = document.querySelector('#username');
  const p = document.querySelector('#password');
  if (!u || !p) return { result: 'no_form' };

  // 이미 CAPTCHA가 떠 있으면 시도 자체를 하지 않는다(실패가 이미 쌓인 상태)
  const cap = document.querySelector('#captcha');
  const capShown = !!(cap && cap.offsetParent !== null);
  if (capShown) return { result: 'captcha_blocked' };

  const set = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set(u, user); set(p, pw);

  const form = u.closest('form');
  if (form) {
    const btn = form.querySelector('button[type=submit],input[type=submit]');
    if (btn) btn.click(); else form.submit();
  } else return { result: 'no_form' };

  // 결과 대기 — 성공하면 /login 을 벗어난다
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    if (!location.pathname.startsWith('/login')) return { result: 'ok', url: location.href };
    const c2 = document.querySelector('#captcha');
    if (c2 && c2.offsetParent !== null) return { result: 'captcha_appeared' };
  }
  const err = document.querySelector('.alert,.error,[class*=error]');
  return { result: 'failed', message: err ? (err.textContent || '').trim().slice(0, 120) : '' };
})(%s, %s)
"""


def login_once():
    """저장된 계정으로 **한 번만** 로그인한다.

    반환 result:
      already   이미 로그인돼 있음(아무것도 하지 않음)
      ok        로그인 성공
      그 외     실패 — **재시도하지 않고** 사람에게 넘긴다(창은 열어둔 채로)
    """
    if not chrome_alive():
        ok, msg = launch_chrome()
        if not ok:
            return {'ok': False, 'result': 'chrome', 'message': msg}

    s = session_info()
    if s.get('ok'):
        return {'ok': True, 'result': 'already', 'message': '이미 로그인되어 있습니다.', 'session': s}

    cfg = load_login_config()
    if not cfg:
        return {'ok': False, 'result': 'not_configured',
                'message': '저장된 그룹웨어 로그인 정보가 없습니다 — 🔑에서 먼저 등록해주세요.'}

    try:
        pw = _dpapi_decrypt_b64(cfg['pw_dpapi'])
    except Exception as e:
        return {'ok': False, 'result': 'decrypt', 'message': str(e)}

    try:
        r = eval_in_gw(_LOGIN_JS % (json.dumps(cfg['user']), json.dumps(pw)), timeout=60) or {}
    except Exception as e:
        return {'ok': False, 'result': 'error', 'message': f'로그인 시도 중 오류: {e}'}
    finally:
        pw = None  # 메모리에 더 들고 있지 않는다

    res = r.get('result')
    if res == 'ok':
        return {'ok': True, 'result': 'ok', 'message': '로그인했습니다.', 'session': session_info()}

    # ⚠️ 여기부터는 전부 실패 경로 — 어떤 경우에도 다시 시도하지 않는다.
    human = {
        'captcha_blocked':  '이미 보안문자(CAPTCHA)가 떠 있습니다 — 자동 로그인을 시도하지 않았습니다. 열린 창에서 직접 로그인해주세요.',
        'captcha_appeared': '로그인에 실패해 보안문자(CAPTCHA)가 나타났습니다 — 계정 잠금을 막기 위해 재시도하지 않습니다. 열린 창에서 직접 로그인해주세요.',
        'failed':           '로그인에 실패했습니다 — 계정 잠금을 막기 위해 재시도하지 않습니다. 열린 창에서 직접 로그인해주세요.',
        'no_form':          '로그인 화면을 찾지 못했습니다 — 열린 창에서 직접 로그인해주세요.',
    }.get(res, '로그인하지 못했습니다 — 열린 창에서 직접 로그인해주세요.')
    if r.get('message'):
        human += f' (서버 메시지: {r["message"]})'
    return {'ok': False, 'result': res or 'failed', 'message': human, 'handoff': True}


def session_info():
    """로그인 상태 + 내 계정 정보. 세션이 끊겼으면 ok=False."""
    if not chrome_alive():
        return {'ok': False, 'reason': 'chrome_down', 'message': '그룹웨어 브라우저가 실행되고 있지 않습니다.'}
    try:
        j = gw_get('/api/user/session', timeout=20)
    except Exception as e:
        return {'ok': False, 'reason': 'no_session', 'message': f'세션 확인 실패: {e}'}
    d = (j or {}).get('data') or {}
    if not d.get('id'):
        return {'ok': False, 'reason': 'no_session', 'message': '로그인이 필요합니다.'}
    comp = (d.get('companies') or [{}])[0]
    return {'ok': True, 'userId': d.get('id'), 'email': d.get('email'),
            'loginId': comp.get('userLoginId'), 'company': comp.get('companyName')}


def calendars():
    """내가 쓰는 캘린더 목록 — id를 하드코딩하지 않기 위해 매번 세션에서 얻는다."""
    s = session_info()
    if not s.get('ok'):
        raise RuntimeError(s.get('message') or '로그인이 필요합니다.')
    j = gw_get(f'/api/calendar/user/{s["userId"]}/calendar')
    out = []
    for c in (j or {}).get('data') or []:
        if c.get('id'):
            out.append({'id': c['id'], 'name': c.get('name') or '',
                        'type': c.get('type') or 'normal',
                        'default': bool(c.get('defaultCalendar'))})
    return out


def events(date_from, date_to, calendar_ids=None):
    """기간 내 일정. `date_from/to`는 'YYYY-MM-DD'.

    ⚠️ `calendarIds[]` 배열 파라미터가 **필수**다 — 빼면 서버가 500을 던진다(실측).
       `includingAttendees=true`도 실제 화면이 보내는 그대로 맞춘다."""
    cals = calendar_ids if calendar_ids else [c['id'] for c in calendars()]
    if not cals:
        return []
    t_min = f'{date_from}T00:00:00.000+09:00'
    t_max = f'{date_to}T23:59:59.999+09:00'
    from urllib.parse import quote
    qs = (f'/api/calendar/event?timeMin={quote(t_min, safe="")}'
          f'&timeMax={quote(t_max, safe="")}&includingAttendees=true'
          + ''.join(f'&calendarIds%5B%5D={int(c)}' for c in cals))
    j = gw_get(qs, timeout=60)
    out = []
    for e in (j or {}).get('data') or []:
        out.append({
            'id':        str(e.get('id') or ''),
            'title':     e.get('summary') or '',
            'calendar':  e.get('calendarName') or '',
            'calendarId': e.get('calendarId'),
            'color':     e.get('color') or '',
            'type':      e.get('type') or '',
            'start':     e.get('startTime') or '',
            'end':       e.get('endTime') or '',
            'allDay':    (e.get('timeType') == 'allday'),
            'location':  e.get('location') or '',
            'creator':   ((e.get('creator') or {}).get('name') or ''),
            'description': (e.get('description') or '')[:500],
        })
    return out
