# Phase 10 설계 — SAP·AI 문답 이슈 수집 → 군집 리포트 → 주기적 반영 (설계 초안, 2026-09-21)

> **상태(2026-09-21): 10-A 구현 완료 — §12 "구현 결과/운영/미검증" 참고.** §1~§11은 원래 설계이며 구현 편차는 §12에 정리.
> 상세 기록은 이 문서에 계속 누적하고 CLAUDE.md에는 한 줄 요약만 둔다.

## 0. 한 줄 요약

모든 사용자의 SAP/구매오더/AI 문답 **실패·불만 신호를 자동으로(+수동 🚩 신고로) 마스킹해서 Drive에 모으고**,
관리자가 주기적으로 **군집 리포트를 열어 내보내면**, Claude가 그 파일을 읽어 원인을 진단하고 코드/프롬프트/사전을 고쳐 `main`에 반영한다.
**Phase 10 1차는 "수집 + 리포트"까지만**이며 자동 적용은 하지 않는다(지식층 자동 주입은 10-B).

## 1. 목표 / 비목표 / 원칙

**목표**
- 같은 SAP 함정에 세션마다 다시 빠지는 비용을 줄인다(진단 이력을 사람 기억이 아니라 데이터로).
- 사용자가 "안 된다"고 말하기 전에 실패가 기록되게 한다.
- 실패 순간의 SAP 화면 구조를 자동 저장해, 사용자의 라이브 SAP 세션 없이도 원격으로 원인을 볼 수 있게 한다.

**비목표(1차)**
- AI가 스스로 코드/프롬프트를 고쳐 배포하는 것(재무 커밋 경로가 있어 금지, 코드층은 항상 사람+Claude).
- 개별 이벤트마다 AI를 호출하는 것(비용). 분석은 결정론적 군집이 먼저, AI는 군집이 임계치를 넘을 때만(Phase 9 패턴).

**원칙**
1. **관측 가능성 먼저** — 실패 사유를 삼키는 코드를 없애는 것이 학습의 전제(레이아웃 사건 교훈).
2. **마스킹 우선** — 자재번호·단가·협력사·사업자번호는 저장 전에 지운다. 화면 스냅샷은 "구조"만.
3. **기존 패턴 재사용** — 결정론적 군집(29번), 승인 이력(27번), 사용자별 파일 샤딩(TaskInbox_Backups), 저장 경로 통일(`C:\SAP_DMS`).
4. **수집이 본 기능을 절대 방해하지 않음** — 모든 수집 코드는 try/catch로 감싸고, 실패해도 조용히 무시.
5. **협업 대비 경계** — 새 코드는 새 파일로(§8), 기존 거대 파일(04h 451KB)엔 최소한의 한 줄 훅만.

## 2. 전체 구조

```
[브라우저]                                   [로컬 백엔드 127.0.0.1:5000]                [sap_bridge_32.py]
 30-issue-collector.js                        kortek_backend.py
  ├ window.fetch 래퍼 ──(?_rid=…)──────────▶  after_request 훅 ─▶ issue_events.jsonl        실패 시
  │   (sap-*/po-* 호출만 감싼다)                 (rid·route·ok·오류·소요·버전)                   화면 스냅샷 생성
  │                                            _run_sap_bridge ◀──────── diag/snapshot ───────┘
  ├ 사용자 반응 훅(👎/🚩/재질문/인터럽트)        GET  /issue-drain  ──▶ (브라우저가 가져감)
  ├ localStorage outbox                         POST /issue-ack    ◀── (업로드 성공 후 커서 확정)
  └ Drive 업로더 ── 사용자·월별 샤드 파일 ──▶  Drive/Backups/SAP_Issues/issues_<이름>_<YYYYMM>.json
                                                                        │
 31-issue-report.js (관리자 모달) ◀── 전 샤드 병합·군집·순위 ◀───────────┘
  └ [내보내기] ─▶ POST /issue-export ─▶ C:\SAP_DMS\SAP이슈\digest_<날짜>.json ─▶ Claude가 읽고 수정
```

