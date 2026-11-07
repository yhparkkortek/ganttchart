# CLAUDE.md

이 파일은 Claude Code(및 다른 AI 코딩 도구)가 이 저장소에서 작업할 때 참고하는 안내서입니다.
**작업 전에 이 파일부터 읽으면, 관련 파일을 찾으려고 여러 파일을 열어보거나 grep으로 전체를 훑는
과정을 건너뛸 수 있어 토큰 소비가 크게 줄어듭니다.**

## 프로젝트 개요

KORTEK 사내용 간트차트(Gantt Chart) 웹앱 — 프로젝트 일정 관리 + 메일 자동 분석/발송 +
Telegram 알람 + 주간 업무 보고 + 캘린더 뷰를 하나의 페이지에서 제공합니다.

- **프런트엔드**: `kortek_pm.html` 하나의 정적 HTML + `js/` 아래 다수의 `<script>` 태그.
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

## ✅ "고쳤다"의 정의 — 검증 규칙 (2026-10-30)

**증거는 "사람이 실제로 지나는 경로"를 한 번 통과한 것.** 부품 단위 호출은 증거가 아니다.

- **못 돌렸으면 못 돌렸다고 먼저 쓸 것** — 보고에 "확인한 것 / 확인 못 한 것"을 같이 적는다.
  2026-10-29 칩 표 사고: 렌더러(`_qaBuildRowChipTable`)만 직접 불러 "표가 그려진다"를 확인하고
  **고쳤다고 보고**했다. 정작 깨져 있던 건 루프→`calls`→부착부 **연결**이라 그 테스트로는 절대 안 잡혔다.
  사용자가 "개선이 안 되었는데?"라고 하지 않았으면 그대로 넘어갔다.
- **키·네트워크·SAP이 없어서 못 돌리는 건 검증 생략 사유가 아니라 하네스를 만들 사유다.**
  가짜는 **경계에만**(그 사고에선 `callAiBackend`/`getActiveAiKey`/`_extractGanttQaAiText` 3개만 스텁),
  안쪽은 진짜 코드로 돌린다. 안쪽을 가짜로 만들면 테스트가 자기 자신을 테스트한다.
- **실패가 나면 하네스부터 의심할 것** — "코드가 틀렸나, 테스트가 틀렸나"를 먼저 가른다.
  위 사고의 첫 재현 실패는 **가짜 실패**였다(스텁이 호출 **순서**로 분기했는데 다른 경로가 첫 호출을 먹음).
  순서가 아니라 **내용**(프롬프트에 특정 표시가 있는지)으로 분기하게 고치니 바로 재현됐다.
  → 스텁은 호출 순서에 기대지 않게 만들 것.
- **같은 검증을 두 번 만들었으면 파일로 남길 것.** 그 자리에서 만들고 버리면 다음에 또 만든다.
  이 저장소는 **자동화 테스트가 0개**라, 그 자리를 사람이 매번 최종 검사원으로 메우고 있다.

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
**(2026-10-27) PreCompact 훅은 `hookSpecificOutput.hookEventName`을 지원 안 함(스키마 오류로 매번 실패) — `systemMessage` 필드만 써야 통과한다.**

## ⚠️ 가장 중요한 규칙: 로딩 순서 = 전역 스코프 순서

`<script src="js/...">` 태그 순서가 곧 실행·참조 순서. 파일명 숫자가 로딩 순서를 반영.

- 각 파일은 독립 모듈이 아님. `const`/`let` 최상위 변수도 이후 로드 스크립트에서 그대로 보임.
- 파일을 쪼갤 때 **top-level statement 경계에서만** 자를 것 — 함수/블록 중간에서 자르면 문법 오류.
- **✅ node 있음(2026-10-15 확인, `C:\Program Files\nodejs\node`) — 단 회사 PC 얘기다.** 1차 검증은 `node --check js/파일.js`가 가장 빠름. ⚠️ (2026-11-08 실측) **집 PC 엔 node·oxlint·NAS 설정이 전부 없다** — 거기선 브라우저 콘솔 파싱 명령(아래)이 유일한 문법 검사고 node 하네스는 회사 PC 에서 돌려야 한다.
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
| `19-shared-modal-drag.js` | 공통 모달 드래그 + 최소화(하단 taskbar) + **8방향 크기조절·헤더색 테두리·화면 안 보정**. `_makeDraggable(id, handleId)` 하나로 전부 딸려 온다. ⚠️ 잡는 띠는 **테두리가 한가운데**(바깥13/안쪽13, 투명) — 안쪽만 두면 **스크롤바에 덮여** 안 잡힌다. 헤더를 잡으면 드래그만(리사이즈와 동시 시작 금지). `offsetParent`로 보임 판정 금지(fixed는 항상 null) → `docs/modal-ux.md` |
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
| `26-topic-profile.js` | Phase 6 토픽 프로파일. `_tpMaybeAutoRegen(fileId,rows,colIdx,projectMeta)`로 헤드리스 프로젝트 자동 재생성(fileId별 독립 쿨다운). **뷰어에서 항목 ×삭제/클릭 수정/추가** — 사람 편집은 `profile.human`(removed/added/summary/editedAt)에 따로 적혀 재생성·메일 신호가 못 되살린다. Drive/캐시에서 들일 땐 **`_tpAdoptStoredProfile` 필수**(통째로 덮으면 사람 편집 소실). ⚠️ **사람 이름은 keywords/distinguishers 금지**(오매칭 원흉, 2026-10-29) — 주소록·담당자 기준 `_tpStripPersonNames` |
| `27-topic-contamination.js` | Phase 8 토픽 오염 감지·AI 자가진단(`_tcRunDiagnosis`, `_tcApplyFix`) |
| `26-gantt-search.js` | 간트차트 내 키워드 검색 |
| `28-new-project-wizard.js` | 새 프로젝트 마법사. `_npwOpen(prefill, 'MP(EC)')` — 미분류 메일 AI pre-fill 지원 |
| `29-new-project-cluster-detect.js` | Phase 9 완전 미분류 군집 감지 → 신규 프로젝트 배너 제안. **스스로 프로젝트 생성 안 함**. 예시 메일은 상태별 보관 개수 `_NCD_SAMPLE_KEEP`(데이터)로 줄여 저장(project_index 830KB 중 654KB가 예시였다). ⚠️ AI 판정은 **한 스윕 8개 상한 + 간격**(`_NCD_JUDGE_*`) — 상한 없을 때 백로그 76연발로 하루 한도를 태웠다(2026-10-21) |
| `35-material-cart.js` | 🧺 자재 보관함 — SAP 자재청구/입고(MB21 예약) 장바구니. **Phase 1 "업무 보관함"(14c)과 다른 것**. 🖱 우하단 칩은 **끌어서 옮긴다**(자리는 `matcart_chip_pos_v1`) — ⚠️ 누르기와 끌기를 가르지 않으면 **놓는 순간 모달이 같이 열린다**(5px 넘게 움직였을 때만 드래그로 보고 그 다음 click 한 번을 삼킨다) · ⚠️ 옮길 땐 `right/bottom` 을 `left/top` 으로 바꿔 쓸 것(그대로 더하면 마우스와 **반대로** 움직인다) |
| `36-sap-login.js` | 🔑 SAP·그룹웨어 로그인 설정 모달. 그룹웨어 자동 로그인 게이트 `_gwEnsureLogin`(재시도 금지 가드)도 여기 |
| `37-project-cache.js` | 프로젝트 데이터 3-Layer 캐시 |
| `38-bom-tab.js` | 📋 BOM 탭 + **Elec Parts 내장 BOM**. SAP 텍스트 파서 `_bomParseSapText`(설치지점 연속 행 병합), 행 클릭 조회 `bomSelectComponent`, 엑셀 출력, `_elecBomItemCode`(주요자재에서 부품 코드). ⚠️ **화면·엑셀은 한 가지 "뷰 상태"를 공유한다** — 가시행은 `_bomTreeRows`(접힘) → `_sortRows`(정렬은 **보이는 행만**) → `_bomVisibleRows`(둘을 합친 입구) 한 줄기로만 구한다. 렌더 2곳과 엑셀 2곳이 전부 이걸 쓰므로 **한쪽만 고치면 화면과 엑셀이 조용히 어긋난다**. 정렬이 접힘을 무시해 통째로 펼쳐지던 사고(2026-10-19) 대응. 헤더는 `flex-wrap:nowrap`이라 폭이 모자라면 줄바꿈이 아니라 **버튼 라벨이 2줄로 깨진다**(여유 7px뿐 — 요소 추가 시 다른 칸을 줄일 것) ⚠️⚠️ **계층(모자 관계)은 `_bomHierOk(st)`로 렌더 시점에 `st.rows`를 보고 판정한다**(2026-11-05) — 파서가 계산한 `hierarchyOk`를 조회가 store 에 안 실어서, ALV 에 **정렬이 걸린 응답**(팀 공용 계정이라 누가 `/KTK_LOC` 레이아웃에 정렬을 넣으면 전원에게 반영)이 와도 경고 없이 **남의 부모 밑에 자식을 그렸다**. 깨진 모드에선 `_collapsed` 키가 **레벨**이라 엑셀도 `_bomLevelGroups` 로 같이 묶는다. 계층이 깨지면 **백엔드가 그 레이아웃의 정렬을 SAP에서 직접 읽어**(`_sap_read_alv_sort`, 읽기 전용·팝업 반드시 닫기·라이브 미검증) `sortInfo` 로 화면에 적는다 — 레이아웃을 고쳐 저장하면 **옛 정의는 영영 사라진다**(ALV 엔 버전 기록이 없다). 사람이 할 일은 SAP `[레이아웃 변경…] ▸ 정렬 순서` 비우고 같은 이름으로 저장 →`docs/sap-lookup.md` |
| `39-groupware-calendar.js` | 그룹웨어 일정을 Calendar 탭에 겹쳐 표시 |
| `40-qa-tool-router.js` | 🛠 AI 문답 도구 자율 호출 — `QA_TOOLS` 레지스트리(데이터)·인자 검증·에이전트 루프. **읽기 전용**. 새 조회 기능은 여기 한 줄 추가 → `docs/qa-tool-router.md` |
| `42-page-excel-io.js` | 📄↔📊 페이지 ↔ 엑셀 왕복(출력 → 엑셀 수정 → 다시 불러오기). 인쇄 버튼 **왼쪽에 런타임 삽입**. 대상·시트 구성은 `PAGE_EXCEL_SPECS`(데이터) 한 곳 — 새 페이지는 항목 하나만 추가. 통째 교체 + 되돌리기. 파생 뷰(Calendar·주간보고·알람)는 되돌려 넣지 않음. **🤖 비규격 파일(PDF·TXT·HTML·남의 엑셀)은 AI가 매핑** — 블록의 `ai:{fields,labels,prompt}`(데이터)에 적고, 규격 파일은 AI를 **안 거친다**(결정론 우선 + 무료 키 하루 한도). 적용 전 미리보기 승인 필수. 현재 Customer SPEC만 연결됨. **📄 한 장 출력**: `spec.onePage`(데이터)를 달면 블록들을 **시트 하나**에 구역으로 쌓고 `■ 개요` 머리글로 다시 쪼개 불러온다(AI 없이 결정론 왕복, 옛 여러-시트 파일도 그대로 읽힘). 색은 `_cpXlsxRole` 팔레트 — Summary 적용 |
| `43-briefspec-units.js` | 🧩 Customer SPEC을 **제품구분자(모델)별**로 보관. `tabData.briefSpecByUnit[모델]`, `tabData.briefSpec`은 **지금 모델의 배열을 가리키는 별칭**(M.C의 `mcTable`↔`mcRevisions.R1`과 같은 방식)이라 기존 8개 파일은 손 안 댐. 제품구분자는 M.C/BOM과 **공유**(`mcActiveUnit`). 옛 Model A/B/C는 `bsMigrateFromModelCols()`가 열 이름(`bsColLabels`)을 모델명으로 삼아 자동 이전 — 파일 열 때마다 확인, 멱등. `mcSwitchUnit`·`collectTabData`·`populateTabData`를 **감싸서** 끼어든다 |
| `45-mc-import.js` | 🧾 M.C Table — 협력사/사내 M.C 엑셀(R1 시트 **B~K 열**)을 **AI 없이** 읽는 고정 양식 파서 + 여러 파일/시트를 한꺼번에 받아 **어느 제품구분자에 넣을지 고르는** 선택 화면. 머리글은 **6행**, **M열부터는 전혀 다른 표**(패널 후보 비교)라 통째로 읽으면 안 됨, D열 '...COST' 계산행과 **라벨 없는 총합계 행** 제외, Revision 블록에서 끊음. 원가 쌍이 둘(Proto A·MP)뿐이라 PROTO B는 비움. 'MECH' 보조 시트도 잡히므로 기본 체크 꺼둠 |
| `47-approval-compose.js` | 📝 기안 작성 — **기존 기안을 틀로, 값은 지금 열린 프로젝트**에서 채운다(원본 값 그대로 복사는 `gw_approval_copy`). 매핑은 `APPROVAL_FIELD_SOURCES`(데이터): `meta`/`spec`/`summary`/`user`/`blank`, 안 적으면 **원본 유지**. spec 라벨은 **별칭 목록**. ⚠️ 칸마다 **출처를 보여준다** — 틀린 값이 결재선을 타고 올라가는 게 제일 위험. 사람이 **고친 값만** 적립(자동값까지 저장하면 사전 오염). 매핑은 현재 **7개 양식**. 본문이 자유 서식인 양식은 **본문 HTML까지 복사**한다(`docs/groupware.md` 8-0-3). 미리보기 승인 후 임시저장, **상신 안 함** |
| `50-parts-category-pages.js` | 🗂 **PARTS** 탭(옛 Elec Parts) — 주요자재 구분 **전부**가 **AD BD와 같은 비교표**를 쓴다. 전용 도표가 없는 구분은 ① `ELEC_PART_TYPES`에 공용 기본 항목(`GENERIC_PART_SPEC_SCHEMA`, js/22d)으로 등록 ② 화면·헤더 버튼은 **AD BD 한 벌을 복제**하고 id 안 `adbd`만 치환(`_pcpEnsureView`) — HTML에 9벌 붙여넣지 않는다. 그래서 추가/펼치기/엑셀 저장/AI 추출이 기존 엔진(js/22e)에서 그냥 돈다. 구분·아이콘·NAS 폴더는 `ELEC_CATEGORY_META`(js/23, 데이터) 한 곳, NAS는 `PARTS/<구분>`. NAS 사양서 → AI 추출은 기존 "항목 추가 ▸ AI로 추출"에 **파일만 꽂는다**(`_pcpAiFromFile`) — 추출기를 복제하지 않는다. → `docs/doc-store.md` |
| `51-panel-lib-import.js` | 📚 회사 **패널 비교표 엑셀(`REFERENCE` 시트) → 팀 공용 패널 라이브러리 일괄 이식**. AI 안 씀(라벨이 앱 항목과 이름까지 맞는다 — 실측 패널 146개·항목 109종·칸 9,981개). **읽기 1회+쓰기 1회**(146번 upsert면 Drive 왕복 292번), **항목 단위 병합**(파일에 없는 `Item Code` 등은 안 지움), 모델명 기준 멱등. 라벨 별칭은 `PLI_LABEL_ALIASES`(데이터). 진입은 js/42 `preParse`(AI보다 먼저)와 PANEL 추가 모달 `📁 NAS에서`. → `docs/doc-store.md` |
| `55-project-list.js` | 📒 **Project list** — 제품(모델) 전수 목록(사내 "제품 SPEC" 엑셀 91열). **팀별 관리**(`App_Config/ProjectList_<팀>.json`, 기본 개발3팀) — 주소록과 같은 빈-덮어쓰기·`savedAt` 동시성 가드. 열·줄임말·셀 글자수는 전부 데이터(`PL_COLUMNS`/`PL_SHORT`/`PL_CELL_MAX`). 머리글은 **한 줄 + 줄임말 + 말풍선**. NO 숫자 클릭 = 행 메뉴(위아래 이동·추가·삭제·📌고정). ⚠️ **NAS 자료는 파일 이름을 안 바꾸고 앞 숫자로 색인**(`PROJECT LIST/CUSTOMER`, 7자리=고객PN·6자리=KTK PN) + 행 위로 드래그앤드롭. ⚠️ 검색은 디바운스 필수(타자마다 전체 재렌더가 112ms였다). **탭 진입 175~250ms → 38~57ms**(2026-10-30) — ① 바뀜 게 없으면 안 그림(`plRenderIfStale`/`_plViewStale`) ② 칸마다 달던 onclick·고정열 style 을 **위임 핸들러 + 열 단위 CSS** 로 ③ **자리표시 행**(`data-lazy`, 인쇄 전엔 `_plHydrateAll`). ⚠️ `content-visibility:auto` 는 **배경 탭에서만 빨라 보이는 착시**였다 — 렌더 수치는 보이는 창에서 자식 배치까지 강제해 재라. 📜 도면에서 읽는 건 **REVISIONS / DISPLAY INFORMATION MATRIX 두 표뿐**(`plOpenRevisions`, Agile REV 칸의 📜·문서함 [📜 이력]) — 옵 30개 항목 추출·`dwg*` 열·[도면 분석] 버튼은 **2026-10-30에 통째로 삭제**(사용자 의도와 달랐다). ⚠️ **실제 데이터는 저장소에 안 넣는다**(GitHub Pages 공개) → `docs/project-list.md` |
| `56-bom-part-lookup.js` | 🔎 **"이 제품에 쓰인 패널/터치 뭐야"** — BOM 에서 **부품 종류만** 집어 준다(AI 안 씁). ⚠️ **다단계 전개 고정** — 패널은 완제품 바로 아래가 아니라 **5단계 아래**에 있다(단층으로 찾으면 조용한 오답). ⚠️ 종류는 **자재그룹(WGBEZ60, `대분류/중분류`)** 으로 가른다 — 내역 글자로 찾지 말 것(패널 행 내역엔 "PANEL" 이 없고, `G/PNL MOD`는 기구물이다). 부품명 자리는 사내 자재그룹표 DESC' RULE 이 정한다(`MATGROUP_NAME_POS`, 구분자 618개 — FOG=0번째, TSP=1번째). 어휘는 `BOM_PART_KINDS`(데이터) 한 줄 추가 — **종류 말이 없으면 내역 구분자 이름으로도 받는다**(`_bomSepHit`, `MATGROUP_NAME_POS` 키 860개를 어휘로 재사용 — "HN VBY1 명 확인해줘"). 🔗 결과는 **행 클릭 칩 표** — 사양서·사용처·가격·SAP 메뉴·Project list·복사. 사양서 폴더 경로는 **여기 안 적는다**(`cats` 만 적고 js/23 `ELEC_CATEGORY_META` 에서 읽는다) → `docs/sap-lookup.md` |
| `57-storage-adapter.js` | 🔀 **저장소 어댑터(Drive ↔ 사내 NAS)** — `window.fetch`·`gapi.client.drive.files` 경계 두 곳만 감싼다. 플래그 OFF 가 기본이고 그럴 땐 **아무것도 안 한다**. → `docs/nas-dsm.md` |
| `54-mail-body-store.js` | 📧 **메일 원문 본문을 프로젝트 파일 밖으로**(2026-10-28) — 프로젝트엔 앞 2,000자 + `_mailRaw.bodyRef`, 전문은 Drive `MailBodies/<key>.txt`(1건 1파일, text/plain). 읽기는 `_mbFullBody`: **NAS .eml → Drive → 앞부분**. 옮기기는 `_mbOffloadSweep`(열고 20초 뒤·10분마다, 업로드 확인된 행만 줄임). **열려 있지 않은 프로젝트는 `_mbOffloadAllProjects`**(켜고 2분 뒤·30분마다, 열린 시트는 절대 안 건드림), 배분 원장은 행에 이미 있는 메일이면 300자. ⚠️ 전문이 필요하면 `body2000` 직접 읽지 말 것 → `docs/mail-pipeline.md` |
| `53-page-nas.js` | 📁 **페이지별 NAS 자료실** — 엑셀 왕복이 없는 파생 뷰(알람·캘린더·주간보고)에도 `📁 NAS` 를 단다. 폴더는 `PAGE_NAS_FOLDERS`(데이터), 여는 건 **열기·올리기만 하는 탐색기**(`_dsOpenBrowser`, js/48). ⚠️ 같은 탭에 js/42 가 이미 달았으면(`#px-share-*`) **안 단다** — 두 개가 된다. 폴더 철자는 NAS에 있는 그대로(`CALENDER` 포함). → `docs/doc-store.md` |
| `59-daily-report.js` | 📔 **일일 업무보고** — 사람×날짜 파일 1개(`App_Config/DailyReport/<YYYY_MM>/<날짜>__<계정id>.json`)라 **같은 파일을 둘이 안 쓴다**. 초안은 메일 분석이 써 둔 `[핵심내용]`/`[To do]` 를 꺼낸다(**AI 호출 0회**, 실측 보유율 99.7%). ⚠ 메일 유래 판정은 **표식(`_mailRaw`·`＊AI📧`)이 아니라 칸 내용**(`_mailContentParse`) — 표식은 날아간 전력이 있다. 가드: `rev` 충돌·빈 덮어쓰기 거부·읽기 실패시 미저장. 데이터는 `DAILY_FIELDS`/`DAILY_DAY_TYPES`/`DAILY_POLICY`/`DAILY_PATHS`. ⚠️⚠️ **파일 이름의 근거는 `window._nasAccount`(NAS 계정) 하나 — `currentUserName` 금지**(2026-11-05 실측): 그건 **표시용**이라 한글 실명·`'비로그인 (로컬)'` 이 들어오고 ascii 치환에서 전부 깎여 옛 코드가 `'unknown'` 으로 떨어뜨렸다 → `<날짜>__unknown.json` **한 파일에 팀원 전원이 몰린다**(이 설계의 단 하나뿐인 불변식이 조용히 깨진다). 모르면 **빈 값 + 쓰기 거부**(`_dailyRequireKey`), 입구 셋은 `dailyEnsureIdentity()` 를 await. 같은 함정이 `TaskInbox_<표시이름>.json`(js/14c)에 **아직 남아 있다**. 📎 **사진·파일 첨부**(2026-11-05): 바이트는 보고 JSON **밖**(`<월>/files/`, 폴더 이름이 **글자로 시작**해야 DSM 이 받는다)에 두고 보고엔 참조만 — 앱은 고르기·드래그·**Ctrl+V 캡처**, 휴대폰은 **봇에 사진/문서를 보내면 된다**(`caption` 이 곧 업무 한 줄). 사진은 긴 변 `imgMaxPx` 로 줄여 올린다(실측 2.8MB→40KB). ⚠️ 올리기는 **고른 즉시**라 저장 전엔 고아 바이트가 잠깐 생긴다 — 그래서 모달을 열 때 폴더 목록 1콜로 대조해 없는 참조를 ⚠️ 로 드러낸다(목록이 비면 **판정하지 않는다** — 권한 거부도 빈 배열로 오니까). 🖥️ **여는 건 연결 프로그램이 기본**(`/nas/app/open-native`) — `blob:` URL 엔 **파일 이름이 안 실려서** 누르면 확장자 없는 GUID 로 받아졌다(2026-11-05 신고). 폴백은 "볼 수 있는 종류만 새 탭(`_docMimeOf`, js/42 데이터) · 나머지는 `<a download>` 로 이름 붙여 받기". 🔁 **(2026-11-05 2차)** 칸은 `오늘 한 일 / 해야 할 일 / 막힌 일`(`DAILY_FIELDS` 하나 — 표 머리글·엑셀이 거기서 읽는다) · 항목에 **업무 구분**(`cat`, 간트 `_담당구분`→`_normalizeWbsDiscipline`, 목록은 `WBS_DISCIPLINE_CATEGORIES`)과 프로젝트를 싣고 화면·엑셀은 `_dailyItemLine` 한 함수 · **행 더블클릭**은 **내 행에서만** 연다 · 자동 갱신은 60초마다 **목록 1콜 서명 비교**(탭이 안 보이면 네트워크도 안 쓴다). 🐞 모달이 **한 번 닫으면 안 열리던 것** = `display:flex` 를 상자 만들 때만 줬다(명단 모달도 같은 버그) · 목록이 **첫 진입에 비던 것** = js/23 의 마지막-탭 복원 IIFE 가 js/59 **보다 먼저** 돌아 훅이 아직 없었다 → js/59 가 스스로 본다. 🖱 **드래그앤드롭은 문서 capture 에서 가로챈다**(2026-11-05) — 배경(`#daily-modal`)은 `pointer-events:none` 이라 상자에만 걸면 **배경에 떨어뜨린 사진을 앱 전역 드롭(js/04f)이 받아 간트 엑셀로 열려 한다**(실측: 보고 0건·전역 1건). 업무 카드에 떨어뜨리면 그 업무로(`data-daily-item`), 텔레그램 사진은 카드의 **업무 고르는 칸**으로 옮긴다. 📱 텔레그램 서식은 `업무 이름` 줄 + `한일:`/`할일:`/`막힌일:` — 태그가 먼저 오면 **마지막 업무**에, 그마저 없으면 `(제목 없음)` 을 만든다(버리지 않는다). ⚠️ 어휘에 **띄어쓰기 없는 말**이 빠지면 안내한 서식이 안 먹는다. 보고-단위 칸은 지웠고 **옛 글은 노란 띠 + 치우기**로 남긴다. 🧩 **보고는 업무별**(2026-11-05) — `items[]` 가 `note`(오늘 한 일)·`next`·`issue` 를 각자 들고, 사진은 `_doc.files` **배열 하나 그대로 두고 `task` 꼬리표**로 업무에 붙인다(항목 안으로 옮기면 **꼬리표 없는 옛 사진이 전부 사라진다**; 꼬리표 없음 = 기타). 칸 이름은 `DAILY_FIELDS.itemKey` — ⚠️ `done`→**`note`** 다(바꾸면 옛 글이 안 보인다). ⚠️⚠️ 파일 카드의 번호는 **걸러 낸 목록이 아니라 `_doc.files` 안의 진짜 자리** — 아니면 두 번째 업무의 사진을 지울 때 첫 번째 것이 지워진다(node 하네스는 DOM 을 안 봐서 **못 잡는다**). 화면은 **한 겹 표** `이름|종류|구분|업무|오늘 한 일|해야 할 일|막힌 일|첨부` — 업무 하나가 한 줄이고 이름·종류는 `rowspan`(열 정의는 `DAY_COLS`, 데이터). ⚠️ `rows` 가 사람당 **여러 줄**이다. 엑셀도 **한 업무가 한 줄**. 고르기 창은 문서에 하나뿐 (`_dailyPickTask` 로 어느 업무인지 기억 — 업무마다 만들면 id 가 겹쳐 늘 첫 번째만 열린다). 🚨 **자동 적립이 `8`·`851`·`NO`·`고객` 을 담고 있었다**(2026-11-05) — `changeLogs.rowName` 은 **업무명이 아니라 No. 칸 값**이고(js/04i `logChange`), 어떤 기록은 **행 인덱스**다(js/04g·14d·04d). → **No. 로 간트에서 되찾고 못 찾으면 안 담는다**, 행 조작 기록은 `DAILY_TOUCH_SKIP_COLS`(데이터)로 건너뛴다. ⚠️⚠️ 하네스가 못 잡은 이유는 **픽스처가 rowName 에 업무명을 넣어** 틀린 계약을 흉내 냈기 때문이다. 🗂 **간트에서 불러오기는 열린 프로젝트만 보지 않는다**(2026-11-05 요청) — 간트는 한 프로젝트만 메모리에 있지만 사람은 여러 개를 맡는다(실측 12건 중 5건). 이제 `project_index.json` 으로 **내 팀 프로젝트 파일을 읽어** 같은 함수(`scanOne`)로 훑는다. ⚠️ **역할→담당자는 그 프로젝트의 `projectMeta` 로 푼다** — `_msResolveCategoryAssignee`(js/15b)는 **열린 프로젝트**의 meta 를 보므로 그대로 쓰면 업무가 내 것/남의 것으로 **뒤바뀐다**(하네스 돌연변이로 확인). ⚠️ 모달은 **기다리지 않는다**(실측 열기 165ms · 12개 훑기 2.0초, 끝나면 **후보 목록만** 다시 그린다 — 모달 전체를 다시 그리면 치던 칸에서 포커스가 날아간다). ⚠️ `updated_at` 로 캐시하되 **실패는 캐시하지 않는다**. ⚠️ **내가 안 든 프로젝트는 한 건도 안 담는다**(`onlyMyProjects`) — 안 거르니 후보 170건 중 154건이 남의 일이었다. 한계값은 `DAILY_SCAN`(데이터). 🎨 **구분 열은 팔레트 테마색, '미작성' 은 그 보색**(2026-11-05) — 회색으로 박아 두면 테마를 바꿔도 이 표만 안 바뀐다. 색은 인라인이 아니라 **클래스**(`.daily-cat-cell`/`.daily-none-row`/`.daily-none-txt`)로 달고, ⚠️ **두 곳을 같이** 고칠 것 — `styles.css`(팔레트 미적용 기본 청록)와 js/21 `_cpApplyLive`(라이브, `!important`). 하나만 고치면 "기본 테마에서만 색이 안 바뀐다". 🔎 하루 보기는 `구분|업무|프로젝트` **안쪽 표**(`itemsCell`) + **담당자·프로젝트·구분 필터**(선택지는 그 날 있는 값만, **필터 걸기 전** 목록으로 만든다). 📒 **명단은 주소록이 원본**(2026-11-05) — `_roster.json` 은 📣·사용안함·별칭·계정id 교정만 든다. 팀은 주소록 `dept` 로 거르고(전사 394명이다), **이름=부서인 행은 그룹 메일 주소라 뺀다**, 계정id는 **메일 @ 앞부분**(한 명으로만 확인한 규칙 → 하루 보기가 **명단에 없는 작성자도** `*` 로 보여 준다), chat_id 는 주소록 `telegramId`. 합칠 땐 **사람이 적은 값이 이기고 빈 칸만** 채운다. 백엔드는 파일만 보므로 **📣 담당 PC 한 대가** 결과를 한 번 적는다(`dailyRosterSyncIfNotifier`, 더하기만·rev 충돌이면 포기). ⚠️⚠️ **저장 전 초안이 통째로 덮어 사진·텔레그램 항목이 조용히 사라질 수 있었다** — 이제 합친다(글은 초안, `files` 는 NAS 가 진실, `rev` 도 NAS 기준). ⚠️ 백엔드는 첨부 하나가 실패해도 **큐를 막지 않는다**(바깥 `except` 의 `break` 로 떨어지면 사진 한 장이 그 뒤 모든 사람의 보고를 멈춘다) → `docs/daily-report-design.md` |
| `60-telegram-qa-bridge.js` | 🤖📱 **텔레그램 ↔ AI 문답 다리**(2026-11-08) — 폰에서 `/ai 질문` → 담당 PC 백엔드(`_tg_ai_handle`, 일일보고와 같은 `getUpdates` 루프)가 NAS `App_Config/TelegramAI/<key>__tg<id>.json` 에 접수 → **열린 앱**이 15초마다 집어 **먼저 지우고(선점)** 입력창에 넣어 `sendGanttQaMessage()` 를 부른다 → 새 말풍선을 모아 텔레그램으로 회신 + 문답창에 📱/✅ 안내. AI 문답을 **베끼지 않고 입구 하나를 부른다**(js/33 과 같은 방식) — 앱에서 되는 질문은 다 된다. ⚠️ 일일보고와 가르는 기준은 **접두어뿐**(`TG_AI_PREFIXES`, 백엔드 데이터) · ⚠️ 쓰기 확인 버튼은 폰에서 못 누른다 — "PC 에서 눌러 달라" 를 덧붙인다 · ⚠️ **입구가 `alert()`/토스트로만 말하고 끝나는 길이 있다**(실측: AI 키 없음 → alert 1회·말풍선 0) → 가로채서 "ℹ️ 앱 알림" 으로 싣는다 · 앱이 2분마다 `online__<key>.json` 을 찍어 백엔드가 접수 답장에 "앱이 꺼져 있는 것 같다" 를 정직하게 적는다 · 수치는 `TG_QA_BRIDGE`(데이터), 킬스위치 `gantt_tgqa_off`. 🔌 **앱 밖에서 묻는 통로**도 같은 큐다 — `tools/ask-app-ai.py "질문"`(`reply:'file'` → `answers/<id>.json`). 검증 `py -3 tests/test_telegram_ai_bridge.py` 32/32 · `node tests/telegram-qa-bridge.test.js` · 브라우저 `tests/telegram-qa-bridge.browser.js` → `docs/telegram-ai-bridge.md` |
| `41-qa-write-tools.js` | ✍️ 쓰기 도구 — **AI가 스스로 실행 안 함**. 초안→사람 확인 1회→자동. `verified:'pending'`은 요청 본문 미확정이라 실행 차단 |
| `52-approval-doctypes.js` | 📋 전자결재 **문서 종류 카탈로그** `APPROVAL_DOC_TYPES` — 양식 이름·부르는 말·**실측 칸 이름**(최근 문서를 실제로 읽어 확인). 말에서 양식 판정(`_apvDocTypeHit`) → 그 양식의 최근 문서를 틀로(`apvComposeByForm`). ⚠️ 양식 이름끼리 **부분문자열**이라 포함 판정만 하면 엉뚱한 틀을 집는다(`제품코드등록신청서` ⊂ `원자재/반제품코드등록신청서`). 상세 → `docs/groupware.md` 8-0절 |

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

