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

### 🩺 저장소 닥터 — "업무 보관함 저장 공간이 가득 찼습니다"가 계속 뜨는데 🧹 정리는 "정리할 항목 없음" (2026-09-21, `js/34-storage-doctor.js`)
- **원인**: 브라우저 localStorage(약 5MB)는 앱의 **모든 기능이 함께** 쓴다. 정리 버튼(`inboxCleanupStorage`)은 업무 보관함 항목만 봤는데, 실제 공간은 다른 키(AI 학습 로그 `gantt_ai_learning_v1`=프로젝트별 200건×프로젝트 수 무제한, 문답 피드백 200건(질문·답변 전문), 메일 큐 등)가 차지하고 있을 수 있어서 보관함이 깨끗해도 경고가 계속됐다. 어느 키가 원인인지는 사용자 브라우저에서만 알 수 있다.
- **해결(데이터 우선)**: 정리 대상을 코드가 아니라 **`window.STORAGE_REGISTRY`(레지스트리)**로 선언 — 키마다 `cls`(cache=다시 만들 수 있음 / log=이력)와 `strategy`(`drop` / `array`(최근 N건) / `byProject`(프로젝트당 N건·최근 활동 M개 프로젝트만)). **새로 쌓이는 저장소를 만들면 레지스트리에 한 줄 추가**할 것(안 하면 같은 문제가 재발).
- 🧹 버튼: 저장소 전체 사용량(%)과 **큰 항목 순위**를 보여주고, 정리 가능한 항목을 줄어드는 크기와 함께 확인받아 정리(취소하면 아무것도 안 지움). 정리할 게 전혀 없어도 "없음"만 말하지 않고 큰 항목 목록을 보여준다.
- 저장 실패 시: `cache` 클래스(Drive 폴더 캐시 등)만 **자동으로** 비우고 재시도(경고 없이 복구). 로그류는 사람이 확인한 뒤에만. 그래도 실패하면 토스트에 원인(큰 항목 3개+용량)을 표시.
- 원인 수집: `storage_full`/`storage_report` 이벤트(키 이름과 크기만, 내용 없음)가 Phase 10 이슈로 쌓여 리포트에서 "환경: 브라우저 저장소 가득"으로 분류된다 — 다음 "이슈 정리"에서 실제 원인 키를 확인할 것.
- **미확정**: 이 사용자의 실제 원인 키는 아직 모른다(레지스트리는 코드에서 확인한 무한 증가 후보). 🧹 버튼을 눌러 나온 "큰 항목" 목록이 실제 원인이며, 레지스트리에 없는 키가 크면 추가한다. 메일 대기 큐(`ms_pending_queue`, 최대 300건 원문 포함)는 처리 대기 데이터라 자동 정리 대상에서 뺐다(크기만 표시).
- **확정(2026-09-21 후속)**: 실제 원인은 `ms_pending_queue`(메일 서버 검토 큐) 2.4MB — ① 등록 완료 메일도 본문 전체를 계속 보관 ② 최신이 앞(`unshift`)인데 `slice(-300)`으로 저장해 300건 초과 시 **새 메일이 빠지고 오래된 것만 남는** 버그. `js/15b`의 `_msSlimQueue`(최신 300건 앞에서 유지 · 등록 완료 건 본문 1500자로 축소 · 예산 1.2MB 초과 시 오래된 등록 완료 건부터 제거, 검토 대기 건 본문 보존)로 저장하고, 레지스트리엔 `{type:'fn', fn:'_msSlimQueue'}`로 등록. 나머지 큰 키 `gantt_task_inbox`(1.8MB)는 사용자 업무 데이터라 자동 축소하지 않음.

### 🔴 "메일 자동배치 OFF"가 백그라운드 AI 호출을 막지 못하던 버그 + AI 호출 전역 스로틀 (2026-09-22, 사용자 제보)

