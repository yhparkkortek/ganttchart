// 🚩 보고 화면(프로젝트 리뷰·일일보고)에서 **간트 행을 바로 다루는 공용 조작** (2026-11-26)
//    사용자 요청: "회의하면서 정리된·관련 없거나 중요하지 않은·중요 하이라이트 할 업무를 표시하고 숨김·삭제·핀셋 처리 —
//    간트에도 반영, 핀셋 아이콘 말고 간트처럼 붉은 바로 통일".
//
// ■ 세 가지 조작 (전부 **지금 열린 프로젝트의 간트 행**에 쓴다 — 다른 프로젝트 파일을 고치면 그걸 열어 둔 앱이 옛 값으로 되돌린다, 2026-10-29)
//   · 🚩 붉은 바 = 핀셋(알람) = 간트 No. 칸의 막대와 **같은 데이터**(`row._알림`) — 켜면 간트 행이 하이라이트된다.
//   · 현황 상자(진행/완료/지연/대기) = 간트 상태 칸. **완료로 보내면 보고 목록에서 기본으로 숨는다**(숨김 N건 보기로 되돌림) — 별도 '숨김' 데이터를 새로 두지 않는다.
//   · 🗑️ 삭제 = 간트 행(+하위)을 실제로 지운다. Ctrl+Z 로 되돌린다.
// ■ 버튼이 행을 **번호(레지스트리)** 로 집는다 — 행 번호와 그때의 업무명을 같이 적어 두고, 누르는 순간 간트가 바뀌었으면(업무명이 다르면) 그 행은 건너뛰고 알린다.
(function () {
    'use strict';

    var T = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    // 🏷 [2026-11-26] 순서·이름은 간트와 같다(js/04j GANTT_STATUS_CHOICES·_ganttStatusLabel) — 값은 저장값 그대로
    var STATUSES = window.GANTT_STATUS_CHOICES || ['완료', '진행', '지연', '대기'];
    var stLabel = function (s) { return window._ganttStatusLabel ? window._ganttStatusLabel(s) : s; };
    var REG = {}, _n = 0, REG_MAX = 4000;

    function gd() { return (typeof globalData !== 'undefined' && globalData) ? globalData : (window.globalData || []); }
    function ci() { return (typeof colIdx !== 'undefined' && colIdx) ? colIdx : (window.colIdx || {}); }
    function nameOf(row) {
        var l = row && typeof row._level === 'number' ? row._level : 4;
        return String((l === 0 ? row._origDev : l === 1 ? row._origT1 : l === 2 ? row._origT2 : l === 3 ? row._origT3 : row._origT4) || '').trim();
    }
    /** 영문·'보류' 같은 표기를 한국어 넷(진행/완료/대기/지연)으로 — 간트가 쓰는 표(LANG.ko.statusMap)와 같다. */
    function koStatus(v) {
        v = String(v == null ? '' : v).trim();
        try {
            var m = LANG.ko.statusMap, k = Object.keys(m).filter(function (x) { return x.toLowerCase() === v.toLowerCase(); })[0];
            return k ? m[k] : v;
        } catch (e) { return v; }
    }
    function rowStatus(ri) {
        var g = gd(), c = ci();
        if (!g[ri] || c.status == null || c.status === -1) return '';
        return koStatus(g[ri][c.status]);
    }
    function register(rows) {
        var g = gd(), id = ++_n;
        REG[id] = (rows || []).map(function (ri) { return { ri: ri, name: nameOf(g[ri]) }; });
        delete REG[id - REG_MAX];
        return id;
    }
    /** 등록된 행 중 **지금도 같은 업무인 것**만. */
    function resolve(id) {
        var g = gd(), rows = [], lost = 0;
        (REG[id] || []).forEach(function (p) {
            if (g[p.ri] && nameOf(g[p.ri]) === p.name) rows.push(p.ri); else lost++;
        });
        return { rows: rows, lost: lost };
    }
    function warnLost(lost) {
        if (lost && window.showToast) window.showToast(T('⚠️ 간트에서 바뀐 행 ' + lost + '개는 건너뛰었습니다 — 화면을 다시 열어 주세요', '⚠️ ' + lost + ' row(s) changed in the Gantt were skipped — reopen the view'), 'warning');
    }

    // ── 보기 새로고침 ──
    window._rrRefresh = function () {
        try { if (typeof applyFilters === 'function') applyFilters(); } catch (e) { /* 간트 새로고침 실패가 보고 화면을 막지는 않는다 */ }
        var ps = document.getElementById('tab-psummary');
        if (ps && ps.classList.contains('active') && window._renderAiProjectSummaryBody) { try { window._renderAiProjectSummaryBody(); } catch (e) { /* 아래로 */ } }
        if (typeof window._dailyRepaint === 'function') { try { window._dailyRepaint(); } catch (e) { /* 아래로 */ } }
        var ap = document.getElementById('tab-alarm');
        if (ap && ap.classList.contains('active') && window.renderAlarmTab) { try { window.renderAlarmTab(); } catch (e) { /* 무시 */ } }
    };

    // ── 🚩 붉은 바(핀셋) ──
    /** rows = 간트 행 번호들(열린 프로젝트). 비어 있으면 **꺼진 채 눌리지 않는** 바(이유는 말풍선). 바는 칸 안에서 절대 위치 — 그 칸에 `rp-cell` 클래스가 있어야 한다. */
    function barHtml(rows, closedWhy) {
        rows = rows || [];
        if (!rows.length) {
            return '<span class="rp-bar closed ps-pin-btn" title="' + esc(closedWhy || T('이 프로젝트를 열면 핀셋(하이라이트)을 켤 수 있습니다', 'Open this project to pin')) + '"></span>';
        }
        var g = gd(), on = rows.filter(function (ri) { return g[ri] && g[ri]._알림; }).length, all = on === rows.length, some = on > 0 && !all;
        var tip = all ? T('🚩 하이라이트 켜짐 — 누르면 끄기 (간트 핀셋과 같음)', 'Highlighted — click to turn off')
                : some ? T('🚩 일부(' + on + '/' + rows.length + ') 켜짐 — 누르면 전부 켜기', 'Partly on — click to turn all on')
                : T('눌러서 하이라이트(핀셋) 켜기 — 간트 No. 칸의 붉은 바와 같음', 'Click to highlight (pin) — same as the Gantt red bar');
        return '<span class="rp-bar ps-pin-btn' + (all ? ' on' : some ? ' some' : '') + '" onclick="event.stopPropagation(); window._rrPin(' + register(rows) + ')" title="' + esc(tip) + '"></span>';
    }
    /** 핀셋을 **켜거나 끈다**(하나라도 꺼져 있으면 전부 켠다). 간트·알람 탭·보고 화면이 같이 바뀐다. */
    window._rrPinRows = function (rows, lost) {
        var g = gd();
        if (!rows || !rows.length) {
            if (window.showToast) window.showToast(T('⚠️ 간트에서 이 업무를 찾지 못해 핀셋을 바꾸지 않았습니다', '⚠️ Task not found in the Gantt — nothing pinned'), 'warning');
            return false;
        }
        return window._rrPinSet(rows, !rows.every(function (ri) { return g[ri] && g[ri]._알림; }), lost);
    };
    /** 핀셋을 **지정한 상태로** 맞춘다(켜기/끄기). 행 하나든 목록 전체든 같은 길. */
    window._rrPinSet = function (rows, newState, lost, whole) {
        var g = gd();
        rows.forEach(function (ri) { if (g[ri]) { g[ri]._알림 = newState; if (window._patchPinRowDom) window._patchPinRowDom(ri); } });
        if (typeof logChange === 'function') logChange(rows[0], -1, '알림 설정', (whole ? (newState ? '목록 전체 알림 켜짐' : '목록 전체 알림 꺼짐') : (newState ? '알림 켜짐' : '알림 꺼짐')) + (rows.length > 1 ? ' (' + rows.length + '건)' : '') + ' — 보고 화면');
        warnLost(lost);
        if (window.showToast) window.showToast(T((newState ? '🚩 하이라이트(핀셋)를 켰습니다' : '하이라이트(핀셋)를 껐습니다') + ' — 간트 ' + rows.length + '행', (newState ? 'Highlighted ' : 'Un-highlighted ') + rows.length + ' row(s)'), 'info');
        window._rrRefresh();
        return newState;
    };
    window._rrPin = function (id) { var r = resolve(id); window._rrPinRows(r.rows, r.lost); };

    // ── 🚩 머리글 전체 바 — 간트 No. 머리글의 막대(`wrToggleAllPins`)와 같은 규칙: 하나라도 켜져 있으면 **전체 해제**, 아니면 전체 켜기.
    //    다른 점: 간트는 프로젝트 전체 행이지만 여기는 **지금 목록에 보이는 행**(필터·숨김 뒤)만 — 회의에서 이 화면을 정리하는 조작이라서.
    function headHtml(rows) {
        rows = rows || [];
        var g = gd(), on = rows.filter(function (ri) { return g[ri] && g[ri]._알림; }).length;
        if (!rows.length) return '<span class="rp-bar-head closed" title="' + esc(T('열린 프로젝트의 업무가 이 목록에 없습니다', 'No open-project tasks in this list')) + '"></span>';
        var tip = on ? T('🚩 이 목록의 하이라이트(핀셋) 전체 해제 — ' + on + '건 켜짐 (간트 머리글 막대와 같음)', 'Turn off all highlights in this list (' + on + ' on)')
                     : T('이 목록 전체 하이라이트(핀셋) 켜기 — 간트 머리글 막대와 같음', 'Highlight all rows in this list');
        return '<span class="rp-bar-head' + (on ? ' on' : '') + '" onclick="event.stopPropagation(); window._rrPinAll(' + register(rows) + ')" title="' + esc(tip) + '"></span>';
    }
    window._rrPinAll = function (id) {
        var r = resolve(id), g = gd();
        if (!r.rows.length) { warnLost(r.lost); return; }
        var anyOn = r.rows.some(function (ri) { return g[ri] && g[ri]._알림; });
        window._rrPinSet(r.rows, !anyOn, r.lost, true);
    };

    // ── 현황(상태) · 삭제 ──
    window._rrStatus = function (id, val) {
        var r = resolve(id);
        if (!r.rows.length) { warnLost(r.lost); return; }
        var prev = window._selectedRows;
        window._selectedRows = new Set(r.rows);       // setSelectedRowsStatus 는 선택 행을 쓴다 — 쓰고 나면 원래 선택으로
        try { if (typeof window.setSelectedRowsStatus === 'function') window.setSelectedRowsStatus(val); }
        finally { window._selectedRows = prev; }
        warnLost(r.lost);
        window._rrRefresh();
    };
    window._rrDelete = function (id) {
        var r = resolve(id);
        if (!r.rows.length) { warnLost(r.lost); return; }
        var g = gd(), lv = function (row) { return (row && typeof row._level === 'number') ? row._level : 4; };
        var del = {};
        r.rows.forEach(function (ri) {
            del[ri] = 1;
            for (var j = ri + 1; j < g.length; j++) { if (lv(g[j]) > lv(g[ri])) del[j] = 1; else break; }   // 하위 업무까지
        });
        var idx = Object.keys(del).map(Number).sort(function (a, b) { return a - b; });
        var names = r.rows.slice(0, 3).map(function (ri) { return nameOf(g[ri]) || T('업무', 'task'); }).join(', ');
        // 하위 업무가 딸려 지워질 때만 묻는다 — 한 행짜리 메일 업무는 바로(Ctrl+Z 로 되돌림)
        if (idx.length > r.rows.length && !confirm(T('"' + names + '" 와 하위 업무까지 ' + idx.length + '개 행을 간트에서 삭제할까요?', 'Delete ' + idx.length + ' Gantt rows including sub-tasks?'))) return;
        for (var k = idx.length - 1; k >= 0; k--) g.splice(idx[k], 1);
        window._selectedRows = new Set();
        if (typeof logChange === 'function') logChange(idx[0], -1, '행 삭제', '보고 화면에서 ' + idx.length + '개 삭제 — ' + names);
        if (typeof window.recalculateSchedules === 'function') window.recalculateSchedules();    // 되돌리기 지점도 여기서 자동으로 찍힌다
        warnLost(r.lost);
        if (window.showToast) window.showToast('🗑️ ' + T('간트에서 ' + idx.length + '개 행을 삭제했습니다 (Ctrl+Z 로 되돌리기)', 'Deleted ' + idx.length + ' Gantt row(s) (Ctrl+Z to undo)'), 'success', 6000);
        window._rrRefresh();
    };

    /** 현황 상자 + 삭제 단추. 열린 프로젝트 행이 아니면(rows 비어 있음) 현황은 글자로만·삭제는 없다. */
    function opsHtml(rows, fallbackStatus, closedWhy) {
        rows = rows || [];
        if (!rows.length) {
            return '<span title="' + esc(closedWhy || T('이 프로젝트를 열면 여기서 현황을 바꾸거나 삭제할 수 있습니다', 'Open this project to change status or delete here')) + '" style="' + (koStatus(fallbackStatus) && window._ganttStatusChipStyle ? window._ganttStatusChipStyle(koStatus(fallbackStatus)) + ' opacity:.55;' : 'color:#999; font-size:11px; white-space:nowrap;') + '">' + esc(koStatus(fallbackStatus) ? stLabel(koStatus(fallbackStatus)) : '—') + '</span>';
        }
        var sts = uniqStatuses(rows), cur = sts.length === 1 ? sts[0] : '';
        var id = register(rows);
        var sel = '<select onclick="event.stopPropagation()" onchange="event.stopPropagation(); window._rrStatus(' + id + ', this.value)" title="' + esc(T('간트의 상태 칸을 바꿉니다 — 완료로 보내면 이 목록에서 숨습니다', 'Changes the Gantt status — Done rows are hidden from this list')) + '" style="' + (cur && window._ganttStatusChipStyle ? window._ganttStatusChipStyle(cur) + ' height:18px; padding:0 4px; text-align-last:center; appearance:none; -webkit-appearance:none;' : (window._uiSelectStyle ? window._uiSelectStyle(false) : '') + ' height:20px; font-size:11px; padding:0 2px;') + ' max-width:70px; cursor:pointer;">' +
            (cur ? '' : '<option value="" selected>' + esc(T('혼합', 'Mixed')) + '</option>') +
            STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === cur ? ' selected' : '') + ' style="background:#fff; color:#333; font-weight:normal;">' + esc(stLabel(s)) + '</option>'; }).join('') + '</select>';
        var del = '<button onclick="event.stopPropagation(); window._rrDelete(' + id + ')" title="' + esc(T('간트 행까지 삭제 (Ctrl+Z 로 되돌리기)', 'Delete the Gantt row (Ctrl+Z to undo)')) + '" style="' + (window._uiBtnStyle ? window._uiBtnStyle('danger') : '') + ' height:20px; padding:0 5px; line-height:18px;">🗑️</button>';
        return '<span style="display:inline-flex; gap:3px; align-items:center; white-space:nowrap;">' + sel + del + '</span>';
    }
    function uniqStatuses(rows) {
        var o = {}; rows.forEach(function (ri) { o[rowStatus(ri)] = 1; });
        return Object.keys(o);
    }

    window._rr = {
        STATUSES: STATUSES, barHtml: barHtml, headHtml: headHtml, opsHtml: opsHtml, koStatus: koStatus, rowStatus: rowStatus, nameOf: nameOf, register: register, resolve: resolve,
        /** 완료인가 — 열린 프로젝트 행이면 **지금 간트 값**, 아니면 사실에 적혀 있던 값. */
        isDone: function (ri, fallbackStatus) { return (ri != null && ri >= 0 ? rowStatus(ri) : koStatus(fallbackStatus)) === '완료'; }
    };
})();
