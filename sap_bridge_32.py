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
# 네 번째 인자로 자재번호를 같이 주면(예: open_document P01 106188) 사람이 화면을 미리
# 열어둘 필요 없이 이 스크립트가 직접 MM03으로 이동해 그 자재를 조회한 뒤 "문서 데이터"
# 탭까지 연다(2026-09-15 실사용 화면 녹화로 추가 — `_navigate_to_material_document_tab`).
# 자재번호를 안 주면 기존과 동일하게 "사람이 미리 열어둔 화면"을 그대로 사용한다(하위호환).
#
# 두 번째 인자로 "download_documents_batch"를 주면(세 번째 인자로 문서 타입, 네 번째 인자로
# 쉼표구분 자재번호 목록) 여러 자재의 문서를 ZDMSR004("DMS 첨부파일 일괄 다운로드 프로그램")로
# 한 번에 `C:\SAP_DMS\`에 다운로드한다 — 자재 1개씩 MM03을 드릴다운하는 open_document보다
# 여러 개를 한 번에 처리할 때 훨씬 빠르다(2026-09-15 실사용 SAP GUI "기록 및 재생" 매크로로
# 확보한 정확한 컨트롤 ID 그대로 재현 — `download_documents_batch` 참고).
#
# 두 번째 인자로 "fetch_bom"을 주면(세 번째 인자로 자재번호, 네 번째 인자로 플랜트 — 생략 시
# 1000) ZPP038("BOM 전개")로 직접 이동해 그 자재의 BOM을 조회한 뒤 화면을 그대로 텍스트로
# 읽어온다(2026-09-15 실사용 매크로로 확보 — `fetch_bom`/`_navigate_to_bom_screen` 참고).
# ══════════════════════════════════════════════════════════════
import sys
import os
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
    """ALV 그리드의 보이는 열/행을 탭 구분 텍스트로 변환. 응답 크기 보호를 위해 최대 500행.
    ⚠️⚠️ [2026-09-15 실사용 진단] `shell.GetColumnTitle(cid)`는 `GuiGridView`에 실제로
    존재하는 메서드가 아니다(항상 예외 → 아래 except에서 원본 필드 코드 `cid`로 폴백) —
    "진짜" 메서드 이름은 `GetDisplayedColumnTitle(cid)`이지만, **의도적으로 이걸로 고치지
    않는다**: 실사용 SAP 세션에 직접 접속해 확인한 결과, 그 메서드가 반환하는 한글 텍스트가
    SAP GUI Scripting 내부에서 이미 복구 불가능하게 깨져서 나온다(Python에서 받은 문자열에
    유니코드 대체문자 U+FFFD가 섞여 있어 어떤 인코딩으로도 복구 불가 — Windows/SAP 세션
    코드페이지는 둘 다 정상인데도 발생, SAP GUI Scripting 자체의 한글 처리 버그로 추정).
    즉 "메서드 이름을 고치면" 코드(MTART 등, 최소한 읽을 순 있음) 대신 깨진 쓰레기 문자열이
    나오게 되므로 지금처럼 실패시키고 코드로 폴백하는 게 더 낫다 — 한글 헤더는 대신
    js/04h의 `window._SAP_FIELD_LABEL_MAP`(표준 SAP 필드명 사전)로 프런트엔드에서 치환한다.
    자세한 진단 과정은 CLAUDE.md의 "SAP GUI Scripting ALV 그리드의 한글이 원천적으로 깨져서
    나온다" 항목 참고."""
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


def _sap_find_shell_any(container, depth=0):
    """창 트리를 재귀 탐색해 SubType 무관하게 첫 번째 GuiShell을 찾는다(2026-09-15 신규) —
    `_sap_find_grid`는 SubType이 정확히 'GridView'인 것만 찾는데, 일부 화면(예: ZPP038의
    "부모-자식 계층" 표시 모드처럼 ALV가 트리로 나오는 경우 — "BOM 표준가 부모-자식
    계층.vbs" 매크로로 이런 표시 모드가 존재함을 확인함)은 GuiShell이지만 SubType이
    GridView가 아닐 수 있어, 그런 화면도 놓치지 않기 위한 더 넓은 탐색."""
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
            if child.Type == 'GuiShell':
                return child
        except Exception:
            pass
        found = _sap_find_shell_any(child, depth + 1)
        if found is not None:
            return found
    return None


def _sap_dump_tree(shell):
    """GridView가 아닌 GuiShell(Tree류로 추정)을 텍스트로 덤프해본다(2026-09-15 신규,
    ⚠️ 실사용 미검증 — SAP GUI Tree 컨트롤의 정확한 스크립팅 API는 버전/화면마다 다를 수
    있어 여러 방식을 순서대로 시도한다). 전부 실패하면 None을 반환해 호출부가
    `_sap_dump_fields`로 폴백할 수 있게 한다."""
    try:
        node_keys = list(shell.GetAllNodeKeys())
    except Exception:
        return None
    if not node_keys:
        return None

    col_names = []
    try:
        col_names = list(shell.GetColumnNames())
    except Exception:
        col_names = []

    lines = []
    if col_names:
        lines.append('\t'.join(str(c) for c in col_names))
    max_nodes = 500
    for key in node_keys[:max_nodes]:
        row_vals = []
        if col_names:
            for col in col_names:
                val = ''
                for attempt in ('GetItemText', 'GetCellValue'):
                    try:
                        val = str(getattr(shell, attempt)(key, col))
                        break
                    except Exception:
                        continue
                row_vals.append(val)
        else:
            val = ''
            for attempt_fn in (lambda: shell.GetNodeTextByKey(key), lambda: shell.GetItemText(key, '')):
                try:
                    val = str(attempt_fn())
                    break
                except Exception:
                    continue
            row_vals.append(val)
        if any(row_vals):
            lines.append('\t'.join(row_vals))
    if not lines or (col_names and len(lines) <= 1):
        return None  # 컬럼 제목행만 있고 실제 값을 하나도 못 읽었으면 실패로 간주
    if len(node_keys) > max_nodes:
        lines.append(f'... (총 {len(node_keys)}개 노드 중 {max_nodes}개만 표시)')
    return '\n'.join(lines)


def _sap_dump_screen_body(wnd):
    """현재 화면을 "그리드 → 트리 → 필드" 순서로 시도해 텍스트로 덤프하고 (본문, source)를
    반환한다(2026-09-15 신규 — fetch_current_screen/fetch_material_documents/fetch_bom이
    각자 반복하던 2단계 폴백 로직을 하나로 통합 + 트리 지원 추가). source는
    'grid'|'tree'|'fields' 중 하나, 아무것도 못 읽으면 (None, None)."""
    grid = _sap_find_grid(wnd)
    if grid is not None:
        body = _sap_dump_grid(grid)
        if body:
            return body, 'grid'

    shell = _sap_find_shell_any(wnd)
    if shell is not None:
        body = _sap_dump_tree(shell)
        if body:
            return body, 'tree'

    body = '\n'.join(_sap_dump_fields(wnd))
    if body:
        return body, 'fields'
    return None, None


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

    body, source = _sap_dump_screen_body(wnd)

    if not body:
        return {'ok': False, 'error': '현재 SAP 화면에서 읽을 수 있는 데이터를 찾지 못했습니다.'}

    header = f'[SAP 화면: {title}]\n[트랜잭션: {transaction}]\n'
    if status_text:
        header += f'[상태표시줄: {status_text}]\n'
    text = header + '\n' + body
    return {'ok': True, 'source': source, 'text': text}


