# 🏢 그룹웨어(다우오피스) 연동 — `gw_bridge.py`, `/gw/*`

**읽을 때**: 그룹웨어 일정/주소록/전자결재 연동 전반. **그룹웨어 기능이 안 될 때 원인 이력이 여기 다 있음 — 먼저 검색.**

대상: `gw.kortek.co.kr` = **다우오피스(Daou Office)**, 서버 TIMS 3.0.2.2 (실측 2026-10-16)

---

## 1. 구조 — 왜 이 방식인가

```
Gantt 앱 (아무 브라우저)
   │ HTTP
   ▼
로컬 백엔드 127.0.0.1:5000  (kortek_backend.py /gw/*)
   │ CDP (포트 9222)
   ▼
전용 크롬  ← 프로필: %LOCALAPPDATA%\KortekGW\cdp-profile
   │ 세션 쿠키
   ▼
그룹웨어 내부 REST API  (/api/*)
```

- **DOM 스크래핑이 아니다.** 그룹웨어가 자기 화면을 그릴 때 쓰는 **내부 REST API**를 그대로 호출한다 → 화면이 개편돼도 안 깨진다.
- **OAuth 발급을 기다릴 필요가 없다.** 사람이 브라우저에서 한 번 로그인하면 그 세션으로 읽는다.
- **Playwright/Selenium을 쓰지 않는다.** 이미 깔린 크롬 + `requests`/`websockets`(기존 의존성)로 CDP를 직접 말한다 → 팀 배포 시 브라우저 바이너리 150MB를 각 PC에 안 받아도 된다.
- Gantt 앱과 **같은 브라우저일 필요 없다.** 그룹웨어 창은 최소화해도 동작한다.

### 전용 프로필을 쓰는 이유
기본 크롬 프로필에 붙이면 ① 크롬이 이미 떠 있을 때 원격 디버깅이 **거부**되고 ② 그룹웨어 말고 **로그인된 모든 사이트**가 조작 범위에 들어온다. 전용 프로필이면 사고 범위가 그룹웨어로 한정된다.
평소 쓰는 크롬은 `--remote-debugging-port`가 없어서 **절대 조작 대상이 되지 않는다.**

### 지금 연결된 브라우저 확인법
`chrome://version`의 프로필 경로에 `KortekGW\cdp-profile`이 보이면 자동화 창. (일반 크롬은 `Google\Chrome\User Data`)

---

## 2. ⚠️ API 경로를 추측하지 말 것

**추측한 경로 12개가 전부 404였다**(2026-10-16). `/api/organization`, `/api/users/me`, `/api/v1/*` 전부 없음.

**반드시 관찰로 확정한다** — CDP `Network.enable` 후 해당 화면을 열고 XHR/Fetch를 캡처:

```python
# scratchpad 예시 — Network.requestWillBeSent 에서 type이 XHR/Fetch인 것만 수집
await cmd(1,'Network.enable'); await cmd(2,'Page.navigate',{'url': 대상화면})
```

- 이미 그 화면에 있으면 `Page.navigate`가 아무것도 안 한다 → **다른 화면 경유 후 재이동**하거나 `Page.reload{ignoreCache:true}`.
- URL이 길면 콘솔 출력에서 잘린다 — **전체 URL을 그대로 캡처**해 파라미터를 분해할 것(아래 캘린더 사고 참고).

---

## 3. 로그인 — 함정이 많다

### ⚠️ 자동 로그인은 **1회만**, 실패하면 재시도 금지
이 사이트는 **로그인에 실패해야 CAPTCHA가 나타난다**(평소 `#captcha`는 `display:none`). 자동 로그인을 반복하면 실패가 쌓여 CAPTCHA에 막히고 그다음은 **사내 통합 계정 잠금** — 메일·전자결재까지 같이 멈춘다(SAP보다 파장이 크다).
`login_once()`는 실패/CAPTCHA/폼없음 **모든 경로에서 재시도하지 않고** 창을 열어 사람에게 넘긴다. 이미 CAPTCHA가 떠 있으면 시도조차 하지 않는다.

