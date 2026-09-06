// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 1~1282행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 엑셀 파싱: Summary/Brief SPEC/M.C Table 등
// ══════════════════════════════════════════════════════
// 신규 탭(Summary / Brief SPEC / M.C Table) 데이터 바인딩 (컨셉 단계)
// - 고객사/모델명/인치/프로젝트명 등 프로젝트 단위 정보는 projectMeta에 저장
// - 그 외 Summary 개요/마일스톤, Brief SPEC, M.C Table 내용은 window.tabData에 저장
// 기본값은 빈 상태이며, 실제 값은 JSON(구글 드라이브) 또는 로컬 엑셀 파일을 불러올 때 채워짐
// ══════════════════════════════════════════════════════


window.tabData = window.tabData || { summary: {}, briefSpec: [], mcTable: [] };

// ── 로컬 엑셀 파일 로드 시, Summary/Brief SPEC/M.C Table 시트(회색 작성 구간)를
//    읽어서 projectMeta / tabData로 복원하기 위한 파서 ──
function _xlsxCellToDateStr(v) {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'number') {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
            const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0');
            return y + '-' + m + '-' + dd;
        }
    }
    return String(v).trim();
}

function _parseSummarySheetFromWorkbook(workbook) {
    const sheetName = workbook.SheetNames.find(function(n) { return n.trim() === 'Summary' || n.trim().includes('Summary'); });
    if (!sheetName) return false;
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    window.projectMeta = window.projectMeta || {};
    window.tabData = window.tabData || { summary: {}, briefSpec: [], mcTable: [] };
    const pm = window.projectMeta;
    const sd = window.tabData.summary || {};
    sd.milestones = sd.milestones || {};
    const labelMap = {
        '고객사': function(v) { pm.고객사 = v; },
        '프로젝트 코드': function(v) { pm.프로젝트코드 = v; },
        '프로젝트 명칭': function(v) { pm.프로젝트명 = v; },
        '고객 모델명': function(v) { pm.고객모델명 = v; pm.모델명 = v; },
        '인치': function(v) { pm.인치 = v; },
        'KTK PN': function(v) { pm.KTKPN = v; },
        'KTK 모델명': function(v) { pm.KTK모델명 = v; pm.PN_모델명 = v; },
        '프로젝트 담당자': function(v) { pm.프로젝트담당자 = v; },
        '기구 담당자': function(v) { pm.기구담당자 = v; },
        'H/W 담당자': function(v) { pm.HW담당자 = v; },
        'F/W 담당자': function(v) { pm.FW담당자 = v; },
        'Module 담당자': function(v) { pm.Module담당자 = v; },
        'TSP 담당자': function(v) { pm.TSP담당자 = v; },
        'LCM 담당자': function(v) { pm.LCM담당자 = v; },
        'Slimming 담당자': function(v) { pm.Slimming담당자 = v; },
        'Cutting 담당자': function(v) { pm.Cutting담당자 = v; },
        'Tooling 담당자': function(v) { pm.Tooling담당자 = v; },
        '적용 목적': function(v) { sd.purpose = v; },
        '연간 수요량': function(v) { sd.volume = v; },
        '목표 양산 일정': function(v) { sd.mpDate = v; },
        '추진 배경 및 의의': function(v) { sd.background = v; },
        '개발기간(일)': function(v) { sd.devDays = v; },
        '현재 M.C 리비전': function(v) { window.tabData.mcActiveRevision = v || 'R1'; },
        'PM 이메일': function(v) { pm.프로젝트담당자이메일 = v; },
        '기구 이메일': function(v) { pm.기구담당자이메일 = v; },
        'HW 이메일': function(v) { pm.HW담당자이메일 = v; },
        'FW 이메일': function(v) { pm.FW담당자이메일 = v; },
        'Module 이메일': function(v) { pm.Module담당자이메일 = v; },
        'TSP 이메일': function(v) { pm.TSP담당자이메일 = v; },
        'LCM 이메일': function(v) { pm.LCM담당자이메일 = v; },
        'Slimming 이메일': function(v) { pm.Slimming담당자이메일 = v; },
        'Cutting 이메일': function(v) { pm.Cutting담당자이메일 = v; },
        'Tooling 이메일': function(v) { pm.Tooling담당자이메일 = v; }
    };
    const milestoneMap = { '기획 Start': '기획Start', 'PROTO Start': '기획Start', '기획 Finish': '기획Finish', 'PROTO End': '기획Finish', 'Proto DR': 'ProtoDR', 'ES Start': 'ESStart', 'ES End': 'ESEnd', 'DVR': 'DVR', 'PP Start': 'PPStart', 'PP End': 'PPEnd', 'PRA': 'PRA' };
    const actualMilestoneMap = { '실적 PROTO Start': '기획Start', '실적 PROTO End': '기획Finish', '실적 Proto DR': 'ProtoDR', '실적 ES Start': 'ESStart', '실적 ES End': 'ESEnd', '실적 DVR': 'DVR', '실적 PP Start': 'PPStart', '실적 PP End': 'PPEnd', '실적 PRA': 'PRA' };
    // 💡 신형(웹 배치) Summary 지원
    const stageOrder = ['기획Start', '기획Finish', 'ProtoDR', 'ESStart', 'ESEnd', 'DVR', 'PPStart', 'PPEnd', 'PRA'];
    const memberMap = { '프로젝트 담당자': '프로젝트담당자', '기구 담당자': '기구담당자', 'H/W 담당자': 'HW담당자', 'F/W 담당자': 'FW담당자', 'BLU 담당자': 'Module담당자', 'Module 담당자': 'Module담당자', 'TSP 담당자': 'TSP담당자', 'LCM 담당자': 'LCM담당자', 'Slimming 담당자': 'Slimming담당자', 'Cutting 담당자': 'Cutting담당자', 'Tooling 담당자': 'Tooling담당자' };
    const pairMap = {
        '적용 목적': function(v) { sd.purpose = v; }, '연간 수요량': function(v) { sd.volume = v; }, '목표 양산 일정': function(v) { sd.mpDate = v; },
        '고객사': function(v) { pm.고객사 = v; }, '고객 모델명': function(v) { pm.고객모델명 = v; pm.모델명 = v; },
        '프로젝트 코드': function(v) { pm.프로젝트코드 = v; }, '프로젝트 명칭': function(v) { pm.프로젝트명 = v; }, '인치': function(v) { pm.인치 = v; },
        '개발기간(일)': function(v) { sd.devDays = v; }, '현재 M.C 리비전': function(v) { window.tabData.mcActiveRevision = v || 'R1'; },
        'KTK PN_모델명': function(v) { const us = v.indexOf('_'); pm.KTKPN = us === -1 ? v : v.slice(0, us); pm.KTK모델명 = us === -1 ? '' : v.slice(us + 1); if (pm.KTK모델명) pm.PN_모델명 = pm.KTK모델명; }
    };
    let _bgNext = false;
    json.forEach(function(row) {
        if (!row || row.length === 0) return;
        const label = String(row[0] || '').trim();
        if (label === '계획' || label === '실적') {
            const f = label === '계획' ? 'date' : 'actualDate';
            stageOrder.forEach(function(k, i) {
                const v = _xlsxCellToDateStr(row[1 + i]);
                if (v) { const patch = {}; patch[f] = v; sd.milestones[k] = Object.assign({}, sd.milestones[k], patch); }
            });
            return;
        }
        if (_bgNext) { _bgNext = false; if (label) sd.background = label; return; }
        if (label === '추진 배경 및 의의' && String(row[1] || '').trim() === '') { _bgNext = true; return; }
        // 좌(A-B-C열) / 우(E-F-G열) 2단 라벨-값 쌍 처리
        [[0, 1, 2], [4, 5, 6]].forEach(function(cols) {
            const L = String(row[cols[0]] || '').trim(); if (!L) return;
            const V = row[cols[1]] === undefined || row[cols[1]] === null ? '' : String(row[cols[1]]).trim();
            if (pairMap[L]) { pairMap[L](V); return; }
            if (memberMap[L]) {
                pm[memberMap[L]] = V;
                const E = row[cols[2]] === undefined || row[cols[2]] === null ? '' : String(row[cols[2]]).trim();
                if (E) pm[memberMap[L] + '이메일'] = E;
            }
        });
        if (!label) return;
        const rawVal = row[1];
        if (milestoneMap[label]) {
            const patch = { date: _xlsxCellToDateStr(rawVal) };
            if (row.length > 2 && String(row[2] || '').trim() !== '') patch.actualDate = _xlsxCellToDateStr(row[2]); // 💡 3열(실적) 형식 지원
            sd.milestones[milestoneMap[label]] = Object.assign({}, sd.milestones[milestoneMap[label]], patch);
            return;
        }
        if (actualMilestoneMap[label]) {
            sd.milestones[actualMilestoneMap[label]] = Object.assign({}, sd.milestones[actualMilestoneMap[label]], { actualDate: _xlsxCellToDateStr(rawVal) });
            return;
        }
        if (labelMap[label]) {
            labelMap[label](rawVal === undefined || rawVal === null ? '' : String(rawVal).trim());
        }
    });
    window.tabData.summary = sd;
    return true;
}

