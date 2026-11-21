# -*- coding: utf-8 -*-
"""✂️ /fetch-mail `reply`(이번 답장 글만) — `_mail_latest_reply` + `_mail_parse_entry` 통과 검증 (2026-11-21).

실행: py -3 -X utf8 tests/test_mail_reply_split.py
가짜 0개 — 진짜 kortek_backend 함수에 합성 .eml 을 넣는다(사내 메일은 저장소에 안 넣는다). 메일 서버·NAS 안 쓴다.
mail-parser-reply 가 설치돼 있지 않으면 reply 가 ''(폴백)인 것까지가 계약이다 — 그 경우를 따로 본다.
"""
import os, sys, email
from datetime import datetime, timezone, timedelta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kortek_backend as kb

KST = timezone(timedelta(hours=9))
P = F = 0
def ok(name, cond, extra=''):
    global P, F
    if cond: P += 1; print('  OK  ', name)
    else: F += 1; print('  FAIL', name, ('— ' + str(extra)[:200]) if extra else '')

OUTLOOK_KO = """안녕하십니까! 개발 3팀 이동준 매니저입니다.
최연희 과장님!
박스 추가 요청드립니다.
[요청 수량]
2EA

감사합니다.
이동준 매니저 | 개발3팀 | KORTEK

보낸 사람: 최연희 <chy@ilshin.co.kr>
보낸 날짜: 2026년 10월 20일 화요일 오후 3:10
받는 사람: 이동준 <moving@kortek.co.kr>
제목: RE: [코텍_일신] 26년 10월 BOX SPL 요청의 건

과장님 요청 건 확인했습니다. OBSIDIAN 27 박스 금형 번호 #502888 로 진행합니다.
"""
GMAIL_KO = """네 확인했습니다. 4.3" Shuffler ESD 재시험은 수요일로 하겠습니다.

2026년 11월 3일 (월) 오전 9:12, 김진석 <sixy@kortek.co.kr>님이 작성하였습니다:
> SHUFFLER 4.3 ESD 재시험 일정 회신 부탁드립니다.
> 1640994-ALT1 샘플 2대 준비됐습니다.
"""
ORIGINAL_EN = """Confirmed, we will ship 55J-R1500 units on Friday.

-----Original Message-----
From: Georgi Terziev <georgi@amusnet.com>
Sent: Tuesday, September 2, 2026 4:19 PM
Subject: RE[19]: 55F and 55J Closed Frame Feedback

Please confirm the shipment date for 55J-R1500.
"""
PLAIN = "STELLAR32 Proto B DFM 회신 드립니다. 금형 수정 3건 반영했습니다. 첨부 참고 바랍니다."
SHORT = "ok\n\n감사합니다.\n박용훈"

print('## 1. _mail_latest_reply')
installed = kb._REPLY_PARSER is not None
print('   mail-parser-reply 설치:', installed)
r = kb._mail_latest_reply(OUTLOOK_KO)
if installed:
    ok('1-1 Outlook(ko) 머리 앞의 새 글만 남고 서명(감사합니다/직함) 제거', r.startswith('안녕하십니까') and '보낸 사람' not in r and 'KORTEK' not in r and '#502888' not in r, r)
else:
    ok('1-1 (미설치) Outlook(ko) 보조 구분선으로 머리 앞까지 자른다', r.startswith('안녕하십니까') and '보낸 사람' not in r, r)
r = kb._mail_latest_reply(GMAIL_KO)
ok('1-2 Gmail(ko) "…님이 작성하였습니다:" 에서 자른다(라이브러리 ko 패턴은 안 맞는다 — 보조 구분선)', r.startswith('네 확인했습니다') and '님이 작성' not in r and '1640994' not in r, r)
r = kb._mail_latest_reply(ORIGINAL_EN)
ok('1-3 -----Original Message----- 앞까지', r.strip() == 'Confirmed, we will ship 55J-R1500 units on Friday.', r)
ok('1-4 인용이 없는 메일은 "" (호출한 쪽이 전체 본문 사용)', kb._mail_latest_reply(PLAIN) == '', kb._mail_latest_reply(PLAIN))
ok('1-5 너무 짧으면 "" (서명만 떼면 2자)', kb._mail_latest_reply(SHORT) == '')
ok('1-6 빈 본문 → ""', kb._mail_latest_reply('') == '' and kb._mail_latest_reply(None) == '')
ok('1-7 첫 줄이 머리글인 전달 메일은 그대로(0 위치에서 안 자른다)', kb._mail_latest_reply('보낸 사람: a <a@x>\n제목: t\n\n본문입니다 충분히 긴 본문입니다 열 글자 이상') == '' or '본문입니다' in kb._mail_latest_reply('보낸 사람: a <a@x>\n제목: t\n\n본문입니다 충분히 긴 본문입니다 열 글자 이상'))

print('## 2. _mail_parse_entry 가 reply/key/refs 를 싣는다')
raw = ("Message-ID: <m1@x>\nIn-Reply-To: <m0@x>\nReferences: <m0@x>\nDate: Tue, 21 Oct 2026 15:51:00 +0900\n"
       "From: =?utf-8?b?7J2064+Z7KSA?= <moving@kortek.co.kr>\nTo: ilshin <ilshinpack1234@hanmail.net>\n"
       "Subject: Re: [=?utf-8?b?7L2U7YWN?=] BOX SPL\nContent-Type: text/plain; charset=utf-8\n\n" + OUTLOOK_KO).encode('utf-8')
st, item = kb._mail_parse_entry(raw, 'moving@kortek.co.kr', datetime(2026, 10, 1, tzinfo=KST), datetime(2026, 12, 31, tzinfo=KST), '', '', '', stage_dir=None)
ok('2-1 status ok', st == 'ok', st)
ok('2-2 key 16자 hex', isinstance(item.get('key'), str) and len(item['key']) == 16)
ok('2-3 refs 에 In-Reply-To 해시', item.get('refs') and item['refs'][0] == kb.hashlib.sha1(b'mid|<m0@x>').hexdigest()[:16], item.get('refs'))
ok('2-4 reply 가 새 글만(또는 미설치 시 보조 구분선)', item.get('reply', None) is not None and item['reply'].startswith('안녕하십니까') and '보낸 사람' not in item['reply'], item.get('reply'))
ok('2-5 body 는 전문 그대로(과거 인용 포함)', '#502888' in item['body'])

print(f'\n결과: {P}/{P + F} 통과' + ('' if installed else '  (⚠️ mail-parser-reply 미설치 — 보조 구분선만 검증됨)'))
sys.exit(0 if F == 0 else 1)
