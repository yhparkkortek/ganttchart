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
- **데이터 저장**: 구글시트가 아니라 Google Drive 폴더(`SHARED_FOLDER_ID`, `js/04a-core-app-globals.js`)
  안의 프로젝트당 JSON 파일 1개에 전체 데이터(`globalData`, `changeLogs`, `tabData` 등)를 저장합니다.
  - **팀별 폴더 구조(신규)**: 프로젝트 JSON은 `SHARED_FOLDER_ID/개발N팀/project.json` 으로 저장됨.
    백업 파일은 `SHARED_FOLDER_ID/Backups/개발N팀/백업_*.json`.
  - `findSaveFile` / `_listProjectFiles`는 `in parents`(직속 자식만) 대신 **`in ancestors`(하위 폴더 포함 재귀)**
    쿼리를 사용 — 팀 폴더로 이동한 파일도 조회됨.
- **로컬 구동**: `.claude/launch.json` — `python -m http.server 8934` 로 정적 파일 서빙.
- 자동화 테스트 없음. 브라우저에서 직접 열어 눈으로 확인하는 방식으로 검증합니다.

## Git 작업 방식

이 저장소는 **혼자(1인) 작업**합니다. 여러 명이 동시에 같은 코드를 건드릴 일이 없으므로,
**기본적으로 브랜치/PR 없이 `main`에 직접 commit·push** 합니다 (지금까지도 쭉 이 방식이었습니다).
별도 브랜치를 만들거나 PR을 올리라는 **명시적인 요청이 없는 한, 항상 `main`에 바로 반영**하세요.

단, 다음처럼 **되돌리기 어렵거나 파급력이 큰 변경**은 진행 전에 먼저 물어보고, 원하면 별도
브랜치+PR로 진행해서 병합 전에 검토할 기회를 주는 게 안전합니다:
- 여러 파일에 걸친 대규모 리팩터링(예: 대용량 파일 분리)
- 데이터 저장 구조·API 계약 변경 등 되돌리기 번거로운 변경

## 컨텍스트 압축 전 CLAUDE.md 자동 갱신

`.claude/settings.json`에 **PreCompact 훅**이 설정되어 있습니다. `/compact`(수동) 또는 컨텍스트가
꽉 차서 자동 압축(auto-compact)이 일어나기 직전에, "이 대화에서 앞으로도 계속 적용될 새 규칙/결정/
파일구조 변경이 있었는지 검토하고, 있으면 압축 전에 이 CLAUDE.md를 갱신하라"는 지시가 자동으로
주입됩니다. (단, `/clear`는 압축이 아니라 훅이 걸리는 지점이 없어 이 자동 갱신 대상이 아닙니다 —
`/clear` 전엔 여전히 "지금까지 결정된 거 md에 정리해줘"라고 직접 요청하는 게 안전합니다.)

## ⚠️ 가장 중요한 규칙: 로딩 순서 = 전역 스코프 순서

`GANTT_CHART_V02_Color.html`의 `<script src="js/...">` 태그 순서가 곧 실행 순서이자 변수/함수가
"보이기 시작하는" 순서입니다. 파일명 앞의 숫자(`01`, `02`, `04a`, `04b`, ...)는 **그 로딩 순서를
그대로 반영**하며, 이후 알파벳 접미사(`04a`~`04k` 등)는 원래 하나였던 파일을 토큰 절약·협업을
위해 더 잘게 나눈 조각입니다.

- 각 파일은 독립된 모듈이 아닙니다. `const`/`let`으로 선언한 최상위 변수도 브라우저에서는 같은
  문서 안의 **이후에 로드되는 `<script>` 태그에서 그대로 보입니다** (import/export 불필요).
- 따라서 새 코드를 추가할 때 **"이 함수/변수가 정의된 스크립트가 이 코드보다 먼저 로드되는가"**만
  신경 쓰면 되고, 어떤 파일에 넣어도 동작 자체는 기존과 동일합니다. 다만 논리적으로 맞는 섹션
  파일에 넣어야 사람이 찾기 쉽습니다 (아래 파일 맵 참고).
- 파일을 새로 쪼개거나 옮길 때는 **문장(top-level statement) 경계에서만 자를 것** — 함수 중간이나
  블록 중간에서 자르면 두 조각 다 문법 오류가 납니다. 자른 뒤 `node --check 파일.js` 로 각 조각이
  단독으로 문법상 유효한지 검증하세요.

## 파일 맵 (로딩 순서대로)

### 외부 라이브러리 (CDN)
`api.js`/`gsi client`(Google 인증), `xlsx-js-style`(엑셀), `pptxgenjs`(PPT), `pdf.js`(PDF 파싱),
`@tabler/icons-webfont`(아이콘 폰트) — 전부 `<head>`에서 CDN으로 로드.

