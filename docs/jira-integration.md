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

## 프로젝트↔이슈 연결 — 3가지를 동시에 쓴다 (사용자 결정, 2026-11-11)

`js/70-jira-tab.js`가 매 탭 진입마다 세 소스를 **따로** 조회해 합친다:

1. **수동 키** — `tabData.jiraLinks.manualKeys`(배열). ⚙️ 연결 설정 모달에서 쉼표로 입력.
2. **키워드 자동검색** — `tabData.jiraLinks.keyword`. JQL `text ~ "키워드*"`. 기본값 placeholder는
   프로젝트 모델명(`projectMeta.고객모델명`)이지만 **자동으로 저장하지 않는다** — 빈 칸이면
   검색을 돌리지 않는다(아무 말 없이 전체 조회가 되는 걸 막는다).
3. **메일에서 이미 캡처된 이슈번호** — 저장하지 않고 **매번 다시 스캔**한다. `window.globalData`
   리프가 아닌 전체 행을 훑어 `row._mailRaw.subject`/`body2000`에서
   `/\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g`로 추출(최근 20건 cap). 이미 메일 분석이 쌓아 둔 데이터를
   재사용하는 것이라 새 인프라가 없다(`CLAUDE.md` "학습으로 업그레이드되는 앱" 방향과 일치).

⚠️⚠️ **세 소스를 한 JQL로 OR 하지 않는다.** JIRA의 `key in (A,B,C)`는 그중 **하나라도 존재하지
않으면 전체가 400**으로 죽는다 — 메일 스캔은 정규식 기반이라 가짜 키(SAP 코드 등)를 주워올
수 있다. 그래서 `/jira/search`를 소스별로 **따로** 부른다: 수동 키 1콜, 메일 키 1콜, 키워드
검색 1콜. 하나가 400이어도 나머지 둘은 멀쩡히 보여야 한다(표 위에 ⚠️ 로 실패 사유만 적힌다).

표의 "출처" 칩은 머지 후 클라이언트에서 역으로 계산한다(`src: []` 배열, 한 이슈가 여러
소스에 동시에 걸릴 수 있다).

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

32건 — 401/CAPTCHA 헤더 1회 실패 후 잠금(네트워크 재시도 0회), 403은 안 잠금, `verify_login`이
`/rest/api/2/user?username=`을 쓰는지(위 버그의 회귀 방지), `_shape_issue` 필드 매핑
(요약·설명·상태·담당자·우선순위·댓글), `search` 집계, `save_config`/`delete_config`는
**진짜 Windows DPAPI**로 암복호화 왕복까지 확인한다. 가짜는 `requests.request` 경계 하나뿐.

✅ **실제 서버로 확인한 것**(2026-11-11, 저장된 실제 계정으로): 로그인(whoami) 성공, 실제
이슈(`GABKJ-1`) 조회 성공(요약·상태·담당자 정상 반환).

⚠️ **아직 확인 못 한 것** — 백엔드가 `debug=False`라 재시작 전엔 이 수정이 반영되지 않는다:
- **백엔드 재시작 필요** — 지금 돌고 있는 프로세스는 고치기 전 `jira_bridge.py`를 메모리에 들고
  있다(재시작 전엔 이전처럼 "이슈를 찾을 수 없습니다"가 난다).
- JIRA 탭 화면이 실제로 표를 그리는지, 상세 모달의 댓글/상태전환/필드수정이 실제 JIRA에
  반영되는지(브라우저 자동화가 이 세션의 로컬 프리뷰 서버에 연결하지 못해 화면 자체는
  아직 못 봄)
- AI 문답에서 "GABKJ-1 상태 알려줘" 같은 질문이 실제로 `jira_issue` 도구를 골라 답하는지

## 알려진 제약

- 담당자 입력칸은 **JIRA 아이디**(username)를 받는다 — 표시 이름(한글)이 아니다. 틀린
  아이디를 넣으면 JIRA가 400을 준다(사람이 바로 본다).
- 설명(description) 편집은 이 버전이 ADF(Atlassian Document Format) 이전이라 **plain text**
  필드라 안전하다(위키 마크업이 있다면 그 문법 그대로 평문 저장된다).
- 메일 키 스캔 정규식(`[A-Z][A-Z0-9]{1,9}-\d{1,6}`)은 과매칭할 수 있다(예: 다른 사내
  코드 체계) — JQL `key in (...)`이 존재하지 않는 키를 만나면 그 소스 하나만 조용히
  "조회 실패" 노트로 떨어지고 나머지는 멀쩡하다(위 "3가지 동시 연결" 절 참고).
