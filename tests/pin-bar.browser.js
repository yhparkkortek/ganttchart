/* ▌ 핀셋(알람) 토글 막대 — 브라우저 콘솔 하네스 (2026-11-05)
 *
 * 돌리는 법: 아무 프로젝트나 연 뒤 Gantt chart 탭에서 이 파일을 통째로 콘솔에 붙여넣기.
 *
 * ⚠️ 저장은 **킬스위치로 막고** 돌린다(saveToGoogleDrive 를 no-op 으로 바꿨다가 끝나면 되돌림).
 *    그래도 바꾼 _알림 값은 전부 원래대로 복원하고, 마지막에 changeLogs 도 원래 길이로 자른다.
 *    (앱 자체의 3분 자동저장은 saveToGoogleDrive 를 타므로 킬스위치로 함께 막힌다.)
 *
 * 무엇을 지키는가 — 2026-11-05 실사용 신고 "핀셋 알람 설정이 동작하지 않는다"의 진짜 원인:
 *   _patchPinRowDom(js/04e)이 `noTd.querySelector('span')`으로 **첫 번째** span 을 집었는데,
 *   2026-10-28 에 그 앞에 드래그 손잡이(⠿)가 생기면서 **손잡이**가 켜짐 스타일을 뒤집어쓰고
 *   정작 핀은 영영 꺼진 모습으로 남았다. 데이터와 행 색은 바뀌는데 아이콘만 안 바뀌니
 *   사람 눈엔 "눌러도 아무 일도 안 난다"였다. → 아래 T3/T4 가 그 자리를 박아둔다.
 */