### 초기화 / 인프라
| 파일 | 역할 |
|---|---|
| `01-gapi-gis-stub.js` | Drive 연동 레이스컨디션 방지용 gapiLoaded/gisLoaded 임시 스텁 |
| `02-pdfjs-worker-init.js` | pdf.js worker 경로 초기화 |
| `03-drive-modal-drag.js` | 구글 드라이브 불러오기 모달 드래그 기능 |

### `04-core-app.js` → 11개로 분리 (원래 11,915줄, 앱의 핵심 로직)
| 파일 | 담당 |
|---|---|
| `04a-core-app-globals.js` | 전역 변수 선언 (TDZ 에러 방지를 위해 최상단에 몰아둠) |
| `04b-core-app-drive-sync.js` | 구글 드라이브 연동 로직 (저장/불러오기/백업 폴더). 팀별 폴더 헬퍼: `getOrCreateTeamFolder(token,name)`, `_moveFileToTeamFolder(token,fileId,name)` (저장 후 fire-and-forget 이동), `_getOrCreateBackupTeamFolder(token,name)` |
| `04c-core-app-mail-pipeline.js` | `project_index.json` 메일 자동처리 파이프라인, 프로젝트 저장(`serializedGlobalData`) |
| `04d-core-app-gantt-core.js` | 날짜/일정(Gantt) 코어 로직, 공휴일 |
| `04e-core-app-undo-redo.js` | Undo/Redo (recalculateSchedules 종료 시 자동 스냅샷) |
| `04f`~`04j-core-app-upload-utils-N.js` (1~5) | 파일 업로드 및 유틸리티 로직 (원래 6,590줄짜리 한 섹션을 5등분). **💬 AI 문답 기능이 `04g`(컨텍스트/프롬프트 조립)와 `04h`(모달·전송·태그 실행)에 있음 — 아래 "💬 AI 문답" 절 참고** |
| `04k-core-app-filter-export.js` | 필터 적용/파일명 동적 조립 + 엑셀 출력 공통 스타일러 |

