#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""🔑 NAS(DSM) 로그인 정보 저장 — 사람이 터미널에서 직접 1회 실행 (python nas_set_login.py)

왜 스크립트로 받나: 비밀번호를 **채팅·명령줄 인자·로그 어디에도 남기지 않기 위해서**다.
  `getpass` 로 받으므로 화면에도 안 찍히고, 저장은 Windows DPAPI 로 암호화해
  `nas_login_config.json`(.gitignore)에만 들어간다 — 같은 Windows 계정에서만 풀린다.

⚠️ 비밀번호를 인자로 주는 방법은 일부러 만들지 않았다(명령 이력에 남는다).
⚠️ DSM 은 로그인 실패가 쌓이면 **IP 를 자동 차단**한다. 이 스크립트는 저장 직후 **한 번만**
   로그인해 보고, 실패하면 그대로 멈춘다 — 다시 돌리기 전에 아이디/비밀번호를 확인할 것.

⚠️ (2026-11-03 실측 사고) **한글 IME 가 켜진 채로 입력하면 조용히 틀린 값이 저장된다.**
   `y` 가 `ㅛ` 로 들어가 HTTP 로 저장돼 HTTPS 포트(5001)에 평문 요청이 가서 400 이 났고,
   같은 상태로 입력된 비밀번호는 getpass 가 가려 주는 탓에 사람이 알아챌 방법이 없었다.
   → 그래서 여기서는 ① y/n 을 IME 변형(ㅛ/ㅜ)까지 받아 주고, 틀린 답은 **되묻고**
     ② 비밀번호는 **두 번** 받아 맞춰 보고 ③ 값은 숨긴 채 **한글이 섞였는지 알려준다**.
     판정을 사람의 눈에 맡기면 안 되는 자리라 코드가 센다.

🖱️ `python nas_set_login.py --clip` — **타이핑 없이** 클립보드에 복사해 둔 비밀번호로 저장한다.
   (터미널에 입력이 안 들어가는 환경이 있었다. 붙여넣기도 IME 를 안 거치므로 위 사고도 안 난다)
   저장된 주소/포트/계정은 그대로 쓰고 비밀번호만 바꾼다. 성공하면 **클립보드를 비운다**.
