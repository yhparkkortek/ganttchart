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

**⚠️⚠️ 커밋 전 반드시 `git fetch origin main` → 뒤처졌으면 pull 먼저.** 오래된 작업본에서
커밋하면 **관련 없는 파일이 통째로 과거로 되돌아간다.** 2026-10-02 하루에만 두 번 났다 —
`192c8fa`(AI 학습 flush)와 `30f87c2`(BOM 조회 차단 제거)가 각각 `sap_bridge_32.py`를
194줄·236줄 되돌렸고, **문법 오류가 없어 둘 다 조용히 넘어갔다.** 두 번째는 `/sap-dump-windows`
라우트만 남고 함수가 사라져 호출하면 NameError가 나는 상태였다.
→ `git diff --stat`에 **손대지 않은 파일**이 보이면 그 자리에서 멈출 것.
**(2026-10-12) 이제 `.claude/settings.json` PreToolUse 훅이 기계적으로 막는다** — `git commit` 시 `origin/main`보다 뒤처져 있으면 차단 + 되돌아갈 파일 목록 표시. PowerShell이라 클라우드 세션에선 조용히 통과(onFailure=continue).

단, 대규모 리팩터링·데이터 저장 구조·API 계약 변경 등 되돌리기 어려운 변경은 먼저 물어볼 것.

## 컨텍스트 압축 전 CLAUDE.md 자동 갱신

`.claude/settings.json` **PreCompact 훅** — auto-compact 직전에 새 규칙/결정을 CLAUDE.md에 반영 지시.
**(2026-09-21) 상세 기록은 `docs/*.md`에, CLAUDE.md에는 한 줄 요약만** (CLAUDE.md가 비대해지면 토큰 소비 재발).
`/clear`는 훅 대상이 아님 — clear 전엔 직접 요청해서 정리.

## ⚠️ 가장 중요한 규칙: 로딩 순서 = 전역 스코프 순서

`<script src="js/...">` 태그 순서가 곧 실행·참조 순서. 파일명 숫자가 로딩 순서를 반영.