### 기타 기능 파일 (05~24, 대부분 단일 파일 유지)
| 파일 | 역할 |
|---|---|
| `05-drive-sync-optimize.js` | 드라이브 연동 최적화 (F5 캐시 꼬임 방지) |
| `06-theme-color-chart.js` | 테마 색상 반영 & 차트 막대 색 |
| `07-data-loss-safeguard.js` | 데이터 유실 방지 안전장치 |
| `08-filter-ui.js` | 필터 UI (라벨 클릭, 전체 버튼 등) |
| `09-autosave-user-id.js` | 1분 자동 저장, 로컬 사용자 식별 |
| `10-gantt-filter-date-ui.js` | 필터 티어드롭 팝업, 날짜 UI |
| `11-mobile-detect.js` | 모바일/카카오톡 인앱 브라우저 감지 |
| `12-mobile-longpress.js` | 모바일 롱탭 → 텍스트 수정 모드 |
| `13-mobile-touch-timer.js` | 모바일 터치 타이머 |
| `14a`/`14b-ai-mail-analysis-N.js` | 메일 분석 → 간트차트 자동 추가 (Gemini AI), 원래 `14-ai-mail-analysis.js` 1/2. `14a`에 Phase 6 토픽프로파일 배지 갱신 훅 + Phase 7 다중 프로젝트 배분 함수(`_initMultiProjectArea`, `mailDistributeToProject`) 포함 |
| `14c-task-inbox.js` | [Phase 1] 업무 보관함 (Task Inbox) — 프로젝트 독립 스테이징 |
| `14d-distribution-ledger.js` | [Phase 2/2.5] 드라이브 배분 원장 + 저장 시 자동 병합. **다수 프로젝트 선택**: `window.distSendTaskToTargets(task, targets, opts)` — 업무 1건을 여러 대상 프로젝트에 자동위치(시작일 기준)로 동시 배분하는 공용 헬퍼(대상마다 Drive fetch→행 삽입→PATCH, 사전 충돌대조 없이 실행 직전 fetch로 충돌창 최소화). Task Inbox "다른 프로젝트로 전송"(`inboxOpenDistribute`)에서 2개 이상 체크 시 `inboxDistExecuteMulti`가 이 헬퍼를 호출(1개면 기존 `inboxDistPickFile`+`inboxDistExecute` 단일모드 그대로 유지 — `_distRefreshStep2`가 선택 개수로 분기) |
| `15a-mail-attachment-tab.js` | 메일 파일 첨부 탭 (좌우분할 UI). Phase 5 신뢰도 배지 헬퍼 `_confBadge(conf)` 전역 선언(여기서만 정의) — 🟢/🟡/🔴/⚪ 뱃지 HTML 반환; `pasteRenderResultList`·`mfRenderList`에도 배지 삽입. Phase 7 `mailShowRightDetail`에서 `_initMultiProjectArea()` 호출 |
| `15b`/`15c-mail-server-tab-N.js` | 메일 서버 탭 기능 1/2. `15c`의 `msRenderList`에 Phase 5 `_confBadge` 배지 삽입. `15b`의 "📭 미분류 메일 → 🔄 프로젝트 매칭 재분석 요청" 모달(`_msOpenReanalyzeHintModal`)도 **다수 프로젝트 선택** 지원 — "📋 프로젝트 선택" 목록이 체크박스형 다중토글(`_msToggleProjPickerItem`/`_msRenderProjPickerList`)이라 열어둔 채 여러 개 고를 수 있고, 0~1개 선택 시엔 기존처럼 힌트 기반 AI 단일매칭(`_msQueueReanalyze`)을 그대로 쓰지만 2개 이상 선택하면 AI 단일판단 대신 사용자가 고른 프로젝트 전부로 곧바로 배분(`_msQueueReanalyzeMulti` → 위 `distSendTaskToTargets` 재사용, AI는 업무 필드 정규화용으로만 1회 호출) |
| `16-wbs-level-colors.js` | WBS 레벨별 고정 회색 계조 |
| `17-weekly-report-modal-drag.js` | 주간 업무 보고 모달 드래그 |
| `18-mail-analyzer-modal-drag.js` | 메일 분석기 모달 드래그 |
| `19-shared-modal-drag.js` | 공통 모달 드래그 함수 (화면 경계 clamp 포함) + 모달 최소화(하단 taskbar). `_makeDraggable()`을 호출하는 모든 모달(30개+)에 자동 적용됨 — 새 모달도 이 함수만 호출하면 최소화 버튼이 자동으로 붙는다 |
| `20-weekly-report.js` | 주간 업무 보고 기능 본체 |
| `21-color-palette.js` | 컬러 팔레트 모달 (hex↔HSL 변환) |
| `22a-summary-mctable-parse.js` | 엑셀 파싱: Summary/Brief SPEC/M.C Table 등 (원래 `22-tabs-summary-mctable.js`) |
| `22b-summary-mctable-core1.js` | 탭·서머리·M.C테이블 렌더링 1/4, `_addrSplitNames`/`_addrStripTitleSuffix`/`_addrFindByName` |
| `22c-summary-mctable-core2.js` | 탭·서머리·M.C테이블 렌더링 2/4, `collectAlarmItems`/`saveAlarmSchedule`/`_asSaveRecurRule` |
| `22d`/`22e-summary-mctable-core3/4.js` | 탭·서머리·M.C테이블 렌더링 3/4, 4/4 |
| `22f-address-book.js` | Address Book — CRUD/다중선택/정렬 + 엑셀·CSV 불러오기/내보내기 |
| `22g-name-autocomplete.js` | 이름 자동완성 — Address Book 기반 |
| `22h`/`22i-brief-mc-common-N.js` | Brief SPEC / M.C Table 공용 (NO 클릭 팝업, 묶음 선택/이동/추가/삭제) 1/2, 2/2 |
| `23-sidebar-tabs.js` | 사이드바 접기/펴기 + 탭 전환 |
| `24-calendar-tab.js` | Calendar 탭 — 간트차트 업무를 월간 캘린더로 표시 |
| `25-ai-learning.js` | AI 학습 시스템. Phase 3(학습 로그 저장) + **Phase 4 재시도 엔진**: `_alTriggerRetry()` → 저신뢰도(`_aiConfidence≠'상'`) 행 탐지 → 우측 배너 표시 → `_alRunRetry()` → `callAiBackend` 재분석 → 개선 시 `recalculateSchedules()` |
| `26-topic-profile.js` | **Phase 6 토픽 프로파일**: 간트 업무명 → Gemini AI → `{keywords,topics,patterns,summary}` → `localStorage('gantt_topic_profile_v1')` 저장. `_generateTopicProfile()` / `_getTopicProfile()` / `_topicProfileSnippet()` / `_clearTopicProfile()` / `_refreshTopicProfileBadge()`. `getSystemPrompt`를 래핑해 **메일 본문 직전**에 스니펫 주입. `_currentKey()`는 `fileId` 우선(fileName 공유 충돌 방지). |
| `27-topic-contamination.js` | **Phase 8 토픽 오염 감지·AI 자가진단**: Phase 3 학습 로그(`_alGetEntries`) 재사용 → 30일 가중 오염 지수 계산 → 4단계 레벨(ok/warn/caution/critical) → 메일 분석기 배지·토스트 알람. `_writeLearningEntry` 래핑: 오매칭 기록 후 300ms 자동 체크. `_tcRunDiagnosis()` → Gemini AI에 오염 패턴 전송 → 진단 모달(제거/추가 키워드 제안) → `_tcApplyFix()` 사용자 승인 시 토픽 갱신 + 진단 이력(`_diagHistory`) 보존. |
| `26-gantt-search.js` | 간트차트 내 키워드 검색 |

> `04`, `14`, `15`, `22`는 각각 원래 하나의 거대 파일(최대 11,915줄)이었고, 협업 편의와 토큰 절약을
> 위해 여러 조각으로 나눈 것입니다. 나머지(05~13, 16~21, 23~26) 번호는 이미 세분화된 단일 파일이라
> 대부분 추가로 쪼갤 필요가 없습니다.

