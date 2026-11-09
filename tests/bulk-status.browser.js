/* ============================================================================
   ✅ 선택한 행 일괄 완료 (js/04j `setSelectedRowsStatus` + js/04i 행 메뉴) — 2026-11-09
   앱을 열고 콘솔에 붙여넣는다. 프로젝트가 안 열려 있어도 된다 — globalData 를 잠시 바꿔 넣고 되돌린다.

   ⚠️ 저장은 한 번도 하지 않는다(`saveToGoogleDrive` 킬스위치). 끝나면 전부 원상복구.
   ⚠️ 가짜는 **바깥 경계에만** — 화면 갱신(applyFilters/_patchStatusRowDom)과 저장뿐이고,
      상태 전파·하위 포함·기록·되돌리기 판단은 진짜 코드가 한다.
   ============================================================================ */
(async function () {
    'use strict';
    var pass = 0, fail = 0, out = [];
    function ok(n, c, d) { if (c) { pass++; out.push('  OK   ' + n); } else { fail++; out.push('  FAIL ' + n + (d !== undefined ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 220) : '')); } }
    if (typeof window.setSelectedRowsStatus !== 'function') { console.error('js/04j 미로드(또는 구버전)'); return; }

    var keep = {
        gd: window.globalData, ci: window.colIdx, logs: window.changeLogs,
        sel: window._selectedRows, save: window.saveToGoogleDrive,
        apply: window.applyFilters, patch: window._patchStatusRowDom,
        paint: window.paintRowSelection, toast: window.showToast, recalc: window.recalculateSchedules,
        undo: window._undoStack ? window._undoStack.slice() : null
    };
    // 🔒 저장·화면 갱신은 막는다(프로젝트가 안 열려 있어도 돌아야 한다)
    window.saveToGoogleDrive = function () { console.warn('[harness] 저장 차단'); };
    window.applyFilters = function () {};
    window._patchStatusRowDom = function () {};
    window.paintRowSelection = function () {};
    var toasts = [];
    window.showToast = function (m) { toasts.push(String(m || '')); };

    function row(level, name, status) {
        var r = ['', '', '', '', '', status];           // no, wbs, start, plan, dur, status
        r._level = level;
        r[['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][level]] = name;
        return r;
    }

    try {
        window.colIdx = { no: 0, wbs: 1, start: 2, plan: 3, period: 4, status: 5, content: -1, answer: -1 };
        window.changeLogs = [];
        // 1=부모, 2·3=그 하위, 4=남, 5=이미 완료
        window.globalData = [['No', 'WBS', '시작', '완료', '소요', '상태'],
            row(1, '부모 업무', '진행'),
            row(2, '하위 A', '진행'),
            row(2, '하위 B', '대기'),
            row(1, '남의 업무', '진행'),
            row(1, '이미 완료', '완료')];

        // ── 선택이 없으면 아무 일도 안 한다 ────────────────────────────────
        window._selectedRows = new Set();
        ok('선택이 없으면 아무 일도 안 한다', window.setSelectedRowsStatus('완료') === false);

        // ── 부모를 고르면 **하위까지** 같이 닫힌다 ─────────────────────────
        window._selectedRows = new Set([1]);
        var r1 = window.setSelectedRowsStatus('완료');
        ok('부모를 고르면 하위까지 완료된다', r1 === true &&
           window.globalData[1][5] === '완료' && window.globalData[2][5] === '완료' && window.globalData[3][5] === '완료',
           [1, 2, 3].map(function (i) { return window.globalData[i][5]; }).join(','));
        // ⚠️ 고르지 않은 행은 **건드리면 안 된다** — 일괄 작업에서 가장 위험한 실수다.
        ok('고르지 않은 행은 그대로', window.globalData[4][5] === '진행', window.globalData[4][5]);

        // ── 기록은 **한 줄 요약** (행마다 적으면 수정이력이 이걸로 덮인다) ──
        ok('기록은 한 줄로 요약된다', (window.changeLogs || []).length === 1, (window.changeLogs || []).length);
        var lg = (window.changeLogs || [])[0] || {};
        ok('요약에 몇 행이 바뀌었는지 적힌다', /3/.test(JSON.stringify(lg)), JSON.stringify(lg).slice(0, 160));
        ok('토스트가 건수와 되돌리기를 말한다', toasts.some(function (m) { return /3/.test(m) && /Ctrl\+Z/.test(m); }), toasts);

        // ── 이미 그 상태면 안 바꾼다(기록도 안 남긴다) ─────────────────────
        window.changeLogs = []; toasts = [];
        window._selectedRows = new Set([5]);
        ok('이미 완료면 아무 일도 안 한다', window.setSelectedRowsStatus('완료') === false &&
           (window.changeLogs || []).length === 0, (window.changeLogs || []).length);
        ok('그럴 땐 그렇다고 말한다', toasts.some(function (m) { return /이미|Already/.test(m); }), toasts);

        // ── 여러 행을 한 번에 ──────────────────────────────────────────────
        window.globalData[1][5] = '진행'; window.globalData[2][5] = '진행';
        window.globalData[3][5] = '진행'; window.globalData[4][5] = '진행';
        window.changeLogs = []; toasts = [];
        window._selectedRows = new Set([1, 4]);
        window.setSelectedRowsStatus('완료');
        ok('여러 행 + 각자의 하위까지', [1, 2, 3, 4].every(function (i) { return window.globalData[i][5] === '완료'; }),
           [1, 2, 3, 4].map(function (i) { return window.globalData[i][5]; }).join(','));

        // ── 상태 칸이 없는 프로젝트에선 정직하게 멈춘다 ────────────────────
        window.colIdx = { no: 0, wbs: 1, status: -1 };
        window.changeLogs = []; toasts = [];
        window._selectedRows = new Set([1]);
        ok('상태 칸이 없으면 안 하고 말해 준다', window.setSelectedRowsStatus('완료') === false &&
           toasts.some(function (m) { return /상태 칸|status column/.test(m); }), toasts);
        // ⚠️⚠️ 바로 되돌려 놓는다 — 안 돌려놓으면 **뒤 시험이 전부 가짜 실패**한다
        //    (`status: -1` 이라 무엇도 안 바뀜다). 실제로 되돌리기 시험이 그걸로 한 번 틀렸다
        //    — 하네스 안에서 전역 상태를 만졌으면 **그 자리에서** 되돌려뇐야 한다.
        window.colIdx = { no: 0, wbs: 1, start: 2, plan: 3, period: 4, status: 5, content: -1, answer: -1 };

        // ── ↩ 되돌리기는 **한 번에 하나씩** 풀려야 한다 ─────────────
        // ⚠️⚠️ 이 앱의 undo 스택은 "각 작업이 **끝난** 상태" 를 쌓는다(js/04e).
        //    바꾸기 **전**에 찍으면 스택 맨 위가 화면과 어긋나, **다음 작업을 되돌릴 때
        //    이 일괄 변경까지 같이 풀린다** — 처음에 그렇게 짠고 규약을 읽고 고쳤다.
        (function () {
            var ks = { recalc: window.recalculateSchedules };
            window.recalculateSchedules = function () {};
            // ⚠️ `_isRestoringUndo` 가 켜져 있으면 `pushUndoSnapshot` 은 **조용히 아무것도
            //    안 한다**(js/04e 첫 줄). 앞서 콘솔에서 undo 를 눌렀거나 30ms 타이머가 아직
            //    안 돌았으면 여기가 **가짜 실패**한다(실제로 한 번 그러겠다).
            window._isRestoringUndo = false;
            window._undoStack = []; window._redoStack = [];
            window.globalData[1][5] = '진행'; window.globalData[2][5] = '진행';
            window.globalData[3][5] = '진행'; window.globalData[4][5] = '진행';
            window.pushUndoSnapshot();                       // 직전 작업이 끝난 상태
            window._selectedRows = new Set([4]);
            window.setSelectedRowsStatus('완료');              // ① 일괄
            window._selectedRows = new Set();
            window.applyStatusToChildren(3, 5, '대기'); window.pushUndoSnapshot();   // ② 다음 작업
            window.undoLastAction();
            var u1 = [3, 4].map(function (i) { return window.globalData[i][5]; }).join(',');
            window.undoLastAction();
            var u2 = [3, 4].map(function (i) { return window.globalData[i][5]; }).join(',');
            ok('되돌리기 한 번은 **다음 작업만** 풀린다', u1 === '진행,완료', u1);
            ok('한 번 더 눌러야 일괄 변경이 풀린다', u2 === '진행,진행', u2);
            window.recalculateSchedules = ks.recalc;
            window._isRestoringUndo = false;
        })();

        // ── 행 메뉴에 버튼이 있고, 되돌리기 지점을 먼저 찍는다 ─────────────
        var html = (document.getElementById('row-action-popup') || {}).innerHTML || '';
        ok('행 메뉴에 ✅ 버튼이 있다(열어 본 적 있으면)', !html || /rap-done/.test(html),
           html ? html.slice(0, 120) : '(아직 안 열림 — 건너뜀)');
        ok('되돌리기 지점을 찍는 함수가 있다', typeof window.pushUndoSnapshot === 'function');
    } catch (e) {
        ok('하네스가 끝까지 돌았다', false, String(e && e.message || e));
    } finally {
        window.globalData = keep.gd; window.colIdx = keep.ci; window.changeLogs = keep.logs;
        window._selectedRows = keep.sel || new Set();
        window.saveToGoogleDrive = keep.save; window.applyFilters = keep.apply;
        window._patchStatusRowDom = keep.patch; window.paintRowSelection = keep.paint;
        window.showToast = keep.toast;
        if (keep.undo) window._undoStack = keep.undo;
        if (keep.recalc) window.recalculateSchedules = keep.recalc;
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    return { pass: pass, fail: fail };
})();