**증상**: 사용자가 오늘 AI 기능을 쓴 적이 없는데도 Gemini 무료 등급 quota(`gemini-3.5-flash-lite`, limit 500) 초과 에러가 계속 떴다. 각 사용자는 자신의 API 키를 쓰므로(팀 공유 프로젝트 아님) 다른 사람 사용량 때문이 아니었다.

- **원인**: `js/22a-summary-mctable-parse.js`가 페이지 로드 시(`DOMContentLoaded`) 항상 `_startMailAutoScheduler()`를 시작시키고, 이게 1분마다 체크하다 설정된 주기(기본 30분)가 지나면 `_autoMailFetchTick()`(`js/15b-mail-server-tab-1.js`)을 자동 실행한다 — 메일서버 로그인 정보가 저장돼 있으면 POP3로 새 메일을 가져와 **메일 한 건마다 AI 분석**(`msCallGemini`)을 사람 조작 없이 돌린다. 탭을 열어두기만 해도(본인이든 다른 동료 PC든) 계속 소모된다. 그리고 **`mail_mode`("🔴 메일 자동배치 OFF")를 이 틱이 전혀 확인하지 않아서, OFF로 꺼놔도 조회+AI분석이 계속 실행되고 있었다** — 원래 OFF는 "등록 방식"만 다르게 하려던 설정이었는데 실질적으로 전혀 안 꺼지는 상태였음.
- **수정**: `_autoMailFetchTick` 맨 앞에 `if (window.isMailAutoProcessEnabled && !window.isMailAutoProcessEnabled()) return;` 추가 — OFF면 조회 자체를 시작하지 않음.
- **추가 개선 ①(같은 제보 후속, "자동전환을 손보자")**: 메일 자동분석과 AI 문답을 동시에 쓰면(둘 다 같은 API 키를 쓰므로) 짧은 시간에 요청이 몰려 무료 등급의 분당 요청 한도(RPM)를 실제 필요한 것보다 빨리 태운다. `js/14a-ai-mail-analysis-1.js`에 `window._aiThrottleGate()`를 추가 — `callAiBackend`(모든 AI 기능의 공용 진입점)의 실제 `fetch` 직전에 걸어서, 앱 전체에서 나가는 모든 AI 요청 시작 시각 사이에 최소 2.5초 간격을 Promise 체인으로 직렬화해 보장한다(동시에 여러 호출이 몰려도 뒤엉키지 않고 순서대로, 간격을 지키며 나감).
- 같은 날 `js/14a`에 있던 **자동전환 후보에서 유료(`tier:'paid'`) 모델 제외** 수정도 함께 적용됨(실사용 확인: `gemini-3.1-pro`가 무료 등급 한도 "limit: 0"으로 거부됨 — 자동전환 후보에 남겨봐야 매번 헛되이 한 번 더 실패만 함).
- **추가 개선 ②(2026-09-22, 같은 날 후속, 사용자 요청) — 다른 무료 제공사로 자동 폴백**: "이 quota 문제를 피할 방법 없냐"는 질문에 ①(호출 간격)·②(다른 제공사 자동전환)·③(스케줄러 완화) 세 방향을 제시했고 사용자가 ②를 선택. `js/14a-ai-mail-analysis-1.js`의 모델별 시도 루프(기존 `callAiBackend` 본문)를 `_aiTryProviderCandidates(providerKey, apiKey, prompt, opts, GAS_URL)`로 뽑아내고, `callAiBackend`는 ① 활성 제공사로 먼저 시도 → ② 그 제공사의 **모든** 무료 후보 모델이 실패(`allCandidatesFailed`, 즉 할당량/사용중단/요청크기/일시오류처럼 "이 제공사가 막혔다"는 신호일 때만 — 키 오류처럼 다른 이유면 폴백해도 소용없으므로 시도 안 함) → ③ `window._AI_FREE_FALLBACK_PROVIDER_ORDER = ['gemini','groq','mistral']` 순서로, **저장된 키가 있는** 다음 무료 제공사에게 이번 요청만 대신 맡긴다(성공 시 토스트로 "OO 한도 소진 → XX로 대신 처리" 안내).
  - **OpenAI는 이 자동목록에서 제외** — 무료 등급이 없는(카드 등록 필요) 유일한 제공사라, 사람이 명시적으로 고르지 않았는데 자동으로 과금되는 곳으로 넘어가면 안 된다는 원칙(위 "자동전환에서 유료 모델 제외"와 같은 정신).
  - **의도적으로 persist하지 않음**: 성공한 폴백 제공사를 `ai_provider`(활성 제공사 설정)로 영구 저장하지 않는다 — 모델 자동전환(사용중단은 영구적)과 달리 할당량 소진은 **하루 지나면 원상복구되는 일시적** 문제라, 다음 호출도 항상 사람이 고른 원래 제공사부터 다시 시도한다(단, 아래 쿨다운으로 "매번 실제로 두드려보진" 않음).
  - **전제조건**: 이 폴백은 사람이 **Groq/Mistral 키를 미리 저장해둔 경우에만** 동작한다(키가 없으면 조용히 건너뜀) — 한 곳 키만 등록해뒀다면 효과 없음, ⚙️ 설정에서 백업용으로 다른 제공사 키도 미리 등록해두라고 안내할 것.
  - **🐛🐛 [2026-09-22 같은 날 회귀 발견, 사용자 지적] 이 폴백 자체가 quota 소모를 가속시키는 부작용이 있었다**: "Gemini는 오늘 종일 막힘(일일 한도)"인 상태에서 AI 호출을 할 때마다, 폴백 추가 전엔 Gemini 후보(최대 3개)만 두드리고 끝났는데, 추가 후에는 **매번 Gemini 3개 + Groq 3개 + Mistral 1개, 최대 7번의 실제 API 요청**을 매번 다시 시도하고 있었다 — 메일 자동분석/AI 문답/AI 요약 등 무엇을 하든 Gemini가 막혀있는 한 매번 Groq·Mistral 몫까지 같이 태워버려서, "Groq/Mistral도 최근에 안 되기 시작했다"는 제보로 이어짐(제보 시점 = 이 폴백 기능을 배포한 날과 정확히 일치 — 사용자가 "이전엔 문제없었는데 최근에"라고 직접 지적해서 발견). **수정**: `window._aiProviderCooldownUntil`(localStorage `ai_provider_cooldown_v1`, provider→만료시각 맵) — 한 제공사가 `allCandidatesFailed`(할당량 등으로 후보 전부 실패)로 확인되면 `window._aiMarkProviderCooldown(provider)`로 쿨다운 등록, 이후 호출은 `window._aiProviderInCooldown(provider)`가 true면 **그 제공사를 아예 시도하지 않고** 즉시 다음 후보(폴백 provider든, 결국 최종 실패든)로 넘어간다. 성공하면 `window._aiClearProviderCooldown`으로 즉시 해제(빠른 회복 감지). 활성 제공사·폴백 제공사 양쪽 모두 동일하게 적용 — 어느 한쪽만 봐주면 그쪽에서 또 같은 문제가 재발하므로. "너무 자주 재확인해서 낭비"와 "너무 늦게 재확인해서 quota 리셋을 못 알아챔" 사이의 절충값이라 실사용마다 최적값이 다를 수 있어서, **2026-09-22 같은 날 후속(사용자 요청)으로 하드코딩(20분)이 아니라 `window.getAiProviderCooldownMin()`/`setAiProviderCooldownMin()`(localStorage `gantt_ai_provider_cooldown_min`, 기본 20분) 설정값으로 뺐다** — ⚙️ AI 도구 설정 → 📉 AI 요청 크기 제한 → "⏳ 제공사 할당량 소진 시 재시도 대기(쿨다운)"에서 직접 조절 가능(다른 크기 설정들과 동일한 UI 패턴).
  - **🔀 [2026-09-22 같은 날 후속, 사용자 요청 "시간을 0으로 하면 풀리도록"] 0 = 쿨다운 기능
    자체를 끔**: `getAiProviderCooldownMin()`은 `parseInt("0")`이 falsy라서 기존 `v && v>=1`식
    판정으로는 0을 "설정 안 됨"과 구분 못 해 기본값(20)으로 되돌아가버리는 함정이 있었다 —
    저장된 문자열이 있는지부터 명시적으로 확인하도록 고쳐 0을 정확히 구분한다.
    `_aiMarkProviderCooldown`은 0분이면 아예 등록하지 않는다(=폴백 도입 이전의 "매번 모든
    제공사를 다시 시도"하는 원래 동작으로 되돌아감). **설정만 0으로 바꾸는 것으로는 부족함**을
    발견 — 이미 쿨다운 중인 제공사는 `_aiProviderCooldownUntil`에 남은 만료시각이 그대로라
    "0으로 했는데 왜 아직도 막혀있냐"는 혼란이 생기므로, 설정 저장 시점(`saveAiToolsSettings`)에
    0이면 `_aiProviderCooldownUntil`을 즉시 비우고(`localStorage` 항목도 삭제) 토스트로 안내한다.
  - **🖥️ 같은 요청에서 같이 발견된 별개 버그**: ⚙️ AI 도구 설정 모달의 스크롤 영역
    (`overflow-y:auto; flex:1;`인 내부 div)에 `min-height:0`이 빠져 있어서, 이 세션에서 설정
    항목(SAP 최대 글자 수/쿨다운 등)을 계속 추가하며 내용이 길어지자 **내부 div가 스크롤되는
    대신 부모(바깥 `overflow:hidden` 박스)가 그냥 잘려버렸다** — 전형적인 flexbox 스크롤 함정
    (`flex:1` 자식은 `min-height:0`을 명시하지 않으면 콘텐츠보다 작아지길 거부해서, 부모가
    `overflow:hidden`이면 스크롤바 없이 그냥 클리핑됨). `min-height:0` 한 줄 추가로 해결 —
    **앞으로 이 모달에 설정 항목을 더 추가할 때는 다시 막히지 않는지 직접 스크롤해서 확인할 것.**
  - **🐛🐛🐛 [2026-09-22 같은 날 재발견] 쿨다운 도입 직후에도 "여전히 너무 빨리 소진된다"는 재제보 —
    원인은 크기초과 판정 정규식 누락**: Groq가 모델별 상세 설명 없이 표준 HTTP 413 문구
    "**Request Entity Too Large**"(중간에 "Entity"가 끼어 있음)로만 거부하는 경우가 있는데,
    기존 `window._AI_REQUEST_TOO_LARGE_RE`는 "request **too large**"(Entity 없이 붙어있는 형태 —
    Groq가 모델별로 주는 "Request too large for model `X`... TPM Limit 8000..." 상세 메시지용)만
    찾고 있어서 이 문구와는 매치가 안 됐다. 그 결과 `isTooLarge=false` → `skipRemainingRetries`가
    안 걸려 후보 모델을 1개만 시도하고 바로 실패 반환 → `allCandidatesFailed`도 안 남아 위 쿨다운
    자체가 등록되지 않았다 — 이 실패 유형을 겪은 제공사는 쿨다운 도입 후에도 계속 매번 처음부터
    다시 두드려지고 있었던 것. **수정**: 정규식에 `request entity too large`/`payload too large`/
    `\b413\b`를 추가. **앞으로 이런 "정규식이 실제 에러 문구와 미묘하게 다름" 버그를 피하려면**,
    새 에러 패턴을 정규식에 넣을 때 반드시 사용자가 보낸 **에러 원문 그대로**를 대조해볼 것 — 비슷해
    보이는 문구도 중간에 단어 하나(Entity 등)가 끼면 안 걸릴 수 있다.
