/* ⚡ Gantt 표 렌더 속도 + "모양이 안 바뀌었는가" 하네스 — 브라우저 콘솔 (2026-11-05)
 *
 * 돌리는 법: 행이 많은 프로젝트(실측은 LNW_STELLAR32, 906행)를 열고 Gantt 탭에서 통째로 붙여넣기.
 *            결과 객체가 반환된다. 고치기 **전에 한 번**, 고친 **뒤에 한 번** 돌려 두 결과를 비교한다.
 *
 * 왜 이 하네스가 필요한가 — 2026-11-05 실사용 신고 "간트차트가 오히려 느려졌다 / 행 이동도 느리고
 *   펼치고 접는 것도 느리다". 속도 작업은 **실측 없이는 추측**이고(CLAUDE.md "근거는 실측뿐"),
 *   더 위험한 건 "빨라졌지만 모양이 달라진" 변경이다. 그래서 숫자와 **화면 서명**을 같이 뽑는다:
 *     · perf — 사람이 실제로 지나는 경로(펼치기·접기·행 이동 뒤 재계산)의 ms
 *     · sig  — 보이는 행들의 칸별 computed style + 구조. 고치기 전/후가 **같아야** 한다.
 *
 * ⚠️ 저장은 킬스위치로 막는다(NAS 쓰기 fetch 차단) — 실제 팀 프로젝트에서 돌리므로.
 * ⚠️ `_wbsCollapsed` 는 저장 대상이 아니라(js/04c _serializeGD) 펼쳐 둬도 파일에 안 남는다.
 * ⚠️ 측정 수치는 **브라우저 창이 실제로 보이는 상태**에서만 의미가 있다(배경 탭은 느려지거나
 *    거꾸로 레이아웃을 건너뛰어 빨라 보인다 — js/55 에서 겪은 `content-visibility` 착시와 같은 함정).
 */
