# -*- coding: utf-8 -*-
# ══════════════════════════════════════════════════════════════
# ⚙️  KORTEK Backend v1.0
#    자동화 메일 · Telegram 알람 · AI 분석 서버
#    포트: 5000 단일 운영
#
#    [포함 기능]
#    /health            — 서버 상태 확인
#    /config            — SMTP 설정 저장
#    /send-mail         — 메일 발송 (SMTP)
#    /fetch-mail        — 메일 수신 (IMAPS 993, 실패 시 POP3 110 폴백)
#    /send-telegram     — Telegram 메시지 발송
#    /telegram/config   — Telegram 설정 저장/조회
#    /telegram/members  — 팀원 관리 (등록/조회/삭제)
#    /telegram/test     — Telegram 발송 테스트
#    /telegram/encrypt  — Telegram 설정 암호화 (Drive 저장용)
#    /telegram/decrypt  — Telegram 설정 복호화 (Drive 로드용)
#    /mail/encrypt      — SMTP 설정 암호화 (Drive 저장용)
#    /mail/decrypt      — SMTP 설정 복호화 (Drive 로드용)
#    /all/encrypt       — 전체 설정 암호화 (Drive 저장용)
#    /all/decrypt       — 전체 설정 복호화 (Drive 로드용)
#    /schedule          — 예약 발송 규칙 등록/조회 (GET/POST)
#    /schedule/<id>     — 예약 발송 규칙 삭제 (DELETE)
#    /sap-fetch         — [2026-09-14 신규] AI 문답 "SAP 조회" — 이미 로그인된 SAP GUI의
#                          현재 화면을 텍스트로 덤프 (SAP GUI Scripting, 비밀번호 저장 없음)
#
#    [2026-08-31 신규] 예약 발송(반복 규칙) 스케줄러
#    기존엔 "언제 보낼지" 판단을 전부 브라우저(JS setInterval)가 맡고 있어서,
#    브라우저 탭이 열려 있어야만 알람/공지가 발송됐다. 이제 브라우저는 "무엇을
#    보낼지"(규칙)만 이 서버에 등록하고, "언제 보낼지"는 서버가 1분마다 자체
#    확인해서 직접 발송한다 — 탭이 꺼져 있어도 이 서버(kortek_backend.bat)만
#    켜져 있으면 계속 동작한다. 서버가 꺼져있던 동안 지나간 시각은 그냥
#    건너뛴다(밀린 발송을 몰아서 보내지 않음).
# ══════════════════════════════════════════════════════════════

import sys
import os, json, re, poplib, imaplib, email, smtplib, hashlib, base64, html, threading, time, uuid, subprocess, shutil
import io          # 첨부를 메모리에서 바로 내려줄 때(send_file + BytesIO)
import zipfile     # 프로젝트 자료 내보내기(/doc/export-zip) — 메모리에서 zip으로 묶어 내려줌

# 💡 [2026-09-14] sap_bridge_32.py에서 겪은 것과 같은 부류의 문제(콘솔이 실제 콘솔이 아니라
#    파이프/다른 인코딩으로 연결되면 Windows에서 stdout이 cp949로 잡혀 한글 print()가
#    UnicodeEncodeError로 죽을 수 있음)를 이 파일도 예방 차원에서 방어. kortek_backend.bat의
#    `chcp 65001`은 실제 콘솔에 붙어 있을 때만 효과가 있어, 다른 실행 방식(서비스 등록,
#    다른 셸 등)에서도 안전하도록 명시적으로 재설정.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
from email.header     import decode_header
from email.utils      import parsedate_to_datetime
from email.mime.text  import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime         import datetime, timezone, timedelta
from urllib.parse     import quote

import requests
from flask      import Flask, request, jsonify, g, send_file
from flask_cors import CORS

try:
    from cryptography.fernet import Fernet, InvalidToken
    CRYPTO_OK = True
except ImportError:
    CRYPTO_OK = False
    print("[경고] cryptography 미설치 → pip install cryptography")

try:
    from google.oauth2 import service_account as _google_service_account
    from google.auth.transport.requests import Request as _GoogleAuthRequest
    GOOGLE_AUTH_OK = True
except ImportError:
    GOOGLE_AUTH_OK = False
    print("[경고] google-auth 미설치 → pip install google-auth (업무별 예약 알람의 실시간 조회 기능에 필요)")

app = Flask(__name__)
# 💡 [2026-09-14] SAP GUI Scripting(win32com)은 이 파일(64비트 Python)에서 직접 import하지 않는다
#    — 아래 /sap-fetch 라우트 바로 위 주석 참고. 32비트 전용 코드/의존성은 전부 sap_bridge_32.py 쪽.

# ── CORS: 허용 출처 제한 (보안 강화) ─────────────────────────
ALLOWED_ORIGINS = [
    "https://yhparkkortek.github.io",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8934",
    "http://localhost:8934",  # .claude/launch.json 로컬 테스트 서버(python -m http.server 8934)
    "null",   # 로컬 HTML 파일 (file://)
]

@app.after_request
def add_cors_headers(resp):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS or not origin:
        resp.headers["Access-Control-Allow-Origin"]  = origin or "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        # 📦 /doc/export-zip 이 내려주는 파일 개수 — 기본값은 커스텀 헤더를 JS에서 못 읽는다.
        resp.headers["Access-Control-Expose-Headers"] = "X-File-Count"
    return resp

# ── 공통 상수 ─────────────────────────────────────────────────
KST            = timezone(timedelta(hours=9))
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE    = os.path.join(BASE_DIR, 'mail_config.json')
TG_CONFIG_FILE = os.path.join(BASE_DIR, 'telegram_config.json')
SCHEDULE_FILE  = os.path.join(BASE_DIR, 'schedule_rules.json')
# 🆕 [2026-10-27] 프로젝트 멤버-3 기본값(FA/영업/CS 등 회사 조직상 고정 담당자, 실명+이메일) —
#    이 저장소는 GitHub Pages로 공개돼 있어 소스에 커밋할 수 없다. sap_login_config.json 등과
#    같은 패턴으로 로컬 전용 파일에서만 읽음(.gitignore). 팀원 각자 PC에 따로 둬야 함.
TEAM_DEFAULTS_FILE = os.path.join(BASE_DIR, 'team_defaults.json')
POP3_HOST      = "gw.kortek.co.kr"
POP3_PORT      = 110
# 🆕 [2026-10-16] 메일 수신 기본 경로는 IMAPS(993). 위 POP3는 IMAP이 막힌 계정용 폴백으로만 남는다.
IMAP_HOST      = "gw.kortek.co.kr"
IMAP_PORT      = 993


def humanize_mail_conn_error(e, host, port, proto):
    """받는 중 난 연결 오류를 사람이 읽는 말로. ⚠️ 어디로 붙다 실패했는지를 밝힌다.

    🐛 [2026-11-04, 사용자 제보 "토스트가 계속 나오는데 이건 뭐지요?"] 이전엔
       `[WinError 10061] 대상 컴퓨터에서 연결을 거부했으므로...` 만 그대로 실려서,
       **어느 서버인지가 안 찍히니** 사람은 비밀번호 문제로 읽는다. 받는 서버 주소가
       포트를 안 열어 둔 장비를 가리키고 있으면 계정은 멀쩡하다.
    """
    code = getattr(e, 'winerror', 0) or getattr(e, 'errno', 0) or 0
    where = '%s %s:%s' % (proto, host, port)
    if code in (10061, 111):            # ECONNREFUSED
        return (where + ' 연결 거부 — 그 서버는 이 포트를 안 엽니다. '
                '보내는(SMTP) 서버와 받는(IMAP/POP3) 서버가 다른 장비일 수 있습니다 — '
                '알람 설정 ▸ 이메일 서버 설정의 "받는 서버 주소"를 확인해 주세요. '
                '(비밀번호 문제가 아닙니다)')
    if code in (11001, 11004, -2, -3):  # 이름 해석 실패
        return where + ' 주소를 찾을 수 없습니다 — 서버 주소 철자와 사내망 연결을 확인해 주세요.'
    if code in (10060, 110) or isinstance(e, TimeoutError):
        return where + ' 연결 시간 초과 — 사내망/VPN 연결을 확인해 주세요.'
    return '%s 연결 실패 — %s: %s' % (where, type(e).__name__, e)

# ── 업무별(개별 태스크) 예약 알람 — 구글드라이브 서비스계정 읽기전용 접근 ──
#    kortek_pm.html(js/04a-core-app-globals.js의 SHARED_FOLDER_ID)과 동일한 폴더.
#    이 폴더 밑에 프로젝트 파일들과 App_Config/AddressBook_Shared.json이 들어있다.
GANTT_SHARED_FOLDER_ID     = '1ldb3Bc7dNNSKKgmNviw43aCgrvxQG9bS'
GOOGLE_SERVICE_ACCOUNT_FILE = os.environ.get(
    'GOOGLE_SERVICE_ACCOUNT_FILE',
    os.path.join(BASE_DIR, 'google_service_account.json')
)
ADDRESS_BOOK_CACHE_TTL_SEC = 300  # 주소록은 자주 안 바뀌므로 5분 캐시(매 발송 tick마다 Drive 조회하지 않도록)

# ── SMTP 기본값 ───────────────────────────────────────────────
SMTP_HOST = ''
SMTP_PORT = 25
SMTP_USER = ''
SMTP_PASS = ''
SMTP_TLS  = True

# ── Telegram 런타임 상태 (메모리에만 유지) ────────────────────
TELEGRAM_TOKEN   = ''
TELEGRAM_CHAT_ID = ''
TELEGRAM_MEMBERS = []

# ── 예약 발송 규칙 (메모리 + schedule_rules.json 영속 저장) ────
#    스케줄러 백그라운드 스레드와 Flask 요청 스레드가 동시에 건드릴 수 있어 락으로 보호.
SCHEDULE_RULES = []
_SCHEDULE_LOCK = threading.Lock()


# ══════════════════════════════════════════════════════════════
# ⚙️ 설정 로드
# ══════════════════════════════════════════════════════════════
def load_smtp_config():
    global SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            SMTP_HOST = cfg.get('host', SMTP_HOST)
            SMTP_PORT = int(cfg.get('port', SMTP_PORT))
            SMTP_USER = cfg.get('user', SMTP_USER)
            SMTP_PASS = cfg.get('pass', SMTP_PASS)
        except Exception as e:
            print(f"[경고] mail_config.json 로드 실패: {e}")

def load_tg_config() -> dict:
    if os.path.exists(TG_CONFIG_FILE):
        try:
            with open(TG_CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[경고] telegram_config.json 로드 실패: {e}")
    return {"token": "", "default_chat_id": "", "members": []}

def save_tg_config(cfg: dict):
    with open(TG_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def load_schedule_rules() -> list:
    if os.path.exists(SCHEDULE_FILE):
        try:
            with open(SCHEDULE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception as e:
            print(f"[경고] schedule_rules.json 로드 실패: {e}")
    return []

def save_schedule_rules(rules: list):
    try:
        with open(SCHEDULE_FILE, 'w', encoding='utf-8') as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[경고] schedule_rules.json 저장 실패: {e}")

# 서버 시작 시 로드
load_smtp_config()
_tg = load_tg_config()
TELEGRAM_TOKEN   = _tg.get("token", "")
TELEGRAM_CHAT_ID = _tg.get("default_chat_id", "")
TELEGRAM_MEMBERS = _tg.get("members", [])
SCHEDULE_RULES   = load_schedule_rules()


# ══════════════════════════════════════════════════════════════
# 🔐 암호화 유틸 (Fernet + SHA-256)
# ══════════════════════════════════════════════════════════════
def password_to_key(password: str) -> bytes:
    """비밀번호 문자열 → Fernet 키 (SHA-256 해시 후 Base64)"""
    hashed = hashlib.sha256(password.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(hashed)

def encrypt_data(data: dict, password: str) -> str:
    """dict → 암호화 문자열"""
    if not CRYPTO_OK:
        raise RuntimeError("cryptography 라이브러리 미설치")
    key     = password_to_key(password)
    f       = Fernet(key)
    payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
    return f.encrypt(payload).decode('utf-8')

def decrypt_data(encrypted: str, password: str) -> dict:
    """암호화 문자열 → dict"""
    if not CRYPTO_OK:
        raise RuntimeError("cryptography 라이브러리 미설치")
    key  = password_to_key(password)
    f    = Fernet(key)
    raw  = f.decrypt(encrypted.encode('utf-8'))
    return json.loads(raw.decode('utf-8'))


# ══════════════════════════════════════════════════════════════
# 📨 메일 유틸
# ══════════════════════════════════════════════════════════════
def decode_str(value):
    if not value:
        return ""
    parts, result = decode_header(value), []
    for part, enc in parts:
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(part)
    return "".join(result)

def extract_body(msg):
    body = ""
    plain_fallback = ""  # 💡 text/html 파트가 끝내 없는 텍스트 전용 메일 대비 폴백
    # 💡 [2026-08-28 버그 수정] 표(HTML table)가 있는 메일에서 "경계문자(│)로 칸을 구분해주기로 했는데도
    #    표가 여전히 알아볼 수 없게 나온다"는 지적 — 원인은 아래 우선순위였다. multipart/alternative
    #    메일은 보통 text/plain 파트도 같이 들어있는데, 그건 Outlook 등 메일 클라이언트가 "표를 이미
    #    한 줄씩 늘어놓은 형태로 미리 납작하게 만들어둔" 버전이라 칸 구분 정보가 아예 없다. 그런데 예전
    #    코드는 그 text/plain을 무조건 최우선으로 골라 썼고, 표 구조가 살아있는 text/html은 text/plain이
    #    "아예 없을 때"만 쓰는 최후 폴백으로 밀려나 있었다 — 그래서 아래 CELL_BOUNDARY 처리(표 칸마다
    #    │ 경계문자를 넣어주는 로직)가 있어도 실행될 기회 자체가 없었다. text/html을 우선으로 바꾸고,
    #    text/html이 없는 경우에만 text/plain으로 폴백하도록 순서를 뒤집는다.
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if "attachment" in cd:
                continue
            if ct == "text/html" and not body:
                charset = part.get_content_charset() or "utf-8"
                try:
                    body = part.get_payload(decode=True).decode(charset, errors="replace")
                except Exception:
                    pass
            elif ct == "text/plain" and not plain_fallback:
                charset = part.get_content_charset() or "utf-8"
                try:
                    plain_fallback = part.get_payload(decode=True).decode(charset, errors="replace")
                except Exception:
                    pass
        if not body and plain_fallback:
            body = plain_fallback
    else:
        charset = msg.get_content_charset() or "utf-8"
        try:
            body = msg.get_payload(decode=True).decode(charset, errors="replace")
        except Exception:
            body = ""
    # 💡 [2026-08-25 버그 수정] "원문 보기"에서 메일 속 표(HTML table)가 다 깨져 보인다는 지적 — 원인은
    #    두 가지였다. ① <table>/<tr>/<td>/<th> 태그를 아무 구분자 없이 그냥 다 지워버려서, 표 칸
    #    내용이 "Item1Qty1Price1"처럼 서로 다 붙어버렸음(줄바꿈 성격인 <br>/<p>/<div>만 개행으로
    #    바꿔주고 있었음). ② 그 뒤 공백·탭을 무조건 한 칸으로 압축해서, 설령 칸이 스페이스로 정렬된
    #    표(예: 고정폭 폰트 기준 정렬)라 해도 그 정렬용 공백까지 다 뭉개졌음.
    #    → 표 태그도 <br>/<p>/<div>처럼 개행/탭으로 먼저 바꿔 구조를 보존하고(①), 공백 압축은
    #    "짧은 공백(표 정렬용)"은 그대로 두고 "지나치게 긴 공백(HTML 레이아웃 찌꺼기)"만 적당히 줄이도록
    #    완화했다(②).
    # 💡 [2026-08-26 버그 수정 ③] ①②만으로는 부족했다 — 실제 메일(특히 Outlook)의 표 HTML은 보통
    #    예쁘게 들여쓰기되어 있어서 <td>...</td> 사이에 "줄바꿈+공백"만으로 된 서식용 텍스트가 이미
    #    원본에 끼어있다. 우리가 넣는 탭(\t)이 하필 그 원본 줄바꿈 바로 앞에 붙게 되고, 아래
    #    ln.rstrip()이 "줄 끝 찌꺼기"로 착각해 탭까지 같이 지워버려서 — 칸 구분자가 사라지고 칸마다
    #    다시 다른 줄로 떨어졌다. 태그 사이에 순수 공백/줄바꿈만 있는 서식용 여백을 먼저 다 걷어내서,
    #    최종적으로 남는 탭·줄바꿈은 전부 우리가 의도적으로 넣은 것만 남게 한다.
    # 💡 [2026-08-26 변경] 칸 구분자를 탭(\t) 대신 눈에 보이는 경계문자 " │ "(U+2502)로 변경 — 탭은
    #    칸 값 길이가 다르면 세로줄이 안 맞아 보이는데, │는 정렬이 아니라 "여기서 칸이 나뉜다"만
    #    항상 명확히 표시하고, 실제 메일 본문에 이 문자가 등장할 일이 거의 없어 원본과도 안 헷갈린다.
    # 💡 [2026-08-28 버그 수정 ④] 위 우선순위 수정으로 CELL_BOUNDARY가 드디어 실행되긴 했지만, 실제
    #    Outlook 표는 칸 안의 글자를 <td><p>내용</p></td>처럼 Word 문단(<p>) 태그로 감싸고, 그마저도
    #    헤더 칸처럼 한 칸 안에 문단이 여러 개( <p>Achievable</p><p>Brightness Min.</p> )인 경우가
    #    흔했다. "</p>는 무조건 개행"이라는 기존 규칙을 표 안에서도 그대로 적용하면, 칸 하나의 내용이
    #    여러 줄로 쪼개지면서 "칸 경계"가 "행 경계"와 뒤섞여버려 — 정작 한 행이어야 할 칸들이 서로
    #    다른 줄에 흩어지고(예: "칸1│칸2첫줄" 한 줄, "칸2둘째줄│칸3" 다음 줄) 표를 알아볼 수 없게
    #    나왔다. 표(<table>...</table>) 안에서는 "칸 하나 = 항상 한 줄"이 되도록, 칸 내부의 문단
    #    구분(</p>, </div>, <br>)을 개행이 아니라 공백으로 합치고, 실제 줄바꿈은 오직 행 경계(</tr>)
    #    에서만 만든다 — 표 밖 본문의 <br>/<p>/<div>는 기존처럼 그대로 개행 유지.
    # 💡 [2026-08-28 버그 수정 ⑤] 표를 고치다 같이 발견 — <style> 블록(예: Outlook의 v\:*, o\:*,
    #    w\:* VML 스타일 정의)을 태그만 벗겨내고 안의 CSS 텍스트는 안 지워서, "원문 보기"/AI 분석
    #    맨 앞에 표와 무관한 CSS 잡음(v\:* {behavior:url(#default#VML);} 등)이 그대로 섞여 나왔다.
    #    JS 쪽(_mfExtractText)은 script/style을 통째로 remove()하고 있었는데 이 백엔드만 빠져 있었다.
    body = re.sub(r"(?is)<style\b.*?</style\s*>", "", body)
    body = re.sub(r"(?is)<script\b.*?</script\s*>", "", body)
    CELL_BOUNDARY = " │ "

    def _flatten_table_block(m):
        tbl = m.group(0)
        tbl = re.sub(r"(?i)<br\s*/?>", " ", tbl)
        tbl = re.sub(r"(?i)</p\s*>|</div\s*>", " ", tbl)
        tbl = re.sub(r"(?i)</t[dh]\s*>", CELL_BOUNDARY, tbl)      # 표 칸 끝 → 경계문자(다음 칸과 구분)
        tbl = re.sub(r"(?i)</tr\s*>", "\n", tbl)                  # 표 행 끝 → 줄바꿈(칸 경계와 절대 안 섞이게)
        tbl = re.sub(r"(?i)<table[^>]*>|</table\s*>", "\n", tbl)  # 표 시작/끝도 앞뒤 글과 분리
        return tbl

    body = re.sub(r">\s+<", "><", body)
    body = re.sub(r"(?is)<table\b.*?</table\s*>", _flatten_table_block, body)  # 표는 먼저 통째로 처리(중첩 표는 미지원)
    body = re.sub(r"(?i)<br\s*/?>", "\n", body)                   # 표 밖 나머지는 기존 그대로 개행
    body = re.sub(r"(?i)</p\s*>|</div\s*>", "\n", body)
    body = re.sub(r"<[^>]+>", "", body)
    # 💡 [2026-08-28 버그 수정 ⑥] 표를 고치다 같이 발견 — &nbsp;/&lt;/&gt;/&quot;/&amp; 같은 HTML
    #    엔티티를 한 번도 실제 문자로 디코딩하지 않아서 "&lt;vbernard@lnw.com&gt;"처럼 원문이 그대로
    #    노출되고 있었다. 태그를 다 벗겨낸 "뒤"에 디코딩해야 안전하다 — 미리 디코딩하면 본문에 있던
    #    "&lt;100"(=<100이라는 뜻의 문장)이 실제 "<" 문자가 되어 버려서, 그 뒤 어딘가의 ">"와 짝지어져
    #    위 태그 제거 정규식이 그 사이를 "태그"로 오인해 지워버릴 위험이 있다.
    body = html.unescape(body)
    body = re.sub(r"[ \t]{8,}", "    ", body)     # 지나치게 긴 공백(레이아웃 찌꺼기)만 축소 — 표 정렬용 짧은 공백은 보존
    # 💡 위 문단→공백 치환(</p> → " ")이 칸 내용 끝의 원래 공백과 겹치면 CELL_BOUNDARY 자체의 앞뒤
    #    공백과 합쳐져 "내용  │  다음칸"처럼 보기 싫은 이중 공백이 생긴다 — 경계문자 바로 옆의 공백만
    #    한 칸으로 정리(표 정렬용 공백은 │가 없는 다른 위치라 이 치환의 영향을 받지 않음).
    body = re.sub(r" {2,}(?=│)|(?<=│) {2,}", " ", body)
    # 💡 국내 메일 특유의 "문장. \n \n다음문장." 패턴 — 완전히 빈 줄까지 전부 제거해 간격을 촘촘하게
    #    (앞쪽 들여쓰기/표 정렬 공백은 유지하기 위해 rstrip만 하고, 빈 줄 판정에만 strip을 씀)
    #    각 행의 "마지막 칸" 뒤에는 다음 칸이 없어 경계문자( │ )가 덜렁 남으므로 같이 정리한다.
    lines = [ln.rstrip(" \t" + CELL_BOUNDARY) for ln in body.split("\n")]
    lines = [ln for ln in lines if ln.strip()]
    body = "\n".join(lines)
    # 💡 [2026-08-24] "원문 보기"용 저장 한도. AI 분석 입력은 프론트(msCallGemini)에서 이 값과 무관하게
    #    항상 별도로 2000자로 다시 잘라 쓰므로, 여기를 늘려도 AI 분석에는 영향 없음 — 저장/표시용 한도만 확장.
    return body[:15000]

def extract_attachments(msg):
    """MIME 메시지에서 첨부파일 메타데이터({name, size, type})만 추출 — 파일 내용은 읽지 않음."""
    attachments = []
    if not msg.is_multipart():
        return attachments
    for part in msg.walk():
        cd = str(part.get("Content-Disposition", ""))
        if "attachment" not in cd:
            continue
        filename = part.get_filename()
        if not filename:
            continue
        try:
            filename = decode_str(filename)
        except Exception:
            pass
        try:
            payload = part.get_payload()
            # base64 인코딩된 경우 문자열 길이로 원본 바이트 크기를 추정
            raw_len = len(payload) if isinstance(payload, (str, bytes)) else 0
            size = int(raw_len * 3 / 4) if isinstance(payload, str) else raw_len
        except Exception:
            size = 0
        attachments.append({
            "name": filename,
            "size": size,
            "type": part.get_content_type() or "application/octet-stream"
        })
    return attachments

def matches_keyword(subject, body, keyword, keyword_from='', sender='', keyword_body=''):
    def check(text, kw):
        if not kw or not kw.strip():
            return True
        keys = [k.strip().lower() for k in kw.split(",") if k.strip()]
        return any(k in text.lower() for k in keys)

    # 각 필드 독립 AND 조건 — 입력한 필드만 필터링
    if not check(subject, keyword):       return False
    if not check(sender,  keyword_from):  return False
    if not check(body,    keyword_body):  return False
    return True


# ══════════════════════════════════════════════════════════════
# 💬 Telegram 유틸
# ══════════════════════════════════════════════════════════════
def _tg_call(method: str, payload: dict) -> dict:
    """봇 API 한 번(answerCallbackQuery·editMessageText 등). 실패는 dict 로 돌려준다 — 틱을 멈추지 않는다."""
    if not TELEGRAM_TOKEN:
        return {"ok": False, "error": "Token 미설정"}
    try:
        resp = requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/{method}", json=payload, timeout=10)
        return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


def send_telegram_msg(message: str, chat_id: str = None, reply_markup: dict = None) -> dict:
    target = chat_id or TELEGRAM_CHAT_ID
    if not TELEGRAM_TOKEN or not target:
        return {"ok": False, "error": "Token 또는 Chat ID 미설정"}
    url  = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    body = {
        "chat_id":    target,
        "text":       message,
        "parse_mode": "HTML"
    }
    if reply_markup:
        body["reply_markup"] = reply_markup      # 📥 inline 버튼(/배분) — 2026-11-08
    resp = requests.post(url, json=body, timeout=10)
    return resp.json()

def get_target_chat_ids(to=None, role=None, project=None) -> list:
    if not TELEGRAM_MEMBERS:
        return [TELEGRAM_CHAT_ID] if TELEGRAM_CHAT_ID else []
    if to == "ALL":
        return [m["chat_id"] for m in TELEGRAM_MEMBERS]
    if to:
        return [m["chat_id"] for m in TELEGRAM_MEMBERS if m.get("name") == to]
    if role:
        return [m["chat_id"] for m in TELEGRAM_MEMBERS if role in m.get("roles", [])]
    if project:
        return [m["chat_id"] for m in TELEGRAM_MEMBERS
                if "ALL" in m.get("projects", []) or project in m.get("projects", [])]
    return [TELEGRAM_CHAT_ID] if TELEGRAM_CHAT_ID else []

def send_telegram_multi(message: str, chat_ids: list) -> list:
    url, results = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", []
    for cid in chat_ids:
        try:
            resp = requests.post(url, json={
                "chat_id": cid, "text": message, "parse_mode": "HTML"
            }, timeout=10)
            results.append({"chat_id": cid, "result": resp.json()})
        except Exception as e:
            results.append({"chat_id": cid, "error": str(e)})
    return results


# ══════════════════════════════════════════════════════════════
# 🔗 API 엔드포인트
# ══════════════════════════════════════════════════════════════

# ── OPTIONS 프리플라이트 공통 처리 ────────────────────────────
@app.before_request
def handle_options():
    if request.method == "OPTIONS":
        from flask import make_response
        resp = make_response("", 204)
        return resp

# ── 헬스체크 ─────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'ok':      True,
        'service': 'kortek-backend-v1',
        'port':    5000,
        'smtp':    SMTP_USER  or '(미설정)',
        'pop3':    POP3_HOST,
        'imap':    f'{IMAP_HOST}:{IMAP_PORT}',
        'telegram': '연결됨' if TELEGRAM_TOKEN else '(미설정)',
        'members': len(TELEGRAM_MEMBERS),
        'scheduleRules': len(SCHEDULE_RULES),
        'time':    datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')
    })


# ── SMTP 설정 저장 ────────────────────────────────────────────
@app.route('/config', methods=['POST'])
def update_smtp_config():
    global SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    data      = request.json or {}
    SMTP_HOST = data.get('host', SMTP_HOST)
    SMTP_PORT = int(data.get('port', SMTP_PORT))
    SMTP_USER = data.get('user', SMTP_USER)
    SMTP_PASS = data.get('pass', SMTP_PASS)
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump({'host': SMTP_HOST, 'port': SMTP_PORT,
                       'user': SMTP_USER, 'pass': SMTP_PASS},
                      f, ensure_ascii=False)
        # 🔑 그룹웨어 자동 로그인에도 같이 저장(사용자 요청 2026-10-30) — 같은 통합 계정이다.
        #    실패해도 메일 저장은 유지하고, 결과만 응답에 실어 보여준다.
        gw_ok, gw_msg = _sync_gw_from_mail()
        return jsonify({'ok': True, 'syncedGroupware': gw_ok, 'syncMessage': gw_msg})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── 메일 발송 코어 (SMTP) — /send-mail 엔드포인트와 예약 발송 스케줄러가 공용으로 씀 ──
def _send_mail_core(to, subject, body, cc=''):
    """반환: (ok: bool, error: str|None, http_status: int)"""
    if not to:
        return False, '수신자 없음', 400
    if not SMTP_USER or not SMTP_PASS:
        return False, 'SMTP 미설정 — 알람 설정에서 SMTP를 입력하세요', 400
    try:
        msg            = MIMEMultipart('alternative')
        msg['From']    = SMTP_USER
        msg['To']      = to
        if cc:
            msg['Cc'] = cc
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html', 'utf-8'))

        recipients = [r.strip() for r in to.split(',') if r.strip()]
        if cc:
            recipients += [r.strip() for r in cc.split(',') if r.strip()]

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.ehlo()
            if SMTP_TLS:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(SMTP_USER, SMTP_PASS)
            smtp.sendmail(SMTP_USER, recipients, msg.as_string())
        return True, None, 200
    except smtplib.SMTPAuthenticationError:
        return False, '로그인 실패: 비밀번호를 확인하세요', 401
    except smtplib.SMTPConnectError:
        return False, f'서버 연결 실패: {SMTP_HOST}:{SMTP_PORT}', 503
    except Exception as e:
        return False, str(e), 500


# ── 메일 발송 (SMTP) ──────────────────────────────────────────
@app.route('/send-mail', methods=['POST'])
def send_mail():
    data    = request.json or {}
    to      = data.get('to', '').strip()
    cc      = data.get('cc', '').strip()
    subject = data.get('subject', '').strip()
    body    = data.get('body', '').strip()

    ok, err, status = _send_mail_core(to, subject, body, cc)
    if ok:
        print(f"[OK] 메일 발송 → {to} / {subject}")
        return jsonify({'ok': True})
    return jsonify({'ok': False, 'error': err}), status


# ── 메일 수신 (IMAPS 우선, POP3 폴백) ────────────────────────────
# 🆕 [2026-10-16] 평문 POP3(110) → IMAPS(993)로 전환. 실측(gw.kortek.co.kr):
#   · 993 IMAPS 열려 있고 서버는 TIMS 3.0.2.2, capabilities = IMAP4REV1 SORT SPECIAL-USE …
#   · POP3는 **날짜를 보려고 메일 전체를 받아야** 해서(헤더만 받을 방법이 없음) 느렸다.
#     IMAP은 서버가 SEARCH로 날짜를 걸러주므로 받을 메일 수 자체가 줄어든다.
#   · `select(readonly=True)` + `BODY.PEEK[]` — 사람의 실제 메일함 **읽음 표시를 건드리지 않는다**.
#     (그냥 FETCH하면 \Seen이 붙어서 "안 읽은 메일인데 읽음으로 바뀐다"는 사고가 난다)
# POP3 폴백을 남겨 둔 이유: 팀원이 각자 PC에서 자기 백엔드를 돌리고, 계정별로 IMAP이 막혀
# 있을 수 있다. 폴백이 없으면 그 사람은 메일 분석 자체가 멈춘다. 대신 **어느 경로로 받았는지
# 응답(`proto`)에 담아** 조용히 넘어가지 않게 한다(CLAUDE.md "신호를 삼키지 말 것").

# IMAP 날짜는 `01-Jan-2026` 형식 고정 — strftime('%b')는 로케일을 타서 한국어 윈도우에서
# "10월"이 나오면 SEARCH가 깨진다. 월 이름을 직접 박아 로케일 영향을 없앤다.
_IMAP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def _imap_date(d):
    return "%02d-%s-%04d" % (d.day, _IMAP_MONTHS[d.month - 1], d.year)


def _mail_parse_entry(raw, mail_user, start_dt, end_dt,
                      keyword, keyword_from, keyword_body, stage_dir=None):
    """원본 메일 바이트 → 프런트가 쓰는 결과 dict.
    반환 ('ok', dict) / ('old', None)=기간보다 과거 / ('skip', None)=조건 불일치.
    POP3 경로는 'old'를 받으면 더 과거로 갈 필요가 없어 루프를 끊는다(기존 동작 유지)."""
    msg = email.message_from_bytes(raw)
    try:
        msg_dt = parsedate_to_datetime(msg.get("Date", ""))
        if msg_dt.tzinfo is None:
            msg_dt = msg_dt.replace(tzinfo=KST)
        msg_dt = msg_dt.astimezone(KST)
    except Exception:
        return ('skip', None)
    if msg_dt < start_dt:
        return ('old', None)
    if msg_dt > end_dt:
        return ('skip', None)

    subject = decode_str(msg.get("Subject", ""))
    sender  = decode_str(msg.get("From", ""))
    body    = extract_body(msg)
    if not matches_keyword(subject, body, keyword, keyword_from, sender, keyword_body):
        return ('skip', None)

    # 💡 [우선순위 점수] 발신자가 명시한 중요도 헤더 — Outlook 등에서 "높음"으로 보낸 메일에 붙음
    importance_raw = (msg.get("Importance", "") or msg.get("X-Priority", "")).strip().lower()
    importance_high = importance_raw in ("high", "1", "1 (highest)", "2 (high)")

    # 💡 내가 To(직접수신)인지 Cc(참조)인지 — mail_user 계정 기준으로 판별.
    #    원본 대소문자를 보존한 값도 "to"/"cc"로 함께 내려준다(프런트 AI 프롬프트의 배경 정보).
    to_raw    = decode_str(msg.get("To", ""))
    cc_raw    = decode_str(msg.get("Cc", ""))
    my_addr   = (mail_user or '').lower()
    is_to_me  = my_addr in to_raw.lower()
    is_cc_me  = (not is_to_me) and (my_addr in cc_raw.lower())

    # 📬 [2026-10-22] 원본 .eml 을 staging 에 둔다 — 나중에 프로젝트가 확정되면 그쪽으로 옮긴다.
    #    ⚠️ 수신을 절대 막지 않는다(실패는 _stage_raw_mail 안에서 삼키고 None 반환).
    _fname = f"{msg_dt.strftime('%Y%m%d')}_{subject[:20]}.eml"
    if stage_dir:
        _stage_raw_mail(stage_dir, _fname, raw)

    return ('ok', {
        "subject":     subject,
        "sender":      sender,
        "to":          to_raw,
        "cc":          cc_raw,
        "date":        msg_dt.strftime("%Y-%m-%d %H:%M"),
        "body":        body,
        "fileName":    _fname,
        "importance":  importance_high,
        "isToMe":      is_to_me,
        "isCcMe":      is_cc_me,
        "attachments": extract_attachments(msg)
    })


def _fetch_mail_imap(mail_user, mail_pw, start_dt, end_dt, scan_limit,
                     keyword, keyword_from, keyword_body, stage_dir=None, host=None):
    """IMAPS로 받는다. 서버 SEARCH로 날짜를 먼저 걸러 받을 통수를 줄인다.
    ⚠️ 키워드는 서버에 맡기지 않고 기존 matches_keyword로 거른다 — IMAP SEARCH의 한글
    charset 처리가 서버마다 달라서, 검색 결과가 조용히 달라지는 위험을 피한다."""
    M = imaplib.IMAP4_SSL(host or IMAP_HOST, IMAP_PORT, timeout=20)
    try:
        M.login(mail_user, mail_pw)
        # readonly=True — 사람의 실제 메일함에 읽음 표시를 남기지 않는다
        M.select('INBOX', readonly=True)
        # BEFORE는 그 날짜 **미만**이라 종료일을 포함하려면 +1일
        typ, data = M.uid('SEARCH', None,
                          'SINCE', _imap_date(start_dt),
                          'BEFORE', _imap_date(end_dt + timedelta(days=1)))
        if typ != 'OK':
            raise RuntimeError(f'IMAP SEARCH 실패: {typ}')
        uids = (data[0] or b'').split()
        uids = uids[-scan_limit:] if scan_limit else uids   # 최신 N건만
        results = []
        for uid in reversed(uids):                          # 최신 메일부터
            try:
                typ, md = M.uid('FETCH', uid, '(BODY.PEEK[])')
                if typ != 'OK' or not md or not isinstance(md[0], tuple):
                    continue
                status, item = _mail_parse_entry(
                    md[0][1], mail_user, start_dt, end_dt,
                    keyword, keyword_from, keyword_body, stage_dir)
                if status == 'ok':
                    results.append(item)
            except Exception:
                continue
        return results
    finally:
        try: M.close()
        except Exception: pass
        try: M.logout()
        except Exception: pass


def _fetch_mail_pop3(mail_user, mail_pw, start_dt, end_dt, scan_limit,
                     keyword, keyword_from, keyword_body, stage_dir=None, host=None):
    """POP3 폴백 — IMAP이 막힌 계정/서버용. 동작은 전환 전과 동일하다."""
    M = poplib.POP3(host or POP3_HOST, POP3_PORT, timeout=15)
    try:
        M.user(mail_user)
        M.pass_(mail_pw)
        num_messages = len(M.list()[1])
        results = []
        limit = min(num_messages, scan_limit or 200)
        for i in range(num_messages, num_messages - limit, -1):
            try:
                status, item = _mail_parse_entry(
                    # 💡 파싱은 LF로 붙인 그대로 둔다(추출 본문의 줄바꿈이 바뀌면 다른 기능에 번진다).
                    #    NAS에 보관할 .eml 만 _stage_raw_mail 이 CRLF로 바꿔 쓴다(2026-10-28 아웃룩 한글 깨짐).
                    b"\n".join(M.retr(i)[1]), mail_user, start_dt, end_dt,
                    keyword, keyword_from, keyword_body, stage_dir)
                if status == 'old':
                    break          # POP3는 순서대로라 더 과거는 볼 필요 없음
                if status == 'ok':
                    results.append(item)
            except Exception:
                continue
        return results
    finally:
        try: M.quit()
        except Exception: pass


@app.route('/fetch-mail', methods=['POST'])
def fetch_mail():
    req        = request.get_json(force=True, silent=True) or {}
    mail_user  = req.get('mailUser', '')
    mail_pw    = req.get('mailPw', '')
    start_date = req.get('startDate', '')
    end_date   = req.get('endDate', '')
    keyword         = req.get('keyword', '')
    keyword_from    = req.get('keywordFrom', '')
    keyword_body    = req.get('keywordBody', '')
    max_count  = req.get('maxCount', 200)
    # 🆕 [2026-11-02, 사용자 제보 "IMAP 안 쓰고 POP3 쓰는데?"] 계정에 IMAP 권한이 없는 게 아니라
    #    처음부터 POP3 전용으로 운영하기로 한 계정도 있다 — 그런데도 매번 IMAP 인증을 먼저
    #    시도했고, 서버가 돌려주는 거부 문구가 아래 _PERMISSION_HINTS 목록에 없는 변형이면
    #    그대로 "계정/비밀번호를 확인해주세요" 오류가 떴다(권한거부를 비번오류로 오판한 2026-10-26
    #    사고와 같은 종류 — 이번엔 "아예 IMAP을 안 쓴다"는 경우까지 커버). 프런트(알람 설정의
    #    "POP3만 사용" 체크, js/22b)가 켜져 있으면 IMAP 시도 자체를 건너뛴다.
    force_proto = str(req.get('protocol', '') or '').strip().lower()
    # 🆕 [2026-11-03, 사용자 제보 "체크박스 켜도 계속 invalid user or password"] 진짜 원인은 프로토콜이
    #    아니라 **서버 주소**였다 — IMAP_HOST/POP3_HOST가 gw.kortek.co.kr로 하드코딩돼 있어, 알람
    #    설정에 kmail.kortek.co.kr처럼 다른 서버 주소를 적어 넣어도 수신(IMAP/POP3)은 그 설정을
    #    무시하고 항상 gw.kortek.co.kr로 로그인을 시도했다(발송/SMTP는 이미 설정값을 쓰고 있었다 —
    #    수신 쪽만 빠져 있었음). 그러니 계정은 멀쩡해도 "그 서버엔 이 계정이 없다"는 뜻으로
    #    invalid user or password가 떴다 — 프로토콜을 POP3로 강제해도 똑같이 gw로 가서 똑같이 실패.
    #
    # 🐛🐛 [2026-11-04 정정, 사용자 제보 "토스트가 계속 나오는데 이건 뭐지요? [WinError 10061]"]
    #    바로 위 11-03 수정은 **원인을 잘못 짚었다.** 포트를 찍어 보니 보내는 서버와 받는 서버가
    #    아예 다른 장비였다 — 알람 설정에 적는 그 주소(SMTP)는 465/25만 열려 있고 993/995/110/143은
    #    전부 거부한다. 그래서 수신에 그 주소를 물려주자 "invalid user or password"가 **연결 거부**로
    #    바뀌었을 뿐이고(60초마다 재시도 → 토스트 반복), 원래 인증 오류의 진짜 원인은 아직 모른다.
    #    → 수신 서버 주소는 **따로 받는다**(`recvHost`). 비어 있으면 IMAP_HOST/POP3_HOST 기본값.
    #      발송 주소(`mailHost`)를 수신에 물려주는 길은 **끊는다** — 다른 장비일 수 있으므로
    #      "안 적었으면 발송 주소로 간다"는 추측이 바로 이 사고였다. 구버전 프런트가 보내는
    #      mailHost 는 조용히 무시하지 않고 `ignoredMailHost` 로 응답에 드러낸다.
    recv_host  = str(req.get('recvHost', '') or '').strip() or None
    mail_host  = recv_host
    _ignored_mail_host = str(req.get('mailHost', '') or '').strip() or None

    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=KST)
        end_dt   = datetime.strptime(end_date,   "%Y-%m-%d").replace(
                       hour=23, minute=59, second=59, tzinfo=KST)

        scan_limit = max_count or 200
        # 📬 원본 .eml staging 경로 — 저장소 미설정이면 None(보관을 그냥 건너뛴다)
        _stage_dir = _docstore_mail_stage_dir()

        # IMAPS 우선 — 실패하면 POP3로 폴백한다. 폴백은 "조용히" 하지 않고 `proto`/`fallback`에
        # 담아 올려보내, 어느 경로로 받았고 왜 넘어갔는지 화면에서 확인할 수 있게 한다.
        proto, fallback_reason = 'imaps', None
        if force_proto == 'pop3':
            proto, fallback_reason = 'pop3', '사용자 설정(수신은 POP3만 사용)'
            results = _fetch_mail_pop3(mail_user, mail_pw, start_dt, end_dt, scan_limit,
                                       keyword, keyword_from, keyword_body, _stage_dir, mail_host)
        else:
            try:
                results = _fetch_mail_imap(mail_user, mail_pw, start_dt, end_dt, scan_limit,
                                           keyword, keyword_from, keyword_body, _stage_dir, mail_host)
            except imaplib.IMAP4.error as e:
                # 🐛🐛 [2026-10-22 실사용 버그수정, 사용자 제보 "자동 메일 수집이 안 된다"]
                #    여기서 IMAP4.error 를 **전부 "비밀번호가 틀린 것"으로 단정**해 POP3 폴백을 막고 있었다.
                #    그런데 이 서버가 돌려준 건 `have no permission.` — 비밀번호가 아니라 **그 계정에
                #    IMAP 사용 권한이 없다**는 뜻이다(다우오피스/TIMS 계열은 계정별로 관리자가 켠다).
                #    바로 위 주석이 "계정별로 IMAP이 막혀 있을 수 있어 POP3 폴백을 남긴다"고 적어 둔
                #    **그 경우인데, 코드가 그 길을 막고 있었다**(의도와 코드가 어긋남).
                #    결과: 10-16 IMAPS 전환 이후 수집이 매번 여기서 끝났고, 사람에겐 "계정/비밀번호를
                #    확인해주세요"라는 **틀린 안내**가 나갔다. POP3로는 멀쩡히 되는 계정인데도.
                #    → 권한/정책 거부로 보이면 POP3 로 폴백한다. **비밀번호 오류로 보일 때만** 중단한다
                #      (잠금 위험이 있는 건 그쪽뿐이다 — SAP·그룹웨어 로그인과 같은 원칙).
                _msg = str(e)
                _low = _msg.lower()
                _PERMISSION_HINTS = ('permission', 'not allowed', 'disabled', 'denied',
                                     'not enabled', 'forbidden', 'unavailable')
                if any(h in _low for h in _PERMISSION_HINTS):
                    proto = 'pop3'
                    fallback_reason = f'IMAP 권한 없음({_msg}) — POP3로 전환'
                    results = _fetch_mail_pop3(mail_user, mail_pw, start_dt, end_dt, scan_limit,
                                               keyword, keyword_from, keyword_body, _stage_dir, mail_host)
                else:
                    # 🔒 [2026-11-04] `auth` 플래그를 같이 준다 — 프런트가 **한국어 문구를
                    #    문자열로 뒤져서** 인증 실패를 알아내게 두면, 문구 한 번 다듬을 때
                    #    조용히 안 걸리게 된다. 이 플래그를 보고 자동수집을 **멈춘다**.
                    return jsonify({"status": "error", "auth": True, "proto": "imaps",
                                    "host": mail_host or IMAP_HOST,
                                    "message": f"IMAP 인증 실패: {_msg} — 메일 계정/비밀번호를 확인해주세요."})
            except Exception as e:
                proto, fallback_reason = 'pop3', f'{type(e).__name__}: {e}'
                results = _fetch_mail_pop3(mail_user, mail_pw, start_dt, end_dt, scan_limit,
                                           keyword, keyword_from, keyword_body, _stage_dir, mail_host)

        resp = {
            "status":  "success",
            "count":   len(results),
            "keyword": keyword or "(전체)",
            "userId":  mail_user.split("@")[0] if mail_user else "",
            "proto":   proto,
            "data":    results
        }
        if fallback_reason:
            resp["fallback"] = fallback_reason
        resp["recvHost"] = mail_host or IMAP_HOST
        if _ignored_mail_host and _ignored_mail_host != (mail_host or ''):
            # 구버전 프런트 — 발송 주소를 수신에 쓰지 않았다는 사실을 화면에서 볼 수 있게
            resp["ignoredMailHost"] = _ignored_mail_host
        return jsonify(resp)
    except poplib.error_proto as e:
        # ⚠️ `-ERR invalid user or password` 는 "비밀번호가 틀렸다"가 아니라 **"그 서버가 이
        #    조합을 거부했다"** 는 뜻이다 — 아이디 형식·프로토콜 권한·비밀번호 어느 것이어도
        #    같은 문구가 온다. 그래서 어느 서버에 어떤 계정으로 붙었는지를 같이 적는다.
        _u = (mail_user or '')
        _um = (_u[:2] + '***' + ('@' + _u.split('@')[1] if '@' in _u else '')) if _u else '(없음)'
        return jsonify({"status": "error", "auth": True, "proto": "pop3",
                        "host": mail_host or POP3_HOST,
                        "message": f"POP3 인증 실패({mail_host or POP3_HOST}:{POP3_PORT}, 계정 {_um}): {str(e)}"})
    except OSError as e:
        # 연결 자체가 안 된 경우 — 어느 서버/포트인지 밝힌다(위 humanize_mail_conn_error 주석)
        _p = 'POP3' if (locals().get('proto') == 'pop3') else 'IMAP'
        _h = mail_host or (POP3_HOST if _p == 'POP3' else IMAP_HOST)
        _pt = POP3_PORT if _p == 'POP3' else IMAP_PORT
        return jsonify({"status": "error",
                        "message": humanize_mail_conn_error(e, _h, _pt, _p)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


# ── Telegram 메시지 발송 ──────────────────────────────────────
@app.route('/send-telegram', methods=['POST'])
def send_telegram_api():
    req     = request.get_json(force=True, silent=True) or {}
    message = req.get('message', '')
    to      = req.get('to', '')
    role    = req.get('role', '')
    project = req.get('project', '')
    chat_id = req.get('chatId', '')

    if not message:
        return jsonify({'status': 'error', 'message': 'message 필드 필요'})
    if not TELEGRAM_TOKEN:
        return jsonify({'status': 'error', 'message': 'Telegram Token 미설정 — 알람 설정 > Telegram 탭에서 입력하세요'})

    try:
        if chat_id:
            chat_ids = [chat_id]
        else:
            chat_ids = get_target_chat_ids(
                to=to or None, role=role or None, project=project or None)
        if not chat_ids:
            return jsonify({'status': 'error', 'message': '발송 대상 없음'})

        results = send_telegram_multi(message, chat_ids)
        ok_cnt  = sum(1 for r in results if r.get('result', {}).get('ok'))
        return jsonify({'status': 'success', 'sent': ok_cnt, 'total': len(results), 'results': results})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


# ── Telegram 설정 저장/조회 ───────────────────────────────────
@app.route('/telegram/config', methods=['GET', 'POST'])
def telegram_config_api():
    global TELEGRAM_TOKEN, TELEGRAM_CHAT_ID

    if request.method == 'GET':
        token = TELEGRAM_TOKEN
        return jsonify({
            'status':          'success',
            'token_set':       bool(token),
            'token_preview':   (token[:10] + '...') if token else '(미설정)',
            'default_chat_id': TELEGRAM_CHAT_ID,
            'members_count':   len(TELEGRAM_MEMBERS)
        })

    data            = request.json or {}
    TELEGRAM_TOKEN   = data.get('token',           TELEGRAM_TOKEN)
    TELEGRAM_CHAT_ID = data.get('default_chat_id', TELEGRAM_CHAT_ID)
    try:
        cfg = load_tg_config()
        cfg['token']           = TELEGRAM_TOKEN
        cfg['default_chat_id'] = TELEGRAM_CHAT_ID
        save_tg_config(cfg)
        return jsonify({'ok': True, 'message': 'Telegram 설정 저장 완료'})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── 프로젝트 멤버-3 기본값 (team_defaults.json, 로컬 전용·.gitignore) ──────
@app.route('/team-defaults', methods=['GET'])
def team_defaults_get():
    try:
        with open(TEAM_DEFAULTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify({'ok': True, 'configured': True, 'member3': data.get('member3', [])})
    except Exception:
        return jsonify({'ok': True, 'configured': False, 'member3': []})


# ── 팀원 관리 ─────────────────────────────────────────────────
@app.route('/telegram/members', methods=['GET', 'POST', 'DELETE'])
def telegram_members_api():
    global TELEGRAM_MEMBERS

    if request.method == 'GET':
        return jsonify({'status': 'success', 'count': len(TELEGRAM_MEMBERS),
                        'members': TELEGRAM_MEMBERS})

    if request.method == 'POST':
        data     = request.json or {}
        name     = data.get('name',     '').strip()
        chat_id  = data.get('chat_id',  '').strip()
        email_   = data.get('email',    '').strip()
        roles    = data.get('roles',    [])
        projects = data.get('projects', [])
        if not name or not chat_id:
            return jsonify({'ok': False, 'error': 'name, chat_id 필수'}), 400

        updated = False
        for m in TELEGRAM_MEMBERS:
            if m['name'] == name:
                m.update({'chat_id': chat_id, 'email': email_,
                          'roles': roles, 'projects': projects})
                updated = True
                break
        if not updated:
            TELEGRAM_MEMBERS.append({'name': name, 'chat_id': chat_id,
                                     'email': email_, 'roles': roles, 'projects': projects})
        cfg = load_tg_config()
        cfg['members'] = TELEGRAM_MEMBERS
        save_tg_config(cfg)
        return jsonify({'ok': True, 'message': f"{'업데이트' if updated else '등록'} 완료: {name}"})

    if request.method == 'DELETE':
        data   = request.json or {}
        name   = data.get('name', '').strip()
        before = len(TELEGRAM_MEMBERS)
        TELEGRAM_MEMBERS = [m for m in TELEGRAM_MEMBERS if m['name'] != name]
        cfg = load_tg_config()
        cfg['members'] = TELEGRAM_MEMBERS
        save_tg_config(cfg)
        removed = before - len(TELEGRAM_MEMBERS)
        return jsonify({'ok': True, 'message': f'{name} 삭제 완료' if removed else '해당 이름 없음'})


# ── Telegram 발송 테스트 ──────────────────────────────────────
@app.route('/telegram/test', methods=['POST'])
def telegram_test():
    if not TELEGRAM_TOKEN:
        return jsonify({'ok': False, 'error': 'Token 미설정'})
    data    = request.json or {}
    chat_id = data.get('chat_id', TELEGRAM_CHAT_ID)
    try:
        result = send_telegram_msg(
            f"✅ <b>KORTEK Gantt PM</b>\n"
            f"Telegram 연결 테스트 성공!\n"
            f"서버 시간: {datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')}",
            chat_id
        )
        if result.get('ok'):
            return jsonify({'ok': True,  'message': '테스트 메시지 발송 완료'})
        else:
            return jsonify({'ok': False, 'error': str(result)})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})


# ══════════════════════════════════════════════════════════════
# ⏰ 예약 발송(반복 규칙) — 규칙 등록/조회/삭제 + 백그라운드 스케줄러
# ══════════════════════════════════════════════════════════════
#
# 규칙(rule) 스키마:
#   id, type('notice'|'alarm'), title, message,
#   recipients: [{name, email, telegramId, emailOn, tgOn}, ...],
#   dateMode('range'|'specific'),
#     range  → startDate, endDate, dayInterval(N일마다)
#     specific → specificDates: ["YYYY-MM-DD", ...]
#   hourStart, hourEnd ("HH:MM", 기본 09:00~21:00), hourInterval(N시간마다),
#   enabled, createdAt, lastFiredBucket(중복발송 방지용, 서버가 내부적으로 기록)
#
# [2026-08-31 신규] type='alarm'(업무별 개별 알람) 전용 추가 필드 — 공지(notice)와 달리
# "저장 시점 스냅샷"이 아니라 "발송 직전 구글드라이브에서 해당 업무의 최신 상태를 다시 읽어서"
# 담당자/완료예정일/업무내용이 바뀌었으면 바뀐 대로 발송한다(_fire_alarm_rule 참고).
#   driveFileId          — 이 업무가 속한 프로젝트의 구글드라이브 파일 ID (window.currentDriveFileId)
#   rowIdx               — globalData 배열 안에서 이 업무 행의 인덱스
#   taskNameSnapshot      — 목록 표시용(실제 발송 내용에는 안 씀, 매번 최신 이름으로 다시 계산됨)
#   ccRecipientsSnapshot  — 수신 대상(기본수신/개별수신) 명단은 브라우저에만 있어 서버가 못 보므로,
#                           규칙 저장 시점의 명단을 [{name, email, telegramId, emailOn, tgOn}, ...]
#                           그대로 스냅샷 — recipients와 달리 자주 안 바뀔 값이라 실용적 절충.
#                           [2026-08-31] 이메일만 담던 ccMailsSnapshot(문자열)을 대체 — 텔레그램도 발송.
#   allowedExternalDomainsSnapshot — 위와 동일한 이유로 스냅샷하는 "외부 도메인 발송 허용" 목록


# ══════════════════════════════════════════════════════════════
# 📔 일일 업무보고 — 텔레그램 입력 수신 + 미작성 알림 (2026-11-04)
# ══════════════════════════════════════════════════════════════
#  왜 백엔드인가: ① 휴대폰에서 앱이 **아예 못 돈다**(이 백엔드가 127.0.0.1 바인드 +
#  앱이 https Pages 라 사설IP http 호출은 혼합콘텐츠로 막힌다). 그래서 입력 통로를
#  텔레그램 봇 답장으로 둔다. ② 미작성 알림은 브라우저가 꺼져 있어도 돌아야 한다.
#
#  ⚠️⚠️ `getUpdates` 는 **한 프로세스만** 불러야 한다 — 팀원 PC 백엔드가 다 폴링하면
#     서로 업데이트를 빼앗아 보고가 임의의 PC 로 흩어진다. 그래서 명단(roster)에서
#     `notifier: true` 인 사람의 PC(= NAS 계정이 그 key 와 같은 PC)에서만 돈다.
#  ⚠️ webhook 은 못 쓴다(사내 PC 에 공개 URL 이 없다) — 폴링만.
#  ⚠️ 모르는 chat_id 에는 **답하지 않는다** — 답하면 이 봇이 누구 것인지 알려 주는 셈이다.
#  ⚠️ 쓰기에 실패하면 `offset` 을 올리지 않는다(다음 틱 재시도) — `_mail_watch_tick` 와 같은 규칙.
#  ⚠️⚠️ 조회 실패를 "미작성"으로 읽으면 **전원에게 잘못 보낸다** → 실패하면 발송 0건.

DAILY_TG_STATE = os.path.join(BASE_DIR, 'daily_tg_state.json')

# 어휘는 데이터 — 줄 머리에 이 말이 있으면 그 칸으로. 없으면 전부 "오늘 한 일".
DAILY_TG_TAGS = {
    'done':  ['오늘 한 일', '한 일', '한일', '실적', '오늘', '완료', 'done'],
    'next':  ['해야 할 일', '해야할일', '해야', '할 일', '할일', '내일', '계획', 'next', 'tomorrow', 'todo'],
    'issue': ['막힌 일', '막힌일', '막힌', '이슈', '문제', '막힘', 'issue', 'blocker'],
}
# 한 단어만 보내면 그 날 종류로 기록하고 끝낸다(휴가 등은 보고할 일이 없다).
DAILY_TG_DAYTYPES = {'휴가': 'leave', '반차': 'half', '출장': 'trip', '교육': 'training', '근무': 'work'}


# 📎 텔레그램으로 온 사진·문서. 바이트는 보고 JSON 밖(월 폴더의 `files/`)에 둔다 —
#    프런트(js/59)와 **같은 규칙**이어야 한다. 두 쪽이 갈라지면 같은 파일을 서로 다른
#    이름으로 찾게 되고, 그건 오류 없이 "첨부가 없다"로 보인다.
# ⚠️ 20MB 는 봇 API 가 내려주는 천장이다(그 위는 `getFile` 이 거부한다) —
#    js/59 `DAILY_POLICY.fileMaxMB` 와 같은 값.
DAILY_TG_FILE_MAX_MB = 20
# 받을 종류 — 코드에 박지 않고 여기 한 줄. (kind, 이름 없을 때 붙일 확장자)
DAILY_TG_FILE_KINDS = (('document', ''), ('video', '.mp4'), ('audio', '.mp3'), ('voice', '.ogg'))


def _daily_safe_name(name):
    """프런트 `DAILY_PATHS.safeName` 과 같은 규칙으로 눕힌다. 확장자는 지킨다."""
    n = re.sub(r'[\\/]+', '_', str(name or ''))
    n = re.sub(r'[\x00-\x1f]', '', n)
    n = re.sub(r'["*:<>?|]', '_', n)
    n = re.sub(r'^\.+', '', n).strip()
    if not n:
        n = 'file'
    if len(n) > 90:
        dot = n.rfind('.')
        ext = n[dot:] if (0 < dot and len(n) - dot <= 12) else ''
        n = n[:90 - len(ext)] + ext
    return n


def _daily_files_rel(date_str, key, safe):
    """js/59 `DAILY_PATHS.fileRel` 과 같은 규칙. 폴더는 `files` — **글자로 시작한다**
    (숫자로 시작하는 폴더를 DSM 이 거부한 실측 때문, nas_dsm.ensure_folder 주석)."""
    return 'App_Config/DailyReport/%s/files/%s__%s__%s' % (
        date_str[:7].replace('-', '_'), date_str, key, safe)


def _tg_attachment(msg):
    """메시지에서 받을 것 하나를 고른다. 없으면 None.

    ⚠️ `photo` 는 **크기별 배열**이라 가장 큰 것을 집는다 — 작은 걸 집으면
       흐릿한 섬네일이 보고에 남는다(원본은 다시 받을 수 없다).
    """
    ph = msg.get('photo') or []
    if ph:
        big = max(ph, key=lambda x: ((x.get('file_size') or 0), (x.get('width') or 0)))
        return {'file_id': big.get('file_id'), 'size': big.get('file_size') or 0,
                'name': 'photo_%s.jpg' % datetime.now(KST).strftime('%H%M%S'),
                'mime': 'image/jpeg'}
    for kind, ext in DAILY_TG_FILE_KINDS:
        o = msg.get(kind)
        if not o:
            continue
        nm = o.get('file_name') or ('%s_%s%s' % (kind, datetime.now(KST).strftime('%H%M%S'), ext))
        return {'file_id': o.get('file_id'), 'size': o.get('file_size') or 0,
                'name': nm, 'mime': o.get('mime_type') or ''}
    return None


def _daily_tg_save_file(att, date_str, key, taken):
    """봇에서 내려받아 NAS 에 둔다. 돌려주는 건 보고 JSON 에 넣을 **참조**다.

    ⚠️ 상한을 **받기 전에** 본다 — 20MB 넘는 걸 받아 보고 실패하면 그 시간만 버린다.
    ⚠️ `put` 은 쓴 뒤 정말 있는지 확인하고 돌려준다(nas_dsm) — 반환값은 증거가 아니다.
    """
    cap = DAILY_TG_FILE_MAX_MB * 1048576
    if (att.get('size') or 0) > cap:
        raise ValueError('파일이 %dMB 를 넘습니다(텔레그램 봇이 못 내려줍니다)' % DAILY_TG_FILE_MAX_MB)
    r = requests.get('https://api.telegram.org/bot%s/getFile' % TELEGRAM_TOKEN,
                     params={'file_id': att.get('file_id')}, timeout=20)
    j = r.json()
    if not j.get('ok'):
        raise RuntimeError('getFile 실패: %s' % str(j.get('description') or j)[:160])
    fp = (j.get('result') or {}).get('file_path')
    if not fp:
        raise RuntimeError('file_path 가 없습니다')
    dl = requests.get('https://api.telegram.org/file/bot%s/%s' % (TELEGRAM_TOKEN, fp), timeout=90)
    if dl.status_code != 200 or not dl.content:
        raise RuntimeError('내려받기 실패(HTTP %s)' % dl.status_code)
    if len(dl.content) > cap:
        raise ValueError('파일이 %dMB 를 넘습니다' % DAILY_TG_FILE_MAX_MB)
    safe = _daily_safe_name(att.get('name'))
    base, i = safe, 2
    while safe in (taken or ()):
        dot = base.rfind('.')
        safe = ('%s-%d%s' % (base[:dot], i, base[dot:])) if dot > 0 else '%s-%d' % (base, i)
        i += 1
    rel = _daily_files_rel(date_str, key, safe)
    nas = _nas()
    nas.put(nas.abs_path(rel), dl.content)
    return {'name': att.get('name'), 'safe': safe, 'rel': rel, 'size': len(dl.content),
            'via': 'telegram', 'addedAt': datetime.now(KST).isoformat()}


def _daily_state():
    try:
        with open(DAILY_TG_STATE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _daily_state_save(st):
    try:
        with open(DAILY_TG_STATE, 'w', encoding='utf-8') as f:
            json.dump(st, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("[일일보고] 상태 저장 실패: %s" % e)


def _daily_rel(date_str, key):
    """프런트(js/59 DAILY_PATHS)와 **같은 규칙**이어야 한다. 월 폴더는 밑줄이다 —
    DSM 이 숫자로 시작하는 폴더 이름을 거부한 실측 때문(nas_dsm.ensure_folder 주석)."""
    return 'App_Config/DailyReport/%s/%s__%s.json' % (date_str[:7].replace('-', '_'), date_str, key)


def _daily_nas_json(rel):
    """없으면 None. 읽기 실패는 **예외로 올린다** — "없다"와 "못 읽었다"를 섞으면
    미작성 판정이 조용히 틀린다."""
    n = _nas()
    try:
        raw = n.download(n.abs_path(rel))
    except Exception as e:
        txt = str(e)
        if ('없' in txt) or ('404' in txt) or ('not found' in txt.lower()) or ('502' in txt):
            return None
        raise
    try:
        return json.loads(raw.decode('utf-8'))
    except Exception:
        return None


def _daily_roster():
    """명단. 못 읽으면 **None**(빈 목록이 아니다) — 그 차이로 발송을 멈춘다."""
    try:
        r = _daily_nas_json('App_Config/DailyReport/_roster.json') or {}
        return [m for m in (r.get('members') or []) if m.get('key')]
    except Exception as e:
        print("[일일보고] 명단 조회 실패: %s" % e)
        return None


def _daily_is_notifier():
    """이 PC 가 담당인가. 명단에 notifier 가 없으면 **아무도 안 한다** — 기본값을
    "나"로 두면 팀원 PC 가 전부 폴링해 서로 메시지를 빼앗는다."""
    roster = _daily_roster()
    if not roster:
        return False, roster
    try:
        import nas_dsm as _nd
        me = (_nd.load_config() or {}).get('user') or ''
    except Exception:
        me = ''
    for m in roster:
        if m.get('notifier') and str(m.get('key', '')).lower() == str(me).lower():
            return True, roster
    return False, roster


def _daily_nonworkday(date_str):
    """비근무일인가. **모르면 True**(= 안 보낸다). 백엔드는 KOR_HOLIDAYS(js/04d 안)를
    모르므로 앱이 `_nonworkdays.json` 을 써 두고 여기서 읽는다."""
    try:
        d = datetime.strptime(date_str, '%Y-%m-%d')
    except Exception:
        return True
    if d.weekday() >= 5:
        return True
    try:
        doc = _daily_nas_json('App_Config/DailyReport/_nonworkdays.json') or {}
    except Exception:
        return True
    days, until = doc.get('days') or [], doc.get('until') or ''
    # ⚠️ 신선도는 `until` 로만 본다 — `days` 가 **비어 있는 건 정상**이다(그 기간에
    #    추가 공휴일이 없을 뿐). 처음엔 빈 목록을 "목록 없음"으로 보고 전부 비근무일로
    #    판정해, 평일에도 알림이 영영 안 나갔다(하네스가 잡았다).
    if not until or date_str > until:
        return True          # 목록이 없거나 낡았으면 안 보낸다
    return date_str in days


def _daily_apply_text(doc, text):
    """자유 텍스트를 **업무별** 칸에 담는다.

    [2026-11-05 요청] 보고가 업무별로 갈렸다 — 텔레그램도 세 가지를 구분해 받아야 한다.
    규칙(외울 게 하나뿐이다):

        STELLAR32 점검          ← 태그 없는 줄 = **업무 이름**(여기서부터 그 업무)
        한일: 원자재 확인        ← 그 업무의 '오늘 한 일'
        할일: CTR 납품 일정      ← 그 업무의 '해야 할 일'
        막힌일: 회신 없음        ← 그 업무의 '막힌 일'

    ⚠️ 태그가 먼저 오면(업무 이름 없이) **그 날 마지막 업무**에 붙인다 — 이어서 적는 게
       보통이라서다. 그마저 없으면 제목 없는 업무를 하나 만든다(버리지 않는다).
    ⚠️ 태그가 하나도 없는 글은 **전부 업무 이름**이다(옛 동작 그대로 — 서식을 외우게
       만들면 아무도 안 쓴다).
    """
    items = doc.setdefault('items', [])

    def new_item(name):
        it = {'name': name, 'project': '', 'cat': '', 'note': '', 'next': '', 'issue': '',
              'via': 'telegram'}
        items.append(it)
        return it

    def add(it, key, val):
        prev = (it.get(key) or '').strip()
        it[key] = (prev + ' ' if prev else '') + val

    FIELD = {'done': 'note', 'next': 'next', 'issue': 'issue'}
    cur = None
    for raw in str(text or '').split('\n'):
        line = raw.strip()
        if not line:
            continue
        hit = None
        low = line.lower()
        for key, words in DAILY_TG_TAGS.items():
            for w in words:
                wl = w.lower()
                if low.startswith(wl + ':') or low.startswith(wl + ' :') or low.startswith(wl + ')'):
                    rest = line.split(':', 1)[1].strip() if ':' in line else line[len(w) + 1:].strip()
                    hit = (key, rest)
                    break
            if hit:
                break
        if not hit:
            cur = new_item(line)
            continue
        if cur is None:
            cur = items[-1] if items else new_item('(제목 없음)')
        if hit[1]:
            add(cur, FIELD[hit[0]], hit[1])
    return doc

def _daily_summary_text(doc):
    """"썼다"가 아니라 **쓰인 것을 되읽어** 보여준다(반환값은 증거가 아니다).

    [2026-11-05] 업무별로 갈렸으니 되읽기도 업무마다 세 칸을 보여 준다.
    """
    lines = ['\U0001F4D4 <b>%s</b> 일일보고' % html.escape(str(doc.get('date', '')))]
    t = {'work': '근무', 'leave': '휴가', 'half': '반차', 'trip': '출장', 'training': '교육'}.get(doc.get('dayType'), '')
    if t and t != '근무':
        lines.append('· 일 종류: %s' % t)
    labels = [('note', '한 일'), ('next', '해야 할 일'), ('issue', '막힌 일')]
    for it in (doc.get('items') or []):
        cat = str(it.get('cat') or '').strip()
        tag = ('[%s] ' % html.escape(cat)) if cat else ''
        lines.append('\n\u2022 %s<b>%s</b>' % (tag, html.escape(str(it.get('name', '')))))
        for key, lab in labels:
            v = str(it.get(key) or '').strip()
            if v:
                lines.append('   %s: %s' % (lab, html.escape(v)))
        fs = [f for f in (doc.get('files') or []) if str((f or {}).get('task') or '') == str(it.get('name') or '')]
        if fs:
            lines.append('   \U0001F4CE %s' % ', '.join(html.escape(str(f.get('name', ''))) for f in fs))
    # 업무에 안 붙는 것(옛 보고·꼬리표 없는 사진)
    etc = [str(doc.get('next') or '').strip(), str(doc.get('issue') or '').strip()]
    etc = [x for x in etc if x]
    efs = [f for f in (doc.get('files') or []) if not str((f or {}).get('task') or '')]
    if etc or efs:
        lines.append('\n\u2022 <b>(기타)</b>')
        for x in etc:
            lines.append('   %s' % html.escape(x))
        if efs:
            lines.append('   \U0001F4CE %s' % ', '.join(html.escape(str(f.get('name', ''))) for f in efs))
    lines.append('')
    lines.append('(지금 저장된 내용입니다 \u2014 더 보내면 이어 붙습니다)')
    lines.append('서식: <b>업무 이름</b> 줄 아래에 <code>한일:</code> <code>할일:</code> <code>막힌일:</code>')
    return '\n'.join(lines)

# ══════════════════════════════════════════════════════════════
# 🤖📱 텔레그램 → AI 문답 다리 (2026-11-08, 사용자 요청)
# ══════════════════════════════════════════════════════════════
#  "텔레그램에서 문의·명령을 하면 AI 문답창에도 보이고 텔레그램으로도 결과를 받는다."
#
#  왜 이 모양인가: AI 문답은 **전부 프런트**다 — 키는 localStorage, 프로젝트는 브라우저
#  메모리, 로컬 명령·SAP·그룹웨어·도구 루프가 다 js/04h·40 에 있다. 백엔드가 그걸
#  베끼면 두 벌이 된다(한쪽만 고쳐지는 구조). 그래서 백엔드는 **접수만** 한다:
#    텔레그램 DM(접두어) → NAS `App_Config/TelegramAI/<key>__<id>.json`
#    → 그 사람의 **열린 앱**(js/60)이 15초마다 집어 `sendGanttQaMessage()` 로 답하고
#    → 답을 텔레그램으로 되보낸다(`/send-telegram`).
#  담당 PC 한 대가 폴링하는 건 일일보고와 같다(`getUpdates` 는 한 프로세스만). 질문한
#  사람의 앱은 **어느 PC 에서든** NAS 를 보므로 담당 PC 가 아니어도 된다.
#
#  ⚠️ 일일보고 글과 가르는 기준은 **접두어뿐**(`TG_AI_PREFIXES`, 데이터) — 접두어가
#     없으면 지금처럼 전부 일일보고다. "요즘 메일 어때?" 를 보고에 넣는 사고보다
#     접두어 하나 외우게 하는 쪽이 싸다.
#  ⚠️ 앱이 꺼져 있으면 답이 안 온다 — 그래서 앱이 2분마다 `online__<key>.json` 을 찍고,
#     접수 답장에 **"앱이 꺼져 있는 것 같다"** 를 정직하게 적는다(조용히 기다리게 하지 않는다).
#  ⚠️ 쓰기(write) 도구는 그대로 **앱의 확인 버튼**이 지킨다 — 폰에서 버튼을 못 누르므로
#     그런 답엔 앱이 "PC 에서 확인을 눌러 달라" 고 덧붙인다(js/60). 폰은 읽기·조회용이다.
#  ⚠️ 요청 파일은 사람당·건당 따로(읽고-고쳐-쓰기 없음) — 11-04 색인 유실의 모양을 피한다.

TG_AI_QUEUE_DIR = 'App_Config/TelegramAI'
# 접두어 — 긴 것부터 맞춘다. 대소문자 무시, 뒤의 ':'·공백은 뗀다.
TG_AI_PREFIXES = ['/ai', '/q', '/질문', '/문의', '/검색', 'ai:', 'ai ', '질문:', '문의:', '검색:', '?']
TG_AI_HELP_WORDS = ['/help', '/start', '도움말', '도움', '사용법', '/도움말']
TG_BRIEF_WORDS = ['/brief', '/브리핑', '브리핑', '오늘 브리핑', '/오늘']   # 즉시 내 아침 브리핑(AI 없음)
# 📥 폰에서 대기 메일 배분(docs/ai-expansion-review.md §3-1 ②, 2026-11-08) — 앱(js/60)이 2분마다 올리는
#    `pending__<key>.json` 을 inline 버튼으로 보여 주고, 버튼 답을 같은 큐에 `action:'place'` 로 접수한다.
#    고르는 건 사람, 실행은 열린 앱의 기존 배치 함수. AI 없음.
TG_DIST_WORDS = ['/배분', '/대기', '/메일배분', '대기 메일', '/pending', '/inbox']
TG_DIST = {'max': 5,          # 한 번에 보여 주는 메일 수(폰 화면)
           'maxCands': 4,     # 항목당 후보 버튼 상한
           'staleMin': 15,    # 목록이 이보다 오래됐으면 "앱이 꺼진 것 같다" 를 붙인다
           'briefMaxAgeMin': 1440}   # 아침 브리핑에 대기 건수를 싣는 신선도 상한(하루)
TG_AI_PENDING_FILE = TG_AI_QUEUE_DIR + '/pending__%s.json'
TG_DIST_CB_PREFIX = 'pl'      # callback_data = 'pl|<보관함 uid>|<후보 번호|skip>' (64바이트 상한)
TG_AI_ONLINE_STALE_SEC = 300          # 앱 신호가 이보다 오래되면 "꺼져 있는 것 같다"
TG_AI_MAX_QUESTION = 2000

# ══════════════════════════════════════════════════════════════
# 🔁 대화 모드 — "텔레그램 채팅창을 AI 문답창처럼" (2026-11-09, 사용자 신고)
# ══════════════════════════════════════════════════════════════
#  신고: "텔레그램 채팅창을 AI 문답창처럼 쓰게 해달라고 했는데 잘 안 된다."
#  실측 원인: 가르는 기준이 **접두어뿐**이라 접두어 없이 보낸 질문
#  ("프로젝트 요약 부탁해")이 **오늘 일일보고의 업무 이름으로 저장**돼 있었다
#  (2026-11-09 11:05 `2026-11-09__yhpark.json`). 오류도 안 나고 답도 안 온다.
#  → 사람에게 접두어를 외우게 하는 대신 **모드**를 둔다: `/ai` 를 한 번 쓰면 그 사람의
#    채팅이 AI 문답 모드가 되고, 그 뒤엔 **접두어 없이 적어도 질문**이다(문답창처럼).
#  ⚠️ 보고를 잃지 않는 것이 먼저다 — AI 모드라도 **보고 서식은 보고로 간다**:
#     `한일:`/`할일:`/`막힌일:` 태그(DAILY_TG_TAGS, 같은 어휘)·`휴가` 같은 한 단어
#     (DAILY_TG_DAYTYPES)·`/다시` 는 그대로 보고로 떨어지고 모드도 보고로 돌아온다.
#  ⚠️ 모드는 **스스로 식는다**(`ttlMin`) — 아침에 질문하고 퇴근 때 보고를 적는 사람이
#     하루 종일 AI 모드에 갇히면 안 된다. 질문을 보낼 때마다 다시 데워진다.
#  ⚠️ 보고 모드에서 **질문처럼 보이는 글**은 막지 않고(오분류로 글을 잃는 게 더 나쁘다)
#     저장한 뒤 "질문이었나요?" 한 줄을 덧붙인다 — 조용한 실패를 드러내는 쪽.
TG_MODE_WORDS = {   # 한 단어만 보내면 모드가 바뀐다(어휘는 데이터)
    'ai':     ['/문답', '/ai모드', '/aimode', '/qa', '/채팅', '/chat', 'ai모드', '문답모드'],
    'report': ['/보고', '/보고모드', '/report', '/일일보고', '보고모드'],
}
TG_MODE = {'ttlMin': 180,        # 마지막 질문 뒤 이만큼 지나면 보고 모드로 돌아간다
           'hintQuestion': True}  # 보고 모드에서 질문처럼 보이는 글이면 안내 한 줄
# 질문처럼 보이는 말 — 안내 한 줄을 붙일지에만 쓴다(저장을 막거나 AI 로 보내지 않는다).
TG_QUESTION_HINTS = ['?', '？', '해줘', '해 줘', '알려줘', '알려 줘', '뭐야', '뭔지', '어때',
                     '있나', '있어?', '확인해', '찾아줘', '요약해', '보여줘', '부탁해', '뽑아줘']


def _tg_mode_norm(text):
    """모드 전환 한 단어인가 → 'ai'/'report', 아니면 None."""
    w = str(text or '').strip().lower().replace(' ', '')
    for mode, words in TG_MODE_WORDS.items():
        for x in words:
            if w == x.lower().replace(' ', ''):
                return mode
    return None


def _tg_mode_get(st, key):
    """그 사람의 지금 모드. 식었으면 'report'(기본)."""
    m = ((st.get('tgMode') or {}).get(key)) or {}
    if (m.get('mode') or 'report') != 'ai':
        return 'report'
    try:
        age = (datetime.now(KST) - datetime.fromisoformat(str(m.get('at')))).total_seconds() / 60.0
    except Exception:
        return 'report'          # 시각을 모르면 안전한 쪽(보고)
    return 'ai' if age <= TG_MODE['ttlMin'] else 'report'


def _tg_mode_set(st, key, mode):
    """모드를 적고 **바로 저장**한다 — 틱이 중간에 죽어도 사람이 본 모드와 맞아야 한다."""
    st.setdefault('tgMode', {})[key] = {'mode': mode, 'at': datetime.now(KST).isoformat()}
    _daily_state_save(st)


def _daily_tg_has_tag(text):
    """보고 서식인가 — `_daily_apply_text` 와 **같은 어휘·같은 규칙**(줄머리 태그)."""
    for raw in str(text or '').split('\n'):
        low = raw.strip().lower()
        if not low:
            continue
        for words in DAILY_TG_TAGS.values():
            for w in words:
                wl = w.lower()
                if low.startswith(wl + ':') or low.startswith(wl + ' :') or low.startswith(wl + ')'):
                    return True
    return False


def _tg_is_report_text(text):
    """AI 모드에서도 **보고로 보내야 하는 글**인가(서식·날 종류·지우기)."""
    w = str(text or '').strip()
    return bool(w in DAILY_TG_DAYTYPES or w in ('/다시', '/reset') or _daily_tg_has_tag(w))


def _tg_looks_question(text):
    """질문처럼 보이는가 — 안내 한 줄에만 쓴다(판정이 틀려도 글은 이미 저장됐다)."""
    w = str(text or '').strip().lower()
    if not w or _tg_is_report_text(w):
        return False
    return any(h.lower() in w for h in TG_QUESTION_HINTS)


def _tg_ai_strip(text):
    """접두어를 떼고 질문만. AI 명령이 아니면 None."""
    t = str(text or '').strip()
    low = t.lower()
    for pre in sorted(TG_AI_PREFIXES, key=len, reverse=True):
        if low.startswith(pre.lower()):
            rest = t[len(pre):]
            # "/ai:" "/ai -" 처럼 구분 기호가 더 붙어도 받는다
            rest = re.sub(r'^[\s:：\-–—]+', '', rest)
            return rest.strip()[:TG_AI_MAX_QUESTION]
    return None


def _tg_ai_help_text():
    return ('\U0001F916 <b>AI 문답</b> — 앞에 <code>/ai</code> 를 붙여 보내세요.\n'
            '예) <code>/ai 999001 재고 확인해줘</code> · <code>/ai 이번 주 마감 업무</code> · '
            '<code>/ai 최근 메일 요약</code>\n'
            '답은 PC 에 켜 둔 앱이 만듭니다 — 앱이 꺼져 있으면 열 때 처리됩니다.\n\n'
            '\U0001F501 <b>/문답</b> — 이 대화를 <b>AI 문답창처럼</b> 씁니다(접두어 없이 그냥 적으면 질문, '
            '%d분 뒤 자동 복귀). 돌아오기는 <b>/보고</b>.\n'
            '   문답 모드라도 <code>한일:</code> 같은 보고 서식과 <code>휴가</code> 는 보고로 저장됩니다.\n\n' % TG_MODE['ttlMin'] +
            '\u2600\ufe0f <b>/브리핑</b> — 지금 내 업무 브리핑(지연·오늘 마감·이번 주)을 받습니다.\n'
            '\U0001F4E5 <b>/배분</b> — 보관함에서 기다리는 메일을 버튼으로 프로젝트에 보냅니다(실행은 PC 앱).\n'
            '\U0001F4D4 <code>/ai 오늘 보고 초안</code> — 간트에서 오늘 보고 초안을 받아 고쳐 보내면 저장됩니다.\n'
            '\U0001F4D4 <b>일일보고</b> — 접두어 없이 그냥 적으면 오늘 보고에 들어갑니다.\n'
            '서식: <b>업무 이름</b> 줄 아래 <code>한일:</code> <code>할일:</code> <code>막힌일:</code> · '
            '휴가면 <code>휴가</code> 한 단어 · 지우기 <code>/다시</code>')


def _tg_ai_app_online(key):
    """그 사람 앱의 최근 신호. True/False, 모르면 None(목록을 못 읽었다)."""
    try:
        n = _nas()
        lst = n.list_folder(n.abs_path(TG_AI_QUEUE_DIR))
    except Exception as e:
        print("[텔레그램AI] 온라인 신호 조회 실패: %s" % e)
        return None
    name = 'online__%s.json' % key
    for it in (lst or {}).get('items') or []:
        if it.get('name') == name:
            mt = it.get('mtime') or 0
            try:
                return (time.time() - float(mt)) <= TG_AI_ONLINE_STALE_SEC
            except Exception:
                return None
    return False


def _tg_ai_enqueue(person, chat, question, uid):
    """요청 파일 하나를 쓴다. 실패는 예외로 올린다(부르는 쪽이 offset 을 안 올려 재시도)."""
    rid = 'tg%d' % int(uid)
    rel = '%s/%s__%s.json' % (TG_AI_QUEUE_DIR, person['key'], rid)
    doc = {'id': rid, 'key': person['key'], 'name': person.get('name', ''), 'chatId': str(chat),
           'text': question, 'via': 'telegram', 'reply': 'telegram',
           'at': datetime.now(KST).isoformat()}
    n = _nas()
    n.put(n.abs_path(rel), json.dumps(doc, ensure_ascii=False, indent=2).encode('utf-8'))
    return rel


def _tg_ai_accept(person, chat, question, uid, note=''):
    """질문 하나를 큐에 넣고 접수 답장. True(성공)/False(쓰기 실패 — offset 안 올림)."""
    try:
        _tg_ai_enqueue(person, chat, question, uid)
    except Exception as e:
        print("[텔레그램AI] 접수 실패(다음 틱 재시도): %s" % e)
        return False
    online = _tg_ai_app_online(person['key'])
    if online is True:
        msg = '\U0001F916 접수했습니다 — PC 앱이 답을 만드는 중입니다. (보통 10~60초)'
    elif online is False:
        msg = ('⚠️ 접수는 했지만 <b>PC 앱이 꺼져 있는 것 같습니다</b>(최근 5분 신호 없음). '
               '앱을 열면 그때 처리됩니다(2시간 안).')
    else:
        msg = '\U0001F916 접수했습니다 — PC 에 앱이 켜져 있으면 곧 답합니다.'
    send_telegram_msg(msg + (('\n' + note) if note else ''), chat)
    return True


def _tg_ai_handle(person, chat, text, uid, st=None):
    """AI 명령이면 접수하고 True(성공)/False(쓰기 실패 — 다음 틱 재시도). 아니면 None.

    🔁 [2026-11-09] 접두어가 없어도 **AI 문답 모드**면 질문으로 받는다(문답창처럼).
       보고 서식(`한일:`…)·`휴가`·`/다시` 는 모드와 무관하게 **보고로** 보낸다(None).
    """
    word = str(text or '').strip()
    st = st if st is not None else _daily_state()
    key = person['key']
    # 🔁 모드 전환 한 단어
    want = _tg_mode_norm(word)
    if want:
        _tg_mode_set(st, key, want)
        if want == 'ai':
            send_telegram_msg('\U0001F916 <b>AI 문답 모드</b>로 바꿨습니다 — 이제 접두어 없이 그냥 적으면 '
                              '질문으로 받습니다(%d분 뒤 자동으로 보고 모드).\n'
                              '보고로 돌아가려면 <code>/보고</code>' % TG_MODE['ttlMin'], chat)
        else:
            send_telegram_msg('\U0001F4D4 <b>일일보고 모드</b>로 바꿨습니다 — 그냥 적으면 오늘 보고에 들어갑니다.\n'
                              '질문은 <code>/ai 질문</code> 또는 <code>/문답</code>', chat)
        return True
    if word.lower() in [w.lower() for w in TG_AI_HELP_WORDS]:
        send_telegram_msg(_tg_ai_help_text(), chat)
        return True
    if word.lower() in [w.lower() for w in TG_BRIEF_WORDS]:
        # ☀️ 지금 내 브리핑 — 관문(시각·근무일·하루 한 번)을 건너뛰되 **나에게만**.
        try:
            res = _daily_brief_tick(force=True, only_key=person['key'])
        except Exception as e:
            res = {'ok': False, 'message': str(e)}
        if not res.get('ok'):
            send_telegram_msg('\u26a0\ufe0f 브리핑을 만들지 못했습니다 — %s' % html.escape(str(res.get('message') or '')), chat)
        elif not (res.get('sent') or []):
            send_telegram_msg('\u2600\ufe0f 오늘 마감·지연 업무가 없고 어제 보고도 있습니다 — 보낼 브리핑이 없습니다.', chat)
        return True
    if word.lower() in [w.lower() for w in TG_DIST_WORDS]:
        _tg_dist_send(person, chat)
        return True
    q = _tg_ai_strip(word)
    if q is None:
        # 접두어가 없다 — 보고 서식이면 언제나 보고, 아니면 **AI 모드일 때만** 질문.
        if _tg_is_report_text(word):
            if _tg_mode_get(st, key) == 'ai':
                _tg_mode_set(st, key, 'report')   # 보고를 적기 시작했으면 모드도 돌린다
            return None
        if _tg_mode_get(st, key) != 'ai':
            return None
        ok = _tg_ai_accept(person, chat, word[:TG_AI_MAX_QUESTION], uid)
        if ok:
            _tg_mode_set(st, key, 'ai')           # 질문마다 모드를 다시 데운다
        return ok
    if not q:
        send_telegram_msg(_tg_ai_help_text(), chat)
        return True
    was = _tg_mode_get(st, key)
    note = ('' if was == 'ai' else
            ('ℹ️ 이제 <b>접두어 없이</b> 그냥 적어도 질문으로 받습니다(%d분). '
             '보고로 적으려면 <code>/보고</code>' % TG_MODE['ttlMin']))
    ok = _tg_ai_accept(person, chat, q, uid, note)
    if ok:
        _tg_mode_set(st, key, 'ai')
    return ok


# ══════════════════════════════════════════════════════════════
# 📥 폰에서 대기 메일 배분 — 목록은 앱이, 고르기는 사람이, 실행은 앱이 (2026-11-08, §3-1 ②)
# ══════════════════════════════════════════════════════════════
#  앱(js/60)이 2분마다 `App_Config/TelegramAI/pending__<key>.json` 을 올린다:
#    {key, at, items:[{uid, subject, from, date, task, basis, cands:[{id,name,label}]}], counts:{waiting, withCands, unclassified}}
#  `/배분` → 그 목록을 메일 한 건에 한 통씩 inline 버튼(후보 N개 + ⏭ 보류)으로.
#  버튼 답(callback_query) → 같은 큐에 `<key>__cb<update_id>.json` {action:'place', uid, cand} 접수
#  → 열린 앱이 기존 배치 함수로 실행하고 결과를 텔레그램으로 되보낸다.
#  ⚠️ callback_data 는 64바이트 상한이라 **후보 번호**만 싣고, 파일 id 는 접수 때 목록에서 다시 찾는다.
#  ⚠️ 버튼은 한 번만 — 접수하면 원래 메시지의 버튼을 떼고 "선택: …" 을 적는다(두 번 눌러 두 번 배치 방지).
#  ⚠️ 목록이 없거나 낡았으면 그렇게 말한다(앱이 꺼져 있으면 올라오지 않는다). AI 없음.


def _tg_doc_age_min(doc):
    """`at`(ISO, 앱은 toISOString 의 Z) 로부터 몇 분 지났나. 모르면 None."""
    try:
        s = str((doc or {}).get('at') or '').replace('Z', '+00:00')
        t = datetime.fromisoformat(s)
        if t.tzinfo is None:
            t = t.replace(tzinfo=KST)
        return (datetime.now(timezone.utc) - t.astimezone(timezone.utc)).total_seconds() / 60.0
    except Exception:
        return None


def _tg_dist_pending(key):
    """앱이 올린 대기 목록. 없으면 None, 못 읽으면 예외(`_daily_nas_json` 규칙)."""
    return _daily_nas_json(TG_AI_PENDING_FILE % key)


def _tg_pending_counts(key):
    """아침 브리핑용 — 하루 안 목록의 건수만. 뭐든 틀어지면 None(브리핑을 막지 않는다)."""
    try:
        doc = _tg_dist_pending(key)
        if not doc:
            return None
        age = _tg_doc_age_min(doc)
        if age is None or age > TG_DIST['briefMaxAgeMin']:
            return None
        c = dict(doc.get('counts') or {})
        c.setdefault('withCands', len(doc.get('items') or []))
        return c
    except Exception:
        return None


def _tg_dist_item_text(it, n, total):
    lines = ['\U0001F4E8 <b>%d/%d</b> %s' % (n, total, html.escape(str(it.get('subject') or '(제목 없음)')))]
    who = ' \u00b7 '.join(str(x) for x in [it.get('from'), it.get('date')] if x)
    if who:
        lines.append('\U0001F464 ' + html.escape(who))
    if it.get('task'):
        lines.append('\U0001F4DD ' + html.escape(str(it['task'])))
    if it.get('basis'):
        lines.append('\U0001F4CE ' + html.escape(str(it['basis'])))
    cands = it.get('cands') or []
    lines.append('후보: ' + ' / '.join('%d) %s' % (i + 1, html.escape(str(c.get('label') or c.get('name') or '')))
                                       for i, c in enumerate(cands)))
    return '\n'.join(lines)


def _tg_dist_keyboard(it):
    rows = []
    uid = str(it.get('uid') or '')
    for i, c in enumerate((it.get('cands') or [])[:TG_DIST['maxCands']]):
        data = '%s|%s|%d' % (TG_DIST_CB_PREFIX, uid, i)
        if len(data.encode('utf-8')) > 64:
            continue                       # 텔레그램이 거부한다 — 그 버튼은 뺀다(목록 글엔 남아 있다)
        rows.append([{'text': '\u2192 %d) %s' % (i + 1, str(c.get('label') or c.get('name') or '')[:36]), 'callback_data': data}])
    skip = '%s|%s|skip' % (TG_DIST_CB_PREFIX, uid)
    if len(skip.encode('utf-8')) <= 64:
        rows.append([{'text': '\u23ed 보류', 'callback_data': skip}])
    return {'inline_keyboard': rows}


def _tg_dist_send(person, chat):
    """`/배분` — 대기 목록을 버튼으로. 없으면·낡았으면 그렇게 말한다."""
    try:
        doc = _tg_dist_pending(person['key'])
    except Exception as e:
        send_telegram_msg('\u26a0\ufe0f 대기 목록을 읽지 못했습니다 — %s' % html.escape(str(e)), chat)
        return {'ok': False, 'message': str(e)}
    if not doc:
        send_telegram_msg('\U0001F4ED 앱이 아직 대기 목록을 올리지 않았습니다 — PC 앱이 켜져 있어야 합니다(켜지면 2분 안에 올라옵니다).', chat)
        return {'ok': True, 'sent': 0, 'reason': 'no-list'}
    age = _tg_doc_age_min(doc)
    items = [it for it in (doc.get('items') or []) if it.get('uid') and (it.get('cands') or [])]
    counts = doc.get('counts') or {}
    head = []
    if age is not None and age > TG_DIST['staleMin']:
        head.append('\u26a0\ufe0f 이 목록은 %d분 전 것입니다(PC 앱이 꺼져 있는 것 같습니다) — 앱을 켜면 새로 올라오고, 그 전엔 버튼을 눌러도 실행되지 않습니다.' % int(age))
    if not items:
        send_telegram_msg('\n'.join(head + ['\U0001F4ED 후보가 있는 대기 메일이 없습니다. (보관함 대기 %d건 \u00b7 미분류 %d건)'
                                           % (int(counts.get('waiting') or 0), int(counts.get('unclassified') or 0))]), chat)
        return {'ok': True, 'sent': 0, 'reason': 'empty'}
    if head:
        send_telegram_msg('\n'.join(head), chat)
    shown = items[:TG_DIST['max']]
    for i, it in enumerate(shown):
        send_telegram_msg(_tg_dist_item_text(it, i + 1, len(items)), chat, reply_markup=_tg_dist_keyboard(it))
    tail = '\U0001F4E5 보관함 대기 %d건 중 후보 있는 %d건 \u00b7 지금 %d건 표시' % (int(counts.get('waiting') or len(items)), len(items), len(shown))
    if len(items) > len(shown):
        tail += ' — 처리한 뒤 <b>/배분</b> 을 다시 보내면 다음 것을 보여 줍니다'
    tail += '\n\u26a0\ufe0f 버튼은 "어느 프로젝트로" 를 고르는 것뿐이고 실행은 PC 앱이 합니다(앱이 꺼져 있으면 켤 때 처리).'
    send_telegram_msg(tail, chat)
    return {'ok': True, 'sent': len(shown), 'total': len(items)}


def _tg_dist_callback(cq, by_chat, uid):
    """inline 버튼 답. True = 처리됨(offset 올림) / False = 접수 쓰기 실패(다음 틱에 같은 답을 다시 받는다)."""
    data = str(cq.get('data') or '')
    cqid = cq.get('id')
    msg = cq.get('message') or {}
    chat = str(((msg.get('chat') or {}).get('id')) or ((cq.get('from') or {}).get('id')) or '')
    mid = msg.get('message_id')

    def answer(text):
        _tg_call('answerCallbackQuery', {'callback_query_id': cqid, 'text': text[:190]})

    def settle(tail):
        # 버튼을 떼고 결과 한 줄을 붙인다 — 같은 버튼을 두 번 눌러 두 번 배치되는 것을 막는다
        if mid:
            _tg_call('editMessageText', {'chat_id': chat, 'message_id': mid, 'parse_mode': 'HTML',
                                         'text': html.escape(str(msg.get('text') or '')) + '\n' + tail,
                                         'reply_markup': {'inline_keyboard': []}})

    person = by_chat.get(chat)
    if not person:
        answer('등록되지 않은 사용자입니다')
        return True
    parts = data.split('|')
    if len(parts) != 3 or parts[0] != TG_DIST_CB_PREFIX:
        answer('모르는 버튼입니다')
        return True
    _, item_uid, pick = parts
    if pick == 'skip':
        answer('보류했습니다')
        settle('\u23ed 보류')
        return True
    try:
        doc = _tg_dist_pending(person['key'])
    except Exception as e:
        answer('목록을 읽지 못했습니다 — %s' % str(e)[:80])
        return True
    it = next((x for x in ((doc or {}).get('items') or []) if str(x.get('uid')) == item_uid), None)
    cands = (it or {}).get('cands') or []
    try:
        idx = int(pick)
    except Exception:
        idx = -1
    if not it or idx < 0 or idx >= len(cands):
        answer('목록에 없습니다(이미 처리됐거나 낡았습니다) — /배분 을 다시 보내 주세요')
        settle('\u26a0\ufe0f 목록에 없음 — /배분 을 다시 보내 주세요')
        return True
    c = cands[idx]
    rid = 'cb%d' % int(uid)
    rel = '%s/%s__%s.json' % (TG_AI_QUEUE_DIR, person['key'], rid)
    label = str(c.get('label') or c.get('name') or '')
    req = {'id': rid, 'key': person['key'], 'name': person.get('name', ''), 'chatId': chat,
           'via': 'telegram', 'reply': 'telegram',
           'action': 'place', 'uid': item_uid,
           'cand': {'id': c.get('id'), 'name': c.get('name'), 'label': label, 'idx': idx},
           'subject': it.get('subject'),
           'text': '[배분] %s \u2192 %s' % (str(it.get('subject') or ''), label),
           'at': datetime.now(KST).isoformat()}
    try:
        n = _nas()
        n.put(n.abs_path(rel), json.dumps(req, ensure_ascii=False, indent=2).encode('utf-8'))
    except Exception as e:
        print("[텔레그램AI] 배분 접수 실패(다음 틱 재시도): %s" % e)
        answer('접수 중 오류 — 자동으로 다시 시도합니다')
        return False
    answer('접수했습니다')
    online = _tg_ai_app_online(person['key'])
    tail = '\u2705 선택: %s — PC 앱이 배치하고 결과를 보냅니다.' % html.escape(label)
    if online is False:
        tail += ' (지금 앱이 꺼져 있는 것 같습니다 — 켜면 처리됩니다)'
    settle(tail)
    return True


# ══════════════════════════════════════════════════════════════
# ☀️ 아침 브리핑 — AI 없음, 텔레그램, 담당 PC 한 대 (2026-11-08, docs/ai-expansion-review.md ①)
# ══════════════════════════════════════════════════════════════
#  사람마다 "오늘 뭘 봐야 하나" 를 한 통으로: 🔴 지연 · 📅 오늘 마감 · ▶ 오늘 시작 · 📆 이번 주
#  마감 · 📔 어제 보고 여부. 재료는 전부 NAS 에 있다(프로젝트 파일·일일보고) — AI 호출 0회.
#
#  ⚠️ "내 업무" 판정은 js/59 `scanOne`/`isMine` 과 **같은 규칙**이어야 한다(두 벌이면 한쪽만 맞는다):
#     리프 행만 · `_calcStartTs/_calcPlanTs`(없으면 날짜 칸) · `_담당구분` → 별칭 정규화 →
#     역할→`projectMeta.<역할>담당자`(없으면 멤버-3 role) → 쉼표 다중 쪼개 **이름·key·별칭** 비교.
#  ⚠️ 모르면 안 보낸다 — 색인을 못 읽으면 0건. 프로젝트 파일 하나를 못 읽으면 **그 사실을 본문에**
#     적는다(조용히 빠지면 "원래 없는 것" 과 구분이 안 된다).
#  ⚠️ 팀 폴더는 ACL 이라 남의 팀 파일은 407 — 명단에 있는 팀만 읽는다.
#  ⚠️ 프로젝트 파일은 MB 단위다 — `updated_at` 이 같으면 다시 안 읽는다(프로세스 메모리 캐시).

DAILY_BRIEF = {
    'at': '08:30',            # 기본 발송 시각(상태 파일 briefAt 이 이긴다)
    'enabled': True,          # 상태 파일 briefEnabled 가 이긴다
    'weekAhead': 7,           # "이번 주 마감" = 오늘 이후 N일 안
    'maxPerSection': 8,
    'sendIfEmpty': False,     # 볼 게 하나도 없으면 안 보낸다(알림 피로)
    'maxProjects': 30,
    'maxNameChars': 48,
    # 🔴 [2026-11-09] 메일에서 들어온 행은 '지연' 으로 세지 않는다 — 사건이지 업무가 아니다.
    #    실측: 날짜 지난 미완료 1,501건 중 1,225건(82%)이 메일 행이었다.
    #    ⚠️ 프런트 `GANTT_OVERDUE_POLICY.skipMailRows`(js/04a)와 **같이** 켜고 꺼야 한다.
    'skipMailRowsInLate': True,
}
# js/15b `_MS_CATEGORY_FIELD_MAP` 과 같은 표 — 역할 → projectMeta 칸 이름
BRIEF_ROLE_FIELD = {
    'PM': '프로젝트담당자', '기구': '기구담당자', 'ME': '기구담당자', 'HW': 'HW담당자', 'FW': 'FW담당자',
    'BLU': 'Module담당자', 'TSP': 'TSP담당자', 'LCM': 'LCM담당자',
    'Slimming': 'Slimming담당자', 'Cutting': 'Cutting담당자', 'Tooling': 'Tooling담당자', 'TOOL': 'Tooling담당자',
}
# js/04k `_WBS_DISCIPLINE_ALIASES` 와 같은 표
BRIEF_DISC_ALIAS = {'기구': 'ME', '영업': 'SAL', 'Tooling': 'TOOL', '미분류': 'ETC', 'Slimming': 'LCM', 'Cutting': 'LCM'}
_BRIEF_CACHE = {}       # file_name|updated_at → 훑은 항목 목록


def _brief_split_names(s):
    """js/22b `_addrSplitNames` — 쉼표·전각쉼표·슬래시로 쪼개고 "외 N명" 을 뗀다."""
    out = []
    for n in re.split(r'[,，/]', str(s or '')):
        n = re.sub(r'\s*외\s*(\d+\s*(명|인)?|다수)?\s*$', '', n.strip()).strip()
        if n:
            out.append(n)
    return out


def _brief_role_assignee(role, meta, members3):
    """역할 → 그 프로젝트의 담당자 이름(쉼표 다중 가능). 없으면 ''."""
    field = BRIEF_ROLE_FIELD.get(role)
    if field:
        v = str((meta or {}).get(field) or '').strip()
        if v:
            return v
    for m in members3 or []:
        if m and m.get('role') and role in str(m.get('role')) and m.get('name'):
            return str(m['name']).strip()
    return ''


def _brief_ts_date(ms):
    try:
        return datetime.fromtimestamp(float(ms) / 1000.0, KST).date()
    except Exception:
        return None


def _brief_cell_date(v):
    m = re.match(r'^(\d{4})[-./](\d{1,2})[-./](\d{1,2})', str(v or '').strip())
    if not m:
        return None
    try:
        return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).date()
    except Exception:
        return None


def _brief_scan_project(doc, project):
    """프로젝트 파일 하나 → 날짜 있는 **리프** 업무 목록(담당자 이름까지 풀어서).

    각 항목: {name, project, start, end, status, who:set(소문자 이름)}
    """
    gd = (doc or {}).get('globalData') or []
    ci = (doc or {}).get('colIdx') or {}
    meta = (doc or {}).get('projectMeta') or {}
    m3 = ((doc or {}).get('tabData') or {}).get('projectMembers3') or []
    items = []
    if not isinstance(gd, list) or len(gd) < 2:
        return items

    def col(name):
        i = ci.get(name)
        return i if isinstance(i, int) and i >= 0 else None

    c_start, c_plan, c_status = col('start'), col('plan'), col('status')
    for i in range(1, len(gd)):
        obj = gd[i]
        if not isinstance(obj, dict) or not isinstance(obj.get('data'), list):
            continue
        lvl = obj.get('_level') if isinstance(obj.get('_level'), int) else 4
        nx = gd[i + 1] if i + 1 < len(gd) else None
        nlvl = nx.get('_level') if isinstance(nx, dict) and isinstance(nx.get('_level'), int) else -1
        if nx is not None and nlvl > lvl:
            continue                                    # 리프만
        row = obj['data']
        s = _brief_ts_date(obj.get('_calcStartTs')) if obj.get('_calcStartTs') else None
        e = _brief_ts_date(obj.get('_calcPlanTs')) if obj.get('_calcPlanTs') else None
        if s is None and c_start is not None and c_start < len(row):
            s = _brief_cell_date(row[c_start])
        if e is None and c_plan is not None and c_plan < len(row):
            e = _brief_cell_date(row[c_plan])
        if s is None and e is None:
            continue
        name = str(obj.get(['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][lvl] if 0 <= lvl <= 4 else '') or '')
        name = re.sub(r'\s*＊AI📧?\s*$', '', name).strip()
        if not name:
            continue
        status = str(row[c_status] or '') if (c_status is not None and c_status < len(row)) else ''
        # 🔴 [2026-11-09] '지연' 판정에 쓸 꼬리표 — 메일에서 들어온 행인가.
        #    ⚠️ 표식(`_mailRaw`·`＊AI📧`)이 아니라 **칸 내용**으로 본다(표식은 2026-11-04 에
        #       통째로 날아간 적이 있고, 그때도 칸 내용만 살아남았다).
        #       프런트 `_ganttRowIsMail`(js/04a)의 **사본**이다.
        c_content = col('content')
        _ctext = str(row[c_content] or '') if (c_content is not None and c_content < len(row)) else ''
        is_mail = ('[출처]' in _ctext) or ('[핵심내용]' in _ctext)
        who = set()
        disc = str(obj.get('_담당구분') or '').strip()
        for part in disc.split(','):
            role = part.strip()
            if not role:
                continue
            role = BRIEF_DISC_ALIAS.get(role, role)
            for nm in _brief_split_names(_brief_role_assignee(role, meta, m3)):
                who.add(nm.lower())
        items.append({'name': name[:DAILY_BRIEF['maxNameChars']], 'project': project,
                      'start': s, 'end': e, 'status': status.strip(), 'who': who,
                      'mail': is_mail})
    return items


def _brief_load_items(teams):
    """명단의 팀 프로젝트를 전부 훑어 (items, errors). 색인을 못 읽으면 예외."""
    idx = _daily_nas_json('App_Config/project_index.json') or {}
    projects = [p for p in (idx.get('projects') or []) if p and p.get('file_name')]
    items, errors, n = [], [], 0
    for p in projects:
        if p.get('completed'):
            continue
        team = str(p.get('team') or '').strip()
        if teams and team not in teams:
            continue
        if n >= DAILY_BRIEF['maxProjects']:
            break
        n += 1
        key = '%s|%s' % (p['file_name'], p.get('updated_at') or '')
        if key in _BRIEF_CACHE:
            items.extend(_BRIEF_CACHE[key])
            continue
        rel = (team + '/' if team else '') + str(p['file_name'])
        try:
            doc = _daily_nas_json(rel)
            if not doc or not isinstance(doc.get('globalData'), list):
                raise RuntimeError('내용 없음')
            got = _brief_scan_project(doc, re.sub(r'\.json$', '', str(p['file_name'])))
            _BRIEF_CACHE[key] = got
            items.extend(got)
        except Exception as e:
            errors.append('%s — %s' % (p['file_name'], e))
            print("[브리핑] 프로젝트 읽기 실패: %s — %s" % (p['file_name'], e))
    return items, errors


def _brief_text_for(member, items, today, errors, yesterday_written):
    """한 사람 몫 본문(HTML). 볼 게 없으면 None."""
    names = set()
    for n in [member.get('key'), member.get('name')] + list(member.get('aliases') or []):
        n = str(n or '').strip().lower()
        if n:
            names.add(n)
    mine = [it for it in items if it['who'] & names]
    week_end = today + timedelta(days=DAILY_BRIEF['weekAhead'])
    # 🔴 메일에서 들어온 행은 **지연으로 세지 않는다** — 사건이지 업무가 아니다.
    #    실측(2026-11-09): 날짜 지난 미완료 1,501건 중 **1,225건(82%)이 메일 행**이었다.
    #    ⚠️ "오늘 마감·오늘 시작·이번 주" 에서는 빼지 않는다 — 사건은 늦을 수 없어도
    #       "오늘 들어온 것" 일 수는 있다. 빼는 건 '지연' 하나다.
    #    ⚠️ 프런트 `GANTT_OVERDUE_POLICY`(js/04a)의 **사본**이다 — 한쪽만 고치면 화면과
    #       텔레그램이 갈린다(`BRIEF_ROLE_FIELD` 와 같은 처지).
    late = [it for it in mine
            if it['end'] and it['end'] < today and it['status'] != '완료'
            and not (DAILY_BRIEF.get('skipMailRowsInLate', True) and it.get('mail'))]
    due_today = [it for it in mine if it['end'] == today and it['status'] != '완료']
    start_today = [it for it in mine if it['start'] == today]
    week = [it for it in mine if it['end'] and today < it['end'] <= week_end and it['status'] != '완료']
    cap = DAILY_BRIEF['maxPerSection']

    def sec(title, rows, with_date):
        if not rows:
            return []
        out = ['\n<b>%s</b> %d건' % (title, len(rows))]
        for it in sorted(rows, key=lambda x: (x['end'] or x['start'] or today))[:cap]:
            d = ''
            if with_date and it['end']:
                d = ' · ~%s' % it['end'].strftime('%m/%d')
            out.append('\u2022 %s <i>[%s]</i>%s' % (html.escape(it['name']), html.escape(it['project']), d))
        if len(rows) > cap:
            out.append('  … 외 %d건' % (len(rows) - cap))
        return out

    lines = ['\u2600\ufe0f <b>%s 아침 브리핑</b> — %s' % (today.strftime('%m/%d(%a)'), html.escape(str(member.get('name') or member.get('key') or '')))]
    lines += sec('\U0001F534 지연(미완료)', late, True)
    lines += sec('\U0001F4C5 오늘 마감', due_today, False)
    lines += sec('\u25B6\ufe0f 오늘 시작', start_today, False)
    lines += sec('\U0001F4C6 이번 주 마감', week, True)
    has_tasks = bool(late or due_today or start_today or week)
    if yesterday_written is False:
        lines.append('\n\U0001F4D4 어제 일일보고가 <b>없습니다</b> — 이 대화에 적어 보내면 저장됩니다.')
    if not has_tasks and yesterday_written is not False and not DAILY_BRIEF['sendIfEmpty']:
        return None
    if not has_tasks:
        lines.append('\n오늘 마감·지연 업무는 없습니다.')
    if errors:
        lines.append('\n\u26a0\ufe0f 프로젝트 %d개를 읽지 못해 그 업무는 빠졌습니다.' % len(errors))
    pend = _tg_pending_counts(member.get('key'))     # 📥 앱이 올린 보관함 대기 건수(하루 안 것만)
    if pend and (pend.get('withCands') or pend.get('waiting')):
        lines.append('\n\U0001F4E5 보관함 대기 %d건 — 후보 있는 %d건은 <b>/배분</b> 으로 폰에서 보낼 수 있습니다.'
                     % (int(pend.get('waiting') or 0), int(pend.get('withCands') or 0)))
    lines.append('\n<i>질문은 /ai 로, 보고는 그냥 적어서, 보고 초안은 /ai 오늘 보고 초안.</i>')
    return '\n'.join(lines)


def _daily_brief_tick(force=False, only_key=None):
    """☀️ 아침 브리핑. 담당 PC 한 대 · 근무일 · 시각 이후 · 하루 한 번. `only_key` 면 그 사람에게만(미리보기)."""
    ok, roster = _daily_is_notifier()
    if not ok and not force:
        return {'ok': True, 'skipped': 'not-notifier'}
    if not roster:
        return {'ok': False, 'message': '명단을 읽지 못해 발송하지 않습니다'}
    st = _daily_state()
    enabled = st.get('briefEnabled', DAILY_BRIEF['enabled'])
    if not enabled and not force:
        return {'ok': True, 'skipped': 'disabled'}
    now = datetime.now(KST)
    today = now.date()
    date_str = today.strftime('%Y-%m-%d')
    if not force:
        if _daily_nonworkday(date_str):
            return {'ok': True, 'skipped': 'non-workday'}
        try:
            bh, bm = [int(x) for x in str(st.get('briefAt') or DAILY_BRIEF['at']).split(':')]
        except Exception:
            bh, bm = 8, 30
        if (now.hour, now.minute) < (bh, bm):
            return {'ok': True, 'skipped': 'before-time'}
    fired = st.setdefault('briefLastFired', {})
    targets = []
    for m in roster:
        if only_key and str(m.get('key', '')).lower() != str(only_key).lower():
            continue
        if m.get('active') is False or not m.get('tgChatId') or m.get('brief') is False:
            continue
        if not force and fired.get(m['key']) == date_str:
            continue
        on_leave = any(str(l.get('from', '')) <= date_str <= str(l.get('to', l.get('from', '')))
                       for l in (m.get('leave') or []))
        if on_leave:
            continue
        targets.append(m)
    if not targets:
        return {'ok': True, 'sent': [], 'skipped': 'no-targets'}
    teams = set(str(m.get('team') or '').strip() for m in targets if str(m.get('team') or '').strip())
    try:
        items, errors = _brief_load_items(teams)
    except Exception as e:
        print("[브리핑] 색인을 못 읽어 발송하지 않습니다: %s" % e)
        return {'ok': False, 'message': '프로젝트 색인 조회 실패: %s' % e}
    # 어제(마지막 근무일) 보고 여부 — 조회 실패는 "모름"(None) 으로 두고 그 줄을 안 쓴다
    yday = today - timedelta(days=1)
    for _ in range(7):
        if not _daily_nonworkday(yday.strftime('%Y-%m-%d')):
            break
        yday -= timedelta(days=1)
    yday_str = yday.strftime('%Y-%m-%d')
    sent, empty = [], []
    for m in targets:
        try:
            doc = _daily_nas_json(_daily_rel(yday_str, m['key']))
            written = bool(doc and (doc.get('dayType') in ('leave', 'trip', 'training', 'half')
                                     or doc.get('items') or doc.get('next') or doc.get('issue')))
        except Exception:
            written = None
        text = _brief_text_for(m, items, today, errors, written)
        if not text:
            empty.append(m['key'])
            if not force:
                fired[m['key']] = date_str          # 오늘은 볼 게 없었다 — 또 안 따진다
            continue
        res = send_telegram_msg(text, m['tgChatId'])
        if res.get('ok'):
            sent.append(m['key'])
            if not force:
                fired[m['key']] = date_str
        else:
            print("[브리핑] 발송 실패(%s): %s" % (m['key'], res))
    if not force:
        _daily_state_save(st)
    return {'ok': True, 'sent': sent, 'empty': empty, 'projectsFailed': len(errors), 'items': len(items)}


def _daily_tg_tick(force=False):
    """텔레그램 DM → 그 사람의 하루 파일. 폴링은 담당 PC 한 대에서만."""
    ok, roster = _daily_is_notifier()
    if not ok and not force:
        return {'ok': True, 'skipped': 'not-notifier'}
    if not TELEGRAM_TOKEN:
        return {'ok': False, 'message': '텔레그램 토큰이 없습니다'}
    if not roster:
        return {'ok': False, 'message': '명단을 읽지 못했습니다 — 처리하지 않습니다'}
    by_chat = {}
    for m in roster:
        if m.get('tgChatId'):
            by_chat[str(m['tgChatId'])] = m
    st = _daily_state()
    offset = st.get('offset') or 0
    # ⚠️⚠️ [2026-11-05] **처음 켤 땐 쌓인 것을 보고로 집어넣지 않는다.**
    #    텔레그램은 안 읽은 업데이트를 ~24시간 들고 있고, 이 봇은 알람에도 쓰여서
    #    사람들이 답장을 보낸 적이 있다. `offset` 이 없는 첫 틱에서 그걸 다 가져오면
    #    **옛 잡담이 오늘 보고에 들어가고 되읽기 메시지까지 쏟아진다.**
    #    (메일 감시에 이미 같은 가드가 있다 — `_mail_watch_tick` 의 "처음 켤 땐 안 보냄")
    #    → 첫 틱은 오프셋만 넘기고 **아무것도 쓰지 않는다.** 다음 틱부터 받는다.
    first_run = not st.get('primed')
    try:
        r = requests.get('https://api.telegram.org/bot%s/getUpdates' % TELEGRAM_TOKEN,
                         params={'offset': offset, 'timeout': 0, 'limit': 50}, timeout=20)
        j = r.json()
    except Exception as e:
        return {'ok': False, 'message': '수신 실패: %s' % e}
    if not j.get('ok'):
        return {'ok': False, 'message': str(j)[:200]}
    if first_run:
        skip_last = offset
        for up in (j.get('result') or []):
            skip_last = max(skip_last, (up.get('update_id') or 0) + 1)
        st['primed'] = True
        st['offset'] = skip_last
        _daily_state_save(st)
        print("[일일보고] 첫 수신 틱 — 쌓여 있던 %d건은 보고로 넣지 않고 넘겼습니다."
              % len(j.get('result') or []))
        return {'ok': True, 'handled': 0, 'ignored': 0, 'primed': True,
                'skippedBacklog': len(j.get('result') or []), 'offset': skip_last}
    handled, ignored, last = 0, 0, offset
    for up in (j.get('result') or []):
        uid = up.get('update_id') or 0
        # 📥 inline 버튼 답(/배분) — 글이 아니라 callback 으로 온다. 접수 쓰기 실패면 offset 을 안 올린다.
        cq = up.get('callback_query')
        if cq:
            if _tg_dist_callback(cq, by_chat, uid) is False:
                break
            handled += 1
            last = max(last, uid + 1)
            continue
        msg = up.get('message') or up.get('edited_message') or {}
        # 📎 사진엔 `text` 가 없다 — 설명은 `caption` 으로 온다.
        #    옛 코드는 그래서 사진·문서를 조용히 버렸다.
        text = (msg.get('text') or msg.get('caption') or '').strip()
        att = _tg_attachment(msg)
        chat = str(((msg.get('chat') or {}).get('id')) or '')
        if (not text and not att) or not chat:
            last = max(last, uid + 1)
            continue
        person = by_chat.get(chat)
        if not person:
            print("[일일보고] 등록되지 않은 chat_id 메시지 무시")
            ignored += 1
            last = max(last, uid + 1)
            continue
        # 🤖 AI 문답 명령인가 — 일일보고 글보다 **먼저** 가른다(접두어 기준, 사진이 달린
        #    메시지는 보고로 간다). 쓰기 실패면 offset 을 안 올리고 멈춘다(일일보고와 같은 규칙).
        if text and not att:
            _ai = _tg_ai_handle(person, chat, text, uid, st)
            if _ai is True:
                handled += 1
                last = max(last, uid + 1)
                continue
            if _ai is False:
                break
        date_str = datetime.now(KST).strftime('%Y-%m-%d')
        rel = _daily_rel(date_str, person['key'])
        try:
            doc = _daily_nas_json(rel) or {
                'date': date_str, 'key': person['key'], 'name': person.get('name', ''),
                'team': person.get('team', ''), 'dayType': 'work',
                'items': [], 'files': [], 'next': '', 'issue': '', 'rev': 0}
            # 📎 첨부 하나가 실패해도 **큐를 막지 않는다.** 밖에 있는 `except` 의
            #    `break` 로 떨어지면 다음 핅이 같은 업데이트를 또 받아 **사진 한 장이
            #    그 뒤 모든 사람의 보고를 옆구혀 세운다.**
            att_err = ''
            if att:
                try:
                    taken = set(f.get('safe') for f in (doc.get('files') or []) if f.get('safe'))
                    doc.setdefault('files', []).append(
                        _daily_tg_save_file(att, date_str, person['key'], taken))
                except Exception as fe:
                    att_err = str(fe)
                    print("[일일보고] 첨부 저장 실패(글만 기록): %s" % att_err)
            word = text.strip()
            if not word and (not att or att_err):
                # 쓸 게 없다 — `rev` 를 공에 올리지 않고 사유만 돌려줌다.
                if att_err:
                    send_telegram_msg('⚠️ 첨부를 저장하지 못했습니다 — ' + html.escape(att_err), chat)
                last = max(last, uid + 1)
                continue
            if not word:
                pass                 # 📎 사진만 왔다 — 글은 손대지 않는다
            elif word in DAILY_TG_DAYTYPES:
                doc['dayType'] = DAILY_TG_DAYTYPES[word]
            elif word in ('/다시', '/reset'):
                # ⚠️ 글만 지운다 — 사진까지 지우면 NAS 에 고아 바이트가 남고
                #    되돌릴 수도 없다(사진은 화면에서 하나지 지운다).
                doc['items'], doc['next'], doc['issue'] = [], '', ''
            else:
                doc = _daily_apply_text(doc, text)
            doc['rev'] = (doc.get('rev') or 0) + 1
            doc['savedAt'] = datetime.now(KST).isoformat()
            n = _nas()
            n.put(n.abs_path(rel), json.dumps(doc, ensure_ascii=False, indent=2).encode('utf-8'))
            back = _daily_nas_json(rel) or doc
            send_telegram_msg(_daily_summary_text(back), chat)
            # 🔁 [2026-11-09] 질문을 보고로 저장한 게 아닌지 **드러낸다**(조용한 실패 방지).
            #    막지도 되묻지도 않는다 — 글은 이미 안전하게 저장됐고, 고치는 길만 알려 준다.
            if TG_MODE.get('hintQuestion') and text and not att and _tg_looks_question(text):
                send_telegram_msg('ℹ️ 질문이었나요? 지금은 <b>일일보고 모드</b>라 보고에 저장했습니다.\n'
                                  '· 방금 글 지우기: <code>/다시</code>\n'
                                  '· 한 번만 묻기: <code>/ai 질문</code>\n'
                                  '· 계속 문답으로: <code>/문답</code>', chat)
            if att_err:
                send_telegram_msg('⚠️ 첨부는 저장하지 못했습니다 — ' + html.escape(att_err), chat)
            handled += 1
            last = max(last, uid + 1)
        except Exception as e:
            print("[일일보고] 수신 처리 실패(다음 틱 재시도): %s" % e)
            break
    if last != offset:
        st['offset'] = last
        _daily_state_save(st)
    return {'ok': True, 'handled': handled, 'ignored': ignored, 'offset': last}


def _daily_report_tick(force=False):
    """미작성 알림. **모르면 안 보낸다.**"""
    ok, roster = _daily_is_notifier()
    if not ok and not force:
        return {'ok': True, 'skipped': 'not-notifier'}
    if not roster:
        return {'ok': False, 'message': '명단을 읽지 못해 발송하지 않습니다'}
    now = datetime.now(KST)
    date_str = now.strftime('%Y-%m-%d')
    if _daily_nonworkday(date_str):
        return {'ok': True, 'skipped': 'non-workday'}
    cfg = _daily_state()
    try:
        dh, dm = [int(x) for x in str(cfg.get('dueAt') or '17:00').split(':')]
    except Exception:
        dh, dm = 17, 0
    if (now.hour, now.minute) < (dh, dm):
        return {'ok': True, 'skipped': 'before-due'}
    sent, skipped = [], []
    # ⚠️⚠️ **먼저 전부 읽고, 그다음 보낸다.** 읽기와 보내기를 한 루프에 섞으면
    #    뒤쪽 사람의 조회가 실패해도 **앞사람에게는 이미 나간 뒤**다(하네스가 잡았다).
    #    "모르면 안 보낸다"는 한 명이라도 모르면 0건이어야 성립한다.
    targets = []
    for m in roster:
        if m.get('active') is False or not m.get('tgChatId'):
            continue
        if (cfg.get('lastFired') or {}).get(m['key']) == date_str:
            continue
        on_leave = any(str(l.get('from', '')) <= date_str <= str(l.get('to', l.get('from', '')))
                       for l in (m.get('leave') or []))
        if on_leave:
            skipped.append([m['key'], 'leave'])
            continue
        try:
            doc = _daily_nas_json(_daily_rel(date_str, m['key']))
        except Exception as e:
            print("[일일보고] 조회 실패 — 아무에게도 보내지 않습니다: %s" % e)
            return {'ok': False, 'message': '조회 실패로 발송 중단: %s' % e}
        if doc:
            if doc.get('dayType') in ('leave', 'trip', 'training') or \
               doc.get('items') or doc.get('next') or doc.get('issue'):
                skipped.append([m['key'], 'written'])
                continue
        targets.append(m)

    for m in targets:
        res = send_telegram_msg(
            '\U0001F4D4 <b>일일 업무보고</b>\n오늘(%s) 보고가 아직 없습니다.\n'
            '이 대화에 그냥 적어 보내시면 그대로 저장됩니다. (휴가면 "휴가" 한 단어만)' % date_str,
            m['tgChatId'])
        if res.get('ok'):
            cfg.setdefault('lastFired', {})[m['key']] = date_str
            sent.append(m['key'])
        else:
            print("[일일보고] 알림 발송 실패(%s): %s" % (m['key'], res))
    _daily_state_save(cfg)
    return {'ok': True, 'sent': sent, 'skipped': skipped}


@app.route('/daily/tick', methods=['POST'])
def daily_tick_api():
    """사람이 눌러 1회 확인(force). 자동 틱은 스케줄러가 돌린다."""
    data = request.json or {}
    out = {}
    if data.get('inbound', True):
        out['inbound'] = _daily_tg_tick(force=bool(data.get('force')))
    if data.get('notify', True):
        out['notify'] = _daily_report_tick(force=bool(data.get('force')))
    # ☀️ 브리핑은 **시킬 때만**(기본 False) — 확인 버튼이 팀 전원에게 브리핑을 쏘면 안 된다. `briefOnly` 로 내게만.
    if data.get('brief'):
        out['brief'] = _daily_brief_tick(force=bool(data.get('force')), only_key=data.get('briefOnly') or None)
    out['ok'] = True
    return jsonify(out)


@app.route('/daily/config', methods=['GET', 'POST'])
def daily_config_api():
    st = _daily_state()
    if request.method == 'POST':
        d = request.json or {}
        if 'dueAt' in d:
            st['dueAt'] = str(d['dueAt'])[:5]
        if 'briefAt' in d:
            st['briefAt'] = str(d['briefAt'])[:5]
        if 'briefEnabled' in d:
            st['briefEnabled'] = bool(d['briefEnabled'])
        _daily_state_save(st)
    ok, roster = _daily_is_notifier()
    return jsonify({'ok': True, 'dueAt': st.get('dueAt') or '17:00', 'isNotifier': ok,
                    'briefAt': st.get('briefAt') or DAILY_BRIEF['at'],
                    'briefEnabled': bool(st.get('briefEnabled', DAILY_BRIEF['enabled'])),
                    'rosterCount': len(roster or []), 'offset': st.get('offset') or 0})


@app.route('/schedule', methods=['GET', 'POST'])
def schedule_api():
    global SCHEDULE_RULES
    if request.method == 'GET':
        with _SCHEDULE_LOCK:
            return jsonify({'ok': True, 'rules': SCHEDULE_RULES})

    data     = request.json or {}
    rule_id  = data.get('id') or str(uuid.uuid4())
    rule_type = data.get('type', 'notice')
    rule = {
        'id':            rule_id,
        'type':          rule_type,
        'title':         (data.get('title') or '').strip(),
        'message':       data.get('message', ''),
        'recipients':    data.get('recipients', []),
        'dateMode':      data.get('dateMode', 'range'),
        'startDate':     data.get('startDate', ''),
        'endDate':       data.get('endDate', ''),
        'specificDates': data.get('specificDates', []),
        'dayInterval':   max(1, int(data.get('dayInterval', 1) or 1)),
        'hourStart':     data.get('hourStart', '09:00'),
        'hourEnd':       data.get('hourEnd', '21:00'),
        'hourInterval':  max(0.25, float(data.get('hourInterval', 1) or 1)),
        'enabled':       bool(data.get('enabled', True)),
        'createdAt':     data.get('createdAt') or datetime.now(KST).isoformat(),
    }
    if rule_type == 'alarm':
        # 💡 업무별 알람은 "지금" 제목/내용을 저장하는 게 아니라, driveFileId+rowIdx로 어느 업무인지만
        #    기억해뒀다가 발송 직전에 매번 구글드라이브에서 최신 상태를 다시 읽는다(_fire_alarm_rule).
        rule['driveFileId']                     = data.get('driveFileId', '')
        rule['rowIdx']                          = data.get('rowIdx')
        rule['taskNameSnapshot']                = data.get('taskNameSnapshot', '')
        rule['ccRecipientsSnapshot']            = data.get('ccRecipientsSnapshot', []) or []
        rule['allowedExternalDomainsSnapshot']  = data.get('allowedExternalDomainsSnapshot', []) or []
        if not rule['title']:
            rule['title'] = rule['taskNameSnapshot'] or '(제목 없음)'
        if not rule['driveFileId'] or rule['rowIdx'] is None:
            return jsonify({'ok': False, 'error': 'driveFileId/rowIdx가 필요합니다 (알람 규칙)'}), 400
    if not rule['title']:
        return jsonify({'ok': False, 'error': '제목이 필요합니다'}), 400

    with _SCHEDULE_LOCK:
        existing = next((r for r in SCHEDULE_RULES if r.get('id') == rule_id), None)
        if existing:
            # 💡 이력(마지막 발송 버킷)은 유지한 채 나머지 설정만 덮어씀 — 안 그러면 저장할 때마다
            #    "이미 오늘 보냈는지" 기록이 사라져 같은 시각에 중복 발송될 수 있음.
            rule['lastFiredBucket'] = existing.get('lastFiredBucket')
            rule['lastFiredAt']     = existing.get('lastFiredAt')
            SCHEDULE_RULES[SCHEDULE_RULES.index(existing)] = rule
        else:
            SCHEDULE_RULES.append(rule)
        save_schedule_rules(SCHEDULE_RULES)
    return jsonify({'ok': True, 'id': rule_id})


@app.route('/schedule/<rule_id>', methods=['DELETE'])
def schedule_delete_api(rule_id):
    global SCHEDULE_RULES
    with _SCHEDULE_LOCK:
        before = len(SCHEDULE_RULES)
        SCHEDULE_RULES = [r for r in SCHEDULE_RULES if r.get('id') != rule_id]
        removed = before - len(SCHEDULE_RULES)
        save_schedule_rules(SCHEDULE_RULES)
    return jsonify({'ok': True, 'removed': removed > 0})


# ══════════════════════════════════════════════════════════════
# 📂 업무별(개별 태스크) 알람용 — 구글드라이브 실시간 조회 (서비스계정, 읽기전용)
#    kortek_pm.html은 구글시트가 아니라, 이 폴더(GANTT_SHARED_FOLDER_ID) 안의
#    JSON 파일 1개(프로젝트당 1개)에 전체 데이터를 저장한다 — js/04a~04k-core-app-*.js 참고.
#    여기서는 그 JSON을 그대로 읽어 collectAlarmItems()(js/22c-summary-mctable-core2.js:3)와
#    동등한 로직으로 딱 한 업무(행)의 "지금 이 순간" 상태를 재계산한다.
# ══════════════════════════════════════════════════════════════
_drive_creds = None


def _drive_get_access_token() -> str:
    """서비스계정 JSON 키로 구글드라이브 접근 토큰(읽기전용)을 발급/갱신해서 돌려준다."""
    global _drive_creds
    if not GOOGLE_AUTH_OK:
        raise RuntimeError('google-auth 미설치 — pip install google-auth')
    if not os.path.exists(GOOGLE_SERVICE_ACCOUNT_FILE):
        raise RuntimeError(f'서비스계정 키 파일을 찾을 수 없습니다: {GOOGLE_SERVICE_ACCOUNT_FILE}')
    if _drive_creds is None:
        _drive_creds = _google_service_account.Credentials.from_service_account_file(
            GOOGLE_SERVICE_ACCOUNT_FILE,
            scopes=['https://www.googleapis.com/auth/drive.readonly']
        )
    if not _drive_creds.valid:
        _drive_creds.refresh(_GoogleAuthRequest())
    return _drive_creds.token


def _drive_find_child(parent_id: str, name: str, mime_type: str = None):
    """parent_id 폴더 바로 밑에서 이름이 name인 파일/폴더 1개의 id를 찾는다 (없으면 None)."""
    token = _drive_get_access_token()
    q = f"name='{name}' and trashed=false and '{parent_id}' in parents"
    if mime_type:
        q += f" and mimeType='{mime_type}'"
    resp = requests.get(
        'https://www.googleapis.com/drive/v3/files',
        params={'q': q, 'supportsAllDrives': 'true', 'includeItemsFromAllDrives': 'true', 'fields': 'files(id,name)'},
        headers={'Authorization': f'Bearer {token}'}, timeout=15
    )
    resp.raise_for_status()
    files = (resp.json() or {}).get('files') or []
    return files[0]['id'] if files else None


def _drive_read_json_file(file_id: str) -> dict:
    """파일 id로 JSON 파일 내용을 그대로 읽어온다 (alt=media)."""
    token = _drive_get_access_token()
    resp = requests.get(
        f'https://www.googleapis.com/drive/v3/files/{file_id}',
        params={'alt': 'media', 'supportsAllDrives': 'true'},
        headers={'Authorization': f'Bearer {token}'}, timeout=20
    )
    resp.raise_for_status()
    return resp.json()


_app_config_folder_cache = {'id': None}


def _drive_get_app_config_folder_id():
    """'App_Config' 하위 폴더 id — AddressBook_Shared.json 등이 들어있다 (js: getOrCreateConfigFolder)."""
    if _app_config_folder_cache['id']:
        return _app_config_folder_cache['id']
    fid = _drive_find_child(GANTT_SHARED_FOLDER_ID, 'App_Config', mime_type='application/vnd.google-apps.folder')
    _app_config_folder_cache['id'] = fid
    return fid


_address_book_cache = {'data': [], 'loadedAt': 0.0}


def _drive_load_address_book(force: bool = False) -> list:
    """AddressBook_Shared.json(이름→이메일/텔레그램ID, 모든 프로젝트 공유) — 자주 안 바뀌므로 캐시."""
    now = time.time()
    if not force and (now - _address_book_cache['loadedAt']) < ADDRESS_BOOK_CACHE_TTL_SEC:
        return _address_book_cache['data']
    try:
        folder_id = _drive_get_app_config_folder_id() or GANTT_SHARED_FOLDER_ID
        file_id = _drive_find_child(folder_id, 'AddressBook_Shared.json')
        if not file_id and folder_id != GANTT_SHARED_FOLDER_ID:
            file_id = _drive_find_child(GANTT_SHARED_FOLDER_ID, 'AddressBook_Shared.json')  # 구버전 위치 폴백
        if file_id:
            data = _drive_read_json_file(file_id)
            _address_book_cache['data'] = data.get('addressBook') or []
            _address_book_cache['loadedAt'] = now
    except Exception as e:
        print(f"[업무알람] 주소록 로드 실패(이전 캐시로 계속 진행): {e}")
    return _address_book_cache['data']


# ── 이름 매칭 유틸 (js/22b-summary-mctable-core1.js의 _addrSplitNames/_addrStripTitleSuffix/
#    _addrFindByName과 동일 로직 — 메일 본문에서 뽑힌 발신/수신인 이름을 주소록과 매칭하기 위함) ──
ADDR_KO_TITLE_WORDS = [
    '회장', '부회장', '사장', '부사장', '대표', '전무', '상무', '이사', '감사',
    '본부장', '소장', '센터장', '실장', '팀장', '파트장', '그룹장', '랩장',
    '수석', '책임', '선임', '주임', '매니저', '대리', '과장', '차장', '부장', '사원', '연구원'
]
ADDR_EN_TITLE_WORDS = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'manager', 'director', 'leader', 'president', 'vp', 'ceo', 'cto', 'coo']
KORTEK_INTERNAL_DOMAIN = 'kortek.co.kr'


def _addr_strip_title_suffix(name: str) -> str:
    n = (name or '').strip()
    changed = True
    while changed:
        changed = False
        before = n
        n = re.sub(r'\s*(님|씨)\s*$', '', n).strip()
        for t in ADDR_KO_TITLE_WORDS:
            if n.endswith(t) and len(n) > len(t):
                n = n[:-len(t)].strip(); break
            if n.startswith(t) and len(n) > len(t):
                n = n[len(t):].strip(); break
        for t in ADDR_EN_TITLE_WORDS:
            re_suf = re.compile(r'[.,]?\s*' + t + r'\.?$', re.IGNORECASE)
            re_pre = re.compile(r'^' + t + r'\.?\s*', re.IGNORECASE)
            if re_suf.search(n):
                n = re_suf.sub('', n).strip(); break
            if re_pre.search(n):
                n = re_pre.sub('', n).strip(); break
        if n != before:
            changed = True
    return n


def _addr_split_names(s: str) -> list:
    """"정민희/임희철", "박용훈 외 다수" 같은 패턴도 개별 이름으로 분리"""
    if not s:
        return []
    out = []
    for p in re.split(r'[,，/]', str(s)):
        p = re.sub(r'\s*외\s*(\d+\s*(명|인)?|다수)?\s*$', '', p.strip()).strip()
        if p:
            out.append(p)
    return out


def _addr_find_by_name(address_book: list, name: str):
    """한글 이름 정확일치 → 영문 이름 정확일치 → (둘 다 실패 시) 직함/존칭 뗀 이름으로 재시도"""
    if not name:
        return None

    def try_exact(n):
        if not n:
            return None
        for p in address_book:
            if (p.get('name') or '').strip() == n:
                return p
        for p in address_book:
            if (p.get('nameEn') or '').strip().lower() == n.lower():
                return p
        return None

    trimmed = str(name).strip()
    found = try_exact(trimmed)
    if found:
        return found
    stripped = _addr_strip_title_suffix(trimmed)
    if stripped and stripped != trimmed:
        found = try_exact(stripped)
    return found


def _lookup_email(address_book: list, name: str) -> str:
    if not name:
        return ''
    trimmed = name.strip()
    if re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', trimmed):  # 이름 자리에 이메일이 이미 들어있는 경우
        return trimmed
    found = _addr_find_by_name(address_book, trimmed)
    return (found.get('email') or '') if found else ''


def _is_alarm_domain_allowed(email: str, allowed_external_domains: list) -> bool:
    """@kortek.co.kr은 항상 허용, 그 외 도메인은 규칙 저장 시점에 스냅샷된 허용 목록에 있어야 허용"""
    if not email:
        return False
    m = re.search(r'@([^@\s]+)$', email.strip().lower())
    if not m:
        return False
    if m.group(1) == KORTEK_INTERNAL_DOMAIN:
        return True
    return m.group(1) in (allowed_external_domains or [])


def _build_alarm_task_snapshot(project_data: dict, row_idx: int):
    """딱 한 업무(row_idx)의 "지금 이 순간" 상태를 계산한다 — collectAlarmItems()의 파이썬 버전.
       프로젝트 JSON은 저장 시점에 globalData의 모든 _밑줄필드(_level, _origDev 등)를 그대로
       보존하므로(js/04c-core-app-mail-pipeline.js:628 serializedGlobalData), 화면 렌더링 로직을 다시 짤 필요
       없이 저장된 값을 그대로 읽으면 된다. 대상이 아니면(알림 꺼짐/완료예정일 없음/행 없음) None."""
    global_data = project_data.get('globalData') or []
    if row_idx < 0 or row_idx >= len(global_data):
        return None
    row_obj = global_data[row_idx]
    if not isinstance(row_obj, dict):
        return None
    if not row_obj.get('_알림'):  # 알람이 등록되지 않은 업무
        return None

    cols    = row_obj.get('data') or []
    col_idx = project_data.get('colIdx') or {}

    def col(name):
        idx = col_idx.get(name)
        if idx is None or idx < 0 or idx >= len(cols):
            return ''
        return cols[idx]

    # 완료 예정일 — plan 컬럼(YYYY-MM-DD), 자동(🔓) 모드 행은 비어있고 _calcPlanTs만 있어 폴백 처리
    due_raw = str(col('plan') or '').strip()
    due_date = None
    if due_raw and due_raw != '-':
        try:
            due_date = datetime.strptime(due_raw[:10], '%Y-%m-%d').date()
        except Exception:
            due_date = None
    if due_date is None and row_obj.get('_calcPlanTs'):
        try:
            due_date = datetime.fromtimestamp(row_obj['_calcPlanTs'] / 1000, KST).date()
        except Exception:
            due_date = None
    if due_date is None:
        return None

    today     = datetime.now(KST).date()
    diff_days = (due_date - today).days
    due_str   = due_date.strftime('%Y-%m-%d')

    # 업무명 — 레벨별 원본 이름(_origDev/_origT1~4) 우선, 없으면 그 레벨의 WBS 컬럼값으로 폴백
    level = row_obj.get('_level')
    orig_by_level = {
        0: row_obj.get('_origDev'), 1: row_obj.get('_origT1'), 2: row_obj.get('_origT2'),
        3: row_obj.get('_origT3'), 4: row_obj.get('_origT4'),
    }.get(level)
    wbs_col_name = {0: 'devStage', 1: 'taskType1', 2: 'taskType2', 3: 'taskType3', 4: 'taskType4'}.get(level, 'wbs')
    task_name = str(orig_by_level or col(wbs_col_name) or '').strip() or '-'
    task_name = re.sub(r'^🌐\s*', '', task_name)

    content_raw = str(col('content') or '').strip()

    # 💡 [2026-09-01 신규] 알람 일정 모달의 "업무 정보" 편집칸에서 이 알람만을 위해 제목/내용을
    #    덮어썼으면(js/22c-summary-mctable-core2.js의 row._알림제목오버라이드/_알림내용오버라이드,
    #    saveAlarmSchedule/_asSaveRecurRule에서 저장) 발신인/수신인 추출은 원본 content_raw 그대로 두고
    #    실제 메일에 쓰이는 task_name/content만 덮어쓴다(collectAlarmItems의 파이썬 버전이라 동일하게 처리).
    title_override = row_obj.get('_알림제목오버라이드')
    if title_override and str(title_override).strip():
        task_name = str(title_override).strip()
    content_override = row_obj.get('_알림내용오버라이드')
    if content_override and str(content_override).strip():
        content_raw_for_mail = str(content_override).strip()
    else:
        content_raw_for_mail = content_raw

    # [발신인→수신인] 패턴 — 없으면 담당자(assignee) 컬럼을 발신인으로 취급
    arrow_match = re.search(r'\[([^\]→]+)→((?:\[[^\]]*\]|[^\]])+)\]', content_raw)

    def strip_tag(s):
        return re.sub(r'^\[[^\]]*\]\s*', '', (s or '').strip()).strip()

    sender_raw   = strip_tag(arrow_match.group(1)) if arrow_match else str(col('assignee') or '-').strip()
    receiver_raw = strip_tag(arrow_match.group(2)) if arrow_match else ''

    address_book   = _drive_load_address_book()
    sender_names   = _addr_split_names(sender_raw)
    receiver_names = _addr_split_names(receiver_raw)
    all_people     = list(dict.fromkeys([n for n in (sender_names + receiver_names) if n]))

    assignee        = ', '.join(sender_names) or '-'
    assignee_email  = ','.join(dict.fromkeys([e for e in (_lookup_email(address_book, n) for n in sender_names) if e]))
    receiver_str    = ', '.join(receiver_names) or '-'
    receiver_emails = list(dict.fromkeys([e for e in (_lookup_email(address_book, n) for n in receiver_names) if e]))

    status_val = str(col('status') or '').strip() if col_idx.get('status', -1) != -1 else ''

    return {
        'taskName': task_name, 'status': status_val,
        'assignee': assignee, 'assigneeEmail': assignee_email,
        'receiverStr': receiver_str, 'receiverEmails': receiver_emails,
        'allPeopleNames': all_people,
        'dueStr': due_str, 'diffDays': diff_days, 'content': content_raw_for_mail,
    }


def _rule_active_today(rule: dict, today) -> bool:
    """오늘이 이 규칙의 발송 대상 날짜인지(기간+N일마다, 또는 특정 날짜 목록)"""
    if rule.get('dateMode') == 'specific':
        return today.strftime('%Y-%m-%d') in (rule.get('specificDates') or [])
    start_s, end_s = rule.get('startDate'), rule.get('endDate')
    if not start_s or not end_s:
        return False
    try:
        start = datetime.strptime(start_s, '%Y-%m-%d').date()
        end   = datetime.strptime(end_s,   '%Y-%m-%d').date()
    except Exception:
        return False
    if today < start or today > end:
        return False
    interval = max(1, int(rule.get('dayInterval', 1) or 1))
    return (today - start).days % interval == 0


def _rule_today_buckets(rule: dict) -> list:
    """오늘 이 규칙이 울려야 할 시각들을 자정 기준 분(minute) 목록으로 반환 (시간창 + N시간마다)"""
    try:
        sh, sm = map(int, (rule.get('hourStart') or '09:00').split(':'))
        eh, em = map(int, (rule.get('hourEnd')   or '21:00').split(':'))
    except Exception:
        sh, sm, eh, em = 9, 0, 21, 0
    start_min = sh * 60 + sm
    end_min   = eh * 60 + em
    step_min  = max(15, int(round(float(rule.get('hourInterval', 1) or 1) * 60)))
    buckets, t = [], start_min
    while t <= end_min:
        buckets.append(t)
        t += step_min
    return buckets


def _fire_notice_rule(rule: dict):
    """공지(type='notice') 발송 — 규칙 저장 시점에 고정된 제목/내용을 등록된 수신자 전원에게 그대로 발송"""
    title      = rule.get('title', '')
    message    = rule.get('message', '')
    recipients = rule.get('recipients', []) or []
    subject    = f"[예약 발송] {title}"
    body_html  = '<div style="white-space:pre-wrap; font-family:\'맑은 고딕\',sans-serif;">' \
                 + html.escape(message).replace('\n', '<br>') + '</div>'
    for r in recipients:
        try:
            if r.get('emailOn') and r.get('email'):
                ok, err, _ = _send_mail_core(r['email'], subject, body_html)
                if not ok:
                    print(f"[예약발송 실패-메일] {r.get('name','')} <{r['email']}>: {err}")
        except Exception as e:
            print(f"[예약발송 예외-메일] {r.get('name','')}: {e}")
        try:
            if r.get('tgOn') and r.get('telegramId'):
                res = send_telegram_msg(f"📢 <b>{html.escape(title)}</b>\n{html.escape(message)}", r['telegramId'])
                if not res.get('ok'):
                    print(f"[예약발송 실패-텔레그램] {r.get('name','')}: {res}")
        except Exception as e:
            print(f"[예약발송 예외-텔레그램] {r.get('name','')}: {e}")
    print(f"[예약발송] '{title}' → 수신자 {len(recipients)}명 처리 ({datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')})")


def _fire_alarm_rule(rule: dict):
    """업무별 알람(type='alarm') 발송 — 저장된 내용이 아니라, 발송 직전 구글드라이브에서 해당 업무의
       최신 담당자/완료예정일/업무내용을 다시 읽어 그 시점 값으로 발송한다 (_build_alarm_task_snapshot)."""
    drive_file_id = rule.get('driveFileId')
    row_idx       = rule.get('rowIdx')
    label         = rule.get('taskNameSnapshot') or rule.get('title') or '(제목 없음)'
    if not drive_file_id or row_idx is None:
        print(f"[업무알람 실패] driveFileId/rowIdx가 없는 규칙입니다: {label}")
        return
    try:
        project_data = _drive_read_json_file(drive_file_id)
    except Exception as e:
        print(f"[업무알람 실패] '{label}' — 프로젝트 파일 조회 실패: {e}")
        return

    try:
        snap = _build_alarm_task_snapshot(project_data, int(row_idx))
    except Exception as e:
        print(f"[업무알람 실패] '{label}' — 업무 상태 계산 중 오류: {e}")
        return
    if not snap:
        print(f"[업무알람 건너뜀] '{label}' — 업무를 찾을 수 없거나(삭제됨) 알림이 꺼져있거나 완료예정일이 없습니다.")
        return

    allowed_domains = rule.get('allowedExternalDomainsSnapshot') or []
    assignee_email  = snap['assigneeEmail'] if _is_alarm_domain_allowed(snap['assigneeEmail'], allowed_domains) else ''
    receiver_emails = [e for e in snap['receiverEmails'] if _is_alarm_domain_allowed(e, allowed_domains)]
    to_email = ','.join(dict.fromkeys([e for e in ([assignee_email] + receiver_emails) if e]))
    # 💡 [2026-08-31] 수신 대상(기본수신/개별수신) 스냅샷 — 이메일 켜져있고(emailOn) 도메인 허용된
    #    사람만 이메일 cc로, 텔레그램 켜져있는(tgOn) 사람은 아래에서 별도로 텔레그램 발송
    cc_recipients = rule.get('ccRecipientsSnapshot') or []
    cc_mails = ','.join(dict.fromkeys(
        r.get('email', '') for r in cc_recipients
        if r.get('emailOn') and r.get('email') and _is_alarm_domain_allowed(r['email'], allowed_domains)
    ))

    project_meta = project_data.get('projectMeta') or {}
    proj_title   = ' > '.join([x for x in [project_meta.get('고객사'), project_meta.get('고객모델명')] if x]) or '프로젝트'
    d = snap['diffDays']
    d_day_plain = 'D-Day' if d == 0 else (f'D+{abs(d)}' if d < 0 else f'D-{d}')

    if not to_email:
        print(f"[업무알람 건너뜀] '{snap['taskName']}' — 발송 가능한 이메일이 없습니다(담당자/수신인 이메일 미등록 또는 외부 도메인 차단).")
    else:
        subject = f'[Gantt 알람] {proj_title} — "{snap["taskName"]}" 완료일 {d_day_plain}'
        content_html = html.escape(snap['content']).replace('\n', '<br>') if snap['content'] else ''
        content_row = (
            f'<tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; vertical-align:top; border:1px solid #dcdde1; width:90px; white-space:nowrap;">내용</td>'
            f'<td style="padding:6px 12px; white-space:normal; border:1px solid #dcdde1; word-break:break-word;">{content_html}</td></tr>'
        ) if content_html else ''
        body = f"""<div style="font-family:'맑은 고딕',sans-serif; font-size:14px; color:#333;">
  <p><b>{html.escape(snap['assignee'])}님께</b></p>
  <p>아래 업무의 완료 예정일이 <b style="color:#e74c3c;">{d_day_plain}일 ({snap['dueStr']})</b>입니다.</p>
  <table style="border-collapse:collapse; margin:12px 0; border:1px solid #dcdde1; width:100%; max-width:1000px;">
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">프로젝트</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">{html.escape(proj_title)}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">업무</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">{html.escape(snap['taskName'])}</td></tr>
    {content_row}
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">담당자</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">{html.escape(snap['assignee'])}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">완료 예정일</td><td style="padding:6px 12px; color:#e74c3c; border:1px solid #dcdde1;"><b>{snap['dueStr']}</b></td></tr>
  </table>
  <p style="color:#888; font-size:12px;">본 메일은 Gantt Chart 예약 발송(기간·반복) 알람에서 자동 발송되었습니다. 담당자/완료예정일/내용은 발송 시점 기준 최신 상태입니다.</p>
</div>"""
        ok, err, _ = _send_mail_core(to_email, subject, body, cc_mails)
        if not ok:
            print(f"[업무알람 실패-메일] '{snap['taskName']}': {err}")
        else:
            print(f"[업무알람] '{snap['taskName']}' → {to_email} 발송 완료 ({datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')})")

    # 텔레그램 — 담당자/수신인 중 (이메일 미등록이라 판단 불가하거나) 도메인이 허용된 사람만
    try:
        address_book = _drive_load_address_book()
        tg_msg = f"📌 [Gantt 알람] {proj_title}\n업무: {snap['taskName']}\n담당: {snap['assignee']}\n기한: {snap['dueStr']} ({d_day_plain})"
        if snap['content']:
            tg_msg += '\n내용: ' + snap['content'].replace('\n', ' ')[:2000]
        sent_chat_ids = set()

        def _tg_send_once(chat_id, label):
            if not chat_id or chat_id in sent_chat_ids:
                return
            sent_chat_ids.add(chat_id)
            res = send_telegram_msg(tg_msg, chat_id)
            if not res.get('ok'):
                print(f"[업무알람 실패-텔레그램] {label}: {res}")

        for name in snap['allPeopleNames']:
            person = _addr_find_by_name(address_book, name)
            if not person or not person.get('telegramId'):
                continue
            email = person.get('email') or ''
            if email and not _is_alarm_domain_allowed(email, allowed_domains):
                continue
            _tg_send_once(person['telegramId'], name)

        # 💡 수신 대상(기본수신/개별수신)에 텔레그램이 켜진 사람도 함께 발송
        for r in cc_recipients:
            if not r.get('tgOn') or not r.get('telegramId'):
                continue
            email = r.get('email') or ''
            if email and not _is_alarm_domain_allowed(email, allowed_domains):
                continue
            _tg_send_once(r['telegramId'], r.get('name', ''))
    except Exception as e:
        print(f"[업무알람 텔레그램 예외] {snap['taskName']}: {e}")


def _fire_rule(rule: dict):
    """규칙 종류에 따라 실제 발송 로직을 분기한다."""
    if rule.get('type') == 'alarm':
        _fire_alarm_rule(rule)
    else:
        _fire_notice_rule(rule)


def _scheduler_tick():
    """1분마다 호출 — 오늘 발송해야 할 규칙을 찾아 발송하고 lastFiredBucket을 기록한다.
       서버가 꺼져 있던 동안 지나간 시각은 유예시간(GRACE_MINUTES)을 넘기면 그냥 건너뛴다
       (밀린 발송을 몰아서 보내지 않음 — 사용자 요청사항)."""
    GRACE_MINUTES = 2  # 체크 주기(1분)보다 약간 넉넉하게
    now         = datetime.now(KST)
    today       = now.date()
    today_str   = today.strftime('%Y-%m-%d')
    cur_minutes = now.hour * 60 + now.minute

    with _SCHEDULE_LOCK:
        rules_snapshot = list(SCHEDULE_RULES)

    fired_any = False
    for rule in rules_snapshot:
        if not rule.get('enabled', True):
            continue
        try:
            if not _rule_active_today(rule, today):
                continue
            for bm in _rule_today_buckets(rule):
                if bm > cur_minutes or (cur_minutes - bm) > GRACE_MINUTES:
                    continue  # 아직 안 됐거나, 유예시간 넘겨 지나침(=건너뜀)
                bucket_key = f"{today_str}T{bm//60:02d}:{bm%60:02d}"
                if rule.get('lastFiredBucket') == bucket_key:
                    continue  # 이미 이 시각엔 발송함
                _fire_rule(rule)
                rule['lastFiredBucket'] = bucket_key
                rule['lastFiredAt']     = now.isoformat()
                fired_any = True
        except Exception as e:
            print(f"[예약발송 규칙 처리 오류] {rule.get('title','')}: {e}")

    if fired_any:
        with _SCHEDULE_LOCK:
            save_schedule_rules(SCHEDULE_RULES)


def _scheduler_loop():
    while True:
        try:
            _scheduler_tick()
        except Exception as e:
            print(f"[예약발송 스케줄러 오류] {e}")
        try:
            _sap_cleanup_daily_tick()
        except Exception as e:
            print(f"[SAP_DMS 자동정리 스케줄러 오류] {e}")
        try:
            _mail_watch_tick()
        except Exception as e:
            print(f"[메일 알림 스케줄러 오류] {e}")
        # 📔 일일보고 — 텔레그램 수신(입력) + 미작성 알림. 담당 PC 한 대에서만 돈다.
        try:
            _daily_tg_tick()
        except Exception as e:
            print(f"[일일보고 수신 스케줄러 오류] {e}")
        try:
            _daily_report_tick()
        except Exception as e:
            print(f"[일일보고 알림 스케줄러 오류] {e}")
        try:
            _daily_brief_tick()
        except Exception as e:
            print(f"[브리핑 스케줄러 오류] {e}")
        # 🧹 NAS 임시 폴더(.ganttput-*) — 하루 1회. 부르는 곳이 없어 154개까지 쌓였다(2026-11-09).
        try:
            _nas_tmp_sweep_tick()
        except Exception as e:
            print(f"[NAS 임시폴더 청소 오류] {e}")
        time.sleep(60)


# ══════════════════════════════════════════════════════════════
# 📧➡️💬 새 메일 → 텔레그램 알림 (2026-11-02, 사용자 요청)
# ══════════════════════════════════════════════════════════════
#  왜 백엔드인가: 브라우저가 꺼져 있어도 돌아야 "메일이 오면 알려준다"가 성립한다.
#  이 프로세스는 PC 시작 시 자동 실행(최소화)되므로 여기가 유일하게 맞는 자리다.
#
#  ⚠️ 메일을 **열지 않는다** — 목록 조회(mail_recent)만 쓴다. 상세 조회는 서버가
#     읽음 처리를 해 안읽음 배지를 줄인다(docs/mail-pipeline.md와 같은 원칙).
#  ⚠️ **로그인을 시도하지 않는다** — 끊겨 있으면 그냥 건너뛴다. 백그라운드 루프가
#     로그인을 반복하면 CAPTCHA가 뜨고 사내 계정이 잠긴다(docs/groupware.md).
#     로그인은 사람이 앱에서 1회 하는 것이고, 그 가드는 프런트(_gwEnsureLogin)에 있다.
#  ⚠️ 요약은 **AI 없이** 만든다. AI 키는 프런트에만 있고(무료 키는 하루 20회),
#     메일마다 AI를 부르면 하루 한도를 알림이 다 먹는다. 제목+보낸이+발췌 한 줄이면
#     "지금 봐야 하나"는 판단이 선다 — 깊은 요약은 앱에서 🤖 칩으로 한다.
MAIL_WATCH_FILE = os.path.join(BASE_DIR, 'mail_watch_config.json')

#  설정·상태 한 파일. 어휘·임계치는 전부 **데이터**다(코드에 박지 말 것 — CLAUDE.md).
_MAIL_WATCH_DEFAULTS = {
    'enabled':     False,
    'intervalMin': 10,          # 폴링 간격(분)
    'chatId':      '',          # 비우면 telegram_config.json 의 기본 Chat ID
    'folder':      'Inbox',
    'unreadOnly':  True,        # 이미 읽은 메일은 알릴 필요가 없다
    'quietFrom':   '22:00',     # 조용한 시간 — 그동안은 **모아 뒀다가** 끝나면 한 번에 보낸다
    'quietTo':     '07:30',
    'maxPerMsg':   10,          # 한 번에 적을 최대 건수(나머지는 "외 N건")
    'previewChars': 120,
    # 자동알림·광고는 기본으로 뺀다. 제목/보낸이에 이 말이 있으면 안 보낸다.
    'skipKeywords': ['스팸', 'Quota Warning', '광고', '[무료]', 'no-reply', 'noreply'],
    # 상태(사람이 건드릴 것 아님)
    'lastId':      0,
    'lastSentAt':  '',
    'lastError':   '',
    'lastCheckAt': ''
}


def _mail_watch_load():
    cfg = dict(_MAIL_WATCH_DEFAULTS)
    try:
        if os.path.exists(MAIL_WATCH_FILE):
            with open(MAIL_WATCH_FILE, 'r', encoding='utf-8') as f:
                cfg.update(json.load(f) or {})
    except Exception as e:
        print(f"[메일 알림] 설정 로드 실패: {e}")
    return cfg


def _mail_watch_save(cfg):
    try:
        with open(MAIL_WATCH_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[메일 알림] 설정 저장 실패: {e}")
        return False


def _hhmm_to_min(s, fallback):
    try:
        h, m = str(s).split(':')
        return int(h) * 60 + int(m)
    except Exception:
        return fallback


def _mail_watch_is_quiet(cfg, now=None):
    """조용한 시간인가. 22:00~07:30 처럼 **자정을 넘는** 구간을 그대로 받는다."""
    now = now or datetime.now(KST)
    cur = now.hour * 60 + now.minute
    a = _hhmm_to_min(cfg.get('quietFrom'), 22 * 60)
    b = _hhmm_to_min(cfg.get('quietTo'), 7 * 60 + 30)
    if a == b:
        return False                       # 같은 시각이면 조용한 시간 없음
    return (cur >= a or cur < b) if a > b else (a <= cur < b)


def _mail_watch_skip(m, cfg):
    hay = (str(m.get('subject') or '') + ' ' + str(m.get('from') or '')).lower()
    return any(str(k).lower() in hay for k in (cfg.get('skipKeywords') or []) if str(k).strip())


def _mail_watch_digest(mails, cfg):
    """텔레그램 본문(HTML). ⚠️ parse_mode=HTML 이라 escape 를 빼면 제목 하나로 반송된다."""
    n = int(cfg.get('maxPerMsg') or 10)
    pv = int(cfg.get('previewChars') or 120)
    head = f"📧 <b>새 메일 {len(mails)}건</b> ({datetime.now(KST).strftime('%m-%d %H:%M')})"
    lines = [head, '']
    for i, m in enumerate(mails[:n], 1):
        when = str(m.get('at') or '')[5:16].replace('T', ' ')
        lines.append(f"{i}. <b>{html.escape(str(m.get('subject') or ''))}</b>")
        lines.append(f"   {html.escape(str(m.get('from') or ''))} · {html.escape(when)}")
        prev = str(m.get('preview') or '').strip()
        if prev:
            lines.append(f"   {html.escape(prev[:pv])}")
    if len(mails) > n:
        lines.append(f"… 외 {len(mails) - n}건")
    # 🤖 [2026-11-08] 요약은 **요청 시만**(알림마다 AI 를 부르면 하루 한도를 알림이 먹는다 — 11-02 결정).
    #    텔레그램 다리(_tg_ai_handle)가 있으니 그 한 줄만 안내한다. 문구는 데이터(TG_AI_PREFIXES 첫 항목).
    lines.append('')
    lines.append('🤖 요약이 필요하면 <code>%s 최근 메일 요약</code> 이라고 답하세요 (PC 앱이 켜져 있을 때)' % TG_AI_PREFIXES[0])
    return '\n'.join(lines)


def _mail_watch_collect(cfg):
    """새 메일 목록을 돌려준다. (mails, error) — 로그인 안 돼 있으면 (None, 사유)."""
    try:
        import gw_bridge
    except Exception as e:
        return None, f'gw_bridge 로드 실패: {e}'
    try:
        info = gw_bridge.session_info()
    except Exception as e:
        return None, f'그룹웨어 상태 확인 실패: {e}'
    if not (info or {}).get('ok'):
        # 로그인하지 않는다 — 사람이 앱에서 로그인할 때까지 조용히 건너뛴다.
        return None, '그룹웨어 로그인 안 됨(앱에서 1회 로그인해 주세요)'
    try:
        yesterday = (datetime.now(KST) - timedelta(days=1)).strftime('%Y-%m-%d')
        r = gw_bridge.mail_recent(date_from=yesterday,
                                  folder=cfg.get('folder') or 'Inbox',
                                  unread_only=bool(cfg.get('unreadOnly')),
                                  limit=30)
        return (r or {}).get('mails') or [], ''
    except Exception as e:
        return None, f'메일 조회 실패: {e}'


def _mail_watch_tick(force=False):
    """1분마다 불린다. 보낼 게 있으면 보내고 상태를 적는다. 반환값은 /mail-watch/test 용."""
    cfg = _mail_watch_load()
    if not force and not cfg.get('enabled'):
        return {'ok': True, 'skipped': 'disabled'}
    now = datetime.now(KST)
    if not force:
        if _mail_watch_is_quiet(cfg, now):
            return {'ok': True, 'skipped': 'quiet'}     # 모아 뒀다가 조용한 시간이 끝나면 나간다
        last = cfg.get('lastCheckAt') or ''
        try:
            if last and (now - datetime.fromisoformat(last)).total_seconds() < int(cfg.get('intervalMin') or 10) * 60:
                return {'ok': True, 'skipped': 'interval'}
        except Exception:
            pass
    cfg['lastCheckAt'] = now.isoformat()

    mails, err = _mail_watch_collect(cfg)
    if mails is None:
        cfg['lastError'] = err
        _mail_watch_save(cfg)
        return {'ok': False, 'message': err}
    cfg['lastError'] = ''

    last_id = int(cfg.get('lastId') or 0)
    fresh = [m for m in mails if int(m.get('id') or 0) > last_id and not _mail_watch_skip(m, cfg)]
    top_id = max([int(m.get('id') or 0) for m in mails] + [last_id])

    # 처음 켠 직후엔 **보내지 않는다** — 받은메일함에 쌓인 것이 한꺼번에 날아가면 알림이 아니라 소음이다.
    if last_id == 0 and not force:
        cfg['lastId'] = top_id
        _mail_watch_save(cfg)
        return {'ok': True, 'skipped': 'first-run', 'baseline': top_id}

    if not fresh:
        cfg['lastId'] = top_id
        _mail_watch_save(cfg)
        return {'ok': True, 'sent': 0}

    res = send_telegram_msg(_mail_watch_digest(fresh, cfg), cfg.get('chatId') or None)
    if not (res or {}).get('ok'):
        cfg['lastError'] = f"텔레그램 발송 실패: {(res or {}).get('description') or (res or {}).get('error') or res}"
        _mail_watch_save(cfg)       # lastId 는 **안 올린다** — 다음 틱에 다시 보낸다
        return {'ok': False, 'message': cfg['lastError'], 'count': len(fresh)}
    cfg['lastId'] = top_id
    cfg['lastSentAt'] = now.isoformat()
    _mail_watch_save(cfg)
    print(f"[메일 알림] 새 메일 {len(fresh)}건 텔레그램 발송")
    return {'ok': True, 'sent': len(fresh)}


@app.route('/mail-watch/config', methods=['GET', 'POST'])
def mail_watch_config_api():
    """새 메일 → 텔레그램 알림 설정. GET 은 현재 값(+상태), POST 는 부분 수정."""
    cfg = _mail_watch_load()
    if request.method == 'GET':
        return jsonify({'ok': True, 'config': cfg, 'quietNow': _mail_watch_is_quiet(cfg)})
    body = request.get_json(force=True, silent=True) or {}
    for k in ('enabled', 'intervalMin', 'chatId', 'folder', 'unreadOnly',
              'quietFrom', 'quietTo', 'maxPerMsg', 'previewChars', 'skipKeywords'):
        if k in body:
            cfg[k] = body[k]
    # 켜는 순간 기준점을 다시 잡는다 — 껐던 동안 쌓인 메일이 한꺼번에 나가지 않게.
    if body.get('enabled') and not body.get('keepBaseline'):
        cfg['lastId'] = 0
    _mail_watch_save(cfg)
    return jsonify({'ok': True, 'config': cfg})


@app.route('/mail-watch/test', methods=['POST'])
def mail_watch_test_api():
    """지금 바로 한 번 돌린다(설정이 꺼져 있어도, 조용한 시간이어도). 설정 화면의 [지금 보내보기]."""
    try:
        return jsonify(_mail_watch_tick(force=True))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


# ── 설정 암호화 (Google Drive 저장용) ────────────────────────
@app.route('/telegram/encrypt', methods=['POST'])
def telegram_encrypt():
    if not CRYPTO_OK:
        return jsonify({'ok': False, 'error': 'cryptography 미설치: pip install cryptography'}), 500
    data     = request.json or {}
    password = data.get('password', '')
    config   = data.get('config',   {})
    if not password:
        return jsonify({'ok': False, 'error': '비밀번호 필요'}), 400
    try:
        encrypted = encrypt_data(config, password)
        return jsonify({'ok': True, 'encrypted': encrypted})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── Telegram 설정 복호화 (Google Drive 로드용) ────────────────────────
@app.route('/telegram/decrypt', methods=['POST'])
def telegram_decrypt():
    global TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_MEMBERS
    if not CRYPTO_OK:
        return jsonify({'ok': False, 'error': 'cryptography 미설치: pip install cryptography'}), 500
    data      = request.json or {}
    password  = data.get('password',  '')
    encrypted = data.get('encrypted', '')
    if not password or not encrypted:
        return jsonify({'ok': False, 'error': 'password, encrypted 필요'}), 400
    try:
        config           = decrypt_data(encrypted, password)
        TELEGRAM_TOKEN   = config.get('token',           '')
        TELEGRAM_CHAT_ID = config.get('default_chat_id', '')
        TELEGRAM_MEMBERS = config.get('members',         [])
        save_tg_config(config)
        return jsonify({'ok': True, 'message': f'Telegram 설정 로드 완료 ({len(TELEGRAM_MEMBERS)}명)',
                        'members_count': len(TELEGRAM_MEMBERS)})
    except Exception as e:
        err = str(e)
        if 'InvalidToken' in err or 'token' in err.lower():
            err = '비밀번호가 틀렸거나 파일이 손상되었습니다'
        return jsonify({'ok': False, 'error': err}), 400


# ── SMTP 설정 암호화 (Google Drive 저장용) ───────────────────
@app.route('/mail/encrypt', methods=['POST'])
def mail_encrypt():
    if not CRYPTO_OK:
        return jsonify({'ok': False, 'error': 'cryptography 미설치'}), 500
    data     = request.json or {}
    password = data.get('password', '')
    if not password:
        return jsonify({'ok': False, 'error': '비밀번호 필요'}), 400
    try:
        config    = {'host': SMTP_HOST, 'port': SMTP_PORT,
                     'user': SMTP_USER, 'pass': SMTP_PASS}
        encrypted = encrypt_data(config, password)
        return jsonify({'ok': True, 'encrypted': encrypted})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── SMTP 설정 복호화 (Google Drive 로드용) ───────────────────
@app.route('/mail/decrypt', methods=['POST'])
def mail_decrypt():
    global SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    if not CRYPTO_OK:
        return jsonify({'ok': False, 'error': 'cryptography 미설치'}), 500
    data      = request.json or {}
    password  = data.get('password',  '')
    encrypted = data.get('encrypted', '')
    if not password or not encrypted:
        return jsonify({'ok': False, 'error': 'password, encrypted 필요'}), 400
    try:
        config    = decrypt_data(encrypted, password)
        SMTP_HOST = config.get('host', SMTP_HOST)
        SMTP_PORT = int(config.get('port', SMTP_PORT))
        SMTP_USER = config.get('user', SMTP_USER)
        SMTP_PASS = config.get('pass', SMTP_PASS)
        # 로컬 파일에도 저장
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump({'host': SMTP_HOST, 'port': SMTP_PORT,
                       'user': SMTP_USER, 'pass': SMTP_PASS},
                      f, ensure_ascii=False)
        return jsonify({'ok': True, 'message': f'SMTP 설정 로드 완료 ({SMTP_USER})'})
    except Exception as e:
        err = str(e)
        if 'InvalidToken' in err or 'token' in err.lower():
            err = '비밀번호가 틀렸거나 파일이 손상되었습니다'
        return jsonify({'ok': False, 'error': err}), 400


# ── 전체 설정 암호화 (mail + telegram 한 번에) ───────────────
@app.route('/all/encrypt', methods=['POST'])
def all_encrypt():
    if not CRYPTO_OK:
        return jsonify({'ok': False, 'error': 'cryptography 미설치'}), 500
    data     = request.json or {}
    password = data.get('password', '')
    if not password:
        return jsonify({'ok': False, 'error': '비밀번호 필요'}), 400
    try:
        mail_cfg = {'host': SMTP_HOST, 'port': SMTP_PORT,
                    'user': SMTP_USER, 'pass': SMTP_PASS}
        tg_cfg   = {'token': TELEGRAM_TOKEN,
                    'default_chat_id': TELEGRAM_CHAT_ID,
                    'members': TELEGRAM_MEMBERS}
        return jsonify({
            'ok':               True,
            'mail_encrypted':   encrypt_data(mail_cfg, password),
            'tg_encrypted':     encrypt_data(tg_cfg,   password)
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── 전체 설정 복호화 (mail + telegram 한 번에) ───────────────
@app.route('/all/decrypt', methods=['POST'])
def all_decrypt():
    global SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    global TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_MEMBERS
    if not CRYPTO_OK:
        return jsonify({'ok': False, 'error': 'cryptography 미설치'}), 500
    data           = request.json or {}
    password       = data.get('password',       '')
    mail_encrypted = data.get('mail_encrypted', '')
    tg_encrypted   = data.get('tg_encrypted',   '')
    if not password:
        return jsonify({'ok': False, 'error': '비밀번호 필요'}), 400

    results = {}

    # SMTP 복호화
    if mail_encrypted:
        try:
            mc        = decrypt_data(mail_encrypted, password)
            SMTP_HOST = mc.get('host', SMTP_HOST)
            SMTP_PORT = int(mc.get('port', SMTP_PORT))
            SMTP_USER = mc.get('user', SMTP_USER)
            SMTP_PASS = mc.get('pass', SMTP_PASS)
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump({'host': SMTP_HOST, 'port': SMTP_PORT,
                           'user': SMTP_USER, 'pass': SMTP_PASS},
                          f, ensure_ascii=False)
            results['mail'] = {'ok': True, 'message': f'SMTP 로드 완료 ({SMTP_USER})'}
        except Exception as e:
            results['mail'] = {'ok': False, 'error': str(e)}

    # Telegram 복호화
    if tg_encrypted:
        try:
            tc               = decrypt_data(tg_encrypted, password)
            TELEGRAM_TOKEN   = tc.get('token',           '')
            TELEGRAM_CHAT_ID = tc.get('default_chat_id', '')
            TELEGRAM_MEMBERS = tc.get('members',         [])
            save_tg_config(tc)
            results['telegram'] = {'ok': True,
                                   'message': f'Telegram 로드 완료 ({len(TELEGRAM_MEMBERS)}명)'}
        except Exception as e:
            results['telegram'] = {'ok': False, 'error': str(e)}

    overall_ok = all(v.get('ok') for v in results.values())
    return jsonify({'ok': overall_ok, 'results': results})


# ── SAP GUI Scripting 연동 (AI 문답 "SAP" 조회) ──────────────────
#    [2026-09-14 신규, 같은 날 32비트 브릿지로 재설계] AI 문답(js/04g~04h)에서 질문에 "SAP"가
#    언급되면 프런트가 이 엔드포인트를 호출한다. 비밀번호를 전혀 저장/입력하지 않는다 —
#    사용자가 평소처럼 SAP GUI에 직접 로그인해둔 "이미 열려 있는 세션"에 SAP GUI
#    Scripting(COM)으로 올라타서 지금 보이는 화면을 읽기만 한다.
#
#    ⚠️ 실제 COM 작업은 이 파일(64비트 Python)이 직접 하지 않는다 — sap_bridge_32.py를
#    32비트 Python 서브프로세스로 띄워서 시킨다. 이유(실사용 진단으로 확정): SAP GUI
#    Scripting의 COM 컴포넌트가 32비트로만 등록돼 있어서(레지스트리
#    HKLM\SOFTWARE\WOW6432Node\SAP\SAPGUI Front\...\Security 에만 UserScripting 값이 있고
#    64비트 레지스트리 뷰에는 없음), 이 백엔드처럼 64비트 Python에서 직접
#    win32com.client.GetObject("SAPGUI")를 부르면 항상 COM 오류 -2147221020(MK_E_SYNTAX)로
#    실패한다 — SAP GUI가 켜져 있고 로그인돼 있고 스크립팅도 켜져 있어도 100% 재현되는
#    비트수 불일치 문제였다(32비트 Python으로 같은 호출을 하면 즉시 성공 확인됨). 앞으로 이
#    엔드포인트를 고칠 때 실제 SAP 화면 파싱 로직(그리드/필드 덤프)은 전부
#    sap_bridge_32.py에 있으니 그쪽을 수정할 것 — 여기(kortek_backend.py)엔 절대 win32com을
#    다시 끌어오지 말 것(64비트라 어차피 못 씀).
_SAP_BRIDGE_PATH = os.path.join(BASE_DIR, 'sap_bridge_32.py')

# ── 🔑 SAP 자동 로그인 설정 (2026-10-13, 사용자 요청 — 사내 전용이라 계정 저장 허용) ──────────────
#    SAP이 꺼져 있거나 로그아웃 상태면 sap_bridge_32.py의 `_get_sap_session()`이 이 설정으로 알아서 로그인한다
#    (실제 로그인 로직은 거기 — 이 파일은 설정 저장/조회만). 비밀번호는 **Windows DPAPI**(현재 Windows 사용자
#    계정에 묶인 암호화 — 다른 PC/계정에선 복호화 불가)로 암호화해 `sap_login_config.json`(.gitignore)에만
#    저장하고, **어떤 응답에도 비밀번호를 돌려주지 않는다**(상태 조회는 접속항목/클라이언트/ID만). 복호화는
#    브리지(32비트)가 로그인 직전에만 한다.
_SAP_LOGIN_CFG_PATH = os.path.join(BASE_DIR, 'sap_login_config.json')


def _dpapi_encrypt_b64(text):
    import ctypes
    import base64
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
    raw = text.encode('utf-8')
    buf = ctypes.create_string_buffer(raw, len(raw))
    blob_in = _BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    blob_out = _BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(blob_in), 'kortek-sap-login', None, None, None, 0, ctypes.byref(blob_out)):
        raise RuntimeError('Windows 데이터 보호(DPAPI)로 비밀번호를 암호화하지 못했습니다.')
    try:
        return base64.b64encode(ctypes.string_at(blob_out.pbData, blob_out.cbData)).decode('ascii')
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def _dpapi_decrypt_b64(b64):
    """위 `_dpapi_encrypt_b64`의 짝. 같은 Windows 계정에서만 풀린다.

    ⚠️ gw_bridge.py 에도 같은 함수가 있지만 **여기에 따로 둔다** — 인사관리(kInsa)는
       그룹웨어와 무관한 기능이라, 그룹웨어를 안 쓰는 PC에서 gw_bridge 를 import 해야
       비밀번호가 풀리는 구조는 맞지 않는다.
    ⚠️ 양쪽 모두 pOptionalEntropy(3번째 인자)가 None 이라 서로 호환된다. 두 번째 인자
       'kortek-sap-login' 은 **엔트로피가 아니라 설명 문자열**이라 복호화에 영향이 없다.
    """
    import ctypes
    import base64
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]
    raw = base64.b64decode(b64)
    buf = ctypes.create_string_buffer(raw, len(raw))
    bin_ = _BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    bout = _BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(bin_), None, None, None, None, 0, ctypes.byref(bout)):
        raise RuntimeError('저장된 비밀번호를 복호화하지 못했습니다'
                           '(다른 Windows 계정/PC에서 저장한 설정일 수 있음) — 다시 저장해주세요.')
    try:
        return ctypes.string_at(bout.pbData, bout.cbData).decode('utf-8')
    finally:
        ctypes.windll.kernel32.LocalFree(bout.pbData)


def _read_sap_login_cfg():
    try:
        with open(_SAP_LOGIN_CFG_PATH, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        return cfg if isinstance(cfg, dict) else None
    except Exception:
        return None


def _sap_logon_entries():
    """SAP Logon에 등록된 접속 항목 이름(Description)만 읽는다 — 주소/서버 정보는 읽지도 돌려주지도 않는다."""
    path = os.path.join(os.environ.get('APPDATA', ''), 'SAP', 'Common', 'saplogon.ini')
    text = ''
    for enc in ('utf-8', 'utf-16', 'cp949'):
        try:
            with open(path, 'r', encoding=enc) as f:
                text = f.read()
            if '[Description]' in text:
                break
        except Exception:
            continue
    names, in_sec = [], False
    for ln in text.splitlines():
        s = ln.strip()
        if s.startswith('['):
            in_sec = (s.lower() == '[description]')
            continue
        if in_sec and '=' in s:
            v = s.split('=', 1)[1].strip()
            if v:
                names.append(v)
    return names


@app.route('/sap-login-config', methods=['GET'])
def sap_login_config_get():
    cfg = _read_sap_login_cfg() or {}
    return jsonify({
        'ok': True, 'configured': bool(cfg.get('sysname') and cfg.get('user') and cfg.get('pw_dpapi')),
        'sysname': cfg.get('sysname', ''), 'client': cfg.get('client', ''),
        'user': cfg.get('user', ''), 'language': cfg.get('language', 'KO'),
    })


@app.route('/sap-login-config', methods=['POST'])
def sap_login_config_save():
    body = request.get_json(silent=True) or {}
    sysname = str(body.get('sysname') or '').strip()
    user = str(body.get('user') or '').strip()
    client = str(body.get('client') or '').strip()
    language = str(body.get('language') or 'KO').strip().upper() or 'KO'
    password = str(body.get('password') or '')
    if not sysname or not user:
        return jsonify({'ok': False, 'error': 'SAP Logon 접속 항목과 사용자 ID는 필수입니다.'}), 400
    old = _read_sap_login_cfg() or {}
    if password:
        try:
            pw_enc = _dpapi_encrypt_b64(password)
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500
    elif old.get('pw_dpapi'):
        pw_enc = old['pw_dpapi']  # 비밀번호 칸을 비워두면 기존 값 유지(다른 항목만 수정)
    else:
        return jsonify({'ok': False, 'error': '비밀번호를 입력해주세요.'}), 400
    try:
        with open(_SAP_LOGIN_CFG_PATH, 'w', encoding='utf-8') as f:
            json.dump({'sysname': sysname, 'client': client, 'user': user, 'language': language, 'pw_dpapi': pw_enc}, f, ensure_ascii=False)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'설정 파일을 저장하지 못했습니다: {e}'}), 500
    print('[SAP 자동 로그인] 설정 저장됨 (접속항목=%s, 사용자=%s)' % (sysname, user))
    return jsonify({'ok': True})


@app.route('/sap-login-config/delete', methods=['POST'])
def sap_login_config_delete():
    try:
        if os.path.exists(_SAP_LOGIN_CFG_PATH):
            os.remove(_SAP_LOGIN_CFG_PATH)
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    return jsonify({'ok': True})


@app.route('/sap-login-entries', methods=['GET'])
def sap_login_entries():
    return jsonify({'ok': True, 'entries': _sap_logon_entries()})


@app.route('/sap-ensure-login', methods=['POST', 'GET'])
def sap_ensure_login():
    """SAP이 로그인돼 있는지 확인하고, 아니면(설정이 있을 때) 자동 로그인한다."""
    data, status = _run_sap_bridge(['ensure_login'], 60, 'SAP 자동 로그인')
    return jsonify(data), status

# ── 승인원 표지 생성 — 자재그룹표(matgroups.json, 618건) ──────────────
#    [2026-09-15 신규] 사내에서 쓰던 별도 데스크톱 앱("연구소 가이드 시스템")의 exe를 분석해
#    그대로 재현한 기능 — MM03 화면엔 자재그룹 "코드"만 있고 명칭이 없어서, 그 앱에 내장돼
#    있던 618건짜리 자재그룹표(코드→대분류/중분류/소분류/설명)에서 코드로 찾는다. 원본 앱의
#    `_approval_group_name`과 동일하게, 표에 없는 코드(예: 사용금지된 코드)는 빈 값을
#    반환하고 화면/응답에 "확인 필요"로 표시해서 사람이 직접 판단하게 한다 — Item Description
#    앞부분으로 되짚는 등의 추측 로직은 원본 앱에서도 엉뚱한 이름이 채워지는 문제로 빠졌던
#    것이라 여기서도 넣지 않는다.
_MATGROUPS_PATH = os.path.join(BASE_DIR, 'matgroups.json')
_MATGROUPS_BY_CODE = {}
try:
    with open(_MATGROUPS_PATH, encoding='utf-8') as _mg_f:
        for _mg_entry in json.load(_mg_f):
            _code = (_mg_entry.get('code') or '').strip()
            if _code:
                _MATGROUPS_BY_CODE[_code] = _mg_entry
except Exception as _mg_err:
    print(f"[승인원 표지] matgroups.json 로드 실패 — 자재그룹명 조회가 안 됩니다: {_mg_err}")


def _approval_group_name(matkl):
    """자재그룹 코드(matkl)로 618건 표에서 소분류명(Item Group)을 찾는다. 못 찾으면 빈 문자열."""
    entry = _MATGROUPS_BY_CODE.get((matkl or '').strip())
    return (entry.get('sobun') or '') if entry else ''


# ══════════════════════════════════════════════════════════════
# 🆕 [2026-09-21, Phase 10] SAP/구매오더/AI 문답 이슈 수집 — 로컬 우편함(issue_events.jsonl)
#    설계: docs/phase10-issue-learning-design.md
#    - /sap-*, /po-* 호출 중 "실패·느림·레이아웃 미적용"만 한 줄씩 기록(성공은 기록 안 함).
#    - 백엔드는 Drive 토큰이 없으므로 여기에 쌓아두고, 브라우저가 /issue-drain으로 가져가
#      Drive에 올린 뒤 /issue-ack로 확정한다(최소 1회 전달 + 이벤트 id로 중복 제거).
#    - 저장 전 마스킹(자재번호·사업자번호·메일·사용자 경로). 수집 코드는 어떤 경우에도 본 기능을
#      방해하지 않는다(모든 구간 try/except).
# ══════════════════════════════════════════════════════════════
_ISSUE_FILE        = os.path.join(BASE_DIR, 'issue_events.jsonl')
_ISSUE_CURSOR_FILE = os.path.join(BASE_DIR, 'issue_events.cursor')
_ISSUE_EXPORT_DIR  = r'C:\SAP_DMS\이슈리포트'   # 💡 [2026-10-28, 사용자 요청] "SAP이슈" → 범용 이름으로 변경(SAP 외 일반 버그 기록도 여기 쌓임). 저장 루트(C:\SAP_DMS)는 사용자가 2026-09-16 "SAP 관련 저장 경로는 C:\SAP_DMS로 통일" 요청대로 유지 — /sap-open-folder·/open-sap-folder의 "C:\SAP_DMS 하위만 허용" 제한과도 호환.
_ISSUE_MAX_BYTES   = 5 * 1024 * 1024
_ISSUE_SLOW_MS     = 60000
_ISSUE_LOCK        = threading.Lock()
_ISSUE_ACTIVE      = {}   # rid -> {'overlap': bool}  (SAP 호출이 동시에 겹쳤는지 — 세션 충돌 의심 표시용)
_ISSUE_SKIP_MASK_KEYS = {'id', 'ts', 'rid', 'route', 'kind', 'domain', 'v', 'stage', 'tcode', 'program', 'screen', 'user'}


def _issue_file_hash(name):
    try:
        with open(os.path.join(BASE_DIR, name), 'rb') as f:
            return hashlib.sha1(f.read().replace(b'\r\n', b'\n')).hexdigest()[:8]
    except Exception:
        return ''


_ISSUE_ENV = {'backend': _issue_file_hash('kortek_backend.py'), 'bridge': _issue_file_hash('sap_bridge_32.py')}


def _issue_mask(text, limit=400):
    """저장 전 마스킹 — 사업자번호/5자리↑ 숫자열/메일/사용자 경로."""
    try:
        t = str(text)
        t = re.sub(r'\b\d{3}-\d{2}-\d{5}\b', '#biz', t)  # 하이픈 형태만 — 하이픈 없는 10자리(COM 오류코드 등)는 아래 5자리↑ 규칙이 '#'로 처리
        t = re.sub(r'\d{5,}', '#', t)
        t = re.sub(r'[\w.+-]+@[\w-]+\.[\w.-]+', '#mail', t)
        t = re.sub(r'(?i)([A-Z]:[\\/]Users[\\/])[^\\/\s"\']+', r'\1<user>', t)
        return t[:limit]
    except Exception:
        return ''


def _issue_norm(text):
    """군집 시그니처용 정규화 — 마스킹 + 따옴표 안 문자열/공백 정리."""
    t = _issue_mask(text, 300)
    t = re.sub(r'"[^"]*"', '"?"', t)
    t = re.sub(r"'[^']*'", "'?'", t)
    return re.sub(r'\s+', ' ', t).strip()[:120]


def _issue_mask_deep(obj, key=None):
    if isinstance(obj, str):
        return obj if key in _ISSUE_SKIP_MASK_KEYS else _issue_mask(obj)
    if isinstance(obj, dict):
        return {k: _issue_mask_deep(v, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_issue_mask_deep(v, key) for v in obj]
    return obj


def _issue_params():
    """요청 파라미터의 "형태"만(값이 아니라 개수/열거형) — 기밀 값은 저장하지 않는다."""
    p = {}
    try:
        for k in ('material', 'materials'):
            v = request.args.get(k)
            if v:
                p['materialCount'] = len([x for x in re.split(r'[,\s]+', v) if x])
        for k in ('tcode', 'explosion', 'show_price', 'show_location', 'type', 'loc', 'plant', 'layout'):
            v = request.args.get(k)
            if v is not None:
                p[k] = v[:40]
        pat = request.args.get('pattern')
        if pat:
            p['patternLen'] = len(pat)
            p['patternHasWildcard'] = '*' in pat
        if request.is_json:
            j = request.get_json(silent=True) or {}
            if isinstance(j.get('items'), list):
                p['itemCount'] = len(j['items'])
            if isinstance(j.get('rows'), list):
                p['rowCount'] = len(j['rows'])
            for k in ('currency', 'plant', 'purchasingOrg'):
                if j.get(k):
                    p[k] = str(j[k])[:20]
    except Exception:
        pass
    return p


def _issue_append(event):
    """이벤트 1건을 우편함에 추가. 5MB 초과 시 오래된 절반을 버린다."""
    try:
        line = json.dumps(_issue_mask_deep(event), ensure_ascii=False) + '\n'
        with _ISSUE_LOCK:
            try:
                if os.path.exists(_ISSUE_FILE) and os.path.getsize(_ISSUE_FILE) > _ISSUE_MAX_BYTES:
                    with open(_ISSUE_FILE, 'rb') as f:
                        lines = f.read().splitlines(True)
                    with open(_ISSUE_FILE, 'wb') as f:
                        f.writelines(lines[len(lines) // 2:])
                    with open(_ISSUE_CURSOR_FILE, 'w') as f:
                        f.write('0')  # 오프셋이 바뀌므로 커서 초기화(중복은 id로 제거됨)
            except Exception:
                pass
            with open(_ISSUE_FILE, 'ab') as f:
                f.write(line.encode('utf-8'))
    except Exception as e:
        print(f"[이슈 수집] 기록 실패(무시): {e}")


def _issue_read_cursor():
    try:
        with open(_ISSUE_CURSOR_FILE, 'r') as f:
            return max(0, int(f.read().strip() or '0'))
    except Exception:
        return 0


@app.before_request
def _issue_before_request():
    try:
        path = request.path
        if request.method == 'OPTIONS' or not (path.startswith('/sap-') or path.startswith('/po-')):
            return None
        g._issue_t0 = time.time()
        g._issue_rid = (request.args.get('_rid') or '')[:40] or ('b_' + uuid.uuid4().hex[:8])
        with _ISSUE_LOCK:
            overlap = bool(_ISSUE_ACTIVE)
            for st in _ISSUE_ACTIVE.values():
                st['overlap'] = True
            _ISSUE_ACTIVE[g._issue_rid] = {'overlap': overlap}
    except Exception:
        pass
    return None


@app.after_request
def _issue_after_request(resp):
    try:
        rid = getattr(g, '_issue_rid', None)
        if not rid:
            return resp
        with _ISSUE_LOCK:
            st = _ISSUE_ACTIVE.pop(rid, {'overlap': False})
        dur_ms = int((time.time() - getattr(g, '_issue_t0', time.time())) * 1000)
        data = resp.get_json(silent=True) if (resp.mimetype or '').endswith('json') else None
        ok = data.get('ok') if isinstance(data, dict) else None
        path = request.path
        if resp.status_code >= 400 or ok is False:
            kind = 'call_fail'
        elif isinstance(data, dict) and data.get('layoutApplied') is False:
            kind = 'degraded_layout'
        elif dur_ms > _ISSUE_SLOW_MS:
            kind = 'call_slow'
        else:
            return resp
        err = ''
        if isinstance(data, dict):
            err = str(data.get('error') or data.get('layoutDiag') or '')
        elif resp.status_code >= 400:
            err = f'HTTP {resp.status_code} (JSON 아님)'
        snap = getattr(g, 'issue_snap', None)
        event = {
            'id': 'ev_%s_%s' % (format(int(time.time() * 1000), 'x'), uuid.uuid4().hex[:4]),
            'v': 1,
            'ts': datetime.now(KST).isoformat(timespec='seconds'),
            'domain': 'po' if path.startswith('/po-') else 'sap',
            'kind': kind,
            'rid': rid,
            'route': path,
            'params': _issue_params(),
            'result': {'ok': ok, 'http': resp.status_code, 'durMs': dur_ms,
                       'errorRaw': _issue_mask(err), 'errorNorm': _issue_norm(err)},
            'env': dict(_ISSUE_ENV),
        }
        if isinstance(data, dict) and 'layoutApplied' in data:
            event['result']['layout'] = {'applied': data.get('layoutApplied'), 'requested': data.get('layoutRequested'), 'diag': data.get('layoutDiag')}
        if getattr(g, 'issue_stage', None):
            event['stage'] = g.issue_stage
        if snap:
            event['snapshot'] = snap
        if st.get('overlap'):
            event['flags'] = ['concurrent_session_suspect']
        _issue_append(event)
    except Exception as e:
        print(f"[이슈 수집] after_request 실패(무시): {e}")
    return resp


@app.route('/issue-drain', methods=['GET'])
def issue_drain():
    """브라우저가 미전달 이벤트를 가져간다. 응답의 next를 /issue-ack로 돌려줘야 확정된다."""
    try:
        mx = max(1, min(int(request.args.get('max', '200')), 500))
        cursor = _issue_read_cursor()
        events, consumed = [], cursor
        with _ISSUE_LOCK:
            if not os.path.exists(_ISSUE_FILE):
                return jsonify({'ok': True, 'events': [], 'next': 0})
            size = os.path.getsize(_ISSUE_FILE)
            if cursor > size:
                cursor = consumed = 0
            with open(_ISSUE_FILE, 'rb') as f:
                f.seek(cursor)
                while len(events) < mx:
                    raw = f.readline()
                    if not raw:
                        break
                    consumed += len(raw)
                    try:
                        events.append(json.loads(raw.decode('utf-8')))
                    except Exception:
                        continue
        return jsonify({'ok': True, 'events': events, 'next': consumed})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/issue-ack', methods=['POST'])
def issue_ack():
    """업로드가 끝난 이벤트까지 커서를 확정. 전부 소진했으면 우편함 파일을 비운다."""
    try:
        cur = int((request.get_json(silent=True) or {}).get('cursor', 0))
        with _ISSUE_LOCK:
            size = os.path.getsize(_ISSUE_FILE) if os.path.exists(_ISSUE_FILE) else 0
            cur = max(0, min(cur, size))
            if size and cur >= size:
                open(_ISSUE_FILE, 'wb').close()
                cur = 0
            with open(_ISSUE_CURSOR_FILE, 'w') as f:
                f.write(str(cur))
        return jsonify({'ok': True, 'cursor': cur})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/issue-export', methods=['POST'])
def issue_export():
    """이슈 리포트(군집 요약 JSON + 사람이 읽는 .md 요약)를 C:\\SAP_DMS\\이슈리포트\\ 에 저장 —
    브라우저 다운로드가 아니라 서버 저장으로 다른 SAP 기능들과 저장 위치를 통일한다.
    💡 [2026-10-28, 사용자 요청 "사람이 못 보잖아"] JSON은 Claude가 읽기엔 좋지만 사람이 직접 열어보기엔
    불편하다는 지적 — 같은 digest를 프런트(js/31)가 markdown으로도 만들어 보내면, 같은 폴더에 같은
    파일명으로 .md를 나란히 저장한다(markdown 생략 시 .json만, 기존 호출부와 호환)."""
    try:
        body = request.get_json(silent=True) or {}
        data = body.get('data')
        if data is None:
            return jsonify({'ok': False, 'error': 'data가 없습니다.'}), 400
        name = re.sub(r'[^0-9A-Za-z_.\-가-힣]', '_', str(body.get('fileName') or ''))[:80]
        if not name.lower().endswith('.json'):
            name = (name or 'digest_' + datetime.now(KST).strftime('%Y%m%d')) + '.json'
        os.makedirs(_ISSUE_EXPORT_DIR, exist_ok=True)
        path = os.path.join(_ISSUE_EXPORT_DIR, name)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        md_path = None
        markdown = body.get('markdown')
        if markdown:
            md_path = os.path.join(_ISSUE_EXPORT_DIR, os.path.splitext(name)[0] + '.md')
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(str(markdown))
        try:
            os.startfile(_ISSUE_EXPORT_DIR)
        except Exception:
            pass
        return jsonify({'ok': True, 'path': path, 'mdPath': md_path})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# 🛑 [2026-09-23 신규, 사용자 요청] "실행 중단해줘"/"그만"/"멈춰" — 자재 여러 건을 MM03로
# 하나씩 순회하는 것처럼 오래 걸리는 SAP 조회를 사람이 도중에 멈출 수 있게 한다. 기존
# subprocess.run(...)은 블로킹이라 다른 요청(/sap-cancel)이 그 사이에 끼어들 방법이 없었다
# — Popen으로 바꿔 진행 중인 프로세스 핸들을 전역에 보관해두고, /sap-cancel이 다른 요청
# 스레드에서 그 핸들을 kill()한다(Flask를 threaded=True로 띄워야 동시에 처리됨, 아래
# _run_flask_with_port_retry 참고). 외부에서 kill되면 이 스레드가 블로킹 중이던
# proc.communicate()가 TimeoutExpired 없이 정상적으로(빈 출력과 함께) 리턴한다.
_SAP_PROC_LOCK = threading.Lock()
_SAP_PROC_STATE = {'proc': None, 'cancelled': False}


def _run_sap_bridge(extra_args, timeout, log_prefix):
    """sap_bridge_32.py를 32비트 Python 서브프로세스로 실행하고 JSON 결과를 돌려주는 공용
    헬퍼 — /sap-fetch와 /sap-open-document가 똑같이 쓴다(2026-09-14, 두 번째 엔드포인트
    추가하면서 중복 제거)."""
    # 🔑 [2026-10-13] 자동 로그인 설정이 있으면 SAP이 꺼져 있어도 이 호출 안에서 로그인(최대 ~45초)까지
    #    하므로, 호출부가 정한 시간에 그만큼을 더해준다(안 그러면 로그인하다 시간 초과로 죽는다).
    if os.path.exists(_SAP_LOGIN_CFG_PATH):
        timeout = timeout + 45
    try:
        proc = subprocess.Popen(
            ['py', '-3-32', _SAP_BRIDGE_PATH] + extra_args,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace'
        )
    except FileNotFoundError:
        return {'ok': False, 'error': 'Python 런처(py.exe)를 찾을 수 없습니다 — Python 공식 설치 상태를 확인하세요.'}, 500

    with _SAP_PROC_LOCK:
        _SAP_PROC_STATE['proc'] = proc
        _SAP_PROC_STATE['cancelled'] = False

    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        try:
            stdout, stderr = proc.communicate(timeout=5)
        except Exception:
            stdout, stderr = '', ''
        with _SAP_PROC_LOCK:
            if _SAP_PROC_STATE.get('proc') is proc:
                _SAP_PROC_STATE['proc'] = None
        return {'ok': False, 'error': f'{timeout}초 안에 끝나지 않았습니다. SAP GUI에 응답 대기 중인 팝업이 떠 있지 않은지 확인해주세요.'}, 500

    with _SAP_PROC_LOCK:
        was_cancelled = _SAP_PROC_STATE.get('cancelled', False)
        if _SAP_PROC_STATE.get('proc') is proc:
            _SAP_PROC_STATE['proc'] = None
    if was_cancelled:
        print(f"[{log_prefix}] 사용자 요청으로 중단됨")
        return {'ok': False, 'error': '⏹ 사용자 요청으로 중단되었습니다.', 'cancelled': True}, 200

    proc.stdout, proc.stderr = stdout, stderr  # 아래 기존 코드가 proc.stdout/stderr를 그대로 읽으므로 맞춰줌
    stdout_lines = [ln for ln in (proc.stdout or '').strip().splitlines() if ln.strip()]
    if not stdout_lines:
        # 💡 32비트 Python/pywin32가 아예 없는 경우 등 — sap_bridge_32.py가 뭘 출력하기도 전에
        #    런처 자체가 실패한 상황. kortek_backend.bat의 자동 설치 블록을 다시 타라고 안내.
        stderr_tail = (proc.stderr or '').strip()
        print(f"[{log_prefix} 실패] 서브프로세스가 출력 없이 종료(returncode={proc.returncode}). stderr: {stderr_tail}")
        if 'No runtime installed' in stderr_tail or 'not installed' in stderr_tail.lower():
            return {'ok': False, 'error': '32비트 Python이 이 PC에 설치되어 있지 않습니다. kortek_backend.bat을 다시 실행하면 자동 설치됩니다(최초 1회, 몇 분 소요).'}, 500
        return {'ok': False, 'error': f'{log_prefix} 서브프로세스 실행에 실패했습니다. 백엔드 콘솔 창의 [{log_prefix} 실패] 로그를 확인하세요. (' + (stderr_tail[-300:] if stderr_tail else '상세 정보 없음') + ')'}, 500

    try:
        data = json.loads(stdout_lines[-1])
    except Exception:
        print(f"[{log_prefix} 실패] sap_bridge_32.py 출력 JSON 파싱 실패. stdout: {proc.stdout!r} stderr: {proc.stderr!r}")
        return {'ok': False, 'error': f'{log_prefix} 결과를 해석하지 못했습니다. 백엔드 콘솔 창의 로그를 확인하세요.'}, 500

    try:  # Phase 10: 브라우저 응답에는 싣지 않고 이슈 이벤트 로그로만 보낸다
        if isinstance(data, dict):
            g.issue_snap = data.pop('snapshot', None)
            g.issue_stage = data.pop('stage', None)
    except Exception:
        pass
    if data.get('ok'):
        print(f"[{log_prefix}] {data}")
    else:
        print(f"[{log_prefix} 실패] {data.get('error')}")
    return data, 200


@app.route('/sap-cancel', methods=['POST'])
def sap_cancel():
    # 🛑 [2026-09-23 신규, 사용자 요청 "실행 중단해줘"] 지금 실행 중인 SAP 조회(자재 여러
    #    건을 순회하는 것처럼 오래 걸리는 작업)를 강제 종료한다. 실행 중인 게 없으면 조용히
    #    cancelled:false만 돌려준다(호출부가 "혹시 몰라서" 매번 불러도 안전).
    with _SAP_PROC_LOCK:
        proc = _SAP_PROC_STATE.get('proc')
        if proc is None or proc.poll() is not None:
            return jsonify({'ok': True, 'cancelled': False})
        _SAP_PROC_STATE['cancelled'] = True
        try:
            proc.kill()
        except Exception:
            pass
    print('[SAP 중단] 사용자 요청으로 진행 중인 SAP 작업을 종료했습니다.')
    return jsonify({'ok': True, 'cancelled': True})


@app.route('/sap-fetch', methods=['GET'])
def sap_fetch():
    data, status = _run_sap_bridge([], 30, 'SAP 조회')
    return jsonify(data), status


@app.route('/sap-open-document', methods=['GET'])
def sap_open_document():
    # 💡 [2026-09-14 신규] "SAP에서 P01 문서 열어줘" — MM03에서 이미 열어둔 자재의 "문서 데이터"
    #    탭에서 지정한 문서 타입(예: P01/C04/Q11)을 찾아 열고, 첨부된 원본 파일을 더블클릭해서
    #    연결된 프로그램(Acrobat 등)으로 바로 연다. 실제 클릭 순서는 SAP GUI "기록 및 재생"으로
    #    녹화한 매크로를 일반화해서 sap_bridge_32.py의 open_document()에 구현돼 있다.
    # 💡 [2026-09-15 확장] material 파라미터를 같이 주면(예: "SAP에서 106188 P01 문서 열어줘")
    #    사람이 화면을 미리 열어둘 필요 없이 sap_bridge_32.py가 직접 MM03으로 이동해 그 자재를
    #    조회한다(_navigate_to_material_document_tab, 2026-09-15 실사용 화면 녹화로 얻은
    #    컨트롤을 일반화). material 없이 호출하면 기존처럼 "이미 열려 있는 화면"을 그대로 쓴다.
    doc_type = (request.args.get('type') or '').strip()
    material = (request.args.get('material') or '').strip()
    if not doc_type:
        return jsonify({'ok': False, 'error': '문서 타입(type 파라미터)이 필요합니다. 예: /sap-open-document?type=P01'}), 400
    extra_args = ['open_document', doc_type]
    if material:
        extra_args.append(material)
    # 자재번호부터 직접 조회하는 경로는 화면 전환이 하나 더 있어 기존보다 시간이 더 걸릴 수
    # 있어 타임아웃을 넉넉히 둔다.
    timeout = 60 if material else 45
    data, status = _run_sap_bridge(extra_args, timeout, 'SAP 문서 열기')
    return jsonify(data), status


@app.route('/sap-material-documents', methods=['GET'])
def sap_material_documents():
    # 💡 [2026-09-15 신규] "SAP에서 106188 품번 정보 및 파일 열어줘"처럼 문서 타입(P01 등)을
    #    모른 채 자재번호만 말했을 때 — /sap-open-document처럼 특정 문서를 바로 열지 않고,
    #    먼저 "문서 데이터" 탭에 어떤 문서들이 있는지 목록만 읽어와 보여준다. 사람이 그 목록을
    #    보고 원하는 타입을 골라 "OO 문서 열어줘"라고 다시 말하면 /sap-open-document로 연다.
    material = (request.args.get('material') or '').strip()
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material 파라미터)가 필요합니다. 예: /sap-material-documents?material=106188'}), 400
    data, status = _run_sap_bridge(['fetch_material_documents', material], 30, 'SAP 자재 문서 목록 조회')
    return jsonify(data), status


@app.route('/sap-project-codes', methods=['GET'])
def sap_project_codes():
    # 🗂 [2026-09-28 신규, 사용자 요청] "*G26* 26년도 프로젝트 코드 조회해줘" — MB21 화면의
    #    내부오더(COBL-AUFNR) 검색도움말로 프로젝트 코드를 패턴 조회한다(읽기 전용, 저장 없음).
    #    실제 조작은 sap_bridge_32.py의 fetch_project_codes() — 사용자가 준 매크로
    #    "프로젝트 코드확인.vbs" 기반. 구매오더 요청의 프로젝트코드를 확인할 때도 쓴다.
    pattern = (request.args.get('pattern') or '').strip()
    bwart = (request.args.get('bwart') or '').strip()
    werks = (request.args.get('werks') or '').strip()
    by = (request.args.get('by') or 'code').strip()   # 'code'(오더) | 'desc'(내역=프로젝트명)
    if not pattern:
        return jsonify({'ok': False, 'error': '조회할 패턴(pattern 파라미터)이 필요합니다. 예: /sap-project-codes?pattern=*G26*'}), 400
    data, status = _run_sap_bridge(['fetch_project_codes', pattern, bwart, werks, by], 90, 'SAP 프로젝트 코드 조회')
    return jsonify(data), status


@app.route('/sap-material-price', methods=['GET'])
def sap_material_price():
    # 💰 [2026-09-23 신규, 실사용 제보] "표준가격/기간별단가 확인해줘" — MM03 "회계 1" 탭의
    #    표준가격(STPRS)/기간별단가(PVPRS)를 가격단위(PEINH)로 나눈 실제 단가까지 계산해서
    #    돌려준다. 실제 컨트롤 조작은 sap_bridge_32.py의 fetch_material_price()에 있다
    #    (사용자가 직접 준 화면 트리 덤프로 정확한 필드 ID 확인).
    material = (request.args.get('material') or '').strip()
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material 파라미터)가 필요합니다. 예: /sap-material-price?material=106437'}), 400
    data, status = _run_sap_bridge(['fetch_material_price', material], 45, 'SAP 표준가격/기간별단가 조회')
    return jsonify(data), status


@app.route('/sap-download-documents-batch', methods=['GET'])
def sap_download_documents_batch():
    # 💡 [2026-09-15 신규] "SAP에서 133012, 133010, 101831 문서 다운로드해줘"처럼 자재번호를
    #    여러 개 말했을 때 — MM03을 자재마다 드릴다운하는 대신 회사 SAP의 전용 배치 리포트
    #    ZDMSR004("DMS 첨부파일 일괄 다운로드 프로그램")를 실행해 한 번에 C:\SAP_DMS\로
    #    다운로드한다. 실제 컨트롤 조작은 sap_bridge_32.py의 download_documents_batch()에
    #    있다(2026-09-15 실사용 SAP GUI "기록 및 재생" 매크로로 확보한 정확한 ID 재현).
    materials_str = (request.args.get('materials') or '').strip()
    doc_type = (request.args.get('type') or 'P01').strip()
    if not materials_str:
        return jsonify({'ok': False, 'error': '자재번호 목록(materials 파라미터, 쉼표구분)이 필요합니다. 예: /sap-download-documents-batch?materials=133012,133010&type=P01'}), 400
    materials = [m.strip() for m in re.split(r'[,\s]+', materials_str) if m.strip()]
    data, status = _sap_doc_batch_download(materials, doc_type)
    return jsonify(data), status


# -- 📥 ZDMSR004 문서 일괄 다운로드 — 건수에 맞춘 예산 + 중간 보고 (2026-11-09) --
# ⚠️ [실사용 제보] 자재 약 200개를 넣고 "P01 문서 다운로드 해줘" 를 했더니
#    `SAP 문서 일괄 다운로드 시간 초과` 로 **중간에 멈췄고**, 받아진 것들은 루트에 쌓이고
#    어디까지 받았는지도 알 수 없었다. 원인은 **고정 타임아웃**(min(300, 40+8*n) — 200건이면
#    늘 300초에서 잘린다) + 한 방 호출.
# → ① 백엔드가 청크로 쪼개 돌리고(ZDMSR004 "복수 선택" 팝업의 실사용 검증 한계와 같은 크기)
#    ② 전체 예산을 **건수에 비례**해 잡고 ③ 못 끝내면 `partial` 로 **어디까지 받았는지 공개**
#    (검색도움말 `partial` 선례) ④ 진행 상황을 `/sap-doc-batch-progress` 로 노출한다
#    ("멈춘 것처럼 보인다" 가 반복된 불만이었다).
# 숫자는 전부 데이터 — 코드에 흩어 박지 않는다.
SAP_DOC_BATCH_LIMITS = {
    'chunkSize':    7,      # ZDMSR004 팝업 한 화면 입력 행 수(8개 이상 스크롤은 미검증)
    'perChunkBase': 30, 'perChunkEach': 9,        # 청크 1회 타임아웃 = base + each*건수
    'totalBase':   120, 'totalEach':   25,        # 전체 예산 = base + each*건수
    'totalCap':   3600,                           # 전체 예산 상한(초)
}

_SAP_DOC_PROGRESS_LOCK = threading.Lock()
_SAP_DOC_PROGRESS = {'running': False}


def _sap_doc_progress_set(**kw):
    with _SAP_DOC_PROGRESS_LOCK:
        _SAP_DOC_PROGRESS.update(kw)
        _SAP_DOC_PROGRESS['at'] = time.time()


def sap_doc_batch_budget(count):
    """전체 예산(초) — 건수에 비례, 상한은 데이터."""
    lim = SAP_DOC_BATCH_LIMITS
    return min(lim['totalCap'], lim['totalBase'] + lim['totalEach'] * max(0, int(count)))


def _sap_doc_batch_download(materials, doc_type, dest_dir=None, extra=None):
    """자재 목록을 청크로 나눠 ZDMSR004 다운로드를 돌린다. (data, status) 를 돌려준다.
    예산을 넘거나 한 청크가 실패하면 **거기서 멈추고** 어디까지 받았는지 그대로 담는다."""
    lim = SAP_DOC_BATCH_LIMITS
    seen, uniq = set(), []
    for m in materials or []:
        m = str(m).strip()
        if m and m not in seen:
            seen.add(m)
            uniq.append(m)
    if not uniq:
        return {'ok': False, 'error': '다운로드할 자재번호가 없습니다.'}, 400
    doc_type = (doc_type or 'P01').strip().upper()
    dest = dest_dir or sap_doc_dir(doc_type)
    size = max(1, int(lim['chunkSize']))
    chunks = [uniq[i:i + size] for i in range(0, len(uniq), size)]
    budget = sap_doc_batch_budget(len(uniq))
    deadline = time.time() + budget

    done, renamed, matnr_by_doknr, placed, place_errors = [], {}, {}, [], []
    stop_reason, stop_error, last_status = None, None, 200
    _sap_doc_progress_set(running=True, docType=doc_type, folder=dest, total=len(uniq), done=0,
                          chunkTotal=len(chunks), chunkDone=0, budgetSec=budget,
                          startedAt=time.time(), partial=False, error=None, stopReason=None)
    for ci, part in enumerate(chunks):
        left = deadline - time.time()
        if left <= 5:
            stop_reason = 'budget'
            break
        timeout = int(min(lim['perChunkBase'] + lim['perChunkEach'] * len(part), max(30, left)))
        data, last_status = _run_sap_bridge(
            ['download_documents_batch', doc_type, ','.join(part), dest], timeout,
            'SAP 문서 일괄 다운로드')
        if not data.get('ok'):
            stop_reason = 'cancelled' if data.get('cancelled') else 'error'
            stop_error = data.get('error')
            break
        done.extend(part)
        renamed.update(data.get('renamedFolders') or {})
        matnr_by_doknr.update(data.get('matnrByDoknr') or {})
        placed.extend(data.get('placed') or [])
        place_errors.extend(data.get('placeErrors') or [])
        _sap_doc_progress_set(done=len(done), chunkDone=ci + 1)

    pending = [m for m in uniq if m not in set(done)]
    partial = bool(pending)
    _sap_doc_progress_set(running=False, done=len(done), partial=partial,
                          error=stop_error, stopReason=stop_reason)

    if not done:
        # 한 건도 못 받았다 — 예전처럼 실패로 돌려준다(부분 성공이 없으니 숨길 것도 없다).
        return {'ok': False, 'partial': False, 'docType': doc_type, 'savedFolder': dest,
                'materials': uniq, 'done': [], 'pending': pending, 'stopReason': stop_reason,
                'error': stop_error or ('%d초 예산 안에 한 건도 끝내지 못했습니다.' % budget)}, last_status

    with_doc = len(set(matnr_by_doknr.values()))
    msg = ('자재 %d/%d건의 "%s" 문서를 %s 폴더로 받았습니다 (문서가 있는 자재 %d건 · 폴더 %d개).'
           % (len(done), len(uniq), doc_type, dest, with_doc, len(placed)))
    if partial:
        why = {'budget': '제한시간(%d초)을 넘겨' % budget, 'error': '중간에 오류가 나서',
               'cancelled': '사용자 요청으로'}.get(stop_reason, '')
        msg += (' ⚠️ %s **%d건은 아직 못 받았습니다** — 남은 자재: %s%s'
                % (why, len(pending), ', '.join(pending[:20]), ' …' if len(pending) > 20 else ''))
        if stop_error:
            msg += ' / 멈춘 이유: ' + str(stop_error)
        msg += ' 남은 자재만 다시 말씀하시면 이어서 받습니다.'
    if place_errors:
        msg += ' ⚠️ 파일 정리 오류 %d건: %s' % (len(place_errors), '; '.join(place_errors[:3]))

    out = {'ok': True, 'partial': partial, 'docType': doc_type, 'savedFolder': dest,
           'materials': uniq, 'done': done, 'pending': pending,
           'chunks': len(chunks), 'budgetSec': budget, 'stopReason': stop_reason,
           'stopError': stop_error, 'renamedFolders': renamed, 'matnrByDoknr': matnr_by_doknr,
           'placed': placed, 'placeErrors': place_errors, 'message': msg}
    if extra:
        out.update(extra)
    return out, 200


@app.route('/sap-doc-batch-progress', methods=['GET'])
def sap_doc_batch_progress():
    # 📊 [2026-11-09] "멈춘 것처럼 보인다" — 프런트가 이걸 2초마다 읽어 진행 상황을 보여준다.
    with _SAP_DOC_PROGRESS_LOCK:
        snap = dict(_SAP_DOC_PROGRESS)
    return jsonify({'ok': True, 'progress': snap})


@app.route('/sap-dms-lookup', methods=['GET'])
def sap_dms_lookup():
    # 📋 [2026-10-01 신규] "501362 P02 문서번호 확인해줘" — 자재 목록에 대한 문서번호 유무를
    #    조회만 하고 파일 다운로드는 하지 않는다. 7개씩 청크해서 순차 실행(팝업 입력 한계).
    materials_str = (request.args.get('materials') or '').strip()
    doc_type = (request.args.get('type') or 'P02').strip()
    if not materials_str:
        return jsonify({'ok': False, 'error': '자재번호(materials 파라미터, 쉼표구분)가 필요합니다.'}), 400
    materials = [m.strip() for m in materials_str.split(',') if m.strip()]
    chunk_size = 7
    all_has = {}
    for i in range(0, len(materials), chunk_size):
        chunk = materials[i:i + chunk_size]
        timeout = 30 + 8 * len(chunk)
        data, status = _run_sap_bridge(['lookup_documents_batch', doc_type, ','.join(chunk)], timeout, 'SAP DMS 문서 조회')
        if not data.get('ok'):
            return jsonify(data), status
        all_has.update(data.get('has_doc') or {})
    no_doc = [m for m in materials if m not in all_has]
    lines = [f'[SAP {doc_type} 문서 조회: {len(materials)}건]']
    if no_doc:
        lines.append(f'\n■ {doc_type} 문서 없음 ({len(no_doc)}건):')
        lines.append('  ' + ', '.join(no_doc))
    if all_has:
        lines.append(f'\n■ {doc_type} 문서 있음 ({len(all_has)}건):')
        for mat, docs in sorted(all_has.items()):
            lines.append(f'  {mat}: ' + ', '.join(docs))
    return jsonify({
        'ok': True,
        'doc_type': doc_type,
        'total': len(materials),
        'has_doc': all_has,
        'no_doc': no_doc,
        'text': '\n'.join(lines)
    })


@app.route('/sap-team-budget', methods=['GET'])
def sap_team_budget():
    # 💰 [2026-09-22 신규, 사용자 요청] "개발3팀 팀운영비 확인해줘"처럼 팀 이름으로 ZCO021
    #    "코텍 예실레포트"의 "550203 복리후생비-팀운영비" 행을 조회한다. 실제 컨트롤 조작은
    #    sap_bridge_32.py의 fetch_team_budget()에 있다(사용자가 준 SAP GUI "기록 및 재생"
    #    매크로 + 스크린샷 기반). 실사용 테스트로 팀 이름 매칭 버그·값 추출 둘 다 확인 완료.
    # 💡 [2026-09-22 확장, 사용자 요청 "1~6월까지"] from/to(기간시작/종료, 1~12)를 선택적으로
    #    받는다 — 기본값은 기존처럼 연간 누적(1~12).
    team = (request.args.get('team') or '').strip()
    if not team:
        return jsonify({'ok': False, 'error': '팀 이름(team 파라미터)이 필요합니다. 예: /sap-team-budget?team=개발3팀'}), 400
    fperbl = (request.args.get('from') or '1').strip()
    tperbl = (request.args.get('to') or '12').strip()
    data, status = _run_sap_bridge(['fetch_team_budget', team, fperbl, tperbl], 45, 'SAP 팀 운영비 조회')
    return jsonify(data), status


@app.route('/sap-navigate-dump', methods=['GET'])
def sap_navigate_dump():
    tcode = (request.args.get('tcode') or '').strip().upper()
    if not tcode:
        return jsonify({'ok': False, 'error': 'tcode 파라미터가 필요합니다. 예: /sap-navigate-dump?tcode=CS14'}), 400
    data, status = _run_sap_bridge(['navigate_and_dump', tcode, r'C:\SAP_DMS\SAP_화면덤프'], 40, f'SAP {tcode} 화면 이동 후 덤프')
    return jsonify(data), status


@app.route('/sap-reservation', methods=['GET'])
def sap_reservation():
    rsnum = (request.args.get('rsnum') or '').strip()
    if not rsnum:
        return jsonify({'ok': False, 'error': 'rsnum 파라미터가 필요합니다. 예: /sap-reservation?rsnum=0000001234'}), 400
    data, status = _run_sap_bridge(['display_reservation', rsnum], 30, f'MB23 예약 조회 {rsnum}')
    return jsonify(data), status


@app.route('/sap-compare-bom', methods=['GET'])
def sap_compare_bom():
    mat1 = (request.args.get('mat1') or '').strip()
    mat2 = (request.args.get('mat2') or '').strip()
    if not mat1 or not mat2:
        return jsonify({'ok': False, 'error': 'mat1, mat2 파라미터가 모두 필요합니다.'}), 400
    plant = (request.args.get('plant') or '1000').strip()
    mode = (request.args.get('mode') or 'diff').strip()
    data, status = _run_sap_bridge(['compare_bom', mat1, mat2, plant, mode], 40, f'CS14 BOM 비교 {mat1}/{mat2}')
    return jsonify(data), status


@app.route('/sap-material-change-history', methods=['GET'])
def sap_material_change_history():
    material = (request.args.get('material') or '').strip()
    if not material:
        return jsonify({'ok': False, 'error': 'material 파라미터가 필요합니다.'}), 400
    plant = (request.args.get('plant') or '1000').strip()
    # [2026-10-02] 단일 date → 변경일자 기간(from/to) + 작업구분(by)으로 확장.
    #   date=만 주던 기존 호출은 from으로 받아 그대로 동작한다(하위호환).
    dfrom = (request.args.get('from') or request.args.get('date') or '').strip()
    dto   = (request.args.get('to') or '').strip()
    by    = (request.args.get('by') or 'change').strip()
    data, status = _run_sap_bridge(
        ['fetch_material_change_history', material, plant, dfrom, dto, by],
        35, f'ZCO037 변경이력 {material}')
    return jsonify(data), status


@app.route('/sap-delivery-history', methods=['GET'])
def sap_delivery_history():
    material = (request.args.get('material') or '').strip()
    if not material:
        return jsonify({'ok': False, 'error': 'material 파라미터가 필요합니다.'}), 400
    vendor = (request.args.get('vendor') or '').strip() or None
    date_from = (request.args.get('from') or '').strip() or None
    date_to = (request.args.get('to') or '').strip() or None
    data, status = _run_sap_bridge(
        ['fetch_delivery_history', material, vendor or '', date_from or '', date_to or ''], 35,
        f'ZSD027 납품이력 {material}')
    return jsonify(data), status


@app.route('/sap-purchase-info', methods=['GET'])
def sap_purchase_info():
    material = (request.args.get('material') or '').strip()
    if not material:
        return jsonify({'ok': False, 'error': 'material 파라미터가 필요합니다.'}), 400
    vendor = (request.args.get('vendor') or '').strip() or None
    porg = (request.args.get('porg') or '1000').strip()
    kdate = (request.args.get('date') or '').strip() or None
    data, status = _run_sap_bridge(
        ['fetch_purchase_info_records', material, vendor or '', porg, kdate or ''], 35,
        f'ZMM006 구매정보 {material}')
    return jsonify(data), status


@app.route('/sap-production-order', methods=['GET'])
def sap_production_order():
    aufnr = (request.args.get('aufnr') or '').strip()
    if not aufnr:
        return jsonify({'ok': False, 'error': 'aufnr 파라미터가 필요합니다.'}), 400
    data, status = _run_sap_bridge(['display_production_order', aufnr], 35, f'CO03 생산오더 {aufnr}')
    return jsonify(data), status


@app.route('/sap-production-orders', methods=['GET'])
def sap_production_orders():
    material = (request.args.get('material') or '').strip() or None
    aufnr = (request.args.get('aufnr') or '').strip() or None
    if not material and not aufnr:
        return jsonify({'ok': False, 'error': 'material 또는 aufnr 파라미터가 필요합니다.'}), 400
    date_from = (request.args.get('from') or '').strip() or None
    date_to = (request.args.get('to') or '').strip() or None
    plant = (request.args.get('plant') or '1000').strip()
    data, status = _run_sap_bridge(
        ['fetch_production_orders', material or '', aufnr or '', date_from or '', date_to or '', plant],
        45, f'COOIS 생산오더목록 {material or aufnr}')
    return jsonify(data), status


@app.route('/sap-dump-screen', methods=['GET'])
def sap_dump_screen():
    # 🔧 [2026-09-23 신규, "SAP 마스터" 사용자 요청] 새 SAP 기능을 만들 때마다 매크로(.vbs)를
    #    사람이 해석해서 필드 ID를 추측하던 방식 대신 — 지금 열려 있는 SAP 화면의
    #    GuiComponent 트리 전체(Id/Type/Text)를 그대로 덤프해서 정확한 findById 경로를
    #    바로 확인하는 진단 전용 명령. 실제 트리 순회는 sap_bridge_32.py의
    #    dump_screen_tree()에 있다. 결과가 길어 C:\SAP_DMS\SAP_화면덤프\에도 파일로 남긴다
    #    (SAP 관련 파일은 브라우저 다운로드 대신 백엔드가 저장하는 기존 규칙과 동일).
    data, status = _run_sap_bridge(['dump_screen_tree', r'C:\SAP_DMS\SAP_화면덤프'], 30, 'SAP 화면 트리 덤프')
    return jsonify(data), status


@app.route('/sap-dump-windows', methods=['GET'])
def sap_dump_windows():
    # 🪟 [2026-10-02 신규, 사용자 요청] 위 /sap-dump-screen의 **Windows 판**.
    #    ZMM019 청구서출력이 띄우는 인쇄/저장 창은 SAP 창이 아니라 Win32 대화상자(#32770)라
    #    SAP 트리 덤프에는 아예 안 나온다(저장 창이 떠 있는데 팝업 0건으로 찍힌 실측 확인).
    #    이 엔드포인트는 SAP 세션을 전혀 쓰지 않으므로 **네이티브 모달이 SAP COM을 막고 있는
    #    바로 그 상황에서도** 동작한다 — 그때 쓰라고 만든 것이다.
    data, status = _run_sap_bridge(['dump_windows_dialogs', r'C:\SAP_DMS\SAP_화면덤프'], 30,
                                   'Windows 대화상자 덤프')
    return jsonify(data), status


@app.route('/sap-download-documents-by-pattern', methods=['GET'])
def sap_download_documents_by_pattern():
    # 💡 [2026-09-16 신규] "*01+01*500*로 조회된 아이템 승인원 다운로드해줘"처럼 자재번호를
    #    직접 나열하는 대신 자재내역(MAKT-MAKTX) 와일드카드 패턴으로 매치되는 자재를 전부
    #    찾아 문서를 다운로드한다. 자재번호를 구하는 단계(MM60의 자재번호 필드에서 F4로
    #    연 검색도움말을 라벨 매트릭스로 읽는 방식 — 실사용 라이브 진단으로 확인함, 위
    #    sap_bridge_32.py의 "자재내역 와일드카드 패턴으로..." 절 참고)와 다운로드 단계
    #    (기존 download_documents_batch 재사용, 7개씩 묶어 순차 실행)를 하나로 묶은
    #    download_documents_by_pattern()을 그대로 호출한다.
    pattern = (request.args.get('pattern') or '').strip()
    doc_type = (request.args.get('type') or 'P01').strip()
    if not pattern:
        return jsonify({'ok': False, 'error': '검색 패턴(pattern 파라미터)이 필요합니다. 예: /sap-download-documents-by-pattern?pattern=*01+01*500*&type=P01'}), 400
    # ⚠️ [2026-11-09] 예전엔 "조회+다운로드"를 브릿지 한 방 호출(고정 240초)로 돌려서, 매치가
    #    많으면 **중간에 죽고 아무것도 못 돌려줬다**. 이제 ① 조회만 먼저 하고(건수를 알아야
    #    예산을 잡을 수 있다) ② 다운로드는 위 청크 루프에 넘긴다 — 그래야 못 끝냈을 때
    #    "몇 건까지 받았는지" 를 말할 수 있다.
    rdata, rstatus = _run_sap_bridge(['resolve_desc_pattern', pattern], 120,
                                     'SAP 자재내역 패턴 조회')
    if not rdata.get('ok'):
        return jsonify(rdata), rstatus
    mats = rdata.get('materials') or []
    if not mats:
        return jsonify({'ok': True, 'pattern': pattern, 'materials': [], 'docType': doc_type,
                        'message': '패턴 "%s"에 매치되는 자재가 없습니다.' % pattern}), 200
    desc_by = {d.get('matnr'): d.get('desc', '') for d in (rdata.get('matchDetails') or [])}
    data, status = _sap_doc_batch_download(
        mats, doc_type, extra={'pattern': pattern, 'matchDetails': rdata.get('matchDetails'),
                               'patternDiag': rdata.get('diag')})
    if data.get('ok'):
        lines = []
        for m in (data.get('done') or []):
            folders = sorted({os.path.basename(e.get('folder') or '')
                              for e in (data.get('placed') or []) if e.get('matnr') == m})
            lines.append('%s(%s) → %s' % (m, desc_by.get(m, ''),
                                          ', '.join(f for f in folders if f) or '(문서 없음)'))
        if lines:
            data['message'] = data['message'] + chr(10) + '자재별 매칭:' + chr(10) + chr(10).join(lines)
    return jsonify(data), status


@app.route('/sap-material-pattern', methods=['GET'])
def sap_material_pattern():
    # 💡 [2026-09-21, Phase 11] "SMAJ12A* 조회해줘"처럼 자재내역(MAKT-MAKTX) 와일드카드 패턴만 주고 "매치되는
    #    자재 목록"을 보고 싶을 때 — 다운로드 없이 목록(자재번호+자재내역)만 돌려준다. 실제 SAP 조작은 이미
    #    실사용 검증된 sap_bridge_32.py의 resolve_materials_by_description_pattern()(MM60 F4 검색도움말을
    #    읽기만 하고 취소 — SAP 데이터에 영향 없음)을 그대로 재사용한다.
    pattern = (request.args.get('pattern') or '').strip()
    if not pattern:
        return jsonify({'ok': False, 'error': '검색 패턴(pattern 파라미터)이 필요합니다. 예: /sap-material-pattern?pattern=SMAJ12A*'}), 400
    data, status = _run_sap_bridge(['resolve_pattern', pattern], 90, 'SAP 자재내역 패턴 조회')
    return jsonify(data), status


@app.route('/sap-material-rows', methods=['GET'])
def sap_material_rows():
    # 💡 [2026-10-15] 6자리 자재코드 목록을 주면 ZMM009 "복수 선택"으로 한 번에 조회해
    #    /sap-material-pattern과 **동일한 구조화 컬럼**을 돌려준다. 기존 경로
    #    (fetch_zmm009_material_list)는 범용 화면 덤프 텍스트를 AI에 넘겨 읽게 했는데,
    #    AI가 없는 값(납기일·제조사)을 만들어낸 환각 사고가 있어 분리했다.
    raw = (request.args.get('materials') or '').strip()
    mats = [m.strip() for m in re.split(r'[,\s]+', raw) if m.strip()]
    if not mats:
        return jsonify({'ok': False, 'error': '자재번호(materials 파라미터)가 필요합니다. 예: /sap-material-rows?materials=303410,303409'}), 400
    if len(mats) > 200:
        return jsonify({'ok': False, 'error': f'한 번에 조회 가능한 자재는 200건까지입니다(요청 {len(mats)}건).'}), 400
    data, status = _run_sap_bridge(['resolve_materials', ','.join(mats)], 90, 'SAP 자재 복수 조회')
    return jsonify(data), status


@app.route('/sap-bom-layouts', methods=['GET'])
def sap_bom_layouts():
    # 🔎 [2026-11-09 진단, 읽기 전용] ZPP033 레이아웃 선택 목록을 통째로 읽는다.
    #    "/KTK_LOC 로 조회했는데 정렬된 결과가 온다"가 반복될 때, 그 레이아웃에 정렬이 들어간
    #    것인지 **같은 이름이 둘**이라 엉뚱한 쪽이 집히는 것인지 가르려고 만들었다.
    #    아무것도 고르지 않고 팝업을 취소로 닫는다(저장 안 함).
    material = (request.args.get('material') or '').strip()
    plant = (request.args.get('plant') or '1000').strip()
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material)가 필요합니다 — 결과 그리드가 떠 있어야 레이아웃 목록을 볼 수 있습니다.'}), 400
    data, status = _run_sap_bridge(['list_bom_layouts', material, plant], 90, 'SAP BOM 레이아웃 목록')
    return jsonify(data), status


@app.route('/sap-bom', methods=['GET'])
def sap_bom():
    # 💡 [2026-09-15 신규] "SAP에서 502572 BOM 열어서 엑셀로 출력해줘"처럼 질문에 "BOM"과
    #    자재번호가 같이 언급되면(js/04h의 _aiFetchSapContext가 판정), 사람이 미리 SAP GUI에서
    #    그 자재의 BOM 화면을 열어둘 필요 없이 ZPP038("BOM 전개")로 직접 이동해 조회한다.
    #    실제 컨트롤 조작은 sap_bridge_32.py의 fetch_bom()/_navigate_to_bom_screen()에 있다
    #    (2026-09-15 실사용 SAP GUI "기록 및 재생" 매크로로 확보한 정확한 ID 재현).
    #    material 파라미터에 쉼표로 여러 자재를 같이 주면("SAP에서 502572,502573,502574 BOM
    #    보여줘"처럼 질문에 자재번호가 2개 이상이면) ZPP038의 자재코드 "복수 선택" 팝업으로
    #    한 번에 여러 BOM을 조회한다("BOM 복수 열람.vbs" 매크로로 확보, 2026-09-15).
    #    [2026-09-15 신규] tcode(single/multi/auto), explosion(single/multi), show_price,
    #    show_location 파라미터 추가 — 사용자가 실제 ZPP038 초기화면 캡처(Explosion type/
    #    Option을 빨간 박스로 표시)를 보여주며 "조회 전에 이 옵션들을 먼저 물어보고 선택한
    #    대로 조회해달라"고 요청 + "복수는 ZPP038, 단일은 ZPP033을 쓴다"고 알려줘서 추가함
    #    (js/04h의 BOM 옵션 사전질문 draft가 이 값들을 채워서 넘긴다).
    material = (request.args.get('material') or '').strip()
    plant = (request.args.get('plant') or '1000').strip()
    tcode_mode = (request.args.get('tcode') or 'auto').strip()  # 'single'|'multi'|'auto'
    explosion = (request.args.get('explosion') or 'single').strip()  # 'single'|'multi'
    show_price = (request.args.get('show_price') or '0').strip()
    show_location = (request.args.get('show_location') or '0').strip()
    # 🆕 [2026-09-17 신규, 사용자 요청] ALV 레이아웃을 더 이상 /STD_MC로 하드코딩하지 않고
    # AI 문답의 BOM 옵션 드롭다운에서 사람이 고른 값을 받는다 — 안 오면(하위호환) 빈 문자열을
    # 그대로 넘겨 sap_bridge_32.py의 기본값(_BOM_LAYOUT_VARIANT)이 적용되게 함.
    layout = (request.args.get('layout') or '').strip()
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material 파라미터)가 필요합니다. 예: /sap-bom?material=502572'}), 400
    material_count = len([m for m in material.split(',') if m.strip()])
    # ⚠️⚠️ [2026-10-19 실측] 단일 자재 기본값이 30초였는데 **실제 질의가 31~34초 걸린다**
    #   (722행 BOM, ZPP033 다단계, /STD_MC — 2회 평균 31.4초/상한500, 34.3초/상한1500).
    #   즉 30초로는 모자라서, `sap_login_config.json`이 있어 `_run_sap_bridge`가 +45초를
    #   얹어주는 PC에서만 우연히 성공하고 있었다 — 자동로그인을 안 쓰는 팀원 PC에서는
    #   단일 자재 BOM이 그냥 타임아웃이다. 복수 자재 상한과 같은 90초로 올린다.
    #   (행 상한은 `sap_bridge_32.py`의 `_GRID_ROW_CAP` — 2000행이면 ≈51초로 들어온다.)
    timeout = 90 if material_count <= 1 else min(90, 30 + 10 * material_count)
    data, status = _run_sap_bridge(
        ['fetch_bom', material, plant, tcode_mode, explosion, show_price, show_location, layout],
        timeout, 'SAP BOM 조회')
    return jsonify(data), status


_SAP_EXPORT_OUT_DIR = os.path.join('C:\\SAP_DMS', 'SAP조회')

# ── SAP 저장 경로 레지스트리 (2026-09-30 신규) ──────────────────────────────
# 모든 SAP 기능의 저장 위치를 한 곳에서 관리 — 새 기능 추가 시 여기에도 등록.
# 🗂 [2026-11-09] `path` 를 날것으로 적지 않고 **루트 + 폴더 이름**으로 조립한다 — 폴더
#    이름이 문자열로 흩어져 있으면 한 곳만 고쳐도 다른 곳이 조용히 어긋난다(2026-11-09
#    "승자 규칙이 두 벌" 사고와 같은 모양). 이 리스트가 SAP 저장 폴더의 **단일 원본**이고,
#    sap_bridge_32.py 는 폴더 이름을 모르고 **인자로 받아서** 쓴다.
SAP_DMS_ROOT = r'C:\SAP_DMS'
SAP_FOLDER_REGISTRY = [
    {'key': 'root',     'path': SAP_DMS_ROOT,                               'label': 'SAP 저장 루트',                 'kw': ['sap_dms', '저장 루트', 'sap 폴더']},
    # 📥 [2026-11-09 실사용 제보] ZDMSR004 문서 다운로드가 **루트에 흩뿌려져** 다른 용도
    #    폴더(승인원표지·구매오더·SAP조회…)와 섞였다 — 이제 제 폴더로 들어간다(없으면 만든다).
    {'key': 'docs',     'path': os.path.join(SAP_DMS_ROOT, '자재문서'),     'label': '자재 문서 다운로드 (ZDMSR004)', 'kw': ['자재문서', '문서 다운로드', '첨부']},
    {'key': 'docs_P01', 'path': os.path.join(SAP_DMS_ROOT, '원자재승인원'), 'label': '원자재 승인원(P01) 문서',       'kw': ['승인원 문서', '원자재 승인원', '승인원 다운로드']},
    # 하위호환: 예전 'doc' 키(문서/BOM 다운로드)를 쓰는 호출부가 있다 — 새 문서 폴더로 보낸다.
    {'key': 'doc',      'path': os.path.join(SAP_DMS_ROOT, '자재문서'),     'label': '문서/BOM 다운로드 (ZDMSR004)',  'kw': ['문서', 'bom', '다운로드']},
    {'key': 'approval', 'path': os.path.join(SAP_DMS_ROOT, '승인원표지'),    'label': '승인원 표지',                   'kw': ['승인원 표지', '표지']},
    {'key': 'po',       'path': os.path.join(SAP_DMS_ROOT, '구매오더'),      'label': '발주서 / 구매오더',             'kw': ['발주서', '구매오더', 'po', '발주']},
    {'key': 'export',   'path': os.path.join(SAP_DMS_ROOT, 'SAP조회'),       'label': 'SAP 조회 엑셀 내보내기',        'kw': ['엑셀', '조회', 'sap조회', '내보내기']},
    {'key': 'issue',    'path': os.path.join(SAP_DMS_ROOT, '이슈리포트'),     'label': '이슈 리포트',                   'kw': ['이슈', '버그', '오류리포트', '학습리포트']},
    {'key': 'dump',     'path': os.path.join(SAP_DMS_ROOT, 'SAP_화면덤프'),  'label': 'SAP 화면 덤프',                 'kw': ['덤프', '화면덤프', '트리덤프']},
    # 🆕 [2026-10-29 버그 수정, 사용자 제보 "SAP DMS 폴더가 뒤죽박죽"] _RSV_PDF_OUT_DIR
    # (sap_bridge_32.py, MB21 예약 청구서 PDF)이 실제로 쓰는 폴더인데 여기 레지스트리엔
    # 빠져 있었다 — "저장경로 열어줘" 같은 AI 문답 요청이 이 폴더만 찾지 못했다.
    {'key': 'reserve',  'path': os.path.join(SAP_DMS_ROOT, '계정대체청구서'), 'label': '자재 예약 청구서 (MB21/ZMM019)', 'kw': ['계정대체청구서', '예약', '청구서', 'mb21', 'zmm019']},
]

# 📋 [2026-11-09] 문서 타입 → 저장 폴더 키(데이터). 사람이 따로 부르는 이름이 있는 타입만
#    적고 나머지는 `docs`(자재문서) 로 모인다 — 폴더를 20개 만들 이유가 없다.
#    문서 타입↔이름 대응 자체는 프런트 `SAP_DOC_TYPES`/`SAP_DOC_ALIASES`(js/32) 가 원본이다.
SAP_DOC_TYPE_FOLDER_KEYS = {'P01': 'docs_P01'}
SAP_DOC_FOLDER_DEFAULT_KEY = 'docs'


def sap_folder_path(key, create=False):
    """카탈로그 키 → 실제 경로. 모르는 키면 None."""
    for e in SAP_FOLDER_REGISTRY:
        if e['key'] == key:
            if create:
                try:
                    os.makedirs(e['path'], exist_ok=True)
                except Exception:
                    pass
            return e['path']
    return None


def sap_doc_dir(doc_type, create=True):
    """ZDMSR004 문서 다운로드 목적 폴더 — 폴더 이름은 카탈로그에만 있다."""
    key = SAP_DOC_TYPE_FOLDER_KEYS.get((doc_type or '').strip().upper(),
                                       SAP_DOC_FOLDER_DEFAULT_KEY)
    return (sap_folder_path(key, create=create)
            or sap_folder_path(SAP_DOC_FOLDER_DEFAULT_KEY, create=create)
            or SAP_DMS_ROOT)


@app.route('/open-sap-folder', methods=['POST'])
def open_sap_folder():
    # 🗂 [2026-09-30 신규] AI 문답에서 "승인원 저장경로 열어줘" 등의 요청을 받아
    #    해당 폴더를 탐색기로 연다. key 또는 path를 받으며, 둘 다 없으면 전체 목록만 반환.
    data = request.get_json(silent=True) or {}
    key  = (data.get('key') or '').strip().lower()
    path = (data.get('path') or '').strip()

    if key:
        for e in SAP_FOLDER_REGISTRY:
            if e['key'] == key:
                path, label = e['path'], e['label']
                break
        else:
            return jsonify({'ok': False, 'error': f'알 수 없는 폴더 키: {key}'}), 400

    if not path:
        folders = [{'key': e['key'], 'path': e['path'], 'label': e['label']} for e in SAP_FOLDER_REGISTRY]
        return jsonify({'ok': True, 'listOnly': True, 'folders': folders})

    label = next((e['label'] for e in SAP_FOLDER_REGISTRY if e['path'] == path), path)
    try:
        os.makedirs(path, exist_ok=True)
    except Exception:
        pass
    try:
        os.startfile(path)
    except Exception as ex:
        return jsonify({'ok': False, 'error': f'폴더를 열지 못했습니다: {path} — {ex}'}), 500
    return jsonify({'ok': True, 'path': path, 'label': label})


# ── 🧹 SAP_DMS 보존기간 자동 정리 (2026-10-29 신규, 사용자 요청) ───────────────
# "조회 저장하고 나면 불필요한데 계속 저장할 필요 없을 것 같다" — **조회/진단성 산출물만**
# 대상이다. 실제 업무 문서(구매오더·승인원표지·계정대체청구서·ZDMSR004 문서 다운로드)는
# 재발급이 번거롭거나 증빙 성격이라 자동 정리 대상에서 **의도적으로 제외**한다.
SAP_CLEANUP_CONFIG_FILE = 'sap_cleanup_config.json'
_SAP_CLEANUP_DEFAULT_DAYS = max(1, int(os.environ.get('KORTEK_SAP_CLEANUP_DAYS') or 30))
# 폴더명이 아니라 SAP_FOLDER_REGISTRY의 key로 적어서, 폴더 경로가 바뀌어도 한 곳만 보면 됨.
_SAP_CLEANUP_TARGET_KEYS = ['export', 'dump', 'issue']


def _load_sap_cleanup_days():
    try:
        with open(SAP_CLEANUP_CONFIG_FILE, 'r', encoding='utf-8') as f:
            d = json.load(f)
            return max(1, int(d.get('retentionDays', _SAP_CLEANUP_DEFAULT_DAYS)))
    except Exception:
        return _SAP_CLEANUP_DEFAULT_DAYS


def _save_sap_cleanup_days(days):
    with open(SAP_CLEANUP_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump({'retentionDays': int(days)}, f, ensure_ascii=False, indent=2)


def _sap_folder_cleanup(retention_days=None, dry_run=False):
    """_SAP_CLEANUP_TARGET_KEYS 폴더에서 retention_days보다 오래된 파일/폴더를 지운다.
    dry_run=True면 지우지 않고 대상 목록만 돌려준다(AI 문답 미리보기·수동 점검용)."""
    days = int(retention_days) if retention_days is not None else _load_sap_cleanup_days()
    cutoff = time.time() - days * 86400
    folders = [e['path'] for e in SAP_FOLDER_REGISTRY if e['key'] in _SAP_CLEANUP_TARGET_KEYS]
    deleted, errors = [], []
    for folder in folders:
        if not os.path.isdir(folder):
            continue
        for name in os.listdir(folder):
            p = os.path.join(folder, name)
            try:
                mtime = os.path.getmtime(p)
                if mtime >= cutoff:
                    continue
                size = os.path.getsize(p) if os.path.isfile(p) else None
                if not dry_run:
                    if os.path.isdir(p):
                        shutil.rmtree(p)
                    else:
                        os.remove(p)
                deleted.append({'path': p, 'ageDays': round((time.time() - mtime) / 86400, 1), 'size': size})
            except Exception as e:
                errors.append({'path': p, 'error': str(e)})
    return {'deleted': deleted, 'errors': errors, 'retentionDays': days, 'dryRun': dry_run,
            'folders': folders}


_sap_cleanup_last_run_date = None


def _sap_cleanup_daily_tick():
    """하루 1회만 실제로 정리를 돈다 — _scheduler_loop()의 1분 루프에 얹혀서 호출됨
    (새 스레드를 또 안 띄우고 이미 있는 하트비트를 재사용)."""
    global _sap_cleanup_last_run_date
    today = datetime.now(KST).date()
    if _sap_cleanup_last_run_date == today:
        return
    _sap_cleanup_last_run_date = today
    try:
        result = _sap_folder_cleanup()
        if result['deleted']:
            print(f"[SAP_DMS 자동정리] {len(result['deleted'])}건 삭제(보존기간 {result['retentionDays']}일)")
        if result['errors']:
            print(f"[SAP_DMS 자동정리] {len(result['errors'])}건 삭제 실패")
    except Exception as e:
        print(f"[SAP_DMS 자동정리 오류] {e}")


@app.route('/sap-folder-cleanup', methods=['GET', 'POST'])
def sap_folder_cleanup_route():
    # GET: 현재 보존기간 설정만 조회. POST: 정리 실행(days로 이번만 다른 기간 지정 가능,
    # persistDays로 보존기간 자체를 영구 변경, dryRun=true면 지우지 않고 대상만 미리보기).
    if request.method == 'GET':
        return jsonify({'ok': True, 'retentionDays': _load_sap_cleanup_days(),
                        'targetFolders': [e['path'] for e in SAP_FOLDER_REGISTRY if e['key'] in _SAP_CLEANUP_TARGET_KEYS]})
    data = request.get_json(silent=True) or {}
    if data.get('persistDays') is not None:
        try:
            _save_sap_cleanup_days(int(data['persistDays']))
        except Exception as e:
            return jsonify({'ok': False, 'error': f'보존기간 저장 실패: {e}'}), 500
    days = data.get('days')
    try:
        days = int(days) if days is not None else None
    except Exception:
        days = None
    result = _sap_folder_cleanup(retention_days=days, dry_run=bool(data.get('dryRun')))
    return jsonify({'ok': True, **result})


@app.route('/close-sap-folder', methods=['POST'])
def close_sap_folder():
    # 🗂 [2026-09-30 신규] "폴더 닫아줘" 명령에서 호출 — Shell.Application COM으로
    #    해당 경로의 Explorer 창을 닫는다. powershell -NonInteractive 사용.
    data = request.get_json(silent=True) or {}
    path = (data.get('path') or '').strip()
    if not path:
        return jsonify({'ok': False, 'error': 'path가 필요합니다.'}), 400
    # Shell.Application COM으로 해당 경로의 Explorer 창을 찾아 닫음
    ps_cmd = (
        '$tgt = [System.IO.Path]::GetFullPath("' + path.replace('"', '').replace("'", '') + '")\n'
        '$shell = New-Object -ComObject Shell.Application\n'
        '$closed = 0\n'
        'foreach ($w in $shell.Windows()) {\n'
        '    try {\n'
        '        $wpath = [System.IO.Path]::GetFullPath($w.Document.Folder.Self.Path)\n'
        '        if ($wpath -eq $tgt) { $w.Quit(); $closed++ }\n'
        '    } catch {}\n'
        '}\n'
        'Write-Output "closed:$closed"'
    )
    try:
        result = subprocess.run(
            ['powershell', '-NonInteractive', '-NoProfile', '-Command', ps_cmd],
            capture_output=True, text=True, timeout=5
        )
        closed = 0
        for line in (result.stdout or '').splitlines():
            if line.startswith('closed:'):
                try:
                    closed = int(line.split(':')[1])
                except Exception:
                    pass
        return jsonify({'ok': True, 'closed': closed})
    except Exception as ex:
        return jsonify({'ok': False, 'error': str(ex)}), 500


@app.route('/sap-save-export', methods=['POST'])
def sap_save_export():
    # 💡 [2026-09-16 신규, 사용자 요청 "SAP 관련 저장 경로는 C:\SAP_DMS로 통일해줘"] "엑셀로
    #    내보내줘" 로컬 명령(js/04h의 _exportSapDataToExcel)이 예전엔 브라우저의 XLSX.js로
    #    직접 다운로드를 트리거해서(서버가 저장 경로를 모름) 실제 파일이 브라우저 기본
    #    다운로드 폴더(대부분 %USERPROFILE%\Downloads)에 떨어졌다 — 승인원 표지/구매오더/
    #    ZDMSR004 배치 다운로드는 전부 C:\SAP_DMS\ 아래 자기 전용 폴더에 쓰는데 이 경로만
    #    유일하게 어긋나 있었다. 이제 프런트가 XLSX 파일을 base64로 인코딩해 여기로 보내면
    #    서버가 직접 C:\SAP_DMS\SAP조회\ 에 써서 나머지 SAP 기능들과 저장 위치를 통일한다 —
    #    "해당 폴더로 이동하시겠습니까?"라고 되묻던 예전 흐름(/open-downloads-folder)도
    #    더 이상 필요 없어져 제거함(경로를 이제 서버가 정확히 알므로 다른 SAP 기능들처럼
    #    바로 자동으로 열어준다).
    data = request.get_json(force=True) or {}
    file_name = (data.get('fileName') or '').strip()
    data_base64 = data.get('dataBase64') or ''
    if not file_name or not data_base64:
        return jsonify({'ok': False, 'error': 'fileName/dataBase64가 필요합니다.'}), 400
    safe_name = re.sub(r'[\\/:*?"<>|]', '_', file_name)
    try:
        os.makedirs(_SAP_EXPORT_OUT_DIR, exist_ok=True)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'저장 폴더({_SAP_EXPORT_OUT_DIR})를 만들지 못했습니다: {e}'}), 500
    # 같은 이름 파일이 Excel에 열려 있으면 Permission denied — 숫자 접미사로 회피
    base, ext = os.path.splitext(safe_name)
    out_path = os.path.join(_SAP_EXPORT_OUT_DIR, safe_name)
    counter = 1
    while os.path.exists(out_path):
        try:
            with open(out_path, 'r+b'):
                pass
            break  # 쓸 수 있으면 덮어씀
        except PermissionError:
            out_path = os.path.join(_SAP_EXPORT_OUT_DIR, f'{base}_{counter}{ext}')
            counter += 1
    actual_name = os.path.basename(out_path)
    try:
        with open(out_path, 'wb') as f:
            f.write(base64.b64decode(data_base64))
    except Exception as e:
        return jsonify({'ok': False, 'error': f'파일 저장 중 오류가 발생했습니다: {e}'}), 500
    try:
        os.startfile(out_path)
    except Exception:
        pass
    return jsonify({'ok': True, 'path': out_path, 'folder': _SAP_EXPORT_OUT_DIR,
                    'message': f'"{actual_name}" 파일을 {_SAP_EXPORT_OUT_DIR} 폴더에 저장했습니다. 엑셀로 열었습니다.'})


@app.route('/sap-where-used', methods=['GET'])
def sap_where_used():
    # 💡 [2026-09-15 신규] "SAP에서 303410 역전개/사용처 보여줘"처럼 질문에 "역전개"/"사용처"와
    #    자재번호가 같이 언급되면(js/04h의 _aiFetchSapContext가 판정), CS15("단일레벨
    #    사용처리스트")로 직접 이동해 그 자재가 어느 상위 품목에 쓰이는지 조회한다 — ZPP038
    #    BOM 정전개의 반대 방향. 실제 컨트롤 조작은 sap_bridge_32.py의
    #    fetch_where_used()/_navigate_to_where_used_screen()에 있다(2026-09-15 실사용 SAP
    #    GUI "기록 및 재생" 매크로로 확보 — 단, 자재번호 입력 필드는 그 매크로에 안 나와서
    #    추측한 것이니 실패하면 그 함수의 주석부터 확인할 것).
    # 💡 [2026-09-15 다중 자재 지원] material 파라미터에 쉼표로 여러 자재를 같이 주면
    #    fetch_where_used가 자재마다 CS15를 따로 실행해 이어붙인다(ZPP038 BOM처럼 SAP 표준
    #    "복수 선택" 팝업으로 한 번에 묶지 않는 이유는 sap_bridge_32.py의 fetch_where_used
    #    docstring 참고 — ZPP046 배치 리포트를 시도했으나 _sap_dump_grid의 500행 캡이 여러
    #    자재 결과에 걸쳐 공유되는 바람에 사용처가 많은 자재 하나가 캡을 다 차지해 나머지
    #    자재 결과가 잘려나가는 문제가 실사용에서 확인돼, 자재별로 따로 실행하는 방식을 택함).
    material = (request.args.get('material') or '').strip()
    plant = (request.args.get('plant') or '1000').strip()
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material 파라미터)가 필요합니다. 예: /sap-where-used?material=303410'}), 400
    material_count = len([m for m in material.split(',') if m.strip()])
    timeout = 30 if material_count <= 1 else min(150, 30 + 20 * material_count)
    data, status = _run_sap_bridge(['fetch_where_used', material, plant], timeout, 'SAP 사용처 조회')
    return jsonify(data), status


@app.route('/sap-where-used-batch', methods=['GET'])
def sap_where_used_batch():
    # 💡 [2026-09-15 신규, 사용자 요청] "다중 사용처 조회해줘"/"일괄 역전개"처럼 "역전개"/
    #    "사용처"를 다중/일괄/복수의 의미로 말하면(js/04h의 판정) ZPP046("자재 사용처
    #    일괄조회")으로 SAP 서버 쪽에서 한 번에 묶어 빠르게 조회한다 — 위 /sap-where-used
    #    (자재별 CS15 순차 실행, 기본값)보다 빠르지만 _sap_dump_grid의 500행 캡을 여러 자재
    #    결과 전체가 공유해서 사용처가 많은 자재가 있으면 나머지가 잘릴 수 있다(자세한 내용은
    #    sap_bridge_32.py의 fetch_where_used_batch docstring 참고) — 사용자가 이
    #    트레이드오프를 알고 "다중/일괄/복수"라고 명시했을 때만 이 경로를 탄다(기본 동작
    #    아님). 복수 선택 팝업 입력 행이 8개까지만 확인돼 최대 8개로 자름.
    material = (request.args.get('material') or '').strip()
    plant = (request.args.get('plant') or '1000').strip()
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material 파라미터)가 필요합니다. 예: /sap-where-used-batch?material=303410,303411'}), 400
    materials = [m.strip() for m in material.split(',') if m.strip()][:8]
    data, status = _run_sap_bridge(['fetch_where_used_batch', ','.join(materials), plant], 60, 'SAP 사용처 일괄조회')
    return jsonify(data), status


@app.route('/sap-zmm009', methods=['GET'])
def sap_zmm009():
    # 💡 [2026-09-17 신규, 사용자 요청] "133025,133026 엑셀 출력해줘"처럼 자재번호(들)만
    #    주어지고 BOM/사용처/역전개 키워드가 없는 요청의 기본 조회 경로 — 사용자가 "ZMM009를
    #    기본으로 쓰면 좋겠다"고 요청해서 추가함. 실제 컨트롤 조작은 sap_bridge_32.py의
    #    fetch_zmm009_material_list()에 있다(사용자가 준 SAP GUI "기록 및 재생" 매크로에서
    #    그대로 가져온 정확한 필드 ID/버튼 시퀀스 — 추측 아님).
    material = (request.args.get('material') or '').strip()
    loc = (request.args.get('loc') or '1000').strip()
    layout = (request.args.get('layout') or '').strip()  # 🆕 2026-09-23 — 비우면 기본값(_ZMM009_LAYOUT_VARIANT) 사용
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material 파라미터)가 필요합니다. 예: /sap-zmm009?material=133025,133026'}), 400
    materials = [m.strip() for m in material.split(',') if m.strip()]
    timeout = min(150, 30 + 15 * len(materials))
    data, status = _run_sap_bridge(['fetch_zmm009_material_list', ','.join(materials), loc, layout], timeout, 'SAP ZMM009 자재 조회')
    return jsonify(data), status


# ── 승인원 표지 생성 ──────────────────────────────────────────
#    [2026-09-15 신규] "SAP에서 104477 승인원 표지 생성해줘" — 사내 별도 데스크톱 앱("연구소
#    가이드 시스템")의 exe를 pyinstxtractor-ng로 풀고 main.pyc 바이트코드를 분석해서 그
#    앱의 GuiApp._approval_* 메서드들을 그대로 재현했다(디컴파일러가 Python 3.13을 지원 안
#    해서 완전한 소스 복원은 안 됐지만, docstring·상수 풀·바이트코드 흐름으로 충분히
#    재구성함 — 셀 주소·필드 ID·VKey 값까지 전부 원본에서 확인한 값 그대로). 두 단계로 나눔:
#    ① `/sap-approval-fetch` — SAP에서 자재정보만 조회(문서 생성 전 미리보기/확인용)
#    ② `/sap-approval-generate` — 조회된 정보 + 사람이 채운 나머지 항목으로 실제 엑셀/워드
#    파일을 만든다. AI 문답 쪽(js/04h)에서 이 둘을 연결해 "필요한 항목이 비어 있으면
#    물어보고, 다 채워지면 생성"하는 흐름을 만든다.
_APPROVAL_TEMPLATE_XLSX = os.path.join(BASE_DIR, 'templates', '승인원_양식.xlsx')
_APPROVAL_TEMPLATE_DOCX = os.path.join(BASE_DIR, 'templates', '승인원_양식.docx')
_APPROVAL_SHEET = '승인원표지'
_APPROVAL_OUT_DIR = os.path.join('C:\\SAP_DMS', '승인원표지')  # ZDMSR004 다운로드와 같은 자리(C:\SAP_DMS) 아래 전용 폴더
_APPROVAL_PRE_REMARK = '가승인원'
# 엑셀 셀 주소 — 원본 앱 바이트코드의 APPROVAL_CELLS 상수를 그대로 옮김.
_APPROVAL_CELLS = {
    'group_no': 'C8', 'group_name': 'C9', 'item_code': 'C10', 'desc': 'C11', 'sub_desc': 'C12',
    'dms': 'C13', 'remark': 'C14', 'chk_date': 'F20', 'chk_name': 'F21', 'apv_date': 'F28', 'apv_name': 'F29',
}
# 워드 표(중첩 표 0번, 1열=값) 행 번호 — 원본 앱의 APPROVAL_DOCX_ROWS.
_APPROVAL_DOCX_ROWS = {'group_no': 1, 'group_name': 2, 'item_code': 3, 'desc': 4, 'sub_desc': 5, 'dms': 6, 'remark': 7}
# 워드 표(중첩 표 1번) 서명란 (행, 열) — 원본 앱의 APPROVAL_DOCX_SIGN.
_APPROVAL_DOCX_SIGN = {'chk_date': (1, 3), 'chk_name': (2, 3), 'apv_date': (5, 3), 'apv_name': (6, 3)}


def _approval_fill_xlsx(tpl_path, out_path, r, ctx):
    """엑셀 양식에 값을 채워 저장한다(원본 앱 `_approval_fill_xlsx` 재현)."""
    import openpyxl
    wb = openpyxl.load_workbook(tpl_path)
    ws = wb[_APPROVAL_SHEET]
    ws[_APPROVAL_CELLS['item_code']] = r['code']
    ws[_APPROVAL_CELLS['desc']] = r.get('desc', '')
    ws[_APPROVAL_CELLS['sub_desc']] = r.get('sub', '')
    ws[_APPROVAL_CELLS['group_no']] = r.get('matkl', '')
    ws[_APPROVAL_CELLS['group_name']] = r.get('group', '')
    ws[_APPROVAL_CELLS['remark']] = ctx['remark']
    ws[_APPROVAL_CELLS['dms']] = ctx['dms_text']
    if ctx.get('name_chk'):
        ws[_APPROVAL_CELLS['chk_name']] = ctx['name_chk']
        ws[_APPROVAL_CELLS['chk_date']] = f"Date: {ctx['today']}"
    if ctx.get('name_apv'):
        ws[_APPROVAL_CELLS['apv_name']] = ctx['name_apv']
        ws[_APPROVAL_CELLS['apv_date']] = f"Date: {ctx['today']}"
    from openpyxl.styles import Alignment as _Align
    for _addr, _key in (('C34', 'vendor_name'), ('C35', 'vendor_address'), ('C36', 'vendor_tel')):
        if ctx.get(_key):
            ws[_addr] = ctx[_key]
            ws[_addr].alignment = _Align(horizontal='center', vertical='center', wrap_text=True)
    wb.save(out_path)


def _set_cell_text_preserve_format(cell, text):
    """`cell.text = 값` 대신 첫 문단의 첫 런(run)에만 텍스트를 채워 넣어 원본 서식(글꼴/크기/
    문단 간격 등)을 유지한다. ⚠️⚠️ [2026-09-15 실사용에서 확인] `cell.text = 값` 대입은
    python-docx 내부적으로 그 셀의 문단을 통째로 지우고 기본 서식의 새 문단/런을 만드는
    방식이라, 실제로 생성해보니 채워진 값들이 원본 라벨(맑은 고딕 12pt)과 다른 기본 폰트로
    나왔고 — 문단 간격 등도 같이 초기화되면서 누적된 높이 차이로 "1페이지로 나와야 하는
    양식이 2페이지로 밀려나는" 문제가 실사용에서 확인됨(원본 앱은 이 문제가 없었음, 즉 이
    코드의 재현 과정에서 생긴 회귀). 대신 기존 런이 있으면 그 런의 `.text`만 바꿔 서식을
    그대로 물려받고, 여분 런/문단은 제거해 항상 "문단 1개·런 1개"로 정리한다(런이 아예
    없던 빈 셀은 문단에 새 런을 추가 — 이 경우만 어쩔 수 없이 기본 서식이 적용됨)."""
    para = cell.paragraphs[0]
    for extra_para in cell.paragraphs[1:]:
        extra_para._element.getparent().remove(extra_para._element)
    if para.runs:
        para.runs[0].text = text
        for extra_run in para.runs[1:]:
            extra_run._element.getparent().remove(extra_run._element)
    else:
        para.add_run(text)


def _approval_fill_docx(tpl_path, out_path, r, ctx):
    """워드 양식에 값을 채워 저장한다(원본 앱 `_approval_fill_docx` 재현) — 양식은 큰 표 하나
    안에 중첩 표가 5개 들어있는 구조(python-docx로 실제 열어서 확인함): 0번이 본문(자재그룹/
    자재코드/... 7개 행), 1번이 서명란(담당자/팀장), 2~4번은 협력사 정보·문서번호·양식버전
    (이 코드에서는 건드리지 않음 — 협력사에서 별도로 채워 넣는 영역)."""
    from docx import Document
    doc = Document(tpl_path)
    outer_cell = doc.tables[0].cell(1, 0)
    nested = outer_cell.tables
    if len(nested) < 2:
        raise RuntimeError('워드 양식의 표 구조가 예상과 다릅니다.')
    t_main, t_sign = nested[0], nested[1]

    values = {
        'group_no': r.get('matkl', ''), 'group_name': r.get('group', ''), 'item_code': r['code'],
        'desc': r.get('desc', ''), 'sub_desc': r.get('sub', ''), 'dms': ctx['dms_text'], 'remark': ctx['remark'],
    }
    for key, row_idx in _APPROVAL_DOCX_ROWS.items():
        _set_cell_text_preserve_format(t_main.cell(row_idx, 1), str(values.get(key, '')))

    if ctx.get('name_chk'):
        rr, cc = _APPROVAL_DOCX_SIGN['chk_name']
        _set_cell_text_preserve_format(t_sign.cell(rr, cc), ctx['name_chk'])
        rr, cc = _APPROVAL_DOCX_SIGN['chk_date']
        _set_cell_text_preserve_format(t_sign.cell(rr, cc), f"Date: {ctx['today']}")
    if ctx.get('name_apv'):
        rr, cc = _APPROVAL_DOCX_SIGN['apv_name']
        _set_cell_text_preserve_format(t_sign.cell(rr, cc), ctx['name_apv'])
        rr, cc = _APPROVAL_DOCX_SIGN['apv_date']
        _set_cell_text_preserve_format(t_sign.cell(rr, cc), f"Date: {ctx['today']}")

    # 협력사 정보 → Provider Info 표(nested[2]) Name/Address/Tel
    if len(nested) >= 3:
        info_tbl = nested[2]
        for row_i, key in ((1, 'vendor_name'), (2, 'vendor_address'), (3, 'vendor_tel')):
            if ctx.get(key):
                try:
                    _set_cell_text_preserve_format(info_tbl.cell(row_i, 1), ctx[key])
                except Exception:
                    pass

    # 대표자(J_1KFREPRE) → Provider 서명란 Written/Reviewed/Approved by (nested[1], col 1)
    # 이름(rows 2,4,6) + 날짜(rows 1,3,5): 수평·수직 모두 정중앙
    if ctx.get('vendor_rep'):
        from docx.enum.text import WD_ALIGN_PARAGRAPH as _WDA
        from copy import deepcopy as _deepcopy
        from docx.oxml.ns import qn as _qn2
        from lxml import etree as _et2
        rep = ctx['vendor_rep'].strip()
        date_str = f"Date: {ctx['today']}"

        def _cell_vcenter(cell):
            tc = cell._tc
            tcPr = tc.find(_qn2('w:tcPr'))
            if tcPr is None:
                tcPr = _et2.SubElement(tc, _qn2('w:tcPr'))
            vAlign = tcPr.find(_qn2('w:vAlign'))
            if vAlign is None:
                vAlign = _et2.SubElement(tcPr, _qn2('w:vAlign'))
            vAlign.set(_qn2('w:val'), 'center')

        # Customer 날짜 셀(row=1, col=3)의 rPr를 복사해 Provider 날짜 셀의 폰트를 맞춤
        def _copy_date_rpr(tgt_cell):
            try:
                ref_cell = t_sign.cell(1, 3)
                if not (ref_cell.paragraphs and ref_cell.paragraphs[0].runs):
                    return
                src_rPr = ref_cell.paragraphs[0].runs[0]._r.find(_qn2('w:rPr'))
                if src_rPr is None:
                    return
                if not (tgt_cell.paragraphs and tgt_cell.paragraphs[0].runs):
                    return
                tgt_r = tgt_cell.paragraphs[0].runs[0]._r
                existing = tgt_r.find(_qn2('w:rPr'))
                if existing is not None:
                    tgt_r.remove(existing)
                tgt_r.insert(0, _deepcopy(src_rPr))
            except Exception:
                pass

        if rep:
            for name_row, date_row in ((2, 1), (4, 3), (6, 5)):
                try:
                    c_n = t_sign.cell(name_row, 1)
                    _set_cell_text_preserve_format(c_n, rep)
                    c_n.paragraphs[0].alignment = _WDA.CENTER
                    _cell_vcenter(c_n)
                except Exception:
                    pass
                try:
                    c_d = t_sign.cell(date_row, 1)
                    _set_cell_text_preserve_format(c_d, date_str)
                    c_d.paragraphs[0].alignment = _WDA.CENTER
                    _cell_vcenter(c_d)
                    _copy_date_rpr(c_d)
                except Exception:
                    pass

    # 외부 셀 안의 테이블 사이 빈 단락(~5mm × 7개 = ~35mm)을 1pt 높이로 최소화 → 1페이지 유지
    from lxml import etree as _et
    from docx.oxml.ns import qn as _qn
    for _ch in list(outer_cell._tc):
        if _ch.tag != _qn('w:p'):
            continue
        if ''.join(_t.text or '' for _t in _ch.findall('.//' + _qn('w:t'))).strip():
            continue  # 내용 있는 단락은 건드리지 않음
        _pPr = _ch.find(_qn('w:pPr'))
        if _pPr is None:
            _pPr = _et.SubElement(_ch, _qn('w:pPr'))
        _sp = _pPr.find(_qn('w:spacing'))
        if _sp is None:
            _sp = _et.SubElement(_pPr, _qn('w:spacing'))
        _sp.set(_qn('w:before'), '0')
        _sp.set(_qn('w:after'), '0')
        _sp.set(_qn('w:line'), '20')
        _sp.set(_qn('w:lineRule'), 'exact')
        _rPr = _pPr.find(_qn('w:rPr'))
        if _rPr is None:
            _rPr = _et.SubElement(_pPr, _qn('w:rPr'))
        for _tag in (_qn('w:sz'), _qn('w:szCs')):
            _sz = _rPr.find(_tag)
            if _sz is None:
                _sz = _et.SubElement(_rPr, _tag)
            _sz.set(_qn('w:val'), '2')

    doc.save(out_path)


@app.route('/sap-vendor-lookup', methods=['GET'])
def sap_vendor_lookup():
    # ZMM005(공급업체 리스트)에서 사업자등록번호로 협력사명·LIFNR 조회.
    # 파라미터: stcd2 (사업자등록번호, 하이픈 포함 가능)
    stcd2 = (request.args.get('stcd2') or '').strip().replace('-', '')
    if not stcd2:
        return jsonify({'ok': False, 'error': '사업자등록번호(stcd2 파라미터)가 필요합니다.'}), 400
    data, status = _run_sap_bridge(['fetch_vendor_by_stcd2', stcd2], 30, 'ZMM005 공급업체 조회')
    return jsonify(data), status


@app.route('/sap-vendor-info', methods=['GET'])
def sap_vendor_info():
    # 자재번호로 MM03 구매탭 LIFNR → ZMM005 공급업체 상세정보 조회.
    # 파라미터: material (자재번호)
    material = (request.args.get('material') or '').strip()
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material 파라미터)가 필요합니다.'}), 400
    data, status = _run_sap_bridge(['fetch_vendor_info_by_material', material], 60, 'MM03→ZMM005 공급업체 조회')
    return jsonify(data), status



@app.route('/sap-open-folder', methods=['GET'])
def sap_open_folder():
    # 로컬 폴더를 탐색기로 열기. 파라미터: path (폴더 경로)
    # 보안: C:\SAP_DMS\ 이하 경로만 허용.
    import os
    path = (request.args.get('path') or '').strip()
    if not path:
        path = r'C:\SAP_DMS'
    # 경로 정규화 후 SAP_DMS 하위인지 확인
    try:
        norm = os.path.normpath(os.path.abspath(path))
        allowed_root = os.path.normpath(os.path.abspath(r'C:\SAP_DMS'))
        if not norm.startswith(allowed_root):
            return jsonify({'ok': False, 'error': 'C:\\SAP_DMS 하위 경로만 열 수 있습니다.'}), 403
        os.startfile(norm)
        return jsonify({'ok': True, 'path': norm})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/sap-approval-fetch', methods=['GET'])
def sap_approval_fetch():
    # "SAP에서 자재정보 가져오기" 단계 — 자재 여러 개(최대 30개, 원본 앱과 동일 상한)의
    # 자재내역·자재그룹·Sub-Description을 SAP에서 조회하고, 자재그룹명은 matgroups.json에서
    # 채운다. 파일 생성은 안 함 — /sap-approval-generate가 별도로 처리.
    materials_str = (request.args.get('materials') or '').strip()
    if not materials_str:
        return jsonify({'ok': False, 'error': '자재번호 목록(materials 파라미터, 쉼표구분)이 필요합니다.'}), 400
    materials = [m.strip() for m in materials_str.split(',') if m.strip()][:30]
    timeout = min(180, 20 + 8 * len(materials))
    data, status = _run_sap_bridge(['fetch_approval_info', ','.join(materials)], timeout, 'SAP 승인원 정보 조회')
    if data.get('ok') and isinstance(data.get('results'), list):
        for r in data['results']:
            if r.get('ok'):
                r['group'] = _approval_group_name(r.get('matkl', ''))
                r['group_missing'] = not bool(r['group'])
    return jsonify(data), status


@app.route('/sap-approval-generate', methods=['POST'])
def sap_approval_generate():
    # "표지 생성" 단계 — /sap-approval-fetch로 얻은 자재정보 결과(results)와 사람이 채운
    # 나머지 항목(출력형식/담당자/팀장/가승인원 여부/Revision/Remark)으로 실제 엑셀/워드
    # 파일을 만든다. 파일명 규칙은 원본 앱과 동일: (가)승인원_자재코드_Rev00.
    body = request.get_json(force=True, silent=True) or {}
    results = body.get('results') or []
    ok_results = [r for r in results if isinstance(r, dict) and r.get('ok') and r.get('code')]
    if not ok_results:
        return jsonify({'ok': False, 'error': '생성할 자재 정보가 없습니다. 먼저 SAP에서 자재정보를 조회해주세요.'}), 400

    # 공통(fallback) 필드 — per_material에 없을 때 사용
    shared_writer = (body.get('writer') or '').strip()
    shared_leader = (body.get('leader') or '').strip()
    shared_is_pre = bool(body.get('is_pre'))
    shared_fmt = (body.get('format') or 'docx').strip().lower()
    if shared_fmt not in ('xlsx', 'docx', 'both'):
        shared_fmt = 'docx'
    shared_rev = (body.get('rev') or '00').strip() or '00'
    shared_remark = (body.get('remark') or '').strip()
    # 품목별 필드 override: {code: {writer, leader, rev, remark, format, isPre, vendor}}
    per_material = body.get('per_material') or {}
    if not isinstance(per_material, dict):
        per_material = {}

    today_str = datetime.now(KST).strftime('%Y.%m.%d')
    # 양식 파일 존재 여부는 루프 전에 한 번만 확인
    if not os.path.exists(_APPROVAL_TEMPLATE_XLSX):
        return jsonify({'ok': False, 'error': f'엑셀 양식({_APPROVAL_TEMPLATE_XLSX})을 찾을 수 없습니다.'}), 500
    if not os.path.exists(_APPROVAL_TEMPLATE_DOCX):
        return jsonify({'ok': False, 'error': f'워드 양식({_APPROVAL_TEMPLATE_DOCX})을 찾을 수 없습니다.'}), 500

    try:
        os.makedirs(_APPROVAL_OUT_DIR, exist_ok=True)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'저장 폴더({_APPROVAL_OUT_DIR})를 만들지 못했습니다: {e}'}), 500

    made, failed = [], []
    last_good_vendor_info = {}  # ZMM006에 없는 자재는 같은 배치 이전 성공 결과를 carry-forward
    for r in ok_results:
        # 품목별 협력사 정보 조회 (ZMM006→LIFNR→ZMM005) — 품목마다 다른 업체일 수 있으므로 각각 조회
        vendor_info = {}
        try:
            v_data, _ = _run_sap_bridge(
                ['fetch_vendor_info_by_material', r['code']], 60, f"협력사 정보 조회({r['code']})")
            if v_data.get('ok'):
                vi = v_data.get('vendor') or {}
                if vi.get('name'):
                    vendor_info = vi
                    last_good_vendor_info = vi
        except Exception:
            pass  # SAP 미연결·실패 시 수동 입력값만 사용
        # 이 자재의 ZMM006 조회 실패 시 같은 배치의 이전 성공 결과 재사용
        if not vendor_info and last_good_vendor_info:
            vendor_info = last_good_vendor_info

        # 품목별 필드 — 없으면 공통값으로 fallback
        pm = per_material.get(r.get('code', ''), {}) if per_material else {}
        if not isinstance(pm, dict):
            pm = {}
        writer = ((pm.get('writer') or '').strip()) or shared_writer
        leader = ((pm.get('leader') or '').strip()) or shared_leader
        rev = ((pm.get('rev') or '').strip()) or shared_rev
        rev = rev or '00'
        remark = ((pm.get('remark') or '').strip()) or shared_remark
        # 품목별 출력형식·가승인원 여부
        r_fmt = (pm.get('format') or '').strip().lower() or shared_fmt
        if r_fmt not in ('xlsx', 'docx', 'both'):
            r_fmt = shared_fmt
        r_is_pre = pm.get('isPre') if 'isPre' in pm else shared_is_pre
        # vendor_name: 수동입력 우선, 없으면 SAP 자동조회 결과 사용
        vendor_name = (pm.get('vendor') or '').strip() or vendor_info.get('name', '')
        # kind 결정
        kind_val = 'New' if rev in ('00', '0') else 'Update'
        # remark 가공 — 원본 앱 로직 그대로
        if r_is_pre:
            if remark and _APPROVAL_PRE_REMARK not in remark:
                remark = f'{_APPROVAL_PRE_REMARK} / {remark}'
            elif not remark:
                remark = _APPROVAL_PRE_REMARK
        if not remark:
            remark = '.'
        dms_text = (('■' if kind_val == 'New' else '□') + ' New '
                    + ('■' if kind_val == 'Update' else '□') + f' Update (Revision: {rev} )')
        prefix = _APPROVAL_PRE_REMARK if r_is_pre else '승인원'
        r_ctx = {
            'today': today_str,
            'remark': remark, 'name_chk': writer, 'name_apv': leader, 'dms_text': dms_text,
            'vendor_name':    vendor_name,
            'vendor_address': vendor_info.get('address', ''),
            'vendor_tel':     vendor_info.get('tel', ''),
            'vendor_rep':     vendor_info.get('representative', ''),
        }
        base = f"{prefix}_{r['code']}_Rev{rev}"
        need_xlsx = r_fmt in ('xlsx', 'both')
        need_docx = r_fmt in ('docx', 'both')
        if need_xlsx:
            out_path = os.path.join(_APPROVAL_OUT_DIR, base + '.xlsx')
            try:
                _approval_fill_xlsx(_APPROVAL_TEMPLATE_XLSX, out_path, r, r_ctx)
                made.append(out_path)
            except Exception as e:
                failed.append(f"{r['code']} (xlsx): {e}")
        if need_docx:
            out_path = os.path.join(_APPROVAL_OUT_DIR, base + '.docx')
            try:
                _approval_fill_docx(_APPROVAL_TEMPLATE_DOCX, out_path, r, r_ctx)
                made.append(out_path)
            except Exception as e:
                failed.append(f"{r['code']} (docx): {e}")

    # 다운로드 완료 후 폴더를 탐색기로 열어준다 — ZDMSR004 일괄 다운로드와 동일한 패턴.
    try:
        os.startfile(_APPROVAL_OUT_DIR)
    except Exception:
        pass

    msg = f'승인원 표지 {len(made)}건이 생성되었습니다.'
    if failed:
        msg += f'\n\n실패 {len(failed)}건:\n' + '\n'.join(failed[:5])
    return jsonify({'ok': True, 'made': made, 'failed': failed, 'folder': _APPROVAL_OUT_DIR, 'message': msg})


# 🛒 [2026-09-15 신규] "구매오더 요청" — AI 문답에 전자세금계산서/견적서 PDF를 첨부하면 항목을
#    추출해 "연구소 구매오더,기타출고 제안 BDC Upload양식"(사용자 제공 Z38MMR060.xls) 형식의
#    엑셀을 만들어준다. ZMMR060에 이 엑셀을 실제로 "업로드"하는 정확한 SAP GUI 조작은 아직
#    확인 전(매크로/라이브 진단 대기 중)이라, 이 엔드포인트는 **엑셀 생성 + 폴더 자동 오픈까지만**
#    한다 — SAP 자동화(업로드~F8~저장확인~ZMM018 발주서 출력)는 그 조작이 확인되면 이어서 붙일
#    예정(CLAUDE.md "🛒 구매오더 요청" 절 참고). 컬럼 순서/헤더 문구/시작 위치(헤더 5행·B열,
#    데이터 6행부터)는 사용자가 준 원본 Z38MMR060.xls의 "Upload" 시트를 xlrd로 직접 읽어
#    그대로 확인한 값 — 추측이 아니라 실측값이므로 바꾸지 말 것.
_PO_OUT_DIR = os.path.join('C:\\SAP_DMS', '구매오더')
_PO_EXCEL_HEADERS = ['자재코드', '자재명', '요청수량', '필요일자', '구매그룹', '프로젝트코드',
                      '수령인', '구매담당자 사번', '요청사유', 'VINA PO', '목적', '비고']


@app.route('/po-build-excel', methods=['POST'])
def po_build_excel():
    # 💡 원본 템플릿이 레거시 BIFF .xls라(openpyxl은 이 포맷을 못 씀) xlwt로 새로 써서 같은
    #    확장자(.xls)로 맞춘다 — SAP이 실제로 어떤 방식으로 이 파일을 읽을지 아직 몰라서, 형식
    #    불일치로 인한 새로운 실패를 피하려고 원본과 동일한 바이너리 포맷을 그대로 재현했다.
    import xlwt
    data = request.get_json(silent=True) or {}
    rows = data.get('rows') or []
    if not rows:
        return jsonify({'ok': False, 'error': '엑셀에 넣을 품목이 없습니다.'}), 400

    try:
        os.makedirs(_PO_OUT_DIR, exist_ok=True)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'저장 폴더({_PO_OUT_DIR})를 만들지 못했습니다: {e}'}), 500

    wb = xlwt.Workbook(encoding='utf-8')
    ws = wb.add_sheet('Upload')
    title_style = xlwt.easyxf('font: bold on')
    header_style = xlwt.easyxf('font: bold on; pattern: pattern solid, fore_colour yellow;')
    ws.write(1, 1, '연구소 구매오더,기타출고 제안 BDC Upload양식 [양식변경불가, 작성방법 참조]', title_style)
    ws.write(2, 1, '※ 양식변경사항 발생시, iCare로 요청 바랍니다.')
    for ci, h in enumerate(_PO_EXCEL_HEADERS):
        ws.write(4, 1 + ci, h, header_style)
    for ri, row in enumerate(rows):
        for ci, h in enumerate(_PO_EXCEL_HEADERS):
            ws.write(5 + ri, 1 + ci, row.get(h, ''))

    ts = datetime.now(KST).strftime('%Y%m%d_%H%M%S')
    file_name = f'구매오더요청_{ts}.xls'
    out_path = os.path.join(_PO_OUT_DIR, file_name)
    try:
        wb.save(out_path)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'엑셀 저장 중 오류: {e}'}), 500

    # 생성 완료 후 폴더를 탐색기로 열어준다 — ZDMSR004/승인원 표지와 동일한 패턴.
    try:
        os.startfile(_PO_OUT_DIR)
    except Exception:
        pass

    return jsonify({'ok': True, 'fileName': file_name, 'path': out_path, 'folder': _PO_OUT_DIR,
                     'message': f'구매오더 요청 엑셀({len(rows)}개 품목)을 생성했습니다: {file_name}'})


# ── 🏢 그룹웨어(다우오피스) 연동 ─────────────────────────────────────
# 🆕 [2026-10-16 신규] gw.kortek.co.kr의 내부 REST API를 **사람이 로그인해 둔 브라우저 세션**으로
# 읽는다. 상세 설계/안전원칙은 gw_bridge.py 최상단 주석 참고.
#  · 자동 로그인 없음 — 로그인 실패가 쌓이면 CAPTCHA가 뜨고 그다음은 사내 계정 잠금이다.
#  · 읽기 전용 — 쓰기(일정 등록/결재)는 확인 절차를 따로 설계하기 전까지 열지 않는다.
# gw_bridge는 import 실패해도 백엔드 전체가 죽지 않게 지연 import 한다(크롬이 없는 PC 대비).
@app.route('/gw/status', methods=['GET'])
def gw_status():
    try:
        import gw_bridge
    except Exception as e:
        return jsonify({'ok': False, 'reason': 'module', 'message': f'gw_bridge 로드 실패: {e}'})
    try:
        return jsonify(gw_bridge.session_info())
    except Exception as e:
        return jsonify({'ok': False, 'reason': 'error', 'message': str(e)})


@app.route('/gw/open', methods=['POST'])
def gw_open():
    """그룹웨어용 전용 크롬 창을 띄운다. 로그인은 **사람이 직접** 한다."""
    try:
        import gw_bridge
        ok, msg = gw_bridge.launch_chrome()
        if not ok:
            return jsonify({'ok': False, 'message': msg})
        return jsonify({'ok': True, 'message': msg, 'session': gw_bridge.session_info()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


# 🔑 그룹웨어 로그인 정보 — SAP 로그인과 동일한 원칙:
#    비밀번호는 DPAPI로 암호화해 gw_login_config.json(.gitignore)에만 두고,
#    **어떤 응답에도 비밀번호를 돌려주지 않는다**(등록 여부와 아이디만).
_GW_LOGIN_CFG_PATH = os.path.join(BASE_DIR, 'gw_login_config.json')


# ══ 📧🔑 메일 설정 ↔ 그룹웨어 로그인 정보 동기화 (2026-10-30, 사용자 요청) ══════════
#  "이메일 서버 설정과 그룹웨어 자동 로그인이 같은 아이디 비밀번호를 사용하니까 (…)
#   그룹웨어 정보를 등록하면 이메일 서버 설정값도 동시 저장되고 반대도"
#
#  실측(2026-10-30)으로 전제를 확인하고 들어갔다: 메일 `user`의 **'@' 앞부분이 그룹웨어
#  `user`와 정확히 일치**했다(인사관리는 사번 10자리라 **별개** — 여기에 섞지 말 것).
#
#  ⚠️⚠️ **Drive 불러오기(`/mail/decrypt`·`/all/decrypt`)에는 일부러 연결하지 않았다.**
#     `mail_secure.enc`는 백업 폴더의 **팀 공용 파일 한 개**라, 관리자("팀") 비밀번호를 아는
#     팀원 누구나 불러온다. 거기에 그룹웨어 동기화를 붙이면 **한 사람의 그룹웨어 계정이
#     팀원 PC마다 깔려** 남의 이름으로 자동 로그인되고, 비밀번호가 바뀐 뒤엔 여러 PC가
#     동시에 실패를 쌓아 **계정이 잠긴다**(그룹웨어가 잠기면 메일·전자결재까지 멈춘다).
#     동기화는 **그 PC에서 사람이 직접 저장할 때만** 일어난다.
#
#  ⚠️ 동기화 실패는 원래 저장을 깨지 않는다 — 결과만 응답에 실어 보여준다(조용히 삼키지 않음).
_MAIL_HOST_PREFIXES = ('kmail.', 'mail.', 'smtp.', 'pop.', 'pop3.', 'imap.', 'webmail.')


def _mail_domain_guess():
    """메일 도메인을 알아낸다 — ① 지금 저장된 메일 주소의 '@' 뒤 ② SMTP 호스트에서
    메일 서버 접두어를 뗀 것. 둘 다 안 되면 None(그때는 동기화를 안 한다)."""
    try:
        if SMTP_USER and '@' in SMTP_USER:
            dom = SMTP_USER.split('@', 1)[1].strip()
            if dom:
                return dom
    except Exception:
        pass
    host = str(SMTP_HOST or '').strip().lower()
    for pre in _MAIL_HOST_PREFIXES:
        if host.startswith(pre):
            return host[len(pre):]
    return host.split('.', 1)[1] if host.count('.') >= 2 else (host or None)


def _sync_gw_from_mail():
    """메일 설정 → 그룹웨어 로그인 정보(DPAPI). 반환 (ok, 메시지)."""
    user = str(SMTP_USER or '').strip()
    pw = str(SMTP_PASS or '')
    if not user or not pw:
        return False, '메일 아이디/비밀번호가 비어 있어 그룹웨어에 동기화하지 않았습니다.'
    gw_user = user.split('@')[0].strip()
    if not gw_user:
        return False, '메일 아이디에서 그룹웨어 아이디를 뽑지 못했습니다.'
    try:
        enc = _dpapi_encrypt_b64(pw)
        with open(_GW_LOGIN_CFG_PATH, 'w', encoding='utf-8') as f:
            json.dump({'user': gw_user, 'pw_dpapi': enc}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return False, f'그룹웨어 동기화 실패: {e}'
    return True, f'그룹웨어 로그인 정보도 같이 저장했습니다({gw_user}).'


def _sync_mail_from_gw(gw_user, pw):
    """그룹웨어 로그인 정보 → 메일 설정. host/port는 건드리지 않는다. 반환 (ok, 메시지)."""
    global SMTP_USER, SMTP_PASS
    gw_user = str(gw_user or '').strip()
    if not gw_user or not pw:
        return False, '그룹웨어 아이디/비밀번호가 비어 있어 메일 설정에 동기화하지 않았습니다.'
    dom = _mail_domain_guess()
    if not dom:
        return False, '메일 도메인을 알 수 없어 메일 설정에 동기화하지 않았습니다(메일 설정을 먼저 한 번 저장해주세요).'
    mail_user = gw_user if '@' in gw_user else (gw_user + '@' + dom)
    try:
        SMTP_USER, SMTP_PASS = mail_user, pw
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump({'host': SMTP_HOST, 'port': SMTP_PORT,
                       'user': SMTP_USER, 'pass': SMTP_PASS}, f, ensure_ascii=False)
    except Exception as e:
        return False, f'메일 설정 동기화 실패: {e}'
    return True, f'메일 서버 설정도 같이 저장했습니다({mail_user}).'


@app.route('/gw/open-doc', methods=['POST'])
def gw_open_doc():
    """🔗 그룹웨어 결재문서를 **전용 크롬**(사람이 로그인해 둔 곳)에 새 탭으로 열어 준다.

    ⚠️ 주소를 받지 않고 **문서 id/번호**로 우리가 만든다 — 이 통로로 아무 주소나 열리지 않게.
    ⚠️ 읽기 전용 — 로그인을 시도하지 않는다(계정 잠김 방지 규칙 그대로).
    """
    try:
        import gw_bridge
        d = request.get_json(silent=True) or {}
        return jsonify(gw_bridge.open_document(doc_id=d.get('docId'), doc_num=d.get('docNum')))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/login-config', methods=['GET'])
def gw_login_config_get():
    cfg = {}
    try:
        with open(_GW_LOGIN_CFG_PATH, 'r', encoding='utf-8') as f:
            cfg = json.load(f) or {}
    except Exception:
        pass
    if cfg.get('user') and cfg.get('pw_dpapi'):
        return jsonify({'ok': True, 'configured': True, 'source': 'gw', 'user': cfg.get('user', '')})
    # 그룹웨어 전용 설정이 없으면 메일 설정에서 가져다 쓴다(gw_bridge.load_login_config와 같은 규칙).
    mail_user = str(SMTP_USER or '').strip()
    if mail_user and SMTP_PASS:
        return jsonify({'ok': True, 'configured': True, 'source': 'mail',
                        'user': mail_user.split('@')[0],
                        'message': '메일 서버 설정의 계정을 그대로 씁니다.'})
    return jsonify({'ok': True, 'configured': False, 'source': None, 'user': ''})


@app.route('/gw/login-config', methods=['POST'])
def gw_login_config_save():
    body = request.get_json(silent=True) or {}
    user = str(body.get('user') or '').strip()
    pw   = str(body.get('pw') or '')
    if not user or not pw:
        return jsonify({'ok': False, 'message': '아이디와 비밀번호를 모두 입력해주세요.'}), 400
    try:
        enc = _dpapi_encrypt_b64(pw)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500
    finally:
        pw = None
    try:
        with open(_GW_LOGIN_CFG_PATH, 'w', encoding='utf-8') as f:
            json.dump({'user': user, 'pw_dpapi': enc}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return jsonify({'ok': False, 'message': f'설정 저장 실패: {e}'}), 500
    # 📧 메일 서버 설정에도 같이 저장(사용자 요청) — 실패해도 그룹웨어 저장은 유지한다.
    mail_ok, mail_msg = _sync_mail_from_gw(user, (request.get_json(silent=True) or {}).get('pw') or '')
    return jsonify({'ok': True, 'user': user,
                    'message': '그룹웨어 로그인 정보를 저장했습니다. ' + mail_msg,
                    'syncedMail': mail_ok, 'syncMessage': mail_msg})


@app.route('/gw/login-config', methods=['DELETE'])
def gw_login_config_delete():
    try:
        if os.path.exists(_GW_LOGIN_CFG_PATH):
            os.remove(_GW_LOGIN_CFG_PATH)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500
    return jsonify({'ok': True, 'message': '저장된 그룹웨어 로그인 정보를 삭제했습니다.'})


# ══ 🧑‍💼 인사관리(kInsa) 자동 로그인 ═══════════════════════════════════════
#  대상: http://insa.kortek.co.kr  (Apache 2.2.3/CentOS, 서버 렌더 JSP + Bootstrap3)
#
#  🔎 [2026-10-21 실측] 추측하지 않고 실제 응답으로 확인한 것:
#    - 로그인 화면은 `/`, 폼은 `<form action="kInsa" method="post">`
#      → 제출은 **POST /kInsa**, 입력칸은 `userNum`(사번) / `password`
#    - `/kInsa` 는 GET 을 막아 둔다(`Allow: POST`). 세션은 표준 `JSESSIONID` 쿠키
#    - **실패 응답이 특이하다**: HTTP 200 + 194바이트짜리 <script> 하나로,
#      `var message = ...; alert(message); location.href = "index";` 를 돌려준다.
#      성공도 실패도 200이라 **상태코드로는 구분이 안 된다**(→ docs/insa-hr.md).
#
#  🖥 [2026-10-21 수정] 처음엔 여기서 requests 로만 로그인했는데 **화면이 안 열린다**는
#     지적을 받았다. 그룹웨어처럼 사람이 보고 이어서 쓸 수 있어야 하므로, 지금은 같은
#     전용 크롬(CDP 9222)에 탭으로 띄워 로그인한다 — 실제 동작은 gw_bridge.insa_login_once().
#     덕분에 실패 판정도 위 HTML 지문 대신 **로그인 폼이 다시 보이는지**로 한다(더 단순하고 확실).
#
#  ⚠️⚠️ **한 번만 시도하고, 실패하면 재시도하지 않는다.** 그룹웨어·SAP과 같은 이유다 —
#     사내 계정이 잠기면 인사·급여까지 막힌다. 잠김 여부를 우리가 알 수 없으므로
#     "모르면 안 한다"로 간다. 재시도 금지 가드는 프런트(js/36 `_insaEnsureLogin`)에 있고,
#     이 함수는 부르면 그냥 한 번 시도한다(그룹웨어 `login_once()`와 같은 역할 분담).
#
#  비밀번호는 DPAPI로 암호화해 insa_login_config.json(.gitignore)에만 두고,
#  **어떤 응답에도 비밀번호를 돌려주지 않는다**(등록 여부와 아이디만).
_INSA_LOGIN_CFG_PATH = os.path.join(BASE_DIR, 'insa_login_config.json')
INSA_BASE = 'http://insa.kortek.co.kr'


def _insa_cfg():
    try:
        with open(_INSA_LOGIN_CFG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f) or {}
    except Exception:
        return {}


@app.route('/insa/login-config', methods=['GET'])
def insa_login_config_get():
    cfg = _insa_cfg()
    return jsonify({'ok': True,
                    'configured': bool(cfg.get('user') and cfg.get('pw_dpapi')),
                    'user': cfg.get('user', '')})


@app.route('/insa/login-config', methods=['POST'])
def insa_login_config_save():
    body = request.get_json(silent=True) or {}
    user = str(body.get('user') or '').strip()
    pw   = str(body.get('pw') or '')
    if not user or not pw:
        return jsonify({'ok': False, 'message': '아이디와 비밀번호를 모두 입력해주세요.'}), 400
    try:
        enc = _dpapi_encrypt_b64(pw)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500
    finally:
        pw = None
    try:
        with open(_INSA_LOGIN_CFG_PATH, 'w', encoding='utf-8') as f:
            json.dump({'user': user, 'pw_dpapi': enc}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return jsonify({'ok': False, 'message': f'설정 저장 실패: {e}'}), 500
    return jsonify({'ok': True, 'message': '인사관리 로그인 정보를 저장했습니다.', 'user': user})


@app.route('/insa/login-config', methods=['DELETE'])
def insa_login_config_delete():
    try:
        if os.path.exists(_INSA_LOGIN_CFG_PATH):
            os.remove(_INSA_LOGIN_CFG_PATH)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500
    return jsonify({'ok': True, 'message': '저장된 인사관리 로그인 정보를 삭제했습니다.'})


@app.route('/insa/status', methods=['GET'])
def insa_status():
    """로그인 상태. **로그인은 하지 않는다**(재시도 금지 가드는 프런트에 있다).

    [2026-10-21] 처음엔 백엔드가 requests 로만 로그인해서 **화면이 안 열린다**는 지적을
    받았다 — 지금은 그룹웨어와 같은 전용 크롬 탭을 본다(gw_bridge.insa_session_info).
    """
    cfg = _insa_cfg()
    out = {'ok': True, 'configured': bool(cfg.get('user') and cfg.get('pw_dpapi')),
           'user': cfg.get('user', ''), 'loggedIn': False}
    try:
        requests.get(INSA_BASE + '/', timeout=5)
        out['reachable'] = True
    except Exception as e:
        out['reachable'] = False
        out['message'] = f'인사관리 서버에 연결할 수 없습니다: {e}'
        return jsonify(out)
    try:
        import gw_bridge
        if gw_bridge.chrome_alive():          # 크롬이 꺼져 있으면 띄우지 않는다(조회일 뿐이므로)
            out['loggedIn'] = bool(gw_bridge.insa_session_info().get('ok'))
    except Exception:
        pass
    return jsonify(out)


@app.route('/insa/login', methods=['POST'])
def insa_login():
    """저장된 계정으로 **한 번만** 로그인 시도. 실패해도 재시도하지 않고 창을 열어 둔다.

    ⚠️ 재시도 금지 가드는 **프런트**(js/36 `_insaEnsureLogin`)에 있다 — 이 라우트는
       부를 때마다 그냥 한 번 시도한다. 새 경로를 붙일 땐 반드시 그 게이트를 통할 것.
    """
    try:
        import gw_bridge
        return jsonify(gw_bridge.insa_login_once())
    except Exception as e:
        return jsonify({'ok': False, 'result': 'error', 'message': str(e)})


@app.route('/insa/menus', methods=['GET'])
def insa_menus():
    """학습해 둔 인사관리 화면 카탈로그. 네트워크를 쓰지 않는다(파일만 읽음)."""
    try:
        import gw_bridge
        return jsonify({'ok': True, **gw_bridge.insa_menu_catalog()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/insa/learn', methods=['POST'])
def insa_learn():
    """메뉴를 하나씩 눌러 보고 **실제 화면 주소를 관찰해** 카탈로그를 새로 만든다.

    ⚠️ 읽기 전용 — 화면을 띄우기만 하고 어떤 폼도 제출하지 않는다.
       로그인이 안 돼 있으면 하지 않는다(여기서 로그인을 시도하지도 않는다).
    """
    try:
        import gw_bridge
        return jsonify(gw_bridge.insa_learn_menus())
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/insa/screen', methods=['GET'])
def insa_screen():
    """학습된 화면 하나를 열어 글자만 읽어 온다(읽기 전용)."""
    code = (request.args.get('code') or '').strip()
    if not code:
        return jsonify({'ok': False, 'message': 'code(메뉴 코드 또는 이름)를 지정해주세요.'})
    try:
        import gw_bridge
        return jsonify(gw_bridge.insa_read_screen(code))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/insa/annual-plan-status', methods=['GET'])
def insa_annual_plan_status():
    """연차휴가사용계획서 작성 대상 여부만 확인한다(읽기 전용) — **열거나 채우지 않는다.**

    법정 연차 문서라 쓰기는 의도적으로 보류했다(docs/insa-hr.md). 작성이 필요하면
    인사관리 화면에서 직접 하도록 안내만 한다.
    """
    try:
        import gw_bridge
        return jsonify(gw_bridge.insa_annual_plan_status())
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/insa/workplan-form', methods=['GET'])
def insa_workplan_form():
    """근무계획 수정 신청서에 **지금 뭐가 들어 있는지** 읽는다(읽기 전용).

    AI 가 "행 하나 더 추가해줘" 같은 요청을 받으면 **지금 행을 먼저 보고** 전체 목록을
    다시 만들어야 한다(fill 은 days 를 "최종 상태"로 받는다). 그 눈이 이 라우트다.
    """
    try:
        import insa_write
        if not insa_write._regform_tab():
            return jsonify({'ok': True, 'open': False, 'rowCount': 0, 'rows': [],
                            'message': '신청서 창이 열려 있지 않습니다(채우기를 하면 열립니다).'})
        return jsonify(dict({'ok': True, 'open': True}, **(insa_write.form_state() or {})))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/insa/overtime-form', methods=['GET'])
def insa_overtime_form():
    """연장근무 신청서에 **지금 뭐가 들어 있는지** 읽는다(읽기 전용).

    근무계획 수정 신청서의 `/insa/workplan-form`과 같은 용도 — AI 가 "행 하나 더
    추가해줘" 같은 요청을 받으면 **지금 행을 먼저 보고** 전체 목록을 다시 만들어야 한다
    (fill 은 days 를 "최종 상태"로 받는다).
    """
    try:
        import insa_write
        if not insa_write._regform_tab(insa_write.OW_REGFORM_PATH):
            return jsonify({'ok': True, 'open': False, 'rowCount': 0, 'rows': [],
                            'message': '신청서 창이 열려 있지 않습니다(채우기를 하면 열립니다).'})
        return jsonify(dict({'ok': True, 'open': True},
                             **(insa_write.form_state(path=insa_write.OW_REGFORM_PATH) or {})))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/chrome-restart', methods=['POST'])
def gw_chrome_restart():
    """전용 크롬을 닫았다 다시 띄운다 — **http 사이트 차단(HTTPS 자동승격) 해제용.**

    인사관리(insa.kortek.co.kr)는 http 전용인데 요즘 크롬은 https 로 올려 시도하고
    실패하면 차단 화면을 띄운다. 그 탭엔 DOM 이 없어 로그인 폼을 못 찾는다.
    launch_chrome 이 플래그·프로필 설정을 끄고 다시 띄우므로 재시작하면 풀린다.
    프로필이 남으므로 로그인 쿠키는 유지된다.
    """
    try:
        import gw_bridge
        return jsonify(gw_bridge.chrome_restart())
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/insa/fill-workplan', methods=['POST'])
def insa_fill_workplan():
    """✍️ 근무계획 수정 신청서의 **칸만 채운다. [등록]은 누르지 않는다.**

    쓰기 경로라 조회(insa_read_screen)와 **모듈을 분리**해 insa_write 로만 간다
    — 조회 코드가 실수로 제출을 부를 수 없게 하기 위해서다(docs/qa-tool-router.md).
    등록은 사람이 화면을 보고 직접 누른다. 상세·함정은 docs/insa-hr.md.
    """
    d = request.get_json(silent=True) or {}
    days = d.get('days')
    if isinstance(days, str):                 # AI 가 JSON 문자열로 줄 때가 있다
        try:
            days = json.loads(days)
        except Exception:
            days = None
    if not isinstance(days, list) or not days:
        days = None
    if not days and not (d.get('date') or d.get('start') or d.get('end')):
        return jsonify({'ok': False, 'message': '근무일자·시간 중 하나는 지정해주세요(여러 날이면 days).'})
    try:
        import insa_write
        opened = insa_write.open_regform()
        if not opened.get('ok'):
            return jsonify(opened)
        out = insa_write.fill_workplan_edit(
            days=days,
            date=d.get('date'), start=d.get('start'), end=d.get('end'),
            subject=d.get('subject'), content=d.get('content'), remark=d.get('remark'),
            lunch=d.get('lunch'), dinner=d.get('dinner'))
        out['openedWindow'] = bool(opened.get('opened'))
        return jsonify(out)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/insa/fill-overtime', methods=['POST'])
def insa_fill_overtime():
    """✍️ 연장근무 신청서의 **칸만 채운다. [등록]은 누르지 않는다.**

    근무계획 수정 신청서(`/insa/fill-workplan`)와 같은 원칙 — 조회와 모듈 분리(insa_write),
    등록은 사람이 직접 누른다. 이 화면엔 제목/내용 칸이 없다(서버가 제목을 고정해서 보냄) —
    사유는 `days[].remark`(행마다)로 넣는다. 상세·함정은 docs/insa-hr.md.
    """
    d = request.get_json(silent=True) or {}
    days = d.get('days')
    if isinstance(days, str):                 # AI 가 JSON 문자열로 줄 때가 있다
        try:
            days = json.loads(days)
        except Exception:
            days = None
    if not isinstance(days, list) or not days:
        days = None
    if not days and not (d.get('date') or d.get('start') or d.get('end')):
        return jsonify({'ok': False, 'message': '근무일자·시간 중 하나는 지정해주세요(여러 날이면 days).'})
    try:
        import insa_write
        opened = insa_write.open_ow_regform()
        if not opened.get('ok'):
            return jsonify(opened)
        out = insa_write.fill_overtime_request(
            days=days,
            date=d.get('date'), start=d.get('start'), end=d.get('end'),
            remark=d.get('remark'), lunch=d.get('lunch'), dinner=d.get('dinner'))
        out['openedWindow'] = bool(opened.get('opened'))
        return jsonify(out)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/login', methods=['POST'])
def gw_login():
    """저장된 계정으로 **한 번만** 로그인 시도. 실패하면 재시도하지 않고 사람에게 넘긴다."""
    try:
        import gw_bridge
        return jsonify(gw_bridge.login_once())
    except Exception as e:
        return jsonify({'ok': False, 'result': 'error', 'message': str(e)})


@app.route('/gw/approval/forms', methods=['GET'])
def gw_approval_forms():
    try:
        import gw_bridge
        return jsonify({'ok': True, 'forms': gw_bridge.approval_forms()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/approval/search', methods=['GET'])
def gw_approval_search():
    """전자결재 문서 키워드 검색.

    ⚠️ `onlyApprovalForm` 기본값이 1이라 **제목에 승인원 표시가 없는 문서는 전부 걸러진다.**
    (2026-10-21 제보: 문서번호로 찾았는데 0건 — 승인원이 아니어서 걸러진 것이었다)
    일반 검색은 `onlyApprovalForm=0`. 승인원 Revision History 판단용일 때만 1."""
    try:
        import gw_bridge
        kw = (request.args.get('keyword') or '').strip()
        if not kw:
            return jsonify({'ok': False, 'message': '검색어가 필요합니다.'}), 400
        only = (request.args.get('onlyApprovalForm') or '1') != '0'
        r = gw_bridge.search_approval_docs(kw, only_approval_form=only)
        return jsonify({'ok': True, 'keyword': kw, 'total': r['total'],
                        'count': len(r['items']), 'items': r['items']})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/approval/read', methods=['GET'])
def gw_approval_read():
    """기존 전자결재 문서를 읽는다(읽기 전용). `docNum` 또는 `docId`.

    복사 기안의 재료 — 제목·입력칸·체크·결재선·첨부목록을 돌려준다."""
    try:
        import gw_bridge
        num = (request.args.get('docNum') or '').strip()
        did = (request.args.get('docId') or '').strip()
        if not num and not did:
            return jsonify({'ok': False, 'message': 'docNum 또는 docId 가 필요합니다.'}), 400
        # 본문 HTML 은 수만 자라 기본은 안 준다 — 복사처럼 정말 쓸 때만 withHtml=1
        r = gw_bridge.approval_read(doc_num=num or None, doc_id=did or None,
                                    with_html=(request.args.get('withHtml') in ('1', 'true', 'yes')))
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/approval/draft-fill', methods=['POST'])
def gw_approval_draft_fill():
    """이미 열려 있는 작성 화면을 **다시 채운다**(실행 루프용). 원본 문서를 다시 읽지 않는다.

    ⚠️ `/gw/approval/copy` 는 호출할 때마다 원본 문서로 이동해 읽으므로, 작성 화면을
    떠나 버린다. 루프가 값을 고쳐 다시 넣을 때는 이 라우트를 쓴다.
    `reuseScreen`(기본 true)이면 작성 화면으로 이동하지 않아 문서 id 가 더 발급되지 않는다.
    `dryRun`(기본 true)이면 채우기만 하고 임시저장하지 않는다. 상신은 어느 경우에도 안 한다."""
    try:
        import gw_bridge
        d = request.get_json(silent=True) or {}
        form_id, dept_id = d.get('formId'), d.get('deptId')
        if not form_id or not dept_id:
            return jsonify({'ok': False, 'message': 'formId / deptId 가 필요합니다.'}), 400
        r = gw_bridge.approval_draft(
            form_id=form_id, dept_id=dept_id,
            subject=d.get('subject'), fields=d.get('fields') or {},
            dry_run=(d.get('dryRun', True) is not False),
            checks=d.get('checks') or None,
            body_html=d.get('bodyHtml') or None,
            reuse_screen=(d.get('reuseScreen', True) is not False),
            # 📝 본문이 표인 양식 — `bodyEdits`({라벨: 새 값})가 있으면 그 칸의 값만 바꾼다.
            #    ⚠️ `bodyHtml` 이 없으면 아무 일도 안 한다(이미 화면에 들어간 본문은 그대로 남는다).
            body_edits=d.get('bodyEdits') or None,
            body_pair_count=d.get('bodyPairCount') or 0)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/approval/copy', methods=['POST'])
def gw_approval_copy():
    """기존 문서를 **같은 양식의 새 기안에 채워 임시저장**한다. 상신은 하지 않는다.

    ⚠️ 쓰기다 — 앱에서 사람이 1회 확인한 뒤에만 부른다(js/41).
    `dryRun`(기본 true)이면 칸만 채우고 저장하지 않는다.
    첨부는 가져오지 않는다(사용자 결정 2026-10-21) — 몇 건인지만 알려준다."""
    try:
        import gw_bridge
        d = request.get_json(silent=True) or {}
        num = str(d.get('docNum') or '').strip()
        did = str(d.get('docId') or '').strip()
        if not num and not did:
            return jsonify({'ok': False, 'message': 'docNum 또는 docId 가 필요합니다.'}), 400
        r = gw_bridge.approval_copy(
            doc_num=num or None, doc_id=did or None,
            subject=d.get('subject'), fields=d.get('fields') or None,
            dry_run=(d.get('dryRun', True) is not False),
            copy_body=(d.get('copyBody', True) is not False),
            # 📝 본문 표 칸 바꿔치기 — 기안서[시제품 제작의뢰서]처럼 값이 **fields 가 아니라
            #    본문 표** 안에 있는 양식용(실측: fields 5개 / bodyFields 30개).
            body_edits=d.get('bodyEdits') or None)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/approval/parse-cover', methods=['POST'])
def gw_approval_parse_cover():
    """협력사가 채워 보낸 승인원 표지(docx)에서 기안에 필요한 값을 뽑는다.
    SAP에 없는 공급업체 상호/주소/전화가 여기 들어 있다."""
    try:
        import base64
        import gw_bridge
        b = request.get_json(silent=True) or {}
        raw = b.get('dataBase64') or ''
        if not raw:
            return jsonify({'ok': False, 'message': '파일 내용(dataBase64)이 없습니다.'}), 400
        data = base64.b64decode(raw)
        r = gw_bridge.parse_approval_cover(data)
        return jsonify({'ok': True, 'fields': r['fields'], 'lineCount': r['lineCount']})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'표지 분석 실패: {e}'})


@app.route('/gw/approval/draft', methods=['POST'])
def gw_approval_draft():
    """결재 양식을 채워 **임시저장**한다. 결재요청(상신)은 하지 않는다 —
    상신은 사람이 그룹웨어에서 내용을 확인하고 직접 누른다."""
    try:
        import gw_bridge
        b = request.get_json(silent=True) or {}
        form_id = b.get('formId')
        dept_id = b.get('deptId')
        subject = (b.get('subject') or '').strip()
        fields = b.get('fields') or {}
        if not form_id or not dept_id:
            return jsonify({'ok': False, 'message': '양식(formId)과 부서(deptId)가 필요합니다.'}), 400
        if not subject:
            return jsonify({'ok': False, 'message': '제목은 필수입니다.'}), 400
        r = gw_bridge.approval_draft(form_id, dept_id, subject, fields,
                                     dry_run=bool(b.get('dryRun')), checks=b.get('checks') or [])
        if isinstance(r, dict) and r.get('docId'):
            r['docUrl'] = f'https://gw.kortek.co.kr/app/approval/document/{r["docId"]}'
        return jsonify(r if isinstance(r, dict) else {'ok': False, 'message': str(r)})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/calendars', methods=['GET'])
def gw_calendars():
    try:
        import gw_bridge
        return jsonify({'ok': True, 'calendars': gw_bridge.calendars()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/events', methods=['GET'])
def gw_events():
    """기간 내 그룹웨어 일정. 기본은 지난 7일 ~ 앞으로 60일."""
    try:
        import gw_bridge
        today = datetime.now(KST).date()
        d_from = (request.args.get('from') or '').strip() or str(today - timedelta(days=7))
        d_to   = (request.args.get('to') or '').strip() or str(today + timedelta(days=60))
        ids_raw = (request.args.get('calendarIds') or '').strip()
        ids = [int(x) for x in ids_raw.split(',') if x.strip().isdigit()] if ids_raw else None
        evs = gw_bridge.events(d_from, d_to, ids)
        return jsonify({'ok': True, 'from': d_from, 'to': d_to, 'count': len(evs), 'events': evs})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/calendar/event', methods=['POST'])
def gw_calendar_event_create():
    """캘린더 일정 등록 (쓰기).

    ⚠️ 앱은 **사람이 확인 카드를 1회 누른 뒤에만** 이 라우트를 부른다.
       AI 자율 루프에서는 호출되지 않는다(읽기 전용 루프가 mode:'write'를 거부).
    """
    try:
        import gw_bridge
        b = request.get_json(silent=True) or {}
        title = (b.get('title') or '').strip()
        date = (b.get('date') or '').strip()
        start = (b.get('start') or '').strip()
        end = (b.get('end') or '').strip()
        if not title or not date:
            return jsonify({'ok': False, 'message': '제목과 날짜는 필수입니다.'}), 400
        all_day = not start
        if all_day:
            start_v, end_v = date, date
        else:
            if not end:
                return jsonify({'ok': False, 'message': '시작 시간을 주면 종료 시간도 필요합니다.'}), 400
            start_v, end_v = f'{date} {start}', f'{date} {end}'
        r = gw_bridge.calendar_create_event(
            title, start_v, end_v, calendar_id=b.get('calendarId'),
            location=(b.get('location') or '').strip(), all_day=all_day)
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/calendar/event/delete', methods=['POST'])
def gw_calendar_event_delete():
    """캘린더 일정 삭제 (쓰기). 되돌릴 수 없다 — 사람 확인 1회 후에만 호출된다."""
    try:
        import gw_bridge
        b = request.get_json(silent=True) or {}
        cal_id, event_id = b.get('calendarId'), b.get('eventId')
        if not cal_id or not event_id:
            return jsonify({'ok': False, 'message': 'calendarId와 eventId가 필요합니다.'}), 400
        return jsonify(gw_bridge.calendar_delete_event(cal_id, event_id))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


# ── 게시판 (읽기 전용) ───────────────────────────────────────────────
# 엔드포인트는 docs/groupware.md "게시판" 절. 글 작성·삭제 라우트는 **만들지 않는다.**

@app.route('/gw/boards', methods=['GET'])
def gw_boards():
    """볼 수 있는 게시판 목록(전사 + 부서). 게시판 지정 조회용."""
    try:
        import gw_bridge
        return jsonify({'ok': True, 'boards': gw_bridge.boards()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/board/recent', methods=['GET'])
def gw_board_recent():
    """기간 내 게시물 목록.

    `from`/`to`('YYYY-MM-DD')로 기간을 직접 주는 게 정확하다 — "지난주"처럼 **달력 주**로
    끊어야 하는 요청을 `days` 롤링으로 바꾸면 이번 주 글이 섞인다. `days`는 폴백.
    `limit`(기본 80), `boardId`(선택)."""
    try:
        import gw_bridge
        days = request.args.get('days', '7')
        limit = request.args.get('limit', '80')
        bid = (request.args.get('boardId') or '').strip()
        r = gw_bridge.board_recent(days=int(days) if str(days).isdigit() else 7,
                                   limit=int(limit) if str(limit).isdigit() else 80,
                                   board_id=int(bid) if bid.isdigit() else None,
                                   date_from=(request.args.get('from') or '').strip() or None,
                                   date_to=(request.args.get('to') or '').strip() or None)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


# ── 모듈 읽기 라우트 (문서관리/예약/커뮤니티/설문/자료실/전자결재 문서함) ──
# 전부 조회 전용. 등록·예약·삭제 라우트는 **만들지 않는다**(사람 확인 경로가 따로 필요).

@app.route('/gw/docs', methods=['GET'])
def gw_docs():
    """문서관리 문서 목록. `kind`=approvewaiting|registwaiting|latestread|favorite."""
    try:
        import gw_bridge
        limit = request.args.get('limit', '20')
        r = gw_bridge.docs_waiting(kind=(request.args.get('kind') or 'latestread').strip(),
                                   limit=int(limit) if str(limit).isdigit() else 20)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/assets', methods=['GET'])
def gw_assets():
    """예약 가능한 자원(회의실·차량 등) 목록."""
    try:
        import gw_bridge
        return jsonify({'ok': True, 'assets': gw_bridge.assets()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/asset/reservations', methods=['GET'])
def gw_asset_reservations():
    """해당 날짜 예약 현황. `date`=YYYY-MM-DD(기본 오늘), `assetId`(선택)."""
    try:
        import gw_bridge
        aid = (request.args.get('assetId') or '').strip()
        r = gw_bridge.asset_reservations(asset_id=int(aid) if aid.isdigit() else None,
                                         date=(request.args.get('date') or '').strip() or None)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/community/feed', methods=['GET'])
def gw_community_feed():
    """내가 가입한 커뮤니티 최신 글."""
    try:
        import gw_bridge
        limit = request.args.get('limit', '20')
        r = gw_bridge.community_feed(limit=int(limit) if str(limit).isdigit() else 20)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/communities', methods=['GET'])
def gw_communities():
    """커뮤니티 목록(멤버수 순)."""
    try:
        import gw_bridge
        limit = request.args.get('limit', '30')
        r = gw_bridge.community_list(limit=int(limit) if str(limit).isdigit() else 30)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/contacts', methods=['GET'])
def gw_contacts():
    """사내 주소록 검색. `keyword` 를 비우면 전체(이름 가나다순)."""
    try:
        import gw_bridge
        limit = request.args.get('limit', '20')
        page = request.args.get('page', '0')
        r = gw_bridge.contacts_search(keyword=request.args.get('keyword') or '',
                                      limit=int(limit) if str(limit).isdigit() else 20,
                                      page=int(page) if str(page).isdigit() else 0)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/notifications', methods=['GET'])
def gw_notifications():
    """그룹웨어 알림. `category`=all|unread|approval|bbs|… (읽음 처리 안 함)."""
    try:
        import gw_bridge
        limit = request.args.get('limit', '15')
        r = gw_bridge.notifications(category=(request.args.get('category') or 'all').strip(),
                                    limit=int(limit) if str(limit).isdigit() else 15)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/notes', methods=['GET'])
def gw_notes():
    """쪽지 목록(읽기 전용)."""
    try:
        import gw_bridge
        limit = request.args.get('limit', '10')
        r = gw_bridge.notes(limit=int(limit) if str(limit).isdigit() else 10)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/surveys', methods=['GET'])
def gw_surveys():
    """설문 목록. `kind`=todo(응답 대기)|latest."""
    try:
        import gw_bridge
        limit = request.args.get('limit', '20')
        r = gw_bridge.surveys(kind=(request.args.get('kind') or 'latest').strip(),
                              limit=int(limit) if str(limit).isdigit() else 20)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/webfolder', methods=['GET'])
def gw_webfolder():
    """자료실 폴더/파일 목록. `path`(기본 /), `scope`=public|user."""
    try:
        import gw_bridge
        limit = request.args.get('limit', '30')
        r = gw_bridge.webfolder_list(path=(request.args.get('path') or '/').strip() or '/',
                                     limit=int(limit) if str(limit).isdigit() else 30,
                                     scope=(request.args.get('scope') or 'public').strip())
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/approval/doclist', methods=['GET'])
def gw_approval_doclist():
    """전자결재 문서함 목록.

    `box`=draft|tempsave|approve|viewer|all, `searchtype`/`keyword`/`duration`/`limit`.
    ⚠️ searchtype을 엉뚱하게 주면 **조용히 0건**이 온다(제목에 없는 말을 title로 찾는 등).
    ⚠️ draft 는 **내가 기안한 것만** 본다 — 남의 문서를 문서번호로 찾을 땐 box=all.
    """
    try:
        import gw_bridge
        limit = request.args.get('limit', '20')
        r = gw_bridge.approval_doclist(
            box=(request.args.get('box') or 'draft').strip(),
            limit=int(limit) if str(limit).isdigit() else 20,
            searchtype=(request.args.get('searchtype') or '').strip() or None,
            keyword=(request.args.get('keyword') or '').strip() or None,
            duration=(request.args.get('duration') or 'all').strip())
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/asset/items', methods=['GET'])
def gw_asset_items():
    """자원의 세부 항목(회의실 각 방/차량 각 대). 예약에는 itemId가 필요하다."""
    try:
        import gw_bridge
        aid = (request.args.get('assetId') or '').strip()
        if not aid.isdigit():
            return jsonify({'ok': False, 'message': 'assetId가 필요합니다.'}), 400
        return jsonify({'ok': True, 'items': gw_bridge.asset_items(int(aid))})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/asset/reserve', methods=['POST'])
def gw_asset_reserve():
    """회의실·차량 예약 생성 (쓰기).

    ⚠️ 앱은 **사람이 확인 카드를 1회 누른 뒤에만** 이 라우트를 부른다.
       AI 자율 루프에서는 호출되지 않는다(읽기 전용 루프가 mode:'write'를 거부).
    """
    try:
        import gw_bridge
        b = request.get_json(silent=True) or {}
        r = gw_bridge.asset_reserve(
            asset_id=b.get('assetId'), item_id=b.get('itemId'),
            date=(b.get('date') or '').strip(),
            start=(b.get('start') or '').strip(), end=(b.get('end') or '').strip(),
            purpose=(b.get('purpose') or '').strip(),
            attendee=(b.get('attendee') or '').strip(),
            allday=bool(b.get('allday')))
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/asset/cancel', methods=['POST'])
def gw_asset_cancel():
    """예약 취소 (쓰기). 되돌리기 경로 — 잘못 만든 예약을 바로 지울 수 있게 둔다."""
    try:
        import gw_bridge
        b = request.get_json(silent=True) or {}
        ids = b.get('ids') or ([b.get('id')] if b.get('id') else [])
        return jsonify(gw_bridge.asset_cancel(ids))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/mail/recent', methods=['GET'])
def gw_mail_recent():
    """기간 내 그룹웨어 메일 목록(읽기 전용).

    ⚠️ **메일을 열지 않는다** — 상세 조회는 서버에서 '읽음'으로 바꿔 안읽음 배지를 줄인다.
       목록의 `preview`(본문 발췌)로 요약한다.
    `from`/`to`('YYYY-MM-DD'), `folder`(Inbox/Sent/Drafts/Trash 또는 한국어),
    `unread`(1이면 안읽음만), `keyword`(검색), `limit`(기본 80).
    """
    try:
        import gw_bridge
        limit = request.args.get('limit', '80')
        r = gw_bridge.mail_recent(
            date_from=(request.args.get('from') or '').strip() or None,
            date_to=(request.args.get('to') or '').strip() or None,
            folder=(request.args.get('folder') or 'Inbox').strip() or 'Inbox',
            unread_only=(request.args.get('unread') or '') in ('1', 'true', 'yes'),
            limit=int(limit) if str(limit).isdigit() else 80,
            keyword=(request.args.get('keyword') or '').strip() or None)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/mail/send', methods=['POST'])
def gw_mail_send_route():
    """그룹웨어 메일 발송 (쓰기). 되돌릴 수 없다 — 사람 확인 1회 후에만 호출된다.

    SMTP/POP3 설정과 무관하다 — 그룹웨어 로그인 세션으로 그룹웨어 내부 API를 직접 부른다.
    """
    try:
        import gw_bridge
        b = request.get_json(silent=True) or {}
        to = (b.get('to') or '').strip()
        subject = (b.get('subject') or '').strip()
        body = b.get('body') or ''
        if not to or not subject:
            return jsonify({'ok': False, 'message': '받는사람과 제목은 필수입니다.'}), 400
        r = gw_bridge.mail_send(to, subject, body,
                                 cc=(b.get('cc') or '').strip(), bcc=(b.get('bcc') or '').strip())
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/works/apps', methods=['GET'])
def gw_works_apps():
    """내가 쓸 수 있는 Works 앱(미니 폼) 목록."""
    try:
        import gw_bridge
        return jsonify({'ok': True, 'apps': gw_bridge.works_apps()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/works/list', methods=['GET'])
def gw_works_list():
    """Works 앱 한 개의 최근 등록 목록. appletId는 gw_works_apps로 먼저 찾는다."""
    try:
        import gw_bridge
        aid = (request.args.get('appletId') or '').strip()
        if not aid.isdigit():
            return jsonify({'ok': False, 'message': 'appletId가 필요합니다.'}), 400
        limit = request.args.get('limit', '20')
        r = gw_bridge.works_list(int(aid), limit=int(limit) if str(limit).isdigit() else 20,
                                  keyword=(request.args.get('keyword') or '').strip() or None)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/report/folders', methods=['GET'])
def gw_report_folders():
    """부서별 보고 시리즈(정기/비정기) 목록."""
    try:
        import gw_bridge
        return jsonify({'ok': True, 'folders': gw_bridge.report_folders()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/report/list', methods=['GET'])
def gw_report_list():
    """최근 제출된 보고 목록. folderId를 모르면 gw_report_folders로 먼저 찾는다."""
    try:
        import gw_bridge
        fid = (request.args.get('folderId') or '').strip()
        limit = request.args.get('limit', '20')
        r = gw_bridge.report_list(folder_id=int(fid) if fid.isdigit() else None,
                                   limit=int(limit) if str(limit).isdigit() else 20)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/report/detail', methods=['GET'])
def gw_report_detail():
    """보고 1건 본문. id 필수."""
    try:
        import gw_bridge
        rid = (request.args.get('id') or '').strip()
        if not rid.isdigit():
            return jsonify({'ok': False, 'message': 'id가 필요합니다.'}), 400
        r = gw_bridge.report_detail(int(rid))
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/todo/boards', methods=['GET'])
def gw_todo_boards():
    """ToDO+ 칸반 보드 목록."""
    try:
        import gw_bridge
        return jsonify({'ok': True, 'boards': gw_bridge.todo_boards()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/todo/items', methods=['GET'])
def gw_todo_items():
    """ToDO+ 보드 1개의 카드 목록. boardId는 gw_todo_boards로 먼저 찾는다."""
    try:
        import gw_bridge
        bid = (request.args.get('boardId') or '').strip()
        if not bid.isdigit():
            return jsonify({'ok': False, 'message': 'boardId가 필요합니다.'}), 400
        limit = request.args.get('limit', '30')
        r = gw_bridge.todo_items(int(bid), keyword=(request.args.get('keyword') or '').strip() or None,
                                  limit=int(limit) if str(limit).isdigit() else 30)
        r['ok'] = True
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/board/post', methods=['GET'])
def gw_board_post():
    """게시물 1건 본문(평문). `boardId`·`postId` 필수."""
    try:
        import gw_bridge
        bid = (request.args.get('boardId') or '').strip()
        pid = (request.args.get('postId') or '').strip()
        if not bid.isdigit() or not pid.isdigit():
            return jsonify({'ok': False, 'message': 'boardId와 postId가 필요합니다.'}), 400
        rec = gw_bridge.board_post(int(bid), int(pid))
        rec['ok'] = True
        return jsonify(rec)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/board/write', methods=['POST'])
def gw_board_write_route():
    """게시판 글 등록 (쓰기). **전사/부서에 즉시 공개된다** — 사람 확인 1회 후에만 호출된다."""
    try:
        import gw_bridge
        b = request.get_json(silent=True) or {}
        board_id = b.get('boardId')
        content = b.get('body') or b.get('content') or ''
        if not board_id or not str(content).strip():
            return jsonify({'ok': False, 'message': 'boardId와 본문이 필요합니다.'}), 400
        r = gw_bridge.board_write(board_id, content)
        return jsonify(r)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/gw/board/delete', methods=['POST'])
def gw_board_delete_route():
    """게시판 글 삭제 (쓰기). 되돌릴 수 없다 — 사람 확인 1회 후에만 호출된다."""
    try:
        import gw_bridge
        b = request.get_json(silent=True) or {}
        board_id, post_id = b.get('boardId'), b.get('postId')
        if not board_id or not post_id:
            return jsonify({'ok': False, 'message': 'boardId와 postId가 필요합니다.'}), 400
        return jsonify(gw_bridge.board_delete_post(board_id, post_id))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/open-folder', methods=['POST'])
def open_folder():
    data = request.get_json(silent=True) or {}
    path = data.get('path', '')
    if not path:
        return jsonify({'ok': False, 'error': '경로가 없습니다.'}), 400
    try:
        if os.path.isfile(path):
            subprocess.Popen(['explorer', '/select,', path])
        else:
            folder = path if os.path.isdir(path) else os.path.dirname(path)
            os.startfile(folder)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/po-sap-prepare', methods=['POST'])
def po_sap_prepare():
    # 🛒 [2026-09-15 신규] "구매오더 요청" 2단계 — /po-build-excel로 만든 엑셀을 ZMMR060에
    #    업로드해 협력사(사업자등록번호로 검색)/세금코드/단가까지 채우고 저장 직전에
    #    멈춘다(사용자와 합의한 "저장 직전 확인 후 정지" 설계 — CLAUDE.md "🛒 구매오더
    #    요청" 절 참고). 실제 저장은 /po-sap-confirm-save가 사람 확인 후 별도로 호출한다.
    data = request.get_json(silent=True) or {}
    excel_path = (data.get('excelPath') or '').strip()
    biz_reg_no = (data.get('bizRegNo') or '').strip()
    items = data.get('items') or []
    plant = (data.get('plant') or '1000').strip()
    currency = (data.get('currency') or 'KRW').strip() or 'KRW'
    if not excel_path or not biz_reg_no or not items:
        return jsonify({'ok': False, 'error': 'excelPath/bizRegNo/items가 모두 필요합니다.'}), 400
    timeout = min(300, 40 + 10 * len(items))  # 20품목=240초(4분) — 이전 120초 캡이 20품목에서 초과됨
    data_out, status = _run_sap_bridge(
        ['prepare_po_from_excel', excel_path, biz_reg_no, json.dumps(items, ensure_ascii=False), plant, currency],
        timeout, 'SAP 구매오더 준비')
    return jsonify(data_out), status


@app.route('/po-sap-simulate-indat', methods=['POST'])
def po_sap_simulate_indat():
    # 🧪 [2026-09-30 신규] 입고일자(INDAT) modifyCell 방식 시뮬레이션 —
    #    ZMM062 그리드에서 행 0 INDAT를 읽어 나머지 행에 modifyCell로 쓸 수 있는지 검증만 한다.
    #    전제: ZMM062가 열려 있고 행 0 INDAT가 이미 F4로 채워진 상태여야 함.
    data = request.get_json(silent=True) or {}
    row_count = int(data.get('rowCount') or 2)
    data_out, status = _run_sap_bridge(
        ['simulate_indat_copy', str(row_count)],
        30, 'SAP 입고일자 복사 시뮬레이션')
    return jsonify(data_out), status


@app.route('/po-sap-simulate-copy', methods=['POST'])
def po_sap_simulate_copy():
    # 🧪 [2026-09-30 신규] 협력사(LIFNR) Ctrl+C/V 방식 시뮬레이션 —
    #    현재 SAP GUI에 열려있는 ZMMR060 그리드에서 행 0의 LIFNR을 읽어
    #    나머지 행에 modifyCell로 쓸 수 있는지 검증만 한다(저장 하지 않음).
    #    결과: {'ok', 'lifnr_row0', 'rows_written', 'rows_failed', 'detail'}
    data = request.get_json(silent=True) or {}
    row_count = int(data.get('rowCount') or 2)  # 테스트할 행 수 (기본 2)
    data_out, status = _run_sap_bridge(
        ['simulate_vendor_copy', str(row_count)],
        30, 'SAP 협력사 복사 시뮬레이션')
    return jsonify(data_out), status


@app.route('/po-sap-confirm-save', methods=['POST'])
def po_sap_confirm_save():
    # 🛒 [2026-09-15 신규] "구매오더 요청" 3단계 — 사람이 /po-sap-prepare 결과를 채팅에서
    #    확인하고 "저장해줘"라고 답한 뒤에만 호출된다. 실제 저장(구매오더 확정) + 오더번호
    #    확보 + ZMM018 발주서 PDF 출력까지 진행한다.
    data = request.get_json(silent=True) or {}
    purchasing_org = (data.get('purchasingOrg') or '9000').strip()
    plant = (data.get('plant') or '1000').strip()
    currency = (data.get('currency') or 'KRW').strip().upper() or 'KRW'
    if currency not in ('KRW', 'USD', 'EUR', 'JPY', 'CNY'):
        currency = 'KRW'
    # USD 등 KRW 외 통화는 ME22N 통화 변경 스텝이 추가되므로 타임아웃 60→90초
    timeout = 60 if currency == 'KRW' else 90
    data_out, status = _run_sap_bridge(['confirm_save_po', purchasing_org, plant, currency], timeout, 'SAP 구매오더 저장')
    return jsonify(data_out), status


@app.route('/po-print-via-zmm018', methods=['POST'])
def po_print_via_zmm018():
    # 🛒 [2026-09-15 신규] 복구용 — 구매오더가 이미 저장됐는데(예: /po-sap-confirm-save가
    #    저장은 성공했지만 ZMM018 출력 단계에서만 실패한 경우, 또는 사람이 SAP에서 직접
    #    저장한 경우) 오더번호를 알고 있을 때 발주서 PDF 출력만 다시 시도한다. 저장(SAVE)이
    #    전혀 없는 순수 조회/출력 동작.
    data = request.get_json(silent=True) or {}
    po_number = (data.get('poNumber') or '').strip()
    purchasing_org = (data.get('purchasingOrg') or '9000').strip()
    plant = (data.get('plant') or '1000').strip()
    currency = (data.get('currency') or 'KRW').strip().upper() or 'KRW'
    if currency not in ('KRW', 'USD', 'EUR', 'JPY', 'CNY'):
        currency = 'KRW'
    if not po_number:
        return jsonify({'ok': False, 'error': 'poNumber가 필요합니다.'}), 400
    timeout = 60 if currency == 'KRW' else 90
    data_out, status = _run_sap_bridge(['print_po_via_zmm018', po_number, purchasing_org, plant, currency], timeout, 'SAP 발주서 PDF 출력')
    return jsonify(data_out), status


@app.route('/po-goods-receipt', methods=['POST'])
def po_goods_receipt():
    # 📦 [2026-09-22 신규, 사용자 요청] 발주서 출력 뒤 이어지는 "자재 입고 처리"(ZMM062) —
    #    AI 문답에서 사람이 "입고 처리 할게요"라고 명시적으로 확인한 뒤에만 호출된다. 실제
    #    컨트롤 조작은 sap_bridge_32.py의 post_goods_receipt()에 있다(사용자가 준 SAP GUI
    #    "기록 및 재생" 매크로 기반, 실환경 미검증 — 실제 SAP 전기이므로 처음 테스트는
    #    되돌리기 쉬운/확인 가능한 구매오더로 해볼 것을 권장).
    data = request.get_json(silent=True) or {}
    ebeln = (data.get('ebeln') or '').strip()
    if not ebeln:
        return jsonify({'ok': False, 'error': 'ebeln(구매오더 번호)이 필요합니다.'}), 400
    dump_only = bool(data.get('dump_only'))
    args = ['post_goods_receipt', ebeln, '--dump-only'] if dump_only else ['post_goods_receipt', ebeln]
    data_out, status = _run_sap_bridge(args, 60, 'SAP 자재 입고 처리')
    return jsonify(data_out), status


@app.route('/po-goods-receipt-status', methods=['POST'])
def po_goods_receipt_status():
    # 📦🔍 [2026-10-28 신규, 사용자 요청] 입고 처리(ZMM062)는 "선택 사항"이 기본 미완료라서
    #    이미 처리된 오더를 조회하면 그리드 자체가 안 뜬다("이미 처리됐는데 안 보이는" 원인) —
    #    완료/전체를 선택해 조회하는 읽기 전용 조회. 전기(POSTING) 없음.
    #    sap_bridge_32.py의 check_goods_receipt_status() 참고.
    data = request.get_json(silent=True) or {}
    ebeln = (data.get('ebeln') or '').strip()
    if not ebeln:
        return jsonify({'ok': False, 'error': 'ebeln(구매오더 번호)이 필요합니다.'}), 400
    mode = (data.get('mode') or '전체').strip()
    data_out, status = _run_sap_bridge(['check_goods_receipt_status', ebeln, mode], 40, 'SAP 입고 상태 조회')
    return jsonify(data_out), status


@app.route('/po-goods-receipt-by-recipient', methods=['GET', 'POST'])
def po_goods_receipt_by_recipient():
    # 📦🔍 [2026-10-30 신규, 사용자 요청] "구매오더 번호 또는 필요한 정보가 정확하지 않은경우
    #    수령인(현재 접속자 이름으로 조회)으로 조회해줘" — 발주와 입고를 따로 할 때 오더번호를
    #    기억 못 하는 게 보통이라, 수령인만으로 입고 대상 오더를 찾는 **읽기 전용** 조회.
    #    전기(POSTING) 없음. sap_bridge_32.py의 lookup_goods_receipt_by_recipient() 참고.
    #    ⚠️ 결과를 자동으로 입고처리하지 않는다 — 미완료 목록에는 수년 전 오더까지 섞여 나온다
    #       (실측 2026-10-30: 수령인 1명의 미완료 10건이 2021~2024년 오더였다). 사람이 고른다.
    #    GET도 받는다 — AI 문답 도구 루프(js/40 QA_TOOLS)는 GET만 호출한다.
    data = request.get_json(silent=True) or {}
    recipient = (data.get('recipient') or request.args.get('recipient') or '').strip()
    if not recipient:
        return jsonify({'ok': False, 'error': 'recipient(수령인 이름)이 필요합니다.'}), 400
    mode = (data.get('mode') or request.args.get('mode') or '미완료').strip()
    data_out, status = _run_sap_bridge(
        ['lookup_goods_receipt_by_recipient', recipient, mode], 60, 'SAP 수령인별 입고대상 조회')
    return jsonify(data_out), status


# ── [2026-10-02] A안 전환: mcp-sap-gui 런타임 폴백 경로 제거 ─────────────────────
# MCP는 "새 SAP 기능을 만들 때 화면을 탐색하는 개발 도구"로만 쓴다(사람이 PC에서 직접 실행).
# 런타임은 항상 결정론적 sap_bridge_32.py 경로만 사용 — CLAUDE.md "결정론 먼저" 원칙.
# 제거 근거: ① 자재번호가 있는 질문은 애초에 MCP로 가지 않았다(js/33-qa-router.js 라우팅 분기)
#            ② 8턴/65초 예산으로는 화면 단위 조작(한 조회당 15~50스텝)을 완주할 수 없었다
#            ③ 브릿지(_SAP_PROC_LOCK)와 별도 락을 써서 같은 SAP 세션을 동시에 건드릴 위험이 있었다
# 제거 대상이던 것: _McpSapGuiClient, _mcp_tools_to_gemini_decls, _call_gemini_with_tools,
#                   /sap-mcp-health, /ai-sap-chat


@app.route('/sap-create-reservation', methods=['POST'])
def sap_create_reservation():
    """🧺 [2026-10-02] 자재 보관함 → MB21 예약(계정대체청구서) 생성.
    Body JSON: {items:[{matnr,qty,unit?,lgort?}], bwart, order_number, cost_center,
                werks?, lgort_default?, rsdat?, wempf?, text?}
    ⚠️ 실제 SAP 예약이 생성된다 — 프런트(js/35)가 사람 확인을 받은 뒤에만 호출한다.
    MIGO 전기는 하지 않는다(최종 산출물은 ZMM019 PDF)."""
    import json as _j
    body = request.get_json(force=True, silent=True) or {}
    items = body.get('items') or []
    if not items:
        return jsonify({'ok': False, 'error': '담긴 자재가 없습니다.'}), 400
    bwart        = (body.get('bwart') or '951').strip()
    order_number = (body.get('order_number') or '').strip()
    cost_center  = (body.get('cost_center') or '').strip()
    if not order_number:
        return jsonify({'ok': False, 'error': '오더번호가 필요합니다.'}), 400
    if not cost_center:
        return jsonify({'ok': False, 'error': '코스트센터가 필요합니다.'}), 400
    # [2026-10-02] 사유(텍스트)는 품목마다 필수 — 비면 SAP이 저장 단계에서 거절한다
    _no_txt = [str(i.get('matnr', '')) for i in items if not str(i.get('sgtxt', '') or '').strip()]
    if _no_txt:
        return jsonify({'ok': False,
                        'error': '사유(텍스트)가 비어 있는 품목이 있습니다: ' + ', '.join(_no_txt[:5])
                                 + ('…' if len(_no_txt) > 5 else '')}), 400
    werks = (body.get('werks') or '1000').strip()
    lgort = (body.get('lgort_default') or '').strip()
    rsdat = (body.get('rsdat') or '').strip()
    wempf = (body.get('wempf') or '').strip()
    text  = (body.get('text') or '').strip()
    purpose = (body.get('purpose') or '').strip()      # 목적(YYDEVTYPE) — "기타" 코딩블록. 필수.
    if not purpose:
        return jsonify({'ok': False, 'error': '목적(용도)이 필요합니다.'}), 400
    # 품목 수에 비례해 넉넉히 — MB21은 자재당 입력+엔터라 건수가 곧 시간이다
    timeout = min(90 + len(items) * 6, 300)
    data, status = _run_sap_bridge(
        ['create_reservation', _j.dumps(items, ensure_ascii=False), bwart, order_number,
         cost_center, werks, lgort, rsdat, wempf, text, purpose],
        timeout, f'MB21 예약 생성(이동유형 {bwart}, {len(items)}건)')
    return jsonify(data), status


@app.route('/sap-print-reservation', methods=['GET'])
def sap_print_reservation():
    """🖨 [2026-10-02] ZMM019에서 예약번호로 조회 후 "청구서출력".
    계정대체 청구의 최종 산출물(MIGO는 쓰지 않음)."""
    rsnum = (request.args.get('rsnum') or '').strip()
    if not rsnum:
        return jsonify({'ok': False, 'error': '예약번호(rsnum)가 필요합니다.'}), 400
    werks = (request.args.get('werks') or '1000').strip()
    # 요청일 — ZMM019 선택화면 RSDAT. 비우면 0건이 나오는 계정이 있어 예약 때 쓴 날짜를 넘긴다.
    rsdat = (request.args.get('rsdat') or '').strip()
    data, status = _run_sap_bridge(
        # [2026-10-02] 네이티브 인쇄 대화상자 대기(최대 120초) + PDF 파일 생성 대기가
        #   들어가 90초로는 부족하다. 워치독 타임아웃(120)보다 넉넉히 잡는다.
        ['print_reservation_zmm019', rsnum, werks, rsdat], 180, f'ZMM019 청구서출력 {rsnum}')
    return jsonify(data), status


@app.route('/sap-mard-stock', methods=['GET'])
def sap_mard_stock():
    # 💰 [2026-10-01] MM03 '회계 1' LBKUM(일반평가데이타)로 전체 플랜트 재고 반환.
    # SE16N 권한 불필요, MB52 T133E 오류와 무관. material에 쉼표로 복수 자재번호 가능.
    material = (request.args.get('material') or '').strip()
    werks = (request.args.get('werks') or '1000').strip()
    if not material:
        return jsonify({'ok': False, 'error': '자재번호(material)가 필요합니다.'}), 400
    n_mats = len([m for m in material.split(',') if m.strip()])
    # [2026-10-02] 자재 1개는 MB52+MM03을 모두 조회하므로(사용자 요청) 2회분 시간을 준다.
    #   복수는 MB52 일괄 + 누락분만 MM03이라 기존 계산 유지.
    timeout = 75 if n_mats == 1 else min(45 + (n_mats - 1) * 20, 120)
    data, status = _run_sap_bridge(['query_mard_stock', material, werks], timeout, 'SAP 재고 조회(MM03)')
    return jsonify(data), status


@app.route('/sap-return-receipt', methods=['POST'])
def sap_return_receipt():
    """반납 입고 전기 (MB21 이동유형 907 + F00151 실전기).
    Body JSON: {items:[{matnr,qty,unit?,lgort?}], order_number, cost_center?,
                lgort_default?, text?, rsdat?, wempf?}
    ⚠️ 실제 SAP 전기 — AI 문답에서 사람이 확인 후만 호출."""
    import json as _j
    body = request.get_json(force=True, silent=True) or {}
    items        = body.get('items') or []
    order_number = (body.get('order_number') or '').strip()
    cost_center  = (body.get('cost_center') or '').strip() or None
    lgort        = (body.get('lgort_default') or '5000').strip()
    text_arg     = (body.get('text') or '').strip() or None
    rsdat_arg    = (body.get('rsdat') or '').strip() or None
    wempf_arg    = (body.get('wempf') or '').strip() or None
    if not items or not order_number:
        return jsonify({'ok': False, 'error': 'items와 order_number가 필요합니다.'}), 400
    items_json = _j.dumps(items, ensure_ascii=False)
    data, status = _run_sap_bridge(
        ['migo_return_receipt', items_json, order_number,
         cost_center or '', lgort, text_arg or '', rsdat_arg or '', wempf_arg or ''],
        timeout=120, label='반납 입고(MB21+F00151)')
    return jsonify(data), status




# ── 백엔드 자동 업데이트("SAP 조회 연동" 절 kortek_backend.zip 배포 방식의 대안, 2026-09-15) ─
# 이 앱은 GitHub Pages(정적 프런트) + 각 PC의 로컬 백엔드(kortek_backend.py) 구조라, 백엔드
# 파일이 바뀔 때마다 사용자가 kortek_backend.zip을 다시 받아 기존 폴더에 덮어써야 했다 —
# 그 절차를 사람이 잊거나 귀찮아하면 다른 팀원 PC는 계속 구버전 백엔드로 남는다. 그래서 프런트가
# 구글 로그인 성공 직후(js/04b-core-app-drive-sync.js) 로컬 백엔드에게 "지금 GitHub main
# 브랜치의 최신 파일과 내용이 다른 게 있는지" 물어보고(`/self-check-update`), 다르면 배너를
# 띄워 사용자가 버튼을 누르면 로컬 백엔드가 스스로 그 파일들을 GitHub raw에서 받아 자기 자신의
# 디렉터리(BASE_DIR)에 덮어쓴다(`/self-update`) — 버전 번호를 별도로 관리하지 않고 매번 GitHub의
# 실제 파일 내용과 직접 바이트 비교하므로 "버전 올리는 걸 깜빡해서 갱신 감지가 안 되는" 문제가
# 없다.
# ⚠️⚠️ [2026-09-16 재검토 후 결정 변경] 원래는 "자동 재시작은 하지 않는다"(포트 점유 해제
# 타이밍 등 복잡도·위험도 대비 이득이 적다고 판단)였으나, SAP 디버깅 중 백엔드가 자주 바뀌고
# 다른 사용자 PC는 시작프로그램으로 한 번 켜진 뒤 사람이 재시작을 깜빡하기 쉽다는 실사용
# 문제(구버전 백엔드가 새 SAP 엔드포인트 요청에 HTML 404를 돌려줘 "Unexpected token JSON"
# 오류로 오인되던 사고)가 반복돼, 사용자 요청으로 자동 재시작을 다시 구현하기로 결정함 —
# 아래 `_spawn_restarted_backend()` 참고. 실패해도(새 프로세스 기동 실패 등) 예외 없이 조용히
# `restarting: False`로 응답해 프런트가 기존처럼 "수동으로 재시작해주세요" 안내로 자연히
# 폴백하게 한다.
_GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/yhparkkortek/ganttchart/main'
# kortek_backend.zip에 포함되는 배포 대상 파일 목록과 동일하게 유지할 것(.claude/settings.json의
# PostToolUse 훅 Compress-Archive 목록 참고) — 새 배포 파일이 추가되면 여기도 같이 추가해야 함.
_SELF_UPDATE_FILES = [
    'kortek_backend.py',
    'sap_bridge_32.py',
    'gw_bridge.py',
    'insa_write.py',
    'nas_dsm.py',
    'nas_set_login.py',
    'nas_set_root.py',
    'kortek_backend.bat',
    'kortek_backend_install.bat',
    'kortek_backend_start_minimized.vbs',
    'matgroups.json',
    'templates/승인원_양식.xlsx',
    'templates/승인원_양식.docx',
]
# ⚠️⚠️ [2026-09-16 실사용 버그수정] Windows 배치(.bat)/VBScript(.vbs) 파일은 git이 텍스트
# 파일을 저장소 안에서는 항상 LF로 정규화해 저장하므로(로컬 작업 사본의 줄바꿈과 무관하게)
# GitHub raw도 항상 LF-only 바이트를 돌려준다 — 그걸 그대로 바이트 그대로 써버리면(기존 코드)
# 사용자 PC에는 LF-only .bat/.vbs 파일이 생긴다. cmd.exe의 배치 파서는 특히 이 파일들처럼
# 괄호로 감싼 `IF (...) ELSE (...)` 블록이 많을 때 LF-only 줄바꿈에서 오동작하거나
# ("...was unexpected at this time." 류 오류, 또는 블록이 조용히 실행 안 됨), 옛 스타일
# 메모장에서는 줄바꿈 자체를 인식 못해 텍스트가 한 줄로 뭉쳐 보인다("파일이 이상함"이라는
# 실사용 제보의 실제 원인으로 추정) — 이 확장자들은 항상 CRLF로 정규화해서 써야 한다.
_SELF_UPDATE_CRLF_EXTS = ('.bat', '.vbs')


def _fetch_github_raw(rel_path):
    url = _GITHUB_RAW_BASE + '/' + '/'.join(quote(seg) for seg in rel_path.split('/'))
    # ⚠️ [2026-10-13 실사고] raw.githubusercontent.com은 CDN 캐시(최대 ~5분)가 있어, 푸시 직후
    #   /self-update를 누르면 **푸시 전 옛 버전**을 받아 최신 파일을 옛 버전으로 덮어썼다
    #   (sap_bridge_32.py 319줄 롤백 → 고친 가격/공급업체 조회가 옛 동작으로 되돌아감).
    #   쿼리스트링이 다르면 CDN이 다른 URL로 취급하므로 매 요청 고유값을 붙여 캐시를 우회한다.
    resp = requests.get(url, params={'cb': str(int(time.time() * 1000))},
                        headers={'Cache-Control': 'no-cache'}, timeout=10)
    resp.raise_for_status()
    return resp.content


# 줄바꿈만 다르고 내용이 같은 경우를 "구버전"으로 오탐하지 않으려면 **모든 텍스트 파일**을
# LF로 맞춰 비교해야 한다. 바이너리(.xlsx/.docx)는 그대로 바이트 비교.
_SELF_UPDATE_TEXT_EXTS = ('.py', '.bat', '.vbs', '.json', '.txt', '.md')


def _normalize_for_compare(rel_path, data):
    """비교 직전에 양쪽 줄바꿈을 LF로 맞춘다 — 실제 파일 갱신(`/self-update`)에는 영향 없음
    (그쪽은 `.bat`/`.vbs`를 항상 CRLF로 쓰는 로직 그대로 유지).

    ⚠️⚠️ [2026-10-16 사고] 예전엔 `.bat`/`.vbs`만 정규화해서 **`.py`가 빠져 있었다.**
    개발 PC는 git이 autocrlf로 CRLF 체크아웃하는데 GitHub raw는 LF를 주므로, 내용이
    완전히 같은데도 `.py`가 **영원히 "업데이트 있음"** 으로 떴다. 그 상태에서 "지금 업데이트"를
    누르면 방금 작업한 로컬 파일을 원격 버전으로 덮어쓴다 — 실제로 작업 중이던
    `gw_bridge.py` 131줄 / `kortek_backend.py` 32줄이 이렇게 조용히 날아갔다.
    (CLAUDE.md의 2026-10-13 raw 캐시 롤백 사고와 증상이 같지만 원인은 줄바꿈이다.)"""
    if rel_path.lower().endswith(_SELF_UPDATE_TEXT_EXTS):
        return data.replace(b'\r\n', b'\n')
    return data


# ⚠️⚠️ [2026-10-16] 자동 업데이트는 **팀원 PC가 최신 백엔드를 받아가라고** 만든 기능이다.
# 개발 PC(= git 작업본)에서는 로컬이 원본이라 받아올 게 없고, 누르면 **방금 한 작업을 원격
# 버전으로 덮어쓴다** — 실제로 작업 중이던 gw_bridge.py 131줄 / kortek_backend.py 32줄이
# 이렇게 날아갔다(두 번). `.git`이 있으면 업데이트는 git으로 관리하는 환경이므로 끈다.
def _is_git_workdir():
    return os.path.isdir(os.path.join(BASE_DIR, '.git'))


@app.route('/self-check-update', methods=['GET'])
def self_check_update():
    if _is_git_workdir():
        # 개발 PC — 업데이트 안내 자체를 띄우지 않는다(조용히 끄지 않고 이유를 같이 알린다)
        return jsonify({'ok': True, 'outdated': False, 'changedFiles': [], 'errors': [],
                        'devMode': True,
                        'message': 'git 작업본이라 자동 업데이트를 건너뜁니다(업데이트는 git으로 관리).'})
    changed, errors = [], []
    for rel_path in _SELF_UPDATE_FILES:
        try:
            remote_bytes = _fetch_github_raw(rel_path)
        except Exception as e:
            errors.append(f'{rel_path}: {e}')
            continue
        local_path = os.path.join(BASE_DIR, rel_path)
        local_bytes = b''
        if os.path.exists(local_path):
            with open(local_path, 'rb') as f:
                local_bytes = f.read()
        if _normalize_for_compare(rel_path, remote_bytes) != _normalize_for_compare(rel_path, local_bytes):
            changed.append(rel_path)
    return jsonify({'ok': True, 'outdated': len(changed) > 0, 'changedFiles': changed, 'errors': errors})


def _spawn_restarted_backend():
    """새 `kortek_backend.py` 프로세스를 별도 콘솔로 띄운다 — 새 프로세스는 포트 5000이
    아직 이전(지금 실행 중인) 프로세스에 점유돼 있으면 `_run_flask_with_port_retry`가
    자동으로 재시도하므로, 여기서는 타이밍을 정확히 맞출 필요 없이 그냥 곧바로 띄우기만
    하면 된다. `CREATE_NEW_CONSOLE`로 띄워서 사람이 재시작이 실제로 일어났음을(새 콘솔
    창이 뜸) 눈으로 확인할 수 있게 한다 — 완전히 숨기면(DETACHED_PROCESS) 조용히 실패해도
    아무도 모르는 게 더 위험하다고 판단."""
    script_path = os.path.join(BASE_DIR, 'kortek_backend.py')
    creationflags = 0
    if sys.platform == 'win32':
        creationflags = subprocess.CREATE_NEW_CONSOLE
    subprocess.Popen(
        [sys.executable, script_path],
        cwd=BASE_DIR,
        creationflags=creationflags,
        close_fds=True,
    )


def _delayed_self_exit(delay_sec=0.6):
    """지금 응답을 클라이언트에게 다 보낼 시간을 준 뒤(0.6초) 이 프로세스를 종료해 포트
    5000을 반납한다 — 응답을 먼저 안 보내고 바로 죽으면 요청자는 연결이 끊긴 것으로만
    보여 재시작이 실제로 성공했는지 알 방법이 없다."""
    def _exit():
        time.sleep(delay_sec)
        os._exit(0)
    threading.Thread(target=_exit, daemon=True).start()


def _self_update_validate(rel_path, data):
    """받은 파일이 덮어쓸 만한 물건인지 검사한다. 문제가 있으면 사유 문자열, 없으면 None.

    ⚠️⚠️ [2026-10-02 실사고] 예전엔 받은 바이트를 **검증 없이 바로 덮어쓰고 재시작**했다.
      그래서 깨진 파일이 GitHub main에 올라간 ~2시간 동안 "백엔드 업데이트"를 누른 PC가
      전부 같이 죽었다(sap_bridge_32.py가 289줄 잘려 IndentationError).
      팀원 PC에는 git이 없어서 되돌릴 수단이 zip 재설치뿐이고, 만약 kortek_backend.py가
      같은 식으로 깨지면 **기동 자체가 안 돼 /self-update를 다시 부를 서버도 없다**(벽돌).
      그래서 "쓰기 전에 검사"가 반드시 필요하다.
    """
    if not data:
        return '받은 파일이 비어 있습니다(0바이트)'
    if rel_path.lower().endswith('.py'):
        try:
            compile(data.decode('utf-8'), rel_path, 'exec')
        except UnicodeDecodeError as e:
            return f'UTF-8로 읽히지 않습니다 - {e}'
        except SyntaxError as e:
            return f'원격 파일에 문법 오류가 있습니다 (line {e.lineno}: {e.msg})'
    return None


@app.route('/self-update', methods=['POST'])
def self_update():
    # [2026-10-02] 3단 안전장치: ① 받아서 검사 → ② 하나라도 실패하면 **아무것도 쓰지 않음**
    #   → ③ 덮어쓰기 직전 .bak 백업. 반쯤 갱신된 상태가 가장 위험해서 전부 아니면 전무로 간다.
    # ⚠️ [2026-10-16 추가] 0단계: git 작업본에서는 아예 거부한다. 여기서 실행하면 커밋 안 한
    #   로컬 작업이 원격 버전으로 덮어써진다(실제 사고 2회). 정말 필요하면 ?force=1.
    if _is_git_workdir() and (request.args.get('force') or '') != '1':
        return jsonify({'ok': False, 'devMode': True, 'updated': [], 'errors': [],
                        'message': 'git 작업본에서는 자동 업데이트를 하지 않습니다 — '
                                   '커밋하지 않은 로컬 작업이 원격 버전으로 덮어써집니다. '
                                   '업데이트가 필요하면 `git pull`을 쓰세요(정말 강행하려면 ?force=1).'}), 409
    updated, errors, staged = [], [], []

    # ── ① 전부 받아서 검사만 한다(디스크는 아직 건드리지 않음) ──────────────
    for rel_path in _SELF_UPDATE_FILES:
        try:
            remote_bytes = _fetch_github_raw(rel_path)
        except Exception as e:
            errors.append(f'{rel_path}: 다운로드 실패 - {e}')
            continue
        bad = _self_update_validate(rel_path, remote_bytes)
        if bad:
            errors.append(f'{rel_path}: {bad} — 업데이트를 중단했습니다(기존 파일 그대로 둡니다)')
            continue
        staged.append((rel_path, remote_bytes))

    # ── ② 하나라도 문제가 있으면 한 글자도 쓰지 않는다 ──────────────────────
    if errors:
        print(f'[self-update 중단] {len(errors)}건 문제 — 기존 파일을 보존합니다: {errors}', file=sys.stderr)
        return jsonify({'ok': False, 'updatedFiles': [], 'errors': errors, 'restarting': False})

    # ── ③ 전부 통과했을 때만 .bak을 남기고 덮어쓴다 ─────────────────────────
    for rel_path, remote_bytes in staged:
        local_path = os.path.join(BASE_DIR, rel_path)
        try:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            write_bytes = remote_bytes
            if rel_path.lower().endswith(_SELF_UPDATE_CRLF_EXTS):
                # 먼저 혹시 있을 CRLF를 LF로 되돌린 뒤 전부 CRLF로 바꿔서, 원본이 LF-only든
                # 이미 CRLF든 결과가 항상 깨끗한 CRLF가 되게 한다(CRLF를 또 CRLF화해서
                # CRCRLF가 되는 사고 방지).
                write_bytes = remote_bytes.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            if os.path.exists(local_path):
                # 검사를 통과해도 예상 못 한 일이 생길 수 있다 — 직전 버전을 한 벌 남겨 둔다.
                # (git이 없는 팀원 PC에서 되돌릴 수 있는 유일한 수단)
                try:
                    shutil.copy2(local_path, local_path + '.bak')
                except Exception as be:
                    print(f'[self-update] {rel_path} 백업 실패(계속 진행): {be}', file=sys.stderr)
            with open(local_path, 'wb') as f:
                f.write(write_bytes)
            updated.append(rel_path)
        except Exception as e:
            errors.append(f'{rel_path}: 저장 실패 - {e}')

    ok = len(errors) == 0
    restarting = False
    if ok and updated:
        try:
            _spawn_restarted_backend()
            restarting = True
        except Exception as e:
            # 새 프로세스를 못 띄워도 파일 갱신 자체는 이미 끝났으니 오류로 취급하지 않고,
            # restarting:False만 알려서 프런트가 수동 재시작 안내로 폴백하게 한다.
            errors.append(f'자동 재시작 시도 실패(파일은 갱신됨, 수동 재시작 필요) - {e}')

    response = jsonify({'ok': ok, 'updatedFiles': updated, 'errors': errors, 'restarting': restarting})
    if restarting:
        # 응답을 다 만든 뒤에만 종료를 예약 — 아래 return으로 클라이언트에 응답이 나간 다음에
        # 이 스레드가 깨어나 프로세스를 종료한다.
        _delayed_self_exit()
    return response


def _run_flask_with_port_retry(max_wait_sec=15):
    """`/self-update`의 자동 재시작(`_spawn_restarted_backend`)이 새 프로세스를 띄운 시점에
    이전 프로세스가 아직 포트 5000을 반납하기 전일 수 있다(`_delayed_self_exit`이 0.6초 뒤
    종료하지만, 그 사이 새 프로세스가 먼저 뜰 수도 있음) — 정확한 타이밍을 맞추는 대신,
    바인드 실패(OSError, Windows에서는 통상 WinError 10048 "각 소켓 주소는 한 번만 사용할
    수 있습니다")를 잡아 포트가 열릴 때까지 짧게 재시도하는 쪽이 더 안전하다고 판단함."""
    start = time.time()
    while True:
        try:
            # threaded=True: /sap-cancel이 SAP 조회로 블로킹된 다른 요청과 동시에 처리돼야
            # "실행 중단해줘"가 그 조회가 끝날 때까지 안 기다리고 바로 먹힌다(2026-09-23).
            app.run(host='127.0.0.1', port=5000, debug=False, threaded=True)
            return
        except OSError as e:
            if time.time() - start > max_wait_sec:
                raise
            time.sleep(0.5)


# ══════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════
# 📁 [2026-10-22 신규] 문서 저장소 — 사내 네트워크 공유(UNC)를 앱의 자료 보관처로
#
#   왜: 사양서 PDF·사진 등을 Google Drive에 쌓으면 용량이 걱정된다는 요청.
#   실측해보니 사내 공유에 이미 패널 SPEC이 PN 파일명으로 정리돼 있었다
#   (평균 1.5MB/건). 거기 그대로 두면 용량 문제가 애초에 없고 팀 공유도 이미 된다.
#
#   ⚠️ 브라우저는 UNC(\\서버\공유)를 직접 못 읽는다(Chrome이 차단). 그래서 이 백엔드가
#   중계한다 — C:\SAP_DMS에 쓰고 읽는 기존 패턴과 같다.
#
#   ⚠️ 경로를 코드에 박지 않는다. 이 저장소는 GitHub Pages로 **공개**돼 있어서 사내 IP를
#   커밋하면 안 되고, NAS를 바꾸면 코드를 또 고쳐야 한다. → docstore_config.json(.gitignore).
#
#   ⚠️ 폴더 목록도 설정이다 — PANEL/CUSTOMER/PARTS/MC 외에 사진 등을 추가할 때 코드를 안 고친다.
#
#   텍스트 추출은 **브라우저가** 한다(pdf.js·XLSX가 이미 프런트에 있음, js/42 _pxExtractText).
#   백엔드에 PDF 라이브러리를 새로 깔면 팀원 PC마다 설치 부담이 생긴다 — 추출은 프런트,
#   캐시 저장만 여기(_text/).
# ══════════════════════════════════════════════════════════════════════════

DOCSTORE_CONFIG_FILE = os.path.join(BASE_DIR, 'docstore_config.json')
DOCSTORE_TEXT_DIR    = '_text'          # 추출 텍스트 캐시 폴더(설정 폴더 목록과 별개로 항상 허용)
BACKSLASH            = chr(92)         # 경로 정규화용 — 리터럴 안 백슬래시를 피한다
# 🗂 [2026-10-22] 앱이 페이지별로 쓰는 폴더 — **설정에 없어도 항상 허용**한다.
#   왜: 폴더 목록은 PC마다 각자 저장되는데(docstore_config.json, .gitignore), 앱이 새 폴더를
#   쓰거나 이름을 바꾸면 팀원 PC에서만 "허용되지 않은 폴더"가 난다(ELEC→PARTS가 그 경우).
#   화이트리스트의 목적은 **경로 탈출 차단**이고, 앱이 정한 이름은 root 아래라 그 목적과 무관하다.
DOCSTORE_APP_FOLDERS = ['SUMMARY', 'CUSTOMER', 'MC', 'PARTS', 'ADDRESS',
                        'ALARM&NOTICE', 'CALENDER', 'GANTT', 'REPORT',
                        # 📒 [2026-10-29] Project list 페이지(js/55)가 읽는 고객 도면 폴더.
                        #    ⚠️ 철자/띄어쓰기는 NAS 에 있는 그대로다('PROJECT LIST', 공백 포함) —
                        #    'PROJECTLIST' 로 적으면 실제 폴더를 못 찾는다(실측에서 FileNotFound).
                        #    실제 파일은 그 아래 'PROJECT LIST/CUSTOMER' 에 있다(하위 한 단계까지 허용).
                        'PROJECT LIST',
                        # 📄 [2026-11-09] Document 페이지(js/66)가 만들어 올리는 프로젝트 문서 폴더.
                        #    DR/DVR 발표자료·모델명세서·라벨사양서 등 — 사람이 쓰던 문서를 앱 데이터로
                        #    만들어 여기에 떨어뜨린다. ⚠️ 설정의 `folders` 목록엔 없을 수 있어서
                        #    (PC 마다 따로다) 여기 적어 둔다 — 안 적으면 그 PC 에서만 400 이 난다.
                        'DOCUMENT']


def _docstore_load():
    """{'root': UNC경로, 'folders': [...]} — 미설정이면 root가 빈 문자열"""
    try:
        if os.path.exists(DOCSTORE_CONFIG_FILE):
            with open(DOCSTORE_CONFIG_FILE, 'r', encoding='utf-8') as f:
                cfg = json.load(f) or {}
                return {
                    'root': str(cfg.get('root') or ''),
                    'folders': [str(x) for x in (cfg.get('folders') or []) if str(x).strip()]
                }
    except Exception as e:
        print(f'[문서저장소] 설정 읽기 실패: {e}')
    return {'root': '', 'folders': []}


# 🔒 [2026-11-04] 공유 접속이 **자격증명 실패**로 막히면 더 두드리지 않는다.
#   왜: `os.path.isdir(root)` 한 번이 SMB **로그온 한 번**이다. 앱은 페이지를 열 때마다
#   `/doc/list` 를 여러 번 부르므로(PARTS/PANEL·PROJECT LIST…), 저장된 비밀번호가 낡은 PC 는
#   **쓰는 내내 실패 로그온을 쌓는다** → 계정 잠금. 실측(2026-11-04): 자격증명은 Windows 자격
#   증명 관리자에 남아 있는데 WinError 1326(사용자 이름 또는 암호가 올바르지 않습니다)이었다.
#   이 저장소는 같은 이유로 DSM·그룹웨어·인사관리에 전부 "1회 실패 후 금지" 가드를 두고 있다 —
#   공유 폴더에만 없었다.
#   ⚠️ **네트워크가 안 닿는 것은 자격증명 문제가 아니다**(53/64/1231 등) — 그건 막지 않는다.
#      사내망 밖에 있다가 돌아오면 저절로 되어야 하니까.
#   ⚠️ 풀리는 때: 백엔드 재시작, 또는 설정 화면에서 경로를 다시 저장할 때(`/doc/config` POST).
_DOCSTORE_AUTH_BLOCK = {'code': 0, 'message': ''}
#   1326 로그온 실패 · 1327 계정 제한 · 1330/1907 암호 만료 · 1331 계정 사용 안 함 ·
#   1909 계정 잠김 · 86 암호 틀림 · 1219 같은 서버에 다른 자격증명으로 이미 연결됨
_DOCSTORE_AUTH_CODES = {86, 1219, 1326, 1327, 1330, 1331, 1907, 1909}


def _docstore_probe_root(root):
    """root 에 닿는지 본다. (ok, 사유) — 자격증명 실패면 그 뒤로는 안 두드린다."""
    if _DOCSTORE_AUTH_BLOCK['code']:
        return False, _DOCSTORE_AUTH_BLOCK['message']
    try:
        os.stat(root)          # isdir() 은 실패 '이유'를 안 알려준다 — stat 은 winerror 를 준다
        return True, None
    except OSError as e:
        code = getattr(e, 'winerror', 0) or 0
        if code in _DOCSTORE_AUTH_CODES:
            msg = (f'문서 저장소에 로그인하지 못했습니다 (Windows 오류 {code}). '
                   '저장된 자격 증명이 낡았을 수 있습니다. '
                   '탐색기에서 그 공유 폴더를 한 번 열어 계정/비밀번호를 다시 입력해 주세요'
                   '(자격 증명 기억 체크). '
                   '⚠️ 계정이 잠길 수 있어 백엔드는 더 이상 자동으로 시도하지 않습니다 — '
                   '고치신 뒤 백엔드를 재시작하거나 설정에서 경로를 다시 저장하세요.')
            _DOCSTORE_AUTH_BLOCK['code'] = code
            _DOCSTORE_AUTH_BLOCK['message'] = msg
            print(f'[문서저장소] 자격증명 실패(WinError {code}) — 자동 재시도를 멈춥니다.')
            return False, msg
        return False, f'문서 저장소 경로에 접근할 수 없습니다: {root} (사내망/권한 확인)'


def _docstore_safe_name(name):
    """파일명만 남긴다 — 경로 탈출(.., /, \\, C:) 차단.
    ⚠️ 이 백엔드는 UNC 공유에 쓰기 권한이 있으므로, 이름을 그대로 믿으면 공유 어디에나
       파일을 쓸 수 있게 된다. basename만 취하고 상위 참조를 거부한다."""
    raw = str(name or '').strip().replace('\\', '/')
    base = os.path.basename(raw)
    if not base or base in ('.', '..'):
        return ''
    if '/' in base or '\\' in base or ':' in base:
        return ''
    return base


def _docstore_folder_segs(folder, cfg, allow_text=False):
    """'CUSTOMER/KONAMI/ELECTRICAL' → ['CUSTOMER', 'KONAMI', 'ELECTRICAL']. 허용 안 되면 (None, 사유).

    🗂 [2026-10-22] **한 단계 하위 폴더까지** 허용했다 — PARTS 탭이 부품 종류마다 자료를
       갈라 두기 때문(PARTS/PANEL, PARTS/CONV …).
    🗂 [2026-10-26] 깊이 제한을 2→6단계로 올렸다 — 프로젝트별 하위 폴더(CUSTOMER/<프로젝트>) 아래
       사람이 NAS에서 직접 만드는 폴더(전기/기구 구분, 그 안의 세부 폴더)를 앱이 그대로 읽어
       탐색기처럼 보여줘야 해서다. 상위 폴더는 여전히 화이트리스트(설정 + DOCSTORE_APP_FOLDERS)
       여야 하고, 나머지 단계는 전부 파일명과 같은 규칙(_docstore_safe_name)으로 걸러 경로
       탈출을 막는다. 6단계는 안전 상한일 뿐 — 깊이를 무제한으로 열어 둘 이유는 없다.
    """
    raw = str(folder or '').strip().replace(BACKSLASH, '/')
    parts = [x for x in raw.split('/') if x not in ('', '.')]
    if not parts or len(parts) > 6:
        return None, '폴더 이름이 올바르지 않습니다.'
    segs = [_docstore_safe_name(x) for x in parts]
    if not all(segs):
        return None, '폴더 이름이 올바르지 않습니다.'
    allowed = list(cfg.get('folders') or []) + [f for f in DOCSTORE_APP_FOLDERS
                                               if f not in (cfg.get('folders') or [])]
    if allow_text:
        allowed.append(DOCSTORE_TEXT_DIR)
    if segs[0] not in allowed:
        return None, f'허용되지 않은 폴더입니다: {segs[0]} (설정된 폴더: {", ".join(allowed) or "없음"})'
    return segs, None


def _docstore_dir(folder, cfg=None, allow_text=False):
    """folder → 실제 경로. 설정에 없는 폴더는 거부(화이트리스트). 하위 폴더 한 단계 허용."""
    cfg = cfg or _docstore_load()
    root = cfg.get('root') or ''
    if not root:
        return None, '문서 저장소 경로가 설정되지 않았습니다. (AI 도구 > 설정에서 공유 폴더 경로를 입력하세요)'
    ok, err = _docstore_probe_root(root)
    if not ok:
        return None, err
    segs, err = _docstore_folder_segs(folder, cfg, allow_text)
    if err:
        return None, err
    path = os.path.join(root, *segs)
    if not os.path.isdir(path):
        try:
            os.makedirs(path, exist_ok=True)
        except Exception as e:
            return None, f'폴더를 만들 수 없습니다: {"/".join(segs)} ({e})'
    return path, None


# ══════════════════════════════════════════════════════════════
# 🗄️ [2026-11-03 신규] NAS(Synology DSM) 연동 — 읽기 전용 1단계
#   왜: 접속 권한을 **사내 계정**으로 옮기기 위해서다. DSM 계정으로 로그인하면 파일 접근이
#       그 사람 권한으로 일어나므로, 팀별 폴더 권한을 NAS 가 강제한다(앱을 고쳐도 우회 불가).
#   SMB 경유 `/doc/*` 와 다른 점: HTTP API 라 **모바일·사외에서도** 쓸 수 있는 길이 열린다.
#   ⚠️ 로그인은 1회만 — DSM 은 실패가 쌓이면 **IP** 를 차단한다. 재시도 금지 가드는 nas_dsm.py.
#   ⚠️ 비밀번호는 이 파일을 지나가지 않는다 — 저장은 `python nas_set_login.py`(getpass + DPAPI).
# ══════════════════════════════════════════════════════════════
def _nas():
    import nas_dsm
    return nas_dsm


@app.route('/nas/status', methods=['GET'])
def nas_status():
    """로그인 상태만 본다 — 로그인 시도는 하지 않는다."""
    try:
        nas = _nas()
        # 🔑 아직 설정 전이면 **기본값**을 같이 내려 화면이 채워 놓는다(nas_defaults.json,
        #    .gitignore — 사내 주소를 공개 저장소에 넣지 않으려는 것). 비밀번호는 안 들어간다.
        return jsonify(dict(nas.status(), ok_module=True, defaults=nas.load_defaults()))
    except Exception as e:
        return jsonify({'ok': False, 'reason': 'module', 'message': f'nas_dsm 로드 실패: {e}'})


@app.route('/nas/login', methods=['POST'])
def nas_login():
    """로그인 — **한 번만** 시도한다. 실패하면 사람이 다시 시킬 때까지 잠근다.

    본문에 `user`/`password` 가 있으면 **그 계정으로** 로그인하고(회의실에서 사람이 바뀔 때),
    `save` 가 참이고 **성공했을 때만** 이 PC 에 저장한다.
    ⚠️ 비밀번호는 로그·응답에 싣지 않는다. GET 이 아닌 POST 인 이유도 같다.
    """
    try:
        req = request.get_json(force=True, silent=True) or {}
        user = str(req.get('user') or '').strip()
        pw = req.get('password') or ''
        if user and pw:
            return jsonify(_nas().login_with(user, pw, otp=req.get('otp'), save=bool(req.get('save'))))
        return jsonify(_nas().login_once(otp=req.get('otp')))
    except Exception as e:
        return jsonify({'ok': False, 'result': 'error', 'message': str(e)})


@app.route('/nas/login', methods=['DELETE'])
def nas_logout():
    try:
        return jsonify(_nas().logout())
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})


@app.route('/nas/unblock', methods=['POST'])
def nas_unblock():
    """로그인 실패 잠금을 사람이 직접 푼다(설정을 고친 뒤에만 쓸 것)."""
    try:
        _nas().reset_block()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)})



# 🔑 [2026-11-05] NAS 비밀번호를 저장할 때 문서 저장소(SMB) 자격증명도 같이 갱신한다.
#   왜: 문서 저장소(/doc/*)는 DSM API 와 완전히 별개로 **Windows OS 가 캐시한 SMB 자격증명**
#   (탐색기/자격 증명 관리자)에만 의존한다(_docstore_probe_root 윗주석, 2026-11-04). NAS
#   비밀번호를 여기서만 바꾸면 문서 저장소는 여전히 낡은 비밀번호로 실패 로그온을 반복하다
#   계정이 잠길 수 있다 — `unc_of()`가 같은 `host`로 UNC를 만드는 것처럼(nas_dsm.py:713)
#   같은 장비·같은 계정이라고 보고 같이 갱신한다(실제 사고: 2026-11-05, 사용자가 NAS 비밀번호만
#   바꿨는데 문서 저장소가 WinError 1326으로 막힘).
#   ⚠️ 비밀번호를 로그·예외·응답에 남기지 않는다. 이 동기화가 실패해도 NAS 로그인 자체는
#      막지 않는다(그냥 무시 — 그래도 안 되면 사람이 탐색기에서 수동 재인증하는 기존 길이 남음).
#   ⚠️ cmdkey 대상은 호스트명/IP만 받는다 — 스킴·포트·경로는 떼고 넘긴다.
def _docstore_saved_password():
    """저장된 NAS 비밀번호(DPAPI)를 꺼낸다. 없거나 못 풀면 ''.

    🔑 [2026-11-05] 왜 필요한가 — 자격증명 동기화가 `if pw:` 뒤에 있어서 **사람이 비밀번호를
       그 자리에서 다시 타이핑했을 때만** 돌았다. 설정 화면은 이미 저장된 PC 에서 비밀번호 칸을
       "(저장됨 — 바꿀 때만 입력)" 으로 비워 두므로, 저장을 다시 눌러도 `pw` 가 빈 문자열이라
       **cmdkey 가 한 번도 안 불렸다.** 사용자 신고: "폴더 자격증명을 별도로 하니 NAS 연결되는데
       자동으로는 안 되나" — 바로 이 구멍이다. 비밀번호는 이미 이 PC 에 DPAPI 로 있으니 꺼내 쓴다.
    """
    try:
        nas = _nas()
        cfg = nas.load_config()
        if cfg and cfg.get('pw_dpapi'):
            return nas._dpapi_decrypt_b64(cfg['pw_dpapi']) or ''
    except Exception as e:
        print(f'[문서저장소] 저장된 비밀번호를 꺼내지 못했습니다(무시): {e}')
    return ''


def _sync_docstore_smb_credential(host, user, password):
    if not host or not user or not password:
        return False, '비밀번호가 없어 자격증명을 걸지 못했습니다.'
    target = str(host).strip()
    if '://' in target:
        target = target.split('://', 1)[1]
    target = target.split('/')[0].split('\\')[0].split(':')[0]
    if not target:
        return False, '서버 주소를 읽지 못했습니다.'
    try:
        # ⚠️ 결과를 **확인한다.** 예전엔 returncode 를 안 보고 넘어가서, cmdkey 가 실패해도
        #    화면은 아무 말이 없었다("조용히 삼키지 말 것"). 비밀번호는 로그에 남기지 않는다.
        r = subprocess.run(
            ['cmdkey', '/add:' + target, '/user:' + str(user).strip(), '/pass:' + str(password)],
            capture_output=True, timeout=5
        )
        if r.returncode != 0:
            why = (r.stdout or b'').decode('cp949', 'replace').strip() \
                  or (r.stderr or b'').decode('cp949', 'replace').strip()
            print(f'[문서저장소] cmdkey 실패(rc={r.returncode}): {why}')
            return False, f'자격증명을 걸지 못했습니다(cmdkey rc={r.returncode}). {why}'
        # 사람이 방금 새 비밀번호를 넣은 것 — 문서 저장소도 다시 두드려 보게 잠금을 풀어준다.
        _DOCSTORE_AUTH_BLOCK['code'] = 0
        _DOCSTORE_AUTH_BLOCK['message'] = ''
        return True, target
    except Exception as e:
        print(f'[문서저장소] SMB 자격증명 동기화 실패(무시, 안 되면 탐색기에서 수동 재인증): {e}')
        return False, str(e)


# ── 🔑 NAS 로그인/앱 폴더 설정 (설정 화면이 쓰는 쓰기 라우트) ───────────────────
#   ⚠️ 비밀번호는 **POST 본문으로만** 받는다. 쿼리스트링에 실으면 NAS·프록시의
#      access log 에 그대로 남는다(SAP·그룹웨어와 같은 규칙).
#   ⚠️ 어떤 응답에도 비밀번호를 **돌려주지 않는다.** 저장돼 있는지 여부만 알려준다.
#   ⚠️ 저장은 Windows DPAPI 로 이 PC 에서만 풀린다(`nas_login_config.json`, .gitignore).
@app.route('/nas/config', methods=['POST'])
def nas_config_save():
    req = request.get_json(force=True, silent=True) or {}
    host = str(req.get('host') or '').strip()
    user = str(req.get('user') or '').strip()
    pw = req.get('password') or ''
    if not host or not user:
        return jsonify({'ok': False, 'message': '주소와 아이디가 필요합니다.'}), 400
    try:
        port = int(req.get('port') or (5001 if req.get('https') else 5000))
    except Exception:
        return jsonify({'ok': False, 'message': '포트는 숫자여야 합니다.'}), 400
    try:
        saved = _nas().save_config(host, port, bool(req.get('https')), user, pw)
        # save_config 가 잠금을 풀어 준다(= 사람이 설정을 다시 저장했다는 뜻).
        # 🔑 [2026-11-05] 비밀번호 칸이 비어 있어도(이미 저장된 PC) **저장된 걸 꺼내** 자격증명을 건다 —
        #    예전엔 `if pw:` 라 다시 타이핑했을 때만 돌아서, 문서 저장소는 영영 수동이었다.
        _sync_docstore_smb_credential(host, user, pw or _docstore_saved_password())
        return jsonify({'ok': True, 'saved': saved})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 400


@app.route('/nas/config', methods=['DELETE'])
def nas_config_clear():
    try:
        _nas().clear_config()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/nas/root', methods=['POST'])
def nas_root_set():
    """앱 폴더 위치. CLI(`nas_set_root.py`)와 **같은 함수**를 쓴다."""
    req = request.get_json(force=True, silent=True) or {}
    if 'root' not in req and 'teamRoot' not in req:
        return jsonify({'ok': False, 'message': 'root 또는 teamRoot 가 필요합니다.'}), 400
    try:
        out = _nas().set_roots(root=req.get('root'),
                               team_root=req.get('teamRoot') if 'teamRoot' in req else None)
        return jsonify(dict(out, ok=True))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 400


#  자료실 폴더 이름 — 앱 폴더 밑에 이 이름으로 있다(데이터).
NAS_DOCSTORE_FOLDER = '개발자료실'


def _docstore_autoconfig(nas, root, doc_root=''):
    """앱 폴더에서 **문서 저장소(UNC)** 경로를 만들어 저장한다. → (ok, doc_root, message)

    🗂 [2026-11-05] 왜 함수로 뺐나 — 팀원 PC 신고: "프로젝트 파일은 불러오는데 다른 NAS
       파일은 접속 못함". 둘은 **완전히 다른 길**이다:
         · 프로젝트 파일 = `/nas/app/*` → DSM REST API(HTTPS) → NAS 로그인만 되면 된다
         · 사양서·도면·자료실 = `/doc/*` → **윈도가 직접 읽는 SMB UNC** → 이 설정이 따로 필요
       그런데 이 4단계를 `🚀 간편 전환`(`/nas/setup`)만 밟고 있었다. 🔑 로그인 칸에서
       계정만 저장한 PC 는 DSM 은 붙고 자료실은 **경로가 빈 채로** 남는다 → 정확히 그 증상.
       → 두 입구가 **같은 함수**를 쓰게 한다(두 벌로 두면 또 갈라진다).
    ⚠️ 실패해도 NAS 전환 자체는 성공으로 본다 — 앱 데이터는 이미 NAS 를 보고 있고,
       자료실만 못 닿는 상태는 나중에 따로 고칠 수 있다(둘은 다른 설정이다).
    """
    doc_root = str(doc_root or '').strip()
    if not doc_root and root:
        doc_root = nas.unc_of(str(root).rstrip('/') + '/' + NAS_DOCSTORE_FOLDER)
    if not doc_root:
        return False, '', '앱 폴더가 정해져 있지 않아 자료실 경로를 만들지 못했습니다.'
    okp, perr = _docstore_probe_root(doc_root)
    if not okp:
        return False, doc_root, perr or '자료실 경로에 닿지 못했습니다.'
    cfg0 = _docstore_load()
    try:
        with open(DOCSTORE_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump({'root': doc_root, 'folders': cfg0['folders']}, f,
                      ensure_ascii=False, indent=2)
    except Exception as e:
        return False, doc_root, f'설정 저장 실패: {e}'
    _DOCSTORE_AUTH_BLOCK['code'] = 0
    _DOCSTORE_AUTH_BLOCK['message'] = ''
    return True, doc_root, doc_root


@app.route('/nas/docroot-auto', methods=['POST'])
def nas_docroot_auto():
    """앱 폴더 밑의 자료실 경로를 자동으로 맞춘다 — 🔑 로그인 저장이 부른다.

    이미 닿고 있으면 **아무것도 하지 않는다**(`changed:false`) — 사람이 손으로 정해 둔
    경로를 덮어쓰면 안 된다.
    """
    try:
        nas = _nas()
    except Exception as e:
        return jsonify({'ok': False, 'message': f'nas_dsm 로드 실패: {e}'}), 500
    req = request.get_json(force=True, silent=True) or {}
    cur = _docstore_load()
    if cur['root'] and not req.get('force'):
        okp, _perr = _docstore_probe_root(cur['root'])
        if okp:
            return jsonify({'ok': True, 'root': cur['root'], 'changed': False})
    # 🔑 두드리기 **전에** 자격증명을 다시 건다 — 자료실이 안 되는 가장 흔한 이유가
    #    "윈도에 그 서버 자격증명이 없다" 이고, 그건 여기서 걸어 줄 수 있다.
    #    ⚠️ 실패해도 멈추지 않는다 — 이미 탐색기에서 수동으로 걸어 둔 PC 는 그대로 된다.
    cred_msg = ''
    try:
        cfg = nas.load_config() or {}
        if cfg.get('host') and cfg.get('user'):
            cok, cmsg = _sync_docstore_smb_credential(
                cfg['host'], cfg['user'], _docstore_saved_password())
            if not cok:
                cred_msg = cmsg or ''
    except Exception as e:
        cred_msg = str(e)
    try:
        root, _team = nas.roots()
    except Exception as e:
        return jsonify({'ok': False, 'changed': False, 'message': str(e)})
    okd, doc_root, msg = _docstore_autoconfig(nas, root, req.get('docRoot') or '')
    if not okd and cred_msg:
        msg = (msg or '') + ' / ' + cred_msg
    return jsonify({'ok': bool(okd), 'root': doc_root, 'changed': bool(okd),
                    'message': '' if okd else msg})


@app.route('/nas/setup', methods=['POST'])
def nas_setup():
    """🚀 간편 전환 — **아이디·비밀번호만** 받고 나머지는 서버가 정한다. (2026-11-04)

    왜 한 라우트인가: 전환이 5단계(백엔드 업데이트 → NAS 로그인 → 앱 폴더 → 자료실 경로 →
    모드)였고, 팀원이 그 순서를 지켜야 했다. 중간에 하나만 빠뜨리면 "🗄️ 는 뜨는데 프로젝트가
    안 열린다" 같은 상태가 된다(2026-11-04 사고들이 전부 이 모양이었다). 순서를 사람이 아니라
    **코드가** 지킨다.

    ⚠️ 단계마다 결과를 `steps` 로 돌려준다 — "했다"가 아니라 **무엇이 됐고 무엇이 안 됐는지**를
       화면이 그대로 보여줘야 한다(CLAUDE.md "고쳤다"의 정의).
    ⚠️ 비밀번호는 POST 본문으로만 받고 응답·로그에 싣지 않는다.
    ⚠️ 로그인 실패는 `nas_dsm` 의 예산(기본 3회)이 관리한다 — 여기서 재시도하지 않는다.
    """
    req = request.get_json(force=True, silent=True) or {}
    steps = []
    try:
        _dflt = _nas().load_defaults()
    except Exception:
        _dflt = {}
    # 🔑 빈 칸은 팀 공용 기본값으로 메운다 — 팀원이 칠 것은 사번·비밀번호뿐이어야 한다.
    host = str(req.get('host') or _dflt.get('host') or '').strip()
    user = str(req.get('user') or '').strip()
    pw = req.get('password') or ''

    def step(name, ok, message='', **extra):
        steps.append(dict({'step': name, 'ok': bool(ok), 'message': message}, **extra))
        return steps[-1]

    try:
        nas = _nas()
    except Exception as e:
        return jsonify({'ok': False, 'steps': [{'step': 'module', 'ok': False,
                                                'message': f'nas_dsm 로드 실패: {e}'}]})
    if not host or not user:
        return jsonify({'ok': False, 'steps': [{'step': 'input', 'ok': False,
                                                'message': '주소와 아이디가 필요합니다.'}]}), 400
    https = bool(req.get('https', _dflt.get('https', True)))
    try:
        port = int(req.get('port') or _dflt.get('port') or (5001 if https else 5000))
    except Exception:
        return jsonify({'ok': False, 'steps': [{'step': 'input', 'ok': False,
                                                'message': '포트는 숫자여야 합니다.'}]}), 400

    # 1) 계정 저장 (잠금도 함께 풀린다 — 사람이 다시 시킨 것이므로)
    try:
        nas.save_config(host, port, https, user, pw)
        _sync_docstore_smb_credential(host, user, pw or _docstore_saved_password())
        step('config', True, f'{host}:{port} / {user}')
    except Exception as e:
        step('config', False, str(e))
        return jsonify({'ok': False, 'steps': steps})

    # 2) 로그인 — 한 번만. 실패하면 남은 횟수를 그대로 알려준다.
    lg = nas.login_once(otp=req.get('otp'))
    step('login', lg.get('ok'), lg.get('message') or '', budget=lg.get('budget'),
         code=lg.get('code'), result=lg.get('result'))
    if not lg.get('ok'):
        return jsonify({'ok': False, 'steps': steps, 'budget': lg.get('budget')})

    # 3) 앱 폴더 — 안 주면 찾아본다. 1건일 때만 스스로 정한다.
    root = str(req.get('root') or _dflt.get('root') or '').replace(chr(92), '/').strip()
    if not root:
        try:
            f = nas.find_app_folder()
            if len(f['hits']) == 1:
                root = f['hits'][0]
                step('find-root', True, f'{root} (폴더 {f["looked"]}곳 확인)')
            else:
                why = ('앱 폴더를 자동으로 찾지 못했습니다 — 아래에서 직접 골라주세요.'
                       if not f['hits'] else '같은 이름이 여러 곳에 있습니다 — 직접 골라주세요.')
                if f.get('truncated'):
                    # ⚠️ "없다"와 "덜 봤다"는 다른 사실이다 — 섞으면 사람이 엉뚱한 곳을 의심한다.
                    why += ' (폴더 %d곳까지만 확인했습니다)' % f['looked']
                step('find-root', False, why, hits=f['hits'])
                return jsonify({'ok': False, 'steps': steps, 'rootHits': f['hits']})
        except Exception as e:
            step('find-root', False, str(e))
            return jsonify({'ok': False, 'steps': steps})
    try:
        nas.set_roots(root=root)
        step('root', True, root)
    except Exception as e:
        step('root', False, str(e))
        return jsonify({'ok': False, 'steps': steps})

    # 4) 문서 저장소(사양서·도면) — 윈도가 직접 읽는 UNC 경로. 앱 폴더에서 만들어 쓴다.
    #    ⚠️ 여기서 실패해도 전환은 성공으로 본다 — 앱 데이터는 이미 NAS 를 보고 있고,
    #       자료실만 못 닿는 상태는 사람이 나중에 고칠 수 있다(둘은 다른 설정이다).
    #    ⚠️ 🔑 로그인 저장(`/nas/docroot-auto`)과 **같은 함수**를 쓴다 — 두 벌로 두면
    #       "간편 전환으로는 되는데 로그인만 저장하면 자료실이 안 된다"가 다시 생긴다.
    okd, doc_root, dmsg = _docstore_autoconfig(
        nas, root, str(req.get('docRoot') or _dflt.get('docRoot') or '').strip())
    if doc_root:
        step('docstore', okd, dmsg, root=doc_root)

    return jsonify({'ok': True, 'steps': steps, 'root': root,
                    'docRoot': doc_root, 'user': user,
                    'host': host, 'port': port, 'https': https})


@app.route('/nas/root-candidates', methods=['GET'])
def nas_root_candidates():
    """앱 폴더로 쓸 수 있는 곳. 로그인되어 있어야 한다(로그인 시도는 하지 않는다)."""
    try:
        # 폴더 이름(`KORTEK_PM`)은 **nas_dsm 한 곳**에만 있다 — 화면이 자기 문자열을 따로
        # 들고 있으면 이름을 바꿀 때 한쪽만 바뀌어 "대소문자가 다른 빈 폴더"가 생긴다
        # (2026-11-04 유령 `kortek_pm` 폴더 사고).
        return jsonify({'ok': True, 'items': _nas().writable_candidates(),
                        'appFolderNames': list(_nas().APP_FOLDER_NAMES)})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 403

@app.route('/nas/shares', methods=['GET'])
def nas_shares():
    """내 계정이 볼 수 있는 공유폴더. 권한 없는 공유는 애초에 안 나온다."""
    try:
        return jsonify({'ok': True, 'shares': _nas().list_shares()})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 403


@app.route('/nas/list', methods=['GET'])
def nas_list():
    path = request.args.get('path') or ''
    if not path.startswith('/'):
        return jsonify({'ok': False, 'message': '경로는 /로 시작해야 합니다.'}), 400
    try:
        return jsonify(dict(_nas().list_folder(path), ok=True))
    except Exception as e:
        # 권한 없음(105)도 여기로 온다 — 그건 오류가 아니라 **정상 동작**이므로 그대로 알린다.
        return jsonify({'ok': False, 'message': str(e)}), 403


@app.route('/nas/get', methods=['GET'])
def nas_get():
    path = request.args.get('path') or ''
    if not path.startswith('/'):
        return jsonify({'ok': False, 'message': '경로는 /로 시작해야 합니다.'}), 400
    try:
        data = _nas().download(path)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 403
    from flask import make_response
    resp = make_response(data)
    resp.headers['Content-Type'] = 'application/octet-stream'
    # 🛡️🛡️ [2026-11-04] **캐시 금지.** 이게 없어서 브라우저가 이 응답을 캐시했고,
    #   앱이 "읽고 → 고쳐서 → 통째로 다시 쓰는" 파일(project_index.json 등)에서
    #   **옛 사본 위에 쓰는** 일이 벌어졌다 — 그 사이 바뀐 내용이 오류 하나 없이
    #   되돌아간다(실측: 같은 순간 디스크 721,649 바이트 / 브라우저 489,543 바이트).
    #   그렇게 프로젝트 색인의 projects 가 통째로 0건이 됐다.
    #   ⚠️ 이 파일들은 작고 사내망이라 캐시해서 얻을 게 거의 없다 — 정확도가 먼저다.
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    return resp


# ── 앱 데이터 읽기·쓰기 (앱 루트 기준 **상대경로만**) ──────────────
#   ⚠️ 쓰기는 **절대경로를 받지 않는다.** 앱 루트 밖은 애초에 가리킬 수 없게 한다 —
#      프런트 버그 하나가 NAS 아무 폴더나 덮어쓰는 길을 만들지 않기 위해서다.
#      (읽기 `/nas/list`·`/nas/get` 은 조회라 절대경로를 받지만, 그쪽도 NAS ACL 이 막는다)
#   ⚠️ 사내 공유 경로가 **프런트 코드에 들어가지 않는다** — 프런트는 `_App_Config/...`,
#      `<팀>/project.json` 같은 상대경로만 쓰고, 실제 경로는 백엔드 설정에서 붙는다.
def _nas_target(src, allow_root=False):
    """{rel, team} → NAS 절대경로. 잘못된 입력은 (None, 메시지).

    ⚠️⚠️ `allow_root` 를 기본 False 로 둔 이유 — **빈 rel 은 앱 루트 전체**다.
       삭제에 빈 rel 이 들어오면 앱 데이터를 통째로 지운다. 그래서 **읽기(list/get)와
       임시폴더 청소(sweep)만** 루트를 허용하고, 쓰기·폴더생성·삭제는 계속 거부한다.
    ⚠️ 처음엔 모두 거부했는데, 그러면 **앱 루트 목록 조회가 400** 이라
       `_listProjectFiles`(루트 직속 프로젝트 파일)가 통째로 빈다. 실제로 검증에서 잡혔다
       (어댑터가 그걸 'ACL 거부'로 보고 조용히 건너뛰어서 더 나빴다, 2026-11-03).
    """
    rel = (src.get('rel') or '').strip()
    team = (src.get('team') or '').strip() or None
    if not rel and not team and not allow_root:
        return None, 'rel(앱 루트 기준 상대경로)이 필요합니다.'
    if rel.startswith('/'):
        return None, 'rel 은 앱 루트 기준 상대경로여야 합니다(/로 시작하지 않음).'
    try:
        return _nas().abs_path(rel, team=team), None
    except Exception as e:
        return None, str(e)


@app.route('/nas/paths', methods=['GET'])
def nas_paths():
    """앱 루트가 정해져 있는지 + 하위 배치 이름. 프런트가 경로를 만들 때 쓴다."""
    try:
        n = _nas()
        try:
            root, team_root = n.roots()
        except Exception as e:
            return jsonify({'ok': False, 'configured': False, 'message': str(e)})
        return jsonify({'ok': True, 'configured': True, 'root': root,
                        'teamRoot': team_root, 'teamSeparate': team_root != root,
                        'layout': dict(n._LAYOUT)})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'nas_dsm 로드 실패: {e}'})


@app.route('/nas/app/list', methods=['GET'])
def nas_app_list():
    # 앱 루트 목록은 정상 동작이다(루트 직속 프로젝트 파일)
    path, err = _nas_target(request.args, allow_root=True)
    if err:
        return jsonify({'ok': False, 'message': err}), 400
    try:
        return jsonify(dict(_nas().list_folder(path), ok=True))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 403


@app.route('/nas/app/get', methods=['GET'])
def nas_app_get():
    path, err = _nas_target(request.args, allow_root=True)
    if err:
        return jsonify({'ok': False, 'message': err}), 400
    try:
        data = _nas().download(path)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 404
    from flask import make_response
    resp = make_response(data)
    resp.headers['Content-Type'] = 'application/octet-stream'
    # 🛡️🛡️ [2026-11-04] **캐시 금지.** 이게 없어서 브라우저가 이 응답을 캐시했고,
    #   앱이 "읽고 → 고쳐서 → 통째로 다시 쓰는" 파일(project_index.json 등)에서
    #   **옛 사본 위에 쓰는** 일이 벌어졌다 — 그 사이 바뀐 내용이 오류 하나 없이
    #   되돌아간다(실측: 같은 순간 디스크 721,649 바이트 / 브라우저 489,543 바이트).
    #   그렇게 프로젝트 색인의 projects 가 통째로 0건이 됐다.
    #   ⚠️ 이 파일들은 작고 사내망이라 캐시해서 얻을 게 거의 없다 — 정확도가 먼저다.
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    return resp


# ═══════════════════════════════════════════════════════════════════════════
# 🛡 색인 쓰기 가드 — "항목은 그 파일이 **정말 없을 때만** 지울 수 있다"
#
#   왜 백엔드인가 — `project_index.json` 은 **전사 공용 파일**이고, 옛 js 가 돌고
#   있는 탭이 유령 정리로 **살아 있는 프로젝트의 항목을 지운다**(2026-11-09 실측:
#   16:43:39 에 두 건이 사라졌고, 되살려도 5분 뒤 또 지워졌다). 프런트 가드
#   (`guardIndexWrite`, js/57)는 그 탭이 **그냥 비켜 간다** — 모든 PC 가 반드시
#   지나는 자리는 이 라우트 하나뿐이다.
#
#   항목이 사라지면 **오류가 안 난다** — 목록에서 담당자·팀·색이 빈 "미지정"이 되고
#   메일 자동배분 색인이 조용히 줄어든다. 사람이 알아챌 방법이 없으니 막는 쪽이 맞다.
#
# ⚡ 속도 — 이 가드는 **그 한 파일**에만 돈다(다른 쓰기는 문자열 비교 하나 늘 뿐).
#    흔한 경우(떨어진 항목 0건)는 색인 읽기 1회로 끝나고(실측 792KB · 111ms),
#    id 지도 읽기(124KB · 71ms)와 NAS 존재 확인은 **떨어진 항목이 있을 때만** 한다.
#    앱은 이 쓰기를 기다리지 않고(js/04c `updateProjectIndexEntry` 는 fire-and-forget)
#    저장의 ~70%는 색인 갱신을 아예 건너뛴다 → 사람이 기다리는 시간은 안 늘어난다.
#
# ⚠️ 약속은 **좁게** 한다 — "파일이 살아 있는 걸 **볼 수 있는** 항목"만 지킨다.
#    id 를 경로로 못 풀면 지우도록 **둔다**(안 그러면 진짜 유령이 영영 안 지워진다).
# ⚠️ 판단이 안 되면(색인 모양 아님·읽기 실패) **아무것도 하지 않는다** — 읽기 실패
#    한 번이 모든 PC 의 저장을 멈추면 그게 더 나쁘다.
# ═══════════════════════════════════════════════════════════════════════════
PROJECT_INDEX_REL = 'App_Config/project_index.json'
NAS_ID_MAP_REL    = 'App_Config/nas_id_map.json'


def _index_entry_rel(fid, id_map):
    """색인 항목의 `drive_file_id` → 앱 루트 기준 상대경로. 모르면 ''.

    어댑터(js/57 `relOf`)와 같은 규칙 — 지도에 있으면 그걸, `nas_f_` 면 풀어서.
    """
    fid = str(fid or '')
    if not fid:
        return ''
    if id_map.get(fid):
        return str(id_map[fid])
    if fid.startswith('nas_f_'):
        s = fid[6:]
        try:
            return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4)).decode('utf-8')
        except Exception:
            return ''
    return ''


def _guard_project_index_write(data):
    """색인 쓰기를 검사한다 → (고친 바이트 or None, 안내 dict or None).

    살아 있는 파일의 항목을 떨어뜨리려 하면 **되살려 넣은** 바이트를 돌려준다.
    """
    try:
        incoming = json.loads(data.decode('utf-8'))
    except Exception:
        return None, None                      # 색인 모양이 아니다 — 우리 일이 아니다
    if not isinstance(incoming, dict) or not isinstance(incoming.get('projects'), list):
        return None, None
    nas = _nas()
    try:
        cur = json.loads(nas.download(nas.abs_path(PROJECT_INDEX_REL)).decode('utf-8'))
    except Exception:
        return None, None                      # 아직 없거나 못 읽었다 — 비교 불가
    if not isinstance(cur, dict) or not isinstance(cur.get('projects'), list):
        return None, None
    new_ids = set()
    for p in incoming['projects']:
        if isinstance(p, dict):
            new_ids.add(str(p.get('drive_file_id')))
    dropped = [p for p in cur['projects']
               if isinstance(p, dict) and str(p.get('drive_file_id')) not in new_ids]
    if not dropped:
        return None, None                      # ⚡ 흔한 길 — 여기서 끝난다(읽기 1회)

    try:
        id_map = (json.loads(nas.download(nas.abs_path(NAS_ID_MAP_REL)).decode('utf-8'))
                  or {}).get('map') or {}
    except Exception:
        id_map = {}
    by_rel = {}
    for p in dropped:
        r = _index_entry_rel(p.get('drive_file_id'), id_map)
        if r:
            by_rel.setdefault(r, []).append(p)
    if not by_rel:
        return None, {'dropped': len(dropped), 'restored': 0,
                      'note': '떨어진 항목의 경로를 몰라 확인하지 못했습니다.'}

    abs_of = {}
    for r in by_rel:
        try:
            abs_of[r] = nas.abs_path(r)
        except Exception:
            pass
    try:
        alive = set()
        for i in nas.path_info(list(abs_of.values())):
            if not i.get('isdir') and i.get('path'):
                alive.add(str(i['path']))
    except Exception as e:
        return None, {'dropped': len(dropped), 'restored': 0,
                      'note': 'NAS 존재 확인에 실패해 검사하지 못했습니다: %s' % e}

    back = []
    for r, entries in by_rel.items():
        if abs_of.get(r) in alive:
            back.extend(entries)
    if not back:
        return None, {'dropped': len(dropped), 'restored': 0}

    incoming['projects'] = list(incoming['projects']) + back
    names = [str(p.get('file_name') or p.get('drive_file_id')) for p in back]
    try:
        app.logger.warning('[색인 가드] 살아 있는 파일의 항목 %d건을 되살렸습니다: %s',
                           len(back), ', '.join(names[:6]))
    except Exception:
        pass
    return json.dumps(incoming, ensure_ascii=False).encode('utf-8'), {
        'dropped': len(dropped), 'restored': len(back), 'restoredNames': names[:20],
        'note': '파일이 살아 있는 항목을 지우려 해서 되살려 넣었습니다 — '
                '옛 버전 앱이 열려 있을 수 있습니다(새로고침하세요).'}


@app.route('/nas/app/put', methods=['POST'])
def nas_app_put():
    """원자적 쓰기. 본문 JSON: {rel, team?, text} 또는 {rel, team?, b64}.

    ⚠️ `nas_dsm.put` 이 쓴 뒤 **정말 그 자리에 있는지 확인**하고 돌려준다 —
       "저장했다"고 말했는데 안 된 상태를 만들지 않는다(2026-11-03 사고 대응).
    """
    req = request.get_json(force=True, silent=True) or {}
    path, err = _nas_target(req)
    if err:
        return jsonify({'ok': False, 'message': err}), 400
    if 'text' in req:
        data = str(req.get('text') or '').encode('utf-8')
    elif 'b64' in req:
        try:
            data = base64.b64decode(req.get('b64') or '')
        except Exception as e:
            return jsonify({'ok': False, 'message': f'b64 디코드 실패: {e}'}), 400
    else:
        return jsonify({'ok': False, 'message': 'text 또는 b64 가 필요합니다.'}), 400
    # 🛡 색인은 "파일이 살아 있는 항목"을 못 지운다 — 그 한 파일만 검사한다(위 주석).
    guard = None
    if (req.get('rel') or '').strip() == PROJECT_INDEX_REL and not (req.get('team') or '').strip():
        try:
            fixed, guard = _guard_project_index_write(data)
            if fixed is not None:
                data = fixed
        except Exception as e:                 # 가드가 터져도 저장은 막지 않는다
            guard = {'error': str(e)}
    try:
        res = dict(_nas().put(path, data), rel=req.get('rel'))
        if guard:
            res['guard'] = guard
        return jsonify(res)
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/nas/app/mkdir', methods=['POST'])
def nas_app_mkdir():
    req = request.get_json(force=True, silent=True) or {}
    path, err = _nas_target(req)
    if err:
        return jsonify({'ok': False, 'message': err}), 400
    try:
        return jsonify({'ok': True, 'path': _nas().ensure_folder(path)})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/nas/app/delete', methods=['POST'])
def nas_app_delete():
    """삭제는 되돌릴 수 없다 — 사람 확인은 **부르는 쪽**이 받는다.
    `nas_dsm.remove` 가 지운 뒤 확인하고, 남아 있으면 정직하게 실패한다."""
    req = request.get_json(force=True, silent=True) or {}
    path, err = _nas_target(req)
    if err:
        return jsonify({'ok': False, 'message': err}), 400
    try:
        return jsonify(_nas().remove(path))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/nas/app/rename', methods=['POST'])
def nas_app_rename():
    """폴더 **이름만** 바꾼다(내용은 그대로) — 프로젝트를 "고객사>프로젝트명" 등을 고쳐
    다시 저장하면 CUSTOMER/DOCUMENT/MC/… 아래 프로젝트별 하위 폴더 이름도 같이 옮기기 위함
    (2026-11-11, "프로젝트명을 바꾸면 폴더명도 자동으로 바뀌면 좋겠다" 요청).

    본문 JSON: {rel, team?, newName}. `rel` 은 **지금 이름의** 폴더(앱 루트 기준 상대경로),
    `newName` 은 **그 자리에 올 새 마지막 이름 하나**(경로 구분자 금지 — 한 단계만 바꾼다).

    ⚠️ 겹치면(그 새 이름의 폴더가 이미 있으면) **덮지 않고 거부한다** — 합치기는 다른 일이고,
       사람이 눈으로 보고 정리할 문제다.
    ⚠️ 원래 폴더가 없으면(그 프로젝트가 그 자료를 아직 안 올렸다) **성공으로 둔다** —
       옮길 게 없을 뿐이지 오류가 아니다.
    ⚠️ `nas_dsm.rename` 이 바꾼 뒤 **정말 그 이름으로 있는지 확인**한다.
    """
    req = request.get_json(force=True, silent=True) or {}
    path, err = _nas_target(req)
    if err:
        return jsonify({'ok': False, 'message': err}), 400
    new_name = str(req.get('newName') or '').strip()
    if not new_name or '/' in new_name or chr(92) in new_name:
        return jsonify({'ok': False, 'message': '새 이름이 비었거나 경로 구분자를 담고 있습니다.'}), 400
    nas = _nas()
    try:
        if not nas.exists(path):
            return jsonify({'ok': True, 'skipped': 'source-missing', 'path': path})
        parent = path.rstrip('/').rsplit('/', 1)[0]
        dest = parent + '/' + new_name
        if dest != path and nas.exists(dest):
            return jsonify({'ok': False, 'collision': True, 'dest': dest,
                            'message': '이미 그 이름의 폴더가 있어 덮어쓰지 않았습니다: ' + dest}), 409
        new_path = nas.rename(path, new_name)
        return jsonify({'ok': True, 'from': path, 'to': new_path})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/nas/app/open-native', methods=['POST'])
def nas_app_open_native():
    """NAS 원본을 **그 자리에서** 연결 프로그램으로 연다(사진 뷰어·PDF·엑셀).

    ⚠️ 왜 이 길이 기본인가 — 브라우저로 여는 길은 `blob:` URL 이라 **파일 이름을 못 싣는다.**
       2026-11-05 실사용 신고: 일일보고 첨부를 누르니 `242b6110-c875-…`(확장자 없음)로
       받아졌다. 이름이 필요하면 `<a download>` 로 내려받는 수밖에 없는데, 사람이 원한 건
       "받기"가 아니라 "보기"였다.
    ⚠️ 경로는 `/nas/app/put` 과 **같은 `_nas_target`** 으로 앱 루트 안으로 한정한다 —
       임의 경로를 받으면 이 라우트가 곧 "아무 파일이나 실행"이 된다(`..` 는 nas_dsm 이 거부).
    ⚠️ Windows + SMB 전용. 공유가 안 보이면 404 로 정직하게 실패하고, 부르는 쪽이
       브라우저로 되돌린다(여기서 조용히 성공을 돌려주면 "눌렀는데 아무 일도 안 난다"가 된다).
    """
    if not hasattr(os, 'startfile'):
        return jsonify({'ok': False, 'message': '이 기능은 Windows 에서만 됩니다.'}), 400
    req = request.get_json(force=True, silent=True) or {}
    path, err = _nas_target(req)
    if err:
        return jsonify({'ok': False, 'message': err}), 400
    try:
        unc = _nas().unc_of(path)
    except Exception as e:
        return jsonify({'ok': False, 'message': 'UNC 경로를 만들지 못했습니다: %s' % e}), 500
    if not unc:
        return jsonify({'ok': False, 'message': 'NAS 설정(호스트)이 없어 경로를 만들지 못했습니다.'}), 400
    if not os.path.isfile(unc):
        return jsonify({'ok': False, 'message': '그 파일이 공유에서 안 보입니다: %s'
                        % os.path.basename(unc)}), 404
    try:
        os.startfile(unc)        # noqa: S606 — 위에서 앱 루트 안의 파일로 한정했다
    except Exception as e:
        return jsonify({'ok': False, 'message': '열지 못했습니다: %s' % e}), 500
    return jsonify({'ok': True, 'rel': req.get('rel')})


@app.route('/nas/app/sweep', methods=['POST'])
def nas_app_sweep():
    """`.ganttput-*` 임시 폴더 청소. 프로세스가 중간에 죽으면 남는다(실측).

    ⚠️ 쓰는 중인 폴더는 건드리지 않는다 — 내 태그이거나, **비어 있고 오래된** 것만 지운다.
       (팀원 PC 들이 각자 쓰므로 "전부 지우기"는 절대 하지 않는다)
    """
    req = request.get_json(force=True, silent=True) or {}
    path, err = _nas_target(req, allow_root=True)   # 루트의 임시폴더도 치운다
    if err:
        return jsonify({'ok': False, 'message': err}), 400
    # staleSec: "비어 있고 이만큼 오래된" 것만 지운다. 기본 10분.
    #   0 으로 내려도 안전한 이유 — 업로드가 `create_parents=true` 라, 다른 프로세스의
    #   임시 폴더를 지워도 그쪽의 다음 업로드가 **폴더를 다시 만든다**(실측 확인).
    try:
        stale = int(req.get('staleSec', 600))
    except Exception:
        stale = 600
    try:
        return jsonify(dict(_nas().cleanup_tmpdirs(path, stale_sec=max(0, stale)), ok=True))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


# ══════════════════════════════════════════════════════════════
# 🧹 임시 폴더 자동 청소 (2026-11-09, 사용자 요청)
# ══════════════════════════════════════════════════════════════
#  왜 — `/nas/app/sweep` 라우트는 있었는데 **부르는 곳이 한 곳도 없었다**(프런트 0 · 백엔드 0).
#  그래서 5일 만에 `.ganttput-*` 가 154개 쌓였다(실측, 하루 30개꼴). 사람이 기억해서
#  눌러야 하는 청소는 결국 아무도 안 누른다 — 그게 "쌓이는 것"의 본질이다.
#
#  ⚠️ 지우는 규칙은 **건드리지 않는다** — `nas_dsm.cleanup_tmpdirs` 가 "내 태그" 이거나
#     "**비어 있고** stale_sec 보다 오래된" 것만 지운다. 쓰는 중인 폴더는 1초 미만만
#     파일을 들고 있으므로, 비었고 오래됐으면 쓰는 중일 수 없다. 자동화한다고 해서
#     그 보수적인 판정을 느슨하게 하지 않는다(느슨하게 하면 남의 업로드를 깬다).
#  ⚠️ **팀원 PC 마다 다 돌아도 된다** — 지우기가 멱등이고(이미 지워진 건 kept 로 떨어진다),
#     혹시 남의 임시 폴더를 지워도 그쪽의 다음 업로드가 `create_parents` 로 다시 만든다
#     (위 sweep 라우트 주석의 실측). 그래서 "담당 PC 한 대" 같은 설정을 두지 않는다 —
#     설정이 필요하면 그 PC 가 꺼진 날엔 아무도 안 치운다.
#  ⚠️ 하루 1회. 폴더를 **깊이 2까지만** 훑는다(실측: 임시 폴더가 나온 곳이 전부 그 안이다).
#     깊이·간격·상한은 전부 데이터다 — 코드에 박지 말 것.
NAS_TMP_SWEEP = {
    'enabled':    True,
    'depth':      2,      # 앱 루트에서 몇 단계까지 훑나(0 = 루트만)
    'staleSec':   600,    # 비어 있고 이만큼(초) 오래된 것만 지운다
    'maxFolders': 300,    # 한 번에 훑을 폴더 수 상한(폭주 방지)
}
_nas_tmp_sweep_last_date = None


def _nas_tmp_sweep_folders(depth, max_folders):
    """앱 루트 아래 폴더를 `depth` 단계까지 모은다(앱 루트 자신 포함).

    ⚠️ `.ganttput-*` 자신은 **안 들어간다** — 치울 대상이지 뒤질 곳이 아니다.
    """
    nas = _nas()
    out, frontier = [''], ['']
    for _ in range(max(0, int(depth))):
        nxt = []
        for rel in frontier:
            if len(out) >= max_folders:
                break
            try:
                items = nas.list_folder(nas.abs_path(rel))['items']
            except Exception:
                continue                      # 권한 없는 폴더는 건너뛰고 계속(ACL 은 정상 동작)
            for it in items:
                if not it.get('isdir') or str(it.get('name', '')).startswith('.ganttput-'):
                    continue
                child = (rel + '/' + it['name']) if rel else it['name']
                out.append(child)
                nxt.append(child)
                if len(out) >= max_folders:
                    break
        frontier = nxt
        if not frontier:
            break
    return out[:max_folders]


def nas_tmp_sweep_all(depth=None, stale_sec=None, max_folders=None, dry_run=False):
    """앱 루트 아래 임시 폴더를 한 번에 치운다. 틱과 라우트가 **같은 함수**를 쓴다
    (두 벌로 두면 한쪽만 고쳐져 조용히 갈라진다 — 이 저장소의 반복 교훈)."""
    cfg = NAS_TMP_SWEEP
    depth = cfg['depth'] if depth is None else int(depth)
    stale_sec = cfg['staleSec'] if stale_sec is None else max(0, int(stale_sec))
    max_folders = cfg['maxFolders'] if max_folders is None else int(max_folders)
    nas = _nas()
    rep = {'folders': 0, 'removed': 0, 'kept': 0, 'errors': [], 'dryRun': bool(dry_run), 'detail': []}
    for rel in _nas_tmp_sweep_folders(depth, max_folders):
        try:
            path = nas.abs_path(rel)
            if dry_run:
                # 미리보기 — 지우지 않고 "임시 폴더가 몇 개 있나"만 센다
                n = len([x for x in nas.list_folder(path)['items']
                         if x.get('isdir') and str(x.get('name', '')).startswith('.ganttput-')])
                rep['folders'] += 1
                if n:
                    rep['detail'].append({'rel': rel or '(앱 루트)', 'found': n})
                continue
            r = nas.cleanup_tmpdirs(path, stale_sec=stale_sec)
            rep['folders'] += 1
            rep['removed'] += len(r.get('removed') or [])
            rep['kept'] += len(r.get('kept') or [])
            if r.get('removed'):
                rep['detail'].append({'rel': rel or '(앱 루트)',
                                      'removed': len(r['removed']), 'kept': len(r.get('kept') or [])})
        except Exception as e:
            # ⚠️ 삼키지 않는다 — 조용히 건너뛰면 "원래 없는 것" 과 구분이 안 된다
            rep['errors'].append('%s — %s' % (rel or '(앱 루트)', e))
    return rep


def _nas_tmp_sweep_tick():
    """하루 1회 — `_scheduler_loop()` 의 1분 루프에 얹혀서 불린다(새 스레드 안 띄움).

    ⚠️ NAS 에 로그인돼 있지 않으면 **아무것도 하지 않는다** — 백그라운드 루프가
       로그인을 시도하면 실패가 쌓여 IP 가 차단된다(그룹웨어·SAP 과 같은 규칙).
       그래서 '오늘 돌았다' 표시도 **실제로 돈 날에만** 찍는다.
    """
    global _nas_tmp_sweep_last_date
    if not NAS_TMP_SWEEP.get('enabled'):
        return
    today = datetime.now(KST).date()
    if _nas_tmp_sweep_last_date == today:
        return
    try:
        if not (_nas().status() or {}).get('loggedIn'):
            return                      # 로그인 전 — 날짜를 찍지 않는다(붙으면 그날 바로 돈다)
    except Exception:
        return
    _nas_tmp_sweep_last_date = today
    rep = nas_tmp_sweep_all()
    if rep['removed'] or rep['errors']:
        print('[NAS 임시폴더 청소] %d개 삭제 · %d개 유지(사용 중) · 폴더 %d곳%s'
              % (rep['removed'], rep['kept'], rep['folders'],
                 (' · 실패 %d건' % len(rep['errors'])) if rep['errors'] else ''))


@app.route('/nas/app/sweep-all', methods=['POST'])
def nas_app_sweep_all():
    """앱 루트 아래를 한 번에 청소. `dryRun: true` 면 지우지 않고 대상만 센다."""
    req = request.get_json(force=True, silent=True) or {}
    try:
        return jsonify(dict(nas_tmp_sweep_all(depth=req.get('depth'),
                                              stale_sec=req.get('staleSec'),
                                              max_folders=req.get('maxFolders'),
                                              dry_run=bool(req.get('dryRun'))), ok=True))
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


@app.route('/doc/config', methods=['GET'])
def doc_config_get():
    cfg = _docstore_load()
    ok = bool(cfg['root']) and os.path.isdir(cfg['root'])
    # 앱 폴더는 설정에 없어도 목록에 넣어 돌려준다 — 안 그러면 PC마다 고르기 창의 탭이 달라진다.
    folders = list(cfg['folders']) + [f for f in DOCSTORE_APP_FOLDERS if f not in cfg['folders']]
    return jsonify({'ok': True, 'configured': bool(cfg['root']), 'reachable': ok,
                    'root': cfg['root'], 'folders': folders})


@app.route('/doc/config', methods=['POST'])
def doc_config_set():
    req = request.get_json(force=True, silent=True) or {}
    root = str(req.get('root') or '').strip()
    folders = [str(x).strip() for x in (req.get('folders') or []) if str(x).strip()]
    # 사람이 설정을 다시 저장하는 건 "고쳤으니 다시 해 봐"라는 뜻이다 — 자격증명 잠금을 푼다.
    _DOCSTORE_AUTH_BLOCK['code'] = 0
    _DOCSTORE_AUTH_BLOCK['message'] = ''
    if root:
        ok, perr = _docstore_probe_root(root)
        if not ok:
            return jsonify({'ok': False, 'error': perr}), 400
    try:
        with open(DOCSTORE_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump({'root': root, 'folders': folders}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'설정 저장 실패: {e}'}), 500
    return jsonify({'ok': True, 'root': root, 'folders': folders})


@app.route('/doc/list', methods=['GET'])
def doc_list():
    """폴더 안 파일 목록. since(ISO)를 주면 그 이후 수정분만 — 자동 등록 스캔용."""
    cfg = _docstore_load()
    folder = request.args.get('folder') or ''
    path, err = _docstore_dir(folder, cfg)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    since = (request.args.get('since') or '').strip()
    since_ts = 0.0
    if since:
        try:
            since_ts = datetime.fromisoformat(since.replace('Z', '+00:00')).timestamp()
        except Exception:
            since_ts = 0.0
    # ⚡ [2026-10-22] 파일 198개짜리 폴더가 **7초** 걸렸다(실측). 파일마다 SMB 왕복을 세 번씩
    #    했기 때문이다 — os.path.isfile + os.stat + 텍스트 캐시 os.path.isfile.
    #    os.scandir 은 디렉터리를 읽을 때 같이 받아 둔 정보를 재사용하므로 왕복이 사라지고,
    #    텍스트 캐시는 파일마다 묻지 않고 **한 번에 목록으로** 받아 집합으로 맞춘다.
    #    ⚠️ 네트워크 공유에서는 "파일 하나당 호출 하나"가 곧 체감 지연이다.
    text_dir = os.path.join(cfg['root'], DOCSTORE_TEXT_DIR)
    try:
        cached_texts = set(os.listdir(text_dir))
    except Exception:
        cached_texts = set()          # 캐시 폴더가 없으면 전부 '없음'으로 — 목록 자체는 내보낸다
    text_prefix = _doc_text_key(folder) + '__'
    out = []
    dirs = []
    try:
        with os.scandir(path) as it:
            scanned = list(it)
        # 📁 [2026-10-26] 하위 폴더도 같이 내려준다 — 사람이 NAS에서 직접 만든 폴더를 앱이
        #    탐색기처럼 읽어 보여주기 위해서다(프로젝트 아래 전기/기구 구분 등). `_`/`.`로 시작하는
        #    이름은 캐시·staging 같은 내부용 자리라 숨긴다.
        dir_entries = [e for e in scanned if e.is_dir() and not e.name.startswith(('.', '_'))]
        for e in sorted(dir_entries, key=lambda x: x.name):
            dirs.append({'name': e.name})
        file_entries = [e for e in scanned if e.is_file()]
        for e in sorted(file_entries, key=lambda x: x.name):
            st = e.stat()
            if since_ts and st.st_mtime <= since_ts:
                continue
            out.append({
                'name': e.name,
                'size': st.st_size,
                'mtime': datetime.fromtimestamp(st.st_mtime).isoformat(timespec='seconds'),
                # 추출 텍스트 캐시가 이미 있는지 — 프런트가 재추출 여부를 판단한다
                'hasText': (text_prefix + e.name + '.txt') in cached_texts
            })
    except Exception as e:
        return jsonify({'ok': False, 'error': f'목록 조회 실패: {e}'}), 500
    return jsonify({'ok': True, 'folder': folder, 'count': len(out), 'files': out, 'dirs': dirs})


@app.route('/doc/mkdir', methods=['POST'])
def doc_mkdir():
    """하위 폴더 만들기(탐색기의 '새 폴더'). `_docstore_dir`가 이미 없는 폴더를 만들어 주므로
    여기선 경로를 조립해 그 함수에 넘기기만 한다 — 생성 로직을 따로 두지 않는다."""
    req = request.get_json(force=True, silent=True) or {}
    parent = str(req.get('folder') or '').strip()
    name = _docstore_safe_name(req.get('name'))
    if not name:
        return jsonify({'ok': False, 'error': '폴더 이름이 올바르지 않습니다.'}), 400
    full = (parent.rstrip('/') + '/' + name) if parent else name
    _, err = _docstore_dir(full)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    return jsonify({'ok': True, 'folder': full})


@app.route('/doc/rename', methods=['POST'])
def doc_rename():
    """프로젝트별 하위 폴더 이름만 바꾼다(`os.rename`, 같은 공유 안이라 원자적) — 사람이
    "고객사>프로젝트명" 등을 고쳐 다시 저장하면 CUSTOMER/<프로젝트>·DOCUMENT/<프로젝트>·
    MC/<프로젝트>·SUMMARY/<프로젝트> 가 **새 이름의 폴더**로 조용히 갈라지던 것을
    고치기 위해서다(2026-11-11, "프로젝트명을 바꾸면 폴더명도 자동 변경" 요청).

    본문 JSON: {folder, newName}. `folder` 는 **지금 이름의** 하위 폴더(예:
    'CUSTOMER/LNW_27.0'), `newName` 은 그 자리에 올 새 마지막 이름 하나(경로 구분자 금지).

    ⚠️ `_docstore_dir` 를 쓰지 않는다 — 그건 **없는 폴더를 만들어 버린다**(새 글 쓸 때는
       맞는 동작이지만, 여기서는 "없다"가 "아직 그 자료를 안 올렸다"는 정상 상태다).
    ⚠️ 새 이름의 폴더가 **이미 있으면 덮지 않고 거부한다**(409) — 합치기는 사람이 볼 일.
    """
    cfg = _docstore_load()
    req = request.get_json(force=True, silent=True) or {}
    folder = str(req.get('folder') or '').strip()
    # ⚠️ `_docstore_safe_name` 은 경로가 섞여 들어오면 **조용히 basename만 남긴다**
    #    (업로드 파일명엔 맞는 동작) — 여기선 그 조용한 축약이 "다른 이름으로 바뀌었다"는
    #    조용한 오답이 되므로, 구분자가 있으면 **먼저 거부한다**.
    raw_new_name = str(req.get('newName') or '')
    if '/' in raw_new_name or '\\' in raw_new_name:
        return jsonify({'ok': False, 'error': '새 이름에 경로 구분자를 넣을 수 없습니다: ' + raw_new_name}), 400
    new_name = _docstore_safe_name(raw_new_name)
    if not new_name:
        return jsonify({'ok': False, 'error': '새 이름이 올바르지 않습니다.'}), 400
    segs, err = _docstore_folder_segs(folder, cfg)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    root = cfg.get('root') or ''
    if not root:
        return jsonify({'ok': False, 'error': '문서 저장소 경로가 설정되지 않았습니다.'}), 400
    ok, err = _docstore_probe_root(root)
    if not ok:
        return jsonify({'ok': False, 'error': err}), 400
    src = os.path.join(root, *segs)
    if not os.path.isdir(src):
        return jsonify({'ok': True, 'skipped': 'source-missing', 'folder': folder})
    dest = os.path.join(root, *(segs[:-1] + [new_name]))
    if os.path.normcase(os.path.abspath(dest)) != os.path.normcase(os.path.abspath(src)) \
            and os.path.exists(dest):
        return jsonify({'ok': False, 'collision': True,
                        'error': f'이미 그 이름의 폴더가 있어 덮어쓰지 않았습니다: {new_name}'}), 409
    try:
        os.rename(src, dest)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'폴더 이름 바꾸기 실패: {e}'}), 500
    return jsonify({'ok': True, 'from': '/'.join(segs), 'to': '/'.join(segs[:-1] + [new_name])})


@app.route('/doc/get', methods=['GET'])
def doc_get():
    """원본 파일 그대로 — 프런트가 pdf.js/XLSX로 읽거나 새 창으로 연다."""
    folder = request.args.get('folder') or ''
    path, err = _docstore_dir(folder)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    name = _docstore_safe_name(request.args.get('name'))
    if not name:
        return jsonify({'ok': False, 'error': '파일 이름이 올바르지 않습니다.'}), 400
    fp = os.path.join(path, name)
    if not os.path.isfile(fp):
        return jsonify({'ok': False, 'error': f'파일이 없습니다: {name}'}), 404
    return send_file(fp, as_attachment=False, download_name=name)


@app.route('/doc/open-native', methods=['POST'])
def doc_open_native():
    """NAS 원본을 **그 자리에서** 연결 프로그램(엑셀·PDF뷰어 등)으로 연다 — /doc/mail-launch와
    같은 이유: 브라우저 새 탭은 받아서 보여주는 것뿐이라 편집은 못 한다. 이 백엔드는 그 PC에서
    돌고 NAS를 직접 보므로 `os.startfile`로 원본을 바로 띄울 수 있다(다운로드 사본 없음).

    ⚠️ 경로는 `folder`/`name`을 기존 `/doc/get`과 똑같이 화이트리스트+`_docstore_safe_name`으로
       검증한다 — 임의 경로를 받으면 이 라우트가 곧 '아무 프로그램이나 실행'이 된다.
    ⚠️ Windows 전용(os.startfile).
    """
    if not hasattr(os, 'startfile'):
        return jsonify({'ok': False, 'error': '이 기능은 Windows에서만 됩니다.'}), 400
    cfg = _docstore_load()
    req = request.get_json(force=True, silent=True) or {}
    folder = str(req.get('folder') or '')
    path, err = _docstore_dir(folder, cfg)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    name = _docstore_safe_name(req.get('name'))
    if not name:
        return jsonify({'ok': False, 'error': '파일 이름이 올바르지 않습니다.'}), 400
    fp = os.path.join(path, name)
    if not os.path.isfile(fp):
        return jsonify({'ok': False, 'error': f'파일이 없습니다: {name}'}), 404
    try:
        os.startfile(fp)          # noqa: S606 — 위에서 화이트리스트 폴더 안 파일로 한정했다
    except Exception as e:
        return jsonify({'ok': False, 'error': f'열지 못했습니다: {e}'}), 500
    return jsonify({'ok': True, 'folder': folder, 'name': name})


@app.route('/doc/put', methods=['POST'])
def doc_put():
    """업로드. 같은 이름이 있으면 기본은 거부 — 덮어쓰려면 overwrite=1.
    ⚠️ 팀 공유라 남의 파일을 조용히 덮어쓰면 복구가 어렵다."""
    folder = request.args.get('folder') or ''
    path, err = _docstore_dir(folder)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    f = request.files.get('file')
    if not f:
        return jsonify({'ok': False, 'error': '파일이 없습니다(form-data의 file 필드).'}), 400
    name = _docstore_safe_name(request.args.get('name') or f.filename)
    if not name:
        return jsonify({'ok': False, 'error': '파일 이름이 올바르지 않습니다.'}), 400
    fp = os.path.join(path, name)
    if os.path.isfile(fp) and (request.args.get('overwrite') or '') not in ('1', 'true', 'yes'):
        return jsonify({'ok': False, 'error': f'같은 이름의 파일이 이미 있습니다: {name}', 'exists': True}), 409
    try:
        f.save(fp)
        st = os.stat(fp)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'저장 실패: {e}'}), 500
    return jsonify({'ok': True, 'folder': folder, 'name': name, 'size': st.st_size})


@app.route('/doc/delete', methods=['POST'])
def doc_delete():
    """파일 하나 삭제 — 되돌릴 수 없다(팀 공유 NAS). 이름 규칙은 업로드와 같다."""
    cfg = _docstore_load()
    req = request.get_json(force=True, silent=True) or {}
    folder = str(req.get('folder') or '')
    path, err = _docstore_dir(folder, cfg)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    name = _docstore_safe_name(req.get('name'))
    if not name:
        return jsonify({'ok': False, 'error': '파일 이름이 올바르지 않습니다.'}), 400
    fp = os.path.join(path, name)
    if not os.path.isfile(fp):
        return jsonify({'ok': False, 'error': f'파일이 없습니다: {name}'}), 404
    try:
        os.remove(fp)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'삭제 실패: {e}'}), 500
    return jsonify({'ok': True, 'folder': folder, 'name': name})


@app.route('/doc/rmdir', methods=['POST'])
def doc_rmdir():
    """**빈** 하위 폴더 하나만 지운다 — 되돌릴 수 없다. 안에 파일이든 하위 폴더든 하나라도
    있으면 거부한다(그 안의 것까지 통째로 날리는 사고를 막으려고 일부러 `os.rmdir` 만 쓴다 —
    비어 있지 않으면 OS 가 스스로 실패해 준다). 없는 폴더를 만들지 않는다
    (`_docstore_existing_dir` — `_docstore_dir` 와 달리 makedirs 를 안 한다).

    2026-11-11: ADDRESS 가 프로젝트별 하위 폴더로 나뉘던 버그를 고치고 나니, 그 버그가
    예전에 만들어 둔 빈 폴더(ADDRESS/<프로젝트명>)들이 그대로 남아 있었다 — 그걸 치우는 데 쓴다.
    """
    cfg = _docstore_load()
    req = request.get_json(force=True, silent=True) or {}
    folder = str(req.get('folder') or '').strip()
    root = cfg.get('root') or ''
    if not root:
        return jsonify({'ok': False, 'error': '문서 저장소 경로가 설정되지 않았습니다.'}), 400
    ok, perr = _docstore_probe_root(root)
    if not ok:
        return jsonify({'ok': False, 'error': perr}), 400
    path, err = _docstore_existing_dir(folder, cfg)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    if not path:
        return jsonify({'ok': True, 'skipped': 'not-found', 'folder': folder})
    try:
        entries = os.listdir(path)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'폴더를 읽을 수 없습니다: {e}'}), 500
    if entries:
        return jsonify({'ok': False, 'error': f'폴더가 비어 있지 않습니다({len(entries)}개) — 지우지 않았습니다.',
                        'notEmpty': True, 'count': len(entries)}), 409
    try:
        os.rmdir(path)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'삭제 실패: {e}'}), 500
    return jsonify({'ok': True, 'folder': folder})


def _docstore_existing_dir(folder, cfg):
    """`_docstore_dir`와 같은 경로 검증이지만 **없는 폴더를 만들지 않는다**(makedirs 안 함).
    /doc/export-zip처럼 "있으면 가져오고 없으면 조용히 건너뛰는" 읽기 전용 용도 —
    프런트가 조립해 보내는 후보 폴더 목록은 대부분 실제로는 안 쓰인 조합이라, 평범하게
    `_docstore_dir`를 썼다간 내보내기 한 번에 빈 폴더가 NAS에 무더기로 생긴다.
    돌려주는 값: (경로, None) 있으면 / (None, None) 없으면(오류 아님) / (None, 사유) 경로 자체가 잘못됨."""
    root = cfg.get('root') or ''
    # 🔒 여기도 로그온 한 번이다 — 자격증명이 막혔으면 두드리지 않는다(_docstore_probe_root)
    if not root or not _docstore_probe_root(root)[0]:
        return None, None
    segs, err = _docstore_folder_segs(folder, cfg)
    if err:
        return None, err
    path = os.path.join(root, *segs)
    if not os.path.isdir(path):
        return None, None
    return path, None


@app.route('/doc/docx', methods=['POST'])
def doc_docx():
    """💾 문서를 **원본 문서 모양(.docx)** 으로 만들어 돌려준다 (2026-11-09 요청 "원본저장").

    받는 것: `{ name, rows: [[칸…], …] }` — 프런트가 이미 갖고 있는 `_docToAoa` 그대로다.
    ⚠️⚠️ 목록을 **두 벌로 만들지 않는다** — 화면·엑셀·워드가 같은 `_docToAoa` 한 고지에서 온다.
       그래야 구역을 하나 늘려도 세 쪽이 같이 따라온다.
    모양 규칙: 칸이 **하나뿐인 줄 = 제목**, 여러 칸이 연속된 덩어리 = **표** (원본과 같은 표 구성).
    ⚠️ 읽기 전용이다 — NAS 에 쓰지 않는다(올리기는 프런트가 `/doc/put` 으로 따로 한다).
    """
    try:
        from docx import Document
        from docx.shared import Pt
    except Exception as e:
        return jsonify({'ok': False, 'error': 'python-docx 가 없습니다: %s' % e}), 500
    req = request.get_json(silent=True) or {}
    rows = req.get('rows') or []
    if not isinstance(rows, list) or not rows:
        return jsonify({'ok': False, 'error': '내용이 비어 있습니다.'}), 400

    def cell_text(v):
        return '' if v is None else str(v)

    doc = Document()
    st = doc.styles['Normal']
    st.font.size = Pt(9)
    buf_rows = []

    def flush():
        """모아 둔 여러-칸 줄들을 표 하나로 내려놓는다."""
        if not buf_rows:
            return
        ncol = max(len(r) for r in buf_rows)
        t = doc.add_table(rows=len(buf_rows), cols=ncol)
        t.style = 'Table Grid'
        for i, r in enumerate(buf_rows):
            for j in range(ncol):
                t.cell(i, j).text = cell_text(r[j]) if j < len(r) else ''
        doc.add_paragraph('')
        del buf_rows[:]

    first = True
    for r in rows:
        if not isinstance(r, list):
            continue
        vals = [cell_text(x) for x in r]
        if not any(v.strip() for v in vals):      # 빈 줄 = 구역 끝
            flush()
            continue
        if len([v for v in vals if v.strip()]) == 1 and vals[0].strip():
            flush()
            if first:
                doc.add_heading(vals[0].strip(), level=0)
                first = False
            else:
                doc.add_heading(vals[0].strip(), level=2)
            continue
        buf_rows.append(vals)
    flush()

    bio = io.BytesIO()
    doc.save(bio)
    bio.seek(0)
    name = _docstore_safe_name(req.get('name') or 'document') or 'document'
    if not name.lower().endswith('.docx'):
        name += '.docx'
    return send_file(bio, as_attachment=True, download_name=name,
                     mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document')


@app.route('/doc/export-zip', methods=['POST'])
def doc_export_zip():
    """프로젝트 자료 한꺼번에 내려받기 — 프런트가 이미 프로젝트/모델별로 조립해 보낸 폴더
    목록(`_dsExportProjectZip`, js/48)을 하나씩 확인해, **있는 것만** 재귀로 모아 zip 하나로
    묶는다. 폴더 구조 자체는 안 바꾸고 조회 시점에만 가상으로 합친다 — PARTS/PANEL 같은
    프로젝트 전용이 아닌 공용 자료는 프런트가 애초에 목록에 안 넣는다."""
    cfg = _docstore_load()
    req = request.get_json(force=True, silent=True) or {}
    folders = req.get('folders')
    if not isinstance(folders, list) or not folders:
        return jsonify({'ok': False, 'error': '내보낼 폴더 목록이 없습니다.'}), 400
    buf = io.BytesIO()
    file_count = 0
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for folder in folders[:64]:   # 방어적 상한 — 프런트가 보내는 목록은 보통 10개 안팎
            path, _err = _docstore_existing_dir(str(folder), cfg)
            if not path:
                continue
            for root_dir, _dirs, files in os.walk(path):
                for fn in files:
                    fp = os.path.join(root_dir, fn)
                    arcname = str(folder).strip('/') + '/' + os.path.relpath(fp, path).replace(os.sep, '/')
                    zf.write(fp, arcname)
                    file_count += 1
    buf.seek(0)
    resp = send_file(buf, as_attachment=True, download_name='export.zip', mimetype='application/zip')
    resp.headers['X-File-Count'] = str(file_count)
    return resp


def _doc_text_key(folder):
    """캐시 파일명에 쓸 폴더 키 — 'PARTS/PANEL' → 'PARTS_PANEL'.
    ⚠️ 하위 폴더를 허용한 뒤로 folder 에 '/'가 들어올 수 있다. 그대로 붙이면 캐시 경로가
       깨져서(또는 엉뚱한 폴더로 가서) 텍스트 캐시가 조용히 안 먹는다."""
    return str(folder or '').replace(BACKSLASH, '/').replace('/', '_')


def _doc_text_path(cfg, folder, name):
    return os.path.join(cfg['root'], DOCSTORE_TEXT_DIR, _doc_text_key(folder) + '__' + name + '.txt')


@app.route('/doc/text', methods=['GET'])
def doc_text_get():
    """추출 텍스트 캐시 읽기 — 없으면 404(프런트가 원본을 받아 추출한 뒤 POST로 채운다)."""
    cfg = _docstore_load()
    folder = request.args.get('folder') or ''
    _, err = _docstore_dir(folder, cfg)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    name = _docstore_safe_name(request.args.get('name'))
    if not name:
        return jsonify({'ok': False, 'error': '파일 이름이 올바르지 않습니다.'}), 400
    tp = _doc_text_path(cfg, folder, name)
    if not os.path.isfile(tp):
        return jsonify({'ok': False, 'error': 'no_cache'}), 404
    try:
        with open(tp, 'r', encoding='utf-8') as f:
            return jsonify({'ok': True, 'folder': folder, 'name': name, 'text': f.read()})
    except Exception as e:
        return jsonify({'ok': False, 'error': f'캐시 읽기 실패: {e}'}), 500


@app.route('/doc/text', methods=['POST'])
def doc_text_put():
    """프런트가 pdf.js/XLSX로 뽑은 텍스트를 캐시에 저장. 팀원 누구나 재추출 없이 쓴다."""
    cfg = _docstore_load()
    req = request.get_json(force=True, silent=True) or {}
    folder = str(req.get('folder') or '')
    _, err = _docstore_dir(folder, cfg)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    name = _docstore_safe_name(req.get('name'))
    if not name:
        return jsonify({'ok': False, 'error': '파일 이름이 올바르지 않습니다.'}), 400
    text = str(req.get('text') or '')
    if not text.strip():
        return jsonify({'ok': False, 'error': '저장할 텍스트가 비어 있습니다.'}), 400
    tdir = os.path.join(cfg['root'], DOCSTORE_TEXT_DIR)
    try:
        os.makedirs(tdir, exist_ok=True)
        with open(_doc_text_path(cfg, folder, name), 'w', encoding='utf-8') as f:
            f.write(text)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'캐시 저장 실패: {e}'}), 500
    return jsonify({'ok': True, 'folder': folder, 'name': name, 'chars': len(text)})



# ══════════════════════════════════════════════════════════════════════════
# 📬 [2026-10-22 신규] 분류 확정 메일을 .eml 통째로 보관
#
#   왜: 지금 extract_attachments()는 **메타데이터만** 뽑고 내용은 버린다 — 첨부가 영영
#   사라진다. .eml 한 파일에 본문+첨부가 다 들어가므로 통째로 두면 첨부를 따로 다룰 필요가 없다.
#
#   흐름: 수신 중 staging에 저장 → 프런트가 프로젝트를 확정하면 MAIL/<프로젝트>/로 이동
#         → 어느 큐에도 없고 오래된 staging만 정리(GC).
#
#   ⚠️ 키는 프런트가 이미 모든 경로에서 들고 다니는 fileName 을 쓴다. 새 필드를 응답에 끼워
#   넣으면 "경유지마다 빠뜨려서 조용히 사라지는" 사고(docs/mail-pipeline.md의 mailRaw 패턴)를
#   그대로 반복하게 된다.
#
#   ⚠️ 수신 경로는 "멈춘 것 같다"로 고생한 자리다. staging 저장은 **절대 수신을 막지 않는다** —
#   실패해도 경고만 남기고 지나간다. 자동수집이 하루 단위로 같은 메일을 다시 받아오므로
#   이미 있는 파일은 건너뛴다(네트워크 공유에 같은 1MB를 10분마다 다시 쓰지 않도록).
# ══════════════════════════════════════════════════════════════════════════

DOCSTORE_MAIL_DIR    = 'MAIL'
DOCSTORE_MAIL_STAGE  = '_staging'
DOCSTORE_GC_DAYS     = 60          # 어느 큐에도 없는 고아 staging의 수명(설정 가능)
DOCSTORE_GC_MAX_GB   = 20          # 그래도 무한히 쌓이지 않도록 상한 — 오래된 것부터


def _docstore_mail_root(cfg=None):
    """<root>/MAIL — 없으면 만든다. 저장소 미설정이면 None."""
    cfg = cfg or _docstore_load()
    root = cfg.get('root') or ''
    # 🔒 여기도 로그온 한 번이다 — 자격증명이 막혔으면 두드리지 않는다(_docstore_probe_root)
    if not root or not _docstore_probe_root(root)[0]:
        return None
    p = os.path.join(root, DOCSTORE_MAIL_DIR)
    try:
        os.makedirs(p, exist_ok=True)
        return p
    except Exception:
        return None


def _docstore_mail_stage_dir(cfg=None):
    mr = _docstore_mail_root(cfg)
    if not mr:
        return None
    p = os.path.join(mr, DOCSTORE_MAIL_STAGE)
    try:
        os.makedirs(p, exist_ok=True)
        return p
    except Exception:
        return None


def _mail_stage_key(file_name):
    """fileName('20261016_제목.eml') → 안전한 파일명 머리. 프런트 키와 1:1로 맞춘다."""
    base = re.sub(r'\.eml$', '', str(file_name or ''), flags=re.I)
    base = re.sub(r'[^0-9A-Za-z_.\-가-힣 ]', '_', base).strip()[:80]
    return base or 'mail'


def _eml_crlf(raw):
    """.eml 바이트의 줄바꿈을 CRLF로 맞춘다(이미 CRLF인 줄은 그대로).

    ⚠️ [2026-10-28] 2026-10-22~28에 보관된 .eml 은 전부 LF뿐이었다(POP3 줄을 LF로 붙였음).
       아웃룩은 그런 파일의 quoted-printable 이음표(`=`+줄바꿈)를 풀지 못해 `=EC`, `=nbsp;` 같은
       조각이 남고 한글이 깨진다. 첨부는 base64(글자)라 줄바꿈을 바꿔도 내용이 안 변한다."""
    return re.sub(rb'\r?\n', b'\r\n', raw or b'')


def _eml_heal_file(path):
    """LF뿐인 보관 .eml 을 그 자리에서 CRLF로 고친다(열기 직전에 부른다). 고쳤으면 True.
    임시 파일에 쓰고 바꿔치기해서, 도중에 실패해도 원본이 반쯤 쓰인 채 남지 않는다."""
    try:
        with open(path, 'rb') as f:
            raw = f.read()
        fixed = _eml_crlf(raw)
        if fixed == raw:
            return False
        tmp = path + '.crlf.tmp'
        with open(tmp, 'wb') as f:
            f.write(fixed)
        os.replace(tmp, path)
        return True
    except Exception as e:
        print(f'[메일보관] CRLF 교정 실패(원본 그대로 엶): {path} · {e}')
        return False


def _stage_raw_mail(stage_dir, file_name, raw):
    """원본 .eml을 staging에 저장. 이미 있으면 건너뛴다. 실패해도 예외를 올리지 않는다."""
    if not stage_dir or not raw:
        return None
    try:
        key = _mail_stage_key(file_name)
        # 같은 날·같은 제목 충돌 방지. 해시는 **줄바꿈을 LF로 맞춘 내용**으로 낸다 — CRLF로 바꾼 뒤에도
        # 같은 메일이면 예전(LF 시절) 파일과 이름이 같아야 중복 보관이 안 생긴다.
        h = hashlib.sha1(raw.replace(b'\r\n', b'\n')).hexdigest()[:8]
        name = f'{key}__{h}.eml'
        path = os.path.join(stage_dir, name)
        if not os.path.exists(path):
            with open(path, 'wb') as f:
                f.write(_eml_crlf(raw))
        return name
    except Exception as e:
        print(f'[메일보관] staging 저장 실패(무시): {e}')
        return None


@app.route('/doc/mail-assign', methods=['POST'])
def doc_mail_assign():
    """분류 확정 → staging에서 MAIL/<프로젝트>/로 이동.
    fileName으로 찾는다(프런트가 모든 경로에서 들고 다니는 유일한 키)."""
    cfg = _docstore_load()
    stage = _docstore_mail_stage_dir(cfg)
    if not stage:
        return jsonify({'ok': False, 'error': '문서 저장소가 설정되지 않았습니다.'}), 400
    req = request.get_json(force=True, silent=True) or {}
    file_name = str(req.get('fileName') or '')
    project = _docstore_safe_name(req.get('project'))
    if not file_name or not project:
        return jsonify({'ok': False, 'error': 'fileName과 project가 필요합니다.'}), 400

    key = _mail_stage_key(file_name)
    try:
        cands = [n for n in os.listdir(stage) if n.startswith(key + '__')]
    except Exception as e:
        return jsonify({'ok': False, 'error': f'staging 조회 실패: {e}'}), 500
    if not cands:
        # 흔한 경우다(저장소 설정 전에 받은 메일) — 오류가 아니라 '없음'으로 돌려준다
        return jsonify({'ok': True, 'moved': False, 'reason': 'not_staged'})
    cands.sort(key=lambda n: os.path.getmtime(os.path.join(stage, n)), reverse=True)

    dest_dir = os.path.join(_docstore_mail_root(cfg), project)
    try:
        os.makedirs(dest_dir, exist_ok=True)
        src = os.path.join(stage, cands[0])
        dst = os.path.join(dest_dir, cands[0])
        if os.path.exists(dst):
            os.remove(src)                      # 이미 보관됨 — staging만 비운다
            return jsonify({'ok': True, 'moved': False, 'reason': 'already', 'project': project, 'name': cands[0]})
        shutil.move(src, dst)
    except Exception as e:
        return jsonify({'ok': False, 'error': f'이동 실패: {e}'}), 500
    return jsonify({'ok': True, 'moved': True, 'project': project, 'name': cands[0]})


@app.route('/doc/mail-gc', methods=['POST'])
def doc_mail_gc():
    """staging 정리. 기본은 **dry-run** — 무엇을 얼마나 지울지만 돌려준다.

    ⚠️ 기간만으로 지우면 틀린다. 실측에서 신규발신자 큐에 한 달 넘게 남은 메일이 있었고,
    "프로젝트를 나중에 만들고 과거 메일을 재분류"가 이 앱의 정상 워크플로다.
    그래서 프런트가 보내는 alive(아직 어느 큐엔가 살아 있는 fileName들)에 없는 것만,
    그것도 DOCSTORE_GC_DAYS 가 지난 것만 지운다. 기간은 최후 방어선일 뿐이다."""
    cfg = _docstore_load()
    stage = _docstore_mail_stage_dir(cfg)
    if not stage:
        return jsonify({'ok': False, 'error': '문서 저장소가 설정되지 않았습니다.'}), 400
    req = request.get_json(force=True, silent=True) or {}
    alive_keys = {_mail_stage_key(x) for x in (req.get('alive') or []) if x}
    # ⚠️ `or` 로 쓰면 days=0(즉시 정리)이 falsy라 조용히 60으로 둔갑한다 — 테스트에서 걸렸다.
    _d = req.get('days')
    days = int(_d) if _d is not None and str(_d) != '' else DOCSTORE_GC_DAYS
    # ⚠️ days=0 을 "지금 다 비우기"로 기대하면 안 된다 — NAS 시계가 이 PC보다 약 1초 앞서서
    #    방금 쓴 파일의 mtime 이 미래로 찍힌다(실측). 60일 정책에는 영향이 없다.
    apply_it = bool(req.get('apply'))
    cutoff = time.time() - days * 86400

    victims, kept_alive, kept_fresh, total_bytes = [], 0, 0, 0
    try:
        for n in os.listdir(stage):
            fp = os.path.join(stage, n)
            if not os.path.isfile(fp):
                continue
            st = os.stat(fp)
            total_bytes += st.st_size
            if n.rsplit('__', 1)[0] in alive_keys:
                kept_alive += 1
                continue
            if st.st_mtime > cutoff:
                kept_fresh += 1
                continue
            victims.append({'name': n, 'size': st.st_size,
                            'mtime': datetime.fromtimestamp(st.st_mtime).isoformat(timespec='seconds')})
    except Exception as e:
        return jsonify({'ok': False, 'error': f'staging 조회 실패: {e}'}), 500

    # 용량 상한 — 기간이 어긋나도 디스크가 터지지 않게, 오래된 것부터 추가로 지운다
    over = []
    if total_bytes > DOCSTORE_GC_MAX_GB * (1024 ** 3):
        try:
            rest = sorted(
                [n for n in os.listdir(stage) if os.path.isfile(os.path.join(stage, n))
                 and n not in {v['name'] for v in victims}],
                key=lambda n: os.path.getmtime(os.path.join(stage, n)))
            need = total_bytes - DOCSTORE_GC_MAX_GB * (1024 ** 3)
            for n in rest:
                if need <= 0:
                    break
                sz = os.path.getsize(os.path.join(stage, n))
                over.append({'name': n, 'size': sz})
                need -= sz
        except Exception:
            pass

    deleted = 0
    if apply_it:
        for v in victims + over:
            try:
                os.remove(os.path.join(stage, v['name']))
                deleted += 1
            except Exception as e:
                print(f'[메일보관] GC 삭제 실패 {v["name"]}: {e}')

    return jsonify({
        'ok': True, 'dryRun': not apply_it, 'days': days,
        'stagedTotal': kept_alive + kept_fresh + len(victims),
        'totalMB': round(total_bytes / 1048576, 1),
        'keptAlive': kept_alive, 'keptFresh': kept_fresh,
        'wouldDelete': len(victims), 'overCap': len(over), 'deleted': deleted,
        'sample': victims[:10]
    })


def _mail_find_file(cfg, file_name):
    """fileName → (폴더명, 파일명). 못 찾으면 (None, None).

    보관 파일명은 `<키>__<sha8>.eml` 이고 **이동해도 이름이 안 바뀐다**(doc_mail_assign) —
    그래서 키 접두어로 staging 과 프로젝트 폴더를 훑으면 찾을 수 있다.
    ⚠️ 확정 보관본을 먼저 본다. 분류가 끝나도 같은 이름이 staging 에 남아 있을 수 있는데,
       그걸 먼저 집으면 "분류했는데 왜 미분류에서 열리지"가 된다.
    """
    mr = _docstore_mail_root(cfg)
    if not mr or not file_name:
        return None, None
    prefix = _mail_stage_key(file_name) + '__'
    try:
        projects = [n for n in sorted(os.listdir(mr))
                    if n != DOCSTORE_MAIL_STAGE and os.path.isdir(os.path.join(mr, n))]
    except Exception:
        return None, None
    for d in projects + [DOCSTORE_MAIL_STAGE]:
        p = os.path.join(mr, d)
        try:
            hits = [n for n in os.listdir(p) if n.startswith(prefix)]
        except Exception:
            continue
        if hits:
            hits.sort(key=lambda n: os.path.getmtime(os.path.join(p, n)), reverse=True)
            return d, hits[0]
    return None, None


@app.route('/doc/mail-find', methods=['GET'])
def doc_mail_find():
    """이 메일의 원본 .eml 이 보관돼 있는지 — 프런트가 버튼을 띄울지 정하는 데 쓴다.
    없는 게 흔하다(저장소 설정 전에 받은 메일) — 오류가 아니라 found:false 로 돌려준다."""
    cfg = _docstore_load()
    d, n = _mail_find_file(cfg, request.args.get('fileName') or '')
    if not n:
        return jsonify({'ok': True, 'found': False})
    fp = os.path.join(_docstore_mail_root(cfg), d, n)
    try:
        st = os.stat(fp)
    except Exception:
        return jsonify({'ok': True, 'found': False})
    return jsonify({'ok': True, 'found': True, 'project': d, 'name': n,
                    'staged': d == DOCSTORE_MAIL_STAGE, 'size': st.st_size,
                    'mtime': datetime.fromtimestamp(st.st_mtime).isoformat(timespec='seconds')})


@app.route('/doc/mail-open', methods=['GET'])
def doc_mail_open():
    """원본 .eml 내려주기 — 받으면 메일 프로그램이 연다(본문 + **첨부까지**).
    앱 모달은 본문만 보여준다(수신 때 첨부는 메타만 남기고 버린다)."""
    cfg = _docstore_load()
    d, n = _mail_find_file(cfg, request.args.get('fileName') or '')
    if not n:
        return jsonify({'ok': False, 'error': '보관된 원본 .eml을 찾지 못했습니다.'}), 404
    path = os.path.join(_docstore_mail_root(cfg), d, n)
    _eml_heal_file(path)   # LF뿐인 옛 보관본이면 CRLF로 고쳐서 내려준다(아웃룩 한글 깨짐)
    return send_file(path, mimetype='message/rfc822', as_attachment=True, download_name=n)


def _mail_attachment_parts(msg):
    """첨부로 볼 파트만 **순서대로**. 인덱스가 곧 이 순서다 — 목록을 주는 쪽(/doc/mail-parse)과
    하나를 꺼내 주는 쪽(/doc/mail-attach)이 **같은 함수**를 써야 번호가 안 어긋난다."""
    out = []
    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue
        cd = str(part.get('Content-Disposition', '') or '').lower()
        if not part.get_filename() and 'attachment' not in cd:
            continue                      # 본문 파트
        out.append(part)
    return out


def _mail_open_eml(cfg, file_name):
    """보관된 .eml → (msg, 폴더, 파일명, 오류응답). 오류면 msg 가 None."""
    d, n = _mail_find_file(cfg, file_name)
    if not n:
        return None, None, None, (jsonify({'ok': False, 'error': '보관된 원본 .eml을 찾지 못했습니다.'}), 404)
    try:
        with open(os.path.join(_docstore_mail_root(cfg), d, n), 'rb') as f:
            return email.message_from_bytes(f.read()), d, n, None
    except Exception as e:
        return None, None, None, (jsonify({'ok': False, 'error': f'원본을 읽지 못했습니다: {e}'}), 500)


MAIL_BODY_MAX = 300000      # 본문이 아무리 길어도 이만큼만 — 화면이 멈추지 않게


@app.route('/doc/mail-parse', methods=['GET'])
def doc_mail_parse():
    """보관된 .eml 을 풀어 **전문 본문 + 첨부 목록**을 준다.

    앱 모달이 들고 있는 건 수신 때 잘라 둔 2000자 요약이고 첨부는 이름뿐이다.
    여기서 NAS 원본을 그대로 읽어 주므로, PC에 .eml 사본을 만들 필요가 없다.
    본문 추출은 수신 경로와 **같은 함수**(extract_body)를 쓴다 — 표 칸 구분(│)까지 똑같이 나온다.
    """
    cfg = _docstore_load()
    msg, d, n, err = _mail_open_eml(cfg, request.args.get('fileName') or '')
    if err:
        return err
    body = extract_body(msg) or ''
    atts = []
    for i, part in enumerate(_mail_attachment_parts(msg)):
        try:
            payload = part.get_payload(decode=True) or b''
        except Exception:
            payload = b''
        cd = str(part.get('Content-Disposition', '') or '').lower()
        atts.append({
            'idx': i,
            'name': decode_str(part.get_filename() or '') or ('attachment_%d' % (i + 1)),
            'size': len(payload),
            'ctype': part.get_content_type() or 'application/octet-stream',
            # 본문에 박힌 그림(로고·서명)은 '진짜 첨부'와 구분해 준다 — 목록이 그걸로 덮인다
            'inline': ('inline' in cd) and bool(part.get('Content-ID')),
        })
    return jsonify({'ok': True, 'project': d, 'name': n, 'staged': d == DOCSTORE_MAIL_STAGE,
                    'subject': decode_str(msg.get('Subject', '')),
                    'from': decode_str(msg.get('From', '')),
                    'to': decode_str(msg.get('To', '')),
                    'cc': decode_str(msg.get('Cc', '')),
                    'date': decode_str(msg.get('Date', '')),
                    'body': body[:MAIL_BODY_MAX],
                    'truncated': len(body) > MAIL_BODY_MAX,
                    'attachments': atts})


@app.route('/doc/mail-attach', methods=['GET'])
def doc_mail_attach():
    """첨부 **하나만** NAS 의 .eml 에서 꺼내 돌려준다.

    PDF·그림·텍스트는 브라우저에서 바로 보이게(inline), 나머지는 받아서 해당 프로그램으로 연다
    (.xlsx 를 inline 으로 줘 봐야 브라우저가 못 연다).
    """
    cfg = _docstore_load()
    msg, _d, _n, err = _mail_open_eml(cfg, request.args.get('fileName') or '')
    if err:
        return err
    try:
        idx = int(request.args.get('idx'))
    except Exception:
        return jsonify({'ok': False, 'error': 'idx가 필요합니다.'}), 400
    parts = _mail_attachment_parts(msg)
    if idx < 0 or idx >= len(parts):
        return jsonify({'ok': False, 'error': f'첨부 번호가 범위를 벗어났습니다(0~{len(parts) - 1}).'}), 404
    part = parts[idx]
    try:
        payload = part.get_payload(decode=True) or b''
    except Exception as e:
        return jsonify({'ok': False, 'error': f'첨부를 꺼내지 못했습니다: {e}'}), 500
    ctype = part.get_content_type() or 'application/octet-stream'
    name = decode_str(part.get_filename() or '') or ('attachment_%d' % (idx + 1))
    inline = ctype.startswith('image/') or ctype in ('application/pdf', 'text/plain')
    return send_file(io.BytesIO(payload), mimetype=ctype,
                     as_attachment=not inline, download_name=_docstore_safe_name(name) or 'attachment')


@app.route('/doc/mail-launch', methods=['POST'])
def doc_mail_launch():
    """NAS 에 있는 .eml 을 **그 자리에서** 기본 메일 프로그램(아웃룩)으로 연다.

    왜 백엔드가 여는가: 브라우저는 로컬 프로그램을 띄울 수 없어서 `/doc/mail-open` 은 파일을
    **받아서** Windows 에 넘긴다 — 그래서 다운로드 폴더에 사본이 하나씩 쌓인다.
    이 백엔드는 그 PC 에서 돌고 NAS 를 직접 보므로 `os.startfile` 로 원본을 바로 열 수 있다.

    ⚠️ 경로를 요청에서 받지 않는다. `fileName` 으로 `_mail_find_file` 이 찾은 **MAIL 폴더 안**
       파일만 연다 — 임의 경로를 받으면 이 라우트가 곧 '아무 프로그램이나 실행'이 된다.
    ⚠️ Windows 전용(os.startfile). 다른 OS 면 못 한다고 정직하게 답한다.
    """
    if not hasattr(os, 'startfile'):
        return jsonify({'ok': False, 'error': '이 기능은 Windows에서만 됩니다.'}), 400
    cfg = _docstore_load()
    req = request.get_json(force=True, silent=True) or {}
    d, n = _mail_find_file(cfg, str(req.get('fileName') or ''))
    if not n:
        return jsonify({'ok': False, 'error': '보관된 원본 .eml을 찾지 못했습니다.'}), 404
    path = os.path.join(_docstore_mail_root(cfg), d, n)
    if not os.path.isfile(path) or not n.lower().endswith('.eml'):
        return jsonify({'ok': False, 'error': '열 수 있는 .eml이 아닙니다.'}), 400
    _eml_heal_file(path)   # LF뿐인 옛 보관본이면 CRLF로 고쳐서 연다(아웃룩 한글 깨짐)
    try:
        os.startfile(path)          # noqa: S606 — 위에서 MAIL 폴더 안 .eml 로 한정했다
    except Exception as e:
        return jsonify({'ok': False, 'error': f'열지 못했습니다: {e}'}), 500
    return jsonify({'ok': True, 'project': d, 'name': n})


@app.route('/doc/mail-list', methods=['GET'])
def doc_mail_list():
    """프로젝트별 보관함 또는 staging 현황."""
    cfg = _docstore_load()
    mr = _docstore_mail_root(cfg)
    if not mr:
        return jsonify({'ok': False, 'error': '문서 저장소가 설정되지 않았습니다.'}), 400
    project = (request.args.get('project') or '').strip()
    if not project:
        out = []
        try:
            for n in sorted(os.listdir(mr)):
                d = os.path.join(mr, n)
                if os.path.isdir(d):
                    out.append({'project': n, 'count': len([x for x in os.listdir(d)
                                                            if os.path.isfile(os.path.join(d, x))])})
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500
        return jsonify({'ok': True, 'projects': out})
    p = _docstore_safe_name(project)
    d = os.path.join(mr, p)
    if not p or not os.path.isdir(d):
        return jsonify({'ok': True, 'project': project, 'count': 0, 'files': []})
    files = []
    for n in sorted(os.listdir(d)):
        fp = os.path.join(d, n)
        if os.path.isfile(fp):
            st = os.stat(fp)
            files.append({'name': n, 'size': st.st_size,
                          'mtime': datetime.fromtimestamp(st.st_mtime).isoformat(timespec='seconds')})
    return jsonify({'ok': True, 'project': p, 'count': len(files), 'files': files})


if __name__ == '__main__':
    print("=" * 58)
    print("  KORTEK Backend v1.0")
    print("  자동화 메일 · Telegram 알람 · AI 분석 서버")
    print("-" * 58)
    print(f"  SMTP : {SMTP_HOST or '(미설정)'}:{SMTP_PORT}")
    print(f"  계정 : {SMTP_USER or '(미설정)'}")
    print(f"  IMAP : {IMAP_HOST}:{IMAP_PORT} (SSL, 기본 경로)")
    print(f"  POP3 : {POP3_HOST}:{POP3_PORT} (폴백)")
    print(f"  TG   : {'연결됨 ✓' if TELEGRAM_TOKEN else '미설정 (알람설정 > Telegram 탭에서 입력)'}")
    print(f"  팀원 : {len(TELEGRAM_MEMBERS)}명 등록")
    print(f"  예약 : {len(SCHEDULE_RULES)}건 등록 (1분마다 자동 확인)")
    print("-" * 58)
    print("  URL  : http://127.0.0.1:5000")
    print("  종료 : Ctrl+C 또는 창 닫기")
    print("=" * 58)
    threading.Thread(target=_scheduler_loop, daemon=True).start()
    _run_flask_with_port_retry()
