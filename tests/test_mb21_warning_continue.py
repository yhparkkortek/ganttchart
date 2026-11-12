# py -3 tests/test_mb21_warning_continue.py
#
# 🐛 MB21 저장 중 "주의"급 상태바 메시지(예: "자재 121196는(은) 플랜트 1000에서 상태
#    관리자재입니다")를 엔터로 넘기고 저장을 다시 시도하는지 검증(2026-11-12 사용자 제보).
#
# 사용자 제보 실패 사례:
#   상태바: "자재 121196는(은) 플랜트 1000에서 상태 관리자재입니다"
#   ⚠️ 실패 1건: MB21 저장을 끝내지 못했습니다.
#     저장이 끝나지 않았고 텍스트 입력칸도 없습니다.
#     화면: MB23/SAPMM07R/560 "예약조회: 초기화면" · 팝업 없음
#
#   → 예전 코드는 텍스트 칸(RESB-SGTXT)이 안 보이면 바로 실패로 처리했다. 그 직전에
#     "예약번호 회수"를 한 번 더 시도(_mb21_read_last_rsnum)하는데, 그 함수가 MB23으로
#     **화면을 옮겨 버려서** 실패 보고의 "화면"이 실제 멈춘 자리(MB21)가 아니라 그 부작용
#     (MB23)으로 찍혔다 — 두 가지 문제(경고를 못 넘김 + 진단이 엉뚱한 화면을 가리킴)를
#     같이 고친다.
#
# SAP 없이 돈다. 가짜는 COM 경계(session/wnd/sbar)에만 두고, 안쪽은 진짜
# `_mb21_fill_texts_and_save`/`_sap_status_type`/`_sap_send_vkey` 코드를 그대로 돌린다.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sap_bridge_32 as B  # noqa: E402

B.time.sleep = lambda s: None  # 실제 대기 없이 빠르게 돈다(기존 test_approval_reuse_branch.py 와 같은 방식)

_pass, _fail = 0, 0


def eq(label, got, want):
    global _pass, _fail
    if got == want:
        _pass += 1
        print('  OK  ' + label)
    else:
        _fail += 1
        print('  XX  ' + label + '  got=' + repr(got) + ' want=' + repr(want))


# ── 가짜 COM 객체 — "저장(vkey 11) 몇 번째 시도인가"에 따라 상태바/화면이 바뀐다 ──────

class EmptyChildren(object):
    Count = 0

    def Item(self, i):
        raise IndexError('no children')


class FakeField(object):
    def __init__(self, text=''):
        self.Text = text
        self.text = text


class FakeWnd(object):
    Id = 'wnd[0]'
    Text = ''

    def __init__(self, sess):
        self._sess = sess

    @property
    def Children(self):
        return EmptyChildren()   # RESB-SGTXT 입력칸이 전혀 없는 화면(사용자 제보와 같음)

    def sendVKey(self, k):
        self._sess.on_vkey(k)


class FakeSbar(object):
    def __init__(self, sess):
        self._sess = sess

    @property
    def Text(self):
        return self._sess.sbar_text

    @property
    def MessageType(self):
        return self._sess.sbar_mtype


class FakeInfo(object):
    Transaction = 'MB21'
    Program = 'SAPMM07R'

    def __init__(self, sess):
        self._sess = sess

    @property
    def ScreenNumber(self):
        return self._sess.screen