"""
import getpass
import sys

import nas_dsm

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# 한글 2벌식에서 IME 가 켜져 있으면 y→ㅛ, n→ㅜ 로 들어온다. 그 변형까지 받아 준다.
_YES = ('y', 'ye', 'yes', 'ㅛ', '예', 'ㅇ', '1')
_NO = ('n', 'no', 'ㅜ', '아니오', '아니요', 'ㄴ', '0')


def ask(label, default=''):
    s = input('%s%s: ' % (label, (' [%s]' % default) if default else '')).strip()
    return s or default


def ask_yn(label, default=True):
    """y/n 을 **확실히** 받는다. 알아들을 수 없으면 되묻는다(조용히 '아니오'로 넘기지 않는다)."""
    d = 'y' if default else 'n'
    while True:
        s = ask('%s (y/n)' % label, d).lower()
        if s in _YES:
            return True
        if s in _NO:
            return False
        print('  ↑ y 또는 n 으로 답해주세요. (한글 IME 가 켜져 있으면 ㅛ/ㅜ 로 들어옵니다 — 그것도 받습니다)')


def ask_host(default=''):
    while True:
        s = ask('NAS 주소(IP 또는 도메인)', default)
        if not s:
            print('  ↑ 주소가 필요합니다.')
            continue
        if '://' in s or '/' in s:
            print('  ↑ 주소만 적어주세요 — http:// 나 경로는 빼고 (예: nas.사내도메인 또는 192.168.x.x)')
            continue
        if ':' in s:
            print('  ↑ 포트는 다음에 따로 물어봅니다. 주소만 적어주세요.')
            continue
        if s.isdigit():
            print('  ↑ "%s" 는 주소가 아니라 포트 같습니다. 주소를 적어주세요 (예: nas.사내도메인 또는 192.168.x.x)' % s)
            continue
        return s


def ask_port(default):
    while True:
        s = ask('포트', str(default))
        try:
            n = int(s)
        except ValueError:
            print('  ↑ 숫자로 적어주세요 (DSM 기본값: HTTPS 5001 · HTTP 5000)')
            continue
        if not (1 <= n <= 65535):
            print('  ↑ 1~65535 사이여야 합니다.')
            continue
        return n


def _pw_shape(pw):
    """비밀번호를 **드러내지 않고** 모양만 센다 — IME 가 켜져 있었는지 알아내려고."""
    han = sum(1 for c in pw if '\uac00' <= c <= '\ud7a3' or '\u3130' <= c <= '\u318f')
    nonascii = sum(1 for c in pw if ord(c) > 127)
    return han, nonascii


def ask_password(has_old):
    """비밀번호를 두 번 받아 맞춰 본다. 빈 입력은 '기존 값 유지'."""
    while True:
        if has_old:
            print('\n비밀번호: 그냥 Enter 를 치면 **저장된 기존 값**을 그대로 씁니다.')
            print('  (직전 로그인이 "아이디 또는 비밀번호" 오류였다면 기존 값이 틀린 것이니 새로 입력하세요)')
        print('⌨️  입력 전에 한글 IME 를 끄세요(한/영 키) — 켜져 있으면 조용히 한글이 섞입니다.')
        pw = getpass.getpass('비밀번호: ')
        if not pw:
            if has_old:
                return ''
            print('  ↑ 비밀번호가 필요합니다.')
            continue
        pw2 = getpass.getpass('한 번 더(확인): ')
        if pw != pw2:
            print('  ↑ 두 입력이 다릅니다. 다시 받겠습니다.')
            continue
        han, nonascii = _pw_shape(pw)
        print('  입력 확인: %d자 · 한글/자모 %d자 · ASCII 밖 %d자' % (len(pw), han, nonascii))
        if han:
            print('  ⚠️ 한글이 섞여 있습니다 — IME 가 켜진 채로 입력했을 가능성이 큽니다.')
            if not ask_yn('  그래도 이 값으로 저장할까요?', default=False):
                continue
        return pw


def _clipboard_text():
    """Windows 클립보드의 글자. 값은 **돌려주기만** 하고 어디에도 찍지 않는다."""
    import ctypes
    from ctypes import wintypes
    CF_UNICODETEXT = 13
    u32, k32 = ctypes.windll.user32, ctypes.windll.kernel32
    # ⚠️ argtypes 를 안 적으면 핸들(64비트 포인터)이 기본 c_int 로 넘어가
    #    "int too long to convert" 로 터진다. 전부 명시할 것.
    u32.OpenClipboard.argtypes = [wintypes.HWND]
    u32.IsClipboardFormatAvailable.argtypes = [wintypes.UINT]
    u32.GetClipboardData.argtypes = [wintypes.UINT]
    u32.GetClipboardData.restype = wintypes.HANDLE
    k32.GlobalLock.argtypes = [wintypes.HANDLE]
    k32.GlobalLock.restype = ctypes.c_void_p
    k32.GlobalUnlock.argtypes = [wintypes.HANDLE]
    if not u32.OpenClipboard(None):
        raise RuntimeError('클립보드를 열지 못했습니다 — 다른 프로그램이 잡고 있을 수 있습니다.')
    try:
        if not u32.IsClipboardFormatAvailable(CF_UNICODETEXT):
            raise RuntimeError('클립보드에 글자가 없습니다 — 비밀번호를 복사(Ctrl+C)한 뒤 다시 실행하세요.')
        h = u32.GetClipboardData(CF_UNICODETEXT)
        p = k32.GlobalLock(h) if h else None
        if not p:
            raise RuntimeError('클립보드 내용을 읽지 못했습니다.')
        try:
            return ctypes.wstring_at(p)
        finally:
            k32.GlobalUnlock(h)
    finally:
        u32.CloseClipboard()


def _clipboard_clear():
    import ctypes
    from ctypes import wintypes
    u32 = ctypes.windll.user32
    u32.OpenClipboard.argtypes = [wintypes.HWND]
    if u32.OpenClipboard(None):
        try:
            u32.EmptyClipboard()
        finally:
            u32.CloseClipboard()


def from_clipboard():
    """저장된 주소/계정은 그대로, 비밀번호만 클립보드에서 받아 저장하고 1회 로그인."""
    old = nas_dsm.load_config() or {}
    if not old.get('host') or not old.get('user'):
        print('❌ 주소/계정이 아직 없습니다 — 먼저 `python nas_set_login.py` 로 한 번 등록하세요.')
        return 1
    try:
        pw = _clipboard_text()
    except Exception as e:
        print('❌ %s' % e)
        return 1
    raw_len = len(pw)
    pw = pw.strip('\r\n')
    if not pw:
        print('❌ 클립보드가 비어 있습니다 — 비밀번호를 복사한 뒤 다시 실행하세요.')
        return 1
    han, nonascii = _pw_shape(pw)
    print('클립보드에서 받았습니다: %d자 · 한글/자모 %d자 · ASCII 밖 %d자%s'
          % (len(pw), han, nonascii, ' (줄바꿈 제거)' if raw_len != len(pw) else ''))
    if han:
        print('⚠️ 한글이 섞여 있습니다 — 복사한 값이 정말 비밀번호인지 확인하세요.')
    try:
        saved = nas_dsm.save_config(old['host'], old.get('port') or 5001,
                                   old.get('https', True), old['user'], pw)
    finally:
        pw = None
    print('저장했습니다: %s://%s:%s · 계정 %s'
          % ('https' if saved['https'] else 'http', saved['host'], saved['port'], saved['user']))

    print('\n로그인을 **한 번만** 시도합니다...')
    r = try_login_once()
    if not r.get('ok'):
        print('\n  실패했습니다 — 다시 시도하기 전에 값을 확인하세요'
              ' (반복 실패하면 NAS 가 이 PC 의 IP 를 차단합니다).')
        print('   · DSM 웹(%s://%s:%s)에 같은 값으로 직접 로그인되는지가 가장 빠른 확인입니다'
              % ('https' if saved['https'] else 'http', saved['host'], saved['port']))
        return 1
    _clipboard_clear()
    print('  (클립보드를 비웠습니다 — 비밀번호가 남아 있지 않게)')

    shares = nas_dsm.list_shares()
    print('\n이 계정이 볼 수 있는 공유폴더 %d개:' % len(shares))
    for s in shares:
        print('  · %s  (%s)' % (s['name'], s['path']))
    print('\n다음: python tests/nas-dsm-probe.py  — 팀별 폴더 권한과 속도를 잽니다.')
    return 0


def try_login_once():
    """로그인 1회. OTP 가 필요하다고 하면 **사람에게 코드를 받아** 한 번 더(= 새 자격증명이므로 재시도 아님)."""
    r = nas_dsm.login_once()
    print('  → %s' % r.get('message'))
    if r.get('ok'):
        return r
    msg = r.get('message') or ''
    if '2단계 인증(OTP) 코드가 필요' in msg:
        print('\n  2단계 인증이 걸린 계정입니다. 인증 앱의 6자리 코드를 넣어주세요.')
        code = ask('  OTP 코드(6자리, 빈칸이면 중단)').strip()
        if code:
            nas_dsm.reset_block()      # 비밀번호 실패가 아니라 "코드가 더 필요"였다
            r = nas_dsm.login_once(otp=code)
            print('  → %s' % r.get('message'))
    return r


def main():
    old = nas_dsm.load_config() or {}
    print('NAS(DSM) 로그인 정보를 저장합니다. 비밀번호는 화면에 안 보입니다.')
    print('(엔터만 치면 [ ] 안의 기존 값을 그대로 씁니다)\n')

    host = ask_host(old.get('host', ''))
    use_https = ask_yn('HTTPS 를 쓸까요?', default=bool(old.get('https', True)))
    port = ask_port(old.get('port') or (5001 if use_https else 5000))
    if use_https and port == 5000:
        print('  ⚠️ 5000 번은 DSM 의 **HTTP** 포트입니다. HTTPS 는 보통 5001 입니다.')
    if (not use_https) and port == 5001:
        print('  ⚠️ 5001 번은 DSM 의 **HTTPS** 포트입니다 — HTTP 로 보내면 400 이 돌아옵니다.')
    user = ask('DSM 계정 아이디', old.get('user', ''))
    if not user:
        print('아이디가 필요합니다.')
        return 1

    pw = ask_password(bool(old.get('pw_dpapi')))
    try:
        saved = nas_dsm.save_config(host, port, use_https, user, pw)
    finally:
        pw = None
    print('\n저장했습니다: %s://%s:%s · 계정 %s'
          % ('https' if saved['https'] else 'http', saved['host'], saved['port'], saved['user']))
    if not saved['https']:
        print('⚠️ HTTP 로 설정했습니다 — 비밀번호가 평문으로 나갑니다. 가능하면 HTTPS(5001)를 쓰세요.')

    print('\n로그인을 **한 번만** 시도합니다...')
    r = try_login_once()
    if not r.get('ok'):
        print('\n  실패했습니다. 다시 시도하기 전에 아래를 확인하세요'
              ' (반복 실패하면 NAS 가 이 PC 의 IP 를 차단합니다).')
        if '아이디 또는 비밀번호' in (r.get('message') or ''):
            print('   · 한글 IME 를 끄고 비밀번호를 **다시 입력**해보세요(가장 흔한 원인입니다)')
            print('   · 계정 아이디가 DSM 에 보이는 그 이름인지 — 사내 계정 연동이면'
                  ' "%s" 처럼 도메인이 붙는 형태일 수도 있습니다' % (user + '@회사도메인'))
            print('   · DSM 웹(https://%s:%s)에 같은 값으로 직접 로그인되는지 먼저 확인하는 게 가장 빠릅니다'
                  % (saved['host'], saved['port']))
        return 1

    shares = nas_dsm.list_shares()
    print('\n이 계정이 볼 수 있는 공유폴더 %d개:' % len(shares))
    for s in shares:
        print('  · %s  (%s)' % (s['name'], s['path']))
    print('\n다음: python tests/nas-dsm-probe.py  — 팀별 폴더 권한과 속도를 잽니다.')
    return 0


if __name__ == '__main__':
    if '--clip' in sys.argv[1:]:
        raise SystemExit(from_clipboard())
    raise SystemExit(main())
