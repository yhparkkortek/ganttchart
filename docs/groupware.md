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

#### ⚠️⚠️ 메일 화면은 **iframe 안**에 있다
```html
<iframe id="mail-viewer" src="/app/mail/home">   ← 여기에 전부 들어 있다
```
최상위 문서는 **본문이 10자뿐**이라 `document.querySelector`로는 폴더·검색창·버튼을 **하나도 못 찾는다**(모든 클릭이 조용히 빗나간다).
→ `document.getElementById('mail-viewer').contentDocument`로 들어가서 조작할 것. same-origin이라 접근된다.
→ 입력값 설정 시 setter는 **iframe의** `contentWindow.HTMLInputElement.prototype`에서 가져와야 한다.

#### `message/list` 파라미터 (UI 조작 캡처로 확정, 2026-10-19)
**Content-Type: `application/json`**

| 목적 | body |
|---|---|
| 받은메일함 | `{"folder":"Inbox","sharedFlag":"user"}` |
| 보낸/임시/휴지통 | `folder`를 `Sent` / `Drafts` / `Trash` 로 |
| 안 읽은 메일 | `{"folder":"Inbox","flag":"U","sharedFlag":"user"}` |
| 첨부 있는 메일 | `{"flag":"T","folder":"all","extFolder":"on","extType":"attach"}` |
| **검색** | `{"folder":"all","keyWord":"회의","sharedFlag":"user","sharedUserSeq":"0","sharedFolderName":""}` |
| 페이지 이동 | 위에 `"page":2` 추가 |

⚠️ **검색어 키는 `keyWord`** — 대문자 `W`다. `keyword`/`searchValue`/`searchType`은 전부 **조용히 무시**된다(에러 없이 전체 목록이 온다).
⚠️ **페이지당 건수는 목록 파라미터가 아니라 별도 설정 API**다:
```
POST /api/mail/setting/basic/pagebase   (form-urlencoded)   body: pageBase=20
```
`message/list`에 `pageBase`를 넣어도 안 먹는다. 이걸 몰라서 한참 헤맸다.

**검증(2026-10-19)**: 받은메일함 1601 / 보낸 0 / 임시보관 1 / 첨부 555 / `keyWord=회의` 11건 / 안읽음 1522 / page=2 정상 동작.

#### 아직 못 푼 것
- **메일 상세 조회 경로 미확인** — `/api/mail/message/{id}` 등 후보 5개 실패. 목록에서 메일을 클릭해 캡처하면 바로 나온다.
- **발송 API 미확인** (의도적으로 실행하지 않음). 메일쓰기 창을 열어 캡처하면 폼 구조까지 확인 가능.

#### ⚠️ 실무 발견 — 메일함 용량 초과
```
usage 5.5GB / limit 5.0GB · percent 100 · overQuota: true
```
`Quotaviolate`(용량초과함) 폴더가 따로 있다. **용량이 넘치면 새 메일 수신이 막힐 수 있으므로** 연동 기능과 별개로 정리가 필요하다.

### 전자결재 (전수 조사 2026-10-19, 거의 완료)

#### 구조 — **iframe 아님** (메일과 다르다)
`/app/approval`은 최상위 문서에 그대로 렌더된다. `document.querySelector`가 바로 먹는다.
모듈마다 다르니 **조사 전에 iframe 여부를 먼저 확인**할 것.

#### 진입 시 호출 (19건)
| 경로 | 용도 |
|---|---|
| `/api/approval/side` | **사이드바 전체** — `favorites[]{id,formName,formId,deptId}`, `deptFolders`, `drafterDeptFolders`, `apprConfig`, `writeMode` |
| `/api/approval/apprconfig` | 결재 정책(합의·반송·대결·보안등급 사용 여부) |
| `/api/approval/{todo,officialtodo,upcoming,todoreception,todoviewer}/count` | 배지 숫자 — 응답 `data.docCount` |
| `/api/approval/home/{todo?page=0,draft,complete,reception}` | 홈 위젯 목록 |

#### 문서함 목록 — GET + 쿼리스트링 (메일과 형식이 다르다)
```
GET /api/approval/doclist/{box}/all
      ?page=0&offset=20&property=draftedAt&direction=desc
      &searchtype=&keyword=&fromDate=&toDate=&duration=all
GET /api/approval/doclist/{box}/complete/count?searchtype=&keyword=&duration=
```
| `{box}` | 문서함 | 기본 `property` |
|---|---|---|
| `draft` | 기안 문서함 | `draftedAt` |
| `tempsave` | 임시 저장함 | `updatedAt` (날짜 파라미터 없음) |
| `approve` | 결재 문서함 | `draftedAt` |
| `viewer` | 참조/열람 문서함 | `document.draftedAt` |
| `userofficial` | 공문 문서함 | — |

