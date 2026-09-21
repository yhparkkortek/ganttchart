# 메일 분석 · 원문 · 번역 · 토픽 프로파일 자동 재생성

> CLAUDE.md에서 분리된 상세 문서입니다 (2026-09-21, 토큰 절약 목적). **본문은 분리 전 CLAUDE.md 원문 그대로**이며,
> 해당 작업을 할 때만 읽으면 됩니다. 색인/요약은 CLAUDE.md의 "📚 상세 문서(`docs/`) 색인" 절 참고.

### 📧 메일 원문(`mailRaw`) 전달 규칙 — "원문 보기" 버튼이 빠지는 버그 패턴 (2026-09-12)

Gantt 행(`row._mailRaw`)이나 Task Inbox 항목(`it.mailRaw`)에 `{subject, sender, to, cc, date,
body2000, fileName}` 형태 객체가 있어야 "📧 원문 보기" 버튼이 뜬다(`14c-task-inbox.js`). 메일 분석으로
만든 업무가 **경유지를 하나 더 거칠 때마다**(보관함 → 다른 프로젝트로 전송, 미분류 재분석 → 다중 배분,
배분 원장을 다른 팀원 세션이 나중에 병합 등) 그 경유지 코드가 `mailRaw`를 안 넘기면 원문이 조용히
사라지는 버그가 반복 발생했다(2026-09-12에 5곳 동시 발견·수정: `14d-distribution-ledger.js`의
`inboxOpenDistribute`/`inboxDistExecute`/`distSendTaskToTargets`/`inboxDistExecuteMulti`,
`15b-mail-server-tab-1.js`의 `_msQueueReanalyzeMulti`, `14a-ai-mail-analysis-1.js`의
`mailDistributeToProject`). 새로운 "업무를 다른 곳으로 옮기거나 복사하는" 코드를 짤 때 체크할 것:

- `window.buildMailTaskRow(task, gd, ci, mailRaw)`의 **4번째 인자를 빠뜨리지 말 것** — 안 넘기면
  무조건 `row._mailRaw = null`이 된다.
- **배분 원장**(`saveData.distributions.push({...})`, `14d`/`15b`에 총 3곳)에도 `mailRaw`를 같이
  저장해야 한다 — 이 원장은 "아직 이 배분을 모르는 다른 팀원 세션"이 나중에 저장할 때
  `mergeRemoteDistributions()`가 `d.task`로 행을 다시 만드는 용도로도 쓰이는데, 원장에 `mailRaw`가
  없으면 그 세션에서 되살아나는 행은 원문을 영영 알 수 없다 — "같은 날 분석된 메일인데 어떤 건 원문
  보기가 되고 어떤 건 안 된다"는 제보의 실제 원인이 이것이었다.
- `gantt_ai_reassign_queue_v1`(localStorage) 큐에 항목을 넣을 때도 `mailRaw` 필드를 같이 넣을 것
  (`25-ai-learning.js`의 `_pushReassignQueue` 호출부가 원조 패턴 — `row._mailRaw || null`).
- **수신자(to/cc) 실제 주소도 mailRaw의 일부다(2026-09-12 추가)**: 백엔드 POP3 수신(`kortek_backend.py`
  `/fetch-mail`)과 `.eml` 첨부 파싱(`15a-mail-attachment-tab.js`의 `mfParseFile`)은 원래부터 `to`/`cc`
  헤더를 뽑아내고 있었는데, 그 값이 AI 프롬프트용 힌트(`_recipHint`, "수신인 판별" 문맥)로만 잠깐
  쓰이고 `mailRaw` 조립 시점에는 계속 버려지고 있었다 — 그 결과 "메일 원문 보기"엔 발신자만 보이고
  수신자는 아예 안 뜨고, AI가 업무명/담당자에 "수신인 미상"류 문구를 쓰게 됐다. `mailRaw`를 새로
  조립하는 곳이 있으면 소스 객체(`mail.to`/`mail.cc` 또는 `parsed.to`/`parsed.cc`)에 값이 있는 한
  같이 넣을 것 — AI가 화면에 "다수"/"OO팀"처럼 축약해서 보여주는 것과 무관하게, 실제 이메일 주소는
  항상 구조화된 필드로 따라다녀야 나중에 발송/알람 기능이 실제로 쓸 수 있다. 단, 순수 텍스트
  붙여넣기(직접입력 탭)는 애초에 헤더가 없으니 `to`/`cc`가 항상 빈 값인 게 정상.
