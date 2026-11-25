# 📋 알림(텔레그램·메일) 채널 지도와 상태판 — 2026-11-21

사용자: "매일 텔레그램으로 email 및 업무 보고, 해야할일 등 알람 정리가 제대로 안되고 있음 / 업무 정리 보고 및 알람 체계 검토 정리".
코드 전수 + 하네스로 확인한 것만 적는다. **실제 텔레그램 왕복은 집 PC 라 못 했다**(§5).

## 1. 채널 지도 — 누가·언제·어디서 보내나

| 채널 | 백엔드 함수 | 보내는 PC | 조건 | 받는 사람 | 설정이 사는 곳 |
|---|---|---|---|---|---|
| ⏰ 예약 발송(핀셋 "기간·반복" 알람·공지) | `_scheduler_tick`→`_fire_rule`→`_fire_alarm_rule`/`_fire_notice_rule` | **규칙을 등록한 그 PC**(`schedule_rules.json` 은 PC 로컬) | 규칙 날짜·시각(1분 틱, 유예 2분, 밀린 것은 안 보냄) | 담당자·수신인(주소록 `telegramId`) + CC 스냅샷 | 알람 탭 ▸ 기간·반복 모달(js/22c `_asSaveRecurRule`) |
| 📧 새 메일 알림 | `_mail_watch_tick` | 그룹웨어 세션(CDP 크롬)이 **살아 있는** PC | `enabled` · 간격 · 조용한 시간 밖 · 처음 켠 틱은 기준점만 | `mail_watch_config.chatId` 또는 기본 chat id | 알람 설정 ▸ 메신저 ▸ 새 메일 알림 |
| 📱 텔레그램 수신(보고·/ai·/배분) | `_daily_tg_tick` | 명단 **📣 담당 PC 한 대** | 토큰 · 명단 읽힘 · 첫 틱은 기준점만 | — (들어오는 쪽) | 👥 명단 모달 📣 |
| 📔 일일보고 미작성 알림 | `_daily_report_tick` | 📣 담당 PC | 근무일 · `dueAt`(기본 17:00) 지난 뒤 · 하루 1회 · **한 명이라도 조회 실패면 0건** | 명단 `tgChatId` 있는 사람 | `/daily/config` dueAt(화면 없음) |
| ☀️ 아침 브리핑 | `_daily_brief_tick` | 📣 담당 PC | 근무일 · `briefAt`(08:30) · 하루 1회 · 볼 게 없으면 안 보냄 | 명단 `tgChatId`·`brief≠false` | 👥 명단 모달 ☀️ |

같은 봇·같은 사람에게 **다섯 갈래**가 **세 종류의 PC** 에서 나간다. 그래서 "안 온다" 의 원인이 PC 마다 달랐고,
어느 PC 에서도 그 이유를 볼 자리가 없었다.

## 2. 확정한 결함과 고친 것

### 2-1. 핀셋 알람이 NAS 이사(2026-11-04) 뒤에도 **Drive** 를 읽었다 → `_project_doc_by_id`
- `_fire_alarm_rule` 이 `_drive_read_json_file`(구글 서비스계정)로 프로젝트를, `_drive_load_address_book` 으로 주소록을 읽었다.
  Drive 사본은 11-03 이사 뒤 **읽기만 남은 낡은 파일**이라 담당자·마감일이 옛값이거나(옛 id 별칭), `nas_f_…` id 면 404.
- 이제 `_project_doc_by_id(fid)`: **id 지도(`nas_id_map.json`) → 색인(`project_index.json` 의 `drive_file_id`) → NAS 읽기**,
  못 풀면 그때만 Drive 폴백(사유 둘 다 예외에 싣는다). 주소록도 `_load_address_book()` 이 NAS `App_Config/AddressBook_Shared.json` 먼저.
  아침 브리핑(`_brief_load_items`)이 쓰던 길과 같다.
- 규칙이 `rowIdx` 로 행을 가리키는 건 그대로(행을 옮기면 어긋날 수 있다 — 다음 과제, `_rowUid` 로 바꾸려면 프런트·백엔드 둘 다).

