# py -3 tests/test_bom_sort_probe.py
#
# 🧱 BOM 계층 판정 + "레이아웃에 걸린 정렬 읽기"(sap_bridge_32.py, 2026-11-05) 검증.
#
# SAP 없이 돈다. 가짜는 **COM 경계에만** 둔다(가짜 GuiShell/GuiTab/session) — 안쪽은 진짜
# `_bom_hierarchy_ok_from_text` / `_find_tab_by_text` / `_find_by_id_substring` /
# `_alv_sort_entries` / `_sap_read_alv_sort` 코드를 그대로 돌린다.
#
# ⚠️ **이 하네스가 증명하지 못하는 것**(정직하게 적는다):
#    실제 SAP 다이얼로그의 탭 라벨·컨트롤 ID가 여기 가짜와 같은지는 **라이브로 봐야 안다**.
#    여는 방법(`SelectContextMenuItemByText('레이아웃 변경...')`)과 "적용된 정렬" 그리드 이름
#    (`cntlCONTAINER2_SORT`)은 2026-10-27에 라이브로 확인된 값이지만, 탭을 눌러 그 컨테이너가
#    트리에 나타나는 과정은 그때 사람이 손으로 한 것이라 코드로는 아직 한 번도 안 돌려봤다.
#    → 라이브 1회 검증 전까지는 "읽기 실패(sortDiag)"가 정상 결과일 수 있다. 그래서 읽기에
#      실패해도 조회 자체는 멀쩡해야 한다는 것까지 여기서 같이 검증한다.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sap_bridge_32 as B  # noqa: E402

TAB = chr(9)
NL = chr(10)

_pass, _fail = 0, 0


def eq(label, got, want):
    global _pass, _fail
    if got == want:
        _pass += 1
        print('  OK  ' + label)
    else:
        _fail += 1
        print('  XX  ' + label + '  got=' + repr(got) + ' want=' + repr(want))


def grid_text(rows, header=('STUFE', 'IDNRK', 'OJTXP', 'MENGE', 'EBORT')):
    """실제 덤프와 같은 모양: 머리글 1줄 + 탭 구분 데이터 행."""
    lines = [TAB.join(header)] + [TAB.join(r) for r in rows]
    return NL.join(lines)


PARENT = ('', '999900', 'MVD>ZZTEST', '', '')          # 모체 자재(레벨 없음)
TOTAL = ('', '', '', '12', '')                          # 단위별 합계(레벨·코드 없음)
LOC_CONT = ('', '', '', '', 'R24')                      # 설치지점 연속 행(EBORT만)


def lv(n, code, name, qty='1', loc=''):
    return ('[ %d     ]' % n, code, name, qty, loc)


print('[1] 계층 판정 — 규칙은 js/38 _bomHierarchyOk 와 같아야 한다')
eq('자연 순서(깊이 우선) → True',
   B._bom_hierarchy_ok_from_text(grid_text([
       PARENT, lv(1, '900001', 'SUB(P)'), lv(2, '900002', 'RES'), lv(2, '900003', 'TR'),
       lv(1, '900004', 'SCREW'), TOTAL])), True)
eq('정렬돼 레벨2가 먼저 → False',
   B._bom_hierarchy_ok_from_text(grid_text([
       PARENT, lv(2, '900002', 'X-TAL'), lv(2, '900003', 'TR'),
       lv(1, '900001', 'SUB(P)'), lv(1, '900004', 'SCREW')])), False)
eq('레벨이 한 번에 2 이상 깊어지면 → False',
   B._bom_hierarchy_ok_from_text(grid_text([
       PARENT, lv(1, '900001', 'A'), lv(3, '900002', 'B')])), False)
eq('설치지점 연속 행·합계 행은 판정에 끼어들지 않는다 → True',
   B._bom_hierarchy_ok_from_text(grid_text([
       PARENT, lv(1, '900001', 'A'), lv(2, '900002', 'B', '17', 'R17'), LOC_CONT, LOC_CONT,
       lv(2, '900003', 'C'), TOTAL])), True)
eq('잘림 안내 줄이 섞여도 안 깨진다',
   B._bom_hierarchy_ok_from_text(grid_text([PARENT, lv(1, '1', 'A'), lv(2, '2', 'B')])
                                 + NL + '... (총 722행 중 500행만 표시)'), True)