- **같은 날짜 업무의 등록 순서 = 실제 메일 발송 시각순(2026-09-12 추가)**: 메일의 시:분까지는 이미
  백엔드가 `date`를 `"YYYY-MM-DD HH:MM"`로 캡처해서 `mailRaw.date`에 항상 들어있었지만,
  `window.computeL0InsertPos()`가 위치를 계산할 때 시작일(날짜만, 시간 없음) 비교만 하고 있어서 —
  같은 날짜인 업무끼리는 "실제 시각순"이 아니라 "등록(분석) 처리 순서"대로 꽂혔다. 지금은 같은
  구간 안에서 날짜가 동률인 두 행이 둘 다 `_mailRaw.date`를 갖고 있으면 그 시:분까지 비교해서 순서를
  정한다(`computeL0InsertPos`의 6번째 인자 `mailSentAt` — 새 호출부를 추가할 때 mailRaw가 있으면
  `mailRaw.date`를 꼭 같이 넘길 것). 어느 한쪽이라도 `mailRaw`가 없으면(수동 입력 업무 등) 기존과
  동일하게 날짜만 비교하는 동작으로 조용히 폴백한다.

### 📧 메일 "원문 보기" 영문 번역 속도개선 — 한국어만 있는 블록은 AI 호출 자체를 생략 (2026-09-16)

Task Inbox "📧 원문 보기"의 🌐 번역 버튼(`js/14c-task-inbox.js`의 `window._toggleMailRawTranslation`)은
원문을 문단(빈 줄 기준, 없으면 줄 단위) 블록으로 나눈 뒤 **25개씩 청크로 묶어 `Promise.all`로 병렬
호출**한다(문단 1개당 AI 호출 1번이 절대 아님 — 이미 2026-09-14에 그렇게 설계돼 있었다). 사용자가
"번역이 느린 게 문단마다 번역해서 그런가"라고 물어봐서 확인했더니, 문단별 개별 호출은 아니었지만
**한국어만 있는 블록까지 전부 AI에 보내 "번역 필요 없음"이라는 판정 자체를 AI에게 시키고 있었던 것**
이 실제 병목이었다 — 이 회사 메일은 헤더/서명/한글 문단이 대다수라 이 불필요한 판정 요청이 청크
수(=왕복 횟수)를 실질적으로 늘리고 있었다.

- **수정 1 — 클라이언트 사전 필터**: `FOREIGN_LETTER_RE = /[A-Za-zÀ-ɏ぀-ヿ一-鿿]/`
  (라틴 문자·일본어 히라가나/가타카나·CJK 통합 한자)로 각 블록을 검사해, 이 패턴에 전혀 안 걸리는
  (=한국어·숫자·기호뿐인) 블록은 **AI 호출 대상 목록(`blocksToTranslate`)에 아예 넣지 않는다** — 청크는
  이 필터를 통과한 블록만으로 구성되므로, 순수 한글 메일은 AI를 한 번도 안 부르고 즉시 원문 그대로
  렌더링된다(라이브 테스트로 확인: 순수 한글 4블록 입력 시 `callAiBackend` 호출 0회, 에러도 없음).
  정확도 손실은 없다 — 한국어만 있는 블록은 원래도 AI가 "번역 불필요"로 판정하던 것과 최종 결과가
  같고, 그 판정을 AI 대신 로컬 정규식이 내리는 것뿐이다.
- **수정 2 — 프롬프트가 "번역 필요 없는 블록"까지 매번 JSON에 채워 응답하던 것을 없앰**: 예전 프롬프트는
  모든 블록에 대해 `{"idx":N,"translate":true/false,"ko":"..."}` 형태로 빠짐없이 응답하라고 시켰는데,
  이제는 필터를 통과한(=대부분 실제로 외국어인) 블록만 보내므로 "번역이 필요한 블록만 배열에 담고
  나머지는 배열에서 아예 제외하라"고 바꿔 출력 토큰 자체를 줄였다 — 응답이 작아지면 그만큼 빨리
  끝나고, 2026-09-14에 겪었던 "출력이 길어 JSON이 중간에 잘리는" 위험도 같이 줄어든다(그 버그
  때문에 CHUNK_SIZE를 25로 낮췄던 것 — 이번 수정으로 청크당 부담이 줄었으니 나중에 CHUNK_SIZE를
  다시 올려볼 여지가 생겼지만, 이번 수정에서는 위험을 늘리지 않기 위해 건드리지 않음).
- **⚠️ 렌더링 조건도 같이 갱신**: 응답 항목에 더 이상 `translate` 필드가 없으므로(있으면 무시해도
  무해), `entry && entry.translate && entry.ko` 대신 `entry && entry.ko && String(entry.ko).trim()`
  로 판정 조건을 바꿨다 — `translate` 필드를 계속 요구했다면 새 응답 형식에서 번역문이 있어도
  전부 무시되는 회귀가 났을 것.
