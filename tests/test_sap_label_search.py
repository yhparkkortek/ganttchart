# -*- coding: utf-8 -*-
"""🏷 라벨사양서 — 6자리 라벨품목코드로 라벨 도안 찾기 하네스 — 2026-11-12

    py -3 tests/test_sap_label_search.py

무엇을 보나:
  ① 코드 형식 검증 — 6자리 안팎 숫자가 아니면 400
  ② 부분일치 오탐 방지 — '124291' 이 '1124291' 안의 숫자를 집지 않는다(숫자 경계)
  ③ 실측 폴더 모양 그대로(파일 이름 규칙이 제각각) 찾는다 — `<code>.xlsx` ·
     `승인원_<code>_REV02.zip` · `<code>_설명_날짜_REV00.zip`
  ④ 'docs'(자재문서) 폴더도 같이 훑는다(승인원 폴더에 없어도 찾는다)
  ⑤ 여러 폴더 루트에 흩어져 있어도 전부 모은다 + 상한(`_LABEL_SEARCH_MAX`)에서 `partial` 를 켠다
  ⑥ /sap-open-file — C:\\SAP_DMS 바깥 경로는 403, 없는 파일은 404

⚠️ 사람이 돌리는 5000번 프로세스를 죽이지 않는다 — `app.test_client()` 로만 두드린다.
⚠️ 실제 `C:/SAP_DMS` 를 건드리지 않는다 — 폴더 카탈로그를 임시 폴더로 갈아 끼운다
   (`test_sap_doc_download.py` 의 `test_catalog` 와 같은 방식).
"""
import io
import os
import sys
import shutil
import tempfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import kortek_backend as B      # noqa: E402

PASS = [0]
FAIL = [0]


def ok(name, cond, detail=''):
    if cond:
        PASS[0] += 1
        print('  OK   %s' % name)
    else:
        FAIL[0] += 1
        print('  FAIL %s%s' % (name, ('  -- ' + str(detail)) if detail else ''))