- 각 파일은 독립 모듈이 아님. `const`/`let` 최상위 변수도 이후 로드 스크립트에서 그대로 보임.
- 파일을 쪼갤 때 **top-level statement 경계에서만** 자를 것 — 함수/블록 중간에서 자르면 문법 오류.
- **✅ node 있음(2026-10-15 확인, `C:\Program Files\nodejs\node`)** — 1차 검증은 `node --check js/파일.js`가 가장 빠름(예전 "node 없음" 기록은 틀림).
- **✅ (2026-10-19) 커밋 시 js/ 전체 문법 검증이 자동이다** — `.claude/settings.json` PreToolUse 훅이 `.claude/hooks/precommit-oxlint.ps1`을 돌려 63개 파일을 0.6초에 검사하고, **오류가 있으면 커밋을 차단**한다. 경고는 차단하지 않음(도입 당시 427건 중 328건이 전역 스코프 때문에 생긴 no-unused-vars 오탐 — `npm run lint`로 따로 봄). 규칙은 `.oxlintrc.json`. 새 PC는 `npm install` 1회 필요 — 미설치면 훅이 조용히 통과하므로 수동 `node --check`가 여전히 최후 방어선.
- 전체 스크립트 일괄 파싱 검증은 브라우저 콘솔에서:
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
| `29-new-project-cluster-detect.js` | Phase 9 완전 미분류 군집 감지 → 신규 프로젝트 배너 제안. **스스로 프로젝트 생성 안 함**. ⚠️ AI 판정은 **한 스윕 8개 상한 + 간격**(`_NCD_JUDGE_*`) — 상한 없을 때 백로그 76연발로 하루 한도를 태웠다(2026-10-21) |
| `35-material-cart.js` | 🧺 자재 보관함 — SAP 자재청구/입고(MB21 예약) 장바구니. **Phase 1 "업무 보관함"(14c)과 다른 것** |
| `36-sap-login.js` | 🔑 SAP·그룹웨어 로그인 설정 모달. 그룹웨어 자동 로그인 게이트 `_gwEnsureLogin`(재시도 금지 가드)도 여기 |
| `37-project-cache.js` | 프로젝트 데이터 3-Layer 캐시 |
| `38-bom-tab.js` | 📋 BOM 탭 + **Elec Parts 내장 BOM**. SAP 텍스트 파서 `_bomParseSapText`(설치지점 연속 행 병합), 행 클릭 조회 `bomSelectComponent`, 엑셀 출력, `_elecBomItemCode`(주요자재에서 부품 코드) |
| `39-groupware-calendar.js` | 그룹웨어 일정을 Calendar 탭에 겹쳐 표시 |
| `40-qa-tool-router.js` | 🛠 AI 문답 도구 자율 호출 — `QA_TOOLS` 레지스트리(데이터)·인자 검증·에이전트 루프. **읽기 전용**. 새 조회 기능은 여기 한 줄 추가 → `docs/qa-tool-router.md` |
| `42-page-excel-io.js` | 📄↔📊 페이지 ↔ 엑셀 왕복(출력 → 엑셀 수정 → 다시 불러오기). 인쇄 버튼 **왼쪽에 런타임 삽입**. 대상·시트 구성은 `PAGE_EXCEL_SPECS`(데이터) 한 곳 — 새 페이지는 항목 하나만 추가. 통째 교체 + 되돌리기. 파생 뷰(Calendar·주간보고·알람)는 되돌려 넣지 않음. **🤖 비규격 파일(PDF·TXT·HTML·남의 엑셀)은 AI가 매핑** — 블록의 `ai:{fields,labels,prompt}`(데이터)에 적고, 규격 파일은 AI를 **안 거친다**(결정론 우선 + 무료 키 하루 한도). 적용 전 미리보기 승인 필수. 현재 Customer SPEC만 연결됨 |
| `43-briefspec-units.js` | 🧩 Customer SPEC을 **제품구분자(모델)별**로 보관. `tabData.briefSpecByUnit[모델]`, `tabData.briefSpec`은 **지금 모델의 배열을 가리키는 별칭**(M.C의 `mcTable`↔`mcRevisions.R1`과 같은 방식)이라 기존 8개 파일은 손 안 댐. 제품구분자는 M.C/BOM과 **공유**(`mcActiveUnit`). 옛 Model A/B/C는 `bsMigrateFromModelCols()`가 열 이름(`bsColLabels`)을 모델명으로 삼아 자동 이전 — 파일 열 때마다 확인, 멱등. `mcSwitchUnit`·`collectTabData`·`populateTabData`를 **감싸서** 끼어든다 |
| `41-qa-write-tools.js` | ✍️ 쓰기 도구 — **AI가 스스로 실행 안 함**. 초안→사람 확인 1회→자동. `verified:'pending'`은 요청 본문 미확정이라 실행 차단 |

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
- **⚠️ Phase 9 군집 판정은 "AI 업무 분석 모달을 열 때마다" 돈다** — `pending`이 쌓여 있으면 사람이 분석을 누른 적 없어도 스윕당 8개씩 AI가 나간다(실측 494개 누적). **임계치·필터를 완화하기 전에 누적 백로그 크기를 먼저 확인할 것** — 완화는 과거 데이터에 소급 적용된다. 모르고 임계치만 내려 한 스윕 76연발로 하루 한도를 태운 사고(2026-10-21) 이력이 문서에 있음

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
- **SAP 자동 로그인은 2026-10-13부터 지원**(사용자가 사내 전용이라며 번복) — 설정은 AI 문답 창 🔑 버튼(`js/36-sap-login.js`), 비밀번호는 Windows DPAPI로 `sap_login_config.json`(.gitignore)에만 저장, 로그인 실패는 **절대 재시도 금지**(계정 잠금), 비밀번호를 명령줄/로그/응답에 싣지 말 것. 상세는 docs/sap-lookup.md
- **MCP(mcp-sap-gui)는 런타임에서 쓰지 않음(2026-10-02 A안)** — 새 기능 화면 탐색용 개발 도구 전용. 런타임 SAP 경로는 `sap_bridge_32.py` 하나뿐
- **클라우드 세션(claude.ai/code)에서는 SAP 실측 불가** — `127.0.0.1:5000`이 빈 컨테이너. 덤프는 채팅에 붙여넣거나 PC 세션에서 작업
- **⚠️ SAP 필드 검색어엔 컨트롤 접두어(`txt`/`ctxt`) 필수** — `_find_by_id_substring`이 같은 이름의 GuiLabel을 먼저 집어 "재고 0 EA" 오답·가격조회 실패를 냈음(2026-10-02). 파싱 실패를 기본값으로 삼키지 말 것
- **MB21 저장 완료 신호 = 초기화면(500) 복귀** — 상태바에 예약번호가 안 남는다. `_mb21_read_last_rsnum()`이 MB23(직전 문서번호 기억)에서 회수. 완료를 못 읽고 또 저장하면 "유효한 기능을 선택하십시오"
- **SAP 실패 메시지엔 `_sap_screen_info()`(트랜잭션/화면번호/제목/열린 팝업) 필수** — 상태바만으론 어디서 막혔는지 몰라 추측으로 두 번 실패했다. 코딩블록 팝업이 안 닫히면 wnd[0] 저장이 전부 막힘
- **SAP 자동화는 화면 전환 순서를 코드에 박지 말 것** — 상태바를 읽고 반응하는 루프로(`_mb21_fill_texts_and_save`). 고정 순서로 짰다가 MB21 저장에서 두 번 실패(`virtual key not enabled` → `유효한 기능을 선택하십시오`). `tbar[0]/btn[11]`은 SAP 표준 **저장**
- **"The virtual key is not enabled" = 그 화면에서 기능키가 잠긴 것** — MB21이면 필수입력(품목 텍스트) 미입력. `_sap_send_vkey`(툴바 버튼 폴백) + `humanize_sap_error`(상태바 포함 한국어) 사용
- **저장창 파일이름 Edit = `id=1001`·보임·버튼 바로 위** (2026-10-02 ID 덤프 확정, 주소줄은 `id=41477`·숨김). 트리 덤프는 들여쓰기를 **깊이가 아니라 `GetParent`** 에서 뽑을 것 — 너비우선 들여쓰기가 조상을 오인하게 만들었다
- **파일 저장 창에서 `ComboBoxEx32`는 파일이름이 아니라 주소줄** (2026-10-02 실측) — 가점 주면 경로를 주소줄에 써서 폴더만 이동한다. 주소줄/검색 띠 조상(`ReBarWindow32`/`WorkerW`/`Address Band Root`/`ComboBoxEx32`…)은 **제외** 신호. 최소화 창도 `IsWindowVisible`=True이니 `IsIconic`으로 뺄 것. 네이티브 클릭은 좌표 말고 `SendMessage(BM_CLICK)`
- **Windows 대화상자 버튼은 `저장(&S)`처럼 니모닉이 붙는다** — `&`만 떼고 `== '저장'` 하면 빗나감(`_norm_label`). 파일이름 Edit은 **y좌표 말고 정체**로(ComboBoxEx32 조상 + 값이 `.pdf`) — 검색 상자도 Edit이다. 청구서 PDF는 `C:\SAP_DMS\계정대체청구서\<예약번호>.pdf`
- **Windows 창은 `dump_windows_dialogs`/`/sap-dump-windows`("윈도우 화면 덤프해줘")로 따로 덤프** — SAP 덤프엔 안 나온다. SAP 세션을 안 써서 **모달이 COM을 막고 있을 때도** 동작. `js/04h`에서 **screendump 블록보다 위**에 둘 것(kw `덤프`가 겹침). 자주 쓰는 질문 시드 추가 시 `gantt_qa_sap_seeds_vN` 플래그도 올릴 것 + 예시 목록은 한/영 두 벌
- **ZMM019 인쇄 창은 SAP 창이 아니라 Windows 대화상자(`#32770`)** — `wnd[1]`로 안 잡히고 `press()`가 블록된다. 누르기 **전에** 워치독 스레드(`_win_print_dialog_watchdog`)를 띄우고, PDF는 폴더 감시로 회수(`_wait_new_pdf`). 자재 보관함은 **팀원 각자 개인 PC** 사용 — PC 설정 전제 금지
- **자재 보관함: 사유(RESB-SGTXT)는 품목마다 필수** — 521 그리드엔 열이 없어 상세화면(510)을 순회해 입력
- **자재 보관함은 확인 1회 후 MB21→ZMM019 출력까지 자동** (구매오더와 같은 원칙, 임의 정지 금지). 결과는 채팅이 아니라 **모달 상태줄**에도 표시할 것 — 채팅이 닫혀 있으면 "멈춘 것처럼" 보인다
- **자재 보관함(`js/35`)은 MB21 예약 생성 + ZMM019 청구서출력**(MIGO 안 씀). 한 예약 **43건** 한계, 초과분은 쪼개서 생성. 목적(YYDEVTYPE)은 " 기타" 코딩블록 필수
- **SAP 화면 덤프는 팝업(`wnd[1]`+)부터** — 큰 화면이 8초 제한을 먹어 팝업까지 못 가던 문제(2026-10-02)
- **MM03 가격/공급업체: 화면 스캔 텍스트는 출력 금지(사용자 요청 2026-10-13, "대부분 가비지")** — 개당 단가는 굵게 X·KRW 정수, 가격 조회는 자재코드·내역을 함께 표시(내역2는 이미 확인된 경우만 — **없는 정보를 일부러 조회하러 가지 말 것**). 한 화면에서 필드 여러 개 읽을 땐 `_scan_screen` 한 번 스캔(필드마다 트리 순회 금지, 46초 사고). 새 세션 인계는 docs/sap-lookup.md 맨 아래
- **SAP 조회 결과 출력은 `_ganttQaFormatSapRecord`** — 1건×컬럼8↑이면 세로 카드, 그 외 가로 표. 컬럼순서 `SAP_RESULT_LAYOUT`(js/32)·라벨 `_SAP_FIELD_LABEL_MAP`(js/04h), 둘 다 데이터
- **BOM 설치지점(EBORT)은 옵션만 켜선 안 나온다 — 그 열을 가진 ALV 레이아웃이 필요**(2026-10-16 실측). `/STD_MC`엔 EBORT 없음.
- **⚠️ (2026-10-20 정정) `/LOC`을 쓰지 말 것 — 정렬이 걸려 있어 설치지점이 어긋난다.** 설치지점이 여러 곳인 부품은 ALV가 행을 쪼개 주는데(첫 행에만 구성부품, 나머지는 **EBORT만** 있고 다른 값은 전부 빈칸), 정렬되면 그 연속 행들이 뒤로 몰려 **주인을 못 찾는다**(자재 303222에서 한 부품이 199개를 다 먹음). → **`layout=none`**(화면 기본 레이아웃)을 쓸 것. STUFE·EBORT를 둘 다 주면서 자연 순서라 연속 행이 제 부품 바로 뒤에 온다 — 264행(부품 65+연속 199), 64개 부품 전부 '지점 수 = 수량' 일치 실측. 파서(`_bomParseSapText`)에 수량 초과분을 버리고 `locOverflow`로 신고하는 가드가 있다, `/SEOK_설치지점_재`는 이름과 달리 **STUFE가 없어 계층 파싱 불가**. `/LOC`이 빠뜨리는 WGBEZ60은 ZMM009 보강이 채움. **ZMM009 119컬럼에 통화 컬럼이 아예 없음** = 표준가격은 KRW 고정(단가 환종 혼용 대응 코드는 데이터 기반으로 넣어둠)
- **새 SAP 화면 자동화는 "기록 및 재생" 녹화 매크로를 먼저 받을 것** — 덤프는 "보이는 것"만, 녹화는 **절대경로·버튼 인덱스·팝업 닫는 법**까지 준다. 추측으로 3번 실패한 뒤 녹화 한 번에 해결(2026-10-02)
- 새 SAP 기능 요청: 코드 전에 `curl http://127.0.0.1:5000/sap-dump-screen` 직접 호출 (사용자에게 "XX 화면 열어두고 알려주세요" 요청 후)
- **SAP 로컬 명령 트리거 어휘는 `SAP_CAPABILITIES[].kw` 카탈로그 + `_sapCapKwHit()` — 코드 정규식 금지**
- **검색도움말 히트 목록은 수백 건일 수 있다** (녹화 매크로 `maximum=469`) — 다 긁으면 백엔드 90초 타임아웃. `_SEARCHHELP_SCROLL_BUDGET`(12초)·상한 120건으로 끊고 **끊었다는 사실을 결과에 공개**(`partial`). 히트 1건이면 SAP이 목록 없이 값만 넣고 팝업을 닫으니 `COBL-AUFNR`을 읽을 것. **`except: pass` 금지**
- **프로젝트 조회는 `projectcode` 카탈로그로 판정** (2026-10-12) — 정규식이 남아 있어 "프로젝트 조회해줘"가 **자재내역** 조회로 샜다. 코드/이름 판정은 **패턴에 숫자가 있으면 오더**, 문자만이면 내역 — "내역"이라는 말이 패턴 모양을 이기면 안 됨
- 프로젝트 코드 조회: 숫자 있으면 오더 칸, 문자만이면 내역 칸. 0건이면 반대쪽 자동 재검색. F4 재진입 전 화면/필드 참조 반드시 다시 찾을 것(재렌더로 COM 참조 죽음)

