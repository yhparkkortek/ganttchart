# 🔭 오픈소스 시너지 검토 (2026-10-19)

GitHub star 순위를 실측(`gh api repos/<owner>/<repo>`)해 100여 개 후보를 추린 뒤,
**이 앱의 실제 제약과 실제 약점**에 비춰 검토한 기록.

## 검토 기준 — star 수보다 이 3개가 먼저다

1. **번들러 없음 / 전역 스코프 / CDN `<script>`** — ESM 전용 패키지는 그대로 못 쓴다.
   `<script type="module">`로 받아 `window.X =`로 올리는 브리지가 필요하고, 그 스크립트는
   **비동기 로드라 로딩 순서 보장이 깨진다**(⚠️ 가장 중요한 규칙 위반). 후보마다 UMD/IIFE
   빌드 존재를 `curl -o /dev/null -w '%{http_code}'`로 실측했다.
2. **팀원 각자 개인 PC** — 백엔드가 안 떠 있을 수 있고, 수십 MB 모델 다운로드는 부담.
3. **최우선 방향(학습으로 업그레이드)** — "결정론 먼저, AI는 임계치 초과 시만"을 **더** 결정론
   쪽으로 밀어주는 것에 가점.

---

## ✅ Tier A — 도입 권장 (효과 큼 + 제약 충족)

### 1. pywinauto — 6,216★ (2026-10 활발)
**어디에**: `sap_bridge_32.py` (7,721줄)의 Windows 대화상자 자동화 전부.

지금은 `win32gui.EnumWindows` + `GetClassName == '#32770'` + `IsWindowVisible`/`IsIconic` +
`SendMessage(BM_CLICK)` + `WM_SETTEXT`를 **직접** 조립하고 있다. CLAUDE.md에 적힌 실패 이력이
전부 이 레이어다:

| 적어둔 실패 | pywinauto가 제공하는 것 |
|---|---|
| `저장(&S)` 니모닉 때문에 `== '저장'`이 빗나감 (`_norm_label`) | 컨트롤 텍스트 정규화 + `child_window(title_re=...)` |
| 최소화 창도 `IsWindowVisible`=True | `.is_visible()` / `.is_minimized()` 구분 |
| 파일이름 Edit을 y좌표로 찾다 검색 상자를 집음 | `control_type`/`auto_id` 기반 조회 |
| 주소줄(`ComboBoxEx32`)을 파일이름으로 오인 | 표준 `FileDialog` 래퍼 |
| ZMM019 인쇄 창이 `press()`를 블록 → 워치독 스레드 | `wait('ready', timeout=)` 상태 대기 |
| 트리 덤프 들여쓰기를 `GetParent`에서 뽑아야 했음 | `print_control_identifiers()` 내장 |

**가장 큰 이득은 덤프**다. `print_control_identifiers()`가 `/sap-dump-windows`를 대체하면서
**절대 식별자까지** 준다 — "새 SAP 화면은 녹화 매크로를 먼저 받을 것"이라고 적어둔 이유가
"덤프는 보이는 것만 준다"였는데, 그 격차를 메운다.

- 32비트 설치 OK — 순수 Python + `comtypes`, `py -3-32 -m pip install pywinauto`.
- **SAP GUI Scripting COM 경로는 건드리지 말 것.** 교체 대상은 `#32770` Windows 대화상자뿐.
- 점진 도입 가능: `_win_save_dialog_*` 한 함수부터. 실패 시 기존 `win32gui` 경로로 폴백.
- ⚠️ `kortek_backend.zip` 배포 + `kortek_backend.bat` 자동설치 목록에 추가해야 팀원 PC에서 동작.

### 2. es-hangul — 1,886★ (toss, 2026-08)
**어디에**: `js/26-gantt-search.js`, `js/22g-name-autocomplete.js`.

지금 검색은 전부 `String(v).toLowerCase().includes(kw)`, 이름 자동완성은
`p.name.indexOf(query) !== -1` — **한국어 앱인데 초성 검색이 없다.**

`ㅎㄱㄷ` → 홍길동, `ㅈㄱㅇ` → 전광판. Address Book + 자재그룹 618건 + 프로젝트명/모델명을
다루는 사내 앱에서 체감이 가장 큰 축소된 한 줄짜리 개선이다.

