# -*- coding: utf-8 -*-
"""NAS 로그인 실패 예산(3회)과 "셀 실패/안 셀 실패" 구분을 검증한다. (2026-11-04)

왜 — 이 가드가 틀리면 둘 중 하나가 난다: ① 너무 빡빡해서 한 글자 틀린 팀원 PC 가 영구
잠긴다(1회였을 때의 실제 불만) ② 너무 느슨해서 **DSM 이 그 PC 의 IP 를 차단한다**. 그래서
"몇 번까지"와 "어떤 실패가 세는지"를 코드가 아니라 **이 파일이** 못 박는다.

가짜는 **경계에만** — `nas_dsm._call`(HTTP 한 번)만 바꿔 끼운다. 예산 계산·분류·잠금은
진짜 코드가 돈다. NAS·계정·네트워크 불필요(실제 로그인 시도 0회).

    python tests/test_nas_login_budget.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import nas_dsm as nd  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ok   ' if cond else '  FAIL ') + name + (('  — ' + str(detail)) if detail and not cond else ''))


# ── 경계 스텁 ────────────────────────────────────────────────
#  설정 읽기/복호화도 경계다(실제 파일·DPAPI 를 쓰지 않는다). 그 안쪽은 진짜 코드.
nd.load_config = lambda: {'host': 'nas.invalid', 'port': 5001, 'https': True,
                          'user': 'tester', 'pw_dpapi': 'x'}
nd._dpapi_decrypt_b64 = lambda b: 'pw'


def arm(code):
    """다음 _call 이 이 코드로 실패하게. ⚠️ 호출 순서가 아니라 **코드**로만 분기한다."""
    def fake(cfg, api, method, version, params=None, **kw):
        raise nd.NasApiError('NAS %s.%s 실패 — 테스트' % (api, method), code, api)
    nd._call = fake


def fresh():
    nd.reset_block()
    nd._SESSION.update({'sid': None, 'user': None, 'origin': None})


print('\n[1] 기본 예산은 3회 — 데이터(_LOGIN_POLICY)에 있다')
fresh()
check('maxFails == 3', nd._LOGIN_POLICY['maxFails'] == 3, nd._LOGIN_POLICY)
check('처음엔 3번 남음', nd.login_budget() == {'max': 3, 'used': 0, 'left': 3}, nd.login_budget())

print('\n[2] 비밀번호 틀림(400) — 2번까지는 다시 해 볼 수 있다')
fresh()
arm(400)
r1 = nd.login_once()
check('1번째: 잠기지 않는다', r1['retryable'] is True and not nd.is_blocked(), r1)
check('1번째: 2번 남았다고 말한다', r1['budget']['left'] == 2 and '2번' in r1['message'], r1)
r2 = nd.login_once()
check('2번째: 아직 잠기지 않는다', r2['retryable'] is True and not nd.is_blocked(), r2)
check('2번째: 1번 남음', r2['budget']['left'] == 1, r2)

print('\n[3] 3번째에 잠긴다 — 그 뒤엔 시도 자체를 안 한다')
r3 = nd.login_once()
check('3번째: 잠겼다', r3['retryable'] is False and bool(nd.is_blocked()), r3)
check('푸는 방법을 알려준다', '다시 저장' in r3['message'], r3)
tried = {'n': 0}


def counting(cfg, api, method, version, params=None, **kw):
    tried['n'] += 1
    raise nd.NasApiError('또 실패', 400, api)


nd._call = counting
r4 = nd.login_once()
check('잠긴 뒤엔 NAS 에 붙지 않는다(시도 0회)', tried['n'] == 0, tried)
check('blocked 로 보고', r4['result'] == 'blocked', r4)

print('\n[4] 설정을 다시 저장하면 풀린다(reset_block)')
nd.reset_block()
check('잠금 해제', not nd.is_blocked())
check('예산도 복구', nd.login_budget()['left'] == 3, nd.login_budget())

print('\n[5] 권한/비활성/만료(402·401·410)는 예산을 깎지 않는다 — 고칠 수 없는 이유로 기회를 잃지 않게')
for code in (401, 402, 403, 406, 408, 410):
    fresh()
    arm(code)
    r = nd.login_once()
    check('코드 %d: 예산 그대로' % code, r['budget']['left'] == 3, r)
    check('코드 %d: 잠기지 않는다' % code, not nd.is_blocked(), r)

print('\n[6] 이미 차단/잠김(407·411)은 즉시 멈춘다 — 더 두드리면 악화된다')
for code in (407, 411):
    fresh()
    arm(code)
    r = nd.login_once()
    check('코드 %d: 즉시 잠금' % code, bool(nd.is_blocked()) and r['retryable'] is False, r)

print('\n[7] 서버에 닿지도 못한 실패는 차단 카운터에 안 쌓인다 → 잠그지 않는다')
fresh()


def unreachable(cfg, api, method, version, params=None, **kw):
    raise nd.requests.RequestException('연결 실패')


nd._call = unreachable
r = nd.login_once()
check('unreachable', r['result'] == 'unreachable' and r['retryable'] is True, r)
check('잠기지 않는다', not nd.is_blocked(), r)
check('예산 그대로', nd.login_budget()['left'] == 3, nd.login_budget())

print('\n[8] 상태 조회도 남은 횟수를 같이 준다(화면이 말할 수 있게)')
fresh()
nd._call = lambda *a, **k: None          # list_share 성공처럼
nd._SESSION.update({'sid': 'x', 'user': 'tester', 'origin': nd.origin_of(nd.load_config())})
st = nd.status()
check('status().budget 있음', isinstance(st.get('budget'), dict) and st['budget']['left'] == 3, st)

print('\n%d/%d 통과' % (len(PASS), len(PASS) + len(FAIL)))
if FAIL:
    print('실패: ' + ', '.join(FAIL))
    sys.exit(1)
