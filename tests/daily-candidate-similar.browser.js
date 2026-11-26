// ≈ 일일보고 후보 "비슷한 업무" 알림 하네스 (2026-11-26, 2단계) — 브라우저 콘솔에 붙여넣기. 같은 프로젝트에 업무명이 비슷한 후보가 있는 프로젝트를 연 채로(저장은 막고).
//   진짜: 후보 수집 · 같은 메일 묶기 · 비슷한 업무 묶기 · 펼치기 · 모두 담기. 가짜 없음 — 이 하네스는 보고 초안(localStorage)에만 담았다가 되돌린다.
(async function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    try {
        window.dailyOpenModal(); await w(3000);
        // ⚠️ 다른 프로젝트 훑기가 끝나기 전엔 묶음이 바뀐다(훑을 때마다 목록이 다시 그려진다)
        for (var wi = 0; wi < 40 && window._dailyOtherScan && window._dailyOtherScan.busy; wi++) await w(500);
        await w(800);
        var c = function () { return document.getElementById('daily-cand'); };
        var mainRows = function () { return c().querySelectorAll('tbody tr[onclick]:not(.ft-child)').length; };
        var simBtns = function () { return [].slice.call(c().querySelectorAll('button[onclick*="_dailyToggleSim("]')); };
        var SIM = window.DAILY_SIMILAR;
        ok('수치가 데이터로 있다(DAILY_SIMILAR)', !!SIM && SIM.minShared === 2 && SIM.genericRatio > 0, SIM);
        ok('비슷한 업무 칩("≈ 비슷한 업무 N묶음")이 있다', /≈ 비슷한 업무 \d+묶음/.test(c().innerText));
        var anchor = (window._dailyCand || []).filter(function (x) { return x._sim; })[0];
        ok('비슷한 업무 묶음이 있다', !!anchor);
        if (!anchor) throw new Error('시험 대상 없음');
        var cl = anchor._sim, size = cl.members.length + 1;
        ok('묶음은 모두 같은 프로젝트다', cl.members.every(function (m) { return String(m.project || '') === String(anchor.project || ''); }));
        // 겹치는 낱말이 정말 minShared 개 이상인가(독립 계산)
        var tok = function (s) { return (String(s || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.\-_]*/gu) || []).filter(function (t) { return t.length >= 2 && !/^\d+$/.test(t); }); };
        ok('앵커와 겹치는 낱말이 2개 이상이다', cl.members.every(function (m) { var a = new Set(tok(anchor.name)), n = 0; tok(m.name).forEach(function (t) { if (a.has(t)) n++; }); return n >= 2; }), cl.members.map(function (m) { return m.name; }));
        var before = mainRows();
        ok('접힌 상태에선 비슷한 업무도 각자 줄로 나온다', cl.members.every(function (m) { return !m._simOf.open; }));
        // 펼치기
        c().querySelector('button[onclick*="_dailyToggleSim(' + cl.n + ')"]').click(); await w(400);
        var kids = c().querySelectorAll('tbody tr.ft-child').length;
        ok('펼치면 비슷한 업무가 앵커 아래 자식 줄로 모인다', kids >= cl.members.length, [kids, cl.members.length]);
        ok('자식 줄은 ≈ 로 표시한다', /≈/.test(c().querySelector('tbody tr.ft-child').innerText));
        ok('원래 자리에서는 빠진다(줄 수가 멤버 수만큼 줄어든다)', mainRows() === before - cl.members.length, [before, mainRows()]);
        ok('[＋ 모두 담기] 가 나온다', !!c().querySelector('button[onclick*="_dailyAddSim(' + cl.n + ')"]'));
        // 모두 담기 — 각각 한 건씩
        var items0 = document.querySelectorAll('[data-daily-item]').length;
        window._dailyAddSim(cl.n); await w(600);
        ok('모두 담으면 앵커+비슷한 업무가 각각 한 건씩 담긴다', document.querySelectorAll('[data-daily-item]').length === items0 + size, [items0, document.querySelectorAll('[data-daily-item]').length, size]);
        // 원상복구
        for (var k = 0; k < size; k++) { window._dailyDropItem(document.querySelectorAll('[data-daily-item]').length - 1); await w(200); }
        // 접기
        var b2 = simBtns()[0]; if (b2) { b2.click(); await w(300); }
        // 끄기
        window._dailyToggleSimMode(); await w(400);
        ok('끄면 ≈ 칩이 없다', simBtns().length === 0 && /비슷한 업무 알림 켜기/.test(c().innerText));
        window._dailyToggleSimMode(); await w(300);
        ok('다시 켜면 칩이 돌아온다', /≈ 비슷한 업무 \d+묶음/.test(c().innerText));
    } catch (e) { ok('실행', false, e && e.message); }
    finally { window.dailyCloseModal(); localStorage.removeItem(window.DAILY_POLICY.draftKey); }
    console.log(res.join('\n')); return res;
})();
