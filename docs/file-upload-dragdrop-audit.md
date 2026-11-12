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
