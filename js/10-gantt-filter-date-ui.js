    // =========================================================
    // 🎛️ UI 개선: 점선 제거, 필터 티어드롭 팝업화, 10글자 물결(~) 제한
    // =========================================================

    // 💡 [2026-08-31] 원래 여기서 document.head.insertAdjacentHTML로 <style>을 동적 주입했으나,
    //    CSS를 styles.css로 분리하면서 그 규칙도 함께 옮겼다(날짜 점선 제거 & 필터 드롭다운 스타일).

    // 2. LEVEL(WBS)/업무상태/개발단계 드롭다운 팝업 토글 (일정 도구/계획 버튼과 동일한 패턴)
    window.toggleGanttFilterPopup = function(colIndex, ev) {
        if (ev) ev.stopPropagation();
        document.querySelectorAll('.gantt-filter-popup').forEach(p => {
            if (p.id !== 'gantt-filter-popup-' + colIndex) p.style.display = 'none';
        });
        const popup = document.getElementById('gantt-filter-popup-' + colIndex);
        const btn = document.getElementById('gantt-filter-trigger-' + colIndex);
        if (!popup || !btn) return;
        const willShow = popup.style.display !== 'block';
        if (willShow) {
            const rect = btn.getBoundingClientRect();
            popup.style.left = rect.left + 'px';
            popup.style.top = (rect.bottom + 4) + 'px';
        }
        popup.style.display = willShow ? 'block' : 'none';
        if (!window._ganttFilterPopupListenerAdded) {
            window._ganttFilterPopupListenerAdded = true;
            document.addEventListener('click', function(e) {
                document.querySelectorAll('.gantt-filter-popup').forEach(p => {
                    const triggerBtn = document.getElementById(p.dataset.triggerId);
                    if (!p.contains(e.target) && e.target !== triggerBtn && !(triggerBtn && triggerBtn.contains(e.target))) {
                        p.style.display = 'none';
                    }
                });
            });
        }
    };

    // 트리거 버튼의 "필터 적용중" 강조 상태 갱신
    window.updateGanttFilterTriggerState = function(colIndex) {
        const btn = document.getElementById('gantt-filter-trigger-' + colIndex);
        if (!btn) return;
        const isAll = currentFilters[colIndex] && currentFilters[colIndex].has('All');
        btn.classList.toggle('filter-active', !isAll);
    };

    // 3. 필터 생성 로직 덮어쓰기 — LEVEL(WBS)/업무상태/개발단계를 티어드롭 팝업으로 렌더링
    window.generateFilters = function(data) {
        let savedFilters = {};
        for (let k in currentFilters) { savedFilters[k] = new Set(currentFilters[k]); }

        const triggerGroup = document.getElementById('gantt-filter-btn-group');
        if (triggerGroup) triggerGroup.innerHTML = '';
        // 💡 [버그 수정] 예전엔 .gantt-filter-popup 전체를 지웠는데, Calendar/Weekly Report의 WBS 필터
        //    팝업도 같은 클래스를 공유하고 있어서(바깥클릭-닫기 로직 재사용 목적) 이 함수가 실행될 때마다
        //    (프로젝트 로드/데이터 변경 시마다) 그 팝업들까지 DOM에서 통째로 사라져 버렸음 — 그 뒤로는
        //    트리거 버튼을 눌러도 팝업을 못 찾아 조용히 아무 반응이 없던 원인. Gantt가 자체적으로
        //    새로 만드는 팝업(gantt-filter-popup-dynamic)만 지우도록 범위를 좁힘.
        document.querySelectorAll('.gantt-filter-popup-dynamic').forEach(p => p.remove()); // 이전 렌더링 팝업 정리
        const legacyContainer = document.getElementById('dynamic-filters');
        if (legacyContainer) legacyContainer.innerHTML = ''; // 레거시 박스는 항상 비워서 자동으로 숨김 처리됨
        currentFilters = {}; 
        existingDevStages = []; let assigneeModelsAll = {}; let assigneeModelsActive = {};

        for(let i = 1; i < data.length; i++) {
            if (!data[i] || data[i].join('').trim() === '') continue;
            let assignee = colIdx.assignee !== -1 ? data[i][colIdx.assignee] : "";
            let status = colIdx.status !== -1 && data[i][colIdx.status] ? data[i][colIdx.status].toString().toLowerCase() : "";
            let model = colIdx.model !== -1 ? data[i][colIdx.model] : "";
            let devStage = colIdx.devStage !== -1 ? data[i][colIdx.devStage] : (colIdx.wbs !== -1 ? data[i][colIdx.wbs] : "");
            
            if (devStage !== undefined && devStage !== null) {
                let s = devStage.toString().trim(); if (s !== '' && !existingDevStages.includes(s)) existingDevStages.push(s);
            }
            if (assignee !== undefined && assignee !== null && assignee.toString().trim() !== '') {
                let strAssignee = assignee.toString().trim();
                if (!assigneeModelsAll[strAssignee]) assigneeModelsAll[strAssignee] = new Set();
                if (!assigneeModelsActive[strAssignee]) assigneeModelsActive[strAssignee] = new Set();
                if (model !== undefined && model !== null && model.toString().trim() !== '') {
                    let strModel = model.toString().trim(); assigneeModelsAll[strAssignee].add(strModel);
                    let isDone = status.includes('complete') || status.includes('완료') || status.includes('cancel') || status.includes('취소') || status.includes('drop') || status.includes('드랍');
                    if (!isDone) { assigneeModelsActive[strAssignee].add(strModel); }
                }
            }
        }

        // 필터 표시 순서 강제 조작 (LEVEL -> 업무상태 -> 개발단계)
        const orderMap = { 'LEVEL(WBS)': 1, '업무상태': 2, '개발단계': 3 };
        filterColumns.sort((a, b) => (orderMap[a.name] || 99) - (orderMap[b.name] || 99));

        filterColumns.forEach(col => {
            let uniqueValues = new Set();
            for(let i = 1; i < data.length; i++) {
                if (!data[i] || data[i].join('').trim() === '') continue; 
                let val = data[i][col.index]; if (val !== undefined && val !== null && val.toString().trim() !== '') { uniqueValues.add(val.toString().trim()); }
            }
            let valuesArray = Array.from(uniqueValues);
            if (col.name === '개발단계') { valuesArray = existingDevStages; }
            else if (col.name === '업무상태') { valuesArray = ['진행', '완료', '대기', '지연']; }
            else { valuesArray.sort(); }

            // 💡 [2026-08-29 되돌림] LEVEL(WBS) 트리거 버튼만 기본 상태에서 강조색(filter-active)으로
            //    보여서 업무상태/개발단계 트리거와 색이 안 맞는다는 피드백 — 세 필터 모두 저장된 선택이
            //    없는 첫 상태(기본값)에서 동일하게 'All'로 시작하도록 통일. 필터링 결과(전체 표시)는
            //    이전과 동일하고, 트리거 버튼 강조 여부(updateGanttFilterTriggerState의 has('All') 체크)만
            //    옆 버튼들과 같아짐. (0/1/2/3/4 버튼이 처음부터 개별 active로 안 보이는 대신, 라벨
            //    자체가 active로 표시되어 "전체 선택됨"이 여전히 드러남 — 다른 두 필터와 동일한 패턴.)
            currentFilters[col.index] = savedFilters[col.index] || new Set(['All']);
            let groupDiv = document.createElement('div');
            // 💡 [2026-08-27] LEVEL(WBS)만 색상/클릭 동작을 다르게 하려던 예외 처리(구 filter-group-wbs /
            //    filter-label-static)는 업무상태·개발단계와 UI가 안 맞는다는 피드백으로 걷어냄 — 이제
            //    세 필터 모두 완전히 같은 코드 경로(공통 .filter-group/.filter-label)를 씀. 레벨 0~4가
            //    기본값으로 전체 선택되어 시작하는 동작(currentFilters 초기값)은 그대로 유지.
            groupDiv.className = 'filter-group';
            groupDiv.id = 'filter-group-' + col.index;

            let label = document.createElement('div');
            label.className = 'filter-label';
            label.dataset.colName = col.name; label.textContent = LANG[window._currentLang].filterLabel[col.name] || col.name;
            if (currentFilters[col.index].has('All')) label.classList.add('active');
            label.onclick = () => { window.toggleAllFilter(col.index, groupDiv); window.updateGanttFilterTriggerState(col.index); };
            groupDiv.appendChild(label);

            valuesArray.forEach(val => {
                let btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.value = val; 
                if (currentFilters[col.index] && currentFilters[col.index].has(val)) { btn.classList.add('active'); }
                
                // 💡 자바스크립트로 정확히 10글자 측정 후 넘치면 자르고 '~' 붙이기
                if (col.name === '개발단계') {
                    btn.title = val; // 원본 전체 글자는 마우스 오버 시 툴팁으로 보존
                    let displayVal = val.length > 10 ? val.substring(0, 10) + "~" : val;
                    btn.textContent = displayVal;
                } else if (col.name === '담당자') {
                    let countAll = assigneeModelsAll[val] ? assigneeModelsAll[val].size : 0; let countActive = assigneeModelsActive[val] ? assigneeModelsActive[val].size : 0;
                    btn.innerHTML = `${val} <span class="badge" title="진행 모델 수 / 전체 모델 수">${countActive}/${countAll}</span>`;
                } else { 
                    const statusMap = LANG[window._currentLang].statusMap;
                    btn.textContent = statusMap[val] || val; 
                }

                btn.onclick = (e) => { updateFilter(e, col.index, val, groupDiv); window.updateGanttFilterTriggerState(col.index); };
                groupDiv.appendChild(btn);
            });

            // 트리거 버튼 (평소엔 이 버튼만 보이고, 클릭 시 팝업으로 groupDiv 노출)
            let triggerBtn = document.createElement('button');
            triggerBtn.className = 'action-btn gantt-filter-trigger-btn';
            triggerBtn.id = 'gantt-filter-trigger-' + col.index;
            triggerBtn.textContent = (LANG[window._currentLang].filterLabel[col.name] || col.name) + ' ▾';
            triggerBtn.onclick = (e) => window.toggleGanttFilterPopup(col.index, e);
            if (!currentFilters[col.index].has('All')) triggerBtn.classList.add('filter-active');
            if (triggerGroup) triggerGroup.appendChild(triggerBtn);

            // 팝업 (항상 DOM에 존재, 평소엔 숨김 — 기존 필터 로직/조회 코드와 호환 유지)
            let popup = document.createElement('div');
            // 💡 [버그 수정] gantt-filter-popup-dynamic 마커를 따로 둬서, 아래 "이전 렌더링 팝업 정리"가
            //    Gantt가 매번 새로 만드는 이 팝업들만 지우고 Calendar/Weekly Report의 정적 WBS 팝업(같은
            //    gantt-filter-popup 클래스를 공유해서 바깥클릭-닫기 로직을 재사용함)은 건드리지 않게 한다.
            popup.className = 'row-action-popup gantt-filter-popup gantt-filter-popup-dynamic';
            popup.id = 'gantt-filter-popup-' + col.index;
            popup.dataset.triggerId = 'gantt-filter-trigger-' + col.index;
            popup.appendChild(groupDiv);
            document.body.appendChild(popup);
        });
    };
