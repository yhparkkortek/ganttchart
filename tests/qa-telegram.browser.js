/* 💬 "텔레그램으로 보내줘" — 앱 안에서 실제 경로로 돌리는 검증 (2026-11-02)
 *
 *   쓰는 법: 앱을 열고 **AI 문답 창을 띄운 뒤**(#gantt-qa-input 이 있어야 한다)
 *            브라우저 콘솔에 이 파일 전체를 붙여넣는다.
 *
 * 왜 이 파일이 따로 있나
 * ──────────────────────
 * `tests/qa-render-telegram.test.js`(node)는 변환기·분할기·판정기만 돌린다. 정작 깨지기
 * 쉬운 건 **연결**이다 — 사용자가 친 말이 04h의 어느 블록에 걸리고, 거기서 히스토리의
 * 직전 답변을 집어 `_qaTelegramDeliver`까지 가는가. 부품만 확인하고 "고쳤다"고 보고했다
 * 정작 연결이 깨져 있던 사고가 이미 있다(CLAUDE.md "고쳤다의 정의", 2026-10-29).
 * 그래서 여기서는 **window.sendGanttQaMessage() 를 그대로 부른다.**
 *
 * 가짜는 하나뿐 — `window.sendTelegramAlarm`(네트워크 경계). 텔레그램 봇 토큰도,
 * 백엔드도 필요 없다. 그 안쪽(04h 블록 → 04g 변환/분할 → 결과 말풍선)은 전부 진짜다.
 */
