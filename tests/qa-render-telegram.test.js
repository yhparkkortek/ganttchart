/* 📊💬 AI 문답 — 마크다운 표 렌더링 + 텔레그램 전송 검증 하네스 (2026-11-02)
 *
 *   실행:  node tests/qa-render-telegram.test.js
 *
 * 무엇을 검증하나
 * ───────────────
 *  ① 채팅 렌더러가 **파이프 표를 실제 <table>로** 그리는가 — `_renderGanttQaMessages`(진짜)
 *     → `_mdToHtml`(진짜) 경로를 그대로 통과시킨다. 렌더러만 따로 부르는 게 아니라
 *     **히스토리에 넣고 렌더러를 호출**해서, 둘 사이 연결까지 같이 본다
 *     (CLAUDE.md "고쳤다의 정의" — 2026-10-29 칩 표 사고가 바로 이 연결에서 깨져 있었다).
 *  ② 텔레그램 변환기가 표를 줄 단위로 펴고 `<`·`&`를 escape 하는가 — 백엔드가 항상
 *     `parse_mode: HTML`로 보내므로 escape를 빠뜨리면 메일 제목 하나로 메시지가 반송된다.
 *  ③ 4,096자 상한 분할이 **태그를 끊지 않는가**.
 *  ④ 트리거 판정(`_qaTelegramCmdHit`)이 보낼 때만 걸리는가 — 알람 설정·일반 메일 발송을
 *     가져가면 안 된다.
 *
 * 가짜는 **바깥 경계에만** 둔다: DOM 한 개(innerHTML 받는 상자), escapeHtml,
 * `sendTelegramAlarm`(네트워크). 안쪽은 저장소의 실제 js/32·js/04g 파일을 그대로 돌린다.
 *
 * ⚠️ 04h의 명령 블록(sendGanttQaMessage)은 브라우저 의존이 커서 여기서 못 돈다 —
 *    그쪽은 `tests/qa-telegram.browser.js`(앱 콘솔에 붙여넣기)가 담당한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let fails = 0, passes = 0;
function ok(cond, label, extra) {
    if (cond) { passes++; console.log('  ✅ ' + label); }
    else { fails++; console.log('  ❌ ' + label + (extra ? '\n       ' + extra : '')); }
}

// ── 앱 전역 스코프 흉내 (번들러가 없고 전역을 공유하는 구조라 vm 하나로 충분) ──
const sb = {};
sb.window = sb;
sb.console = console;
sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout; sb.setInterval = () => 0;
sb.alert = () => {}; sb.confirm = () => true;
sb.fetch = () => Promise.reject(new Error('네트워크는 이 하네스에서 쓰지 않는다'));
sb.escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const box = { id: 'gantt-qa-messages', innerHTML: '' };
sb.document = {
    getElementById: (id) => (id === 'gantt-qa-messages' ? box : null),
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({ style: {}, appendChild() {} })
};
vm.createContext(sb);
for (const f of ['js/32-sap-capabilities.js', 'js/04g-core-app-upload-utils-2.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
}
const W = sb.window;
W._currentLang = 'ko';
if (!W._t) W._t = (ko) => ko;

// 실측 답변(2026-11-02 사용자 화면) 모양 그대로 — 제목에 `<`·`&`가 섞인 행을 일부러 넣는다
const MAIL_ANSWER = [
    '📧 **오늘 메일 10건** (2026-11-02 ~ 2026-11-02)  ·  메일함 안읽음 총 2154건',
    '',
    '| 시각 | 보낸이 | 제목 | 안읽음 |',
    '|---|---|---|---|',
    '| 11-02 09:21 | yhpark@kortek.co | 10월 로젠택배 사용 이력 확인 요청 건 | ● |',
    '| 11-02 09:02 | 이율황 | [11/2] 변경점 신고 접수 건 송부 드립니다.(비대면)_18건 | ● |',
    '| 11-02 09:00 | KORTEK NAS | [KORTEK NAS] 계정 패스워드가 만료될 예정입니다 | ● |',
    '| 11-02 08:48 | 오유미 | 10월 로젠택배 사용 이력 확인 요청 건 | ● |',
    '| 11-02 08:05 | "IT Service(아이디스 | [SAP] 가승인원 자재 확인 알림 메일 | ● |',
    '| 11-02 08:03 | 노태헌(Tony) | 터치 튜닝 및 검토 현황 일정 ( 2026년 45주차 ) | ● |',
    '| 11-02 07:05 | 테크포럼 | 산업 · 기술 분야별 신간 보고서 <PDF> & 서적 | ● |',
    '| 11-02 06:09 | admin@kortek.co. | [시간연차] 사용일 사전 안내 (D-7) | ● |',
    '| 11-02 01:34 | postmaster@korte | subject Auto Information Mail (Quota Warning) | ● |',
    '| 11-02 01:34 | 박용훈 | OO | ● |',
    '',
    '---',
    '',
    '🤖 **요약**',
    '',
    '• 10월 로젠택배 사용 이력 확인 (오유미)',
    '• [SAP] 가승인원 자재 확인 및 정식승인원 상신 요청',
    '',
    '※ 메일을 열지 않았습니다(읽음 처리 방지) — 본문 발췌만으로 요약했습니다.'
].join('\n');

// ── ① 채팅 렌더러(진짜) → _mdToHtml(진짜) ─────────────────────────────
console.log('\n① 채팅 렌더러가 파이프 표를 <table>로 그리는가');
W._ganttQaHistory = [
    { role: 'user', text: '그룹웨어 오늘 메일 보여줘' },
    { role: 'ai', text: MAIL_ANSWER }
];
box.innerHTML = '';
W._renderGanttQaMessages();
const html = box.innerHTML;
ok(html.length > 0, '렌더러가 무언가를 그렸다 (' + html.length + '자)');
ok(html.indexOf('<table') !== -1, '<table> 이 들어 있다');
const rowCount = (html.match(/<tr><td/g) || []).length;       // 본문 행만(머리글 행은 <tr><th)
ok(rowCount === 10, '본문 행이 10개다 (실제 ' + rowCount + ')');
ok(html.indexOf('<th') !== -1 && html.indexOf('보낸이') !== -1, '머리글 셀(보낸이)이 <th>로 나온다');
ok(html.indexOf('|---|') === -1, '구분선 `|---|` 이 글자로 남아 있지 않다');
ok(!/<div[^>]*>\|\s*11-02/.test(html), '표 행이 파이프 글자로 찍히지 않았다');
ok(html.indexOf('&lt;PDF&gt;') !== -1, '제목 속 `<PDF>` 가 escape 됐다(표 셀도 escape 경로를 지난다)');
ok(html.indexOf('border-top:1px solid') !== -1, '`---` 가 가로줄로 그려진다');
ok(/<b>오늘 메일 10건<\/b>/.test(html), '기존 **굵게** 변환이 그대로 동작한다');

// 구분선이 없는 파이프 한 줄은 표로 만들지 않는다(오탐 방지)
box.innerHTML = '';
W._ganttQaHistory = [{ role: 'ai', text: '설치지점 | 수량 이 섞인 문장 한 줄' }];
W._renderGanttQaMessages();
ok(box.innerHTML.indexOf('<table') === -1, '구분선 없는 파이프 문장은 표로 만들지 않는다');

// ── ② 텔레그램 변환기 ────────────────────────────────────────────────
console.log('\n② 마크다운 → 텔레그램 HTML 변환');
const tg = W._mdToTelegramText(MAIL_ANSWER);
ok(tg.indexOf('|---|') === -1, '구분선이 사라졌다');
ok((tg.match(/^• 11-02/gm) || []).length === 10, '메일 10건이 각각 한 줄(• )로 펴졌다 (실제 '
    + (tg.match(/^• 11-02/gm) || []).length + ')');
ok(tg.indexOf('<b>시각 | 보낸이 | 제목 | 안읽음</b>') !== -1, '표 머리글이 굵은 한 줄로 남았다');
ok(tg.indexOf('&lt;PDF&gt; &amp; 서적') !== -1, '`<`·`&` 가 escape 됐다(parse_mode HTML 반송 방지)');
ok(tg.indexOf('<b>오늘 메일 10건</b>') !== -1, '**굵게** → <b>');
ok(!/\*\*/.test(tg), '마크다운 별표가 남지 않았다');
const openB = (tg.match(/<b>/g) || []).length, closeB = (tg.match(/<\/b>/g) || []).length;
ok(openB === closeB, '<b> 태그 짝이 맞는다 (' + openB + '/' + closeB + ')');

