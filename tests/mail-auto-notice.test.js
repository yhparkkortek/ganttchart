/* ============================================================================
   📅 메일 자동등록 — Outlook/Exchange "일정 자동 업데이트" 알림 건너뛰기 (2026-11-17)

       node tests/mail-auto-notice.test.js

   왜 — 반복회의 일정이 바뀔 때마다 Outlook/Exchange가 스스로 보내는 "자동 업데이트"
   알림 메일(실행할 내용 없음)이 올 때마다 새 업무로 등록돼 같은 회의가 계속 새 리프로
   쌓였다(실측: LNW_STELLAR32_32.0 "SL-1 Proto B topper status" 한 건이 10/22·10/29
   두 번의 일정 변경만으로 벌써 4건). AI가 매번 다른 말로 요약하는 [핵심내용] 문장이
   아니라 **Exchange가 보내는 원문(mailRaw.body2000)의 고정 문구**로 건너뛴다.

   ⚠️ 가짜는 **없음** — js/14b-ai-mail-analysis-2.js 의 진짜 `_mailIsAutoNotice`·
      `_mailFindDupBySourceTag`·`buildMailTaskRow` 를 그대로 불러 돌린다. 이 세 함수는
      전부 순수 데이터 함수라(DOM·NAS·AI 호출 없음) 가짜 경계 자체가 필요 없다.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const win = {};
global.window = win;
global.document = {};

const src = fs.readFileSync(path.join(__dirname, '..', 'js', '14b-ai-mail-analysis-2.js'), 'utf8');
new Function('window', 'document', src)(win, global.document);

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d !== undefined ? '  — ' + JSON.stringify(d) : '')); } };

function colIdx() {
    return { no: 0, wbs: 6, start: 2, plan: 3, period: 4, dur1: -1, dur2: -1, dur3: -1, dur4: -1,
              assignee: -1, status: 5, customer: -1, model: -1, inch: -1, devStage: -1, content: 7 };
}
function emptyGd() {
    return [['NO', 'LEVEL', '시작', '완료', '소요일', '상태', 'WBS', '상세내용']];
}

console.log('\n■ _mailIsAutoNotice — Exchange 원문 고정 문구로 판정');
{
    const EXCHANGE_BODY = 'Your meeting was found to be out of date and has been automatically updated.\n  │ Updated meeting details:\n  │ Start Time\nSent by Microsoft Exchange Online';
    ok('실측 원문(둘 다 들어있는 경우) → true', win._mailIsAutoNotice({ body2000: EXCHANGE_BODY }) === true);
    ok('"Sent by Microsoft Exchange Online" 한 문구만 있어도 → true',
        win._mailIsAutoNotice({ body2000: 'blah blah\nSent by Microsoft Exchange Online' }) === true);
    ok('"has been automatically updated" 한 문구만 있어도 → true',
        win._mailIsAutoNotice({ body2000: 'Your meeting has been automatically updated.' }) === true);
    ok('평범한 업무 메일 본문 → false',
        win._mailIsAutoNotice({ body2000: 'SL-1 Proto B topper status 관련 정기 회의 일정 공유드립니다.' }) === false);
    ok('mailRaw 자체가 없어도 안 던진다(false)', win._mailIsAutoNotice(null) === false && win._mailIsAutoNotice(undefined) === false);
    ok('body2000 이 빈 문자열이어도 false', win._mailIsAutoNotice({ body2000: '' }) === false);
}

console.log('\n■ buildMailTaskRow — 자동 업데이트 알림은 등록하지 않는다(row:null, skipReason:"autoNotice")');
{
    const r = { '업무명': 'Proto B 회의 일정 공유', '상세내용': '[핵심내용]뭔가\n[출처]FW: X _2026-11-17 09:00_"a" <a@b.com>' };
    const mailRaw = { body2000: 'Your meeting was found to be out of date and has been automatically updated.\nSent by Microsoft Exchange Online' };
    const built = win.buildMailTaskRow(r, emptyGd(), colIdx(), mailRaw);
    ok('row 가 null 이다(등록 안 함)', built.row === null, built);
    ok('skipReason 이 "autoNotice" 다', built.skipReason === 'autoNotice', built);
    ok('taskName 은 그대로 돌려준다(호출부가 안내문에 쓴다)', built.taskName === 'Proto B 회의 일정 공유', built);
    ok('duplicate 플래그는 안 선다(진짜 중복이 아니므로 — 호출부가 다른 안내문을 고를 근거)',
        built.duplicate !== true, built);
}

console.log('\n■ 기존 [출처] 태그 중복 판정은 그대로 — 새 가드가 가로채지 않는다');
{
    const gd = emptyGd();
    gd.push(['1', 4, '2026-11-17', '2026-11-17', '', '진행', 'X', '[핵심내용]기존 업무\n[출처]FW: X _2026-11-17 09:00_"a" <a@b.com>']);
    const r = { '업무명': 'X', '상세내용': '[핵심내용]같은 메일 재분석\n[출처]FW: X _2026-11-17 09:00_"a" <a@b.com>' };
    // ⚠️ mailRaw 를 안 주거나(undefined) 평범한 본문이어도 — 이 메일은 출처 태그로 "이미 있는 업무"다.
    const built = win.buildMailTaskRow(r, gd, colIdx(), null);
    ok('row 가 null 이다', built.row === null, built);
    ok('skipReason 이 "dup" 다(자동알림이 아니라 진짜 중복)', built.skipReason === 'dup', built);
    ok('duplicate 플래그도 선다(기존 호환)', built.duplicate === true, built);
}

console.log('\n■ 돌연변이 — 평범한 메일은 여전히 정상 등록된다(새 가드가 전체를 막지 않는다)');
{
    const r = { '업무명': '평범한 업무', '상세내용': '[핵심내용]평범한 내용\n[출처]FW: Y _2026-11-17 10:00_"b" <b@c.com>',
                '시작일': '2026-11-17', '완료일': '2026-11-20', 'wbs레벨': 4 };
    const built = win.buildMailTaskRow(r, emptyGd(), colIdx(), { body2000: '그냥 평범한 메일 본문입니다.' });
    ok('row 가 실제로 만들어진다(null 아님)', built.row !== null, built);
    ok('업무명 끝에 ＊AI📧 꼬리표가 붙는다(기존 동작 그대로)', built.taskName.indexOf('＊AI📧') !== -1, built.taskName);
}

console.log('\n' + (fail === 0 ? '✅ ' : '⛔ ') + pass + '/' + (pass + fail) + ' 통과');
process.exit(fail ? 1 : 0);