(async function () {
    'use strict';
    const input = document.getElementById('gantt-qa-input');
    if (!input) { console.error('❌ AI 문답 창을 먼저 열어주세요 (#gantt-qa-input 없음)'); return; }

    let fails = 0, passes = 0;
    const ok = (cond, label, extra) => {
        if (cond) { passes++; console.log('%c ✅ ' + label, 'color:#1f7a3d'); }
        else { fails++; console.log('%c ❌ ' + label + (extra ? ' — ' + extra : ''), 'color:#c92a2a'); }
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (fn, ms) => {
        const until = Date.now() + (ms || 4000);
        while (Date.now() < until) { if (fn()) return true; await sleep(60); }
        return false;
    };
    const lastAi = () => {
        for (let i = window._ganttQaHistory.length - 1; i >= 0; i--) {
            const m = window._ganttQaHistory[i];
            if (m && m.role === 'ai' && !m.pending) return m;
        }
        return null;
    };

    // ── 바깥 경계만 가짜로 ───────────────────────────────────────────
    const origSend = window.sendTelegramAlarm;
    const origHist = window._ganttQaHistory;
    const origPending = window._qaPendingConfirmButtons;
    let sentMsgs = [], sentChatIds = [];
    window.sendTelegramAlarm = async function (message, opts) {
        sentMsgs.push(message); sentChatIds.push((opts && opts.chatId) || '');
        return { ok: true };
    };

    const MAIL_ANSWER = [
        '📧 **오늘 메일 2건** (2026-11-02 ~ 2026-11-02)  ·  메일함 안읽음 총 2154건',
        '',
        '| 시각 | 보낸이 | 제목 | 안읽음 |',
        '|---|---|---|---|',
        '| 11-02 09:02 | 이율황 | [11/2] 변경점 신고 접수 건 <18건> | ● |',
        '| 11-02 08:48 | 오유미 | 10월 로젠택배 사용 이력 확인 요청 건 | ● |',
        '',
        '---',
        '',
        '🤖 **요약**',
        '',
        '• [11/2] 변경점 신고 접수 건 송부 (이율황)',
        '• 10월 로젠택배 사용 이력 확인 (오유미)'
    ].join('\n');

    const seed = () => {
        window._ganttQaHistory = [
            { role: 'user', text: '그룹웨어 오늘 메일 보여줘' },
            { role: 'ai', text: MAIL_ANSWER }
        ];
        window._qaPendingConfirmButtons = null;
        window._qaTgPending = null;
        sentMsgs = []; sentChatIds = [];
        window._renderGanttQaMessages();
    };
    const ask = async (q) => {
        input.value = q;
        await window.sendGanttQaMessage();
        await sleep(120);
    };

    try {
        // ① 화면: 표가 실제 <table> 로 그려지는가 (렌더러 → _mdToHtml 연결)
        console.log('%c① 채팅 화면의 표', 'font-weight:bold');
        seed();
        const boxHtml = document.getElementById('gantt-qa-messages').innerHTML;
        ok(boxHtml.indexOf('<table') !== -1, '답변이 <table> 로 그려졌다');
        ok((boxHtml.match(/<tr[^>]*><td/g) || []).length === 2, '메일 2건이 표 2행이다');
        ok(boxHtml.indexOf('|---|') === -1, '구분선이 글자로 남지 않았다');

        // ② "텔레그램으로 요약본 보내줘" — 실측 실패 사례. 확인 없이 바로 가야 한다.
        console.log('%c② "텔레그램으로 요약본 보내줘"', 'font-weight:bold');
        seed();
        await ask('텔레그램으로 요약본 보내줘');
        ok(sentMsgs.length === 1, '텔레그램으로 1건 보냈다 (' + sentMsgs.length + ')');
        const body = sentMsgs[0] || '';
        ok(body.indexOf('🤖') === 0 || body.indexOf('🤖') < 20, '요약 절만 보냈다(표 제외)');
        ok(body.indexOf('|---|') === -1, '보낸 글에 마크다운 구분선이 없다');
        ok(body.indexOf('**') === -1, '보낸 글에 별표가 없다(<b> 로 변환됨)');
        const a2 = lastAi();
        ok(!!a2 && /✅/.test(a2.text) && a2.tgResult === true, '채팅에 성공 결과가 남았다');

        // ③ 전문 전송 — 표까지 포함, escape 확인
        console.log('%c③ "텔레그램으로 보내줘" (전문)', 'font-weight:bold');
        seed();
        await ask('텔레그램으로 보내줘');
        ok(sentMsgs.length === 1, '1건 보냈다');
        ok((sentMsgs[0].match(/^• 11-02/gm) || []).length === 2, '표가 행마다 한 줄로 펴졌다');
        ok(sentMsgs[0].indexOf('&lt;18건&gt;') !== -1, '제목 속 `<>` 가 escape 됐다');

        // ④ 다른 말이 섞이면 확인 1회 — 엉뚱한 답변이 그냥 나가면 안 된다
        console.log('%c④ "오늘 일정 텔레그램으로 알려줘" → 확인 카드', 'font-weight:bold');
        seed();
        await ask('오늘 일정 텔레그램으로 알려줘');
        ok(sentMsgs.length === 0, '확인 전에는 보내지 않았다');
        const cb = window._ganttQaPendingConfirmButtons;
        ok(!!cb && (cb.buttons || []).some((b) => b.value === '__tgSendConfirm__'), '확인 버튼이 떴다');
        ok(!!window._qaTgPending && !!window._qaTgPending.text, '보낼 내용이 보관됐다');
        if (cb) {
            window._ganttQaSubmitConfirmButton(cb.id, '__tgSendConfirm__');
            ok(await waitFor(() => sentMsgs.length === 1), '버튼을 누르면 보낸다');
        }
        ok(!window._qaTgPending, '보낸 뒤 보관분이 비워졌다(재전송 방지)');

        // ⑤ 취소
        console.log('%c⑤ 취소', 'font-weight:bold');
        seed();
        await ask('오늘 일정 텔레그램으로 알려줘');
        const cb2 = window._ganttQaPendingConfirmButtons;
        if (cb2) {
            window._ganttQaSubmitConfirmButton(cb2.id, '__tgSendCancel__');
            await waitFor(() => !window._qaTgPending);
        }
        ok(sentMsgs.length === 0, '취소하면 보내지 않는다');

        // ⑥ 직전 답변이 없을 때 — 조용히 실패하지 않고 안내한다
        console.log('%c⑥ 보낼 답변이 없을 때', 'font-weight:bold');
        window._ganttQaHistory = []; sentMsgs = []; window._qaTgPending = null;
        await ask('텔레그램으로 보내줘');
        ok(sentMsgs.length === 0, '아무것도 보내지 않았다');
        const a6 = lastAi();
        ok(!!a6 && /직전 답변|previous answer/.test(a6.text), '무엇을 보내는 기능인지 안내했다');

        // ⑦ 같은 명령 두 번 — "✅ 보냈습니다"를 다시 보내면 안 된다
        console.log('%c⑦ 연속 두 번', 'font-weight:bold');
        seed();
        await ask('텔레그램으로 보내줘');
        sentMsgs = [];
        await ask('텔레그램으로 보내줘');
        ok(sentMsgs.length === 1 && sentMsgs[0].indexOf('✅') === -1,
            '두 번째도 원래 답변을 보낸다(결과 말풍선을 되보내지 않는다)',
            (sentMsgs[0] || '').slice(0, 40));

        // ⑧ 발송 실패를 삼키지 않는가
        console.log('%c⑧ 발송 실패', 'font-weight:bold');
        window.sendTelegramAlarm = async () => ({ ok: false, errDesc: 'chat not found' });
        seed();
        await ask('텔레그램으로 보내줘');
        const a8 = lastAi();
        ok(!!a8 && a8.error === true && /chat not found/.test(a8.text), '실패 사유를 그대로 보여준다');
        ok(!!a8 && /kortek_backend|Telegram/.test(a8.text), '고치는 방법도 같이 적었다');
    } catch (e) {
        fails++;
        console.error('❌ 하네스가 예외로 멈췄다:', e);
    } finally {
        window.sendTelegramAlarm = origSend;
        window._ganttQaHistory = origHist;
        window._qaPendingConfirmButtons = origPending || null;
        window._qaTgPending = null;
        window._renderGanttQaMessages();
    }

    console.log('%c' + (fails ? '❌ 실패 ' + fails + '건' : '✅ 전부 통과') + ' (통과 ' + passes + '건)',
        'font-weight:bold; font-size:13px; color:' + (fails ? '#c92a2a' : '#1f7a3d'));
})();