**왜 백엔드가 직접 Drive에 안 쓰나**: Drive OAuth 토큰은 브라우저에만 있다. 그래서 백엔드는 로컬 JSONL "우편함(outbox)"만
관리하고 브라우저가 가져가서(drain) 업로드한 뒤 확정(ack)한다. 최소 1회 전달 + 이벤트 id로 중복 제거.

## 3. 수집 지점 (4곳)

### 3-A. 프런트 `fetch` 래퍼 — 호출 16곳을 고치지 않고 한 곳에서
- 현재 SAP/PO 호출은 `04h`에 16곳(`sap-bom`, `sap-zmm009`, `po-sap-prepare` …)으로 흩어져 있음.
  → `30-issue-collector.js`가 로드될 때 `window.fetch`를 한 번 감싸 URL이 `127.0.0.1:5000/(sap|po)-` 패턴일 때만 계측한다.
- **요청 상관 id는 헤더가 아니라 쿼리 파라미터(`_rid=`)로.** 백엔드 CORS가 `Access-Control-Allow-Headers: Content-Type`만
  허용하므로(`kortek_backend.py:91`) 커스텀 헤더를 쓰면 preflight가 막혀 **구버전 백엔드에서 SAP 호출 전체가 깨진다.**
  쿼리 파라미터는 Flask가 모르는 파라미터를 무시하므로 구버전과도 안전.
- 기록 항목: 소요시간, 네트워크 오류/타임아웃, **JSON이 아닌 응답(=HTML 404 → 구버전/꺼진 백엔드)**, `ok:false` + error 문구.
- 재귀 방지: 이슈 수집 자신의 `/issue-*` 호출은 래퍼가 건너뛴다.

### 3-B. 백엔드 `after_request` 훅 + `_run_sap_bridge` 진단 수집
- `/sap-*`, `/po-*` 라우트만 골라 `issue_events.jsonl`(BASE_DIR, `.gitignore`, 5MB 초과 시 회전)에 한 줄 append.
- 기록: rid, 라우트, HTTP 상태, `ok`, 오류 문구(마스킹), 소요, **백엔드 버전 해시**(`kortek_backend.py`/`sap_bridge_32.py`
  파일 내용 해시 — 자동 업데이트 이후에도 "어느 코드에서 났는지" 판별용), 브릿지 `diag`(예: `layoutApplied/layoutRequested`).
- `_run_sap_bridge`는 서브프로세스 JSON에서 `snapshot` 키를 **꺼내 이벤트 로그로만 보내고 브라우저 응답에서는 제거**한다.

### 3-C. 브릿지 실패 화면 스냅샷 (이 설계의 핵심 가치)
- `sap_bridge_32.py`의 `main()`이 `ok:false`를 내보내는 두 경로(`RuntimeError`/일반 예외)에서
  `_capture_failure_snapshot()`을 호출해 JSON에 `snapshot`으로 싣는다. **읽기 전용(클릭/입력 없음)**, 자체 try/except, 시간 상한(2초).
- 수집 내용(구조만):
  - `tcode`(`Info.Transaction`), 프로그램/화면번호, 창 제목, 열린 창 개수(팝업 잔존 여부)
  - **상태바**(`MessageType`, `Text` — 숫자열 5자리 이상은 `#`으로 마스킹)
  - 창 트리: `(Type, SubType, 상대 Id, Name, Changeable)`, 깊이·개수 상한(≈200노드, 24KB)
  - 캡션성 컨트롤(`GuiLabel/GuiButton/GuiTab/GuiTitlebar`)의 `Text`만 저장(필드 **값**은 저장 안 함 → `GuiTextField/GuiCTextField/GuiTableControl/그리드 셀`의 Text 제외)
  - ALV 그리드는 컬럼 기술명(`MATNR` 등)과 행 수만
