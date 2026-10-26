# 🔬 그룹웨어/사내시스템 조사 도구 — 새 세션 인계용

**왜 이 문서가 있나**: 그룹웨어 API를 알아낸 조사 스크립트들이 지금까지 세션 scratchpad에만
있었다. 세션을 지우면 같이 사라져서, 남은 쓰기 기능(일정·메일발송·게시판)을 이어서 하려면
매번 처음부터 다시 만들어야 했다. 그래서 **스크립트 전문을 여기 박아 둔다.**

> 쓰는 법: 아래 코드를 아무 작업 폴더(scratchpad 등)에 `.py`로 저장해 실행한다.
> 전부 **그룹웨어 전용 크롬(CDP 9222)** 에 붙는다 — `gw_bridge.launch_chrome()`으로 띄운 그 크롬.
> `MSYS_NO_PATHCONV=1`(Git Bash에서 `/app/...` 인자가 경로로 바뀌는 것 방지) +
> `PYTHONIOENCODING=utf-8`(콘솔 cp949라 한글 깨짐) 같이 줄 것.

---

## 1. 지금 상태 (2026-10-19 기준, 이후 세션에서 더 늘었을 수 있음)

### 쓰기 도구 (`js/41-qa-write-tools.js`)
| 도구 | 상태 |
|---|---|
| 전자결재 임시저장 / 기안작성 / 복사 | ✅ live |
| 회의실·차량 예약 / 예약 취소 | ✅ live |
| 인사관리 근무계획 칸 채우기 | ✅ live |
| 그룹웨어 일정 등록/삭제 (`gw_calendar_add`/`gw_calendar_delete`) | ✅ live (2026-10-26) — payload 확정 방법은 아래 2절 그대로, `gw_bridge.calendar_create_event`/`calendar_delete_event` |
| 그룹웨어 메일 발송 (`gw_mail_send`) | ✅ live (2026-10-26) — SMTP/POP3와 무관(그룹웨어 세션으로 직접), `gw_bridge.mail_send` |
| **게시판 글 등록** (`gw_board_write`) | 🚧 pending — 전사 공개라 우선순위 낮춤 |

`verified:'pending'`은 **실행이 차단**되고 AI 프롬프트에도 노출되지 않는다.
아래 2절 절차로 payload를 확정한 뒤 `verified:'live'`로 올리면 그때부터 AI가 쓴다.

### 미검증으로 남은 것
- **다단계 추론 루프의 실제 동작**(js/40 `_qaToolLoop`). 인자 검증·태그 파싱·라우트는
  전부 실측했지만, **AI가 실제로 `[[TOOL:]]`을 규격대로 내놓는지는 앱에서 돌려봐야 안다.**
  형식을 못 맞추면 조용히 기존 경로로 떨어지므로 고장은 아니다. 어긋나면 손댈 곳은
  `_qaToolStepPrompt` 한 곳.

---

## 2. 쓰기 기능을 완성하는 절차 (이게 핵심)

**쓰기 표면은 번들 추출로 안 배워진다** — 읽기 경로는 JS에서 `/api/...` 문자열로 다 나오지만,
쓰기는 payload를 압축 코드가 변수로 조립해서 **필드 이름이 안 나오고**, 예약·일정은
**경로조차 안 나온다**(실측). 그래서 유일하게 확실한 방법은 **사람이 1회 수행하는 동안 관찰**이다.

```
① 아래 gw_capture_write.py 실행 (관찰만 — 클릭도 재전송도 안 함)
② 그 창이 열려 있는 동안 그룹웨어에서 그 동작을 한 번 직접 수행
③ 잡힌 POST/PUT/DELETE의 경로 + 본문을 그대로 확인
④ gw_bridge.py에 함수 추가 → kortek_backend.py 라우트 → js/41 등록 → verified:'live'
```

