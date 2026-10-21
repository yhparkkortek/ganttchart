# 🧑‍💼 인사관리(kInsa) 연동 — `http://insa.kortek.co.kr`

> 2026-10-21 신설. 지금은 **자동 로그인까지만** 구현돼 있고 화면 조회/조작은 아직 없다.

## 실측으로 확인한 것 (추측 아님)

`curl`로 직접 받아 본 응답 기준이다. 경로를 **추측하지 말 것** — 그룹웨어에서 추측 12개가
전부 404였던 교훈이 그대로 적용된다.

| 항목 | 확인된 값 |
|---|---|
| 서버 | `Apache/2.2.3 (CentOS)` — 서버 렌더 JSP + Bootstrap 3.3.5 + jQuery, UTF-8 |
| 로그인 화면 | `GET /` (200). `<title>Kortek Insa</title>` |
| 로그인 폼 | `<form class="form-signin" action="kInsa" method="post">` |
| 제출 | **`POST /kInsa`** — 입력칸 `userNum`(사번) / `password` |
| `GET /kInsa` | **405 Method Not Allowed** (`Allow: POST`) — GET으로 열리지 않는다 |
| 세션 | 표준 `JSESSIONID` 쿠키 |
| 아이디 기억 | `loginUserNum` 쿠키 (`resources/common/js/cookie.js`) |

### ⚠️ 로그인 실패 응답이 특이하다 — HTTP 코드로는 구분이 안 된다

성공도 실패도 **HTTP 200**이다. 실패는 194바이트짜리 `<script>` 하나로 온다:

```html
<script>
	var message = `아이디가 존재하지 않습니다
ID is not exist`;
	if (message !== "" && message !== null) { alert(message); }
	location.href = "index";
</script>
```

→ **판정 규칙**: 본문에 `location.href` + `"index"` 가 있으면 **실패**이고, `var message`
안에 사유가 한/영 두 줄로 들어 있다. `_insa_fail_message()`(kortek_backend.py)가 이걸 뽑는다.
실패가 아니면 `None`을 돌려준다.

## ⚠️⚠️ 한 번만 시도한다 — 계정 잠금 방지

그룹웨어·SAP과 **같은 규칙**이다. 이 시스템이 몇 번 틀리면 잠기는지 확인할 방법이 없으므로
"모르면 안 한다"로 간다. 인사·급여가 걸린 시스템이라 더 보수적으로 둔다.

- **재시도 금지 가드는 프런트에 있다** — `window._insaEnsureLogin(onStep)` (`js/36-sap-login.js`).
  한 번 실패하면 그 사유를 기억하고, 그 뒤로는 **서버를 때리지 않고** 같은 사유를 돌려준다.
- 백엔드 `POST /insa/login` 은 부를 때마다 그냥 한 번 시도한다(가드 없음).
  **새 경로를 붙일 땐 반드시 `_insaEnsureLogin`을 통할 것 — `/insa/login`을 직접 부르지 말 것.**
- 사람이 🔑에서 "로그인 테스트"를 직접 누르면 가드가 풀린다(비밀번호를 고쳤을 수 있으므로).

## 비밀번호 보관

SAP·그룹웨어와 동일하다. Windows DPAPI로 암호화해 `insa_login_config.json`(.gitignore)에만
두고, **어떤 응답에도 비밀번호를 돌려주지 않는다**(등록 여부와 아이디만).

- `_dpapi_encrypt_b64` / `_dpapi_decrypt_b64` 는 **둘 다 kortek_backend.py 안에 있다.**
  `gw_bridge.py`에도 같은 복호화 함수가 있지만, 인사관리는 그룹웨어와 무관한 기능이라
  그룹웨어 모듈을 import 해야 비밀번호가 풀리는 구조는 맞지 않아 따로 뒀다.
- 두 구현 모두 `pOptionalEntropy`(3번째 인자)가 `None`이라 서로 호환된다.
  두 번째 인자 `'kortek-sap-login'`은 **엔트로피가 아니라 설명 문자열**이라 복호화에 영향 없음.

## 🖥 어디서 여는가 — 그룹웨어와 **같은 전용 크롬**

