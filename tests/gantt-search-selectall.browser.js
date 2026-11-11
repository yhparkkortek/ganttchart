/* 🔍☑️ 간트 검색 "비매칭 숨기기" 오매칭 + 헤더 전체선택 체크박스 (2026-11-11)

   브라우저 콘솔에서(실제로 열려 있는 프로젝트 탭에서):
     await __ganttSearchSelAllTest()

   신고 1: "비매칭 숨기기 켜고 OBSIDIAN 검색했더니 44/44건 — 숨길 대상을 잘못 보고 있다."
     원인: colIdx.customer/colIdx.model(숨은 열)은 **프로젝트 전체에 걸쳐 같은 값**이라,
     검색어가 그 값의 일부와 겹치면 리프 행 전부가 매칭돼 버렸다. → _rowMatches 에서 뺐다.
   신고 2: "V 전체 체크하는 기능 추가 — 알람 표기와 No. 사이."
     → 헤더 체크박스(#gantt-search-selall-head) + window._ganttSearchToggleSelectAll.

   ⚠️ 가짜 없음 — **진짜 globalData 한 행을 조작**해 모델명에 검색어를 심고, 진짜 검색 입력에
   진짜로 타이핑해 재현한다. 끝나면 그 행을 원래 값으로 되돌리고 검색을 지운다(저장은 안 한다
   — `nasAppFile.put`/`saveToGoogleDrive` 를 부르지 않으므로 NAS 에 아무것도 안 올라간다).
   **실제 프로젝트가 열려 있어야 한다**(globalData.length > 1). */