# ── "BOM 조회" (ZPP038) 전용 헬퍼 ──────────────────────────────────────
def _navigate_to_bom_screen(session, wnd, materials, plant='1000', use_single_tcode=None,
                             explosion='single', show_price=False, show_location=False):
    """ZPP038("BOM 전개 (Multiple)", 복수 자재) 또는 ZPP033("BOM 전개", 단일 자재 전용)로
    이동해 지정한 자재(들)/플랜트의 BOM을 조회한다.
    **2026-09-15 신규**: 원래는 자재가 몇 개든 항상 ZPP038만 썼는데, 사용자가 실제 SAP 화면
    캡처(ZPP038 초기화면 — 붉은 박스로 "Explosion type"/"Option"을 표시)를 보여주며
    "복수 조회는 ZPP038, 단일 조회는 ZPP033을 쓴다"고 알려줘서 둘 다 지원하도록 확장함.
    라이브 세션에 `/nZPP038`·`/nZPP033`를 각각 띄워 직접 대조 진단한 결과: 자재 입력 필드만
    다르고(ZPP038: `ctxtMATNR-LOW` + "복수 선택" 팝업, ZPP033: `ctxtMATNR` 단일 필드) 나머지
    — 플랜트(`ctxtWERKS`)/대체BOM/계정레벨/효력시작일/기준수량, **Explosion type** 라디오
    버튼(`radR_1`="Single level" 기본선택, `radR_2`="Multi level"), **Option** 체크박스 중
    `chkSHOW_P`="Show price"/`chkSHOW_L`="Location Information" — 는 두 화면에서 완전히
    동일한 필드 ID로 확인됨(ZPP038엔 `chkP_MULTI`/`chkP_CK`가 더 있고 ZPP033엔 `chkP_STD`/
    `chkP_CUS`가 더 있지만, 이 함수가 다루는 세 옵션과는 무관).
    `use_single_tcode`(None|True|False) — None이면 `materials`가 리스트이고 2개 이상일 때
    자동으로 ZPP038(복수), 아니면 ZPP033(단일). 명시적으로 넘기면 자재 개수와 무관하게
    그걸 우선한다(사용자가 "복수"/"단일"을 말로 명시한 경우 `js/04h`가 판정해서 넘김).
    `explosion`은 `'single'`(기본, Single level) 또는 `'multi'`(Multi level).
    `show_price`/`show_location`은 Option 섹션의 두 체크박스 — AI 문답에서 조회 전에
    사람에게 먼저 물어보고(2026-09-15 사용자 요청, `js/04h`의 BOM 옵션 사전질문 참고) 그
    답을 받아 이 값들로 넘겨받는다.
    반환값: 실제로 사용된 `use_single_tcode`(bool, 자동 결정된 경우 호출부가 결과 라벨에
    쓸 수 있도록).
    ⚠️⚠️ ZDMSR004의 "자재코드 복수 선택" 팝업(필드명 `S_MATNR`)은 확인 버튼을 `btn[24]`,
    `btn[8]` 두 번 눌러야 했는데, 이 ZPP038의 팝업(필드명 `MATNR`, 접두사에 `S_` 없음 —
    SELECT-OPTIONS가 아니라 단순 PARAMETERS 필드로 추정)은 `btn[8]` 한 번만으로 충분했다
    (매크로로 확인) — 겉보기엔 같은 SAP 표준 SAPLALDB 팝업이라도 호출 맥락에 따라 필요한
    버튼 수가 다를 수 있다는 뜻이니, 새로운 트랜잭션의 복수 선택 팝업을 자동화할 때 이
    버튼 개수를 당연하게 가정하지 말고 매번 매크로로 확인할 것."""
    mat_list = list(materials) if isinstance(materials, (list, tuple)) else [materials]
    mat_list = [str(m).strip() for m in mat_list if str(m).strip()]
    if not mat_list:
        raise RuntimeError('자재번호를 지정해주세요.')
    if use_single_tcode is None:
        use_single_tcode = len(mat_list) <= 1

    session.findById('wnd[0]/tbar[0]/okcd').text = '/nZPP033' if use_single_tcode else '/nZPP038'
    wnd.sendVKey(0)
    time.sleep(0.6)
    wnd = session.findById('wnd[0]')

    # 💡⚠️ [2026-09-15 실사용에서 확인] "WERKS" 문자열이 "플랜트" 라벨 컨트롤
    # (`txt%_WERKS_%_APP_%-TEXT`)에도 걸려서, 단순 첫 매치(`_find_by_id_substring`)로는
    # 실제 입력칸(`ctxtWERKS`)이 아니라 이 라벨에 값을 넣고 "성공"으로 착각했었다 — 그 결과
    # 플랜트가 실제로는 비어 있어 실행(F8)이 SAP의 "필수 입력 필드" 오류로 조용히 막혔다
    # (사용자가 SAP 화면을 캡처해서 알려줘서 발견). `_set_text_on_best_candidate`로 후보를
    # 전부 모아 입력 가능한 타입부터 시도하도록 수정.
    plant_field = _set_text_on_best_candidate(wnd, 'WERKS', plant)
    # 플랜트 필드를 못 찾거나 값을 못 넣어도 일단 자재번호만으로 실행을 시도한다(플랜트가
    # 필수가 아닌 변형 화면일 수도 있어서) — 필수인데 비면 아래 실행(F8) 단계에서 SAP가
    # 화면에 오류를 표시하고, 그 경우 결과 화면에도 그리드가 없어 최종적으로 실패로 보고된다.

    if use_single_tcode:
        # ZPP033: 자재 필드가 `ctxtMATNR` 하나뿐(범위/복수 선택 없음) — 진단으로 확인됨.
        matnr_field = _find_by_id_substring(wnd, 'ctxtMATNR')
        if matnr_field is None:
            raise RuntimeError('ZPP033 화면에서 자재번호 입력 필드를 찾지 못했습니다 — 화면 구조가 예상과 다를 수 있습니다(트랜잭션 권한이 없을 가능성도 있음).')
        matnr_field.text = str(mat_list[0])
    elif len(mat_list) > 1:
        multi_btn = _find_by_id_substring(wnd, '%_MATNR_%_APP_%-VALU_PUSH')
        if multi_btn is None:
            raise RuntimeError('ZPP038 화면에서 자재코드 "복수 선택" 버튼을 찾지 못했습니다 — 화면 구조가 예상과 다를 수 있습니다.')
        multi_btn.press()
        time.sleep(0.8)
        try:
            table = session.findById(_SAP_MULTI_SELECT_POPUP_TABLE)  # 같은 SAP 표준 팝업 구조(SAPLALDB) 재사용
        except Exception:
            raise RuntimeError('"자재 복수 선택" 팝업의 입력 표를 찾지 못했습니다.')
        try:
            visible_rows = table.VisibleRowCount or 7
        except Exception:
            visible_rows = 7
        idx = 0
        while idx < len(mat_list):
            if idx > 0:
                try:
                    table.FirstVisibleRow = idx
                    time.sleep(0.3)
                except Exception:
                    pass
            batch = mat_list[idx: idx + visible_rows]
            for row_offset, mat in enumerate(batch):
                cell_id = f"{_SAP_MULTI_SELECT_POPUP_TABLE}/ctxtRSCSEL_255-SLOW_I[1,{row_offset}]"
                try:
                    cell = session.findById(cell_id)
                    cell.text = str(mat)
                except Exception as e:
                    raise RuntimeError(f'"자재 복수 선택" 팝업에 {idx + row_offset + 1}번째 자재("{mat}")를 입력하지 못했습니다: {e}')
            idx += len(batch)
        try:
            session.findById('wnd[1]/tbar[0]/btn[8]').press()  # 확인 — 이 팝업은 한 번만 눌러도 됨(위 주석 참고)
        except Exception as e:
            raise RuntimeError(f'"자재 복수 선택" 팝업을 확인하는 중 오류가 발생했습니다: {e}')
        time.sleep(0.5)
        wnd = session.findById('wnd[0]')
    else:
        matnr_field = _find_by_id_substring(wnd, 'MATNR-LOW')
        if matnr_field is None:
            raise RuntimeError('ZPP038 화면에서 자재번호 입력 필드를 찾지 못했습니다 — 화면 구조가 예상과 다를 수 있습니다(트랜잭션 권한이 없을 가능성도 있음).')
        matnr_field.text = str(mat_list[0])

    # Explosion type(Single/Multi level) — 라이브 진단으로 확인된 정확한 라디오버튼 ID.
    try:
        wnd.findById('usr/radR_2' if explosion == 'multi' else 'usr/radR_1').selected = True
    except Exception:
        pass
    # Option: Show price / Location Information 체크박스.
    try:
        wnd.findById('usr/chkSHOW_P').selected = bool(show_price)
    except Exception:
        pass
    try:
        wnd.findById('usr/chkSHOW_L').selected = bool(show_location)
    except Exception:
        pass

    try:
        session.findById('wnd[0]/tbar[1]/btn[8]').press()  # 실행(F8)
    except Exception as e:
        raise RuntimeError(f'BOM 전개 실행(F8) 중 오류가 발생했습니다: {e}')
    time.sleep(1.5)

    return use_single_tcode


def fetch_bom(materials, plant='1000', use_single_tcode=None, explosion='single',
              show_price=False, show_location=False):
    """자재 1개 또는 여러 개의 BOM(ZPP033 단일 또는 ZPP038 복수, "BOM 전개")을 조회해 화면을
    그대로 텍스트로 읽어온다. `materials`는 문자열(단일) 또는 리스트/튜플(복수). 결과 화면을
    "그리드 → 트리 → 필드" 순서로 시도해 읽는다(_sap_dump_screen_body) — ZPP038/ZPP033 둘 다
    "부모-자식 계층" 표시 모드에서 ALV가 트리로 나올 수 있음을 실사용으로 확인했고("BOM
    표준가 부모-자식 계층.vbs"), 트리 덤프(_sap_dump_tree)는 아직 실사용 검증 전이다.
    `use_single_tcode`/`explosion`/`show_price`/`show_location`은 그대로
    `_navigate_to_bom_screen`에 전달 — 2026-09-15 신규(사용자가 실제 ZPP038 화면 캡처로
    "Explosion type"/"Option" 옵션과 단일(ZPP033)/복수(ZPP038) 트랜잭션 분기를 요청)."""
    if not materials:
        raise RuntimeError('자재번호를 지정해주세요.')
    plant = (plant or '1000').strip()

    session = _get_sap_session()
    wnd = session.findById('wnd[0]')
    used_single = _navigate_to_bom_screen(session, wnd, materials, plant,
                                           use_single_tcode=use_single_tcode,
                                           explosion=explosion, show_price=show_price,
                                           show_location=show_location)
    wnd = session.findById('wnd[0]')

    body, source = _sap_dump_screen_body(wnd)

    mat_label = ', '.join(materials) if isinstance(materials, (list, tuple)) else str(materials)
    tcode_label = 'ZPP033' if used_single else 'ZPP038'

    if not body:
        return {'ok': False, 'error': f'자재 "{mat_label}"의 BOM 화면에서 읽을 수 있는 데이터를 찾지 못했습니다 — 자재번호/플랜트가 올바른지 확인해주세요.'}

    header = f'[SAP BOM 전개({tcode_label}): 자재 {mat_label}, 플랜트 {plant}]\n'
    text = header + '\n' + body
    return {'ok': True, 'source': source, 'materials': materials, 'tcode': tcode_label, 'text': text}


# ── "사용처 조회(역전개)" (CS15) 전용 헬퍼 ─────────────────────────────
def _navigate_to_where_used_screen(session, wnd, material, plant='1000'):
    """CS15("단일레벨 사용처리스트") — BOM 정전개(ZPP038, 이 자재가 뭘로 구성되는지)의 반대
    방향, 즉 "이 자재가 어느 상위 품목에 쓰이는지"를 조회한다. 2026-09-15 실사용 SAP GUI
    "기록 및 재생" 매크로("BOM 역전개(사용처리스트).vbs")로 얻은 컨트롤을 재현한 것 —
    단, 아래 두 가지는 그 매크로에서 확실하지 않아 주의가 필요하다:
    ⚠️⚠️ **자재번호 입력 필드가 이 매크로에 아예 안 나온다** — 녹화 당시 SAP가 이전 값을
    기억하고 있어서 사람이 따로 입력할 필요가 없었던 것으로 추정된다. 그래서 필드 ID는
    매크로에서 직접 확인된 게 아니라, 같은 화면의 체크박스 필드명(`RC29L-DIRKT`)에서
    구조 접두사(`RC29L`)를 유추해 "MATNR" 문자열이 포함된 컨트롤을 찾는 방식으로
    추측했다 — `_find_all_by_id_substring`으로 후보를 전부 모아 실제 입력 가능한 것부터
    시도(MM03 자재번호 필드 찾기와 같은 방어적 패턴). 이 추측이 틀렸다면 RuntimeError로
    명확히 실패한다(엉뚱한 자재로 조용히 조회되는 것보다 낫다).
    ⚠️⚠️ 매크로에는 실행(F8) 이후 `tbar[1]/btn[45]` 클릭 → SAP 표준 선택 팝업(SAPLSPO5)
    응답 → F4 → 다시 응답 → 뒤로가기 3번이 이어지는데, 이 시퀀스가 매크로에 있던 그대로는
    아니지만(정확한 의도는 여전히 불확실) — 2026-09-15 실사용에서 이와 관련된 진짜 필요한
    부분을 확인했다: 첫 F8 실행 뒤 일부 자재는 "사용처 리스트: 자재: 뷰"라는 중간 화면
    (wnd[0] 자체가 바뀜, wnd[1] 팝업 아님)으로 넘어가는데, 거기서 플랜트(`RC29L-WERKS`)를
    한 번 더 넣고 F8을 다시 눌러야 결과 그리드로 진입한다(아래 코드에서 처리) — 사용자가
    "104446 사용처 조회해줘"를 실행했을 때 결과가 비어 있던 실제 원인이었고, 그 사용자의
    멈춰있는 실제 SAP 세션에 직접 접속해 화면을 덤프하고 라이브로 값을 넣어보며 확정함."""
    session.findById('wnd[0]/tbar[0]/okcd').text = '/nCS15'
    wnd.sendVKey(0)
    time.sleep(0.6)

    candidates = _find_all_by_id_substring(wnd, 'MATNR')
    matnr_field = None
    last_err = None
    for cand in candidates:
        try:
            cand.text = str(material)
            matnr_field = cand
            break
        except Exception as e:
            last_err = e
            continue
    if matnr_field is None:
        raise RuntimeError(f'CS15 화면에서 자재번호 입력 필드를 찾지 못했습니다(마지막 오류: {last_err}) — 이 필드 ID는 실사용 녹화로 직접 확인된 게 아니라 추측한 것이라, 화면 구조가 다르면 실패할 수 있습니다.')

    # 💡 같은 함정(WERKS 문자열이 실제 입력칸 `ctxtWERKS`뿐 아니라 라벨 컨트롤에도 걸림) —
    # `_navigate_to_bom_screen`의 플랜트 필드 수정과 동일한 이유로 `_set_text_on_best_candidate` 사용.
    plant_field = _set_text_on_best_candidate(wnd, 'WERKS', plant)
    # 플랜트 필드가 없어도(매크로에도 없었음) 자재번호만으로 실행을 시도한다.

    dirkt_chk = _find_by_id_substring(wnd, 'RC29L-DIRKT')
    if dirkt_chk is not None:
        try:
            dirkt_chk.selected = True  # "직접 사용처만" — 매크로에서 확인된 설정
        except Exception:
            pass

    try:
        session.findById('wnd[0]/tbar[1]/btn[5]').press()  # 매크로에 있던 클릭 — 정확한 기능은 불명, 그대로 재현
    except Exception:
        pass

    try:
        session.findById('wnd[0]/tbar[1]/btn[8]').press()  # 실행(F8)
    except Exception as e:
        raise RuntimeError(f'CS15 실행(F8) 중 오류가 발생했습니다: {e}')
    time.sleep(1.5)

    # 💡⚠️ [2026-09-15 실사용 진단으로 확정] 위 첫 F8 실행 뒤, 일부 자재는(예: 104446)
    # "사용처 리스트: 자재: 뷰"라는 별도 중간 화면으로 넘어간다 — wnd[1] 팝업이 아니라
    # wnd[0] 자체가 이 화면으로 바뀌는 것이라(GuiTitlebar 확인), 아래의 wnd[1] 방어 코드로는
    # 전혀 안 잡혔다. 플랜트(`usr/ctxtRC29L-WERKS`)/품목 범주(`usr/ctxtRC29L-POSTP`)/용도
    # (`usr/ctxtRC29L-STLAN`)를 다시 묻는 화면인데, 사용자가 캡처해준 화면은 상태바에
    # "자재 104446의 용도에 대한 선택을 하지 않았습니다" 오류가 남아 있었다. 그 실제 멈춰있는
    # 세션에 직접 접속해 진단한 결과, "용도"(STLAN) 자체가 필수인 게 아니라 이 화면에서
    # 플랜트(WERKS)를 한 번 더 넣고 실행(F8, 첫 화면과 같은 `tbar[1]/btn[8]`)하면 그 오류 없이
    # 바로 결과 그리드로 정상 진입하는 것을 확인했다(그 오류 메시지는 플랜트도 용도도 둘 다
    # 비어 있던 이전 시도의 잔여 메시지로 추정). 모든 자재에서 이 중간 화면이 뜨는지는
    # 검증 안 됐으므로, 뜰 때만(=RC29L-WERKS 필드가 존재할 때만) 처리하고 안 뜨면 조용히
    # 건너뛴다(이미 결과 그리드로 넘어간 상태이므로).
    second_werks = _find_by_id_substring(wnd, 'RC29L-WERKS', require_type='GuiCTextField')
    if second_werks is not None:
        try:
            _set_text_on_best_candidate(wnd, 'WERKS', plant)
            session.findById('wnd[0]/tbar[1]/btn[8]').press()
            time.sleep(1.5)
        except Exception:
            pass

    # 방어적 팝업 처리(추측성 — 위 함수 설명 참고). 매크로의 SAPLSPO5 팝업 응답 시퀀스는
    # 재현하지 않고, 팝업이 뜨면 Enter만 시도한다.
    try:
        popup = session.findById('wnd[1]')
        if popup is not None:
            popup.sendVKey(0)
            time.sleep(0.5)
    except Exception:
        pass


