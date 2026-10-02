# CLAUDE.md

이 파일은 Claude Code(및 다른 AI 코딩 도구)가 이 저장소에서 작업할 때 참고하는 안내서입니다.
**작업 전에 이 파일부터 읽으면, 관련 파일을 찾으려고 여러 파일을 열어보거나 grep으로 전체를 훑는
과정을 건너뛸 수 있어 토큰 소비가 크게 줄어듭니다.**

## 프로젝트 개요

KORTEK 사내용 간트차트(Gantt Chart) 웹앱 — 프로젝트 일정 관리 + 메일 자동 분석/발송 +
Telegram 알람 + 주간 업무 보고 + 캘린더 뷰를 하나의 페이지에서 제공합니다.

- **프런트엔드**: `GANTT_CHART_V02_Color.html` 하나의 정적 HTML + `js/` 아래 다수의 `<script>` 태그.
  **번들러/빌드 과정 없음.** React/Vue 같은 프레임워크도, ES 모듈(`import`/`export`)도 쓰지 않는
  순수 vanilla JS이며, 모든 `<script>` 태그가 **하나의 전역 스코프를 공유**합니다.
- **백엔드**: `kortek_backend.py` (Flask, 포트 5000 고정) — 메일 발송/수신(SMTP/POP3), Telegram 알람,
  설정 암복호화, 예약 발송 스케줄러. 로컬 실행은 `kortek_backend.bat`, 의존성은 `requirements.txt`.
- **데이터 저장**: Google Drive 폴더(`SHARED_FOLDER_ID`, `js/04a-core-app-globals.js`) 안 프로젝트당
  JSON 1개. 팀별 폴더: `SHARED_FOLDER_ID/개발N팀/project.json`. 백업: `SHARED_FOLDER_ID/Backups/개발N팀/`.
  `findSaveFile`/`_listProjectFiles`는 `in ancestors`(하위 폴더 포함 재귀) 쿼리 사용.
- **로컬 구동**: `.claude/launch.json` — `python -m http.server 8934`. 자동화 테스트 없음.

## 🎯 최우선 개발 방향 — "학습으로 업그레이드되는 앱" (2026-09-21)

**하드코딩 지양 — 규칙·어휘·키워드·임계치는 데이터(카탈로그·원장·설정)로 분리.**

새 기능/수정마다 확인:
1. **신호** — 실패·교정을 `_issueLog`(Phase 10)로 기록. 조용히 삼키지 말 것.
2. **데이터화** — 새 규칙·어휘가 `SAP_CAPABILITIES` 등 카탈로그/원장에 있는가.
3. **군집** — 같은 종류 문제가 시그니처(`_qaIntentSig`)로 묶이는가.
4. **결정론 먼저** — 규칙/유사도 판정 우선, AI 추론은 임계치 초과 시만.
5. **사람 승인 후 적용** — AI가 프롬프트/사전/코드를 스스로 바꾸지 않는다.
6. **측정** — 해결됨 표시 후 같은 시그니처 재발이 보이는가.

**학습 인프라**: Phase 3(학습 로그)·4(재시도)·6(토픽 프로파일)·8(오염 감지)·9(군집)·10(이슈 수집)·11(질문 라우터) — 새 학습 기능은 이 기반을 재사용.

**하드코딩해도 되는 것**: 재무 커밋 확인, 마스킹 규칙, 인증/관리자 게이트, 사업자번호 제외 같은 가드레일.

## Git 작업 방식

**1인 작업 — 기본적으로 `main`에 직접 commit·push.** 별도 브랜치/PR 요청이 없는 한 항상 main에 바로 반영.

단, 대규모 리팩터링·데이터 저장 구조·API 계약 변경 등 되돌리기 어려운 변경은 먼저 물어볼 것.

## 컨텍스트 압축 전 CLAUDE.md 자동 갱신

`.claude/settings.json` **PreCompact 훅** — auto-compact 직전에 새 규칙/결정을 CLAUDE.md에 반영 지시.
**(2026-09-21) 상세 기록은 `docs/*.md`에, CLAUDE.md에는 한 줄 요약만** (CLAUDE.md가 비대해지면 토큰 소비 재발).
`/clear`는 훅 대상이 아님 — clear 전엔 직접 요청해서 정리.

