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

    // ⚠️ [2026-11-05 2차] 적중 검사(elementFromPoint)용 행은 **진짜 눌리는 자리**에 있어야 한다 —
    //    처음엔 "보이는 첫 행"을 집었다가 그 행이 **고정 머리글 밑에 깔려 있어서** 뭘 찍어도
    //    sticky 컨테이너가 나왔고, 하마터면 "막대가 아예 안 눌린다"는 **가짜 실패**를 믿을 뻔했다.
    //    → 칸 한가운데를 찍어 그 칸 안의 요소가 나오는 행만 쓴다.
    const hitTestableTr = () => visTrs().find(t => {
        const td = t.querySelector('.no-td'); if (!td) return null;
        const r = td.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) return false;
        const el = document.elementFromPoint(r.left + r.width - 4, r.top + r.height / 2);
        return !!(el && td.contains(el));
    });
    // 그 요소가 **실제 마우스 클릭을 받는 픽셀**이 몇 개인지 — 보이는 넓이가 아니라 '잡히는' 넓이
    const hitPixels = (el, pad) => {
        const r = el.getBoundingClientRect(); pad = pad || 0;
        let n = 0;
        for (let x = -pad; x < r.width + pad; x++)
            for (let y = -pad; y < r.height + pad; y++)
                if (document.elementFromPoint(r.left + x + 0.5, r.top + y + 0.5) === el) n++;
        return n;
    };

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
        }
        ok('T1-f 헤더에도 전체 토글 막대가 있다', !!document.querySelector('#myTable thead .row-pin-bar.pin-bar-head'));
        ok('T1-g 헤더에 📌 아이콘이 없다', !/📌/.test((document.querySelector('#myTable thead th.no-th, #myTable thead tr') || {}).innerHTML || ''));

        // ── T1-h~l 🖱 **진짜로 눌리는가** (2026-11-05 2차 신고 "막대 잡기가 어렵다") ──────────
        //    막대는 보이는데 눌리지 않았다 — 바로 뒤에 오는 flex <div>가(배경이 투명해도 클릭은
        //    그대로 먹는다) 위에 깔려서, 실측 1,260픽셀 중 76픽셀만 막대였고 **사람이 노리는
        //    "보이는 막대의 중앙"은 0%**였다. 눈으로도 콘솔로도 안 보이는 고장이라 아래 검사가
        //    유일한 방어선이다. ⚠️ bar.click()은 적중 검사를 **통과해 버리므로**(합성 클릭은
        //    히트테스트를 건너뛴다) 1차 하네스 27/27이 이걸 못 잡았다.
        {
            const tr = hitTestableTr();
            ok('T1-h 적중 검사용 행을 찾았다(고정 머리글 밑이 아닌)', !!tr, tr ? 'row ' + tr.dataset.rowIndex : '없음');
            if (tr) {
                const td = tr.querySelector('.no-td');
                const bar = td.querySelector('.row-pin-bar');
                const rb = bar.getBoundingClientRect();
                const seen = parseFloat(getComputedStyle(bar).width);   // 보이는 폭(테두리 제외)
                const mid = document.elementFromPoint(rb.left + seen / 2, rb.top + rb.height / 2);
                ok('T1-i 보이는 막대의 한가운데가 실제로 막대에 집힌다', mid === bar,
                    mid ? mid.tagName.toLowerCase() + '.' + (mid.className || '') : 'null');
                ok('T1-j 클릭 영역이 보이는 폭보다 넓다(손가락 여유)', rb.width >= seen + 6,
                    '보임 ' + seen + 'px / 클릭 ' + rb.width.toFixed(0) + 'px');
                ok('T1-k 겉모습은 그대로 가는 막대다', seen <= 8, seen + 'px');
                const dh = td.querySelector('.row-drag-handle');
                const dhR = dh.getBoundingClientRect();
                const dhHit = document.elementFromPoint(dhR.left + dhR.width / 2, dhR.top + dhR.height / 2);
                // 넓힌 클릭 영역이 손잡이를 **잡아먹으면** 안 된다(겹쳐도 손잡이가 이겨야 한다)
                ok('T1-l 드래그 손잡이는 자기 클릭을 지킨다', dhHit === dh || dh.contains(dhHit),
                    dhHit ? dhHit.tagName.toLowerCase() + '.' + (dhHit.className || '') : 'null');
            }
        }
        // ── T1-m 헤더 막대(전체 토글)도 보이는 5×13px보다 넓게 잡힌다 ──────
        {
            const head = document.querySelector('#myTable thead .pin-bar-head');
            const hr = head.getBoundingClientRect();
            const inside = hitPixels(head, 0);
            const around = hitPixels(head, 9);            // ::after 로 덧댄 여유까지
            ok('T1-m 헤더 막대도 보이는 넓이보다 넓게 잡힌다', around >= inside * 2 && around >= 200,
                '보임 ' + (hr.width * hr.height).toFixed(0) + 'px² / 잡힘 ' + around + 'px²');
            const th = head.closest('th');
            const label = [...th.querySelectorAll('span')].find(s => s !== head);
            const lr = label.getBoundingClientRect();
            ok('T1-n 헤더 "No." 글자까지 잡아먹지는 않는다',
                document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2) !== head);
        }

        // ── T2 AI 검색 체크박스(js/26)가 끼어들어도 서로 클릭을 뺏지 않는다 ──
        //    ⚠️ 예전 검사는 "체크박스가 막대 오른쪽에 있다"(좌표 비교)였는데, 이제 막대의 클릭
        //    영역이 투명하게 넓어져 **겹치는 게 정상**이다 — 지켜야 할 건 위치가 아니라 "누가
        //    그 픽셀의 클릭을 받는가"다.
        {
            const tr = hitTestableTr() || trs[0];
            const td = tr.querySelector('.no-td');
            const flex = td.querySelector(':scope > div');
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'gantt-ai-cb';
            cb.style.cssText = 'width:14px;height:14px;flex-shrink:0;';
            flex.insertBefore(cb, flex.firstChild);           // js/26 _updateRowCheckbox 와 같은 삽입
            const bar = td.querySelector('.row-pin-bar');
            const rc = cb.getBoundingClientRect(), rb = bar.getBoundingClientRect();
            const seen = parseFloat(getComputedStyle(bar).width);
            ok('T2-a 체크박스가 자기 클릭을 지킨다',
                document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2) === cb);
            ok('T2-b 체크박스가 생겨도 보이는 막대는 여전히 눌린다',
                document.elementFromPoint(rb.left + seen / 2, rb.top + rb.height / 2) === bar);
            cb.remove();
        }

        // ── T3 클릭 = 알람 토글 + 막대가 즉시 바뀐다 (실사용 버그 지점) ─────
        {
            const idx = trs[0].dataset.rowIndex;
            const was = !!G()[idx]._알림;
            barOf(idx).click();
            // ⚡ [2026-11-05 2차] 데이터 토글은 더블클릭을 가리느라 250ms 뒤인데, 그 동안 화면이
            //    아무 반응도 안 하면 사람은 "안 눌렸다"며 한 번 더 누르고 — 그 두 번째 클릭이
            //    더블클릭으로 잡혀 토글이 취소되고 알람 목록으로 튄다(="눌러도 안 된다").
            await sleep(40);
            ok('T3-g 누르자마자 막대 색이 먼저 바뀐다(데이터는 아직)',
                barOf(idx).classList.contains('on') === !was && !!G()[idx]._알림 === was);
            await sleep(400);
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
            // 첫 클릭에 미리 칠해 둔 색이 더블클릭으로 취소된 뒤에도 남아 있으면 데이터와 어긋난다
            ok('T6-c 더블클릭 뒤 막대 색이 데이터와 다시 맞는다',
                barOf(idx).classList.contains('on') === !!G()[idx]._알림);
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
