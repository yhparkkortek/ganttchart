# KORTEK 간트차트

KORTEK 사내 프로젝트 일정 관리 웹앱.  
간트차트 + 메일 자동 분석/발송 + Telegram 알람 + 주간 업무 보고 + 캘린더 + SAP 조회를 하나의 페이지에서 제공합니다.

---

## 구성

```
ganttchart/
├── GANTT_CHART_V02_Color.html  # 앱 본체 (단일 HTML)
├── styles.css                  # 전역 스타일
├── js/                         # 기능별 JS 모듈 (로딩 순서 = 실행 순서)
├── kortek_backend.py           # Flask 백엔드 (포트 5000)
├── kortek_backend.bat          # 백엔드 실행 스크립트 (Windows)
├── kortek_backend_install.bat  # 시작프로그램 등록 + 최소화 자동 실행 설치
├── sap_bridge_32.py            # SAP GUI 자동화 브리지 (32비트 Python 전용)
├── gas/Code.gs                 # Google Apps Script 프록시 소스 사본
├── matgroups.json              # 자재그룹 코드-명칭 매핑 (618건)
├── templates/                  # 승인원 양식 (xlsx, docx)
├── requirements.txt            # Python 의존성 (64비트 환경)
└── docs/                       # 기능별 상세 문서
```

---

## 처음 세팅하는 방법

### 1. 사전 요구사항

- **Python 3.x (64비트)** — [python.org](https://www.python.org/downloads/) 설치 시 "Add Python to PATH" 체크 필수
- **Google 계정** — Google Drive 저장소 접근용 (Chrome 로그인 상태)
- **인터넷 연결** — Google Drive API, AI API, CDN 라이브러리 로드

### 2. 저장소 받기

```bash
git clone https://github.com/yhparkkortek/ganttchart.git
cd ganttchart
```

### 3. 백엔드 서버 실행

`kortek_backend.bat`을 더블클릭합니다.  
최초 실행 시 필수 패키지를 자동 설치합니다 (몇 분 소요).

```
✔ flask, flask-cors, requests, cryptography, openpyxl, python-docx, xlwt
✔ SAP 조회용 32비트 Python + pywin32 + pywinauto (SAP 기능이 필요한 경우)
```

서버가 `http://localhost:5000` 에서 실행됩니다.

> **팀원 PC에 자동 시작 등록하려면** `kortek_backend_install.bat` 실행 — 시작프로그램에 등록되고 최소화 상태로 즉시 시작합니다.

### 4. 앱 열기

```bash
# 방법 A: 로컬 정적 서버로 열기 (권장)
python -m http.server 8934
# 브라우저에서 http://localhost:8934/GANTT_CHART_V02_Color.html

# 방법 B: 파일을 바로 열기
# GANTT_CHART_V02_Color.html 더블클릭
```

> 백엔드(포트 5000)가 먼저 실행 중이어야 메일·Telegram·SAP 기능이 동작합니다.

---

## 설정 파일 (로컬 전용, git 미포함)

앱 첫 실행 후 UI에서 입력하면 아래 파일이 자동 생성됩니다.

| 파일 | 내용 | 입력 위치 |
|------|------|-----------|
| `mail_config.json` | SMTP/POP3 계정 정보 | 알람 설정 → SMTP 탭 |
| `telegram_config.json` | Telegram Bot Token + Chat ID | 알람 설정 → Telegram 탭 |
| `schedule_rules.json` | 예약 발송 규칙 | 알람 설정 → 예약 탭 |
| `google_service_account.json` | Google 서비스 계정 키 | (별도 전달) |

---

## 데이터 저장

프로젝트 데이터는 **Google Drive** 에 JSON으로 저장됩니다.  
앱 로딩 시 Google 계정으로 로그인하면 팀 공용 폴더에 자동 접근합니다.

```
Drive 공용 폴더/
├── 개발1팀/project.json
├── 개발2팀/project.json
└── Backups/
    ├── 개발1팀/
    └── 개발2팀/
```

---

## AI 기능 설정

AI 문답·메일 분석에는 아래 중 하나의 API 키가 필요합니다.  
앱 내 **설정 → AI** 탭에서 입력합니다.

| 제공사 | 무료 여부 | 발급 |
|--------|-----------|------|
| Gemini (Google) | 🟢 무료 | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Groq (Llama 4) | 🟢 무료 | [console.groq.com/keys](https://console.groq.com/keys) |
| Mistral | 🟢 무료 | [console.mistral.ai](https://console.mistral.ai/api-keys) |
| OpenRouter (20개+ 무료 모델) | 🟢 무료 | [openrouter.ai/keys](https://openrouter.ai/keys) |
| OpenAI / Claude | 유료 | — |

AI 호출은 **Google Apps Script 프록시**를 경유합니다 (`gas/Code.gs`).  
GAS 배포 URL은 앱 설정에 입력되어 있으며, 코드 변경 시 Apps Script 편집기에서 **기존 배포 편집 → 새 버전**으로 재배포해야 합니다.

---

## SAP 연동

SAP GUI Scripting을 통해 자재 조회·구매오더·MB21 예약 등을 자동화합니다.

- SAP GUI가 설치되어 있고 사용자가 **미리 로그인한 세션**에서만 동작합니다.
- 자동 로그인 기능 없음 — 사람이 로그인해 둔 세션에 올라탑니다.
- SAP COM은 32비트 전용이라 `sap_bridge_32.py`를 별도 서브프로세스로 실행합니다 (`py -3-32`).

---

## 백엔드 자동 업데이트

앱 내 **설정 → 업데이트** 탭에서 `kortek_backend.zip`을 받아 백엔드 파일을 자동 교체합니다.  
`kortek_backend.zip`은 `kortek_backend.py`가 수정될 때 PostToolUse 훅이 자동 재생성합니다.

---

## 개발 관련

- **빌드 없음** — 순수 vanilla JS, `<script src="js/...">` 태그 로딩 순서 = 실행 순서
- **JS 수정 후** `GANTT_CHART_V02_Color.html`의 캐시버스터 `?v=YYYYMMDDx`를 올려야 팀원 브라우저에 반영됩니다
- **HTML 수정**은 Python `open(..., 'wb')`으로만 — PowerShell `Set-Content` 사용 시 한국어 깨짐
- AI 작업 지침: `CLAUDE.md` / 기능별 상세: `docs/*.md`