(async function () {
    const R = [];
    const ok = (n, c, info) => R.push({ t: n, pass: !!c, info: info === undefined ? '' : info });
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const G = () => window.globalData;

    if (!G() || G().length < 3) { console.error('❌ 프로젝트를 먼저 열어주세요.'); return; }

    // ── 킬스위치 + 원상복구용 스냅샷 ────────────────────────────────────────
    const realSave = window.saveToGoogleDrive;
    window.saveToGoogleDrive = function () { console.warn('[pin-bar harness] 저장 차단됨'); return Promise.resolve(); };
    const snapAlarm = G().map(r => (r ? !!r._알림 : false));
    const snapLogs = (window.changeLogs || []).length;
    const snapSel = window._selectedRows ? new Set(window._selectedRows) : null;

    const restore = () => {
        G().forEach((r, i) => { if (!r) return; if (snapAlarm[i]) r._알림 = true; else delete r._알림; });
        if (window.changeLogs) window.changeLogs.length = snapLogs;
        if (window._selectedRows) { window._selectedRows.clear(); if (snapSel) snapSel.forEach(v => window._selectedRows.add(v)); }
        window.renderTable(G());
        if (window.applyFilters) window.applyFilters();
        if (window.paintRowSelection) window.paintRowSelection();
        window.saveToGoogleDrive = realSave;
    };

    const visTrs = () => [...document.querySelectorAll('#table-body tr:not([data-lazy])')]
        .filter(t => t.querySelector('.row-pin-bar') && t.getBoundingClientRect().height > 0);
    const barOf = idx => document.querySelector('#table-body tr[data-row-index="' + idx + '"] .row-pin-bar');

    try {
        if (window.switchTab) window.switchTab('gantt');
        await sleep(250);

        const trs = visTrs();
        ok('T0 보이는 업무 행이 있다', trs.length >= 2, trs.length + '행');
        if (trs.length < 2) { restore(); console.table(R); return; }

        const td0 = trs[0].querySelector('.no-td');

        // ── T1 생김새 ───────────────────────────────────────────────────────
        ok('T1-a No. 칸에 📌 아이콘이 없다', !td0.innerHTML.includes('📌'));
        ok('T1-b No. 칸에 .row-pin-bar 가 있다', !!td0.querySelector('.row-pin-bar'));
        {
            const r0 = td0.getBoundingClientRect(), rb = td0.querySelector('.row-pin-bar').getBoundingClientRect();
            ok('T1-c 막대가 칸 맨 왼쪽에 붙어 있다', Math.abs(rb.left - r0.left) < 1.5, (rb.left - r0.left).toFixed(1) + 'px');
            // 막대는 글자 한 줄이 아니라 **칸 높이**를 덮어야 한다(td 는 확정 높이가 없어 flex 안에
            // 넣으면 17px 밖에 안 된다 — 그래서 absolute 로 뒀다. 이 검사가 그 결정을 지킨다).
            ok('T1-d 막대가 칸 높이를 덮는다', rb.height >= r0.height - 3, rb.height.toFixed(1) + ' / ' + r0.height.toFixed(1));
            const dh = td0.querySelector('.row-drag-handle').getBoundingClientRect();
            ok('T1-e 드래그 손잡이와 안 겹친다', dh.left >= rb.right, '손잡이 ' + (dh.left - r0.left).toFixed(1) + 'px, 막대끝 ' + (rb.right - r0.left).toFixed(1) + 'px');
        }
        ok('T1-f 헤더에도 전체 토글 막대가 있다', !!document.querySelector('#myTable thead .row-pin-bar.pin-bar-head'));
        ok('T1-g 헤더에 📌 아이콘이 없다', !/📌/.test((document.querySelector('#myTable thead th.no-th, #myTable thead tr') || {}).innerHTML || ''));

        // ── T2 AI 검색 체크박스(js/26)가 끼어들어도 막대를 안 덮는다 ────────
        {
            const flex = td0.querySelector(':scope > div');
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'gantt-ai-cb';
            cb.style.cssText = 'width:14px;height:14px;flex-shrink:0;';
            flex.insertBefore(cb, flex.firstChild);           // js/26 _updateRowCheckbox 와 같은 삽입
            const r0 = td0.getBoundingClientRect();
            const rb = td0.querySelector('.row-pin-bar').getBoundingClientRect();
            const rc = cb.getBoundingClientRect();
            ok('T2 체크박스가 막대 위로 안 올라온다', rc.left >= rb.right,
                '체크박스 ' + (rc.left - r0.left).toFixed(1) + 'px, 막대끝 ' + (rb.right - r0.left).toFixed(1) + 'px');
            cb.remove();
        }

        // ── T3 클릭 = 알람 토글 + 막대가 즉시 바뀐다 (실사용 버그 지점) ─────
        {
            const idx = trs[0].dataset.rowIndex;
            const was = !!G()[idx]._알림;
            barOf(idx).click(); await sleep(420);
            const b = barOf(idx);
            ok('T3-a 클릭하면 _알림 이 뒤집힌다', !!G()[idx]._알림 === !was);
            ok('T3-b 막대에 on 클래스가 따라붙는다', b.classList.contains('on') === !was, b.className);
            ok('T3-c 켜진 막대는 투명/흰색이 아니다', !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(b).backgroundColor), getComputedStyle(b).backgroundColor);
            ok('T3-d 행에 alarm-on 클래스가 붙는다', b.closest('tr').classList.contains('alarm-on') === !was);
            ok('T3-e 말풍선 문구도 상태를 따라간다', b.title === window._pinBarTitle(!was), b.title.slice(0, 18));
            // T4 — 손잡이가 핀 스타일을 뒤집어쓰면 안 된다(2026-11-05 버그 재발 방지)
            const dh = b.closest('.no-td').querySelector('.row-drag-handle');
            ok('T4 드래그 손잡이가 알람 스타일을 안 먹는다',
                !/hue-rotate/.test(dh.getAttribute('style') || '') && !/알람|Alarm/.test(dh.getAttribute('title') || ''),
                (dh.getAttribute('title') || '').slice(0, 20));
            barOf(idx).click(); await sleep(420);
            ok('T3-f 다시 누르면 원래대로', !!G()[idx]._알림 === was);
        }

        // ── T5 서로 다른 두 행을 빠르게 눌러도 둘 다 토글된다 ───────────────
        //    (예전엔 250ms 더블클릭 타이머가 행을 안 가려 둘 다 조용히 사라졌다)
        {
            const a = trs[0].dataset.rowIndex, b = trs[1].dataset.rowIndex;
            const wasA = !!G()[a]._알림, wasB = !!G()[b]._알림;
            barOf(a).click(); await sleep(60); barOf(b).click();
            await sleep(450);
            ok('T5 다른 두 행 연속 클릭 — 둘 다 토글', !!G()[a]._알림 === !wasA && !!G()[b]._알림 === !wasB,
                'A ' + wasA + '→' + !!G()[a]._알림 + ', B ' + wasB + '→' + !!G()[b]._알림);
            if (!!G()[a]._알림 !== wasA) { barOf(a).click(); await sleep(400); }
            if (!!G()[b]._알림 !== wasB) { barOf(b).click(); await sleep(400); }
        }

        // ── T6 더블클릭 = 알람 목록으로 이동(토글하지 않는다) ───────────────
        {
            const idx = trs[0].dataset.rowIndex;
            if (!G()[idx]._알림) { barOf(idx).click(); await sleep(420); }
            const onBefore = !!G()[idx]._알림;
            const b = barOf(idx);
            b.click(); b.click(); b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            await sleep(900);
            ok('T6-a 더블클릭하면 Alarm 탭으로 이동', document.getElementById('tab-alarm').classList.contains('active'));
            ok('T6-b 더블클릭은 알람을 끄지 않는다', !!G()[idx]._알림 === onBefore);
            if (window.switchTab) window.switchTab('gantt');
            await sleep(250);
        }

        // ── T7 헤더 막대 = 전체 토글 ────────────────────────────────────────
        {
            const head = document.querySelector('#myTable thead .pin-bar-head');
            head.click(); await sleep(500);
            const n1 = G().filter(r => r && r._알림).length;
            head.click(); await sleep(500);
            const n2 = G().filter(r => r && r._알림).length;
            const bars = [...document.querySelectorAll('#table-body tr:not([data-lazy]) .row-pin-bar')];
            ok('T7-a 헤더 첫 클릭 = 전체 끄기', n1 === 0, n1 + '건');
            ok('T7-b 헤더 두 번째 클릭 = 전체 켜기', n2 === G().length - 1, n2 + '건');
            ok('T7-c 보이는 막대가 전부 on', bars.length > 0 && bars.every(b => b.classList.contains('on')), bars.length + '개');
        }

        // ── T8 지연 렌더(data-lazy) 행도 같은 막대를 그린다 ─────────────────
        {
            const lazy = document.querySelector('#table-body tr[data-lazy]');
            if (!lazy) { ok('T8 지연 렌더 행 없음 — 건너뜀', true, 'skip'); }
            else {
                window._ganttHydrateRow(lazy);
                const b = lazy.querySelector('.row-pin-bar');
                ok('T8-a 지연 행도 막대를 그린다', !!b);
                ok('T8-b 지연 행에도 📌 아이콘이 없다', !lazy.querySelector('.no-td').innerHTML.includes('📌'));
                ok('T8-c 지연 행 막대 상태가 데이터와 맞는다',
                    !!b && b.classList.contains('on') === !!G()[lazy.dataset.rowIndex]._알림);
            }
        }
    } catch (e) {
        ok('예외 없이 끝남', false, e && e.message);
        console.error(e);
    }

    restore();
    await sleep(300);
    const after = G().filter(r => r && r._알림).length;
    const before = snapAlarm.filter(Boolean).length;
    ok('T9 끝나고 알람 상태가 원래대로', after === before, before + ' → ' + after);
    ok('T9-b 저장은 한 번도 안 일어났다(킬스위치)', window.saveToGoogleDrive === realSave);

    const pass = R.filter(r => r.pass).length;
    console.table(R);
    console.log('%c▌ 핀셋 막대 하네스: ' + pass + '/' + R.length,
        'font-weight:bold;color:' + (pass === R.length ? '#2f9e44' : '#e03131'));
    return pass + '/' + R.length;
})();
