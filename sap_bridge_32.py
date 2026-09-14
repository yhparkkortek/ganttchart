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
# ══════════════════════════════════════════════════════════════
import sys
import json


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


def main():
    try:
        import win32com.client  # noqa: F401  (설치 여부 확인용)
    except ImportError:
        print(json.dumps({'ok': False, 'error': '32비트 Python용 pywin32가 설치되지 않았습니다. kortek_backend.bat을 다시 실행하면 자동 설치됩니다(또는 수동: py -3-32 -m pip install pywin32).'}, ensure_ascii=False))
        return
    try:
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
