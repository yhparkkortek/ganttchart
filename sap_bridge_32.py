# -*- coding: utf-8 -*-
# ══════════════════════════════════════════════════════════════
# SAP GUI Scripting 32비트 브릿지 (2026-09-14 신규)
#
# kortek_backend.py(64비트 Python)는 win32com.client.GetObject("SAPGUI")로 SAP GUI에
# 직접 붙을 수 없다 — SAP GUI Scripting의 COM 컴포넌트가 32비트로만 등록돼 있기 때문
# (레지스트리 HKLM\SOFTWARE\WOW6432Node\SAP\SAPGUI Front\...\Security 에만 존재, 64비트
# 레지스트리 뷰에는 없음 — 실사용 진단으로 확인: 64비트 Python에서는 GetObject("SAPGUI")가
# 항상 COM 오류 -2147221020(MK_E_SYNTAX, "SAPGUI 항목을 찾을 수 없음")로 실패했고, 32비트
# Python에서는 즉시 정상적으로 연결을 찾았다). 그래서 이 스크립트를 32비트 Python
# (`py -3-32`)으로 별도 프로세스 실행해서, 실제 COM 작업은 여기서만 하고 결과를 JSON 한 줄로
# stdout에 출력한다 — kortek_backend.py는 이 출력을 그대로 읽어서 응답에 실어 보낸다.
#
# 단독으로 두 번째 인자 없이 실행하면 "현재 SAP 화면"을 덤프한다. 특정 트랜잭션 전용
# 파서를 만들지 않고(화면 종류가 바뀔 때마다 코드를 또 고치지 않기 위해), 화면에 ALV
# 그리드가 있으면 그리드를, 없으면 보이는 라벨/입력필드 텍스트를 최대한 있는 그대로
# 덤프해서 AI(callAiBackend)에게 구조화를 맡긴다 — kortek_backend.py의 예전 설계를 그대로
# 옮겨온 것.
#
# 두 번째 인자로 "open_document"를 주면(세 번째 인자로 문서 타입, 예: P01) 다른 동작 —
# MM03에서 이미 열어둔 자재의 "문서 데이터" 탭에서 그 문서 타입 행을 찾아 열고, 첨부된
# 원본 파일을 더블클릭해서 연결된 프로그램(Acrobat 등)으로 바로 연다. 2026-09-14 실사용
# 화면 녹화(SAP GUI "기록 및 재생")로 얻은 정확한 컨트롤 ID를 일반화한 것 — 절대경로
# 대신 "화면 어디에 있든 ID에 특정 문자열이 포함된 컨트롤을 재귀 탐색"하는 방식을 써서,
# 자재 유형별로 화면 서브구조 번호(SUB2/SUB7 등)가 달라져도 최대한 버티도록 했다.
# 전제 조건: 사람이 미리 MM03에서 해당 자재를 조회해 "문서 데이터" 탭을 열어둔 상태여야
# 한다(자재 조회 자체는 자동화하지 않음 — 화면 구조를 몰라 추측하기보다, 이미 검증된
# "지금 열려 있는 화면을 조작"하는 설계를 그대로 따름).
# ══════════════════════════════════════════════════════════════
import sys
import json
import time

# 💡 [2026-09-14 버그수정] 이 스크립트는 kortek_backend.py가 subprocess.run(capture_output=True)로
# 실행한다 — stdout이 실제 콘솔이 아니라 파이프로 연결되면, Windows에서는 Python이 시스템 ANSI
# 코드페이지(한국어 Windows면 cp949)로 stdout 인코딩을 잡는 경우가 있다. 이 스크립트의 오류
# 메시지엔 "—"(em dash, U+2014) 같은 cp949로 표현 안 되는 문자가 섞여 있어서, print(json.dumps(...))
# 시점에 UnicodeEncodeError로 죽어버려 "예상치 못한 오류" 자리에 오히려 이 인코딩 오류 자체의
# traceback이 사용자에게 그대로 노출되는 사고가 실사용에서 발생했다(진짜 원인은 감춰지고 무관한
# 인코딩 오류만 보임). stdout/stderr를 UTF-8로 명시적으로 재설정해서 원천 차단한다.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')