별도 경로:
```
GET /api/approval/upcoming?...&property=activityGroup.apprFlow.document.draftedAt   # 결재 예정 문서
GET /api/approval/deptfolder/draft/{deptId}?...                                     # 부서 기안 완료함 (개발3팀=245)
GET /api/approval/deptfolder/{reference|official}/{deptId}?...
```

**파라미터 값은 화면 셀렉트에서 확정**(추측 금지):
- `searchtype` — `title`(제목) `drafterName`(기안자) `drafterDeptName`(기안부서) `formName`(결재양식) `docNum`(문서번호) `activityUserName`(결재선)
- `duration` — `all` `1` `6` `12` `period`(직접입력 시 `fromDate`/`toDate` 동반)
- `offset` — 20 / 40 / 60 / 80
- `property` — 정렬 컬럼. 쓸 수 있는 값은 `/api/approval/doclistField/{key}` 의 `sortColumn`에 들어 있다
  (`key` = `user_draft` `user_temp` `user_approval` `user_ref` `appr_wait` `dept_complete`)
- `page` — **0부터**

> 화면 조작 셀렉터: `div.table_search` 안에 `#searchtype` `#keyword` `#fromDate` `#toDate` `#duration`,
> 정렬은 `th span.title_sort`, 페이지는 `a.paginate_button[data-page="N"]`(`#first_page` `#prev_page` …).

#### 통합검색 (상단 검색창 `#search-keyword` + `#btn-search`)
```
GET /api/search/approval?stype=simple&type=approval&keyword=..
    &fromDate=1970-01-01T00:00:00.000+09:00&toDate=2026-10-19T23:59:59.000+09:00&page=0&offset=20
```
- 문서함 검색과 **다른 API**다. 날짜는 ISO+09:00 형식.
- 응답 항목 키: `id` `title` `formName` `drafterName` `draftedAt` `docStatus` `docNum`
- ⚠️ `title`에 검색어가 `<strong class='txt_key'>`로 감싸져 온다 → **태그 제거 필요**.

#### 문서 상세
```
GET /api/approval/document/{id}            # 본문·첨부·결재선·이력 전부
GET /api/approval/document/{id}/comment
GET /api/approval/securitylevel?docId={id}
```
`data` 안에 들어 있는 것:
- `document.variables` — **양식 입력값 전체 맵**. 승인원이라면 `editorForm_6~28`(서명·날짜·업체정보)과
  `{행}_{열}`(품목 표: `1_1`=자재코드, `1_2`=승인번호, `1_3`=내역 …)이 그대로 들어 있다.
  👉 **기존 문서 1건을 읽으면 그 양식의 필드 맵이 그대로 나온다** — 작성 화면을 뒤질 필요 없음.
- `document.docBodyContent` — 본문 HTML(승인원은 6만자 넘음), `attaches[]{id,name,size,download,preview}`
- `docInfo` — `formId` `securityLevelId` `docReferenceReaders` `externalScript` `drafterDeptId`
- `apprFlow.activityGroups[]` — 결재선(그룹별 결재/합의/확인), `actionLogs[]` 처리 이력, `readingHistory[]` 열람 이력
- `actionCheck` — 내가 지금 할 수 있는 동작(결재 대기자인지, 수정 가능한지 등) 60여 개 플래그

#### 양식 트리 — ⚠️ 응답이 `{data:…}` 래핑이 **아니다**
```
GET /api/approval/apprform/tree              # 루트
GET /api/approval/apprform/tree?folderId=61  # 하위
```
jsTree 포맷 **배열**이 그대로 온다: `[{data:{id:"FOLDER_61",title}, state, metadata, attr:{rel:"FOLDER"|"FORM", nodeId, title}}]`
- `attr.rel`로 폴더/양식을 가르고, `attr.nodeId`가 **formId**(양식일 때).
- `(j.data||[])`로 받으면 **0건**이 나온다. 다른 API와 달라서 한 번 걸렸다.
- BFS로 전부 긁으면 폴더 15개 / 양식 **97개**. 카탈로그 → `docs/groupware-forms.md`
- 화면의 "자주 쓰는 양식"은 `/api/approval/side` → `favorites[]`와 같고, DOM에서는 `[data-formid]`.

