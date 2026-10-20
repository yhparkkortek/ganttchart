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

    // ── 🧮 M.C Table 전용 헬퍼 ─────────────────────────────────────────
    // 열 구성 — 화면에서 PROTO A/B·MP 쌍을 숨겨도 **데이터엔 남아 있으므로 전부 낸다**(사용자 요청).
    var _MC_COLS = [
        { h: 'NO',            k: null },
        { h: 'TYPE',          k: 'type' },
        { h: 'ITEM',          k: 'item' },
        { h: 'GROUP',         k: 'group' },
        { h: 'P/N',           k: 'pn' },
        { h: 'Specification', k: 'spec' },
        { h: 'PROTO A Cost',  k: 'protoCost',  num: true },
        { h: 'PROTO A NRE',   k: 'protoNre',   num: true },
        { h: 'PROTO B Cost',  k: 'protoBCost', num: true },
        { h: 'PROTO B NRE',   k: 'protoBNre',  num: true },
        { h: 'MP Cost',       k: 'mpCost',     num: true },
        { h: 'MP NRE',        k: 'mpNre',      num: true },
        { h: 'Note',          k: 'note' }
    ];
    var _MC_CALC_LABELS = ['SUBTOTAL', 'TOTAL(M.C)', '영업판가', '재료비율'];
    // 💵 금액 칸 표시형식 — 사용자가 쓰는 M.C Table 견본의 회계 서식 그대로다(달러 기호 왼쪽 정렬,
    //    0은 "-"로). 역슬래시가 들어 있으니 **heredoc으로 쓰지 말 것**(조용히 깨진다).
    var _MC_MONEY_FMT = '_-[$$-409]* #,##0.00_ ;_-[$$-409]* \\-#,##0.00\\ ;_-[$$-409]* "-"??_ ;_-@_ ';
    var _mcRev  = function () { return _td().mcActiveRevision || 'R1'; };
    var _mcRows = function () { return ((_td().mcRevisions || {})[_mcRev()]) || _td().mcTable || []; };
    // 엑셀에서 돌아온 행이 계산 행인지 — TYPE 칸의 라벨로 가린다(그 행은 화면이 다시 만든다).
    var _mcIsCalcRow = function (r) {
        var t = String((r && (r.TYPE != null ? r.TYPE : r.type)) || '').toUpperCase();
        return _MC_CALC_LABELS.some(function (L) { return t.indexOf(L.toUpperCase()) >= 0; });
    };
    var _mcNum = function (v) {
        var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.-]/g, ''));   // "$1,234.00" 같은 표시값도 받는다
        return isFinite(n) ? n : null;
    };
    // 🔁 엑셀에서 돌아온 행을 **앱이 쓰는 키로 되돌린다.** M.C 시트의 머리글은 사람이 읽는
    //    이름('PROTO A Cost')이지만 화면 렌더러는 `r.protoCost`를 읽는다 — 이 환원을 빼먹으면
    //    행 수는 맞는데 모든 칸이 비어 보인다(2026-10-20 왕복 실측에서 실제로 그랬다).
    //    금액은 표시형식이 입힌 '$1,234.20'으로 돌아오므로 **숫자만 남겨 저장한다** — 그대로
    //    두면 화면은 읽히지만(parseNum이 기호를 뗀다) 프로젝트 JSON에 통화기호가 섞여 쌓인다.
    var _mcRowFromSheet = function (r) {
        if (!r || typeof r !== 'object') return r;
        var out = {};
        _MC_COLS.forEach(function (col) {
            if (!col.k) return;                                   // NO 열은 화면이 다시 매긴다
            var v = (r[col.h] !== undefined) ? r[col.h] : r[col.k];
            v = (v == null) ? '' : String(v).trim();
            if (col.num && v !== '') { var n = _mcNum(v); v = (n === null) ? '' : String(n); }
            out[col.k] = v;
        });
        return out;
    };
    var _colLetter = function (i) { var s = ''; i += 1;
        while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

    function _mcBuildSheet() {
        if (!window.XLSX) return null;
        var rows = _mcRows().filter(function (r) { return !_mcIsCalcRow(r); });
        var sp = (_td().mcSalesPriceDetail || {})[_mcRev()] || {};   // 영업판가는 **열마다 따로**다(js/22g)
        var ws = {}, R = 0;
        var put = function (r, c, cell) { ws[_colLetter(c) + (r + 1)] = cell; };

        _MC_COLS.forEach(function (col, c) { put(R, c, { t: 's', v: col.h }); });
        R++;

        // 계산 행 스타일 — 굵게. `font`만 지정하면 공용 스타일러(js/04k)의 제브라·테두리는
        // 그대로 얹히고 글꼴만 이쪽이 이긴다(`Object.assign(base, cell.s)`).
        var BOLD = { font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '1F2937' } } };
        // SUBTOTAL은 머리글과 같은 색으로 깔아 **구간이 끊기는 자리를 눈에 보이게** 한다(견본과 동일).
        var SUBTOTAL_S = {
            font: { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
            fill: { patternType: 'solid', fgColor: { rgb: window._cpXlsxRole('darkText') } }
        };
        var calcRow = function (label, makeFormula, extra) {
            extra = extra || {};
            _MC_COLS.forEach(function (col, c) {
                var cell;
                if (c === 1) cell = { t: 's', v: label };
                else if (col.num) {
                    var f = makeFormula ? makeFormula(c) : null;
                    cell = f ? { t: 'n', f: f, z: extra.z || _MC_MONEY_FMT } : { t: 's', v: '' };
                } else cell = { t: 's', v: '' };
                cell.s = extra.s || BOLD;
                put(R, c, cell);
            });
            R++;
        };

        // 데이터 행 — 숫자는 **숫자 타입으로** 넣어야 아래 SUM이 동작한다.
        // ⚠️⚠️ [2026-10-20 3차] 값이 없는 칸도 **빈 셀을 반드시 만든다.** 공용 스타일러는
        //   `if (!cell) continue`로 **없는 셀을 건너뛰므로**, 안 만들면 그 칸만 제브라도
        //   테두리도 빠져 표가 중간부터 끊긴 것처럼 보인다(사용자 첨부에서 G열부터 그랬다).
        // 📍 [2026-10-20 4차] SUBTOTAL은 **그 TYPE 마지막 행 바로 다음 줄**에 끼워 넣는다 —
        //   화면(js/22g)이 currentType이 바뀔 때 그 자리에 한 줄 추가하는 것과 같은 모양.
        //   맨 아래로 몰아 두면 엑셀에서 어느 구간의 합인지 짚어 보기 어렵다.
        var subtotalRows = [];
        var runFrom = -1, curType = null, no = 0;
        var flushSubtotal = function () {
            if (runFrom < 0) return;
            var from = runFrom, to = R - 1;
            subtotalRows.push(R);
            calcRow((curType || '') + ' SUBTOTAL', function (c) {
                var L = _colLetter(c); return 'SUM(' + L + (from + 1) + ':' + L + (to + 1) + ')';
            }, { s: SUBTOTAL_S });
            runFrom = -1;
        };
        rows.forEach(function (r) {
            var tp = String(r.type || '').trim();
            if (runFrom < 0) { curType = tp; runFrom = R; }
            else if (tp !== curType) { flushSubtotal(); curType = tp; runFrom = R; }
            no++;
            _MC_COLS.forEach(function (col, c) {
                if (!col.k) { put(R, c, { t: 'n', v: no }); return; }
                var v = r[col.k];
                if (col.num) {
                    var n = _mcNum(v);
                    put(R, c, n !== null ? { t: 'n', v: n, z: _MC_MONEY_FMT } : { t: 's', v: '' });
                } else {
                    put(R, c, { t: 's', v: (v == null ? '' : String(v)) });
                }
            });
            R++;
        });
        flushSubtotal();          // 마지막 TYPE의 SUBTOTAL — 빼먹으면 TOTAL에서 한 구간이 빠진다

        var totalRow = R;
        // 🧮 TOTAL은 **SUBTOTAL들을 더한다**(사용자 견본과 같은 방식: =G10+G14+G20+…).
        //    데이터 행 전체를 SUM해도 값은 같지만, 이렇게 두면 엑셀에서 어느 SUBTOTAL이
        //    합쳐졌는지 눈으로 따라갈 수 있고 SUBTOTAL을 고치면 TOTAL도 바로 따라온다.
        //    ⚠️ 데이터 행 범위와 SUBTOTAL을 **같이** 더하면 두 번 세므로 절대 섞지 말 것.
        if (rows.length && subtotalRows.length) calcRow('TOTAL(M.C)', function (c) {
            var L = _colLetter(c);
            return subtotalRows.map(function (r) { return L + (r + 1); }).join('+');
        });
        // 영업판가는 계산이 아니라 **입력값**이다 — 수식이 아니라 숫자로 넣어 엑셀에서 고칠 수 있게.
        var salesRow = R;
        _MC_COLS.forEach(function (col, c) {
            var cell;
            if (c === 1) cell = { t: 's', v: '영업판가' };
            else if (col.num) {
                var n = _mcNum(sp[col.k]);
                cell = (n !== null) ? { t: 'n', v: n, z: _MC_MONEY_FMT } : { t: 's', v: '' };
            } else cell = { t: 's', v: '' };
            cell.s = BOLD;
            put(R, c, cell);
        });
        R++;
        // 재료비율 = TOTAL ÷ 영업판가. **×100을 하지 않는다** — 표시형식 `0%`가 100배해서
        // 보여주므로, 곱하면 3400% 처럼 100배로 나온다(사용자 견본도 나누기만 한다).
        if (rows.length && subtotalRows.length) {
            calcRow('재료비율 (M.C ÷ 영업판가)', function (c) {
                var L = _colLetter(c);
                return 'IF(' + L + (salesRow + 1) + '=0,"",' + L + (totalRow + 1) + '/' + L + (salesRow + 1) + ')';
            }, { z: '0%' });
        }
        ws['!ref'] = 'A1:' + _colLetter(_MC_COLS.length - 1) + R;
        // 🔢 열 너비는 **직접 지정한다.** 공용 스타일러의 자동 계산은 셀의 원값(1234.5)만 보므로
        //    회계 서식으로 늘어난 표시폭("$ 1,234.50")을 모르고, 금액 칸이 `####`로 나온다.
        ws['!cols'] = [
            { wch: 7 }, { wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 36 },
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 60 }
        ];
        return ws;
    }

    // ── 🗓 Gantt 전용 헬퍼 ─────────────────────────────────────────────
    // 간트 행은 **배열**이고, 어느 칸이 무엇인지는 `colIdx`(이름 → 인덱스)가 안다.
    // 그래서 엑셀 열 머리글로 colIdx의 이름을 그대로 쓴다 — 화면 열 순서가 바뀌어도 안전하다.
    var _ganttKeys = function () {
        var ci = window.colIdx || {};
        return Object.keys(ci).filter(function (k) { return ci[k] >= 0; });
    };
    var _ganttRows = function () {
        var ci = window.colIdx || {}, keys = _ganttKeys();
        return (window.globalData || []).map(function (row) {
            var o = {};
            keys.forEach(function (k) { o[k] = (row && row[ci[k]] != null) ? row[ci[k]] : ''; });
            return o;
        });
    };
    var _ganttSet = function (rows) {
        var ci = window.colIdx || {}, keys = _ganttKeys();
        // ⚠️⚠️ 간트는 이 앱의 **원본 데이터**다. 엑셀 ↩되돌리기와 별개로, 앱의 Undo(Ctrl+Z)에도
        //    스냅샷을 남겨 둔다 — 되돌릴 길을 둘 다 열어 두는 게 맞다(js/04e).
        if (window.pushUndoSnapshot) { try { window.pushUndoSnapshot(); } catch (e) { /* 스냅샷 실패가 불러오기를 막진 않는다 */ } }
        var old = window.globalData || [];
        var width = old.reduce(function (m, r) { return Math.max(m, (r && r.length) || 0); }, 0);
        keys.forEach(function (k) { width = Math.max(width, ci[k] + 1); });
        window.globalData = (rows || []).map(function (o, i) {
            // ⚠️ 기존 행이 있으면 그 배열을 바탕으로 덮어쓴다 — colIdx에 이름이 없는 칸(차트 내부
            //    값 등)을 날리지 않기 위해서다. 새로 늘어난 행만 빈 배열에서 시작한다.
            var base = (old[i] && old[i].slice) ? old[i].slice() : [];
            while (base.length < width) base.push('');
            keys.forEach(function (k) { if (o[k] !== undefined) base[ci[k]] = o[k]; });
            return base;
        });
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
            blocks: [{ sheet: 'M.C Table',
                get: function () { return _mcRows(); },
                // 🧮 [2026-10-20] SUBTOTAL·TOTAL(M.C)·영업판가·재료비율이 빠진다는 지적.
                //    이 네 줄은 저장 데이터에 **없다** — 화면 렌더러가 매번 계산해 그리는 행이고
                //    `_readRowsFromTbody`가 `mc-summary-row`를 일부러 걸러낸다(js/22a).
                //    그래서 여기서 직접 만들어 붙이되, **값이 아니라 엑셀 수식**으로 넣는다.
                //    그래야 엑셀에서 숫자를 고치면 합계가 따라 바뀐다(사용자 요청).
                //    PROTO A/B·MP 열도 같이 낸다 — 화면에서 숨겨져 있어도 데이터엔 있다.
                buildSheet: _mcBuildSheet,
                set: function (rows) {
                    var rev = _td().mcActiveRevision || 'R1';
                    _td().mcRevisions = _td().mcRevisions || {};
                    // 계산 행은 되돌려 넣지 않는다 — 화면이 다시 계산하므로 넣으면 중복된다.
                    _td().mcRevisions[rev] = (rows || [])
                        .filter(function (r) { return !_mcIsCalcRow(r); })
                        .map(_mcRowFromSheet);
                    if (rev === 'R1') _td().mcTable = _td().mcRevisions[rev];   // 저장 호환용 별칭
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
            // 🗓 Gantt chart — 이 페이지엔 인쇄 버튼이 **없어서** 탭으로 자리를 못 찾는다.
            //    대신 기존 '프로젝트 엑셀 저장' 버튼 앞에 붙인다(anchorSelector).
            //    ⚠️ 그 버튼은 프로젝트 전체 워크북을 만드는 **다른 기능**이다 — 여기 📊는
            //       이 왕복 형식(열 머리글 = colIdx 이름)으로 내므로 📥로 그대로 되돌아온다.
            id: 'gantt', label: 'Gantt chart',
            anchorSelector: 'button[onclick*="exportToExcel"]',
            repaint: ['recalculateSchedules'],
            blocks: [{ sheet: 'Gantt', kind: 'rows', get: _ganttRows, set: _ganttSet }]
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
            var ws;
            if (typeof b.buildSheet === 'function') {
                // 🧮 수식이 들어가는 시트는 블록이 직접 만든다(M.C Table의 SUBTOTAL/TOTAL 등).
                //    aoa_to_sheet은 값만 넣을 수 있어서, 수식 셀을 쓰려면 시트를 손으로 조립해야 한다.
                ws = b.buildSheet();
                if (!ws) { empty++; return; }
            } else {
                var aoa = (b.kind === 'kv') ? kvToAoa(b.get(), b.labels) : rowsToAoa(b.get());
                if (aoa.length <= 1) empty++;
                ws = window.XLSX.utils.aoa_to_sheet(aoa);
            }
            window.XLSX.utils.book_append_sheet(wb, ws, b.sheet.slice(0, 31));
        });
        // 🎨 [2026-10-20] BOM 출력과 **같은 모양**으로 — 머리글/제브라/테두리/열너비.
        //    앱 전체가 쓰는 공용 스타일러를 그대로 부른다(js/04k). 색은 거기서
        //    `_cpXlsxRole`로 **현재 테마 팔레트**에서 가져오므로, 팔레트를 바꾸면 엑셀도 따라간다.
        //    ⚠️ 여기서 색을 따로 칠하지 말 것 — 그러면 팔레트와 엇나가고 손으로 맞춰야 한다.
        //    전역 스코프 공유 구조라 IIFE 안에서도 그냥 보인다(js/38도 같은 방식).
        if (typeof applyExcelStyles === 'function') {
            try { applyExcelStyles(wb); } catch (e) { /* 스타일 실패가 저장을 막지는 않는다 */ }
        }
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
                // ⚠️ 파일의 행 수가 아니라 **실제로 저장된 행 수**를 말한다 — M.C Table처럼 계산
                //    행을 걸러내는 블록이 있어서, 파일 행수를 그대로 말하면 사실과 달라진다.
                var after = (m.b.get() || []).length;
                summary.push(m.b.sheet + ' ' + before + '→' + after + _t('행', '')
                             + (rows.length !== after ? _t(' (계산 행 ' + (rows.length - after) + '개 제외)',
                                                           ' (' + (rows.length - after) + ' calculated rows skipped)') : ''));
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
    //   [2026-10-20 2차] 아이콘만 두니 무슨 버튼인지 알 수 없다는 지적 — 한글 라벨을 넣었다.
    //   자리가 좁으므로 글자 11px, 여백 최소. 자세한 설명은 말풍선(title)에 남긴다.
    //   ⚠️ '엑셀 입력'과 '엑셀 저장' **사이에 경계선**을 둔다 — 입력은 현재 내용을 통째로
    //      덮어쓰므로, 저장하려다 잘못 누르는 일이 없게 시각적으로 갈라 놓는다.
    //   용어는 앱 전체와 통일: 내보내기 = '엑셀 저장'(다른 페이지 버튼 6개도 같이 바꿨다).
    //   [2026-10-20 3차] 글자 크기를 **주변 버튼과 똑같이** 맞춘다 — 인쇄(PDF) 등 이 줄의
    //   다른 버튼이 전부 13px/padding 6px 8px이라, 혼자 11px이면 눈에 따로 논다.
    var BTN = 'white-space:nowrap; padding:6px 8px; background:#e0f5f7; color:#00707d; border:none;'
            + ' border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; line-height:1.2;'
            + ' transition:background .15s;';
    var SEP = '<span style="display:inline-block; width:1px; height:13px; background:#ccd9db; margin:0 4px;"></span>';

    function _pxRenderButtons() {
        (window.PAGE_EXCEL_SPECS || []).forEach(function (spec) {
            // 자리를 찾는다 — 기본은 그 탭의 인쇄 버튼, 인쇄 버튼이 없는 페이지는 anchorSelector.
            var printBtn = null;
            if (spec.anchorSelector) {
                printBtn = document.querySelector(spec.anchorSelector);
            } else {
                var all = document.querySelectorAll('button[onclick*="printTabSection"]');
                for (var i = 0; i < all.length; i++) {
                    if ((all[i].getAttribute('onclick') || '').indexOf("'" + spec.tab + "'") !== -1) { printBtn = all[i]; break; }
                }
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
                (spec.exportOnly ? '' :
                    '<button onclick="window.pageExcelImportPick(\'' + spec.id + '\')" title="'
                  + _esc(_t('엑셀에서 수정한 내용을 다시 불러옵니다 — 현재 내용은 통째로 교체되며, 바로 되돌릴 수 있습니다',
                            'Import an edited Excel file — replaces current content; you can undo right after'))
                  + '" onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                  + ' style="' + BTN + '">📥 ' + _t('엑셀 입력', 'Import') + '</button>' + SEP)
                + '<button onclick="window.pageExcelExport(\'' + spec.id + '\')" title="'
                  + _esc(_t(spec.label + ' 내용을 엑셀 파일로 저장합니다', 'Save ' + spec.label + ' as an Excel file'))
                  + '" onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                  + ' style="' + BTN + ' margin-right:4px;">📊 ' + _t('엑셀 저장', 'Export') + '</button>'
                + (hasUndo ?
                    '<button onclick="window.pageExcelUndo(\'' + spec.id + '\')" title="'
                  + _esc(_t('방금 불러오기 전으로 되돌립니다', 'Undo the import'))
                  + '" onmouseover="this.style.background=\'#f5c2bd\';" onmouseout="this.style.background=\'#fbe4e2\';"'
                  + ' style="' + BTN + ' margin-right:4px; background:#fbe4e2; color:#b1432f;">↩ '
                  + _t('되돌리기', 'Undo') + '</button>' : '');
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