## ⚠️ 가장 중요한 규칙: 로딩 순서 = 전역 스코프 순서

`<script src="js/...">` 태그 순서가 곧 실행·참조 순서. 파일명 숫자가 로딩 순서를 반영.

- 각 파일은 독립 모듈이 아님. `const`/`let` 최상위 변수도 이후 로드 스크립트에서 그대로 보임.
- 파일을 쪼갤 때 **top-level statement 경계에서만** 자를 것 — 함수/블록 중간에서 자르면 문법 오류.
- **⚠️ node 없음(2026-09-23 확인)** — 파싱 검증은 브라우저 콘솔에서:
  ```
  for (const s of [...document.querySelectorAll('script[src^="js/"]')].map(e=>e.getAttribute('src'))) { try { new Function(await (await fetch(s)).text()); } catch(e) { console.error(s, e.message); } }
  ```
  JS 고친 뒤 반드시 확인 — 리터럴 안 줄바꿈 하나로 파일 전체가 조용히 죽는다.
- **⚠️ 폰트/아이콘 깨지면 JS 문법 오류부터 의심(2026-09-30 반복 사고)** — Tabler 아이콘이 □로 깨지면 콘솔 파싱 명령으로 먼저 확인. 거대 템플릿 리터럴 안 백틱이 원인인 경우 많음.

## 파일 맵 (로딩 순서대로)

### 외부 라이브러리 (CDN)
`api.js`/`gsi client`(Google 인증), `xlsx-js-style`(엑셀), `pptxgenjs`(PPT), `pdf.js`(PDF),
`@tabler/icons-webfont`(아이콘 폰트) — `<head>`에서 CDN 로드.

### 초기화 / 인프라
| 파일 | 역할 |
|---|---|
| `01-gapi-gis-stub.js` | Drive 연동 레이스컨디션 방지용 gapiLoaded/gisLoaded 스텁 |
| `02-pdfjs-worker-init.js` | pdf.js worker 경로 초기화 |
| `03-drive-modal-drag.js` | 구글 드라이브 불러오기 모달 드래그 |

### `04-core-app.js` → 11개 분리
| 파일 | 담당 |
|---|---|
| `04a-core-app-globals.js` | 전역 변수 선언 (TDZ 에러 방지 최상단) |
| `04b-core-app-drive-sync.js` | Drive 연동 (저장/불러오기/백업). 팀 폴더 헬퍼: `getOrCreateTeamFolder`, `_moveFileToTeamFolder`, `_getOrCreateBackupTeamFolder` |
| `04c-core-app-mail-pipeline.js` | `project_index.json` 메일 자동처리 파이프라인, `serializedGlobalData` |
| `04d-core-app-gantt-core.js` | 날짜/일정 코어 로직, 공휴일 |
| `04e-core-app-undo-redo.js` | Undo/Redo (`recalculateSchedules` 종료 시 자동 스냅샷) |
| `04f`~`04j-core-app-upload-utils-N.js` | 파일 업로드/유틸리티. **💬 AI 문답: `04g`(컨텍스트/프롬프트), `04h`(모달·전송·태그), `04j`(SAP 로컬 명령)** |
| `04k-core-app-filter-export.js` | 필터 적용/파일명 조립 + 엑셀 출력 스타일러 |