function _parseBriefSpecSheetFromWorkbook(workbook) {
    // 💡 [2026-08-29] 내보내기 시트명을 "Brief SPEC" → "Customer SPEC"으로 바꿨는데(표시명만 변경,
    //    내부 데이터 키 tabData.briefSpec은 하위호환을 위해 그대로 유지), 예전에 "Brief SPEC" 시트명으로
    //    내보낸 엑셀 파일을 다시 가져올 때도 계속 인식되도록 두 이름을 모두 매칭한다.
    const sheetName = workbook.SheetNames.find(function(n) {
        const t = n.trim();
        return t === 'Customer SPEC' || t.includes('Customer SPEC') || t === 'Brief SPEC' || t.includes('Brief SPEC');
    });
    if (!sheetName) return false;
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const rows = [];
    for (let i = 1; i < json.length; i++) {
        const r = json[i];
        if (!r || r.length === 0) continue;
        const type = String(r[1] || '').trim();
        const sub = String(r[2] || '').trim();
        const modelA = String(r[3] || '').trim();
        const modelB = String(r[4] || '').trim();
        const modelC = String(r[5] || '').trim();
        const note = String(r[6] || '').trim();
        if (!type && !sub && !modelA && !modelB && !modelC && !note) continue;
        rows.push({ type: type, sub: sub, modelA: modelA, modelB: modelB, modelC: modelC, note: note });
    }
    if (rows.length === 0) return false;
    window.tabData = window.tabData || { summary: {}, briefSpec: [], mcTable: [] };
    window.tabData.briefSpec = rows;
    return true;
}

function _parseMcTableSheetRows(workbook, sheetName) {
    if (!sheetName || !workbook.Sheets[sheetName]) return null;
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const rows = []; let _sales = null;
    for (let i = 2; i < json.length; i++) { // 0,1행은 2단 헤더이므로 2행부터 데이터
        const r = json[i];
        if (!r || r.length === 0) continue;
        const _t0 = String(r[0] || '').trim();
        if (_t0 === '영업판가') { _sales = { protoCost: r[5] || '', protoNre: r[6] || '', protoBCost: r[7] || '', protoBNre: r[8] || '', mpCost: r[9] || '', mpNre: r[10] || '' }; continue; }
        if (/SUBTOTAL/i.test(_t0) || /^TOTAL/i.test(_t0) || _t0.indexOf('재료비율') === 0) continue; // 💡 요약행 제외
        const row = {
            type: String(r[0] || '').trim(), item: String(r[1] || '').trim(), group: String(r[2] || '').trim(),
            pn: (r[3] === undefined || r[3] === null) ? '' : String(r[3]).trim(), spec: String(r[4] || '').trim(),
            protoCost: (r[5] === undefined || r[5] === null) ? '' : r[5], protoNre: (r[6] === undefined || r[6] === null) ? '' : r[6],
            protoBCost: (r[7] === undefined || r[7] === null) ? '' : r[7], protoBNre: (r[8] === undefined || r[8] === null) ? '' : r[8],
            mpCost: (r[9] === undefined || r[9] === null) ? '' : r[9], mpNre: (r[10] === undefined || r[10] === null) ? '' : r[10],
            note: String(r[11] || '').trim()
        };
        const isEmpty = !row.type && !row.item && !row.group && !row.pn && !row.spec && !row.note
            && row.protoCost === '' && row.protoNre === '' && row.protoBCost === '' && row.protoBNre === '' && row.mpCost === '' && row.mpNre === '';
        if (isEmpty) continue;
        rows.push(row);
    }
    return rows.length ? { rows: rows, sales: _sales } : null;
}

// 💡 R1~R5 리비전 시트("M.C Table", "M.C Table R2"~"M.C Table R5")를 모두 읽어 mcRevisions로 복원
function _parseMcTableSheetFromWorkbook(workbook) {
    window.tabData = window.tabData || { summary: {}, briefSpec: [], mcTable: [] };
    // 💡 불러오기 전, 이름표 없는 임시 자리(mcActiveUnit='')와 그동안 등록됐던 제품구분자 목록을
    //    모두 새로 초기화 — 지금 여는 엑셀 파일이 진짜 현재 상태이므로
    window.mcActiveUnit = '';
    window.tabData.mcRevisionsByUnit = {};
    window.tabData.mcSalesPriceDetailByUnit = {};
    window.tabData.mcRevisions = window.tabData.mcRevisionsByUnit[''] = {};
    window.tabData.mcSalesPriceDetail = window.tabData.mcSalesPriceDetailByUnit[''] = {};
    window.tabData.mcUnits = [];

    // 1단계: 시트 이름에서 "어떤 제품구분자의 몇 번 리비전인지" 전부 추출
    //   "M.C Table R1"        → 구분자 없음(이름표 없는 데이터), 리비전='R1'
    //   "M.C Table-MAIN R2"   → 구분자='MAIN',                 리비전='R2'
    //   "M.C Table" (구형)     → 구분자 없음,                    리비전='R1'
    const entries = [];
    workbook.SheetNames.forEach(function(n) {
        const name = n.trim();
        if (name === 'M.C Table') { entries.push({ unit: '', rev: 'R1', sheetName: n }); return; }
        const m = name.match(/^M\.C Table(?:-(.+))? (R\d+)$/);
        if (m) entries.push({ unit: m[1] || '', rev: m[2], sheetName: n });
    });

    let found = false;
    const namedUnitsSeen = [];
    entries.forEach(function(entry) {
        const parsed = _parseMcTableSheetRows(workbook, entry.sheetName);
        if (!parsed) return;
        found = true;

        if (!entry.unit) {
            // 이름표 없는 데이터 → 임시 자리('')에 저장, 나중에 mcCheckNeedsNaming이 이름을 물어봄
            window.tabData.mcRevisions[entry.rev] = parsed.rows;
            if (parsed.sales) window.tabData.mcSalesPriceDetail[entry.rev] = parsed.sales;
        } else {
            // 이미 이름 붙은 시트 → 바로 그 제품구분자로 등록
            window.tabData.mcRevisionsByUnit[entry.unit] = window.tabData.mcRevisionsByUnit[entry.unit] || {};
            window.tabData.mcRevisionsByUnit[entry.unit][entry.rev] = parsed.rows;
            if (parsed.sales) {
                window.tabData.mcSalesPriceDetailByUnit[entry.unit] = window.tabData.mcSalesPriceDetailByUnit[entry.unit] || {};
                window.tabData.mcSalesPriceDetailByUnit[entry.unit][entry.rev] = parsed.sales;
            }
            if (namedUnitsSeen.indexOf(entry.unit) === -1) namedUnitsSeen.push(entry.unit);
        }
    });

    // 💡 엑셀에 있던 순서 그대로 제품구분자 목록에 등록 → 불러온 즉시 화면 탭에 나타남
    namedUnitsSeen.forEach(function(u) { if (window.tabData.mcUnits.indexOf(u) === -1) window.tabData.mcUnits.push(u); });

    if (window.tabData.mcRevisions.R1) window.tabData.mcTable = window.tabData.mcRevisions.R1;
    if (found) setTimeout(window.mcCheckNeedsNaming, 300); // 💡 이름표 없는 데이터가 있었다면 자동으로 확인 팝업
    return found;
}

// 💡 "MC Comparison" 시트를 읽어 영업판가(salesPrice)와 항목별 메모(notes)를 복원
// 💡 시트 하나를 파싱해서 { salesPrice, notes }로 반환 (종류 구분 없이 순수 파싱만 담당)
function _parseOneMcComparisonSheet(workbook, sheetName) {
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const result = { salesPrice: {}, notes: {} };
    let found = false;

    const salesRow = json.find(function(r) { return r && String(r[3] || '').trim() === '영업판가'; });
    if (salesRow) {
        const revs = ['R1','R2','R3','R4','R5'];
        revs.forEach(function(rev, idx) {
            const col = 4 + idx * 2;
            const val = salesRow[col];
            if (val !== undefined && val !== '' && !isNaN(parseFloat(val))) {
                result.salesPrice[rev] = parseFloat(val);
            }
        });
        found = true;
    }

    const specialLabels = ['TOTAL', '영업판가', '재료비율(%)'];
    for (let i = 2; i < json.length; i++) {
        const r = json[i];
        if (!r || r.length === 0) continue;
        const group = String(r[3] || '').trim();
        if (specialLabels.indexOf(group) !== -1) continue;
        const type = String(r[1] || '').trim();
        const item = String(r[2] || '').trim();
        if (!type && !item && !group) continue;
        const note = String(r[r.length - 1] || '').trim();
        if (!note) continue;
        const key = [type, item, group].join('|').toLowerCase();
        result.notes[key] = note;
        found = true;
    }

    return found ? result : null;
}

