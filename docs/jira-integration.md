# 🪐 JIRA(Kortek Issue Tracker) 연동

**대상**: `http://jira.kortek.co.kr` — 사내 전용, HTTP(암호화 없음).

## 서버 사실 (2026-11-11 실측)

- `GET /rest/api/2/serverInfo` → `{"version":"5.2.11","buildNumber":854,"buildDate":"2013-04-15T00:00:00.000+0900","serverTitle":"Kortek Issue Tracker"}`
- **Jira Server 5.2.11** — 2013년 빌드. Atlassian 공식 지원 종료.
- 익명 접근 불가 — `GET /rest/api/2/issue/GABKJ-1` → **401** +
  `{"errorMessages":["You do not have the permission to see the specified issue.","로그인이 필요합니다."],"errors":{}}`
  (오류가 HTML 이 아니라 **깨끗한 JSON** — 화면 자동화가 필요 없다는 신호).
- **PAT(개인 액세스 토큰) 없음** — PAT는 Jira Server/DC 8.14+부터. 이 버전에서 쓸 수 있는 인증은
  **Basic Auth**(아이디:비밀번호를 매 요청에 실음) 또는 `/rest/auth/1/session` 쿠키 세션뿐.
  → Basic Auth 를 택했다(상태 유지가 필요 없고, 매 요청이 독립적이라 디버깅이 쉽다).

## 왜 화면 자동화(CDP/COM)가 아니라 `requests` 인가

SAP(`sap_bridge_32.py`, win32com)·그룹웨어/인사관리(`gw_bridge.py`, CDP 전용 크롬)는 REST API가
없거나 로그인이 복잡해서 화면을 직접 조작한다. JIRA 5.2는 **REST API(`/rest/api/2/*`)가 이미
열려 있고 Basic Auth 로 바로 쓸 수 있어** 그럴 필요가 없다 — `jira_bridge.py`는 순수
`requests` 호출만 한다(브라우저·COM 불필요).

## 인증·잠금 정책

⚠️⚠️ **이 서버가 비밀번호를 몇 번 틀리면 잠그는지, CAPTCHA 가 있는지 모른다.** SAP·그룹웨어·
인사관리와 같은 원칙으로 간다 — **모르면 1회만 시도하고, 실패하면 재시도하지 않는다.**

- 401(로그인 실패)이나 `X-Authentication-Denied-Reason` 헤더(CAPTCHA 요구 추정)가 오면
  `jira_bridge._BLOCKED['reason']`에 사유를 적고 **그 뒤 모든 호출을 그 자리에서 거부**한다
  (네트워크를 다시 타지 않는다 — `tests/test_jira_bridge.py` [1]로 확인).
- 403(권한 없음)은 **계정이 틀린 게 아니다** — 잠그지 않는다. 특정 이슈/프로젝트를 볼 권한이
  없을 때 온다.
- 잠금은 사람이 🔑 설정에서 계정을 **다시 저장해야**(`save_config`) 풀린다.
- 가드는 **서버(`jira_bridge._BLOCKED`) + 프런트(`js/36 _jiraEnsureLogin`) 이중**이다 —
  서버가 최종 방어선, 프런트는 "이미 실패했으면 또 부르지 않는다"로 호출 자체를 줄인다.
- 비밀번호는 Windows DPAPI로 암호화해 `jira_login_config.json`(.gitignore)에만 저장하고,
  어떤 응답에도 돌려주지 않는다.
- ⚠️⚠️ **HTTP 평문** — 이 서버를 HTTPS로 바꾸지 않는 한 사내망을 벗어나면 자격증명이 샌다.
  이 연동은 그 사실을 바꾸지 못한다(관리자 영역).

## 프로젝트↔이슈 연결 — 4가지를 동시에, **모델(제품구분자)마다 따로** (2026-11-11, 2차 갱신)

`js/70-jira-tab.js`가 매 탭 진입마다 네 소스를 **따로** 조회해 합친다. 전부 `tabData.
jiraLinksByUnit[unit]`에 **제품구분자(모델)별로** 저장된다(`unit`은 M.C Table·BOM·Customer
SPEC과 공유하는 `window.mcActiveUnit` — 한 프로젝트에 MVD/TPR/BTN처럼 모델이 여럿이면 모델마다
다른 JIRA 프로젝트를 연결할 수 있다, 사용자 요청):

