/* ============================================================================
   🧹 js/65-overdue-cleanup.js — 밀린 업무 한 화면에 모아 정리 (2026-11-09, 사용자 요청)

   왜: 실측으로 내 프로젝트 리프 2,272행 중 '완료' 가 80행(3.5%)뿐이었다. 밀린 행을 보려면
   프로젝트를 하나씩 열어 표를 훑어야 해서 아무도 안 본다. 한 화면에 모아 둔다.

   ⚠️⚠️ **쓰기는 지금 열린 프로젝트에만 한다.** 다른 프로젝트 파일을 여기서 고치면,
      그 프로젝트를 열어 둔 사람의 앱이 **메모리의 옛 값으로 되돌린다**(2026-10-29 사진 이전
      사고와 같은 모양). 그래서 다른 프로젝트는 **보여만 주고 [열기]** 로 넘긴다 — 열고 나면
      그때부터 고칠 수 있다. 숨기지 않는 이유는, 안 보이면 "없는 것" 과 구분이 안 되기 때문이다.
   ⚠️ '밀렸나' 판정은 `_ganttIsOverdue`(js/04a) 한 곳에서 가져온다 — 메일에서 들어온 행은
      사건이지 업무가 아니라 안 센다(실측 1,505 → 276).
   ⚠️ 일괄 완료는 **기존 경로**(`setSelectedRowsStatus`, js/04j)를 그대로 부른다 — 하위 전파·
      기록 요약·되돌리기(Ctrl+Z)가 거기 다 들어 있다. 여기서 다시 구현하지 않는다.

   검증: tests/overdue-cleanup.browser.js
   ============================================================================ */
