/* 📧 메일 표 행 클릭 칩 — 앱 안에서 실제 경로로 돌리는 검증 (2026-11-02)
 *
 *   쓰는 법: 앱을 열고 **AI 문답 창을 띄운 뒤** 콘솔에 이 파일 전체를 붙여넣는다.
 *            그룹웨어 로그인도, 백엔드도, AI 키도 없어도 된다(아래 가짜는 경계 3개뿐).
 *
 * 무엇을 보나 — "칩이 그려진다"가 아니라 **칩이 제 기능으로 이어지는가**.
 *   2026-10-29 칩 표 사고(렌더러만 직접 불러 "된다"고 보고했는데 정작 연결이 끊겨 있었다,
 *   CLAUDE.md "고쳤다의 정의")와 같은 자리를 노린다. 그래서 전부
 *   **행을 진짜로 click() → 나온 칩 값을 sendGanttQaMessage() 에 넣는** 경로로 돌린다.
 *
 * 가짜는 바깥 경계에만:
 *   · `sendTelegramAlarm`  (네트워크)
 *   · `getActiveAiKey` / `callAiBackend` / `_extractGanttQaAiText` (AI 키·호출)
 *   · `_sapSelectMaterial` (SAP 메뉴가 열렸는지만 본다 — 메뉴 자체는 js/04g 기존 기능)
 *   그 안쪽(칩 목록·라우팅·프롬프트 조립·표 렌더)은 전부 진짜 코드다.
 */