1. **수동 키** — `...[unit].manualKeys`(배열). ⚙️ 연결 설정 모달에서 쉼표로 입력.
2. **키워드 자동검색** — `...[unit].keyword`. JQL `text ~ "키워드*"`. 기본값 placeholder는
   **지금 모델의** 고객모델명(`tabData.projectModels`에서 `unitId`가 일치하는 카드)이지만
   **자동으로 저장하지 않는다** — 빈 칸이면 검색을 돌리지 않는다.
3. **메일에서 이미 캡처된 이슈번호** — 모델 구분 없이 저장하지 않고 **매번 다시 스캔**한다.
   `window.globalData` 전체 행을 훑어 `row._mailRaw.subject`/`body2000`에서
   `/\b[A-Z]{2,10}-\d{1,6}\b/g`로 추출(최근 20건 cap) 후, **실제 JIRA 프로젝트 키 목록과
   대조해** 없는 접두어는 버린다(`validProjectPrefixes()` — 전자부품 코드·사내 제품번호가
   섞여 들어오는 걸 막는다, 아래 "메일캡처 오탐" 절 참고).
4. **JIRA 프로젝트 전체** — `...[unit].projectKey`(+ 표시용 `projectName`). ⚙️ 설정의
   📁 칸에 코드(`GABKJ`)나 이름 일부(`SHUFFLER`)를 넣고 🔍 찾기로 고르면 `project = GABKJ`로
   그 프로젝트의 이슈 전체를 가져온다.

⚠️⚠️ **프로젝트는 이름이 아니라 항상 key로 저장·조회한다.** 실측(`/rest/api/2/project`, 604건)
으로 확인: 프로젝트 **이름**엔 `LNW>SHUFFLER 3.0"`처럼 `>`나 끝에 붙은 `"` 같은 특수문자가
섞여 있다 — JQL `project = "그 이름"`은 따옴표/이스케이프가 꼬여 거의 항상 **400**으로
실패한다(실측 확인). `project = GABKJ`(key)는 공백·특수문자가 없어 안전하다. 그래서
`jira_bridge.resolve_project_key(text)`는 사람이 적은 글자(코드 또는 이름 일부)를 **정확히
하나의 프로젝트에만** 걸릴 때만 key로 바꾸고, 0건이나 2건 이상 걸리면 **추측하지 않고 `None`**
을 돌려준다(연결 설정 모달이 "🔍 찾기로 골라주세요"를 보여주고 그 필드는 저장하지 않는다).

## 📎 첨부파일 (2026-11-11, 사용자 제보)

"댓글에 '첨부 파일 참조'라고 적혀 있는데 파일이 안 보인다" — JIRA는 첨부를 **댓글이 아니라
이슈**에 붙인다(실측 GABJQ-4, 3건: xlsx 1개 + jpg 2개). `FIELDS_DEFAULT`에 `attachment`를
추가하고 `_shape_issue`가 `attachments: [{filename,size,mimeType,url,author,created}]`로
옮긴다. 이미지는 상세 모달에 90×90 썸네일로 바로 보이고, 전부 새 탭으로 열면 받아진다.

⚠️⚠️ **다운로드는 프록시를 거친다(`GET /jira/attachment?url=&name=`)** — JIRA 첨부 주소
(`/secure/attachment/<id>/<파일명>`)는 Basic Auth가 필요해서 브라우저가 직접 열면 401이
난다. `jira_bridge.fetch_attachment(url)`가 그 바이트를 받아 백엔드가 중계한다. ⚠️ `url`은
**`JIRA_BASE + '/secure/attachment/'`로 시작할 때만** 허용한다(`fetch_attachment` 안에서
검사) — 그렇지 않으면 임의 주소를 우리 JIRA 계정으로 대신 받아오는 SSRF 통로가 된다. 파일명이
한글일 수 있어 `Content-Disposition`은 RFC 5987 퍼센트 인코딩(`filename*=UTF-8''...`)으로 —
일반 `filename="..."`는 라틴-1만 허용돼 한글에서 터진다.

실측: `get_issue('GABJQ-4')` → 첨부 3건, `fetch_attachment`로 37,711바이트(xlsx) 그대로 받음
확인.

### 📎 첨부 저장(업로드, 2026-11-11 추가)

