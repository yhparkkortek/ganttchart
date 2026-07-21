"""
Gantt Chart 알람 메일 발송 서버
실행: python mail_server.py
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import smtplib, json, os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
app = Flask(__name__)
CORS(app)
# 기본값 (빈값) — 실제 설정은 앱 Alarm > 설정에서 입력
SMTP_HOST = ''
SMTP_PORT = 25
SMTP_USER = ''
SMTP_PASS = ''
SMTP_TLS  = True
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mail_config.json')
def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: pass
    return {}
# 시작 시 저장된 설정 로드
_cfg = load_config()
if _cfg:
    SMTP_HOST = _cfg.get('host', SMTP_HOST)
    SMTP_PORT = int(_cfg.get('port', SMTP_PORT))
    SMTP_USER = _cfg.get('user', SMTP_USER)
    SMTP_PASS = _cfg.get('pass', SMTP_PASS)
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'ok': True, 'user': SMTP_USER, 'host': SMTP_HOST})
@app.route('/config', methods=['POST'])
def update_config():
    global SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
    data = request.json or {}
    SMTP_HOST = data.get('host', SMTP_HOST)
    SMTP_PORT = int(data.get('port', SMTP_PORT))
    SMTP_USER = data.get('user', SMTP_USER)
    SMTP_PASS = data.get('pass', SMTP_PASS)
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump({'host': SMTP_HOST, 'port': SMTP_PORT,
                       'user': SMTP_USER, 'pass': SMTP_PASS}, f, ensure_ascii=False)
        print(f"[CONFIG] 저장 완료: {SMTP_USER}@{SMTP_HOST}:{SMTP_PORT}")
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
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
        return jsonify({'ok': False, 'error': 'SMTP 미설정 — 앱 Alarm > 설정에서 입력하세요'}), 400
    try:
        msg = MIMEMultipart('alternative')
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
        print(f"[OK] 발송 완료 → to={to} cc={cc or '-'} / {subject}")
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
if __name__ == '__main__':
    print("=" * 50)
    print("  Gantt Chart 메일 서버 시작")
    print(f"  SMTP : {SMTP_HOST or '(미설정)'}:{SMTP_PORT}")
    print(f"  계정 : {SMTP_USER or '(미설정)'}")
    if not SMTP_USER:
        print("  [!] SMTP 미설정 — 앱 Alarm > 설정에서 입력하세요")
    print("  URL  : http://127.0.0.1:5000")
    print("  종료 : Ctrl+C")
    print("=" * 50)
    app.run(host='127.0.0.1', port=5000, debug=False)