```js
// choseongIncludes('홍길동', 'ㅎㄱㄷ') === true
```
- ⚠️ **UMD 없음** (`dist/index.js`=CJS, `index.mjs`=ESM; `index.umd.js` 404 확인).
  → `<script type="module">import {choseongIncludes} from 'https://esm.sh/es-hangul@2.4.0';
  window.choseongIncludes = choseongIncludes;</script>` 브리지 필요.
  **비동기 로드이므로 호출부는 `window.choseongIncludes ? ... : fallbackIncludes(...)`로
  반드시 가드**할 것 — 없으면 로딩 레이스로 검색이 조용히 죽는다.
- 대안: 초성 변환만 필요하면 자체 구현 15줄(`0xAC00` 기반 `(code-0xAC00)/588`)로도 된다.
  es-hangul은 조사 처리(`josa`)·자모 분해까지 얹을 때 값어치가 생긴다.

### 3. oxlint — 23,108★ (2026-10 활발)
**어디에**: `.claude/settings.json` PreToolUse 훅 (지금 `git commit` 뒤처짐만 막는 자리).

CLAUDE.md의 1순위 사고 유형이 **"리터럴 안 줄바꿈 하나로 파일 전체가 조용히 죽는다"** +
**"문법 오류가 없어 둘 다 조용히 넘어갔다"**다. 지금 방어선은 `node --check js/파일.js`
**수동 1개씩** 또는 브라우저 콘솔 일괄 파싱.

oxlint는 Rust 단일 바이너리, **zero-config**, 60,547줄 `js/*.js` 전체를 1초 이내 처리.
커밋 훅에 걸면 수동 단계가 사라진다.

```bash
npx --yes oxlint@latest js/
```
- node v24.19.0 / npx 11.17.0 확인됨.
- 전역 스코프 교차 참조(함수가 사라져 NameError 나는 류)까지 잡으려면 ESLint `no-undef` +
  globals 목록 생성이 필요하다 — oxlint는 **문법/명백한 실수**까지가 현실적 범위.
  그래도 지금보다 확실히 낫고, 비용이 거의 0이다.
- 대안: Biome 25,974★ (포맷터 겸용이라 기존 코드 전체를 다시 쓸 위험 → **비권장**),
  ESLint 27,571★ (설정 비용 큼).

### 4. kiwipiepy — 408★ (bab2min, 2026-10 활발)
**어디에**: Phase 6 토픽 프로파일(`js/26`), Phase 8 오염 감지(`js/27`),
Phase 9 군집(`js/29`)의 "① 결정론적 키워드 추출 (AI 호출 없음)" 단계.

**star가 낮다고 건너뛸 후보가 아니다.** 비교군을 보면:
- KoNLPy 1,493★ — **2023-08 이후 푸시 없음 + JVM 필요** (팀원 PC 설치 부담).
- kiwipiepy는 C++ 코어 + 휠 배포, JVM 불필요, 활발히 유지보수 중. 실질적 현행 표준.

지금 Phase 9의 키워드 추출은 공백 토큰 기준이라 "전장품/전장품을/전장품의"가 다른 키로
갈린다. 형태소 분석이 들어가면 **AI 호출 없이** 군집 정확도가 오른다 —
"결정론 먼저, AI는 임계치 초과 시만"을 그대로 강화한다.
- 백엔드(64비트) 측 신규 엔드포인트로 두고, 프런트는 실패 시 기존 공백 토큰으로 폴백.
- ⚠️ 백엔드 미기동 PC에서도 동작해야 하므로 **필수 경로로 만들지 말 것.**

### 5. RapidFuzz — 4,170★ (2026-10 활발)
**어디에**: `_qaIntentSig`(`js/32-sap-capabilities.js:547`) 군집, Address Book 이름 중복.

현재 시그니처는 `불용어 제거 → sort → 상위 5개 join`으로 **완전일치 집합**이다.
"자재 재고 조회"와 "자재 재고 확인"은 다른 군집으로 갈라진다 — Phase 10이 보려는
"같은 종류 문제가 묶이는가"가 바로 여기서 새는 지점.

`token_set_ratio`로 **근접 시그니처를 2차 병합**하면 리포트 군집이 실제 문제 단위에 붙는다.
- 백엔드 64비트에만 설치(32비트 브릿지와 무관).
- JS만으로 하려면 `uFuzzy`(아래) 또는 자체 Levenshtein.

---

## 🟡 Tier B — 쓸 만하지만 작업량·판단 필요

