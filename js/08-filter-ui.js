    // =========================================================
    // 🎛️ 필터 UI 개선: '전체(All)' 버튼 제거 및 라벨 클릭 기능 통합
    // =========================================================
    
    // 기존 generateFilters 덮어쓰기
    // 2. 필터 생성 로직 덮어쓰기 (WBS 레벨 한글 명칭 매핑 버전)
    window.generateFilters = function(data) {
        let savedFilters = {};
        for (let k in currentFilters) { savedFilters[k] = new Set(currentFilters[k]); }

        const filterContainer = document.getElementById('dynamic-filters'); filterContainer.innerHTML = ''; currentFilters = {}; 
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

            currentFilters[col.index] = savedFilters[col.index] || new Set(['All']);
            let groupDiv = document.createElement('div'); groupDiv.className = 'filter-group'; groupDiv.id = 'filter-group-' + col.index; 
            
            if (col.name === '개발단계') {
                groupDiv.style.width = '100%';
                groupDiv.style.marginTop = '2px';
            }
            
            let label = document.createElement('div'); 
            label.className = 'filter-label'; 
            label.dataset.colName = col.name; label.textContent = LANG[window._currentLang].filterLabel[col.name] || col.name;
            if (currentFilters[col.index].has('All')) label.classList.add('active'); 
            label.onclick = () => window.toggleAllFilter(col.index, groupDiv); 
            groupDiv.appendChild(label);

            // 💡 WBS 레벨 숫자를 사용자 친화적인 한글 레이블로 매핑합니다.
            const wbsLabels = {
                '0': '0 (대분류)',
                '1': '1 (소분류1)',
                '2': '2 (소분류2)',
                '3': '3 (세부업무)',
                '4': '4 (하위업무)'
            };

            valuesArray.forEach(val => {
                let btn = document.createElement('button'); btn.className = 'btn'; btn.dataset.value = val; 
                if (currentFilters[col.index] && currentFilters[col.index].has(val)) { btn.classList.add('active'); }
                
                if (col.name === 'LEVEL(WBS)') {
                    // 💡 숫자가 아닌 든든한 명칭으로 버튼 텍스트를 출력합니다.
                    btn.textContent = wbsLabels[val] || `Level ${val}`;
                } else if (col.name === '개발단계') {
                    btn.title = val;
                    let displayVal = val.length > 8 ? val.substring(0, 8) + "~" : val;
                    btn.textContent = displayVal;
                } else if (col.name === '담당자') {
                    let countAll = assigneeModelsAll[val] ? assigneeModelsAll[val].size : 0; let countActive = assigneeModelsActive[val] ? assigneeModelsActive[val].size : 0;
                    btn.innerHTML = `${val} <span class="badge" title="진행 모델 수 / 전체 모델 수">${countActive}/${countAll}</span>`;
                } else { 
                    const statusMap = LANG[window._currentLang].statusMap;
                    btn.textContent = statusMap[val] || val; 
                }

                btn.onclick = (e) => updateFilter(e, col.index, val, groupDiv); groupDiv.appendChild(btn);
            });
            filterContainer.appendChild(groupDiv);
        });
    };

    // 기존 updateFilter 덮어쓰기
    window.updateFilter = function(event, colIndex, value, groupDiv) {
        const btn = event.currentTarget; 
        const filterSet = currentFilters[colIndex]; 
        const labelAsAllBtn = groupDiv.querySelector('.filter-label'); 

        if (value === 'All') { 
            filterSet.clear(); filterSet.add('All'); 
            const btns = groupDiv.querySelectorAll('.btn'); 
            btns.forEach(b => b.classList.remove('active')); 
            labelAsAllBtn.classList.add('active'); 
        } else {
            if (filterSet.has('All')) { 
                filterSet.delete('All'); 
                labelAsAllBtn.classList.remove('active'); 
            }
            if (filterSet.has(value)) { 
                filterSet.delete(value); 
                btn.classList.remove('active'); 
            } else { 
                filterSet.add(value); 
                btn.classList.add('active'); 
            }
            if (filterSet.size === 0) { 
                filterSet.add('All'); 
                labelAsAllBtn.classList.add('active'); 
            }
        }
        applyFilters();
    };

    window.toggleAllFilter = function(colIndex, groupDiv) {
        const filterSet = currentFilters[colIndex];
        const label = groupDiv.querySelector('.filter-label');
        const btns = groupDiv.querySelectorAll('.btn');
        if (filterSet.has('All')) {
            // All → 개별 항목 전체 선택
            filterSet.clear();
            btns.forEach(b => { filterSet.add(b.dataset.value); b.classList.add('active'); });
            label.classList.remove('active');
        } else {
            // 전체 선택 → All 모드로 복귀
            filterSet.clear(); filterSet.add('All');
            btns.forEach(b => b.classList.remove('active'));
            label.classList.add('active');
        }
        applyFilters();
    };

    // 💡 [2026-08-28 신규] 아래 window._aiJumpToRow가, "#98" 클릭 시 필터 때문에 그 업무가 화면에 아예
    //    안 보이는 경우에 대비해 모든 필터를 "전체"로 되돌리는 데 쓰는 헬퍼. updateFilter의 "All 선택"
    //    분기와 같은 처리를 모든 필터 컬럼에 일괄 적용한다(버튼 active 표시까지 화면과 동기화).
    window._resetAllGanttFilters = function() {
        if (typeof filterColumns === 'undefined' || typeof currentFilters === 'undefined') return false;
        let changed = false;
        filterColumns.forEach(function(col) {
            const filterSet = currentFilters[col.index];
            if (!filterSet || filterSet.has('All')) return;
            filterSet.clear(); filterSet.add('All');
            changed = true;
            const groupDiv = document.getElementById('filter-group-' + col.index);
            if (groupDiv) {
                const label = groupDiv.querySelector('.filter-label');
                groupDiv.querySelectorAll('.btn').forEach(function(b) { b.classList.remove('active'); });
                if (label) label.classList.add('active');
            }
        });
        if (changed) applyFilters();
        return changed;
    };

    // 💡 [2026-08-28 신규 → 같은 날 수정] AI 요약/AI 문답 답변의 "#98" 링크(window._linkifyTaskRefs)를
    //    클릭했을 때 실행되는 이동 기능 — "분석 내용이 실제 원본과 맞는지/더 자세히 보고 싶다"는 요청
    //    대응. 처음엔 이동할 때 AI 모달을 자동으로 닫았는데, 그러면 "AI 내용과 실제 업무를 나란히
    //    비교"하려던 목적 자체가 사라진다는 피드백으로 모달은 그대로 열어둔 채 이동하도록 바꿨다.
    //    1) 조상 WBS가 접혀 있으면 펼치고, 2) 그래도 필터에 걸려 안 보이면 필터를 전체 초기화한 뒤,
    //    3) 스크롤 + 하이라이트한다(모달이 표를 가리고 있으면 토스트로 직접 끌어서 옮기라고 안내).
    window._aiJumpToRow = function(rowIndex) {
        const _en = window._currentLang === 'en';
        const row = globalData && globalData[rowIndex];
        if (!row || row._level === undefined) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ Could not find task #' + rowIndex + ' (it may have been deleted or renumbered).'
                : '⚠️ #' + rowIndex + ' 업무를 찾지 못했습니다(삭제되었거나 번호가 바뀐 것 같습니다).', 'warning');
            else alert(_en ? '⚠️ Could not find task #' + rowIndex + '.' : '⚠️ #' + rowIndex + ' 업무를 찾지 못했습니다.');
            return;
        }

        // 모달은 그대로 열어둔 채 이동만 하므로(위 함수 설명 참고), 모달이 표를 가리고 있을 땐
        // 드래그해서 옆으로 옮기면 비교하기 편하다는 안내만 띄운다.
        if (window.showToast && (document.getElementById('gantt-qa-modal')?.style.display === 'block'
            || document.getElementById('ai-summary-modal')?.style.display === 'block')) {
            window.showToast(_en
                ? '📍 Jumped to task #' + rowIndex + '. Drag the window aside to compare side by side.'
                : '📍 #' + rowIndex + ' 업무로 이동했습니다. 창을 끌어서 옆으로 옮기면 비교하기 편해요.', 'info');
        }

        // 🐛 [2026-08-30 버그 수정] 다른 탭(Summary/M.C Table 등)을 보고 있는 중에 #숫자를 누르면, Gantt
        // 표 자체는 DOM에 계속 있어서 조용히 스크롤/하이라이트만 되고 화면엔 여전히 다른 탭이 보여서
        // "눌러도 아무 반응 없다"고 느껴졌다 — 1차로 Gantt 탭으로 강제 전환하고, 탭이 실제로 화면에
        // 나타난 뒤(전환 애니메이션/레이아웃 안정화를 위해 한 프레임 대기) 2차로 그 안의 상세 위치로 이동한다.
        if (window.switchTab) window.switchTab('gantt');

        const jumpToDetail = function() {
            // 조상 WBS가 접혀 있으면 펼쳐서 실제로 보이게 함 (자기 자신 위쪽에서 레벨이 더 얕은 첫 조상을
            // 계속 타고 올라가며 확인 — window.toggleWbsCollapse와 같은 트리 구조 가정)
            let expanded = false;
            let curLevel = row._level || 0;
            for (let j = rowIndex - 1; j >= 0 && curLevel > 0; j--) {
                const pr = globalData[j];
                if (!pr || pr._level === undefined) continue;
                if (pr._level < curLevel) {
                    if (pr._wbsCollapsed) { pr._wbsCollapsed = false; expanded = true; }
                    curLevel = pr._level;
                }
            }
            if (expanded) applyFilters();

            const tr = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
            if (!tr) return;
            if (tr.style.display === 'none') {
                // 필터에 걸려 여전히 숨어 있으면 필터를 전체 초기화해서라도 보여준다
                window._resetAllGanttFilters();
            }
            window.highlightRow(rowIndex);
            tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };
        // 방금 탭을 전환했다면 레이아웃이 자리잡을 시간을 한 틱 주고, 이미 Gantt 탭이었다면 바로 실행.
        setTimeout(jumpToDetail, 50);
    };

    // 💡 [2026-08-30 신규] 임시로 tr에 반짝임 효과만 주고(영구 선택 상태 X) 자동으로 사라지게 하는
    //    공용 헬퍼 — Gantt의 highlighted-row(수동 해제 전까지 유지)와 달리 M.C Table/Customer SPEC
    //    행은 별도의 "선택 해제" 개념이 없어서 일정 시간 후 스스로 사라지는 방식이 더 맞다.
    window._aiFlashRow = function(tr) {
        if (!tr) return;
        tr.classList.remove('ai-ref-flash');
        void tr.offsetWidth; // 같은 행을 연달아 클릭해도 애니메이션이 재시작되도록 강제 리플로우
        tr.classList.add('ai-ref-flash');
        tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(function() { tr.classList.remove('ai-ref-flash'); }, 1700);
    };

    // 💡 [2026-08-30 신규 → 같은 날 재작성] AI 답변의 "#CS숫자"(Customer SPEC) 클릭 이동 — 이제 번호
    //    자체가 화면 "No." 열(.bm-no)의 값과 정확히 같으므로, 내용 대조 없이 그 번호가 찍힌 <tr>을
    //    바로 찾는다(위 _buildGanttQaContext 참고 — 번호를 매기는 기준을 아예 화면 렌더링과 통일함).
    window._aiJumpToCsRow = function(idx) {
        const _en = window._currentLang === 'en';
        if (!(window._aiCsRefMap && window._aiCsRefMap[idx])) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ Could not find Customer SPEC row #' + idx + '.'
                : '⚠️ Customer SPEC #' + idx + ' 행을 찾지 못했습니다.', 'warning');
            return;
        }
        if (window.switchTab) window.switchTab('briefspec');
        setTimeout(function() {
            const rows = document.querySelectorAll('#briefspec-body tr');
            let found = null;
            rows.forEach(function(tr) {
                if (found) return;
                const noEl = tr.querySelector('.bm-no');
                if (noEl && noEl.textContent === String(idx)) found = tr;
            });
            if (!found) {
                if (window.showToast) window.showToast(_en
                    ? '⚠️ Could not find Customer SPEC row #' + idx + ' (it may have changed).'
                    : '⚠️ Customer SPEC #' + idx + ' 행을 찾지 못했습니다(내용이 바뀐 것 같습니다).', 'warning');
                return;
            }
            window._aiFlashRow(found);
        }, 60);
    };

    // 💡 [2026-08-30 신규 → 같은 날 재작성] AI 답변의 "#MC숫자"(M.C Table) 클릭 이동 — 번호가 화면
    //    "No." 열(.bm-no)과 정확히 같으므로, 문맥 생성 당시의 종류(unit)/리비전(rev)만 지금 화면과
    //    다르면 먼저 전환한 뒤(mcSwitchUnit/mcSwitchRevision, 둘 다 populateTabData()로 다시 그림)
    //    그 번호가 찍힌 <tr>을 바로 찾는다.
    window._aiJumpToMcRow = function(idx) {
        const _en = window._currentLang === 'en';
        const ref = window._aiMcRefMap && window._aiMcRefMap[idx];
        if (!ref) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ Could not find M.C Table row #' + idx + '.'
                : '⚠️ M.C Table #' + idx + ' 행을 찾지 못했습니다.', 'warning');
            return;
        }
        if (window.switchTab) window.switchTab('mctable');
        const doSwitch = function() {
            if ((window.mcActiveUnit || '') !== (ref.unit || '')) {
                if (window.mcSwitchUnit) window.mcSwitchUnit(ref.unit || '');
            }
            const curRev = (window.tabData && window.tabData.mcActiveRevision) || 'R1';
            if (curRev !== (ref.rev || 'R1')) {
                if (window.mcSwitchRevision) window.mcSwitchRevision(ref.rev || 'R1');
            }
        };
        setTimeout(function() {
            doSwitch();
            setTimeout(function() {
                const rows = document.querySelectorAll('#mctable-body tr');
                let found = null;
                rows.forEach(function(tr) {
                    if (found) return;
                    const noEl = tr.querySelector('.bm-no');
                    if (noEl && noEl.textContent === String(idx)) found = tr;
                });
                if (!found) {
                    if (window.showToast) window.showToast(_en
                        ? '⚠️ Could not find M.C Table row #' + idx + ' (it may have changed).'
                        : '⚠️ M.C Table #' + idx + ' 행을 찾지 못했습니다(내용이 바뀐 것 같습니다).', 'warning');
                    return;
                }
                window._aiFlashRow(found);
            }, 60);
        }, 60);
    };

    // 💡 [2026-08-30 신규] AI 답변의 "#MT숫자"(주요 자재) 클릭 이동 — 이 표는 별도 탭이 아니라 Summary
    //    탭 안에 있어서(좌/우 두 tbody로 분할) switchTab('summary')만 하고, category/ktkPn/description
    //    값 대조로 찾는다(CS와 동일 패턴).
    window._aiJumpToMtRow = function(idx) {
        const _en = window._currentLang === 'en';
        const ref = window._aiMtRefMap && window._aiMtRefMap[idx];
        if (!ref) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ Could not find material row #' + idx + '.'
                : '⚠️ 주요 자재 #' + idx + ' 행을 찾지 못했습니다.', 'warning');
            return;
        }
        if (window.switchTab) window.switchTab('summary');
        setTimeout(function() {
            const rows = document.querySelectorAll('#sum-materials-rows-a tr, #sum-materials-rows-b tr');
            let found = null;
            rows.forEach(function(tr) {
                if (found) return;
                // 💡 고정(locked) 구분명 행은 category가 <input>이 아니라 첫 칸의 평문 텍스트라서
                // (window.renderMaterialRows의 catCell 분기 참고) data-field가 없으면 첫 칸 텍스트로 대체.
                const g = function(f) { const el = tr.querySelector('[data-field="' + f + '"]'); return el ? el.value : ''; };
                const cat = tr.querySelector('[data-field="category"]') ? g('category') : (tr.cells[0] ? tr.cells[0].textContent.trim() : '');
                if (cat === ref.category && g('ktkPn') === ref.ktkPn && g('description') === ref.description) found = tr;
            });
            if (!found) {
                if (window.showToast) window.showToast(_en
                    ? '⚠️ Could not find material row #' + idx + ' (it may have changed).'
                    : '⚠️ 주요 자재 #' + idx + ' 행을 찾지 못했습니다(내용이 바뀐 것 같습니다).', 'warning');
                return;
            }
            window._aiFlashRow(found);
        }, 60);
    };

    // 💡 [2026-08-30 신규] AI 답변의 "#AD숫자"(주소록) 클릭 이동 — 검색어로 필터돼(display:none) 화면에
    //    숨어 있을 수 있으니 먼저 검색어를 비운 뒤 name/nameEn 값 대조로 찾는다.
    window._aiJumpToAdRow = function(idx) {
        const _en = window._currentLang === 'en';
        if (!(window._aiAdRefMap && window._aiAdRefMap[idx])) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ Could not find address book row #' + idx + '.'
                : '⚠️ 주소록 #' + idx + ' 행을 찾지 못했습니다.', 'warning');
            return;
        }
        if (window.switchTab) window.switchTab('address');
        setTimeout(function() {
            if (window.filterAddressRows) window.filterAddressRows(''); // 검색 필터에 가려 안 보이는 경우 대비
            const searchInput = document.getElementById('addr-search-input');
            if (searchInput) searchInput.value = '';
            const rows = document.querySelectorAll('#address-table-body tr');
            let found = null;
            rows.forEach(function(tr) {
                if (found) return;
                const noEl = tr.querySelector('.bm-no');
                if (noEl && noEl.textContent === String(idx)) found = tr;
            });
            if (!found) {
                if (window.showToast) window.showToast(_en
                    ? '⚠️ Could not find address book row #' + idx + ' (it may have changed).'
                    : '⚠️ 주소록 #' + idx + ' 행을 찾지 못했습니다(내용이 바뀐 것 같습니다).', 'warning');
                return;
            }
            window._aiFlashRow(found);
        }, 60);
    };

    // 💡 [2026-08-30 신규] AI 답변의 "#EP숫자"(Elec Parts SPEC) 클릭 이동 — 이 표는 Gantt/CS/MC와 달리
    //    "모델"이 행이 아니라 열(column)이라(스펙 항목이 행) tr 하나를 통째로 찾을 수 없다. 대신
    //    1) elecparts 탭 + 해당 종류(convbd/adbd) 뷰로 전환하고, 2) 그 모델의 헤더 <th>를 열 버튼의
    //    data-ep-reextract="type|model" 속성으로 찾아 cellIndex를 알아낸 뒤, 3) 같은 칸 수를 가진(=콜스팬
    //    섹션 제목행이 아닌) 본문 행들에서 그 인덱스의 <td>만 반짝여서 "이 열"임을 보여준다.
    window._aiJumpToEpRow = function(idx) {
        const _en = window._currentLang === 'en';
        const ref = window._aiEpRefMap && window._aiEpRefMap[idx];
        if (!ref) {
            if (window.showToast) window.showToast(_en
                ? '⚠️ Could not find Elec Parts spec item #' + idx + '.'
                : '⚠️ Elec Parts #' + idx + ' 항목을 찾지 못했습니다.', 'warning');
            return;
        }
        if (window.switchTab) window.switchTab('elecparts');
        // 🐛 [2026-08-31 버그 수정] PANEL은 CONVERTER/AD BOARD와 렌더링 함수·DOM id·버튼
        // data-속성이 전부 다르다(제품 종류가 하나뿐이라 type 접미사가 안 붙음: #pc-thead/#pc-tbody,
        // data-pc-reextract="모델명"만 있고 "type|모델명" 형식이 아님) — 분기 안 해주면 PANEL 인용은
        // 클릭해도 "찾지 못했습니다"만 뜨고 실제로는 이동이 안 됐다.
        const isPanel = ref.type === 'panel';
        setTimeout(async function() {
            if (isPanel) {
                if (window._switchElecView) window._switchElecView('panel');
                if (window.renderPanelCompareTab) { try { await window.renderPanelCompareTab(); } catch (e) {} }
            } else {
                if (window._switchElecView) window._switchElecView(ref.type);
                if (window.renderElecCompareTab) { try { await window.renderElecCompareTab(ref.type); } catch (e) {} }
            }
            const theadEl = document.getElementById(isPanel ? 'pc-thead' : ('ep-' + ref.type + '-thead'));
            const tbodyEl = document.getElementById(isPanel ? 'pc-tbody' : ('ep-' + ref.type + '-tbody'));
            const btn = theadEl && theadEl.querySelector(isPanel
                ? ('[data-pc-reextract="' + ref.model + '"], [data-pc-edit="' + ref.model + '"]')
                : ('[data-ep-reextract="' + ref.type + '|' + ref.model + '"], [data-ep-edit="' + ref.type + '|' + ref.model + '"]'));
            const th = btn && btn.closest('th');
            if (!theadEl || !tbodyEl || !th) {
                if (window.showToast) window.showToast(_en
                    ? '⚠️ Could not find Elec Parts spec item #' + idx + ' (it may have changed).'
                    : '⚠️ Elec Parts #' + idx + ' 항목을 찾지 못했습니다(내용이 바뀐 것 같습니다).', 'warning');
                return;
            }
            const headerRow = theadEl.querySelector('tr');
            const totalCols = headerRow ? headerRow.cells.length : 0;
            const cellIndex = th.cellIndex;
            const cellsToFlash = [th];
            tbodyEl.querySelectorAll('tr').forEach(function(tr) {
                if (tr.cells.length === totalCols && tr.cells[cellIndex]) cellsToFlash.push(tr.cells[cellIndex]);
            });
            th.scrollIntoView({ block: 'center', behavior: 'smooth' });
            cellsToFlash.forEach(function(td) {
                td.classList.remove('ai-ref-flash');
                void td.offsetWidth;
                td.classList.add('ai-ref-flash');
                setTimeout(function() { td.classList.remove('ai-ref-flash'); }, 1700);
            });
        }, 80);
    };

