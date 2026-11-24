# -*- coding: utf-8 -*-
"""📗 PRODUCT SPEC 원본 양식 만들기 (2026-11-24)

실제 사양서(.docx) 두 개 — 터치 없는 것(Topper/Upper 계열)과 터치 있는 것(Lower 계열) —
에서 **값 자리마다 표식(`{{칸}}`)을 박은 빈 양식**과 화면용 목록(JSON)을 뽑는다.

  py -3 -I tools/build-product-spec-template.py <터치없는.docx> <터치있는.docx> [templates]

만드는 것
  templates/PRODUCT SPEC_양식.docx         터치 장이 없는 판
  templates/PRODUCT SPEC_양식_TOUCH.docx   터치 장(Touch Controller)이 있는 판
  templates/PRODUCT SPEC_schema.json       화면(js/76)·불러오기(백엔드)가 같이 쓰는 칸 목록

원칙 (모델명세서·Sample Report 양식과 같다)
  · 원본의 모양(쪽 나눔·번호 매김·표 테두리·글꼴·머리글)은 **손대지 않는다** — 값만 비운다.
    번호 매김이 손으로 고친 흔적(literal "11.5", "12.")도 원본 그대로 둔다(같은 문서가 나와야 한다).
  · ⚠️ 이 저장소는 GitHub Pages 로 **공개**다 — 프로젝트 값(PN·모델명·고객·패널·핀배치·
    타이밍·VCP·도면 사진)은 전부 표식으로 바꾸고, 프로젝트 그림은 **회색 자리 그림**으로
    바꾼다(자리·크기·덧그림은 남는다). 회사 공통 내용(측정 방법·입고 검사 기준·정의 그림)만 남긴다.
  · 그림 칸은 `wp:docPr descr="slot:<열쇠>"` 로 표시 — 백엔드가 그 그림의 바이트만 갈아 끼운다.
  · 끝에 **민감어 검사**를 돈다 — 원본 값(PN 등)이 한 글자라도 남으면 실패로 끝낸다.

원본 파일은 저장소에 넣지 않는다(이 스크립트도 원본 값은 하나도 갖고 있지 않다 —
값을 지울 자리를 **위치**(본문 몇 번째 요소·몇 번째 표)로만 적는다).
"""
import copy
import io
import json
import os
import re
import sys
import zipfile

from docx import Document
from docx.oxml.ns import qn

W_T = qn('w:t')
W_R = qn('w:r')
W_P = qn('w:p')
A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
O_NS = 'urn:schemas-microsoft-com:office:office'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'