// 💡 "MC Comparison"(이름표 없음) / "MC Comparison-MAIN"(제품구분자별)을 모두 찾아 복원
function _parseMcComparisonSheetFromWorkbook(workbook) {
    window.tabData = window.tabData || { summary: {}, briefSpec: [], mcTable: [] };
    window.tabData.mcCompare = window.tabData.mcCompare || { salesPrice: {}, notes: {} };
    window.tabData.mcCompareByUnit = window.tabData.mcCompareByUnit || {};
    let found = false;

    workbook.SheetNames.forEach(function(n) {
        const name = n.trim();
        let unit = null;
        if (name === 'MC Comparison') unit = '';
        else {
            const m = name.match(/^MC Comparison-(.+)$/);
            if (m) unit = m[1];
        }
        if (unit === null) return;

        const parsed = _parseOneMcComparisonSheet(workbook, n);
        if (!parsed) return;
        found = true;

        if (!unit) {
            window.tabData.mcCompare.salesPrice = parsed.salesPrice;
            window.tabData.mcCompare.notes = parsed.notes;
        } else {
            window.tabData.mcCompareByUnit[unit] = parsed;
        }
    });

    return found;
}

// 💡 "M.C 영업판가" 시트를 읽어 tabData.mcSalesPriceDetail로 복원
function _parseMcSalesDetailSheetFromWorkbook(workbook) {
    const sheetName = 'M.C 영업판가';
    if (!workbook.Sheets[sheetName]) return false;
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    if (!json.length) return false;
    window.tabData = window.tabData || {};
    window.tabData.mcSalesPriceDetail = window.tabData.mcSalesPriceDetail || {};
    for (let i = 1; i < json.length; i++) {
        const r = json[i];
        if (!r || !r[0]) continue;
        const rev = String(r[0]).trim();
        window.tabData.mcSalesPriceDetail[rev] = {
            protoCost: r[1] || '', protoNre: r[2] || '',
            protoBCost: r[3] || '', protoBNre: r[4] || '',
            mpCost: r[5] || '', mpNre: r[6] || ''
        };
    }
    return true;
}

// 💡 "M.C 수정이력" 시트를 읽어 tabData.mcChangeLog로 복원
function _parseMcChangeLogSheetFromWorkbook(workbook) {
    const sheetName = 'M.C 수정이력';
    if (!workbook.Sheets[sheetName]) return false;
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    if (!json.length) return false;
    window.tabData = window.tabData || {};
    window.tabData.mcChangeLog = window.tabData.mcChangeLog || [];
    for (let i = 1; i < json.length; i++) {
        const r = json[i];
        if (!r || !r[0]) continue;
        window.tabData.mcChangeLog.push({
            time: r[0], userName: r[1] || '알 수 없음', rev: r[2] || '',
            row: r[3] || '', field: r[4] || '', oldVal: r[5], newVal: r[6]
        });
    }
    return true;
}

