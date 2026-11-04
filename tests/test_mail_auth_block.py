# -*- coding: utf-8 -*-
"""메일 인증 실패를 백엔드가 **플래그로** 알리는지 검증한다. (2026-11-04)

왜 — 프런트가 "인증 실패"를 한국어 문구로 뒤져서 알아내면, 문구를 한 번 다듬는 순간
조용히 안 걸린다. 그러면 자동수집이 **1분마다 거부당한 로그인을 반복**한다(계정 잠금).
그래서 `auth: true` 플래그를 응답 계약으로 못 박는다.

가짜는 경계에만 — `_fetch_mail_imap`/`_fetch_mail_pop3` 두 함수만. 네트워크·계정 불필요.

    python tests/test_mail_auth_block.py
"""
import json
import os
import poplib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kortek_backend as bk  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail and not cond else ''))


def post(imap_exc=None, pop3_exc=None, body=None):
    def mk(exc):
        def fn(*a, **kw):
            if exc is not None:
                raise exc
            return []
        return fn
    bk._fetch_mail_imap = mk(imap_exc)
    bk._fetch_mail_pop3 = mk(pop3_exc)
    bk._docstore_mail_stage_dir = lambda: None
    req = {'mailUser': 'someone@example.com', 'mailPw': 'x',
           'startDate': '2026-11-01', 'endDate': '2026-11-04'}
    req.update(body or {})
    with bk.app.test_client() as c:
        r = c.post('/fetch-mail', json=req)
    return json.loads(r.data.decode('utf-8'))


print('\n[1] POP3 거부(-ERR invalid user or password) — auth 플래그가 선다')
d = post(pop3_exc=poplib.error_proto(b'-ERR invalid user or password'),
         body={'protocol': 'pop3'})
check('status=error', d.get('status') == 'error', d)
check('auth=True', d.get('auth') is True, d)
check('proto 를 알려준다', d.get('proto') == 'pop3', d)
check('어느 서버인지 적혀 있다', bk.POP3_HOST in (d.get('message') or ''), d)
check('포트도 적혀 있다', str(bk.POP3_PORT) in (d.get('message') or ''), d)

print('\n[2] 계정은 **가려서** 적는다 — 로그·화면에 통째로 남기지 않는다')
msg = d.get('message') or ''
check('계정 전체가 안 나온다', 'someone@example.com' not in msg, msg)
check('앞 두 글자 + 도메인만', 'so***@example.com' in msg, msg)

print('\n[3] IMAP 인증 실패도 같은 계약')
d = post(imap_exc=bk.imaplib.IMAP4.error('invalid user or password'))
check('auth=True', d.get('auth') is True, d)
check('proto=imaps', d.get('proto') == 'imaps', d)

print('\n[4] 권한 거부는 auth 가 아니다 — POP3 로 넘어가 성공한다(멈추면 안 된다)')
d = post(imap_exc=bk.imaplib.IMAP4.error('have no permission.'))
check('성공', d.get('status') == 'success', d)
check('auth 플래그 없음', not d.get('auth'), d)

print('\n[5] 연결 거부도 auth 가 아니다 — 서버에 닿지도 못했으니 실패가 쌓이지 않는다')
_ref = ConnectionRefusedError(10061, 'refused')
_ref.winerror = 10061
d = post(imap_exc=_ref, pop3_exc=_ref)
check('status=error', d.get('status') == 'error', d)
check('auth 플래그 없음', not d.get('auth'), d)

print('\n[6] 정상이면 아무 플래그도 없다')
d = post()
check('성공', d.get('status') == 'success', d)
check('auth 없음', not d.get('auth'), d)

print('\n%d/%d 통과' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    print('실패: ' + ', '.join(FAIL))
    sys.exit(1)
