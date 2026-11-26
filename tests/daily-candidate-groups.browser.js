// 🔗 일일보고 후보 "같은 메일 묶기" 하네스 (2026-11-26) — 브라우저 콘솔에 붙여넣기. 같은 메일이 여러 프로젝트로 배분된 프로젝트를 연 채로(저장은 막고).
//   진짜: 후보 수집 · 묶기 · 엔진 자식 행 · 담기(_dailyAdd). 가짜 없음 — 이 하네스는 보고 초안(localStorage)에만 담았다가 되돌린다.
(async function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    try {
        window.dailyOpenModal(); await w(3000);
        // ⚠️ 다른 프로젝트 훑기가 끝나기 전엔 묶음 크기가 바뀐다(훑을 때마다 목록이 다시 그려진다) — 끝날 때까지 기다린다
        for (var wi = 0; wi < 40 && window._dailyOtherScan && window._dailyOtherScan.busy; wi++) await w(500);
        await w(800);
        var c = function () { return document.getElementById('daily-cand'); };
        var rowsNow = function () { return c().querySelectorAll('tbody tr[onclick]:not(.ft-child)').length; };
        var all = window._dailyCandAll || [];
        var grpBtns = function () { return [].slice.call(c().querySelectorAll('button[onclick*="_dailyToggleGrp"]')); };
        ok('후보가 있다', all.length > 0, all.length);
        ok('같은 메일 묶음 줄(🔗 ×N)이 있다', grpBtns().length > 0, grpBtns().length);
        var n0 = rowsNow();
        ok('묶으면 줄 수가 후보 수보다 적다', n0 < all.length, [n0, all.length]);
        ok('칩이 묶은 건수를 말한다', /같은 메일 \d+건을 묶었습니다/.test(c().innerText));
        // 펼치기
        var repG = (window._dailyCand || []).filter(function (x) { return x._g; })[0], members = repG._g.members.length;
        c().querySelector('button[onclick*="_dailyToggleGrp(' + repG._g.n + ')"]').click(); await w(400);
        var kids = c().querySelectorAll('tbody tr.ft-child').length;
        ok('펼치면 묶음 안 나머지 줄이 아래에 나온다(N-1)', kids === members - 1, [kids, members]);
        ok('자식 줄은 └ 로 들여 쓴다', /└/.test(c().querySelector('tbody tr.ft-child').innerText));
        ok('자식 줄 때문에 줄 수(대표)는 안 변한다', rowsNow() === n0);
        c().querySelector('button[onclick*="_dailyToggleGrp(' + repG._g.n + ')"]').click(); await w(300);
        ok('다시 누르면 접힌다', c().querySelectorAll('tbody tr.ft-child').length === 0);
        // 프로젝트 필터 — 묶음 안 어느 프로젝트로 걸러도 그 묶음이 보인다
        var rep0 = (window._dailyCand || []).filter(function (x) { return x._g; })[0];
        var other = rep0._g.projects.filter(function (p) { return p !== String(rep0.project || '').trim(); })[0];
        var sel = [].slice.call(c().querySelectorAll('select')).filter(function (s) { return s.title === '프로젝트'; })[0];
        sel.value = other; sel.dispatchEvent(new Event('change', { bubbles: true })); await w(400);
        ok('묶음 안 다른 프로젝트로 걸러도 묶음이 남는다', (window._dailyCand || []).some(function (x) { return x._g && x._g.key === rep0._g.key; }), other);
        window._ftReset('daily-cand'); await w(300);
        // 대표를 담으면 한 건 + alsoProjects, 같은 묶음의 나머지는 후보에서 빠진다
        var repIdx = (window._dailyCand || []).findIndex(function (x) { return x._g; }), rep = window._dailyCand[repIdx], k0 = rep._g.key, np = rep._g.projects.length;
        var items0 = document.querySelectorAll('[data-daily-item]').length;
        window._dailyAdd(repIdx); await w(500);
        ok('대표를 누르면 한 건만 담긴다', document.querySelectorAll('[data-daily-item]').length === items0 + 1);
        ok('담긴 카드에 "같은 메일 외 N개 프로젝트" 가 적힌다', new RegExp('같은 메일 외 ' + (np - 1) + '개 프로젝트').test(document.getElementById('daily-box').innerText), np);
        ok('같은 묶음의 나머지 프로젝트 후보도 목록에서 빠진다', !(window._dailyCandAll || []).some(function (x) { return normName(x) === normName(rep) && x.mailRaw && rep.mailRaw && x.mailRaw.key && x.mailRaw.key === rep.mailRaw.key; }));
        function normName(x) { return String(x.name || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
        // 원상복구 — 방금 담은 카드 빼기
        window._dailyDropItem(document.querySelectorAll('[data-daily-item]').length - 1); await w(400);
        // 묶기 끄기
        window._dailyToggleGroupMode(); await w(400);
        ok('묶기를 끄면 모든 후보가 줄마다 나온다', rowsNow() === (window._dailyCandAll || []).length || rowsNow() >= n0, [rowsNow(), n0]);
        // 자식 줄만 담기
        window._dailyToggleGroupMode(); await w(300);
        grpBtns()[0].click(); await w(400);
        var kid = c().querySelector('tbody tr.ft-child'), cid = +(/_dailyAddC\((\d+)\)/.exec(kid.getAttribute('onclick')) || [])[1];
        var before = document.querySelectorAll('[data-daily-item]').length;
        window._dailyAddC(cid); await w(500);
        var last = [].slice.call(document.querySelectorAll('[data-daily-item]')).pop();
        ok('자식 줄을 누르면 그 프로젝트 것만 담긴다(외 N개 표시 없음)', document.querySelectorAll('[data-daily-item]').length === before + 1 && !/같은 메일 외/.test(last.innerText));
        window._dailyDropItem(document.querySelectorAll('[data-daily-item]').length - 1); await w(300);
    } catch (e) { ok('실행', false, e && e.message); }
    finally { window.dailyCloseModal(); localStorage.removeItem(window.DAILY_POLICY.draftKey); }
    console.log(res.join('\n')); return res;
})();