eq('STUFE 열이 없으면 판단 불가 → None',
   B._bom_hierarchy_ok_from_text(grid_text([('900001', 'A')], header=('IDNRK', 'OJTXP'))), None)
eq('빈 본문 → None', B._bom_hierarchy_ok_from_text(''), None)
eq('레벨 행이 하나도 없으면 True(판단할 게 없다)',
   B._bom_hierarchy_ok_from_text(grid_text([PARENT, TOTAL])), True)


# ── 가짜 COM 객체 ────────────────────────────────────────────────────
class Children(object):
    def __init__(self, items):
        self._items = items

    @property
    def Count(self):
        return len(self._items)

    def Item(self, i):
        return self._items[i]


class Node(object):
    """GuiTab / GuiShell / 컨테이너 흉내 — .Id/.Type/.Text/.Children 만 있다."""

    def __init__(self, nid, ntype='GuiContainer', text='', children=None):
        self.Id = nid
        self.Type = ntype
        self.Text = text
        self._children = children or []
        self.selected = False

    @property
    def Children(self):
        return Children(self._children)

    def Select(self):
        self.selected = True


class SortShell(Node):
    """"적용된 정렬" 그리드."""

    def __init__(self, nid, cols, rows):
        Node.__init__(self, nid, 'GuiShell')
        self.ColumnOrder = cols
        self._rows = rows

    @property
    def RowCount(self):
        return len(self._rows)

    def GetCellValue(self, r, cid):
        return self._rows[r].get(cid, '')


class Popup(Node):
    def __init__(self, children):
        Node.__init__(self, 'wnd[1]', 'GuiModalWindow', '', children)
        self.vkeys = []
        self.pressed = []          # 눌린 버튼 — **비어 있어야 한다**(저장 금지)
        self.session = None

    def sendVKey(self, k):
        # 실제 SAP: 취소(F12)가 먹으면 그 창이 사라져서 다음 findById('wnd[1]')가 실패한다.
        # (처음엔 sendVKey 가 예외를 던지도록 흉내 냈는데, 그건 **가짜가 틀린 것**이라
        #  닫기 루프가 3번 도는 가짜 실패를 만들었다 — CLAUDE.md "실패가 나면 하네스부터 의심".)
        self.vkeys.append(k)
        if self.session is not None:
            self.session._closed = True

    def close(self):
        self.pressed.append('close')


class Session(object):
    def __init__(self, popup):
        self._popup = popup
        self._closed = False

    def findById(self, wid):
        if wid == 'wnd[1]':
            if self._popup is None or self._closed:
                raise LookupError('no wnd[1]')
            return self._popup
        raise LookupError(wid)


class Grid(object):
    """ALV 그리드 — 특정 라벨에만 컨텍스트 메뉴가 열린다."""

    def __init__(self, accept='레이아웃 변경...', session=None, popup=None):
        self.accept = accept
        self.tried = []
        self.dropdown = []
        self._session = session
        self._popup = popup

    def PressToolbarContextButton(self, code):
        # ⚠️ 실물에서는 **이걸 먼저 눌러야** 드롭다운이 열리고 "레이아웃 변경..."이 보인다
        #    (2026-11-09 실측 — 11-05 의 menu_not_found 원인이 이것이었다).
        self.dropdown.append(code)

    def SelectContextMenuItemByText(self, label):
        if not self.dropdown:
            raise RuntimeError('context menu not open')   # 실물과 같은 실패 모양
        self.tried.append(label)
        if label != self.accept:
            raise RuntimeError('no such menu item')
        if self._session is not None:
            self._session._closed = False      # 팝업이 떴다


def make(cols, rows, sort_id='shellcont/cntlCONTAINER2_SORT/shell', tab_text='정렬 순서',
         extra_first=True):
    inner = []
    if extra_first:
        # ⚠️ 함정 재현: "고를 수 있는 열" 그리드(CONTAINER1)가 트리에서 **먼저** 나온다.
        inner.append(SortShell('shellcont/cntlCONTAINER1_SORT/shell',
                               ['SELTEXT'], [{'SELTEXT': '구성부품'}, {'SELTEXT': '수량'}]))
    inner.append(SortShell(sort_id, cols, rows))
    tab = Node('usr/tabsTABSTRIP/tabpSORT', 'GuiTab', tab_text, inner)
    other = Node('usr/tabsTABSTRIP/tabpCOLS', 'GuiTab', '표시된 열', [])
    popup = Popup([Node('usr', 'GuiContainer', '', [other, tab])])
    sess = Session(popup)
    popup.session = sess
    return sess, popup, tab