// 💡 [2026-08-28 신규] "Elec Parts" 시트(PANEL/CONV/AD BD 비교표의 선택 모델·Note·수정이력)를 읽어
//    tabData.panelCompare / tabData.elecCompare로 복원. 내보내기(exportToExcel의 Elec Parts 시트 생성부)와
//    정확히 같은 "## 구획 표시" 구조를 기대한다 — 구획이 바뀌면 이 파서도 같이 고쳐야 함.
function _parseElecPartsSheetFromWorkbook(workbook) {
    const sheetName = workbook.SheetNames.find(function(n) { return n.trim() === 'Elec Parts'; });
    if (!sheetName) return false;
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    if (!json.length) return false;

    const typeKeyOf = { 'PANEL': 'panel', 'CONV': 'convbd', 'AD BD': 'adbd' };
    const selByType = { panel: [], convbd: [], adbd: [] };
    const notesByType = { panel: {}, convbd: {}, adbd: {} };
    const logsByType = { panel: [], convbd: [], adbd: [] };

    let section = null;
    json.forEach(function(row) {
        if (!row || !row.length) return;
        const c0 = String(row[0] || '').trim();
        if (c0 === '## SELECTED MODELS' || c0 === '## NOTES' || c0 === '## CHANGE LOG') { section = c0; return; }
        if (c0 === 'ELEC PARTS DATA' || c0 === 'TYPE') return; // 제목/하위 헤더 행은 건너뜀
        const typeKey = typeKeyOf[c0];
        if (!typeKey) return;
        if (section === '## SELECTED MODELS') {
            selByType[typeKey] = String(row[1] || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        } else if (section === '## NOTES') {
            const label = String(row[1] || '').trim();
            if (label) notesByType[typeKey][label] = row[2] || '';
        } else if (section === '## CHANGE LOG') {
            logsByType[typeKey].push({ time: row[1] || '', userName: row[2] || '알 수 없음', row: row[3] || '', field: row[4] || '', oldVal: row[5], newVal: row[6] });
        }
    });

    window.tabData = window.tabData || {};
    window.tabData.panelCompare = { selectedModels: selByType.panel, notes: notesByType.panel, lastAutoSeed: null };
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare.convbd = { selectedModels: selByType.convbd, notes: notesByType.convbd };
    window.tabData.elecCompare.adbd = { selectedModels: selByType.adbd, notes: notesByType.adbd };
    window.tabData.panelCompareChangeLog = logsByType.panel;
    window.tabData.elecCompareChangeLog = window.tabData.elecCompareChangeLog || {};
    window.tabData.elecCompareChangeLog.convbd = logsByType.convbd;
    window.tabData.elecCompareChangeLog.adbd = logsByType.adbd;
    return true;
}

// 💡 "제품사진_원본데이터" 시트를 읽어 여러 행에 나뉜 base64 조각을 순번대로 합쳐 tabData.productImages로 복원
function _parseProductImagesSheetFromWorkbook(workbook) {
    const sheetName = workbook.SheetNames.find(function(n) { return n.trim() === '제품사진_원본데이터'; });
    if (!sheetName) return false;
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const slots = {};
    for (let i = 1; i < json.length; i++) {
        const r = json[i];
        if (!r || r.length === 0 || r[4] === undefined || r[4] === '') continue;
        const slotIdx = parseInt(r[0], 10);
        const chunkIdx = parseInt(r[1], 10);
        if (isNaN(slotIdx) || isNaN(chunkIdx)) continue;
        slots[slotIdx] = slots[slotIdx] || { w: r[2] || '', h: r[3] || '', chunks: [] };
        slots[slotIdx].chunks[chunkIdx] = String(r[4]);
    }
    const keys = Object.keys(slots);
    if (!keys.length) return false;
    window.tabData = window.tabData || {};
    window.tabData.productImages = window.tabData.productImages || [null, null, null];
    keys.forEach(function(k) {
        const slotIdx = parseInt(k, 10);
        const s = slots[k];
        window.tabData.productImages[slotIdx] = {
            data: s.chunks.join(''),
            w: parseInt(s.w, 10) || undefined,
            h: parseInt(s.h, 10) || undefined
        };
    });
    return true;
}

window.parseConceptSheetsFromWorkbook = function(workbook) {
    const a = _parseSummarySheetFromWorkbook(workbook);
    const b = _parseBriefSpecSheetFromWorkbook(workbook);
    const c = _parseMcTableSheetFromWorkbook(workbook);
    const d = _parseMcComparisonSheetFromWorkbook(workbook);
    const e = _parseMcSalesDetailSheetFromWorkbook(workbook);
    const f = _parseMcChangeLogSheetFromWorkbook(workbook);
    const g = _parseProductImagesSheetFromWorkbook(workbook);
    const h = _parseElecPartsSheetFromWorkbook(workbook);
    if (c && window.tabData) {
        // 💡 [2026-08-28 버그 수정] 엑셀의 M.C Table 시트에 "M.C Table-PTD R1"처럼 제품구분자(이름표)가
        //    붙어있으면, _parseMcTableSheetFromWorkbook은 그 데이터를 mcRevisionsByUnit['PTD']에 저장하고
        //    mcActiveUnit은 ''(기본/이름없음)으로 남겨둔다 — 드라이브 프로젝트를 불러올 때는 항상
        //    mcNormalizeAfterLoad()가 "첫 번째 제품구분자를 즉시 활성화"해주는데, 엑셀 파일을 여는 이
        //    경로에서는 그 호출이 빠져있었다. 그 결과 데이터는 정상적으로 저장됐는데도 화면은 계속
        //    빈 기본 자리를 보여줘서 "가격 정보가 안 보인다"는 문의로 이어졌음(새로고침 후 프로젝트를
        //    다시 열면 드라이브 로드 경로를 타서 정상화되니 그제서야 보였던 것). 드라이브 로드와
        //    동일하게 여기서도 정규화를 호출해 mcRevisions가 실제 활성 제품구분자를 가리키게 한다.
        if (window.mcNormalizeAfterLoad) window.mcNormalizeAfterLoad();
        // 💡 엑셀로 불러온 직후에도 "가장 최신(금액 있는) 리비전"을 기본으로 보여줌
        window.tabData.mcActiveRevision = window._mcLatestRevWithData(window.tabData.mcRevisions);
    }
    if ((a || b || c || d || e || f || g || h) && window.populateTabData) window.populateTabData();
};
// ── Summary 탭: Gantt chart Level 0 데이터와 연동된 진척 타임라인 (말풍선 + 텍스트) ──
function _sumTlEscHtml(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _sumTlFormatDate(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    return (d.getMonth() + 1) + '/' + d.getDate() + " '" + yy;
}
window.renderSummaryTimeline = function() {
    const container = document.getElementById('sum-level0-timeline');
    if (!container) return;
    if (!window.wrGetLevel0Timeline) {
        container.innerHTML = '<div style="color:#999; padding:10px 0;">Gantt chart 데이터를 불러오면 0레벨 항목이 타임라인으로 표시됩니다.</div>';
        return;
    }
    const tl = window.wrGetLevel0Timeline();
    if (!tl.items || tl.items.length === 0) {
        container.innerHTML = '<div style="color:#999; padding:10px 0;">' + (window._currentLang === 'en' ? 'No date set on Level 0 items — timeline unavailable.' : '0레벨 항목에 날짜가 없어 타임라인을 표시할 수 없습니다.') + '</div>';
        return;
    }
    const span = Math.max(1, tl.maxTs - tl.minTs);
    const sorted = tl.items.slice().sort(function(a, b) { return a.start - b.start; });

    // 겹침 방지: 최소 수평 간격(%) 확보 — 너무 가까운 항목은 밀어냄
    const MIN_GAP = 8; // % 단위
    const positions = sorted.map(function(it) { return ((it.start - tl.minTs) / span) * 100; });
    for (let pass = 0; pass < 5; pass++) {
        for (let i = 1; i < positions.length; i++) {
            if (positions[i] - positions[i-1] < MIN_GAP) {
                const mid = (positions[i] + positions[i-1]) / 2;
                positions[i-1] = mid - MIN_GAP / 2;
                positions[i]   = mid + MIN_GAP / 2;
            }
        }
        // 0~100 경계 클램프
        positions[0] = Math.max(0, positions[0]);
        positions[positions.length-1] = Math.min(100, positions[positions.length-1]);
    }

    const parts = sorted.map(function(it, i) {
        const dotPct    = ((it.start - tl.minTs) / span) * 100;
        const bubblePct = positions[i];
        const isAbove   = i % 2 === 0;
        const cls       = isAbove ? 'above' : 'below';
        return '<div class="sum-tl-dot" data-idx="' + i + '" style="left:' + dotPct + '%; cursor:pointer;" onclick="window.sumTlBringToFront(' + i + ')"></div>'
             + '<div class="sum-tl-bubble ' + cls + '" data-idx="' + i + '" data-dot-pct="' + dotPct + '" data-bubble-pct="' + bubblePct + '" data-above="' + (isAbove ? '1' : '0') + '" style="left:' + bubblePct + '%;" onclick="window.sumTlBringToFront(' + i + ')">'
             + _sumTlEscHtml(it.name) + '<br><span class="sum-tl-date">' + _sumTlFormatDate(it.start) + '</span></div>';
    }).join('');

    // 오늘 날짜 확인 (라벨 없이 붉은 점만 유지)
    let todayPart = '';
    const nowTs = new Date().getTime();
    if (nowTs >= tl.minTs && nowTs <= tl.maxTs) {
        const todayPct = ((nowTs - tl.minTs) / span) * 100;
        todayPart = '<div class="sum-tl-today-dot" style="left:' + todayPct + '%;"></div>';
    }

    // SVG 레이어는 inner 위에 overlay — 클릭 시 꺾은선을 여기에 그림
    container.innerHTML =
        '<div class="sum-tl-wrap" style="position:relative;">'
        + '<svg class="sum-tl-svg" style="position:absolute; left:56px; top:0; width:calc(100% - 112px); height:100%; overflow:visible; pointer-events:none; z-index:3;"></svg>'
        + '<div class="sum-tl-inner">'
        + '<div class="sum-tl-line-track"></div>'
        + parts
        + todayPart
        + '</div>'
        + '</div>';
};

// 클릭 시 박스 활성화 + 점↔박스 ㄱ자 꺾은선 연결
window.sumTlBringToFront = function(idx, containerId) {
    const container = document.getElementById(containerId || 'sum-level0-timeline');
    if (!container) return;
    const inner = container.querySelector('.sum-tl-inner');
    const svg   = container.querySelector('.sum-tl-svg');
    if (!inner || !svg) return;

    // 모든 버블/점 비활성화, 기존 선 제거
    inner.querySelectorAll('.sum-tl-bubble').forEach(function(b) { b.style.zIndex = '2'; b.classList.remove('active'); });
    inner.querySelectorAll('.sum-tl-dot').forEach(function(d) { d.style.background = '#6f42c1'; });
    svg.innerHTML = '';

    const bubble = inner.querySelector('.sum-tl-bubble[data-idx="' + idx + '"]');
    const dot    = inner.querySelector('.sum-tl-dot[data-idx="' + idx + '"]');
    if (!bubble || !dot) return;

    bubble.style.zIndex = '50'; bubble.classList.add('active');
    dot.style.background = '#1976d2';

    // ㄱ자 꺾은선 좌표 계산
    const trackW  = inner.offsetWidth;
    const isAbove = bubble.dataset.above === '1';
    const dotPct  = parseFloat(bubble.dataset.dotPct);
    const bblPct  = parseFloat(bubble.dataset.bubblePct);
    const dotX    = (dotPct / 100) * trackW;
    const bblX    = (bblPct / 100) * trackW;
    const bblH    = bubble.offsetHeight;
    const GAP     = 8;
    const wrapTop = inner.getBoundingClientRect().top;
    const svgEl   = container.querySelector('.sum-tl-svg');
    const svgTop  = svgEl.getBoundingClientRect().top;
    const offsetY = wrapTop - svgTop; // SVG top 기준으로 inner(선) 위치

    const y0   = offsetY;                                         // 점 y (선 중앙)
    const yEnd = isAbove ? offsetY - bblH - GAP : offsetY + bblH + GAP; // 박스 끝 y
    const yMid = (y0 + yEnd) / 2;                                // 꺾임 중간 y

    // ㄱ자: 점→수직 ymid → 수평 bblX → 수직 박스끝
    const path = 'M ' + dotX + ' ' + y0
               + ' L ' + dotX + ' ' + yMid
               + ' L ' + bblX + ' ' + yMid
               + ' L ' + bblX + ' ' + yEnd;

    svg.innerHTML = '<path d="' + path + '" fill="none" stroke="#1976d2" stroke-width="1.5" stroke-dasharray="4,3"/>';
};

// (sumTlBringToFront는 위 renderSummaryTimeline 블록 끝에 통합되었으므로 여기서는 제거)
document.addEventListener('DOMContentLoaded', function() {
    if (window.renderSummaryTimeline) window.renderSummaryTimeline();
    if (window.bsRefreshColumnVisibility) window.bsRefreshColumnVisibility();
    if (window.refreshMailModeButton) window.refreshMailModeButton();
    if (window.refreshMailIntervalSelect) window.refreshMailIntervalSelect();
    if (window._msLoadQueueFromStorage) window._msLoadQueueFromStorage();
    if (window._startMailAutoScheduler) window._startMailAutoScheduler();
    if (window.refreshAutoRegisterButton) window.refreshAutoRegisterButton();
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    if (window.refreshInboxCleanupModeButton) window.refreshInboxCleanupModeButton();
    // 💡 [2026-09-06 신규] 자동로그인 — 드롭다운 토글 버튼 초기 표시 동기화 + (켜져 있으면) 조용한 재연동 시도
    if (window.refreshAutoLoginButton) window.refreshAutoLoginButton(window.isAutoLoginEnabled && window.isAutoLoginEnabled());
    if (window._tryAutoLogin) window._tryAutoLogin();
});

function _escTabVal(v) { return (v === undefined || v === null) ? '' : String(v).replace(/"/g, '&quot;'); }

function _readRowsFromTbody(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return [];
    const rows = [];
    tbody.querySelectorAll('tr').forEach(function(tr) {
        if (tr.classList.contains('mc-summary-row')) return; // 합계/TOTAL 행은 저장 데이터에서 제외
        const catInput = tr.querySelector('td:not(.bm-no) input');
        const category = catInput ? catInput.value : '';
        const rowObj = { category: category };
        tr.querySelectorAll('input[data-field]').forEach(function(inp) {
            const realInp = tr.querySelector('input[data-real-for="' + inp.dataset.field + '"]');
            rowObj[inp.dataset.field] = realInp ? realInp.value : inp.value;
        });
        rows.push(rowObj);
    });
    return rows;
}

// ══════════════════════════════════════════════════════════════
// 📧 알람 메일 발송 (Python 로컬 서버 연동)
// ══════════════════════════════════════════════════════════════
const MAIL_SERVER = 'http://127.0.0.1:5000';
const ALARM_DAYS  = [7, 3, 1];   // 몇 일 전 알람

// 발송 이력 키 생성 (중복 방지)
const alarmKey = (rowId, dDay) => `gantt_alarm_${rowId}_${dDay}d`;

// 메일 발송
const sendAlarmMail = async (to, subject, body, cc) => {
    try {
        const res = await fetch(`${MAIL_SERVER}/send-mail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, cc: cc || '', subject, body })
        });
        return await res.json();
    } catch(e) {
        console.warn('메일 서버 미실행:', e.message);
        return { ok: false, error: e.message };
    }
};

// 알람 대상 행 수집 + 발송
window.checkAndSendAlarms = async function(isManual) {
    // 자동 체크(isManual=false)일 때만 ON/OFF 설정을 확인 — 수동 버튼(즉시 발송/일괄 발송)은 항상 동작
    if (!isManual) {
        const autoCfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
        if (autoCfg.autoSend === false) return; // OFF면 자동 체크(앱 시작/10·13·17시) 발송 안 함
    }

    // 서버 실행 여부 확인
    try {
        const h = await fetch(`${MAIL_SERVER}/health`, { signal: AbortSignal.timeout(2000) });
        const hd = await h.json();
        if (!hd.ok) throw new Error('서버 응답 없음');
    } catch(e) {
        if (isManual) {
            if (window.bmAlertModal) window.bmAlertModal('메일 서버가 실행되지 않았습니다.\nkortek_backend.bat을 먼저 실행해 주세요.');
            else alert('메일 서버가 실행되지 않았습니다.\nkortek_backend.bat을 먼저 실행해 주세요.');
        }
        return;
    }

    const pm      = window.projectMeta || {};
    const today   = new Date(); today.setHours(0,0,0,0);

    // 프로젝트 전체 멤버 이메일 수집
    const allEmails = [
        pm.프로젝트담당자이메일, pm.기구담당자이메일,
        pm.HW담당자이메일, pm.FW담당자이메일,
        pm.TSP담당자이메일, pm.LCM담당자이메일,
        pm.Slimming담당자이메일, pm.Cutting담당자이메일,
        pm.Module담당자이메일, pm.Tooling담당자이메일,
    ].filter(e => e && e.includes('@')).join(',');

    if (!allEmails) {
        if (isManual) {
            if (window.bmAlertModal) window.bmAlertModal('Summary 탭에 이메일 주소를 입력해 주세요.');
            else alert('Summary 탭에 이메일 주소를 입력해 주세요.');
        }
        return;
    }

    // 📌 알람 대상 행 + 완료일 수집
    //    (구버전은 존재하지 않는 '#gantt-body'/'data-col' 셀렉터를 써서 항상 0건이었음 —
    //     실제 행 데이터를 정확히 읽어오는 collectAlarmItems()를 재사용하도록 교체)
    let sentCount = 0;
    const items = window.collectAlarmItems ? window.collectAlarmItems() : [];
    // 이메일 본문용 D±n 표기 (알람 탭을 아직 한 번도 안 열었으면 window.dDayPlain이 없을 수 있어 안전하게 자체 정의)
    const dDayPlainSafe = window.dDayPlain || ((d) => (d === 0) ? 'D-Day' : (d < 0 ? 'D+' + Math.abs(d) : 'D-' + d));

    for (const item of items) {
        // 🚫 완료 예정일이 이미 지났으면(D-Day 다음날부터) 발송 자체를 하지 않음
        if (item.diffDays < 0) continue;

        // 도달했거나 이미 지난 단계들 (이 업무의 알람 일정 중 diffDays가 그 이하로 내려온 것들)
        const candidateDDays = item.alarmDays.filter(d => item.diffDays <= d);
        if (!candidateDDays.length) continue;

        // 🔧 여러 단계(7/3/1)가 한꺼번에 걸려도 오늘 발송은 딱 1건만 — 가장 임박한 단계 기준으로 발송
        const alreadySent = candidateDDays.every(d => localStorage.getItem(alarmKey(item.rowId, d)));

        // 일반 캐치업은 걸린 단계가 전부 이미 발송됐으면 스킵, "미발송 처리"된 경우는 재발송
        if (alreadySent && !item.sentHidden) continue;

        const projTitle = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';
        const subject   = `[Gantt 알람] ${projTitle} — "${item.taskName}" 완료일 ${dDayPlainSafe(item.diffDays)}`;
        const body      = `
<div style="font-family:'맑은 고딕',sans-serif; font-size:14px; color:#333;">
  <p><b>${item.assignee}님께</b></p>
  <p>아래 업무의 완료 예정일이 <b style="color:#e74c3c;">${dDayPlainSafe(item.diffDays)}일 (${item.dueStr})</b>입니다.</p>
  <table style="border-collapse:collapse; margin:12px 0; border:1px solid #dcdde1; width:100%; max-width:1000px;">
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">프로젝트</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${projTitle}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">업무</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.taskName}</td></tr>
    ${item.content ? `<tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; vertical-align:top; border:1px solid #dcdde1; width:90px; white-space:nowrap;">내용</td><td style="padding:6px 12px; white-space:normal; border:1px solid #dcdde1; word-break:break-word;">${window.alarmFormatContent ? window.alarmFormatContent(item.content).replace(/\n/g, '<br>') : item.content}</td></tr>` : ''}
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">담당자</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.assignee}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">완료 예정일</td><td style="padding:6px 12px; color:#e74c3c; border:1px solid #dcdde1;"><b>${item.dueStr}</b></td></tr>
  </table>
  <p style="color:#888; font-size:12px;">본 메일은 Gantt Chart 알람 시스템에서 자동 발송되었습니다.</p>
</div>`;

        // 담당자/수신인 이메일이 매칭돼 있으면 그쪽으로, 없으면 프로젝트 전체 멤버에게 발송
        const to     = item.toEmail || allEmails;
        const result = await sendAlarmMail(to, subject, body, item.ccMails);
        if (result.ok) {
            // 지나쳐온 단계(7/3/1)를 전부 '발송됨'으로 마킹 — 다음 체크에서 또 안 걸리도록
            candidateDDays.forEach(d => localStorage.setItem(alarmKey(item.rowId, d), new Date().toISOString()));
            if (item.sentHidden) localStorage.removeItem(`gantt_alarm_${item.rowId}_hidden`); // 재발송했으니 "미발송 처리" 표시 해제
            sentCount++;
            console.log(`[알람] 발송 완료: ${item.taskName} (${dDayPlainSafe(item.diffDays)})`);

            // 💡 텔레그램 발송 — 주소록 telegramId 기준으로 수신자 매칭 (🌐 외부 도메인 차단된 사람은 제외)
            //    + 수신 대상(CC)에 텔레그램이 켜진 사람도 함께 (2026-08-31: 기본수신/개별수신 신설)
            const ccTgChatIds = (item.ccRecipients || [])
                .filter(r => r.tgOn && r.telegramId && (!r.email || window._isAlarmDomainAllowed(r.email)))
                .map(r => r.telegramId);
            const tgChatIds = [...new Set([
                ...(item.allowedPeople
                    ? item.allowedPeople.map(n => { const p = window._addrFindByName(n); return p ? p.telegramId : ''; })
                    : [window._addrFindByName(item.assignee)].map(p => p ? p.telegramId : '')),
                ...ccTgChatIds
            ])].filter(Boolean);
            if (tgChatIds.length && window.sendTelegramAlarm) {
                // 💡 [2026-08-24] 100자 → 2000자로 확대. Telegram API 한도(4096자)엔 여유가 충분하고,
                //    이 100자는 순전히 앱 자체 제한이었음(kortek_backend.py는 별도 추가제한 없이 그대로 전달).
                const _tgContent = item.content ? '\n내용: ' + item.content.replace(/\n/g,' ').substring(0,2000) + (item.content.length>2000?'…':'') : '';
                const tgMsg = `📌 [Gantt 알람] ${projTitle}\n업무: ${item.taskName}\n담당: ${item.assignee}\n기한: ${item.dueStr} (${dDayPlainSafe(item.diffDays)})${_tgContent}`;
                tgChatIds.forEach(chatId => window.sendTelegramAlarm(tgMsg, { chatId }));
            }
        }
    }

    if (isManual) {
        const msg = sentCount > 0 ? `${sentCount}건의 알람 메일을 발송했습니다.` : '발송할 알람이 없습니다. (이미 발송됐거나 해당 없음)';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    } else if (sentCount > 0) {
        console.log(`[알람] 자동 발송 ${sentCount}건 완료`);
    }

    // 📢 공지 D-day 체크 (알람과 동일 스케줄에서 처리)
    if (typeof window.checkAndSendNotices === 'function') {
        await window.checkAndSendNotices(false);
    }
};

// 💡 [멀티시트] checkAndSendAlarms()는 화면(DOM)에 실제로 렌더링된 행을 기준으로 훑기 때문에
//    "지금 활성화된 시트" 하나만 체크할 수 있음 — 열려있는 시트 전부를 잠깐씩 전환해가며 순서대로
//    체크하고, 끝나면 원래 보던 시트로 되돌려놓는다. (자동/백그라운드 체크 전용 — 수동 버튼은 지금 보는
//    화면만 체크하는 게 자연스러워서 그대로 둠)
window._checkAndSendAlarmsAllSheets = async function(isManual) {
    if (!window._sheets || window._sheets.length <= 1) {
        return window.checkAndSendAlarms(isManual); // 시트가 0~1개면 지금 로직 그대로
    }
    const originalKey = window._activeSheetKey;
    window._commitActiveSheet(); // 지금 보는 시트도 최신 편집내용까지 포함해서 체크되도록
    const keys = window._sheets.map(function(s) { return s.key; });
    for (const key of keys) {
        if (key !== window._activeSheetKey) {
            window.switchToSheet(key);
            await new Promise(function(r) { setTimeout(r, 200); }); // 전환 후 렌더 완료 대기
        }
        try { await window.checkAndSendAlarms(isManual); }
        catch (e) { console.warn('[알람][멀티시트] 체크 실패:', key, e.message); }
    }
    if (originalKey && originalKey !== window._activeSheetKey) window.switchToSheet(originalKey);
};

// 📌 앱 실행 중 매일 10시/13시/17시에도 자동 체크 — 브라우저 탭이 열려 있는 동안만 동작
//    (앱 시작 시 체크는 DOMContentLoaded의 3초 후 setTimeout이 담당)
const ALARM_CHECK_HOURS = [10, 13, 17];
let _lastAutoAlarmHourStamp = null;
function _autoAlarmHourlyTick() {
    const now = new Date();
    if (!ALARM_CHECK_HOURS.includes(now.getHours())) return;
    const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${now.getHours()}`;
    if (stamp === _lastAutoAlarmHourStamp) return; // 같은 시간대에 이미 체크했으면 건너뜀
    _lastAutoAlarmHourStamp = stamp;
    if (window._checkAndSendAlarmsAllSheets) window._checkAndSendAlarmsAllSheets(false);
}
setInterval(_autoAlarmHourlyTick, 60 * 1000); // 1분마다 현재 시각이 체크 시간대인지 확인

// ══════════════════════════════════════════════════════════════
// ⚙️ 알람 설정 (SMTP / 자동발송 / CC)
// ══════════════════════════════════════════════════════════════

// 설정 불러오기
window.loadAlarmSettings = function() {
    try {
        return JSON.parse(localStorage.getItem('gantt_alarm_settings') || '{}');
    } catch(e) { return {}; }
};

// 🌐 외부 도메인 발송 허용 — 주소록(Address Book)에 등록된 이메일 도메인 중 @kortek.co.kr 이외 도메인 목록/인원수 추출
//    (자동알람 설정 모달의 "외부 도메인 발송 허용" 섹션에서 사용)
window.KORTEK_INTERNAL_DOMAIN = 'kortek.co.kr';
window.getAddressBookExternalDomains = function() {
    const addressBook = (window.tabData || {}).addressBook || [];
    const counts = {};
    addressBook.forEach(function(p) {
        const email = String((p && p.email) || '').trim().toLowerCase();
        const m = email.match(/@([^@\s]+)$/);
        if (!m) return;
        const domain = m[1];
        if (domain === window.KORTEK_INTERNAL_DOMAIN) return;
        counts[domain] = (counts[domain] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function(d) { return { domain: d, count: counts[d] }; });
};

// 이메일이 알람 발송 허용 대상인지 — @kortek.co.kr은 항상 허용, 그 외 도메인은 설정에서 체크된 것만 허용.
//    (안정화 전까지 외부인에게 알림 메일/메신저가 나가는 걸 막기 위한 기본 안전장치 — 기본값: 외부 전체 차단)
window._isAlarmDomainAllowed = function(email) {
    if (!email) return false;
    const m = String(email).trim().toLowerCase().match(/@([^@\s]+)$/);
    if (!m) return false;
    if (m[1] === window.KORTEK_INTERNAL_DOMAIN) return true;
    const cfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
    const allowed = cfg.allowedExternalDomains || [];
    return allowed.indexOf(m[1]) !== -1;
};

// 외부 도메인 체크박스 목록 렌더링
window.renderAlarmDomainList = function() {
    const wrap = document.getElementById('alarm-domain-list');
    if (!wrap) return;
    const domains = window.getAddressBookExternalDomains();
    const cfg = window.loadAlarmSettings();
    const allowed = new Set(cfg.allowedExternalDomains || []);
    if (!domains.length) {
        wrap.innerHTML = '<span style="font-size:11.5px; color:#aaa;">주소록에 @kortek.co.kr 이외 도메인이 없습니다.</span>';
        return;
    }
    wrap.innerHTML = domains.map(function(d) {
        const checked = allowed.has(d.domain) ? 'checked' : '';
        return `<label class="alarm-domain-row" style="display:flex; align-items:center; gap:8px; font-size:12px; padding:4px 6px; border-radius:4px; cursor:pointer;" onmouseover="this.style.background='#f7f9fb'" onmouseout="this.style.background=''">
            <input type="checkbox" class="alarm-domain-cb" value="${d.domain}" ${checked} style="cursor:pointer;">
            <span style="flex:1;">@${d.domain}</span>
            <span style="color:#999; font-size:10.5px;">${d.count}명</span>
        </label>`;
    }).join('');
};

// 설정 저장
// 💡 [2026-08-31] CC(기본수신) 명단은 이제 이 모달이 아니라 업무별 "개별 알림 설정" 모달의
//    [기본수신] 화면에서 바로 저장되므로(window._asSaveRecipients), 여기서는 더 이상 다루지 않음.
window.saveAlarmSettings = function() {
    const cfg = window.loadAlarmSettings();
    cfg.allowedExternalDomains = [...document.querySelectorAll('.alarm-domain-cb:checked')].map(cb => cb.value);
    localStorage.setItem('gantt_alarm_settings', JSON.stringify(cfg));
    window.closeAlarmSettings();
        window.showToast(window._currentLang === 'en' ? '✅ Settings saved.' : '✅ 설정이 저장되었습니다.');
};

// 자동발송 ON/OFF
window.setAlarmAuto = function(enabled) {
    const cfg = window.loadAlarmSettings();
    cfg.autoSend = enabled;
    localStorage.setItem('gantt_alarm_settings', JSON.stringify(cfg));
    window.refreshAlarmAutoButtons(enabled);
};

// 상단바 설정 버튼 dot + 드롭다운 토글 항목 업데이트
window.refreshAlarmAutoButtons = function(enabled) {
    // 드롭다운 토글 버튼
    const btn  = document.getElementById('alarm-toggle-btn');
    if (btn) {
        const isEn = window._currentLang === 'en';
        btn.textContent = enabled
            ? (isEn ? '🟢 Auto Alarm ON'  : '🟢 자동알람 ON')
            : (isEn ? '🔴 Auto Alarm OFF' : '🔴 자동알람 OFF');
    }
    // 모달 내 ON/OFF 버튼 (아직 있을 경우 호환)
    const onBtn  = document.getElementById('alarm-auto-on-btn');
    const offBtn = document.getElementById('alarm-auto-off-btn');
    if (!onBtn || !offBtn) return;
    if (enabled) {
        onBtn.style.background  = '#27ae60'; onBtn.style.color  = '#fff';
        offBtn.style.background = '#fff';    offBtn.style.color = '#555'; offBtn.style.borderColor = '#ccc';
    } else {
        offBtn.style.background = '#e03131'; offBtn.style.color = '#fff'; offBtn.style.borderColor = '#e03131';
        onBtn.style.background  = '#fff';    onBtn.style.color  = '#27ae60';
    }
};

// ══════════════════════════════════════════════════════════════
// 💬 Telegram 설정 함수
// ══════════════════════════════════════════════════════════════
const TG_SERVER = 'http://127.0.0.1:5000';

// 서버 상태 확인 시 Telegram 상태 배지 업데이트
window.refreshTgStatus = async function() {
    const badge = document.getElementById('tg-status-badge');
    try {
        const r = await fetch(`${TG_SERVER}/telegram/config`, { signal: AbortSignal.timeout(2000) });
        const d = await r.json();
        const _tgEn = window._currentLang === 'en';
        if (d.token_set) {
            if (badge) { badge.textContent = _tgEn ? '✅ Connected' : '✅ 연결됨'; badge.style.background = '#d4edda'; badge.style.color = '#155724'; }
            document.getElementById('tg-chatid').value = d.default_chat_id || '';
            if (d.token) { document.getElementById('tg-token').value = d.token; }
        } else {
            if (badge) { badge.textContent = _tgEn ? '⚠️ Not configured' : '⚠️ 미설정'; badge.style.background = '#fff3cd'; badge.style.color = '#856404'; }
        }
    } catch(e) {
        if (badge) { badge.textContent = window._currentLang === 'en' ? '🔴 Not Connected' : '🔴 서버 미연결'; badge.style.background = '#f8d7da'; badge.style.color = '#721c24'; }
    }
};
setTimeout(window.refreshTgStatus, 1500);

// Token / Chat ID 저장
window.saveTelegramConfig = async function() {
    const token   = document.getElementById('tg-token').value.trim();
    const chat_id = document.getElementById('tg-chatid').value.trim();
    const msg     = document.getElementById('tg-save-msg');
    if (!token || !chat_id) { alert('Token과 Chat ID를 모두 입력해주세요.'); return; }
    try {
        const r = await fetch(`${TG_SERVER}/telegram/config`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ token, default_chat_id: chat_id })
        });
        const d = await r.json();
        if (d.ok) {
            if (msg) { msg.style.color='#27ae60'; msg.textContent='✓ 저장 완료'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 3000); }
            window.refreshTgStatus();
        } else throw new Error(d.error);
    } catch(e) {
        if (msg) { msg.style.color='#e03131'; msg.textContent='❌ 오류: ' + e.message; }
    }
};

// 테스트 발송
window.testTelegram = async function() {
    const chat_id = document.getElementById('tg-chatid').value.trim();
    const msg     = document.getElementById('tg-save-msg');
    try {
        const r = await fetch(`${TG_SERVER}/telegram/test`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ chat_id })
        });
        const d = await r.json();
        if (d.ok) {
            if (msg) { msg.style.color='#27ae60'; msg.textContent='✓ 테스트 메시지 전송됨'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 3000); }
        } else throw new Error(d.error);
    } catch(e) {
        if (msg) { msg.style.color='#e03131'; msg.textContent='❌ ' + e.message; }
    }
};

