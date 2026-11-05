/* 🎨 Gantt 표 한 행의 "보이는 모습" 못박기 — 브라우저 콘솔 하네스 (2026-11-05)
 *
 * 돌리는 법: 행이 있는 프로젝트를 열고 Gantt 탭에서 통째로 붙여넣기. 아무것도 안 바꾼다(읽기 전용).
 *
 * 왜 — 2026-11-05 렌더 경량화로 **행마다 붙던 inline style 3.0MB 를 styles.css 클래스로 옮겼다**.
 *   inline style 은 클래스 규칙을 항상 이기므로, 떼어내면 `.sub-parent-row td`(styles.css 402~405행)
 *   처럼 같은 속성을 건드리는 기존 규칙에 자리를 내줄 수 있다 — **오류 없이 모습만 달라진다.**
 *   그래서 "옮긴 선언이 계산값으로 그대로 살아 있는가"를 칸마다 직접 확인한다.
 *
 * ⚠️ 특히 까다로운 두 가지를 일부러 못박는다:
 *   ① 레벨1 행의 날짜 칸은 **굵다** — inline 은 normal 이라고 적고 있었지만 `.sub-parent-row td` 의
 *      `font-weight: bold !important` 가 이기고 있었다(즉 inline 이 아무 일도 안 했다). 그걸 모르고
 *      CSS 에 normal 을 적으면 거꾸로 **모습이 바뀐다**.
 *   ② 같은 행의 **상태 드롭다운은 안 굵다** — td 에 걸린 !important 는 자식 select 엔 안 닿아서
 *      inline 이 살아 있던 자리다. 그래서 .status-select 에 font-weight 를 명시해야 한다.
 */