def fetch_where_used(materials, plant='1000'):
    """자재 1개 또는 여러 개의 "사용처 리스트"(역전개, CS15)를 조회해 화면을 그대로 텍스트로
    읽어온다. `materials`는 문자열(단일) 또는 리스트/튜플(복수, 2026-09-15 신규).
    ⚠️⚠️ **`fetch_bom`(ZPP038)과 달리 복수 조회를 SAP 표준 "복수 선택" 팝업으로 한 번에
    묶지 않고, 자재마다 CS15를 따로 실행해서 결과를 이어붙인다** — 처음엔 회사 커스텀 배치
    리포트 ZPP046("자재 사용처 일괄조회")을 찾아 그 표준 복수 선택 팝업(S_MATNR)으로
    시도해봤고 실제로 4개 자재 전부 SELECT-OPTIONS에 정상 등록되는 것까지 확인했지만,
    실행 결과 자재 1개(104438)만 나오고 나머지 3개(104481/104477/117451)는 전혀 안 나오는
    문제가 발견됐다 — 원인은 `_sap_dump_grid`의 "응답 크기 보호용 500행 캡"이 **여러 자재가
    섞인 전체 결과 1803행 중 앞쪽 500행**만 잘라내는데, SAP이 자재번호(IDNRK)순으로 정렬해
    반환하다 보니 제일 앞선 자재(104438) 혼자 사용처가 500건을 넘어 그 캡을 다 차지해버려
    뒤에 오는 자재들의 결과가 통째로 잘려나간 것이었다(ZPP038 BOM은 자재 1개당 결과가
    보통 수십 행이라 이 문제가 거의 안 드러남 — 자재당 사용처가 수백 건까지 나올 수 있는
    CS15/ZPP046 특유의 문제). 자재마다 따로 실행하면 각자 500행 캡을 온전히 보장받으므로
    이 방식을 택함 — 대신 자재 수만큼 SAP 화면 전환이 필요해 더 느리다(최대 10개로 제한).
    진단 방법: `py -3-32`로 실제 세션에 접속해 `grid.RowCount`(전체 1803)와 `_sap_dump_grid`
    출력 길이(500행에서 끊김, 끝에 "... (총 1803행 중 500행만 표시)" 문구)를 대조해 확정함."""
    if not materials:
        raise RuntimeError('자재번호를 지정해주세요.')
    plant = (plant or '1000').strip()
    mat_list = list(materials) if isinstance(materials, (list, tuple)) else [materials]
    mat_list = [str(m).strip() for m in mat_list if str(m).strip()][:10]
    if not mat_list:
        raise RuntimeError('자재번호를 지정해주세요.')

    session = _get_sap_session()
    sections = []
    ok_count = 0
    for mat in mat_list:
        try:
            wnd = session.findById('wnd[0]')
            _navigate_to_where_used_screen(session, wnd, mat, plant)
            wnd = session.findById('wnd[0]')
            body, _source = _sap_dump_screen_body(wnd)
            if body:
                sections.append(f'[자재 {mat}]\n{body}')
                ok_count += 1
            else:
                sections.append(f'[자재 {mat}]\n(사용처 데이터를 찾지 못했습니다 — 자재번호가 올바른지, 혹은 이 자재를 사용하는 상위 품목이 실제로 없는지 확인해주세요.)')
        except Exception as e:
            sections.append(f'[자재 {mat}]\n(조회 실패: {e})')

    mat_label = ', '.join(mat_list)
    if ok_count == 0:
        return {'ok': False, 'error': f'자재 "{mat_label}"의 사용처 데이터를 찾지 못했습니다.'}

    header = f'[SAP 사용처 리스트(CS15, 역전개): 자재 {mat_label}]\n'
    text = header + '\n' + '\n\n'.join(sections)
    return {'ok': True, 'source': 'grid', 'materials': mat_list, 'text': text}


def fetch_where_used_batch(materials, plant='1000'):
    """ZPP046("자재 사용처 일괄조회" — 회사 커스텀 배치 리포트)으로 여러 자재의 사용처를
    SAP 서버 쪽에서 한 번에 묶어 조회한다. `fetch_where_used`(자재별 CS15 순차 실행)보다
    SAP 화면 전환이 한 번뿐이라 빠르지만, `_sap_dump_grid`의 "응답 크기 보호용 500행 캡"을
    **여러 자재 결과 전체가 공유**한다 — 사용처가 많은 자재 하나가 캡을 다 차지하면 나머지
    자재 결과가 통째로 잘려나갈 수 있다(2026-09-15 실사용 진단으로 확정된 제약, 자세한 내용은
    `fetch_where_used`의 ZPP046 관련 주석/CLAUDE.md 참고 — 실제로 자재 104438 하나가 500건
    넘는 사용처를 갖고 있어서 나머지 3개가 전부 잘리는 걸 재현·확인함). 그래서 이 함수는
    기본 동작이 아니라, 사용자가 "다중/일괄/복수"라고 명시적으로 말해 이 트레이드오프(빠름 vs
    잘릴 위험)를 감수하겠다는 의사를 밝혔을 때만 `js/04h`에서 호출한다 — 기본값은 여전히
    `fetch_where_used`(안전하지만 느림).
    ⚠️ 복수 선택 팝업(`tblSAPLALDBSINGLE`)의 한 화면 입력 행이 8개까지만 확인됐다(그 이상은
    스크롤이 필요한데 실사용 검증 안 됨, ZDMSR004와 동일한 제약) — 그래서 이 함수를 호출하는
    쪽(`kortek_backend.py`)에서 최대 8개로 자른다."""
    if not materials:
        raise RuntimeError('자재번호를 지정해주세요.')
    plant = (plant or '1000').strip()
    mat_list = list(materials) if isinstance(materials, (list, tuple)) else [materials]
    mat_list = [str(m).strip() for m in mat_list if str(m).strip()]
    if not mat_list:
        raise RuntimeError('자재번호를 지정해주세요.')

    session = _get_sap_session()
    session.StartTransaction('ZPP046')
    time.sleep(0.6)
    wnd = session.findById('wnd[0]')

    try:
        wnd.findById('usr/ctxtP_WERKS').text = plant
    except Exception:
        pass  # 플랜트 필드가 없어도 자재번호만으로 실행을 시도한다.

    if len(mat_list) == 1:
        try:
            wnd.findById('usr/ctxtS_MATNR-LOW').text = mat_list[0]
        except Exception as e:
            raise RuntimeError(f'ZPP046 자재번호 입력 필드를 찾지 못했습니다: {e}')
    else:
        try:
            wnd.findById('usr/btn%_S_MATNR_%_APP_%-VALU_PUSH').press()
            time.sleep(0.8)
            base = 'wnd[1]/usr/tabsTAB_STRIP/tabpSIVA/ssubSCREEN_HEADER:SAPLALDB:3010/tblSAPLALDBSINGLE/ctxtRSCSEL_255-SLOW_I[1,%d]'
            for i, mat in enumerate(mat_list):
                session.findById(base % i).text = mat
            session.findById('wnd[1]/tbar[0]/btn[8]').press()  # 실사용 확인 — ZPP038 BOM과 동일하게 단일 버튼으로 충분
            time.sleep(0.5)
        except Exception as e:
            raise RuntimeError(f'ZPP046 복수 자재 입력 중 오류가 발생했습니다: {e}')

    wnd = session.findById('wnd[0]')
    try:
        wnd.findById('tbar[1]/btn[8]').press()  # 실행(F8)
    except Exception as e:
        raise RuntimeError(f'ZPP046 실행(F8) 중 오류가 발생했습니다: {e}')
    time.sleep(2.0)

    wnd = session.findById('wnd[0]')
    body, source = _sap_dump_screen_body(wnd)
    mat_label = ', '.join(mat_list)
    if not body:
        return {'ok': False, 'error': f'자재 "{mat_label}"의 사용처 데이터를 찾지 못했습니다 — 자재번호/플랜트가 올바른지 확인해주세요.'}

    header = f'[SAP 사용처 일괄조회(ZPP046): 자재 {mat_label}]\n'
    text = header + '\n' + body
    return {'ok': True, 'source': source, 'materials': mat_list, 'text': text}


# ── "승인원 표지 생성" 전용 헬퍼 ────────────────────────────────────────
# 💡 [2026-09-15 신규] 사용자가 회사에서 쓰던 별도 데스크톱 앱("연구소 가이드 시스템",
# PyInstaller로 배포된 Python/Tkinter 앱)의 exe를 주고 "이 기능을 AI 문답에도 추가해달라"고
# 요청해서, 그 exe를 pyinstxtractor-ng로 풀고 main.pyc를 marshal로 읽어 바이트코드/상수를
# 분석해서(디컴파일러가 Python 3.13을 지원 안 해서 완전한 소스 복원은 안 됐지만, 함수
# docstring·상수 풀·바이트코드 흐름만으로 로직을 충분히 재구성함) 그 앱의 "승인원 표지 생성"
# 기능(GuiApp._approval_* 메서드들)을 그대로 재현한 것. 아래 로직은 원본 앱의 실제 동작과
# 최대한 동일하게 맞췄다 — 필드 ID(`wnd[0]/usr/ctxtRMMG1-MATNR`)·VKey(30)·탭 ID
# (`tabpZU05`)·소트박스 타입 목록(`_APV_VALUE_TYPES`)까지 전부 원본 바이트코드에서 그대로
# 확인한 값이다.
_APV_VALUE_TYPES = ('GuiTextField', 'GuiCTextField', 'GuiComboBox', 'GuiTextEdit')


