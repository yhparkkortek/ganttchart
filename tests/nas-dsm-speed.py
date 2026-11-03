#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""⚡ DSM Web API 속도 — "호출 1회 비용"과 "항목당 비용"을 **분리해서** 잰다
   (python tests/nas-dsm-speed.py)

왜 분리하나: 처음엔 항목 1,132개 폴더를 `limit=1000` 으로 재서 **244ms** 가 나왔고, 그걸
  SMB 기준선의 **44.2ms**(작은 폴더)와 나란히 놓아 "5배 느리다"고 읽힐 보고를 했다.
  같은 일을 재지 않았으니 그 비교는 틀렸다. 폴더 목록 시간은
      시간 ≈ (왕복 고정비) + (항목당 비용 × 항목 수)
  이고, 앱이 실제로 치르는 비용은 **앱이 쓰는 폴더 크기**에서의 값이다.
  프로젝트 폴더는 보통 수십 개짜리이므로 고정비가 거의 전부다.

⚠️ 읽기만 한다. 쓰기·삭제 없음.
⚠️ 숫자는 중앙값으로 본다(네트워크는 꼬리가 길다). 최솟값·최댓값도 같이 찍는다.
⚠️ SMB 쪽 루트는 **다른 공유폴더**라 같은 폴더를 양쪽으로 잴 수 없다(2026-11-03 확인).
   그래서 이 파일은 DSM 쪽만 재고, 비교는 `tests/storage-baseline.py` 수치와 **조건을 밝혀** 한다.
"""
import os
import statistics as st
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import nas_dsm  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

N = 7


def bench(fn, n=N):
    xs = []
    for _ in range(n):
        t = time.perf_counter()
        fn()
        xs.append((time.perf_counter() - t) * 1000)
    xs.sort()
    return xs[0], st.median(xs), xs[-1]


def row(label, xs, extra=''):
    print('  %-34s min %7.1f  중앙 %7.1f  최대 %7.1f ms %s'
          % (label, xs[0], xs[1], xs[2], extra))


def main():
    r = nas_dsm.login_once()
    if not r.get('ok'):
        print('❌ 로그인 실패: %s' % r.get('message'))
        return 1
    print('로그인: %s\n' % r.get('message'))

    # ── 접근 가능한 폴더를 크기별로 모은다 ──────────────────────────────
    cand = []
    for s in nas_dsm.list_shares():
        try:
            top = nas_dsm.list_folder(s['path'], limit=200)
        except Exception:
            continue
        for it in top['items']:
            if not it['isdir'] or it['name'].startswith('#'):
                continue
            try:
                probe = nas_dsm.list_folder(it['path'], limit=1)
            except Exception:
                continue          # ACL 거부 — 정상 동작이다
            cand.append((probe.get('total') or 0, it['path'], it['name']))
    if not cand:
        print('❌ 접근 가능한 하위 폴더가 없습니다.')
        return 1
    cand.sort()

    print('== ① 호출 1회 고정비 (limit=1 — 항목 수와 무관한 왕복 비용) ==')
    small, big = cand[0], cand[-1]
    xs_small = bench(lambda: nas_dsm.list_folder(small[1], limit=1))
    row('limit=1  (%s · %d개)' % (small[2], small[0]), xs_small)
    row('limit=1  (%s · %d개)' % (big[2], big[0]),
        bench(lambda: nas_dsm.list_folder(big[1], limit=1)))
    floor = xs_small[1]
    print('  → 두 값이 비슷하면 고정비가 지배한다는 뜻입니다. 고정비 %.1fms 로 봅니다.' % floor)

    print('\n== ② 항목 수에 따른 전체 목록 (항목당 비용 = (측정값 − 고정비) ÷ 항목 수) ==')
    seen = set()
    for total, path, name in cand:
        bucket = 0 if total <= 20 else (1 if total <= 100 else (2 if total <= 400 else 3))
        if bucket in seen or not total:
            continue
        seen.add(bucket)
        xs = bench(lambda p=path: nas_dsm.list_folder(p, limit=2000))
        row('전체 목록 (%s · %d개)' % (name, total), xs,
            '· 항목당 %.3fms' % max(0.0, (xs[1] - floor) / total))
    print('  (앱 프로젝트 폴더는 보통 수십 개 → ① 의 고정비가 실제 비용에 가깝습니다)')

    print('\n== ③ 파일 읽기 처리량 ==')
    picked = None
    for total, path, name in reversed(cand):
        try:
            items = [i for i in nas_dsm.list_folder(path, limit=500)['items']
                     if not i['isdir'] and (i.get('size') or 0) > 0]
        except Exception:
            continue
        if items:
            picked = min(items, key=lambda i: i['size'])
            break
    if not picked:
        print('  (읽을 파일을 못 찾아 건너뜀 — 하위 폴더만 있는 공유입니다)')
    else:
        size = picked['size']
        print('  대상: %s (%.1f KB)' % (picked['name'], size / 1024))
        xs = bench(lambda: nas_dsm.download(picked['path']), n=5)
        row('파일 읽기', xs, '· %.1f MB/s' % (size / 1048576 / (xs[1] / 1000)))

    print('\n== 비교 (조건을 같이 읽을 것) ==')
    print('  SMB 경유(tests/storage-baseline.py): 바닥값 4.6ms · 폴더 목록 44.2ms'
          ' · 읽기 5.4MB/s · 쓰기 3.5MB/s')
    print('  ⚠️ SMB 쪽 루트는 **다른 공유폴더**라 같은 폴더를 양쪽으로 잴 수 없습니다.')
    print('     폴더 크기가 다르면 목록 시간은 그대로 비교하면 안 됩니다 — ① 의 고정비끼리 보세요.')
    nas_dsm.logout()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
