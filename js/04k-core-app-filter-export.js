// [분리됨] 원본: js/04-core-app.js 의 11059~11915행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 필터 적용/파일명 동적 조립 + 엑셀 출력 공통 스타일러
    // =========================================================
    // 🎛️ 필터 적용 및 파일명 동적 조립 함수 (누락 복원 및 버그 완벽 수정)
    // =========================================================
    // 💡 담당자/고객/모델/인치 — 더 이상 엑셀 행에서 읽지 않고 Summary(프로젝트 정보) 값을 그대로 사용
    window.getSummaryAssignee = function() { return ((window.projectMeta || {}).프로젝트담당자 || '').trim(); };
    window.getSummaryCustomer = function() { return ((window.projectMeta || {}).고객사 || '').trim(); };
    window.getSummaryModel    = function() { return ((window.projectMeta || {}).고객모델명 || '').trim(); };
    // 💡 인치: KTK 모델명(">" 오른쪽)의 4,5,6번째 글자를 가져와 "320" → "32.0" 형식으로 변환
    window.getSummaryInch = function() {
        const raw = String((window.projectMeta || {}).KTK모델명 || '');
        const afterGt = raw.indexOf('>') !== -1 ? raw.slice(raw.indexOf('>') + 1) : raw;
        const digits = afterGt.slice(3, 6);
        if (digits.length < 2) return '';
        return digits.slice(0, -1) + '.' + digits.slice(-1);
    };

    // 💡 저장(=파일 생성) 전 필수 검증: 파일명 조립에 쓰이는 Summary 항목이 비어 있으면
    //    "All_All_All" 같은 의미 없는 파일명으로 저장되는 것을 막는다.
    window.validateRequiredProjectInfo = function() {
        const pm = window.projectMeta || {};
        const missing = [];
        if (!String(pm.고객사 || '').trim()) missing.push('고객사');
        if (!String(pm.고객모델명 || '').trim()) missing.push('고객 모델명');
        if (!String(pm.KTK모델명 || '').trim()) missing.push('KTK PN_모델명');
        if (!String(pm.프로젝트담당자 || '').trim()) missing.push('프로젝트 담당자');
        // 💡 [버그 수정] PROTO Start는 "새 프로젝트를 처음 등록할 때"만 필수여야 하는데, 모든 저장에
        //    걸리게 해뒀더니 — 이미 등록된 기존 프로젝트(PROTO Start를 입력한 적 없는 대부분의 과거
        //    프로젝트 포함)들까지 저장이 막혀버렸다("프로젝트 열기"가 전환 전 자동저장을 시도하다 여기
        //    걸려서 프로젝트 목록조차 못 여는 것처럼 보이는 문제로 이어짐). 드라이브에 아직 파일이 없는
        //    (=currentDriveFileId가 없는) 진짜 신규 등록 때만 요구하도록 범위를 좁힌다.
        //    💡 [추가 수정] 그것만으론 부족했다 — PROTO Start는 "Gantt 일정에 앵커로 쓰일 때"만 의미가
        //    있는데, 아직 Gantt WBS를 하나도 안 불러온 채(Summary만 먼저 채우는 흔한 순서) 저장하려 하면
        //    앵커로 쓸 일정 자체가 없는데도 요구하고 있었다. 실제로 앵커링할 Gantt 데이터
        //    (globalData.length > 1)가 있을 때만 요구하도록 조건을 하나 더 좁힌다.
        if (!window.currentDriveFileId && globalData && globalData.length > 1) {
            const protoStartMs = (((window.tabData || {}).summary || {}).milestones || {})['기획Start'];
            if (!protoStartMs || !String(protoStartMs.date || '').trim()) missing.push('PROTO Start (첫 표 "계획" 행의 시작일 · 프로젝트 시작일 — Gantt 데이터가 있는 신규 프로젝트만 필수)');
        }
        if (missing.length === 0) return '';
        // 💡 [UX] 빈 줄을 줄여 한눈에 들어오게 — 예전엔 문단마다 \n\n이 들어가 모달이 불필요하게 길었다.
        return '⚠️ 필수 정보가 비어 있어 저장할 수 없습니다.\n(Summary 탭에서 입력 · 파일명 생성과 일정 자동계산에 필요)\n\n· ' + missing.join('\n· ');
    };

    // 💡 필수 항목(고객사/고객모델명/KTK PN_모델명/프로젝트담당자, 신규 프로젝트는 PROTO Start도) 빈 값이면 시각적 하이라이트
    window._checkRequiredField = function(el) {
        if (!el) return;
        if (String(el.value || '').trim()) el.classList.remove('req-missing');
        else el.classList.add('req-missing');
    };
    window._checkAllRequiredFields = function() {
        ['sum-customer', 'sum-customer-model', 'sum-ktk-pn-model', 'sum-pm'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) window._checkRequiredField(el);
        });
        // 💡 PROTO Start는 신규 프로젝트(아직 드라이브에 없는 파일) 등록 시에만 필수 — 이미 등록된
        //    기존 프로젝트를 열었을 때는 빨간 경고를 띄우지 않는다 (validateRequiredProjectInfo와 동일 기준)
        const protoEl = document.getElementById('sum-ms-plan-protostart');
        if (protoEl) {
            if (window.currentDriveFileId) protoEl.classList.remove('req-missing');
            else window._checkRequiredField(protoEl);
        }
    };

    window.updatePrintTitle = function() {
        try {
            // 💡 더 이상 엑셀 행/필터에서 찾지 않고, Summary(프로젝트 정보)에 입력된 값을 그대로 사용
            let customer = window.getSummaryCustomer() || "All";
            let model = window.getSummaryModel() || "All";
            let inch = window.getSummaryInch();
            // 💡 담당자 이름은 화면 표시/파일명(xlsx·json·드라이브 저장·주간보고서 전부 공용) 어디에도 넣지 않음

            const infoStr = inch ? `${customer}_${model}_${inch}` : `${customer}_${model}`; 
            const safeInfoStr = infoStr.replace(/\s*>\s*/g, '_').replace(/[\x00-\x1F\x7F"*/:<>?\\|]/g, ''); 
            
            const tableInfoTextElem = document.getElementById('table-info-text'); 
            if (tableInfoTextElem) { tableInfoTextElem.textContent = infoStr.replace(/_/g, " > "); }
            
            const today = new Date(); 
            const yy = String(today.getFullYear()).slice(-2); 
            const mm = String(today.getMonth() + 1).padStart(2, '0'); 
            const dd = String(today.getDate()).padStart(2, '0'); 
            const dateStringYYMMDD = `${yy}${mm}${dd}`; 
            const dateStringFull = today.getFullYear() + "-" + mm + "-" + dd;
            
            const printDateEl = document.getElementById('print-date');
            if (printDateEl) printDateEl.textContent = "인쇄일자: " + dateStringFull;
            
            const exportName = `${dateStringYYMMDD}_${safeInfoStr}`; 
            document.title = exportName; 
            window.exportFilenameStr = exportName;
            window.driveSaveFilenameStr = `${safeInfoStr}`;  // 날짜 없는 드라이브 전용 파일명
        } catch (err) {
            console.error("파일명 자동 조립 엔진 오류:", err);
        }
    };

    // 💡 [2026-08-28 신규] WBS 셀 접기/펴기 화살표 클릭 — 이 행 아래 하위(자식) 행들을 숨기고/보이고
    //    토글한다. 실제 표시/숨김은 applyFilters()가 row._wbsCollapsed를 보고 필터와 함께 한 번에
    //    판정하므로(둘이 따로 tr.style.display를 건드리면 서로 덮어써서 꼬임), 여기서는 상태값과
    //    화살표 아이콘만 바꾸고 applyFilters()를 다시 호출한다. renderTable() 전체 재호출보다 가벼움.
    window.toggleWbsCollapse = function(rowIndex, ev) {
        if (ev) ev.stopPropagation();
        const row = globalData[rowIndex];
        if (!row) return;
        row._wbsCollapsed = !row._wbsCollapsed;
        const tr = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
        const arrow = tr ? tr.querySelector('.wbs-toggle-arrow') : null;
        if (arrow) {
            arrow.textContent = row._wbsCollapsed ? '▶' : '▼';
            arrow.title = row._wbsCollapsed ? '펼치기' : '접기';
        }
        applyFilters();
    };

    // ═══════════════════════════════════════════════════════════
    // 💡 [2026-08-28 신규 → 같은 날 개편] WBS 업무명 앞 "담당구분" 순환 토글 배지 — 클릭할 때마다
    //    담당구분 목록을 순서대로 한 칸씩 돌려가며 row._담당구분을 바꾼다. 원래는 AI 업무분석 프롬프트
    //    (2361줄)의 정식 명칭(기구/영업/Tooling/미분류)을 그대로 썼는데, 배지가 좁아서 짧은 영문 약칭
    //    (ME/SAL/TOOL/ETC)으로 바꾸고, Slimming/Cutting은 별도 항목을 없애고 LCM으로 의미를 합쳤다
    //    (Slimming/Cutting이 원래도 LCM 패널 자체의 두께·가공 관련 이슈라 LCM 범주에 속함).
    //    AI가 예전 방식(기구/영업/Tooling/미분류/Slimming/Cutting)으로 이미 만들어둔 [담당구분]... 태그도
    //    있으니, _WBS_DISCIPLINE_ALIASES로 옛 명칭 → 새 배지 값으로 자동 변환해서 읽는다(AI 프롬프트
    //    자체의 분류 기준은 안 건드림 — 배지 표시/순환용 목록만 바뀜).
    // 💡 [2026-08-28 버그 수정] "영업"이 SAL로도, "영업" 그대로도 둘 다 드롭다운에 보인다는 지적 —
    //    AI 자동등록 경로(buildMailTaskRow, 14269줄 부근)가 AI 원본 응답의 정식 명칭(영업/기구/Tooling/
    //    미분류/Slimming/Cutting)을 별칭 변환 없이 row._담당구분에 그대로 저장하고 있었다. row._담당구분이
    //    이미 채워져 있으면(대부분의 AI 등록 업무) 아래 _extractDisciplineFromContent(상세내용 태그에서
    //    별칭 변환하는 경로)는 아예 호출되지 않으므로, 그 값만 변환 없이 그대로 배지에 노출됐던 것.
    //    이제 값을 "쓰는" 시점(등록 시)과 "읽는" 시점(배지 표시) 양쪽 모두 이 별칭표를 거치도록 통일한다.
    //    (SA→SAL: "SA"만으로는 Sales인지 직관적으로 안 와닿는다는 지적 — Sales의 알파벳 3글자라 더 바로 읽힘)
    window.WBS_DISCIPLINE_CATEGORIES = ['PM','ME','HW','FW','BLU','TSP','LCM','TOOL','SAL','CS','FA','ETC'];
    window._WBS_DISCIPLINE_ALIASES = {
        '기구': 'ME', '영업': 'SAL', 'Tooling': 'TOOL', '미분류': 'ETC',
        'Slimming': 'LCM', 'Cutting': 'LCM' // 💡 별도 항목 삭제, 의미는 LCM으로 이동
    };

    // 💡 위 별칭표를 한 곳에서만 적용하도록 뺀 공용 함수 — 등록 시(newRow._담당구분 저장)와 표시 시
    // (배지/드롭다운 렌더링) 양쪽에서 반드시 이 함수를 거쳐야 "SA"와 "영업"처럼 같은 뜻의 값이
    // 서로 다른 문자열로 남아 드롭다운에 중복 표시되는 일이 없다. 이미 짧은 코드(ME/SAL/...)인
    // 값이나 목록에 없는 값은 별칭이 없으므로 그대로 반환.
    window._normalizeWbsDiscipline = function(raw) {
        const s = (raw || '').toString().trim();
        if (!s) return '';
        // 💡 "HW, FW"처럼 콤마로 여러 개 기재된 경우도 각각 변환(AI 프롬프트가 최대 2개까지 허용)
        return s.split(',').map(function(part) {
            const p = part.trim();
            return window._WBS_DISCIPLINE_ALIASES[p] || p;
        }).join(', ');
    };

    // AI 분석 업무는 상세내용 [담당구분]기구 처럼 항상 태그를 남기므로, row._담당구분이 비어있는
    // 과거 업무도 이 태그에서 초기값을 복원할 수 있다(AI 분석 날짜 복원 때 만든 것과 같은 패턴).
    // 옛 정식 명칭으로 남아있는 태그는 위 별칭표로 새 배지 값으로 변환해서 반환한다.
    window._extractDisciplineFromContent = function(row) {
        if (!row) return null;
        const contentStr = colIdx.content !== -1 ? (row[colIdx.content] || '').toString() : '';
        if (!contentStr) return null;
        const m = contentStr.match(/\[담당구분\]([^\n]+)/);
        if (!m) return null;
        return window._normalizeWbsDiscipline(m[1]);
    };

    // 💡 [2026-08-28 → 드롭다운으로 교체] 드롭다운에서 담당구분을 선택하면 row._담당구분 갱신 +
    //    상세내용에 [담당구분]... 태그가 이미 있으면 그 값도 같이 바꿔서 서로 어긋나지 않게 한다
    //    (태그가 원래 없던 수동 입력 업무는 새로 끼워넣지 않음). 기존엔 클릭할 때마다 다음 구분으로
    //    순환하는 toggleWbsDiscipline()이었으나, 목록에서 바로 골라 지정하는 방식으로 바뀌었다.
    window.setWbsDiscipline = function(rowIndex, next) {
        const row = globalData[rowIndex];
        if (!row || !next) return;
        const cur = row._담당구분 || window._extractDisciplineFromContent(row) || '';
        if (cur === next) return;
        row._담당구분 = next;

        if (colIdx.content !== -1 && row[colIdx.content] && /\[담당구분\][^\n]*/.test(row[colIdx.content].toString())) {
            row[colIdx.content] = row[colIdx.content].toString().replace(/\[담당구분\][^\n]*/, '[담당구분]' + next);
        }

        logChange(rowIndex, -1, '담당구분', (cur || '(없음)') + ' → ' + next);
        renderTable(globalData);
        applyFilters();
    };

    function applyFilters() {
        try {
            const tbody = document.getElementById('table-body'); const trs = tbody.getElementsByTagName("tr"); let visibleCount = 1;
            let _wbsHideUntilLevel = null; // 💡 접힌 조상의 하위 트리인 동안 계속 숨김 처리하기 위한 추적 상태
            for (let i = 0; i < trs.length; i++) {
                let tr = trs[i]; let rowIndex = parseInt(tr.dataset.rowIndex, 10); if (isNaN(rowIndex)) continue;
                let rowData = globalData[rowIndex]; if (!rowData) continue;
                let showRow = true;

                // 💡 WBS 접기 상태 확인 — 필터보다 먼저 판정해서 AND로 결합(접혔으면 필터 통과 여부와 무관하게 숨김)
                if (_wbsHideUntilLevel !== null) {
                    if ((rowData._level || 0) > _wbsHideUntilLevel) { showRow = false; }
                    else { _wbsHideUntilLevel = null; }
                }
                if (showRow && rowData._wbsCollapsed) { _wbsHideUntilLevel = rowData._level || 0; }

                if (showRow) {
                    for (let colIndexStr in currentFilters) {
                        let colIndex = parseInt(colIndexStr, 10); let filterSet = currentFilters[colIndex];
                        if (!filterSet.has('All')) {
                            let cellValue = (rowData[colIndex] !== undefined && rowData[colIndex] !== null) ? rowData[colIndex].toString().trim() : '';
                    if (colIndex === colIdx.status) {
                        const sMap = (typeof LANG !== 'undefined' && window._currentLang && LANG[window._currentLang]) ? LANG[window._currentLang].statusMap : null;
                        cellValue = (sMap && sMap[cellValue]) || cellValue;
                    }
                    if (!filterSet.has(cellValue)) { showRow = false; break; }
                        }
                    }
                }

                if (showRow) {
                    tr.style.display = "";
                    // 💡 필터 적용 후 "보이는 행" 순서 기준으로 줄무늬 다시 매기기
                    tr.classList.remove('gantt-zebra-b');
                    if ((visibleCount - 1) % 2 === 1) tr.classList.add('gantt-zebra-b');
                    let noTd = tr.querySelector('.no-td'); 
                    if (noTd) { 
                        let span = noTd.querySelector('.row-num-span');
                        if(span) span.textContent = visibleCount++; else noTd.textContent = visibleCount++; 
                    } else if (tr.cells.length > 0) { tr.cells[0].textContent = visibleCount++; }
                    let chartTd = tr.querySelector('.chart-td'); if (chartTd) { chartTd.innerHTML = createStatusChart(rowData._calcStartTs, rowData._calcPlanTs, rowData[colIdx.status], rowData._level, window.getRowCompareInfo ? window.getRowCompareInfo(rowData) : null); }
                } else { tr.style.display = "none"; }
            }
            // 💡 전역 타이틀 및 파일명 동적 주입 스케줄러 명시 호출
            if (typeof window.updatePrintTitle === 'function') window.updatePrintTitle(); 
            updateFilterVisibility();
        } catch(e) { console.error("Filter Apply Error: ", e); }
    }

    function updateFilterVisibility() {
        filterColumns.forEach(col => {
            let validValues = new Set();
            for (let i = 1; i < globalData.length; i++) {
                let rowData = globalData[i]; if (!rowData || rowData.join('').trim() === '') continue;
                let val = rowData[col.index]; if (val !== undefined && val !== null && val.toString().trim() !== '') { validValues.add(val.toString().trim()); }
            }
            const groupDiv = document.getElementById('filter-group-' + col.index);
            if (groupDiv) {
                const btns = groupDiv.querySelectorAll('.btn:not(.btn-all)');
                btns.forEach(btn => {
                    let btnValue = btn.dataset.value;
                    if (col.name === '개발단계') { btn.style.display = 'inline-block'; if (!validValues.has(btnValue) && !btn.classList.contains('active')) btn.classList.add('dimmed'); else btn.classList.remove('dimmed'); }
                    else if (col.name === '업무상태') { btn.style.display = 'inline-block'; btn.classList.remove('dimmed'); }
                    else { if (validValues.has(btnValue) || btn.classList.contains('active')) btn.style.display = 'inline-block'; else btn.style.display = 'none'; }
                });
            }
        });
    }

    function updateFilter(event, colIndex, value, groupDiv) {
        const btn = event.currentTarget; const filterSet = currentFilters[colIndex]; const allBtn = groupDiv.querySelector('.btn-all');
        if (value === 'All') { filterSet.clear(); filterSet.add('All'); const btns = groupDiv.querySelectorAll('.btn'); btns.forEach(b => b.classList.remove('active')); allBtn.classList.add('active'); } 
        else {
            if (filterSet.has('All')) { filterSet.delete('All'); allBtn.classList.remove('active'); }
            if (filterSet.has(value)) { filterSet.delete(value); btn.classList.remove('active'); } else { filterSet.add(value); btn.classList.add('active'); }
            if (filterSet.size === 0) { filterSet.add('All'); allBtn.classList.add('active'); }
        }
        applyFilters();
    }

    function exportToExcel() {
        if (globalData.length <= 1) { alert("다운로드할 데이터가 없습니다. 먼저 엑셀 파일을 선택하여 병합해주세요."); return; }
        // ── GanttChart 시트: 웹 화면과 동일 구성 ──
        const _hdrContent = (colIdx.content !== -1 && globalData[0][colIdx.content]) ? globalData[0][colIdx.content] : '업무 상세내용';
        // 💡 텍스트 막대(유니코드 블록)로 웹의 현황 막대 위치를 흉내냄 — 전체 타임라인 기준, 총 20칸
        const BAR_LEN = 20;
        function _textStatusBar(startTs, planTs, statusVal) {
            const viewStart = window.ganttViewStartTs, viewDur = window.ganttViewDuration;
            if (!viewStart || !viewDur || (!startTs && !planTs)) return '';
            let ts0 = startTs, ts1 = planTs || startTs; if (ts1 < ts0) ts1 = ts0;
            const startPct = Math.max(0, Math.min(1, (ts0 - viewStart) / viewDur));
            const endPct   = Math.max(0, Math.min(1, (ts1 - viewStart) / viewDur));
            let startCell = Math.round(startPct * BAR_LEN);
            let endCell   = Math.round(endPct * BAR_LEN);
            if (endCell <= startCell) endCell = startCell + 1;
            const s = String(statusVal || '').toLowerCase();
            const mark = (s.includes('취소') || s.includes('cancel') || s.includes('드랍') || s.includes('drop')) ? '▓' : '█';
            let bar = '';
            for (let k = 0; k < BAR_LEN; k++) bar += (k >= startCell && k < endCell) ? mark : '░';
            return bar;
        }
        let exportData = [['NO', 'LEVEL(WBS)', '시작', '완료', '소요일', '상태', '개발업무 (WBS)', _hdrContent, '현황']];
        let ganttL0Rows = [];
        let rowNumCounter = 1;
        for (let i = 1; i < globalData.length; i++) {
            let row = globalData[i]; if (!row) continue;
            const lv = row._level !== undefined ? row._level : 0;
            const prefix = lv > 0 ? (row._isLastChild ? '└ ' : '├ ') : '';
            let taskTxt = lv === 0 ? row._origDev : lv === 1 ? row._origT1 : lv === 2 ? row._origT2 : lv === 3 ? row._origT3 : row._origT4;
            if (taskTxt === undefined || taskTxt === null) taskTxt = '';
            const indent = new Array(lv + 1).join('  ');
            const startVal = (lv === 0 || row._startForced || !row._finalDuration) ? (row._calcStartTs ? formatTsToYMD(row._calcStartTs) : '') : '';
            const planVal  = (lv === 0 || row._planForced  || !row._finalDuration) ? (row._calcPlanTs  ? formatTsToYMD(row._calcPlanTs)  : '') : '';
            const days = countWorkingDays(row._calcStartTs, row._calcPlanTs);
            const statusVal  = colIdx.status  !== -1 ? (row[colIdx.status]  || '') : '';
            const contentVal = colIdx.content !== -1 ? (row[colIdx.content] || '') : '';
            const barVal = _textStatusBar(row._calcStartTs, row._calcPlanTs, statusVal);
exportData.push([rowNumCounter, lv, startVal, planVal, days, statusVal, indent + prefix + taskTxt, contentVal, barVal]);
            if (lv === 0) ganttL0Rows.push(exportData.length - 1);
            rowNumCounter++;
        }
        const ws = XLSX.utils.aoa_to_sheet(exportData);
        ws['!cols'] = [{wch:5},{wch:10},{wch:11},{wch:11},{wch:7},{wch:8},{wch:34},{wch:55},{wch:24}];
        (function() {
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let r = 1; r <= range.e.r; r++) {
                const isL0 = ganttL0Rows.indexOf(r) !== -1;
                for (let c = 0; c <= range.e.c; c++) {
                    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
                    if (!cell) continue;
                    cell.s = {
                        font: c === 8
                            ? { name: "Consolas", sz: 11, bold: true, color: { rgb: window._cpXlsxRole('darkText') } }
                            : { name: "맑은 고딕", sz: 10, bold: isL0, color: { rgb: "1F2937" } },
                        fill: isL0 ? { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('headerTint') } }
                                : (r % 2 === 0 ? { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('zebraB') } } : undefined),
                        alignment: { vertical: "center", horizontal: c <= 5 ? "center" : (c === 8 ? "center" : "left"), wrapText: c === 7 }
                    };
                }
            }
        })();

        const wb = XLSX.utils.book_new();

        // 💡 엑셀 출력 직전, 신규 탭(Summary/Brief SPEC/M.C Table)에 입력된 최신 내용을
        //    projectMeta / tabData로 동기화한다 (탭을 이동하지 않고 바로 저장해도 반영되도록)
        if (window.collectTabData) window.collectTabData();
        const tabData = window.tabData || {};

        // ── Summary 시트 (프로젝트 정보 + 프로젝트 개요 + 마일스톤, 통합) ──
        const meta = window.projectMeta || {};
        const sd = tabData.summary || {};
        // ── Summary 시트: 웹 페이지와 동일 배치 ──
        const M = function(k, f) { const m = (sd.milestones && sd.milestones[k]) || {}; return m[f] || ''; };
        const ktkCombined = (meta.KTKPN || '') + (meta.KTK모델명 ? '_' + meta.KTK모델명 : '');
        const summaryData = [
            /* 0*/ ['구분', 'PROTO', '', '', 'ES', '', '', 'PP', '', ''],
            /* 1*/ ['', 'Start', 'End', 'DR', 'Start', 'End', 'DVR', 'Start', 'End', 'PRA'],
            /* 2*/ ['계획', M('기획Start','date'), M('기획Finish','date'), M('ProtoDR','date'), M('ESStart','date'), M('ESEnd','date'), M('DVR','date'), M('PPStart','date'), M('PPEnd','date'), M('PRA','date')],
            /* 3*/ ['실적', M('기획Start','actualDate'), M('기획Finish','actualDate'), M('ProtoDR','actualDate'), M('ESStart','actualDate'), M('ESEnd','actualDate'), M('DVR','actualDate'), M('PPStart','actualDate'), M('PPEnd','actualDate'), M('PRA','actualDate')],
            /* 4*/ ['개발기간(일)', sd.devDays || '', '', '', '현재 M.C 리비전', tabData.mcActiveRevision || 'R1', '', '', '', ''],
            /* 5*/ [],
            /* 6*/ ['프로젝트 개요', '', '', '', '프로젝트 정보', '', '', '', '', ''],
            /* 7*/ ['적용 목적', sd.purpose || '', '', '', '고객사', meta.고객사 || '', '', '', '', ''],
            /* 8*/ ['연간 수요량', sd.volume || '', '', '', '고객 모델명', meta.고객모델명 || meta.모델명 || '', '', '', '', ''],
            /* 9*/ ['목표 양산 일정', sd.mpDate || '', '', '', '프로젝트 코드', meta.프로젝트코드 || '', '', '', '', ''],
            /*10*/ ['', '', '', '', '프로젝트 명칭', meta.프로젝트명 || '', '', '', '', ''],
            /*11*/ ['', '', '', '', 'KTK PN_모델명', ktkCombined, '', '', '', ''],
            /*12*/ ['', '', '', '', '인치', meta.인치 || '', '', '', '', ''],
            /*13*/ [],
            /*14*/ ['추진 배경 및 의의', '', '', '', '', '', '', '', '', ''],
            /*15*/ [sd.background || '', '', '', '', '', '', '', '', '', ''],
            /*16*/ [],
            /*17*/ ['프로젝트 멤버-1', '', '', '', '프로젝트 멤버-2', '', '', '', '', ''],
            /*18*/ ['프로젝트 담당자', meta.프로젝트담당자 || '', meta.프로젝트담당자이메일 || '', '', 'TSP 담당자', meta.TSP담당자 || '', meta.TSP담당자이메일 || '', '', '', ''],
            /*19*/ ['기구 담당자', meta.기구담당자 || '', meta.기구담당자이메일 || '', '', 'LCM 담당자', meta.LCM담당자 || '', meta.LCM담당자이메일 || '', '', '', ''],
            /*20*/ ['H/W 담당자', meta.HW담당자 || '', meta.HW담당자이메일 || '', '', 'Slimming 담당자', meta.Slimming담당자 || '', meta.Slimming담당자이메일 || '', '', '', ''],
            /*21*/ ['F/W 담당자', meta.FW담당자 || '', meta.FW담당자이메일 || '', '', 'Cutting 담당자', meta.Cutting담당자 || '', meta.Cutting담당자이메일 || '', '', '', ''],
            /*22*/ ['BLU 담당자', meta.Module담당자 || '', meta.Module담당자이메일 || '', '', 'Tooling 담당자', meta.Tooling담당자 || '', meta.Tooling담당자이메일 || '', '', '', ''],
        ];
        // 💡 프로젝트 멤버-3 (자유 추가 인원)
        const member3 = tabData.projectMembers3 || [];
        if (member3.length) {
            summaryData.push([]);
            summaryData.push(['프로젝트 멤버-3', '', '', '', '', '', '', '', '', '']);
            for (let i = 0; i < member3.length; i += 2) {
                const a = member3[i], b = member3[i + 1];
                summaryData.push([
                    a.role || '', a.name || '', a.email || '', '',
                    b ? (b.role || '') : '', b ? (b.name || '') : '', b ? (b.email || '') : '', '', '', ''
                ]);
            }
        }
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        wsSummary['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },   // 구분
            { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },   // PROTO
            { s: { r: 0, c: 4 }, e: { r: 0, c: 6 } },   // ES
            { s: { r: 0, c: 7 }, e: { r: 0, c: 9 } },   // PP
            { s: { r: 14, c: 0 }, e: { r: 14, c: 9 } }, // 추진 배경 제목
            { s: { r: 15, c: 0 }, e: { r: 15, c: 9 } }, // 추진 배경 내용
        ];
        (function() {
            const NAVYS = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
            const rowFill = function(r, rgb) {
                for (let c = 0; c <= 9; c++) { const cell = wsSummary[XLSX.utils.encode_cell({ r: r, c: c })]; if (!cell) continue;
                    cell.s = { font: { name: "맑은 고딕", sz: 10, bold: c === 0 }, fill: { patternType: "solid", fgColor: { rgb: rgb } }, alignment: { vertical: "center", horizontal: "center", wrapText: true } }; }
            };
            for (let c = 0; c <= 9; c++) { [0, 1].forEach(function(r) { const cell = wsSummary[XLSX.utils.encode_cell({ r: r, c: c })]; if (cell) cell.s = NAVYS; }); }
            rowFill(2, 'F4F6F8');  // 계획 — 웹 #f4f6f8
            rowFill(3, 'FFF8E6');  // 실적 — 웹 #fff8e6
            const member3TitleRow = summaryData.findIndex(function(row) { return row[0] === '프로젝트 멤버-3'; });
            const navyRows = member3TitleRow === -1 ? [6, 14, 17] : [6, 14, 17, member3TitleRow];
            navyRows.forEach(function(r) { for (let c = 0; c <= 9; c++) { const cell = wsSummary[XLSX.utils.encode_cell({ r: r, c: c })]; if (cell && String(cell.v || '') !== '') cell.s = NAVYS; } });
        })();
        wsSummary['!cols'] = [{wch:16},{wch:22},{wch:24},{wch:6},{wch:16},{wch:24},{wch:24},{wch:11},{wch:11},{wch:11}];
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        // ── Brief SPEC 시트 (컨셉 단계) ──
        const briefSpecData = [['NO', 'TYPE', '', 'Model A', 'Model B', 'Model C', 'Note']];
        (tabData.briefSpec || []).forEach((r, i) => { briefSpecData.push([i + 1, r.type || '', r.sub || '', r.modelA || r.desc || '', r.modelB || '', r.modelC || '', r.note || '']); });
        const wsBrief = XLSX.utils.aoa_to_sheet(briefSpecData);
        // 💡 스타일은 공통 applyExcelStyles가 일괄 처리 (헤더 흰색/남색, 지브라 등)
        wsBrief['!cols'] = [{wch: 6}, {wch: 22}, {wch: 14}, {wch: 35}, {wch: 30}];
        XLSX.utils.book_append_sheet(wb, wsBrief, "Customer SPEC"); // 💡 [2026-08-29] 표시명 변경(구 "Brief SPEC") — 재가져오기 매칭은 parseConceptSheetsFromWorkbook의 구 시트명 호환 참고

                // ── MC 종류별(기본 + 추가된 종류) 반복: Comparison + R1~R5 시트 ──
        // 💡 제품구분자가 하나라도 있으면 그것들만 순회(이름 없는 "기본" 자리는 이제 존재하지 않음).
        //    아직 제품구분자를 하나도 안 쓰는(단일종류) 프로젝트만 예전처럼 ''(이름 없음) 하나로 저장.
        (window.getMcUnits().length ? window.getMcUnits() : ['']).forEach(function(_mcUnitKey) {
            // 💡 이 종류의 저장소를 잠깐 가리키게 함 (화면 상태는 안 건드림)
            window.tabData.mcRevisionsByUnit = window.tabData.mcRevisionsByUnit || {};
            window.tabData.mcSalesPriceDetailByUnit = window.tabData.mcSalesPriceDetailByUnit || {};
            const _mcRevSrc = _mcUnitKey ? (window.tabData.mcRevisionsByUnit[_mcUnitKey] || {}) : (window.tabData.mcRevisions || {});
            const _mcSalesSrc = _mcUnitKey ? (window.tabData.mcSalesPriceDetailByUnit[_mcUnitKey] || {}) : (window.tabData.mcSalesPriceDetail || {});
            const _mcHasData = Object.keys(_mcRevSrc).some(function(k) { return _mcRevSrc[k] && _mcRevSrc[k].length; });
            if (_mcUnitKey && !_mcHasData) return; // 추가는 됐지만 데이터가 전혀 없는 종류는 시트 생성 안 함

            const _mcPrevRevisions = tabData.mcRevisions, _mcPrevSales = tabData.mcSalesPriceDetail;
            const _mcPrevActiveUnit = window.mcActiveUnit; // 💡 Note 저장소도 이 종류 기준으로 바뀌도록 잠깐 전환
            tabData.mcRevisions = _mcRevSrc; tabData.mcSalesPriceDetail = _mcSalesSrc;
            window.mcActiveUnit = _mcUnitKey;
            const _mcSuffix = _mcUnitKey ? ('-' + _mcUnitKey) : '';

            // ── MC Comparison 시트 (R1~R5 비교 + 영업판가 + 재료비율) ──
            if (window.mcBuildComparisonRows) {
                const compRows = window.mcBuildComparisonRows();
                const revs = window._mcRevList(tabData.mcRevisions || {}, { onlyWithMoney: true, desc: true });
                const compSalesPrice = {};
                revs.forEach(function(rev) {
                    const detail = (tabData.mcSalesPriceDetail && tabData.mcSalesPriceDetail[rev]) || {};
                    const n = parseFloat(String(detail.mpCost || '').replace(/[^0-9.-]+/g, ''));
                    compSalesPrice[rev] = isNaN(n) ? 0 : n;
                });
                const header1 = ['TYPE', 'ITEM', 'GROUP'];
                const header2 = ['', '', ''];
                revs.forEach(function(rev) { header1.push(rev + ' MP', ''); header2.push('Cost($)', 'NRE'); });
                header1.push('Note'); header2.push('');
                const compData = [header1, header2];
                const totals = {}; revs.forEach(function(rev) { totals[rev] = { cost: 0, nre: 0 }; });

                let compCurType = '';
                const compGroupSubtotal = {}; revs.forEach(function(rev) { compGroupSubtotal[rev] = { cost: 0, nre: 0 }; });
                const compSubtotalRowIdx = [];
                const compTypeMerges = [];
                let compSegStartRow = compData.length;
                compRows.forEach(function(r, idx) {
                    const rt = String(r.type || '').trim();
                    if (rt) compCurType = rt;
                    const row = [r.type, r.item, r.group];
                    revs.forEach(function(rev) {
                        const p = r.prices[rev] || { cost: 0, nre: 0 };
                        row.push(p.cost || '', p.nre || '');
                        totals[rev].cost += p.cost; totals[rev].nre += p.nre;
                        compGroupSubtotal[rev].cost += p.cost; compGroupSubtotal[rev].nre += p.nre;
                    });
                    row.push(r.note || '');
                    compData.push(row);
                    const compCurRowIdx = compData.length - 1;

                    const itemHasEtc = /\betc\b|\bNRE\b/.test(String(r.item || ''));
                    const nextRow = compRows[idx + 1];
                    const nextType = nextRow ? String(nextRow.type || '').trim() : '';
                    const isLastRow = !nextRow;
                    const typeWillChange = !!(nextRow && nextType && nextType !== compCurType);
                    if (compCurType && (itemHasEtc || typeWillChange || isLastRow)) {
                        if (compCurRowIdx > compSegStartRow) {
                            compTypeMerges.push({ s: { r: compSegStartRow, c: 0 }, e: { r: compCurRowIdx, c: 0 } });
                        }
                        const subRow = [compCurType + ' SUBTOTAL', '', ''];
                        revs.forEach(function(rev) { subRow.push(compGroupSubtotal[rev].cost || '', compGroupSubtotal[rev].nre || ''); });
                        subRow.push('');
                        compSubtotalRowIdx.push(compData.length);
                        compData.push(subRow);
                        revs.forEach(function(rev) { compGroupSubtotal[rev] = { cost: 0, nre: 0 }; });
                        compSegStartRow = compData.length;
                    }
                });

                const totalRow = ['TOTAL(M.C)', '', ''];
                revs.forEach(function(rev) { totalRow.push(totals[rev].cost, totals[rev].nre); });
                totalRow.push('');
                compData.push(totalRow);
                const salesRow = ['영업판가', '', ''];
                revs.forEach(function(rev) { salesRow.push(compSalesPrice[rev] || '', ''); });
                salesRow.push('');
                compData.push(salesRow);
                const ratioRow = ['재료비율 (M.C ÷ 영업판가) [%]', '', ''];
                revs.forEach(function(rev) {
                    const sp = compSalesPrice[rev] || 0;
                    ratioRow.push(sp > 0 ? (totals[rev].cost / sp * 100).toFixed(1) : '', '');
                });
                ratioRow.push('');
                compData.push(ratioRow);

                const wsComp = XLSX.utils.aoa_to_sheet(compData);
                wsComp['!merges'] = [
                    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
                    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
                ];
                revs.forEach(function(rev, i) { const c0 = 3 + i * 2; wsComp['!merges'].push({ s: { r: 0, c: c0 }, e: { r: 0, c: c0 + 1 } }); });
                wsComp['!merges'].push({ s: { r: 0, c: 3 + revs.length * 2 }, e: { r: 1, c: 3 + revs.length * 2 } });
                const compSummaryRows = compSubtotalRowIdx.map(function(r) { return { r: r, color: 'FFF9C4' }; }).concat([
                    { r: compData.length - 3, color: 'E3F2FD' },
                    { r: compData.length - 2, color: 'E8F5E9' },
                    { r: compData.length - 1, color: 'FFE0B2' },
                ]);
                compSummaryRows.forEach(function(s) { wsComp['!merges'].push({ s: { r: s.r, c: 0 }, e: { r: s.r, c: 2 } }); });
                compTypeMerges.forEach(function(m) { wsComp['!merges'].push(m); });
                for (let r = 0; r <= 1; r++) {
                    for (let c = 0; c < header1.length; c++) {
                        const h = wsComp[XLSX.utils.encode_cell({ r: r, c: c })];
                        if (h) h.s = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
                    }
                }
                const compRange = XLSX.utils.decode_range(wsComp['!ref']);
                for (let r = 2; r <= compRange.e.r; r++) {
                    const sum = compSummaryRows.find(function(s) { return s.r === r; });
                    for (let c = 0; c <= compRange.e.c; c++) {
                        const cell = wsComp[XLSX.utils.encode_cell({ r: r, c: c })];
                        if (!cell) continue;
                        if (c >= 3 && typeof cell.v === 'number') cell.z = '"$"#,##0.00';
                        if (sum) {
                            cell.s = {
                                font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "333333" } },
                                fill: { patternType: "solid", fgColor: { rgb: sum.color } },
                                alignment: { vertical: "center", horizontal: c === 0 ? "right" : "center" }
                            };
                        } else if (c === 0) {
                            cell.s = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
                        }
                    }
                }
                wsComp['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 16 }];
                XLSX.utils.book_append_sheet(wb, wsComp, "MC Comparison" + _mcSuffix);
            }

            const mcRevisionsForExport = tabData.mcRevisions || {};
            // 💡 참조 템플릿에서 온 TYPE/ITEM 라벨만 있고 금액이 전부 빈 "껍데기 행"은
            //    실제 데이터로 치지 않음 — Cost/NRE 중 하나라도 값이 있어야 "데이터 있음"으로 간주
            const _mcHasRealMoney = function(rows) {
                if (!rows || !rows.length) return false;
                const moneyFields = ['protoCost', 'protoNre', 'protoBCost', 'protoBNre', 'mpCost', 'mpNre'];
                return rows.some(function(r) {
                    return moneyFields.some(function(f) { return r[f] !== undefined && r[f] !== null && String(r[f]).trim() !== ''; });
                });
            };
            window._mcRevList(mcRevisionsForExport).forEach(function(rev) {
                const rows = mcRevisionsForExport[rev] || (rev === 'R1' && !_mcUnitKey ? tabData.mcTable : null);
                if (rev !== 'R1' && !_mcHasRealMoney(rows)) return; // R1은 골격 유지용으로 항상 저장, 나머지는 실제 금액 있을 때만
                const sheetName = 'M.C Table' + _mcSuffix + ' ' + rev;
                XLSX.utils.book_append_sheet(wb, _buildMcSheet(rows, rev, _mcUnitKey), sheetName);
            });

            tabData.mcRevisions = _mcPrevRevisions; tabData.mcSalesPriceDetail = _mcPrevSales;
            window.mcActiveUnit = _mcPrevActiveUnit; // 💡 화면 상태 원복
        });
        function _buildMcSheet(rows, rev, unitLabel) {
            const num = function(v) { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[^0-9.-]+/g, '')); return isNaN(n) ? 0 : n; };
            const cellMoney = function(v) { const n = num(v); return n === 0 ? '' : n; };
            // 💡 견적 마지막 수정 날짜 — 이 리비전(rev)의 마지막 변경이력 시각 (없으면 '-')
            const revChangeLogs = (tabData.mcChangeLog || []).filter(function(l) { return l.rev === rev; });
            const mcLatestDate = revChangeLogs.length ? revChangeLogs[revChangeLogs.length - 1].time : '-';
            const _mcUnitTag = unitLabel ? '[' + unitLabel + ']' : '';
            const mcData = [
                ['TYPE', 'ITEM', 'GROUP', 'P/N', 'Specification', _mcUnitTag + 'PROTO A', '', _mcUnitTag + 'PROTO B', '', _mcUnitTag + 'MP', '', (window._currentLang === 'en' ? 'Last Modified: ' : '최종수정: ') + mcLatestDate],
                ['', '', '', '', '', 'Cost($)', 'NRE', 'Cost($)', 'NRE', 'Cost($)', 'NRE', 'Note'],
            ];
            const valid = (rows || []).filter(function(r) { const t = String(r.type || '').toUpperCase().replace(/\s/g, ''); return t !== 'SUBTOTAL' && t !== 'TOTAL'; });
            let lastType = '';
            const typed = valid.map(function(r) { const t = String(r.type || '').trim(); if (t) lastType = t; return lastType; });
            const zero = function() { return { pc: 0, pn: 0, bc: 0, bn: 0, mc: 0, mn: 0 }; };
            let sub = zero(), grand = zero(), curType = '';
            const summaryRows = [];
            const typeMerges = [];
            let segStartRow = mcData.length;
            valid.forEach(function(r, idx) {
                curType = typed[idx] || curType;
                mcData.push([String(r.type || ''), r.item || '', r.group || '', r.pn || '', r.spec || '', cellMoney(r.protoCost), cellMoney(r.protoNre), cellMoney(r.protoBCost), cellMoney(r.protoBNre), cellMoney(r.mpCost), cellMoney(r.mpNre), r.note || '']);
                const curRowIdx = mcData.length - 1;
                sub.pc += num(r.protoCost); sub.pn += num(r.protoNre); sub.bc += num(r.protoBCost); sub.bn += num(r.protoBNre); sub.mc += num(r.mpCost); sub.mn += num(r.mpNre);
                grand.pc += num(r.protoCost); grand.pn += num(r.protoNre); grand.bc += num(r.protoBCost); grand.bn += num(r.protoBNre); grand.mc += num(r.mpCost); grand.mn += num(r.mpNre);
                const itemHasEtc = /\betc\b|\bNRE\b/.test(String(r.item || ''));
                const nextType = idx + 1 < typed.length ? typed[idx + 1] : '';
                const isLast = idx === valid.length - 1;
                if (curType && (itemHasEtc || isLast || (nextType && nextType !== curType))) {
                    if (curRowIdx > segStartRow) {
                        typeMerges.push({ s: { r: segStartRow, c: 0 }, e: { r: curRowIdx, c: 0 } });
                    }
                    mcData.push([curType + ' SUBTOTAL', '', '', '', '', sub.pc, sub.pn, sub.bc, sub.bn, sub.mc, sub.mn, '']);
                    summaryRows.push({ r: mcData.length - 1, color: 'FFF9C4' });
                    sub = zero();
                    segStartRow = mcData.length;
                }
            });
            mcData.push(['TOTAL(M.C)', '', '', '', '', grand.pc, grand.pn, grand.bc, grand.bn, grand.mc, grand.mn, '']);
            summaryRows.push({ r: mcData.length - 1, color: 'E3F2FD' });
            const sp = ((tabData.mcSalesPriceDetail || {})[rev]) || {};
            const spv = function(f) { return num(sp[f]); };
            mcData.push(['영업판가', '', '', '', '', spv('protoCost') || '', spv('protoNre') || '', spv('protoBCost') || '', spv('protoBNre') || '', spv('mpCost') || '', spv('mpNre') || '', '']);
            summaryRows.push({ r: mcData.length - 1, color: 'E8F5E9' });
            const ratio = function(tot, f) { const s = spv(f); return s > 0 ? (tot / s * 100).toFixed(1) + '%' : '-'; };
            mcData.push(['재료비율 (M.C ÷ 영업판가) [%]', '', '', '', '', ratio(grand.pc, 'protoCost'), ratio(grand.pn, 'protoNre'), ratio(grand.bc, 'protoBCost'), ratio(grand.bn, 'protoBNre'), ratio(grand.mc, 'mpCost'), ratio(grand.mn, 'mpNre'), '']);
            summaryRows.push({ r: mcData.length - 1, color: 'FFE0B2' });

            const wsMc = XLSX.utils.aoa_to_sheet(mcData);
            wsMc['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
                { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
                { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
                { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } }, { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } },
                { s: { r: 0, c: 9 }, e: { r: 0, c: 10 } },
            ];
            summaryRows.forEach(function(s) { wsMc['!merges'].push({ s: { r: s.r, c: 0 }, e: { r: s.r, c: 4 } }); });
            typeMerges.forEach(function(m) { wsMc['!merges'].push(m); });
            for (let c = 0; c <= 11; c++) {
                const h2 = wsMc[XLSX.utils.encode_cell({ r: 1, c: c })];
                if (h2) h2.s = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
            }
            // 💡 Note 헤더 상단 셀(최종수정 날짜)만 우측 정렬 — 나머지 헤더는 기본 중앙정렬 유지
            const noteDateCell = wsMc[XLSX.utils.encode_cell({ r: 0, c: 11 })];
            if (noteDateCell) noteDateCell.s = { alignment: { vertical: "center", horizontal: "right" } };
            const range = XLSX.utils.decode_range(wsMc['!ref']);
            for (let r = 2; r <= range.e.r; r++) {
                const sum = summaryRows.find(function(s) { return s.r === r; });
                for (let c = 0; c <= range.e.c; c++) {
                    const cell = wsMc[XLSX.utils.encode_cell({ r: r, c: c })];
                    if (!cell) continue;
                    if (c >= 5 && c <= 10 && typeof cell.v === 'number') cell.z = '"$"#,##0.00';
                    if (sum) {
                        cell.s = {
                            font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "333333" } },
                            fill: { patternType: "solid", fgColor: { rgb: sum.color } },
                            alignment: { vertical: "center", horizontal: c === 0 ? "right" : "center" }
                        };
                    } else if (c === 0) {
                        cell.s = { font: { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('darkText') } }, alignment: { vertical: "center", horizontal: "center" } };
                    }
                }
            }
            wsMc['!cols'] = [{wch:12},{wch:18},{wch:16},{wch:12},{wch:36},{wch:11},{wch:10},{wch:11},{wch:10},{wch:11},{wch:10},{wch:30}];
            return wsMc;
        }
        
        // ── M.C 수정이력 시트 ──
        const mcLogs = tabData.mcChangeLog || [];
        if (mcLogs.length) {
            const mcLogData = [['변경 일시', '수정자', '리비전', '항목', '필드', '변경 전 (Old)', '변경 후 (New)']];
            mcLogs.forEach(function(log) {
                mcLogData.push([log.time, log.userName || '알 수 없음', log.rev, log.row, log.field, log.oldVal, log.newVal]);
            });
            const wsMcLog = XLSX.utils.aoa_to_sheet(mcLogData);
            wsMcLog['!cols'] = [{wch: 20}, {wch: 14}, {wch: 8}, {wch: 20}, {wch: 12}, {wch: 30}, {wch: 30}];
            XLSX.utils.book_append_sheet(wb, wsMcLog, "M.C 수정이력");
        }

        // ── Elec Parts 시트 — PANEL/CONV/AD BD 비교표의 "선택 모델·Note·수정이력"을 백업/복원 ──
        //    💡 [2026-08-28 신규] 실제 스펙 데이터는 팀 공용 라이브러리(Drive JSON)에 있어 프로젝트
        //    엑셀엔 필요 없지만, "이 프로젝트가 무슨 모델을 비교표에 골라뒀는지"는 프로젝트별 정보라
        //    여기 없으면 엑셀로 백업→복원 시 통째로 사라진다. ## 구획 표시로 섹션을 나누고,
        //    가져오기(_parseElecPartsSheetFromWorkbook)도 이 구조를 그대로 되읽는다.
        (function() {
            const epTypeLabel = { panel: 'PANEL', convbd: 'CONV', adbd: 'AD BD' };
            const pc = tabData.panelCompare || { selectedModels: [], notes: {} };
            const ecAll = tabData.elecCompare || {};
            const selByType = {
                panel: pc.selectedModels || [],
                convbd: (ecAll.convbd && ecAll.convbd.selectedModels) || [],
                adbd: (ecAll.adbd && ecAll.adbd.selectedModels) || []
            };
            const notesByType = {
                panel: pc.notes || {},
                convbd: (ecAll.convbd && ecAll.convbd.notes) || {},
                adbd: (ecAll.adbd && ecAll.adbd.notes) || {}
            };
            const logsByType = {
                panel: tabData.panelCompareChangeLog || [],
                convbd: (tabData.elecCompareChangeLog && tabData.elecCompareChangeLog.convbd) || [],
                adbd: (tabData.elecCompareChangeLog && tabData.elecCompareChangeLog.adbd) || []
            };
            const epData = [
                ['ELEC PARTS DATA'],
                ['## SELECTED MODELS'],
                ['TYPE', 'MODELS (comma-separated)'],
                ['PANEL', selByType.panel.join(',')],
                ['CONV', selByType.convbd.join(',')],
                ['AD BD', selByType.adbd.join(',')],
                [],
                ['## NOTES'],
                ['TYPE', 'LABEL', 'NOTE'],
            ];
            ['panel', 'convbd', 'adbd'].forEach(function(t) {
                Object.keys(notesByType[t]).forEach(function(label) {
                    const v = notesByType[t][label];
                    if (v) epData.push([epTypeLabel[t], label, v]);
                });
            });
            epData.push([], ['## CHANGE LOG'], ['TYPE', '변경 일시', '수정자', '항목', '필드', '변경 전 (Old)', '변경 후 (New)']);
            ['panel', 'convbd', 'adbd'].forEach(function(t) {
                logsByType[t].forEach(function(log) {
                    epData.push([epTypeLabel[t], log.time, log.userName || '알 수 없음', log.row, log.field, log.oldVal, log.newVal]);
                });
            });
            const hasAnyData = selByType.panel.length || selByType.convbd.length || selByType.adbd.length
                || Object.keys(notesByType.panel).length || Object.keys(notesByType.convbd).length || Object.keys(notesByType.adbd).length
                || logsByType.panel.length || logsByType.convbd.length || logsByType.adbd.length;
            if (hasAnyData) {
                const wsEp = XLSX.utils.aoa_to_sheet(epData);
                wsEp['!cols'] = [{wch: 10}, {wch: 40}, {wch: 16}, {wch: 20}, {wch: 12}, {wch: 26}, {wch: 26}];
                XLSX.utils.book_append_sheet(wb, wsEp, "Elec Parts");
            }
        })();

        XLSX.utils.book_append_sheet(wb, ws, "GanttChart");

        if (window.changeLogs && window.changeLogs.length > 0) {
            let logData = [['변경 일시', '수정자', 'No (행)', '변경 항목', '변경 전 (Old)', '변경 후 (New)']];
            window.changeLogs.forEach(log => { logData.push([log.time, log.userName || "알 수 없음", log.rowName, log.colName, log.oldVal, log.newVal]); });
            const wsLog = XLSX.utils.aoa_to_sheet(logData);
            // 💡 스타일은 공통 applyExcelStyles가 일괄 처리
            wsLog['!cols'] = [{wch: 22}, {wch: 15}, {wch: 12}, {wch: 15}, {wch: 35}, {wch: 35}]; 
            XLSX.utils.book_append_sheet(wb, wsLog, "Gantt 수정이력");
        }

        // ── 알림메일 시트: _알림 체크된 행만 모아 정리 (발송 로직은 별도 단계) ──
        const alarmRows = globalData.slice(1).filter(row => row && row._알림);
        if (alarmRows.length > 0) {
            const taskName = (row) => {
                if (row._level === 0) return row._origDev || "";
                if (row._level === 1) return row._origT1 || "";
                if (row._level === 2) return row._origT2 || "";
                if (row._level === 3) return row._origT3 || "";
                if (row._level === 4) return row._origT4 || "";
                return "";
            };
            let alarmData = [['업무명', '시작일', '완료일', '상태', '상세내용']];
            alarmRows.forEach(row => {
                alarmData.push([
                    taskName(row),
                    row._calcStartTs ? formatTsToYMD(row._calcStartTs) : "",
                    row._calcPlanTs ? formatTsToYMD(row._calcPlanTs) : "",
                    colIdx.status !== -1 ? (row[colIdx.status] || "") : "",
                    colIdx.content !== -1 ? (row[colIdx.content] || "") : ""
                ]);
            });
            const wsAlarm = XLSX.utils.aoa_to_sheet(alarmData);
            for (let key in wsAlarm) {
                if (key[0] === '!') continue;
                if (!wsAlarm[key].s) wsAlarm[key].s = {};
                wsAlarm[key].s.font = { sz: 10, name: "맑은 고딕" };
                if (typeof wsAlarm[key].v === 'string' && wsAlarm[key].v.includes('\n')) wsAlarm[key].s.alignment = { wrapText: true, vertical: "top" };
                else wsAlarm[key].s.alignment = { vertical: "center" };
            }
            wsAlarm['!cols'] = [{wch: 28}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 45}];
            XLSX.utils.book_append_sheet(wb, wsAlarm, "알림메일");
        }

        // ── 제품사진_원본데이터 시트: 사진(base64)을 셀 글자수 제한(약 32,767자) 때문에 여러 행으로 나눠 저장 ──
        const CHUNK_SIZE = 30000;
        const piRows = [['슬롯', '순번', '가로(w)', '세로(h)', '데이터(base64 조각)']];
        (tabData.productImages || []).forEach(function(entry, slotIdx) {
            if (!entry) return;
            const src = (typeof entry === 'string') ? entry : entry.data;
            if (!src) return;
            const w = (entry && entry.w) || '';
            const h = (entry && entry.h) || '';
            for (let c = 0; c * CHUNK_SIZE < src.length; c++) {
                piRows.push([slotIdx, c, w, h, src.substr(c * CHUNK_SIZE, CHUNK_SIZE)]);
            }
        });
        if (piRows.length > 1) {
            const wsProdImg = XLSX.utils.aoa_to_sheet(piRows);
            wsProdImg['!cols'] = [{wch: 6}, {wch: 6}, {wch: 8}, {wch: 8}, {wch: 40}];
            XLSX.utils.book_append_sheet(wb, wsProdImg, "제품사진_원본데이터");
        }

        // ── 🪪 Address 시트 ──
        const addrRows = tabData.addressBook || [];
        if (addrRows.length > 0) {
            const addrData = [['이름', '영문 이름', '부서', '직함', '이메일', '휴대폰', '근무처 전화', '텔레그램 ID']];
            addrRows.forEach(function(p) { addrData.push([p.name, p.nameEn, p.dept, p.title, p.email, p.mobile, p.phone, p.telegramId || '']); });
            const wsAddr = XLSX.utils.aoa_to_sheet(addrData);
            // 💡 스타일은 공통 applyExcelStyles가 일괄 처리
            wsAddr['!cols'] = [{wch: 14}, {wch: 14}, {wch: 16}, {wch: 26}, {wch: 16}, {wch: 16}];
            XLSX.utils.book_append_sheet(wb, wsAddr, "Address");
        }

        // ── 업무 보관함 시트 (이 PC 사용자의 보관함 스냅샷 · 출력 전용, 가져오기 시 무시됨) ──
        try {
            const inboxItems = (window.TaskInbox && window.TaskInbox.load()) || [];
            if (inboxItems.length) {
                const inboxData = [['상태', '출처', '담은 일시', 'WBS레벨', '개발단계(L0)', '업무명', '상세내용', '시작일', '완료일', '업무상태']];
                inboxItems.forEach(function(it) {
                    const t = it.task || {};
                    inboxData.push([it.status || '', it.source || '', it.addedAt ? new Date(it.addedAt).toLocaleString('ko-KR') : '', 'L' + (t['wbs레벨'] !== undefined ? t['wbs레벨'] : 4), t['개발단계'] || '', t['업무명'] || '', (t['상세내용'] || '').toString(), t['시작일'] || '', t['완료일'] || '', t['상태'] || '']);
                });
                const wsInbox = XLSX.utils.aoa_to_sheet(inboxData);
                wsInbox['!cols'] = [{wch:8},{wch:16},{wch:18},{wch:8},{wch:14},{wch:26},{wch:60},{wch:11},{wch:11},{wch:8}];
                XLSX.utils.book_append_sheet(wb, wsInbox, "업무 보관함");
            }
        } catch (e) { console.warn('보관함 시트 생성 실패:', e); }

        // 💡 전 시트 공통 스타일 적용 — 모든 시트 추가 후, 저장 직전에 1회만 호출
        applyExcelStyles(wb);
        const fileName = `${window.exportFilenameStr || "GanttChart"}.xlsx`; XLSX.writeFile(wb, fileName);
    }

    // ===== 엑셀 출력 공통 스타일러 =====
    function applyExcelStyles(wb) {
        const NAVY = window._cpXlsxRole('darkText'), BORDER = { style: "thin", color: { rgb: window._cpXlsxRole('border') } };
        const allBorder = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
        wb.SheetNames.forEach(function(name) {
            const ws = wb.Sheets[name];
            if (!ws || !ws['!ref']) return;
            const range = XLSX.utils.decode_range(ws['!ref']);
            const colW = [];
            for (let r = range.s.r; r <= range.e.r; r++) {
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
                    if (!cell) continue;
                    // 열 너비 자동 계산 (한글 2배 가중치, 최대 45자) — !cols 기지정 시트는 건너뜀
                    if (!ws['!cols']) {
                        const txt = String(cell.v === undefined || cell.v === null ? '' : cell.v);
                        const len = txt.split('\n').reduce(function(m, line) {
                            let w = 0; for (const ch of line) w += /[가-힣ㄱ-ㅎ]/.test(ch) ? 2 : 1;
                            return Math.max(m, w);
                        }, 0);
                        colW[c] = Math.min(45, Math.max(colW[c] || 6, len + 2));
                    }
                    const isHeader = (r === range.s.r);
                    const txt2 = String(cell.v === undefined || cell.v === null ? '' : cell.v);
                    const base = {
                        font: { name: "맑은 고딕", sz: 10, bold: isHeader, color: { rgb: isHeader ? "FFFFFF" : "1F2937" } },
                        fill: isHeader ? { patternType: "solid", fgColor: { rgb: NAVY } }
                              : (r % 2 === 0 ? { patternType: "solid", fgColor: { rgb: window._cpXlsxRole('zebraB') } } : undefined),
                        border: allBorder,
                        alignment: { vertical: "center", horizontal: isHeader ? "center" : undefined, wrapText: txt2.indexOf('\n') !== -1 }
                    };
                    // 💡 시트별 개별 지정(L0 강조, SUBTOTAL 색, 계획/실적 배경 등)이 우선 — 테두리 등 기본값만 보강
                    cell.s = Object.assign(base, cell.s || {});
                    if (!cell.s.border) cell.s.border = allBorder;
                }
            }
            if (!ws['!cols'] && colW.length) ws['!cols'] = colW.map(function(w) { return { wch: w || 6 }; });
            ws['!rows'] = ws['!rows'] || [];
            ws['!rows'][0] = { hpt: 22 };
        });
    }

    function formatChartLabel(ts) {
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + " '" + String(d.getFullYear()).slice(-2);
}

