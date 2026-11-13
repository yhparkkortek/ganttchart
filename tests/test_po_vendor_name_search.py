# -*- coding: utf-8 -*-
"""🛒 구매오더 — 사업자등록번호로 협력사를 못 찾으면 상호명으로 재시도 (2026-11-13)

    py -3 tests/test_po_vendor_name_search.py

배경(사용자 제보): "사업자 등록 번호 오류 난 경우 공급자 이름으로도 검색 / 사업자 등록 번호
자주 인식못하는 문제 해결이 필요함". 추적 결과 ZMMR060 협력사(LIFNR) 칸의 F4 검색도움말
(탭001 "회사코드별 공급업체(사업자 번호)")은 멀티 크라이테리아 폼이고, 실측 덤프로
row0=검색어·row1=사업자등록번호·row2=우편번호·row3=도시·**row4=이름**·row5=공급업체·
row6=회사코드를 확인했다(SAP 안에서 직접 F4를 눌러본 라이브 덤프, 이 저장소 어디에도
전엔 없던 정보). `prepare_po_from_excel`에 `vendor_name`을 추가해, row1(사업자등록번호)
검색이 실패하면 row4(이름, 법인격 표시 뗀 핵심상호+와일드카드)로 재시도한다.

⚠️ 가짜는 **SAP COM 세션 경계 하나**(`_get_sap_session`)뿐이다. `prepare_po_from_excel`
본체(검색 성공/실패 분기, 행0→행1~N 기준 재사용, 단가 입력)는 **진짜 함수를 그대로** 돈다 —
안쪽을 가짜로 만들면 테스트가 자기 자신을 테스트한다(CLAUDE.md).
⚠️ 라이브 SAP은 안 쓴다 — `_navigate_to_po_upload_screen`/`_find_po_grid`/
`_sap_dump_screen_body`만 결과에 안 쓰이는 부분이라 얇게 바꿔치기한다(엑셀 업로드 자체는
이 로직과 무관 — 이미 "그리드까지 갔다"는 전제에서 시작).
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


# ══════════════════════════════════════════════════════════════════════════════
# 순수 함수 — 법인격 표시 제거
# ══════════════════════════════════════════════════════════════════════════════
def test_core_name():
    print('[1] _sap_vendor_search_core_name — 법인격 표시 제거')
    ok('"정림전자(주)" -> "정림전자"', S._sap_vendor_search_core_name('정림전자(주)') == '정림전자')
    ok('"(주)코텍" -> "코텍"', S._sap_vendor_search_core_name('(주)코텍') == '코텍')
    ok('"㈜더존비즈온" -> "더존비즈온"', S._sap_vendor_search_core_name('㈜더존비즈온') == '더존비즈온')
    ok('"주식회사 정림전자" -> "정림전자"(공백 trim)', S._sap_vendor_search_core_name('주식회사 정림전자').strip() == '정림전자')
    ok('빈 값/None은 빈 문자열', S._sap_vendor_search_core_name(None) == '' and S._sap_vendor_search_core_name('') == '')


# ══════════════════════════════════════════════════════════════════════════════
# 가짜 SAP COM — 세션 경계 하나만. prepare_po_from_excel 본체는 진짜로 돈다.
# ══════════════════════════════════════════════════════════════════════════════
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
        if n == 0:  # 검색 실행
            row = self._session.last_field_row
            value = self._session.last_field_value
            self._session.filled.append((row, value))
            self._session.last_search_ok = (row == self._session.success_row)
        elif n == 2:  # 선택 확정 — 성공했을 때만 그리드에 실제로 값이 채워지는 SAP 동작을 흉내
            if self._session.last_search_ok:
                g = self._session.grid
                g.cells[(g.currentCellRow, 'LIFNR')] = 'VENDOR-%s' % self._session.success_row
    def close(self):
        pass


class FakeWnd0(object):
    def findById(self, rel):
        raise KeyError(rel)


class FakeGrid(object):
    def __init__(self, fail_modify_lifnr_rows=()):
        self.currentCellRow = 0
        self.currentCellColumn = ''
        self.cells = {}
        self.fail_modify_lifnr_rows = set(fail_modify_lifnr_rows)
    def pressF4(self):
        pass
    def modifyCell(self, row, col, value):
        if col == 'LIFNR' and row in self.fail_modify_lifnr_rows:
            raise RuntimeError('SAP 그리드가 직접 쓰기를 거부함(시뮬레이션)')
        self.cells[(row, col)] = value
    def GetCellValue(self, row, col):
        return str(self.cells.get((row, col), ''))
    def triggerModified(self):
        pass


class FakeSession(object):
    """`success_row`=1 이면 사업자등록번호 검색이 통과(기존 동작), =4 면 이름 검색만 통과,
    =None 이면 둘 다 실패(상호명도 안 먹는 경우)."""
    def __init__(self, success_row, grid):
        self.success_row = success_row
        self.grid = grid
        self.filled = []
        self.last_field_row = None
        self.last_field_value = None
        self.last_search_ok = False
        self._wnd1 = FakeWnd1(self)

    def findById(self, path):
        if path == 'wnd[0]':
            return FakeWnd0()
        if path == 'wnd[1]':
            return self._wnd1
        if path.endswith('[1,3]') and 'usr/lbl' in path:
            if not self.last_search_ok:
                raise RuntimeError('컨트롤을 찾을 수 없음(검색 결과 없음 시뮬레이션)')
            return FakeField()
        if path.endswith('[1,21]') and 'usr/lbl' in path:
            # 세금코드(MWSKZ) F4 선택 — 이 테스트의 관심사가 아니라 항상 성공으로 둔다.
            self.grid.cells[(0, 'MWSKZ')] = 'V0'
            return FakeField()
        if path.endswith(',24]') and 'txtG_SELFLD_TAB-LOW' in path:
            # ".../txtG_SELFLD_TAB-LOW[{row},24]" 에서 row 추출
            row = int(path.rsplit('[', 1)[1].split(',')[0])
            f = FakeField()
            self.last_field_row = row

            class _Field(FakeField):
                def __setattr__(_self, name, value):
                    object.__setattr__(_self, name, value)
                    if name == 'text':
                        self.last_field_value = value
            return _Field()
        raise KeyError(path)


def _run_prepare(monkeypatch_session, grid, items=None, biz_reg_no='999', vendor_name=None):
    items = items if items is not None else [{'unitPrice': 100}, {'unitPrice': 200}]
    orig_get_session = S._get_sap_session
    orig_navigate = S._navigate_to_po_upload_screen
    orig_find_grid = S._find_po_grid
    orig_close_popups = S._sap_close_stray_popups
    orig_dump_body = S._sap_dump_screen_body
    S._get_sap_session = lambda: monkeypatch_session
    S._navigate_to_po_upload_screen = lambda session, wnd, excel_path, plant, debug_steps=None: wnd
    S._find_po_grid = lambda session, wnd: grid
    S._sap_close_stray_popups = lambda session, max_windows=4: None
    S._sap_dump_screen_body = lambda wnd: ('(테스트)', 'test')
    try:
        return S.prepare_po_from_excel('x.xlsx', biz_reg_no, items, '1000', 'KRW', vendor_name)
    finally:
        S._get_sap_session = orig_get_session
        S._navigate_to_po_upload_screen = orig_navigate
        S._find_po_grid = orig_find_grid
        S._sap_close_stray_popups = orig_close_popups
        S._sap_dump_screen_body = orig_dump_body


def test_stcd2_success_no_fallback():
    print('\n[2] 사업자등록번호로 바로 성공 — 이름 재시도 안 함(기존 동작 100% 유지)')
    grid = FakeGrid()
    session = FakeSession(success_row=S._SAP_VENDOR_SEARCH_ROW_STCD2, grid=grid)
    result = _run_prepare(session, grid, vendor_name='정림전자(주)')
    ok('성공 반환', result.get('ok') is True)
    ok('row1(사업자등록번호)만 시도됨', [r for r, v in session.filled] == [1], session.filled)
    ok('row4(이름)는 아예 안 건드림', all(r != 4 for r, v in session.filled))


def test_stcd2_fail_name_fallback_succeeds():
    print('\n[3] 사업자등록번호 실패 → 상호명(row4)으로 재시도해 성공')
    grid = FakeGrid()
    session = FakeSession(success_row=S._SAP_VENDOR_SEARCH_ROW_NAME, grid=grid)
    result = _run_prepare(session, grid, biz_reg_no='0000000000', vendor_name='정림전자(주)')
    ok('성공 반환', result.get('ok') is True)
    rows_tried = [r for r, v in session.filled]
    ok('row1(사업자등록번호) 먼저 시도', rows_tried[0] == 1, rows_tried)
    ok('그 다음 row4(이름)로 재시도', 4 in rows_tried, rows_tried)
    name_values = [v for r, v in session.filled if r == 4]
    ok('핵심상호 + 와일드카드로 검색됨', name_values and name_values[0] == '*정림전자*', name_values)


def test_both_fail_raises_with_both_in_message():
    print('\n[4] 사업자등록번호·상호명 둘 다 실패 — 둘 다 언급하는 오류')
    grid = FakeGrid()
    session = FakeSession(success_row=None, grid=grid)
    try:
        _run_prepare(session, grid, biz_reg_no='123', vendor_name='없는회사')
        ok('예외가 나야 함', False)
    except RuntimeError as e:
        msg = str(e)
        ok('사업자등록번호 언급', '123' in msg, msg)
        ok('상호명 언급', '없는회사' in msg, msg)


def test_no_vendor_name_keeps_old_behavior():
    print('\n[5] vendor_name 안 줌(기존 호출부) — 사업자등록번호만 시도하고 그대로 실패')
    grid = FakeGrid()
    session = FakeSession(success_row=None, grid=grid)
    try:
        _run_prepare(session, grid, biz_reg_no='123', vendor_name=None)
        ok('예외가 나야 함', False)
    except RuntimeError as e:
        msg = str(e)
        ok('row4(이름)는 시도조차 안 함', all(r != 4 for r, v in session.filled), session.filled)
        ok('기존 오류 문구 그대로', '그 사업자등록번호로 등록된 협력사가 SAP에 없을 수 있습니다' in msg, msg)


def test_row1_n_fallback_reuses_name_criteria():
    print('\n[6] 행0이 상호명으로 찾았으면, 행1~N의 F4 폴백도 상호명을 재사용(사업자번호로 새지 않음)')
    # 행1의 modifyCell(LIFNR)을 일부러 실패시켜 F4 폴백 경로를 타게 한다.
    grid = FakeGrid(fail_modify_lifnr_rows={1})
    session = FakeSession(success_row=S._SAP_VENDOR_SEARCH_ROW_NAME, grid=grid)
    result = _run_prepare(session, grid, biz_reg_no='0000000000', vendor_name='정림전자(주)')
    ok('성공 반환', result.get('ok') is True)
    row4_calls = [v for r, v in session.filled if r == 4]
    ok('행0 + 행1 폴백 둘 다 row4(이름)로 들어감(총 2회)', len(row4_calls) == 2, session.filled)
    ok('행1 폴백도 핵심상호 그대로', row4_calls and row4_calls[-1] == '*정림전자*', row4_calls)
    row1_calls = [v for r, v in session.filled if r == 1]
    ok('사업자등록번호(row1)로는 행1 폴백이 다시 새지 않음', len(row1_calls) == 1, session.filled)


if __name__ == '__main__':
    test_core_name()
    test_stcd2_success_no_fallback()
    test_stcd2_fail_name_fallback_succeeds()
    test_both_fail_raises_with_both_in_message()
    test_no_vendor_name_keeps_old_behavior()
    test_row1_n_fallback_reuses_name_criteria()
    print('\n%s (%d/%d)' % (('FAIL %d건' % FAIL[0]) if FAIL[0] else 'OK 전부 통과', PASS[0], PASS[0] + FAIL[0]))
    sys.exit(1 if FAIL[0] else 0)
