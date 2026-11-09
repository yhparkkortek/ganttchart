# -*- coding: utf-8 -*-
"""📥 SAP 문서(P01 승인원 등) 다운로드 하네스 — 2026-11-09

    py -3 tests/test_sap_doc_download.py

무엇을 보나(사용자가 실제로 겪은 증상 그대로):
  ① 저장 폴더 — 루트에 흩뿌리지 않고 **제 폴더**로 가는가(없으면 만드는가)
  ② 파일 이름 앞에 **자재번호**가 붙는가 (폴더도 `<자재>_<문서번호>`)
  ③ 폴더 이름이 **카탈로그 한 곳**(SAP_FOLDER_REGISTRY)에만 있는가
  ④ 건수에 맞춘 **예산** + 못 끝내면 **몇 건까지 받았는지** 공개(`partial`)
  ⑤ 진행 상황 라우트가 지금 상태를 말하는가

⚠️ 가짜는 **바깥 경계 하나**뿐이다 — `_run_sap_bridge`(32비트 서브프로세스 호출).
   청크 분할·예산·부분 보고·폴더 결정은 전부 `kortek_backend` 의 **진짜 코드**가 한다.
   ①②(파일 이동/이름)는 `sap_bridge_32._dms_place_downloads` **진짜 함수**를 임시 폴더에서
   그대로 돌린다(SAP 없이 돈다 — COM 을 안 쓰는 순수 파일시스템 함수다).
⚠️ 사람이 돌리는 5000번 프로세스를 죽이지 않는다 — `app.test_client()` 로만 두드린다.
⚠️ 실제 `C:/SAP_DMS` 를 건드리지 않는다 — 폴더 카탈로그를 임시 폴더로 갈아 끼운다.
"""
import io
import os
import sys
import json
import shutil
import tempfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import kortek_backend as B      # noqa: E402

# sap_bridge_32 는 32비트 전용이지만 **모듈 수준에서는 win32com 을 안 들인다**(전부 함수 안
# 지역 import) — 그래서 64비트 파이썬에서도 순수 함수를 그대로 돌려 볼 수 있다.
import sap_bridge_32 as S      # noqa: E402

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


