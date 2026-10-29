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
import datetime
import json
import os
import re
import subprocess
import time
import urllib.parse

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


def _disable_https_upgrade_pref():
    """프로필에 "http 를 https 로 올리지 말 것"을 기록한다.

    ⚠️ **크롬이 떠 있는 동안 쓰면 종료할 때 덮어쓴다** — 그래서 launch_chrome 안,
       Popen 직전(=크롬이 죽어 있는 시점)에만 부른다.
    실행 플래그만으로도 되지만 플래그 이름은 크롬 버전마다 바뀌므로 설정도 같이 남긴다.
    """
    path = os.path.join(GW_PROFILE, 'Default', 'Preferences')
    try:
        if not os.path.exists(path):
            return False                      # 첫 실행 — 프로필이 생긴 뒤 다음 기회에 기록된다
        with open(path, 'r', encoding='utf-8') as f:
            prefs = json.load(f)
        prof = prefs.setdefault('profile', {})
        if (prof.get('https_only_mode_enabled') is False
                and prof.get('https_first_balanced_mode_enabled') is False):
            return False                      # 이미 꺼져 있음
        prof['https_only_mode_enabled'] = False
        prof['https_first_balanced_mode_enabled'] = False
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(prefs, f)
        return True
    except Exception:
        return False                          # 설정 기록 실패는 치명적이지 않다 — 플래그가 남아 있다


def chrome_restart(wait=20):
    """전용 크롬을 닫았다 다시 띄운다 — http 차단(HTTPS 자동승격) 해제를 적용할 때.

    프로필이 남으므로 로그인 쿠키는 유지된다. 사람이 보는 창을 닫는 동작이라
    **사용자가 요청할 때만** 부른다(자동 호출 금지).
    """
    v = chrome_alive()
    if v:
        # ⚠️ `/json/close/<id>`는 **탭**만 닫는다. 브라우저 자체는 `/json/version` 이 주는
        #    **브라우저 레벨 웹소켓**으로 `Browser.close` 를 보내야 닫힌다(실측: 없는 경로로
        #    요청하면 조용히 아무 일도 안 일어나고 "닫히지 않았습니다"만 남는다).
        async def _close(ws_url):
            import websockets
            async with websockets.connect(ws_url) as ws:
                await ws.send(json.dumps({'id': 1, 'method': 'Browser.close'}))
                try:
                    await asyncio.wait_for(ws.recv(), timeout=5)
                except Exception:
                    pass                      # 닫히면서 소켓이 끊기는 게 정상이다
        try:
            asyncio.new_event_loop().run_until_complete(_close(v['webSocketDebuggerUrl']))
        except Exception:
            pass
        for _ in range(int(wait / 0.5)):      # 완전히 죽어야 Preferences 를 쓸 수 있다
            time.sleep(0.5)
            if not chrome_alive():
                break
        else:
            return {'ok': False, 'message': '전용 크롬이 닫히지 않았습니다 — 창을 직접 닫고 다시 시도해주세요.'}
    ok, msg = launch_chrome(wait=wait)
    return {'ok': ok, 'message': ('전용 크롬을 다시 띄웠습니다 — http 사이트 차단이 풀립니다.'
                                  if ok else msg)}


def launch_chrome(wait=15):
    """전용 프로필로 크롬을 띄운다. 이미 떠 있으면 그대로 쓴다."""
    if chrome_alive():
        return True, '이미 실행 중'
    exe = _chrome_exe()
    if not exe:
        return False, '크롬/엣지를 찾지 못했습니다.'
    os.makedirs(GW_PROFILE, exist_ok=True)
    _disable_https_upgrade_pref()
    subprocess.Popen(
        [exe, f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={GW_PROFILE}',
         '--no-first-run', '--no-default-browser-check',
         # ⚠️⚠️ [2026-10-21 실사용] 인사관리는 **http 전용**(insa.kortek.co.kr)인데 요즘 크롬은
         #    기본으로 https 로 올려 시도하고 실패하면 "이 사이트는 보안 연결을 지원하지 않습니다"
         #    차단 화면(chrome-error://chromewebdata/)을 띄운다. 그러면 그 탭엔 DOM 이 없어
         #    로그인 폼을 못 찾고, 자동 로그인이 "로그인 화면을 찾지 못했습니다"로 끝난다.
         #    기능 플래그와 프로필 설정을 **둘 다** 끈다(플래그 이름은 크롬 버전마다 바뀐다).
         '--disable-features=HttpsUpgrades,HttpsFirstBalancedMode,HttpsFirstModeV2',
         GW_ORIGIN],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(int(wait / 0.5)):
        time.sleep(0.5)
        if chrome_alive():
            return True, '실행됨'
    return False, '크롬이 디버그 포트로 뜨지 않았습니다.'


def _page_for(host, origin):
    """그 사이트가 열린 탭을 찾는다. 없으면 새 탭으로 연다.

    🧩 [2026-10-21] 원래 그룹웨어 전용(`_gw_page`)이었는데, **인사관리(kInsa)도 같은
       전용 크롬에서 열어야 한다**는 요청으로 host/origin 을 받도록 일반화했다.
       `_gw_page()`는 이 함수를 그대로 부르는 얇은 껍데기라 그룹웨어 동작은 그대로다.
    """
    try:
        tabs = requests.get(f'{CDP_BASE}/json/list', timeout=5).json()
    except Exception:
        return None
    for t in tabs:
        if t.get('type') == 'page' and host in (t.get('url') or ''):
            return t
    try:
        requests.put(f'{CDP_BASE}/json/new?{origin}', timeout=5)
    except Exception:
        try:
            requests.get(f'{CDP_BASE}/json/new?{origin}', timeout=5)
        except Exception:
            return None
    for _ in range(20):
        time.sleep(0.5)
        try:
            for t in requests.get(f'{CDP_BASE}/json/list', timeout=5).json():
                if t.get('type') == 'page' and host in (t.get('url') or ''):
                    return t
        except Exception:
            pass
    return None


def _gw_page():
    """그룹웨어가 열린 탭을 찾는다. 없으면 새 탭으로 연다."""
    return _page_for('gw.kortek.co.kr', GW_ORIGIN)


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


async def _ws_call(ws, mid, method, params, timeout):
    await ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
    while True:
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
        if msg.get('id') == mid:
            if 'error' in msg:
                raise RuntimeError(str(msg['error'])[:200])
            return msg.get('result', {})


async def _window_state(ws_url, state=None, timeout=30):
    """창 상태를 읽고(state=None), 주면 그 상태로 바꾼다. 이전 상태를 돌려준다."""
    import websockets
    async with websockets.connect(ws_url, max_size=8_000_000) as ws:
        w = await _ws_call(ws, 1, 'Browser.getWindowForTarget', {}, timeout)
        prev = (w.get('bounds') or {}).get('windowState')
        if state and prev != state:
            await _ws_call(ws, 2, 'Browser.setWindowBounds',
                           {'windowId': w['windowId'], 'bounds': {'windowState': state}},
                           timeout)
            await asyncio.sleep(0.8)   # 복원 후 합성·레이아웃이 자리잡을 시간
        return prev


def gw_window_state(state=None, timeout=30):
    """그룹웨어 크롬 창의 상태를 읽거나(`None`) 바꾼다('normal'/'minimized'/…).

    ⚠️⚠️ [2026-10-19 실측] **창이 최소화돼 있으면 `click_in_gw()`의 클릭이 조용히 빗나간다.**
    CDP Input 도메인은 합성기(compositor) 히트테스트를 거치는데, 최소화된 창에는 합성된
    표면이 없어서 좌표가 아무 요소에도 닿지 않는다. **오류도 안 나고 네트워크 요청도 안
    나간다** — 겉으로는 "로그인 버튼이 안 눌린다"로만 보인다.
    실측: minimized 상태 → 클릭해도 무반응. normal로 복원 후 **같은 좌표** → `POST
    /api/login` 200, 로그인 성공. PC 재부팅 뒤 자동 로그인이 계속 실패하던 원인이 이것이다.
    → **좌표를 재기 전에** 창을 normal로 돌려놓을 것(복원하면 뷰포트 크기가 바뀌어 버튼
      위치도 달라지므로, 복원 → 측정 → 클릭 순서를 지켜야 한다).
    """
    t = _gw_page()
    if not t:
        raise RuntimeError('그룹웨어 탭을 열지 못했습니다 — 크롬이 떠 있는지 확인해주세요.')
    return asyncio.run(_window_state(t['webSocketDebuggerUrl'], state, timeout))


async def _click(ws_url, x, y, timeout=30):
    """CDP Input 도메인으로 **신뢰된**(isTrusted=true) 마우스 클릭을 보낸다."""
    import websockets
    async with websockets.connect(ws_url, max_size=8_000_000) as ws:
        for mid, typ, buttons in ((1, 'mousePressed', 1), (2, 'mouseReleased', 0)):
            await _ws_call(ws, mid, 'Input.dispatchMouseEvent',
                           {'type': typ, 'x': x, 'y': y, 'button': 'left',
                            'clickCount': 1, 'buttons': buttons}, timeout)
    return True


def click_in_gw(x, y, timeout=30):
    """그룹웨어 탭의 (x, y)를 실제 마우스처럼 클릭한다.

    ⚠️ 페이지 안에서 `el.click()`을 부르는 것과 **다르다.** 이 사이트의 로그인 버튼은
    프로그램적 클릭에 반응하지 않는다(아래 `_LOGIN_JS` 주석 참고) — 그래서 이 경로가 필요하다.
    좌표는 **뷰포트 기준**이므로, 부르기 전에 대상을 화면 안으로 스크롤해 둘 것.
    ⚠️ 그리고 창이 최소화돼 있으면 **조용히 빗나간다** — `gw_window_state('normal')`을
       먼저 부를 것(그 함수 주석에 실측 근거).
    """
    t = _gw_page()
    if not t:
        raise RuntimeError('그룹웨어 탭을 열지 못했습니다 — 크롬이 떠 있는지 확인해주세요.')
    return asyncio.run(_click(t['webSocketDebuggerUrl'], x, y, timeout))


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
# 로그인 화면이 준비됐는지만 보는 **짧은** 확인 — 이동은 절대 하지 않는다(아래 주석 참고).
_LOGIN_READY_JS = """
(() => {
  const u = document.querySelector('#username');
  const cap = document.querySelector('#captcha');
  return { path: location.pathname, ready: !!u, readyState: document.readyState,
           captcha: !!(cap && cap.offsetParent !== null) };
})()
"""


def _ensure_login_page(timeout=25):
    """로그인 폼이 뜬 화면까지 **파이썬이** 데려다 놓는다. 돌려주는 값: {ok, captcha} 또는 {ok:False, result, message}

    ⚠️⚠️ [2026-10-29 실사용 제보 — "설정창에서 누르면 되는데 AI 문답에서는 안 된다"]
       예전엔 `_LOGIN_JS` **안에서** `location.href='/login'` 으로 이동했다. 그런데 이 파일이
       이미 두 번이나 적어 둔 그대로 — **페이지가 이동하면 그 JS 의 실행 컨텍스트가 통째로
       죽는다.** 그래서 아이디/비번을 채우기도 전에 eval 이 예외로 끝났는데, 바깥에서는 그걸
       `'submitted'`(제출됨)로 잘못 보고 20초를 기다린 뒤 "로그인 실패"라고 답했다.
       서버엔 요청이 **간 적도 없는데** 프런트 게이트(js/36)는 "실패했으니 재시도 금지"로
       영구히 잠겼다. 설정창 버튼이 되는 것처럼 보였던 이유도 이것이다 — **첫 시도(AI 문답)가
       이동 비용을 치르고 죽고, 그 이동 덕분에 두 번째 시도(설정창)는 이미 /login 에 있어서
       곧바로 성공**했다. 둘은 같은 `login_once()` 를 부르므로 "방법이 다른" 게 아니었다.
    → 이동은 CDP `Page.navigate`(파이썬)로 하고, 준비 확인은 **짧은 eval 을 여러 번** 한다.
       eval 하나하나가 자기 컨텍스트에서 끝나므로 이동에 휘말리지 않는다.
    """
    t = _gw_page()
    if not t:
        return {'ok': False, 'result': 'chrome',
                'message': '그룹웨어 탭을 열지 못했습니다 — 크롬이 떠 있는지 확인해주세요.'}
    ws = t['webSocketDebuggerUrl']
    deadline, navigated = time.time() + timeout, False
    while time.time() < deadline:
        try:
            st = asyncio.run(_eval(ws, _LOGIN_READY_JS, timeout=10)) or {}
        except Exception:
            st = {}                       # 이동 중엔 잠깐 평가가 안 된다 — 기다렸다 다시 본다
        if st.get('ready'):
            return {'ok': True, 'captcha': bool(st.get('captcha'))}
        if not navigated:                 # 이동은 **한 번만** 건다(새로고침 반복 방지)
            navigated = True
            try:
                asyncio.run(_navigate(ws, GW_ORIGIN + '/login'))
            except Exception as e:
                return {'ok': False, 'result': 'nav_failed',
                        'message': f'로그인 화면으로 이동하지 못했습니다 ({e}).'}
        time.sleep(0.6)
    return {'ok': False, 'result': 'no_form',
            'message': '로그인 화면(아이디 입력칸)이 뜨지 않았습니다.'}


# ⚠️ 이 JS 는 **이미 /login 에 있는 상태**에서만 불린다(_ensure_login_page 가 보장).
#    여기서 절대 이동하지 말 것 — 이동하는 순간 이 JS 자신이 죽는다(위 주석).
_LOGIN_JS = """
(async (user, pw) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 12 && !document.querySelector('#username'); i++) await sleep(250);

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
  if (!form) return { result: 'no_form' };

  // ⚠️⚠️ [2026-10-19 버그수정] **숨겨진 제출 버튼을 누르면 아무 일도 안 일어난다.**
  //   이 사이트의 진짜 로그인 버튼은 `<a id="login_submit" class="btn_login">로그인</a>`이고,
  //   폼 안에는 `<input type="submit">`이 **숨김 상태로** 같이 들어 있다. 예전 코드가
  //   `input[type=submit]`을 먼저 집어 그 숨은 걸 클릭해서, 제출이 아예 안 됐는데도
  //   "로그인 실패"로 보고됐다(보안문자가 안 뜬 것도 실제 시도가 없었기 때문).
  //   → **보이는 요소만** 고르고, 사이트의 로그인 버튼을 최우선으로 찾는다.
  const visible = el => !!(el && el.offsetParent !== null &&
                           getComputedStyle(el).visibility !== 'hidden' &&
                           getComputedStyle(el).display !== 'none');
  const label = el => (el.textContent || el.value || '').trim();
  const cands = [...form.querySelectorAll('a,button,input[type=submit],input[type=button]')]
                  .concat([...document.querySelectorAll('a,button')]);
  const btn = cands.find(e => e.id === 'login_submit' && visible(e))
           || cands.find(e => visible(e) && /^(로그인|LOGIN|Login|Sign in)$/.test(label(e)))
           || cands.find(e => visible(e) && (e.type === 'submit' || /btn_login/.test(e.className || '')));

  // ⚠️⚠️ [2026-10-19 버그수정] 여기서 제출 결과를 **기다리면 안 된다.**
  //   제출하면 페이지가 이동하면서 이 JS의 실행 컨텍스트가 통째로 파괴된다 →
  //   await 하던 프라미스가 영원히 안 풀리고, CDP는 **본문이 빈 예외**를 돌려준다
  //   (실제로 "로그인 시도 중 오류: " 라는 메시지 없는 실패가 났다).
  //   그래서 제출만 하고 즉시 반환하고, **결과 판정은 바깥(파이썬)에서 폴링**한다.

  // ⚠️⚠️ [2026-10-19 재수정 — 실측] **페이지 안에서 btn.click()을 부르면 아무 일도 안 일어난다.**
  //   버튼은 `<a id="login_submit" class="btn_login" href="#">`이고 그 자체엔 리스너가 없다.
  //   핸들러는 `<form id="loginForm">`에 jQuery로 **위임**돼 있는데(선택자 '#login_submit'),
  //   프로그램적 클릭에는 반응하지 않는다. 실측 결과:
  //     el.click()                     → 무반응. 네트워크 요청조차 안 나간다.
  //     CDP Input.dispatchMouseEvent   → 즉시 로그인 성공.
  //   ⚠️ 이게 **"보안문자가 안 뜨는데 로그인도 안 되는"** 증상의 진짜 원인이다 —
  //      서버까지 간 시도가 없으니 실패가 쌓이지 않아 CAPTCHA도 안 뜬다. 숨은 submit을
  //      누르던 이전 버그와 증상이 똑같아 보이지만 원인이 다르다(그 버그는 이미 고쳤다).
  //   → 여기서는 **누르지 않고** 버튼 좌표(뷰포트 기준)만 돌려주고,
  //      클릭은 바깥에서 `click_in_gw()`가 CDP로 한다.
  if (!btn) { form.submit(); return { result: 'submitted' }; }
  btn.scrollIntoView({ block: 'center' });
  const r = btn.getBoundingClientRect();
  return { result: 'filled',
           cx: Math.round(r.x + r.width / 2),
           cy: Math.round(r.y + r.height / 2) };
})(%s, %s)
"""


# 로그인 직후 뜨는 "새로운 기능" 투어(div.step)가 화면을 덮어 폼 조작을 막는다.
# 실측(2026-10-19): 건너뛰기는 `<a class="welcome_skip">SKIP</a>`.
# 어휘/선택자는 데이터로 둬서 그룹웨어가 문구를 바꿔도 여기만 고치면 되게 한다.
_INTRO_SKIP_SELECTORS = ['.welcome_skip', '.btn_skip', '.tour_skip']
_INTRO_SKIP_WORDS = ['SKIP', 'Skip', '건너뛰기', '다시 보지 않기', '그만보기']

_DISMISS_JS = """
(async (sels, words) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!(el && el.offsetParent !== null &&
                       getComputedStyle(el).visibility !== 'hidden' &&
                       getComputedStyle(el).display !== 'none');
  const clicked = [];
  for (let pass = 0; pass < 3; pass++) {
    let hit = null;
    for (const s of sels) { const e = document.querySelector(s); if (vis(e)) { hit = e; break; } }
    if (!hit) {
      hit = [...document.querySelectorAll('a,button,span,div')]
        .find(e => vis(e) && words.includes((e.textContent || '').trim()));
    }
    if (!hit) break;
    clicked.push((hit.textContent || '').trim().slice(0, 20) || hit.className);
    hit.click();
    await sleep(700);
  }
  const left = [...document.querySelectorAll('div[class*=step]')].filter(vis).length;
  return { clicked, overlaysLeft: left };
})(%s, %s)
"""


def dismiss_intro():
    """로그인 직후 소개 투어가 떠 있으면 닫는다(없으면 아무 일도 하지 않는다)."""
    try:
        return eval_in_gw(_DISMISS_JS % (json.dumps(_INTRO_SKIP_SELECTORS),
                                         json.dumps(_INTRO_SKIP_WORDS)), timeout=30)
    except Exception as e:
        return {'clicked': [], 'error': str(e)}


def login_once():
    """저장된 계정으로 **한 번만** 로그인한다.

    반환 result:
      already   이미 로그인돼 있음(아무것도 하지 않음)
      ok        로그인 성공
      그 외     실패 — **재시도하지 않고** 사람에게 넘긴다(창은 열어둔 채로)

    ⚠️ `retryable` 도 같이 돌려준다 — **자격증명이 서버까지 간 적이 없는 실패**(크롬이 안 떠
       있음·로그인 화면에 도달 못함·클릭 자체를 못 보냄)는 계정 잠금과 무관하므로 프런트
       게이트(js/36 `_gwEnsureLogin`)가 영구히 잠그면 안 된다. 반대로 `failed`/`captcha_*`
       는 실패가 **쌓이는** 실패라 `retryable=False` — 자동 재시도 금지 그대로다.
    """
    if not chrome_alive():
        ok, msg = launch_chrome()
        if not ok:
            return {'ok': False, 'result': 'chrome', 'retryable': True, 'message': msg}

    s = session_info()
    if s.get('ok'):
        return {'ok': True, 'result': 'already', 'message': '이미 로그인되어 있습니다.', 'session': s}

    cfg = load_login_config()
    if not cfg:
        return {'ok': False, 'result': 'not_configured', 'retryable': True,
                'message': '저장된 그룹웨어 로그인 정보가 없습니다 — 🔑에서 먼저 등록해주세요.'}

    try:
        pw = _dpapi_decrypt_b64(cfg['pw_dpapi'])
    except Exception as e:
        return {'ok': False, 'result': 'decrypt', 'retryable': True, 'message': str(e)}

    # ⚠️⚠️ **창을 먼저 복원한다 — 좌표를 재기 전에.**
    #   최소화된 창에서는 신뢰된 클릭이 조용히 빗나간다(`gw_window_state` 주석에 실측 근거).
    #   그리고 복원하면 뷰포트 크기가 바뀌어 버튼 위치도 달라지므로, 반드시
    #   **복원 → 측정 → 클릭** 순서여야 한다. 창 제어가 안 되더라도 로그인은 계속 시도한다.
    prev_win = None
    try:
        prev_win = gw_window_state('normal')
    except Exception:
        pass

    # 🆕 [2026-10-29] 로그인 화면까지는 **파이썬이** 데려다 놓는다(_ensure_login_page 주석 참고).
    #    여기서 실패하면 **아이디/비번을 보낸 적이 없다** → retryable.
    ready = _ensure_login_page()
    if not ready.get('ok'):
        pw = None
        return {'ok': False, 'result': ready.get('result') or 'no_form', 'retryable': True,
                'handoff': True,
                'message': (ready.get('message') or '로그인 화면을 찾지 못했습니다.')
                           + ' — 아직 로그인 시도를 보내지 않았습니다(계정 잠금과 무관).'}
    if ready.get('captcha'):
        pw = None
        return {'ok': False, 'result': 'captcha_blocked', 'retryable': False, 'handoff': True,
                'message': '이미 보안문자(CAPTCHA)가 떠 있습니다 — 자동 로그인을 시도하지 '
                           '않았습니다. 열린 창에서 직접 로그인해주세요.'}

    try:
        r = eval_in_gw(_LOGIN_JS % (json.dumps(cfg['user']), json.dumps(pw)), timeout=60) or {}
    except Exception as e:
        # 제출 직후 페이지 이동으로 컨텍스트가 죽으면 본문 없는 예외가 온다 —
        # 그 경우에도 **제출은 이미 일어났을 수 있으므로** 아래에서 세션으로 결과를 확인한다.
        r = {'result': 'submitted', '_evalError': str(e) or '(본문 없음)'}
    finally:
        pw = None  # 메모리에 더 들고 있지 않는다

    res = r.get('result')

    # 칸만 채워진 상태 — 실제 클릭은 **신뢰된 마우스 이벤트**로 보내야 한다.
    # (페이지 안의 el.click()은 이 사이트에서 무반응. `_LOGIN_JS` 주석 참고.)
    if res == 'filled':
        try:
            click_in_gw(r['cx'], r['cy'])
            res = 'submitted'
        except Exception as e:
            # 신뢰된 클릭을 못 보냈으면 **제출이 아예 일어나지 않았다**(= 실패로 안 쌓인다).
            # 네이티브 폼 제출로 딱 한 번만 폴백한다. 이것도 실패하면 사람에게 넘긴다.
            try:
                eval_in_gw("(() => { const u = document.querySelector('#username');"
                           " const f = u && u.closest('form'); if (f) f.submit();"
                           " return true; })()", timeout=20)
                res = 'submitted'
            except Exception:
                # 제출이 안 일어났으니 실패로 **쌓이지 않는다** → retryable(계정 잠금과 무관).
                return {'ok': False, 'result': 'click_failed', 'retryable': True, 'handoff': True,
                        'message': f'로그인 버튼을 누르지 못했습니다 ({e}) — '
                                   '자격증명을 보낸 적은 없습니다. 열린 창에서 직접 로그인해주세요.'}

    # 제출했으면 결과는 **바깥에서** 확인한다(페이지 이동으로 JS 컨텍스트가 죽기 때문).
    if res == 'submitted':
        for _ in range(20):            # 최대 ~20초
            time.sleep(1.0)
            s2 = session_info()
            if s2.get('ok'):
                # 로그인 직후 "새로운 기능" 투어가 화면을 덮으면 이후 조작이 전부 막힌다 → 먼저 닫는다
                intro = dismiss_intro()
                # 성공했으면 창은 원래대로 돌려놓는다(부팅 때 최소화로 떠 있던 창이
                # 자동 로그인 때마다 화면에 튀어나오지 않도록). 실패 시엔 **복원하지 않는다** —
                # 사람이 직접 로그인해야 하므로 창이 보이는 게 맞다.
                if prev_win and prev_win != 'normal':
                    try:
                        gw_window_state(prev_win)
                    except Exception:
                        pass
                return {'ok': True, 'result': 'ok', 'message': '로그인했습니다.',
                        'session': s2, 'intro': intro}
        # 로그인 안 됐다 — 왜 안 됐는지(보안문자/오류문구)를 읽어서 알린다
        try:
            st = eval_in_gw("""
              (() => {
                const cap = document.querySelector('#captcha');
                const err = document.querySelector('.alert,.error,[class*=error]');
                return { captcha: !!(cap && cap.offsetParent !== null),
                         url: location.href,
                         msg: err ? (err.textContent || '').trim().slice(0, 120) : '' };
              })()
            """, timeout=20) or {}
        except Exception:
            st = {}
        res = 'captcha_appeared' if st.get('captcha') else 'failed'
        # ⚠️ [2026-10-29] `[class*=error]`가 로그인 화면의 **빈 오류 자리표시자**를 집어
        #    "(서버 메시지: !)" 같은 쓸모없는 꼬리말을 달았다(실측). 글자가 거의 없는 건
        #    서버 문구가 아니므로 버린다 — 사람에게 보여줄 값이 아니다.
        _msg = (st.get('msg') or '').strip()
        r['message'] = _msg if len(re.sub(r'[\s!·.…·:;*\-]+', '', _msg)) >= 2 else ''

    if res == 'ok':
        return {'ok': True, 'result': 'ok', 'message': '로그인했습니다.', 'session': session_info()}

    # ⚠️ 여기부터는 전부 실패 경로 — **자동** 재시도는 하지 않는다.
    #    단 `retryable` 로 "자격증명이 서버까지 갔는가"를 구분해 알려준다(위 docstring).
    human = {
        'captcha_blocked':  '이미 보안문자(CAPTCHA)가 떠 있습니다 — 자동 로그인을 시도하지 않았습니다. 열린 창에서 직접 로그인해주세요.',
        'captcha_appeared': '로그인에 실패해 보안문자(CAPTCHA)가 나타났습니다 — 계정 잠금을 막기 위해 재시도하지 않습니다. 열린 창에서 직접 로그인해주세요.',
        'failed':           '로그인에 실패했습니다 — 계정 잠금을 막기 위해 재시도하지 않습니다. 열린 창에서 직접 로그인해주세요.',
        'no_form':          '로그인 화면을 찾지 못했습니다 — 열린 창에서 직접 로그인해주세요.',
    }.get(res, '로그인하지 못했습니다 — 열린 창에서 직접 로그인해주세요.')
    if r.get('message'):
        human += f' (서버 메시지: {r["message"]})'
    # `no_form` 은 폼이 없어 **채우지도 못한** 경우다 — 제출이 없었으니 잠금과 무관.
    return {'ok': False, 'result': res or 'failed', 'handoff': True, 'message': human,
            'retryable': res in ('no_form', 'nav_failed', 'chrome')}


def session_info():
    """로그인 상태 + 내 계정 정보. 세션이 끊겼으면 ok=False."""
    v = chrome_alive()
    if not v:
        # ⚠️ [2026-10-26 제보] /json/version 2초 타임아웃이 가끔 일시적으로 비어 "브라우저가
        #    실행되고 있지 않습니다"를 반환했다(바로 다음 조회는 정상). 로컬 핑이라 계정
        #    잠금과 무관 — 두 번 더 확인한 뒤에만 포기한다(로그인 재시도 금지와는 별개).
        for _ in range(2):
            time.sleep(0.4)
            v = chrome_alive()
            if v:
                break
    if not v:
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
            'loginId': comp.get('userLoginId'), 'company': comp.get('companyName'),
            'name': d.get('name') or '', 'position': d.get('position') or ''}


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


