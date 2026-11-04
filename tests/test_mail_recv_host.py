# -*- coding: utf-8 -*-
"""/fetch-mail 이 **받는 서버 주소**를 어디서 가져오는지 검증한다. (2026-11-04)

왜 이 파일이 있나 — 2026-11-03 에 "수신도 설정된 서버 주소를 쓰게" 고쳤는데, 그 주소는
**발송(SMTP) 주소**였다. 사내에서 보내는 서버와 받는 서버가 다른 장비라, 수신이 포트가
닫힌 쪽으로 가서 `[WinError 10061] 연결 거부`가 60초마다 반복됐다. 같은 종류의 혼동이
다시 나지 않게 "어느 호스트로 붙었는가"를 고정한다.

가짜는 **경계에만** — `_fetch_mail_imap` / `_fetch_mail_pop3` 두 함수만 바꿔 끼우고,
라우트(요청 파싱·호스트 결정·폴백·오류 문구)는 진짜 코드가 돈다. 네트워크·계정 불필요.

    python tests/test_mail_recv_host.py
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kortek_backend as bk   # noqa: E402

PASS = []
FAIL = []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok  ' if cond else '  FAIL') + ' ' + name + (('  — ' + str(detail)) if detail and not cond else ''))


# ── 경계 스텁 ────────────────────────────────────────────────
# ⚠️ 호출 **순서**로 분기하지 않는다(CLAUDE.md: 스텁은 순서에 기대지 않게). 어느 함수가
#    불렸고 어떤 host 인자를 받았는지만 기록한다.
CALLS = []


def _stub(kind, raise_exc=None):
    def fn(mail_user, mail_pw, start_dt, end_dt, scan_limit,
           keyword, keyword_from, keyword_body, stage_dir=None, host=None):
        CALLS.append({'kind': kind, 'host': host})
        if raise_exc is not None:
            raise raise_exc
        return []
    return fn


def post(body, imap_exc=None, pop3_exc=None):
    del CALLS[:]
    bk._fetch_mail_imap = _stub('imap', imap_exc)
    bk._fetch_mail_pop3 = _stub('pop3', pop3_exc)
    bk._docstore_mail_stage_dir = lambda: None
    req = {'mailUser': 'someone@example.com', 'mailPw': 'x',
           'startDate': '2026-11-01', 'endDate': '2026-11-04'}
    req.update(body)
    with bk.app.test_client() as c:
        r = c.post('/fetch-mail', json=req)
    return json.loads(r.data.decode('utf-8')), list(CALLS)


print('\n[1] 받는 서버 주소를 적으면 그 주소로 붙는다')
d, calls = post({'recvHost': 'recv.example.com'})
check('IMAP 이 recvHost 로 붙었다', calls and calls[0]['host'] == 'recv.example.com', calls)
check('응답에 recvHost 가 보인다', d.get('recvHost') == 'recv.example.com', d)

print('\n[2] 비우면 기본 수신 서버(IMAP_HOST) — 발송 주소를 물려받지 않는다')
d, calls = post({'recvHost': '', 'mailHost': 'send.example.com'})
check('host=None 으로 넘겨 기본값을 쓴다', calls and calls[0]['host'] is None, calls)
check('응답 recvHost 가 기본 IMAP_HOST', d.get('recvHost') == bk.IMAP_HOST, d)
check('무시한 발송 주소를 드러낸다', d.get('ignoredMailHost') == 'send.example.com', d)

print('\n[3] 구버전 프런트(mailHost 만 보냄)도 수신엔 안 쓴다 — 이번 사고의 핵심')
d, calls = post({'mailHost': 'send.example.com'})
check('수신은 send 주소로 안 간다', calls and calls[0]['host'] is None, calls)

print('\n[4] POP3 강제에도 같은 주소가 간다')
d, calls = post({'recvHost': 'recv.example.com', 'protocol': 'pop3'})
check('POP3 가 불렸다', calls and calls[0]['kind'] == 'pop3', calls)
check('POP3 도 recvHost 로 붙었다', calls and calls[0]['host'] == 'recv.example.com', calls)

print('\n[5] 권한 거부면 POP3 폴백 — 호스트는 그대로')
d, calls = post({'recvHost': 'recv.example.com'},
                imap_exc=bk.imaplib.IMAP4.error('have no permission.'))
check('imap→pop3 둘 다 불렸다', [c['kind'] for c in calls] == ['imap', 'pop3'], calls)
check('폴백도 같은 호스트', calls and calls[-1]['host'] == 'recv.example.com', calls)
check('폴백 사유가 보인다', 'POP3' in (d.get('fallback') or ''), d)

print('\n[6] 연결 거부(10061) — 어느 서버/포트인지와 "비밀번호 문제 아님"을 말한다')
_refused = ConnectionRefusedError(10061, 'refused')
_refused.winerror = 10061
d, calls = post({'recvHost': 'recv.example.com'}, imap_exc=_refused, pop3_exc=_refused)
msg = d.get('message') or ''
check('status=error', d.get('status') == 'error', d)
check('호스트가 문구에 있다', 'recv.example.com' in msg, msg)
check('포트가 문구에 있다', str(bk.POP3_PORT) in msg or str(bk.IMAP_PORT) in msg, msg)
check('받는 서버 주소를 보라고 안내', '받는 서버' in msg, msg)
check('비밀번호 문제로 오해할 문구가 아니다', '비밀번호 문제가 아닙니다' in msg, msg)
check('옛 날것 WinError 문구만 던지지 않는다', msg.strip() != '[WinError 10061] refused', msg)

print('\n[7] 이름 해석 실패 / 시간 초과도 구분해 말한다')
_dns = OSError(11001, 'getaddrinfo failed')
_dns.winerror = 11001
check('DNS 문구', '주소를 찾을 수 없습니다' in bk.humanize_mail_conn_error(_dns, 'h', 993, 'IMAP'))
_to = TimeoutError('timed out')
check('타임아웃 문구', '시간 초과' in bk.humanize_mail_conn_error(_to, 'h', 993, 'IMAP'))

print('\n[8] 비밀번호 오류는 그대로 중단한다(폴백 금지 — 계정 잠금 위험)')
d, calls = post({'recvHost': 'recv.example.com'},
                imap_exc=bk.imaplib.IMAP4.error('invalid user or password'))
check('POP3 로 안 넘어갔다', [c['kind'] for c in calls] == ['imap'], calls)
check('인증 실패로 보고', 'IMAP 인증 실패' in (d.get('message') or ''), d)

print('\n%d/%d 통과' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    print('실패: ' + ', '.join(FAIL))
    sys.exit(1)
