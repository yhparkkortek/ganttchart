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