- 한글 캡션은 SAP GUI Scripting 버그로 깨져서 오지만(알려진 이슈) 그대로 저장 — 구조·Id가 진단의 본체.
- 이 스냅샷이 있으면 "라벨 컨트롤에 값을 넣음", "그리드 열 위치가 밀림", "팝업 잔존", "필수 필드 미입력" 유형을 **사용자 세션 없이** 판별 가능.

### 3-D. 사용자 반응 신호 (AI 문답 통합 포함)
| 신호 | 출처 | 비고 |
|---|---|---|
| 👎 | 기존 `saveGanttQaFeedback` | 새 저장소로도 복제(마스킹) |
| **🚩 신고(신규)** | 답변 옆 버튼 + 한 줄 코멘트 | 최근 10분 SAP 이벤트 rid를 자동 첨부 |
| 재질문 | 기존 `_ganttQaCheckReaskPattern` | 유사 질문 재입력 = 암묵적 불만 |
| 전역 인터럽트 발동 | `INTERRUPT_RE` | SAP/PO draft 도중이면 "어느 단계에서 포기했나" 신호 |
| AI 호출/파싱 실패 | `callAiBackend` 실패 등 | `domain:'qa'` |
- `domain` 필드로 `sap` / `po` / `qa`를 구분(사용자가 "통합"을 선택). qa 이벤트는 **마스킹한 질문 + 답변 앞 200자**만 저장.

## 4. 이벤트 스키마 (v1)

```json
{
  "id": "ev_<타임스탬프36>_<난수4>",       // 중복 제거 키
  "v": 1,
  "ts": "2026-09-21T14:03:22+09:00",
  "user": "박용훈",                          // getActiveUserName() — 파일명과 동일(§5)
  "domain": "sap | po | qa",
  "kind": "call_fail | call_slow | user_thumbs_down | user_flag | reask | interrupt | ai_fail",
  "rid": "r_…",                              // 프런트·백엔드 이벤트 상관 id
  "route": "/sap-bom",
  "params": { "materialCount": 2, "tcode": "auto", "layout": "/STD_MC" },   // 값이 아니라 형태/개수
  "result": { "ok": false, "http": 200, "durMs": 41230, "errorRaw": "…", "errorNorm": "…" },
  "stage": "select_layout",                  // 브릿지 단계 표지(있을 때만, §6)
  "env": { "backend": "a1b2c3d4", "bridge": "e5f6a7b8", "page": "20260921a" },
  "snapshot": { "tcode": "ZPP038", "status": {"t":"E","text":"…#…"}, "windows": 2, "tree": [ … ] },
  "user_note": "레이아웃 선택이 무시됨",      // 🚩 코멘트(있을 때)
  "flags": ["concurrent_session_suspect"]    // §9 오염 방지 표시
}
```

**마스킹 규칙(저장 전 공통 함수 `maskText`)**: 숫자열 5자리↑ → `#`, 10자리 사업자번호 패턴 → `#biz`, 이메일 → `#mail`,
따옴표 안 문자열 → `"?"`, 경로의 사용자명 → `<user>`. `errorNorm`은 이 규칙을 적용한 시그니처용 문자열.

## 5. 저장 (Drive)

- 위치: **`Backups/SAP_Issues/`**. 프로젝트 목록 조회(`_buildParentsQuery(SHARED_FOLDER_ID, ['Backups','App_Config'])`)가
  `Backups`를 이름으로 제외하므로, 그 하위에 두면 이벤트 JSON이 프로젝트 파일로 오인되지 않는다.
  (새 루트 폴더를 만들면 `_listProjectFiles`가 훑을 위험 — **구현 시 04b의 `in ancestors` 조회 필터를 재확인**할 것. 이미 `_App_Config`/`TaskInbox_Backups`는 exact-name 제외 목록에 없는 상태라 별도 정리 후보.)
