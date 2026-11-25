# -*- coding: utf-8 -*-
"""🔔 예약 발송(기간·반복) 알람 수신자 해석 하네스 — 2026-11-25

    py -3 tests/test_alarm_recipient_resolve.py

왜: 메일 AI 분석이 상세내용에 적은 [발신자→수신자] 이름이 알람 수신자가 되는데, 백엔드
`_lookup_email` 은 동명이인이면 첫 번째 사람, 이름 자리의 이메일 글자는 주소록 대조 없이 그대로 썼다.
프런트(js/22b `_addrResolveRecipient`, node tests/alarm-recipient-resolve.test.js)와 같은 규칙인지 본다.

⚠️ 가짜는 바깥 경계에만 — 프로젝트 읽기(`_project_doc_by_id`)·주소록 읽기(`_load_address_book`)·
   메일 발송(`_send_mail_core`)·텔레그램 발송(`send_telegram_msg`). 입구는 진짜 `_fire_alarm_rule`.
⚠️ 실제 메일·텔레그램은 하나도 안 나간다.
"""
import io
import os
import sys
from datetime import datetime, timedelta

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import kortek_backend as B  # noqa: E402

PASS = [0]
FAIL = [0]


def ok(name, cond, detail=''):
    if cond:
        PASS[0] += 1
        print('  OK   %s' % name)
    else:
        FAIL[0] += 1
        print('  FAIL %s%s' % (name, ('  — ' + str(detail)) if detail else ''))


BOOK = [  # 합성 주소록(실제 사람 아님)
    {'name': '김민수', 'nameEn': 'Minsu Kim', 'email': 'minsu.kim@kortek.co.kr', 'telegramId': '111'},
    {'name': '김민수', 'nameEn': 'Minsu Kim2', 'email': 'kim.minsu@kortek.co.kr', 'telegramId': '222'},
    {'name': '박지훈', 'nameEn': 'Andy', 'email': 'andy.park@kortek.co.kr', 'telegramId': '333'},
    {'name': '이서연', 'nameEn': 'Seoyeon Lee', 'email': 'sy.lee@kortek.co.kr', 'telegramId': '444'},
    {'name': '이서연', 'nameEn': 'Seoyeon Lee', 'email': 'SY.LEE@kortek.co.kr', 'telegramId': '444'},
    {'name': '정다은', 'nameEn': 'Ada', 'email': 'ada@kortek.co.kr', 'telegramId': '666'},
    {'name': '외부인', 'nameEn': 'Outsider', 'email': 'out@customer.com', 'telegramId': '777'},
]

SENT_MAIL = []
SENT_TG = []
PROJECT = {}


def fake_send_mail(to, subject, body, cc=''):
    SENT_MAIL.append(to)
    return True, '', None


def fake_tg(msg, chat_id=None, *a, **k):
    SENT_TG.append(chat_id)
    return {'ok': True}


B._send_mail_core = fake_send_mail
B.send_telegram_msg = fake_tg
B._load_address_book = lambda force=False: BOOK
B._project_doc_by_id = lambda fid: (PROJECT, 'nas')


def fire(content, mail_raw=None):
    due = (datetime.now(B.KST).date() + timedelta(days=3)).strftime('%Y-%m-%d')
    row = {'data': ['업무1', due, content, '진행'], '_알림': True, '_level': 3, '_origT3': '업무1'}
    if mail_raw is not None:
        row['_mailRaw'] = mail_raw
    PROJECT.clear()
    PROJECT.update({
        'colIdx': {'plan': 1, 'content': 2, 'status': 3, 'wbs': 0},
        'projectMeta': {'고객사': 'TEST'},
        'globalData': [{'data': ['헤더']}, row],
    })
    del SENT_MAIL[:]
    del SENT_TG[:]
    return B._fire_alarm_rule({'type': 'alarm', 'driveFileId': 'x', 'rowIdx': 1, 'allowedExternalDomainsSnapshot': []})


R = lambda n: B._addr_resolve_recipient(BOOK, n)  # noqa: E731