| 라이브러리 | ★ | 어디에 / 판단 |
|---|---|---|
| **ECharts** | 67,539 | 주간 업무 보고 + Phase 10 이슈 리포트 대시보드. **전역 빌드 확인됨**(`echarts.min.js`) — 번들러 불필요. 지금 차트는 pptxgenjs 출력뿐이라 **화면용 차트가 없다**. 효과는 크지만 신규 UI라서 i18n(`_t`)·팔레트(`_cpApplyLive`)·모달 컨벤션 3종 대응 비용이 붙는다. |
| **Floating UI** | 32,753 | 필터 티어드롭 팝업(`js/10`)·모달 위치. UMD 확인됨. 지금 동작하므로 **새 팝업 만들 때만** 도입. |
| **uFuzzy** | 3,037 | 오타 허용 간트 검색. **IIFE 전역 빌드 확인됨** — Fuse.js(20,507★)는 7.x가 ESM 전용(`fuse.min.mjs`)이라 이 앱엔 uFuzzy가 더 맞다. es-hangul과 조합. |
| **tenacity** | 8,808 | 백엔드 재시도. Phase 4 재시도 엔진은 프런트(`js/25`)에 있고 백엔드엔 없다. ⚠️ **SAP 로그인·그룹웨어 로그인엔 절대 쓰지 말 것**(계정 잠금 — 재시도 금지 규칙). |
| **APScheduler** | 7,661 | `kortek_backend.py:1425`의 `while True` 스케줄러 루프. 지금 동작하고 요구가 단순해서 **교체 이득이 작다**. cron 표현식이 필요해질 때. |
| **DOMPurify** | 17,471 | **지금은 불필요.** 메일 원문/번역 렌더 경로(`js/14c:1375`, `1482`)를 확인했는데 `escapeHtml()`로 전부 escape 처리되어 있다. 메일 HTML을 **그대로 렌더하도록 바꿀 때만** 필요. |

---

## ❌ Tier C — 권장하지 않음 (star는 높지만 이 앱엔 안 맞음)

| 라이브러리 | ★ | 안 되는 이유 |
|---|---|---|
| **litellm** | 61,514 | **이미 직접 만들었다.** `js/14a`에 프로바이더 폴백(`_aiTryProviderCandidates`)·쿨다운(`ai_provider_cooldown_v1`)·사용량 원장(`gantt_ai_usage_v1`)이 다 있다. litellm은 백엔드 라이브러리라 **AI 호출을 백엔드로 옮겨야** 하는데, 팀원 PC에 백엔드가 안 떠 있을 수 있다. 순손실. |
| **FullCalendar** | 20,698 | `js/24-calendar-tab.js` 교체 = 팔레트·i18n·WBS 회색계조·간트 연동을 다시 붙여야 함. |
| **frappe/gantt** | 6,145 | 간트 코어(`04d`)·일정 재계산(`recalculateSchedules`)·Undo 구조공유·`.no-td` 오버레이와 맞물려 있어 교체 비용이 이득을 압도. |
| **Tabulator / AG Grid** | 7,786 / 15,641 | 표가 체크박스 **행 객체 참조 Set**·배경 재렌더·오버레이에 깊게 의존. 재작성 규모. |
| **Yjs** | 22,950 | CRDT는 동기화 서버가 필요. 이 앱은 Drive JSON 통째 PATCH 모델. 저장 구조 변경은 "먼저 물어볼 것" 범주. |
| **immer** | 28,988 | v11에 **UMD 없음**(404 확인). `js/04e`가 이미 증분 구조 공유 스냅샷을 한다. |
| **transformers.js** | 16,352 | 브라우저 임베딩으로 군집 품질은 오르지만 **모델 수십 MB 다운로드** — 팀원 PC·사내망 부담. kiwipiepy+RapidFuzz가 훨씬 가볍게 같은 문제를 민다. |
| **tui.calendar** | 12,695 | **archived** (2024-06). |
| **tippy.js** | 12,236 | **archived** (2024-05). Floating UI가 후속. |
| **SheetJS** | 36,341 | 이미 `xlsx-js-style`(SheetJS 포크)을 쓰는 중. |
| **htmx / Alpine.js** | 49,577 / 31,981 | 번들러 없는 앱에 잘 맞는 건 사실이지만, 60,547줄을 선언형으로 옮기는 것은 대규모 리팩터링. |

---

## 권장 순서

1. **oxlint 훅** — 비용 거의 0, 1순위 사고 유형 방어. 여기서 시작.
2. **es-hangul 초성 검색** — 체감 가장 큼, 변경 범위 작음(가드 필수).
3. **pywinauto 점진 도입** — `_win_save_dialog_*` 한 함수 + 폴백 유지. SAP 작업 중 가장 많이
   깨지는 레이어라 누적 이득이 크다.
4. **RapidFuzz 시그니처 2차 병합** — Phase 10 군집이 실제로 묶이게.
5. **kiwipiepy** — 4번으로 부족할 때.