// Drive에 암호화 저장
// ── Drive 전체 설정 저장 (SMTP + Telegram 동시) ──────────────
window.saveAllToDrive = async function() {
    const token   = document.getElementById('tg-token').value.trim();
    const chat_id = document.getElementById('tg-chatid').value.trim();
    const msg     = document.getElementById('tg-save-msg');
    const password = getAdminPassword();

    try {
        const tokenObj   = gapi.client.getToken();
        const driveToken = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!driveToken) { alert('Google Drive 연동이 필요합니다. 상단 연동 버튼을 먼저 클릭하세요.'); return; }

        // Flask에서 전체 설정 암호화 (mail + telegram 동시)
        const mData  = await (await fetch(`${TG_SERVER}/telegram/members`)).json();
        const encRes = await fetch(`${TG_SERVER}/all/encrypt`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                password,
                // token/chat_id는 현재 입력값 우선, 없으면 서버 저장값 사용
            })
        });
        const encData = await encRes.json();
        if (!encData.ok) throw new Error(encData.error);

        const folderId = await window.getOrCreateBackupFolder(driveToken);

        // SMTP 암호화 파일 업로드
        const mailFileId = await window._findDriveFile(driveToken, folderId, 'mail_secure.enc');
        await window._uploadDriveFile(driveToken, folderId, mailFileId,
            'mail_secure.enc', encData.mail_encrypted);

        // Telegram 암호화 파일 업로드
        const tgFileId = await window._findDriveFile(driveToken, folderId, 'telegram_secure.enc');
        await window._uploadDriveFile(driveToken, folderId, tgFileId,
            'telegram_secure.enc', encData.tg_encrypted);

        // 비밀번호 해시 저장 (팀원 동기화용)
        const newHash    = await window._sha256hex(password);
        const hashFileId = await window._findDriveFile(driveToken, folderId, 'gantt_pw_sync.json');
        await window._uploadDriveFile(driveToken, folderId, hashFileId, 'gantt_pw_sync.json',
            JSON.stringify({ hash: newHash, updatedAt: new Date().toISOString() }));

        if (msg) { msg.style.color='#27ae60'; msg.textContent='✓ SMTP + Telegram 전체 설정 Drive 저장 완료'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 4000); }
    } catch(e) {
        if (msg) { msg.style.color='#e03131'; msg.textContent='❌ ' + e.message; }
    }
};

