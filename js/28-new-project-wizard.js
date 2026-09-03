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
const _en = function() { return !!(window.isEnglishMode && window.isEnglishMode()); };
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
    <span style="font-weight:bold; font-size:14px; color:#1971c2;">➕ <span id="npw-title">새 프로젝트 등록</span></span>
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
    { key: 'BTN',  label: 'BTN', desc: 'Button Deck — 버튼 데크' },
    { key: 'MAIN', label: 'MAIN', desc: 'Main Display — 메인 디스플레이 (MVD)' },
    { key: 'UPR',  label: 'UPR', desc: 'Upper Display — 상단 디스플레이 (TVD)' },
    { key: 'TPR',  label: 'TPR', desc: 'Topper — 토퍼 (TPD)' },
];
function _renderStep1(body) {
    const saved = window._npwData && window._npwData.mcUnits ? window._npwData.mcUnits : (_prefill.mcUnits || []);
    body.innerHTML = '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:12px;">MC Table 제품 구분자 선택</div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:14px;">이 프로젝트에 해당하는 디스플레이 종류를 선택하세요.<br>나중에 M.C Table 탭에서도 추가/삭제할 수 있습니다.</div>' +
        _MC_UNITS.map(function(u) {
            const chk = saved.indexOf(u.key) >= 0 ? 'checked' : '';
            return '<label style="display:flex; align-items:center; gap:10px; padding:9px 12px; border:1px solid #dee2e6; border-radius:8px; margin-bottom:8px; cursor:pointer; transition:background .15s;" onmouseover="this.style.background=\'#f0f7ff\'" onmouseout="this.style.background=\'\'"><input type="checkbox" value="' + u.key + '" ' + chk + ' style="width:16px;height:16px;cursor:pointer;"><div><div style="font-weight:bold; font-size:13px;">' + u.label + '</div><div style="font-size:11px; color:#888;">' + u.desc + '</div></div></label>';
        }).join('') +
        '<div style="font-size:11px; color:#aaa; margin-top:4px;">※ 선택하지 않아도 등록은 가능합니다 — 건너뛰기로 넘어가세요.</div>';
}
function _collectStep1() {
    const checks = document.querySelectorAll('#npw-body input[type=checkbox]');
    window._npwData = window._npwData || {};
    window._npwData.mcUnits = Array.from(checks).filter(function(c) { return c.checked; }).map(function(c) { return c.value; });
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
    if (!v.trim()) { alert('시작일을 입력해주세요.'); return false; }
    return true;
}

// ─── Step 3: 고객사 ───────────────────────────────────────────────────
function _renderStep3(body) {
    const val = (window._npwData && window._npwData.customer) || _prefill.customer || '';
    body.innerHTML = '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:12px;">고객사 <span style="color:#e03131;">*</span></div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:14px;">파일명 생성 및 메일 매칭에 사용됩니다.</div>' +
        '<input id="npw-customer" type="text" placeholder="예: LNW, Samsung, BOE" value="' + val + '" autocomplete="off" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 14px; font-size:15px; border:1.5px solid #a5c8f0; border-radius:8px;" ' +
        'oninput="window._npwCustAC(this.value)">' +
        '<div id="npw-cust-ac" style="border:1px solid #ced4da; border-radius:6px; max-height:140px; overflow-y:auto; margin-top:4px; display:none; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.1); font-size:13px;"></div>';
    setTimeout(function() { const el = document.getElementById('npw-customer'); if (el) el.focus(); }, 50);
}
window._npwCustAC = function(q) {
    const ac = document.getElementById('npw-cust-ac');
    if (!ac) return;
    if (!q) { ac.style.display = 'none'; return; }
    const ab = (window.getAddressBook && window.getAddressBook()) || [];
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
    if (!v.trim()) { alert('고객사를 입력해주세요.'); return false; }
    return true;
}

// ─── Step 4: 고객 모델명 + KTK PN ─────────────────────────────────────
function _renderStep4(body) {
    const model  = (window._npwData && window._npwData.model)  || _prefill.model  || '';
    const ktkpn  = (window._npwData && window._npwData.ktkpn)  || _prefill.ktkpn  || '';
    body.innerHTML = '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:12px;">고객 모델명 <span style="color:#e03131;">*</span></div>' +
        '<input id="npw-model" type="text" placeholder="예: STELLAR32, KV-43XH8596" value="' + model + '" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 14px; font-size:15px; border:1.5px solid #a5c8f0; border-radius:8px;">' +
        '<div style="font-size:13px; font-weight:bold; color:#333; margin:16px 0 8px;">KTK PN_모델명 <span style="color:#e03131;">*</span></div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:8px;">형식: <code style="background:#f8f9fa;padding:1px 5px;border-radius:3px;">502574_MAIN>KTS320DPS01,LNW</code> — 파일명 생성에 필요합니다.</div>' +
        '<input id="npw-ktkpn" type="text" placeholder="예: 502574_MAIN>KTS320DPS01,LNW" value="' + ktkpn + '" ' +
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
    if (!v.trim()) { alert('고객 모델명을 입력해주세요.'); return false; }
    return true;
}