#### 관리/설정 계열 (번들 추출, 미호출)
`/api/approval/classify/{user,dept}/rule` (문서 자동분류 규칙) · `/api/approval/favorite` (자주 쓰는 양식 등록) ·
`/api/approval/usersetting/{deputy,password,userconfig}` · `/api/approval/userfolder` · `/api/approval/companyfolder/tree` ·
`/api/approval/official/{approve,return,cancel,rerequest,addreceiver}` (공문) · `/api/approval/document/bulkdraft` ·
`/api/approval/manage/document/addreaders` · `/api/approval/auth/docmanage`
→ **쓰기성이라 호출하지 않았다.** 전체 64개 목록은 아래 "번들 추출" 참고.
### 게시판 (전수 조사 + **앱 이식 완료** 2026-10-19)

#### 엔드포인트
| 경로 | 용도 |
|---|---|
| `/api/board/myhome/all?page=0&offset=20&url_type=all` | **내가 보는 모든 게시판 통합 최신글** — 기간 요약에 이걸 쓴다 |
| `/api/board/{boardId}/posts/classic?page&offset&sorts=sortCriteria+desc` | 게시판별 목록 |
| `/api/board/{boardId}/posts/classic/notice?page&sorts=..` | 그 게시판의 공지(상단 고정) |
| `/api/board/{boardId}/post/{postId}/classic` | **본문** (`content`가 HTML) |
| `/api/board/{boardId}/post/{postId}/comment?offset=1000` | 댓글 |
| `/api/board/company/boardsWithIp` | 전사 게시판 목록 (`nodeType: FOLDER`는 글이 없으니 제외) |
| `/api/department/boards` | 부서 게시판 목록 |
| `/api/board/favorite?page&offset` · `/api/boardconfig` · `/api/search/board` | 즐겨찾기 / 설정 / 검색 |

목록 항목 키: `id` `boardId` `boardName` `title` `writer{name,positionName}` `createdAt`
`summary`(본문 발췌) `readCount` `commentsCount` `hasAttach`. 화면 경로는 `/app/board/{boardId}/post/{postId}`.

#### ⚠️ **기간 필터 파라미터가 없다**
서버에 `from`/`to`가 없다. 최신순 목록을 받아 **코드에서** 잘라야 한다(`gw_bridge.board_recent`).
- `date_from`보다 오래된 글이 나오면 그 자리에서 **페이징 중단**(최신순이므로 뒤는 전부 범위 밖).
- `date_to`는 **중단 조건이 아니라 건너뛰기**다 — 목록이 최신순이라 범위보다 새 글이 **앞에** 온다.
  여기서 멈추면 "지난주"를 물었을 때 **0건**이 된다. (실수하기 쉬운 지점)

#### ⚠️ "지난주"를 롤링 일수로 바꾸지 말 것
`지난주 = days:14`로 처리하면 **이번 주 글이 섞인다.** 달력 주(월~일)로 끊어야 사용자가 생각하는
"지난주"와 같아진다 → `window._gwPeriodRange`(js/32)가 어휘를 **from~to 날짜**로 환산한다.
어휘표는 `window.GW_PERIOD_WORDS`(데이터) — `kind`가 `lastWeek/thisWeek/today/yesterday/lastMonth/thisMonth/days`.
"최근 N일"처럼 숫자가 직접 적히면 어휘표보다 **숫자가 우선**.
실측: 2026-10-19(월) 기준 `지난주` → `2026-10-12 ~ 2026-10-18` 3건, `이번주` → `10-19` 1건, `지난달` → `09-01~09-30` 15건.

#### ⚠️ 사내 공지는 본문이 **이미지뿐**인 경우가 흔하다
슬라이드를 그림으로 붙여 올린다. 실측: 공지 `30459`는 `content`가 `<img>` 8장뿐이라 평문 **0자**.
빈 문자열만 돌려주면 받는 쪽에서 **"조회 실패"와 구분이 안 된다** → `board_post`가 `bodyNote`로
사유(이미지 N장 / 첨부 파일명)를 드러낸다. 파싱 실패를 조용히 기본값으로 삼키지 말 것(CLAUDE.md).

#### 앱 경로 (읽기 전용 — 글 작성·댓글 라우트는 **만들지 않았다**)
```
GET /gw/board/recent?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=80[&boardId=N][&days=7]
GET /gw/board/post?boardId=N&postId=N
GET /gw/boards
```
AI 문답 명령: `js/04h`의 `gw_board_recent` 블록 — 트리거 어휘는 `GW_CAPABILITIES`(js/32).
**결정론 먼저**: 목록 표는 AI 없이 먼저 렌더하고, AI는 그 목록만 근거로 요약만 맡는다.
AI가 실패해도 목록은 남고 실패 사유를 붙인다. 끝에 원문 링크를 붙인다.