# ── 📝 전자결재 기안 (임시저장까지만) ────────────────────────────────
# ⚠️⚠️ **'결재요청'은 이 모듈에서 절대 누르지 않는다.** 누르는 순간 팀장·합의자들에게
#   실제로 올라가고 되돌리기 어렵다. 여기서는 '임시저장'만 한다 — 임시저장 문서는
#   내 임시문서함에만 남고 남에게 안 보이며 그룹웨어에서 삭제할 수 있다.
#   상신은 사람이 그룹웨어 화면에서 내용을 확인한 뒤 직접 누른다.
#
# 실측(2026-10-16, 원자재 승인 결과서 formId=4857 deptId=245):
#  · 작성 화면 URL: /app/approval/document/new/{deptId}/{formId}
#  · **화면을 여는 순간 서버가 문서 ID를 발급**한다(GET /api/approval/document/new?formId&deptId).
#  · 입력칸 id는 `editorForm_N`이고 N은 양식마다 다르다 → **이름으로 하드코딩하면 안 된다.**
#    표의 열 머리글(Item Code, Model …)과 행 라벨(Name, Address …)로 역매핑해서 찾는다.
#    라벨만 보면 `Date :` 같은 게 섞여 엉뚱한 칸에 쓴다(실제로 한 번 잘못 읽었다).

# ── 📎 협력사 승인원 표지(docx) 파싱 ────────────────────────────────
# 협력사에 표지를 보내면 빈칸을 채워 돌려준다. SAP에 없는 정보(공급업체 상호/주소/전화)가
# 거기 들어 있으므로, 기안 작성 때 부족한 칸을 이걸로 채운다.
# 실측(2026-10-19, 승인원_133015_Rev00.docx): Provider Info Name/Address/Tel. 과
#   Item Group No·Item Code·Item Description·Sub-Description·DMS Upload(New/Rev)가 모두 있음.
# ⚠️ 표지 양식은 협력사/시점마다 다를 수 있다 → 라벨은 **별칭 목록(데이터)** 으로 둬서
#   문구가 달라도 잡히게 하고, 못 찾은 칸은 조용히 빈 채로 둔다(추측해서 채우지 않는다).
_COVER_LABELS = [
    (['Item Group No', 'Item Group No.', '자재그룹'],        'Item Group No'),
    (['Item Code', '자재코드', '품번'],                       'Item Code'),
    (['Item Description', 'Model', '품명'],                   'Model'),
    (['Sub-Description', 'Sub Description', '세부내역'],      'Sub Description'),
    (['Name', 'Provider Name', '업체명', '상호'],             'Name'),
    (['Address', '주소'],                                     'Address'),
    (['Tel.', 'Tel', 'TEL', '전화', '연락처'],                'Tel'),
]
_COVER_ALL_LABELS = {a for al, _ in _COVER_LABELS for a in al}


def _docx_lines(data):
    """docx 바이트에서 문단 텍스트를 순서대로 뽑는다(표·텍스트상자 안의 것도 포함).
    python-docx의 paragraphs/tables만 보면 표 안 텍스트를 놓쳐서 XML을 직접 훑는다."""
    import io
    import zipfile
    import xml.etree.ElementTree as ET
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    out = []
    for p in root.iter(f'{W}p'):
        t = ''.join(n.text or '' for n in p.iter(f'{W}t')).strip()
        if t:
            out.append(t)
    return out


def parse_approval_cover(data):
    """승인원 표지 docx → {필드: 값}. 라벨 **바로 다음 줄**을 값으로 본다
    (표가 라벨칸/값칸으로 나뉘어 있어 문단 순서가 그대로 유지된다)."""
    import re
    lines = _docx_lines(data)
    found, used = {}, set()
    for i, ln in enumerate(lines):
        for aliases, key in _COVER_LABELS:
            if key in found or ln not in aliases:
                continue
            for j in range(i + 1, min(i + 3, len(lines))):
                if j in used:
                    continue
                v = lines[j].strip()
                if v in _COVER_ALL_LABELS:   # 다음 라벨이면 값이 아니다
                    break
                if v and v != '.':
                    found[key] = v
                    used.add(j)
                    break
    # DMS Upload 체크 + 개정 차수 (■ New □ Update (Revision: 00))
    for ln in lines:
        m = re.search(r'(?:■|☑|✓|v|V)\s*(New|Update)[^()]*\(?\s*Rev(?:ision)?\s*[.:：]?\s*([0-9]{1,2})', ln)
        if m:
            found['_kind'] = m.group(1)
            found['_rev'] = m.group(2)
            break
    return {'fields': found, 'lineCount': len(lines)}


# ── 🔎 이전 승인원 문서 찾기 (Revision History 판단용) ──────────────
# 같은 자재코드로 올라간 승인원이 이미 있으면 "개정", 없으면 "최초등록"이다.
# 실측(2026-10-19): /api/search/approval?stype=simple&type=approval&keyword=...
#   응답 항목 키: id, title, formName, drafterName, draftedAt, docStatus …
#   title에는 검색어가 <strong class='txt_key'>로 감싸져 오므로 태그를 떼야 한다.
_APPROVAL_TITLE_HINT = 'Customer Approval Sheet'


def search_approval_docs(keyword, only_approval_form=True, limit=20):
    """자재코드 등으로 기존 결재문서를 찾는다. 읽기 전용."""
    import re
    js = """
    (async (kw, limit) => {
      const q = new URLSearchParams({
        stype:'simple', type:'approval', keyword: kw,
        fromDate:'1970-01-01T00:00:00.000+09:00',
        toDate: (new Date().getFullYear()+1) + '-12-31T23:59:59.000+09:00',
        page:'0', offset: String(limit)
      });
      const r = await fetch('/api/search/approval?' + q.toString(),
                            { credentials:'same-origin', headers:{Accept:'application/json'} });
      if (!r.ok) return { __err:true, status:r.status };
      const j = await r.json();
      return { total:(j.page && j.page.total) || 0,
               items:(j.data||[]).map(x => ({ id:x.id, docNum:x.docNum||'', title:x.title||'', formName:x.formName||'',
                      drafter:x.drafterName||'', at:(x.draftedAt||'').slice(0,10), status:x.docStatus||'' })) };
    })(%s, %s)
    """ % (json.dumps(str(keyword)), int(limit))
    r = eval_in_gw(js, timeout=45) or {}
    if r.get('__err'):
        raise RuntimeError(f'문서 검색 실패 (HTTP {r.get("status")})')
    items = []
    for it in r.get('items', []):
        title = re.sub(r'<[^>]+>', '', it.get('title') or '')
        if only_approval_form and _APPROVAL_TITLE_HINT.lower() not in title.lower():
            continue
        it['title'] = title
        items.append(it)
    return {'total': r.get('total', 0), 'items': items}


def approval_forms():
    """자주 쓰는 결재 양식 목록(이름 → formId/deptId). 하드코딩 대신 매번 읽는다."""
    j = gw_get('/api/approval/side')
    out = []
    for f in (j or {}).get('data', {}).get('favorites', []) if isinstance((j or {}).get('data'), dict) \
            else (j or {}).get('favorites', []):
        if f.get('formId'):
            out.append({'name': f.get('formName') or '', 'formId': f['formId'], 'deptId': f.get('deptId')})
    return out


