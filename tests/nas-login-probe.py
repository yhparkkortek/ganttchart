#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🔐 DSM 로그인이 402(권한 없음)로 막힐 때 — 어느 관문인지 가르는 프로브
   (python tests/nas-login-probe.py)

왜 있나: `SYNO.API.Auth.login` 의 실패는 원인이 전혀 다른 둘로 나뉘는데 메시지만 보면 안 갈린다.
  · **400** = 아이디/비밀번호가 틀림 → **실패가 쌓이면 NAS 가 이 PC 의 IP 를 차단한다**
  · **402** = 자격증명은 통과, 그다음 **인가**에서 거부 (응용 프로그램 권한 / 2단계 인증 정책 등)
  402 는 비밀번호 카운터에 쌓이지 않으므로, 402 인 동안에는 API **버전만** 바꿔 보는 게 안전하다.
  (DSM 버전에 따라 login 의 동작이 v3/v6/v7 에서 달라지는 사례가 있다)

⚠️ **400 이 한 번이라도 나오면 그 자리에서 멈춘다** — 그 뒤로는 사람이 확인해야 한다.
⚠️ 비밀번호는 DPAPI 저장소에서 읽어 메모리에만 둔다. 찍지 않고, 쿼리스트링에 싣지 않는다(POST).
⚠️ 읽기만 한다. 로그인에 성공하면 공유폴더 목록까지 보고 **로그아웃**한다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests  # noqa: E402
import urllib3  # noqa: E402

import nas_dsm  # noqa: E402

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# 이 코드가 나오면 더 시도하지 않는다 — 쌓이면 계정/IP 가 잠긴다.
_STOP = {400: '아이디 또는 비밀번호가 틀림', 407: 'IP 차단됨', 411: '계정 잠김',
         401: '계정 비활성', 408: '비밀번호 만료', 409: '비밀번호 만료(변경 필요)',
         410: '비밀번호 변경 필요'}


def attempt(cfg, pw, version):
    url = nas_dsm.origin_of(cfg) + '/webapi/entry.cgi'
    body = {'api': 'SYNO.API.Auth', 'method': 'login', 'version': version,
            'account': cfg['user'], 'passwd': pw, 'session': 'KortekGantt', 'format': 'sid'}
    try:
        r = requests.post(url, data=body, verify=False, timeout=30)
        r.raise_for_status()
        j = r.json()
    except Exception as e:
        return None, 'HTTP 실패: %s' % e
    if j.get('success'):
        return (j.get('data') or {}).get('sid'), None
    return None, ((j.get('error') or {}).get('code'))


def main():
    cfg = nas_dsm.load_config()
    if not cfg:
        print('❌ 저장된 NAS 설정이 없습니다 — `python nas_set_login.py` 먼저.')
        return 1
    try:
        pw = nas_dsm._dpapi_decrypt_b64(cfg['pw_dpapi'])
    except Exception as e:
        print('❌ %s' % e)
        return 1

    print('대상: %s · 계정 %s' % (nas_dsm.origin_of(cfg), cfg['user']))
    print('(비밀번호는 저장소에서 읽어 메모리에만 둡니다 — 출력하지 않습니다)\n')

    sid = None
    try:
        for v in (7, 6, 3, 2):
            sid, err = attempt(cfg, pw, v)
            if sid:
                print('  v%-2d → ✅ 로그인 성공' % v)
                break
            if isinstance(err, int) and err in _STOP:
                print('  v%-2d → ⛔ %s (코드 %s)' % (v, _STOP[err], err))
                print('\n여기서 멈춥니다 — 더 시도하면 계정/IP 가 잠깁니다.')
                return 1
            print('  v%-2d → ❌ %s' % (v, nas_dsm._msg(err) if isinstance(err, int) else err))
    finally:
        pw = None

    if not sid:
        print('\n모든 버전에서 인가 거부(402)입니다 — **비밀번호 문제가 아닙니다.**')
        print('NAS 관리자 화면에서 이 계정에 확인할 것:')
        print('  ① 제어판 ▸ 사용자 및 그룹 ▸ %s ▸ **응용 프로그램** — DSM / File Station 이 "허용"인지'
              % cfg['user'])
        print('  ② 제어판 ▸ 보안 ▸ 계정 — 2단계 인증을 **강제**하고 있지 않은지')
        print('  ③ 그 계정이 DSM 웹(%s)에 직접 로그인되는지 — 웹은 되고 API 만 402 면 ①이 원인입니다'
              % nas_dsm.origin_of(cfg))
        return 1

    nas_dsm._SESSION.update({'sid': sid, 'user': cfg['user'], 'origin': nas_dsm.origin_of(cfg)})
    try:
        shares = nas_dsm.list_shares()
        print('\n볼 수 있는 공유폴더 %d개:' % len(shares))
        for s in shares:
            print('  · %-22s %s' % (s['name'], s['path']))
        print('\n다음: python tests/nas-dsm-probe.py  — 팀별 폴더 권한과 속도를 잽니다.')
    finally:
        nas_dsm.logout()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
