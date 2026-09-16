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

### 📧 메일 "원문 보기" 영문 번역 속도개선 — 한국어만 있는 블록은 AI 호출 자체를 생략 (2026-09-16)

Task Inbox "📧 원문 보기"의 🌐 번역 버튼(`js/14c-task-inbox.js`의 `window._toggleMailRawTranslation`)은
원문을 문단(빈 줄 기준, 없으면 줄 단위) 블록으로 나눈 뒤 **25개씩 청크로 묶어 `Promise.all`로 병렬
호출**한다(문단 1개당 AI 호출 1번이 절대 아님 — 이미 2026-09-14에 그렇게 설계돼 있었다). 사용자가
"번역이 느린 게 문단마다 번역해서 그런가"라고 물어봐서 확인했더니, 문단별 개별 호출은 아니었지만
**한국어만 있는 블록까지 전부 AI에 보내 "번역 필요 없음"이라는 판정 자체를 AI에게 시키고 있었던 것**
이 실제 병목이었다 — 이 회사 메일은 헤더/서명/한글 문단이 대다수라 이 불필요한 판정 요청이 청크
수(=왕복 횟수)를 실질적으로 늘리고 있었다.

- **수정 1 — 클라이언트 사전 필터**: `FOREIGN_LETTER_RE = /[A-Za-zÀ-ɏ぀-ヿ一-鿿]/`
  (라틴 문자·일본어 히라가나/가타카나·CJK 통합 한자)로 각 블록을 검사해, 이 패턴에 전혀 안 걸리는
  (=한국어·숫자·기호뿐인) 블록은 **AI 호출 대상 목록(`blocksToTranslate`)에 아예 넣지 않는다** — 청크는
  이 필터를 통과한 블록만으로 구성되므로, 순수 한글 메일은 AI를 한 번도 안 부르고 즉시 원문 그대로
  렌더링된다(라이브 테스트로 확인: 순수 한글 4블록 입력 시 `callAiBackend` 호출 0회, 에러도 없음).
  정확도 손실은 없다 — 한국어만 있는 블록은 원래도 AI가 "번역 불필요"로 판정하던 것과 최종 결과가
  같고, 그 판정을 AI 대신 로컬 정규식이 내리는 것뿐이다.
- **수정 2 — 프롬프트가 "번역 필요 없는 블록"까지 매번 JSON에 채워 응답하던 것을 없앰**: 예전 프롬프트는
  모든 블록에 대해 `{"idx":N,"translate":true/false,"ko":"..."}` 형태로 빠짐없이 응답하라고 시켰는데,
  이제는 필터를 통과한(=대부분 실제로 외국어인) 블록만 보내므로 "번역이 필요한 블록만 배열에 담고
  나머지는 배열에서 아예 제외하라"고 바꿔 출력 토큰 자체를 줄였다 — 응답이 작아지면 그만큼 빨리
  끝나고, 2026-09-14에 겪었던 "출력이 길어 JSON이 중간에 잘리는" 위험도 같이 줄어든다(그 버그
  때문에 CHUNK_SIZE를 25로 낮췄던 것 — 이번 수정으로 청크당 부담이 줄었으니 나중에 CHUNK_SIZE를
  다시 올려볼 여지가 생겼지만, 이번 수정에서는 위험을 늘리지 않기 위해 건드리지 않음).
- **⚠️ 렌더링 조건도 같이 갱신**: 응답 항목에 더 이상 `translate` 필드가 없으므로(있으면 무시해도
  무해), `entry && entry.translate && entry.ko` 대신 `entry && entry.ko && String(entry.ko).trim()`
  로 판정 조건을 바꿨다 — `translate` 필드를 계속 요구했다면 새 응답 형식에서 번역문이 있어도
  전부 무시되는 회귀가 났을 것.
- **⚠️ "청크가 없으면 무조건 실패"였던 가드도 같이 고쳐야 함**: 기존엔 `chunkResults`에 성공한 청크가
  하나도 없으면(`anySucceeded===false`) 무조건 에러를 던졌는데, 필터링 도입 후에는 **순수 한글
  메일처럼 애초에 청크 자체가 0개인 정상 케이스도 `anySucceeded===false`가 된다** — 그래서
  `chunks.length && !anySucceeded`로 조건을 좁혀, "청크가 있었는데 전부 실패"일 때만 에러를 던지고
  "애초에 번역할 게 없어 청크가 0개"인 경우는 조용히 원문만 표시하도록 분리했다. 이 가드를 빠뜨리면
  순수 한글 메일마다 번역 버튼을 누를 때 "번역 실패" 에러가 매번 뜨는 회귀가 재발한다.
- **검증**: 브라우저에서 `callAiBackend`를 모킹해 (1) 한글+영문 혼합 본문 → 영문 블록만 프롬프트에
  포함되고(한글 블록은 프롬프트에 아예 안 나타남) 정확히 번역되어 렌더링되는지, (2) 순수 한글 본문 →
  AI 호출 0회, 에러 없이 즉시 원문 그대로 표시되는지 둘 다 확인함.
- **앞으로 비슷한 "AI에게 판정까지 맡기는" 기능을 새로 짤 때**: 판정 대상 중 일부가 로컬에서 값싸고
  확실하게 걸러낼 수 있는 경우(이번처럼 정규식 한 줄로 "번역 불필요"를 미리 알 수 있는 경우)라면,
  그 판정 자체를 AI에 맡기지 말고 최대한 클라이언트에서 먼저 걸러 AI 호출 대상 자체를 줄이는 걸 우선
  검토할 것 — 청크/병렬화보다 "애초에 보낼 필요가 없는 요청을 안 보내는 것"이 항상 더 효과적이다.

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

### 📌 "No." 열(`.no-td`)에 오버레이를 얹을 때 — 절대좌표 대신 flex 항목으로 (2026-09-16 버그수정)

Gantt 표의 "No." 열(`.no-td`)은 `js/04j-core-app-upload-utils-5.js`가 `display:flex;
justify-content:center;`인 `<div>` 안에 📌(알림 핀, 클릭 시 `window._wrPinClick`로 그 행 알림
토글) + 행 번호(`.row-num-span`)를 **가운데 정렬**해서 그린다. 알림이 켜진 행은 핀 아이콘에
`transform:scale(1.3)`이 붙어 30% 커진다.

**실제로 터진 버그**: "AI 검색에서 조회하고 체크박스(V)를 클릭하면 배경의 핀이 눌린다"는 제보 —
`js/26-gantt-search.js`의 `_updateRowCheckbox()`가 검색 결과 행마다 이 `.no-td` 셀에 선택용
체크박스를 `position:absolute; left:2px; top:50%` 좌표로 얹고 있었는데, 그 셀의 실제 내용(핀+번호)
은 flexbox로 **가운데 정렬**돼 있어서 절대좌표 `left:2px`가 가운데 정렬된 내용과 겹칠 위험이
항상 있었고, 특히 알림이 켜진 행은 확대된 핀이 체크박스의 14×14px 히트박스를 벗어나 삐져나온
부분에 클릭이 그대로 핀으로 히트되어 체크 대신 알림이 잘못 토글됐다. 핀의 클릭 핸들러
(`_wrPinClick`)가 이미 `event.stopPropagation()`을 쓰고 있었지만, 그건 "핀이 이미 클릭 대상으로
확정된 뒤" 이벤트가 더 위로 전파되는 것만 막을 뿐 애초에 어느 요소가 클릭 대상으로 히트되는지
(좌표 문제)에는 아무 영향이 없어서 도움이 안 됐다 — **이벤트 버블링이 아니라 순수 기하학적
(좌표) 겹침 문제**였다는 게 핵심.

**수정**: 좌표 계산에 의존하는 절대좌표 오버레이 대신, `.no-td` 안의 기존 flex 컨테이너 맨 앞에
체크박스를 **정적(static) flex 항목으로** 끼워 넣도록 변경(`_updateRowCheckbox`가 `firstTd`가
아니라 `firstTd.querySelector(':scope > div')`를 대상으로 `insertBefore`) — flexbox가 자리를
자연스럽게 배분하므로 핀이 아무리 확대돼도 체크박스와 물리적으로 겹칠 수 없다(좌표 값을 맞추는
방식이 아니라 애초에 겹칠 수 없는 구조로 바꾼 것).

**앞으로 이미 flex/grid로 정렬된 셀·요소 위에 새 클릭 가능한 오버레이(체크박스/아이콘/배지 등)를
얹을 때는, 절대좌표(`position:absolute` + 고정 `left`/`top` 값)로 옆에 끼워 넣지 말고 가능하면
그 flex 컨테이너의 실제 자식으로 넣을 것** — 특히 그 위에 있는 다른 요소가 상태에 따라
`transform:scale()`로 커지는 경우(이 앱의 핀 아이콘처럼)라면 절대좌표 방식은 거의 항상 이런
겹침 버그로 이어진다. `event.stopPropagation()`은 버블링 문제의 해법이지 좌표 겹침 문제의
해법이 아니라는 점도 헷갈리지 말 것.

### 🐛🐛 AI 검색 체크박스로 일괄 삭제할 때 일부(특히 오래된 메일 업무)가 안 지워지는 버그 — `_selected`는 인덱스가 아니라 객체로 (2026-09-16 버그수정)

`js/26-gantt-search.js`의 AI 검색(`#ai`/`#키워드`/`@프로젝트`) 결과에 체크박스로 여러 행을 선택해
"🗑️ 일괄 삭제" 또는 "📚 오매칭 삭제+학습"을 눌렀을 때, 체크해둔 항목 중 일부가 조용히 삭제되지
않는 버그 — "일괄 삭제도 마찬가지"라는 사용자의 중간 정정으로 "오매칭 삭제+학습" 버튼의
`_aiRegistered` 필터링 로직 문제라는 초기 가설(코드에 실제로 존재했던, 결과에 안 쓰이는
`aiSelected` 변수 — 사소한 죽은 코드였을 뿐 이 버그의 원인은 아니었음)은 기각됨.

**진짜 원인**: `_selected`가 체크 시점에 `data-row-index`로 읽은 `globalData` **배열 인덱스**(숫자)를
담는 `Set`이었는데, `window.ganttSearchObserve()`가 붙여둔 `MutationObserver`(`#table-body`의
`childList` 변화를 감시)가 검색이 켜져 있는 동안 테이블이 다시 그려질 때마다(체크박스 DOM을
새로 만들기 위한 의도) **매번 `_selected.clear()`를 호출**하고 있었다 — 이 앱은 메일 자동등록
파이프라인이 새 업무를 끼워넣거나 자동저장이 서버 병합 결과를 반영하는 등 배경에서 표가
재렌더되는 일이 흔한데, 사용자가 체크박스를 몇 개 체크해둔 뒤 삭제 버튼을 누르기 전 사이에
이런 재렌더가 단 한 번이라도 끼어들면 `_selected`가 조용히 통째로 비워졌다 — 그 뒤 몇 개를
더 체크하고 삭제를 눌러도 "재렌더 이전에 체크했던(먼저 훑어본, 그래서 오래된/화면 위쪽 항목일
가능성이 높은) 것들만 빠진 채" 삭제됐다("오래전 분석된 메일인 것 같다"는 사용자의 직감이
정확히 이 재렌더 타이밍 문제를 가리키고 있었음).

**수정**: `_selected`를 배열 인덱스 대신 **행 "객체 참조"**를 담는 `Set`으로 바꿈 —
`globalData`의 행 객체는 재렌더돼도 같은 객체가 재사용되므로(속성만 갱신, 배열이 통째로 새로
만들어지지 않음) 배열 안에서의 위치(인덱스)가 바뀌어도 객체 자체의 동일성은 그대로 유지된다.
그래서 MutationObserver의 `_selected.clear()` 호출 자체를 제거했고(더 이상 재렌더 때마다
선택을 비울 필요가 없어짐), `_batchDelete(withLearning)`은 삭제 직전마다 `globalData.indexOf(row)`로
"지금" 위치를 다시 찾아서 지우므로 그 사이 몇 번을 재렌더/재배치했든 항상 정확한 행이 삭제된다.
전체 선택(`gantt-ai-bulk-selall`)/AI 태그 해제(`gantt-ai-bulk-untag`)/체크박스 change 핸들러도
전부 같은 객체 기반 패턴으로 통일함.

**검증**: 브라우저에서 가짜 3행 데이터(AI 등록 2건 + 일반 1건)로 체크박스 2개를 체크한 뒤,
**의도적으로 맨 앞에 새 행을 끼워 넣고 `#table-body`를 다시 그려 MutationObserver를 발화**시켜
기존에 체크했던 항목이 여전히 체크된 상태로 남아있는지 확인(이게 바로 이 버그의 재현 시나리오) →
유지됨을 확인 → "일괄 삭제" 버튼을 눌러 인덱스가 밀린 상태에서도 정확히 그 2건만 삭제되고
나머지 2건(새로 끼워넣은 행 + 원래 미선택 행)은 그대로 남는 것까지 전부 확인함.

**앞으로 비슷한 "체크박스로 여러 행을 선택해뒀다가 나중에 일괄 처리하는" 기능을 새로 만들 때**:
배경 재렌더가 흔한 이 앱에서는 선택 상태를 배열 인덱스로 담지 말 것 — 인덱스는 재렌더/재배치로
언제든 어긋날 수 있다. 행 객체 참조(또는 안정적인 고유 id가 있다면 그 id)로 담고, 실제 처리
시점에 항상 최신 위치를 다시 찾아 처리하는 패턴을 재사용할 것.

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

