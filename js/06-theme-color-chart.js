    // =========================================================
    // 🎨 테마 색상 동적 반영 & 차트 막대(단색 검은색 고정)
    // =========================================================
       

    // ── 차트 확장 토글 ─────────────────────────────────────
 window._chartExpanded = false;
    window.toggleChartExpand = function() {
        window._chartExpanded = !window._chartExpanded;
        const btn   = document.getElementById('chart-expand-btn');
        const table = document.getElementById('myTable');
        if (!table) return;

        document.documentElement.style.setProperty('--chart-month-detail', window._chartExpanded ? '1' : '0');

        if (window._chartExpanded) {
            // 확장 모드 ON: 상세내용 열을 현황 열 뒤로 이동
            const headRow = table.querySelector('thead tr');
            const bodyRows = table.querySelectorAll('tbody tr');
            const detailTh = headRow ? headRow.querySelector('th.detail-th') : null;
            if (detailTh) headRow.appendChild(detailTh);
            bodyRows.forEach(tr => {
                const detailTd = tr.querySelector('td.detail-td');
                if (detailTd) tr.appendChild(detailTd);
            });
            table.classList.add('chart-expanded');
            if (btn) {
                btn.style.background = '#0056b3';
                btn.style.color      = '#fff';
                btn.style.border     = '2px solid #0056b3';
                btn.textContent = LANG[window._currentLang].ui['chart-expand-btn-on'] || '📊 기본 보기';
            }
        } else {
            // 확장 모드 OFF: 상세내용 열을 현황 열 앞으로 복원
            const headRow = table.querySelector('thead tr');
            const bodyRows = table.querySelectorAll('tbody tr');
            const chartTh = headRow ? headRow.querySelector('th.chart-th') : null;
            if (chartTh) {
                const detailTh = headRow.querySelector('th.detail-th');
                if (detailTh) headRow.insertBefore(detailTh, chartTh);
            }
            bodyRows.forEach(tr => {
                const chartTd = tr.querySelector('td.chart-td');
                const detailTd = tr.querySelector('td.detail-td');
                if (chartTd && detailTd) tr.insertBefore(detailTd, chartTd);
            });
            table.classList.remove('chart-expanded');
            if (btn) {
                btn.style.background = '';
                btn.style.color      = '';
                btn.style.border     = '';
                btn.textContent = LANG[window._currentLang].ui['chart-expand-btn'] || '📊 차트 확장';
            }
        }

        // 차트 재렌더링
        document.querySelectorAll('.chart-td').forEach(td => {
            const rowIdx = parseInt(td.closest('tr')?.dataset.rowIndex);
            if (!rowIdx) return;
            const row = globalData[rowIdx];
            if (row) td.innerHTML = window.createStatusChart(row._calcStartTs, row._calcPlanTs, row[colIdx.status], row._level, window.getRowCompareInfo ? window.getRowCompareInfo(row) : null);
        });

        // 💡 컬럼 순서가 바뀌었으므로 sticky 왼쪽열 위치/배경을 즉시 재계산 (안 하면 스크롤 시 뒤가 투과되어 보임)
        if (window.updateStickyPositions) window.updateStickyPositions();

        if (window.updateChartHeaderAxis) window.updateChartHeaderAxis();

        // 💡 표 너비 = 보이는 열 너비 합계로 정확히 고정 (table-layout:fixed가 남는 공간을
        //    다른 열들에 나눠 재분배하면서 발생하는 "관계없는 열까지 흔들리는" 현상 방지)
        requestAnimationFrame(function() {
            const headRow = table.querySelector('thead tr');
            if (!headRow) return;
            let total = 0;
            headRow.querySelectorAll('th').forEach(function(th) {
                if (th.offsetWidth > 0) total += th.offsetWidth;
            });
            if (total > 0) table.style.width = total + 'px';
        });
    };

    // 표 머릿글에 월/년(또는 기본 4분할) 눈금 라벨을 표시 — 확장/기본 모드 공통
    window.getChartAxisTicks = function(isExpanded, viewStartTs, viewDuration) {
        const totalDays = viewDuration / 86400000;
        const approxMonths = Math.max(1, Math.round(totalDays / 30.44));
        const unitMonths = isExpanded ? 1 : 3;
        const numTicks = Math.max(2, Math.round(approxMonths / unitMonths) + 1);
        let pcts = [];
        for (let i = 0; i < numTicks; i++) pcts.push((i / (numTicks - 1)) * 100);
        return pcts;
    };

    window.updateChartHeaderAxis = function() {
        const headerAxis = document.querySelector('#myTable thead .chart-th-axis');
        if (!headerAxis) return;

        const isExpanded = document.documentElement.style.getPropertyValue('--chart-month-detail') === '1';
        const viewStartTs = window.ganttViewStartTs; const viewDuration = window.ganttViewDuration;
        if (!viewStartTs || !viewDuration) { headerAxis.innerHTML = ''; return; }

        let labelHTML = '';

        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const mLbl = (ts) => { const d = new Date(ts); return `${months[d.getMonth()]} '${d.getFullYear().toString().slice(2)}`; };

        // 💡 라벨과 눈금선이 항상 일치하도록, 공용 함수(window.getChartAxisTicks)로 위치 계산
        const pcts = window.getChartAxisTicks(isExpanded, viewStartTs, viewDuration);
        let ticks = pcts.map(pct => ({ pct, lbl: mLbl(viewStartTs + (viewDuration * pct / 100)) }));

        ticks.forEach((t, idx) => {
            // 💡 모든 라벨(맨 앞/맨 뒤 포함)을 동일하게 중앙 정렬 — 다른 날짜와 같은 계산으로 등간격 유지
            let transform = 'translateX(-50%)';
            labelHTML += `<span class="chart-label" style="position:absolute; left:${t.pct}%; transform:${transform}; white-space:nowrap; z-index:5; font-size:var(--chart-label-size); font-weight:bold;">${t.lbl}</span>`;
        });

        headerAxis.innerHTML = labelHTML;
    };


    // 차트 생성 로직
    window.createStatusChart = function(rowStartTs, rowPlanTs, statusVal, level, compareInfo) {
    let statusStr = statusVal ? statusVal.toString().toLowerCase() : ""; 
    let isCancel = statusStr.includes('cancel') || statusStr.includes('취소'); 
    let isDrop = statusStr.includes('drop') || statusStr.includes('드랍');
    let isDone = statusStr.includes('완료') || statusStr.includes('done') || statusStr.includes('complete');
    
    let tsStart = rowStartTs; let tsEnd = rowPlanTs;
    if (!tsStart && !tsEnd) return `<div>-</div>`; 
    if (!tsEnd) tsEnd = tsStart; 
    if (tsEnd < tsStart) tsEnd = tsStart;

    let viewStartTs = window.ganttViewStartTs; let viewDuration = window.ganttViewDuration;
    if (!viewStartTs || !viewDuration) return `<div>-</div>`;

    let startPct = Math.max(0, Math.min(100, ((tsStart - viewStartTs) / viewDuration) * 100)); 
    let endPct = Math.max(0, Math.min(100, ((tsEnd - viewStartTs) / viewDuration) * 100));
    let widthPct = endPct - startPct; if (widthPct <= 0 && endPct > 0) widthPct = 0.5; 
    
    let gradVar = level === 0 ? 'var(--chart-l0)' : (level === 1 ? 'var(--chart-l1)' : (level === 2 ? 'var(--chart-l2)' : (level === 3 ? 'var(--chart-l3)' : 'var(--chart-l4)')));
    let gradientStyle = `background: ${gradVar};`;
    if (isCancel || isDrop) { gradientStyle = `background: #adb5bd;`; } 
    let barOpacity = isDone ? 0.2 : 0.95; 

    let todayTs = new Date().setHours(0,0,0,0); let todayPct = ((todayTs - viewStartTs) / viewDuration) * 100;
    let labelFontSize = "var(--chart-label-size)";
    let labelWeight   = "bold";
    let isExpanded = document.documentElement.style.getPropertyValue('--chart-month-detail') === '1';

    let gridLines = '';
    let labelHTML = '';

    {
        // 💡 라벨(표 머릿글)과 완전히 같은 위치에 눈금선을 그림 (window.getChartAxisTicks 공용 계산식)
        const axisPcts = window.getChartAxisTicks(isExpanded, viewStartTs, viewDuration);
        const lineStyle = isExpanded ? 'border-left:1px solid #adb5bd;' : 'border-left:1px dashed #dee2e6;';
        axisPcts.forEach(pct => {
            if (pct <= 0 || pct >= 100) return; // 양 끝 경계선은 막대 테두리와 겹치니 생략
            gridLines += `<div style="position:absolute; top:0; bottom:0; left:${pct}%; ${lineStyle} z-index:1;"></div>`;
        });
    }

    let todayLine = "";
    if (todayPct >= -5 && todayPct <= 105) {
        todayLine = `<div style="position:absolute; top:-1px; bottom:-1px; left:calc(${todayPct}% - 1px); width:2px; background-color:var(--today-line) !important; z-index:10;" title="Today"></div>`;
    }
    
    let durationDays = countWorkingDays(tsStart, tsEnd);
        
    let dateRangeLabel = formatTsToYMD(tsStart) + " ~ " + formatTsToYMD(tsEnd);

    // 📐 계획(Baseline) 고스트바 — 선택한 계획의 시작일~완료일을 "그 자체 값"으로 독립적으로 표시
    //    (현재 막대의 길이와 무관하게, 저장된 과거 시작/종료일만으로 폭을 계산)
    //    💡 시인성 개선: 진한 앰버(#f59f00) + 불투명도 상향, 메인 막대 아래쪽에 별도 줄로 분리(안 겹침)
    function buildGhostBarHtml(gStart, gEnd, planLabel) {
        if (!gStart) return '';
        if (!gEnd) gEnd = gStart; // 💡 과거 데이터에 완료일이 없으면 하루짜리 마커로 표시
        if (gEnd < gStart) gEnd = gStart;
        if (gStart === tsStart && gEnd === tsEnd) return ''; // 💡 시작·종료가 둘 다 같을 때만 생략 (기간만 달라도 표시되도록)
        const ghostStartPct = Math.max(0, Math.min(100, ((gStart - viewStartTs) / viewDuration) * 100));
        const ghostEndPct = Math.max(0, Math.min(100, ((gEnd - viewStartTs) / viewDuration) * 100));
        let ghostWidthPct = ghostEndPct - ghostStartPct; if (ghostWidthPct <= 0 && ghostEndPct > 0) ghostWidthPct = 0.5;
        return `<div style="position:absolute; bottom:0px; height:4px; left:${ghostStartPct}%; width:${ghostWidthPct}%; background:repeating-linear-gradient(45deg, rgba(12,133,153,0.85), rgba(12,133,153,0.85) 3px, rgba(255,255,255,0.35) 3px, rgba(255,255,255,0.35) 6px); border:1px solid rgba(12,133,153,0.9); border-radius:2px; box-sizing:border-box; z-index:3;" title="${escapeHtml(planLabel)} 시작일~완료일: ${formatTsToYMD(gStart)} ~ ${formatTsToYMD(gEnd)}"></div>`;
    }
    let ghostBarHtml = compareInfo ? buildGhostBarHtml(compareInfo.aStart, compareInfo.aEnd, compareInfo.aLabel) : '';

    return `<div style="display:flex; flex-direction:column; width:100%; min-width:120px; padding:0 20px; box-sizing:border-box;" title="소요일수: ${durationDays}일">
                <div style="position:relative; height:15px; background-color:transparent; border:1px solid #ddd; border-radius:4px; overflow:visible; width:100%; margin-top:0px;">
                    ${gridLines}${todayLine}${ghostBarHtml}
                    <div style="position:absolute; top:1px; height:8px; left:${startPct}%; width:${widthPct}%; ${gradientStyle} border-radius:4px; border:2px solid rgba(0,0,0,0.2); box-sizing:border-box; z-index:2; opacity:${barOpacity}; box-shadow:0 1px 3px rgba(0,0,0,0.2);" title="${dateRangeLabel}"></div>
                </div>
            </div>`;
    };

    
