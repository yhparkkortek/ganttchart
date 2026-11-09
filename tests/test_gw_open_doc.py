# -*- coding: utf-8 -*-
"""🔗 그룹웨어 문서 열람(`/gw/open-doc` · `gw_bridge.open_document`) 검증.

  돌리는 법:  py -3 tests/test_gw_open_doc.py

  🎯 가짜는 **바깥 경계에만** — 크롬 띄우기(`launch_chrome`)·CDP 왕복(`requests.put/get`)·
     결재함 조회(`approval_doclist`) 셋뿐이다. 주소를 만드는 규칙과 라우트는 **진짜 코드**로 돈다.
  ⚠️ 그래서 **실제 크롬이 뜨지 않고 그룹웨어에 요청도 안 간다**.
  ⚠️ 돌고 있는 5000번 프로세스는 건드리지 않는다(`app.test_client()`).
"""
import io
import os
import sys
import json

try:                       # cp949 콘솔에서 이모지가 죽지 않게
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import gw_bridge  # noqa: E402

PASS = []
FAIL = []


def ok(cond, what):
    (PASS if cond else FAIL).append(what)
    if not cond:
        print(u'  ❌ ' + what)


class Spy(object):
    def __init__(self):
        self.urls = []
        self.launched = 0
        self.lists = []

    def install(self, doclist_result=None, launch=(True, 'ok')):
        spy = self

        def _put(url, **kw):
            spy.urls.append(url)
            class R(object):
                status_code = 200
            return R()

        def _launch(wait=15):
            spy.launched += 1
            return launch

        def _doclist(**kw):
            spy.lists.append(kw)
            return doclist_result or {'docs': []}

        gw_bridge.requests.put = _put
        gw_bridge.requests.get = _put
        gw_bridge.launch_chrome = _launch
        gw_bridge.approval_doclist = _doclist


def main():
    print(u'\U0001f517 /gw/open-doc 검증')

    # ── 1. 문서 id 로 바로 연다 ────────────────────────────────────────
    spy = Spy(); spy.install()
    r = gw_bridge.open_document(doc_id='220176')
    ok(r.get('ok') is True, u'id 로 열지 못했다: %s' % r)
    ok(spy.launched == 1, u'전용 크롬을 먼저 띄우지 않는다')
    ok(len(spy.urls) == 1, u'CDP 요청이 1번이 아니다: %d' % len(spy.urls))
    ok(spy.urls[0].endswith('/app/approval/document/220176'),
       u'여는 주소가 틀리다: %s' % spy.urls[0])
    ok(gw_bridge.GW_ORIGIN in spy.urls[0], u'주소가 그룹웨어 밖이다')
    ok(spy.lists == [], u'id 를 줄 때는 결재함을 안 뒤져야 한다')

    # ── 2. 문서번호만 알면 결재함에서 id 를 찾는다 ──────────────────────
    spy = Spy()
    spy.install(doclist_result={'docs': [
        {'docNum': 'M3T-2605-019', 'id': 111},
        {'docNum': 'M3T-2605-020', 'id': 222},
    ]})
    r = gw_bridge.open_document(doc_num='M3T-2605-020')
    ok(r.get('ok') is True, u'문서번호로 못 열었다: %s' % r)
    ok(spy.urls and spy.urls[0].endswith('/222'),
       u'문서번호 → id 매핑이 틀렸다: %s' % (spy.urls[0] if spy.urls else None))
    ok(len(spy.lists) == 1 and spy.lists[0].get('searchtype') == 'docNum',
       u'문서번호로 찾지 않았다: %s' % spy.lists)

    # ⚠️ 비슷한 번호를 집으면 **남의 문서**가 열린다 — 정확히 같은 번호만
    spy = Spy()
    spy.install(doclist_result={'docs': [{'docNum': 'M3T-2605-0201', 'id': 999}]})
    r = gw_bridge.open_document(doc_num='M3T-2605-020')
    ok(r.get('ok') is False, u'번호가 다른데 열었다(남의 문서가 열린다)')
    ok(not spy.urls, u'못 찾았는데 탭을 열었다')

    # ── 3. 아무 것도 모르면 정직하게 실패한다 ──────────────────────────
    spy = Spy(); spy.install()
    r = gw_bridge.open_document()
    ok(r.get('ok') is False, u'빈 요청을 열었다')
    ok(not spy.urls and spy.launched == 0, u'빈 요청에 크롬을 띄웠다')
    spy = Spy(); spy.install()
    r = gw_bridge.open_document(doc_id='../../etc/passwd')
    ok(r.get('ok') is False, u'id 가 숫자가 아닌데 열었다 — 주소 조작 위험')
    ok(not spy.urls, u'숫자가 아닌 id 로 CDP 를 불렀다')

    # ── 4. 크롬이 안 뜨면 그 사유를 그대로 돌려준다 ─────────────────────
    spy = Spy(); spy.install(launch=(False, u'크롬을 찾지 못했습니다'))
    r = gw_bridge.open_document(doc_id='1')
    ok(r.get('ok') is False and u'크롬' in (r.get('message') or ''),
       u'크롬 실패 사유를 안 돌려준다: %s' % r)
    ok(not spy.urls, u'크롬이 없는데 탭을 열려 했다')

    # ── 5. 라우트 — 진짜 Flask 앱으로 (5000번 프로세스는 안 건드린다) ───
    import kortek_backend
    spy = Spy(); spy.install()
    c = kortek_backend.app.test_client()
    res = c.post('/gw/open-doc', json={'docId': '220176'})
    ok(res.status_code == 200, u'라우트 응답 코드 %s' % res.status_code)
    j = json.loads(res.data.decode('utf-8'))
    ok(j.get('ok') is True, u'라우트가 실패했다: %s' % j)
    ok(j.get('url', '').endswith('/220176'), u'라우트가 돌려준 주소가 틀리다: %s' % j)
    res = c.post('/gw/open-doc', json={})
    j = json.loads(res.data.decode('utf-8'))
    ok(res.status_code == 200 and j.get('ok') is False, u'빈 요청에 200+ok:false 가 아니다: %s' % j)

    print(u'\n%s %d/%d' % (u'❌' if FAIL else u'✅', len(PASS), len(PASS) + len(FAIL)))
    for f in FAIL:
        print(u'   ❌ ' + f)
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
