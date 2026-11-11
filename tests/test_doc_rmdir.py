# -*- coding: utf-8 -*-
"""🗑 /doc/rmdir — 빈 하위 폴더 하나만 지운다 (2026-11-11)

왜 — ADDRESS 가 프로젝트별 하위 폴더로 나뉘던 버그(`nasFolders` 미지정)를 고치고 나니, 그
버그가 예전에 만들어 둔 **빈 폴더**(ADDRESS/<프로젝트명>)들이 NAS 에 그대로 남아 있었다
(실측: `KONAMI_KGP-4_55.0`·`LNW_STELLAR32_32.0` 둘 다 파일 0개). 이걸 치우는 라우트다.

여기서 못 박는 것
  ① 폴더 안에 파일이든 하위 폴더든 **하나라도** 있으면 거부한다(409) — `os.rmdir` 만 쓰고
     `shutil.rmtree` 를 안 쓰는 이유도 이거다(통째로 날리는 사고를 구조적으로 막는다)
  ② 없는 폴더를 지우려 하면 **없다고만** 하고 성공으로 둔다(`skipped`) — 만들지 않는다
  ③ 경로 탈출(`..`)·화이트리스트 밖 폴더는 기존 `_docstore_folder_segs` 가 막는다

**진짜 임시 폴더로 실제 `os.rmdir` 을 돈다** — 가짜는 `_docstore_probe_root`(SMB 로그온
자격증명 확인) 하나뿐. 자격증명·네트워크 불필요.

    py -3 tests/test_doc_rmdir.py
"""
import json
import os
import shutil
import sys
import tempfile

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


ROOT = tempfile.mkdtemp(prefix='doc-rmdir-test-')
bk._docstore_load = lambda: {'root': ROOT, 'folders': []}
bk._docstore_probe_root = lambda root: (True, None)

cli = bk.app.test_client()


def rmdir(folder):
    r = cli.post('/doc/rmdir', json={'folder': folder})
    return r.status_code, json.loads(r.data.decode('utf-8'))


try:
    print('\n=== 1) 빈 폴더는 지워진다 ===')
    os.makedirs(os.path.join(ROOT, 'ADDRESS', 'KONAMI_KGP-4_55.0'))
    sc, body = rmdir('ADDRESS/KONAMI_KGP-4_55.0')
    check('200', sc == 200, sc)
    check('ok:true', body.get('ok') is True, body)
    check('실제로 없어졌다', not os.path.isdir(os.path.join(ROOT, 'ADDRESS', 'KONAMI_KGP-4_55.0')))

    print('\n=== 2) 없는 폴더는 성공으로 두되 skipped 로 표시한다(만들지 않는다) ===')
    sc, body = rmdir('ADDRESS/LNW_27.0')
    check('200', sc == 200, sc)
    check('ok:true', body.get('ok') is True, body)
    check('skipped:not-found', body.get('skipped') == 'not-found', body)
    check('새로 만들지 않는다', not os.path.isdir(os.path.join(ROOT, 'ADDRESS', 'LNW_27.0')))

    print('\n=== 3) 파일이 든 폴더는 거부한다(409) — 안의 파일은 그대로 ===')
    os.makedirs(os.path.join(ROOT, 'ADDRESS', 'LNW_STELLAR32_32.0'))
    with open(os.path.join(ROOT, 'ADDRESS', 'LNW_STELLAR32_32.0', 'keep.txt'), 'w', encoding='utf-8') as f:
        f.write('x')
    sc, body = rmdir('ADDRESS/LNW_STELLAR32_32.0')
    check('409', sc == 409, sc)
    check('ok:false', body.get('ok') is False, body)
    check('notEmpty:true', body.get('notEmpty') is True, body)
    check('폴더와 파일이 그대로다', os.path.isfile(os.path.join(ROOT, 'ADDRESS', 'LNW_STELLAR32_32.0', 'keep.txt')))

    print('\n=== 4) 하위 폴더만 든 경우도 거부한다(파일이 아니어도 "비어있지 않음") ===')
    os.makedirs(os.path.join(ROOT, 'ADDRESS', 'HASSUB', 'inner'))
    sc, body = rmdir('ADDRESS/HASSUB')
    check('409', sc == 409, sc)
    check('그대로 있다', os.path.isdir(os.path.join(ROOT, 'ADDRESS', 'HASSUB', 'inner')))

    print('\n=== 5) 경로 탈출(..)은 거부한다 ===')
    sc, body = rmdir('ADDRESS/../../../Windows')
    check('400', sc == 400, sc)
    check('ok:false', body.get('ok') is False, body)

    print('\n=== 6) 화이트리스트 밖(최상위) 폴더는 거부한다 ===')
    sc, body = rmdir('ETC_SOMETHING')
    check('400', sc == 400, sc)
    check('ok:false', body.get('ok') is False, body)

finally:
    shutil.rmtree(ROOT, ignore_errors=True)

print('\n' + '─' * 60)
print('%d/%d 통과' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    print('❌ 실패: ' + ', '.join(FAIL))
    sys.exit(1)
sys.exit(0)
