#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🔐 DSM 로그인이 402(권한 없음)로 막힐 때 — 어느 관문인지 가르는 프로브
   (python tests/nas-login-probe.py)

왜 있나: `SYNO.API.Auth.login` 의 실패는 원인이 전혀 다른 둘로 나뉘는데 메시지만 보면 안 갈린다.
  · **400** = 아이디/비밀번호가 틀림 → **실패가 쌓이면 NAS 가 이 PC 의 IP 를 차단한다**
  · **402** = 자격증명은 통과, 그다음 **인가**에서 거부
  402 는 비밀번호 카운터에 쌓이지 않으므로, 402 인 동안에만 안전하게 더듬을 수 있다.

무엇을 바꿔 보나 — **`session` 이름이 제일 먼저다**:
  DSM 은 `session` 값으로 "어느 응용 프로그램에 로그인하는가"를 판정하고, 그 응용 프로그램에
  대한 계정 권한을 본다. 그래서 **임의의 이름**(처음엔 `KortekGantt` 라고 넣었다)은 권한을
  못 찾아 402 가 될 수 있다. Synology FileStation 문서가 쓰는 값은 `FileStation` 이고,
  경로도 `entry.cgi` 가 아니라 `auth.cgi` 를 쓴다.

⚠️ **402 이외의 코드가 나오면 그 자리에서 멈춘다** — 400/407/411 은 쌓이면 잠긴다.
⚠️ 시도 횟수를 일부러 적게(3개) 잡았다 — DSM 자동 차단이 402 까지 세는지 확실하지 않다.
   한 번에 수십 번 두드리면 그것만으로 차단될 수 있다. 추측으로 범위를 넓히지 말 것.
⚠️ 비밀번호는 DPAPI 저장소에서 읽어 메모리에만 둔다. 찍지 않고, **POST 본문**으로만 보낸다.
"""
import os
import sys
import time

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
         401: '계정 비활성', 403: '2단계 인증 코드 필요', 404: '2단계 인증 코드 불일치',
         406: '2단계 인증을 먼저 설정해야 함', 408: '비밀번호 만료',
         409: '비밀번호 만료(변경 필요)', 410: '비밀번호 변경 필요'}

# (경로, 버전, session) — 가능성 높은 순. 이미 402 로 확인된 조합(entry.cgi/KortekGantt)은 뺀다.
_TRIES = [
    ('auth.cgi', 3, 'FileStation'),    # Synology FileStation 문서가 쓰는 조합
    ('entry.cgi', 7, 'FileStation'),   # 최신 버전 + 올바른 session 이름
    ('entry.cgi', 7, 'DSM'),           # DSM 본체 세션
]


def attempt(cfg, pw, path, version, session):
    url = '%s/webapi/%s' % (nas_dsm.origin_of(cfg), path)
    body = {'api': 'SYNO.API.Auth', 'method': 'login', 'version': version,
            'account': cfg['user'], 'passwd': pw, 'session': session, 'format': 'sid'}
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
    print('(비밀번호는 저장소에서 읽어 메모리에만 둡니다 — 출력하지 않습니다)')
    print('이미 확인된 것: entry.cgi · v7/v6/v3 · session=KortekGantt → 전부 402\n')

    sid = None
    try:
        for path, v, sess in _TRIES:
            label = '%s v%d session=%s' % (path, v, sess)
            sid, err = attempt(cfg, pw, path, v, sess)
            if sid:
                print('  %-34s → ✅ 로그인 성공' % label)
                break
            if isinstance(err, int) and err in _STOP:
                print('  %-34s → ⛔ %s (코드 %s)' % (label, _STOP[err], err))
                print('\n여기서 멈춥니다 — 402 가 아닌 코드는 반복하면 계정/IP 가 잠깁니다.')
                return 1
            print('  %-34s → ❌ %s'
                  % (label, nas_dsm._msg(err) if isinstance(err, int) else err))
            time.sleep(1.0)      # 한 번에 몰아 두드리지 않는다
    finally:
        pw = None

    if not sid:
        print('\nsession 이름·경로를 바꿔도 전부 402입니다 — **코드 쪽 문제가 아닙니다.**')
        print('NAS 관리자 화면에서 이 계정에 확인할 것:')
        print('  ① 제어판 ▸ 사용자 및 그룹 ▸ 사용자 탭 ▸ (계정 선택) ▸ **[편집] 버튼**')
        print('     → 열리는 창의 **"응용 프로그램 권한"** 탭 (목록 화면엔 안 보인다)')
        print('     → `File Station` 이 "허용"인지. 거부면 그게 원인이다')
        print('  ② [편집] 창이 아예 없다 = 그 계정이 **관리자가 아니다** → 관리자에게 요청')
        print('  ③ 제어판 ▸ 보안 ▸ 계정 — 2단계 인증을 **강제**하고 있지 않은지')
        return 1

    nas_dsm._SESSION.update({'sid': sid, 'user': cfg['user'], 'origin': nas_dsm.origin_of(cfg)})
    try:
        shares = nas_dsm.list_shares()
        print('\n볼 수 있는 공유폴더 %d개:' % len(shares))
        for s in shares:
            print('  · %-22s %s' % (s['name'], s['path']))
        print('\n→ `nas_dsm.py` 의 session 값을 성공한 이름으로 바꿀 것.')
        print('   다음: python tests/nas-dsm-probe.py  — 팀별 폴더 권한과 속도를 잽니다.')
    finally:
        nas_dsm.logout()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
