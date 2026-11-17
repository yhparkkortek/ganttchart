# 📎 파일 불러오기 — 드래그앤드롭 전수 조사 + JIRA 첨부 열기/저장 (2026-11-12)

사용자 요청: "파일 선택 버튼에 드래그앤드롭을 추가하고, **앱 전체**에서 파일을 불러오는 다른
자리도 찾아서 같이 적용해달라." 아래는 `type="file"` 입력·동적 생성을 **저장소 전체에서**
grep으로 찾아 만든 전수 목록이다(이 앱은 번들러가 없어 `grep -rn 'type="file"\|\.type = .file.'`
로 전부 잡힌다 — 숨겨진 모듈이 없다).

## ✅ 이미 드래그앤드롭이 있던 자리 (손 안 댐)

| 자리 | 파일 | 드롭 범위 |
|---|---|---|
| 🟩 프로젝트 엑셀 불러오기 | `kortek_pm.html` `#file-input` | **페이지 전체**(`js/04f`) — 어디에 떨어뜨려도 간트 엑셀로 연다 |
| 📧 메일 파일첨부 탭 | `kortek_pm.html` `#mf-input`/`#mf-dropzone` | 그 탭의 드롭존 |
| 💬 AI 문답 첨부 | `js/04h` `#gantt-qa-file-input` | 모달 박스 전체(`ondragover`/`ondrop`) |
| 🗂 PARTS 항목 추가(AI 추출) | `js/22d` `#pc-add-file` | `#pc-add-dropzone` |
| ⚡ Elec Parts 항목 추가(AI 추출) | `js/22e` `#ep-add-file` | `#ep-add-dropzone` |
| 🧾 M.C Table 엑셀 가져오기 | `js/45`(워크북 파싱) → 트리거는 `js/42` `pageExcelImportPick` | 공용 "📊 엑셀" 버튼(`_pxBindDrop`, 2026-11-11) |
| 📄↔📊 페이지 엑셀 왕복(전 페이지 공통) | `js/42` | "📊 엑셀" 버튼 자체가 드롭존(`_pxBindDrop`) |
| 📁 NAS 자료실 브라우저(올리기) | `js/48` `_dsBox` | 브라우저 창 전체 |
| 📒 Project list 문서함 | `js/55` `#pl-doc-file`/`#pl-doc-drop` | 그 칸의 드롭존 + `wrap`(행 드래그) |
| 📔 일일 업무보고 첨부 | `js/59` | `document` 레벨(`#daily-modal` 열려 있을 때만) |
| 📄 Document 페이지 첨부(`kind:'attach'`) | `js/67` `[data-doc-att]` | 각 첨부 구역 |

## 🆕 이번에 추가한 자리 (빠져 있던 곳)