### ⚠️ PARTS 부품 종류는 런타임에 늘어난다 (2026-10-22)

`ELEC_PART_TYPES`에 주요자재 구분이 **실행 중에** 등록된다(js/50). 그래서 **종류 목록을 코드에 박지 말 것** — 네 개를 박아 둔 자리가 전부 사고 지점이었다:
- 화면/버튼 숨기기는 `.elec-spec-view` · `[id^="eh-"][id$="-btns"]` 선택자로(js/23 `_switchElecView`, js/38 `_elecBomOpen`). 박아 두면 새 구분 비교표가 BOM 아래 남아 겹친다.
- Elec Parts 엑셀 시트는 `window._elecPartsTypeList()`(js/04k) 하나로 — 쓰는 쪽(js/04k)과 읽는 쪽(js/22a)이 같은 목록을 쓴다. 파서는 **파일에 나온 종류만** 덮어쓴다(옛 4종 파일이 새 구분을 지우지 않게).
- 언어 전환 재렌더(js/04j)도 `ELEC_PART_TYPES[view]` 등록 여부로 판단 — 예전엔 adbd/convbd만 적어 TOUCH CTRL이 빠져 있었다.

## 🔁 이어서 할 일이 있으면 먼저 — `docs/handover-2026-10-26-groupware.md`

그룹웨어 전수 조사·전자결재 기안 작업의 **인계 메모**(어디까지 했고 뭐가 남았는지).
남은 일: ① 기안 작성 앱에서 한 번 끝까지 ② 잘못 만든 기안 220176 정리 ③ 보고·works·task 모듈 조사
④ `APPROVAL_FIELD_SOURCES` 더 채우기 ⑤ `gw_capture_write.py` 재작성(저장소에 없음).
**남은 일이 다 비면 그 파일은 지워도 된다.**

## 📚 상세 문서(`docs/`) 색인 — 해당 작업을 할 때만 읽을 것

**CLAUDE.md는 색인만 — 상세 기록은 `docs/*.md`에 추가. CLAUDE.md가 비대해지면 토큰 소비 재발.**

### 🔁 인계 메모 3건 — **공통 블로커는 하나, 백엔드 재시작** (처리되면 이 줄과 파일을 함께 지울 것)
- `docs/session-handover-2026-10-26.md` — NAS 문서 저장소를 앱 전체에 붙인 세션. 재시작 전엔 `/doc/mail-parse` 404(실측). ⚠️ 그 세션은 **브라우저가 막혀 화면을 한 번도 못 봤다** — 눈으로 확인할 목록이 그 문서에 있다
- `docs/handover-2026-10-26.md` — 사람이 해야 할 일(백엔드 재시작·IMAP 권한·보류 큐 179건)과 하다 만 것
- `docs/handover-2026-10-26-groupware.md` — 전자결재 기안 작업 인계(위 "🔁 이어서 할 일" 절의 그 문서)

### `docs/improvements.md` — 🛠 개선 사항 메모 (계속 갱신하는 목록, 2026-11-05 시작)
- **읽을 때**: "다음에 뭐를 고칠까" 를 정할 때, 성능 작업을 시작하기 전
- 고친 것(숫자와 함께) · 다음에 할 만한 것(근거 있는 것만) · **재 본 뒤 안 하기로 한 것**(이유와 함께)
- ⚠️ **숫자 없는 항목은 적지 않는다** — "느린 것 같다"는 개선 항목이 아니라 **측정할 일**이다
- ⚠️ "안 하기로 한 것"을 먼저 볼 것 — option/svg 줄이기·`content-visibility` 는 **이미 재 보고 버렸다**

### `docs/ai-harness-environment.md` — 🤖 AI 자율 하네스 환경 (설계 노트, 2026-10-30)
- **읽을 때**: "AI가 이 일을 혼자 돌게 하려면 뭐가 필요한가"를 설계할 때, 앱에 실행 루프를 붙일 때
- 자율성은 모델이 아니라 **환경의 성질**. 여섯 부품(지도·눈·관문·기록·바닥·분업)과 현재 자가진단
- ⚠️ **AI에게 판정을 맡기지 말고 후보를 고르게 할 것** — 판정은 코드. 실행 루프엔 **상한 필수**
- 실행 루프(런타임)와 수정 루프(개발)를 섞지 말 것 — 앱은 자기 소스를 못 고친다

