/* ============================================================================
   🤖📱 텔레그램 ↔ AI 문답 다리 — 진짜 앱에서 돌리는 하네스 (2026-11-08)

   앱(kortek_pm.html)을 열고(NAS 로그인·프로젝트 열린 상태) 콘솔에 붙여넣는다.

   가짜는 **텔레그램 발송 한 곳**(`_qaTelegramSendText`) 뿐이다 — NAS 는 진짜(요청 파일을
   정말 떨어뜨리고 정말 지워지는지 본다), AI 문답 입구도 진짜(`sendGanttQaMessage`).
   그래서 **AI 키가 없으면 "키가 없다"는 답이 텔레그램 발송 가짜에 찍힌다** — 그것도
   정상 통과다(다리는 답을 **그대로** 전달하는 게 일이다). AI-free 로컬 명령으로 물으면
   키 없이도 진짜 답이 나온다(아래 Q1 은 그런 질문이다).

   ⚠️ 실제 텔레그램으로는 아무것도 안 나간다. 끝나면 원상복구한다.
   ============================================================================ */
(async function () {
    'use strict';
    var pass = 0, fail = 0, out = [];
    function ok(name, cond, detail) { if (cond) { pass++; out.push('  OK   ' + name); } else { fail++; out.push('  FAIL ' + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : '')); } }
    var C = window.TG_QA_BRIDGE;
    if (!C || !window._tgqaPollTick) { console.error('js/60 이 로드되지 않았다'); return; }
    if (!window.nasAppFile) { console.error('nasAppFile 이 없다 — NAS 모드로 로그인한 뒤 돌릴 것'); return; }
    var key = window._dailyMyKey && window._dailyMyKey();
    if (!key) { console.error('내 NAS 계정을 모른다 — 🔑 설정에서 로그인 후 새로고침'); return; }

    // 경계 가짜 — 텔레그램 발송만
    var SENT = [], origSend = window._qaTelegramSendText;
    window._qaTelegramSendText = async function (text, chatId) { SENT.push({ text: text, chatId: chatId }); return { ok: true, sent: 1, total: 1 }; };
    var stamp = Date.now();
    var reqName = key + '__tgtest' + stamp + '.json', rel = C.dir + '/' + reqName;
    var hist0 = (window._ganttQaHistory || []).length;
    try {
        // Q1: AI-free 로컬 명령(키 없이도 답이 난다) — "자주 쓰는 질문" 류가 아닌 안전한 조회
        await window.nasAppFile.put(rel, { id: 'tgtest' + stamp, key: key, chatId: '000', name: '하네스', via: 'telegram', reply: 'telegram',
            text: '이 프로젝트 이름이 뭐야', at: new Date().toISOString() });
        var listed = await window.nasAppFile.list(C.dir);
        ok('요청 파일이 NAS 에 정말 생겼다', listed.some(function (it) { return it.name === reqName; }), listed.map(function (i) { return i.name; }));
        var t0 = performance.now();
        var r = await window._tgqaPollTick();
        var ms = Math.round(performance.now() - t0);
        ok('바퀴가 내 요청을 집었다(' + ms + 'ms)', r && r.done && r.done.length >= 1, r);
        var after = await window.nasAppFile.list(C.dir);
        ok('요청 파일이 지워졌다(선점)', !after.some(function (it) { return it.name === reqName; }));
        ok('온라인 신호 파일이 있다', after.some(function (it) { return it.name === 'online__' + key + '.json'; }));
        ok('텔레그램 발송 가짜에 회신 1통(chatId 000)', SENT.length === 1 && SENT[0].chatId === '000', SENT);
        ok('회신 본문이 비어 있지 않다', SENT.length === 1 && String(SENT[0].text).trim().length > 5, SENT[0] && SENT[0].text);
        var H = window._ganttQaHistory || [];
        ok('문답창에 질문 말풍선(user)이 생겼다', H.slice(hist0).some(function (m) { return m.role === 'user' && /프로젝트 이름/.test(m.text); }));
        ok('문답창에 "텔레그램에서 온 질문"·"회신" 안내가 남았다', H.slice(hist0).some(function (m) { return m.tgResult && /텔레그램에서 온/.test(m.text); }) && H.slice(hist0).some(function (m) { return m.tgResult && /회신/.test(m.text); }));
        var modal = document.getElementById('gantt-qa-modal');
        ok('AI 문답 모달이 보인다', !!modal && modal.style.display !== 'none');
        console.log('[회신 본문]\n' + (SENT[0] && SENT[0].text));
    } finally {
        window._qaTelegramSendText = origSend;
        try { await window.nasAppFile.del(rel); } catch (e) { /* 이미 지워졌다 */ }
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    return { pass: pass, fail: fail, sent: SENT };
})();