(function () {
    const R = [];
    const ok = (n, c, info) => R.push({ t: n, pass: !!c, info: info === undefined ? '' : String(info) });
    const G = () => window.globalData;
    if (!G() || G().length < 3) { console.error('❌ 프로젝트를 먼저 열어주세요.'); return; }

    // 레벨이 섞이도록 전부 펼친 뒤 확인한다(접힘 상태는 저장 대상이 아니다 — js/04c _serializeGD)
    const snap = G().map((r, i) => (i > 0 && r) ? !!r._wbsCollapsed : false);
    G().forEach((r, i) => { if (i > 0 && r) r._wbsCollapsed = false; });
    window.renderTable(G()); window.applyFilters();

    const cs = el => getComputedStyle(el);
    const px = v => Math.round(parseFloat(v) || 0);
    // 한 요소의 계산값이 기대와 같은지 — 없는 요소는 "건너뜀"으로 남긴다(프로젝트마다 없는 칸이 있다)
    function check(label, sel, want, root) {
        const el = (root || document).querySelector(sel);
        if (!el) { ok(label + ' (요소 없음 — 건너뜀)', true, sel); return null; }
        const c = cs(el);
        const bad = [];
        for (const k in want) {
            const got = String(c[k]);
            const exp = want[k];
            const hit = (exp instanceof RegExp) ? exp.test(got) : (got === exp);
            if (!hit) bad.push(k + ': ' + got + ' (기대 ' + exp + ')');
        }
        ok(label, bad.length === 0, bad.join(' · '));
        return el;
    }

    try {
        const tb = document.getElementById('table-body');
        const vis = [...tb.querySelectorAll('tr:not([data-lazy])')].filter(t => t.offsetHeight > 0);
        ok('행이 그려져 있다', vis.length > 5, vis.length + '행');

        // ── No. 칸 ─────────────────────────────────────────────────────────
        check('No. 칸 안쪽 묶음(.no-td-inner)', '#table-body .no-td .no-td-inner', {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            columnGap: '3px', position: 'relative', paddingLeft: '7px'
        });
        check('드래그 손잡이(.row-drag-handle)', '#table-body .no-td .row-drag-handle', {
            fontSize: '11px', color: 'rgb(170, 170, 170)', flexShrink: '0', userSelect: 'none'
        });

        // ── 개발업무(WBS) 칸 안쪽 ───────────────────────────────────────────
        check('접기 화살표(.wbs-toggle-arrow)', '#table-body .wbs-toggle-arrow', {
            display: 'inline-block', width: '11px', textAlign: 'center',
            color: 'rgb(170, 170, 170)', fontSize: '9px', verticalAlign: 'middle', userSelect: 'none'
        });
        check('화살표 자리(.wbs-arrow-gap)', '#table-body .wbs-arrow-gap', { display: 'inline-block', width: '11px' });
        check('화살표 클릭존(.wbs-toggle-zone)', '#table-body .wbs-toggle-zone', {
            display: 'inline-block', cursor: 'pointer', padding: '2px 6px 2px 0px', verticalAlign: 'middle'
        });
        check('레벨 숫자(.wbs-lv-num)', '#table-body .wbs-lv-num', {
            fontSize: '9px', color: 'rgb(153, 153, 153)', marginRight: '1px'
        });
        check('담당구분 배지(.wbs-discipline-badge)', '#table-body .wbs-discipline-badge', {
            display: 'inline-block', fontSize: '9px', color: 'rgb(134, 142, 150)',
            backgroundColor: 'rgb(241, 243, 245)', borderRadius: '3px',
            marginLeft: '4px', cursor: 'pointer', whiteSpace: 'nowrap'
        });
        check('가지 전체 화살표(.wbs-branch-arrow)', '#table-body .wbs-branch-arrow', {
            position: 'absolute', right: '3px', color: 'rgb(170, 170, 170)', fontSize: '9px', userSelect: 'none'
        });
        check('하위 개수 배지(.wbs-hidden-count)', '#table-body .wbs-hidden-count', {
            position: 'absolute', right: '15px', color: 'rgb(25, 113, 194)', fontSize: '9px', fontWeight: '700'
        });

        // ── 칸(td) ─────────────────────────────────────────────────────────
        check('업무명 칸(td.wbs-cell)', '#table-body td.wbs-cell', {
            textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        });
        // 들여쓰기: 레벨 L → calc(L*1.2em + 5px). em 은 그 칸의 글자 크기다.
        for (let L = 0; L <= 4; L++) {
            const td = tb.querySelector('td.wbs-cell.wbs-lv' + L);
            if (!td) { ok('레벨' + L + ' 들여쓰기 (그 레벨 행 없음 — 건너뜀)', true); continue; }
            const fs = parseFloat(cs(td).fontSize);
            const want = Math.round(L * 1.2 * fs + 5);
            const got = px(cs(td).paddingLeft);
            ok('레벨' + L + ' 들여쓰기 = ' + want + 'px', Math.abs(got - want) <= 1, got + 'px');
        }
        check('자식 있는 업무명 칸(.wbs-has-kids)', '#table-body td.wbs-cell.wbs-has-kids', {
            position: 'relative', paddingRight: '30px'
        });
        check('날짜 칸(td.date-td)', '#table-body td.date-td', { textAlign: 'center', whiteSpace: 'nowrap' });
        check('소요일 칸(td.period-td)', '#table-body td.period-td', {
            textAlign: 'center', color: 'rgb(224, 49, 49)', whiteSpace: 'nowrap'
        });
        check('상태 칸(td.status-td)', '#table-body td.status-td', { textAlign: 'center', whiteSpace: 'nowrap' });
        check('상태 드롭다운(.status-select)', '#table-body .status-select', {
            borderTopWidth: '0px', backgroundColor: 'rgba(0, 0, 0, 0)', whiteSpace: 'nowrap',
            appearance: 'none'
        });
        // ⚠️ 여기엔 일부러 fontSize 를 적지 않는다 — 예전 inline 에 `font-size: 11px` 이 있었지만
        //    styles.css 1683행 `td.detail-td { font-size: var(--detail-font-size) !important }` 가
        //    **inline 을도 이기고 있었다**(실측 9px). 그 11px 은 원래부터 아무 일도 안 하던
        //    죽은 선언이다 — "적혀 있니 기대값"으로 삼았다가 이 하네스가 젠으로 한 번 울었다.
        check('상세내용 칸(td.detail-td-base)', '#table-body td.detail-td-base', {
            textAlign: 'left', verticalAlign: 'top', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
        });
        {
            const td = document.querySelector('#table-body td.detail-td-base');
            if (td) {
                const want = getComputedStyle(document.documentElement).getPropertyValue('--detail-font-size');
                const probe = document.createElement('div');
                probe.style.cssText = 'position:absolute;visibility:hidden;font-size:' + want;
                document.body.appendChild(probe);
                const wantPx = getComputedStyle(probe).fontSize; probe.remove();
                ok('상세내용 글자 크기 = --detail-font-size',
                    getComputedStyle(td).fontSize === wantPx, getComputedStyle(td).fontSize + ' / ' + wantPx);
            }
        }
        check('그 외 칸(td.gantt-plain-td)', '#table-body td.gantt-plain-td', {
            textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        });
        check('차트 칸(td.chart-td)', '#table-body td.chart-td', { position: 'relative' });

        // 날짜 칸 글자 크기는 표 글자 크기 - 2px
        {
            const td = tb.querySelector('#table-body td.date-td');
            if (td) {
                const tableFs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--table-font-size')) || 0;
                const got = parseFloat(cs(td).fontSize);
                ok('날짜 칸 글자 = 표 글자 - 2px', !tableFs || Math.abs(got - (tableFs - 2)) < 0.6, got + ' / 표 ' + tableFs);
            }
        }

        // ── ⚠️ 굵기 — 가장 틀리기 쉬운 자리 ────────────────────────────────
        {
            const p = tb.querySelector('tr.parent-row:not([data-lazy])');
            const s1 = tb.querySelector('tr.sub-parent-row:not([data-lazy])');
            const s2 = tb.querySelector('tr.sub-parent-row-2:not([data-lazy])');
            if (p) {
                const td = p.querySelector('td.date-td');
                if (td) ok('레벨0 날짜 칸은 굵다', cs(td).fontWeight === '700', cs(td).fontWeight);
                const sel = p.querySelector('.status-select');
                if (sel) ok('레벨0 상태 드롭다운도 굵다', cs(sel).fontWeight === '700', cs(sel).fontWeight);
            }
            if (s1) {
                const td = s1.querySelector('td.date-td');
                // ① inline 이 normal 이라 적어도 .sub-parent-row td 의 !important 가 이겨 **굵었다**
                if (td) ok('레벨1 날짜 칸도 굵다(원래 그랬다)', cs(td).fontWeight === '700', cs(td).fontWeight);
                const sel = s1.querySelector('.status-select');
                // ② 그런데 그 안의 드롭다운은 **안 굵다** — td 의 !important 는 자식에 안 닿는다
                if (sel) ok('레벨1 상태 드롭다운은 안 굵다', cs(sel).fontWeight === '400', cs(sel).fontWeight);
            }
            if (s2) {
                const td = s2.querySelector('td.date-td');
                if (td) ok('레벨2 날짜 칸은 안 굵다', cs(td).fontWeight === '400', cs(td).fontWeight);
            }
        }

        // ── style="" 빈 껍데기가 안 남았는지 ───────────────────────────────
        {
            const empties = tb.querySelectorAll('td[style=""]').length;
            ok('빈 style="" 속성이 안 남았다', empties === 0, empties + '개');
            const dup = [...tb.querySelectorAll('tr:not([data-lazy])')].slice(0, 50)
                .filter(tr => /class="[^"]*"[^>]* class="/.test(tr.innerHTML)).length;
            ok('class 속성이 두 번 붙은 칸이 없다', dup === 0, dup + '행');
        }
    } catch (e) {
        ok('예외 없이 끝남', false, e && e.message);
        console.error(e);
    }

    // 접힘 상태 원복
    G().forEach((r, i) => { if (i > 0 && r) { if (snap[i]) r._wbsCollapsed = true; else delete r._wbsCollapsed; } });
    window.renderTable(G()); window.applyFilters();

    const pass = R.filter(r => r.pass).length;
    console.table(R);
    console.log('%c🎨 행 스타일 하네스: ' + pass + '/' + R.length,
        'font-weight:bold;color:' + (pass === R.length ? '#2f9e44' : '#e03131'));
    window.__rowStyleFails = R.filter(r => !r.pass);
    return pass + '/' + R.length;
})();