def _get_sap_session():
    """이미 로그인돼 열려 있는 SAP GUI의 첫 번째 연결/세션을 가져온다."""
    import win32com.client
    try:
        sap_gui_auto = win32com.client.GetObject("SAPGUI")
    except Exception as e:
        hresult = None
        try:
            hresult = e.args[0] if e.args else None
        except Exception:
            pass
        if hresult == -2147221020:
            raise RuntimeError('SAP GUI Scripting이 아직 켜져 있지 않습니다(COM 오류 -2147221020/MK_E_SYNTAX — "SAPGUI" 항목을 찾을 수 없음). 확인해주세요: ① SAP GUI가 켜져 있고 로그인돼 있는지 ② SAP GUI 세션 안에서 Alt+F12 → 옵션(Options) → Accessibility & Scripting → Scripting → "스크립트 사용(Enable Scripting)" 체크 후 세션을 다시 열었는지. 그래도 안 되면 SAP 서버 쪽 파라미터(sapgui/user_scripting) 문제일 수 있어 사내 SAP 담당자(Basis) 확인이 필요합니다.')
        raise RuntimeError('SAP GUI Scripting 엔진을 찾지 못했습니다. SAP GUI가 켜져 있는지 확인하세요. (원본 오류: ' + str(e) + ')')
    application = sap_gui_auto.GetScriptingEngine
    if application.Children.Count == 0:
        raise RuntimeError('SAP GUI Scripting 엔진 연결에는 성공했지만, 열려 있는 SAP 연결(접속)이 없습니다 — SAP에 로그인해주세요.')
    connection = application.Children(0)
    if connection.Children.Count == 0:
        raise RuntimeError('SAP 연결은 있지만 열려 있는 세션(화면)이 없습니다.')
    return connection.Children(0)


def _sap_find_grid(container, depth=0):
    """창 트리를 재귀 탐색해 첫 번째 ALV 그리드(GuiShell, SubType=GridView)를 찾는다."""
    if depth > 12:
        return None
    try:
        children = container.Children
    except Exception:
        return None
    if children is None:
        return None
    for i in range(children.Count):
        child = children.Item(i)
        try:
            if child.Type == 'GuiShell' and child.SubType == 'GridView':
                return child
        except Exception:
            pass
        found = _sap_find_grid(child, depth + 1)
        if found is not None:
            return found
    return None


def _sap_dump_grid(shell):
    """ALV 그리드의 보이는 열/행을 탭 구분 텍스트로 변환. 응답 크기 보호를 위해 최대 500행."""
    try:
        col_ids = list(shell.ColumnOrder)
    except Exception:
        col_ids = []
    if not col_ids:
        return None
    titles = []
    for cid in col_ids:
        try:
            titles.append(shell.GetColumnTitle(cid) or cid)
        except Exception:
            titles.append(cid)
    total_rows = shell.RowCount
    row_count = min(total_rows, 500)
    lines = ['\t'.join(titles)]
    for r in range(row_count):
        cells = []
        for cid in col_ids:
            try:
                cells.append(str(shell.GetCellValue(r, cid)))
            except Exception:
                cells.append('')
        lines.append('\t'.join(cells))
    if total_rows > row_count:
        lines.append(f'... (총 {total_rows}행 중 {row_count}행만 표시)')
    return '\n'.join(lines)


def _sap_dump_fields(container, depth=0, max_depth=10):
    """그리드가 없는 화면(선택화면/상세화면 등)을 위한 대체 경로 — 라벨/입력필드 텍스트를
    보이는 순서대로 모아 평문으로 만든다."""
    lines = []
    if depth > max_depth:
        return lines
    try:
        children = container.Children
    except Exception:
        return lines
    if children is None:
        return lines
    for i in range(children.Count):
        child = children.Item(i)
        try:
            ctype = child.Type
        except Exception:
            continue
        if ctype in ('GuiLabel', 'GuiTextField', 'GuiCTextField', 'GuiComboBox', 'GuiCheckBox', 'GuiRadioButton'):
            try:
                text = (child.Text or '').strip()
                if text:
                    lines.append(text)
            except Exception:
                pass
        lines.extend(_sap_dump_fields(child, depth + 1, max_depth))
    return lines


def fetch_current_screen():
    session = _get_sap_session()
    wnd = session.findById('wnd[0]')
    try:
        title = wnd.Text
    except Exception:
        title = ''
    try:
        transaction = session.Info.Transaction
    except Exception:
        transaction = ''
    try:
        status_text = session.findById('wnd[0]/sbar').Text
    except Exception:
        status_text = ''

    grid = _sap_find_grid(wnd)
    if grid is not None:
        body = _sap_dump_grid(grid)
        source = 'grid'
    else:
        body = '\n'.join(_sap_dump_fields(wnd))
        source = 'fields'

    if not body:
        return {'ok': False, 'error': '현재 SAP 화면에서 읽을 수 있는 데이터를 찾지 못했습니다.'}

    header = f'[SAP 화면: {title}]\n[트랜잭션: {transaction}]\n'
    if status_text:
        header += f'[상태표시줄: {status_text}]\n'
    text = header + '\n' + body
    return {'ok': True, 'source': source, 'text': text}