> 🧪 **검증 팁**: 백엔드를 재시작하지 않고 라우트만 확인하려면 `kortek_backend.app.test_client()`를
> 쓴다 — 사용자가 돌리고 있는 5000번 프로세스를 건드리지 않는다(예약 발송·SAP 작업 중일 수 있음).


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
| `approval` 전자결재 | 60 | 9 | 🟢 거의 완료(읽기 전부 + 번들 64경로) |
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
| `mail` 메일 | **1** | 0 | 🟡 목록·검색 확정 / 상세·발송 미확인 |

> ⚠️ **메일이 화면 1개인 이유**: 메일은 내부 SPA라 라우트가 `/app/mail` 하나뿐이고 폴더·읽기·쓰기 전환이 전부 그 안에서 일어난다. 그래서 **라우트 맵으로는 조사가 안 되고 UI 조작 관찰이 필수**다.

### 조사 방법 — 효과 순
1. **routes.json 받기** — 조사 대상 화면 전체를 한 번에 파악(위 표).
2. **화면 열고 Network 관찰** — 가장 확실. 읽기 API는 이걸로 거의 다 나온다.
3. **번들 추출 (`/api/` 문자열 긁기)** — 모듈 화면을 열어 지연 로딩이 끝난 뒤 긁으면 **그 모듈 전체**가 나온다.
   전자결재에서 JS 59개 → 경로 101개(approval 64개). 쓰기성 엔드포인트까지 **호출 없이** 목록화되는 게 핵심 장점.
   ⚠️ 번들 URL엔 `?rev=`가 붙는다 — 확장자 판정은 **`split('?')[0]`에만** 적용할 것. `endsWith('.js')`로 거르면 거의 다 놓친다(초기 실패 원인).
   ⚠️ 모듈 화면을 **열기 전에** 긁으면 아무것도 안 나온다(지연 로딩). 모듈별로 navigate → harvest 순.
4. **UI 조작 후 요청 본문 캡처** — 페이지·검색·필터 파라미터는 이 방법뿐. 번들 추출은 **경로는 주지만 파라미터 이름·허용값은 안 준다.**
   값 목록은 화면 `<select>`의 option에 들어 있는 경우가 많다(전자결재 `searchtype`/`duration` 확정 경로).

> 스크립트는 scratchpad에 — `gw_survey.py`(navigate+Network+DOM), `gw_act.py`(액션 목록 실행+본문 캡처),
> `gw_get2.py`(GET 응답 구조 축약), `gw_harvest.py`(번들 `/api/` 추출), `gw_formtree2.py`(jsTree BFS).
> ⚠️ Git Bash에서 `/app/...` 인자는 Windows 경로로 변환된다 → **`MSYS_NO_PATHCONV=1`** 필수.
> ⚠️ 콘솔 출력은 cp949라 한글이 깨진다 → **`PYTHONIOENCODING=utf-8`** + 결과는 UTF-8 파일로 쓰고 읽을 것.

### ⚠️ 엔드포인트마다 요청 형식이 다르다
같은 메일 모듈 안에서도 `message/count`는 **form-urlencoded**, `message/list`는 **JSON**이다.
한 모듈 안에서 형식이 통일돼 있다고 가정하지 말 것.

---

## 📌 아직 안 한 것 / 다음 거리

- **전수 조사 진행 중** — 위 11절 표 참고. 캘린더·전자결재 완료, 메일/주소록 부분. 다음: `works` → `board` → `report` → `task` → `docs`.
- **메일 다음 단계**: 메일 클릭 → 상세 조회 경로 캡처, 메일쓰기 창 열어 발송 폼 구조 확인.
- **전자결재 남은 것**: 쓰기(임시저장) REST 본문 미확인 — 지금은 UI 클릭으로 저장한다. 사용자가 실제로 저장할 때 캡처하면 된다.
- 서명·날짜 칸(`editorForm_6~17`) 매핑 — `Written by`/`Checked by` 앵커로 가능하나 미구현.
- 공급업체 표기 규칙(SAP 그대로 vs 표지 우선) 미결정.
- 쓰기는 전자결재 임시저장 하나뿐. 일정 등록·결재 상신은 **안전 설계 전까지 열지 않는다.**
- 전산팀에 OAuth 클라이언트 요청 시 이 문서의 API 목록이 요청 범위를 정하는 근거가 된다.