def _approval_find_value(root, needles):
    """화면을 훑어서 needles 중 하나가 ID에 들어간 '입력칸'을 찾아 값을 돌려준다(원본 앱의
    `_approval_find_value`를 그대로 재현). 요소 ID 전체 경로를 코드에 박지 않는 이유: SAP
    화면이 회사마다 커스터마이징되어 있어 경로가 제각각이고, 화면이 바뀌어도 필드 이름
    (MAKTX, MATKL 등)만 그대로면 계속 동작하게 하려는 것 — needles는 앞에 올수록 우선순위가
    높다(예: 'MARA-MATKL'을 먼저 찾고, 없으면 'MATKL'로 넓혀서 찾는다)."""
    hits = {}

    def walk(obj, depth=0):
        if depth > 14:
            return
        try:
            otype = obj.Type
            oid = obj.Id
        except Exception:
            return
        if otype in _APV_VALUE_TYPES:
            up = (oid or '').upper()
            for n in needles:
                if n.upper() in up and n not in hits:
                    try:
                        hits[n] = (obj.Text or '').strip()
                    except Exception:
                        pass
        try:
            cnt = obj.Children.Count
        except Exception:
            return
        for i in range(cnt):
            try:
                walk(obj.Children.Item(i), depth + 1)
            except Exception:
                continue

    walk(root)
    for n in needles:
        if n in hits:
            return hits[n]
    return ''


def _approval_read_long_text(session):
    """'기본 데이터 텍스트' 탭(tabpZU05)의 여러 줄 설명(Sub-Description)을 읽는다. 화면
    전체를 뒤지면 상단 툴바 같은 엉뚱한 Shell을 잡아서 'SAP.Toolbar.1' 같은 값이 나올 수
    있어(원본 앱 주석 그대로), `wnd[0]/usr` 안쪽만 훑고 Id가 'SAP.'로 시작하는 툴바류는
    걸러낸다."""
    try:
        usr = session.findById('wnd[0]/usr')
    except Exception:
        return ''
    shell = _sap_find_shell_any(usr)
    if shell is None:
        return ''
    try:
        if (shell.Id or '').startswith('SAP.'):
            return ''
    except Exception:
        pass
    try:
        return (shell.Text or '').strip()
    except Exception:
        return ''


def _approval_read_one_material(session, wnd, material):
    """자재 하나의 승인원 표지 정보를 SAP에서 읽어온다(원본 앱 `_approval_read_one` 재현).
    반환: {'code','ok','desc','sub','matkl','sap_group','err'}."""
    out = {'code': material, 'ok': False, 'desc': '', 'sub': '', 'matkl': '', 'sap_group': '', 'err': ''}
    try:
        try:
            session.StartTransaction('MM03')
        except Exception:
            # StartTransaction이 없는 구버전 SAP GUI 대비 폴백(이 프로젝트의 기존 방식).
            session.findById('wnd[0]/tbar[0]/okcd').text = '/nMM03'
            wnd.sendVKey(0)
        time.sleep(0.6)

        candidates = _find_all_by_id_substring(wnd, 'RMMG1-MATNR')
        matnr_field = None
        for cand in candidates:
            try:
                cand.text = str(material)
                matnr_field = cand
                break
            except Exception:
                continue
        if matnr_field is None:
            out['err'] = '자재번호 입력 필드를 찾지 못했습니다.'
            return out
        wnd.sendVKey(0)
        time.sleep(1.0)

        # 뷰 선택 팝업 등 방어적 처리(추측성 — MM03 직접조회 경로와 동일 패턴).
        try:
            popup = session.findById('wnd[1]')
            if popup is not None:
                popup.sendVKey(0)
                time.sleep(0.6)
        except Exception:
            pass

        try:
            sbar = session.findById('wnd[0]/sbar')
            if getattr(sbar, 'MessageType', '') in ('E', 'A'):
                out['err'] = (sbar.Text or '자재를 찾을 수 없습니다.').strip() or '자재를 찾을 수 없습니다.'
                return out
        except Exception:
            pass

        usr = session.findById('wnd[0]/usr')
        out['desc'] = _approval_find_value(usr, ['MAKT-MAKTX', 'MAKTX'])
        out['matkl'] = _approval_find_value(usr, ['MARA-MATKL', 'MATKL'])
        out['sap_group'] = _approval_find_value(usr, ['T023T-WGBEZ', 'WGBEZ'])

        wnd.sendVKey(30)  # 원본 앱이 쓰는 정확한 VKey — "추가 데이터" 화면을 버튼 클릭 없이 곧장 연다.
        time.sleep(0.9)
        _select_tab_if_present(wnd, 'tabpZU05')  # "기본 데이터 텍스트" 탭(tabpZU04 "문서 데이터"와는 다름)
        time.sleep(0.8)
        out['sub'] = _approval_read_long_text(session)

        out['ok'] = True
        return out
    except Exception as e:
        out['err'] = f'자재 조회 실패 ({e})'
        return out


def fetch_approval_info(materials):
    """여러 자재의 승인원 표지 정보를 SAP에서 순서대로 읽어온다. materials는 자재번호
    문자열 리스트(최대 30개 — 원본 앱과 동일한 상한)."""
    materials = [str(m).strip() for m in (materials or []) if str(m).strip()][:30]
    if not materials:
        raise RuntimeError('자재번호를 지정해주세요.')

    session = _get_sap_session()
    wnd = session.findById('wnd[0]')

    results = []
    for material in materials:
        results.append(_approval_read_one_material(session, wnd, material))
    return {'ok': True, 'results': results}


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


def _find_all_by_id_substring(container, substring, depth=0, max_depth=30, results=None):
    """`_find_by_id_substring`과 달리 첫 매치에서 멈추지 않고 .Id에 substring이 포함된
    모든 컨트롤을 순서대로 모아 반환한다. 같은 ID 문자열이 실제 입력 필드가 아닌 다른
    컨트롤(매치코드/히스토리 아이콘 등)에도 들어있어 첫 매치가 틀릴 수 있는 경우, 호출부가
    "찾은 것들을 순서대로 하나씩 시도"할 수 있게 하기 위한 용도(2026-09-15 신규 —
    자재번호 필드 자동 입력 중 첫 매치가 .text를 설정할 수 없는 컨트롤이라 COM 오류
    "Property 'Item.text' can not be set."가 난 문제를 방어하려고 추가)."""
    if results is None:
        results = []
    try:
        cid = container.Id or ''
        if substring in cid:
            results.append(container)
    except Exception:
        pass
    if depth > max_depth:
        return results
    try:
        children = container.Children
    except Exception:
        return results
    if children is None:
        return results
    for i in range(children.Count):
        try:
            child = children.Item(i)
        except Exception:
            continue
        _find_all_by_id_substring(child, substring, depth + 1, max_depth, results)
    return results


def _set_text_on_best_candidate(wnd, substring, value, prefer_types=('GuiCTextField', 'GuiTextField')):
    """`_find_all_by_id_substring`로 후보를 전부 모아, `prefer_types` 순서로 우선 정렬한 뒤
    실제로 `.text` 대입이 되는 첫 번째 후보를 찾아 값을 넣는다(2026-09-15 신규 — 실사용
    진단으로 확정된 함정: SAP 선택화면은 입력 필드 ID 옆에 "라벨" 역할을 하는 컴패니언
    컨트롤(예: `txt%_WERKS_%_APP_%-TEXT`, 실제 입력칸 `ctxtWERKS`와 별개)을 같은 ID
    문자열로 만들어두는 경우가 흔하다 — 첫 매치(보통 이 라벨)에 값을 넣으면 예외 없이
    "성공"하지만 실제 입력칸은 계속 비어 있어, 이후 실행(F8)이 "필수 입력 필드가 비어
    있다"는 SAP 오류로 조용히 막히는 버그가 실사용에서 확인됨(ZPP038 BOM 조회의 플랜트
    필드) — MM03 자재번호 필드에서 먼저 겪었던 것과 같은 종류의 함정이라 그 해결 패턴
    (`_navigate_to_material_document_tab`)을 공용 헬퍼로 뽑아 재사용한다. 성공하면 실제로
    값을 넣은 컨트롤을, 후보가 없거나 전부 실패하면 None을 반환한다."""
    candidates = _find_all_by_id_substring(wnd, substring)
    if not candidates:
        return None

    def sort_key(c):
        try:
            t = c.Type
        except Exception:
            t = None
        return prefer_types.index(t) if t in prefer_types else len(prefer_types)

    candidates.sort(key=sort_key)
    for cand in candidates:
        try:
            cand.text = str(value)
            return cand
        except Exception:
            continue
    return None


def _select_tab_if_present(wnd, id_substring):
    tab = _find_by_id_substring(wnd, id_substring)
    if tab is not None:
        try:
            tab.select()
        except Exception:
            pass


def _select_tab_with_retry(wnd, id_substring, attempts=6, delay=0.5):
    """`_select_tab_if_present`의 재시도 버전. 2026-09-15 신규 — 자재번호를 직접 입력해 MM03을
    처음부터 여는 경로(`_navigate_to_material_document_tab`)는 "이미 열려 있는 화면"을
    전제하던 기존 `_select_tab_if_present`와 달리 화면이 아직 다 그려지지 않았을 수 있어
    짧게 여러 번 재시도한다. 그래도 끝내 못 찾으면 False를 반환하는데, 이 경우는 "타이밍
    문제"가 아니라 그 자재에 저장된 "뷰 선택(Select View(s))" 이력에 해당 뷰 자체가 없어서
    탭이 애초에 화면에 존재하지 않는 것일 가능성이 있다(실사용 테스트로 확인 — 자재
    106188은 "문서 데이터" 탭 없이 "기본 데이터" 탭으로만 열렸음). 호출부가 True/False를
    보고 구체적인 안내 메시지를 낼 수 있도록 `_select_tab_if_present`(무조건 조용히 통과)와
    분리했다."""
    for _attempt in range(attempts):
        tab = _find_by_id_substring(wnd, id_substring)
        if tab is not None:
            try:
                tab.select()
            except Exception:
                pass
            return True
        time.sleep(delay)
    return False


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


def _find_material_row_in_grid(grid, material):
    """현재 화면의 ALV 그리드(GuiShell/GridView, 예: ZMM009 "자재 List" 결과)에서 "자재"라는
    제목의 컬럼을 찾아, 지정한 material과 정확히 일치하는 행 번호를 찾는다(2026-09-15 신규).
    특정 트랜잭션의 내부 필드명(MATNR 등) 대신 화면에 보이는 컬럼 제목으로 찾아서, ZMM009뿐
    아니라 "자재"라는 컬럼이 있는 다른 다중조회 화면에도 재사용 가능하게 했다 — 기존
    `_sap_dump_grid`가 컬럼 제목을 읽는 것과 같은 패턴. 못 찾으면 (None, None)."""
    try:
        col_ids = list(grid.ColumnOrder)
    except Exception:
        return None, None
    matnr_col = None
    for cid in col_ids:
        try:
            title = (grid.GetColumnTitle(cid) or '').strip()
        except Exception:
            title = ''
        if title in ('자재', 'Material'):
            matnr_col = cid
            break
    if matnr_col is None:
        return None, None
    try:
        total_rows = grid.RowCount
    except Exception:
        return None, None
    target = str(material).strip().upper()
    for r in range(total_rows):
        try:
            val = str(grid.GetCellValue(r, matnr_col)).strip().upper()
        except Exception:
            continue
        if val == target:
            return r, matnr_col
    return None, None