### ⚠️ 진짜 로그인 버튼은 `<a>`, 숨겨진 submit에 속지 말 것 (2026-10-19 사고)
```html
<a id="login_submit" class="btn_login" href="#">로그인</a>   ← 진짜 (보임)
<input type="submit">                                      ← 숨김
```
`input[type=submit]`을 먼저 집어 **숨은 걸 클릭**하면 아무 일도 일어나지 않는데, 결과만 보고 "로그인 실패"로 보고된다. **보안문자가 안 뜨는 게 단서** — 실패가 쌓였으면 떴어야 하는데 안 떴다는 건 애초에 제출이 없었다는 뜻.
→ **보이는 요소만** 후보로 삼고(`offsetParent`/`visibility`/`display` 확인) `#login_submit` 우선.

### ⚠️ 제출 결과를 같은 JS 컨텍스트에서 기다리지 말 것 (2026-10-19 사고)
제출하면 페이지가 이동하면서 **그 JS의 실행 컨텍스트가 파괴**된다 → `await`가 영원히 안 풀리고 CDP가 **본문 없는 예외**를 돌려준다(`로그인 시도 중 오류: ` 라는 이유 없는 실패).
→ JS는 **제출만 하고 즉시 반환**(`result:'submitted'`), 결과 판정은 **바깥(파이썬)에서 `session_info()` 폴링**(최대 20초).

### ⚠️ 로그인 직후 소개 투어가 화면을 덮는다
`<a class="welcome_skip">SKIP</a>` / 오버레이 `div.step.step1`. 안 닫으면 이후 폼 조작이 전부 막힌다.
→ `dismiss_intro()`를 **로그인 성공 직후**와 **기안 작성 화면 진입 직후** 양쪽에서 호출. 투어가 여러 단계일 수 있어 최대 3번 누른다. 선택자/문구는 `_INTRO_SKIP_SELECTORS`/`_INTRO_SKIP_WORDS`(데이터).

### 비밀번호 보관
SAP 로그인과 동일 — Windows **DPAPI** 암호화, `gw_login_config.json`(**.gitignore**)에만 저장. 명령줄·로그·HTTP 응답 어디에도 싣지 않는다. 설정 UI는 **AI 문답 창 🔑**(`js/36-sap-login.js`, SAP과 같은 자리).

### 세션
전용 프로필에 쿠키가 남아 크롬을 껐다 켜도 유지된다. 며칠 지나면 만료(401 `인증되지 않았습니다`) → 🔑에서 다시 로그인.

---

## 4. 확인된 내부 API

### 공통
| 경로 | 용도 |
|---|---|
| `/api/user/session` | 내 계정 — `data.id`(=repId), email, companies[0].userLoginId |
| `/api/approval/side` | 자주 쓰는 결재 양식 목록(formId/deptId) |

### 캘린더
```
/api/user/session                      → data.id (예: 2102)
/api/calendar/user/{id}/calendar       → 캘린더 목록 (id·name·type·defaultCalendar)
/api/calendar/event?timeMin=..&timeMax=..&includingAttendees=true&calendarIds[]=10&calendarIds[]=11…
```
- ⚠️ **`calendarIds[]` 배열 파라미터가 필수** — 빼면 서버가 **500**(`일시적인 오류입니다`). 이것 때문에 한참 헤맸다.
- ⚠️ `/api/calendar/feed`가 주는 id는 **follower 레코드 id**라 `calendarIds[]`에 쓰면 안 된다. 반드시 `/api/calendar/user/{id}/calendar`의 id를 쓸 것.
- 이벤트 필드: `summary` `startTime` `endTime` `timeType`(allday/time) `location` `calendarName` `creator` `attendees`

### 주소록
```
/api/contact/personal/contacts?offset=20&page=0&property=nameInitialConsonant&direction=asc
```
필드: `name` `email` `mobileNo` `companyName` `departmentName` `positionName` (실측 365건)

### 메일 (조사 2026-10-19, 부분)
| 경로 | 메서드 | 용도 |
|---|---|---|
| `/api/mail/folder/all` | GET | 폴더 목록 + **용량(quotaInfo)** |
| `/api/mail/folder/info` | GET | 폴더별 건수(newCnt/unseenCnt/totalCnt) |
| `/api/mail/message/list` | POST | 메일 목록. **body `{}`(JSON)이면 받은메일함 1페이지 80건** |
| `/api/mail/message/count` | POST | 건수. body는 **form-urlencoded** (`flag=U&folder=Inbox`) |
| `/api/mail/message/gadget?count=&folder=` | GET | 홈 위젯용 요약(`folder=quick/unseen`) |
| `/api/mail/bookmark/list` | GET | 즐겨찾기(flaged/unseen 등) |
| `/api/mail/accountstatus` | GET | 메일 계정 상태(`enabled`) |