window.__ganttSearchSelAllTest = async function () {
    const PASS = [], FAIL = [];
    function check(name, cond, detail) {
        (cond ? PASS : FAIL).push(name);
        console.log((cond ? '  ok   ' : '  FAIL ') + name + (!cond && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''));
    }

    if (!window.globalData || window.globalData.length < 3) {
        console.error('프로젝트가 열려 있지 않다(globalData 가 비었다) — 프로젝트를 하나 연 뒤 다시 실행할 것');
        return { pass: 0, fail: 1 };
    }
    if (typeof window._ganttSearchToggleSelectAll !== 'function' || typeof window.ganttSearchQuery !== 'function') {
        console.error('window._ganttSearchToggleSelectAll / ganttSearchQuery 가 없다 — js/26 이 로드됐는지 확인할 것');
        return { pass: 0, fail: 1 };
    }

    const MARK = '테스트전용마커123';
    // 리프 행 하나를 고른다(그룹행이 아닌, 제일 아래 레벨)
    const leafIdx = globalData.findIndex((r, i) => i > 0 && r && (r._level == null || r._level >= 3));
    if (leafIdx === -1) { console.error('리프 행을 못 찾았다'); return { pass: 0, fail: 1 }; }

    const hasModelCol = colIdx.model !== -1;
    const hasCustCol = colIdx.customer !== -1;
    if (!hasModelCol && !hasCustCol) {
        console.warn('이 프로젝트엔 colIdx.model/customer 칸이 없다 — 1번 신고 재현은 건너뛴다');
    }
    const origModel = hasModelCol ? globalData[leafIdx][colIdx.model] : undefined;
    const origName = window._origDev !== undefined ? null : null; // no-op, 명시적 복원만 쓴다

    try {
        if (hasModelCol) {
            console.log('\n=== 1) 모델명(숨은 열)에만 있는 말로는 "비매칭 숨기기" 가 다 숨겨야 한다 ===');
            globalData[leafIdx][colIdx.model] = MARK;
            window.ganttSearchQuery(MARK);
            await new Promise((r) => setTimeout(r, 220)); // debounce(150ms) 대기
            const bar = document.getElementById('gantt-ai-search-filtermode');
            if (bar && !bar.checked) { bar.checked = true; bar.dispatchEvent(new Event('change')); }
            await new Promise((r) => setTimeout(r, 50));
            const countEl = document.getElementById('gantt-ai-search-count');
            const txt = countEl ? countEl.textContent : '';
            const total = globalData.length - 1;
            check('모델명에만 있던 말로는 전부 안 뜬다(0건)', /매칭\s*0건|^$/.test(txt) || txt === '',
                  '카운트 표시: "' + txt + '" (총 ' + total + '행 중 실제로 매칭된 건수가 적어야 한다)');
        }

        console.log('\n=== 2) 실제 업무명 텍스트로 검색하면 그 행만 잡힌다 ===');
        window._dailyMark = null; // noop placeholder
        const taskName = (globalData[leafIdx]._origDev || globalData[leafIdx]._origT1 ||
                          globalData[leafIdx]._origT2 || globalData[leafIdx]._origT3 ||
                          globalData[leafIdx]._origT4 || '').trim();
        if (taskName.length >= 2) {
            window.ganttSearchQuery(taskName);
            await new Promise((r) => setTimeout(r, 220));
            const tr = document.querySelector('tr[data-row-index="' + leafIdx + '"]');
            check('그 행에 검색 체크박스가 생겼다', !!(tr && tr.querySelector('.gantt-ai-cb')),
                  tr ? tr.outerHTML.slice(0, 120) : 'tr 없음');
        } else {
            console.warn('업무명이 너무 짧아(2) 건너뜀');
        }

        console.log('\n=== 3) 헤더 전체선택 체크박스 — 검색 중엔 보이고, 누르면 매칭된 걸 다 선택한다 ===');
        const headCb = document.getElementById('gantt-search-selall-head');
        check('헤더 체크박스가 있다(js/04j 렌더)', !!headCb);
        if (headCb) {
            check('검색 중엔 보인다', headCb.style.display !== 'none', headCb.style.display);
            window._ganttSearchToggleSelectAll(true);
            await new Promise((r) => setTimeout(r, 30));
            const checkedBoxes = [...document.querySelectorAll('.gantt-ai-cb')].filter((c) => c.style.display !== 'none');
            check('보이는 검색 체크박스가 전부 체크됐다', checkedBoxes.length > 0 && checkedBoxes.every((c) => c.checked),
                  checkedBoxes.map((c) => c.checked));
            check('헤더 체크박스 자신도 체크 상태', headCb.checked === true, headCb.checked);

            window._ganttSearchToggleSelectAll(false);
            await new Promise((r) => setTimeout(r, 30));
            const uncheckedBoxes = [...document.querySelectorAll('.gantt-ai-cb')].filter((c) => c.style.display !== 'none');
            check('전체 해제하면 전부 풀린다', uncheckedBoxes.every((c) => !c.checked), uncheckedBoxes.map((c) => c.checked));
            check('헤더 체크박스도 풀린다', headCb.checked === false, headCb.checked);
        }

        console.log('\n=== 4) 검색을 지우면 헤더 체크박스가 숨는다 ===');
        document.getElementById('gantt-ai-search-clear').click();
        await new Promise((r) => setTimeout(r, 30));
        check('검색 지우면 숨는다', !headCb || headCb.style.display === 'none', headCb && headCb.style.display);
    } finally {
        // 원복 — 저장은 안 하지만(이 함수는 put/save 를 부르지 않는다) 메모리 값은 되돌려 둔다.
        if (hasModelCol) globalData[leafIdx][colIdx.model] = origModel;
        document.getElementById('gantt-ai-search-filtermode') &&
            (document.getElementById('gantt-ai-search-filtermode').checked = false);
        if (typeof window.recalculateSchedules === 'function') { /* 구조를 안 바꿨으니 재계산 불필요 */ }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(PASS.length + '/' + (PASS.length + FAIL.length) + ' 통과');
    if (FAIL.length) console.error('❌ 실패:', FAIL);
    console.warn('⚠️ 이 테스트는 globalData[' + leafIdx + '] 의 모델명 칸을 임시로 바꿨다가 되돌렸다 — ' +
                 '저장(💾)은 누르지 말고 그냥 넘어갈 것(혹시 모를 혼선을 피하려면 새로고침 권장).');
    return { pass: PASS.length, fail: FAIL.length };
};