# ── 전사 결재양식 전체 카탈로그 (즐겨찾기에 없는 양식용 폴백, 2026-10-26) ──────────
# 즐겨찾기(approval_forms)만 보면 "프로젝트코드 등록 신청서"처럼 안 즐겨찾은 양식은
# 기안 복사/작성에서 영원히 "못 찾음"으로 막힌다(실사고: 임시저장 직전 쓰기확정에서 실패,
# 즐겨찾기엔 9개뿐인데 조직 전체엔 97개). docs/groupware-forms.md 가 사람이 보는 색인이고,
# ⚠️ 거기 "코드에 하드코딩하지 말 것"이라 적힌 그대로 — 여기서는 `/api/approval/apprform/tree`를
# 그때그때 BFS로 읽는다(폴더 15개 왕복 ≈ 수 초). 폴더 구조는 전산팀만 바꾸므로 프로세스
# 메모리에 짧게 캐시한다.
_FORM_CATALOG_CACHE = {'at': 0.0, 'items': []}
_FORM_CATALOG_TTL = 1800  # 30분


def approval_form_catalog(force=False):
    """전사 결재양식 전체 목록 [{name, formId, folderId}, …] — BFS, 프로세스 내 30분 캐시."""
    now = time.time()
    if not force and _FORM_CATALOG_CACHE['items'] and now - _FORM_CATALOG_CACHE['at'] < _FORM_CATALOG_TTL:
        return _FORM_CATALOG_CACHE['items']
    items = []
    seen = set()
    queue = []
    for node in (gw_get('/api/approval/apprform/tree') or []):
        attr = node.get('attr') or {}
        if attr.get('rel') == 'FOLDER' and attr.get('nodeId') is not None:
            queue.append(attr['nodeId'])
    while queue:
        fid = queue.pop(0)
        if fid in seen:
            continue
        seen.add(fid)
        try:
            nodes = gw_get('/api/approval/apprform/tree?folderId=%d' % fid) or []
        except Exception:
            continue
        for node in nodes:
            attr = node.get('attr') or {}
            nid = attr.get('nodeId')
            if nid is None:
                continue
            if attr.get('rel') == 'FOLDER' and nid not in seen:
                queue.append(nid)
            elif attr.get('rel') == 'FORM':
                items.append({'name': (attr.get('title') or '').strip(), 'formId': nid, 'folderId': fid})
    _FORM_CATALOG_CACHE['items'] = items
    _FORM_CATALOG_CACHE['at'] = now
    return items


def _default_dept_id():
    """기안을 그릴 내 소속 부서 deptId — 팀마다 다르므로 그때그때 세션에서 얻는다(하드코딩 금지)."""
    try:
        side = gw_get('/api/approval/side') or {}
        data = side.get('data') if isinstance(side.get('data'), dict) else side
        folders = (data or {}).get('drafterDeptFolders') or []
        if folders and folders[0].get('deptId'):
            return folders[0]['deptId']
    except Exception:
        pass
    forms = approval_forms()
    return forms[0].get('deptId') if forms else None


def resolve_form(form_name):
    """양식 이름 → {name, formId, deptId}. 즐겨찾기 우선(빠름) → 없으면 전사 카탈로그 폴백."""
    form_name = (form_name or '').strip()
    hit = next((f for f in approval_forms() if (f.get('name') or '').strip() == form_name), None)
    if hit:
        return hit
    catalog = approval_form_catalog()
    chit = next((f for f in catalog if f.get('name') == form_name), None)
    if not chit:
        raise RuntimeError('"%s" 양식을 전사 결재양식 목록(%d건)에서도 찾지 못했습니다. '
                            '양식 이름을 다시 확인해주세요.' % (form_name, len(catalog)))
    dept_id = _default_dept_id()
    if not dept_id:
        raise RuntimeError('소속 부서(deptId)를 확인하지 못해 "%s" 양식을 열 수 없습니다.' % form_name)
    return {'name': chit['name'], 'formId': chit['formId'], 'deptId': dept_id}


# 작성 화면을 열고, 입력칸을 '열 머리글/행 라벨'로 찾아 채운 뒤 임시저장한다.
_DRAFT_JS = r"""
(async (cfg) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = [];

  // 1) 작성 화면 로딩 대기 — subject 칸이 나타나면 준비된 것
  for (let i = 0; i < 60 && !document.getElementById('subject'); i++) await sleep(300);
  if (!document.getElementById('subject')) return { ok:false, step:'open', why:'작성 화면이 열리지 않았습니다.' };
  await sleep(1200);

  // 2) editorForm_* 칸마다 '열 머리글'과 '행 라벨'을 계산해 둔다
  const norm = s => String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  const map = [];
  document.querySelectorAll('[id^=editorForm_]').forEach(el => {
    const td = el.closest('td'); const tr = td && td.closest('tr');
    const table = tr && tr.closest('table');
    let header = '', rowLabel = '';
    if (td && tr && table) {
      const idx = [...tr.children].indexOf(td);
      const rows = [...table.rows]; const myRow = rows.indexOf(tr);
      for (let r = myRow - 1; r >= 0 && !header; r--) {
        const c = rows[r].children[idx];
        if (c) { const tx = (c.innerText||'').trim().replace(/\s+/g,' '); if (tx && tx.length < 30) header = tx; }
      }
      if (tr.children.length) rowLabel = (tr.children[0].innerText||'').trim().replace(/\s+/g,' ');
    }
    map.push({ el, id: el.id, type: el.type, header: norm(header), rowLabel: norm(rowLabel) });
  });

  const setVal = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input',  { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
    el.dispatchEvent(new Event('blur',   { bubbles:true }));
  };

  // 3) 제목
  if (cfg.subject) { setVal(document.getElementById('subject'), cfg.subject); log.push({ field:'제목', id:'subject', ok:true, val:cfg.subject }); }

  // 3-b) 체크박스 — 양식의 id가 `editorForm_28_정식승인`처럼 **값이 뒤에 붙어** 있어서
  //      라벨로 바로 찾을 수 있다(실측). cfg.checks = ['정식승인','P1','New'] 형태.
  for (const want of (cfg.checks || [])) {
    const boxes = [...document.querySelectorAll('input[type=checkbox][id^=editorForm_]')];
    // ① 값이 id 뒤에 붙는 양식(editorForm_28_정식승인) — 승인원류가 이 모양이다
    let el = boxes.find(e => e.id.endsWith('_' + want));
    // ② 안 붙는 양식(editorForm_9_check)도 있다 — 그땐 **옆 칸 글자**로 찾는다.
    //    제품코드 등록 신청서가 이 모양이라 ①만으로는 체크가 하나도 안 걸렸다(2026-10-21 실측).
    if (!el) {
      const w = norm(want);
      const cellOf = e => { const td = e.closest('td'); return td ? norm(td.innerText) : ''; };
      const rowOf  = e => { const tr = e.closest('tr'); return tr && tr.children.length ? norm(tr.children[0].innerText) : ''; };
      el = boxes.find(e => cellOf(e) === w) || boxes.find(e => rowOf(e) === w)
        || boxes.find(e => cellOf(e) && w.indexOf(cellOf(e)) === 0);
    }
    if (!el) { log.push({ field: '체크:' + want, ok: false, why: '해당 체크박스 없음' }); continue; }
    if (!el.checked) { el.click(); }
    log.push({ field: '체크:' + want, id: el.id, ok: !!el.checked, val: want });
  }

  // 4) 나머지 칸 — 열 머리글 우선, 없으면 행 라벨로 찾는다(텍스트 칸만)
  for (const [label, value] of Object.entries(cfg.fields || {})) {
    const want = norm(label);
    let hit = map.find(m => m.type === 'text' && m.header === want && !m.used)
           || map.find(m => m.type === 'text' && m.rowLabel === want && !m.used)
           || map.find(m => m.type === 'text' && m.header.indexOf(want) === 0 && !m.used);
    if (!hit) { log.push({ field: label, ok:false, why:'해당 칸 없음' }); continue; }
    hit.used = true;
    setVal(hit.el, value);
    log.push({ field: label, id: hit.id, ok: hit.el.value === value, val: hit.el.value });
  }
  await sleep(800);

  if (cfg.dryRun) return { ok:true, step:'filled', dryRun:true, log, url: location.href };

  // 5) '임시저장'만 누른다 — '결재요청'은 찾지도 않는다
  const btn = [...document.querySelectorAll('button,a,input[type=button]')]
    .filter(e => e.offsetParent !== null)
    .find(e => ((e.textContent || e.value || '').trim()) === '임시저장');
  if (!btn) return { ok:false, step:'save', why:'임시저장 버튼을 찾지 못했습니다.', log };
  btn.click();
  await sleep(4000);
  const conf = [...document.querySelectorAll('button,a')]
    .filter(e => e.offsetParent !== null)
    .find(e => ['확인','예','OK'].includes((e.textContent||'').trim()));
  if (conf) { conf.click(); await sleep(3000); }

  const m = location.href.match(/\/document\/(\d+)/);
  return { ok: !!m, step:'saved', docId: m ? m[1] : null, url: location.href, log };
})(%s)
"""


# ── 기존 문서 읽기 (복사 기안용) ─────────────────────────────────────
# ⚠️ 문서 **보기** 화면이 작성 화면과 **같은 `editorForm_N` 입력칸**을 그대로 렌더한다(2026-10-21 실측).
#    그래서 _DRAFT_JS 가 값을 넣을 때 쓰는 "열 머리글 / 행 라벨" 규칙을 **그대로 뒤집어** 읽는다.
#    화면 글자를 긁어 짐작하지 않으므로 양식이 바뀌어도 따라간다.
_READ_JS = r"""
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s||'').trim().replace(/\s+/g,' ');
  for (let i = 0; i < 60 && !document.querySelector('[id^=editorForm_]'); i++) await sleep(300);
  await sleep(800);

  // 칸마다 '열 머리글'과 '행 라벨' — _DRAFT_JS 와 같은 계산
  const label = el => {
    const td = el.closest('td'); const tr = td && td.closest('tr');
    const table = tr && tr.closest('table');
    let header = '', rowLabel = '';
    if (td && tr && table) {
      const idx = [...tr.children].indexOf(td);
      const rows = [...table.rows]; const my = rows.indexOf(tr);
      for (let r = my - 1; r >= 0 && !header; r--) {
        const c = rows[r].children[idx];
        if (c) { const tx = norm(c.innerText); if (tx && tx.length < 30) header = tx; }
      }
      if (tr.children.length) rowLabel = norm(tr.children[0].innerText);
    }
    return { header, rowLabel, cell: td ? norm(td.innerText) : '' };
  };

  const fields = {}, checks = [];
  // 체크박스는 보기 화면에도 **진짜 input** 으로 남아 있어 상태를 그대로 읽는다.
  document.querySelectorAll('input[type=checkbox][id^=editorForm_]').forEach(el => {
    if (!el.checked) return;
    const L = label(el);
    const v = L.cell || L.rowLabel || el.id.replace(/^editorForm_\d+_?/, '');
    if (v && checks.indexOf(v) === -1) checks.push(v);
  });
  // ⚠️ 텍스트 칸은 보기 화면에서 input 이 아니라 **셀 글자**로 렌더된다(실측: value 가 전부 빈값).
  //    라벨 칸과 값 칸은 클래스로 갈린다 — subjectColumn(회색·굵게) / detailColumn(값).
  //    이 구분을 안 쓰고 "옆 칸끼리 짝"으로 읽으면 머리글끼리 짝지어져
  //    '과제 구분 = 제품군' 같은 **가짜 값**이 생긴다(실측에서 실제로 그랬다).
  const isLab = td => td.classList.contains('subjectColumn');
  const isVal = td => td.classList.contains('detailColumn');
  const put = (k, v) => { k = norm(k); v = norm(v);
    if (k && v && k !== v && k.length <= 24 && !fields[k]) fields[k] = v; };
  document.querySelectorAll('table.detailSection').forEach(tb => {
    const rows = [...tb.rows];
    rows.forEach((tr, ri) => {
      const cells = [...tr.children];
      cells.forEach((td, ci) => {
        if (!isVal(td)) return;
        const prev = cells[ci - 1];
        if (prev && isLab(prev)) { put(prev.innerText, td.innerText); return; }   // 가로: 라벨 | 값
        // 세로: 같은 열 위쪽에서 가장 가까운 머리글(subjectColumn)을 찾는다
        for (let r = ri - 1; r >= 0; r--) {
          const h = rows[r].children[ci];
          if (h && isLab(h)) { put(h.innerText, td.innerText); break; }
        }
      });
    });
  });
  // 머리 정보 — 라벨/값이 번갈아 오는 표
  const head = {};
  const ht = document.querySelector('table.detailSection, table.tb_doc_info');
  if (ht) [...ht.rows].forEach(tr => {
    const c = [...tr.children].map(x => norm(x.innerText));
    for (let i = 0; i + 1 < c.length; i += 2) if (c[i] && c[i].length < 20) head[c[i].replace(/\s/g,'')] = c[i+1];
  });

  // 결재선 / 문서정보 / 첨부 — 탭 영역(aside)들에서 글자 그대로
  const asides = [...document.querySelectorAll('.aside_wrapper_body')].map(e => norm(e.innerText));
  const attach = [...document.querySelectorAll('a,span')]
    .map(e => norm(e.innerText)).filter(t => /\.(xlsx|xls|pdf|docx|doc|pptx|zip|png|jpg)$/i.test(t));

  return { url: location.href, subject: norm((document.getElementById('subject')||{}).value) || head['제목'] || '',
           head, fields, checks, apprLine: asides[0] || '', docInfo: asides[1] || '',
           attachments: [...new Set(attach)] };
})()
"""


def approval_read(doc_num=None, doc_id=None):
    """기존 전자결재 문서를 읽는다(읽기 전용) — 복사 기안의 재료.

    `doc_num`('RD3-2610-050')이면 전 문서함에서 찾아 id 를 얻는다.
    ⚠️ box='draft' 로만 찾으면 남이 올린 문서는 영영 안 나온다 — all 로 찾는다."""
    meta = None
    if not doc_id:
        if not doc_num:
            raise ValueError('문서번호(doc_num) 또는 문서 id 가 필요합니다.')
        r = approval_doclist(box='all', limit=20, searchtype='docNum',
                             keyword=str(doc_num).strip(), duration='all')
        docs = r.get('docs') or []
        if not docs:
            raise RuntimeError('문서번호 %s 를 어느 문서함에서도 찾지 못했습니다.' % doc_num)
        meta = docs[0]
        doc_id = meta.get('id')

    t = _gw_page()
    if not t:
        raise RuntimeError('그룹웨어 탭을 열지 못했습니다.')
    asyncio.run(_navigate(t['webSocketDebuggerUrl'],
                          '%s/app/approval/document/%s' % (GW_ORIGIN, doc_id)))
    time.sleep(2.0)
    dismiss_intro()
    out = eval_in_gw(_READ_JS, timeout=90) or {}
    out['docId'] = doc_id
    if meta:
        out['meta'] = meta
    return out


# 새 기안에서 **시스템이 알아서 채우는** 칸 — 복사해 넣으면 안 된다(원본의 문서번호·작성자가 박힌다).
_COPY_SKIP = {'문서번호', '작성일', '작성부서', '작성자', '제목', '기안부서', '기안자'}


def approval_copy(doc_num=None, doc_id=None, subject=None, fields=None, dry_run=True):
    """기존 문서를 읽어 **같은 양식의 새 기안에 채워 임시저장**한다. 상신은 하지 않는다.

    첨부파일은 가져오지 않는다(사용자 결정 2026-10-21) — 몇 건 있었는지만 알려준다.
    결재선은 새 기안의 기본값을 쓰고, 원본 결재선을 같이 돌려줘 **다른지 눈으로 보게** 한다.
    `subject`/`fields` 를 주면 그 값이 원본을 덮는다(필요한 부분만 고쳐 쓰는 용도)."""
    src = approval_read(doc_num=doc_num, doc_id=doc_id)
    meta = src.get('meta') or {}
    form_name = (meta.get('formName') or '').strip()
    if not form_name:
        raise RuntimeError('원본의 양식 이름을 알 수 없어 같은 양식을 열 수 없습니다.')

    hit = resolve_form(form_name)

    src_fields = {k: v for k, v in (src.get('fields') or {}).items()
                  if k.replace(' ', '') not in _COPY_SKIP}
    merged = dict(src_fields)
    merged.update(fields or {})

    r = approval_draft(form_id=hit['formId'], dept_id=hit['deptId'],
                       subject=(subject if subject is not None else src.get('subject') or ''),
                       fields=merged, dry_run=bool(dry_run), checks=src.get('checks') or [])
    return {
        'source': {'docNum': meta.get('docNum') or doc_num, 'docId': src.get('docId'),
                   'formName': form_name, 'formId': hit['formId'], 'deptId': hit['deptId'],
                   'box': meta.get('box'), 'drafter': meta.get('drafterName'),
                   'apprLine': src.get('apprLine') or '',
                   'attachments': src.get('attachments') or []},
        'filled': {'subject': (subject if subject is not None else src.get('subject') or ''),
                   'fields': merged, 'checks': src.get('checks') or []},
        'dryRun': bool(dry_run),
        'draft': r,
        'notes': ([('첨부 %d건은 가져오지 않았습니다 — 새로 올려주세요: %s'
                    % (len(src.get('attachments') or []), ', '.join(src.get('attachments') or [])))]
                  if src.get('attachments') else []),
    }