**기본 폴더 7개** — `Inbox`(받은) `Sent`(보낸) `Drafts`(임시보관) `Reserved`(예약) `Spam` `Trash` `Quotaviolate`(용량초과함)

**messageList 항목 필드**: `id` `subject` `from` `to` `size` `byteSize` `flag` `preview` `dateUtc` `sentDateUtc` `seen` `priority` `spamRate` `existMeInCc` `tagList` `folderFullName`
→ ⚠️ 식별자는 `uid`가 아니라 **`id`**.

#### ⚠️ 아직 못 푼 것 (다음 조사 거리)
- `message/list`의 **페이지·폴더·검색 파라미터 이름을 모른다.** JSON으로 `folder`/`page`/`pageBase`/`searchType`을 줘도 **무시**되고(항상 Inbox 80건), form-urlencoded로 주면 **응답이 비어** 온다.
  → 추측하지 말고 **UI에서 폴더 전환·페이지 이동·검색을 실제로 눌러 요청 본문을 캡처**할 것. (`count`는 form-urlencoded인데 `list`는 JSON인 걸 보면 엔드포인트마다 형식이 다르다.)
- **메일 상세 조회 경로 미확인** — `/api/mail/message/{id}` 등 5개 후보를 시도했으나 확인 못 함.
- **발송 API 미확인** (의도적으로 실행하지 않음).

#### ⚠️ 실무 발견 — 메일함 용량 초과
```
usage 5.5GB / limit 5.0GB · percent 100 · overQuota: true
```
`Quotaviolate`(용량초과함) 폴더가 따로 있다. **용량이 넘치면 새 메일 수신이 막힐 수 있으므로** 연동 기능과 별개로 정리가 필요하다.

### 전자결재
| 경로 | 용도 |
|---|---|
| `/api/approval/home/todo?page=0` · `/draft` · `/complete` · `/reception` | 문서함 |
| `/api/approval/todo/count` 등 | 배지 숫자 |
| `/api/approval/apprform/tree?folderId=..` | 양식 트리 |
| `/api/approval/document/new?formId=..&deptId=..` | **화면 열면 서버가 docId 발급** |
| `/api/search/approval?stype=simple&type=approval&keyword=..&fromDate=..&toDate=..&page=0&offset=20` | 문서 검색 |

- 검색 응답 항목 키: `id` `title` `formName` `drafterName` `draftedAt` `docStatus` `docNum`
- ⚠️ `title`에 검색어가 `<strong class='txt_key'>`로 감싸져 온다 → **태그 제거 필요**.

---

## 5. 기안 작성 (전자결재 쓰기)

### ⚠️⚠️ 상신(결재요청)은 하지 않는다
누르는 순간 팀장·합의자들에게 실제로 올라가고 되돌리기 어렵다. 코드는 **'임시저장' 버튼만 찾아 누르고 '결재요청'은 탐색조차 하지 않는다.** 상신은 사람이 내용을 확인하고 직접 누른다.
임시저장 문서는 내 임시문서함에만 남고 남에게 안 보이며 그룹웨어에서 삭제할 수 있다.

### 작성 화면
```
/app/approval/document/new/{deptId}/{formId}
```
**화면을 여는 순간 서버가 문서 ID를 발급**한다(조사하느라 화면만 열어도 빈 문서가 생긴다 — 쌓이면 임시문서함에서 지울 것).

### ⚠️ 입력칸 id를 하드코딩하지 말 것
입력칸은 `editorForm_N`이고 **N은 양식마다 다르다.** 표의 **열 머리글**(Item Code, Model…)과 **행 라벨**(Name, Address…)로 역매핑해서 찾는다.
라벨만 보면 `Date :` 같은 게 섞여 **엉뚱한 칸에 쓴다**(실제로 한 번 잘못 읽었다). 양식 id(`formId`)도 `/api/approval/side`에서 **이름으로 조회**한다.