# ══════════════════════════════════════════════════════════════════════════════
# ① ② 다운로드 후처리 — 폴더 이동 + 파일명 접두 (진짜 함수, 임시 폴더)
# ══════════════════════════════════════════════════════════════════════════════
def test_place():
    tmp = tempfile.mkdtemp(prefix='sapdoc-')
    try:
        root = os.path.join(tmp, 'SAP_DMS')          # ZDMSR004 가 떨어뜨리는 자리
        dest = os.path.join(root, '원자재승인원')     # 들어가야 할 자리
        # SAP 이 만든 모습: <문서번호> 폴더 + 원본 파일명
        touch(os.path.join(root, 'P01202500591', '승인원.pdf'))
        touch(os.path.join(root, 'P01202500591', 'spec.xlsx'))
        touch(os.path.join(root, 'P01201700540', 'a.pdf'))

        placed, renamed, errors = S._dms_place_downloads(
            {'P01202500591': '129181', 'P01201700540': '114246'}, root, dest)

        ok('① 루트에 남지 않는다', not os.path.isdir(os.path.join(root, 'P01202500591')))
        ok('① 목적 폴더가 만들어진다', os.path.isdir(dest))
        ok('② 폴더가 <자재>_<문서번호>', os.path.isdir(os.path.join(dest, '129181_P01202500591')))
        names = sorted(os.listdir(os.path.join(dest, '129181_P01202500591')))
        ok('② 파일 이름 앞에 자재번호', names == ['129181_spec.xlsx', '129181_승인원.pdf'], names)
        ok('② 두 번째 자재도 같이', os.path.isfile(os.path.join(dest, '114246_P01201700540', '114246_a.pdf')))
        ok('   placed 가 폴더·파일을 보고한다',
           len(placed) == 2 and sorted(p['matnr'] for p in placed) == ['114246', '129181'], placed)
        ok('   renamed 맵은 하위호환으로 남아 있다', renamed.get('P01202500591') == '129181_P01202500591')
        ok('   오류 없음', errors == [], errors)

        # 재실행(멱등) — 접두사를 두 번 붙이지 않는다
        placed2, _, errors2 = S._dms_place_downloads({'P01202500591': '129181'}, root, dest)
        names2 = sorted(os.listdir(os.path.join(dest, '129181_P01202500591')))
        ok('② 재실행해도 접두사가 두 번 안 붙는다', names2 == names, names2)
        ok('   재실행 오류 없음', errors2 == [], errors2)

        # SAP 이 같은 문서를 다시 떨어뜨린 경우 → 루트에 고아 폴더를 남기지 않는다
        touch(os.path.join(root, 'P01202500591', '승인원.pdf'))
        S._dms_place_downloads({'P01202500591': '129181'}, root, dest)
        ok('   중복 재다운로드는 루트에 고아를 안 남긴다',
           not os.path.isdir(os.path.join(root, 'P01202500591')))

        # 옛 버전이 루트에서 이름만 바꿔 둔 폴더도 목적지로 모은다
        touch(os.path.join(root, '777777_P01209900001', 'old.pdf'))
        S._dms_place_downloads({'P01209900001': '777777'}, root, dest)
        ok('   옛 버전이 루트에 둔 <자재>_<문서> 폴더도 옮겨진다',
           os.path.isfile(os.path.join(dest, '777777_P01209900001', '777777_old.pdf'))
           and not os.path.isdir(os.path.join(root, '777777_P01209900001')))

        # 문서가 없는 자재 — 폴더가 아예 안 떨어진다. 고장이 아니고 조용히 넘어가야 한다.
        placed3, renamed3, errors3 = S._dms_place_downloads({'P01200000000': '129915'}, root, dest)
        ok('   문서 없는 자재는 오류가 아니다', placed3 == [] and errors3 == [], (placed3, errors3))

        # dest 를 안 주면 예전 자리(루트)에 그대로 — CLI 하위호환
        touch(os.path.join(root, 'P01208800002', 'z.pdf'))
        S._dms_place_downloads({'P01208800002': '555555'}, root, None)
        ok('   dest 를 안 주면 예전처럼 루트에 둔다(하위호환)',
           os.path.isfile(os.path.join(root, '555555_P01208800002', '555555_z.pdf')))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ══════════════════════════════════════════════════════════════════════════════
# ③ 폴더 카탈로그 — 폴더 이름은 한 곳에만 있다
# ══════════════════════════════════════════════════════════════════════════════
def test_catalog():
    tmp = tempfile.mkdtemp(prefix='sapcat-')
    orig = [dict(e) for e in B.SAP_FOLDER_REGISTRY]
    try:
        # 실제 C:/SAP_DMS 를 건드리지 않게 카탈로그 경로만 임시 폴더로 바꿔 끼운다
        for e in B.SAP_FOLDER_REGISTRY:
            e['path'] = e['path'].replace(B.SAP_DMS_ROOT, tmp)

        p01 = B.sap_doc_dir('P01')
        ok('③ P01 은 전용 폴더로', os.path.basename(p01) == '원자재승인원', p01)
        ok('③ 폴더가 없으면 만든다', os.path.isdir(p01))
        q11 = B.sap_doc_dir('Q11')
        ok('③ 이름 없는 타입은 기본 폴더(자재문서)로', os.path.basename(q11) == '자재문서', q11)
        ok('③ 소문자/공백도 같은 폴더', B.sap_doc_dir(' p01 ') == p01)
        ok('③ 어느 것도 루트가 아니다',
           os.path.normcase(p01) != os.path.normcase(tmp)
           and os.path.normcase(q11) != os.path.normcase(tmp))
        ok('③ 옛 키 doc 도 새 문서 폴더를 가리킨다',
           os.path.normcase(B.sap_folder_path('doc')) == os.path.normcase(q11))
        ok('③ 모르는 키는 None', B.sap_folder_path('없는키') is None)
        # 폴더 이름이 카탈로그 밖에 또 적혀 있지 않은지 — 브릿지는 이름을 모른다
        bridge_src = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                                          'sap_bridge_32.py'), encoding='utf-8').read()
        ok('③ 브릿지는 문서 폴더 이름을 모른다(인자로 받는다)',
           '원자재승인원' not in bridge_src and "'자재문서'" not in bridge_src)
    finally:
        for e, o in zip(B.SAP_FOLDER_REGISTRY, orig):
            e['path'] = o['path']
        shutil.rmtree(tmp, ignore_errors=True)


