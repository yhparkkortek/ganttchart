#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🔑 NAS(DSM) 로그인 정보 저장 — 사람이 터미널에서 직접 1회 실행 (python nas_set_login.py)

왜 스크립트로 받나: 비밀번호를 **채팅·명령줄 인자·로그 어디에도 남기지 않기 위해서**다.
  `getpass` 로 받으므로 화면에도 안 찍히고, 저장은 Windows DPAPI 로 암호화해
  `nas_login_config.json`(.gitignore)에만 들어간다 — 같은 Windows 계정에서만 풀린다.

⚠️ 비밀번호를 인자로 주는 방법은 일부러 만들지 않았다(명령 이력에 남는다).
⚠️ DSM 은 로그인 실패가 쌓이면 **IP 를 자동 차단**한다. 이 스크립트는 저장 직후 **한 번만**
   로그인해 보고, 실패하면 그대로 멈춘다 — 다시 돌리기 전에 아이디/비밀번호를 확인할 것.
"""
import getpass
import sys

import nas_dsm

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def ask(label, default=''):
    s = input('%s%s: ' % (label, (' [%s]' % default) if default else '')).strip()
    return s or default


def main():
    old = nas_dsm.load_config() or {}
    print('NAS(DSM) 로그인 정보를 저장합니다. 비밀번호는 화면에 안 보입니다.')
    print('(엔터만 치면 [ ] 안의 기존 값을 그대로 씁니다)\n')

    host = ask('NAS 주소(IP 또는 도메인)', old.get('host', ''))
    if not host:
        print('주소가 필요합니다.')
        return 1
    use_https = ask('HTTPS 를 쓸까요? (y/n)', 'y' if old.get('https', True) else 'n').lower().startswith('y')
    port = ask('포트', str(old.get('port') or (5001 if use_https else 5000)))
    user = ask('DSM 계정 아이디', old.get('user', ''))
    if not user:
        print('아이디가 필요합니다.')
        return 1

    pw = getpass.getpass('비밀번호(엔터=기존 값 유지): ')
    if not pw and not old.get('pw_dpapi'):
        print('비밀번호가 필요합니다.')
        return 1

    try:
        saved = nas_dsm.save_config(host, port, use_https, user, pw)
    finally:
        pw = None
    print('\n저장했습니다: %s://%s:%s · 계정 %s'
          % ('https' if saved['https'] else 'http', saved['host'], saved['port'], saved['user']))
    if not saved['https']:
        print('⚠️ HTTP 로 설정했습니다 — 비밀번호가 평문으로 나갑니다. 가능하면 HTTPS(5001)를 쓰세요.')

    print('\n로그인을 **한 번만** 시도합니다...')
    r = nas_dsm.login_once()
    print('  → %s' % r.get('message'))
    if not r.get('ok'):
        print('  실패했습니다. 다시 시도하기 전에 아이디/비밀번호를 확인하세요'
              ' (반복 실패하면 NAS 가 이 PC 의 IP 를 차단합니다).')
        if r.get('result') == 'failed':
            print('  2단계 인증(OTP)이 걸린 계정이면 지금 구조로는 자동 로그인이 안 됩니다 — 알려주세요.')
        return 1

    shares = nas_dsm.list_shares()
    print('\n이 계정이 볼 수 있는 공유폴더 %d개:' % len(shares))
    for s in shares:
        print('  · %s  (%s)' % (s['name'], s['path']))
    print('\n다음: python tests/nas-dsm-probe.py  — 팀별 폴더 권한과 속도를 잽니다.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
