# -*- coding: utf-8 -*-
"""📧➡️💬 새 메일 → 텔레그램 알림 검증 하네스 (2026-11-02)

    실행:  py -3-32 tests/test_mail_watch.py      (또는 python tests/test_mail_watch.py)

무엇을 보나
───────────
사람이 겪는 경로를 그대로 돌린다 — 틱(_mail_watch_tick)과 설정 라우트를 **진짜로** 부른다.
가짜는 **바깥 경계 둘뿐**: 그룹웨어 조회(_mail_watch_collect)와 텔레그램 발송(send_telegram_msg).
설정 파일도 임시 경로로 바꿔 쓰므로 **사용자의 mail_watch_config.json 을 건드리지 않는다**.

⚠️ 사용자가 돌리고 있는 5000번 프로세스는 건드리지 않는다(app.test_client 사용 — CLAUDE.md).
   그래서 이 하네스가 통과해도 **그 프로세스에는 새 코드가 아직 없다** — 백엔드 재시작이 필요하다.
"""
import os
import sys
import json
import tempfile
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kortek_backend as kb                                    # noqa: E402

fails = []
passes = []


def ok(cond, label, extra=''):
    if cond:
        passes.append(label)
        print('  [OK] ' + label)
    else:
        fails.append(label)
        print('  [FAIL] ' + label + (' -- ' + str(extra) if extra else ''))


def mail(i, subject, frm='hong@example.com', preview='본문 발췌', seen=False):
    return {'id': i, 'subject': subject, 'from': frm, 'to': 'me@example.com',
            'at': '2026-11-02T10:0%d:00+09:00' % (i % 10), 'date': '2026-11-02',
            'seen': seen, 'preview': preview}


# ── 설정 파일을 임시 경로로 (사용자 파일 보호) ────────────────────────
tmp = tempfile.mkdtemp(prefix='mailwatch-')
kb.MAIL_WATCH_FILE = os.path.join(tmp, 'mail_watch_config.json')

# ── 경계 둘만 가짜 ────────────────────────────────────────────────────
SENT = []
COLLECT = {'mails': [], 'err': ''}
kb.send_telegram_msg = lambda msg, chat_id=None: (SENT.append((msg, chat_id)) or {'ok': True})
kb._mail_watch_collect = lambda cfg: (None, COLLECT['err']) if COLLECT['err'] else (COLLECT['mails'], '')


print('\n① 조용한 시간 (자정을 넘는 구간)')
cfg = dict(kb._MAIL_WATCH_DEFAULTS)          # 22:00 ~ 07:30
at = lambda h, m: datetime(2026, 11, 2, h, m, tzinfo=kb.KST)
ok(kb._mail_watch_is_quiet(cfg, at(23, 0)), '23:00 은 조용한 시간')
ok(kb._mail_watch_is_quiet(cfg, at(3, 0)), '03:00 은 조용한 시간(자정 넘김)')
ok(not kb._mail_watch_is_quiet(cfg, at(9, 0)), '09:00 은 아니다')
ok(not kb._mail_watch_is_quiet(cfg, at(21, 59)), '21:59 는 아니다')
ok(not kb._mail_watch_is_quiet(dict(cfg, quietFrom='00:00', quietTo='00:00'), at(3, 0)),
   '같은 시각이면 조용한 시간 없음')

print('\n② 제외 어휘(데이터)')
ok(kb._mail_watch_skip(mail(1, 'subject Auto Information Mail (Quota Warning)'), cfg), '자동알림은 제외')
ok(kb._mail_watch_skip(mail(2, '회신 요청', frm='no-reply@example.com'), cfg), '보낸이로도 제외')
ok(not kb._mail_watch_skip(mail(3, '견적서 송부의 건'), cfg), '업무 메일은 통과')

print('\n③ 텔레그램 본문')
d = kb._mail_watch_digest([mail(i, '제목 <b>%d</b> & 그 외' % i) for i in range(1, 15)], cfg)
ok('&lt;b&gt;' in d and '&amp;' in d, 'HTML escape 된다(parse_mode=HTML 반송 방지)')
ok('외 4건' in d, '최대 건수를 넘으면 "외 N건"으로 줄인다', d[-40:])
ok(len(d) < 4096, '텔레그램 상한(4096자) 안이다 (%d자)' % len(d))

