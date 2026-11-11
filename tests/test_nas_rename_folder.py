# -*- coding: utf-8 -*-
"""📁 /nas/app/rename — 프로젝트 이름을 바꾸면 NAS 하위 폴더도 같이 옮긴다 (2026-11-11)

왜 — 프로젝트별 NAS 하위 폴더(CUSTOMER/<프로젝트>·DOCUMENT/<프로젝트>·MC/<프로젝트>·…)는
"지금 저장된 파일 이름"으로 만들어진다(`_dsCurrentProjectFolderName`, js/48). 사람이
"고객사>프로젝트명" 을 고쳐 다시 저장하면 그 이름이 바뀌어, 다음부터는 **새 이름의 폴더**를
쓰고 **옛 폴더는 그대로 버려진다**(실측으로 확인된 설계상 빈틈 — js/67 코드 주석에 이미
적혀 있었다). 이 라우트는 `nas_dsm.rename`(이미 검증된 원자적 이름바꾸기)을 감싸 그 옛
폴더를 새 이름으로 **그 자리에서** 옮긴다.

여기서 못 박는 것
  ① 옛 폴더가 없으면(아직 그 자료를 안 올린 프로젝트) **성공으로 둔다** — 옮길 게 없다
  ② 새 이름의 폴더가 **이미 있으면 덮지 않고 거부한다**(409) — 합치기는 다른 일
  ③ 새 이름에 경로 구분자가 있으면 거부한다(한 단계만 바꾼다)
  ④ `rel` 이 앱 루트 바깥(절대경로·`..`)이면 기존 `_nas_target` 가드가 그대로 막는다

가짜는 **경계에만** — `_nas()` 가 돌려주는 모듈(nas_dsm)만. 라우트의 판정·응답 조립은
진짜 코드가 돈다. NAS·계정·네트워크 불필요.

    py -3 tests/test_nas_rename_folder.py
"""
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


class FakeNas(object):
    """경계 스텁 — 있는 경로 집합 하나와, rename 호출을 기록만 한다."""

    def __init__(self, live=None, rename_fails=False):
        self.live = set(live or [])
        self.calls = []
        self.rename_fails = rename_fails

    def abs_path(self, rel, team=None):
        rel = (rel or '').strip('/')
        if team:
            rel = team + ('/' + rel if rel else '')
        return ROOT + ('/' + rel if rel else '')

    def exists(self, path):
        self.calls.append('exists:' + path)
        return path in self.live

    def rename(self, path, new_name):
        self.calls.append('rename:%s -> %s' % (path, new_name))
        if self.rename_fails:
            raise RuntimeError('일부러 실패: rename')
        parent = path.rstrip('/').rsplit('/', 1)[0]
        dest = parent + '/' + new_name
        self.live.discard(path)
        self.live.add(dest)
        return dest


def run(nas, payload):
    bk._nas = lambda: nas
    cli = bk.app.test_client()
    r = cli.post('/nas/app/rename', json=payload)
    body = json.loads(r.data.decode('utf-8'))
    return r.status_code, body


print('\n=== 1) 정상 이름 바꾸기 — CUSTOMER 폴더가 새 이름으로 옮겨진다 ===')
nas = FakeNas(live=['%s/CUSTOMER/LNW_27.0' % ROOT, '%s/CUSTOMER/KONAMI_KGP-4_55.0' % ROOT])
sc, body = run(nas, {'rel': 'CUSTOMER/LNW_27.0', 'newName': 'LNW_OBSIDIAN27_DB_27.0'})
check('200', sc == 200, sc)
check('ok:true', body.get('ok') is True, body)
check('to 가 새 경로', body.get('to') == ROOT + '/CUSTOMER/LNW_OBSIDIAN27_DB_27.0', body)
check('rename 이 정확히 한 번 불린다', [c for c in nas.calls if c.startswith('rename:')] ==
      ['rename:%s/CUSTOMER/LNW_27.0 -> LNW_OBSIDIAN27_DB_27.0' % ROOT], nas.calls)