### `docs/groupware.md` — 🏢 그룹웨어(다우오피스) 연동 (`gw_bridge.py`, `/gw/*`)
- **읽을 때**: 그룹웨어 일정·주소록·전자결재 기안. **그룹웨어 기능 안 될 때 원인 이력이 여기 다 있음 — 먼저 검색.**
- 사람이 로그인해 둔 **전용 크롬**(CDP 9222, `KortekGW\cdp-profile`)으로 **내부 REST API**를 호출한다 — DOM 스크래핑 아님, Playwright 안 씀, OAuth 불필요
- **API 경로를 추측하지 말 것** — 추측 12개가 전부 404. CDP Network로 그 화면이 실제로 보내는 요청을 관찰해 확정
- 자동 로그인은 **1회만, 실패 시 재시도 금지**(실패해야 CAPTCHA가 뜨는 구조 → 사내 계정 잠금). 진짜 버튼은 `<a id="login_submit">`(숨은 `input[type=submit]` 주의), 제출 결과는 **바깥에서 폴링**(페이지 이동으로 JS 컨텍스트가 죽음), 로그인 직후 소개 투어(`.welcome_skip`) 닫아야 함
- **(2026-10-20) 새 그룹웨어 경로는 `/gw/status`를 직접 부르지 말고 `_gwEnsureLogin(onStep)`(js/36) 게이트를 쓸 것** — 끊겨 있으면 저장된 계정으로 1회만 자동 로그인한다. 그전까진 AI 문답 경로가 전부 "🔑에서 로그인해주세요"로 포기해 계정을 저장해 뒀어도 매번 사람이 눌러야 했다. **재시도 금지 가드는 프런트(게이트)에 있다** — 백엔드 `login_once()`는 실패를 기억하지 않아 부를 때마다 시도한다. 연결: js/40 도구 루프 + js/04h 3곳
- **⚠️ 페이지 안 `el.click()`은 이 사이트에서 무반응 — 클릭은 `click_in_gw()`(CDP Input, 신뢰된 마우스 이벤트)로**(2026-10-19 실측). 핸들러가 `#loginForm`에 **위임**돼 있어 버튼 자체엔 리스너가 0개다. "보안문자가 안 뜨는데 로그인도 안 된다" = **제출이 서버까지 간 적이 없다**는 지문 — 자격증명 의심 전에 CDP Network로 요청이 나갔는지부터 확인할 것
- **상신(결재요청)은 하지 않는다 — 임시저장까지만.** 기안 입력칸 `editorForm_N`은 양식마다 달라 **열 머리글/행 라벨로 역매핑**(하드코딩 금지)
- 공급업체는 `MARA-ZLIFNR`이 비면 **ZMM006 → LIFNR → ZMM005**로 조회. 제조사(MFRPN) ≠ 공급업체
- "승인원"은 SAP **표지**와 그룹웨어 **기안**이 공유하는 단어 — `기안/결재/상신`이면 그룹웨어, `표지`면 SAP, 둘 다 없으면 **되묻는다**
- **모듈마다 구조가 다르다** — 메일은 `iframe#mail-viewer` 안(최상위 body 10자, 그래서 클릭이 다 빗나간다), 전자결재는 최상위. 조사 전에 iframe 여부 확인
- **요청 형식도 모듈마다 다르다** — 메일 `message/list`는 POST JSON(`keyWord` 대문자 W), 전자결재 `doclist`는 GET 쿼리스트링
- **양식 트리(`apprform/tree`)만 `{data:…}` 래핑이 아니다** — jsTree 배열 그대로. `j.data`로 받으면 0건. 양식 97개 카탈로그 → `docs/groupware-forms.md`(런타임 하드코딩 금지)
- **번들 `/api/` 문자열 추출이 호출 없이 쓰기성 경로까지 목록화해 준다** — 단 모듈 화면을 **열고 난 뒤**, URL은 `split('?')[0]`로 확장자 판정
- **게시판 조회/요약은 구현됨**(`gw_board_recent`, 읽기 전용) — 서버에 기간 필터가 없어 코드가 자른다. `date_to`는 **중단이 아니라 건너뛰기**(최신순이라 중단하면 "지난주"가 0건). "지난주"는 롤링 14일이 아니라 **달력 주**(`_gwPeriodRange`/`GW_PERIOD_WORDS`, js/32)
- 사내 공지는 본문이 **이미지뿐**인 경우가 흔함(평문 0자) — 빈 문자열만 주면 "조회 실패"와 구분 불가라 `bodyNote`로 사유를 드러낼 것
- 백엔드 라우트 검증은 `app.test_client()`로 — 사용자가 돌리는 5000번 프로세스를 죽이지 말 것(예약 발송·SAP 작업 중일 수 있음)
- **모듈별 엔드포인트 목록 → `docs/groupware-endpoints.md`**(관찰 확정 vs 번들 추출 구분). iframe 모듈은 메일·자료실뿐, 나머지는 최상위. 진입만으로 호출이 0건인 모듈(보고·주소록·Task)은 "API 없음"이 아니라 "아직 안 불림" — 랜딩 URL이 바뀌는 경우도 있어(`/app/todo`→`/app/report`) `location.href`를 같이 기록할 것