print('\n④ 틱 — 처음 켤 때는 보내지 않는다')
COLLECT['mails'] = [mail(100, '어제부터 쌓여 있던 메일'), mail(101, '그 다음 메일')]
kb._mail_watch_save(dict(kb._MAIL_WATCH_DEFAULTS, enabled=True))
r = kb._mail_watch_tick()
ok(r.get('skipped') == 'first-run', '첫 틱은 기준점만 잡는다', r)
ok(not SENT, '쌓여 있던 메일을 한꺼번에 보내지 않는다 (%d)' % len(SENT))
ok(kb._mail_watch_load()['lastId'] == 101, '기준점이 최신 id 로 잡힌다')

print('\n⑤ 틱 — 새 메일이 오면 보낸다')
COLLECT['mails'] = [mail(102, '새로 온 메일'), mail(101, '그 다음 메일')]
cfgf = kb._mail_watch_load(); cfgf['lastCheckAt'] = ''; kb._mail_watch_save(cfgf)
r = kb._mail_watch_tick()
ok(r.get('sent') == 1, '새 메일 1건만 보낸다', r)
ok(SENT and '새로 온 메일' in SENT[0][0], '그 메일이 본문에 들어간다')
ok('그 다음 메일' not in (SENT[0][0] if SENT else ''), '이미 알린 메일은 다시 안 보낸다')
ok(kb._mail_watch_load()['lastId'] == 102, 'lastId 가 올라간다')

print('\n⑥ 간격 — 너무 자주 돌지 않는다')
SENT.clear()
COLLECT['mails'] = [mail(103, '또 온 메일')]
r = kb._mail_watch_tick()
ok(r.get('skipped') == 'interval', '간격 안이면 건너뛴다', r)
ok(not SENT, '그 사이엔 안 보낸다')

print('\n⑦ 발송 실패 — 다음 틱에 다시 보낸다(조용히 삼키지 않는다)')
SENT.clear()
kb.send_telegram_msg = lambda msg, chat_id=None: {'ok': False, 'description': 'chat not found'}
cfgf = kb._mail_watch_load(); cfgf['lastCheckAt'] = ''; kb._mail_watch_save(cfgf)
r = kb._mail_watch_tick()
ok(not r.get('ok') and 'chat not found' in (r.get('message') or ''), '실패 사유가 그대로 올라온다', r)
ok(kb._mail_watch_load()['lastId'] == 102, '실패하면 lastId 를 올리지 않는다(다음에 재발송)')
ok('chat not found' in kb._mail_watch_load()['lastError'], '마지막 오류가 설정에 남는다')
kb.send_telegram_msg = lambda msg, chat_id=None: (SENT.append((msg, chat_id)) or {'ok': True})

print('\n⑧ 그룹웨어가 끊겨 있으면 — 로그인하지 않고 건너뛴다')
COLLECT['err'] = '그룹웨어 로그인 안 됨(앱에서 1회 로그인해 주세요)'
cfgf = kb._mail_watch_load(); cfgf['lastCheckAt'] = ''; kb._mail_watch_save(cfgf)
SENT.clear()
r = kb._mail_watch_tick()
ok(not r.get('ok') and '로그인' in (r.get('message') or ''), '사유를 남기고 건너뛴다', r)
ok(not SENT, '아무것도 보내지 않는다')
COLLECT['err'] = ''

print('\n⑨ 설정 라우트 (사용자의 5000번 프로세스는 건드리지 않는다)')
cl = kb.app.test_client()
g = cl.get('/mail-watch/config').get_json()
ok(g.get('ok') and 'config' in g, 'GET 이 현재 설정을 돌려준다')
p = cl.post('/mail-watch/config', json={'enabled': True, 'intervalMin': 5,
                                        'skipKeywords': ['광고']}).get_json()
ok(p['config']['intervalMin'] == 5 and p['config']['skipKeywords'] == ['광고'], 'POST 가 부분 수정한다')
ok(p['config']['lastId'] == 0, '켜는 순간 기준점을 다시 잡는다(쌓인 메일 폭탄 방지)')
ok(p['config']['quietFrom'] == '22:00', '안 보낸 값은 그대로 남는다')

print('\n⑩ 끈 상태에서는 아무 일도 안 한다')
cl.post('/mail-watch/config', json={'enabled': False})
SENT.clear()
r = kb._mail_watch_tick()
ok(r.get('skipped') == 'disabled', '꺼져 있으면 즉시 반환', r)
ok(not SENT, '발송 없음')

print('\n' + ('[FAIL] 실패 %d건' % len(fails) if fails else '[OK] 전부 통과')
      + ' (통과 %d건)' % len(passes))
sys.exit(1 if fails else 0)
