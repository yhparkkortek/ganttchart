// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 7080~8012행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: Brief SPEC / M.C Table 공용 1/2
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
        // 💡 [2026-09-06] 사용자 확인 후 "배경조작 허용"으로 결정 — 이 확인창이 뜬 동안 배경에서
        //    데이터가 바뀌면 확인 클릭이 옛 대상을 참조할 수 있다는 점은 감수하기로 함(사용자 승인).
        modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:none;pointer-events:none;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML =
            '<div style="pointer-events:all;background:#fff;border-radius:10px;padding:26px 30px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;">'
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
        // 💡 [버그 수정 2026-09-06] 배경 조작 안 되던 문제 — 이 앱 표준 패턴(오버레이 pointer-events:none
        //    + 배경 없음, 박스만 pointer-events:all)으로 통일. 단순 알림(선택지 없음)이라 배경 상태에
        //    의존하는 위험이 없음.
        modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:none;pointer-events:none;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML =
            '<div style="pointer-events:all;background:#fff;border-radius:10px;padding:26px 30px;min-width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;">'
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