// ── ③ 4,096자 분할 ──────────────────────────────────────────────────
console.log('\n③ 텔레그램 상한(4,096자) 분할');
(async function () {
    const seen = [];
    W.sendTelegramAlarm = async function (message) { seen.push(message); return { ok: true }; };

    let r = await W._qaTelegramSendText(tg, '12345');
    ok(r.ok && seen.length === 1, '짧은 메시지는 1개로 간다 (' + seen.length + ')');

    seen.length = 0;
    const longMd = Array.from({ length: 400 }, (_, i) => '• ' + i + ' ' + '가'.repeat(40)).join('\n');
    r = await W._qaTelegramSendText(longMd, '12345');
    ok(r.ok && r.total > 1, '긴 메시지는 쪼개 보낸다 (' + r.total + '개)');
    ok(seen.every((m) => m.length <= 4096), '조각마다 4,096자 이하다');
    ok(seen.every((m) => (m.match(/<b>/g) || []).length === (m.match(/<\/b>/g) || []).length),
        '조각 안에서 태그가 끊기지 않았다');
    ok(seen[0].indexOf('(1/') === 0, '조각마다 (n/N) 머리표가 붙는다');

    // 한 줄이 상한보다 길면 — 태그를 떼고 자른다(내용은 남고 서식만 잃는다)
    seen.length = 0;
    r = await W._qaTelegramSendText('<b>' + '나'.repeat(9000) + '</b>', '1');
    ok(r.ok && seen.every((m) => m.length <= 4096), '한 줄이 상한을 넘어도 조각이 상한 안이다');
    ok(seen.every((m) => (m.match(/<b>/g) || []).length === (m.match(/<\/b>/g) || []).length),
        '긴 한 줄도 태그 짝이 깨지지 않았다');

    // 전송 실패를 삼키지 않는가
    W.sendTelegramAlarm = async function () { return { ok: false, errDesc: 'chat not found' }; };
    r = await W._qaTelegramSendText('x', '1');
    ok(!r.ok && r.errDesc === 'chat not found', '실패 사유가 그대로 올라온다');

    // ── ④ 트리거 판정 ───────────────────────────────────────────────
    console.log('\n④ "텔레그램으로 보내줘" 판정 (QA_TELEGRAM_SEND, 데이터)');
    const hit = (q, drop) => W._qaTelegramCmdHit(q, drop);
    let h = hit('텔레그램으로 보내줘');
    ok(h && h.bare, '"텔레그램으로 보내줘" → 바로 보낸다');
    h = hit('텔레그램으로 요약본 보내줘');
    ok(h && h.bare, '"텔레그램으로 요약본 보내줘" → 바로 보낸다 (실측 실패 사례)');
    ok(h && h.summaryOnly, '"요약본" → 요약 절만 보낸다');
    h = hit('텔레그램으로 보내주세요');
    ok(h && h.bare, '"텔레그램으로 보내주세요" → 바로 보낸다');
    h = hit('이거 텔레그램에 좀 공유해줘');
    ok(h && h.bare, '"이거 텔레그램에 좀 공유해줘" → 바로 보낸다');
    h = hit('박용훈에게 텔레그램으로 보내줘', ['박용훈']);
    ok(h && h.bare, '이름을 떼면 bare — 수신자 지정도 걸린다');
    h = hit('오늘 일정 텔레그램으로 알려줘');
    ok(h && !h.bare && h.rest.indexOf('오늘일정') !== -1,
        '"오늘 일정 텔레그램으로 알려줘" → 걸리지만 확인을 받는다 (rest=' + (h && h.rest) + ')');
    ok(hit('텔레그램 알람 설정해줘') === null, '"텔레그램 알람 설정해줘" → 안 걸린다(알람 기능)');
    ok(hit('그룹웨어 오늘 메일 보여줘') === null, '메일 조회는 안 걸린다');
    ok(hit('홍길동에게 메일 보내줘') === null, '메일 발송은 안 걸린다');
    ok(hit('') === null, '빈 질문은 안 걸린다');

    console.log('\n' + (fails ? '❌ 실패 ' + fails + '건' : '✅ 전부 통과') + ' (통과 ' + passes + '건)');
    process.exit(fails ? 1 : 0);
})();
