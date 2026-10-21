// 🧾 [2026-10-21 신규] M.C Table — 협력사/사내 M.C 엑셀을 그대로 불러오기
//
// 이 파일이 다루는 양식은 "KONAMI_..._MC Table_RevNN.xlsx" 처럼 R1 시트에 B~K 열로
// 표가 들어있는 **고정 양식**이다. 실측(파일 3개·시트 4장)에서 레이아웃이 완전히 같았으므로
// AI를 쓰지 않는다 — CLAUDE.md "결정론 먼저". AI는 이 양식이 아닐 때의 폴백으로만 둔다.
//
// 양식에서 조심해야 하는 것(전부 실측에서 확인):
//  · 머리글이 1행이 아니라 **6행**이다(2~5행은 제목·환율·병합된 그룹 머리글).
//  · 데이터는 **B~K 열뿐**이고, L은 빈 칸, M열부터는 **패널 후보 비교표**라는 전혀 다른 표가
//    옆에 붙어 있다. 시트를 통째로 읽으면 그 26열이 섞여 들어온다.
//  · D열에 "...COST"가 적힌 행 8개는 **계산행**이다(앱이 다시 계산하므로 넣으면 중복).
//  · 맨 끝 총합계 행은 **라벨이 없다** — B~F가 전부 비고 G~J에 숫자만 있다.
//  · 그 아래 Revision 이력 블록(R1~R6)이 붙어 있어 거기서 끊어야 한다.
//  · 원가 쌍이 둘뿐이다(Sample/Proto A, MP) — 앱의 PROTO B 자리는 비워 둔다.
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };

    // 열 자리는 **데이터**로 둔다 — 다른 회사 양식이 와도 여기만 고치면 된다.
    var MC_SRC = {
        firstCol: 2,                     // B
        lastCol: 11,                     // K
        headerFirst: 'TYPE',             // B열 머리글(원본 파일엔 'TYEP' 오타가 있다)
        headerAliases: ['TYPE', 'TYEP'],
        fields: ['type', 'item', 'group', 'pn', 'spec', 'protoCost', 'protoNre', 'mpCost', 'mpNre', 'note'],
        calcCol: 4,                      // D — 여기에 'COST'가 있으면 계산행
        stopWords: ['REVISION']          // B열에 이 말이 나오면 표 끝
    };
    var _num = function (v) {
        if (v == null || v === '') return null;
        var n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
        return isFinite(n) ? n : null;
    };
    var _s = function (v) { return (v == null) ? '' : String(v).trim(); };

    // 시트 하나 → {rows, title, skipped} 또는 null(이 양식이 아님)
    window._mcParseSourceSheet = function (ws) {
        if (!ws || !ws['!ref'] || !window.XLSX) return null;
        var X = window.XLSX, rg = X.utils.decode_range(ws['!ref']);
        var cell = function (r, c) { var x = ws[X.utils.encode_cell({ r: r - 1, c: c - 1 })]; return x ? x.v : null; };

        // 머리글 행 찾기 — B열이 TYPE/TYEP 이고 C열이 ITEM 인 줄
        var hdr = 0;
        for (var r = 1; r <= Math.min(rg.e.r + 1, 20); r++) {
            var b = _s(cell(r, MC_SRC.firstCol)).toUpperCase();
            var c3 = _s(cell(r, 3)).toUpperCase();
            if (MC_SRC.headerAliases.indexOf(b) >= 0 && c3 === 'ITEM') { hdr = r; break; }
        }
        if (!hdr) return null;

        var title = '';
        for (var tr = 1; tr < hdr; tr++) {
            var tv = _s(cell(tr, MC_SRC.firstCol));
            if (/MODEL\s*:/i.test(tv)) { title = tv.replace(/^MODEL\s*:\s*/i, '').trim(); break; }
        }

        var rows = [], skipped = { calc: 0, total: 0 };
        for (var rr = hdr + 1; rr <= rg.e.r + 1; rr++) {
            var first = _s(cell(rr, MC_SRC.firstCol));
            if (MC_SRC.stopWords.indexOf(first.toUpperCase()) >= 0) break;

            var raw = [];
            for (var cc = MC_SRC.firstCol; cc <= MC_SRC.lastCol; cc++) raw.push(cell(rr, cc));
            if (raw.every(function (v) { return v == null || _s(v) === ''; })) continue;

            // 계산행 — D열에 'COST'(PANEL Parts COST, TOOLING COST …)
            if (/COST/i.test(_s(cell(rr, MC_SRC.calcCol)))) { skipped.calc++; continue; }

            // 라벨 없는 총합계 행 — 글자 칸(B~F)은 다 비었는데 금액(G~J)만 있다
            var textEmpty = raw.slice(0, 5).every(function (v) { return _s(v) === ''; });
            var hasMoney = raw.slice(5, 9).some(function (v) { return _num(v) !== null; });
            if (textEmpty && hasMoney) { skipped.total++; continue; }

            var o = {};
            MC_SRC.fields.forEach(function (f, i) {
                var v = raw[i];
                if (f === 'protoCost' || f === 'protoNre' || f === 'mpCost' || f === 'mpNre') {
                    var n = _num(v); o[f] = (n === null) ? '' : String(n);
                } else o[f] = _s(v);
            });
            // 앱은 쌍이 셋(PROTO A/B/MP)인데 이 양식은 둘뿐이다 — B는 비워 둔다.
            o.protoBCost = ''; o.protoBNre = '';
            if (MC_SRC.fields.every(function (f) { return !o[f]; })) continue;
            rows.push(o);
        }
        return rows.length ? { rows: rows, title: title, skipped: skipped } : null;
    };

    // 워크북 하나 → 이 양식으로 읽히는 시트 전부
    window._mcScanWorkbook = function (wb, fileName) {
        var out = [];
        (wb.SheetNames || []).forEach(function (sn) {
            var p = window._mcParseSourceSheet(wb.Sheets[sn]);
            if (!p) return;
            var sum = function (f) {
                return p.rows.reduce(function (a, r) { var n = _num(r[f]); return a + (n || 0); }, 0);
            };
            out.push({
                file: fileName, sheet: sn, title: p.title, rows: p.rows, skipped: p.skipped,
                protoTotal: sum('protoCost'), mpTotal: sum('mpCost'),
                // 리비전은 시트 이름에서 — 'R1', 'R1(CAP)' 둘 다 R1
                rev: (String(sn).match(/^R(\d+)/i) ? 'R' + String(sn).match(/^R(\d+)/i)[1] : 'R1'),
                // ⚠️ 같은 파일의 'MECH' 같은 보조 시트도 TYPE/ITEM 머리글이 있어 표로 잡힌다(실측).
                //    버리지는 않는다 — 보여는 주되 **기본 체크는 끈다.** 리비전 시트(R1, R1(CAP)…)만 켠다.
                isRev: /^R\d+/i.test(String(sn)),
                target: ''   // 사람이 고를 제품구분자
            });
        });
        return out;
    };

    // 파일 이름에서 제품구분자 후보를 뽑는다 — "..._55in MVD_MC Table_..." → "55in MVD"
    var _suggestUnit = function (cand) {
        var m = String(cand.file || '').match(/_([^_]+?)_MC\s*Table/i);
        var base = m ? m[1].trim() : '';
        if (!base) base = String(cand.title || '').replace(/^KGP-\d+\s*/i, '').trim();
        // 한 파일에 시트가 여럿이면 시트 이름의 괄호를 덧붙여 구분 — R1(CAP) → "32in TPR CAP"
        var pm = String(cand.sheet || '').match(/\(([^)]+)\)/);
        if (pm) base = (base + ' ' + pm[1]).trim();
        return base || String(cand.sheet || '');
    };

    // ── 선택 화면 ──────────────────────────────────────────────────────
    //  여러 파일/시트를 한꺼번에 받아, **무엇이 들어있는지 보여주고** 어디에 넣을지 고르게 한다.
    //  사람이 승인하기 전엔 아무것도 바뀌지 않는다(CLAUDE.md 원칙 5).
    window._mcPendingCands = null;

    window._mcOpenImportPicker = function (cands) {
        if (!cands || !cands.length) {
            _toast('⚠️ ' + _t('M.C 표를 찾지 못했습니다 — R1 시트에 TYPE/ITEM 머리글이 있는 파일인지 확인해주세요.',
                              'No M.C table found — the sheet needs a TYPE/ITEM header row.'), 'error');
            return;
        }
        cands.forEach(function (c) { if (!c.target) c.target = _suggestUnit(c); });
        window._mcPendingCands = cands;

        var ov = document.getElementById('mc-imp-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'mc-imp-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="mc-imp-box" style="pointer-events:all; position:fixed; left:50%; top:10%; transform:translateX(-50%);'
                + ' width:min(1000px,94vw); max-height:78vh; display:flex; flex-direction:column; background:#fff; border:1px solid #ffe08a;'
                + ' border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden; resize:both; min-width:560px; min-height:320px;">'
                + '<div id="mc-imp-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px;'
                + ' padding:9px 12px; background:#fff8e6; border-bottom:1px solid #ffe08a; color:#7a5210; font-weight:bold; font-size:13px;'
                + ' cursor:grab; user-select:none;"><span id="mc-imp-title"></span>'
                + '<button onclick="window._mcImpClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="mc-imp-body" style="flex:1; overflow:auto; padding:10px 12px;"></div>'
                + '<div style="flex-shrink:0; display:flex; justify-content:flex-end; gap:6px; padding:9px 12px; border-top:1px solid #e9ecef;">'
                + '<button onclick="window._mcImpClose()" style="padding:6px 12px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6;'
                + ' border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">' + _esc(_t('취소', 'Cancel')) + '</button>'
                + '<button id="mc-imp-apply" onclick="window._mcImpApply()" onmouseover="this.style.background=\'#c9ecd3\'; this.style.borderColor=\'#7cc494\';"'
                + ' onmouseout="this.style.background=\'#e6f6ea\'; this.style.borderColor=\'#a8dab8\';"'
                + ' style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px;'
                + ' font-size:12px; font-weight:bold; cursor:pointer;">✅ ' + _esc(_t('선택한 것만 적용', 'Apply selected')) + '</button></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('mc-imp-box', 'mc-imp-head'); } catch (e) { /* 드래그 실패가 열기를 막지 않게 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('mc-imp-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('mc-imp-overlay'); } catch (e) { /* 〃 */ } }
        window._mcImpRender();
    };

    window._mcImpRender = function () {
        var cands = window._mcPendingCands || [];
        var files = {};
        cands.forEach(function (c) { files[c.file] = (files[c.file] || 0) + 1; });
        document.getElementById('mc-imp-title').textContent =
            '🧾 ' + _t('M.C 불러오기 — 파일 ', 'M.C import — ') + Object.keys(files).length
            + _t('개에서 표 ', ' file(s), ') + cands.length + _t('개를 찾았습니다', ' table(s) found');

        var units = (window.getMcUnits ? window.getMcUnits() : (window.tabData && window.tabData.mcUnits) || []) || [];
        var html = '<div style="margin-bottom:8px; font-size:11.5px; color:#868e96;">'
            + _esc(_t('각 표를 어느 제품구분자에 넣을지 고르세요. 체크한 것만 들어갑니다. 같은 이름이 이미 있으면 그 리비전을 덮어씁니다.',
                      'Choose a target unit for each table. Only checked rows are imported; an existing unit/revision is replaced.'))
            + '</div><table style="border-collapse:collapse; width:100%; font-size:11.5px;"><thead><tr>'
            + ['', _t('파일', 'File'), _t('시트', 'Sheet'), _t('모델 표기', 'Model line'), _t('행', 'Rows'),
               'Proto A', 'MP', _t('리비전', 'Rev'), _t('넣을 제품구분자', 'Target unit')].map(function (h) {
                return '<th style="background:#fff8e6; border:1px solid #e9ecef; padding:4px 6px; white-space:nowrap;">' + _esc(h) + '</th>';
            }).join('') + '</tr></thead><tbody>';

        cands.forEach(function (c, i) {
            var money = function (v) { return v ? '$' + Math.round(v).toLocaleString('en-US') : '-'; };
            html += '<tr style="background:' + (i % 2 ? '#fcfaf7' : '#fff') + ';">'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; text-align:center;">'
                + '<input type="checkbox" id="mc-imp-ck-' + i + '"' + (c.isRev ? ' checked' : '') + '></td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + _esc(c.file) + '">' + _esc(c.file) + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; white-space:nowrap;">' + _esc(c.sheet)
                + (c.isRev ? '' : ' <span title="' + _esc(_t('리비전 시트가 아니라 기본으로 꺼 두었습니다', 'Not a revision sheet — unchecked by default'))
                              + '" style="color:#b1432f; cursor:help;">⚠</span>') + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; max-width:260px;" title="' + _esc(c.title) + '">' + _esc(c.title || '-') + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; text-align:right;">' + c.rows.length + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; text-align:right;">' + money(c.protoTotal) + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; text-align:right;">' + money(c.mpTotal) + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; text-align:center;">' + _esc(c.rev) + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px;"><input type="text" id="mc-imp-tg-' + i + '" value="' + _esc(c.target)
                + '" list="mc-imp-units" style="width:100%; box-sizing:border-box; padding:3px 5px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px;"></td>'
                + '</tr>';
        });
        html += '</tbody></table><datalist id="mc-imp-units">'
            + units.map(function (u) { return '<option value="' + _esc(u) + '">'; }).join('') + '</datalist>';

        var sk = cands.reduce(function (a, c) { return a + (c.skipped.calc + c.skipped.total); }, 0);
        if (sk) html += '<div style="margin-top:8px; font-size:11px; color:#868e96;">'
            + _esc(_t('합계·소계 행 ' + sk + '개는 뺐습니다 — 앱이 다시 계산합니다.',
                      sk + ' subtotal/total rows were dropped — the app recalculates them.')) + '</div>';
        document.getElementById('mc-imp-body').innerHTML = html;
    };

    window._mcImpClose = function () {
        var ov = document.getElementById('mc-imp-overlay');
        if (ov) ov.style.display = 'none';
        window._mcPendingCands = null;
    };

    window._mcImpApply = function () {
        var cands = window._mcPendingCands || [];
        var picked = [];
        cands.forEach(function (c, i) {
            var ck = document.getElementById('mc-imp-ck-' + i);
            var tg = document.getElementById('mc-imp-tg-' + i);
            if (!ck || !ck.checked) return;
            var name = (tg ? tg.value : '').trim();
            if (!name) return;
            picked.push({ c: c, unit: name });
        });
        if (!picked.length) { _toast('⚠️ ' + _t('고른 표가 없습니다.', 'Nothing selected.'), 'error'); return; }

        // 같은 제품구분자+리비전을 두 번 넣으려 하면 먼저 막는다 — 조용히 덮어쓰면 한쪽이 사라진다.
        var seen = {}, dup = null;
        picked.forEach(function (p) {
            var k = p.unit + '||' + p.c.rev;
            if (seen[k]) dup = p.unit + ' / ' + p.c.rev; else seen[k] = 1;
        });
        if (dup) {
            _toast('⚠️ ' + _t('"' + dup + '"에 두 표를 넣을 수 없습니다 — 이름을 다르게 적어주세요.',
                              'Two tables target "' + dup + '" — give them different names.'), 'error');
            return;
        }

        var td = window.tabData = window.tabData || {};
        td.mcRevisionsByUnit = td.mcRevisionsByUnit || {};
        td.mcSalesPriceDetailByUnit = td.mcSalesPriceDetailByUnit || {};
        td.mcUnits = td.mcUnits || [];

        picked.forEach(function (p) {
            var u = p.unit;
            td.mcRevisionsByUnit[u] = td.mcRevisionsByUnit[u] || {};
            td.mcSalesPriceDetailByUnit[u] = td.mcSalesPriceDetailByUnit[u] || {};
            td.mcRevisionsByUnit[u][p.c.rev] = p.c.rows;
            if (td.mcUnits.indexOf(u) === -1) td.mcUnits.push(u);
        });
        // 이름 없는 임시 자리가 남아 있으면 치운다 — 두면 엑셀에 "이름 없음" 시트가 같이 나온다.
        if (td.mcUnits.length) { delete td.mcRevisionsByUnit['']; delete td.mcSalesPriceDetailByUnit['']; }

        var first = picked[0];
        window.mcActiveUnit = first.unit;
        td.mcRevisions = td.mcRevisionsByUnit[first.unit];
        td.mcSalesPriceDetail = td.mcSalesPriceDetailByUnit[first.unit];
        td.mcActiveRevision = first.c.rev;
        td.mcTable = td.mcRevisions[first.c.rev] || [];

        if (window.mcRenderUnitTabs) { try { window.mcRenderUnitTabs(); } catch (e) { /* 탭 재렌더 실패가 적용을 막지 않게 */ } }
        if (window.populateTabData) { try { window.populateTabData(); } catch (e) { /* 〃 */ } }
        if (window._markNonGanttDirty) { try { window._markNonGanttDirty(); } catch (e) { /* 〃 */ } }

        _toast('🧾 ' + _t('M.C 를 불러왔습니다 — ', 'M.C imported — ')
            + picked.map(function (p) { return p.unit + '(' + p.c.rev + ') ' + p.c.rows.length + _t('행', ''); }).join(', '), 'success');
        window._mcImpClose();
    };
})();
