# -*- coding: utf-8 -*-
"""🌐 CORS `Access-Control-Allow-Methods`에 PUT이 있는지 — `/jira/issue/<key>`(필드 저장,
js/70)가 이 백엔드의 **첫 PUT 라우트**라 그 전까지 아무도 이 구멍을 못 봤다.

  왜 — 사용자 실측(2026-11-17): JIRA 상세 모달에서 "💾 필드 저장"을 누르면 브라우저
  콘솔에 "⚠️ Failed to fetch"만 뜨고 서버 로그엔 아무것도 안 남았다. PUT + JSON 바디는
  CORS "단순 요청"이 아니라 브라우저가 먼저 OPTIONS 프리플라이트를 보내는데, 그 응답의
  `Access-Control-Allow-Methods`에 PUT이 없으면 브라우저가 **실제 PUT 요청을 아예 안
  보낸다** — 그래서 서버는 받은 적도 없어 로그가 비어 있었다.

  돌리는 법:  py -3 tests/test_cors_put.py

  🎯 가짜 없음 — 진짜 Flask app(`app.test_client()`)으로 OPTIONS 프리플라이트만 보낸다.
     Flask는 OPTIONS를 라우트 본문(jira_bridge 호출 등)까지 가지 않고 자동 처리하므로
     네트워크·JIRA 계정이 전혀 필요 없다.
"""
import os
import sys

try:                       # cp949 콘솔에서 이모지가 죽지 않게
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail and not cond else ''))


def main():
    import kortek_backend
    c = kortek_backend.app.test_client()
    origin = 'https://yhparkkortek.github.io'

    print('\n[1] OPTIONS 프리플라이트 — /jira/issue/<key>(PUT, 필드 저장)')
    r = c.options('/jira/issue/GABJO-1', headers={
        'Origin': origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'Content-Type',
    })
    methods = [m.strip() for m in r.headers.get('Access-Control-Allow-Methods', '').split(',')]
    check('PUT이 허용 메서드 목록에 있다(없으면 브라우저가 "Failed to fetch"로 막는다)', 'PUT' in methods, methods)
    check('허용 출처도 그대로 반영된다', r.headers.get('Access-Control-Allow-Origin') == origin,
          r.headers.get('Access-Control-Allow-Origin'))

    print('\n[2] 기존 메서드(GET/POST/DELETE/OPTIONS)도 여전히 허용되는지(회귀 방지)')
    r2 = c.options('/jira/search', headers={'Origin': origin, 'Access-Control-Request-Method': 'GET'})
    methods2 = [m.strip() for m in r2.headers.get('Access-Control-Allow-Methods', '').split(',')]
    for m in ('GET', 'POST', 'DELETE', 'OPTIONS'):
        check(m + '도 여전히 허용 목록에 있다', m in methods2, methods2)

    print('\n' + '=' * 50)
    print('PASS %d / FAIL %d' % (len(PASS), len(FAIL)))
    if FAIL:
        print('실패:', FAIL)
        sys.exit(1)


if __name__ == '__main__':
    main()
