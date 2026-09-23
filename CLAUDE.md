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

## 🎯 최우선 개발 방향 — "학습을 통해 스스로 업그레이드되는 앱" (2026-09-21, 사용자 지시)

**이 앱이 지향하는 최우선 방향은 학습으로 나아지는 것이다.** 모든 코드는 아래 원칙이 다른 편의(빨리 끝내기, 규칙 몇 줄 박아넣기)보다 **우선**한다.

- **하드코딩을 지양한다.** 규칙·어휘·키워드·임계치·매핑·안내 문구 목록은 코드에 박지 말고 **데이터(카탈로그·원장·설정·사전)로 분리**해서, 저장 → 분류 → 학습 → 추론 → 개선이 가능하게 만든다. 코드는 "데이터를 읽어 동작하는 엔진"이고, 똑똑해지는 부분은 데이터 쪽이다.
- 새 기능/수정을 만들 때 **매번 확인할 체크리스트**:
  1. **신호를 남기는가** — 실패·불만·교정(다시 분류/🚩/👎/재질문)을 Phase 10 수집기(`_issueLog`)로 남기는가. 조용히 삼키는 실패 금지.
  2. **데이터로 뺐는가** — 새 규칙·어휘가 코드 상수가 아니라 카탈로그(`SAP_CAPABILITIES` 등)·원장·설정에 있는가. 지금 하드코딩할 수밖에 없다면 "나중에 데이터로 옮길 자리"를 남기고 CLAUDE.md/docs에 적는다.
  3. **분류·군집되는가** — 같은 종류의 문제/요청이 시그니처(`_qaIntentSig`, 이슈 sig)로 묶여 수요·재발이 보이는가.
  4. **결정론 먼저, AI 추론은 필요할 때만** — 규칙/존재 확인/유사도로 먼저 판정하고, AI 추론은 임계치를 넘거나 사람이 요청할 때만(비용·지연·환각 방지). AI가 낸 결과도 원장에 **적립**해 다음에 재사용한다.
  5. **사람 승인 후 적용 + 이력 보존** — 프롬프트/사전/코드를 AI가 스스로 바꾸지 않는다(제안 → 승인 → 적용, 진단 이력 유지).
  6. **개선을 측정하는가** — 해결됨/구현됨 표시 후 같은 시그니처가 다시 오면 재발로 드러나는가.
