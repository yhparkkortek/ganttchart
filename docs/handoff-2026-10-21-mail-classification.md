# 인계 — 2026-10-21 세션 (메일 분류 · 백로그 취합 · 모델명 · 모달)

> 이 세션은 삭제됩니다. **다음 세션이 알아야 할 것만** 남깁니다.
> 무엇을 고쳤는지는 커밋 메시지에 다 있으니, 여기엔 **검증 안 된 것**과 **남은 일**을 중심으로 적습니다.
> 커밋은 전부 `main`에 푸시 완료. 이후 다른 세션들이 같은 파일을 더 고쳤으므로(아래 ⑥ 참고)
> 현재 상태는 반드시 `git log <파일>` 로 확인할 것.

---

## 1. 출발점 — 사용자가 처음 물은 것

> "토픽 프로파일로도 메일 분류가 잘 안 된다 / 아이디어 달라 / 메일을 못 가져오나 / 분류가 멈춘 것 같다"

진단 결과 **멈춘 적 없었다.** 수집·분류 모두 정상이었고, 진짜 원인은 셋이었다:

1. **Stage 0 필터가 메일의 절반 이상을 분석기 앞에서 걷어냈다** — 폐기 112 + 신규발신자 67 = 179건
   (같은 기간 분석된 건 142건). 두 큐는 **편도**라 AI로 보낼 방법이 아예 없었다.
2. **AI는 틀리지 않았다.** 미분류 31건의 매칭근거가 거의 전부 "후보 목록에 없는 프로젝트"였다 —
   분류 실패가 아니라 **프로젝트 미등록**이다.
3. 등록을 막고 있던 게 **KTK PN 필수**였다. KTK PN은 수주 후 채번되는데, 분류가 필요한 메일은
   그 *이전*(RFQ·견적·문의)에 온다.

**교훈**: "분류가 안 된다"는 제보에서 분류기부터 의심하지 말 것. 큐 앞단(필터)과 후보 목록(등록)을 먼저 본다.

---

## 2. 이 세션이 한 일 (커밋)

### 메일 파이프라인
| 커밋 | 내용 |
|---|---|
| `85bf0a7` | 사내 `noreply` 면제(`noreplyExemptDomains`) — JIRA 업무 알림이 폐기되던 것. 폐기/신규발신자 큐에 **✅ 지금 AI 분석** 복귀 버튼 |
| `560c300` | 토픽 프로파일의 **상황·현재단계·판별단서**를 매칭 프롬프트 후보 목록에도 전달(전엔 키워드 8개만) |
| `677a52a` | 토픽 프로파일 **신선도** — 30일 경과 시 시간 기반 재생성(하루 1회 제한) + 프롬프트에 "(N개월 전 기준)" 노출 |

### Phase 9 군집 감지
| 커밋 | 내용 |
|---|---|
| `1ac63b7` | 안 뜨던 3가지 — `hasNearCandidate` 가드 완화 · 군집키 다중토큰+토큰공유 병합 · 임계치 10→5 |
| `860ba5f` | ⚠️ **다른 세션이 수습** — 위 임계치 변경이 백로그 76건을 한 스윕에 판정해 **AI 하루 한도를 태웠다**. 스윕당 8개 상한·간격·쿨다운 중단 추가 |
| `85343ee` | 그 사고를 `docs/mail-pipeline.md`에 기록 + CLAUDE.md 색인 |

### 백로그 일괄 정리 (신규 `js/44-backlog-consolidate.js`)
| 커밋 | 내용 |
|---|---|
| `f5da991` | 규칙(결정론) → AI 취합 **전체 1회** → 확인 1회 → 일괄 생성. 📦 버튼 |
| `32e3ac8` | 첫 실사용이 전부 틀렸다 — ①`callAiBackend` 반환이 객체인데 `String()` 처리해 **AI 결과를 매번 버림** ②주소록 도메인을 고객사로 오인(협력사가 묶임) ③자사명 "코텍"이 377건을 삼킴 |
| `6ffd62d` | 일괄 생성이 **참조 엑셀 단계를 빠뜨려** Customer SPEC 표준서식 없는 껍데기 프로젝트를 만들었다. 적재 대기 추가 + js/42에 "서식 없음" 안내 |