> [2026-10-21 수정] 처음엔 백엔드에서 `requests` 로만 로그인했다. 동작은 했지만
> **화면이 안 열린다**는 지적을 받았다(사용자). 로그인만 하고 끝낼 게 아니라 사람이
> 보고 이어서 써야 하므로, 그룹웨어와 같은 전용 크롬(CDP 9222, `KortekGW\cdp-profile`)에
> 탭으로 띄운다. 세션이 그 브라우저에 남아 이후 화면 조회/조작을 그대로 이어갈 수 있다.

- `gw_bridge._page_for(host, origin)` — 원래 그룹웨어 전용이던 탭 찾기를 일반화한 것.
  `_gw_page()` 는 이걸 부르는 얇은 껍데기라 그룹웨어 동작은 그대로다.
- `gw_bridge.insa_login_once()` 가 실제 로그인을 한다. 폼에 값을 넣고 `form.submit()`,
  **결과는 바깥에서 폴링**한다 — submit 하면 페이지가 넘어가며 JS 컨텍스트가 죽어서
  eval 의 반환을 기다리면 예외가 난다(그룹웨어에서 겪은 것과 같은 함정).

### 🐛 실측에서 잡은 것 — 빈 탭을 "로그인됨"으로 봤다

처음 `insa_session_info()` 는 "주소가 있고 로그인 폼이 없으면 로그인됨"으로 봤다.
그런데 탭이 아직 `about:blank`(또는 `chrome-error://`) 일 때도 그 조건을 만족해
**로그인도 안 했는데 "이미 로그인되어 있습니다"** 가 떴다 — 자동 로그인이 조용히
건너뛰어진다. → **주소가 실제로 `insa.kortek.co.kr` 일 때만** 판정하도록 고쳤다
(`onSite`). 탭을 막 만든 직후엔 몇 백 ms 동안 에러 페이지가 보이므로, 로그인 화면으로
보낼 때도 고정 sleep 이 아니라 **폼이 뜰 때까지 폴링**한다.

## 엔드포인트

| 경로 | 하는 일 |
|---|---|
| `GET /insa/login-config` | 등록 여부 + 아이디 (비밀번호는 절대 안 돌려줌) |
| `POST /insa/login-config` | `{user, pw}` 저장 (DPAPI 암호화) |
| `DELETE /insa/login-config` | 저장된 정보 삭제 + 세션 버림 |
| `GET /insa/status` | 서버 연결 가능 여부 + 로그인 상태. **로그인은 하지 않는다** |
| `POST /insa/login` | 저장된 계정으로 **한 번** 시도(전용 크롬 탭에서) |

로그인 세션은 전용 크롬이 들고 있다(백엔드에 쿠키를 따로 보관하지 않는다).

## 🔎 화면 자동 학습 (2026-10-21)

메뉴가 `<a href="#14">근무 계획</a>` 처럼 **해시 코드**로만 돼 있어 화면 주소를 밖에서 알 수 없다.
그래서 **추측하지 않고** 메뉴를 하나씩 눌러 보고 안쪽 프레임이 실제로 어디로 가는지 기록한다.
결과는 `insa_menu_catalog.json`(데이터)에 남긴다 — 경로를 코드에 박지 않는다.

- `POST /insa/learn` → `gw_bridge.insa_learn_menus()`. **읽기 전용**(화면을 띄우기만 하고
  어떤 폼도 제출하지 않는다). 새 메뉴가 생기면 다시 돌리면 된다.
- `GET /insa/menus` → 학습해 둔 카탈로그(파일만 읽음, 네트워크 안 씀)
- `GET /insa/screen?code=…` → 그 화면을 열어 **글자만** 읽어 온다
- AI 문답에서는 `insa_menus` / `insa_screen` 도구로 쓴다(js/40, 읽기 전용)

학습 결과 12개: 연차휴가사용계획 / 연차휴가사용계획서목록 / 근무 유형 설정 / 근무 계획 /
연장근무 신청내역 / 근무계획 수정내역 / 근무변동계 작성내역 / 카드누락사유서 내역 /
복리후생 / 의료비 / 학자금 / 설정.
(연차계획↔계획서목록, 복리후생↔의료비는 같은 주소를 쓴다 — `sameAsPrev` 로 표시해 둔다)

