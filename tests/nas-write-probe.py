#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""✍️ NAS 쓰기 경로 검증 — 실제로 쓰고, 읽고, 덮어쓰고, 치운다
   (python tests/nas-write-probe.py)

왜 있나: 이 저장소는 **자동화 테스트가 0개**라 사람이 매번 최종 검사원이 된다.
  저장소를 Drive 에서 NAS 로 옮기는 일은 **쓰기가 정말 되는지**가 전부인데,
  "부품만 호출해 보고 됐다"고 하면 안 되는 자리다(연결부가 깨져 있어도 통과한다).
  그래서 **앱이 실제로 지나는 경로**(`nas_dsm.put` → `download` → 다시 `put`)를 한 번 통과시킨다.

확인하는 것:
  ① 새 파일 쓰기 → 읽어서 **바이트가 같은지**
  ② 같은 경로에 덮어쓰기 → 새 내용으로 바뀌는지 (원자적 교체 경로)
  ③ 한글 파일명·한글 내용이 멀쩡한지 (UTF-8 왕복)
  ④ 임시 파일이 남지 않는지 (원자적 교체의 뒷정리)
  ⑤ 동시 쓰기에서 **반쪽 파일이 안 생기는지** (항상 완전한 옛 값 또는 완전한 새 값)
  ⑥ 쓰기 속도

