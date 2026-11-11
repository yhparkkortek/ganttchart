# 🔁 인계 — Document 페이지 (2026-11-11)

**이 파일은 남은 일이 다 비면 지운다.** 앞선 인계 메모들과 같은 규칙.

---

## ✅ 오늘 끝난 것

| 한 일 | 검증 |
|---|---|
| 🔌 **백엔드 재시작** (PID 16108, 11:16 기동) | `/gw/open-doc`·`/doc/docx`·`/sap-doc-batch-progress`·`/nas/docroot-auto`·`/daily/config` 전부 200 — **404 가 아니다** |
| 💾 원본저장(.docx) 실제 통과 | 돌고 있는 백엔드로 **36,950바이트 진짜 .docx**(앞 2바이트 `PK`) |
| 🎨 원본저장 버튼 팔레트 | 헤더 버튼 넷이 같은 배경·글자색, 테마(파랑·빨강)를 **같이** 따라옴 |
| 📍 드롭다운 자리 | PARTS 와 같은 규칙(`left +0` · `top +4`)으로 트리거 **아래**에 뜸 |

⚠️ 백엔드는 **저장소 폴더에서 바로 돈다**(`GitHub\ganttchart\kortek_backend.bat`) —
`/self-update` 없이 올린 코드가 바로 반영된다. 시작은 시작프로그램과 같은
`wscript kortek_backend_start_minimized.vbs`.

⚠️ 재시작하면 **NAS DSM 세션이 끊긴다** — 앱을 열면 js/57 `nasLoginOnce` 가 스스로
1회 로그인한다(로그인 예산은 건드리지 않았다: 3/3).

---

## ✅ 끝난 일 ①  "샘플 의뢰서 / Sample Report 중복" — **목록에서 숨겼다**

**사용자 결정(2026-11-11): 아래 셋 중 2번.** `DOC_FORMS` 의 `proto-req` 항목에 `hidden: true`
한 줄. 거르는 자리는 **`window._docVisibleForms()` 하나**이고 쓰는 곳은 셋 —
드롭다운 · 처음 고르는 서식 · NAS 폴더 만들기.

- ⚠️ **지우지 않았다** — 출고 이력의 주인(`HIST_FORM='proto-req'`)이고 구역 묶음
  (`_protoReqSections()`)도 거기 있다. 되돌리려면 **그 한 줄만** 지우면 된다.
- ⚠️ **숨긴 서식은 NAS 폴더도 안 만든다**(아무도 못 올리니 빈 폴더만 남는다).
  이미 만들어 둔 `…/시제품 제작의뢰서` 폴더는 **그대로 남아 있다** — 지우지 않았다.
- ⚠️ 그 서식으로 적어 둔 칸 값(`tabData.documents['proto-req'].fields`)은 **파일에 그대로**
  있지만 숨긴 동안엔 화면에서 못 본다(출고 이력은 Sample Report 에서 계속 보인다).
- 코드가 직접 고르면(`_docPick('proto-req')`) **여전히 그려진다** — 거르는 건 목록뿐이다.

검증: `__docPageTest` **86/86** · `__resRoundTest` **164/164** ·
돌연변이(`hidden: true` 제거) → 정확히 2건 실패.

⚠️ 그러면서 `tests/document-page.browser.js` 의 **낡은 기대값 3건**이 드러났다(어제 바꾼 것을
이 하네스엔 안 반영했었다) — 구역 6→**7개**(지원 해상도) · `문서 출력` →**`원본저장`** ·
"폴더 이름에 프로젝트 코드가 들어간다" →**안 들어간다**(공용 규칙). 전부 지금 모습으로 고쳤다.
그리고 "고르면 드롭다운이 닫힌다" 는 **inline `style.display`** 를 보고 있었는데, 다시 그린
팝업은 inline 이 비어 있고 `.row-action-popup` **CSS** 가 숨긴다 — `getComputedStyle` 로 고쳤다.

<details><summary>그때 적어 둔 판단 근거 (접어 둠)</summary>

### 🔶 (원문) "샘플 의뢰서 / Sample Report 중복" — 사람이 정할 것

사용자 신고(2026-11-11): *"샘플 의뢰서 Sample report 중복이니 확인해줘"*

### 실측 — 중복은 **같은 구역 이름이 두 번 나오는 게 아니다**

구역 제목을 전수로 세어 보면 **세 서식 모두 중복 제목 0건**이다. 진짜 모양은 이것:

```
proto-req     (7구역)  : 출고이력 · 시제품 제작의뢰서 · 광학/펌웨어 · 해상도 · 주요자재 · 요청사항 · 참고자료
sample-report (20구역) : 표지 ┃ ↑ 저 7구역이 **통째로** ┃ 라벨사양 · 검토내역서 ×2 · 광학측정 ·
                         OSD · 외관 · 내부 · 개선요청 · 제작특이사항 · SPL Check sheet · 디버깅
```

즉 **Sample Report 안에 시제품 제작의뢰서가 들어 있다**(`_protoReqSections()` 를 둘이 같이 쓴다).
그래서 드롭다운에 둘 다 있으면 "같은 내용을 두 번 쓰는 것처럼" 보인다.

### ⚠️ 이건 버그가 아니라 **원본 문서가 그렇게 생겼다**

실측 원본 `260929_LNW_S32_…_Proto B_Sample Report_V00.docx` 의 표 구성:

```
TABLE#2  # 문서 구성
TABLE#3  시제품 제작의뢰서      ← Sample Report 의 ①번째 구성
TABLE#6  시제품 검토 내역서(시제품팀)
TABLE#13~18  SAMPLE CHECK SHEET 6장
```

Sample Report 는 **의뢰서를 품은 묶음 문서**다. 그래서 `_protoReqSections()` 를 한 번 만들어
둘이 같이 쓰게 해 뒀다(베끼면 한쪽만 고쳐진다 — CLAUDE.md 의 js/67 줄에 그 경고가 있다).

### 고르는 길 셋 — **사용자에게 물어볼 것**

1. **그대로 둔다** — 의뢰서만 따로 뽑아 쓰는 일이 있으면 둘 다 필요하다.
2. **드롭다운에서 `시제품 제작의뢰서` 를 감춘다** — Sample Report 안에서만 쓴다.
   `DOC_FORMS` 항목에 `hidden: true` 한 줄이면 된다(데이터).
3. **Sample Report 에서 그 7구역을 뺀다** — ⚠️ 원본과 달라진다. 권하지 않는다.

→ **사용자가 2번을 골랐다**(위 "끝난 일 ①").

</details>

---

## ✅ 폴더 이름 — 공용 규칙으로 돌렸다 (2026-11-11)

사용자 신고: *"폴더 트리(폴더명) 재검토 / 헤더에 적히는 폴더명도 이상하고 / 신규 생성되는
프로젝트 폴더 형식도 기존 다른 것들과 상이함 / 프로젝트 코드는 포함되지 않았음"*

**실측으로 본 어긋남** — NAS 에 이미 있던 것들:

```
CUSTOMER/  LNW_STELLAR32_32.0 · KONAMI_KGP-4_55.0 · LNW_Digital Wheel Back-Box Display_32.0
SUMMARY/   LNW_STELLAR32_32.0 · KONAMI_55.0
DOCUMENT/  G2608OB_LNW-STELLAR32_1641445-ALT1      ← 나 혼자 달랐다
```

세 군데가 어긋나 있었다 — ① 프로젝트 코드가 앞에 붙고 ② `>` 를 `-` 로 바꿔 `LNW-` 가 되고
③ 모델명 자리에 KTK PN(`1641445-ALT1`)이 들어갔다.

**원인**: 앱엔 이미 **공용 함수**가 있는데(`window._dsCurrentProjectFolderName()`, js/48 —
프로젝트 파일 이름에서 `.json` 뗀 것) js/67 이 그걸 안 쓰고 **따로 조립**했다.
CUSTOMER·SUMMARY·MC 는 전부 그 함수를 쓴다.

→ 공용 함수를 쓰게 고쳤고, 탐색기 탭·제목도 `_dsProjectAwareFolders`(js/48)가 만들게 했다.

```
DOCUMENT/LNW_STELLAR32_32.0/SAMPLE REPORT      ← 이제 CUSTOMER 와 같은 꼴
탐색기 탭:  📌 LNW_STELLAR32_32.0  ·  📁 DOCUMENT (전체)     ← 전엔 제목이 'Document' 한 마디
```

⚠️ **옛 이름 폴더는 비어 있었다**(하위 3개 전부 파일 0개) — 그래서 이사할 게 없었다.
   `DOCUMENT/G2608OB_LNW-STELLAR32_1641445-ALT1` 빈 껍데기는 **NAS 에 그대로 남아 있다**.
   `/doc/delete` 는 **파일만** 지우므로 빈 폴더는 안 지워진다 → 탐색기나 파일 탐색기에서
   사람이 지우면 된다(급하지 않다).

⚠️ 프로젝트를 **안 연 상태**(새 창·하네스)에서는 공용 함수가 `null` 을 주므로
   `고객사_모델명` 으로 떨어진다 — 그 자리는 그대로 뒀다.

---

## 🔶 남은 일 ②  아직 눈으로 못 본 것

- 🔗 **의뢰서 열기**(`/gw/open-doc`) — 라우트는 200 이지만 **전용 크롬에 실제로 탭이 뜨는 것은
  미확인**. 출고 이력 줄의 `🔗 의뢰서 열기` 를 한 번 눌러 볼 것.
- 💾 **원본저장이 만든 .docx 를 워드로 열어 본 적이 없다** — 바이트는 진짜지만
  (python-docx 로 되읽어 제목·표·차례까지 확인) **원본과 글꼴·칸 너비·로고는 다르다**.
  "원본이랑 다르다" 면 그 .docx 를 **서식 파일로 NAS 에 두고 값만 채우는** 방식으로 바꿔야 한다.
- ✅ 점검표를 `점검요청만` 으로 접은 상태의 **인쇄** 모양 — 지금은 접힌 그대로 찍힌다.

---

## 🧪 이 페이지의 하네스

```
브라우저 콘솔:  await __resRoundTest()      → tests/resolution-and-rounds.browser.js  164/164
                await __docPageTest()        → tests/document-page.browser.js           65/65
py -3 tests/test_doc_docx.py                 → 16/16  (가짜 0개)
py -3 tests/test_gw_open_doc.py              → 21/21
```

⚠️ `__resRoundTest` 는 **실제 프로젝트가 열려 있으면 거부한다**(합성값으로 바꾸므로).
⚠️ 색·자리 같은 모습 검사는 **고정 hex/px 를 박지 말 것** — "넷이 같은가 · 테마를 바꾸면
   같이 바뀌는가 · PARTS 와 간격이 같은가" 로 본다(테마는 PC 마다 다르게 저장돼 있다).
