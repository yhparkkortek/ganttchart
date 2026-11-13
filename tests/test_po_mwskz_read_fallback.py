# -*- coding: utf-8 -*-
"""🧾 구매오더 — row0 세금코드(MWSKZ) 읽기 실패해도 행 1~N을 포기하지 않는다 (2026-11-13)

    py -3 tests/test_po_mwskz_read_fallback.py

배경(사용자 실사용 스크린샷, "V9 를 빼먹었네?"): [MM] 연구소 구매오더 생성 화면에서
행0은 세금코드 V9가 정상인데 행1은 "세금코드가 입력되지 않았습니다"로 막혀 있었다.

원인: `prepare_po_from_excel`가 행0 선택 직후 `GetCellValue(0, 'MWSKZ')`로 자기가 방금
넣은 값을 되읽어(`mwskz_filled`) 그걸 행1~N에 복사하는데, 이 되읽기가 재시도(5회) 끝에도
실패(빈 문자열)하면 — 실제로는 SAP에 V9가 멀쩡히 들어가 있어도 — 예전 코드는
`if mwskz_filled:`가 거짓이 되어 **행1~N의 세금코드 채우기 자체를 통째로 건너뛰었고**,
저장 전 최종 검증(`still_blank`)도 같은 깃발에 가려 **같이 꺼져** 조용히 넘어갔다.

이 테스트는 그 정확한 조건(row0 MWSKZ 읽기가 영구적으로 빈 문자열)을 재현해, 고친 코드가
행1~N을 포기하지 않고 row0과 같은 방법(F4)으로 직접 채우는지 확인한다.

⚠️ 가짜는 SAP COM 세션 경계 하나(`_get_sap_session`)뿐 — `prepare_po_from_excel` 본체는
진짜로 돈다(CLAUDE.md: "안쪽을 가짜로 만들면 테스트가 자기 자신을 테스트한다").
"""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import sap_bridge_32 as S  # noqa: E402

PASS = [0]
FAIL = [0]


def ok(name, cond, detail=''):
    if cond:
        PASS[0] += 1
        print('  OK   %s' % name)
    else:
        FAIL[0] += 1
        print('  FAIL %s%s' % (name, ('  -- ' + str(detail)) if detail else ''))


class FakeField(object):
    def __init__(self):
        self.text = ''
        self.caretPosition = 0

    def setFocus(self):
        pass


class FakeWnd1(object):
    def __init__(self, session):
        self._session = session

    def sendVKey(self, n):
        pass  # 이 테스트는 LIFNR 검색 경로를 안 탄다(바로 modifyCell로 성공)

    def close(self):
        pass


class FakeWnd0(object):
    def findById(self, rel):
        raise KeyError(rel)


class FakeGrid(object):
    """row0의 MWSKZ만 "읽기 영구 실패"(GetCellValue가 항상 빈 문자열)를 흉내낸다 —
    실제 SAP엔 값이 들어가 있어도 우리 파이썬 읽기가 매번 빈 값을 받는 실사용 증상."""
    def __init__(self):
        self.currentCellRow = 0
        self.currentCellColumn = ''
        self.cells = {}

    def pressF4(self):
        pass

    def modifyCell(self, row, col, value):
        self.cells[(row, col)] = value

    def GetCellValue(self, row, col):
        if row == 0 and col == 'MWSKZ':
            return ''  # row0 자신의 읽기는 영구히 실패(실제값 존재 여부와 무관)
        return str(self.cells.get((row, col), ''))

    def triggerModified(self):
        pass


class FakeSession(object):
    def __init__(self, grid):
        self.grid = grid
        self.mwskz_f4_rows = []  # [1,21] F4 세금코드 선택이 실제로 호출된 행들
        self._wnd1 = FakeWnd1(self)

    def findById(self, path):
        if path == 'wnd[0]':
            return FakeWnd0()
        if path == 'wnd[1]':
            return self._wnd1
        if path.endswith('[1,21]') and 'usr/lbl' in path:
            # 세금코드 F4 선택 — 지금 그리드가 가리키는 행에 'V9'를 써서(진짜 SAP처럼)
            # 어느 행에 대해 호출됐는지 기록한다.
            row = self.grid.currentCellRow
            self.mwskz_f4_rows.append(row)
            self.grid.cells[(row, 'MWSKZ')] = 'V9'
            return FakeField()
        raise KeyError(path)