### 등록 게이트
| 커밋 | 내용 |
|---|---|
| `275330f` | 신규 등록 필수를 **고객사+고객모델명 2개**로 축소. KTK PN·담당자·PROTO Start는 **DV 승격 시점**으로 이동(MP(EC) 임시 단계 활용) |
| `320910f` | 마법사 Step1 제품구분자 → **드롭다운+칩**, Step3 고객사 → **datalist**. `window.CUSTOMER_CATALOG`(js/04a) 신설 |

### 모델명 빌더 (신규 `js/46-model-name-builder.js`)
| 커밋 | 내용 |
|---|---|
| `67ddb03` | 사내 규칙 V10대로 조립. `KT`+구분(1)+외형(3)+전원(1)+터치(1)+고객사(1)+일련(2) |
| `2824203` | **문서를 통짜 텍스트로 읽어 표를 오독했다** — Word 표를 셀 단위로 재추출해 정정 |
| `ccd953b` `27c73c7` | SAP 중복 확인(일련번호 제외 앞자리). **와일드카드를 양쪽에** 써야 한다 |
| `c1ae4f7` | 칩이 안 눌리던 것 — 박스의 `stopPropagation` 때문에 오버레이 위임 리스너에 이벤트가 안 올라옴 |
| `c417491` `5057214` | ⑤ 고객사에 카탈로그 병합(앞자리 코드) + 충돌 표시. AMUSNET=2 지정 |

### 모달 공통 (`js/19`)
| 커밋 | 내용 |
|---|---|
| `71e9a58` | 8방향 크기조절 + 화면 밖 이탈 방지(`_makeResizable`/`_clampModalToViewport`) — `_makeDraggable`을 쓰는 **모달 50개 전체**에 자동 적용 |
| `2824203` | 손잡이 `<div>`가 버튼 클릭을 먹던 회귀 → **덮개 없이 가장자리 좌표로 판정**하는 방식으로 교체 |

---

## 3. ⚠️ 검증 안 된 것 (가장 중요)

**이 세션에서는 브라우저 pane이 로컬 서버에 접근하지 못했다**(`preview_start` 후 navigate가 매번 거부).
그래서 아래는 전부 **노드 단위 테스트 + 정적 검증만** 했다. 실제 화면 동작은 미확인이다.

- **`js/44` 일괄 생성(`_bcApply`)이 한 번도 실행된 적 없다.** 취합 표까지는 사용자가 확인했지만
  (42줄 → ZITRO/ICONIC 63건 등 정상), **프로젝트를 실제로 만들어 본 적이 없다.**
  팀 공용 Drive에 파일을 만드는 동작이니 **첫 시도는 한 줄만 체크**할 것.
  - 참조 엑셀 대기(`_bcImportReferenceAndWait`)도 미실행
  - 비밀번호 배치 토큰(`_batchPwPending`/`_batchPwToken`, js/04c)도 미실행
- **마법사 드롭다운**(제품구분자 칩, 고객사 datalist) 미확인
- **Customer SPEC 서식 가드**(js/42) 미확인
- **모델명 빌더 칩 클릭 수정**(`c1ae4f7`) 미확인 — 직전까지 안 눌렸던 부분이다
- **AMUSNET=2 표시** 미확인

**검증된 것**: SAP 중복 조회는 라이브로 대조했다 — `KTS320DPS*` 0건 / `*KTS320DPS*` 1건
(MATNR 502574, MAKTX `MVD>KTS320DPS01,LNW`).

---

## 4. 남은 일

### 사람이 해야 하는 것
1. **걸러진 큐 179건 처리** — 폐기 112 / 신규발신자 67. ✅ 버튼은 만들었지만 **아직 안 눌렀다.**
   신규발신자에 `amusnet.com`·`zitrogames.com`·`intralot.*`·`ul.com` 등 **실제 고객사**가 있다.
