// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 1283~2440행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 탭 · 서머리 · M.C테이블 렌더링 1/4
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
        <span class="nm-rr-info" style="font-size:11px; color:#666; background:#f1f3f5; border-radius:10px; padding:2px 9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; box-sizing:border-box;">${email || telegramId ? [email, telegramId ? 'TG:'+telegramId : ''].filter(Boolean).join(' · ') : '이름 입력 시 자동완성'}</span>
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
    // 💡 [2026-09-01] 신규 개별수신 항목도 Summary 담당자를 자동으로 불러오되, 채널 체크(이메일/텔레그램)는
    //    기본수신(_computeDefaultCcList)과 동일하게 꺼진 상태로 시작 — 예전엔 이메일이 자동으로 켜져 있어서
    //    확인 없이 발송될 수 있었음. 사용자가 직접 켜야 그 사람에게 발송된다.
    const auto = window._autoRegisterCcFromMembers ? window._autoRegisterCcFromMembers() : [];
    const seen = new Set();
    auto.filter(m => { if (seen.has(m.email)) return false; seen.add(m.email); return true; })
        .forEach(m => {
            const p = window._addrFindByName ? window._addrFindByName(m.name) : null;
            window._nmAddRecipientRow(m.name, m.email, p ? (p.telegramId || '') : '', false, false, true);
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
    // 💡 [2026-09-01] 두 필드 모두 발송 시각과 한 줄에 나란히 배치되는 flex 아이템이라 'grid'/'block'
    //    대신 'flex'로 토글(위 HTML의 새 레이아웃 참고).
    if (rangeEl) rangeEl.style.display = isSpecific ? 'none' : 'flex';
    if (specEl)  specEl.style.display  = isSpecific ? 'flex' : 'none';
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
        if (!res.ok) {
            // 서버는 살아있지만 /schedule 엔드포인트가 없는 경우 (구버전 백엔드)
            window._scheduleRules = res.status === 404 ? 'outdated' : null;
        } else {
            const data = await res.json();
            window._scheduleRules = (data && data.rules) || [];
        }
    } catch (e) {
        window._scheduleRules = null; // 서버 자체가 꺼져있는 경우
    }
    window.renderScheduleRuleTable();
};

window.renderScheduleRuleTable = function() {
    const tbody = document.getElementById('schedule-rule-table-body');
    if (!tbody) return;
    if (window._scheduleRules === 'outdated') {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:#e67e22;font-size:12.5px;">⚠️ 백엔드(kortek_backend.py)가 구버전입니다 — 최신 파일로 교체 후 재실행해주세요.</td></tr>`;
        return;
    }
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
        <span style="font-size:10px; color:#2c5f8a; background:${row0.auto ? '#eaf2fa' : 'transparent'}; border-radius:3px; padding:2px 5px; white-space:nowrap; text-align:center; visibility:${row0.auto ? 'visible' : 'hidden'};">summary</span>
        <span class="as-recip-info" style="font-size:11px; color:#666; background:#f1f3f5; border-radius:10px; padding:2px 9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; box-sizing:border-box;">${row0.email || row0.telegramId ? [row0.email, row0.telegramId ? 'TG:'+row0.telegramId : ''].filter(Boolean).join(' · ') : '이름 입력 시 자동완성'}</span>
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