### 기타 기능 파일
| 파일 | 역할 |
|---|---|
| `05-drive-sync-optimize.js` | Drive 연동 최적화 (F5 캐시 꼬임 방지) |
| `06-theme-color-chart.js` | 테마 색상 반영 & 차트 막대 색 |
| `07-data-loss-safeguard.js` | 데이터 유실 방지 안전장치 |
| `08-filter-ui.js` | 필터 UI |
| `09-autosave-user-id.js` | 1분 자동 저장, 로컬 사용자 식별 |
| `10-gantt-filter-date-ui.js` | 필터 티어드롭 팝업, 날짜 UI |
| `11-mobile-detect.js` | 모바일/카카오톡 인앱 브라우저 감지 |
| `12-mobile-longpress.js` | 모바일 롱탭 → 텍스트 수정 |
| `13-mobile-touch-timer.js` | 모바일 터치 타이머 |
| `14a`/`14b-ai-mail-analysis-N.js` | 메일 분석 → 간트 자동 추가 (Gemini). `14a`에 Phase 6 토픽 배지 훅 + Phase 7 `_initMultiProjectArea`/`mailDistributeToProject` |
| `14c-task-inbox.js` | [Phase 1] 업무 보관함 — 스테이징·자동배치 재시도·유휴 스윕(`_ibAutoPlaceSweep`). 묶음 삭제는 확인창 없이 `_tiUndoBuffer`로 취소 칩 제공 |
| `14d-distribution-ledger.js` | [Phase 2/2.5] 드라이브 배분 원장. `distSendTaskToTargets(task, targets, opts)`로 여러 프로젝트 동시 배분 |
| `15a-mail-attachment-tab.js` | 메일 파일 첨부 탭. `_confBadge(conf)` 전역 신뢰도 배지(여기서만 정의). Phase 7 다중 프로젝트 진입점 |
| `15b`/`15c-mail-server-tab-N.js` | 메일 서버 탭 1/2. 미분류 재분석 모달(`_msOpenReanalyzeHintModal`) + 다수 프로젝트 체크박스 선택(`_msQueueReanalyzeMulti`) |
| `16-wbs-level-colors.js` | WBS 레벨별 고정 회색 계조 |
| `17-weekly-report-modal-drag.js` | 주간 업무 보고 모달 드래그 |
| `18-mail-analyzer-modal-drag.js` | 메일 분석기 모달 드래그 |
| `19-shared-modal-drag.js` | 공통 모달 드래그 + 최소화(하단 taskbar). `_makeDraggable()` 호출 시 자동 최소화 버튼 |
| `20-weekly-report.js` | 주간 업무 보고 기능 본체 |
| `21-color-palette.js` | 컬러 팔레트 모달 (hex↔HSL) |
| `22a-summary-mctable-parse.js` | 엑셀 파싱: Summary/Brief SPEC/M.C Table |
| `22b-summary-mctable-core1.js` | 탭·서머리·M.C테이블 렌더링 1/4, `_addrSplitNames`/`_addrFindByName` |
| `22c-summary-mctable-core2.js` | 렌더링 2/4, `collectAlarmItems`/`saveAlarmSchedule` |
| `22d`/`22e-summary-mctable-core3/4.js` | 렌더링 3/4, 4/4 |
| `22f-address-book.js` | Address Book — CRUD/정렬 + 엑셀·CSV |
| `22g-name-autocomplete.js` | 이름 자동완성 — Address Book 기반 |
| `22h`/`22i-brief-mc-common-N.js` | Brief SPEC / M.C Table 공용 (NO 클릭, 묶음 선택/이동) 1/2, 2/2 |
| `23-sidebar-tabs.js` | 사이드바 접기/펴기 + 탭 전환 |
| `24-calendar-tab.js` | Calendar 탭 — 간트 업무 월간 캘린더 |
| `25-ai-learning.js` | Phase 3 학습 로그 + Phase 4 재시도 엔진(`_alTriggerRetry`, `getAiRetryAutoEnabled`) |
| `26-topic-profile.js` | Phase 6 토픽 프로파일. `_tpMaybeAutoRegen(fileId,rows,colIdx,projectMeta)`로 헤드리스 프로젝트 자동 재생성(fileId별 독립 쿨다운) |
| `27-topic-contamination.js` | Phase 8 토픽 오염 감지·AI 자가진단(`_tcRunDiagnosis`, `_tcApplyFix`) |
| `26-gantt-search.js` | 간트차트 내 키워드 검색 |
| `28-new-project-wizard.js` | 새 프로젝트 마법사. `_npwOpen(prefill, 'MP(EC)')` — 미분류 메일 AI pre-fill 지원 |
| `29-new-project-cluster-detect.js` | Phase 9 완전 미분류 군집 감지 → 신규 프로젝트 배너 제안. **스스로 프로젝트 생성 안 함** |
| `35-material-cart.js` | 🧺 자재 보관함 — SAP 자재청구/입고(MB21 예약) 장바구니. **Phase 1 "업무 보관함"(14c)과 다른 것** |