2. **미등록 프로젝트 등록** — 미분류의 실제 원인.
   - ZITRO ICONIC 계열 ≈ **155건** (ICONIC 41 · ZITRO 22 · SPLENDIDUM 13 · SPECIAL 13 · 사전조립 9 · 임가공비 9 · 문의사항 7 · 파워보드 7 · 49인치 7 · 도사급 6 · 원자재 6 · LIGHTING 5 · PULLIN 5 · 판토스 5)
   - LNW 계열 ≈ 40건 (TOUCH 12 · 모니터 10 · COSMIC 8 · K27 5 · 장기보관시험 5)
   - Dice Popper 8건 · BARON 19.5" VBD 3건 · IGT/ANEMONE 15건
3. **고객사 앞자리 충돌 11곳 코드 배정** — 특히 **KGI·INTRALOT은 실거래처인데 코드가 없다.**
   남은 알파벳: `D F H L O P Q R T V X Y` + 숫자 `5~9`. 정하면 `CUSTOMER_CATALOG`에 `code:'X'` 추가.
4. **`BALLY` 카탈로그에서 뺄지 결정** — 독립 회사가 아니라 Light & Wonder 계보다. 지금 `B` 자리를 차지 중.

### 코드로 남은 것
- **`unmatchedClusters` 494개 정리 정책이 없다.** `project_index.json`의 **444KB / 451KB(98%)** 가 이 백로그이고,
  이 파일은 **메일 분석할 때마다 내려받는다.** 누적 상한·만료가 없어 무한히 자란다.
  `pending`이 남아 있으면 **AI 업무 분석 모달을 열 때마다** 스윕당 8건씩 AI가 나간다.
- **`/fetch-mail`에 타임아웃이 없다**(`js/15b:149`, `js/15b:1263`). 다른 백엔드 호출은 전부
  `AbortSignal.timeout`을 쓰는데 메일 수집만 빠져 있다. 백엔드가 멎으면 `_msAutoTickRunning`이
  영구 고정되고 `msForceReset`도 그 잠금을 안 푼다. *(단 `e5fea68`에서 다른 세션이 수집 멈춤의
  다른 원인을 고쳤으니, 손대기 전에 현재 코드를 다시 볼 것)*
- **HTML 자체에 캐시버스터가 없다.** `?v=`는 JS에만 붙고 그 값이 적힌 곳이 HTML이라,
  브라우저가 HTML을 캐시하면 **캐시버스터가 통째로 무력화**된다. 이 세션에서 실제로 두 번 겪었다
  (사용자가 새로고침해도 옛 코드가 돌았다). `Ctrl+Shift+R`로만 풀렸다.

---

## 5. 이 세션에서 배운 함정 (이미 docs·주석에 반영됨)

- **`callAiBackend`는 문자열이 아니라 `{ok, data, …}` 객체를 돌려준다.** 꺼낼 땐 `window._aiExtractText(r.data)`.
  `String(raw)`로 다루면 `"[object Object]"`가 되고 거기 `[`·`]`가 있어 JSON 파싱이 **매번 조용히 실패**한다.
- **Word `.doc` 표는 통짜 텍스트로 뽑지 말 것.** 셀 경계가 사라져 추측이 섞인다.
  `win32com` → `doc.Tables(n).Cell(r,c).Range.Text` 로 읽을 것(이 세션에서 표 4개를 그렇게 정정했다).
- **임계치·필터 완화는 과거 데이터에 소급 적용된다.** 완화 전에 **누적 백로그 크기를 먼저 확인**할 것.
  (이게 AI 하루 한도를 태운 직접 원인이다.)
- **모달 박스에 `onclick="event.stopPropagation()"`이 걸려 있다.** 위임 리스너는 **박스 자신**에 달 것.
  오버레이에 달면 이벤트가 안 올라온다.
- **SAP 자재내역은 모델명으로 시작하지 않는다**(`MVD>KTS320DPS01,LNW`). 패턴은 `*…*` 양쪽을 열 것.
- **Customer SPEC AI 매핑은 `mode:'fill'`** — 빈칸만 채운다. 표준 서식(TYPE/TYPE2)이 없으면 못 돈다.
  그 서식은 **참조 엑셀**에서 온다. 프로젝트를 코드로 만들 때 이 단계를 빠뜨리면 껍데기가 된다.