def _open_material_from_current_list(wnd, material):
    """지금 화면에 이미 떠 있는 자재 목록 ALV 그리드(ZMM009 "자재 List" 등)에서 지정한
    자재번호 행을 찾아 그 "자재" 셀을 더블클릭해서 그 자재의 MM03 조회 화면으로
    drill-down한다(2026-09-15 신규 — 실사용 화면 녹화로 확인: ZMM009 결과 그리드의 "자재"
    컬럼 값을 더블클릭하면 바로 "자재 NNN 조회(원자재)" 화면으로 이동하고, 그 뒤부터는
    자재번호를 직접 입력해 MM03을 새로 여는 경로와 완전히 동일한 화면이 이어진다). 이미
    여러 자재를 조회해둔 화면을 재사용하므로 `/nMM03`을 매번 새로 여는 것보다 빠르다.
    성공하면 True, 이 화면에 그리드가 없거나 그 자재를 못 찾으면 False를 반환(호출부가
    `/nMM03`을 새로 여는 경로로 폴백할 수 있게 하기 위함 — 이 화면이 ZMM009 리스트가
    아니어도(예: MM03을 막 새로 연 직후) 안전하게 실패하고 넘어간다)."""
    grid = _sap_find_grid(wnd)
    if grid is None:
        return False
    row, col = _find_material_row_in_grid(grid, material)
    if row is None:
        return False
    try:
        grid.doubleClickCell(row, col)
        time.sleep(1.0)
    except Exception:
        return False
    return True


def _navigate_to_material_document_tab(session, wnd, material):
    """MM03으로 이동해 지정한 자재번호를 조회하고 "문서 데이터"(tabpZU04) 탭까지 연다.
    2026-09-15 실사용 화면 녹화(SAP Easy Access 메인 메뉴에서 시작 → 명령창에 MM03 입력 →
    자재번호 입력 → Enter → 기본 데이터 탭 → "문서 데이터" 탭 선택)로 얻은 정확한 컨트롤을
    일반화한 것 — `ctxtRMMG1-MATNR` 절대경로 대신 `_find_by_id_substring`로 찾아 화면
    서브구조가 달라져도 버티게 했다.
    ⚠️ 녹화 당시엔 자재번호 입력 후 곧바로 기본 데이터 화면으로 넘어갔고 "뷰 선택(Select
    View(s))" 팝업은 뜨지 않았다 — 그 자재에 최근 조회 이력이 있어 SAP가 뷰를 기억하고
    있었을 가능성이 있다. 뷰 선택 이력이 없는 자재는 이 팝업이 뜰 수 있어, 방어적으로
    wnd[1]이 나타나면 Enter(기본 선택 확정)를 한 번 시도한다 — 이 경로는 실사용 녹화가
    없어 추측성 코드이니, 만약 특정 자재에서 계속 실패하면 그 팝업이 뜬 상태로 화면을
    캡처해서 정확한 컨트롤을 다시 녹화해야 한다.
    ⚠️⚠️ [2026-09-15 실사용에서 확인] "RMMG1-MATNR" 문자열을 포함한 컨트롤이 화면에 하나가
    아닐 수 있다(예: 매치코드/히스토리 드롭다운 버튼 등) — 첫 매치가 실제 입력 필드가 아니면
    `.text = ...`가 COM 오류("Property 'Item.text' can not be set.")로 실패한다. 그래서
    `_find_by_id_substring`(첫 매치만 반환) 대신 `_find_all_by_id_substring`으로 후보를 전부
    모아, 녹화에서 확인된 타입(GuiCTextField, ID 접두사 `ctxt`)을 우선순위로 정렬한 뒤 실제로
    값을 설정할 수 있는 첫 번째 후보를 채택한다.
    💡 [2026-09-15 신규] 지금 화면에 이미 자재 목록 그리드(ZMM009 "자재 List" 등)가 떠 있으면
    `/nMM03`을 매번 새로 여는 대신 그 그리드에서 바로 drill-down한다(`_open_material_from_
    current_list`) — 여러 자재를 한 번에 조회해둔 상태에서 하나씩 문서를 열 때 더 빠르고,
    이미 그 자재가 그 리스트에 있다는 걸 사람이 확인한 셈이라 더 안전하다. 그 화면에 그리드가
    없거나 그 자재가 없으면 조용히 실패하고 아래 `/nMM03` 새로 열기 경로로 폴백한다."""
    if not _open_material_from_current_list(wnd, material):
        session.findById('wnd[0]/tbar[0]/okcd').text = '/nMM03'
        wnd.sendVKey(0)
        time.sleep(0.6)

        candidates = _find_all_by_id_substring(wnd, 'RMMG1-MATNR')
        if not candidates:
            raise RuntimeError('MM03 자재번호 입력 필드를 찾지 못했습니다 — SAP GUI가 예상과 다른 화면(예: 이미 다른 트랜잭션 진행 중)일 수 있습니다.')
        candidates.sort(key=lambda c: 0 if getattr(c, 'Type', None) == 'GuiCTextField' else 1)
        matnr_field = None
        last_err = None
        for cand in candidates:
            try:
                cand.text = str(material)
                matnr_field = cand
                break
            except Exception as e:
                last_err = e
                continue
        if matnr_field is None:
            raise RuntimeError(f'MM03 자재번호 입력 필드를 찾았지만 값을 설정하지 못했습니다. (마지막 오류: {last_err})')
        wnd.sendVKey(0)
        time.sleep(0.8)

        # 방어적 팝업 처리(추측성 — 위 주석 참고).
        try:
            popup = session.findById('wnd[1]')
            if popup is not None:
                popup.sendVKey(0)
                time.sleep(0.5)
        except Exception:
            pass

    # 💡⚠️ [2026-09-15 실사용 스크린샷으로 확정] "문서 데이터" 탭은 메인 화면(기본 데이터 1/2 등)의
    # 탭 스트립에 없다 — 화면 하단 "기본 데이터 텍스트" 섹션의 버튼(기술 ID에 GRUNDDATENTEXT
    # 포함)을 눌러야만 열리는 별도 "추가 데이터" 서브화면 안에 있다(그 서브화면 자체의 탭:
    # 문서 데이터/기본 데이터 텍스트/검사 텍스트/내부 주석/소비). 처음 받은 SAP GUI "기록 및
    # 재생" 매크로에 이 버튼 클릭이 있었는데 "부수적인 클릭"으로 잘못 판단해 자동화 코드에서
    # 빠뜨렸던 게 자재 106188에서 계속 실패한 진짜 원인이었다 — 반드시 눌러야 한다.
    extra_data_btn = _find_by_id_substring(wnd, 'GRUNDDATENTEXT')
    if extra_data_btn is not None:
        try:
            extra_data_btn.press()
            time.sleep(0.8)
        except Exception:
            pass

    found = _select_tab_with_retry(wnd, 'tabpZU04')
    time.sleep(0.4)
    if not found:
        raise RuntimeError(f'자재 "{material}" 화면에서 "문서 데이터" 탭을 찾지 못했습니다 — SAP GUI에서 직접 MM03으로 이 자재를 조회했을 때도 (자재 화면 하단의 "기본 데이터 텍스트" 버튼을 눌러 들어간 서브화면에서도) "문서 데이터" 탭이 안 보인다면, 그 자재에 저장된 "뷰 선택(View)" 이력에 문서 데이터 뷰가 빠져 있을 수 있습니다.')


def fetch_material_documents(material):
    """자재번호만 주어지고 문서 타입(P01 등)은 모를 때 — 그 자재의 "문서 데이터" 탭까지
    이동한 뒤, 특정 문서를 열지 않고 화면에 보이는 문서 목록을 fetch_current_screen()과
    똑같은 범용 덤프 로직(_sap_find_grid/_sap_dump_fields)으로 그대로 읽어온다(2026-09-15
    신규). "문서 데이터" 탭의 문서 목록은 GuiShell 그리드가 아니라 classic GuiTableControl
    이라 _sap_find_grid는 못 찾고 _sap_dump_fields 경로를 타는데, 이 함수가 이미
    GuiTextField/GuiCTextField 타입 텍스트를 traversal 순서대로 모으므로 각 문서 행의
    타입/설명 텍스트가 그대로 딸려온다 — 이 화면 전용 파서를 새로 만들지 않고 기존 범용
    덤프를 재사용한 것(CLAUDE.md의 "특정 트랜잭션 전용 파서를 만들지 않는다" 설계 원칙을
    그대로 따름). 사람이 이 덤프를 보고 원하는 문서 타입을 골라 다시 "OO 문서 열어줘"라고
    말하면 open_document()가 그 타입을 찾아 연다."""
    if not material:
        raise RuntimeError('자재번호를 지정해주세요.')

    session = _get_sap_session()
    wnd = session.findById('wnd[0]')
    _navigate_to_material_document_tab(session, wnd, material)

    body, source = _sap_dump_screen_body(wnd)

    if not body:
        return {'ok': False, 'error': f'자재 "{material}"의 "문서 데이터" 화면에서 읽을 수 있는 데이터를 찾지 못했습니다 — 자재번호가 올바른지 확인해주세요.'}

    header = f'[SAP MM03 문서 데이터: 자재 {material}]\n'
    text = header + '\n' + body
    return {'ok': True, 'source': source, 'material': material, 'text': text}


def open_document(doc_type, material=None):
    """MM03에서 이미 열려 있는(또는 material이 주어지면 직접 조회해서 여는) 자재의
    "문서 데이터" 탭에서, 지정한 문서 타입(예: 'P01')과 일치하는 행을 찾아 열고, 그 문서의
    "원본(Originals)" 파일을 더블클릭해서 연결된 프로그램(Acrobat 등)으로 바로 연다."""
    doc_type = (doc_type or '').strip().upper()
    if not doc_type:
        raise RuntimeError('문서 타입을 지정해주세요 (예: P01).')

    session = _get_sap_session()
    wnd = session.findById('wnd[0]')

    if material:
        # 자재번호가 주어졌으면 직접 MM03으로 이동해 조회 — 사람이 미리 화면을 열어둘
        # 필요가 없다(2026-09-15부터 지원).
        _navigate_to_material_document_tab(session, wnd, material)
    else:
        # 자재번호 없이 호출되면 기존 방식대로 "이미 열려 있는 화면"을 그대로 사용.
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


