# 인계 — ZMM009 조회 표 / 6자리 코드 조회 / 알람 도표 UI

작업 기간 2026-10-14 ~ 10-20. 커밋 8개 전부 `main` 반영 완료, 작업 트리 깨끗,
`kortek_backend.zip`도 `kortek_backend.py`·`sap_bridge_32.py` 최신과 일치 확인.

| 커밋 | 내용 |
|---|---|
| `0e9fb06` | ZMM009 패턴 조회 표 — 구매담당자 제거, 생산메모 FERTH로, 좌우 스크롤 |
| `9e77a70` | 자재내역/자재내역2/제조자P/N 42자 한 줄 + 말줄임 + 툴팁 |
| `33cb9ca` | 단가(STPRS1÷PEINH1) 계산 표시 |
| `cf8e4d1` | 단가 결과만 표시, 제조사 10자, 헤더 "담당자" |
| `74a7e06` | 6자리 자재코드 목록도 ZMM009 구조화 조회 + 같은 도표 |
| `c20cb98` | 조회 표에 엑셀 버튼 + BOM 조회 옵션 기본값 기억 |
| `25b43e9` | 알람 도표 중앙정렬 + 말줄임표 + 말풍선 |
| `392d165` | 알람 체크박스 정확히 중앙 + 완료 예정일 줄바꿈 방지 |

---

## 1. ZMM009 조회 표 — 컬럼은 `_ZMM009_PATTERN_COLS` 한 곳

`sap_bridge_32.py`의 `_ZMM009_PATTERN_COLS` = MATNR · MAKTX · ZTEXT · STPRS1 ·
PEINH1 · MMSTA · MFRPN · FERTH.

- **⚠️ "생산/검사 메모"로 화면에 보이는 값은 `ZPTEXT`가 아니라 `FERTH`다.**
  `ZPTEXT`는 덤프 앞쪽 custom 필드인데 **값이 비어 있다**. ZMM009 덤프에서
  `MMSTA`(P1) 바로 뒤에 오는 `"6팀 이기준"` 형식이 `FERTH`이고, 이게 사용자가
  보는 담당자다. 화면 라벨만 보고 컬럼 코드를 고르면 조용히 빈 칸이 된다.
- **`EKGRP`(구매담당자)는 ZTEXT 레이아웃에서 안 나온다** → 표에서 제거.
- **단가 = `STPRS1 ÷ PEINH1`.** `PEINH1`(가격단위)을 안 나누면 100개 단위
  가격이 개당 가격인 양 표시된다. 통화 컬럼은 ZMM009 119컬럼에 아예 없어
  KRW 고정(이미 CLAUDE.md에 기록됨).
- 표 렌더러는 **`renderMatRows()`(js/33) 하나** — 패턴 조회와 자재코드 조회가
  공용이다. 컬럼을 바꾸려면 Python 상수 + 이 함수 두 곳만 고치면 된다.
- 자재내역·자재내역2는 42자, 제조사는 10자에서 자르고 전체는 `title` 툴팁.

## 2. 6자리 자재코드 목록 조회 (신규 경로)

**사고가 계기다.** 코드 목록을 주면 라우터가 AI로 넘겨
`fetch_zmm009_material_list`의 **범용 화면 덤프 텍스트**를 읽게 했는데, AI가
그 텍스트에 없는 값을 지어냈다 — 납기일 `(5/11~5/28)`, 제조사 `삼완전자` 등.
덤프 텍스트를 AI에 넘기는 경로는 환각이 난다는 교훈.

지금 경로(구조화 컬럼만, AI 안 거침):

```
js/33 runMaterialRowsLookup()
  → GET /sap-material-rows?materials=303410,303409   (kortek_backend.py, 최대 200건)
  → sap_bridge_32.py resolve_materials_via_zmm009()
      ZMM009 진입 → P_LGORT-LOW=1000 → 복수선택 버튼(%_P_MATNR_%_APP_%-VALU_PUSH)
      → 클립보드 Shift+F12 붙여넣기 → btn[24] → btn[8] → F8
      → _zmm009_read_grid_rows()   ← 패턴 조회와 공용
  → renderMatRows()   ← 패턴 조회와 같은 표
```

- 복수 입력은 **반드시 Shift+F12(클립보드)** — `FirstVisibleRow` 스크롤은 이
  GuiTableControl에서 안 먹어서 8건만 들어갔던 이력이 있다(2026-09-23).
- 라우팅 가드: **`ZMM009_ROW_CAPS = ['matlist','itemdesc','descpattern']`(js/33)**.
  자재번호가 보여도 다른 SAP 기능 어휘(가격·재고·BOM·문서)가 이기면 기존
  경로를 그대로 둔다. 화면 덤프 요청(`_isScreen`)과 프로젝트 질문(`_isProj`)도 제외.
- 조회 안 된 코드는 응답 `missing[]`으로 와서 표 아래 경고로 노출된다.
- **실측 확인**: `303410,303409` → 2건 정상, `missing` 비었음, `FERTH`에
  `"3팀 박용훈"` 들어옴, `PEINH1=1`.

## 3. 엑셀 버튼

`renderMatRows()`가 표 우하단에 `📊 엑셀로 열기`를 붙이고
`window._sapExportMatRows(key)`(js/33)가 내보낸다.

