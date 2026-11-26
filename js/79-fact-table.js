// 📋 공용 "사실 표" 엔진 (2026-11-26) — 프로젝트 리뷰의 근거 사실 목록과 일일보고의 간트에서 불러오기 후보를
//    **같은 표**로 그린다(사용자 요청: "도표로 보여주고 오름/내림 필터 기능, 2곳을 되도록 통일 — AI 요약처럼").
//
// ■ 하는 일: 행 배열 + 열 정의 → ① 열 머리글 클릭 정렬(▲/▼) ② 열 필터 상자(그 열 값 목록) ③ 표 HTML.
//   ⚠️ 행을 그리는 일(열 안에 뭘 넣나)은 쓰는 쪽이 정한다 — 이 파일은 정렬·필터·모양만 안다.
//   ⚠️ 화면 상태(정렬·필터)는 표 id 마다 여기 모아 두고, 쓰는 쪽은 `cfg.repaint()` 로 자기 영역을 다시 그린다.
//
// ■ 쓰는 법:
//     var r = window._ft.build('표id', {
//         cols: [{ id, label, w, align, nowrap, sort: fn(row), opt: fn(row)→값|값[](필터 상자), html: fn(row, i), tdCls: fn(row), firstDir: -1|1 }],
//         rowAttr: fn(row, i)→'id="…" onclick="…"', rowClass: fn(row, i),
//         defaultSort: { col: 'date', dir: -1 }, empty: '글', max: 80, repaint: fn()
//     }, rows);
//     r.view  — 필터+정렬이 끝난 행 배열(= 화면에 그리는 순서. 번호로 집는 클릭 핸들러가 이 배열을 써야 한다)
//     r.html  — 필터 줄 + 표
(function () {
    'use strict';

    var T = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var REG = {};
    function ent(id) { return REG[id] || (REG[id] = { sort: '', dir: 1, f: {}, cfg: null }); }

    function optVals(col, row) {
        var v = col.opt(row);
        return (Array.isArray(v) ? v : [v]).map(function (s) { return String(s == null ? '' : s).trim(); }).filter(Boolean);
    }
    function curSort(e) {
        var d = e.cfg && e.cfg.defaultSort;
        return e.sort ? { col: e.sort, dir: e.dir } : (d ? { col: d.col, dir: d.dir } : { col: '', dir: 1 });
    }
    function activeCount(e) {
        return Object.keys(e.f).filter(function (k) { return e.f[k]; }).length;
    }

    window._ft = {
        build: function (id, cfg, rows) {
            var e = ent(id); e.cfg = cfg;
            rows = rows || [];
            var cols = cfg.cols || [];

            // 🔽 필터 상자의 목록은 **거르기 전** 전체 행으로 만든다(거른 뒤로 만들면 한 번 고르는 순간 다른 값이 사라져 되돌릴 수 없다).
            var optList = {};
            cols.forEach(function (c) {
                if (!c.opt) return;
                var cnt = {};
                rows.forEach(function (r) { optVals(c, r).forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; }); });
                optList[c.id] = cnt;
                if (e.f[c.id] && !cnt[e.f[c.id]]) delete e.f[c.id];   // 그 값이 사라졌으면(기간·프로젝트가 바뀜) 조건도 푼다
            });

            var view = rows.filter(function (r) {
                return cols.every(function (c) {
                    var v = c.opt && e.f[c.id];
                    return !v || optVals(c, r).indexOf(v) >= 0;
                });
            });

            var s = curSort(e), sc = null;
            cols.forEach(function (c) { if (c.id === s.col && c.sort) sc = c; });
            if (sc) {
                view = view.map(function (r, i) { return { r: r, i: i, k: sc.sort(r) }; }).sort(function (a, b) {
                    if (a.k !== b.k) return (a.k < b.k ? -1 : 1) * s.dir;
                    return a.i - b.i;   // 같으면 원래 순서
                }).map(function (o) { return o.r; });
            }

            // ── 필터 줄 ──
            var sel = '';
            cols.forEach(function (c) {
                if (!c.opt) return;
                var cnt = optList[c.id] || {}, keys = Object.keys(cnt).sort();
                if (keys.length < 2 && !e.f[c.id]) return;   // 고를 게 하나뿐이면 상자를 안 만든다
                sel += '<select onchange="window._ftSet(\'' + id + '\', \'' + c.id + '\', this.value)" title="' + esc(c.label) + '" style="' +
                       (window._uiSelectStyle ? window._uiSelectStyle(!!e.f[c.id]) : '') + ' max-width:150px;">' +
                       '<option value="">' + esc(c.label + ' ' + T('전체', 'All')) + '</option>' +
                       keys.map(function (k) { return '<option value="' + esc(k) + '"' + (e.f[c.id] === k ? ' selected' : '') + '>' + esc(k) + ' (' + cnt[k] + ')</option>'; }).join('') +
                       '</select>';
            });
            var dirty = activeCount(e) > 0 || !!e.sort;
            var bar = '<div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin:0 0 5px;">' + sel +
                (dirty ? '<button onclick="window._ftReset(\'' + id + '\')" title="' + esc(T('필터·정렬 초기화', 'Reset filters and sort')) + '" style="' + (window._uiBtnStyle ? window._uiBtnStyle('danger') : '') + '">↺</button>' : '') +
                '<span style="margin-left:auto; font-size:11px; color:#888;">' + view.length + ' / ' + rows.length + esc(T('건', '')) + '</span></div>';

            // ── 표 ──
            var thBase = 'position:sticky; top:0; z-index:20; white-space:nowrap; padding:10px 8px; background:#eef6f7; color:#2c5f8a; border-right:1px solid var(--ui-cell-line, #cfe3e5); border-bottom:1px solid var(--ui-cell-line, #cfe3e5); font-size:12.5px; font-weight:600; text-align:center;';
            var tdBase = 'padding:6px 8px; border-right:1px solid var(--ui-cell-line, #cfe3e5); border-bottom:1px solid var(--ui-cell-line, #cfe3e5); vertical-align:top; font-size:12.5px;';
            var head = cols.map(function (c) {
                var on = c.sort && s.col === c.id;
                // 🚩 [2026-11-26 사용자 요청 "아래 행들과 동일하게"] thHtml 로 머리글 바(`.rp-bar-head`)를 놓는 칸은 아래 행의 `.rp-cell.rp-pad` 와 같은 자리에 — 그래야 바가 칸 왼쪽 끝에 붙는다.
                return '<th' + (c.sort ? ' onclick="window._ftSort(\'' + id + '\', \'' + c.id + '\')" title="' + esc(T('눌러서 정렬 (오름↔내림)', 'Click to sort (asc/desc)')) + '"' : '') +
                       (c.thHtml ? ' class="rp-cell rp-pad"' : '') +
                       ' style="' + thBase + (c.sort ? ' cursor:pointer; user-select:none;' : '') + (c.w ? ' width:' + c.w + ';' : '') + (c.thPad ? ' padding:' + c.thPad + ';' : '') + '">' +
                       (c.thHtml ? '<span style="display:inline-flex; align-items:center; gap:4px;">' + c.thHtml(view) + esc(c.label || '') + (on && window._uiSortMark ? window._uiSortMark(s.dir > 0) : '') + '</span>'
                                 : esc(c.label || '') + (on && window._uiSortMark ? window._uiSortMark(s.dir > 0) : '')) + '</th>';
            }).join('');
            var shown = cfg.max ? view.slice(0, cfg.max) : view;
            // 🔗 cfg.children(row) 가 있으면 그 행 **바로 아래** 자식 행을 그린다(정렬·필터·개수에는 안 센다 — 접었다 펴는 묶음용). html(row, i, isChild) 의 셋째 인자가 true.
            var cells = function (r, i, isChild) {
                return cols.map(function (c) {
                    var tc = c.tdCls ? c.tdCls(r) : '';
                    return '<td' + (tc ? ' class="' + tc + '"' : '') + (c.tdAttr ? ' ' + c.tdAttr : '') + ' style="' + tdBase +
                           (c.nowrap ? ' white-space:nowrap;' : '') + (c.align ? ' text-align:' + c.align + ';' : '') + '">' + c.html(r, i, isChild) + '</td>';
                }).join('');
            };
            var body = shown.map(function (r, i) {
                var cls = (i % 2 ? 'ft-zebra-b ' : '') + (cfg.rowClass ? (cfg.rowClass(r, i) || '') : '');
                var kids = cfg.children ? (cfg.children(r) || []) : [];
                return '<tr' + (cls.trim() ? ' class="' + cls.trim() + '"' : '') + ' ' + (cfg.rowAttr ? (cfg.rowAttr(r, i) || '') : '') + '>' + cells(r, i, false) + '</tr>' +
                    kids.map(function (k) {
                        var kc = 'ft-child ' + (cfg.rowClass ? (cfg.rowClass(k, -1) || '') : '');
                        return '<tr class="' + kc.trim() + '" ' + (cfg.childAttr ? (cfg.childAttr(k, r) || '') : '') + '>' + cells(k, -1, true) + '</tr>';
                    }).join('');
            }).join('');
            if (!shown.length) {
                body = '<tr><td colspan="' + cols.length + '" style="' + tdBase + ' text-align:center; color:#999; padding:24px 10px;">' +
                       esc(rows.length ? T('조건에 맞는 행이 없습니다', 'No rows match') : (cfg.empty || T('항목이 없습니다', 'Nothing to show'))) + '</td></tr>';
            }
            var more = (cfg.max && view.length > cfg.max)
                ? '<div style="font-size:11px; color:#999; margin-top:4px;">' + esc(T('… 외 ' + (view.length - cfg.max) + '건 — 필터·검색으로 좁혀 보세요', '… and ' + (view.length - cfg.max) + ' more — narrow with filters/search')) + '</div>' : '';
            var table = '<table class="ui-round-tbl" style="width:100%; border-collapse:separate; border-spacing:0; border-left:1px solid var(--ui-cell-line, #cfe3e5); border-top:1px solid var(--ui-cell-line, #cfe3e5); table-layout:auto; background:#fff;">' +
                        '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' + more;
            return { view: view, html: bar + table };
        },
        state: function (id) { return ent(id); },
        reset: function (id) { var e = ent(id); e.sort = ''; e.dir = 1; e.f = {}; }
    };

    function repaint(e) { if (e.cfg && typeof e.cfg.repaint === 'function') e.cfg.repaint(); }
    window._ftSort = function (id, col) {
        var e = ent(id), s = curSort(e), def = null;
        ((e.cfg && e.cfg.cols) || []).forEach(function (c) { if (c.id === col) def = c; });
        e.dir = (s.col === col) ? -s.dir : ((def && def.firstDir) || 1);
        e.sort = col;
        repaint(e);
    };
    window._ftSet = function (id, col, val) {
        var e = ent(id);
        if (val) e.f[col] = String(val); else delete e.f[col];
        repaint(e);
    };
    window._ftReset = function (id) { var e = ent(id); window._ft.reset(id); repaint(e); };
})();
