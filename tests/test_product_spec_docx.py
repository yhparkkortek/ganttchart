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

# ── 1. 합성 값으로 채우기 (원본 없이 도는 부분) ────────────────────────────────
print('1. 합성 값 채우기')
for variant in ('base', 'touch'):
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
    r = client.post('/doc/product-spec-docx', json={'name': 'x', 'variant': variant, 'values': vals, 'images': imgs})
    check(r.status_code == 200, '%s: 200 이어야 (%s)' % (variant, r.status_code))
    d = Document(io.BytesIO(r.data))
    allxml = ''.join(el.xml for el in [d.element.body] + [s.header._element for s in d.sections])
    check('{{' not in allxml, '%s: 표식이 남으면 안 된다' % variant)
    texts = doc_texts(d)
    joined = '\n'.join(texts)
    check('P_feat3' in joined and 'P_feat4' not in joined, '%s: 빈 선택 줄(feat4)은 지워져야' % variant)
    check('V_tim.r1.c1' in joined, '%s: 타이밍 표 칸이 채워져야' % variant)
    check(any(t.startswith('H:') and 'H_hdrKtkPn' in t for t in texts), '%s: 머리글 KTK PN' % variant)
    check('첫 줄' in joined and '둘째 줄' in joined, '%s: 여러 줄 값' % variant)
    has_touch = 'V_tperf.r1.c2' in joined
    check(has_touch == (variant == 'touch'), '%s: 터치 장 유무' % variant)
    # 그림: img_block 하나만 들어가고 나머지 자리 그림은 지워진다 → 남는 그림 = 공통 정의 그림 + 1
    slots_left = sum(1 for dr in d.element.body.iter(qn('wp:docPr')) if (dr.get('descr') or '').startswith('slot:'))
    check(slots_left == 0, '%s: 자리 그림이 남으면 안 된다(%d)' % (variant, slots_left))
    check('Picture img_block' in d.element.body.xml, '%s: img_block 그림이 들어가야' % variant)
    # 덧그림 — 그림이 들어간 문단(img_block)의 덧그림은 남고, 그림이 빠진 문단(img_osdkey)의 덧그림 둘은 지워진다
    #   (2026-11-24 실측: 그림 없이 남은 회색 사각형·빨간 점선 상자가 OSD 설명 글을 덮었다)
    WSP = '{http://schemas.microsoft.com/office/word/2010/wordprocessingShape}wsp'
    tpl_doc = Document(os.path.join(ROOT, 'templates', 'PRODUCT SPEC_양식%s.docx' % ('_TOUCH' if variant == 'touch' else '')))
    n_tpl = sum(1 for _ in tpl_doc.element.body.iter(WSP))
    n_out = sum(1 for _ in d.element.body.iter(WSP))
    check(n_out == n_tpl - 2, '%s: 그림 빠진 자리의 덧그림만 지워져야 (양식 %d → %d)' % (variant, n_tpl, n_out))

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
    print('   %s → variant=%s, 값 %d · 그림 %d · 못 읽음 %s · 일치율 %s' % (
        name[-40:], pj['variant'], len(pj['values']), len(pj['images']), pj['skipped'], pj['align']))
    check(pj['align']['ratio'] >= 0.95, '%s: 공통 글 일치율이 95%% 이상이어야' % name)
    check(not pj['skipped'], '%s: 못 읽은 칸이 없어야 %s' % (name, pj['skipped']))
    # 화면은 그림을 NAS 에 올리고 {folder,name,cx,cy} 로 보낸다 — 여기선 b64 로 같은 크기 정보를 싣는다
    imgs = {k: [dict({'b64': v['b64']}, **{x: v[x] for x in ('cx', 'cy', 'ph', 'pv') if x in v})]
            for k, v in pj['images'].items()}
    check(all(v.get('cx') and v.get('cy') for v in pj['images'].values()), '%s: 그림마다 원래 크기(cx,cy)' % name)
    check(isinstance(pj.get('layout'), list), '%s: 쪽 맞춤 빈 줄(layout)을 돌려줘야' % name)
    r2 = client.post('/doc/product-spec-docx', json={'name': 'rt', 'variant': pj['variant'],
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
    lay = lambda d: kb._ps_layout_of(list(d.element.body.iterchildren()))
    check(lay(orig) == lay(out), '%s: 빈 줄(쪽 맞춤)까지 원본과 같아야' % name)
    keep = os.environ.get('PS_KEEP')
    if keep:
        open(os.path.join(keep, 'rt_' + name), 'wb').write(r2.data)

print('\n%d 통과 / %d 실패' % (ok, fail))
sys.exit(1 if fail else 0)