# ── "여러 자재 문서 일괄 다운로드" (ZDMSR004) 전용 헬퍼 ──────────────────
# 💡 [2026-09-15 신규] 지금까지의 open_document()는 자재 1개씩 MM03을 드릴다운하는 방식이었는데,
# 사용자가 "여러 개를 한 번에" 처리하고 싶다고 해서 확인해보니 — 회사 SAP에 이미 "DMS 첨부파일
# 일괄 다운로드 프로그램"(트랜잭션 ZDMSR004)이라는 전용 커스텀 리포트가 있었다. 이 리포트의
# 선택화면에서 자재코드를 복수 선택(SAP 표준 "복수 선택" 팝업, 함수그룹 SAPLALDB)으로 여러 개
# 넣고 문서유형(P01 등)을 지정해 실행하면, 그 자재들의 해당 문서가 ALV 그리드로 뜨고, 전체
# 선택 후 "다운로드" 버튼을 누르면 `C:\SAP_DMS\<문서번호>\<원본파일명>` 구조로 로컬에 한 번에
# 다운로드된다 — MM03 드릴다운을 반복하는 것보다 훨씬 빠르고 신뢰도 높은 방식이라 이쪽을
# 기본 경로로 추가했다. 2026-09-15 실사용 SAP GUI "기록 및 재생" 매크로로 정확한 컨트롤 ID를
# 확보했고, **폴더 선택 창이 전혀 뜨지 않았다**(다운로드 경로가 ABAP 리포트 내부에
# `C:\SAP_DMS\`로 고정돼 있는 것으로 추정) — 그래서 이 함수는 순수 SAP GUI 컨트롤 조작만으로
# 끝까지 완결된다(네이티브 Windows 다이얼로그 처리가 필요 없음).
# SAP 표준 "복수 선택" 팝업(함수그룹 SAPLALDB)의 "단일 값 선택" 탭 입력 표 — 여러 트랜잭션의
# SELECT-OPTIONS/PARAMETERS "복수 선택" 버튼이 공통으로 이 구조를 쓴다(2026-09-15 실사용
# 매크로 2건 — ZDMSR004의 S_MATNR 필드, ZPP038의 MATNR 필드 — 으로 동일 구조 확인). 새
# 트랜잭션에서도 재사용 가능성이 높지만, 확인 버튼 개수는 호출 맥락마다 다를 수 있었다
# (`_navigate_to_bom_screen`의 관련 주석 참고) — 새로 쓸 때 버튼 동작까지 자동으로 같다고
# 가정하지 말 것.
_SAP_MULTI_SELECT_POPUP_TABLE = "wnd[1]/usr/tabsTAB_STRIP/tabpSIVA/ssubSCREEN_HEADER:SAPLALDB:3010/tblSAPLALDBSINGLE"


def download_documents_batch(materials, doc_type='P01'):
    """ZDMSR004("DMS 첨부파일 일괄 다운로드 프로그램")을 실행해 여러 자재의 문서를 한 번에
    C:\\SAP_DMS\\<문서번호>\\ 아래로 다운로드한다. materials는 자재번호 문자열 리스트."""
    materials = [str(m).strip() for m in (materials or []) if str(m).strip()]
    if not materials:
        raise RuntimeError('다운로드할 자재번호가 없습니다.')
    doc_type = (doc_type or 'P01').strip().upper()

    session = _get_sap_session()
    wnd = session.findById('wnd[0]')

    session.findById('wnd[0]/tbar[0]/okcd').text = '/nZDMSR004'
    wnd.sendVKey(0)
    time.sleep(0.8)

    # 자재코드 "복수 선택" 팝업 열기(실사용 매크로에서 확인된 정확한 버튼 ID).
    multi_btn = _find_by_id_substring(wnd, '%_S_MATNR_%_APP_%-VALU_PUSH')
    if multi_btn is None:
        raise RuntimeError('ZDMSR004 화면에서 "자재코드 복수 선택" 버튼을 찾지 못했습니다 — 화면 구조가 예상과 다를 수 있습니다(트랜잭션 권한이 없을 가능성도 있음).')
    multi_btn.press()
    time.sleep(0.8)

    # 값 입력 — 한 화면에 보이는 행 수를 넘으면 스크롤(FirstVisibleRow)해서 이어서 입력한다.
    # ⚠️ 실사용 매크로에서는 7개까지만 확인됐고(한 화면에 다 보임) 스크롤 자체는 검증 안 됨 —
    # 8개 이상 넣을 때 문제가 있으면 이 부분을 의심할 것.
    try:
        table = session.findById(_SAP_MULTI_SELECT_POPUP_TABLE)
    except Exception:
        raise RuntimeError('"자재코드 복수 선택" 팝업의 입력 표를 찾지 못했습니다.')
    try:
        visible_rows = table.VisibleRowCount or 7
    except Exception:
        visible_rows = 7
    idx = 0
    while idx < len(materials):
        if idx > 0:
            try:
                table.FirstVisibleRow = idx
                time.sleep(0.3)
            except Exception:
                pass
        batch = materials[idx: idx + visible_rows]
        for row_offset, mat in enumerate(batch):
            cell_id = f"{_SAP_MULTI_SELECT_POPUP_TABLE}/ctxtRSCSEL_255-SLOW_I[1,{row_offset}]"
            try:
                cell = session.findById(cell_id)
                cell.text = mat
            except Exception as e:
                raise RuntimeError(f'"자재코드 복수 선택" 팝업에 {idx + row_offset + 1}번째 자재("{mat}")를 입력하지 못했습니다: {e}')
        idx += len(batch)

    # 팝업 확인(실사용 매크로에서 확인된 정확한 두 버튼 — 순서 그대로 재현).
    try:
        session.findById('wnd[1]/tbar[0]/btn[24]').press()
        time.sleep(0.3)
        session.findById('wnd[1]/tbar[0]/btn[8]').press()
    except Exception as e:
        raise RuntimeError(f'"자재코드 복수 선택" 팝업을 확인하는 중 오류가 발생했습니다: {e}')
    time.sleep(0.8)

    # 문서유형 필터.
    try:
        dokar_field = session.findById('wnd[0]/usr/ctxtS_DOKAR-LOW')
        dokar_field.text = doc_type
    except Exception:
        pass  # 이 필드가 없어도(트랜잭션 화면이 다르면) 실행 자체는 시도한다.

    # 실행(F8, 애플리케이션 툴바의 실행 버튼).
    try:
        session.findById('wnd[0]/tbar[1]/btn[8]').press()
    except Exception as e:
        raise RuntimeError(f'ZDMSR004 실행(F8) 중 오류가 발생했습니다: {e}')
    time.sleep(1.5)

    # 결과 그리드 전체 선택 후 다운로드.
    try:
        grid = session.findById('wnd[0]/shellcont/shell')
        grid.setCurrentCell(-1, '')
        grid.selectAll()
        time.sleep(0.3)
        session.findById('wnd[0]/tbar[1]/btn[13]').press()
    except Exception as e:
        raise RuntimeError(f'결과 목록에서 전체 선택 후 다운로드하는 중 오류가 발생했습니다(자재를 찾지 못해 결과가 비어 있을 수도 있습니다): {e}')
    time.sleep(1.5)

    # 💡 [2026-09-15 신규] 다운로드 완료 후 C:\SAP_DMS\ 폴더를 탐색기로 열어준다 — 백엔드와
    # SAP GUI가 같은 PC에서 돌아가는 구조라(파일을 옮길 필요 자체가 없다는 이 프로젝트의 기존
    # 설계 원칙 그대로) os.startfile로 로컬 탐색기를 바로 띄울 수 있다. 폴더 여는 것 자체가
    # 실패해도(예: 폴더가 아직 생성 안 됐거나 권한 문제) 다운로드 자체는 이미 끝난 뒤이니
    # 전체 요청을 실패로 만들지 않는다.
    try:
        os.startfile(r'C:\SAP_DMS')
    except Exception:
        pass

    return {
        'ok': True,
        'materials': materials,
        'docType': doc_type,
        'message': f'{len(materials)}개 자재의 "{doc_type}" 문서를 C:\\SAP_DMS\\ 폴더로 다운로드했습니다(자재별 하위 폴더 자동 생성). 탐색기로 그 폴더를 열었습니다.',
    }


# ── "구매오더 요청"(ZMMR060 → ZMM018) 전용 헬퍼 (2026-09-15 신규) ──────────
# AI 문답에 전자세금계산서/견적서 PDF를 첨부하면 항목을 추출해 만든 BDC Upload 엑셀을
# ZMMR060에 업로드해 구매오더를 생성하고, 저장 직전에 사람이 확인하도록 두 단계로 나눴다
# (kortek_backend.py/js 04h와 함께 설계 — CLAUDE.md "🛒 구매오더 요청" 절 참고, 실제 SAP
# 저장(구매오더 확정)은 되돌리기 번거로운 동작이라 사람 확인 없이 자동 실행하지 않기로
# 사용자와 명시적으로 합의함):
#   ① prepare_po_from_excel — 엑셀 업로드 → F8 → 협력사(사업자등록번호로 F4 검색)·세금코드·
#      단가 입력까지만 하고 저장(SAVE) 직전에 멈춘다. 결과 화면을 텍스트로 반환해 사람이
#      AI 문답 채팅에서 확인할 수 있게 한다.
#   ② confirm_save_po — 사람이 "저장해줘"라고 확인한 뒤에만 별도로 호출 — 실제로 저장
#      버튼을 눌러 구매오더를 확정하고, 오더번호를 읽어 ZMM018로 이동해 발주서 PDF를
#      출력한다. 두 함수는 서로 다른 서브프로세스 호출이지만 SAP GUI 세션 자체는 그 사이에
#      계속 살아있는 같은 프로세스이므로(사람이 화면을 그대로 열어둔 채로만 ②를 불러야
#      함), ②는 항상 ①이 남겨둔 화면 상태를 그대로 이어받는다.
# ⚠️⚠️ 2026-09-15 실사용 화면 녹화(Windows ScreenSketch)로 초기화면 구조(플랜트/파일
# 필드, "생성"/"조회" 라디오)는 시각적으로 확인했다 — "파일" 필드 옆 폴더 아이콘을 누르면
# 네이티브 Windows "열기" 다이얼로그가 뜨는데, 선택 후 그 필드에는 평범한 전체 경로
# 문자열(`C:\Users\...\Z38MMR060.xls`)이 그대로 채워지는 것으로 확인됨(스크린샷으로
# 확인) — 즉 라벨이 아니라 진짜 텍스트 입력 필드다. 이 프로젝트가 이미 겪은 "네이티브
# 다이얼로그는 SAP GUI Scripting으로 못 잡는다"는 제약(CLAUDE.md의 SAP 문서 열기 절
# 참고)을 감안해, 다이얼로그 자체를 열지 않고 이 필드에 곧바로 경로 문자열을 대입해서
# 완전히 우회한다(다른 SAP 선택화면 필드들과 동일한 방식). 다만 일반 화면 녹화라 정확한
# session.findById 기술 ID까지는 안 나와서, "플랜트"/"파일" 필드는 이 프로젝트의 기존
# 관례(_set_text_on_best_candidate로 "WERKS"/"FILE" 계열 문자열 추측)로 찾는 방어적
# 코드다 — 못 찾으면 조용히 잘못 진행하는 대신 명확한 RuntimeError로 실패한다(실패하면
# 라이브 진단으로 정확한 ID를 확인해야 함). 반대로 협력사(LIFNR)/세금코드(MWSKZ)/
# 단가(NETPR)/저장(btn[5])/ZMM018 부분은 사용자가 제공한 SAP GUI "기록 및 재생" 매크로
# (발주서 작성,출력.vbs)에서 그대로 가져온 정확한 ID다(추측 아님).
def _navigate_to_po_upload_screen(session, wnd, excel_path, plant='1000'):
    """ZMMR060("연구개발자재 발주시스템") 초기화면에 진입해 "생성" 모드로 로컬 엑셀
    파일을 업로드한다."""
    session.findById('wnd[0]/tbar[0]/okcd').text = '/nZMMR060'
    wnd.sendVKey(0)
    time.sleep(0.8)
    wnd = session.findById('wnd[0]')

    _set_text_on_best_candidate(wnd, 'WERKS', plant)
    # 플랜트는 화면 기본값(보통 1000)이 이미 들어있는 경우가 많아, 못 찾아도 치명적이지
    # 않으므로 실패해도 계속 진행한다.

    file_field = None
    for guess in ('P_FILE', 'FILENAME', 'DATEI', 'FILE'):
        file_field = _set_text_on_best_candidate(wnd, guess, excel_path)
        if file_field is not None:
            break
    if file_field is None:
        raise RuntimeError('ZMMR060 화면에서 "파일" 입력 필드를 찾지 못했습니다 — 화면 구조가 예상과 다를 수 있습니다(라이브 진단 필요).')

    try:
        session.findById('wnd[0]/tbar[1]/btn[8]').press()  # 실행(F8) — 엑셀 업로드 실행
    except Exception as e:
        raise RuntimeError(f'ZMMR060 실행(F8) 중 오류가 발생했습니다: {e}')
    time.sleep(2.0)
    return session.findById('wnd[0]')