# ── 표 — 값 칸(행·열 범위). 머리글·항목 이름 열은 남긴다. ─────────────────────
#   (표 번호, 열쇠 앞머리, 화면 제목, 값 행 범위, 값 열 범위, 판)
#   판: 'both' | 'touch'(터치 판에만 있는 표)
ALL = None
TABLES = [
    (0, 'cover', 'Cover — KTK PN · Model · Customer PN', (1, 1), (0, 2), 'both'),
    (1, 'parts', 'Parts (Description · F/W · Vendor)', (1, 5), (1, 3), 'both'),
    (2, 'rev', 'Revision History', (1, 5), (0, 3), 'both'),
    (3, 'cert', 'International standard Certification', (2, 2), (0, 3), 'both'),
    (4, 'pwrpin', 'Input power connector pinout', (1, ALL), (0, ALL), 'both'),
    (5, 'tim', 'Supply Video Timing Chart', (0, ALL), (1, ALL), 'both'),
    (6, 'scr', 'Screen Specification', (1, ALL), (1, 1), 'both'),
    (7, 'va', 'Viewing Angle', (0, ALL), (4, 4), 'both'),
    (8, 'blu', 'Back Light Unit', (2, ALL), (2, 4), 'both'),
    (9, 'cie', 'CIE Coordinates (Color Chromaticity)', (2, 2), (1, 2), 'both'),
    (10, 'amr', 'Absolute rating of environment', (1, ALL), (2, 3), 'both'),
    (11, 'adc', 'A/D Board connection', (1, ALL), (0, ALL), 'both'),
    (12, 'adp1', 'A/D connector 1', (1, ALL), (0, ALL), 'both'),
    (13, 'adp2', 'A/D connector 2', (1, ALL), (0, ALL), 'both'),
    (14, 'adp3', 'A/D connector 3', (1, ALL), (0, ALL), 'both'),
    (15, 'adp4', 'A/D connector 4', (1, ALL), (0, ALL), 'both'),
    (16, 'adp5', 'A/D connector 5', (1, ALL), (0, ALL), 'both'),
    (17, 'adp6', 'A/D connector 6', (1, ALL), (0, ALL), 'both'),
    (18, 'adp7', 'A/D connector 7', (1, ALL), (0, ALL), 'both'),
    (19, 'adp8', 'A/D connector 8', (1, ALL), (0, ALL), 'both'),
    (20, 'adp9', 'A/D connector 9', (1, ALL), (0, ALL), 'both'),
    (21, 'adp10', 'A/D connector 10', (1, ALL), (0, ALL), 'both'),
    (22, 'cvi', 'Converter Board Input Connector', (1, ALL), (0, ALL), 'both'),
    (23, 'cvo', 'Converter Board Output Connector', (1, ALL), (0, ALL), 'both'),
    (24, 'osd', 'Function(OSD) Menu Actions', (1, ALL), (0, ALL), 'both'),
    (25, 'vcp', 'VCP Specification', (1, ALL), (0, ALL), 'both'),
    (26, 'tmech', 'Touch — Mechanical properties', (1, ALL), (2, 3), 'touch'),
    (27, 'tperf', 'Touch — Performance', (1, ALL), (2, 3), 'touch'),
    (28, 'tpwr', 'Touch — Power requirements', (1, ALL), (2, 3), 'touch'),
    (29, 'tgen', 'Touch — General TS Requirements', (1, ALL), (2, 2), 'touch'),
    (30, 'tcom', 'Touch — Controller Communication', (1, ALL), (2, 2), 'touch'),
    (31, 'tglass', 'Touch — Cover Glass Requirements', (1, ALL), (2, 2), 'touch'),
]
# 표 머리글 칸에 들어 있는 고객 전용 낱말 → 표식 (표 번호, 행, 열, 열쇠)
TABLE_LABEL_MARKS = [(0, 0, 2, 'custPnLabel')]

# ── 문단 — (본문 요소 번호, 앞에 남길 글(정규식) 또는 None=통째, 열쇠, 화면 이름) ──
#   번호는 두 원본(터치 있음/없음)이 0~269 까지 같다(실측).
PARAS = [
    (18, r'ISSUE DATE:\s*', 'issueDate', 'ISSUE DATE'),
    (61, None, 'scope', 'Scope'),
    (64, None, '?feat1', 'Features 1'),
    (65, None, '?feat2', 'Features 2'),
    (66, None, '?feat3', 'Features 3'),
    (67, None, '?feat4', 'Features 4'),
    (75, r'Voltage\s*:\s*', 'pwrVoltage', 'Input power — Voltage'),
    (76, r'Consumption\s*:\s*', 'pwrConsumption', 'Input power — Consumption'),
    (79, r'Connector PN\s*:\s*', 'pwrConnPn', 'Connector PN'),
    (80, r'Terminals PN\s*:\s*', 'pwrTermPn', 'Terminals PN'),
    (81, r'Cable\s*:\s*', 'pwrCable', 'Cable'),
    (107, r'◎\s*Vendor Name\s*:\s*', 'panelVendor', 'Panel vendor name'),
    (124, r'YL\s*=\s*', 'lumYL', 'Luminance of White (YL)'),
    (151, None, 'ledBar', 'LED light bar'),
    (187, None, 'adH1', 'A/D connector 1 — title'),
    (190, None, 'adH2', 'A/D connector 2 — title'),
    (193, None, 'adH3', 'A/D connector 3 — title'),
    (196, None, 'adH4', 'A/D connector 4 — title'),
    (199, None, 'adH5', 'A/D connector 5 — title'),
    (202, None, 'adH6', 'A/D connector 6 — title'),
    (205, None, 'adH7', 'A/D connector 7 — title'),
    (214, None, 'adH8', 'A/D connector 8 — title'),
    (217, None, 'adH9', 'A/D connector 9 — title'),
    (220, None, 'adH10', 'A/D connector 10 — title'),
    (230, r'Converter Board Input Connector\s*', 'convIn', 'Converter input connector'),
    (233, r'Converter Board Output Connector\s*:\s*', 'convOut', 'Converter output connector'),
    (265, None, 'vcpTitle', 'VCP Specification — title'),
]
# 머리글(header) — (정규식: 1번 그룹이 값, 열쇠)
HEADER_MARKS = [(r'Document revision No:\s*(\S+)', 'docRev'), (r'KTK PN:\s*(\S+)', 'hdrKtkPn')]