**🐛 [2026-09-17 실사용 버그수정, 같은 패턴의 변형] "알람 모두 풀어줘" — 태그 자체는 이미
있는데 "여러 개 한꺼번에 써도 된다"는 걸 AI가 프롬프트에서 못 배웠던 경우**: 사용자가
"gantt chart 알람 모두 풀어줘"라고 물었더니 AI가 "일괄 해제 기능이 없다"며 개별 UI에서
하나씩 해제하라고(사실과 다르게) 답한 사고 — 위 GOTO_ROW류와 증상은 같지만 원인이 달랐다.
`js/04h`의 `_applyGanttQaActions`(`SET_ALARM`/`CLEAR_ALARM` 정규식이 `/g` 플래그로 이미
"한 답변에 여러 태그, 전부 실행"을 지원하고 있었고, `_buildGanttQaContext`도 알람 켜진
업무마다 `[알람ON]` 마커를 이미 컨텍스트에 넣어주고 있었다 — 즉 **엔진과 데이터는 이미
일괄 처리를 지원하는데, `js/04g-core-app-upload-utils-2.js`의 SET_ALARM/CLEAR_ALARM 프롬프트
규칙 블록만 "정확히 하나만 찾으세요"처럼 단수 표현으로만 쓰여있어서 AI가 "여러 개에 반복해서
태그를 붙여도 된다"는 걸 몰랐던 것**(바로 아래 DELETE_ROW 규칙엔 "여러 행 삭제 요청 시 각각
한 줄씩"이라는 문장이 이미 있었는데, 이 문장만 알람 쪽에 빠져 있었음). **수정**: 그 규칙
블록(`_buildGanttQaPromptTemplateRaw`)에 "모두 꺼줘/전체 해제해줘"류 요청이면 `[알람ON]`
마커가 붙은(또는 켤 때는 안 붙은) 업무 전부에 대해 `CLEAR_ALARM`/`SET_ALARM` 태그를 업무마다
한 줄씩 반복하라는 새 항목을 추가하고, "일괄 해제 기능이 없다고 답하지 말 것"을 명시적으로
금지. 코드 로직은 전혀 안 건드림(이미 다 되어 있었음) — 순수 프롬프트 문구 추가만으로 해결.
**앞으로 비슷한 제보("OO가 안 된다"는데 태그/로컬명령은 이미 있어 보이는 경우)를 만나면,
새 태그를 만들기 전에 먼저 "태그는 있는데 단수 표현으로만 쓰여 있어서 AI가 반복 사용 가능
여부를 몰랐던 것 아닌가"부터 의심할 것** — 코드보다 프롬프트 문구가 원인인 경우가 이 앱에서
반복되고 있다(백틱 문제와는 또 다른, "실행 로직은 맞는데 AI에게 허락을 안 알려준" 패턴).

**🐛🐛 [2026-09-17 재확인 — 위 수정만으로는 부족했다, 진짜 원인은 저장된 커스텀 프롬프트]**:
위 수정을 배포한 직후에도 "알람 모두 풀어줘"가 3번 연속 똑같이 "일괄 기능이 없다"로 실패한다는
재제보가 들어옴 — `_buildGanttQaPromptTemplateRaw`/`_defaultGanttQaPromptTemplate`을 고친 게
전혀 반영이 안 되고 있었다. **원인**: `_buildGanttQaPrompt`(`js/04g` 1262번째 줄 근처)가
`const template = localStorage.getItem('gantt_qa_prompt') || window._defaultGanttQaPromptTemplate;`
로, [🤖 AI 문답 → 📝 프롬프트]에서 팀이 이미 저장해둔 커스텀 프롬프트가 있으면 그게 내가 고친
기본 템플릿을 **완전히 대체**해버린다 — 이 팀은 실사용 중 프롬프트를 이미 여러 번 편집·저장한
이력이 있어서(AI 학습/자동개선 기능도 있는 앱이라 매우 흔한 상태) 저장된 커스텀 프롬프트가
있었고, 거기엔 당연히 내가 방금 추가한 문구가 없었다. **이건 이미 알려진 함정이었다** — 바로
위(1299번째 줄 근처) "🏷️ [필수] 프로젝트 이름 표시 규칙"과 `sapSection` 토큰 폴백이 정확히 같은
이유로 "템플릿 치환이 끝난 뒤 결과 문자열에 **무조건** 덧붙이는" 방식을 이미 쓰고 있었는데, 처음
이 버그를 고칠 때 그 패턴을 놓치고 템플릿 안쪽(치환 이전 부분)에만 문구를 넣어서 재발했다.
**최종 수정**: 알람 일괄 처리 규칙도 템플릿 치환이 끝난 뒤 무조건 한 번 더 덧붙이도록 옮김(템플릿
안쪽 문구는 그대로 둬도 무해하니 남겨둠, 중복 강조일 뿐). 브라우저에서 `localStorage.setItem
('gantt_qa_prompt', '...')`로 이 상황을 정확히 재현한 뒤(커스텀 프롬프트에 새 규칙이 없는 상태)
`_buildGanttQaPrompt()`를 직접 호출해 결과에 "알람 일괄 처리 규칙" 문구가 실제로 포함되는지
확인해서 검증함. **앞으로 이 앱에서 "AI 문답 프롬프트에 새 필수 규칙을 추가"할 때는, 그 규칙이
정말 항상 지켜져야 하는 것이라면 템플릿 안쪽에 쓰지 말고 반드시 `_buildGanttQaPrompt`의 치환
이후 무조건 append 구간에 추가할 것** — 템플릿 안쪽 수정은 그 팀이 프롬프트를 한 번도 편집·저장한
적 없는 경우에만 통하는, 사실상 깨지기 쉬운 방법이다.

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

### 🔽 AI 문답 객관식 질문 — 드롭다운으로 물어보기 (2026-09-16 신규, 사용자 요청)

**AI 문답이 정해진 목록(객관식) 중에서 하나(또는 여러 개)를 고르게 하는 질문은, 그 목록 데이터를
가지고 있는 경우 항상 자유 텍스트 대신 드롭다운으로 물어볼 것** — "구매오더 요청"(🛒 절)의 목적
(P01~P05)/임시코드(900101~900501) 선택부터 이 방식으로 바꿨다. 표를 채팅 메시지에 길게 나열하고
사람이 코드나 문구를 정확히 타이핑해야 했던 기존 방식은 오타·형식 실수 위험이 있었다(예: "P1"을
"P01"로 인식 못하던 실사용 버그가 반복됐던 것도 결국 자유 텍스트 입력의 한계).

- **구현**: `js/04h-core-app-upload-utils-3.js`의 `window._ganttQaPendingChoiceDropdown`(대화
  내용과 별개인 "지금 물어보고 있는 객관식 질문" 상태, 승인원 표지/BOM 옵션의 "여러 턴 draft"들과
  같은 패턴) + `window._ganttQaRenderChoiceDropdownHtml(draft)`(드롭다운 HTML 생성) +
  `window._ganttQaSubmitChoiceDropdown(id)`(선택 제출 처리). 메시지 객체에 `choiceDropdownId`를
  실어서 푸시하면, `js/04g-core-app-upload-utils-2.js`의 `_renderGanttQaMessages`가 그 id와
  `window._ganttQaPendingChoiceDropdown.id`가 일치할 때만 드롭다운 카드를 그 메시지 아래 붙여
  그린다(메일 초안/알람 초안 등 기존 "draft 카드" 렌더링과 완전히 동일한 패턴 — 새 렌더링 체계를
  만들지 않고 기존 것에 한 줄 추가).
- **⚠️ 핵심 설계 원칙 — 선택값을 처리하는 새 로직을 절대 따로 만들지 않는다**: 드롭다운은 순전히
  "입력 방식"만 바꾸는 것이지 "처리 로직"을 바꾸는 게 아니다. 사람이 선택을 마치면
  `buildAnswerText(selections)`가 **사람이 직접 타이핑했을 법한 문자열**(예: 목적이면 그냥
  `"P04"`, 임시코드면 `"2번은 900201"`)을 합성해 `#gantt-qa-input`에 넣고 `sendGanttQaMessage()`
  를 그대로 호출한다 — 그러면 그 문자열을 해석하는 **기존** 단계별 파서(코드 정규화, 유효성 검사,
  `correctionNote` AI 재추출 등)가 아무 수정 없이 그대로 받아 처리한다. 이 방식 덕분에 드롭다운을
  추가하면서 기존 자유 텍스트 입력 경로를 하나도 건드리지 않았고(둘 다 계속 동작함 — 드롭다운은
  그냥 더 쉬운 대안일 뿐), 향후 파서 쪽 버그 수정/기능 추가도 드롭다운 유무와 무관하게 한 곳만
  고치면 된다.
- **단일 선택 vs 여러 항목 각각 선택**: `draft.multi`로 구분.
  - **단일**(예: 목적) — `<select onchange="...">`가 바뀌자마자 바로 제출(별도 확인 버튼 없음).
  - **복수**(예: 여러 품목에 각각 임시코드가 필요한 경우) — 항목별로 드롭다운을 하나씩 나열하고
    맨 아래 "✅ 선택 완료" 버튼으로 한 번에 제출. **일부만 골라도 제출 가능** —
    `buildAnswerText`가 비어있는(선택 안 한) 항목은 건너뛰고 고른 것만 텍스트로 합성하므로,
    "2번은 900201"처럼 일부만 답해도 정상 처리되고, 아직 안 고른 항목은 (기존 로직이 이미 그렇게
    설계돼 있으므로) 다음 턴에 똑같은 방식으로 다시 드롭다운으로 물어보게 된다 — 별도 처리 불필요.
- **검증**: 브라우저에서 `sendGanttQaMessage()`를 직접 호출해 목적 선택(단일)과 임시코드 선택
  (복수, 일부만 선택)을 모두 왕복 확인함 — 드롭다운 렌더링 → 선택 → 합성된 텍스트가 실제로
  `#gantt-qa-input`에 들어가는지 → 기존 단계별 파서가 정확히 처리하는지(draft 필드 갱신, 다음
  단계로 진행)까지 전부 확인.
- **앞으로 새 객관식 질문을 추가할 때**: 정해진 목록(표)이 있는 질문이면 처음부터 이 헬퍼로 만들
  것 — 나중에 "왜 이건 드롭다운이고 저건 텍스트냐"는 일관성 문제가 생기지 않도록.
- **🐛🐛 [2026-09-16 실사용 제보로 수정] "이미 하드코딩된 객관식은 전부 드롭다운" 원칙이
  BOM 옵션 질문(전개 방식/Show price/Location Information)엔 적용이 안 돼 있었다** — 사용자가
  "502572 BOM 열어줘"를 실행했더니 여전히 `"단일 레벨, 가격 표시, 위치 정보 안 함"`처럼 직접
  타이핑해야 하는 자유 텍스트로 물어보는 걸 보고 "드롭다운으로 하기로 했는데 아직도 응답식"이라고
  지적함 — 이 질문은 2026-09-15에 옵션 사전질문 기능 자체가 처음 생길 때 만들어져서, 하루 뒤
  (2026-09-16)에 생긴 드롭다운 원칙이 소급 적용이 안 된 채 남아있던 것.
  - **왜 기존 드롭다운 헬퍼로 바로 못 옮겼는지**: 기존 `multi:true` 드롭다운(PO 임시코드 선택)은
    **모든 항목이 같은 선택지 표를 공유**하는 걸 전제로 설계돼 있었다(`draft.options` 하나를
    모든 `<select>`가 재사용) — BOM 옵션은 3개 질문의 선택지가 서로 달라서(전개 방식은 단일/
    다중, 나머지 둘은 예/아니오) 그대로는 못 썼다. **수정**: `_ganttQaRenderChoiceDropdownHtml`의
    multi 렌더링을 확장해 각 `items[i]`가 자기만의 `options`를 가질 수 있게 하고(없으면 기존처럼
    `draft.options`를 공유 — PO 임시코드처럼 기존에 항목마다 같은 표를 쓰던 용도는 코드 변경 없이
    그대로 동작), `window._ganttQaShowBomOptionsDropdown(materials)`가 이 형태로 3개 항목(전개
    방식: 단일/다중, Show price: 예/아니오, Location Information: 예/아니오)을 만든다.
    `buildAnswerText`가 합성하는 문자열은 기존 자유 텍스트 예시("단일 레벨, 가격 표시, 위치
    정보 안 함")와 정확히 같은 패턴이라 **`_ganttQaParseBomOptionReply` 파서는 전혀 안 건드림**
    (드롭다운은 입력 방식만 바꾸고 처리 로직은 그대로 재사용한다는 기존 원칙 그대로 유지).
  - **김에 같이 고침**: 같은 BOM 흐름 안에 있던 또 다른 2択 질문("자재가 여러 개인데 단일
    조회를 말씀하셨는데 어느 트랜잭션(ZPP033/ZPP038)을 쓸지")도 자유 텍스트였던 걸 발견해서
    `window._ganttQaShowBomTcodeDropdown(materialsCount)`로 같이 드롭다운화함 — 한 기능 안에서
    "이 질문은 드롭다운, 저 질문은 텍스트"로 절반만 바뀐 채 남는 걸 방지.
  - **검증**: 브라우저에서 전체 왕복 확인 — ① "502572 BOM 열어줘" → 옵션 드롭다운(3항목, 각자
    다른 선택지) 표시 → 셀렉트 3개 선택 후 "선택 완료" 클릭 → 합성된 텍스트("단일 레벨, 가격
    표시, 위치 정보 안 함")가 정확히 기존 파서가 기대하는 패턴인지, `_ganttQaBomResolvedOptions`
    가 올바른 값(explosion/showPrice/showLocation/useSingleTcode)으로 채워지는지 확인. ②
    "502572,502573 단일 BOM 보여줘"(자재 2개+단일 워딩 충돌) → 단일/복수 드롭다운 표시 → "단일"
    선택 → 옵션 드롭다운으로 정상 진행하는지 확인. ③ 기존 PO 임시코드 다중 드롭다운(항목마다
    같은 선택지 공유)이 이 변경으로 회귀하지 않았는지(옵션 목록이 여전히 13개 전부 나오는지)
    별도 확인 — 셋 다 정상.
  - **앞으로 이 헬퍼로 "항목마다 선택지가 다른" 객관식 질문을 만들 때**: `items[i].options`에
    그 항목만의 선택지 배열을 넣으면 되고, 생략하면 기존처럼 `draft.options`를 공유한다 — 이
    분기를 몰랐다면 다시 이런 절반짜리 변환이 생길 수 있으니 참고할 것.

### ✅ AI 문답 확인성 질문 — "확인/저장해줘/취소" 같은 짧은 답도 클릭으로 (2026-09-16 신규, 사용자 요청)

**위 "🔽 객관식 질문 — 드롭다운" 원칙은 "정해진 표/목록에서 하나를 고르는" 질문용이다 — "확인",
"저장해줘", "취소", "다시 시도"처럼 매번 다른 짧은 확인성 문구를 기대하는 질문(표가 아니라
1~3개짜리 즉석 선택지)은 드롭다운이 아니라 클릭 버튼으로 답할 수 있게 할 것.** 사용자가 PO
품목 확인 단계(`"확인"이라고 답해주세요`)를 구체적 예시로 들며 "확인, 저장해줘, 보내줘, 기타...
클릭해서 대답하는 방식으로 해달라"고 요청 — 대안으로 "다음 턴 예상 답변을 흐린 글씨로 입력창에
미리 채워두고 오른쪽 화살표로 활성화" 방식도 제시했으나, textarea에 "타이핑한 것처럼 안 보이는
회색 고스트 텍스트"를 올리려면 별도 오버레이 레이어(폰트 메트릭 정합, 한글 IME 조합 중 커서
위치 등)가 필요해 훨씬 복잡하고 깨지기 쉽다고 판단 — **이미 메일/공지/알람/Gantt수정 초안이
쓰고 있던 "이대로 [보내기/등록/적용]" + "취소" 클릭 버튼 패턴을 그대로 재사용하는 쪽을 택함**
(사용자도 "뭐든 쉬운 방법으로"라고 확인).

- **구현**: `js/04h-core-app-upload-utils-3.js`의 `window._ganttQaPendingConfirmButtons`
  (드롭다운의 `_ganttQaPendingChoiceDropdown`과 완전히 같은 "지금 떠 있는 것" 싱글턴 패턴) +
  `window._ganttQaRenderConfirmButtonsHtml(draft)`(메일 초안 버튼과 동일한 시각 스타일 —
  `style:'confirm'`=초록/`'cancel'`=회색/`'neutral'`=하늘색) + `window._ganttQaSubmitConfirmButton
  (id, value)`(클릭한 버튼의 `value`를 입력창에 채우고 기존 `sendGanttQaMessage()`를 그대로
  호출) + `window._ganttQaShowConfirmButtons(text, buttons)`(호출부가 매번 id를 직접 안 만들어도
  되게 하는 공용 헬퍼 — `text`와 `buttons:[{label,value,style}]`만 넘기면 draft 등록 +
  `confirmButtonsId`를 실은 히스토리 푸시까지 한 번에 처리). 메시지 객체에 `confirmButtonsId`를
  실으면 `js/04g-core-app-upload-utils-2.js`의 `_renderGanttQaMessages`가 그 id와
  `window._ganttQaPendingConfirmButtons.id`가 일치할 때만 버튼을 그 메시지 아래 붙여 그린다
  (mailDraftHtml/alarmDraftHtml 등 기존 draft 카드 렌더링과 완전히 동일한 패턴 — 새 렌더링
  체계를 만들지 않고 기존 것에 한 줄 추가).
- **⚠️ 핵심 설계 원칙 — 드롭다운과 동일**: 버튼은 순전히 "입력 방식"만 바꾸는 것이지 "처리
  로직"을 바꾸는 게 아니다. 버튼을 누르면 그 버튼의 `value` 문자열(사람이 직접 타이핑했을
  법한 짧은 문구, 예: `"확인"`/`"저장해줘"`/`"취소"`/`"다시 시도"`)을 입력창에 넣고 기존
  `sendGanttQaMessage()`를 그대로 호출한다 — 그러면 그 문자열을 해석하는 **기존** 단계별
  파서(정규식 매칭 등)가 아무 수정 없이 그대로 받아 처리한다. **자유 텍스트 입력은 버튼과
  무관하게 항상 그대로 가능**(PO 품목 확인처럼 정정이 필요한 경우 "확인" 버튼 옆에 여전히
  직접 타이핑할 수 있음 — 버튼은 "추가"이지 "대체"가 아님).
- **적용된 곳**: PO 품목 확인(`confirm_items`, "✅ 확인" 1버튼 — 정정은 여전히 자유 텍스트),
  PO SAP 저장 확인(`confirm_sap_prepare`, "💾 저장해줘"/"❌ 취소"), PO SAP 준비 실패
  (`sap_prep_failed`, 백엔드 구버전/일반 실패 둘 다 "🔁 다시 시도"/"❌ 취소" — 값 정정은
  여전히 자유 텍스트로 가능), SAP 문서 "출력" 모호성 해소(`_ganttQaSapDocClarify`, "💾
  저장(다운로드)"/"📋 목록만 보기"). **메일/공지/알람/Gantt수정 초안은 이미 이 버튼 패턴이
  있었으므로 손댈 필요 없음** — 이번 작업은 그 패턴을 SAP/구매오더 쪽까지 넓힌 것뿐.
- **🐛 [2026-09-16 실사용 대비 수정] 버튼에 영문 레이블을 달면서 발견한 기존 i18n 공백**:
  SAP 문서 모호성 해소의 `wantsSave`/`wantsList` 판정 정규식(`/(저장|다운로드)/`,
  `/(목록|보여|출력)/`)이 원래 한국어 키워드만 인식해서, 영문 모드 사용자가 자유 텍스트로
  "save"라고 타이핑해도 애초에 인식이 안 되던 잠재 버그가 있었다 — 버튼이 영문 레이블일 때
  `value`도 영문("save"/"show list")이라 이 경로를 훨씬 더 자주 타게 되면서 드러남. 정규식을
  `/(저장|다운로드|save|download)/i`·`/(목록|보여|출력|list|show)/i`로 넓혀서 같이 고침(다른
  버튼들의 값-매칭 정규식은 미리 확인해보니 이미 한/영 둘 다 지원하고 있어서 손댈 필요 없었음
  — 예: `confirm_items`의 `/^(확인|네|맞아|맞습니다|ok|okay|confirm|yes)\b/i`).
- **검증**: 브라우저에서 전체 왕복 확인 — ① PO 품목 확인 메시지를 실제로 띄우고 "✅ 확인"
  버튼을 클릭해 "확인" 문자열이 합성되어 `sendGanttQaMessage()`가 호출되고 기존 파서(임시코드
  누락 확인 등)가 정상 이어받는지 확인, ② SAP 문서 모호성 확인 버튼("📋 목록만 보기")을
  클릭해 "목록 보여줘"가 합성되고 `wantsList=true`/`wantsSave=false`로 정확히 판정되는지 확인
  — 둘 다 정상.
- **앞으로 새 확인성 질문을 추가할 때**: "이 질문이 표/목록에서 고르는 것인가(→ 드롭다운),
  아니면 그때그때 다른 짧은 확인 문구를 기대하는 것인가(→ 이 버튼 패턴)"부터 판단할 것 — 후자인데
  자유 텍스트만 남겨두면 이번처럼 "왜 이건 클릭이고 저건 타이핑이냐"는 일관성 문제가 재발한다.

### 🛑 AI 문답 전역 중단(인터럽트)/붙여넣기 이어하기/일괄 적용 (2026-09-16 신규, 사용자 요청)

사용자가 실제로 PO(구매오더) "목적" 질문 단계(`ask_purpose`)에서 무한루프에 갇힌 실사용 대화를
그대로 붙여넣어 제보함 — "처음부터 다시해요"/"처음부터 다시"/"다시"/"잉"/"아오"를 순서대로
시도했는데도 매번 "목적 코드를 못 알아들었어요 — P01처럼 코드로 답해주세요"만 무한 반복됐다.
원인 조사 결과 `confirm_items`/`sap_prep_failed` 등 **일부 단계만** 개별적으로 취소/재시도
키워드를 인식하고 있었고, `ask_project`/`ask_buyer`/`ask_reason`/`ask_purpose`는 **탈출구 자체가
아예 없었다** — 새 단계를 추가할 때마다 그 단계에 취소 인식을 깜빡하기 쉬운 구조였던 것.
요청은 3가지: ① 어느 draft/단계에 있든 "처음부터 다시"류로 즉시 중단할 수 있는 전역 인터럽트,
② 이전 AI 응답 등을 복사 붙여넣기만 해도 그 맥락을 이어서 처리, ③ "임시코드는 모두 900201로
적용해줘"류 일괄 적용.

- **① 전역 인터럽트 가드(`INTERRUPT_RE`)**: `js/04h-core-app-upload-utils-3.js`의
  `sendGanttQaMessage` 맨 앞(PO draft 처리 블록보다도 먼저)에서, 지금 활성화된 draft/드롭다운/
  확인버튼 상태가 **하나라도** 있고(`_ganttQaPoDraft`/`_ganttQaBomDraft`/`_ganttQaApprovalDraft`/
  `_ganttQaSapDocClarify`/`_ganttQaPendingChoiceDropdown`/`_ganttQaPendingConfirmButtons`) 그
  메시지가 "처음부터 (다시)"/"취소"/"그만"/"중단"/"초기화"/"리셋"/cancel/reset/restart/start over
  중 하나와 **정확히 일치**(공백·문장부호만 허용)하면, 이 상태를 전부 `null`로 초기화하고 "🛑
  진행 중이던 작업을 중단했습니다" 메시지를 띄운 뒤 즉시 `return`한다 — 어떤 draft가 무엇을
  기대하고 있었든 상관없이 공통으로 동작. **정확히 일치해야만 매치**되도록 좁힌 이유(기존
  `sap_prep_failed`의 "다시 시도" 정규식과 같은 안전장치): "이 프로젝트 취소됐어?"처럼 긴
  문장 안에 "취소"가 섞인 정상적인 질문까지 오인하지 않기 위함 — 실사용 테스트로 확인
  (`window._ganttQaExtractPastedPoContext` 등 다른 판정과 마찬가지로, draft가 하나도 없으면
  이 정규식 자체가 관여하지 않고 그냥 일반 AI 대화로 흘려보낸다). `ask_purpose`의 "couldn't
  understand" 폴백 메시지에도 "(그만두려면 '취소'라고 답해주세요)"를 추가해 탈출구가 있다는
  걸 사람이 알 수 있게 함.
- **② 붙여넣기 이어하기**: `window._ganttQaExtractPastedPoContext(text)` — draft/첨부가 전혀
  없는 상태에서, 40자 이상 + PO 문서 특유 키워드(사업자등록번호/공급자/공급받는자/세금계산서/
  거래명세서/견적서/품목/Invoice/Vendor) + 숫자 2자리 이상이 같이 있으면 "붙여넣은 PO 텍스트"로
  판정한다. 매치되면 `[{name:'(붙여넣은 텍스트)', text: question}]`라는 **가짜 첨부**로 감싸서
  기존 PDF 첨부 추출 경로(`_ganttQaExtractPoItemsViaAi`)를 그대로 재사용 — 새 fetch/파싱 로직을
  전혀 만들지 않음(이 세션 전체의 "드롭다운/버튼은 입력 방식만 바꾸고 처리 로직은 그대로
  재사용한다" 원칙과 동일한 정신을 여기선 "첨부 대신 붙여넣기"로 확장 적용한 것). PDF를 다시
  올릴 필요 없이 이전 AI 답변(품목 확인 요약 등)이나 원본 문서 텍스트를 그대로 복사해 붙여넣기만
  하면 새 추출이 시작된다. **이미 draft가 진행 중이거나 파일이 첨부돼 있으면 이 경로는 관여하지
  않음**(첨부가 항상 최우선이라는 기존 규칙 그대로 유지) — 지금은 PO 흐름에만 연결돼 있고, 다른
  draft(승인원 표지/BOM 등)로 확장하려면 각 draft에 맞는 마커 키워드로 별도 판정 함수를 추가할 것.
- **③ 일괄 적용(임시코드 드롭다운 확장)**: `js/04h-core-app-upload-utils-3.js`의 `tempDropdownId`
  다중 드롭다운(`confirm_items` 단계에서 임시코드가 비어있는 품목들을 물어보는 곳)에 품목이
  2개 이상이면 맨 위에 "🔁 전체 품목에 동일 코드 적용" 행을 추가로 넣는다(같은 임시코드 13개
  선택지 공유). 이 행에서 코드를 고르면 `buildAnswerText`가 개별 선택은 전부 무시하고
  `"임시코드는 모두 ${code}로 적용해줘"`를 합성해 기존 `correctionNote` → AI 재추출 경로로
  그대로 흘려보낸다(새 파싱 로직 없음 — 드롭다운은 입력 방식만 바꾼다는 원칙 그대로). 아무것도
  안 고르면 기존처럼 품목별 개별 선택(`"N번은 코드"`)으로 폴백. **자유 텍스트로 "임시코드는
  모두 900201로 적용해줘"라고 직접 타이핑해도 이미 정상 동작**한다 — `correctionNote`가 있을 때
  `_ganttQaExtractPoItemsViaAi`가 이전 추출 결과 + 정정 지시를 AI에게 그대로 다시 맡기는
  구조라(별도 정규식 파서가 없는 자유서술 재추출) 새 파싱 코드가 전혀 필요 없었음 — 드롭다운은
  그 경로로 가는 지름길 하나를 추가한 것뿐.
- **검증**: 브라우저에서 `sendGanttQaMessage()`를 직접 호출해 ① `ask_purpose` 단계에서 "처음부터
  다시" → 모든 draft/드롭다운/버튼 상태가 `null`로 정리되고 중단 메시지가 뜨는지, ②
  `ask_project`/`ask_reason` 단계에서 "취소"가 포함된 긴 문장("취소하고 싶은데 어떻게
  해야하나요")은 인터럽트가 오발동하지 않고 그 단계의 정상 처리로 흘러가는지, ③ `confirm_items`
  단계에서 임시코드 없는 품목 2개 → 드롭다운에 마스터 행이 맨 위로 추가되는지 → 마스터 행만
  선택 시 일괄 적용 문구가 합성되는지 → 품목 1개일 땐 마스터 행이 안 생기는지(기존 동작 회귀
  없음), ④ draft/첨부가 없는 상태에서 PO스러운 텍스트(사업자등록번호/공급자/품목/숫자 포함, 40자
  이상)를 붙여넣으면 가짜 첨부로 감싸져 기존 추출 파이프라인이 그대로 타는지(추출 함수에 실제로
  전달된 첨부 텍스트 확인) — 전부 모킹 테스트로 확인 완료.

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
- **⚠️⚠️ [2026-09-16 실사용 제보로 수정] 저장 경로를 `C:\SAP_DMS`로 통일 — "엑셀로 내보내줘"만
  유일하게 브라우저 Downloads 폴더에 떨어지고 있었다**: 사용자가 "SAP 관련 저장 경로는
  C:\SAP_DMS로 통일해줘"라고 요청해서 grep으로 전수 확인함 — 승인원 표지(`C:\SAP_DMS\
  승인원표지\`)/구매오더(`C:\SAP_DMS\구매오더\`)/ZDMSR004 배치 다운로드(`C:\SAP_DMS\<자재번호>_
  <문서번호>\`)는 전부 이미 통일돼 있었고, **이 "엑셀로 내보내줘" 경로 하나만** `XLSX.writeFile`로
  브라우저 다운로드를 직접 트리거해서(서버가 저장 경로를 모름) 실제로는 브라우저 기본 다운로드
  폴더(대부분 `%USERPROFILE%\Downloads`)에 떨어지고 있었다 — 그래서 "해당 폴더로 이동하시겠
  습니까?"라고 매번 되물어야 했던 것(위 2026-09-15 항목). **수정**: `_exportSapDataToExcel`이
  더 이상 `XLSX.writeFile`로 다운로드를 트리거하지 않고, `XLSX.write(wb, {type:'base64',
  bookType:'xlsx'})`로 base64 인코딩된 바이너리만 `{fileName, base64}` 형태로 반환한다 —
  호출부(`sendGanttQaMessage`의 엑셀 내보내기 블록)가 이걸 새 백엔드 엔드포인트
  `kortek_backend.py`의 `POST /sap-save-export`(`{fileName, dataBase64}`)로 보내면, 서버가
  base64를 디코드해 `C:\SAP_DMS\SAP조회\`에 직접 써서 나머지 SAP 기능들과 저장 위치를
  통일했다. **"해당 폴더로 이동하시겠습니까?" 되묻기 흐름 전체를 제거함**(`_ganttQaOpenFolderConfirm`
  상태 변수, 그 처리 블록, `/open-downloads-folder` 엔드포인트 다 같이 삭제) — 이제 서버가
  저장 경로를 정확히 알고 있으므로 다른 SAP 기능들처럼 저장 즉시 자동으로 폴더를 여는 것으로
  단순화(더 이상 애매한 "브라우저 기본 다운로드 폴더"를 추측할 필요가 없어짐). **검증**: 브라우저에서
  `_exportSapDataToExcel`을 직접 호출해 반환값이 `{fileName, base64}` 형태이고 base64가 실제
  XLSX(ZIP) 바이너리 시그니처(`PK..`)로 시작하는지 확인, 다운로드가 트리거되지 않는지(콘솔에
  다운로드 관련 이벤트 없음) 확인함 — 백엔드가 꺼진 상태라 실제 `/sap-save-export` 왕복(파일이
  진짜 `C:\SAP_DMS\SAP조회\`에 써지는지)은 다음 실사용 시 확인 필요. **앞으로 새 SAP 관련
  내보내기/저장 기능을 추가할 때는 절대 `XLSX.writeFile`/`<a download>` 같은 브라우저 직접
  다운로드를 쓰지 말 것** — 항상 백엔드로 데이터를 보내 `C:\SAP_DMS\` 아래 전용 폴더에 쓰는
  패턴(base64 POST 또는 서버가 SAP GUI에서 직접 쓰는 방식)을 재사용해야 저장 위치가 계속
  통일된 상태로 유지된다.
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
  3. **엑셀 내보내기 후 "해당 폴더로 이동하시겠습니까?" — ⚠️ [2026-09-16 갱신] 이 문단은
     더 이상 유효하지 않음**: 원래는 브라우저 XLSX.js 다운로드라 서버가 저장 경로를 몰라서
     매번 이동 여부를 되물어야 했는데, "SAP 관련 저장 경로는 C:\SAP_DMS로 통일해줘"라는
     요청으로 이 되묻기 흐름(`_ganttQaOpenFolderConfirm`/`/open-downloads-folder`) 자체를
     완전히 제거했다 — 지금은 서버(`/sap-save-export`)가 `C:\SAP_DMS\SAP조회\`에 직접 저장
     하고 자동으로 폴더를 여는 것으로 단순화됨. 자세한 내용은 아래 "🐛🐛 저장 경로를
     C:\SAP_DMS로 통일" 절 참고.
  4. **⚠️⚠️ [2026-09-16 신규, 사용자 요청] ALV 레이아웃 강제 고정 — "SAP ID를 공용으로 쓰는데
     팀원이 레이아웃을 바꾸면 원하는 컬럼을 못 받는다"**: 사용자가 ZPP033 결과 화면에서
     "레이아웃 선택" 팝업을 직접 캡처(자기 레이아웃 `/STD_MC`가 "기본 세팅"으로 체크된
     화면)해서 "이걸로 항상 조회하게 하드코딩할 수 있냐"고 요청 — 라이브 진단으로 실제 SAP
     세션에 접속해 메커니즘을 확인함: ALV 그리드 툴바 함수코드 `&MB_VARIANT`("레이아웃
     선택")를 `grid.PressToolbarButton('&MB_VARIANT')`로 누르면 회사 공용(전역, 이름이 전부
     `/`로 시작) 레이아웃 목록 팝업이 뜨고, 그 안의 자체 그리드(`VARIANT`/`TEXT`/`DEFAULT`
     3컬럼)에서 원하는 행을 **`DoubleClick(row, 'VARIANT')`**(⚠️ `DoubleClickCell`이 아님 —
     이 팝업 그리드의 실제 멤버 이름은 `DoubleClick`, `dir()`로 직접 확인해서 알아냄)하면
     즉시 팝업이 닫히고 메인 그리드 컬럼이 그 레이아웃으로 바뀐다. **실사용 검증**: `/CH_1`로
     일부러 바꿔서 "팀원이 레이아웃을 바꾼" 상황을 재현한 뒤, 실제 `fetch_bom()` 함수를
     그대로 호출해 — 강제 적용 없이는 그 바뀐 컬럼이 그대로 나왔을 상황에서 — 결과가 정확히
     `/STD_MC`의 컬럼 구성(`IDNRK/OJTXP/MMSTA/MENGE/MMEIN/WGBEZ60`)으로 돌아오는 것까지
     end-to-end로 확인함. **구현**: 새 상수 `_BOM_LAYOUT_VARIANT = '/STD_MC'`(이름만 바꾸면
     바로 다른 레이아웃으로 전환됨) + 새 헬퍼 `_sap_select_alv_layout(session, grid,
     variant_name)` — `fetch_bom`이 `_navigate_to_bom_screen` 직후, 결과를 읽기(`_sap_dump_
     screen_body`) 전에 항상 호출한다. **⚠️ ZPP038(복수 자재)은 별도 레이아웃 카탈로그를
     쓴다** — 같은 진단으로 확인해보니 ZPP038엔 `/STD_MC`가 아예 없음(23건 중 없음, ZPP033은
     56건 중에 있음) — 그래서 `_sap_select_alv_layout`은 **찾는 이름이 카탈로그에 없으면
     예외 없이 조용히 `False`를 반환하고 지금 화면을 그대로 두는 방어적 설계**다(강제
     레이아웃은 "있으면 좋은" 보조 기능이지, 없다고 조회 자체를 막을 이유가 아님) — 지금은
     ZPP033(단일 자재) 조회에서만 실제로 적용되고, ZPP038(복수)은 조용히 건너뛴다. **앞으로
     ZPP038에도 고정 레이아웃이 필요해지면**: 그 화면에 맞는 전역 레이아웃 이름을 별도로
     확인해서(같은 방식으로 `&MB_VARIANT` 팝업을 라이브로 열어 목록 확인) 새 상수(예:
     `_BOM_MULTI_LAYOUT_VARIANT`)를 추가하고 `fetch_bom`에서 `used_single` 여부로 분기해서
     맞는 이름을 넘길 것 — 지금은 사용자가 실제로 캡처해서 보여준 화면(ZPP033)만 커버함.
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
  - **🐛🐛 [2026-09-16 실사용 버그수정] 다운로드된 폴더가 문서번호(DOKNR)로만 이름 붙어서
    6자리 자재번호와 전혀 매칭이 안 되고, 같은 자재가 문서번호만 다르게 여러 건("내역(1)(2)")
    일 때 뭐가 뭔지 알 수 없던 문제** — 와일드카드 패턴 다운로드로 9건을 받은 사용자가
    "C:\SAP_DMS\" 캡처를 보여주며 "폴더 이름이 문서번호라 6자리 코드와 매칭도 안되고
    내역(1)(2)도 모르니 처음 질문의 의도와는 다르게 된다"고 제보 — 실제로 원래 반환
    메시지("자재별 하위 폴더 자동 생성")는 사실이 아니었다. 라이브 진단으로 ZDMSR004 결과
    그리드(`wnd[0]/shellcont/shell`)가 실제로는 GuiGridView이고 `MATNR`/`DOKNR` 등 기술
    필드명으로 `GetCellValue(row, '필드명')`가 정상 동작함을 확인함(표시 컬럼 제목은 SAP GUI
    Scripting의 한글 인코딩 버그로 깨지지만, 기술 필드명은 멀쩡함 — 위 "ALV 그리드 한글이
    깨진다" 절과 같은 패턴). **수정**: `download_documents_batch`가 "전체 선택 + 다운로드"
    버튼을 누르기 **직전에** 그리드를 먼저 읽어 `문서번호(DOKNR)→자재번호(MATNR)` 매핑을
    확보해두고(그리드는 다음 조회에서 초기화되므로 이 타이밍이 필수), 다운로드 완료 후 로컬
    파일시스템에서 각 `C:\SAP_DMS\<문서번호>` 폴더를 `C:\SAP_DMS\<자재번호>_<문서번호>`로
    `os.rename` — SAP ABAP 리포트 자체가 폴더명을 문서번호로 고정해서 만들기 때문에(SAP
    쪽에서 자재번호로 직접 짓게 할 방법이 없음) 다운로드 후 로컬에서 후처리하는 방식을
    택함. 이미 그 이름의 폴더가 있으면 건드리지 않아 재실행해도 안전(idempotent, 격리된
    테스트로 확인). 같은 자재가 문서번호만 다른 여러 건이면 전부 같은 자재번호 접두사를
    공유하므로 "내역(1)(2)" 혼동도 자연히 해소된다(예: 자재 129181이 문서 2건이면
    `129181_P01202500591`/`129181_P01202500975`로 둘 다 자재 129181 것임이 바로 보임).
    이름 변경이 실패해도(권한 문제 등) 응답 메시지에 "자재번호: 문서번호" 매핑 텍스트를
    그대로 담아 최소한의 추적성은 보장한다(벨트 앤 서스펜더스). `download_documents_by_pattern`
    (와일드카드 패턴 경로)은 각 청크의 `renamedFolders`를 모아 패턴 검색으로 이미 알고 있는
    자재내역(desc)까지 붙여서 "자재번호(내역) → 폴더명" 형태의 사람이 바로 읽을 수 있는
    요약을 채팅 응답에 포함시킨다. **검증**: ① 라이브로 사용자의 실제 9개 자재(*06+06*200*
    매치분)에 대해 ZDMSR004를 다시 조회해(재다운로드 없이 그리드 읽기만) 문서번호→자재번호
    매핑 9건을 전부 확보(자재 129915는 P01 문서 자체가 없어 매핑에서 빠짐 — 데이터 자체의
    사실이지 버그 아님), 사용자가 이미 다운로드해둔 실제 9개 폴더에 그대로 적용해 전부
    `<자재번호>_<문서번호>` 형태로 성공적으로 이름 변경함(예: `114246_P01201700540`,
    `129181_P01202500591`/`129181_P01202500975`). ② 순수 Python 격리 테스트로 이름 변경
    로직 자체(신규 생성 + 재실행 시 멱등성)를 별도 검증. 프런트(`js/04h`)는 두 경로 모두
    이미 `data.message`를 그대로 채팅에 표시하는 구조라 별도 프런트 수정은 불필요했음.
- **자재내역 와일드카드 패턴으로 조회된 자재 전부 승인원(P01) 다운로드
  ("*01+01*500*로 조회된 아이템 승인원 다운로드해줘", 2026-09-16 신규)**: 사용자가 SAP GUI
  매크로("디스크립션 검색.vbs")를 주며 요청 — 매크로 자체는 ZMM009 화면의 자재(MATNR)
  "복수 선택" 팝업 안에서 F4로 자재 검색도움말(SAPLSDH4, "M: 자재 번호/자재 내역" 탭)을
  열어 와일드카드로 검색한 뒤, 결과에서 원하는 항목을 **더블클릭으로 하나씩** 골라 담는
  방식이었다(여러 건을 한 번에 뽑는 방법이 아니라, 사람이 결과를 보면서 3건을 수동으로
  고른 기록). **2026-09-16 실사용 라이브 진단(`py -3-32`로 사용자의 실제 SAP 세션에 직접
  접속)으로 매크로보다 훨씬 단순한 경로를 확인함**:
  1. **ZMM009 자체가 필요 없다** — 이 검색도움말은 MATNR 데이터 요소에 붙은 SAP 표준
     검색도움말이라, ZMM009의 "복수 선택" 팝업을 거칠 필요 없이 **MM60("자재 목록
     표시")의 평범한 단일값 자재번호 필드(`ctxtMS_MATNR-LOW`)에서 F4만 눌러도 완전히
     동일한 팝업이 뜬다.** 그 덕분에 ZMM009가 요구하는 필수 입력 3개(플랜트/판매조직/
     유통경로)를 전혀 거칠 필요가 없다 — MM60도 실행(F8)까지 할 필요 없이 이 팝업을
     여는 용도로만 쓰고 바로 취소(F12)한다.
     **⚠️⚠️ 실사용 함정(진단 중 실제로 겪음)**: ZMM009로 진입해서 이 경로를 시도했을 때는
     "모든 필수 입력 필드에 값을 입력하십시오" 오류가 반복됐다 — 매크로가 하듯 플랜트를
     F4로 "빈 값 확정" 처리해도 실제로는 그 필드가 여전히 진짜로 비어 있어 통과가 안 됐다
     (다른 회사 SAP 구성/버전 차이로 추정, 매크로가 기록된 환경과 100% 같지 않을 수 있음).
     플랜트에 실제 값("1000")을 넣으니 바로 통과됨 — 그런데 이 값 자체가 아예 필요 없는
     MM60 경로로 전환하면서 이 문제 자체가 사라짐. **트랜잭션 코드에 항상 `/n` 접두사를
     붙일 것** — 매크로 원본처럼 접두사 없이 `okcd`에 트랜잭션 코드만 넣으면(다른 트랜잭션
     안에 이미 들어가 있는 상태에서는) 전환이 안 되고 조용히 그 자리에 머무른다(진단 중
     이 실수로 첫 시도가 실패함 — 이 코드베이스의 다른 모든 nav 함수가 `/n` 접두사를 쓰는
     이유와 동일).
  2. **결과 화면은 GuiGridView가 아니라 "라벨 매트릭스"**(`_sap_find_grid`/
     `_sap_find_shell_any` 둘 다 실패로 확인) — 하지만 구조가 아주 규칙적이다: 매치
     1건이 컬럼 하나에 대응하고(`lbl[44,col]`=자재번호, `lbl[1,col]`=자재내역,
     `lbl[39,col]`=언어), col은 3부터 시작해 매치 개수만큼 이어진다(col=3이 1번째 매치,
     col=4가 2번째...). 팝업 제목(`wnd[1].Text`) 자체에도 "자재 번호 N 엔트리"로 건수가
     그대로 나온다. **매크로처럼 더블클릭으로 하나씩 고를 필요가 없다** — 그냥
     `lbl[44,3]`부터 `lbl[44,N+2]`까지 순서대로 `.Text`만 읽으면 전체 매치를 한 번에
     추출할 수 있고, 아무것도 "채택"(복사)할 필요 없이 취소(F12)로 닫으면 된다(ZMM009를
     실행할 필요가 없으므로 SELECT-OPTIONS에 값을 채워 넣는 것 자체가 아예 불필요).
     실제 라이브 테스트: `*01+01*500*` → 2건(115505/114347), `*01+01*150*`(매크로 원본
     패턴) → 4건(129305/108918/124887/114347) — 둘 다 정확히 추출 성공함.
  3. **버튼 확인**: 결과 화면의 툴바 버튼은 `복사(Enter)`/`값 제한(Shift+F5)`/`개인
     리스트에 삽입(F6)`/`찾기(Ctrl+F)`/`취소(F12)`뿐 — "전체 선택" 같은 버튼은 없다.
     하지만 위 2번처럼 애초에 "선택"이 필요 없으므로(읽기만 하면 됨) 문제되지 않는다.
  4. **⚠️ 매치가 아주 많을 때(수십~수백 건) 라벨 매트릭스가 전부 컨트롤로 존재하는지는
     미검증** — 테스트한 두 패턴은 각각 2건/4건뿐이라 컬럼을 끝까지 다 읽는 데 문제가
     없었지만, SAP 검색도움말은 보통 "최대 조회 건수" 제한(수백 건 단위)이 있고 그 경우
     화면에 경고나 절단이 있을 수 있다 — 매치가 아주 많은 패턴에서 문제가 보이면
     `resolve_materials_by_description_pattern`(아래)의 컬럼 순회 로직부터 의심할 것.
  - **구현**: `sap_bridge_32.py`의 `resolve_materials_by_description_pattern(pattern,
    max_results=200)` — MM60 진입 → 자재번호 필드 F4 → TAB001에 패턴 입력 → 실행 →
    `_sap_read_material_label_matrix(session, max_results)`(아래 버그수정 항목 참고)로
    라벨 매트릭스를 row=3부터 연속 2회 실패할 때까지 순회해 `{matnr, desc}` 목록 추출 →
    취소(F12)로 팝업 닫기. `max_results`는 UX 요구사항이 아니라(사용자가
    "건수가 많아도 그냥 다운로드"를 선택함, 2026-09-16 — 아래 참고) 패턴이 사실상 전체
    자재를 매치하는 극단적인 경우(예: `*` 단독)에 무한정 순회하며 멈추지 않는 사고를
    막는 기술적 안전장치일 뿐이다. `download_documents_by_pattern(pattern, doc_type='P01')`
    이 이 함수로 자재 목록을 구한 뒤, **이미 검증된 `download_documents_batch`를 그대로
    재사용**해 7개씩 묶어(ZDMSR004 "복수 선택" 팝업의 실사용 검증 한계와 동일한 크기)
    순차 호출한다 — 8개 이상 스크롤 코드는 있지만 미검증이라는 위 항목의 제약을 새
    코드가 다시 밟지 않도록, 처음부터 검증된 크기 안에서만 동작하게 설계함(느리지만 안전).
  - **🐛🐛 [2026-09-16 실사용 버그수정] 자재번호 열 위치(`lbl[44,row]`)가 하드코딩돼 있어서,
    자재내역이 긴(=검색 결과 화면의 열 너비가 넓어지는) 패턴에서는 매치가 실제로 있는데도
    "매치되는 자재가 없습니다"로 조용히 실패하던 버그** — 사용자가 "*06+06*200*로 조회된
    아이템 P01 문서 다운로드해줘"를 실행했더니 0건으로 실패했는데, 곧이어 SAP 화면에서
    직접 조회한 결과(9건: 129915/114246/129181/114182/101967/130054/121667/121572/118776)를
    캡처해서 "이거 매치되는 게 있는데 왜 못 찾냐"고 제보 — 실제로 버그였음이 확인됨.
    **원인**: 이 라벨 매트릭스 화면(`lbl[열,행]` GuiLabel들)의 열 위치는 **고정값이 아니라
    결과 자재내역 텍스트의 폭에 따라 화면마다 달라진다** — 처음 발견 당시(2026-09-15)
    테스트했던 두 패턴(`*01+01*500*`→2건, `*01+01*150*`→4건)은 자재내역이 비교적 짧아
    자재번호 열이 우연히 44번이었을 뿐, 이번처럼 자재내역이 긴 매치(예: `HN BTB>06+06,
    0200,#28,HD05+YH47,V1,LB01`)가 섞이면 SAP이 열 너비를 넓게 재배치해서 자재번호가
    46번 열로 두 칸 밀린다(라이브 진단으로 정확히 확인 — 팝업 제목은 "자재 번호 9 엔트리"로
    정확히 9건을 알려주고 있었는데도, 44번 열에서 `row=3`부터 연속 2회 못 찾자마자 포기해
    조용히 빈 배열을 반환하고 있었다). **수정**: 새 헬퍼 `_sap_read_material_label_matrix
    (session, max_results)` — 열 번호를 하드코딩하지 않고, **매번 헤더 행(row=1)의 GuiLabel
    텍스트("자재"/"자재내역")를 직접 읽어 그 열 위치를 동적으로 찾아낸 뒤** 그 위치로 데이터
    행(row=3부터)을 순회한다. 라이브로 수정 전/후를 비교 검증함: 수정 전엔 `*06+06*200*`이
    0건, 수정 후엔 정확히 9건(사용자가 캡처해준 것과 자재번호·자재내역 전부 1:1 일치) —
    기존에 검증돼 있던 `*01+01*500*`(2건)/`*01+01*150*`(4건)도 재실행해 회귀 없음을 확인함.
    **앞으로 이런 "화면을 한 번 진단해서 얻은 고정 좌표/컬럼 번호"를 다른 SAP 자동화에
    쓸 때는, 그 좌표가 콘텐츠 폭에 따라 정말 고정인지 의심할 것** — 한두 건의 짧은 테스트
    데이터로 "발견한" 좌표가 항상 맞으리라는 보장이 없다(이번처럼 텍스트가 길어지면 밀릴 수
    있음). 가능하면 이번처럼 화면 자체에 있는 헤더/라벨 텍스트를 근거로 위치를 동적으로
    찾아내는 방식이 더 견고하다.
  - **UX 결정(2026-09-16, 사용자 확인)**: 와일드카드 패턴이 매치하는 건수가 많아도(예:
    15건 이상) 확인 없이 그냥 바로 다운로드하도록 선택함 — 기존 "133012, 133010 문서
    다운로드해줘"류 배치 다운로드와 동일한 무확인 실행 UX를 유지. (대안으로 "건수/목록을
    먼저 보여주고 확인받기"도 제시했으나 채택 안 함.)
  - **백엔드**: `kortek_backend.py`의
    `/sap-download-documents-by-pattern?pattern=...&type=P01`(GET) — `_run_sap_bridge`로
    `download_documents_by_pattern`을 호출, 타임아웃 240초(패턴 검색 + 다운로드 둘 다
    포함하므로 자재 수 미상 상태에서 넉넉히 잡음 — 매치가 아주 많으면 늘려야 할 수 있음).
  - **프런트**: `js/04h`의 `_ganttQaExtractSapPatternDownloadRequest` — 공백으로 나눈
    토큰 중 `*`가 포함된 것을 패턴으로 추출("+" 등 다른 특수문자는 그대로 패턴에 포함,
    SAP 자체가 그 문자를 리터럴로 해석하므로 이스케이프 불필요) + "문서/파일/승인원" +
    "열어/다운로드/저장/받아"류 동사로 트리거. 패턴에 `*`가 있다는 것 자체가 이미 충분히
    구체적인 신호라 "SAP" 단어 없이도 인식(이 프로젝트의 기존 관례). `sendGanttQaMessage`
    에서 자재번호 나열 기반 배치 다운로드(`sapBatchReq`)보다 먼저 체크 — 패턴 앵커(`*`)가
    자재번호 목록과 겹칠 일이 없어 순서 문제로 인한 오판정 위험은 낮지만, "더 구체적인
    요청을 먼저 확인"하는 기존 순서 원칙을 그대로 따름. 브라우저 모킹으로 전체 왕복(트리거
    판정 4종 케이스 + `sendGanttQaMessage` 실제 호출로 인코딩된 URL과 히스토리 확인)을
    검증함 — 실제 SAP 세션에서는 자재번호 추출 단계(라이브 진단)까지만 검증했고, 그 뒤의
    다운로드 청크 반복 호출 자체는 아직 실사용 미검증.
  - **와일드카드 "*" 누락 시 사용법 안내(2026-09-16 신규, 사용자 요청)**: "01+01+150
    아이템 승인원 다운로드해줘"처럼 패턴 검색을 하려는 게 분명해 보이는데(자재내역 코드
    특유의 "+"로 이어진 조각이 있음) `*`를 빼먹으면, 원래는 `_ganttQaExtractSapPatternDownloadRequest`가
    조용히 null을 반환해 아무 반응 없이 다른 로컬 명령/일반 AI 대화로 새어나갈 위험이
    있었다(이 코드베이스가 반복해온 "당연히 될 줄 알았는데 안 된다" 버그 패턴과 동일).
    새 `window._ganttQaExtractSapPatternDownloadHint(question)`가 이 상황(문서/파일/승인원
    +다운로드류 동사+`+`로 이어진 코드 조각은 있는데 `*`는 없고, 이미 자재번호가 2개 이상
    명시된 정상 배치 다운로드 요청도 아닌 경우)을 감지해, AI 호출 없이 즉시
    `*01+01*150*로 조회된 아이템 승인원 다운로드해줘` 같은 예시와 함께 "*를 포함해서
    말씀해주세요"라고 안내한다 — 상태를 남기지 않는 1회성 안내라 사람이 `*`를 넣어 다시
    물으면 기존 정상 트리거가 그대로 처리한다. `sendGanttQaMessage`에서 `sapPatternReq`
    (정상 트리거) 블록 바로 다음, 배치 다운로드 판정보다 먼저 체크 — 브라우저 모킹으로
    "`*` 없음→안내 표시", "`*` 있음→기존처럼 정상 처리(회귀 없음)" 둘 다 확인함.
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
  - **🔽 [2026-09-17 실사용 제보로 수정] "드롭다운/클릭이 안 되어 있다" — 필수 항목 안내가
    전부 자유 텍스트 한 덩어리였다**: 위 "🔽 AI 문답 객관식 질문 — 드롭다운" 원칙(정해진
    목록에서 고르는 질문은 항상 드롭다운)이 이 기능의 "출력 형식(엑셀/워드/둘 다)"/"가승인원
    여부(정식승인원/가승인원)" 두 항목엔 처음부터 적용이 안 돼 있었다 — 담당자/팀장 이름은
    정해진 목록이 없어 애초에 드롭다운 대상이 아니지만, 저 두 개는 명백한 고정 선택지인데도
    "아래 항목이 더 필요합니다" 안내문 안에 텍스트 불릿으로만 나열되고 있었다. **수정**:
    `sendGanttQaMessage`의 `missing.length` 분기에서, 아직 안 정해진 항목 중 `format`/
    `isPre`만 골라 BOM 옵션 드롭다운과 동일한 "항목마다 다른 선택지" 멀티 드롭다운
    (`window._ganttQaPendingChoiceDropdown`, 항목별 `options` — 출력형식은 엑셀/워드/둘 다,
    가승인원 여부는 정식승인원/가승인원)으로 바꾸고, 담당자/팀장 이름만 안내문에 텍스트로
    남긴다. 드롭다운 선택 결과는 `"엑셀, 정식승인원"`처럼 기존
    `_ganttQaExtractApprovalUpdate`의 키워드 매칭이 그대로 이해하는 문자열로 합성되므로
    파서는 전혀 안 건드림(드롭다운은 입력 방식만 바꾼다는 원칙 그대로) — 일부만 선택해도
    제출 가능하고(예: 출력형식만 고르고 가승인원 여부는 비워두면), 남은 항목은 다음 턴에
    같은 방식으로 다시 드롭다운으로 물어본다(기존 PO 임시코드 드롭다운의 "일부만 선택" 동작과
    동일). **검증**: 브라우저에서 트리거 → 드롭다운(2항목) 렌더링 확인 → 둘 다 선택 후
    이름과 함께 전송 → `_ganttQaApprovalDraft`가 전부 채워진 채 `/sap-approval-fetch`까지
    정상 호출되는지 확인 → 하나만 선택했을 때 나머지 하나만 다시 드롭다운으로 재요청하는지도
    확인함.
- **품목 내역 조회 — "123456 품목 내역 보여줘"류, 항상 품목/품목2 둘 다 출력(2026-09-16 신규,
  사용자 요청)**: 사용자가 6자리 자재번호(복수 가능)를 주며 "품목 내역"을 물으면, SAP에서는
  이 "품목"(자재내역)이 실제로 **두 필드로 나뉘어 있다** — MM03 메인 화면의 자재내역
  (`MAKT-MAKTX`)은 **딱 40자까지만** 담기고, 실제 이름이 40자를 넘으면 나머지가 "추가 데이터
  → 기본 데이터 텍스트"(`tabpZU05`) 장문 텍스트에 이어서 들어간다. 사용자가 이걸 실제 SAP
  화면 캡처 2장으로 직접 확인해줌: 자재 132931의 MAKTX는 `"GLASS CHEM>320,-,STELLATPR,
  727X433.8,3T="`로 딱 40자에서 끊겨 있고, "기본 데이터 텍스트" 탭에 `", BLK, -, ASF, -"`로
  이어짐 — 그리고 ZMM009 같은 다중조회 화면에서는 이 두 값이 그리드 컬럼
  `"자재내역(KO)"`/`"자재내역2(KO)"`로 나란히 노출되는 것도 확인됨(같은 자재 같은 값이
  두 화면에서 1:1로 일치). **즉 "품목2"는 새로 조회할 SAP 데이터가 아니라, "승인원 표지"
  기능이 이미 자재마다 읽고 있던 바로 그 두 값**(`desc`=MAKTX/`sub`=장문 텍스트)이다 —
  그래서 새 SAP 자동화를 전혀 추가하지 않고, 이미 라이브 검증된
  `fetch_approval_info`/`_approval_read_one_material`(자재마다 MM03 진입 → MAKTX 읽기 →
  `wnd.sendVKey(30)`으로 "추가 데이터" 화면 진입 → `tabpZU05` 선택 → 장문 텍스트 읽기, 최대
  30개)와 그걸 감싼 백엔드 `GET /sap-approval-fetch?materials=...`를 **그대로 재사용**한다
  (백엔드/`sap_bridge_32.py` 변경 전혀 없음 — 프런트에 로컬 명령 하나만 추가).
  - **트리거**: `js/04h`의 `window._ganttQaExtractMaterialInfoRequest(question)` — 자재번호
    (5~8자리, 쉼표/공백 구분 다중 가능) + `("품목"|"자재")` + `("내역"|"정보"|"설명")` 조합으로
    판정. 문서 열기/목록/배치 다운로드 판정들은 전부 `"문서"|"파일"` 키워드를 요구하는데 이
    명령은 그 키워드를 아예 안 쓰므로 겹칠 일이 없어(브라우저에서 실측 확인) 그 판정들보다
    먼저 체크해도 안전 — `sendGanttQaMessage`에서 배치 다운로드 판정 바로 앞에 배치함.
    "SAP" 단어는 요구하지 않음(자재번호+품목/내역 조합 자체가 이미 충분히 구체적).
  - **⚠️ "승인원 표지 생성" 여러 턴 draft(`window._ganttQaApprovalDraft`)와는 완전히 무관한
    별개의 1회성 조회 명령**이라는 점을 혼동하지 말 것 — 담당자/팀장/가승인원 여부 같은
    걸 전혀 안 물어보고, 자재번호만 있으면 곧바로 SAP를 조회해서 결과를 보여주고 끝난다.
    백엔드 엔드포인트만 공유할 뿐 프런트 로직은 완전히 독립적임.
  - **응답 형식**: 자재마다 `📦 자재번호 / 품목: ... / 품목2: ...`를 줄바꿈으로 나열, 여러
    자재면 빈 줄로 구분. 품목2가 비어있으면(40자 이내라 이어질 내용이 없는 자재) `(없음)`으로
    표시 — 항상 두 줄 다 보여줘서 "기본적으로 2개 품목 모두 출력해줘"라는 요청을 그대로
    따름. 조회 실패한 자재는 그 자재만 `⚠️ 조회 실패: ...`로 표시하고 나머지는 정상 표시
    (백엔드가 이미 자재별로 `ok`/`err`를 따로 반환하므로 그대로 활용).
  - **검증**: 브라우저에서 `fetch`를 모킹해 (1) 단일 자재, (2) 자재 3개(성공 2건+실패 1건
    섞임, 품목2가 빈 자재 포함) 양쪽 왕복을 확인함 — 요청 URL에 자재번호가 정확히 실리는지,
    응답의 품목/품목2/에러가 전부 올바르게 렌더링되는지, 문서 열기/배치 다운로드 판정과
    오탐 충돌이 없는지(`_ganttQaExtractSapBatchDownloadRequest('123456 품목 내역 보여줘')`가
    `null`을 반환함을 직접 확인)까지 전부 확인함. 실제 SAP 세션에서는 이미 승인원 표지
    기능으로 검증된 동일 파이프라인을 그대로 타므로 별도 라이브 검증은 하지 않음.
  - **🆕 [2026-09-17 신규, 사용자 요청] 자재번호+전체 내역을 탭(TAB)으로 합친 줄도 같이
    출력 — 엑셀에 바로 붙여넣기 위한 용도**: 사용자가 "6자리 숫자와 내역 사이에 tab key
    넣어서 합친 것도 보여줘"라고 요청하며 원하는 정확한 출력 예시를 직접 줌(자재 2건).
    `js/04h`의 응답 조립부에 `📦 자재번호\t합친내역` 줄을 기존 `품목:`/`품목2:` 줄 **앞에**
    추가로 붙인다(기존 두 줄은 그대로 유지 — "합친 것도" 보여달라는 요청이라 대체가 아니라
    추가). **합친내역 계산 시 품목(desc)의 끝 "=" 문자를 제거하고 이어붙임** — MAKTX가 SAP
    원본에서 40자로 끊길 때 끝에 "="가 남는 관례(위 절 도입부 참고)가 있는데, 이건 실제
    내용이 아니라 SAP의 연속 표시 문자라 그대로 이어붙이면 "...USB=,N"처럼 없어야 할 "="가
    중간에 낀다 — 사용자가 준 두 예시(133025/133026, 둘 다 desc가 "="로 끝남) 모두 이
    "=" 제거 로직으로 정확히 재현됨을 직접 대조해 확인함. 품목2가 비어있는 자재는(=원래
    40자를 안 넘겨 desc에 "="가 없는 경우) "=" 제거 없이 desc를 그대로 씀(불필요한 치환
    생략).
  - **🐛 [2026-09-17 실사용 버그수정] 탭 문자가 채팅창 렌더링에서 스페이스로 뭉개지는
    문제 — 화면 표시뿐 아니라 실제 복사(클립보드)에도 영향을 줄 수 있어 엑셀 붙여넣기
    목적 자체가 무산될 뻔함**: AI 문답 메시지는 `js/04g`의 `_mdToHtml`이 줄마다
    `<div style="margin-bottom:2px;">`로 감싸는데, 이 div들이 전부 기본값
    `white-space:normal`이라 탭 문자가 스페이스 하나로 시각적으로 뭉개진다 — 브라우저가
    "렌더링된 대로" 복사하는 경향이 있어, 이 상태로 두면 사용자가 채팅창에서 복사해
    엑셀에 붙였을 때도 탭이 아니라 스페이스로 붙어 2개 열로 안 나뉘었을 가능성이 높다.
    **수정**: `_mdToHtml`이 줄을 렌더링할 때 그 줄에 탭 문자(`\t`)가 포함돼 있으면(지금은
    이 품목 내역 기능만 탭을 씀 — 오탐 위험 낮음) 해당 줄의 `<div>`에만
    `white-space:pre-wrap`을 추가로 줘서 탭을 보존한다(`pre`가 아니라 `pre-wrap`을 쓴
    이유: 긴 줄은 여전히 자동 줄바꿈되게 하기 위함). 탭이 없는 나머지 모든 줄(이 앱 AI
    문답의 절대다수)은 기존 `white-space:normal` 그대로라 다른 메시지 레이아웃에 영향
    없음 — 브라우저에서 실제 렌더링된 DOM의 `getComputedStyle(...).whiteSpace`를 직접
    읽어, 탭 있는 줄만 `pre-wrap`이고 탭 없는 줄(예: "품목: ...")은 여전히 `normal`임을
    확인함. **앞으로 AI 문답 응답에 탭/여러 칸 스페이스처럼 "정확한 공백 보존"이 필요한
    내용을 또 넣을 일이 있으면, 전체 메시지의 white-space를 바꾸지 말고 이 패턴(그 줄에만
    조건부로 `pre-wrap` 부여)을 재사용할 것** — 메시지 전체를 `pre-wrap`으로 바꾸면
    기존 문단/글머리 기호 레이아웃(줄바꿈 간격 등)이 광범위하게 달라질 위험이 있다.
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

**⚠️ [2026-09-17 갱신] 이 문단은 더 이상 유효하지 않음 — 아래 "🔁 세금계산서/거래명세서
복수 처리 + 완전 자동화" 절 참고.** 원래 "저장 직전 확인 후 정지"로 설계했던 이유(이 세션의
SAP 연동 중 유일하게 실제 재무적 커밋을 자동화하는 기능이라 신중해야 한다는 판단)는 여전히
유효한 배경 설명이지만, 2026-09-17에 사용자가 "SAP 입력 시간이 기니까 처음 한 번만 확인하고
이후는 전부 자동으로, 자리를 비웠다 와도 다 되어있도록" 해달라고 명시적으로 요청해서 이
결정 자체를 뒤집었다 — **지금은 문서(품목) 확인 + 공용 4항목(프로젝트코드/사번/요청사유/
목적) 확인 딱 한 번만 거치면, 그 이후(엑셀 생성~SAP 업로드~저장~발주서 출력)는 문서마다
다시 묻지 않고 전부 자동으로 진행된다.** 앞으로 이 기능을 다시 손볼 때 "사람 확인 후 정지"로
되돌리라는 요청이 없는 한 이 자동화 결정을 임의로 되돌리지 말 것 — 이미 검토 후 명시적으로
결정된 방향이다(단, 이번엔 반대 방향으로 뒤집힌 결정이니 혼동하지 말 것).

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
- **첨부 UI**: `js/04h`의 `openGanttQaModal`에 "첨부파일" 버튼(2026-09-16부터 아이콘이 아닌
  2줄 텍스트 라벨, 초록 파스텔톤 — 사용자 요청으로 UI 변경, 대화삭제/음성문답과 나란히
  배치) + 숨겨진 `<input type="file" accept=".pdf" multiple>` + 미리보기 칩 스트립
  (`#gantt-qa-attach-strip`) 추가. 실제 파일 처리 로직은 `window._ganttQaProcessAttachedFiles
  (fileList)`로 공용화되어 있어, 버튼 클릭(`_ganttQaHandleFileSelect`)과 **드래그앤드롭
  (2026-09-16 신규, 사용자 요청)** 둘 다 이 함수를 재사용한다 — 모달 박스 전체
  (`#gantt-qa-box`)에 `ondragover`/`ondragleave`/`ondrop`을 걸어 어디에 놓아도 받고,
  드래그 중엔 초록 점선 테두리로 시각 표시한다(`_ganttQaHandleDragOver/DragLeave/Drop`).
  **🐛 [2026-09-16 실사용 버그수정] `stopPropagation()`이 빠져서 이 모달에 놓은 파일이
  `js/04f-core-app-upload-utils-1.js`의 페이지 전체 window 레벨 `"drop"` 리스너(엑셀
  드래그 시 "프로젝트 로드"로 처리하는 기존 기능)까지 새어 들어가, PDF를 놓아도 "구글
  드라이브 팀 비밀번호 미동기화" 같은 그 기능의 안내 팝업이 뜨는 사고가 있었다 — `22d`/
  `22e`(Panel 데이터시트/Elec Parts 드롭존)가 이미 같은 이유로 `stopPropagation()`을
  쓰고 있던 것과 동일한 함정. 세 핸들러(dragover/dragleave/drop) 전부에 추가해서 고침.
  **앞으로 이 앱에 새 드롭존을 추가할 때는 항상 `stopPropagation()`을 같이 넣을 것** —
  이 페이지엔 이미 전역 드롭 리스너가 있어서, 지역 드롭존이 이걸 빼먹으면 매번 같은
  버그가 재발한다.
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
  - **🐛🐛 [2026-09-16 실사용 재확인] "공급자 쪽만 쓸 것" 지시만으로는 부족했다 — 근본
    원인은 라벨 자체가 세로쓰기(한 글자씩 세로로 쌓인 좁은 라벨 칸)라 PDF 텍스트
    추출에서 글자가 깨져 흩어진다는 것** — 거래명세서 문서를 실제로 다시 추출해보면
    "공급자"/"공급받는자" 라벨이 "공 급 받 는 자"처럼 한 줄에 붙어 나오거나, "급"
    한 글자만 엉뚱한 회사명 옆에 끼어 나오는 등 — 위에서 고친 y좌표 묶기+x좌표 정렬
    (표 형태 데이터 행에는 잘 통함)로도 **세로 라벨은 여전히 못 고친다**(한 글자씩
    y좌표가 다 다르게 찍혀서 각자 별도의 "줄"이 되어버림 — 표 셀처럼 "같은 y = 같은
    줄"이 아니라 "같은 x = 같은 라벨"인 정반대 구조라 지금 로직으로는 원천적으로 못
    잡음, 별도의 세로쓰기 감지 로직이 필요한데 아직 없음). **실질적 해결**: 라벨
    텍스트를 더 정교하게 파싱하려 하는 대신, **이 회사(코텍)가 항상 구매자라는
    사실 자체를 프롬프트에 하드코딩**함 — "'(주)코텍'/'주식회사 코텍' 또는
    '130-81-44628'이 보이면 그건 100% 우리 회사(공급받는자)이니 절대 bizRegNo/
    vendorName에 쓰지 말고 문서의 다른 쪽 회사 정보를 쓸 것"을 라벨 판별보다 우선하는
    규칙으로 추가 — 라벨이 깨져도 "코텍"이라는 이름/번호 자체는 텍스트로는 온전히
    남아있어(세로쓰기로 흩어지는 건 라벨 칸의 개별 글자들이지, 실제 회사명/번호
    데이터 칸은 보통 가로쓰기라 이 문제가 없음) 훨씬 안정적인 판별 근거가 된다.
    **이 코텍 하드코딩 규칙은 앞으로도 유지할 것** — 이 앱은 항상 "코텍이 구매하는"
    용도로만 쓰이므로 이 가정이 깨질 일이 없다.
  - **🐛🐛 [2026-09-16 실사용 버그수정] 프롬프트 지시만으로는 부족 — AI가 코텍 하드코딩
    규칙조차 무시하고 코텍(130-81-44628)을 협력사로 뽑아버리는 사고가 실제로 재발함**
    (사업자등록번호 1308144628, 공급자 "(주) 코텍"으로 추출됨). 프롬프트만 믿지 않고
    **코드 레벨 검증**을 추가함: `_ganttQaExtractPoItemsViaAi`가 파싱한 `bizRegNo`가
    코텍 자기 번호(`1308144628`, 하이픈 제거 기준)와 같으면, 첨부 원문 전체에서 정규식
    (`\d{3}-?\d{2}-?\d{5}`)으로 다른 사업자등록번호를 직접 찾아 자동으로 대체하고
    (vendorName에 "코텍"이 남아있으면 그것도 비움), `note`에 자동 정정했다는 경고를
    남긴다 — 못 찾으면 bizRegNo/vendorName을 아예 비우고 사람이 채우게 한다. 또한
    `confirm_items` 단계에서 "확인" 답변을 받아도 **bizRegNo가 10자리 숫자가 아니면
    (비어있거나 이상하면) 무조건 재확인을 요청**하도록 게이트를 추가함 — SAP 협력사
    검색이 실패할 게 뻔한 상태로 다음 단계(엑셀 생성~SAP 업로드)까지 진행되는 걸 막는다.
  - **🐛🐛 [2026-09-16 실사용 버그수정] SAP 준비(prepare) 단계 실패 시 draft를 통째로
    버려서 처음부터 다시 해야 했던 문제** — "SAP에서 뭔가 시도하다 멈추면 처음으로
    돌아가서 트랜잭션 코드를 입력하고 다시 시도해야 하는데 못하고 있음"이라는 제보로
    확인. 실제로는: 첫 시도가 실패(예: 잘못된 사업자등록번호로 SAP 협력사 검색 실패)하면
    원래 `window._ganttQaPoDraft = null`로 draft를 통째로 지워버려서, 사용자가 올바른
    번호를 알려줘도("사업자 등록번호는 2168144558") 이미 draft가 없어 일반 AI 채팅으로
    새서 "다시 진행하겠습니다"라고 대답만 하고 실제로는 아무 것도 재시도하지 않는
    사고가 있었다. **수정**: 엑셀 생성+SAP 업로드 로직을 `window.
    _ganttQaRunPoSapPrepareAndReport(pd)` 공용 함수로 뽑아서, 실패해도 draft를 유지한
    채 `sap_prep_failed` 단계로 넘어가게 바꿈 — 이 단계에서 새 사업자등록번호를 말하면
    (`\d{3}-?\d{2}-?\d{5}` 또는 순수 10자리 패턴 인식) `pd.bizRegNo`만 바꿔서 자동
    재시도하고, "다시 시도"라고만 해도 같은 값으로 재시도하며, "취소"라고 하면 그제서야
    draft를 정리한다 — PDF 재첨부·프로젝트코드/사번/요청사유/목적 재입력이 전혀 필요
    없다. 브라우저에서 모킹으로 "1차 실패→사업자등록번호 정정→2차 성공" 전체 왕복을
    확인함.
  - **🐛 [2026-09-16 실사용 버그수정] SAP GUI 쪽 — 실패한 시도가 남긴 팝업이 다음 재시도를
    막던 문제** — 위 draft 유지 수정과 짝을 이루는 SAP 쪽 수정: 협력사 검색이 실패하면
    "검색 결과 없음"류 팝업(wnd[1])이 열린 채로 남는데, 그 상태에서 그냥
    `prepare_po_from_excel`을 다시 호출하면 새 트랜잭션 진입(`okcd` 텍스트 설정) 자체가
    막혀버리는 것으로 추정됨(팝업이 모달이라 wnd[0]에 대한 입력이 씹힘). 새 헬퍼
    `_sap_close_stray_popups(session)`를 `prepare_po_from_excel` 맨 앞에서 호출해
    wnd[1]부터 위로 열려있는 창을 전부 `Close()`(안 되면 F12로 폴백)로 정리한 뒤 진행
    하도록 수정 — 닫을 게 없으면 조용히 통과하므로 정상 흐름엔 영향 없음. **이 함수는
    아직 라이브 미검증**(코드 로직만 작성 — 다음 실사용 실패 재현 시 확인 필요).
  - **⚠️ [2026-09-15 사용자 요청] tempCode는 확신 없으면 AI가 추측하지 말고 반드시
    사람에게 물어보게 변경** — 원래 프롬프트는 "확신 없으면 가장 근접한 것을 고르되,
    정말 안 되면 빈 문자열"이라고 지시했는데, 이 "가장 근접한 것을 고르라"는 지시 자체가
    AI를 늘 뭔가 채워넣게 만들어서, "CABLE ASSY"나 순수 품번(part number)처럼 13개
    분류 중 어디에도 명확히 안 맞는 품목도 그럴듯하게 코드가 채워져 나왔다 — 사용자가
    "품목명만으로는 임시코드 판단이 어려우니 물어봐야 할 것 같다"고 직접 요청해서, 지시를
    "품목명에 분류를 짐작할 명확한 단서(Panel/LCM/PCB/TSP/Glass/Frame/포장 등)가 있을
    때만 채우고, 품번만 있거나 애매하면 절대 추측하지 말고 빈 문자열로 남길 것"으로
    강화함. `sendGanttQaMessage`의 `confirm_items` 단계에서 빈 문자열(또는 표에 없는
    값)인 품목이 하나라도 있으면 그 품목 번호+품명 목록과 임시코드 표를 다시 보여주며
    직접 지정해달라고 요청 — "2번은 900201"처럼 개별 지정도, "2~5번은 900302"처럼
    구간 일괄 지정도 자유서술로 받아 AI 재추출 경로(`correctionNote`)로 그대로 흘려보낸다
    (별도 파싱 로직 불필요 — 기존 정정 흐름 재사용).
  - **✅ [2026-09-15 실사용 재확인] PDF 텍스트 추출(위 `_pcExtractPdfText` y/x 정렬 수정)
    자체는 완벽하게 동작함이 실제 파일로 재검증됨** — 사용자가 "거래명세서만 넣었는데
    1개만 나옴"이라고 제보해서, 그 실제 파일(거래명세서 1페이지 + 견적서 2페이지, 11개
    품목)을 정적 서버로 직접 서빙해 `_pcExtractPdfText`를 브라우저에서 실행해봤더니
    11개 품목이 PART NO/규격/주문수량/납품수량/주문잔량/단가/금액까지 전부 정확한 순서로
    깔끔하게 추출됨을 확인함 — **즉 텍스트 추출 문제가 아니라 AI 프롬프트 해석 문제였다.**
    처음 넣었던 "같은 품목이 문서 안에 두 번 이상 나올 수 있다 — 한 번만 셀 것"이라는
    중복 방지 지시를 AI가 과잉 해석해서(페이지 2개를 "같은 표의 반복"으로 보고 11개
    품목 전체를 "하나의 반복 그룹"으로 뭉뚱그렸을 가능성) 1건으로 줄여버린 것으로 추정.
    **수정**: 지시를 "여러 페이지/표 중 가장 분명하고 구조화된 표 하나(보통 첫 페이지)만
    기준으로 삼고, 그 표 안의 품목은 빠짐없이 다 넣을 것 — 다른 페이지가 같은 내용을
    반복한 것이면 무시하고, 서로 다른 내용이어도 마찬가지로 첫 페이지만 기준으로 삼을
    것"으로 더 명확하게 재작성 — "기준 표 안에서는 절대 누락 없이 전부"라는 뉘앙스를
    강화함. 또한 JSON 응답에 `"note"` 필드를 추가해 AI가 어떤 페이지를 기준으로 썼는지/
    건너뛴 페이지가 있는지 한 문장으로 남기게 하고, 그 내용을 확인 요약 메시지에
    `ℹ️`로 같이 보여준다("2페이지가 서로 다른 정보면 1페이지만 분석하고 안내해달라"는
    사용자 요청 반영). **이 수정 자체는 실제 AI 호출로는 아직 검증 전**(모킹 테스트로
    note 필드 전달 경로만 확인함) — 다음 실사용 테스트에서 11개 품목이 정확히 나오는지
    확인 필요.
  - **🐛🐛 [2026-09-15 실사용 버그수정] 진행 중이던 draft가 있는 상태에서 새 파일을
    첨부하면 새 파일이 무시되고 "이전 정보만 출력"되던 문제** — "다른 계산서, 거래명세서
    넣어도 이전 정보만 출력함"이라는 제보로 발견. 원인: `sendGanttQaMessage`의 트리거
    분기가 `if (!window._ganttQaPoDraft) { 새로 추출 }`으로 되어있어서, 확인/정정을
    끝내지 않은 draft가 이미 있는 상태에서 새 파일을 첨부해도 "기존 draft 이어서 처리"
    분기로 빠져 새로 첨부된 `_ganttQaPendingAttachments`를 아예 쳐다보지 않았다(그
    배열은 쌓이기만 하고 아무도 소비하지 않는 죽은 상태로 방치됨). **수정**: 판단 기준을
    `!draft` 대신 **"새 첨부가 있는가"**로 바꿔서, 새 첨부가 있으면 기존 draft가 뭐든
    무조건 버리고 새 파일로 다시 시작하도록 변경(첨부 자체가 "이 문서로 다시 하겠다"는
    의사표시라고 판단) — 승인원 표지 등 다른 draft들과 달리 이 draft만 "새 트리거 입력
    (첨부)"이 "이미 진행 중인 대화 상태"보다 항상 우선한다는 점이 특이하니, 이 draft의
    흐름을 다시 손볼 때 반드시 기억할 것.
  - **🐛 [2026-09-15 버그수정] `_ganttQaPoSummaryText`의 임시코드 "매칭 안 됨" 표시가
    영어 모드에서 항상 "(unmatched)"만 나오던 버그** — `it.tempCode || _en ? A : B`가
    연산자 우선순위 때문에 `(it.tempCode || _en) ? A : B`로 해석되어 버그가 됨(괄호
    누락). `codeInfo ? label : (_en ? '(unmatched)' : '(매칭 안 됨)')`로 괄호를 명확히
    해서 고침.
- **⚠️ [2026-09-17 갱신] 여러 턴 draft — 단계 구성이 완전히 바뀜(아래 "🔁 세금계산서/
  거래명세서 복수 처리 + 완전 자동화" 절 참고)**: `window._ganttQaPoDraft`(승인원 표지/BOM
  옵션과 동일한 "대화 내용과 별개인 상태" 패턴)는 이제 문서 1건이 아니라 **`docs` 배열**
  (문서마다 `{bizRegNo, invoiceDate, vendorName, currency, items, note}`)을 담는다. `stage`
  값 순서: `confirm_items`(모든 문서의 추출 결과를 한 번에 확인/정정) → (사업자등록번호가
  없는 문서가 있으면만) `fix_biznos` → (임시코드 미확정 품목이 있으면만) 다시
  `confirm_items`(드롭다운) → `ask_shared`(프로젝트코드/사번/요청사유/목적 4가지를 한
  메시지로 한 번에) → 문서별 엑셀 생성+SAP 업로드+저장+발주서 출력까지 **완전 자동 진행**
  (더 이상 `confirm_sap_prepare`로 멈춰 저장 여부를 묻지 않음). 옛 단계
  `ask_project`/`ask_buyer`/`ask_reason`/`ask_purpose`/`sap_prep_failed`/
  `confirm_sap_prepare`는 전부 삭제됨 — 남아있는 코드나 옛 메모에서 이 이름들을 보면
  구버전 설계를 가리키는 것이니 혼동하지 말 것. **반드시 다른 모든 로컬 명령보다 먼저
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
  작성,출력.vbs`)에서 그대로 가져온 정확한 ID**(추측 아님). ⚠️⚠️ **[2026-09-15 실사용
  버그수정] 협력사/세금코드는 반드시 품목(행)마다 반복해야 한다** — 처음엔 PO당 한 번만
  검색·선택하면 나머지 행에도 자동 적용되는 것으로 가정했는데(매크로가 단일 품목 예시라
  이 가정을 검증 못 하고 넘어감), 실사용에서 품목 4개짜리 PO를 만들어보니 **"현재 셀"
  개념으로 행을 지정하지 않고 `currentCellColumn`만 설정하면 그 시점의 "현재 행"(대체로
  0번)에만 적용되고 나머지 행은 협력사/세금코드가 빈 채로 남는다**는 게 화면 캡처로
  확인됨("공급업체 및 세금코드가 정보가 비어 있음" 제보). **수정**: `grid.currentCellRow
  = idx`로 행까지 명시적으로 지정한 뒤 `pressF4()`하는 것을 품목 수만큼 반복하도록 변경 —
  협력사는 SAP 표준 검색도움말 특성상 "한 번 찾은 결과를 다른 행에 복사"하는 기능이 없어
  매번 사업자등록번호로 다시 검색해야 한다(느리지만 정확성 우선, 품목이 많으면 그만큼
  F4 팝업 왕복이 늘어나 시간이 더 걸림 — 타임아웃 계산 시 감안할 것).
  **💡 [2026-09-16 검토 후 보류] 속도 개선 아이디어 — 사용자가 직접 확인·요청**: 사람이
  SAP에서 직접 이 작업을 할 때는 첫 행만 F4로 검색해 채운 뒤, 그 셀을 Ctrl+C/Ctrl+V로
  복사해서 나머지 행에 붙여넣는다(사용자가 실제로 이렇게 쓰고 있음, 화면 녹화로 확인).
  Ctrl+C/V는 SAP GUI Scripting 자체(`sendVKey`)로는 못 보내지만, PDF 저장 다이얼로그
  자동화에 쓴 `pywinauto`(OS 레벨 키보드 자동화, SAP와 무관한 별도 계층)로는 기술적으로
  가능하다 — 다만 그 앞뒤로 필요한 그리드 셀 다중 선택(`currentCellRow`/`selectedRows`
  조합 등)이 실제로 어떻게 동작하는지 확인된 매크로/라이브 검증이 없어서, 시도하면 PDF
  저장 자동화 때처럼 여러 차례 시행착오가 필요할 가능성이 높다고 판단됨. **사용자가
  "지금은 이대로 두고 나중에 시도해보자"고 명시적으로 결정** — 지금 방식(행마다 F4
  검색 반복)이 느리지만 정상 동작하므로 당장 급한 문제는 아니라고 봄. 나중에 이 최적화를
  다시 검토할 때는 여기서부터 시작할 것(매크로 확보 또는 라이브 진단 먼저 권장 — 이
  코드베이스의 다른 모든 SAP 기능과 같은 방식). ⚠️⚠️ **EPEIN을
  매크로 그대로 "1" 고정값으로 재현** — 정확한 의미(수량이 아니라 납기일수 등 다른
  필드일 가능성, 요청수량은 이미 엑셀의 "요청수량" 컬럼으로 들어가 있어 중복일 수 있음)를
  확인 못 함 — 실사용에서 이상하면 이 값부터 의심할 것.
- **저장 + 발주서 출력**: `confirm_save_po(purchasing_org, plant)` — 사람이 "저장해줘"라고
  답한 뒤에만 호출. 저장(`tbar[1]/btn[5]`) → 확인 팝업 있으면 수락(`wnd[1]/usr/
  btnBUTTON_1`) → 결과 그리드에서 **`grid.currentCellRow = 0`으로 명시적으로 0번 행을
  지정한 뒤** EBELN(오더번호) 셀을 클릭해 상세화면으로 drill-down(⚠️⚠️ [2026-09-15
  실사용 버그수정] 원래는 행 지정 없이 `currentCellColumn`만 설정했는데, 품목이 여러 개일
  때 그 시점에 우연히 "현재 행"이었던 엉뚱한 행을 클릭해 잘못된 값을 읽는 사고가 확인됨
  — "구매오더 번호도 행이 여러 개인 경우라서 그런지 엉뚱한 곳을 복사했음"이라는 사용자
  제보로 발견. 저장된 PO는 모든 행이 같은 오더번호를 공유하므로 항상 0번 행을 읽으면
  됨) → `txtMEPO_TOPLINE-EBELN` 필드에서 오더번호를 읽어 확보 → 뒤로가기 3번(매크로에서 확인된
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
- **통화(KRW/USD) 지원 (2026-09-16 신규)**: "계산서나 거래명세서에 KRW 말고 USD도 있는
  경우가 있는데 이것도 참고할 수 있도록 해달라"는 요청으로 추가 — 지금까지는 모든 PDF가
  KRW라고 암묵적으로 가정하고 있었다. `_ganttQaExtractPoItemsViaAi`의 JSON 스키마에
  `"currency"` 필드를 추가(AI가 "USD"/"US$"/"$" 같은 명확한 표시가 있을 때만 USD로,
  불명확하면 기본값 KRW로 판단하도록 지시) — 파싱 직후 코드 레벨에서 KRW/USD 두 값으로만
  정규화(`toUpperCase()` 후 "USD"/"US$"/"$"가 아니면 전부 KRW로 폴백, AI가 필드를 아예
  빠뜨려도 안전). `window._ganttQaPoDraft`(새 draft 시작·정정 재추출 양쪽 경로 모두)에
  `currency`로 저장되고, `_ganttQaPoSummaryText`가 품목별 단가 옆에 통화를 같이 표시하며
  KRW가 아니면 "⚠️ 통화: USD (KRW가 아닙니다 — 맞는지 확인해주세요)" 줄을 상단에 추가로
  강조 표시함("통화는 USD로 변경" 같은 자유서술 정정도 기존 `correctionNote` 재추출
  경로로 그대로 처리됨 — 별도 파싱 로직 불필요).
  `_ganttQaRunPoSapPrepareAndReport`가 `/po-sap-prepare` 요청 바디에 `currency: pd.currency
  || 'KRW'`를 실어 보내고, `kortek_backend.py`의 `/po-sap-prepare`가 이를 그대로
  `sap_bridge_32.py prepare_po_from_excel`의 6번째 인자로 넘긴다.
  `prepare_po_from_excel(excel_path, biz_reg_no, items, plant='1000', currency='KRW')` —
  그리드의 `WAERS`(통화) 컬럼은 실사용 테스트에서 아무것도 안 건드려도 이미 'KRW'로 자동
  채워지는 것을 확인했으므로(협력사/플랜트 기준 SAP 기본 통화로 추정), **`currency`가
  'KRW'가 아닐 때만** 품목별 단가(NETPR) 입력 루프 안에서 `grid.modifyCell(idx, 'WAERS',
  currency)`로 명시적으로 덮어쓴다 — 기본값(KRW) 경로는 기존에 이미 검증된 동작을 그대로
  유지해 회귀 위험을 최소화하는 설계. **⚠️⚠️ USD 경로(`WAERS` 덮어쓰기)는 아직 실사용
  SAP 세션으로 검증되지 않음** — 브라우저 모킹으로 프런트(추출~요약 표시~SAP 준비 요청
  바디에 currency가 실제로 실리는지)까지는 왕복 확인했지만, SAP GUI에서 `WAERS` 셀에
  직접 값을 넣었을 때 정말로 반영되는지(예: 환율 관련 팝업이 뜨는지, 필드가 read-only는
  아닌지)는 다음에 USD 문서로 실제 구매오더를 시도할 때 확인이 필요하다 — 문제가 생기면
  이 부분부터 의심할 것.
- **⚠️⚠️ [2026-09-16 실사용 버그수정] "Unexpected token '<', <!doctype... is not valid JSON"
  — 백엔드가 오래된 버전(자동시작만 되고 재다운로드/재시작을 한 번도 안 한 PC)일 때
  값 오류로 오인되던 문제**: 사용자가 "자동 시작 프로그램으로 켜져 있고 재다운로드/재시작을
  한 번도 안 한 다른 사용자 PC"에서 테스트하다가, `ask_purpose`까지 전부 정상 진행된 뒤
  `/po-sap-prepare` 호출에서 이 오류가 났다 — `res.json()`이 HTML(404/에러 페이지, 백엔드에
  그 라우트가 없거나 꺼져 있을 때 응답)을 파싱하려다 실패하면서 나는 전형적인 증상인데,
  기존 `sap_prep_failed` 안내 문구가 "사업자등록번호가 잘못됐으면..."이라고만 나와서
  사용자가 실제 원인(백엔드 문제)이 아니라 값 문제로 오인해 같은 사업자등록번호를 여러 번
  재입력하며 계속 같은 오류를 반복해서 만났다. **근본 원인**: 위 "🔄 로컬 백엔드 자동
  업데이트" 절의 설계대로, 자동 업데이트는 파일만 갱신하고 **실행 중인 프로세스는 재시작
  하지 않는다** — 시작프로그램으로 한 번 켜진 뒤 한 번도 사람이 직접 재시작한 적 없는 PC는
  파일이 갱신됐어도 메모리에 로드된 옛 코드(이 기능이 추가되기 전 버전이면 `/po-sap-prepare`
  라우트 자체가 없음)를 계속 서빙한다. **수정**: 새 헬퍼 `window._ganttQaParsePoApiResponse
  (res, stepKo, stepEn)`(`js/04h`)가 응답을 먼저 텍스트로 받아 직접 `JSON.parse`하고, 실패하면
  `err.isBackendStale = true`를 달아 "백엔드가 꺼져 있거나 오래된 버전일 수 있습니다 —
  콘솔을 닫고 kortek_backend.bat을 다시 실행해보세요(자동 업데이트는 재시작을 안 해줍니다)"
  라는 명확한 메시지를 던진다 — `/po-build-excel`/`/po-sap-prepare` 두 호출 모두 이 헬퍼를
  거치도록 교체. `_ganttQaRunPoSapPrepareAndReport`의 catch 블록이 `e.isBackendStale`이면
  "값을 고쳐보라"는 문구를 붙이지 않고 재시작 안내만 보여주도록 분기(값 문제가 아니므로
  섞어서 안내하면 오히려 혼란을 줌) — 브라우저 모킹으로 HTML 응답(404)을 재현해 이 분기가
  정확히 타는 것과, 정상적인 JSON `{ok:false}` SAP 오류일 때는 기존처럼 값-수정 안내가
  나오는 것을 둘 다 확인함.
- **⚠️ [2026-09-17 갱신] 아래 항목은 `sap_prep_failed` 단계 자체가 삭제되면서 더 이상
  적용되지 않음(역사적 기록으로만 남겨둠) — 아래 "🔁 세금계산서/거래명세서 복수 처리 +
  완전 자동화" 절 참고. 지금은 문서별 SAP 준비/저장 실패가 배치 처리 도중 발생하면 그
  자리에서 사람에게 되묻지 않고, 그 문서만 건너뛴 채 나머지 문서를 계속 처리한 뒤 마지막
  요약 메시지에 실패 사유를 남긴다 — 아래에 설명된 "라벨로 값 정정 후 같은 자리에서
  재시도" UX는 더 이상 존재하지 않는다.**
- **🐛🐛 [2026-09-16 실사용 버그수정] `sap_prep_failed` 단계에서 사업자등록번호만 고칠 수
  있었고, "다시" 한 글자만 있어도 무조건 그대로 재시도해버리던 문제**: 위 버그와 같은
  제보에서 발견 — 사용자가 "여기서부터 다시 물어봐줘"(뒤에 목적 질문 문구를 붙여 보냄)라고
  답했는데, 기존 정규식 `/(다시|재시도|retry)/i`가 "다시"라는 부분 문자열만 있으면 무조건
  매치되어 이걸 "그대로 재시도"로 오인하고 조용히 똑같은 값으로 재시도했다 — 원인이
  백엔드 문제였으니 재시도해도 매번 똑같이 실패해서, 사용자에게는 "재시작을 요청해도 안
  된다"는 것처럼 보였다(실제로는 매번 재시도는 되고 있었음). **수정 2가지**: ①
  블라인드 재시도 정규식을 `/^\s*(다시(?:\s*(?:시도|해\s*줘|해\s*봐|해\s*주세요))?|
  재시도(?:해\s*줘|해\s*봐)?|retry)\s*\.?\s*$/i`로 좁혀서, "다시 시도"/"다시"/"재시도"/
  "retry"류 **짧은 문구 전체**일 때만 매치되고 "여기서부터 다시 물어봐줘"처럼 다른 말이
  섞인 긴 문장은 더 이상 걸리지 않게 함(대신 "인식 못함" 안내로 빠져 사람이 원하는 값을
  다시 정확히 말하게 유도). ② 사업자등록번호 외에 **프로젝트코드**("프로젝트코드는 X")·
  **구매담당자 사번**("사번은 X")·**요청사유**("요청사유는 X")·**목적**("목적은 P0X" 또는
  코드 단독 "P0X")·**통화**("통화는 USD")도 같은 단계에서 고칠 수 있게 확장(승인원 표지
  초안의 "라벨 뒤 조사(는/은/가/이) 건너뛰기" 패턴 재사용) — 한 메시지에 여러 필드를
  동시에 고쳐도 됨(예: "요청사유는 샘플제작 목적은 P04"). 목적 설명 문구(예: "유상샘플")로
  고를 때는 **반드시 "목적" 라벨 뒤에서만** 매칭하도록 제한함 — 라벨 없이 전체 텍스트에서
  찾으면 "요청사유는 기타 부품 교체"의 "기타"(P05 설명과 동일 문구)처럼 다른 필드 값과
  우연히 겹쳐 잘못된 목적으로 오인식할 위험이 있어서다(브라우저 테스트로 이 케이스가
  실제로 오작동하지 않는지 확인함). 요청사유 파싱도 lookahead로 다른 라벨(목적/프로젝트
  코드/사번/통화/사업자등록번호) 앞까지만 잡도록 경계를 둬서, 콤마 없이 "요청사유는
  샘플제작 목적은 P04"처럼 이어 써도 뒤 필드까지 요청사유에 먹히지 않게 함. **여전히
  지원 안 하는 것**: "N번 질문부터 다시 물어봐줘"처럼 특정 단계로 되돌아가 그 질문을 다시
  띄워달라는 요청 자체는 처리하지 않음 — 그냥 원하는 값을 라벨과 함께 다시 말하면 된다
  (예: "목적은 P01").

### 🔁 구매오더 요청 — 세금계산서/거래명세서 복수 처리 + 완전 자동화 (2026-09-17 신규, 사용자 요청)

사용자 요청 원문 요지: ① "세금계산서, 거래명세서 복수 처리 가능하게 업그레이드해줘, 반복적인
질문을 한번에 받아서 처리해줘" ② "발주서 출력전에 저장 확인 물어보는것도 자동 저장" ③
"결론은 처음 한번만 확인하고 SAP 입력하는 시간이 기니까 후단은 모두 자동으로 되도록 / 정보
입력해놓고 어디 갔다 오면 다 되어 있도록 / PDF 출력도 이번에 한번 트라이해봐줘". 위 "🛒
구매오더 요청" 절(2026-09-15)에서 확립했던 "저장 직전 확인 후 정지" 설계를 이번에 명시적으로
뒤집었다 — 그 절 상단의 관련 문단에 갱신 표시를 남겨뒀으니 함께 참고할 것.

- **① 세금계산서/거래명세서 복수 처리**: 첨부 파일이 여러 개면 **파일마다 별도 문서**로
  간주해 각각 독립적으로 AI 추출한다(기존 `_ganttQaExtractPoItemsViaAi`를 파일당 1번씩
  `Promise.allSettled`로 병렬 호출하는 새 래퍼 `window._ganttQaExtractPoDocumentsViaAi` —
  파일이 1개면 문서도 1개라 기존 단일 문서 동작과 100% 동일, 회귀 없음). 결과는
  `window._ganttQaPoDraft.docs`(배열, 각 원소가 옛 단일 draft와 같은 모양)에 담긴다. 일부
  파일만 추출에 실패해도 나머지는 정상 진행하고 실패한 파일 이름만 요약에 안내한다.
- **① 배치 요약/정정**: `window._ganttQaPoBatchSummaryText(docs)` — 문서가 2건 이상이면
  각 문서 앞에 "━━━ 문서 N/M ━━━" 구분선을 붙여 한 메시지에 전부 나열하고, "확인/정정"
  안내 문구는 배치 전체에서 딱 한 번만 붙인다(`_ganttQaPoSummaryText(doc, {noInstructions:
  true})`로 문서별 본문만 재사용 — 기존 단일 문서 요약 함수에 `opts.noInstructions` 인자를
  추가해 하위호환 유지). "확인"이 아니면 정정 지시로 간주하는 기존 원칙도 배치 단위로
  확장 — `window._ganttQaExtractPoDocumentsCorrectionViaAi(apiKey, docs, correctionNote)`가
  **문서 배열 전체**를 JSON으로 AI에게 다시 보내 "문서 N"이라는 1부터 시작하는 인덱스
  표현을 이해시키고, 지시에서 명시하지 않은 문서/품목은 그대로 유지하라고 지시한 뒤 전체
  배열을 다시 받는다(별도 파싱 로직 없음 — 기존 "AI 재추출" 원칙 그대로, 스케일만 배열로
  확장).
- **① 임시코드 미확정 품목 드롭다운도 문서 전체에서 일괄 수집**: 기존엔 `pd.items`
  하나였지만, 이제 `window._ganttQaPoFindMissingTempCodeItems(docs)`가 모든 문서의 모든
  품목을 훑어 `{docIdx, itemIdx, it}` 목록으로 평탄화하고, `window._ganttQaPoShowTempCodeDropdown`
  이 라벨을 `"문서번호-품목번호. 품목명"`(예: `"2-1. Item B1"`)으로 붙여 드롭다운에 나열한다
  (품목이 2개 이상이면 기존과 동일하게 맨 위에 "🔁 전체 문서·품목에 동일 코드 적용" 행 추가).
  선택 결과는 `"문서 2의 1번 품목은 900301"`류 문장으로 합성돼 위 배치 정정(AI 재추출)
  경로로 그대로 흘러간다 — 드롭다운은 입력 방식만 바꾼다는 기존 원칙 그대로 유지.
- **① 협력사 사업자등록번호 미확인 문서 처리**: 기존엔 문서 1건 기준으로 "정확한 번호를
  알려주세요"라고만 물었는데, 배치에서는 어느 문서가 문제인지 몰라 헷갈릴 수 있어 새
  `fix_biznos` 단계를 추가 — `window._ganttQaPoFindMissingBizNoDocs(docs)`로 미확인 문서를
  찾아 번호와 함께 나열하고("1번(미확인)"), 답은 `"1번: 2168144558, 3번: 9876543210"`처럼
  문서 번호+값 쌍을 여러 개 한 메시지로 받는다(정규식 `matchAll`). 문서가 1건뿐이면 번호만
  말해도 그 문서에 적용된다(기존 단일 문서 UX 유지).
- **① 반복 질문을 한 번에("ask_shared" 신규 단계)**: 예전엔 프로젝트코드→사번→요청사유→
  목적을 4턴에 걸쳐 하나씩 물었는데, 이제 **모든 문서의 품목 확인이 끝나면 한 메시지로
  4가지를 동시에** 묻는다(`window._ganttQaPoAdvanceAfterItemsConfirmed`가 사업자등록번호
  →임시코드→공용 4항목 순으로 부족한 것부터 확인하고, 마지막에 이 질문을 낸다). 답변 파싱은
  ① 라벨(프로젝트코드/사번/요청사유/목적)을 하나라도 썼으면 라벨 기반으로(승인원 표지 초안의
  "라벨 뒤 조사 건너뛰기" 패턴 재사용) ② 라벨을 전혀 안 쓰고 줄바꿈/쉼표로만 나열했으면
  "줄단위 순서 매칭"으로(역시 승인원 표지 초안과 같은 패턴) 처리한다. 아직 부족한 항목이
  있으면 그 항목들만 콕 집어 다시 한 메시지로 재요청 — 여전히 4턴이 아니라 "부족한 만큼만
  한 번에".
  - **🐛 [2026-09-17 버그수정, 브라우저 테스트로 발견] 목적 코드(P0X)는 "목적은" 라벨이
    없어도 텍스트 어디든 있으면 먼저 뽑히는데, 이게 "줄단위 순서 매칭"의 개수 계산을
    깨뜨리던 버그** — 예를 들어 남은 항목이 요청사유/목적 2개뿐인 상태에서
    `"샘플제작\nP01"`(2줄, 항목 2개와 정확히 대응)을 보내면, 목적코드가 라벨 파싱 단계에서
    이미 먼저 채워져 버려서 "아직 빈 항목 개수"가 1개로 줄어들고, 그 결과 "조각 2개 ≠
    빈 항목 1개"가 되어 순서 매칭 전체가 조용히 스킵되고 요청사유까지 같이 안 채워지는
    사고가 있었다(같은 원인으로 "전부 4개를 한 줄에 나열"한 정상적인 답도 스킵되는 걸
    먼저 발견함 — `"G2610OB, 2004051002, 샘플제작, P01"` 같은 경우). **수정**: 라벨/바로-P0X
    파싱을 시작하기 **전에** "원래 무엇이 비어있었는지"(`missingBefore`)를 미리 스냅샷해두고,
    순서 매칭은 그 시점 그대로의 항목 개수를 기준으로 판단하도록 고침(부수효과로 이미
    채워진 값은 `assign()` 헬퍼가 덮어쓰지 않고 건너뜀) — 4개 전부 나열한 경우와 부족한
    항목만 나열한 경우 둘 다 브라우저 모킹 테스트로 재확인함.
  - **🐛 [2026-09-17 버그수정] 프로젝트코드 라벨 파싱이 `\S+`(공백 아닌 모든 문자)를 써서
    "프로젝트코드는 G2610OB, 사번은..."처럼 콤마로 이어 쓰면 값에 콤마까지 그대로 붙던
    문제**(`"G2610OB,"`가 그대로 엑셀에 실려 SAP 마스터데이터 검증에서 막힐 위험) —
    `[^\s,]+`로 콤마를 경계로 제외해서 고침. 브라우저 테스트로 재현·수정 확인.
- **② + ③ 저장 확인 없이 완전 자동 진행**: 공용 4항목까지 전부 모이면(=배치 전체에서
  "처음 한 번" 확인이 완료된 시점), 문서마다 더 이상 사람에게 묻지 않고 자동으로 처리한다.
  `window._ganttQaPrepareAndSaveOneDoc(pd, doc)`가 엑셀 생성(`/po-build-excel`) → SAP
  업로드/입력(`/po-sap-prepare`) → **곧바로 이어서** 저장(`/po-sap-confirm-save`, 예전엔
  여기서 "저장해줘"라고 답할 때까지 멈췄음)까지 한 번에 처리하고,
  `window._ganttQaRunPoBatchAutomatically(pd)`가 `pd.docs`를 **순차**로(SAP GUI 세션이
  하나뿐이라 병렬 불가) 돌며 이 함수를 호출한다. **한 문서가 실패해도 배치 전체를 멈추지
  않고 다음 문서로 계속 진행**하며(자리를 비웠다 왔을 때 "하나 실패해서 나머지도 다 안
  됨"이 되지 않도록), 끝나면 문서별 성공/실패(성공 시 오더번호, 실패 시 사유)를 한 메시지로
  요약한다. **⚠️ 트레이드오프 — 실패한 문서의 개별 재시도 UX는 제거됨**: 예전의
  `sap_prep_failed` 단계(값을 고쳐서 그 자리에서 재시도)는 배치 자동화와 함께 삭제했다 —
  실패한 문서는 배치 요약에 사유만 남고, 그 문서를 다시 시도하려면 사람이 새로 요청(예:
  정정된 정보로 다시 설명하거나 파일을 다시 첨부)해야 한다. 이건 의도적인 스코프 축소이니,
  나중에 "실패한 것만 다시 시도해줘" 같은 요청이 오면 이 지점부터 새로 설계할 것.
  **⚠️⚠️ 재무적 커밋(SAP 구매오더 저장)을 사람 확인 없이 자동 실행하는 것으로 설계가
  명시적으로 뒤집혔다** — 이건 CLAUDE.md에 "이미 검토 후 거절된 방향이니 다시 제안하지
  말 것"으로 기록돼 있던 결정과 정반대다. 이번엔 사용자가 시간 절약을 이유로 명시적으로
  요청했고 여러 문장에 걸쳐 의도를 분명히 했으므로 그대로 구현했다 — 앞으로 이 기능을
  다시 만질 때 "사람 확인 후 정지"로 되돌리라는 새 요청이 없는 한 이 자동화 자체를 임의로
  되돌리지 말 것.
- **③ 발주서 PDF 자동 저장 — 한 번 더 시도**: 기존 `_save_po_pdf_to_file`(`sap_bridge_32.py`)
  는 3차례 실사용 시도가 전부 실패해 "사람이 마지막 한 클릭(💾 저장 아이콘)만 직접 하는
  것"으로 확정돼 있었다(CLAUDE.md의 옛 "🛒 구매오더 요청" 절 6~7번 항목 참고 — 이 결론
  자체를 뒤집으라는 요청은 아니었지만, 사용자가 "이번엔 한 번 더 트라이해달라"고 명시적으로
  요청함). **아직 안 바꿔본 것 하나를 시도**: 단축키(Ctrl+S/Ctrl+Shift+S) 전송을
  `sap_win.type_keys(shortcut)`(특정 창 핸들을 대상으로 한 합성 메시지 — WM_CHAR류)로
  보내고 있었는데, 이건 클릭으로 포커스를 옮겨둔 임베드 PDF 뷰어 서브컨트롤이 아니라
  최상위 SAP 창을 대상으로 하는 방식이다 — 구형 ActiveX/OLE 임베드 컨트롤은 이런 창 핸들
  지정 합성 입력 자체를 무시하고 진짜 OS 레벨 하드웨어 입력(SendInput)만 받아들이는 경우가
  흔하다. 이 함수는 이미 `from pywinauto.keyboard import send_keys`(모듈 최상위 함수,
  SendInput 기반 — 그 순간 OS가 포커스를 준 대상에 진짜 키 입력을 보냄)를 가져와 있으면서
  정작 파일명 확정 시(`{ENTER}`)에만 쓰고 단축키 자체는 안 쓰고 있었다 — `sap_win.type_keys()`
  를 이 모듈 최상위 `send_keys()`로 교체함. **⚠️⚠️ 여전히 라이브 SAP 세션으로 검증 못 함**
  (이 harness는 SAP 저장/OS 레벨 키 입력 자동화를 Bash로 직접 실행하는 걸 막음 — 위
  "🛒 구매오더 요청" 절 6번 항목과 동일한 제약) — 실제 효과는 사용자가 배포된 앱으로
  구매오더를 실제 처리할 때 확인해야 한다. 이번에도 안 되면(임베드 컨트롤 자체가 합성
  키보드 입력을 전혀 안 받는 구형 OLE/ActiveX일 가능성이 높음) 다시 자동화를 시도하기보다
  "사람이 마지막 한 클릭"으로 돌아가는 게 낫다 — 이미 여러 차례 다른 각도로 시도해본 뒤에
  나온 결론이라, 매번 새 세션이 이 부분을 처음부터 다시 파고들 필요는 없다.
- **함수 목록 정리(옛 함수는 전부 삭제됨)**: `_ganttQaExtractPoDocumentsViaAi`(파일별 병렬
  추출) / `_ganttQaExtractPoDocumentsCorrectionViaAi`(배치 전체 정정 재추출) /
  `_ganttQaPoBatchSummaryText`(배치 요약) / `_ganttQaPoFindMissingBizNoDocs` /
  `_ganttQaPoFindMissingTempCodeItems`(둘 다 배치 검증 헬퍼) / `_ganttQaPoShowTempCodeDropdown`
  (배치용 드롭다운) / `_ganttQaPoAdvanceAfterItemsConfirmed`(다음에 뭘 물을지 판단하는
  중앙 디스패처 — `confirm_items`의 "확인" 직후, `fix_biznos` 해결 직후 등 여러 지점에서
  재사용) / `_ganttQaPrepareAndSaveOneDoc`(문서 1건 엑셀~SAP 업로드~저장) /
  `_ganttQaRunPoBatchAutomatically`(문서 배열 순차 자동 처리 + 최종 요약). 삭제된 옛 함수:
  `_ganttQaRunPoSapPrepareAndReport`(엑셀~SAP 업로드까지만 하고 멈추던 구버전 — 이제
  `_ganttQaPrepareAndSaveOneDoc`이 저장까지 이어서 처리).
- **검증**: 브라우저에서 `fetch`/AI 추출 함수를 모킹해 ① 첨부 2개 → 문서 2건 병렬 추출 →
  배치 요약에 둘 다 표시되는지, ② "확인" → 사업자등록번호/임시코드가 이미 정상이면 곧바로
  `ask_shared`로 건너뛰는지, ③ 사업자등록번호 미확인 문서 → "1번: X, 2번: Y" 답으로 둘 다
  고쳐지는지, ④ 임시코드 미확정 품목 → 배치 드롭다운(마스터 행 + 문서-품목 라벨) → 선택 시
  올바른 정정 문장이 합성되는지 → 정정 AI 함수가 실제로 호출되는지, ⑤ 공용 4항목 질문에
  라벨식/줄단위식/전체나열식 세 가지 답변 형태가 전부 올바르게 파싱되는지(버그 2건 발견·
  수정 포함), ⑥ 문서 2건 중 1건은 SAP 준비 단계에서 실패하도록 모킹 → 배치가 멈추지 않고
  나머지 문서를 계속 처리 → 최종 요약에 성공/실패가 정확히 1/2건으로 표시되는지, ⑦ 전역
  인터럽트 가드("처음부터 다시")가 새 `docs` 배열 구조에서도 여전히 정상 동작하는지 —
  전부 확인함. **PDF 자동저장 개선(send_keys 교체)과 실제 SAP 저장 자동 실행 자체는
  harness 제약상 라이브 검증 불가** — 다음 실사용 시 확인 필요.

### 🔄 로컬 백엔드(kortek_backend.py) 자동 업데이트 + 자동 재시작 (2026-09-15 신규, 2026-09-16 확장)

**배경**: 이 앱은 GitHub Pages(정적 프런트) + 각 팀원 PC의 로컬 백엔드(`127.0.0.1:5000`) 구조라
(위 "🏭 SAP 조회 연동"의 "⚠️⚠️ 32비트 브릿지" 항목 참고), 백엔드 파일(`kortek_backend.py`/
`sap_bridge_32.py`/`matgroups.json`/`templates/*` 등)이 바뀔 때마다 사람이 `kortek_backend.zip`을
다시 받아 기존 폴더에 수동으로 덮어써야 했다 — 이 절차를 잊거나 귀찮아하면 그 PC는 계속 구버전
백엔드로 남아 최신 기능/버그수정이 반영 안 된 채 디버깅하게 된다(사용자가 직접 겪은 문제).

- **트리거 — 2026-09-16부터 페이지 로드 시마다 항상 확인**: 처음엔 `js/04b-core-app-drive-sync.js`의
  구글 로그인 성공 콜백(`tokenClient.callback`) 끝부분에서만 `window.checkBackendUpdate()`를
  불렀는데, **⚠️⚠️ 실사용 사고로 확인된 치명적 공백**: 이미 로그인된 채로 PC를 켜두면(시작프로그램
  자동 실행 + `startSilentTokenRefresh`의 조용한 토큰 갱신만 12분마다 도는 상태) 다시 로그인 버튼을
  누를 일이 평생 없어서 이 체크 자체가 한 번도 안 돈다 — "구매오더 요청" 기능(🛒 절 참고)을 그런
  PC에서 테스트하다가 구버전 백엔드가 새 엔드포인트 요청에 HTML 404를 돌려줘 "Unexpected token
  JSON" 오류로 이어졌고, 원인이 백엔드인 줄 모르고 값(사업자등록번호)을 계속 고쳐보게 만든 사고로
  발견됨. **수정**: `/self-check-update`는 Google 인증과 무관한 순수 로컬 조회이므로, 로그인
  이벤트에 얹지 말고 **`js/04b` 로드 시(=페이지를 열 때마다) 3초 뒤 무조건 한 번 호출**하도록 변경
  — 로그인 성공 시 호출도 남겨둠(중복이지만 가벼운 조회라 무해).
- **버전 번호 대신 파일 내용 직접 비교** — `kortek_backend.py`의 `/self-check-update`(GET)가
  `_SELF_UPDATE_FILES` 목록(= `kortek_backend.zip`에 포함되는 배포 파일 목록과 동일, 새 배포
  파일이 생기면 두 목록 다 같이 추가할 것)의 각 파일을 `raw.githubusercontent.com/yhparkkortek/
  ganttchart/main/...`에서 받아와 로컬 파일과 바이트 단위로 직접 비교한다 — 별도 버전 번호를
  올리고 관리하는 방식(예: `BACKEND_VERSION` 상수)은 "버전 올리는 걸 깜빡해서 갱신 감지가 안
  되는" 위험이 있어 의도적으로 피함. 다른 게 있으면 `{outdated: true, changedFiles: [...]}` 반환.
- **적용은 여전히 사람이 버튼을 눌러야 시작됨, 이후는 자동** — 프런트가 다르다는 응답을 받으면
  화면 상단에 배너(`window._showBackendUpdateBanner`, 살구색 — 위 "🪟 모달 신규 생성 시 UI
  컨벤션"의 비-AI 모달 색상과 통일)를 띄우고, "지금 업데이트" 버튼을 누르면 `/self-update`(POST)를
  호출한다 — 로컬 백엔드가 스스로 같은 파일 목록을 GitHub raw에서 받아 자기 자신의 디렉터리
  (`BASE_DIR`)에 덮어쓴다.
- **⚠️⚠️ [2026-09-16 재검토 후 결정 변경] 이제 자동 재시작까지 시도한다** — 원래는 "실행 중인
  프로세스를 안전하게 재기동시키는 로직(포트 점유 해제 타이밍 등)이 복잡도·위험도 대비 이득이
  적다"고 판단해 덮어쓰기까지만 자동화했었는데, SAP 디버깅 중 백엔드가 자주 바뀌고 다른 PC가
  재시작을 계속 깜빡하는 문제(바로 위 트리거 버그와 같은 제보)가 반복돼 사용자가 "재시작까지 자동,
  안 되면 안내"를 요청 — 검토 후 **자동 재시작 시도를 새 기본값으로 채택**함(대안: 그대로 수동
  안내만 유지하는 안전한 기존 방식도 제시했으나, 사용자가 명시적으로 자동 재시작을 선택).
  - **`kortek_backend.py`의 `/self-update`**: 파일 갱신이 전부 성공하면(`updated`가 있고
    `errors`가 비어있으면) `_spawn_restarted_backend()`로 **새 `kortek_backend.py` 프로세스를
    별도 콘솔(`CREATE_NEW_CONSOLE`)로 띄운 뒤**, 응답에 `restarting:true`를 실어 보내고
    `_delayed_self_exit()`(응답 플러시 시간 0.6초 확보 후 `os._exit(0)`)로 스스로 종료해 포트
    5000을 반납한다. **완전히 숨긴 프로세스(`DETACHED_PROCESS`)가 아니라 새 콘솔 창을 띄우는
    이유**: 자동 재시작이 조용히 실패해도 아무도 모르는 것보다, 눈에 보이는 새 창이 뜨는 게
    "재시작이 실제로 일어났다"는 확인이 되고 문제 시 그 창의 로그를 바로 볼 수 있어서다.
  - **포트 경합은 고정 지연이 아니라 재시도로 흡수**: 새 프로세스가 뜬 시점에 이전 프로세스가
    아직 포트를 반납 전일 수 있다(정확한 타이밍을 맞추기 어려움) — `_run_flask_with_port_retry()`
    가 `app.run()`을 감싸 `OSError`(포트 사용 중)가 나면 0.5초 간격으로 최대 15초까지 재시도한다.
    이 재시도 루프는 **모든 실행**(수동 실행 포함)에 항상 적용되므로, 일반적인 "포트가 아직 안
    풀렸는데 급하게 재실행"하는 경우에도 똑같이 안전망이 된다.
  - **프런트(`js/04b`)**: `_applyBackendUpdate`가 `restarting:true` 응답을 받으면 토스트로
    "자동으로 재시작하는 중..."을 띄운 뒤 `_pollBackendHealthUntilUp(15000, 1200)`로 `/health`를
    1.2초 간격 최대 15초간 재시도 — 응답이 오면 "자동으로 재시작되어 최신 버전 적용" 성공 토스트,
    15초 안에 안 오면 "자동 재시작을 확인하지 못했습니다 — 새 콘솔 창을 확인하거나 직접
    kortek_backend.bat을 다시 실행해주세요"로 **안전하게 수동 안내로 폴백**한다(요청하신 "안
    된다면 안내를 해주던가"에 해당 — 무한정 조용히 기다리게 두지 않음). `restarting:false`
    응답(파일 갱신 자체가 일부 실패했거나, 재시작 프로세스 기동 자체가 실패한 경우)에도 기존과
    동일하게 수동 재시작 안내로 폴백. 브라우저 모킹으로 성공 경로(health가 몇 번 실패하다
    돌아옴)와 실패 경로(health가 끝까지 안 돌아옴) 둘 다 확인함.
  - **⚠️⚠️ 실사용 SAP 세션으로는 아직 검증 안 됨** — 브라우저 모킹으로 프런트 로직(폴링/토스트
    분기)은 확인했지만, 실제로 다른 PC에서 `/self-update`를 눌렀을 때 새 콘솔이 정말 뜨는지,
    포트 재시도가 실제로 타이밍을 흡수하는지는 다음 실사용 배포에서 확인 필요 — 문제가 생기면
    `_spawn_restarted_backend`/`_run_flask_with_port_retry`부터 의심할 것.
- **첫 롤업 시 "닭이 먼저냐 달걀이 먼저냐" 문제**: 이 기능 자체가 추가되기 전 버전의 구버전
  백엔드는 `/self-check-update` 엔드포인트가 아예 없어 404가 난다 — 프런트는 `res.ok`가 아니면
  조용히 아무것도 안 하므로 에러가 노출되진 않지만, **이 기능이 배포된 이후에도 아직 한 번도
  자동 업데이트를 받아본 적 없는 PC는 첫 1회만 수동으로 `kortek_backend.zip`을 새로 받아야
  한다** — 그 뒤로는 이 메커니즘 자체가 최신이라 계속 자동 갱신됨(이제는 재시작까지).
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
- **⚠️⚠️ [2026-09-16 실사용 버그수정] `.bat`/`.vbs` 파일이 LF-only로 배포돼 "파일이 이상하다"는
  제보로 이어짐** — git은 저장소 안에 텍스트 파일을 항상 LF로 정규화해서 저장한다(로컬 작업
  사본의 실제 줄바꿈과 무관) — 실제로 `git show HEAD:kortek_backend.bat`을 바이트 단위로 까보면
  CR이 전혀 없는 순수 LF였다. 이 저장소는 `.gitattributes`가 없어 이 정규화를 막을 방법이
  없고, 로컬 작업 사본 자체도(원인은 특정 못함 — 아마 최초 작성 시점부터 LF로 저장돼 있었고
  `core.autocrlf=true`는 checkout 시에만 개입해 이후로는 그대로 유지된 것으로 추정) 실제로
  LF-only였다. 그 결과 **`kortek_backend.zip`(Compress-Archive가 작업 사본 파일을 그대로
  압축)과 `/self-update`(GitHub raw가 git의 LF 저장 바이트를 그대로 돌려줌) 두 배포 경로 모두
  LF-only `.bat`/`.vbs` 파일을 사용자 PC에 심어왔다.** Windows `cmd.exe`의 배치 파서는
  특히 이 파일들처럼 괄호로 감싼 `IF (...) ELSE (...)` 블록이 많을 때 LF-only 줄바꿈에서
  오동작할 수 있고(줄이 씹히거나 블록이 조용히 안 돌 수 있음), 옛 스타일 메모장은 LF만으로는
  줄바꿈 자체를 인식 못해 전체 텍스트가 한 줄로 뭉쳐 보인다 — **"덮어씌워진 파일이 이상하다"는
  실사용 제보의 실제 원인으로 확정**(사용자가 메모장으로 열어 한 줄로 뭉친 걸 봤을 가능성이
  높음). **수정**: ① 저장소 작업 사본의 `kortek_backend.bat`/`kortek_backend_install.bat`/
  `kortek_backend_start_minimized.vbs` 세 파일을 CRLF로 정규화(내용은 동일, 줄바꿈만 변경) —
  `kortek_backend.zip`은 이제부터 항상 CRLF로 빌드됨. ② `kortek_backend.py`의 `/self-update`가
  `.bat`/`.vbs` 확장자(`_SELF_UPDATE_CRLF_EXTS`)는 GitHub에서 받은 바이트를 그대로 쓰지 않고
  `b'\r\n'→b'\n'→b'\r\n'` 왕복으로 항상 CRLF로 정규화한 뒤 저장하도록 수정 — 원본이 LF든 이미
  CRLF든 결과가 항상 깨끗한 CRLF가 되게 해서(CRLF를 또 변환해 CRCRLF가 되는 사고 방지), git이
  앞으로도 계속 LF로 저장하는 것과 무관하게 사용자 PC에는 항상 올바른 CRLF 파일이 생기도록
  방어함. ③ **이 수정과 짝을 이루는 함정**: `/self-check-update`가 그냥 원본 바이트를
  그대로 비교하면, git의 LF 저장 바이트 vs 이제 항상 CRLF인 로컬 파일이 **내용은 같은데
  줄바꿈만 달라서 매번 "구버전"으로 오탐**하게 된다(②의 수정이 ①·③ 없이 이것만 배포되면
  이 새 오탐이 생김). 새 헬퍼 `_normalize_for_compare(rel_path, data)`가 `.bat`/`.vbs`만
  비교 직전에 LF로 맞춰서(정규화된 로컬 CRLF ↔ git의 LF가 같은 내용이면 "같다"로 판정)
  비교하도록 `/self-check-update`도 같이 고침 — 실제 배포(쓰기) 로직은 그대로 CRLF 유지, 비교
  로직만 줄바꿈에 관대하게 만든 것. 이 세 가지(①②③)를 다 해야 완전한 수정이라는 점을 기억할 것
  — 하나라도 빠지면 "새 사용자는 여전히 LF-only를 받거나" 또는 "정상 파일인데 계속 업데이트
  배너가 뜨는" 회귀가 생긴다.

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
