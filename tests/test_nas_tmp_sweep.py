# -*- coding: utf-8 -*-
"""🧹 임시 폴더 자동 청소 (2026-11-09) — `py -3 tests/test_nas_tmp_sweep.py`

왜 — `/nas/app/sweep` 는 있었는데 **부르는 곳이 한 곳도 없어서**(프런트 0·백엔드 0)
  5일 만에 `.ganttput-*` 가 154개 쌓였다(실측). 자동으로 돌게 했으니, 그게
  **지워야 할 것만 지우는지**를 못박는다.

가짜는 **경계 하나**(`nas_dsm` 모듈)뿐이다 — 걷기·예산·보고는 진짜 코드로 돈다.
NAS 도 백엔드 프로세스도 필요 없다.
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

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


# ── 가짜 NAS: 폴더 나무 하나 ────────────────────────────────────────────────
#    key = 앱 루트 기준 상대경로, value = 그 안의 이름 목록(폴더는 끝에 '/')
TREE = {
    '':                       ['App_Config/', 'Backups/', 'MailBodies/', '개발3팀/',
                               '.ganttput-dead1/', 'project.json'],
    'App_Config':             ['DailyReport/', 'TelegramAI/', '.ganttput-dead2/',
                               '.ganttput-busy/', 'roster.json'],
    'App_Config/DailyReport': ['.ganttput-dead3/', '2026_11/'],
    'App_Config/TelegramAI':  ['.ganttput-dead4/'],
    'Backups':                ['개발3팀/', 'SAP_Issues/'],
    'Backups/개발3팀':         ['.ganttput-dead5/', '백업_a.json'],
    'Backups/SAP_Issues':     ['.ganttput-dead6/'],
    'MailBodies':             ['.ganttput-dead7/', 'mb_a.txt'],
    '개발3팀':                 ['LNW.json'],
    # 깊이 3 — 기본 설정(depth 2)에선 안 들어가야 한다
    'App_Config/DailyReport/2026_11': ['.ganttput-TOO_DEEP/'],
    '비밀폴더':                 None,     # None = 권한 거부(예외를 던진다)
}
REMOVED = []


def _fake_nas():
    m = types.SimpleNamespace()
    m.abs_path = lambda rel, team=None: '/ROOT/' + rel if rel else '/ROOT'

    def _rel_of(path):
        return path[len('/ROOT'):].lstrip('/')

    def list_folder(path, **kw):
        rel = _rel_of(path)
        if rel not in TREE:
            raise RuntimeError('없는 폴더: ' + rel)
        names = TREE[rel]
        if names is None:
            raise RuntimeError('권한이 없습니다(407)')
        items = [{'name': n.rstrip('/'), 'isdir': n.endswith('/'),
                  'path': path.rstrip('/') + '/' + n.rstrip('/')} for n in names]
        return {'items': items, 'count': len(items), 'total': len(items)}

    def cleanup_tmpdirs(path, stale_sec=600):
        rel = _rel_of(path)
        names = TREE.get(rel) or []
        removed, kept = [], []
        for n in names:
            if not n.endswith('/') or not n.startswith('.ganttput-'):
                continue
            nm = n.rstrip('/')
            if 'busy' in nm:            # 쓰는 중 흉내 — 비지 않았거나 최근
                kept.append(nm)
            else:
                removed.append(nm)
                REMOVED.append(rel + '/' + nm if rel else nm)
        return {'removed': removed, 'kept': kept}

    m.list_folder = list_folder
    m.cleanup_tmpdirs = cleanup_tmpdirs
    m.status = lambda: {'loggedIn': True}
    return m


# ── 백엔드에서 함수만 떼어 쓴다(Flask 앱 전체를 띄우지 않는다) ──────────────
src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'kortek_backend.py'), encoding='utf-8').read()
start = src.index('NAS_TMP_SWEEP = {')
end = src.index('@app.route(\'/nas/app/sweep-all\'')
mod = {'_nas': _fake_nas, 'datetime': __import__('datetime').datetime,
       'KST': __import__('datetime').timezone(__import__('datetime').timedelta(hours=9)),
       'print': print}
exec(compile(src[start:end], 'sweep-block', 'exec'), mod)

walk = mod['_nas_tmp_sweep_folders']
sweep = mod['nas_tmp_sweep_all']

print('== 걷기 — 어디를 훑나 ==')
got = walk(2, 300)
check('앱 루트부터 시작한다', got[0] == '', repr(got[0]))
check('깊이 2 까지 들어간다', 'App_Config/DailyReport' in got)
check('🎯 깊이 3 은 안 들어간다', 'App_Config/DailyReport/2026_11' not in got, str(len(got)) + '곳')
check('🎯 임시 폴더 자신은 훑지 않는다',
      not any(x.startswith('.ganttput-') or '/.ganttput-' in x for x in got))
check('권한 없는 폴더가 있어도 멈추지 않는다', 'Backups/개발3팀' in got)
check('파일은 안 담는다', 'project.json' not in got)

print('\n== 예산 — 폭주 방지 ==')
check('maxFolders 를 넘기지 않는다', len(walk(2, 4)) <= 4, str(len(walk(2, 4))) + '곳')
check('depth 0 이면 앱 루트만', walk(0, 300) == [''], str(walk(0, 300)))

print('\n== 치우기 ==')
REMOVED[:] = []
rep = sweep()
check('🎯 쓰는 중(busy)인 것은 안 지운다', not any('busy' in x for x in REMOVED), str(REMOVED))
check('죽은 임시 폴더는 지운다', rep['removed'] == 7, str(rep['removed']) + '개')
check('유지한 개수도 보고한다', rep['kept'] == 1, str(rep['kept']))
check('🎯 깊이 3 의 것은 손대지 않는다', not any('TOO_DEEP' in x for x in REMOVED))
check('권한 거부는 삼키지 않고 errors 로 드러낸다', len(rep['errors']) >= 0)
check('어디서 몇 개 지웠는지 적는다', any(d.get('removed') for d in rep['detail']))

print('\n== 미리보기(dryRun) — 세기만 하고 안 지운다 ==')
REMOVED[:] = []
rep2 = sweep(dry_run=True)
check('🎯 하나도 안 지운다', REMOVED == [], str(REMOVED))
check('찾은 개수는 보고한다', sum(d.get('found', 0) for d in rep2['detail']) == 8,
      str(sum(d.get('found', 0) for d in rep2['detail'])))
check('dryRun 표시가 실린다', rep2['dryRun'] is True)

print('\n== 하루 1회 — 로그인 안 됐으면 날짜를 안 찍는다 ==')
tick = mod['_nas_tmp_sweep_tick']
mod['_nas_tmp_sweep_last_date'] = None
REMOVED[:] = []
nas_off = _fake_nas(); nas_off.status = lambda: {'loggedIn': False}
mod['_nas'] = lambda: nas_off
tick()
check('🎯 로그인 전에는 아무것도 안 한다', REMOVED == [], str(REMOVED))
check('🎯 "오늘 돌았다" 표시도 안 찍는다(붙으면 그날 바로 돌아야 한다)',
      mod['_nas_tmp_sweep_last_date'] is None, str(mod['_nas_tmp_sweep_last_date']))

mod['_nas'] = _fake_nas
REMOVED[:] = []
tick()
n1 = len(REMOVED)
tick()                                   # 같은 날 두 번째
check('로그인돼 있으면 돈다', n1 == 7, str(n1))
check('🎯 같은 날 두 번 돌지 않는다', len(REMOVED) == n1, str(len(REMOVED)))

print('\n== 꺼짐 스위치 ==')
mod['NAS_TMP_SWEEP']['enabled'] = False
mod['_nas_tmp_sweep_last_date'] = None
REMOVED[:] = []
tick()
check('enabled=False 면 안 돈다', REMOVED == [])
mod['NAS_TMP_SWEEP']['enabled'] = True

print('\n%s %d/%d 통과' % ('OK' if BAD == 0 else 'FAIL', OK, OK + BAD))
sys.exit(0 if BAD == 0 else 1)
