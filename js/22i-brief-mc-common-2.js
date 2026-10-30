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
    if (!name) { alert(window._t('이름을 입력해주세요.', 'Please enter a name.')); return; }
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
            // Summary 모델 카드 unitId 동기
            if (window.renameProjectModelUnit) window.renameProjectModelUnit(oldName, name);
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
        // Summary 모델 카드 unitId 동기 (이름 없는 첫 카드에 이름 부여)
        if (window.tabData.projectModels) {
            const _em = window.tabData.projectModels.find(function(m) { return !m.unitId; });
            if (_em) { _em.unitId = name; if (window.renderProjectModels) window.renderProjectModels(); }
        }
    } else {
        // 새 빈 종류 추가 (기존 동작)
        units.push(name);
        window.mcRenderUnitTabs();
        // Summary에 대응 모델 카드 추가
        if (window.tabData && window.tabData.projectModels) {
            if (!window.tabData.projectModels.some(function(m) { return m.unitId === name; })) {
                // 재렌더 전에 화면 입력 중인 모델별 주요자재를 먼저 거둬들인다(미저장 편집 보호)
                if (window._syncMaterialsFromDom) window._syncMaterialsFromDom();
                window.tabData.projectModels.push({ unitId: name, 고객모델명: '', 프로젝트코드: '', 프로젝트명칭: '', KTKPN: '', KTK모델명: '' });
                if (window.renderProjectModels) window.renderProjectModels();
            }
        }
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
        alert(window._t('❌ 비밀번호 인증 실패. 삭제가 취소되었습니다.', '❌ Authentication failed. Deletion cancelled.'));
        return;
    }
    const units = window.getMcUnits();
    const idx = units.indexOf(unit);
    if (idx !== -1) units.splice(idx, 1);
    if (window.mcActiveUnit === unit) window.mcActiveUnit = '';
    window.mcRenderUnitTabs();
    // Summary 모델 카드에서도 해당 unitId 카드 제거 (첫 번째 카드는 유지)
    if (window.tabData && window.tabData.projectModels && window.tabData.projectModels.length > 1) {
        const _cidx = window.tabData.projectModels.findIndex(function(m) { return m.unitId === unit; });
        // removeProjectModel을 거쳐야 모델별 주요자재 수집·접힘 상태 재정렬까지 함께 처리된다
        if (_cidx > 0) window.removeProjectModel(_cidx);
    }
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
    const curHasMoney = window._mcHasRealMoney(curRows);
    if (curM && curHasMoney) maxN = Math.max(maxN, parseInt(curM[1], 10));

    let nextN = maxN + 1;
    // 💡 계산된 다음 번호가 "지금 이미 서 있는(빈) 리비전"과 같다면(예: 이 함수로 막 만든 빈 슬롯에서
    //    아무것도 입력하지 않고 ➕를 한 번 더 누른 경우) 제자리 그대로면 버튼이 안 눌리는 것처럼
    //    보이므로, 그때만 한 단계 더 진행한다.
    if (curM && nextN === parseInt(curM[1], 10)) nextN += 1;
    const newRev = 'R' + nextN;

    // 💡 [2026-09-07 신규] "R1/R2 견적이 이미 있는데 R3는 보통 그중 일부만 고쳐서 만든다"는 요청 —
    //    새 리비전을 완전히 빈 표로 시작하는 대신, 직전 견적 내용을 복사해서 바뀐 칸만 수정할 수 있게
    //    물어본다. 복사 원본은 "지금 화면(curRev)에 금액이 있으면 그 내용"(아직 저장 전인 최신 수정
    //    분까지 포함) — 없으면(예: 빈 리비전을 보다가 ➕를 누른 경우) 금액이 있는 리비전 중 가장
    //    최근 것을 원본으로 삼는다.
    const sourceRev = curHasMoney ? curRev : window._mcLatestRevWithData(td.mcRevisions);
    const sourceRows = (sourceRev === curRev) ? curRows : (td.mcRevisions[sourceRev] || []);
    if (sourceRows && sourceRows.length && window._mcHasRealMoney(sourceRows)) {
        if (confirm(window._t(
            `[${sourceRev}] 내용을 복사해서 [${newRev}]을(를) 만들까요? (바뀐 부분만 고치면 됩니다)\n(취소를 누르면 빈 표로 시작합니다)`,
            `Copy [${sourceRev}] into new revision [${newRev}] so you only need to edit what changed?\n(Cancel starts ${newRev} blank instead)`
        ))) {
            td.mcRevisions[newRev] = JSON.parse(JSON.stringify(sourceRows));
        }
    }

    window.mcSwitchRevision(newRev);
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
    if (!count) { alert(window._t('이미 비어있습니다.', 'Already empty.')); return; }
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
    if (!adminPwMatches(pw)) {
        const _m = adminPwGateFailMessage();
        if (window.bmAlertModal) window.bmAlertModal(_m); else alert(_m);
        return;
    }
    const fromStr = (document.getElementById('mc-history-del-from') || {}).value;
    const toStr = (document.getElementById('mc-history-del-to') || {}).value;
    if (!fromStr || !toStr) {
        const _m = window._t('시작일과 종료일을 모두 선택해주세요.', 'Please select both a start date and an end date.');
        if (window.bmAlertModal) window.bmAlertModal(_m); else alert(_m);
        return;
    }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) {
        const _m = window._t('시작일이 종료일보다 늦을 수 없습니다.', 'The start date cannot be later than the end date.');
        if (window.bmAlertModal) window.bmAlertModal(_m); else alert(_m);
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
//    재사용한다(_openImageLightbox 공용 코어).
//    🗂️ [2026-10-26] NAS 전환 이후 productImages는 항상 빈 자리 없는 배열이라(_renderProductImageSlots가
//    로드/추가/삭제마다 다시 다져 둔다) 더 이상 "빈 슬롯 건너뛰고 위치 계산" 과정이 필요 없다.
window.showProductPhotoLightbox = function(i) {
    const _en = window._currentLang === 'en';
    const all = (window.tabData && window.tabData.productImages) || [];
    if (!all.length) return;
    window._openImageLightbox(all, i, _en ? 'Product Photo' : '제품 사진');
};

// 🗂️ [2026-10-26] 제품 사진 저장소를 구글 드라이브(tabData 안 base64) → NAS로 옮겼다(사용자 요청 —
// "구글 드라이브 용량/개수 제한을 NAS로 풀어달라"). 폴더는 SUMMARY/<프로젝트>/PHOTOS — 프로젝트별로
// 갈린다(js/48 _dsCurrentProjectFolderName). 원본 그대로 올린다(리사이즈·JPEG 재압축 없음 — NAS라
// 용량 제약이 없다). 레거시 데이터({data: base64,...})는 그대로 보여주기만 하고 고치지 않는다(기존
// 파일을 건드리지 않는다는 이번 세션의 원칙 그대로) — 새로 올리는 사진부터 NAS 참조로 저장된다.
window._prodImgFolder = function () {
    const proj = window._dsCurrentProjectFolderName ? window._dsCurrentProjectFolderName() : null;
    return proj ? ('SUMMARY/' + proj + '/PHOTOS') : null;
};

function _prodImgMeasure(file) {
    return new Promise(function (resolve) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = function () { URL.revokeObjectURL(url); resolve({ w: 0, h: 0 }); };
        img.src = url;
    });
}

