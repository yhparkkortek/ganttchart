# -*- coding: utf-8 -*-
"""📘 docs/user-manual.md → 배포용 Word(.docx) — 2026-11-21

    py -3 tools/manual-to-docx.py [입력.md] [출력.docx]

설명서의 **원본은 마크다운 한 벌**(docs/user-manual.md)이고 Word 는 거기서 만든다 — 두 벌로 두면 다음 수정 때 한쪽만 고쳐진다.
마크다운 부분집합만 읽는다: `#`~`####` 제목 · 문단 · `-`/`1.` 목록 · `| |` 표 · ``` 코드 · `>` 인용 · **굵게** · `코드` · [링크](주소).
⚠️ python-docx(백엔드 requirements 에 이미 있음) 만 쓴다. 이미지는 없다(사내 화면을 공개 저장소에 안 넣는다).
"""
import io
import os
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Cm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'docs', 'user-manual.md')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'KORTEK_PM_사용자_매뉴얼.docx')
FONT = '맑은 고딕'
ACCENT = RGBColor(0x2C, 0x5F, 0x8A)
GREY = RGBColor(0x66, 0x66, 0x66)

INLINE_RE = re.compile(r'(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))')


def set_font(run, size=None, bold=None, color=None, mono=False):
    run.font.name = 'Consolas' if mono else FONT
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    rfonts.set(qn('w:eastAsia'), 'Consolas' if mono else FONT)
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color


def add_inline(par, text, size=10.5, base_bold=False, color=None):
    """**굵게**·`코드`·[링크](주소)를 run 으로 나눠 넣는다. 링크는 글자만 남긴다(사내 문서 안 링크는 뜻이 없다)."""
    pos = 0
    for m in INLINE_RE.finditer(text):
        if m.start() > pos:
            set_font(par.add_run(text[pos:m.start()]), size, base_bold, color)
        tok = m.group(0)
        if tok.startswith('**'):
            set_font(par.add_run(tok[2:-2]), size, True, color)
        elif tok.startswith('`'):
            r = par.add_run(tok[1:-1])
            set_font(r, size - 0.5, base_bold, RGBColor(0x8A, 0x2B, 0x2B), mono=True)
        else:
            label = re.match(r'\[([^\]]+)\]', tok).group(1)
            set_font(par.add_run(label), size, base_bold, color)
        pos = m.end()
    if pos < len(text):
        set_font(par.add_run(text[pos:]), size, base_bold, color)


def shade(cell, hex_fill):
    tcpr = cell._element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    tcpr.append(shd)


def split_row(line):
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    return cells


def build(md_text, doc):
    lines = md_text.replace('\r\n', '\n').split('\n')
    i = 0
    first_h1 = True
    while i < len(lines):
        line = lines[i]
        s = line.rstrip()
        if not s.strip():
            i += 1
            continue
        if s.strip() == '---':
            i += 1
            continue
        # 코드 블록
        if s.strip().startswith('```'):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                buf.append(lines[i])
                i += 1
            i += 1
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.space_after = Pt(6)
            r = p.add_run('\n'.join(buf))
            set_font(r, 9.5, mono=True, color=RGBColor(0x33, 0x33, 0x33))
            shade_p(p, 'F3F5F7')
            continue
        # 제목
        m = re.match(r'^(#{1,4})\s+(.*)$', s)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 1 and first_h1:
                first_h1 = False
                t = doc.add_paragraph()
                t.alignment = WD_ALIGN_PARAGRAPH.CENTER
                t.paragraph_format.space_before = Pt(120)
                set_font(t.add_run(re.sub(r'^[^\w가-힣]+', '', text)), 26, True, ACCENT)
                i += 1
                # 제목 바로 밑 인용(> ...) 은 표지 설명으로
                while i < len(lines) and (lines[i].startswith('>') or not lines[i].strip()):
                    if lines[i].startswith('>'):
                        sub = doc.add_paragraph()
                        sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        add_inline(sub, lines[i][1:].strip(), 11, color=GREY)
                    i += 1
                doc.add_page_break()
                continue
            h = doc.add_heading(level=min(level, 4))
            add_inline(h, text, {1: 20, 2: 15, 3: 12.5, 4: 11}[level], True, ACCENT)
            if level == 1:
                h.paragraph_format.page_break_before = True
            i += 1
            continue
        # 표
        if s.strip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|?\s*:?-{2,}', lines[i + 1]):
            header = split_row(s)
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(split_row(lines[i]))
                i += 1
            ncol = len(header)
            table = doc.add_table(rows=1 + len(rows), cols=ncol)
            table.style = 'Table Grid'
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            for c, txt in enumerate(header):
                cell = table.rows[0].cells[c]
                cell.text = ''
                add_inline(cell.paragraphs[0], txt, 9.5, True, ACCENT)
                shade(cell, 'EEF6F7')
            for r_i, row in enumerate(rows, 1):
                for c in range(ncol):
                    txt = row[c] if c < len(row) else ''
                    cell = table.rows[r_i].cells[c]
                    cell.text = ''
                    add_inline(cell.paragraphs[0], txt.replace('<br>', '\n'), 9.5)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)
            continue
        # 인용
        if s.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].startswith('>'):
                buf.append(lines[i][1:].strip())
                i += 1
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            add_inline(p, ' '.join(b for b in buf if b), 10, color=RGBColor(0x44, 0x44, 0x44))
            shade_p(p, 'FFF8E1')
            continue
        # 목록
        m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', s)
        if m:
            indent = len(m.group(1).replace('\t', '    '))
            numbered = m.group(2)[0].isdigit()
            text = m.group(3)
            # 이어지는 들여쓴 줄은 같은 항목
            j = i + 1
            while j < len(lines) and lines[j].startswith(' ' * (indent + 2)) and not re.match(r'^\s*([-*]|\d+\.)\s+', lines[j]):
                text += ' ' + lines[j].strip()
                j += 1
            style = 'List Number' if numbered else 'List Bullet'
            if indent >= 2:
                style += ' 2'
            try:
                p = doc.add_paragraph(style=style)
            except KeyError:
                p = doc.add_paragraph(style='List Bullet')
            add_inline(p, text, 10.5)
            i = j
            continue
        # 문단(연속 줄 합치기)
        buf = [s.strip()]
        j = i + 1
        while j < len(lines) and lines[j].strip() and not re.match(r'^(#{1,4}\s|\s*([-*]|\d+\.)\s|\||>|```|---)', lines[j]):
            buf.append(lines[j].strip())
            j += 1
        p = doc.add_paragraph()
        add_inline(p, ' '.join(buf), 10.5)
        i = j


def shade_p(p, hex_fill):
    ppr = p._element.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    ppr.append(shd)


def main():
    md = io.open(SRC, encoding='utf-8').read()
    doc = Document()
    sec = doc.sections[0]
    sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
    sec.left_margin = sec.right_margin = Cm(2.0)
    sec.top_margin = sec.bottom_margin = Cm(2.0)
    st = doc.styles['Normal']
    st.font.name = FONT
    st.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)
    st.font.size = Pt(10.5)
    build(md, doc)
    footer = sec.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(footer.add_run('KORTEK PM — 사용자 매뉴얼 · 원본: docs/user-manual.md'), 8, color=GREY)
    doc.save(OUT)
    print('written', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