> `04`, `14`, `15`, `22`는 원래 하나의 거대 파일(최대 11,915줄)을 쪼갠 것.

### Phase 1~11 AI 학습 시스템 요약
| Phase | 내용 | 주요 파일 |
|---|---|---|
| 1 | 업무 보관함 (Task Inbox) | `14c-task-inbox.js` |
| 2/2.5 | 드라이브 배분 원장 | `14d-distribution-ledger.js` |
| 3 | AI 학습 로그 (`_writeLearningEntry`) | `25-ai-learning.js` |
| 4 | 재시도 엔진 (`getAiRetryAutoEnabled`) | `25-ai-learning.js` |
| 5 | 신뢰도 배지 (`_confBadge`) | `15a`, `15c` |
| 6 | 토픽 프로파일 (`_tpMaybeAutoRegen`) | `26-topic-profile.js` |
| 7 | 다중 프로젝트 배분 | `14a`, `15a`, HTML |
| 8 | 토픽 오염 감지·자가진단 | `27-topic-contamination.js` |
| 9 | 완전 미분류 군집 감지 | `29-new-project-cluster-detect.js` |
| 10 | 이슈 수집/군집/학습 루프 → `docs/phase10-issue-learning-design.md` | `30-issue-collector.js`, `31-issue-report.js` |
| 11 | 질문 라우터 + SAP 적립학습 → `docs/qa-router-and-sap-learning.md` | `32-sap-capabilities.js`, `33-qa-router.js` |

## 📚 상세 문서(`docs/`) 색인 — 해당 작업을 할 때만 읽을 것

**CLAUDE.md는 색인만 — 상세 기록은 `docs/*.md`에 추가. CLAUDE.md가 비대해지면 토큰 소비 재발.**

### `docs/mail-pipeline.md` — 메일 분석/원문/번역/토픽 프로파일 재생성
- **읽을 때**: 메일→업무 등록 경로, 다중 배분, 미분류 재분석, 번역, 보관함 삭제
- 업무 복사/이동 코드에서 `buildMailTaskRow` 4번째 인자 `mailRaw` 빠뜨리지 말 것 — "원문 보기" 조용히 사라짐
- 헤드리스 Drive PATCH 직전에 `_tpMaybeAutoRegen(fileId,rows,colIdx,projectMeta)` 호출 — `rows/colIdx/projectMeta` 생략 시 열려있는 엉뚱한 프로젝트를 읽음
- 백그라운드 루프에서 `recalculateSchedules()`·`saveToGoogleDrive()` 반복 호출 금지 — 끝에 1회만
- 보관함 삭제: `markDeleted()` 호출 필수 + 묘비(tombstone) 없으면 Drive 재로드 시 되살아남
- 새 localStorage 저장소: `window.STORAGE_REGISTRY`(`js/34-storage-doctor.js`)에 정리 규칙 등록

### `docs/gantt-internals.md` — 일정 계산/탭 복원/표 오버레이/AI 검색
- **읽을 때**: `recalculateSchedules`·`_calcStartTs`, Undo, `.no-td` 오버레이, 체크박스 일괄 작업
- Undo 스냅샷은 구조 공유(증분) — 복사본 직접 수정 금지, 복원 시 반드시 새 배열로
- 그룹행 날짜순 정렬은 하위 전체 재귀 최솟값(`effectiveTs`)으로 — 배열 순서 부산물 아님
- 체크박스 다중 선택은 배열 인덱스 말고 **행 객체 참조 Set** — 배경 재렌더로 인덱스 어긋남