### ⚠️ 절차상 함정 (전부 실제로 당한 것)
- **값이 안 들어가서 막히는 게 아니라, 요청이 아예 안 나가는 경우가 있다.** 예약은 참석자가
  비어 있으면 오류도 네트워크 요청도 **없이** 멈춘다. "클릭이 안 먹는다"로 오해하기 쉽다 →
  요청 0건이면 **필수 입력 누락**부터 의심.
- **팝업 라이브러리의 드래그 플래그**(`popupDragged`): CDP로 그리드를 누른 직후면 확인 버튼의
  **첫 클릭이 통째로 삼켜진다**. 클로저 변수라 밖에서 못 끈다. 핸들러가 스스로 false로
  되돌리니 한 번 더 누르면 통과.
- **`attributeId` 같은 값은 자원/양식마다 다르다.** 캡처한 숫자를 그대로 박으면 다른
  회의실에서 엉뚱한 칸에 들어간다. 반드시 런타임 발견 경로를 만들 것
  (예: `gw_bridge.asset_attribute_ids()` — 그 자원의 기존 예약 1건에서 순서대로 읽음).
- **캡처 스크립트는 창이 닫힐 때 파일을 쓴다.** 중간에 `reserve_capture.json`을 열면 빈 배열이다.

---

## 3. 스크립트 전문

### 3-1. `gw_capture_write.py` — 쓰기 요청 캡처 (가장 중요)
GET이 아닌 요청만, 본문까지 기록한다. **관찰만 한다.**

```python
# -*- coding: utf-8 -*-
"""쓰기 요청 캡처 — 사람이 그룹웨어에서 직접 한 번 하는 동안 요청을 관찰한다.
usage: python gw_capture_write.py out.json [관찰초]
"""
import asyncio, io, json, re, sys
import requests, websockets

PORT = 9222
ORIGIN = 'https://gw.kortek.co.kr'
# ⚠️ /http-bind, /api/bosh/* 는 사내 메신저(XMPP) 채널이고 본문에 SASL 인증 토큰이 실린다.
#    절대 기록하지 말 것.
SKIP = re.compile(r'/http-bind|/resources/|/api/bosh/|/api/emoticons'
                  r'|/api/mail/message/count|/api/my/noti|/api/today/badge'
                  r'|/api/home/noti|/api/user/session|/api/notice/normal')


def target():
    for t in requests.get('http://127.0.0.1:%d/json/list' % PORT, timeout=5).json():
        if t.get('type') == 'page' and 'gw.kortek.co.kr' in (t.get('url') or ''):
            return t
    return None


async def main(outfile, seconds):
    t = target()
    if not t:
        print('FAIL: 그룹웨어 탭이 없습니다.')
        return 1
    rows = []
    print('관찰 시작 — %d초 동안 그룹웨어에서 **직접 한 번** 수행해주세요.' % seconds)
    async with websockets.connect(t['webSocketDebuggerUrl'], max_size=80_000_000) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Network.enable'}))
        loop = asyncio.get_event_loop()
        end = loop.time() + seconds
        while loop.time() < end:
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(0.3, end - loop.time())))
            except asyncio.TimeoutError:
                break
            if msg.get('method') != 'Network.requestWillBeSent':
                continue
            req = msg['params'].get('request') or {}
            if req.get('method', 'GET').upper() == 'GET':
                continue
            u = req.get('url', '').replace(ORIGIN, '')
            if '/api/' not in u or SKIP.search(u):
                continue
            rows.append({'method': req['method'], 'url': u,
                         'contentType': (req.get('headers') or {}).get('Content-Type', ''),
                         'body': req.get('postData') or ''})
            print('  [%s] %s  (%d bytes)' % (req['method'], u[:90], len(req.get('postData') or '')))
    io.open(outfile, 'w', encoding='utf-8').write(json.dumps(rows, ensure_ascii=False, indent=1))
    print('\n캡처 %d건 → %s' % (len(rows), outfile))
    for r in rows:
        print('\n=== %s %s' % (r['method'], r['url']))
        if r['contentType']:
            print('    content-type: %s' % r['contentType'][:70])
        if r['body']:
            print('    body: %s' % r['body'][:1200])
    return 0


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'write_capture.json'
    secs = int(sys.argv[2]) if len(sys.argv) > 2 else 90
    sys.exit(asyncio.run(main(out, secs)))
```