- **학습 인프라 지도**: Phase 3(학습 로그) · 4(재시도) · 6(토픽 프로파일) · 8(오염 감지·자가진단) · 9(신규 프로젝트 군집) · **10(이슈 수집·군집 리포트)** · **11(질문 라우터 + SAP 적립학습)** — 아래 Phase 표와 `docs/phase10-issue-learning-design.md`, `docs/qa-router-and-sap-learning.md` 참고. 새 학습 기능은 이 기반(수집기·카탈로그·원장·리포트)을 **재사용**하고 새로 만들지 않는다.
- **하드코딩해도 되는(오히려 해야 하는) 것**: 안전·보안 고정값 — 재무 커밋 확인 절차, 마스킹 규칙, 인증/관리자 게이트, 사업자번호 제외 같은 무결성 검증. 이건 학습으로 바뀌면 안 되는 가드레일이다.
- 기존 코드의 하드코딩(정규식 트리거 목록, 임계치, 라벨 사전 등)은 **손볼 때마다 점진적으로 데이터화**한다(한 번에 대규모 리팩터링하지 말 것 — "Git 작업 방식"의 사전 확인 규칙 적용).

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
파일구조 변경이 있었는지 검토하고, 있으면 압축 전에 갱신하라"는 지시가 자동으로 주입됩니다.
**(2026-09-21 변경) 상세 기록은 `docs/*.md`에, CLAUDE.md에는 한 줄 요약만** — 아래 "📚 상세 문서 색인" 절 참고. (단, `/clear`는 압축이 아니라 훅이 걸리는 지점이 없어 이 자동 갱신 대상이 아닙니다 —
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
| 10 | SAP·AI 문답 이슈 수집(실패 자동 기록+화면 스냅샷+🚩 신고) → Drive 샤드 → 관리자 군집 리포트 → 내보내 Claude가 진단 (`docs/phase10-issue-learning-design.md`) | `30-issue-collector.js`, `31-issue-report.js`, `kortek_backend.py`(이슈 수집 블록), `sap_bridge_32.py`(스냅샷) |
| 11 | AI 문답 질문 라우터(SAP/프로젝트/일반 분류, 칩·접두어·배지·다시 분류) + SAP 적립학습(미지원 요청 적립·🚩 새 기능 요청·AI 추론 원장) (`docs/qa-router-and-sap-learning.md`) | `32-sap-capabilities.js`, `33-qa-router.js`, `31-issue-report.js`(학습 탭), `30-issue-collector.js`(🚩 분류) |

## 📚 상세 문서(`docs/`) 색인 — 해당 작업을 할 때만 읽을 것

**CLAUDE.md는 규칙·파일 맵·"꼭 기억할 것"만 담는 색인입니다 (2026-09-21, 약 31만 → 약 3만 바이트로 분리 — 세션/턴마다 통째로 컨텍스트에 실려 토큰을 크게 소비했기 때문).**
아래 표에서 지금 하는 작업에 해당하는 `docs/*.md`만 여십시오. 각 문서의 절 제목·본문은 분리 전 CLAUDE.md 원문 그대로이며, 코드 주석의 `CLAUDE.md "🛒 구매오더 요청" 절 참고` 같은 참조는 이 색인에서 문서를 찾은 뒤 그 제목으로 검색하면 됩니다.

> **📝 새 상세 기록 규칙**: 트러블슈팅·디버깅 이력·실사용 검증 내용은 CLAUDE.md가 아니라 **해당 `docs/*.md`에 추가**하고, CLAUDE.md에는 아래 "꼭 기억할 것" 형태의 한 줄만 보탤 것. CLAUDE.md가 다시 비대해지면 같은 토큰 문제가 재발한다.

### `docs/mail-pipeline.md` — 메일 분석/원문/번역/토픽 프로파일 자동 재생성
- **읽을 때**: 메일→업무 등록 경로(업무 보관함 전송, 다중 배분, 미분류 재분석)를 만들거나 고칠 때, "원문 보기"·영문 번역, 토픽 프로파일 재생성.
- 업무를 **다른 곳으로 옮기거나 복사하는 코드**는 `buildMailTaskRow`의 4번째 인자(mailRaw), 배분 원장(`distributions.push`)의 `mailRaw`, `gantt_ai_reassign_queue_v1` 항목의 `mailRaw`를 빠뜨리지 말 것 — 빠지면 "원문 보기"가 조용히 사라진다. 수신자 to/cc 실제 주소도 mailRaw의 일부. 같은 날짜 업무 순서는 `computeL0InsertPos` 6번째 인자에 `mailRaw.date`를 넘겨 시:분까지 비교.
- "AI에게 판정까지 맡기는" 기능은 로컬 정규식으로 먼저 걸러 AI 호출 대상 자체를 줄일 것(번역: 한국어만 있는 블록은 호출 생략, 청크가 0개인 정상 케이스를 실패로 처리하지 말 것).
- **지금 열려있지 않은 프로젝트를 Drive에 직접 PATCH하는 헤드리스 경로**를 새로 추가하면, 같은 PATCH 직전에 `_tpMaybeAutoRegen(fileId, rows, colIdx, projectMeta)`를 호출해 `saveData.topicProfile`에 얹을 것(별도 Drive 왕복 금지). `_generateTopicProfile`을 열려있지 않은 프로젝트에 쓸 땐 `rows/colIdx/projectMeta`를 반드시 명시(안 하면 지금 열린 엉뚱한 프로젝트를 읽음).

- **메일 자동배치는 '완전자동(full)/OFF' 2단계만 있다(2026-09-23, 반자동 semi 삭제)** — 자동배치는 매칭신뢰도 '상'만으로 되지 않고 모드·날짜확정·후보 수(≤`MAX_AUTO_PLACE_TARGETS`=5)·drive_file_id가 모두 맞아야 한다. 실패한 건은 `_ibMarkAutoPlaceFail`로 기록돼 유휴 스윕(`_ibAutoPlaceSweep`, 드라이브 연동 3분 후 → 10분 주기)이 백오프로 재시도한다. 자동배치 조건을 늘리면 `_ibIsAutoPlaceReady`와 화면 사유 `_ibPendingReason`을 **항상 같이** 고칠 것(`docs/mail-pipeline.md` 자동배치 조건 재정비 절).

- **AI 할당량 오류는 "retry in N초"만 보고 분당 한도로 판단하지 말 것** — Gemini 무료 `limit: 20`은 하루 한도였다(`_aiClassifyQuotaError`, 사용량 원장 `gantt_ai_usage_v1` → ⚙️ AI 분석 설정 "📊 오늘 AI 사용량"). 사용자 조작 없이 AI를 부르는 백그라운드 호출(묶기·재분석 등)을 새로 만들면 호출 빈도 상한을 반드시 둘 것(`docs/mail-pipeline.md` 정정 절).

- **localStorage에 무한히 쌓이는 새 저장소를 만들면 `window.STORAGE_REGISTRY`(`js/34-storage-doctor.js`)에 정리 규칙 한 줄 추가** — 브라우저 저장소(~5MB)는 앱 전체가 공유해서, 한 곳이 가득 차면 업무 보관함 저장이 막힌다("저장 공간이 가득" 경고 + 🧹 버튼이 "정리할 항목 없음" 반복했던 사고, `docs/mail-pipeline.md` 저장소 닥터 절).

### `docs/gantt-internals.md` — 일정 계산/탭 복원/표 오버레이/AI 검색 일괄삭제
- **읽을 때**: 날짜순 정렬·`recalculateSchedules`·`_calcStartTs`, 페이지 로드 시 1회 계산, `.no-td` 열 오버레이, AI 검색 체크박스 일괄 작업.
- 그룹행(자식 있는 행)의 `_calcStartTs`는 배열 순서의 부산물 — 날짜순 정렬은 하위 전체의 **재귀 최솟값**(`effectiveTs`)으로. Forced가 아닌 리프도 waterfall이라 셀 값이 무시될 수 있음.
- "마지막 탭 복원" 때문에 로드 시점엔 Gantt 탭이 `display:none` — 크기 측정 1회성 계산은 화면에 보일 때만 하고, 실패 시 1회성 플래그를 태우지 말고 `switchTab`에서 재시도.
- 이미 flex인 셀 위에 오버레이(체크박스/아이콘)를 얹을 땐 절대좌표 말고 **flex 항목으로**. `stopPropagation`은 좌표 겹침 해법이 아님.
- 체크박스 다중 선택은 **배열 인덱스가 아니라 행 객체 참조 Set** (배경 재렌더로 인덱스가 어긋남). 처리 시점에 `indexOf`로 위치 재탐색.

### `docs/ai-qa.md` — 💬 AI 문답 (`04g`/`04h`/`04j`)
- **읽을 때**: AI 문답 프롬프트·로컬 명령·`[[ACTION:..]]` 태그·드롭다운/확인 버튼·전역 인터럽트·입력 히스토리를 만들거나 고칠 때.
- 새 "AI가 실행하는" 요청은 3단계 중 선택: ① 로컬 명령(AI 호출 생략) ② `[[ACTION]]` 즉시 실행(되돌릴 수 있거나 데이터 무변경) ③ 초안→사람 확인→확정. "당연히 될 줄 알았는데 안 된다"는 태그/로컬명령 부재이거나 프롬프트가 단수로만 써서 반복 허용을 못 알린 경우가 많다.
- **프롬프트 문자열 안에 백틱(`` ` ``) 절대 금지** — 바깥 템플릿 리터럴이 깨져 파일 전체가 죽는다(콘솔 `Unexpected identifier '한글'`).
- **항상 지켜야 할 필수 규칙은 템플릿 안쪽이 아니라 `_buildGanttQaPrompt`의 치환 이후 무조건 append 구간**에 추가 (팀이 저장한 `gantt_qa_prompt`가 기본 템플릿을 통째로 대체함).
- 정해진 목록에서 고르는 질문 = 드롭다운(`_ganttQaPendingChoiceDropdown`), 그때그때 짧은 확인 문구 = 클릭 버튼(`_ganttQaShowConfirmButtons`). 둘 다 선택값을 **사람이 타이핑했을 법한 문자열로 합성해 `sendGanttQaMessage()`에 태울 뿐 새 파싱 로직을 만들지 않는다.** 여러 필드를 한 메시지로 합치는 리팩터링이 기존 드롭다운을 없애지 않게 주의.
- 새 draft/단계를 추가하면 전역 인터럽트(`INTERRUPT_RE`)의 초기화 대상 상태 목록에 등록(단계마다 취소 인식을 따로 넣을 필요는 없음). 붙여넣기 이어하기 마커에 이 앱 자신의 응답에 나오는 일반 단어("품목" 등)를 넣지 말 것(자기 참조 오탐).
- 서로 무관한 비동기 조회는 `Promise.all`로 병렬화, 히스토리는 최근 16개 캡. 표시No.≠#G 인덱스(실행은 항상 #G).

### `docs/sap-lookup.md` — 🏭 SAP 조회 연동 (`sap_bridge_32.py`, `/sap-*`)
- **읽을 때**: SAP GUI 자동화 전반 — BOM/사용처/문서 열기·목록·배치·패턴 다운로드/승인원 표지/품목 내역/ZMM009/엑셀 내보내기. **SAP 기능이 안 될 때 원인 진단 이력이 여기 다 있으니 재조사 전에 먼저 검색할 것.**
- COM이 32비트뿐 → 실제 작업은 `py -3-32 sap_bridge_32.py` 서브프로세스. **`kortek_backend.py`에서 `win32com` 직접 import 금지.**
- **SAP 자동 로그인은 검토 후 거절됨 — 다시 제안 금지.** 사람이 미리 로그인해 둔 세션에 올라탄다. SAP 창이 2개 이상이면 첫 세션만 조작됨.
- 입력 필드 ID substring 탐색은 **같은 문자열의 라벨 컨트롤에 걸릴 수 있음** → `_set_text_on_best_candidate`/`_find_all_by_id_substring`(GuiShell은 `require_type`). 트랜잭션 진입은 항상 `/n` 접두사. 화면에서 얻은 고정 좌표·열 번호는 콘텐츠 폭에 따라 바뀔 수 있으니 헤더 라벨로 동적 탐색.
- "실패해도 조회는 막지 않는" 방어 설계여도 **실패 사유는 결과에 남길 것** — 삼키면 다음에 원인을 처음부터 재조사하게 된다.
- SAP 관련 파일 저장은 브라우저 다운로드(`XLSX.writeFile`/`<a download>`) 금지 → 백엔드로 보내 `C:\SAP_DMS\<전용폴더>\`에 저장.
- ALV 그리드 **한글은 SAP GUI Scripting 자체 버그로 깨짐**(복구 불가) — 헤더는 `_SAP_FIELD_LABEL_MAP`(실측 134개)으로 치환. 셀 한글 깨짐은 AI 탓이 아님.
- 진단 스크립트와 실사용이 같은 SAP 세션을 동시에 만지면 가짜 실패 발생 — 재현 전에 진단 스크립트부터 멈출 것. 이 harness는 SAP 저장/OS 키 입력 자동화를 Bash로 직접 실행할 수 없어 라이브 검증은 사용자가 한다.
- 자재번호가 있는 요청은 "SAP" 단어 없이도 인식(트리거 확장 원칙). 로컬 명령 체크 순서: 배치 다운로드 → 단일 열기 → 목록 → 엑셀 내보내기(catch-all은 마지막). python-docx 셀 채우기는 `cell.text=` 금지(서식 소실).
- **새 SAP 기능을 붙일 때 매크로(.vbs) 해석 대신**: 대상 화면을 열어두고 AI 문답에 "SAP 화면 덤프해줘"라고 하면 `dump_screen_tree`(`sap_bridge_32.py`)가 GuiComponent 트리 전체(Id/Type/Text)를 그대로 보여준다 — 필드 ID 추측 없이 바로 확인.

### `docs/purchase-order.md` — 🛒 구매오더 요청 (PDF→AI 추출→ZMMR060/ZMM018)
- **읽을 때**: 구매오더 요청, 세금계산서/거래명세서 복수 처리, 발주서 출력.
- 텍스트 레이어가 없는 스캔 PDF는 미지원(pdf.js 텍스트 추출). 이 회사(코텍, 사업자번호 130-81-44628)는 항상 구매자 — 프롬프트뿐 아니라 **코드로도 협력사 후보에서 제외**.
- 문서(품목)+공용 필드 확인은 **처음 한 번만**, 이후 SAP 입력~저장~발주서 출력은 **사용자가 명시 요청해 완전 자동화로 확정**(옛 "저장 직전 정지"는 폐기) — 되돌리라는 요청 없이 임의로 되돌리지 말 것. 실패 문서는 건너뛰고 배치 요약에 사유를 남긴다. 프로젝트코드/요청사유/목적은 문서별, 사번은 배치 공통.
- 발주서 PDF 자동 저장(임베드 뷰어의 💾)은 여러 차례 실패 → 실패해도 정상 완료로 처리하고 사람이 저장. 백엔드가 구버전이면 HTML 응답이 오므로 `_ganttQaParsePoApiResponse`가 재시작 안내.

### `docs/backend-auto-update.md` — 🔄 로컬 백엔드 자동 업데이트/재시작
- **읽을 때**: `/self-check-update`·`/self-update`, `kortek_backend.zip`, `.bat`/`.vbs` 변경.
- 새 배포 파일을 추가하면 **`_SELF_UPDATE_FILES`와 `.claude/settings.json`의 zip 목록 둘 다** 갱신. `.bat`/`.vbs`는 항상 CRLF(LF-only는 cmd 파서 오동작). 원격은 `main` 브랜치 고정. 자동 재시작은 새 콘솔 + `/health` 폴링이며 실패하면 수동 안내로 폴백.

### `docs/ui-conventions.md` — 🌐 i18n / 🎨 팔레트 / 🪟 모달 컨벤션 (상세)
새 UI를 만들 때 **아래 세 가지는 항상 함께 끝내야 완료**다(별도 지시가 없어도 기본 범위):
- **영문 대응**: 정적 HTML은 `data-i18n*` 속성 + `LANG` 맵, 동적 문구는 `window._t(ko,en)`/`_en` 삼항. "최초 1회 렌더 후 재사용" 모달은 언어 토글 시 갱신되도록 id 맵 또는 전용 `_xxxRefreshLang()`, 목록/리포트 재렌더 함수는 `toggleLang()` 끝에서 호출. 검증은 🌐 왕복 + 모달을 닫았다 다시 연 상태.
- **팔레트 대응**: 테마 role hex(`#e0f5f7`/`#00707d`/`#a3d9e0`/`#52a5af`)를 인라인으로 쓰면 자동 추종, 아니면 `_cpApplyLive`에 **좁은 셀렉터**로 추가. 강조는 테마색이 아니라 보색(`compGen`), 삭제/성공 같은 상태색은 고정. 🎨 팔레트 프리셋으로 왕복 확인.
- **모달**: 투명 래퍼(`pointer-events:none`) + 내부 박스(`resize:both`), AI 모달은 하늘색 헤더(`#e7f3ff`)/비-AI는 살구색(`#fff8e6`), `_makeDraggable`·`_bindClickToFront`·`bringModalToFront` 호출, 닫기 버튼은 `var(--modal-icon-*)` 변수.

### `docs/admin-password.md` — 🔑 관리자("팀") 비밀번호
- **읽을 때**: 비밀번호 확인 게이트, 메일/텔레그램 설정 암복호화, Drive 팀 비밀번호 동기화.
- 하드코딩 기본값 없음(소스 공개). 새 게이트는 반드시 `adminPwMatches()` 사용, `saveAllToDrive`/`loadAllFromDrive`는 비밀번호가 비어있으면 차단. 구글 로그인(OAuth)과는 완전히 별개.

### `docs/phase10-issue-learning-design.md` — 📊 Phase 10 이슈 수집/군집/학습 루프
- **읽을 때**: 이슈 수집·🚩 신고·이슈 리포트·화면 스냅샷·`issue_events.jsonl`·`/issue-*` 엔드포인트를 만들거나 고칠 때, "이슈 정리해줘" 요청(내보낸 `C:\SAP_DMS\SAP이슈\digest_*.json` 읽기).
- 수집은 본 기능을 절대 방해하면 안 됨(전 구간 try/catch, 원본 fetch 결과 그대로). 요청 상관 id는 **쿼리 `_rid`**(커스텀 헤더 금지 — 백엔드 CORS가 `Content-Type`만 허용해 구버전이 깨짐). 저장 전 마스킹(자재번호·사업자번호·메일·사용자경로), 스냅샷은 구조만(필드 값 없음), AI 문답 답변 본문은 저장 안 함. Drive는 `Backups/SAP_Issues/`에 사용자·월별 샤드(동시 쓰기 충돌 없음). 즉시 끄기: `localStorage.gantt_issue_collect_off='1'`.

### `docs/qa-router-and-sap-learning.md` — 🧭 질문 라우터 + SAP 적립학습 (Phase 11)
- **읽을 때**: AI 문답 질문 분류(SAP/프로젝트/일반), 칩·접두어·배지, 미지원 SAP 요청 처리, SAP 기능 카탈로그, 학습 적립 탭/원장, "이슈 정리해줘"에서 `learning`(신규 기능 후보) 읽기.
- **라우터는 확실할 때만 동작을 바꾸고 애매하면 기존(legacy) 경로 그대로.** 새 분류 규칙은 `_qaClassify` 한 곳에만. 지원하지 않는 SAP 요청에 프로젝트 데이터로 **지어내서 답하지 말 것**(안내 + 적립).
- **SAP 외 앱 기능(메일 발송·Gantt 등록 등)을 새로 구현하면 `APP_CAPABILITIES`, 연결 요청 표현은 `QA_CHAIN_INTENTS`(둘 다 `js/32`, 데이터)에 추가** — 로컬 명령이 뒷부분("…메일로 보내줘")을 무시하면 자동으로 "연결 요청"으로 적립된다(`_qaAfterSend`).
- **새 SAP 기능을 구현하면 `SAP_CAPABILITIES`(`js/32`)에 항목 추가**(kw는 그 기능만의 구체적 단어만 — 조회/자재/문서 같은 일반어 금지) 하고 리포트 학습 탭에서 `구현됨` 처리. 신규 기능의 필드 ID는 라이브 트리 덤프 1회 또는 사용자의 "기록 및 재생" 매크로로 확정(추측은 틀린 전례 있음).

### 백엔드
| 파일 | 역할 |
|---|---|
| `gas/Code.gs` | **[2026-09-22 신규]** AI 프록시(Google Apps Script 웹앱) 소스 사본 — `callAiBackend`가 호출하는 GAS. 외부 배포라 수정 후 Apps Script 편집기에 붙여넣고 **기존 배포 편집 → 새 버전**으로 배포(새 배포 만들면 URL 바뀜). 인증 없는 공개 URL이므로 키 대체 사용·메일 조회 같은 기능을 다시 넣지 말 것 |
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