### `docs/mail-pipeline.md` — 메일 분석/원문/번역/토픽 프로파일 재생성
- **읽을 때**: 메일→업무 등록 경로, 다중 배분, 미분류 재분석, 번역, 보관함 삭제
- 업무 복사/이동 코드에서 `buildMailTaskRow` 4번째 인자 `mailRaw` 빠뜨리지 말 것 — "원문 보기" 조용히 사라짐
- 헤드리스 Drive PATCH 직전에 `_tpMaybeAutoRegen(fileId,rows,colIdx,projectMeta)` 호출 — `rows/colIdx/projectMeta` 생략 시 열려있는 엉뚱한 프로젝트를 읽음
- 백그라운드 루프에서 `recalculateSchedules()`·`saveToGoogleDrive()` 반복 호출 금지 — 끝에 1회만
- 보관함 삭제: `markDeleted()` 호출 필수 + 묘비(tombstone) 없으면 Drive 재로드 시 되살아남
- 새 localStorage 저장소: `window.STORAGE_REGISTRY`(`js/34-storage-doctor.js`)에 정리 규칙 등록
- **🎯 (2026-11-04) "POP3 인증 실패: invalid user or password" 근본 원인 — 계정 출처가 둘이었다** — 2026-08-31 `5c776a7` 이 `ms_saved_userid`/`ms_saved_pw` 에 **쓰는 코드만 지우고 읽는 코드 3곳을 남겼다**(읽기 3·쓰기 0). 그래서 **수동 수집은 지금 계정**, **백그라운드 자동수집은 그때 저장된 옛 비밀번호**로 1분마다 로그인하고 있었다(저장한 적 없는 PC 는 자동수집이 조용히 안 돎, 사내 noreply 면제도 빈 배열). 서버는 멀쩡하다 — 로그인 없이 CAPA 만 읽어 확인(`tests/mail-server-probe.py`: gw 는 USER/PLAIN/APOP 광고, LOGINDISABLED 없음). → ① 계정 출처는 `window._msCredentials()` **하나**(localStorage 직접 읽기 금지) ② 죽은 키는 로드 때 삭제 ③ **인증 실패 잠금**(`ms_auth_block_v1`) — 메일에만 이 가드가 없어 무한 재시도했다, 푸는 곳은 알람 설정 저장 한 곳 ④ 판정은 백엔드 `auth:true` **플래그**(문구 문자열 매칭 금지, 권한·연결 거부는 auth 아님) ⑤ 오류에 서버:포트+가린 계정. 검증 `tests/test_mail_auth_block.py`(15건) → `docs/mail-pipeline.md`
- **(2026-11-04 정정) 메일 **받는 서버 주소는 보내는 주소와 다른 장비**다** — 실측: gw 는 993/995/110/143 열림·465 거부, kmail 은 그 반대. 11-03 에 발송 주소(`mailHost`)를 수신에 물려줬다가 `[WinError 10061] 연결 거부` 토스트가 60초마다 떴다(원래 인증 오류의 진짜 원인은 아직 모름). → 수신 전용 `recvHost`(알람 설정 ▸ `받는 서버`, 비우면 기본값)로 분리하고 **발송 주소를 수신에 쓰는 길은 끊었다**(구버전 프런트의 `mailHost` 는 `ignoredMailHost` 로 드러냄). 연결 실패 문구에 **어느 서버:포트인지 + "비밀번호 문제가 아닙니다"**(`humanize_mail_conn_error`). 검증 `python tests/test_mail_recv_host.py`(21건). ⚠️ 백엔드 재시작 필요 → `docs/mail-pipeline.md`
- **(2026-11-02/03) 알람 설정에 "수신은 POP3만 사용" 체크박스 + 수신도 설정된 서버 주소 사용** — ①IMAP 거부 문구가 `_PERMISSION_HINTS`에 없는 계정은 수동으로 IMAP을 건너뛰게(`protocol:'pop3'`) ②`IMAP_HOST`/`POP3_HOST`가 gw.kortek.co.kr로 하드코딩돼 있어 다른 서버(예 kmail.kortek.co.kr) 계정은 수신이 늘 "invalid user or password"였음 — `mailHost`로 수신에도 설정값 전달. **백엔드 재시작 필요**(상시 프로세스)
- **(2026-11-02) 새 메일 → 텔레그램 알림은 백엔드 루프**(`_mail_watch_tick`, 기존 스케줄러에 붙음) — 브라우저가 꺼져 있어도 돌아야 하니까. 설정은 `mail_watch_config.json`(.gitignore), 화면은 알람 설정 ▸ 메신저 서버 설정. ⚠️ **로그인 시도 금지**(계정 잠금) · **메일 열지 않음** · **처음 켤 땐 안 보냄**(쌓인 것 폭탄 방지) · **발송 실패 시 lastId 안 올림**(다음에 재발송) · **AI 안 씀**(하루 한도를 알림이 먹는다) · 백엔드 **재시작 전엔 404**(설정 화면이 "구버전"으로 구분해 표시) → `docs/mail-pipeline.md`
- **⚠️ Phase 9 군집 판정은 "AI 업무 분석 모달을 열 때마다" 돈다** — `pending`이 쌓여 있으면 사람이 분석을 누른 적 없어도 스윕당 8개씩 AI가 나간다(실측 494개 누적). **임계치·필터를 완화하기 전에 누적 백로그 크기를 먼저 확인할 것** — 완화는 과거 데이터에 소급 적용된다. 모르고 임계치만 내려 한 스윕 76연발로 하루 한도를 태운 사고(2026-10-21) 이력이 문서에 있음

### `docs/gantt-internals.md` — 일정 계산/탭 복원/표 오버레이/AI 검색
- **읽을 때**: `recalculateSchedules`·`_calcStartTs`, Undo, `.no-td` 오버레이, 체크박스 일괄 작업
- Undo 스냅샷은 구조 공유(증분) — 복사본 직접 수정 금지, 복원 시 반드시 새 배열로
- 그룹행 날짜순 정렬은 하위 전체 재귀 최솟값(`effectiveTs`)으로 — 배열 순서 부산물 아님
- 체크박스 다중 선택은 배열 인덱스 말고 **행 객체 참조 Set** — 배경 재렌더로 인덱스 어긋남
- **(2026-10-28) 숨은 행은 빈 자리표시 `<tr data-lazy>`로 렌더된다** — 행을 보이게 하는 새 코드는 `display` 풀기 전에 `_ganttHydrateRow(tr)` 필수(안 하면 빈 행). 보이기 규칙은 `_ganttComputeRowVisibility` 한 곳
- **▌ (2026-11-05) "No. 칸의 빨간 바"가 곧 핀셋(알람) 표시였다 — 이제 그 막대 자체가 토글이고 📌 아이콘은 없앴다**(사용자 요청). 막대는 `.row-pin-bar`(js/04j), 꺼짐=연회색·켜짐=팔레트 **보색**(js/21 — 파랑 테마면 빨강). ⚠️ 막대는 flex **바깥**에 absolute 로 둔다 — flex 안에 넣으면 칸 높이가 아니라 글자 한 줄(≈17px)만 덮는다(td 에 확정 높이가 없어 `height:100%`가 안 먹는다). 겹침은 flex 쪽 `padding-left:7px` 로 막는다. 🐞 함께 신고된 **"핀셋 알람 설정이 동작 안 한다"의 진짜 원인**: `_patchPinRowDom`(js/04e)이 `noTd.querySelector('span')`로 **첫 번째** span 을 집었는데 2026-10-28 에 그 앞에 드래그 손잡이(⠿)가 생기면서 **손잡이가 켜짐 스타일을 뒤집어쓰고** 아이콘은 영영 꺼진 모습이었다(데이터·행 색은 멀쩡) → **렌더러가 만든 DOM 을 "몇 번째 자식"으로 집지 말 것**. 검증 `tests/pin-bar.browser.js` 36/36 + 돌연변이 3종 → `docs/gantt-internals.md`
- **🖱🖱 (2026-11-05 2차) 그 막대는 "보이는데 눌리지 않았다" — 겉넓이가 아니라 `elementFromPoint` 로 재라.** 신고는 "잡기가 어렵다"였는데 작아서가 아니었다: 바로 뒤 flex `<div>` 가(배경이 투명해도 클릭은 그대로 먹고, 둘 다 positioned 인데 z-index 가 없어 **DOM 순서가 늦은 쪽이 위**) 덮어서 **보이는 막대의 한가운데 적중률이 0%**, 칸 1,260픽셀 중 76픽셀(맨 왼쪽 1px 열+위아래 띠)만 눌렸다 → 361픽셀·중앙 100%. 고친 건 `z-index:1` + **투명 테두리로 클릭 폭만 6→14px**(`border-right:8px solid transparent`+`background-clip:padding-box`+`box-sizing:content-box`, 레이아웃 불변) + `.no-td > div > *{position:relative;z-index:2}`(손잡이·번호·AI체크박스가 제 클릭을 지킨다) + 헤더 막대 `::after`(65→390px²). ⚠️ 색은 **`background-color` 로만** — 단축 `background` 는 `background-clip` 을 되돌려 막대가 14px 로 뚱뚱해진다(js/21 도 같이). 🕐 두 번째 원인: 250ms 더블클릭 대기 동안 **화면이 무반응**이라 한 번 더 누르면 토글이 취소되고 알람 탭으로 튀었다 → 누르는 즉시 색만 선반영(`_pinBarPaint`). ⚠️⚠️ **`el.click()` 은 히트테스트를 건너뛴다** — 1차 하네스 27/27 이 이 고장을 못 잡은 이유다. 적중 검사 행은 **고정 머리글 밑을 피할 것**(`hitTestableTr`, 안 그러면 가짜 실패) → `docs/gantt-internals.md`

- **⚡⚡ (2026-11-05) "간트차트가 오히려 느려졌다" — 범인은 `renderTable()` 하나였다**(906행 전부 펼친 상태 실측). 2026-10-28 지연 렌더는 **접힌 상태**만 고쳤고, 사람은 일하려고 **펼친다** — 펼치면 예전 비용이 그대로 돌아온다. tbody 가 **8.71MB·노드 44,748개**였고 그중 **inline style 이 3.01MB(35%)** — 행마다 글자 하나 안 다른 같은 선언 905벌. → ① `toggleWbsBranchFull()` 이 **renderTable 을 안 부른다**(바뀌는 건 화살표 둘뿐) · 세 곳에 복사돼 있던 DOM 손질은 `_wbsSyncRowArrows` 하나로 ② 반복되던 inline style 은 `styles.css` 클래스로 ③ 칸마다 다시 하던 열 이름 정규화(한 번 렌더에 36,000번)는 `_rtCtx` 에 모았다. **가지 전체 펼치기 1,256ms → 108ms**(같은 기계·같은 순간 최솟값), tbody 7.03MB. ⚠️ **`renderTable()` 자체는 여전히 ~1.1초** — 행 908개를 전부 DOM 에 올려 두는 한 파싱+레이아웃 **~920ms 가 바닥**이다(`<select>` 1,814개를 전부 없애도 165ms뿐, option·svg 는 측정 한계 안). 더 빨라지려면 **스크롤 가상화**뿐이고, `renderTable()` 호출지가 **49곳**이라 한 곳 줄일 때마다 체감으로 돌아온다. ⚠️ 측정에 두 번 속았다 — **1회 측정은 2~3배 흔들리고**(내용을 지웠는데 더 느려지는 값이 나왔다) → 번갈아 돌리고 **최솟값**, **longtask 관찰자는 30초짜리 엉터리 값**을 준다 → 16ms 탐침의 밀림. 하네스 `tests/gantt-render-perf.browser.js`(수치+화면 서명)·`tests/gantt-row-style.browser.js`(33건, 돌연변이 4종 확인). ⚠️ inline 에 적혀 있다고 **그게 적용되던 값이 아니다** — 레벨1 날짜 칸의 `font-weight:normal` · 상세내용 칸의 `font-size:11px` 는 `!important` 규칙에 눌려 **원래부터 죽은 선언**이었다(그걸 기대값으로 삼으면 거꾸로 모습이 바뀜다) → `docs/gantt-internals.md`

- **⚡⚡⚡ (2026-11-05, 같은 날 2차) 스크롤 가상화 — 보이는 만큼만 칸을 만든다**(908행 중 **57행**). 위 1차에서 "전부 DOM 에 올려 두는 한 ~920ms 가 바닥" 으로 끝내었는데, 그 바닥까지 갔다. 2026-10-28 지연 렌더는 **접힌 행**만 자리표시로 둡고, 이제 **보이는 행이라도 스크롤 창 밖이면** 자리표시다 (`<td colspan=N class="gantt-lazy-td">` 하나, 높이는 실측값 `--gantt-row-h` — 그래야 스크롤 막대가 안 거짓말한다). **renderTable 1,146→ 77ms · 행 놓은 뒤 멈춤(드래그) 1,614~1,920 → 192~253ms · 전부 펼치기 → 163ms · tbody 7.03 → 0.45MB · 노드 44,848 → 4,208**. 열쇠: `_ganttViewportOrdinalRange`(어림)·`_ganttLazySweep`(진짜 픽셀, 렌더 직후+스크롤마다)·`_ganttMeasureRowH`·`_ganttHydrateAll`(js/04j). applyFilters 의 "40행 넘으면 통째로 다시 그린다" 지름길은 **없앤다**. ⚠️ **한 번 채운 행은 되돌리지 않는다**(되돌리면 위로 스크롤할 때 화면이 튀다) — 다음 renderTable 이 다시 "보이는 만큼"으로 리셋한다. ⚠⚠ **표를 읽어 밖으로 내보내는 새 코드는 `_ganttHydrateAll()` 을 먼저** — 안 하면 인쇄에 **빈 줄**이 찍힌다(`smartPrint` js/04f · `beforeprint`). ⚠⚠ **"표시 No." 는 `tr.dataset.vno` 로 읽을 것** — 자리표시엔 번호 칸이 없어서 AI 문답의 "42번 행으로 이동"이 **화면 밖 행을 못 찾는 조용한 오답**이 될 뻔했다. ⚠️ 검색(js/26)은 그대로 — 일치한 행을 전부 채운다(하이라이트 때문, 실측 837행 ≈0.6초). 느려진 건 아니지만 검색 중엔 가상화 이득이 사라진다 — 남은 일. 검증 `tests/gantt-virtual-scroll.browser.js` **32/32** + 돌연변이 4종(채우기 멈춤·인쇄 채우기 멈춤·높이 엉터리·vno 안 적음)이 정확히 해당 항목에서 잡히는 것까지 확인. ⚠️ 그 하네스는 **창이 실제로 보일 때만** 맞다(숨은 탭은 rAF 가 안 돌아 그 자리에서 멈춘다) → `docs/gantt-internals.md`

- **🖨️ (2026-11-05) 페이지마다 있던 "인쇄 (PDF)" 버튼 11개를 전부 없애고 **브라우저 인쇄(Ctrl+P)** 로 돌렸다**(사용자 요청). ⚠️ 그 버튼은 버튼만이 아니라 **세 가지의 기준점**이었다 — ① js/42 📊 엑셀 버튼이 붙는 자리 ② js/53 📁 NAS 버튼이 붙는 자리 ③ **인쇄 사본을 만드는 유일한 입구**. 그냥 지우면 ①②는 버튼이 조용히 사라지고, ③는 인쇄 CSS 가 사본 말고 전부 숨기는 터라 **백지**가 나온다. → ①② 앱커를 `.concept-header-box` 끝에 append 로 바꾸고(인쇄 버튼은 어느 탭에서든 그 헤더의 **마지막 자식**이었으므로 자리가 그대로다), 간트는 툴바 오른쪽 끝의 빈 묶음 `#gantt-toolbar-end` 안에 넣는다(`anchorMode:'append'`) • ③ 는 `smartPrint`/`printTabSection` 을 **준비(`_preparePrint*`) 와 인쇄로 갈라** `beforeprint` 에서 지금 보는 탭을 준비한다(⚠️ 그 안에서 `window.print()` 를 부르면 무한 재귀). ⚠️ **행 채우기를 직접 부른다** — js/04j·js/55 의 `beforeprint` 가 더 **나중에 등록**돼 순서가 뒤라, 안 부르면 자리표시 행이 그대로 복제돼 종이에 **빈 줄**이 찍힌다(실측: 149행 중 101행). 덩으로 고친 것 둘 — `printing-tab-notice` 가 `_clearPrintingModeClasses` 에서 **빠져 있어** 한 번 공지를 인쇄하면 그 뒤 모든 인쇄에 공지용 레이아웃이 얹혔다 · Notice 뉴는 `.concept-tab-wrap` 이 없어 원래 **백지**였다(이제 탭 요소 자체를 사본 원본으로 쓴다). styles.css 의 "사본 말고 전부 숨김" 규칙에도 **printing-mode 조건**을 붙였다 — 준비가 안 된 경로로 들어와도 백지 대신 화면 그대로 찍힌다. 검증 `tests/print-and-gw-status.browser.js` **45/45** + 돌연변이(행 채우기 무력화 → 빈 행 101개로 정확히 실패)
- **🏢 (2026-11-05) Calendar 머리말의 "🏢 그룹웨어 일정 40건"을 안 띄운다**(사용자 요청) — 바로 옆 토글 버튼이 채워진 색 + 같은 말을 이미 하고 있어 머리말 줄만 비좁았다. 건수는 버튼 말풍선(`_gwSyncToggleBtn`)으로 옮겨다. ⚠️ **실패·로그인 필요·불러오는 중은 그대로 보여 준다** — 조용히 삼키면 "일정이 없는 것"과 "못 불러온 것"을 구분할 방법이 없다