(async function () {
    const G = () => window.globalData;
    if (!G() || G().length < 50) { console.error('❌ 행이 많은 프로젝트를 먼저 열어주세요.'); return; }

    // ── 저장 킬스위치 ───────────────────────────────────────────────────────
    if (!window.__perfKill) {
        const of = window.fetch;
        window.__perfKill = { of, blocked: [] };
        window.fetch = function (input, init) {
            const u = (typeof input === 'string' ? input : (input && input.url) || '');
            const m = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            if (/\/nas\/app\/(put|delete|mkdir)/.test(u) || (m !== 'GET' && /\/nas\//.test(u) && !/status|list|get|paths/.test(u))) {
                window.__perfKill.blocked.push(m + ' ' + u.slice(0, 90));
                console.warn('[perf killswitch] 쓰기 차단:', m, u);
                return Promise.resolve(new Response(JSON.stringify({ ok: true, killswitch: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
            }
            return of.apply(this, arguments);
        };
    }
    const realSave = window.saveToGoogleDrive;
    window.saveToGoogleDrive = function () { console.warn('[perf harness] 저장 차단됨'); return Promise.resolve(); };

    const tb = document.getElementById('table-body');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // ⚠️ 레이아웃을 **강제로 끝까지** 읽어야 한다 — 안 그러면 브라우저가 미루고 숫자가 거짓으로 작아진다.
    const force = () => { void document.body.offsetHeight; void tb.offsetHeight; void tb.scrollHeight; };
    const t = fn => { const a = performance.now(); fn(); force(); return Math.round(performance.now() - a); };
    const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const expandAll = () => { G().forEach((r, i) => { if (i > 0 && r) r._wbsCollapsed = false; }); window.renderTable(G()); window.applyFilters(); force(); };

    // 멈춤 측정 — `recalculateSchedules` 는 일을 setTimeout 안에서 하므로 동기 측정이 0 이 나온다.
    //   ⚠️ longtask PerformanceObserver 로 재다가 30초짜리 엉터리 값을 받았다(브라우저가 주변 작업까지
    //      한 덩어리로 묶어 보고한다). 그래서 **직접 메인 스레드가 막힌 시간**을 잰다: 16ms 마다
    //      깨어나는 탐침을 걸어 두고, 예정 시각보다 얼마나 늦게 깨어났는지의 최댓값을 본다.
    async function freeze(fn, waitMs) {
        const total = waitMs || 4000;
        let maxGap = 0, stop = false, last = performance.now();
        (function probe() {
            if (stop) return;
            const now = performance.now();
            const gap = now - last - 16;
            if (gap > maxGap) maxGap = gap;
            last = now;
            setTimeout(probe, 16);
        })();
        await sleep(30);          // 탐침이 안정된 뒤에 시작
        maxGap = 0; last = performance.now();
        fn();
        await sleep(total);
        stop = true;
        return { 최장: Math.round(maxGap) };
    }

    const out = { rows: G().length };

    try {
        if (window.switchTab) window.switchTab('gantt');
        await sleep(400);

        // ── 1) 전부 펼친 상태(사람이 실제로 보고 작업하는 상태)에서 핫패스 ─────
        expandAll();
        const visN = [...tb.querySelectorAll('tr')].filter(r => r.style.display !== 'none').length;
        out.보이는행 = visN;
        out['renderTable(ms)'] = med([0, 0].map(() => t(() => window.renderTable(G()))));
        out['applyFilters(ms)'] = med([0, 0, 0].map(() => t(() => window.applyFilters())));

        const g1 = G().findIndex((r, i) => i > 0 && r && (r._level || 0) === 1 && G()[i + 1] && (G()[i + 1]._level || 0) > 1);
        out['한행 접기/펴기(ms)'] = med([0, 0, 0, 0].map(() => t(() => window.toggleWbsCollapse(g1))));

        expandAll();
        out['가지 전체 접기(ms)'] = t(() => window.toggleWbsBranchFull(1));
        out['가지 전체 펼치기(ms)'] = t(() => window.toggleWbsBranchFull(1));

        expandAll();
        out['전체 접기(ms)'] = t(() => window.wrToggleAllWbsCollapse());
        out['전체 펼치기(ms)'] = t(() => window.wrToggleAllWbsCollapse());

        // ── 2) 행 이동(드래그 놓음) 뒤 재계산 — 화면이 멈추는 시간 ─────────────
        expandAll();
        const fz = await freeze(() => window.recalculateSchedules());
        out['행 이동 뒤 멈춤(ms)'] = fz.최장;

        // ── 3) 만들어지는 HTML의 양 — 파싱·레이아웃 비용의 근원 ───────────────
        expandAll();
        const html = tb.innerHTML;
        out['tbody HTML(MB)'] = +(html.length / 1048576).toFixed(2);
        out['노드 수'] = tb.querySelectorAll('*').length;
        const sumRe = re => (html.match(re) || []).reduce((a, s) => a + s.length, 0);
        out['그중 inline style(MB)'] = +(sumRe(/style="[^"]*"/g) / 1048576).toFixed(2);
        out['그중 inline 핸들러(MB)'] = +(sumRe(/on[a-z]+="[^"]*"/g) / 1048576).toFixed(2);

        // ── 4) 화면 서명 — 고치기 전/후가 같아야 한다 ──────────────────────────
        //    레벨·상태가 다양하게 섞이도록 앞에서 60행을 고른다. 칸마다 "무엇이 그려졌나"(구조)와
        //    "어떻게 보이나"(computed style)를 둘 다 적는다 — 둘 중 하나만 보면 놓친다.
        const PROPS = ['fontWeight', 'fontSize', 'textAlign', 'color', 'backgroundColor', 'whiteSpace',
            'display', 'verticalAlign', 'paddingLeft', 'position', 'overflow', 'textOverflow',
            'wordBreak', 'cursor', 'marginLeft', 'flexShrink', 'userSelect', 'zIndex'];
        //   ⚠️ 계산된 스타일만 보면 **배치**가 달라진 것을 놓친다(공백 텍스트노드를 지우거나 요소를
        //      묶는 방식을 바꾸면 스타일은 그대로인데 높이·폭이 변할 수 있다) → 크기도 같이 적는다.
        //      클래스 이름은 일부러 **비교에서 뺀다** — inline style 을 클래스로 옮기는 게 이번 작업의
        //      목적이라 이름은 당연히 바뀐다. 중요한 건 "그래서 어떻게 보이나"다.
        const sigOf = el => {
            const cs = getComputedStyle(el);
            return el.tagName + '{' + PROPS.map(p => cs[p]).join('|') + '}'
                + Math.round(el.offsetWidth) + 'x' + Math.round(el.offsetHeight);
        };
        const trs = [...tb.querySelectorAll('tr:not([data-lazy])')].slice(0, 60);
        out.sig = trs.map(tr => ({
            lv: (G()[tr.dataset.rowIndex] || {})._level,
            tr: sigOf(tr),
            cells: [...tr.cells].map(td => ({
                s: sigOf(td),
                txt: (td.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
                kids: [...td.querySelectorAll('*')].map(sigOf)
            }))
        }));
        out.sigRows = out.sig.length;

        // 기준(고치기 전) 서명은 localStorage 에 둔다 — 새로고침을 넘어 살아남아야 비교가 된다.
        //   없으면 저장하고 "기준 저장", 있으면 **달라진 곳만** 보고한다.
        const KEY = '__ganttPerfSigBase';
        const nowSig = JSON.stringify(out.sig);
        const base = localStorage.getItem(KEY);
        if (!base) {
            localStorage.setItem(KEY, nowSig);
            out.서명 = '기준 저장됨(이제 코드를 고치고 다시 돌리면 달라진 곳만 알려준다)';
        } else if (base === nowSig) {
            out.서명 = '✅ 기준과 완전히 같다 — 모양이 하나도 안 바뀌었다';
            out.서명차이 = 0;
        } else {
            const b = JSON.parse(base), diffs = [];
            for (let r = 0; r < Math.max(b.length, out.sig.length) && diffs.length < 25; r++) {
                const x = b[r], y = out.sig[r];
                if (!x || !y) { diffs.push('행 ' + r + ': 한쪽에만 있음'); continue; }
                if (x.tr !== y.tr) diffs.push('행 ' + r + ' <tr>: ' + x.tr + '  →  ' + y.tr);
                for (let c = 0; c < Math.max(x.cells.length, y.cells.length) && diffs.length < 25; c++) {
                    const cx = x.cells[c], cy = y.cells[c];
                    if (!cx || !cy) { diffs.push('행 ' + r + ' 칸 ' + c + ': 칸 수가 다름'); continue; }
                    if (cx.s !== cy.s) diffs.push('행 ' + r + ' 칸 ' + c + ' 스타일: ' + cx.s + '  →  ' + cy.s);
                    if (cx.txt !== cy.txt) diffs.push('행 ' + r + ' 칸 ' + c + ' 글자: "' + cx.txt + '"  →  "' + cy.txt + '"');
                    if (cx.kids.join('¦') !== cy.kids.join('¦')) {
                        for (let k = 0; k < Math.max(cx.kids.length, cy.kids.length) && diffs.length < 25; k++) {
                            if (cx.kids[k] !== cy.kids[k]) diffs.push('행 ' + r + ' 칸 ' + c + ' 자식 ' + k + ': ' + (cx.kids[k] || '(없음)') + '  →  ' + (cy.kids[k] || '(없음)'));
                        }
                    }
                }
            }
            out.서명 = '⚠️ 기준과 다르다 — 아래 목록 확인';
            out.서명차이 = diffs.length;
            out.서명차이목록 = diffs;
        }
    } catch (e) {
        out.오류 = e && e.message;
        console.error(e);
    }

    window.saveToGoogleDrive = realSave;
    out['차단된 쓰기'] = window.__perfKill.blocked.length;
    window.__perfResult = out;                  // ⚠️ 45초 넘게 걸리므로 결과를 여기 남긴다(나중에 읽기)
    const { sig, ...nums } = out;
    console.table(nums);
    if (out.서명차이목록) console.warn('서명 차이:', out.서명차이목록);
    console.log('%c⚡ 렌더 속도 하네스 끝 — window.__perfResult 에 결과가 있다', 'font-weight:bold;color:#1971c2');
    return out;
})();
