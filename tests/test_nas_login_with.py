# -*- coding: utf-8 -*-
"""🔑 받은 아이디·비밀번호로 로그인(`login_with`) — 예산·저장 규칙 (2026-11-09)

⚠️ 진짜 NAS 에 접속하지 않는다. 가짜는 **경계 하나**(`_call`, DSM HTTP 왕복)뿐이고
   예산·잠금·저장 판단은 전부 진짜 코드가 한다.
⚠️ 사용자가 돌리는 5000번 백엔드를 죽이지 않는다 — 모듈을 직접 들여서 본다.

    py -3 tests/test_nas_login_with.py
"""
import os
import sys
import json
import tempfile

# ⚠️ 콘솔이 cp949 면 한글·기호에서 터진다 — 실패 내용을 못 보고 놓친다.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import nas_dsm as N                                        # noqa: E402

_pass = 0
_fail = 0


def ok(name, cond, detail=None):
    global _pass, _fail
    if cond:
        _pass += 1
        print('  OK   ' + name)
    else:
        _fail += 1
        print('  FAIL ' + name + ('  — ' + str(detail) if detail is not None else ''))


class Api(Exception):
    pass


def setup(saved=None):
    """설정 파일을 임시 폴더로 돌려놓고, DSM 왕복만 가짜로."""
    fd, path = tempfile.mkstemp(suffix='.json')
    os.close(fd)
    os.remove(path)
    N.NAS_LOGIN_CFG = path
    if saved:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(saved, f)
    N.reset_block()
    N._SESSION.update({'sid': None, 'user': None, 'origin': None})
    return path


def fake_call(accept_user, accept_pw, calls):
    def _c(cfg, api, method, version, params=None, **kw):
        calls.append({'api': api, 'method': method, 'user': (params or {}).get('account')})
        if api == 'SYNO.API.Auth' and method == 'login':
            if (params or {}).get('account') == accept_user and (params or {}).get('passwd') == accept_pw:
                return {'sid': 'SID-' + accept_user}
            raise N.NasApiError('비밀번호가 맞지 않습니다', 400, api)   # 400 = 예산을 깎는 실패
        return {}
    return _c


def main():
    # DPAPI 는 이 PC 의 것이라 그대로 쓴다(저장 규칙을 보려면 진짜로 써 봐야 한다).
    real_call = N._call

    # ── ① 틀리면 예산이 깎이고, 바닥나면 잠긴다 ──────────────────────────
    setup()
    N.load_defaults = lambda: {'host': 'nas.example', 'port': 5001, 'https': True}
    calls = []
    N._call = fake_call('yhpark', 'right', calls)
    budgets = []
    for i in range(N._LOGIN_POLICY['maxFails'] + 1):
        r = N.login_with('yhpark', 'wrong')
        budgets.append((r.get('result'), (r.get('budget') or {}).get('left')))
    ok('틀린 횟수만큼 예산이 줄어든다', [b[1] for b in budgets][:3] == [2, 1, 0], budgets)
    ok('바닥나면 잠긴다(더 두드리지 않는다)', budgets[-1][0] == 'blocked', budgets)
    ok('잠긴 뒤엔 NAS 로 나가지도 않는다',
       len([c for c in calls if c['method'] == 'login']) == N._LOGIN_POLICY['maxFails'],
       len(calls))

    # ⚠️⚠️ 이게 이 파일에서 가장 중요한 시험이다 — "저장 → 로그인" 순서로 짜면
    #    save_config 가 reset_block() 을 불러 **틀릴 때마다 예산이 되살아나** 잠금이 영영 안 걸린다.
    #    그러면 우리 안전장치 대신 DSM 자신의 자동 차단이 그 PC 의 IP 를 진짜로 막는다.
    ok('틀린 로그인은 아무것도 저장하지 않는다', not os.path.exists(N.NAS_LOGIN_CFG),
       '설정 파일이 생겼다 = 저장이 먼저 일어났다')

    # ── ② 맞으면 들어간다. save 를 안 주면 저장하지 않는다 ───────────────
    setup()
    calls = []
    N._call = fake_call('yhpark', 'right', calls)
    r = N.login_with('yhpark', 'right')
    ok('맞으면 로그인된다', r.get('ok') and r.get('user') == 'yhpark', r)
    ok('save 를 안 주면 이 PC 에 안 남는다', r.get('saved') is False and not os.path.exists(N.NAS_LOGIN_CFG), r)
    ok('비밀번호를 응답에 싣지 않는다', 'right' not in json.dumps(r, ensure_ascii=False), r)
    ok('세션은 그 사람으로 선다', N._SESSION.get('user') == 'yhpark', N._SESSION.get('user'))

    # ── ③ save=True 면 저장되고, 저장 뒤에도 세션이 살아 있다 ────────────
    setup()
    calls = []
    N._call = fake_call('yhpark', 'right', calls)
    r = N.login_with('yhpark', 'right', save=True)
    ok('save 면 저장된다', r.get('saved') is True and os.path.exists(N.NAS_LOGIN_CFG), r)
    ok('저장 뒤에도 로그인 상태가 유지된다', bool(N._SESSION.get('sid')), N._SESSION.get('sid'))
    saved = json.load(open(N.NAS_LOGIN_CFG, encoding='utf-8'))
    ok('비밀번호는 평문으로 안 남는다', 'right' not in json.dumps(saved) and saved.get('pw_dpapi'), list(saved))

    # ── ④ 앱 폴더(root)는 사람이 바뀌어도 지켜진다 ──────────────────────
    setup({'host': 'nas.example', 'port': 5001, 'https': True, 'user': 'old',
           'pw_dpapi': N._dpapi_encrypt_b64('x'), 'root': '/팀공용/KORTEK_PM'})
    calls = []
    N._call = fake_call('yijang', 'ok2', calls)
    r = N.login_with('yijang', 'ok2', save=True)
    after = json.load(open(N.NAS_LOGIN_CFG, encoding='utf-8'))
    ok('다른 사람으로 저장해도 앱 폴더는 그대로', after.get('root') == '/팀공용/KORTEK_PM', after.get('root'))
    ok('계정은 새 사람으로 바뀐다', after.get('user') == 'yijang', after.get('user'))
    ok('주소는 저장돼 있던 것을 쓴다', after.get('host') == 'nas.example', after.get('host'))

    # ── ⑤ 이미 잠겨 있으면 시도조차 안 한다 ─────────────────────────────
    setup()
    N._BLOCKED['reason'] = '이미 잠김'
    calls = []
    N._call = fake_call('yhpark', 'right', calls)
    r = N.login_with('yhpark', 'right')
    ok('잠겨 있으면 NAS 로 안 나간다', r.get('result') == 'blocked' and not calls, (r.get('result'), len(calls)))
    N.reset_block()

    # ── ⑥ 아이디·비밀번호가 비면 그냥 거절(예산을 안 깎는다) ─────────────
    setup()
    calls = []
    N._call = fake_call('yhpark', 'right', calls)
    before = N.login_budget()['left']
    r = N.login_with('', '')
    ok('빈 입력은 예산을 안 깎는다', r.get('result') == 'need_credentials' and N.login_budget()['left'] == before,
       (r.get('result'), before, N.login_budget()['left']))

    N._call = real_call
    try:
        os.remove(N.NAS_LOGIN_CFG)
    except Exception:
        pass
    print('\n' + ('OK  ' if _fail == 0 else 'FAIL ') + '%d/%d 통과' % (_pass, _pass + _fail))
    return 1 if _fail else 0


if __name__ == '__main__':
    sys.exit(main())
