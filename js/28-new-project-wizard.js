// ═══════════════════════════════════════════════════════════════════════
// 💡 [2026-09-03 신규] 새 프로젝트 등록 스텝 위자드 (js/28-new-project-wizard.js)
//
//    진입 경로 2가지:
//    ① 상단 메뉴 "➕ 새 프로젝트 추가" → window._npwOpen()
//    ② 미분류 메일 재분석 모달 "📋 프로젝트 선택 ▾" → "➕ 새 프로젝트 AI 추출"
//       → Gemini가 메일에서 필드를 뽑아 pre-fill 후 window._npwOpen(prefill, 'MP(EC)')
//
//    5단계:
//    Step 1: MC Table 구분자 (BTN/MAIN/UPR/TPR 체크박스) → tabData.mcRevisionsByUnit 초기화
//    Step 2: 프로젝트 시작일 (PROTO Start — 달력 피커)
//    Step 3: 고객사 (주소록 자동완성)
//    Step 4: 고객 모델명 + KTK PN (선택 입력)
//    Step 5: 프로젝트 담당자 (주소록 드롭다운) + 메일 키워드
//    완료 시: Summary 필드 자동 채움 → Summary 탭 이동
// ═══════════════════════════════════════════════════════════════════════

(function() {
'use strict';

// ─── 내부 상태 ────────────────────────────────────────────────────────
let _step = 1;
const _TOTAL = 5;
let _prefill = {};   // AI 추출 or 외부 pre-fill 데이터
let _status  = '';   // 완료 시 설정할 완료여부 값 (''=DV, 'MP(EC)'=임시)

// ─── 공용 헬퍼 ───────────────────────────────────────────────────────
// 🐛 [2026-09-11 버그 수정] window.isEnglishMode()는 이 앱 어디에도 정의된 적이 없는 함수라
//    항상 undefined였고, 그래서 이 파일의 _en()은 언어 설정과 무관하게 항상 false만 반환했다 —
//    즉 이 새 프로젝트 등록 위자드는 영문 모드로 바꿔도 계속 한글로만 보이던 숨은 버그.
//    앱 전역에서 실제로 쓰는 언어 상태(window._currentLang)를 그대로 참조하도록 수정.
const _en = function() { return window._currentLang === 'en'; };
const _t  = function(ko, en) { return _en() ? en : ko; };

// ─── 모달 DOM 생성 (최초 1회) ─────────────────────────────────────────
function _ensureModal() {
    if (document.getElementById('npw-modal')) return;
    const m = document.createElement('div');
    m.id = 'npw-modal';
    // 배경 조작 가능 — 오버레이 pointer-events:none, 내부 박스만 클릭 받음
    m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9400; pointer-events:none;';
    m.innerHTML = `
<div id="npw-box" style="pointer-events:auto; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
  background:#fff; border-radius:12px; width:480px; max-width:94vw; box-shadow:0 10px 40px rgba(0,0,0,0.25);
  overflow:hidden; min-width:320px;">
  <!-- 헤더 -->
  <div id="npw-drag" style="display:flex; justify-content:space-between; align-items:center;
    padding:14px 18px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; cursor:grab;">
    <span style="font-weight:bold; font-size:14px; color:#1971c2;">➕ <span id="npw-title">${_t('새 프로젝트 등록', 'Register New Project')}</span></span>
    <button onclick="window._npwClose()" style="background:none; border:none; font-size:18px; cursor:pointer; color:#555; line-height:1; padding:0 4px;">✕</button>
  </div>
  <!-- 프로그레스 -->
  <div style="display:flex; align-items:center; gap:6px; padding:10px 18px 0; background:#f8fbff;">
    <div id="npw-prog" style="display:flex; gap:5px; flex:1;"></div>
    <span id="npw-step-label" style="font-size:11px; color:#888; white-space:nowrap;"></span>
  </div>
  <!-- 본문 -->
  <div id="npw-body" style="padding:20px 18px 10px; min-height:180px; max-height:55vh; overflow-y:auto;"></div>
  <!-- 하단 버튼 -->
  <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-top:1px solid #e9ecef; background:#f8fbff;">
    <button id="npw-prev" onclick="window._npwPrev()"
      style="padding:7px 18px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:7px; font-size:13px; cursor:pointer; transition:background .15s;"
      onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='#f8f9fa'">← 이전</button>
    <button id="npw-next" onclick="window._npwNext()"
      style="padding:7px 22px; background:#1971c2; color:#fff; border:none; border-radius:7px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s;"
      onmouseover="this.style.background='#1558a0'" onmouseout="this.style.background='#1971c2'">다음 →</button>
  </div>
</div>`;
    document.body.appendChild(m);
    // 드래그
    if (window._makeDraggable) window._makeDraggable('npw-box', 'npw-drag');
}

// ─── 프로그레스 점 렌더 ───────────────────────────────────────────────
function _renderProg() {
    const el = document.getElementById('npw-prog');
    const lb = document.getElementById('npw-step-label');
    if (!el) return;
    el.innerHTML = Array.from({length: _TOTAL}, function(_, i) {
        const active = i + 1 === _step;
        const done   = i + 1 < _step;
        return '<div style="width:' + (active ? 20 : 10) + 'px; height:10px; border-radius:5px; background:' +
            (active ? '#1971c2' : done ? '#74c0fc' : '#dee2e6') + '; transition:all .2s;"></div>';
    }).join('');
    if (lb) lb.textContent = _step + ' / ' + _TOTAL;
}

// ─── 각 스텝 렌더 ────────────────────────────────────────────────────
function _renderStep() {
    const body = document.getElementById('npw-body');
    const next = document.getElementById('npw-next');
    const prev = document.getElementById('npw-prev');
    if (!body) return;
    _renderProg();
    prev.style.visibility = _step === 1 ? 'hidden' : '';
    next.textContent = _step === _TOTAL ? '✅ 완료' : '다음 →';

    if (_step === 1) _renderStep1(body);
    else if (_step === 2) _renderStep2(body);
    else if (_step === 3) _renderStep3(body);
    else if (_step === 4) _renderStep4(body);
    else if (_step === 5) _renderStep5(body);
}

// ─── Step 1: MC Table 구분자 ──────────────────────────────────────────
const _MC_UNITS = [
    { key: 'BTN',  label: 'BTN',  desc: 'Button Deck — 버튼 데크' },
    { key: 'MAIN', label: 'MAIN', desc: 'Main Display — 메인 디스플레이 (MVD)' },
    { key: 'UPR',  label: 'UPR',  desc: 'Upper Display — 상단 디스플레이 (TVD)' },
    { key: 'TPR',  label: 'TPR',  desc: 'Topper — 토퍼 디스플레이 (TPR)' },
    { key: 'PTD',  label: 'PTD',  desc: 'Player Tracking Display — Info 디스플레이' },
];
function _renderStep1(body) {
    const saved = (window._npwData && window._npwData.mcUnits) ? window._npwData.mcUnits : (_prefill.mcUnits || []);
    const customVal = (window._npwData && window._npwData.mcCustom) || '';
    body.innerHTML = '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:12px;">MC Table 제품 구분자 선택</div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:14px;">이 프로젝트에 해당하는 디스플레이 종류를 선택하세요.<br>나중에 M.C Table 탭에서도 추가/삭제할 수 있습니다.</div>' +
        _MC_UNITS.map(function(u) {
            const chk = saved.indexOf(u.key) >= 0 ? 'checked' : '';
            return '<label style="display:flex; align-items:center; gap:10px; padding:9px 12px; border:1px solid #dee2e6; border-radius:8px; margin-bottom:8px; cursor:pointer; transition:background .15s;" onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'\'"><input type="checkbox" class="npw-unit-chk" value="' + u.key + '" ' + chk + ' style="width:16px;height:16px;cursor:pointer;"><div><div style="font-weight:bold; font-size:13px;">' + u.label + '</div><div style="font-size:11px; color:#888;">' + u.desc + '</div></div></label>';
        }).join('') +
        // 직접 입력 행
        '<label style="display:flex; align-items:flex-start; gap:10px; padding:9px 12px; border:1px dashed #ced4da; border-radius:8px; margin-bottom:8px; cursor:pointer; background:#fafafa; transition:background .15s;" onmouseover="this.style.background=\'#f5f5f5\'" onmouseout="this.style.background=\'#fafafa\'">' +
        '<input type="checkbox" id="npw-custom-chk" style="width:16px;height:16px;cursor:pointer;margin-top:2px;" onchange="var inp=document.getElementById(\'npw-custom-input\');inp.disabled=!this.checked;if(this.checked)inp.focus();">' +
        '<div style="flex:1;"><div style="font-weight:bold; font-size:13px; color:#555;">직접 입력</div>' +
        '<input id="npw-custom-input" type="text" disabled placeholder="' + _t('예: PDU, SBD', 'e.g. PDU, SBD') + '" value="' + customVal + '" onclick="event.stopPropagation();" ' +
        'style="margin-top:5px; width:100%; box-sizing:border-box; padding:5px 8px; font-size:12px; border:1px solid #ced4da; border-radius:5px;"></div></label>' +
        '<div style="font-size:11px; color:#aaa; margin-top:4px;">※ 선택하지 않아도 등록은 가능합니다 — 건너뛰기로 넘어가세요.</div>';
}
function _collectStep1() {
    const checks = document.querySelectorAll('#npw-body .npw-unit-chk');
    window._npwData = window._npwData || {};
    window._npwData.mcUnits = Array.from(checks).filter(function(c) { return c.checked; }).map(function(c) { return c.value; });
    // 직접 입력 처리
    const customChk   = document.getElementById('npw-custom-chk');
    const customInput = document.getElementById('npw-custom-input');
    if (customChk && customChk.checked && customInput && customInput.value.trim()) {
        const extras = customInput.value.split(/[,\s]+/).map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean);
        extras.forEach(function(k) { if (window._npwData.mcUnits.indexOf(k) < 0) window._npwData.mcUnits.push(k); });
        window._npwData.mcCustom = customInput.value;
    } else {
        window._npwData.mcCustom = '';
    }
}

// ─── Step 2: 프로젝트 시작일 ─────────────────────────────────────────
function _renderStep2(body) {
    const val = (window._npwData && window._npwData.startDate) || _prefill.startDate || '';
    body.innerHTML = '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:12px;">프로젝트 시작일 (PROTO Start)</div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:14px;">간트차트 전체 일정의 기준이 되는 날짜입니다.</div>' +
        '<input id="npw-date" type="text" placeholder="YYYY-MM-DD" value="' + val + '" readonly ' +
        'onclick="window.showGenericCalendar && window.showGenericCalendar(this)" ' +
        'ondblclick="this.removeAttribute(\'readonly\'); this.focus();" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 14px; font-size:15px; border:1.5px solid #a5c8f0; border-radius:8px; background:#f8fbff; cursor:pointer;">' +
        '<div style="font-size:11px; color:#aaa; margin-top:8px;">클릭: 달력에서 선택 / 더블클릭: 직접 입력</div>';
}
function _collectStep2() {
    const el = document.getElementById('npw-date');
    window._npwData = window._npwData || {};
    window._npwData.startDate = el ? el.value.trim() : '';
}
function _validateStep2() {
    const v = (document.getElementById('npw-date') || {}).value || '';
    if (!v.trim()) { alert(_t('시작일을 입력해주세요.', 'Please enter the start date.')); return false; }
    return true;
}

// ─── Step 3: 고객사 ───────────────────────────────────────────────────
function _renderStep3(body) {
    const val = (window._npwData && window._npwData.customer) || _prefill.customer || '';
    body.innerHTML = '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:12px;">고객사 <span style="color:#e03131;">*</span></div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:14px;">파일명 생성 및 메일 매칭에 사용됩니다.</div>' +
        '<input id="npw-customer" type="text" placeholder="' + _t('예: LNW, Samsung, BOE', 'e.g. LNW, Samsung, BOE') + '" value="' + val + '" autocomplete="off" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 14px; font-size:15px; border:1.5px solid #a5c8f0; border-radius:8px;" ' +
        'oninput="window._npwCustAC(this.value)">' +
        '<div id="npw-cust-ac" style="border:1px solid #ced4da; border-radius:6px; max-height:140px; overflow-y:auto; margin-top:4px; display:none; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.1); font-size:13px;"></div>';
    setTimeout(function() { const el = document.getElementById('npw-customer'); if (el) el.focus(); }, 50);
}
window._npwCustAC = function(q) {
    const ac = document.getElementById('npw-cust-ac');
    if (!ac) return;
    if (!q) { ac.style.display = 'none'; return; }
    // Drive 캐시 우선(Step5에서 이미 로드된 경우), 없으면 tabData 폴백
    const ab = (window.tabData && window.tabData.addressBook) ||
               (window.AddressBook && window.AddressBook.load && window.AddressBook.load()) || [];
    const seen = {};
    const hits = [];
    ab.forEach(function(r) {
        const c = (r.company || r.고객사 || '').trim();
        if (c && !seen[c] && c.toLowerCase().indexOf(q.toLowerCase()) >= 0) { seen[c] = 1; hits.push(c); }
    });
    if (!hits.length) { ac.style.display = 'none'; return; }
    ac.style.display = '';
    ac.innerHTML = hits.slice(0, 8).map(function(c) {
        return '<div onclick="document.getElementById(\'npw-customer\').value=\'' + c.replace(/'/g, "\\'") + '\'; document.getElementById(\'npw-cust-ac\').style.display=\'none\';" ' +
            'style="padding:7px 12px; cursor:pointer;" onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'\'">' + c + '</div>';
    }).join('');
};
function _collectStep3() {
    const el = document.getElementById('npw-customer');
    window._npwData = window._npwData || {};
    window._npwData.customer = el ? el.value.trim() : '';
}
function _validateStep3() {
    const v = (document.getElementById('npw-customer') || {}).value || '';
    if (!v.trim()) { alert(_t('고객사를 입력해주세요.', 'Please enter the customer.')); return false; }
    return true;
}

// ─── Step 4: 고객 모델명 + KTK PN ─────────────────────────────────────
function _renderStep4(body) {
    const model  = (window._npwData && window._npwData.model)  || _prefill.model  || '';
    const ktkpn  = (window._npwData && window._npwData.ktkpn)  || _prefill.ktkpn  || '';
    body.innerHTML = '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:12px;">고객 모델명 <span style="color:#e03131;">*</span></div>' +
        '<input id="npw-model" type="text" placeholder="' + _t('예: STELLAR32, KV-43XH8596', 'e.g. STELLAR32, KV-43XH8596') + '" value="' + model + '" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 14px; font-size:15px; border:1.5px solid #a5c8f0; border-radius:8px;">' +
        '<div style="font-size:13px; font-weight:bold; color:#333; margin:16px 0 8px;">KTK PN_모델명 <span style="color:#e03131;">*</span></div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:8px;">형식: <code style="background:#f8f9fa;padding:1px 5px;border-radius:3px;">502574_MAIN>KTS320DPS01,LNW</code> — 파일명 생성에 필요합니다.</div>' +
        '<input id="npw-ktkpn" type="text" placeholder="' + _t('예: 502574_MAIN>KTS320DPS01,LNW', 'e.g. 502574_MAIN>KTS320DPS01,LNW') + '" value="' + ktkpn + '" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 14px; font-size:14px; border:1.5px solid #a5c8f0; border-radius:8px; font-family:monospace;">' +
        '<div style="font-size:11px; color:#aaa; margin-top:6px;">※ 아직 모르면 비워두고 Summary 탭에서 나중에 입력해도 됩니다 (저장 전까지 필수).</div>';
    setTimeout(function() { const el = document.getElementById('npw-model'); if (el) el.focus(); }, 50);
}
function _collectStep4() {
    window._npwData = window._npwData || {};
    window._npwData.model = (document.getElementById('npw-model') || {}).value || '';
    window._npwData.ktkpn = (document.getElementById('npw-ktkpn') || {}).value || '';
}
function _validateStep4() {
    const v = (document.getElementById('npw-model') || {}).value || '';
    if (!v.trim()) { alert(_t('고객 모델명을 입력해주세요.', 'Please enter the customer model name.')); return false; }
    return true;
}

// ─── Step 5: 담당자 + 메일 키워드 ────────────────────────────────────
//    주소록은 Google Drive에서 로딩: AddressBook.loadFromDrive() 우선, 없으면 tabData.addressBook 폴백
function _buildPmHtml() {
    const pm  = (window._npwData && window._npwData.pm)  || _prefill.assignee || '';
    const kws = (window._npwData && window._npwData.keywords) || (_prefill.keywords ? _prefill.keywords.join(', ') : '');
    return '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:8px;">프로젝트 담당자 <span style="color:#e03131;">*</span></div>' +
        // 🆕 [2026-10-07] 긴 드롭다운 대신 이름 일부(예: "박용" → "박용훈")만 쳐도 좁혀지는 자동완성으로
        //    교체 — Summary 탭 담당자(sum-pm)와 동일한 전역 부품(attachAddressAutocomplete) 재사용.
        //    주소록에 없는 이름도 그대로 입력해 쓸 수 있음(기존 "직접 입력" 칸과 동일하게 동작).
        '<input id="npw-pm" type="text" autocomplete="off" value="' + pm + '" placeholder="' +
        _t('이름 일부만 입력해도 찾습니다', 'Type part of the name to search') + '" ' +
        'style="width:100%; box-sizing:border-box; padding:9px 12px; font-size:14px; border:1.5px solid #a5c8f0; border-radius:8px; background:#fff;">' +
        '<div style="font-size:11.5px; color:#888; margin:4px 0 0 2px;">주소록에 없으면 입력한 이름 그대로 사용됩니다.</div>' +
        '<div style="font-size:13px; font-weight:bold; color:#333; margin:18px 0 8px;">메일 키워드 <span style="font-size:11px; color:#aaa; font-weight:normal;">(선택)</span></div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:8px;">이 프로젝트로 메일을 자동 매칭할 키워드. 쉼표로 구분.</div>' +
        '<input id="npw-kw" type="text" placeholder="' + _t('예: S32, STELLAR, 에스삼투', 'e.g. S32, STELLAR, ESSAMTU') + '" value="' + kws + '" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 14px; font-size:13px; border:1.5px solid #a5c8f0; border-radius:8px;">';
}
async function _renderStep5(body) {
    // 로딩 중 표시
    body.innerHTML = '<div style="text-align:center; padding:30px; color:#888; font-size:13px;">⏳ 주소록을 Drive에서 불러오는 중...</div>';
    let ab = [];
    try {
        // 1) Drive에서 최신 주소록 로드
        if (window.AddressBook && window.AddressBook.loadFromDrive) {
            const driveList = await window.AddressBook.loadFromDrive();
            if (driveList && driveList.length) {
                ab = driveList;
                // tabData에도 반영
                if (window.tabData) window.tabData.addressBook = driveList;
            }
        }
        // 2) Drive 실패 시 tabData 폴백
        if (!ab.length) ab = (window.tabData && window.tabData.addressBook) || [];
    } catch(e) {
        console.warn('[npw Step5] 주소록 Drive 로딩 실패:', e);
        ab = (window.tabData && window.tabData.addressBook) || [];
    }
    body.innerHTML = _buildPmHtml();
    // 🆕 담당자 입력칸에 이름 자동완성 연결 (isMulti=false — 한 명만)
    const pmInput = document.getElementById('npw-pm');
    if (pmInput && window.attachAddressAutocomplete) window.attachAddressAutocomplete(pmInput, null, false);
}
function _collectStep5() {
    window._npwData = window._npwData || {};
    window._npwData.pm = ((document.getElementById('npw-pm') || {}).value || '').trim();
    window._npwData.keywords = (document.getElementById('npw-kw') || {}).value || '';
}
function _validateStep5() {
    const pm = ((document.getElementById('npw-pm') || {}).value || '').trim();
    if (!pm) { alert(_t('프로젝트 담당자를 입력해주세요.', 'Please enter the project owner.')); return false; }
    return true;
}

// ─── collect / validate dispatch ─────────────────────────────────────
function _collect() {
    if (_step === 1) _collectStep1();
    else if (_step === 2) _collectStep2();
    else if (_step === 3) _collectStep3();
    else if (_step === 4) _collectStep4();
    else if (_step === 5) _collectStep5();
}
function _validate() {
    if (_step === 2) return _validateStep2();
    if (_step === 3) return _validateStep3();
    if (_step === 4) return _validateStep4();
    if (_step === 5) return _validateStep5();
    return true;
}

// ─── 완료: Summary 필드 채움 ─────────────────────────────────────────
function _fillSummaryFields() {
    const d = window._npwData || {};
    const setVal = function(id, val) {
        const el = document.getElementById(id);
        if (!el || val === undefined || val === null) return;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // 필수 필드
    setVal('sum-customer',      d.customer  || '');
    setVal('sum-customer-model', d.model    || '');
    setVal('sum-ktk-pn-model',  d.ktkpn    || '');
    setVal('sum-pm',            d.pm        || '');
    setVal('sum-mail-keywords', d.keywords  || '');

    // 🐛 [2026-10-07 버그 수정] sum-pm은 자동완성 "선택" 또는 "포커스 이탈(blur)" 시에만 주소록
    //    dept → projectMeta.팀 자동 감지가 동작하는데(js/22g), 위 setVal은 값만 채울 뿐 그 어느
    //    쪽도 발생시키지 않아 위자드로 만든 프로젝트는 팀이 항상 미지정으로 남던 문제.
    //    blur 핸들러와 동일한 로직(_addrFindByName)을 그대로 재사용해서 직접 채운다.
    if (d.pm) {
        const _pmFirst = d.pm.split(',')[0].trim();
        const _pmPerson = window._addrFindByName ? window._addrFindByName(_pmFirst) : null;
        if (_pmPerson && _pmPerson.dept) {
            window.projectMeta = window.projectMeta || {};
            window.projectMeta.팀 = _pmPerson.dept;
        }
    }

    // 🐛 [2026-10-07 버그 수정] 위 setVal('sum-pm', ...)이 발생시킨 input 이벤트가 이름 자동완성
    //    추천 박스를 띄우는데, 사람이 연 게 아니라 닫힐 계기(blur)가 없어 화면 어딘가(보통 탭을
    //    이동한 뒤라 좌상단)에 계속 떠 있던 문제 — 프로그램적으로 값을 채운 직후엔 항상 닫아준다.
    const _acDropdown = document.getElementById('addr-autocomplete-dropdown');
    if (_acDropdown) _acDropdown.style.display = 'none';

    // PROTO Start (시작일)
    if (d.startDate) {
        const dateEl = document.getElementById('sum-ms-plan-protostart');
        if (dateEl) {
            dateEl.value = d.startDate;
            dateEl.removeAttribute('readonly');
            dateEl.dispatchEvent(new Event('input', { bubbles: true }));
            dateEl.dispatchEvent(new Event('change', { bubbles: true }));
            dateEl.setAttribute('readonly', '');
        }
    }

    // 프로젝트 상태 (DV or MP(EC))
    const statusEl = document.getElementById('sum-project-status');
    if (statusEl) {
        statusEl.value = _status;
        statusEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // MC Table 구분자 초기화
    const units = d.mcUnits || [];
    if (units.length && window.tabData) {
        // 🐛 [2026-10-07 버그 수정] getMcUnits()/mcNormalizeAfterLoad()가 실제로 보는 필드는
        //    tabData.mcRevisionsByUnit가 아니라 tabData.mcUnits(평평한 배열)다 — 이걸 안 채워서
        //    저장 후 재로드하면 "구분자 없음"으로 판정되어 이름 짓기 팝업이 다시 뜨던 버그.
        window.tabData.mcUnits = units.slice();
        if (!window.tabData.mcRevisionsByUnit) window.tabData.mcRevisionsByUnit = {};
        units.forEach(function(u) {
            if (!window.tabData.mcRevisionsByUnit[u]) window.tabData.mcRevisionsByUnit[u] = {}; // 다른 곳과 동일하게 객체(리비전명→행)
        });
        // 첫 번째 구분자를 활성으로 설정
        if (units[0]) window.mcActiveUnit = units[0];
        if (window.mcRenderUnitTabs) window.mcRenderUnitTabs(); // 🐛 존재하지 않던 함수명(renderMcTabs) 수정
    }

    // 필수필드 하이라이트 갱신
    if (window._checkAllRequiredFields) window._checkAllRequiredFields();

    // dirty 표시 (저장 필요 상태)
    if (window._markDirty) window._markDirty();
}

function _applyToSummary() {
    // Summary 탭으로 전환
    if (window.switchTabTo) window.switchTabTo('tab-summary');
    else {
        const btn = document.querySelector('[data-tab="tab-summary"]');
        if (btn) btn.click();
    }

    setTimeout(function() {
        _fillSummaryFields();
        // 🆕 [2026-10-07] 필수 정보 입력 완료 직후 자동 저장 — 비밀번호 확인은 saveToGoogleDrive
        //    내부(_saveToGoogleDriveRaw, 신규 파일 생성 시점)에서 그대로 진행되고, 통과하면 바로 저장됨.
        if (window.saveToGoogleDrive) window.saveToGoogleDrive();
    }, 100);
    // 🐛 [2026-10-07] 참조 엑셀 자동 가져오기(_npwOpen에서 시작)가 이 시점까지 안 끝났을 경우를 대비한
    //    안전장치 — 참조 엑셀의 Summary 시트 값(보통 빈 템플릿)이 뒤늦게 적용되어 방금 입력한 값을
    //    덮어쓰는 것을 막기 위해, 넉넉한 지연 후 위자드 입력값으로 한 번 더 확정한다.
    setTimeout(_fillSummaryFields, 1800);
}

// ─── 공개 API ─────────────────────────────────────────────────────────
/**
 * 위자드 열기
 * @param {object} prefill - AI 추출 등으로 pre-fill할 데이터 { customer, model, startDate, assignee, keywords, mcUnits, ktkpn }
 * @param {string} statusVal - 완료 시 설정할 완료여부 값 (''=DV 기본, 'MP(EC)'=임시)
 */
window._npwOpen = function(prefill, statusVal) {
    _ensureModal();
    _step   = 1;
    _prefill = prefill || {};
    _status  = statusVal || '';
    window._npwData = {};
    document.getElementById('npw-modal').style.display = '';
    _renderStep();

    // 🐛 [2026-10-07 버그 수정] 위자드가 생기면서 "참조 엑셀 가져오기" 팝업이 건너뛰어져, Gantt/Customer
    //    SPEC의 컬럼 구조(colIdx)가 세팅되지 않아 행 추가 자체가 불가능해지는 문제가 있었다 — 이미
    //    드라이브에 연동돼 있으면 위자드를 여는 동시에 참조 엑셀을 조용히 함께 불러온다
    //    (미연동이면 매번 "연동하시겠습니까?" 확인창이 뜨는 걸 피하기 위해 평소처럼 건너뜀).
    const _tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const _hasToken = !!((_tokenObj && _tokenObj.access_token) || window.googleAccessToken);
    if (_hasToken && window.autoImportReferenceExcel) window.autoImportReferenceExcel();
};

window._npwClose = function() {
    const m = document.getElementById('npw-modal');
    if (m) m.style.display = 'none';
};

window._npwNext = function() {
    _collect();
    if (!_validate()) return;
    if (_step === _TOTAL) {
        // 완료
        _applyToSummary();
        window._npwClose();
        if (window.showToast) window.showToast(window._t('✅ 프로젝트 정보를 입력했습니다. 자동 저장 중...', '✅ Project info filled in. Auto-saving...'), 'success', 4000);
        return;
    }
    _step++;
    _renderStep();
};

window._npwPrev = function() {
    _collect();
    if (_step > 1) { _step--; _renderStep(); }
};

// ─── "새 프로젝트 추가" 버튼 후킹 ────────────────────────────────────
//    원래 startNewProject()를 래핑: confirm 후 화면 초기화 → 위자드 열기
const _origStartNewProject = window.startNewProject;
window.startNewProject = function() {
    const msg = _en()
        ? 'Clear all data and start a new project?\n(Unsaved changes will be lost)'
        : '현재 화면의 내용을 모두 지우고(간트/Summary/Customer SPEC/M.C Table/Address 포함) 새 프로젝트를 시작하시겠습니까?\n(저장하지 않은 변경사항은 사라집니다)';
    if (!confirm(msg)) return;
    if (window._openAsNewSheet) window._openAsNewSheet('new_' + Date.now(), null, null);
    if (window._resetToBlankNoConfirm) window._resetToBlankNoConfirm(true);
    // 위자드 열기 (DV 상태로)
    window._npwOpen({}, '');
};

// ─── AI 추출 함수 (미분류 메일 → 새 프로젝트 pre-fill) ───────────────
/**
 * Gemini API로 메일 내용에서 프로젝트 필드 추출
 * @param {object} mailRecord - _msResults의 메일 레코드
 * @returns {Promise<object>} prefill 데이터
 */
window._npwExtractFromMail = async function(mailRecord) {
    if (!mailRecord) return {};
    const r = mailRecord;
    const body = r.body || r.mailBody || r.rawBody || '';
    const prompt = [
        '다음 메일 정보에서 새 프로젝트 등록에 필요한 정보를 추출해주세요.',
        '',
        '[메일 정보]',
        '제목: ' + (r.subject || '(없음)'),
        '발신: ' + (r.from || '(없음)'),
        (r.matchReason ? '이전 AI 판단 근거: ' + r.matchReason : ''),
        '본문(앞 800자):',
        body.slice(0, 800),
        '',
        '아래 JSON 형식으로만 응답하세요. 정보가 없거나 불확실하면 빈 값("")으로 두세요:',
        '{',
        '  "customer": "고객사명 (회사/브랜드명)",',
        '  "model": "고객 모델명 (영숫자 제품코드)",',
        '  "startDate": "YYYY-MM-DD 또는 빈값",',
        '  "assignee": "담당자 이름 추정 또는 빈값",',
        '  "keywords": ["키워드1", "키워드2"],',
        '  "mcUnits": ["MAIN", "UPR"]   // BTN/MAIN/UPR/TPR 중 메일에서 언급된 것',
        '}',
    ].filter(Boolean).join('\n');

    try {
        // 💡 [버그 수정] 이전엔 callAiBackend({ prompt, maxTokens }) 형태로 호출 — apiKey가 객체로 들어가
        //    GAS 서버에 인증 없이 요청 → 항상 실패 → {} 반환. 올바른 시그니처로 수정.
        const apiKey = window.getActiveAiKey && window.getActiveAiKey();
        if (!apiKey) { console.warn('[npw] AI API 키 없음 — 추출 스킵'); return {}; }
        const result = await window.callAiBackend(apiKey, prompt, {});
        const text = (result && result.ok && result.data && result.data.result &&
            result.data.result.candidates && result.data.result.candidates[0] &&
            result.data.result.candidates[0].content &&
            result.data.result.candidates[0].content.parts &&
            result.data.result.candidates[0].content.parts[0].text) || '';
        const jsonStr = text.match(/\{[\s\S]*\}/);
        if (jsonStr) return JSON.parse(jsonStr[0]);
    } catch (e) {
        console.warn('[npw] AI 추출 실패:', e);
    }
    return {};
};

})();