def approval_draft(form_id, dept_id, subject, fields, dry_run=False, checks=None):
    """결재 양식에 값을 채우고 **임시저장**한다. 상신(결재요청)은 하지 않는다.

    fields: {'Item Code': '102202', 'Model': '...', 'Name': '삼완전자'} 처럼
            화면에 보이는 **열 머리글/행 라벨**을 키로 준다(editorForm_N을 직접 쓰지 않는다)."""
    s = session_info()
    if not s.get('ok'):
        raise RuntimeError(s.get('message') or '그룹웨어 로그인이 필요합니다.')

    t = _gw_page()
    if not t:
        raise RuntimeError('그룹웨어 탭을 열지 못했습니다.')

    # 작성 화면으로 이동 — 이 시점에 서버가 문서 ID를 발급한다
    url = f'{GW_ORIGIN}/app/approval/document/new/{int(dept_id)}/{int(form_id)}'
    asyncio.run(_navigate(t['webSocketDebuggerUrl'], url))
    time.sleep(2.0)
    # 소개 투어가 떠 있으면 입력칸을 가려 채우기가 실패한다 — 들어오자마자 한 번 닫는다
    dismiss_intro()

    cfg = json.dumps({'subject': subject, 'fields': fields or {},
                      'checks': checks or [], 'dryRun': bool(dry_run)},
                     ensure_ascii=False)
    return eval_in_gw(_DRAFT_JS % cfg, timeout=120)


async def _navigate(ws_url, url):
    import websockets
    async with websockets.connect(ws_url, max_size=20_000_000) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Page.navigate', 'params': {'url': url}}))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            if m.get('id') == 1:
                return


def events(date_from, date_to, calendar_ids=None):
    """기간 내 일정. `date_from/to`는 'YYYY-MM-DD'.

    ⚠️ `calendarIds[]` 배열 파라미터가 **필수**다 — 빼면 서버가 500을 던진다(실측).
       `includingAttendees=true`도 실제 화면이 보내는 그대로 맞춘다.
    ⚠️ [2026-10-27 실사용 제보] **"휴일일정"(calendarId=11)은 timeMin/timeMax를 무시한다** —
       하루짜리 범위(예: 2026-10-28~2026-10-28)로 불러도 몇 달~1년 뒤 공휴일까지 11건이
       그대로 섞여 왔다(아마 "다가오는 공휴일" 위젯처럼 서버가 범위와 무관하게 다음 N개를
       주는 듯). 실제 요청한 날짜엔 그 공휴일이 없는데도 섞여 나와 AI가 "오늘 일정"에
       엉뚱한 미래 공휴일을 끼워 넣을 수 있었다 — asset_reservations의 /items/daily와
       같은 사정이라 여기서도 요청한 기간으로 직접 걸러낸다."""
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
        start = e.get('startTime') or ''
        end = e.get('endTime') or ''
        if start[:10] > date_to or (end or start)[:10] < date_from:
            continue        # 서버가 범위 밖까지 끼워 보낸 것 — 요청한 기간으로 다시 거른다
        out.append({
            'id':        str(e.get('id') or ''),
            'title':     e.get('summary') or '',
            'calendar':  e.get('calendarName') or '',
            'calendarId': e.get('calendarId'),
            'color':     e.get('color') or '',
            'type':      e.get('type') or '',
            'start':     start,
            'end':       end,
            'allDay':    (e.get('timeType') == 'allday'),
            'location':  e.get('location') or '',
            'creator':   ((e.get('creator') or {}).get('name') or ''),
            'description': (e.get('description') or '')[:500],
        })
    return out


# ── 캘린더 일정 등록/삭제 (쓰기, 2026-10-26) ────────────────────────────
# 공식 API 문의 결과를 기다리지 않고(별도로 확인 중), 읽기와 같은 방식(전용 크롬의 로그인
# 세션으로 내부 REST를 직접 호출)으로 구현했다. payload는 추측이 아니라 실제 그룹웨어
# 화면에서 테스트 일정 하나를 등록 → CDP Network로 요청 관찰 → 즉시 삭제하며 확정했다
# (docs/groupware-research-tools.md 2절 절차, gw_capture_write.py 사용).
#   POST /api/calendar/{calendarId}/event/   본문: attendees/creator/startTime/endTime/
#        timeType/calendarId/summary/location/description/visibility/type/recurrence/
#        reminders/timeZoneOffset/assetReservationIds (실측 그대로, 하드코딩 아님 — 아래 함수가
#        매번 세션에서 내 이름·직책·참석자 정보를 읽어 채운다)
#   DELETE /api/calendar/{calendarId}/event/{eventId}   본문 없음
# ⚠️ 다른 사람을 참석자로 추가하는 기능은 아직 없다 — 나 자신만 참석자로 들어간다(실측 기본 동작).


def _calendar_iso(value, end_of_day=False):
    """'YYYY-MM-DD HH:MM' 또는 (종일이면) 'YYYY-MM-DD' → 그룹웨어가 쓰는 ISO+09:00."""
    v = str(value).strip()
    if len(v) == 10:
        return v + ('T23:59:59.999+09:00' if end_of_day else 'T00:00:00.000+09:00')
    d, t = v.split(' ', 1)
    return '%sT%s:00.000+09:00' % (d, t.strip()[:5])


def calendar_create_event(summary, start, end, *, calendar_id=None, location='', description='',
                           all_day=False, dry_run=False):
    """일정을 등록한다(임시저장 개념이 없다 — 등록하면 바로 캘린더에 남는다).

    start/end: 'YYYY-MM-DD HH:MM'(시간 지정) 또는 all_day=True면 'YYYY-MM-DD'.
    calendar_id 생략 시 내 캘린더 목록의 첫 번째(화면에서도 그게 기본 선택값이다).
    dry_run=True면 실제로 호출하지 않고 보낼 본문만 돌려준다 — 호출 전 사람 확인용."""
    s = session_info()
    if not s.get('ok'):
        raise RuntimeError(s.get('message') or '그룹웨어 로그인이 필요합니다.')
    if calendar_id is None:
        cals = calendars()
        if not cals:
            raise RuntimeError('등록할 캘린더를 찾지 못했습니다.')
        calendar_id = cals[0]['id']

    body = {
        'attendees': [{'id': str(s['userId']), 'name': s.get('name') or '',
                       'email': s.get('email') or '', 'position': s.get('position') or ''}],
        'creator': {'id': s['userId'], 'position': s.get('position') or '', 'name': s.get('name') or ''},
        'type': 'normal',
        'visibility': 'public',
        'startTime': _calendar_iso(start),
        'endTime': _calendar_iso(end, end_of_day=all_day),
        'timeType': 'allday' if all_day else 'timed',
        'recurrence': '',
        'reminders': [],
        'timeZoneOffset': '+09:00',
        'calendarId': int(calendar_id),
        'summary': summary,
        'location': location,
        'description': description,
        'assetReservationIds': [],
    }
    if dry_run:
        return {'ok': True, 'dryRun': True, 'body': body}

    js = r"""
    (async (cid, payload) => {
      const r = await fetch('/api/calendar/' + cid + '/event/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      const ct = r.headers.get('content-type') || '';
      const body = ct.includes('json') ? await r.json() : (await r.text()).slice(0, 300);
      return { status: r.status, ok: r.ok, body };
    })(%s, %s)
    """ % (int(calendar_id), json.dumps(body, ensure_ascii=False))
    res = eval_in_gw(js, timeout=45) or {}
    if not res.get('ok'):
        raise RuntimeError('일정 등록 실패 (HTTP %s): %s' % (res.get('status'), str(res.get('body'))[:200]))
    data = res.get('body') or {}
    ev = data.get('data') if isinstance(data.get('data'), dict) else data
    return {'ok': True, 'eventId': ev.get('id'), 'calendarId': calendar_id, 'summary': summary,
            'start': body['startTime'], 'end': body['endTime'], 'location': location}


def calendar_delete_event(calendar_id, event_id):
    """등록한 일정을 삭제한다. **되돌릴 수 없다** — 호출 전 사람 확인을 거칠 것."""
    js = r"""
    (async (cid, eid) => {
      const r = await fetch('/api/calendar/' + cid + '/event/' + eid,
                            { method: 'DELETE', credentials: 'same-origin' });
      return { status: r.status, ok: r.ok };
    })(%s, %s)
    """ % (int(calendar_id), int(event_id))
    res = eval_in_gw(js, timeout=30) or {}
    if not res.get('ok'):
        raise RuntimeError('일정 삭제 실패 (HTTP %s)' % res.get('status'))
    return {'ok': True}


# ── 게시판 (읽기 전용) ───────────────────────────────────────────────
# 엔드포인트는 전수 조사(2026-10-19)로 확정 — docs/groupware.md "게시판" 절 참고.
#   /api/board/myhome/all?page&offset&url_type=all   내가 보는 모든 게시판 통합 최신글
#   /api/board/{boardId}/posts/classic?page&offset   게시판별 목록
#   /api/board/{boardId}/post/{postId}/classic       본문
# ⚠️ 쓰기(글 작성·삭제·댓글)는 **만들지 않는다.**

_TAG_RE = re.compile(r'<[^>]+>')
_WS_RE = re.compile(r'[ \t\xa0]+')