### 체크박스
id가 `editorForm_28_정식승인`처럼 **값이 뒤에 붙어** 있어서 이름으로 찾을 수 있다.

### 원자재 승인 결과서 — formId **4857** / deptId **245** (개발3팀)
| 칸 | id | 출처 |
|---|---|---|
| 제목 | `subject` | `Customer Approval Sheet[코드]_V01` (사내 관례, 실측 219538) |
| Provider Info Name / Address / Tel | `editorForm_18` / `19` / `20` | SAP ZMM005 또는 승인원 표지 |
| Item Group No | `editorForm_21` | SAP **MATKL**(코드). `WGBEZ60`은 이름이라 다름 |
| Item Code | `editorForm_22` | 자재번호 |
| Model | `editorForm_23` | SAP MAKTX |
| Sub Description | `editorForm_24` | SAP ZTEXT |
| DMS Upload | `editorForm_25_New` / `26_Update` | 이전 문서 유무로 결정 |
| 승인원 분류 | `editorForm_28_정식승인` / `29_가승인` / `30_한도승인` | 기본 **정식승인** |
| 상태전환 | `editorForm_31_H2` / `32_P1` | SAP **MMSTA** |
| Revision History | `editorForm_34`(Date) `35`(Rev.No) `36`(Page) `37`(Summary) | 아래 규칙 |

**서명란**: Provider(협력사)는 `Written by`/`Reviewed by`/`Approved by`, Customer(코텍)는 `Checked by`/`Reviewed by`/`Approved by`.
→ **`Written by`(Provider) vs `Checked by`(Customer)가 고유 앵커**다. 행 라벨이 전부 `Date :`로 보여도 이 둘로 구분할 수 있다. 날짜는 모두 같은 날짜를 쓴다.

### Revision History 규칙
자재코드로 `/gw/approval/search` 검색 →
- **이전 승인원 없음** → Date=`문서날짜 또는 기안 작성일`, Rev.No=`00`, Page=`ALL`, Summary=`최초등록`
- **있음** → **비워두고** 이전 문서 목록을 보여주며 사람이 직접 적게 한다(개정 차수·변경 내용은 사람만 아는 내용 — 지어내면 안 된다)

---

## 6. SAP 연계 — 승인원에 필요한 값

### 공급업체: ZMM006 → LIFNR → ZMM005
⚠️ MM03 구매탭의 `MARA-ZLIFNR`은 **비어 있는 자재가 많다**(실측 133015). 그럴 때 포기하지 말고 **ZMM006(구매 정보 레코드)** 에서 LIFNR을 얻는다.
```
자재 133015 → ZMM006 → LIFNR 100096 / NAME1 정림전자(주) / VERKF 홍성훈 / TELF1 010-8880-1315
             → ZMM005(LIFNR) → ORT01+STRAS 주소 / TEL_NUMBER 02-2686-3553 / SMTP_ADDR
```
`fetch_vendor_info_by_material`이 ZLIFNR이 비면 자동 폴백하고, 응답에 `lifnrSource: 'ZMM006'`을 남긴다(어느 경로로 얻었는지 드러나게).

### ZMM009 조회 컬럼 (`_ZMM009_PATTERN_COLS`)
승인원용으로 `MATKL`(Item Group No)과 `WGBEZ60`(그룹명)을 추가해 뒀다. ⚠️ ZMM009 **119개 컬럼에 통화 컬럼은 없다** — 표준가격은 KRW 고정.

### ⚠️ 제조사 ≠ 공급업체
`MFRPN`(제조사, 예: `AUO`)과 Provider Info의 공급업체(예: `정림전자(주)`)는 **전혀 다른 값**이다. 제조사를 Provider Name에 넣으면 **틀린 문서**가 된다.

### 표기 차이 (미해결)
같은 업체인데 SAP 마스터와 사람이 쓰던 표기가 다르다:
| | 기존 문서 | SAP |
|---|---|---|
| 상호 | 정림전자**㈜** | 정림전자**(주)** |
| 주소 | 서울 구로구 경인로 **53길 15, …A동 308호** | 서울**특별시** 구로구 경인로53길 15 …**A-308** |
| 전화 | `02)2686 - 3553` | `02-2686-3553` |