### Phase 4~7 AI 학습 시스템 요약
| Phase | 내용 | 주요 파일 |
|---|---|---|
| 1 | 업무 보관함 (Task Inbox) | `14c-task-inbox.js` |
| 2/2.5 | 드라이브 배분 원장 | `14d-distribution-ledger.js` |
| 3 | AI 학습 로그 저장 (`_writeLearningEntry`) | `25-ai-learning.js` |
| 4 | 재시도 엔진 — 저신뢰도 행 배너·재분석 | `25-ai-learning.js` |
| 5 | 신뢰도 배지 (`_confBadge`) — 세 목록 모두 | `15a`, `15c` |
| 6 | 토픽 프로파일 생성·주입 | `26-topic-profile.js` |
| 7 | 다중 프로젝트 배분 (`gantt_ai_reassign_queue_v1`) | `14a`, `15a`, HTML |
| 8 | 토픽 오염 감지·AI 자가진단 (`_tcGetScore`, `_tcRunDiagnosis`, `_tcApplyFix`) | `27-topic-contamination.js` |

### 📧 메일 원문(`mailRaw`) 전달 규칙 — "원문 보기" 버튼이 빠지는 버그 패턴 (2026-09-12)

Gantt 행(`row._mailRaw`)이나 Task Inbox 항목(`it.mailRaw`)에 `{subject, sender, date, body2000,
fileName}` 형태 객체가 있어야 "📧 원문 보기" 버튼이 뜬다(`14c-task-inbox.js`). 메일 분석으로 만든
업무가 **경유지를 하나 더 거칠 때마다**(보관함 → 다른 프로젝트로 전송, 미분류 재분석 → 다중 배분,
배분 원장을 다른 팀원 세션이 나중에 병합 등) 그 경유지 코드가 `mailRaw`를 안 넘기면 원문이 조용히
사라지는 버그가 반복 발생했다(2026-09-12에 5곳 동시 발견·수정: `14d-distribution-ledger.js`의
`inboxOpenDistribute`/`inboxDistExecute`/`distSendTaskToTargets`/`inboxDistExecuteMulti`,
`15b-mail-server-tab-1.js`의 `_msQueueReanalyzeMulti`, `14a-ai-mail-analysis-1.js`의
`mailDistributeToProject`). 새로운 "업무를 다른 곳으로 옮기거나 복사하는" 코드를 짤 때 체크할 것:

- `window.buildMailTaskRow(task, gd, ci, mailRaw)`의 **4번째 인자를 빠뜨리지 말 것** — 안 넘기면
  무조건 `row._mailRaw = null`이 된다.
- **배분 원장**(`saveData.distributions.push({...})`, `14d`/`15b`에 총 3곳)에도 `mailRaw`를 같이
  저장해야 한다 — 이 원장은 "아직 이 배분을 모르는 다른 팀원 세션"이 나중에 저장할 때
  `mergeRemoteDistributions()`가 `d.task`로 행을 다시 만드는 용도로도 쓰이는데, 원장에 `mailRaw`가
  없으면 그 세션에서 되살아나는 행은 원문을 영영 알 수 없다 — "같은 날 분석된 메일인데 어떤 건 원문
  보기가 되고 어떤 건 안 된다"는 제보의 실제 원인이 이것이었다.
- `gantt_ai_reassign_queue_v1`(localStorage) 큐에 항목을 넣을 때도 `mailRaw` 필드를 같이 넣을 것
  (`25-ai-learning.js`의 `_pushReassignQueue` 호출부가 원조 패턴 — `row._mailRaw || null`).

### 💬 AI 문답 (js/04g~04h, 04j) — 구조와 트러블슈팅 지침

Gantt 프로젝트 데이터에 대해 자유 질문하는 챗봇(`openGanttQaModal`). 핵심 함수는 `04g-core-app-
upload-utils-2.js`(컨텍스트/프롬프트 조립, `_aiAssist*` 실행 헬퍼)와 `04h-core-app-upload-utils-3.js`
(`sendGanttQaMessage`, `_aiProcessGanttQaTurn`, `_applyGanttQaActions`, 로컬 명령)에 나뉘어 있음.

**액션 처리 3단계 원칙** — 새 "AI가 뭔가 실행하는" 요청을 추가할 때 이 중 어디에 넣을지부터 결정:
1. **AI 호출 자체를 생략(로컬 명령)** — 앱 전역 상태를 다루거나 표현이 뻔한 요청(Undo/Redo, 음성
   답변·음성문답 모드 on/off). `sendGanttQaMessage` 맨 앞에서 정규식으로 가로채 즉시 처리
   (`_ganttQaTryHandleUndoRedoCommand`/`_ganttQaTryHandleVoiceCommand`). API 키 없어도 동작, 지연 없음.
