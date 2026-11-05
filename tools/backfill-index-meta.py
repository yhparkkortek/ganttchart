# -*- coding: utf-8 -*-
"""🏷 프로젝트 색인의 **빈 식별 칸**(담당자·팀·모델·고객사·테마색)을 파일에서 채운다. (2026-11-05)

왜 — NAS 엔 Drive 의 `appProperties` 가 없어서, 목록의 담당자·팀·완료·테마색을
`App_Config/project_index.json` 에서 만들어 붙인다(js/57). 그래서 색인 항목이 비면
그 프로젝트는 목록에서 **담당자 미지정 · 팀 없음 · 기본색**으로 보인다 — 오류는 안 난다.

실제로 2026-11-04 `LNW_STELLAR32_32.0.json` 복구 뒤 그 항목의 다섯 칸이 전부 빈 채로
남아 있었다(파일에는 멀쩡히 다 있었다). 사람이 프로젝트를 열어 한 번 저장하면 앱이
스스로 채우지만, **3.87MB 짜리 방금 복구한 파일을 그 목적만으로 다시 쓰고 싶지는 않다**
— 색인은 프로젝트 파일에서 언제든 다시 만들 수 있는 **파생 데이터**라 이쪽만 고치는 게
사고 반경이 훨씬 작다.

`tools/backfill-theme-colors.py` 의 테마색 전용판을 다섯 칸으로 넓힌 것이다.

⚠️ 값 계산은 **앱의 `buildProjectIndexEntry`(js/04c)와 같은 식**이어야 한다 —
   여기서 제 맘대로 고르면 사람이 다음에 저장하는 순간 값이 바뀌어 버린다.
     model      = projectMeta.모델명 or projectMeta.고객모델명
     customer   = projectMeta.고객사
     assignee   = projectMeta.프로젝트담당자
     team       = projectMeta.팀 or projectMeta.개발팀
     themeColor = tabData.themeColor

  · **이미 값이 있는 칸은 건드리지 않는다**(사람이 바꾼 값이 이긴다).
  · `updated_at` 도 **안 건드린다** — 저장 시각이 아니라 색인 수선이므로.
  · 쓰기 전에 `App_Config/project_index.before-indexmeta-<시각>.json` 으로 남긴다.
  · 쓴 뒤 다시 읽어 확인한다(반환값은 증거가 아니다 — docs/nas-dsm.md).
  · `--apply` 없이는 **아무것도 쓰지 않는다**.

    py -3 tools/backfill-index-meta.py            # 무엇이 채워질지 보기만
    py -3 tools/backfill-index-meta.py --apply    # 실제로 채우기
"""
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import nas_dsm as nd   # noqa: E402

REL = 'App_Config/project_index.json'
IDMAP_REL = 'App_Config/nas_id_map.json'
APPLY = '--apply' in sys.argv

# 색인 칸 → 프로젝트 파일에서 읽는 법. js/04c buildProjectIndexEntry 와 같아야 한다.
FIELDS = [
    ('assignee',   lambda pm, td: pm.get('프로젝트담당자') or ''),
    ('team',       lambda pm, td: pm.get('팀') or pm.get('개발팀') or ''),
    ('model',      lambda pm, td: pm.get('모델명') or pm.get('고객모델명') or ''),
    ('customer',   lambda pm, td: pm.get('고객사') or ''),
    ('themeColor', lambda pm, td: td.get('themeColor') or ''),
]


def die(msg):
    print('⛔ ' + msg)
    sys.exit(1)


r = nd.login_once()
if not r.get('ok'):
    die('NAS 로그인 실패: %s' % r.get('message'))

root = nd.roots()[0]
idx_raw = nd.download(root + '/' + REL)
idx = json.loads(idx_raw.decode('utf-8'))
projects = idx.get('projects') or []
if not projects:
    die('색인에 projects 가 없습니다 — 먼저 tools/restore-project-index.py 로 되살리세요.')

# 옛 Drive id → 경로 지도(있으면 그걸로 정확히 찾는다)
id2path = {}
try:
    m = json.loads(nd.download(root + '/' + IDMAP_REL).decode('utf-8'))
    src = m.get('ids') or m.get('map') or m
    if isinstance(src, dict):
        for k, v in src.items():
            if isinstance(v, str):
                id2path[k] = v
            elif isinstance(v, dict) and v.get('path'):
                id2path[k] = v['path']
except Exception as e:
    print('(id 지도를 못 읽었습니다 — 파일 이름으로 찾습니다: %s)' % e)

# 앱 루트 아래 .json 을 전부 모아 이름으로도 찾을 수 있게 한다
NON_PROJECT = {'Backups', 'App_Config', 'MailBodies', '개발자료실',
               'TaskInbox_Backups', 'Python_files', 'Reference', 'address'}
by_name = {}
stack = ['']
while stack:
    rel = stack.pop()
    try:
        items = nd.list_folder(root + ('/' + rel if rel else ''), limit=500)['items']
    except Exception:
        continue
    for it in items:
        name = it['name']
        child = (rel + '/' + name) if rel else name
        if it['isdir']:
            if name not in NON_PROJECT and rel == '':
                stack.append(child)
        elif name.endswith('.json'):
            by_name.setdefault(name, child)

