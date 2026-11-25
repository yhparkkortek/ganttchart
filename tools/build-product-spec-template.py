# -*- coding: utf-8 -*-
"""📗 PRODUCT SPEC 원본 양식 만들기 (2026-11-24)

실제 사양서(.docx) 두 개 — 터치 없는 것(Topper/Upper 계열)과 터치 있는 것(Lower 계열) —
에서 **값 자리마다 표식(`{{칸}}`)을 박은 빈 양식**과 화면용 목록(JSON)을 뽑는다.

  py -3 -I tools/build-product-spec-template.py <터치없는.docx> <터치있는.docx> [templates]
  py -3 -I tools/build-product-spec-template.py --family obsidian <터치있는.docx> [templates]   (다른 계열 — 아래 FAMILY_CONFIGS)

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

    _finalize(doc)
    doc.save(out_docx)


def _finalize(doc):
    """공통 마무리 — OLE 원본·문서 속성·안 쓰는 그림 관계를 뗀다(원본 사진·작성자가 파일 속에 남지 않게)."""
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


# ══ 📚 다른 계열 양식 (2026-11-25) ════════════════════════════════════════════════════════
#   STELLAR 양식은 위의 **위치 목록**(TABLES/PARAS/IMAGES)으로 만든다. 다른 계열은 장·표 모양이 달라 그 목록을 못 쓴다 —
#   그래서 칸 짝은 **불러오기와 같은 맞대기**(백엔드 `_ps_parse(..., trace=True)`)로 STELLAR 칸에서 얻고, 같은 뜻이면
#   **같은 열쇠**를 붙인다(앱 자동값·📑 참고 사양서·불러오기가 계열과 상관없이 통한다). 짝이 없는 칸만 새 열쇠.
#   계열마다 다른 것(데이터)만 아래 FAMILY_CONFIGS 에 적는다 — 위치 숫자는 적지 않고 **글(제목)로** 찾는다.
FAMILY_CONFIGS = {
    'obsidian': {
        'outs': {'base': 'PRODUCT SPEC_양식_OBSIDIAN.docx', 'touch': 'PRODUCT SPEC_양식_OBSIDIAN_TOUCH.docx'},
        'schema': 'PRODUCT SPEC_schema_OBSIDIAN.json',
        # 터치 없는 판 = 이 제목부터 다음 장 제목 앞까지(구역 나눔째) 지운다 + 뒤 장의 손으로 쓴 번호를 하나 당긴다
        'touch': {'from': 'Touch Integrations', 'to': 'Incoming Inspection Standard', 'renumber': (12, 11)},
        # 커넥터 핀 표 = A/D 연결표 다음부터 이 제목 앞까지의 표(순서대로 adp1, adp2 …) — 제목은 바로 앞 글 문단
        'adpEnd': 'LED Driver Specification',
        # 문단 앞머리가 STELLAR 와 다른 칸
        'paraPrefix': {'convIn': r'(?:LED Driver|Converter Board) Input Connector\s*:\s*',
                       'convOut': r'(?:LED Driver|Converter Board) Output Connector\s*:\s*'},
        # 이 계열에선 값이 아니라 고정 글인 칸(OBSIDIAN 은 VCP 장 제목이 고객 이름 없는 'VCP Code Table')
        'skipParas': ['vcpTitle'],
        # 그림 칸 — (판, 열쇠, 기준 글, 방향(+1 뒤 / -1 앞), 도형 채움 그림인가)
        'images': [
            ('both', 'img_pwrconn', 'Input power connector pinout in the table below.', 1, False),
            ('both', 'img_block', 'Block Diagram', 1, False),
            ('both', 'img_adbd', 'A/D Board connector and dimension', 1, False),
            ('both', 'img_conv', 'LED Driver Dimension', 1, False),
            ('both', 'img_osdkey', 'OSD Key Description', 1, False),
            ('both', 'img_osdmenu', 'OSD Menu Structure', 1, False),
            ('touch', 'img_touchmech', 'Cover Glass Requirements', 1, False),
            # 외형도는 옛 방식(VML w:pict) 그림 + 그 위를 덮는 흰 사각형 도형 — 그림만 자리 그림으로(도형은 그대로)
            ('both', 'img_outline', 'Mechanical Specification', -1, 'vml'),
        ],
        'groups': [('1. Cover · Revision', 'TFT LCD MONITOR'), ('2~4. Scope · Features · Certification', 'Scope'),
                   ('5. Electrical Specification', 'Electrical Specification'), ('6. LCD Panel Specifications', 'LCD Panel Specifications'),
                   ('7. A/D Board', 'A/D Board'), ('8. LED Driver Specification', 'LED Driver Specification'),
                   ('9. User Interface', 'User Interface'), ('10. VCP Code Table', 'VCP Code Table'),
                   ('11. Touch Integrations', 'Touch Integrations'), ('Mechanical Specification', '@img_outline')],
        'sensitive': [r'\bTULW\d', r'\bTULIP\b', r'\bKM\d{3}[A-Z]{3}', r'\bPP\d{2}KT', r'\bXP\d{2}HD', r'Yeon\s*Ho',
                      r'(?i)obsidian', r'\bKTS\d{3}DPS', r'\bSMA?W200', r'\b62U020S', r'\b1102SB9', r'\bDC005-',
                      r'\b12505WR', r'\b12507WR'],
        'sensitiveDocOnly': [r'(?i)obsidian'],
    },
    # 55" P4(2026-11-25) — AC 전원·LED Driver/VCP/터치 장 없음·커넥터 10개·외형도 둘(아크릴 커버·메탈 프레임)
    'obsidian55': {
        'outs': {'base': 'PRODUCT SPEC_양식_OBSIDIAN55.docx', 'touch': 'PRODUCT SPEC_양식_OBSIDIAN55.docx'},
        'schema': 'PRODUCT SPEC_schema_OBSIDIAN55.json',
        'touch': None,                      # 터치 장이 없는 계열 — 한 판(터치 칸을 YES 로 해도 같은 양식)
        'adpEnd': 'User Interface',
        'paraPrefix': {},
        'skipParas': ['vcpTitle'],
        # Scope 가 두 문단(둘째 = '<모델> is a High quality …') — STELLAR 는 한 문단이라 앱 자동값(scope)엔 둘 다 들어 있다.
        #   그래서 둘째는 비면 지우는 선택 문단: 자동값으론 사라지고, 불러오면 원본 문장 그대로
        'extraParas': [('re:is a High quality TFT-LCD', '?scope2', 'Scope — 2nd paragraph')],
        # 기준 글이 're:' 로 시작하면 정규식(원본이 '5.3Block Diagram' 처럼 번호를 손으로 붙였다) · 방향 0 = 기준 문단 자신
        'images': [
            ('both', 'img_pwrconn', 'Input Power Connector', 1, False),
            ('both', 'img_block', 're:Block Diagram$', 1, False),
            ('both', 'img_adbd', 'A/D Board connector and dimension', 1, False),
            ('both', 'img_osdkey', 'OSD Key Description', 1, False),
            ('both', 'img_osdmenu', 'OSD Menu Structure', 1, False),
            ('both', 'img_outline', 'Mechanical Specification', 0, 'vml'),
            ('both', 'img_outline2', 'Outline Dimension (Metal frame)', -1, 'vml'),
        ],
        'imageLabels': {'img_outline': 'Outline Dimension (Acrylic cover)', 'img_outline2': 'Outline Dimension (Metal frame)'},
        'groups': [('1. Cover · Revision', 'TFT LCD MONITOR'), ('2~4. Scope · Features · Certification', 'Scope'),
                   ('5. Electrical Specification', 'Electrical Specification'), ('6. LCD Panel Specifications', 'LCD Panel Specifications'),
                   ('7. A/D Board', 'A/D Board'), ('8. User Interface', 'User Interface'),
                   ('Mechanical Specification', '@img_outline')],
        'sensitive': [r'(?i)obsidian', r'\bKTS\d{3}DGS', r'\b16065\d\d', r'\b16116\d\d', r'Yeon\s*Ho'],
        'sensitiveDocOnly': [r'(?i)obsidian'],
    },
}


def _blips(el):
    return list(el.iter('{%s}blip' % A_NS))


V_NS = 'urn:schemas-microsoft-com:vml'


def _vml_imgs(el):
    return list(el.iter('{%s}imagedata' % V_NS))


def _vml_slot(doc, p_el, key):
    """옛 방식(VML) 그림 — 바이트를 회색 자리 그림으로, `o:title` 을 `slot:<열쇠>` 로(원본 제목엔 PN 이 들어 있었다)."""
    n = 0
    for imd in _vml_imgs(p_el):
        shp = imd.getparent()
        st = shp.get('style') or ''
        wm = re.search(r'width:\s*([\d.]+)pt', st)
        hm = re.search(r'height:\s*([\d.]+)pt', st)
        w = float(wm.group(1)) * 4 / 3 if wm else 400
        h = float(hm.group(1)) * 4 / 3 if hm else 300
        rid, _img = doc.part.get_or_add_image(io.BytesIO(_placeholder_png(w / 2, h / 2)))
        imd.set('{%s}id' % R_NS, rid)
        imd.set('{%s}title' % O_NS, 'slot:%s' % key)
        n += 1
    return n


def _slot_drawings(p_el, key, shape_fill):
    """문단의 그림(또는 그림으로 채운 도형)을 회색 자리 그림 + `slot:<열쇠>` 로. 옛 Word 용 대체 그림(VML, mc:Fallback)은
    떼어 낸다 — 남겨 두면 원본 도면이 그쪽 관계로 파일 속에 남는다."""
    n = 0
    for dr in list(p_el.iter(qn('w:drawing'))):
        gd = dr.find('.//{%s}graphicData' % A_NS)
        if gd is None or not _blips(dr):
            continue
        if not (gd.get('uri', '').endswith('/picture') or shape_fill):
            continue
        ext = dr.find('.//' + qn('wp:extent'))
        cx, cy = int(ext.get('cx')), int(ext.get('cy'))
        yield_png = _placeholder_png(cx / 9525 / 2, cy / 9525 / 2)
        # 그림 속성의 원래 파일 이름도 지운다(실측: '<날짜>_<제품명> TSP.png' 가 남았다)
        for nv in dr.iter('{http://schemas.openxmlformats.org/drawingml/2006/picture}cNvPr'):
            nv.set('name', 'slot %s' % key)
            nv.set('descr', '')
        n += 1
        yield dr, yield_png
    MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
    for fb in list(p_el.iter('{%s}Fallback' % MC)):
        fb.getparent().remove(fb)


def build_family(src, fam, outdir):
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    import kortek_backend as kb
    cfg = FAMILY_CONFIGS[fam]
    raw = open(src, 'rb').read()
    tr = kb._ps_parse(raw, family='stellar', variant='touch', trace=True)['trace']
    st = kb._ps_load_schema('stellar')
    doc = Document(io.BytesIO(raw))
    body = list(doc.element.body.iterchildren())
    tbl_body = [i for i, el in enumerate(body) if el.tag == qn('w:tbl')]
    tbl_of_body = {bi: k for k, bi in enumerate(tbl_body)}

    def text_of(i):
        return _para_text(body[i]).strip() if body[i].tag == W_P else ''

    def find_text(t, start=0):
        rx = re.compile(t[3:]) if t.startswith('re:') else None
        for i in range(start, len(body)):
            if (rx.search(text_of(i)) if rx else text_of(i) == t):
                return i
        raise SystemExit('기준 글을 못 찾음: %r' % t)

    schema = {'version': 1, 'family': fam, 'tables': {}, 'paras': {}, 'images': {}, 'header': {}, 'labels': {}}
    ranges = {p: (r0, r1, c0, c1, when, title) for (_ti, p, title, (r0, r1), (c0, c1), when) in TABLES}

    # 1) 표 — 어느 원본 표가 어느 칸 묶음인가
    assign = {}           # prefix → 원본 표 번호
    for prefix, info in tr['tables'].items():
        if prefix.startswith('adp') or info.get('el') is None or prefix not in ranges:
            continue
        assign[prefix] = tbl_of_body[info['el']]
    adc_bi = tbl_body[assign['adc']]
    end_bi = find_text(cfg['adpEnd'])
    adp_bis = [bi for bi in tbl_body if adc_bi < bi < end_bi]
    adp_titles = []
    for k, bi in enumerate(adp_bis):
        assign['adp%d' % (k + 1)] = tbl_of_body[bi]
        j = bi - 1
        while j > 0 and not (body[j].tag == W_P and text_of(j)):
            j -= 1
        adp_titles.append(j)
    tables = doc.tables
    table_imgs = []
    for prefix, ti in sorted(assign.items(), key=lambda x: x[1]):
        base_pre = 'adp1' if prefix.startswith('adp') else prefix
        r0, r1, c0, c1, when, title = ranges[base_pre]
        if prefix.startswith('adp'):
            title = 'A/D connector %s' % prefix[3:]
        grid = _cell_grid(tables[ti])
        nrows = len(grid)
        r1 = nrows - 1 if r1 is ALL else min(r1, nrows - 1)
        inv = {}
        rowmap, colmap = {}, {}      # 이 표에서 찾은 원본 행·열 → STELLAR 행·열(짝 없는 칸도 같은 대응을 따른다)
        if not prefix.startswith('adp'):
            for key, (sr, sc) in (tr['tables'][prefix].get('cells') or {}).items():
                if sr < nrows and sc < len(grid[sr]):
                    inv[id(grid[sr][sc])] = key
                    mm = re.match(r'^[A-Za-z0-9]+\.r(\d+)\.c(\d+)$', key)
                    if mm:
                        rowmap.setdefault(sr, int(mm.group(1)))
                        colmap.setdefault(sc, int(mm.group(2)))
        used = set(inv.values())
        seen, rows_out = {}, []
        for r in range(nrows):
            cells_out, row_seen = [], set()
            for c, tc in enumerate(grid[r]):
                if id(tc) in row_seen:
                    continue
                row_seen.add(id(tc))
                cc1 = len(grid[r]) - 1 if c1 is ALL else c1
                is_val = r0 <= r <= r1 and c0 <= c <= cc1
                if id(tc) in seen:
                    cells_out.append({'fixed': '', 'merged': True})
                    continue
                if is_val and _blips(tc):
                    # 표 칸 안 그림(OSD 표 Figure 열) — 글 칸이 아니라 그림 칸
                    ik = 'img_%sfig%d' % (prefix, r)
                    seen[id(tc)] = ik
                    table_imgs.append((ik, tc, prefix, r, c, when))
                    cells_out.append({'fixed': '🖼'})
                    continue
                if is_val:
                    key = inv.get(id(tc))
                    if not key:
                        rr, cc = rowmap.get(r, r), colmap.get(c, c)
                        key = '%s.r%d.c%d' % (prefix, rr, cc)
                        if key in used:
                            key = '%s.r%d.c%d' % (prefix, r + 100, cc)
                        used.add(key)
                    seen[id(tc)] = key
                    _mark_cell(tc, '{{%s}}' % key)
                    cells_out.append({'key': key})
                else:
                    seen[id(tc)] = None
                    cells_out.append({'fixed': _para_text(tc).strip()})
            rows_out.append({'cells': cells_out})
        schema['tables'][prefix] = {'title': title, 'index': ti, 'when': when, 'bodyIndex': tbl_body[ti], 'rows': rows_out}
    for ti_, r, c, key in TABLE_LABEL_MARKS:
        tc = tables[assign['cover']].cell(r, c)._tc
        _mark_cell(tc, '{{%s}}' % key)
        schema['labels'][key] = {'table': assign['cover'], 'row': r, 'col': c}
        cell = schema['tables']['cover']['rows'][r]['cells'][c]
        cell.pop('fixed', None)
        cell['key'] = key

    # 2) 문단 — 맞대기로 찾은 자리(커넥터 제목은 표 순서대로)
    para_at = {}
    for _bi, prefix_re, key, label in PARAS:
        k = key.lstrip('?')
        if k in cfg['skipParas'] or k.startswith('adH'):
            continue
        if tr['paras'].get(k) is not None:
            para_at[key] = (tr['paras'][k], cfg['paraPrefix'].get(k, prefix_re), label)
    for n, j in enumerate(adp_titles):
        para_at['adH%d' % (n + 1)] = (j, None, 'A/D connector %d — title' % (n + 1))
    # 이 계열에만 있는 문단(STELLAR 짝 없음) — 기준 글로 찾는다. '?' 열쇠는 비면 문단째 지운다
    for anchor, key, label in cfg.get('extraParas') or []:
        para_at[key] = (find_text(anchor), None, label)
    # ⚠️ 원본에 없는 선택 줄(Features 4)은 **만들지 않는다** — 하나만 더해도 내용 요소 수가 원본과 달라져
    #    불러온 쪽 맞춤 빈 줄(layout)을 못 쓴다(실측). 그 계열 원본이 가진 줄만 둔다.
    marked = []
    for key, (at, prefix_re, label) in para_at.items():
        p = at if not isinstance(at, int) else body[at]
        text = _para_text(p)
        if prefix_re is None:
            _replace_span(p, 0, len(text), '{{%s}}' % key)
        else:
            m = re.match(prefix_re, text.lstrip())
            assert m, (fam, key, 'prefix not found', prefix_re, text[:40])
            lead = len(text) - len(text.lstrip())
            _replace_span(p, lead + m.end(), len(text), '{{%s}}' % key)
        marked.append((key, p, prefix_re, label))

    # 3) 머리글
    for sec in doc.sections:
        for hf in (sec.header, sec.footer, sec.first_page_header, sec.even_page_header):
            try:
                ps = list(hf._element.iter(W_P))
            except Exception:
                continue
            for p in ps:
                for rx, key in HEADER_MARKS:
                    text = _para_text(p)
                    m = re.search(rx, text)
                    if m and '{{' not in m.group(1):
                        _replace_span(p, m.start(1), m.end(1), '{{%s}}' % key)
                        schema['header'][key] = rx

    # 4) 그림
    labels = {k: v.get('label') for k, v in st['images'].items()}
    labels.update(cfg.get('imageLabels') or {})
    img_at = {}
    for when, key, anchor, step, shape_fill in cfg['images']:
        i = find_text(anchor)
        j, hit = i + step, None
        while 0 <= j < len(body) and abs(j - i) <= 4:
            if body[j].tag == W_P and (_vml_imgs(body[j]) if shape_fill == 'vml' else _blips(body[j])):
                hit = j
                break
            if step == 0:                  # 기준 문단 자신에 걸린 그림(P4 외형도는 장 제목 문단에 떠 있다)
                break
            j += step
        assert hit is not None, (fam, key, 'no picture near', anchor)
        if shape_fill == 'vml':
            cnt = _vml_slot(doc, body[hit], key)
            assert cnt, (fam, key, 'nothing slotted')
            img_at[key] = body[hit]
            schema['images'][key] = {'label': labels.get(key, key), 'when': when, 'count': cnt, 'vml': True}
            continue
        cnt = 0
        for dr, png in list(_slot_drawings(body[hit], key, shape_fill)):
            rid, _img = doc.part.get_or_add_image(io.BytesIO(png))
            for b in _blips(dr):
                b.set('{%s}embed' % R_NS, rid)
            docpr = dr.find('.//' + qn('wp:docPr'))
            docpr.set('descr', 'slot:%s' % key)
            docpr.set('name', 'slot %s' % key)
            cnt += 1
        assert cnt, (fam, key, 'nothing slotted')
        img_at[key] = body[hit]
        schema['images'][key] = {'label': labels.get(key, key), 'when': when, 'count': cnt}
        if shape_fill:
            schema['images'][key]['shapeFill'] = True
    for ik, tc, prefix, r, c, when in table_imgs:
        cnt = 0
        for dr, png in list(_slot_drawings(tc, ik, False)):
            rid, _img = doc.part.get_or_add_image(io.BytesIO(png))
            for b in _blips(dr):
                b.set('{%s}embed' % R_NS, rid)
            docpr = dr.find('.//' + qn('wp:docPr'))
            docpr.set('descr', 'slot:%s' % ik)
            docpr.set('name', 'slot %s' % ik)
            cnt += 1
        schema['images'][ik] = {'label': '%s figure (row %d)' % (schema['tables'][prefix]['title'], r), 'when': when,
                                'count': cnt, 'table': prefix, 'row': r, 'col': c}
    _finalize(doc)

    # 5) 두 판 — 터치 판은 그대로, 없는 판은 터치 장을 구역째 지운다
    def _write(d, path):
        d.save(path)

    def _index_schema(d, sc, variant):
        kids = list(d.element.body.iterchildren())
        pos = {id(el): i for i, el in enumerate(kids)}
        out = {}
        for key, p, prefix_re, label in marked:
            if id(p) in pos:
                out[key] = pos[id(p)]
        return pos, out

    outs = {v: os.path.join(outdir, cfg['outs'][v]) for v in ('touch', 'base')}
    _write(doc, outs['touch'])
    pos_t, para_t = _index_schema(doc, schema, 'touch')
    for key, p, prefix_re, label in marked:
        schema['paras'][key.lstrip('?')] = {'bodyIndex': para_t[key], 'label': label, 'prefix': prefix_re,
                                            'optional': key.startswith('?')}
    for key, el in img_at.items():
        schema['images'][key]['bodyIndex'] = pos_t[id(el)]
    for ik, tc, prefix, r, c, when in table_imgs:
        schema['images'][ik]['bodyIndex'] = schema['tables'][prefix]['bodyIndex']
    tbody = [i for i, el in enumerate(doc.element.body.iterchildren()) if el.tag == qn('w:tbl')]
    for t in schema['tables'].values():
        t['bodyIndex'] = tbody[t['index']]

    if cfg.get('touch') is None:
        _finish_family(cfg, doc, schema, outs, outdir)   # 터치 장이 없는 계열 — 한 판뿐
        return
    based = Document(outs['touch'])
    kids = list(based.element.body.iterchildren())
    texts = [(_para_text(el).strip() if el.tag == W_P else '') for el in kids]
    a, b = texts.index(cfg['touch']['from']), texts.index(cfg['touch']['to'])
    for el in kids[a:b]:
        based.element.body.remove(el)
    old, new = cfg['touch']['renumber']
    after_ids = set()
    for el in list(based.element.body.iterchildren()):
        if el.tag != W_P:
            continue
        ts = _texts(el)
        if ts and re.match(r'^\s*%d\.(\d)' % old, ts[0].text or ''):
            ts[0].text = re.sub(r'^(\s*)%d\.' % old, r'\g<1>%d.' % new, ts[0].text)   # 손으로 쓴 번호 '12.1'
        np_ = el.find(qn('w:pPr') + '/' + qn('w:numPr') + '/' + qn('w:numId'))
        if np_ is not None and kids.index(el) >= b:
            after_ids.add(np_.get(qn('w:val')))
    # 자동 번호 목록 중 **시작 번호를 장 번호로 정해 둔 것**(실측 'Inspection Criteria' 12.2 · 13.1 Outline) — 지운 장만큼 당긴다
    numbering = based.part.numbering_part.element
    absids = set()
    for n in numbering.findall(qn('w:num')):
        if n.get(qn('w:numId')) in after_ids:
            absids.add(n.find(qn('w:abstractNumId')).get(qn('w:val')))
            for so in n.iter(qn('w:startOverride')):
                v = int(so.get(qn('w:val')))
                if v >= old:
                    so.set(qn('w:val'), str(v - (old - new)))
    for an in numbering.findall(qn('w:abstractNum')):
        if an.get(qn('w:abstractNumId')) not in absids:
            continue
        for lvl in an.findall(qn('w:lvl')):
            st = lvl.find(qn('w:start'))
            if lvl.get(qn('w:ilvl')) == '0' and st is not None and int(st.get(qn('w:val'))) >= old:
                st.set(qn('w:val'), str(int(st.get(qn('w:val'))) - (old - new)))
    _write(based, outs['base'])
    kb_ = list(based.element.body.iterchildren())
    for key in img_at:
        if schema['images'][key]['when'] == 'touch':
            continue
        descr = 'slot:%s' % key
        for i, el in enumerate(kb_):
            if any((dp.get('descr') or '') == descr for dp in el.iter(qn('wp:docPr'))) \
                    or any((im.get('{%s}title' % O_NS) or '') == descr for im in _vml_imgs(el)):
                schema['images'][key]['bodyIndexByVariant'] = {'touch': schema['images'][key]['bodyIndex'], 'base': i}
                break
    _finish_family(cfg, doc, schema, outs, outdir)


def _finish_family(cfg, doc, schema, outs, outdir):
    """화면 묶음 + 칸 목록 쓰기 + 민감어 검사(판이 하나든 둘이든 같다)."""
    # 6) 화면 묶음 — 제목 글로(그림 기준이면 그 그림 자리)
    groups = []
    kt = list(doc.element.body.iterchildren())
    tt = [(_para_text(el).strip() if el.tag == W_P else '') for el in kt]
    for title, anchor in cfg['groups']:
        if anchor.startswith('@'):
            groups.append({'title': title, 'from': schema['images'][anchor[1:]]['bodyIndex']})
        else:
            groups.append({'title': title, 'from': tt.index(anchor)})
    schema['groups'] = groups
    sp = os.path.join(outdir, cfg['schema'])
    with io.open(sp, 'w', encoding='utf-8') as f:
        json.dump(schema, f, ensure_ascii=False, indent=1)

    pats = SENSITIVE_PATTERNS + cfg['sensitive']
    bad = []
    for v, p in outs.items():
        hits = _scan_sensitive(p, pats)
        if hits:
            bad.append((p, hits[:20]))
        print('%s  %dKB  %s' % (v, os.path.getsize(p) // 1024, 'OK' if not hits else 'SENSITIVE %d' % len(hits)))
    sj = io.open(sp, encoding='utf-8').read()
    for pat in pats:
        if pat in cfg.get('sensitiveDocOnly', []):
            continue                      # 칸 목록엔 계열 이름이 들어간다(그게 정상)
        if re.search(pat, sj):
            bad.append((sp, pat))
    if bad:
        for x in bad:
            print('!!', x)
        sys.exit(1)
    print('schema: %d tables, %d paras, %d images' % (len(schema['tables']), len(schema['paras']), len(schema['images'])))


def _scan_sensitive(path, patterns=None):
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
        for pat in (patterns or SENSITIVE_PATTERNS):
            for m in re.finditer(pat, txt):
                hits.append((n, m.group(0)))
    return hits


def main():
    if len(sys.argv) >= 4 and sys.argv[1] == '--family':
        # 📚 다른 계열: py -3 -I tools/build-product-spec-template.py --family obsidian <터치 있는 원본.docx> [templates]
        fam = sys.argv[2]
        outdir = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(__file__), '..', 'templates')
        build_family(sys.argv[3], fam, outdir)
        return
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
