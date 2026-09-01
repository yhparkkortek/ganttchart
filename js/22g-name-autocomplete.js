// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 6325~7079행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 이름 자동완성 — Address Book 기반
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