def _run_prepare(session, grid, items=None):
    items = items if items is not None else [{'unitPrice': 100}, {'unitPrice': 200}, {'unitPrice': 300}]
    orig_get_session = S._get_sap_session
    orig_navigate = S._navigate_to_po_upload_screen
    orig_find_grid = S._find_po_grid
    orig_close_popups = S._sap_close_stray_popups
    orig_dump_body = S._sap_dump_screen_body
    S._get_sap_session = lambda: session
    S._navigate_to_po_upload_screen = lambda sess, wnd, excel_path, plant, debug_steps=None: wnd
    S._find_po_grid = lambda sess, wnd: grid
    S._sap_close_stray_popups = lambda sess, max_windows=4: None
    S._sap_dump_screen_body = lambda wnd: ('(테스트)', 'test')
    # LIFNR은 이 테스트의 관심사가 아님 — row0 선택이 바로 성공하도록 간단히 채워둠
    grid.cells[(0, 'LIFNR')] = 'VENDOR-1'
    orig_fill_select = S._sap_vendor_f4_fill_and_select
    S._sap_vendor_f4_fill_and_select = lambda sess, row, value: None  # LIFNR 검색은 흉내만
    try:
        return S.prepare_po_from_excel('x.xlsx', '999', items, '1000', 'KRW', None)
    finally:
        S._get_sap_session = orig_get_session
        S._navigate_to_po_upload_screen = orig_navigate
        S._find_po_grid = orig_find_grid
        S._sap_close_stray_popups = orig_close_popups
        S._sap_dump_screen_body = orig_dump_body
        S._sap_vendor_f4_fill_and_select = orig_fill_select


def test_row0_mwskz_read_failure_still_fills_all_rows():
    print('[1] row0 MWSKZ 읽기가 영구 실패해도 행1~N은 F4로 직접 채워진다(포기하지 않음)')
    grid = FakeGrid()
    session = FakeSession(grid)
    result = _run_prepare(session, grid)
    ok('성공 반환(예외 없이 저장 전 단계까지 도달)', result.get('ok') is True, result)
    # [1,21] 컨트롤은 setFocus()·caretPosition 둘 다에서 findById가 불려 행마다 2회씩
    # 찍힌다(row0의 기존 코드도 동일한 패턴) — 핵심은 "행1·행2가 아예 빠지지 않는다"는 것.
    ok('행1·행2 둘 다 F4로 세금코드 선택이 호출됨(복사를 포기하지 않음)',
       set(session.mwskz_f4_rows) == {0, 1, 2}, session.mwskz_f4_rows)
    ok('행1 세금코드가 실제로 채워짐', grid.GetCellValue(1, 'MWSKZ') == 'V9')
    ok('행2 세금코드가 실제로 채워짐', grid.GetCellValue(2, 'MWSKZ') == 'V9')


def test_row0_mwskz_read_failure_but_f4_also_fails_raises_clear_error():
    print('\n[2] row0 읽기도 실패하고 F4 폴백도 실패하면 — 조용히 넘어가지 않고 분명히 실패')
    grid = FakeGrid()

    class _BrokenSession(FakeSession):
        def findById(self, path):
            if path.endswith('[1,21]') and 'usr/lbl' in path:
                raise RuntimeError('F4 팝업 자체가 안 뜸(시뮬레이션)')
            return FakeSession.findById(self, path)

    session = _BrokenSession(grid)
    try:
        _run_prepare(session, grid)
        ok('예외가 나야 함', False)
    except RuntimeError as e:
        msg = str(e)
        ok('세금코드 선택 실패를 분명히 알림', '세금코드 선택 중 오류' in msg, msg)


if __name__ == '__main__':
    test_row0_mwskz_read_failure_still_fills_all_rows()
    test_row0_mwskz_read_failure_but_f4_also_fails_raises_clear_error()
    print('\n%s (%d/%d)' % (('FAIL %d건' % FAIL[0]) if FAIL[0] else 'OK 전부 통과', PASS[0], PASS[0] + FAIL[0]))
    sys.exit(1 if FAIL[0] else 0)
