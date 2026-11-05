/* ⚡ Gantt 스크롤 가상화 하네스 — 브라우저 콘솔 (2026-11-05)
 *
 * 돌리는 법: 행이 많은 프로젝트(실측은 LNW_STELLAR32, 908행)를 열고 Gantt 탭에서 통째로 붙여넣기.
 *
 * 무엇을 지키는가 — 화면 밖 행은 **높이만 가진 빈 행**(`<tr data-lazy><td class="gantt-lazy-td">`)으로
 *   두고, 스크롤을 따라 채운다(js/04j). 빠른 대신 **조용히 틀릴 수 있는 길**이 셋이라 전부 박아둔다:
 *     ① 화면 안에 안 채워진 빈 행이 남으면 사람 눈엔 **데이터가 사라진 것**으로 보인다.
 *     ② 스크롤 막대 길이·위치는 자리표시 높이의 **어림값**에 기댄다 — 어긋나면 스크롤이 튄다.
 *     ③ 인쇄·"표시 No." 해석처럼 **화면 밖까지 읽는 길**은 먼저 다 채워야 한다
 *        (안 그러면 종이에 빈 줄, AI 문답은 "그 번호 행이 없다").
 *
 * ⚠️ 저장은 킬스위치로 막는다. `_wbsCollapsed` 는 저장 대상이 아니라(js/04c) 펼쳐 둬도 파일에 안 남는다.
 * ⚠️ 창이 **실제로 보이는 상태**에서 돌릴 것 — 숨은 탭은 rAF 가 안 돌아 스크롤 채우기가 멈춘다.
 */