### 3-2. `gw_get2.py` — GET 응답 구조 축약 조회
경로 목록을 JSON 파일로 주면 각 응답을 깊이 제한해 요약한다. 필드 이름을 **추측하지 않고**
확인할 때 쓴다.

```python
# -*- coding: utf-8 -*-
"""usage: python gw_get2.py paths.json out.json [depth]"""
import io, json, sys
sys.path.insert(0, r'C:\Users\YHPARK\Documents\GitHub\ganttchart')
import gw_bridge as gw

PATHS = json.load(io.open(sys.argv[1], encoding='utf-8'))
DEPTH = int(sys.argv[3]) if len(sys.argv) > 3 else 3

JS = r"""
(async () => {
  const paths = %s, DEPTH = %d, out = {};
  const shape = (v, d) => {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return d <= 0 ? '['+v.length+']' : { __len:v.length, __0: shape(v[0], d-1) };
    if (typeof v === 'object') {
      if (d <= 0) return '{' + Object.keys(v).slice(0,25).join(',') + '}';
      const o = {}; for (const k of Object.keys(v).slice(0,60)) o[k] = shape(v[k], d-1); return o;
    }
    if (typeof v === 'string') return v.length > 90 ? v.slice(0,90) + '…(' + v.length + ')' : v;
    return v;
  };
  for (const p of paths) {
    try {
      const r = await fetch(p, { credentials:'same-origin', headers:{ Accept:'application/json' } });
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) { out[p] = { status:r.status, notJson:(await r.text()).slice(0,120) }; continue; }
      out[p] = { status:r.status, shape: shape(await r.json(), DEPTH) };
    } catch (e) { out[p] = { err:String(e).slice(0,100) }; }
  }
  return out;
})()
""" % (json.dumps(PATHS), DEPTH)

res = gw.eval_in_gw(JS, timeout=150)
io.open(sys.argv[2], 'w', encoding='utf-8').write(json.dumps(res, ensure_ascii=False, indent=1))
print('OK', len(res))
```

### 3-3. `gw_shot.py` — 화면 캡처
UI 구조를 눈으로 봐야 할 때. DOM 덤프보다 빠르게 상황 파악이 된다.

```python
# -*- coding: utf-8 -*-
"""usage: python gw_shot.py out.png"""
import asyncio, base64, json, sys
import requests, websockets

PORT = 9222


def target():
    for t in requests.get('http://127.0.0.1:%d/json/list' % PORT, timeout=5).json():
        if t.get('type') == 'page' and 'gw.kortek.co.kr' in (t.get('url') or ''):
            return t
    return None


async def main(out):
    t = target()
    if not t:
        print('FAIL: no gw tab'); return 1
    async with websockets.connect(t['webSocketDebuggerUrl'], max_size=100_000_000) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Page.enable'}))
        await ws.send(json.dumps({'id': 2, 'method': 'Page.captureScreenshot',
                                  'params': {'format': 'png', 'captureBeyondViewport': True}}))
        while True:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=40))
            if m.get('id') == 2:
                data = (m.get('result') or {}).get('data')
                if not data:
                    print('FAIL:', str(m)[:200]); return 1
                open(out, 'wb').write(base64.b64decode(data))
                print('saved', out); return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else 'shot.png')))
```

### 3-4. `gw_click2.py` — 신뢰된 마우스 클릭
⚠️ **이 사이트는 페이지 안 `el.click()`이 무반응인 곳이 많다**(핸들러가 폼에 위임돼 있음).
그리고 `buttons` 비트마스크를 안 채우면 일부 핸들러가 이벤트를 무시한다.