2. **AI가 판단 후 즉시 실행(`[[ACTION:...]]` 태그, 확인 없음)** — 데이터를 바꾸지만 안전하게 되돌릴
   수 있거나(SET_ALARM/CLEAR_ALARM/DELETE_ROW/SET_STATUS/TOGGLE_KEY/SET_LEVEL/MOVE_ROW/
   MOVE_ROW_BEFORE — Undo 가능) 아예 데이터를 안 바꾸는 순수 화면 동작(GOTO_ROW=업무로 스크롤,
   SWITCH_TAB=다른 탭 전환)인 경우. `_applyGanttQaActions`에서 정규식으로 파싱해 바로 실행.
3. **초안 → 사람 확인 → 확정 2단계 왕복** — 실제 발송/등록처럼 되돌리기 번거로운 동작(MAIL_DRAFT/
   SEND_MAIL:CONFIRM, NOTICE_DRAFT/REGISTER_NOTICE:CONFIRM, ALARM_DRAFT/APPLY_ALARM:CONFIRM,
   GANTT_EDIT_DRAFT/APPLY_GANTT_EDIT:CONFIRM, GANTT_ADD_DRAFT/APPLY_GANTT_ADD:CONFIRM).

**"기본 동작인데 태그가 없어 AI가 추론만 하다 느려지거나 실패" 버그 패턴** — 지금까지 이 이유로
GOTO_ROW·SWITCH_TAB·Undo/Redo 로컬명령이 추가됨. 사용자가 "당연히 될 줄 알았는데 안 된다"고 하는
동작은 대부분 "그 verb에 대응하는 태그/로컬명령이 아예 없어서 AI가 매번 다르게 반응"하는 경우이니,
새로 발견되면 위 3단계 중 어디에 해당하는지 판단해 태그나 로컬명령을 추가할 것 (단, 그 verb에
대응하는 실제 UI 기능/전역 함수가 애초에 없으면 이 앱 자체에 없는 기능이므로 대상 아님).

**표시No. ≠ 실제 #G 인덱스** — Gantt 표의 "No." 열은 WBS 접기/필터에 따라 화면에 보이는 순서대로
매번 새로 매겨지는 표시용 번호(`04k-core-app-filter-export.js`의 `applyFilters`)이고, AI가 쓰는
"#G숫자"는 항상 고정된 실제 `globalData` 배열 인덱스라 서로 다를 수 있음. `_buildGanttQaContext`가
DOM(`.no-td .row-num-span`)에서 표시No.를 읽어와 `[업무 목록]` 각 줄에 "(표시No.X)"로 같이 보여주고,
프롬프트에서 AI에게 "G 없이 그냥 숫자만 말하면 표시No.로 해석하라"고 지시함 — 실행은 항상 #G 인덱스로.

**성능 — 새 비동기 조회를 추가할 때 반드시 챙길 것**: `_buildGanttQaContext`는 질문마다 매번 통째로
다시 실행됨. (1) Elec Parts CONVERTER/AD BOARD/PANEL 라이브러리 조회, "다른 프로젝트 목록"
조회(`_msLoadProjectIndex`)처럼 서로 의존관계 없는 Drive 조회가 여러 개면 **순차 await 대신
`Promise.all`로 병렬화**할 것(안 그러면 캐시가 비어있는 세션 첫 질문마다 조회 개수만큼 대기시간이
곱절로 늘어남 — 실제로 "AD BD 정보 알려줘"가 거의 1분 걸리던 원인이었음). (2) `_buildGanttQaPrompt`의
`historyText`는 최근 16개 메시지로 캡됨(`HISTORY_LIMIT`) — 대화가 길어질수록 매 턴 프롬프트가
계속 커져 응답이 느려지는 걸 막기 위함, 이 캡을 건드릴 땐 이유를 다시 확인할 것.

**대화 데이터 활용 — "AI 호출 없는 로컬 신호"만 채택하기로 결정(2026-09-08)**: 전체 대화를 AI에게
다시 분석시켜 프롬프트를 자동 개선하는 방식은 토큰·응답속도 비용 대비 신호 품질(라벨 없음)이
낮다고 판단해 채택 안 함. 대신 AI 호출 없이: (1) 재질문 패턴 감지(`_ganttQaCheckReaskPattern`,
글자 2-그램 유사도 + "OOO님"/"#G번호" 같은 핵심 식별자가 다르면 무조건 다른 질문으로 판정하는
방어 로직 포함) — 최근 대화 속 질문과 지금 질문이 비슷하면 그 답변에 "문제 있었나요?" 힌트를 달아
기존 👍👎 피드백 파이프라인에 편입. (2) 질문 문구 빈도만 기록(`gantt_qa_question_freq`, localStorage,
답변 내용은 저장 안 함)해서 빈 채팅창에 "자주 묻는 질문" 드롭다운으로 노출.

### 🌐 다국어(i18n) 지원 규칙 — 새 UI 문구 추가 시 반드시 확인 (2026-09-12)