### `docs/ai-qa.md` — 💬 AI 문답 (`04g`/`04h`/`04j`)
- **읽을 때**: AI 문답 프롬프트·로컬 명령·`[[ACTION]]` 태그·드롭다운·히스토리
- **프롬프트 문자열 안 백틱(`` ` ``) 절대 금지** — 바깥 템플릿 리터럴이 깨져 파일 전체가 죽음
- 필수 규칙은 `_buildGanttQaPrompt` 치환 이후 append 구간에 추가 — `gantt_qa_prompt`가 기본 템플릿 통째 대체함
- AI-free 로컬 명령 블록: `return` 전에 `_ganttQaRecordQuestionFreq(question)` 직접 호출 — AI 호출 직전 한 곳에서만 기록되므로 생략 시 "자주 쓰는 질문"에 안 쌓임
- `_ganttQaPatternKey`(빈도 집계, 4자리+ 숫자 제외) vs `_ganttQaNormalizeQ`(재질문 감지, 숫자 다르면 다른 질문) — 정반대 요구사항, 절대 합치지 말 것
- **(2026-11-02) 답변 속 마크다운 파이프 표는 렌더러(`_mdToHtml`, js/04g)가 `<table>`로 그린다** — 표를 만드는 04h 블록이 아니라 렌더러를 고쳤다(AI가 만든 표도 같이 정리됨). 구분선 `|---|` 이 뒤따를 때만 표로 본다. 짧은 열은 nowrap(안 그러면 긴 제목 열만 바늘처럼 좁아진다)
- **(2026-11-02) 메일 목록도 행 클릭 칩 표다** — 전자결재 표와 **같은 공용 경로**(`_qaBuildRowChipTable`). 칩 목록은 `QA_ROW_CHIP_KINDS.gwmail`(js/40, 데이터), 표를 만드는 곳은 `_qaMailPushTable` 하나. 칩은 행마다 다르다(주소 없는 보낸이는 답장 숨김, 번호 없으면 SAP 숨김). 🏭는 **기존 SAP 자재 메뉴를 그대로 연다**. ⚠️ **칩이 자연어를 입력창에 되돌려 보내면 다른 결정론 블록이 가로챌 수 있다** — "아래 메일을 요약해줘"가 '메일' 때문에 메일 **목록** 블록에 걸려 17건을 다시 조회했다(그 자리에서 AI 호출로 교체). ⚠️ rawHtml 말풍선은 `tgText`를 같이 실어야 텔레그램으로 나간다
- **(2026-11-02) "텔레그램으로 보내줘" = 직전 답변 전문을 텔레그램으로** — 도구 루프에 맡기지 말 것(프롬프트의 최근 대화가 250자로 잘려 표를 복원 못 한다, 실측에선 `gw_mail_send`를 집고 포기). 어휘는 `QA_TELEGRAM_SEND`(js/32, 데이터), 수신자는 주소록 ID. ⚠️ 백엔드가 `parse_mode: HTML`이라 `<`·`&` escape 필수 + 4,096자 분할은 줄 경계로만(태그가 끊기면 메시지가 반송된다)
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
- **⚠️ (2026-10-20 정정) `/LOC`을 쓰지 말 것 — 정렬이 걸려 있어 설치지점이 어긋난다.** 설치지점이 여러 곳인 부품은 ALV가 행을 쪼개 주는데(첫 행에만 구성부품, 나머지는 **EBORT만** 있고 다른 값은 전부 빈칸), 정렬되면 그 연속 행들이 뒤로 몰려 **주인을 못 찾는다**(자재 654321에서 한 부품이 199개를 다 먹음). → **`layout=none`**(화면 기본 레이아웃)을 쓸 것. STUFE·EBORT를 둘 다 주면서 자연 순서라 연속 행이 제 부품 바로 뒤에 온다 — 264행(부품 65+연속 199), 64개 부품 전부 '지점 수 = 수량' 일치 실측. 파서(`_bomParseSapText`)에 수량 초과분을 버리고 `locOverflow`로 신고하는 가드가 있다, `/SEOK_설치지점_재`는 이름과 달리 **STUFE가 없어 계층 파싱 불가**. `/LOC`이 빠뜨리는 WGBEZ60은 ZMM009 보강이 채움. **ZMM009 119컬럼에 통화 컬럼이 아예 없음** = 표준가격은 KRW 고정(단가 환종 혼용 대응 코드는 데이터 기반으로 넣어둠)
- **⚡ (2026-10-29) 속도는 정확도 다음 — 근거는 실측뿐, 추측으로 sleep 줄이지 말 것.** 핵심 수치: `findById`는 **경로 해석이 2.8ms**라 참조를 캐시하면 같은 읽기가 9~10배 빨라진다(`sbar.Text` 3.14→0.35ms) · 트리 순회(`_find_by_id_substring`/`_scan_screen`)는 **빈 화면에서도 1회 1.2초** · **`sendVKey`/`press`는 완전 동기**라 ZMM005/ZMM006/MM03/ZMM009 모두 **134~168ms에 반환하고 이미 목표 화면**인데 뒤에 `sleep(1.0)`을 더 기다린다(정적 sleep 215곳 합계 171.8초) · `session.Busy` 읽기는 0.24ms라 폴링이 사실상 무료. 치환은 **삭제가 아니라 "기대 신호 폴링, 상한은 기존 sleep 값"**(최악=오늘, 보통 10배, 느린 날엔 오늘보다 더 정확) — **조건을 못 만들겠으면 그 sleep은 건드리지 말 것**. 그리드는 컬럼 수가 곧 시간(ZMM009 119컬럼). 측정표·측정법 → `docs/sap-lookup.md` "속도 — COM 왕복 비용 실측"
- **(2026-11-02) "999001 제품에 사용된 패널명 확인해줘" — BOM 부품 찾기**(`js/56`, AI 안 씁, 실측 20초). 다단계 494행에서 자재그룹으로 가려 패널 1건·터치 3건. 답이 Project list 의 Panel·TSP 값과 일치하는 것까지 교차 확인. ⚠️ 단층 전개는 패널을 **못 찾는다**(5단계 아래) · 이름 옆에 **내역을 항상 같이** 보여 준다(제조사가 잡히거나 ALV 가 자른다) · `notKw`(js/32)가 "가격·재고" 질문을 가로채지 않게 막는다
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
- **⚠️ (2026-10-29) 로그인 JS 안에서 `location.href`로 이동하지 말 것 — 이동하면 그 JS가 자기 컨텍스트를 죽인다.** 그 예외를 "제출됨"으로 오해해 "로그인 실패"로 답했고(서버엔 요청이 간 적도 없음), 프런트 게이트가 영구 잠겨 **"설정창에서는 되는데 AI 문답에서는 안 되는"** 증상이 났다(첫 시도가 이동 비용을 치르고 죽고, 그 덕에 두 번째가 성공). 이동은 `_ensure_login_page()`(파이썬 CDP), 준비 확인은 짧은 eval 여러 번. `login_once()`의 `retryable`(=자격증명이 서버까지 갔는가)만 재시도 허용 — `failed`/`captcha_*`는 1회 후 영구 금지 그대로
- **(2026-10-30) 메일 서버 설정 ↔ 그룹웨어 자동 로그인이 같은 계정이라 양방향 동기화된다** — 실측으로 전제 확인(메일 user의 **@ 앞부분 = 그룹웨어 user**, 인사관리는 사번이라 **별개**). 그룹웨어 설정이 없으면 `load_login_config()`가 메일 설정에서 읽어 쓰고(파일은 안 씀, 비밀번호는 `cfg_password(cfg)` 하나로), 어느 쪽을 저장해도 반대쪽이 같이 저장된다(`_sync_gw_from_mail`/`_sync_mail_from_gw`, host/port는 보존). ⚠️ **Drive 불러오기(`/mail/decrypt`·`/all/decrypt`)에는 일부러 안 붙였다** — `mail_secure.enc`는 **팀 공용 파일 한 개**라 붙이면 남의 그룹웨어 계정이 팀원 PC마다 깔리고 실패가 쌓여 **계정이 잠긴다**. 동기화는 그 PC에서 사람이 직접 저장할 때만 → `docs/groupware.md`
- **⚠️ 페이지 안 `el.click()`은 이 사이트에서 무반응 — 클릭은 `click_in_gw()`(CDP Input, 신뢰된 마우스 이벤트)로**(2026-10-19 실측). 핸들러가 `#loginForm`에 **위임**돼 있어 버튼 자체엔 리스너가 0개다. "보안문자가 안 뜨는데 로그인도 안 된다" = **제출이 서버까지 간 적이 없다**는 지문 — 자격증명 의심 전에 CDP Network로 요청이 나갔는지부터 확인할 것
- **상신(결재요청)은 하지 않는다 — 임시저장까지만.** 기안 입력칸 `editorForm_N`은 양식마다 달라 **열 머리글/행 라벨로 역매핑**(하드코딩 금지)
- 공급업체는 `MARA-ZLIFNR`이 비면 **ZMM006 → LIFNR → ZMM005**로 조회. 제조사(MFRPN) ≠ 공급업체
- "승인원"은 SAP **표지**와 그룹웨어 **기안**이 공유하는 단어 — `기안/결재/상신`이면 그룹웨어, `표지`면 SAP, 둘 다 없으면 **되묻는다**
- **(2026-10-22) 기안은 양식(문서 종류)을 먼저 판정한다 — `APPROVAL_DOC_TYPES`(js/52)**. `kw`에 `기안 작성` 같은 일반어가 있어 어떤 요청이든 양식 하나로 샜고(사고 문서 220176), strongKw만 두니 나머지 양식은 전부 되묻기로 떨어져 사람이 매번 참고 문서번호를 집어줬다. 이제 양식을 알면 **그 양식의 최근 문서를 결재함에서 찾아** 틀로 쓴다. 칸 이름은 **문서를 실제로 읽어** 적을 것(추측하면 미리보기에서 전부 '원본 기안'으로 떨어진다). 8-0절 참고
- **(2026-10-29) 기안 본문이 `editorForm_*`이 아니라 `contentViewer` iframe 안의 표인 양식이 있다** — 그래서 "그대로 복사"가 제목 한 칸만 보여줬다. 이제 iframe을 같이 읽고 **칸 배경색**으로 라벨/값을 가른다(`body`/`bodyFields`/`bodyRows`). ⚠️ `bodyFields`를 `fields`에 합치지 말 것 — 채울 칸이 없는데 채운다고 약속하게 된다. 목록 표의 문서번호는 **채번 전이면 `—`**(내부 id는 툴팁). **본문 복사 구현됨** — 작성 화면의 본문은 입력칸이 아니라 **DEXT5 에디터 하나**라 `DEXT5.setBodyValue(html, id)` 로 넣는다(`approval_read(with_html)` → `approval_draft(body_html)`). ⚠️ 양식 이름은 화면에 없어 **`GET /api/approval/document/{id}`** 로 받고, 그 API 의 `docBodyContent` 는 **결재선 서명까지 든 문서 한 장**이라 본문으로 쓰면 안 된다 (본문은 contentViewer DOM). 상세 → `docs/groupware.md` 8-0-1~8-0-3절
- **(2026-10-30) 기안 작성에 실행 루프가 붙었다** — 사람이 "이대로 임시저장"을 **한 번** 누르면 판정 실패를 스스로 고쳐 다시 채운다. **판정은 코드**(`approval_draft` 가 되읽어 찍는 `log`), **AI 는 화면에 실제로 있는 칸(`fieldNames`) 중에서만** 고르고 목록 밖 이름은 버린다, **상한은 `APV_LOOP.maxRetries`**(기본 2, js/47 데이터). ⚠️ 다시 채울 땐 `/gw/approval/draft-fill`(`reuseScreen`) — `copy` 를 또 부르면 **원본 문서로 이동해 작성 화면을 떠나고 문서 id 가 또 생긴다**. 검증은 `tests/approval-loop.browser.js` → `docs/ai-harness-environment.md` 4절
- **모듈마다 구조가 다르다** — 메일은 `iframe#mail-viewer` 안(최상위 body 10자, 그래서 클릭이 다 빗나간다), 전자결재는 최상위. 조사 전에 iframe 여부 확인
- **요청 형식도 모듈마다 다르다** — 메일 `message/list`는 POST JSON(`keyWord` 대문자 W), 전자결재 `doclist`는 GET 쿼리스트링
- **양식 트리(`apprform/tree`)만 `{data:…}` 래핑이 아니다** — jsTree 배열 그대로. `j.data`로 받으면 0건. 양식 97개 카탈로그 → `docs/groupware-forms.md`(런타임 하드코딩 금지)
- **번들 `/api/` 문자열 추출이 호출 없이 쓰기성 경로까지 목록화해 준다** — 단 모듈 화면을 **열고 난 뒤**, URL은 `split('?')[0]`로 확장자 판정
- **게시판 조회/요약은 구현됨**(`gw_board_recent`, 읽기 전용) — 서버에 기간 필터가 없어 코드가 자른다. `date_to`는 **중단이 아니라 건너뛰기**(최신순이라 중단하면 "지난주"가 0건). "지난주"는 롤링 14일이 아니라 **달력 주**(`_gwPeriodRange`/`GW_PERIOD_WORDS`, js/32)
- 사내 공지는 본문이 **이미지뿐**인 경우가 흔함(평문 0자) — 빈 문자열만 주면 "조회 실패"와 구분 불가라 `bodyNote`로 사유를 드러낼 것
- 백엔드 라우트 검증은 `app.test_client()`로 — 사용자가 돌리는 5000번 프로세스를 죽이지 말 것(예약 발송·SAP 작업 중일 수 있음)
- **(2026-10-22) 주소록·알림·쪽지 읽기 이식됨** — 도구 `gw_contacts`/`gw_notifications`/`gw_notes`(js/40, 읽기 전용), 브릿지 `contacts_search`/`notifications`/`notes`. 세 모듈 다 **진입만으론 호출이 0건**이라 번들 추출로 경로를 뽑아 확정했다. ⚠️ 함정: 주소록 `keyword`는 **`searchType=or`가 없으면 조용히 전건(375건)** · 쪽지는 **POST JSON**(GET 405, form은 400)이고 `keyWord`·`offset`을 서버가 무시 · 알림 분류는 쿼리가 아니라 **경로**. 상세는 docs/groupware.md 8-1절
- **⚠️ 그룹웨어 조사 중 `/http-bind/`·`/api/bosh/*`는 기록하지 말 것** — 사내 메신저(XMPP) 채널이고 요청 본문에 **SASL PLAIN 인증 토큰**이 실린다(2026-10-22 덤프에 들어와 즉시 폐기)
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
- **여러 날짜는 `days[]`(최종 상태 목록, 멱등)** — 행 단위 제어는 전부 `ch` 체크박스(일괄입력·삭제 다 체크된 행만). 한 날짜당 한 행. 날짜 일괄입력이 식사유형을 지우므로 **같은 날짜의 직전 값을 물려준다**. AI가 "행 추가"를 하려면 읽기 도구 `insa_workplan_form` 으로 **먼저 읽고 전부 담아야** 한다
- **식사유형도 채운다** — 코드표는 화면 콤보에서 읽어 맞춤(`_meal_options`). 날짜·시간 **뒤에** 해야 하고(날짜 일괄입력이 식사유형을 지운다) 점심·저녁 **둘 다** 필요(한쪽만 주면 기존값 유지)
- **⚠️ 크롬이 http 사이트를 https 로 올려 막는다** — 그 탭은 `chrome-error://`라 DOM 이 비어 "로그인 화면을 찾지 못했습니다"로 끝난다(자격증명 문제 아님, 요청이 서버에 간 적도 없음). `launch_chrome` 플래그 + 프로필 `Preferences`(크롬 떠 있을 때 쓰면 덮어써짐 — Popen 직전에만) + `blocked` 판정 후 `/gw/chrome-restart` 자동 복구. **브라우저 종료는 `Browser.close`** — `/json/close/<id>`는 탭만 닫는다
- `regForm`은 **POST 전용**(GET 405) + CDP `window.open`은 팝업 차단 → 새 탭을 `/kInsa`로 띄워 그 안에서 폼 POST. 405 탭을 남기면 **조회 경로가 그 탭을 집는다**

### `docs/groupware-research-tools.md` — 🔬 조사 도구 전문 (새 세션 인계용)
- **읽을 때**: 그룹웨어/사내시스템에 **새 쓰기 기능**을 붙일 때, "눌렀는데 아무 일도 안 난다"를 디버깅할 때
- CDP 조사 스크립트 **전문**이 들어 있다(캡처·GET구조·스크린샷·신뢰된 클릭·콘솔관찰·번들스캔). 예전엔 세션 scratchpad에만 있어 세션을 지우면 사라졌다
- **쓰기 payload는 번들로 안 배워진다** → 사람이 1회 수행하는 동안 관찰하는 절차가 2절에 있음
- 남은 pending 쓰기 3개(일정 등록·메일 발송·게시판 글)와 미검증 항목도 1절에 정리

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

### `docs/purchase-order.md` — 🛒 구매오더 (PDF→AI→ZMMR060/ZMM018) + 자재 입고 처리(ZMM062)
- **읽을 때**: 구매오더 요청, 세금계산서/거래명세서 복수 처리, 발주서 출력, **입고처리(ZMM062)**
- 이 회사(코텍, 사업자번호 130-81-44628)는 항상 구매자 — **코드에서도** 협력사 후보 제외
- 확인 1회 후 SAP 입력~저장~발주서는 완전 자동 — 되돌리라는 요청 없이 임의로 정지 금지
- **(2026-10-30) 입고처리를 발주와 따로 할 수 있다 — 번호 → 수령인 → 안내 3단 사슬.** 번호가 있으면 전기 **전에** 읽기 전용으로 확인(`_ganttQaGrPrecheck`: 미완료 있으면 전기 / 전부 완료면 전기 안 하고 안내 / 0건이면 다음 단계), 번호가 없거나 틀리면 **수령인=현재 접속자 실명**으로 ZMM062 조회(`usr/txtS_WEMPF-LOW`), 그래도 없으면 "구매오더 정보를 확인해 주세요" 하고 대기 복귀. ⚠️ **WEMPF는 계정 ID가 아니라 한글 실명**(KKR034 ↔ 박용훈)이라 `getActiveUserName()`을 넘긴다. ⚠️ 수령인 결과는 **1건이어도 자동 전기 금지** — 미완료 목록에 2021~2024년 방치 오더가 섞여 나온다(실측 10건). 트리거는 `_sapCapKwHit(.., 'goodsreceipt')` 카탈로그로 교체 → `docs/purchase-order.md`
- **(2026-10-28) ZMM062 입고처리 실환경 첫 검증 — "결과 확인" 팝업은 그리드다, 메인 상태바는 비어 있음**: 저장(`btn[5]`) 직후 뜨는 팝업은 Yes/No 확인창이 아니라 전기 결과를 담은 그리드(`wnd[1]/shellcont[1]/shell`, 컬럼 STATUS/LIFNR/EBELN/EBELP/MBLNR/MESSAGE) — 팝업을 닫아도 메인화면 상태바는 빈 문자열이라, 옛 코드는 실제로 성공(자재문서 생성)했는데도 "확인 못 함"으로만 보고했다. 이제 팝업 그리드를 직접 읽어 문서번호/행별 성공여부를 판정 → 상세는 docs/purchase-order.md

### `docs/project-list.md` — 📒 Project list (제품 전수 목록 페이지, `js/55`)
- **읽을 때**: Project list 페이지 수정, 열 추가, 엑셀 입출력, 제품별 NAS 문서함/AI 문서 분석
- ⚠️ **실제 제품 데이터를 저장소에 커밋하지 말 것** — GitHub Pages 공개. 코드엔 빈 표 + 불러오기만
- 머리글 대조는 공백을 **지운다**(한 칸으로 줄이면 `회로담당\n(PM)` 이 안 맞아 열이 통째로 빠진다)
- `table-layout:fixed` 는 **표 폭**을 줘야 열 폭이 지켜진다(안 주면 28열이 전부 35px)
- NAS 자료는 **PN 열**, 폴더 `PROJECT LIST/CUSTOMER`(띄어쓰기 그대로) — 이름 안 바꾸고 **파일명에 그 번호가 들어 있으면** 걸린다(7자리=고객PN, 6자리=KTK PN). ⚠️ 숫자 키워드는 **앞뒤가 숫자면 제외** — `654321`가 `1654321` 안에 있어 남의 도면을 끌어왔다
- ⚠️ **앱이 보는 PDF 글자는 브라우저 pdf.js** 다(`_pxExtractText`) — PC에서 PyMuPDF로 뽑아 세운 규칙은 **줄 모양이 정반대**(pdf.js=행 하나, PyMuPDF=칸 하나)라 앱에서 "알아볼 수 없는 도표"가 됐다. 표 파서는 **두 모양 다** 받고 회귀도 둘 다로 확인
- 목록 자동 불러오기는 `plEnsureLoaded()` — ① 부트 3초 ② `populateTabData`(프로젝트 여는 모든 길) ③ 탭 진입, **savedAt이 가장 늦은 쪽**을 쓴다. 탭 진입 1회만 부르던 때는 그 한 번이 실패하면 로컬 캐시(1행)만 보였다
- NAS 한글 파일 이름은 **멀쩡하다** — CP949로 보이면 시험한 터미널(cp949 `curl`)을 의심할 것
- 백엔드 `DOCSTORE_APP_FOLDERS` 에 `'PROJECT LIST'` 추가됨 → **백엔드 재시작 전엔 자료 연결만 400**

### `docs/backend-auto-update.md` — 🔄 백엔드 자동 업데이트/재시작 + 🚀 처음 설치
- **읽을 때**: `/self-check-update`·`/self-update`, `kortek_backend.zip`, `.bat`/`.vbs` 변경, **처음 설치(`kortek_setup.bat`)**
- **🚀 (2026-11-04) 처음 설치는 `kortek_setup.bat` 하나** — 앱의 [⬇️ 설치 파일 받기](설치 안내 맨 위) → 받은 파일 더블클릭. 이미 설치된 폴더 찾기(바로가기에서) · Python 없으면 winget 사용자범위 · zip 받기/풀기 · 시작프로그램 등록 · `/health` 확인까지. ⚠️ **브라우저는 프로그램을 실행 못 한다** — "버튼 한 번"은 원리상 불가능하고 2클릭이 바닥. ⚠️⚠️ 이 파일에 **괄호 IF 블록 금지**(PowerShell 한 줄의 `)` 가 블록을 닫아 **조용히 잘린다** — 돌려보고서야 알았다) · 임시 `.ps1` 금지(삭제 타이밍 충돌) · **`.gitattributes` 에서 이 파일만 `-text`**(raw 로 받으면 LF 가 가서 cmd 가 깨진다). 검증은 `/dryrun`·`/selftest <폴더>`
- 새 배포 파일 추가 시: `_SELF_UPDATE_FILES` + `.claude/settings.json` zip 목록 **둘 다** 갱신
- **`/self-update`는 쓰기 전에 검증**(0바이트·`.py` 문법) + 하나라도 실패하면 전부 중단 + `.bak` 백업 — 깨진 파일이 main에 올라가 팀원 PC가 같이 죽은 사고(2026-10-02) 대응
- **백엔드 `.py` 커밋 전 `py -3-32 -m py_compile` 필수** — 그 한 줄이면 위 사고는 안 났다
- `.bat`/`.vbs`는 항상 CRLF(LF-only는 cmd 파서 오동작)
- **푸시 직후 `/self-update`는 raw CDN 캐시로 옛 버전이 최신 작업본을 덮어쓴 적 있음(2026-10-13)** — 이상하면 `git status`부터, `_fetch_github_raw`는 `?cb=` 캐시 우회

### `docs/html-corruption-recovery.md` — 🔥 HTML 인코딩 손상 복구
- **읽을 때**: 한국어가 `?◆◆`으로 깨지거나 배경 클릭 시 외부 사이트로 이동
- 원인: PowerShell `Set-Content`/`Out-File` → UTF-8 한국어 `?` 치환. **HTML 수정은 Python `open(...,'wb')`만.**

### `docs/nas-dsm.md` — 🗄️ NAS(Synology DSM) 연동 — 접속 권한을 사내 계정으로
- **읽을 때**: 구글 로그인/Drive 를 사내 계정+NAS 로 바꾸는 작업, `nas_dsm.py`·`/nas/*`
- **구글 로그인은 로그인이 아니라 Drive 접근 토큰** — 떼면 데이터 접근이 같이 끊긴다(저장소 교체와 한 몸)
- 쿠키 세션만으로는 DSM API 가 안 된다(119, SynoToken 미노출, SSO 패키지 없음) → **백엔드가 sid 를 들고 있는다**. DSM 은 **CORS 헤더를 안 준다**
- ⛔ **400(비밀번호 틀림)과 402(인가 거부)를 섞지 말 것** — 400 은 쌓이면 **이 PC 의 IP 가 차단**(계정이 아니라 PC 전체), 402 는 카운터에 안 쌓인다. 1회 실패 후 `_BLOCKED` 로 영구 잠금(그룹웨어·SAP 과 같은 규칙)
- ⚠️⚠️ **로그인 조합은 `auth.cgi` + v3 + `session=FileStation` 실측 확정 — `session` 을 임의로 정하지 말 것.** DSM 은 이 값으로 "어느 응용 프로그램에 로그인하는가"를 판정한다. 앱 이름(`KortekGantt`)을 넣었더니 **402** 가 났고 v7/v6/v3 전부 402 라, 원인을 **NAS 계정 설정으로 오진해** 사용자에게 관리자 화면을 뒤지게 했다 → **"설정 문제"로 넘기기 전에 내가 보낸 인자를 문서와 대조할 것**(버전을 바꿔도 같으면 범인은 안 바뀐 다른 인자)
- ⛔ **같은 코드 숫자가 API 마다 뜻이 다르다** — `407` 은 Auth 에서 "IP 차단", FileStation 에서 **"폴더 ACL 거부"**. 한 표로 합쳐 뒀더니 권한 없는 팀 폴더 조회가 "IP 가 차단되었습니다"로 찍혔다(차단된 적 없음). `_msg(code, api)` 에 api 를 꼭 넘길 것
- ✅ **팀별 ACL 은 실제로 작동한다**(실측) — 공유 3개 중 **쓰기 가능 1개**, 개발팀 폴더 12개 중 **본인 팀·공통만 열리고 8곳 거부**. 권한 없는 공유는 **목록에 안 나오고**, 권한 없는 하위 폴더는 **보이지만 열면 407**. ⚠️ 그래서 `_listProjectFiles` 를 그대로 옮기면 ACL 켜는 순간 터진다(거부 폴더를 **건너뛰고 계속**하게 고칠 것)
- ⚡ **호출 수가 곧 시간이다 — 고정비 61ms × N.** 연결 재사용(`_http()` 의 `requests.Session`)만으로 **116→61ms, 1.9배**(매 `requests.post()` 는 요청마다 TCP+TLS 재협상). 항목당은 0.127ms 로 싸다. ⚠️ 처음엔 1,132개 폴더를 작은 폴더의 44.2ms 와 나란히 놓아 **"5배 느리다"고 읽힐 보고**를 했다 — 같은 일을 재지 않은 비교는 숫자가 맞아도 틀렸다
- ⌨️ 입력 사고 2건: **한글 IME** 로 `y`→`ㅛ` 가 들어가 HTTPS 가 꺼진 채 저장돼 400 이 났다(사람은 "비밀번호 틀림"으로 읽는다) · 터미널 입력이 안 되는 환경 → `nas_set_login.py --clip`(클립보드→DPAPI, 성공 시 클립보드 비움). ⚠️ `ctypes` Win32 는 **`argtypes` 전부 명시**(안 하면 핸들이 `c_int` 로 넘어가 터진다)
- 속도 비교: SMB 경유는 폴더 훑기 44.2ms·읽기 5.4MB/s — **선이 아니라 SMB 왕복이 잦아서**(RTT <1ms)라 사외/VPN 에선 더 나빠진다. API 쪽 수치는 아직 못 쟀다
- 📐 **1단계 배치(2026-11-03 결정): 팀별 파일까지 공용 폴더 한 곳.** 메일 배분은 팀 내에서만(배분 큐 불필요). 경로는 설정의 `root`/`team_root` 두 개뿐 — **2단계 이사는 `team_root` 를 채우는 것만으로** 끝난다(`nas_set_root.py --team-root`). 공용 데이터를 팀 폴더에 두면 **다른 팀 앱이 부팅조차 못 한다**(팀 폴더끼리 posix=0)
- ⚠️⚠️ **`CopyMove` 는 파일 이름을 유지한다 — 이름 바꾸기가 아니다.** 같은 폴더로 옮겨 최종 이름이 되길 기대한 건 **no-op** 이었고 최종 파일이 한 번도 안 생겼는데 `put` 은 `ok` 를 돌려줬다. 원자적 교체는 **임시 폴더에 최종 이름으로** 올리고 대상 폴더로 `overwrite` 이동
- 🔀 **어댑터(`js/57-storage-adapter.js`)는 기존 24개 파일을 안 고친다 — `window.fetch` 와 `gapi.client.drive.files` 경계 두 곳만 감싼다**(호출지점은 googleapis ~120·gapi ~110곳). 플래그(`localStorage.gantt_storage_backend='nas'`)가 아니면 **아무것도 감싸지 않고 곧 return** — 플래그 안 켜 본 사람의 코드 경로는 이 파일이 없을 때와 **동일**하다(실제 앱에서 확인). id 는 **경로에서 만든다**(`nas_d|f_`+base64url), 이름은 Drive 와 그대로. ⚠ 모르는 `q` 절은 **무시하지 않고 오류**(무시하면 조건을 덜 걸고 전건을 돌리는 조용한 오답). ⚠ `gapi.client.init` 이 stub 을 덮어 **세 겹**으로 막았다. 번역기 **52/0**(`node tests/storage-adapter.test.js`), **연결부는 아직 미검증**(콘솔에 `tests/storage-adapter.browser.js`, 백엔드 재시작 후)
- 🪞 **모드가 세 개다**(`gantt_storage_backend`): 없음/`drive`(지금과 같음) · `mirror`(**읽기는 Drive**, 쓰기는 Drive+NAS) · `nas`(둘 다 NAS). 미러의 불변식: Drive 응답을 그대로 돌려주고, Drive 실패시 미러 안 하고, **NAS 실패를 던지지 않고**, 기다리게 하지 않는다. ⚠⚠ 본문은 **`res.clone()`** 으로 — 한 번뿐인 그 읽기는 앱 못이다. ⚠ 기다리지 않는 대신 **경로별 줄**을 세운다(자동저장+수동저장 순서 뒤집힘). ⚠⚠ **모드마다 id 공간이 다르다** — 미러의 `parents` 는 진짜 Drive id 라 `relFromMeta`(NAS id 용)를 쏌다가 **NAS 에 한 건도 안 올라갔다**; 미러는 `folderRel`. 앱 루트에 안 닿는 폴더는 `OUTSIDE:` 로 **건너뜀**(고장 아님). 검증 16/0 — Drive 는 **바깥 경계에서만 가짜**, NAS 는 진짜(`tests/storage-mirror.browser.js`)
- ⚠⚠ **연결부를 한 번 돌렸더니 번역기 52/0 에도 버그 2건이 나왔다**(2026-11-03) — ① 백엔드가 **빈 `rel`(= 앱 루트) 조회를 400 으로 거절**해 `_listProjectFiles` 길이 막혔고, 더 나쁘건 어댑터가 그걸 **ACL 거부로 보고 조용히 건너뛰어** 목록이 빈 채 오류도 안 났다 → 건너뛰는 건 **403 만**, 읽기·sweep 만 `allow_root=True`(쓰기·삭제가 루트를 받으면 앱 데이터를 통째로 지운다) · ② `new Response('', {status:204})` 는 **TypeError** — 삭제는 됐는데 그 뒤에서 터져 "500 실패"로 보고됐다(`null` 이어야 한다). → 라우트 25/0 · 번역기 54/0 으로 회귀 박음
- ✅ **연결부 17/0 · 앱 자신의 `_listProjectFiles()` 가 NAS 에서 도는 것까지 확인**(2026-11-03). ⚠⚠ 그러다 **저장소에 매인 캐시** 문제를 재현해 잡았다 — `gantt_folder_cache_v1` 에 **Drive 폴더 id** 가 영속돼 있어 NAS 로 켜면 **팀 폴더가 통째로 조용히 사라졌다**(실사용 브라우저는 이 캐시가 꽉 차 있다). → **저장소 표식**(`gantt_storage_backend_active`)으로 바뀔 때 비우고(플래그 검사보다 **위**에 두어 킬스위치도 듣게), 모르는 부모 id 는 **던진다**. ⚠⚠ **localStorage 만 지우면 안 지워진다** — js/04b 가 먼저 로드돼 이미 메모리로 읽어 갔다(실제로 한 번 틀렸다). 캐시는 `BACKEND_SCOPED_CACHES`(데이터)에 **키 + 메모리 무효화 함수**를 같이 적을 것
- ⚠️⚠️ **DSM 은 "없는 파일" 다운로드에도 502 + "페이지를 찾을 수 없습니다" HTML** 을 준다 — 그걸 보고 "다운로드가 전역으로 죽었다"고 **오진**했다(실제론 내 put 버그). 502 면 **먼저 그 경로가 있는지 물을 것**. 그 HTML 을 바이트로 돌려주면 호출한 쪽이 **파일 내용으로 저장한다**
- ⚠️⚠️ **`getinfo` 는 없는 경로도 항목으로 돌려준다**(`code` 가 실림) — 안 걸러서 `exists()` 가 항상 True 였고 "썼는지 확인"이 무력했다. **`Delete` 도 성공을 주면서 안 지우는 경우가 있다**(코드 900, ACL 은 전부 허용인데도). **반환값은 증거가 아니다** — 쓰고 나서 한 번 더 물을 것(`_verify_written`)
- ⚡ 원자적 쓰기 1KB **348ms**(512KB 477ms). 임시 폴더를 **프로세스당 하나 재사용**(`.ganttput-<pid>-<rand>`) + `ensure_folder` 캐시로 **543→323ms**. 검증 9건은 `tests/nas-write-probe.py`(동시 쓰기에서 **완전한 JSON** 확인 포함)
- 🔌 **라우트(검증 33/33, `tests/nas-routes-probe.py`)**: 조회는 절대경로(`/nas/list` `/nas/get`), **쓰기는 `rel`+`team` 상대경로만**(`/nas/app/put|mkdir|delete|sweep`, `/nas/paths`). ⚠️ 쓰기가 절대경로를 안 받는 이유 둘 — 프런트 버그가 NAS 아무 데나 못 쓰게, 그리고 **사내 경로가 프런트 코드에 안 들어가게**. ⚠️ 임시 폴더는 프로세스가 죽으면 남는다 → `sweep` 은 **내 태그 또는 비어있고 오래된 것만**(남이 쓰는 중일 수 있다). ⚠️ 검증은 `app.test_client()`(5000번 프로세스를 죽이지 말 것), **재시작 전엔 404**
- 🗄️ **저장소는 고르는 게 아니다 — 기본이 NAS**(2026-11-04, `STORAGE_POLICY.nasOnly`) — 플래그가 없으면 `nas`(전엔 `drive`, 즉 **아무것도 안 한 사람이 드라이브에 남는** 구조였다). 고르기 UI 제거(배지는 말만 함, [🔀 바꾸기] 삭제). **비상 탈출구**는 콘솔 한 줄(`gantt_storage_backend='drive'`) — 그 상태엔 경고 배너가 계속 뜬다. ⚠️ 부작용: 백엔드 꺼지면 아무것도 못 연다 · 📱 **휴대폰에선 못 쓴다**(백엔드가 없다 — 그래서 모바일엔 "PC 에서 열어주세요"로 따로 안내) · NAS 계정 넣기 전엔 사용 불가
- 🎯🎯 **NAS 읽기에 캐시 금지 — 이게 색인을 날린 범인이었다**(2026-11-04) — `/nas/app/get` 이 `Cache-Control` 을 안 보내 **브라우저가 옛 사본**을 돌려줬고(실측: 같은 순간 디스크 721,649 / 브라우저 489,543), 앱이 그 위에 "읽고-고쳐-통째로 쓰기"를 해서 그 사이 바뀐 `projects` 가 **오류 없이 사라졌다**(lost update). ⚠️ 색인만의 문제가 아니다 — 보관함·주소록·프로젝트 파일도 같은 구조다. → 백엔드 `/nas/get`·`/nas/app/get` 에 `no-store`, 어댑터의 **모든 NAS GET** 에 `cache:'no-store'` + `_cb=` 난수(`no-store` 는 그 요청만 막는다 — 이미 캐시에 든 걸 피하려면 URL 이 달라야 한다). 구버전 백엔드 PC 는 프런트 쪽으로 보호된다. 확인: 복구 후 projects 13건·담당자 12건 전부·하네스 26/0
- 🎨 **테마색이 목록에 안 나오면 색인에 `themeColor` 가 없는 것**(2026-11-04) — NAS 엔 appProperties 가 없어 색도 색인에서 만들어 붙이는데, `themeColor` 는 그날에야 항목에 들어가서 **그 전에 마지막 저장된 프로젝트**는 색이 없다(오류 없이 전부 같은 색). 색은 **프로젝트 파일 안에 멀쩡히 있다**(`tabData.themeColor`) → `py -3 tools/backfill-theme-colors.py [--apply]` 가 읽어서 색인에 옮긴다(이미 색 있는 항목은 안 건드림·백업·쓴 뒤 재확인). 실측 12건 중 9건 채움, 3건은 파일에도 색이 없음(기본색). 한 번 저장하면 그 뒤론 자동
- 🏷 **담당자·팀도 같은 식으로 빈다 — `py -3 tools/backfill-index-meta.py [--apply]`**(2026-11-05) — 색인 항목이 비면 목록에서 **담당자 미지정·팀 없음·기본색**이 되는데 **오류는 안 난다**. 실측: 11-04 `LNW_STELLAR32_32.0.json` 복구 뒤 그 항목의 `assignee`/`team`/`model`/`customer`/`themeColor` **다섯 칸이 전부 빈 채**였다(파일엔 멀쩡히 다 있었다). 사람이 열어 저장하면 앱이 채우지만 **방금 복구한 3.87MB 파일을 그 목적만으로 다시 쓰는 것보다**, 언제든 다시 만들 수 있는 **파생 데이터인 색인만** 고치는 쪽이 사고 반경이 작다. ⚠️ 값 계산은 앱 `buildProjectIndexEntry`(js/04c)와 **같은 식**이어야 한다(제 맘대로 고르면 다음 저장 때 값이 바뀐다): `model`=모델명∥고객모델명 · `customer`=고객사 · `assignee`=프로젝트담당자 · `team`=팀∥개발팀 · `themeColor`=tabData.themeColor. ⚠️⚠️ **색인을 읽고 → 프로젝트 파일 내려받고(10초+) → 쓰면 그 사이 앱 자동저장이 조용히 사라진다**(11-04 색인 유실과 같은 모양) → 값만 모아 뒀다가 **쓰기 직전에 색인을 다시 읽어 얹는다**. 이미 찬 칸·파일에도 없는 값은 안 건드림·백업·쓴 뒤 재확인·`--apply` 없이는 안 씀
- 🚑 **`project_index.json` 이 비면 조용히 고장난다**(2026-11-04 실제 발생: projects 0건) — 담당자·팀·색이 전부 "미지정"이 되고 메일 자동배분 색인이 사라지는데 **오류는 안 난다**. 되살리기 `py -3 tools/restore-project-index.py [--apply]`(드라이브 사본은 읽기만, 군집은 NAS 것 유지, 쓰기 전 백업). 막기는 **쓰기 경계 한 곳**: `guardIndexWrite`(js/57)가 **0건 덮어쓰기를 거부**하고, `updateProjectIndexEntry`(js/04c)는 **읽기 실패 시 쓰지 않는다**(예전엔 `{projects:[]}` 로 전체를 덮어썼다). ⚠️ 범인은 아직 못 찾음 — 걸리면 `_issueLog` 에 남는다
- 📢 **전환 선언 `window.STORAGE_POLICY`(js/04a, 데이터)**(2026-11-04) — 이사 뒤에도 모드 창이 ☁️ Drive 를 "지금까지 쓰던 방식"으로 보여줘 **새 데이터가 조용히 갈라질** 판이었다. 이제 Drive/미러 모드면 **배너로 알리고**(저장은 안 막는다 — 못 옮긴 사람 일을 멈추는 게 더 나쁘다), 미러는 목록에서 내려가고, NAS→Drive 되돌리기는 "갈라진다"고 경고한다. NAS 모드인데 못 붙었으면 **사유별 배너**(백엔드 꺼짐/잠김/미로그인 — 전엔 콘솔에만 적어 버튼이 회색인 이유를 몰랐다). ⚠️ 이 때문에 js/57 의 "플래그 OFF 면 아무것도 안 한다"는 **"저장 경로는 안 건드리고 안내만 한다"** 로 바뀌었다. 검증 `tests/nas-cutover-check.browser.js` 22/0
- 🔑 **NAS 로그인 설정 화면은 🔑 모달(js/36)에 있다**(2026-11-04) — `/nas/config`·`/nas/root`·`/nas/root-candidates`. 앱 폴더 고르기는 CLI 와 **같은 함수**(`set_roots`/`writable_candidates`) — 두 벌로 두면 "CLI 엔 보이는데 화면엔 안 보인다"가 생긴다. ⚠️⚠️ **`save_config` 가 앱 폴더(`root`)를 지우고 있었다** — 로그인과 `root` 가 같은 파일에 사는데 새 dict 를 만들어 써서, 로그인만 다시 저장해도 다음 저장이 "앱 루트가 없다"로 죽었다(아는 키만 덮어쓰게 고침, `_raw_config`). ⚠️ "연결 테스트"는 비밀번호를 새로 받지 않는다 — 테스트라는 이름으로 실패를 쌓으면 그게 곧 IP 차단이다. ⚠️ 새 섹션을 다른 섹션의 **버튼 행(flex) 안**에 붙였다가 글자가 한 자씩 세로로 깨졌다 — 문법도 콘솔도 조용했고 **스크린샷을 찍어서야** 보였다. ⚠️ 구버전 백엔드에서 `Unexpected token '<'` — 404 HTML 을 `.json()` 한 것. `nasApi()` 로 모아 "안 돌고 있다"와 "돌지만 구버전"을 나눠 말한다
- 🗺 **전환의 진짜 블로커는 id 였다**(2026-11-04) — 앱 **데이터 안에 Drive 파일 id 가 5,089곳** 박혀 있고(프로젝트 파일 3,214·TaskInbox 백업 1,862·project_index 13), 코드는 `drive_file_id === currentDriveFileId` 처럼 **같은지 비교**하는 자리가 40곳 가깝다. id 체계가 바뀌면 그 비교가 전부 빗나가 **오류 없이 메일 배분·보관함 배치·중복 검사가 조용히 안 맞는다.** → 데이터를 고쳐 쓰지 않고 **`App_Config/nas_id_map.json`(id→경로)** 을 두어 ① 옛 id 를 경로로 풀고 ② **목록에도 그 옛 id 를 그대로** 실어 준다. 지도는 **이사가 대조를 끝낼 때마다 다시 쓴다**(전부 건너뛰었을 때도). ⚠️ 입구마다 `ensureIdMap()` 을 `await` — 목록을 먼저 그리면 그 한 번만 새 id 가 나가 꼬인다. 번역기 63/0 · 연결부 19/0
- 🏷 **지금 어디에 저장되는지를 헤더 배지가 말해 준다**(2026-11-04) — 모드는 **주소가 아니라 브라우저·출처마다의 플래그**가 정한다(Pages 와 localhost 는 다른 출처). 그런데 NAS 모드에서도 배지가 "구글 드라이브 연결됨"이라고 말하고 있었다 → 어댑터가 `_updateDriveConnBadge` 를 감싸 마지막에 덮어쓴다: 🗄️ nas · 🪞 mirror · drive 는 안 건드린다 · **배지를 누르면 저장소를 바꿀 수 있다**(고르기 창 + 확인, `STORAGE_MODES` 데이터). ⚠⚠ **Drive 모드에선 배지를 안 띄운다** — 안 옷긴 팀원 화면에 못 보던 아이콘이 생기면 그것만으로 연락이 온다. Drive 에서 들어가는 길은 🔑 설정 ▸ 저장소 ▸ [바꾸기]
- ⚠⚠ **NAS 모드에선 앱의 "로그인했나" 검사도 같이 맞춰야 한다**(2026-11-04 사고) — 저장소만 바꾸고 둔 판에선 🗄️ 배지는 뜨는데 **프로젝트를 못 불러왔다**. `gapi.client.getToken()` 을 "없으면 넣는다"로만 두어 gapi 가 나중에 **진짜 getToken(=null)** 을 깔았고, 그 검사가 40곳 넘어 전부 막혔다 → **항상 덮어쓰고**, `isDriveConnected` 도 맞춘다(단 `/nas/status` 가 ok 일 때만 — 무조건 켜면 백엔드가 꺼져 있어도 멀줦한 척한다). 사용자 이름도 NAS 계정에서 가져온다. ⚠⚠ 또 `files.get({alt:"media"})` 는 **`result` 에 파싱된 객체**를 같이 줘야 한다 — 앱은 `response.result` 를 읽으므로 `body` 만 주면 **오류 하나 없이 프로젝트가 안 열린다**(하네스가 `fetch` 만 보고 이 호출을 안 봐서 놓쳤다). ⚠ 저장 때 앱이 **파일명을 다시 조립**해 이름이 바뀜다 — Drive 는 id 가 그대로라 괜찮지만 우리 지도는 id→**경로** 라 끊긴다 → 옮길 때 `remapIdPath()` 로 지도도 같이 옮긴다
- ⚠⚠ **어댑터보다 먼저 로드된 파일이 `window.fetch` 를 잡아 두면 우회가 생긴다**(2026-11-04) — `js/30`(이슈 수집)이 로드 시점에 원본 fetch 를 잡아 Drive 를 부르므로 NAS 모드에서 **그대로 구글로 나가 401 이 반복**됐다(실측 콘솔). js/30 에 있는 모킹용 이음쇠 `_issueRawFetch` 에 꿂는다. ⚠ 통째로 우리 fetch 를 꿂으면 **무한 재귀**다(우리 `_origFetch` 가 바로 js/30 의 래퍼다) → **Drive 주소만** 어댑터로 보낸다. 저장소 전수로 확인했고 이렇게 fetch 를 미리 잡는 곳은 js/30 하나뿐이다
- ⚠⚠ **저장소를 바꿔도 "로그인 후처리"는 구글 OAuth 콜백 안에만 있었다**(2026-11-04) — 🗄️ 배지는 뜨는데 **[📂 프로젝트 열기]가 HTML 의 `disabled` 그대로 회색**이었고, 팀 공용 데이터(프롬프트·공휴일·주소록·보관함)도 한 번도 안 당겨졌다. 토큰 가드를 고친 것과는 **별개의 문턱**이다. → js/05 에서 `_storageEnableDataButtons`/`_storageLoadSharedData` 로 빼서 **Drive·NAS 가 같은 함수를** 부른다(목록을 js/57 로 베끼면 Drive 에 하나 늘 때 NAS 만 조용히 빠진다 — 그게 바로 이 사고의 모양). ⚠️ 목록 모달은 NAS 모드에선 안 열어야 한다(페이지마다 팝업). ⚠⚠ **`fetch` 로만 검증해서 못 봤다 — 사람이 누르는 건 버튼이다.** 회귀는 `tests/nas-cutover-check.browser.js`(14건)
- ⚠⚠ **NAS 엔 Drive 의 파일 꼬리표(`appProperties`)가 없다**(2026-11-04 신고: "담당자 분류가 풀렸음") — 앱은 그걸로 **담당자·팀·완료·테마색**을 가른다. 꼬리표용 저장소를 따로 두지 않고 **이미 저장마다 갱신되는 `App_Config/project_index.json`** 에서 어댑터가 채워 넣는다(`assignee`→pm · `completed` 불리언→`'1'`). ⚠️ 붙이는 곳은 **어댑터 한 곳** — 목록 모달(js/04c)·배분 원장(js/14d)·복원 목록 색(js/21)이 전부 `file.appProperties` 를 읽으므로 화면마다 고치면 고친 화면만 산다. `themeColor` 는 인덱스에 새로 실었으니 **그 프로젝트를 한 번 저장해야** 색이 돌아온다(백업 목록 색은 인덱스에 없어 그대로 비어 있다)
- ⚠⚠ **앱 폴더 이름을 바꿀 때**(2026-11-04, `kortek_pm`→`KORTEK_PM`) — **DSM 은 대소문자를 가린다**(실측: 바꾸기 전 대문자 이름은 없음). 그래서 대소문자만 바꿔도 **진짜 이름 바꾸기**고, 설정의 `root` 를 같이 안 고치면 그 PC 는 상자를 못 찾는다(반면 Windows `\host\…` 는 SMB 라 안 가린다 — **두 세계의 규칙이 다르다**). ⚠⚠ **앱이 돌고 있는 동안 바꾸면 옷 이름 폴더가 다시 생긴다** — 이슈 수집기가 1분 만에 유령 `kortek_pm/Backups/…` 을 만들었다(쓰기 경로는 없는 폴더를 만들면서 쓴다). → **이름 바꾸기 + `set_roots()` 를 한 묶음으로.** id 지도는 상대경로라 무사(전환 점검 14/0)
- 📂 **앱을 열 때 프로젝트 불러오기 창을 한 번만 띄운다**(2026-11-04 요청, `STORAGE_POLICY.autoOpenProjectList`) — Drive 는 사람이 [연동]을 누른 직후 1회였지만 NAS 는 연결이 **페이지 열 때마다** 일어나므로 "한 번만"을 코드가 지킨다(`_projectListAutoOpened`, 이미 연 프로젝트가 있으면 안 띄움)
- 🏷 **헤더 🗄️ 배지는 안 띄운다**(2026-11-04) — 저장소가 하나뿐이면 늘 같은 답이라 말할 가치가 없다. ⚠️⚠️ **그 블록을 지우면 안 된다** — 원래 함수(js/04b `_updateDriveConnBadge`)가 그 자리에 **"구글 드라이브 연결됨"** 을 다시 그린다(그게 11-04 에 고쳤던 버그다). 끝까지 감싸서 **숨긴다**. 미러는 비정상 상태라 계속 보여준다
- 🏷 **화면 문구의 저장소 이름은 `window._storeName()`(js/04a)** — "구글 드라이브"가 문자열로 박혀 있으면 NAS 로 옮긴 뒤 **틀린 안내**가 된다("드라이브 연동하기를 누르세요" — NAS 모드엔 그 버튼이 없다). 연결 안내는 `_storeConnectHint()` 가 모드별로 다른 곳을 가리킨다. ⚠️ **245곳을 전부 바꾸지 않는다** — 대부분 주석이고, 일부는 **진짜 Drive 를 가리키는 말**이라 바꾸면 거꾸로 틀린다(모드 경고·비상 탈출구 안내). 사람이 자주 보는 자리만 바꿨다: 열기 가드 2곳·공휴일 저장 안내 3곳·버튼 툴팁 3곳(HTML+i18n 맵 둘 다 — 맵이 HTML 을 덮어쓴다)
- 🔌 **백엔드를 재시작하면 앱이 스스로 NAS 에 1회 로그인한다**(2026-11-04, js/57 `nasLoginOnce`) — `/nas/status` 는 로그인을 **안 한다**(그게 맞다). 그래서 재시작 뒤엔 세션이 없고, 로그인을 거는 곳은 🔑 설정 화면뿐이었다 — 저장소가 NAS 하나뿐인 지금은 **재시작마다 사람이 설정을 열어야** 앱이 살아나는 셈이었다. ⚠️ 한 페이지에 **한 번**, `blocked`·예산 0 이면 **시도조차 안 함**(횟수 관리는 백엔드 `_LOGIN_POLICY`). 실측: 세션 없는 상태로 열었더니 스스로 붙어 프로젝트 12건·담당자 12건 전부 나옴
- 🔑 **사내 주소를 코드에 박지 않는 이유와 대안**(2026-11-04) — 저장소가 **공개**(실측 `private:false`)라 사내 IP 를 못 박는다. 사설 대역이라도, 이 저장소가 이미 **나머지 지도**(DSM API·공유 구조·계정 체계·차단 정책)를 들고 있어 주소만 얹으면 표적 목록이 된다. 또 IP 가 바뀌면 전원이 동시에 멈춘다. → `nas_defaults.json`(.gitignore, 백엔드 폴더): 주소·포트·HTTPS·앱 폴더·자료실 경로만. `load_defaults()`→`/nas/status.defaults`→간편 전환이 **미리 채우고**, `/nas/setup` 이 빈 칸을 메운다(사람 입력이 이긴다). 만들기는 🔑 ▸ [📄 기본설정 파일], 전달은 **설치 파일 옆에 두고 폴더째**(설치 스크립트가 같이 깐다). ⚠️⚠️ **비밀번호는 넣지 않는다** — 평문이고 PC 를 돌아다닌다(`pw`/`password` 키는 읽어도 버린다). 검증 `tests/test_nas_setup_route.py` 38/38 + 설치 `/selftest`
- 🚀 **팀원 전환은 아이디·비밀번호 두 칸**(2026-11-04) — 🔑 설정 ▸ NAS ▸ `🚀 간편 전환`. `POST /nas/setup` 하나가 계정저장→로그인→**앱 폴더 찾기**→앱 폴더→**자료실 경로**까지 밟고 **단계별 결과**를 돌려준다(전엔 사람이 5단계를 순서대로 해야 했고, 하나만 빠뜨리면 "🗄️ 는 뜨는데 프로젝트가 안 열린다"였다). 앱 폴더는 `find_app_folder`(이름은 데이터 `APP_FOLDER_NAMES`, 공유 2단계·상한 80, 실측 31곳 2.4초) — **1건일 때만** 스스로 정하고 아니면 후보를 보여준다. 자료실 경로는 `unc_of()` 로 앱 폴더에서 만든다. 사내 주소는 저장소에 못 쓰므로 **설정 코드**(`KPMNAS1:…`, 주소·폴더만·**비밀번호 없음**)로 전달. 검증 `tests/test_nas_setup_route.py`(29건)+실환경 1회
- 🔁 **NAS 로그인 실패 허용 1회 → 3회**(`_LOGIN_POLICY`, 데이터) — ⚠️ 진짜 IP 차단은 DSM **자동 차단** 설정이 하는데 `SYNO.Core.Security.AutoBlock` 은 **관리자만** 읽을 수 있어(실측 105) 3은 **보수적으로 정한 값**이다. ⚠️ **자격증명 오류(400·404)만 예산을 깎는다** — 권한·만료는 카운터에 안 쌓이니 잠그지 않고, 이미차단(407)·계정잠김(411)은 즉시 멈춘다. 그래서 오류 **코드**를 들고 다니는 `NasApiError` 가 필요했다. 자동 재시도는 여전히 없음. 검증 `tests/test_nas_login_budget.py`(30건)
- ⚠⚠ **NAS 폴더 이름이 숫자로 시작하면 만들어지지 않았다**(2026-11-04 실측) — `nas_dsm.ensure_folder` 가 DSM 에 `name` 을 **평문**으로 보내서 `2026`·`202611`·`2026-11` 은 전부 "파일 작업 인자가 잘못되었습니다", `testfolder`·`abc-def`·`2026_11` 은 통과했다. 더 나쁜 건 **이미 있는 폴더에도 매번 CreateFolder 를 부르고** DSM 이 414(이미 있음) 대신 인자 오류를 주어 **한 번 만들어 두어도 계속 막힌다**는 것. → `name`·`folder_path` 를 **JSON 배열**로 보내게 고쳤다(실측 확인). ⚠ **백엔드 재시작 뒤에 듣는다** — 그래서 일일보고 월 폴더는 밑줄(`2026_11`)로 두어 **재시작 전에도 돌게** 했다
- 🗂🗂 **"프로젝트 파일은 불러오는데 다른 NAS 파일은 접속 못함"**(2026-11-05 팀원 PC 신고) — **두 저장소는 서로 다른 길이다**: 프로젝트 파일은 `/nas/app/*` → **DSM REST API**(HTTPS 5001, 로그인만 되면 끝) · 사양서·도면·자료실은 `/doc/*` → **윈도가 직접 읽는 SMB UNC**(`docstore_config.json` 의 `root` + 그 PC 의 SMB 자격증명 + NAS 공유 권한이 따로 필요). 그 4단계를 **🚀 간편 전환(`/nas/setup`)만** 밟고 있어서, 🔑 로그인 칸에서 계정만 저장한 PC 는 DSM 은 붙고 자료실은 **경로가 빈 채**로 남았다. → `_docstore_autoconfig()` 로 빼서 **두 입구가 같은 함수**를 쓴다(`/nas/setup` 4단계 + 새 `/nas/docroot-auto`, 로그인 저장이 부른다). ⚠️ 이미 닿고 있으면 **안 건드린다**(사람이 정해 둔 경로 보호) · ⚠️ 실패를 삼키지 않고 **"프로젝트 파일과는 다른 길"**임을 화면에 밝힐다. ⚠️ **백엔드 재시작 전엔 404**. 검증 `py -3 tests/test_nas_docroot_auto.py` 17/17 + 돌연변이(SMB 확인 건너뛰기 → 7건 실패)
- 🔄 **복원 목록에 날짜도 색도 담당자도 없던 것 — 원인은 하나**(2026-11-05) — 어댑터가 백업 파일에 `createdTime` 과 `appProperties` 를 **한 개도 안 실어** 주고 있었다(실측 **502/502 둘 다 없음**). 복원 목록(js/04c)은 날짜를 `new Date(file.createdTime)` 으로 찍고 색·팀·담당자를 `file.appProperties` 에서 읽는다 → 전부 `Invalid Date` + 한 덩어리 무지개색. → 고치는 곳은 **어댑터 한 군데**(js/57 `toDriveFile`·`attachAppProps`) — 화면마다 고치면 고친 화면만 산다. ⚠️⚠️ **백업 날짜에 `mtime` 을 쓰면 안 된다** — 11-03 이사 때 전부 **복사 시각**으로 바뀌어 502건이 같은 날로 보인다. 파일 이름의 도장(`_YYYYMMDD_HHMM`)이 유일한 진짜 시각이다(`backupStampOf`). ⚠️ 꼬리표는 **id 가 아니라 이름으로** 매칭한다 — 백업엔 Drive id 가 없어 id 로는 영영 못 맞춘다(`backupOrigNameOf` 로 원본 이름을 되찾아 그 프로젝트의 꼬리표를 물려준다). 실측: 날짜 0 → **505/505**, 색 1종 → **8종**, `🏢 개발3팀(11개 프로젝트)` / `📜 <프로젝트> (N) · 👤 담당자` 그룹이 살아났다. 옛 이름으로 남은 백업 162건은 지금 색인에 그 프로젝트가 없어 **일부러 기본색으로 둔다**(억지로 매칭하면 조용한 오답이 된다). 검증 `node tests/storage-adapter.test.js` 73/0
- ⛔⛔ **내가 낸 사고 — id 지도를 고치는 건 "열려 있는 앱의 저장 대상을 바꾸는 것"이다**(2026-11-05 17:11) — 김시윤 프로젝트를 백업에서 되살리고 `nas_id_map.json` 의 별칭을 그 새 경로로 돌렸다. 그때 **임희철 OBSIDIAN 이 바로 그 id 로 앱에 열려 있었고**(별칭이 그렇게 만들어 뒀다), 17:11 의 저장이 **방금 복구한 김시윤 파일 위로 떨어졌다**(1.80MB → 2.17MB, 내용은 OBSIDIAN 409행). `LNW_27.0.json` 은 이름이 바뀌며 사라지고, 색인은 두 항목을 잃었다. 나는 "그 파일은 NAS 에 없으니 아무도 못 열어 둔다 → 스크립트로 써도 안전하다"고 판단했는데, **별칭 때문에 남이 내 id 를 들고 있었다**는 걸 못 봤다. → **규칙: NAS 에 쓰기 전에 앱이 닫혔는지 확인한다.** 말로 묻는 것으로 끝내지 말고 **`mtime` 을 두 번 재서**(6초 간격) 안 바뀌는 걸 보고 시작할 것 — 되돌리기 스크립트의 0단계가 그 모양이다. 다행히 **잃은 데이터는 없었다**(양쪽 백업이 온전했다). 되돌리는 순서: ① 남의 내용을 **제 이름으로 먼저 옮기고**(그래야 다음 덮어쓰기가 안전해진다) ② 백업 복구 ③ 지도 ④ 색인 — 각 단계마다 **다시 읽어 확인**
- ⛔ **"색인에 없으니 유령 id" 로 단정하지 말 것 — 실측 312건이 쓰고 있었다**(2026-11-05) — 한 경로에 Drive id 가 둘 몰려 있을 때 색인에 없는 쪽(`18ZViaZaoK…`)을 지우려다, 프로젝트 파일 29개를 전수로 세어 보니 **그 id 가 312곳**에서 쓰이고 색인이 들고 있던 id 는 105곳이었다. 지웠으면 배분 기록이 통째로 끊겼다. → **지우기 전에 전수로 세어 볼 것.** 고친 방법은 반대로 — **색인을 실제로 쓰이는 id 에 맞췄다.** ⚠️ 왜 중요하냐면 `_relToOldId`(js/57 `adoptIdMap`)는 한 경로에 여러 id 가 걸리면 **마지막 것이 이긴다**. 이긴 id 와 색인의 id 가 다르면 그 색인 항목은 **어느 파일과도 안 맞아 "유령"으로 보이고, 앱이 지운다**(실제로 두 번 지워졌다 — 되살려도 앱을 열면 또 없어졌다). 그 프로젝트는 목록에서 **담당자·팀·색이 전부 빈 "미지정"** 이 된다. 방어로 `attachAppProps` 에 **이름 되짚기**를 넣어 뒀지만(색인 항목이 살아 있을 때만 듣는다), 근본은 **색인 id = 데이터가 쓰는 id** 를 맞추는 것이다
- 🚨🚨 **이사 때 이름이 겹친 프로젝트는 한 개만 살아남았다 — 나머지는 "열리긴 하는데 남의 프로젝트"**(2026-11-05 발견, 신고: "김시윤 프로젝트 파일이 깨졌다") — Drive 개발3팀에 **`LNW_27.0.json` 이라는 같은 이름의 파일이 셋** 있었고, js/58 은 설계대로 **가장 최신 한 개만 복사**하고 버려진 id 들은 **별칭(alias)으로 그 살아남은 파일을 가리키게** 했다(그 주석은 "안 넣으면 모르는 파일 id 로 막힌다" 였다). 그래서 **에러가 없다** — 색인에도 남아 있고, 열면 열리기까지 한다. 다만 **내용이 남의 프로젝트**다. 실측: `1__PqvJa3HtnCZrls-anQ7D3oqECahKVi`(김시윤 / Digital Wheel Back-Box Display) 포함 **Drive id 3개가 `개발3팀/LNW_27.0.json` 하나로** 몰려 있고, 그 파일은 임희철의 OBSIDIAN AG/AR/AF(408행)이다. → **진단법**: `App_Config/nas_id_map.json` 에서 한 경로를 가리키는 id 가 둘 이상인 곳을 찾는다(전수 검사에서 겹친 곳은 **이 한 군데뿐**). → **복구**: Drive 는 읽기만 했으므로 원본이 그대로 있고, NAS 에도 `Backups/개발3팀/백업_LNW_Digital Wheel Back-Box Display_32.0_20261020_1029.json`(1.8MB·328행·`_level` 327·`_mailRaw` 80·tabData 28키, **온전**)이 있다. ⚠️ 사람이 앱의 `⚙️ ▸ 🔄 프로젝트 복원` 으로 할 일 — 열어 둔 앱이 있으면 스크립트 복구는 되돌려진다. ⚠️ 복원 뒤에도 **별칭이 남아 있으면** 그 id 가 여전히 남의 파일로 풀리므로 지도도 같이 고쳐야 한다. 💡 교훈: **"버려진 id 를 살아남은 파일로 보내는" 별칭은 막히는 것보다 나쁜 고장이다** — 막히면 사람이 알아차리지만, 남의 내용을 보여 주면 아무도 모른다
- 🔐 **"폴더 자격증명을 별도로 하니 되는데 자동으로는 안 되나"**(2026-11-05) — 앱은 이미 `cmdkey /add:<host>` 로 걸고 있었다(`_sync_docstore_smb_credential`). 문제는 그게 **`if pw:` 뒤에** 있어서 사람이 비밀번호를 그 자리에서 다시 타이핑했을 때만 돌았다는 것 — 설정 화면은 저장된 PC 에서 비밀번호 칸을 "(저장됨 — 바꿀 때만 입력)" 로 **비워 둔다**. 그래서 저장을 아무리 다시 눌러도 cmdkey 가 한 번도 안 불렸다. → ① 칸이 비었으면 **DPAPI 에 저장된 비밀번호를 꺼낸다**(`_docstore_saved_password`) ② `/nas/docroot-auto` 는 두드리기 **전에** 자격증명을 다시 건다 ③ cmdkey 의 **returncode 를 확인**한다(전엔 실패해도 화면이 아무 말도 안 했다) — 비밀번호는 사유에 안 실는다. ⚠️ 윈도에 **이미 열려 있는 SMB 세션**이 다른 계정으로 붙어 있으면 cmdkey 로는 안 바뀜다(탐색기에서 그 공유를 닫거나 로그오프 후 다시) · ⚠️ 백엔드 재시작 필요. 검증 `py -3 tests/test_nas_docroot_auto.py` 23/23 + 돌연변이(`if pw:` 되살리기 → 해당 1건만 실패)
- 🔑 **팀원의 새 PC 는 주소 칸이 비어 있었다**(2026-11-05) — 백엔드 `/nas/status` 는 화면이 채우라고 `defaults`(`nas_defaults.json`)를 같이 내려보내는데 **🔑 로그인 칸이 그걸 안 읽고 있었다**(간편 전환만 읽고 있었다 — 두 칸이 서로 다르게 동작). 사람이 사내 IP 를 손으로 치면 **오타 한 번이 곧 로그인 실패**이고, 실패가 쌓이면 **그 PC 의 IP 가 차단**된다. 또 저장할 때 앱 폴더(`root`)가 비어 있으면 팀 공용 기본값으로 같이 맞춘다(권한이 없으면 `set_roots` 의 `ensure_folder` 가 정직하게 실패하고, 그 문구가 공 "NAS 에서 이 팀원에게 폴더 권한을 줘야 한다"는 신호다)

- ⚠️ 사내 IP·경로는 코드·문서에 쓰지 말 것 — `nas_login_config.json`(.gitignore)에만

### `docs/doc-store.md` — 📁 문서 저장소 (사내 공유 UNC · `/doc/*`)
- **읽을 때**: 사양서·사진·메일 첨부 보관 위치, 패널 PN으로 사양서 찾기, 메일 `.eml` 보관과 staging 정리
- ⚠️ **이 저장소는 GitHub Pages로 공개돼 있다** — 사내 IP·공유 경로를 코드/문서에 쓰지 말 것. 경로는 각 PC의 `docstore_config.json`(.gitignore)에만
- 브라우저는 UNC를 못 읽는다 → **로컬 백엔드가 중계**(`C:\SAP_DMS` 패턴과 동일). 폴더 목록은 설정이라 새 분류는 이름만 추가
- AI는 원본을 안 본다(`_pxExtractText`가 6만 자로 잘라 보냄) → 텍스트만 캐시하면 재분석·검색이 다 된다. 추출기는 `window._pxExtractText` **하나만** 쓸 것
- `PANEL\` 은 **파일명이 곧 패널 PN** — 이름을 바꾸면 앱이 못 찾는다
- **(2026-11-02) 팝업이 막히면 `_dsOpenInNewTab` 이 연결 프로그램으로 넘긴다**(`_dsOpenNative`) — 그전엔 `window.open` 이 null 을 줘도 "새 창에서 열었습니다"라고 하고 **아무 일도 안 났다**. ⚠️ 둘이 서로 부르면 무한 재귀라 폴백엔 `noTabFallback` 필수. 반환값(`true`=새 창)으로 부르는 쪽이 문구를 맞춘다 → `docs/doc-store.md`
- **(2026-10-30) 파일 고르기·드래그는 무엇이든 받는다** — `accept` 는 앱 전체에서 비웠고, 못 읽는 파일은 **이유+해결방법**을 띄운다. 카탈로그는 `DOC_FILE_KINDS`(js/42, 데이터) 한 곳 — 확장자를 코드에 박지 말 것. 헬퍼: `_docKindOf`/`_docCanRead`/`_docReadHint`/`_docIsWorkbook`/`_docLooksBinary`. ⚠️ 모르는 확장자는 막지 말고 **내용을 보고** 판단(이진이면 AI 로 안 보냈다 — 할당량만 날렸다). AI 문답 첨부도 엑셀·HTML·텍스트까지 넓혔다
- **(2026-10-30) 키워드로 걸리는 파일은 모두 보여준다** — `_dsFindPanelSpecAll`(전부), `_dsFindPanelSpecs`의 `_counts`(비교표 머리글 `📄N`), 2건 이상이면 공용 고르기 창을 `q` 채워 띄운다. 창 검색은 **글자 그대로 + 기호 뗀 모양** 둘 다(`_dsNameMatch`) — 하이픈 하나로 "있는 파일이 0건"이 났다
- 메일은 `.eml` 통째로(본문+첨부). 키는 `fileName`, 훅은 `_tpAppendMailSignal` **한 곳만** 감쌀 것
- **(2026-10-22) 페이지마다 제 NAS 폴더** — SUMMARY·CUSTOMER·MC·PARTS·ADDRESS·ALARM&NOTICE·CALENDER·GANTT·REPORT. 엑셀 왕복 있는 페이지는 js/42(`nasFolder`), 파생 뷰는 js/53(`PAGE_NAS_FOLDERS`). ⚠️ **PANEL 은 `PARTS/PANEL`** 로 옮겨졌고 경로를 보는 곳이 넷이다(js/23·48·22d·49) — 하나만 고치면 조용히 0건
- **(2026-10-22) `folder`는 `PARTS/PANEL`처럼 하위 한 단계까지** — 두 단계·상위 참조는 거부, 없으면 만든다. 폴더 이름은 `ELEC_CATEGORY_META[].nas`(js/23). ⚠️ 텍스트 캐시 키는 `_doc_text_key()`로 눕힐 것(안 하면 캐시가 조용히 안 먹는다)
- **앱이 쓰는 폴더는 설정에 없어도 허용**(`DOCSTORE_APP_FOLDERS`) — 폴더 목록이 PC마다 따로라, 폴더를 새로 쓰거나 이름을 바꾸면 팀원 PC에서만 터진다
- **⚠️ (2026-10-29) 프로젝트 JSON을 Drive에서 스크립트로 직접 고치지 말 것 — 그 프로젝트를 열어 둔 앱이 메모리의 옛 값으로 저장해 되돌린다**(사진 이전이 4분 만에 원복). 데이터 이전은 **열린 앱이 스스로** 하게(`_mbOffloadSweep`·`_prodImgMigrateLegacy` 방식). 라이브러리(`ElecPartLib_*`)는 쓰기 직전 재읽기라 안전
- **(2026-11-04) 개발자료실도 NAS 로 옷겼다**(앱 폴더 아래 `개발자료실`). 옮길 때 쓴 `tools/docstore-to-nas.ps1`(robocopy 한 번 — 멱등·긴 한글 경로·시각 보존)은 **2026-11-05 에 삭제**했다(이사가 끝나 할 일이 없다). ⚠️ 권한이 바뀐다(옷 ACL 안 따라옴) · ⚠️ 경로 변경은 **PC 마다 따로**(`docstore_config.json` 은 .gitignore) · ⚠️ 앱 루트에 폴더를 만들면 프로젝트 목록이 그걸 뒤진다 → `window.APP_NON_PROJECT_FOLDERS`(js/04a, 데이터)에 한 줄 추가
- **(2026-11-04) 공유에 로그인을 못 하면 더 두드리지 않는다** — `/doc/*` 가 전부 400 이면 망·권한이 아니라 **자격증명이 낡은 것**일 수 있다(실측: TCP 445 열림 + `os.stat` 가 **WinError 1326**, 저장된 자격증명은 있음). ⚠⚠ **`os.path.isdir(root)` 한 번 = SMB 로그온 한 번**이라 페이지를 열 때마다 실패 로그온이 쌓였다 → 계정 잠김. 이제 `_docstore_probe_root()` 가 **자격증명 계열 오류에만** 잠금을 걸고(망 오류는 안 걸어야 돌아왔을 때 저절로 난다), 백엔드 재시작·설정 재저장에만 풀린다. 사람은 탐색기에서 그 공유를 한 번 열어 계정을 다시 넣으면 된다 → `docs/doc-store.md`
- staging 정리는 기간이 아니라 **큐 연동** — 실측에서 한 달 넘게 미분류로 남은 메일이 있었다. 기간(60일)은 최후 방어선

### `docs/modal-ux.md` — 🪟 모달 이동·크기조절·테두리 (`js/19`)
- **읽을 때**: 모달을 끌거나 크기를 바꾸는 동작이 이상할 때, 새 모달에 그 동작을 붙일 때
- 잡는 띠는 **테두리가 한가운데**(바깥 13 / 안쪽 13, 투명). 바깥 절반이 필요한 이유는 **안쪽이 스크롤바에 덮여** mousedown 이 안 오기 때문 — **개발 브라우저는 오버레이 스크롤바라 재현이 안 된다**
- 한 번 누르면 **하나만** 시작해야 한다 — 헤더 위쪽 13px 이 리사이즈 띠와 겹쳐 드래그·리사이즈가 **동시에** 걸렸다. 모달 안쪽에서는 헤더가 이긴다
- 커서는 `<html>` 클래스 + `!important` 로(body 커서는 자기 커서 가진 요소 위에서 **무시됨**)
- 드래그 중엔 관찰자·전역 핸들러·박스 핸들러 전부 비킨다(`_mreszDragging`). 놓을 때 화면 안으로 **되돌리지 말 것**(드래그는 40px 만 남기면 나갈 수 있다는 자기 규칙이 있다)
- **`offsetParent` 로 "보이는가"를 판정하지 말 것 — `position:fixed` 는 항상 null** 이라 화면-안-보정이 한 번도 돈 적 없었다
- 테두리 색은 헤더 **배경이 아니라 아래 경계선**. 계산값이라 팔레트 바뀌면 다시 칠해야 함
- 📜 **섹션을 더하면 모달이 조용히 잘린다**(2026-11-04) — 🔑 설정 모달이 본문 1,198px / 상자 756px 이 돼 `overflow:hidden` 에 가려 **저장 버튼에 손이 안 닿았다**(오류·콘솔 경고 없음). 상자에 `max-height:90vh`, 본문에 `flex:1; min-height:0; overflow-y:auto`. ⚠️ **`min-height:0` 이 빠지면 스크롤바가 안 생긴다** — flex 항목 기본이 `min-height:auto` 라 안 줄어든다. ⚠️ 새 섹션은 **어느 div 안에 들어가는지** 보고 넣을 것 (버튼 행 flex 안에 붙였다가 글자가 한 자씩 세로로 깨졌다 — 스크린샷을 찍어서야 보였다)


### `docs/telegram-ai-bridge.md` — 🤖📱 텔레그램 ↔ AI 문답 다리 (2026-11-08)
- **읽을 때**: 폰에서 `/ai …` 를 보냈는데 답이 안 올 때, 다리에 새 회신 통로를 붙일 때, 앱 밖에서 앱의 AI 를 쓰고 싶을 때
- 백엔드는 **접수만**(NAS 파일 1건 1파일), 답은 **열린 앱**이 — AI 가 전부 프런트에 있어서다(키·프로젝트·로컬 명령). 백엔드에 키를 두는 안은 **안 한다**(팀 공용 한도·무인증 라우트·문답 절반 불가)
- ⚠️ **재시작 전엔 없다**(백엔드 상시 프로세스) · ⚠️ 실제 텔레그램 왕복은 **아직 미확인**(집 PC 엔 NAS 설정이 없다) — 회사 PC 에서 ① 백엔드 재시작 ② 앱 열기 ③ `/ai 이 프로젝트 이름` ④ 콘솔에 `tests/telegram-qa-bridge.browser.js`

### `docs/ai-expansion-review.md` — 🤖 AI 활용 확장 검토 (2026-11-08)
- **읽을 때**: AI 로 새 기능을 붙이기 전. "어디에 AI 를 더 쓸까", 외부에서 앱의 AI 를 쓰고 싶을 때
- 실측: 호출 지점 **35곳/21파일**, 경로는 `callAiBackend` **하나**, 키는 사람마다 localStorage. 순위표(아침 브리핑 AI 없음 → 일일→주간 묶기 → 메일 알림 `/ai` 안내(됨) → 이슈 군집 가설 → 음성 → 라우터 보조) + **안 하기로 한 것**(백엔드 키·메일마다 요약·폰 확인 버튼·군집 임계치)

### `docs/user-manual.md` — 📘 사용 설명서 (사용자용, 2026-11-04 시작)
- **읽을 때**: 사용자에게 기능을 설명해야 할 때, "이 기능 어디 있어요?" 질문을 받을 때
- **개발자용은 CLAUDE.md·docs/*, 사용자용은 이 문서** — 둘을 섞지 말 것
- ⚠️ **직접 눌러본 것만 적는다** — 확인 못 한 기능은 맨 아래 "아직 확인 못 한 것"에 모아둔다(SAP·그룹웨어·인사관리·메일 실동작·엑셀 왕복 등이 아직 거기 있다). 확인할 때마다 본문으로 옮긴다

### 🧹 중복 정리 이력 (2026-11-04 전수 점검)
- **수정이력 "구간 삭제"가 7벌이었다 → 엔진 1개 + `HISTORY_SCOPES`(데이터, js/04i)**. Gantt·Summary·Customer SPEC·M.C·Address·Panel Compare·PARTS 가 **날짜 파서까지 각자 복사**해 300줄이었다(한 곳을 고쳐도 6곳은 그대로 남는 구조). 차이는 **입력칸 prefix·로그 배열·다시 그리기·라벨 넷뿐**이라 그것만 데이터로 뺐다. ⚠️ gantt 범위는 예전부터 `changeLogs`+`mcChangeLog` **둘 다** 지운다(동작 보존, `logs` 가 2개인 이유). 새 이력 화면은 **레지스트리에 한 줄**. 검증 `tests/history-delete.browser.js` 50/0 + 돌연변이 3종(prefix 어긋남·배열 오지정·rerender 누락)이 **실제로 실패하는 것까지 확인**
- **Gantt 변경 이력 화면이 두 벌이었다 → `#history-overlay` 모달 삭제**. 펼침 박스(`#gantt-history-box`)와 모달이 **같은 id**(`history-del-from/-to/-pw`·`history-content`)를 써서 `getElementById` 가 항상 앞의 펼침 박스를 집었다 — 모달 입력칸은 **열려도 동작할 수 없었고 여는 코드도 없었다**. 중복 id 4건이 함께 사라져 **문서 내 중복 id 0**
- **`_storeName`/`_storeConnectHint` 가 js/04a 에 똑같이 두 번** 들어 있었다(NAS 전환 중 붙여넣기 사고) → 한 벌만. ⚠️ 동작은 같아 조용했지만 **앞 복사본을 고치면 뒤가 이겨서** "고쳤는데 안 바뀐다"가 날 자리였다
- ⚠️ **파일이 다른 중복은 대부분 의도된 덮어쓰기다**(js/57 이 `_updateDriveConnBadge` 를, js/43 이 `mcSwitchUnit` 을 감싸는 식) — **같은 파일 안 중복만** 사고다. 검사는 `window.X = function` 을 파일별로 센다
- **⚙️ 설정 메뉴 12개가 한 줄로 섞여 있었다 → 5구역**(계정·저장소 / 알림 / 메일 / 일정 / 진단·도움말). 버튼은 **id·onclick·title 그대로 두고 순서만** 바꿨다. 구역 제목은 `.tb-menu-label`(`pointer-events:none` — 제목을 눌러 메뉴가 닫히면 안 된다)
- **드라이브 전용 설정은 NAS 모드에서 숨긴다** — `DRIVE_ONLY_SETTINGS`(데이터, js/05). "🔴 자동로그인"은 NAS 모드에서 어댑터가 `isDriveConnected=true` 로 맞춰 두니 `_tryAutoLogin()` 이 **첫 줄에서 return** 하는 죽은 스위치였고(설정 메뉴 맨 위에 있었다), "👤 사용자 추가"는 구글 OAuth 콘솔을 연다. **지우지 않고 숨기는** 이유는 비상 탈출구로 drive 모드에 간 사람에겐 진짜 설정이기 때문
- **🆕 NAS 모드에서 새 프로젝트 마법사가 열릴 때마다 콘솔 오류**(실측) — 참조 엑셀(`REFERENCE_SHEET_ID`)이 **구글 시트**라 어댑터가 막는데, js/28 이 "토큰이 있으면 드라이브 연동됨"으로 보고 조용히 불렀다. ⚠️⚠️ **NAS 모드에선 어댑터가 토큰을 가짜로 채운다**(로그인 검사 40여 곳을 통과시키려고) → **"토큰이 있나"로 드라이브 연동을 묻지 말 것**, 반드시 `window._storageMode()`(js/04a, 2026-11-04 신설)로 **저장소**를 물을 것
- **📗 참조 엑셀 NAS 이전 완료**(2026-11-04) — NAS `Reference/Reference.xlsx`(97KB·14시트, 11-03 이사 때 이미 와 있었다). 받는 곳을 **`window._refExcelBlob()` 하나**(js/04c)로 모았다: NAS 모드면 `/nas/app/get`, 드라이브/미러면 옛 2단 시도(export → alt=media). 쓰는 곳 둘(`autoImportReferenceExcel` 워크북 전체, `_bsFetchTemplateRows` js/43 시트 하나)이 각자 드라이브를 부르던 걸 이 하나로 바꿨다 — **js/43 은 실패해도 조용히 null** 이라 Customer SPEC 표준 서식이 영영 비어 있어도 아무 말이 없었다(사람이 못 알아챈다). 경로는 데이터 `REFERENCE_NAS_REL`. ⚠️ **"📥 참조 엑셀 다운로드" 링크도 NAS 로 돌렸다**(`_syncRefExcelLink`) — docs.google.com 을 가리킨 채 두면 **사본이 갈라지고**(한쪽만 고치면 사람마다 다른 서식) 드라이브 권한 없는 팀원은 아예 못 받는다. 버튼 title 의 "구글 드라이브에 연동되어 있으면…"도 틀린 안내라 함께 고쳤다(`data-i18n-title` 을 **떼야** i18n 맵이 옛 문구로 덮어쓰지 않는다). ⚠️ NAS 읽기는 `no-store`+`_cb` 난수 필수, 받은 바이트는 **앞 2바이트 PK 로 확인**(DSM 은 없는 파일에 HTML 을 준다). 검증 `tests/reference-excel.browser.js` 19/0(성공 경로는 진짜 NAS·진짜 파일, 가짜는 fetch·handleFiles·_storageMode 경계만) + 돌연변이 2종 확인
- ⚠️⚠️ **파이썬으로 소스를 고칠 땐 "인코딩 먼저, 쓰기는 원자적으로"** — 이 점검에서 **두 번** 파일을 날렸다. ① `io.open(p,'w')` 로 열어만 두고 **close 를 안 해** 뒤 반복에서 예외가 나자 22d(1,409줄)가 **0바이트**가 됐다 ② `io.open(p,'wb')` 는 **여는 순간 자른다** — `.write(text.encode())` 가 뒤에서 `UnicodeEncodeError` 를 내자 `kortek_pm.html` 이 **0바이트**가 됐다(원인은 `u'📜'` 같은 **서러게이트 쌍 이스케이프** — 파이썬3에선 인코딩 불가. 이모지는 **실제 문자**나 `\U0001F4DC` 로). → **`encode()` 를 먼저 하고, 임시파일+`os.replace`** 로 쓸 것. 되돌릴 백업을 먼저 떠둘 것(`git checkout` 은 막혀 있다)

### `docs/daily-report-handover.md` — 📔 일일 업무보고 **인계 메모**(2026-11-04, 처리되면 파일과 함께 지울 것)
- **읽을 때**: 일일보고가 덜 도는 것 같을 때. **사람이 할 일 둘**(① 백엔드 재시작 — 안 하면 `/daily/*` 가 404 라 텔레그램 입력·미작성 알림이 안 돈다 ② 👥 명단 채우기 — 없으면 미작성 표시도 텔레그램 입력도 안 된다, 📣 담당은 **반드시 한 명**)
- 확인한 것 / **확인 못 한 것**(실제 AI 호출·실제 텔레그램 왕복·엑셀 버튼) 표가 있다. 재시작 뒤 5분 점검 순서도

### `docs/daily-report-design.md` — 📔 일일 업무보고 **설계서**(2026-11-04, 1~4단계 구현 완료)
- **읽을 때**: 일일보고를 만들기 전. 8개 항목(주간보고 관계·간트 연동·저장/동시성·화면·집계·알림·단계·안 할 것) + **사람에게 물을 것 10개**
- 핵심 판단: 주간보고(프로젝트×주)와 일일보고(사람×날짜)는 **직교** — 접점은 `[이슈를 업무에 반영]` 버튼 하나(그 행 `content` 에 `[문제점]`/`[대책]` 줄을 넣으면 주간보고가 **원래 그 줄만 읽으므로** js/20 무수정)
- 저장은 **사람×날짜 파일 1개**(`App_Config/DailyReport/<YYYY-MM>/<날짜>__<계정id>.json`) — 쓰는 사람이 파일마다 **한 명**이라 11-04 색인 사고의 전제(다중 작성자 read-modify-write)가 성립하지 않는다. 팀 1파일 upsert 는 **안 한다**
- 🤖 **AI 는 3단 사다리**(2026-11-04 사용자 지시) — 1단 **꺼내 쓰기(호출 0회)**: 메일 분석이 `content` 에 넣은 `[핵심내용]`/`[To do]` 를 그대로 쓴다(실측 보유율 **99.7%**, 메일 유래 행이 전체의 **49.6%**) · 2단 **다듬기**: `[🤖 AI로 정리]` 버튼, 하루 1회, `_wrShowAiPreviewModal`(js/20)과 같은 계약 · 3단 주간 묶기. **비싼 추론은 메일이 들어올 때 이미 했다** — 다시 추론하지 말고 꺼내 쓴다. 모달 열기만으로 호출 금지(2026-10-21 한도 소진 사고)
- 📱 **휴대폰은 텔레그램 봇 답장으로 받는다**(실측 결정) — 앱은 휴대폰에서 **아예 못 돈다**(백엔드가 `127.0.0.1` 바인드 + Pages 가 `https_enforced` 라 사설IP http 호출은 혼합콘텐츠 차단 + 주소 121곳 하드코딩). ⚠️ 백엔드를 사내망에 여는 안은 **라우트 175개에 인증이 하나도 없어** 버렸다. 봇·`getUpdates`·webhook 비어있음 확인. ⚠️ `getUpdates` 는 **한 PC 만** 폴링(여러 PC 가 폴링하면 서로 업데이트를 빼앗는다) · `offset` 필수
- ✅ **"모른다"와 "안 재봤다"를 구분할 것** — 처음 검토서가 사람에게 물으려던 둘(담당자 칸·휴대폰)은 **잴 수 있는 것이었고 재서 답이 나왔다**. 간트 **담당자 열은 12개 프로젝트 전부 없다**(`colIdx.assignee === -1`, 대응내용 열도 없음) → 역할(`_담당구분` 2,591행) → `projectMeta.<역할>담당자` → roster 로 잇는다. ⚠️ `SAL`/`영업` 처럼 **정규화 안 된 역할 코드**와 **쉼표 다중 담당자**가 실제로 섞여 있다. 재측정은 `py -3 -I tests/daily-report-probe.py`(읽기 전용)
- 🚨🚨 **(2026-11-04) `LNW_STELLAR32_32.0.json` 에 실제 유실 발생 — 원인 미파악, 복구 대기**: 19:06~20:01 사이에 **업무명(`개발업무(WBS)`)과 LEVEL(WBS) 칸이 904행 전부 비고**(`[2, null, "2026-04-15", …, "", "", …]`) `_level`·`_mailRaw`·`_담당구분`·`_aiRegistered` 도 같이 사라졌다. 남은 건 **상세내용·날짜·상태**뿐. 4.89MB→2.18MB. **피해는 이 프로젝트 하나**(나머지 11개 전수 정상). 단서: `_rowUid` 가 **양쪽 교집합 0**(행을 고친 게 아니라 새로 만들었다) · 날짜도 720행 달라짐 · 상세내용만 1:1 맞물림. **복구는 메타 이식이 아니라 백업 복원** — `_rowUid` 가 교집합 0이라 행 단위 이식이 **불가능**하다. ✅ **복구 완료**(사람이 앱의 `⚙️ ▸ 🔄 프로젝트 복원`으로 `백업_…_20261104_1906.json` 적용) — 실측으로 19:06 백업과 값이 같다(행·업무명·`_level` 903 / `_mailRaw` 727 / `_담당구분` 752, 업무 빠짐 0건). `LEVEL` **칸**만 16행 비어 있는데 전부 `_level:0` 행이라 계층은 온전하다. 중간에 879행까지 내려간 건 고장이 아니라 `자동 병합` 22건 + 사람의 `일괄삭제(AI학습)` 4건이었다(`changeLogs` 로 확인). ⚠️ **열어 둔 앱이 있으면 스크립트로 고치지 말 것**(메모리 옛 값으로 되돌린다 — 2026-10-29 사진 이전 사고) — 그래서 이 복구도 사람이 했다. ✅ **원인 확정·재현·수정 완료**: `js/42` `_ganttSet` 의 **`old[i].slice()`** — `Array.prototype.slice` 는 **인덱스 요소만** 복사하고 간트 행에 **얹혀 있는** `_` 속성(`_level`·`_origDev`·`_origT1~4`·`_mailRaw`·`_담당구분`·`_rowUid`·`_aiRegistered`)은 **안 따라온다**. 그래서 칸 값만 남고 업무명·레벨이 사라졌다(업무명은 `recalculateSchedules` 가 `_orig*` 에서 베끼므로 **빈칸**이 되고, 날짜 720행도 재계산으로 밀렸다). `pageExcelUndo` 로도 **안 돌아온다**(스냅샷이 칸 값뿐이고 복원이 같은 `set` 을 다시 부른다), 그리고 앱 **자신의 3분 자동저장**이 그걸 NAS 에 썼다. → `_serializeGD`(js/04c)와 같은 규칙으로 `_` 속성을 같이 옮기게 고쳤다. 회귀 **`node tests/gantt-excel-meta-loss.test.js`(9/9)** · 실측 `py -3 -I tests/daily-report-probe.py`
- ⚠️⚠️ **`tests/page-excel-roundtrip.browser.js` 를 실제 팀 프로젝트에서 돌리지 말 것** — `exportOnly` 가 아닌 **모든 스펙(gantt 포함)** 에 왕복을 돌리고, 자기 저장 호출은 가로채도 **앱 자체의 자동저장은 못 막는다**(그게 이 사고의 방아쇠였다). 빈 프로젝트나 복사본에서 돌릴 것. 그 하네스는 왕복 뒤 **칸 값만** 비교해서(`IGNORE_FIELDS`) **행 메타가 전부 날아가도 통과했다**
- 🎯 **행 배열을 복제할 때는 `_` 속성을 같이 옮길 것** — 이 앱의 간트 행은 "배열 + 얹은 속성"이다. 올바른 선례는 `js/14d` `_deserializeGlobalDataForMerge`(`for (key in obj)` 로 다시 붙인다). 저장소 전수로 보니 빠져 있던 곳은 js/42 한 군데였다
- 🎯 그래서 **행 메타를 데이터의 근거로 삼지 말 것** — `_mailRaw`·`＊AI📧`·`_담당구분`·**`_rowUid`** 는 전부 날아갔고 **칸 내용(`[출처]` 766→767)만 살아남았다**. 메일 유래 판정은 **표식이 아니라 칸 내용**으로. ⚠️ `_rowUid` 는 **개수가 같은데 값이 전부 새것**이어서 가장 위험했다(세기만 하면 멀쩡해 보인다)
- ⚠️ **"안 본 것"을 "멀쩡하다"고 쓰지 말 것** — 첫 보고에서 `_level` 을 확인하지 않고 "구조 메타는 멀쩡, 파일이 깨진 게 아니다"로 단정했다가 틀렸다(`_level` 은 1행만 남아 있었다). 키 개수 상위 목록만 보고 없는 키를 "있다"로 읽은 것
- ⚠️ 알림은 **모르면 안 보낸다** — 백엔드는 `KOR_HOLIDAYS`(js/04d 안)를 모르므로 앱이 `_nonworkdays.json` 을 내보내야 하고, 그 파일이 없거나 NAS 조회가 실패하면 발송 0건(조회 실패를 "미작성"으로 읽으면 전원에게 오발송)
- 선결 과제: 어댑터의 `readRel/writeRel/listRel` 이 `window` 에 없어 새 팀공용 기능이 fetch 를 **네 번째로 베낀다** → `window.nasAppFile` 공개

### 📄↔📊 페이지 ↔ 엑셀 왕복 — 실측으로 찾은 버그 2건 (2026-11-04)

- ⚠️⚠️ **엑셀에서 돌아온 불리언이 전부 참이 됐다** — 내보낼 땐 불리언 칸으로 나가는데 읽을 땐
  `raw:false` 라 글자 `TRUE/FALSE` 로 온다. 받는 쪽이 `!!r.useForAnalysis` 로 보는 순간
  **`'false'` 도 참**이다(빈 문자열이 아니므로). 실측: Summary ▸ 주요자재 39행 중 체크 **9개 → 39개 전부**.
  화면엔 오류가 없고 그대로 저장되면 굳는다. → `_pxCellValue`(js/42)가 정확히 `true`/`false`
  글자만 불리언으로 되돌린다(사람이 쓴 문장은 안 건드린다).
- ⚠️ **M.C 는 시트에 없는 칸을 버렸다** — `_mcRowFromSheet` 가 `_MC_COLS` 에 적힌 열만 남긴다.
  실측으로 `category`('LCM')가 왕복 한 번에 사라졌고, **↩되돌리기도 같은 set() 을 거쳐서**
  되돌려도 안 돌아왔다. → **행 수가 같을 때만** 같은 자리 옛 행에서 *시트가 안 가진 칸만* 물려준다
  (행 수가 달라졌으면 짝을 모르므로 아무 것도 추측하지 않는다).
- ✅ **가짜 실패로 판명된 것** — 하네스를 먼저 의심하라는 규칙이 그대로 들어맞았다:
  ① gantt 업무명(wbs)은 `_ganttSet` 이 **일부러 안 받는다**(표시 전용, 원본은 레벨별 열) ·
  ② aoa 블록의 라벨(마일스톤 '계획/실적', Elec Parts '## CHANGE LOG')과 모델 블록의 열 머리글은
  **현재 언어로 다시 그려지는 게 정상** · ③ M.C 금액 `$109.00`→`109` 는 **의도된 정리**(통화기호를
  JSON 에 쌓지 않으려고) · ④ PARTS 는 **탭을 한 번 열어야** 표가 다 만들어진다(29행 → 38행).
- ⚠️ 그래서 교차 언어는 **값이 아니라 "언어를 바꿔도 그 시트를 찾아 읽는가"** 로 판정한다.
- ⚠️⚠️ **이 하네스는 1회 돌릴 때마다 새로고침해야 한다** — 같은 페이지에서 연달아 돌리면
  두 번째부터 모든 내보내기가 "writeFile 이 안 불렸다"로 떨어지고 언어가 en 으로 남는다(실측).
  **그 실패는 앱이 아니라 하네스 탓**이다.
- 검증 `tests/page-excel-roundtrip.browser.js` **31/0**, 돌연변이(옛 불리언 버그 재현)는
  **새 페이지에서** 정확히 Summary 2건만 실패하는 것까지 확인. 저장 경로는 킬스위치로 막고 돈다.

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

### `docs/handoff-zmm009-table-alarm-ui.md` — 🧾 ZMM009 조회 표 / 6자리 코드 조회 / 알람 도표 (2026-10-14~20)
- **읽을 때**: ZMM009 조회 결과 컬럼·표 수정, 자재코드 목록 조회, AI 문답 표 엑셀 버튼, 알람 탭 UI
- **"생산/검사 메모"는 `ZPTEXT`가 아니라 `FERTH`** (ZPTEXT는 빈 custom 필드), `EKGRP`는 ZTEXT 레이아웃에서 미조회. 단가는 `STPRS1÷PEINH1`
- **자재코드 목록을 AI에 화면 덤프로 넘기면 환각이 난다** — 없는 납기일·제조사를 지어냈다. `/sap-material-rows`(구조화 컬럼)로 분리, 라우팅 가드는 `ZMM009_ROW_CAPS`(js/33)
- 표는 `renderMatRows()`(js/33) 하나로 공용 — 컬럼 바꿀 땐 여기 + `_ZMM009_PATTERN_COLS` 두 곳
- 알람 도표: **`table-layout:fixed` 없으면 nowrap 글자가 옆 칸을 덮는다**, 체크박스 중앙은 `text-align:center` 말고 **`margin:0 auto`**(서브픽셀로 0.5px 어긋남)
- 미검증 항목 목록 있음 — 앱에서 6자리 코드 조회·엑셀 버튼·BOM 옵션 기본값은 사람이 한 번 돌려봐야 함

### 백엔드 파일
| 파일 | 역할 |
|---|---|
| `gas/Code.gs` | AI 프록시(Google Apps Script 웹앱) 소스 사본. 수정 후 Apps Script 편집기에서 **기존 배포 편집 → 새 버전**으로 배포(새 배포 만들면 URL 바뀜) |
| `kortek_backend.py` | Flask 서버. 메일 SMTP/POP3, Telegram, 암복호화, 예약 발송 스케줄러 |
| `sap_bridge_32.py` | SAP GUI 32비트 브릿지 — `py -3-32` 서브프로세스. `kortek_backend.zip`에도 반드시 포함 |
| `nas_dsm.py` | 🗄️ NAS(Synology DSM) API. ⚠️ `ensure_folder` 는 `name`/`folder_path` 를 **JSON 배열**로 보낸다 — 평문이면 **숫자로 시작하는 폴더가 안 만들어진다**(2026-11-04 실측, 일일보고 월 폴더가 여기서 막혔다) |
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

- **검증 하네스는 `tests/` 에 남긴다** — 러너는 없다(사람이 직접 돌린다). `python tests/test_approval_reuse_branch.py`, `python tests/test_mail_watch.py`, `node tests/qa-render-telegram.test.js`, `node tests/bom-part-lookup.test.js`, `node tests/storage-adapter.test.js`, `python tests/test_mail_recv_host.py`, `python tests/test_mail_auth_block.py`, `py -3 tests/test_bom_sort_probe.py`(BOM 계층 판정 + 레이아웃 정렬 읽기 26건, **SAP 없이 돈다 — 가짜는 COM 경계에만**), `py -3 tests/mail-server-probe.py`(로그인 없이 서버 능력만), `python tests/test_nas_login_budget.py`, `python tests/test_nas_setup_route.py`, `python tests/test_daily_report_backend.py`(일일보고 수신·알림·📎첨부·업무별 87건), `node tests/daily-report.test.js`(일일보고·📎첨부·구분·초안합치기·명단·업무별·여러프로젝트 120건), `node tests/gantt-excel-meta-loss.test.js`(간트 엑셀 왕복이 행 메타를 날리는지 9건), `python tests/gw-read-probe.py`(그룹웨어 조회 25종 전수, **로그인은 안 한다**), 브라우저 콘솔에 `tests/approval-loop.browser.js`·`tests/qa-telegram.browser.js`·`tests/qa-mail-chips.browser.js`(25건), `tests/storage-adapter.browser.js`·`tests/storage-mirror.browser.js`·`tests/nas-cutover-check.browser.js`(전환 직후 점검)·`tests/bom-part-chips.browser.js`(31건)·`tests/gantt-render-perf.browser.js`(간트 렌더 속도+화면 서명 — 고치기 전에 한 번 돌려 기준을 잡고, 고친 뒤 다시 돌려 달라진 곳만 본다)·`tests/gantt-row-style.browser.js`(행 칸별 computed style 33건 — inline→클래스 이사 뒤 모습이 같은지)·`tests/gantt-virtual-scroll.browser.js`(스크롤 가상화 32건 — **창이 보일 때** 돌릴 것)·`tests/pin-bar.browser.js`(핀셋 토글 막대, 36건 — **클릭 적중은 `elementFromPoint` 로** 재고, 저장은 킬스위치로 막고 끝나면 원상복구)·`tests/history-delete.browser.js`(수정이력 구간삭제 7범위, 50건)·`tests/print-and-gw-status.browser.js`(브라우저 인쇄 전환 + 그룹웨어 건수 숨김, 45건 — 간트 항목은 **프로젝트를 열고** 돌려야 건너뛰지 않는다)·`tests/reference-excel.browser.js`(참조 엑셀 NAS 이전, 19건)·`tests/bom-sorted-layout.browser.js`(BOM 정렬된 응답 → 계층 경고·레벨 블록·엑셀 일치, 29건)·`tests/page-excel-roundtrip.browser.js`(📄↔📊 왕복 7페이지, 45건 — **1회 돌릴 때마다 새로고침 필수**)·`tests/weekly-ppt-export.browser.js`(주간보고 PPT 출력, 11건 — 만든 pptx 를 zip 으로 뜯어 슬라이드·글자까지 확인, AI 키 없이 돈다)·`tests/telegram-qa-bridge.browser.js`(텔레그램 다리 — NAS 는 진짜, 텔레그램 발송만 가짜) 붙여넣기. `py -3 tests/test_telegram_ai_bridge.py`(텔레그램 → AI 접수 32건, 진짜 입구 `_daily_tg_tick` 로)·`node tests/telegram-qa-bridge.test.js`(다리 프런트 15항목). 그룹웨어·AI 키 없이 돈다(가짜는 **바깥 경계에만**). ⚠️ `test_daily_report_backend.py` 는 **진짜 날짜**를 보므로 주말에 돌리면 알림 7건이 `non-workday` 로 떨어진다(2026-11-08 일요일 실측 80/87 — 고장이 아니다).
- 특정 기능 수정 시 파일 맵에서 바로 지정. 못 찾겠으면 `grep -rn "함수명" js/`.
- 민감 파일(`mail_config.json`, `telegram_config.json`, `schedule_rules.json`, `.env`)은 `.gitignore` — 로컬에만 존재.
- 코드 주석의 `js/파일명.js:줄번호` 참조는 파일 이동/분리 시 같이 업데이트.
- **⚠️ `js/*.js` 수정 시 `kortek_pm.html`의 캐시버스터 `?v=YYYYMMDDx`도 같이 올릴 것** — 전체 `<script>` 태그가 같은 값을 공유하므로 Python으로 일괄 치환: `python -c "d=open('kortek_pm.html','rb').read(); open('kortek_pm.html','wb').write(d.replace(b'v=OLD',b'v=NEW'))"`
- **⚠️ HTML 파일은 절대 PowerShell `Set-Content`/`Out-File`로 수정 금지** — UTF-8 한국어 바이트 `?` 치환·태그 깨짐. Python `open(...,'wb')` 또는 `[System.IO.File]::WriteAllText(..., Encoding::UTF8)` 사용. 손상 복구 → `docs/html-corruption-recovery.md`.