- 파일: **`issues_<사용자명>_<YYYYMM>.json`** (사용자·월 단위 샤드, 이벤트 배열). TaskInbox_Backups의 사용자별 파일 관례와 동일.
  - 한 파일에 한 사용자만 쓰므로 **동시 쓰기 충돌이 없다**(project_index.json에서 겪은 문제 회피).
  - 업로드는 "기존 배열 읽기 → id로 중복 제거하며 append → PATCH". 월이 바뀌면 새 파일.
  - 폴더 생성은 `_getOrCreateNamedFolder`의 in-flight 캐시 재사용(중복 폴더 생성 사고 방지).
- 업로드 시점: 페이지 로드 후 30초 디바운스(29번과 동일), 이후 drain 결과가 있을 때, 탭 종료 직전 best-effort.
- 용량 가이드: 이벤트 1건 평균 1~2KB(스냅샷 포함 시 ≤ 26KB), 정상 성공 호출은 **기록하지 않음**(`call_slow`는 임계치 초과 시만). 월 수백 건 수준 예상.

## 6. 분석 — 결정론 군집 먼저

**시그니처(군집 키)** = `domain | route | stage | errorNorm의 앞 80자 | snapshot.tcode`
- `stage`는 브릿지에 가벼운 `_stage("select_layout")` 표지를 점진적으로 추가(처음엔 없어도 됨 — errorNorm+스냅샷으로 시작, 진단이 모호했던 지점부터 표지를 늘린다).
- `qa` 이벤트는 `kind + 질문 형태 해시(마스킹 후 앞 40자 2-gram)`.

**순위 점수** = 발생 횟수 × (영향 사용자 수) × 최근성 가중(최근 14일 ×2) — 1회성 오타/개인 환경 문제를 아래로 내림.

**군집 카드 필드**: 시그니처, 건수, 사용자 수, 최초/최근 발생, 대표 이벤트 3건(마스킹), 대표 스냅샷 1건, 백엔드 버전 분포
(→ "구버전에서만 발생"이면 코드 버그가 아니라 배포 문제), `flags` 요약, **추정 층**(① 지식 ② 프롬프트 ③ 코드) — 규칙 기반 힌트:
`errorNorm`에 "찾지 못" + 스냅샷 트리에 유사 Id 존재 → ③ 코드(필드 ID 탐색), HTML 응답 → 배포(구버전), 👎/재질문 위주 + `ok:true` → ② 프롬프트, 등.

**AI 사용(선택, 2차)**: 군집 건수가 임계치(≥5) 넘을 때만 "원인 가설 1회" 요청 — Phase 9 `_judgeCluster` 패턴. 1차 리포트엔 미포함.

## 7. 반영 루프(주기적 수동)

1. 관리자가 **🧾 이슈 리포트 모달**(31번 파일)을 연다 → 모든 샤드 병합·군집·순위 표시.
2. **[내보내기]** → 백엔드 `/issue-export`가 `C:\SAP_DMS\SAP이슈\digest_<날짜>.json`에 저장(브라우저 다운로드 금지 원칙 준수).
3. Claude에게 "이슈 정리해줘" → Claude가 그 파일을 읽어 군집별 원인 진단 + 수정안 제시.
4. 층별 처리:
   - ③ 코드: Claude가 수정 → 사용자가 검토 후 `main` 반영(현행 운영 방식 그대로).
   - ② 프롬프트: "필수 규칙 append 구간"에 추가(템플릿 안쪽 아님 — 팀 커스텀 프롬프트 덮어쓰기 함정).
   - ① 지식: 10-B에서 Drive `knowledge.json`으로(§10).
5. 해결한 군집은 리포트에서 **"해결됨(버전 표시)"**로 표시 → 이후 같은 시그니처가 그 버전 이후에도 나오면 "재발"로 강조 → 효과 측정.

## 8. 파일 배치 (협업 확정 시 경계가 되도록)

