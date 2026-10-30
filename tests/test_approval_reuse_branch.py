"""reuse_screen 분기만 확인한다. 가짜는 **경계(CDP↔브라우저)에만** 두고
approval_draft 안쪽은 진짜 코드로 돈다. 실제 브라우저 경로는 별도 확인 필요."""
import json, sys
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import gw_bridge as G

navs, intros, evals = [], [], []
G._gw_page = lambda: {'webSocketDebuggerUrl': 'ws://fake'}
async def _fake_nav(ws, url):
    navs.append(url)
G._navigate = _fake_nav
G.dismiss_intro = lambda: intros.append(1)
G.session_info = lambda: {'ok': True}
def fake_eval(expr, timeout=45):
    evals.append(len(expr))
    return {'ok': True, 'step': 'filled', 'dryRun': True,
            'log': [{'field': '제목', 'ok': True}],
            'fieldNames': ['프로젝트 코드', '모델 담당자'], 'url': 'https://gw/new/245/5138'}
G.eval_in_gw = fake_eval
G.time.sleep = lambda s: None

out = {}
r1 = G.approval_draft(5138, 245, '제목', {'프로젝트 코드': 'X'}, dry_run=True, reuse_screen=False)
out['처음_열기'] = {'navigate호출': len(navs), 'dismiss_intro': len(intros),
                   'fieldNames': r1.get('fieldNames')}
navs.clear(); intros.clear()
r2 = G.approval_draft(5138, 245, '제목', {'프로젝트 코드': 'X'}, dry_run=True, reuse_screen=True)
out['재사용'] = {'navigate호출': len(navs), 'dismiss_intro': len(intros),
                'fieldNames': r2.get('fieldNames')}
out['판정'] = ('PASS — 재사용 시 이동 안 함'
               if out['처음_열기']['navigate호출'] == 1 and out['재사용']['navigate호출'] == 0
               else 'FAIL')
# bodyHtml 을 안 주면 _DRAFT_JS 가 본문을 안 건드리는지(cfg 에 빈 문자열로 가는지) 확인
import re
cfg = None
def cap_eval(expr, timeout=45):
    global cfg
    m = re.search(r'\)\((\{.*\})\)\s*$', expr, re.S)
    cfg = json.loads(m.group(1)) if m else None
    return {'ok': True, 'step': 'filled', 'log': [], 'fieldNames': []}
G.eval_in_gw = cap_eval
G.approval_draft(5138, 245, '제목', {}, dry_run=True, reuse_screen=True)
out['bodyHtml_생략시'] = {'cfg_bodyHtml': (cfg or {}).get('bodyHtml'),
                          '본문_건드리나': bool((cfg or {}).get('bodyHtml'))}
print(json.dumps(out, ensure_ascii=False, indent=1))
sys.exit(0 if out['판정'].startswith('PASS') else 1)