**⚠️ 새 UI(모달/버튼/라벨/안내문 등)를 추가하는 작업은 영문 대응 작업까지 포함해야 완료된 것으로
간주한다.** 한글만 넣고 끝내면 "일부만 번역된 앱"이 되어 나중에 훨씬 비싼 전수 점검(이미 2차까지
진행함 — `fc0a33b`/`c959067`/`6790483` 등)을 또 반복하게 된다. 새 화면 요청("~버튼 추가해줘",
"~설정 모달 만들어줘" 등)을 받으면, 한글 문구를 다 쓴 직후 곧바로 아래 메커니즘 중 하나에 연결해
`window._currentLang==='en'`일 때도 올바르게 보이는지까지 확인하고 나서 작업을 끝낼 것 — 별도
지시가 없어도 항상 포함되는 기본 작업 범위다.

`toggleLang()`(`js/04j-core-app-upload-utils-5.js`)이 한/영 전환의 유일한 진입점. 새 한글 문구를
추가할 때 아래 중 어디에 해당하는지부터 정할 것 — 안 그러면 "다른 UI는 다 영문인데 이 문구만
한글로 남아있다"는 버그가 반복 발생함(전수 점검이 2차까지 필요했던 이유):

- **정적 HTML 텍스트**(`GANTT_CHART_V02_Color.html`에 그대로 박힌 문구): `data-i18n="키"` 부여 +
  `LANG.ko.i18n`/`LANG.en.i18n`에 등록 (textContent 교체).
- **정적 HTML의 `placeholder`**: `data-i18n-placeholder="키"` + `i18nPlaceholder` 맵.
- **정적 HTML의 `title`(툴팁)**: `data-i18n-title="키"` + `i18nTitle` 맵.
- **readonly `<input value="…">` 라벨**(예: Summary 탭 "기구 담당자" 등 — textContent도 placeholder도
  아님): `data-i18n-value="키"` + `i18nValue` 맵. (2026-09-12 신설 — 이 넷 중 하나에도 안 걸려서
  10개 역할 라벨이 전부 미번역이었음)
- **버튼 id 하나로 특정 가능한 짧은 문구**: `LANG.ko.ui`/`LANG.en.ui`에 id로 등록(`toggleLang()`이
  `document.getElementById(id).textContent`를 직접 교체) — 단 그 요소 안에 다른 nested 요소(숫자 배지
  등)가 같이 들어있으면 절대 이 맵에 넣지 말 것(통째로 지워짐 → `inbox-modal-title-text` 중복
  표시 버그 참고, 대신 안쪽 텍스트만 별도 span+`data-i18n`으로 분리).
- **JS 템플릿 문자열로 매번 새로 그려지는 동적 문구**(alert/toast/모달 안내문 등): `window._t(ko, en)`
  또는 `_en = window._currentLang==='en'` 삼항으로 그 자리에서 바로 분기.

**"모달을 최초 1회만 innerHTML로 그리고 이후 재사용"(`if (!modal) {...}`) 패턴에서 특히 잘 터지는
버그**: 그 안의 문구를 `${_en ? ... : ...}` 삼항으로만 처리하면, **모달이 생성된 그 순간의 언어에
영원히 고정**된다 — 그 뒤에 언어를 토글해도(이미 만들어진 DOM이라 `if(!modal)`을 다시 안 타므로)
안 바뀜. 발견된 사례: AI 요약/AI 문답 프롬프트 편집 모달의 이력·수정하기·저장·초기화·일괄개선
버튼, "AI 분석 설정"·"메일 자동배치 설정" 모달 전체, 최소화된 모달의 타스크바 칩 라벨. 해결 패턴은
둘 중 하나: ① 해당 요소에 id를 주고 `LANG.*.ui`(또는 `_asIdTexts`류 id맵)에 등록해 `toggleLang()`이
나중에도 다시 맞춰주게 하기, ② (문구가 많은 모달이면) 알람 설정/메일 자동배치 설정처럼 "그 모달
전용 `_xxxRefreshLang()` 함수"를 모달과 같은 파일에 만들어 **`toggleLang()`에서 한 번, 그 모달을 열
때마다 한 번(=영문 모드에서 최초로 여는 경우까지 커버) 둘 다 호출**. 매번 새로 그리는 모달(예:
`showPsPromptLogs`의 표)은 `_en`을 그 함수 최상단(=`if(!modal)` 바깥)에서 선언해야 매번 다시 그려지는
부분도 언어를 따라감.

**검증 습관**: 새 모달/문구를 추가했으면 `toggleLang()`(우측 상단 🌐 버튼)을 눌러 왕복 확인하고,
그 모달을 **닫았다가 다시 연 상태**·**최소화 칩 상태**에서도 문구가 유지되는지 함께 확인할 것 —
"열려있을 때만 갱신되고 다시 열면 원상복귀"하는 사례가 실제로 여러 건 있었음.

