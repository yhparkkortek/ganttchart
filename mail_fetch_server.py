# -*- coding: utf-8 -*-
# ══════════════════════════════════════════════════════════════
# 📧 Gantt Chart - 메일 서버 AI분석용 로컬 수집 서버
#    (알람 메일 서버 mail_server.py 와 동일한 방식으로 PC에 상시 실행)
#    포트: 5001  (알람 서버 5000번과 겹치지 않음 → 둘 다 동시 실행 가능)
# ══════════════════════════════════════════════════════════════
import poplib
import email
import re
from email.header import decode_header
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone, timedelta

from flask import Flask, request, jsonify

app = Flask(__name__)

# ── 환경설정 (필요 시 아래 두 값만 수정) ──────────────────────
POP3_HOST = "gw.kortek.co.kr"
POP3_PORT = 110

KST = timezone(timedelta(hours=9))


# ── GANTT_CHART_V02_Color.html 에서 https://yhparkkortek.github.io
#    로부터 오는 요청을 허용하기 위한 CORS 헤더 ─────────────────
@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


# ── 헤더 디코딩 ───────────────────────────────────────────
def decode_str(value):
    if not value:
        return ""
    parts = decode_header(value)
    result = []
    for part, enc in parts:
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(part)
    return "".join(result)


# ── 본문 추출 ─────────────────────────────────────────────
def extract_body(msg):
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in cd:
                charset = part.get_content_charset() or "utf-8"
                try:
                    body = part.get_payload(decode=True).decode(charset, errors="replace")
                    break
                except Exception:
                    continue
    else:
        charset = msg.get_content_charset() or "utf-8"
        try:
            body = msg.get_payload(decode=True).decode(charset, errors="replace")
        except Exception:
            body = ""
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"\s+", " ", body).strip()
    return body[:2000]


# ── 키워드 필터 ───────────────────────────────────────────
def matches_keyword(subject: str, body: str, keyword: str) -> bool:
    if not keyword or not keyword.strip():
        return True
    kw = keyword.strip().lower()
    keywords = [k.strip() for k in kw.split(",") if k.strip()]
    text = (subject + " " + body[:500]).lower()
    return any(k in text for k in keywords)


# ── 헬스체크 ─────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "gantt-mail-fetch-local"})


# ── 메인 API ─────────────────────────────────────────────
@app.route("/fetch-mail", methods=["POST", "OPTIONS"])
def fetch_mail():
    if request.method == "OPTIONS":
        # 프리플라이트 응답 (CORS)
        return ("", 204)

    req = request.get_json(force=True, silent=True) or {}
    mail_user = req.get("mailUser", "")
    mail_pw   = req.get("mailPw", "")
    start_date = req.get("startDate", "")
    end_date   = req.get("endDate", "")
    keyword    = req.get("keyword", "")
    max_count  = req.get("maxCount", 200)

    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=KST)
        end_dt   = datetime.strptime(end_date, "%Y-%m-%d").replace(
                       hour=23, minute=59, second=59, tzinfo=KST)

        # POP3 접속
        M = poplib.POP3(POP3_HOST, POP3_PORT, timeout=15)
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

                if not matches_keyword(subject, body, keyword):
                    continue

                results.append({
                    "subject":  subject,
                    "sender":   sender,
                    "date":     msg_dt.strftime("%Y-%m-%d %H:%M"),
                    "body":     body,
                    "fileName": f"{msg_dt.strftime('%Y%m%d')}_{subject[:20]}.eml"
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


if __name__ == "__main__":
    print("=" * 50)
    print("  Gantt 메일 수집 로컬 서버")
    print("  주소: http://127.0.0.1:5001")
    print("  종료: 이 창에서 Ctrl+C")
    print("=" * 50)
    app.run(host="127.0.0.1", port=5001)
