// 📋 AI 요약 "회의 브리핑" 보기 하네스 (2026-11-26) — 브라우저 콘솔에 붙여넣기. 프로젝트(메일 유래 업무가 있는 것)를 연 채로.
//   진짜: 사실 수집(_psCollectFacts) → 프롬프트 → 접지(_psRowsFromAi) → 브리핑 화면(briefHtml) · 정렬/전환/핀셋.
//   가짜(경계 셋뿐): callAiBackend·getActiveAiKey(AI 응답을 프롬프트의 사실 줄 **내용**으로 만든다 — 호출 순서에 기대지 않는다) · 저장(nasAppFile.put/saveToGoogleDrive 스텁).
//   ⚠️ 실제 팀 프로젝트를 열었다면 읽기 전용 3겹(docs/ui-conventions.md "실제 프로젝트를 읽기 전용으로 여는 법")을 먼저 건다.
(async function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var realKey = window.getActiveAiKey, realCall = window.callAiBackend, realPut = window.nasAppFile && window.nasAppFile.put;
    var saved = JSON.parse(JSON.stringify(window.projectMeta.aiPeriodSummary || {}));
    try {
        var puts = [];
        if (window.nasAppFile) window.nasAppFile.put = function (rel, rec) { puts.push({ rel: rel, rec: rec }); return Promise.resolve({ ok: true }); };
        var prompts = [];
        window.getActiveAiKey = function () { return 'fake'; };
        window.callAiBackend = async function (k, prompt) {
            prompts.push(prompt);
            var items = [];
            (prompt.match(/^- #G\d+ .*$/mg) || []).forEach(function (l, i) {
                var g = (l.match(/#G(\d+)/) || [])[1], core = (l.match(/핵심: ([^|]+)/) || [])[1], todo = (l.match(/To do: ([^|]+)/) || [])[1], iss = (l.match(/문제점: ([^|]+)/) || [])[1];
                if (core) items.push({ 분류: '한 일', 내용: core.trim().slice(0, 60), 근거: ['#G' + g] });
                if (iss) items.push({ 분류: '막힌 일', 내용: iss.trim().slice(0, 60), 근거: ['#G' + g] });
                if (todo) { items.push({ 분류: '할 일', 내용: todo.trim().slice(0, 60), 근거: ['#G' + g] }); if (i % 3 === 0) items.push({ 분류: '결정·요청', 내용: '결정: ' + todo.trim().slice(0, 30), 근거: ['#G' + g] }); }
            });
            return { ok: true, data: { result: { candidates: [{ content: { parts: [{ text: JSON.stringify({ items: items.slice(0, 40) }) }] } }] } } };
        };
        window._psTblSet({ reset: 1, view: 'brief', by: 'proj', big: false });
        window.switchTab('psummary'); await w(1200);
        window._psSetMode('week'); await w(2500);
        var made = await window.generatePeriodSummary(window._psMode(), { force: true });
        await w(600);
        ok('프롬프트에 회의용 지시가 있다', prompts.length === 1 && /팀장·파트장이 팀원과 회의/.test(prompts[0]) && /분류마다 \*\*한 행씩\*\*/.test(prompts[0]));
        ok('생성 결과 행이 있다(근거 접지 통과)', !!made && made.rows.length > 0, made && made.rows.length);
        ok('보관본에 프롬프트 버전이 적힌다', !!made && made.pv >= 3, made && made.pv);
        var tbl = document.getElementById('ps-ai-tbl');
        ok('기본은 브리핑 표(열 5개)', !!tbl && tbl.querySelectorAll('thead th').length === 5 && /지금 상태/.test(tbl.innerText) && /필요한 조치/.test(tbl.innerText));
        ok('프로젝트 묶음 줄이 있다', tbl.querySelectorAll('tbody td[colspan="5"]').length >= 1);
        ok('분류 칩은 브리핑에서 숨는다', !document.querySelector('#ps-ai-sec button[onclick*="toggleCat"]'));
        var m = /오늘 회의에서 정할 것 (\d+)건/.exec(tbl.innerText);
        ok('오늘 정할 것 박스(1~6건)', !!m && +m[1] >= 1 && +m[1] <= 6, m && m[1]);
        window._psTblSet({ by: 'who' }); await w(300);
        ok('담당자별 — 사람 이름 묶음', /👤/.test(document.getElementById('ps-ai-tbl').innerText));
        window._psTblSet({ by: 'proj', big: true }); await w(300);
        ok('크게 — 글자 14.5px', getComputedStyle(document.querySelector('#ps-ai-tbl tbody td:nth-child(2)')).fontSize === '14.5px');
        window._psTblSet({ big: false }); await w(300);
        window._psTblSet({ view: 'rows' }); await w(300);
        ok('행 목록 전환 — 분류 칩·행 표', !!document.querySelector('#ps-ai-tbl tbody tr[id^="ps-row-"]') && !!document.querySelector('#ps-ai-sec button[onclick*="toggleCat"]'));
        window._psTblSet({ reset: 1 }); await w(300);
        ok('필터 초기화는 보기 방식을 안 바꾼다', document.querySelector('#ps-ai-tbl tbody tr[id^="ps-row-"]') !== null);
        // 옛 보관본(pv 없음)은 재사용으로 AI 를 건너뛰지 않는다
        window._psTblSet({ view: 'brief' });
        var before = prompts.length;
        var old = window._psArchiveFind; window._psArchiveFind = async function () { var r = JSON.parse(JSON.stringify(made)); delete r.pv; r.sig = made.rangeKey; r.rows = made.rows; return r; };
        await window.generatePeriodSummary(window._psMode(), {});
        ok('옛 형식 보관본은 새로 생성한다(AI 호출 +1)', prompts.length === before + 1, prompts.length - before);
        window._psArchiveFind = old;
        // 💾 보관본 재활용 — 사실 수(n)만 달라진 같은 기간·필터는 "가까운 보관본" 으로 찾는다(AI 0회)
        var put = puts.filter(function (x) { return /App_Config\/AiSummary\//.test(x.rel); })[0];
        ok('생성하면 보관함에 저장된다(put 1건 이상)', !!put, puts.length);
        if (put) {
            var nm = put.rel.split('/').pop(), pn = window._psArchiveParseName(nm);
            ok('보관본 이름에 기간·필터 해시가 있다', !!pn && /^[0-9a-f]{8}$/.test(pn.base), nm);
            ok('옛 이름(해시 하나)도 읽힌다', (function () { var q = window._psArchiveParseName('20261120_101500__0123abcd__주간.json'); return !!q && q.base === '' && q.title === '주간'; })());
            var rl = window._psArchiveList, rg = window._psArchiveGet;
            window._psArchiveList = async function () { return [nm]; };
            window._psArchiveGet = async function () { return put.rec; };
            try {
                var sigA = put.rec.sig, sigB = sigA.replace(/\|n=\d+$/, '|n=99999');
                ok('사실 수가 다르면 정확히 같은 조건은 없다', sigB !== sigA && (await window._psArchiveFind(sigB)) === null);
                var near = await window._psArchiveFindNear(sigB);
                ok('같은 기간·필터면 가까운 보관본을 찾는다', !!near && near.sig === sigA);
                ok('기간이 다르면 못 찾는다', (await window._psArchiveFindNear('다른기간' + sigA)) === null);
            } finally { window._psArchiveList = rl; window._psArchiveGet = rg; }
        }
    } catch (e) { ok('실행', false, e && e.message); }
    finally {
        window.getActiveAiKey = realKey; window.callAiBackend = realCall; if (window.nasAppFile && realPut) window.nasAppFile.put = realPut;
        window.projectMeta.aiPeriodSummary = saved; window._psTblSet({ reset: 1, view: 'brief' });
    }
    console.log(res.join('\n')); return res;
})();
