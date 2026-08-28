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
#    /fetch-mail        — 메일 수신 (POP3)
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
# ══════════════════════════════════════════════════════════════

import os, json, re, poplib, email, smtplib, hashlib, base64, html
from email.header     import decode_header
from email.utils      import parsedate_to_datetime
from email.mime.text  import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime         import datetime, timezone, timedelta

import requests
from flask      import Flask, request, jsonify
from flask_cors import CORS

try:
    from cryptography.fernet import Fernet, InvalidToken
    CRYPTO_OK = True
except ImportError:
    CRYPTO_OK = False
    print("[경고] cryptography 미설치 → pip install cryptography")

app = Flask(__name__)

# ── CORS: 허용 출처 제한 (보안 강화) ─────────────────────────
ALLOWED_ORIGINS = [
    "https://yhparkkortek.github.io",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "null",   # 로컬 HTML 파일 (file://)
]

@app.after_request
def add_cors_headers(resp):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS or not origin:
        resp.headers["Access-Control-Allow-Origin"]  = origin or "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp

# ── 공통 상수 ─────────────────────────────────────────────────
KST            = timezone(timedelta(hours=9))
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE    = os.path.join(BASE_DIR, 'mail_config.json')
TG_CONFIG_FILE = os.path.join(BASE_DIR, 'telegram_config.json')
POP3_HOST      = "gw.kortek.co.kr"
POP3_PORT      = 110

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

# 서버 시작 시 로드
load_smtp_config()
_tg = load_tg_config()
TELEGRAM_TOKEN   = _tg.get("token", "")
TELEGRAM_CHAT_ID = _tg.get("default_chat_id", "")
TELEGRAM_MEMBERS = _tg.get("members", [])


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
def send_telegram_msg(message: str, chat_id: str = None) -> dict:
    target = chat_id or TELEGRAM_CHAT_ID
    if not TELEGRAM_TOKEN or not target:
        return {"ok": False, "error": "Token 또는 Chat ID 미설정"}
    url  = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    resp = requests.post(url, json={
        "chat_id":    target,
        "text":       message,
        "parse_mode": "HTML"
    }, timeout=10)
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
        'telegram': '연결됨' if TELEGRAM_TOKEN else '(미설정)',
        'members': len(TELEGRAM_MEMBERS),
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
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── 메일 발송 (SMTP) ──────────────────────────────────────────
@app.route('/send-mail', methods=['POST'])
def send_mail():
    data    = request.json or {}
    to      = data.get('to', '').strip()
    cc      = data.get('cc', '').strip()
    subject = data.get('subject', '').strip()
    body    = data.get('body', '').strip()

    if not to:
        return jsonify({'ok': False, 'error': '수신자 없음'}), 400
    if not SMTP_USER or not SMTP_PASS:
        return jsonify({'ok': False, 'error': 'SMTP 미설정 — 알람 설정에서 SMTP를 입력하세요'}), 400
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

        print(f"[OK] 메일 발송 → {to} / {subject}")
        return jsonify({'ok': True})
    except smtplib.SMTPAuthenticationError:
        return jsonify({'ok': False, 'error': '로그인 실패: 비밀번호를 확인하세요'}), 401
    except smtplib.SMTPConnectError:
        return jsonify({'ok': False, 'error': f'서버 연결 실패: {SMTP_HOST}:{SMTP_PORT}'}), 503
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


# ── 메일 수신 (POP3) ──────────────────────────────────────────
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

    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=KST)
        end_dt   = datetime.strptime(end_date,   "%Y-%m-%d").replace(
                       hour=23, minute=59, second=59, tzinfo=KST)

        M            = poplib.POP3(POP3_HOST, POP3_PORT, timeout=15)
        M.user(mail_user)
        M.pass_(mail_pw)
        num_messages = len(M.list()[1])
        results      = []
        scan_limit   = min(num_messages, max_count or 200)

        for i in range(num_messages, num_messages - scan_limit, -1):
            try:
                raw = b"\n".join(M.retr(i)[1])
                msg = email.message_from_bytes(raw)
                date_str = msg.get("Date", "")
                try:
                    msg_dt = parsedate_to_datetime(date_str)
                    if msg_dt.tzinfo is None:
                        msg_dt = msg_dt.replace(tzinfo=KST)
                    msg_dt = msg_dt.astimezone(KST)
                except Exception:
                    continue
                if msg_dt < start_dt:
                    break
                if msg_dt > end_dt:
                    continue
                subject = decode_str(msg.get("Subject", ""))
                sender  = decode_str(msg.get("From", ""))
                body    = extract_body(msg)
                if not matches_keyword(subject, body, keyword, keyword_from, sender, keyword_body):
                    continue

                # 💡 [우선순위 점수] 발신자가 명시한 중요도 헤더 — Outlook 등에서 "높음"으로 보낸 메일에 붙음
                importance_raw = (msg.get("Importance", "") or msg.get("X-Priority", "")).strip().lower()
                importance_high = importance_raw in ("high", "1", "1 (highest)", "2 (high)")

                # 💡 [우선순위 점수] 내가 To(직접수신)인지 Cc(참조)인지 — mail_user 계정 기준으로 판별
                to_header = decode_str(msg.get("To", "")).lower()
                cc_header = decode_str(msg.get("Cc", "")).lower()
                my_addr   = mail_user.lower()
                is_to_me  = my_addr in to_header
                is_cc_me  = (not is_to_me) and (my_addr in cc_header)

                results.append({
                    "subject":    subject,
                    "sender":     sender,
                    "date":       msg_dt.strftime("%Y-%m-%d %H:%M"),
                    "body":       body,
                    "fileName":   f"{msg_dt.strftime('%Y%m%d')}_{subject[:20]}.eml",
                    "importance": importance_high,   # true/false
                    "isToMe":     is_to_me,           # true/false
                    "isCcMe":     is_cc_me            # true/false
                })
            except Exception:
                continue

        M.quit()
        return jsonify({
            "status":  "success",
            "count":   len(results),
            "keyword": keyword or "(전체)",
            "userId":  mail_user.split("@")[0] if mail_user else "",
            "data":    results
        })
    except poplib.error_proto as e:
        return jsonify({"status": "error", "message": f"POP3 인증 실패: {str(e)}"})
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


# ══════════════════════════════════════════════════════════════
if __name__ == '__main__':
    print("=" * 58)
    print("  KORTEK Backend v1.0")
    print("  자동화 메일 · Telegram 알람 · AI 분석 서버")
    print("-" * 58)
    print(f"  SMTP : {SMTP_HOST or '(미설정)'}:{SMTP_PORT}")
    print(f"  계정 : {SMTP_USER or '(미설정)'}")
    print(f"  POP3 : {POP3_HOST}:{POP3_PORT}")
    print(f"  TG   : {'연결됨 ✓' if TELEGRAM_TOKEN else '미설정 (알람설정 > Telegram 탭에서 입력)'}")
    print(f"  팀원 : {len(TELEGRAM_MEMBERS)}명 등록")
    print("-" * 58)
    print("  URL  : http://127.0.0.1:5000")
    print("  종료 : Ctrl+C 또는 창 닫기")
    print("=" * 58)
    app.run(host='127.0.0.1', port=5000, debug=False)