상세 모달에서 파일을 골라 **⬆ 첨부 저장**을 누르면 그 이슈에 새 첨부가 올라간다
(`jira_bridge.add_attachment` → `POST /rest/api/2/issue/{key}/attachments`, multipart).

⚠️⚠️ **`X-Atlassian-Token: no-check` 헤더가 필수다** — 옛 Jira는 파일 업로드에 XSRF 토큰을
요구하는데 REST 클라이언트는 그 토큰을 받을 길이 없어, 공식 문서가 적어 둔 이 헤더로 그 검사를
건너뛴다(빠뜨리면 403). `_request`가 `**kw`를 그대로 `requests.request`에 넘기므로
`headers=`/`files=`도 기존 401/403/CAPTCHA/잠금 판정을 그대로 탄다 — 새 경로를 따로 안
만들어도 된다.

⚠️ AI 문답 도구(js/40 QA_TOOLS)엔 이 라우트를 **등록하지 않았다** — 업로드는 파일을 고르고
버튼을 누르는 사람만 할 수 있다(다른 쓰기 경로와 같은 원칙).

⚠️ **실측 안 함(의도적)** — GET(조회)과 달리 POST는 실제 이슈에 영구적인 첨부를 남겨 동료들도
보게 된다. 코드는 문서화된 API 계약대로 작성하고 가짜 경계(`requests.request`) 테스트로
확인했지만, 실제 JIRA 서버에 올라가는 것은 사람이 한 번 직접 눌러 확인해야 한다.

### 👤 담당자 변경 확장(2026-11-11 추가)

담당자 칸 옆에 **🔍 찾기**를 추가했다 — JIRA 아이디를 몰라도 이름 일부로 찾아 고를 수 있다.

⚠️⚠️ **JIRA 자체 검색은 못 믿는다(실측)** — `/rest/api/2/user/assignable/search`의 `query`
파라미터가 이 서버에서 **조용히 무시된다**("hong"과 "yhpark"로 각각 질의해도 똑같은 50명이
그대로 왔다). `maxResults`는 실제로 듣는다(실측 `maxResults=500` → 204명 한 번에 옴,
페이지네이션 불필요). 그래서 `jira_bridge.assignable_users(key, q)`가 전체를 한 번 받아
**우리가 직접** 이름/아이디로 거른다 — `list_projects`/`resolve_project_key`와 같은 원칙
("결정론 먼저", CLAUDE.md).

## 🔁 Summary 탭 모델 카드 ↔ JIRA 양방향 참조 (2026-11-11, 사용자 요청)

Summary 탭의 모델 카드(고객모델명·프로젝트코드·프로젝트명칭·KTK PN 4칸)에 **🪐 JIRA 코드**
칸을 추가했다. JIRA 탭 헤더의 토글 바(`#jira-unit-bar`, M.C/BOM/Customer SPEC과 같은 모양 —
"탭마다 다르게 생기면 같은 기능으로 안 보인다"는 js/43의 교훈을 그대로 따른다)로 모델을
전환하면 그 모델의 JIRA 연결만 보인다.

⚠️ **(2026-11-11 사용자 정정) 자리는 새 줄이 아니라 "프로젝트 코드" 옆이다** — 처음엔 카드
맨 아래에 새 줄로 붙였는데, 사용자가 원한 건 "고객 모델명·프로젝트 코드"가 있는 **첫 줄**을
4칸→6칸으로 늘려 그 자리에 바로 넣는 것이었다(첨부 스크린샷으로 확인). `_renderModelCardHtml`
감싸기를 **문자열 끝에 덧붙이기**에서 **"프로젝트 코드" 입력칸과 "프로젝트 명칭" 라벨 사이에
끼워 넣기**로 바꿨다(`grid-template-columns`도 `140px 1fr 140px 1fr` → `140px 1fr 140px 1fr
110px 1fr`로 6열). 두 번째 줄(프로젝트 명칭·KTK PN)은 그대로 4칸만 채우고 2칸은 빈다 —
사용자가 가리킨 자리가 **첫 줄**이었으므로 의도된 모양이다. 이정표 문자열(원본 js/22g의
정확한 라벨/그리드 문자열)을 못 찾으면 예전처럼 맨 끝에 붙이는 것으로 안전하게 물러난다
(js/22g가 나중에 바뀌어도 조용히 깨지지 않고 눈에 띄는 자리로만 밀린다).