```python
# -*- coding: utf-8 -*-
"""usage: python gw_click2.py X Y    (좌표는 gw_shot.py 이미지의 원본 픽셀 = CSS 픽셀)"""
import asyncio, json, sys
import requests, websockets

PORT = 9222


def target():
    for t in requests.get('http://127.0.0.1:%d/json/list' % PORT, timeout=5).json():
        if t.get('type') == 'page' and 'gw.kortek.co.kr' in (t.get('url') or ''):
            return t
    raise RuntimeError('그룹웨어 탭 없음')


async def main(x, y):
    t = target()
    async with websockets.connect(t['webSocketDebuggerUrl'], max_size=20_000_000) as ws:
        seq = [('mouseMoved',    {'buttons': 0}),
               ('mousePressed',  {'button': 'left', 'buttons': 1, 'clickCount': 1}),
               ('mouseReleased', {'button': 'left', 'buttons': 0, 'clickCount': 1})]
        for i, (ev, extra) in enumerate(seq, start=1):
            p = {'type': ev, 'x': x, 'y': y}; p.update(extra)
            await ws.send(json.dumps({'id': i, 'method': 'Input.dispatchMouseEvent', 'params': p}))
            await asyncio.sleep(0.15)
        await asyncio.sleep(0.6)
    print('clicked (%s,%s)' % (x, y))
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main(float(sys.argv[1]), float(sys.argv[2]))))
```

> 버튼의 **정확한 좌표**는 눈대중 말고 JS로 재는 게 빠르다:
> `el.getBoundingClientRect()` 의 중심값 — `gw_bridge.eval_in_gw()` 로 한 줄이면 된다.

### 3-5. `gw_console_click.py` — 누르면서 콘솔·네트워크·예외를 같이 보기
"눌렀는데 아무 일도 안 난다"의 원인을 찾을 때. **조용히 막히는 제출**은 이걸로 잡았다.

```python
# -*- coding: utf-8 -*-
"""확인 버튼을 jQuery trigger로 누르면서 console/log/exception/네트워크를 함께 관찰."""
import asyncio, json, sys
import requests, websockets

PORT = 9222
ORIGIN = 'https://gw.kortek.co.kr'
TRIGGER = """
(() => {
  const jq = window.jQuery || window.$;
  const ok = [...document.querySelectorAll('footer.btn_layer_wrap a.btn_major_s')]
    .filter(e => e.offsetParent !== null)[0];
  if (!ok) return 'no-button';
  jq(ok).trigger('click');
  return 'triggered';
})()
"""


def target():
    for t in requests.get('http://127.0.0.1:%d/json/list' % PORT, timeout=5).json():
        if t.get('type') == 'page' and 'gw.kortek.co.kr' in (t.get('url') or ''):
            return t
    raise RuntimeError('no gw tab')


async def main():
    t = target()
    async with websockets.connect(t['webSocketDebuggerUrl'], max_size=60_000_000) as ws:
        for i, m in enumerate(['Runtime.enable', 'Log.enable', 'Network.enable'], start=1):
            await ws.send(json.dumps({'id': i, 'method': m}))
        await asyncio.sleep(1.0)
        await ws.send(json.dumps({'id': 50, 'method': 'Runtime.evaluate',
                                  'params': {'expression': TRIGGER, 'returnByValue': True}}))
        loop = asyncio.get_event_loop(); end = loop.time() + 15
        while loop.time() < end:
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(0.2, end - loop.time())))
            except asyncio.TimeoutError:
                break
            m = msg.get('method')
            if msg.get('id') == 50:
                print('trigger ->', json.dumps(msg.get('result', {}), ensure_ascii=False)[:200])
            elif m == 'Runtime.consoleAPICalled':
                args = [str(a.get('value', a.get('description', '')))[:160] for a in msg['params'].get('args', [])]
                print('[console.%s] %s' % (msg['params'].get('type'), ' | '.join(args)))
            elif m == 'Runtime.exceptionThrown':
                d = msg['params'].get('exceptionDetails', {})
                print('[JS 예외] %s' % str(d.get('text') or d)[:220])
            elif m == 'Log.entryAdded':
                e = msg['params'].get('entry', {})
                print('[log.%s] %s' % (e.get('level'), str(e.get('text'))[:200]))
            elif m == 'Network.requestWillBeSent':
                r = msg['params'].get('request', {})
                if r.get('method', 'GET') != 'GET' and '/api/' in r.get('url', ''):
                    print('[요청] %s %s' % (r['method'], r['url'].replace(ORIGIN, '')[:110]))
                    if r.get('postData'):
                        print('       body: %s' % r['postData'][:600])
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
```