print('1) 해석기 계약')
ok('동명이인 → ambiguous', R('김민수')['reason'] == 'ambiguous' and not R('김민수')['email'])
ok('같은 사람 두 줄(이메일 같음)은 한 사람', R('이서연')['reason'] == 'ok')
ok('영문 이름 단독(Andy) → ok', R('Andy')['email'] == 'andy.park@kortek.co.kr')
ok('직함 떼고 찾기', R('박지훈 책임')['email'] == 'andy.park@kortek.co.kr')
ok('주소록에 없는 사람 → none', R('홍길동')['reason'] == 'none')
ok('주소록에 없는 주소 → email-not-in-book', R('fake@kortek.co.kr')['reason'] == 'email-not-in-book')
ok('주소록 주소(대소문자 달라도) → 주소록 값', R('ANDY.PARK@kortek.co.kr')['email'] == 'andy.park@kortek.co.kr')
ok('Adams → Ada 로 새지 않음', R('Adams')['reason'] == 'none', R('Adams'))
ok('Drew 그대로', B._addr_strip_title_suffix('Drew') == 'Drew')
ok('Mr. Kim → Kim', B._addr_strip_title_suffix('Mr. Kim') == 'Kim')

print('2) 진짜 입구 _fire_alarm_rule')
out = fire('[검토요청][이서연→김민수] 2026-11-20')
ok('동명이인에게 메일 안 감', SENT_MAIL == ['sy.lee@kortek.co.kr'], SENT_MAIL)
ok('동명이인에게 텔레그램 안 감', '111' not in SENT_TG and '222' not in SENT_TG, SENT_TG)
ok('제외 사유가 결과에 남는다', any('김민수' in x for x in out.get('excluded', [])), out)

out = fire('[자료제공][fake@kortek.co.kr→박지훈] 2026-11-20')
ok('주소록에 없는 사내 주소로 안 감', SENT_MAIL == ['andy.park@kortek.co.kr'], SENT_MAIL)

out = fire('[검토요청][외부인/이서연→박지훈] 2026-11-20')
ok('허용 안 된 외부 주소는 사내 주소와 섞여도 빠진다', SENT_MAIL and 'out@customer.com' not in SENT_MAIL[0], SENT_MAIL)

out = fire('[샘플발송][Taylor Kim→Morgan Lee] 2026-11-20')
ok('외부인 이름만 → 발송 없음', SENT_MAIL == [] and out.get('emailSkipped'), (SENT_MAIL, out))

print('3) 📨 메일 헤더 대조')
MR = {'sender': 'Andy Lee <andy@customer.com>', 'to': '"Lee, Seoyeon" <SY.LEE@kortek.co.kr>', 'cc': ''}
out = fire('[샘플요청][Andy→이서연] 2026-11-20', MR)
ok('헤더에 없는 사내 Andy 에게 메일 안 감', SENT_MAIL == ['sy.lee@kortek.co.kr'], SENT_MAIL)
ok('헤더에 없는 사내 Andy 에게 텔레그램 안 감', '333' not in SENT_TG, SENT_TG)
ok('사유: 메일 헤더에 없음', any('Andy' in x and '헤더' in x for x in out.get('excluded', [])), out)
out = fire('[샘플요청][Andy→이서연] 2026-11-20')
ok('헤더 없는 업무는 주소록 규칙만(예전 그대로)', 'andy.park@kortek.co.kr' in (SENT_MAIL[0] if SENT_MAIL else ''), SENT_MAIL)
out = fire('[샘플요청][Andy→이서연] 2026-11-20', {'sender': '', 'to': '', 'body2000': '...'})
ok('헤더 글자가 비면 대조 안 함', 'andy.park@kortek.co.kr' in (SENT_MAIL[0] if SENT_MAIL else ''), SENT_MAIL)
ok('배열 헤더도 읽는다', B._mail_header_addrs({'to': ['a@x.com', 'B@Y.co.kr']}) == ['a@x.com', 'b@y.co.kr'])