# ── "문서 열기" (open_document) 전용 헬퍼 ─────────────────────────────
def _find_by_id_substring(container, substring, depth=0, max_depth=30, require_type=None):
    """창 트리를 재귀 탐색해 .Id에 특정 문자열이 포함된 첫 번째 컨트롤을 찾는다.
    절대경로(예: .../subSUB2:SAPLZ38MM_MATERIAL:3400/...)는 자재 유형에 따라 서브구조
    번호가 달라질 수 있어 깨지기 쉽다 — 대신 "그 컨트롤 고유의 기술 이름"만 알면 화면
    어디에 있든 찾아내는 이 방식이 더 안정적이다(2026-09-14, 실사용 녹화로 얻은 정확한
    ID의 마지막 구성요소만 잘라서 검색어로 사용).
    💡 [2026-09-14] "원본" 트리 컨트롤을 찾을 때, 같은 이름을 포함한 바깥쪽 컨테이너
    (예: GuiCustomControl `cntlCTL_FILES2`)가 실제 기능이 있는 안쪽 GuiShell보다 먼저
    걸려서 잘못 반환되는 문제가 실사용 테스트로 확인됨 — require_type='GuiShell'처럼
    타입까지 맞아야만 반환하도록 해서 이 문제를 막는다(다른 호출부는 기존과 동일하게
    타입 무관하게 첫 매치를 반환)."""
    try:
        cid = container.Id or ''
        type_ok = (require_type is None) or (getattr(container, 'Type', None) == require_type)
        if substring in cid and type_ok:
            return container
    except Exception:
        pass
    if depth > max_depth:
        return None
    try:
        children = container.Children
    except Exception:
        return None
    if children is None:
        return None
    for i in range(children.Count):
        try:
            child = children.Item(i)
        except Exception:
            continue
        found = _find_by_id_substring(child, substring, depth + 1, max_depth, require_type)
        if found is not None:
            return found
    return None


def _select_tab_if_present(wnd, id_substring):
    tab = _find_by_id_substring(wnd, id_substring)
    if tab is not None:
        try:
            tab.select()
        except Exception:
            pass


def _table_find_cell_by_exact_row_text(table, target_text):
    """GuiTableControl에 지금 화면에 렌더링된 셀들(GuiTableControl.Children)을 훑어서,
    텍스트가 target_text와 정확히 일치하는 셀을 찾는다. 컬럼의 정확한 필드명(DRAT-DOKAR
    등)을 몰라도 동작하도록 모든 셀을 다 검사 — "Ty." 컬럼이 몇 번째인지 몰라도 된다."""
    try:
        children = table.Children
    except Exception:
        return None
    if children is None:
        return None
    for i in range(children.Count):
        try:
            child = children.Item(i)
            text = (child.Text or '').strip()
        except Exception:
            continue
        if text.upper() == target_text.upper():
            return child
    return None


