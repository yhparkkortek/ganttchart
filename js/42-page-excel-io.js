/* 📄↔📊 [2026-10-20 신규] 페이지 ↔ 엑셀 왕복 (출력 → 엑셀에서 수정 → 다시 불러오기)
 *
 * 왜 만들었나 (사용자 요청)
 * ─────────────────────────
 * 화면에서 한 칸씩 고치는 것보다 엑셀에서 한꺼번에 고치는 게 빠른 작업이 많다.
 * 그래서 각 페이지의 인쇄(PDF) 버튼 **왼쪽**에 "엑셀" 버튼 한 쌍을 둔다 — 내보내고,
 * 고친 파일을 그대로 다시 불러온다.
 *
 * 설계 원칙 (CLAUDE.md)
 * ─────────────────────
 * 1. **데이터화** — 어느 페이지의 무엇을 내보낼지는 아래 `PAGE_EXCEL_SPECS` 한 곳.
 *    새 페이지를 붙이려면 여기 항목 하나만 추가하면 된다(코드 수정 불필요).
 * 2. **필드명을 박지 않는다** — 행 객체의 키 합집합을 그대로 열로 쓴다. 그래서 Brief SPEC
 *    처럼 프로젝트마다 열이 달라지는 표도 그대로 왕복한다.
 * 3. **되돌릴 수 있게** — 불러오기 직전 상태를 스냅샷으로 떠 두고 "되돌리기"를 띄운다.
 *    (사용자 결정 2026-10-20: 통째로 교체 + 되돌리기)
 * 4. **조용히 실패하지 않기** — 시트가 없거나 열이 안 맞으면 무엇이 왜 안 됐는지 말한다.
 *
 * ⚠️ 파생 뷰는 왕복하지 않는다
 * ────────────────────────────
 * Calendar·주간 업무 보고·**알람**은 간트/프로젝트 데이터에서 **계산되는 화면**이라
 * 되돌려 넣을 원본이 없다. 알람은 `exportOnly: true`로 내보내기만 둔다(공지는 실제
 * 저장 데이터라 왕복 가능). 여기에 되돌리기를 억지로 붙이면 다음 재계산에 그냥 사라진다.
 *
 * ⚠️ 버튼은 HTML을 고치지 않고 **런타임에 끼워 넣는다**
 * ───────────────────────────────────────────────────
 * 인쇄 버튼(`printTabSection('tab-…')`)을 찾아 그 **앞**에 넣는다. HTML 5곳을 각각
 * 고치면 한 곳만 빠뜨려도 티가 안 나고, 인쇄 버튼이 옮겨가면 같이 따라가지 못한다.
 */
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (msg, kind) { if (window.showToast) window.showToast(msg, kind || 'info'); };

    // ── 공용 헬퍼 ──────────────────────────────────────────────────────
    // 행 배열 → 2차원 배열(머리글 + 값). 열은 **등장하는 키 전부**(순서 보존).
    var rowsToAoa = function (rows) {
        var cols = [];
        (rows || []).forEach(function (r) {
            Object.keys(r || {}).forEach(function (k) {
                if (k.charAt(0) === '_') return;          // 내부용 키(_level 등)는 내보내지 않는다
                if (cols.indexOf(k) === -1) cols.push(k);
            });
        });
        var aoa = [cols];
        (rows || []).forEach(function (r) {
            aoa.push(cols.map(function (c) { return (r && r[c] != null) ? r[c] : ''; }));
        });
        return aoa;
    };
    // 2차원 배열 → 행 배열. 머리글이 비었거나 값이 전부 빈 행은 버린다.
    var aoaToRows = function (aoa) {
        if (!aoa || !aoa.length) return [];
        var cols = (aoa[0] || []).map(function (c) { return String(c == null ? '' : c).trim(); });
        var out = [];
        for (var i = 1; i < aoa.length; i++) {
            var line = aoa[i] || [];
            if (!line.some(function (v) { return String(v == null ? '' : v).trim(); })) continue;
            var o = {};
            cols.forEach(function (c, j) { if (c) o[c] = (line[j] == null ? '' : String(line[j])); });
            out.push(o);
        }
        return out;
    };
    // 키/값 블록(개요처럼 칸이 몇 개뿐인 것)
    var kvToAoa = function (obj, labels) {
        var aoa = [[_t('항목', 'Field'), _t('값', 'Value')]];
        Object.keys(labels).forEach(function (k) { aoa.push([labels[k], (obj && obj[k] != null) ? obj[k] : '']); });
        return aoa;
    };
    var aoaToKv = function (aoa, labels) {
        var byLabel = {};
        Object.keys(labels).forEach(function (k) { byLabel[labels[k]] = k; });
        var out = {};
        (aoa || []).slice(1).forEach(function (line) {
            var key = byLabel[String((line || [])[0] || '').trim()];
            if (key) out[key] = (line[1] == null ? '' : String(line[1]));
        });
        return out;
    };

    var _td = function () { window.tabData = window.tabData || {}; return window.tabData; };
    // 화면 반영 — 페이지마다 다른 렌더를 안전하게(없으면 조용히 건너뜀) 부른다.
    var _repaint = function (fns) {
        (fns || []).forEach(function (f) { try { if (typeof window[f] === 'function') window[f](); } catch (e) { /* 하나 실패해도 나머지는 그린다 */ } });
    };

    // ── 📚 페이지 카탈로그 (데이터) ────────────────────────────────────
    //   id        : 내부 식별자
    //   tab       : 인쇄 버튼이 가리키는 탭 id — 버튼을 꽂을 자리를 이걸로 찾는다
    //   label     : 파일명/안내문에 쓰는 이름
    //   exportOnly: true면 "불러오기"를 만들지 않는다(파생 뷰)
    //   blocks[]  : 시트 하나당 하나. get()은 쓸 데이터를, set()은 되돌려 넣기를 한다.
    window.PAGE_EXCEL_SPECS = window.PAGE_EXCEL_SPECS || [
        {
            id: 'summary', tab: 'tab-summary', label: 'Summary',
            repaint: ['populateTabData', 'renderProjectModels', 'renderMaterialModelsContainer', 'renderSummaryTimeline'],
            blocks: [
                {
                    sheet: '개요', kind: 'kv',
                    labels: { purpose: '개발 목적', volume: '예상 물량', mpDate: 'MP 일정', background: '배경', devDays: '개발기간(일)' },
                    get: function () { return (_td().summary || {}); },
                    set: function (obj) { _td().summary = Object.assign({}, _td().summary || {}, obj); }
                },
                {
                    sheet: '마일스톤', kind: 'rows',
                    get: function () {
                        var ms = (_td().summary || {}).milestones || {};
                        return Object.keys(ms).map(function (stage) {
                            return Object.assign({ 단계: stage }, ms[stage] || {});
                        });
                    },
                    set: function (rows) {
                        var ms = {};
                        (rows || []).forEach(function (r) {
                            var stage = String(r['단계'] || '').trim(); if (!stage) return;
                            var o = {}; Object.keys(r).forEach(function (k) { if (k !== '단계') o[k] = r[k]; });
                            ms[stage] = o;
                        });
                        _td().summary = _td().summary || {}; _td().summary.milestones = ms;
                    }
                },
                {
                    sheet: '주요자재', kind: 'rows',
                    // 모델별로 나뉜 표를 한 시트에 담되, 어느 모델 것인지 '모델' 열로 구분한다.
                    get: function () {
                        var out = [];
                        ((_td().projectModels) || []).forEach(function (m, i) {
                            (m.materials || []).forEach(function (r) {
                                out.push(Object.assign({ 모델: '#' + (i + 1) }, r));
                            });
                        });
                        return out;
                    },
                    set: function (rows) {
                        var models = _td().projectModels || [];
                        var buckets = {};
                        (rows || []).forEach(function (r) {
                            var mi = parseInt(String(r['모델'] || '#1').replace(/[^0-9]/g, ''), 10) || 1;
                            var o = {}; Object.keys(r).forEach(function (k) { if (k !== '모델') o[k] = r[k]; });
                            (buckets[mi - 1] = buckets[mi - 1] || []).push(o);
                        });
                        Object.keys(buckets).forEach(function (i) { if (models[i]) models[i].materials = buckets[i]; });
                    }
                }
            ]
        },
        {
            id: 'briefspec', tab: 'tab-briefspec', label: 'Brief SPEC',
            repaint: ['populateTabData'],
            blocks: [{ sheet: 'Brief SPEC', kind: 'rows',
                get: function () { return _td().briefSpec || []; },
                set: function (rows) { _td().briefSpec = rows || []; } }]
        },
        {
            id: 'mctable', tab: 'tab-mctable', label: 'M.C Table',
            repaint: ['populateTabData'],
            // 리비전별로 보관되므로 **지금 보고 있는 리비전**만 왕복한다.
            blocks: [{ sheet: 'M.C Table', kind: 'rows',
                get: function () {
                    var rev = _td().mcActiveRevision || 'R1';   // js/22g의 collectTabData와 같은 출처
                    return ((_td().mcRevisions || {})[rev]) || _td().mcTable || [];
                },
                set: function (rows) {
                    var rev = _td().mcActiveRevision || 'R1';
                    _td().mcRevisions = _td().mcRevisions || {};
                    _td().mcRevisions[rev] = rows || [];
                    if (rev === 'R1') _td().mcTable = rows || [];   // 저장 호환용 별칭
                } }]
        },
        {
            id: 'address', tab: 'tab-address', label: 'Address Book',
            repaint: ['renderAddressTable'],
            blocks: [{ sheet: 'Address', kind: 'rows',
                get: function () { return _td().addressBook || []; },
                set: function (rows) { _td().addressBook = rows || []; } }]
        },
        {
            // ⚠️ 알람과 공지는 **인쇄 버튼 하나를 공유**한다(onclick이 `_alarmView` 조건식).
            //    그대로 두면 두 쌍이 같이 붙어 헷갈린다 — 지금 보고 있는 쪽만 띄운다.
            id: 'notice', tab: 'tab-notice', label: '공지',
            visibleWhen: function () { return window._alarmView === 'notice'; },
            repaint: ['renderNoticeTab'],
            blocks: [{ sheet: '공지', kind: 'rows',
                get: function () { return window._noticeItems || []; },
                set: function (rows) {
                    window._noticeItems = rows || [];
                    // 공지는 tabData가 아니라 localStorage에 산다(js/22b) — 저장까지 해야 남는다.
                    try { localStorage.setItem('gantt_notice_items', JSON.stringify(window._noticeItems)); } catch (e) { /* 용량 초과 등은 아래 안내로 드러남 */ }
                } }]
        },
        {
            // ⚠️ 알람은 간트에서 **계산되는** 목록이다(collectAlarmItems) — 되돌려 넣을 곳이 없다.
            id: 'alarm', tab: 'tab-alarm', label: '알람', exportOnly: true,
            visibleWhen: function () { return window._alarmView !== 'notice'; },
            blocks: [{ sheet: '알람', kind: 'rows',
                get: function () { return (window.collectAlarmItems ? window.collectAlarmItems() : []) || []; } }]
        }
    ];

    var _specById = function (id) {
        return (window.PAGE_EXCEL_SPECS || []).find(function (s) { return s.id === id; }) || null;
    };

    // ── 내보내기 ───────────────────────────────────────────────────────
    window.pageExcelExport = function (id) {
        var spec = _specById(id);
        if (!spec) { _toast(_t('알 수 없는 페이지입니다: ', 'Unknown page: ') + id, 'error'); return; }
        if (!window.XLSX) { _toast(_t('엑셀 라이브러리가 아직 로드되지 않았습니다.', 'Excel library not loaded yet.'), 'error'); return; }
        // 화면에서 편집 중인 값을 먼저 데이터로 끌어온다(안 하면 방금 고친 칸이 빠진다).
        try { if (window.collectTabData) window.collectTabData(); } catch (e) { /* 수집 실패해도 있는 값으로 내보낸다 */ }

        var wb = window.XLSX.utils.book_new(), empty = 0;
        spec.blocks.forEach(function (b) {
            var aoa = (b.kind === 'kv') ? kvToAoa(b.get(), b.labels) : rowsToAoa(b.get());
            if (aoa.length <= 1) empty++;
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), b.sheet.slice(0, 31));
        });
        var pm = window.projectMeta || {};
        var name = [(pm.프로젝트명 || pm.고객모델명 || 'project'), spec.label,
                    new Date().toISOString().slice(0, 10).replace(/-/g, '')].join('_') + '.xlsx';
        try { window.XLSX.writeFile(wb, name.replace(/[\\/:*?"<>|]/g, '_')); }
        catch (e) { _toast('⚠️ ' + _t('엑셀 저장 실패: ', 'Excel save failed: ') + (e && e.message ? e.message : e), 'error'); return; }
        _toast('📊 ' + spec.label + ' ' + _t('엑셀을 내보냈습니다.', 'exported.')
               + (empty ? ' (' + _t('빈 시트 ', 'empty sheets: ') + empty + ')' : ''), 'success');
    };

    // ── 불러오기 ───────────────────────────────────────────────────────
    window._pageExcelUndo = window._pageExcelUndo || {};   // id → 직전 스냅샷(JSON 문자열)

    window.pageExcelImportPick = function (id) {
        var spec = _specById(id);
        if (!spec || spec.exportOnly) return;
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.xlsx,.xls';
        inp.onchange = function () { if (inp.files && inp.files[0]) window.pageExcelImport(id, inp.files[0]); };
        inp.click();
    };

    window.pageExcelImport = async function (id, file) {
        var spec = _specById(id);
        if (!spec || spec.exportOnly || !window.XLSX) return;
        var wb;
        try {
            var buf = await file.arrayBuffer();
            wb = window.XLSX.read(buf, { type: 'array' });
        } catch (e) {
            _toast('⚠️ ' + _t('엑셀을 읽지 못했습니다: ', 'Could not read the file: ') + (e && e.message ? e.message : e), 'error');
            return;
        }

        // 어떤 시트가 어느 블록인지 — 이름이 정확히 같은 것만 받는다(엉뚱한 시트를 밀어넣지 않게).
        var matched = [], missing = [];
        spec.blocks.forEach(function (b) {
            var sh = wb.Sheets[b.sheet] || wb.Sheets[b.sheet.slice(0, 31)];
            if (sh) matched.push({ b: b, sh: sh }); else missing.push(b.sheet);
        });
        if (!matched.length) {
            _toast('⚠️ ' + _t('이 페이지의 시트를 찾지 못했습니다. 필요한 시트: ', 'No matching sheet. Expected: ')
                   + spec.blocks.map(function (b) { return b.sheet; }).join(', '), 'error');
            return;
        }

        // 바꾸기 전 상태를 통째로 떠 둔다(되돌리기용).
        var snap = {};
        spec.blocks.forEach(function (b) { try { snap[b.sheet] = JSON.parse(JSON.stringify(b.get())); } catch (e) { snap[b.sheet] = null; } });

        var summary = [];
        matched.forEach(function (m) {
            var aoa = window.XLSX.utils.sheet_to_json(m.sh, { header: 1, defval: '', raw: false });
            if (m.b.kind === 'kv') {
                m.b.set(aoaToKv(aoa, m.b.labels));
                summary.push(m.b.sheet);
            } else {
                var rows = aoaToRows(aoa);
                var before = (m.b.get() || []).length;
                m.b.set(rows);
                summary.push(m.b.sheet + ' ' + before + '→' + rows.length + _t('행', ''));
            }
        });

        window._pageExcelUndo[id] = JSON.stringify(snap);
        _repaint(spec.repaint);
        // 불러오기도 '저장 안 된 변경'이다 — 안 찍으면 창을 닫을 때 경고 없이 날아간다(js/04a).
        if (window._markNonGanttDirty) { try { window._markNonGanttDirty(); } catch (e) { /* 표시 실패가 불러오기를 막진 않는다 */ } }

        _toast('📥 ' + spec.label + ' ' + _t('불러왔습니다 — ', 'imported — ') + summary.join(' / ')
               + (missing.length ? (' / ' + _t('건너뜀: ', 'skipped: ') + missing.join(', ')) : ''), 'success');
        _pxRenderButtons();   // 되돌리기 버튼을 띄우기 위해 다시 그린다
    };

    window.pageExcelUndo = function (id) {
        var spec = _specById(id), raw = window._pageExcelUndo[id];
        if (!spec || !raw) return;
        var snap;
        try { snap = JSON.parse(raw); } catch (e) { return; }
        spec.blocks.forEach(function (b) {
            if (snap[b.sheet] == null) return;
            if (b.kind === 'kv') b.set(snap[b.sheet]); else b.set(snap[b.sheet]);
        });
        delete window._pageExcelUndo[id];
        _repaint(spec.repaint);
        _toast('↩️ ' + spec.label + ' ' + _t('불러오기 전으로 되돌렸습니다.', 'restored.'), 'success');
        _pxRenderButtons();
    };

    // ── 버튼 (인쇄 버튼 **왼쪽**에 런타임 삽입) ────────────────────────
    //   자리가 좁다는 요청이라 아이콘 위주로 아주 작게. 설명은 말풍선(title)에 둔다.
    var BTN = 'white-space:nowrap; padding:4px 6px; background:#e0f5f7; color:#00707d; border:none;'
            + ' border-radius:5px; font-size:11.5px; font-weight:bold; cursor:pointer; line-height:1.3;'
            + ' transition:background .15s; margin-right:3px;';

    function _pxRenderButtons() {
        (window.PAGE_EXCEL_SPECS || []).forEach(function (spec) {
            // 인쇄 버튼을 찾는다 — onclick 안의 탭 id로 식별(HTML을 안 고치기 위해).
            var printBtn = null;
            var all = document.querySelectorAll('button[onclick*="printTabSection"]');
            for (var i = 0; i < all.length; i++) {
                if ((all[i].getAttribute('onclick') || '').indexOf("'" + spec.tab + "'") !== -1) { printBtn = all[i]; break; }
            }
            if (!printBtn || !printBtn.parentNode) return;
            var show = (typeof spec.visibleWhen === 'function') ? !!spec.visibleWhen() : true;

            var holderId = 'px-btns-' + spec.id;
            var holder = document.getElementById(holderId);
            if (!show) { if (holder) holder.remove(); return; }
            if (!holder) {
                holder = document.createElement('span');
                holder.id = holderId;
                holder.style.cssText = 'display:inline-flex; align-items:center;';
                printBtn.parentNode.insertBefore(holder, printBtn);   // ← 인쇄 버튼 앞
            }
            var hasUndo = !!window._pageExcelUndo[spec.id];
            holder.innerHTML =
                '<button onclick="window.pageExcelExport(\'' + spec.id + '\')" title="'
                  + _esc(_t(spec.label + ' 내용을 엑셀로 내보냅니다', 'Export ' + spec.label + ' to Excel'))
                  + '" onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                  + ' style="' + BTN + '">📊</button>'
                + (spec.exportOnly ? '' :
                    '<button onclick="window.pageExcelImportPick(\'' + spec.id + '\')" title="'
                  + _esc(_t('엑셀에서 수정한 내용을 다시 불러옵니다 (현재 내용은 통째로 교체되며, 바로 되돌릴 수 있습니다)',
                            'Import an edited Excel file (replaces current content; you can undo right after)'))
                  + '" onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                  + ' style="' + BTN + '">📥</button>')
                + (hasUndo ?
                    '<button onclick="window.pageExcelUndo(\'' + spec.id + '\')" title="'
                  + _esc(_t('방금 불러오기 전으로 되돌립니다', 'Undo the import'))
                  + '" onmouseover="this.style.background=\'#f5c2bd\';" onmouseout="this.style.background=\'#fbe4e2\';"'
                  + ' style="' + BTN + ' background:#fbe4e2; color:#b1432f;">↩</button>' : '');
        });
    }
    window._pxRenderButtons = _pxRenderButtons;

    // 탭은 나중에 그려지는 것도 있어서, 로드 후 한 번 + 탭 전환 때마다 다시 시도한다.
    var _boot = function () { try { _pxRenderButtons(); } catch (e) { /* 버튼 실패가 페이지를 막지 않게 */ } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
    else _boot();
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('button, a, [onclick]')) setTimeout(_boot, 120);
    }, true);
})();