---

## 7. 협력사 승인원 표지(docx) 파싱

협력사에 표지를 보내면 빈칸을 채워 돌려준다. **SAP에 공급업체가 없을 때의 폴백**이다.

- `parse_approval_cover()` — docx XML에서 문단을 순서대로 뽑아 **라벨 바로 다음 줄을 값**으로 읽는다(표가 라벨칸/값칸으로 나뉘어 문단 순서가 유지됨).
- ⚠️ `python-docx`의 `paragraphs`/`tables`만 보면 **표 안 텍스트를 놓친다** → `word/document.xml`을 직접 훑을 것.
- 라벨은 **별칭 목록(`_COVER_LABELS`, 데이터)** — 표지 양식이 조금 달라도 잡히고, 못 찾은 칸은 **추측하지 않고 비워 둔다**.
- 얻는 값: `Item Group No` `Item Code` `Model` `Sub Description` `Name` `Address` `Tel` + `_kind`(New/Update) `_rev`
- SAP과 겹치는 칸은 **교차검증** — 값이 다르면 미리보기에 경고로 드러낸다.

### ⚠️ 첨부 분기 충돌
AI 문답에서 **첨부가 있으면 무조건 구매오더로 보내던 분기**가 이 표지까지 가로채 기안 명령이 아예 실행되지 않았다(PO 경로는 PDF 전용이라 조용히 멈춤). 기안 요청 + docx 첨부면 그 분기가 양보하도록 가드가 있다(`_gwCoverFlow`).

---

## 8. AI 문답 연동

- 트리거 어휘는 **`GW_CAPABILITIES`(js/32) 카탈로그 + `_gwCapKwHit()`** — 코드 정규식 금지.
- ⚠️ **"승인원"은 SAP 승인원 **표지**와 그룹웨어 전자결재 **기안**이 공유하는 단어다.** 구분 신호:
  - `기안 · 결재 · 상신 · 전자결재` → 🏢 그룹웨어
  - `표지` → 📋 SAP
  - **둘 다 없으면 추측하지 말고 되묻는다**(버튼 2개). 실사용에서 `102202 승인원 작성해줘`가 SAP 표지로 샜다.
- 기안 블록은 **SAP 승인원표지/문서열람 블록보다 앞**에 둔다(구체적 의도 우선).
- 로컬 명령 블록은 `return` 전에 `_ganttQaRecordQuestionFreq(question)` 호출 필수.

### 현재 흐름
```
① SAP 자재 조회        Item Group No / Item Code / Model / Sub Description
② SAP 공급업체 조회     ZMM006 → LIFNR → ZMM005 → 상호/주소/전화
③ 이전 승인원 검색      /gw/approval/search → Revision History 결정
④ 부족하면 그때만       "승인원 표지(.docx) 있으면 첨부해주세요"
⑤ 확인 카드 → 임시저장  (상신은 사람이)
```

---

## 9. 캘린더 탭 (읽기)

`js/39-groupware-calendar.js` — Calendar 탭에서 **Gantt 일정 ↔ 그룹웨어 일정 전환**(겹쳐보기 아님).

⚠️ 겹쳐 놨더니 하루 칩 상한(월간 10개)을 그룹웨어 일정이 선점해 **간트 업무가 통째로 잘려나갔다**(같은 날 그룹웨어 12건이면 간트 0건). 한 번에 하나만 보여주면 자리 경쟁이 사라진다. 선택은 `localStorage.gantt_cal_source`.

---

## 10. 파일 맵

| 파일 | 역할 |
|---|---|
| `gw_bridge.py` | CDP 제어 + 내부 API 호출 + 기안 작성 + 표지 파싱 (설계·안전원칙은 파일 상단 주석) |
| `kortek_backend.py` | `/gw/status` `/gw/open` `/gw/login` `/gw/login-config` `/gw/calendars` `/gw/events` `/gw/approval/forms` `/gw/approval/draft` `/gw/approval/search` `/gw/approval/parse-cover` |
| `js/39-groupware-calendar.js` | Calendar 탭 전환·상태 표시 |
| `js/32-sap-capabilities.js` | `GW_CAPABILITIES` 카탈로그 + `_gwCapKwHit` |
| `js/04h-...-3.js` | AI 문답 기안 로컬 명령 |
| `js/36-sap-login.js` | 🔑 모달 (SAP + 그룹웨어 자동 로그인 설정) |
| `gw_login_config.json` | DPAPI 암호화 비밀번호 — **.gitignore** |

