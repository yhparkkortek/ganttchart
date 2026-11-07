# tests — 버리지 않고 남긴 검증

이 저장소에는 자동 러너가 없다(번들러도 테스트 프레임워크도 쓰지 않는다).
여기 있는 것은 **한 번 만들어 쓰고 버리던 하네스를 파일로 남긴 것**이다.

> 규칙은 `CLAUDE.md` "✅ 「고쳤다」의 정의" 절에 있다.
> 그중 네 번째: **같은 검증을 두 번 만들었으면 파일로 남긴다.**
> 2026-10-29 칩 표 사고에서 올바른 검증을 만들어 놓고 그 자리에서 버렸던 것이 계기다.

## 돌리는 법

| 파일 | 무엇을 | 어떻게 |
|---|---|---|
| `test_approval_reuse_branch.py` | 작성 화면 **재사용 분기**(이동하지 않는가) | `python tests/test_approval_reuse_branch.py` |
| `approval-loop.browser.js` | 기안 작성 **실행 루프** 전체 | 앱을 열고 콘솔에 붙여넣기 |
| `test_telegram_ai_bridge.py` | 텔레그램 `/ai` → NAS 접수(백엔드, 진짜 입구 `_daily_tg_tick`) | `py -3 tests/test_telegram_ai_bridge.py` |
| `test_daily_brief.py` | ☀️ 아침 브리핑(백엔드) — 내 업무 판정·섹션·관문·캐시·돌연변이 | `py -3 tests/test_daily_brief.py` |
| `telegram-qa-bridge.test.js` | 다리 프런트(js/60) — 선점·답 모으기·alert 가로채기·파일 회신 | `node tests/telegram-qa-bridge.test.js` (회사 PC) |
| `mail-evidence.test.js` | 📎 메일 배분 근거층(js/61) — 정규화·기록·충돌 차단·승격·제안·되돌림·큐 훑기 | `node tests/mail-evidence.test.js` (회사 PC) |
| `mail-evidence.browser.js` | 같은 시나리오를 **진짜 15b·15c 함수**로 | 앱을 열고 콘솔에 붙여넣기(키·NAS 불필요) |
| `period-summary.browser.js` | 📅 AI 요약 일일/주간/월간(js/62) — 사실 선별·접지 검사·모달·문답 입구 | 앱을 열고 콘솔에 붙여넣기(AI 는 가짜) |
| `telegram-qa-bridge.browser.js` | 진짜 앱에서 한 바퀴(NAS 진짜, 텔레그램 발송만 가짜) | 앱을 열고(NAS 로그인) 콘솔에 붙여넣기 |
| `telegram-dist-and-draft.browser.js` | 📥 폰에서 대기 메일 배분(js/60 `TG_QA_ACTIONS.place`·`pending__` 목록) + 📔 `/ai 오늘 보고 초안`(js/63) — 진짜 TaskInbox·진짜 바퀴·진짜 문답 입구 | 앱을 열고 콘솔에 붙여넣기(NAS 없으면 메모리 가짜로 돈다, 프로젝트가 안 열려 있으면 초안만 stub-data) |

둘 다 **그룹웨어·SAP·AI 키가 없어도 돈다.** 가짜는 **바깥 경계에만** 두고
안쪽은 진짜 코드가 돌기 때문이다 — 안쪽을 가짜로 만들면 시험이 자기 자신을 시험한다.

## 새 검증을 더할 때

- **사람이 실제로 지나는 입구**에서 시작할 것. 부품을 직접 부르는 시험은 증거가 아니다.
  (`_qaBuildRowChipTable()` 이 아니라 `sendGanttQaMessage()`, `_apvRender()` 가 아니라 `_apvApply()`)
- 스텁은 **호출 순서에 기대지 않게** 만들 것. 순서로 갈리게 했다가 다른 경로가 첫 호출을
  먹어 **가짜 실패**가 났다.
- 실패가 나면 "코드가 틀렸나, 시험이 틀렸나"부터 가를 것.