- **🪐 JIRA 첨부 저장(업로드)** — `js/70-jira-tab.js`, 상세 모달의 `#jira-attach-dropzone`.
  어제(2026-11-11) 새로 만든 입력칸이라 클릭 전용이었다. PARTS/Elec Parts와 같은 모양
  (점선 테두리 + 배경색 전환)으로 맞췄다. ⚠️ **전역 드롭(js/04f)과 겹치지 않게 `stopPropagation`
  필수** — `js/42`의 `_pxBindDrop` 주석이 남긴 경고와 같은 이유(안 막으면 "간트 엑셀로
  프로젝트 전체 덮어쓰기"가 같이 돈다).
- **📷 Summary 탭 제품 사진 추가** — `js/22i-brief-mc-common-2.js` `#prod-img-add`.
  옆에 있는 형제 기능(PARTS·Elec Parts 항목 추가의 사진 칸)은 이미 드래그앤드롭이 있었는데
  이 자리만 클릭 전용이었다 — **같은 기능이 다르게 생기면 안 된다**는 기존 원칙(js/43 교훈)을
  그대로 적용해 똑같은 모양(`ondragover`/`ondrop` 인라인, `#e9eef3` 배경 전환)으로 맞췄다.
  드롭 핸들러는 `window._prodImgHandleFileDrop` — 기존 click 경로(`_uploadProductImage`)와
  **같은 함수**를 호출해 두 경로가 갈라지지 않는다.

## 🔍 검토했지만 보류한 자리(이유와 함께)

- **🚩 이슈 리포트 패치 적용**(`js/31-issue-report.js` `window._issueApplyPatch`) — 관리자
  비밀번호가 필요한 내부 진단 도구다. 눈에 보이는 드롭존 모양의 영역이 없고(버튼 하나가
  눌릴 때 숨은 input을 만들어 바로 클릭하는 방식), 사용 빈도도 극히 낮다 — 새 UI 영역을
  만들면서까지 넣을 가치가 지금은 없다고 판단했다.
- **📂 Document 페이지 "불러오기"**(`js/67` `window._docImportPick`) — 헤더의 작은 버튼 하나일
  뿐 지정된 드롭 영역이 없다. 같은 페이지의 📎 첨부 구역([data-doc-att])은 이미 드래그앤드롭이
  된다 — 요청이 오면 본문 영역 전체를 드롭존으로 확장하는 걸 다음 후보로 남긴다.

## 📎 덧붙여 — JIRA 첨부 "연결 프로그램으로 열기" (사용자 요청)

첨부를 클릭하면 이미지가 아닌 한(엑셀 등) **연결 프로그램으로 바로 연다** — NAS 쪽
(`/nas/app/open-native`, `/doc/open-native`)과 같은 UX다. 다만 그쪽들은 파일이 이미
로컬/NAS에 있어서 `os.startfile(그 경로)` 한 줄이면 끝나는데, **JIRA 첨부는 원격 HTTP라
먼저 받아야 한다** — 그래서 새 함수 `jira_bridge.open_attachment_native(url, filename)`이
① 화이트리스트 검사를 거친 `fetch_attachment`로 바이트를 받고 ② `%TEMP%\kortek_jira_attachments\`
에 1부만 쓰고(같은 이름이면 덮어써 쌓이지 않는다) ③ `os.startfile()`로 연다. 백엔드 라우트는
`POST /jira/attachment/open-native`. 실패하면(Windows 아님·백엔드 오류) 조용히 끝내지 않고
기존 다운로드 링크로 되돌아간다(`_dsOpenNative`의 폴백과 같은 모양) — `window._jiraOpenAttachmentNative(i)`.

이미지 첨부는 그대로 새 탭(브라우저가 바로 보여줄 수 있어서 "연결 프로그램"을 거칠 이유가
없다).

✅ **실제 서버로 확인함**(2026-11-12) — `GABJQ-4`의 jpg 첨부 1건을 실제로 내려받아
`%TEMP%\kortek_jira_attachments\스크린샷 2026-11-06 135616.jpg`(127,023바이트, 원본과
일치)로 쓰고 `os.startfile`까지 성공(예외 없음 — 사진 뷰어가 실제로 열렸을 것이다).

⚠️ **확인 못 한 것**: 엑셀 첨부로 실제로 열어 Excel이 뜨는지, 브라우저 UI에서 드롭존 애니메이션이
의도대로 보이는지는 사람이 한 번 직접 확인해야 한다(이 세션은 로컬 프리뷰 서버에 브라우저
자동화가 연결되지 않았다).

## 📋 붙여넣기(Ctrl+V) 전수 조사 (2026-11-17, "그림도 파일이 아니고 복사 붙여넣기로 가능하게
해줘 — 모든 드롭다운 전부 검토해줘")

위 표의 드롭존들을 다시 훑어 **사진/이미지를 붙여넣는 게 말이 되는 자리**를 찾았다. 클립보드에서
파일을 뽑는 로직은 공용 헬퍼로 뺐다(`js/73-clipboard-paste.js` `window._dzFilesFromClipboard` —
일일보고(js/59)가 이미 증명한 "스크린샷은 이름이 없으니 날짜로 지어 준다" 패턴을 그대로 뺀
것). "지금 이 화면이 열려 있나"는 자리마다 구조가 달라(모달 하나뿐인 곳·탭인 곳·여러 팝업이
한 상자를 공유하는 곳) 공용화하지 않고 각자 건다 — 특히 **본문을 통째로 다시 그리는 모달**
(JIRA 상세, AI 문답은 아님)에서는 `document.addEventListener`를 그 다시 그리는 함수 안에
걸면 열 때마다 쌓이므로, **모듈이 처음 로드될 때 한 번만** 걸고 "지금 그 자리가 보이나"만
매번 확인하는 걸 원칙으로 삼았다.

### ✅ 이번에 붙여넣기를 추가한 자리

| 자리 | 파일 | "열려 있나" 판정 | 파일을 건네는 곳 |
|---|---|---|---|
| 🪐 JIRA 첨부 | `js/70-jira-tab.js` | `#jira-issue-modal` display | `#jira-attach-file`에 `DataTransfer`로 얹음(⬆ 버튼을 눌러야 실제로 올라감 — 드래그와 동일) |
| 💬 AI 문답 첨부 | `js/04h` | `#gantt-qa-modal` display | `_ganttQaProcessAttachedFiles` — 드래그와 같은 처리기 |
| ⚡ Elec Parts·🗂 PARTS **사진** 칸 | `js/22e-summary-mctable-core4.js` | `#ep-add-modal` display | `_epProcessDroppedImage` — PARTS가 이 엔진을 그대로 복제해 쓰므로 한 곳만 고치면 둘 다 된다 |
| 📁 NAS 자료실 브라우저 | `js/48-doc-store.js` | `#ds-pick-modal` display | `_dsDoUpload` — 이 리스너는 모달을 **처음 만들 때 한 번만** 도는 블록 안이라 안전 |
| 📒 Project list 문서함 | `js/55-project-list.js` | `#pl-doc-drop` 요소 존재(이 페이지의 여러 팝업이 `#pl-popup` 상자 하나를 공유해 display만으론 못 가린다) | `window._plStaged`에 쌓고 `_renderStaged()` — [저장]을 눌러야 NAS에 올라감 |
| 📷 Summary 제품 사진 | `js/22i-brief-mc-common-2.js` | `#prod-img-add`의 `offsetParent`(탭이 숨겨지면 null) | `_uploadProductImage` |
| 📄 Document 페이지 첨부 | `js/67-document-page.js` | **이미 있었다** — 공용 헬퍼로 로직만 바꿔치기(이름 짓기 일관성, `stopPropagation` 추가) | `_docAttachAdd` |

### 🔍 검토했지만 보류한 자리 (이유와 함께, 이번 조사분)

- **🗂 PARTS·⚡ Elec Parts "AI로 추출" 드롭존**(`#pc-add-dropzone`/`#ep-add-dropzone`) —
  **이미지가 아니라 PDF/TXT/HTML/DOCX 전용 텍스트 추출기다**(`_pcProcessFile`/`_epProcessFile`가
  `file.text()`로 읽고, 이진이면 `_docLooksBinary`가 거부한다). 스크린샷을 붙여넣으면 매번
  "이진 파일로 보입니다" 오류만 날 것이라 추가하지 않았다 — 사진은 바로 위 "사진 칸"이 맡는다.
- **📧 메일 파일첨부 탭**(`#mf-dropzone`) — `.eml`/`.html`/`.txt` 메일 파일 **가져오기**다.
  스크린샷을 붙여넣어도 메일 파일이 될 수 없어 보류.
- **🟩 프로젝트 엑셀 불러오기**(js/04f)·**🧾 M.C Table/📄↔📊 페이지 엑셀 왕복**(js/42/45) —
  전부 엑셀(.xlsx) 전용 가져오기다. 이미지 붙여넣기는 애초에 대상이 아니다.
- **📔 일일 업무보고 첨부**(js/59) — **이미 있었다**(이번 조사의 출발점이자 참고 구현). 이미
  잘 동작하고 있어 건드리지 않았다.