| 파일 | 역할 | 비고 |
|---|---|---|
| `js/30-issue-collector.js` | fetch 래퍼, outbox, 사용자 반응 훅, 마스킹, Drive 업로더 | 신규 |
| `js/31-issue-report.js` | 관리자 리포트 모달(병합·군집·순위·내보내기) | 신규 |
| `kortek_backend.py` | `after_request` 훅, `issue_events.jsonl`, `/issue-drain`·`/issue-ack`·`/issue-export` | 블록 하나로 격리 |
| `sap_bridge_32.py` | `_capture_failure_snapshot()`, (점진) `_stage()` | 기존 함수 본문은 거의 안 건드림 |
| `04g/04h` | 🚩 버튼 렌더 + 반응 훅 호출 각 1~2줄만 | 거대 파일 확장 금지 |
| `docs/phase10-…md` | 이 문서 | |

- `_SELF_UPDATE_FILES`/zip 목록: `kortek_backend.py` 변경분만 해당(신규 배포 파일 없음). `.gitignore`에 `issue_events.jsonl` 추가.
- `GANTT_CHART_V02_Color.html`: script 2개 추가 + 캐시버스터 갱신(관례).

## 9. 위험 / 함정 (미리 알고 있는 것들)

| 위험 | 대응 |
|---|---|
| 커스텀 헤더 → CORS preflight 실패(구버전 백엔드 전체 마비) | 쿼리 파라미터 `_rid` 사용(§3-A) |
| 수집 코드 자체가 버그를 만들어 SAP 기능을 방해 | 전 구간 try/catch, 래퍼는 원 `fetch` 결과를 항상 그대로 반환, 기능 플래그(`gantt_issue_collect_off`)로 즉시 끄기 |
| 스냅샷이 오래 걸리거나 SAP를 방해 | 읽기 전용, 2초·200노드 상한, 실패해도 무시. **팝업이 떠 있는 실패 순간에도 `Children` 조회만** 수행 |
| 기밀(자재·단가·협력사) 유출 | 마스킹 공통 함수 + 필드 값 미저장 + 샤드에 실명은 파일명에만. 저장 전 "마스킹 후 5자리↑ 숫자 잔존" 단위 점검 |
| 동시 SAP 세션 충돌로 생긴 가짜 실패가 학습을 오염 | 같은 시각대에 SAP 호출이 겹친(백엔드 요청 중첩) 이벤트에 `concurrent_session_suspect` 플래그, 순위 점수에서 가중 하향 |
| 사용자 오타·개인 환경 이슈가 "규칙"으로 굳음 | 자동 적용 없음 + 순위에 영향 사용자 수 반영 |
| Drive 프로젝트 목록 조회가 새 폴더를 스캔 | `Backups/` 하위 배치(§5) + 04b 필터 재확인 |
| 이벤트 폭주 | 성공 호출 미기록, 동일 시그니처는 1분 내 중복을 `count`로 합침 |
| 백엔드가 꺼져 있거나 구버전이면 drain 실패 | 조용히 스킵, outbox는 localStorage에 유지(상한 300) |

## 10. 구현 순서와 검증

**10-A (이 문서의 1차 범위)**
1. 마스킹 유틸 + 이벤트 스키마 + 단위 점검(브라우저 콘솔) — 실제 마스킹 통과 검증.
2. 백엔드 훅 + JSONL + `/issue-drain`·`/issue-ack` — `curl`로 왕복.
3. 프런트 fetch 래퍼(+outbox) — **구버전 백엔드(훅 없음)와 함께 켜서 SAP 호출이 안 깨지는지** 먼저 확인.
4. 브릿지 스냅샷 — 사용자 SAP 세션에서 일부러 실패 유도(존재하지 않는 자재)해 스냅샷 크기/시간/마스킹 확인(라이브 검증은 사용자).
5. Drive 샤드 업로드 + 중복 제거 — 같은 이벤트 2회 업로드해도 1건인지.
6. 🚩/👎/재질문/인터럽트 훅.
7. 리포트 모달 + `/issue-export` — 실제 수집 데이터로 군집 확인.