# ── 그림 칸 — (판, 본문 요소 번호, 열쇠, 화면 이름) — 프로젝트 그림만. 공통 정의 그림은 남긴다.
IMAGES = [
    ('both', 83, 'img_pwrconn', 'Input power connector (photo)'),
    ('both', 96, 'img_block', 'Block Diagram'),
    ('both', 181, 'img_adbd', 'A/D Board connector and dimension'),
    ('both', 228, 'img_conv', 'Converter Board Dimension'),
    ('both', 241, 'img_osdkey', 'OSD Key Description'),
    ('both', 251, 'img_osdmenu', 'OSD Menu Structure'),
    ('base', 356, 'img_outline_glass', 'Outline Dimension (GLASS)'),
    ('base', 393, 'img_outline', 'Outline Dimension'),
    ('touch', 275, 'img_touchboard', 'Touch — Board Dimension'),
    ('touch', 310, 'img_touchmech', 'Touch — Mechanical Drawing'),
    ('touch', 401, 'img_outline', 'Outline Dimension'),
]

# ── 화면 순서 — 본문 요소 번호 기준으로 섹션을 끊는다(제목, 그 섹션이 시작하는 요소 번호) ──
SCREEN_GROUPS = [
    ('1. Cover · Revision', 0),
    ('2~4. Scope · Features · Certification', 59),
    ('5. Electrical Specification', 71),
    ('6. LCD Panel Specifications', 103),
    ('7. A/D Board', 172),
    ('8. Converter Board Specification', 222),
    ('9. User Interface', 236),
    ('10. VCP Specification', 264),
    ('11. Touch Controller', 270),
    ('Mechanical Specification', 355),
]

# 원본 값이 남았는지 보는 민감어(원본에서 실측으로 뽑은 **값 모양**의 패턴 — 값 자체는 안 적는다).
#   · 6자리 KTK PN, 7자리-접미어 고객 PN, KTS/KTK 모델명, 고객 약칭·패널 부품명 모양
SENSITIVE_PATTERNS = [
    r'\b5\d{5}\b',                 # KTK PN (6자리, 5로 시작)
    r'\b\d{7}-[A-Z0-9]+\b',        # 고객 PN (7자리-접미어)
    r'\bKT[SK]\d{3}[A-Z]{3}\d{2}\b',   # KTK 모델명
    r'\bMV\d{3}[A-Z]{3}-',         # 패널 부품명
    r'\bADONIS\b', r'\bADLN\d', r'\bKCB-\d', r'\bFLAMINGO\b', r'STELLA',
    r'\bLNW\b', r'\bBOE\b', r'\bMolex\b', r'YEON', r'0x0914', r'\b303033\b',
]


def _texts(el):
    return [t for t in el.iter(W_T)]


def _para_text(p_el):
    return ''.join(t.text or '' for t in _texts(p_el))


def _replace_span(p_el, start, end, new):
    """문단 글의 [start,end) 를 `new` 로 — 여러 run 에 걸쳐 있어도 **첫 run 의 서식**을 그대로 쓴다."""
    pos = 0
    first = True
    for t in _texts(p_el):
        s = t.text or ''
        a, b = pos, pos + len(s)
        pos = b
        if b <= start or a >= end:
            continue
        lo, hi = max(start, a) - a, min(end, b) - a
        if first:
            t.text = s[:lo] + new + s[hi:]
            first = False
        else:
            t.text = s[:lo] + s[hi:]
        t.set(XML_SPACE, 'preserve')
    if first:          # 글이 없던 문단 — run 하나를 만든다
        _put_text(p_el, new)