### `docs/insa-hr.md` — 🧑‍💼 인사관리(kInsa) 연동 (`http://insa.kortek.co.kr`)
- **읽을 때**: 인사관리 자동 로그인, 화면 조회, **신청서 칸 채우기(쓰기)**
- 로그인(`POST /kInsa` + `userNum`/`password`, 실측 확정)과 **화면 자동 학습**까지 구현됨 — 메뉴 12개를 눌러 보고 실제 주소를 관찰해 `insa_menu_catalog.json`(데이터)에 저장. AI 문답 도구 `insa_menus`/`insa_screen`(js/40, 읽기 전용)
- **⚠️ 학습한 주소로 직접 이동 금지(GET 405) — 메뉴를 클릭할 것.** path 는 이동 수단이 아니라 **도착 확인용**이다. 클릭 직후 바로 읽으면 **앞 화면 내용이 나온다**(실제로 틀린 답을 준 적 있음) — 주소가 바뀐 걸 확인한 뒤 읽고, 못 가면 정직하게 실패시킬 것
- **성공/실패가 둘 다 HTTP 200** — 실패는 `location.href = "index"` 가 든 194바이트 `<script>`로 온다. `_insa_fail_message()`가 그 지문으로 판정
- **⚠️ 한 번만 시도, 실패 시 재시도 금지**(계정 잠금). 가드는 프런트 `_insaEnsureLogin`(js/36) — **`/insa/login`을 직접 부르지 말 것**
- 비밀번호는 DPAPI → `insa_login_config.json`(.gitignore). 복호화 함수를 gw_bridge에서 쓰지 않고 백엔드에 따로 둔 이유도 문서에
- **(2026-10-21) 쓰기 구현됨 — 칸만 채운다. `등록`은 사람이 누른다.** `insa_write.py`(읽기와 모듈 분리) → `POST /insa/fill-workplan` → `insa_fill_workplan`(js/41)
- **⚠️ 이 화면의 동기 XHR(`async:false`)이 인사관리 탭을 전부 얼린다** — 같은 사이트는 렌더러 프로세스를 공유해 **조회용 `/kInsa` 탭까지 같이 죽는다**. 렌더러 명령은 무응답인데 브라우저 명령이 `"No dialog is showing"`을 주면 대화상자가 아니라 **메인 스레드 블록**이다. 복구는 그 탭 닫기(`/json/close/<id>`) 하나뿐 → 그래서 일괄입력은 응답을 안 기다리고(`_fire`) 되살아나는지 폴링(`_wait_idle`)하고, 안 오면 정직하게 실패
- **alert 문구를 삼키지 말 것**(`dialogs`로 돌려줌) — "채웠다"면서 실제론 적용 안 된 상태가 된다. 퇴근만 바꾸려 출근을 비우면 사이트가 거부하니 안 준 쪽은 **변경 전 계획**(`beSTime`, 카드기록 `workSTime` 아님)으로 채우고 분은 **00/30만**
- **식사유형도 채운다** — 코드표는 화면 콤보에서 읽어 맞춤(`_meal_options`). 날짜·시간 **뒤에** 해야 하고(날짜 일괄입력이 식사유형을 지운다) 점심·저녁 **둘 다** 필요(한쪽만 주면 기존값 유지)
- `regForm`은 **POST 전용**(GET 405) + CDP `window.open`은 팝업 차단 → 새 탭을 `/kInsa`로 띄워 그 안에서 폼 POST. 405 탭을 남기면 **조회 경로가 그 탭을 집는다**

