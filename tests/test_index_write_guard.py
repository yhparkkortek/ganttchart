# -*- coding: utf-8 -*-
"""🛡 /nas/app/put 색인 가드 — "항목은 그 파일이 정말 없을 때만 지울 수 있다" (2026-11-09)

왜 — `project_index.json` 은 전사 공용 파일인데, **옛 js 가 돌고 있는 탭**이 유령 정리로
살아 있는 프로젝트의 항목을 지운다(실측: 16:43:39 에 2건, 되살려도 5분 뒤 또). 항목이
사라져도 **오류가 안 난다** — 목록이 "미지정"이 되고 메일 자동배분 색인이 조용히 줄어든다.
프런트 가드는 그 탭이 비켜 가므로, 모든 PC 가 반드시 지나는 이 라우트에서 막는다.

여기서 못 박는 것
  ① 살아 있는 파일의 항목은 **되살려 넣는다**
  ② 파일이 진짜 없으면 **지워진다**(정상 삭제를 막지 않는다)
  ③ 경로를 못 풀면 **지우도록 둔다**(진짜 유령이 영영 안 지워지면 안 된다)
  ④ ⚡ **속도** — 다른 파일 쓰기엔 NAS 호출이 하나도 안 늘고, 떨어진 항목 0건이면
     색인 읽기 **1회**로 끝난다(id 지도·존재확인은 떨어진 게 있을 때만)
  ⑤ 판단 못 하면 **아무것도 안 한다** — 읽기 실패 한 번이 모든 저장을 멈추면 더 나쁘다

가짜는 **경계에만** — `_nas()` 가 돌려주는 모듈(nas_dsm)만. 라우트의 판정·되살리기·
경로 풀기·응답 조립은 진짜 코드가 돈다. NAS·계정·네트워크 불필요.

    py -3 tests/test_index_write_guard.py
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kortek_backend as bk  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail and not cond else ''))


ROOT = '/SHARE/KORTEK_PM'
IDX = 'App_Config/project_index.json'
MAP = 'App_Config/nas_id_map.json'


def nas_f(rel):
    """어댑터 `idOf` 와 같은 식 — 경로에서 만든 id."""
    return 'nas_f_' + base64.urlsafe_b64encode(rel.encode('utf-8')).decode('ascii').rstrip('=')


def ent(fid, name, who='박용훈'):
    return {'drive_file_id': fid, 'file_name': name, 'assignee': who,
            'team': '개발3팀', 'themeColor': '#2c5f8a', 'keywords': ['k1', 'k2']}


class FakeNas(object):
    """경계 스텁. ⚠️ 호출 **순서**로 분기하지 않는다 — 무엇이 불렸는지만 적는다."""

    def __init__(self, index=None, id_map=None, live=None,
                 fail_download=(), bad_index=False, raise_path_info=False):
        self.calls = []
        self.index = index
        self.id_map = id_map if id_map is not None else {}
        self.live = set(live or [])          # 살아 있는 **상대경로**
        self.fail_download = set(fail_download)
        self.bad_index = bad_index
        self.raise_path_info = raise_path_info
        self.written = None

    # ── 경계 ────────────────────────────────────────────────────────────
    def abs_path(self, rel, team=None):
        rel = (rel or '').strip('/')
        if team:
            rel = team + ('/' + rel if rel else '')
        return ROOT + ('/' + rel if rel else '')

    def download(self, path, timeout=120):
        self.calls.append('download:' + path)
        rel = path[len(ROOT) + 1:]
        if rel in self.fail_download:
            raise RuntimeError('일부러 실패: ' + rel)
        if rel == IDX:
            if self.bad_index:
                return b'<html>not found</html>'
            if self.index is None:
                raise RuntimeError('없음')
            return json.dumps(self.index, ensure_ascii=False).encode('utf-8')
        if rel == MAP:
            return json.dumps({'map': self.id_map}, ensure_ascii=False).encode('utf-8')
        raise RuntimeError('모르는 경로: ' + rel)

    def path_info(self, paths):
        self.calls.append('path_info:%d' % len(paths))
        if self.raise_path_info:
            raise RuntimeError('일부러 실패: path_info')
        out = []
        for p in paths:
            rel = p[len(ROOT) + 1:]
            if rel in self.live:                      # 없는 경로는 **안 돌려준다**(실제 코드가 code 로 걸러낸다)
                out.append({'name': rel.split('/')[-1], 'path': p, 'isdir': False, 'perm': {}})
        return out

    def put(self, path, data, atomic=True):
        self.calls.append('put:' + path)
        self.written = data
        return {'ok': True, 'path': path, 'verified': True}

    # 라우트가 부를 수 있는 나머지
    def roots(self):
        return (ROOT, '')


def run(nas, payload):
    """진짜 라우트를 그대로 지난다."""
    bk._nas = lambda: nas
    cli = bk.app.test_client()
    r = cli.post('/nas/app/put', json=payload)
    body = json.loads(r.data.decode('utf-8'))
    out = None
    if nas.written is not None:
        try:
            out = json.loads(nas.written.decode('utf-8'))
        except Exception:
            out = None
    return r.status_code, body, out


def names_of(doc):
    return sorted(str(p.get('file_name')) for p in ((doc or {}).get('projects') or []))


A, B, C = '1aaaAAA', '1bbbBBB', '1cccCCC'
CUR3 = {'projects': [ent(A, 'STELLAR32.json'), ent(B, 'POLED.json', '박용훈'),
                     ent(C, 'OBSIDIAN.json', '임희철')]}
MAP3 = {A: '개발3팀/STELLAR32.json', B: '개발3팀/POLED.json', C: '개발3팀/OBSIDIAN.json'}
LIVE3 = ['개발3팀/STELLAR32.json', '개발3팀/POLED.json', '개발3팀/OBSIDIAN.json']

print('\n=== 1) 살아 있는 파일의 항목을 지우려 하면 되살린다 (그 사고) ===')
nas = FakeNas(index=CUR3, id_map=MAP3, live=LIVE3)
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
check('200', sc == 200, sc)
check('되살려서 3건이 써진다', len(out['projects']) == 3, names_of(out))
check('POLED 가 돌아왔다', 'POLED.json' in names_of(out))
check('OBSIDIAN 이 돌아왔다', 'OBSIDIAN.json' in names_of(out))
g = body.get('guard') or {}
check('guard.restored == 2', g.get('restored') == 2, g)
check('guard.dropped == 2', g.get('dropped') == 2, g)
check('되살린 이름을 알려준다', sorted(g.get('restoredNames') or []) == ['OBSIDIAN.json', 'POLED.json'], g)
check('새로고침을 안내한다', '새로고침' in str(g.get('note')), g)
# ⚠️ 못 찾아도 **여기서 멈추지 않는다** — 한 검사가 터지면 나머지 절을 못 본다
#    (돌연변이 시험에서 실제로 그랬다).
restored = next((p for p in (out or {}).get('projects') or [] if p.get('file_name') == 'POLED.json'), {})
check('키워드까지 그대로 되살린다', restored.get('keywords') == ['k1', 'k2'], restored)
check('담당자·색도 그대로', restored.get('assignee') == '박용훈' and restored.get('themeColor') == '#2c5f8a')

print('\n=== 2) 파일이 진짜 없으면 지워진다 (정상 삭제를 막지 않는다) ===')
nas = FakeNas(index=CUR3, id_map=MAP3, live=['개발3팀/STELLAR32.json', '개발3팀/OBSIDIAN.json'])
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json'),
                                                                      ent(C, 'OBSIDIAN.json', '임희철')]})})
check('POLED 는 안 돌아온다(파일이 없다)', 'POLED.json' not in names_of(out), names_of(out))
check('2건으로 써진다', len(out['projects']) == 2, names_of(out))
check('guard.restored == 0', (body.get('guard') or {}).get('restored') == 0, body.get('guard'))

print('\n=== 3) 섞여 있으면 살아 있는 것만 되살린다 ===')
nas = FakeNas(index=CUR3, id_map=MAP3, live=['개발3팀/STELLAR32.json', '개발3팀/OBSIDIAN.json'])
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
check('OBSIDIAN 만 돌아온다', names_of(out) == ['OBSIDIAN.json', 'STELLAR32.json'], names_of(out))
check('guard.restored == 1', (body.get('guard') or {}).get('restored') == 1)

print('\n=== 4) ⚡ 속도 — 떨어진 항목 0건이면 색인 읽기 1회로 끝난다 ===')
nas = FakeNas(index=CUR3, id_map=MAP3, live=LIVE3)
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json'),
                                                                      ent(B, 'POLED.json'),
                                                                      ent(C, 'OBSIDIAN.json', '임희철')]})})
dl = [c for c in nas.calls if c.startswith('download:')]
check('색인 읽기는 1회', len(dl) == 1, nas.calls)
check('id 지도는 안 읽는다', not any(MAP in c for c in dl), nas.calls)
check('NAS 존재확인은 안 한다', not any(c.startswith('path_info') for c in nas.calls), nas.calls)
check('guard 안내도 안 붙는다(할 말이 없다)', 'guard' not in body, body)
check('3건 그대로 써진다', len(out['projects']) == 3)

print('\n=== 5) ⚡ 속도 — 색인이 아닌 파일 쓰기엔 NAS 호출이 하나도 안 늘어난다 ===')
nas = FakeNas(index=CUR3, id_map=MAP3, live=LIVE3)
sc, body, out = run(nas, {'rel': '개발3팀/STELLAR32.json', 'text': '{"rows":[]}'})
check('200', sc == 200, sc)
check('put 하나뿐', nas.calls == ['put:' + ROOT + '/개발3팀/STELLAR32.json'], nas.calls)
check('읽기 0회', not any(c.startswith('download:') for c in nas.calls), nas.calls)

print('\n=== 6) team 경로의 같은 이름은 다른 파일이다 — 가드가 안 돈다 ===')
nas = FakeNas(index=CUR3, id_map=MAP3, live=LIVE3)
sc, body, out = run(nas, {'rel': IDX, 'team': '개발1팀', 'text': json.dumps({'projects': []})})
check('읽기 0회', not any(c.startswith('download:') for c in nas.calls), nas.calls)
check('그대로 써진다', out == {'projects': []}, out)

print('\n=== 7) 판단이 안 되면 아무것도 안 한다 ===')
nas = FakeNas(index=None, id_map=MAP3, live=LIVE3)        # 색인이 아직 없다
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
check('색인이 없으면 통과', sc == 200 and len(out['projects']) == 1, (sc, out))
nas = FakeNas(index=CUR3, id_map=MAP3, live=LIVE3, fail_download=[IDX])
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
check('색인 읽기 실패해도 저장을 막지 않는다', sc == 200 and len(out['projects']) == 1, (sc, out))
nas = FakeNas(index=CUR3, id_map=MAP3, live=LIVE3, bad_index=True)
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
check('색인이 HTML 쓰레기여도 통과(DSM 502 지문)', sc == 200 and len(out['projects']) == 1, (sc, out))
nas = FakeNas(index=CUR3, id_map=MAP3, live=LIVE3)
sc, body, out = run(nas, {'rel': IDX, 'text': 'not json at all'})
check('들어온 게 색인 모양이 아니면 통과', sc == 200 and nas.written == b'not json at all', nas.written)
check('그 경우 색인도 안 읽는다', not any(c.startswith('download:') for c in nas.calls), nas.calls)

print('\n=== 8) nas_f_ id 도 경로로 풀린다(지도에 없는 파일) ===')
nf = nas_f('개발3팀/INTRALOT.json')
cur = {'projects': [ent(A, 'STELLAR32.json'), ent(nf, 'INTRALOT.json', '김시윤')]}
nas = FakeNas(index=cur, id_map={A: '개발3팀/STELLAR32.json'},
              live=['개발3팀/STELLAR32.json', '개발3팀/INTRALOT.json'])
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
check('지도에 없어도 되살린다', 'INTRALOT.json' in names_of(out), names_of(out))
check('guard.restored == 1', (body.get('guard') or {}).get('restored') == 1)

print('\n=== 9) 경로를 못 풀면 지우도록 둔다(진짜 유령) ===')
cur = {'projects': [ent(A, 'STELLAR32.json'), ent('1zzzGHOST', '옛프로젝트.json')]}
nas = FakeNas(index=cur, id_map={A: '개발3팀/STELLAR32.json'}, live=['개발3팀/STELLAR32.json'])
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
check('유령은 지워진다', names_of(out) == ['STELLAR32.json'], names_of(out))
g = body.get('guard') or {}
check('확인 못 했다고 드러낸다', '몰라' in str(g.get('note')) or g.get('restored') == 0, g)

print('\n=== 10) 존재확인이 실패하면 지우지도 되살리지도 않는다 ===')
nas = FakeNas(index=CUR3, id_map=MAP3, live=LIVE3, raise_path_info=True)
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
check('저장은 된다(막지 않는다)', sc == 200, sc)
check('실패를 숨기지 않는다', '실패' in str((body.get('guard') or {}).get('note')), body.get('guard'))

print('\n=== 11) 되살려도 새 항목은 그대로 들어간다 ===')
NEW = '1newNEW'
nas = FakeNas(index=CUR3, id_map=dict(MAP3, **{NEW: '개발3팀/새프로젝트.json'}), live=LIVE3)
sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json'),
                                                                      ent(NEW, '새프로젝트.json')]})})
check('새 항목 + 되살린 2건 = 4건', len(out['projects']) == 4, names_of(out))
check('새 항목이 살아 있다', '새프로젝트.json' in names_of(out), names_of(out))

print('\n=== 12) 가드가 터져도 저장은 된다 ===')


class Boom(FakeNas):
    # ⚠️ 여기서 KeyboardInterrupt 를 던지면 안 된다 — 그건 **일부러 안 잡는다**(BaseException).
    #    가드의 안전망이 받아야 하는 건 평범한 예외다.
    def download(self, path, timeout=120):
        raise TypeError('가드 안에서 이상한 예외')


nas = Boom(index=CUR3, id_map=MAP3, live=LIVE3)
try:
    sc, body, out = run(nas, {'rel': IDX, 'text': json.dumps({'projects': [ent(A, 'STELLAR32.json')]})})
    check('저장이 완료된다', sc == 200 and out is not None, (sc, out))
except Exception as e:
    check('저장이 완료된다', False, '가드 예외가 새어 나왔다: %s' % e)

print('\n' + ('FAIL %d / ' % len(FAIL) if FAIL else '') + 'ok %d/%d' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    for f in FAIL:
        print('   - ' + f)
sys.exit(1 if FAIL else 0)
