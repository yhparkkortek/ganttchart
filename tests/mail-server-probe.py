# -*- coding: utf-8 -*-
"""메일 서버가 **무엇을 요구하는지** 관찰한다. (2026-11-04)

⚠️⚠️ **로그인을 시도하지 않는다.** USER/PASS·LOGIN 명령을 보내지 않는다 —
   실패가 쌓이면 계정이 잠긴다(이 저장소의 SAP·그룹웨어·NAS 와 같은 규칙).
   인사말(greeting)과 능력 목록(CAPA / CAPABILITY)만 읽는다. 이건 로그인 전에
   누구나 받는 정보라 카운터에 쌓이지 않는다.

왜 — `-ERR invalid user or password` 는 **"그 서버가 이 조합을 거부했다"** 는 뜻이지
"비밀번호가 틀렸다"는 뜻이 아니다. 아래 중 어느 것이어도 같은 문구가 나온다:
  ① 평문 포트(110)에서 평문 로그인을 막아 둔 경우(STLS 필요)
  ② 아이디 형식이 다른 경우(`user` vs `user@도메인`)
  ③ 그 계정에 그 프로토콜 권한이 없는 경우
  ④ 정말로 비밀번호가 틀린 경우
서버가 뭘 광고하는지 보면 ①을 먼저 가를 수 있다.

    py -3 tests/mail-server-probe.py [호스트 ...]
"""
import socket
import ssl
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

HOSTS = sys.argv[1:] or ['gw.kortek.co.kr', 'kmail.kortek.co.kr']
TIMEOUT = 6


def talk(host, port, use_ssl, kind):
    """인사말 + 능력 목록만 읽고 정중히 끊는다."""
    out = {'port': port, 'ssl': use_ssl, 'ok': False}
    try:
        raw = socket.create_connection((host, port), TIMEOUT)
        if use_ssl:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            raw = ctx.wrap_socket(raw, server_hostname=host)
        raw.settimeout(TIMEOUT)
        f = raw.makefile('rb')
        out['greeting'] = f.readline().decode('utf-8', 'replace').strip()
        if kind == 'pop3':
            raw.sendall(b'CAPA\r\n')
            caps = []
            while True:
                line = f.readline().decode('utf-8', 'replace').strip()
                if not line or line == '.':
                    break
                caps.append(line)
                if line.startswith('-ERR'):
                    break
                if len(caps) > 40:
                    break
            out['caps'] = caps
            try:
                raw.sendall(b'QUIT\r\n')
            except Exception:
                pass
        else:
            raw.sendall(b'a1 CAPABILITY\r\n')
            caps = []
            while True:
                line = f.readline().decode('utf-8', 'replace').strip()
                if not line:
                    break
                caps.append(line)
                if line.startswith('a1 ') or len(caps) > 20:
                    break
            out['caps'] = caps
            try:
                raw.sendall(b'a2 LOGOUT\r\n')
            except Exception:
                pass
        out['ok'] = True
        raw.close()
    except Exception as e:
        out['error'] = '%s: %s' % (type(e).__name__, e)
    return out


PORTS = [(110, False, 'pop3'), (995, True, 'pop3'), (143, False, 'imap'), (993, True, 'imap')]

for host in HOSTS:
    print('\n═══ %s ═══' % host)
    for port, use_ssl, kind in PORTS:
        r = talk(host, port, use_ssl, kind)
        tag = '%s/%d%s' % (kind.upper(), port, ' SSL' if use_ssl else '')
        if not r['ok']:
            print('  %-14s ✗ %s' % (tag, r.get('error')))
            continue
        print('  %-14s ✓ %s' % (tag, r.get('greeting')))
        for c in r.get('caps', []):
            print('                 · %s' % c)