def _put_text(p_el, text):
    r = p_el.find(W_R)
    if r is None:
        r = p_el.makeelement(W_R, {})
        rpr = p_el.find(qn('w:pPr'))
        mark = rpr.find(qn('w:rPr')) if rpr is not None else None
        if mark is not None:
            r.append(copy.deepcopy(mark))
        p_el.append(r)
    t = r.makeelement(W_T, {})
    t.text = text
    t.set(XML_SPACE, 'preserve')
    r.append(t)


def _mark_cell(tc, marker):
    """칸 글을 표식 하나로 — 첫 문단·첫 run 의 서식을 남기고 나머지 글은 지운다."""
    paras = tc.findall(W_P)
    if not paras:
        return
    keep = paras[0]
    for p in paras[1:]:
        tc.remove(p)
    for r in keep.findall(W_R)[1:]:
        keep.remove(r)
    r = keep.find(W_R)
    if r is None:
        _put_text(keep, marker)
        return
    for child in list(r):
        if child.tag != qn('w:rPr'):
            r.remove(child)
    t = r.makeelement(W_T, {})
    t.text = marker
    t.set(XML_SPACE, 'preserve')
    r.append(t)


def _cell_grid(tbl):
    """(행, 열) → tc. 병합 칸은 **같은 tc** 를 돌려준다(python-docx 와 같은 규칙)."""
    return [[c._tc for c in row.cells] for row in tbl.rows]


def _placeholder_png(w, h):
    from PIL import Image, ImageDraw
    w = max(40, min(800, int(w)))
    h = max(30, min(600, int(h)))
    im = Image.new('RGB', (w, h), (236, 239, 242))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], outline=(173, 181, 189))
    d.line([0, 0, w - 1, h - 1], fill=(206, 212, 218))
    d.line([0, h - 1, w - 1, 0], fill=(206, 212, 218))
    bio = io.BytesIO()
    im.save(bio, 'PNG')
    return bio.getvalue()


def _picture_drawings(p_el):
    out = []
    for dr in p_el.iter(qn('w:drawing')):
        gd = dr.find('.//{%s}graphicData' % A_NS)
        if gd is not None and gd.get('uri', '').endswith('/picture'):
            out.append(dr)
    return out