def _find_po_grid(session, wnd):
    """ZMMR060 결과 그리드는 `wnd[0]/shellcont/shell/shellcont/shell`(매크로에서 확인된
    절대경로, usr 서브트리 밖에 있는 특이한 구조) — 먼저 이 정확한 경로를 시도하고,
    실패하면 방어적으로 타입 기반 탐색으로 폴백한다."""
    try:
        return session.findById('wnd[0]/shellcont/shell/shellcont/shell')
    except Exception:
        return _find_by_id_substring(wnd, 'shellcont/shell', require_type='GuiShell')


def prepare_po_from_excel(excel_path, biz_reg_no, items, plant='1000'):
    """구매오더 생성 1단계 — 엑셀 업로드 후 각 품목 행에 협력사/세금코드/단가를 채우고
    저장 직전에 멈춘다. `items`는 엑셀에 넣은 행과 같은 순서의 리스트, 각 원소는
    {"unitPrice": 숫자} 형태(PDF에서 추출한 단가 — SAP에 저장된 값이 아니라 이 값을
    그대로 SAP에 입력한다). 협력사는 `biz_reg_no`(사업자등록번호) 하나로 전체 PO에
    한 번만 검색해 선택한다(사용자 제공 매크로가 row 0에서만 협력사를 선택했고, 한 PO는
    보통 협력사 하나이므로 나머지 행에도 자동 적용되는 것으로 가정 — 실사용에서 행마다
    협력사가 따로 적용 안 되는 것으로 확인되면 행마다 반복하도록 고쳐야 함)."""
    session = _get_sap_session()
    wnd = session.findById('wnd[0]')
    wnd = _navigate_to_po_upload_screen(session, wnd, excel_path, plant)

    grid = _find_po_grid(session, wnd)
    if grid is None:
        raise RuntimeError('엑셀 업로드 후 결과 그리드를 찾지 못했습니다 — 업로드가 실패했거나(파일 경로/형식 문제) 화면 구조가 다를 수 있습니다.')

    # 협력사(LIFNR) — 사업자등록번호로 SAP 표준 검색도움말(F4) 팝업 검색 후 첫 결과 선택.
    # 아래 절대경로는 사용자 제공 매크로에서 그대로 가져온 것(추측 아님).
    grid.currentCellColumn = 'LIFNR'
    grid.pressF4()
    time.sleep(0.6)
    try:
        biz_field = session.findById(
            "wnd[1]/usr/tabsG_SELONETABSTRIP/tabpTAB001/ssubSUBSCR_PRESEL:SAPLSDH4:0220/"
            "sub:SAPLSDH4:0220/txtG_SELFLD_TAB-LOW[1,24]"
        )
        biz_field.text = str(biz_reg_no)
        biz_field.setFocus()
        biz_field.caretPosition = len(str(biz_reg_no))
        session.findById('wnd[1]').sendVKey(0)  # 검색 실행
        time.sleep(0.6)
        session.findById('wnd[1]/usr/lbl[1,3]').caretPosition = 9  # 첫 결과 행 선택
        session.findById('wnd[1]').sendVKey(2)  # 더블클릭과 동일 — 선택 확정
        time.sleep(0.5)
    except Exception as e:
        raise RuntimeError(f'협력사(사업자등록번호 "{biz_reg_no}") 검색 중 오류가 발생했습니다: {e} — 그 사업자등록번호로 등록된 협력사가 SAP에 없을 수 있습니다.')

    # 세금코드(MWSKZ) — 매크로에서 항상 같은 위치([1,21])를 고르므로 고정 선택으로 재현.
    grid.currentCellColumn = 'MWSKZ'
    grid.pressF4()
    time.sleep(0.6)
    try:
        session.findById('wnd[1]/usr/lbl[1,21]').setFocus()
        session.findById('wnd[1]/usr/lbl[1,21]').caretPosition = 1
        session.findById('wnd[1]').sendVKey(2)
        time.sleep(0.5)
    except Exception as e:
        raise RuntimeError(f'세금코드 선택 중 오류가 발생했습니다: {e}')

    # 품목별 단가(NETPR)/EPEIN — PDF에서 추출한 값을 행 순서대로 입력.
    for idx, item in enumerate(items):
        price = item.get('unitPrice')
        if price is None:
            continue
        try:
            grid.modifyCell(idx, 'NETPR', str(price))
            grid.currentCellColumn = 'EPEIN'
            grid.triggerModified()
            grid.modifyCell(idx, 'EPEIN', '1')
            # ⚠️ EPEIN을 매크로 그대로 "1" 고정값으로 재현 — 정확한 의미(수량이 아니라
            # 납기일수 등 다른 필드일 가능성이 있음, 요청수량은 이미 엑셀의 "요청수량"
            # 컬럼으로 들어가 있어 중복일 수 있음) 미확인. 실사용에서 이상하면 이 값부터
            # 의심할 것.
        except Exception as e:
            raise RuntimeError(f'{idx + 1}번째 품목의 단가 입력 중 오류가 발생했습니다: {e}')

    body, source = _sap_dump_screen_body(wnd)
    header = '[SAP 구매오더 생성(ZMMR060) — 저장 전 확인 필요]\n'
    text = header + '\n' + (body or '(화면 내용을 읽지 못했습니다)')
    return {'ok': True, 'source': source, 'text': text}


def confirm_save_po(purchasing_org='9000', plant='1000'):
    """구매오더 생성 2단계 — `prepare_po_from_excel`이 채워둔 화면을 사람이 확인한 뒤
    호출한다. 저장(SAVE) → 오더번호 확보 → ZMM018에서 발주서 PDF 출력까지 진행한다.
    이 함수 호출 시점에 SAP GUI가 반드시 `prepare_po_from_excel`이 마지막으로 남겨둔
    화면(그리드에 협력사/단가가 채워진 채 저장 대기 중)이어야 한다 — 그 사이 사람이나
    다른 스크립트가 화면을 바꿨으면 예상 못한 상태에서 저장이 실행될 위험이 있다."""
    session = _get_sap_session()

    try:
        session.findById('wnd[0]/tbar[1]/btn[5]').press()  # 저장
        time.sleep(1.0)
    except Exception as e:
        raise RuntimeError(f'저장(SAVE) 중 오류가 발생했습니다: {e}')

    # 저장 확인 팝업이 뜨면 확인(매크로에서 확인된 패턴) — 안 뜨면 조용히 건너뜀.
    try:
        session.findById('wnd[1]/usr/btnBUTTON_1').press()
        time.sleep(0.8)
    except Exception:
        pass

    wnd = session.findById('wnd[0]')
    grid = _find_po_grid(session, wnd)
    if grid is None:
        raise RuntimeError('저장 후 결과 그리드를 찾지 못했습니다 — 저장이 실패했을 수 있습니다.')

    po_number = None
    try:
        grid.currentCellColumn = 'EBELN'
        grid.firstVisibleColumn = 'NOMNG'
        grid.clickCurrentCell()  # 오더 상세화면으로 drill-down
        time.sleep(1.0)
        po_field = session.findById(
            'wnd[0]/usr/subSUB0:SAPLMEGUI:0020/subSUB0:SAPLMEGUI:0030/subSUB1:SAPLMEGUI:1105/txtMEPO_TOPLINE-EBELN'
        )
        po_number = (po_field.text or '').strip()
        # 뒤로가기 3번 — 매크로에서 확인된 정확한 복귀 경로.
        for _ in range(3):
            session.findById('wnd[0]/tbar[0]/btn[3]').press()
            time.sleep(0.4)
    except Exception as e:
        raise RuntimeError(f'저장은 됐지만 오더번호를 확인하는 중 오류가 발생했습니다: {e} — SAP에서 방금 생성된 구매오더를 직접 확인해주세요.')

    if not po_number:
        raise RuntimeError('구매오더는 저장됐지만 오더번호를 읽지 못했습니다 — SAP에서 직접 확인해주세요.')

    print_po_via_zmm018(po_number, purchasing_org, plant)
    return {'ok': True, 'poNumber': po_number, 'message': f'구매오더 "{po_number}"가 생성되어 저장됐습니다. 발주서 PDF를 저장하고 열었습니다.'}


_PO_PDF_OUT_DIR = os.path.join('C:\\SAP_DMS', '구매오더')


def _sap_frontend_window():
    """pywinauto로 SAP GUI 프런트엔드 창을 찾는다(class_name이 항상 'SAP_FRONTEND_SESSION'
    임을 실사용 진단으로 확인함) — 아래 `_save_po_pdf_to_file`가 SAP GUI Scripting이 닿지
    않는 임베드 PDF 뷰어를 다루기 위해 사용."""
    from pywinauto import Desktop
    for w in Desktop(backend='uia').windows():
        try:
            if w.element_info.class_name == 'SAP_FRONTEND_SESSION':
                return w
        except Exception:
            continue
    return None