> `insa_menu_catalog.json` 은 저장소에 커밋해 두지만 **`_SELF_UPDATE_FILES`·배포 zip 에는
> 넣지 않는다.** 자동 업데이트가 사용자가 방금 학습한 카탈로그를 덮어쓰면 안 되기 때문이다.
> 새 PC는 "인사관리 화면 학습"을 한 번 돌리면 된다.

### ⚠️⚠️ 하루에 네 번 넘어진 함정들 — 다음 사람은 여기서 멈출 것

1. **학습한 주소로 직접 이동하면 안 된다.** 그 화면들은 GET 을 막아 둬서
   `HTTP 405 - Request method 'GET' not supported` 짜리 오류 페이지가 뜬다(로그인 `/kInsa` 와 같다).
   메뉴는 POST 로 열리고 파라미터는 밖에서 알 수 없다 → **메뉴를 클릭한다.**
   학습해 둔 `path` 는 **이동 수단이 아니라 "도착했는지 확인하는 용도"** 다.
2. **오류 페이지에 한 번 빠지면 계속 거기 머문다.** 최상위를 새로고침해야 앱 상태가 돌아온다
   (`_insa_reload_top`). 읽기 전에 프레임이 멀쩡한지 먼저 본다.
3. **클릭 직후 바로 읽으면 앞 화면 내용이 나온다.** 실제로 "연차휴가사용계획"을 물었는데
   직전에 열려 있던 "근무 계획" 본문이 나왔다 — **틀린 답을 자신 있게 주는 쪽**이라 더 나쁘다.
   → 학습해 둔 path 로 **주소가 바뀐 것을 확인한 뒤에** 읽고, 끝내 못 가면 `ok:false` 로
   정직하게 실패한다(앞 화면 내용을 절대 돌려주지 않는다).
4. **JS 문자열 안에 정규식을 넣지 말 것.** `replace(/
{3,}/g, …)` 를 heredoc 으로 쓰다
   백슬래시가 먹혀 **진짜 줄바꿈**이 박혔고, 정규식 리터럴은 줄을 넘을 수 없어 JS 가 매번
   SyntaxError 를 냈다. 그게 `except` 에 삼켜져 "화면을 읽지 못했습니다"만 반복됐다.
   글자 다듬기는 **파이썬 쪽에서** 한다. (메모리의 heredoc 백슬래시 주의와 같은 건)

### 🛠 도구 설명(desc)이 호출 횟수를 좌우한다

`desc` 는 AI 가 도구를 고르는 **유일한 근거**다(→ docs/qa-tool-router.md). 실사용에서 두 번 샜다:

| 증상 | 원인 | 고친 방법 |
|---|---|---|
| "연장근무 신청내역 보여줘"에 **'근무 계획'부터** 열었다 | 연차 안내를 `⚠️ **연차는 근무 계획**` 으로 너무 강조해 둬서 인사 질문 전반의 기본값이 됐다 | **질문 → 화면 대응표**로 바꾸고 "한 화면만 열면 되는 질문에 여러 화면을 열지 말 것" 추가 |
| `code=9` 로 호출해 실패 | 설명에 코드 예시(`"11"`)가 있어 **목록의 순번**으로 착각했다 | code 설명에 "**label 을 그대로**, 순번·숫자를 지어내지 말 것 — 코드는 `11`/`OW`/`AP` 같은 고정 문자열" 명시 |

> 실패해도 스스로 회복하긴 했다 — "그런 화면이 없습니다" 메시지에 **볼 수 있는 화면 목록을 같이
> 실어 보내서** 다음 호출에서 바로 맞췄다. 실패 메시지에 선택지를 넣어 두는 건 값을 한다.

### ⚠️⚠️ 작성 중인 화면은 절대 건드리지 않는다

사용자가 **근무계획 수정 신청서를 쓰던 중**에 조회 질문이 들어왔다. 그 화면은 메인 틀이 아니라
독립 페이지(`/workPlanEdit/regForm`)라 메뉴가 0개인데, 복구 로직이 "메뉴가 없으면 새로고침"으로
돼 있어서 **사람이 채워 둔 5칸을 날릴 뻔했다.**