(async function () {
    const R = [];
    const ok = (n, c, info) => R.push({ t: n, pass: !!c, info: info === undefined ? '' : String(info) });
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const G = () => window.globalData;
    const tb = document.getElementById('table-body');
    const box = document.getElementById('gantt-table-scroll');
    if (!G() || G().length < 100) { console.error('❌ 행이 많은 프로젝트를 먼저 열어주세요(100행 이상).'); return; }
    if (!box) { console.error('❌ #gantt-table-scroll 을 못 찾았습니다.'); return; }

    if (!window.__perfKill) {
        const of = window.fetch;
        window.__perfKill = { of, blocked: [] };
        window.fetch = function (input, init) {
            const u = (typeof input === 'string' ? input : (input && input.url) || '');
            const m = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            if (/\/nas\/app\/(put|delete|mkdir)/.test(u) || (m !== 'GET' && /\/nas\//.test(u) && !/status|list|get|paths/.test(u))) {
                window.__perfKill.blocked.push(m + ' ' + u.slice(0, 90));
                return Promise.resolve(new Response(JSON.stringify({ ok: true, killswitch: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
            }
            return of.apply(this, arguments);
        };
    }
    const realSave = window.saveToGoogleDrive;
    window.saveToGoogleDrive = function () { return Promise.resolve(); };
    const snapCollapse = G().map((r, i) => (i > 0 && r) ? !!r._wbsCollapsed : false);
    const snapScroll = box.scrollTop;

    const visTrs = () => [...tb.querySelectorAll('tr')].filter(t => t.style.display !== 'none');
    const expandAll = () => { G().forEach((r, i) => { if (i > 0 && r) r._wbsCollapsed = false; }); window.renderTable(G()); window.applyFilters(); void tb.offsetHeight; };

    // 지금 화면(스크롤 창) 안에 걸쳐 있는 행만 골라 "빈 행이 있나 / 번호가 연속인가"를 본다
    const inView = () => {
        const boxR = box.getBoundingClientRect();
        const head = document.getElementById('table-head');
        const headH = head ? head.getBoundingClientRect().height : 0;
        const out = { seen: 0, blank: 0, nums: [] };
        visTrs().forEach(tr => {
            const r = tr.getBoundingClientRect();
            if (r.bottom < boxR.top + headH + 1 || r.top > boxR.bottom - 1) return;
            out.seen++;
            if (tr.hasAttribute('data-lazy')) out.blank++;
            else { const s = tr.querySelector('.row-num-span'); if (s) out.nums.push(parseInt(s.textContent, 10)); }
        });
        return out;
    };

    try {
        if (window.switchTab) window.switchTab('gantt');
        await sleep(300);
        expandAll();
        const total = visTrs().length;
        ok('T0 행이 충분히 보인다(가상화를 시험할 만큼)', total > 200, total + '행');

        // ── T1 전부 펼쳐도 칸은 화면 몫만 만든다 ────────────────────────────
        const built = tb.querySelectorAll('tr:not([data-lazy])').length;
        ok('T1-a 칸을 만든 행이 전체의 1/4 미만', built < total / 4, built + ' / ' + total);
        ok('T1-b 자리표시 행이 실제로 있다', tb.querySelectorAll('tr[data-lazy]').length > 0);
        ok('T1-c tbody HTML 이 1MB 미만', tb.innerHTML.length < 1048576, (tb.innerHTML.length / 1048576).toFixed(2) + 'MB');

        // ── T2 스크롤 막대가 거짓말하지 않는다 ──────────────────────────────
        //    자리표시 높이(--gantt-row-h)가 실제 행 높이와 다르면 표 전체 높이가 틀어지고,
        //    스크롤을 끌 때 내용이 튄다. 오차 5% 안이면 눈에 안 띈다.
        {
            const h = window._ganttRowH || 0;
            ok('T2-a 행 높이를 실제로 쟀다', h >= 10 && h <= 200, h + 'px');
            const want = total * h, got = box.scrollHeight;
            ok('T2-b 표 높이 ≈ 행수 × 행높이 (오차 5% 안)',
                Math.abs(got - want) / want < 0.05, got + 'px (어림 ' + want + 'px)');
        }

        // ── T3 어디로 스크롤해도 화면 안에 빈 행이 없다 ─────────────────────
        for (const frac of [0, 0.25, 0.5, 0.75, 1, 0.4, 0]) {
            box.scrollTop = Math.round((box.scrollHeight - box.clientHeight) * frac);
            await sleep(50); await new Promise(r => requestAnimationFrame(r)); await sleep(120);
            const v = inView();
            const label = Math.round(frac * 100) + '%';
            ok('T3 ' + label + ' — 화면 안 빈 행 0', v.blank === 0, v.blank + '개 / 화면 ' + v.seen + '행');
            ok('T3 ' + label + ' — 번호가 연속',
                v.nums.length > 2 && v.nums.every((n, i) => i === 0 || n === v.nums[i - 1] + 1),
                v.nums.length ? (v.nums[0] + '~' + v.nums[v.nums.length - 1]) : '번호 없음');
        }

        // ── T4 맨 끝 행의 번호 = 보이는 행 수 (중간에 빠진 행이 없다) ────────
        {
            box.scrollTop = box.scrollHeight;
            await sleep(50); await new Promise(r => requestAnimationFrame(r)); await sleep(150);
            const v = inView();
            ok('T4 마지막 번호 = 보이는 행 수', v.nums[v.nums.length - 1] === total,
                v.nums[v.nums.length - 1] + ' / ' + total);
            box.scrollTop = 0; await sleep(120);
        }

        // ── T5 접기/펴기 뒤에도 빈 행이 안 남는다 ───────────────────────────
        {
            window.toggleWbsBranchFull(1); await sleep(120); await new Promise(r => requestAnimationFrame(r)); await sleep(80);
            ok('T5-a 가지 접은 뒤 빈 행 0', inView().blank === 0);
            window.toggleWbsBranchFull(1); await sleep(120); await new Promise(r => requestAnimationFrame(r)); await sleep(80);
            ok('T5-b 가지 편 뒤 빈 행 0', inView().blank === 0);
            window.wrToggleAllWbsCollapse(); await sleep(150);
            ok('T5-c 전체 접은 뒤 빈 행 0', inView().blank === 0);
            window.wrToggleAllWbsCollapse(); await sleep(200); await new Promise(r => requestAnimationFrame(r)); await sleep(80);
            ok('T5-d 전체 편 뒤 빈 행 0', inView().blank === 0, inView().seen + '행');
        }

        // ── T6 "표시 No." 는 화면 밖 행도 찾아야 한다 ───────────────────────
        //    자리표시엔 번호 칸이 없다 → applyFilters 가 tr.dataset.vno 에 적어 둔 값을 봐야 한다.
        {
            expandAll(); box.scrollTop = 0; await sleep(150);
            const targetNo = Math.min(700, total - 1);
            const realIdx = window._ganttQaResolveDisplayNoToRealIdx(targetNo);
            const tr = realIdx != null ? tb.querySelector('tr[data-row-index="' + realIdx + '"]') : null;
            ok('T6-a 화면 밖 표시No.를 실제 인덱스로 바꾼다', realIdx != null, '표시 ' + targetNo + ' → ' + realIdx);
            ok('T6-b 그 행이 자리표시인데도 찾았다(= data-vno 로 찾음)',
                !!tr && tr.dataset.vno === String(targetNo), tr ? ('vno=' + tr.dataset.vno + ', lazy=' + tr.hasAttribute('data-lazy')) : 'tr 없음');
        }

        // ── T7 인쇄 — 전부 채우고 복제본에 빈 행이 없어야 한다 ──────────────
        {
            expandAll(); await sleep(100);
            const lazyBefore = tb.querySelectorAll('tr[data-lazy]').length;
            window._ganttHydrateAll();
            ok('T7-a _ganttHydrateAll 이 자리표시를 다 채운다',
                tb.querySelectorAll('tr[data-lazy]').length === 0, lazyBefore + '개 → 0');
            const clone = document.getElementById('myTable').cloneNode(true);   // smartPrint 와 같은 복제
            ok('T7-b 인쇄 복제본에 빈 행이 없다', clone.querySelectorAll('tbody tr[data-lazy]').length === 0);
            const nums = [...clone.querySelectorAll('tbody tr')].filter(t => t.style.display !== 'none')
                .map(t => { const s = t.querySelector('.row-num-span'); return s ? parseInt(s.textContent, 10) : null; }).filter(v => v);
            ok('T7-c 복제본 번호가 1부터 끝까지 연속',
                nums.length > 0 && nums[0] === 1 && nums[nums.length - 1] === nums.length, nums.length + '행');
        }

        // ── T8 다시 그리면 "보이는 만큼"으로 되돌아간다(노드가 무한히 안 쌓인다) ─
        {
            expandAll();
            const after = tb.querySelectorAll('tr:not([data-lazy])').length;
            ok('T8 다시 그리면 칸 만든 행이 다시 줄어든다', after < total / 4, after + ' / ' + total);
        }
    } catch (e) {
        ok('예외 없이 끝남', false, e && e.message);
        console.error(e);
    }

    // 원상복구 — 접힘 상태와 스크롤 위치
    G().forEach((r, i) => { if (i > 0 && r) { if (snapCollapse[i]) r._wbsCollapsed = true; else delete r._wbsCollapsed; } });
    window.renderTable(G()); window.applyFilters();
    box.scrollTop = snapScroll;
    window.saveToGoogleDrive = realSave;
    ok('T9 저장은 한 번도 안 일어났다', (window.__perfKill.blocked || []).length === 0, (window.__perfKill.blocked || []).length + '건 차단');

    const pass = R.filter(r => r.pass).length;
    console.table(R);
    console.log('%c⚡ 스크롤 가상화 하네스: ' + pass + '/' + R.length,
        'font-weight:bold;color:' + (pass === R.length ? '#2f9e44' : '#e03131'));
    window.__vsFails = R.filter(r => !r.pass);
    return pass + '/' + R.length;
})();