def _html_to_text(html, limit=4000):
    """게시물 본문 HTML을 요약용 평문으로. AI에 넘길 거라 태그·중복 공백을 없앤다."""
    s = str(html or '')
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
    s = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</tr>|</li>', '\n', s)
    s = _TAG_RE.sub(' ', s)
    for a, b in (('&nbsp;', ' '), ('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
                 ('&quot;', '"'), ('&#39;', "'")):
        s = s.replace(a, b)
    s = _WS_RE.sub(' ', s)
    s = re.sub(r'\n\s*\n\s*\n+', '\n\n', s)
    return s.strip()[:limit]


def _post_brief(p):
    w = p.get('writer') or {}
    return {
        'id':        p.get('id'),
        'boardId':   p.get('boardId'),
        'boardName': p.get('boardName') or '',
        'title':     p.get('title') or '',
        'writer':    w.get('name') or '',
        'position':  w.get('positionName') or '',
        'createdAt': p.get('createdAt') or '',
        'summary':   _html_to_text(p.get('summary') or '', 400),
        'readCount': p.get('readCount') or 0,
        'comments':  p.get('commentsCount') or 0,
        'hasAttach': bool(p.get('hasAttach')),
        'url':       f'{GW_ORIGIN}/app/board/{p.get("boardId")}/post/{p.get("id")}',
    }


_KST = datetime.timezone(datetime.timedelta(hours=9))


def _day_bounds(date_str, end_of_day):
    """'YYYY-MM-DD' → KST 경계 datetime. 잘못된 값이면 None(= 제한 없음)."""
    try:
        d = datetime.datetime.strptime(str(date_str).strip(), '%Y-%m-%d').date()
    except (ValueError, TypeError, AttributeError):
        return None
    t = datetime.time(23, 59, 59) if end_of_day else datetime.time(0, 0, 0)
    return datetime.datetime.combine(d, t, tzinfo=_KST)


def board_recent(days=7, limit=80, board_id=None, date_from=None, date_to=None):
    """기간 내 게시물. `board_id`를 주면 그 게시판만.

    ⚠️ **서버에 기간 필터 파라미터가 없다** — 최신순 목록을 받아 Python에서 잘라낸다.
       그래서 `date_from`보다 오래된 글이 나오면 그때 페이징을 멈추고, limit로 상한을 둔다.
    ⚠️ `date_to`는 **멈춤 조건이 아니라 건너뛰기**다 — 목록이 최신순이라 범위보다 새 글이
       앞에 먼저 나온다. 여기서 멈추면 "지난주"를 물었을 때 0건이 된다(실수하기 쉬운 지점).
    `days`는 date_from이 없을 때만 쓰는 폴백이다."""
    cutoff = _day_bounds(date_from, False) or (
        datetime.datetime.now(_KST) - datetime.timedelta(days=int(days)))
    newest = _day_bounds(date_to, True)
    out, page, pagesize = [], 0, 20
    while page < 15 and len(out) < int(limit):
        if board_id:
            qs = (f'/api/board/{int(board_id)}/posts/classic'
                  f'?page={page}&offset={pagesize}&sorts=sortCriteria+desc')
        else:
            qs = f'/api/board/myhome/all?page={page}&offset={pagesize}&url_type=all'
        j = gw_get(qs, timeout=60)
        rows = (j or {}).get('data') or []
        if not rows:
            break
        stop = False
        for p in rows:
            ts = str(p.get('createdAt') or '')
            try:
                when = datetime.datetime.fromisoformat(ts)
            except ValueError:
                when = None
            if when is not None and when < cutoff:
                stop = True            # 최신순이므로 여기부터는 전부 범위 밖 → 페이징 중단
                continue
            if newest is not None and when is not None and when > newest:
                continue               # 범위보다 새 글 — 건너만 뛴다(중단하면 0건이 된다)
            out.append(_post_brief(p))
        if stop or ((j or {}).get('page') or {}).get('lastPage'):
            break
        page += 1
    out = out[:int(limit)]
    return {'days': int(days), 'count': len(out),
            'from': cutoff.strftime('%Y-%m-%d'),
            'to': newest.strftime('%Y-%m-%d') if newest else '',
            'posts': out}


def board_post(board_id, post_id, body_limit=4000):
    """게시물 1건 본문. 요약·인용용 평문으로 돌려준다.

    ⚠️ 사내 공지는 **슬라이드를 그림으로 붙여** 올리는 경우가 흔하다(실측: 공지 30459는
       content가 `<img>`뿐이라 평문이 0자). 그때 빈 문자열만 돌려주면 받는 쪽에서
       '조회 실패'와 구분할 수 없으므로 `bodyNote`로 **사유를 드러낸다.**"""
    j = gw_get(f'/api/board/{int(board_id)}/post/{int(post_id)}/classic', timeout=60)
    d = (j or {}).get('data') or {}
    raw = d.get('content') or ''
    rec = _post_brief(d)
    rec['body'] = _html_to_text(raw, body_limit)
    rec['attaches'] = [{'name': a.get('name') or '', 'size': a.get('size') or 0}
                       for a in (d.get('attaches') or [])]
    rec['imageCount'] = len(re.findall(r'(?i)<img', raw))
    if not rec['body']:
        if rec['imageCount']:
            rec['bodyNote'] = (f'본문이 이미지 {rec["imageCount"]}장으로만 되어 있어 읽을 글자가 없습니다'
                               + ('. 첨부: ' + ', '.join(a['name'] for a in rec['attaches'])
                                  if rec['attaches'] else '.'))
        elif raw:
            rec['bodyNote'] = '본문에서 읽을 수 있는 글자를 찾지 못했습니다(서식만 있는 글).'
        else:
            rec['bodyNote'] = '본문이 비어 있습니다.'
    return rec


def boards():
    """볼 수 있는 게시판 목록(전사 + 부서). 게시판 지정 조회용.

    🐛 [2026-10-26 제보] 이 함수가 돌려주던 `id`는 **트리 노드 id**였지, 글 목록/등록/삭제
    API가 쓰는 **진짜 게시판 id**가 아니었다(`/api/department/boards`·`/api/board/company/
    boardsWithIp` 둘 다 바깥 `id`와 안쪽 `board.id`가 **다른 값** — 실측: 개발3팀 "업무관련
    확인사항 및 잡담"은 바깥 581, 진짜 829; "[디스플레이] 일간 뉴스"는 바깥 80, 진짜 130).
    공지사항처럼 두 값이 우연히 같은 경우(10=10)만 있어 지금까지 안 걸렸다 — AI가 이
    함수로 찾은 id로 `gw_board_write`를 호출하자 403(__go_checksum__)으로 막혀서야 드러났다.
    `board_recent(board_id=…)`/`board_post(board_id=…)`도 같은 함수를 쓰므로 특정 게시판
    번호로 조회할 때 전부 조용히 틀린 id를 쓰고 있었을 것 — 지금 고친다."""
    out = []
    j = gw_get('/api/board/company/boardsWithIp', timeout=45)
    for b in ((j or {}).get('data') or {}).get('boards') or []:
        if b.get('nodeType') == 'FOLDER':
            continue                   # 폴더는 글이 없다
        bid = (b.get('board') or {}).get('id') or b.get('id')
        out.append({'id': bid, 'name': b.get('nodeValue') or '', 'scope': '전사'})
    j = gw_get('/api/department/boards', timeout=45)
    for dept in (j or {}).get('data') or []:
        for b in dept.get('boards') or []:
            if b.get('nodeType') == 'FOLDER':
                continue
            bid = (b.get('board') or {}).get('id') or b.get('id')
            out.append({'id': bid, 'name': b.get('nodeValue') or '',
                        'scope': dept.get('deptName') or '부서'})
    return out


# ── 게시판 글 등록/삭제 (쓰기, 2026-10-26) ────────────────────────────
# 팀 게시판(개발3팀 > 업무관련 확인사항 및 잡담, boardId 829)에 테스트 글을 직접 올렸다
# 지우며 CDP Network로 확정했다(docs/groupware-research-tools.md 2절 절차).
#   POST   /api/board/{boardId}/post/   body: {boardId, postId:"", content, status:"OPEN",
#          notiMailFlag:false, notiPushFlag:false, attaches:[], links:[], publicWriter:false}
#   DELETE /api/board/{boardId}/post/{postId}   본문 없음
# ⚠️ **제목 칸이 따로 없다** — 빠른 글(피드) 작성 위젯은 `content` 하나만 받고, 읽을 때 쓰는
#   `title`은 서버가 content에서 뽑아낸다(실측: 첫 줄이 그대로 title이 됨). title 파라미터를
#   따로 추가하지 않는다 — 없는 칸을 있는 척하면 안 된다.


def board_write(board_id, content):
    """게시판에 글을 올린다. **전사/부서에 즉시 공개된다 — 되돌릴 수 없다**(삭제는 가능).

    content 첫 줄이 목록에서 제목처럼 보인다. 첨부·링크는 아직 지원하지 않는다."""
    if not content or not str(content).strip():
        raise RuntimeError('내용이 비어 있습니다.')
    body = {'boardId': str(int(board_id)), 'postId': '', 'content': str(content),
            'status': 'OPEN', 'notiMailFlag': False, 'notiPushFlag': False,
            'attaches': [], 'links': [], 'publicWriter': False}
    js = r"""
    (async (bid, payload) => {
      const r = await fetch('/api/board/' + bid + '/post/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      const ct = r.headers.get('content-type') || '';
      const b = ct.includes('json') ? await r.json() : (await r.text()).slice(0, 300);
      return { status: r.status, ok: r.ok, body: b };
    })(%s, %s)
    """ % (int(board_id), json.dumps(body, ensure_ascii=False))
    res = eval_in_gw(js, timeout=45) or {}
    if not res.get('ok'):
        raise RuntimeError('게시판 글 등록 실패 (HTTP %s): %s' % (res.get('status'), str(res.get('body'))[:200]))
    data = res.get('body') or {}
    d = data.get('data') if isinstance(data.get('data'), dict) else data
    return {'ok': True, 'boardId': int(board_id), 'postId': (d or {}).get('id'), 'content': content}


def board_delete_post(board_id, post_id):
    """게시판 글을 삭제한다. **되돌릴 수 없다** — 호출 전 사람 확인을 거칠 것."""
    js = r"""
    (async (bid, pid) => {
      const r = await fetch('/api/board/' + bid + '/post/' + pid,
                            { method: 'DELETE', credentials: 'same-origin' });
      return { status: r.status, ok: r.ok };
    })(%s, %s)
    """ % (int(board_id), int(post_id))
    res = eval_in_gw(js, timeout=30) or {}
    if not res.get('ok'):
        raise RuntimeError('게시판 글 삭제 실패 (HTTP %s)' % res.get('status'))
    return {'ok': True}


# ── 메일 (읽기 전용) ─────────────────────────────────────────────────
# ⚠️⚠️ **메일을 열지 않는다.** 상세 조회는 서버에서 `읽음`으로 바꿔버린다 — 사용자 메일함의
#   안읽음 배지가 조용히 줄어드는 건 조사·요약이 일으켜도 되는 변화가 아니다.
#   목록 응답의 `preview`에 본문 발췌가 들어 있어 요약에는 그걸로 충분하다(실측).
# ⚠️ `message/list`는 **POST + JSON**이다(게시판·전자결재는 GET 쿼리스트링). 모듈마다 다르다.
#   검색어 키는 `keyWord` — 대문자 W. `keyword`로 주면 조용히 무시된다.
# ⚠️ 이 POST는 조회 전용이라 아래 허용목록(_MAIL_POST_ALLOW)에 있는 경로만 부른다.
#   쓰기(발송·삭제·읽음처리)는 **여기에 만들지 않는다** — 허용목록이 그 가드다.
#   [2026-10-22] 쪽지(`/api/mail/note/list`)도 메일 시스템의 폴더(`__go_note__`)라 여기로 온다.
_MAIL_POST_ALLOW = ('/api/mail/message/list', '/api/mail/message/count',
                    '/api/mail/note/list')

_MAIL_FOLDERS = {
    'inbox': 'Inbox', '받은': 'Inbox', '받은메일함': 'Inbox',
    'sent': 'Sent', '보낸': 'Sent', '보낸메일함': 'Sent',
    'drafts': 'Drafts', '임시': 'Drafts', '임시보관함': 'Drafts',
    'trash': 'Trash', '휴지통': 'Trash',
}

_POST_JSON = """
(async () => {
  const r = await fetch(%s, { method:'POST', credentials:'same-origin',
    headers:{ 'Content-Type':'application/json; charset=UTF-8', Accept:'application/json' },
    body: JSON.stringify(%s) });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !ct.includes('json')) {
    return { __err: true, status: r.status, body: (await r.text()).slice(0, 200) };
  }
  return await r.json();
})()
"""


def _mail_post(path, body, timeout=60):
    if path not in _MAIL_POST_ALLOW:
        raise ValueError(f'허용되지 않은 메일 경로입니다(조회 전용): {path}')
    res = eval_in_gw(_POST_JSON % (json.dumps(path), json.dumps(body, ensure_ascii=False)), timeout)
    if isinstance(res, dict) and res.get('__err'):
        raise RuntimeError(f'그룹웨어 메일 API {path} → HTTP {res.get("status")}: {res.get("body")}')
    return res


_ENT_RE = re.compile(r'&#(\d{1,5});')


def _unentity(s):
    """`preview`는 `&#91;`처럼 숫자 엔티티로 와서 그냥 쓰면 읽을 수 없다."""
    t = _ENT_RE.sub(lambda m: chr(int(m.group(1))), str(s or ''))
    for a, b in (('&nbsp;', ' '), ('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
                 ('&quot;', '"'), ('&#39;', "'")):
        t = t.replace(a, b)
    return _WS_RE.sub(' ', t).strip()


def _mail_brief(m):
    utc = str(m.get('dateUtc') or m.get('sentDateUtc') or '')
    kst = ''
    try:
        kst = (datetime.datetime.strptime(utc[:19], '%Y-%m-%dT%H:%M:%S')
               .replace(tzinfo=datetime.timezone.utc).astimezone(_KST).isoformat())
    except ValueError:
        pass
    return {
        'id': m.get('id'),
        'subject': _unentity(m.get('subject') or '(제목 없음)'),
        'from': _unentity(m.get('fromToSimple') or m.get('from') or ''),
        'to': _unentity(m.get('sendToSimple') or ''),
        'at': kst or utc,
        'date': (kst or utc)[:10],
        'seen': bool(m.get('seen')),
        'size': m.get('size') or '',
        'priority': m.get('priority') or '',
        'folder': m.get('folderName') or '',
        'preview': _unentity(m.get('preview') or '')[:400],
    }


def mail_recent(date_from=None, date_to=None, folder='Inbox', unread_only=False,
                limit=80, keyword=None):
    """기간 내 메일 목록. **메일을 열지 않는다**(열면 읽음 처리된다).

    ⚠️ 서버에 기간 필터가 없다 — 최신순 목록을 받아 코드에서 자른다(게시판과 같은 구조).
       `date_to`는 중단이 아니라 **건너뛰기**(최신순이라 중단하면 "어제"가 0건이 된다).
    `folder`는 'Inbox'/'Sent'/'Drafts'/'Trash' 또는 한국어('받은','보낸'…)."""
    fol = _MAIL_FOLDERS.get(str(folder or '').strip().lower(), folder or 'Inbox')
    cutoff = _day_bounds(date_from, False) or (
        datetime.datetime.now(_KST) - datetime.timedelta(days=1))
    newest = _day_bounds(date_to, True)

    out, page, unread_total, total = [], 1, None, None
    while page <= 15 and len(out) < int(limit):
        body = {'folder': fol, 'sharedFlag': 'user', 'page': page}
        if unread_only:
            body['flag'] = 'U'
        if keyword:
            body.update({'folder': 'all', 'keyWord': keyword,
                         'sharedUserSeq': '0', 'sharedFolderName': ''})
        d = (_mail_post('/api/mail/message/list', body) or {}).get('data') or {}
        if total is None:
            total = d.get('total')
            unread_total = d.get('unreadMessageCount')
        rows = d.get('messageList') or []
        if not rows:
            break
        stop = False
        for m in rows:
            rec = _mail_brief(m)
            try:
                when = datetime.datetime.fromisoformat(rec['at'])
            except ValueError:
                when = None
            if when is not None and when < cutoff:
                stop = True            # 최신순 → 뒤는 전부 범위 밖
                continue
            if newest is not None and when is not None and when > newest:
                continue               # 범위보다 새 메일 — 건너만 뛴다
            out.append(rec)
        if stop:
            break
        page += 1
    out = out[:int(limit)]
    return {'folder': fol, 'count': len(out), 'folderTotal': total,
            'unreadTotal': unread_total, 'unreadOnly': bool(unread_only),
            'from': cutoff.strftime('%Y-%m-%d'),
            'to': newest.strftime('%Y-%m-%d') if newest else '',
            'mails': out}


# ── 메일 발송 (쓰기, 2026-10-26) ────────────────────────────────────────
# 위 _mail_post/_MAIL_POST_ALLOW는 **조회 전용 가드**라 일부러 여기서 안 쓴다 — 발송은
# 별도 함수로 분리(파일 상단 주석 "쓰기는 여기 만들지 않는다"와 같은 이유로 뒤집어).
# payload는 추측이 아니라 실제 나에게 테스트 메일 하나를 그룹웨어 화면에서 직접 보내며
# CDP Network로 관찰해 확정했다(docs/groupware-research-tools.md 2절 절차).
#   POST /api/mail/message/send
#   관찰된 필드 다수(attachsign/signSeq/sharedFlag 등)는 화면이 보내는 그대로이고,
#   서명(attachsign)은 **일부러 끈다** — API로 보내는 메일에 개인 서명 템플릿을
#   자동으로 끼워 넣는 게 더 위험하다(무슨 내용이 섞여 나가는지 안 보임).
_MAIL_SEND_JS = r"""
(async (payload) => {
  const r = await fetch('/api/mail/message/send', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const ct = r.headers.get('content-type') || '';
  const body = ct.includes('json') ? await r.json() : (await r.text()).slice(0, 300);
  return { status: r.status, ok: r.ok, body };
})(%s)
"""


def _mail_html_escape(text):
    t = str(text or '')
    t = t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return '<p>' + t.replace('\r\n', '\n').replace('\n', '</p><p>') + '</p>'


def mail_send(to, subject, body, *, cc='', bcc='', dry_run=False):
    """그룹웨어 자체 메일로 발송한다. **상대방에게 실제로 간다 — 되돌릴 수 없다.**

    to/cc/bcc: 쉼표로 구분한 이메일 주소(이름 없이 주소만 줘도 된다 — 실측상 받아들인다).
    body: 일반 텍스트로 받아 문단으로 감싼다(HTML을 직접 넣고 싶으면 그대로 와도 된다 —
          <, > 로 시작하면 이미 HTML로 보고 그대로 쓴다).
    서명(개인 연락처 템플릿)은 자동으로 안 붙인다 — API로 보내는 메일에 뭐가 섞여
    나가는지 안 보이는 채로 붙이는 게 더 위험하다."""
    s = session_info()
    if not s.get('ok'):
        raise RuntimeError(s.get('message') or '그룹웨어 로그인이 필요합니다.')
    if not to or not subject:
        raise RuntimeError('받는사람과 제목은 필수입니다.')
    content = str(body or '')
    if not content.lstrip().startswith('<'):
        content = _mail_html_escape(content)
    payload = {
        'senderEmail': s.get('email') or '', 'senderName': s.get('name') or '',
        'sendType': 'normal', 'sendFlag': 'normal', 'charset': 'UTF-8',
        'attachsign': False, 'attachSign': False, 'signSeq': '', 'signLocation': 'inside',
        'bannerDisplay': False,
        'to': to, 'cc': cc or '', 'bcc': bcc or '',
        'massMode': False, 'senderMode': False, 'useAliasEmail': False,
        'subject': subject, 'writeMode': 'html', 'content': content,
        'receiveNoti': False, 'saveSent': True,
        'attachList': '', 'bigAttachContent': '', 'bigAttachMode': False, 'bigAttachLinks': None,
        'sharedFlag': 'user', 'sharedUserSeq': '0', 'sharedFolderName': '',
    }
    if dry_run:
        return {'ok': True, 'dryRun': True, 'payload': payload}
    res = eval_in_gw(_MAIL_SEND_JS % json.dumps(payload, ensure_ascii=False), timeout=45) or {}
    if not res.get('ok'):
        raise RuntimeError('메일 발송 실패 (HTTP %s): %s' % (res.get('status'), str(res.get('body'))[:200]))
    data = res.get('body') or {}
    d = data.get('data') if isinstance(data.get('data'), dict) else data
    return {'ok': True, 'to': to, 'cc': cc or '', 'subject': subject,
            'messageId': (d or {}).get('id') or (d or {}).get('messageId')}


# ── Works (사내 저작도구 미니앱, 읽기 전용, 2026-10-26) ──────────────────
# "Works"는 전자결재와 다른 **자체 양식 빌더**다 — IT 렌트·리조트 예약·법인카드 한도증액 등
# 20여 개 앱이 전부 사람이 직접 만든 것이라, 앱마다 칸(필드) 구성이 완전히 다르다.
# ⚠️⚠️ 그래도 **엔드포인트 모양은 전부 같다**(제너릭 폼 엔진) — `/api/works/applets/{id}/...`
#   하나로 20개 앱을 전부 다룰 수 있다. 칸 이름은 `/fields`가 매번 알려주므로 앱마다 코드를
#   따로 안 짠다(CLAUDE.md "하드코딩 지양" 그대로).
#   실측(appletId=30, "IT 문의/요청"): GET .../fields?p=true → [{cid:"_rc5t2hl08", label:"유형",
#   fieldType:"select", options:[{value,displayText}, ...]}, ...]. GET .../docs?q=&page=0&
#   offset=N&property=create_date&direction=desc&ac=true → data[].values 에 {cid: 값} —
#   select는 숫자 코드라 options로 되짚어야 글자가 나오고, 사람/부서 칸은 객체(배열)라
#   이름만 뽑아야 한다.
# ⚠️ 쓰기(새 글 등록)는 **아직 안 만들었다** — 앱마다 필수 칸·입력 규칙이 달라 한 앱씩 검증해야
#   한다(캘린더/메일/게시판과 달리 "하나만 확정하면 끝"이 아니다). 실제로 특정 앱에 쓰기가
#   필요해지면 그때 그 앱 하나를 테스트로 확정할 것 — 20개를 미리 다 만들지 않는다.
_WORKS_FIELDS_CACHE = {}


def works_apps():
    """내가 쓸 수 있는 Works 앱(미니 폼) 목록 — appletId를 알아야 `works_list`를 부를 수 있다."""
    j = gw_get('/api/works/applets')
    out = []
    for a in (j or {}).get('data') or []:
        out.append({'id': a.get('id'), 'name': a.get('name') or '', 'desc': (a.get('desc') or '')[:200]})
    return out


def _works_fields(applet_id, force=False):
    """그 앱의 칸 정의(cid→이름/타입/선택지) — 프로세스 내 캐시(앱 구조는 거의 안 바뀐다)."""
    if not force and applet_id in _WORKS_FIELDS_CACHE:
        return _WORKS_FIELDS_CACHE[applet_id]
    j = gw_get(f'/api/works/applets/{int(applet_id)}/fields?p=true', timeout=45)
    out = {}
    for f in (j or {}).get('data') or []:
        opts = {o.get('value'): o.get('displayText') for o in (f.get('options') or [])}
        out[f.get('cid')] = {'label': f.get('label') or f.get('cid'),
                             'type': f.get('fieldType') or '', 'options': opts}
    _WORKS_FIELDS_CACHE[applet_id] = out
    return out


def _works_decode(v, finfo):
    """select는 숫자 코드 → options로 글자를, 사람/부서는 객체(배열) → 이름만 뽑는다."""
    if v is None or v == '':
        return ''
    if finfo and finfo.get('options') and v in finfo['options']:
        return finfo['options'][v]
    if isinstance(v, list):
        names = [(x.get('fullName') or x.get('name') or '') if isinstance(x, dict) else str(x) for x in v]
        return ', '.join(n for n in names if n)
    if isinstance(v, dict):
        return v.get('fullName') or v.get('name') or ''
    return v


def works_list(applet_id, limit=20, keyword=None):
    """Works 앱 한 개의 최근 등록 목록. 칸 이름은 그 앱의 `/fields`로 매번 받아 맞춘다."""
    fields = _works_fields(applet_id)
    from urllib.parse import quote
    qs = (f'/api/works/applets/{int(applet_id)}/docs?q={quote(keyword or "")}&page=0'
          f'&offset={int(limit)}&property=create_date&direction=desc&ac=true')
    j = gw_get(qs, timeout=60)
    out = []
    for d in (j or {}).get('data') or []:
        rec = {'id': d.get('id'), 'status': (d.get('status') or {}).get('name') or ''}
        for cid, v in (d.get('values') or {}).items():
            if cid == 'creator':
                rec['작성자'] = _works_decode(v, None)
                continue
            if cid in ('create_date', 'update_date', 'updater'):
                continue        # 목록엔 과한 정보 — 필요하면 따로 추가
            finfo = fields.get(cid)
            rec[finfo['label'] if finfo else cid] = _works_decode(v, finfo)
        out.append(rec)
    return {'appletId': int(applet_id), 'total': ((j or {}).get('page') or {}).get('total'),
            'count': len(out), 'docs': out}


# ── 보고 (주간업무보고 등 정기/비정기 보고) (읽기 전용, 2026-10-26) ──────────
# 제목 칸이 따로 없다 — 목록 화면에 보이는 "연구소 주간업무보고" 같은 이름은
# series가 속한 report folder(=보고 시리즈)의 이름 + 그 안 회차 번호를 합친 것.
#   GET /api/report/department           부서별 보고 폴더(시리즈) 목록 → folderId
#   GET /api/report/done?offset=&page=0&property=submittedAt&direction=desc
#       전사 최신 제출 보고 목록(제목·회차 없이 folder/series 객체로만 옴) — 서버에
#       폴더 필터 파라미터가 없어 Python에서 걸러낸다(board_recent과 같은 사정).
#   GET /api/report/{id}                 보고 1건 본문(content, HTML)

def report_folders():
    """부서별 보고 시리즈(정기/비정기) 목록 — report_list(folder_id=...)에 쓸 id를 찾는다."""
    j = gw_get('/api/report/department', timeout=45)
    out = []
    for dept in (j or {}).get('data') or []:
        for f in dept.get('folders') or []:
            out.append({'id': f.get('id'), 'name': f.get('name') or '',
                        'dept': dept.get('name') or '', 'type': f.get('type') or '',
                        'totalCount': f.get('totalCount'), 'totalSeries': f.get('totalSeries')})
    return out


def report_list(folder_id=None, limit=20):
    """최근 제출된 보고 목록. folder_id를 주면 그 시리즈만 걸러낸다(report_folders로 id 확인).

    ⚠️ 서버에 폴더 필터가 없다 — 전체 최신순을 받아 Python에서 거르므로, 거를 게 있으면
       더 넉넉히 받아야 한다(최대 200건)."""
    want = int(limit)
    page_size = want if not folder_id else min(want * 10, 200)
    j = gw_get(f'/api/report/done?offset={page_size}&page=0&property=submittedAt&direction=desc',
               timeout=60)
    out = []
    for d in (j or {}).get('data') or []:
        folder = d.get('folder') or {}
        if folder_id and folder.get('id') != int(folder_id):
            continue
        rep = d.get('reporter') or {}
        series = d.get('series') or {}
        out.append({
            'id': d.get('id'),
            'title': (f"{folder.get('name') or ''} {series.get('series') or ''}회").strip(),
            'folderId': folder.get('id'),
            'dept': (d.get('department') or {}).get('name') or '',
            'reporter': rep.get('fullName') or rep.get('name') or '',
            'submittedAt': d.get('submittedAt') or '',
        })
        if len(out) >= want:
            break
    return {'count': len(out), 'reports': out}


def report_detail(report_id, body_limit=4000):
    """보고 1건 본문. 요약·인용용 평문으로 돌려준다."""
    j = gw_get(f'/api/report/{int(report_id)}', timeout=45)
    d = (j or {}).get('data') or {}
    folder = d.get('folder') or {}
    series = d.get('series') or {}
    rep = d.get('reporter') or {}
    raw = d.get('content') or ''
    rec = {
        'id': d.get('id'),
        'title': (f"{folder.get('name') or ''} {series.get('series') or ''}회").strip(),
        'dept': (d.get('department') or {}).get('name') or '',
        'reporter': rep.get('fullName') or rep.get('name') or '',
        'submittedAt': d.get('submittedAt') or '',
        'body': _html_to_text(raw, body_limit),
    }
    if not rec['body']:
        rec['bodyNote'] = '본문에서 읽을 수 있는 글자를 찾지 못했습니다.' if raw else '본문이 비어 있습니다.'
    return rec


# ── ToDO+ (칸반 보드, 읽기 전용, 2026-10-26) ─────────────────────────────
# 사이드바 메뉴는 `ic_home_todo`(실측 href=/app/todo). Works와 달리 칸 이름(cid)이
# 아니라 **칸반 컬럼(category)** 이 보드마다 다른 구조 — 카드의 `todoCategoryId`를
# 그 보드의 `/api/todo/{id}` 응답 속 `categories[].title`로 되짚어야 사람이 읽을 수 있다.
#   GET  /api/todo/my                내 보드 목록(이 계정은 보통 1~2개뿐)
#   GET  /api/todo/{boardId}         보드 상세 — categories(칸)·labels·members
#   POST /api/todo/{boardId}/item/list   body {} — **페이징 없이 전체 카드**를 한 번에 준다
#        (실측: boardId 726 — 카드 155개가 `page.offset:0`에도 전부 옴. 그래서 여기서
#        Python으로 최신순 정렬 후 자른다 — board_recent/works_list와 같은 사정)

_TODO_CATS_CACHE = {}


def todo_boards():
    """ToDO+ 칸반 보드 목록 — board_id를 알아야 todo_items를 부를 수 있다."""
    j = gw_get('/api/todo/my', timeout=45)
    out = []
    for b in (j or {}).get('data') or []:
        out.append({'id': b.get('id'), 'title': (b.get('title') or '').strip(),
                    'memberCount': len(b.get('members') or []) + 1,
                    'categoryCount': len(b.get('categories') or [])})
    return out


def _todo_categories(board_id, force=False):
    """그 보드의 칸반 컬럼 id→이름. 보드 구조는 거의 안 바뀌어 프로세스 내 캐시."""
    if not force and board_id in _TODO_CATS_CACHE:
        return _TODO_CATS_CACHE[board_id]
    j = gw_get(f'/api/todo/{int(board_id)}', timeout=45)
    out = {c.get('id'): (c.get('title') or '').strip()
           for c in ((j or {}).get('data') or {}).get('categories') or []}
    _TODO_CATS_CACHE[board_id] = out
    return out


def todo_items(board_id, keyword=None, limit=30):
    """ToDO+ 보드 1개의 카드 목록 — 최신 수정순. 서버가 전체를 한 번에 주므로 여기서 자른다.

    keyword를 주면 카드 제목이나 칸(컬럼) 이름에 그 글자가 있는 것만 먼저 거른다."""
    cats = _todo_categories(board_id)
    js = r"""
    (async (bid) => {
      const r = await fetch('/api/todo/' + bid + '/item/list', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}'
      });
      return await r.json();
    })(%s)
    """ % int(board_id)
    j = eval_in_gw(js, timeout=45) or {}
    rows = [c for c in (j.get('data') or []) if c.get('deleteFlag') != 'Y']
    kw = (keyword or '').strip()
    if kw:
        rows = [c for c in rows if kw in (c.get('title') or '') or kw in cats.get(c.get('todoCategoryId'), '')]
    rows.sort(key=lambda c: c.get('updatedAt') or '', reverse=True)
    out = []
    for c in rows[:int(limit)]:
        out.append({
            'id': c.get('id'),
            'title': (c.get('title') or '').strip(),
            'category': cats.get(c.get('todoCategoryId'), ''),
            'dueDate': (c.get('dueDate') or '')[:10],
            'members': ', '.join((m.get('fullName') or m.get('name') or '') for m in (c.get('members') or [])),
            'attachCount': len(c.get('attaches') or []),
            'commentCount': c.get('commentCount') or 0,
        })
    return {'boardId': int(board_id), 'total': len(rows), 'count': len(out), 'items': out}


# ── 문서관리 / 예약 / 커뮤니티 / 설문 / 자료실 / 전자결재 문서함 (읽기 전용) ──
# 필드 이름은 전수 조사(2026-10-19)로 실측 확인한 것만 쓴다 — 추측 금지.
# 상세는 docs/groupware-endpoints.md.

_DOCS_KINDS = {
    'approvewaiting': '승인 대기', 'registwaiting': '등록 대기',
    'latestread': '최근 열람', 'favorite': '즐겨찾기',
}


def docs_waiting(kind='latestread', limit=20):
    """문서관리 문서 목록. kind = approvewaiting / registwaiting / latestread / favorite."""
    k = str(kind or 'latestread').strip()
    if k not in _DOCS_KINDS:
        raise ValueError('kind는 %s 중 하나입니다.' % ' / '.join(_DOCS_KINDS))
    j = gw_get('/api/docs/folder/%s?offset=%d' % (k, int(limit)), timeout=60)
    out = []
    for d in (j or {}).get('data') or []:
        out.append({
            'id': d.get('docsId'), 'infoId': d.get('docsInfoId'),
            'title': d.get('title') or '',
            'folder': d.get('folderName') or '',
            'folderPath': d.get('folderPath') or '',
            'creatorName': d.get('creatorName') or '',
            'creatorPosition': d.get('creatorPositionName') or '',
            'status': d.get('docsStatus') or '',
            'requestDate': d.get('requestDate') or '',
            'completDate': d.get('completDate') or '',
            'readDate': d.get('readDate') or '',
            'attachCount': d.get('attachCount') or 0,
        })
    return {'kind': k, 'kindName': _DOCS_KINDS[k], 'count': len(out), 'docs': out}


def assets():
    """예약 가능한 자원(회의실·차량 등) 목록. `/api/asset/reservation`이 자원 목록을 준다."""
    j = gw_get('/api/asset/reservation', timeout=60)
    out = []
    for a in (j or {}).get('data') or []:
        if str(a.get('status') or '') != 'ACTIVE':
            continue
        out.append({'id': a.get('id'), 'name': a.get('name') or '',
                    'rental': bool(a.get('useRental'))})
    return out


def asset_reservations(asset_id=None, date=None):
    """해당 날짜의 예약 현황. asset_id를 생략하면 활성 자원 전부를 돈다.

    ⚠️ `fromDate`는 ISO+09:00 형식이 필요하다('YYYY-MM-DDT00:00:00.000+09:00').
    ⚠️ [2026-10-27 실사용 제보] `/items/daily`는 이름과 달리 **그날 하루로 안 끊긴다** —
       fromDate=2026-10-28 로 불러도 2026-10-29 예약까지 섞여 온다(실측: 47건 중 절반이
       다음날). AI 문답에서 "내일 회의실 예약"을 물었더니 **오늘·내일이 섞인 47건**을
       그대로 받아 대답이 날짜를 헷갈렸다 — 요청한 날짜로 여기서 걸러낸다."""
    day = str(date or datetime.datetime.now(_KST).strftime('%Y-%m-%d')).strip()
    if not _day_bounds(day, False):
        raise ValueError('date는 YYYY-MM-DD 형식입니다.')
    targets = ([{'id': int(asset_id), 'name': ''}] if asset_id
               else assets())
    from urllib.parse import quote
    frm = quote('%sT00:00:00.000+09:00' % day, safe='')
    out = []
    for a in targets:
        try:
            j = gw_get('/api/asset/%d/items/daily?fromDate=%s' % (int(a['id']), frm), timeout=60)
        except Exception as e:
            out.append({'asset': a.get('name') or a['id'], 'error': str(e)[:120]})
            continue
        for r in (j or {}).get('data') or []:
            start = r.get('startTime') or ''
            if start[:10] != day:          # 서버가 다음날 것까지 끼워 보낸다 — 요청한 날짜만 남긴다
                continue
            u = r.get('user') or {}
            out.append({
                'id': r.get('id'), 'asset': a.get('name') or '', 'item': r.get('itemName') or '',
                'start': start, 'end': r.get('endTime') or '',
                'allday': bool(r.get('allday')),
                'user': u.get('name') or '', 'position': u.get('positionName') or '',
            })
    out.sort(key=lambda x: str(x.get('start') or ''))
    return {'date': day, 'count': len(out), 'reservations': out}


def community_feed(limit=20):
    """내가 가입한 커뮤니티의 최신 글 피드."""
    j = gw_get('/api/community/myfeed?page=0&offset=%d' % int(limit), timeout=60)
    out = []
    for p in (j or {}).get('data') or []:
        out.append(_post_brief(p))      # 게시판과 같은 구조라 그대로 쓴다
    return {'count': len(out), 'posts': out}


def community_list(limit=30):
    """커뮤니티 목록(멤버수 순)."""
    j = gw_get('/api/community/list/all?page=0&offset=%d&property=memberCount' % int(limit), timeout=60)
    out = []
    for c in (j or {}).get('data') or []:
        out.append({'id': c.get('id'), 'name': c.get('name') or '',
                    'description': (c.get('description') or '').replace('\r\n', ' ')[:160],
                    'members': c.get('memberCount') or 0, 'posts': c.get('postCount') or 0,
                    'master': c.get('masterUser') or '', 'joined': c.get('memberStatus') or ''})
    return {'count': len(out), 'communities': out}


def surveys(kind='latest', limit=20):
    """설문 목록. kind = todo(응답 대기) / latest(최근)."""
    k = 'todo' if str(kind or '').strip() == 'todo' else 'latest'
    j = gw_get('/api/survey/list/%s?page=0&offset=%d&property=id&direction=desc'
               % (k, int(limit)), timeout=60)
    out = []
    for s in (j or {}).get('data') or []:
        cr = s.get('creator') or {}
        out.append({'id': s.get('id'), 'title': s.get('title') or '',
                    'start': s.get('startTime') or '', 'end': s.get('endTime') or '',
                    'status': s.get('status') or '',
                    'creator': cr.get('name') if isinstance(cr, dict) else ''})
    # ⚠️ 설문 목록은 서버가 offset을 **무시**한다(limit=3을 줘도 20건이 온다, 2026-10-19 실측)
    #    → 여기서 자른다. 다른 모듈처럼 offset이 먹는다고 가정하지 말 것.
    out = out[:int(limit)]
    return {'kind': k, 'count': len(out), 'surveys': out}


def webfolder_list(path='/', limit=30, scope='public'):
    """자료실 폴더/파일 목록.

    ⚠️ 자료실 화면은 `iframe#webfolder-viewer` 안이지만 **API 직접 호출은 무관**하다."""
    from urllib.parse import quote
    p = str(path or '/').strip() or '/'
    qs = ('/api/webfolder/folder/list?path=%s&fullPath=%s&currentPage=1&offset=%d&type=%s'
          % (quote(p, safe=''), quote(p, safe=''), int(limit),
             'user' if str(scope) == 'user' else 'public'))
    j = gw_get(qs, timeout=60)
    d = (j or {}).get('data') or {}
    out = []
    for f in d.get('folders') or []:
        out.append({'name': f.get('name') or f.get('folderName') or '',
                    'path': f.get('path') or '', 'type': f.get('type') or '',
                    'size': f.get('size') or '', 'updatedAt': f.get('updatedAt') or ''})
    return {'path': d.get('currentPath') or p, 'total': d.get('total'),
            'count': len(out), 'items': out}


# ── 📇 주소록 (읽기) ─────────────────────────────────────────────────
# 조사 기록(2026-10-22 실측, docs/groupware.md 11절):
#   · 경로는 `/api/contact/search` — 번들 `contact/collections/search_contact` 의 `default`
#     객체에서 파라미터 이름을 확정했다(추측 아님):
#     keyword / page / offset / property / direction / ownerType / searchType
#   · `/api/contact/contacts` 는 `type` 이 필수라 인자 없이는 **500**("require type!!").
#   · `/app/contact` 진입만으로는 목록 요청이 안 잡힌다 — 그래서 번들에서 경로를 뽑았다.
#
# ⚠️⚠️ **`keyword` 는 `searchType=or` 를 같이 보내야 동작한다.**
#   keyword 만 주거나 `searchType=and` 로 주면 서버가 오류 없이 **전건(375건)** 을 돌려준다.
#   0건이면 "없나?" 하고 의심하지만 전건은 "검색이 됐다"고 착각하게 되므로 더 위험하다
#   (실측: keyword=박 단독 → 375건 / searchType=or 동반 → 18건).
#   그래서 호출하는 쪽이 빼먹을 수 없게 **여기 기본값으로 박는다.**
def contacts_search(keyword='', limit=20, page=0):
    """사내 주소록 검색. keyword 를 비우면 전체(이름 가나다순)."""
    qs = ('page=%d&offset=%d&property=nameInitialConsonant&direction=asc'
          '&ownerType=&searchType=or&keyword=%s'
          % (max(0, int(page)), max(1, int(limit)),
             urllib.parse.quote(str(keyword or '').strip())))
    j = gw_get('/api/contact/search?' + qs, timeout=60)
    out = []
    for c in (j or {}).get('data') or []:
        off = c.get('office') or {}
        out.append({
            'name': c.get('name') or '',
            'position': c.get('positionName') or '',
            'dept': c.get('departmentName') or '',
            'company': c.get('companyName') or '',
            'email': c.get('email') or '',
            'mobile': c.get('mobileNo') or '',
            'tel': (off.get('tel') or '') if isinstance(off, dict) else '',
            'address': (off.get('basicAddress') or '') if isinstance(off, dict) else '',
        })
    pg = (j or {}).get('page') or {}
    return {'keyword': str(keyword or '').strip(), 'count': len(out),
            'total': pg.get('total'), 'page': pg.get('page'), 'contacts': out}


# ── 🔔 알림 (읽기) ───────────────────────────────────────────────────
# `/api/my/noti` 가 전체, `/api/my/noti/<카테고리>` 가 필터다(실측: approval 187 / bbs 9 /
# mail 0 / calendar 0, 전체 196). 카테고리 목록은 번들에서 뽑은 것이고 `unread` 도 같은
# 자리에 있는 **필터 하나**다(별도 경로가 아님).
# ⚠️ GET 목록 조회라 읽음 처리는 일어나지 않는다. 읽음 처리 경로는 **만들지 않았다**.
_NOTI_CATEGORIES = ('all', 'unread', 'approval', 'asset', 'bbs', 'calendar', 'channel',
                    'community', 'docs', 'ehr', 'mail', 'manager', 'openapi', 'report',
                    'survey', 'task', 'todo', 'webfolder', 'works')


def notifications(category='all', limit=15):
    """그룹웨어 알림 목록. category=all(전체)/unread(안읽음)/모듈명."""
    cat = str(category or 'all').strip().lower()
    if cat not in _NOTI_CATEGORIES:
        raise ValueError('알 수 없는 알림 분류입니다: %s (가능: %s)'
                         % (cat, ', '.join(_NOTI_CATEGORIES)))
    path = '/api/my/noti' if cat == 'all' else '/api/my/noti/%s' % cat
    j = gw_get('%s?page=0&offset=%d' % (path, max(1, int(limit))), timeout=60)
    out = []
    for n in (j or {}).get('data') or []:
        out.append({'category': n.get('category') or '',
                    'sender': n.get('sender') or '',
                    'message': _unentity(n.get('message')),
                    'at': n.get('createdAt') or ''})
    pg = (j or {}).get('page') or {}
    return {'category': cat, 'count': len(out), 'total': pg.get('total'),
            'notifications': out}


# ── 💬 쪽지 (읽기) ───────────────────────────────────────────────────
# 쪽지는 **메일 시스템의 폴더 하나**(`__go_note__`)다 — 그래서 레코드가 메일 모양이다.
# `/api/mail/note/list` 는 **POST JSON**이다(번들 goGrid `method:"POST"`, GET 은 405).
# ⚠️ form-encoded 로 보내면 `tabType=__go_note__` 외에는 **400** 이다 → JSON 으로 보낸다.
# ⚠️ `keyWord` 는 서버가 **무시한다**(실측: '추석'·없는 말 모두 전건 3건) → 인자로 두지 않는다.
#    `tabType` 도 inbox/sent/allBox 가 모두 같은 결과였는데, 사내 쪽지가 3건뿐이라
#    **구분이 되는지 확인하지 못했다.** 되는 것처럼 적지 않는다.
def notes(limit=10):
    """쪽지 목록(받은 쪽지함). 읽기 전용 — 보내기·삭제 경로는 만들지 않았다."""
    n = max(1, int(limit))
    j = _mail_post('/api/mail/note/list',
                   {'page': 0, 'offset': n, 'tabType': '__go_note__',
                    'folder': '__go_note__'}, timeout=60)
    out = []
    for m in (j or {}).get('data') or []:
        out.append({'from': m.get('fromToSimple') or '',
                    'to': m.get('sendToSimple') or '',
                    'subject': _unentity(m.get('subject')),
                    'preview': _unentity(m.get('preview'))[:200],
                    'at': m.get('dateUtc') or '',
                    'read': bool(m.get('seen'))})
    # ⚠️ 설문 목록과 같이 서버가 `offset` 을 **무시한다**(실측: offset=2 → 3건) → 여기서 자른다.
    out = out[:n]
    pg = (j or {}).get('page') or {}
    return {'count': len(out), 'total': pg.get('total'), 'notes': out}


_APPR_BOXES = {
    'draft': ('기안 문서함', 'draftedAt'),
    'tempsave': ('임시 저장함', 'updatedAt'),
    'approve': ('결재 문서함', 'draftedAt'),
    'viewer': ('참조/열람 문서함', 'document.draftedAt'),
}


def approval_doclist(box='draft', limit=20, searchtype=None, keyword=None, duration='all'):
    """전자결재 문서함 목록.

    box = draft(기안) / tempsave(임시저장) / approve(결재) / viewer(참조열람)
    searchtype = title / drafterName / drafterDeptName / formName / docNum / activityUserName
    duration = all / 1 / 6 / 12  (개월)
    ⚠️ 문서함마다 기본 정렬 컬럼(property)이 다르다 — 섞으면 서버가 500을 준다.

    ⚠️⚠️ box='draft'(기본)는 **내가 기안한 문서만** 본다. 남이 올린 문서를 문서번호로 찾으면
    영원히 0건이다(2026-10-21 제보: RD3-2610-050 을 draft 에서만 찾아 "없음"으로 답했다).
    그래서 box='all' 을 둔다 — 네 문서함을 모두 돌아 합친다. 문서번호 조회는 이걸 쓸 것."""
    b = str(box or 'draft').strip()
    if b == 'all':
        merged, seen = [], set()
        errs = []
        for key in _APPR_BOXES:
            try:
                r = approval_doclist(box=key, limit=limit, searchtype=searchtype,
                                     keyword=keyword, duration=duration)
            except Exception as e:          # 한 문서함이 막혀도 나머지는 살린다 — 조용히 삼키지 않고 모아서 알린다
                errs.append('%s: %s' % (key, e))
                continue
            for d in r.get('docs') or []:
                k = d.get('docNum') or d.get('id')
                if k in seen:
                    continue
                seen.add(k)
                d['box'] = key
                merged.append(d)
        return {'box': 'all', 'boxName': '전체 문서함', 'total': len(merged),
                'count': len(merged), 'docs': merged,
                'boxErrors': errs or None}
    if b not in _APPR_BOXES:
        raise ValueError("box는 %s / all 중 하나입니다." % ' / '.join(_APPR_BOXES))
    name, prop = _APPR_BOXES[b]
    from urllib.parse import quote
    qs = ('/api/approval/doclist/%s/all?page=0&offset=%d&property=%s&direction=desc'
          '&searchtype=%s&keyword=%s&fromDate=&toDate=&duration=%s'
          % (b, int(limit), prop, quote(str(searchtype or ''), safe=''),
             quote(str(keyword or ''), safe=''), quote(str(duration or 'all'), safe='')))
    j = gw_get(qs, timeout=60)
    out = []
    for d in (j or {}).get('data') or []:
        out.append({
            'id': d.get('documentId') or d.get('id'),
            'docNum': d.get('docNum') or '',
            'formName': d.get('formName') or '',
            'title': d.get('title') or '',
            'status': d.get('docStatusName') or d.get('docStatus') or '',
            'apprStatus': d.get('apprStatusName') or '',
            'drafterName': d.get('drafterName') or '',
            'drafterDept': d.get('drafterDeptName') or '',
            'draftedAt': d.get('draftedAt') or '',
            'attachCount': d.get('attachCount') or 0,
            'currentUsers': d.get('currentActivityUsers') or '',
            'url': '%s/app/approval/document/%s' % (GW_ORIGIN, d.get('documentId') or d.get('id')),
        })
    page = (j or {}).get('page') or {}
    return {'box': b, 'boxName': name, 'total': page.get('total'),
            'count': len(out), 'docs': out}


# ── 예약 생성/취소 (쓰기) ────────────────────────────────────────────
# ⚠️ 쓰기다. 호출 경로는 허용목록으로 좁히고, 앱에서는 사람이 1회 확인한 뒤에만 부른다.
# ⚠️⚠️ `properties`의 `attributeId`는 **자원마다 다르다** (실측: Video Conference=151/152,
#   3층 레인보우=80/81). 하드코딩하면 다른 회의실에서 엉뚱한 칸에 값이 들어간다.
#   → 그 자원의 **기존 예약 1건에서 순서대로** 읽어 쓴다(첫 번째=목적, 두 번째=참석자).
# ⚠️ 참석자는 **필수**다. 비우면 서버가 아니라 화면 단계에서 조용히 막힌다(요청조차 안 나감).
_ASSET_WRITE_ALLOW = ('reserve', 'cancel')


def _asset_post(path, body, method='POST', timeout=60):
    if not path.startswith('/api/asset/'):
        raise ValueError('예약 API 경로가 아닙니다: %s' % path)
    expr = """
    (async () => {
      const r = await fetch(%s, { method: %s, credentials:'same-origin',
        headers:{ 'Content-Type':'application/json; charset=UTF-8', Accept:'application/json' },
        body: JSON.stringify(%s) });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch (e) {}
      return { status: r.status, ok: r.ok, json: j, text: t.slice(0, 300) };
    })()
    """ % (json.dumps(path), json.dumps(method), json.dumps(body, ensure_ascii=False))
    return eval_in_gw(expr, timeout)


def asset_attribute_ids(asset_id, lookback_days=120):
    """그 자원의 예약 속성 id(목적, 참석자)를 **기존 예약에서** 알아낸다.

    서버에 속성 정의 목록 엔드포인트를 못 찾았다(`/api/asset/share`는 500). 대신
    기존 예약의 `properties`가 같은 순서로 오는 것을 이용한다(실측 확인).
    예약이 한 건도 없으면 알 수 없으므로 None을 돌려주고, 호출부가 사람에게 넘긴다."""
    from urllib.parse import quote
    today = datetime.datetime.now(_KST).date()
    for back in range(0, int(lookback_days), 7):
        day = today - datetime.timedelta(days=back)
        frm = quote('%sT00:00:00.000+09:00' % day.isoformat(), safe='')
        try:
            j = gw_get('/api/asset/%d/items/daily?fromDate=%s' % (int(asset_id), frm), timeout=45)
        except Exception:
            continue
        for r in (j or {}).get('data') or []:
            props = r.get('properties') or []
            if len(props) >= 2:
                return {'purpose': props[0].get('attributeId'),
                        'attendee': props[1].get('attributeId'),
                        'from': '예약 %s' % r.get('id')}
    return None


def asset_reserve(asset_id, item_id, date, start, end, purpose, attendee, allday=False):
    """회의실·차량 예약 1건 생성.

    date='YYYY-MM-DD', start/end='HH:MM'. `attendee`는 **필수**(비우면 화면이 막는다)."""
    if not str(purpose or '').strip():
        raise ValueError('목적(Purpose)은 필수입니다.')
    if not str(attendee or '').strip():
        raise ValueError('참석자(Attendee)는 필수입니다 — 비우면 그룹웨어가 조용히 막습니다.')
    if not _day_bounds(date, False):
        raise ValueError('date는 YYYY-MM-DD 형식입니다.')
    for t in (start, end):
        if not re.match(r'^([01]?\d|2[0-3]):[0-5]\d$', str(t or '')):
            raise ValueError('시간은 HH:MM 형식입니다: %s' % t)
    if str(start) >= str(end):
        raise ValueError('종료 시간이 시작보다 빠르거나 같습니다: %s → %s' % (start, end))

    attrs = asset_attribute_ids(asset_id)
    if not attrs:
        raise RuntimeError('이 자원의 예약 속성 id를 알아내지 못했습니다(기존 예약이 없음). '
                           '그룹웨어에서 한 건 예약해 두면 이후 자동으로 인식합니다.')
    sess = session_info()
    uid = (sess or {}).get('userId')
    if not uid:
        raise RuntimeError('그룹웨어 로그인 정보를 읽지 못했습니다.')

    def iso(hhmm):
        return '%sT%s:00.000+09:00' % (date, hhmm if len(hhmm) == 5 else '0' + hhmm)

    body = {
        'assetId': str(int(asset_id)), 'itemId': str(int(item_id)), 'type': 'reserve',
        'startTime': iso(start), 'endTime': iso(end),
        'useAnonym': False, 'user': {'id': str(uid)}, 'allday': bool(allday),
        'properties': [
            {'attributeId': str(attrs['purpose']), 'content': str(purpose)},
            {'attributeId': str(attrs['attendee']), 'content': str(attendee)},
        ],
    }
    res = _asset_post('/api/asset/%d/item/%d/reserve' % (int(asset_id), int(item_id)), body)
    if not (res or {}).get('ok'):
        raise RuntimeError('예약 실패 (HTTP %s): %s'
                           % ((res or {}).get('status'), (res or {}).get('text', '')[:200]))
    # 생성된 예약을 되읽어 id를 확인한다(응답 형식에 의존하지 않기 위해)
    made = None
    try:
        for r in (asset_reservations(asset_id=asset_id, date=date) or {}).get('reservations') or []:
            if str(r.get('start', ''))[11:16] == start and str(r.get('end', ''))[11:16] == end:
                made = r
                break
    except Exception:
        pass
    return {'ok': True, 'assetId': int(asset_id), 'itemId': int(item_id), 'date': date,
            'start': start, 'end': end, 'purpose': purpose, 'attendee': attendee,
            'reservationId': (made or {}).get('id'), 'item': (made or {}).get('item', ''),
            'attributeIds': attrs}


def asset_cancel(reservation_ids):
    """예약 취소. `reservation_ids`는 id 하나 또는 리스트."""
    ids = reservation_ids if isinstance(reservation_ids, (list, tuple)) else [reservation_ids]
    ids = [str(int(i)) for i in ids]
    if not ids:
        raise ValueError('취소할 예약 id가 없습니다.')
    res = _asset_post('/api/asset/item/reservation', {'ids': ids}, method='DELETE')
    if not (res or {}).get('ok'):
        raise RuntimeError('예약 취소 실패 (HTTP %s): %s'
                           % ((res or {}).get('status'), (res or {}).get('text', '')[:200]))
    return {'ok': True, 'cancelled': ids}


def asset_items(asset_id):
    """자원의 세부 항목(회의실 각 방/차량 각 대) 목록 — 예약하려면 itemId가 필요하다."""
    j = gw_get('/api/asset/%d/item/?page=0&offset=100' % int(asset_id), timeout=60)
    out = []
    for it in (j or {}).get('data') or []:
        out.append({'itemId': it.get('id'), 'assetId': it.get('assetId'),
                    'name': it.get('name') or ''})
    return out


# ══ 🧑‍💼 인사관리(kInsa) — 같은 전용 크롬에서 연다 ═══════════════════════════
#
#  [2026-10-21] 처음엔 백엔드에서 requests 로만 로그인했는데, **화면이 안 열린다**는
#  지적을 받았다. 그룹웨어처럼 사람이 보고 이어서 쓸 수 있어야 하므로 같은 전용 크롬
#  (CDP 9222, KortekGW\cdp-profile)에 탭으로 띄운다. 로그인 세션도 그 브라우저에 남아
#  이후 화면 조회/조작을 그대로 이어갈 수 있다.
#
#  ⚠️⚠️ 한 번만 시도하고 실패하면 재시도하지 않는다(그룹웨어와 같은 이유 — 계정 잠금).
#     실패해도 **창은 열어 둔 채** 사람에게 넘긴다.
INSA_ORIGIN = 'http://insa.kortek.co.kr'
INSA_HOST   = 'insa.kortek.co.kr'
INSA_LOGIN_CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'insa_login_config.json')


def _insa_page():
    return _page_for(INSA_HOST, INSA_ORIGIN)


def eval_in_insa(expr, timeout=45):
    """인사관리 페이지 컨텍스트에서 JS 실행."""
    t = _insa_page()
    if not t:
        raise RuntimeError('인사관리 탭을 열지 못했습니다.')
    return asyncio.new_event_loop().run_until_complete(
        _eval(t['webSocketDebuggerUrl'], expr, timeout))


def load_insa_login_config():
    try:
        with open(INSA_LOGIN_CFG, 'r', encoding='utf-8') as f:
            cfg = json.load(f) or {}
        return cfg if cfg.get('user') and cfg.get('pw_dpapi') else None
    except Exception:
        return None


def insa_session_info():
    """로그인 상태 추정 — 로그인 화면이면 userNum 입력칸이 보인다.

    🐛 [2026-10-21 실측에서 잡음] 처음엔 "url 이 있고 로그인 폼이 없으면 로그인됨"으로
       봤는데, 탭이 아직 `about:blank` 일 때도 그 조건을 만족해 **로그인도 안 했는데
       '이미 로그인되어 있습니다'** 가 떴다. 그러면 자동 로그인이 조용히 건너뛰어진다.
       → **주소가 실제로 인사관리 호스트일 때만** 판정한다.
    """
    try:
        r = eval_in_insa("""
          (() => ({ url: location.href,
                    hasLoginForm: !!document.querySelector("input[name='userNum']") }))()
        """, timeout=20) or {}
    except Exception as e:
        return {'ok': False, 'message': str(e)}
    url = r.get('url', '') or ''
    on_site = INSA_HOST in url
    out = {'ok': on_site and not r.get('hasLoginForm'), 'url': url, 'onSite': on_site}
    # ⚠️ [2026-10-21] 크롬이 http 를 https 로 올렸다 실패하면 이 탭은 **DOM 이 없는 차단 화면**이 된다.
    #    그걸 모르면 "로그인 화면을 찾지 못했습니다"로 끝나 사람이 원인을 못 찾는다(실제로 그랬다).
    if url.startswith('chrome-error:'):
        out['blocked'] = True
        out['message'] = ('크롬이 http 사이트를 차단했습니다(보안 연결 미지원 안내 화면). '
                          '인사관리는 http 전용이라 자동 승격을 꺼야 합니다 — '
                          '전용 크롬을 다시 시작하면 적용됩니다.')
    return out


def insa_login_once():
    """저장된 계정으로 **한 번만** 로그인. 실패해도 재시도하지 않고 창을 열어 둔다."""
    if not chrome_alive():
        ok, msg = launch_chrome()
        if not ok:
            return {'ok': False, 'result': 'chrome', 'message': msg}

    if not _insa_page():
        return {'ok': False, 'result': 'no_tab', 'message': '인사관리 탭을 열지 못했습니다.'}

    s = insa_session_info()
    if s.get('ok'):
        return {'ok': True, 'result': 'already', 'message': '이미 로그인되어 있습니다.', 'session': s}
    # 차단 화면이면 **자격증명 문제가 아니다** — 엉뚱한 곳을 의심하지 않도록 먼저 가른다.
    if s.get('blocked'):
        return {'ok': False, 'result': 'https_blocked', 'blocked': True,
                'message': s.get('message'), 'handoff': True}

    cfg = load_insa_login_config()
    if not cfg:
        return {'ok': False, 'result': 'not_configured',
                'message': '저장된 인사관리 로그인 정보가 없습니다 — 🔑에서 먼저 등록해주세요.'}
    try:
        pw = _dpapi_decrypt_b64(cfg['pw_dpapi'])
    except Exception as e:
        return {'ok': False, 'result': 'decrypt', 'message': str(e)}

    # 아직 인사관리 화면이 아니거나(빈 탭 등) 로그인 폼이 안 보이면 먼저 로그인 화면으로 보낸다.
    try:
        st = insa_session_info()
        need_nav = (not st.get('onSite'))
        if not need_nav:
            need_nav = not eval_in_insa("!!document.querySelector(\"input[name='userNum']\")", timeout=15)
        if need_nav:
            eval_in_insa("location.href = '%s/'" % INSA_ORIGIN, timeout=15)
            for _ in range(20):                      # 로그인 폼이 뜰 때까지 기다린다
                time.sleep(0.4)
                try:
                    if eval_in_insa("!!document.querySelector(\"input[name='userNum']\")", timeout=10):
                        break
                except Exception:
                    pass
    except Exception:
        pass

    # ⚠️ 제출 결과는 **바깥에서 폴링**한다 — submit 하면 페이지가 넘어가며 JS 컨텍스트가 죽어
    #    eval 의 반환을 기다리면 예외가 난다(그룹웨어에서 겪은 것과 같은 함정).
    #    그래서 submit 호출 자체의 응답은 무시하고, 아래에서 화면을 다시 읽어 판정한다.
    js = """
      (() => {
        const u = document.querySelector("input[name='userNum']");
        const p = document.querySelector("input[name='password']");
        if (!u || !p) return 'no_form';
        u.value = %s; p.value = %s;
        const f = u.form || document.querySelector('form.form-signin');
        if (!f) return 'no_form';
        f.submit();
        return 'submitted';
      })()
    """ % (json.dumps(cfg['user']), json.dumps(pw))
    try:
        res = eval_in_insa(js, timeout=20)
    except Exception:
        res = 'submitted'          # 페이지 이동으로 컨텍스트가 죽은 것 — 정상 경로다
    finally:
        pw = js = None             # 비밀번호가 담긴 문자열을 바로 버린다

    if res == 'no_form':
        return {'ok': False, 'result': 'no_form',
                'message': '로그인 화면을 찾지 못했습니다 — 열린 창에서 직접 로그인해주세요.',
                'handoff': True}

    # 결과 폴링 — 실패면 alert 후 index 로 되돌아가 로그인 폼이 다시 보인다.
    for _ in range(16):
        time.sleep(0.5)
        s2 = insa_session_info()
        if s2.get('ok'):
            return {'ok': True, 'result': 'ok', 'message': '인사관리에 로그인했습니다.', 'session': s2}

    # ⚠️ 여기부터 실패 — **다시 시도하지 않는다.** 창은 열린 채로 사람에게 넘긴다.
    return {'ok': False, 'result': 'failed', 'handoff': True,
            'message': '인사관리 로그인에 실패했습니다 — 계정 잠금을 막기 위해 재시도하지 않습니다. '
                       '열린 창에서 직접 로그인해주세요.'}


# ══ 🔎 인사관리 화면 자동 학습 ════════════════════════════════════════════
#
#  [2026-10-21] 메뉴가 `<a href="#14">근무 계획</a>` 처럼 **해시 코드**로만 돼 있어서
#  화면 주소를 밖에서 알 수 없다. 그래서 **추측하지 않고** 메뉴를 하나씩 눌러 보고
#  안쪽 프레임이 실제로 어디로 가는지 기록한다(그룹웨어에서 "경로를 추측하지 말 것"으로
#  배운 그대로). 결과는 카탈로그 파일(데이터)로 남겨 코드에 경로를 박지 않는다.
#
#  ⚠️ **읽기 전용이다.** 메뉴를 눌러 화면을 띄우기만 하고, 어떤 폼도 제출하지 않는다.
#     (신청·결재처럼 값이 바뀌는 동작은 사람 확인 없이 절대 하지 않는다)
INSA_MENU_CATALOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'insa_menu_catalog.json')

