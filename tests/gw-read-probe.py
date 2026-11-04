# -*- coding: utf-8 -*-
"""🏢 그룹웨어 **조회(읽기)** 기능 전수 점검 — 읽기만 한다.

왜: 그룹웨어 조회는 도구가 27개인데, 어느 것이 실제로 도는지 한 번에 본 적이 없다.
    "0건"과 "고장"은 화면에서 구분이 안 돼서(둘 다 아무것도 안 보인다) 더 그렇다.

⚠️ 지키는 것
  · **로그인을 시도하지 않는다.** 이미 로그인된 세션만 쓴다 —
    실패가 쌓이면 사내 계정이 잠긴다(CLAUDE.md).
  · **쓰기 엔드포인트는 건드리지 않는다**(mail/send, board/write, asset/reserve, approval/draft …).
  · 목록을 먼저 받아 **거기서 나온 진짜 id** 로만 상세를 연다(id 를 지어내지 않는다).
  · 결과는 **건수와 모양만** 찍는다 — 사내 내용(이름·제목·본문)은 출력하지 않는다.
    이 저장소는 공개돼 있다.

쓰는 법:  python tests/gw-read-probe.py
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

BACKEND = 'http://127.0.0.1:5000'
TIMEOUT = 60


def call(path, params=None):
    url = BACKEND + path
    if params:
        url += ('&' if '?' in path else '?') + urllib.parse.urlencode(params)
    t0 = time.time()
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
            body = r.read().decode('utf-8', 'replace')
        ms = int((time.time() - t0) * 1000)
        try:
            return json.loads(body), ms, None
        except Exception:
            return None, ms, 'JSON 아님: ' + body[:70]
    except urllib.error.HTTPError as e:
        return None, int((time.time() - t0) * 1000), 'HTTP %s' % e.code
    except Exception as e:
        return None, int((time.time() - t0) * 1000), str(e)[:70]


def count_of(j):
    """응답에서 '몇 건인가'만 뽑는다 — 내용은 보지 않는다."""
    if not isinstance(j, dict):
        return None
    for k in ('items', 'list', 'rows', 'data', 'results', 'posts', 'events',
              'contacts', 'notes', 'notifications', 'docs', 'folders', 'boards',
              'assets', 'reservations', 'mails', 'surveys', 'files', 'apps',
              'reports', 'cards', 'communities', 'documents'):
        v = j.get(k)
        if isinstance(v, list):
            return len(v)
        if isinstance(v, dict):
            return len(v)
    return None


def first_id(j, keys):
    if not isinstance(j, dict):
        return None
    for k in ('items', 'list', 'rows', 'data', 'boards', 'folders', 'assets', 'apps',
              'posts', 'reports', 'cards'):
        v = j.get(k)
        if isinstance(v, list) and v:
            row = v[0]
            if isinstance(row, dict):
                for idk in keys:
                    if row.get(idk) not in (None, ''):
                        return row[idk]
    return None


print('=' * 78)
st, ms, err = call('/gw/status')
if err or not (st or {}).get('ok'):
    print('❌ 그룹웨어에 로그인돼 있지 않다 — 이 점검은 로그인된 세션에서만 돈다.')
    print('   (로그인은 이 스크립트가 하지 않는다. 🔑 설정에서 사람이 한 번 해야 한다)')
    print('   응답: %s / %s' % (err, json.dumps(st, ensure_ascii=False)[:120] if st else ''))
    raise SystemExit(1)
print('✅ 로그인됨 (%dms) — 회사·계정 정보는 공개 저장소라 찍지 않는다.' % ms)
print('=' * 78)

# ── 1단계: 인자 없이 되는 목록형 조회 ─────────────────────────────────────
LISTY = [
    ('gw_mail',             '/gw/mail/recent',        {'days': 7}),
    ('gw_board',            '/gw/board/recent',       {'days': 7}),
    ('gw_board_list',       '/gw/boards',             None),
    ('gw_works_apps',       '/gw/works/apps',         None),
    ('gw_report_folders',   '/gw/report/folders',     None),
    ('gw_report_list',      '/gw/report/list',        None),
    ('gw_todo_boards',      '/gw/todo/boards',        None),
    ('gw_calendar',         '/gw/events',             None),
    ('gw_approval_box',     '/gw/approval/doclist',   None),
    ('gw_docs',             '/gw/docs',               None),
    ('gw_asset_list',       '/gw/assets',             None),
    ('gw_asset_reservations', '/gw/asset/reservations', None),
    ('gw_community_feed',   '/gw/community/feed',     None),
    ('gw_community_list',   '/gw/communities',        None),
    ('gw_surveys',          '/gw/surveys',            None),
    ('gw_webfolder',        '/gw/webfolder',          None),
    ('gw_contacts',         '/gw/contacts',           {'keyword': '김', 'searchType': 'or'}),
    ('gw_notifications',    '/gw/notifications',      None),
    ('gw_notes',            '/gw/notes',              None),
    ('gw_approval_search',  '/gw/approval/search',    {'keyword': '승인'}),
]

results, harvest = [], {}
print('\n[1단계] 목록형 조회 %d개' % len(LISTY))
print('-' * 78)
print('%-24s %8s %7s  %s' % ('도구', '결과', '시간', '비고'))
print('-' * 78)
for name, path, params in LISTY:
    j, ms, err = call(path, params)
    if err:
        state, note = 'ERR', err
    elif isinstance(j, dict) and j.get('ok') is False:
        state, note = 'FAIL', str(j.get('message') or j.get('error') or '')[:48]
    else:
        n = count_of(j)
        state = 'OK'
        note = ('%d건' % n) if n is not None else '(건수 키 없음)'
        harvest[name] = j
    results.append((name, state, ms, note))
    print('%-24s %8s %6dms  %s' % (name, state, ms, note))

# ── 2단계: 1단계에서 나온 진짜 id 로 상세 조회 ────────────────────────────
print('\n[2단계] 상세 조회 — 위에서 나온 id 로만 연다')
print('-' * 78)
#   ⚠️ 인자 이름은 **백엔드가 받는 그대로** 써야 한다 — 처음엔 id/appId 로 보냈다가
#      둘 다 HTTP 400 을 받았다(앱이 아니라 이 스크립트가 틀린 것이었다).
#      게시물은 boardId+postId **두 개**가 필요하고, Works 는 appletId 다.
def row0(src, keys):
    base = harvest.get(src)
    if not isinstance(base, dict):
        return None
    for k in ('items', 'list', 'rows', 'data', 'boards', 'folders', 'assets', 'apps',
              'posts', 'reports', 'cards'):
        v = base.get(k)
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return v[0]
    return None

DETAIL = []
_p = row0('gw_board', ('id',))
if _p and _p.get('boardId') not in (None, '') and _p.get('id') not in (None, ''):
    DETAIL.append(('gw_board_post', '/gw/board/post', {'boardId': _p['boardId'], 'postId': _p['id']}))
else:
    DETAIL.append(('gw_board_post', None, 'gw_board 에 게시물이 없어 건너뜀'))

_r = row0('gw_report_list', ('id',))
DETAIL.append(('gw_report_detail', '/gw/report/detail', {'id': _r['id']}) if _r and _r.get('id')
               else ('gw_report_detail', None, 'gw_report_list 에 항목이 없어 건너뜀'))

_t = row0('gw_todo_boards', ('id',))
DETAIL.append(('gw_todo_items', '/gw/todo/items', {'boardId': _t['id']}) if _t and _t.get('id')
               else ('gw_todo_items', None, 'gw_todo_boards 에 보드가 없어 건너뜀'))

_a = row0('gw_asset_list', ('id',))
DETAIL.append(('gw_asset_items', '/gw/asset/items', {'assetId': _a['id']}) if _a and _a.get('id')
               else ('gw_asset_items', None, 'gw_asset_list 에 자원이 없어 건너뜀'))

_w = row0('gw_works_apps', ('id',))
DETAIL.append(('gw_works_list', '/gw/works/list', {'appletId': _w['id']}) if _w and _w.get('id')
               else ('gw_works_list', None, 'gw_works_apps 에 앱이 없어 건너뜀'))

for name, path, params in DETAIL:
    if path is None:
        results.append((name, 'SKIP', 0, params))
        print('%-24s %8s %6s   %s' % (name, 'SKIP', '-', params))
        continue
    j, ms, err = call(path, params)
    if err:
        state, note = 'ERR', err
    elif isinstance(j, dict) and j.get('ok') is False:
        state, note = 'FAIL', str(j.get('message') or '')[:48]
    else:
        n = count_of(j)
        state = 'OK'
        note = ('%d건' % n) if n is not None else '본문 받음'
    results.append((name, state, ms, note))
    print('%-24s %8s %6dms  %s' % (name, state, ms, note))

# ── 요약 ──────────────────────────────────────────────────────────────────
ok = sum(1 for r in results if r[1] == 'OK')
bad = [r for r in results if r[1] in ('ERR', 'FAIL')]
skip = [r for r in results if r[1] == 'SKIP']
print('\n' + '=' * 78)
print('결과: %d개 성공 / %d개 실패 / %d개 건너뜀 (전체 %d)' % (ok, len(bad), len(skip), len(results)))
if bad:
    print('\n실패:')
    for n, s, ms, note in bad:
        print('   %-22s %-5s %s' % (n, s, note))
print('=' * 78)
sys.exit(1 if bad else 0)