**"코드는 이미 이중언어인데 화면은 안 바뀐다" — 또 다른 흔한 원인: 재렌더 누락(2026-09-12)**:
위 "모달 최초 1회 렌더" 패턴과는 별개로, **목록/리포트를 그리는 함수 자체는 `_en` 삼항으로 이미
완벽하게 이중언어였는데, `toggleLang()`이 그 함수를 재호출한 적이 없어서** 이미 열려서 그려진
화면이 계속 옛 언어로 남아있던 사례(업무 보관함 `renderTaskInbox()`, AI 요약
`_renderAiProjectSummaryBody()`, 토픽 프로파일 배지 `_refreshTopicProfileBadge()`). 새 목록/
카드/리포트 렌더 함수를 추가했으면 "함수 자체가 이중언어인가"뿐 아니라 **"이 함수가 데이터 변경
때만 불리고 언어 변경 때는 안 불리지 않는가"까지 확인** — 매번 저장된 상태에서 새로 그리는(=멱등)
함수라면 `toggleLang()` 끝에 `if (window.함수명) window.함수명();` 한 줄만 추가하면 됨.

**AI가 생성하는 "내용"(자유 텍스트) 자체를 영문으로 낼 수 있는지**: UI 라벨과 달리 AI 요약/AI 문답
답변처럼 AI가 그 자리에서 새로 작성하는 문장은 코드로 번역할 수 없다 — 대신 프롬프트에 조건부
지시를 덧붙여서 해결. 예시(`_buildProjectSummaryPrompt`, `js/04f-core-app-upload-utils-1.js`):
최종 프롬프트 문자열 조립이 끝난 뒤 `if (window._currentLang === 'en') result += '\n\n[Output
language] ...'`처럼 **JSON 키 이름(파싱에 쓰임)은 한국어로 고정하고 그 안의 문장 값만 영어로
쓰라고 지시**하는 한 줄을 덧붙임 — 파싱 코드를 전혀 안 건드리고, 팀이 프롬프트를 직접 고쳐
저장했어도(팀 공용 프롬프트) 이 지시는 항상 최종 문자열 맨 뒤에 붙으므로 계속 적용됨. 다른 AI
생성 콘텐츠(AI 문답 답변 등)에도 같은 패턴을 재사용할 수 있음.

### 🔑 관리자 비밀번호("팀 비밀번호") 체계 (2026-09-12 보안수정)

구글 로그인(OAuth)과 이 비밀번호는 **완전히 별개**다 — 구글 로그인은 Drive API 접근권한(누가 이
Drive 폴더에 들어올 수 있는지)만 결정하고, 이 비밀번호는 그 안에서 **메일/텔레그램 설정 암복호화 +
위험한 설정 변경(이력 삭제 등) 확인**에만 쓰인다. 이 앱엔 상시 켜져있는 공용 서버가 없으므로(각
팀원이 `kortek_backend.py`를 자기 PC `127.0.0.1`에서 개별 실행), **Google Drive의 `Backups/`
폴더가 사실상의 "서버"** 역할을 한다.

- **저장 위치**: 비밀번호 원문은 각 브라우저의 `localStorage`(`gantt_admin_pw`)에만 있고, 서버(Drive)엔
  SHA-256 해시만(`Backups/gantt_pw_sync.json`) — 기기 간 "같다/다르다" 판별용, 원문 복원 불가.
  실제로 이 비밀번호로 암호화되는 건 SMTP/텔레그램 설정(`Backups/mail_secure.enc`,
  `telegram_secure.enc`) — `kortek_backend.py`는 요청마다 받은 비밀번호로 그 자리에서 SHA-256→
  Fernet 키를 만들어 암복호화만 하고 저장은 안 함(stateless).
- **하드코딩된 기본값 'kortek' 제거함**: 예전엔 로컬에 저장된 값이 없으면 `getAdminPassword()`가
  `'kortek'`을 반환했는데, 이 앱은 GitHub Pages로 공개 배포되어 소스가 누구나 보이므로 사실상
  전 세계에 공개된 비밀번호였고, 앱 곳곳의 "관리자 비밀번호 확인" 게이트(Brief SPEC/M.C Table/
  Summary/AddressBook 이력 삭제 등 9곳 + 메일/텔레그램 Drive 저장·불러오기)를 그 값만 알면 누구나
  우회할 수 있는 구멍이었다. 지금은 저장된 값이 없으면 빈 문자열을 반환하고, 아래 공용 헬퍼
  (`js/04d-core-app-gantt-core.js`)로 "미동기화 상태"를 명확히 구분해서 안내한다:
  - `hasAdminPassword()` / `adminPwMatches(pw)` — 양쪽 다 비어있으면 안 무조건 일치 처리되지 않도록
    안전하게 비교. 새 "비밀번호 확인" 게이트를 추가할 땐 직접 `getAdminPassword()`와 비교하지 말고
    반드시 `adminPwMatches()`를 거칠 것.
  - `adminPwGateFailMessage()` — 실패 시 "틀렸음"과 "이 브라우저 미동기화"를 구분해 안내.
  - `verifyAdminPassword()` / `changeAdminPassword()` — 미동기화 상태에서 "비밀번호 변경"을 누르면
    기존 비밀번호 확인은 건너뛰되, Drive에 이미 다른 팀 비밀번호가 설정돼 있으면 "모르는 채로
    덮어쓰면 이미 동기화된 팀원들이 잠긴다"고 경고 후 확인받는다.
  - `saveAllToDrive()`/`loadAllFromDrive()`(`js/22a-summary-mctable-parse.js`)도 비밀번호가
    비어있으면 실행 전에 막는다 — 안 막으면 빈 문자열이 새 팀 비밀번호로 Drive에 덮어써져 전원이
    잠기는 사고가 남.
