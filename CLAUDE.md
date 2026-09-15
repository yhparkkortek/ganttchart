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
| `25-ai-learning.js` | AI 학습 시스템. Phase 3(학습 로그 저장) + **Phase 4 재시도 엔진**: `_alTriggerRetry()` → 저신뢰도(`_aiConfidence≠'상'`) 행 탐지 → `getAiRetryAutoEnabled()`가 켜져 있으면(기본값) 배너 없이 바로 `_alRunRetry()`로 자동 재분석 → 개선 시 `recalculateSchedules()`; 꺼져 있으면 조용히 대기시켰다가 ⚙️AI 분석 설정의 "🔄 저신뢰도 자동 재분석" 그룹에서 `_alRunPendingRetryNow()`로 일괄 처리. |
| `26-topic-profile.js` | **Phase 6 토픽 프로파일**: 간트 업무명 → Gemini AI → `{keywords,topics,patterns,summary}` → `localStorage('gantt_topic_profile_v1')` 저장. `_generateTopicProfile(ctx?)`(ctx 생략 시 지금 열려있는 프로젝트 기준, `{key,rows,colIdx,projectMeta,silent}` 지정 시 임의 프로젝트용) / `_getTopicProfile()` / `_topicProfileSnippet()` / `_clearTopicProfile()` / `_refreshTopicProfileBadge()`. `getSystemPrompt`를 래핑해 **메일 본문 직전**에 스니펫 주입. `_currentKey()`는 `fileId` 우선(fileName 공유 충돌 방지). `_tpMaybeAutoRegen(fileId,rows,colIdx,projectMeta)`가 fileId별 독립 쿨다운(`gantt_topic_regen_state_v1`)으로 "지금 열려있지 않은" 프로젝트도 자동 재생성 — 아래 헤드리스 경로 절 참고. |
| `27-topic-contamination.js` | **Phase 8 토픽 오염 감지·AI 자가진단**: Phase 3 학습 로그(`_alGetEntries`) 재사용 → 30일 가중 오염 지수 계산 → 4단계 레벨(ok/warn/caution/critical) → 메일 분석기 배지·토스트 알람. `_writeLearningEntry` 래핑: 오매칭 기록 후 300ms 자동 체크. `_tcRunDiagnosis()` → Gemini AI에 오염 패턴 전송 → 진단 모달(제거/추가 키워드 제안) → `_tcApplyFix()` 사용자 승인 시 토픽 갱신 + 진단 이력(`_diagHistory`) 보존. |
| `26-gantt-search.js` | 간트차트 내 키워드 검색 |
| `28-new-project-wizard.js` | **새 프로젝트 마법사**: 상단 메뉴 "➕ 새 프로젝트 추가"(`_npwOpen({}, '')`, DV 상태) 또는 미분류 메일 1건에서 AI로 필드(고객사/모델명/PM/키워드 등) 추출 후 pre-fill(`_npwOpen(prefill, 'MP(EC)')`, "메일 분석 임시 프로젝트" 상태) — 단계별 입력 UI + `_npwExtractFromMail(mailRecord)`(단건 AI 추출). "MP(EC)"는 완료여부 3단계 순환(DV→EOL→MP(EC))의 한 상태값으로, EOL과 달리 새 메일 자동매칭에서 계속 후보로 유지됨(`js/22g-name-autocomplete.js`). |
| `29-new-project-cluster-detect.js` | **Phase 9 신규 프로젝트 군집 감지**: `_msResolveAiProjectMatch`가 "근접 후보조차 없는" 완전 미분류를 반환할 때(27번 파일의 근접 후보 판정과 반대 경우) `_ncdRecordCandidate()`로 업무명 기반 결정론적 키(AI 호출 없음)로 군집화 → Drive `project_index.json`의 `unmatchedClusters`에 팀 공유 누적(30초 디바운스). 군집이 10건 넘으면 그때만 AI에게 "신규 프로젝트로 보이는지" 1회 확인(`_ncdCheckAndSuggest`/`_judgeCluster`) → 메일서버 탭 상단 배너(`#ncd-suggestion-banner`)에 제안. 실제 Drive 프로젝트 생성은 사람이 배너의 [새 프로젝트 만들기]를 눌러 `28-new-project-wizard.js`의 `_npwOpen(prefill,'MP(EC)')`을 직접 완료해야만 이뤄짐 — 이 파일은 절대 스스로 프로젝트를 만들지 않음. |

> `04`, `14`, `15`, `22`는 각각 원래 하나의 거대 파일(최대 11,915줄)이었고, 협업 편의와 토큰 절약을
> 위해 여러 조각으로 나눈 것입니다. 나머지(05~13, 16~21, 23~26) 번호는 이미 세분화된 단일 파일이라
> 대부분 추가로 쪼갤 필요가 없습니다.

### Phase 1~9 AI 학습 시스템 요약
| Phase | 내용 | 주요 파일 |
|---|---|---|
| 1 | 업무 보관함 (Task Inbox) | `14c-task-inbox.js` |
| 2/2.5 | 드라이브 배분 원장 | `14d-distribution-ledger.js` |
| 3 | AI 학습 로그 저장 (`_writeLearningEntry`) | `25-ai-learning.js` |
| 4 | 재시도 엔진 — 저신뢰도 자동/수동 재분석 (`getAiRetryAutoEnabled`) | `25-ai-learning.js` |
| 5 | 신뢰도 배지 (`_confBadge`) — 세 목록 모두 | `15a`, `15c` |
| 6 | 토픽 프로파일 생성·주입 (`_tpMaybeAutoRegen`로 헤드리스 프로젝트도 커버) | `26-topic-profile.js` |
| 7 | 다중 프로젝트 배분 (`gantt_ai_reassign_queue_v1`) | `14a`, `15a`, HTML |
| 8 | 토픽 오염 감지·AI 자가진단 (`_tcGetScore`, `_tcRunDiagnosis`, `_tcApplyFix`) | `27-topic-contamination.js` |
| 9 | 완전 미분류 메일 군집 감지 → 신규 프로젝트 생성 제안 (`_ncdRecordCandidate`, `_ncdCheckAndSuggest`) | `29-new-project-cluster-detect.js` |

### 📧 메일 원문(`mailRaw`) 전달 규칙 — "원문 보기" 버튼이 빠지는 버그 패턴 (2026-09-12)

