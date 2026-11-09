# -*- coding: utf-8 -*-
"""💾 원본저장(.docx) — `/doc/docx` 검증.

  돌리는 법:  py -3 tests/test_doc_docx.py

  🎯 가짜가 **하나도 없다** — 진짜 Flask 라우트로 진짜 .docx 를 만들고,
     그걸 python-docx 로 **다시 열어** 제목·표가 들어갔는지 본다.
  ⚠️ 돌고 있는 5000번 프로세스는 건드리지 않는다(`app.test_client()`).
  ⚠️ NAS 에 아무 것도 쓰지 않는다(이 라우트는 읽기 전용이다).
"""
import io
import os
import sys

try:                       # cp949 콘솔에서 이모지가 죽지 않게
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PASS = []
FAIL = []


def ok(cond, what):
    (PASS if cond else FAIL).append(what)
    if not cond:
        print(u'  ❌ ' + what)


def main():
    print(u'\U0001f4be /doc/docx 검증')
    import kortek_backend
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    c = kortek_backend.app.test_client()

    # 화면이 넘겨주는 모양 그대로 (`_docToAoa` 의 출력)
    rows = [
        [u'Sample Report (시제품)'],
        [u'LNW>S32 KTS320DPS01', '', '', u'출력일: 2026-11-09'],
        [],
        [u'# 샘플 출고 이력'],
        [u'단계', u'회차', u'출고 일자', u'수량'],
        [u'PROTO A', u'1', u'2026-11-15', u'24'],
        [u'PROTO A', u'2', u'2026-12-01', u'12'],
        [],
        [u'시제품 제작의뢰서'],
        [u'프로젝트 코드', u'G2608OB'],
        [u'모델 담당자', u'박용훈'],
        [],
    ]

    res = c.post('/doc/docx', json={'name': u'260929_LNW_S32_Proto B_Sample Report_V00', 'rows': rows})
    ok(res.status_code == 200, u'응답 코드 %s' % res.status_code)
    ok('wordprocessingml' in (res.headers.get('Content-Type') or ''),
       u'Word 파일로 안 내려준다: %s' % res.headers.get('Content-Type'))
    cd = res.headers.get('Content-Disposition') or ''
    ok('.docx' in cd, u'파일 이름에 .docx 가 없다: %s' % cd)

    data = res.data
    ok(data[:2] == b'PK', u'zip(docx) 이 아니다')
    d = Document(io.BytesIO(data))

    # 📄 제목 — 첫 줄은 문서 제목이어야 한다
    heads = [p.text.strip() for p in d.paragraphs if p.style.name.startswith('Heading') or p.style.name == 'Title']
    ok(u'Sample Report (시제품)' in heads, u'문서 제목이 없다: %s' % heads[:4])
    ok(u'# 샘플 출고 이력' in heads, u'구역 제목이 없다: %s' % heads[:6])
    ok(u'시제품 제작의뢰서' in heads, u'두 번째 구역 제목이 없다')

    # 📋 표 — 구역마다 하나씩, 칸 내용 그대로
    ok(len(d.tables) == 3, u'표가 3개여야 한다(머리글·이력·의뢰서): %d' % len(d.tables))
    hist = [t for t in d.tables if t.rows[0].cells[0].text.strip() == u'단계']
    ok(len(hist) == 1, u'출고 이력 표를 못 찾았다')
    if hist:
        t = hist[0]
        ok(len(t.rows) == 3 and len(t.columns) == 4,
           u'이력 표 크기가 틀리다: %dx%d' % (len(t.rows), len(t.columns)))
        ok(t.rows[1].cells[0].text == u'PROTO A' and t.rows[2].cells[1].text == u'2',
           u'이력 칸 내용이 틀리다')
        ok(t.rows[1].cells[2].text == u'2026-11-15', u'날짜 칸이 틀리다')

    # 🔢 흐름 순서 — 제목 다음에 그 구역의 표가 와야 한다(원본과 같은 차례)
    flow = []
    for child in d.element.body.iterchildren():
        tag = child.tag.split('}')[-1]
        if tag == 'p':
            t = Paragraph(child, d).text.strip()
            if t:
                flow.append(('P', t))
        elif tag == 'tbl':
            flow.append(('T', Table(child, d).rows[0].cells[0].text.strip()))
    names = [x[1] for x in flow]
    try:
        i_hist = names.index(u'# 샘플 출고 이력')
        ok(flow[i_hist + 1][0] == 'T' and flow[i_hist + 1][1] == u'단계',
           u'구역 제목 바로 뒤에 그 표가 안 온다: %s' % (flow[i_hist + 1],))
    except ValueError:
        ok(False, u'흐름에서 구역 제목을 못 찾았다')

    # ⚠️ 빈 요청은 정직하게 400
    res = c.post('/doc/docx', json={'rows': []})
    ok(res.status_code == 400, u'빈 요청에 400 이 아니다: %s' % res.status_code)
    res = c.post('/doc/docx', json={})
    ok(res.status_code == 400, u'내용 없는 요청에 400 이 아니다')

    # ⚠️ 파일 이름은 업로드와 같은 규칙으로 거른다 — 경로 탈출 금지
    res = c.post('/doc/docx', json={'name': u'../../남의폴더/x', 'rows': rows})
    cd2 = res.headers.get('Content-Disposition') or ''
    ok(res.status_code == 200 and '..' not in cd2 and '/' not in cd2.split('filename')[-1],
       u'파일 이름으로 경로를 빠져나갈 수 있다: %s' % cd2)

    print(u'\n%s %d/%d' % (u'❌' if FAIL else u'✅', len(PASS), len(PASS) + len(FAIL)))
    for f in FAIL:
        print(u'   ❌ ' + f)
    return 1 if FAIL else 0


if __name__ == '__main__':
    sys.exit(main())