⚠️⚠️ **"양방향 참조"는 동기화 코드가 아니라 같은 저장소를 공유하는 것으로 구현했다.** Summary
모델 카드의 JIRA 코드 칸과 JIRA 탭의 📁 프로젝트 칸은 **둘 다 `tabData.jiraLinksByUnit[unitId]
.projectKey`를 그대로 읽고 쓴다** — 복사본이 없으므로 한쪽을 고치면 다른 쪽은 다음에 그릴 때
그 값을 그대로 본다. 구현은 js/22g(Summary 모델 카드)를 직접 고치지 않고 **감싼다**(js/43이
`populateTabData`/`mcSwitchUnit`을 감싸는 것과 같은 방식 — js/70 하나만 빼면 예전 동작으로
돌아간다):
- `window._renderModelCardHtml`을 감싸 반환된 HTML 끝(`</div></div>`) 바로 앞에 JIRA 코드
  입력칸을 끼워 넣는다(`data-jira-field="projectKey"`).
- `window._syncProjectModelsFromDom`을 감싸, DOM의 모든 `.sum-model-card`를 훑어 그 칸의
  값을 `tabData.jiraLinksByUnit[card.dataset.unitId].projectKey`에 적는다(코드가 바뀌면
  `projectName`은 비워 다음 조회가 다시 채우게 한다 — 옛 이름이 새 코드에 붙어 있으면 안 된다).
- `window.mcSwitchUnit`도 감싸 모델을 바꿀 때마다 토글 바를 다시 그리고, **지금 JIRA 탭이
  열려 있으면** `_jiraOnTabShown()`을 다시 불러 그 모델의 연결로 새로고침한다.

⚠️ Summary의 JIRA 코드 칸은 **코드만** 받는다(대문자로 저장) — JIRA 탭의 🔍 찾기 같은 이름
검색은 하지 않는다(Summary는 빠른 입력용, JIRA 탭이 "찾아서 고르는" 쪽을 전담).

⚠️⚠️ **네 소스를 한 JQL로 OR 하지 않는다.** JIRA의 `key in (A,B,C)`는 그중 **하나라도 존재하지
않으면 전체가 400**으로 죽는다 — 메일 스캔은 정규식 기반이라 가짜 키(SAP 코드 등)를 주워올
수 있다. 그래서 `/jira/search`를 소스별로 **따로** 부른다: 수동 키 1콜, 메일 키 1콜, 키워드
검색 1콜, 프로젝트 1콜. 하나가 400이어도 나머지는 멀쩡히 보여야 한다(표 위에 ⚠️ 로 실패
사유만 적힌다).

표의 "출처" 칩은 머지 후 클라이언트에서 역으로 계산한다(`src: []` 배열, 한 이슈가 여러
소스에 동시에 걸릴 수 있다). AI 문답에서 프로젝트 이름만 아는 질문("SHUFFLER 코드가 뭐야")은
`jira_projects` 도구(js/40, `/jira/projects?q=`)로 먼저 key를 찾게 한다.

⚠️⚠️ **(2026-11-11 사용자 제보) 메일캡처는 모델 구분이 없어 다른 모델 이슈가 섞여 보였다** —
"TPR 탭에 아무 연결도 안 했는데 사실은 TVD 쪽 이슈(GABJQ-4)가 보인다"는 신고로 확인. 메일
스캔은 설계상 **전체 메일**을 훑는다(어느 행이 어느 모델 것인지 메일 자체엔 표시가 없다) —
그래서 모델이 하나뿐인 프로젝트에선 문제가 없지만, 모델이 여럿이면 한 모델의 메일에서 찾은
JIRA 키가 **다른 모델 탭에도 그대로** 나타났다. → `_jiraOnTabShown`에서 모델이 둘 이상이면
메일 스캔 결과를 추가로 좁힌다: ① 지금 모델에 📁 프로젝트 코드가 있으면 **그 코드로 시작하는
키만** 남기고 ② 아직 아무 프로젝트도 등록 안 했으면 **메일 추정 자체를 보여주지 않는다**(어느
모델 것인지 알 길이 없는데 섞어 보이는 것보다 "없음"이 정직하다 — CLAUDE.md "결정론 먼저").
수동 키·키워드·프로젝트 전체 3가지는 애초에 모델별 저장소(`jiraLinksByUnit[unit]`)라 이
문제가 없다 — 영향은 메일캡처 하나뿐이었다.