window._uploadProductImage = async function (file) {
    const _en = window._currentLang === 'en';
    // 📂 [2026-10-30] 고르기 창의 확장자 제한을 없앴다 — 대신 사진이 아니면 여기서 이유를 말해 준다.
    //    (예전엔 accept 가 막아 "왜 내 파일이 회색이지?"만 보였고, 끌어다 놓으면 조용히 무시됐다.)
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        if (window.showToast) {
            window.showToast(_en
                ? '⚠️ "' + (file && file.name) + '" is not an image — this slot takes photos only (JPG/PNG/GIF/WEBP). For documents use [📁 NAS] on the relevant page.'
                : '⚠️ "' + (file && file.name) + '" 은(는) 이미지가 아닙니다 — 이 자리에는 사진(JPG·PNG·GIF·WEBP)만 넣을 수 있습니다. 문서라면 해당 페이지의 [📁 NAS] 로 넣어주세요.', 'warning', 9000);
        }
        return;
    }
    const folder = window._prodImgFolder();
    if (!folder) { if (window.showToast) window.showToast('⚠️ ' + (_en ? 'Open a project first.' : '먼저 프로젝트를 열어야 합니다.'), 'error'); return; }
    if (!window._dsPut) { if (window.showToast) window.showToast('⚠️ ' + (_en ? 'The document store is not available.' : '문서 저장소 기능을 불러오지 못했습니다.'), 'error'); return; }
    const dims = await _prodImgMeasure(file);
    // 같은 이름 충돌 방지 — 타임스탬프 접두(이 폴더 안에서만 유일하면 되므로 충분).
    const safeName = Date.now() + '_' + file.name;
    const renamed = new File([file], safeName, { type: file.type });
    try {
        if (window.showToast) window.showToast('⏳ ' + (_en ? 'Uploading…' : '올리는 중…'), 'info');
        await window._dsPut(folder, renamed);
    } catch (e) {
        if (window.showToast) window.showToast('❌ ' + e.message, 'error', 7000);
        return;
    }
    window.tabData = window.tabData || {};
    window.tabData.productImages = (window.tabData.productImages || []).filter(Boolean);
    window.tabData.productImages.push({
        data: window._dsFileUrl(folder, safeName), w: dims.w, h: dims.h,
        nasFolder: folder, nasName: safeName
    });
    window._renderProductImageSlots();
};

