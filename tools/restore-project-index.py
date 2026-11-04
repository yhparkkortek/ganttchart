# -*- coding: utf-8 -*-
"""🚑 NAS 의 `App_Config/project_index.json` 에서 **projects 목록이 비었을 때** 되살린다.

왜 필요했나 (2026-11-04): NAS 의 인덱스가 `projects: []` 가 된 채로 `unmatchedClusters` 746건만
남아 있었다. 이 파일은 메일 자동배분의 색인이고, 담당자·팀·완료·테마색(= Drive 의 appProperties
대용, js/57)이 전부 여기서 나온다. 비면 **오류 없이** 분류가 풀리고 자동배분이 빗나간다.

이 도구는 **드라이브 사본에서 projects 만** 가져와 NAS 사본에 되돌린다.
  · 드라이브는 **읽기만** 한다(백엔드 서비스계정, 읽기 전용).
  · NAS 의 `unmatchedClusters` 는 **그대로 둔다**(그쪽이 최신이다).
  · 쓰기 전에 현재 NAS 사본을 `App_Config/project_index.before-restore-<시각>.json` 로 남긴다.
  · `--apply` 를 주지 않으면 **아무것도 쓰지 않고** 비교만 보여준다.

    py -3 tools/restore-project-index.py            # 비교만
    py -3 tools/restore-project-index.py --apply    # 실제로 되돌리기
"""
import json
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

REL = 'App_Config/project_index.json'
APPLY = '--apply' in sys.argv

import nas_dsm as nd          # noqa: E402
import kortek_backend as bk   # noqa: E402


def die(msg):
    print('⛔ ' + msg)
    sys.exit(1)


r = nd.login_once()
if not r.get('ok'):
    die('NAS 로그인 실패: %s' % r.get('message'))

nas_path = nd.roots()[0] + '/' + REL
cur_raw = nd.download(nas_path)
cur = json.loads(cur_raw.decode('utf-8'))
cur_projects = cur.get('projects') or []
print('NAS   : projects %d · clusters %d · %d bytes'
      % (len(cur_projects), len(cur.get('unmatchedClusters') or []), len(cur_raw)))

# 드라이브 사본 — **읽기만** 한다
fid = bk._drive_get_app_config_folder_id()
if not fid:
    die('드라이브 App_Config 폴더를 찾지 못했습니다(서비스계정 권한 확인).')
child = bk._drive_find_child(fid, 'project_index.json')
child_id = child if isinstance(child, str) else (child or {}).get('id')
if not child_id:
    die('드라이브에 project_index.json 이 없습니다.')
drv = bk._drive_read_json_file(child_id) or {}
drv_projects = drv.get('projects') or []
print('Drive : projects %d · clusters %d'
      % (len(drv_projects), len(drv.get('unmatchedClusters') or [])))

if len(cur_projects) >= len(drv_projects):
    print('\n✅ NAS 쪽이 더 많거나 같습니다 — 되돌릴 이유가 없습니다. 아무것도 하지 않습니다.')
    sys.exit(0)
if not drv_projects:
    die('드라이브 사본도 비어 있습니다 — 여기서 되살릴 수 없습니다.')

named = sum(1 for p in drv_projects if p.get('assignee'))
print('\n되돌릴 내용: projects %d건(담당자 있는 것 %d건) · clusters 는 NAS 것 유지'
      % (len(drv_projects), named))
for p in drv_projects[:5]:
    print('   · %s / %s / %s' % (p.get('drive_file_id'), p.get('assignee') or '-', p.get('team') or '-'))
if len(drv_projects) > 5:
    print('   · … 외 %d건' % (len(drv_projects) - 5))

if not APPLY:
    print('\n[비교만] 실제로 되돌리려면 --apply 를 붙여 다시 실행하세요.')
    sys.exit(0)

# ① 지금 것을 먼저 남긴다 — 되돌리기가 또 틀릴 수 있다
stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
bak_rel = 'App_Config/project_index.before-restore-%s.json' % stamp
nd.put(nd.roots()[0] + '/' + bak_rel, cur_raw)
print('\n백업: %s (%d bytes)' % (bak_rel, len(cur_raw)))

# ② projects 만 바꿔 쓴다
merged = dict(cur)
merged['projects'] = drv_projects
body = json.dumps(merged, ensure_ascii=False).encode('utf-8')
nd.put(nas_path, body)

# ③ 쓴 걸 **다시 읽어** 확인한다(반환값은 증거가 아니다 — docs/nas-dsm.md)
back = json.loads(nd.download(nas_path).decode('utf-8'))
ok = len(back.get('projects') or []) == len(drv_projects) \
    and len(back.get('unmatchedClusters') or []) == len(cur.get('unmatchedClusters') or [])
print('확인: projects %d · clusters %d → %s'
      % (len(back.get('projects') or []), len(back.get('unmatchedClusters') or []),
         'OK' if ok else '불일치!'))
sys.exit(0 if ok else 1)