- **⚠️ "청크가 없으면 무조건 실패"였던 가드도 같이 고쳐야 함**: 기존엔 `chunkResults`에 성공한 청크가
  하나도 없으면(`anySucceeded===false`) 무조건 에러를 던졌는데, 필터링 도입 후에는 **순수 한글
  메일처럼 애초에 청크 자체가 0개인 정상 케이스도 `anySucceeded===false`가 된다** — 그래서
  `chunks.length && !anySucceeded`로 조건을 좁혀, "청크가 있었는데 전부 실패"일 때만 에러를 던지고
  "애초에 번역할 게 없어 청크가 0개"인 경우는 조용히 원문만 표시하도록 분리했다. 이 가드를 빠뜨리면
  순수 한글 메일마다 번역 버튼을 누를 때 "번역 실패" 에러가 매번 뜨는 회귀가 재발한다.
- **검증**: 브라우저에서 `callAiBackend`를 모킹해 (1) 한글+영문 혼합 본문 → 영문 블록만 프롬프트에
  포함되고(한글 블록은 프롬프트에 아예 안 나타남) 정확히 번역되어 렌더링되는지, (2) 순수 한글 본문 →
  AI 호출 0회, 에러 없이 즉시 원문 그대로 표시되는지 둘 다 확인함.
- **앞으로 비슷한 "AI에게 판정까지 맡기는" 기능을 새로 짤 때**: 판정 대상 중 일부가 로컬에서 값싸고
  확실하게 걸러낼 수 있는 경우(이번처럼 정규식 한 줄로 "번역 불필요"를 미리 알 수 있는 경우)라면,
  그 판정 자체를 AI에 맡기지 말고 최대한 클라이언트에서 먼저 걸러 AI 호출 대상 자체를 줄이는 걸 우선
  검토할 것 — 청크/병렬화보다 "애초에 보낼 필요가 없는 요청을 안 보내는 것"이 항상 더 효과적이다.

### 🔄 토픽 프로파일(Phase 6) 자동 재생성 — 헤드리스 경로까지 커버 (2026-09-14)

`js/26-topic-profile.js`의 "AI 업무 +10개마다 프로파일 자동 재생성"(`_tpMaybeAutoRegen`, 내부
`_tpShouldRegen`이 판정)은 **fileId별로 독립된 쿨다운(10분)·기준치(+10개)를 localStorage
(`gantt_topic_regen_state_v1`)에 저장**해서 추적한다 — 예전엔 이걸 모듈 전역 변수 하나로만
추적해서 ①프로젝트를 오가면 쿨다운이 서로 오염되고 ②애초에 "지금 열려있지 않은" 프로젝트에는
걸 수조차 없었다. 지금은 아래 **헤드리스 경로(지금 브라우저에 열려있지 않은 프로젝트에 Drive를
직접 fetch→PATCH하는 코드) 3곳**에서도 각자 호출한다 — 새로운 헤드리스 Drive 쓰기 경로를 추가할
때 반드시 여기도 걸 것:

- `js/15b-mail-server-tab-1.js`의 `_msAutoRegisterToProject`(메일서버 완전자동, "지금 열려있지
  않은" 분기)
- `js/14d-distribution-ledger.js`의 `inboxDistExecute`(업무보관함 단일 배분)
- `js/14d-distribution-ledger.js`의 `distSendTaskToTargets`(다중 배분 공용 헬퍼 — Task Inbox
  다중전송·`_msQueueReanalyzeMulti` 양쪽이 재사용)

세 곳 모두 패턴이 동일: PATCH할 `saveData`를 다 만든 직후(`saveData.globalData = ...` 대입
직전) `await window._tpMaybeAutoRegen(fileId, rows, saveData.colIdx, saveData.projectMeta || {})`를
호출해 결과가 있으면 `saveData.topicProfile`에 얹은 뒤, **원래 하려던 PATCH 한 번에 같이
실어 보낸다** — 별도 Drive 왕복을 추가하지 않는다(그만큼 저장 충돌 창도 늘어나므로). 이 함수는
`window.getActiveAiKey()`가 없거나 `getTopicProfileAutoDisabled()`가 켜져 있으면 조용히 null을
반환하고, 실패해도 호출부는 전부 `try/catch`로 감싸 업무 배치 자체를 막지 않는다.

`window._generateTopicProfile()`도 이 참에 `ctx` 인자(`{key, rows, colIdx, projectMeta, silent}`)를
받도록 확장됨 — **인자 없이 호출하면 예전과 100% 동일하게 "지금 열려있는 프로젝트" 기준으로 동작**
하고, `ctx.silent`가 true면 토스트를 띄우지 않고 "미분류 자동 재분석" 트리거(`_msBulkReanalyzeUnmatched`,
`window._msResults` 참조 — 지금 화면의 메일서버 탭 상태라 다른 프로젝트 갱신과는 무관)도 건너뛴다.
새로 이 함수를 호출하는 코드를 추가할 때, 지금 열려있지 않은 프로젝트를 대상으로 한다면 반드시
`rows`/`colIdx`/`projectMeta`를 명시적으로 넘길 것 — 안 넘기면 전역 `globalData`/`colIdx`/
`window.projectMeta`(=지금 열려있는 엉뚱한 프로젝트 것)를 잘못 읽어버린다.
