// 🔗≈ 프로젝트 리뷰 근거 사실 표 "같은 메일 묶기·비슷한 업무" 하네스 (2026-11-26) — 브라우저 콘솔에 붙여넣기. 같은 메일이 여러 프로젝트로 배분된 프로젝트를 연 채로(저장은 막고).
//   진짜: 사실 수집 · 공용 모듈(js/81) · 표 엔진 자식 행 · 근거 이동(_psGoFact) · 열 필터. 가짜 없음(읽기만 한다 — 시험 끝에 상태를 원래대로).
(async function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var S = function () { return window._fdup.state('ps-facts'); };
    var body = function () { return document.getElementById('ps-facts-body'); };
    var mainRows = function () { return body().querySelectorAll('tbody tr[id^="ps-fact-"]:not(.ft-child)').length; };
    try {
        window.switchTab('psummary'); await w(1200);
        window._psTblSet({ reset: 1, view: 'brief' });
        window._fdup.reset('ps-facts');   // 이전 실행에서 펼친 묶음이 남아 있으면 첫 클릭이 접기가 된다
        window._psSetMode('week'); await w(4000);
        // ⚠️ 다른 프로젝트 훑기가 끝날 때까지 기다린다(끝날 때마다 표가 다시 그려져 묶음이 바뀐다)
        for (var wi = 0; wi < 60 && /확인 중|Scanning/.test(document.getElementById('psummary-page').innerText); wi++) await w(500);
        await w(800);
        ok('공용 모듈이 로드돼 있다', !!window._fdup && !!window.DUP_SIMILAR);
        ok('근거 사실 표가 있다', !!body() && body().querySelectorAll('tbody tr').length > 0);
        var allN = S().all.length, rowsN = mainRows();
        ok('같은 메일 묶음(🔗 ×N)이 있다', S().groups > 0, S().groups);
        ok('묶으면 줄 수가 사실 수보다 적다', rowsN < allN, [rowsN, allN]);
        ok('칩이 묶은 건수를 말한다', /같은 메일 \d+건 묶음/.test(body().innerText));
        // 펼치기 — 자식 줄도 근거 이동 id 를 갖는다
        var rep = S().all.filter(function (x) { return x._g; })[0], n = rep._g.members.length;
        body().querySelector('button[onclick*="_fdupGrp(\'ps-facts\', ' + rep._g.n + ')"]').click(); await w(400);
        var kids = [].slice.call(body().querySelectorAll('tbody tr.ft-child[id^="ps-fact-"]'));
        ok('펼치면 나머지 N-1 줄이 아래에 나온다', kids.length >= n - 1, [kids.length, n]);
        ok('자식 줄은 └ 로 들여 쓴다', /└/.test(kids[0].innerText));
        var childKey = kids[0].id.replace('ps-fact-', '');
        body().querySelector('button[onclick*="_fdupGrp(\'ps-facts\', ' + rep._g.n + ')"]').click(); await w(400);
        ok('접으면 자식 줄이 사라진다', body().querySelectorAll('tbody tr.ft-child').length === 0 && !document.getElementById('ps-fact-' + childKey));
        // 근거 이동 — 접힌 묶음 안 행이어도 펼쳐서 찾아 간다
        window._psGoFact(childKey, 0); await w(600);
        ok('접힌 묶음 안 행으로 근거 이동하면 펼쳐서 그 행으로 간다', !!document.getElementById('ps-fact-' + childKey) && !!document.getElementById('ps-back-hint'));
        window._psFactBack({ target: document.getElementById('ps-back-hint') }); await w(300);
        // 프로젝트 필터 — 묶음 안 다른 프로젝트로 걸러도 그 묶음이 남는다
        var other = rep._g.projects.filter(function (p) { return p !== String(rep.project || '').trim(); })[0];
        var sel = [].slice.call(body().querySelectorAll('select')).filter(function (x) { return x.title === '프로젝트'; })[0];
        sel.value = other; sel.dispatchEvent(new Event('change', { bubbles: true })); await w(400);
        ok('묶음 안 다른 프로젝트로 걸러도 묶음이 남는다', S().all.some(function (x) { return x._g && x._g.key === rep._g.key; }) && mainRows() >= 1, other);
        window._ftReset('ps-facts'); await w(300);
        // 비슷한 업무
        var simOn = S().sims.length;
        ok('비슷한 업무 칩이 있거나(있으면 ≈) 없다(없으면 칩 없음)', simOn ? /≈ 비슷 \d+묶음/.test(body().innerText) : !/≈ 비슷 \d+묶음/.test(body().innerText), simOn);
        if (simOn) {
            var cl = S().sims[0];
            ok('비슷한 업무는 같은 프로젝트끼리', cl.members.every(function (m) { return String(m.project || '') === String(cl.anchor.project || ''); }));
            body().querySelector('button[onclick*="_fdupSim(\'ps-facts\', ' + cl.n + ')"]').click(); await w(400);
            ok('펼치면 ≈ 자식 줄이 나온다', [].slice.call(body().querySelectorAll('tbody tr.ft-child')).some(function (t) { return /≈/.test(t.innerText); }));
            ok('검토 화면엔 [＋ 모두 담기] 가 없다(담는 자리가 아니다)', !body().querySelector('button[onclick*="_fdupAddAll"]'));
            body().querySelector('button[onclick*="_fdupSim(\'ps-facts\', ' + cl.n + ')"]').click(); await w(300);
        }
        // 끄기
        window._fdupMode('ps-facts', 'group'); await w(400);
        ok('묶기를 끄면 줄 수가 사실 수만큼 나온다', mainRows() >= rowsN && !/같은 메일 \d+건 묶음/.test(body().innerText), [mainRows(), rowsN]);
        window._fdupMode('ps-facts', 'group'); await w(300);
    } catch (e) { ok('실행', false, e && e.message); }
    console.log(res.join('\n')); return res;
})();