### 2-2. 스케줄러가 틱 결과를 **버렸다** → `NOTIFY_STATUS` + `GET /notify/status`
- `_scheduler_loop` 는 다섯 틱의 반환값(`skipped:'not-notifier'/'disabled'/'before-time'`, `ok:false message`)을 버렸다. `print` 뿐.
- 이제 `_notify_run(channel, fn)` 이 채널마다 `lastRunAt / lastResult / lastSentAt / lastError / runs` 를 메모리에 적고,
  `_scheduler_tick` 은 울린 규칙마다 `rule.lastResult`(email/telegram 건수·errors·skipped·source) 를 `schedule_rules.json` 에 남긴다.
  `_fire_alarm_rule` 은 **받을 사람이 0명**이면 `telegramSkipped` 로 드러낸다(전엔 조용히 0).
- `GET /notify/status` 한 장: 이 PC(계정·토큰·NAS 세션·📣 담당 여부·📣 담당자 이름·명단 수·오늘 비근무일) + 채널 5개(설정 요약·마지막 결과)
  + 스케줄러 심장박동. **조회만 한다** — 로그인·발송 시도 없음(NAS 왕복은 명단 1회+비근무일 1회, 그룹웨어는 `session_info` 1회).
- 프런트: 👥 명단 모달 아래 **📋 알림 채널 상태판**(js/59 `dailyNotifyStatusLoad`). 사유 어휘는 `DAILY_NOTIFY_REASONS`(데이터).
  404 = "백엔드 구버전(재시작)", 연결 실패 = "이 PC 에선 어떤 알림도 안 나간다" 를 구분해 말한다.
  ⚠️ **이 PC 백엔드가 본 것만**이다 — 📣 담당 PC 가 아니면 그 세 채널은 "담당 PC 아님 → 누구" 로 보인다. 그 PC 에서 열어 봐야 한다.

### 2-3. 프런트가 백엔드 실패를 "0건 발송/보낼 내용 없음" 으로 읽던 것
- `dailyNotifyTest`·`dailyBriefPreview`(js/59): HTTP 500·`ok:false` 를 먼저 가르고, `skipped` 사유를 사람 말로 붙인다.

## 3. 보고 기능 점검(AI 요약·일일·주간) — 고친 것 / 남긴 것

고친 것(전부 js, 하네스는 브라우저 수동):
- **js/62 문답 "주간 요약" 이 매번 AI 를 다시 불렀다** — 저장은 `col.sig`, 비교는 `col.range.key`. 이제 `col.sig`.
- **js/62 #G 번호 충돌** — 다른 프로젝트 행 `idx` 가 열린 프로젝트와 겹쳐 접지 검사·링크가 엉뚱한 행을 가리켰다 → 프로젝트마다 `200000+5000×n` 대역, 요약 문장에서 비로컬 #G 는 `[프로젝트 #행]` 글자로(링크 안 만듦).
- **js/62 낡은 요약** — 캐시 열쇠에 사실 개수(`|n=`) 추가(다른 프로젝트 훑기가 덜 끝났을 때 만든 요약이 끝난 뒤에도 "최신" 이던 것).
- **js/62 사실 날짜** — 칸 내용(`[출처]` 날짜) 먼저, 표식 `_mailRaw` 는 그 다음(표식이 통째로 날아간 11-04 전력).
- **js/63 "오늘 보고 초안" 부분 결과** — 다른 프로젝트 훑기가 시간 안에 못 끝나면 0건이었다(전부 끝나야 `_other.mine` 을 채움) → 프로젝트 하나 끝날 때마다 담는다.
- **js/59 60초 자동 갱신 거짓 토스트** — 날짜를 옮긴 첫 바퀴를 "갱신" 으로 보고 다시 그리며 토스트. 날짜 바뀜은 기준만 다시 잡는다.
- **js/20 `[문제점]`/`[대책]` 첫 줄만·`[` 에서 끊김** — 여러 줄·다음 줄 시작이 주간보고·PPT·일일보고 초안(`_mailContentParse` 가 같은 함수)에서 비었다 → 다음 `[태그]` 줄 앞까지.
- **js/20 주간보고 AI 프롬프트** — "목록에 없는 업무·날짜·담당자·수치 금지" 규칙 + `feature:'weekly-report'` 태그(다른 두 경로와 같은 계약).