print('3-2) 🏢 같은 이름 여러 줄')
BOOK.append({'name': '박지훈', 'email': 'jh.personal@gmail.com'})
ok('회사+개인 두 줄 → 회사 주소', R('박지훈')['email'] == 'andy.park@kortek.co.kr', R('박지훈'))
BOOK.pop()
out = fire('[문의][김민수→이서연] 2026-11-20', {'sender': 'KIM.MINSU@kortek.co.kr', 'to': 'sy.lee@kortek.co.kr'})
ok('동명이인을 메일 헤더로 가린다', SENT_MAIL and 'kim.minsu@kortek.co.kr' in SENT_MAIL[0] and 'minsu.kim@' not in SENT_MAIL[0], SENT_MAIL)
ok('가린 사람에게만 텔레그램', '222' in SENT_TG and '111' not in SENT_TG, SENT_TG)

print('3-3) 🏷 이름 옆 부서·직함')
BOOK[0]['dept'], BOOK[0]['title'] = '개발1팀', '팀장'
BOOK[1]['dept'], BOOK[1]['title'] = '영업팀', '책임매니저'
ok('괄호 부서', R('김민수(영업팀)')['email'] == 'kim.minsu@kortek.co.kr')
ok('이름 뒤 직함', R('김민수 팀장')['email'] == 'minsu.kim@kortek.co.kr')
ok('이름 앞 직함+님', R('팀장 김민수님')['email'] == 'minsu.kim@kortek.co.kr')
ok('괄호 부서 안 맞으면 제외', R('김민수(구매팀)')['reason'] == 'qualifier-mismatch')
ok('괄호 안 주소', R('김민수(kim.minsu@kortek.co.kr)')['email'] == 'kim.minsu@kortek.co.kr')
out = fire('[문의][이서연→김민수 팀장] 2026-11-20')
ok('예약 알람도 직함으로 가려진다', SENT_MAIL and sorted(SENT_MAIL[0].split(',')) == ['minsu.kim@kortek.co.kr', 'sy.lee@kortek.co.kr'], SENT_MAIL)
out = fire('[문의][이서연→김민수(구매팀)] 2026-11-20')
ok('안 맞는 부서는 사유와 함께 제외', SENT_MAIL == ['sy.lee@kortek.co.kr'] and any('부서' in x for x in out.get('excluded', [])), (SENT_MAIL, out))
for k in ('dept', 'title'):
    BOOK[0].pop(k, None); BOOK[1].pop(k, None)

print('4) 👥 그룹 주소로 온 메일')
for p in BOOK:
    if p['name'] in ('박지훈', '이서연'):
        p['dept'] = '개발3팀'
BOOK.append({'name': '개발3팀', 'dept': '개발3팀', 'email': 'dev3@kortek.co.kr'})
G = {'sender': 'Cust <cust@customer.com>', 'to': '개발3팀 <DEV3@kortek.co.kr>'}
out = fire('[문의][이서연→박지훈] 2026-11-20', G)
ok('그룹 주소로 온 메일 — 그 팀원은 받는다', SENT_MAIL and sorted(SENT_MAIL[0].split(',')) == ['andy.park@kortek.co.kr', 'sy.lee@kortek.co.kr'], SENT_MAIL)
ok('그룹 팀원 텔레그램도 간다', '333' in SENT_TG and '444' in SENT_TG, SENT_TG)
out = fire('[문의][이서연→정다은] 2026-11-20', G)
ok('다른 부서 사람은 그대로 제외', SENT_MAIL == ['sy.lee@kortek.co.kr'] and any('정다은' in x for x in out.get('excluded', [])), (SENT_MAIL, out))
out = fire('[문의][이서연→박지훈] 2026-11-20', {'sender': 'cust@customer.com', 'to': 'list@kortek.co.kr'})
ok('주소록에 없는 메일링 리스트는 펼치지 않는다', SENT_MAIL == [], SENT_MAIL)
BOOK.pop()

print('%s 예약 알람 수신자 해석 %d/%d' % ('✅' if not FAIL[0] else '❌', PASS[0], PASS[0] + FAIL[0]))
sys.exit(1 if FAIL[0] else 0)
