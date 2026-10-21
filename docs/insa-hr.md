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

## 아직 안 한 것 — 다음에 붙일 때

화면 조회/조작은 **없다.** 붙일 때는 그룹웨어와 같은 순서로:

1. 사람이 그 화면을 **직접 한 번 쓰는 동안** 실제 요청을 관찰해 경로·파라미터를 확정한다.
   (이 앱은 서버 렌더 JSP라 그룹웨어처럼 REST JSON이 아닐 수 있다 — 폼 POST + HTML 파싱일 가능성)
2. 읽기 전용부터. 쓰기(신청·결재 등)는 그룹웨어 원칙대로 **사람 확인 1회** 뒤에만.
3. 새 조회 기능은 `QA_TOOLS`(js/40)에 한 줄 추가 → AI 문답에서 바로 쓸 수 있다.