def open_document(doc_type):
    """MM03에서 이미 열려 있는 자재의 "문서 데이터" 탭에서, 지정한 문서 타입(예: 'P01')과
    일치하는 행을 찾아 열고, 그 문서의 "원본(Originals)" 파일을 더블클릭해서 연결된
    프로그램(Acrobat 등)으로 바로 연다."""
    doc_type = (doc_type or '').strip().upper()
    if not doc_type:
        raise RuntimeError('문서 타입을 지정해주세요 (예: P01).')

    session = _get_sap_session()
    wnd = session.findById('wnd[0]')

    # 1) "문서 데이터" 탭이 아직 선택 안 돼 있으면 선택 시도(이미 열려 있으면 조용히 통과).
    _select_tab_if_present(wnd, 'tabpZU04')
    time.sleep(0.3)

    # 2) 문서 목록 테이블 컨트롤을 화면 어디에 있든 찾는다.
    table = _find_by_id_substring(wnd, 'tblSAPLCV140SUB_DOC')
    if table is None:
        raise RuntimeError('"문서 데이터" 탭의 문서 목록을 화면에서 찾지 못했습니다 — MM03에서 해당 자재를 조회하고 "문서 데이터" 탭을 열어둔 상태인지 확인해주세요.')

    # 3) 화면에 보이는 행(스크롤 포함)을 훑어 어느 컬럼이든 doc_type과 정확히 일치하는
    #    셀을 찾는다 — 여러 페이지에 걸쳐 있을 수 있어 스크롤하며 반복 탐색.
    target_cell = None
    try:
        total_rows = table.RowCount
        visible_rows = table.VisibleRowCount or total_rows or 1
    except Exception:
        total_rows, visible_rows = 0, 1
    seen_positions = set()
    pos = 0
    while target_cell is None:
        if pos in seen_positions:
            break
        seen_positions.add(pos)
        try:
            table.FirstVisibleRow = pos
        except Exception:
            pass
        target_cell = _table_find_cell_by_exact_row_text(table, doc_type)
        if target_cell is not None:
            break
        pos += visible_rows
        if not total_rows or pos >= total_rows:
            break

    if target_cell is None:
        raise RuntimeError(f'"문서 데이터" 목록에서 문서 타입 "{doc_type}"를 찾지 못했습니다 — 화면에 보이는 Ty. 열 값과 정확히 일치해야 합니다.')

    # 4) 해당 셀에 포커스를 준 뒤 F2(VKey 2)로 "연다" — 실사용 녹화에서 확인한 패턴
    #    (setFocus → caretPosition → sendVKey 2, 더블클릭과 동일 효과).
    try:
        target_cell.setFocus()
        target_cell.caretPosition = 0
    except Exception:
        pass
    wnd.sendVKey(2)
    time.sleep(1.2)  # 새 문서 조회 화면이 그려질 시간

    # 5) "원본(Originals)" 탭(tabpTSFILES — 실사용 테스트로 확인, "전표 데이터" 탭인
    #    tabpTSMAIN과는 다름)이 기본으로 선택돼 있지 않을 수 있어 명시적으로 선택 시도
    #    (이전에 다른 탭을 보고 있었으면 문서를 새로 열어도 그 탭이 그대로 유지돼, 원본 탭
    #    하위 컨트롤이 아예 렌더링 트리에 없어 못 찾는 경우가 실제로 있었음).
    _select_tab_if_present(wnd, 'tabpTSFILES')

    # 💡 [2026-09-14] 실사용 테스트로 확인: 탭 전환 직후 곧바로 하위 컨트롤을 찾으면 화면이
    #    아직 다 그려지지 않았거나(찾지 못함) SAP GUI가 일시적으로 바쁜 상태라 COM 예외가
    #    나는 경우가 있었다 — 짧게 여러 번 재시도한다.
    tree = None
    last_err = None
    for attempt in range(5):
        time.sleep(0.6)
        try:
            tree = _find_by_id_substring(wnd, 'CTL_FILES', require_type='GuiShell')
        except Exception as e:
            last_err = e
            continue
        if tree is not None:
            break

    # "원본(Originals)" 트리 컨트롤을 찾아 첫 번째 첨부파일을 더블클릭 — SAP가 임시폴더
    #    (C:\temp)에 내려받은 뒤 연결된 프로그램(Acrobat 등)으로 자동으로 연다. 이 동작에
    #    수반되던 "SAP GUI 보안" 확인 팝업은 사용자가 SAP GUI 옵션에서 C:/temp/* 읽기+실행
    #    허용 규칙을 추가해서 더 이상 뜨지 않는 것을 실사용으로 확인함(2026-09-14).
    if tree is None:
        extra = f' (마지막 오류: {last_err})' if last_err else ''
        raise RuntimeError(f'문서 "{doc_type}"는 열었지만, "원본(Originals)" 파일 목록을 화면에서 찾지 못했습니다 — 이 문서에 첨부파일이 없거나 화면이 아직 그려지는 중일 수 있습니다.{extra}')

    try:
        node_keys = list(tree.GetAllNodeKeys())
    except Exception as e:
        raise RuntimeError(f'원본 파일 목록을 읽는 중 오류가 발생했습니다: {e}')
    if not node_keys:
        raise RuntimeError(f'문서 "{doc_type}"에 연결된 원본 파일이 없습니다.')

    first_key = node_keys[0]
    tree.selectNode(first_key)
    tree.doubleClickNode(first_key)

    return {'ok': True, 'docType': doc_type, 'message': f'문서 "{doc_type}"의 원본 파일을 열도록 요청했습니다. 잠시 후 연결된 프로그램(Acrobat 등)이 열립니다.'}


def main():
    try:
        import win32com.client  # noqa: F401  (설치 여부 확인용)
    except ImportError:
        print(json.dumps({'ok': False, 'error': '32비트 Python용 pywin32가 설치되지 않았습니다. kortek_backend.bat을 다시 실행하면 자동 설치됩니다(또는 수동: py -3-32 -m pip install pywin32).'}, ensure_ascii=False))
        return
    try:
        action = sys.argv[1] if len(sys.argv) > 1 else 'fetch_screen'
        if action == 'open_document':
            doc_type = sys.argv[2] if len(sys.argv) > 2 else ''
            result = open_document(doc_type)
        else:
            result = fetch_current_screen()
        print(json.dumps(result, ensure_ascii=False))
    except RuntimeError as e:
        print(json.dumps({'ok': False, 'error': str(e)}, ensure_ascii=False))
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({'ok': False, 'error': 'SAP 연결 중 예상치 못한 오류가 발생했습니다. (' + str(e) + ')'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
