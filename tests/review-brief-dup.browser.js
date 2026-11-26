// 🔗≈ 프로젝트 리뷰 **회의 브리핑** 표의 "같은 메일 묶기·비슷한 업무" 하네스 (2026-11-26) — 브라우저 콘솔에 붙여넣기.
//   AI 요약(보관본)이 있는 기간을 연 채로. 진짜: 브리핑 그리기 · 공용 모듈(js/81) · 회의 줄 이동. 가짜 없음(읽기만, 끝에 펼침을 접는다).
//   ⚠️ 실데이터에 같은 메일이 다른 프로젝트 업무로 따로 요약된 줄이 없으면 🔗 항목은 "없음" 으로 통과한다(AI 가 공통 이슈 한 줄로 이미 묶는 경우가 많다).
(async function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var S = function () { return window._fdup.state('ps-brief'); };
    var rows = function () { return document.querySelectorAll('#ps-ai-tbl tr[id^="ps-brief-"]'); };
    try {
        window.switchTab('psummary'); await w(1200);
        window._psTblSet({ reset: 1, view: 'brief', by: 'proj' });
        window._fdup.reset('ps-brief');
        for (var wi = 0; wi < 60 && /확인 중|Scanning/.test(document.getElementById('psummary-page').innerText); wi++) await w(500);
        await w(800);
        if (!rows().length) { console.warn('AI 요약 표가 없는 기간입니다 — 보관본이 있는 기간(예: 오늘)을 고르고 다시'); return ['SKIP 표 없음']; }
        var n0 = rows().length;
        ok('공통 이슈 줄은 같은 메일로 묶지 않는다', !S().all.some(function (t) { return t._g && t.sub; }));
        var g = S().all.filter(function (t) { return t._g; })[0];
        if (g) {
            ok('같은 메일 묶음이면 줄이 줄어든다', n0 < S().all.length, [n0, S().all.length]);
            document.querySelector('#ps-ai-tbl button[onclick*="_fdupGrp(\'ps-brief\', ' + g._g.n + ')"]').click(); await w(300);
            ok('🔗 펼치면 다른 프로젝트 줄이 └ 📁 로', [].some.call(rows(), function (tr) { return /└/.test(tr.cells[0].innerText) && /📁/.test(tr.cells[0].innerText); }));
            window._fdupGrp('ps-brief', g._g.n); await w(300);
        } else ok('같은 메일 묶음 없음(이 기간 실데이터)', true);
        var cl = S().sims[0];
        if (cl) {
            ok('≈ 비슷 칩이 업무 줄에 있다', !!document.querySelector('#ps-ai-tbl button[onclick*="_fdupSim(\'ps-brief\', ' + cl.n + ')"]'));
            window._fdupSim('ps-brief', cl.n); await w(300);
            var kid = [].filter.call(rows(), function (tr) { return /^\s*≈/.test(tr.cells[0].innerText); })[0];
            ok('≈ 펼치면 비슷한 업무가 앵커 아래로 모인다', !!kid && kid.previousElementSibling && /≈ 비슷/.test(kid.previousElementSibling.cells[0].innerText));
            ok('같은 프로젝트끼리만', cl.members.every(function (m) { return m.proj === cl.anchor.proj; }));
            window._fdupSim('ps-brief', cl.n); await w(300);
        } else ok('비슷한 업무 없음(이 기간 실데이터)', true);
        // 회의 줄 → 업무 줄 이동은 묶음 안에 접힌 업무여도 대표 줄로 간다
        var meets = document.querySelectorAll('#ps-meet-slot [id^="ps-meet-"]'), bad = [];
        for (var i = 0; i < meets.length; i++) {
            window._psGoBrief(i); await w(80);
            if (!document.getElementById('ps-meet-hint')) bad.push(i); else window._psBriefBack({ target: document.getElementById('ps-meet-hint') });
        }
        ok('회의 줄은 모두 업무 줄로 간다(' + meets.length + '건)', !bad.length, bad);
        // 근거(#번호) → 사실 카드 → 카드를 누르면 **그 브리핑 업무 줄**로 돌아온다(2026-11-26 "근거 클릭시 위치 이동 안 됨"). 색은 한 가지.
        var refA = document.querySelector('#ps-ai-tbl a[onclick*="_psGoFact"]');
        if (refA) {
            var fromTr = refA.closest('tr');
            refA.click(); await w(400);
            var hint = document.getElementById('ps-back-hint'), card = hint && hint.closest('[id^="ps-fact-"]');
            ok('근거를 누르면 사실 카드로 가서 하이라이트', !!card && /255, 243, 191|fff3bf/.test(card.style.background), card && card.style.background);
            window._psFactBack({ target: hint }); await w(400);
            ok('카드를 누르면 그 브리핑 업무 줄로 돌아와 같은 색으로', !!fromTr && /255, 243, 191|fff3bf/.test(fromTr.style.background) && !document.getElementById('ps-back-hint'), fromTr && fromTr.id);
            document.getElementById('psummary-page').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
        window._fdupMode('ps-brief', 'group'); await w(300);
        ok('묶기를 끄면 업무 수만큼 줄이 나온다', rows().length >= n0, [rows().length, n0]);
        window._fdupMode('ps-brief', 'group'); await w(300);
        window._psTblSet({ by: 'who' }); await w(300);
        ok('담당자별 보기에는 묶기 칩이 없다', !document.querySelector('#ps-ai-tbl button[onclick*="_fdup"]'));
        window._psTblSet({ by: 'proj' });
    } catch (e) { ok('예외 없이', false, String(e && e.stack || e)); }
    console.log(res.join('\n'));
    return res;
})();
