# -*- coding: utf-8 -*-
"""🎨 프로젝트 색인에 **테마색**을 채워 넣는다. (2026-11-04)

왜 — NAS 엔 Drive 의 `appProperties` 가 없어서, 목록의 담당자·팀·완료·**테마색**을
`App_Config/project_index.json` 에서 만들어 붙인다(js/57). 그런데 `themeColor` 는
2026-11-04 에야 색인 항목에 들어가기 시작해서, **그 전에 마지막으로 저장된 프로젝트**는
색인에 색이 없다 → 목록이 전부 같은 색으로 보인다(오류는 안 난다).

색은 **프로젝트 파일 안에 멀쩡히 있다**(`tabData.themeColor`). 그걸 읽어 색인에 옮긴다.
사람이 12개를 하나씩 열어 저장하지 않아도 되게.

  · 색인에 **이미 색이 있는 항목은 건드리지 않는다**(사람이 바꾼 값이 이긴다).
  · 쓰기 전에 `App_Config/project_index.before-themecolor-<시각>.json` 로 남긴다.
  · 쓴 뒤 다시 읽어 확인한다(반환값은 증거가 아니다 — docs/nas-dsm.md).
  · `--apply` 없이는 **아무것도 쓰지 않는다**.

    py -3 tools/backfill-theme-colors.py            # 무엇이 채워질지 보기만
    py -3 tools/backfill-theme-colors.py --apply    # 실제로 채우기
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

todo = []
for p in projects:
    if (p.get('themeColor') or '').strip():
        continue                      # 이미 있다 — 건드리지 않는다
    rel = id2path.get(p.get('drive_file_id') or '')
    if not rel:
        rel = by_name.get(p.get('file_name') or '')
    if not rel:
        print('  ? %s — 파일을 못 찾았습니다' % (p.get('file_name') or p.get('drive_file_id')))
        continue
    todo.append((p, rel))

if not todo:
    print('\n✅ 채울 것이 없습니다(전부 색이 있거나 파일을 못 찾았습니다).')
    sys.exit(0)

print('\n파일에서 색을 읽습니다 — %d개 (파일이 커서 잠시 걸립니다)' % len(todo))
filled = 0
for p, rel in todo:
    try:
        d = json.loads(nd.download(root + '/' + rel.lstrip('/')).decode('utf-8'))
    except Exception as e:
        print('  ✗ %s — 읽기 실패: %s' % (rel, e))
        continue
    color = ((d.get('tabData') or {}).get('themeColor') or '').strip()
    if not color:
        print('  · %s — 파일에도 색이 없습니다(기본색)' % (p.get('file_name') or rel))
        continue
    p['themeColor'] = color
    filled += 1
    print('  ✓ %-46s %s' % ((p.get('file_name') or rel)[:46], color))

print('\n채울 색: %d건' % filled)
if not filled:
    sys.exit(0)
if not APPLY:
    print('[비교만] 실제로 채우려면 --apply 를 붙여 다시 실행하세요.')
    sys.exit(0)

stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
bak = 'App_Config/project_index.before-themecolor-%s.json' % stamp
nd.put(root + '/' + bak, idx_raw)
print('백업: %s' % bak)

nd.put(root + '/' + REL, json.dumps(idx, ensure_ascii=False).encode('utf-8'))
back = json.loads(nd.download(root + '/' + REL).decode('utf-8'))
got = sum(1 for p in (back.get('projects') or []) if (p.get('themeColor') or '').strip())
ok = got >= filled and len(back.get('projects') or []) == len(projects)
print('확인: projects %d · 색 있는 항목 %d → %s'
      % (len(back.get('projects') or []), got, 'OK' if ok else '불일치!'))
sys.exit(0 if ok else 1)