---

## 11. 전수 조사 — 화면 지도와 진행 상황

### 전체 화면 수 (실측 2026-10-19)
`/resources/js/conf/routes.json`에 **앱 화면 라우트 352개**가 들어 있다. 이게 조사 대상의 전부다.
(이 파일을 먼저 받아 보면 "어디를 조사해야 하는지"를 화면 하나씩 뒤지지 않고 알 수 있다.)

| 모듈 | 화면 | 쓰기성 | 조사 |
|---|---:|---:|---|
| `approval` 전자결재 | 60 | 9 | 🟡 부분(기안/검색/문서함) |
| `works` | 49 | 9 | ⬜ |
| `ehr` 인사관리 | 29 | 0 | ⬜ |
| `board` 게시판 | 23 | 8 | ⬜ |
| `noti` 알림 | 21 | 0 | ⬜ |
| `community` | 21 | 7 | ⬜ |
| `contact` 주소록 | 21 | 10 | 🟡 목록만 |
| `report` 보고 | 21 | 3 | ⬜ |
| `task` | 18 | 5 | ⬜ |
| `calendar` 캘린더 | 14 | 3 | 🟢 읽기 완료 |
| `docs` 문서관리 | 14 | 5 | ⬜ |
| `asset` 예약 | 11 | 4 | ⬜ |
| `survey` 설문 | 10 | 5 | ⬜ |
| `sms` | 4 | 1 | ⬜ |
| `note` 쪽지 | 3 | 1 | ⬜ |
| `mail` 메일 | **1** | 0 | 🟡 부분 |

> ⚠️ **메일이 화면 1개인 이유**: 메일은 내부 SPA라 라우트가 `/app/mail` 하나뿐이고 폴더·읽기·쓰기 전환이 전부 그 안에서 일어난다. 그래서 **라우트 맵으로는 조사가 안 되고 UI 조작 관찰이 필수**다.

### 조사 방법 — 효과 순
1. **routes.json 받기** — 조사 대상 화면 전체를 한 번에 파악(위 표).
2. **화면 열고 Network 관찰** — 가장 확실. 읽기 API는 이걸로 거의 다 나온다.
3. **UI 조작 후 요청 본문 캡처** — 페이지·검색·필터 파라미터는 이 방법뿐. 추측하면 틀린다(메일 `message/list` 사례).
4. ~~JS 번들 정적 추출~~ — **효과 낮음**. 모듈 JS가 지연 로딩이라 61개 스크립트에서 28개만 나왔다. 보조 수단으로만.
   (⚠️ 번들 URL은 `?rev=`가 붙어 있어 `endsWith('.js')`로 거르면 거의 다 놓친다.)

### ⚠️ 엔드포인트마다 요청 형식이 다르다
같은 메일 모듈 안에서도 `message/count`는 **form-urlencoded**, `message/list`는 **JSON**이다.
한 모듈 안에서 형식이 통일돼 있다고 가정하지 말 것.

---

## 📌 아직 안 한 것 / 다음 거리

- **전수 조사 진행 중** — 위 11절 표 참고. 화면 352개 중 캘린더(완료)·메일/전자결재/주소록(부분)만 손댔다.
- **메일 다음 단계**: 폴더 전환·페이지 이동·검색을 UI에서 눌러 `message/list` 요청 본문을 캡처 → 파라미터 확정. 이어서 상세 조회·발송 API.
- 서명·날짜 칸(`editorForm_6~17`) 매핑 — `Written by`/`Checked by` 앵커로 가능하나 미구현.
- 공급업체 표기 규칙(SAP 그대로 vs 표지 우선) 미결정.
- 쓰기는 전자결재 임시저장 하나뿐. 일정 등록·결재 상신은 **안전 설계 전까지 열지 않는다.**
- 전산팀에 OAuth 클라이언트 요청 시 이 문서의 API 목록이 요청 범위를 정하는 근거가 된다.
