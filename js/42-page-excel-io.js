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

    // ── 🌐 엑셀 **안**의 이름(시트명·머리글·라벨)도 영문 대응 ────────────
    //   버튼·토스트만 `_t`로 감싸고 파일 내용은 한글로 두면, 영문 모드 사용자가 받는 파일은
    //   그대로 한글이다. 그래서 이름은 `['한글','English']` 쌍으로 적고:
    //     • 내보낼 땐 `_nm()`  — 지금 언어 하나
    //     • 불러올 땐 `_nms()` — **두 언어 다 받는다**
    //   한쪽만 받으면 한글 모드에서 뽑은 파일을 영문 모드에서 못 읽는다(그 반대도).
    var _nm  = function (n) { return Array.isArray(n) ? _t(n[0], n[1]) : n; };
    var _nms = function (n) { return Array.isArray(n) ? n.slice() : [n]; };
    // 행 객체에서 이름(쌍 가능)으로 값 꺼내기 — 어느 언어로 저장된 파일이든 찾는다.
    var _pick = function (r, n) {
        var names = _nms(n);
        for (var i = 0; i < names.length; i++) if (r && r[names[i]] !== undefined) return r[names[i]];
        return undefined;
    };

    // 🔽 머리글 줄에 **자동 필터**를 건다(사용자 요청 2026-10-20) — 엑셀에서 열자마자
    //   TYPE·상태 같은 열로 걸러 볼 수 있다. 키/값 블록(개요처럼 두 칸짜리)은 걸 이유가 없고,
    //   데이터가 한 줄도 없으면 필터 버튼만 떠서 거추장스러우니 둘 다 건너뛴다.
    //   블록에 `filter: false`를 적으면 그 시트만 뺄 수 있다.
    var _setAutoFilter = function (ws, b) {
        if (!ws || !ws['!ref'] || !window.XLSX) return;
        if (b && (b.filter === false || b.kind === 'kv')) return;
        var rg = window.XLSX.utils.decode_range(ws['!ref']);
        if (rg.e.r <= rg.s.r) return;
        ws['!autofilter'] = { ref: window.XLSX.utils.encode_range(rg) };
    };

    // ↩ 자동 줄바꿈 끄기. 공용 스타일러(js/04k)는 값에 줄바꿈이 있으면 `wrapText`를 켜는데,
    //   그러면 긴 상세내용 한 칸 때문에 행 높이가 늘어나 표가 들쭉날쭉해진다(사용자 요청 2026-10-20).
    //   ⚠️ 스타일러를 고치지 않고 **여기서만** 끈다 — 그 함수는 BOM·프로젝트 출력도 같이 쓴다.
    var _noWrap = function (wb) {
        if (!wb || !window.XLSX) return;
        (wb.SheetNames || []).forEach(function (name) {
            var ws = wb.Sheets[name];
            if (!ws || !ws['!ref']) return;
            var rg = window.XLSX.utils.decode_range(ws['!ref']);
            for (var r = rg.s.r; r <= rg.e.r; r++) for (var c = rg.s.c; c <= rg.e.c; c++) {
                var cell = ws[window.XLSX.utils.encode_cell({ r: r, c: c })];
                if (!cell || !cell.s) continue;
                cell.s.alignment = Object.assign({}, cell.s.alignment || {}, { wrapText: false });
            }
        });
    };

    // 블록의 `center: ['키', …]`에 적힌 열을 가운데 정렬한다 — 어느 페이지든 쓸 수 있게 공용으로.
    // 머리글 **이름**으로 찾으므로 열 순서가 바뀌어도 따라간다.
    // ⚠️ 공용 스타일러(js/04k)는 `Object.assign(base, cell.s)`라 여기 alignment가 통째로 이긴다 —
    //    `vertical:'center'`를 같이 넣지 않으면 그 칸만 세로 정렬이 풀린다.
    var _centerCols = function (ws, aoa, center) {
        if (!center || !center.length || !aoa || !aoa.length || !window.XLSX) return;
        var hdr = aoa[0] || [];
        var cols = [];
        center.forEach(function (name) {
            _nms(name).forEach(function (n) { var i = hdr.indexOf(n); if (i >= 0 && cols.indexOf(i) === -1) cols.push(i); });
        });
        for (var r = 0; r < aoa.length; r++) cols.forEach(function (c) {
            var cell = ws[window.XLSX.utils.encode_cell({ r: r, c: c })];
            if (cell) cell.s = Object.assign({}, cell.s || {}, { alignment: { horizontal: 'center', vertical: 'center' } });
        });
    };

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
        Object.keys(labels).forEach(function (k) { aoa.push([_nm(labels[k]), (obj && obj[k] != null) ? obj[k] : '']); });
        return aoa;
    };
    var aoaToKv = function (aoa, labels) {
        var byLabel = {};
        // 라벨 → 키. 한/영 **둘 다** 등록해 어느 언어로 저장된 파일이든 읽는다.
        Object.keys(labels).forEach(function (k) {
            _nms(labels[k]).forEach(function (name) { byLabel[name] = k; });
        });
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
    var _MC_SALES = ['영업판가', 'Sales Price'];
    var _MC_RATIO = ['재료비율 (M.C ÷ 영업판가) [%]', 'M.C Ratio (M.C ÷ Sales Price) [%]'];
    // ⚠️ 걸러낼 라벨엔 **두 언어를 다 넣는다** — 한글 모드에서 뽑은 파일을 영문 모드에서
    //    불러오면(그 반대도) 계산 행이 데이터 행으로 섞여 들어온다.
    //    판정은 **짧은 머리말**로 한다(괄호 안 설명까지 똑같이 맞추라고 요구하지 않게).
    var _MC_CALC_LABELS = ['SUBTOTAL', 'TOTAL(M.C)', '영업판가', 'SALES PRICE', '재료비율', 'M.C RATIO'];
    // 계산 행 라벨이 들어가는 열 — 견본은 **Specification**에 적는다. 위치를 숫자로 박지 않고
    // `_MC_COLS`에서 찾는다(열을 끼워 넣어도 따라간다).
    var _MC_LABEL_C = (function () {
        for (var i = 0; i < _MC_COLS.length; i++) if (_MC_COLS[i].h === 'Specification') return i;
        return 1;
    })();
    // 💵 금액 칸 표시형식 — 사용자가 쓰는 M.C Table 견본의 회계 서식 그대로다(달러 기호 왼쪽 정렬,
    //    0은 "-"로). 역슬래시가 들어 있으니 **heredoc으로 쓰지 말 것**(조용히 깨진다).
    var _MC_MONEY_FMT = '_-[$$-409]* #,##0.00_ ;_-[$$-409]* \\-#,##0.00\\ ;_-[$$-409]* "-"??_ ;_-@_ ';
    var _mcRev  = function () { return _td().mcActiveRevision || 'R1'; };
    var _mcRows = function () { return ((_td().mcRevisions || {})[_mcRev()]) || _td().mcTable || []; };
    // 엑셀에서 돌아온 행이 계산 행인지 — 라벨로 가린다(그 행은 화면이 다시 만든다).
    // ⚠️ 라벨은 **Specification 열**에 있다(견본과 같은 자리). 예전 출력은 TYPE 열에 적었으므로
    //    둘 다 본다 — 한쪽만 보면 옛 파일이나 새 파일 중 하나에서 계산 행이 데이터로 섞여 들어온다.
    // 그리고 **NO가 비어 있을 때만** 계산 행으로 본다 — 사람이 적은 Specification에
    // 'TOTAL' 같은 말이 들어가도 그 행을 지우지 않기 위해서다.
    var _mcIsCalcRow = function (r) {
        if (!r || typeof r !== 'object') return false;
        var pick = function (h, k) { var v = (r[h] !== undefined) ? r[h] : r[k]; return String(v == null ? '' : v).toUpperCase(); };
        var label = pick('Specification', 'spec') + ' ' + pick('TYPE', 'type');
        if (!_MC_CALC_LABELS.some(function (L) { return label.indexOf(L.toUpperCase()) >= 0; })) return false;
        var no = (r.NO !== undefined) ? r.NO : r.no;
        return (no === undefined) || String(no == null ? '' : no).trim() === '';
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
                if (c === _MC_LABEL_C) cell = { t: 's', v: label };
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
        var subtotalRows = [], blocks = [];
        var runFrom = -1, curType = null, no = 0;
        var flushSubtotal = function () {
            if (runFrom < 0) return;
            var from = runFrom, to = R - 1;
            subtotalRows.push(R);
            calcRow((curType || '') + ' SUBTOTAL', function (c) {
                var L = _colLetter(c); return 'SUM(' + L + (from + 1) + ':' + L + (to + 1) + ')';
            }, { s: SUBTOTAL_S });
            blocks.push({ from: from, to: R - 1 });   // TYPE 첫 행 ~ SUBTOTAL 행 = 굵은 박스 한 칸
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
            if (c === _MC_LABEL_C) cell = { t: 's', v: _nm(_MC_SALES) };
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
            calcRow(_nm(_MC_RATIO), function (c) {
                var L = _colLetter(c);
                return 'IF(' + L + (salesRow + 1) + '=0,"",' + L + (totalRow + 1) + '/' + L + (salesRow + 1) + ')';
            }, { z: '0%' });
        }
        ws['!ref'] = 'A1:' + _colLetter(_MC_COLS.length - 1) + R;

        // 🖼 굵은 박스 — 머리글, TYPE 구간(첫 행 ~ SUBTOTAL), 맨 아래 합계 묶음을 각각 테두리로 가둔다.
        //    공용 스타일러(js/04k)는 `cell.s`의 border가 있으면 그걸 그대로 쓰므로 여기서 완성해 둔다.
        //    ⚠️ `cell.s`는 BOLD/SUBTOTAL_S처럼 **여러 셀이 공유하는 객체**다 — 반드시 복사해서 넣을 것.
        //       직접 `cell.s.border = …` 하면 그 스타일을 쓰는 행이 전부 같이 바뀐다.
        var THIN = { style: 'thin', color: { rgb: window._cpXlsxRole('border') } };
        var MED  = { style: 'medium', color: { rgb: window._cpXlsxRole('darkText') } };
        var lastC = _MC_COLS.length - 1;
        var frame = function (r0, r1) {
            if (r1 < r0) return;
            for (var r = r0; r <= r1; r++) for (var c = 0; c <= lastC; c++) {
                var cell = ws[_colLetter(c) + (r + 1)];
                if (!cell) continue;
                cell.s = Object.assign({}, cell.s || {}, { border: {
                    top:    (r === r0)    ? MED : THIN,
                    bottom: (r === r1)    ? MED : THIN,
                    left:   (c === 0)     ? MED : THIN,
                    right:  (c === lastC) ? MED : THIN
                } });
            }
        };
        frame(0, 0);                                            // 머리글
        blocks.forEach(function (b) { frame(b.from, b.to); });  // TYPE ~ SUBTOTAL
        frame(totalRow, R - 1);                                 // TOTAL(M.C) ~ 재료비율
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
    // 🌳 레벨 표시 — 트리 모양. 0레벨은 맨 위라 아무것도 붙이지 않고, 그 아래는 레벨마다
    //    한 칸씩 들어가며 **그 레벨의 마지막 형제만** `└`, 나머지는 `│`를 쓴다.
    //      PROTO A
    //      │  P.O(PURCHASE ORDER)
    //      │  DESIGN
    //      │  │  ELECTRICAL*
    //      │  └  APPROVAL          ← DESIGN의 마지막 자식
    //      │  PROCUREMENT
    //      │  └  TOUCH & GLASS*
    //      └  EX-WORK(ETD)         ← 0레벨의 마지막 자식
    // ⚠️ 두 기호의 **폭이 같아야** 줄이 맞는다(둘 다 U+25xx, 같은 폭). 조상 칸을 공백으로
    //    비우면 글꼴에 따라 폭이 달라져 어긋나므로, 조상은 끝까지 `│`로 채운다.
    var _GANTT_TREE_STEM = '│  ';   // 조상 칸 / 마지막이 아닌 형제
    var _GANTT_TREE_LEAF = '└  ';   // 그 레벨의 마지막 형제
    var _GANTT_WBS_KEY = 'wbs';
    var _GANTT_LEVEL_KEY = 'bogo';      // LEVEL(WBS) — WBS 바로 왼쪽에 둔다
    // 그 행 **자신의** 업무명.
    // ⚠️ `row[ci.wbs]`를 그냥 쓰면 안 된다 — `recalculateSchedules`가 단일 WBS 열 모드에서 그 칸을
    //    "가장 가까운 0레벨 조상 이름"으로 매번 덮어쓰기 때문에(js/04d:394, 개발단계 필터용), 하위
    //    행이 전부 그룹명으로 나온다. 사용자가 보낸 출력물이 실제로 그랬다 — 레벨1 일곱 줄이 전부
    //    'RFQ(KICK OFF)'. 행 자신의 텍스트는 `_orig*`에 살아 있으므로 js/22c와 같은 우선순위로 읽는다.
    var _ganttTaskName = function (row) {
        var ci = window.colIdx || {}, lv = row && row._level;
        var orig = (lv === 0) ? row._origDev : (lv === 1) ? row._origT1
                 : (lv === 2) ? row._origT2 : (lv === 3) ? row._origT3 : row._origT4;
        var c = (lv === 0) ? ci.devStage : (lv === 1) ? ci.taskType1
              : (lv === 2) ? ci.taskType2 : (lv === 3) ? ci.taskType3 : ci.taskType4;
        if ((c === undefined || c === -1) && ci.wbs !== undefined && ci.wbs !== -1) c = ci.wbs;
        var name = (orig || '') || ((c !== undefined && c > -1 && row[c] != null) ? row[c] : '') || '';
        return String(name).trim().replace(/^🌐\s*/, '');
    };
    var _ganttLevel = function (row) { var lv = parseInt(row && row._level, 10); return (lv >= 0) ? lv : 0; };
    // 어느 행에 `└`를 붙일지. 두 경우다(사용자 확인 2026-10-20):
    //   ① 그 레벨의 **마지막 형제** — APPROVAL, TOUCH & GLASS
    //   ② **바로 위 줄이 더 깊은 레벨**인 행 — PROCUREMENT, EX-WORK
    //      (하위 묶음이 끝나고 돌아온 자리라, 거기서 한 단락이 닫히는 게 눈에 보여야 한다)
    // ①은 뒤에서부터 한 번만 훑어 판정한다 — 더 얕은 레벨을 지나면 그보다 깊은 레벨의
    // "이미 봤음" 표시는 거기서 끊기므로 지운다.
    var _ganttLastFlags = function (levels) {
        var last = new Array(levels.length), seen = [];
        for (var i = levels.length - 1; i >= 0; i--) {
            var lv = levels[i];
            last[i] = !seen[lv];
            seen[lv] = true;
            for (var d = lv + 1; d < seen.length; d++) seen[d] = false;
        }
        for (var j = 1; j < levels.length; j++) if (levels[j - 1] > levels[j]) last[j] = true;   // ②
        return last;
    };
    var _ganttWbsCell = function (row, isLast) {
        var name = _ganttTaskName(row);
        if (!name) return '';
        var lv = _ganttLevel(row);
        if (lv === 0) return name;
        return new Array(lv).join(_GANTT_TREE_STEM) + (isLast ? _GANTT_TREE_LEAF : _GANTT_TREE_STEM) + name;
    };
    var _ganttKeys = function () {
        var ci = window.colIdx || {};
        var moved = [_GANTT_LEVEL_KEY, _GANTT_WBS_KEY];
        var keys = Object.keys(ci).filter(function (k) { return ci[k] >= 0 && moved.indexOf(k) === -1; });
        // 📍 업무명(WBS)은 **상태와 상세내용 사이**, LEVEL(WBS)은 **그 바로 왼쪽**에 둔다
        //    (사용자 요청 2026-10-20). colIdx에 wbs가 없는(레벨별 열로 나뉜) 프로젝트에서도 이 열은
        //    항상 만든다 — 업무명이 없는 출력물은 읽을 수가 없기 때문.
        var at = keys.indexOf('status');
        keys.splice(at >= 0 ? at + 1 : keys.length, 0, _GANTT_LEVEL_KEY, _GANTT_WBS_KEY);
        return keys;
    };
    var _ganttRows = function () {
        var ci = window.colIdx || {}, keys = _ganttKeys();
        var data = window.globalData || [];
        var isLast = _ganttLastFlags(data.map(_ganttLevel));
        return data.map(function (row, i) {
            var o = {};
            keys.forEach(function (k) {
                if (k === _GANTT_WBS_KEY) { o[k] = _ganttWbsCell(row, isLast[i]); return; }
                // 레벨은 `_level`이 항상 정확하다 — bogo 칸은 재계산이 거기서 **베껴 넣는** 값이고,
                // 레벨별 열 모드 프로젝트엔 bogo 칸 자체가 없다.
                if (k === _GANTT_LEVEL_KEY && row && row._level != null) { o[k] = row._level; return; }
                o[k] = (row && row[ci[k]] != null) ? row[ci[k]] : '';
            });
            return o;
        });
    };
    var _ganttSet = function (rows) {
        var ci = window.colIdx || {};
        // ⚠️ 업무명 열은 **읽기 전용**이다 — 레벨 기호·들여쓰기가 붙은 표시용 값이고, 원본은
        //    레벨별 열(개발단계/1~4차 업무)에 있다. 되돌려 넣으면 그 칸이 장식된 문자열로 오염되고
        //    `recalculateSchedules`가 어차피 다시 덮어쓴다. 이름을 고치려면 레벨별 열을 고칠 것.
        var keys = _ganttKeys().filter(function (k) { return k !== _GANTT_WBS_KEY && ci[k] >= 0; });
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
    // Summary 시트가 **끼워 넣는** 열 이름(원래 데이터엔 없는 구분 열)
    var _SUM_STAGE = ['단계', 'Stage'];
    var _SUM_MODEL = ['모델', 'Model'];

    window.PAGE_EXCEL_SPECS = window.PAGE_EXCEL_SPECS || [
        {
            id: 'summary', tab: 'tab-summary', label: 'Summary',
            repaint: ['populateTabData', 'renderProjectModels', 'renderMaterialModelsContainer', 'renderSummaryTimeline'],
            blocks: [
                {
                    sheet: ['개요', 'Overview'], kind: 'kv',
                    labels: {
                        purpose:    ['개발 목적',      'Purpose'],
                        volume:     ['예상 물량',      'Est. Volume'],
                        mpDate:     ['MP 일정',        'MP Date'],
                        background: ['배경',           'Background'],
                        devDays:    ['개발기간(일)',   'Dev Days']
                    },
                    get: function () { return (_td().summary || {}); },
                    set: function (obj) { _td().summary = Object.assign({}, _td().summary || {}, obj); }
                },
                {
                    sheet: ['마일스톤', 'Milestones'], kind: 'rows',
                    get: function () {
                        var ms = (_td().summary || {}).milestones || {}, STAGE = _nm(_SUM_STAGE);
                        return Object.keys(ms).map(function (stage) {
                            var o = {}; o[STAGE] = stage;
                            return Object.assign(o, ms[stage] || {});
                        });
                    },
                    set: function (rows) {
                        var ms = {}, names = _nms(_SUM_STAGE);
                        (rows || []).forEach(function (r) {
                            var stage = String(_pick(r, _SUM_STAGE) || '').trim(); if (!stage) return;
                            var o = {}; Object.keys(r).forEach(function (k) { if (names.indexOf(k) === -1) o[k] = r[k]; });
                            ms[stage] = o;
                        });
                        _td().summary = _td().summary || {}; _td().summary.milestones = ms;
                    }
                },
                {
                    sheet: ['주요자재', 'Key Materials'], kind: 'rows',
                    // 모델별로 나뉜 표를 한 시트에 담되, 어느 모델 것인지 '모델' 열로 구분한다.
                    get: function () {
                        var out = [], MODEL = _nm(_SUM_MODEL);
                        ((_td().projectModels) || []).forEach(function (m, i) {
                            (m.materials || []).forEach(function (r) {
                                var o = {}; o[MODEL] = '#' + (i + 1);
                                out.push(Object.assign(o, r));
                            });
                        });
                        return out;
                    },
                    set: function (rows) {
                        var models = _td().projectModels || [];
                        var buckets = {}, names = _nms(_SUM_MODEL);
                        (rows || []).forEach(function (r) {
                            var mi = parseInt(String(_pick(r, _SUM_MODEL) || '#1').replace(/[^0-9]/g, ''), 10) || 1;
                            var o = {}; Object.keys(r).forEach(function (k) { if (names.indexOf(k) === -1) o[k] = r[k]; });
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
                set: function (rows) { _td().briefSpec = rows || []; },
                // 🤖 비규격 파일(고객 사양서 PDF, 메일 txt 등) → 이 표로 매핑하는 규칙.
                //    프롬프트는 **데이터**다 — 더 잘 읽히게 고치고 싶으면 여기만 고친다.
                //    ⚠️ 프롬프트 문자열 안에 백틱(`)을 넣지 말 것(docs/ai-qa.md) — 파일 전체가 죽는다.
                ai: {
                    // ⚠️⚠️ [2026-10-20 2차] 이 표는 **고정 서식**이다. TYPE/TYPE2 두 열은 회사가 쓰는
                    //    표준 항목 목록이라 AI가 건드리면 안 된다(사용자 지적: "도표 레퍼런스는
                    //    훼손하지 않고"). 1차 구현은 표를 통째로 갈아치워서 템플릿이 날아갔다.
                    //    그래서 mode를 'fill'로 둔다 — AI는 **값 칸만** 채우고, 못 찾은 항목은 빈칸으로
                    //    남긴다. 문서에서 새로 찾은 항목만 행으로 추가한다.
                    mode: 'fill',
                    valueCols: ['modelA'],   // 🧩 [2026-10-21] 값 열은 지금 제품구분자 하나뿐(js/43)
                    // 📌 Power estimation 묶음은 **항상 맨 아래**다(사용자 요청) — 새 행은 그 위에 끼운다.
                    tailFrom: function (rows) {
                        for (var i = 0; i < rows.length; i++) {
                            if (/power\s*estimation/i.test(String(rows[i] && rows[i].type || ''))) return i;
                        }
                        return rows.length;
                    },
                    fields: ['type', 'sub', 'modelA', 'note'],
                    labels: { type: 'Type', sub: 'Description', modelA: 'Value', note: 'Note' },
                    prompt: function (text, fileName, tpl) {
                        return '너는 고객이 보낸 사양서/RFP를 읽고, **이미 있는 표의 빈칸만 채우는** 일을 한다.\n'
                             + '표의 항목 목록(TYPE/TYPE2)은 회사 표준 서식이라 **절대 바꾸지 않는다.**\n\n'
                             + '[지금 표의 항목 — 이 번호로 답한다]\n' + tpl + '\n\n'
                             + '[문서] "' + fileName + '" 에서 뽑은 글자(표의 줄/열 순서는 좌표로 복원해 둔 것이라 대체로 맞다)\n'
                             + text + '\n\n'
                             + '[할 일]\n'
                             + '1) 위 항목 하나하나에 대해 문서에서 해당하는 값을 찾아 적는다.\n'
                             + '   - 표현이 달라도 뜻이 같으면 맞춘다. 예) 문서 "Pixel Resolution" → 항목 "Native Resolution",\n'
                             + '     "Typical Luminance, White" → "Brightness(Centre. Min)", "Power Supply Voltage" → "Input voltage",\n'
                             + '     "Viewing Angle" → "Viewing Angle (typ.)".\n'
                             + '   - **문서에 없으면 그 번호는 아예 빼라.** 빈칸으로 두는 게 맞다. 지어내지 않는다.\n'
                             + '2) 문서에 있는데 위 목록 어디에도 들어갈 자리가 없는 사양만 **새 항목**으로 추가한다(no를 0으로).\n'
                             + '   - 목차/머리말/꼬리말/개정이력/법무·상거래 조항/용어집은 추가하지 않는다.\n'
                             + '   - 꼭 필요할 때만 넣는다. 위 목록으로 덮이는 내용은 1)로 처리한다.\n\n'
                             + '[답 형식] JSON 배열. 원소는 두 종류뿐이다.\n'
                             + '  기존 항목 채우기 : {"no": 4, "value": "1920(H) x 1080(V) or higher", "note": ""}\n'
                             + '  새 항목 추가     : {"no": 0, "type": "EDID Setting", "sub": "", "value": "DP : KGI0007", "note": ""}\n\n'
                             + '[주의]\n'
                             + '- value 에는 **원문 그대로** 옮긴다. 요약하면 사양이 바뀐다.\n'
                             + '- 단위와 조건문구("or higher", "min", "typ.")를 지우지 말 것.\n'
                             + '- 한 항목의 값이 여러 줄로 끊겨 있으면 공백으로 이어 붙인다.\n'
                             + '- 각주(*1 등)·단서는 note 에 넣는다.\n'
                             + '- no 는 위 목록에 **실제로 있는 번호**만 쓴다.';
                    }
                } }]
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
            id: 'notice', tab: 'tab-notice', label: ['공지', 'Notice'],
            visibleWhen: function () { return window._alarmView === 'notice'; },
            repaint: ['renderNoticeTab'],
            blocks: [{ sheet: ['공지', 'Notice'], kind: 'rows',
                get: function () { return window._noticeItems || []; },
                set: function (rows) {
                    window._noticeItems = rows || [];
                    // 공지는 tabData가 아니라 localStorage에 산다(js/22b) — 저장까지 해야 남는다.
                    try { localStorage.setItem('gantt_notice_items', JSON.stringify(window._noticeItems)); } catch (e) { /* 용량 초과 등은 아래 안내로 드러남 */ }
                } }]
        },
        {
            // 🗓 Gantt chart — 이 페이지엔 인쇄 버튼이 **없어서** 탭으로 자리를 못 찾는다.
            //    대신 **간트 툴바의 인쇄(PDF) 버튼**(`#print-btn`) 앞에 붙인다 — 다른 페이지와 같은 자리다.
            //    ⚠️ [2026-10-20 수정] 처음엔 `button[onclick*="exportToExcel"]`로 잡았는데, 그 선택자가
            //       **프로젝트 드롭다운 메뉴 안의 '프로젝트 엑셀 저장' 항목**을 먼저 집어서 버튼 두 개가
            //       메뉴 안에 들어가 버렸다(사용자 지적). 화면에 하나뿐인 id로 잡을 것.
            id: 'gantt', label: 'Gantt chart',
            anchorSelector: '#print-btn',
            repaint: ['recalculateSchedules'],
            // 숫자·날짜·짧은 상태 칸은 가운데 정렬(사용자 요청) — 업무명/상세내용은 들여쓰기와
            // 긴 문장이라 왼쪽 그대로 둔다.
            blocks: [{ sheet: 'Gantt', kind: 'rows', get: _ganttRows, set: _ganttSet,
                center: ['no', 'bogo', 'start', 'plan', 'period', 'status'] }]
        },
        {
            // ⚠️ 알람은 간트에서 **계산되는** 목록이다(collectAlarmItems) — 되돌려 넣을 곳이 없다.
            id: 'alarm', tab: 'tab-alarm', label: ['알람', 'Alarm'], exportOnly: true,
            visibleWhen: function () { return window._alarmView !== 'notice'; },
            blocks: [{ sheet: ['알람', 'Alarm'], kind: 'rows',
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
                _centerCols(ws, aoa, b.center);
            }
            _setAutoFilter(ws, b);
            window.XLSX.utils.book_append_sheet(wb, ws, _nm(b.sheet).slice(0, 31));
        });
        // 🎨 [2026-10-20] BOM 출력과 **같은 모양**으로 — 머리글/제브라/테두리/열너비.
        //    앱 전체가 쓰는 공용 스타일러를 그대로 부른다(js/04k). 색은 거기서
        //    `_cpXlsxRole`로 **현재 테마 팔레트**에서 가져오므로, 팔레트를 바꾸면 엑셀도 따라간다.
        //    ⚠️ 여기서 색을 따로 칠하지 말 것 — 그러면 팔레트와 엇나가고 손으로 맞춰야 한다.
        //    전역 스코프 공유 구조라 IIFE 안에서도 그냥 보인다(js/38도 같은 방식).
        if (typeof applyExcelStyles === 'function') {
            try { applyExcelStyles(wb); } catch (e) { /* 스타일 실패가 저장을 막지는 않는다 */ }
        }
        _noWrap(wb);   // ↩ 자동 줄바꿈 해제 — 반드시 스타일러 **뒤에**(거기서 켜지기 때문)
        var pm = window.projectMeta || {};
        var name = [(pm.프로젝트명 || pm.고객모델명 || 'project'), _nm(spec.label),
                    new Date().toISOString().slice(0, 10).replace(/-/g, '')].join('_') + '.xlsx';
        try { window.XLSX.writeFile(wb, name.replace(/[\\/:*?"<>|]/g, '_')); }
        catch (e) { _toast('⚠️ ' + _t('엑셀 저장 실패: ', 'Excel save failed: ') + (e && e.message ? e.message : e), 'error'); return; }
        _toast('📊 ' + _nm(spec.label) + ' ' + _t('엑셀을 내보냈습니다.', 'exported.')
               + (empty ? ' (' + _t('빈 시트 ', 'empty sheets: ') + empty + ')' : ''), 'success');
    };

    // ══ 🤖 비규격 파일 → AI 매핑 ═════════════════════════════════════
    //  규격 엑셀(우리가 낸 파일)은 **AI 없이** 그대로 붙인다 — 결정론 먼저(CLAUDE.md 원칙 4).
    //  AI는 "시트 이름이 안 맞거나 아예 엑셀이 아닐 때"만 부른다. 무료 키는 하루 한도가 있어서
    //  매번 때리면 금방 막힌다.
    var PX_ACCEPT = '.xlsx,.xls,.csv,.pdf,.txt,.html,.htm';
    var PX_OK_RE  = /\.(xlsx|xls|csv|pdf|txt|html?)$/i;
    var _pxIsWorkbook = function (f) { return /\.(xlsx|xls|csv)$/i.test(f && f.name || ''); };
    var _pxAiSpec = function (spec) {
        // AI 매핑은 블록이 하나뿐인 rows 페이지에만 연다 — 여러 블록이면 어느 시트로 보낼지
        // 사람이 정해줘야 해서 지금 단계에선 다루지 않는다.
        if (!spec || spec.blocks.length !== 1) return null;
        return spec.blocks[0].ai || null;
    };

    // 파일 → 글자. PDF는 앱이 이미 쓰는 추출기(js/22d)를 그대로 쓴다 — 줄/열 순서를 좌표로
    // 복원해 둔 함수라, 표가 든 문서에서 값이 뒤섞이지 않는다(구매오더에서 검증됨).
    var _pxExtractText = async function (file, wb) {
        var name = String(file.name || '');
        if (/\.pdf$/i.test(name)) {
            if (typeof window._pcExtractPdfText !== 'function') {
                throw new Error(_t('PDF 읽기 기능을 아직 불러오지 못했습니다.', 'The PDF reader has not loaded yet.'));
            }
            var t = await window._pcExtractPdfText(file);
            // 의미 있는 글자가 거의 없으면 스캔본이다 — 지금은 거기까진 안 간다(이미지 분석은 Gemini 전용).
            if ((t || '').replace(/[\s\u0000-\u001f]/g, '').length < 20) {
                throw new Error(_t('이 PDF에는 글자 레이어가 없습니다(스캔본). 원본 뷰어에서 [인쇄 → Microsoft Print to PDF]로 다시 저장한 뒤 넣어주세요.',
                                   'This PDF has no text layer (scanned). Re-save it via Print → Microsoft Print to PDF and try again.'));
            }
            return t;
        }
        if (/\.html?$/i.test(name)) {
            var html = await file.text();
            var d = document.createElement('div'); d.innerHTML = html;
            return d.innerText || d.textContent || '';
        }
        if (wb) {   // 엑셀인데 시트 이름이 안 맞는 경우 — 모든 시트를 글자로 펴서 넘긴다
            return (wb.SheetNames || []).map(function (n) {
                return '### ' + n + '\n' + window.XLSX.utils.sheet_to_csv(wb.Sheets[n]);
            }).join('\n\n');
        }
        return await file.text();   // .txt (붙여넣은 메일 본문 등)
    };

    // 응답에서 JSON 배열만 떼어낸다 — 모델이 ```json 울타리나 설명을 같이 붙이는 일이 흔하다.
    var _pxJsonRows = function (text) {
        var s = String(text || '').replace(/```json/gi, '```').split('```').join('\n');
        var a = s.indexOf('['), b = s.lastIndexOf(']');
        if (a < 0 || b <= a) return null;
        try { var v = JSON.parse(s.slice(a, b + 1)); return Array.isArray(v) ? v : null; } catch (e) { return null; }
    };

    var _pxAiImport = async function (id, file, wb) {
        var spec = _specById(id), ai = _pxAiSpec(spec);
        // ⚠️ 여기서 **확장자를 한 번 더 막는다.** 드롭 핸들러에서 거르긴 하지만 이 함수는
        //    파일 선택창에서도 불리고, accept 목록은 브라우저가 지키지 않는 경우가 있다.
        //    안 막으면 .png 같은 이진 파일을 file.text()로 읽어 **깨진 글자를 AI에 보낸다**
        //    (실측에서 실제로 그랬다 — 사용자 AI 할당량만 날린다).
        if (!PX_OK_RE.test(String(file && file.name || ''))) {
            _toast('⚠️ ' + _t('받을 수 있는 형식이 아닙니다 — 엑셀(.xlsx/.xls/.csv), PDF, TXT, HTML만 됩니다.',
                              'Unsupported file — only Excel (.xlsx/.xls/.csv), PDF, TXT and HTML are accepted.'), 'error');
            return;
        }
        if (!ai) {
            _toast('⚠️ ' + _t('이 페이지는 아직 비규격 파일을 읽지 못합니다 — 엑셀 저장으로 받은 파일만 넣어주세요.',
                              'This page cannot read free-form files yet — use a file produced by Export.'), 'error');
            return;
        }
        var key = window.getActiveAiKey && window.getActiveAiKey();
        if (!key) {
            _toast('🔑 ' + _t('AI 키가 없습니다 — [AI 도구 > AI 분석 설정]에서 먼저 등록해주세요.',
                              'No AI key — register one under [AI Tools > AI Analysis Settings].'), 'error');
            return;
        }

        var text;
        try { text = await _pxExtractText(file, wb); }
        catch (e) { _toast('⚠️ ' + (e && e.message ? e.message : e), 'error'); return; }
        if (!String(text || '').trim()) { _toast('⚠️ ' + _t('파일에서 읽을 글자가 없습니다.', 'No readable text in the file.'), 'error'); return; }

        // 너무 길면 앞부분만 — 사양서는 앞쪽에 표가 몰려 있고, 토큰도 한도가 있다.
        var LIMIT = 60000, cut = text.length > LIMIT;
        if (cut) text = text.slice(0, LIMIT);

        _toast('🤖 ' + _t('AI가 "', 'AI is reading "') + file.name + _t('"을(를) 읽고 있습니다…', '"…'), 'info');

        // 🧩 채우기 모드: 지금 표의 항목 목록을 번호와 함께 AI에게 보여 준다 — AI는 그 번호로 답한다.
        var cur = (spec.blocks[0].get() || []).map(function (r) { return r || {}; });
        var tpl = '';
        if (ai.mode === 'fill') {
            tpl = cur.map(function (r, i) {
                var a = String(r.type || '').trim(), b2 = String(r.sub || '').trim();
                return (i + 1) + '. ' + (a || '(빈칸)') + (b2 ? ' / ' + b2 : '');
            }).join('\n');
        }

        var prompt = ai.prompt(text, file.name, tpl)
            + (ai.mode === 'fill' ? '\n\n설명 없이 JSON 배열만 출력한다.'
               : '\n\n[출력 형식] 설명 없이 JSON 배열만 출력한다. 각 원소의 키는 정확히 다음만 쓴다: '
                 + ai.fields.join(', ') + '\n값이 없으면 빈 문자열("")로 둔다. 원문에 없는 값을 지어내지 않는다.');

        var res;
        try {
            res = await window._withTimeout(window.callAiBackend(key, prompt, { feature: '페이지 엑셀 입력 - 비규격 파일 매핑' }),
                                            120000, _t('⏱️ AI 응답이 120초 안에 오지 않았습니다.', '⏱️ No AI response within 120s.'));
        } catch (e) { res = { ok: false, error: e }; }
        if (!res || !res.ok) {
            var em = (res && res.error && res.error.message) ? res.error.message : String((res && res.error) || '');
            _toast('⚠️ ' + _t('AI 분석 실패: ', 'AI analysis failed: ') + em, 'error');
            if (window._issueLog) { try { window._issueLog('page-excel-ai', { id: id, file: file.name, err: em }); } catch (e2) { /* 기록 실패가 흐름을 막지 않게 */ } }
            return;
        }
        var raw = window._extractGanttQaAiText ? window._extractGanttQaAiText(res) : '';
        var rows = _pxJsonRows(raw);
        if (!rows || !rows.length) {
            _toast('⚠️ ' + _t('AI가 표를 찾지 못했습니다. 다른 파일로 시도해보세요.', 'AI found no table. Try another file.'), 'error');
            if (window._issueLog) { try { window._issueLog('page-excel-ai', { id: id, file: file.name, err: 'no-rows', head: raw.slice(0, 300) }); } catch (e3) { /* 〃 */ } }
            return;
        }
        if (ai.mode === 'fill') {
            // {no, value, note} / {no:0, type, sub, value, note} 만 받는다. 범위 밖 번호는 버린다.
            var fills = [], extras = [];
            rows.forEach(function (r) {
                var n = parseInt(r && r.no, 10);
                var v = (r && r.value != null) ? String(r.value).trim() : '';
                var nt = (r && r.note != null) ? String(r.note).trim() : '';
                if (n >= 1 && n <= cur.length) { if (v || nt) fills.push({ i: n - 1, value: v, note: nt }); }
                else if (n === 0) {
                    var ty = (r && r.type != null) ? String(r.type).trim() : '';
                    var sb = (r && r.sub != null) ? String(r.sub).trim() : '';
                    if (ty || sb || v) extras.push({ type: ty, sub: sb, value: v, note: nt });
                }
            });
            if (!fills.length && !extras.length) {
                _toast('⚠️ ' + _t('문서에서 이 표에 넣을 값을 찾지 못했습니다.', 'Nothing in the document matched this table.'), 'error');
                return;
            }
            _pxAiPreviewFill(id, file.name, cur, fills, extras, ai, cut);
            return;
        }

        // 스키마에 없는 키는 버리고, 있는 키는 빠짐없이 채운다.
        rows = rows.map(function (r) {
            var o = {};
            ai.fields.forEach(function (k) { o[k] = (r && r[k] != null) ? String(r[k]).trim() : ''; });
            return o;
        }).filter(function (r) { return ai.fields.some(function (k) { return r[k]; }); });

        _pxAiPreview(id, file.name, rows, ai, cut);
    };
    window._pxAiImport = _pxAiImport;

    // 👀 적용 전 미리보기 — AI가 읽은 걸 **사람이 보고 승인**해야 들어간다(CLAUDE.md 원칙 5).
    //    잘못 매핑되면 페이지가 통째로 바뀌므로, 자동 적용은 하지 않는다.
    //    (적용 후에도 '↩ 되돌리기' 버튼이 한 번 더 받쳐 준다.)
    window._pxAiPending = null;
    var _pxAiEnsureBox = function () {
        var ov = document.getElementById('px-ai-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'px-ai-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="px-ai-box" style="pointer-events:all; position:fixed; left:50%; top:12%; transform:translateX(-50%);'
                + ' width:min(880px,92vw); max-height:74vh; display:flex; flex-direction:column; background:#fff; border:1px solid #a5c8f0;'
                + ' border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden; resize:both;">'
                + '<div id="px-ai-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px;'
                + ' padding:9px 12px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; font-weight:bold; font-size:13px;'
                + ' cursor:grab; user-select:none;"><span id="px-ai-title"></span>'
                + '<button onclick="window._pxAiClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="px-ai-body" style="flex:1; overflow:auto; padding:10px 12px;"></div>'
                + '<div style="flex-shrink:0; display:flex; justify-content:flex-end; gap:6px; padding:9px 12px; border-top:1px solid #e9ecef;">'
                + '<button onclick="window._pxAiClose()" style="padding:6px 12px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6;'
                + ' border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">' + _esc(_t('취소', 'Cancel')) + '</button>'
                + '<button onclick="window._pxAiApply()" onmouseover="this.style.background=\'#c9ecd3\'; this.style.borderColor=\'#7cc494\';"'
                + ' onmouseout="this.style.background=\'#e6f6ea\'; this.style.borderColor=\'#a8dab8\';"'
                + ' style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px;'
                + ' font-size:12px; font-weight:bold; cursor:pointer;">✅ ' + _esc(_t('이대로 적용', 'Apply')) + '</button></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('px-ai-box', 'px-ai-head'); } catch (e) { /* 드래그 실패가 열기를 막지 않게 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('px-ai-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('px-ai-overlay'); } catch (e) { /* 〃 */ } }
    };

    var _pxAiPreview = function (id, fileName, rows, ai, truncated) {
        window._pxAiPending = { id: id, rows: rows };
        _pxAiEnsureBox();
        document.getElementById('px-ai-title').textContent =
            '🤖 ' + _t('AI가 읽은 내용 — ', 'AI extracted — ') + fileName + ' (' + rows.length + _t('행', ' rows') + ')';
        var th = ai.fields.map(function (f) {
            return '<th style="position:sticky; top:0; background:#e7f3ff; border:1px solid #cfe3e5; padding:3px 6px; font-size:11px; white-space:nowrap;">' + _esc(ai.labels[f] || f) + '</th>';
        }).join('');
        var tb = rows.map(function (r, i) {
            return '<tr style="background:' + (i % 2 ? '#f8fbfd' : '#fff') + ';">' + ai.fields.map(function (f) {
                return '<td style="border:1px solid #e3eaec; padding:2px 6px; font-size:11px; vertical-align:top;">' + _esc(r[f] || '') + '</td>';
            }).join('') + '</tr>';
        }).join('');
        document.getElementById('px-ai-body').innerHTML =
            (truncated ? '<div style="margin-bottom:6px; padding:5px 8px; background:#fff3cd; border-left:3px solid #e6a817; border-radius:0 4px 4px 0; font-size:11px; color:#7a5210;">'
                + _esc(_t('파일이 길어 앞부분만 읽었습니다 — 뒤쪽 내용이 빠졌을 수 있습니다.', 'The file was long; only the first part was read.')) + '</div>' : '')
            + '<div style="margin-bottom:6px; font-size:11px; color:#868e96;">'
            + _esc(_t('적용하면 이 페이지의 현재 내용이 통째로 바뀝니다. 적용 후에도 ↩ 되돌리기로 되돌릴 수 있습니다.',
                      'Applying replaces this page entirely. You can still undo afterwards.')) + '</div>'
            + '<table style="border-collapse:collapse; width:100%;"><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table>';
    };

    // 🧩 채우기 모드 미리보기 — **어느 항목에 무엇이 들어가는지**를 보여 준다.
    //    TYPE/TYPE2는 손대지 않으므로 그대로 보여 주고, 바뀌는 건 값 칸뿐이다.
    var _pxAiPreviewFill = function (id, fileName, cur, fills, extras, ai, truncated) {
        window._pxAiPending = { id: id, fill: { cur: cur, fills: fills, extras: extras, ai: ai } };
        _pxAiEnsureBox();
        document.getElementById('px-ai-title').textContent =
            '🤖 ' + _t('AI가 읽은 내용 — ', 'AI extracted — ') + fileName
            + ' (' + _t('채울 항목 ', 'fill ') + fills.length + _t('개', '') + (extras.length ? ', ' + _t('새 항목 ', 'new ') + extras.length + _t('개', '') : '') + ')';

        // 값이 들어갈 열 고르기 — 지금은 Model A/B/C 중 하나. 기본은 첫 빈 열.
        var cols = ai.valueCols, pick = cols[0];
        for (var c = 0; c < cols.length; c++) {
            if (!cur.some(function (r) { return String(r[cols[c]] || '').trim(); })) { pick = cols[c]; break; }
        }
        var sel = '<label style="font-size:12px; color:#495057;">' + _esc(_t('어느 열에 넣을까요: ', 'Target column: '))
            + '<select id="px-ai-col" style="font-size:12px; padding:2px 4px;">'
            + cols.map(function (k) {
                var nm = (window.bsActiveUnit && window.bsActiveUnit()) || ai.labels[k] || k;
                return '<option value="' + k + '"' + (k === pick ? ' selected' : '') + '>' + _esc(nm) + '</option>';
            }).join('') + '</select></label>';

        var tr = function (no, type, sub, val, note, isNew) {
            return '<tr style="background:' + (isNew ? '#eefbf1' : (no % 2 ? '#f8fbfd' : '#fff')) + ';">'
                + '<td style="border:1px solid #e3eaec; padding:2px 6px; font-size:11px; text-align:center; white-space:nowrap;">' + (isNew ? '🆕' : no) + '</td>'
                + '<td style="border:1px solid #e3eaec; padding:2px 6px; font-size:11px;">' + _esc(type) + '</td>'
                + '<td style="border:1px solid #e3eaec; padding:2px 6px; font-size:11px;">' + _esc(sub) + '</td>'
                + '<td style="border:1px solid #e3eaec; padding:2px 6px; font-size:11px; font-weight:bold; color:#1f7a3d;">' + _esc(val) + '</td>'
                + '<td style="border:1px solid #e3eaec; padding:2px 6px; font-size:11px; color:#868e96;">' + _esc(note) + '</td></tr>';
        };
        var body = fills.map(function (f) {
            var r = cur[f.i] || {};
            return tr(f.i + 1, r.type || '', r.sub || '', f.value, f.note, false);
        }).join('') + extras.map(function (e) { return tr(0, e.type, e.sub, e.value, e.note, true); }).join('');

        document.getElementById('px-ai-body').innerHTML =
            (truncated ? '<div style="margin-bottom:6px; padding:5px 8px; background:#fff3cd; border-left:3px solid #e6a817; border-radius:0 4px 4px 0; font-size:11px; color:#7a5210;">'
                + _esc(_t('파일이 길어 앞부분만 읽었습니다.', 'The file was long; only the first part was read.')) + '</div>' : '')
            + '<div style="display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap;">' + sel
            + '<span style="font-size:11px; color:#868e96;">'
            + _esc(_t('TYPE / TYPE2 서식은 건드리지 않습니다. 값 칸만 채웁니다. 🆕 행은 Power estimation 위에 끼워 넣습니다.',
                      'TYPE / TYPE2 are left untouched — only value cells are filled. 🆕 rows are inserted above Power estimation.'))
            + '</span></div>'
            + '<table style="border-collapse:collapse; width:100%;"><thead><tr>'
            + ['NO', 'TYPE', 'TYPE2', _t('읽은 값', 'Value'), 'Note'].map(function (h) {
                return '<th style="position:sticky; top:0; background:#e7f3ff; border:1px solid #cfe3e5; padding:3px 6px; font-size:11px; white-space:nowrap;">' + _esc(h) + '</th>';
            }).join('') + '</tr></thead><tbody>' + body + '</tbody></table>';
    };

    window._pxAiClose = function () {
        var ov = document.getElementById('px-ai-overlay');
        if (ov) ov.style.display = 'none';
        window._pxAiPending = null;
    };

    window._pxAiApply = function () {
        var p = window._pxAiPending;
        if (!p) return;
        var spec = _specById(p.id); if (!spec) return;
        var b = spec.blocks[0];
        var k = _nms(b.sheet)[0], snap = {};
        try { snap[k] = JSON.parse(JSON.stringify(b.get())); } catch (e) { snap[k] = null; }
        var before = (b.get() || []).length, newRows;

        if (p.fill) {
            var F = p.fill, ai = F.ai;
            var colSel = document.getElementById('px-ai-col');
            var col = (colSel && colSel.value) || ai.valueCols[0];
            // 원본을 복사해서 손댄다 — 되돌리기 스냅샷과 같은 배열을 쓰면 되돌릴 게 없어진다.
            newRows = F.cur.map(function (r) { return Object.assign({}, r); });
            F.fills.forEach(function (f) {
                if (!newRows[f.i]) return;
                newRows[f.i][col] = f.value;
                if (f.note) newRows[f.i].note = f.note;   // 기존 note 가 있으면 덮지 않도록 값이 있을 때만
            });
            // 📌 새 항목은 Power estimation 묶음 **바로 위**에 끼운다 — 그 묶음은 늘 맨 아래여야 한다.
            if (F.extras.length) {
                var at = (typeof ai.tailFrom === 'function') ? ai.tailFrom(newRows) : newRows.length;
                var made = F.extras.map(function (e) {
                    var o = { type: e.type, sub: e.sub, modelA: '', note: e.note || '' };
                    o[col] = e.value;
                    return o;
                });
                newRows.splice.apply(newRows, [at, 0].concat(made));
            }
        } else {
            newRows = p.rows;
        }

        b.set(newRows);
        var after = (b.get() || []).length;
        window._pageExcelUndo[p.id] = JSON.stringify(snap);
        _repaint(spec.repaint);
        if (window._markNonGanttDirty) { try { window._markNonGanttDirty(); } catch (e) { /* 표시 실패가 적용을 막지 않게 */ } }
        _toast('🤖 ' + _nm(spec.label) + ' ' + _t('AI로 불러왔습니다 — ', 'imported via AI — ') + before + '→' + after + _t('행', ' rows'), 'success');
        window._pxAiClose();
        _pxRenderButtons();   // ↩ 되돌리기 버튼을 띄운다
    };

    // ── 불러오기 ───────────────────────────────────────────────────────
    window._pageExcelUndo = window._pageExcelUndo || {};   // id → 직전 스냅샷(JSON 문자열)

    window.pageExcelImportPick = function (id) {
        var spec = _specById(id);
        if (!spec || spec.exportOnly) return;
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = PX_ACCEPT;
        inp.onchange = function () { if (inp.files && inp.files[0]) window.pageExcelImport(id, inp.files[0]); };
        inp.click();
    };

    window.pageExcelImport = async function (id, file) {
        var spec = _specById(id);
        if (!spec || spec.exportOnly || !window.XLSX) return;

        // 📄 규격 엑셀이 아닌 것(PDF·TXT·HTML)은 바로 AI 경로로. 엑셀이라도 **이 페이지의 시트가
        //    없으면** 아래에서 AI로 넘긴다 — 협력사가 보내온 제각각인 양식이 그렇다.
        if (!_pxIsWorkbook(file)) return _pxAiImport(id, file);

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
            // 한글/영문 어느 쪽으로 저장된 파일이든 받는다 — 한쪽만 보면 언어를 바꾼 순간 못 읽는다.
            var sh = null;
            _nms(b.sheet).some(function (n) { sh = wb.Sheets[n] || wb.Sheets[n.slice(0, 31)]; return !!sh; });
            if (sh) matched.push({ b: b, sh: sh }); else missing.push(_nm(b.sheet));
        });
        if (!matched.length) {
            // 🤖 시트 이름이 안 맞는다 = 우리가 낸 파일이 아니다. 거절하지 말고 AI에게 넘긴다.
            if (_pxAiSpec(spec)) return _pxAiImport(id, file, wb);
            _toast('⚠️ ' + _t('이 페이지의 시트를 찾지 못했습니다. 필요한 시트: ', 'No matching sheet. Expected: ')
                   + spec.blocks.map(function (b) { return _nm(b.sheet); }).join(', '), 'error');
            return;
        }

        // 바꾸기 전 상태를 통째로 떠 둔다(되돌리기용).
        var snap = {};
        spec.blocks.forEach(function (b) { var k = _nms(b.sheet)[0];
            try { snap[k] = JSON.parse(JSON.stringify(b.get())); } catch (e) { snap[k] = null; } });

        var summary = [];
        matched.forEach(function (m) {
            var aoa = window.XLSX.utils.sheet_to_json(m.sh, { header: 1, defval: '', raw: false });
            if (m.b.kind === 'kv') {
                m.b.set(aoaToKv(aoa, m.b.labels));
                summary.push(_nm(m.b.sheet));
            } else {
                var rows = aoaToRows(aoa);
                var before = (m.b.get() || []).length;
                m.b.set(rows);
                // ⚠️ 파일의 행 수가 아니라 **실제로 저장된 행 수**를 말한다 — M.C Table처럼 계산
                //    행을 걸러내는 블록이 있어서, 파일 행수를 그대로 말하면 사실과 달라진다.
                var after = (m.b.get() || []).length;
                summary.push(_nm(m.b.sheet) + ' ' + before + '→' + after + _t('행', '')
                             + (rows.length !== after ? _t(' (계산 행 ' + (rows.length - after) + '개 제외)',
                                                           ' (' + (rows.length - after) + ' calculated rows skipped)') : ''));
            }
        });

        window._pageExcelUndo[id] = JSON.stringify(snap);
        _repaint(spec.repaint);
        // 불러오기도 '저장 안 된 변경'이다 — 안 찍으면 창을 닫을 때 경고 없이 날아간다(js/04a).
        if (window._markNonGanttDirty) { try { window._markNonGanttDirty(); } catch (e) { /* 표시 실패가 불러오기를 막진 않는다 */ } }

        _toast('📥 ' + _nm(spec.label) + ' ' + _t('불러왔습니다 — ', 'imported — ') + summary.join(' / ')
               + (missing.length ? (' / ' + _t('건너뜀: ', 'skipped: ') + missing.join(', ')) : ''), 'success');
        _pxRenderButtons();   // 되돌리기 버튼을 띄우기 위해 다시 그린다
    };

    window.pageExcelUndo = function (id) {
        var spec = _specById(id), raw = window._pageExcelUndo[id];
        if (!spec || !raw) return;
        var snap;
        try { snap = JSON.parse(raw); } catch (e) { return; }
        spec.blocks.forEach(function (b) {
            var k = _nms(b.sheet)[0];
            if (snap[k] == null) return;
            b.set(snap[k]);
        });
        delete window._pageExcelUndo[id];
        _repaint(spec.repaint);
        _toast('↩️ ' + _nm(spec.label) + ' ' + _t('불러오기 전으로 되돌렸습니다.', 'restored.'), 'success');
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

    // 🫳 '엑셀 입력' 버튼에 **드래그앤드롭**. 파일 고르기 창을 안 거치고 바로 떨군다.
    //   ⚠️⚠️ 떨어뜨린 이벤트를 **여기서 반드시 멈춰야 한다**(stopPropagation). js/04f가 window에
    //      drop 핸들러를 달아 두고 **프로젝트 전체를 엑셀로 덮어쓰는** handleFiles를 부르기 때문에,
    //      안 멈추면 페이지 불러오기와 프로젝트 전체 덮어쓰기(관리자 비밀번호 창)가 **같이** 일어난다.
    //   그래서 드롭 영역을 페이지 전체가 아니라 **이 버튼으로 좁혔다** — 화면 아무 데나 떨구는
    //   기존 "프로젝트 엑셀 열기" 동작은 그대로 살아 있어야 한다.
    var _pxBindDrop = function (btn, id) {
        if (!btn || btn._pxDropBound) return;
        btn._pxDropBound = true;
        var BASE = '#e0f5f7', HOT = '#a3d9e0';
        var stop = function (e) { e.preventDefault(); e.stopPropagation(); };
        var hot  = function () { btn.style.background = HOT; btn.style.outline = '2px dashed ' + HOT; btn.style.outlineOffset = '1px'; };
        var cool = function () { btn.style.background = BASE; btn.style.outline = ''; btn.style.outlineOffset = ''; };
        btn.addEventListener('dragenter', function (e) { stop(e); hot(); });
        // dragover에서도 칠한다 — 끌고 있는 동안 mouseout이 끼어들어 색을 되돌리는 경우가 있다.
        btn.addEventListener('dragover', function (e) { stop(e); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; hot(); });
        btn.addEventListener('dragleave', function (e) { stop(e); cool(); });
        btn.addEventListener('drop', function (e) {
            stop(e); cool();
            var files = (e.dataTransfer && e.dataTransfer.files) || [];
            var f = null;
            // 엑셀뿐 아니라 PDF·TXT·HTML도 받는다 — 규격이 아니면 AI가 읽어서 매핑한다.
            var OK = /\.(xlsx|xls|csv|pdf|txt|html?)$/i;
            for (var i = 0; i < files.length; i++) if (OK.test(files[i].name)) { f = files[i]; break; }
            if (!f) {
                _toast('⚠️ ' + _t('받을 수 있는 형식이 아닙니다 — 엑셀(.xlsx/.xls/.csv), PDF, TXT, HTML만 됩니다.',
                                  'Unsupported file — only Excel (.xlsx/.xls/.csv), PDF, TXT and HTML are accepted.'), 'error');
                return;
            }
            if (files.length > 1) {
                _toast(_t('파일이 여러 개라 첫 번째만 불러옵니다: ', 'Several files dropped — importing the first one only: ') + f.name, 'info');
            }
            window.pageExcelImport(id, f);
        });
    };

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
                    '<button id="px-import-' + spec.id + '" onclick="window.pageExcelImportPick(\'' + spec.id + '\')" title="'
                  + _esc(_t('엑셀에서 수정한 내용을 다시 불러옵니다 — 현재 내용은 통째로 교체되며, 바로 되돌릴 수 있습니다.\n이 버튼 위로 엑셀 파일을 끌어다 놓아도 됩니다.',
                            'Import an edited Excel file — replaces current content; you can undo right after.\nYou can also drop an Excel file onto this button.'))
                  + '" onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                  + ' style="' + BTN + '">📥 ' + _t('엑셀 입력', 'Import') + '</button>' + SEP)
                + '<button onclick="window.pageExcelExport(\'' + spec.id + '\')" title="'
                  + _esc(_t(_nm(spec.label) + ' 내용을 엑셀 파일로 저장합니다', 'Save ' + _nm(spec.label) + ' as an Excel file'))
                  + '" onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                  + ' style="' + BTN + ' margin-right:4px;">📊 ' + _t('엑셀 저장', 'Export') + '</button>'
                + (hasUndo ?
                    '<button onclick="window.pageExcelUndo(\'' + spec.id + '\')" title="'
                  + _esc(_t('방금 불러오기 전으로 되돌립니다', 'Undo the import'))
                  + '" onmouseover="this.style.background=\'#f5c2bd\';" onmouseout="this.style.background=\'#fbe4e2\';"'
                  + ' style="' + BTN + ' margin-right:4px; background:#fbe4e2; color:#b1432f;">↩ '
                  + _t('되돌리기', 'Undo') + '</button>' : '');
            // innerHTML을 다시 쓸 때마다 버튼이 새로 만들어지므로, 그때마다 다시 묶어 준다.
            if (!spec.exportOnly) _pxBindDrop(document.getElementById('px-import-' + spec.id), spec.id);
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