def touch(path, body='x'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(body)


def with_temp_catalog(fn):
    tmp = tempfile.mkdtemp(prefix='saplabel-')
    orig = [dict(e) for e in B.SAP_FOLDER_REGISTRY]
    try:
        for e in B.SAP_FOLDER_REGISTRY:
            e['path'] = e['path'].replace(B.SAP_DMS_ROOT, tmp)
        fn(tmp)
    finally:
        for e, o in zip(B.SAP_FOLDER_REGISTRY, orig):
            e['path'] = o['path']
        shutil.rmtree(tmp, ignore_errors=True)


def test_code_validation():
    c = B.app.test_client()
    ok('① 코드 없음 → 400', c.get('/sap-label-search').status_code == 400)
    ok('① 글자 섞인 코드 → 400', c.get('/sap-label-search?code=12a456').status_code == 400)
    ok('① 3자리는 너무 짧다 → 400', c.get('/sap-label-search?code=123').status_code == 400)
    ok('① 8자리는 너무 길다 → 400', c.get('/sap-label-search?code=12345678').status_code == 400)


def test_search_real_shapes(tmp):
    p01 = B.sap_folder_path('docs_P01', create=True)
    docs = B.sap_folder_path('docs', create=True)
    # 실측 파일 이름 규칙 그대로(들쭉날쭉) — 전부 '124291' 을 담고 있다
    touch(os.path.join(p01, 'P01202601041', '124291.XLSX'))
    touch(os.path.join(p01, 'P01201304232', '400467_인컴_20130528_REV00.ZIP'))
    touch(os.path.join(p01, 'P01202402989', '승인원_124291_REV02.ZIP'))
    # 오탐 후보 — 숫자 경계가 아니면 걸리면 안 된다
    touch(os.path.join(p01, 'P01999999999', '1124291_REV00.XLSX'))
    touch(os.path.join(p01, 'P01999999998', '1242910_REV00.XLSX'))
    # ④ 'docs'(자재문서) 폴더에도 하나
    touch(os.path.join(docs, 'misc', '승인원_124291_V00.XLSX'))

    c = B.app.test_client()
    r = c.get('/sap-label-search?code=124291')
    j = r.get_json()
    names = sorted(m['name'] for m in j['matches'])
    ok('② 200 · ok', r.status_code == 200 and j['ok'])
    ok('③ 세 가지 파일 이름 규칙 전부 찾는다',
       names == ['124291.XLSX', '승인원_124291_REV02.ZIP', '승인원_124291_V00.XLSX'], names)
    ok('② 오탐 둘 다 안 걸린다(숫자 경계)',
       not any('1124291' in n or '1242910' in n for n in names), names)
    ok('④ 자재문서(docs) 폴더도 훑는다', '승인원_124291_V00.XLSX' in names)
    ok('   path 는 절대경로이고 C:\\SAP_DMS 로 시작한다(테스트에선 임시 루트)',
       all(m['path'].startswith(tmp) for m in j['matches']))

    r2 = c.get('/sap-label-search?code=000000')
    j2 = r2.get_json()
    ok('   없는 코드는 빈 목록(오류 아님)', r2.status_code == 200 and j2['ok'] and j2['matches'] == [])


def test_partial_cap():
    orig_max = B._LABEL_SEARCH_MAX
    B._LABEL_SEARCH_MAX = 3

    def _run(tmp):
        p01 = B.sap_folder_path('docs_P01', create=True)
        for i in range(6):
            touch(os.path.join(p01, 'P01%03d' % i, '555555_%d.XLSX' % i))
        c = B.app.test_client()
        r = c.get('/sap-label-search?code=555555')
        j = r.get_json()
        ok('⑤ 상한에 걸리면 끊고 partial 을 켠다', len(j['matches']) == 3 and j['partial'] is True, j)

    try:
        with_temp_catalog(_run)
    finally:
        B._LABEL_SEARCH_MAX = orig_max


def test_open_file(tmp):
    # ⚠️ /sap-open-file 은 (/sap-open-folder 와 같은 규칙으로) **카탈로그가 아니라 진짜
    #    `C:\SAP_DMS` 리터럴** 을 화이트리스트로 쓴다 — 그래서 카탈로그를 임시 폴더로 갈아
    #    끼워도 "안쪽" 케이스는 거기서 검증이 안 된다. "안쪽" 만 real root 밑 전용 하위폴더
    #    (`_test_probe`, 끝나면 지운다)로 따로 확인하고, "바깥"·"없음" 은 임시 폴더로 본다.
    probe_dir = os.path.join(r'C:\SAP_DMS', '_test_probe')
    try:
        fp = os.path.join(probe_dir, '124291.XLSX')
        touch(fp)
        c = B.app.test_client()

        import unittest.mock as mock
        with mock.patch.object(B.os, 'startfile', create=True) as m:
            r = c.get('/sap-open-file?path=' + fp)
            ok('⑥ SAP_DMS 안 파일은 연다(startfile 호출)', r.status_code == 200 and r.get_json()['ok'] and m.called)

        r2 = c.get('/sap-open-file?path=' + os.path.join(probe_dir, 'ghost-missing.xlsx'))
        ok('⑥ 없는 파일은 404', r2.status_code == 404)
    finally:
        shutil.rmtree(probe_dir, ignore_errors=True)

    outside = os.path.join(os.path.dirname(tmp), 'outside.xlsx')
    touch(outside)
    try:
        r3 = c.get('/sap-open-file?path=' + outside)
        ok('⑥ SAP_DMS 바깥 경로는 403', r3.status_code == 403)
    finally:
        os.remove(outside)

    r4 = c.get('/sap-open-file')
    ok('⑥ path 없으면 400', r4.status_code == 400)


def main():
    print('=== ① 코드 형식 검증 ===')
    test_code_validation()
    print('=== ②③④ 실측 파일 이름 규칙 + 오탐 방지 + 자재문서 폴더 ===')
    with_temp_catalog(test_search_real_shapes)
    print('=== ⑤ 상한 + partial ===')
    test_partial_cap()
    print('=== ⑥ /sap-open-file 화이트리스트 ===')
    with_temp_catalog(test_open_file)
    print('')
    print('PASS %d / FAIL %d' % (PASS[0], FAIL[0]))
    return 1 if FAIL[0] else 0


if __name__ == '__main__':
    sys.exit(main())