print('색인 projects %d건 · NAS 프로젝트 파일 %d개' % (len(projects), len(by_name)))

# 빈 칸이 하나라도 있는 항목만 후보
todo = []
for p in projects:
    missing = [f for f, _ in FIELDS if not str(p.get(f) or '').strip()]
    if not missing:
        continue
    rel = id2path.get(p.get('drive_file_id') or '')
    if not rel:
        rel = by_name.get(p.get('file_name') or '')
    if not rel:
        print('  ? %s — 파일을 못 찾았습니다' % (p.get('file_name') or p.get('drive_file_id')))
        continue
    todo.append((p, rel, missing))

if not todo:
    print('\n✅ 채울 것이 없습니다 — 모든 항목의 다섯 칸이 차 있습니다.')
    sys.exit(0)

print('\n파일에서 값을 읽습니다 — %d개 (파일이 커서 잠시 걸립니다)' % len(todo))
# ⚠️ 여기서 바로 idx 를 고치지 **않는다**. 프로젝트 파일 내려받기가 10초 넘게 걸리는데,
#    그 사이 앱이 색인을 저장하면(자동저장은 3분마다 read-modify-write 한다) 맨 처음 읽은
#    낡은 사본을 덮어써 **그 저장이 오류 없이 사라진다**(2026-11-04 색인 유실과 같은 모양).
#    → 값만 모아 두고, 쓰기 직전에 색인을 **다시 읽어** 그 위에 얹는다.
plan = {}          # drive_file_id → {field: value}
for p, rel, missing in todo:
    try:
        d = json.loads(nd.download(root + '/' + rel.lstrip('/')).decode('utf-8'))
    except Exception as e:
        print('  ✗ %s — 읽기 실패: %s' % (rel, e))
        continue
    pm = d.get('projectMeta') or {}
    td = d.get('tabData') or {}
    got = {}
    for field, pick in FIELDS:
        if str(p.get(field) or '').strip():
            continue                   # 이미 있다 — 건드리지 않는다
        val = str(pick(pm, td) or '').strip()
        if not val:
            continue                   # 파일에도 없다 — 지어내지 않는다
        got[field] = val
    if got:
        plan[p.get('drive_file_id') or ''] = got
        print('  ✓ %s' % (p.get('file_name') or rel))
        for f, v in got.items():
            print('      %s=%s' % (f, v))
    else:
        print('  · %s — 파일에도 값이 없습니다(그대로 둡니다)' % (p.get('file_name') or rel))

planned_cells = sum(len(v) for v in plan.values())
print('\n채울 칸: %d개 (항목 %d건)' % (planned_cells, len(plan)))
if not planned_cells:
    sys.exit(0)
if not APPLY:
    print('[비교만] 실제로 채우려면 --apply 를 붙여 다시 실행하세요.')
    sys.exit(0)

# ── 쓰기 직전에 색인을 다시 읽는다 ─────────────────────────────────────────
fresh_raw = nd.download(root + '/' + REL)
fresh = json.loads(fresh_raw.decode('utf-8'))
fresh_projects = fresh.get('projects') or []
if not fresh_projects:
    die('다시 읽은 색인이 비어 있습니다 — 쓰지 않고 멈춥니다.')
if len(fresh_projects) != len(projects):
    print('⚠️ 그 사이 색인이 바뀌었습니다(%d건 → %d건) — 바뀐 쪽을 기준으로 얹습니다.'
          % (len(projects), len(fresh_projects)))

applied = 0
for p in fresh_projects:
    want = plan.get(p.get('drive_file_id') or '')
    if not want:
        continue
    for field, val in want.items():
        if str(p.get(field) or '').strip():
            continue                   # 그 사이 누가 채웠다 — 그 값이 이긴다
        p[field] = val
        applied += 1

if not applied:
    print('✅ 그 사이 다른 저장이 이미 채웠습니다 — 쓸 것이 없습니다.')
    sys.exit(0)

stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
bak = 'App_Config/project_index.before-indexmeta-%s.json' % stamp
nd.put(root + '/' + bak, fresh_raw)
print('백업: %s (방금 읽은 그 사본)' % bak)

nd.put(root + '/' + REL, json.dumps(fresh, ensure_ascii=False).encode('utf-8'))

# 쓴 뒤 **다시 읽어** 확인한다 — 반환값은 증거가 아니다.
back = json.loads(nd.download(root + '/' + REL).decode('utf-8'))
back_projects = back.get('projects') or []
blank_of = lambda ps: sum(1 for p in ps for f, _ in FIELDS if not str(p.get(f) or '').strip())
before_blank = blank_of(fresh_projects) + applied     # 얹기 전 상태
still_blank = blank_of(back_projects)
ok = (len(back_projects) == len(fresh_projects)) and (still_blank == before_blank - applied)
print('확인: projects %d(쓰기 직전 %d) · 빈 칸 %d → %d · %s'
      % (len(back_projects), len(fresh_projects), before_blank, still_blank,
         'OK' if ok else '불일치!'))
sys.exit(0 if ok else 1)