남긴 것(근거는 있으나 이번에 손 안 댐 — 결정이 필요하거나 범위가 크다):
- ~~js/20 주간 범위가 **월~금**~~ → **2026-11-21 사용자 결정 "월~일로"** 로 고쳤다(`wrGetWeekRange`, js/62 와 같은 주). 주간보고 머리글의 기간 표시도 일요일까지로 바뀐다.
- js/20 `wrGetWeekNumber` 는 ISO 주차가 아니다(2027년부터 1주 어긋남, 2026 은 우연히 같다). 회사가 쓰는 주차 규칙 확인 뒤.
- js/59 `isMine` 이 `_담당구분` 만 보고 `catOf`(내용에서 분야 추출) 폴백을 안 쓴다 — 칩은 보이는데 "남의 일" 로 세는 행이 있을 수 있다.
- js/59 죽은 코드(`itemsCellUnused`·`dayChipsUnused`·`_dailyNote`·`_dailyPollReset`), `dailyLoadDay` 가 못 읽은 사람 파일을 "미작성" 처럼 숨기는 것, js/62 JIRA `.catch` 가 다시 안 그려 "⏳ JIRA 확인 중" 에 머무는 것.
- js/22c:933·js/22a:833 "✅ 발송 완료!" 토스트가 `sendTelegramAlarm` 을 기다리지 않고 뜬다(fire-and-forget).

## 4. 검증
- `py -3 tests/test_alarm_nas_notify_status.py` **32/32** — 가짜는 NAS·텔레그램·메일·Drive 경계뿐. 진짜 입구 `_scheduler_tick`(→ NAS 프로젝트 읽기 → 텔레그램 2·메일 1 → `lastResult`) 과 `app.test_client().get('/notify/status')`. 모르는 id 는 NAS 사유+Drive 폴백 사유를 함께 들고 예외, 주소록에 텔레그램 id 가 없으면 `skipped` 사유.
- 기존 하네스 회귀: `test_daily_brief.py` 37/37 · `test_telegram_ai_bridge.py` 85/85 · `test_mail_watch.py` 31/31 · `test_daily_report_backend.py` 80/87(토요일 — 7건 `non-workday` 는 CLAUDE.md 에 적힌 정상).
- 브라우저: 상태판 정상·404·연결실패 세 경로 렌더, `dailyNotifyTest`/`dailyBriefPreview` 의 500 처리, `wrExtractIssue` 여러 줄, `_psFactDate` 순서 — 전부 가짜 fetch 로 확인(이 PC 엔 백엔드·NAS 가 없다).

## 5. 회사 PC 에서 확인할 것(여기선 못 한 것)
1. 백엔드 재시작(`/self-update` 뒤) → 👥 명단 모달 아래 상태판에 다섯 줄이 뜨고 스케줄러 심장박동이 1분마다 바뀌는지.
2. 📣 담당 PC 에서 상태판: `isNotifier` 가 참이고, 17:00 뒤 미작성 알림 줄의 "오늘 N명" 이 올라가는지.
3. 핀셋 알람 규칙 하나를 지금+2분으로 걸어 **실제 텔레그램**이 오는지 — 상태판 ⏰ 줄의 `lastResult.source` 가 `nas` 인지(`drive` 면 지도·색인에 그 id 가 없다는 뜻).
4. 새 메일 알림 줄이 "그룹웨어 로그인 필요" 면 앱에서 그룹웨어 로그인 1회.

## 6. 🔔 알람 수신자 — 메일 AI 가 적은 이름을 주소록에서 "정확히 한 사람"으로만 (2026-11-25)

### 이름이 들어오는 곳
메일 AI 분석(js/04a 프롬프트 → js/14b `buildMailTaskRow`)이 간트 행 **상세내용 칸** 첫 줄에
`[업무유형][발신자→수신자] YYYY-MM-DD` 를 **자유 텍스트**로 적는다. 프롬프트가 "본문 이름을 있는 그대로,
영문 애칭(Anthony→Andy) 우선" 을 지시하므로 주소록 표기와 다를 수 있고, 서명·인사말에서 잘못 뽑힐 수도 있다.
별도 칸·`projectMeta` 에는 저장하지 않는다(행 메타 `_mailRaw` 에 원문 메일이 따로 있다).