- **BOM 쪽과 방식이 다르다.** BOM은 입력창에 `BOM 엑셀로 열기`를 넣고 다시
  보내는 방식이지만, 여기는 표에 이미 쓴 행을 `window._qaMatRowsStore[key]`에
  들고 있어 **SAP 재조회도 AI 재호출도 없다**.
- 엑셀에는 잘라 보여준 값(42자/10자)이 아니라 **원본 전체** + 가격단위·계산단가 열.
- 저장은 `/sap-save-export` → `C:\SAP_DMS\SAP조회` (다른 SAP 기능과 같은 경로).

## 4. BOM 조회 옵션 기본값

"매번 고르기 귀찮다"는 요청. 하드코딩 대신 **마지막 선택을 기억**한다(js/04h).

- `window._bomOptsLoad()` / `_bomOptsSave(sel, isSingle)`,
  저장소 `gantt_bom_opts_v1` — `STORAGE_REGISTRY`(js/34)에 등록 완료.
- **레이아웃은 단일(ZPP033 56건)/복수(ZPP038 23건) 목록이 서로 달라 따로 저장**한다
  (`layout:{single,multi}`). 안 맞는 레이아웃을 넣으면 선택이 조용히 무시된다.
- 드롭다운 렌더에서 `selected`로 미리 찍고, `draft.isSingle`로 어느 쪽 레이아웃을
  꺼낼지 판단한다.

## 5. 알람 도표 UI (js/22c + HTML `#alarm-table`)

- **`table-layout:fixed`가 핵심.** 이게 없으면 `<th>`의 % 너비가 무시돼,
  `white-space:nowrap`인 이름/이메일이 **칸 밖으로 나가 옆 칸을 덮었다**
  (`박용훈 외 1명yhpark@kortek.co.kr 외 1`). fixed로 바꿔야 `text-overflow:ellipsis`가 먹는다.
- **체크박스 중앙정렬은 `display:block; margin:0 auto`로.** `text-align:center`는
  라인박스 서브픽셀에 따라 좌우가 13.5px/12.5px로 갈렸다. margin auto는 항상 대칭.
  헤더(HTML)와 행(js/22c) **양쪽 다** 적용돼 있다.
- 완료 예정일은 `white-space:nowrap` + 9% — 이게 없으면 `2026-10-\n02`로 접힌다.
- **발송 상태 칸은 말줄임을 일부러 안 넣었다** — `✓ D-7전<br>✓ D-3전`처럼
  여러 줄이 될 수 있어서. 가장 긴 `◻ 미발송 처리됨`일 때만 2줄로 접히고,
  칸 밖으로 나가지는 않는다.
- 열 너비 합 100%: 업무명 16 / 상태 6 / 발신인 8 / 발신메일 12 / 수신인 8 /
  수신메일 12 / 완료예정일 9 / D-Day 5 / 발송상태 9 / 마지막발송 10 / 일정 5.
  (+ 체크박스 36px, No. 36px)
- 단일 이름·이메일에도 `title`을 넣었다 — 전엔 "외 N명"일 때만 있어서 잘린
  단일 이메일은 전체를 볼 방법이 없었다.
- **실측(표 폭 1200px)**: 가로 넘침 0px, 행 높이 46px(1줄), 체크박스 헤더↔본문
  중심 오차 0px, 완료 예정일 1줄.

---

## 남은 확인 (사용자 손으로 해야 함)

브라우저 DOM 측정과 백엔드 직접 호출로는 통과했지만, **앱에서 끝까지 돌려본
적이 없는 것들**:

1. **앱에서 6자리 코드 조회** — `303410 303409 조회해줘`가 AI가 아니라 ZMM009
   도표로 떨어지는지. 백엔드는 실측 확인됐지만 js/33 라우팅은 미검증.
2. **엑셀 버튼 end-to-end** — `/sap-save-export` 라우트 존재만 확인했고
   실제 ZMM009 행으로 저장해 보지는 않았다.
3. **BOM 옵션 기본값 2회차** — 한 번 고른 뒤 다음 조회에서 채워져 있는지.
4. 알람 도표는 **실데이터(Drive 프로젝트)로는 미확인** — 주입한 샘플 행으로만 측정.

## 작업 중 알게 된 것

- **같은 저장소에서 다른 세션이 동시에 작업 중이었다.** HTML 수정(캐시버스터,
  `table-layout:fixed`, 열 너비)이 **다른 세션 커밋에 실려 올라간 경우가 여러 번**
  있었다. 커밋 전 `git diff --stat`에 손대지 않은 파일이 보이면 그 파일은 빼고
  내 것만 스테이징할 것 — 한 번은 untracked `js/38-bom-tab.js`를 참조하는
  미완성 HTML을 커밋할 뻔했다.
- **Bash 도구는 샌드박스라 `127.0.0.1:5000`에 못 붙는다**(curl exit 7).
  백엔드 호출 검증은 **PowerShell `Invoke-RestMethod`**로 할 것.
- 브라우저 pane의 `file://` 탭은 **탭을 다시 열어야 최신 HTML을 읽는다**
  (`location.reload()`로는 옛 내용이 남았다). `?cb=N`을 붙여 navigate 할 것.
  뷰포트도 탭이 바뀌면 초기화되므로 `resize_window`를 다시 불러야 한다.
