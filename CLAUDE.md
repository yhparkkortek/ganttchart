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
- **로컬 구동**: `.claude/launch.json` — `python -m http.server 8934` 로 정적 파일 서빙.
- 자동화 테스트 없음. 브라우저에서 직접 열어 눈으로 확인하는 방식으로 검증합니다.

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
| `04b-core-app-drive-sync.js` | 구글 드라이브 연동 로직 (저장/불러오기/백업 폴더) |
| `04c-core-app-mail-pipeline.js` | `project_index.json` 메일 자동처리 파이프라인, 프로젝트 저장(`serializedGlobalData`) |
| `04d-core-app-gantt-core.js` | 날짜/일정(Gantt) 코어 로직, 공휴일 |
| `04e-core-app-undo-redo.js` | Undo/Redo (recalculateSchedules 종료 시 자동 스냅샷) |
| `04f`~`04j-core-app-upload-utils-N.js` (1~5) | 파일 업로드 및 유틸리티 로직 (원래 6,590줄짜리 한 섹션을 5등분) |
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
| `14a`/`14b-ai-mail-analysis-N.js` | 메일 분석 → 간트차트 자동 추가 (Gemini AI), 원래 `14-ai-mail-analysis.js` 1/2 |
| `14c-task-inbox.js` | [Phase 1] 업무 보관함 (Task Inbox) — 프로젝트 독립 스테이징 |
| `14d-distribution-ledger.js` | [Phase 2/2.5] 드라이브 배분 원장 + 저장 시 자동 병합 |
| `15a-mail-attachment-tab.js` | 메일 파일 첨부 탭 (좌우분할 UI) |
| `15b`/`15c-mail-server-tab-N.js` | 메일 서버 탭 기능 1/2 |
| `16-wbs-level-colors.js` | WBS 레벨별 고정 회색 계조 |
| `17-weekly-report-modal-drag.js` | 주간 업무 보고 모달 드래그 |
| `18-mail-analyzer-modal-drag.js` | 메일 분석기 모달 드래그 |
| `19-shared-modal-drag.js` | 공통 모달 드래그 함수 (화면 경계 clamp 포함) |
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

> `04`, `14`, `15`, `22`는 각각 원래 하나의 거대 파일(최대 11,915줄)이었고, 협업 편의와 토큰 절약을
> 위해 여러 조각으로 나눈 것입니다. 나머지(05~13, 16~21, 23, 24) 번호는 이미 세분화된 단일 파일이라
> 대부분 추가로 쪼갤 필요가 없습니다.

### 백엔드
| 파일 | 역할 |
|---|---|
| `kortek_backend.py` | Flask 서버. 메일 SMTP/POP3, Telegram 알람, 설정 암복호화, 예약 발송 스케줄러 (`/schedule` API) |
| `kortek_backend.bat` | 로컬에서 백엔드 실행하는 배치 스크립트 |
| `requirements.txt` | flask, flask-cors, requests, cryptography, google-auth |

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