- **기기 간 동기화**: 구글 로그인 시 `checkPasswordSync()`가 로컬 해시와 Drive 해시를 비교해 다르면
  현재 팀 비밀번호 입력을 요구한다 — 이건 "누가 방금 바꿨다"는 뜻일 수도 있고, **이 브라우저가
  처음 동기화하는 것뿐**일 수도 있음(여러 PC/브라우저를 번갈아 쓰면 흔함). 문구도 이를 반영해
  "변경되었습니다" 대신 "설정과 다릅니다"로 되어 있음.
- **알려진 한계(추가 개선 필요시 참고)**: `localStorage` 저장은 평문이라 같은 PC를 여러 명이 쓰면
  노출 위험이 있고, "비밀번호를 아는 사람=관리자"라는 구조 자체는 유지되고 있음(역할 기반 권한
  체계는 없음). 진짜 중앙 서버를 새로 두지 않는 한(현재는 안 두는 쪽으로 결정) 근본적으로는
  Drive를 신뢰 루트로 삼는 현재 설계가 최선.

### 백엔드
| 파일 | 역할 |
|---|---|
| `kortek_backend.py` | Flask 서버. 메일 SMTP/POP3, Telegram 알람, 설정 암복호화, 예약 발송 스케줄러 (`/schedule` API) |
| `kortek_backend.bat` | 로컬에서 백엔드 실행하는 배치 스크립트 |
| `kortek_backend_install.bat` | **원클릭 설치 스크립트** — Windows 시작프로그램(`shell:startup`)에 자동 시작 바로가기 등록 + 지금 바로 최소화 실행까지 한 번에 처리. 내부적으로 PowerShell(`New-Object -ComObject WScript.Shell`)로 `.lnk` 생성, 인라인 `-Command` 대신 임시 `.ps1` 파일을 생성해 실행(따옴표/캐럿 이스케이프 문제 회피) |
| `kortek_backend_start_minimized.vbs` | 위 설치 스크립트가 만드는 바로가기가 실제로 가리키는 대상 — `kortek_backend.bat`을 `WScript.Shell.Run(..., 7, False)`로 최소화 상태로 조용히 실행 (콘솔 창이 화면에 튀어나오지 않음) |
| `kortek_backend.zip` | **다른 사용자 배포용 압축 파일** (`kortek_backend.py` + `.bat` + `_install.bat` + `_start_minimized.vbs` 4개 포함). `kortek_backend.py` 수정 시 `.claude/settings.json`의 PostToolUse 훅이 자동으로 재생성함 (`Compress-Archive` 사용) — 단, 설치 스크립트 2개만 수정한 경우엔 훅이 안 걸리므로 수동으로 `Compress-Archive`를 다시 돌려야 함 |
| `requirements.txt` | flask, flask-cors, requests, cryptography, google-auth |

> **Notice 탭 오류 진단**: `kortek_backend.py`의 `/schedule` 엔드포인트는 나중에 추가된 기능이라 구버전 백엔드를 가진 사용자에게는 없음. 구버전은 `/schedule` 요청 시 404 반환 → `renderScheduleRuleTable()`이 `_scheduleRules = 'outdated'` 상태로 "구버전" 경고 메시지 표시. AI·메일 기능은 정상(다른 엔드포인트 사용)하면서 Notice만 안 되면 백엔드 구버전 의심.

### 스타일
| 파일 | 역할 |
|---|---|
| `styles.css` | 전체 스타일시트 (2,034줄, 아직 미분리) |

## 작업 팁

- **특정 기능을 고칠 땐 위 파일 맵에서 해당 파일을 바로 지정**해서 요청하세요 (예: "메일 서버 탭에서
  ~ 고쳐줘" → `js/15b-mail-server-tab-1.js` / `15c-mail-server-tab-2.js`). 파일을 못 찾겠으면
  `grep -rn "함수명" js/` 로 먼저 찾은 뒤 그 파일만 열면 됩니다.
- 민감 설정 파일(`mail_config.json`, `telegram_config.json`, `schedule_rules.json`,
  `google_service_account*.json`, `.env`)은 `.gitignore`에 있고 저장소엔 없습니다 — 로컬에만 존재.
- 코드 안 주석에 `js/원본파일명.js:줄번호` 형태로 다른 위치를 가리키는 참조가 종종 있습니다
  (`kortek_backend.py` 등). 파일을 옮기거나 나눌 때는 이런 참조도 같이 업데이트해 주세요.
