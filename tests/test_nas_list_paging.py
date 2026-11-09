# -*- coding: utf-8 -*-
"""🗂 `nas_dsm.list_folder` 가 **끝까지 받아 오는지** (2026-11-09)

왜 — DSM 의 `SYNO.FileStation.List/list` 는 `limit` 개까지만 주고 **나머지를 말없이 버린다**.
  응답의 `total` 만 진짜 개수다. 옛 코드는 `limit=1000` 을 한 번 보내고 끝냈다.
  2026-11-09 실측: `MailBodies` 가 **total 1,067 / 받은 것 1,000** 이라 67개가 안 왔고,
  그래서 **방금 쓴 파일이 목록에 없어** 어댑터(js/57 `driveCreate`)가
  "그 경로에 파일이 없습니다" 로 던졌다 — 메일 본문 옮기기가 매번 거기서 터지며
  콘솔에 404 를 쏟았다. 1,000개 넘는 어느 폴더든 같은 식으로 **조용히** 잘린다.

가짜는 **경계 하나**(`_call` = DSM 왕복)뿐이다. 페이징 로직 자체는 진짜 코드로 돈다.
  NAS 도 백엔드도 필요 없다 → `py -3 tests/test_nas_list_paging.py`
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import nas_dsm  # noqa: E402

OK = BAD = 0


def check(label, cond, detail=''):
    global OK, BAD
    if cond:
        OK += 1
        print('  OK   ' + label + (' · ' + detail if detail else ''))
    else:
        BAD += 1
        print('  FAIL ' + label + (' · ' + detail if detail else ''))
    return cond


def fake_dsm(total, page_cap=None):
    """`total` 개를 가진 폴더 흉내. 한 쪽에 최대 `limit`(또는 page_cap) 개만 준다."""
    calls = []

    def _call(cfg, api, method, version, params=None, **kw):
        p = params or {}
        off = int(p.get('offset') or 0)
        lim = int(p.get('limit') or 1000)
        if page_cap:
            lim = min(lim, page_cap)
        calls.append((off, lim))
        files = [{'name': 'f%04d.txt' % i, 'path': '/x/f%04d.txt' % i, 'isdir': False,
                  'additional': {'size': i, 'time': {'mtime': 1700000000 + i}, 'perm': {}}}
                 for i in range(off, min(off + lim, total))]
        return {'files': files, 'total': total}

    return _call, calls


def run(total, **kw):
    orig_call, orig_cfg = nas_dsm._call, nas_dsm._cfg_or_raise
    fake, calls = fake_dsm(total, kw.pop('page_cap', None))
    nas_dsm._call = fake
    nas_dsm._cfg_or_raise = lambda: {'host': 'x'}
    try:
        return nas_dsm.list_folder('/x', **kw), calls
    finally:
        nas_dsm._call, nas_dsm._cfg_or_raise = orig_call, orig_cfg


print('== 한 쪽에 다 들어가는 폴더는 예전과 똑같이 한 번만 부른다 ==')
r, calls = run(12)
check('12개를 다 받았다', r['count'] == 12, str(r['count']))
check('total 을 그대로 전한다', r['total'] == 12)
check('왕복은 1번', len(calls) == 1, str(calls))
check('잘렸다고 하지 않는다', 'truncated' not in r)

print('\n== 🎯 1,000개를 넘기면 — 이게 그 버그다 ==')
r, calls = run(1067)
check('1,067개를 **전부** 받았다', r['count'] == 1067, str(r['count']) + ' / total ' + str(r['total']))
check('왕복은 2번(1000 + 67)', len(calls) == 2, str(calls))
# ⚠️ 자리 접근 전에 개수를 본다 — 한 쪽만 받는 돌연변이에서 **IndexError 로 터지지 말고**
#    실패로 보고해야 한다(터지면 뒤 항목이 아예 안 돌아 무엇이 깨졌는지 덜 보인다).
check('두 번째는 offset=1000 부터', len(calls) > 1 and calls[1][0] == 1000, str(calls))
check('잘렸다고 하지 않는다', 'truncated' not in r)
names = [x['name'] for x in r['items']]
check('마지막 파일까지 들어 있다', names[-1] == 'f1066.txt', names[-1])
check('이름이 안 겹친다(같은 쪽을 두 번 안 받았다)', len(set(names)) == 1067, str(len(set(names))))

print('\n== 딱 경계(1,000개)에서 헛돌지 않는다 ==')
r, calls = run(1000)
check('1,000개를 받았다', r['count'] == 1000)
check('왕복이 2번을 넘지 않는다', len(calls) <= 2, str(calls))

print('\n== 아주 큰 폴더 ==')
r, calls = run(4321)
check('4,321개를 전부 받았다', r['count'] == 4321, str(r['count']))
check('왕복 5번', len(calls) == 5, str(len(calls)))

print('\n== 🛑 상한에 걸리면 **조용히** 자르지 않고 알린다 ==')
r, calls = run(5000, max_items=2000)
check('상한에서 멈춘다', r['count'] <= 2000 + 1000, str(r['count']))
check('truncated 로 알린다', r.get('truncated') is True)
check('total 은 진짜 개수를 그대로', r['total'] == 5000)

print('\n== DSM 이 total 을 안 줘도 멈춘다(무한 루프 방지) ==')
orig_call, orig_cfg = nas_dsm._call, nas_dsm._cfg_or_raise
state = {'n': 0}


def _no_total(cfg, api, method, version, params=None, **kw):
    state['n'] += 1
    off = int((params or {}).get('offset') or 0)
    lim = int((params or {}).get('limit') or 1000)
    end = min(off + lim, 1500)
    files = [{'name': 'g%d.txt' % i, 'isdir': False, 'additional': {}} for i in range(off, end)]
    return {'files': files}            # total 없음


nas_dsm._call = _no_total
nas_dsm._cfg_or_raise = lambda: {'host': 'x'}
try:
    r = nas_dsm.list_folder('/x')
finally:
    nas_dsm._call, nas_dsm._cfg_or_raise = orig_call, orig_cfg
check('total 이 없어도 끝까지 받고 멈춘다', r['count'] == 1500, str(r['count']))
check('왕복 2번', state['n'] == 2, str(state['n']))

print('\n== 빈 폴더 ==')
r, calls = run(0)
check('0개 — 왕복 1번', r['count'] == 0 and len(calls) == 1)

print('\n== 값이 그대로 실려 오는지(페이징이 내용을 망치지 않는다) ==')
r, _ = run(1500)
it = r['items'][1200]
check('size 가 산다', it['size'] == 1200, str(it['size']))
check('mtime 이 산다', it['mtime'] == 1700000000 + 1200, str(it['mtime']))
check('perm 을 안 버린다', 'perm' in it)

print('\n%s %d/%d 통과' % ('OK' if BAD == 0 else 'FAIL', OK, OK + BAD))
sys.exit(0 if BAD == 0 else 1)
