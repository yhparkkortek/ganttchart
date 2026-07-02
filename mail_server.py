"""
Gantt Chart 알람 메일 발송 서버
실행: python mail_server.py
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

app = Flask(__name__)
CORS(app)

# ── SMTP 설정 (썬더버드와 동일) ─────────────────────────────
SMTP_HOST = 'kmail.kortek.co.kr'
SMTP_PORT = 587
SMTP_USER = 'yphark@kortek.co.kr'
SMTP_PASS = ''   # ← 본인 비밀번호 입력
SMTP_TLS  = True  # STARTTLS

@app.route('/health', methods=['GET'])
def health():
    """HTML 앱에서 서버 실행 여부 확인용"""
    return jsonify({'ok': True, 'message': '메일 서버 실행 중'})

@app.route('/send-mail', methods=['POST'])
def send_mail():
    data    = request.json or {}
    to      = data.get('to', '').strip()
    subject = data.get('subject', '').strip()
    body    = data.get('body', '').strip()

    if not to:
        return jsonify({'ok': False, 'error': '수신자 없음'}), 400
    if not subject:
        return jsonify({'ok': False, 'error': '제목 없음'}), 400

    try:
        msg = MIMEMultipart('alternative')
        msg['From']    = SMTP_USER
        msg['To']      = to
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html', 'utf-8'))

        recipients = [r.strip() for r in to.split(',') if r.strip()]

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.ehlo()
            if SMTP_TLS:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(SMTP_USER, SMTP_PASS)
            smtp.sendmail(SMTP_USER, recipients, msg.as_string())

        print(f"[OK] 발송 완료 → {to} / {subject}")
        return jsonify({'ok': True})

    except smtplib.SMTPAuthenticationError:
        msg = '로그인 실패: 비밀번호를 확인하세요'
        print(f"[ERR] {msg}")
        return jsonify({'ok': False, 'error': msg}), 401
    except smtplib.SMTPConnectError:
        msg = f'서버 연결 실패: {SMTP_HOST}:{SMTP_PORT}'
        print(f"[ERR] {msg}")
        return jsonify({'ok': False, 'error': msg}), 503
    except Exception as e:
        print(f"[ERR] {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500

import json, os

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'mail_config.json')

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except: pass
    return {}

# 런타임 설정 덮어쓰기
_runtime_cfg = load_config()
if _runtime_cfg:
    globals().update({
        'SMTP_HOST': _runtime_cfg.get('host', SMTP_HOST),
        'SMTP_PORT': _runtime_cfg.get('port', SMTP_PORT),
        'SMTP_USER': _runtime_cfg.get('user', SMTP_USER),
        'SMTP_PASS': _runtime_cfg.get('pass', SMTP_PASS),
    })

@app.route('/config', methods=['POST'])
def update_config():
    global SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    data = request.json or {}
    SMTP_HOST = data.get('host', SMTP_HOST)
    SMTP_PORT = int(data.get('port', SMTP_PORT))
    SMTP_USER = data.get('user', SMTP_USER)
    SMTP_PASS = data.get('pass', SMTP_PASS)
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump({'host': SMTP_HOST, 'port': SMTP_PORT, 'user': SMTP_USER, 'pass': SMTP_PASS}, f)
        print(f"[CONFIG] 저장 완료: {SMTP_USER}@{SMTP_HOST}:{SMTP_PORT}")
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("  Gantt Chart 메일 서버 시작")
    print(f"  SMTP : {SMTP_HOST}:{SMTP_PORT}")
    print(f"  계정 : {SMTP_USER}")
    print("  URL  : http://127.0.0.1:5000")
    print("  종료 : Ctrl+C")
    print("=" * 50)
    app.run(host='127.0.0.1', port=5000, debug=False)