## 백엔드 라우트 (`kortek_backend.py` → `jira_bridge.py`)

| 라우트 | 메서드 | 용도 |
|---|---|---|
| `/jira/status` | GET | 설정 유무·서버 도달성·확인 여부·잠금 사유 |
| `/jira/login-config` | POST/DELETE | 계정 저장(DPAPI)/삭제 |
| `/jira/login` | POST | **1회** whoami 확인(`/rest/api/2/user?username=<내 계정>`) |
| `/jira/issue/<key>` | GET | 이슈 1건(경로 파라미터 — JIRA 탭 전용) |
| `/jira/issue` | GET | 이슈 1건(쿼리 `key=` — **AI 문답 도구 전용**, js/40 은 인자를 쿼리스트링으로만 붙인다) |
| `/jira/search` | GET | JQL 검색(`jql`, `maxResults`) |
| `/jira/issue/<key>/comment` | POST | 댓글(대응) |
| `/jira/issue/<key>/transitions` | GET/POST | 전환 가능 목록 / 실행 |
| `/jira/issue/<key>` | PUT | 필드 수정(`fields: {summary, description, assignee:{name}, priority:{id}}`) |
| `/jira/priorities` | GET | 우선순위 목록(필드수정 드롭다운용) |
| `/jira/projects` | GET | 프로젝트 목록/검색(`q=`, 코드·이름 부분일치). 5분 캐시(`_PROJECT_CACHE`) |
| `/jira/attachment` | GET | 첨부파일 다운로드 프록시(`url=`, `name=`) — `/secure/attachment/`로 시작하는 주소만 허용 |
| `/jira/issue/<key>/attachment` | POST | 첨부 저장(업로드, multipart `file`) |
| `/jira/issue/<key>/assignable-users` | GET | 담당자 후보 찾기(`q=`, 이름/아이디 부분일치 — JIRA 자체 검색은 못 믿어서 우리가 직접 거름) |

⚠️ `/jira/issue/<key>`와 `/jira/issue`가 **둘 다 있는 이유**: AI 문답 도구 루프(`js/40 _qaRunTool`)는
모든 인자를 쿼리스트링으로만 붙이고 경로에 끼워 넣지 않는다 — 그래서 QA_TOOLS 전용으로
쿼리 버전을 따로 뒀다(`docs/qa-tool-router.md` 참고, 다른 경로 param 도구가 생기면 같은 패턴).

## 쓰기(댓글/상태전환/필드수정)는 사람만

AI 문답 도구(`QA_TOOLS`, js/40)에는 `jira_issue`/`jira_search` **두 개만, `mode:'read'`로만**
등록돼 있다. 쓰기 라우트(`/jira/issue/<key>/comment` 등)는 QA_TOOLS에 없으므로 AI 자율 루프가
절대 부를 수 없다 — `js/70`의 상세 모달에서 **사람이 버튼을 눌러야만** 실행된다
(`docs/qa-tool-router.md` "쓰기는 읽기와 경로 분리" 원칙 그대로).

## 🐛 (2026-11-11) "로그인 테스트"가 항상 실패했던 진짜 원인 — `/rest/api/2/myself`가 이 서버엔 없다

사용자가 🔑 설정에서 실제 계정을 저장하고 로그인 테스트를 눌렀는데 **"해당 이슈를 찾을 수
없습니다."**로 매번 실패했다. 실측(`python -c "..."`로 직접 HTTP 응답 확인)으로 원인을
확정했다:

- **인증 자체는 성공한다** — 응답 헤더에 `X-Seraph-LoginReason: OK`, `X-AUSERNAME: <내 계정>`이
  실린다. 비밀번호 문제가 전혀 아니었다.
- 그런데 `GET /rest/api/2/myself`가 이 2013년 빌드엔 **등록돼 있지 않아** `404`
  (`<status><status-code>404</status-code><message>null for uri: ...</message></status>`)를
  준다. 404 핸들러가 "이슈를 찾을 수 없다"는 문구를 썼던 터라 더 헷갈렸다(그 문구도 범용으로
  고쳤다).
- `GET /rest/api/2/user?username=<내 계정>`은 실측으로 **200**이 확인됐다 — 이 서버에서
  통하는 whoami는 이것이다. `verify_login()`을 여기로 바꿨다.
