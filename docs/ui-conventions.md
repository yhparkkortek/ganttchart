# 🌐 i18n · 🎨 팔레트 · 🪟 모달 컨벤션 상세

> CLAUDE.md에서 분리된 상세 문서입니다 (2026-09-21, 토큰 절약 목적). **본문은 분리 전 CLAUDE.md 원문 그대로**이며,
> 해당 작업을 할 때만 읽으면 됩니다. 색인/요약은 CLAUDE.md의 "📚 상세 문서(`docs/`) 색인" 절 참고.

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
