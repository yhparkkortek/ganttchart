# -*- coding: utf-8 -*-
"""🔬 인사관리(kInsa) 쓰기 요청 관찰기 — **보기만 한다.**

왜 필요한가
-----------
인사관리 신청서는 **읽는 법을 배워도 쓰는 법은 배울 수 없다.** 실제로 열려 있던
'근무계획 수정 신청서'를 뜯어보니(2026-10-21):

  · `<form>` 에 **action 이 없고** method 가 get 이다 → 평범한 폼 전송이 아니다
  · 입력칸 16개 중 **name 이 하나도 없다** → 이름으로 값을 실어 보낼 수가 없다
  · `등록` 버튼이 `type=button` 이고 onclick 도 없다 → 리스너를 JS 가 붙인다
  · hidden 6개 → 토큰/문서번호 같은 게 섞여 있을 수 있다

즉 payload 를 JS 가 DOM 에서 긁어 **변수로 조립**한다. 바깥에서 아무리 들여다봐도
"무엇을 어떤 형식으로 보내는지"는 알 수 없다. 그룹웨어에서 얻은 결론과 같다
(docs/groupware.md: "API 경로를 추측하지 말 것 — 추측 12개가 전부 404").

→ **사람이 한 번 실제로 제출하는 동안 그 요청을 관찰**해서 확정하는 수밖에 없다.

안전 규칙
---------
· 이 도구는 **관찰만** 한다. 클릭하지 않고, 입력하지 않고, 잡은 요청을 **재전송하지 않는다.**
· 따라서 이걸 돌린다고 무언가가 신청되거나 결재가 올라가지 않는다.
  실제 제출은 **사람이** 화면에서 직접 한다.
· 비밀번호·토큰이 섞여 들어올 수 있으니 결과 파일은 **저장소에 올리지 말 것**
  (.gitignore 에 등록돼 있다).

쓰는 법
-------
    python insa_capture_write.py write_capture.json 90

  1) 전용 크롬에서 인사관리를 띄우고 신청서를 작성해 둔다(아직 등록 누르지 말 것)
  2) 위 명령을 실행한다 — "관찰 시작" 이 뜨면
  3) 화면에서 **등록(제출)을 한 번** 누른다
  4) 끝나면 write_capture.json 에 그 사이 오간 요청이 전부 담긴다
"""
import asyncio
import json
import sys
import time

import requests

CDP_BASE = 'http://127.0.0.1:9222'
INSA_HOST = 'insa.kortek.co.kr'

# 정적 파일은 시끄럽기만 하다 — 쓰기 요청을 찾는 데 방해가 된다.
_SKIP_EXT = ('.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.svg')


def _insa_tab():
    try:
        tabs = requests.get(f'{CDP_BASE}/json/list', timeout=5).json()
    except Exception as e:
        print(f'크롬(CDP 9222)에 붙지 못했습니다: {e}')
        return None
    for t in tabs:
        if t.get('type') == 'page' and INSA_HOST in (t.get('url') or ''):
            return t
    print('인사관리 탭을 찾지 못했습니다 — 전용 크롬에서 인사관리를 먼저 열어주세요.')
    return None


async def _capture(ws_url, seconds):
    import websockets
    seen = []
    async with websockets.connect(ws_url, max_size=80_000_000) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Network.enable'}))
        print(f'👀 관찰 시작 — 지금 화면에서 제출을 한 번 눌러주세요. ({seconds}초)')
        deadline = time.time() + seconds
        while time.time() < deadline:
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(1, deadline - time.time())))
            except asyncio.TimeoutError:
                break
            except Exception:
                break
            if msg.get('method') != 'Network.requestWillBeSent':
                continue
            req = (msg.get('params') or {}).get('request') or {}
            url = req.get('url', '')
            if INSA_HOST not in url or url.split('?')[0].lower().endswith(_SKIP_EXT):
                continue
            row = {'method': req.get('method'), 'url': url,
                   'postData': req.get('postData'),
                   'contentType': (req.get('headers') or {}).get('Content-Type', ''),
                   'at': time.strftime('%H:%M:%S')}
            seen.append(row)
            mark = '📝' if row['method'] != 'GET' else '  '
            print(f"{mark} {row['method']:5} {url.replace('http://' + INSA_HOST, '')[:88]}")
    return seen


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'insa_write_capture.json'
    secs = int(sys.argv[2]) if len(sys.argv) > 2 else 90
    tab = _insa_tab()
    if not tab:
        return 1
    print(f'탭: {tab.get("url")}')
    rows = asyncio.new_event_loop().run_until_complete(
        _capture(tab['webSocketDebuggerUrl'], secs))
    writes = [r for r in rows if r['method'] != 'GET']
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'capturedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
                   'total': len(rows), 'writes': writes, 'all': rows}, f,
                  ensure_ascii=False, indent=2)
    print(f'\n저장: {out}  (전체 {len(rows)}건, 그중 쓰기성 {len(writes)}건)')
    if not writes:
        print('⚠️ 쓰기성 요청(POST/PUT)이 안 잡혔습니다 — 관찰 중에 제출을 누르셨는지 확인해주세요.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