(async function () {
    'use strict';
    const input = document.getElementById('gantt-qa-input');
    if (!input) { console.error('❌ AI 문답 창을 먼저 열어주세요 (#gantt-qa-input 없음)'); return; }

    let fails = 0, passes = 0;
    const ok = (c, label, extra) => {
        if (c) { passes++; console.log('%c ✅ ' + label, 'color:#1f7a3d'); }
        else { fails++; console.log('%c ❌ ' + label + (extra ? ' — ' + extra : ''), 'color:#c92a2a'); }
    };
    const lastAi = () => {
        const h = window._ganttQaHistory.filter(m => m.role === 'ai' && !m.pending);
        return h[h.length - 1] || {};
    };
    const flat = (s) => String(s || '').replace(/\s+/g, ' ');

    // 실제 메일 목록과 **같은 모양**의 행(gw_bridge._mail_brief 가 주는 필드 그대로)
    const MAILS = [
        { id: 900001, at: '2026-11-02T10:13:02+09:00', date: '2026-11-02',
          from: 'hong@example.com', to: 'me@example.com', seen: false,
          subject: '근무계획 확인/수정 요청의 건',
          preview: '안녕하세요. 인사팀입니다. 근무계획을 확인 및 수정하여 주시기 바랍니다.' },
        { id: 900002, at: '2026-11-02T10:48:00+09:00', date: '2026-11-02',
          from: '홍길동', to: '개발N팀', seen: true,
          subject: '123456 샘플 43" 자재 요청 件',
          preview: '자재 123456 과 구매오더 4500000000 건 확인 부탁드립니다. 전화 02-000-0000' }
    ];

    const origSend = window.sendTelegramAlarm, origHist = window._ganttQaHistory;
    const origKey = window.getActiveAiKey, origCall = window.callAiBackend,
          origEx = window._extractGanttQaAiText, origSap = window._sapSelectMaterial;
    let sent = [], prompts = [], sapOpened = null;

    const seed = () => {
        window._ganttQaHistory = [{ role: 'user', text: '그룹웨어 오늘 메일 보여줘' }];
        window._qaMailPushTable('📧 **오늘 메일 ' + MAILS.length + '건**', MAILS);
        window._qaPendingConfirmButtons = null;
        window._renderGanttQaMessages();
        sent = []; prompts = []; sapOpened = null;
    };
    const clickRow = (i) => {
        const trs = [...document.getElementById('gantt-qa-messages').querySelectorAll('tbody tr[onclick]')];
        if (!trs[i]) return null;
        trs[i].click();                                  // 사람이 누르는 그대로
        return window._ganttQaPendingConfirmButtons;
    };
    const chip = (cb, token) => (cb ? cb.buttons : []).find(b => String(b.value).indexOf(token) === 0);
    const press = async (b) => { input.value = b.value; await window.sendGanttQaMessage(); };

    try {
        window.sendTelegramAlarm = async (m) => { sent.push(m); return { ok: true }; };
        window.getActiveAiKey = () => 'TEST-KEY';
        window.callAiBackend = async (k, p) => { prompts.push(String(p)); return { ok: true }; };
        window._extractGanttQaAiText = () => '(가짜 AI 응답)';
        window._sapSelectMaterial = (m) => { sapOpened = m; };

        // ① 표가 그려지고 행이 눌리는가
        console.log('%c① 메일 칩 표', 'font-weight:bold');
        seed();
        const box = document.getElementById('gantt-qa-messages');
        ok(box.querySelectorAll('table').length === 1, '표가 하나 그려졌다');
        ok(box.querySelectorAll('tbody tr[onclick]').length === 2, '행 2개가 클릭 가능하다');
        const styles = [...box.querySelectorAll('tbody tr')].map(t => t.getAttribute('style') || '');
        ok(/#fff/.test(styles[0]) && /#f7f9fc/.test(styles[1]), '줄무늬(제브라)로 칠해진다');
        ok(!!lastAi().tgText, '텔레그램용 마크다운(tgText)이 같이 실려 있다');

        // ② 칩 목록이 행마다 다른가 — 할 수 없는 칩은 안 보여야 한다
        console.log('%c② 행마다 다른 칩', 'font-weight:bold');
        seed();
        const cb0 = clickRow(0), cb1 = clickRow(1);
        ok(!!chip(cb0, '__gwMailReply__'), '보낸이가 주소면 답장 칩이 있다');
        ok(!chip(cb1, '__gwMailReply__'), '보낸이가 이름뿐이면 답장 칩이 없다');
        ok(!chip(cb0, '__gwMailSap__'), '번호가 없는 메일엔 SAP 칩이 없다');
        ok(!!chip(cb1, '__gwMailSap__'), '번호가 있는 메일엔 SAP 칩이 있다');
        const nums = window._qaMailSapNums(MAILS[1]).map(n => n.kind + ':' + n.num);
        ok(nums.indexOf('material:123456') >= 0 && nums.indexOf('order:4500000000') >= 0,
           '자재·구매오더를 둘 다 집는다', nums.join(','));
        ok(nums.join(',').indexOf('3055') === -1 && nums.join(',').indexOf('2026') === -1,
           '전화번호·연도는 안 집는다', nums.join(','));

        // ③ 📄 본문 발췌 — 네트워크 없이 목록 발췌만
        console.log('%c③ 본문 발췌', 'font-weight:bold');
        seed(); await press(chip(clickRow(0), '__gwMailBody__'));
        ok(flat(lastAi().text).indexOf('인사팀입니다') >= 0, '발췌가 나온다');
        ok(/열지 않았|not opened/.test(lastAi().text), '메일을 열지 않았다고 밝힌다');

        // ④ 💬 텔레그램 — 그 메일 한 통만
        console.log('%c④ 텔레그램으로', 'font-weight:bold');
        seed(); await press(chip(clickRow(1), '__gwMailTg__'));
        ok(sent.length === 1, '1건 보냈다 (' + sent.length + ')');
        ok(flat(sent[0]).indexOf('123456') >= 0 && flat(sent[0]).indexOf('근무계획') === -1,
           '누른 메일만 보냈다(목록 전체가 아니다)');
        ok(sent[0].indexOf('&quot;') >= 0 || sent[0].indexOf('43"') >= 0, '제목의 따옴표가 깨지지 않았다');

        // ⑤ 🤖 요약 — **그 한 통만** 프롬프트에 넣는가(실측 버그: 목록 블록이 가로챘었다)
        console.log('%c⑤ 요약·조치 제안', 'font-weight:bold');
        seed(); await press(chip(clickRow(0), '__gwMailAsk__'));
        ok(prompts.length === 1, 'AI를 한 번만 부른다 (' + prompts.length + ')');
        ok(/한 통/.test(prompts[0] || ''), '"메일 한 통" 프롬프트다');
        ok((prompts[0] || '').indexOf('123456') === -1, '다른 메일이 섞여 들어가지 않았다');
        ok((prompts[0] || '').indexOf('근무계획') >= 0, '누른 메일 내용이 들어갔다');

        // ⑥ 📋 업무 등록 / 📅 일정 — 기존 자연어 경로로 넘어가는가
        console.log('%c⑥ 업무·일정으로 잇기', 'font-weight:bold');
        seed(); await press(chip(clickRow(0), '__gwMailTask__'));
        const q1 = window._ganttQaHistory.filter(m => m.role === 'user').slice(-1)[0] || {};
        ok(/간트에 업무 추가|Add a Gantt task/.test(q1.text || ''), '간트 추가 명령으로 넘어간다', flat(q1.text).slice(0, 50));
        seed(); await press(chip(clickRow(0), '__gwMailCal__'));
        const q2 = window._ganttQaHistory.filter(m => m.role === 'user').slice(-1)[0] || {};
        ok(/일정 등록|calendar event/.test(q2.text || '') && /2026-11-02/.test(q2.text || ''),
           '일정 등록 명령에 메일 날짜가 들어간다', flat(q2.text).slice(0, 50));

        // ⑦ 🏭 SAP — 기존 자재 메뉴로 넘긴다(메뉴를 새로 만들지 않는다)
        console.log('%c⑦ SAP로 잇기', 'font-weight:bold');
        seed(); await press(chip(clickRow(1), '__gwMailSap__'));
        const cbSap = window._ganttQaPendingConfirmButtons;
        ok(!!cbSap && cbSap.buttons.length === 2, '번호가 둘이면 고르게 한다 (' + ((cbSap && cbSap.buttons.length) || 0) + ')');
        const matBtn = (cbSap ? cbSap.buttons : []).find(b => String(b.value).indexOf('__sapPickMat__') === 0);
        ok(!!matBtn, '자재 번호 칩이 있다');
        if (matBtn) { await press(matBtn); ok(sapOpened === '123456', 'SAP 자재 메뉴로 넘어갔다 (' + sapOpened + ')'); }

        // ⑧ 행 정보가 사라진 경우 — 조용히 아무 일도 안 일어나면 안 된다
        console.log('%c⑧ 행 정보가 없을 때', 'font-weight:bold');
        seed();
        input.value = '__gwMailBody__999999'; await window.sendGanttQaMessage();
        ok(lastAi().error === true && /다시 조회|look up/.test(lastAi().text), '다시 조회해달라고 알린다');
    } catch (e) {
        fails++; console.error('❌ 하네스가 예외로 멈췄다:', e);
    } finally {
        window.sendTelegramAlarm = origSend; window._ganttQaHistory = origHist;
        window.getActiveAiKey = origKey; window.callAiBackend = origCall;
        window._extractGanttQaAiText = origEx; window._sapSelectMaterial = origSap;
        window._qaPendingConfirmButtons = null;
        window._renderGanttQaMessages();
    }
    console.log('%c' + (fails ? '❌ 실패 ' + fails + '건' : '✅ 전부 통과') + ' (통과 ' + passes + '건)',
        'font-weight:bold; font-size:13px; color:' + (fails ? '#c92a2a' : '#1f7a3d'));
})();