### `docs/qa-tool-router.md` — 🛠 AI 문답 도구 자율 호출 (function-calling)
- **읽을 때**: AI가 "지원하지 않습니다"라고 답할 때, 새 조회 기능을 AI가 쓰게 만들 때
- 새 조회 기능은 `QA_TOOLS`(`js/40-qa-tool-router.js`)에 **한 줄** 추가하면 끝 — if 블록 코딩 불필요. `desc`가 AI의 유일한 선택 근거이니 성의 있게
- **읽기 전용**(`mode:'read'`만 실행) + AI는 **도구 id만** 고름(엔드포인트 문자열 못 정함) + 인자는 스키마로 검증·보정(규격 위반은 빼지 말고 **기본값으로** — 빼면 서버 기본값으로 엉뚱한 조회가 조용히 일어남)
- 순서: 기존 결정론 블록 → SAP 의도 → **도구 루프** → 일반 AI. 결정론 블록이 여전히 최우선
- **엉뚱한 searchtype은 조용히 0건** — 승인원 문서 제목은 영문이라 `title/승인원`=0건, `formName/승인`=18건. "0건=없음"으로 단정 금지
- 호출 기록: `localStorage.gantt_qa_tool_log_v1`(300건) + 실패는 `_issueLog`
- **쓰기는 읽기와 경로 분리**(`js/41`) — 자율 루프는 `mode:'write'`를 영구 거부, 실행은 nonce 필요. **쓰기 표면은 번들로 안 배워진다**(payload가 변수 조립, 예약·일정은 경로조차 안 나옴) → `gw_capture_write.py`로 사람이 1회 수행하는 동안 관찰해 확정할 것
- **도구 루프는 다단계 추론**(최대 4턴/6호출) — 조회 결과를 보고 다음 수를 정한다. 단일턴이면 "회의실 잡아줘"가 현황도 안 보고 시간을 지어낸다(매크로와의 차이). 쓰기 의도라도 **live 도구는 04h 블록이 가로채지 말고 루프에 넘길 것**
- 예약 `attributeId`는 **자원마다 다름**(151/152 · 80/81 · 29/110) — 기존 예약에서 런타임 발견(`asset_attribute_ids`). 참석자는 **필수**(비우면 화면이 오류도 요청도 없이 조용히 막음)

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
- **푸시 직후 `/self-update`는 raw CDN 캐시로 옛 버전이 최신 작업본을 덮어쓴 적 있음(2026-10-13)** — 이상하면 `git status`부터, `_fetch_github_raw`는 `?cb=` 캐시 우회