> 출력이 폰트 preload 경고로 덮인다 → `| grep -v "woff2\|JQMIGRATE\|preload"` 로 거를 것.
> **버튼 핸들러 소스를 직접 읽는 것**도 강력하다:
> `jq._data(el,'events').click[0].handler.toString()` — 조기 return 조건이 바로 보인다.

### 3-6. 번들에서 쓰기 경로 긁기
경로만이라도 **호출 없이** 알아낼 때. ⚠️ **모듈 화면을 열고 충분히 기다린 뒤** 돌려야 한다
(네비게이션 직후면 번들이 안 붙어 JS가 8개만 잡힌다 — 정상은 59개).

```python
# gw_bridge.eval_in_gw() 로 아래를 실행하면 된다
SCAN = r"""
(async () => {
  const srcs = new Set();
  for (const s of document.querySelectorAll('script[src]')) srcs.add(s.src);
  for (const e of performance.getEntriesByType('resource'))
    if (/\.js$/i.test(e.name.split('?')[0])) srcs.add(e.name);
  const out = { files: 0, hits: [] };
  for (const u of srcs) {
    let t = '';
    try { const r = await fetch(u, { credentials:'same-origin' });
          if (!r.ok) continue; t = await r.text(); out.files++; } catch (e) { continue; }
    const rx = /['"`](\/api\/[A-Za-z0-9_\-\/\.{}$:+]{2,110})['"`]/g;
    let m;
    while ((m = rx.exec(t))) {
      const win = t.slice(Math.max(0, m.index - 500), m.index + 600);
      const meth = new Set();
      const mm = win.match(/(?:type|method)\s*:\s*['"](POST|PUT|DELETE|PATCH)['"]/i);
      if (mm) meth.add(mm[1].toUpperCase());
      if (/\$\.post\s*\(/.test(win)) meth.add('POST');
      const m2 = win.match(/\.(post|put|delete|patch)\s*\(\s*['"`]/);
      if (m2) meth.add(m2[1].toUpperCase());
      if (!meth.size) continue;
      out.hits.push({ path: m[1], methods: [...meth], file: u.split('/').pop().split('?')[0] });
    }
  }
  return out;
})()
"""
```

---

## 4. 일반 교훈 (다음 세션에서 또 당하지 않게)

- **경로도 파라미터도 추측하면 틀린다.** 추측 경로 12개가 전부 404였고, 메일 검색어는
  `keyword`가 아니라 **`keyWord`**(대문자 W)였다. 관찰로만 확정할 것.
- **0건은 "없음"이 아닐 수 있다.** 엉뚱한 `searchtype`으로 찾으면 조용히 0건이 온다
  (승인원 문서 제목이 영문이라 `title/승인원`=0건, `formName/승인`=18건).
- **`python -c "..."` 안에 백틱을 쓰지 말 것** — bash가 명령 치환으로 먹어서 문서가 조용히
  망가진다(실제로 당함). 패치는 **스크립트 파일로 써서 실행**할 것.
  heredoc의 백슬래시 접힘도 같은 부류 → `chr(92)`로 조립하거나 Write 도구를 쓸 것.
- **백엔드 라우트 검증은 `app.test_client()`로.** 사용자가 돌리는 5000번 프로세스를
  죽이지 말 것(예약 발송·SAP 작업 중일 수 있음).
- **커밋 전**: `git fetch origin main` → behind 확인, `node --check`(훅이 자동), 백엔드는
  `py -3-32 -m py_compile`, 제어문자 스캔, 캐시버스터 `?v=` 올리기, zip 재생성.
