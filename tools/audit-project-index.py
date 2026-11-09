# -*- coding: utf-8 -*-
"""🔎 색인 전수 감사 — "왜 이 프로젝트가 목록에서 미지정인가" (읽기만, 2026-11-09)

    py -3 -I tools/audit-project-index.py [팀이름]      # 기본 개발3팀

`App_Config/project_index.json` · `App_Config/nas_id_map.json` · 팀 폴더의 실제 파일을
**세 열쇠(id · 경로 · 이름)** 로 교차 대조한다. 어댑터(js/57 `attachAppProps`)가 꼬리표를
찾는 순서와 **같은 순서**라, 여기서 "맞물린 열쇠 없음"으로 나오는 프로젝트가 화면에서
담당자·팀·색이 빈 **미지정**으로 보이는 그 프로젝트다.

언제 쓰나
  · 목록에서 담당자/팀/색이 비어 보일 때 (오류가 안 나므로 이 대조가 유일한 단서다)
  · 이름을 바꿔 저장한 뒤 — 그 칸이 파일 이름의 재료라 승자 id 가 뒤바뀐다
  · 색인을 손으로 고친 뒤 (쓰기 스크립트 전후로 한 번씩)

함께 보기
  · `tools/restore-project-index.py`  — 색인이 통째로 비었을 때
  · `tools/backfill-index-meta.py`    — 항목은 있는데 칸이 빈 때
  · CLAUDE.md `docs/nas-dsm.md` 색인의 2026-11-09 항목들
"""
import base64, collections, io, json, random, sys, urllib.parse, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
B = 'http://127.0.0.1:5000'
TEAM = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else '개발3팀'
IDX = 'App_Config/project_index.json'
MAP = 'App_Config/nas_id_map.json'


def _get(url, timeout=180):
    return urllib.request.urlopen(url + ('&' if '?' in url else '?') + '_cb=' + str(random.random()),
                                  timeout=timeout).read()


def get_json(rel):
    return json.loads(_get(B + '/nas/app/get?rel=' + urllib.parse.quote(rel)).decode('utf-8'))


def lst(rel):
    return json.loads(_get(B + '/nas/app/list?rel=' + urllib.parse.quote(rel), 60)
                      .decode('utf-8')).get('items') or []


def nas_id(rel):
    """어댑터 `idOf` 와 같은 식 — 지도에 없는 파일은 경로에서 id 를 만든다."""
    return 'nas_f_' + base64.b64encode(rel.encode('utf-8')).decode('ascii') \
        .replace('+', '-').replace('/', '_').rstrip('=')


def rel_of(fid, mp):
    """id → 경로. 지도에 있으면 그걸, `nas_f_` 면 풀어서. 모르면 ''."""
    if fid in mp and mp[fid]:
        return str(mp[fid])
    if str(fid).startswith('nas_f_'):
        s = str(fid)[6:]
        try:
            return base64.b64decode(s.replace('-', '+').replace('_', '/') + '=' * (-len(s) % 4)).decode('utf-8')
        except Exception:
            return ''
    return ''


try:
    mp = get_json(MAP).get('map') or {}
    idx = get_json(IDX)
except Exception as e:
    print('⛔ 색인/지도를 못 읽었다 — 백엔드가 떠 있고 NAS 에 로그인돼 있는지 보라: %s' % e)
    sys.exit(2)

ps = idx.get('projects') or []
if not isinstance(idx.get('projects'), list):
    print('⛔ project_index.json 모양이 아니다 — 쓰기 전에 손대지 말 것.'); sys.exit(2)

# 지도: 경로 → [id...]. 마지막이 이긴다(어댑터 `adoptIdMap`/`remapIdPath` 와 같은 규칙).
rel2ids = collections.OrderedDict()
for k, v in mp.items():
    if v:
        rel2ids.setdefault(str(v), []).append(k)

