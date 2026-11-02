#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""📏 저장소 기준선 실측 — NAS/백엔드 쪽 (python tests/storage-baseline.py)

왜 있나: Drive → NAS 이사의 "빨라졌다"를 증명할 근거를 **이사 전에** 남기기 위해서다.
         이사 뒤에는 Drive 쪽 수치를 다시 뽑을 수 없다. (CLAUDE.md: 근거는 실측뿐)

무엇을 재나 (전부 실제 경로 — 가짜 없음):
  ① /health            Flask + localhost HTTP 바닥값(디스크 안 탐)
  ② /doc/config        바닥값 + SMB `isdir` 1회
  ③ /doc/list          SMB 폴더 훑기(scandir)
  ④ /doc/get           파일 읽기 처리량
  ⑤ /doc/put           파일 쓰기 처리량 — **임시파일 1개, 측정 직후 삭제**

⚠️ 사내 공유 경로(UNC)는 찍지 않는다 — 이 저장소는 GitHub Pages로 공개돼 있다.
⚠️ 브라우저 쪽(Drive 대 NAS 비교)은 tests/storage-baseline.browser.js 로 따로 잰다.
   그쪽이 본편이다. 이 파일은 백엔드만 떼어내 교차 확인하는 용도.
"""
import json
import statistics as st
import sys
import time
import urllib.parse
import urllib.request

# 콘솔이 cp949여도 한글/기호가 깨지지 않게
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

BACKEND = 'http://127.0.0.1:5000'
FOLDER = 'PROJECT LIST'          # 실제 JSON이 들어 있는 앱 폴더(없으면 아래에서 자동 교체)
TMP_NAME = '_baseline_tmp_delete_me.json'
SAMPLES = {'floor': 20, 'meta': 10, 'io': 5}


def hit(path, data=None, ctype=None, raw=False, timeout=60):
    """한 번 호출하고 (경과 ms, 응답) 을 돌려준다."""
    req = urllib.request.Request(BACKEND + path, data=data)
    if ctype:
        req.add_header('Content-Type', ctype)
    t = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
    ms = (time.perf_counter() - t) * 1000
    return ms, (body if raw else json.loads(body.decode('utf-8')))


def bench(label, fn, n):
    """n번 재고 min/중앙/최대를 찍는다.
    ⚠️ 평균을 쓰지 않는다 — Flask 개발서버 지터가 평균을 끌어올려 실제보다 느리게 보인다."""
    xs = sorted(fn() for _ in range(n))
    print('%-32s n=%-3d min %7.1f   중앙 %7.1f   최대 %7.1f ms'
          % (label, n, xs[0], st.median(xs), xs[-1]))
    return st.median(xs), xs[0]


def main():
    try:
        _, cfg = hit('/doc/config', timeout=10)
    except Exception as e:
        print('❌ 백엔드(127.0.0.1:5000)에 닿지 못했습니다: %s' % e)
        print('   kortek_backend.bat 을 먼저 띄우세요.')
        return 1
    if not cfg.get('reachable'):
        print('❌ NAS 경로에 접근할 수 없습니다(사내망/권한 확인). configured=%s' % cfg.get('configured'))
        return 1
    print('NAS 연결 OK · 앱 폴더 %d개' % len(cfg.get('folders') or []))

    out = {}
    print('\n== ① 바닥값 (Flask + localhost HTTP, 디스크 안 탐) ==')
    out['floor'], floor_min = bench('/health', lambda: hit('/health')[0], SAMPLES['floor'])

    print('\n== ② SMB 한 번 닿는 비용 ==')
    out['isdir'], _ = bench('/doc/config (isdir 1회)', lambda: hit('/doc/config')[0], SAMPLES['meta'])

    folder = FOLDER
    q = urllib.parse.quote(folder)
    _, d = hit('/doc/list?folder=' + q)
    files = sorted(d.get('files') or [], key=lambda f: f.get('size', 0))
    if not any(f['name'].lower().endswith('.json') for f in files):
        # 그 폴더에 JSON이 없으면 JSON이 있는 폴더를 찾아 쓴다
        for cand in (cfg.get('folders') or []):
            _, dd = hit('/doc/list?folder=' + urllib.parse.quote(cand))
            ff = sorted(dd.get('files') or [], key=lambda f: f.get('size', 0))
            if any(f['name'].lower().endswith('.json') for f in ff):
                folder, q, files = cand, urllib.parse.quote(cand), ff
                break

    print('\n== ③ 폴더 훑기 (SMB scandir) — %s ==' % folder)
    out['list'], _ = bench('/doc/list', lambda: hit('/doc/list?folder=' + q)[0], SAMPLES['meta'])
    for f in files:
        print('   %10d B  %s' % (f.get('size', 0), f.get('name')))

    tgt = next((f for f in files if f['name'].lower().endswith('.json')), None)
    if not tgt:
        print('\n⚠️ JSON 파일이 없어 읽기/쓰기 측정을 건너뜁니다.')
    else:
        nm, size = urllib.parse.quote(tgt['name']), tgt['size']
        print('\n== ④ 파일 읽기 (%.0f KB) ==' % (size / 1024))
        med, _ = bench('/doc/get', lambda: hit('/doc/get?folder=%s&name=%s' % (q, nm), raw=True)[0],
                       SAMPLES['io'])
        out['read_ms'], out['read_mbs'] = med, size / 1024 / 1024 / (med / 1000)
        print('   → %.1f MB/s' % out['read_mbs'])

        # 쓰기 — 같은 크기 임시 JSON을 올렸다가 바로 지운다.
        # 이름 앞의 '_' 는 앱의 프로젝트 목록 필터와 무관하지만, 사람이 보고 바로 지울 수
        # 있게 "delete_me"를 박아 둔다. finally 로 반드시 삭제한다.
        payload = json.dumps({'pad': 'a' * size}).encode('utf-8')[:size]
        bnd = '----baseline'
        body = (b'--' + bnd.encode() + b'\r\nContent-Disposition: form-data; name="file"; filename="'
                + TMP_NAME.encode() + b'"\r\nContent-Type: application/json\r\n\r\n' + payload
                + b'\r\n--' + bnd.encode() + b'--\r\n')
        print('\n== ⑤ 파일 쓰기 (%.0f KB · 임시파일, 측정 후 삭제) ==' % (len(payload) / 1024))
        try:
            medw, _ = bench('/doc/put (overwrite)',
                            lambda: hit('/doc/put?folder=%s&name=%s&overwrite=1'
                                        % (q, urllib.parse.quote(TMP_NAME)),
                                        data=body,
                                        ctype='multipart/form-data; boundary=' + bnd)[0],
                            SAMPLES['io'])
            out['write_ms'], out['write_mbs'] = medw, len(payload) / 1024 / 1024 / (medw / 1000)
            print('   → %.1f MB/s' % out['write_mbs'])
        finally:
            ms, r = hit('/doc/delete',
                        data=json.dumps({'folder': folder, 'name': TMP_NAME}).encode('utf-8'),
                        ctype='application/json')
            print('   임시파일 삭제: ok=%s (%.1f ms)' % (r.get('ok'), ms))

    print('\n── 요약 ──')
    print('바닥값(min %.1f / 중앙 %.1f ms) 을 뺀 SMB 순비용:' % (floor_min, out['floor']))
    print('  폴더 훑기 %+.1f ms · isdir %+.1f ms' % (out['list'] - out['floor'], out['isdir'] - out['floor']))
    if 'read_mbs' in out:
        print('  읽기 %.1f MB/s · 쓰기 %.1f MB/s' % (out['read_mbs'], out.get('write_mbs', 0)))
    print('\n이 숫자를 Drive 쪽과 비교해야 의미가 있습니다 →'
          ' 앱 콘솔에 tests/storage-baseline.browser.js 붙여넣기')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