(function () {
    'use strict';

    window.OVERDUE_CLEANUP = window.OVERDUE_CLEANUP || {
        maxRowsPerProject: 200,       // 한 프로젝트에서 보여줄 상한(그 이상이면 "외 N건")
        modalId: 'overdue-cleanup-modal'
    };
    var C = window.OVERDUE_CLEANUP;

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

    var _state = { open: null, others: [], busy: false, done: 0, total: 0, errs: [], loaded: false };
    window._ovcState = _state;

    /**
     * 🧹 모아 둔 것을 버린다 — **사람이 바뀌면**(js/64) 앞사람 기준 목록이다.
     * ⚠️ 모듈 안 `_state` 를 바꿔야 한다 — 밖에서 `window._ovcState` 에 새 객체를 넣어도
     *    모듈은 **제 참조를 그대로 들고 있어서** 아무 일도 안 난다(하네스가 그걸로 한 번 틀렸다).
     */
    window._ovcReset = function () {
        _state.open = null; _state.others = []; _state.busy = false;
        _state.done = 0; _state.total = 0; _state.errs = []; _state.loaded = false;
        window._ovcState = _state;
    };

    function todayTs() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

    function taskName(row) {
        if (!row) return '';
        var k = ['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][row._level];
        return String((k ? row[k] : '') || '').replace(/\s*＊AI📧?\s*$/, '').trim();
    }

    /** 한 프로젝트분 밀린 리프 행. `rows` 는 화면용 배열(열린 프로젝트면 globalData 그 자체). */
    function overdueOf(rows, ci, projectName, editable) {
        var out = [], t0 = todayTs();
        if (!Array.isArray(rows)) return out;
        for (var i = 1; i < rows.length; i++) {
            var row = rows[i];
            if (!row || row._level === undefined) continue;
            var nx = rows[i + 1];
            if (nx && typeof nx._level === 'number' && nx._level > row._level) continue;   // 리프만
            if (!window._ganttIsOverdue || !window._ganttIsOverdue(row, ci, t0)) continue;
            var end = row._calcPlanTs || 0;
            out.push({
                idx: i, name: taskName(row) || T('(제목 없음)', '(untitled)'),
                cat: String(row._담당구분 || '').trim(),
                due: end ? ymd(new Date(end)) : '',
                days: end ? Math.round((t0 - end) / 86400000) : 0,
                project: projectName, editable: !!editable
            });
        }
        out.sort(function (a, b) { return b.days - a.days; });
        return out;
    }

    function openProjectName() {
        return String(window.currentDriveFileName || '').replace(/\.json$/i, '').trim();
    }

    function collectOpen() {
        var gd = window.globalData, ci = window.colIdx || {};
        if (!Array.isArray(gd) || gd.length < 2) return null;
        return { project: openProjectName() || T('(열린 프로젝트)', '(open project)'),
                 rows: overdueOf(gd, ci, openProjectName(), true), editable: true };
    }

    /** 다른 프로젝트는 **읽기만** — 고치려면 열어야 한다. */
    window.ovcScan = async function (force) {
        if (_state.busy) return _state;
        if (_state.loaded && !force) return _state;
        _state.busy = true; _state.errs = []; _state.others = []; _state.done = 0; _state.total = 0;
        paint();
        try {
            var r = await window.dailyScanMyProjects('overdue', function (ctx) {
                return { project: ctx.project, rows: overdueOf(ctx.rows, ctx.ci, ctx.project, false), editable: false };
            }, function (st) { _state.done = st.done; _state.total = st.total; paint(); });
            _state.others = (r.results || []).filter(function (g) { return g && g.rows.length; });
            _state.errs = r.errs || [];
            _state.loaded = true;
        } catch (e) {
            _state.errs.push(String((e && e.message) || e));
        }
        _state.busy = false;
        paint();
        return _state;
    };

    // ── 화면 ───────────────────────────────────────────────────────────────
    function groupHtml(g) {
        var rows = g.rows.slice(0, C.maxRowsPerProject);
        var more = g.rows.length - rows.length;
        var head = '<div style="display:flex; align-items:center; gap:8px; margin:14px 0 6px; flex-wrap:wrap;">' +
            '<span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">' + esc(g.project) + '</span>' +
            '<span style="font-size:11.5px; color:#b1432f;">' + g.rows.length + T('건', '') + '</span>' +
            (g.editable
                ? '<span style="font-size:10.5px; color:#2f9e44;">' + esc(T('열려 있음 — 여기서 바로 정리할 수 있습니다', 'open — editable here')) + '</span>' +
                  '<span style="flex:1"></span>' +
                  '<button onclick="window._ovcCheckAll(true)" style="padding:2px 8px; border:1px solid #cfd8e3; background:#fff; border-radius:5px; font-size:11px; cursor:pointer;">' + esc(T('전체 선택', 'Select all')) + '</button>' +
                  '<button onclick="window._ovcCheckAll(false)" style="padding:2px 8px; border:1px solid #cfd8e3; background:#fff; border-radius:5px; font-size:11px; cursor:pointer;">' + esc(T('해제', 'Clear')) + '</button>' +
                  '<button onclick="window.ovcCompleteChecked()" style="padding:2px 10px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; font-size:11px; font-weight:bold; cursor:pointer;">✅ ' + esc(T('선택 완료로', 'Mark done')) + '</button>'
                // ⚠️ 다른 프로젝트는 고치지 않는다 — 왜인지도 같이 적는다(안 적으면 "왜 안 되지?" 가 된다).
                : '<span style="flex:1"></span>' +
                  '<span style="font-size:10.5px; color:#999;">' + esc(T('열어야 고칠 수 있습니다 (열어 둔 사람의 화면이 되돌릴 수 있어서)', 'open it to edit')) + '</span>') +
            '</div>';
        var body = rows.map(function (r) {
            return '<div style="display:flex; align-items:center; gap:8px; padding:4px 6px; border-bottom:1px solid #f2f2f2; font-size:12px;">' +
                (g.editable
                    ? '<input type="checkbox" class="ovc-chk" data-idx="' + r.idx + '" style="flex-shrink:0;">'
                    : '<span style="width:13px; flex-shrink:0;"></span>') +
                '<span style="flex-shrink:0; width:52px; text-align:right; color:#b1432f; font-weight:bold;">' + r.days + T('일', 'd') + '</span>' +
                '<span style="flex-shrink:0; width:84px; color:#888; font-size:11px;">' + esc(r.due) + '</span>' +
                (r.cat ? '<span style="flex-shrink:0; font-size:10.5px; padding:1px 6px; border-radius:8px; background:#eef3f7; color:#2c5f8a;">' + esc(r.cat) + '</span>' : '') +
                '<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(r.name) + '</span>' +
                '</div>';
        }).join('');
        if (more > 0) {
            body += '<div style="padding:4px 6px; font-size:11px; color:#999;">' + esc(T('… 외 ' + more + '건', '… and ' + more + ' more')) + '</div>';
        }
        return head + body;
    }

    function bodyHtml() {
        var open = collectOpen();
        var groups = [];
        if (open && open.rows.length) groups.push(open);
        (_state.others || []).forEach(function (g) {
            if (open && g.project === open.project) return;        // 열린 것과 겹치면 열린 쪽만
            groups.push(g);
        });
        var total = groups.reduce(function (a, g) { return a + g.rows.length; }, 0);

        var h = '<div style="font-size:12px; color:#555; margin-bottom:4px;">' +
            esc(T('밀린 업무 ', 'Overdue ')) + '<b>' + total + '</b>' + esc(T('건', '')) +
            (_state.busy ? ' <span style="color:#1971c2;">· ' + esc(T('다른 프로젝트 확인 중… ' + _state.done + ' / ' + _state.total, 'scanning… ' + _state.done + ' / ' + _state.total)) + '</span>' : '') +
            ((_state.errs && _state.errs.length) ? ' <span style="color:#b1432f;">· ⚠️ ' + esc(T('못 읽은 프로젝트 ' + _state.errs.length + '건', _state.errs.length + ' unreadable')) + '</span>' : '') +
            '</div>' +
            // ⚠️ 무엇을 안 세는지 밝힌다 — 안 적으면 "왜 내 밀린 게 여기 없지?" 가 된다.
            '<div style="font-size:11px; color:#999; margin-bottom:8px;">' +
              esc(T('메일 분석으로 들어온 행은 세지 않습니다 — 사건이지 업무가 아니라서요.',
                    'Mail-derived rows are not counted — they are events, not tasks.')) + '</div>';

        if (!open) {
            h += '<div style="padding:10px 12px; background:#fff8e6; border:1px solid #f0d9a0; border-radius:7px; font-size:11.5px; color:#8a6d3b; margin-bottom:8px;">' +
                 esc(T('지금 열린 프로젝트가 없습니다 — 아래에서 하나를 열면 그 프로젝트부터 정리할 수 있습니다.',
                       'No project open — open one below to start.')) + '</div>';
        }
        if (!total && !_state.busy) {
            h += '<div style="padding:26px 10px; text-align:center; color:#999; font-size:12px;">' +
                 esc(T('밀린 업무가 없습니다.', 'Nothing overdue.')) + '</div>';
        }
        return h + groups.map(groupHtml).join('');
    }

    function paint() {
        var b = document.getElementById('ovc-body');
        if (b) b.innerHTML = bodyHtml();
    }
    window._ovcPaint = paint;

    window._ovcCheckAll = function (on) {
        [].forEach.call(document.querySelectorAll('.ovc-chk'), function (c) { c.checked = !!on; });
    };

    /**
     * ✅ 체크한 행을 완료로 — **기존 경로를 그대로 부른다**(하위 전파·기록 요약·Ctrl+Z 가 거기 있다).
     * ⚠️ 열린 프로젝트의 행만 체크박스를 갖는다. 그래서 여기서 또 거를 필요가 없다.
     */
    window.ovcCompleteChecked = function () {
        var idxs = [].map.call(document.querySelectorAll('.ovc-chk:checked'), function (c) { return +c.dataset.idx; });
        if (!idxs.length) {
            if (window.showToast) window.showToast(T('먼저 정리할 업무를 골라주세요.', 'Pick some tasks first.'), 'info');
            return false;
        }
        if (window.pushUndoSnapshot) window.pushUndoSnapshot();      // 바꾸기 **전에**
        window._selectedRows = new Set(idxs);
        var ok = window.setSelectedRowsStatus && window.setSelectedRowsStatus('완료');
        window._selectedRows = new Set();
        if (window.paintRowSelection) window.paintRowSelection();
        paint();
        return ok;
    };

    window.openOverdueCleanup = function () {
        var m = document.getElementById(C.modalId);
        if (!m) {
            m = document.createElement('div');
            m.id = C.modalId;
            m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
            m.innerHTML =
                '<div id="ovc-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:min(760px,94vw); max-height:88vh; display:flex; flex-direction:column; background:#fff; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.22); overflow:hidden;">' +
                  '<div id="ovc-drag" style="flex-shrink:0; padding:12px 17px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; font-weight:bold; font-size:14px; display:flex; justify-content:space-between; align-items:center; cursor:grab;">' +
                    '<span>🧹 ' + esc(T('밀린 업무 정리', 'Overdue cleanup')) + '</span>' +
                    '<div style="display:flex; gap:6px; align-items:center;">' +
                      '<button onclick="window.ovcScan(true)" style="background:#e8f4fd; border:none; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px;">🔄 ' + esc(T('다시 읽기', 'Reload')) + '</button>' +
                      '<button onclick="document.getElementById(\'' + C.modalId + '\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); width:28px; height:28px; cursor:pointer; font-size:15px; line-height:1;">✕</button>' +
                    '</div>' +
                  '</div>' +
                  '<div id="ovc-body" style="flex:1; min-height:0; overflow-y:auto; padding:14px 17px;"></div>' +
                '</div>';
            document.body.appendChild(m);
            if (window._makeDraggable) window._makeDraggable('ovc-box', 'ovc-drag');
            if (window._bindClickToFront) window._bindClickToFront(C.modalId);
        }
        m.style.display = 'flex';          // ⚠️ 닫을 땐 none 이므로 열 때마다 다시 켠다
        paint();
        if (window.bringModalToFront) window.bringModalToFront(C.modalId);
        try { window.ovcScan(); } catch (e) { /* 훑기 실패가 창을 막지는 않는다 */ }
    };
})();