files = [i for i in lst(TEAM) if not i.get('isdir') and str(i.get('name')).endswith('.json')]
by_id = {p.get('drive_file_id') for p in ps}
by_name = {p.get('file_name') for p in ps if p.get('file_name')}
by_rel = {}
for p in ps:
    r = rel_of(p.get('drive_file_id'), mp)
    if r:
        by_rel.setdefault(r, []).append(p)

print('=== %s — 파일 %d건 / 색인 %d건 / 지도 %d건 ===\n' % (TEAM, len(files), len(ps), len(mp)))
tally = collections.Counter()
bad = []
for f in sorted(files, key=lambda x: str(x['name'])):
    n = str(f['name']); rel = TEAM + '/' + n
    ids = rel2ids.get(rel) or []
    winner = ids[-1] if ids else nas_id(rel)
    hid, hrel, hnm = winner in by_id, rel in by_rel, n in by_name
    tally[('id' if hid else '') + ('/rel' if hrel else '') + ('/nm' if hnm else '') or 'NONE'] += 1
    ent = (([p for p in ps if p.get('drive_file_id') == winner] or [])
           + (by_rel.get(rel) or [])
           + ([p for p in ps if p.get('file_name') == n] or []) + [None])[0]
    if not ent:
        bad.append((n, rel, winner))
    print('%-46s ids=%d  id%s rel%s nm%s  %s' % (
        n[:46], len(ids), '✅' if hid else '❌', '✅' if hrel else '❌', '✅' if hnm else '❌',
        ('%s / %s / %s' % (ent.get('assignee') or '(담당자없음)', ent.get('team') or '(팀없음)',
                           ent.get('themeColor') or '(색없음)')) if ent else '⛔ 색인에 없음 → 화면에서 미지정'))

print('\n=== 맞물린 열쇠 ===')
for k, v in tally.most_common():
    print('   %-16s %d건' % (k, v))

print('\n=== 색인 항목이 실제 파일로 풀리는가 ===')
live = {TEAM + '/' + str(f['name']) for f in files}
ghosts = []
for p in ps:
    fid = str(p.get('drive_file_id')); r = rel_of(fid, mp)
    if not r:
        state = '지도에 없음(다른 팀이거나 옛 id)'
    elif r in live:
        state = '실제 파일 ✅'
    elif r.split('/')[0] != TEAM:
        state = '다른 팀 (%s)' % r.split('/')[0]
    else:
        state = '없는 경로 ❌ ' + r; ghosts.append((fid, p.get('file_name'), r))
    print('   %-34s %-44s %s' % (fid[:34], str(p.get('file_name'))[:44], state))

dups = {r: ids for r, ids in rel2ids.items() if len(ids) > 1 and r.split('/')[0] == TEAM}
if dups:
    print('\n=== ⚠️ 한 경로에 id 가 여럿 (승자가 뒤바뀔 수 있는 자리) ===')
    for r, ids in dups.items():
        print('   %s' % r)
        for i in ids:
            print('       %s%s' % (i, '  ← 승자' if i == ids[-1] else ''))

print('\n' + '─' * 70)
if bad:
    print('❌ 색인에 없는 프로젝트 %d건 — 화면에서 미지정으로 보인다:' % len(bad))
    for n, r, w in bad:
        print('   %-46s 승자 id %s' % (n[:46], w))
    print('   → 그 프로젝트를 앱에서 한 번 저장하면 항목이 다시 생긴다(내용이 바뀌어야 한다).')
    print('     옛 백업에서 되살리면 keywords·topicKeywords 까지 그대로 온다.')
else:
    print('✅ 파일 %d건 전부 색인과 맞물린다 — 미지정 0건' % len(files))
if ghosts:
    print('⚠️ 가리키는 파일이 없는 항목 %d건(지우기 전에 전수로 세어 볼 것 — 쓰이는 id 일 수 있다)' % len(ghosts))
sys.exit(1 if bad else 0)