### `docs/html-corruption-recovery.md` — 🔥 HTML 인코딩 손상 복구
- **읽을 때**: 한국어가 `?◆◆`으로 깨지거나 배경 클릭 시 외부 사이트로 이동
- 원인: PowerShell `Set-Content`/`Out-File` → UTF-8 한국어 `?` 치환. **HTML 수정은 Python `open(...,'wb')`만.**

### `docs/ui-conventions.md` — 🌐 i18n / 🎨 팔레트 / 🪟 모달 컨벤션
- **읽을 때**: 새 UI 컴포넌트, 언어 대응, 테마 팔레트, 모달 구조, **엑셀/PPT 출력물**
- 새 UI 완료 기준 3가지: 영문 대응(`_t`/`data-i18n`) + 팔레트 대응(`_cpApplyLive` 좁은 셀렉터) + 모달 컨벤션(`_makeDraggable`·`_bindClickToFront`·`bringModalToFront` 호출)
- **⚠️ 영문 대응은 화면만이 아니라 내보내는 파일 안(시트명·머리글·행 라벨)까지다** — 버튼만 `_t`로 감싸고 끝내 **매번 누락됐다**(2026-10-20 지적). 왕복(출력→수정→불러오기) 기능은 **내보낼 땐 현재 언어 하나, 불러올 땐 두 언어 다** 받을 것(`_nm`/`_nms`/`_pick`, `js/42`). 검증은 **ko→en·en→ko 교차 왕복**으로 — 같은 언어끼리만 보면 다 통과한다

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