⚠️ 테스트 파일은 `_write_probe/` 아래에만 만들고 **끝나면 지운다**(실패해도 치운다).
⚠️ 앱 데이터 폴더에 쓰레기를 남기지 않는다. 기존 파일은 건드리지 않는다.
"""
import os
import statistics as st
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import nas_dsm  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

DIR = '_write_probe'
ok_count = 0
fail_count = 0


def read_back(path):
    """읽기가 막혀 있어도 **쓰기 검증을 끝까지 돌리려고** 예외를 값으로 바꾼다.
    (읽기가 안 되는 걸 숨기지 않는다 — 실패로 세고 사유를 찍는다)"""
    try:
        return nas_dsm.download(path), None
    except Exception as e:
        return None, str(e)


def check(label, cond, detail=''):
    global ok_count, fail_count
    if cond:
        ok_count += 1
        print('  ✅ %s %s' % (label, detail))
    else:
        fail_count += 1
        print('  ❌ %s %s' % (label, detail))
    return cond


def main():
    r = nas_dsm.login_once()
    if not r.get('ok'):
        print('❌ 로그인 실패: %s' % r.get('message'))
        return 1
    try:
        root, team_root = nas_dsm.roots()
    except Exception as e:
        print('❌ %s' % e)
        print('   → python nas_set_root.py --list  로 후보를 보고 --root 로 지정하세요.')
        return 1
    print('앱 루트: %s' % root)
    print('팀 파일 부모: %s%s\n' % (team_root, ' (= 공용과 같은 곳, 1단계)' if team_root == root else ''))

    base = nas_dsm.abs_path(DIR)
    made = []
    try:
        print('== ① 새 파일 쓰기 → 읽기 (UTF-8 한글 왕복) ==')
        p1 = '%s/검증_한글이름.json' % base
        body1 = '{"안녕":"하세요","n":1}'
        t = time.perf_counter()
        res = nas_dsm.put(p1, body1)
        ms = (time.perf_counter() - t) * 1000
        made.append(p1)
        check('쓰기', res.get('ok'), '· %d바이트 · %.0fms · 원자적=%s'
              % (res.get('bytes'), ms, res.get('atomic')))
        raw, err = read_back(p1)
        got = raw.decode('utf-8') if raw is not None else None
        check('읽은 내용이 동일', got == body1,
              '' if got == body1 else ('· 읽기 실패: %s' % err[:120] if err else '(받은 값: %r)' % got[:60]))

        print('\n== ② 덮어쓰기 (원자적 교체) ==')
        body2 = '{"안녕":"또 왔습니다","n":2,"pad":"%s"}' % ('가' * 500)
        nas_dsm.put(p1, body2)
        raw2, err2 = read_back(p1)
        got2 = raw2.decode('utf-8') if raw2 is not None else ''
        check('새 내용으로 바뀜', got2 == body2, '' if got2 == body2 else '· 읽기 실패' if err2 else '')
        check('옛 내용이 안 섞임', bool(got2) and '"n":1' not in got2,
              '' if got2 else '· 읽을 수 없어 판정 불가')

        print('\n== ③ 임시 자리 뒷정리 ==')
        items = nas_dsm.list_folder(base, limit=200)['items']
        stray = [i['name'] for i in items if not i['isdir'] and '.tmp' in i['name']]
        check('떠돌이 임시 파일 없음', not stray, '' if not stray else '· 남음: %s' % stray)
        # 임시 폴더는 **프로세스당 하나를 재사용**하므로 있는 게 정상이다.
        # 확인할 것은 "내 것만 있고, 그 안이 비었는지"다(옮기고 나면 비어야 한다).
        tdirs = [i for i in items if i['isdir'] and i['name'].startswith('.ganttput-')]
        mine = [i for i in tdirs if i['name'] == '.ganttput-%s' % nas_dsm._PROC_TAG]
        check('임시 폴더는 내 것 하나뿐', len(tdirs) == len(mine) <= 1,
              '· 발견: %s' % [i['name'] for i in tdirs])
        if mine:
            inside = nas_dsm.list_folder(mine[0]['path'], limit=50)['items']
            check('임시 폴더가 비어 있음', not inside,
                  '' if not inside else '· 남음: %s' % [i['name'] for i in inside])
        swept = nas_dsm.cleanup_tmpdirs(base, stale_sec=0)
        check('임시 폴더 청소됨', not nas_dsm.list_folder(base, limit=50)['items']
              or all(not i['name'].startswith('.ganttput-')
                     for i in nas_dsm.list_folder(base, limit=50)['items']),
              '· 치움 %s · 남김 %s' % (swept['removed'], swept['kept']))

        print('\n== ④ 하위 폴더 자동 생성 ==')
        p2 = '%s/깊은/폴더/안에.txt' % base
        nas_dsm.put(p2, 'deep')
        made.append(p2)
        deep, _ = read_back(p2)
        check('없던 폴더까지 만들어 씀', deep == b'deep',
              '· 쓰기는 됐지만 읽어서 확인 못 함' if deep is None else '')

        print('\n== ⑤ 동시 쓰기 — 반쪽 파일이 생기지 않는가 ==')
        print('   (마지막에 누가 이겼는지는 보장하지 않는다. 보장하는 건 "완전한 값"이라는 것뿐)')
        p3 = '%s/동시쓰기.json' % base
        nas_dsm.put(p3, '{"v":0}')
        made.append(p3)
        errs = []

        def writer(n):
            try:
                nas_dsm.put(p3, '{"v":%d,"pad":"%s"}' % (n, str(n) * 2000))
            except Exception as e:
                errs.append('%d: %s' % (n, e))

        ths = [threading.Thread(target=writer, args=(i,)) for i in range(1, 5)]
        for t2 in ths:
            t2.start()
        for t2 in ths:
            t2.join()
        rawf, errf = read_back(p3)
        import json as _j
        if rawf is None:
            check('끝난 파일이 완전한 JSON', False, '· 읽을 수 없어 판정 불가(%s)' % (errf or '')[:70])
        else:
            final = rawf.decode('utf-8')
            try:
                parsed = _j.loads(final)
                check('끝난 파일이 **완전한 JSON**', True, '· v=%s · %d바이트'
                      % (parsed.get('v'), len(final)))
            except Exception as e:
                check('끝난 파일이 완전한 JSON', False, '· 깨졌습니다: %s' % e)
        if errs:
            print('     (동시 쓰기 중 오류 %d건 — 이건 정상일 수 있다: 임시파일 경합)' % len(errs))
            for e in errs[:3]:
                print('       %s' % e)

        print('\n== ⑥ 쓰기 속도 ==')
        for kb in (1, 64, 512):
            data = ('x' * 1024 * kb)
            pz = '%s/speed_%dKB.bin' % (base, kb)
            made.append(pz)
            xs = []
            for _ in range(3):
                t3 = time.perf_counter()
                nas_dsm.put(pz, data)
                xs.append((time.perf_counter() - t3) * 1000)
            med = st.median(xs)
            print('  %4dKB 쓰기(원자적)  중앙 %7.1f ms  · %.1f MB/s'
                  % (kb, med, (kb / 1024.0) / (med / 1000.0)))
        print('  비교: SMB 경유 쓰기 3.5MB/s (tests/storage-baseline.py, 조건 다름)')

    finally:
        print('\n== 뒷정리 ==')
        try:
            nas_dsm.remove(base)
            print('  ✅ %s 삭제' % DIR)
        except Exception as e:
            print('  ⚠️ 테스트 폴더를 못 지웠습니다 — 직접 지워주세요: %s (%s)' % (base, e))
        nas_dsm.logout()

    print('\n통과 %d · 실패 %d' % (ok_count, fail_count))
    return 1 if fail_count else 0


if __name__ == '__main__':
    raise SystemExit(main())