# ══════════════════════════════════════════════════════════════════════════════
# ④ ⑤ 청크 + 예산 + 부분 보고 + 진행 (진짜 루프, 경계 하나만 가짜)
# ══════════════════════════════════════════════════════════════════════════════
class Bridge(object):
    """`_run_sap_bridge` 대역 — 호출 인자를 기록하고, 정해진 청크에서 실패/지연한다.
    ⚠️ 호출 **순서**로 분기하지 않는다(CLAUDE.md: 스텁은 호출 순서에 기대지 말 것) —
       넘어온 **자재 목록 내용**으로 분기한다."""

    def __init__(self, fail_on=None, slow_on=None, spend=0.0):
        self.calls = []
        self.fail_on = set(fail_on or [])     # 이 자재가 섞인 청크는 실패
        self.slow_on = set(slow_on or [])     # 이 자재가 섞인 청크는 시간을 많게 쓴 것으로
        self.spend = spend                    # 청크마다 흘려보내는 가짜 시간(초)
        self.clock = [0.0]

    def __call__(self, args, timeout, label):
        self.calls.append({'args': list(args), 'timeout': timeout})
        action = args[0]
        if action == 'resolve_desc_pattern':
            return {'ok': True, 'pattern': args[1], 'materials': self.pattern_hits,
                    'matchDetails': [{'matnr': m, 'desc': 'D' + m} for m in self.pattern_hits]}, 200
        doc_type, mats, dest = args[1], args[2].split(','), (args[3] if len(args) > 3 else None)
        self.clock[0] += self.spend + (60.0 if self.slow_on & set(mats) else 0.0)
        if self.fail_on & set(mats):
            return {'ok': False, 'error': '코딩블록 팝업이 안 닫혔습니다'}, 200
        return {'ok': True, 'materials': mats, 'docType': doc_type, 'savedFolder': dest,
                'matnrByDoknr': {('%s_DOC' % m): m for m in mats},
                'renamedFolders': {('%s_DOC' % m): ('%s_%s_DOC' % (m, m)) for m in mats},
                'placed': [{'matnr': m, 'doknr': '%s_DOC' % m,
                            'folder': (dest or '') + '\\' + m + '_' + m + '_DOC',
                            'files': [m + '_a.pdf']} for m in mats],
                'placeErrors': []}, 200


def with_bridge(bridge, fake_clock=False):
    """경계 하나만 갈아 끼운다. fake_clock=True 면 `time.time` 도 청크마다 흐르게 한다."""
    real_run, real_time = B._run_sap_bridge, B.time.time
    B._run_sap_bridge = bridge
    if fake_clock:
        base = real_time()
        B.time.time = lambda: base + bridge.clock[0]
    return real_run, real_time


def restore(real_run, real_time):
    B._run_sap_bridge, B.time.time = real_run, real_time