// ─── Step 5: 담당자 + 메일 키워드 ────────────────────────────────────
function _renderStep5(body) {
    const pm  = (window._npwData && window._npwData.pm)  || _prefill.assignee || '';
    const kws = (window._npwData && window._npwData.keywords) || (_prefill.keywords ? _prefill.keywords.join(', ') : '');
    // 주소록에서 담당자 목록 생성
    const ab = (window.getAddressBook && window.getAddressBook()) || [];
    const seen = {};
    const members = [];
    ab.forEach(function(r) {
        const n = (r.name || r.이름 || '').trim();
        if (n && !seen[n]) { seen[n] = 1; members.push({ name: n, dept: (r.department || r.부서 || '') }); }
    });
    const opts = '<option value="">-- 담당자를 선택하세요 --</option>' +
        members.map(function(m) {
            const sel = (pm && m.name === pm) ? ' selected' : '';
            return '<option value="' + m.name + '"' + sel + '>' + m.name + (m.dept ? ' (' + m.dept + ')' : '') + '</option>';
        }).join('');
    body.innerHTML = '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:8px;">프로젝트 담당자 <span style="color:#e03131;">*</span></div>' +
        '<select id="npw-pm" style="width:100%; box-sizing:border-box; padding:9px 12px; font-size:14px; border:1.5px solid #a5c8f0; border-radius:8px; background:#fff;">' + opts + '</select>' +
        '<div style="font-size:11.5px; color:#888; margin:4px 0 0 2px;">주소록에 없으면 아래에 직접 입력하세요.</div>' +
        '<input id="npw-pm-manual" type="text" placeholder="직접 입력 (주소록 선택 시 무시됨)" value="" ' +
        'style="width:100%; box-sizing:border-box; padding:8px 12px; font-size:13px; border:1px solid #ced4da; border-radius:8px; margin-top:6px;">' +
        '<div style="font-size:13px; font-weight:bold; color:#333; margin:18px 0 8px;">메일 키워드 <span style="font-size:11px; color:#aaa; font-weight:normal;">(선택)</span></div>' +
        '<div style="font-size:11.5px; color:#888; margin-bottom:8px;">이 프로젝트로 메일을 자동 매칭할 키워드. 쉼표로 구분.</div>' +
        '<input id="npw-kw" type="text" placeholder="예: S32, STELLAR, 에스삼투" value="' + kws + '" ' +
        'style="width:100%; box-sizing:border-box; padding:10px 14px; font-size:13px; border:1.5px solid #a5c8f0; border-radius:8px;">';
}
function _collectStep5() {
    window._npwData = window._npwData || {};
    const selVal = (document.getElementById('npw-pm') || {}).value || '';
    const manVal = (document.getElementById('npw-pm-manual') || {}).value || '';
    window._npwData.pm = selVal || manVal.trim();
    window._npwData.keywords = (document.getElementById('npw-kw') || {}).value || '';
}
function _validateStep5() {
    const sel = (document.getElementById('npw-pm') || {}).value || '';
    const man = (document.getElementById('npw-pm-manual') || {}).value || '';
    if (!sel && !man.trim()) { alert('프로젝트 담당자를 선택하거나 입력해주세요.'); return false; }
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
function _applyToSummary() {
    const d = window._npwData || {};
    const setVal = function(id, val) {
        const el = document.getElementById(id);
        if (!el || val === undefined || val === null) return;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Summary 탭으로 전환
    if (window.switchTabTo) window.switchTabTo('tab-summary');
    else {
        const btn = document.querySelector('[data-tab="tab-summary"]');
        if (btn) btn.click();
    }

    setTimeout(function() {
        // 필수 필드
        setVal('sum-customer',      d.customer  || '');
        setVal('sum-customer-model', d.model    || '');
        setVal('sum-ktk-pn-model',  d.ktkpn    || '');
        setVal('sum-pm',            d.pm        || '');
        setVal('sum-mail-keywords', d.keywords  || '');

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
            if (!window.tabData.mcRevisionsByUnit) window.tabData.mcRevisionsByUnit = {};
            units.forEach(function(u) {
                if (!window.tabData.mcRevisionsByUnit[u]) window.tabData.mcRevisionsByUnit[u] = [];
            });
            // 첫 번째 구분자를 활성으로 설정
            if (units[0]) window.mcActiveUnit = units[0];
            if (window.renderMcTabs) window.renderMcTabs();
        }

        // 필수필드 하이라이트 갱신
        if (window._checkAllRequiredFields) window._checkAllRequiredFields();

        // dirty 표시 (저장 필요 상태)
        if (window._markDirty) window._markDirty();

    }, 100);
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
        if (window.showToast) window.showToast('✅ 프로젝트 정보를 입력했습니다. 확인 후 저장해주세요.', 'success', 4000);
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
        const result = await window.callAiBackend({ prompt: prompt, maxTokens: 256 });
        const text = (result && (result.text || result.content || result.response || result)) || '';
        const jsonStr = text.match(/\{[\s\S]*\}/);
        if (jsonStr) return JSON.parse(jsonStr[0]);
    } catch (e) {
        console.warn('[npw] AI 추출 실패:', e);
    }
    return {};
};

})();
