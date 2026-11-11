# -*- coding: utf-8 -*-
"""📁 /doc/rename — 프로젝트 이름을 바꾸면 CUSTOMER/SUMMARY/MC/DOCUMENT 하위 폴더도 같이 옮긴다
(2026-11-11, "프로젝트명을 바꾸면 폴더명도 자동으로 바뀌면 좋겠다" 요청)

왜 — 이 네 폴더는 "지금 저장된 프로젝트 파일 이름"으로 하위 폴더를 만든다
(`_dsCurrentProjectFolderName`, js/48). 사람이 "고객사>프로젝트명" 을 고쳐 다시 저장하면
그 이름이 바뀌어, 다음부터는 **새 이름의 폴더**를 쓰고 **옛 폴더는 그대로 버려진다**
(js/67 코드 주석에 이미 적혀 있던 설계상 빈틈). 이 라우트는 `os.rename`(같은 공유 안이라
원자적)으로 그 옛 폴더를 새 이름으로 그 자리에서 옮긴다.

⚠️ CUSTOMER·SUMMARY·MC·DOCUMENT 는 **SMB 문서 저장소(`/doc/*`)** 다 — 프로젝트 JSON 이
사는 DSM REST API(`/nas/app/*`)와 **다른 길**이다(docs/nas-dsm.md 2026-11-05 항목). 이
라우트가 쓰는 건 평범한 `os.rename` 이지 `nas_dsm.rename` 이 아니다.

여기서 못 박는 것
  ① 옛 폴더가 없으면(아직 그 자료를 안 올린 프로젝트) 성공으로 둔다 — 옮길 게 없다
  ② 새 이름의 폴더가 **이미 있으면 덮지 않고 거부한다**(409)
  ③ `_docstore_dir` 를 쓰지 않는다 — 그건 없으면 **만들어 버린다**(여기선 그러면 안 된다)
  ④ 경로 탈출(`..`·절대경로·화이트리스트 밖 최상위 폴더)은 기존 `_docstore_folder_segs` 가 막는다

**진짜 임시 폴더로 실제 `os.rename` 을 돈다** — 가짜는 `_docstore_probe_root`(SMB 로그온
자격증명 확인) 하나뿐이다. 자격증명·네트워크 불필요.

    py -3 tests/test_doc_rename_folder.py
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


ROOT = tempfile.mkdtemp(prefix='doc-rename-test-')
bk._docstore_load = lambda: {'root': ROOT, 'folders': []}
bk._docstore_probe_root = lambda root: (True, None)   # SMB 로그온 경계만 가짜

cli = bk.app.test_client()


def rename(folder, new_name):
    r = cli.post('/doc/rename', json={'folder': folder, 'newName': new_name})
    return r.status_code, json.loads(r.data.decode('utf-8'))


try:
    print('\n=== 1) 정상 이름 바꾸기 — CUSTOMER/<프로젝트> 가 새 이름으로 옮겨진다 ===')
    os.makedirs(os.path.join(ROOT, 'CUSTOMER', 'LNW_27.0', 'ELECTRICAL'))
    with open(os.path.join(ROOT, 'CUSTOMER', 'LNW_27.0', 'ELECTRICAL', 'spec.pdf'), 'w', encoding='utf-8') as f:
        f.write('x')
    os.makedirs(os.path.join(ROOT, 'CUSTOMER', 'KONAMI_KGP-4_55.0'))   # 남의 폴더
    sc, body = rename('CUSTOMER/LNW_27.0', 'LNW_OBSIDIAN27_DB_27.0')
    check('200', sc == 200, sc)
    check('ok:true', body.get('ok') is True, body)
    check('from/to', body.get('from') == 'CUSTOMER/LNW_27.0'
          and body.get('to') == 'CUSTOMER/LNW_OBSIDIAN27_DB_27.0', body)
    check('옛 폴더는 더 없다', not os.path.isdir(os.path.join(ROOT, 'CUSTOMER', 'LNW_27.0')))
    newdir = os.path.join(ROOT, 'CUSTOMER', 'LNW_OBSIDIAN27_DB_27.0')
    check('새 폴더가 있다', os.path.isdir(newdir))
    check('안의 파일까지 그대로 옮겨졌다(내용 보존)',
          os.path.isfile(os.path.join(newdir, 'ELECTRICAL', 'spec.pdf')))
    check('남의 폴더(KONAMI)는 안 건드렸다', os.path.isdir(os.path.join(ROOT, 'CUSTOMER', 'KONAMI_KGP-4_55.0')))

    print('\n=== 2) 옛 폴더가 없으면(아직 안 올린 자료) 성공으로 두고 아무것도 안 만든다 ===')
    sc, body = rename('DOCUMENT/LNW_27.0', 'LNW_OBSIDIAN27_DB_27.0')
    check('200', sc == 200, sc)
    check('ok:true', body.get('ok') is True, body)
    check('skipped:source-missing', body.get('skipped') == 'source-missing', body)
    check('새 폴더를 만들지 않는다(_docstore_dir 를 안 쓰므로)',
          not os.path.isdir(os.path.join(ROOT, 'DOCUMENT', 'LNW_OBSIDIAN27_DB_27.0')))
    check('옛 폴더도 생기지 않는다', not os.path.isdir(os.path.join(ROOT, 'DOCUMENT', 'LNW_27.0')))

    print('\n=== 3) 새 이름이 이미 있으면 덮지 않고 거부한다(409) ===')
    os.makedirs(os.path.join(ROOT, 'MC', 'LNW_27.0'))
    os.makedirs(os.path.join(ROOT, 'MC', 'LNW_OBSIDIAN27_DB_27.0'))
    with open(os.path.join(ROOT, 'MC', 'LNW_OBSIDIAN27_DB_27.0', 'keep.txt'), 'w', encoding='utf-8') as f:
        f.write('남의 내용 - 덮이면 안 된다')
    sc, body = rename('MC/LNW_27.0', 'LNW_OBSIDIAN27_DB_27.0')
    check('409', sc == 409, sc)
    check('ok:false', body.get('ok') is False, body)
    check('collision:true', body.get('collision') is True, body)
    check('두 폴더 다 그대로다', os.path.isdir(os.path.join(ROOT, 'MC', 'LNW_27.0'))
          and os.path.isfile(os.path.join(ROOT, 'MC', 'LNW_OBSIDIAN27_DB_27.0', 'keep.txt')))

    print('\n=== 4) 새 이름에 경로 구분자가 있으면 거부한다 ===')
    os.makedirs(os.path.join(ROOT, 'SUMMARY', 'LNW_27.0'), exist_ok=True)
    sc, body = rename('SUMMARY/LNW_27.0', 'A/B')
    check('400', sc == 400, sc)
    check('ok:false', body.get('ok') is False, body)
    check('옛 폴더는 그대로다', os.path.isdir(os.path.join(ROOT, 'SUMMARY', 'LNW_27.0')))

    print('\n=== 5) 화이트리스트 밖(최상위) 폴더는 거부한다 ===')
    sc, body = rename('ETC_SOMETHING/LNW_27.0', 'NEW')
    check('400', sc == 400, sc)
    check('ok:false', body.get('ok') is False, body)

    print('\n=== 6) 경로 탈출(..)은 거부한다 ===')
    sc, body = rename('CUSTOMER/../../../Windows', 'x')
    check('400', sc == 400, sc)
    check('ok:false', body.get('ok') is False, body)

    print('\n=== 7) 새 이름이 지금 이름과 같으면(자리 이동 없음) 자기충돌로 거부하지 않는다 ===')
    os.makedirs(os.path.join(ROOT, 'DOCUMENT', 'SAME_NAME'), exist_ok=True)
    sc, body = rename('DOCUMENT/SAME_NAME', 'SAME_NAME')
    check('200', sc == 200, sc)
    check('ok:true', body.get('ok') is True, body)
    check('폴더가 그대로 산다', os.path.isdir(os.path.join(ROOT, 'DOCUMENT', 'SAME_NAME')))

finally:
    shutil.rmtree(ROOT, ignore_errors=True)

print('\n' + '─' * 60)
print('%d/%d 통과' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    print('❌ 실패: ' + ', '.join(FAIL))
    sys.exit(1)
sys.exit(0)