window._deleteProductImage = function (i) {
    const imgs = window.tabData && window.tabData.productImages;
    if (!imgs || !imgs[i]) return;
    const entry = imgs[i];
    imgs.splice(i, 1);
    window._renderProductImageSlots();
    // NAS 참조가 있는 사진만 실제 파일도 지운다(레거시 base64는 tabData 안에서 빼는 걸로 끝).
    // 레거시 이전 파일은 내용 해시 이름이라 같은 사진 두 장이 한 파일을 같이 쓸 수 있다 — 남은 쪽이 쓰면 안 지운다.
    const shared = imgs.some(function (o) { return o && o.nasFolder === entry.nasFolder && o.nasName === entry.nasName; });
    if (entry && entry.nasFolder && entry.nasName && !shared && window._dsDelete) {
        window._dsDelete(entry.nasFolder, entry.nasName).catch(function () { /* 이미 없거나 백엔드가 꺼져 있어도 화면에선 이미 뺐다 */ });
    }
};

// 🗂️ [2026-10-29] 레거시 base64 사진 → NAS 이전(사용자 요청 "프로젝트 파일 용량 줄이기").
//    밖에서(스크립트로) Drive 파일만 고치면 **그 프로젝트를 열어 둔 앱이 메모리의 옛 base64로 다시
//    저장해 되돌린다**(실측 — STELLAR가 4분 만에 되돌아감). 그래서 열린 앱이 스스로 옮기고, 평소
//    저장(_nonGanttDirty)으로 반영한다. 파일 이름은 내용 해시라 두 PC가 동시에 돌아도 한 장만
//    남는다(409 = 이미 있음 = 같은 사진). NAS(백엔드)가 없으면 아무것도 안 하고 base64 그대로 둔다.
function _prodImgHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
let _prodImgMigrating = false;
window._prodImgMigrateLegacy = async function () {
    if (_prodImgMigrating || !window._dsPut || !window._dsFileUrl) return;
    const folder = window._prodImgFolder();
    const imgs = window.tabData && window.tabData.productImages;
    if (!folder || !Array.isArray(imgs)) return;
    const isLegacy = function (e) {
        const src = (typeof e === 'string') ? e : (e && e.data);
        return typeof src === 'string' && src.indexOf('data:') === 0;
    };
    if (!imgs.some(isLegacy)) return;
    _prodImgMigrating = true;
    const fileId = window.currentDriveFileId;
    let moved = 0;
    try {
        for (let i = 0; i < imgs.length; i++) {
            const e = imgs[i];
            if (!isLegacy(e)) continue;
            const src = (typeof e === 'string') ? e : e.data;
            const m = /^data:([^;,]+)/.exec(src);
            const ext = ({ 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' })[(m ? m[1] : '').toLowerCase()] || 'img';
            const name = 'legacy_' + _prodImgHash(src) + '.' + ext;
            try {
                const blob = await (await fetch(src)).blob();
                await window._dsPut(folder, new File([blob], name, { type: blob.type }));
            } catch (err) {
                if (!/이미 있습니다|already exists/i.test(String(err && err.message))) throw err;
            }
            // 올리는 사이 다른 프로젝트로 바뀌었거나 그 사진이 지워졌으면 손대지 않는다.
            if (window.currentDriveFileId !== fileId || window.tabData.productImages !== imgs || imgs[i] !== e) return;
            const next = { data: window._dsFileUrl(folder, name), nasFolder: folder, nasName: name };
            if (e && typeof e === 'object') { if (e.w) next.w = e.w; if (e.h) next.h = e.h; }
            imgs[i] = next;
            moved++;
        }
    } catch (err) {
        // 외부 접속·백엔드 꺼짐은 흔하다 — base64 그대로 두고 다음에 다시 시도(조용히 삼키지 않고 기록만)
        console.warn('[제품 사진 NAS 이전] 보류:', err && err.message);
        if (window._issueLog) { try { window._issueLog({ domain: 'docstore', kind: 'photo_migrate_fail', rid: '', route: 'prodimg', result: { ok: false, http: 0, durMs: 0, errorRaw: String(err && err.message || err) } }); } catch (e2) { /* 수집 실패 무시 */ } }
    } finally {
        _prodImgMigrating = false;
        if (moved) {
            window._nonGanttDirty = true;   // 다음 자동 저장에 실려 프로젝트 파일에서 base64가 빠진다
            console.info('[제품 사진 NAS 이전] ' + moved + '장 — 다음 저장 때 프로젝트 파일에서 빠집니다');
            window._renderProductImageSlots();
        }
    }
};

// 💡 제품 사진 목록을 다시 그린다 — 개수 제한이 없어 고정 슬롯 2개 대신 tabData 길이만큼 그리고
// 마지막에 "+ 추가" 타일을 하나 더 붙인다. 로드/추가/삭제 때마다 이 함수 하나로 다시 그린다.
window._renderProductImageSlots = function () {
    const list = document.getElementById('prod-img-list');
    if (!list) return;
    const _en = window._currentLang === 'en';
    window.tabData = window.tabData || {};
    // 레거시 저장분은 고정 3칸 배열이라 빈 자리가 null로 남아있을 수 있다 — 여기서 한 번 다져 둔다.
    const imgs = window.tabData.productImages = (window.tabData.productImages || []).filter(Boolean);

    let html = imgs.map(function (entry, i) {
        const src = (typeof entry === 'string') ? entry : entry.data;
        return '<div class="prod-img-slot" data-idx="' + i + '" style="cursor:default;">'
            + '<img class="prod-preview" src="' + escapeHtml(src || '') + '" style="display:block;" alt="제품사진' + (i + 1) + '" title="' + (_en ? 'Double-click to enlarge' : '더블클릭하면 크게 보기') + '">'
            + '<button class="prod-del-btn" title="' + (_en ? 'Delete' : '삭제') + '" style="display:block;">✕</button>'
            + '</div>';
    }).join('');
    html += '<div class="prod-img-slot" id="prod-img-add" title="' + (_en ? 'Click to add photos' : '클릭하여 사진 추가') + '">'
        + '<div class="prod-placeholder">📷<br>' + (_en ? 'Add photo' : '사진 추가') + '<br><span style="font-size:10px;">' + (_en ? '(several at once OK)' : '(여러 장 한꺼번에 가능)') + '</span></div>'
        + '<input type="file" multiple style="display:none;">'
        + '</div>';
    list.innerHTML = html;

    list.querySelectorAll('.prod-img-slot[data-idx]').forEach(function (slot) {
        const i = parseInt(slot.dataset.idx, 10);
        slot.querySelector('img').addEventListener('dblclick', function (e) { e.stopPropagation(); window.showProductPhotoLightbox(i); });
        slot.querySelector('.prod-del-btn').addEventListener('click', function (e) { e.stopPropagation(); window._deleteProductImage(i); });
    });
    const addSlot = document.getElementById('prod-img-add');
    const addInput = addSlot.querySelector('input[type="file"]');
    addSlot.addEventListener('click', function () { addInput.click(); });
    addInput.addEventListener('change', function () {
        const files = Array.prototype.slice.call(addInput.files || []);
        addInput.value = '';
        files.forEach(function (f) { window._uploadProductImage(f); });
    });
    // 프로젝트를 열 때마다 여기를 지난다(populateTabData) — 옛 base64가 남아 있으면 NAS로 옮긴다.
    setTimeout(function () { window._prodImgMigrateLegacy(); }, 3000);
};

// 💡 [호환용] 예전 이름을 그대로 불러도 동작하게 — DOMContentLoaded 등 기존 호출부를 안 건드린다.
window.initProductImageSlots = function() { window._renderProductImageSlots(); };

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