- **Bash heredoc이 백슬래시를 먹는다.** 파이썬/JS 스크립트는 `Write` 도구로 파일에 쓰고 실행할 것.

---

## 6. ⚠️ 이후 다른 세션이 같은 파일을 더 고쳤다

이 세션 종료 뒤(10-22) 다른 세션들이 **모달 공통(js/19)을 여러 번 더 고쳤다**:
`22068c8`(잡는 띠가 스크롤바에 덮임) · `2bb67a5`(띠를 테두리 중심 대칭으로) · `ea89bfa`(외곽 테두리) ·
`0914102`(헤더 잡으면 드래그·리사이즈 동시 시작) · `5597c72`(rAF 묶음) · `74026bb` · `73a04fa`.

→ **js/19를 손대기 전에 `git log js/19-shared-modal-drag.js` 를 먼저 볼 것.**
이 문서의 모달 관련 설명은 `71e9a58`/`2824203` 시점 기준이며, 현재 구현은 그보다 많이 나아가 있다.

같은 기간 `js/42`·`js/50`·`js/51`·`js/53`(NAS 자료실·PARTS 확장)과 전자결재 쪽도 크게 늘었다.
파일 맵은 CLAUDE.md가 최신이다.

**포크 세션**: `local_397582e5` ("토픽 프로파일 메일 분류 문제 (fork)")이 메일 원문을 NAS 원본에서
읽는 기능(`e12e57a`)을 따로 작업했다.

---

## 7. 바로 쓸 수 있는 진단 스크립트

앱 탭 콘솔(F12)에 붙여넣는다. 전부 읽기 전용이고 AI를 호출하지 않는다.

```js
// ① 메일 수집이 멈췄는지 (잠금·마지막 수집·할당량·큐 적체)
({ 자동틱잠금: window._msAutoTickRunning, 보관함스윕: window._ibSweepRunning,
   마지막수집: localStorage.ms_last_auto_fetch_at, 주기: window.getMailAutoInterval?.(),
   모드: window.getMailMode?.(), 미분류: (window._msResults||[]).filter(r=>!r.project).length,
   폐기: JSON.parse(localStorage.ms_discard_queue||'[]').length,
   신규발신자: JSON.parse(localStorage.ms_new_sender_queue||'[]').length,
   소진모델: JSON.parse(localStorage.gantt_ai_usage_v1||'{}').exhausted })
```

```js
// ② 군집 백로그 요약 (494개를 통째로 찍으면 접혀서 안 보인다)
(async()=>{const t=gapi.client.getToken().access_token,i=await window.findProjectIndexFile(t),
j=await(await fetch(`https://www.googleapis.com/drive/v3/files/${i}?alt=media&supportsAllDrives=true`,
{headers:{Authorization:'Bearer '+t}})).json(),c=j.unmatchedClusters||[],
T=f=>c.reduce((m,x)=>{const k=f(x)??'-';m[k]=(m[k]||0)+1;return m},{});
console.log('총',c.length,'상태',T(x=>x.status),'크기',Math.round(JSON.stringify(c).length/1024)+'KB/'
+Math.round(JSON.stringify(j).length/1024)+'KB');})()
```

```js
// ③ 토픽 프로파일 신선도 (30일 넘으면 자동 재생성 대상)
Object.entries(JSON.parse(localStorage.gantt_topic_profile_v1||'{}'))
 .map(([k,v])=>({id:k.slice(0,8),단계:v.current_phase||'-',
   경과일:v.ts?Math.floor((Date.now()-Date.parse(v.ts))/86400000):'ts없음'}))
 .sort((a,b)=>(b.경과일||0)-(a.경과일||0))
```

```js
// ④ 새 코드가 떴는지 (HTML 캐시 확인 — 이 세션에서 두 번 속았다)
({ 주소: location.href,
   js19: [...document.querySelectorAll('script[src^="js/19"]')].map(s=>s.getAttribute('src')) })
```