**10-B (데이터가 쌓인 뒤)**: 지식층(`knowledge.json`, tcode별 노하우 카드 → 프롬프트 주입, 승인 이력), AI 원인 가설, 해결됨/재발 추적 고도화.

**검증 원칙**: 각 단계마다 "수집을 끈 상태와 켠 상태에서 기존 SAP 기능(BOM/ZMM009/문서열기)이 동일하게 동작"하는지 회귀 확인. SAP 실제 실행은 이 harness가 못 하므로 사용자 확인 필요.

## 11. 열린 결정 (확정 후 구현 시작)

1. **저장 위치**: `Backups/SAP_Issues/`(제안) vs 새 루트 폴더 + 04b 제외 목록 정리.
2. **사용자 식별**: 파일명·이벤트에 실명 사용(TaskInbox 관례, 제안) vs 해시 별칭(더 익명).
3. **🚩 신고 노출 범위**: SAP/구매오더 답변에만 vs 모든 AI 문답 답변(통합 범위와 일치, 제안).
4. **qa 이벤트에 답변 앞 200자 저장 허용 여부**(마스킹 후) — 기밀 정책 확인 필요.
5. **1차 수집 항목 우선순위**: 전부(§3-A~D) vs 3-A/B/C(SAP 실패 자동 수집)만 먼저 하고 3-D(반응)는 2차.
6. **관리자 범위**: 리포트 모달을 관리자 비밀번호 게이트 뒤에 둘지(제안) — 나중에 협업 시 역할 분리 기준이 됨.

## 12. 구현 결과 (2026-09-21, 10-A) — 편차 · 운영 방법 · 미검증

### 12-1. 확정된 결정(§11)과 구현
1. 저장 위치 `Backups/SAP_Issues/` — 제안대로. 2. 실명 사용 — 제안대로(파일명 `issues_<이름>_<YYYYMM>.json`). 3. 🚩은 모든 AI 문답 답변에 — 제안대로.
4. **AI 문답 답변 본문은 저장하지 않음**(정책 미확정이라 보수적으로) — 마스킹한 질문 앞 160자 + 길이만. 필요해지면 `_issueLogQa`에서 켤 수 있음.
5. 수집 전부(3-A~3-D) 포함. 6. 리포트 모달은 관리자 비밀번호 게이트(`verifyAdminPassword`).

### 12-2. 설계 대비 편차
- **프런트 이벤트는 "백엔드가 못 보는 것"만**: `fe_network_fail`(타임아웃 포함), `fe_stale_backend`(JSON 아닌 응답). 백엔드가 본 실패는 백엔드가 기록(중복 방지) — 리포트에서 같은 `rid`로 연결.
- **`ai_fail`(callAiBackend 실패) 이벤트는 미구현** — 다음 단계.
- `_stage()` 표지는 `fetch_bom`(bom_layout/bom_dump)에만. 진단이 모호했던 지점부터 점진 추가.
- **레이아웃 적용 진단을 이번에 실제로 구현**: `docs/sap-lookup.md`의 2026-09-17 항목("적용 실패 사유를 결과 헤더에 남김")은 문서에만 있고 코드에는 없었다(커밋 이력으로 확인).
  `_sap_select_alv_layout`이 `(성공, 진단)`을 반환하고 `fetch_bom`이 `[레이아웃: "X" 적용 실패(사유) — 화면 기본값 사용]` 헤더 + `layoutApplied/layoutRequested/layoutDiag`를 돌려준다 → 백엔드가 `degraded_layout` 이벤트로 기록.
- 백엔드 응답에는 `snapshot`/`stage`를 싣지 않는다(이벤트 로그로만). `layoutApplied` 등은 응답에 남지만 프런트는 무시.
- 추가 엔드포인트: `GET /issue-drain`, `POST /issue-ack`, `POST /issue-export`. 새 배포 파일 없음(zip/`_SELF_UPDATE_FILES` 목록 변경 불필요).