// ── Drive 전체 설정 불러오기 (SMTP + Telegram 동시) ──────────
window.loadAllFromDrive = async function() {
    const msg      = document.getElementById('tg-save-msg');
    const password = getAdminPassword();
    try {
        const tokenObj   = gapi.client.getToken();
        const driveToken = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!driveToken) { alert('Google Drive 연동이 필요합니다. 상단 연동 버튼을 먼저 클릭하세요.'); return; }

        const folderId = await window.getOrCreateBackupFolder(driveToken);

        // 두 파일 동시 다운로드
        const [mailFileId, tgFileId] = await Promise.all([
            window._findDriveFile(driveToken, folderId, 'mail_secure.enc'),
            window._findDriveFile(driveToken, folderId, 'telegram_secure.enc')
        ]);

        if (!mailFileId && !tgFileId) {
            alert('Drive에 저장된 설정이 없습니다.\n먼저 [전체 설정 Drive 저장]을 실행하세요.');
            return;
        }

        const [mailEnc, tgEnc] = await Promise.all([
            mailFileId ? window._downloadDriveFile(driveToken, mailFileId) : Promise.resolve(''),
            tgFileId   ? window._downloadDriveFile(driveToken, tgFileId)   : Promise.resolve('')
        ]);

        // Flask에서 전체 복호화
        const decRes  = await fetch(`${TG_SERVER}/all/decrypt`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                password,
                mail_encrypted: mailEnc,
                tg_encrypted:   tgEnc
            })
        });
        const decData = await decRes.json();
        if (!decData.ok && !decData.results) throw new Error('복호화 실패');

        // UI 업데이트
        const mailResult = (decData.results || {}).mail     || {};
        const tgResult   = (decData.results || {}).telegram || {};
        window.refreshTgStatus();
        window.loadTgMemberList();
        window._tgAutoMatchFromSummary();

        // SMTP UI 업데이트 (서버에서 로드된 값으로)
        if (mailResult.ok) {
            const cfgRes = await fetch(`${TG_SERVER}/health`);
            const cfgData = await cfgRes.json();
            // 알람 설정 UI에 SMTP 값 반영
            const smtpUser = cfgData.smtp || '';
            const smtpEl   = document.getElementById('as-smtp-user');
            if (smtpEl && smtpUser !== '(미설정)') smtpEl.value = smtpUser;
        }

        const msgs = [
            mailResult.ok   ? `✓ SMTP: ${mailResult.message}`     : mailResult.error   ? `⚠️ SMTP: ${mailResult.error}` : '',
            tgResult.ok     ? `✓ Telegram: ${tgResult.message}`   : tgResult.error     ? `⚠️ TG: ${tgResult.error}` : '',
        ].filter(Boolean).join('\n');

        if (msg) { msg.style.color='#27ae60'; msg.textContent='✓ Drive에서 전체 설정 복원 완료'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 5000); }
        if (msgs) console.log('[Drive 로드]', msgs);

    } catch(e) {
        if (msg) { msg.style.color='#e03131'; msg.textContent='❌ ' + e.message; }
    }
};

