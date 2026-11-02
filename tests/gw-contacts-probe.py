#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🧑‍🤝‍🧑 사내 주소록을 "권한 원천"으로 쓸 수 있나 — 타당성 확인 (python tests/gw-contacts-probe.py)

왜 있나: 앱 권한(개발팀=쓰기 / 일부 그룹=읽기)을 사람이 손으로 유지하는 대신 **그룹웨어
         주소록의 부서**로 판정할 수 있는지 보려면, 그 데이터가 실제로 쓸 만한지부터 재야 한다.
         확인할 것 ① 부서가 다 채워져 있나 ② 이메일이 유일 키인가 ③ 동명이인이 몇 명인가
         ④ 한 번에 전건을 받을 수 있나(페이지네이션).

⚠️ **집계만 찍는다 — 이름·이메일·전화번호는 한 건도 출력하지 않는다.** 동료 개인정보다.
⚠️ 그룹웨어 전용 크롬이 떠 있고 **사람이 로그인해 둔 상태**여야 돈다. 이 스크립트는 로그인을
   시도하지 않는다 — 1회 실패로 CAPTCHA 가 뜨고 사내 계정이 잠길 수 있는 자리다.
   (끊겨 있으면 앱의 🔑 설정창이나 열린 그룹웨어 창에서 사람이 직접 로그인)
"""
import collections
import json
import sys
import time
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

BACKEND = 'http://127.0.0.1:5000'


def get(limit, page=0):
    url = '%s/gw/contacts?limit=%d&page=%d' % (BACKEND, limit, page)
    t = time.perf_counter()
    with urllib.request.urlopen(url, timeout=90) as r:
        return (time.perf_counter() - t) * 1000, json.loads(r.read().decode('utf-8'))


def main():
    try:
        with urllib.request.urlopen(BACKEND + '/gw/status', timeout=40) as r:
            st = json.loads(r.read().decode('utf-8'))
    except Exception as e:
        print('❌ 백엔드(5000)에 닿지 못했습니다: %s' % e)
        return 1
    if not st.get('ok'):
        print('❌ 그룹웨어 세션이 없습니다 (reason=%s)' % st.get('reason'))
        print('   → 그룹웨어 창에서 **사람이 직접** 로그인한 뒤 다시 실행하세요.')
        print('   (이 스크립트는 계정 잠금을 피하려고 로그인을 시도하지 않습니다)')
        return 1
    print('그룹웨어 세션 OK — %s / %s' % (st.get('loginId'), st.get('position')))

    ms, d = get(500)
    if not d.get('ok'):
        print('❌ 주소록 조회 실패: %s' % d.get('message'))
        return 1
    cs = d.get('contacts') or []
    print('\n한 번에 받은 건수 %d / 서버가 말하는 전체 %s · %.0f ms'
          % (len(cs), d.get('total'), ms))
    if not cs:
        print('⚠️ 0건 — keyword 없이 전건을 받는 경로가 막혔는지 확인 필요'
              ' (docs/groupware.md 8-1: searchType=or 함정)')
        return 1

    n = len(cs)
    print('\n채워진 비율 (n=%d) — 부서가 비면 그 사람은 부서 규칙으로 판정할 수 없다' % n)
    for k in ('name', 'email', 'dept', 'position', 'company', 'mobile'):
        c = sum(1 for x in cs if (x.get(k) or '').strip())
        print('  %-9s %4d/%d  %5.1f%%' % (k, c, n, 100.0 * c / n))

    print('\n부서 분포 (상위 25) — 권한 규칙은 이 "이름 문자열"로 쓸 수밖에 없다')
    print('  (그룹웨어에 조직도 트리 API 가 없다: /api/organization 404, docs/groupware.md:40)')
    for dept, c in collections.Counter(
            (x.get('dept') or '(없음)').strip() for x in cs).most_common(25):
        print('  %3d  %s' % (c, dept))

    mails = [(x.get('email') or '').strip().lower() for x in cs]
    nz = [m for m in mails if m]
    print('\n이메일 유일성: 값 있는 %d건 / 서로 다른 값 %d개 → 중복 %d건'
          % (len(nz), len(set(nz)), len(nz) - len(set(nz))))
    doms = collections.Counter(m.split('@', 1)[1] for m in nz if '@' in m)
    print('도메인 종류 %d개 (사내 1개가 아니면 사외 연락처가 섞인 것)' % len(doms))

    names = collections.Counter((x.get('name') or '').strip() for x in cs)
    dup = sum(1 for nm, c in names.items() if c > 1 and nm)
    print('동명이인 %d명 → 이름을 권한 키로 쓰면 안 되는 근거(이메일 키를 쓸 것)' % dup)

    ms2, d2 = get(50, 0)
    ms3, d3 = get(50, 1)
    a = [x.get('email') for x in (d2.get('contacts') or [])]
    b = [x.get('email') for x in (d3.get('contacts') or [])]
    print('\n페이지네이션: page0 %d건 · page1 %d건 · 겹침 %d건 (%.0f/%.0f ms)'
          % (len(a), len(b), len(set(a) & set(b)), ms2, ms3))
    if a and b and set(a) == set(b):
        print('  ⚠️ 두 페이지가 같다 — page 가 안 먹는다. 전건을 한 번에 받아야 한다.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