check('옛 폴더는 더 안 산다', (ROOT + '/CUSTOMER/LNW_27.0') not in nas.live)
check('새 폴더가 산다', (ROOT + '/CUSTOMER/LNW_OBSIDIAN27_DB_27.0') in nas.live)
check('남의 폴더는 안 건드린다', (ROOT + '/CUSTOMER/KONAMI_KGP-4_55.0') in nas.live)

print('\n=== 2) 옛 폴더가 없으면(아직 안 올린 자료) 성공으로 두고 아무 것도 안 한다 ===')
nas = FakeNas(live=[])
sc, body = run(nas, {'rel': 'DOCUMENT/LNW_27.0', 'newName': 'LNW_OBSIDIAN27_DB_27.0'})
check('200', sc == 200, sc)
check('ok:true', body.get('ok') is True, body)
check('skipped:source-missing', body.get('skipped') == 'source-missing', body)
check('rename 은 안 불린다', not any(c.startswith('rename:') for c in nas.calls), nas.calls)

print('\n=== 3) 새 이름이 이미 있으면 덮지 않고 거부한다(409) ===')
nas = FakeNas(live=['%s/MC/LNW_27.0' % ROOT, '%s/MC/LNW_OBSIDIAN27_DB_27.0' % ROOT])
sc, body = run(nas, {'rel': 'MC/LNW_27.0', 'newName': 'LNW_OBSIDIAN27_DB_27.0'})
check('409', sc == 409, sc)
check('ok:false', body.get('ok') is False, body)
check('collision:true', body.get('collision') is True, body)
check('rename 은 안 불린다 — 겹치면 아무것도 안 건드린다', not any(c.startswith('rename:') for c in nas.calls), nas.calls)
check('두 폴더 다 그대로다', ('%s/MC/LNW_27.0' % ROOT) in nas.live and ('%s/MC/LNW_OBSIDIAN27_DB_27.0' % ROOT) in nas.live)

print('\n=== 4) 새 이름에 경로 구분자가 있으면 거부한다(한 단계만 바꾼다) ===')
nas = FakeNas(live=['%s/DOCUMENT/LNW_27.0' % ROOT])
sc, body = run(nas, {'rel': 'DOCUMENT/LNW_27.0', 'newName': 'A/B'})
check('400', sc == 400, sc)
check('ok:false', body.get('ok') is False, body)
check('exists 조차 안 부른다', nas.calls == [], nas.calls)

print('\n=== 5) rel 이 앱 루트 바깥이면 기존 가드가 막는다 ===')
nas = FakeNas(live=[])
sc, body = run(nas, {'rel': '/etc/passwd', 'newName': 'x'})
check('400', sc == 400, sc)
check('ok:false', body.get('ok') is False, body)

print('\n=== 6) 새 이름이 지금 이름과 같아도(자리 이동 없음) 자기충돌로 거부하지 않는다 ===')
nas = FakeNas(live=['%s/SUMMARY/LNW_27.0' % ROOT])
sc, body = run(nas, {'rel': 'SUMMARY/LNW_27.0', 'newName': 'LNW_27.0'})
check('200', sc == 200, sc)
check('ok:true(같은 이름으로 rename 호출은 돌되 결과가 같다)', body.get('ok') is True, body)

print('\n=== 7) NAS 쪽 실패는 500으로 정직하게 알린다 ===')
nas = FakeNas(live=['%s/PARTS/PANEL/LNW_27.0' % ROOT], rename_fails=True)
sc, body = run(nas, {'rel': 'PARTS/PANEL/LNW_27.0', 'newName': 'LNW_OBSIDIAN27_DB_27.0'})
check('500', sc == 500, sc)
check('ok:false', body.get('ok') is False, body)
check('메시지에 사유가 있다', '일부러 실패' in str(body.get('message')), body)

print('\n' + '─' * 60)
print('%d/%d 통과' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    print('❌ 실패: ' + ', '.join(FAIL))
    sys.exit(1)
sys.exit(0)