// ── 하위 호환 — 구버전 함수명 유지 ──────────────────────────
window.saveTgToDrive   = window.saveAllToDrive;
window.loadTgFromDrive = window.loadAllFromDrive;
window._sha256hex = async function(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
};

window._findDriveFile = async function(token, folderId, fileName) {
    const q   = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const res = await fetch(
        // 💡 동명 파일이 중복 생성돼 있을 수 있어(동시저장 경합) 최신 수정본을 확정적으로 고르도록 정렬
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&fields=files(id)&orderBy=modifiedTime%20desc`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const d = await res.json();
    return (d.files && d.files[0]) ? d.files[0].id : null;
};

window._downloadDriveFile = async function(token, fileId) {
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return await res.text();
};

window._uploadDriveFile = async function(token, folderId, existingId, fileName, content) {
    const boundary = 'gantt_boundary_' + Date.now();
    const meta     = existingId ? {} : { name: fileName, parents: [folderId] };
    const body     = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n` +
                     `--${boundary}\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--`;
    const url      = existingId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&supportsAllDrives=true`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`;
    await fetch(url, {
        method:  existingId ? 'PATCH' : 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body
    });
};

// ── Drive 비밀번호 동기화 확인 (앱 시작 시 자동 실행) ─────────
window.checkPasswordSync = async function() {
    try {
        const tokenObj   = gapi.client.getToken();
        const driveToken = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!driveToken) return;

        const folderId   = await window.getOrCreateBackupFolder(driveToken);
        const hashFileId = await window._findDriveFile(driveToken, folderId, 'gantt_pw_sync.json');
        if (!hashFileId) return; // 최초 사용 — hash 없음

        const hashJson  = JSON.parse(await window._downloadDriveFile(driveToken, hashFileId));
        const driveHash = hashJson.hash;
        const localHash = await window._sha256hex(getAdminPassword());
        if (driveHash === localHash) return; // 동일 — 동기화 불필요

        // 비밀번호 변경 감지 → 팀원에게 새 비밀번호 입력 요청
        let newPw = prompt('🔔 팀 비밀번호가 변경되었습니다.\n새 비밀번호를 입력하세요.\n(5회 실패 시 취소됩니다)');
        for (let i = 0; i < 5; i++) {
            if (!newPw) return;
            const inputHash = await window._sha256hex(newPw.trim());
            if (inputHash === driveHash) {
                setAdminPassword(newPw.trim());
                // Telegram + SMTP 설정 자동 로드
                const [encFileId, mailFileId] = await Promise.all([
                    window._findDriveFile(driveToken, folderId, 'telegram_secure.enc'),
                    window._findDriveFile(driveToken, folderId, 'mail_secure.enc')
                ]);
                const [tgEnc, mailEnc] = await Promise.all([
                    encFileId  ? window._downloadDriveFile(driveToken, encFileId)  : Promise.resolve(''),
                    mailFileId ? window._downloadDriveFile(driveToken, mailFileId) : Promise.resolve('')
                ]);
                await fetch(`${TG_SERVER}/all/decrypt`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: newPw.trim(), tg_encrypted: tgEnc, mail_encrypted: mailEnc })
                });
                window.refreshTgStatus(); window.loadTgMemberList();
                alert('✅ 비밀번호 동기화 완료! SMTP + Telegram 설정도 자동 업데이트되었습니다.');
                return;
            }
            newPw = prompt(`❌ 비밀번호가 틀렸습니다. (${4 - i}회 남음)\n다시 입력하세요.`);
        }
        alert('❌ 비밀번호 5회 실패. 관리자에게 문의하세요.');
    } catch(e) { console.warn('[PW Sync]', e.message); }
};