### 이름 → 주소가 되는 길(전부)
| 경로 | 파일 | 해석 |
|---|---|---|
| 알람 탭 표·자동 알람(D-7/3/1)·즉시 발송·미발송 일괄 | js/22c `collectAlarmItems` → js/22a `checkAndSendAlarms`, js/22c `sendAlarmNow`·`sendAllPendingAlarms` | `_addrResolveRecipient`(js/22b) |
| 위 경로의 텔레그램 | js/22a·22c `allowedPeople` → `_addrFindByName` 으로 telegramId | `allowedPeople` 에서 발송 제외 이름을 미리 뺀다 |
| 예약 발송(기간·반복) 업무 알람 | kortek_backend.py `_fire_alarm_rule` → `_build_alarm_task_snapshot` | `_addr_resolve_recipient`(사본) |
| 예약 발송 텔레그램 | 같은 함수 | `_addr_resolve_recipient(...)['person']` |
| 공지(notice) 예약 발송 | `_fire_notice_rule` | 이름 해석 없음 — 사람이 고른 수신자 목록 그대로 |

### 고치기 전에 재현된 위험(합성 데이터, 진짜 함수)
1. **동명이인** — `_addrFindByName` 은 `Array.find` 라 주소록(전사 394명)에서 **첫 번째 사람**에게 갔다.
2. **이름 자리의 이메일 글자** — 주소록 대조 없이 그대로 발송(`fake.person@kortek.co.kr` 도 사내 도메인이라 통과).
3. **영문 직함 떼기가 이름을 먹음** — 낱말 경계가 없어 `Adams`→`Ada`(ms), `Drew`→`ew`(dr). 잘린 이름이 다른 사람과 맞으면 그 사람에게 감.
4. **외부 도메인 게이트 구멍** — 발신인이 여럿이면 주소를 쉼표로 합친 글자를 통째로 검사해 **마지막 도메인만** 봤다(`out@customer.com,sy.lee@kortek.co.kr` → 허용). 프런트·백엔드 둘 다.

### 지금 규칙
- `_addrResolveRecipient(name)` → `{email, person, reason}`: `ok` / `no-email`(텔레그램만 가능) / `none`(주소록에 없음) / **`ambiguous`**(서로 다른 사람 둘 이상 → 발송 제외) / **`email-not-in-book`**(주소록에 없는 주소 → 발송 제외). 같은 이메일로 두 줄 등록된 사람은 한 사람으로 본다.
- 발송 제외는 "미등록" 과 따로 `excludedPeople` 로 들고 다닌다 → 알람 표 이메일 칸 `⚠ 제외 N`(말풍선에 사유) · 상세 창 `발송 제외` 줄 · 예약 발송 결과 `excluded`.
- 백엔드는 **사본**이다 — 한쪽만 고치면 화면 알람과 예약 발송이 갈린다.
- 검증: `node tests/alarm-recipient-resolve.test.js` 26/26(진짜 js/22b·22a·22c 를 잘라 돌림, 옛 코드로는 같은 하네스에서 9건 실패) · `py -3 tests/test_alarm_recipient_resolve.py` 16/16(입구는 진짜 `_fire_alarm_rule`, 가짜는 프로젝트·주소록 읽기와 메일·텔레그램 발송).
- ⚠️ 백엔드 쪽은 **재시작 뒤에** 적용된다(PC 마다).

### 남은 위험 — 사람이 정할 것
- **이름이 하나도 안 풀리면 프로젝트 전원에게 간다** — js/22a 자동 알람 `item.toEmail || allEmails`(Summary 담당자 이메일 전부, 도메인 게이트도 안 거침)와 즉시 발송 창. 반면 미발송 일괄(js/22c)은 "건너뜀"이다. 동명이인으로 제외된 경우도 이 대체 발송을 탄다(사내 팀원이라 엉뚱한 외부인은 아니다).
- **영문 이름 하나(Andy)** 는 주소록에 Andy 가 한 명뿐이면 그 사람이 받는다 — 메일 속 Andy 가 고객사 사람이어도. 근본 해결은 AI 가 적은 이름 대신 **메일 헤더(`_mailRaw` 의 실제 발신·수신 주소)** 와 맞춰 보는 것(헤더에 있는 주소만 인정) — 데이터 흐름이 바뀌는 일이라 사용자 확인 후.
- `_addrFindByName`(첫 번째 사람)은 Summary 담당자 이메일 자동 채움·텔레그램 chat id 채우기 등 **사람이 보면서 쓰는** 곳에 그대로 남아 있다.