def build(src, variant, out_docx, schema):
    doc = Document(src)
    body = list(doc.element.body.iterchildren())
    tables = doc.tables

    # 1) 표
    for ti, prefix, title, (r0, r1), (c0, c1), when in TABLES:
        if when == 'touch' and variant != 'touch':
            continue
        tbl = tables[ti]
        grid = _cell_grid(tbl)
        nrows = len(grid)
        r1 = nrows - 1 if r1 is ALL else r1
        seen = {}
        rows_out = []
        for r in range(nrows):
            cells_out = []
            row_seen = set()
            for c, tc in enumerate(grid[r]):
                if id(tc) in row_seen:
                    continue          # 가로 병합 — 한 번만
                row_seen.add(id(tc))
                cc1 = len(grid[r]) - 1 if c1 is ALL else c1
                is_val = r0 <= r <= r1 and c0 <= c <= cc1
                if id(tc) in seen:     # 세로 병합의 이어지는 칸
                    cells_out.append({'fixed': '', 'merged': True})
                    continue
                if is_val:
                    key = '%s.r%d.c%d' % (prefix, r, c)
                    seen[id(tc)] = key
                    _mark_cell(tc, '{{%s}}' % key)
                    cells_out.append({'key': key})
                else:
                    seen[id(tc)] = None
                    cells_out.append({'fixed': _para_text(tc).strip()})
            rows_out.append({'cells': cells_out})
        schema['tables'][prefix] = {'title': title, 'index': ti, 'when': when, 'bodyIndex': None,
                                    'rows': rows_out}
    for ti, r, c, key in TABLE_LABEL_MARKS:
        tc = tables[ti].cell(r, c)._tc
        _mark_cell(tc, '{{%s}}' % key)
        schema['labels'][key] = {'table': ti, 'row': r, 'col': c}
        # 화면 목록의 그 머리글 칸도 표식 자리로
        for t in schema['tables'].values():
            if t['index'] == ti:
                cell = t['rows'][r]['cells'][c]
                cell.pop('fixed', None)
                cell['key'] = key

    # 표가 본문 몇 번째 요소인지 — 화면 묶음을 나눌 때 쓴다
    tbl_body_idx = [i for i, el in enumerate(body) if el.tag == qn('w:tbl')]
    for t in schema['tables'].values():
        if t['index'] < len(tbl_body_idx):
            t['bodyIndex'] = tbl_body_idx[t['index']]

    # 2) 문단
    for bi, prefix_re, key, label in PARAS:
        p = body[bi]
        assert p.tag == W_P, (variant, bi, 'not a paragraph')
        text = _para_text(p)
        if prefix_re is None:
            _replace_span(p, 0, len(text), '{{%s}}' % key)
        else:
            m = re.match(prefix_re, text.lstrip())
            assert m, (variant, bi, 'prefix not found', prefix_re)
            lead = len(text) - len(text.lstrip())
            _replace_span(p, lead + m.end(), len(text), '{{%s}}' % key)
        schema['paras'][key.lstrip('?')] = {'bodyIndex': bi, 'label': label, 'prefix': prefix_re,
                                            'optional': key.startswith('?')}

    # 3) 머리글(모든 구역)
    for sec in doc.sections:
        for hf in (sec.header, sec.footer, sec.first_page_header, sec.even_page_header):
            if hf is None:
                continue
            try:
                ps = hf._element.iter(W_P)
            except Exception:
                continue
            for p in ps:
                for rx, key in HEADER_MARKS:
                    text = _para_text(p)
                    m = re.search(rx, text)
                    if m and '{{' not in m.group(1):
                        _replace_span(p, m.start(1), m.end(1), '{{%s}}' % key)
                        schema['header'][key] = rx

    # 4) 그림 — 바이트만 회색 자리 그림으로, 자리·크기는 그대로
    for when, bi, key, label in IMAGES:
        if when == 'base' and variant != 'base':
            continue
        if when == 'touch' and variant != 'touch':
            continue
        p = body[bi]
        drs = _picture_drawings(p)
        assert drs, (variant, bi, key, 'no picture')
        for k, dr in enumerate(drs):
            ext = dr.find('.//' + qn('wp:extent'))
            cx, cy = int(ext.get('cx')), int(ext.get('cy'))
            png = _placeholder_png(cx / 9525 / 2, cy / 9525 / 2)
            rid, _img = doc.part.get_or_add_image(io.BytesIO(png))
            blip = dr.find('.//{%s}blip' % A_NS)
            blip.set('{%s}embed' % R_NS, rid)
            docpr = dr.find('.//' + qn('wp:docPr'))
            docpr.set('descr', 'slot:%s' % key)
            docpr.set('name', 'slot %s' % key)
        schema['images'][key] = {'bodyIndex': bi, 'label': label, 'when': when, 'count': len(drs)}

    # 5) 공통 그림의 OLE 원본(그림판 편집용 바이너리) 떼기 — 미리보기 그림은 남는다.
    for obj in doc.element.body.iter(qn('w:object')):
        for ole in list(obj.iter('{%s}OLEObject' % O_NS)):
            ole.getparent().remove(ole)

    # 6) 문서 속성 — 작성자 이름 지우기
    cp = doc.core_properties
    cp.author = ''
    cp.last_modified_by = ''
    cp.comments = ''
    cp.keywords = ''
    cp.subject = ''
    cp.category = ''
    # 원본 작성·인쇄 시각도 남기지 않는다(어느 프로젝트 문서에서 왔는지 드러난다)
    import datetime as _dt
    neutral = _dt.datetime(2026, 1, 1)
    cp.created = neutral
    cp.modified = neutral
    cp.last_printed = neutral
    cp.revision = 1

    # 7) 안 쓰는 그림·OLE 관계 떼기(원본 사진이 파일 속에 남지 않게)
    xml = doc.element.xml
    used = set(re.findall(r'r:(?:embed|id|link)="(rId\d+)"', xml))
    for rid, rel in list(doc.part.rels.items()):
        if rid in used:
            continue
        if rel.reltype.endswith('/image') or rel.reltype.endswith('/oleObject') or rel.reltype.endswith('/package'):
            del doc.part.rels[rid]

    doc.save(out_docx)


