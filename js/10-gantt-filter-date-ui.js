    // =========================================================
    // 🎛️ UI 개선: 점선 제거, 필터 티어드롭 팝업화, 10글자 물결(~) 제한
    // =========================================================

    // 1. CSS 동적 주입 (날짜 점선 제거 & 필터 드롭다운 스타일)

    // 2a. 업무필터 통합 패널 토글 (LEVEL/업무상태/개발단계 → 하나의 드롭다운)
    window.toggleWorkFilterPanel = function(ev) {
        if (ev) ev.stopPropagation();
        const btn = document.getElementById('work-filter-btn');
        let panel = document.getElementById('work-filter-panel');
        if (!panel) return; // generateFilters가 아직 실행되지 않은 경우
        const willShow = panel.style.display !== 'block';
        panel.style.display = willShow ? 'block' : 'none';
        if (btn) btn.textContent = (btn.textContent || '').replace(/[▾▴]/, willShow ? '▴' : '▾');
    };

    // 업무필터 버튼 활성 상태(적용 중인 필터 수) 갱신
    // 🐛 [2026-09-07 버그수정] "Gantt 업무 필터 버튼 배경이 이전 팔레트 색으로 초기값이 적용됨" —
    //    필터 미적용 상태(else 분기)는 이미 _cpHex(팔레트 반영)를 쓰고 있었는데, 필터 적용중
    //    (activeCount>0) 상태만 '#b2edd8'/'#0b6e4f'로 고정 하드코딩돼 있어서 팔레트를 바꿔도 필터가
    //    걸리는 순간 항상 이 고정 민트그린(원래 청록 테마와 톤이 비슷해 "이전 팔레트 그대로"로 보임)
    //    으로 돌아갔다. 미적용 상태와 같은 _cpHex 팔레트 함수를 쓰되, 눈에 띄게 hoverBg/hoverBorder
    //    역할(평소 bg보다 진한 톤)로 강조해 "필터 적용중"임은 여전히 구분되게 한다.
    window.updateWorkFilterBtnState = function() {
        const btn = document.getElementById('work-filter-btn');
        if (!btn) return;
        const _cpHex = window._cpRoleHex || function(k) {
            return { bg: '#e0f5f7', hoverBg: '#a3d9e0', hoverBorder: '#52a5af', border: '#cfe3e5', darkText: '#00707d' }[k];
        };
        let activeCount = 0;
        for (const k in currentFilters) {
            if (currentFilters[k] && !currentFilters[k].has('All')) activeCount++;
        }
        // 🐛 [2026-09-11 버그 수정] 이 함수가 필터 변경 때마다 버튼 문구를 한글로 다시 써버려서,
        //    LANG.ui(toggleLang)로 영문 전환해도 필터를 한 번만 건드리면 곧바로 한글로 되돌아왔다.
        const _en = window._currentLang === 'en';
        const label = activeCount > 0
            ? (_en ? '🎛️ Task Filter (' + activeCount + ') ▾' : '🎛️ 업무필터 (' + activeCount + ') ▾')
            : (_en ? '🎛️ Task Filter ▾' : '🎛️ 업무필터 ▾');
        btn.textContent = label;
        const restBg = activeCount > 0 ? _cpHex('hoverBg') : _cpHex('bg');
        btn.style.background = restBg;
        btn.style.color      = _cpHex('darkText');
        btn.onmouseover = () => btn.style.background = activeCount > 0 ? _cpHex('hoverBorder') : _cpHex('hoverBg');
        btn.onmouseout  = () => btn.style.background = restBg;
    };

    // 🐛 [2026-09-07 버그수정 2] "업무필터 버튼만 팔레트 테마 미적용" 제보 — 사실은 반대였다. 업무필터는
    //    바로 위 updateWorkFilterBtnState()가 매번 _cpRoleHex로 색을 직접 다시 칠하는데, 옆에 나란히
    //    있는 일정 도구(#schedule-tools-btn)/AI검색(#gantt-ai-search-btn)/인쇄(#print-btn) 3개는 HTML에
    //    박힌 하드코딩 hex(#e0f5f7/#a3d9e0)가 _cpApplyLive의 "그 hex 문자열을 가진 요소를 통째로
    //    찾아 덮어쓰는" 별도 매커니즘에만 의존하고 있어서, 방식 자체가 서로 달랐다(실사용 화면에서
    //    업무필터만 튀어 보인 원인). 업무필터와 똑같이 _cpRoleHex를 직접 호출하는 방식으로 통일해서
    //    매커니즘을 하나로 합친다 — _cpApplyLive가 호출될 때마다(테마 변경/프로젝트 로드) 같이 갱신됨.
    window._paintActionBarButtons = function() {
        const _cpHex = window._cpRoleHex || function(k) {
            return { bg: '#e0f5f7', hoverBg: '#a3d9e0', darkText: '#00707d' }[k];
        };
        const bg = _cpHex('bg'), hoverBg = _cpHex('hoverBg'), darkText = _cpHex('darkText');
        ['schedule-tools-btn', 'gantt-ai-search-btn', 'print-btn'].forEach(function(id) {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.style.background = bg;
            btn.style.color = darkText;
            btn.onmouseover = function() { btn.style.background = hoverBg; };
            btn.onmouseout  = function() { btn.style.background = bg; };
        });
    };
    document.addEventListener('DOMContentLoaded', window._paintActionBarButtons);

    // 2b. 개별 팝업 토글 (Calendar·Weekly Report WBS 팝업 호환 — 그대로 유지)
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
        // Calendar/WR 팝업용 바깥 클릭 닫기 리스너 (gantt-filter-popup 클래스 대상)
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

    // 트리거 버튼의 "필터 적용중" 강조 상태 갱신 (개별 팝업 호환용 — 통합 패널에서는 updateWorkFilterBtnState로 통합)
    window.updateGanttFilterTriggerState = function(colIndex) {
        // 개별 트리거 버튼이 있으면 업데이트 (Calendar/WR 뷰 호환)
        const btn = document.getElementById('gantt-filter-trigger-' + colIndex);
        if (btn) {
            const isAll = currentFilters[colIndex] && currentFilters[colIndex].has('All');
            btn.classList.toggle('filter-active', !isAll);
        }
        // 통합 업무필터 버튼 상태도 함께 갱신
        window.updateWorkFilterBtnState && window.updateWorkFilterBtnState();
    };

    // 3. 필터 생성 로직 덮어쓰기 — LEVEL(WBS)/업무상태/개발단계를 "업무필터" 통합 드롭다운으로 렌더링
    window.generateFilters = function(data) {
        let savedFilters = {};
        for (let k in currentFilters) { savedFilters[k] = new Set(currentFilters[k]); }

        // 개별 팝업(dynamic) 정리 — Calendar/Weekly Report의 정적 WBS 팝업은 건드리지 않음
        document.querySelectorAll('.gantt-filter-popup-dynamic').forEach(p => p.remove());
        const legacyContainer = document.getElementById('dynamic-filters');
        if (legacyContainer) legacyContainer.innerHTML = '';
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

        // 💡 [핵심] groupDiv를 배열에 수집 후 _buildWorkFilterPanel에 전달.
        //    이전 구현에서 groupDiv를 DOM에 추가하지 않아 업무상태·개발단계가 사라지던 버그 수정.
        const groupList = [];

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

            currentFilters[col.index] = savedFilters[col.index] || new Set(['All']);
            let groupDiv = document.createElement('div');
            groupDiv.className = 'filter-group';
            groupDiv.id = 'filter-group-' + col.index;

            let label = document.createElement('div');
            label.className = 'filter-label';
            label.dataset.colName = col.name;
            label.textContent = LANG[window._currentLang].filterLabel[col.name] || col.name;
            if (currentFilters[col.index].has('All')) label.classList.add('active');
            label.onclick = () => { window.toggleAllFilter(col.index, groupDiv); window.updateGanttFilterTriggerState(col.index); };
            groupDiv.appendChild(label);

            valuesArray.forEach(val => {
                let btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.value = val;
                if (currentFilters[col.index] && currentFilters[col.index].has(val)) { btn.classList.add('active'); }

                if (col.name === '개발단계') {
                    btn.title = val;
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

            groupList.push(groupDiv); // ← DOM에 붙이지 않고 배열에 수집
        });

        // 업무필터 통합 패널 생성 (groups 배열 전달)
        _buildWorkFilterPanel(groupList);
        window.updateWorkFilterBtnState();
    };

    // 업무필터 통합 패널 DOM 구성
    // groups: generateFilters가 만든 filter-group 엘리먼트 배열 (순서: LEVEL→업무상태→개발단계)
    function _buildWorkFilterPanel(groups) {
        // 기존 패널 제거 (프로젝트 전환 시 재구성)
        let old = document.getElementById('work-filter-panel');
        if (old) old.remove();

        const triggerGroup = document.getElementById('gantt-filter-btn-group');
        if (!triggerGroup) return;

        const panel = document.createElement('div');
        panel.id = 'work-filter-panel';
        panel.style.cssText =
            'display:none;position:absolute;top:calc(100% + 6px);left:0;z-index:1300;' +
            'background:#fff;border:1px solid #c5dde0;border-radius:10px;' +
            'box-shadow:0 6px 20px rgba(0,0,0,.14);padding:12px 14px;min-width:360px;' +
            'max-height:75vh;overflow-y:auto;';

        // 패널 제목
        const _cpHexP = window._cpRoleHex || function(k) {
            return { darkText: '#00707d', border: '#cfe3e5' }[k];
        };
        const title = document.createElement('div');
        title.id = 'work-filter-panel-title';
        title.style.cssText = 'font-size:11px;font-weight:700;color:' + (_cpHexP('darkText') || '#00707d') + ';margin-bottom:10px;letter-spacing:.5px;text-transform:uppercase;';
        // 🐛 [2026-09-12 버그수정] 이 패널은 toggleLang()의 generateFilters() 재호출로 매번 다시
        // 그려지는데(=build-once 고착 버그는 아님), 이 제목 줄에만 언어 분기가 아예 없어서 "Status"/
        // "Dev Stage" 등 나머지는 영문으로 바뀌어도 이 줄만 항상 한글로 남아있었음.
        title.textContent = (window._currentLang === 'en')
            ? 'Task Filter (LEVEL · Status · Dev Stage)'
            : '업무 필터 (LEVEL · 업무상태 · 개발단계)';
        panel.appendChild(title);

        // groups 배열을 순서대로 패널에 추가 (각 사이에 구분선)
        (groups || []).forEach((g, idx) => {
            if (idx > 0) {
                const sep = document.createElement('hr');
                sep.style.cssText = 'border:none;border-top:1px solid #e0eef0;margin:8px 0;';
                panel.appendChild(sep);
            }
            panel.appendChild(g);
        });

        triggerGroup.style.position = 'relative';
        triggerGroup.appendChild(panel);

        // 바깥 클릭 시 패널 닫기 — 한 번만 등록
        if (!window._workFilterClickListenerAdded) {
            window._workFilterClickListenerAdded = true;
            document.addEventListener('click', function(e) {
                const wfp = document.getElementById('work-filter-panel');
                const wfb = document.getElementById('work-filter-btn');
                if (wfp && wfp.style.display === 'block') {
                    if (!wfp.contains(e.target) && e.target !== wfb && !(wfb && wfb.contains(e.target))) {
                        wfp.style.display = 'none';
                        // 버튼 텍스트 ▴ → ▾
                        if (wfb) wfb.textContent = wfb.textContent.replace('▴', '▾');
                    }
                }
            });
        }
    }
