/* ============================================================================
   tests/sheet-dirty-flag.browser.js — 🐛 '저장 안 한 변경' 표시가 탭마다 따로인가 (js/04c)
   ----------------------------------------------------------------------------
   2026-11-24 실측: AMUSNET 탭을 오갈 때마다 "이동하기 전에 변경사항을 저장할까요?" 가 끝없이 떴다.
   Summary 편집 표시(_nonGanttDirty)·테마 표시(_cpThemeDirty)가 **전역 하나**라 탭 스냅샷에 없었고,
   [저장하고 이동] 의 저장은 탭을 바꾼 **뒤에** 끝나 전역 표시를 못 지워 → 다음 탭으로 넘어가 계속 물었다.
   앱 탭 콘솔(프로젝트를 **열지 않은** 상태)에서 `await __sheetDirtyTest()`.
   · 진짜 탭 함수(_openAsNewSheet·switchToSheet·_restoreSheetSnapshot·_hasUnsavedChangesNow)를 지난다. 가짜 0개.
   · 시험 탭 두 개(파일 id 는 가짜)를 만들고 끝나면 지운다 — 저장은 부르지 않는다.
   ⚠️ 뒤에서 끝나는 저장의 마무리 분기(스냅샷 표시 지우기)는 실제 저장을 불러야 해서 여기선 못 본다 — 코드로만 확인.
   ============================================================================ */
window.__sheetDirtyTest = async function () {
    const out = []; let pass = 0, fail = 0;
    const ok = (c, m, x) => { if (c) { pass++; out.push('✅ ' + m); } else { fail++; out.push('❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };
    if (window.currentDriveFileId || (window._sheets || []).length) { console.error('프로젝트가 열려 있다 — 빈 화면에서 돌릴 것'); return { pass: 0, fail: 1 }; }
    const keep = { gd: globalData, ci: colIdx, logs: window.changeLogs, saved: window.lastSavedLogCount, act: window._activeSheetKey, dirty: window._nonGanttDirty, theme: window._cpThemeDirty };
    const hdr = [['NO', 'LEVEL(WBS)', '시작', '완료', '소요일', '상태', '개발업무 (WBS)', '업무 상세내용', '현황']];
    const fresh = () => { globalData = hdr.map(r => r.slice()); window.changeLogs = []; window.lastSavedLogCount = 0; window._nonGanttDirty = false; window._cpThemeDirty = false; };
    try {
        // A 탭 — 열고 Summary 를 고친 상태(고객사 칸 수정과 같은 표시)
        window._openAsNewSheet('zz_tab_A', 'zz_fid_A', 'A.json'); fresh(); window.currentDriveFileId = 'zz_fid_A';
        window._nonGanttDirty = true;
        ok(window._hasUnsavedChangesNow() === true, '0 (전제) A 탭은 저장 안 한 변경 있음');
        // B 탭 — 새로 연 깨끗한 프로젝트(executeLoadFile 처럼 표시를 끄고 시작)
        window._openAsNewSheet('zz_tab_B', 'zz_fid_B', 'B.json'); fresh(); window.currentDriveFileId = 'zz_fid_B';
        ok(window._hasUnsavedChangesNow() === false, '1 B 탭은 깨끗하다');
        window.switchToSheet('zz_tab_A');
        ok(window._nonGanttDirty === true && window._hasUnsavedChangesNow() === true, '2 A 로 돌아가면 A 의 "저장 안 함" 이 그대로 있다(잃지 않는다)');
        window._nonGanttDirty = true;    // A 에서 Summary 를 고친 채로(실사용: 고객사 칸 수정) 이미 열려 있던 B 로 간다
        window.switchToSheet('zz_tab_B');
        ok(window._nonGanttDirty === false && window._hasUnsavedChangesNow() === false, '3 🐛 B 로 가면 A 의 표시가 **넘어오지 않는다**(예전엔 전역 하나라 넘어와 계속 물었다)');
        // 뒤에서 끝난 저장이 A 스냅샷 표시를 지운 상황(저장 마무리 분기와 같은 대입)
        const a = window._sheets.find(s => s.key === 'zz_tab_A');
        a.snapshot._nonGanttDirty = false; a.snapshot._cpThemeDirty = false; a.snapshot.lastSavedLogCount = (a.snapshot.changeLogs || []).length;
        window.switchToSheet('zz_tab_A');
        ok(window._hasUnsavedChangesNow() === false, '4 저장이 끝난 A 로 돌아오면 더는 묻지 않는다');
        // 테마 표시도 탭마다
        window._cpThemeDirty = true; window.switchToSheet('zz_tab_B');
        ok(window._cpThemeDirty === false, '5 테마색 "저장 안 함" 표시도 다른 탭으로 안 넘어간다');
    } catch (e) {
        ok(false, '하네스 예외: ' + e.message);
    } finally {
        window._sheets = (window._sheets || []).filter(s => !/^zz_tab_/.test(s.key));
        globalData = keep.gd; colIdx = keep.ci; window.changeLogs = keep.logs; window.lastSavedLogCount = keep.saved;
        window._activeSheetKey = keep.act; window._nonGanttDirty = keep.dirty; window._cpThemeDirty = keep.theme; window.currentDriveFileId = null;
        try { window.renderSheetTabsBar && window.renderSheetTabsBar(); } catch (e) { /* 무시 */ }
    }
    console.log(out.join('\n'));
    console.log('🗂 탭별 저장 표시 하네스: ' + pass + ' 통과 / ' + fail + ' 실패');
    return { pass, fail, out };
};