class FakeSession(object):
    """`script` = [(sbar_text, sbar_mtype, screen), ...] — i번째 저장(vkey 11) 시도
    **직후**의 상태. 엔터(vkey 0)는 상태를 바꾸지 않는다(실물처럼 "경고를 넘긴 것"만
    해당하고, 다음 저장 시도라는 별도 행동이 다시 필요하다)."""

    def __init__(self, script):
        self.script = script
        self.save_count = 0
        self.screen = '521'
        self.sbar_text = ''
        self.sbar_mtype = ''
        self.wnd = FakeWnd(self)
        self._info = FakeInfo(self)

    @property
    def Info(self):
        return self._info

    def on_vkey(self, k):
        if k == 11:
            if self.save_count < len(self.script):
                self.sbar_text, self.sbar_mtype, self.screen = self.script[self.save_count]
            self.save_count += 1

    def findById(self, wid):
        if wid == 'wnd[0]':
            return self.wnd
        if wid == 'wnd[0]/sbar':
            return FakeSbar(self)
        if wid == 'wnd[0]/usr/ctxtRM07M-RSNUM':
            return FakeField('')
        if wid == 'wnd[0]/tbar[0]/okcd':
            return FakeField('')
        raise LookupError(wid)   # 팝업(wnd[1]..) · 품목 텍스트 칸 전부 "없음"


WARN_SBAR = '자재 121196는(은) 플랜트 1000에서 상태 관리자재입니다'
ERR_SBAR = '유효한 기능을 선택하십시오'

print('[1] 주의(W) 상태바 — 엔터로 넘기고 저장을 다시 시도해 성공한다')
sess = FakeSession([
    (WARN_SBAR, 'W', '521'),                 # 1차 저장 → 경고, 아직 화면에 머묾
    ('예약 0001234567가 생성되었습니다', 'S', '500'),  # 엔터 뒤 2차 저장 → 성공
])
rsnum, warn = B._mb21_fill_texts_and_save(sess, [{'matnr': '121196', 'sgtxt': '테스트'}])
eq('경고를 넘기고 두 번째 시도에서 예약번호를 받는다', rsnum, '0001234567')
eq('경고가 없다', warn, None)
eq('저장을 정확히 두 번 시도했다(경고 1회만 넘김)', sess.save_count, 2)

print('[2] 같은 주의 메시지가 계속 반복되면 상한 안에서 정직하게 실패한다(무한루프 금지)')
# 스크립트보다 훨씬 많이 저장을 시도해도 늘 같은 경고만 돌아오는 상황을 흉내 낸다.
sess2 = FakeSession([(WARN_SBAR, 'W', '521')] * 40)
rsnum2, warn2 = B._mb21_fill_texts_and_save(sess2, [{'matnr': '121196', 'sgtxt': '테스트'}])
eq('끝내 예약번호를 못 받으면 실패로 끝난다', rsnum2, None)
eq('"N회 시도했지만" 문구로 끝난다(무한루프 아님)', '회 시도했지만' in (warn2 or ''), True)

print('[3] 진짜 오류(E)는 여전히 즉시 실패 — 경고로 오인해 넘기지 않는다')
sess3 = FakeSession([(ERR_SBAR, 'E', '521')])
rsnum3, warn3 = B._mb21_fill_texts_and_save(sess3, [{'matnr': '121196', 'sgtxt': '테스트'}])
eq('오류는 성공으로 둔갑하지 않는다', rsnum3, None)
eq('오류는 엔터로 넘기지 않고 그 자리에서 실패한다(저장 1회만 시도)', sess3.save_count, 1)
eq('실패 사유에 그 상태바 문구가 그대로 담긴다', ERR_SBAR in (warn3 or ''), True)

print('[4] 메시지 종류를 못 읽는 SAP(구버전/일시 오류)에서도 예전처럼 즉시 실패한다')
sess4 = FakeSession([(WARN_SBAR, '', '521')])  # MessageType 읽기 실패 흉내(빈 문자열)
rsnum4, warn4 = B._mb21_fill_texts_and_save(sess4, [{'matnr': '121196', 'sgtxt': '테스트'}])
eq('종류를 모르면 넘기지 않고 안전하게 실패로 끝난다', rsnum4, None)
eq('저장 1회만 시도(계속 엔터를 보내지 않음)', sess4.save_count, 1)

print('\n' + (('XX ' + str(_fail) + ' 건 실패') if _fail else 'OK 전부 통과') + ' (' + str(_pass) + '/' + str(_pass + _fail) + ')')
sys.exit(1 if _fail else 0)