// ── Drive에 Telegram 설정 암호화 저장 ────────────────────────
window.saveTgToDrive = async function() {
    const token   = document.getElementById('tg-token').value.trim();
    const chat_id = document.getElementById('tg-chatid').value.trim();
    const msg     = document.getElementById('tg-save-msg');
    if (!token || !chat_id) { alert('Token과 Chat ID를 먼저 입력하고 저장하세요.'); return; }
    const password = getAdminPassword();
    try {
        const tokenObj   = gapi.client.getToken();
        const driveToken = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!driveToken) { alert('Google Drive 연동이 필요합니다. 상단 연동 버튼을 먼저 클릭하세요.'); return; }

        // 팀원 목록 + 암호화
        const mData  = await (await fetch(`${TG_SERVER}/telegram/members`)).json();
        const encRes = await fetch(`${TG_SERVER}/telegram/encrypt`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ password, config: { token, default_chat_id: chat_id, members: mData.members || [] } })
        });
        const encData = await encRes.json();
        if (!encData.ok) throw new Error(encData.error);

        // Drive 업로드
        const folderId  = await window.getOrCreateBackupFolder(driveToken);
        const encFileId = await window._findDriveFile(driveToken, folderId, 'telegram_secure.enc');
        await window._uploadDriveFile(driveToken, folderId, encFileId, 'telegram_secure.enc', encData.encrypted);

        // 비밀번호 해시도 함께 저장 (팀원 동기화용)
        const newHash    = await window._sha256hex(password);
        const hashFileId = await window._findDriveFile(driveToken, folderId, 'gantt_pw_sync.json');
        await window._uploadDriveFile(driveToken, folderId, hashFileId, 'gantt_pw_sync.json',
            JSON.stringify({ hash: newHash, updatedAt: new Date().toISOString() }));

        if (msg) { msg.style.color='#27ae60'; msg.textContent='✓ Drive에 암호화 저장 완료 (비밀번호 해시 포함)'; setTimeout(()=>{ if(msg) msg.textContent=''; }, 4000); }
    } catch(e) {
        if (msg) { msg.style.color='#e03131'; msg.textContent='❌ ' + e.message; }
    }
};

// ── Drive에서 Telegram 설정 복호화 로드 ──────────────────────
window.loadTgFromDrive = async function() {
    const msg      = document.getElementById('tg-save-msg');
    const password = getAdminPassword();
    try {
        const tokenObj   = gapi.client.getToken();
        const driveToken = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!driveToken) { alert('Google Drive 연동이 필요합니다. 상단 연동 버튼을 먼저 클릭하세요.'); return; }

        const folderId  = await window.getOrCreateBackupFolder(driveToken);
        const encFileId = await window._findDriveFile(driveToken, folderId, 'telegram_secure.enc');
        if (!encFileId) { alert('Drive에 저장된 Telegram 설정이 없습니다.\n먼저 [Drive에 암호화 저장]을 실행하세요.'); return; }

        const encrypted = await window._downloadDriveFile(driveToken, encFileId);
        const decRes    = await fetch(`${TG_SERVER}/telegram/decrypt`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ password, encrypted })
        });
        const decData = await decRes.json();
        if (!decData.ok) throw new Error(decData.error);

        window.refreshTgStatus();
        window.loadTgMemberList();
        window._tgAutoMatchFromSummary();
        if (msg) { msg.style.color='#27ae60'; msg.textContent=`✓ ${decData.message}`; setTimeout(()=>{ if(msg) msg.textContent=''; }, 4000); }
    } catch(e) {
        if (msg) { msg.style.color='#e03131'; msg.textContent='❌ ' + e.message; }
    }
};

// 팀원 추가
window.addTgMember = async function() {
    const name     = document.getElementById('tg-m-name').value.trim();
    const chat_id  = document.getElementById('tg-m-chatid').value.trim();
    const roles    = document.getElementById('tg-m-roles')    ? document.getElementById('tg-m-roles').value.split(',').map(s=>s.trim()).filter(Boolean)    : [];
    const projects = document.getElementById('tg-m-projects') ? document.getElementById('tg-m-projects').value.split(',').map(s=>s.trim()).filter(Boolean) : [];
    const msg      = document.getElementById('tg-save-msg');
    if (!name || !chat_id) { alert('이름과 Chat ID는 필수입니다.'); return; }
    try {
        const r = await fetch(`${TG_SERVER}/telegram/members`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, chat_id, roles, projects })
        });
        const d = await r.json();
        if (d.ok) {
            ['tg-m-name','tg-m-chatid','tg-m-roles','tg-m-projects'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
            window.loadTgMemberList();
            if (msg) { msg.style.color='#27ae60'; msg.textContent='✓ ' + d.message; setTimeout(()=>{ if(msg) msg.textContent=''; }, 3000); }
        } else throw new Error(d.error);
    } catch(e) {
        if (msg) { msg.style.color='#e03131'; msg.textContent='❌ ' + e.message; }
    }
};

// 팀원 목록 렌더링
window.loadTgMemberList = async function() {
    const list = document.getElementById('tg-member-list');
    if (!list) return;
    try {
        const r = await fetch(`${TG_SERVER}/telegram/members`);
        const d = await r.json();
        if (!d.members || d.members.length === 0) {
            list.innerHTML = '<div style="font-size:11px; color:#aaa; padding:4px;">등록된 팀원 없음</div>';
            return;
        }
        list.innerHTML = d.members.map(m => `
            <div style="display:flex; align-items:center; gap:6px; font-size:11.5px; background:#fff; border:1px solid #eee; border-radius:4px; padding:4px 8px;">
              <span style="font-weight:bold; min-width:60px;">${m.name}</span>
              <span style="color:#666; font-size:10.5px;">${m.chat_id}</span>
              <span style="color:#2c5f8a; font-size:10.5px;">${(m.roles||[]).join(',') || '-'}</span>
              <span style="color:#888; font-size:10.5px; flex:1;">${(m.projects||[]).join(',') || '-'}</span>
              <button onclick="window.delTgMember('${m.name}')" style="padding:1px 7px; border:1px solid #e03131; color:#e03131; background:#fff; border-radius:3px; cursor:pointer; font-size:10.5px;">삭제</button>
            </div>`).join('');
    } catch(e) {
        list.innerHTML = '<div style="font-size:11px; color:#aaa;">' + (window._currentLang === 'en' ? 'Not Connected' : '서버 미연결') + '</div>';
    }
};

// 팀원 삭제
window.delTgMember = async function(name) {
    if (!confirm(window._t(`${name}을(를) 삭제할까요?`, `Delete "${name}"?`))) return;
    try {
        await fetch(`${TG_SERVER}/telegram/members`, {
            method: 'DELETE', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name })
        });
        window.loadTgMemberList();
    } catch(e) {}
};

// ── 알람 설정 아코디언 토글 ──────────────────────────────────