def _scan_sensitive(path):
    z = zipfile.ZipFile(path)
    hits = []
    for n in z.namelist():
        if not (n.endswith('.xml') or n.endswith('.rels')):
            if n.startswith('word/embeddings/'):
                hits.append(('embedding left', n))
            continue
        s = z.read(n).decode('utf-8', 'replace')
        # ⚠️ 글(<w:t>·<a:t>·문서 속성)만 본다 — 그림 위치(`wp:posOffset` 590550 같은 EMU 숫자)가
        #    6자리 PN 패턴에 걸리는 가짜 경보가 났다(실측).
        if n.startswith('docProps/'):
            txt = re.sub(r'<[^>]+>', ' ', s)
        else:
            txt = ' '.join(re.findall(r'<(?:w|a):t(?:\s[^>]*)?>([^<]*)</(?:w|a):t>', s))
            txt += ' ' + ' '.join(re.findall(r'(?:descr|title|name)="([^"]*)"', s))
        for pat in SENSITIVE_PATTERNS:
            for m in re.finditer(pat, txt):
                hits.append((n, m.group(0)))
    return hits


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    src_base, src_touch = sys.argv[1], sys.argv[2]
    outdir = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), '..', 'templates')
    outs = {'base': os.path.join(outdir, 'PRODUCT SPEC_양식.docx'),
            'touch': os.path.join(outdir, 'PRODUCT SPEC_양식_TOUCH.docx')}
    schema = {'version': 1, 'tables': {}, 'paras': {}, 'images': {}, 'header': {}, 'labels': {}}
    per = {}
    for variant, src in (('base', src_base), ('touch', src_touch)):
        sc = {'tables': {}, 'paras': {}, 'images': {}, 'header': {}, 'labels': {}}
        build(src, variant, outs[variant], sc)
        per[variant] = sc
    # 두 판을 합친 화면 목록 — 같은 열쇠는 한 번만(공통 표는 두 판이 같은 모양이다)
    for variant in ('base', 'touch'):
        for part in ('tables', 'paras', 'images', 'header', 'labels'):
            for k, v in per[variant][part].items():
                if k not in schema[part]:
                    schema[part][k] = v
                elif part == 'images' and schema[part][k].get('when') != v.get('when'):
                    schema[part][k]['when'] = 'both'
    schema['images']['img_outline']['bodyIndexByVariant'] = {
        'base': per['base']['images']['img_outline']['bodyIndex'],
        'touch': per['touch']['images']['img_outline']['bodyIndex']}
    schema['groups'] = [{'title': t, 'from': i} for t, i in SCREEN_GROUPS]
    sp = os.path.join(outdir, 'PRODUCT SPEC_schema.json')
    with io.open(sp, 'w', encoding='utf-8') as f:
        json.dump(schema, f, ensure_ascii=False, indent=1)

    bad = []
    for v, p in outs.items():
        hits = _scan_sensitive(p)
        if hits:
            bad.append((p, hits[:20]))
        print('%s  %dKB  %s' % (v, os.path.getsize(p) // 1024, 'OK' if not hits else 'SENSITIVE %d' % len(hits)))
    with io.open(sp, encoding='utf-8') as f:
        sj = f.read()
    for pat in SENSITIVE_PATTERNS:
        if re.search(pat, sj):
            bad.append((sp, pat))
    if bad:
        for b in bad:
            print('!!', b)
        sys.exit(1)
    print('schema: %d tables, %d paras, %d images' % (len(schema['tables']), len(schema['paras']), len(schema['images'])))


if __name__ == '__main__':
    main()
