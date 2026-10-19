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


async def _click(ws_url, x, y, timeout=30):
    """CDP Input 도메인으로 **신뢰된**(isTrusted=true) 마우스 클릭을 보낸다."""
    import websockets
    async with websockets.connect(ws_url, max_size=8_000_000) as ws:
        for mid, typ, buttons in ((1, 'mousePressed', 1), (2, 'mouseReleased', 0)):
            await ws.send(json.dumps({'id': mid, 'method': 'Input.dispatchMouseEvent',
                                      'params': {'type': typ, 'x': x, 'y': y,
                                                 'button': 'left', 'clickCount': 1,
                                                 'buttons': buttons}}))
            while True:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if msg.get('id') == mid:
                    if 'error' in msg:
                        raise RuntimeError(str(msg['error'])[:200])
                    break
    return True


def click_in_gw(x, y, timeout=30):
    """그룹웨어 탭의 (x, y)를 실제 마우스처럼 클릭한다.

    ⚠️ 페이지 안에서 `el.click()`을 부르는 것과 **다르다.** 이 사이트의 로그인 버튼은
    프로그램적 클릭에 반응하지 않는다(아래 `_LOGIN_JS` 주석 참고) — 그래서 이 경로가 필요하다.
    좌표는 **뷰포트 기준**이므로, 부르기 전에 대상을 화면 안으로 스크롤해 둘 것.
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
                return {'ok': False, 'result': 'click_failed', 'handoff': True,
                        'message': f'로그인 버튼을 누르지 못했습니다 ({e}) — '
                                   '재시도하지 않습니다. 열린 창에서 직접 로그인해주세요.'}

    # 제출했으면 결과는 **바깥에서** 확인한다(페이지 이동으로 JS 컨텍스트가 죽기 때문).
    if res == 'submitted':
        for _ in range(20):            # 최대 ~20초
            time.sleep(1.0)
            s2 = session_info()
            if s2.get('ok'):
                # 로그인 직후 "새로운 기능" 투어가 화면을 덮으면 이후 조작이 전부 막힌다 → 먼저 닫는다
                intro = dismiss_intro()
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
        r['message'] = st.get('msg') or ''

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
               items:(j.data||[]).map(x => ({ id:x.id, title:x.title||'', formName:x.formName||'',
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
    const el = [...document.querySelectorAll('input[type=checkbox][id^=editorForm_]')]
      .find(e => e.id.endsWith('_' + want));
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
    """볼 수 있는 게시판 목록(전사 + 부서). 게시판 지정 조회용."""
    out = []
    j = gw_get('/api/board/company/boardsWithIp', timeout=45)
    for b in ((j or {}).get('data') or {}).get('boards') or []:
        if b.get('nodeType') == 'FOLDER':
            continue                   # 폴더는 글이 없다
        out.append({'id': b.get('id'), 'name': b.get('nodeValue') or '', 'scope': '전사'})
    j = gw_get('/api/department/boards', timeout=45)
    for dept in (j or {}).get('data') or []:
        for b in dept.get('boards') or []:
            if b.get('nodeType') == 'FOLDER':
                continue
            out.append({'id': b.get('id'), 'name': b.get('nodeValue') or '',
                        'scope': dept.get('deptName') or '부서'})
    return out


# ── 메일 (읽기 전용) ─────────────────────────────────────────────────
# ⚠️⚠️ **메일을 열지 않는다.** 상세 조회는 서버에서 `읽음`으로 바꿔버린다 — 사용자 메일함의
#   안읽음 배지가 조용히 줄어드는 건 조사·요약이 일으켜도 되는 변화가 아니다.
#   목록 응답의 `preview`에 본문 발췌가 들어 있어 요약에는 그걸로 충분하다(실측).
# ⚠️ `message/list`는 **POST + JSON**이다(게시판·전자결재는 GET 쿼리스트링). 모듈마다 다르다.
#   검색어 키는 `keyWord` — 대문자 W. `keyword`로 주면 조용히 무시된다.
# ⚠️ 이 POST는 조회 전용이라 아래 허용목록(_MAIL_POST_ALLOW)에 있는 경로만 부른다.
#   쓰기(발송·삭제·읽음처리)는 **여기에 만들지 않는다** — 허용목록이 그 가드다.
_MAIL_POST_ALLOW = ('/api/mail/message/list', '/api/mail/message/count')

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

    ⚠️ `fromDate`는 ISO+09:00 형식이 필요하다('YYYY-MM-DDT00:00:00.000+09:00')."""
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
            u = r.get('user') or {}
            out.append({
                'id': r.get('id'), 'asset': a.get('name') or '', 'item': r.get('itemName') or '',
                'start': r.get('startTime') or '', 'end': r.get('endTime') or '',
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
    ⚠️ 문서함마다 기본 정렬 컬럼(property)이 다르다 — 섞으면 서버가 500을 준다."""
    b = str(box or 'draft').strip()
    if b not in _APPR_BOXES:
        raise ValueError('box는 %s 중 하나입니다.' % ' / '.join(_APPR_BOXES))
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