def test_chunk_and_budget():
    tmp = tempfile.mkdtemp(prefix='sapbud-')
    orig = [dict(e) for e in B.SAP_FOLDER_REGISTRY]
    for e in B.SAP_FOLDER_REGISTRY:
        e['path'] = e['path'].replace(B.SAP_DMS_ROOT, tmp)
    mats200 = ['%06d' % (100000 + i) for i in range(200)]
    try:
        # ── 예산이 건수에 따라 늘어난다(고정값이 아니다) ──────────────────────
        b7, b200 = B.sap_doc_batch_budget(7), B.sap_doc_batch_budget(200)
        ok('④ 예산이 건수에 비례한다', b200 > b7, (b7, b200))
        ok('④ 200건 예산이 옛 고정 300초보다 크다', b200 > 300, b200)
        ok('④ 상한을 넘지 않는다',
           B.sap_doc_batch_budget(100000) == B.SAP_DOC_BATCH_LIMITS['totalCap'])

        # ── 200건이 끝까지 간다(청크로 쪼개) ─────────────────────────────────
        br = Bridge()
        saved = with_bridge(br)
        data, status = B._sap_doc_batch_download(mats200, 'P01')
        restore(*saved)
        size = B.SAP_DOC_BATCH_LIMITS['chunkSize']
        ok('④ 200건이 끝까지 간다', data['ok'] and not data['partial'], data.get('message'))
        ok('④ 청크로 쪼개 돈다', len(br.calls) == (len(mats200) + size - 1) // size, len(br.calls))
        ok('④ 청크 크기는 데이터(검증된 팝업 한계)',
           all(len(c['args'][2].split(',')) <= size for c in br.calls))
        ok('④ 받은 건수를 그대로 센다', len(data['done']) == 200 and data['pending'] == [])
        ok('① 목적 폴더를 브릿지에 넘긴다(브릿지가 이름을 정하지 않는다)',
           all(c['args'][3] == B.sap_doc_dir('P01') for c in br.calls), br.calls[0]['args'])

        br2 = Bridge()
        saved = with_bridge(br2)
        d2, _ = B._sap_doc_batch_download(['111111', '111111', '222222'], 'P01')
        restore(*saved)
        ok('   중복 자재를 지운다', d2['materials'] == ['111111', '222222'], d2['materials'])

        # ── 예산을 넘기면 멈추고 "어디까지 받았는지" 를 공개한다 ─────────────
        # 청크마다 200초를 쓰는 척 → 29청크 × 200초 = 5,800초로 예산(3,600초)을 넘긴다
        slow = Bridge(spend=200.0)
        saved = with_bridge(slow, fake_clock=True)
        d3, _ = B._sap_doc_batch_download(mats200, 'P01')
        restore(*saved)
        ok('④ 예산 초과 → partial', d3['ok'] and d3['partial'], (d3['ok'], d3.get('partial')))
        ok('④ 멈춘 이유가 예산', d3['stopReason'] == 'budget', d3['stopReason'])
        ok('④ 받은 것과 남은 것이 둘 다 있다', bool(d3['done']) and bool(d3['pending']),
           (len(d3['done']), len(d3['pending'])))
        ok('④ 합이 맞는다', len(d3['done']) + len(d3['pending']) == 200)
        ok('④ 메시지가 몇 건까지 받았는지 말한다',
           ('%d/%d' % (len(d3['done']), 200)) in d3['message'] and '못 받았습니다' in d3['message'],
           d3['message'][:160])
        ok('④ 남은 자재를 알려준다', bool(d3['pending']) and d3['pending'][0] in d3['message'])

        # ── 중간 청크가 실패해도 받은 것은 보고한다 ──────────────────────────
        bad = Bridge(fail_on={mats200[20]})
        saved = with_bridge(bad)
        d4, _ = B._sap_doc_batch_download(mats200, 'P01')
        restore(*saved)
        ok('④ 청크 실패 → partial(성공처럼 보이지 않는다)', d4['ok'] and d4['partial'])
        ok('④ 멈춘 이유가 오류', d4['stopReason'] == 'error', d4['stopReason'])
        ok('④ 멈춘 오류 문구를 숨기지 않는다', '코딩블록' in (d4['message'] or ''), d4['message'][:120])
        ok('④ 실패 전까지 받은 건 done 에', len(d4['done']) == 14, len(d4['done']))

        # ── 첫 청크부터 실패하면 예전처럼 실패다(숨길 부분 성공이 없다) ──────
        allbad = Bridge(fail_on=set(mats200))
        saved = with_bridge(allbad)
        d5, _ = B._sap_doc_batch_download(mats200, 'P01')
        restore(*saved)
        ok('④ 한 건도 못 받으면 ok:False', d5['ok'] is False and d5['error'])

        # ── 자재가 없으면 400 ────────────────────────────────────────────────
        d6, s6 = B._sap_doc_batch_download([], 'P01')
        ok('   자재 0건은 400', d6['ok'] is False and s6 == 400)

        # ── ⑤ 진행 라우트 ───────────────────────────────────────────────────
        c = B.app.test_client()
        pg = json.loads(c.get('/sap-doc-batch-progress').data.decode('utf-8'))
        ok('⑤ 진행 라우트가 산다', pg['ok'] and isinstance(pg['progress'], dict))
        ok('⑤ 끝난 뒤엔 running=False', pg['progress'].get('running') is False, pg['progress'])
        ok('⑤ 마지막 작업의 총 건수를 들고 있다', pg['progress'].get('total') == 200, pg['progress'])

        # ── 라우트가 같은 루프를 쓴다 ───────────────────────────────────────
        br3 = Bridge()
        saved = with_bridge(br3)
        r = c.get('/sap-download-documents-batch?materials=' + ','.join(mats200[:20]) + '&type=P01')
        restore(*saved)
        rd = json.loads(r.data.decode('utf-8'))
        ok('④ 라우트도 청크로 돈다', rd['ok'] and len(br3.calls) == 3, len(br3.calls))
        ok('   공백 구분 목록도 받는다', True)
        br4 = Bridge()
        saved = with_bridge(br4)
        r = c.get('/sap-download-documents-batch?materials=111111%20222222&type=P01')
        restore(*saved)
        ok('   공백으로 나열해도 2건으로 읽는다',
           json.loads(r.data.decode('utf-8'))['materials'] == ['111111', '222222'])

        # ── 패턴 경로: 조회 1회 + 청크 다운로드 ─────────────────────────────
        pb = Bridge()
        pb.pattern_hits = mats200[:30]
        saved = with_bridge(pb)
        r = c.get('/sap-download-documents-by-pattern?pattern=*LABEL*&type=P01')
        restore(*saved)
        pd = json.loads(r.data.decode('utf-8'))
        ok('④ 패턴은 조회를 먼저 한다', pb.calls[0]['args'][0] == 'resolve_desc_pattern', pb.calls[0])
        ok('④ 패턴도 청크 루프를 쓴다', len(pb.calls) == 1 + 5, len(pb.calls))
        ok('④ 패턴 결과가 자재별 매칭을 적는다', '자재별 매칭' in pd['message'])

        pb0 = Bridge()
        pb0.pattern_hits = []
        saved = with_bridge(pb0)
        r = c.get('/sap-download-documents-by-pattern?pattern=*NOPE*&type=P01')
        restore(*saved)
        pd0 = json.loads(r.data.decode('utf-8'))
        ok('④ 0건이면 "매치되는 자재가 없습니다"(열을 못 찾았다고 하지 않는다)',
           pd0['ok'] and '매치되는 자재가 없습니다' in pd0['message'], pd0.get('message'))
    finally:
        for e, o in zip(B.SAP_FOLDER_REGISTRY, orig):
            e['path'] = o['path']
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    print('=== ①② 다운로드 후처리(폴더/파일명) — 진짜 함수, 임시 폴더 ===')
    test_place()
    print('=== ③ 폴더 카탈로그 ===')
    test_catalog()
    print('=== ④⑤ 청크 · 예산 · 부분보고 · 진행 ===')
    test_chunk_and_budget()
    print('')
    print('PASS %d / FAIL %d' % (PASS[0], FAIL[0]))
    return 1 if FAIL[0] else 0


if __name__ == '__main__':
    sys.exit(main())