→ 읽기 전 probe 에서 `input/textarea/select` 중 **값이 든 칸 수**를 함께 센다.
  메뉴가 없고(=메인 틀 아님) 입력된 칸이 있으면 **새로고침도 클릭도 하지 않고** `busyForm: true` 로
  그대로 보고한다. 조회 하나 때문에 사람 작업을 날리는 쪽이 훨씬 나쁘다.

## 🔬 리버스 엔지니어링 — 이 사이트는 **소스가 그대로 읽힌다**

> [2026-10-21] "리버스 엔지니어링 못 하냐"는 지적을 받고 실제로 해 봤더니, **내가 너무 보수적이었다.**
> 그룹웨어는 번들이 난독화돼 있어 런타임 관찰이 필요했지만, 인사관리는 2015년대 JSP + jQuery라
> JS가 전부 평문 UTF-8이다. 추측이 아니라 **소스를 읽으면 된다.**

```
/resources/common/js/common.js        (14,816자, 함수 33개)  ← goToMenu, openPopup, getGridData…
/resources/common/js/commonClass.js   (33,579자, 함수 65개)  ← 결재선·콤보·AJAX 래퍼
/resources/common/js/overWorkMgr.js   (3,604자)              ← 연장근무 전용
```

### 핵심: 화면 이동은 함수 하나다

```js
function goToMenu(action, options = {}) {
  if (!isEmpty(options.mainMenuNm)) $("#mainMenuNm").val(options.mainMenuNm);
  if (!isEmpty(options.subMenuNm))  $("#subMenuNm").val(options.subMenuNm);
  $("#menuFrm").attr({ action, method: "POST", target: "pageFrame" }).submit();
}
```

공용 폼 `#menuFrm` 을 그 경로로 **POST** 해서 `pageFrame` 에 띄운다. **GET 이 405 였던 이유가 이거다.**
팝업으로 뜨는 화면도 같은 방식이다(`target` 만 팝업 이름으로 바꾼다):

```js
$("#menuFrm").attr({ action: "/dl/regForm", method: "post", target: popupName }).submit();
```

→ `insa_read_screen` 은 이제 **메뉴를 클릭하지 않고 `goToMenu(path)` 를 직접 호출한다.**
  메뉴가 안 보이는 화면에서도 되고, 클릭이 먹었는지 조마조마할 필요도 없다.
  (메뉴 링크 클릭은 goToMenu 가 없을 때를 위한 폴백으로만 남겨 뒀다)

> 남은 흠: `mainMenuNm`/`subMenuNm` 을 안 넘겨서 **빵부스러기(breadcrumb) 라벨만** 직전 것으로
> 남는다. 본문은 정확하다. 메뉴 이름까지 학습해 넘기면 깔끔해진다.

### 쓰기는 아직 — 무엇이 남았나

읽기가 풀렸다고 쓰기가 따라오지는 않는다. 작성 중이던 '근무계획 수정 신청서'를 뜯어보니:

- `<form>` 에 **action 이 없고** method 가 get — 평범한 폼 전송이 아니다
- 입력칸 16개 중 **name 이 하나도 없다** → 이름으로 값을 실을 수 없다
- `등록` 이 `type=button` 이고 onclick 도 없다 → 리스너를 JS 가 붙인다
- hidden 6개

다만 **그 핸들러도 평문 JS 안에 있다.** 그 화면을 열어 둔 채 인라인 스크립트와
페이지별 JS 를 읽으면 "등록이 무엇을 어디로 보내는지"를 **소스로** 확정할 수 있다.
관찰(`insa_capture_write.py`)은 그걸 **교차 검증**하는 용도로 쓰면 된다 — 소스에서 읽은
payload 가 실제로 그렇게 나가는지 한 번만 확인하면 된다.

⚠️ 쓰기를 붙일 때도 이 저장소 원칙은 그대로다: 읽기와 **경로를 분리**하고(js/41),
   AI 자율 루프는 `mode:'write'` 를 영구 거부하며, 실행은 **사람 확인 1회 + nonce** 를 거친다.