### `docs/opensource-synergy-review.md` — 🔭 오픈소스 시너지 검토 (2026-10-19)
- **읽을 때**: 외부 라이브러리 도입 검토. star 수 실측 + 이 앱 제약(번들러 없음/전역 스코프/팀원 개인 PC) 기준 Tier A/B/C 판정
- 권장: oxlint(커밋 훅 전체 파싱) · es-hangul(초성 검색) · pywinauto(SAP #32770 대화상자) · RapidFuzz(시그니처 군집)
- **비권장 이유도 적어둠** — litellm은 이미 `js/14a`에 폴백·쿨다운·사용량 원장을 직접 만들어 둠, tui.calendar/tippy.js는 archived

### 백엔드 파일
| 파일 | 역할 |
|---|---|
| `gas/Code.gs` | AI 프록시(Google Apps Script 웹앱) 소스 사본. 수정 후 Apps Script 편집기에서 **기존 배포 편집 → 새 버전**으로 배포(새 배포 만들면 URL 바뀜) |
| `kortek_backend.py` | Flask 서버. 메일 SMTP/POP3, Telegram, 암복호화, 예약 발송 스케줄러 |
| `sap_bridge_32.py` | SAP GUI 32비트 브릿지 — `py -3-32` 서브프로세스. `kortek_backend.zip`에도 반드시 포함 |
| `insa_write.py` | ✍️ 인사관리 **쓰기** — 근무계획 수정 신청서 칸 채우기(`open_regform`/`fill_workplan_edit`). **등록은 안 누른다.** 읽기(`gw_bridge.insa_*`)와 모듈 분리 |
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