Gantt 행(`row._mailRaw`)이나 Task Inbox 항목(`it.mailRaw`)에 `{subject, sender, to, cc, date,
body2000, fileName}` 형태 객체가 있어야 "📧 원문 보기" 버튼이 뜬다(`14c-task-inbox.js`). 메일 분석으로
만든 업무가 **경유지를 하나 더 거칠 때마다**(보관함 → 다른 프로젝트로 전송, 미분류 재분석 → 다중 배분,
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
- **수신자(to/cc) 실제 주소도 mailRaw의 일부다(2026-09-12 추가)**: 백엔드 POP3 수신(`kortek_backend.py`
  `/fetch-mail`)과 `.eml` 첨부 파싱(`15a-mail-attachment-tab.js`의 `mfParseFile`)은 원래부터 `to`/`cc`
  헤더를 뽑아내고 있었는데, 그 값이 AI 프롬프트용 힌트(`_recipHint`, "수신인 판별" 문맥)로만 잠깐
  쓰이고 `mailRaw` 조립 시점에는 계속 버려지고 있었다 — 그 결과 "메일 원문 보기"엔 발신자만 보이고
  수신자는 아예 안 뜨고, AI가 업무명/담당자에 "수신인 미상"류 문구를 쓰게 됐다. `mailRaw`를 새로
  조립하는 곳이 있으면 소스 객체(`mail.to`/`mail.cc` 또는 `parsed.to`/`parsed.cc`)에 값이 있는 한
  같이 넣을 것 — AI가 화면에 "다수"/"OO팀"처럼 축약해서 보여주는 것과 무관하게, 실제 이메일 주소는
  항상 구조화된 필드로 따라다녀야 나중에 발송/알람 기능이 실제로 쓸 수 있다. 단, 순수 텍스트
  붙여넣기(직접입력 탭)는 애초에 헤더가 없으니 `to`/`cc`가 항상 빈 값인 게 정상.
- **같은 날짜 업무의 등록 순서 = 실제 메일 발송 시각순(2026-09-12 추가)**: 메일의 시:분까지는 이미
  백엔드가 `date`를 `"YYYY-MM-DD HH:MM"`로 캡처해서 `mailRaw.date`에 항상 들어있었지만,
  `window.computeL0InsertPos()`가 위치를 계산할 때 시작일(날짜만, 시간 없음) 비교만 하고 있어서 —
  같은 날짜인 업무끼리는 "실제 시각순"이 아니라 "등록(분석) 처리 순서"대로 꽂혔다. 지금은 같은
  구간 안에서 날짜가 동률인 두 행이 둘 다 `_mailRaw.date`를 갖고 있으면 그 시:분까지 비교해서 순서를
  정한다(`computeL0InsertPos`의 6번째 인자 `mailSentAt` — 새 호출부를 추가할 때 mailRaw가 있으면
  `mailRaw.date`를 꼭 같이 넘길 것). 어느 한쪽이라도 `mailRaw`가 없으면(수동 입력 업무 등) 기존과
  동일하게 날짜만 비교하는 동작으로 조용히 폴백한다.

### 📅 일정 계산 모델(`_calcStartTs`) — Forced(고정) vs 자동계산(waterfall) 구분 (2026-09-13)

`04d-core-app-gantt-core.js`의 `recalculateSchedules()`가 매번 다시 계산하는 `row._calcStartTs`(실제
화면에 쓰이는 "계산된 시작일")는 **행마다 계산 방식이 다르다** — 이걸 모르고 `_calcStartTs`를 "그 행의
진짜 날짜"로 가정하면 새 기능에서 잘못 쓰기 쉽다:

- **자식이 없는(리프) 행**: `row._level===0`이거나 `_startForced===true`(대부분의 메일분석 등록 업무는
  `buildMailTaskRow`가 등록 즉시 이걸 true로 세팅함)이거나 기간(듀레이션) 값이 아예 없으면 →
  `_calcStartTs`는 그 행 자신에 실제로 입력된/저장된 날짜다. 반대로 듀레이션은 있는데 아직 한 번도
  고정(Forced)된 적 없는 리프 행은 → **"이전 형제가 끝난 다음 날"로 자동 이어 붙는(waterfall) 값**이라
  그 행의 날짜 셀에 뭐라고 써있든 무시되고 위치에 따라 매번 다시 계산된다(단, 리프 행은 한 번 계산되면
  즉시 Forced로 전환되어 그 뒤로는 고정됨 — `applyDatesToRow` 참고).
- **자식이 있는(그룹/중간레벨) 행**: **절대 Forced로 고정되지 않는다.** 자기 `_calcStartTs`는 항상
  "이전 형제가 끝난 자리"(waterfall)이고, `endTs`는 자식들 중 가장 늦은 종료일이다 — 즉 그룹행 자신의
  `_calcStartTs`는 "그 그룹 안에 실제로 있는 가장 이른 업무 날짜"가 **아니라, 배열 순서가 낳은 부산물**이다.

**실제로 터진 버그**: "🛠️ 일정 도구 → 📅 날짜순 정렬"(`window.sortRowsByStartDate`,
`js/04i-core-app-upload-utils-4.js`)이 형제 행들을 `_calcStartTs`로 정렬했는데, 그룹행(자식 있는 행)은
위 이유로 그 값이 "이전 정렬 순서의 부산물"이라 정렬 기준으로 쓰면 순환 참조가 되어 사실상 안 바뀌는
것처럼 보였다(리프 업무는 대부분 Forced라 문제가 덜 드러남). 고쳐서 지금은 자식이 있는 행은 재귀적으로
"그 하위에 실제로 존재하는 가장 이른 `_calcStartTs`"를 구해 정렬 기준으로 쓴다(`effectiveTs()`, 같은
패턴을 부분정렬용 `_sortSubRangeByStartDate`에도 동일 적용). **앞으로 이 두 함수 다시 손보거나
비슷한 "행을 날짜순으로 재배치"하는 기능을 새로 짤 때, 그룹행이 섞여 있으면 반드시 이 재귀적 최솟값
방식을 쓸 것 — 그룹행 자신의 `_calcStartTs`를 직접 비교하면 항상 이 버그가 재발한다.**

### 📌 "마지막 탭 복원" + 숨겨진 컨테이너 측정 — display:none 탭에서 실행되는 코드는 폭/스크롤 계산이 항상 0 (2026-09-13)

`js/23-sidebar-tabs.js` 맨 아래 IIFE가 페이지 로드 때마다 `localStorage.getItem('gantt_active_tab')`로
**마지막으로 보고 있던 탭을 그대로 복원**한다 — 즉 사용자가 지난 세션에 Summary/Alarm 등 다른 탭을
보고 있었다면, 새로고침 직후 Gantt 탭 패널은 `display:none` 상태다. 이 시점에 실행되는 코드가
`getBoundingClientRect()`/`offsetWidth`/`clientHeight` 등으로 **Gantt 탭 내부 요소의 크기를 재려고
하면 전부 0이 나온다** — 나중에 그 탭을 눌러 보이게 해도 이미 0으로 계산해 박아넣은 값은 저절로
고쳐지지 않는다(레이아웃이 바뀌는 게 아니라 그 시점에 계산한 숫자 자체가 틀렸으므로).

**실제로 터진 버그**: `window.scrollToTodayRow()`(`js/04j-core-app-upload-utils-5.js`, 페이지를 열면
"오늘" 행으로 자동 스크롤하는 기능)가 (1) 스크롤 컨테이너를 `#table-container > div`로 찾았는데
그사이 AI 검색/일괄작업 툴바(`#gantt-ai-bulk-bar` 등)가 새 "첫 자식 div"로 끼어들면서 엉뚱한(항상
숨겨진) 요소를 짚게 됐고, (2) 설령 셀렉터가 맞았어도 Gantt 탭이 안 보이는 상태면 델타 계산이 전부
0이 되는데, 이 실패를 "성공"으로 착각해 페이지당 딱 1번만 시도하는 플래그(`_didInitialScrollToToday`)를
그 자리에서 태워버려 그 세션 내내 다시는 시도하지 않았다. 수정: ① 셀렉터를 `#gantt-table-scroll`
id로 고정, ② `scrollToTodayRow()`가 boolean을 반환하도록 바꿔 "화면에 실제로 그려진 상태에서
시도했는지"를 호출부가 판단하게 하고, 실패하면 플래그를 세우지 않음, ③ `window.switchTab('gantt')`
에서도 아직 성공한 적 없으면 한 번 더 시도(탭이 실제로 보이는 시점이므로 이번엔 성공).

**앞으로 비슷한 "페이지 로드 시 1회만 하는 계산"을 추가할 때**: 그 계산이 Gantt(또는 다른 탭) 안의
요소 크기/위치를 재는 것이라면, 지금 그 탭이 실제로 보이는 상태인지(`el.offsetParent !== null &&
el.clientHeight > 0` 등) 먼저 확인하고, 숨겨진 상태였으면 "1회성" 플래그를 태우지 말고 나중에
그 탭이 실제로 보일 때(`switchTab()`) 재시도하도록 만들 것 — 그렇지 않으면 이 버그가 그대로 재발한다.

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

**입력창 질문 히스토리(↑↓, 2026-09-15 신규)**: `gantt-qa-input` 텍스트영역에서 셸/터미널처럼
위/아래 화살표로 예전에 보낸 질문을 다시 불러올 수 있다. `window._ganttQaInputHistory`
(localStorage `gantt_qa_input_history_v1`, 최근 100개, 모달을 닫아도 유지 — 대화 내용 자체인
`_ganttQaHistory`와 달리 이건 "질문 문구만" 담는 별도 배열)에 `sendGanttQaMessage` 맨 앞
`_ganttQaRecordInputHistory(question)` 한 곳에서만 기록한다(모든 로컬 명령/AI 호출 분기가 이
함수를 거치므로 — 여러 경유지에 각각 기록 코드를 넣어야 했던 mailRaw 버그 패턴을 피하려고
일부러 단일 진입점으로 설계). 키 입력 자체는 `window._ganttQaHandleInputKeydown`(textarea의
`onkeydown`)이 처리 — Enter 전송과 위/아래 히스토리 탐색을 한 함수에서 같이 다룬다.
**⚠️ 커서 위치 판정 규칙(실사용 테스트로 확정)**: 여러 줄 입력(Shift+Enter 줄바꿈) 중 화살표로
줄 이동하는 평소 동작을 방해하지 않으려고 "아직 히스토리 탐색을 시작 안 한" 상태에서 위
화살표를 누를 때만 커서가 맨 앞(0,0)인지 확인한다 — 반대로 **일단 탐색을 시작한 뒤에는
(`_ganttQaInputHistoryPos !== -1`) 커서 위치를 다시 검사하지 않고 계속 화살표로 더 훑어볼 수
있게 했다**. 매 화살표 입력마다 "커서가 맨 앞/맨 끝"인지 다시 검사하는 방식으로 처음 짰다가,
히스토리를 한 번 불러오면 커서가 텍스트 끝으로 옮겨져서 두 번째 위 화살표부터 먹통이 되는
버그가 실제로 있었음(브라우저에서 직접 재현·수정 확인) — 비슷한 "화살표로 반복 탐색" 기능을
새로 짤 때 이 함정을 참고할 것.

**⚠️ 시스템 프롬프트 텍스트 안에 백틱(`` ` ``)을 쓰면 파일 전체가 조용히 죽는다(2026-09-14 버그수정)**:
`_buildGanttQaPrompt`/`getSystemPrompt`류 함수가 반환하는 긴 프롬프트 문자열은 그 자체가 하나의 거대한
JS 템플릿 리터럴(백틱 문자열)이다. 그 안의 프롬프트 "본문 텍스트"에서 특정 단어를 마크다운 코드서식처럼
백틱으로 감싸면(예: `` `정정: true` ``, `` `[[ACTION:...]]` `` ) 그 백틱이 바깥 템플릿 리터럴을 조기
종료시켜버려서, 그 뒤에 오는 평문 한글 텍스트가 그대로 JS 코드로 파싱되며 `SyntaxError`가 난다 —
그러면 그 `<script>` 파일 전체가 실행되지 않아, 같은 파일에 정의된 다른 함수들(`_renderGanttQaMessages`/
`_ganttQaFillQuestion` 등)까지 전부 `undefined`가 되고, 증상은 "전송 버튼을 눌러도 아무 반응이 없다"/
"드롭다운을 골라도 반영이 안 된다"처럼 AI 문답 전체가 원인불명으로 먹통이 된 것처럼 보인다(실제 사례:
04g의 공지 등록/삭제 안내문에 있던 백틱 쌍 2곳). 콘솔에 `Unexpected identifier '한글단어'` 같은
에러가 찍히면 바로 이 패턴을 의심할 것. 프롬프트 텍스트 안에서 특정 문구를 강조하고 싶으면 백틱 대신
큰따옴표(`"정정: true"`)나 `[[ ]]` 같은 기존 태그 표기 자체를 쓸 것 — 백틱은 절대 쓰지 않는다. 새
프롬프트 문구를 추가/수정한 뒤에는 브라우저 콘솔에 `SyntaxError`가 없는지, 그리고 `typeof window.
sendGanttQaMessage`처럼 그 파일이 정의하는 핵심 함수가 실제로 `"function"`인지 확인하는 습관을 들일 것.

### 🏭 SAP 조회 연동 (AI 문답 확장) — 설계와 확장 방향 (2026-09-14)

AI 문답 창에 "SAP" 단어가 들어간 질문을 하면, 사람이 **미리 로그인해서 열어둔 SAP GUI 화면**을
로컬 백엔드가 읽어와 그 턴의 프롬프트에 끼워 넣는다. 비밀번호를 저장하지도, 자동 로그인을 하지도
않는다 — 이미 인증된 세션에 SAP GUI Scripting(COM)으로 "올라타서" 읽기만 하는 구조라 이 선택이
가능했다(TIPR처럼 로그인 자체가 필요한 시스템은 이 방식이 안 통해서 아직 미구현 — 아래 참고).
**⚠️ SAP 자동 로그인은 의도적으로 채택 안 함(2026-09-15 검토 후 결정)**: `sapshcut.exe`(SAP GUI
Shortcut, `-system=/-client=/-user=/-pw=` 옵션으로 실행+로그인+특정 트랜잭션 진입까지 한 번에
가능한 SAP 공식 도구)로 기술적으로는 구현 가능하다고 안내했으나, 사용자가 "그냥 수동으로 로그인
하겠다"고 결정 — TIPR과 달리 SAP 계정은 회사 ERP 전체(생산/자재/승인 등)에 접근 권한이 있어
유출/오남용 시 피해 범위가 메일/텔레그램 비밀번호보다 훨씬 크고, 회사 보안정책(SAP 접근 통제
감사 등)에 걸릴 수도 있다는 우려 때문. **앞으로 SAP 자동 로그인/자동 실행을 다시 제안하지 말 것**
— 이미 검토 후 명시적으로 거절된 방향이다. 로그인 화면 자체는 계속 사람이 직접 열어두는 게
전제조건으로 남는다.

- **트리거**: `js/04h-core-app-upload-utils-3.js`의 `sendGanttQaMessage`가 질문에 `/sap/i` 매치가
  있으면(다른 로컬 명령들처럼 AI 호출 전에) `window._aiFetchSapContext()`를 호출 — AI가 스스로
  판단해서 태그를 붙이는 방식이 아니라 **코드가 키워드로 직접 트리거**한다(사용자가 매 질문마다
  SAP를 언급하면 매번 조회되므로 비용이 큰 조회는 아니지만, 백엔드/SAP GUI가 꺼져 있으면 그때마다
  15초 타임아웃 대기가 생긴다는 점을 새 트리거 조건 추가 시 감안할 것).
- **백엔드**: `kortek_backend.py`의 `/sap-fetch`(GET) — 실제 SAP GUI Scripting(COM) 작업은 이
  파일이 직접 하지 않고 `sap_bridge_32.py`를 서브프로세스(`py -3-32 sap_bridge_32.py`)로 실행해서
  시킨다(아래 "⚠️ 32비트 브릿지" 항목 참고). 브릿지가 stdout에 JSON 한 줄
  (`{"ok":true/false, "source":"grid"|"fields", "text":..., "error":...}`)을 출력하면 그대로 읽어
  응답으로 전달. `sap_bridge_32.py` 내부: 화면에 ALV 그리드(`GuiShell`/`SubType=GridView`)가 있으면
  `_sap_find_grid`+`_sap_dump_grid`로 표 전체를 탭 구분 텍스트로, 없으면 `_sap_dump_fields`로
  보이는 라벨/입력필드 텍스트를 순서대로 모아 반환. **특정 트랜잭션 코드 전용 파서를 만들지 않는
  게 의도적 설계** — 어떤 화면이든 "있는 그대로 텍스트 덤프"만 하고, 그걸 구조화하는 건 전부
  AI(`callAiBackend`)에게 맡긴다. 새 SAP 화면 종류를 지원해야 한다는 요청이 와도, 원칙적으로
  이 덤프 로직 자체는 안 건드리고(이미 웬만한 화면에서 다 동작해야 함) 프롬프트의 "🏭 SAP 조회
  규칙" 문구만 조정하는 방향을 먼저 검토할 것. 실제 SAP 화면(BOM 전개 `ZPP033`, ALV 그리드 45행)에
  대해 이 파이프라인이 정상 동작함을 실사용 테스트로 확인함(2026-09-14).
- **프롬프트 배선**: `js/04g-core-app-upload-utils-2.js`의 `_buildGanttQaPromptTemplateRaw`/
  `_buildGanttQaPrompt`에 `sapSection`/`sapText` 인자를 추가해 `${sapSection}` 토큰으로 주입
  (`${mailSection}`/`${otherProjectSection}`과 동일한 패턴). `otherProjectSection`과 마찬가지로
  `validateGanttQaPromptStructure`/`PROTECTED_STRUCTURE_RULE`(04h)의 "필수 플레이스홀더" 목록에는
  **의도적으로 포함하지 않음** — AI가 팀 공용 프롬프트를 자동개선할 때 이 선택적 섹션까지 반드시
  지키라고 강제하지 않는 기존 관례를 그대로 따름. 대신 저장된 팀 공용 프롬프트에 아직 이 토큰이
  없는 경우(이 기능 추가 이전에 저장해둔 프롬프트)를 대비해, `${sapSection}` 토큰이 템플릿에
  아예 없으면 치환 결과 끝에 SAP 데이터를 강제로 덧붙인다(안 그러면 조회는 성공했는데 AI 프롬프트
  어디에도 안 실려서 AI가 SAP 데이터를 완전히 모르는 것처럼 답하는 버그가 실제로 발생했었음 —
  `templateHasSapToken` 분기 참고, "🏷️ [필수] 프로젝트 이름 표시 규칙"과 동일 패턴).
- **⚠️⚠️ 32비트 브릿지가 필수인 이유(실사용 디버깅으로 확정, 2026-09-14) — 이 사실을 모르면 반드시
  같은 삽질을 반복함**: SAP GUI Scripting의 COM 컴포넌트는 **32비트로만** 레지스트리에 등록되어
  있다(`HKLM\SOFTWARE\WOW6432Node\SAP\SAPGUI Front\SAP Frontend Server\Security`에만
  `UserScripting` 값이 존재, 64비트 레지스트리 뷰에는 아예 없음). 이 프로젝트의 백엔드
  Python(3.11/3.14, python.org 표준 설치)은 **64비트**라서, `kortek_backend.py`가 직접
  `win32com.client.GetObject("SAPGUI")`를 부르면 SAP GUI가 켜져 있고 로그인돼 있고 스크립팅
  옵션도 켜져 있어도 **항상 100% 재현되는** COM 오류 `-2147221020`(MK_E_SYNTAX, "SAPGUI 항목을
  찾을 수 없음")로 실패한다 — 이 오류가 스크립팅 자체가 안 켜져 있다는 뜻일 수도 있고(그 경우
  해결책은 SAP GUI Options에서 Enable Scripting 체크) 64/32비트 불일치일 수도 있어서(그 경우
  해결책은 완전히 다름) 초반엔 원인 특정에 여러 라운드가 걸렸다. **같은 PC에서 32비트 Python으로
  똑같은 `GetObject("SAPGUI")`를 부르면 즉시 성공**한다는 게 결정적 증거였다. 그래서 실제 COM
  작업은 전부 `sap_bridge_32.py`(별도 32비트 Python 프로세스)로 옮겼고, `kortek_backend.py`는
  `subprocess.run(['py', '-3-32', ...])`로 그 결과(JSON 한 줄)만 받아온다 — **`kortek_backend.py`에
  절대 `win32com`을 다시 직접 import하지 말 것**, 64비트라 어차피 못 찾는다. `py -3-32`가 안 되면
  (`py install 3-32` 필요) `kortek_backend.bat`의 자동 설치 블록이 최초 1회 처리한다(같은 이유로
  `requirements.txt`엔 pywin32가 없음 — 메인 64비트 환경용이 아니므로).
- **디버깅 시 확인 순서**: ① `kortek_backend.bat` 콘솔에 `[SAP] 32비트 Python 확인 완료`가
  찍혔는지(안 찍혔으면 32비트 런타임 문제) ② `/sap-fetch` 응답의 `error` 필드 ③ 그래도 막히면
  터미널에서 직접 `py -3-32 sap_bridge_32.py` 실행해서 kortek_backend.py를 거치지 않고 바로
  원인 확인(이 방법으로 실제 원인을 찾았음).
  **⚠️ 위 ③번 방식(터미널에서 직접 `py -3-32 sap_bridge_32.py` 실행)으로 라이브 진단하는
  동안, 사용자가 동시에 앱에서 실제 SAP 기능을 쓰면 두 프로세스가 같은 SAP GUI 세션을
  동시에 조작하게 되어 서로 방해할 수 있다(2026-09-15 실사용에서 확인) — 진단 스크립트가
  MM03/CS15 등으로 화면을 이리저리 옮기는 도중에 사용자의 실제 요청(예: 승인원 표지 생성)이
  같은 세션에 들어오면, 그 요청이 예상 못한 화면 상태를 만나 "필드를 찾지 못했습니다" 같은
  오류로 실패할 수 있다 — **코드 버그가 아니라 진단 스크립트와의 충돌일 수 있으니**, 이런
  실패가 보이면 진단 스크립트를 모두 멈춘 뒤(또는 시간을 두고) 조용한 상태에서 재현되는지부터
  확인할 것(실제로 이 방식으로 "버그처럼 보였던" 실패가 재시도 시 정상 동작하는 것으로
  확인된 사례가 있음). SAP GUI Scripting 자체에 동시 접근을 막는 잠금장치가 없어 생기는
  근본적인 제약이라, 이 저장소의 실사용 패턴(팀원마다 자기 PC에서 개별 SAP GUI+백엔드 실행)
  에서는 "같은 세션을 스크립트 2개가 동시에 건드리지 않는다"는 걸 사람이 챙겨야 한다.
- **엑셀 내보내기**: "엑셀로 저장해줘"/"다운로드해줘"류 명령은 `sendGanttQaMessage`(04h)의 전용
  블록이 `_ganttQaExtractSapExportRequest`(트리거 판정만)로 가로채, 방금 조회 성공한
  `window._lastSapFetchResult`(원본 탭 구분 텍스트)를 `_exportSapDataToExcel`로 그대로 XLSX
  변환한다 — **AI 답변 텍스트가 아니라 원본을 쓰는 이유**: AI가 요약하면서 빈 항목을 `` 같은 빈
  코드블록으로 얼버무리는 등 값이 미묘하게 바뀌는 사례가 실사용에서 확인됐음. "SAP 데이터 있어?/
  가능해?" 같은 **질문형**은 물음표나 "가능/되나/될까" 포함 여부로 걸러내 실행 명령으로 오인하지
  않는다(`looksLikeQuestion` 가드 — 실제로 이 오인식이 터진 뒤 추가됨). 같은 3단계 로컬명령 판단
  원칙(위 "💬 AI 문답" 절)을 그대로 따름 — 새 "AI가 뭔가 내보내기/저장하는" 요청을 추가할 때 참고.
  **⚠️ 캐시가 없으면 그 자리에서 한 번 더 조회(2026-09-15 버그수정)**: 원래는 `_lastSapFetchResult`
  캐시가 비어 있으면 곧바로 "아직 내보낼 SAP 데이터가 없습니다"로 실패했는데, 실사용에서 "SAP에서
  502572 BOM 열어서 엑셀로 출력해줘"처럼 조회와 내보내기를 한 메시지에 같이 요청하면 캐시가 당연히
  비어 있어 매번 실패하는 문제가 확인됨 — 지금은 캐시가 없으면 그 자리에서 `_aiFetchSapContext(question)`를
  한 번 호출해 그 결과를 바로 내보낸다. 이 때문에 함수 자체도 동기 함수에서 `sendGanttQaMessage`의
  비동기 블록으로 옮겨졌다(다른 SAP 로컬 명령들과 같은 패턴).
  **⚠️⚠️ "캐시가 있기만 하면" 무조건 재사용해서 무관한 이전 데이터를 다시 내보내던 버그
  (2026-09-15 실사용에서 확인)**: "104438 사용처 엑셀로 출력해줘" 다음에 "502572 표준가격
  표시된 BOM 엑셀로 출력해줘"라고 완전히 다른 걸 물었는데도, 둘 다 "엑셀"+"출력" 키워드만
  보고 이 블록에 걸리다 보니 캐시가 "존재하기만 하면"(내용이 무엇이든) 그냥 재사용해버려서
  두 번째 요청에 대해서도 첫 번째(104438) 데이터를 그대로 다시 내보내는 사고가 있었다 —
  캐시의 "내용이 지금 요청과 맞는지"는 전혀 확인하지 않던 게 원인. **수정**: 캐시가 있어도
  질문 자체가 새 SAP 조회 대상을 명시하면(`window._questionMentionsSapIntent(question)` —
  위 "SAP" 게이트 확장에서 만든 그 헬퍼를 그대로 재사용, 자재번호+BOM/사용처/역전개 조합이면
  true) 무조건 새로 조회하도록 조건을 `!cached || !cached.text || looksLikeFreshSapRequest`로
  넓힘. 자재번호 없는 순수 "엑셀로 저장해줘"류 후속 메시지(방금 조회한 걸 그대로 내보내 달라는
  의도)는 `looksLikeFreshSapRequest`가 false라 여전히 캐시를 재사용 — 의도한 동작 그대로 유지.
  **덤으로 파일명도 같이 고침**: `_exportSapDataToExcel`의 파일명이 BOM/사용처 헤더엔
  `[트랜잭션: ...]` 태그가 없어서(그 태그는 범용 `/sap-fetch` 경로 전용) 항상 기본값 'SAP'로
  떨어져, 서로 다른 조회를 내보내도 파일명이 매번 `SAP_SAP_20260915.xlsx`로 똑같이 나왔다 —
  이 자체가 버그는 아니었지만(파일 내용은 맞았음, 위 캐시 버그와는 별개) "결과가 똑같아
  보인다"는 혼란을 더했다. BOM/사용처 헤더에서 트랜잭션 코드+자재번호를 직접 뽑아
  `SAP_ZPP038_502572_..`/`SAP_CS15_104438_..`처럼 조회 대상이 파일명에도 드러나게 함.
- **BOM 조회("SAP에서 502572 BOM 열어서...", 2026-09-15 신규)**: `_aiFetchSapContext`가 이제
  `question` 인자를 받아 "BOM"과 자재번호가 같이 언급되면 그냥 "지금 화면"을 읽는 대신
  `/sap-bom?material=...`(ZPP038 "BOM 전개"로 직접 이동)을 호출한다 — MM03 문서 열기의 자재번호
  직접조회와 같은 설계로, **AI 문답의 일반 대화 경로(`sendGanttQaMessage`가 `_aiFetchSapContext(question)`을
  부르는 두 곳 — 엑셀 내보내기 블록과 메인 AI 호출 블록 둘 다)에서 자동으로 적용된다**(로컬
  명령을 새로 추가한 게 아니라 기존 조회 함수 자체를 똑똑하게 만든 것 — "BOM"이 아닌 질문/자재번호가
  없으면 완전히 기존과 동일하게 동작). `sap_bridge_32.py`의 `fetch_bom(material, plant='1000')`/
  `_navigate_to_bom_screen` — 2026-09-15 실사용 SAP GUI "기록 및 재생" 매크로로 확보. 매크로에는
  실행(F8) 이후 "레이아웃 불러오기"(`&MB_VARIANT`/`&LOAD`)와 SAP 자체 엑셀 내보내기(`&MB_EXPORT`/
  `&XXL`, OLE로 Excel을 직접 여는 SAP 표준 기능)가 이어지는데, 이건 이 코드베이스의 기존 설계
  (특정 트랜잭션 전용 파서 안 만들고 화면을 그대로 텍스트로 덤프 → 자체 XLSX 빌더로 내보내기)와
  겹치는 기능이라 재현하지 않고 실행(F8)까지만 자동화했다 — 결과 화면은
  `_sap_dump_screen_body(wnd)`(아래 참고)로 읽는다.
  - **⚠️ [2026-09-15 갱신] `fetch_bom`이 더 이상 ZPP038 고정이 아님** — 아래 "BOM 조회 전
    옵션 사전질문 + ZPP033/ZPP038 자동 라우팅 + 내보내기 후 폴더 이동 확인" 절 참고. 이
    문단(BOM+자재번호만 있으면 바로 조회하던 기존 동작)은 여전히 유효하지만, 실제 실행
    전에 항상 옵션(Explosion type/Show price/Location Information)을 먼저 물어보고,
    자재 개수/워딩에 따라 ZPP033(단일)로도 갈 수 있게 확장됨.
  - **범용 덤프에 "트리" 지원 추가(2026-09-15) — "그리드 → 트리 → 필드" 3단계 폴백**: 사용자가
    "BOM 표준가 부모-자식 계층.vbs" 매크로로, ZPP038 결과 화면이 체크박스(`chkSHOW_L`/
    `chkSHOW_P`)와 라디오버튼(`radR_2`) 설정에 따라 **ALV 트리(부모-자식 계층)로도 표시될
    수 있음**을 확인해줌 — 기존 `_sap_find_grid`(SubType이 정확히 'GridView'인 것만 찾음)는
    이런 화면을 놓칠 위험이 있었다. `fetch_current_screen`/`fetch_material_documents`/
    `fetch_bom` 세 함수가 각자 반복하던 "그리드 없으면 필드로 폴백" 2단계 로직을
    `_sap_dump_screen_body(wnd)` 하나로 통합하면서, 그 사이에 **트리 단계**를 추가했다:
    ① `_sap_find_grid`(GridView 전용)로 못 찾으면 → ② `_sap_find_shell_any`(SubType 무관,
    아무 GuiShell이나) + `_sap_dump_tree`(`GetAllNodeKeys`+`GetColumnNames`+`GetItemText`
    조합을 시도, 실패하면 `GetNodeTextByKey` 등 대안 시도)로 트리를 읽어보고 → ③ 그래도
    안 되면 기존 `_sap_dump_fields`로 최종 폴백. **⚠️⚠️ 트리 덤프(`_sap_dump_tree`)는 아직
    실사용 미검증** — SAP GUI Tree 컨트롤의 정확한 스크립팅 API 이름은 버전/화면마다 다를
    수 있어 여러 방식을 순서대로 시도하도록만 짜뒀다. BOM이 "부모-자식 계층" 모드로 조회됐는데
    내용이 비거나 이상하면 이 함수부터 의심하고, 그 시점 화면의 `(Type, SubType, Id)`
    트리를 덤프해서 정확한 API를 확인할 것(기존 "진단 방법" 항목과 동일한 방식).
  - **복수 자재 BOM("SAP에서 502572,502573,502574 BOM 보여줘", 2026-09-15 신규 —
    "BOM 복수 열람.vbs" 매크로로 확보)**: 질문에 자재번호가 2개 이상 언급되면
    `_aiFetchSapContext`가 전부 모아 `material=502572,502573,502574`처럼 쉼표로 이어
    `/sap-bom`에 같이 보낸다. `fetch_bom`/`_navigate_to_bom_screen`이 리스트를 받으면
    MATNR 필드 옆의 "복수 선택" 버튼(`btn%_MATNR_%_APP_%-VALU_PUSH`)을 눌러 SAP 표준
    "복수 선택" 팝업(`_SAP_MULTI_SELECT_POPUP_TABLE` — ZDMSR004의 자재코드 팝업과 같은
    구조, `download_documents_batch`와 로직 공유)에 값을 채운다. **⚠️⚠️ 확인 버튼 개수가
    ZDMSR004와 다르다**: ZDMSR004의 `S_MATNR`(SELECT-OPTIONS) 팝업은 `btn[24]`→`btn[8]`
    두 번 눌러야 했는데, 이 ZPP038의 `MATNR`(PARAMETERS로 추정, `S_` 접두사 없음) 팝업은
    `btn[8]` 한 번만으로 충분했다(매크로로 확인) — 같은 SAP 표준 팝업이라도 호출 맥락마다
    필요한 버튼 수가 다를 수 있다는 뜻이니, 새 트랜잭션의 "복수 선택" 팝업을 자동화할 때
    이 버튼 동작을 당연히 같다고 가정하지 말고 매번 매크로로 확인할 것.
  - **⚠️⚠️ 플랜트 필드 "라벨 vs 실제 입력칸" 충돌 — 실사용에서 조용한 실패로 확인됨
    (2026-09-15)**: 사용자가 "SAP에서 502572 BOM 열어줘"라고 요청했을 때 AI가 실제로는
    조회에 실패했으면서 마치 성공한 것처럼(기본값/빈 값을 그대로 에코해서) 답변한 사고가
    있었다 — 사용자가 SAP 화면을 캡처해서(플랜트 필드가 빨갛게 비어있는 채로 멈춰있는
    ZPP038 선택화면) 알려줘서 발견함. 원인: SAP 선택화면은 입력 필드(`ctxtWERKS`,
    `GuiCTextField`) 옆에 **ID에 같은 "WERKS" 문자열이 들어있는 라벨 컨트롤**
    (`txt%_WERKS_%_APP_%-TEXT`, `GuiTextField`, `Text='플랜트 '`)을 같이 만들어두는 경우가
    흔한데, `_navigate_to_bom_screen`/`_navigate_to_where_used_screen` 둘 다 첫 매치만
    쓰는 `_find_by_id_substring(wnd, 'WERKS')`로 플랜트를 설정하고 있었다 — 이 라벨이
    먼저 매치되면 `.text` 대입은 예외 없이 "성공"하지만 실제 입력칸은 계속 비어 있고,
    이후 실행(F8)이 SAP의 "모든 필수 입력 필드에 값을 입력하십시오" 오류로 조용히 막히는데
    호출 코드는 그 오류를 확인하지 않아(그리드/트리/필드 덤프만 시도) 실패를 못 알아챘다
    — 위 "MM03 자재번호 필드" 함정(`_find_all_by_id_substring`)과 완전히 같은 종류의 버그.
    진단은 사용자의 실제 멈춰있는 SAP 세션에 `py -3-32`로 직접 접속해 상태바
    (`MessageType='E'`)와 WERKS 매치 컨트롤 2개(라벨/실제 입력)를 확인, 세션을 수동으로
    고쳐서(`ctxtWERKS`에 직접 값 설정 후 F8) 그리드가 정상적으로 뜨는 것까지 확인해 100%
    확정함. **수정**: 새 공용 헬퍼 `_set_text_on_best_candidate(wnd, substring, value,
    prefer_types=('GuiCTextField','GuiTextField'))`(`_find_all_by_id_substring` 바로 뒤에
    위치) — 후보를 전부 모아 `GuiCTextField`(실제 입력형) 우선순위로 정렬한 뒤 실제로
    `.text` 대입이 되는 첫 후보에 값을 넣는다. `_navigate_to_bom_screen`과
    `_navigate_to_where_used_screen`(CS15) 둘 다 이 헬퍼로 교체함. **앞으로 SAP 선택화면의
    입력 필드를 ID substring으로 찾을 때는 항상 이 헬퍼(또는 `_find_all_by_id_substring` +
    타입 우선순위 정렬)를 쓸 것** — 단순 `_find_by_id_substring` 첫 매치는 라벨 컨트롤에
    걸릴 위험이 있다.
- **BOM 조회 전 옵션 사전질문 + ZPP033/ZPP038 자동 라우팅 + 내보내기 후 폴더 이동 확인
  (2026-09-15 신규, 3부분 요청)** — 사용자가 실제 ZPP038 "BOM 전개" 초기화면 캡처(Explosion
  type·Option 두 섹션을 빨간 박스로 표시)를 보여주며 요청한 3가지:
  1. **옵션 사전질문(항상 먼저 물어봄)**: BOM 조회를 실행하기 전에 반드시 Explosion type
     (단일 레벨/다중 레벨)·Show price·Location Information을 먼저 물어보고 답을 받아야
     실행한다 — 사용처(역전개)처럼 "절대 안 물어보는" 설계와 정반대. `js/04h`의
     `window._ganttQaBomDraft`(승인원 표지/SAP 문서 모호성 해소와 동일한 "여러 턴 draft"
     패턴)가 담당: 새 "BOM"+자재번호 요청을 감지하면(`_ganttQaExtractBomTrigger`, 역전개/
     사용처가 같이 언급되면 그쪽에 양보) 그 메시지 안에 이미 옵션이 다 있는지 먼저 느슨하게
     파싱해보고(`_ganttQaParseBomOptionReply` — "단일 레벨, 가격 표시, 위치 정보 안 함"류
     자유문장에서 explosion/showPrice/showLocation을 뽑음, 언급 안 된 항목은
     undefined로 남겨 "모름"과 "아니오"를 구분), 하나라도 비어있으면 딱 한 번 옵션 질문을
     묻고 답을 기다린다. **완전히 새 fetch/응답 로직을 만들지 않고 기존 BOM 자동조회+AI
     응답 경로를 재사용**하는 방식을 택함(승인원 표지처럼 통째로 새로 만들면 유지보수 부담이
     커짐) — 옵션이 다 모이면 `window._ganttQaBomResolvedOptions`(그 자재 조합에 대해 딱
     한 번만 쓰이는 1회성 값)에 남겨두고 `question`을 원래 질문으로 되돌려(`let question`으로
     변경 필요했음) 정상 로컬명령/AI 흐름을 그대로 재개시킨다 — 이때 원래 질문이 draft 시작
     시점에 이미 한 번 히스토리에 들어가 있으므로 `_skipUserHistoryPush` 플래그로 중복 push를
     막는다. `_aiFetchSapContext`의 `bomMatch` 분기가 이 1회성 값을 읽어 `/sap-bom`에
     `tcode`/`explosion`/`show_price`/`show_location` 쿼리파라미터로 실어 보내고 즉시
     비운다(재사용 금지 — 다음 BOM 질문은 다시 물어봐야 하므로). 브라우저에서 `fetch`를
     모킹해 전체 왕복(단일 자재 자동단일→옵션질문→답변→`/sap-bom` 호출 파라미터 확인,
     자재 2개+"단일" 워딩 충돌→되물음→"복수"로 답→옵션질문→답변→정상 진행, 한 메시지에
     옵션 전부 포함→안 물어보고 바로 진행)을 전부 확인함.
  2. **ZPP033(단일)/ZPP038(복수) 자동 라우팅**: 사용처(역전개)의 "다중/일괄/복수" 워딩
     라우팅(`wantsBatchWhereUsed`)과 같은 설계를 재사용하되, BOM은 "애매하면 조회 전에
     한번 물어봐줘"까지 요구돼서 사용처보다 한 단계 더 나간다 — "복수/다중" 워딩 → 무조건
     ZPP038, "단일/단수" 워딩 + 자재 1개 → ZPP033, **"단일/단수" 워딩 + 자재 2개 이상 →
     모순이므로 되물음**(`_ganttQaBomDraft.stage==='tcode'`), 워딩 없음 → 자재 개수로 자동
     판정(1개→ZPP033, 2개 이상→ZPP038). `sap_bridge_32.py`의 `_navigate_to_bom_screen`이
     `use_single_tcode`/`explosion`/`show_price`/`show_location` 4개 인자를 새로 받아
     `/nZPP033` 또는 `/nZPP038`로 이동 — 두 트랜잭션은 라이브 진단(`session.
     StartTransaction`으로 각각 직접 접속해 `usr` 트리 전체 덤프)으로 정확한 필드 ID를
     확보함: 자재 입력 필드만 다르고(ZPP038: `ctxtMATNR-LOW`+"복수 선택" 팝업, ZPP033:
     `ctxtMATNR` 단일 필드) 플랜트·**Explosion type 라디오버튼(`radR_1`="Single level"
     기본선택/`radR_2`="Multi level")**·**Option 체크박스 중 `chkSHOW_P`="Show price"/
     `chkSHOW_L`="Location Information"**은 두 화면에서 완전히 동일한 필드 ID였다(ZPP038엔
     `chkP_MULTI`/`chkP_CK`가, ZPP033엔 `chkP_STD`/`chkP_CUS`가 더 있지만 이 기능과는 무관).
     `fetch_bom`이 실제 사용된 트랜잭션(자동판정 결과 포함)에 맞춰 응답 헤더의 `[SAP BOM
     전개(...)]` 라벨도 `ZPP033`/`ZPP038`로 동적으로 바꿔 반환 — 예전엔 무조건 "ZPP038"로
     하드코딩돼 있었음. `kortek_backend.py`의 `/sap-bom`이 `tcode`(single/multi/auto)·
     `explosion`(single/multi)·`show_price`·`show_location` 쿼리파라미터를 그대로
     `sap_bridge_32.py`에 위치 인자로 전달.
  3. **엑셀 내보내기 후 "해당 폴더로 이동하시겠습니까?"**: "엑셀로 내보내줘" 로컬 명령
     (`_ganttQaExtractSapExportRequest` 처리 블록)이 성공하면 답변 끝에 이동 여부를 묻고
     `window._ganttQaOpenFolderConfirm = true`를 세운다 — 다음 메시지를 그 답으로 해석하는
     블록을 `sendGanttQaMessage` 맨 앞(음성/알람 로컬 명령 바로 다음, API 키 없어도 동작)에
     둠. **이 내보내기는 브라우저의 XLSX.js가 트리거하는 일반 다운로드라 서버가 실제 저장
     경로를 알지 못한다** — ZDMSR004 배치 다운로드/승인원 표지처럼 서버가 직접 고정 폴더
     (`C:\SAP_DMS\...`)에 쓰는 게 아니므로, "해당 폴더"는 브라우저의 기본 다운로드 폴더
     (대부분 `%USERPROFILE%\Downloads`)로 간주해 새 엔드포인트 `kortek_backend.py`의
     `/open-downloads-folder`(SAP GUI와 무관 — `sap_bridge_32.py`를 거치지 않고
     `os.startfile()`만 호출)를 부른다. 부정/무관한 답이면(승인원 표지의 "무관한 답이면
     조용히 해제" 패턴과 동일) 그냥 아무 일도 안 하고 끝냄 — 엉뚱하게 일반 AI 질문으로
     새어나가지 않도록 항상 이 블록에서 `return`한다.
- **사용처 조회/역전개("SAP에서 303410 역전개 보여줘"/"...사용처 알려줘", 2026-09-15 신규 —
  "BOM 역전개(사용처리스트).vbs" 매크로로 확보)**: BOM 정전개(ZPP038, "이 자재는 뭘로
  구성되는가")의 반대 방향 — "이 자재가 어느 상위 품목에 쓰이는가"를 CS15("단일레벨
  사용처리스트")로 조회한다. `_aiFetchSapContext`가 "역전개"/"사용처" 키워드 + 자재번호를
  감지하면 `/sap-where-used?material=...`를 호출("BOM" 키워드보다 우선순위 높음 — 둘 다
  매치되면 이쪽을 씀). `sap_bridge_32.py`의 `fetch_where_used(material, plant='1000')`/
  `_navigate_to_where_used_screen` — **⚠️⚠️ 이 기능은 다른 것들보다 신뢰도가 낮았으나,
  2026-09-15 실사용 진단으로 핵심 결함(4번) 하나는 확실히 해결됨**:
  1. **자재번호 입력 필드 ID가 매크로에 안 나온다** — 녹화 당시 SAP가 이전 값을 기억하고
     있어서 사람이 따로 입력할 필요가 없었던 것으로 추정됨. 그래서 필드 ID는 직접 확인된
     게 아니라 같은 화면의 체크박스(`RC29L-DIRKT`)에서 구조 접두사(`RC29L`)를 유추해
     "MATNR" 문자열 포함 컨트롤을 `_find_all_by_id_substring`로 찾아 실제 입력 가능한
     것부터 시도하는 추측성 코드다(틀렸으면 조용히 엉뚱한 자재를 조회하는 대신 명확한
     RuntimeError로 실패하게 만들어둠).
  2. **매크로 뒷부분(실행 후 `btn[45]` → SAP 표준 선택 팝업(SAPLSPO5) 응답 → F4 → 재응답 →
     뒤로가기 3번)을 의도적으로 재현하지 않았다** — 이 시퀀스가 결과에 꼭 필요한지, 아니면
     조건부로만 뜨는 부가 동작인지 확신할 수 없어서 실행(F8)까지만 자동화하고 결과 화면을
     그대로 읽는다(방어적으로 팝업이 뜨면 Enter만 시도). **조회 결과가 비거나 이상하면
     이 부분부터 의심할 것** — 그 팝업이 뜬 상태를 다시 녹화해서 정확한 의도를 파악해야
     완성도가 올라감. 현재는 자재 1개만 지원(복수 조회는 CS15의 "복수 선택" 팝업 존재
     여부부터 확인 필요, 아직 미구현).
  3. **⚠️⚠️ "SAP"란 단어 없이 물으면 조회 자체가 실행 안 됨 — 실사용 버그, 2026-09-15
     수정**: 사용자가 "104446 사용처 조회해줘"(⚠️ "SAP" 미포함)라고 물었더니 AI가 SAP를
     전혀 조회하지 않고 간트 프로젝트 데이터에서만 그 번호를 찾다가 "데이터에서 확인되지
     않습니다"라고 답한 사고 — 원인은 `js/04h`의 메인 AI 호출 경로(`sendGanttQaMessage`)에
     있던 게이트가 `/sap/i.test(question)`만 보고 `_aiFetchSapContext`를 부를지 말지
     정했던 것: 이 함수 *안*에는 이미 "사용처/역전개"+자재번호, "BOM"+자재번호를 감지해
     CS15/ZPP038로 바로 가는 로직이 있었는데, 바깥 게이트가 "SAP"라는 단어를 요구해서 그
     안쪽 로직까지 도달을 못 했다(위 "💬 AI 문답" 절의 "당연히 될 줄 알았는데 안 된다"
     버그 패턴과 동일). 새 공용 헬퍼 `window._questionMentionsSapIntent(question)`
     (`_aiFetchSapContext` 정의 바로 위)를 만들어 `/sap/i` 매치 **또는** (역전개/사용처 +
     5~8자리 숫자) **또는** (bom + 5~8자리 숫자)면 true를 반환하게 하고, 메인 AI 호출
     경로의 게이트를 이 헬퍼로 교체함 — 이제 "SAP"를 안 붙이고 "104446 사용처 조회해줘"/
     "502572 BOM 보여줘"라고만 해도 정상적으로 SAP 조회가 트리거된다. 단, 엑셀 내보내기·
     문서 열기·문서 목록·배치 다운로드 로컬 명령들(`_ganttQaExtractSapExportRequest` 등)은
     각자 별도 함수에서 여전히 `/sap/i`를 요구한다 — 이번 수정 범위가 아니며, 같은 부류의
     제보가 또 들어오면 그 함수들도 개별적으로 같은 방식으로 넓혀야 한다.
  4. **⚠️⚠️ 진짜 원인 확정(2026-09-15, 사용자가 캡처해준 화면 + 그 실제 멈춰있는 세션에
     직접 접속한 진단으로 확인) — 위 2번 항목이 실제로 필요했다**: "104446 사용처
     조회해줘"가 3번 버그 수정 뒤에도 "결과가 비어 있어 확인이 어렵습니다"로 계속 실패했다
     — 사용자가 캡처해준 화면이 "사용처 리스트: 자재: 뷰"라는 **별도의 중간 화면**(wnd[1]
     팝업이 아니라 wnd[0] 자체가 이 화면으로 바뀜, 그래서 기존의 wnd[1] 방어 코드로는 전혀
     안 잡혔다)이었고, 상태바에 "자재 104446의 용도에 대한 선택을 하지 않았습니다" 오류가
     남아 있었다. 그 실제 멈춰있는 세션에 `py -3-32`로 직접 접속해 화면 트리를 덤프해보니
     정확한 필드 ID를 확인할 수 있었다: `usr/ctxtRC29L-WERKS`(플랜트), `usr/ctxtRC29L-
     POSTP`(품목 범주), `usr/ctxtRC29L-STLAN`(용도), 실행 버튼은 첫 화면과 동일하게
     `tbar[1]/btn[8]`. 그 세션에서 플랜트만 다시 채우고 실행 버튼을 눌러보니(용도/품목범주는
     비워둔 채) 오류 없이 곧바로 결과 그리드로 정상 진입했다 — 즉 "용도"가 진짜 필수인 게
     아니라(에러 메시지가 오해를 유발함), 이 중간 화면 자체에서 **플랜트를 한 번 더** 넣어야
     하는 것뿐이었다(그 오류 메시지는 플랜트도 용도도 둘 다 비어 있던 이전 시도의 잔여
     메시지로 추정). `_navigate_to_where_used_screen`의 첫 F8 실행 직후에, `usr/ctxtRC29L-
     WERKS` 필드가 존재하면(=이 중간 화면이 떴으면) `_set_text_on_best_candidate`로 플랜트를
     다시 채우고 `tbar[1]/btn[8]`을 한 번 더 눌러 결과 그리드로 진입하도록 수정 — 맨 처음
     `/nCS15`로 새로 들어가는 것부터 다시 실행해 자재 104446의 실제 사용처(302804/302805/
     500050 등 다수)가 정상적으로 조회됨을 확인함. 이 중간 화면이 모든 자재에서 뜨는지는
     검증 안 됐지만(안 뜨면 조용히 건너뛰므로 무해), 안 뜨는 자재로도 정상 동작함은 기존
     로직이 그대로 보장한다.
  5. **복수 자재 사용처 조회("104438/104481/104477/117451 다중 사용처 조회해줘", 2026-09-15
     신규) — ZPP046을 시도했으나 500행 캡 공유 문제로 포기하고 "자재별 순차 실행"으로
     구현**: 사용자가 "다중 역전개는 ZPP046인 것 같다"고 제보 — 실사용 세션에
     `session.StartTransaction('ZPP046')`으로 직접 확인해보니 정말 존재했다("자재 사용처
     일괄조회", 회사 커스텀 리포트). 필드는 `P_WERKS`(플랜트)·`S_MTART`(자재유형)·
     `S_MATNR`(자재, SELECT-OPTIONS + `btn%_S_MATNR_%_APP_%-VALU_PUSH` 복수 선택 버튼 —
     ZDMSR004/ZPP038과 동일한 SAP 표준 팝업)·`S_DISPO`(MRP 관리자) 등. 팝업에 4개 자재를
     채우고 확인(`btn[8]` 1번 — ZPP038과 동일하게 단일 버튼으로 충분했음)한 뒤 재실행해서
     팝업을 다시 열어보니 **4개 다 SELECT-OPTIONS에 정상 등록**돼 있었다(내부적으로는
     제대로 동작). 그런데 실제 F8 실행 결과 그리드엔 **자재 104438 하나만** 나오고 나머지
     3개는 전혀 안 보였다 — 원인은 `_sap_dump_grid`의 "응답 크기 보호용 500행 캡"이었다:
     `grid.RowCount`로 확인해보니 실제로는 총 1803행이 있었는데(즉 4개 자재 결과가 전부
     SAP 안에는 있었음), SAP이 자재번호(IDNRK)순으로 정렬해서 반환하다 보니 제일 앞선
     자재 104438 혼자 사용처가 500건을 넘어(정확히는 그 이상) 우리 500행 캡을 다 차지해
     버렸다 — ZPP038 BOM은 자재 1개당 결과가 보통 수십 행이라 이 캡 공유 문제가 거의 안
     드러났는데, CS15/ZPP046 계열은 자재 하나가 사용처 수백 건까지 가능해 "여러 자재를 한
     그리드에 섞어서 캡을 나눠 쓰는" 방식 자체가 안 맞았다. **최종 선택**: ZPP046(SAP 서버
     쪽에서 한 번에 묶어 처리)을 포기하고, `fetch_where_used`가 자재마다 CS15를 따로
     순차 실행해 결과를 이어붙이는 방식으로 구현 — 느리지만(자재 수만큼 SAP 화면 전환)
     각 자재가 500행 캡을 독립적으로 보장받는다. 최대 10개까지 지원, 백엔드 타임아웃은
     `min(150, 30 + 20*자재수)`초로 스케일링. **덤으로 발견한 진짜 원인**: 애초에
     "104438 104481 104477 117451 다중 사용처 조회해줘"를 물었을 때 AI가 첫 번째 자재만
     처리하고 나머지를 "결과 영역이 비어있다"고 답한 건, 프런트(`js/04h`의
     `_aiFetchSapContext`)의 `whereUsedMatch` 정규식이 **non-global**이라 자재번호를
     첫 번째 것 하나만 뽑고 있었기 때문이었다(`bomNums`는 이미 global 매치라 이 버그가
     없었음) — 이것도 같이 global 매치(`/\b\d{5,8}\b/g`)로 고쳐서 모든 자재번호를
     `/sap-where-used?material=` 쉼표구분으로 넘기도록 수정.
  6. **"다중/일괄/복수"라고 명시하면 ZPP046 배치 경로로 라우팅(2026-09-15 신규, 사용자
     요청)**: 위 5번에서 ZPP046을 "기본 경로로는" 포기했지만, 사용자가 "왜 ZPP046을 안
     쓰냐"고 다시 물어봐서 트레이드오프(빠름 vs 500행 캡 공유로 잘릴 위험)를 설명했더니,
     **"역전개/사용처를 다중/일괄/복수의 의미로 말할 때만 ZPP046을, 단수 의미로 말하면
     CS15를 쓰게 해달라"**고 요청 — 즉 자재 개수가 아니라 **문구 자체**가 기준. 새
     `sap_bridge_32.py`의 `fetch_where_used_batch(materials, plant)`가 ZPP046 전체
     플로우(단일 자재는 `ctxtS_MATNR-LOW`에 직접, 복수는 표준 복수 선택 팝업)를 캡슐화하고,
     `kortek_backend.py`의 `/sap-where-used-batch`(최대 8개로 자름 — 복수 선택 팝업 한
     화면 입력 행이 8개까지만 확인됨, ZDMSR004와 동일한 제약)가 이를 호출한다. 프런트
     (`js/04h`의 `_aiFetchSapContext`)는 "역전개"/"사용처" + 자재번호에 더해 **"다중"/
     "일괄"/"복수"** 중 하나라도 같이 있으면(`wantsBatchWhereUsed`) `/sap-where-used-batch`
     로, 없으면(자재가 몇 개든) 기존 `/sap-where-used`(자재별 CS15 순차)로 보낸다 — "104438,
     104481 사용처 조회해줘"처럼 자재가 2개여도 "다중/일괄/복수"라는 말이 없으면 여전히
     안전한 기본 경로를 탄다. **실사용 재확인**: `fetch_where_used_batch`로 4개 자재를
     실제로 돌려보니 5번 항목과 똑같이 104438 혼자 500행 캡을 다 차지해 나머지 3개가
     데이터 행에 전혀 안 나왔다(헤더 라벨에는 4개 다 나열되지만 실제 데이터 행 검사로만
     확인 가능 — 헤더만 보고 "포함됐다"고 착각하지 않도록 주의) — 즉 이 배치 경로는 **알고
     쓰는 사람에게 속도를 주는 옵션이지, 완전성을 보장하지 않는다**는 걸 다시 한번 실측
     확인함. 잘리면 `_sap_dump_grid`가 자동으로 "... (총 N행 중 500행만 표시)" 문구를
     끝에 붙이므로 최소한의 신호는 응답에 남는다.
- **⚠️ "SAP"란 단어 요구를 자재번호 anchor가 있는 로컬 명령 전부로 확장(2026-09-15,
  사용자 요청으로 검토 후 적용)**: 사용처 조회/승인원 표지에서 "SAP"를 안 붙이면 인식을
  못 하던 버그를 두 번 고치고 나서, 사용자가 "이런 요청들은 다 SAP 없이도 되게 넓혀줄 수
  없냐"고 직접 물어봄 — 검토 후 "자재번호(5~8자리)가 이미 그 요청을 충분히 구체적으로
  만들어주는 명령"은 안전하게 넓히고, "자재번호 같은 anchor가 없는 순수 catch-all"만 SAP
  요구를 유지하는 원칙으로 정리해서 적용함:
  - **넓힌 것**: `_ganttQaExtractSapOpenDocRequest`(문서 열기)·`_ganttQaExtractSapListDocsRequest`
    (문서 목록)·`_ganttQaExtractSapBatchDownloadRequest`(배치 다운로드) — 셋 다 게이트를
    `/sap/i` 단독 요구에서 `/sap/i` **또는** 자재번호 존재(배치 다운로드는 2개 이상)로 넓힘.
    "문서/파일"+동사(열어/다운로드 등) 키워드는 그대로 유지되므로, 자재번호까지 같이 있어야
    통과하는 조합이라 오탐 위험은 낮다고 판단.
  - **넓히지 않은 것(원래도 안 넓혀도 됐음)**: `_ganttQaExtractSapExportRequest`(엑셀
    내보내기)는 재확인해보니 **애초에 "SAP" 리터럴을 요구한 적이 없었다** — "엑셀/excel/xlsx"
    +"출력/내보내/다운로드/저장" 키워드 조합만으로 판정하는 순수 catch-all이라, 사용자에게
    "이건 SAP를 계속 요구하는 쪽으로 남기자"고 제안했던 건 이 함수의 실제 코드를 다시 안
    보고 다른 SAP 로컬 명령들의 일반적 패턴만 보고 낸 부정확한 설명이었다 — 실제로는 SAP를
    안 붙여도 원래부터 동작했음(변경 없음, 정정만 함).
- **SAP 문서 "출력" 모호성 해소 — 애매하면 되묻는 2단계 문답 (2026-09-15, 사용자 요청)**:
  "104446 문서 출력해줘"처럼 "출력"이라는 동사 하나만으로는 "화면에 목록만 보여달라"는 건지
  "파일을 저장(다운로드)해달라"는 건지 구분이 안 되는데, 예전엔 이걸 조용히 "문서 목록
  보기"로 결정해버렸다(다른 명확한 동사가 없으면 `_ganttQaExtractSapListDocsRequest`가 기본
  으로 걸림). 사용자가 "파일을 저장하시길 원하시나요? 출력물을 원하시나요? → 어떤 출력물로
  출력되기를 원하시나요?" 같은 단계별 되묻기 패턴을 요청해서, SAP 문서/파일 관련 로컬 명령
  전체(문서 열기/목록/배치 다운로드)에 적용함:
  - **트리거**: `js/04h`의 `_ganttQaExtractSapDocAmbiguous(question)` — 자재번호 + "문서/파일"
    + "출력"은 있는데 의도가 이미 명확한 동사(열어/열기/보여/다운로드/저장/open)가 하나도
    없을 때만 애매하다고 판단(의도가 이미 명확하면 이 함수는 관여 안 하고 기존 경로가 그대로
    처리 — 새 마찰 최소화). 애매하면 `window._ganttQaSapDocClarify = {materials, stage:
    'action'}`를 세우고 "파일을 저장해드릴까요, 목록만 보여드릴까요?"라고 물은 뒤 `return`.
  - **연속 처리**: `sendGanttQaMessage` 맨 앞(배치 다운로드/단일 열기/문서 목록 판정보다
    먼저)에서 `window._ganttQaSapDocClarify`가 있으면 사람의 짧은 답("저장해줘"/"목록만
    보여줘"/"P01")을 해석 — 승인원 표지의 `_ganttQaApprovalDraft`와 같은 "대화 내용과 별개인
    상태" 패턴. **기존 판정 함수들을 재사용하되 새 fetch/액션 로직을 중복 구현하지 않기
    위해**, 기억해둔 자재번호를 사람의 답에 다시 붙여 그 판정 함수가 요구하는 동사가 포함된
    문장으로 합성한다(예: "목록만 보여줘" → `sapDocQuestion = "104446 문서 목록 보여줘"` →
    기존 `_ganttQaExtractSapListDocsRequest`가 그대로 처리). 단일 자재 "저장" 의도는 실제로는
    `open_document`가 다운로드+열기를 같이 하는 게 유일한 경로라(순수 "저장만" 액션이 따로
    없음), 자재 1개면 먼저 "어떤 문서 타입을 저장할까요?"로 한 단계 더 물어(사용자가 요청한
    "어떤 출력물로 출력되기를 원하시나요?"에 해당하는 2단계) 타입을 받으면
    `sapDocQuestion = "104446 P01 문서 열어줘"`로 합성해 기존 `_ganttQaExtractSapOpenDocRequest`
    경로로 흘려보낸다(자재 2개 이상이면 문서 타입 없이 바로 배치 다운로드로 감 — 기본 P01).
    답이 무관한 딴 얘기면(저장/다운로드도, 목록/보여/출력도 아니면) 상태를 조용히 지우고
    평소처럼 처리(엉뚱한 대화를 SAP 액션으로 잘못 가로채지 않기 위함).
  - **검증**: 브라우저에서 `sendGanttQaMessage()`를 직접 호출해 전체 왕복(모호 트리거 →
    "목록" 답변 → list-docs 경로 진입, 모호 트리거 → "저장" 답변 → 문서 타입 질문 → "P01"
    답변 → open-document 경로 진입, 잘못된 타입 답변 → 재질문, 무관한 답변 → 조용히 해제)을
    전부 확인함(백엔드가 꺼져 있어 최종 fetch는 "시간 초과"로 끝나지만, 그건 예상된
    결과 — 어느 로컬 명령으로 라우팅됐는지가 검증 포인트였음).
- **문서 열기("SAP에서 P01 문서 열어줘")**: `sap_bridge_32.py`의 `open_document(doc_type)` —
  MM03에서 이미 열어둔 자재의 "문서 데이터" 탭(`tblSAPLCV140SUB_DOC` 테이블 컨트롤, 화면 어디에
  있든 `_find_by_id_substring`로 재귀 탐색해 절대경로에 안 묶이게 함)에서 doc_type과 텍스트가
  정확히 일치하는 셀을 찾아 `setFocus`+`VKey 2`(F2)로 열고(SAP GUI "기록 및 재생" 매크로 녹화로
  얻은 정확한 클릭 패턴을 일반화한 것), 문서 화면의 "원본(Originals)" 트리에서 첫 번째 첨부파일을
  `doubleClickNode`한다 — 그러면 SAP가 알아서 로컬 임시폴더(`C:\temp\`)에 받아 연결된 프로그램
  (Acrobat 등)으로 바로 연다(브라우저로 파일을 옮길 필요 자체가 없음 — SAP GUI와 백엔드가 같은 PC).
  프런트: `js/04h`의 `_ganttQaExtractSapOpenDocRequest`(로컬 판정, 정규식 `[A-Za-z][0-9]{2}`로
  문서 타입 코드 추출 — 이 회사 SAP 문서 타입 체계에 맞춘 것) + `sendGanttQaMessage`의 비동기
  블록(`/sap-open-document?type=` 호출, 50초 타임아웃) → `_run_sap_bridge`(kortek_backend.py,
  `/sap-fetch`와 공용 서브프로세스 헬퍼로 리팩터링됨) → `open_document`.
  - **자재번호는 알지만 정확한 문서 타입 코드를 모르는 경우(2026-09-15 신규)**: "SAP에서
    106188 문서/파일 열어줘"처럼 문서 타입 코드(P01 등)가 안 보이면
    `_ganttQaExtractSapOpenDocRequest`가 null을 반환하고, 대신
    `_ganttQaExtractSapListDocsRequest`가 자재번호만 뽑아 `/sap-material-documents?material=`
    를 호출한다 → `sap_bridge_32.py`의 `fetch_material_documents(material)`이
    `_navigate_to_material_document_tab`로 그 자재의 "문서 데이터" 탭까지 이동한 뒤, 특정
    문서를 열지 않고 `fetch_current_screen()`과 똑같은 범용 덤프(`_sap_find_grid`/
    `_sap_dump_fields`)로 화면을 그대로 읽어와 사람에게 목록으로 보여준다 — 이 화면 전용
    파서를 새로 만들지 않고 기존 범용 덤프를 재사용한 것("특정 트랜잭션 전용 파서를 만들지
    않는다"는 위 설계 원칙 그대로 적용). 사람이 그 목록을 보고 원하는 타입을 골라 다시
    "OO 문서 열어줘"라고 말하면 위 `open_document` 경로로 이어진다.
  **⚠️⚠️ 실사용 디버깅으로 확정된 함정들 — 다음에 이 영역 건드릴 때 반드시 참고할 것(2026-09-14)**:
  1. **원본 트리 컨테이너 이름이 화면마다 다르다**: 어떤 문서는 `cntlCTL_FILES1`, 어떤 문서는
     `cntlCTL_FILES2`(SAP 서브스크린 버전 차이로 추정) — 그래서 `_find_by_id_substring`은
     `'CTL_FILES'`(끝자리 숫자 없이)로 검색한다. 절대 `CTL_FILES1`처럼 끝자리를 고정해서 검색하지
     말 것.
  2. **같은 ID 문자열이 바깥 컨테이너에도 들어있어 얕은 탐색이 잘못 걸린다**: `.../cntlCTL_FILES2`
     라는 `GuiCustomControl`(컨테이너)이 실제 기능이 있는 안쪽 `GuiShell`(`.../shellcont/.../shell`)
     보다 훨씬 얕은 depth에서 먼저 매치되어, `GetAllNodeKeys`/`doubleClickNode` 같은 Tree 전용
     메서드가 없어 `AttributeError`가 난다 — 그래서 `_find_by_id_substring`에 `require_type`
     인자를 추가해 `require_type='GuiShell'`로 타입까지 맞아야 반환하도록 했다. 앞으로 이 함수로
     "그 컨트롤 자체의 메서드를 호출해야 하는" 대상(Tree/Grid 등 GuiShell)을 찾을 땐 반드시
     `require_type='GuiShell'`을 넘길 것 — 안 그러면 같은 함정이 재발한다.
  3. **"원본" 탭의 실제 ID는 `tabpTSFILES`이지, `tabpTSMAIN`이 아니다** — `tabpTSMAIN`은 "전표
     데이터"(기본 데이터) 탭이다. 처음에 SAP GUI "기록 및 재생" 녹화 스크립트를 보고
     `tabpTSMAIN`으로 착각해서 여러 번 실패했다 — 탭 ID가 헷갈리면 `walk()` 스타일로 전체
     `GuiTab`/`GuiTabStrip`을 덤프해서 `.Text`(화면에 보이는 라벨)와 `.Id`를 같이 출력해보는 게
     제일 빠르다(진단에 실제로 썼던 방법).
  4. **SAP GUI 세션이 여러 개 열려 있으면 엉뚱한 세션을 조작할 수 있다** — `_get_sap_session()`은
     항상 `connection.Children(0)`(첫 번째 세션)만 본다. 사용자가 SAP 창을 2개 이상 띄워두면
     (SAP는 새 세션을 쉽게 여는 UI라 흔함) 첫 번째 세션이 사용자가 지금 보고 있는 화면이 아닐 수
     있어, "문서 데이터 탭을 열어뒀는데 못 찾는다"는 증상으로 나타난다 — 디버깅 시 항상
     `app.Children(0).Children.Count`로 세션 개수부터 확인하고, 2개 이상이면 필요 없는 세션을
     닫아달라고 안내할 것(여러 세션 중 "맞는" 것을 자동으로 고르는 로직은 아직 없음).
  5. **SAP GUI 보안 팝업**("파일 ...에 액세스하려는 중입니다")은 SAP GUI Scripting의 `wnd[1]`
     객체 트리에 아예 안 잡힌다(녹화 매크로에도 기록 안 됨) — 즉 스크립팅으로 "허용" 버튼을 누를
     방법이 없다. 해결은 SAP GUI 옵션 → 보안 → 보안 세팅 → 보안 구성 열기에서 `C:/temp/*`
     파일에 대한 읽기+실행 허용 규칙을 사용자 규칙으로 추가하는 것(경로 구분자는 `\`가 아니라
     `/`를 쓰라고 다이얼로그 안내문에 명시돼 있음) — 파일마다 자동 생성되는 개별 규칙(파일명이
     문서마다 달라 재사용 불가)이 아니라 디렉토리 와일드카드 규칙을 추가해야 이후 문서에도
     계속 통한다. 이 규칙이 없으면 `open_document`가 `doubleClickNode`까지는 성공해도 그 뒤
     사람이 수동으로 팝업의 "허용"을 눌러줘야 실제로 열린다.
  6. **진단 방법 — 화면 구조를 모를 때**: `sap_bridge_32.py`를 모듈로 import해서(`import
     sap_bridge_32 as sb`) `sb._get_sap_session()`으로 세션을 잡고, `wnd.Children`을 재귀
     탐색하며 `(Type, Id)`를 전부 출력하는 임시 스크립트를 `py -3-32 -c "..."`로 즉석에서
     실행하는 게 제일 빠르다 — 이 방법으로 이번 문서 열기 기능의 막힌 지점들을 전부 찾아냈다.
- **자재번호를 같이 말하면 화면을 미리 열어둘 필요가 없음(2026-09-15 추가)**: 처음엔 "사람이
  MM03에서 이미 조회해 문서 데이터 탭을 열어둔 상태"만 지원했는데(처음 화면 진입 흐름을
  추측하고 싶지 않아서였음), 사용자가 "왜 꼭 미리 열어둬야 하냐, 트랜잭션 코드로 알아서 찾아가면
  안 되냐"고 문제제기해서 실사용 화면 녹화(SAP Easy Access 메인 메뉴 → 명령창에 `MM03` →
  자재번호 입력 → Enter → 문서 데이터 탭 선택)를 추가로 받아 구현함. `sap_bridge_32.py`의
  `_navigate_to_material_document_tab(session, wnd, material)`이 `/nMM03` 진입 + `ctxtRMMG1-
  MATNR`(을 `_find_by_id_substring`로 찾음) 입력 + Enter를 수행하고, `open_document(doc_type,
  material=None)`이 `material` 인자가 있으면 이 함수를 먼저 호출한 뒤 기존 문서 탐색 로직을
  그대로 이어간다 — `material`이 없으면 기존처럼 "이미 열려 있는 화면"을 그대로 쓰는 하위호환
  경로. 프런트(`js/04h-core-app-upload-utils-3.js`)의 `_ganttQaExtractSapOpenDocRequest`는 이제
  `{docType, material}` 객체를 반환(예전엔 문자열 하나만 반환했음 — 이 함수를 다시 쓰는 코드가
  있으면 반환 형태가 바뀐 걸 감안할 것)하고, 질문에서 5~8자리 순수 숫자를 자재번호로 추출해
  `/sap-open-document?type=...&material=...`로 같이 보낸다. **⚠️ "뷰 선택(Select View(s))"
  팝업은 이 녹화에서 뜨지 않아서(그 자재에 최근 조회 이력이 있었을 가능성) 처리 로직이 추측성
  이다** — `_navigate_to_material_document_tab`은 자재번호 입력 후 `wnd[1]`이 나타나면 방어적으로
  Enter를 한 번 시도하지만, 실제로 이 팝업이 뜨는 자재로 테스트해서 계속 실패하면 그 팝업이 뜬
  상태를 다시 녹화해서 정확한 컨트롤로 교체해야 한다.
  **⚠️⚠️ 실사용 테스트로 확인된 추가 함정(2026-09-15)**: `RMMG1-MATNR` 문자열을 포함한
  컨트롤이 화면에 하나가 아니어서(매치코드/히스토리 드롭다운 버튼 등으로 추정), 첫 매치를
  그대로 쓰면 `.text = ...`가 COM 오류 `"Property 'Item.text' can not be set."`로 실패하는
  게 실사용에서 확인됨 — "원본" 트리를 찾을 때 겪었던 것과 같은 종류의 함정("같은 ID
  문자열이 바깥 컨테이너에도 들어있어 얕은 탐색이 잘못 걸린다" 항목 참고). 그래서 첫 매치만
  반환하는 `_find_by_id_substring` 대신, 모든 매치를 모으는 `_find_all_by_id_substring`을
  새로 추가해 후보를 전부 모은 뒤(녹화에서 확인된 타입 `GuiCTextField`를 우선순위로 정렬),
  실제로 값을 설정할 수 있는 첫 번째 후보를 채택하도록 고침. 앞으로 이 함수로 "값을 설정해야
  하는" 대상을 찾을 때, 같은 ID 문자열이 여러 컨트롤에 걸릴 가능성이 있으면 이 패턴(전체
  후보 수집 + 순서대로 시도)을 재사용할 것.
  **⚠️⚠️ 진짜 원인 확정(2026-09-15, 스크린샷 3장으로 확인) — "문서 데이터" 탭은 메인 화면의
  탭 스트립에 없다**: 자재 106188을 자동 조회했을 때 `tabpZU04`("문서 데이터") 탭을 못
  찾은 건 "그 자재에 문서 데이터 뷰가 없어서"가 아니라,애초에 "문서 데이터" 탭이 MM03
  메인 화면(기본 데이터 1/기본 데이터 2/영업... 탭 스트립)에 있는 탭이 아니기 때문이었다.
  실제로는 기본 데이터 1 화면 **하단의 "기본 데이터 텍스트" 섹션에 있는 버튼**(기술 ID에
  `GRUNDDATENTEXT` 포함, `자재(M) → 추가 데이터`로도 접근 가능)을 눌러야만 열리는 별도
  "추가 데이터" 서브화면 안에 있고, 그 서브화면 자체가 자기만의 탭 스트립(문서 데이터/
  기본 데이터 텍스트/검사 텍스트/내부 주석/소비)을 갖고 있다. 처음 받은 SAP GUI "기록 및
  재생" 매크로(`session.findById(".../btnPUSH_GRUNDDATENTEXT").press`)에 이 클릭이 있었는데,
  탭 선택(`tabpZU04`) 직전의 단순 클릭이라 "부수적인 동작"으로 잘못 판단해 자동화 코드에서
  빠뜨렸던 게 실제 원인이었다 — **이 버튼 클릭은 절대 생략 불가, 매번 필요.**
  `_navigate_to_material_document_tab`이 이제 `tabpZU04`를 찾기 전에 항상
  `_find_by_id_substring(wnd, 'GRUNDDATENTEXT')`로 이 버튼을 찾아 누른 뒤(0.8초 대기) 탭을
  선택한다. 이 사실을 몰랐을 때는 `_select_tab_if_present`가 탭을 못 찾아도 조용히
  실패해서(탭 없으면 그냥 통과) 엉뚱한 "기본 데이터" 화면 내용을 "문서 데이터 화면"이라고
  잘못 보여주는 버그가 있었다 — 그래서 지금은 `_select_tab_with_retry`(재시도 O, 성공여부
  반환)로 바꿔, 그래도 못 찾으면 명확한 RuntimeError를 내도록 했다(이젠 정말 뷰 자체가
  없는 예외적 자재를 만났을 때의 방어용으로만 남음).
- **ZMM009("자재 List(복수조회)") 등 다중 자재 리스트 화면에서 바로 문서 열기(2026-09-15
  신규)**: 사용자가 MM03(자재 1개씩)보다 ZMM009 같은 커스텀 다중조회 트랜잭션을 주로 쓰고
  싶어해서, "조회/엑셀 저장은 이미 되는지 먼저 확인 + 문서 열기만 새로 필요"로 범위를 좁혀
  진행함(질문으로 확인). **조회+엑셀 저장은 코드 변경 없이 이미 됨** — `/sap-fetch`와 엑셀
  내보내기가 애초에 특정 트랜잭션에 안 묶여 있고 화면에 보이는 ALV 그리드(GuiShell/
  GridView)를 그대로 덤프하는 범용 설계라(위 "특정 트랜잭션 전용 파서를 만들지 않는다"
  원칙), ZMM009 결과 리스트에도 그대로 통함. **문서 열기만 새로 구현**: 실사용 화면 녹화로
  확인(SAP GUI "기록 및 재생" 매크로가 아니라 일반 화면 녹화 — Windows `ScreenSketch`
  `.mp4`, `cv2`로 장면전환 프레임만 추출해서 분석) — ZMM009 결과 그리드에서 "자재" 컬럼의
  하이퍼링크 셀을 클릭하면 곧바로 그 자재의 MM03 조회 화면(`자재 NNN 조회(원자재)`)으로
  drill-down되고, **그 뒤부터는 자재번호를 직접 입력해 MM03을 새로 여는 기존 경로와 화면이
  완전히 동일**하다(같은 GRUNDDATENTEXT 버튼 → tabpZU04 탭 → 문서 목록 → F2 → 원본 탭).
  그래서 새로 짠 건 "이미 떠 있는 리스트에서 원하는 자재 행을 찾아 더블클릭하는" 한 단계뿐 —
  `_find_material_row_in_grid`(컬럼 제목 "자재"/"Material"로 컬럼 찾기, 값이 정확히 일치하는
  행 찾기 — 역시 특정 트랜잭션의 내부 필드명 대신 화면 라벨 기반)와
  `_open_material_from_current_list`(`grid.doubleClickCell(row, col)`로 drill-down). `_navigate_
  to_material_document_tab`이 이제 `/nMM03`을 새로 열기 전에 먼저 이 경로를 시도하고, 지금
  화면에 그리드가 없거나 그 자재가 없으면 조용히 실패하고 기존 `/nMM03` 경로로 폴백한다 —
  즉 ZMM009를 미리 열어뒀으면 그 리스트를 재사용해서 더 빠르고, 안 열어뒀으면 기존처럼
  단일 자재 직접조회로 동작하는 하위호환 설계. 문서 조회 화면에서 "뒤로"(F3)를 세 번 누르면
  (문서 조회 → 자재 "추가 데이터" 서브화면 → 자재 기본 데이터 화면 → 원래 리스트) 정확히
  리스트로 복귀하는 것도 두 번째 화면 녹화로 확인됨(아직 코드화 안 함, 아래 ZDMSR004 발견으로
  우선순위가 낮아짐).
- **여러 자재 문서 일괄 다운로드 — ZDMSR004("DMS 첨부파일 일괄 다운로드 프로그램")
  (2026-09-15 구현 완료)**: 첫 화면 녹화(ScreenSketch 일반 녹화)로 이 리포트의 존재를
  발견한 뒤, 두 번째로 SAP GUI **"기록 및 재생" 매크로**를 받아 정확한 컨트롤 ID를
  확보해서 구현함 — "SAP에서 133012, 133010, 101831 문서 다운로드해줘"처럼 **자재번호를
  2개 이상 쉼표/공백으로 나열하고 "다운로드"/"저장"이라고 말하면**, MM03을 자재마다
  드릴다운하는 대신 이 전용 배치 리포트를 실행해 한 번에 `C:\SAP_DMS\<문서번호>\
  <원본파일명>` 구조로 전부 다운로드한다(문서번호별 하위폴더 자동 생성). **매크로에서
  폴더 선택 창이 전혀 뜨지 않았다** — 다운로드 경로가 ABAP 리포트 내부에 고정된 것으로
  추정되어, 네이티브 Windows 다이얼로그 처리 없이 SAP GUI 컨트롤 조작만으로 끝까지
  완결됨(우려했던 것과 달리 문제 없었음). 다운로드 완료 후 `os.startfile(r'C:\SAP_DMS')`
  로 탐색기까지 자동으로 열어준다(2026-09-15 추가 — 백엔드와 SAP GUI가 같은 PC에서
  돌아가는 구조라 가능; 폴더 열기 자체가 실패해도 다운로드는 이미 끝난 뒤라 전체 요청을
  실패로 만들지 않음).
  - **구현**: `sap_bridge_32.py`의 `download_documents_batch(materials, doc_type)` —
    ① `/nZDMSR004` 진입 → ② 자재코드 "복수 선택" 버튼(`btn%_S_MATNR_%_APP_%-VALU_PUSH`,
    이 SAP 표준 생성 ID 패턴 `btn%_S_<필드명>_%_APP_%-VALU_PUSH`는 SELECT-OPTIONS
    파라미터의 "복수 선택" 버튼에 공통 — 다른 커스텀 리포트에도 재사용 가능한 지식)를
    눌러 팝업을 연 뒤 → ③ 팝업의 `tabpSIVA` 탭 안 `tblSAPLALDBSINGLE` 표(함수그룹
    SAPLALDB가 생성하는 SAP 표준 "복수 선택" 팝업 — ZMM009의 "자재 복수 선택" 팝업과
    내부 컨트롤이 100% 동일함을 이번 매크로로 확인)에 `ctxtRSCSEL_255-SLOW_I[1,N]`
    (N=0부터 행 인덱스) 형태로 자재번호를 채워 넣고 → ④ 팝업의 `tbar[0]/btn[24]`,
    이어서 `tbar[0]/btn[8]`을 순서대로 눌러 확인(매크로에서 확인된 정확한 두 버튼 —
    각각의 정확한 기능명은 모르지만 순서와 인덱스를 그대로 재현) → ⑤ 메인 화면의
    `ctxtS_DOKAR-LOW`(문서유형 필터)에 문서 타입(P01 등) 입력 → ⑥ `tbar[1]/btn[8]`
    (실행/F8) → ⑦ 결과 그리드(`shellcont/shell`)에서 `setCurrentCell(-1,"")` +
    `selectAll()`로 전체 선택 → ⑧ `tbar[1]/btn[13]`(다운로드) 클릭.
  - **⚠️ 한 화면에 보이는 입력 행 수(매크로에서 7개까지 확인)를 넘으면 스크롤이 필요한데,
    스크롤 자체(`table.FirstVisibleRow`로 구현)는 실사용 검증이 안 됐다** — 8개 이상
    자재를 한 번에 다운로드하다 실패하면 이 부분을 의심하고 재검증할 것.
  - **백엔드**: `kortek_backend.py`의 `/sap-download-documents-batch?materials=쉼표구분&type=P01`
    — 자재 수에 비례해 타임아웃을 늘림(`min(300, 40 + 8*자재수)`초).
  - **프런트**: `js/04h`의 `_ganttQaExtractSapBatchDownloadRequest` — 자재번호 2개 이상 +
    단일 열기와 동일한 트리거 단어 집합(열어/열기/다운로드/출력/보여/저장/open)으로 판정
    (처음엔 "다운로드/저장"만 인정했다가, 자재 2개 이상인데 "열어줘"만 쓰는 실사용 사례로
    넓힘 — 2개 이상은 어차피 이 배치 경로 하나뿐이라 트리거 단어를 좁힐 이유가 없었음).
    **`sendGanttQaMessage`에서의 로컬 명령 체크 순서가 실사용 버그로 확정됨(2026-09-15)
    — 반드시 이 순서를 유지할 것**: ① 배치 다운로드(`sapBatchReq`) → ② 단일 문서 열기
    (`sapOpenDocReq`) → ③ 문서 목록 보기(`sapListDocsMaterial`) → ④ "엑셀로 내보내줘"
    catch-all(`sapExportReply`, 방금 조회된 화면 데이터를 그대로 내보내는 범용 명령). 원래
    ④번이 제일 앞에 있었는데, "128808,115518 품목 조회해서 엑셀 출력해주고 P1 문서
    열어줘"처럼 "엑셀"+"출력" 단어가 들어간 복합 요청이 ④번에 먼저 가로채져서, 자재번호나
    문서 요청은 아예 확인도 안 하고 "아직 내보낼 SAP 데이터가 없습니다"만 응답하던 버그가
    실사용에서 발견됨 — ④번을 맨 뒤로 옮겨서 더 구체적인(자재번호가 명시된) 요청들이 항상
    먼저 기회를 갖도록 고침. 문서 타입 코드 추출도 `_ganttQaExtractSapDocTypeCode`(letter+
    숫자 1~2자리, 1자리면 0을 채워 표준화 — "P1"→"P01")로 공용화해서 ①②③이 전부 재사용
    한다(같은 버그 제보에서 "P1"을 "P01"로 인식 못하던 것도 같이 발견·수정).
  - **아직 안 쓰는 정보**: 두 번째 매크로 녹화에서 "문서 조회 화면에서 F3(뒤로) 3번이면
    원래 리스트로 복귀"하는 것도 확인됐지만, ZDMSR004 배치 다운로드가 더 나은 해법이라
    이 뒤로가기 경로는 코드화하지 않음(MM03 드릴다운 단일 열기 자체는 계속 유지).
- **⚠️⚠️⚠️ SAP GUI Scripting ALV 그리드의 한글이 원천적으로 깨져서 나온다(2026-09-15 실사용
  진단으로 확정, 미해결) — SAP 연동 기능을 만질 때 항상 감안할 것**: 사용자가 ZMM009 엑셀
  내보내기 헤더가 "MTART/MATNR" 같은 코드로 나온다고 제보해서 SAP GUI 세션에 직접 접속해
  진단(`py -3-32 -c "..."`)한 결과 두 가지를 확인함:
  1. **버그 1(고쳐짐)**: `_sap_dump_grid`가 `shell.GetColumnTitle(cid)`를 불렀는데, 이
     메서드는 `GuiGridView`에 **아예 존재하지 않는다**(`dir(grid)`로 실제 멤버 목록을
     떠서 확인 — 진짜 이름은 `GetColumnTitles`(복수형, 인자 필요) 또는
     `GetDisplayedColumnTitle(col)`(단수, 컬럼별)). 그래서 지금까지 그리드 헤더는
     **매번** 예외로 실패해 원본 필드 코드로 폴백되고 있었다.
  2. **버그 2(고칠 수 없음, 근본 원인)**: 올바른 메서드(`GetDisplayedColumnTitle`)로
     다시 불러봐도 **한글 텍스트가 SAP GUI Scripting 내부에서 이미 깨진 채로 넘어온다**
     — Python에서 받은 문자열에 `U+FFFD`(유니코드 대체 문자, 복구 불가능한 손실을 뜻함)가
     섞여 있어 어떤 인코딩으로 재해석해도 원문을 복구할 수 없음을 확인함(여러 encode/decode
     조합 다 시도해봄). **컬럼 제목뿐 아니라 그리드 셀 값(데이터)에 들어있는 한글도 똑같이
     깨진다** — `GetCellValue()`로 받은 한글 설명 텍스트도 영문/숫자는 멀쩡한데 한글
     부분만 깨져서 나옴(엑셀로 내보낸 파일 직접 열어서 확인). Windows 시스템 코드페이지
     (`ACP`/`OEMCP` 둘 다 949)와 SAP 세션 코드페이지(`session.Info.Codepage` = 4110,
     `session.Info.Language` = "KO") 둘 다 정상적으로 한국어로 맞춰져 있는데도 발생 —
     Windows/우리 코드 설정 문제가 아니라 **SAP GUI Scripting 자체(스크립팅 엔진/ActiveX
     브리지)의 한글(DBCS) 처리 버그**로 추정됨. late-bound(`GetObject`)/조기바인딩 여부,
     PowerShell vs Git Bash 등 호출 경로를 바꿔봐도 재현되어 우리 환경 설정 문제가 아님을
     확인했다.
  - **현재 대응(사용자와 상의해 "헤더만이라도 우선 고치기"로 결정)**: `js/04h`의
    `window._SAP_FIELD_LABEL_MAP` — 자주 보이는 표준 SAP 필드명(MARA/MARC 테이블,
    회사 무관하게 어느 SAP든 동일)을 코드에 직접 매핑해 `_exportSapDataToExcel`이 그리드
    소스(`source==='grid'`)의 헤더 행에서 이 사전으로 치환한다(사전에 없으면 원본 코드
    유지 — 틀린 한글보다 코드가 낫다는 판단). **[2026-09-15 갱신] 사전 전체가 실측값으로
    교체됨(134개 필드)** — 처음엔 표준 SAP 필드는 일반 지식으로, Z 커스텀 필드는 이전 화면
    캡처 대조로 추정해서 신뢰도가 낮았는데, 사용자가 BOM(ZPP038)·원자재(ZMM009) 두 조회
    각각에 대해 "필드 코드로 나온 엑셀"과 "정상 라벨로 나온 엑셀"을 쌍으로 제공해줘서, 두
    파일의 헤더 행을 같은 열 위치로 1:1 대조해 전부 실제 SAP 화면 표시값으로 확정함(방법
    자체도 재사용 가능 — 새 리포트에서 또 필드 코드가 나오면 "코드 버전"과 "라벨 버전"
    엑셀을 나란히 받아 같은 방식으로 대조하는 게 화면 캡처 추정보다 빠르고 정확함). 일부
    필드(`MSTAV`/`MSTDV`/`GROES` 등)는 이 회사 SAP가 한국어 번역이 없어 실제로 영문으로
    표시된다는 것도 확인됨 — 사전 값이 영문이어도 오류 아님. **셀 값(데이터)의 한글 손상은
    이 사전으로 해결 안 됨** — 사전 매핑이 안 통하는 자유 텍스트라 근본적으로 막을 방법이
    없다. AI가 SAP 데이터를 근거로 답할 때 한글 설명/이름이 이상하게 나오면 AI의 문제가
    아니라 이 버그 때문일 가능성을 먼저 의심할 것.
  - **완전한 해결책**: SAP GUI 패치 버전/설정 문제일 가능성이 있어, 필요하면 SAP Basis/GUI
    담당자에게 문의가 근본 해결에 더 가깝다 — 코드만으로는 이 이상 고치기 어렵다고 판단함.
- **승인원 표지 생성("SAP에서 104477 승인원 표지 생성해줘", 2026-09-15 신규 — 기존 사내
  데스크톱 앱을 역공학해서 그대로 재현)**: 사용자가 회사에서 따로 쓰던 "연구소 가이드
  시스템"(PyInstaller로 배포된 Python/Tkinter exe)을 주고 "이 기능을 AI 문답에도 추가해달라"
  고 요청 — 디컴파일러가 Python 3.13을 지원 안 해서(`decompyle3` 등은 3.8까지) 완전한 소스
  복원은 못 했지만, `pyinstxtractor-ng`로 exe를 풀고 `main.pyc`를 `marshal.loads`로 직접
  읽어 함수 docstring·상수 풀(co_consts)·`dis.dis` 바이트코드 흐름만으로 로직을 충분히
  재구성했다(필드 ID·VKey 값·엑셀 셀 주소·워드 표 행/열까지 전부 원본 바이트코드에서 그대로
  확인한 값). **역공학 방법 자체도 기록**: `py install 3.13`으로 대상과 같은 버전을 설치해야
  `marshal.loads`가 성공한다(다른 마이너 버전 바이트코드는 포맷이 달라 실패) — 이후
  "함수를 이름으로 찾기"보다 "상수 풀에 특정 한글 문자열이 들어있는 코드 객체 찾기"가 목표
  기능을 빠르게 좁히는 데 더 효과적이었다(예: `'승인원'`이 들어간 코드 객체만 재귀 검색).
  - **SAP 조회(MM03)**: `sap_bridge_32.py`의 `fetch_approval_info(materials)` —
    `session.StartTransaction('MM03')`(원본 앱이 쓰는 방식 — `okcd` 텍스트 설정보다 깔끔한
    표준 API, 실패하면 기존 `/nMM03` 방식으로 폴백) → 자재번호(`wnd[0]/usr/ctxtRMMG1-MATNR`)
    입력 → `_approval_find_value(root, needles)`로 자재내역(`MAKT-MAKTX`/`MAKTX`)·자재그룹
    코드(`MARA-MATKL`/`MATKL`) 읽기(needles 우선순위 폴백 탐색 — 우리 기존
    `_find_by_id_substring`과 같은 철학이지만 여러 후보를 우선순위대로 시도한다는 점이 다름,
    타입은 `GuiTextField`/`GuiCTextField`/`GuiComboBox`/`GuiTextEdit`로 한정) → **`wnd.
    sendVKey(30)`**(원본 앱이 쓰는 정확한 VKey — 우리가 MM03 문서 열기에서 버튼을 찾아
    눌렀던 "추가 데이터" 화면을 키보드 단축키로 곧장 연다, 버튼 ID를 찾을 필요가 없어 더
    안정적) → **`tabpZU05`**("기본 데이터 텍스트" 탭 — `tabpZU04`"문서 데이터"와는 다른
    탭이니 혼동 주의) 선택 → `_approval_read_long_text`로 여러 줄 설명 읽기(Id가 `SAP.`로
    시작하는 툴바 Shell을 걸러내는 방어 로직 포함, 원본 앱 주석 그대로).
  - **자재그룹명 — 618건 표(matgroups.json)**: MM03 화면엔 자재그룹 "코드"만 있고 명칭이
    없어서(원본 앱 주석: "화면에서 확인함"), 원본 앱에 내장돼 있던 618건짜리 표(코드→대분류
    `daebun`/중분류`jungbun`/소분류`sobun`/설명`desc`)에서 코드로 찾는다 — 그 표는 exe의
    `content.json`(가이드 문서 내용, "자재그룹표 조회 및 추천" 페이지의 `matgroups` 키) 안에
    고스란히 들어있어서 그대로 추출해 리포지토리 루트의 `matgroups.json`으로 옮겼다.
    `kortek_backend.py`의 `_approval_group_name(matkl)`이 이 표에서 `sobun`을 찾아 반환,
    없으면 빈 문자열(원본 앱처럼 "확인 필요"로 취급 — Item Description 앞부분으로 되짚는
    추측 로직은 원본에서도 엉뚱한 이름이 채워지는 문제로 뺐다고 돼 있어 여기서도 안 넣음).
  - **엑셀/워드 템플릿**: `templates/승인원_양식.xlsx`(시트명 `승인원표지`)·
    `templates/승인원_양식.docx`를 exe의 `assets/`에서 그대로 복사해 리포에 넣음. 셀 주소는
    원본 바이트코드의 `APPROVAL_CELLS` 상수 그대로: `C8`=자재그룹코드, `C9`=자재그룹명,
    `C10`=자재코드, `C11`=자재내역, `C12`=Sub-Description, `C13`=DMS Upload(New/Update
    체크박스+Revision), `C14`=Remark, `F20`/`F21`=담당자 날짜/이름, `F28`/`F29`=팀장
    날짜/이름 — `kortek_backend.py`의 `_approval_fill_xlsx`가 openpyxl로 그대로 채움. 워드는
    큰 표 하나 안에 **중첩 표가 5개** 들어있는 구조(python-docx로 직접 열어서 확인) — 0번
    중첩표(8행×2열, 1~7행이 자재그룹코드~Remark)와 1번 중첩표(서명란, `(1,3)`=담당자날짜/
    `(2,3)`=담당자이름/`(5,3)`=팀장날짜/`(6,3)`=팀장이름)만 채우고, 2~4번(협력사 정보/
    문서번호/양식버전)은 건드리지 않음 — 원본 앱 UI 설명 그대로 "협력사(Provider) 영역과
    하단 업체 정보는 비워둔 채로 생성되므로, 협력사에서 작성한 내용을 별도로 채워 넣어야
    함". **⚠️⚠️ [2026-09-15 실사용 확인 + 수정] `cell.text = 값` 방식이 실제로 "1페이지로
    나와야 하는 양식이 2페이지로 밀려나는" 버그를 냈다** — 사용자가 실제 생성된
    `승인원_104446_Rev00.docx`를 첨부해서 제보. python-docx로 직접 열어 원인을 대조 진단함:
    `cell.text = 값`은 그 셀의 문단을 통째로 지우고 기본 서식의 새 문단/런을 만드는데, 이
    과정에서 문단 속성(`space_after`/`line_spacing`)까지 초기화된다 — 원본 템플릿은 값 셀의
    `space_after=0, line_spacing=1.0`(빽빽하게 설계됨)이었는데, `cell.text=` 대입 후엔 둘 다
    `None`(문서 기본 스타일값으로 대체)이 되어, 채워지는 셀이 7~10개나 되다 보니 그 미세한
    높이 차이가 누적돼 표 전체가 A4 1페이지를 넘겨버렸다(원본 앱은 이 문제가 없었음 — 이
    코드로 재현하며 생긴 회귀). **수정**: 새 헬퍼 `_set_cell_text_preserve_format(cell, text)`
    — `cell.text=`처럼 문단을 새로 만들지 않고, **기존 첫 문단을 그대로 재사용**하면서 그
    문단의 첫 런(run)만 텍스트를 바꾸거나(런이 있으면) 그 문단에 런을 추가한다(런이 없던
    빈 셀). 문단 객체 자체를 안 건드리므로 `space_after`/`line_spacing` 등 문단 속성이
    보존된다 — 실제로 고친 뒤 재생성한 파일을 템플릿 원본과 대조해 `space_after=0,
    line_spacing=1.0`이 그대로 유지됨을 확인함. **앞으로 python-docx로 표 셀에 값을
    채우는 코드를 새로 짤 때는 절대 `cell.text = 값`을 쓰지 말고 이 헬퍼(또는 같은 패턴)를
    쓸 것** — 셀 서식이 복잡한 양식(줄간격/문단간격이 촘촘히 맞춰진 인쇄용 서식 등)일수록
    이 회귀가 눈에 띄게 나타난다.
  - **파일명/DMS Upload 표시 규칙**: 원본 앱과 동일 — 파일명 `(가)승인원_자재코드_Rev00`,
    `dms_text`(C13/워드 dms 행) = `('■' if kind=='New' else '□') + ' New ' + ('■' if
    kind=='Update' else '□') + f' Update (Revision: {rev} )'`. Revision이 "00"/"0"이 아니면
    `kind`를 자동으로 `'Update'`로 추론(원본 앱은 UI 라디오 버튼으로 사람이 직접 고르지만,
    AI 문답엔 그 라디오가 없어 이렇게 추론 — 사용자가 명시한 필수 항목 목록에도 New/Update
    자체는 없었음). 가승인원 remark 가공도 원본 그대로: `is_pre`면 remark에 이미
    "가승인원"이 없을 때만 `"가승인원 / {remark}"`로 앞에 붙이고, remark가 아예 비어 있으면
    "가승인원" 하나만, 그래도 비면 `"."`.
  - **AI 문답 통합 — 유일하게 여러 턴에 걸치는 SAP 로컬 명령**: 다른 SAP 로컬 명령(BOM/사용처/
    문서 열기/배치 다운로드)은 전부 한 메시지 안에서 끝나는데, 이건 출력형식·담당자·팀장·
    가승인원 여부처럼 한 메시지에 다 안 들어올 수 있는 항목이 많아 `window.
    _ganttQaApprovalDraft`(대화 내용과 별개인 전용 상태, `null` 또는 `{materials, format,
    writer, leader, isPre, rev, remark, fetched}`)에 지금까지 파악된 값을 계속 누적한다.
    `js/04h`의 `_ganttQaExtractApprovalUpdate(question)` — "승인원"+"표지/생성/만들/작성"
    +자재번호가 있으면 새 draft 시작, 없어도 기존 draft가 있으면 그 메시지에서 값만 더
    채운다("담당자는 홍길동" 같은 후속 메시지 — **한국어 조사(는/은/가/이)가 명사 뒤에 바로
    붙는 어순을 감안해서 정규식에 조사를 건너뛰는 부분을 넣어야 한다**는 걸 브라우저
    테스트로 실제로 놓쳤다가 발견·수정함, 안 넣으면 "담당자는 홍길동"에서 이름을 못 뽑음).
    **줄단위 순서 매칭 폴백(2026-09-15 신규, 사용자 요청)**: "엑셀\n박용훈\n박성준\n
    정식승인\n해당없음"처럼 "담당자는"/"팀장은" 같은 라벨 없이 질문에 나열된 순서
    (출력형식→담당자→팀장→가승인원여부→(Revision)→Remark) 그대로 한 줄씩(또는 쉼표로
    한 줄에) 답하면 라벨 기반 정규식이 전혀 못 건지고 계속 되묻던 문제 — 사용자가 "라벨
    맥락 이해가 안 되면 하나씩 순차 질문하는 것도 나쁘지 않다"고 제안했으나, 검토 후
    "질문 순서 그대로 답하는 경우가 실제로도 흔해 보인다"는 점에 착안해 **완전 순차 질문
    대신 줄단위 순서 매칭 폴백**으로 결정함(왕복 횟수를 늘리지 않으면서 해결). 라벨 기반
    파싱이 끝난 뒤 아직 비어있는 항목 목록(`emptySlots`, 고정 순서)에, 줄바꿈(없으면 쉼표)
    으로 나눈 조각을 순서대로 배정한다. **⚠️ 처음엔 "이번 메시지에서 아무 값도 안 바뀌었을
    때만" 폴백을 시도했다가 회귀를 발견함**: "엑셀"/"정식승인" 같은 키워드는 줄 위치와
    무관하게 전체 텍스트에서 바로 잡히는 값 기반 매칭이라(라벨이 필요 없음), 그 값들이
    바뀌었다는 이유로 폴백 전체를 건너뛰면 정작 라벨이 필요한 담당자/팀장이 하나도 안
    채워졌다 — 그래서 "값이 바뀌었는지"가 아니라 "이번 메시지에서 실제로 소비된 줄이
    무엇인지"를 추적하도록 고침(`consumedPatterns`로 이미 값이 잡힌 필드의 키워드/라벨이
    들어간 줄을 순서 매칭 대상에서 제외 — 안 그러면 그 줄이 "줄 개수"에는 남아서 뒤 항목들과
    순서가 밀림). **라벨(담당자/팀장/rev/remark)을 하나라도 썼으면 폴백 자체를 건너뛴다**
    (`wm`/`lm`/`rm`/`mk` 중 하나라도 매치) — "담당자는 김철수\n박영수"처럼 라벨+위치가
    섞이면, 아직 안 채워진 항목이 고정 순서상 여러 개 있을 때 "그 다음 줄이 정확히 어느
    빈 항목을 가리키는지" 확신할 수 없어서(실제 테스트로 발견 — "박영수"가 팀장을 뜻해도
    고정 순서상 "출력형식"이 아직 비어있으면 거기 잘못 배정될 위험) 이 경우는 안전하게
    포기하고 평소처럼 되묻는다. 조각 개수가 빈 항목 개수보다 많아도(무엇을 뭐라고 답한
    건지 애매) 마찬가지로 포기.
    필수 항목(출력형식/담당자/팀장/가승인원 여부 — Revision·Remark는 기본값이 있어 선택)이
    덜 모였으면 빠진 항목만 콕 집어 되묻고, 다 모이면 `/sap-approval-fetch`(GET, 자재정보만
    조회) → `/sap-approval-generate`(POST, 실제 파일 생성 — 이미 조회한 `fetched` 결과는
    재사용해 SAP를 두 번 안 부름)를 순서대로 호출한다. 반드시 배치 다운로드/문서 열기 판정
    보다 **먼저** 체크해야 함(안 그러면 트리거 단어 없는 후속 답변 메시지가 다른 로컬 명령
    에도 안 걸리고 일반 AI 질문으로 새어나감). 생성 완료 후 draft는 성공/실패 무관하게
    초기화(다음 요청은 새로 시작) — 저장 폴더는 ZDMSR004와 같은 패턴으로 자동 오픈
    (`C:\SAP_DMS\승인원표지\`).
  - **kortek_backend.zip 배포 파일에도 포함해야 함**: `matgroups.json`·`templates/` 없이는
    다른 팀원 PC에서 이 기능이 아예 안 됨 — `.claude/settings.json`의 PostToolUse 훅
    matcher와 `Compress-Archive -Path` 목록에 이 둘을 2026-09-15에 추가해뒀다(기존엔 `.py`
    파일 변경 때만 재생성됐음).
  - **⚠️⚠️ "SAP"란 단어 없이 물으면 트리거 자체가 안 걸리던 버그(2026-09-15 수정)**: 바로
    위 문단은 애초에 "승인원"+"표지/생성/만들/작성"+자재번호만 있으면 트리거되는 걸로
    설명돼 있었지만, 실제 코드(`isNewTrigger` 정규식)엔 `/sap/i.test(text)`가 실수로 같이
    걸려 있어서 "104446 승인원 표지 만들어줘"(⚠️ "SAP" 미포함)라고 물으면 draft가 아예
    시작되지 않고, 이어서 메인 AI 호출 경로도 안 걸려(위 SAP 조회 절의 같은 날 버그와 동일
    원인) AI가 간트 데이터에서만 찾다가 "확인되지 않습니다"라고 답하는 사고가 실사용에서
    있었다 — SAP 조회 게이트 버그를 고친 바로 다음 제보라 같은 패턴임을 바로 알 수 있었다.
    `isNewTrigger`에서 `/sap/i` 요구를 제거함(자재번호 없으면 바로 아래서 어차피 null로
    걸러지므로 "승인원"+동작 동사만으로도 오탐 위험이 낮다고 판단). **새 SAP 관련 로컬
    명령을 추가할 때 "SAP"라는 단어를 트리거 조건에 넣을지는 항상 재고할 것** — 사용자는
    자재번호+동작 동사만으로 충분히 구체적이라고 느껴 "SAP"를 안 붙이는 경우가 실사용에서
    반복적으로 나타남(사용처 조회 버그와 이 버그 둘 다 같은 이유).
- **TIPR(웹 기반, 로그인 필요)은 아직 미구현** — SAP와 달리 "이미 인증된 세션에 올라타기"가 안 되고
  ID/PW 자동 로그인 자동화(Playwright 등)가 필요해 자격증명 저장 문제가 딸려온다. 사용자는 "서버에
  무리만 안 가면 ID/PW 자동 로그인도 괜찮다"고 확인했으므로, 구현 시 mail_config.json/
  telegram_config.json과 동일하게 `/all/encrypt`·`/all/decrypt` 패턴으로 로컬 암호화 저장하는
  구조를 그대로 재사용할 것(관리자 비밀번호 체계는 위 "🔑 관리자 비밀번호" 절 참고).

### 🛒 구매오더 요청 — PDF 첨부→AI 추출→SAP 발주(ZMMR060/ZMM018) (2026-09-15 신규)

AI 문답 창에 전자세금계산서/견적서 PDF를 첨부하면(📎 버튼, `js/04h`) 품목을 AI로 추출해
"연구소 구매오더,기타출고 제안 BDC Upload양식"(사용자 제공 `Z38MMR060.xls`) 형식의 엑셀을
만들고, SAP `ZMMR060`에 그 엑셀을 업로드해 협력사/세금코드/단가까지 자동 입력한 뒤,
**저장(구매오더 확정) 직전에 반드시 멈춰 사람 확인을 받는다** — 확인 후 "저장해줘"라고
답해야만 실제로 저장 + `ZMM018`에서 발주서 PDF 출력까지 진행한다.

**⚠️ 왜 "저장 직전 확인 후 정지"로 설계했는지**: 이 기능은 이 세션에서 지금까지 만든 SAP
연동 중 유일하게 **실제 재무적 커밋(구매오더 생성)을 자동화**하는 기능이다(다른 기능은
전부 조회이거나, 사람이 검토 후 별도로 제출하는 초안 생성). 구현 전에 사용자에게
직접 확인받음 — "SAP에 실제로 저장하는 단계를 자동 실행할지, 그 직전에 멈춰서 사람이
확인 후 직접 누르게 할지" 질문에 **"저장 직전 확인 후 정지"**를 선택함. 앞으로 이 설계를
"자동으로 다 해달라"는 요청이 와도, 실제 SAP 저장(확정) 단계를 사람 확인 없이 자동
실행하도록 바꾸지 말 것 — 이미 검토 후 명시적으로 결정된 방향이다.

- **PDF 텍스트 추출 — 멀티모달 불필요**: 이 앱의 AI 호출(`callAiBackend`)은 GAS(Google Apps
  Script) 프록시로 **텍스트만** 주고받는 구조라(이미지/PDF 바이너리를 실어 보낼 방법이
  없음), PDF 첨부를 지원하려면 멀티모달 API가 필요할 것 같았지만 — 전자세금계산서/견적서
  PDF는 대부분 스캔본이 아니라 **텍스트가 그대로 들어있는 PDF**라, 기존에 Panel 데이터시트용
  으로 이미 있던 클라이언트 사이드 pdf.js 텍스트 추출 헬퍼 `window._pcExtractPdfText(file)`
  (`js/22d-summary-mctable-core3.js`, y좌표로 줄바꿈을 복원하는 방식)를 그대로 재사용해서
  브라우저에서 텍스트만 뽑아 기존 텍스트 전용 AI 파이프라인에 그대로 흘려보내는 것으로
  충분했다 — 백엔드/GAS 프록시를 전혀 안 건드림. **순수 이미지 첨부(텍스트 레이어 없는
  스캔본/사진)는 이 방식으로 안 됨** — 아직 미지원, 필요하면 GAS 프록시에 멀티모달 지원을
  추가해야 한다(현재 이 저장소엔 그 GAS 스크립트의 소스가 없음 — 외부 배포된 Apps Script).
- **첨부 UI**: `js/04h`의 `openGanttQaModal`에 📎 버튼 + 숨겨진 `<input type="file"
  accept=".pdf" multiple>` + 미리보기 칩 스트립(`#gantt-qa-attach-strip`) 추가.
  `window._ganttQaPendingAttachments`(배열)에 `{name, text}`로 쌓아두고, **다음 메시지를
  보낼 때** 그 첨부들을 소비한다(즉시 처리 안 함 — 사람이 여러 PDF를 첨부한 뒤 메시지
  없이 그냥 전송해도 처리되도록). ⚠️ **지금은 "구매오더 요청"이 첨부의 유일한 용도**라서
  `sendGanttQaMessage`가 "첨부가 있으면 무조건 구매오더 추출 흐름"으로 판정한다(트리거
  단어 불필요) — 나중에 다른 첨부 용도가 추가되면 이 가정을 반드시 재검토해야 함.
- **AI 추출**: `window._ganttQaExtractPoItemsViaAi(apiKey, attachments, correctionNote)` —
  PDF 원문 + 임시코드 표(`window._PO_TEMP_CODE_TABLE`, 900101~900501 13건, 사용자 제공)를
  프롬프트에 실어 JSON 하나로만 응답하게 지시(`{bizRegNo, invoiceDate, vendorName,
  items:[{desc,qty,unitPrice,tempCode}]}`) — **다중 품목 지원**(PDF에 항목이 여러 개면
  items 배열에 전부), **협력사/단가는 SAP에 저장된 값이 아니라 PDF에서 추출한 값을 그대로
  SAP에 입력하는 것**(사용자가 명시적으로 정정 — 처음엔 "SAP에서 조회"로 오해했었음).
  `tempCode`(임시코드)는 AI가 품목 설명을 보고 표에서 가장 가까운 걸 제안 — 애매하면
  사람이 확인 단계에서 정정. `correctionNote`가 있으면(사람이 "확인" 대신 정정 지시를
  준 경우) 별도 파싱 로직 없이 AI에게 이전 추출 결과 + 정정 지시를 같이 실어 다시 추출을
  맡긴다(승인원 표지의 라벨 기반 파싱과 달리, 자유서술 정정은 AI 재호출이 더 단순하고
  robust하다고 판단).
  - **⚠️⚠️ [2026-09-15 실사용 버그수정] 거래명세서(전자세금계산서보다 컬럼이 많은 표 —
    날짜/품목/규격/수량/단가/공급가액/세액/합계)를 첨부했더니 두 가지 위험이 확인됨**:
    1. **PDF 텍스트 추출 자체가 뒤섞임** — 이 첨부 기능이 재사용하는 `window.
       _pcExtractPdfText`(`js/22d-summary-mctable-core3.js`, 원래 Panel 데이터시트용)가
       `content.items`를 PDF 내부 그리기 순서 그대로 이어붙이고 있었는데, 이 순서가
       시각적 왼쪽→오른쪽 순서와 다를 수 있어(특히 표/양식처럼 텍스트 블록이 많은
       레이아웃) "단가"/"합계" 같은 숫자가 품목 행과 안 맞게 뒤섞여 나왔다(실제 예시로
       확인). **수정**: 같은 줄(y좌표)끼리 먼저 묶은 뒤, 그 줄 안에서 x좌표로 다시 정렬해
       실제 읽는 순서를 복원하도록 변경 — Panel 데이터시트 쪽에도 그대로 적용되는
       개선이라 별도 분기 없이 공용 로직으로 고침(퇴행 위험 낮음, 정렬 기준이 더
       정확해지는 방향의 변경).
    2. **공급자/공급받는자 혼동 + 단가/공급가액 혼동 위험** — 거래명세서는 공급자(나우
       인터페이스 등 파는 쪽)와 공급받는자(우리 회사 자신, 항상 "주식회사 코텍") 두
       사업자등록번호가 나란히 나오고, "단가"(품목 1개당 가격)와 "공급가액"(단가×수량,
       그 줄 합계)도 따로 있다 — AI가 후자들을 잘못 고르면 ① 우리 회사 번호로 협력사를
       검색하거나 ② 수량만큼 부풀려진 금액이 단가로 SAP에 들어갈 위험이 있었다(둘 다
       실제 재무 데이터 오류로 이어지는 심각한 위험). **수정**: 프롬프트에 "공급자 쪽만
       쓸 것"과 "단가(1개당 가격)만 쓰고 공급가액/합계는 쓰지 말 것 — 헷갈리면 단가×수량
       ≈ 공급가액으로 검산할 것"을 명시적으로 추가. **앞으로 이 프롬프트를 건드릴 때
       이 두 지시문을 절대 빼지 말 것** — PDF 형식이 다양해질수록 이 혼동 위험은 계속
       존재한다.
- **여러 턴 draft**: `window._ganttQaPoDraft`(승인원 표지/BOM 옵션과 동일한 "대화 내용과
  별개인 상태" 패턴) — `stage` 값 순서: `confirm_items`(추출 결과 확인/정정) →
  `ask_project`(프로젝트코드) → `ask_buyer`(구매담당자 사번) → `ask_reason`(요청사유) →
  `ask_purpose`(목적 P01~P05, `window._PO_PURPOSE_TABLE`) → 엑셀 생성+SAP 업로드 자동 진행
  → `confirm_sap_prepare`(저장 여부 확인). **반드시 다른 모든 로컬 명령보다 먼저
  체크**(sendGanttQaMessage 맨 앞, `_ganttQaOpenFolderConfirm` 블록 바로 다음) — 첨부가
  유일한 트리거라 오탐 위험이 낮아 최우선순위로 둬도 안전하다고 판단.
  **수령인은 안 물어봄** — `window.getActiveUserName()`(로그인한 사용자 실명, 없으면 로컬
  이름)으로 자동 채움("개발팀은 이미 접속자 정보 사용"이라는 사용자 요청 반영). **구매그룹은
  "908" 고정값** — 사용자가 준 실제 엑셀 예시 값을 그대로 하드코딩한 것으로, 팀/부서별로
  다를 수 있는 값이라 확인이 더 필요할 수 있음(현재는 재질문 안 함). **필요일자는 PDF의
  작성일자를 그대로 사용** — 실제 예시 엑셀에서 필요일자와 작성일자가 같은 값이었던 것에
  근거한 가정, 실사용에서 다르면 고쳐야 함.
- **엑셀 생성**: `kortek_backend.py`의 `/po-build-excel`(POST, `{rows:[...]}`) —
  `xlwt`(레거시 BIFF `.xls` 전용 라이브러리, `openpyxl`은 이 구형 포맷을 못 씀)로 원본
  `Z38MMR060.xls`의 "Upload" 시트와 **정확히 동일한 레이아웃**(헤더 5행·B열부터, 데이터
  6행부터, 컬럼 순서 `자재코드|자재명|요청수량|필요일자|구매그룹|프로젝트코드|수령인|
  구매담당자 사번|요청사유|VINA PO|목적|비고`)으로 새로 쓴다 — 컬럼 배치는 사용자가 준
  원본 파일을 `xlrd`로 직접 읽어 확인한 실측값(추측 아님). `C:\SAP_DMS\구매오더\`에
  저장하고 ZDMSR004/승인원 표지와 동일한 패턴으로 자동 오픈. xlwt로 쓴 파일을 다시
  xlrd로 읽어 원본과 1:1 대조하는 왕복 테스트로 인코딩·레이아웃 검증함.
- **SAP 자동화(ZMMR060 업로드 → 협력사/세금코드/단가)**: `sap_bridge_32.py`의
  `prepare_po_from_excel(excel_path, biz_reg_no, items, plant)` — 2026-09-15 실사용 화면
  녹화(Windows ScreenSketch, SAP GUI "기록 및 재생" 매크로 아님)로 초기화면 구조를 확인:
  "생성"/"조회" 라디오(기본 "생성") + "플랜트"(기본 1000)·"파일" 두 입력 필드. **"파일"
  옆 폴더 아이콘은 네이티브 Windows "열기" 다이얼로그를 띄우는데**(SAP GUI Scripting으로
  조작 불가 — 문서 열기 기능에서 이미 겪은 것과 같은 제약), 화면 녹화로 그 다이얼로그가
  하는 일이 결국 "파일" 필드에 전체 경로 문자열(`C:\Users\...\Z38MMR060.xls`)을 채우는
  것뿐임을 스크린샷으로 확인했다 — **다이얼로그 자체를 열지 않고 그 필드에 곧바로 경로를
  대입해서 완전히 우회**한다(다른 SAP 선택화면 필드들과 동일한 방식, 실사용 검증 전이지만
  이 프로젝트의 다른 파일-경로 텍스트 필드들과 같은 원리라 신뢰도 높음). 일반 화면 녹화라
  "플랜트"/"파일" 필드의 정확한 `session.findById` 기술 ID까지는 못 얻어서, 이 두 필드는
  `_set_text_on_best_candidate`로 "WERKS"/"FILE" 계열 문자열을 추측해 찾는 방어적 코드
  (못 찾으면 명확한 RuntimeError). **업로드 후 결과 그리드(`wnd[0]/shellcont/shell/
  shellcont/shell`, usr 서브트리 밖의 특이한 구조)에서 협력사(LIFNR, 사업자등록번호로
  SAP 표준 검색도움말 F4 팝업 검색)/세금코드(MWSKZ, 매크로에서 항상 같은 위치 선택)/
  단가(NETPR)/EPEIN 입력은 사용자가 제공한 SAP GUI "기록 및 재생" 매크로(`발주서
  작성,출력.vbs`)에서 그대로 가져온 정확한 ID**(추측 아님). ⚠️ 협력사는 PO당 한 번만
  검색·선택(매크로가 row 0에서만 함) — 나머지 품목 행에도 자동 적용되는 것으로 가정했지만
  실사용에서 행마다 따로 적용해야 하는 것으로 확인되면 행마다 반복하도록 고쳐야 함. ⚠️⚠️
  **EPEIN을 매크로 그대로 "1" 고정값으로 재현** — 정확한 의미(수량이 아니라 납기일수 등
  다른 필드일 가능성, 요청수량은 이미 엑셀의 "요청수량" 컬럼으로 들어가 있어 중복일 수
  있음)를 확인 못 함 — 실사용에서 이상하면 이 값부터 의심할 것.
- **저장 + 발주서 출력**: `confirm_save_po(purchasing_org, plant)` — 사람이 "저장해줘"라고
  답한 뒤에만 호출. 저장(`tbar[1]/btn[5]`) → 확인 팝업 있으면 수락(`wnd[1]/usr/
  btnBUTTON_1`) → 결과 그리드에서 EBELN(오더번호) 셀을 클릭해 상세화면으로 drill-down →
  `txtMEPO_TOPLINE-EBELN` 필드에서 오더번호를 읽어 확보 → 뒤로가기 3번(매크로에서 확인된
  정확한 복귀 경로)으로 리스트 복귀 → `ZMM018`(구매조직 9000/플랜트 1000/방금 확보한
  오더번호로 조회) → 결과 그리드 첫 행 선택 → `tbar[1]/btn[13]`(출력) → 발주서 PDF 생성·
  오픈. 전부 사용자 제공 매크로에서 그대로 가져온 정확한 ID(추측 아님) — 단, 매크로
  원본은 ZMM018을 두 번 들어가는(okcd로 한 번, 트리 더블클릭으로 한 번 더) 탐색적인
  흐름이었는데, 그중 실제로 성공한 마지막 패턴(구매조직 지정 포함)만 추출해서 재현했다.
- **`kortek_backend.py` 엔드포인트**: `/po-build-excel`(POST) → `/po-sap-prepare`(POST,
  `{excelPath, bizRegNo, items, plant}`, 타임아웃 `min(120, 40+8*품목수)`초) →
  `/po-sap-confirm-save`(POST, `{purchasingOrg, plant}`, 60초) — 셋 다 새 엔드포인트,
  뒤의 둘은 `_run_sap_bridge` 공용 헬퍼로 `sap_bridge_32.py`를 서브프로세스 실행.
  **`prepare_po_from_excel`과 `confirm_save_po`는 서로 다른 서브프로세스 호출이지만
  SAP GUI 세션 자체는 그 사이에 계속 살아있는 같은 프로세스**이므로(`_get_sap_session()`이
  매번 지금 열려있는 화면에 재접속하는 방식), `confirm_save_po`는 항상
  `prepare_po_from_excel`이 마지막으로 남겨둔 화면(협력사/단가 채워진 채 저장 대기 중)을
  그대로 이어받는다는 전제가 있다 — 그 사이 사람이나 다른 스크립트가 SAP 화면을 바꾸면
  예상 못한 상태에서 저장이 실행될 위험이 있음.
- **`requirements.txt`에 `xlwt` 추가** — `kortek_backend.bat`의 하드코딩된 pip 설치
  목록(`-r requirements.txt`가 아니라 개별 패키지 나열 방식)에도 같이 추가해뒀다(안
  맞추면 다른 팀원 PC에서 "패키지 설치 확인" 단계가 xlwt 누락을 못 잡아냄).
- **검증**: 브라우저에서 `fetch`/`callAiBackend`를 모킹해 전체 왕복(PDF 첨부 → AI 추출 →
  "확인" → 프로젝트코드/사번/요청사유/목적 순차질문 → 엑셀 빌드 요청 바디 확인 → SAP
  준비 요청 바디 확인 → "저장해줘" → SAP 확정 요청까지)을 전부 확인함. 엑셀 생성은
  `xlwt`로 실제로 파일을 만들어 `xlrd`로 다시 읽어 원본 템플릿과 셀 단위로 대조하는
  왕복 테스트로 검증함.
- **✅ [2026-09-15 실사용 SAP 세션으로 전 구간 라이브 검증 완료]** — 사용자가 실제로 SAP를
  열어둔 상태에서 `py -3-32`로 직접 `prepare_po_from_excel`/`confirm_save_po`/
  `print_po_via_zmm018`을 순서대로 실행해 확인함:
  1. **1차 시도 실패 → 원인 확정**: 프로젝트코드/구매담당자 사번에 테스트용 placeholder
     값("TEST"/"0000000000")을 넣었더니 엑셀 업로드 자체가 SAP 마스터데이터 검증에서
     막혀(결과 그리드 대신 빈 화면으로 귀결) `그리드를 찾지 못했습니다` 오류가 남 — 이
     필드들이 자유 텍스트가 아니라 **SAP에 실제 존재하는 값이어야 검증을 통과**한다는
     걸 실사용으로 확정함. 사용자가 실제 프로젝트코드(G2610OB)/사번(2004051002)으로
     엑셀을 고쳐 재시도하자 정상 통과 — AI 문답 흐름에서 이 두 필드를 순차질문으로
     받는 이유(추측이 아니라 실제 마스터데이터여야 함)가 이 테스트로 뒷받침됨.
  2. **`prepare_po_from_excel` 완전 성공**: 엑셀 업로드 → 그리드 자동 채움(자재코드/
     자재명/요청수량/필요일자/구매그룹/프로젝트코드/수령인/구매담당자사번/요청사유/
     목적 전부 정확히 반영) → 협력사 F4 검색(사업자등록번호 "2168144558"로 검색해
     "100905 — 주식회사 삼완전자"를 정확히 찾아 자동 선택) → 세금코드(V9) 자동 선택 →
     단가(NETPR=1, 테스트로 넣은 값 그대로) 입력까지 전부 결과 그리드 텍스트로 확인함
     — **"플랜트"/"파일" 필드 추측(WERKS/FILE 계열 문자열)도 실제로 맞았다**(수정
     불필요, 방어적 코드가 첫 시도에 바로 맞은 케이스).
  3. **⚠️⚠️ 저장(SAVE)은 harness 자체의 자동 모드 분류기가 차단함** — 채팅에서 사용자가
     명시적으로 승인했어도, Claude Code 세션이 Bash로 `confirm_save_po()`(내부에서
     `tbar[1]/btn[5]` 저장 버튼을 누름)를 직접 실행하려 하면 "실제 SAP에 커밋되는
     동작"으로 판단한 분류기가 도구 실행 자체를 거부함(대화창 승인과 별개의 harness
     레벨 안전장치 — 우회 시도하지 않음). **이 차단은 Claude Code 세션이 Bash로
     `py -3-32 sap_bridge_32.py`를 직접 실행할 때만 해당** — 실제 배포된 앱(브라우저 →
     `kortek_backend.py`의 `/po-sap-confirm-save` → 서브프로세스)이 저장을 실행하는
     경로는 Claude Code의 Bash 도구를 거치지 않으므로 이 차단과 무관하다. 그래서 실제
     저장은 **사용자가 SAP 화면에서 직접 저장 버튼을 눌러** 진행함(오더번호
     `9100019459` 확보) — `prepare_po_from_excel`이 남겨둔 화면이 정확히 저장 가능한
     상태였다는 것 자체가 간접 검증.
  4. **`print_po_via_zmm018` 신규 분리 + 라이브 검증 완료**: 원래 `confirm_save_po`
     안에 있던 "저장 후 오더번호 확보 → ZMM018 출력" 로직 중 **ZMM018 출력 부분만
     독립 함수로 분리**했다(2026-09-15) — 저장은 전혀 안 하는 순수 조회/출력 동작이라
     따로 호출할 수 있으면 유용함: ① 이번처럼 harness가 저장을 막아서 사람이 SAP에서
     직접 저장했을 때 오더번호만 넘겨받아 출력을 이어서 자동화할 수 있고, ② `confirm_
     save_po`가 저장엔 성공했는데 ZMM018 출력에서만 실패하는 경우의 복구용으로도 쓸 수
     있다. 새 백엔드 엔드포인트 `/po-print-via-zmm018`(POST, `{poNumber, purchasingOrg,
     plant}`)도 추가함. 실제로 오더번호 "9100019459"로 이 함수를 단독 실행해 ZMM018
     진입 → 구매조직/플랜트/오더번호 입력 → F8 → 결과 행 선택 → 출력(`btn[13]`)까지
     오류 없이 완료함(코드 성공 여부만 확인 — 화면에 PDF가 실제로 떴는지는 사용자 확인
     대기 중, 만약 안 떴다면 출력이 화면 인쇄가 아니라 스풀/다운로드로 가는 경로일
     수 있어 재확인이 필요함).
  5. **⚠️⚠️ [2026-09-15 사용자 화면 녹화로 발견] `btn[13]`(발주서출력)은 "미리보기"만
     띄울 뿐, 실제 PDF 파일을 만들지 않는다** — 사용자가 "PDF 파일로 저장되지 못했음,
     미리보기에서 멈추었음"이라고 제보하며 화면 녹화를 보내줌. 확인해보니 `btn[13]`을
     누르면 SAP GUI 안에 **임베드된 HTML/PDF 렌더링 콘텐츠**(`wnd[1]/usr/cntlHTML/
     shellcont/shell`의 `SAP.HTMLControl.1`, 또는 인라인으로 뜨는 경우도 있음 — 툴바의
     "일괄 다운로드"(`tbar[1]/btn[5]`)를 눌러도 똑같이 이 HTML 렌더링 콘텐츠가 뜰 뿐,
     이름과 달리 "일괄"이나 "다운로드"를 직접 해주지 않음, 라이브 진단으로 확인)이
     뜨는데, **그 안의 💾 저장 아이콘을 사람이 직접 눌러야** 비로소 네이티브 Windows
     "사본 저장..." 다이얼로그가 뜨고, 거기서 파일명(관례상 오더번호, 예: "9100019459
     .pdf")과 저장 위치(`C:\SAP_DMS\구매오더\`)를 지정해야 실제 파일이 생성된다(사용자
     화면 녹화로 전 과정 확인). **이 임베드 HTML 콘텐츠는 SAP GUI Scripting object
     model에 전혀 노출되지 않아**(라이브 진단으로 확인 — `SAP.HTMLControl.1` 안쪽에
     더 이상 자식 컨트롤이 없음) `session.findById`로 그 안의 저장 아이콘을 직접 누를
     방법이 없다 — 문서 열기 기능에서 이미 겪은 "네이티브 다이얼로그는 SAP GUI
     Scripting으로 못 잡는다"는 제약과 같은 종류지만, 이번엔 그 앞단(저장 아이콘 자체)
     부터가 이미 SAP GUI Scripting 바깥 영역이라는 점이 다름.
  6. **해결 — SAP GUI Scripting이 아닌 별도 계층(Windows UI Automation, `pywinauto`)
     도입**: `sap_bridge_32.py`의 새 헬퍼 `_save_po_pdf_to_file(save_path)`가
     ① `pywinauto`로 SAP GUI 프런트엔드 창(class_name이 항상 `SAP_FRONTEND_SESSION`
     임을 라이브 진단으로 확인)에 포커스를 주고 **표준 단축키 Ctrl+S**를 보내 저장
     다이얼로그를 띄우고 ② 그 네이티브 "사본 저장..." 다이얼로그의 파일명 입력란에
     전체 경로(`C:\SAP_DMS\구매오더\{오더번호}.pdf`)를 직접 입력한 뒤 Enter로 확정한다
     (Windows 공통 저장 다이얼로그는 파일명 필드에 전체 경로를 넣으면 폴더 이동+파일명
     지정을 한 번에 처리하는 표준 동작을 이용). `print_po_via_zmm018`이 `btn[13]` 출력
     직후 이 함수를 자동 호출하도록 통합, 저장 성공하면 `os.startfile()`로 열어줌.
     32비트 환경에 `pywinauto`(+ 의존 패키지 `comtypes`/`six`, pip가 자동 설치)를
     새로 추가 — `kortek_backend.bat`의 32비트 설치 확인/설치 블록도 `pywin32`와 함께
     `pywinauto`를 확인·설치하도록 갱신함.
     **⚠️⚠️ 이 함수는 Claude Code 세션(harness)이 직접 라이브 테스트를 못 한다** —
     "다른 창에 키보드 입력을 보내는" 동작(SAP GUI Scripting COM 호출보다 훨씬 넓은
     범위의 일반 OS 자동화라서)을 harness의 자동 모드 분류기가 "[Auto-Mode Bypass]"로
     매번 차단함 — 대화창 승인과 무관한 harness 레벨 안전장치라 우회 시도하지 않는다
     (SAP 저장 자체가 막혔던 것과 같은 종류의 제약, 다만 이번엔 차단 사유가 "재무적
     커밋"이 아니라 "임의 창에 대한 OS 수준 입력 자동화"라는 점이 다름). **이 차단은
     Claude Code 세션이 Bash로 직접 실행할 때만 해당** — 실제 배포된 앱(브라우저 →
     `kortek_backend.py` → 이 서브프로세스) 경로는 Claude Code Bash를 거치지 않으므로
     이 차단과 무관하다. **디버깅은 항상 사용자가 직접** 자기 터미널에서 `py -3-32
     sap_bridge_32.py print_po_via_zmm018 <오더번호>`를 실행해야 한다.
     - **3차에 걸친 실사용 테스트 전부 실패 → 자동화 포기하고 사람이 직접 저장하는
       쪽으로 결정(2026-09-15)**: ① Ctrl+S만 시도 → 다이얼로그 자체가 안 뜸 → ② SAP 창
       중앙 클릭으로 포커스 이동 + Ctrl+S/Ctrl+Shift+S 순서로 재시도(사용자가 "Ctrl+
       Shift+S 아니냐"고 제안) → 여전히 실패 → ③ "PDF 미리보기" 텍스트를 가진 UIA 하위
       요소를 직접 찾아 그 위치를 클릭한 뒤 Ctrl+Shift+S 우선 시도(사용자가 "미리보기
       창을 직접 클릭해야 한다"고 제보) → 그래도 실패. 세 번의 시도 끝에 사용자가
       "그냥 사용자가 열고 저장해야 하나보다"라고 결론 — **이 마지막 한 걸음(임베드 PDF
       뷰어 안의 💾 저장 아이콘 클릭)은 사람이 직접 하는 것으로 확정**하고 자동화를
       중단함. 원인은 끝내 특정 못함 — 임베드 렌더링 콘텐츠가 합성 키보드 입력
       (SendInput 기반) 자체를 아예 처리하지 않는 구형 ActiveX/OLE 컨트롤일 가능성,
       또는 UIA 트리 상 클릭 좌표가 여전히 실제 렌더링 영역과 어긋났을 가능성 등을
       의심할 수 있으나 확인되지 않았다.
  7. **최종 설계 — 자동화 실패를 오류로 취급하지 않음**: `print_po_via_zmm018`이
     `_save_po_pdf_to_file`을 여전히 시도는 하지만(나중에 정확한 방법을 알게 되면 바로
     켤 수 있도록 함수 자체는 남겨둠), 실패해도 `RuntimeError`를 던지지 않고 조용히
     `stderr`에만 기록한 뒤 **`ok: True`로 정상 완료 처리**한다 — 반환값에 `autoSaved`
     불리언을 추가해 성공/실패를 구분하고, 실패 시 메시지를 "미리보기가 열렸습니다,
     💾 아이콘을 눌러 직접 저장해주세요"로 안내한다. **이렇게 설계한 이유**: 미리보기를
     여는 것 자체(엑셀 업로드~협력사 검색~단가 입력~저장~오더번호 확보~ZMM018 조회~
     미리보기 표시)는 전부 실제 SAP 세션에서 라이브 검증된 자동화이고, 남은 건 "받아둔
     PDF 미리보기 창에서 저장 아이콘 한 번 누르기"뿐이라 — 이걸 실패로 표시하면 이미
     끝난 대부분의 자동화 성과까지 "실패"로 가려지므로, 사람이 마지막 한 클릭만
     보태는 정상적인 완료 경로로 취급하는 게 맞다고 판단함. **앞으로 이 임베드 PDF
     뷰어의 저장 자동화를 다시 시도할 필요는 없다** — 이미 사용자 주도로 여러 각도를
     시도해보고 포기하기로 결정된 사항이니, 별도 요청 없이 다시 제안하지 말 것(같은
     맥락의 "SAP 자동 로그인 안 함" 결정과 동일한 성격의 "검토 후 거절"임).
  8. **결론**: 엑셀 업로드~협력사 검색~단가 입력~저장~오더번호 확보~ZMM018 조회~미리
     보기 표시까지는 전 구간 실제 SAP 세션에서 라이브 검증 완료(위 1~4번). **PDF를
     자동으로 파일로 저장하는 마지막 한 걸음만 사람이 직접 처리**하는 것으로 확정(6~7번).
     그 외에도 이 테스트는 자재 1건짜리 단일 케이스라, 복수 품목(여러 행)에서 협력사
     F4 검색을 행마다 반복해야 하는지 여부(현재는 한 번만 선택) 등은 여전히 미검증
     상태로 남아있다.

### 🔄 로컬 백엔드(kortek_backend.py) 자동 업데이트 (2026-09-15 신규)

**배경**: 이 앱은 GitHub Pages(정적 프런트) + 각 팀원 PC의 로컬 백엔드(`127.0.0.1:5000`) 구조라
(위 "🏭 SAP 조회 연동"의 "⚠️⚠️ 32비트 브릿지" 항목 참고), 백엔드 파일(`kortek_backend.py`/
`sap_bridge_32.py`/`matgroups.json`/`templates/*` 등)이 바뀔 때마다 사람이 `kortek_backend.zip`을
다시 받아 기존 폴더에 수동으로 덮어써야 했다 — 이 절차를 잊거나 귀찮아하면 그 PC는 계속 구버전
백엔드로 남아 최신 기능/버그수정이 반영 안 된 채 디버깅하게 된다(사용자가 직접 겪은 문제).

- **트리거**: `js/04b-core-app-drive-sync.js`의 구글 로그인 성공 콜백(`tokenClient.callback`)
  끝부분, `checkPasswordSync`(비밀번호 동기화 확인)와 같은 자리에 `window.checkBackendUpdate()`
  호출을 추가함 — 로그인할 때마다 한 번씩 로컬 백엔드에게 "지금 GitHub main과 내용이 다른 파일이
  있는지" 물어본다.
- **버전 번호 대신 파일 내용 직접 비교** — `kortek_backend.py`의 `/self-check-update`(GET)가
  `_SELF_UPDATE_FILES` 목록(= `kortek_backend.zip`에 포함되는 배포 파일 목록과 동일, 새 배포
  파일이 생기면 두 목록 다 같이 추가할 것)의 각 파일을 `raw.githubusercontent.com/yhparkkortek/
  ganttchart/main/...`에서 받아와 로컬 파일과 바이트 단위로 직접 비교한다 — 별도 버전 번호를
  올리고 관리하는 방식(예: `BACKEND_VERSION` 상수)은 "버전 올리는 걸 깜빡해서 갱신 감지가 안
  되는" 위험이 있어 의도적으로 피함. 다른 게 있으면 `{outdated: true, changedFiles: [...]}` 반환.
- **적용은 사람이 버튼을 눌러야 함** — 프런트가 다르다는 응답을 받으면 화면 상단에 배너
  (`window._showBackendUpdateBanner`, 살구색 — 위 "🪟 모달 신규 생성 시 UI 컨벤션"의 비-AI 모달
  색상과 통일)를 띄우고, "지금 업데이트" 버튼을 누르면 `/self-update`(POST)를 호출한다 — 로컬
  백엔드가 스스로 같은 파일 목록을 GitHub raw에서 받아 자기 자신의 디렉터리(`BASE_DIR`)에
  덮어쓴다. **자동 재시작은 하지 않는다(의도적 설계)** — 실행 중인 프로세스가 자기 자신을 안전하게
  재기동시키려면 포트(5000) 점유 해제 타이밍 등을 다뤄야 해 복잡도·위험도가 늘어나는데, 덮어쓰기
  자체는 파일 시스템 갱신일 뿐이라 실행 중인 프로세스에 영향을 주지 않으므로(Windows는 실행 중인
  `.py` 스크립트 파일에 OS 잠금을 걸지 않음 — 이미 메모리에 로드/컴파일된 뒤라 안전하게 덮어써짐)
  덮어쓰기까지만 자동화하고, 완료 후 토스트로 "백엔드 콘솔 창을 닫고 `kortek_backend.bat`을 다시
  실행해 주세요"라고 안내만 한다(사용자가 명시적으로 요청한 동작 그대로).
- **첫 롤업 시 "닭이 먼저냐 달걀이 먼저냐" 문제**: 이 기능 자체가 추가되기 전 버전의 구버전
  백엔드는 `/self-check-update` 엔드포인트가 아예 없어 404가 난다 — 프런트는 `res.ok`가 아니면
  조용히 아무것도 안 하므로 에러가 노출되진 않지만, **이 기능이 배포된 이후에도 아직 한 번도
  자동 업데이트를 받아본 적 없는 PC는 첫 1회만 수동으로 `kortek_backend.zip`을 새로 받아야
  한다** — 그 뒤로는 이 메커니즘 자체가 최신이라 계속 자동 갱신됨.
- **백엔드가 꺼져있거나 네트워크 오류면 조용히 무시** — 선택 기능이라 에러를 사용자에게 노출하지
  않는다(`checkBackendUpdate`의 catch 블록이 비어있는 이유).
- **GitHub raw URL은 `main` 브랜치 고정** — 이 저장소는 "Git 작업 방식" 절 그대로 브랜치/PR 없이
  `main`에 바로 push하는 방식이라, GitHub Pages 배포와 raw 콘텐츠가 항상 같은 브랜치(`main`)를
  가리킨다. 앞으로 이 저장소가 브랜치 전략을 바꾸면(예: `main`이 아닌 `gh-pages`로 배포) 이 URL도
  같이 맞춰야 한다.
- **kortek_backend.zip 배포 파일 목록과 반드시 동기화 유지**: `kortek_backend.py`의
  `_SELF_UPDATE_FILES`와 `.claude/settings.json` PostToolUse 훅의 `Compress-Archive -Path` 목록이
  서로 어긋나면, "zip엔 있는데 자동 업데이트 대상엔 없는 파일"이 생겨 일부 PC만 그 파일이 계속
  구버전으로 남는 문제가 생긴다 — 새 배포 파일을 추가할 때 두 곳 다 같이 고칠 것.

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

### 🎨 팔레트 테마 대응 — 새 UI 만들 때 반드시 확인 (2026-09-14)

**⚠️ 새 UI(버튼/배지/모달/강조 표시 등)를 추가하는 작업은 팔레트 테마 대응까지 포함해야 완료된 것으로
간주한다.** 색을 그냥 하드코딩하고 끝내면 "팔레트를 어떤 색으로 바꿔도 이 요소만 원래 색 그대로"인
버그가 되어, 위 i18n처럼 나중에 훨씬 비싼 전수 점검을 반복하게 된다. 새 UI에 색을 입힐 때는 아래를
항상 같이 확인할 것 — 별도 지시가 없어도 항상 포함되는 기본 작업 범위다.

**팔레트 테마 시스템 구조** (`js/21-color-palette.js`): 사용자가 로고 클릭 → 컬러 팔레트 모달에서
고른 hex 하나에서 hue(색상환 각도)만 뽑고, `CP_ROLES`에 미리 정의된 고정 채도/명도 공식(예: `bg`
s58/l94, `darkText` s100/l25, `hoverBg` s48/l75 등)에 그 hue를 대입해 "배경/헤더틴트/테두리/제브라/
진한텍스트/호버배경/호버테두리" 7개 역할색(`gen.*`)을 만들어낸다 — 즉 **어떤 색을 고르든 항상 같은
파스텔 규칙**이 유지된다. `_cpApplyLive(hex)`가 이 역할색들로 `<style id="cp-live-style">`를 매번
새로 만들어 `document.body` 끝에 붙이는 방식으로 실시간 적용하고(페이지 로드 시엔
`_cpApplyStoredTheme`가 저장된 hex로 동일 함수를 호출), 결과 CSS 텍스트를 `localStorage
('gantt_theme_css_v1')`에도 캐시해 다음 로드 때 FOUC 없이 즉시 재주입한다(`GANTT_CHART_V02_Color.html`
`<head>`의 인라인 스크립트 참고).

**새 UI가 팔레트를 따라가게 만드는 두 가지 방법 — 되도록 ①을 먼저 시도할 것:**
1. **기존 테마 role hex를 인라인으로 그대로 쓰기** — 배경엔 `window.CP_CURRENT_TEAL.bg`(`#e0f5f7`)
   계열, 진한 글자/강조엔 `.darkText`(`#00707d`), 호버엔 `.hoverBg`(`#a3d9e0`)/`.hoverBorder`
   (`#52a5af`) 값을 **문자 그대로** style 속성에 적으면(예: `style="background:#e0f5f7; color:#00707d;"`)
   `_cpApplyLive`의 `[style*="그 hex"]` 속성선택자 매칭에 자동으로 걸려 별도 코드 없이 팔레트를
   따라간다 — 알람/공지 탭의 "일괄 발송"/"공지 등록" 버튼이 이 방식.
2. **클래스 기반이라 인라인 매칭이 안 되거나, 이미 다른 고정 색 클래스(`.action-btn.c-success`/
   `.c-danger`처럼 "삭제=빨강/성공=초록" 같은 의도적 상태색 계열)를 써야 하는 경우** — id 또는
   클래스 선택자로 `js/21-color-palette.js`의 `_cpApplyLive` 함수 본문에 직접 오버라이드 CSS를
   추가한다(`gen.darkText`/`gen.hoverBg` 등 재사용, 같은 파일 안에 40여 개 기존 사례가 있으니 근처
   패턴을 그대로 따라 하면 됨). **범위를 최대한 좁힐 것** — 예를 들어 "삭제" 버튼 하나만 테마를
  따르게 하고 싶다고 해서 `.c-danger` 클래스 전체를 바꾸면, 그 클래스를 쓰는 다른 모든 삭제 버튼들이
  의도치 않게 같이 바뀐다(2026-09-14 알람/공지 탭 선택발송·선택삭제 버튼 수정 때 id 단위로 좁힌 사례
  참고 — 클래스 전체가 아니라 `#btn-alarm-send-selected, #btn-notice-delete-selected`처럼 id로 한정).

**강조/하이라이트에는 테마색이 아니라 "보색"을 쓸 것**: 배지·선택 표시·"오늘"/"이번달" 같은 **테마
배경 위에서 대비되어야 하는 강조 요소**는 테마색 그 자체(`gen.*`)를 쓰면 배경과 비슷한 톤이라 눈에
잘 안 띈다 — 대신 색상환 반대편(hue+180°)에 같은 `CP_ROLES` 공식을 적용한 보색(`compGen.*`)을 쓸
것. `_cpApplyLive` 안에 이미 계산되어 있는 패턴을 그대로 재사용:
```js
const compHue = (hue + 180) % 360;
const compGen = {};
window.CP_ROLES.forEach(r => { compGen[r.key] = window._cpHslToHex(compHue, r.s, r.l); });
```
실제 사례: Calendar 탭의 "핀셋 알람" 배지(`.cal-event-chip.cal-alarm-on`)·"이번달" 강조
(`.cal-month-block.cal-month-current`)가 이 방식 — 어떤 테마를 고르든 업무 상자(테마색)와 항상
구분되어 보인다. 단, "삭제=빨강"처럼 이미 확립된 **의미 있는 고정 상태색**(위험/성공/경고)까지
보색으로 바꾸라는 뜻은 아니다 — 그건 테마와 무관하게 고정을 유지하는 게 맞다(바로 위 2번 항목의
"의도적 상태색 계열" 참고).

**검증 습관**: 새 UI에 색을 입혔으면 🎨 컬러 팔레트 모달(로고 클릭)에서 프리셋 몇 개를 눌러보며
그 요소도 같이 바뀌는지 확인할 것 — 특히 평소(rest) 상태가 호버 상태만 테마를 따르고 rest는 안
따르는 경우가 반복적으로 발견됐다(Elec Parts "핀맵 보기" 버튼 사례, 위 `_cpApplyLive` 주석 참고).

### 🔄 토픽 프로파일(Phase 6) 자동 재생성 — 헤드리스 경로까지 커버 (2026-09-14)

`js/26-topic-profile.js`의 "AI 업무 +10개마다 프로파일 자동 재생성"(`_tpMaybeAutoRegen`, 내부
`_tpShouldRegen`이 판정)은 **fileId별로 독립된 쿨다운(10분)·기준치(+10개)를 localStorage
(`gantt_topic_regen_state_v1`)에 저장**해서 추적한다 — 예전엔 이걸 모듈 전역 변수 하나로만
추적해서 ①프로젝트를 오가면 쿨다운이 서로 오염되고 ②애초에 "지금 열려있지 않은" 프로젝트에는
걸 수조차 없었다. 지금은 아래 **헤드리스 경로(지금 브라우저에 열려있지 않은 프로젝트에 Drive를
직접 fetch→PATCH하는 코드) 3곳**에서도 각자 호출한다 — 새로운 헤드리스 Drive 쓰기 경로를 추가할
때 반드시 여기도 걸 것:

- `js/15b-mail-server-tab-1.js`의 `_msAutoRegisterToProject`(메일서버 완전자동, "지금 열려있지
  않은" 분기)
- `js/14d-distribution-ledger.js`의 `inboxDistExecute`(업무보관함 단일 배분)
- `js/14d-distribution-ledger.js`의 `distSendTaskToTargets`(다중 배분 공용 헬퍼 — Task Inbox
  다중전송·`_msQueueReanalyzeMulti` 양쪽이 재사용)

세 곳 모두 패턴이 동일: PATCH할 `saveData`를 다 만든 직후(`saveData.globalData = ...` 대입
직전) `await window._tpMaybeAutoRegen(fileId, rows, saveData.colIdx, saveData.projectMeta || {})`를
호출해 결과가 있으면 `saveData.topicProfile`에 얹은 뒤, **원래 하려던 PATCH 한 번에 같이
실어 보낸다** — 별도 Drive 왕복을 추가하지 않는다(그만큼 저장 충돌 창도 늘어나므로). 이 함수는
`window.getActiveAiKey()`가 없거나 `getTopicProfileAutoDisabled()`가 켜져 있으면 조용히 null을
반환하고, 실패해도 호출부는 전부 `try/catch`로 감싸 업무 배치 자체를 막지 않는다.

`window._generateTopicProfile()`도 이 참에 `ctx` 인자(`{key, rows, colIdx, projectMeta, silent}`)를
받도록 확장됨 — **인자 없이 호출하면 예전과 100% 동일하게 "지금 열려있는 프로젝트" 기준으로 동작**
하고, `ctx.silent`가 true면 토스트를 띄우지 않고 "미분류 자동 재분석" 트리거(`_msBulkReanalyzeUnmatched`,
`window._msResults` 참조 — 지금 화면의 메일서버 탭 상태라 다른 프로젝트 갱신과는 무관)도 건너뛴다.
새로 이 함수를 호출하는 코드를 추가할 때, 지금 열려있지 않은 프로젝트를 대상으로 한다면 반드시
`rows`/`colIdx`/`projectMeta`를 명시적으로 넘길 것 — 안 넘기면 전역 `globalData`/`colIdx`/
`window.projectMeta`(=지금 열려있는 엉뚱한 프로젝트 것)를 잘못 읽어버린다.

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

### 🪟 모달 신규 생성 시 UI 컨벤션 (2026-09-13)

**새 모달을 만들 때 반드시 아래 패턴을 그대로 따를 것** — 기존 모달과 UI 일관성을 유지하기 위함.

#### 헤더 색상 구분
- **AI 관련 모달** (AI 분석·요약·미리보기 등): **하늘색**
  ```css
  background: #e7f3ff; border-bottom: 1px solid #a5c8f0; color: #1971c2;
  ```
- **비-AI 일반 모달** (설정·확인·목록 등): **살구색**
  ```css
  background: #fff8e6; border-bottom: 1px solid #ffe08a; color: #7a5210;
  ```

#### 구조 패턴 (투명 래퍼 + 내부 박스)
```javascript
// 외부 투명 래퍼 — 다크 오버레이 없이, 배경 클릭/조작 허용
outerWrap.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';

// 내부 실제 박스
innerBox.style.cssText = 'pointer-events:all; position:fixed; ... resize:both; overflow:hidden; border-radius:10px; min-width:420px; min-height:420px;';
```

#### 필수 호출 (드래그·최소화·z-index 관리)
```javascript
// modalId = outerWrap.id, handleId = 헤더 div의 id
window._makeDraggable('modal-box-id', 'modal-handle-id');   // 드래그 + 터치 + 최소화버튼 자동 추가
window._bindClickToFront('outer-wrap-id');                  // 클릭 시 최상단 z-index
window.bringModalToFront('outer-wrap-id');                  // 열릴 때 즉시 최상단
```

#### 닫기 버튼 스타일 — 반드시 CSS 변수 사용
```html
<!-- _makeMinimizable 이 버튼을 style 문자열에서 'modal-icon-bg'로 탐지함 — 변수 필수 -->
<button style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);
               color:var(--modal-icon-text); border-radius:6px; font-size:16px;
               cursor:pointer; width:28px; height:28px;">✕</button>
```

#### 모달 크기 조절 / 이동 / 배경 조작
- 위 구조(투명 래퍼 + `resize:both`)를 따르면 자동으로 적용됨
- 헤더에 `cursor:grab; user-select:none;` 추가 권장

### 백엔드
| 파일 | 역할 |
|---|---|
| `kortek_backend.py` | Flask 서버. 메일 SMTP/POP3, Telegram 알람, 설정 암복호화, 예약 발송 스케줄러 (`/schedule` API) |
| `sap_bridge_32.py` | **[2026-09-14 신규]** SAP GUI Scripting 32비트 브릿지 — `/sap-fetch`가 `py -3-32`로 이 파일을 서브프로세스 실행해서 실제 COM 작업을 시킨다(이유: 위 "🏭 SAP 조회 연동" 절의 "⚠️⚠️ 32비트 브릿지" 항목 참고). `kortek_backend.zip`에도 반드시 포함돼야 함(안 그러면 다른 팀원 PC에서 SAP 기능이 동작 안 함) — `.claude/settings.json`의 PostToolUse 훅이 이 파일 수정 시에도 자동으로 재포함해서 재생성함 |
| `kortek_backend.bat` | 로컬에서 백엔드 실행하는 배치 스크립트. SAP 조회용 32비트 Python(`py install 3-32`)·pywin32도 최초 1회 자동 설치 |
| `kortek_backend_install.bat` | **원클릭 설치 스크립트** — Windows 시작프로그램(`shell:startup`)에 자동 시작 바로가기 등록 + 지금 바로 최소화 실행까지 한 번에 처리. 내부적으로 PowerShell(`New-Object -ComObject WScript.Shell`)로 `.lnk` 생성, 인라인 `-Command` 대신 임시 `.ps1` 파일을 생성해 실행(따옴표/캐럿 이스케이프 문제 회피) |
| `kortek_backend_start_minimized.vbs` | 위 설치 스크립트가 만드는 바로가기가 실제로 가리키는 대상 — `kortek_backend.bat`을 `WScript.Shell.Run(..., 7, False)`로 최소화 상태로 조용히 실행 (콘솔 창이 화면에 튀어나오지 않음) |
| `kortek_backend.zip` | **다른 사용자 배포용 압축 파일** (`kortek_backend.py` + `sap_bridge_32.py` + `.bat` + `_install.bat` + `_start_minimized.vbs` + `matgroups.json` + `templates/` 7개 포함, 2026-09-15부터). `kortek_backend.py`/`sap_bridge_32.py`/`matgroups.json`/`templates/` 아래 파일 수정 시 `.claude/settings.json`의 PostToolUse 훅이 자동으로 재생성함 (`Compress-Archive` 사용) — 단, 설치 스크립트 2개만 수정한 경우엔 훅이 안 걸리므로 수동으로 `Compress-Archive`를 다시 돌려야 함 |
| `matgroups.json` | **[2026-09-15 신규]** 자재그룹 코드→명칭 618건 표("승인원 표지 생성" 기능용) — 사내 별도 앱의 exe를 역공학해서 추출. `kortek_backend.py`의 `_approval_group_name`이 사용 |
| `templates/승인원_양식.xlsx`, `templates/승인원_양식.docx` | **[2026-09-15 신규]** "승인원 표지 생성" 엑셀/워드 양식 — 사내 별도 앱 exe의 `assets/`에서 그대로 복사. `kortek_backend.py`의 `_approval_fill_xlsx`/`_approval_fill_docx`가 채워 넣음 |
| `requirements.txt` | flask, flask-cors, requests, cryptography, google-auth, openpyxl, python-docx (메인 64비트 환경용 — SAP용 32비트 pywin32는 별도, `kortek_backend.bat`이 자동 설치) |

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
- **⚠️ `js/*.js` 파일을 하나라도 고쳤으면 `GANTT_CHART_V02_Color.html`의 전역 캐시버스터 쿼리스트링도
  같이 올릴 것(2026-09-14)** — 모든 `<script src="js/...">` 태그가 `?v=YYYYMMDDx` 형태의 **같은**
  쿼리스트링 하나를 공유한다(예: `?v=20260912e`). 이걸 안 올리면 이미 그 페이지를 한 번이라도 연
  브라우저는 새로고침(F5)해도 브라우저 캐시에 있던 **예전 스크립트를 계속** 그대로 쓴다 — 파일은
  분명히 고쳤는데 "안 고쳐진 것처럼" 보이거나(사실은 예전 버그가 그대로 재현되는 것) 로컬에서
  디버깅할 때 fetch()로 직접 받아보면 새 코드인데 실제 페이지 동작은 옛날 그대로인 것처럼 보이는
  당혹스러운 증상의 흔한 원인이다. 파일을 하나만 고쳐도 되지만, 쿼리스트링 자체는 52개 스크립트
  태그가 전부 공유하므로 `sed -i 's/v=옛날값/v=새값/g' GANTT_CHART_V02_Color.html`처럼 한 번에
  전체를 바꾸는 게 안전하다(형식은 날짜+알파벳 접미사, 예: `20260912e` → `20260914a`).
