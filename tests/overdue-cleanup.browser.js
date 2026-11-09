/* ============================================================================
   🧹 밀린 업무 정리 (js/65) — 진짜 앱에서 돌리는 하네스 (2026-11-09)
   앱을 열고 콘솔에 붙여넣는다. 프로젝트가 안 열려 있어도 된다 — globalData 를 잠시 바꿔 넣고 되돌린다.

   ⚠️ 저장은 한 번도 하지 않는다(`saveToGoogleDrive` 킬스위치).
   ⚠️ 다른 프로젝트 훑기는 **끈다**(`dailyScanMyProjects` 를 가짜로) — 진짜 NAS 데이터가 섞이면
      숫자가 흔들린다(2026-11-09 에 js/62 하네스가 바로 그걸로 가짜 실패를 냈다).
   ============================================================================ */
(async function () {
    'use strict';
    var pass = 0, fail = 0, out = [];
    function ok(n, c, d) { if (c) { pass++; out.push('  OK   ' + n); } else { fail++; out.push('  FAIL ' + n + (d !== undefined ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 220) : '')); } }
    if (typeof window.openOverdueCleanup !== 'function') { console.error('js/65 미로드'); return; }

    var keep = {
        gd: window.globalData, ci: window.colIdx, logs: window.changeLogs, sel: window._selectedRows,
        file: window.currentDriveFileName, save: window.saveToGoogleDrive,
        apply: window.applyFilters, patch: window._patchStatusRowDom, paint: window.paintRowSelection,
        toast: window.showToast, scan: window.dailyScanMyProjects, st: window._ovcState
    };
    window.saveToGoogleDrive = function () { console.warn('[harness] 저장 차단'); };
    window.applyFilters = function () {};
    window._patchStatusRowDom = function () {};
    window.paintRowSelection = function () {};
    var toasts = [];
    window.showToast = function (m) { toasts.push(String(m || '')); };

    var D = function (n) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.getTime(); };
    function row(level, name, status, endDays, content) {
        var r = ['', '', '', '', '', status, content || ''];
        r._level = level;
        r[['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][level]] = name;
        if (endDays !== null && endDays !== undefined) r._calcPlanTs = D(endDays);
        return r;
    }
    var MAIL = '[요청/문의]\n[핵심내용]단가 회신 요청\n[출처]x';

    try {
        // 다른 프로젝트는 가짜 하나로 — 읽기 전용 쪽을 보려는 것이다.
        window.dailyScanMyProjects = function (tag, collect, onStep) {
            if (onStep) onStep({ done: 1, total: 1, kept: 1 });
            var rows = [['h'], row(1, '남의 밀린 업무', '진행', -5)];
            return Promise.resolve({ results: [collect({ rows: rows, ci: { status: 5, content: 6, plan: 3 }, project: 'OTHER_PROJ' })],
                                     total: 1, kept: 1, errs: [], entries: [] });
        };
        window.colIdx = { no: 0, wbs: 1, start: 2, plan: 3, period: 4, status: 5, content: 6, answer: -1 };
        window.changeLogs = [];
        window.currentDriveFileName = 'MY_PROJ.json';
        // ⚠️ **리프만 센다**(앱 전체가 그 규칙이다 — 부모는 하위의 합이라 따로 닫지 않는다).
        //    그래서 '부모' 행은 목록에 안 나온다. 처음 픽스처는 부모를 세리라 기대해서 틀렸다.
        window.globalData = [['No', 'WBS', '시작', '완료', '소요', '상태', '상세'],
            row(1, '부모(리프 아님)', '진행', -30),      // 1 — 부모 → 안 센다
            row(2, '많이 밀린 하위', '진행', -30),        // 2 — 밀림(30일)
            row(1, '조금 밀린 업무', '진행', -3),        // 3 — 밀림(3일)
            row(1, '밀린 메일 건', '진행', -20, MAIL),   // 4 — 메일 행 → 안 센다
            row(1, '끝난 업무', '완료', -40),            // 5 — 완료 → 안 센다
            row(1, '아직 안 밀림', '진행', 5)];          // 6 — 미래 → 안 센다

        // ⚠️ `window._ovcState` 에 새 객체를 넣는 것으로는 안 된다 — 모듈이 제 참조를 들고 있어서
        //    앞서 읽어 둔 **진짜 NAS 결과**가 그대로 남는다(처음에 그걸로 가짜 실패 4건이 났다).
        window._ovcReset();
        window.openOverdueCleanup();
        await new Promise(function (r) { setTimeout(r, 600); });

        var body = document.getElementById('ovc-body');
        var txt = body.innerText;
        ok('밀린 업무만 모은다(완료·미래 제외)', !/끝난 업무/.test(txt) && !/아직 안 밀림/.test(txt), txt.slice(0, 300));
        // ⚠️ 이게 이 화면의 핵심 전제다 — 메일 행을 세면 276이 1,505가 되고 아무도 안 본다.
        ok('메일에서 들어온 행은 안 센다', !/밀린 메일 건/.test(txt), txt.slice(0, 300));
        ok('부모(리프 아님)는 안 센다 — 하위가 제 몫을 진다',
           !/부모\(리프 아님\)/.test(txt) && /많이 밀린 하위/.test(txt), txt.slice(0, 300));
        ok('많이 밀린 것이 위로', txt.indexOf('많이 밀린 하위') < txt.indexOf('조금 밀린 업무'), txt.slice(0, 200));
        ok('밀린 일수를 적는다', /30일|30d/.test(txt), txt.slice(0, 200));

        // ⚠️ 다른 프로젝트는 **고칠 수 없다** — 체크박스를 주면 안 된다(열어 둔 앱이 되돌린다).
        ok('다른 프로젝트 업무도 보여는 준다', /남의 밀린 업무/.test(txt), txt.slice(0, 400));
        var chks = body.querySelectorAll('.ovc-chk');
        ok('체크박스는 열린 프로젝트 행에만', chks.length === 2, chks.length + ' (열린 쪽 2행이어야 한다)');
        ok('왜 못 고치는지 적어 준다', /열어야 고칠 수 있습니다|open it to edit/.test(txt), txt.slice(-300));

        // ── 아무것도 안 고르면 ─────────────────────────────────────────────
        toasts = [];
        window.ovcCompleteChecked();
        ok('안 고르면 고르라고 말한다', toasts.some(function (m) { return /골라|Pick/.test(m); }), toasts);

        // ── 골라서 완료 ────────────────────────────────────────────────────
        var undo0 = (window._undoStack || []).length;
        toasts = []; window.changeLogs = [];
        [].forEach.call(body.querySelectorAll('.ovc-chk'), function (c) { if (c.dataset.idx === '2') c.checked = true; });
        window.ovcCompleteChecked();
        await new Promise(function (r) { setTimeout(r, 300); });
        ok('고른 행이 완료된다', window.globalData[2][5] === '완료', window.globalData[2][5]);
        ok('안 고른 행은 그대로', window.globalData[3][5] === '진행', window.globalData[3][5]);
        // ⚠️ 한 번에 여러 행이 바뀐다 — 잘못 눌렀을 때 Ctrl+Z 로 돌아올 수 있어야 한다.
        ok('바꾸기 전에 되돌리기 지점을 찍는다', (window._undoStack || []).length > undo0,
           undo0 + ' → ' + (window._undoStack || []).length);
        ok('기록은 한 줄로 요약', (window.changeLogs || []).length === 1, (window.changeLogs || []).length);
        ok('정리한 뒤 목록에서 사라진다', !/많이 밀린 하위/.test(document.getElementById('ovc-body').innerText),
           document.getElementById('ovc-body').innerText.slice(0, 200));
    } catch (e) {
        ok('하네스가 끝까지 돌았다', false, String(e && e.message || e));
    } finally {
        var m = document.getElementById('overdue-cleanup-modal'); if (m) m.style.display = 'none';
        window.globalData = keep.gd; window.colIdx = keep.ci; window.changeLogs = keep.logs;
        window._selectedRows = keep.sel || new Set();
        window.currentDriveFileName = keep.file; window.saveToGoogleDrive = keep.save;
        window.applyFilters = keep.apply; window._patchStatusRowDom = keep.patch;
        window.paintRowSelection = keep.paint; window.showToast = keep.toast;
        window.dailyScanMyProjects = keep.scan;
        window._ovcState = { open: null, others: [], busy: false, done: 0, total: 0, errs: [], loaded: false };
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    return { pass: pass, fail: fail };
})();