def _save_po_pdf_to_file(save_path):
    """**2026-09-15 신규, 실사용 화면 녹화로 필요성이 확인됨 — SAP GUI Scripting이 아닌
    별도 계층(Windows UI Automation, `pywinauto`)을 쓴다.** "발주서출력"을 누르면 뜨는
    PDF 미리보기는 SAP GUI 안에 임베드된 순수 HTML/PDF 렌더링 콘텐츠라(`wnd[1]/usr/
    cntlHTML/shellcont/shell`의 `SAP.HTMLControl.1` — 라이브 진단으로 그 안쪽엔 더 이상
    자식 컨트롤이 없음을 확인) `session.findById`로 그 안의 저장 아이콘을 직접 클릭할
    방법이 없다. 사용자가 보내준 화면 녹화를 보면: 그 저장 아이콘을 누르면 네이티브
    Windows "사본 저장..." 다이얼로그가 뜨고, 거기서 파일명(=오더번호)·형식(PDF)을
    지정해야 비로소 실제 파일이 만들어진다 — 이 네이티브 다이얼로그도 SAP GUI
    Scripting으로는 못 잡는 영역(SAP 문서 열기 기능에서 이미 겪은 것과 같은 제약)이라,
    Ctrl+S(안 되면 Ctrl+Shift+S) 표준 단축키를 SAP 창에 직접 보내 다이얼로그를 띄운 뒤,
    그 다이얼로그의 파일명 입력란에 전체 경로를 직접 입력하는 방식으로 자동화한다.
    ⚠️⚠️ **이 함수는 아직 라이브 검증 전이다** — Claude Code 세션이 Bash로 직접
    "키보드 입력을 다른 창에 보내는" 동작(SAP GUI Scripting보다 훨씬 넓은 범위의 OS
    자동화)을 실행하려 하자 harness의 자동 모드 분류기가 차단해서, 이 세션 안에서는
    테스트를 끝까지 하지 못했다(위 `confirm_save_po`가 harness에 막혔던 것과 같은 종류의
    안전장치 — 우회 시도하지 않음). 실제 앱(브라우저 → kortek_backend.py → 이 서브프로세스)
    경로는 Claude Code Bash를 거치지 않으므로 이 차단과 무관하다. 문제가 생기면 이 함수
    부터 의심하고, 필요하면 사용자가 직접 `py -3-32 sap_bridge_32.py print_po_via_zmm018
    <오더번호>`를 자기 터미널에서 실행해 재현/디버깅할 것(그 경우엔 harness 차단이
    없으므로 실제 동작을 볼 수 있음)."""
    from pywinauto.keyboard import send_keys
    from pywinauto import Desktop

    sap_win = _sap_frontend_window()
    if sap_win is None:
        raise RuntimeError('SAP GUI 창을 찾지 못해 PDF 저장 다이얼로그를 띄울 수 없습니다.')

    sap_win.set_focus()
    time.sleep(0.5)
    # ⚠️ [2026-09-15 1차 실사용 테스트 실패 후 보강] "발주서출력" 버튼을 누른 직후엔 SAP
    # GUI 자체의 키보드 포커스가 여전히 그 버튼(또는 그리드)에 남아있어서, 곧바로 단축키를
    # 보내면 임베드된 PDF 뷰어가 아니라 SAP GUI로 전달되어 무시되는 것으로 추정됨(1차
    # 테스트에서 다이얼로그가 전혀 안 떴음) — 문서 내용 영역을 한 번 클릭해 그쪽으로
    # 포커스를 명시적으로 옮긴 뒤 단축키를 보내도록 수정.
    try:
        rect = sap_win.rectangle()
        cx = (rect.left + rect.right) // 2 - rect.left
        cy = (rect.top + rect.bottom) // 2 - rect.top
        sap_win.click_input(coords=(cx, cy))
        time.sleep(0.5)
    except Exception:
        pass  # 클릭 실패해도 단축키는 일단 시도

    def _find_save_dialog(timeout_sec):
        deadline = time.time() + timeout_sec
        titles = []
        while time.time() < deadline:
            for w in Desktop(backend='uia').windows():
                try:
                    title = w.window_text()
                except Exception:
                    continue
                if title and title not in titles:
                    titles.append(title)
                if '사본 저장' in title or 'Save' in title:
                    return w, titles
            time.sleep(0.4)
        return None, titles

    # ⚠️ [사용자 제안 반영] 임베드 뷰어에 따라 "다른 이름으로 저장" 단축키가 Ctrl+S가
    # 아니라 Ctrl+Shift+S일 수 있어(Acrobat 계열이 "저장"과 "다른 이름으로 저장"을
    # 구분하는 경우 흔함) — Ctrl+S를 먼저 시도하고 다이얼로그가 안 뜨면 Ctrl+Shift+S로
    # 재시도한다. 둘 다 실패하면 그 시점에 열려있던 창 목록을 에러에 남겨 다음 디버깅
    # 왕복을 줄인다.
    save_dlg = None
    seen_titles = []
    for shortcut in ('^s', '^+s'):
        sap_win.type_keys(shortcut, pause=0.05)
        time.sleep(1.5)
        save_dlg, titles = _find_save_dialog(5)
        seen_titles = list(dict.fromkeys(seen_titles + titles))
        if save_dlg is not None:
            break
    if save_dlg is None:
        # 디버깅에 필요한 최소 정보(그 시점에 열려있던 창 목록)를 에러 메시지에 같이
        # 남긴다 — 다음 실패 시 왕복 없이 바로 원인을 좁힐 수 있게.
        titles_str = ' / '.join(seen_titles[:20])
        raise RuntimeError(f'PDF 저장("사본 저장") 다이얼로그가 뜨지 않았습니다(Ctrl+S, Ctrl+Shift+S 둘 다 시도함) — PDF 미리보기가 열려있지 않거나, 단축키가 전달되지 않았을 수 있습니다. (열려있던 창: {titles_str})')

    save_dlg.set_focus()
    time.sleep(0.3)
    try:
        edit = save_dlg.child_window(class_name='Edit', found_index=0)
        edit.set_focus()
        edit.set_edit_text(save_path)
    except Exception as e:
        raise RuntimeError(f'저장 다이얼로그의 파일명 입력란을 찾지 못했습니다: {e}')
    time.sleep(0.3)
    send_keys('{ENTER}')
    time.sleep(1.0)

    # "파일이 이미 있습니다 — 덮어쓰시겠습니까?" 같은 확인창이 뜰 수 있음 — 뜨면 Enter로 승인.
    for w in Desktop(backend='uia').windows():
        try:
            title = w.window_text()
        except Exception:
            continue
        if '확인' in title or 'Confirm' in title:
            send_keys('{ENTER}')
            break
    time.sleep(0.5)

    if not os.path.exists(save_path):
        raise RuntimeError(f'저장 다이얼로그는 처리했지만 파일이 생성되지 않았습니다({save_path}) — 다이얼로그 상태를 SAP 화면에서 직접 확인해주세요.')
    return save_path


def print_po_via_zmm018(po_number, purchasing_org='9000', plant='1000'):
    """ZMM018에서 이미 존재하는 구매오더번호로 발주서 PDF를 출력하고, 실제 파일로 저장한
    뒤 연결된 프로그램(Acrobat 등)으로 연다. `confirm_save_po`가 저장 직후 자동으로
    호출하지만(오더번호를 그 자리에서 방금 확보해서), 그와 별개로 **이미 저장된(사람이
    SAP에서 직접 저장한 경우 포함) 오더번호를 알고 있을 때 출력만 다시 시도**하는 용도로도
    쓸 수 있게 독립 함수로 분리했다(2026-09-15 — 실사용 테스트에서 저장은 harness 정책상
    사람이 SAP 화면에서 직접 눌러야 했고, 그 뒤 출력만 이 함수로 이어서 실행함). 저장
    (SAVE)이 전혀 없는 순수 조회/출력 동작이라 저장보다 안전하다."""
    session = _get_sap_session()
    try:
        session.findById('wnd[0]/tbar[0]/okcd').text = '/nZMM018'
        wnd = session.findById('wnd[0]')
        wnd.sendVKey(0)
        time.sleep(0.8)
        wnd = session.findById('wnd[0]')
        _set_text_on_best_candidate(wnd, 'S_EKORG-LOW', purchasing_org)
        _set_text_on_best_candidate(wnd, 'S_WERKS-LOW', plant)
        ebeln_field = _set_text_on_best_candidate(wnd, 'S_EBELN-LOW', po_number)
        if ebeln_field is None:
            raise RuntimeError('ZMM018 화면에서 오더번호 입력 필드를 찾지 못했습니다.')
        session.findById('wnd[0]/tbar[1]/btn[8]').press()  # 실행(F8)
        time.sleep(1.5)

        # ZMM018 결과 그리드는 `wnd[0]/shellcont/shell`(ZMMR060과 달리 한 단계만 중첩 —
        # 매크로에서 확인된 절대경로).
        try:
            out_grid = session.findById('wnd[0]/shellcont/shell')
        except Exception:
            out_grid = _find_by_id_substring(session.findById('wnd[0]'), 'shellcont/shell', require_type='GuiShell')
        out_grid.currentCellColumn = ''
        out_grid.selectedRows = '0'
        session.findById('wnd[0]/tbar[1]/btn[13]').press()  # 출력(미리보기 표시) — 매크로에서 확인된 인덱스
        time.sleep(2.0)
    except Exception as e:
        raise RuntimeError(f'구매오더("{po_number}") 발주서 미리보기 표시(ZMM018) 중 오류가 발생했습니다: {e} — ZMM018에서 오더번호 "{po_number}"로 직접 출력해주세요.')

    try:
        os.makedirs(_PO_PDF_OUT_DIR, exist_ok=True)
        pdf_path = os.path.join(_PO_PDF_OUT_DIR, f'{po_number}.pdf')
        _save_po_pdf_to_file(pdf_path)
    except Exception as e:
        raise RuntimeError(f'발주서 미리보기는 정상 표시됐지만, PDF 파일로 저장하는 중 오류가 발생했습니다: {e} — 지금 열려있는 미리보기에서 💾 저장 아이콘을 직접 눌러 "{po_number}.pdf"로 저장해주세요.')

    try:
        os.startfile(pdf_path)
    except Exception:
        pass

    return {'ok': True, 'poNumber': po_number, 'pdfPath': pdf_path, 'message': f'구매오더 "{po_number}"의 발주서 PDF를 "{pdf_path}"로 저장하고 열었습니다.'}


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
            material = sys.argv[3] if len(sys.argv) > 3 else None
            result = open_document(doc_type, material)
        elif action == 'fetch_material_documents':
            material = sys.argv[2] if len(sys.argv) > 2 else ''
            result = fetch_material_documents(material)
        elif action == 'download_documents_batch':
            doc_type = sys.argv[2] if len(sys.argv) > 2 else 'P01'
            materials_str = sys.argv[3] if len(sys.argv) > 3 else ''
            materials = [m.strip() for m in materials_str.split(',') if m.strip()]
            result = download_documents_batch(materials, doc_type)
        elif action == 'fetch_bom':
            materials_arg = sys.argv[2] if len(sys.argv) > 2 else ''
            plant = sys.argv[3] if len(sys.argv) > 3 else '1000'
            tcode_mode = sys.argv[4] if len(sys.argv) > 4 else 'auto'  # 'single'|'multi'|'auto'
            explosion = sys.argv[5] if len(sys.argv) > 5 else 'single'  # 'single'|'multi'
            show_price = (sys.argv[6] if len(sys.argv) > 6 else '0') in ('1', 'true', 'True')
            show_location = (sys.argv[7] if len(sys.argv) > 7 else '0') in ('1', 'true', 'True')
            materials_list = [m.strip() for m in materials_arg.split(',') if m.strip()]
            materials_param = materials_list if len(materials_list) > 1 else (materials_list[0] if materials_list else '')
            use_single_tcode = {'single': True, 'multi': False}.get(tcode_mode, None)
            result = fetch_bom(materials_param, plant, use_single_tcode=use_single_tcode,
                                explosion=explosion, show_price=show_price, show_location=show_location)
        elif action == 'fetch_where_used':
            materials_arg = sys.argv[2] if len(sys.argv) > 2 else ''
            plant = sys.argv[3] if len(sys.argv) > 3 else '1000'
            materials_list = [m.strip() for m in materials_arg.split(',') if m.strip()]
            materials_param = materials_list if len(materials_list) > 1 else (materials_list[0] if materials_list else '')
            result = fetch_where_used(materials_param, plant)
        elif action == 'fetch_where_used_batch':
            materials_arg = sys.argv[2] if len(sys.argv) > 2 else ''
            plant = sys.argv[3] if len(sys.argv) > 3 else '1000'
            materials_list = [m.strip() for m in materials_arg.split(',') if m.strip()]
            result = fetch_where_used_batch(materials_list, plant)
        elif action == 'fetch_approval_info':
            materials_arg = sys.argv[2] if len(sys.argv) > 2 else ''
            materials_list = [m.strip() for m in materials_arg.split(',') if m.strip()]
            result = fetch_approval_info(materials_list)
        elif action == 'prepare_po_from_excel':
            excel_path = sys.argv[2] if len(sys.argv) > 2 else ''
            biz_reg_no = sys.argv[3] if len(sys.argv) > 3 else ''
            items_json = sys.argv[4] if len(sys.argv) > 4 else '[]'
            plant = sys.argv[5] if len(sys.argv) > 5 else '1000'
            items = json.loads(items_json)
            result = prepare_po_from_excel(excel_path, biz_reg_no, items, plant)
        elif action == 'confirm_save_po':
            purchasing_org = sys.argv[2] if len(sys.argv) > 2 else '9000'
            plant = sys.argv[3] if len(sys.argv) > 3 else '1000'
            result = confirm_save_po(purchasing_org, plant)
        elif action == 'print_po_via_zmm018':
            po_number = sys.argv[2] if len(sys.argv) > 2 else ''
            purchasing_org = sys.argv[3] if len(sys.argv) > 3 else '9000'
            plant = sys.argv[4] if len(sys.argv) > 4 else '1000'
            result = print_po_via_zmm018(po_number, purchasing_org, plant)
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