### 12-3. 파일
`js/30-issue-collector.js`(수집·업로드·🚩), `js/31-issue-report.js`(리포트), `kortek_backend.py`("Phase 10 이슈 수집" 블록), `sap_bridge_32.py`(`_capture_failure_snapshot`, `_stage`),
`04g`(🚩 버튼 1줄), `04h`(인터럽트 훅 1줄), `04j`(메뉴 문구), HTML(스크립트 2개 + ⚙️설정 → "🧾 SAP·AI 이슈 리포트").
로컬 우편함 `issue_events.jsonl`/`issue_events.cursor`는 `.gitignore`.

### 12-4. 주기적 운영 (당신 → Claude)
1. ⚙️ 설정 → **🧾 SAP·AI 이슈 리포트**(관리자 비밀번호) → 군집·순위 확인 → **📤 내보내기**.
2. Claude에게 "이슈 정리해줘" → `C:\SAP_DMS\SAP이슈\digest_<날짜>.json`을 읽고 군집별 원인 진단·수정 제안.
3. 수정·반영 후 해당 군집의 **해결됨** 버튼 → 이후 같은 시그니처가 다시 나오면 🔁 재발 표시.
- 수집을 즉시 끄기: 브라우저 콘솔에서 `localStorage.setItem('gantt_issue_collect_off','1')`.

### 12-5. 검증 현황
- **자동(모킹) 검증 완료**: 백엔드(Flask test client + 가짜 브릿지) 9개 시나리오 — 실패/성공/degraded/HTML 404/마스킹/drain·ack·재전송/export.
  브릿지 스냅샷(가짜 COM 세션) — 필드 값 미저장, 상태바·메일·숫자 마스킹, 메뉴바 미하강, 200노드·24KB 상한, 세션 없음 → None, 레이아웃 진단 4종.
  프런트(브라우저 + 가짜 Drive/백엔드) 41개 — fetch 래퍼(`_rid`, 원본 응답/예외 그대로), 마스킹, 반응 훅, 업로드·중복 제거·ack, 군집·재발, 리포트 모달·해결됨·내보내기, 🚩 UI, 실제 `sendGanttQaMessage` 인터럽트 경로.
- **실제 환경 검증 필요(이 harness는 SAP/Drive 라이브 접근 불가)**: ① 실제 SAP에서 일부러 실패 유도(없는 자재번호 등) 후 스냅샷 크기·소요시간·마스킹, ② 실제 Drive 업로드(권한/폴더 생성), ③ 구버전 백엔드와 새 프런트 조합에서 SAP 호출이 안 깨지는지, ④ `Backups/SAP_Issues`가 프로젝트 목록 조회에 안 잡히는지(04b `_listProjectFiles`).

### 12-6. 실운영 첫 결과와 후속 수정 (2026-09-21)
- 실환경에서 첫 이벤트가 수집됨: SAP GUI가 꺼진 상태의 `/sap-fetch` 실패(COM -2147221020) → **수집 → Drive 샤드 → 리포트 → 내보내기 전 구간이 실제로 동작**함을 확인.
- 이 사례로 두 가지를 고침: ① 하이픈 없는 10자리 숫자(COM 오류코드)가 `#biz`로 오마스킹되던 것 → 하이픈 형태(`123-45-67890`)만 `#biz`, 나머지는 `#` ② **사용자 환경 문제**(SAP 미실행/미로그인/스크립팅 미설정/32비트 런타임)를 "환경(코드 문제 아님)"으로 분류하고 순위 점수를 ×0.3로 낮춤(digest에 `isEnvIssue`).
- 내보내기를 **로컬(`C:\SAP_DMS\SAP이슈\`, Claude가 읽는 파일) + Drive(`Backups/SAP_Issues/digest_<날짜>.json`, 팀 공용) 양쪽**에 저장(같은 날은 덮어쓰기, 한쪽 실패해도 다른 쪽 진행). 원본 이벤트 샤드는 처음부터 Drive에 있음.

