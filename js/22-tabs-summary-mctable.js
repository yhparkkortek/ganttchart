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
window._toggleAlarmSection = function(id) {
    const el    = document.getElementById(id);
    const arrow = document.getElementById(id + '-arrow');
    if (!el) return;
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    const isEn = window._currentLang === 'en';
    if (arrow) arrow.textContent = open ? (isEn ? '▶ Expand' : '▶ 펼치기') : (isEn ? '▼ Collapse' : '▼ 접기');
};

// 💡 [2026-08-31] "처음 사용자 — 설치 안내" 섹션 안의 탭 전환 — 설치(Step1~4)/Telegram(Step5) 내용을
//    한 번에 다 펼쳐 보여주면 너무 길어서, 예전 팝업(install-guide-modal)과 동일하게 하나씩만
//    보이는 탭 방식으로 유지한다. ig-tab-*/ig-content-* id는 예전 팝업 것을 그대로 재사용.
window._switchAsInstallTab = function(tab) {
    const isSetup = tab === 'setup';
    const cSetup = document.getElementById('ig-content-setup');
    const cTg    = document.getElementById('ig-content-telegram');
    if (cSetup) cSetup.style.display = isSetup ? 'block' : 'none';
    if (cTg)    cTg.style.display    = isSetup ? 'none' : 'block';
    const tSetup = document.getElementById('ig-tab-setup');
    const tTg    = document.getElementById('ig-tab-telegram');
    if (tSetup) {
        tSetup.style.color = isSetup ? '#2c5f8a' : '#888';
        tSetup.style.borderBottom = isSetup ? '2px solid #2c5f8a' : '2px solid transparent';
        tSetup.style.background = isSetup ? '#f8fbff' : '#fff';
    }
    if (tTg) {
        tTg.style.color = isSetup ? '#888' : '#2c5f8a';
        tTg.style.borderBottom = isSetup ? '2px solid transparent' : '2px solid #2c5f8a';
        tTg.style.background = isSetup ? '#fff' : '#f8fbff';
    }
};

// ── Drive 드롭다운 메뉴 토글 ──────────────────────────────────
window._toggleDriveMenu = function(forceClose) {
    const menu = document.getElementById('tg-drive-menu');
    if (!menu) return;
    const show = forceClose === false ? false : menu.style.display === 'none';
    menu.style.display = show ? 'block' : 'none';
    if (show) {
        const close = (e) => {
            if (!menu.contains(e.target) && !e.target.closest('[onclick*="_toggleDriveMenu"]')) {
                menu.style.display = 'none';
            }
            document.removeEventListener('click', close);
        };
        setTimeout(() => document.addEventListener('click', close), 0);
    }
};

// ══════════════════════════════════════════════════════════════
// 📢 Notice (공지 관리) — 알람 계승형 반복 공지 시스템
// ══════════════════════════════════════════════════════════════

window._noticeItems = [];
window._noticeLogs  = [];
window._noticeLoad = function() {
    try { window._noticeItems = JSON.parse(localStorage.getItem('gantt_notice_items') || '[]'); } catch(e) { window._noticeItems = []; }
    try { window._noticeLogs  = JSON.parse(localStorage.getItem('gantt_notice_logs')  || '[]'); } catch(e) { window._noticeLogs  = []; }
};
window._noticeSave = function() {
    try {
        localStorage.setItem('gantt_notice_items', JSON.stringify(window._noticeItems));
        localStorage.setItem('gantt_notice_logs',  JSON.stringify(window._noticeLogs));
    } catch(e) {}
};
window._noticeLoad();
const _noticeAlarmKey = (id, day) => `gantt_notice_${id}_d${day}`;

window.renderNoticeTab = function() {
    window._noticeLoad();
    const tbody = document.getElementById('notice-table-body');
    if (!tbody) return;
    if (!window._noticeItems.length) {
        const _niEn = window._currentLang === 'en';
        tbody.innerHTML = `<tr><td colspan="7" style="padding:30px;text-align:center;color:#aaa;font-size:13px;">${_niEn ? 'No notices registered. Click [+ Add Notice] to add one.' : '등록된 공지가 없습니다. [+ 공지 등록] 버튼을 눌러 추가하세요.'}</td></tr>`;
        window._noticeRenderLog(); window.loadScheduleRulesFromBackend(); return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    tbody.innerHTML = window._noticeItems.map((n, i) => {
        const deadline = new Date(n.deadline); deadline.setHours(0,0,0,0);
        const diffDays = Math.ceil((deadline - today) / 86400000);
        const dDayStr  = diffDays===0?'D-Day':diffDays>0?`D-${diffDays}`:`D+${Math.abs(diffDays)}`;
        const isPast   = diffDays < 0;
        const isActive = n.status !== 'paused';
        const statusDot = isPast
            ? `<span style="font-size:16px;" title="발송 기간 종료">✅</span>`
            : `<span onclick="window.toggleNoticePause('${n.id}')" style="font-size:16px; cursor:pointer;" title="${isActive ? '🟢 발송 중 — 클릭하여 일시정지' : '🔴 정지됨 — 클릭하여 재개'}">${isActive ? '🟢' : '🔴'}</span>`;
        const lastSent = n.sentLog&&n.sentLog.length ? n.sentLog[n.sentLog.length-1].sentAt.slice(0,10) : '-';
        const rcp = n.recipients || [];
        const chParts = [];
        if (rcp.some(r=>r.emailOn)) chParts.push('<span title="이메일 발송 포함">📧</span>');
        if (rcp.some(r=>r.tgOn))    chParts.push('<span title="텔레그램 발송 포함">💬</span>');
        const targetLabel = chParts.join(' ') || '-';
        const dDaysLabel  = (n.alarmDays||[]).map(d=>`D-${d}`).join(', ');
        const rowBg = i%2===0?'#fff':'#e8f2f3';
        return `<tr style="background:${rowBg};border-bottom:1px solid #cfe3e5;">
          <td style="padding:10px 12px;text-align:center;font-size:16px;">${statusDot}</td>
          <td style="padding:10px 12px;">
            <div style="font-weight:bold;color:#333;font-size:12.5px;">${n.title}</div>
            <div style="font-size:11px;color:#888;margin-top:2px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n.body}</div>
          </td>
          <td style="padding:10px 12px;text-align:center;font-size:12.5px;color:#555;">${targetLabel}</td>
          <td style="padding:10px 12px;text-align:center;font-size:12.5px;color:${isPast?'#aaa':'#333'};">${n.deadline}</td>
          <td style="padding:10px 12px;text-align:center;">
            <span style="font-size:12px;font-weight:bold;color:${diffDays<=3&&diffDays>=0?'#e03131':diffDays<0?'#aaa':'#2c5f8a'};">${dDayStr}</span>
            <div style="font-size:10px;color:#aaa;">${dDaysLabel}</div>
          </td>
          <td style="padding:10px 12px;text-align:center;font-size:11.5px;color:#666;">${lastSent}</td>
          <td style="padding:10px 12px;text-align:center;">
            <div style="display:flex;gap:4px;justify-content:center;flex-wrap:nowrap;">
              <button onclick="window.sendNoticeNow('${n.id}')" title="즉시 발송"
                onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;border:1px solid #a5c8f0;color:#1a4f7a;background:#e8f4fd;border-radius:4px;cursor:pointer;padding:0;box-sizing:border-box;transition:background .15s, border-color .15s;">📤</button>
              <button onclick="window.openNoticeModal('${n.id}')" title="수정"
                onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';"
                style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;border:1px solid #edbf85;color:#a85d0a;background:#fbead9;border-radius:4px;cursor:pointer;padding:0;box-sizing:border-box;transition:background .15s, border-color .15s;">✏️</button>
              <button onclick="window.deleteNoticeItem('${n.id}')" title="삭제"
                onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';"
                style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;border:1px solid #eeb0ac;color:#b1432f;background:#fbe4e2;border-radius:4px;cursor:pointer;padding:0;box-sizing:border-box;transition:background .15s, border-color .15s;">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
    window._noticeRenderLog();
    window.loadScheduleRulesFromBackend();
};

window._noticeRenderLog = function() {
    const list = document.getElementById('notice-log-list');
    if (!list) return;
    const _isEn = window._currentLang === 'en';
    if (!window._noticeLogs.length) { list.innerHTML='<span style="color:#aaa;">' + (_isEn ? 'No send logs.' : '발송 로그가 없습니다.') + '</span>'; return; }
    list.innerHTML = window._noticeLogs.slice(0,30).map(l =>
        `<div style="padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:12px;">
          <span style="color:#aaa;font-size:11px;">${l.time}</span>
          <span style="margin-left:8px;font-weight:bold;color:#333;">${l.title}</span>
          <span style="margin-left:6px;color:#2c5f8a;font-size:11px;">${l.result}</span>
        </div>`
    ).join('');
};

window.openNoticeModal = async function(id) {
    const modal = document.getElementById('notice-modal');
    const bg    = document.getElementById('notice-modal-bg');
    if (!modal) return;

    // 커스텀 D-day 초기화
    window._nmCustomDays = [];
    window._nmRenderCustomTags();

    // 기간·반복 예약 필드 초기화 (레거시 D-day 공지 등록/수정 경로이므로 항상 발송방식=D-day로 리셋)
    window._nmSpecificDates = [];
    window._nmRenderSpecificDateTags();
    const dEl = document.getElementById('nm-mode-dday'); if (dEl) dEl.checked = true;
    window._nmToggleMode();
    const rEl = document.getElementById('nm-datemode-range'); if (rEl) rEl.checked = true;
    window._nmToggleDateMode();
    ['nm-recur-start','nm-recur-end'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
    const diEl = document.getElementById('nm-recur-day-interval'); if (diEl) diEl.value = 1;
    const stEl = document.getElementById('nm-recur-send-time'); if (stEl) stEl.value = '09:00';
    const ruleIdEl = document.getElementById('nm-schedule-rule-id'); if (ruleIdEl) ruleIdEl.value = '';

    document.getElementById('nm-edit-id').value = id || '';
    const _nmEn = window._currentLang === 'en';
    document.getElementById('notice-modal-title').textContent = id ? (_nmEn ? '📢 Edit Notice' : '📢 공지 수정') : (_nmEn ? '📢 Add Notice' : '📢 공지 등록');

    if (id) {
        const n = window._noticeItems.find(x => x.id === id);
        if (n) {
            document.getElementById('nm-title').value    = n.title;
            document.getElementById('nm-body').value     = n.body;
            document.getElementById('nm-deadline').value = n.deadline;

            // 기본 체크박스 복원
            [7,3,1,0].forEach(d => {
                const el = document.getElementById(`nm-d${d}`);
                if (el) el.checked = (n.alarmDays || []).includes(d);
            });
            // 커스텀 D-day 복원 (7,3,1,0 제외)
            window._nmCustomDays = (n.alarmDays || []).filter(d => ![7,3,1,0].includes(d));
            window._nmRenderCustomTags();

            }
    } else {
        ['nm-title','nm-body','nm-deadline'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
        [7,3,1].forEach(d => { const el=document.getElementById(`nm-d${d}`); if(el) el.checked=true; });
        const d0 = document.getElementById('nm-d0'); if(d0) d0.checked=false;
    }

    // 수신 대상 모드 — 수정 시 저장된 모드 복원, 신규 등록은 항상 개별수신(기존 동작과 동일)으로 시작
    const nExisting = id ? window._noticeItems.find(x => x.id === id) : null;
    const nmIsDefault = nExisting && nExisting.recipientMode === 'default';
    document.getElementById('nm-recip-mode-default').checked = !!nmIsDefault;
    document.getElementById('nm-recip-mode-custom').checked  = !nmIsDefault;
    window._nmLoadRecipients(nExisting);
    // 💡 [2026-08-31 버그 수정] 'block'으로 열면 CSS의 display:flex(헤더/본문 스크롤/푸터 3단 레이아웃)가
    //    인라인 스타일에 덮여 무효화된다 — 반드시 'flex'로 열어야 본문 스크롤·리사이즈가 의도대로 동작함.
    modal.style.display='flex';
    bg.style.display='flex';
    window.bringModalToFront('notice-modal');
};
window.closeNoticeModal = function() {
    const m=document.getElementById('notice-modal'); if(m) m.style.display='none';
    const b=document.getElementById('notice-modal-bg'); if(b) b.style.display='none';
};

// _noticeModalDragStart 제거 → _makeDraggable 공통 함수로 대체됨

// 통합 수신자 행 추가 — 이름 입력 → 이메일/텔레그램 자동완성, 채널별 on/off 토글
window._nmAddRecipientRow = function(name='', email='', telegramId='', emailOn=true, tgOn=true, auto=false) {
    const list = document.getElementById('nm-recipient-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'nm-recipient-row';
    row.dataset.email = email;
    row.dataset.tg = telegramId;
    row.style.cssText = 'display:grid; grid-template-columns:88px 52px 1fr 28px 28px 26px; column-gap:6px; align-items:center; padding:4px 0; border-bottom:1px solid #eee;';
    row.innerHTML = `
        <input class="nm-rr-name u-input" placeholder="이름 (자동완성)" value="${name}"
               list="nm-addr-namelist" oninput="window._nmRecipientAutofill(this)"
               style="width:100%; padding:5px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; box-sizing:border-box;">
        <span style="font-size:10px; color:#2c5f8a; background:${auto ? '#eaf2fa' : 'transparent'}; border-radius:3px; padding:2px 5px; white-space:nowrap; text-align:center; visibility:${auto ? 'visible' : 'hidden'};">summary</span>
        <span class="nm-rr-info" style="font-size:11.5px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${email || telegramId ? [email, telegramId ? 'TG:'+telegramId : ''].filter(Boolean).join(' · ') : '이름 입력 시 자동완성'}</span>
        <button type="button" class="nm-rr-email-btn" onclick="window._nmToggleChannel(this)"
                title="이메일 발송 on/off"
                style="width:28px; height:26px; border:1px solid ${emailOn?'#27ae60':'#ccc'}; background:${emailOn?'#e8f7ee':'#fff'}; color:${emailOn?'#27ae60':'#aaa'}; border-radius:3px; cursor:pointer; font-size:12px; padding:0;">📧</button>
        <button type="button" class="nm-rr-tg-btn" onclick="window._nmToggleChannel(this)"
                title="텔레그램 발송 on/off"
                style="width:28px; height:26px; border:1px solid ${tgOn?'#27ae60':'#ccc'}; background:${tgOn?'#e8f7ee':'#fff'}; color:${tgOn?'#27ae60':'#aaa'}; border-radius:3px; cursor:pointer; font-size:12px; padding:0;">💬</button>
        <button type="button" onclick="this.closest('.nm-recipient-row').remove(); window._asSyncRecipHeaderPad('nm-recipient-list');"
                style="width:26px; height:26px; border:none; background:none; color:#e03131; cursor:pointer; font-size:15px; padding:0;">✕</button>`;
    row.querySelector('.nm-rr-email-btn').dataset.on = emailOn ? '1' : '0';
    row.querySelector('.nm-rr-tg-btn').dataset.on = tgOn ? '1' : '0';
    list.appendChild(row);
    window._asSyncRecipHeaderPad('nm-recipient-list');

    window.attachAddressAutocomplete(row.querySelector('.nm-rr-name'), null, false, function(person) {
        row.dataset.email = person.email || '';
        row.dataset.tg = person.telegramId || '';
        const info = row.querySelector('.nm-rr-info');
        if (info) info.textContent = [person.email, person.telegramId ? 'TG:'+person.telegramId : ''].filter(Boolean).join(' · ') || '이메일/텔레그램 미등록';
    });
};

window._nmApplyChannelState = function(btn, on) {
    btn.dataset.on = on ? '1' : '0';
    btn.style.borderColor = on ? '#27ae60' : '#ccc';
    btn.style.background  = on ? '#e8f7ee' : '#fff';
    btn.style.color       = on ? '#27ae60' : '#aaa';
};

window._nmToggleChannel = function(btn) {
    window._nmApplyChannelState(btn, btn.dataset.on !== '1');
};

// 일괄 채널 토글 — 현재 전원 ON이면 전체 OFF, 하나라도 OFF면 전체 ON
window._nmBulkToggleChannel = function(type) {
    const btns = document.querySelectorAll('.nm-rr-' + type + '-btn');
    if (!btns.length) return;
    const allOn = Array.from(btns).every(b => b.dataset.on === '1');
    btns.forEach(b => window._nmApplyChannelState(b, !allOn));
};

// 일괄 삭제
window._nmBulkRemoveAll = function() {
    const list = document.getElementById('nm-recipient-list');
    if (list && list.children.length && confirm('수신자를 전체 삭제할까요?')) {
        list.innerHTML = '';
        window._asSyncRecipHeaderPad('nm-recipient-list');
    }
};

// (함수 전체 삭제 — attachAddressAutocomplete의 onPick 콜백으로 대체됨)

// 💡 [2026-08-31 신규] 수신 대상 기본수신/개별수신 — 업무별 알람과 동일한 개념/명단(gantt_alarm_settings
//    .ccList)을 공유한다. 라디오를 바꾸면 그 시점 값으로 목록을 다시 그림(미저장 편집은 버려짐 —
//    D-day 체크박스처럼 "저장"을 눌러야 확정되는 폼이라 자연스러운 동작, 업무별 알람과 동일 정책).
window._nmToggleRecipMode = function() {
    window._nmLoadRecipients(window._noticeItems.find(x => x.id === document.getElementById('nm-edit-id').value));
};

// Summary 담당자 기준 자동 등록 + 저장된 값 복원 (신규/수정 공통) — 기본수신/개별수신에 따라 소스가 다름
window._nmLoadRecipients = function(n) {
    const list = document.getElementById('nm-recipient-list');
    if (!list) return;
    list.innerHTML = '';

    const isDefault = document.getElementById('nm-recip-mode-default')?.checked;
    if (isDefault) {
        window._computeDefaultCcList().forEach(r => window._nmAddRecipientRow(r.name, r.email, r.telegramId, r.emailOn, r.tgOn, r.auto));
        return;
    }
    if (n && Array.isArray(n.recipients) && n.recipients.length) {
        n.recipients.forEach(r => window._nmAddRecipientRow(r.name, r.email, r.telegramId, r.emailOn !== false, r.tgOn !== false, !!r.auto));
        return;
    }
    const auto = window._autoRegisterCcFromMembers ? window._autoRegisterCcFromMembers() : [];
    const seen = new Set();
    auto.filter(m => { if (seen.has(m.email)) return false; seen.add(m.email); return true; })
        .forEach(m => {
            const p = window._addrFindByName ? window._addrFindByName(m.name) : null;
            window._nmAddRecipientRow(m.name, m.email, p ? (p.telegramId || '') : '', true, !!(p && p.telegramId), true);
        });
};

// ── 커스텀 D-day 태그 관리 ────────────────────────────────────
window._nmCustomDays = [];

window._nmAddCustomDay = function() {
    const input = document.getElementById('nm-d-custom');
    const val   = parseInt(input?.value);
    if (!val || val < 1 || val > 365) { input && input.focus(); return; }
    // 기본 체크박스와 중복 방지
    const presets = [7,3,1,0];
    if (presets.includes(val)) {
        const cb = document.getElementById(`nm-d${val}`);
        if (cb) { cb.checked = true; input.value = ''; return; }
    }
    if (window._nmCustomDays.includes(val)) { input.value = ''; return; }
    window._nmCustomDays.push(val);
    window._nmRenderCustomTags();
    input.value = '';
};

window._nmRenderCustomTags = function() {
    const wrap = document.getElementById('nm-d-custom-tags');
    if (!wrap) return;
    wrap.innerHTML = window._nmCustomDays.sort((a,b)=>b-a).map(d =>
        `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:#e8f0fb;border:1px solid #b0c4e8;border-radius:12px;font-size:11.5px;color:#2c5f8a;">
          D-${d}
          <button type="button" onclick="window._nmRemoveCustomDay(${d})"
                  style="background:none;border:none;cursor:pointer;color:#888;font-size:11px;padding:0;line-height:1;">✕</button>
        </span>`
    ).join('');
};

window._nmRemoveCustomDay = function(d) {
    window._nmCustomDays = window._nmCustomDays.filter(x => x !== d);
    window._nmRenderCustomTags();
};

// ── 발송 방식(D-day / 기간·반복) 및 날짜 지정방식(기간 / 특정 날짜) 토글 ──────
window._nmToggleMode = function() {
    const isRecur = document.getElementById('nm-mode-recur')?.checked;
    const ddayEl  = document.getElementById('nm-dday-fields');
    const recurEl = document.getElementById('nm-recur-fields');
    if (ddayEl)  ddayEl.style.display  = isRecur ? 'none' : 'grid';
    if (recurEl) recurEl.style.display = isRecur ? 'block' : 'none';
};

window._nmToggleDateMode = function() {
    const isSpecific = document.getElementById('nm-datemode-specific')?.checked;
    const rangeEl = document.getElementById('nm-daterange-fields');
    const specEl  = document.getElementById('nm-specific-dates-fields');
    if (rangeEl) rangeEl.style.display = isSpecific ? 'none' : 'grid';
    if (specEl)  specEl.style.display  = isSpecific ? 'block' : 'none';
};

// ── 특정 날짜 태그 관리 (커스텀 D-day 패턴과 동일) ──────────────────────────
window._nmSpecificDates = [];

window._nmAddSpecificDate = function() {
    const input = document.getElementById('nm-specific-date-input');
    const val = input?.value;
    if (!val) { input && input.focus(); return; }
    if (window._nmSpecificDates.includes(val)) { input.value = ''; return; }
    window._nmSpecificDates.push(val);
    window._nmSpecificDates.sort();
    window._nmRenderSpecificDateTags();
    input.value = '';
};

window._nmRenderSpecificDateTags = function() {
    const wrap = document.getElementById('nm-specific-date-tags');
    if (!wrap) return;
    wrap.innerHTML = window._nmSpecificDates.map(d =>
        `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:#e8f0fb;border:1px solid #b0c4e8;border-radius:12px;font-size:11.5px;color:#2c5f8a;">
          ${d}
          <button type="button" onclick="window._nmRemoveSpecificDate('${d}')"
                  style="background:none;border:none;cursor:pointer;color:#888;font-size:11px;padding:0;line-height:1;">✕</button>
        </span>`
    ).join('');
};

window._nmRemoveSpecificDate = function(d) {
    window._nmSpecificDates = window._nmSpecificDates.filter(x => x !== d);
    window._nmRenderSpecificDateTags();
};

// 수신자 수집 (이름/이메일/텔레그램ID + 채널별 on/off) — D-day/기간반복 저장 경로 공용
window._nmCollectRecipients = function() {
    return [...document.querySelectorAll('.nm-recipient-row')].map(row => {
        const name = row.querySelector('.nm-rr-name')?.value.trim() || '';
        return {
            name,
            email: row.dataset.email || '',
            telegramId: row.dataset.tg || '',
            emailOn: row.querySelector('.nm-rr-email-btn')?.dataset.on === '1',
            tgOn: row.querySelector('.nm-rr-tg-btn')?.dataset.on === '1'
        };
    }).filter(r => r.name && (r.emailOn || r.tgOn));
};

// 💡 [2026-08-31 신규] 지금 화면 상태(기본수신/개별수신)를 실제로 반영 — 기본수신이면 화면의 명단을
//    전체 공용 명단(gantt_alarm_settings.ccList, 업무별 알람과 동일 저장소)에 그대로 덮어써서 다른
//    공지·업무 알람에도 즉시 적용되게 하고, 개별수신이면 그냥 이 공지만의 명단으로 반환.
window._nmPersistRecipientMode = function() {
    const recipients = window._nmCollectRecipients();
    const recipientMode = document.getElementById('nm-recip-mode-default')?.checked ? 'default' : 'custom';
    if (recipientMode === 'default') {
        const cfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
        cfg.ccList = recipients;
        localStorage.setItem('gantt_alarm_settings', JSON.stringify(cfg));
    }
    return { recipientMode, recipients };
};

window.saveNoticeItem = function() {
    const isRecur = document.getElementById('nm-mode-recur')?.checked;
    if (isRecur) { window._nmSaveRecurRule(); return; }

    const title    = document.getElementById('nm-title').value.trim();
    const body     = document.getElementById('nm-body').value.trim();
    const deadline = document.getElementById('nm-deadline').value;
    if (!title || !body || !deadline) { alert('제목, 내용, 기준일은 필수입니다.'); return; }

    // D-day 수집 (기본 체크박스 + 커스텀)
    const presetDays  = [7,3,1,0].filter(d => { const el=document.getElementById(`nm-d${d}`); return el&&el.checked; });
    const alarmDays   = [...new Set([...presetDays, ...(window._nmCustomDays||[])])].sort((a,b)=>b-a);

    const { recipientMode, recipients } = window._nmPersistRecipientMode();

    const editId = document.getElementById('nm-edit-id').value;
    if (editId) {
        const idx = window._noticeItems.findIndex(x => x.id === editId);
        if (idx >= 0) window._noticeItems[idx] = { ...window._noticeItems[idx], title, body, deadline, alarmDays, recipients, recipientMode };
    } else {
        window._noticeItems.push({
            id: 'notice_' + Date.now(), title, body, deadline, alarmDays,
            recipients, recipientMode,
            status: 'active', sentLog: [], createdAt: new Date().toISOString().slice(0,10)
        });
    }
    window._noticeSave();
    window.closeNoticeModal();
    window.renderNoticeTab();
};

// ── 기간·반복 예약 발송 규칙 저장 (백엔드 스케줄러가 "언제" 발송할지 담당) ──
window._nmSaveRecurRule = async function() {
    const title = document.getElementById('nm-title').value.trim();
    const body  = document.getElementById('nm-body').value.trim();
    if (!title || !body) { alert('제목, 내용은 필수입니다.'); return; }

    const { recipients } = window._nmPersistRecipientMode();
    if (!recipients.length) { alert('수신 대상을 1명 이상 추가해주세요.'); return; }

    const dateMode = document.getElementById('nm-datemode-specific')?.checked ? 'specific' : 'range';
    let startDate = '', endDate = '', dayInterval = 1;
    if (dateMode === 'range') {
        startDate = document.getElementById('nm-recur-start').value;
        endDate   = document.getElementById('nm-recur-end').value;
        if (!startDate || !endDate) { alert('시작일/종료일을 입력해주세요.'); return; }
        if (startDate > endDate) { alert('종료일이 시작일보다 빠릅니다.'); return; }
        dayInterval = parseInt(document.getElementById('nm-recur-day-interval').value, 10) || 1;
    } else {
        if (!window._nmSpecificDates.length) { alert('특정 날짜를 1개 이상 추가해주세요.'); return; }
    }

    // 💡 [2026-08-31] 시간창(시작~종료+몇시간마다) 대신 "발송 시각" 하나만 받음 — 백엔드 스키마는
    //    그대로 두고(hourStart/hourEnd/hourInterval), 시작=종료=이 시각으로 보내 하루 1번만 걸리게 함
    //    (_rule_today_buckets가 시작==종료면 그 시각 1개만 버킷으로 만듦 — kortek_backend.py 참고).
    const sendTime     = document.getElementById('nm-recur-send-time').value || '09:00';
    const hourStart    = sendTime;
    const hourEnd      = sendTime;
    const hourInterval = 1;
    const ruleId       = document.getElementById('nm-schedule-rule-id').value || undefined;

    const payload = {
        id: ruleId, type: 'notice', title, message: body, recipients,
        dateMode, startDate, endDate, specificDates: window._nmSpecificDates.slice(),
        dayInterval, hourStart, hourEnd, hourInterval, enabled: true
    };

    try {
        const health = await fetch(`${MAIL_SERVER}/health`, { signal: AbortSignal.timeout(2000) });
        if (!health.ok) throw new Error();
    } catch (e) {
        alert('❌ 메일 서버(kortek_backend.py)가 실행되지 않았습니다.\n예약 발송(기간·반복)은 이 서버가 켜져 있어야 등록/동작합니다.');
        return;
    }

    try {
        const res = await fetch(`${MAIL_SERVER}/schedule`, {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        window.closeNoticeModal();
        window.loadScheduleRulesFromBackend();
    } catch (e) {
        alert('❌ 예약 규칙 저장 실패: ' + e.message);
    }
};

// ── 예약 발송 규칙 관리 (백엔드 /schedule API) ──────────────────────────────
window._scheduleRules = [];

window.loadScheduleRulesFromBackend = async function() {
    const tbody = document.getElementById('schedule-rule-table-body');
    if (!tbody) return; // 공지 탭이 아직 렌더되지 않은 시점이면 스킵
    try {
        const res = await fetch(`${MAIL_SERVER}/schedule`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        window._scheduleRules = (data && data.rules) || [];
    } catch (e) {
        window._scheduleRules = null; // 서버 연결 불가 상태 표시용
    }
    window.renderScheduleRuleTable();
};

window.renderScheduleRuleTable = function() {
    const tbody = document.getElementById('schedule-rule-table-body');
    if (!tbody) return;
    if (window._scheduleRules === null) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:#e67e22;font-size:12.5px;">⚠️ 메일 서버(kortek_backend.py)에 연결할 수 없습니다 — 실행 후 새로고침해주세요.</td></tr>`;
        return;
    }
    if (!window._scheduleRules.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:#aaa;font-size:12.5px;">등록된 예약 발송 규칙이 없습니다. [+ 공지 등록]에서 "기간·반복"을 선택해 추가하세요.</td></tr>`;
        return;
    }
    tbody.innerHTML = window._scheduleRules.map((r, i) => {
        const rowBg = i % 2 === 0 ? '#fff' : '#e8f2f3';
        const dateLabel = r.dateMode === 'specific'
            ? `특정 ${(r.specificDates||[]).length}일`
            : `${r.startDate||'?'} ~ ${r.endDate||'?'} (${r.dayInterval||1}일마다)`;
        const timeLabel = `${r.hourStart||'09:00'}~${r.hourEnd||'21:00'} (${r.hourInterval||1}h마다)`;
        const typeLabel = r.type === 'alarm' ? '업무 알람' : '공지';
        const isOn = r.enabled !== false;
        const statusIcon = `<span onclick="window.toggleScheduleRuleEnabled('${r.id}')" style="cursor:pointer;font-size:16px;" title="${isOn ? '🟢 켜짐 — 클릭하여 끄기' : '🔴 꺼짐 — 클릭하여 켜기'}">${isOn ? '🟢' : '🔴'}</span>`;
        return `<tr style="background:${rowBg};border-bottom:1px solid #cfe3e5;">
          <td style="padding:8px 12px;text-align:center;">${statusIcon}</td>
          <td style="padding:8px 12px;">
            <div style="font-weight:bold;color:#333;font-size:12.5px;">${escapeHtml(r.title||'')}</div>
            <div style="font-size:11px;color:#888;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.message||'')}</div>
          </td>
          <td style="padding:8px 12px;text-align:center;font-size:12px;color:#555;">${typeLabel}</td>
          <td style="padding:8px 12px;text-align:center;font-size:11.5px;color:#555;">${dateLabel}</td>
          <td style="padding:8px 12px;text-align:center;font-size:11.5px;color:#555;">${timeLabel}</td>
          <td style="padding:8px 12px;text-align:center;">
            <div style="display:flex;gap:4px;justify-content:center;">
              <button onclick="window.openScheduleRuleEditModal('${r.id}')" title="수정"
                style="width:26px;height:26px;border:1px solid #edbf85;color:#a85d0a;background:#fbead9;border-radius:4px;cursor:pointer;font-size:12px;">✏️</button>
              <button onclick="window.deleteScheduleRule('${r.id}')" title="삭제"
                style="width:26px;height:26px;border:1px solid #eeb0ac;color:#b1432f;background:#fbe4e2;border-radius:4px;cursor:pointer;font-size:12px;">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
};

window.toggleScheduleRuleEnabled = async function(id) {
    const rule = (window._scheduleRules || []).find(r => r.id === id);
    if (!rule) return;
    rule.enabled = !(rule.enabled !== false);
    window.renderScheduleRuleTable();
    try {
        await fetch(`${MAIL_SERVER}/schedule`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rule) });
    } catch (e) {
        alert('❌ 상태 변경 실패: 메일 서버에 연결할 수 없습니다.');
        rule.enabled = !(rule.enabled !== false);
        window.renderScheduleRuleTable();
    }
};

window.deleteScheduleRule = async function(id) {
    if (!confirm('이 예약 발송 규칙을 삭제할까요?')) return;
    try {
        await fetch(`${MAIL_SERVER}/schedule/${id}`, { method: 'DELETE' });
    } catch (e) {}
    window.loadScheduleRulesFromBackend();
};

// 규칙 목록에서 "수정" 클릭 시 — 공지 등록 모달을 기간·반복 모드로 열어 기존 값 채움
window.openScheduleRuleEditModal = async function(ruleId) {
    const rule = (window._scheduleRules || []).find(r => r.id === ruleId);
    if (!rule) { alert('규칙을 찾을 수 없습니다.'); return; }

    await window.openNoticeModal(); // 신규 등록 상태로 모달 초기화(리셋)부터 시작

    document.getElementById('nm-title').value = rule.title || '';
    document.getElementById('nm-body').value  = rule.message || '';
    document.getElementById('nm-schedule-rule-id').value = rule.id;
    const _nmEn = window._currentLang === 'en';
    document.getElementById('notice-modal-title').textContent = _nmEn ? '📢 Edit Scheduled Rule' : '📢 예약 발송 규칙 수정';

    document.getElementById('nm-mode-recur').checked = true;
    window._nmToggleMode();

    if (rule.dateMode === 'specific') {
        document.getElementById('nm-datemode-specific').checked = true;
        window._nmSpecificDates = (rule.specificDates || []).slice();
    } else {
        document.getElementById('nm-datemode-range').checked = true;
        document.getElementById('nm-recur-start').value = rule.startDate || '';
        document.getElementById('nm-recur-end').value = rule.endDate || '';
        document.getElementById('nm-recur-day-interval').value = rule.dayInterval || 1;
    }
    window._nmToggleDateMode();
    window._nmRenderSpecificDateTags();

    // 💡 예전 규칙(시간창)에서 넘어온 경우 hourStart를 발송 시각으로 사용
    document.getElementById('nm-recur-send-time').value = rule.hourStart || '09:00';

    // 수신자 다시 채우기 (규칙 자체의 저장값 기준 — 프로젝트 담당자 자동등록으로 덮이지 않도록 마지막에 처리)
    const list = document.getElementById('nm-recipient-list');
    if (list) list.innerHTML = '';
    (rule.recipients || []).forEach(r => window._nmAddRecipientRow(r.name, r.email, r.telegramId, r.emailOn !== false, r.tgOn !== false));
};
window.deleteNoticeItem = function(id) {
    if(!confirm(window._t('이 공지를 삭제하면 D-day 자동 발송이 중단됩니다. 삭제할까요?','Deleting this notice will stop D-day auto-send. Delete anyway?'))) return;
    window._noticeItems=window._noticeItems.filter(x=>x.id!==id);
    [7,3,1,0].forEach(d=>{try{localStorage.removeItem(_noticeAlarmKey(id,d));}catch(e){}});
    window._noticeSave(); window.renderNoticeTab();
};
window.toggleNoticePause = function(id) {
    const n=window._noticeItems.find(x=>x.id===id); if(!n) return;
    n.status=n.status==='paused'?'active':'paused';
    window._noticeSave(); window.renderNoticeTab();
};
window.sendNoticeNow = async function(id, skipLog) {
    const n=window._noticeItems.find(x=>x.id===id); if(!n) return {ok:false};
    const pm=window.projectMeta||{};
    const allEmails=[pm.프로젝트담당자이메일,pm.기구담당자이메일,pm.HW담당자이메일,pm.FW담당자이메일,pm.TSP담당자이메일,pm.LCM담당자이메일].filter(e=>e&&e.includes('@')).join(',');
    const today=new Date();today.setHours(0,0,0,0);
    const deadline=new Date(n.deadline);deadline.setHours(0,0,0,0);
    const diffDays=Math.ceil((deadline-today)/86400000);
    const dDayStr=diffDays===0?'D-Day':diffDays>0?`D-${diffDays}`:`D+${Math.abs(diffDays)}`;
    const tgMsg=`📢 <b>${n.title}</b>\n\n${n.body}\n\n📅 기준일: ${n.deadline} (${dDayStr})\n<i>KORTEK Gantt PM 공지</i>`;
    const emailBody=`<div style="font-family:'맑은 고딕',sans-serif;font-size:14px;color:#333;"><p><b>📢 ${n.title}</b></p><hr style="border:none;border-top:1px solid #eee;margin:10px 0;"><p style="white-space:pre-wrap;">${n.body.replace(/</g,'&lt;')}</p><p style="margin-top:12px;color:#666;font-size:12px;">📅 기준일: ${n.deadline} (${dDayStr})</p><p style="color:#aaa;font-size:11px;">KORTEK Gantt PM 공지 발송</p></div>`;
    let results=[];
    // 💡 [2026-08-31] 수신 대상이 "기본수신"이면 저장된 값이 아니라 그 시점 공용 명단을 다시 조회
    //    (업무별 알람과 동일하게 운영 — 기본수신 편집은 어디서 하든 즉시 전체에 반영됨)
    const recipients = n.recipientMode === 'default' ? window._computeDefaultCcList() : (n.recipients || []);
    const toEmail = recipients.filter(r => r.emailOn && r.email).map(r => r.email).join(',');
    if(toEmail){
        try{const r=await fetch(`${MAIL_SERVER}/send-mail`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:toEmail,subject:`[공지] ${n.title}`,body:emailBody})});const d=await r.json();results.push(d.ok?'📧 메일 완료':`📧 오류:${d.error}`);}catch(e){results.push(`📧 오류:${e.message}`);}
    }
    const tgTargets = recipients.filter(r => r.tgOn && r.telegramId);
    if(tgTargets.length && window.sendTelegramAlarm){
        try{
            const pm2 = window.projectMeta || {};
            const projTitle2 = [pm2.고객사, pm2.고객모델명].filter(Boolean).join(' > ') || 'KORTEK Gantt';
            const tgMsgNew = `📢 [${projTitle2}] ${n.title}\n\n${n.body}\n\n📅 기준일: ${n.deadline} (${dDayStr})`;
            let successCount = 0;
            const failedNames = [];
            const seenIds = new Set();
            for(const r of tgTargets){
                if (seenIds.has(r.telegramId)) continue;
                seenIds.add(r.telegramId);
                const res = await window.sendTelegramAlarm(tgMsgNew, {chatId: r.telegramId});
                if (res && res.ok) successCount++;
                else failedNames.push(`${r.name}(${res ? res.errDesc : '오류'})`);
            }
            results.push(`💬 Telegram ${successCount}/${seenIds.size}명 완료` + (failedNames.length ? ` — 실패: ${failedNames.join(', ')}` : ''));
        }catch(e){results.push(`💬 오류:${e.message}`);}
    }
    const resultStr=results.join(' | ')||'수신 대상 없음';
    if(!skipLog){
        n.sentLog=n.sentLog||[];
        n.sentLog.push({day:diffDays,sentAt:new Date().toISOString().slice(0,10)});
        window._noticeLogs.unshift({time:new Date().toLocaleString('ko-KR'),title:n.title,result:resultStr});
        if(window._noticeLogs.length>50) window._noticeLogs.pop();
        window._noticeSave(); window.renderNoticeTab();
        if(window.bmAlertModal) window.bmAlertModal(`발송 완료\n${resultStr}`); else alert(`발송 완료\n${resultStr}`);
    }
    return {ok:true,result:resultStr};
};
window.checkAndSendNotices = async function(isManual) {
    window._noticeLoad();
    const today=new Date();today.setHours(0,0,0,0);
    let sentCount=0;
    for(const n of window._noticeItems){
        if(n.status==='paused') continue;
        const deadline=new Date(n.deadline);deadline.setHours(0,0,0,0);
        const diffDays=Math.ceil((deadline-today)/86400000);
        if(diffDays<0) continue;
        const candidateDays=(n.alarmDays||[]).filter(d=>diffDays<=d);
        if(!candidateDays.length) continue;
        if(candidateDays.every(d=>localStorage.getItem(_noticeAlarmKey(n.id,d)))) continue;
        const res=await window.sendNoticeNow(n.id,true);
        if(res.ok){
            candidateDays.forEach(d=>{try{localStorage.setItem(_noticeAlarmKey(n.id,d),new Date().toISOString());}catch(e){}});
            n.sentLog=n.sentLog||[];n.sentLog.push({day:diffDays,sentAt:new Date().toISOString().slice(0,10)});
            window._noticeLogs.unshift({time:new Date().toLocaleString('ko-KR'),title:n.title,result:res.result});
            sentCount++;
        }
    }
    if(window._noticeLogs.length>50) window._noticeLogs.length=50;
    window._noticeSave();
    if(isManual){const msg=sentCount>0?`공지 ${sentCount}건 발송 완료`:'발송할 공지 없음';if(window.bmAlertModal)window.bmAlertModal(msg);else alert(msg);}
    else if(sentCount>0) console.log(`[공지] 자동 발송 ${sentCount}건 완료`);
    return sentCount;
};
window.noticeUpdateEmailTarget=window._nmEmailToggle||function(){};
window.noticeUpdateTgTarget=window._nmTgToggle||function(){};
window.sendNotice=function(){alert('[+ 공지 등록]으로 등록 후 ✉️ 버튼으로 발송하세요.');};
window._noticeHistory=[];window._addNoticeHistory=function(){};
window._renderNoticeHistory=window.renderNoticeTab;

// 주소록에서 이름 선택 시 Chat ID 자동입력
window._tgAutofillFromAddr = function(nameInput) {
    const name = nameInput.value.trim();
    if (!name) return;
    // datalist가 비어있으면 먼저 채움 (openAlarmSettings를 거치지 않은 경우 대비)
    const nameList = document.getElementById('alarm-cc-namelist');
    if (nameList && !nameList.children.length) {
        const addressBook = (window.tabData || {}).addressBook || [];
        const opts = [];
        addressBook.forEach(function(p) {
            if (p.name)   opts.push(p.name);
            if (p.nameEn) opts.push(p.nameEn);
        });
        nameList.innerHTML = opts.map(function(n) { return '<option value="' + n.replace(/"/g,'&quot;') + '">'; }).join('');
    }
    const person = window._addrFindByName ? window._addrFindByName(name) : null;
    if (!person) return;
    const chatIdEl = document.getElementById('tg-m-chatid');
    if (chatIdEl && person.telegramId) chatIdEl.value = person.telegramId;
};

window._tgAutoMatchFromSummary = function() {
    const pm = window.projectMeta || {};
    const memberKeys = ['프로젝트담당자','기구담당자','HW담당자','FW담당자','BLU담당자',
        'TSP담당자','LCM담당자','Slimming담당자','Cutting담당자','Tooling담당자'];
    const names = memberKeys.map(k => (pm[k] || '').trim()).filter(Boolean);
    const addressBook = (window.tabData || {}).addressBook || [];
    const matched = [];
    names.forEach(function(name) {
        name.split(/[,，]/).map(s => s.trim()).filter(Boolean).forEach(function(n) {
            const p = window._addrFindByName(n);
            if (p && p.telegramId) matched.push({ name: n, chatId: p.telegramId });
        });
    });
    const subEl = document.getElementById('as-tg-recv-sub');
    if (subEl) subEl.textContent = matched.length
        ? (window._currentLang === 'en'
            ? '(Auto from Summary — ' + matched.length + ' matched)'
            : '(Summary 멤버 자동 반영 — ' + matched.length + '명 매칭)')
        : (window._currentLang === 'en' ? '(Summary member auto-sync)' : '(Summary 멤버 자동 반영)');
};

// Telegram 발송 헬퍼 (알람과 통합)
window.sendTelegramAlarm = async function(message, opts = {}) {
    try {
        const res = await fetch(`${TG_SERVER}/send-telegram`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message, ...opts })
        });
        const data = await res.json();
        // 서버가 200을 줘도 실제 전송(sent)이 0이면 실패로 취급 (예: "chat not found")
        const ok = res.ok && (data.sent > 0);
        const errDesc = (data.results && data.results[0] && data.results[0].result && !data.results[0].result.ok)
            ? data.results[0].result.description : (ok ? '' : '알 수 없는 오류');
        return { ok, errDesc };
    } catch(e) {
        console.warn('Telegram 발송 실패:', e.message);
        return { ok: false, errDesc: e.message };
    }
};

// SMTP 서버에 저장 (즉시 적용)
window.saveSmtpConfig = async function() {
    const cfg = {
        host: document.getElementById('as-smtp-host').value.trim(),
        port: parseInt(document.getElementById('as-smtp-port').value) || 25,
        user: document.getElementById('as-smtp-user').value.trim(),
        pass: document.getElementById('as-smtp-pass').value,
    };
    if (!cfg.host || !cfg.user || !cfg.pass) {
        alert('서버 주소, 계정, 비밀번호를 모두 입력해 주세요.'); return;
    }
    const msgEl = document.getElementById('as-smtp-save-msg');

    // ✅ host/port/user/pass 모두 로컬 저장 — 다음에 열 때 자동으로 채워짐
    const localCfg = window.loadAlarmSettings();
    localCfg.smtp = { host: cfg.host, port: cfg.port, user: cfg.user, pass: cfg.pass };
    localStorage.setItem('gantt_alarm_settings', JSON.stringify(localCfg));
    // 💡 AI 업무 분석 탭의 메일 서버 계정 표시도 같은 계정을 공유하므로 즉시 갱신
    if (window._msRefreshServerAccountStatus) window._msRefreshServerAccountStatus();

    try {
        const res = await fetch('http://127.0.0.1:5000/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg)
        });
        const data = await res.json();
        if (data.ok) {
            if (msgEl) { msgEl.style.color = '#27ae60'; msgEl.textContent = '✓ 서버에 즉시 적용됨'; setTimeout(() => { if(msgEl) msgEl.textContent=''; }, 3000); }
        } else throw new Error(data.error);
    } catch(e) {
        if (msgEl) msgEl.style.color = '#e67e22';
        if (msgEl) { msgEl.textContent = '⚠ 로컬엔 저장됨, 서버 미연결 (kortek_backend.bat 확인)'; setTimeout(() => { if(msgEl) { msgEl.textContent=''; msgEl.style.color='#27ae60'; } }, 5000); }
    }
};

// ══════════════════════════════════════════════════════════════
// 👥 수신 대상(기본수신/개별수신) 공용 행 UI — alarm-schedule-modal(#as-recip-list)에서 사용.
//    공지 등록의 수신자 행(_nmAddRecipientRow, 이름/이메일/텔레그램/채널on-off)과 같은 모양이지만,
//    한 화면에 "기본수신"(전체 공용 명단) / "개별수신"(이 업무만의 명단) 두 목록을 상황에 따라
//    갈아끼워 보여줘야 해서 별도 함수로 둔다(컨테이너 id를 항상 받아 그 안에서만 동작 — 공지 등록
//    쪽의 document 전체 조회 방식과 달리 동시에 여러 모달이 떠 있어도 서로 안 섞이게 함).
// ══════════════════════════════════════════════════════════════
window._asRecipAddRow = function(containerId, r) {
    const row0 = window._normalizeRecipRow(r || {});
    const list = document.getElementById(containerId);
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'as-recip-row';
    row.dataset.email = row0.email;
    row.dataset.tg = row0.telegramId;
    row.style.cssText = 'display:grid; grid-template-columns:88px 52px 1fr 28px 28px 26px; column-gap:6px; align-items:center; padding:4px 0; border-bottom:1px solid #eee;';
    row.innerHTML = `
        <input class="as-recip-name u-input" placeholder="이름 (자동완성)" value="${row0.name}"
               oninput="window._asRecipAutofill(this)"
               style="width:100%; padding:5px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; box-sizing:border-box;">
        <span style="font-size:10px; color:#2c5f8a; background:${row0.auto ? '#eaf2fa' : 'transparent'}; border-radius:3px; padding:2px 5px; white-space:nowrap; text-align:center; visibility:${row0.auto ? 'visible' : 'hidden'};">auto</span>
        <span class="as-recip-info" style="font-size:11.5px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row0.email || row0.telegramId ? [row0.email, row0.telegramId ? 'TG:'+row0.telegramId : ''].filter(Boolean).join(' · ') : '이름 입력 시 자동완성'}</span>
        <button type="button" class="as-recip-email-btn" onclick="window._asRecipToggleChannel(this)" title="이메일 발송 on/off"
                style="width:28px; height:26px; border:1px solid ${row0.emailOn?'#27ae60':'#ccc'}; background:${row0.emailOn?'#e8f7ee':'#fff'}; color:${row0.emailOn?'#27ae60':'#aaa'}; border-radius:3px; cursor:pointer; font-size:12px; padding:0;">📧</button>
        <button type="button" class="as-recip-tg-btn" onclick="window._asRecipToggleChannel(this)" title="텔레그램 발송 on/off"
                style="width:28px; height:26px; border:1px solid ${row0.tgOn?'#27ae60':'#ccc'}; background:${row0.tgOn?'#e8f7ee':'#fff'}; color:${row0.tgOn?'#27ae60':'#aaa'}; border-radius:3px; cursor:pointer; font-size:12px; padding:0;">💬</button>
        <button type="button" onclick="this.closest('.as-recip-row').remove(); window._asSyncRecipHeaderPad('${containerId}');"
                style="width:26px; height:26px; border:none; background:none; color:#e03131; cursor:pointer; font-size:15px; padding:0;">✕</button>`;
    row.querySelector('.as-recip-email-btn').dataset.on = row0.emailOn ? '1' : '0';
    row.querySelector('.as-recip-tg-btn').dataset.on = row0.tgOn ? '1' : '0';
    list.appendChild(row);
    window._asSyncRecipHeaderPad(containerId);

    window.attachAddressAutocomplete(row.querySelector('.as-recip-name'), null, false, function(person) {
        row.dataset.email = person.email || '';
        row.dataset.tg = person.telegramId || '';
        const info = row.querySelector('.as-recip-info');
        if (info) info.textContent = [person.email, person.telegramId ? 'TG:'+person.telegramId : ''].filter(Boolean).join(' · ') || '이메일/텔레그램 미등록';
    });
};

window._asRecipApplyChannelState = function(btn, on) {
    btn.dataset.on = on ? '1' : '0';
    btn.style.borderColor = on ? '#27ae60' : '#ccc';
    btn.style.background  = on ? '#e8f7ee' : '#fff';
    btn.style.color       = on ? '#27ae60' : '#aaa';
};
window._asRecipToggleChannel = function(btn) {
    window._asRecipApplyChannelState(btn, btn.dataset.on !== '1');
};
// 일괄 채널 토글 — 컨테이너 안에서만 동작(다른 모달의 같은 클래스 행에 영향 없음)
window._asRecipBulkToggleChannel = function(containerId, type) {
    const btns = document.querySelectorAll(`#${containerId} .as-recip-${type}-btn`);
    if (!btns.length) return;
    const allOn = Array.from(btns).every(b => b.dataset.on === '1');
    btns.forEach(b => window._asRecipApplyChannelState(b, !allOn));
};
window._asRecipBulkRemoveAll = function(containerId) {
    const list = document.getElementById(containerId);
    if (list && list.children.length && confirm('수신자를 전체 삭제할까요?')) list.innerHTML = '';
    window._asSyncRecipHeaderPad(containerId);
};
// 수신자 수집 — 이름/이메일/텔레그램ID + 채널별 on/off (이름·채널 둘 다 꺼져있으면 제외)
window._asRecipCollect = function(containerId) {
    return [...document.querySelectorAll(`#${containerId} .as-recip-row`)].map(row => {
        const name = row.querySelector('.as-recip-name')?.value.trim() || '';
        return {
            name,
            email: row.dataset.email || '',
            telegramId: row.dataset.tg || '',
            emailOn: row.querySelector('.as-recip-email-btn')?.dataset.on === '1',
            tgOn: row.querySelector('.as-recip-tg-btn')?.dataset.on === '1',
        };
    }).filter(r => r.name && (r.emailOn || r.tgOn));
};
// 이름만 입력하고 자동완성을 안 거친 경우(직접 타이핑 중) 표시용 안내만 갱신 — 실제 매칭은 onPick에서
window._asRecipAutofill = function(input) {
    const row = input.closest('.as-recip-row');
    const info = row && row.querySelector('.as-recip-info');
    if (info && !row.dataset.email && !row.dataset.tg) info.textContent = '이름 입력 시 자동완성';
};

// 💡 목록에 스크롤바가 생기면 그만큼 폭이 줄어 행의 채널 버튼 위치가 헤더보다 왼쪽으로 밀리는 문제 보정
//    (containerId="as-recip-list", headerId="as-recip-header" 고정 쌍으로 사용)
window._asSyncRecipHeaderPad = function(containerId) {
    const list = document.getElementById(containerId);
    const header = document.getElementById(containerId.replace('-list', '-header'));
    if (!list || !header) return;
    const sbWidth = list.offsetWidth - list.clientWidth;
    header.style.paddingRight = sbWidth > 0 ? sbWidth + 'px' : '';
};

// 💡 [버그 수정] 메일 본문에서 AI가 이름을 "있는 그대로" 추출하다 보니 "윤재권 팀장님"처럼
//    직함/존칭이 붙어 나오는 경우가 매우 흔한데, 주소록엔 "윤재권"처럼 직함 없이 등록돼 있어
//    문자열이 정확히 일치하지 않으면 이메일을 아예 못 찾던 문제 — 흔한 직함/존칭 접미사를
//    떼어내고 재시도하는 폴백을 추가한다. (앞에 붙는 "팀장 윤재권" 형태나, 영문 Mr./Manager 등도 함께 처리)
const ADDR_KO_TITLE_WORDS = [
    '회장','부회장','사장','부사장','대표','전무','상무','이사','감사',
    '본부장','소장','센터장','실장','팀장','파트장','그룹장','랩장',
    '수석','책임','선임','주임','매니저','대리','과장','차장','부장','사원','연구원'
];
const ADDR_EN_TITLE_WORDS = ['mr','mrs','ms','miss','dr','prof','manager','director','leader','president','vp','ceo','cto','coo'];

// 이름 뒤(또는 앞)에 붙은 흔한 직함/존칭을 반복적으로 떼어낸 결과를 돌려줌 (원본과 다를 때만 폴백 매칭에 사용)
window._addrStripTitleSuffix = function(name) {
    let n = String(name || '').trim();
    let changed = true;
    while (changed) {
        changed = false;
        const before = n;
        n = n.replace(/\s*(님|씨)\s*$/u, '').trim(); // 끝의 "님"/"씨" 제거
        for (const t of ADDR_KO_TITLE_WORDS) {
            if (n.endsWith(t) && n.length > t.length) { n = n.slice(0, -t.length).trim(); break; }
            if (n.startsWith(t) && n.length > t.length) { n = n.slice(t.length).trim(); break; } // "팀장 윤재권" 형태
        }
        for (const t of ADDR_EN_TITLE_WORDS) {
            const reSuf = new RegExp('[.,]?\\s*' + t + '\\.?$', 'i');
            const rePre = new RegExp('^' + t + '\\.?\\s*', 'i');
            if (reSuf.test(n)) { n = n.replace(reSuf, '').trim(); break; }
            if (rePre.test(n)) { n = n.replace(rePre, '').trim(); break; }
        }
        if (n !== before) changed = true;
    }
    return n;
};

// 💡 [버그 수정] 알람 발신/수신인 원문에는 "정민희/임희철"("/" 구분 공동 발신) 또는
//    "박용훈 외 다수"/"홍길동 외 3명"(수신인이 너무 많아 요약된 형태)처럼 쉼표 하나로는 못 쪼개는
//    패턴이 메일 파싱 결과에 섞여 들어올 때가 있다 — 이걸 안 쪼개면 통째로 주소록에 없는 문자열이
//    되어 이메일을 못 찾고 "미등록 ⚠"으로만 표시된다. 쉼표뿐 아니라 "/"로도 나누고, 각 조각 끝의
//    "외 N명"/"외 다수" 꼬리표를 떼어 실제 이름만 남긴다.
window._addrSplitNames = function(str) {
    if (!str) return [];
    return String(str).split(/[,，\/]/)
        .map(n => n.trim())
        .map(n => n.replace(/\s*외\s*(\d+\s*(명|인)?|다수)?\s*$/u, '').trim()) // "박용훈 외 다수"→"박용훈", "홍길동 외 3명"→"홍길동"
        .filter(Boolean);
};

// 💡 이름으로 주소록에서 사람 찾기 — 한글 이름으로 먼저 찾고, 없으면 영문 이름으로 폴백.
//    정확히 일치하는 게 없으면 직함/존칭을 뗀 이름으로 한 번 더 시도.
window._addrFindByName = function(name) {
    if (!name) return null;
    const addressBook = (window.tabData || {}).addressBook || [];
    const tryExact = function(n) {
        if (!n) return null;
        let found = addressBook.find(p => p.name && p.name.trim() === n);
        if (!found) found = addressBook.find(p => p.nameEn && p.nameEn.trim().toLowerCase() === n.toLowerCase());
        return found || null;
    };
    const trimmed = String(name).trim();
    let found = tryExact(trimmed);
    if (found) return found;
    const stripped = window._addrStripTitleSuffix(trimmed);
    if (stripped && stripped !== trimmed) found = tryExact(stripped);
    return found || null;
};

// 💡 Summary 프로젝트 멤버(담당자 10종 + 멤버-3)를 참조인 후보로 변환 — 이메일은 주소록 기준
window._autoRegisterCcFromMembers = function() {
    const pm = window.projectMeta || {};
    const lookup = name => {
        const found = window._addrFindByName(name);
        return found ? (found.email || '') : '';
    };
    const members = [];
    ['프로젝트담당자','기구담당자','HW담당자','FW담당자','TSP담당자',
     'LCM담당자','Slimming담당자','Cutting담당자','Module담당자','Tooling담당자'].forEach(k => {
        (pm[k] || '').split(/[,，]/).map(n => n.trim()).filter(Boolean).forEach(n => {
            const email = lookup(n);
            if (email) members.push({ name: n, email });
        });
    });
    ((window.tabData || {}).projectMembers3 || []).forEach(m => {
        if (m.name && m.email) members.push({ name: m.name.trim(), email: m.email.trim() });
    });
    return members;
};

// (함수 전체 삭제 — attachAddressAutocomplete의 이메일 자동 채움 기능이 동일 역할 수행)

// 자동알람 토글 (드롭다운에서 직접 호출)
window.toggleAlarmAuto = function() {
    const cfg     = window.loadAlarmSettings();
    const enabled = cfg.autoSend !== false; // 현재 상태
    window.setAlarmAuto(!enabled);          // 반전
    // 💡 [2026-08-24] 예전엔 여기서 드롭다운을 항상 닫았는데, 토글 버튼은 상태를 여러 번 눌러가며
    //    바꾸는 용도라 매번 닫히면 다시 열어야 해서 불편함 — 이제 열림 유지는 상단 topbar-popup
    //    위임 리스너(data-keep-open="true")가 일괄 처리하므로 여기서 따로 닫지 않음.
};

// 💡 메일 자동배치 3단계 토글 — 'full'(완전자동·녹색) / 'semi'(반자동·주황) / 'off'(꺼짐·빨강)
//    full : 수집→분석→점수→Gantt자동등록→알람 전체 자동
//    semi : 수집→분석→점수→TaskInbox 대기 (사람 확인 후 등록)
//    off  : 아무것도 안 함
window.getMailMode = function() {
    return localStorage.getItem('mail_mode') || 'semi'; // 기본값 반자동
};
// 하위 호환 래퍼 — 기존 참조 코드(_autoMailFetchTick 등) 수정 불필요
window.isMailAutoProcessEnabled = function() { return window.getMailMode() !== 'off'; };
window.isAutoRegisterEnabled    = function() { return window.getMailMode() === 'full'; };

window.refreshMailModeButton = function() {
    const btn = document.getElementById('mail-mode-toggle-btn');
    if (!btn) return;
    const mode = window.getMailMode();
    const isEn = window._currentLang === 'en';
    if (mode === 'full') {
        btn.textContent = isEn ? '🟢 Mail Auto (Gantt)' : '🟢 메일 완전자동 (Gantt)';
        btn.style.color = '#2f7a2f';
    } else if (mode === 'semi') {
        btn.textContent = isEn ? '🟠 Mail Semi-Auto (Inbox)' : '🟠 메일 반자동 (보관함)';
        btn.style.color = '#b85c00';
    } else {
        btn.textContent = isEn ? '🔴 Mail Auto OFF' : '🔴 메일 자동배치 OFF';
        btn.style.color = '#c92a2a';
    }
};

window.toggleMailMode = function() {
    const cur = window.getMailMode();
    const next = cur === 'full' ? 'semi' : cur === 'semi' ? 'off' : 'full';
    localStorage.setItem('mail_mode', next);
    window.refreshMailModeButton();
    // D안: OFF → ON 전환 시 즉시 1회 수집 (테스트 재수집 대체)
    if (cur === 'off' && next !== 'off') {
        if (window._autoMailFetchTick) {
            localStorage.removeItem(window.MS_LAST_AUTO_FETCH_KEY || 'ms_last_auto_fetch');
            window._autoMailFetchTick();
            if (window.showToast) window.showToast('📬 메일 자동배치 ON — 즉시 수집 시작', 'info');
        }
    }
};
// 구버전 함수명 폴백
window.refreshMailProcessButton  = window.refreshMailModeButton;
window.refreshAutoRegisterButton = window.refreshMailModeButton;

// 💡 수집 주기 (분). 기본값 30분 — POP3 서버 로그인 부하 고려한 보수적 시작값.
//    ①번 자동 트리거 구현 시 이 값을 setInterval 주기로 사용 예정 (지금은 저장만 함)
window.getMailAutoInterval = function() {
    return parseInt(localStorage.getItem('mail_auto_process_interval_min'), 10) || 30;
};

// 💡 [2026-08-29 신규] "완료된 프로젝트도 메일 자동매칭 대상에 포함할지" — 개인별 로컬 설정
//    (getMailAutoInterval과 동일한 저장 방식). 기본값은 "제외"(false) — 저장된 값이 아예 없으면
//    (신규 사용자·아직 이 설정을 저장한 적 없는 브라우저) 안전한 기본값으로 완료 프로젝트를 뺀다.
window.getMailAutoCollectCompleted = function() {
    return localStorage.getItem('mail_auto_collect_completed') === '1';
};

window.onMailIntervalChange = function() {
    const sel = document.getElementById('mail-process-interval');
    if (!sel) return;
    localStorage.setItem('mail_auto_process_interval_min', sel.value);
};

window.refreshMailIntervalSelect = function() {
    const sel = document.getElementById('mail-process-interval');
    if (!sel) return;
    sel.value = String(window.getMailAutoInterval());
};

// 설정 모달 열기
window.openAlarmSettings = function() {
    const cfg  = window.loadAlarmSettings();
    const smtp = cfg.smtp || {};
    document.getElementById('as-smtp-host').value = smtp.host || 'kmail.kortek.co.kr';
    document.getElementById('as-smtp-port').value = smtp.port || 25;
    document.getElementById('as-smtp-user').value = smtp.user || '';
    document.getElementById('as-smtp-pass').value = smtp.pass || '';
    window.refreshAlarmAutoButtons(cfg.autoSend !== false);
    window.renderAlarmDomainList();
    document.getElementById('alarm-settings-overlay').style.display = 'flex';
    // 💡 반드시 'flex'로 열어야 헤더/본문 스크롤/푸터 3단 레이아웃(flex-direction:column)이 적용됨
    //    ('block'으로 열면 CSS의 display:flex가 인라인 스타일에 덮여 무효화됨 — notice-modal과 동일 이슈)
    document.getElementById('alarm-settings-modal').style.display  = 'flex';
    window.bringModalToFront('alarm-settings-modal');
};

// 💡 [2026-08-31 신규] "이메일 수신자 선택"(기본수신 CC 명단)을 알람 설정 모달에서 빼서, 업무별
//    "개별 알림 설정"(alarm-schedule-modal)의 [기본수신] 버튼 아래로 옮겼다 — 어느 업무에서 열든
//    같은 전체 공용 명단을 그 자리에서 바로 보고 수정할 수 있다. 이 두 헬퍼는 그 화면에서 재사용:
//    ① 옛 스키마(email만/enabled)와 새 스키마(email+텔레그램/emailOn·tgOn)를 하나로 정규화
window._normalizeRecipRow = function(r) {
    return {
        name: (r && r.name) || '',
        email: (r && r.email) || '',
        telegramId: (r && r.telegramId) || '',
        emailOn: r && r.emailOn !== undefined ? r.emailOn !== false : !(r && r.enabled === false),
        tgOn: !!(r && r.tgOn),
        auto: !!(r && r.auto),
    };
};
// ② Summary 프로젝트 멤버 기준 자동 참조인 + 기존 수동 추가분을 합쳐 "기본수신" 후보 목록 계산
//    (기존 자동 등록자의 on/off 상태는 유지, 신규 자동 등록자는 기본 OFF — 사용자가 직접 켜야 발송)
window._computeDefaultCcList = function() {
    const cfg = window.loadAlarmSettings();
    const prevList = (cfg.ccList || []).map(window._normalizeRecipRow);
    const prevByEmail = {};
    prevList.forEach(r => { if (r.email) prevByEmail[r.email] = r; });

    const seen = new Set();
    const autoList = window._autoRegisterCcFromMembers()
        .filter(m => { if (seen.has(m.email)) return false; seen.add(m.email); return true; })
        .map(m => {
            const prev = prevByEmail[m.email];
            const p = window._addrFindByName ? window._addrFindByName(m.name) : null;
            return {
                name: m.name, email: m.email, auto: true,
                telegramId: (prev && prev.telegramId) || (p ? (p.telegramId || '') : ''),
                emailOn: prev ? prev.emailOn : false,
                tgOn:    prev ? prev.tgOn    : false,
            };
        });
    const manualList = prevList.filter(r => !r.auto && !seen.has(r.email));
    return [...autoList, ...manualList];
};

// 💡 [2026-08-31] "처음 사용자 — 설치 안내"가 별도 팝업(install-guide-modal)이 아니라 알람 설정
//    안의 한 섹션(sec-server, 펼치면 바로 내용이 보임)으로 옮겨지면서, 이 팝업을 열고 탭을 전환하던
//    openInstallGuideModal/closeInstallGuideModal/switchInstallTab은 더 이상 아무 데서도 호출되지
//    않아 제거함. 안내 내용 자체(ig-content-setup/ig-content-telegram id, 배지 등)는 그대로 재사용됨.
window.closeAlarmSettings = function() {
    document.getElementById('alarm-settings-overlay').style.display = 'none';
    document.getElementById('alarm-settings-modal').style.display   = 'none';
};

// ══════════════════════════════════════════════════════════════
// 🔔 알람 탭 렌더링 & 모달
// ══════════════════════════════════════════════════════════════
window._alarmCurrentItem = null;

// 업무내용 줄바꿈 정리: 날짜 이후, [섹션키워드] 이전에 개행 — 모달/메일 공용
window.alarmFormatContent = function(text) {
    return String(text || '')
        .replace(/_x000d_/gi, '\n')              // 엑셀 CR 치환
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')  // 윈도우 개행 정규화
        .replace(/(\d{4}-\d{2}-\d{2})\s+/g, '$1\n')  // 날짜 뒤 개행
        .replace(/\]\s*\[(핵심내용|To\s*[Dd]o|비고|결과|일정|특이사항|진행)/g, ']\n[$1')
        .replace(/\n{2,}/g, '\n')                // 연속 개행 → 1줄로 제한
        .trim();
};

// 📌 알람 행 데이터 수집 — globalData 직접 참조
window.collectAlarmItems = function() {
    // 최신 Summary 입력값을 projectMeta에 반영
    if (window.collectTabData) window.collectTabData();

    const items  = [];
    const pm     = window.projectMeta || {};
    const ci     = window.colIdx || {};
    const gdata  = window.globalData || [];
    const today  = new Date(); today.setHours(0,0,0,0);

    // 💡 담당자명 → 이메일 매핑은 주소록(Address Book) 기준으로 통일 — 한글 이름 없으면 영문 이름으로 폴백
    //    (Summary 탭 담당자 이메일 텍스트필드는 더 이상 참조하지 않음 — 이름은 여전히 Summary/업무 내용에서 옴)
    const lookupEmail = function(name) {
        if (!name) return '';
        const trimmed = name.trim();
        // 이름 자리에 이미 이메일 주소가 들어있으면 주소록 조회 없이 그대로 사용
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed;
        const found = window._addrFindByName(trimmed);
        return found ? (found.email || '') : '';
    };

    // 💡 [2026-08-31] 수신 대상(CC)은 업무마다 다를 수 있음 — 기본수신(전역 공용 명단, 대부분의
    //    업무가 여기 해당)이거나 개별수신(그 업무의 row._알림수신자)이거나. 행마다 아래서 계산.
    const defaultCcList = (window.loadAlarmSettings ? window.loadAlarmSettings() : {}).ccList || [];

    document.querySelectorAll('#table-body tr').forEach(function(tr) {
        // dataset.rowIndex → globalData 인덱스 (1-based, 0번은 헤더)
        const rowIdx = parseInt(tr.dataset.rowIndex);
        if (isNaN(rowIdx) || rowIdx < 1) return;
        const row = gdata[rowIdx];
        if (!row) return;

        // _알림 또는 알림메일 시트 로드 데이터 체크
        // _알림(토글) 또는 알림메일 시트 복합키 매칭
        if (!row._알림) return;

        // 완료 예정일 (plan 컬럼 = YYYY-MM-DD)
        // 💡 자동(🔓) 모드 행은 plan 셀이 비어있고 _calcPlanTs(계산값)만 갖고 있으므로 폴백 처리
        let dueRaw = String(row[ci.plan] || '').trim();
        if ((!dueRaw || dueRaw === '-') && row._calcPlanTs) {
            dueRaw = formatTsToYMD(row._calcPlanTs);
        }
        if (!dueRaw || dueRaw === '-') return;
        const dueDate = new Date(dueRaw);
        if (isNaN(dueDate)) return;
        dueDate.setHours(0,0,0,0);
        const diffDays = Math.round((dueDate - today) / 86400000);
        const dueStr   = `${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}-${String(dueDate.getDate()).padStart(2,'0')}`;

        // 업무명 (WBS 컬럼)
        // 💡 [2026-08-29 버그 수정] 예전엔 화면 테이블의 "6번째 <td>"라는 위치 가정만으로 textContent를
        //    그대로 긁어왔는데, 그 셀 안에 다른 요소(예: 숨은 텍스트·아이콘)가 같이 들어있으면 상세내용
        //    등 엉뚱한 텍스트가 업무명에 섞여 들어오는 문제가 있었다. colIdx.wbs(헤더 "개발업무(WBS)"로
        //    찾은 실제 데이터 컬럼)에서 직접 읽도록 바꾸고, 혹시 못 찾을 때만 예전 방식으로 폴백한다.
        // 💡 [2026-08-29 재수정] row._origDev는 "레벨0(개발단계) 행의 이름"일 뿐인데 무조건 row[ci.wbs]보다
        //    먼저 확인해버려서, 실제 업무(레벨0이 아닌 핀셋 걸린 행)까지 개발단계명("PROTO A" 등)으로
        //    표시되는 사고가 났다. 다른 곳들(_origDev 참고하는 모든 코드)과 동일하게 row._level===0일
        //    때만 _origDev를 쓰고, 그 외엔 항상 row[ci.wbs](실제 WBS 업무명)를 먼저 쓰도록 순서를 바로잡음.
        // 🐛 [버그 수정] ci.wbs(단일 "개발업무(WBS)" 열 모드)만 확인하고, 레벨별로 나뉜 열(개발단계/1~4차
        // 업무) 모드는 전혀 안 봐서 — 레벨0이 아닌 실제(본인에게 할당된) 업무는 항상 비어 매칭 실패 →
        // 아래 td[5] 폴백으로 넘어가면서 결국 레벨0(예: "PROTO B*") 이름이 잡히고 있었다. Gantt 렌더
        // 코드(window.renderTable 안 wbsColIdx 계산)와 동일한 레벨별 열 결정 로직을 그대로 재사용.
        // 🐛 [2026-08-30 재수정] 위 수정 이후에도 "단일 WBS 열" 모드 프로젝트에서는 여전히 0레벨 이름이
        // 잡히는 문제가 남아있었다 — 원인은 이 함수가 아니라 window.recalculateSchedules()에 있었음:
        // 그 함수가 "개발단계 필터"를 최신 상태로 유지하려고 단일 WBS 열 모드에서 row[colIdx.wbs] 전체를
        // 매번 "가장 가까운 0레벨 조상의 이름"으로 덮어써서(레벨 무관하게), 행 자신의 실제 텍스트가
        // 그 칸에서 사라지고 있었다(칸이 "표시용 텍스트"와 "필터 그룹 키"라는 두 역할을 동시에 하다가
        // 후자가 전자를 지워버린 셈). 반면 row._origDev/_origT1~4는 이 파일 다른 모든 곳(코드 13885,
        // 14930 등)에서 이미 "그 행 자신의, 자기 레벨 텍스트"로 정확히 유지되고 있으므로, 컬럼값보다
        // _orig*를 먼저 신뢰하도록 순서를 바꾼다(컬럼값은 _orig*가 비어있는 극히 드문 경우의 폴백으로만 사용).
        const origByLevel = row._level === 0 ? row._origDev : (row._level === 1 ? row._origT1 : (row._level === 2 ? row._origT2 : (row._level === 3 ? row._origT3 : row._origT4)));
        let wbsColIdx = (row._level === 0) ? ci.devStage : (row._level === 1 ? ci.taskType1 : (row._level === 2 ? ci.taskType2 : (row._level === 3 ? ci.taskType3 : ci.taskType4)));
        if ((wbsColIdx === undefined || wbsColIdx === -1) && ci.wbs !== -1) wbsColIdx = ci.wbs;
        let taskName = (origByLevel || '') || (wbsColIdx !== undefined && wbsColIdx > -1 ? row[wbsColIdx] : '') || '';
        taskName = taskName.toString().trim();
        if (!taskName) {
            const taskTd = tr.querySelectorAll('td')[5];
            taskName = taskTd ? taskTd.textContent.trim() : '';
        }
        taskName = taskName.replace(/^🌐\s*/, '') || '-';

        // 업무 내용
        const contentRaw = String(row[ci.content] || '').trim();

        // [발신인→수신인] 패턴 추출
        // 💡 [2026-08-24 버그 수정] 수신인 쪽에 "[개발] 박성준, 김진석, 박용훈"처럼 부서 태그가 앞에
        //    붙는 경우, 기존 [^\]]+(닫는 대괄호 나오면 무조건 멈춤)로는 바깥쪽 ]가 아니라 "[개발]"의
        //    안쪽 ]에서 먼저 멈춰버려 이름을 하나도 못 뽑고 "[개발"만 미등록으로 남았다.
        //    (?:\[[^\]]*\]|[^\]])+ 로 중첩 대괄호 한 겹까지는 통째로 건너뛰도록 허용해 바깥쪽 ]까지 정상 포착.
        const arrowMatch  = contentRaw.match(/\[([^\]→]+)→((?:\[[^\]]*\]|[^\]])+)\]/);
        // 💡 위에서 포착된 발신/수신 문자열 앞에 "[개발]"처럼 남아있는 부서 태그는 사람 이름이 아니므로
        //    이름 분리(_addrSplitNames) 전에 떼어낸다. (trim을 먼저 해야 앞의 공백 때문에 ^\[ 매칭이
        //    실패하는 일이 없음 — arrowMatch[2]는 보통 " [개발] ..."처럼 공백으로 시작함)
        const stripTag = function(s) { return String(s || '').trim().replace(/^\[[^\]]*\]\s*/, ''); };
        const senderRaw   = arrowMatch ? stripTag(arrowMatch[1]).trim() : String(row[ci.assignee] || '-').trim();
        const receiverRaw = arrowMatch ? stripTag(arrowMatch[2]).trim() : '';
        // 발신인/수신인 다중 지원 — "정민희/임희철", "박용훈 외 다수" 같은 패턴도 개별 이름으로 분리(위 _addrSplitNames 참고)
        const senderNames   = window._addrSplitNames(senderRaw);
        const receiverNames = window._addrSplitNames(receiverRaw);
        // 발신인 + 수신인 전원
        const allPeople  = [...new Set([...senderNames, ...receiverNames].filter(Boolean))];
        const toEmails   = [...new Set(allPeople.map(n => lookupEmail(n)).filter(Boolean))];
        const missingPeople = allPeople.filter(n => !lookupEmail(n));

        const assignee       = senderNames.join(', ') || '-';
        const assigneeEmail  = [...new Set(senderNames.map(n => lookupEmail(n)).filter(Boolean))].join(',');
        const receiverStr    = receiverNames.join(', ') || '-';
        // 수신인 이메일만 (표시용) — 화면 표시는 도메인 차단과 무관하게 실제 등록된 이메일을 그대로 보여줌
        const receiverEmails = [...new Set(receiverNames.map(n => lookupEmail(n)).filter(Boolean))];
        const receiverEmail  = receiverEmails.join(',');
        // 🌐 외부 도메인 발송 게이트 — @kortek.co.kr 이외 도메인은 알람 설정에서 허용 체크한 도메인만 실제 발송 대상
        const blockedByDomain = [...new Set([assigneeEmail, ...receiverEmails].filter(e => e && !window._isAlarmDomainAllowed(e)))];
        // 실제 발송 = 발신인 + 수신인 전원 중 발송 허용된 이메일만
        const toEmail        = [...new Set([assigneeEmail, ...receiverEmails].filter(e => e && window._isAlarmDomainAllowed(e)))].join(',');
        // 텔레그램 발송 대상 — 이메일이 등록돼 있는데 도메인이 차단 상태면 제외, 이메일 미등록이면 판단 불가로 허용
        const allowedPeople  = allPeople.filter(function(n) {
            const em = lookupEmail(n);
            return !em || window._isAlarmDomainAllowed(em);
        });

        // 💡 이 업무만 별도로 설정한 알람 일정이 있으면 그걸 쓰고, 없으면 기본값(ALARM_DAYS) 사용
        const alarmDays = (row._알림일정 && row._알림일정.length) ? row._알림일정.slice() : ALARM_DAYS.slice();

        // 이 업무의 수신 대상(기본수신 전역 공용 명단 / 개별수신 이 업무만의 명단)
        const ccSource     = (row._알림수신자모드 === 'custom') ? (row._알림수신자 || []) : defaultCcList;
        const ccRecipients = ccSource.map(window._normalizeRecipRow);
        const ccMails      = ccRecipients.filter(r => r.email && r.emailOn && window._isAlarmDomainAllowed(r.email)).map(r => r.email).join(',');

        // 발송 이력
        // 💡 [멀티탭 대비] rowId에 프로젝트 식별자가 없으면, 서로 다른 프로젝트의 같은 행번호+마감일이
        //    우연히 겹칠 때 localStorage 발송기록이 프로젝트 간에 충돌해서 한쪽이 조용히 스킵될 수 있음
        //    (여러 프로젝트를 각자 탭에 열어두고 동시에 알람을 돌리는 구성에서 특히 위험)
        const projKey = window.currentDriveFileId || window.currentDriveFileName || 'local';
        const rowId   = projKey + '_' + rowIdx + '_' + dueStr;
        const sentLog = {};
        alarmDays.forEach(d => {
            const v = localStorage.getItem('gantt_alarm_' + rowId + '_' + d + 'd');
            if (v) sentLog[d] = v;
        });
        const bulkV   = localStorage.getItem('gantt_alarm_' + rowId + '_bulk');
        if (bulkV)   sentLog['bulk']   = bulkV;
        const manualV = localStorage.getItem('gantt_alarm_' + rowId + '_manual');
        if (manualV) sentLog['manual'] = manualV;
        // 사용자가 "발송 상태" 클릭으로 토글해서 임시로 미발송 취급 중인지 여부 (이력은 보존됨)
        const sentHidden = !!localStorage.getItem('gantt_alarm_' + rowId + '_hidden');

        const statusVal = ci.status >= 0 ? String(row[ci.status] || '').trim() : '';
        items.push({
            rowId, rowIdx, taskName,
            status: statusVal,
            assignee, assigneeEmail,
            receiverStr, receiverEmail,
            missingPeople, blockedByDomain,
            toEmail, allPeople, allowedPeople,
            ccMails, ccRecipients, dueStr, dueDate, diffDays, alarmDays,
            content: contentRaw, sentLog, sentHidden, tr,
            mailRaw: row._mailRaw || null // 💡 메일분석으로 자동등록된 업무면 원문 메일(제목/발신/날짜/본문) 보관
        });
    });
    return items;
};

// 💡 [2026-08-30 신규] 알람 목록 행 클릭/더블클릭 구분 — 한 클릭이면 기존처럼 상세 모달을 열고,
// 두 번 빠르게 클릭(더블클릭)하면 모달을 열지 않고 바로 Gantt chart의 해당 업무 행으로 이동한다.
// 그냥 onclick+ondblclick을 같이 달면 더블클릭 시 click이 먼저 2번 발생해 모달이 열렸다 닫히는 등
// 지저분해지므로, 클릭을 살짝(250ms) 지연시켜 그 사이 두 번째 클릭(dblclick)이 오면 취소하는 방식.
window._alarmRowClickTimer = null;
window._alarmRowClick = function(idx) {
    if (window._alarmRowClickTimer) { clearTimeout(window._alarmRowClickTimer); window._alarmRowClickTimer = null; return; }
    window._alarmRowClickTimer = setTimeout(function() {
        window._alarmRowClickTimer = null;
        window.openAlarmModal(idx);
    }, 250);
};
window._alarmRowDblClick = function(idx, rowIdx) {
    if (window._alarmRowClickTimer) { clearTimeout(window._alarmRowClickTimer); window._alarmRowClickTimer = null; }
    if (window._aiJumpToRow) window._aiJumpToRow(rowIdx);
};

// 알람 탭 렌더링
window.renderAlarmTab = async function() {
    const tbody = document.getElementById('alarm-table-body');
    if (!tbody) return;

    // 서버 상태 확인
    const statusEl = document.getElementById('alarm-server-status');
    const _isEn = window._currentLang === 'en';
    try {
        const r = await fetch('http://127.0.0.1:5000/health', { signal: AbortSignal.timeout(2000) });
        const d = await r.json();
        if (statusEl) statusEl.innerHTML = _isEn
            ? '<span style="color:#00707d;">● Mail server connected</span>'
            : '<span style="color:#00707d;">● 메일 서버 연결됨</span>';
    } catch(e) {
        if (statusEl) statusEl.innerHTML = _isEn
            ? '<span style="color:#00707d;">● Mail server not connected — Please run kortek_backend.bat</span>'
            : '<span style="color:#00707d;">● 메일 서버 미연결 — kortek_backend.bat을 실행하세요</span>';
    }

    const items = window.collectAlarmItems();
    if (!items.length) {
        tbody.innerHTML = _isEn
            ? '<tr><td colspan="11" style="text-align:center; padding:40px; color:#aaa;">📌 No Gantt items with alarm configured.</td></tr>'
            : '<tr><td colspan="11" style="text-align:center; padding:40px; color:#aaa;">📌 알람이 설정된 Gantt 항목이 없습니다.</td></tr>';
        return;
    }

    window.dDayLabel = (d) => {
        if (d === 0)  return '<span style="color:#e03131; font-weight:bold;">D-Day</span>';
        if (d < 0)    return '<span style="color:#888;">D+' + Math.abs(d) + '</span>';
        if (d <= 3)   return '<span style="color:#e03131; font-weight:bold;">D-' + d + '</span>';
        if (d <= 7)   return '<span style="color:#e67e22; font-weight:bold;">D-' + d + '</span>';
        return 'D-' + d;
    };
    // 💡 이메일 제목/본문처럼 HTML 태그 없이 순수 텍스트로 D+/D-를 표시할 때 씀
    window.dDayPlain = (d) => (d === 0) ? 'D-Day' : (d < 0 ? 'D+' + Math.abs(d) : 'D-' + d);
    const dDayLabel = window.dDayLabel, dDayPlain = window.dDayPlain;

    const sentStatus = (sentLog, diffDays, sentHidden, idx) => {
        const keys = Object.keys(sentLog);
        if (!keys.length) {
            if (diffDays <= 7 && diffDays >= 0) return '<span style="color:#e03131;">⚠ 미발송</span>';
            return '<span style="color:#aaa;">-</span>';
        }
        const toggleIcon = `<span onclick="event.stopPropagation(); window.toggleAlarmSent(${idx});" title="클릭하면 발송/미발송 상태가 토글됩니다 (이력은 삭제되지 않음, 상세보기는 칸의 다른 부분을 클릭하세요)" style="cursor:pointer; margin-left:5px; color:#999; font-size:11px;">🔄</span>`;
        if (sentHidden) {
            return '<span style="color:#e67e22;">◻ 미발송 처리됨</span>' + toggleIcon;
        }
        const dayKeys = keys.filter(k => !isNaN(Number(k))).map(Number).sort((a,b) => a-b);
        const parts = dayKeys.map(d => '<span style="color:#27ae60; font-size:11px;">✓ D-' + d + '전</span>');
        if (keys.includes('bulk') || keys.includes('manual')) {
            parts.push('<span style="color:#27ae60; font-size:11px;">✓ 기 발송됨</span>');
        }
        return parts.join('<br>') + toggleIcon;
    };

    const lastSent = (sentLog) => {
        const times = Object.values(sentLog);
        if (!times.length) return '-';
        return times.sort().reverse()[0].substring(0, 16).replace('T', ' ');
    };

    const emailCell = (email, missing) => {
        if (email) return `<span style="font-size:11px;">${email}</span>`;
        if (missing && missing.length) return `<span style="color:#e03131; font-size:11px;">미등록: ${missing.join(', ')}</span>`;
        return `<span style="color:#e03131; font-size:11px;">미입력</span>`;
    };

    // 이름 목록 → "첫번째 외 N명" + tooltip
    const nameCell = (nameStr) => {
        if (!nameStr || nameStr === '-') return '-';
        const names = nameStr.split(/[,，]/).map(n => n.trim()).filter(Boolean);
        if (names.length <= 1) return `<span style="white-space:nowrap;">${names[0] || '-'}</span>`;
        return `<span title="${names.join('\n')}" style="cursor:help; border-bottom:1px dashed #aaa; white-space:nowrap;">${names[0]} 외 ${names.length-1}명</span>`;
    };
    // 🌐 도메인 차단으로 인해 실제 발송에서 제외된 이메일이 있으면 배지로 표시
    const domainBadge = (blocked) => (blocked && blocked.length)
        ? `<span title="🌐 외부 도메인 차단됨(알람 설정에서 허용 가능): ${blocked.join(', ')}" style="margin-left:4px; font-size:10px; color:#e67e22; cursor:help;">🌐🚫</span>` : '';
    const emailCell2 = (email, missing, blocked) => {
        if (!email) {
            if (missing && missing.length) return `<span style="color:#e03131; font-size:11px; white-space:nowrap;" title="${missing.join('\n')} 이메일 미등록">미등록 ⚠</span>`;
            return `<span style="color:#e03131; font-size:11px; white-space:nowrap;">미입력</span>`;
        }
        const emails = email.split(',').map(e => e.trim()).filter(Boolean);
        if (emails.length <= 1) return `<span style="font-size:11px; white-space:nowrap;">${emails[0]}</span>${domainBadge(blocked)}`;
        return `<span style="font-size:11px; cursor:help; border-bottom:1px dashed #aaa; white-space:nowrap;" title="${emails.join('\n')}">${emails[0]} 외 ${emails.length-1}</span>${domainBadge(blocked)}`;
    };

    tbody.innerHTML = items.map((item, idx) => `
        <tr class="${idx % 2 === 1 ? 'mc-zebra-b' : 'mc-zebra-a'}" style="cursor:pointer; border-bottom:1px solid #cfe3e5;"
            onmouseover="this.style.background='#d3ecef'" onmouseout="this.style.background=''"
            title="더블클릭하면 Gantt chart의 해당 업무로 이동합니다"
            onclick="window._alarmRowClick(${idx})" ondblclick="window._alarmRowDblClick(${idx}, ${item.rowIdx})">
            <td style="padding:7px 10px; font-size:12px;">${item.taskName}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${item.status || '-'}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${nameCell(item.assignee)}</td>
            <td style="padding:7px 10px; font-size:11px; color:#555;">${emailCell2(item.assigneeEmail, item.missingPeople, item.blockedByDomain)}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${nameCell(item.receiverStr)}</td>
            <td style="padding:7px 10px; font-size:11px; color:#555;">${emailCell2(item.receiverEmail, item.missingPeople, item.blockedByDomain)}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${item.dueStr}</td>
            <td style="padding:7px 10px; text-align:center;">${dDayLabel(item.diffDays)}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${sentStatus(item.sentLog, item.diffDays, item.sentHidden, idx)}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11px; color:#888;">${lastSent(item.sentLog)}</td>
            <td style="padding:7px 10px; text-align:center;">
                <span onclick="event.stopPropagation(); window.openAlarmScheduleModal(${idx});" title="이 업무만 알람 일정을 다르게 설정" style="cursor:pointer; font-size:14px;">${item.alarmDays.length !== 3 || item.alarmDays.slice().sort((a,b)=>a-b).join(',') !== '1,3,7' ? '⚙️<span style="color:#2c5f8a; font-size:9px; vertical-align:top;">●</span>' : '⚙️'}</span>
                <span id="as-recur-badge-${idx}"></span>
            </td>
        </tr>`).join('');

    window._alarmItems = items;
    // 💡 [2026-08-31 신규] 이 업무들 중 "기간·반복" 예약(백엔드 /schedule, type='alarm')이 걸려있는
    //    행에 ⏰ 배지 표시 — 렌더링 자체를 막지 않도록 fire-and-forget(비동기, 결과 기다리지 않음)
    window._alarmAnnotateRecurBadges();
};

// 💡 알람 목록 각 행에 "기간·반복" 예약 등록 여부(⏰)를 표시 — 백엔드 /schedule 규칙과 driveFileId+rowIdx로 매칭
window._alarmAnnotateRecurBadges = async function() {
    if (window.loadScheduleRulesFromBackend) await window.loadScheduleRulesFromBackend();
    const rules = window._scheduleRules || [];
    const driveFileId = window.currentDriveFileId;
    (window._alarmItems || []).forEach((item, idx) => {
        const badge = document.getElementById(`as-recur-badge-${idx}`);
        if (!badge) return;
        const has = rules.some(r => r.type === 'alarm' && r.driveFileId === driveFileId && r.rowIdx === item.rowIdx && r.enabled !== false);
        badge.innerHTML = has ? '<span title="기간·반복 예약 등록됨" style="color:#2c5f8a; font-size:9px;">⏰</span>' : '';
    });
};

// 💡 업무별 커스텀 알람 일정 — 체크박스 상태를 폼에 채움 + 이 업무에 이미 등록된 "기간·반복"
//    예약(백엔드 /schedule)이 있으면 그 값도 불러와 채운다.
window.openAlarmScheduleModal = async function(idx) {
    const item = (window._alarmItems || [])[idx];
    if (!item) return;
    window._alarmScheduleItem = item;

    const current = new Set(item.alarmDays.map(Number));
    document.querySelectorAll('.alarm-sched-cb').forEach(cb => {
        cb.checked = current.has(Number(cb.value));
        current.delete(Number(cb.value));
    });
    // 프리셋(14/7/3/1/0)에 없는 나머지 숫자는 공지 등록과 동일하게 태그로 표시
    window._asCustomDays = Array.from(current).sort((a,b) => a-b);
    window._asRenderCustomTags();

    // 기간·반복 필드 초기화 (매번 신규 상태로 리셋 후, 기존 규칙이 있으면 아래서 덮어씀)
    window._asSpecificDates = [];
    window._asRenderSpecificDateTags();
    document.getElementById('as-mode-dday').checked = true;
    document.getElementById('as-datemode-range').checked = true;
    ['as-recur-start','as-recur-end'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
    document.getElementById('as-recur-day-interval').value = 1;
    document.getElementById('as-recur-send-time').value = '09:00';
    document.getElementById('as-schedule-rule-id').value = '';
    document.getElementById('as-delete-rule-btn').style.display = 'none';

    // 이 업무(driveFileId+rowIdx)에 이미 등록된 "기간·반복" 규칙이 있으면 불러와 채움
    if (window.loadScheduleRulesFromBackend) await window.loadScheduleRulesFromBackend();
    const driveFileId = window.currentDriveFileId;
    const existing = (window._scheduleRules || []).find(r => r.type === 'alarm' && r.driveFileId === driveFileId && r.rowIdx === item.rowIdx);
    if (existing) {
        document.getElementById('as-mode-recur').checked = true;
        document.getElementById('as-schedule-rule-id').value = existing.id;
        if (existing.dateMode === 'specific') {
            document.getElementById('as-datemode-specific').checked = true;
            window._asSpecificDates = (existing.specificDates || []).slice();
            window._asRenderSpecificDateTags();
        } else {
            document.getElementById('as-recur-start').value = existing.startDate || '';
            document.getElementById('as-recur-end').value = existing.endDate || '';
            document.getElementById('as-recur-day-interval').value = existing.dayInterval || 1;
        }
        // 💡 예전 규칙(시간창)에서 넘어온 경우 hourStart를 발송 시각으로 사용
        document.getElementById('as-recur-send-time').value = existing.hourStart || '09:00';
        document.getElementById('as-delete-rule-btn').style.display = 'block';
    }
    window._asToggleMode();
    window._asToggleDateMode();

    // 수신 대상 — 이 업무가 개별수신으로 지정돼 있으면 그 상태로, 아니면 기본수신으로 열기
    const recipRow = (window.globalData || [])[item.rowIdx];
    const isCustomRecip = recipRow && recipRow._알림수신자모드 === 'custom';
    document.getElementById('as-recip-mode-default').checked = !isCustomRecip;
    document.getElementById('as-recip-mode-custom').checked  = !!isCustomRecip;
    window._asRenderRecipList();

    // 업무 정보 — Gantt 업무에서 그대로 가져와 표시(읽기 전용). 메일분석으로 자동등록된 업무면 원문보기 버튼도.
    document.getElementById('as-info-title').textContent = item.taskName || '-';
    document.getElementById('as-info-content').textContent = item.content
        ? (window.alarmFormatContent ? window.alarmFormatContent(item.content) : item.content)
        : '-';
    document.getElementById('as-info-mailraw-wrap').style.display = item.mailRaw ? 'block' : 'none';

    document.getElementById('alarm-schedule-title').textContent = '⚙️ ' + item.taskName + (window._currentLang === 'en' ? ' — Alarm Schedule' : ' — 알람 일정');
    document.getElementById('alarm-schedule-overlay').style.display = 'flex';
    // 💡 반드시 'flex'로 열어야 헤더/본문 스크롤/푸터 3단 레이아웃(flex-direction:column)이 적용됨
    document.getElementById('alarm-schedule-modal').style.display = 'flex';
    window.bringModalToFront('alarm-schedule-modal');
};

// 기본값(7/3/1) 체크 상태로 폼만 되돌림 — 저장 버튼을 눌러야 실제 반영됨
window.resetAlarmScheduleForm = function() {
    document.querySelectorAll('.alarm-sched-cb').forEach(cb => {
        cb.checked = ['7', '3', '1'].includes(cb.value);
    });
    window._asCustomDays = [];
    window._asRenderCustomTags();
};

window.closeAlarmScheduleModal = function() {
    document.getElementById('alarm-schedule-overlay').style.display = 'none';
    document.getElementById('alarm-schedule-modal').style.display = 'none';
    window._alarmScheduleItem = null;
};

// ── 발송 방식(D-day 목록 / 기간·반복) 및 날짜 지정방식(기간 / 특정 날짜) 토글 ──────
// ── 커스텀 D-day 태그 관리 (notice-modal의 _nmCustomDays와 동일 패턴으로 통일) ──────
window._asCustomDays = [];
const AS_DDAY_PRESETS = [14, 7, 3, 1, 0];

window._asAddCustomDay = function() {
    const input = document.getElementById('as-d-custom');
    const val   = parseInt(input?.value);
    if (!val || val < 1 || val > 365) { input && input.focus(); return; }
    // 기본 체크박스와 중복 방지
    if (AS_DDAY_PRESETS.includes(val)) {
        const cb = document.getElementById(`as-d${val}`);
        if (cb) { cb.checked = true; input.value = ''; return; }
    }
    if (window._asCustomDays.includes(val)) { input.value = ''; return; }
    window._asCustomDays.push(val);
    window._asRenderCustomTags();
    input.value = '';
};

window._asRenderCustomTags = function() {
    const wrap = document.getElementById('as-d-custom-tags');
    if (!wrap) return;
    wrap.innerHTML = window._asCustomDays.sort((a,b)=>b-a).map(d =>
        `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:#e8f0fb;border:1px solid #b0c4e8;border-radius:12px;font-size:11.5px;color:#2c5f8a;">
          D-${d}
          <button type="button" onclick="window._asRemoveCustomDay(${d})"
                  style="background:none;border:none;cursor:pointer;color:#888;font-size:11px;padding:0;line-height:1;">✕</button>
        </span>`
    ).join('');
};

window._asRemoveCustomDay = function(d) {
    window._asCustomDays = window._asCustomDays.filter(x => x !== d);
    window._asRenderCustomTags();
};

window._asToggleMode = function() {
    const isRecur  = document.getElementById('as-mode-recur')?.checked;
    const ddayEl   = document.getElementById('as-dday-fields');
    const recurEl  = document.getElementById('as-recur-fields');
    const resetBtn = document.getElementById('as-reset-btn');
    if (ddayEl)   ddayEl.style.display   = isRecur ? 'none' : 'block';
    if (recurEl)  recurEl.style.display  = isRecur ? 'block' : 'none';
    if (resetBtn) resetBtn.style.display = isRecur ? 'none' : 'inline-block';
};

window._asToggleDateMode = function() {
    const isSpecific = document.getElementById('as-datemode-specific')?.checked;
    const rangeEl = document.getElementById('as-daterange-fields');
    const specEl  = document.getElementById('as-specific-dates-fields');
    if (rangeEl) rangeEl.style.display = isSpecific ? 'none' : 'grid';
    if (specEl)  specEl.style.display  = isSpecific ? 'block' : 'none';
};

// ── 수신 대상: 기본수신(전체 공용 CC 명단) / 개별수신(이 업무만의 명단) ─────────
// 라디오를 바꾸면 그 시점의 저장된 값으로 목록을 다시 그린다(전환 중 미저장 편집은 버려짐 — D-day
// 체크박스처럼 "저장" 눌러야 확정되는 폼이라 자연스러운 동작).
window._asToggleRecipMode = function() {
    window._asRenderRecipList();
};

window._asRenderRecipList = function() {
    const list = document.getElementById('as-recip-list');
    if (!list) return;
    list.innerHTML = '';
    const isDefault = document.getElementById('as-recip-mode-default')?.checked;
    const descEl = document.getElementById('as-recip-mode-desc');
    let rows;
    if (isDefault) {
        rows = window._computeDefaultCcList();
        if (descEl) descEl.textContent = '기본수신: 모든 업무가 함께 쓰는 공통 명단 — 여기서 고치면 다른 업무에도 함께 적용됩니다.';
    } else {
        const item = window._alarmScheduleItem;
        const row  = item ? (window.globalData || [])[item.rowIdx] : null;
        rows = ((row && row._알림수신자) || []).map(window._normalizeRecipRow);
        if (descEl) descEl.textContent = '개별수신: 이 업무에만 적용되는 명단입니다.';
    }
    rows.forEach(r => window._asRecipAddRow('as-recip-list', r));
    window._asSyncRecipHeaderPad('as-recip-list');
};

// 저장 시점 화면 상태를 실제로 반영 — 기본수신이면 전체 공용 명단(gantt_alarm_settings.ccList)을
// 갱신, 개별수신이면 이 업무의 행(row._알림수신자)에 기록. 반환값은 이번에 저장된 수신자 배열
// (기간·반복 규칙 저장 시 백엔드로 그대로 스냅샷해서 보냄).
window._asPersistRecipients = function() {
    const item = window._alarmScheduleItem;
    if (!item) return [];
    const row  = (window.globalData || [])[item.rowIdx];
    const isDefault = document.getElementById('as-recip-mode-default')?.checked;
    const rows = window._asRecipCollect('as-recip-list');
    if (isDefault) {
        const cfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
        cfg.ccList = rows;
        localStorage.setItem('gantt_alarm_settings', JSON.stringify(cfg));
        if (row) { delete row._알림수신자모드; delete row._알림수신자; }
    } else if (row) {
        row._알림수신자모드 = 'custom';
        row._알림수신자 = rows;
    }
    return rows;
};

// ── 특정 날짜 태그 관리 (notice-modal의 _nmSpecificDates와 동일 패턴) ──────────
window._asSpecificDates = [];

window._asAddSpecificDate = function() {
    const input = document.getElementById('as-specific-date-input');
    const val = input?.value;
    if (!val) { input && input.focus(); return; }
    if (window._asSpecificDates.includes(val)) { input.value = ''; return; }
    window._asSpecificDates.push(val);
    window._asSpecificDates.sort();
    window._asRenderSpecificDateTags();
    input.value = '';
};

window._asRenderSpecificDateTags = function() {
    const wrap = document.getElementById('as-specific-date-tags');
    if (!wrap) return;
    wrap.innerHTML = window._asSpecificDates.map(d =>
        `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:#e8f0fb;border:1px solid #b0c4e8;border-radius:12px;font-size:11.5px;color:#2c5f8a;">
          ${d}
          <button type="button" onclick="window._asRemoveSpecificDate('${d}')"
                  style="background:none;border:none;cursor:pointer;color:#888;font-size:11px;padding:0;line-height:1;">✕</button>
        </span>`
    ).join('');
};

window._asRemoveSpecificDate = function(d) {
    window._asSpecificDates = window._asSpecificDates.filter(x => x !== d);
    window._asRenderSpecificDateTags();
};

// ── 기간·반복 예약 저장/해제 (백엔드 /schedule API, type='alarm') ─────────────
// 💡 공지(notice)와 달리 title/message/recipients를 고정 저장하지 않는다 — driveFileId+rowIdx만
//    기억해두면 백엔드가 발송 직전 구글드라이브에서 이 업무의 최신 상태를 다시 읽는다
//    (kortek_backend.py의 _fire_alarm_rule/_build_alarm_task_snapshot 참고).
window._asSaveRecurRule = async function() {
    const item = window._alarmScheduleItem;
    if (!item) return;
    const driveFileId = window.currentDriveFileId;
    if (!driveFileId) {
        const msg = '이 프로젝트가 구글드라이브에 저장된 후에만 기간·반복 예약이 가능합니다. 먼저 저장해주세요.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
        return;
    }

    const dateMode = document.getElementById('as-datemode-specific')?.checked ? 'specific' : 'range';
    let startDate = '', endDate = '', dayInterval = 1;
    if (dateMode === 'range') {
        startDate = document.getElementById('as-recur-start').value;
        endDate   = document.getElementById('as-recur-end').value;
        if (!startDate || !endDate) { alert('시작일/종료일을 입력해주세요.'); return; }
        if (startDate > endDate) { alert('종료일이 시작일보다 빠릅니다.'); return; }
        dayInterval = parseInt(document.getElementById('as-recur-day-interval').value, 10) || 1;
    } else {
        if (!window._asSpecificDates.length) { alert('특정 날짜를 1개 이상 추가해주세요.'); return; }
    }

    // 💡 [2026-08-31] 시간창(시작~종료+몇시간마다) 대신 "발송 시각" 하나만 받음 — 백엔드 스키마는
    //    그대로 두고(hourStart/hourEnd/hourInterval), 시작=종료=이 시각으로 보내 하루 1번만 걸리게 함
    //    (_rule_today_buckets가 시작==종료면 그 시각 1개만 버킷으로 만듦 — kortek_backend.py 참고).
    const sendTime     = document.getElementById('as-recur-send-time').value || '09:00';
    const hourStart    = sendTime;
    const hourEnd      = sendTime;
    const hourInterval = 1;
    const ruleId       = document.getElementById('as-schedule-rule-id').value || undefined;

    // 💡 수신 대상(기본수신/개별수신)을 지금 화면 상태로 저장(전역 CC 명단 갱신 또는 이 업무에만 기록)
    const ccRecipients = window._asPersistRecipients ? (window._asPersistRecipients() || []) : [];

    // 💡 CC 명단/외부도메인 허용목록은 브라우저 localStorage(알람 설정)에만 있어 서버가 못 보므로,
    //    저장 시점 값을 그대로 스냅샷해서 같이 보낸다 (담당자/마감일/업무내용과 달리 자주 안 바뀌는 값).
    const cfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
    const payload = {
        id: ruleId, type: 'alarm',
        driveFileId, rowIdx: item.rowIdx,
        taskNameSnapshot: item.taskName,
        ccRecipientsSnapshot: ccRecipients,
        allowedExternalDomainsSnapshot: cfg.allowedExternalDomains || [],
        dateMode, startDate, endDate, specificDates: window._asSpecificDates.slice(),
        dayInterval, hourStart, hourEnd, hourInterval, enabled: true
    };

    try {
        const health = await fetch(`${MAIL_SERVER}/health`, { signal: AbortSignal.timeout(2000) });
        if (!health.ok) throw new Error();
    } catch (e) {
        alert('❌ 메일 서버(kortek_backend.py)가 실행되지 않았습니다.\n기간·반복 예약은 이 서버가 켜져 있어야 등록/동작합니다.');
        return;
    }

    try {
        const res = await fetch(`${MAIL_SERVER}/schedule`, {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        window.closeAlarmScheduleModal();
        await window.loadScheduleRulesFromBackend();
        window.renderAlarmTab();
        if (window.showToast) window.showToast('✅ 기간·반복 예약이 저장되었습니다.');
    } catch (e) {
        alert('❌ 예약 규칙 저장 실패: ' + e.message);
    }
};

window._asDeleteRecurRule = async function() {
    const ruleId = document.getElementById('as-schedule-rule-id').value;
    if (!ruleId) return;
    if (!confirm('이 업무의 기간·반복 예약을 해제할까요?')) return;
    try {
        await fetch(`${MAIL_SERVER}/schedule/${ruleId}`, { method: 'DELETE' });
    } catch (e) {}
    window.closeAlarmScheduleModal();
    await window.loadScheduleRulesFromBackend();
    window.renderAlarmTab();
};

// 저장: D-day 목록 모드면 row._알림일정에 기록(기본값(7/3/1)과 완전히 같으면 커스텀 설정을 지워서
// "기본값 사용" 상태로 되돌림), 기간·반복 모드면 백엔드 예약 규칙 저장으로 위임
window.saveAlarmSchedule = function() {
    if (document.getElementById('as-mode-recur')?.checked) { window._asSaveRecurRule(); return; }

    const item = window._alarmScheduleItem;
    if (!item) return;
    const row = (window.globalData || [])[item.rowIdx];
    if (!row) return;

    const checked = Array.from(document.querySelectorAll('.alarm-sched-cb:checked')).map(cb => Number(cb.value));
    const finalDays = Array.from(new Set([...checked, ...(window._asCustomDays || [])])).sort((a, b) => b - a);
    if (!finalDays.length) {
        const msg = '최소 1개 이상의 알람 시점을 선택해주세요.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
        return;
    }

    const isDefault = finalDays.length === ALARM_DAYS.length && finalDays.slice().sort((a,b)=>a-b).join(',') === ALARM_DAYS.slice().sort((a,b)=>a-b).join(',');
    if (isDefault) {
        delete row._알림일정; // 기본값과 같으면 커스텀 설정 자체를 지움
    } else {
        row._알림일정 = finalDays;
    }

    if (window._asPersistRecipients) window._asPersistRecipients(); // 수신 대상(기본수신/개별수신)도 함께 저장

    if (window.logChange) window.logChange(item.rowIdx, -1, '알람 일정', isDefault ? '기본값으로 복원' : '커스텀 설정: ' + finalDays.map(d => d === 0 ? 'D-Day' : ('D-' + d)).join(', '));

    window.closeAlarmScheduleModal();
    window.renderAlarmTab();
};

// 발송 이력 초기화 (오발송 등 재발송이 필요할 때)
// 발송 상태 토글 — 실제 이력은 지우지 않고 "미발송 취급" 여부만 켜고 끔 (실수 클릭 대비 가역적)
window.toggleAlarmSent = function(idx) {
    const item = (window._alarmItems || [])[idx];
    if (!item || !Object.keys(item.sentLog).length) return;
    const key = `gantt_alarm_${item.rowId}_hidden`;
    const wasHidden = item.sentHidden;
    if (wasHidden) {
        localStorage.removeItem(key); // 복원: 다시 "발송됨"으로 표시
    } else {
        localStorage.setItem(key, '1'); // 토글: 임시로 "미발송"으로 표시 (이력은 유지)
    }
    window.renderAlarmTab();

    // 📌 "미발송 처리됨"으로 바꾼 순간 바로 체크해서 발송 — 단, 자동 메일 발송이 OFF면
    //    이 토글도 "자동" 성격이므로 보내지 않고 플래그만 켜둠 (즉시발송/일괄발송 버튼은 항상 별개로 동작)
    if (!wasHidden) {
        const autoCfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
        if (autoCfg.autoSend !== false && window.checkAndSendAlarms) {
            window.checkAndSendAlarms(true);
        }
    }
};

// 모달 열기
window.openAlarmModal = function(idx) {
    const item = (window._alarmItems || [])[idx];
    if (!item) return;
    window._alarmCurrentItem = item;

    const _amEn = window._currentLang === 'en';   // ← 여기로 이동
    const pm        = window.projectMeta || {};
    const projTitle = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';
    const _amEn2 = window._currentLang === 'en';
    const dayKeys   = Object.keys(item.sentLog).filter(k => !isNaN(Number(k))).map(Number).sort((a,b) => a-b);
    const sentParts = dayKeys.map(d => `✓ D-${d}일 전 발송 (${item.sentLog[d].substring(0,16).replace('T',' ')})`);
    if (item.sentLog.manual) sentParts.push(`✓ ${_amEn2 ? 'Manual send' : '즉시 발송'} (${item.sentLog.manual.substring(0,16).replace('T',' ')})`);
    if (item.sentLog.bulk)   sentParts.push(`✓ ${_amEn2 ? 'Batch send' : '일괄 발송'} (${item.sentLog.bulk.substring(0,16).replace('T',' ')})`);
    const sentHtml  = sentParts.length ? sentParts.join('<br>') : (_amEn2 ? 'No send history' : '발송 이력 없음');

    // 업무내용 줄바꿈: 날짜 이후, [섹션키워드] 이전에 개행
    const formattedContent = item.content ? window.alarmFormatContent(item.content) : '';

    const _isBlockedEmail = (email) => (item.blockedByDomain || []).some(b => (email || '').split(',').map(e=>e.trim()).includes(b));
    const emailWarn = (email, name) => email
        ? `<span style="color:#27ae60;">${email}</span>${_isBlockedEmail(email) ? ' <span title="🌐 외부 도메인 차단됨 — 실제 알람은 발송되지 않습니다 (알람 설정에서 허용 가능)" style="font-size:10px; color:#e67e22; cursor:help;">🌐🚫 차단</span>' : ''}`
        : `<span style="color:#e03131;">미등록 — Summary 탭에 <b>${name}</b> 이메일을 입력해 주세요</span>`;
    document.getElementById('alarm-modal-title').textContent = '🔔 ' + item.taskName;
    document.getElementById('alarm-modal-body').innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:12.5px; line-height:1.6;">
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold; width:100px;">프로젝트</td><td style="padding:6px 10px;">${projTitle}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">업무명</td><td style="padding:6px 10px;">${item.taskName}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">업무상태</td><td style="padding:6px 10px;">${item.status || '-'}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">발신인</td><td style="padding:6px 10px;">${item.assignee} &nbsp; ${emailWarn(item.assigneeEmail, item.assignee)}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">수신인</td><td style="padding:6px 10px;">${item.receiverStr} &nbsp; ${emailWarn(item.receiverEmail, item.receiverStr)}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">완료 예정일</td><td style="padding:6px 10px; color:#e03131; font-weight:bold;">${item.dueStr} (${dDayLabel(item.diffDays)})</td></tr>
            ${formattedContent ? `<tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold; vertical-align:top;">업무 내용</td><td style="padding:6px 10px; white-space:pre-wrap; font-size:12px; color:#444;">${formattedContent}${item.mailRaw ? `<div style="margin-top:6px; white-space:normal;"><button onclick="window.showMailRawModal(window._alarmCurrentItem.mailRaw)" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="font-size:11px; padding:3px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📧 ${_amEn2 ? 'View Mail Source' : '메일 원문 보기'}</button></div>` : ''}</td></tr>` : ''}
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold; vertical-align:top;">발송 이력</td><td style="padding:6px 10px; color:#555; font-size:12px;">${sentHtml}</td></tr>
        </table>`;

    document.getElementById('alarm-modal-overlay').style.display = 'flex';
    document.getElementById('alarm-modal').style.display = 'block';
    window.bringModalToFront('alarm-modal');
};

// 모달 닫기
window.closeAlarmModal = function() {
    document.getElementById('alarm-modal-overlay').style.display = 'none';
    document.getElementById('alarm-modal').style.display = 'none';
    window._alarmCurrentItem = null;
};

// 개별 즉시 발송
window.sendSingleAlarm = async function(sendAll) {
    const item = window._alarmCurrentItem;
    if (!item) return;

    const pm        = window.projectMeta || {};
    const projTitle = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';

    // ALL 모드: 프로젝트 전체 멤버 이메일 (멤버-3 자유 추가 인원 포함)
    const allMemberEmails = [
        pm.프로젝트담당자이메일, pm.기구담당자이메일,
        pm.HW담당자이메일, pm.FW담당자이메일, pm.TSP담당자이메일,
        pm.LCM담당자이메일, pm.Slimming담당자이메일,
        pm.Cutting담당자이메일, pm.Module담당자이메일, pm.Tooling담당자이메일,
        ...((window.tabData || {}).projectMembers3 || []).map(m => m.email),
    ].flatMap(e => (e || '').split(/[,，]/).map(x => x.trim()))
     .filter(e => e && e.includes('@'))
     .filter(window._isAlarmDomainAllowed); // 🌐 외부 도메인 차단

    // 일반 모드: 발신인 + 수신인만
    const allEmails = sendAll
        ? [...new Set(allMemberEmails)].join(',')
        : item.toEmail || [...new Set(allMemberEmails)].join(',');

    if (!allEmails) {
        if (window.bmAlertModal) window.bmAlertModal('Summary 탭에 이메일 주소를 먼저 입력해 주세요.');
        else alert('Summary 탭에 이메일 주소를 먼저 입력해 주세요.');
        return;
    }

    const dDay    = item.diffDays;
    const subject = `[Gantt 알람] ${projTitle} — "${item.taskName}" 완료일 ${dDayPlain(dDay)}`;
    const body    = `<div style="font-family:'맑은 고딕',sans-serif; font-size:14px; color:#333;">
  <p><b>${item.assignee}님께</b></p>
  <p>아래 업무의 완료 예정일이 <b style="color:#e74c3c;">${dDayPlain(dDay)}일 (${item.dueStr})</b>입니다.</p>
  <table style="border-collapse:collapse; margin:12px 0; border:1px solid #dcdde1; width:100%; max-width:1000px;">
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">프로젝트</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${projTitle}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">업무</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.taskName}</td></tr>
    ${item.content ? `<tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; vertical-align:top; border:1px solid #dcdde1; width:90px; white-space:nowrap;">내용</td><td style="padding:6px 12px; white-space:normal; border:1px solid #dcdde1; word-break:break-word;">${window.alarmFormatContent(item.content).replace(/\n/g, '<br>')}</td></tr>` : ''}
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">담당자</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.assignee}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">완료 예정일</td><td style="padding:6px 12px; color:#e74c3c; border:1px solid #dcdde1;"><b>${item.dueStr}</b></td></tr>
  </table>
  <p style="color:#888; font-size:12px;">본 메일은 Gantt Chart 알람 시스템에서 자동 발송되었습니다.</p>
</div>`;

    const btn = document.getElementById('alarm-modal-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = '발송 중...'; }

    try {
        const res = await fetch('http://127.0.0.1:5000/send-mail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: allEmails, cc: item.ccMails || '', subject, body })
        });
        const data = await res.json();
        if (data.ok) {
            // 발송 이력 저장
            const key = `gantt_alarm_${item.rowId}_manual`;
            localStorage.setItem(key, new Date().toISOString());
            item.sentLog['manual'] = new Date().toISOString();

            // 💡 텔레그램 발송 — 주소록 telegramId 기준으로 수신자 매칭 (🌐 외부 도메인 차단된 사람은 제외)
            //    + 수신 대상(CC)에 텔레그램이 켜진 사람도 함께 (2026-08-31: 기본수신/개별수신 신설)
            const ccTgChatIds2 = (item.ccRecipients || [])
                .filter(r => r.tgOn && r.telegramId && (!r.email || window._isAlarmDomainAllowed(r.email)))
                .map(r => r.telegramId);
            const tgChatIds = [...new Set([
                ...(item.allowedPeople || item.allPeople || [item.assignee]).map(n => { const p = window._addrFindByName(n); return p ? p.telegramId : ''; }),
                ...ccTgChatIds2
            ])].filter(Boolean);
            if (tgChatIds.length && window.sendTelegramAlarm) {
                // 💡 [2026-08-24] 위 자동알람과 동일 기준으로 100자 → 2000자 확대
                const _tgContent2 = item.content ? '\n내용: ' + item.content.replace(/\n/g,' ').substring(0,2000) + (item.content.length>2000?'…':'') : '';
                const tgMsg = `📌 [Gantt 알람] ${projTitle}\n업무: ${item.taskName}\n담당: ${item.assignee}\n기한: ${item.dueStr} (${dDayPlain(item.diffDays)})${_tgContent2}`;
                tgChatIds.forEach(chatId => window.sendTelegramAlarm(tgMsg, { chatId }));
            }

            window.closeAlarmModal();
            window.renderAlarmTab();
            window.showToast(window._currentLang === 'en' ? '✅ Sent!' : '✅ 발송 완료!');
        } else {
            throw new Error(data.error);
        }
    } catch(e) {
        if (window.bmAlertModal) window.bmAlertModal('발송 실패: ' + e.message);
        else alert('발송 실패: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📧 즉시 발송'; }
    }
};

// 미발송 일괄 발송 (수동 버튼 — 과거 미발송 포함)
window.sendAllPendingAlarms = async function() {
    const items = window.collectAlarmItems();
    const pending = items.filter(item => {
        // D-7 이하인데 한 번도 발송 안 된 항목
        return item.diffDays <= 7 && Object.keys(item.sentLog).length === 0;
    });

    if (!pending.length) {
        if (window.bmAlertModal) window.bmAlertModal('미발송 항목이 없습니다.');
        else alert('미발송 항목이 없습니다.');
        return;
    }

    const pm        = window.projectMeta || {};
    const projTitle = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';

    let sentCount = 0;
    for (const item of pending) {
        // 업무별 발신인/수신인이 없으면 이 건은 건너뜀 (더 이상 Summary 멤버 전체로 대체 발송하지 않음)
        if (!item.toEmail) continue;
        const subject = `[Gantt 알람] ${projTitle} — "${item.taskName}" 완료일 ${dDayPlain(item.diffDays)}`;
        const body    = `<div style="font-family:'맑은 고딕',sans-serif; font-size:14px; color:#333;">
  <p><b>${item.assignee}님께</b></p>
  <p>아래 업무의 완료 예정일이 <b style="color:#e74c3c;">${dDayPlain(item.diffDays)}일 (${item.dueStr})</b>입니다.</p>
  <table style="border-collapse:collapse; margin:12px 0; border:1px solid #dcdde1; width:100%; max-width:1000px;">
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">프로젝트</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${projTitle}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">업무</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.taskName}</td></tr>
    ${item.content ? `<tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; vertical-align:top; border:1px solid #dcdde1; width:90px; white-space:nowrap;">내용</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.content}</td></tr>` : ''}
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">담당자</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.assignee}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">완료 예정일</td><td style="padding:6px 12px; color:#e74c3c; border:1px solid #dcdde1;"><b>${item.dueStr}</b></td></tr>
  </table>
  <p style="color:#888; font-size:12px;">본 메일은 Gantt Chart 알람 시스템에서 자동 발송되었습니다.</p>
</div>`;

        try {
            const res = await fetch('http://127.0.0.1:5000/send-mail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: item.toEmail, cc: item.ccMails || '', subject, body })
            });
            const data = await res.json();
            if (data.ok) {
                localStorage.setItem(`gantt_alarm_${item.rowId}_bulk`, new Date().toISOString());
                sentCount++;
            }
        } catch(e) {
            console.warn('일괄 발송 실패:', item.taskName, e.message);
        }
    }

    window.renderAlarmTab();
    const msg = sentCount > 0 ? `${sentCount}건 발송 완료!` : '발송 실패. 메일 서버를 확인해 주세요.';
    if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
};

// 💡 프로젝트 멤버-3 (자유 추가 인원) 행 렌더링
window.renderMember3Rows = function(rows) {
    const colA = document.getElementById('sum-member3-col-a');
    const colB = document.getElementById('sum-member3-col-b');
    if (!colA || !colB) {
        console.warn('⚠️ sum-member3-col-a/b 요소를 찾지 못했습니다. Summary 멤버-3 HTML(2열 구조) diff가 적용됐는지 확인해주세요.');
        return;
    }
    window.tabData = window.tabData || {};
    window.tabData.projectMembers3 = rows || [];

    const build = function(r, idx) {
        return '<input type="text" data-idx="' + idx + '" data-field="role" class="u-input mem-label" value="' + _escTabVal(r.role) + '" placeholder="예: PCB 설계">'
            + '<input type="text" data-idx="' + idx + '" data-field="name" class="u-input" value="' + _escTabVal(r.name) + '" placeholder="예: 홍길동">'
            + '<div style="position:relative; display:flex; align-items:center;">'
            +   '<input type="email" data-idx="' + idx + '" data-field="email" class="u-input" value="' + _escTabVal(r.email) + '" placeholder="email@company.com" style="width:100%; padding-right:24px; box-sizing:border-box;">'
            +   '<button type="button" onclick="window.deleteMember3Row(' + idx + ')" title="이 인원 삭제"'
            +     ' style="position:absolute; right:3px; top:50%; transform:translateY(-50%); border:1px solid #ccc; border-radius:3px; background:#fff; color:#999; cursor:pointer; font-size:13px; line-height:1; width:18px; height:18px; padding:0; display:flex; align-items:center; justify-content:center;"'
            +     ' onmouseover="this.style.background=\'#e03131\'; this.style.borderColor=\'#e03131\'; this.style.color=\'#fff\';" onmouseout="this.style.background=\'#fff\'; this.style.borderColor=\'#ccc\'; this.style.color=\'#999\';">－</button>'
            + '</div>';
    };

    let htmlA = '', htmlB = '';
    (rows || []).forEach(function(r, idx) {
        if (idx % 2 === 0) htmlA += build(r, idx); else htmlB += build(r, idx);
    });
    colA.innerHTML = htmlA;
    colB.innerHTML = htmlB;
};

window.addMember3Row = function() {
    window.tabData = window.tabData || {};
    window.tabData.projectMembers3 = window.tabData.projectMembers3 || [];
    window.tabData.projectMembers3.push({ role: '', name: '', email: '' });
    window.renderMember3Rows(window.tabData.projectMembers3);
};

window.deleteMember3Row = function(idx) {
    window.tabData = window.tabData || {};
    // 💡 collectTabData() 전체를 부르지 않고, member-3 DOM만 직접 읽어서 최신 배열을 만듦 (다른 탭 로직과 완전 분리)
    const m3map = {};
    document.querySelectorAll('#sum-member3-col-a [data-idx], #sum-member3-col-b [data-idx]').forEach(function(el) {
        const i = el.dataset.idx;
        m3map[i] = m3map[i] || {};
        m3map[i][el.dataset.field] = el.value;
    });
    const current = Object.keys(m3map)
        .sort(function(a, b) { return Number(a) - Number(b); })
        .map(function(k) { return { role: m3map[k].role || '', name: m3map[k].name || '', email: m3map[k].email || '' }; });

    console.log('🗑 삭제 전 인원 수:', current.length, '삭제할 idx:', idx);
    current.splice(idx, 1);
    console.log('🗑 삭제 후 인원 수:', current.length);

    window.tabData.projectMembers3 = current;
    window.renderMember3Rows(current);
};

// 💡 [2026-08-20] 주요 자재 목록 — 고정 13개 구분(항상 존재·삭제불가) + 자유추가 행.
//    메일 분석 시 AI 배경정보로 함께 제공(_msBuildDefaultPrompt 참고)해서, 메일 본문에 실제
//    언급된 자재/PN을 상세내용에 정확히 반영하도록 돕는 용도.
//    💡 [분석용 체크] 자재는 여러 프로젝트가 공용으로 쓰는 경우가 흔해서(POWER/METAL/MOLD 등),
//    전부 "이 프로젝트 확증 신호"로 AI에게 주면 오매칭 위험이 있음 → PN이 겹칠 확률이 낮은 PANEL만
//    기본으로 체크해서 "분석용"(신뢰 가능한 식별 신호)으로, 나머지는 기본 미체크(참고용만)로 시작.
//    체크 여부는 프로젝트마다 사용자가 직접 조정 가능.
window.MATERIAL_FIXED_CATEGORIES = ['PANEL','SLIM/CUT','TOUCH / GLASS','TOUCH CTRL','AD BOARD','CONVERTER','BLU','POWER','METAL','MOLD','DIE CAST','PACKING','ETC'];
// 💡 구분명 변경(SLIMMING/CUTTING → SLIM/CUT) 이전에 이미 저장된 데이터도 그대로 이어받기 위한 별칭
window._MATERIAL_CATEGORY_ALIASES = { 'SLIM/CUT': ['SLIMMING/CUTTING'] };

// 💡 화면 DOM에서 현재 입력 중인 값을 그대로 읽어 배열로 재구성 (add/delete 시 다른 행의
//    미저장 편집내용이 날아가지 않도록 collectTabData() 전체를 부르지 않고 이 테이블만 직접 읽음)
// 💡 [2026-08-25 버그 수정] keepEmptyExtras가 false(기본값·저장 시 사용)면 완전히 빈 자유추가 행은
//    자동 정리했는데, "+ 자재 추가"가 이 함수로 "지금 몇 행이 있는지"를 센 뒤 그 위에 한 행을 얹는
//    방식이라 — 방금 추가해서 아직 아무것도 안 적은 빈 행이 바로 다음 호출에서 사라져버려, 연속으로
//    눌러도 매번 "빈 칸 1개"로 되돌아가는 것처럼 보였다(실제로는 늘었다 지워지길 반복). "+ 자재 추가"/
//    "－ 삭제"처럼 화면에 지금 있는 행 그대로를 기준으로 조작할 때는 keepEmptyExtras=true로 불러서
//    빈 행도 그대로 유지한 채 개수를 센다. 실제 저장(collectTabData 등)은 그대로 기본값(정리함)을 쓴다.
window.collectMaterialRows = function(keepEmptyExtras) {
    const map = {};
    document.querySelectorAll('#sum-materials-rows-a [data-idx], #sum-materials-rows-b [data-idx]').forEach(function(el) {
        const i = Number(el.dataset.idx);
        map[i] = map[i] || {};
        map[i][el.dataset.field] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    const fixedCount = window.MATERIAL_FIXED_CATEGORIES.length;
    const idxs = Object.keys(map).map(Number);
    const maxIdx = idxs.length ? Math.max(fixedCount - 1, Math.max.apply(null, idxs)) : fixedCount - 1;
    const result = [];
    for (let i = 0; i <= maxIdx; i++) {
        const r = map[i] || {};
        const isFixed = i < fixedCount;
        const category = isFixed ? window.MATERIAL_FIXED_CATEGORIES[i] : (r.category || '');
        const ktkPn = r.ktkPn || '', description = r.description || '', cost = r.cost || '';
        const useForAnalysis = !!r.useForAnalysis;
        // 고정 행은 항상 유지, 자유추가 행은 완전히 빈 채로 남으면 저장 시 자동 정리(단, keepEmptyExtras면 유지)
        if (isFixed || keepEmptyExtras || category || ktkPn || description || cost) {
            result.push({ category: category, ktkPn: ktkPn, description: description, cost: cost, useForAnalysis: useForAnalysis });
        }
    }
    return result;
};

window.renderMaterialRows = function(rows) {
    const tbodyA = document.getElementById('sum-materials-rows-a');
    const tbodyB = document.getElementById('sum-materials-rows-b');
    if (!tbodyA || !tbodyB) return;
    window.tabData = window.tabData || {};
    rows = rows || [];
    const _matEn = window._currentLang === 'en';

    // 고정 13개: 저장된 데이터에서 구분명으로 값을 이어받고(순서는 항상 고정 목록 순), 없으면 빈 값.
    // useForAnalysis: 저장된 값이 있으면 그대로, 없으면(=신규 프로젝트) PANEL만 기본 체크
    const fixedRows = window.MATERIAL_FIXED_CATEGORIES.map(function(cat) {
        const aliases = window._MATERIAL_CATEGORY_ALIASES[cat] || [];
        const found = rows.find(function(r) { return r.category === cat || aliases.indexOf(r.category) !== -1; });
        const defaultChecked = cat === 'PANEL';
        return {
            category: cat, ktkPn: found ? (found.ktkPn || '') : '', description: found ? (found.description || '') : '', cost: found ? (found.cost || '') : '',
            useForAnalysis: found ? !!found.useForAnalysis : defaultChecked, locked: true
        };
    });
    // 자유추가: 고정 목록에도, 별칭에도 없는 구분명을 가진 행
    const allAliasNames = Object.keys(window._MATERIAL_CATEGORY_ALIASES).reduce(function(acc, k) { return acc.concat(window._MATERIAL_CATEGORY_ALIASES[k]); }, []);
    const extraRows = rows.filter(function(r) { return window.MATERIAL_FIXED_CATEGORIES.indexOf(r.category) === -1 && allAliasNames.indexOf(r.category) === -1; })
        .map(function(r) { return { category: r.category, ktkPn: r.ktkPn, description: r.description, cost: r.cost, useForAnalysis: !!r.useForAnalysis, locked: false }; });
    const allRows = fixedRows.concat(extraRows);
    window.tabData.projectMaterials = allRows.map(function(r) { return { category: r.category, ktkPn: r.ktkPn, description: r.description, cost: r.cost, useForAnalysis: r.useForAnalysis }; });

    // 💡 [2열 배치] 프로젝트 멤버-1/2와 같은 느낌으로 좌우 분할. 고정 13개(ETC 제외 12개) 중
    //    왼쪽 7개/오른쪽 5개로 나누고, 자유추가 행은 아래에서 지그재그로 배정한다.
    const splitAt = Math.ceil(window.MATERIAL_FIXED_CATEGORIES.length / 2); // 7
    const rowHtml = function(r, idx, pos) {
        // 💡 [2026-08-29 색상 정리] TYPE 칸이 제브라와 무관하게 항상 헤더색(#eef6f7)으로 고정돼 있어서,
        //    같은 행 안에서 TYPE 칸만 따로 노는 것처럼 보였음 — 헤더 배경(#eef6f7)은 <thead>에만 쓰고,
        //    본문 행은 TYPE 칸도 나머지 칸과 동일하게 제브라(A=#fff/B=#e8f2f3)를 따르도록 통일.
        // 💡 [2026-08-30 수정] 제브라를 "고정 13개 목록에서의 논리적 idx"로 계산했더니, 오른쪽 표는
        //    항상 idx=7부터 시작(홀수)이라 첫 행부터 음영이 깔려 왼쪽 표(idx=0, 첫 행 흰색)와 줄무늬가
        //    어긋나 보였음 — 화면에 실제로 그려지는 위치(pos, 각 표 안에서 0부터 시작)로 계산해서
        //    좌우 표가 항상 같은 행 번호끼리 같은 색이 되도록 통일.
        const _zebraBg = pos % 2 === 1 ? '#e8f2f3' : '#fff';
        const catCell = r.locked
            ? '<td style="padding:4px 6px; border:1px solid #cfe3e5; background:' + _zebraBg + '; font-weight:bold; white-space:nowrap; text-align:center;">' + escapeHtml(r.category) + '</td>'
            : '<td style="padding:2px; border:1px solid #cfe3e5; background:' + _zebraBg + ';"><input type="text" data-idx="' + idx + '" data-field="category" class="u-input" value="' + _escTabVal(r.category) + '" placeholder="' + (_matEn ? 'Category' : '구분명') + '" style="border:none; width:100%; box-sizing:border-box; text-align:center; background:transparent; font-weight:bold;"></td>';
        // 💡 [2026-08-25 UX 개선] 예전엔 "삭제 버튼"이 맨 오른쪽 체크박스 칸에 있어서 눈에 잘 안 띈다는
        //    지적이 있었음 — PANEL 행의 🔎(스펙 미리보기) 버튼과 같은 자리(설명 입력칸 바로 옆)로 옮겨서,
        //    자유추가 행을 열 때 바로 보이는 "행 액션 버튼" 자리로 통일했다.
        const delBtn = r.locked ? '' : '<button type="button" onclick="window.deleteMaterialRow(' + idx + ')" title="' + (_matEn ? 'Delete this row' : '이 행 삭제') + '" style="flex-shrink:0; border:1px solid #ccc; border-radius:3px; background:#fff; color:#999; cursor:pointer; font-size:11px; width:20px; height:20px; line-height:1; padding:0;">－</button>';
        // 💡 [2026-08-25 신규 — Panel Compare 연동] PANEL 구분 행에 모델명이 적혀 있으면, 그 옆에
        //    스펙 미리보기 버튼을 붙인다 — 클릭하면 패널 스펙 라이브러리에서 조회해 보여주고,
        //    Panel Compare 탭 비교표에 없으면 바로 추가할 수 있게 한다.
        // 💡 [2026-08-26 신규 — Elec Parts 연동] CONVERTER/AD BOARD 구분 행도 PANEL과 완전히 동일한
        //    규칙 — 값이 있을 때만 돋보기를 보여준다(showElecPartSpecModal 내부에서 빈칸/미등록 두
        //    경우 모두 "붙여넣어 AI로 추출" 흐름으로 이어주지만, 버튼 노출 자체는 PANEL과 통일).
        //    구분명 → Elec Parts 타입 매핑이라 나중에 부품 종류가 늘어도 이 한 줄만 추가하면 됨.
        const _epRowType = { 'CONVERTER': 'convbd', 'AD BOARD': 'adbd' };
        // 💡 [2026-09-01 신규] 돋보기 노출 조건을 "description 있음"에서 "description 또는 ktkPn 있음"으로
        //    확장 — ktk pn만 먼저 적어놓고 이름은 아직 안 적은 경우에도 코드만으로 라이브러리 검색 가능.
        //    검색 자체는 description(이름 식별자)은 그대로 두고 ktkPn을 별도 "코드 힌트"로 같이 넘겨서
        //    showPanelSpecModal/showElecPartSpecModal 내부에서 "코드_이름" 조합으로 라이브러리를 찾게
        //    한다(비교표 식별자로 쓰이는 model 문자열 자체는 안 건드려서, 이미 비교표에 등록된 항목과의
        //    대조·재추출 흐름은 그대로 유지됨).
        const _hasSpecKey = !!(r.description || r.ktkPn);
        const descInputCell = '<td style="padding:2px; border:1px solid #cfe3e5;"><div style="display:flex; align-items:center; gap:2px;">'
            + '<input type="text" data-idx="' + idx + '" data-field="description" class="u-input" value="' + _escTabVal(r.description) + '" placeholder="' + (_matEn ? 'e.g. MV315QHM-N41' : '예: MV315QHM-N41') + '" style="border:none; width:100%; box-sizing:border-box; background:transparent;" '
            + ((r.category === 'PANEL' || _epRowType[r.category]) ? 'onchange="window.renderMaterialRows(window.collectMaterialRows(true));"' : '') + '>'
            + ((r.category === 'PANEL' && _hasSpecKey)
                ? '<button type="button" onclick="window.showPanelSpecModal(' + escapeHtml(JSON.stringify(r.description)) + ', ' + escapeHtml(JSON.stringify(r.ktkPn || '')) + ')" title="' + (_matEn ? 'Panel spec preview' : '패널 스펙 미리보기') + '" style="flex-shrink:0; border:1px solid #2c5f8a; border-radius:3px; background:#fff; color:#2c5f8a; cursor:pointer; font-size:11px; width:20px; height:20px; line-height:1; padding:0;">🔎</button>'
                : ((_epRowType[r.category] && _hasSpecKey)
                    ? '<button type="button" onclick="window.showElecPartSpecModal(' + escapeHtml(JSON.stringify(_epRowType[r.category])) + ', ' + escapeHtml(JSON.stringify(r.description)) + ', ' + escapeHtml(JSON.stringify(r.ktkPn || '')) + ')" title="' + (_matEn ? 'Spec preview' : '스펙 미리보기') + '" style="flex-shrink:0; border:1px solid #2c5f8a; border-radius:3px; background:#fff; color:#2c5f8a; cursor:pointer; font-size:11px; width:20px; height:20px; line-height:1; padding:0;">🔎</button>'
                    : ''))
            + delBtn
            + '</div></td>';
        return '<tr style="background:' + _zebraBg + ';">' + catCell
            + '<td style="padding:2px; border:1px solid #cfe3e5;"><input type="text" data-idx="' + idx + '" data-field="ktkPn" class="u-input" value="' + _escTabVal(r.ktkPn) + '" maxlength="6" style="border:none; width:100%; box-sizing:border-box; background:transparent;" '
            + ((r.category === 'PANEL' || _epRowType[r.category]) ? 'onchange="window.renderMaterialRows(window.collectMaterialRows(true));"' : '') + '></td>'
            + descInputCell
            + '<td style="padding:2px; border:1px solid #cfe3e5;"><input type="text" data-idx="' + idx + '" data-field="cost" class="u-input" value="' + _escTabVal(r.cost) + '" style="border:none; width:100%; box-sizing:border-box; background:transparent;"></td>'
            + '<td style="border:1px solid #cfe3e5; text-align:center; white-space:nowrap;"><input type="checkbox" data-idx="' + idx + '" data-field="useForAnalysis" ' + (r.useForAnalysis ? 'checked' : '') + ' title="' + (_matEn ? 'Check to trust mentions of this PN as a project-identifying signal (uncheck for shared/common parts)' : '체크하면 이 PN 언급을 프로젝트 식별 신호로 신뢰함(공용 부품이면 체크 해제 권장)') + '"></td>'
            + '</tr>';
    };

    // 💡 [2026-08-25 UX 개선] 자유추가 행을 전부 오른쪽에만 쌓으면 오른쪽만 계속 길어지고 왼쪽엔
    //    빈 공간이 남는다는 지적이 있었음 — 왼쪽 고정 7개/오른쪽 고정 5개(+ETC)는 그대로 두고,
    //    새로 추가되는 자유추가 행은 항상 "더 짧은 쪽"에 지그재그로 배정해서 두 표의 높이가 비슷하게
    //    유지되도록 한다(아래 그리디 로직 참고). ETC는 항상 오른쪽 표 맨 마지막에 고정. data-idx는
    //    원래 논리적 위치(고정 목록에서의 자리) 그대로 유지해서 collectMaterialRows()의 위치 기반 해석이 깨지지 않는다.
    const logicalRows = allRows.map(function(r, i) { return { r: r, idx: i }; });
    const etcEntry = logicalRows.find(function(e) { return e.r.category === 'ETC'; });
    const nonEtcRows = logicalRows.filter(function(e) { return e.r.category !== 'ETC'; });
    const fixedNonEtc = nonEtcRows.slice(0, window.MATERIAL_FIXED_CATEGORIES.length - 1); // 고정 12개(ETC 제외)
    const extrasList = nonEtcRows.slice(window.MATERIAL_FIXED_CATEGORIES.length - 1);     // 자유추가 행들
    const leftFixed = fixedNonEtc.slice(0, splitAt);   // PANEL~BLU (7개)
    const rightFixed = fixedNonEtc.slice(splitAt);     // POWER~PACKING (5개)

    // 💡 왼쪽이 고정 7개로 시작해 오른쪽(5개)보다 2개 더 많으므로, 단순 홀짝 교대(왼→오→왼→오)로는
    //    그 격차가 끝까지 안 좁혀진다. 대신 "지금 더 짧은 쪽에 추가, 같으면 왼쪽"으로 매번 판단하는
    //    그리디 방식을 쓰면 처음엔 오른쪽에 2개 연속 붙어 격차를 메운 뒤(→R,R), 그 다음부턴 자연스럽게
    //    한 칸씩 번갈아 붙는다(→L,R,L,R…) — 두 표의 높이가 항상 최대 1행 차이로 유지된다.
    const extraLeft = [], extraRight = [];
    let _matLeftCount = leftFixed.length, _matRightCount = rightFixed.length;
    extrasList.forEach(function(e) {
        if (_matLeftCount <= _matRightCount) { extraLeft.push(e); _matLeftCount++; }
        else { extraRight.push(e); _matRightCount++; }
    });

    const displayLeft = leftFixed.concat(extraLeft);
    const displayRight = rightFixed.concat(extraRight);
    if (etcEntry) displayRight.push(etcEntry);

    tbodyA.innerHTML = displayLeft.map(function(e, pos) { return rowHtml(e.r, e.idx, pos); }).join('');
    tbodyB.innerHTML = displayRight.map(function(e, pos) { return rowHtml(e.r, e.idx, pos); }).join('');
};

window.addMaterialRow = function() {
    const current = window.collectMaterialRows(true); // 지금 화면에 입력 중인 값 보존(빈 자유추가 행도 유지해야 연속 클릭 시 계속 늘어남)
    current.push({ category: '', ktkPn: '', description: '', cost: '', useForAnalysis: false });
    window.tabData.projectMaterials = current;
    window.renderMaterialRows(current);
};

window.deleteMaterialRow = function(idx) {
    if (idx < window.MATERIAL_FIXED_CATEGORIES.length) return; // 고정 구분은 삭제 불가(안전장치)
    const current = window.collectMaterialRows(true); // 다른 빈 자유추가 행이 먼저 정리되면 idx가 어긋나므로 그대로 유지한 채 삭제
    current.splice(idx, 1);
    window.tabData.projectMaterials = current;
    window.renderMaterialRows(current);
};

// ═══════════════════════════════════════════════════════════════════
// 🖥️ [2026-08-25 신규] Panel Compare — panelook.com을 참고한 패널 스펙 비교표
//    - 패널 스펙 자체는 팀 공용 Drive 라이브러리(PanelSpecLibrary_Shared.json)에 모델명 기준으로 저장
//      → 한 번 AI로 추출한 패널은 다른 프로젝트에서도 재사용 가능 (AddressBook/project_index.json과 동일 패턴)
//    - 프로젝트는 "이 비교표에 어떤 모델을 골라뒀는지"(최대 10개)만 자기 tabData.panelCompare에 저장
//    - panelook.com은 봇 차단(캡차)이 있고 모델명만으로 상세페이지 직접링크를 만들 수 없어서,
//      스펙은 사용자가 붙여넣은 텍스트를 AI로 추출하고, 모델명 헤더는 검색결과 링크로 연결한다.
// ═══════════════════════════════════════════════════════════════════

// 💡 첨부 샘플 엑셀("PANEL COMP TABLE" 시트)의 11개 섹션·113개 항목을 그대로 옮긴 고정 템플릿.
//    각 항목의 두 번째 값(1|2)은 표시 우선순위 — 1=핵심스펙(항상 표시), 2=부가스펙(기본 접힘).
//    원본의 "[Electronics Feure]" 오타는 "Electronics Features"로, "Rec.2020 voverage"/"Late Time Order"
//    같은 명백한 오타도 새로 만드는 템플릿이니 정리했다(사용자 확인됨).
window.PANEL_SPEC_SCHEMA = [
    { section: 'Basic Information', fields: [
        ['Panel Brand', 1], ['Item Code', 1], ['Part Name', 1], ['Revision', 1], ['Panel Type', 1], ['Composition', 1], ['Shipping Mode', 2],
        ['Operating Temperature', 2], ['Storage Temperature', 2], ['Vibration Level', 2],
        ['RoHS State', 2], ['Application', 2], ['Specific Feature', 2], ['Remarks', 2],
    ]},
    { section: 'Mechanical Features', fields: [
        ['Diagonal Size', 1], ['Dot Resolution', 1], ['Pixel Configuration', 1], ['Aspect Ratio', 1],
        ['Form Factor', 1], ['Dot Pitch (HxV)', 1], ['Weight', 2], ['Surface Glare', 1],
        ['Surface Hardness', 1], ['Surface Reflection', 2], ['Active Area (HxV)', 1],
        ['Bezel Area (HxV)', 2], ['Outline Dimension (HxV)', 1], ['Outline Depth', 1],
        ['Substrate Thickness', 2], ['Shape Style', 2], ['Mount & Brackets', 2], ['Landscape or Portrait', 1],
    ]},
    { section: 'Touch Panel', fields: [
        ['Touch Panel', 1], ['Simultaneously Touch', 2], ['Touch Signal Type', 2],
        ['Touch Interface Type', 2], ['Touch Controller', 2], ['Touch OS System', 2],
    ]},
    { section: 'Optical Features', fields: [
        ['Display Mode', 1], ['Brightness (Min/Typ) (cd/m²)', 1], ['HDR Peak', 2],
        ['Transmissive Contrast Ratio', 1], ['Display Color', 1], ['Gray Method', 1],
        ['Low Blue Light', 2], ['NTSC Ratio', 1], ['sRGB Coverage', 2], ['Adobe Coverage', 2],
        ['DCI-P3 Coverage', 2], ['Rec.2020 Coverage', 2], ['Viewing Angle (L/R/U/D)', 1],
        ['Viewing Direction', 2], ['Response Time', 1], ['Color Temperature', 1],
        ['White Color Coordinates', 1], ['White Variation (Max/Min)', 1], ['Transmissivity (%)', 1],
        ['Reflectance Ratio (%)', 2], ['Sunlight Readable', 2],
    ]},
    { section: 'Electronics Features', fields: [
        ['Vertical Frequency', 1], ['Sync Type', 2], ['Scan Direction', 1], ['Reverse Scan', 1],
        ['Total Power Consumption', 2], ['Driver IC', 2], ['T-CON', 2],
    ]},
    { section: 'Backlight System', fields: [
        ['Lamp Position', 1], ['Lamp Type', 2], ['Lamp Amount', 2], ['Lamp Shape', 2],
        ['Lamp Life Time (Hrs)', 1], ['Lamp Voltage', 2], ['Lamp Current', 2],
        ['Lamps Power Consumption', 2], ['Lamp Driver Board', 1], ['Input Voltage of Lamp Driver', 2],
        ['Input Current of Lamp Driver', 2], ['BLU Power Consumption', 2], ['PWM Duty Ratio', 2],
        ['PWM Frequency', 2], ['BLU Interface Type', 2], ['BLU Interface Position', 2],
        ['BLU Interface Brand', 2], ['BLU Interface Model', 2], ['BLU Interface Pin Pitch', 2],
        ['BLU Interface Amount', 2], ['Pin Amount of BLU Interface', 2], ['BLU Interface Pin Configuration', 2],
    ]},
    { section: 'Signal Interface', fields: [
        ['Signal Interface Category', 1], ['Signal Interface Class', 1], ['Input Voltage for Panel', 1],
        ['Input Current for Panel', 2], ['Panel Power Consumption', 2], ['Voltage for Display Signals', 2],
        ['Signal Interface Type', 2], ['Signal Interface Position', 2], ['Signal Interface Brand', 2],
        ['Signal Interface Model', 2], ['Signal Interface Pin Pitch', 2], ['Signal Interface Amount', 2],
        ['Signal Interface Pins', 1], ['Signal Pin Configuration', 2],
    ]},
    { section: 'Packing Form', fields: [ ['Minimum Package', 2] ] },
    { section: 'Datasheet Source', fields: [
        ['Document Language', 2], ['Datasheet Version', 2], ['Issue Date', 2],
    ]},
    { section: 'Production State', fields: [
        ['Customer Sample', 2], ['Mass Production', 2], ['Last Time Order', 2],
        ['Last Time Shipment', 2], ['Production State Now', 1],
    ]},
    { section: 'Other', fields: [
        ['Expected Price', 1], ['Expected Price (Cutting/Slimming)', 2], ['Investment', 2], ['Note', 1],
    ]},
];
window._panelFlatFields = function() {
    const out = [];
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) { sec.fields.forEach(function(f) { out.push(f[0]); }); });
    return out;
};

// ─── 팀 공용 패널 스펙 라이브러리 (AddressBook/project_index.json과 동일한 Drive 위치·업서트 패턴) ───
const PANEL_LIB_FILENAME = 'PanelSpecLibrary_Shared.json';
window._panelLibFileId = null;
window.findPanelLibFile = async function(token) {
    if (window._panelLibFileId) return window._panelLibFileId;
    const folderId = await window.getOrCreateConfigFolder(token);
    const id = await window._findOrMigrateFile(token, PANEL_LIB_FILENAME, folderId);
    if (id) window._panelLibFileId = id;
    return id;
};
window._panelLibNamesMatch = function(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); };
window.findPanelInLibrary = function(lib, model) {
    // 💡 [2026-08-27] Summary 주요자재 PANEL 설명칸에 코드 유무가 오락가락해도 찾을 수 있도록,
    //    CONV/AD BD와 동일한 범용 매처(_epFlexibleFind)를 재사용한다(완전일치 우선, 실패 시 코드/이름 분리 대조).
    const panels = (lib && lib.panels) || [];
    return window._epFlexibleFind(
        panels, model,
        function(p) { return p.model; },
        function(p) { return p.specs && p.specs['Item Code']; },
        function(p) { return p.specs && p.specs['Part Name']; }
    );
};
window.loadPanelLibrary = async function() {
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return { panels: [] };
        const fileId = await window.findPanelLibFile(token);
        if (!fileId) return { panels: [] };
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return (data && Array.isArray(data.panels)) ? data : { panels: [] };
    } catch (e) { console.warn('패널 라이브러리 로드 실패:', e.message); return { panels: [] }; }
};
window.upsertPanelLibraryEntry = async function(entry) {
    const _en = window._currentLang === 'en';
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { alert(_en ? '🔒 Please connect Google Drive first.' : '🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return false; }
        const fileId = await window.findPanelLibFile(token);
        let lib = { panels: [] };
        if (fileId) {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } });
            const loaded = await res.json();
            if (loaded && Array.isArray(loaded.panels)) lib = loaded;
        }
        const idx = lib.panels.findIndex(function(p) { return window._panelLibNamesMatch(p.model, entry.model); });
        entry.updatedAt = new Date().toISOString();
        entry.updatedBy = window.currentUserName || '';
        if (idx === -1) lib.panels.push(entry); else lib.panels[idx] = entry;
        const body = JSON.stringify(lib);
        if (fileId) {
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body
            });
        } else {
            const folderId = await window.getOrCreateConfigFolder(token);
            const boundary = 'panel_lib_boundary';
            const metadata = { name: PANEL_LIB_FILENAME, mimeType: 'application/json', parents: [folderId] };
            const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body + "\r\n--" + boundary + "--";
            const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` }, body: multipartBody
            });
            const created = await createRes.json();
            if (created && created.id) window._panelLibFileId = created.id;
        }
        return true;
    } catch (e) { alert((_en ? 'Failed to save panel library: ' : '패널 라이브러리 저장 실패: ') + e.message); return false; }
};

// 💡 [2026-08-25 신규] 스펙 수정 중 모델명을 바꾼 경우, 예전 이름의 라이브러리 항목을 정리하기 위해
//    사용 — 실패해도 조용히 넘어간다(라이브러리에 옛 이름 항목이 하나 남는 정도라 저장 자체는 막지 않음).
window._panelLibRemoveEntry = async function(model) {
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return false;
        const fileId = await window.findPanelLibFile(token);
        if (!fileId) return true;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } });
        const loaded = await res.json();
        if (!loaded || !Array.isArray(loaded.panels)) return true;
        const before = loaded.panels.length;
        loaded.panels = loaded.panels.filter(function(p) { return !window._panelLibNamesMatch(p.model, model); });
        if (loaded.panels.length === before) return true;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(loaded)
        });
        return true;
    } catch (e) { console.warn('패널 라이브러리 항목 삭제 실패:', e.message); return false; }
};

// ─── AI 추출: 붙여넣은 스펙 텍스트 → 113개 항목 JSON (기존 callAiBackend/getActiveAiKey 재사용) ───
// 💡 [2026-08-25] 예전엔 8000자로 자르고 있었는데, PDF 데이터시트(pdf.js로 뽑으면 페이지마다
//    머리말/꼬리말까지 다 들어가 금방 길어짐)는 이 정도로는 스펙 표 뒷부분이 통째로 잘려서 분석이
//    안 되는 문제가 있었다. 4배로 올리고(대부분의 AI 제공사 무료/저가 모델도 이 정도 입력은 소화함),
//    아래 _pcCleanExtractedText로 반복되는 페이지 머리말/꼬리말 노이즈부터 걷어내 같은 글자수 예산
//    안에 실제 스펙 내용이 더 많이 들어가게 한다.
window._PANEL_EXTRACT_TEXT_LIMIT = 32000;
window._panelBuildExtractPrompt = function(rawText) {
    const fields = window._panelFlatFields();
    const keyListText = fields.map(function(f) { return '- "' + f + '"'; }).join('\n');
    return `당신은 LCD/OLED 디스플레이 패널 데이터시트 분석 전문가입니다.
아래 [원문 텍스트]는 panelook.com 페이지 또는 패널 데이터시트에서 사용자가 복사한 내용입니다.
여기서 패널 스펙 정보를 추출해서, 아래 키 목록을 정확히 그대로 사용한 하나의 JSON 객체로만 답하세요(다른 설명이나 마크다운 코드블럭 없이 JSON 객체 하나만).

키 목록(최상위 1개 + 스펙 항목들):
- "Model Name" (패널의 정확한 모델명, 예: DV430FHM-NN1)
${keyListText}

규칙:
1. 텍스트 안에서 찾을 수 없는 항목은 반드시 정확히 "-" 하나로 채우세요. 추측하거나 지어내지 마세요.
2. 값은 원문 표기(단위 포함)를 최대한 그대로 유지하세요.
3. 위에 나열된 키 이름을 한 글자도 다르지 않게 정확히 그대로 사용하세요.
4. "Model Name"도 못 찾으면 "-"로 답하세요.
5. ⚠️ 이 텍스트는 웹페이지를 인쇄/저장해서 뽑은 것이라, 항목명(라벨)들이 한 곳에 몰려 나오고 실제 값들은
   전혀 다른 위치에 순서대로만 나열되어 있는 경우가 있습니다(예: 라벨 목록 "Panel Brand / Panel Type / ..."이
   먼저 다 나온 뒤, 한참 뒤에 값 목록 "BOE / a-Si TFT-LCD / ..."가 나옴). 이런 경우 값의 형식(온도 범위,
   %, 해상도, mm 단위, 색상 좌표 등)과 패널 스펙 도메인 지식을 활용해 각 값이 실제로 어느 항목에 해당하는지
   판단해서 정확히 매칭하세요 — 텍스트 안에서의 물리적 인접성만으로 판단하지 마세요.

[원문 텍스트]
${(rawText || '').substring(0, window._PANEL_EXTRACT_TEXT_LIMIT)}`;
};

// 💡 PDF(특히 pdf.js로 뽑은 텍스트)는 페이지마다 반복되는 머리말/꼬리말/워터마크 줄이 그대로 다 붙어나와
//    같은 문장이 페이지 수만큼 중복되는 경우가 흔하다 — 실제 스펙 내용은 안 늘고 글자수만 차지해서
//    위 글자수 제한에 더 쉽게 걸리게 만든다. 8자 넘는 줄이 3번 이상 똑같이 반복되면 첫 등장만 남기고
//    나머지는 지운다(짧은 줄은 표의 값/단위처럼 정상적으로 반복될 수 있어 건드리지 않음).
window._pcCleanExtractedText = function(raw) {
    if (!raw) return '';
    const lines = String(raw).split('\n').map(function(l) { return l.replace(/[ \t]+/g, ' ').trim(); });
    const counts = {};
    lines.forEach(function(l) { if (l.length > 8) counts[l] = (counts[l] || 0) + 1; });
    const seen = {};
    const filtered = lines.filter(function(l) {
        if (l.length > 8 && counts[l] >= 3) {
            seen[l] = (seen[l] || 0) + 1;
            return seen[l] === 1; // 반복되는 줄은 처음 한 번만 남김
        }
        return true;
    });
    return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
window._panelParseAiJson = function(text) {
    if (!text) return null;
    let s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = s.indexOf('{'); const end = s.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
};

// ─── 탭 렌더링 ───
window._pcExpanded = false;
window._panelCompareLibCache = null;
window.renderPanelCompareTab = async function() {
    const _en = window._currentLang === 'en';
    const theadEl = document.getElementById('pc-thead');
    const tbodyEl = document.getElementById('pc-tbody');
    const emptyEl = document.getElementById('pc-empty-msg');
    if (!theadEl || !tbodyEl) return;

    window.tabData = window.tabData || {};
    window.tabData.panelCompare = window.tabData.panelCompare || { selectedModels: [], lastAutoSeed: null, notes: {} };
    const pc = window.tabData.panelCompare;
    pc.notes = pc.notes || {};

    // 💡 Summary 주요자재 PANEL 구분 행 자동 반영 — 등록된 모델명이 새로 생기거나 바뀌면 비교표 맨 앞에 자동 추가.
    //    (한 번 자동 추가된 뒤 사람이 일부러 뺐으면, 같은 값일 때는 다시 억지로 넣지 않는다 — lastAutoSeed로 추적)
    const materials = window.collectMaterialRows ? window.collectMaterialRows() : (window.tabData.projectMaterials || []);
    const panelMat = (materials || []).find(function(m) { return m.category === 'PANEL'; });
    const registeredModel = panelMat && panelMat.description ? panelMat.description.trim() : '';
    if (registeredModel && registeredModel !== pc.lastAutoSeed) {
        if (pc.selectedModels.indexOf(registeredModel) === -1) pc.selectedModels.unshift(registeredModel);
        pc.lastAutoSeed = registeredModel;
    }

    // 💡 [2026-08-25] 예전엔 선택된 패널이 0개면 표 자체를 숨기고 안내문만 보여줬는데, 이제는 "기본 4열"
    //    (라벨/슬롯1/슬롯2/Note)을 항상 그려서 빈 슬롯 헤더 자체가 "패널 추가" 진입점 역할을 하게 한다.
    if (emptyEl) emptyEl.style.display = 'none';
    theadEl.innerHTML = `<tr><th colspan="99" style="padding:16px; text-align:center; color:#999; background:#fff;">${_en ? 'Loading…' : '불러오는 중...'}</th></tr>`;
    tbodyEl.innerHTML = '';
    const lib = await window.loadPanelLibrary();
    window._panelCompareLibCache = lib;

    const selected = pc.selectedModels.slice(0, 10);
    const slotCount = Math.max(2, selected.length); // 💡 기본 최소 2개 비교 슬롯(3열)을 항상 보여줌
    const entries = selected.map(function(m) { return window.findPanelInLibrary(lib, m); });
    const totalCols = 1 + slotCount + 1; // 라벨 + 슬롯들 + Note

    let headHtml = '<tr>';
    headHtml += `<th style="min-width:140px;">Comparison table</th>`;
    for (let i = 0; i < slotCount; i++) {
        const m = selected[i];
        if (m) {
            const url = 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(m);
            const has = !!entries[i];
            headHtml += `<th style="min-width:120px; padding-left:6px; padding-right:6px; padding-top:4px !important; padding-bottom:4px !important;">
                <a href="${url}" target="_blank" rel="noopener" title="${_en ? 'Open panelook.com search results' : 'panelook.com 검색결과 열기'}" style="color:#2c5f8a; text-decoration:underline; font-weight:bold; word-break:break-all;">${escapeHtml(m)}</a>
                <div style="margin-top:2px; display:flex; gap:4px; justify-content:center; align-items:center; flex-wrap:wrap;">
                    ${has ? `<button data-pc-edit="${escapeHtml(m)}" title="${_en ? 'Edit spec / rename' : '스펙 수정 / 이름 변경'}" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="background:#fbead9; border:1px solid #edbf85; border-radius:3px; color:#a85d0a; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">✏️</button>` : ''}
                    <button data-pc-reextract="${escapeHtml(m)}" title="${_en ? 'Re-extract / refresh' : '다시 추출/갱신'}" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:3px; color:#1a4f7a; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">🔄</button>
                    <button data-pc-remove="${escapeHtml(m)}" title="${_en ? 'Remove from this comparison' : '이 프로젝트에서 제거'}" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="background:#fbe4e2; border:1px solid #eeb0ac; border-radius:3px; color:#b1432f; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">🗑</button>
                    ${!has ? `<span style="font-size:9.5px; color:#e67e22; font-weight:bold; white-space:nowrap;">⚠ ${_en ? 'Not extracted' : '미추출'}</span>` : ''}
                </div>
            </th>`;
        } else {
            headHtml += `<th class="pc-slot-empty" style="min-width:120px; cursor:pointer;" onclick="window.panelCompareOpenAddModal()" title="${_en ? 'Click to add a panel' : '클릭해서 패널 추가'}">
                ${_en ? '+ Add' : '+ 추가'}
            </th>`;
        }
    }
    headHtml += `<th style="min-width:130px;">Note</th>`;
    headHtml += '</tr>';
    theadEl.innerHTML = headHtml;

    let html = '';
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) {
        html += `<tr class="pc-section-row"><td colspan="${totalCols}" style="background:#fff8e6; color:#7a5210; font-weight:bold; padding:5px 10px; border:1px solid #e3e6ea;">[${escapeHtml(sec.section)}]</td></tr>`;
        sec.fields.forEach(function(f) {
            const label = f[0], priority = f[1];
            const rowStyle = priority === 2 ? ('display:' + (window._pcExpanded ? 'table-row' : 'none') + ';') : '';
            html += `<tr class="${priority === 2 ? 'pc-p2-row' : ''}" style="${rowStyle}">`;
            html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px; color:#555; white-space:nowrap;">${escapeHtml(label)}</td>`;
            for (let i = 0; i < slotCount; i++) {
                const entry = entries[i];
                const v = entry && entry.specs && entry.specs[label] != null && entry.specs[label] !== '' ? entry.specs[label] : '-';
                html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px;">${selected[i] ? escapeHtml(String(v)) : ''}</td>`;
            }
            const noteVal = pc.notes[label] || '';
            html += `<td style="border:1px solid #e9ecef; padding:2px 4px; font-size:12px;"><input type="text" value="${escapeHtml(noteVal)}" onchange="window.panelCompareSetNote(${escapeHtml(JSON.stringify(label))}, this.value)" style="width:100%; box-sizing:border-box; border:none; font-size:11.5px; padding:2px 4px; background:transparent; text-align:center;"></td>`;
            html += '</tr>';
        });
    });
    tbodyEl.innerHTML = html;
    window._pcApplyZebra();

    const toggleBtn = document.getElementById('pc-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = window._pcExpanded ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
};

// 💡 [2026-08-25 신규] Note 열 — 사용자가 프로젝트별로 자유롭게 남기는 메모(패널과 무관, 항목별 1개).
window.panelCompareSetNote = function(label, value) {
    window.tabData = window.tabData || {};
    window.tabData.panelCompare = window.tabData.panelCompare || { selectedModels: [], notes: {} };
    window.tabData.panelCompare.notes = window.tabData.panelCompare.notes || {};
    const oldVal = window.tabData.panelCompare.notes[label] || '';
    window.tabData.panelCompare.notes[label] = value;
    window.pcLogChange(label, 'Note', oldVal, value);
    // 💡 dirty 표시는 #tab-elecparts가 _NON_GANTT_DIRTY_SELECTORS에 포함돼 있어 change 이벤트로 자동 처리됨
};

// ── Panel Compare 탭 변경이력 (토글/기록/렌더링/삭제) — Summary/Brief SPEC/M.C Table과 동일 패턴 ──
window.pcToggleHistoryBox = function() {
    const body = document.getElementById('pc-history-body');
    const icon = document.getElementById('pc-history-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
    if (!isOpen && window.pcRenderHistoryTable) window.pcRenderHistoryTable();
};

window.pcLogChange = function(rowLabel, field, oldVal, newVal) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.panelCompareChangeLog = window.tabData.panelCompareChangeLog || [];
    window.tabData.panelCompareChangeLog.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal
    });
};

window.pcRenderHistoryTable = function() {
    const table = document.getElementById('pc-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.panelCompareChangeLog) || [];
    const _hisEn = window._currentLang === 'en';
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">' + (_hisEn ? 'No change history.' : '수정 이력이 없습니다.') + '</td></tr>'; return; }
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Panel / Item' : '패널 / 항목') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Field' : '필드') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Before' : '변경 전') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'After' : '변경 후') + '</th>'
        + '</tr></thead><tbody>';
    logs.slice().reverse().forEach(function(log) {
        html += '<tr><td style="padding:4px 8px; color:#6c757d;">' + log.time + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold; color:#0056b3;">' + (log.userName || (_hisEn ? 'Unknown' : '알 수 없음')) + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold;">' + (log.row || '') + '</td>'
            + '<td style="padding:4px 8px;"><span class="badge" style="background:#e7f1ff; color:#0056b3;">' + (log.field || '') + '</span></td>'
            + '<td style="padding:4px 8px; color:#c92a2a;">' + (log.oldVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#2f9e44;">' + (log.newVal || '-') + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
};

window.deletePcHistoryByDateRange = function() {
    const pwEl = document.getElementById('pc-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) { if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.'); return; }
    const fromStr = (document.getElementById('pc-history-del-from') || {}).value;
    const toStr = (document.getElementById('pc-history-del-to') || {}).value;
    if (!fromStr || !toStr) { if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.'); return; }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) { if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.'); return; }
    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) { const ts = parseKoDateTime(log.time); return ts !== null && ts >= fromTs && ts <= toTs; };
    const doDelete = function() {
        let removedCount = 0;
        if (window.tabData && window.tabData.panelCompareChangeLog && window.tabData.panelCompareChangeLog.length) {
            const before = window.tabData.panelCompareChangeLog.length;
            window.tabData.panelCompareChangeLog = window.tabData.panelCompareChangeLog.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.panelCompareChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        if (window.pcRenderHistoryTable) window.pcRenderHistoryTable();
        const msg = removedCount + '건의 Panel Compare 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };
    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 Panel Compare 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

window.panelCompareToggleExpand = function() {
    window._pcExpanded = !window._pcExpanded;
    document.querySelectorAll('#pc-table .pc-p2-row').forEach(function(tr) { tr.style.display = window._pcExpanded ? 'table-row' : 'none'; });
    const toggleBtn = document.getElementById('pc-toggle-btn');
    const _en = window._currentLang === 'en';
    if (toggleBtn) toggleBtn.textContent = window._pcExpanded ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
    window._pcApplyZebra(); // 💡 펼침/접힘으로 보이는 행이 바뀌면 줄무늬도 다시 계산해야 깨지지 않음
};

// 💡 지브라 줄무늬 — 숨겨진(display:none) 부가 스펙 행이나 섹션 구분 행은 세지 않고, "실제로 보이는
//    데이터 행"만 순서대로 흰색/연회색을 번갈아 매긴다. 그래야 부가 스펙을 접었다 펼쳐도 줄무늬가 안 깨짐.
window._pcApplyZebra = function() {
    const rows = document.querySelectorAll('#pc-table tbody tr:not(.pc-section-row)');
    let i = 0;
    rows.forEach(function(tr) {
        tr.classList.remove('mc-zebra-a', 'mc-zebra-b');
        if (tr.style.display === 'none') return;
        tr.classList.add(i % 2 === 0 ? 'mc-zebra-a' : 'mc-zebra-b');
        i++;
    });
};

window.panelCompareRemove = function(model) {
    if (!window.tabData || !window.tabData.panelCompare) return;
    window.tabData.panelCompare.selectedModels = window.tabData.panelCompare.selectedModels.filter(function(m) { return m !== model; });
    window.pcLogChange(model, window._currentLang === 'en' ? 'Comparison table' : '비교표', window._currentLang === 'en' ? 'Included' : '포함', window._currentLang === 'en' ? 'Removed' : '제거');
    window.renderPanelCompareTab();
};

window.panelCompareAddFromLibrary = function(model) {
    const _en = window._currentLang === 'en';
    window.tabData = window.tabData || {};
    window.tabData.panelCompare = window.tabData.panelCompare || { selectedModels: [], lastAutoSeed: null };
    const sel = window.tabData.panelCompare.selectedModels;
    if (sel.indexOf(model) !== -1) { if (window.showToast) window.showToast(_en ? 'Already in the comparison table.' : '이미 비교표에 있습니다.', 'info'); return; }
    if (sel.length >= 10) { alert(_en ? 'Maximum 10 panels per comparison table. Remove one first.' : '비교표는 최대 10개까지입니다. 하나를 먼저 제거해주세요.'); return; }
    sel.push(model);
    window.pcLogChange(model, _en ? 'Comparison table' : '비교표', '-', _en ? 'Added' : '추가');
    const addModal = document.getElementById('pc-add-modal'); if (addModal) addModal.style.display = 'none';
    window.renderPanelCompareTab();
};

window.panelCompareReextract = async function(model) {
    await window.panelCompareOpenAddModal();
    window._pcPendingReextractModel = model;
    const paste = document.getElementById('pc-add-paste');
    if (paste) paste.focus();
    if (window.showToast) {
        window.showToast(window._currentLang === 'en' ? `Paste the latest spec text for "${model}" and extract.` : `"${model}"의 최신 스펙 텍스트를 붙여넣고 추출하세요.`, 'info');
    }
};

// 💡 [2026-08-25 신규] "저장한 스펙/모델명을 수정할 수 없다"는 지적에 대한 대응 — 다시 붙여넣어 AI로
//    재추출하지 않아도, 라이브러리에 있는 현재 값을 그대로 불러와 각 항목을 직접 고칠 수 있게 한다.
//    모델명도 이 폼에서 바꿀 수 있고, 저장 시 이름이 바뀌었으면 예전 이름의 라이브러리 항목은 정리한다.
window.panelCompareOpenEditModal = async function(model) {
    const _en = window._currentLang === 'en';
    // 💡 [버그 수정] 캐시(_panelCompareLibCache)는 마지막 탭 렌더링 시점 스냅샷이라, 그 사이 다른 곳에서
    //    라이브러리가 바뀌었으면 낡은 값을 편집 폼에 채우게 된다 — 수정할 때는 항상 최신을 다시 받는다.
    const lib = await window.loadPanelLibrary();
    window._panelCompareLibCache = lib;
    const entry = window.findPanelInLibrary(lib, model);
    if (!entry) { alert(_en ? 'This panel was not found in the library.' : '라이브러리에서 이 패널을 찾을 수 없습니다.'); return; }
    await window.panelCompareOpenAddModal();
    window._pcPendingReextractModel = entry.model; // 모델명 입력칸 미리 채움(기존과 동일한 메커니즘 재사용)
    window._pcEditingOriginalModel = entry.model;   // 저장할 때 "이름이 바뀐 수정"인지 판단하는 기준값
    window._pcRenderPreviewForm(entry.specs || {});
    if (window.showToast) window.showToast(_en ? `Loaded the current spec for "${entry.model}" — edit and save.` : `"${entry.model}"의 현재 스펙을 불러왔습니다 — 수정 후 저장하세요.`, 'info');
};

// ─── "➕ 패널 추가" 모달: 라이브러리 검색 + 새 패널 AI 추출 ───
window.panelCompareOpenAddModal = async function() {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('pc-add-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pc-add-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="pc-add-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
            <div id="pc-add-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="pc-add-title">🖥️ ${_en ? 'Add Panel' : '패널 추가'}</span>
                <button onclick="document.getElementById('pc-add-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div style="padding:12px 16px; border-bottom:1px solid #eee; flex-shrink:0;">
                <input id="pc-add-search" type="text" placeholder="${_en ? 'Search library by model name...' : '라이브러리에서 모델명 검색...'}" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #ced4da; border-radius:6px; font-size:13px;" oninput="window._pcRenderLibList(this.value)">
                <div id="pc-add-lib-list" style="margin-top:8px; max-height:160px; overflow-y:auto;"></div>
            </div>
            <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; min-height:0;">
                <div id="pc-add-extract-label" style="font-size:12px; font-weight:bold; color:#555; margin-bottom:6px;">${_en ? 'Or extract a new panel with AI' : '또는 새 패널을 AI로 추출'}</div>
                <input type="file" id="pc-add-file" accept=".pdf,.txt,.html,.htm" style="display:none;" onchange="window._pcHandleFileUpload(this)">
                <div id="pc-add-dropzone"
                     style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-shrink:0; padding:8px 10px; border:1.5px dashed #2c5f8a; border-radius:6px; background:#f8f9fa; cursor:pointer; transition:0.15s;"
                     onclick="document.getElementById('pc-add-file').click()"
                     ondragover="event.preventDefault(); this.style.background='#e9eef3';"
                     ondragleave="this.style.background='#f8f9fa';"
                     ondrop="event.preventDefault(); event.stopPropagation(); this.style.background='#f8f9fa'; window._pcHandleFileDrop(event.dataTransfer.files);">
                    <button type="button" id="pc-add-file-btn" onclick="event.stopPropagation(); document.getElementById('pc-add-file').click()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex-shrink:0; padding:6px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📄 ${_en ? 'Attach PDF/TXT/HTML' : 'PDF/TXT/HTML 첨부'}</button>
                    <span id="pc-add-file-name" style="font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_en ? 'or drag & drop a file here' : '또는 파일을 여기로 드래그하세요'}</span>
                </div>
                <div style="font-size:10.5px; color:#999; margin-bottom:6px;">
                    <span onclick="window.open('https://www.panelook.com/', '_blank', 'noopener')" class="inbox-help-ico" style="cursor:pointer; margin-left:0; font-size:10.5px; font-weight:bold; color:#2c5f8a; text-decoration:underline; text-underline-offset:2px;">
                        💡 ${_en ? 'Extract panel SPEC from panelook.com' : 'panelook.com 에서 패널 SPEC 추출'}
                        <span class="inbox-help-tip" style="top:16px;">
                            ${_en
                                ? '① Go to the panelook.com page below (#1) — the model shown may not be the latest — click the <b>"+"</b> button next to the searched panel name to add it (it may already be checked), then click the <b>"compare"</b> button in the "Panel Compare" box at the top right of the page.<br>&nbsp;&nbsp;→ A "slide to verify you\'re human" check may appear — only a human can pass it, so this step cannot be automated.<br>&nbsp;&nbsp;→ After it passes you land on the spec comparison page. Press <b>Ctrl+S</b> there and save it as <mark style="background:#ffe066; color:#7a5210; padding:0 3px; border-radius:3px;">"Webpage, Complete"</mark>.<br>② Attach the saved <b>.html file</b> (the file itself, not its folder) below and extract — AI will process it.<br><br><a href="https://www.panelook.com/" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="color:#8ecdf7;">🔗 #1 panelook.com (open &amp; copy manually)</a>'
                                : '① 아래 #1 panelook.com 페이지로 접속해서(최신은 없을 수도 있음), 검색된 패널명 앞의 <b>"+"</b> 버튼을 눌러 추가한 뒤(이미 눌려져 있을 수도 있음), 페이지 오른쪽 상단 "Panel Compare" 상자의 <b>"compare"</b> 버튼을 클릭하세요.<br>&nbsp;&nbsp;→ "사람인지 확인" 슬라이드 캡차가 뜰 수 있는데, 사람만 통과할 수 있어 자동화할 수 없습니다.<br>&nbsp;&nbsp;→ 통과하면 스펙 비교 페이지로 이동합니다. 그 페이지에서 <b>Ctrl+S</b>를 눌러 <mark style="background:#ffe066; color:#7a5210; padding:0 3px; border-radius:3px;">"웹페이지,전부 HTML"</mark>으로 저장하세요.<br>② 아래에 저장한 <b>.html 파일</b>(폴더 제외)을 첨부하여 추출하면, AI가 처리합니다.<br><br><a href="https://www.panelook.com/" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="color:#8ecdf7;">🔗 #1 panelook.com에서 직접 확인·복사</a>'}
                        </span>
                    </span>
                </div>
                <textarea id="pc-add-paste" placeholder="${_en ? 'Paste the panel spec text copied from panelook.com or a datasheet, or attach a PDF/TXT/HTML file above...' : 'panelook.com이나 데이터시트에서 복사한 패널 스펙 텍스트를 붙여넣거나, 위에서 PDF/TXT/HTML 파일을 첨부하세요...'}" style="width:100%; box-sizing:border-box; min-height:90px; border:1px solid #ced4da; border-radius:6px; padding:8px; font-size:12px; resize:vertical;"></textarea>
                <button id="pc-add-extract-btn" onclick="window._pcRunExtract()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="margin-top:8px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; flex-shrink:0; transition:background .15s, border-color .15s;">🤖 ${_en ? 'Extract with AI' : 'AI로 추출'}</button>
                <div id="pc-add-preview" style="margin-top:10px;"></div>
            </div>
            <div id="pc-add-footer" style="display:none; padding:12px 16px; border-top:1px solid #eee; flex-shrink:0;">
                <button id="pc-save-btn" onclick="window._pcSaveNewPanel()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="width:100%; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? 'Save' : '저장'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('pc-add-box', 'pc-add-drag');
        window._bindClickToFront('pc-add-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    window.bringModalToFront('pc-add-modal');
    document.getElementById('pc-add-search').value = '';
    document.getElementById('pc-add-paste').value = '';
    document.getElementById('pc-add-preview').innerHTML = '';
    const pcFooterEl = document.getElementById('pc-add-footer'); if (pcFooterEl) pcFooterEl.style.display = 'none';
    const fileNameEl = document.getElementById('pc-add-file-name'); if (fileNameEl) fileNameEl.textContent = _en ? 'or drag & drop a file here' : '또는 파일을 여기로 드래그하세요';
    const fileInputEl = document.getElementById('pc-add-file'); if (fileInputEl) fileInputEl.value = '';
    // 💡 [버그 방지] 이 모달을 여는 기본값은 "새로 추가"다 — panelCompareOpenEditModal()은 이 함수를
    //    먼저 부른 "다음"에 아래 두 플래그를 다시 세팅하므로, 여기서 매번 초기화해도 편집 흐름은 안 깨진다.
    //    초기화 안 하면, 편집을 한 번 연 뒤 취소하고 "새 패널 추가"를 열었을 때도 예전 편집 상태가 남아
    //    엉뚱한 이름의 라이브러리 항목을 지워버리는 사고로 이어질 수 있었다.
    window._pcEditingOriginalModel = null;
    const lib = await window.loadPanelLibrary();
    window._panelCompareLibCache = lib;
    window._pcRenderLibList('');
};

// 💡 [2026-08-27] 모델명뿐 아니라 제조사(Panel Brand)·인치(Diagonal Size)로도 검색되게 확장 —
//    검색어를 공백으로 나눠 각 단어를 모델명/브랜드/인치 어디서든 찾으면 되는 AND 매칭이라,
//    "BOE 15.6"처럼 여러 조건을 같이 입력해도(단어 순서·필드 구분 없이) 전부 만족하는 패널만 남는다.
window._pcLibSearchHaystack = function(p) {
    const specs = p.specs || {};
    return [p.model, p.brand, specs['Panel Brand'], specs['Diagonal Size'], specs['Panel Type']]
        .filter(Boolean).join(' ').toLowerCase();
};
window._pcRenderLibList = function(filterText) {
    const list = document.getElementById('pc-add-lib-list');
    if (!list) return;
    const _en = window._currentLang === 'en';
    const lib = window._panelCompareLibCache || { panels: [] };
    const terms = (filterText || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = (lib.panels || []).filter(function(p) {
        if (!terms.length) return true;
        const hay = window._pcLibSearchHaystack(p);
        return terms.every(function(t) { return hay.indexOf(t) !== -1; });
    }).slice(0, 30);
    if (!filtered.length) {
        list.innerHTML = `<div style="padding:8px; color:#999; font-size:12px;">${_en ? 'No matches in the library.' : '라이브러리에 일치하는 패널이 없습니다.'}</div>`;
        return;
    }
    // 💡 [버그 수정] 이 목록은 event.stopPropagation()이 걸린 모달 박스(pc-add-box) 안에 있어서,
    //    document 전역 클릭 위임(data-pc-lib-add)이 여기까지 절대 도달하지 못한다(전파가 그 박스에서
    //    끊김). 그래서 이 안의 버튼만은 위임 대신 직접 onclick으로 호출한다.
    list.innerHTML = filtered.map(function(p) {
        const size = (p.specs && p.specs['Diagonal Size'] && p.specs['Diagonal Size'] !== '-') ? p.specs['Diagonal Size'] : '';
        const meta = [p.brand, size].filter(Boolean).join(' · ');
        return `<div onclick="window.panelCompareAddFromLibrary(${escapeHtml(JSON.stringify(p.model))})" style="padding:6px 8px; border-bottom:1px solid #f0f0f0; cursor:pointer; font-size:12.5px; display:flex; justify-content:space-between;"
            onmouseover="this.style.background='#f4f8fc'" onmouseout="this.style.background='transparent'">
            <span><b>${escapeHtml(p.model)}</b> <span style="color:#888;">${escapeHtml(meta)}</span></span>
            <span style="color:#2c5f8a;">${_en ? '+ Add' : '+ 추가'}</span>
        </div>`;
    }).join('');
};

// 💡 [2026-08-25 신규] 패널 데이터시트는 대부분 PDF라 텍스트 붙여넣기만으론 불편하다는 요청 —
//    클라이언트 사이드 pdf.js(전역 pdfjsLib, 서버 없이 브라우저에서 텍스트만 뽑아냄)로 PDF/TXT
//    파일을 첨부하면 본문을 자동으로 붙여넣기 칸에 채워준다. 이후 흐름(AI로 추출)은 그대로 재사용.
// 💡 [2026-08-28 버그 수정] "Suitable Load"처럼 한 항목의 값이 PDF 원본에서 여러 줄로 나뉘어 있으면
//    (예: "8strings x 2bars" / "4strings x 4bars" 두 줄) AI 추출이 빈칸("-")으로 남기는 문제 — 원인은
//    이 함수가 페이지의 모든 텍스트 조각(items)을 줄바꿈 정보 없이 스페이스 하나로만 다 이어붙이고
//    있었던 것. 그러면 "2. Suitable Load 8strings x 2bars 4strings x 4bars 3. Electrical..."처럼
//    줄 구분이 통째로 사라진 한 덩어리 문장이 되어, AI가 어디까지가 이 항목의 값인지 판단할 근거
//    자체를 잃는다(값이 한 줄뿐인 항목은 우연히 살아남아 "1개는 되고 2개는 안 되는" 것처럼 보였음).
//    pdf.js의 각 텍스트 조각은 transform[5]에 y좌표를 담고 있으므로, 같은 줄(y좌표가 거의 동일)이면
//    스페이스로, 줄이 바뀌면(y좌표가 달라지면) 개행으로 이어붙여 원본의 줄 구조를 최대한 복원한다.
window._pcExtractPdfText = async function(file) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let lastY = null;
        content.items.forEach(function(it) {
            const y = (it.transform && typeof it.transform[5] === 'number') ? it.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 1) {
                text += '\n';
            } else if (text && !/[\n ]$/.test(text)) {
                text += ' ';
            }
            text += it.str;
            if (y !== null) lastY = y;
        });
        text += '\n';
    }
    return text;
};

// 💡 [2026-08-25 실측 확인] panelook.com 비교 페이지는 라벨(#left_attr_table의 <li>)과 값
//    (#right_attr_table의 <dl>, 값은 그 안의 .vartd)이 완전히 분리된 두 DOM 서브트리다 — 그냥
//    textContent만 뽑으면 "라벨 129개가 통째로 먼저, 그다음 값 129개가 통째로" 나와버려서 순서가
//    아예 다르다(실제 저장된 HTML로 확인함). 다행히 두 목록의 "행 순서(li/dl 등장 순서)"는 정확히
//    1:1로 대응하므로, 인덱스로 짝지어 "라벨 : 값" 형태로 재구성하면 완벽하게 복원된다(129/129 확인).
//    이 구조가 아니면(다른 사이트 등) null을 반환해 호출부가 일반 텍스트 추출로 폴백하게 한다.
window._pcExtractPanelookHtml = function(doc) {
    const leftItems = doc.querySelectorAll('#left_attr_table > li');
    const rightRows = doc.querySelectorAll('#right_attr_table > dl');
    if (!leftItems.length || !rightRows.length) return null;
    const n = Math.min(leftItems.length, rightRows.length);
    const lines = [];
    for (let i = 0; i < n; i++) {
        const li = leftItems[i];
        const dl = rightRows[i];
        const sectionEl = li.querySelector('.class_name');
        if (sectionEl) { lines.push(sectionEl.textContent.replace(/\s+/g, ' ').trim()); continue; }
        const labelEl = li.querySelector('.bar');
        if (!labelEl) continue; // 맨 위 빈 헤더 스페이서 행 등
        const label = labelEl.textContent.replace(/\s+/g, ' ').trim();
        // 여러 패널을 비교 중이면 panel_dd_0, panel_dd_1... 안에 각각 .vartd가 있음 — 전부 이어붙임
        const values = Array.from(dl.querySelectorAll('.vartd'))
            .map(function(v) { return v.textContent.replace(/\s+/g, ' ').trim(); })
            .filter(Boolean);
        lines.push(label + ' ' + (values.length ? values.join(' | ') : '-'));
    }
    return lines.join('\n');
};

// 💡 [2026-08-25 신규] "다른 이름으로 저장 → 웹페이지 HTML" 파일에서 텍스트만 뽑아낸다. panelook.com
//    특유의 구조(위 함수)가 감지되면 그걸로 정확히 재구성하고, 아니면 DOMParser로 script/style/svg만
//    걷어낸 뒤 순수 텍스트만 추출하는 일반적인 방식으로 폴백한다.
window._pcExtractHtmlText = function(htmlString) {
    try {
        const doc = new DOMParser().parseFromString(htmlString, 'text/html');
        const panelookLines = window._pcExtractPanelookHtml(doc);
        if (panelookLines) return panelookLines;

        doc.querySelectorAll('script, style, noscript, svg').forEach(function(el) { el.remove(); });
        return (doc.body ? doc.body.textContent : doc.documentElement.textContent) || '';
    } catch (e) {
        console.warn('HTML 텍스트 추출 실패:', e.message);
        return '';
    }
};

// 💡 [2026-08-25 신규] 버튼 클릭(input[type=file])과 드래그앤드롭 둘 다 같은 처리 로직을 타도록,
//    "File 객체 하나를 받아 읽어서 붙여넣기 칸을 채우는" 부분을 공통 함수로 분리했다.
window._pcProcessFile = async function(file) {
    const _en = window._currentLang === 'en';
    const paste = document.getElementById('pc-add-paste');
    const fileNameEl = document.getElementById('pc-add-file-name');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (fileNameEl) fileNameEl.textContent = '📄 ' + file.name;
    try {
        let text = '';
        if (ext === 'pdf') {
            if (!window.pdfjsLib) {
                alert(_en ? '⚠️ The PDF reader library failed to load (check your network) — paste the text manually instead.' : '⚠️ PDF 읽기 라이브러리를 불러오지 못했습니다(네트워크 확인) — 대신 텍스트를 직접 붙여넣어주세요.');
                return;
            }
            if (paste) paste.value = _en ? 'Reading PDF…' : 'PDF 읽는 중...';
            text = await window._pcExtractPdfText(file);
        } else if (ext === 'html' || ext === 'htm') {
            // 💡 [2026-08-25 신규] panelook.com 비교표 페이지는 라벨 열이 CSS sticky라서, 브라우저로
            //    "인쇄→PDF"하면 페이지가 나뉠 때마다 라벨 열이 처음부터 다시 그려져 값과 순서가 완전히
            //    어긋나는 걸 실제 파일로 확인함(라벨 12개 정도만 반복되고 나머지 값은 짝 없이 흩어짐).
            //    반면 "다른 이름으로 저장→웹페이지 HTML"은 화면에 그려진 CSS 배치가 아니라 원본 문서(DOM)
            //    순서 그대로 저장되므로, sticky 여부와 무관하게 라벨 바로 다음에 그 값이 나오는 원래
            //    순서가 보존된다. DOMParser로 파싱해 script/style만 제거하고 텍스트만 뽑아낸다.
            const htmlStr = await file.text();
            text = window._pcExtractHtmlText(htmlStr);
        } else {
            text = await file.text();
        }
        // 💡 PDF는 페이지마다 반복되는 머리말/꼬리말이 그대로 다 붙어나와 글자수만 불필요하게 늘리는
        //    경우가 흔해서, AI에게 보내기 전 글자수 예산을 아끼도록 미리 한 번 정리해둔다.
        const cleaned = window._pcCleanExtractedText(text);
        if (paste) paste.value = cleaned;
        const savedChars = text.length - cleaned.length;
        if (window.showToast) {
            window.showToast((_en ? '📄 Loaded text from "' : '📄 "') + file.name + (_en ? '"' : '"에서 텍스트를 불러왔습니다')
                + (savedChars > 200 ? (_en ? ` (removed ${savedChars.toLocaleString()} repeated chars)` : ` (반복 ${savedChars.toLocaleString()}자 정리됨)`) : ''), 'info');
        }
    } catch (e) {
        if (paste) paste.value = '';
        alert((_en ? 'Failed to read the file: ' : '파일을 읽지 못했습니다: ') + e.message);
    }
};

window._pcHandleFileUpload = async function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
        await window._pcProcessFile(file);
    } finally {
        input.value = ''; // 같은 파일을 다시 선택해도 change 이벤트가 재발생하도록
    }
};

// 💡 pc-add-dropzone에 파일을 끌어다 놓았을 때 — 확장자를 먼저 확인해 지원하지 않는 파일이면
//    조용히 무시하지 않고 바로 알려준다(버튼/클릭 경로는 accept 속성이 브라우저에서 걸러주지만,
//    드래그앤드롭은 그 필터를 타지 않으므로 여기서 직접 검사해야 함).
window._pcHandleFileDrop = async function(fileList) {
    const _en = window._currentLang === 'en';
    const file = fileList && fileList[0];
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'txt', 'html', 'htm'].indexOf(ext) === -1) {
        alert(_en ? '⚠️ Only PDF/TXT/HTML files are supported.' : '⚠️ PDF/TXT/HTML 파일만 지원합니다.');
        return;
    }
    await window._pcProcessFile(file);
};

window._pcRunExtract = async function() {
    const _en = window._currentLang === 'en';
    const raw = (document.getElementById('pc-add-paste') || {}).value || '';
    if (!raw.trim()) { alert(_en ? 'Please paste the panel spec text first.' : '먼저 패널 스펙 텍스트를 붙여넣어 주세요.'); return; }
    // 💡 이 길이를 넘으면 프롬프트에서 뒷부분이 잘려나가 그 뒤에 나오는 스펙은 분석되지 않는다 —
    //    조용히 자르는 대신 미리 알려주고, 계속할지 사람이 고르게 한다(취소하면 직접 텍스트를 다듬을 수 있음).
    if (raw.length > window._PANEL_EXTRACT_TEXT_LIMIT) {
        const proceed = confirm(_en
            ? `The pasted text is ${raw.length.toLocaleString()} characters, but only the first ${window._PANEL_EXTRACT_TEXT_LIMIT.toLocaleString()} will be analyzed (AI input limit) — specs beyond that point may be missed.\n\nContinue anyway? (Cancel to trim the text yourself first, e.g. remove cover pages or repeated boilerplate.)`
            : `붙여넣은 텍스트가 ${raw.length.toLocaleString()}자인데, AI 분석에는 앞부분 ${window._PANEL_EXTRACT_TEXT_LIMIT.toLocaleString()}자까지만 사용됩니다 — 그 뒤에 있는 스펙은 누락될 수 있습니다.\n\n그래도 진행할까요? (취소하고 표지/반복되는 문구 등을 직접 지워서 줄여보세요.)`);
        if (!proceed) return;
    }
    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) { alert(_en ? '⚠️ No AI API key configured. Set one in the mail analysis screen first.' : '⚠️ AI API 키가 설정되어 있지 않습니다. 메일 분석 화면에서 먼저 키를 등록해주세요.'); return; }
    const btn = document.getElementById('pc-add-extract-btn');
    if (btn) { btn.disabled = true; btn.textContent = '🤖 ' + (_en ? 'Extracting…' : '추출 중...'); }
    try {
        const prompt = window._panelBuildExtractPrompt(raw);
        const result = await window.callAiBackend(apiKey, prompt);
        if (!result.ok) { alert((_en ? 'AI call failed: ' : 'AI 호출 실패: ') + (result.error && result.error.message || (_en ? 'Unknown error' : '알 수 없는 오류'))); return; }
        const text = result.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = window._panelParseAiJson(text);
        if (!parsed) alert(_en ? 'Could not parse the AI response. Please try again, or fill in the form manually below.' : 'AI 응답을 해석하지 못했습니다. 다시 시도하거나 아래 폼에 직접 입력해주세요.');
        window._pcRenderPreviewForm(parsed || {});
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🤖 ' + (_en ? 'Extract with AI' : 'AI로 추출'); }
    }
};

window._pcRenderPreviewForm = function(specs) {
    const _en = window._currentLang === 'en';
    const preview = document.getElementById('pc-add-preview');
    if (!preview) return;
    const presetModel = window._pcPendingReextractModel || ((specs['Model Name'] && specs['Model Name'] !== '-') ? specs['Model Name'] : '');
    window._pcPendingReextractModel = null;
    let html = '';
    html += `<div style="margin-bottom:10px;"><label style="font-size:11px; font-weight:bold; color:#555;">${_en ? 'Model name *' : '모델명 *'}</label>
        <input id="pc-form-model" type="text" value="${escapeHtml(presetModel)}" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1.5px solid #2c5f8a; border-radius:5px; font-size:13px; margin-top:2px;" placeholder="${_en ? 'e.g. DV430FHM-NN1' : '예: DV430FHM-NN1'}"></div>`;
    window.PANEL_SPEC_SCHEMA.forEach(function(sec, si) {
        html += `<details ${si === 0 ? 'open' : ''} style="margin-bottom:6px;"><summary style="cursor:pointer; font-weight:bold; font-size:12px; color:#2c5f8a; padding:4px 0;">[${escapeHtml(sec.section)}]</summary>`;
        sec.fields.forEach(function(f) {
            const label = f[0];
            const val = specs[label] != null ? specs[label] : '-';
            html += `<div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
                <label style="flex:0 0 170px; font-size:10.5px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(label)}">${escapeHtml(label)}</label>
                <input data-pc-field="${escapeHtml(label)}" type="text" value="${escapeHtml(String(val))}" style="flex:1; padding:4px 6px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px; min-width:0;">
            </div>`;
        });
        html += '</details>';
    });
    preview.innerHTML = html;
    // 💡 [2026-08-27] 저장 버튼은 폼 맨 아래(스크롤 영역 안)에 있으면 항목이 많을 때 스크롤해야 보였다 —
    //    "저장 버튼이 사라진 것 같다"는 문의가 있어, 모달 하단 고정 푸터(pc-add-footer)로 옮겼다.
    const footer = document.getElementById('pc-add-footer');
    if (footer) footer.style.display = 'block';
};

window._pcSaveNewPanel = async function() {
    const _en = window._currentLang === 'en';
    const modelInput = document.getElementById('pc-form-model');
    const model = (modelInput ? modelInput.value : '').trim();
    if (!model) { alert(_en ? 'Please enter the model name.' : '모델명을 입력해주세요.'); if (modelInput) modelInput.focus(); return; }
    const specs = {};
    document.querySelectorAll('#pc-add-preview [data-pc-field]').forEach(function(inp) { specs[inp.dataset.pcField] = inp.value; });
    const brand = (specs['Panel Brand'] && specs['Panel Brand'] !== '-') ? specs['Panel Brand'] : '';
    const entry = {
        model: model, brand: brand,
        sourceUrl: 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(model),
        specs: specs
    };
    // 💡 [2026-08-25 신규] "✏️ 수정" 경로로 들어와서 모델명 자체를 바꾼 경우 — 새 이름으로 저장하는 것과
    //    별개로, 예전 이름의 라이브러리 항목이 유령으로 남지 않도록 지우고, 이 프로젝트의 selectedModels/
    //    lastAutoSeed도 옛 이름 → 새 이름으로 교체한다(그냥 "추가"로 취급해 중복 슬롯이 생기지 않도록).
    const originalModel = window._pcEditingOriginalModel;
    window._pcEditingOriginalModel = null; // 1회성 소비 — 다음 저장부터는 다시 "신규 추가"로 동작
    const isRename = !!(originalModel && originalModel !== model);

    const ok = await window.upsertPanelLibraryEntry(entry);
    if (!ok) return;
    if (isRename) await window._panelLibRemoveEntry(originalModel);

    window.tabData = window.tabData || {};
    window.tabData.panelCompare = window.tabData.panelCompare || { selectedModels: [], lastAutoSeed: null };
    const sel = window.tabData.panelCompare.selectedModels;
    if (isRename) {
        const idx = sel.indexOf(originalModel);
        if (idx !== -1) sel[idx] = model; else if (sel.indexOf(model) === -1 && sel.length < 10) sel.push(model);
        window.pcLogChange(originalModel, _en ? 'Model name' : '모델명', originalModel, model);
        if (window.tabData.panelCompare.lastAutoSeed === originalModel) window.tabData.panelCompare.lastAutoSeed = model;
    } else if (sel.indexOf(model) === -1) {
        if (sel.length >= 10) {
            alert(_en ? 'This project already has 10 panels in the comparison table (maximum). It was saved to the library, but not added here — remove one first.' : '이미 이 프로젝트의 비교표에 패널 10개(최대)가 있습니다. 라이브러리엔 저장됐지만 여기엔 추가되지 않았습니다 — 하나를 먼저 제거해주세요.');
        } else {
            sel.push(model);
            window.pcLogChange(model, _en ? 'Comparison table' : '비교표', '-', _en ? 'Added' : '추가');
        }
    }
    const modal = document.getElementById('pc-add-modal'); if (modal) modal.style.display = 'none';
    window.renderPanelCompareTab();
    if (window.showToast) window.showToast((_en ? '✅ Saved: ' : '✅ 저장 완료: ') + model, 'info');
};

// ─── Summary 주요자재 PANEL 행 🔎 버튼 → 패널 스펙 미리보기 모달 ───
// 💡 [2026-09-01 신규] codeHint(주요자재 표의 ktk pn, 보통 6자리 관리코드) — 검색에만 쓰고 비교표
//    등록/재추출 등 "식별자"로는 절대 안 씀(식별자는 항상 entry.model 또는 사용자가 적은 description
//    그대로 — ktk pn이 섞여 들어가면 이미 비교표에 있는 같은 패널을 "없음"으로 오판하거나, 비교표에
//    코드가 섞인 이름으로 등록되는 부작용이 생기므로 분리함).
window.showPanelSpecModal = async function(model, codeHint) {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('pc-spec-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pc-spec-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="pc-spec-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:300px;">
            <div id="pc-spec-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="pc-spec-title">🖥️ ${_en ? 'Panel Spec' : '패널 스펙'}</span>
                <button onclick="document.getElementById('pc-spec-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div id="pc-spec-body" style="padding:12px 16px; flex:1; overflow-y:auto; font-size:12px;"></div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('pc-spec-box', 'pc-spec-drag');
        window._bindClickToFront('pc-spec-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    window.bringModalToFront('pc-spec-modal');
    const bodyEl = document.getElementById('pc-spec-body');
    bodyEl.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">${_en ? 'Loading…' : '불러오는 중...'}</div>`;
    const lib = await window.loadPanelLibrary();
    // 💡 ktk pn(codeHint)이 있으면 "코드_이름"으로 합쳐서 검색 — findPanelInLibrary가 이미
    //    _epFlexibleFind로 코드/이름을 분리 대조하므로 이 조합만으로 ktk pn도 검색 근거가 된다.
    const searchQuery = codeHint ? (codeHint + (model ? '_' + model : '')) : model;
    const entry = window.findPanelInLibrary(lib, searchQuery);
    // 💡 식별자(제목 표시/비교표 등록·재추출/URL)는 검색 성공 시 라이브러리의 정확한 모델명(entry.model)을,
    //    실패 시 사용자가 적은 description(비어있으면 ktk pn)을 그대로 사용 — 검색용 codeHint 조합 문자열이
    //    비교표 등 다른 곳으로 새어나가지 않게 분리함.
    const model_display = entry ? entry.model : (model || codeHint || '');
    const url = 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(model_display);
    if (!entry) {
        // 💡 [2026-08-25] 두 요소를 헷갈려서(링크=panelook.com 이동, 버튼=로컬 붙여넣기/AI추출) "추출하기를
        //    눌렀는데 홈페이지에서 멈춘다"는 문의가 있었음 — panelook.com은 자동화 접근을 막는 슬라이더
        //    캡차가 있어서(사람이 직접 풀어야 함), 저 링크는 "사람이 직접 확인·복사하러 가는 창구"일 뿐이고
        //    실제 추출은 아래 버튼(붙여넣기 → AI)에서만 일어난다는 걸 문구로 명확히 구분해뒀다.
        bodyEl.innerHTML = `
            <div style="font-size:13px; font-weight:bold; margin-bottom:8px;">${escapeHtml(model_display)}</div>
            <div style="color:#888; margin-bottom:14px;">${_en ? 'No spec has been extracted for this panel yet.' : '아직 이 패널의 스펙이 추출되지 않았습니다.'}</div>
            <div style="font-size:11.5px; color:#666; line-height:1.7; background:#f8f9fa; border-radius:6px; padding:8px 10px; margin-bottom:12px;">
                ${_en
                    ? '① Go to the panelook.com page below (#1) — the model shown may not be the latest — click the <b>"+"</b> button next to the searched panel name to add it (it may already be checked), then click the <b>"compare"</b> button in the "Panel Compare" box at the top right of the page.<br>&nbsp;&nbsp;→ A "slide to verify you\'re human" check may appear — only a human can pass it, so this step cannot be automated.<br>&nbsp;&nbsp;→ After it passes you land on the spec comparison page. Press <b>Ctrl+S</b> there and save it as <mark style="background:#ffe066; color:#7a5210; padding:0 3px; border-radius:3px;">"Webpage, Complete"</mark>.<br>② Click the button below (#2), then attach the saved <b>.html file</b> (the file itself, not its folder) and extract — AI will process it.'
                    : '① 아래 #1 panelook.com 페이지로 접속해서(최신은 없을 수도 있음), 검색된 패널명 앞의 <b>"+"</b> 버튼을 눌러 추가한 뒤(이미 눌려져 있을 수도 있음), 페이지 오른쪽 상단 "Panel Compare" 상자의 <b>"compare"</b> 버튼을 클릭하세요.<br>&nbsp;&nbsp;→ "사람인지 확인" 슬라이드 캡차가 뜰 수 있는데, 사람만 통과할 수 있어 자동화할 수 없습니다.<br>&nbsp;&nbsp;→ 통과하면 스펙 비교 페이지로 이동합니다. 그 페이지에서 <b>Ctrl+S</b>를 눌러 <mark style="background:#ffe066; color:#7a5210; padding:0 3px; border-radius:3px;">"웹페이지,전부 HTML"</mark>으로 저장하세요.<br>② 아래 #2 버튼을 누른 뒤, 저장한 <b>.html 파일</b>(폴더 제외)을 첨부하여 추출하면, AI가 처리합니다.'}
            </div>
            <a href="${url}" target="_blank" rel="noopener" style="display:inline-block; margin-bottom:10px; color:#2c5f8a;">🔗 #1 panelook.com${_en ? ' (open & copy manually)' : '에서 직접 확인·복사'}</a><br>
            <button onclick="document.getElementById('pc-spec-modal').style.display='none'; window.panelCompareReextract(${escapeHtml(JSON.stringify(model_display))});" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:8px 14px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">🤖 #2 ${_en ? 'Attach the HTML file & extract with AI' : 'HTML 파일 첨부 후 AI로 추출'}</button>
        `;
        return;
    }
    const inCompare = !!(window.tabData && window.tabData.panelCompare && window.tabData.panelCompare.selectedModels && window.tabData.panelCompare.selectedModels.indexOf(model_display) !== -1);
    let html = `<div style="font-size:13px; font-weight:bold; margin-bottom:2px;">${escapeHtml(entry.model)}</div>
        <div style="color:#888; margin-bottom:8px;">${escapeHtml(entry.brand || '')}</div>
        <a href="${escapeHtml(entry.sourceUrl || url)}" target="_blank" rel="noopener" style="color:#2c5f8a;">🔗 panelook.com ${_en ? 'search' : '검색'}</a>
        <div style="margin:10px 0;">
            ${inCompare
                ? `<span style="color:#2f9e44; font-weight:bold;">✓ ${_en ? 'Already in this project\'s comparison table' : '이 프로젝트 비교표에 있음'}</span>`
                : `<button onclick="window.panelCompareAddFromLibrary(${escapeHtml(JSON.stringify(model_display))}); document.getElementById('pc-spec-modal').style.display='none';" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">➕ ${_en ? 'Add to comparison table' : '비교표에 추가'}</button>`}
        </div>
        <div style="font-size:10px; color:#aaa; margin-bottom:8px;">${_en ? 'Updated' : '갱신'}: ${escapeHtml(entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '-')}</div>`;
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) {
        let secHtml = '';
        sec.fields.forEach(function(f) {
            const label = f[0];
            const v = (entry.specs && entry.specs[label] != null && entry.specs[label] !== '') ? entry.specs[label] : '-';
            if (v === '-') return; // 미리보기는 값이 있는 항목만 (한눈에 보기 편하게)
            secHtml += `<div style="display:flex; gap:6px; padding:2px 0;"><span style="flex:0 0 140px; color:#777;">${escapeHtml(label)}</span><span style="flex:1;">${escapeHtml(String(v))}</span></div>`;
        });
        if (secHtml) html += `<div style="font-weight:bold; color:#7a5210; margin-top:8px; padding:3px 0; border-top:1px solid #eee;">[${escapeHtml(sec.section)}]</div>` + secHtml;
    });
    bodyEl.innerHTML = html;
};

// 💡 비교표 헤더의 제거·재추출 버튼 — 표가 innerHTML로 통째로 다시 그려지므로 개별 리스너 대신
//    전역 위임 클릭으로 한 번만 바인딩. (⚠️ 모달 안쪽 버튼은 모달 박스의 event.stopPropagation()에
//    막혀 여기까지 전파되지 않으므로, 라이브러리 목록/스펙 모달의 버튼들은 인라인 onclick으로 직접 호출함)
document.addEventListener('click', function(e) {
    const rm = e.target.closest('[data-pc-remove]');
    if (rm) { window.panelCompareRemove(rm.dataset.pcRemove); return; }
    const re = e.target.closest('[data-pc-reextract]');
    if (re) { window.panelCompareReextract(re.dataset.pcReextract); return; }
    const ed = e.target.closest('[data-pc-edit]');
    if (ed) { window.panelCompareOpenEditModal(ed.dataset.pcEdit); return; }
});

// ─── 엑셀로 내보내기 (기존 exportToExcel과 동일하게 xlsx-js-style 재사용 — 섹션 헤더 파란 배경 + 모델명 하이퍼링크) ───
window.exportPanelCompareToExcel = async function() {
    const _en = window._currentLang === 'en';
    const pc = (window.tabData && window.tabData.panelCompare) || { selectedModels: [] };
    const models = (pc.selectedModels || []).slice(0, 10);
    if (!models.length) { alert(_en ? 'No panels in the comparison table yet.' : '비교표에 패널이 없습니다.'); return; }
    const lib = await window.loadPanelLibrary();
    const entries = models.map(function(m) { return window.findPanelInLibrary(lib, m); });
    const notes = pc.notes || {}; // 💡 화면의 Note 열(자유 메모)도 함께 내보냄

    const aoa = [];
    aoa.push(['Comparison table'].concat(models).concat(['Note']));
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) {
        aoa.push(['[' + sec.section + ']'].concat(models.map(function() { return ''; })).concat(['']));
        sec.fields.forEach(function(f) {
            const label = f[0];
            const row = [label];
            entries.forEach(function(entry) {
                const v = (entry && entry.specs && entry.specs[label] != null && entry.specs[label] !== '') ? entry.specs[label] : '-';
                row.push(String(v));
            });
            row.push(notes[label] || '');
            aoa.push(row);
        });
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 26 }].concat(models.map(function() { return { wch: 22 }; })).concat([{ wch: 24 }]);

    const sectionRowIdx = [];
    let rPtr = 1;
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) { sectionRowIdx.push(rPtr); rPtr += 1 + sec.fields.length; });

    const range = XLSX.utils.decode_range(ws['!ref']);
    const thinBorder = { style: 'thin', color: { rgb: 'DDDDDD' } };
    for (let ri = 0; ri <= range.e.r; ri++) {
        const isHeader = ri === 0;
        const isSection = sectionRowIdx.indexOf(ri) !== -1;
        for (let ci = 0; ci <= range.e.c; ci++) {
            const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
            if (!cell) continue;
            // 💡 헤더 행("Comparison table"+모델명)은 회색, 구분(섹션) 행만 흐린 살구색 — 화면 표시와 통일
            cell.s = {
                font: { name: '맑은 고딕', sz: 10, bold: isHeader || isSection, color: { rgb: isSection ? '7A5210' : (isHeader ? '333333' : '1F2937') } },
                fill: isSection ? { patternType: 'solid', fgColor: { rgb: 'FFF8E6' } } : (isHeader ? { patternType: 'solid', fgColor: { rgb: window._cpXlsxRole('headerTint') } } : undefined),
                alignment: { vertical: 'center', horizontal: ci === 0 ? 'left' : 'center', wrapText: true },
                border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
            };
            if (isHeader && ci > 0 && ci <= models.length) { // 💡 맨 끝 Note 헤더 칸은 모델이 아니므로 제외
                const model = models[ci - 1];
                cell.l = { Target: 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(model), Tooltip: 'panelook.com search' };
            }
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PANEL COMP TABLE');
    const fileName = (window.driveSaveFilenameStr || window.exportFilenameStr || 'Panel') + '_비교표.xlsx';
    XLSX.writeFile(wb, fileName);
};

// ═══════════════════════════════════════════════════════════════════
// ⚡ [2026-08-26 신규] Elec Parts — Panel Compare와 동일한 패턴의 전기부품(CONV BD/AD BD...) 스펙 비교표.
//    Panel Compare 코드를 그대로 복제하지 않고 ELEC_PART_TYPES 설정(스키마+라이브러리 파일명)으로
//    여러 부품 종류를 하나의 엔진(window.ep*, window.elecCompare*)이 돌리게 만들었다 — 나중에
//    AD BD를 추가할 때는 스키마만 채우고 ELEC_PART_TYPES.adbd.schema에 넣으면 끝난다.
//    - 라이브러리 항목 키(model)는 "Item Code_Part Name" 결합 문자열(예: 301782_KCB-02508B-60).
//    - Electrical Spec의 Min/Typ/Max는 패널의 "Brightness (Min/Typ)"처럼 한 필드에 " / "로 결합.
//    - 커넥터 핀아웃(J1/J2/J3 등)은 비교표엔 요약 행만 노출하고, 항목별 전체 핀맵은 entry.connectors에
//      구조화된 채로 저장해뒀다가 "🔌 핀맵 보기" 모달에서만 펼쳐 보여준다(완제품 SPEC 자동 생성 기능에서
//      이 데이터를 그대로 재사용할 예정).
//    - PDF/HTML → 텍스트 추출은 Panel Compare가 만들어둔 window._pcExtractPdfText / _pcExtractHtmlText /
//      _pcCleanExtractedText를 그대로 재사용한다(패널 전용 로직이 아니라 범용 텍스트 추출이라 재사용 가능).
// ═══════════════════════════════════════════════════════════════════

window.CONV_BD_SPEC_SCHEMA = [
    { section: 'Basic Information', fields: [
        ['Brand', 1], ['Item Code', 1], ['Part Name', 1], ['Revision', 1], ['Item Description', 2],
    ]},
    { section: 'Application / Load', fields: [
        ['Suitable Load', 1], ['Application', 2],
    ]},
    { section: 'Electrical Specification', fields: [
        ['Input Voltage (Min/Typ/Max)', 1], ['Input Current (Max)', 1],
        ['Output Voltage (Min/Max)', 1], ['String Output Current (Min/Typ/Max)', 1],
        ['Output Power (Max)', 1], ['ON Signal (Min/Max)', 1], ['OFF Signal (Min/Max)', 1],
        ['Dimming Signal (Min/Max)', 1], ['Operating Temperature (Min/Max)', 1],
    ]},
    { section: 'Dimension', fields: [
        ['Board Size (WxH)', 1], ['Outline Depth', 1],
    ]},
    { section: 'Interface', fields: [
        ['Input Connector (Model/Pins)', 2], ['Output Connector (Model/Pins/Qty)', 2],
        ['Output Channels', 1], ['Control Signals', 2],
    ]},
    { section: 'Other', fields: [
        ['Expected Price', 1], ['Note', 1],
    ]},
];

// 💡 [2026-08-26 신규] AD BD(스케일러 보드, 예: ADONIS-QHD) 스펙 스키마. 필드 튜플의 3·4번째 값은
//    드롭다운 선택 지원용 — ['라벨', 우선순위, 'enum', ['Enable','Disable']] 형태면 미리보기 폼에서
//    Enable/Disable/기타(자유 텍스트) 드롭다운으로 렌더링된다(그 외 필드는 CONV BD와 동일하게 자유 텍스트).
window.AD_BD_SPEC_SCHEMA = [
    { section: 'Basic Information', fields: [
        ['Brand', 1], ['Item Code', 1], ['Part Name', 1], ['Revision', 1], ['Item Description', 2],
    ]},
    { section: 'Application', fields: [
        ['Application', 2], ['Max/Native Resolution', 1],
    ]},
    { section: 'Video Processing', fields: [
        ['Scaler IC', 1],
        ['Input Signal', 1], ['Output Signal', 1],
        ['Color Depth', 2], ['OSD Support', 2],
        ['Resize Function', 1, 'enum', ['Enable', 'Disable']],
        ['Flip/Mirror Function', 1, 'enum', ['Enable', 'Disable']],
        ['OSD Rotation Function', 1, 'enum', ['Enable', 'Disable']],
    ]},
    { section: 'Electrical Specification', fields: [
        ['Input Voltage', 1], ['Input Power/Current', 2], ['DPMS Support', 2],
    ]},
    { section: 'Dimension', fields: [
        ['Board Size (WxH)', 1], ['Outline Depth', 1],
    ]},
    { section: 'Interface', fields: [
        ['Input Connector (Model/Pins)', 2], ['Output Connector (Model/Pins)', 2],
        ['Power Connector', 2], ['Control Connector', 2], ['OSD Key Count', 2],
    ]},
    { section: 'Other', fields: [
        ['Expected Price', 1], ['Note', 1],
    ]},
];

window.ELEC_PART_TYPES = {
    convbd: { label: 'CONV', icon: '🔌', domain: 'LED 드라이버/컨버터 보드', libFilename: 'ElecPartLib_CONVBD_Shared.json', schema: window.CONV_BD_SPEC_SCHEMA },
    adbd: { label: 'AD BD', icon: '🔲', domain: '스케일러(A/D) 보드', libFilename: 'ElecPartLib_ADBD_Shared.json', schema: window.AD_BD_SPEC_SCHEMA },
};

// 💡 [2026-08-26] 예전엔 라벨 문자열만 뽑았는데, enum 필드(Resize Function 등)의 허용값을 AI 프롬프트에도
//    알려주려면 필드 튜플 전체([라벨, 우선순위, type?, options?])가 필요해서 원본 튜플을 그대로 반환하게 바꿨다.
window._epFlatFields = function(type) {
    const cfg = window.ELEC_PART_TYPES[type];
    const out = [];
    ((cfg && cfg.schema) || []).forEach(function(sec) { sec.fields.forEach(function(f) { out.push(f); }); });
    return out;
};

// ─── 팀 공용 전기부품 스펙 라이브러리 (AddressBook/project_index.json·Panel Compare와 동일한 Drive 업서트 패턴) ───
window._epLibFileIds = {};
window.findElecPartLibFile = async function(type, token) {
    if (window._epLibFileIds[type]) return window._epLibFileIds[type];
    const cfg = window.ELEC_PART_TYPES[type];
    if (!cfg || !cfg.libFilename) return null;
    const folderId = await window.getOrCreateConfigFolder(token);
    const id = await window._findOrMigrateFile(token, cfg.libFilename, folderId);
    if (id) window._epLibFileIds[type] = id;
    return id;
};
window._epNamesMatch = function(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); };
// 💡 [2026-08-27 신규 — 안전장치] "PBA Name" → "Part Name" 필드명 변경 이전에 이미 라이브러리에
//    저장된 항목(옛 키로 저장됨)도 화면에서 계속 정상적으로 표시되도록, 새 키가 없으면 옛 키로 폴백한다.
//    새로 AI 추출하는 항목은 프롬프트가 이미 "Part Name"으로 답하므로 이 폴백을 안 타게 된다.
window._epPartNameOf = function(specs) {
    if (!specs) return '';
    if (specs['Part Name'] && specs['Part Name'] !== '-') return specs['Part Name'];
    if (specs['PBA Name'] && specs['PBA Name'] !== '-') return specs['PBA Name'];
    return '';
};

// 💡 [2026-08-27 신규 — 안전장치] Summary 주요자재 설명칸에 "코드_이름"(예: 301782_KCB-02508B-60),
//    "이름만"(예: MV315QHB-N41-A000), "코드만"(예: 303222) 중 무엇을 적어도 🔎가 라이브러리에서
//    찾아내도록 하는 범용 매처. 완전일치(대소문자·공백 차이 무시)를 먼저 시도하고, 실패하면 쿼리를
//    "6자리 코드" + "나머지 이름"으로 쪼개 Item Code/Part Name 필드와 각각 대조한다.
window._epNormalizeKey = function(s) {
    return String(s || '').trim().toUpperCase()
        .replace(/\s*-\s*/g, '-')   // "A - B" -> "A-B"
        .replace(/\s*_\s*/g, '_')   // "A _ B" -> "A_B"
        .replace(/\s+/g, ' ')
        .trim();
};
window._epFlexibleFind = function(items, query, getModel, getItemCode, getPartName) {
    const norm = window._epNormalizeKey;
    const q = norm(query);
    if (!q || !items || !items.length) return null;

    // 1) 완전일치 — 기존 동작 그대로(대소문자/공백 차이만 무시)
    let hit = items.find(function(it) { return norm(getModel(it)) === q; });
    if (hit) return hit;

    // 쿼리 맨 앞의 6자리 숫자(Item Code)와 나머지(이름)를 분리 시도
    const m = q.match(/^(\d{6})[_\-\s]+(.+)$/);
    const qCode = m ? m[1] : (/^\d{6}$/.test(q) ? q : null);
    const qName = m ? m[2] : (/^\d{6}$/.test(q) ? '' : q);

    // 2) 코드만 입력된 경우 — Item Code로 매칭
    if (qCode && !qName) {
        hit = items.find(function(it) { return norm(getItemCode(it)) === qCode; });
        if (hit) return hit;
    }
    // 3) 코드+이름이 모두 있는 경우 — 코드 일치 우선(이름 표기 차이는 무시)
    if (qCode && qName) {
        hit = items.find(function(it) { return norm(getItemCode(it)) === qCode; });
        if (hit) return hit;
    }
    // 4) 이름만 입력된 경우(코드 없이) — Part Name 또는 "코드_이름" 형태 모델 키의 뒷부분과 대조
    if (qName) {
        hit = items.find(function(it) { return norm(getPartName(it)) === qName; });
        if (hit) return hit;
        hit = items.find(function(it) {
            const modelNorm = norm(getModel(it));
            return modelNorm === qName || modelNorm.endsWith('_' + qName) || modelNorm.endsWith('-' + qName);
        });
        if (hit) return hit;
    }
    return null;
};
window.findElecPartInLibrary = function(lib, model) {
    const items = (lib && lib.items) || [];
    return window._epFlexibleFind(
        items, model,
        function(p) { return p.model; },
        function(p) { return p.specs && p.specs['Item Code']; },
        function(p) { return window._epPartNameOf(p.specs); }
    );
};
window.loadElecPartLibrary = async function(type) {
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return { items: [] };
        const fileId = await window.findElecPartLibFile(type, token);
        if (!fileId) return { items: [] };
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return (data && Array.isArray(data.items)) ? data : { items: [] };
    } catch (e) { console.warn('전기부품 라이브러리 로드 실패:', e.message); return { items: [] }; }
};
// 💡 [2026-08-31 신규 — 사고 방지] "파일이 있는지 찾아보고 없으면 만든다"는 흐름 사이에 잠금장치가
//    없어서, 두 사람(또는 탭 2개)이 거의 동시에 저장하면 둘 다 "없다"고 판단해 똑같은 이름의 파일을
//    2개씩 만들어버리는 사고가 실제로 있었다(ElecPartLib_ADBD_Shared.json이 2개 생성됨). AddressBook의
//    낙관적 동시성 제어(_lastKnownSavedAt)와 동일한 아이디어를, 전체 내용을 다시 받을 필요 없이
//    Drive의 modifiedTime 메타데이터만으로 가볍게 구현 — ①읽을 때 그 시점의 modifiedTime을 기억해두고,
//    ②쓰기 직전 한 번 더 확인해서 그 사이 바뀌었으면(=남이 먼저 저장함) 내 오래된 내용으로 덮어쓰지
//    않고 중단, 최신본을 다시 불러오게 안내한다.
window._epLibKnownModifiedTime = {};

window._epFetchModifiedTime = async function(fileId, token) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime&supportsAllDrives=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return data && data.modifiedTime;
};

window.upsertElecPartLibraryEntry = async function(type, entry) {
    const _en = window._currentLang === 'en';
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { alert(_en ? '🔒 Please connect Google Drive first.' : '🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return false; }
        let fileId = await window.findElecPartLibFile(type, token);
        let lib = { items: [] };
        let knownModifiedTime = null;
        if (fileId) {
            const [res, modifiedTime] = await Promise.all([
                fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } }),
                window._epFetchModifiedTime(fileId, token)
            ]);
            const loaded = await res.json();
            if (loaded && Array.isArray(loaded.items)) lib = loaded;
            knownModifiedTime = modifiedTime;
        }
        const idx = lib.items.findIndex(function(p) { return window._epNamesMatch(p.model, entry.model); });
        entry.updatedAt = new Date().toISOString();
        entry.updatedBy = window.currentUserName || '';
        if (idx === -1) lib.items.push(entry); else lib.items[idx] = entry;
        const body = JSON.stringify(lib);
        const cfg = window.ELEC_PART_TYPES[type];
        if (fileId) {
            // 낙관적 동시성 제어 — 쓰기 직전, 내가 읽은 이후로 다른 사람이 먼저 저장하지 않았는지 재확인
            try {
                const currentModifiedTime = await window._epFetchModifiedTime(fileId, token);
                if (knownModifiedTime && currentModifiedTime && currentModifiedTime !== knownModifiedTime) {
                    const msg = _en
                        ? '⚠️ This library was just updated by someone else. Your changes were NOT saved — please reload and try again.'
                        : '⚠️ 다른 팀원이 방금 이 라이브러리를 먼저 저장했습니다. 오래된 내용으로 덮어쓰지 않기 위해 저장을 중단했습니다 — 다시 불러온 뒤 시도해주세요.';
                    if (window.showToast) window.showToast(msg, 'warning', 6000); else alert(msg);
                    return false; // 캐시된 파일 id 자체는 안 바뀌므로 window._epLibFileIds는 그대로 둬도 됨 — 다음 저장 때 다시 최신 내용을 읽어옴
                }
            } catch (checkErr) { console.warn('전기부품 라이브러리 동시성 확인 실패(그냥 진행):', checkErr.message); }

            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body
            });
        } else {
            // 생성 직전 한 번 더 재확인 — 그 사이 다른 사람이 이미 만들었으면 새로 만들지 않고 그 파일에 이어서 저장(중복 생성 방지)
            const folderId = await window.getOrCreateConfigFolder(token);
            const recheckId = await window._findOrMigrateFile(token, cfg.libFilename, folderId);
            if (recheckId) {
                window._epLibFileIds[type] = recheckId;
                return window.upsertElecPartLibraryEntry(type, entry); // 방금 알아낸 fileId로 update 경로를 다시 탐
            }
            const boundary = 'elec_part_lib_boundary';
            const metadata = { name: cfg.libFilename, mimeType: 'application/json', parents: [folderId] };
            const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body + "\r\n--" + boundary + "--";
            const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` }, body: multipartBody
            });
            const created = await createRes.json();
            if (created && created.id) window._epLibFileIds[type] = created.id;
        }
        return true;
    } catch (e) { alert((_en ? 'Failed to save library: ' : '라이브러리 저장 실패: ') + e.message); return false; }
};
window._epLibRemoveEntry = async function(type, model) {
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return false;
        const fileId = await window.findElecPartLibFile(type, token);
        if (!fileId) return true;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } });
        const loaded = await res.json();
        if (!loaded || !Array.isArray(loaded.items)) return true;
        const before = loaded.items.length;
        loaded.items = loaded.items.filter(function(p) { return !window._epNamesMatch(p.model, model); });
        if (loaded.items.length === before) return true;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(loaded)
        });
        return true;
    } catch (e) { console.warn('전기부품 라이브러리 항목 삭제 실패:', e.message); return false; }
};

// ─── AI 추출: 붙여넣은 스펙 텍스트 → 스키마 필드 JSON + 커넥터 핀맵 구조 ───
window._EP_EXTRACT_TEXT_LIMIT = 32000;
window._epBuildExtractPrompt = function(type, rawText) {
    const cfg = window.ELEC_PART_TYPES[type];
    const fields = window._epFlatFields(type);
    const keyListText = fields.map(function(f) {
        return '- "' + f[0] + '"' + (f[2] === 'enum' ? ' (값은 ' + f[3].join('/') + ' 중 하나를 우선 쓰고, 둘 다 아니면 문서에 표현된 실제 값을 그대로)' : '');
    }).join('\n');
    // 💡 [2026-08-28 신규] "Output Channels(채널 수)를 못 가져오는 경우가 많다"는 지적 — 실측해보니
    //    실제 승인원/SPEC 문서에는 "Output Channels: 4"처럼 라벨을 달고 나오는 경우가 없고, 대신
    //    ① 승인원 표지의 "Sub-Description"란에 다른 값들과 콤마로 묶여 "0.48A,4CH,ADM"처럼 압축
    //    표기되거나, ② 그마저 없으면 "Suitable Load"의 스트링 수(예: "4strings x 1bar"의 4)로만
    //    간접적으로 드러난다(이 보드류는 통상 1 string = 1 channel). 이 두 단서를 명시적으로 알려주지
    //    않으면 AI가 "Output Channels"라는 문구 자체를 찾다가 못 찾고 빈칸으로 남겼다.
    const hasOutputChannels = fields.some(function(f) { return f[0] === 'Output Channels'; });
    const outputChannelsRule = hasOutputChannels
        ? '\n8. "Output Channels"(채널 수)는 문서에 그 문구 그대로 나오는 경우가 드뭅니다. 아래 순서로 값을 찾으세요:\n   ① "Sub-Description"/"Item Description" 등에 다른 값과 콤마로 묶여 나오는 "N CH"/"NCH" 표기(예: "0.48A,4CH,ADM"의 "4CH") → 숫자만 취해 "4"로 답하세요.\n   ② ①이 없으면 "Suitable Load"에 적힌 스트링(string) 개수(예: "4strings x 1bar"의 "4")를 채널 수로 간주하세요(이 보드류는 보통 1 string = 1 channel).\n   ③ 위 두 방법으로도 근거를 못 찾으면 "-"로 답하세요(지어내지 마세요).'
        : '';
    return `당신은 디스플레이용 ${cfg.domain}(${cfg.label}) 데이터시트 분석 전문가입니다.
아래 [원문 텍스트]는 ${cfg.label} 스펙 문서(승인원, Specification 등)에서 사용자가 복사했거나 PDF에서 추출한 내용입니다.
여기서 스펙 정보를 추출해서, 아래 형식의 JSON 객체 하나로만 답하세요(다른 설명이나 마크다운 코드블럭 없이 JSON 객체 하나만).

최상위 키:
1. 스펙 항목들(키 이름을 한 글자도 다르지 않게 정확히 그대로 사용):
${keyListText}
2. "Connectors": 입력/출력 커넥터별 핀맵 배열. 각 원소는 다음 형태:
   { "name": "J1", "role": "INPUT 또는 OUTPUT 등", "model": "커넥터 모델명(예: 12505WR-12A)", "pins": [ { "no": "핀번호(예: 1,2,3)", "symbol": "핀 심볼(예: VIN)", "desc": "설명" }, ... ] }
   "role"은 문서에 적힌 표기를 있는 그대로 쓰세요 — OUTPUT이 여러 개라 문서가 "OUTPUT 1"/"OUTPUT 2"처럼 번호를 붙여 구분해뒀다면(예: "6.2 OUTPUT 1: ...(J2)", "6.3 OUTPUT 2: ...(J5)") 그 번호까지 그대로 유지하세요(예: "OUTPUT 1", "OUTPUT 2") — 커넥터 이름(J2 vs J5)이 달라도 "OUTPUT"으로 뭉뚱그리면 문서가 구분해둔 정보가 사라집니다. 문서에 번호가 없으면 번호 없이 "INPUT"/"OUTPUT"만 쓰세요.
   문서에 커넥터/핀 테이블이 없으면 빈 배열 []로 답하세요.

규칙:
1. 텍스트 안에서 찾을 수 없는 스펙 항목은 반드시 정확히 "-" 하나로 채우세요. 추측하거나 지어내지 마세요.
2. 값은 원문 표기(단위 포함)를 최대한 그대로 유지하세요.
3. "Input Voltage (Min/Typ/Max)"처럼 Min/Typ/Max가 나뉜 항목은 "10.8V / 12~24V / 26.4V" 형식처럼 " / "로 이어붙여 하나의 값으로 답하세요. 값이 없는 자리는 "-"로 채우세요(예: "10.8V / - / 26.4V").
4. "Brand"는 문서에 제조사명이 명시되어 있으면 그대로 쓰고, 없으면 "-"로 답하세요(내부 제작 문서라면 회사명이 곧 Brand입니다).
5. "Item Code"는 사내 관리번호(예: 301782)처럼 숫자/코드 형태의 고유 식별자, "Part Name"은 제품/모델 명칭(예: KCB-02508B-60, GH765A(A1))입니다 — 문서에 원래 하나로만 표기되어 있어도 이 두 성격에 맞게 나눠서 채우세요.
6. 위에 나열된 스펙 키 이름을 한 글자도 다르지 않게 정확히 그대로 사용하세요. "Connectors"의 하위 키(name/role/model/pins/no/symbol/desc)도 정확히 그대로 사용하세요.
7. 한 항목에 값이 여러 줄/여러 개로 나열된 경우(예: "Suitable Load"가 "8strings x 2bars"와 "4strings x 4bars"처럼 서로 다른 두 가지 구성으로 표기된 경우) — 절대 하나만 골라서 답하거나 빈칸("-")으로 남기지 말고, 발견한 값 전부를 세미콜론과 공백("; ")으로 이어붙여 하나의 문자열로 답하세요(예: "8strings x 2bars; 4strings x 4bars"). 이 규칙은 위 3번(Min/Typ/Max 전용 " / " 구분자)과는 별개이며, Min/Typ/Max처럼 정해진 자리가 없는 임의 개수의 나열형 값에 적용합니다.${outputChannelsRule}

[원문 텍스트]
${(rawText || '').substring(0, window._EP_EXTRACT_TEXT_LIMIT)}`;
};
window._epParseAiJson = function(text) {
    if (!text) return null;
    let s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = s.indexOf('{'); const end = s.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
};

// ─── 탭 렌더링 ───
window._epExpanded = {}; // type별 부가스펙 펼침 상태
window._epLibCache = {}; // type별 라이브러리 캐시
window._epRenderedEntries = {}; // type별로 마지막에 그려진 entries — 사진 순환 클릭 시 재조회 없이 참조
window.renderElecCompareTab = async function(type) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    const theadEl = document.getElementById('ep-' + type + '-thead');
    const tbodyEl = document.getElementById('ep-' + type + '-tbody');
    if (!theadEl || !tbodyEl || !cfg || !cfg.schema) return;

    window.tabData = window.tabData || {};
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare[type] = window.tabData.elecCompare[type] || { selectedModels: [], notes: {} };
    const ec = window.tabData.elecCompare[type];
    ec.notes = ec.notes || {};

    theadEl.innerHTML = `<tr><th colspan="99" style="padding:16px; text-align:center; color:#999; background:#fff;">${_en ? 'Loading…' : '불러오는 중...'}</th></tr>`;
    tbodyEl.innerHTML = '';
    const lib = await window.loadElecPartLibrary(type);
    window._epLibCache[type] = lib;

    const selected = ec.selectedModels.slice(0, 10);
    const slotCount = Math.max(2, selected.length); // 💡 기본 최소 2개 비교 슬롯을 항상 보여줌
    const entries = selected.map(function(m) { return window.findElecPartInLibrary(lib, m); });
    const totalCols = 1 + slotCount + 1; // 라벨 + 슬롯들 + Note

    let headHtml = '<tr>';
    headHtml += `<th style="min-width:140px;">Comparison table</th>`;
    for (let i = 0; i < slotCount; i++) {
        const m = selected[i];
        if (m) {
            const has = !!entries[i];
            const entry = entries[i];
            const displayName = entry ? (window._epPartNameOf(entry.specs) || m) : m;
            // 💡 [2026-08-27] Item Code(6자리 숫자)는 표 아래 Basic Information 행에 이미 나오므로
            //    헤더에 중복 표시할 필요 없음 — 요청에 따라 헤더에서는 뺌.
            headHtml += `<th style="min-width:130px; padding-left:6px; padding-right:6px; padding-top:4px !important; padding-bottom:4px !important;">
                <span style="color:#2c5f8a; font-weight:bold; word-break:break-all;">${escapeHtml(displayName)}</span>
                <div style="margin-top:2px; display:flex; gap:4px; justify-content:center; align-items:center; flex-wrap:wrap;">
                    ${has ? `<button data-ep-edit="${escapeHtml(type)}|${escapeHtml(m)}" title="${_en ? 'Edit spec' : '스펙 수정'}" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="background:#fbead9; border:1px solid #edbf85; border-radius:3px; color:#a85d0a; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">✏️</button>` : ''}
                    <button data-ep-reextract="${escapeHtml(type)}|${escapeHtml(m)}" title="${_en ? 'Re-extract / refresh' : '다시 추출/갱신'}" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:3px; color:#1a4f7a; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">🔄</button>
                    <button data-ep-remove="${escapeHtml(type)}|${escapeHtml(m)}" title="${_en ? 'Remove from this comparison' : '이 프로젝트에서 제거'}" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="background:#fbe4e2; border:1px solid #eeb0ac; border-radius:3px; color:#b1432f; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">🗑</button>
                    ${!has ? `<span style="font-size:9.5px; color:#e67e22; font-weight:bold; white-space:nowrap;">⚠ ${_en ? 'Not extracted' : '미추출'}</span>` : ''}
                </div>
            </th>`;
        } else {
            headHtml += `<th class="ep-slot-empty" style="min-width:120px; cursor:pointer;" onclick="window.elecCompareOpenAddModal(${escapeHtml(JSON.stringify(type))})" title="${_en ? 'Click to add' : '클릭해서 추가'}">
                ${_en ? '+ Add' : '+ 추가'}
            </th>`;
        }
    }
    headHtml += `<th style="min-width:130px;">Note</th>`;
    headHtml += '</tr>';
    theadEl.innerHTML = headHtml;

    let html = '';
    cfg.schema.forEach(function(sec) {
        html += `<tr class="ep-section-row"><td colspan="${totalCols}" style="background:#fff8e6; color:#7a5210; font-weight:bold; padding:5px 10px; border:1px solid #e3e6ea;">[${escapeHtml(sec.section)}]</td></tr>`;
        sec.fields.forEach(function(f) {
            const label = f[0], priority = f[1];
            const rowStyle = priority === 2 ? ('display:' + (window._epExpanded[type] ? 'table-row' : 'none') + ';') : '';
            html += `<tr class="${priority === 2 ? 'ep-p2-row' : ''}" style="${rowStyle}">`;
            html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px; color:#555; white-space:nowrap;">${escapeHtml(label)}</td>`;
            for (let i = 0; i < slotCount; i++) {
                const entry = entries[i];
                const v = entry && entry.specs && entry.specs[label] != null && entry.specs[label] !== '' ? entry.specs[label] : '-';
                html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px;">${selected[i] ? escapeHtml(String(v)) : ''}</td>`;
            }
            const noteVal = ec.notes[label] || '';
            html += `<td style="border:1px solid #e9ecef; padding:2px 4px; font-size:12px;"><input type="text" value="${escapeHtml(noteVal)}" onchange="window.elecCompareSetNote(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(label))}, this.value)" style="width:100%; box-sizing:border-box; border:none; font-size:11.5px; padding:2px 4px; background:transparent; text-align:center;"></td>`;
            html += '</tr>';
        });
        // 💡 Interface 섹션에만 "핀맵 보기" 요약 행을 하나 추가 — 스키마 필드는 아니지만, AI 추출 시
        //    함께 저장해둔 entry.connectors(J1/J2/J3 등 전체 핀아웃)를 여기서만 볼 수 있게 한다.
        if (sec.section === 'Interface') {
            html += `<tr><td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px; color:#555; white-space:nowrap;">Pin map</td>`;
            for (let i = 0; i < slotCount; i++) {
                const entry = entries[i];
                const hasConn = entry && Array.isArray(entry.connectors) && entry.connectors.length;
                html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px;">`;
                if (selected[i]) {
                    html += hasConn
                        ? `<button data-ep-pinmap="${escapeHtml(type)}|${escapeHtml(selected[i])}" class="ep-theme-hover-btn" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:4px; color:#1a4f7a; font-size:10.5px; cursor:pointer; padding:2px 8px; transition:background .15s, border-color .15s;">🔌 ${_en ? 'View' : '보기'}</button>`
                        : `<span style="color:#bbb;">-</span>`;
                }
                html += `</td>`;
            }
            html += `<td style="border:1px solid #e9ecef;"></td></tr>`;
        }
    });
    // 💡 [2026-08-26 신규] 사진(최대 2장) — 도표 맨 하단에 한 행으로. 한 번에 1장만 보여주고
    //    클릭하면 다음 장으로 순환(마지막 다음은 다시 1장) — window._epCycleImage가 재렌더 없이 img만 갱신.
    html += `<tr class="ep-section-row"><td colspan="${totalCols}" style="background:#fff8e6; color:#7a5210; font-weight:bold; padding:5px 10px; border:1px solid #e3e6ea;">[Picture]</td></tr>`;
    html += `<tr><td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px; color:#555; white-space:nowrap;">Picture</td>`;
    for (let i = 0; i < slotCount; i++) {
        const entry = entries[i];
        const images = (entry && Array.isArray(entry.images)) ? entry.images : [];
        html += `<td style="border:1px solid #e9ecef; padding:4px 6px;">`;
        if (selected[i] && images.length) {
            html += `<img id="ep-img-thumb-${escapeHtml(type)}-${i}" src="${images[0].data}" data-idx="0"
                    onclick="window._epCycleImage(${escapeHtml(JSON.stringify(type))}, ${i})"
                    ondblclick="event.stopPropagation(); window.showElecPhotoLightbox(${escapeHtml(JSON.stringify(type))}, ${i})"
                    title="${_en ? 'Click for next photo, double-click to zoom in' : '클릭하면 다음 사진, 더블클릭하면 크게 보기'}"
                    style="max-width:120px; max-height:88px; cursor:pointer; border:1px solid #ced4da; border-radius:4px; object-fit:cover;">`;
            if (images.length > 1) html += `<div id="ep-img-counter-${escapeHtml(type)}-${i}" style="font-size:9.5px; color:#999; margin-top:2px;">1/${images.length}</div>`;
        } else if (selected[i]) {
            html += `<span style="color:#bbb;">-</span>`;
        }
        html += `</td>`;
    }
    html += `<td style="border:1px solid #e9ecef;"></td></tr>`;
    tbodyEl.innerHTML = html;
    window._epRenderedEntries[type] = entries; // _epCycleImage가 재조회 없이 바로 참조하도록 캐시
    window._epApplyZebra(type);

    const toggleBtn = document.getElementById('ep-' + type + '-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = window._epExpanded[type] ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
};

window.elecCompareSetNote = function(type, label, value) {
    window.tabData = window.tabData || {};
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare[type] = window.tabData.elecCompare[type] || { selectedModels: [], notes: {} };
    const ec = window.tabData.elecCompare[type];
    ec.notes = ec.notes || {};
    const oldVal = ec.notes[label] || '';
    ec.notes[label] = value;
    window.epLogChange(type, label, 'Note', oldVal, value);
};

window.elecCompareToggleExpand = function(type) {
    window._epExpanded[type] = !window._epExpanded[type];
    document.querySelectorAll('#ep-' + type + '-table .ep-p2-row').forEach(function(tr) { tr.style.display = window._epExpanded[type] ? 'table-row' : 'none'; });
    const toggleBtn = document.getElementById('ep-' + type + '-toggle-btn');
    const _en = window._currentLang === 'en';
    if (toggleBtn) toggleBtn.textContent = window._epExpanded[type] ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
    window._epApplyZebra(type);
};

window._epApplyZebra = function(type) {
    const rows = document.querySelectorAll('#ep-' + type + '-table tbody tr:not(.ep-section-row)');
    let i = 0;
    rows.forEach(function(tr) {
        tr.classList.remove('mc-zebra-a', 'mc-zebra-b');
        if (tr.style.display === 'none') return;
        tr.classList.add(i % 2 === 0 ? 'mc-zebra-a' : 'mc-zebra-b');
        i++;
    });
};

// 💡 사진 클릭 → 다음 장으로 순환. 표 전체를 다시 그리지 않고 그 셀의 img/카운터만 갱신한다.
window._epCycleImage = function(type, i) {
    const entries = window._epRenderedEntries[type];
    const entry = entries && entries[i];
    const images = entry && Array.isArray(entry.images) ? entry.images : [];
    if (images.length < 2) return; // 0~1장이면 순환할 게 없음
    const imgEl = document.getElementById('ep-img-thumb-' + type + '-' + i);
    if (!imgEl) return;
    const nextIdx = (parseInt(imgEl.dataset.idx || '0', 10) + 1) % images.length;
    imgEl.dataset.idx = nextIdx;
    imgEl.src = images[nextIdx].data;
    const counterEl = document.getElementById('ep-img-counter-' + type + '-' + i);
    if (counterEl) counterEl.textContent = (nextIdx + 1) + '/' + images.length;
};

// ─── 📷 사진 크게 보기(라이트박스) — 여러 장이면 좌우로 이동 가능. Elec Parts 표뿐 아니라 Summary
//    제품사진에서도 그대로 재사용할 수 있게, "이미지 배열 하나 크게 보여주기"라는 범용 코어(_openImageLightbox)와
//    호출부(사진 위치를 어디서 가져오는지)를 분리했다. 모달 자체는 다른 Elec Parts 모달과 동일한 기본
//    패턴을 따른다: 드래그 가능한 헤더, ✕/바깥 클릭으로 닫기, bringModalToFront로 항상 맨 위에 오게.
window._epLightboxState = null; // { images: [...], idx, onSync? } — onSync(idx)는 작은 썸네일 등 호출부 UI 동기화용(선택)
window._openImageLightbox = function(images, startIdx, title, onSync) {
    if (!images || !images.length) return;
    window._epLightboxState = {
        images: images,
        idx: ((startIdx % images.length) + images.length) % images.length,
        onSync: onSync || null
    };

    let modal = document.getElementById('ep-lightbox-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ep-lightbox-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ep-lightbox-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:280px;">
            <div id="ep-lightbox-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="ep-lightbox-title">📷 Picture</span>
                <button onclick="document.getElementById('ep-lightbox-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div style="position:relative; flex:1; display:flex; align-items:center; justify-content:center; padding:16px; overflow:auto; background:#fff; min-height:200px;">
                <button id="ep-lightbox-prev" onclick="window._epLightboxNav(-1)" title="Previous" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.85); border:1px solid #ddd; border-radius:50%; width:34px; height:34px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">‹</button>
                <img id="ep-lightbox-img" style="max-width:100%; max-height:70vh; object-fit:contain;">
                <button id="ep-lightbox-next" onclick="window._epLightboxNav(1)" title="Next" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.85); border:1px solid #ddd; border-radius:50%; width:34px; height:34px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">›</button>
            </div>
            <div id="ep-lightbox-counter" style="text-align:center; padding:8px; font-size:12px; color:#666; flex-shrink:0;"></div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ep-lightbox-box', 'ep-lightbox-drag');
        window._bindClickToFront('ep-lightbox-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
        // 열려있는 동안엔 좌우 화살표 키/Esc로도 넘기고 닫을 수 있게
        document.addEventListener('keydown', function(e) {
            if (!window._epLightboxState) return;
            const m = document.getElementById('ep-lightbox-modal');
            if (!m || m.style.display === 'none') return;
            if (e.key === 'ArrowLeft') window._epLightboxNav(-1);
            else if (e.key === 'ArrowRight') window._epLightboxNav(1);
            else if (e.key === 'Escape') m.style.display = 'none';
        });
    }
    modal.style.display = 'block';
    window.bringModalToFront('ep-lightbox-modal');
    const titleEl = document.getElementById('ep-lightbox-title');
    if (titleEl) titleEl.textContent = '📷 ' + (title || '');
    window._epRenderLightbox();
};

// 💡 라이트박스 이미지/카운터/이전·다음 버튼을 현재 idx에 맞춰 갱신하고, onSync가 있으면 호출부(작은
//    썸네일 등)도 같은 위치로 동기화한다 — 그래야 라이트박스를 닫고 다시 열었을 때 이어서 보여줄 수 있다.
window._epRenderLightbox = function() {
    const st = window._epLightboxState;
    if (!st) return;
    const images = st.images || [];
    if (!images.length) return;
    const idx = ((st.idx % images.length) + images.length) % images.length;
    st.idx = idx;
    const imgEl = document.getElementById('ep-lightbox-img');
    if (imgEl) imgEl.src = images[idx].data;
    const multi = images.length > 1;
    const counterEl = document.getElementById('ep-lightbox-counter');
    if (counterEl) counterEl.textContent = multi ? (idx + 1) + ' / ' + images.length : '';
    const prevBtn = document.getElementById('ep-lightbox-prev');
    const nextBtn = document.getElementById('ep-lightbox-next');
    if (prevBtn) prevBtn.style.display = multi ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = multi ? 'flex' : 'none';
    if (st.onSync) st.onSync(idx);
};
window._epLightboxNav = function(dir) {
    if (!window._epLightboxState) return;
    window._epLightboxState.idx += dir;
    window._epRenderLightbox();
};

// 💡 Elec Parts 표의 작은 사진 썸네일 전용 진입점 — 라이트박스에서 넘긴 위치를 작은 썸네일에도
//    그대로 동기화해서, 닫고 표에서 다시 클릭했을 때도 이어서 순환되게 한다.
window.showElecPhotoLightbox = function(type, i) {
    const entries = window._epRenderedEntries[type];
    const entry = entries && entries[i];
    const images = entry && Array.isArray(entry.images) ? entry.images : [];
    if (!images.length) return;
    const thumbEl = document.getElementById('ep-img-thumb-' + type + '-' + i);
    const startIdx = thumbEl ? parseInt(thumbEl.dataset.idx || '0', 10) : 0;
    const title = window._epPartNameOf(entry.specs) || entry.model || '';
    window._openImageLightbox(images, startIdx, title, function(idx) {
        if (!thumbEl) return;
        thumbEl.dataset.idx = idx;
        thumbEl.src = images[idx].data;
        const thumbCounter = document.getElementById('ep-img-counter-' + type + '-' + i);
        if (thumbCounter) thumbCounter.textContent = (idx + 1) + '/' + images.length;
    });
};

window.elecCompareRemove = function(type, model) {
    if (!window.tabData || !window.tabData.elecCompare || !window.tabData.elecCompare[type]) return;
    window.tabData.elecCompare[type].selectedModels = window.tabData.elecCompare[type].selectedModels.filter(function(m) { return m !== model; });
    window.epLogChange(type, model, window._currentLang === 'en' ? 'Comparison table' : '비교표', window._currentLang === 'en' ? 'Included' : '포함', window._currentLang === 'en' ? 'Removed' : '제거');
    window.renderElecCompareTab(type);
};

window.elecCompareAddFromLibrary = function(type, model) {
    const _en = window._currentLang === 'en';
    window.tabData = window.tabData || {};
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare[type] = window.tabData.elecCompare[type] || { selectedModels: [], notes: {} };
    const sel = window.tabData.elecCompare[type].selectedModels;
    if (sel.indexOf(model) !== -1) { if (window.showToast) window.showToast(_en ? 'Already in the comparison table.' : '이미 비교표에 있습니다.', 'info'); return; }
    if (sel.length >= 10) { alert(_en ? 'Maximum 10 items per comparison table. Remove one first.' : '비교표는 최대 10개까지입니다. 하나를 먼저 제거해주세요.'); return; }
    sel.push(model);
    window.epLogChange(type, model, _en ? 'Comparison table' : '비교표', '-', _en ? 'Added' : '추가');
    const addModal = document.getElementById('ep-add-modal'); if (addModal) addModal.style.display = 'none';
    window.renderElecCompareTab(type);
};

window.elecCompareReextract = async function(type, model) {
    await window.elecCompareOpenAddModal(type);
    // 💡 사진은 AI가 텍스트에서 재추출할 수 있는 정보가 아니므로, 스펙만 새로 붙여넣게 하고
    //    이미 등록돼 있던 사진은 그대로 유지한다(openAddModal이 방금 빈 슬롯으로 초기화했으므로 덮어씀).
    const lib = window._epLibCache[type] || await window.loadElecPartLibrary(type);
    const existing = window.findElecPartInLibrary(lib, model);
    if (existing && Array.isArray(existing.images) && existing.images.length) {
        window._epPendingImages = [existing.images[0] || null, existing.images[1] || null];
        window._epSyncImageSlotsUI();
    }
    window._epPendingReextractModel = model;
    const paste = document.getElementById('ep-add-paste');
    if (paste) paste.focus();
    if (window.showToast) {
        window.showToast(window._currentLang === 'en' ? `Paste the latest spec text for "${model}" and extract.` : `"${model}"의 최신 스펙 텍스트를 붙여넣고 추출하세요.`, 'info');
    }
};

// 💡 [2026-08-26] 저장된 스펙/모델명을 다시 붙여넣어 AI로 재추출하지 않아도, 라이브러리에 있는 현재
//    값을 그대로 불러와 각 항목을 직접 고칠 수 있게 한다(Panel Compare의 panelCompareOpenEditModal과 동일).
window.elecCompareOpenEditModal = async function(type, model) {
    const _en = window._currentLang === 'en';
    const lib = await window.loadElecPartLibrary(type);
    window._epLibCache[type] = lib;
    const entry = window.findElecPartInLibrary(lib, model);
    if (!entry) { alert(_en ? 'This item was not found in the library.' : '라이브러리에서 이 항목을 찾을 수 없습니다.'); return; }
    await window.elecCompareOpenAddModal(type);
    window._epPendingReextractModel = entry.model;
    window._epEditingOriginalModel = entry.model;
    window._epPendingConnectors = entry.connectors || [];
    window._epPendingImages = [(entry.images && entry.images[0]) || null, (entry.images && entry.images[1]) || null];
    window._epSyncImageSlotsUI();
    window._epRenderPreviewForm(type, entry.specs || {});
    if (window.showToast) window.showToast(_en ? `Loaded the current spec for "${entry.model}" — edit and save.` : `"${entry.model}"의 현재 스펙을 불러왔습니다 — 수정 후 저장하세요.`, 'info');
};

// ─── "➕ 추가" 모달: 라이브러리 검색 + 새 항목 AI 추출 (Panel Compare와 동일 UI, type만 다름) ───
window.elecCompareOpenAddModal = async function(type) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    window._epActiveType = type;
    let modal = document.getElementById('ep-add-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ep-add-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ep-add-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
            <div id="ep-add-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="ep-add-title">⚡ ${_en ? 'Add Item' : '항목 추가'}</span>
                <button onclick="document.getElementById('ep-add-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div style="padding:12px 16px; border-bottom:1px solid #eee; flex-shrink:0;">
                <input id="ep-add-search" type="text" placeholder="${_en ? 'Search library...' : '라이브러리에서 검색...'}" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #ced4da; border-radius:6px; font-size:13px;" oninput="window._epRenderLibList(this.value)">
                <div id="ep-add-lib-list" style="margin-top:8px; max-height:160px; overflow-y:auto;"></div>
            </div>
            <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; min-height:0;">
                <div style="font-size:12px; font-weight:bold; color:#555; margin-bottom:6px;">📷 ${_en ? 'Photos (up to 2)' : '사진 (최대 2장)'}</div>
                <div style="display:flex; gap:8px; margin-bottom:12px; flex-shrink:0;">
                    <div class="ep-img-slot" data-slot="0" style="position:relative; width:104px; height:78px; border:1.5px dashed #ced4da; border-radius:6px; cursor:pointer; overflow:hidden; background:#f8f9fa; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <input type="file" accept="image/*" style="display:none;">
                        <img class="ep-img-preview" style="display:none; width:100%; height:100%; object-fit:cover;">
                        <span class="ep-img-placeholder" style="font-size:22px; color:#bbb;">📷</span>
                        <button type="button" class="ep-img-del-btn" style="display:none; position:absolute; top:2px; right:2px; width:18px; height:18px; border:none; border-radius:50%; background:rgba(177,67,47,0.85); color:#fff; font-size:11px; cursor:pointer; line-height:18px; padding:0;">✕</button>
                    </div>
                    <div class="ep-img-slot" data-slot="1" style="position:relative; width:104px; height:78px; border:1.5px dashed #ced4da; border-radius:6px; cursor:pointer; overflow:hidden; background:#f8f9fa; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <input type="file" accept="image/*" style="display:none;">
                        <img class="ep-img-preview" style="display:none; width:100%; height:100%; object-fit:cover;">
                        <span class="ep-img-placeholder" style="font-size:22px; color:#bbb;">📷</span>
                        <button type="button" class="ep-img-del-btn" style="display:none; position:absolute; top:2px; right:2px; width:18px; height:18px; border:none; border-radius:50%; background:rgba(177,67,47,0.85); color:#fff; font-size:11px; cursor:pointer; line-height:18px; padding:0;">✕</button>
                    </div>
                </div>
                <div id="ep-add-extract-label" style="font-size:12px; font-weight:bold; color:#555; margin-bottom:6px;">${_en ? 'Or extract a new item with AI' : '또는 새 항목을 AI로 추출'}</div>
                <input type="file" id="ep-add-file" accept=".pdf,.txt,.html,.htm" style="display:none;" onchange="window._epHandleFileUpload(this)">
                <div id="ep-add-dropzone"
                     style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-shrink:0; padding:8px 10px; border:1.5px dashed #2c5f8a; border-radius:6px; background:#f8f9fa; cursor:pointer; transition:0.15s;"
                     onclick="document.getElementById('ep-add-file').click()"
                     ondragover="event.preventDefault(); this.style.background='#e9eef3';"
                     ondragleave="this.style.background='#f8f9fa';"
                     ondrop="event.preventDefault(); event.stopPropagation(); this.style.background='#f8f9fa'; window._epHandleFileDrop(event.dataTransfer.files);">
                    <button type="button" id="ep-add-file-btn" onclick="event.stopPropagation(); document.getElementById('ep-add-file').click()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex-shrink:0; padding:6px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📄 ${_en ? 'Attach PDF/TXT/HTML' : 'PDF/TXT/HTML 첨부'}</button>
                    <span id="ep-add-file-name" style="font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_en ? 'or drag & drop a file here' : '또는 파일을 여기로 드래그하세요'}</span>
                </div>
                <textarea id="ep-add-paste" placeholder="${_en ? 'Paste the spec text copied from a datasheet, or attach a PDF/TXT/HTML file above...' : '데이터시트에서 복사한 스펙 텍스트를 붙여넣거나, 위에서 PDF/TXT/HTML 파일을 첨부하세요...'}" style="width:100%; box-sizing:border-box; min-height:90px; border:1px solid #ced4da; border-radius:6px; padding:8px; font-size:12px; resize:vertical;"></textarea>
                <button id="ep-add-extract-btn" onclick="window._epRunExtract()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="margin-top:8px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; flex-shrink:0; transition:background .15s, border-color .15s;">🤖 ${_en ? 'Extract with AI' : 'AI로 추출'}</button>
                <div id="ep-add-preview" style="margin-top:10px;"></div>
            </div>
            <div id="ep-add-footer" style="display:none; padding:12px 16px; border-top:1px solid #eee; flex-shrink:0;">
                <button id="ep-save-btn" onclick="window._epSaveNewItem(window._epActiveType)" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="width:100%; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? 'Save' : '저장'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ep-add-box', 'ep-add-drag');
        window._bindClickToFront('ep-add-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
        window._epInitImageSlots();
    }
    const titleEl = document.getElementById('ep-add-title');
    if (titleEl) titleEl.textContent = cfg.icon + ' ' + (_en ? 'Add ' + cfg.label : cfg.label + ' 추가');
    modal.style.display = 'block';
    window.bringModalToFront('ep-add-modal');
    document.getElementById('ep-add-search').value = '';
    document.getElementById('ep-add-paste').value = '';
    document.getElementById('ep-add-preview').innerHTML = '';
    const epFooterEl = document.getElementById('ep-add-footer'); if (epFooterEl) epFooterEl.style.display = 'none';
    const fileNameEl = document.getElementById('ep-add-file-name'); if (fileNameEl) fileNameEl.textContent = _en ? 'or drag & drop a file here' : '또는 파일을 여기로 드래그하세요';
    const fileInputEl = document.getElementById('ep-add-file'); if (fileInputEl) fileInputEl.value = '';
    window._epEditingOriginalModel = null;
    window._epPendingConnectors = [];
    window._epPendingImages = [null, null];
    window._epSyncImageSlotsUI();
    const lib = await window.loadElecPartLibrary(type);
    window._epLibCache[type] = lib;
    window._epRenderLibList('');
};

// 💡 [2026-08-26 신규] 사진 슬롯(최대 2장) — Summary 탭의 initProductImageSlots와 동일한 방식
//    (업로드 시 최대 1000px로 리사이즈 + JPEG 0.8 압축해 base64로 tabData 대신 라이브러리 항목에 저장).
//    모델과 무관하게 모달 DOM은 한 번만 만들어지므로, 리스너도 한 번만 붙이고 이후엔 항상
//    window._epPendingImages(현재 편집 중인 항목의 사진)만 읽고 쓴다.
window._epInitImageSlots = function() {
    document.querySelectorAll('#ep-add-modal .ep-img-slot').forEach(function(slot) {
        const i = parseInt(slot.dataset.slot, 10);
        const fileInput = slot.querySelector('input[type="file"]');
        const del = slot.querySelector('.ep-img-del-btn');
        slot.addEventListener('click', function(e) {
            if (e.target === del) return;
            fileInput.click();
        });
        fileInput.addEventListener('change', function() {
            const file = fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                const tempImg = new Image();
                tempImg.onload = function() {
                    const MAX = 1000;
                    let w = tempImg.width, h = tempImg.height;
                    if (w > MAX || h > MAX) {
                        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                        else        { w = Math.round(w * MAX / h); h = MAX; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(tempImg, 0, 0, w, h);
                    const b64 = canvas.toDataURL('image/jpeg', 0.80);
                    window._epPendingImages = window._epPendingImages || [null, null];
                    window._epPendingImages[i] = { data: b64, w: w, h: h };
                    window._epSyncImageSlotsUI();
                };
                tempImg.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            fileInput.value = ''; // 같은 파일 재선택 허용
        });
        del.addEventListener('click', function(e) {
            e.stopPropagation();
            window._epPendingImages = window._epPendingImages || [null, null];
            window._epPendingImages[i] = null;
            window._epSyncImageSlotsUI();
        });
    });
};
window._epSyncImageSlotsUI = function() {
    const imgs = window._epPendingImages || [null, null];
    document.querySelectorAll('#ep-add-modal .ep-img-slot').forEach(function(slot) {
        const i = parseInt(slot.dataset.slot, 10);
        const img = slot.querySelector('.ep-img-preview');
        const ph = slot.querySelector('.ep-img-placeholder');
        const del = slot.querySelector('.ep-img-del-btn');
        const data = imgs[i];
        if (data && data.data) {
            img.src = data.data; img.style.display = 'block';
            ph.style.display = 'none'; del.style.display = 'block';
        } else {
            img.src = ''; img.style.display = 'none';
            ph.style.display = 'flex'; del.style.display = 'none';
        }
    });
};

window._epRenderLibList = function(filterText) {
    const list = document.getElementById('ep-add-lib-list');
    if (!list) return;
    const _en = window._currentLang === 'en';
    const type = window._epActiveType;
    const lib = window._epLibCache[type] || { items: [] };
    const q = (filterText || '').trim().toLowerCase();
    const filtered = (lib.items || []).filter(function(p) { return !q || (p.model || '').toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
    if (!filtered.length) {
        list.innerHTML = `<div style="padding:8px; color:#999; font-size:12px;">${_en ? 'No matches in the library.' : '라이브러리에 일치하는 항목이 없습니다.'}</div>`;
        return;
    }
    // 💡 [2026-08-28 신규] "등록된 품목을 삭제할 방법이 없다"는 지적 — 지금까지는 이 목록에서 항목을
    //    클릭해 비교표에 "추가"만 할 수 있었고, 팀 공용 라이브러리(Drive) 자체에서 항목을 완전히 지우는
    //    UI가 없었다(window._epLibRemoveEntry 함수 자체는 있었지만 "이름 변경" 흐름에서만 내부적으로
    //    쓰이고 있었음). 각 행에 🗑 삭제 버튼을 추가 — event.stopPropagation()으로 행 클릭(추가)과
    //    분리해서, 삭제 버튼만 눌렀을 때는 추가되지 않게 한다.
    list.innerHTML = filtered.map(function(p) {
        return `<div style="padding:6px 8px; border-bottom:1px solid #f0f0f0; font-size:12.5px; display:flex; justify-content:space-between; align-items:center;"
            onmouseover="this.style.background='#f4f8fc'" onmouseout="this.style.background='transparent'">
            <span onclick="window.elecCompareAddFromLibrary(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(p.model))})" style="cursor:pointer; flex:1; min-width:0;">
                <b>${escapeHtml(window._epPartNameOf(p.specs) || p.model)}</b> <span style="color:#888;">${escapeHtml((p.specs && p.specs['Brand']) || '')}</span>
            </span>
            <span onclick="window.elecCompareAddFromLibrary(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(p.model))})" style="color:#2c5f8a; cursor:pointer; flex-shrink:0; margin-left:8px;">${_en ? '+ Add' : '+ 추가'}</span>
            <button type="button" onclick="event.stopPropagation(); window._epDeleteLibEntry(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(p.model))});" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" title="${_en ? 'Permanently delete from the shared library' : '공용 라이브러리에서 완전히 삭제'}" style="flex-shrink:0; margin-left:6px; background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; padding:2px 6px; transition:background .15s, border-color .15s;">🗑</button>
        </div>`;
    }).join('');
};

// 💡 [2026-08-28 신규] 위 🗑 버튼의 실행부 — 공용 라이브러리(Drive)에서 항목을 완전히 삭제한다.
//    되돌릴 수 없는 파괴적 동작이라 confirm으로 한 번 더 확인한다. 삭제 후에는 로컬 캐시(_epLibCache)와
//    현재 프로젝트의 비교표 선택(selectedModels)에서도 같이 제거해서, 다시 불러오지 않아도 화면이
//    바로 일치하게 만든다(이미 라이브러리에서 지워진 모델을 비교표가 계속 참조하면 "미추출"로 깨져 보임).
window._epDeleteLibEntry = async function(type, model) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    const displayName = (function() {
        const lib = window._epLibCache[type] || { items: [] };
        const p = (lib.items || []).find(function(x) { return x.model === model; });
        return (p && window._epPartNameOf(p.specs)) || model;
    })();
    const ok = confirm(_en
        ? `Permanently delete "${displayName}" from the shared ${cfg.label} library?\nThis cannot be undone and affects everyone on the team.`
        : `공용 ${cfg.label} 라이브러리에서 "${displayName}"을(를) 완전히 삭제할까요?\n되돌릴 수 없으며 팀 전체에 영향을 줍니다.`);
    if (!ok) return;

    const success = await window._epLibRemoveEntry(type, model);
    if (!success) {
        alert(_en ? '⚠️ Failed to delete from the library. Please check your Drive login and try again.' : '⚠️ 라이브러리 삭제에 실패했습니다. 드라이브 로그인 상태를 확인하고 다시 시도해주세요.');
        return;
    }

    const lib = window._epLibCache[type];
    if (lib && Array.isArray(lib.items)) lib.items = lib.items.filter(function(p) { return p.model !== model; });

    const ec = window.tabData && window.tabData.elecCompare && window.tabData.elecCompare[type];
    if (ec && Array.isArray(ec.selectedModels) && ec.selectedModels.indexOf(model) !== -1) {
        ec.selectedModels = ec.selectedModels.filter(function(m) { return m !== model; });
        window.renderElecCompareTab(type);
    }

    const searchInput = document.getElementById('ep-add-search');
    window._epRenderLibList(searchInput ? searchInput.value : '');
    if (window.showToast) window.showToast((_en ? '🗑 Deleted from library: ' : '🗑 라이브러리에서 삭제했습니다: ') + displayName, 'info');
};

window._epHandleFileUpload = async function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try { await window._epProcessFile(file); } finally { input.value = ''; }
};
window._epHandleFileDrop = async function(fileList) {
    const _en = window._currentLang === 'en';
    const file = fileList && fileList[0];
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'txt', 'html', 'htm'].indexOf(ext) === -1) {
        alert(_en ? '⚠️ Only PDF/TXT/HTML files are supported.' : '⚠️ PDF/TXT/HTML 파일만 지원합니다.');
        return;
    }
    await window._epProcessFile(file);
};
window._epProcessFile = async function(file) {
    const _en = window._currentLang === 'en';
    const paste = document.getElementById('ep-add-paste');
    const fileNameEl = document.getElementById('ep-add-file-name');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (fileNameEl) fileNameEl.textContent = '📄 ' + file.name;
    try {
        let text = '';
        if (ext === 'pdf') {
            if (!window.pdfjsLib) {
                alert(_en ? '⚠️ The PDF reader library failed to load (check your network) — paste the text manually instead.' : '⚠️ PDF 읽기 라이브러리를 불러오지 못했습니다(네트워크 확인) — 대신 텍스트를 직접 붙여넣어주세요.');
                return;
            }
            if (paste) paste.value = _en ? 'Reading PDF…' : 'PDF 읽는 중...';
            text = await window._pcExtractPdfText(file);
        } else if (ext === 'html' || ext === 'htm') {
            const htmlStr = await file.text();
            text = window._pcExtractHtmlText(htmlStr);
        } else {
            text = await file.text();
        }
        const cleaned = window._pcCleanExtractedText(text);
        if (paste) paste.value = cleaned;
        const savedChars = text.length - cleaned.length;
        if (window.showToast) {
            window.showToast((_en ? '📄 Loaded text from "' : '📄 "') + file.name + (_en ? '"' : '"에서 텍스트를 불러왔습니다')
                + (savedChars > 200 ? (_en ? ` (removed ${savedChars.toLocaleString()} repeated chars)` : ` (반복 ${savedChars.toLocaleString()}자 정리됨)`) : ''), 'info');
        }
    } catch (e) {
        if (paste) paste.value = '';
        alert((_en ? 'Failed to read the file: ' : '파일을 읽지 못했습니다: ') + e.message);
    }
};

window._epRunExtract = async function() {
    const _en = window._currentLang === 'en';
    const type = window._epActiveType;
    const raw = (document.getElementById('ep-add-paste') || {}).value || '';
    if (!raw.trim()) { alert(_en ? 'Please paste the spec text first.' : '먼저 스펙 텍스트를 붙여넣어 주세요.'); return; }
    if (raw.length > window._EP_EXTRACT_TEXT_LIMIT) {
        const proceed = confirm(_en
            ? `The pasted text is ${raw.length.toLocaleString()} characters, but only the first ${window._EP_EXTRACT_TEXT_LIMIT.toLocaleString()} will be analyzed (AI input limit) — specs beyond that point may be missed.\n\nContinue anyway?`
            : `붙여넣은 텍스트가 ${raw.length.toLocaleString()}자인데, AI 분석에는 앞부분 ${window._EP_EXTRACT_TEXT_LIMIT.toLocaleString()}자까지만 사용됩니다 — 그 뒤에 있는 스펙은 누락될 수 있습니다.\n\n그래도 진행할까요?`);
        if (!proceed) return;
    }
    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) { alert(_en ? '⚠️ No AI API key configured. Set one in the mail analysis screen first.' : '⚠️ AI API 키가 설정되어 있지 않습니다. 메일 분석 화면에서 먼저 키를 등록해주세요.'); return; }
    const btn = document.getElementById('ep-add-extract-btn');
    if (btn) { btn.disabled = true; btn.textContent = '🤖 ' + (_en ? 'Extracting…' : '추출 중...'); }
    try {
        const prompt = window._epBuildExtractPrompt(type, raw);
        const result = await window.callAiBackend(apiKey, prompt);
        if (!result.ok) { alert((_en ? 'AI call failed: ' : 'AI 호출 실패: ') + (result.error && result.error.message || (_en ? 'Unknown error' : '알 수 없는 오류'))); return; }
        const text = result.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = window._epParseAiJson(text);
        if (!parsed) alert(_en ? 'Could not parse the AI response. Please try again, or fill in the form manually below.' : 'AI 응답을 해석하지 못했습니다. 다시 시도하거나 아래 폼에 직접 입력해주세요.');
        window._epPendingConnectors = (parsed && Array.isArray(parsed.Connectors)) ? parsed.Connectors : [];
        window._epRenderPreviewForm(type, parsed || {});
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🤖 ' + (_en ? 'Extract with AI' : 'AI로 추출'); }
    }
};

// 💡 enum 필드 드롭다운 변경 핸들러 — "기타" 선택 시 옆의 자유 텍스트 칸을 열어서 직접 입력받고,
//    Enable/Disable/- 선택 시엔 그 값을 바로 히든 입력칸에 채우고 자유 텍스트 칸은 숨긴다.
window._epHandleEnumChange = function(selectEl) {
    const wrap = selectEl.parentElement;
    const hiddenInput = wrap.querySelector('input[data-ep-field]');
    if (!hiddenInput) return;
    if (selectEl.value === '__other__') {
        hiddenInput.style.display = '';
        hiddenInput.value = '';
        hiddenInput.focus();
    } else {
        hiddenInput.style.display = 'none';
        hiddenInput.value = selectEl.value;
    }
};

window._epRenderPreviewForm = function(type, specs) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    const preview = document.getElementById('ep-add-preview');
    if (!preview) return;
    // 💡 모델(라이브러리 키)은 "Item Code_Part Name" 결합 — 재추출/수정 흐름이면 기존 키를 그대로 보존.
    const itemCode = (specs['Item Code'] && specs['Item Code'] !== '-') ? specs['Item Code'] : '';
    const partName = window._epPartNameOf(specs);
    const autoModel = [itemCode, partName].filter(Boolean).join('_');
    const presetModel = window._epPendingReextractModel || autoModel;
    window._epPendingReextractModel = null;
    let html = '';
    html += `<div style="margin-bottom:10px;"><label style="font-size:11px; font-weight:bold; color:#555;">${_en ? 'Library key (Item Code_Part Name) *' : '라이브러리 키(Item Code_Part Name) *'}</label>
        <input id="ep-form-model" type="text" value="${escapeHtml(presetModel)}" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1.5px solid #2c5f8a; border-radius:5px; font-size:13px; margin-top:2px;" placeholder="${_en ? 'e.g. 301782_KCB-02508B-60' : '예: 301782_KCB-02508B-60'}"></div>`;
    (cfg.schema || []).forEach(function(sec, si) {
        html += `<details ${si === 0 ? 'open' : ''} style="margin-bottom:6px;"><summary style="cursor:pointer; font-weight:bold; font-size:12px; color:#2c5f8a; padding:4px 0;">[${escapeHtml(sec.section)}]</summary>`;
        sec.fields.forEach(function(f) {
            const label = f[0];
            const val = specs[label] != null ? String(specs[label]) : '-';
            // 💡 [2026-08-26 신규] enum 필드(Resize Function 등)는 Enable/Disable/기타(자유 텍스트) 드롭다운으로.
            //    실제 저장값은 그대로 data-ep-field 히든 입력칸에 두고(_epSaveNewItem이 이 값을 그대로 읽음),
            //    드롭다운은 그 칸을 채우는 UI일 뿐이라 저장 로직은 일반 텍스트 필드와 완전히 동일하다.
            if (f[2] === 'enum') {
                const opts = f[3] || [];
                const isKnown = opts.indexOf(val) !== -1;
                const isOther = !isKnown && val !== '-';
                html += `<div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
                    <label style="flex:0 0 190px; font-size:10.5px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(label)}">${escapeHtml(label)}</label>
                    <select onchange="window._epHandleEnumChange(this)" style="flex:0 0 120px; padding:4px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px;">
                        <option value="-" ${val === '-' ? 'selected' : ''}>-</option>
                        ${opts.map(function(o) { return `<option value="${escapeHtml(o)}" ${o === val ? 'selected' : ''}>${escapeHtml(o)}</option>`; }).join('')}
                        <option value="__other__" ${isOther ? 'selected' : ''}>${_en ? 'Other…' : '기타(직접입력)'}</option>
                    </select>
                    <input data-ep-field="${escapeHtml(label)}" type="text" value="${escapeHtml(val)}" placeholder="${_en ? 'Enter value' : '값 입력'}" style="flex:1; padding:4px 6px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px; min-width:0; ${isOther ? '' : 'display:none;'}">
                </div>`;
            } else {
                html += `<div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
                    <label style="flex:0 0 190px; font-size:10.5px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(label)}">${escapeHtml(label)}</label>
                    <input data-ep-field="${escapeHtml(label)}" type="text" value="${escapeHtml(val)}" style="flex:1; padding:4px 6px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px; min-width:0;">
                </div>`;
            }
        });
        html += '</details>';
    });
    const connCount = (window._epPendingConnectors || []).length;
    html += `<div style="font-size:11px; color:#888; margin:6px 0 2px;">🔌 ${_en ? 'Pin map extracted' : '추출된 핀맵'}: ${connCount ? (connCount + (_en ? ' connector(s)' : '개 커넥터')) : (_en ? 'none' : '없음')}</div>`;
    preview.innerHTML = html;
    // 💡 [2026-08-27] 저장 버튼은 폼 맨 아래(스크롤 영역 안)에 있으면 항목이 많을 때 스크롤해야 보였다 —
    //    "저장 버튼이 사라진 것 같다"는 문의가 있어, 모달 하단 고정 푸터(ep-add-footer)로 옮겼다.
    const footer = document.getElementById('ep-add-footer');
    if (footer) footer.style.display = 'block';
};

window._epSaveNewItem = async function(type) {
    const _en = window._currentLang === 'en';
    const modelInput = document.getElementById('ep-form-model');
    const model = (modelInput ? modelInput.value : '').trim();
    if (!model) { alert(_en ? 'Please enter the library key.' : '라이브러리 키를 입력해주세요.'); if (modelInput) modelInput.focus(); return; }
    const specs = {};
    document.querySelectorAll('#ep-add-preview [data-ep-field]').forEach(function(inp) { specs[inp.dataset.epField] = inp.value; });
    const entry = { model: model, specs: specs, connectors: window._epPendingConnectors || [], images: (window._epPendingImages || []).filter(Boolean) };
    const originalModel = window._epEditingOriginalModel;
    window._epEditingOriginalModel = null;
    const isRename = !!(originalModel && originalModel !== model);

    const ok = await window.upsertElecPartLibraryEntry(type, entry);
    if (!ok) return;
    if (isRename) await window._epLibRemoveEntry(type, originalModel);

    window.tabData = window.tabData || {};
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare[type] = window.tabData.elecCompare[type] || { selectedModels: [], notes: {} };
    const sel = window.tabData.elecCompare[type].selectedModels;
    if (isRename) {
        const idx = sel.indexOf(originalModel);
        if (idx !== -1) sel[idx] = model; else if (sel.indexOf(model) === -1 && sel.length < 10) sel.push(model);
        window.epLogChange(type, originalModel, _en ? 'Library key' : '라이브러리 키', originalModel, model);
    } else if (sel.indexOf(model) === -1) {
        if (sel.length >= 10) {
            alert(_en ? 'This project already has 10 items in the comparison table (maximum). It was saved to the library, but not added here — remove one first.' : '이미 이 프로젝트의 비교표에 10개(최대)가 있습니다. 라이브러리엔 저장됐지만 여기엔 추가되지 않았습니다 — 하나를 먼저 제거해주세요.');
        } else {
            sel.push(model);
            window.epLogChange(type, model, _en ? 'Comparison table' : '비교표', '-', _en ? 'Added' : '추가');
        }
    }
    const modal = document.getElementById('ep-add-modal'); if (modal) modal.style.display = 'none';
    window.renderElecCompareTab(type);
    if (window.showToast) window.showToast((_en ? '✅ Saved: ' : '✅ 저장 완료: ') + model, 'info');
};

// ─── 🔌 핀맵 보기 모달 (읽기전용) ───
window.showElecPinMapModal = async function(type, model) {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('ep-pinmap-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ep-pinmap-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ep-pinmap-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:280px;">
            <div id="ep-pinmap-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="ep-pinmap-title">🔌 ${_en ? 'Pin Map' : '핀맵'}</span>
                <button onclick="document.getElementById('ep-pinmap-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div id="ep-pinmap-body" style="padding:12px 16px; flex:1; overflow-y:auto; font-size:12px;"></div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ep-pinmap-box', 'ep-pinmap-drag');
        window._bindClickToFront('ep-pinmap-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    window.bringModalToFront('ep-pinmap-modal');
    const bodyEl = document.getElementById('ep-pinmap-body');
    bodyEl.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">${_en ? 'Loading…' : '불러오는 중...'}</div>`;
    const lib = window._epLibCache[type] || await window.loadElecPartLibrary(type);
    const entry = window.findElecPartInLibrary(lib, model);
    const titleEl = document.getElementById('ep-pinmap-title');
    if (titleEl) titleEl.textContent = '🔌 ' + escapeHtml((entry && window._epPartNameOf(entry.specs)) || model);
    const connectors = (entry && Array.isArray(entry.connectors)) ? entry.connectors : [];
    if (!connectors.length) {
        bodyEl.innerHTML = `<div style="color:#888; padding:10px 0;">${_en ? 'No pin map extracted for this item.' : '이 항목에서 추출된 핀맵이 없습니다.'}</div>`;
        return;
    }
    let html = '';
    connectors.forEach(function(conn) {
        html += `<div style="font-weight:bold; color:#2c5f8a; margin:10px 0 4px;">${escapeHtml(conn.name || '')} ${conn.role ? '· ' + escapeHtml(conn.role) : ''} ${conn.model ? '<span style="color:#888; font-weight:normal;">(' + escapeHtml(conn.model) + ')</span>' : ''}</div>`;
        html += `<table style="width:100%; border-collapse:collapse; font-size:11.5px;"><thead><tr>
            <th style="border:1px solid #e9ecef; padding:3px 6px; background:#f4f6f8;">PIN NO.</th>
            <th style="border:1px solid #e9ecef; padding:3px 6px; background:#f4f6f8;">Symbol</th>
            <th style="border:1px solid #e9ecef; padding:3px 6px; background:#f4f6f8;">Description</th>
            </tr></thead><tbody>`;
        (conn.pins || []).forEach(function(p) {
            html += `<tr><td style="border:1px solid #e9ecef; padding:3px 6px; text-align:center;">${escapeHtml(p.no || '')}</td>
                <td style="border:1px solid #e9ecef; padding:3px 6px; text-align:center;">${escapeHtml(p.symbol || '')}</td>
                <td style="border:1px solid #e9ecef; padding:3px 6px;">${escapeHtml(p.desc || '')}</td></tr>`;
        });
        html += '</tbody></table>';
    });
    bodyEl.innerHTML = html;
};

// ─── Summary 주요자재 CONVERTER 행 🔎 버튼 → 전기부품 스펙 미리보기 모달 (showPanelSpecModal과 동일 패턴) ───
// 💡 [2026-09-01 신규] codeHint(ktk pn) — 검색에만 쓰고, "찾지 못했을 때"의 표시/재추출용 식별자로만
//    보조적으로 쓴다(찾았을 때의 비교표 등록/핀맵 등은 이미 entry.model을 쓰고 있어서 그대로 안전함).
window.showElecPartSpecModal = async function(type, model, codeHint) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    let modal = document.getElementById('ep-spec-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ep-spec-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ep-spec-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:300px;">
            <div id="ep-spec-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="ep-spec-title">⚡ ${_en ? 'Elec Part Spec' : '전기부품 스펙'}</span>
                <button onclick="document.getElementById('ep-spec-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div id="ep-spec-body" style="padding:12px 16px; flex:1; overflow-y:auto; font-size:12px;"></div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ep-spec-box', 'ep-spec-drag');
        window._bindClickToFront('ep-spec-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    window.bringModalToFront('ep-spec-modal');
    const titleEl = document.getElementById('ep-spec-title');
    if (titleEl) titleEl.textContent = cfg.icon + ' ' + cfg.label + ' ' + (_en ? 'Spec' : '스펙');
    const bodyEl = document.getElementById('ep-spec-body');
    bodyEl.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">${_en ? 'Loading…' : '불러오는 중...'}</div>`;
    const lib = await window.loadElecPartLibrary(type);
    window._epLibCache[type] = lib;
    // 💡 ktk pn(codeHint)이 있으면 "코드_이름"으로 합쳐서 검색 — findElecPartInLibrary도 PANEL과 동일하게
    //    _epFlexibleFind로 코드/이름을 분리 대조하므로 이 조합만으로 ktk pn도 검색 근거가 된다.
    const searchQuery = codeHint ? (codeHint + (model ? '_' + model : '')) : model;
    const entry = searchQuery ? window.findElecPartInLibrary(lib, searchQuery) : null;
    const model_display = model || codeHint || '';
    if (!entry) {
        // 💡 Panel Compare의 showPanelSpecModal과 동일한 자리 — 값이 비어있든(설명 미입력) 라이브러리에
        //    없는 값이든, 여기선 똑같이 "붙여넣어 AI로 추출" 흐름(elecCompareReextract)으로 이어준다.
        bodyEl.innerHTML = `
            <div style="font-size:13px; font-weight:bold; margin-bottom:8px;">${model_display ? escapeHtml(model_display) : (_en ? '(No description entered)' : '(설명 미입력)')}</div>
            <div style="color:#888; margin-bottom:14px;">${model_display
                ? (_en ? `No spec has been extracted for "${model_display}" yet.` : `"${model_display}"의 스펙이 아직 추출되지 않았습니다.`)
                : (_en ? 'Not extracted yet — search the library or extract a new one below.' : '아직 추출된 스펙이 없습니다 — 아래에서 라이브러리를 검색하거나 새로 추출하세요.')}</div>
            <button onclick="document.getElementById('ep-spec-modal').style.display='none'; window.elecCompareReextract(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(model_display))});" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:8px 14px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">🤖 ${_en ? 'Paste spec text & extract with AI' : '스펙 텍스트 붙여넣고 AI로 추출'}</button>
        `;
        return;
    }
    const ec = (window.tabData && window.tabData.elecCompare && window.tabData.elecCompare[type]) || { selectedModels: [] };
    const inCompare = (ec.selectedModels || []).indexOf(entry.model) !== -1;
    const partName = window._epPartNameOf(entry.specs) || entry.model;
    const brand = (entry.specs && entry.specs['Brand'] && entry.specs['Brand'] !== '-') ? entry.specs['Brand'] : '';
    let html = `<div style="font-size:13px; font-weight:bold; margin-bottom:2px;">${escapeHtml(partName)}</div>
        <div style="color:#888; margin-bottom:8px;">${escapeHtml(brand)}</div>`;
    if (Array.isArray(entry.images) && entry.images.length && entry.images[0] && entry.images[0].data) {
        html += `<img src="${entry.images[0].data}" style="max-width:160px; max-height:110px; border:1px solid #ced4da; border-radius:4px; margin-bottom:8px; display:block; object-fit:cover;">`;
    }
    html += `<div style="margin:10px 0;">
            ${inCompare
                ? `<span style="color:#2f9e44; font-weight:bold;">✓ ${_en ? 'Already in this project\'s comparison table' : '이 프로젝트 비교표에 있음'}</span>`
                : `<button onclick="window.elecCompareAddFromLibrary(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(entry.model))}); document.getElementById('ep-spec-modal').style.display='none';" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">➕ ${_en ? 'Add to comparison table' : '비교표에 추가'}</button>`}
        </div>
        <div style="font-size:10px; color:#aaa; margin-bottom:8px;">${_en ? 'Updated' : '갱신'}: ${escapeHtml(entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '-')}</div>`;
    (cfg.schema || []).forEach(function(sec) {
        let secHtml = '';
        sec.fields.forEach(function(f) {
            const label = f[0];
            const v = (entry.specs && entry.specs[label] != null && entry.specs[label] !== '') ? entry.specs[label] : '-';
            if (v === '-') return; // 미리보기는 값이 있는 항목만 (한눈에 보기 편하게)
            secHtml += `<div style="display:flex; gap:6px; padding:2px 0;"><span style="flex:0 0 170px; color:#777;">${escapeHtml(label)}</span><span style="flex:1;">${escapeHtml(String(v))}</span></div>`;
        });
        if (secHtml) html += `<div style="font-weight:bold; color:#7a5210; margin-top:8px; padding:3px 0; border-top:1px solid #eee;">[${escapeHtml(sec.section)}]</div>` + secHtml;
    });
    if (Array.isArray(entry.connectors) && entry.connectors.length) {
        html += `<div style="margin-top:10px;"><button onclick="window.showElecPinMapModal(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(entry.model))})" class="ep-theme-hover-btn" style="padding:5px 10px; background:#e8f4fd; border:1px solid #a5c8f0; color:#1a4f7a; border-radius:5px; cursor:pointer; font-size:11.5px; transition:background .15s, border-color .15s;">🔌 ${_en ? 'View pin map' : '핀맵 보기'}</button></div>`;
    }
    bodyEl.innerHTML = html;
};

// 💡 비교표 헤더/핀맵 버튼 — 표가 innerHTML로 통째로 다시 그려지므로 전역 위임 클릭으로 한 번만 바인딩.
document.addEventListener('click', function(e) {
    const rm = e.target.closest('[data-ep-remove]');
    if (rm) { const parts = rm.dataset.epRemove.split('|'); window.elecCompareRemove(parts[0], parts.slice(1).join('|')); return; }
    const re = e.target.closest('[data-ep-reextract]');
    if (re) { const parts = re.dataset.epReextract.split('|'); window.elecCompareReextract(parts[0], parts.slice(1).join('|')); return; }
    const ed = e.target.closest('[data-ep-edit]');
    if (ed) { const parts = ed.dataset.epEdit.split('|'); window.elecCompareOpenEditModal(parts[0], parts.slice(1).join('|')); return; }
    const pm = e.target.closest('[data-ep-pinmap]');
    if (pm) { const parts = pm.dataset.epPinmap.split('|'); window.showElecPinMapModal(parts[0], parts.slice(1).join('|')); return; }
});

// ── Elec Parts 탭 변경이력 (토글/기록/렌더링/삭제) — Panel Compare와 동일 패턴, type별로 기록 ──
window.epToggleHistoryBox = function(type) {
    const body = document.getElementById('ep-' + type + '-history-body');
    const icon = document.getElementById('ep-' + type + '-history-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
    if (!isOpen) window.epRenderHistoryTable(type);
};
window.epLogChange = function(type, rowLabel, field, oldVal, newVal) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.elecCompareChangeLog = window.tabData.elecCompareChangeLog || {};
    window.tabData.elecCompareChangeLog[type] = window.tabData.elecCompareChangeLog[type] || [];
    window.tabData.elecCompareChangeLog[type].push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal
    });
};
window.epRenderHistoryTable = function(type) {
    const table = document.getElementById('ep-' + type + '-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.elecCompareChangeLog && window.tabData.elecCompareChangeLog[type]) || [];
    const _hisEn = window._currentLang === 'en';
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">' + (_hisEn ? 'No change history.' : '수정 이력이 없습니다.') + '</td></tr>'; return; }
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Item / Field' : '항목') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Field' : '필드') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Before' : '변경 전') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'After' : '변경 후') + '</th>'
        + '</tr></thead><tbody>';
    logs.slice().reverse().forEach(function(log) {
        html += '<tr><td style="padding:4px 8px; color:#6c757d;">' + log.time + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold; color:#0056b3;">' + (log.userName || (_hisEn ? 'Unknown' : '알 수 없음')) + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold;">' + (log.row || '') + '</td>'
            + '<td style="padding:4px 8px;"><span class="badge" style="background:#e7f1ff; color:#0056b3;">' + (log.field || '') + '</span></td>'
            + '<td style="padding:4px 8px; color:#c92a2a;">' + (log.oldVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#2f9e44;">' + (log.newVal || '-') + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
};
window.deleteEpHistoryByDateRange = function(type) {
    const pwEl = document.getElementById('ep-' + type + '-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) { if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.'); return; }
    const fromStr = (document.getElementById('ep-' + type + '-history-del-from') || {}).value;
    const toStr = (document.getElementById('ep-' + type + '-history-del-to') || {}).value;
    if (!fromStr || !toStr) { if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.'); return; }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) { if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.'); return; }
    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) { const ts = parseKoDateTime(log.time); return ts !== null && ts >= fromTs && ts <= toTs; };
    const doDelete = function() {
        let removedCount = 0;
        const logs = window.tabData && window.tabData.elecCompareChangeLog && window.tabData.elecCompareChangeLog[type];
        if (logs && logs.length) {
            const before = logs.length;
            window.tabData.elecCompareChangeLog[type] = logs.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.elecCompareChangeLog[type].length;
        }
        if (pwEl) pwEl.value = '';
        window.epRenderHistoryTable(type);
        const msg = removedCount + '건의 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };
    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

// ── 엑셀로 내보내기 (Panel Compare의 exportPanelCompareToExcel과 동일 패턴) ──
window.exportElecCompareToExcel = async function(type) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    const ec = (window.tabData && window.tabData.elecCompare && window.tabData.elecCompare[type]) || { selectedModels: [] };
    const models = (ec.selectedModels || []).slice(0, 10);
    if (!models.length) { alert(_en ? 'No items in the comparison table yet.' : '비교표에 항목이 없습니다.'); return; }
    const lib = await window.loadElecPartLibrary(type);
    const entries = models.map(function(m) { return window.findElecPartInLibrary(lib, m); });
    const notes = ec.notes || {};

    const aoa = [];
    aoa.push(['Comparison table'].concat(models).concat(['Note']));
    (cfg.schema || []).forEach(function(sec) {
        aoa.push(['[' + sec.section + ']'].concat(models.map(function() { return ''; })).concat(['']));
        sec.fields.forEach(function(f) {
            const label = f[0];
            const row = [label];
            entries.forEach(function(entry) {
                const v = (entry && entry.specs && entry.specs[label] != null && entry.specs[label] !== '') ? entry.specs[label] : '-';
                row.push(String(v));
            });
            row.push(notes[label] || '');
            aoa.push(row);
        });
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 26 }].concat(models.map(function() { return { wch: 22 }; })).concat([{ wch: 24 }]);

    const sectionRowIdx = [];
    let rPtr = 1;
    (cfg.schema || []).forEach(function(sec) { sectionRowIdx.push(rPtr); rPtr += 1 + sec.fields.length; });

    const range = XLSX.utils.decode_range(ws['!ref']);
    const thinBorder = { style: 'thin', color: { rgb: 'DDDDDD' } };
    for (let ri = 0; ri <= range.e.r; ri++) {
        const isHeader = ri === 0;
        const isSection = sectionRowIdx.indexOf(ri) !== -1;
        for (let ci = 0; ci <= range.e.c; ci++) {
            const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
            if (!cell) continue;
            cell.s = {
                font: { name: '맑은 고딕', sz: 10, bold: isHeader || isSection, color: { rgb: isSection ? '7A5210' : (isHeader ? '333333' : '1F2937') } },
                fill: isSection ? { patternType: 'solid', fgColor: { rgb: 'FFF8E6' } } : (isHeader ? { patternType: 'solid', fgColor: { rgb: window._cpXlsxRole('headerTint') } } : undefined),
                alignment: { vertical: 'center', horizontal: ci === 0 ? 'left' : 'center', wrapText: true },
                border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
            };
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.label.substring(0, 28));
    const fileName = (window.driveSaveFilenameStr || window.exportFilenameStr || cfg.label) + '_' + cfg.label + '_비교표.xlsx';
    XLSX.writeFile(wb, fileName);
};

// ── Summary 탭 변경이력 (토글/기록/렌더링/삭제) — Brief SPEC/M.C Table과 동일 패턴 ──
window.sumToggleHistoryBox = function() {
    const body = document.getElementById('sum-history-body');
    const icon = document.getElementById('sum-history-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
    if (!isOpen && window.sumRenderHistoryTable) window.sumRenderHistoryTable();
};

window.sumLogChange = function(rowLabel, field, oldVal, newVal) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.sumChangeLog = window.tabData.sumChangeLog || [];
    window.tabData.sumChangeLog.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal
    });
};

window.sumRenderHistoryTable = function() {
    const table = document.getElementById('sum-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.sumChangeLog) || [];
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">' + (window._currentLang === 'en' ? 'No change history.' : '수정 이력이 없습니다.') + '</td></tr>'; return; }
    const _hisEn = window._currentLang === 'en';
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Item' : '항목') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Field' : '필드') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Before' : '변경 전') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'After' : '변경 후') + '</th>'
        + '</tr></thead><tbody>';
    logs.slice().reverse().forEach(function(log) {
        html += '<tr><td style="padding:4px 8px; color:#6c757d;">' + log.time + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold; color:#0056b3;">' + (log.userName || (_hisEn ? 'Unknown' : '알 수 없음')) + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold;">' + (log.row || '') + '</td>'
            + '<td style="padding:4px 8px;"><span class="badge" style="background:#e7f1ff; color:#0056b3;">' + (log.field || '') + '</span></td>'
            + '<td style="padding:4px 8px; color:#c92a2a;">' + (log.oldVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#2f9e44;">' + (log.newVal || '-') + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
};

window.deleteSumHistoryByDateRange = function() {
    const pwEl = document.getElementById('sum-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) { if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.'); return; }
    const fromStr = (document.getElementById('sum-history-del-from') || {}).value;
    const toStr = (document.getElementById('sum-history-del-to') || {}).value;
    if (!fromStr || !toStr) { if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.'); return; }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) { if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.'); return; }
    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) { const ts = parseKoDateTime(log.time); return ts !== null && ts >= fromTs && ts <= toTs; };
    const doDelete = function() {
        let removedCount = 0;
        if (window.tabData && window.tabData.sumChangeLog && window.tabData.sumChangeLog.length) {
            const before = window.tabData.sumChangeLog.length;
            window.tabData.sumChangeLog = window.tabData.sumChangeLog.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.sumChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        if (window.sumRenderHistoryTable) window.sumRenderHistoryTable();
        const msg = removedCount + '건의 Summary 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };
    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 Summary 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

// 💡 Summary 입력칸 변경 감지 (탭 전체에 이벤트 위임 — 필드별 data-field 구조가 제각각이라 유형별로 라벨을 찾아냄)
(function() {
    const wrap = document.getElementById('tab-summary');
    if (!wrap) return;

    const findFieldLabel = function(el) {
        // 1) 마일스톤 표 (data-stage 보유)
        if (el.dataset && el.dataset.stage) {
            const rowType = el.closest('#sum-milestone-body-actual') ? '실적' : '계획';
            return { row: el.dataset.stage, field: rowType };
        }
        // 2) 멤버-3 (자유 추가, data-idx + data-field 보유)
        if (el.dataset && el.dataset.idx !== undefined && el.dataset.field) {
            const group = el.closest('.concept-grid') || el.parentElement;
            const roleInput = group ? group.querySelector('[data-idx="' + el.dataset.idx + '"][data-field="role"]') : null;
            const roleName = (roleInput && roleInput.value) ? roleInput.value : ('인원 ' + (Number(el.dataset.idx) + 1));
            const fieldLabel = { role: '역할', name: '이름', email: '이메일' }[el.dataset.field] || el.dataset.field;
            return { row: roleName, field: fieldLabel };
        }
        // 3) 멤버-1/2 (고정 3열: 역할라벨 input / 이름 input / 이메일 input)
        const memGrid = el.closest('.concept-grid-mem');
        if (memGrid) {
            const children = Array.prototype.filter.call(memGrid.children, function(c) { return c.tagName === 'INPUT'; });
            const idx = children.indexOf(el);
            if (idx !== -1) {
                const groupStart = Math.floor(idx / 3) * 3;
                const roleInput = children[groupStart];
                const roleName = (roleInput && roleInput.value) ? roleInput.value : '담당자';
                const fieldLabel = idx % 3 === 0 ? '역할명' : (idx % 3 === 1 ? '이름' : '이메일');
                return { row: roleName, field: fieldLabel };
            }
        }
        // 4) 일반 <label> 형제가 있는 입력칸
        const prev = el.previousElementSibling;
        if (prev && prev.tagName === 'LABEL') {
            const section = el.closest('.concept-section');
            const h3 = section ? section.querySelector('h3') : null;
            return { row: h3 ? h3.textContent.trim() : '프로젝트 개요', field: prev.textContent.trim() };
        }
        // 5) 그 외 (예: 추진 배경 textarea) — 가장 가까운 h3를 항목명으로 사용
        const section2 = el.closest('.concept-section');
        const h3b = section2 ? section2.querySelector('h3') : null;
        return { row: h3b ? h3b.textContent.trim() : 'Summary', field: el.id || '내용' };
    };

    wrap.addEventListener('focusin', function(e) {
        const el = e.target;
        if (!el.matches || !el.matches('input[type="text"], input[type="email"], textarea')) return;
        el.dataset._histOld = el.value;
    });
    wrap.addEventListener('change', function(e) {
        const el = e.target;
        if (!el.matches || !el.matches('input[type="text"], input[type="email"], textarea')) return;
        const oldVal = el.dataset._histOld !== undefined ? el.dataset._histOld : '';
        if (String(oldVal) === String(el.value)) return;
        const info = findFieldLabel(el);
        window.sumLogChange(info.row, info.field, oldVal, el.value);
        el.dataset._histOld = el.value;
    });
})();

// =========================================================
// 🪪 Address Book — CRUD, 다중선택, 정렬
// =========================================================
window._addrSelectedRows = new Set();
window._addrLastClickedIdx = null;

window.renderAddressTable = function() {
    const tbody = document.getElementById('address-table-body');
    if (!tbody) return;
    window.tabData = window.tabData || {};
    let rows = window.tabData.addressBook || [];
    if (!rows.length) rows = [{ name: '', nameEn: '', dept: '', title: '', email: '', mobile: '', phone: '' }]; // bm 팝업 재오픈용 최소 1행 유지

    tbody.innerHTML = rows.map(function(p) {
        return '<tr>'
            + '<td class="bm-no"></td>'
            + '<td><input class="u-input" data-field="name" value="' + _escTabVal(p.name) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="nameEn" value="' + _escTabVal(p.nameEn) + '" placeholder="예: Hong Gildong" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="dept" value="' + _escTabVal(p.dept) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="title" value="' + _escTabVal(p.title) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="email" value="' + _escTabVal(p.email) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="mobile" value="' + _escTabVal(p.mobile) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="phone" value="' + _escTabVal(p.phone) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="telegramId" value="' + _escTabVal(p.telegramId) + '" placeholder="예: 987654321" onchange="window.collectAddressData()"></td>'
            + '</tr>';
    }).join('');

    if (window.bmSetupAllRows) window.bmSetupAllRows('addr');
    window.filterAddressRows(window._addrSearchTerm || ''); // 💡 재렌더(정렬/불러오기 등) 후에도 검색어 유지
};

// 💡 [주소록 검색] 행을 실제로 지우면 collectAddressData()가 "지금 DOM에 보이는 행"만으로
//    addressBook을 통째로 재구성하기 때문에, 검색으로 안 보이는 사람이 저장 시 사라지는 대형 사고가 남 —
//    그래서 필터는 DOM에서 지우지 않고 display:none으로만 숨김(데이터는 항상 그대로 유지)
window._addrSearchTerm = '';
window.filterAddressRows = function(term) {
    window._addrSearchTerm = term || '';
    const q = window._addrSearchTerm.trim().toLowerCase();
    const rows = document.querySelectorAll('#address-table-body tr');
    let shown = 0;
    rows.forEach(function(tr) {
        if (!q) { tr.style.display = ''; shown++; return; }
        const haystack = Array.from(tr.querySelectorAll('input.u-input'))
            .map(function(el) { return el.value || ''; })
            .join(' ')
            .toLowerCase();
        const match = haystack.includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) shown++;
    });
    const countEl = document.getElementById('addr-search-count');
    if (countEl) countEl.textContent = q ? `${shown} / ${rows.length}명` : '';
    const clearEl = document.getElementById('addr-search-clear');
    if (clearEl) clearEl.style.display = q ? 'inline' : 'none';
};

// 💡 [2026-08-30 수정] dir 파라미터 추가(오름차순/내림차순) — 예전엔 "이름순"/"부서순" 버튼 전용으로
// 항상 오름차순만 지원했는데, 이제 표 헤더 클릭 정렬(sortAddressByHeader)이 이 함수를 재사용하면서
// 같은 열을 다시 클릭하면 내림차순으로 뒤집을 수 있어야 해서 방향을 받도록 확장했다.
window.sortAddressBy = function(field, dir) {
    window.collectAddressData();
    const mul = dir === 'desc' ? -1 : 1;
    window.tabData.addressBook.sort(function(a, b) { return mul * String(a[field] || '').localeCompare(String(b[field] || ''), 'ko'); });
    window._bmSelected.addr.clear();
    window._bmAnchor.addr = null;
    window.renderAddressTable();
};

// 💡 [2026-08-30 신규] Address 표 헤더 클릭 정렬 — "🔤 이름순"/"🏢 부서순" 버튼을 없애는 대신, 정렬
// 가능한 모든 열(이름/영문 이름/부서/직함/이메일/휴대폰/근무처 전화/텔레그램 ID) 헤더 자체를 누르면
// 그 열 기준으로 정렬되고, 같은 열을 다시 누르면 오름차순↔내림차순이 토글되도록 한다(엑셀/구글시트
// 표 헤더 정렬과 동일한 관례). 현재 정렬 기준 열에는 헤더에 ▲/▼ 표시를 붙여 어떤 상태인지 보여준다.
window._addrSortState = { field: null, dir: 'asc' };
window.sortAddressByHeader = function(field) {
    if (window._addrSortState.field === field) {
        window._addrSortState.dir = window._addrSortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
        window._addrSortState.field = field;
        window._addrSortState.dir = 'asc';
    }
    window.sortAddressBy(field, window._addrSortState.dir);
    window._updateAddrSortHeaderUI();
};
window._updateAddrSortHeaderUI = function() {
    document.querySelectorAll('#tab-address thead th[data-sort-field]').forEach(function(th) {
        const indicator = th.querySelector('.addr-sort-indicator');
        if (!indicator) return;
        indicator.textContent = (th.dataset.sortField === window._addrSortState.field)
            ? (window._addrSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
    });
};

// 🪪 공용 주소록(Address Book) — 프로젝트와 무관하게 팀 전체가 공유하는 단일 소스
window.AddressBook = {
    KEY: 'gantt_address_book_shared',
    FILE_NAME: 'AddressBook_Shared.json',
    _driveFileId: null,
    _syncTimer: null,
    // 💡 [2026-08-24 사고 방지] 마지막으로 Drive에서 확인된(=진짜 존재가 확인된) "내용이 채워진" 인원 수.
    //    프로젝트 자동저장(collectTabData)이 Address 탭을 보지도 않은 채 collectAddressData()를 얼결에
    //    호출해서, 아직 Drive에서 못 받아온 빈/오래된 로컬 캐시로 팀 공용 주소록 전체를 덮어쓰는 사고가
    //    실제로 발생했음(365명 → 빈 배열로 반복 붕괴). syncToDrive()에서 이 값과 비교해 스킵 여부를 판단.
    _lastKnownServerCount: 0,
    // 💡 [2026-08-24 낙관적 동시성 제어] 내가 마지막으로 Drive에서 읽었던 savedAt. 저장 직전 Drive의
    //    "지금" savedAt과 비교해서, 그 사이 다른 팀원이 먼저 저장했다면(=savedAt이 달라졌다면) 내
    //    오래된 로컬본으로 그 사람의 최신 수정을 덮어쓰지 않고 저장을 중단 + 최신본을 다시 받아온다.
    _lastKnownSavedAt: null,
    _meaningfulCount: function(list) {
        return (list || []).filter(function(p) { return p && (String(p.name||'').trim() || String(p.email||'').trim()); }).length;
    },
    load: function() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch(e) { return []; }
    },
    save: function(list, skipSync) {
        localStorage.setItem(this.KEY, JSON.stringify(list));
        if (!skipSync) this.scheduleDriveSync(list);
    },
    scheduleDriveSync: function(list) {
        const self = this;
        if (self._syncTimer) clearTimeout(self._syncTimer);
        self._syncTimer = setTimeout(function() { self.syncToDrive(list); }, 3000);
    },
    syncToDrive: async function(list) {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return; // 비로그인: localStorage 단독 동작
        // 💡 [사고 방지 가드] 이전에 Drive에서 5명 넘게 확인된 적이 있는데, 지금 올리려는 목록엔
        //    이름/이메일이 채워진 사람이 한 명도 없다면 → 실수로 빈 상태를 덮어쓰려는 상황일 가능성이
        //    매우 높으므로 동기화를 건너뛴다. 정상적으로 소수 인원만 쓰는 팀은 5명 미만이라 이 가드에
        //    걸리지 않고, 의도적으로 많은 인원을 정리해서 줄이는 경우도 "채워진 사람 0명"이 아니면 통과함.
        const meaningful = this._meaningfulCount(list);
        if (this._lastKnownServerCount > 5 && meaningful === 0) {
            console.warn(`[AddressBook 안전장치] Drive 동기화 스킵 — 이전엔 ${this._lastKnownServerCount}명이 있었는데 지금 수집된 목록은 전부 빈 값입니다. 실수로 덮어쓰는 사고를 막기 위해 건너뜁니다.`);
            return;
        }
        try {
            const folderId = await window.getOrCreateConfigFolder(token);
            if (!this._driveFileId) this._driveFileId = await window._findOrMigrateFile(token, this.FILE_NAME, folderId);

            // 💡 [낙관적 동시성 제어] 파일이 이미 있고(=신규 생성이 아니고) 내가 이전에 읽어둔 savedAt이
            //    있다면, 쓰기 직전 Drive의 "지금" savedAt을 한 번 더 확인한다. 그 사이 달라졌다면 —
            //    다른 사람이 나보다 먼저 저장한 것 — 내 오래된 로컬본으로 그 수정을 덮어쓰지 않고 중단한다.
            if (this._driveFileId && this._lastKnownSavedAt) {
                try {
                    const checkResp = await gapi.client.drive.files.get({ fileId: this._driveFileId, alt: 'media', supportsAllDrives: true });
                    const currentSavedAt = checkResp.result && checkResp.result.savedAt;
                    if (currentSavedAt && currentSavedAt !== this._lastKnownSavedAt) {
                        console.warn(`[AddressBook 안전장치] Drive 동기화 중단 — 다른 팀원이 ${currentSavedAt}에 이미 저장했습니다(내가 마지막으로 본 건 ${this._lastKnownSavedAt}). 내 화면의 오래된 내용으로 덮어쓰지 않고, 최신본을 다시 불러옵니다.`);
                        if (window.showToast) window.showToast('⚠️ 주소록이 다른 팀원에 의해 방금 업데이트되어 저장을 건너뛰고 최신본을 다시 불러왔습니다. 방금 변경사항은 다시 입력해주세요.', 'warning', 6000);
                        const fresh = await this.loadFromDrive();
                        if (fresh) { window.tabData = window.tabData || {}; window.tabData.addressBook = fresh; if (window.renderAddressTable) window.renderAddressTable(); }
                        return;
                    }
                } catch(checkErr) { console.warn('AddressBook 동시성 확인 실패(그냥 진행):', checkErr.message); }
            }

            const boundary = 'addr_sync_boundary';
            const metadata = { name: this.FILE_NAME, mimeType: 'application/json' };
            if (!this._driveFileId) metadata.parents = [folderId];
            const newSavedAt = new Date().toISOString();
            const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ addressBook: list, savedAt: newSavedAt }) + "\r\n--" + boundary + "--";
            const url = 'https://www.googleapis.com/upload/drive/v3/files' + (this._driveFileId ? '/' + this._driveFileId : '') + '?uploadType=multipart&supportsAllDrives=true';
            const resp = await fetch(url, { method: this._driveFileId ? 'PATCH' : 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, body: body });
            const file = await resp.json();
            if (file && file.id) this._driveFileId = file.id;
            if (resp.ok) {
                this._lastKnownServerCount = meaningful; // 성공적으로 반영된 값으로 기준선 갱신
                this._lastKnownSavedAt = newSavedAt;      // 내가 방금 쓴 시각을 새 기준선으로 기록
            }
        } catch(e) { console.warn('AddressBook Drive 동기화 실패:', e.message); }
    },
    loadFromDrive: async function() {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return null; // 비로그인: 로컬 캐시만 사용
        try {
            const folderId = await window.getOrCreateConfigFolder(token);
            if (!this._driveFileId) this._driveFileId = await window._findOrMigrateFile(token, this.FILE_NAME, folderId);
            if (!this._driveFileId) return null;
            const response = await gapi.client.drive.files.get({ fileId: this._driveFileId, alt: 'media', supportsAllDrives: true });
            const data = response.result;
            const list = (data && data.addressBook) || [];
            this._lastKnownServerCount = Math.max(this._lastKnownServerCount, this._meaningfulCount(list)); // 💡 방금 Drive에서 실제로 확인한 인원 수를 기준선으로 기록
            if (data && data.savedAt) this._lastKnownSavedAt = data.savedAt; // 💡 낙관적 동시성 제어용 기준선도 함께 갱신
            this.save(list, true); // 로컬 캐시만 갱신 (방금 받은 걸 다시 올릴 필요 없음)
            return list;
        } catch(e) { console.warn('AddressBook Drive 조회 실패:', e.message); return null; }
    }
};

// 💡 [2026-08-24] skipDriveSync=true로 부르면 로컬 tabData(=프로젝트 자체 저장용 스냅샷)만 갱신하고
//    공용 Drive 주소록에는 밀어쓰지 않는다. 프로젝트 자동저장(collectTabData)이 Address 탭을 보지도
//    않은 채 이 함수를 얼결에 호출해서, 아직 못 받아온 오래된/빈 로컬 캐시로 팀 공용 주소록 전체를
//    덮어쓰는 사고가 실제로 있었음(365명 → 빈 배열 반복 붕괴). 실제 사용자가 Address 탭에서 직접
//    편집(onchange/정렬 등)할 때만 Drive까지 동기화하도록 분리 — 그 호출부들은 인자 없이(기본값 false) 부른다.
window.collectAddressData = function(skipDriveSync) {
    window.tabData = window.tabData || {};
    const rows = [];
    document.querySelectorAll('#address-table-body tr').forEach(function(tr) {
        const get = function(f) { const el = tr.querySelector('[data-field="' + f + '"]'); return el ? el.value : ''; };
        rows.push({ name: get('name'), nameEn: get('nameEn'), dept: get('dept'), title: get('title'), email: get('email'), mobile: get('mobile'), phone: get('phone'), telegramId: get('telegramId') });
    });
    window.tabData.addressBook = rows;
    window.AddressBook.save(rows, skipDriveSync); // 💡 프로젝트와 무관한 공용 저장소에도 반영 (3초 디바운스 후 Drive 동기화) — skipDriveSync면 로컬 캐시만
};

// =========================================================
// 🪪 Address Book — 엑셀/CSV 불러오기 · 내보내기
// =========================================================
// 💡 공용 파싱 로직 — 로컬 파일이든 구글 드라이브에서 받아온 버퍼든 동일하게 처리
window._applyAddressWorkbookBuffer = function(arrayBuffer, sourceLabel) {
    try {
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const pick = function(row, keys) {
            for (const k of keys) { if (row[k] !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim(); }
            return '';
        };
        const list = json.map(function(row) {
            const first = pick(row, ['이름', '성명', 'Name']);
            const last  = pick(row, ['성']);
            return {
                name:  (last + first) || first,
                nameEn: pick(row, ['영문이름', '영문 이름', 'English Name', 'EnglishName', 'Name (English)']),
                dept:  pick(row, ['부서', 'Department']),
                title: pick(row, ['직함', '직책', 'Title']),
                email: pick(row, ['전자 메일 주소', '이메일', 'Email', 'E-mail']),
                mobile: pick(row, ['휴대폰', '휴대전화', 'Mobile']),
                phone: pick(row, ['근무처 전화', '회사 전화', 'Work Phone'])
            };
        }).filter(function(p) { return p.name; });

        window.tabData = window.tabData || {};
        window.tabData.addressBook = list;
        window._addrSelectedRows = new Set();
        window.renderAddressTable();
        alert('✅ ' + (sourceLabel || '파일') + '에서 주소록 ' + list.length + '명을 불러왔습니다.');
        return true;
    } catch (err) {
        alert('❌ 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
        return false;
    }
};

// ☁️ 구글 드라이브에 저장된 주소록 시트를 바로 불러오기 (기존 드라이브 연동 로그인 재사용)
window.importAddressFromDrive = async function() {
    const ADDR_SHEET_FILE_ID = '1jskqTXVOKCqXSXRqsv275OYQVQg6NyWD';

    const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
    if (!tokenObj) {
        alert('먼저 상단의 [🔵 드라이브 연동하기]로 구글 드라이브 로그인을 해주세요.\n로그인 후 이 버튼을 다시 눌러주세요.');
        return;
    }

    const curCount = (window.tabData && window.tabData.addressBook) ? window.tabData.addressBook.length : 0;
    if (!confirm('구글 드라이브의 주소록 시트로 현재 주소록(' + curCount + '명)을 전체 교체합니다.\n계속할까요?')) return;

    try {
        const url = 'https://www.googleapis.com/drive/v3/files/' + ADDR_SHEET_FILE_ID
    + '?alt=media&supportsAllDrives=true';
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + tokenObj.access_token } });
        if (!res.ok) {
            let detail = '';
            try { const errJson = await res.json(); detail = errJson?.error?.message || ''; } catch(e) {}
            throw new Error('HTTP ' + res.status + (detail ? ' - ' + detail : '') + ' (드라이브 파일 접근 권한을 확인해주세요)');
        }
        const buf = await res.arrayBuffer();
        window._applyAddressWorkbookBuffer(buf, '구글 드라이브 주소록');
    } catch (err) {
        alert('❌ 드라이브 파일을 불러오는 중 오류가 발생했습니다: ' + err.message);
    }
};


// =========================================================
// 🪪 이름 자동완성 — Address Book 기반, 부서/직함 표시 드롭다운
// =========================================================
function addrShowSuggestions(inputEl, query, emailEl, isMulti, onPick) {
    const dd = document.getElementById('addr-autocomplete-dropdown');
    if (!dd) return;
    dd._onPick = onPick || null;
    if (!query) { dd.style.display = 'none'; return; }
    const list = (window.tabData.addressBook || []).filter(function(p) {
        return p.name && p.name.indexOf(query) !== -1;
    }).slice(0, 8);
    if (!list.length) { dd.style.display = 'none'; return; }

    // 💡 [2026-08-27 신규] 키보드(↑/↓/Enter)로도 고를 수 있도록, 지금 목록/입력칸/현재 선택 위치를
    // dd 자신에 기록해둔다 — addrHandleAutocompleteKeydown이 이 상태만 보고 동작하므로, 마우스로
    // 열었든 어떤 자동완성 필드에서 열었든 동일하게 처리된다(입력필드마다 로직을 따로 안 둬도 됨).
    dd._list = list;
    dd._inputEl = inputEl;
    dd._emailEl = emailEl;
    dd._isMulti = isMulti;
    dd._activeIndex = 0;

    const rect = inputEl.getBoundingClientRect();
    dd.style.left  = (rect.left + window.scrollX) + 'px';
    dd.style.top   = (rect.bottom + window.scrollY + 2) + 'px';
    dd.style.width = Math.max(rect.width, 220) + 'px';
    dd.innerHTML = list.map(function(p, i) {
        return '<div class="addr-ac-item" data-i="' + i + '" style="padding:6px 10px; cursor:pointer; font-size:12.5px; border-bottom:1px solid #f0f0f0;">'
            + '<b>' + escapeHtml(p.name) + '</b> <span style="color:#888;">' + escapeHtml(p.dept || '') + (p.title ? (' · ' + escapeHtml(p.title)) : '') + '</span></div>';
    }).join('');
    Array.from(dd.querySelectorAll('.addr-ac-item')).forEach(function(el, i) {
        el.addEventListener('mousedown', function(ev) {
            ev.preventDefault(); // input blur보다 먼저 처리되도록
            addrApplyPick(inputEl, emailEl, isMulti, list[i]);
            if (dd._onPick) dd._onPick(list[i]);
            dd.style.display = 'none';
        });
        // 마우스로 올리면 그 항목이 곧 "현재 선택"이 되게(↑/↓로 움직인 것과 동일한 하이라이트 로직 재사용)
        el.addEventListener('mouseover', function() { addrSetActiveSuggestion(dd, i); });
    });
    dd.style.display = 'block';
    addrSetActiveSuggestion(dd, 0); // 기본은 맨 위 항목 하이라이트 — 바로 Enter만 눌러도 선택되게
}

// 💡 현재 하이라이트된 자동완성 항목을 옮기고 시각적으로 표시. 화살표 키/마우스 오버 둘 다 이걸 공유한다.
function addrSetActiveSuggestion(dd, idx) {
    const items = dd.querySelectorAll('.addr-ac-item');
    if (!items.length) return;
    dd._activeIndex = ((idx % items.length) + items.length) % items.length;
    items.forEach(function(el, i) { el.style.background = (i === dd._activeIndex) ? '#f0f6ff' : '#fff'; });
    const activeEl = items[dd._activeIndex];
    if (activeEl && activeEl.scrollIntoView) activeEl.scrollIntoView({ block: 'nearest' });
}

// 💡 [2026-08-27 신규] 이름 자동완성 입력칸 공통 키보드 처리 — ↓/↑로 후보 이동, Enter로 확정(마우스
// 클릭 없이도 등록됨), Esc로 닫기. attachAddressAutocomplete와 멤버-3 위임 핸들러 양쪽에서 재사용한다.
function addrHandleAutocompleteKeydown(e) {
    const dd = document.getElementById('addr-autocomplete-dropdown');
    if (!dd || dd.style.display === 'none' || !dd._list || !dd._list.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        addrSetActiveSuggestion(dd, dd._activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        addrSetActiveSuggestion(dd, dd._activeIndex - 1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const person = dd._list[dd._activeIndex] || dd._list[0];
        addrApplyPick(dd._inputEl, dd._emailEl, dd._isMulti, person);
        if (dd._onPick) dd._onPick(person);
        dd.style.display = 'none';
    } else if (e.key === 'Escape') {
        dd.style.display = 'none';
    }
}

function addrApplyPick(inputEl, emailEl, isMulti, person) {
    if (isMulti) {
        const parts = inputEl.value.split(',');
        parts[parts.length - 1] = person.name;
        inputEl.value = parts.map(function(s) { return s.trim(); }).filter(Boolean).join(',');
        if (emailEl && person.email) {
            const existing = (emailEl.value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
            if (existing.indexOf(person.email) === -1) existing.push(person.email);
            emailEl.value = existing.join(',');
        }
    } else {
        inputEl.value = person.name;
        if (emailEl && person.email) emailEl.value = person.email;
    }
    if (window.collectTabData) window.collectTabData();
}

// isMulti=true 이면 "조익현,조재준"처럼 콤마로 여러 명 입력 가능한 칸으로 취급(마지막 이름만 매칭/치환)
window.attachAddressAutocomplete = function(inputEl, emailEl, isMulti, onPick) {
    if (!inputEl) return;
    inputEl.addEventListener('input', function() {
        const val = inputEl.value;
        const query = isMulti ? val.split(',').pop().trim() : val.trim();
        addrShowSuggestions(inputEl, query, emailEl, !!isMulti, onPick);
    });
    // 💡 [2026-08-27 신규] 마우스 클릭 없이 ↓/↑로 후보를 고르고 Enter로 등록 — 이름 자동완성이 붙는
    // 모든 필드(멤버-1/2, 메일 수신인, 알람 참조인 등)가 attachAddressAutocomplete 하나를 거치므로 공통 적용됨.
    inputEl.addEventListener('keydown', addrHandleAutocompleteKeydown);
    inputEl.addEventListener('blur', function() {
        setTimeout(function() {
            const dd = document.getElementById('addr-autocomplete-dropdown');
            if (dd) dd.style.display = 'none';
        }, 150);
    });
};

// 🪪 멤버-1/2 (고정 10칸) — 콤마로 여러 명 입력 가능하므로 isMulti=true
[['sum-pm','sum-pm-email'], ['sum-mech','sum-mech-email'], ['sum-hw','sum-hw-email'],
 ['sum-fw','sum-fw-email'], ['sum-module','sum-module-email'],
 ['sum-tsp','sum-tsp-email'], ['sum-lcm','sum-lcm-email'], ['sum-slimming','sum-slimming-email'],
 ['sum-cutting','sum-cutting-email'], ['sum-tooling','sum-tooling-email']
].forEach(function(pair) {
    const nameEl  = document.getElementById(pair[0]);
    const emailEl = document.getElementById(pair[1]);
    if (nameEl) window.attachAddressAutocomplete(nameEl, emailEl, true);
});

// 🪪 멤버-3 (자유 추가, 2열 구조 — 두 컬럼 각각에 이벤트 위임 연결)
(function() {
    function bindMember3Autocomplete(id) {
        const wrap = document.getElementById(id);
        if (!wrap) return;
        wrap.addEventListener('input', function(e) {
            if (!e.target.matches('[data-field="name"]')) return;
            const idx = e.target.dataset.idx;
            const emailEl = wrap.querySelector('[data-idx="' + idx + '"][data-field="email"]');
            addrShowSuggestions(e.target, e.target.value.trim(), emailEl, false);
        });
        // 💡 [2026-08-27 신규] 멤버-3(자유 추가) 이름칸도 ↓/↑/Enter로 마우스 없이 고를 수 있게(공용 핸들러 재사용)
        wrap.addEventListener('keydown', function(e) {
            if (!e.target.matches('[data-field="name"]')) return;
            addrHandleAutocompleteKeydown(e);
        });
        wrap.addEventListener('focusout', function(e) {
            if (!e.target.matches('[data-field="name"]')) return;
            setTimeout(function() {
                const dd = document.getElementById('addr-autocomplete-dropdown');
                if (dd) dd.style.display = 'none';
            }, 150);
        });
    }
    bindMember3Autocomplete('sum-member3-col-a');
    bindMember3Autocomplete('sum-member3-col-b');
})();

// 💡 [2026-08-29 신규] Summary "진행중/완료" — 클릭 한 번에 바로 뒤바뀌는 토글. select 태그의 onmousedown이
//    기본 드롭다운 펼치기를 막아둔 상태에서 이 함수가 값을 직접 뒤집고, change 이벤트를 수동으로 쏴서
//    document 레벨 dirty-tracking(2604줄 부근, #tab-summary 안 change/input 감지)이 그대로 잡게 한다.
window._toggleProjectStatus = function() {
    const sel = document.getElementById('sum-project-status');
    if (!sel) return;
    sel.value = sel.value === '완료' ? '' : '완료';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
};

window.collectTabData = function() {
    window.tabData = window.tabData || { summary: {}, briefSpec: [], mcTable: [] };

    // Summary - 프로젝트 개요/배경/마일스톤
    const sd = window.tabData.summary || {};
    const getVal = function(id) { const el = document.getElementById(id); return el ? el.value : ''; };
    sd.purpose = getVal('sum-purpose');
    sd.volume = getVal('sum-volume');
    sd.mpDate = getVal('sum-mp-date');
    sd.background = getVal('sum-background');
    // 💡 [2026-08-30 신규] 개발기간(일)은 더 이상 직접 입력칸이 아니라 마일스톤(계획 Start~PRA) 날짜로부터
    // 자동 계산됨 — AI 컨텍스트/엑셀 내보내기 등 sd.devDays를 참조하는 기존 코드가 계속 동작하도록,
    // 여기서도 "일" 단위 값을 그대로 계산해 넣는다(표시 단위 토글과는 무관하게 항상 일수 기준).
    const _msPlanStart = document.querySelector('#sum-milestone-body [data-stage="기획Start"][data-field="date"]');
    const _msPlanEnd = document.querySelector('#sum-milestone-body [data-stage="PRA"][data-field="date"]');
    const _msPlanDays = window._sumDevDaysBetween ? window._sumDevDaysBetween(_msPlanStart && _msPlanStart.value, _msPlanEnd && _msPlanEnd.value) : null;
    sd.devDays = (_msPlanDays !== null && _msPlanDays !== undefined) ? _msPlanDays : '';
    const milestones = {};
    document.querySelectorAll('#sum-milestone-body input[data-stage], #sum-milestone-body-actual input[data-stage]').forEach(function(inp) {
        milestones[inp.dataset.stage] = milestones[inp.dataset.stage] || {};
        milestones[inp.dataset.stage][inp.dataset.field] = inp.value;
    });
    sd.milestones = milestones;
    window.tabData.summary = sd;

    // 프로젝트 단위 정보 → projectMeta
    window.projectMeta = window.projectMeta || {};
    const pm = window.projectMeta;
    const bind = function(id, key) { const el = document.getElementById(id); if (el) pm[key] = el.value; };
    bind('sum-project-code', '프로젝트코드');
    bind('sum-project-name', '프로젝트명');
    bind('sum-customer', '고객사');
    bind('sum-customer-model', '고객모델명');
    // 💡 KTK PN_모델명: 화면엔 하나로 합쳐서 입력받고, 내부 데이터는 기존 호환을 위해 KTKPN / KTK모델명으로 분리 저장
    const ktkCombinedEl = document.getElementById('sum-ktk-pn-model');
    if (ktkCombinedEl) {
        const ktkVal = ktkCombinedEl.value || '';
        const us = ktkVal.indexOf('_');
        pm.KTKPN = us === -1 ? ktkVal : ktkVal.slice(0, us);
        pm.KTK모델명 = us === -1 ? '' : ktkVal.slice(us + 1);
    }
    bind('sum-pm', '프로젝트담당자');
    bind('sum-project-status', '완료여부'); // 💡 값: "" = 진행중, "완료" = 완료
    bind('sum-mail-keywords', '메일키워드');
    bind('sum-mech', '기구담당자');
    bind('sum-hw', 'HW담당자');
    bind('sum-fw', 'FW담당자');
    bind('sum-tsp', 'TSP담당자');
    bind('sum-lcm', 'LCM담당자');
    bind('sum-slimming', 'Slimming담당자');
    bind('sum-cutting', 'Cutting담당자');
    bind('sum-module', 'Module담당자');
    bind('sum-tooling', 'Tooling담당자');
    bind('sum-pm-email', '프로젝트담당자이메일');
    bind('sum-mech-email', '기구담당자이메일');
    bind('sum-hw-email', 'HW담당자이메일');
    bind('sum-fw-email', 'FW담당자이메일');
    bind('sum-tsp-email', 'TSP담당자이메일');
    bind('sum-lcm-email', 'LCM담당자이메일');
    bind('sum-slimming-email', 'Slimming담당자이메일');
    bind('sum-cutting-email', 'Cutting담당자이메일');
    bind('sum-module-email', 'Module담당자이메일');
    bind('sum-tooling-email', 'Tooling담당자이메일');
    // 고객모델명을 기존 모델명/PN_모델명 필드와도 동기화 (weeklyReport 등 기존 로직 호환)
    if (pm.고객모델명) pm.모델명 = pm.고객모델명;
    if (pm.KTK모델명) pm.PN_모델명 = pm.KTK모델명;

    // 💡 멤버-1,2 담당업무 라벨(자유 수정 텍스트) 저장 — 내부 키는 고정, 화면 표시 텍스트만 별도 보관
    pm.memberLabels = pm.memberLabels || {};
    [['sum-pm-label','프로젝트담당자'],['sum-mech-label','기구담당자'],['sum-hw-label','HW담당자'],
     ['sum-fw-label','FW담당자'],['sum-module-label','Module담당자'],['sum-tsp-label','TSP담당자'],
     ['sum-lcm-label','LCM담당자'],['sum-slimming-label','Slimming담당자'],
     ['sum-cutting-label','Cutting담당자'],['sum-tooling-label','Tooling담당자']].forEach(function(pair) {
        const el = document.getElementById(pair[0]);
        if (el && el.value) pm.memberLabels[pair[1]] = el.value;
    });

    // 💡 프로젝트 멤버-3 (자유 추가 인원) 수집
    const member3Rows = [];
    const m3map = {};
    document.querySelectorAll('#sum-member3-col-a [data-idx], #sum-member3-col-b [data-idx]').forEach(function(el) {
        const idx = el.dataset.idx;
        m3map[idx] = m3map[idx] || {};
        m3map[idx][el.dataset.field] = el.value;
    });
    Object.keys(m3map).sort(function(a, b) { return a - b; }).forEach(function(k) {
        const r = m3map[k];
        const role = r.role || '', name = r.name || '', email = r.email || '';
        if (role || name || email) member3Rows.push({ role: role, name: name, email: email });
    });
    window.tabData.projectMembers3 = member3Rows;

    // 💡 주요 자재 목록 수집 (고정 13개 + 자유추가)
    if (window.collectMaterialRows) window.tabData.projectMaterials = window.collectMaterialRows();

    // 🪪 Address Book도 함께 수집 (프로젝트 자체 JSON 저장용 스냅샷) — 이 프로젝트 자동저장 경로에서는
    //    공용 Drive 주소록까지는 밀어쓰지 않는다(skipDriveSync=true). 실제 편집은 onchange 핸들러에서 별도 동기화됨.
    if (window.collectAddressData) window.collectAddressData(true);

    // Brief SPEC / M.C Table
    window.tabData.briefSpec = _readRowsFromTbody('briefspec-body');
    const _curRev = window.tabData.mcActiveRevision || 'R1';
    window.tabData.mcRevisions = window.tabData.mcRevisions || {};
    window.tabData.mcRevisions[_curRev] = _readRowsFromTbody('mctable-body');
    window.tabData.mcTable = window.tabData.mcRevisions['R1'] || []; // 엑셀 저장 호환용 별칭

    return window.tabData;
};

window.populateTabData = function() {
    const td = window.tabData || {};
    // 💡 R1~R5 리비전 데이터 구조 마이그레이션: 기존 mcTable은 R1으로 그대로 이전(기본값)
    td.mcRevisions = td.mcRevisions || {};
    // 💡 이 "구버전 mcTable에서 R1 복구" 로직은 기본 종류에만 해당됨.
    //    다른 종류(BTN/MAIN 등)를 보고 있을 때는 절대 기본 데이터를 끌어오면 안 됨.
    if (!window.mcActiveUnit && (!td.mcRevisions.R1 || !td.mcRevisions.R1.length) && td.mcTable && td.mcTable.length) {
        td.mcRevisions.R1 = td.mcTable;
    }
    td.mcActiveRevision = td.mcActiveRevision || 'R1';
    const sd = td.summary || {};
    const pm = window.projectMeta || {};
    const setVal = function(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; };
    
    // Summary 탭 데이터 매핑
    setVal('sum-project-code', pm.프로젝트코드);
    setVal('sum-project-name', pm.프로젝트명);
    setVal('sum-customer', pm.고객사);
    setVal('sum-customer-model', pm.고객모델명);
    // 💡 KTK PN / KTK 모델명을 하나의 필드로 합쳐서 표시 (예: 502574_MVD>KTS320DPS01,LNW)
    setVal('sum-ktk-pn-model', [pm.KTKPN || '', pm.KTK모델명 || ''].filter(Boolean).join('_'));
    setVal('sum-pm', pm.프로젝트담당자);
    setVal('sum-project-status', pm.완료여부);
    setVal('sum-mail-keywords', pm.메일키워드);
    setVal('sum-mech', pm.기구담당자);
    setVal('sum-hw', pm.HW담당자);
    setVal('sum-fw', pm.FW담당자);
    setVal('sum-tsp', pm.TSP담당자);
    setVal('sum-lcm', pm.LCM담당자);
    setVal('sum-slimming', pm.Slimming담당자);
    setVal('sum-cutting', pm.Cutting담당자);
    setVal('sum-module', pm.Module담당자);
    setVal('sum-tooling', pm.Tooling담당자);
    setVal('sum-pm-email', pm.프로젝트담당자이메일);
    setVal('sum-mech-email', pm.기구담당자이메일);
    setVal('sum-hw-email', pm.HW담당자이메일);
    setVal('sum-fw-email', pm.FW담당자이메일);
    setVal('sum-tsp-email', pm.TSP담당자이메일);
    setVal('sum-lcm-email', pm.LCM담당자이메일);
    setVal('sum-slimming-email', pm.Slimming담당자이메일);
    setVal('sum-cutting-email', pm.Cutting담당자이메일);
    setVal('sum-module-email', pm.Module담당자이메일);
    setVal('sum-tooling-email', pm.Tooling담당자이메일);

    // 💡 [2026-08-24 버그 수정] 멤버-1,2 담당업무 라벨 복원 — "사용자가 바꾼 적 없으면 기본 텍스트
    //    그대로 유지"가 의도였는데, setVal이 무조건 el.value = val || ''로 덮어써서 저장된 라벨이
    //    없는 프로젝트(새 프로젝트/참조 엑셀 자동 가져오기 등 pm.memberLabels가 비어있는 경우)마다
    //    매번 빈칸으로 지워지고 있었다. 저장된 라벨이 있으면 그걸 쓰고, 없으면 공용 기본값
    //    (window.DEFAULT_MEMBER_LABELS)으로 복원한다 — 그냥 안 건드리고 두면(=이전에 활성화됐던
    //    다른 시트의 라벨이 DOM에 남아있으므로) 시트를 전환했을 때 엉뚱한 이전 프로젝트의 라벨이
    //    그대로 보이는 사고가 나므로, 반드시 "저장값 or 기본값" 둘 중 하나로 매번 명시적으로 채운다.
    const setLabelVal = function(id, val) { const el = document.getElementById(id); if (el) el.value = val || window.DEFAULT_MEMBER_LABELS[id] || ''; };
    const ml = pm.memberLabels || {};
    setLabelVal('sum-pm-label', ml.프로젝트담당자);
    setLabelVal('sum-mech-label', ml.기구담당자);
    setLabelVal('sum-hw-label', ml.HW담당자);
    setLabelVal('sum-fw-label', ml.FW담당자);
    setLabelVal('sum-module-label', ml.Module담당자);
    setLabelVal('sum-tsp-label', ml.TSP담당자);
    setLabelVal('sum-lcm-label', ml.LCM담당자);
    setLabelVal('sum-slimming-label', ml.Slimming담당자);
    setLabelVal('sum-cutting-label', ml.Cutting담당자);
    setLabelVal('sum-tooling-label', ml.Tooling담당자);

    // 💡 프로젝트 멤버-3 렌더링
    if (window.renderMember3Rows) window.renderMember3Rows(td.projectMembers3 || []);

    // 💡 주요 자재 목록 렌더링 (없으면 고정 13개 구분만 빈 값으로 표시됨)
    if (window.renderMaterialRows) window.renderMaterialRows(td.projectMaterials || []);

    // 🪪 Address Book — 프로젝트 파일 안의 값은 더 이상 쓰지 않고, 공용 저장소를 단일 소스로 사용
    //    (로컬 캐시로 즉시 렌더 → 백그라운드에서 Drive 최신본으로 갱신)
    window.tabData.addressBook = window.AddressBook.load();
    if (window.renderAddressTable) window.renderAddressTable();
    window.AddressBook.loadFromDrive().then(function(list) {
        if (list) {
            window.tabData.addressBook = list;
            if (window.renderAddressTable) window.renderAddressTable();
        }
    });
    // 💡 자동폐기 필터 규칙(제목 키워드/노리플라이 패턴/차단 도메인)도 팀 공용 Drive 최신본으로 병합 복원
    if (window.loadFilterRulesFromDrive) window.loadFilterRulesFromDrive();

    setVal('sum-purpose', sd.purpose);
    setVal('sum-volume', sd.volume);
    setVal('sum-mp-date', sd.mpDate);
    setVal('sum-background', sd.background);

    document.querySelectorAll('#sum-milestone-body input[data-stage], #sum-milestone-body-actual input[data-stage]').forEach(function(inp) {
        const m = sd.milestones && sd.milestones[inp.dataset.stage];
        inp.value = (m && m[inp.dataset.field]) ? m[inp.dataset.field] : '';
    });
    // 💡 [2026-08-30 신규] 개발기간(일)은 더 이상 직접 입력이 아니라 위에서 막 채운 마일스톤 날짜로부터
    // 계산되므로, 날짜를 채운 직후 다시 계산해서 표에 반영한다.
    if (window.sumRecalcDevDays) window.sumRecalcDevDays();
    
    // Brief SPEC 탭 렌더링
    if (td.briefSpec && td.briefSpec.length) {
        const tbody = document.getElementById('briefspec-body');
        if (tbody) {
            let bsZebraIdx = 0;
            const bsChunks = [];
            td.briefSpec.forEach(function(r) {
                const modelA = r.modelA !== undefined ? r.modelA : (r.desc || ''); // 구버전 desc 호환
                // 💡 MC Table과 동일하게: Model A/B/C, Note가 모두 비어있으면 행 숨김 처리
                const isRowEmpty = !modelA && !r.modelB && !r.modelC && !r.note;
                const keepHidden = isRowEmpty && !(window._bmExpanded && window._bmExpanded.bs);
                const isVisible = !keepHidden;
                const zebraClass = isVisible ? (bsZebraIdx % 2 === 0 ? 'mc-zebra-a' : 'mc-zebra-b') : '';
                if (isVisible) bsZebraIdx++;
                const rowStyle = (zebraClass ? ' class="' + zebraClass + '"' : '') + (isRowEmpty ? (' style="' + (keepHidden ? 'display:none;' : '') + '" data-auto-hidden="1"') : '');
                bsChunks.push('<tr' + rowStyle + '><td class="bm-no"></td>'
                    + '<td><input type="text" data-field="type" value="' + _escTabVal(r.type) + '"></td>'
                    + '<td><input type="text" data-field="sub" value="' + _escTabVal(r.sub) + '"></td>'
                    + '<td><input type="text" class="u-input" data-field="modelA" value="' + _escTabVal(modelA) + '"></td>'
                    + '<td><input type="text" class="u-input" data-field="modelB" value="' + _escTabVal(r.modelB) + '"></td>'
                    + '<td><input type="text" class="u-input" data-field="modelC" value="' + _escTabVal(r.modelC) + '"></td>'
                    + '<td><input type="text" class="u-input" data-field="note" value="' + _escTabVal(r.note) + '"></td></tr>');
            });
            tbody.innerHTML = bsChunks.join('');
            if (window.bmSetupAllRows) window.bmSetupAllRows('bs');
            if (window.bsRefreshColumnVisibility) window.bsRefreshColumnVisibility();
        }
    } else {
        // 💡 이 프로젝트에 Brief SPEC 데이터가 없으면, 이전 프로젝트 표 내용이 남지 않도록 비움
        const bsTbodyEmpty = document.getElementById('briefspec-body');
        if (bsTbodyEmpty) {
            bsTbodyEmpty.innerHTML = '';
            if (window.bmSetupAllRows) window.bmSetupAllRows('bs');
        }
    }

    // 💡 제품 사진 복원 — 슬롯 2개를 항상 먼저 초기화(비움)한 뒤, 있는 것만 채움
    //    (이전 프로젝트 사진이 빈 슬롯에 남아있던 버그 수정)
    for (let i = 0; i < 2; i++) {
        const slot = document.getElementById('prod-img-slot-' + i);
        if (!slot) continue;
        const img = slot.querySelector('img.prod-preview');
        const ph  = slot.querySelector('.prod-placeholder');
        const del = slot.querySelector('.prod-del-btn');
        if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
        if (ph)  ph.style.display = 'block';
        if (del) del.style.display = 'none';
    }
    if (td.productImages) {
        td.productImages.forEach(function(entry, i) {
            if (!entry) return;
            const slot = document.getElementById('prod-img-slot-' + i);
            if (!slot) return;
            const img = slot.querySelector('img.prod-preview');
            const ph  = slot.querySelector('.prod-placeholder');
            const del = slot.querySelector('.prod-del-btn');
            const src = (typeof entry === 'string') ? entry : entry.data;  // 구버전 호환
            if (img) { img.src = src; img.style.display = 'block'; }
            if (ph)  ph.style.display = 'none';
            if (del) del.style.display = 'block';
            // 구버전(w/h 없는) 데이터는 원본 크기를 다시 측정해서 채워 넣음 → PPT 내보내기 시 비율 유지
            if (!entry.w || !entry.h) {
                const measureImg = new Image();
                measureImg.onload = function() {
                    td.productImages[i] = { data: src, w: measureImg.naturalWidth, h: measureImg.naturalHeight };
                };
                measureImg.src = src;
            }
        });
    }
    
    // 💰 M.C Table 탭 렌더링 (현재 활성 리비전 데이터를 표시)
    const _mcActiveRows = (td.mcRevisions && td.mcRevisions[td.mcActiveRevision]) || [];
    const _mcTbodyEl = document.getElementById('mctable-body');
    if (!_mcActiveRows.length) {
        // 💡 아무 행도 없으면 우클릭할 대상 자체가 없어 행 추가가 불가능했음 → 첫 행 추가 버튼 표시
        if (_mcTbodyEl) {
            _mcTbodyEl.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:24px 0;">'
                + '<button class="action-btn" onclick="window.bmAddFirstRow(\'mc\')" style="min-width:auto; background:#2c5f8a; color:#fff;">➕ ' + (window._currentLang === 'en' ? 'Add First Row' : '첫 행 추가') + '</button>'
                + '</td></tr>';
        }
    } else {
        try {
            const tbody = document.getElementById('mctable-body');
            if (!tbody) return;

            const validRows = _mcActiveRows.filter(function(r) {
                const t = String(r.type || '').toUpperCase().replace(/\s/g, '');
                return t !== 'SUBTOTAL' && t !== 'TOTAL';
            });

            let currentType = '';
            let htmlChunks = [];

            let subtotal = { protoCost: 0, protoNre: 0, protoBCost: 0, protoBNre: 0, mpCost: 0, mpNre: 0 };
            let grandtotal = { protoCost: 0, protoNre: 0, protoBCost: 0, protoBNre: 0, mpCost: 0, mpNre: 0 };

            const fmtCur = function(val) {
                if (val === undefined || val === null) return '';
                let s = String(val).trim();
                if (s === '') return '';
                let num = parseFloat(s.replace(/[^0-9.-]+/g, ''));
                if (isNaN(num) || num === 0) return '';
                return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };
            const parseNum = function(val) {
                if (val === undefined || val === null) return 0;
                let num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
                return isNaN(num) ? 0 : num;
            };
            const fmtCurSummary = function(num) {
                num = Number(num) || 0;
                return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            // 💡 TYPE 빈칸 보정 (그룹 첫 줄에만 적혀있는 경우 대응)
            (function() {
                let lastType = '';
                validRows.forEach(function(r) {
                    const rt = String(r.type || '').trim();
                    if (rt) lastType = rt;
                    else r.type = lastType;
                });
            })();

            // 💡 [핵심] hidePairs를 데이터 생성 "이전에" 미리 한 번 스캔해서 확정.
            //    이렇게 해야 colgroup/thead/tbody가 전부 같은 기준으로, 같은 시점에 만들어져서
            //    칸 수가 서로 어긋나는 일이 구조적으로 없어짐.
            let hasProtoCost = false, hasProtoNre = false, hasProtoBCost = false, hasProtoBNre = false, hasMpCost = false, hasMpNre = false;
            validRows.forEach(function(r) {
                if (parseNum(r.protoCost)) hasProtoCost = true;
                if (parseNum(r.protoNre)) hasProtoNre = true;
                if (parseNum(r.protoBCost)) hasProtoBCost = true;
                if (parseNum(r.protoBNre)) hasProtoBNre = true;
                if (parseNum(r.mpCost)) hasMpCost = true;
                if (parseNum(r.mpNre)) hasMpNre = true;
            });
            const expanded = !!(window._bmExpanded && window._bmExpanded.mc);
            const hidePnSpec = !expanded; // 💡 접힌 상태에서는 P/N, Specification 열도 통째로 숨김
            const hidePairs = {
                protoA: !(hasProtoCost || hasProtoNre) && !expanded,
                protoB: !(hasProtoBCost || hasProtoBNre) && !expanded,
                mp: !(hasMpCost || hasMpNre) && !expanded
            };
            const curRev = td.mcActiveRevision || 'R1';

            // 💡 colgroup 통째로 재생성 — 숨길 쌍은 <col> 자체를 처음부터 안 만듦
            const colgroupEl = document.querySelector('#tab-mctable colgroup');
            if (colgroupEl) {
                let cg = '<col style="width:40px;"><col style="width:90px;"><col style="width:160px;"><col style="width:140px;">';
                if (!hidePnSpec) cg += '<col style="width:90px;"><col style="width:280px;">';
                if (!hidePairs.protoA) cg += '<col style="width:70px;"><col style="width:90px;">';
                if (!hidePairs.protoB) cg += '<col style="width:70px;"><col style="width:90px;">';
                if (!hidePairs.mp) cg += '<col style="width:70px;"><col style="width:90px;">';
                cg += '<col style="width:400px;">';
                colgroupEl.innerHTML = cg;
            }
            // 💡 thead 통째로 재생성 — 위 colgroup과 정확히 같은 hidePairs 기준
            const theadEl = document.getElementById('mc-thead');
            if (theadEl) {
                let row1 = '<tr>'
                    + '<th rowspan="2" style="width:40px;" title="클릭: 메뉴 / Ctrl·Shift 클릭: 여러 행 선택">NO</th>'
                    + '<th rowspan="2" style="width:90px;">TYPE</th>'
                    + '<th rowspan="2" style="width:160px;" title="💡 ITEM 칸에 &#39;etc.&#39;를 입력한 행이 그룹의 마지막 행이 됩니다 — 이 지점에서 TYPE 구분과 SUBTOTAL이 계산됩니다.">ITEM</th>'
                    + '<th rowspan="2" style="width:140px;">GROUP</th>';
                if (!hidePnSpec) row1 += '<th rowspan="2" style="width:90px;">P/N</th><th rowspan="2" style="min-width:280px;">Specification</th>';
                const _mcUnitTag = window.mcActiveUnit ? '[' + escapeHtml(window.mcActiveUnit) + ']' : '';
                if (!hidePairs.protoA) row1 += '<th colspan="2">' + _mcUnitTag + 'PROTO A</th>';
                if (!hidePairs.protoB) row1 += '<th colspan="2">' + _mcUnitTag + 'PROTO B</th>';
                if (!hidePairs.mp) row1 += '<th colspan="2">' + _mcUnitTag + 'MP(' + curRev + ')</th>';
                row1 += '<th rowspan="2" style="min-width:400px;">Note</th></tr>';
                // 💡 엑셀 내보내기와 동일하게, 이 리비전의 마지막 수정이력 시각을 "견적 수정이력 확인" 줄 오른쪽에 표시
                const _mcRevLogs = (td.mcChangeLog || []).filter(function(l) { return l.rev === curRev; });
                const _mcLatestDate = _mcRevLogs.length ? _mcRevLogs[_mcRevLogs.length - 1].time : '-';
                const _mcLastEditEl = document.getElementById('mc-history-lastedit');
                if (_mcLastEditEl) _mcLastEditEl.textContent = (window._currentLang === 'en' ? 'Last Modified: ' : '최종수정: ') + _mcLatestDate;
                let row2 = '<tr>';
                if (!hidePairs.protoA) row2 += '<th style="width:70px; border-left:2px solid #2c5f8a;">Cost($)</th><th style="width:90px;">NRE</th>';
                if (!hidePairs.protoB) row2 += '<th style="width:70px; border-left:2px solid #2c5f8a;">Cost($)</th><th style="width:90px;">NRE</th>';
                if (!hidePairs.mp) row2 += '<th style="width:70px; border-left:2px solid #2c5f8a;">Cost($)</th><th style="width:90px;">NRE</th>';
                row2 += '</tr>';
                theadEl.innerHTML = row1 + row2;
            }

            // 💡 합계 행 생성 함수 — hidePairs에 맞춰 같은 쌍만 출력
            const renderSummaryRow = function(label, sums, bgColor, noteKey) {
                const valCell = function(v, border) {
                    return '<td' + (border ? ' style="border-left:2px solid #2c5f8a;"' : '') + '><input type="text" class="u-input" style="background-color:transparent; font-weight:bold; color:#333; text-align:center;" value="' + fmtCurSummary(v) + '" readonly></td>';
                };
                let html = '<tr class="mc-summary-row" style="background-color:' + bgColor + '; font-weight:bold;">'
                    + '<td colspan="' + (hidePnSpec ? 4 : 6) + '" style="text-align:right; padding-right:15px; font-size:13px; color:#333;">' + label + '</td>';
                if (!hidePairs.protoA) html += valCell(sums.protoCost, true) + valCell(sums.protoNre);
                if (!hidePairs.protoB) html += valCell(sums.protoBCost, true) + valCell(sums.protoBNre);
                if (!hidePairs.mp) html += valCell(sums.mpCost, true) + valCell(sums.mpNre);
                // 💡 SUBTOTAL/TOTAL 행도 Note 입력 가능하도록 (기존엔 빈 칸이라 입력 자체가 불가능했음)
                const noteVal = (_mcSummaryNotesStore()[curRev] && _mcSummaryNotesStore()[curRev][noteKey]) || '';
                html += '<td><input type="text" class="u-input" style="background-color:transparent;" value="' + _escTabVal(noteVal) + '" onchange="window.mcUpdateSummaryNote(\'' + curRev + '\', \'' + noteKey + '\', this.value)"></td></tr>';
                return html;
            };

            const rowEmptyFlags = validRows.map(function(r) {
                const pCost = parseNum(r.protoCost), pNre = parseNum(r.protoNre);
                const pbCost = parseNum(r.protoBCost), pbNre = parseNum(r.protoBNre);
                const mCost = parseNum(r.mpCost), mNre = parseNum(r.mpNre);
                return (pCost === 0 && pNre === 0 && pbCost === 0 && pbNre === 0 && mCost === 0 && mNre === 0);
            });
            const forceVisible = {};
            (function() {
                let segStart = 0;
                let curType = '';
                validRows.forEach(function(r, idx) {
                    const rt = String(r.type || '').trim();
                    if (rt) curType = rt;
                    const itemHasNre = /\betc\b|\bNRE\b/.test(String(r.item || ''));  // 💡 "etc."(소문자)를 기준으로 사용 — 대문자 "ETC" 항목명과 구분. 구버전 "NRE" 표기도 계속 인식
                    const nextRow = validRows[idx + 1];
                    const nextType = nextRow ? String(nextRow.type || '').trim() : '';
                    const isLastRow = !nextRow;
                    const typeWillChange = !!(nextRow && nextType && nextType !== curType);
                    if (itemHasNre || typeWillChange || isLastRow) {
                        let allEmpty = true;
                        for (let i = segStart; i <= idx; i++) { if (!rowEmptyFlags[i]) { allEmpty = false; break; } }
                        if (allEmpty) forceVisible[segStart] = true;
                        segStart = idx + 1;
                    }
                });
            })();

            let lastShownType = null;
            let mainZebraIdx = 0;

            validRows.forEach(function(r, idx) {
                let rowType = String(r.type || '').trim();
                if (rowType) currentType = rowType;

                const pCost = parseNum(r.protoCost), pNre = parseNum(r.protoNre);
                const pbCost = parseNum(r.protoBCost), pbNre = parseNum(r.protoBNre);
                const mCost = parseNum(r.mpCost), mNre = parseNum(r.mpNre);
                const isPriceEmpty = rowEmptyFlags[idx];

                subtotal.protoCost += pCost; subtotal.protoNre += pNre;
                subtotal.protoBCost += pbCost; subtotal.protoBNre += pbNre;
                subtotal.mpCost += mCost; subtotal.mpNre += mNre;
                grandtotal.protoCost += pCost; grandtotal.protoNre += pNre;
                grandtotal.protoBCost += pbCost; grandtotal.protoBNre += pbNre;
                grandtotal.mpCost += mCost; grandtotal.mpNre += mNre;

                const isRowEmpty = isPriceEmpty && !forceVisible[idx];
                const keepHiddenRow = isRowEmpty && !expanded;
                const isVisible = !keepHiddenRow;
                const zebraClass = isVisible ? (mainZebraIdx % 2 === 0 ? 'mc-zebra-a' : 'mc-zebra-b') : '';
                if (isVisible) mainZebraIdx++;
                let rowStyle = (zebraClass ? ' class="' + zebraClass + '"' : '') + ' style="' + (keepHiddenRow ? 'display:none;' : '') + '"' + (isRowEmpty ? ' data-auto-hidden="1"' : '');

                let showTypeText = false;
                if (isVisible) {
                    if (rowType !== lastShownType) { showTypeText = true; lastShownType = rowType; }
                }
                const typeColor = showTypeText ? '#333' : 'transparent';
                const catCellStyle = 'border-bottom:1px solid #eee;' + (showTypeText ? ' border-left:3px solid #2c5f8a;' : '');

                const isForcedEmptyRow = isPriceEmpty && !!forceVisible[idx] && !expanded;
                const otherColor = isForcedEmptyRow ? 'transparent' : '#333';
                const priceColor = isForcedEmptyRow ? 'transparent' : '#777';

                let rowHtml = '<tr' + rowStyle + '>'
                    + '<td class="bm-no"></td>'
                    + '<td class="mc-cat" style="' + catCellStyle + '">'
                    + '<input type="text" data-field="type" value="' + _escTabVal(rowType) + '" onchange="window.mcRefreshTable()" style="border:none; width:100%; font-size:12.5px; font-weight:bold; color:' + typeColor + '; background:transparent; text-align:center;">'
                    + '</td>'
                    + '<td><input type="text" data-field="item" value="' + _escTabVal(r.item) + '" style="color:' + otherColor + ';"></td>'
                    + '<td><input type="text" data-field="group" value="' + _escTabVal(r.group) + '" style="color:' + otherColor + ';">'
                    + (hidePnSpec ? '<input type="hidden" data-field="pn" value="' + _escTabVal(r.pn) + '"><input type="hidden" data-field="spec" value="' + _escTabVal(r.spec) + '">' : '')
                    + '</td>';

                if (!hidePnSpec) {
                    rowHtml += '<td><input type="text" data-field="pn" value="' + _escTabVal(r.pn) + '" style="color:' + otherColor + ';"></td>'
                        + '<td><input type="text" data-field="spec" value="' + _escTabVal(r.spec) + '" style="color:' + otherColor + ';"></td>';
                }

                if (!hidePairs.protoA) {
                    rowHtml += '<td style="border-left:2px solid #2c5f8a;"><input type="text" class="u-input" data-field="protoCost" value="' + fmtCur(r.protoCost) + '" style="color:' + priceColor + '; text-align:center;"></td>'
                        + '<td><input type="text" class="u-input" data-field="protoNre" value="' + fmtCur(r.protoNre) + '" style="color:' + priceColor + '; text-align:center;"></td>';
                }
                if (!hidePairs.protoB) {
                    rowHtml += '<td style="border-left:2px solid #2c5f8a;"><input type="text" class="u-input" data-field="protoBCost" value="' + fmtCur(r.protoBCost) + '" style="color:' + priceColor + '; text-align:center;"></td>'
                        + '<td><input type="text" class="u-input" data-field="protoBNre" value="' + fmtCur(r.protoBNre) + '" style="color:' + priceColor + '; text-align:center;"></td>';
                }
                if (!hidePairs.mp) {
                    rowHtml += '<td style="border-left:2px solid #2c5f8a;"><input type="text" class="u-input" data-field="mpCost" value="' + fmtCur(r.mpCost) + '" style="color:' + priceColor + '; text-align:center;"></td>'
                        + '<td><input type="text" class="u-input" data-field="mpNre" value="' + fmtCur(r.mpNre) + '" style="color:' + priceColor + '; text-align:center;"></td>';
                }
                rowHtml += '<td><input type="text" class="u-input" data-field="note" value="' + _escTabVal(r.note) + '" style="color:' + otherColor + ';"></td></tr>';
                htmlChunks.push(rowHtml);

                const itemHasNre = /\betc\b|\bNRE\b/.test(String(r.item || ''));  // 💡 "etc."(소문자)를 기준으로 사용 — 대문자 "ETC" 항목명과 구분. 구버전 "NRE" 표기도 계속 인식
                const nextRow = validRows[idx + 1];
                const nextType = nextRow ? String(nextRow.type || '').trim() : '';
                const isLastRow = !nextRow;
                const typeWillChange = !!(nextRow && nextType && nextType !== currentType);

                if (currentType && (itemHasNre || typeWillChange || isLastRow)) {
                    htmlChunks.push(renderSummaryRow(currentType + ' SUBTOTAL', subtotal, '#fff8e6', 'subtotal_' + currentType));
                    subtotal = { protoCost: 0, protoNre: 0, protoBCost: 0, protoBNre: 0, mpCost: 0, mpNre: 0 };
                }
            });

            htmlChunks.push(renderSummaryRow('TOTAL(M.C)', grandtotal, '#fbead9', 'total'));

            // 💡 영업판가 행
            const sp = (window.tabData.mcSalesPriceDetail && window.tabData.mcSalesPriceDetail[curRev]) || {};
            const spCell = function(field, border) {
                const raw = sp[field];
                const display = raw ? '$' + parseNum(raw).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                return '<td' + (border ? ' style="border-left:2px solid #2c5f8a;"' : '') + '><input type="text" class="u-input" value="' + _escTabVal(display) + '" onchange="window.mcUpdateSalesPriceDetail(\'' + curRev + '\', \'' + field + '\', this.value, this)" style="background-color:transparent; font-weight:bold; color:#1f7a3d; text-align:center;"></td>';
            };
            let salesHtml = '<tr class="mc-summary-row" style="background-color:#e6f6ea; font-weight:bold;"><td colspan="' + (hidePnSpec ? 4 : 6) + '" style="text-align:right; padding-right:15px; font-size:13px; color:#333;">영업판가</td>';
            if (!hidePairs.protoA) salesHtml += spCell('protoCost', true) + spCell('protoNre');
            if (!hidePairs.protoB) salesHtml += spCell('protoBCost', true) + spCell('protoBNre');
            if (!hidePairs.mp) salesHtml += spCell('mpCost', true) + spCell('mpNre');
            const salesNoteVal = (_mcSummaryNotesStore()[curRev] && _mcSummaryNotesStore()[curRev].salesPrice) || '';
            salesHtml += '<td><input type="text" class="u-input" style="background-color:transparent;" value="' + _escTabVal(salesNoteVal) + '" onchange="window.mcUpdateSummaryNote(\'' + curRev + '\', \'salesPrice\', this.value)"></td></tr>';
            htmlChunks.push(salesHtml);

            // 💡 재료비율 행
            const ratioCell = function(field, totalVal, border) {
                const spVal = parseNum(sp[field]);
                const text = spVal > 0 ? (totalVal / spVal * 100).toFixed(1) + '%' : '-';
                return '<td' + (border ? ' style="border-left:2px solid #2c5f8a; text-align:center; font-weight:bold; color:#b1432f;"' : ' style="text-align:center; font-weight:bold; color:#b1432f;"') + '>' + text + '</td>';
            };
            let ratioHtml = '<tr class="mc-summary-row" style="background-color:#fbe4e2; font-weight:bold;"><td colspan="' + (hidePnSpec ? 4 : 6) + '" style="text-align:right; padding-right:15px; font-size:13px; color:#333;">재료비율 (M.C ÷ 영업판가) [%]</td>';
            if (!hidePairs.protoA) ratioHtml += ratioCell('protoCost', grandtotal.protoCost, true) + ratioCell('protoNre', grandtotal.protoNre);
            if (!hidePairs.protoB) ratioHtml += ratioCell('protoBCost', grandtotal.protoBCost, true) + ratioCell('protoBNre', grandtotal.protoBNre);
            if (!hidePairs.mp) ratioHtml += ratioCell('mpCost', grandtotal.mpCost, true) + ratioCell('mpNre', grandtotal.mpNre);
            const ratioNoteVal = (_mcSummaryNotesStore()[curRev] && _mcSummaryNotesStore()[curRev].ratio) || '';
            ratioHtml += '<td><input type="text" class="u-input" style="background-color:transparent;" value="' + _escTabVal(ratioNoteVal) + '" onchange="window.mcUpdateSummaryNote(\'' + curRev + '\', \'ratio\', this.value)"></td></tr>';
            htmlChunks.push(ratioHtml);

            tbody.innerHTML = htmlChunks.join('');
            if (window.bmSetupAllRows) window.bmSetupAllRows('mc');

            // 💡 버튼이 R1~R5 순환식 하나로 통합되면서, "데이터 없는 리비전 버튼 숨김" 로직은
            //    유일한 탐색 버튼 자체를 숨겨버리는 문제가 있어 제거함 (항상 보이도록)
            (function() {
            })();

            // 💡 표 너비 = 보이는 col 너비 합계로 정확히 고정 (table-layout:fixed 안정화)
            setTimeout(function() {
                const table = document.querySelector('#tab-mctable .concept-table');
                if (!table) return;
                table.style.tableLayout = 'fixed';
                table.querySelectorAll('thead th').forEach(function(th) {
                    th.style.textAlign = 'center';
                    th.style.verticalAlign = 'middle';
                });

                // 💡 Note 열은 너비를 지정하지 않고 비워둠 — table-layout:fixed에서
                //    "너비가 없는 칸"은 남은 공간을 자동으로 채우는 브라우저 기본 동작을 그대로 이용.
                const cols = document.querySelectorAll('#mc-normal-section colgroup col');
                const noteCol = cols[cols.length - 1];
                if (noteCol) noteCol.style.width = '';
                table.style.width = '100%';

                // 💡 펼친 상태일 때만 내부 박스(.concept-tab-wrap)를 최대로 — 접힌 상태는 기존 1200px 그대로 유지
                const mcWrap = document.querySelector('#tab-mctable .concept-tab-wrap');
                if (mcWrap) mcWrap.classList.toggle('mc-wrap-expanded', expanded);
            }, 10);
        } catch (error) {
            // 💡 [2026-08-27 버그 수정] 여기서 예외가 나면 M.C Table 화면이 옛 데이터로 남은 채 아무
            //    표시 없이 조용히 실패했다 — 엑셀로 불러온 직후엔 이게 "저장한 내용이 화면에 안 보인다"는
            //    문의로 이어졌음(실제로는 저장 자체는 정상, 이 탭의 재렌더링만 실패한 것). 콘솔 로그만으론
            //    사용자가 알 방법이 없으므로 화면에도 눈에 띄게 알려서, 새로고침이 필요하다는 걸 바로 알 수 있게 한다.
            console.error("M.C Table 업그레이드 렌더링 에러:", error);
            if (window.showToast) {
                window.showToast((window._currentLang === 'en'
                    ? '⚠️ M.C Table failed to refresh — press Ctrl+F5 to reload.'
                    : '⚠️ M.C Table 화면 갱신에 실패했습니다 — Ctrl+F5로 새로고침 해주세요.'), 'error');
            }
        }
    }

    // 🖥️ [2026-08-25 버그 수정] Panel Compare 탭은 switchTab()에서만 다시 그려서, 그 탭을 이미
    //    펼쳐놓은 채로 프로젝트를 전환하면 이전 프로젝트의 패널이 그대로 남아있었다 — 다른 탭들처럼
    //    프로젝트 로드 시점에도 항상 다시 그려서, 지금 보고 있는 탭이 뭐든 즉시 새 프로젝트 데이터로 갱신되게 한다.
    if (window.renderPanelCompareTab) window.renderPanelCompareTab();
    // ⚡ [2026-08-28 신규] CONV BD/AD BD도 동일한 이유로 항상 다시 그림 — 위 Panel Compare와 같은 패턴
    //    (Elec Parts 탭이 열려있는 채로 엑셀/프로젝트를 불러와도 즉시 최신 선택 목록으로 갱신되게 함).
    if (window.renderElecCompareTab) { window.renderElecCompareTab('convbd'); window.renderElecCompareTab('adbd'); }
};

// ============================================================
// Brief SPEC / M.C Table 공용 — NO 클릭 팝업, 묶음 선택, 이동/추가/삭제
// ============================================================
window._bmSelected = { bs: new Set(), mc: new Set(), addr: new Set() };
window._bmAnchor   = { bs: null, mc: null, addr: null };

// ─── 행 액션 팝업(➕➖⬆️⬇️) 마우스 드래그 이동 — 버튼 클릭은 그대로 유지, 팝업의 여백(패딩) 부분만 드래그 핸들 ───
function _makeFloatingPopupDraggable(popup) {
    if (popup.dataset.dragBound) return;
    popup.dataset.dragBound = '1';
    let isDragging = false, startX, startY, origLeft, origTop;
    popup.style.cursor = 'grab';
    popup.addEventListener('mousedown', function(e) {
        if (e.target.closest('.bm-pop-btn') || e.target.closest('.rap-btn')) return; // 버튼 클릭은 드래그 시작 안 함
        isDragging = true;
        const rect = popup.getBoundingClientRect();
        origLeft = rect.left; origTop = rect.top;
        startX = e.clientX; startY = e.clientY;
        popup.style.left = origLeft + 'px';
        popup.style.top  = origTop  + 'px';
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        popup.style.left = (origLeft + e.clientX - startX) + 'px';
        popup.style.top  = (origTop  + e.clientY - startY) + 'px';
    });
    document.addEventListener('mouseup', function() { isDragging = false; });
}

// 💡 M.C Table 이동/추가 후 SUBTOTAL·TYPE 재계산 — 클릭 한 번당 정확히 한 번 실행
window.mcFlushDirty = function() {
    if (!window._bmMcDirty) return;
    window._bmMcDirty = false;
    if (!window.mcRefreshTable) return;
    const anchor = window._bmAnchor && window._bmAnchor.mc;
    let anchorIdx = -1;
    if (anchor && window.bmDataRows) {
        anchorIdx = window.bmDataRows('mc').indexOf(anchor);
    }
    window.mcRefreshTable();
    if (anchorIdx !== -1 && window.bmDataRows) {
        const newRows = window.bmDataRows('mc');
        const stillThere = newRows[Math.min(anchorIdx, newRows.length - 1)];
        if (stillThere && window.bmPaintSelection) {
            window._bmSelected.mc.clear(); window._bmSelected.mc.add(stillThere);
            window._bmAnchor.mc = stillThere;
            window.bmPaintSelection('mc');
            // 💡 버튼 박스(팝업)는 처음 연 위치에 계속 고정 — 참조만 새 행으로 갈아끼운다.
            const popup = document.getElementById('bm-row-popup');
            if (popup) { popup._bmRefTr = stillThere; popup.dataset.key = 'mc'; }
        }
    }
};

// ─── 행 액션 팝업 버튼(➕➖⬆️⬇️◀▶) "누르고 있으면 계속 실행" 공용 처리 ───
(function() {
    const REPEAT_IDS = ['bm-up', 'bm-dn', 'bm-add', 'bm-del', 'rap-up', 'rap-dn', 'rap-left', 'rap-right', 'rap-add', 'rap-del'];
    const HOLD_DELAY = 480;   // 처음 누르고 이 시간(ms) 지나면 반복 시작
    const REPEAT_INTERVAL = 130; // 이후 이 간격(ms)마다 반복 실행
    let holdTimer = null, repeatTimer = null, activeId = null;

    function stopRepeat() {
        clearTimeout(holdTimer);
        clearInterval(repeatTimer);
        holdTimer = null; repeatTimer = null; activeId = null;
        // 💡 혹시 아직 처리 안 된 게 남아있으면(안전망) 여기서도 한 번 정리 — 평소엔 각 클릭에서 이미 처리됨
        if (window._bmMcDirty) setTimeout(window.mcFlushDirty, 0);
    }

    document.addEventListener('mousedown', function(e) {
        const btn = e.target.closest('.bm-pop-btn, .rap-btn');
        if (!btn || !btn.id || REPEAT_IDS.indexOf(btn.id) === -1) return;
        activeId = btn.id;
        holdTimer = setTimeout(function() {
            repeatTimer = setInterval(function() {
                // 💡 팝업이 재오픈될 때마다 버튼 DOM이 새로 바뀌므로(clone), 매 tick마다 id로 다시 찾아서 클릭
                const live = document.getElementById(activeId);
                if (live) live.click(); else stopRepeat();
            }, REPEAT_INTERVAL);
        }, HOLD_DELAY);
    });

    document.addEventListener('mouseup', stopRepeat);
    document.addEventListener('mouseleave', function(e) {
        if (e.target === document.documentElement) stopRepeat(); // 브라우저 창 밖으로 나가면 중지
    });
    window.addEventListener('blur', stopRepeat); // 창 포커스 잃으면 중지
})();

const BM_CONF = {
    addr: {
        tbodyId: 'address-table-body',
        isSkip: function() { return false; },
        rowHtml: function() {
            return '<td class="bm-no"></td>'
                + '<td><input type="text" class="u-input" data-field="name"></td>'
                + '<td><input type="text" class="u-input" data-field="nameEn" placeholder="예: Hong Gildong"></td>'
                + '<td><input type="text" class="u-input" data-field="dept"></td>'
                + '<td><input type="text" class="u-input" data-field="title"></td>'
                + '<td><input type="email" class="u-input" data-field="email"></td>'
                + '<td><input type="text" class="u-input" data-field="mobile"></td>'
                + '<td><input type="text" class="u-input" data-field="phone"></td>'
                // 🐛 [버그 수정] 이 템플릿이 텔레그램 ID 열이 추가되기 전에 만들어진 채 그대로 남아있어서,
                // ▲▼＋－ 팝업으로 행을 추가하면 마지막 "텔레그램 ID" 칸 자체가 통째로 빠진 행이 생겼음.
                + '<td><input type="text" class="u-input" data-field="telegramId" placeholder="예: 987654321"></td>';
        }
    },

    bs: {
        tbodyId: 'briefspec-body',
        isSkip: function() { return false; },
        rowHtml: function() {
            return '<td class="bm-no"></td>'
                + '<td><input type="text" data-field="type"></td>'
                + '<td><input type="text" data-field="sub"></td>'
                + '<td><input type="text" class="u-input" data-field="modelA"></td>'
                + '<td><input type="text" class="u-input" data-field="modelB"></td>'
                + '<td><input type="text" class="u-input" data-field="modelC"></td>'
                + '<td><input type="text" class="u-input" data-field="note"></td>';
        }
    },
    mc: {
        tbodyId: 'mctable-body',
        isSkip: function(tr) { return tr.classList.contains('mc-summary-row'); },
        rowHtml: function() {
            return '<td class="bm-no"></td>'
                + '<td class="mc-cat"><input type="text" data-field="type" style="border:none; width:100%; font-size:12.5px;"></td>'
                + '<td><input type="text" data-field="item"></td>'
                + '<td><input type="text" data-field="group"></td>'
                + '<td><input type="text" data-field="pn"></td>'
                + '<td><input type="text" data-field="spec"></td>'
                + '<td><input type="text" class="u-input" data-field="protoCost"></td>'
                + '<td><input type="text" class="u-input" data-field="protoNre"></td>'
                + '<td><input type="text" class="u-input" data-field="protoBCost"></td>'
                + '<td><input type="text" class="u-input" data-field="protoBNre"></td>'
                + '<td><input type="text" class="u-input" data-field="mpCost"></td>'
                + '<td><input type="text" class="u-input" data-field="mpNre"></td>'
                + '<td><input type="text" class="u-input" data-field="note"></td>';
        }
    }
};

// 💡 Address 입력칸 변경 감지 (M.C Table과 동일한 사유 입력 팝업 + 취소 시 원복 방식)
(function() {
    const tbody = document.getElementById('address-table-body');
    if (tbody) {
        tbody.addEventListener('focusin', function(e) {
            if (e.target.matches && e.target.matches('input[data-field]')) e.target.dataset._histOld = e.target.value;
        });
        tbody.addEventListener('change', function(e) {
            const el = e.target;
            if (!el.matches || !el.matches('input[data-field]')) return;
            const tr = el.closest('tr');
            if (!tr) return;
            const nameInp = tr.querySelector('input[data-field="name"]');
            const rowLabel = (nameInp && nameInp.value) ? nameInp.value.trim() : '행';
            const oldVal = el.dataset._histOld !== undefined ? el.dataset._histOld : '';
            if (String(oldVal) === String(el.value)) { if (window.collectAddressData) window.collectAddressData(); return; }

            const fieldLabelMap = { name: '이름', nameEn: '영문 이름', dept: '부서', title: '직함', email: '이메일', mobile: '휴대폰', phone: '근무처 전화', telegramId: '텔레그램 ID' };
            const fieldLabel = fieldLabelMap[el.dataset.field] || el.dataset.field;
            const reason = window.promptOptionalReason(`[${rowLabel}] ${fieldLabel} 변경`);
            if (reason === null) { el.value = oldVal; return; } // 취소 → 원복, 저장/기록 안 함

            window.addrLogChange(rowLabel, el.dataset.field, oldVal, el.value, reason);
            el.dataset._histOld = el.value;
            if (window.collectAddressData) window.collectAddressData();
        });
    }
})();

// 💡 Address 수정이력 — 펼침/접힘
window.addrToggleHistoryBox = function() {
    const body = document.getElementById('addr-history-body');
    const icon = document.getElementById('addr-history-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
    if (!isOpen && window.addrRenderHistoryTable) window.addrRenderHistoryTable();
};

window.addrLogChange = function(rowLabel, field, oldVal, newVal, reason) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.addressChangeLog = window.tabData.addressChangeLog || [];
    window.tabData.addressChangeLog.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal, reason: reason || ''
    });
};

// 💡 수정이력 표 그리기
window.addrRenderHistoryTable = function() {
    const table = document.getElementById('addr-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.addressChangeLog) || [];
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">수정 이력이 없습니다.</td></tr>'; return; }
    const fieldLabel = { name: '이름', nameEn: '영문 이름', dept: '부서', title: '직함', email: '이메일', mobile: '휴대폰', phone: '근무처 전화', telegramId: '텔레그램 ID' };
    const _hisEn = window._currentLang === 'en';
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Name' : '이름') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Field' : '필드') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Before' : '변경 전') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'After' : '변경 후') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Reason' : '사유') + '</th>'
        + '</tr></thead><tbody>';
    logs.slice().reverse().forEach(function(log) {
        html += '<tr><td style="padding:4px 8px; color:#6c757d;">' + log.time + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold; color:#0056b3;">' + (log.userName || (_hisEn ? 'Unknown' : '알 수 없음')) + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold;">' + (log.row || '') + '</td>'
            + '<td style="padding:4px 8px;"><span class="badge" style="background:#e7f1ff; color:#0056b3;">' + (fieldLabel[log.field] || log.field) + '</span></td>'
            + '<td style="padding:4px 8px; color:#c92a2a;">' + (log.oldVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#2f9e44;">' + (log.newVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#6c757d;">' + (log.reason || '-') + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
};

// 💡 Address 수정이력 — 비밀번호 확인 후 날짜 구간 내 기록 삭제 (M.C Table과 동일한 패턴, addressChangeLog만 정리)
window.deleteAddrHistoryByDateRange = function() {
    const pwEl = document.getElementById('addr-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) {
        if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    const fromStr = (document.getElementById('addr-history-del-from') || {}).value;
    const toStr = (document.getElementById('addr-history-del-to') || {}).value;
    if (!fromStr || !toStr) {
        if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.');
        return;
    }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) {
        if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.');
        return;
    }

    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) {
        const ts = parseKoDateTime(log.time);
        return ts !== null && ts >= fromTs && ts <= toTs;
    };

    const doDelete = function() {
        let removedCount = 0;
        if (window.tabData && window.tabData.addressChangeLog && window.tabData.addressChangeLog.length) {
            const before = window.tabData.addressChangeLog.length;
            window.tabData.addressChangeLog = window.tabData.addressChangeLog.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.addressChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        if (window.addrRenderHistoryTable) window.addrRenderHistoryTable();
        const msg = removedCount + '건의 주소록 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };

    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 주소록 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

function bmDataRows(key) {
    const tbody = document.getElementById(BM_CONF[key].tbodyId);
    if (!tbody) return [];
    return Array.prototype.filter.call(tbody.children, function(tr) { return !BM_CONF[key].isSkip(tr); });
}

// 행 전체에 번호 매기기 + NO 클릭 이벤트 연결 (초기 로드, 데이터 복원, 행 변경 후 항상 호출)
window.bmSetupAllRows = function(key) {
    let n = 0;
    bmDataRows(key).forEach(function(tr) {
        const noTd = tr.querySelector('.bm-no');
        if (!noTd) return;
        if (tr.style.display !== 'none') {
            n++;
            noTd.textContent = n;
            tr.classList.remove('mc-zebra-a', 'mc-zebra-b');
            tr.classList.add(n % 2 === 1 ? 'mc-zebra-a' : 'mc-zebra-b');
        }
        noTd.onclick = function(ev) { window.bmOnNoClick(key, tr, ev); };
    });
};

// "펼치기" 버튼: 자동으로 숨겨진(내용 없는) 행을 보이거나 다시 숨김
window._bmExpanded = { bs: false, mc: false };
try {
    window._bmExpanded.bs = localStorage.getItem('gantt_bs_expanded') === '1';
    window._bmExpanded.mc = localStorage.getItem('gantt_mc_expanded') === '1';
} catch (e) {}
// 💡 M.C Table 버튼은 페이지 로드 시 초기 텍스트가 항상 "🔽 펼치기"로 고정돼 있어서,
//    저장된 상태가 "펼침"이어도 버튼만 "접힘"처럼 보이는 불일치가 있었음 → 로드 시 동기화
(function() {
    const mcBtn = document.getElementById('mc-toggle-hidden-btn');
    if (mcBtn) mcBtn.textContent = window._bmExpanded.mc ? (window._currentLang==='en'?'🔼 Collapse':'🔼 접기') : (window._currentLang==='en'?'🔽 Expand':'🔽 펼치기');
    const bsBtn = document.getElementById('bs-toggle-hidden-btn');
    if (bsBtn) bsBtn.textContent = window._bmExpanded.bs ? (window._currentLang==='en'?'🔼 Collapse':'🔼 접기') : (window._currentLang==='en'?'🔽 Expand':'🔽 펼치기');
})();

// "접기" 상태일 때 Model A/B/C 중 전체 데이터가 비어있는 열을 통째로 숨김 (Note 열은 항상 표시)
window.bsRefreshColumnVisibility = function() {
    const tbody = document.getElementById('briefspec-body');
    if (!tbody) return;
    const collapsed = !(window._bmExpanded && window._bmExpanded.bs);
    let visibleCount = 0;
    ['modelA', 'modelB', 'modelC'].forEach(function(field) {
        let hasData = false;
        const inputs = tbody.querySelectorAll('input[data-field="' + field + '"]');
        Array.prototype.forEach.call(inputs, function(inp) {
            if (inp.value && inp.value.trim() !== '') hasData = true;
        });
        const hide = collapsed && !hasData;
        if (!hide) visibleCount++;
        const th = document.querySelector('#tab-briefspec thead th[data-col="' + field + '"]');
        if (th) th.style.display = hide ? 'none' : '';
        Array.prototype.forEach.call(inputs, function(inp) {
            const td = inp.closest('td');
            if (td) td.style.display = hide ? 'none' : '';
        });
    });
    const descTh = document.getElementById('bs-desc-th');
    if (descTh) descTh.colSpan = visibleCount || 1;
};
(function() {
    const tbody = document.getElementById('briefspec-body');
    if (tbody) {
        tbody.addEventListener('input', function(e) {
            const f = e.target && e.target.dataset && e.target.dataset.field;
            if (f === 'modelA' || f === 'modelB' || f === 'modelC') {
                window.bsRefreshColumnVisibility();
            }
        });
    }
})();

window.bsToggleHistoryBox = function() {
    const body = document.getElementById('bs-history-body');
    const icon = document.getElementById('bs-history-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
    if (!isOpen && window.bsRenderHistoryTable) window.bsRenderHistoryTable();
};

window.bsLogChange = function(rowLabel, field, oldVal, newVal, reason) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.bsChangeLog = window.tabData.bsChangeLog || [];
    window.tabData.bsChangeLog.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal, reason: reason || ''
    });
};

window.bsRenderHistoryTable = function() {
    const table = document.getElementById('bs-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.bsChangeLog) || [];
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">수정 이력이 없습니다.</td></tr>'; return; }
    const fieldLabel = { type: 'TYPE', sub: 'TYPE2', modelA: 'Model A', modelB: 'Model B', modelC: 'Model C', note: 'Note' };
    const _hisEn = window._currentLang === 'en';
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">TYPE</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Field' : '필드') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Before' : '변경 전') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'After' : '변경 후') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Reason' : '사유') + '</th>'
        + '</tr></thead><tbody>';
    logs.slice().reverse().forEach(function(log) {
        html += '<tr><td style="padding:4px 8px; color:#6c757d;">' + log.time + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold; color:#0056b3;">' + (log.userName || (_hisEn ? 'Unknown' : '알 수 없음')) + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold;">' + (log.row || '') + '</td>'
            + '<td style="padding:4px 8px;"><span class="badge" style="background:#e7f1ff; color:#0056b3;">' + (fieldLabel[log.field] || log.field) + '</span></td>'
            + '<td style="padding:4px 8px; color:#c92a2a;">' + (log.oldVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#2f9e44;">' + (log.newVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#6c757d;">' + (log.reason || '-') + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
};

window.deleteBsHistoryByDateRange = function() {
    const pwEl = document.getElementById('bs-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) { if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.'); return; }
    const fromStr = (document.getElementById('bs-history-del-from') || {}).value;
    const toStr = (document.getElementById('bs-history-del-to') || {}).value;
    if (!fromStr || !toStr) { if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.'); return; }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) { if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.'); return; }
    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) { const ts = parseKoDateTime(log.time); return ts !== null && ts >= fromTs && ts <= toTs; };
    const doDelete = function() {
        let removedCount = 0;
        if (window.tabData && window.tabData.bsChangeLog && window.tabData.bsChangeLog.length) {
            const before = window.tabData.bsChangeLog.length;
            window.tabData.bsChangeLog = window.tabData.bsChangeLog.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.bsChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        if (window.bsRenderHistoryTable) window.bsRenderHistoryTable();
        const msg = removedCount + '건의 Customer SPEC 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };
    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 Customer SPEC 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

// 💡 Brief SPEC 입력칸 변경 감지 (사유 입력 팝업 + 취소 시 원복)
(function() {
    const tbody = document.getElementById('briefspec-body');
    if (tbody) {
        tbody.addEventListener('focusin', function(e) {
            if (e.target.matches && e.target.matches('input[data-field]')) e.target.dataset._histOld = e.target.value;
        });
        tbody.addEventListener('change', function(e) {
            const el = e.target;
            if (!el.matches || !el.matches('input[data-field]')) return;
            const tr = el.closest('tr');
            if (!tr) return;
            const typeInp = tr.querySelector('input[data-field="type"]');
            const rowLabel = (typeInp && typeInp.value) ? typeInp.value.trim() : '행';
            const oldVal = el.dataset._histOld !== undefined ? el.dataset._histOld : '';
            if (String(oldVal) === String(el.value)) return;
            const fieldLabelMap = { type: 'TYPE', sub: 'TYPE2', modelA: 'Model A', modelB: 'Model B', modelC: 'Model C', note: 'Note' };
            const reason = window.promptOptionalReason(`[${rowLabel}] ${fieldLabelMap[el.dataset.field] || el.dataset.field} 변경`);
            if (reason === null) { el.value = oldVal; return; }
            window.bsLogChange(rowLabel, el.dataset.field, oldVal, el.value, reason);
            el.dataset._histOld = el.value;
        });
    }
})();

window.bmToggleHidden = function(key, btnEl) {
    const tbody = document.getElementById(BM_CONF[key].tbodyId);
    if (!tbody) return;
    const expand = !window._bmExpanded[key];
    window._bmExpanded[key] = expand;
    try { localStorage.setItem('gantt_' + key + '_expanded', expand ? '1' : '0'); } catch (e) {}
    if (btnEl) btnEl.textContent = expand ? (window._currentLang==='en'?'🔼 Collapse':'🔼 접기') : (window._currentLang==='en'?'🔽 Expand':'🔽 펼치기');

    if (key === 'mc' && window.mcRefreshTable) {
        // 💡 M.C Table은 "보이는 행 기준으로 TYPE 글자를 어디에 표시할지"가 펼침/접힘 상태에 따라 달라지므로,
        //    단순히 display만 풀어주면 안 되고 표 전체를 다시 그려야 함
        window.mcRefreshTable();
    } else {
        Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-auto-hidden="1"]'), function(tr) {
            tr.style.display = expand ? '' : 'none';
        });
        window.bmSetupAllRows(key);
    }
    if (key === 'bs' && window.bsRefreshColumnVisibility) window.bsRefreshColumnVisibility();
};

function bmPaintSelection(key) {
    const tbody = document.getElementById(BM_CONF[key].tbodyId);
    if (!tbody) return;
    Array.prototype.forEach.call(tbody.querySelectorAll('tr.bm-selected'), function(tr) { tr.classList.remove('bm-selected'); });
    window._bmSelected[key].forEach(function(tr) { if (tr.parentNode) tr.classList.add('bm-selected'); });
}

function bmClearSelection(key) {
    const tbody = document.getElementById(BM_CONF[key].tbodyId);
    if (tbody) Array.prototype.forEach.call(tbody.querySelectorAll('tr.bm-selected'), function(tr) { tr.classList.remove('bm-selected'); });
    window._bmSelected[key].clear();
    window._bmAnchor[key] = null;
}

function bmClosePopup() {
    const popup = document.getElementById('bm-row-popup');
    if (popup) popup.style.display = 'none';
}

window.bmOnNoClick = function(key, tr, ev) {
    if (window.getSelection) window.getSelection().removeAllRanges();
    const sel = window._bmSelected[key];
    const rows = bmDataRows(key);

    if (ev && ev.shiftKey && window._bmAnchor[key]) {
        const a = rows.indexOf(window._bmAnchor[key]);
        const b = rows.indexOf(tr);
        sel.clear();
        if (a !== -1 && b !== -1) {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            for (let k = lo; k <= hi; k++) sel.add(rows[k]);
        } else { sel.add(tr); }
        bmPaintSelection(key);
        bmOpenPopup(key, tr);
        return;
    }
    if (ev && (ev.ctrlKey || ev.metaKey)) {
        if (sel.has(tr)) sel.delete(tr); else sel.add(tr);
        window._bmAnchor[key] = tr;
        bmPaintSelection(key);
        if (sel.size > 0) bmOpenPopup(key, tr); else bmClosePopup();
        return;
    }
    // 같은 행 한 개만 선택된 상태에서 다시 클릭하면 닫기
    const popup = document.getElementById('bm-row-popup');
    if (popup && popup.style.display === 'block' && popup.dataset.key === key && sel.size === 1 && sel.has(tr)) {
        bmClosePopup();
        bmClearSelection(key);
        return;
    }
    sel.clear(); sel.add(tr);
    window._bmAnchor[key] = tr;
    bmPaintSelection(key);
    bmOpenPopup(key, tr);
};

function bmOpenPopup(key, refTr) {
    let popup = document.getElementById('bm-row-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'bm-row-popup';
        popup.className = 'bm-row-popup';
        popup.innerHTML =
            '<div style="display:grid; grid-template-columns:repeat(2,33px); grid-template-rows:repeat(2,33px); gap:4px; align-items:center; justify-items:center;">'
            + '<span id="bm-up"  class="bm-pop-btn" title="위로 이동(묶음)"><i class="ti ti-chevron-up"></i></span>'
            + '<span id="bm-dn"  class="bm-pop-btn" title="아래로 이동(묶음)"><i class="ti ti-chevron-down"></i></span>'
            + '<span id="bm-add" class="bm-pop-btn bm-pop-add" title="행 추가"><i class="ti ti-plus"></i></span>'
            + '<span id="bm-del" class="bm-pop-btn bm-pop-del bm-pop-danger" title="행 삭제"><i class="ti ti-minus"></i></span>'
            + '</div>';
        document.body.appendChild(popup);
        _makeFloatingPopupDraggable(popup);
        document.addEventListener('click', function(e) {
            if (!popup.contains(e.target) && !e.target.closest('.bm-no')) {
                bmClosePopup();
                bmClearSelection('bs');
                bmClearSelection('mc');
                bmClearSelection('addr');
            }
        });
        // 💡 [핵심 수정] 버튼을 매번 cloneNode로 교체하던 방식을 제거하고,
        //    절대 사라지지 않는 팝업 컨테이너에 이벤트 위임 리스너를 "딱 한 번만" 붙인다.
        //    표가 몇 번을 다시 그려져도 이 버튼들은 그대로 유지되므로 클릭이 씹힐 일이 없다.
        //    실행 대상(key/refTr)은 클릭 시점에 popup._bmKey / popup._bmRefTr 에서 읽는다.
        popup.addEventListener('click', function(e) {
            const btn = e.target.closest('.bm-pop-btn');
            if (!btn) return;
            const k = popup._bmKey, tr = popup._bmRefTr;
            if (btn.id === 'bm-up') bmMoveSelected(k, -1);
            else if (btn.id === 'bm-dn') bmMoveSelected(k, 1);
            else if (btn.id === 'bm-add') bmAddAfter(k, tr);
            else if (btn.id === 'bm-del') bmDeleteSelected(k);
        });
    }
    popup.dataset.key = key;
    popup._bmKey = key;
    popup._bmRefTr = refTr;

    const noTd = refTr.querySelector('.bm-no');
    const rect = noTd.getBoundingClientRect();
    popup.style.display = 'block';
    const popupW = popup.offsetWidth, popupH = popup.offsetHeight;
    let top = rect.top + window.scrollY;
    let left = rect.right + window.scrollX + 5;
    if (left + popupW > window.innerWidth) left = rect.left + window.scrollX - popupW - 5;
    if (top + popupH > window.innerHeight + window.scrollY) top = rect.bottom + window.scrollY - popupH;
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
}

// 선택된 행들을 묶음으로 위/아래 이동 (순서 유지)
function bmMoveSelected(key, dir) {
    const sel = window._bmSelected[key];
    if (!sel || sel.size === 0) return;
    const tbody = document.getElementById(BM_CONF[key].tbodyId);
    const rows = bmDataRows(key);
    const selArr = rows.filter(function(tr) { return sel.has(tr); });
    if (selArr.length === 0) return;
    const selSet = new Set(selArr);
    let target = null;

    // 💡 M.C Table은 TYPE 그룹 경계를 넘어가는 이동을 막음 — SUBTOTAL 구간이 흔들리지 않도록
    //    (TYPE 칸이 빈칸인 행은 "위쪽에서 가장 가까운 값"을 그 행의 TYPE으로 간주 — 화면 렌더링과 동일 규칙)
    let effTypes = null, blockType = null;
    if (key === 'mc') {
        let lastType = '';
        effTypes = rows.map(function(tr) {
            const inp = tr.querySelector('input[data-field="type"]');
            const v = inp ? inp.value.trim() : '';
            if (v) lastType = v;
            return lastType;
        });
        blockType = effTypes[rows.indexOf(selArr[0])];
    }

    if (dir === -1) {
        const firstIdx = rows.indexOf(selArr[0]);
        for (let i = firstIdx - 1; i >= 0; i--) { if (!selSet.has(rows[i])) { target = rows[i]; break; } }
        if (!target) return;
        if (key === 'mc' && effTypes[rows.indexOf(target)] !== blockType) return; // 다른 TYPE 그룹 경계 — 이동 중단
        selArr.forEach(function(tr) { tbody.insertBefore(tr, target); });
    } else {
        const lastIdx = rows.indexOf(selArr[selArr.length - 1]);
        for (let j = lastIdx + 1; j < rows.length; j++) { if (!selSet.has(rows[j])) { target = rows[j]; break; } }
        if (!target) return;
        if (key === 'mc' && effTypes[rows.indexOf(target)] !== blockType) return; // 다른 TYPE 그룹 경계 — 이동 중단
        let anchor = target;
        selArr.forEach(function(tr) { anchor.after(tr); anchor = tr; });
    }

    // 💡 M.C Table은 TYPE/SUBTOTAL 재계산을 위해 표 전체를 다시 그려야 하지만,
    //    누르고 있는 동안 매번 다시 그리면 위치 추정이 틀어져 연속 누르기가 끊길 수 있음.
    //    → 누르는 동안은 DOM만 재배열(다른 탭과 동일), 재계산은 손을 뗄 때 한 번만(stopRepeat에서 처리)
    window.bmSetupAllRows(key);
    bmPaintSelection(key);
    const popup = document.getElementById('bm-row-popup');
    if (popup) popup.dataset.key = key;
    if (key === 'mc') { window._bmMcDirty = true; setTimeout(window.mcFlushDirty, 0); }
}

// 💡 완전히 빈 테이블(첫 행이 하나도 없어서 우클릭할 대상 자체가 없는 경우)에 첫 행을 추가
window.bmAddFirstRow = function(key) {
    const tbody = document.getElementById(BM_CONF[key].tbodyId);
    if (!tbody) return;
    tbody.innerHTML = ''; // 💡 "행이 없습니다" 안내 줄을 먼저 비우고 새 행만 남김
    const tr = document.createElement('tr');
    tr.innerHTML = BM_CONF[key].rowHtml();
    tbody.appendChild(tr);
    window._bmSelected[key] = window._bmSelected[key] || new Set();
    window._bmSelected[key].clear();
    window._bmSelected[key].add(tr);
    window._bmAnchor[key] = tr;
    window.bmSetupAllRows(key);
    bmPaintSelection(key);
    if (key === 'mc') { window._bmMcDirty = true; setTimeout(window.mcFlushDirty, 0); }
};

function bmAddAfter(key, refTr) {
    const sel = window._bmSelected[key];
    const rows = bmDataRows(key);
    let basis = refTr;
    if (sel && sel.size > 1) {
        const selArr = rows.filter(function(tr) { return sel.has(tr); });
        basis = selArr[selArr.length - 1];
    }
    const basisIdx = rows.indexOf(basis);
    const tr = document.createElement('tr');
    tr.innerHTML = BM_CONF[key].rowHtml();
    basis.after(tr);
    sel.clear(); sel.add(tr);
    window._bmAnchor[key] = tr;
    window.bmSetupAllRows(key);
    bmPaintSelection(key);

    // 💡 M.C Table은 클릭 즉시(다음 tick) 재계산
    if (key === 'mc') {
        window._bmMcDirty = true;
        setTimeout(window.mcFlushDirty, 0);
    } else {
        const popup = document.getElementById('bm-row-popup');
        if (popup) popup.dataset.key = key;
    }
}

// 💡 [2026-08-28 버그 수정] 이 모달은 원래 삭제 확인용으로 만들어져 확인 버튼이 "삭제"로 하드코딩돼
//    있었는데, restoreAiTaskDateAll()처럼 삭제가 아닌 확인(예: 복원)에도 그대로 재사용되면서 "복원할까요?"
//    라는 메시지에 "삭제" 버튼이 붙는 문제가 있었다. okLabel/okColor를 선택적으로 받아서, 안 넘기면
//    기존 삭제용 7곳(빨간 "삭제")은 그대로 동작하고 필요한 곳만 라벨/색을 바꿀 수 있게 함.
function bmConfirmModal(message, onYes, okLabel, okColor) {
    let modal = document.getElementById('bm-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bm-confirm-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
        modal.innerHTML =
            '<div style="background:#fff;border-radius:10px;padding:26px 30px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;">'
            + '<div id="bm-confirm-msg" style="font-size:14px;color:#333;margin-bottom:20px;"></div>'
            + '<div style="display:flex;gap:12px;justify-content:center;">'
            + '<button id="bm-confirm-ok" style="padding:9px 26px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;">삭제</button>'
            + '<button id="bm-confirm-cancel" style="padding:9px 26px;background:#dee2e6;color:#333;border:none;border-radius:7px;font-size:14px;cursor:pointer;">취소</button>'
            + '</div></div>';
        document.body.appendChild(modal);
    }
    document.getElementById('bm-confirm-msg').textContent = message;
    modal.style.display = 'flex';
    const okBtn = document.getElementById('bm-confirm-ok');
    const cancelBtn = document.getElementById('bm-confirm-cancel');
    const newOk = okBtn.cloneNode(true); okBtn.parentNode.replaceChild(newOk, okBtn);
    const newCancel = cancelBtn.cloneNode(true); cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    const finalOk = document.getElementById('bm-confirm-ok');
    finalOk.textContent = okLabel || '삭제';
    // 💡 [2026-08-29 파스텔 통일] okColor로 넘어오는 원색(#e03131/#0056b3 등)을 그대로 칠하는 대신
    //    같은 계열의 파스텔 3종(배경/테두리/글자)으로 매핑해서 적용 — 호출부 시그니처는 그대로 유지.
    const _bmPastel = {
        '#e03131': { bg: '#fbe4e2', border: '#eeb0ac', text: '#b1432f', hoverBg: '#f5c2bd', hoverBorder: '#e08f87' },
        '#0056b3': { bg: '#e8f4fd', border: '#a5c8f0', text: '#1a4f7a', hoverBg: '#cfe6fa', hoverBorder: '#7fb0dd' },
        '#2f9e44': { bg: '#e6f6ea', border: '#a8dab8', text: '#1f7a3d', hoverBg: '#c9ecd3', hoverBorder: '#7cc494' },
        '#e67e22': { bg: '#fbead9', border: '#edbf85', text: '#a85d0a', hoverBg: '#f4d9b3', hoverBorder: '#dba354' },
    };
    const _bmC = _bmPastel[okColor] || _bmPastel['#e03131'];
    finalOk.style.background = _bmC.bg; finalOk.style.color = _bmC.text; finalOk.style.border = '1px solid ' + _bmC.border;
    finalOk.onmouseover = function() { finalOk.style.background = _bmC.hoverBg; finalOk.style.borderColor = _bmC.hoverBorder; };
    finalOk.onmouseout = function() { finalOk.style.background = _bmC.bg; finalOk.style.borderColor = _bmC.border; };
    finalOk.addEventListener('click', function() { modal.style.display = 'none'; onYes(); });
    document.getElementById('bm-confirm-cancel').addEventListener('click', function() { modal.style.display = 'none'; });
}

function bmAlertModal(message) {
    let modal = document.getElementById('bm-alert-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bm-alert-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
        modal.innerHTML =
            '<div style="background:#fff;border-radius:10px;padding:26px 30px;min-width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;">'
            + '<div id="bm-alert-msg" style="font-size:14px;color:#333;margin-bottom:18px;"></div>'
            + '<button id="bm-alert-ok" onmouseover="this.style.background=\'#cfe6fa\'; this.style.borderColor=\'#7fb0dd\';" onmouseout="this.style.background=\'#e8f4fd\'; this.style.borderColor=\'#a5c8f0\';" style="padding:9px 26px;background:#e8f4fd;color:#1a4f7a;border:1px solid #a5c8f0;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s, border-color .15s;">' + (window._currentLang === 'en' ? 'OK' : '확인') + '</button></div>';
        document.body.appendChild(modal);
    }
    document.getElementById('bm-alert-msg').textContent = message;
    modal.style.display = 'flex';
    const okBtn = document.getElementById('bm-alert-ok');
    const newOk = okBtn.cloneNode(true); okBtn.parentNode.replaceChild(newOk, okBtn);
    document.getElementById('bm-alert-ok').addEventListener('click', function() { modal.style.display = 'none'; });
}

function bmDeleteSelected(key) {
    const sel = window._bmSelected[key];
    if (!sel || sel.size === 0) return;
    const rows = bmDataRows(key);
    // 💡 M.C Table은 "➕ 첫 행 추가" 버튼으로 언제든 다시 시작할 수 있어서 완전 삭제(0행)를 허용.
    //    다른 탭(Brief SPEC/Address)은 아직 빈 상태 복구 UI가 없으므로 기존처럼 최소 1행 유지.
    if (key !== 'mc' && rows.length - sel.size < 1) { bmAlertModal('최소 1개 행은 있어야 합니다.'); return; }
    bmConfirmModal('선택한 ' + sel.size + '개 행을 삭제하시겠습니까?', function() {
        sel.forEach(function(tr) { if (tr.parentNode) tr.remove(); });
        sel.clear();
        window._bmAnchor[key] = null;
        window.bmSetupAllRows(key);
        bmClosePopup();
        // 💡 M.C Table은 TYPE 열 rowspan/SUBTOTAL을 다시 계산해야 함
        if (key === 'mc' && window.mcRefreshTable) window.mcRefreshTable();
    });
}

// ═══════════════════════════════════════════════════════════
// 🖥️ M.C Table 디스플레이 종류(BTN/MAIN/UPR/TPR) — 2단계: 화면 UI
//    ⚠️ 아직 탭을 눌러도 테이블 데이터 자체는 안 바뀝니다 (3단계에서 연결)
// ═══════════════════════════════════════════════════════════
const MC_UNIT_LABELS = { BTN: 'BTN(버튼덱)', MAIN: 'MAIN', UPR: 'UPR(어퍼)', TPR: 'TPR(토퍼)' };

// 💡 [2026-08-30 개편 → 같은 날 재수정] ✏️(이름변경)➕(추가)🗑️(삭제) 3개 아이콘이 제목줄에 항상 떠 있어
// 공간을 많이 차지한다는 지적 — 토글 버튼 하나만 항상 보이게 하고, 누르면 나머지가 옆으로 슬라이드
// 펼쳐지도록(mc-unit-actions-open, max-width 트랜지션) 개편. 토글 버튼은 처음엔 연필(✏️)이었는데,
// "연필 대신 펼침/접힘을 나타내는 화살표(삼각형)로 바꿔달라"는 요청으로 ▶(닫힘, 누르면 펼침) /
// ◀(열림, 누르면 접힘)으로 교체 — 펼침 패널 안쪽은 아이콘만(✏️/➕/🗑️) 보이도록 "이름변경" 텍스트도
// 뺐다. 제품구분자가 하나도 없는 상태(아직 이 기능을 안 쓰는 프로젝트)에선 관리할 대상 자체가
// 없으므로 화살표 없이 ➕(시작하기)만 노출한다.
window._mcUnitActionsOpen = false;
window.mcToggleUnitActions = function() {
    window._mcUnitActionsOpen = !window._mcUnitActionsOpen;
    const panel = document.getElementById('mc-unit-actions-panel');
    const toggleBtn = document.getElementById('mc-unit-actions-toggle');
    if (panel) panel.classList.toggle('mc-unit-actions-open', window._mcUnitActionsOpen);
    if (toggleBtn) {
        toggleBtn.style.background = window._mcUnitActionsOpen ? '#e9ecef' : 'none';
        // 🐛 [2026-08-30 버그 수정] 화살표 방향(▶/◀)이 mcRenderUnitTabs 전체 재렌더 때만 갱신되고
        // 이 가벼운 토글 함수에서는 안 바뀌어서, 펼친 뒤에도 계속 ▶로 보이는 버그가 있었음.
        toggleBtn.textContent = window._mcUnitActionsOpen ? '◀' : '▶';
        toggleBtn.title = window._mcUnitActionsOpen ? '접기' : '제품구분자 관리(이름변경/추가/삭제)';
    }
};
window.mcRenderUnitTabs = function() {
    const bar = document.getElementById('mc-unit-bar');
    if (!bar) return;
    const units = window.getMcUnits();

    const defaultRevs = window.tabData.mcRevisions || {};
    const hasDefaultData = Object.keys(defaultRevs).some(function(k) { return defaultRevs[k] && defaultRevs[k].length; });

    if (!units.length) {
        // 아직 제품구분자를 안 쓰는 상태 — 관리할 게 없으니 연필 패널 없이 "시작하기" ➕만 노출
        if (!hasDefaultData) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        bar.style.display = 'flex';
        bar.innerHTML = '<button id="mc-add-unit-btn" onclick="window.mcAddUnit()" title="제품구분자 추가" style="margin:0 8px 0 0; padding:6px 8px; min-width:auto; border:none; background:none; color:#2c5f8a; cursor:pointer; font-size:14px;">➕</button>';
        return;
    }

    bar.style.display = 'flex';
    const cur = window.mcActiveUnit || units[0];
    const isOpen = !!window._mcUnitActionsOpen;
    // 💡 이름 순환 버튼(클릭할 때마다 다음 제품구분자로 전환)은 그대로 항상 보이고, 이름변경/추가/삭제는
    // 연필 토글 뒤 펼침 패널로 이동.
    bar.innerHTML =
        '<button class="mc-unit-btn" onclick="window.mcCycleUnit()" title="클릭할 때마다 다음 제품구분자로 전환"'
        + ' style="padding:6px 10px; min-width:auto; border:1px solid #c9b8f0; border-radius:5px; cursor:pointer; font-size:12px; font-weight:bold; background:#ede9fb; color:#6741d9;">'
        + escapeHtml(cur) + '</button>'
        + '<button id="mc-unit-actions-toggle" onclick="window.mcToggleUnitActions()" title="' + (isOpen ? '접기' : '제품구분자 관리(이름변경/추가/삭제)') + '" style="margin:0 2px; padding:6px 8px; min-width:auto; border:none; background:' + (isOpen ? '#e9ecef' : 'none') + '; color:#555; cursor:pointer; font-size:12px;">' + (isOpen ? '◀' : '▶') + '</button>'
        + '<div id="mc-unit-actions-panel" class="' + (isOpen ? 'mc-unit-actions-open' : '') + '">'
        + '<button id="mc-unit-rename-btn" onclick="window.mcRenameUnit(\'' + escapeHtml(cur).replace(/'/g, "\\'") + '\')" title="이름 바꾸기" style="margin:0 2px 0 6px; padding:6px 8px; min-width:auto; border:none; border-radius:4px; background:#e0f5f7; color:#00707d; cursor:pointer; font-size:14px;">✏️</button>'
        + '<button id="mc-add-unit-btn" onclick="window.mcAddUnit()" title="제품구분자 추가" style="margin:0 2px; padding:6px 8px; min-width:auto; border:none; background:none; color:#2c5f8a; cursor:pointer; font-size:14px;">➕</button>'
        + '<button id="mc-remove-unit-btn" onclick="window.mcRemoveUnit(window.mcActiveUnit)" title="현재 제품구분자 제거" style="margin:0 2px; padding:6px 8px; min-width:auto; border:none; background:none; color:#e03131; cursor:pointer; font-size:14px;">🗑️</button>'
        + '</div>';
};

// 💡 제품구분자 순환 버튼 — 누를 때마다 다음 제품구분자로 전환 (없으면 처음으로 돌아감)
window.mcCycleUnit = function() {
    const units = window.getMcUnits();
    if (!units.length) return;
    const cur = window.mcActiveUnit || units[0];
    const idx = units.indexOf(cur);
    const next = units[(idx + 1) % units.length];
    window.mcSwitchUnit(next);
};

// 종류 추가: 커스텀 팝업으로 이름 직접 입력 (예시 문구 드래그 선택/복사 가능)
window.mcAddUnit = function() {
    const ov = document.getElementById('mc-add-unit-overlay');
    const input = document.getElementById('mc-add-unit-input');
    const titleEl = document.getElementById('mc-add-unit-title');
    const descEl = document.getElementById('mc-add-unit-desc');
    if (!ov || !input) return;

    const units = window.getMcUnits();
    const defaultRevs = window.tabData.mcRevisions || {};
    const hasDefaultData = Object.keys(defaultRevs).some(function(k) { return defaultRevs[k] && defaultRevs[k].length; });
    // 💡 "이름 붙이기 모드"는 지금 화면이 진짜 "이름 없는 상태"(mcActiveUnit이 비어있음)일 때만.
    //    이미 어떤 제품구분자(MVD 등)를 보고 있는 중이면, 그건 "새로운 구분자 추가"이지 "이름 붙이기"가 아님.
    const isNaming = !window.mcActiveUnit && hasDefaultData;

    ov.dataset.mode = isNaming ? 'name-existing' : 'add-new';
    const _muEn = window._currentLang === 'en';
    if (titleEl) titleEl.textContent = isNaming
        ? (_muEn ? '📌 Please name the existing M.C Table data' : '📌 지금 있는 M.C Table 데이터, 제품구분자를 정해주세요')
        : (_muEn ? '➕ Add Product Category' : '➕ 제품구분자 추가');
    if (descEl) descEl.innerHTML = isNaming
        ? (_muEn
            ? 'Your existing estimates (R1~R5) will be kept as-is — only a <b>label</b> will be added.<br>e.g.) BTN (Button Deck), MAIN (MVD), UPR (TVD,Upper), TPR (Topper)<br>※ If cancelled, saved as <b>"Unassigned"</b> — you can rename it anytime.'
            : '지금까지 입력하신 견적(R1~R5)은 그대로 유지되고, <b>이름표만</b> 붙습니다.<br>예시) BTN (Button Deck), MAIN (MVD), UPR (TVD,Upper), TPR (Topper)<br>※ 취소하시면 우선 \"미지정\"으로 저장되고, 나중에 언제든 바꾸실 수 있습니다.')
        : (_muEn
            ? 'e.g.) BTN (Button Deck), MAIN (MVD), UPR (TVD,Upper), TPR (Topper)<br>※ Any name that fits your project is fine.'
            : '예시) BTN (Button Deck), MAIN (MVD), UPR (TVD,Upper), TPR (Topper)<br>※ 위 예시가 아니어도, 이 프로젝트에 맞는 이름을 자유롭게 적으셔도 됩니다.');

    input.value = '';
    ov.style.display = 'flex';
    setTimeout(function() { input.focus(); }, 50);
};

// 💡 이미 있는 제품구분자의 이름을 바꿈 (같은 팝업을 "이름변경 모드"로 재사용)
window.mcRenameUnit = function(oldName) {
    const ov = document.getElementById('mc-add-unit-overlay');
    const input = document.getElementById('mc-add-unit-input');
    const titleEl = document.getElementById('mc-add-unit-title');
    const descEl = document.getElementById('mc-add-unit-desc');
    if (!ov || !input) return;
    ov.dataset.mode = 'rename';
    ov.dataset.renameTarget = oldName;
    const _mrEn = window._currentLang === 'en';
    if (titleEl) titleEl.textContent = _mrEn ? '✏️ Rename "' + oldName + '"' : '✏️ "' + oldName + '" 이름 바꾸기';
    if (descEl) descEl.innerHTML = _mrEn ? 'Enter a new name. (Existing estimate data will be kept.)' : '새 이름을 입력하세요. (기존 견적 데이터는 그대로 유지됩니다)';
    input.value = oldName;
    ov.style.display = 'flex';
    setTimeout(function() { input.focus(); input.select(); }, 50);
};

// 💡 데이터는 있는데 아직 제품구분자가 하나도 없으면, 자동으로 이름 지정 팝업을 띄움
//    (엑셀/프로젝트를 불러온 직후 호출됨)
window.mcCheckNeedsNaming = function() {
    // 💡 이미 제품구분자가 하나라도 등록되어 있다면, 맨 위 mcRevisions는 진짜 "이름 없는 새 데이터"가
    //    아니라 예전 활성화면의 잔재일 뿐이므로 다시 물어보지 않음 (아래 mcNormalizeAfterLoad가 정리함)
    if (window.getMcUnits().length > 0) return;
    const defaultRevs = window.tabData.mcRevisions || {};
    const hasDefaultData = Object.keys(defaultRevs).some(function(k) { return defaultRevs[k] && defaultRevs[k].length; });
    if (hasDefaultData && !window.mcActiveUnit) {
        window.mcAddUnit();
    }
};

// 💡 공용: tabData를 통째로 교체하는 모든 불러오기 경로(드라이브 등)에서 호출.
//    mcActiveUnit/mcRevisions 포인터를 다시 정합성 있게 맞추고, 화면(탭 바)도 갱신하고,
//    이름표 없는 데이터가 있으면 자동으로 이름 확인 팝업을 띄움.
window.mcNormalizeAfterLoad = function() {
    window.tabData = window.tabData || {};
    window.tabData.mcRevisionsByUnit = window.tabData.mcRevisionsByUnit || {};
    window.tabData.mcSalesPriceDetailByUnit = window.tabData.mcSalesPriceDetailByUnit || {};
    window.tabData.mcUnits = window.tabData.mcUnits || [];

    if (window.tabData.mcUnits.length > 0) {
        // 💡 이미 이름 붙은 제품구분자가 있으면, 맨 위 mcRevisions(저장 시점 잔재)는 버리고
        //    "첫 번째 제품구분자"를 곧바로 활성화해서 그 데이터가 즉시 보이도록 함
        window.tabData.mcRevisionsByUnit[''] = {};
        window.tabData.mcSalesPriceDetailByUnit[''] = {};
        const firstUnit = window.tabData.mcUnits[0];
        window.mcActiveUnit = firstUnit;
        window.tabData.mcRevisionsByUnit[firstUnit] = window.tabData.mcRevisionsByUnit[firstUnit] || {};
        window.tabData.mcSalesPriceDetailByUnit[firstUnit] = window.tabData.mcSalesPriceDetailByUnit[firstUnit] || {};
        window.tabData.mcRevisions = window.tabData.mcRevisionsByUnit[firstUnit];
        window.tabData.mcSalesPriceDetail = window.tabData.mcSalesPriceDetailByUnit[firstUnit];
    } else {
        // 진짜 단일(구분자 없음) 프로젝트: 지금까지처럼 그대로 기본 자리로 재연결
        window.mcActiveUnit = '';
        window.tabData.mcRevisionsByUnit[''] = window.tabData.mcRevisions || window.tabData.mcRevisionsByUnit[''] || {};
        window.tabData.mcSalesPriceDetailByUnit[''] = window.tabData.mcSalesPriceDetail || window.tabData.mcSalesPriceDetailByUnit[''] || {};
        window.tabData.mcRevisions = window.tabData.mcRevisionsByUnit[''];
        window.tabData.mcSalesPriceDetail = window.tabData.mcSalesPriceDetailByUnit[''];
    }

    if (window.mcRenderUnitTabs) window.mcRenderUnitTabs();
    // 💡 불러온 직후엔 항상 "이 종류의 가장 최신(금액 있는) 리비전"을 기본으로 보여줌
    window.tabData.mcActiveRevision = window._mcLatestRevWithData(window.tabData.mcRevisions);
    if (window.populateTabData) window.populateTabData();
    setTimeout(window.mcCheckNeedsNaming, 300);
};

window.mcAddUnitCancel = function() {
    const ov = document.getElementById('mc-add-unit-overlay');
    if (!ov) return;
    if (ov.dataset.mode === 'name-existing') {
        // 💡 이름 없는 상태로 둘 수 없으므로, 취소하면 "미지정"으로 자동 저장
        const input = document.getElementById('mc-add-unit-input');
        if (input) input.value = '미지정';
        window.mcAddUnitConfirm();
        return;
    }
    ov.style.display = 'none';
};

window.mcAddUnitConfirm = function() {
    const input = document.getElementById('mc-add-unit-input');
    const name = (input ? input.value : '').trim();
    if (!name) { alert('이름을 입력해주세요.'); return; }
    const units = window.getMcUnits();
    if (units.some(function(u) { return u.toLowerCase() === name.toLowerCase(); })) {
        alert('"' + name + '"은 이미 추가되어 있습니다.');
        return;
    }

    const ov = document.getElementById('mc-add-unit-overlay');
    const isNaming = ov && ov.dataset.mode === 'name-existing';
    const isRenaming = ov && ov.dataset.mode === 'rename';

    if (isRenaming) {
        const oldName = ov.dataset.renameTarget;
        if (name !== oldName) {
            if (units.some(function(u) { return u.toLowerCase() === name.toLowerCase() && u !== oldName; })) {
                alert('"' + name + '"은 이미 다른 제품구분자로 사용 중입니다.');
                return;
            }
            const idx = units.indexOf(oldName);
            if (idx !== -1) units[idx] = name;
            window.tabData.mcRevisionsByUnit = window.tabData.mcRevisionsByUnit || {};
            window.tabData.mcSalesPriceDetailByUnit = window.tabData.mcSalesPriceDetailByUnit || {};
            window.tabData.mcRevisionsByUnit[name] = window.tabData.mcRevisionsByUnit[oldName];
            window.tabData.mcSalesPriceDetailByUnit[name] = window.tabData.mcSalesPriceDetailByUnit[oldName];
            delete window.tabData.mcRevisionsByUnit[oldName];
            delete window.tabData.mcSalesPriceDetailByUnit[oldName];
            if (window.mcActiveUnit === oldName) window.mcActiveUnit = name;
            window.mcRenderUnitTabs();
        }
    } else if (isNaming) {
        // 💡 기존 데이터를 통째로 이 이름으로 이관 (내용은 그대로, 이름표만 붙임)
        window.tabData.mcRevisionsByUnit = window.tabData.mcRevisionsByUnit || {};
        window.tabData.mcSalesPriceDetailByUnit = window.tabData.mcSalesPriceDetailByUnit || {};
        const movedRevisions = window.tabData.mcRevisions || {};
        const movedSales = window.tabData.mcSalesPriceDetail || {};
        window.tabData.mcRevisionsByUnit[name] = movedRevisions;
        window.tabData.mcSalesPriceDetailByUnit[name] = movedSales;
        // 💡 "기본" 자리는 반드시 완전히 삭제 — 지우지 않으면 새 이름과 같은 객체를 계속 같이 가리켜서
        //    엑셀 내보내기 때 "이름 없음"과 "새 이름" 두 시트로 중복 생성됨
        delete window.tabData.mcRevisionsByUnit[''];
        delete window.tabData.mcSalesPriceDetailByUnit[''];
        units.push(name);
        window.mcActiveUnit = name;
        window.tabData.mcRevisions = movedRevisions;
        window.tabData.mcSalesPriceDetail = movedSales;
        window.tabData.mcTable = movedRevisions.R1 || [];
        window.mcRenderUnitTabs();
        window.populateTabData();
    } else {
        // 새 빈 종류 추가 (기존 동작)
        units.push(name);
        window.mcRenderUnitTabs();
    }
    if (ov) { ov.dataset.mode = ''; ov.dataset.renameTarget = ''; ov.style.display = 'none'; }
};

// 종류 제거 (프로젝트 목록에서만 빼고, 저장된 견적 데이터는 유지)
// 💡 [2026-08-24 안전장치 추가] 예전엔 "저장된 견적 데이터는 지워지지 않고 보관되므로"라는 이유로
//    확인창도 없이 클릭 한 번에 바로 지워졌음 — 그런데 탭 목록에서는 사라져서 사용자 입장에선 사실상
//    "지워진 것"처럼 보이고, 다시 찾으려면 코드/Drive를 뒤져야 해서 실수로 누르기엔 너무 쉬웠음.
//    확인창 + 관리자 비밀번호 인증(계획 삭제 등 다른 파괴적 액션과 동일한 절차)을 추가함.
window.mcRemoveUnit = function(unit) {
    if (!unit) return;
    if (!confirm(`"${unit}" 제품구분자를 삭제할까요?\n(입력된 데이터는 남지만 탭 목록에서 사라져 다시 찾기 어려워집니다)`)) return;
    if (!window.verifyAdminPassword(`🔒 "${unit}" 제품구분자를 삭제하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)`)) {
        alert('❌ 비밀번호 인증 실패. 삭제가 취소되었습니다.');
        return;
    }
    const units = window.getMcUnits();
    const idx = units.indexOf(unit);
    if (idx !== -1) units.splice(idx, 1);
    if (window.mcActiveUnit === unit) window.mcActiveUnit = '';
    window.mcRenderUnitTabs();
};

// 종류 전환: 현재 화면 내용을 지금 종류에 저장하고, mcRevisions/mcSalesPriceDetail "포인터"를
// 선택한 종류의 저장소로 바꿔치기 → 기존의 모든 리비전/영업판가/비교표 코드는 그대로 두고
// 올바른 종류의 데이터를 자동으로 보게 됨
window.mcSwitchUnit = function(unit) {
    if (window.mcFlushChangeReasons) window.mcFlushChangeReasons(); // 💡 종류 이동 전, 쌓인 변경사항 사유를 한 번에 확인
    window.tabData = window.tabData || {};
    window.tabData.mcRevisions = window.tabData.mcRevisions || {};
    window.tabData.mcSalesPriceDetail = window.tabData.mcSalesPriceDetail || {};

    // 1. 지금 화면 내용을 현재 리비전에 저장
    const curRev = window.tabData.mcActiveRevision || 'R1';
    window.tabData.mcRevisions[curRev] = _readRowsFromTbody('mctable-body');

    // 2. 현재 종류의 저장소를 보관 (다음에 다시 이 종류로 돌아올 때 쓰임)
    const curKey = window.mcActiveUnit || '';
    window.tabData.mcRevisionsByUnit = window.tabData.mcRevisionsByUnit || {};
    window.tabData.mcRevisionsByUnit[curKey] = window.tabData.mcRevisions;
    window.tabData.mcSalesPriceDetailByUnit = window.tabData.mcSalesPriceDetailByUnit || {};
    window.tabData.mcSalesPriceDetailByUnit[curKey] = window.tabData.mcSalesPriceDetail;

    // 3. 새 종류로 포인터 전환 (기존에 저장된 게 있으면 이어서, 없으면 새로 시작)
    const newKey = unit || '';
    window.mcActiveUnit = newKey;
    window.tabData.mcRevisions = window.tabData.mcRevisionsByUnit[newKey] || {};
    window.tabData.mcSalesPriceDetail = window.tabData.mcSalesPriceDetailByUnit[newKey] || {};
    window.tabData.mcRevisionsByUnit[newKey] = window.tabData.mcRevisions;
    window.tabData.mcSalesPriceDetailByUnit[newKey] = window.tabData.mcSalesPriceDetail;
    // 💡 종류를 바꾸면 그 종류의 "최신(금액 있는) 리비전"을 기본으로 보여줌
    window.tabData.mcActiveRevision = window._mcLatestRevWithData(window.tabData.mcRevisions);

    // 💡 비교 화면이 열려있으면 일반 화면으로 복귀 후 전환 (mcSwitchRevision과 동일한 처리)
    const compSection = document.getElementById('mc-comparison-section');
    if (compSection && compSection.style.display !== 'none') window.mcHideComparison();

    window.populateTabData();
    window.mcRenderUnitTabs();

    document.querySelectorAll('.mc-rev-btn').forEach(function(b) {
        const active = b.dataset.rev === (window.tabData.mcActiveRevision || 'R1');
        b.classList.toggle('active', active);
        // 💡 항상 outline(흰바탕+파란글씨) 유지 — hover 시에만 채워지도록. 현재 리비전 표시는 라벨 텍스트로 충분.
        b.style.background = '#fff';
        b.style.color = '#2c5f8a';
        b.style.fontWeight = 'bold';
    });
};

// 💡 금액 필드 중 하나라도 값이 있으면 "실제 데이터 있음"으로 간주 (엑셀 저장 로직과 동일 기준)
window._mcHasRealMoney = function(rows) {
    if (!rows || !rows.length) return false;
    const moneyFields = ['protoCost', 'protoNre', 'protoBCost', 'protoBNre', 'mpCost', 'mpNre'];
    return rows.some(function(r) {
        return moneyFields.some(function(f) { return r[f] !== undefined && r[f] !== null && String(r[f]).trim() !== ''; });
    });
};
// 💡 R1~무제한(R6, R7…) 대응: 리비전 객체에 실제로 존재하는 R# 키를 전부 모아 번호 순으로 정렬해서 돌려줌
//    opts.onlyWithMoney: 금액 있는 것만 (R1과 opts.include는 항상 포함) / opts.desc: 내림차순
window._mcRevList = function(revisionsObj, opts) {
    opts = opts || {};
    const keys = new Set(['R1']);
    Object.keys(revisionsObj || {}).forEach(function(k) { if (/^R\d+$/.test(k)) keys.add(k); });
    if (opts.include) keys.add(opts.include);
    let arr = Array.from(keys);
    if (opts.onlyWithMoney) {
        arr = arr.filter(function(k) { return k === 'R1' || k === opts.include || window._mcHasRealMoney(revisionsObj[k]); });
    }
    arr.sort(function(a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
    if (opts.desc) arr.reverse();
    return arr;
};

// 💡 이 종류(unit)에서 "가장 최근 등록된, 금액 있는" 리비전을 기본값으로 반환 (없으면 R1)
window._mcLatestRevWithData = function(revisionsObj) {
    const withData = window._mcRevList(revisionsObj || {}, { onlyWithMoney: true });
    return withData.length ? withData[withData.length - 1] : 'R1';
};

// 💡 R1~무제한 순환 버튼 — 금액이 입력된 리비전 + 지금 보고 있는 리비전끼리만 순환.
//    완전히 새 리비전(빈 데이터)은 ➕ 버튼(mcAddNewRevision)으로 진입 — 값을 넣기 전까진 "지금 보는 중"으로 순환에 임시 포함됨
window.mcCycleRevision = function() {
    const td = window.tabData || {};
    td.mcRevisions = td.mcRevisions || {};
    const cur = td.mcActiveRevision || 'R1';
    const order = window._mcRevList(td.mcRevisions, { onlyWithMoney: true, include: cur });
    const next = order[(order.indexOf(cur) + 1) % order.length];
    window.mcSwitchRevision(next);
};

// 💡 "➕ 새 리비전": 지금까지 "금액이 실제로 입력된" 가장 큰 R번호 다음 번호로 이동.
//    💡 [2026-08-24 버그 수정] 예전엔 "한 번이라도 방문한 R번호"까지 최댓값 계산에 포함시켰음 —
//    그래서 ➕를 실수로 여러 번 눌러 금액 없는 빈 리비전(R2,R3,R4…)이 연달아 생기면, 그 뒤로는
//    RX로 R1(금액 있음)에 돌아온 뒤 ➕를 다시 눌러도 R2가 아니라 그다음 미사용 번호(R6…)로 건너뛰어
//    버려서, "R2로 등록하고 싶었는데 실수로 R5까지 눌러버리면 되돌릴 방법이 없다"는 문제가 있었음.
//    → 금액이 있는 리비전(+지금 화면에 입력 중이라 아직 저장 전인 활성 리비전)만 최댓값 계산에 포함.
//    빈 리비전은 셈에서 빠지므로, RX로 금액 있는 리비전으로 돌아온 뒤 ➕를 누르면 그 사이의 빈 슬롯이
//    재사용되어(그 자리에 새로 입력됨) 다시 "다음 R2"가 나온다.
window.mcAddNewRevision = function() {
    const td = window.tabData || {};
    td.mcRevisions = td.mcRevisions || {};
    const curRev = td.mcActiveRevision || 'R1';
    const curRows = _readRowsFromTbody('mctable-body'); // 아직 mcRevisions에 저장되기 전, 지금 화면에 입력된 내용

    let maxN = 0;
    Object.keys(td.mcRevisions).forEach(function(k) {
        const m = k.match(/^R(\d+)$/);
        if (m && window._mcHasRealMoney(td.mcRevisions[k])) maxN = Math.max(maxN, parseInt(m[1], 10));
    });
    const curM = curRev.match(/^R(\d+)$/);
    if (curM && window._mcHasRealMoney(curRows)) maxN = Math.max(maxN, parseInt(curM[1], 10));

    let nextN = maxN + 1;
    // 💡 계산된 다음 번호가 "지금 이미 서 있는(빈) 리비전"과 같다면(예: 이 함수로 막 만든 빈 슬롯에서
    //    아무것도 입력하지 않고 ➕를 한 번 더 누른 경우) 제자리 그대로면 버튼이 안 눌리는 것처럼
    //    보이므로, 그때만 한 단계 더 진행한다.
    if (curM && nextN === parseInt(curM[1], 10)) nextN += 1;

    window.mcSwitchRevision('R' + nextN);
};

// 💡 R1~R5 리비전 전환: 현재 화면 내용을 활성 리비전에 저장하고, 선택한 리비전 데이터로 다시 그림
window.mcSwitchRevision = function(rev) {
    if (window.mcFlushChangeReasons) window.mcFlushChangeReasons(); // 💡 리비전 이동 전, 쌓인 변경사항 사유를 한 번에 확인
    window.tabData = window.tabData || {};
    window.tabData.mcRevisions = window.tabData.mcRevisions || {};
    const cur = window.tabData.mcActiveRevision || 'R1';
    window.tabData.mcRevisions[cur] = _readRowsFromTbody('mctable-body');
    window.tabData.mcActiveRevision = rev;
    window.tabData.mcTable = window.tabData.mcRevisions['R1'] || []; // 엑셀 저장 호환용 별칭

    // 💡 비교 화면에서 R1~R5를 누르면 "돌아가기"와 동일하게 일반 화면으로 복귀
    //    (populateTabData()의 너비 계산이 화면이 보이는 상태에서 실행되도록, 먼저 화면을 복귀시킴)
    const compSection = document.getElementById('mc-comparison-section');
    if (compSection && compSection.style.display !== 'none') {
        window.mcHideComparison();
    }

    window.populateTabData();
    window.mcRenderUnitTabs();

    const revBtn = document.getElementById('mc-rev-cycle-btn');
    if (revBtn) { revBtn.textContent = rev; revBtn.dataset.rev = rev; }
};

// 💡 행(TYPE/ITEM/GROUP/Note 등)은 그대로 두고, 금액 칸(Cost/NRE 전부)만 비움
window.mcClearAllPrices = function() {
    const tbody = document.getElementById('mctable-body');
    if (!tbody) return;
    const priceFields = ['protoCost', 'protoNre', 'protoBCost', 'protoBNre', 'mpCost', 'mpNre'];
    const inputs = tbody.querySelectorAll('input[data-field]');
    let count = 0;
    inputs.forEach(function(inp) {
        if (priceFields.indexOf(inp.dataset.field) !== -1 && inp.value !== '') count++;
    });
    if (!count) { alert('이미 비어있습니다.'); return; }
    if (!confirm(window._t(`현재 리비전의 금액 ${count}칸을 모두 지우시겠습니까?\n(TYPE/ITEM/GROUP/Note 등 나머지 내용은 그대로 유지됩니다)`, `Clear all ${count} price fields in this revision?\n(TYPE/ITEM/GROUP/Note etc. will be kept)`))) return;
    // 💡 [2026-08-24 안전장치 추가] 확인창만으로는 실수로 지우기 쉬워서, 제품구분자 삭제와 동일하게
    //    관리자 비밀번호 인증을 추가함.
    if (!window.verifyAdminPassword(window._t('🔒 금액을 전체 삭제하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)', '🔒 Enter the admin password to clear all prices.\n(case-insensitive)'))) {
        alert(window._t('❌ 비밀번호 인증 실패. 삭제가 취소되었습니다.', '❌ Authentication failed. Clear cancelled.'));
        return;
    }

    inputs.forEach(function(inp) {
        if (priceFields.indexOf(inp.dataset.field) !== -1) inp.value = '';
    });
    window._bmMcDirty = true;
    setTimeout(window.mcFlushDirty, 0);
};

// 💡 TYPE 등 그룹 라벨을 수정했을 때, SUBTOTAL/그룹 구분을 화면에 즉시 다시 반영
window.mcRefreshTable = function() {
    window.tabData = window.tabData || {};
    window.tabData.mcRevisions = window.tabData.mcRevisions || {};
    const cur = window.tabData.mcActiveRevision || 'R1';
    window.tabData.mcRevisions[cur] = _readRowsFromTbody('mctable-body');
    window.populateTabData();
    // 💡 수정이력 박스가 펼쳐져 있으면 최신 내용으로 같이 갱신
    const historyBody = document.getElementById('mc-history-body');
    if (historyBody && historyBody.style.display !== 'none' && window.mcRenderHistoryTable) {
        window.mcRenderHistoryTable();
    }
};

// 💡 R1~R5 개별 화면의 영업판가(PROTO/MP × Cost/NRE 개별) 입력 저장 — 비교 페이지의 salesPrice와는 별도 저장소
window.mcUpdateSalesPriceDetail = function(rev, field, val, el) {
    window.tabData = window.tabData || {};
    window.tabData.mcSalesPriceDetail = window.tabData.mcSalesPriceDetail || {};
    window.tabData.mcSalesPriceDetail[rev] = window.tabData.mcSalesPriceDetail[rev] || {};
    const oldVal = window.tabData.mcSalesPriceDetail[rev][field] || '';
    if (String(oldVal) === String(val)) return; // 실제 변경 없으면 종료

    // 💡 즉시 묻지 않고 큐에 쌓음 (다른 필드들과 동일하게 화면 이동 시 1번만 확인)
    window.tabData.mcSalesPriceDetail[rev][field] = val;
    if (window.mcQueueChange) window.mcQueueChange('영업판가 (' + rev + ')', field, oldVal, val);
    window.mcRefreshTable();
};

// 💡 수정이력 박스 펼치기/접기
window.mcToggleHistoryBox = function() {
    const body = document.getElementById('mc-history-body');
    const icon = document.getElementById('mc-history-toggle-icon');
    if (!body) return;
    const expand = body.style.display === 'none';
    body.style.display = expand ? 'block' : 'none';
    if (icon) icon.textContent = expand ? '▼' : '▶';
    if (expand) window.mcRenderHistoryTable();
};

// ═══════════════════════════════════════════════════════════
// 🖥️ M.C Table 디스플레이 종류(BTN/MAIN/UPR/TPR) 지원 — 1단계: 데이터 구조
//    기본(단일 종류) 모드에서는 지금까지와 완전히 동일하게 tabData.mcRevisions를 그대로 사용.
//    종류를 추가한 프로젝트만 tabData.mcRevisionsByUnit[unit]에 별도로 저장.
// ═══════════════════════════════════════════════════════════
window.mcActiveUnit = window.mcActiveUnit || '';  // '' = 기본(단일) 종류, 그 외 'BTN'/'MAIN'/'UPR'/'TPR'

// 현재 활성 종류의 리비전 저장소(mcRevisions 객체)를 반환. 없으면 생성.
window.getMcRevisionsStore = function(unit) {
    const u = (unit !== undefined) ? unit : window.mcActiveUnit;
    const key = u || '';
    window.tabData = window.tabData || {};
    window.tabData.mcRevisionsByUnit = window.tabData.mcRevisionsByUnit || {};
    if (!window.tabData.mcRevisionsByUnit[key]) {
        // 기본 종류(key==='')는 지금까지 써오던 mcRevisions를 최초 1회 그대로 이어받음
        window.tabData.mcRevisionsByUnit[key] = (key === '' && window.tabData.mcRevisions) ? window.tabData.mcRevisions : {};
    }
    return window.tabData.mcRevisionsByUnit[key];
};

// 이 프로젝트가 등록해둔 디스플레이 종류 목록 (기본값: 빈 배열 = 아직 아무것도 추가 안 함 = 지금 화면 그대로)
window.getMcUnits = function() {
    window.tabData = window.tabData || {};
    window.tabData.mcUnits = window.tabData.mcUnits || [];
    return window.tabData.mcUnits;
};

// 💡 변경 사항 1건 기록
window.mcLogChange = function(rowLabel, field, oldVal, newVal, reason) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.mcChangeLog = window.tabData.mcChangeLog || [];
    window.tabData.mcChangeLog.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        rev: window.tabData.mcActiveRevision || 'R1',
        unit: window.mcActiveUnit || '',  // 💡 2단계부터 사용할 디스플레이 종류(BTN/MAIN/UPR/TPR). 지금은 항상 ''(기본 종류)
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal, reason: reason || ''
    });
};

// 💡 SUBTOTAL/TOTAL/영업판가/재료비율 행의 Note 저장 (일반 행과 별도 저장소, 리비전별로 구분)
// 💡 SUBTOTAL/TOTAL/영업판가/재료비율 행의 Note 저장소를 종류(unit)별로 분리해서 반환
//    - 종류 미지정('')이면 기존 mcSummaryNotes 그대로 사용 (하위 호환)
//    - 종류가 있으면 mcSummaryNotesByUnit[unit]을 사용
function _mcSummaryNotesStore() {
    const td = window.tabData || {};
    const unit = window.mcActiveUnit || '';
    if (!unit) {
        td.mcSummaryNotes = td.mcSummaryNotes || {};
        return td.mcSummaryNotes;
    }
    td.mcSummaryNotesByUnit = td.mcSummaryNotesByUnit || {};
    td.mcSummaryNotesByUnit[unit] = td.mcSummaryNotesByUnit[unit] || {};
    return td.mcSummaryNotesByUnit[unit];
}

// 💡 SUBTOTAL/TOTAL/영업판가/재료비율 행의 Note 저장 (일반 행과 별도 저장소, 종류+리비전별로 구분)
window.mcUpdateSummaryNote = function(rev, noteKey, val) {
    const store = _mcSummaryNotesStore();
    store[rev] = store[rev] || {};
    const oldVal = store[rev][noteKey] || '';
    if (oldVal === val) return;
    store[rev][noteKey] = val;
    if (window.mcQueueChange) window.mcQueueChange(noteKey, 'Note', oldVal, val);
};

// 💡 M.C Table 변경사항을 즉시 묻지 않고 쌓아뒀다가, 리비전/종류/비교화면 전환 시 한 번에 사유를 물어봄
window._mcPendingChanges = [];

window.mcQueueChange = function(rowLabel, field, oldVal, newVal) {
    if (String(oldVal) === String(newVal)) return;
    window._mcPendingChanges.push({ rowLabel: rowLabel, field: field, oldVal: oldVal, newVal: newVal });
};

window.mcFlushChangeReasons = function() {
    if (!window._mcPendingChanges || !window._mcPendingChanges.length) return;
    const list = window._mcPendingChanges;
    window._mcPendingChanges = [];

    const label = list.length === 1
        ? `[${list[0].rowLabel}] ${list[0].field}`
        : `M.C Table ${list.length}건`;
    const reasonInput = window.promptOptionalReason(`${label} 변경`);
    const reason = (reasonInput === null) ? '' : reasonInput; // 취소해도 값은 되돌리지 않고, 사유만 비워서 기록

    list.forEach(function(c) {
        window.mcLogChange(c.rowLabel, c.field, c.oldVal, c.newVal, reason);
    });
};

// 💡 수정이력 표 그리기
window.mcRenderHistoryTable = function() {
    const table = document.getElementById('mc-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.mcChangeLog) || [];
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">수정 이력이 없습니다.</td></tr>'; return; }
    const fieldLabel = { type:'TYPE', item:'ITEM', group:'GROUP', pn:'P/N', spec:'Specification',
        protoCost:'PROTO A Cost', protoNre:'PROTO A NRE', protoBCost:'PROTO B Cost', protoBNre:'PROTO B NRE',
        mpCost:'MP Cost', mpNre:'MP NRE', note:'Note' };
    const _hisEn = window._currentLang === 'en';
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Revision' : '리비전') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Item' : '항목') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Field' : '필드') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Before' : '변경 전') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'After' : '변경 후') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Reason' : '사유') + '</th>'
        + '</tr></thead><tbody>';
    logs.slice().reverse().forEach(function(log) {
        html += '<tr><td style="padding:4px 8px; color:#6c757d;">' + log.time + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold; color:#0056b3;">' + (log.userName || (_hisEn ? 'Unknown' : '알 수 없음')) + '</td>'
            + '<td style="padding:4px 8px; text-align:center;">' + log.rev + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold;">' + log.row + '</td>'
            + '<td style="padding:4px 8px;"><span class="badge" style="background:#e7f1ff; color:#0056b3;">' + (fieldLabel[log.field] || log.field) + '</span></td>'
            + '<td style="padding:4px 8px; color:#c92a2a;">' + (log.oldVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#2f9e44;">' + (log.newVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#6c757d;">' + (log.reason || '-') + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
};

// 💡 M.C Table 수정이력 — 비밀번호 확인 후 날짜 구간 내 기록 삭제 (mcChangeLog만 정리, Gantt changeLogs와는 무관)
window.deleteMcHistoryByDateRange = function() {
    const pwEl = document.getElementById('mc-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) {
        if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    const fromStr = (document.getElementById('mc-history-del-from') || {}).value;
    const toStr = (document.getElementById('mc-history-del-to') || {}).value;
    if (!fromStr || !toStr) {
        if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.');
        return;
    }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) {
        if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.');
        return;
    }

    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) {
        const ts = parseKoDateTime(log.time);
        return ts !== null && ts >= fromTs && ts <= toTs;
    };

    const doDelete = function() {
        let removedCount = 0;
        if (window.tabData && window.tabData.mcChangeLog && window.tabData.mcChangeLog.length) {
            const before = window.tabData.mcChangeLog.length;
            window.tabData.mcChangeLog = window.tabData.mcChangeLog.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.mcChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        if (window.mcRenderHistoryTable) window.mcRenderHistoryTable();
        const msg = removedCount + '건의 견적 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };

    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 견적 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

// 💡 M.C Table 입력칸 변경 감지 (한 번만 등록 — tbody 자체는 재사용되므로 안전)
(function() {
    const tbody = document.getElementById('mctable-body');
    if (tbody) {
        tbody.addEventListener('focusin', function(e) {
            if (e.target.matches && e.target.matches('input[data-field]')) e.target.dataset._histOld = e.target.value;
        });
        tbody.addEventListener('change', function(e) {
            const el = e.target;
            if (!el.matches || !el.matches('input[data-field]')) return;
            const tr = el.closest('tr');
            if (!tr || tr.classList.contains('mc-summary-row')) return;
            const typeInp = tr.querySelector('input[data-field="type"]');
            const itemInp = tr.querySelector('input[data-field="item"]');
            const rowLabel = (((typeInp && typeInp.value) || '') + ' ' + ((itemInp && itemInp.value) || '')).trim() || '행';
            const oldVal = el.dataset._histOld !== undefined ? el.dataset._histOld : '';
            if (String(oldVal) === String(el.value)) return; // 실제 변경 없으면 프롬프트 자체를 띄우지 않음

            const fieldLabelMap = { type:'TYPE', item:'ITEM', group:'GROUP', pn:'P/N', spec:'Specification',
                protoCost:'PROTO A Cost', protoNre:'PROTO A NRE', protoBCost:'PROTO B Cost', protoBNre:'PROTO B NRE',
                mpCost:'MP Cost', mpNre:'MP NRE', note:'Note' };
            const fieldLabel = fieldLabelMap[el.dataset.field] || el.dataset.field;
            // 💡 매번 사유를 묻지 않고, 변경 내역만 쌓아둔 뒤 리비전/비교 화면 이동 시 한 번에 물어봄
            window.mcQueueChange(rowLabel, fieldLabel, oldVal, el.value);
            el.dataset._histOld = el.value;
        });
    }
})();

// ────────────────────────────────────────────────────────
// 📊 M.C Table Comparison (R1~R5 비교표)
// ────────────────────────────────────────────────────────

function _mcParseNum(val) {
    if (val === undefined || val === null) return 0;
    let num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
    return isNaN(num) ? 0 : num;
}
function _mcEsc(s) { return (s===undefined||s===null) ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _mcFmtCur(num) {
    num = Number(num) || 0;
    if (num === 0) return '';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _mcFmtCurSummary(num) {
    num = Number(num) || 0;
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _mcRowKey(r) {
    return [String(r.type||'').trim(), String(r.item||'').trim(), String(r.group||'').trim()].join('|').toLowerCase();
}

// R1~R5 데이터를 동일 항목(TYPE+ITEM+GROUP) 기준으로 매칭하여 한 줄로 합침
// 💡 종류(MAIN/UPR/TPR 등)별로 완전히 분리된 비교표 Note 저장소를 반환
//    - 종류 미지정('')이면 기존 td.mcCompare.notes 그대로 사용 (하위 호환)
//    - 종류가 있으면 td.mcCompareByUnit[unit].notes를 사용 (없으면 새로 생성)
function _mcCompareNotesStore() {
    const td = window.tabData || {};
    const unit = window.mcActiveUnit || '';
    if (!unit) {
        td.mcCompare = td.mcCompare || { salesPrice: {}, notes: {} };
        td.mcCompare.notes = td.mcCompare.notes || {};
        return td.mcCompare.notes;
    }
    td.mcCompareByUnit = td.mcCompareByUnit || {};
    td.mcCompareByUnit[unit] = td.mcCompareByUnit[unit] || { salesPrice: {}, notes: {} };
    td.mcCompareByUnit[unit].notes = td.mcCompareByUnit[unit].notes || {};
    return td.mcCompareByUnit[unit].notes;
}

window.mcBuildComparisonRows = function() {
    const td = window.tabData || {};
    td.mcRevisions = td.mcRevisions || {};
    const revs = window._mcRevList(td.mcRevisions, { onlyWithMoney: true, include: td.mcActiveRevision, desc: true });
    td.mcRevisions = td.mcRevisions || {};
    const notesStore = _mcCompareNotesStore();
    const order = [];
    const indexByKey = {};

    revs.forEach(function(rev) {
        const rows = (td.mcRevisions[rev] || []).filter(function(r) {
            const t = String(r.type||'').toUpperCase().replace(/\s/g,'');
            return t !== 'SUBTOTAL' && t !== 'TOTAL';
        });
        rows.forEach(function(r) {
            const hasAny = r.type || r.item || r.group || r.pn || r.spec || r.note || r.mpCost || r.mpNre || r.protoCost || r.protoNre;
            if (!hasAny) return;
            const key = _mcRowKey(r);
            let entry = indexByKey[key];
            if (!entry) {
                // 💡 NOTE는 R1~R5 데이터가 아니라 비교표 전용 저장소(td.mcCompare.notes)에서만 가져옴
                entry = { key: key, type: '', item: '', group: '', pn: '', spec: '', note: notesStore[key] || '', prices: {} };
                indexByKey[key] = entry;
                order.push(entry);
            }
            // 대표 텍스트는 비어있을 때만 보강 (먼저 채워진 리비전, 즉 R1 우선 값을 유지)
            if (!entry.type) entry.type = r.type || '';
            if (!entry.item) entry.item = r.item || '';
            if (!entry.group) entry.group = r.group || '';
            if (!entry.pn) entry.pn = r.pn || '';
            if (!entry.spec) entry.spec = r.spec || '';
            entry.prices[rev] = { cost: _mcParseNum(r.mpCost), nre: _mcParseNum(r.mpNre) };
        });
    });

    return order;
};

// 💡 R1~R5 / Comparison 화면 어디서 누르든 같은 버튼 하나가 알맞은 펼치기 동작을 수행
window.mcToggleHiddenUnified = function(btnEl) {
    const compSection = document.getElementById('mc-comparison-section');
    const isComparisonVisible = compSection && compSection.style.display !== 'none';
    if (isComparisonVisible) {
        window.mcToggleCompareExpand(btnEl);
    } else {
        window.bmToggleHidden('mc', btnEl);
    }
};

window.mcShowComparison = function() {
    if (window.mcFlushChangeReasons) window.mcFlushChangeReasons(); // 💡 비교화면 진입 전, 쌓인 변경사항 사유를 한 번에 확인
    window.tabData = window.tabData || {};
    window.tabData.mcRevisions = window.tabData.mcRevisions || {};
    const cur = window.tabData.mcActiveRevision || 'R1';
    window.tabData.mcRevisions[cur] = _readRowsFromTbody('mctable-body');

    document.getElementById('mc-normal-section').style.display = 'none';
    document.getElementById('mc-comparison-section').style.display = 'block';
    const btn = document.getElementById('mc-toggle-hidden-btn');
    if (btn) btn.textContent = (window._bmExpanded && window._bmExpanded.mc) ? (window._currentLang==='en'?'🔼 Collapse':'🔼 접기') : (window._currentLang==='en'?'🔽 Expand':'🔽 펼치기');
    // 💡 [2026-08-29 버그 수정] 원색(#e67e22)+흰 배경으로 강제 전환하던 걸 파스텔 팔레트로 교체 —
    //    VS 버튼은 "진입중" 상태를 한 단계 짙은 톤(hover와 동일)으로 표시
    const compBtn = document.getElementById('mc-comparison-btn');
    if (compBtn) { compBtn.style.background = '#f4d9b3'; compBtn.style.color = '#a85d0a'; }

    // 💡 비교 화면으로 전환하면 R1~R5 버튼은 전부 비활성 — 흰 배경 대신 원래 파스텔 기본색으로 되돌림
    document.querySelectorAll('.mc-rev-btn').forEach(function(b) {
        b.classList.remove('active');
        b.style.background = '#e8f4fd';
        b.style.color = '#1a4f7a';
        b.style.fontWeight = 'bold';
    });

    window.mcRenderComparisonTable();
};

window.mcHideComparison = function() {
    document.getElementById('mc-comparison-section').style.display = 'none';
    document.getElementById('mc-normal-section').style.display = '';
    const btn = document.getElementById('mc-toggle-hidden-btn');
    if (btn) btn.textContent = (window._bmExpanded && window._bmExpanded.mc) ? (window._currentLang==='en'?'🔼 Collapse':'🔼 접기') : (window._currentLang==='en'?'🔽 Expand':'🔽 펼치기');
    // 💡 [2026-08-29 버그 수정] 흰 배경 대신 원래 파스텔 기본색으로 되돌림
    const compBtn = document.getElementById('mc-comparison-btn');
    if (compBtn) { compBtn.style.background = '#fbead9'; compBtn.style.color = '#a85d0a'; }
};

window.mcToggleCompareExpand = function(btnEl) {
    window._bmExpanded = window._bmExpanded || {};
    window._bmExpanded.mc = !window._bmExpanded.mc;
    try { localStorage.setItem('gantt_mc_expanded', window._bmExpanded.mc ? '1' : '0'); } catch (e) {}
    const btn = btnEl || document.getElementById('mc-toggle-hidden-btn');
    if (btn) btn.textContent = window._bmExpanded.mc ? (window._currentLang==='en'?'🔼 Collapse':'🔼 접기') : (window._currentLang==='en'?'🔽 Expand':'🔽 펼치기');
    window.mcRenderComparisonTable();
};

// 💡 비교 페이지에서 영업판가를 수정하면, 메인 R1~R5 표의 MP 영업판가(mcSalesPriceDetail)에 직접 반영
//    (메인 표는 "현재 활성 리비전"만 화면에 있어서, 다른 리비전을 수정할 땐 mcRefreshTable()을 호출하면 안 됨 — 데이터만 갱신)
window.mcUpdateSalesPriceFromCompare = function(rev, field, val, el) {
    window.tabData = window.tabData || {};
    window.tabData.mcSalesPriceDetail = window.tabData.mcSalesPriceDetail || {};
    window.tabData.mcSalesPriceDetail[rev] = window.tabData.mcSalesPriceDetail[rev] || {};
    const oldVal = window.tabData.mcSalesPriceDetail[rev][field] || '';
    if (String(oldVal) === String(val)) return; // 실제 변경 없으면 종료

    // 💡 즉시 묻지 않고 큐에 쌓음
    window.tabData.mcSalesPriceDetail[rev][field] = val;
    if (window.mcQueueChange) window.mcQueueChange('영업판가 (' + rev + ')', field, oldVal, val);
    window.mcRenderComparisonTable();
};

// 💡 비교표 전용 NOTE 저장 (R1~R5 리비전 데이터와는 완전히 별도로 보관됨, 종류별로도 분리)
window.mcUpdateCompareNote = function(key, val) {
    _mcCompareNotesStore()[key] = val;
};

window.mcRenderComparisonTable = function() {
    const table = document.getElementById('mc-comparison-table');
    if (!table) return;
    const td0 = window.tabData || {};
    const revs = window._mcRevList(td0.mcRevisions || {}, { onlyWithMoney: true, include: td0.mcActiveRevision, desc: true });
    const rows = window.mcBuildComparisonRows();
    const td = window.tabData || {};
    td.mcCompare = td.mcCompare || { salesPrice: {} };
    td.mcCompare.salesPrice = td.mcCompare.salesPrice || {};
    const expanded = !!(window._bmExpanded && window._bmExpanded.mc);

    // 리비전별 합계 + 데이터 존재 여부 (R1은 항상 표시)
    const totals = {};
    const hasData = {};
    revs.forEach(function(rev) {
        totals[rev] = { cost: 0, nre: 0 };
        hasData[rev] = (rev === 'R1');
    });
    rows.forEach(function(r) {
        revs.forEach(function(rev) {
            const p = r.prices[rev];
            if (p) {
                totals[rev].cost += p.cost;
                totals[rev].nre += p.nre;
                if (p.cost || p.nre) hasData[rev] = true;
            }
        });
    });

    // 💡 "접기" 상태: 가격 정보가 전혀 없는 리비전 열(Cost+NRE 쌍)은 숨김. "펼치기": 전부 표시
    const visibleRevs = revs.filter(function(rev) { return rev === 'R1' || hasData[rev] || expanded; });

    // 💡 "접기" 상태: 모든 리비전에서 가격이 0인 행(항목)은 숨김. "펼치기": 전부 표시
    const displayRows = expanded ? rows : rows.filter(function(r) {
        return revs.some(function(rev) { const p = r.prices[rev]; return p && (p.cost || p.nre); });
    });

    // 헤더
    let thead = '<thead><tr>'
        + '<th rowspan="2" style="width:40px;">NO</th>'
        + '<th rowspan="2" style="width:90px;">TYPE</th>'
        + '<th rowspan="2" style="width:160px;" title="💡 ITEM 칸에 &#39;etc.&#39;를 입력한 행이 그룹의 마지막 행이 됩니다 — 이 지점에서 TYPE 구분과 SUBTOTAL이 계산됩니다.">ITEM</th>'
        + '<th rowspan="2" style="width:140px;">GROUP</th>';
    if (expanded) thead += '<th rowspan="2" style="width:90px;">P/N</th><th rowspan="2" style="min-width:280px;">Specification</th>';
    visibleRevs.forEach(function(rev) { thead += '<th colspan="2" class="mc-comp-divider">MP(' + rev + ')</th>'; });
    thead += '<th rowspan="2" style="min-width:200px;">Note</th></tr><tr>';
    visibleRevs.forEach(function(rev) { thead += '<th class="mc-comp-divider" style="width:70px;">Cost($)</th><th style="width:90px;">NRE</th>'; });
    thead += '</tr></thead>';

    // 💡 TYPE 그룹 경계 계산 (메인 표와 동일 기준: ITEM=NRE / TYPE 변경 / 마지막 행)
    const compMergeSpan = {};
    (function() {
        let segStart = 0;
        let curType = '';
        rows.forEach(function(r, idx) {
            const rt = String(r.type || '').trim();
            if (rt) curType = rt;
            const itemHasNre = /\betc\b|\bNRE\b/.test(String(r.item || ''));  // 💡 "etc."(소문자)를 기준으로 사용 — 대문자 "ETC" 항목명과 구분. 구버전 "NRE" 표기도 계속 인식
            const nextRow = rows[idx + 1];
            const nextType = nextRow ? String(nextRow.type || '').trim() : '';
            const isLastRow = !nextRow;
            const typeWillChange = !!(nextRow && nextType && nextType !== curType);
            if (itemHasNre || typeWillChange || isLastRow) {
                compMergeSpan[segStart] = idx - segStart + 1;
                segStart = idx + 1;
            }
        });
    })();

    // 💡 행별로 "전체 리비전에서 가격이 전부 0인지" 미리 계산
    const compRowAllEmpty = rows.map(function(r) {
        return !visibleRevs.some(function(rev) { const p = r.prices[rev]; return p && (p.cost || p.nre); });
    });
    // 💡 그룹(세그먼트) 전체가 가격 없음이면, 그 그룹 첫 행만 강제로 보이게(TYPE만 표시, 나머지는 투명)
    const compForceVisible = {};
    Object.keys(compMergeSpan).forEach(function(startStr) {
        const start = parseInt(startStr, 10);
        const len = compMergeSpan[start];
        let allEmpty = true;
        for (let i = start; i < start + len; i++) { if (!compRowAllEmpty[i]) { allEmpty = false; break; } }
        if (allEmpty) compForceVisible[start] = true;
    });

    // 항목 행 — TYPE은 화면에 "보이는 행" 기준 한 번만 표시, 그룹 종료 시 SUBTOTAL 삽입
    let tbody = '<tbody>';
    let lastShownCompType = null;
    let compSubtotal = {};
    visibleRevs.forEach(function(rev) { compSubtotal[rev] = { cost: 0, nre: 0 }; });
    let compCurrentType = '';
    let dispIdx = 0;

    rows.forEach(function(r, idx) {
        const naturallyVisible = displayRows.indexOf(r) !== -1;
        const isForcedRow = !naturallyVisible && !!compForceVisible[idx];
        const isDisplayed = naturallyVisible || isForcedRow;
        let rowType = String(r.type || '').trim();
        if (rowType) compCurrentType = rowType;

        if (isDisplayed) {
            const zebra = dispIdx % 2 === 0 ? '#ffffff' : '#fafbfc';
            let showTypeText = (rowType !== lastShownCompType);
            if (showTypeText) lastShownCompType = rowType;
            const otherColor = isForcedRow ? 'transparent' : '#333';
            const priceColor = isForcedRow ? 'transparent' : '#777';
            const typeCellStyle = 'color:' + (showTypeText ? '#333' : 'transparent') + ';' + (showTypeText ? ' border-left:3px solid #2c5f8a;' : '');
            tbody += '<tr style="background-color:' + zebra + ';"><td style="text-align:center;">' + (dispIdx+1) + '</td>'
                + '<td style="' + typeCellStyle + '">' + _mcEsc(rowType) + '</td>'
                + '<td style="color:' + otherColor + ';">' + _mcEsc(r.item) + '</td>'
                + '<td style="color:' + otherColor + ';">' + _mcEsc(r.group) + '</td>';
            if (expanded) {
                tbody += '<td style="color:' + otherColor + ';">' + _mcEsc(r.pn) + '</td>'
                    + '<td style="color:' + otherColor + ';">' + _mcEsc(r.spec) + '</td>';
            }
            visibleRevs.forEach(function(rev) {
            const p = r.prices[rev] || { cost: 0, nre: 0 };
            tbody += '<td class="mc-comp-divider" style="text-align:center; color:' + priceColor + ';">' + _mcFmtCur(p.cost) + '</td>'
                + '<td style="text-align:center; color:' + priceColor + ';">' + _mcFmtCur(p.nre) + '</td>';
          });
            tbody += '<td><input type="text" class="u-input" style="background:transparent; color:' + otherColor + ';" value="' + _mcEsc(r.note) + '" onchange="window.mcUpdateCompareNote(\'' + r.key + '\', this.value)"></td></tr>';
            dispIdx++;
        }

        // 💡 SUBTOTAL 합산은 화면 표시 여부와 무관하게 항상 전체 데이터 기준으로 누적
        visibleRevs.forEach(function(rev) {
            const p = r.prices[rev] || { cost: 0, nre: 0 };
            compSubtotal[rev].cost += p.cost;
            compSubtotal[rev].nre += p.nre;
        });

        const itemHasNre = /\betc\b|\bNRE\b/.test(String(r.item || ''));  // 💡 "etc."(소문자)를 기준으로 사용 — 대문자 "ETC" 항목명과 구분. 구버전 "NRE" 표기도 계속 인식
        const nextRow = rows[idx + 1];
        const nextType = nextRow ? String(nextRow.type || '').trim() : '';
        const isLastRow = !nextRow;
        const typeWillChange = !!(nextRow && nextType && nextType !== compCurrentType);

        if (compCurrentType && (itemHasNre || typeWillChange || isLastRow)) {
            tbody += '<tr style="background-color:#fff8e6; font-weight:bold;"><td colspan="' + (expanded ? 6 : 4) + '" style="text-align:right; padding-right:15px; font-size:13px; color:#333;">' + compCurrentType + ' SUBTOTAL</td>';
            visibleRevs.forEach(function(rev) {
            tbody += '<td class="mc-comp-divider" style="text-align:center; font-weight:bold; color:#333;">' + _mcFmtCurSummary(compSubtotal[rev].cost) + '</td>'
                + '<td style="text-align:center; font-weight:bold; color:#333;">' + _mcFmtCurSummary(compSubtotal[rev].nre) + '</td>';
        });
            tbody += '<td></td></tr>';
            visibleRevs.forEach(function(rev) { compSubtotal[rev] = { cost: 0, nre: 0 }; });
        }
    });
    tbody += '</tbody>';

    // TOTAL 행 (하늘색)
    let totalRow = '<tr style="background-color:#fbead9; font-weight:bold;"><td colspan="' + (expanded ? 6 : 4) + '" style="text-align:right; padding-right:15px;">TOTAL</td>';
    visibleRevs.forEach(function(rev) {
        totalRow += '<td class="mc-comp-divider" style="text-align:center;">' + _mcFmtCurSummary(totals[rev].cost) + '</td>'
            + '<td style="text-align:center;">' + _mcFmtCurSummary(totals[rev].nre) + '</td>';
    });
    totalRow += '<td></td></tr>';

    // 영업판가 행 (연두색, 입력 가능 — 메인 R1~R5 표의 MP 영업판가와 동일한 저장소를 공유함)
    let salesRow = '<tr style="background-color:#e6f6ea; font-weight:bold;"><td colspan="' + (expanded ? 6 : 4) + '" style="text-align:right; padding-right:15px;">영업판가</td>';
    visibleRevs.forEach(function(rev) {
        const detail = (td.mcSalesPriceDetail && td.mcSalesPriceDetail[rev]) || {};
        const costVal = detail.mpCost ? _mcFmtCurSummary(_mcParseNum(detail.mpCost)) : '';
        const nreVal = detail.mpNre ? _mcFmtCurSummary(_mcParseNum(detail.mpNre)) : '';
        salesRow += '<td class="mc-comp-divider" style="text-align:center;"><input type="text" class="u-input" style="text-align:center; font-weight:bold; color:#1f7a3d; background:transparent;" value="' + costVal + '" onchange="window.mcUpdateSalesPriceFromCompare(\'' + rev + '\', \'mpCost\', this.value, this)"></td>'
            + '<td style="text-align:center;"><input type="text" class="u-input" style="text-align:center; font-weight:bold; color:#1f7a3d; background:transparent;" value="' + nreVal + '" onchange="window.mcUpdateSalesPriceFromCompare(\'' + rev + '\', \'mpNre\', this.value, this)"></td>';
    });
    salesRow += '<td></td></tr>';

    // 재료비율 행 (주황색, TOTAL MP Cost/NRE 각각 ÷ 영업판가)
    let ratioRow = '<tr style="background-color:#fbe4e2; font-weight:bold;"><td colspan="' + (expanded ? 6 : 4) + '" style="text-align:right; padding-right:15px;">재료비율 (M.C ÷ 영업판가) [%]</td>';
    visibleRevs.forEach(function(rev) {
        const detail = (td.mcSalesPriceDetail && td.mcSalesPriceDetail[rev]) || {};
        const spCost = _mcParseNum(detail.mpCost);
        const spNre = _mcParseNum(detail.mpNre);
        const costRatio = spCost > 0 ? (totals[rev].cost / spCost * 100).toFixed(1) + '%' : '-';
        const nreRatio = spNre > 0 ? (totals[rev].nre / spNre * 100).toFixed(1) + '%' : '-';
        ratioRow += '<td class="mc-comp-divider" style="text-align:center; color:#b1432f;">' + costRatio + '</td>'
            + '<td style="text-align:center; color:#b1432f;">' + nreRatio + '</td>';
    });
    ratioRow += '<td></td></tr>';

    // 💡 R1~R5 표와 동일한 방식: colgroup으로 칸 너비를 명시 고정 (리비전 개수가 가변이라 매번 새로 생성)
    let compColgroup = '<colgroup>'
        + '<col style="width:40px;"><col style="width:90px;"><col style="width:160px;"><col style="width:140px;">';
    if (expanded) compColgroup += '<col style="width:90px;"><col style="width:280px;">';
    visibleRevs.forEach(function() { compColgroup += '<col style="width:70px;"><col style="width:90px;">'; });
    compColgroup += '<col style="width:200px;"></colgroup>';

    table.style.tableLayout = 'fixed';
    table.innerHTML = compColgroup + thead + tbody + '<tfoot class="mc-total-tfoot">' + totalRow + salesRow + ratioRow + '</tfoot>';

    // 💡 Note 열은 최소 너비를 보장 (리비전이 많아 칸 합계가 박스를 넘으면 가로 스크롤로 처리)
    const compCols = table.querySelectorAll('colgroup col');
    const compNoteCol = compCols[compCols.length - 1];
    // 💡 Note 열 너비를 고정 px로 박아두면 table-layout:fixed에서 인쇄 시 표를 100%로 늘려도
    //    채워줄 auto 열이 없어 오른쪽에 빈 여백이 남음 — 일반 M.C Table과 동일하게 비워서
    //    "너비 미지정 칸이 남는 공간을 자동으로 채우는" 브라우저 기본 동작을 이용
    if (compNoteCol) compNoteCol.style.width = '';
    table.style.width = '100%';

    // 💡 펼친 상태일 때만 내부 박스(.concept-tab-wrap)를 최대로 — 접힌 상태는 기존 1200px 그대로 유지
    const mcWrap = document.querySelector('#tab-mctable .concept-tab-wrap');
    if (mcWrap) mcWrap.classList.toggle('mc-wrap-expanded', expanded);

    // 💡 버튼이 하나(순환식)로 통합되어, "데이터 없는 리비전 버튼 숨김" 로직은 제거함
};

// 💡 [2026-08-27 신규] Summary 제품사진 크게 보기 — Elec Parts 표의 사진 라이트박스와 동일한 모달을
//    재사용한다(_openImageLightbox 공용 코어). slotIndex는 클릭한 슬롯(0/1)이고, 빈 슬롯은 건너뛰어
//    실제 채워진 사진들만 모아서 그 안에서의 위치를 계산한다.
window.showProductPhotoLightbox = function(slotIndex) {
    const _en = window._currentLang === 'en';
    const all = (window.tabData && window.tabData.productImages) || [];
    const valid = all.filter(Boolean);
    if (!valid.length) return;
    let startIdx = 0, seen = 0;
    for (let k = 0; k < all.length; k++) {
        if (!all[k]) continue;
        if (k === slotIndex) { startIdx = seen; break; }
        seen++;
    }
    window._openImageLightbox(valid, startIdx, _en ? 'Product Photo' : '제품 사진');
};

// 💡 제품 사진 업로드 슬롯 초기화
window.initProductImageSlots = function() {
    [0, 1].forEach(function(i) {
        const slot = document.getElementById('prod-img-slot-' + i);
        if (!slot) return;
        const fileInput = slot.querySelector('input[type="file"]');
        const img  = slot.querySelector('img.prod-preview');
        const ph   = slot.querySelector('.prod-placeholder');
        const del  = slot.querySelector('.prod-del-btn');

        // 슬롯 클릭 → 파일 선택 (삭제 버튼 클릭은 제외).
        // 💡 [2026-08-27] 이미 사진이 있는 슬롯은 클릭으로 더 이상 파일 선택창을 바로 열지 않는다 —
        //    열면 더블클릭(=크게 보기)의 첫 클릭에서 매번 파일 선택창이 뜨는 충돌이 생기기 때문.
        //    사진 교체는 ✕로 먼저 지운 뒤 빈 슬롯을 클릭하면 된다.
        slot.addEventListener('click', function(e) {
            if (e.target === del) return;
            if (img.style.display !== 'none' && img.src) return;
            fileInput.click();
        });
        // 더블클릭 → 크게 보기(사진이 있을 때만)
        img.title = window._currentLang === 'en' ? 'Double-click to enlarge' : '더블클릭하면 크게 보기';
        img.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            if (img.style.display === 'none' || !img.src) return;
            window.showProductPhotoLightbox(i);
        });

        // 파일 선택 → JPEG 압축 → 저장
        fileInput.addEventListener('change', function() {
            const file = fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                const tempImg = new Image();
                tempImg.onload = function() {
                    const MAX = 1000;
                    let w = tempImg.width, h = tempImg.height;
                    if (w > MAX || h > MAX) {
                        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                        else        { w = Math.round(w * MAX / h); h = MAX; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(tempImg, 0, 0, w, h);
                    const b64 = canvas.toDataURL('image/jpeg', 0.80);
                    // tabData에 저장 — {data, w, h} 형식으로 원본 비율 보존
                    window.tabData = window.tabData || {};
                    window.tabData.productImages = window.tabData.productImages || [null, null, null];
                    window.tabData.productImages[i] = { data: b64, w: w, h: h };
                    // 미리보기 갱신
                    img.src = b64; img.style.display = 'block';
                    ph.style.display = 'none';
                    del.style.display = 'block';
                };
                tempImg.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            fileInput.value = ''; // 같은 파일 재선택 허용
        });

        // 삭제 버튼
        del.addEventListener('click', function(e) {
            e.stopPropagation();
            window.tabData = window.tabData || {};
            window.tabData.productImages = window.tabData.productImages || [null, null, null];
            window.tabData.productImages[i] = null;
            img.src = ''; img.style.display = 'none';
            ph.style.display = '';
            del.style.display = 'none';
        });
    });
};

document.addEventListener('DOMContentLoaded', function() {
    if (window.populateTabData) window.populateTabData();
    if (window.bmSetupAllRows) { window.bmSetupAllRows('bs'); window.bmSetupAllRows('mc'); }
    if (window.initProductImageSlots) window.initProductImageSlots();
    // 자동 알람 체크 (3초 후 — 화면 렌더링 완료 후 실행) — [멀티시트] 열려있는 시트 전부 순회
    setTimeout(() => { if (window._checkAndSendAlarmsAllSheets) window._checkAndSendAlarmsAllSheets(false); }, 3000);
    // 💡 저장된 펼치기 상태에 맞춰 버튼 텍스트 동기화
    ['bs', 'mc'].forEach(function(key) {
        const btn = document.getElementById(key + '-toggle-hidden-btn');
        if (btn && window._bmExpanded && window._bmExpanded[key]) {
            btn.textContent = window._currentLang==='en'?'🔼 Collapse':'🔼 접기';
        }
    });
    });
