#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🗄️ DSM 경로 검증 — 팀별 권한이 실제로 막는가 + 속도는 얼마나 되는가
   (python tests/nas-dsm-probe.py)

확인하는 것:
  ① 내 계정이 보는 공유폴더 목록 — 권한 없는 공유는 **목록에 아예 안 나온다**
  ② 팀 폴더(01_개발1팀 … )를 하나씩 열어본다 → 어디가 열리고 어디가 막히는지
     ⚠️ 이게 이 검증의 핵심이다. "열려야 할 데가 열리고 막혀야 할 데가 막히는지"를
        사람이 눈으로 확인해야 한다 — 전부 열리면 ACL 이 아직 안 나뉜 것이다.
  ③ 폴더 목록·파일 읽기 속도 → SMB 경유(`tests/storage-baseline.py`)와 비교할 수 있게

⚠️ 읽기만 한다. 쓰기·삭제는 하지 않는다.
⚠️ 로그인은 저장된 설정으로 **한 번만**. 실패하면 멈춘다(DSM 은 실패가 쌓이면 IP 를 차단한다).
   먼저 `python nas_set_login.py` 로 계정을 저장해 두어야 한다.
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


def bench(label, fn, n=5):
    xs = []
    for _ in range(n):
        t = time.perf_counter()
        fn()
        xs.append((time.perf_counter() - t) * 1000)
    xs.sort()
    print('  %-30s n=%d  min %7.1f   중앙 %7.1f   최대 %7.1f ms'
          % (label, n, xs[0], st.median(xs), xs[-1]))
    return st.median(xs)


def main():
    if not nas_dsm.load_config():
        print('❌ NAS 로그인 정보가 없습니다 — 먼저 `python nas_set_login.py` 를 실행하세요.')
        return 1
    r = nas_dsm.login_once()
    print('로그인: %s' % r.get('message'))
    if not r.get('ok'):
        print('   (실패가 쌓이면 NAS 가 이 PC 의 IP 를 차단합니다 — 자동 재시도하지 않습니다)')
        return 1

    print('\n== ① 내 계정이 보는 공유폴더 ==')
    shares = nas_dsm.list_shares()
    for s in shares:
        p = s.get('perm') or {}
        acl = ''
        if isinstance(p, dict):
            acl = ' (읽기 %s · 쓰기 %s)' % ('O' if p.get('acl', {}).get('read') else 'X',
                                          'O' if p.get('acl', {}).get('write') else 'X')
        print('  · %-20s %s%s' % (s['name'], s['path'], acl))
    if not shares:
        print('  (0개 — 계정에 공유폴더 권한이 없습니다)')
        return 1

    print('\n== ② 팀 폴더 접근 — 열리는 곳 / 막히는 곳 ==')
    print('   ⚠️ 전부 열리면 ACL 이 아직 팀별로 안 나뉜 것입니다(= 지금 Drive 와 같은 상태)')
    opened, denied = [], []
    for s in shares:
        try:
            top = nas_dsm.list_folder(s['path'], limit=200)
        except Exception as e:
            print('  %-24s ← 목록 실패: %s' % (s['name'], e))
            continue
        subs = [i for i in top['items'] if i['isdir'] and not i['name'].startswith('#')]
        if not subs:
            continue
        print('\n  [%s] 하위 폴더 %d개' % (s['name'], len(subs)))
        for sub in subs:
            try:
                r2 = nas_dsm.list_folder(sub['path'], limit=1)
                opened.append(sub['path'])
                print('    ✅ %-28s 항목 %s개' % (sub['name'], r2.get('total')))
            except Exception as e:
                denied.append(sub['path'])
                print('    🔒 %-28s %s' % (sub['name'], e))

    print('\n  열림 %d곳 · 막힘 %d곳' % (len(opened), len(denied)))
    if opened and not denied:
        print('  → 이 계정은 본 폴더를 전부 읽을 수 있습니다. 팀별 분리를 원하면 IT 에 ACL 분리를 요청해야 합니다.')

    print('\n== ③ 속도 (SMB 경유 수치와 비교용) ==')
    if opened:
        target = opened[0]
        bench('폴더 목록(list)', lambda: nas_dsm.list_folder(target, limit=1000))
        # 읽기: 그 폴더에서 가장 작은 파일 하나로 재서 네트워크 왕복만 보이게 한다
        items = [i for i in nas_dsm.list_folder(target, limit=1000)['items']
                 if not i['isdir'] and (i.get('size') or 0) > 0]
        if items:
            f = min(items, key=lambda i: i['size'])
            size = f['size']
            print('  읽기 대상: %s (%.0f KB)' % (f['name'], size / 1024))
            med = bench('파일 읽기(download)', lambda: nas_dsm.download(f['path']))
            print('  → %.1f MB/s' % (size / 1048576 / (med / 1000)))
        else:
            print('  (파일이 없어 읽기 속도는 건너뜀)')

    print('\n비교: SMB 경유(tests/storage-baseline.py) 실측은 폴더 훑기 44.2ms · 읽기 5.4MB/s 였습니다.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
