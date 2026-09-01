// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 8013~8982행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: Brief SPEC / M.C Table 공용 2/2
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
