# -*- coding: utf-8 -*-
"""📗 PRODUCT SPEC 원본 양식 — 진짜 라우트로 왕복 시험 (2026-11-24)

    py -3 -I tests/test_product_spec_docx.py                      # 원본 없이: 합성 값으로 채우기·표식 잔류·그림
    py -3 -I tests/test_product_spec_docx.py <원본.docx> [...]    # 원본 있으면: 불러오기 → 채우기 → 원본과 글 비교

가짜 0개 — `app.test_client()` 로 진짜 `/doc/product-spec-parse`·`/doc/product-spec-docx` 를 부르고,
돌려받은 .docx 를 python-docx 로 다시 열어 본다. ⚠️ 원본 사양서는 저장소에 넣지 않는다(고객 값이 있다)
— 회사 PC 의 원본 경로를 인자로 준다.
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
os.chdir(ROOT)

import kortek_backend as kb  # noqa: E402
from docx import Document  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402

app = kb.app
client = app.test_client()
ok = fail = 0


def check(cond, msg):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
        print('  ✗', msg)


def doc_texts(doc):
    """본문(문단·표 칸 — 표 안 문단 포함) + 머리글 글을 순서대로."""
    out = []
    for el in doc.element.body.iter(qn('w:p')):
        t = ''.join(x.text or '' for x in el.iter(qn('w:t'))).strip()
        if t:
            out.append(t)
    for sec in doc.sections:
        for p in sec.header.paragraphs:
            if p.text.strip():
                out.append('H:' + p.text.strip())
    return out


def pictures(doc):
    n = 0
    for dr in doc.element.body.iter(qn('w:drawing')):
        gd = dr.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}graphicData')
        if gd is not None and gd.get('uri', '').endswith('/picture'):
            n += 1
    return n


schema = json.load(io.open(os.path.join(ROOT, 'templates', 'PRODUCT SPEC_schema.json'), encoding='utf-8'))
FAM_SCHEMA = {'stellar': schema}
for _fam in kb._ps_families_ready():
    FAM_SCHEMA[_fam] = kb._ps_load_schema(_fam)
# 계열마다 터치 장에만 있는 칸(터치 판 확인용)
TOUCH_PROBE = {'stellar': 'V_tperf.r1.c2', 'obsidian': 'V_tgen.r1.c2', 'obsidian55': None}   # None = 터치 장 없는 계열(한 판)

# ── 1. 합성 값으로 채우기 (원본 없이 도는 부분) — 계열마다 ───────────────────────
print('1. 합성 값 채우기 (계열: %s)' % ', '.join(FAM_SCHEMA))
for family, variant in [(f, v) for f in FAM_SCHEMA for v in ('base', 'touch')]:
    schema = FAM_SCHEMA[family]
    variant_label = '%s/%s' % (family, variant)
    vals = {}
    for k in schema['paras']:
        vals[k] = 'P_' + k
    for pre, t in schema['tables'].items():
        for row in t['rows']:
            for c in row['cells']:
                if c.get('key'):
                    vals[c['key']] = 'V_' + c['key']
    for k in schema['header']:
        vals[k] = 'H_' + k
    vals['feat4'] = ''            # 선택 줄 — 비면 문단째 지워진다
    vals['scope'] = '첫 줄\n둘째 줄'
    import base64
    from PIL import Image
    im = Image.new('RGB', (200, 100), (255, 0, 0))
    bio = io.BytesIO()
    im.save(bio, 'PNG')
    b64 = base64.b64encode(bio.getvalue()).decode()
    imgs = {'img_block': [{'b64': b64}]}
    r = client.post('/doc/product-spec-docx', json={'name': 'x', 'family': family, 'variant': variant, 'values': vals, 'images': imgs})
    variant_ = variant
    variant = variant_label           # 아래 메시지는 계열/판 이름으로
    check(r.status_code == 200, '%s: 200 이어야 (%s)' % (variant, r.status_code))
    d = Document(io.BytesIO(r.data))
    allxml = ''.join(el.xml for el in [d.element.body] + [s.header._element for s in d.sections])
    check('{{' not in allxml, '%s: 표식이 남으면 안 된다' % variant)
    texts = doc_texts(d)
    joined = '\n'.join(texts)
    check('P_feat3' in joined and 'P_feat4' not in joined, '%s: 빈 선택 줄(feat4)은 지워져야' % variant)
    check('V_tim.r1.c1' in joined, '%s: 타이밍 표 칸이 채워져야' % variant)
    if 'hdrKtkPn' in schema['header']:           # OBSIDIAN 머리글엔 KTK PN 이 없다(원본이 그렇다)
        check(any(t.startswith('H:') and 'H_hdrKtkPn' in t for t in texts), '%s: 머리글 KTK PN' % variant)
    check('첫 줄' in joined and '둘째 줄' in joined, '%s: 여러 줄 값' % variant)
    if TOUCH_PROBE[family]:
        has_touch = TOUCH_PROBE[family] in joined
        check(has_touch == (variant_ == 'touch'), '%s: 터치 장 유무' % variant)
    else:
        # (부품 표엔 'Touch Sensor'·'Touch Controller' 고정 줄이 있다 — 글로 보지 말고 터치 장 칸이 나오나로)
        check(not re.search(r'V_t(gen|perf|mech|pwr|com|glass)\.', joined), '%s: 터치 장 없는 계열 — 터치로 골라도 같은 양식' % variant)
    # 그림: img_block 하나만 들어가고 나머지 자리 그림은 지워진다 → 남는 그림 = 공통 정의 그림 + 1
    slots_left = sum(1 for dr in d.element.body.iter(qn('wp:docPr')) if (dr.get('descr') or '').startswith('slot:'))
    slots_left += sum(1 for im in d.element.body.iter('{urn:schemas-microsoft-com:vml}imagedata')
                      if (im.get('{urn:schemas-microsoft-com:office:office}title') or '').startswith('slot:'))
    check(slots_left == 0, '%s: 자리 그림이 남으면 안 된다(%d)' % (variant, slots_left))
    check('Picture img_block' in d.element.body.xml, '%s: img_block 그림이 들어가야' % variant)
    # 덧그림 — 그림이 빠진 문단(img_osdkey)의 덧그림 둘은 지워지고, 손으로 올린 그림(img_block, 원본 정보 없음)
    #   위의 양식 덧그림(STELLAR 흰 사각형 1)도 지워진다 — 남의 그림 위에 원본 제품 표시를 얹지 않는다(1-d 참고)
    #   (2026-11-24 실측: 그림 없이 남은 회색 사각형·빨간 점선 상자가 OSD 설명 글을 덮었다)
    WSP = '{http://schemas.microsoft.com/office/word/2010/wordprocessingShape}wsp'
    tpl_doc = Document(kb._PS_FAMILIES[family]['templates'][variant_])
    n_tpl = sum(1 for _ in tpl_doc.element.body.iter(WSP))
    n_out = sum(1 for _ in d.element.body.iter(WSP))
    # STELLAR: osdkey 2 + block 1 · OBSIDIAN: osdkey 2(제목 문단) + 외형도 흰 사각형 1 · OBSIDIAN 55": osdkey 2(같은 문단)
    n_drop = {'stellar': 3, 'obsidian': 3, 'obsidian55': 2}[family]
    check(n_out == n_tpl - n_drop, '%s: 덧그림 %d개만 지워져야 (양식 %d → %d)' % (variant, n_drop, n_tpl, n_out))
    # 쪽 끝에 장 제목만 남지 않게(2026-11-25 OBSIDIAN27 실측: 5.2·6·6.2·6.3 이 쪽 맨 아래에 홀로) — 제목엔 keepNext, 글머리표엔 없음
    kn = {}
    for p in d.element.body.iterchildren(qn('w:p')):
        t = ''.join(x.text or '' for x in p.iter(qn('w:t'))).strip()
        pPr = p.find(qn('w:pPr'))
        kn.setdefault(t, pPr is not None and pPr.find(qn('w:keepNext')) is not None)   # 같은 글이 두 번이면 첫 번째(6.1 의 ①)
    check(kn.get('Supply Video Timing Chart') and kn.get('LCD Panel Specifications') and kn.get('Screen Specification')
          and kn.get('Viewing Angle') and kn.get('Test Equipment Setup'), '%s: 장 제목·짧은 ① 제목에 다음 문단과 함께' % variant)
    check(any(k.startswith('Voltage') for k in kn) and not any(v for k, v in kn.items() if k.startswith('Voltage') or k.startswith('Contrast Ratio (CR)')),
          '%s: 글머리표·긴 ① 문장엔 안 건다' % variant)
    variant = variant_

# ── 1-d. OSD 키 그림 위 빨간 점선 상자 — 원본에 있었을 때만 (2026-11-25) ───────────────────
#   상자는 양식 원본 제품의 OSD 키 자리를 가리킨다. OBSIDIAN 계열 OSD 키 그림 106개 중 상자 있는 원본은 8개라
#   다른 제품 그림 위에 그대로 두면 엉뚱한 곳을 가리킨다. OBSIDIAN 은 상자가 **위 제목 문단**에 걸려 있다.
print('1-d. 덧그림(빨간 점선 상자)')


def _osd_box_count(d):
    """OSD 키 그림 문단 + 바로 앞 문단의 덧그림 수 — 그림 문단은 'Picture img_osdkey' 로 찾고, 없으면 'OSD Key' 제목 다음."""
    for e in d.element.body.iterchildren(qn('w:p')):
        if any((dp.get('name') or '') == 'Picture img_osdkey' for dp in e.iter(qn('wp:docPr'))):
            return len(kb._ps_overlays_near(e))
    return -1


for family in FAM_SCHEMA:
    for label, item, want in [('원본에 상자 있음(ov=2)', {'b64': b64, 'ov': 2}, 2),
                              ('원본에 상자 없음(ov=0)', {'b64': b64, 'ov': 0}, 0),
                              ('이 규칙 전 불러온 그림(cx만)', {'b64': b64, 'cx': 3000000, 'cy': 2000000}, 2),
                              ('손으로 올린 그림', {'b64': b64}, 0)]:
        r = client.post('/doc/product-spec-docx', json={'name': 'x', 'family': family, 'variant': 'base',
                                                        'values': {}, 'images': {'img_osdkey': [item]}})
        d = Document(io.BytesIO(r.data))
        n = _osd_box_count(d)
        check(n == want, '%s / %s: OSD 키 덧그림 %d개여야 (%d)' % (family, label, want, n))
    # 그림이 비면 상자도 없다(OBSIDIAN — 제목 문단에 걸린 것까지)
    r = client.post('/doc/product-spec-docx', json={'name': 'x', 'family': family, 'variant': 'base', 'values': {}, 'images': {}})
    d = Document(io.BytesIO(r.data))
    left = 0
    for e in d.element.body.iterchildren(qn('w:p')):
        t = ''.join(x.text or '' for x in e.iter(qn('w:t'))).strip()
        if t.startswith('OSD Key Description'):
            left = sum(1 for dr in e.iter(qn('w:drawing')) if dr.find(qn('wp:anchor')) is not None)
    check(left == 0, '%s: OSD 키 그림이 비면 제목 문단의 상자도 지워져야 (%d)' % (family, left))

schema = FAM_SCHEMA['stellar']      # 아래 1-b 는 STELLAR 양식으로

# ── 1-c. 빈 표 칸의 번호 목록 서식 (2026-11-25 실측: OBSIDIAN 개정 이력 빈 줄 요약 칸에 '①' 만 찍혔다) ──
if 'obsidian' in FAM_SCHEMA:
    print('1-c. 빈 표 칸 번호')
    r = client.post('/doc/product-spec-docx', json={'name': 'x', 'family': 'obsidian', 'variant': 'touch',
                                                    'values': {'rev.r3.c3': 'V_rev3'}})
    d = Document(io.BytesIO(r.data))
    from docx.table import Table as _T0
    rev_el = [el for el in d.element.body.iterchildren(qn('w:tbl'))][FAM_SCHEMA['obsidian']['tables']['rev']['index']]
    cells = [c for row in _T0(rev_el, d._body).rows for c in row.cells]
    numbered_empty = [c for c in cells if not c.text.strip() and c._tc.find('.//' + qn('w:numPr')) is not None]
    numbered_full = [c for c in cells if c.text.strip() == 'V_rev3' and c._tc.find('.//' + qn('w:numPr')) is not None]
    check(not numbered_empty, '빈 칸엔 번호 서식이 없어야 (%d칸)' % len(numbered_empty))
    check(len(numbered_full) == 1, '값이 있으면 원본처럼 번호 서식 그대로 (%d)' % len(numbered_full))

# ── 1-a. 파일 이름에 줄바꿈 (2026-11-25 실측: 고객 PN 칸이 두 줄이라 이름에 \r\n → 응답 헤더 거부 → HTTP 500) ──
print('1-a. 줄바꿈 든 파일 이름')
r = client.post('/doc/product-spec-docx', json={'name': 'P03_A_123-VAR2\r\n123-ALT3_MVD.docx', 'variant': 'base', 'values': {}})
check(r.status_code == 200, '줄바꿈 든 이름도 200 이어야 (%s)' % r.status_code)
cd = r.headers.get('Content-Disposition', '')
check('\r' not in cd and '\n' not in cd and 'VAR2' in cd, '내려받는 이름에 줄바꿈이 없어야 (%s)' % cd[:80])

# ── 1-b. 구조가 다른 사양서 읽기 (원본 없이 — 채운 문서를 일부러 비틀어 본다) ───────────────
#   (2026-11-25 실측: 위치로 읽던 파서는 원본 ~130개가 전부 일치율 50% 아래였다 — 장 하나·줄 하나만 달라도 밀렸다)
print('1-b. 구조가 다른 문서')
from docx.table import Table as _T  # noqa: E402
vals = {}
for k in schema['paras']:
    vals[k] = 'P_' + k
for pre, t in schema['tables'].items():
    for row in t['rows']:
        for c in row['cells']:
            if c.get('key'):
                vals[c['key']] = 'V_' + c['key']
vals['feat4'] = ''
r = client.post('/doc/product-spec-docx', json={'name': 'x', 'variant': 'base', 'values': vals})
d = Document(io.BytesIO(r.data))
body = d.element.body


def _ptext(el):
    return ''.join(x.text or '' for x in el.iter(qn('w:t')))


def _find_p(prefix):
    for el in body.iterchildren():
        if el.tag == qn('w:p') and _ptext(el).strip().startswith(prefix):
            return el
    raise AssertionError(prefix)


def _set_text(el, old, new):
    ts = list(el.iter(qn('w:t')))
    whole = ''.join(t.text or '' for t in ts)
    if old not in whole:
        raise AssertionError(old)
    ts[0].text = whole.replace(old, new, 1)      # 글이 여러 run 에 쪼개져 있다 — 첫 run 에 모은다
    for t in ts[1:]:
        t.text = ''


import copy  # noqa: E402
# ① 앞쪽에 장 하나(제목 + 표) 끼워 넣기 — 뒤가 전부 한 칸씩 밀린다
anchor = _find_p('Electrical Specification')
extra_p = copy.deepcopy(anchor)
_set_text(extra_p, 'Electrical Specification', 'Extra Chapter Inserted')
extra_t = copy.deepcopy(d.tables[3]._tbl)
anchor.addprevious(extra_p)
anchor.addprevious(extra_t)
# ② 계열마다 다른 장 이름 — 'Converter Board' → 'LED Driver'
_set_text(_find_p('Converter Board Specification'), 'Converter Board', 'LED Driver')
_set_text(_find_p('Converter Board Input Connector'), 'Converter Board', 'LED Driver')
# ③ VCP 표 첫 열(NO) 지우기 — 5열 → 4열
vcp_t = [t for t in d.tables if 'V_vcp.r1.c1' in _ptext(t._tbl)][0]
for tr in vcp_t._tbl.findall(qn('w:tr')):
    tr.remove(tr.findall(qn('w:tc'))[0])
grid = vcp_t._tbl.find(qn('w:tblGrid'))
grid.remove(grid.findall(qn('w:gridCol'))[0])
# ④ 개정 이력 표 마지막 행 지우기
rev_t = [t for t in d.tables if 'V_rev.r1.c0' in _ptext(t._tbl)][0]
rev_t._tbl.remove(rev_t._tbl.findall(qn('w:tr'))[-1])
bio = io.BytesIO()
d.save(bio)
pj = kb._ps_parse(bio.getvalue(), family='stellar')   # 비튼 STELLAR 문서를 STELLAR 양식으로 맞대 읽는 시험
v = pj['values']
check(pj['align']['ratio'] >= 0.9, '비튼 문서도 일치율 90%% 이상 (%s)' % pj['align'])
for k in ('pwrVoltage', 'pwrConnPn', 'lumYL', 'panelVendor', 'ledBar', 'adH1', 'adH10', 'vcpTitle', 'scope', 'feat3'):
    check(v.get(k, '').strip() == 'P_' + k, '끼운 장 뒤의 문단 %s 이 제자리 (%r)' % (k, v.get(k)))
check(v.get('feat4') == '', '없는 선택 줄은 빈 값 (%r)' % v.get('feat4'))
check(v.get('convIn', '').strip() == 'P_convIn', "'LED Driver' 이름도 convIn 으로 (%r)" % v.get('convIn'))
for k in ('tim.r3.c2', 'adp8.r5.c3', 'cvi.r2.c1', 'scr.r4.c1', 'adc.r3.c2'):
    check(v.get(k) == 'V_' + k, '표 칸 %s 제자리 (%r)' % (k, v.get(k)))
check(v.get('vcp.r1.c1') == 'V_vcp.r1.c1' and v.get('vcp.r5.c4') == 'V_vcp.r5.c4',
      '열 하나 빠진 VCP 표도 머리글로 열을 맞춘다 (%r, %r)' % (v.get('vcp.r1.c1'), v.get('vcp.r5.c4')))
check('vcp.r1.c0' in pj['skipped'] and 'vcp.r1.c0' not in v, '원본에 없는 열(NO)은 지어내지 않고 못 읽음으로')
check(any(s['table'] == 'vcp' for s in pj['shape']) and any(s['table'] == 'rev' for s in pj['shape']),
      '모양이 다른 표를 shape 로 드러낸다 (%s)' % pj['shape'])
check(v.get('rev.r4.c3') == 'V_rev.r4.c3' and 'rev.r5.c0' in pj['skipped'], '개정 이력: 있는 행은 읽고 없는 행은 못 읽음')
check(all(not str(x).startswith('V_') or str(x) == 'V_' + k for k, x in v.items()),
      '어떤 칸에도 남의 칸 값이 들어가지 않는다: %s' % [(k, x) for k, x in v.items() if str(x).startswith('V_') and str(x) != 'V_' + k][:5])

# ── 2. 원본 왕복 (인자로 원본을 준 경우만) ─────────────────────────────────────
srcs = sys.argv[1:]
if srcs:
    print('2. 원본 왕복:', len(srcs), '개')
for src in srcs:
    name = os.path.basename(src)
    with open(src, 'rb') as f:
        data = f.read()
    r = client.post('/doc/product-spec-parse', data={'file': (io.BytesIO(data), name)},
                    content_type='multipart/form-data')
    check(r.status_code == 200, '%s: parse 200' % name)
    pj = r.get_json()
    print('   %s → family=%s variant=%s, 값 %d · 그림 %d · 못 읽음 %s · 일치율 %s' % (
        name[-40:], pj.get('family'), pj['variant'], len(pj['values']), len(pj['images']), pj['skipped'], pj['align']))
    check(not pj.get('shape'), '%s: 고른 계열 양식과 표 모양이 같아야 %s' % (name, pj.get('shape')))
    check(pj['align']['ratio'] >= 0.95, '%s: 공통 글 일치율이 95%% 이상이어야' % name)
    check(not pj['skipped'], '%s: 못 읽은 칸이 없어야 %s' % (name, pj['skipped']))
    # 화면은 그림을 NAS 에 올리고 {folder,name,cx,cy} 로 보낸다 — 여기선 b64 로 같은 크기 정보를 싣는다
    imgs = {k: [dict({'b64': v['b64']}, **{x: v[x] for x in ('cx', 'cy', 'ph', 'pv', 'ov') if x in v})]
            for k, v in pj['images'].items()}
    check(all('ov' in v for v in pj['images'].values()), '%s: 그림마다 덧그림 수(ov)' % name)
    vml = {k for k, v in (FAM_SCHEMA.get(pj.get('family') or 'stellar', {}).get('images') or {}).items() if v.get('vml')}
    check(all(v.get('cx') and v.get('cy') for k, v in pj['images'].items() if k not in vml), '%s: 그림마다 원래 크기(cx,cy)' % name)
    check(isinstance(pj.get('layout'), list), '%s: 쪽 맞춤 빈 줄(layout)을 돌려줘야' % name)
    r2 = client.post('/doc/product-spec-docx', json={'name': 'rt', 'family': pj.get('family'), 'variant': pj['variant'],
                                                     'values': pj['values'], 'images': imgs,
                                                     'layout': pj.get('layout')})
    check(r2.status_code == 200, '%s: fill 200' % name)
    out = Document(io.BytesIO(r2.data))
    orig = Document(io.BytesIO(data))
    a, b = doc_texts(orig), doc_texts(out)
    norm = lambda xs: [re.sub(r'\s+', ' ', x).strip() for x in xs]
    a, b = norm(a), norm(b)
    diff = [(i, x, y) for i, (x, y) in enumerate(zip(a, b)) if x != y]
    check(len(a) == len(b), '%s: 글 문단 수 같아야 (%d vs %d)' % (name, len(a), len(b)))
    check(not diff, '%s: 글이 원본과 같아야 — 다른 곳 %d: %s' % (name, len(diff), diff[:5]))
    check(pictures(orig) == pictures(out), '%s: 그림 수 같아야 (%d vs %d)' % (name, pictures(orig), pictures(out)))
    # 덧그림(빨간 점선 상자·흰 사각형)도 원본과 같은 수 — 원본에 있던 건 남고 없던 건 안 생긴다
    WSP = '{http://schemas.microsoft.com/office/word/2010/wordprocessingShape}wsp'
    nw = lambda d: sum(1 for _ in d.element.body.iter(WSP))
    check(nw(orig) == nw(out), '%s: 도형 수 같아야 (%d vs %d)' % (name, nw(orig), nw(out)))
    lay = lambda d: kb._ps_layout_of(list(d.element.body.iterchildren()))
    check(lay(orig) == lay(out), '%s: 빈 줄(쪽 맞춤)까지 원본과 같아야' % name)
    keep = os.environ.get('PS_KEEP')
    if keep:
        open(os.path.join(keep, 'rt_' + name), 'wb').write(r2.data)

print('\n%d 통과 / %d 실패' % (ok, fail))
sys.exit(1 if fail else 0)