## ✍️ 쓰기 계약 — 근무계획 수정 신청서 (소스로 확정, 2026-10-21)

`/workPlanEdit/regForm` 팝업의 **인라인 JS 39,894자**를 읽어 확정했다. 관찰이 아니라 소스다.

### 엔드포인트 4개 (전부 POST)

| 경로 | 역할 |
|---|---|
| `/workPlanEdit/getPlanTime` | 그 날짜의 계획시간 조회 (`userNum`, `date`) |
| `/workPlanEdit/chkInsert` | 등록 전 검증 + 임시저장 → `returnValue` 에 임시 문서번호 |
| `/workPlanEdit/chkOverWorkTime` | 연장근무 시간 점검 (`docno`) |
| `/workPlanEdit/insert` | **실제 등록** |

**흐름: `chkInsert` → (성공 시) `chkOverWorkTime(returnValue)` → `insert`.**
세 단계가 다 있고 검증이 앞에 붙어 있다 — `insert` 만 직접 때리면 이 검증을 건너뛴다.

### payload

```js
mainParam = "&wano=" + $("#wano").val()
          + "&req_subject=" + encodeURIComponent(제목)
          + "&req_content=" + encodeURIComponent(내용)

subParam  = encodeURIComponent(JSON.stringify(gridRows))   // 신청자 그리드(dhtmlxGrid)
// gridRows 각 행의 열:
//   seq, edituser, wdate, edno, beSTime, beETime, o_lunch, o_dinner,
//   workSTime, workETime, afSHour, afSMin, afEHour, afEMin,
//   lunchType, dinnerType, remark, userName
//   ※ wdate 는 "YYYY-MM-DD HH:mm" 에서 앞부분만 잘라 보낸다(row.wdate.split(" ")[0])

confirmParam = ConfirmInfoMaker.getConfirmInfoJson("confirmTb")   // 결재선
consultParam = ConfirmInfoMaker.getConfirmInfoJson("consultTb")   // 합의선

data = mainParam + "&subParam=" + subParam
                 + "&confirmParam=" + confirmParam
                 + "&consultParam=" + consultParam
```

### 응답 계약

```js
{ msgCode, msgDesc, returnValue, fieldType }
```
`msgCode == "Y"` 면 성공(→ `$.reloadData(); window.close();`).
아니면 `msgDesc` 를 그대로 보여주고, `fieldType == "M"` 이면 `#returnValue` 칸에 포커스.
HTTP `status == 1000` 은 **세션 만료**다.

### 붙일 때의 선택 — 직접 POST 하지 말 것

`insert` 를 직접 호출하면 `chkInsert`/`chkOverWorkTime` 검증을 건너뛰고,
결재선 JSON(`ConfirmInfoMaker`)도 손으로 조립해야 한다. **페이지의 함수를 그대로 부르는 쪽**
(`$.chkInsert()`)이 맞다 — 사람이 등록을 누르는 것과 같은 경로라 검증이 그대로 살아 있다.
우리가 할 일은 **칸을 채우는 것까지**다.

⚠️ 쓰기는 이 저장소 원칙을 그대로 따른다(docs/qa-tool-router.md): 읽기와 경로 분리(js/41),
   AI 자율 루프는 `mode:'write'` 영구 거부, 실행은 **사람 확인 1회 + nonce**.
   근무계획 수정 신청은 **결재로 올라가는 되돌리기 어려운 동작**이라 더더욱 그렇다.

## 아직 안 한 것 — 다음에 붙일 때

화면 조회/조작은 **없다.** 붙일 때는 그룹웨어와 같은 순서로:

1. 사람이 그 화면을 **직접 한 번 쓰는 동안** 실제 요청을 관찰해 경로·파라미터를 확정한다.
   (이 앱은 서버 렌더 JSP라 그룹웨어처럼 REST JSON이 아닐 수 있다 — 폼 POST + HTML 파싱일 가능성)
2. 읽기 전용부터. 쓰기(신청·결재 등)는 그룹웨어 원칙대로 **사람 확인 1회** 뒤에만.
3. 새 조회 기능은 `QA_TOOLS`(js/40)에 한 줄 추가 → AI 문답에서 바로 쓸 수 있다.