print('')
print('[2] "적용된 정렬" 그리드를 있는 그대로 읽는다')
sess, popup, tab = make(['SELTEXT', 'UP', 'DOWN'],
                        [{'SELTEXT': '구성부품내역', 'DOWN': 'X'}])
grid = Grid(session=sess)
entries, diag = B._sap_read_alv_sort(sess, grid)
eq('정렬 1줄을 열이름=값으로 읽는다', entries, ['SELTEXT=구성부품내역 / DOWN=X'])
eq('진단은 비어 있다(성공)', diag, '')
eq('드롭다운을 먼저 연다(&MB_VARIANT)', grid.dropdown, ['&MB_VARIANT'])
eq('정렬 순서 탭을 눌렀다', tab.selected, True)
eq('팝업을 취소(F12)로 닫았다', popup.vkeys, [12])
eq('버튼을 누른 적이 없다(레이아웃 저장 금지)', popup.pressed, [])

print('')
print('[3] 함정 — 열 목록(CONTAINER1)을 정렬 기준으로 오인하지 않는다')
sess2, popup2, _ = make(['SELTEXT'], [{'SELTEXT': '구성부품내역'}],
                        sort_id='shellcont/cntlCONTAINER9_XXXX/shell')   # 2번 컨테이너가 없다
entries2, diag2 = B._sap_read_alv_sort(sess2, Grid(session=sess2))
eq('2번 컨테이너를 못 찾으면 추측하지 않는다', entries2, None)
eq('왜 못 읽었는지는 말한다', diag2, 'no_sort_grid')
eq('그래도 팝업은 닫았다', popup2.vkeys, [12])

print('')
print('[4] 정렬이 0건이면 빈 목록(= 정렬 없음)')
sess3, popup3, _ = make(['SELTEXT', 'UP', 'DOWN'], [])
entries3, diag3 = B._sap_read_alv_sort(sess3, Grid(session=sess3))
eq('빈 목록을 돌려준다(None 이 아니다 — "못 읽음"과 구분된다)', entries3, [])
eq('진단 없음', diag3, '')

print('')
print('[5] 실패해도 예외를 던지지 않는다(조회 결과를 막으면 안 된다)')
sess4, popup4, _ = make(['SELTEXT'], [{'SELTEXT': 'x'}])
g4 = Grid(accept='없는 메뉴', session=sess4)
e4, d4 = B._sap_read_alv_sort(sess4, g4)
eq('메뉴를 못 열면 menu_not_found', (e4, d4), (None, 'menu_not_found'))
eq('후보 라벨을 전부 시도했다', len(g4.tried), len(B._ALV_LAYOUT_MENU_LABELS))
e5, d5 = B._sap_read_alv_sort(Session(None), Grid(accept='레이아웃 변경...'))
eq('팝업이 안 뜨면 no_popup', (e5, d5), (None, 'no_popup'))
sess6, popup6, _ = make(['SELTEXT'], [{'SELTEXT': 'x'}], tab_text='Sort Order')
e6, d6 = B._sap_read_alv_sort(sess6, Grid(session=sess6))
eq('영문 탭 라벨도 찾는다', e6, ['SELTEXT=x'])

print('')
print('[6] 조회 경로 연결부 — 계층이 깨졌을 때만 정렬을 읽는다')
with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'sap_bridge_32.py'), encoding='utf-8') as f:
    SRC = f.read()
eq('fetch_bom 이 계층을 판정한다', 'hierarchy_ok = _bom_hierarchy_ok_from_text(body)' in SRC, True)
eq('정렬 읽기는 hierarchy_ok is False 안에서만 부른다',
   SRC.count('_sap_read_alv_sort(session, _grid_for_sort)') == 1
   and 'if hierarchy_ok is False:' in SRC, True)
eq('응답에 hierarchyOk/sortInfo 를 싣는다',
   ("'hierarchyOk': hierarchy_ok" in SRC) and ("'sortInfo': sort_entries" in SRC), True)
eq('레이아웃 저장(F5) 코드를 넣지 않았다',
   ('btnAPP_WL_SING' not in SRC) and ("tbar[0]/btn[5]" not in SRC), True)

print('')
print('결과: %d 통과 / %d 실패' % (_pass, _fail))
sys.exit(1 if _fail else 0)