### `docs/ai-qa.md` — 💬 AI 문답 (`04g`/`04h`/`04j`)
- **읽을 때**: AI 문답 프롬프트·로컬 명령·`[[ACTION]]` 태그·드롭다운·히스토리
- **프롬프트 문자열 안 백틱(`` ` ``) 절대 금지** — 바깥 템플릿 리터럴이 깨져 파일 전체가 죽음
- 필수 규칙은 `_buildGanttQaPrompt` 치환 이후 append 구간에 추가 — `gantt_qa_prompt`가 기본 템플릿 통째 대체함
- AI-free 로컬 명령 블록: `return` 전에 `_ganttQaRecordQuestionFreq(question)` 직접 호출 — AI 호출 직전 한 곳에서만 기록되므로 생략 시 "자주 쓰는 질문"에 안 쌓임
- `_ganttQaPatternKey`(빈도 집계, 4자리+ 숫자 제외) vs `_ganttQaNormalizeQ`(재질문 감지, 숫자 다르면 다른 질문) — 정반대 요구사항, 절대 합치지 말 것
- ZMM009 ALV 컬럼은 계정별 레이아웃 — 없는 게 아니라 숨겨진 것일 수 있음. 헤더로 실제 확인 후 없을 때만 MM03 폴백

### `docs/sap-lookup.md` — 🏭 SAP 조회 연동 (`sap_bridge_32.py`, `/sap-*`)
- **읽을 때**: SAP GUI 자동화 전반. **SAP 기능 안 될 때 원인 이력이 여기 다 있음 — 먼저 검색.**
- `kortek_backend.py`에서 `win32com` 직접 import 금지 — `py -3-32 sap_bridge_32.py` 서브프로세스만
- **SAP 자동 로그인 다시 제안 금지** — 사람이 미리 로그인해둔 세션에 올라탐
- **MCP(mcp-sap-gui)는 런타임에서 쓰지 않음(2026-10-02 A안)** — 새 기능 화면 탐색용 개발 도구 전용. 런타임 SAP 경로는 `sap_bridge_32.py` 하나뿐
- **클라우드 세션(claude.ai/code)에서는 SAP 실측 불가** — `127.0.0.1:5000`이 빈 컨테이너. 덤프는 채팅에 붙여넣거나 PC 세션에서 작업
- **⚠️ SAP 필드 검색어엔 컨트롤 접두어(`txt`/`ctxt`) 필수** — `_find_by_id_substring`이 같은 이름의 GuiLabel을 먼저 집어 "재고 0 EA" 오답·가격조회 실패를 냈음(2026-10-02). 파싱 실패를 기본값으로 삼키지 말 것
- **SAP 자동화는 화면 전환 순서를 코드에 박지 말 것** — 상태바를 읽고 반응하는 루프로(`_mb21_fill_texts_and_save`). 고정 순서로 짰다가 MB21 저장에서 두 번 실패(`virtual key not enabled` → `유효한 기능을 선택하십시오`). `tbar[0]/btn[11]`은 SAP 표준 **저장**
- **"The virtual key is not enabled" = 그 화면에서 기능키가 잠긴 것** — MB21이면 필수입력(품목 텍스트) 미입력. `_sap_send_vkey`(툴바 버튼 폴백) + `humanize_sap_error`(상태바 포함 한국어) 사용
- **자재 보관함: 사유(RESB-SGTXT)는 품목마다 필수** — 521 그리드엔 열이 없어 상세화면(510)을 순회해 입력
- **자재 보관함은 확인 1회 후 MB21→ZMM019 출력까지 자동** (구매오더와 같은 원칙, 임의 정지 금지). 결과는 채팅이 아니라 **모달 상태줄**에도 표시할 것 — 채팅이 닫혀 있으면 "멈춘 것처럼" 보인다
- **자재 보관함(`js/35`)은 MB21 예약 생성 + ZMM019 청구서출력**(MIGO 안 씀). 한 예약 **43건** 한계, 초과분은 쪼개서 생성. 목적(YYDEVTYPE)은 " 기타" 코딩블록 필수
- **SAP 화면 덤프는 팝업(`wnd[1]`+)부터** — 큰 화면이 8초 제한을 먹어 팝업까지 못 가던 문제(2026-10-02)
- **SAP 조회 결과 출력은 `_ganttQaFormatSapRecord`** — 1건×컬럼8↑이면 세로 카드, 그 외 가로 표. 컬럼순서 `SAP_RESULT_LAYOUT`(js/32)·라벨 `_SAP_FIELD_LABEL_MAP`(js/04h), 둘 다 데이터
- 새 SAP 기능 요청: 코드 전에 `curl http://127.0.0.1:5000/sap-dump-screen` 직접 호출 (사용자에게 "XX 화면 열어두고 알려주세요" 요청 후)
- **SAP 로컬 명령 트리거 어휘는 `SAP_CAPABILITIES[].kw` 카탈로그 + `_sapCapKwHit()` — 코드 정규식 금지**
- 프로젝트 코드 조회: 숫자 있으면 오더 칸, 문자만이면 내역 칸. 0건이면 반대쪽 자동 재검색. F4 재진입 전 화면/필드 참조 반드시 다시 찾을 것(재렌더로 COM 참조 죽음)

### `docs/purchase-order.md` — 🛒 구매오더 (PDF→AI→ZMMR060/ZMM018)
- **읽을 때**: 구매오더 요청, 세금계산서/거래명세서 복수 처리, 발주서 출력
- 이 회사(코텍, 사업자번호 130-81-44628)는 항상 구매자 — **코드에서도** 협력사 후보 제외
- 확인 1회 후 SAP 입력~저장~발주서는 완전 자동 — 되돌리라는 요청 없이 임의로 정지 금지

### `docs/backend-auto-update.md` — 🔄 백엔드 자동 업데이트/재시작
- **읽을 때**: `/self-check-update`·`/self-update`, `kortek_backend.zip`, `.bat`/`.vbs` 변경
- 새 배포 파일 추가 시: `_SELF_UPDATE_FILES` + `.claude/settings.json` zip 목록 **둘 다** 갱신
- **`/self-update`는 쓰기 전에 검증**(0바이트·`.py` 문법) + 하나라도 실패하면 전부 중단 + `.bak` 백업 — 깨진 파일이 main에 올라가 팀원 PC가 같이 죽은 사고(2026-10-02) 대응
- **백엔드 `.py` 커밋 전 `py -3-32 -m py_compile` 필수** — 그 한 줄이면 위 사고는 안 났다
- `.bat`/`.vbs`는 항상 CRLF(LF-only는 cmd 파서 오동작)

### `docs/html-corruption-recovery.md` — 🔥 HTML 인코딩 손상 복구
- **읽을 때**: 한국어가 `?◆◆`으로 깨지거나 배경 클릭 시 외부 사이트로 이동
- 원인: PowerShell `Set-Content`/`Out-File` → UTF-8 한국어 `?` 치환. **HTML 수정은 Python `open(...,'wb')`만.**

### `docs/ui-conventions.md` — 🌐 i18n / 🎨 팔레트 / 🪟 모달 컨벤션
- **읽을 때**: 새 UI 컴포넌트, 언어 대응, 테마 팔레트, 모달 구조
- 새 UI 완료 기준 3가지: 영문 대응(`_t`/`data-i18n`) + 팔레트 대응(`_cpApplyLive` 좁은 셀렉터) + 모달 컨벤션(`_makeDraggable`·`_bindClickToFront`·`bringModalToFront` 호출)

### `docs/admin-password.md` — 🔑 관리자("팀") 비밀번호
- **읽을 때**: 비밀번호 게이트, 메일/텔레그램 암복호화, Drive 동기화
- 새 게이트는 반드시 `adminPwMatches()` 사용. 하드코딩 기본값 없음(소스 공개).

### `docs/phase10-issue-learning-design.md` — 📊 Phase 10 이슈 수집/학습
- **읽을 때**: 이슈 수집·🚩 신고·리포트·스냅샷·`/issue-*` 엔드포인트
- 요청 상관 id는 **쿼리 `_rid`** (커스텀 헤더 금지 — CORS). 즉시 끄기: `localStorage.gantt_issue_collect_off='1'`

### `docs/qa-router-and-sap-learning.md` — 🧭 질문 라우터 + SAP 적립학습 (Phase 11)
- **읽을 때**: 질문 분류(SAP/프로젝트/일반), 칩·접두어·배지, SAP 기능 카탈로그, 학습 원장
- 새 SAP 기능 구현 시: `SAP_CAPABILITIES`(`js/32`)에 항목 추가 + 리포트 학습 탭 `구현됨` 처리
- 새 앱 기능 구현 시: `APP_CAPABILITIES` + `QA_CHAIN_INTENTS` (둘 다 `js/32`, 데이터) 추가

### 백엔드 파일
| 파일 | 역할 |
|---|---|
| `gas/Code.gs` | AI 프록시(Google Apps Script 웹앱) 소스 사본. 수정 후 Apps Script 편집기에서 **기존 배포 편집 → 새 버전**으로 배포(새 배포 만들면 URL 바뀜) |
| `kortek_backend.py` | Flask 서버. 메일 SMTP/POP3, Telegram, 암복호화, 예약 발송 스케줄러 |
| `sap_bridge_32.py` | SAP GUI 32비트 브릿지 — `py -3-32` 서브프로세스. `kortek_backend.zip`에도 반드시 포함 |
| `kortek_backend.bat` | 백엔드 실행. SAP용 32비트 Python/pywin32 최초 1회 자동 설치 |
| `kortek_backend_install.bat` | 원클릭 설치 — 시작프로그램 자동등록 + 즉시 최소화 실행. 임시 `.ps1`로 따옴표 이스케이프 우회 |
| `kortek_backend_start_minimized.vbs` | 위 설치 바로가기 대상 — `kortek_backend.bat`을 최소화 상태로 실행 |
| `kortek_backend.zip` | 배포용 압축. `kortek_backend.py`+`sap_bridge_32.py`+`.bat`+`_install.bat`+`.vbs`+`matgroups.json`+`templates/` 포함. PostToolUse 훅이 자동 재생성(단, 설치스크립트만 수정 시 수동) |
| `matgroups.json` | 자재그룹 코드→명칭 618건 (승인원 표지용) |
| `templates/승인원_양식.xlsx`, `templates/승인원_양식.docx` | 승인원 표지 양식 |
| `requirements.txt` | flask, flask-cors, requests, cryptography, google-auth, openpyxl, python-docx |

> **Notice 탭 오류**: 구버전 백엔드는 `/schedule` 404 → `_scheduleRules = 'outdated'` 경고 표시.

### 스타일
| 파일 | 역할 |
|---|---|
| `styles.css` | 전체 스타일시트 (2,034줄, 미분리) |

## 작업 팁

- 특정 기능 수정 시 파일 맵에서 바로 지정. 못 찾겠으면 `grep -rn "함수명" js/`.
- 민감 파일(`mail_config.json`, `telegram_config.json`, `schedule_rules.json`, `.env`)은 `.gitignore` — 로컬에만 존재.
- 코드 주석의 `js/파일명.js:줄번호` 참조는 파일 이동/분리 시 같이 업데이트.
- **⚠️ `js/*.js` 수정 시 `GANTT_CHART_V02_Color.html`의 캐시버스터 `?v=YYYYMMDDx`도 같이 올릴 것** — 전체 `<script>` 태그가 같은 값을 공유하므로 Python으로 일괄 치환: `python -c "d=open('GANTT_CHART_V02_Color.html','rb').read(); open('GANTT_CHART_V02_Color.html','wb').write(d.replace(b'v=OLD',b'v=NEW'))"`
- **⚠️ HTML 파일은 절대 PowerShell `Set-Content`/`Out-File`로 수정 금지** — UTF-8 한국어 바이트 `?` 치환·태그 깨짐. Python `open(...,'wb')` 또는 `[System.IO.File]::WriteAllText(..., Encoding::UTF8)` 사용. 손상 복구 → `docs/html-corruption-recovery.md`.