- ⚠️ `GET /rest/api/2/issue/GABKJ-1`도 실측 **200**으로 확인됐다(한글 요약 정상 반환 —
  터미널에 찍히는 깨진 글자는 Windows 콘솔 코드페이지 문제였을 뿐, 실제 유니코드 코드포인트는
  정확했다). → 이 연동은 이제 실제로 동작한다.

검증 `tests/test_jira_bridge.py` [7]이 "다시 `/rest/api/2/myself`로 되돌리면" 바로 잡아낸다.

## 검증

```
python tests/test_jira_bridge.py
```

**59건** — 401/CAPTCHA 헤더 1회 실패 후 잠금(네트워크 재시도 0회), 403은 안 잠금, `verify_login`이
`/rest/api/2/user?username=`을 쓰는지(위 버그의 회귀 방지), `_shape_issue` 필드 매핑
(요약·설명·상태·담당자·우선순위·댓글·첨부), `search` 집계, `save_config`/`delete_config`는
**진짜 Windows DPAPI**로 암복호화 왕복까지, `list_projects`/`resolve_project_key`는 캐시가
네트워크를 또 안 타는지·이름이 0건/2건+이면 추측 없이 `None`을 돌려주는지, 📎 첨부 다운로드
SSRF 화이트리스트, 📎 첨부 저장(업로드, `X-Atlassian-Token`)·👤 담당자 찾기(`query=` 무시를
직접 거름)·**📂 연결 프로그램으로 열기**(받은 바이트를 임시 폴더에 안전한 파일명으로 쓰고
`os.startfile` 호출까지, `..`/`\`가 섞인 악의적 파일명도 확인)까지 포함한다.
가짜는 `requests.request` 경계 하나뿐(`os.startfile`만 추가로 스텁).

✅ **실제 서버로 확인한 것**(2026-11-11, 저장된 실제 계정으로): 로그인(whoami) 성공, 실제
이슈(`GABKJ-1`) 조회 성공(요약·상태·담당자 정상 반환), `GET /rest/api/2/project`(604건,
0.1초/186KB) 성공, `project = GABKJ` JQL 조회 성공(2건), `project = "LNW>SHUFFLER 3.0"` 이름
그대로는 **400 실측 확인**(위 "4가지 동시 연결" 절의 근거).

✅ **(2026-11-12 추가) 연결 프로그램으로 열기도 실제 서버로 확인함** — `GABJQ-4`의 jpg 첨부
1건을 실제로 내려받아 `%TEMP%\kortek_jira_attachments\`에 127,023바이트(원본과 일치)로
쓰고 `os.startfile`까지 예외 없이 호출됐다(사진 뷰어가 실제로 열렸을 것이다). 상세는
`docs/file-upload-dragdrop-audit.md`.

⚠️ **아직 확인 못 한 것**:
- JIRA 탭 화면이 실제로 표를 그리는지, 상세 모달의 댓글/상태전환/필드수정이 실제 JIRA에
  반영되는지, 드롭존 애니메이션이 의도대로 보이는지(브라우저 자동화가 이 세션의 로컬 프리뷰
  서버에 연결하지 못해 화면 자체는 아직 못 봄)
- AI 문답에서 "GABKJ-1 상태 알려줘" 같은 질문이 실제로 `jira_issue` 도구를 골라 답하는지
- 엑셀 등 비이미지 첨부를 "연결 프로그램으로 열기"했을 때 실제로 Excel이 뜨는지(jpg로만 확인)

## 알려진 제약

- 담당자 입력칸은 **JIRA 아이디**(username)를 받는다 — 표시 이름(한글)이 아니다. 틀린
  아이디를 넣으면 JIRA가 400을 준다(사람이 바로 본다).
- 설명(description) 편집은 이 버전이 ADF(Atlassian Document Format) 이전이라 **plain text**
  필드라 안전하다(위키 마크업이 있다면 그 문법 그대로 평문 저장된다).
- 메일 키 스캔 정규식(`[A-Z][A-Z0-9]{1,9}-\d{1,6}`)은 과매칭할 수 있다(예: 다른 사내
  코드 체계) — JQL `key in (...)`이 존재하지 않는 키를 만나면 그 소스 하나만 조용히
  "조회 실패" 노트로 떨어지고 나머지는 멀쩡하다(위 "3가지 동시 연결" 절 참고).