_INSA_MENU_JS = r"""
(() => {
  const seen = new Set(), out = [];
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    const t = (a.textContent || '').trim().replace(/\s+/g, ' ');
    const h = a.getAttribute('href') || '';
    if (!t || h === '#' || seen.has(h)) return;
    seen.add(h);
    out.push({ code: h.slice(1), label: t });
  });
  return out;
})()
"""

_INSA_INNER_URL_JS = r"""
(() => { const f = document.querySelector('iframe');
         try { return (f && f.contentDocument) ? f.contentDocument.location.href : ''; }
         catch (e) { return ''; } })()
"""


def insa_menus_observed():
    """최상위 화면의 메뉴(해시 코드 + 라벨)를 읽는다. 누르지는 않는다."""
    return eval_in_insa(_INSA_MENU_JS, timeout=25) or []


def insa_learn_menus(wait_each=6.0):
    """메뉴를 하나씩 **눌러 보고** 안쪽 프레임의 실제 주소를 기록한다(읽기 전용).

    반환: [{code, label, path, ok}] — path 는 관찰로 확정된 값이고, 못 알아낸 건 ok=False.
    """
    if not insa_session_info().get('ok'):
        return {'ok': False, 'message': '인사관리에 로그인되어 있지 않습니다 — 🔑에서 먼저 로그인해주세요.'}

    menus = insa_menus_observed()
    if not menus:
        return {'ok': False, 'message': '메뉴를 찾지 못했습니다(로그인 직후 화면인지 확인해주세요).'}

    learned, before = [], (eval_in_insa(_INSA_INNER_URL_JS, timeout=15) or '')
    for m in menus:
        code = m.get('code') or ''
        try:
            eval_in_insa(
                "(() => { const a = document.querySelector('a[href=\"#%s\"]');"
                " if (a) a.click(); return !!a; })()" % code, timeout=15)
        except Exception:
            pass
        # 🐛 [실측] 처음엔 "주소가 **바뀌면**" 그걸 경로로 봤는데, 두 메뉴가 같은 화면을
        #    쓰면(의료비↔복리후생, 연차계획↔계획서목록) 바뀌지 않아 **조용히 빈 값**이 됐다.
        #    → 바뀌길 기다리지 말고 **잠잠해질 때까지**(연속 두 번 같은 값) 기다렸다가 적는다.
        path, last, stable, deadline = '', None, 0, time.time() + wait_each
        while time.time() < deadline:
            time.sleep(0.4)
            try:
                cur = eval_in_insa(_INSA_INNER_URL_JS, timeout=10) or ''
            except Exception:
                continue
            if not cur:
                continue
            stable = stable + 1 if cur == last else 0
            last = cur
            if stable >= 1:          # 두 번 연속 같은 값 = 로딩이 끝났다
                path = cur
                break
        if not path and last:
            path = last
        row = {'code': code, 'label': m.get('label', ''), 'path': path, 'ok': bool(path)}
        # 앞 메뉴와 같은 화면이면 표시해 둔다 — 클릭이 안 먹어서 이전 화면을 적었을 수도 있다.
        if path and path == before:
            row['sameAsPrev'] = True
        before = path or before
        learned.append(row)

    data = {'learnedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
            'origin': INSA_ORIGIN, 'menus': learned}
    try:
        with open(INSA_MENU_CATALOG, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return {'ok': True, 'warning': f'카탈로그 저장 실패: {e}', **data}
    return {'ok': True, **data}


def insa_menu_catalog():
    try:
        with open(INSA_MENU_CATALOG, 'r', encoding='utf-8') as f:
            return json.load(f) or {}
    except Exception:
        return {}


def _insa_reload_top(wait=12.0):
    """최상위 화면을 새로고침해 앱 상태를 되돌린다(메뉴가 다시 보일 때까지 기다림)."""
    try:
        eval_in_insa("location.reload()", timeout=10)
    except Exception:
        pass                      # 새로고침으로 JS 컨텍스트가 죽는 건 정상 경로다
    deadline = time.time() + wait
    while time.time() < deadline:
        time.sleep(0.5)
        try:
            if eval_in_insa(r"""document.querySelectorAll('a[href^="#"]').length""", timeout=8):
                return True
        except Exception:
            pass
    return False


def insa_read_screen(code_or_path, timeout=25):
    """학습된 화면 하나를 열어 **글자만** 긁어 온다(읽기 전용).

    ⚠️⚠️ [2026-10-21 실측] 학습해 둔 주소로 **직접 이동하면 안 된다.** 그 화면들은
       GET 을 막아 둬서(`HTTP 405 - Request method 'GET' not supported`) 빈 오류 페이지가
       나온다 — 로그인(`/kInsa`)과 같다. 메뉴는 POST 로 열리고, 어떤 파라미터가 붙는지는
       밖에서 알 수 없다.
       → **메뉴를 클릭한다.** 앱이 하던 그대로 하게 두는 것이 유일하게 안전한 방법이다.
         학습해 둔 path 는 "그 메뉴가 어디로 가는지" 확인용이지 이동 수단이 아니다.
    """
    # 🔑 [2026-10-21 실사용 제보] 세션이 풀린 상태에서 읽으면 "메뉴를 화면에서 찾지 못했습니다"
    #    라는 **엉뚱한 사유**가 나왔다(진짜 원인은 로그인 화면이 떠 있던 것). 먼저 확인한다.
    st = insa_session_info()
    if not st.get('ok'):
        return {'ok': False, 'loggedOut': True,
                'message': '인사관리 로그인이 풀려 있습니다 — 🔑에서 로그인한 뒤 다시 시도해주세요.'}

    cat = insa_menu_catalog()
    menus = cat.get('menus') or []
    key = str(code_or_path or '').strip()
    if not key:
        return {'ok': False, 'message': '메뉴 이름이나 코드를 지정해주세요.'}

    def _norm(v):
        return ''.join(str(v or '').split()).lower()
    nkey = _norm(key)
    hit = None
    for m in menus:                                  # 1) 코드 정확히
        if str(m.get('code', '')).lower() == key.lower():
            hit = m; break
    if not hit:                                      # 2) 이름 정확히(공백 무시)
        for m in menus:
            if _norm(m.get('label')) == nkey:
                hit = m; break
    if not hit:                                      # 3) 이름 부분일치 — 라벨에 '연차휴가사용계획 0'
        for m in menus:                              #    처럼 숫자가 붙어 있어 정확일치가 자주 빗나간다
            if nkey and nkey in _norm(m.get('label')):
                hit = m; break
    if not hit:
        return {'ok': False,
                'message': '그런 화면이 없습니다. 볼 수 있는 화면: '
                           + ', '.join(m.get('label', '') for m in menus if m.get('label'))}

    code = hit.get('code')

    # 🐛 [2026-10-21 실측] 안쪽 프레임이 한 번 오류 페이지(405 — GET 미지원)에 빠지면
    #    그 뒤로는 메뉴를 눌러도 계속 오류 페이지만 나온다. 최상위를 새로고침하면 되돌아온다.
    #    → 읽기 전에 프레임 상태를 보고, 수상하면 새로고침부터 한다.
    try:
        probe = eval_in_insa(r"""
          (() => { const f = document.querySelector('iframe');
                   const d = f && f.contentDocument;
                   const t = (d && d.body && d.body.innerText) || '';
                   // 사람이 입력해 둔 칸이 있는지 — 되돌리면 안 되는 화면인지 판단용
                   const filled = [...document.querySelectorAll('input,textarea,select')]
                     .filter(e => e.type !== 'hidden' && String(e.value || '').trim()).length;
                   return { err: t.indexOf('not supported') >= 0,
                            menus: document.querySelectorAll('a[href^="#"]').length,
                            filled: filled, url: location.href }; })()
        """, timeout=15) or {}
    except Exception:
        probe = {}

    # ⚠️⚠️ [2026-10-21] **작성 중인 화면은 절대 건드리지 않는다.**
    #    사용자가 '근무계획 수정 신청서'를 쓰던 중에 조회가 들어왔는데, 메뉴가 없다는 이유로
    #    복구 로직이 location.reload() 를 걸 뻔했다 — 사람이 채워 둔 5칸이 날아갈 뻔한 것이다.
    #    메뉴가 없고(=메인 틀이 아니고) 입력된 칸이 있으면, 새로고침도 클릭도 하지 않고 그대로 보고한다.
    if not probe.get('menus') and probe.get('filled'):
        return {'ok': False, 'label': hit.get('label', ''), 'busyForm': True,
                'message': '지금 인사관리 창이 **작성 중인 화면**입니다'
                           f'({(probe.get("url") or "").replace(INSA_ORIGIN, "")}, 입력된 칸 {probe.get("filled")}개). '
                           '입력 내용이 날아갈 수 있어 화면을 옮기지 않았습니다 — '
                           '그 작업을 끝내거나 닫은 뒤 다시 시도해주세요.'}

    if probe.get('err') or not probe.get('menus'):
        _insa_reload_top()

    # 🔧 [2026-10-21] **메뉴를 클릭하지 않는다.** 사이트 JS(`/resources/common/js/common.js`)를
    #    읽어 보니 화면 이동이 함수 하나였다:
    #        function goToMenu(action, options) {
    #          $("#menuFrm").attr({ action, method: "POST", target: "pageFrame" }).submit(); }
    #    즉 공용 폼 #menuFrm 을 그 경로로 **POST** 해서 pageFrame 에 띄운다 — GET 이 405 였던 이유다.
    #    클릭 방식은 메뉴가 안 보이는 화면(독립 페이지)에선 아예 못 썼는데, 이건 그런 제약이 없다.
    #    ⚠️ 폼 전송이라 JS 컨텍스트가 죽는다 — 반환값을 믿지 말고 아래에서 주소로 확인한다.
    nav_path = (hit.get('path') or '').replace(INSA_ORIGIN, '') or ('/' + str(code))
    moved = False
    try:
        moved = bool(eval_in_insa(
            "(() => { if (typeof goToMenu === 'function') { goToMenu(%s); return true; }"
            " const a = document.querySelector('a[href=\"#%s\"]');"
            " if (a) { a.click(); return true; } return false; })()"
            % (json.dumps(nav_path), code), timeout=15))
    except Exception:
        moved = True                                 # 전송으로 컨텍스트가 죽는 건 정상 경로
    if moved is False:
        return {'ok': False,
                'message': f'"{hit.get("label")}" 화면으로 이동할 방법을 찾지 못했습니다'
                           ' (goToMenu 도 메뉴 링크도 없음 — 메인 화면인지 확인해주세요).'}

    # ⚠️⚠️ [2026-10-21 실측] 클릭 직후 바로 글자를 읽으면 **앞 화면 내용을 그대로 돌려준다.**
    #    실제로 "연차휴가사용계획"을 물었는데 직전에 열려 있던 "근무 계획" 본문이 나왔다 —
    #    틀린 답을 자신 있게 주는 셈이라 못 읽는 것보다 나쁘다.
    #    → 학습해 둔 path 로 **주소가 그 화면으로 바뀐 것을 확인한 뒤에** 읽는다.
    #      (path 는 이동 수단이 아니라 이런 확인용이다 — 직접 이동하면 405다)
    want = (hit.get('path') or '').replace(INSA_ORIGIN, '')
    arrived, cur = not want, ''
    if want:
        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(0.3)
            try:
                cur = eval_in_insa(_INSA_INNER_URL_JS, timeout=10) or ''
            except Exception:
                continue
            if want in cur:
                arrived = True
                break
    if not arrived:
        # 그 화면으로 가지 못했다. **앞 화면 내용을 돌려주지 않는다** — 틀린 답보다 못 읽었다는
        # 답이 낫다. (메뉴가 단순 표시용이라 클릭해도 안 넘어가는 경우가 실제로 있다)
        return {'ok': False, 'label': hit.get('label', ''), 'code': code,
                'message': f'"{hit.get("label")}" 화면을 열지 못했습니다'
                           f'(지금 화면: {cur.replace(INSA_ORIGIN, "") or "알 수 없음"}). '
                           f'이 메뉴는 클릭으로 안 넘어가는 항목일 수 있습니다.'}

    text, last = '', None
    for _ in range(int(timeout / 0.5)):
        time.sleep(0.5)
        try:
            # ⚠️ 여기에 정규식(/\n{3,}/ 같은)을 넣지 말 것 — 이 파일을 heredoc 으로 고치다
            #    백슬래시가 먹혀 **진짜 줄바꿈**이 박히는 바람에 JS 가 매번 SyntaxError 를 냈고,
            #    그게 조용히 삼켜져 "화면을 읽지 못했습니다"만 나왔다(2026-10-21 반나절 소모).
            #    글자 다듬기는 아래 파이썬에서 한다 — 거기선 이스케이프가 안전하다.
            r = eval_in_insa(
                "(() => { const f = document.querySelector('iframe');"
                " const d = f && f.contentDocument;"
                " if (!d || !d.body) return '';"
                " return (d.body.innerText || '').trim(); })()", timeout=12) or ''
        except Exception:
            r = ''
        if len(r) > 50 and r == last:                # 두 번 연속 같으면 로딩이 끝난 것
            text = r
            break
        last = r
    if not text and last and len(last) > 50:
        text = last
    if 'Request method' in text and 'not supported' in text:
        return {'ok': False, 'label': hit.get('label', ''),
                'message': '화면이 오류를 돌려줬습니다(GET 미지원) — 메뉴 클릭으로 다시 시도해주세요.'}
    text = re.sub(r'\n{3,}', '\n\n', text)      # 빈 줄 정리는 여기서(파이썬 쪽이 안전하다)
    return {'ok': bool(text), 'label': hit.get('label', ''), 'code': code,
            'text': text[:8000], 'message': '' if text else '화면을 읽지 못했습니다.'}


# ── 연차휴가사용계획서 작성 대상 여부 (읽기 전용, 2026-10-27) ──────────────
# "근무 계획" 화면의 workCalendar.js에 있는 clickWriteAnnualPlan()의 게이트 체크만 그대로
# 가져온다. ⚠️ **열거나 채우지 않는다** — /annual-plan/regForm 쓰기는 의도적으로 보류했다
# (법정 연차 문서 + 빈 상태를 한 번도 못 봐서 그리드 동작을 실측하지 못함, docs/insa-hr.md).

def insa_annual_plan_status():
    """연차휴가사용계획서를 지금 써야 하는지/이미 썼는지 확인한다(읽기 전용).

    사람이 인사관리에서 직접 작성하도록 안내만 한다 — 이 함수는 절대 신청서를 열지 않는다."""
    st = insa_session_info()
    if not st.get('ok'):
        return {'ok': False, 'loggedOut': True,
                'message': '인사관리 로그인이 풀려 있습니다 — 🔑에서 로그인한 뒤 다시 시도해주세요.'}
    js = """
      (async () => {
        try {
          const r = await fetch('/annual-plan/checkShouldWrite', { method: 'POST', credentials: 'same-origin' });
          const ct = r.headers.get('content-type') || '';
          const body = ct.includes('json') ? await r.json() : null;
          return { status: r.status, body };
        } catch (e) { return { error: String(e) }; }
      })()
    """
    try:
        res = eval_in_insa(js, timeout=20) or {}
    except Exception as e:
        return {'ok': False, 'message': f'확인하지 못했습니다: {e}'}
    body = res.get('body') or {}
    if res.get('error') or res.get('status') != 200 or not body:
        return {'ok': False, 'message': '연차휴가사용계획서 작성 대상 여부를 확인하지 못했습니다.'}

    has_written = bool(body.get('hasWritten'))
    should_write = bool(body.get('shouldWrite'))
    is_target = bool(body.get('isTarget'))
    has_active_doc = bool(body.get('hasActiveDoc'))

    if has_written:
        msg = '이번 기(반기) 연차휴가사용계획서를 이미 작성했습니다 — 인사관리 "연차휴가사용계획서목록"에서 확인하세요.'
    elif should_write:
        msg = ('이번 기(반기) 연차휴가사용계획서를 아직 작성하지 않았습니다 — '
               '인사관리 "근무 계획" 화면에서 직접 작성해주세요(이 앱은 대신 작성하지 않습니다).')
    elif not is_target or not has_active_doc:
        msg = '지금은 연차휴가사용계획서 작성 대상 기간이 아니거나 작성 권한이 없습니다.'
    else:
        msg = '상태를 판정하지 못했습니다 — 인사관리 화면에서 직접 확인해주세요.'
    return {'ok': True, 'hasWritten': has_written, 'shouldWrite': should_write,
            'isTarget': is_target, 'hasActiveDoc': has_active_doc, 'message': msg}
