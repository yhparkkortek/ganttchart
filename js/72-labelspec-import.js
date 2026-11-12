// 🏷 [2026-11-12 신규] 라벨사양서 — "모델명세서_라벨_<품목코드>_<모델>_V/R<REV>.xlsx" 고정 양식 파서
//
// AI 를 쓰지 않는다(CLAUDE.md "결정론 먼저") — 실측 3개 파일(502293/502247/502382)이 레이아웃이
// 같았다. 다루는 것:
//  · 시트는 'Revision History' + 숫자 시트('00'~'04' 등, 리비전 스냅샷) — **가장 큰 숫자 시트가
//    현재본**이다. 숫자 시트가 하나도 없으면 마지막 시트를 쓴다.
//  · 라벨은 모델마다 3~5개 반복된다(규격·6자리 라벨품목코드·부착위치) — 머리글 셀 "라벨규격"/
//    "라벨품목코드"/"부착위치" 를 **찾아서** 열 위치를 정한다(좌표를 박지 않는다 — 고객사마다
//    달라질 수 있다).
//  · 인증(CE/FCC/UL…)·정격표시(Set/LED Rating SPEC…) 표는 실측 3개 파일 전부 **첫 라벨('제품')
//    하나에만** 딸려 있다 — 그 라벨과 다음 라벨 사이 구간에서만 "인증 항목" 머리글을 찾는다.
//  · 부착위치가 같은 행이 아니라 몇 줄 아래 다른 열에 떨어져 있는 경우가 실측에 있었다(502382의
//    110x75/130875) — 같은 행에 없으면 다음 라벨 행 전까지 근처 열에서 짧은 글자 값을 찾는다.
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };
    var _s = function (v) { return (v == null) ? '' : String(v).trim(); };

    var cellOf = function (ws, X) {
        return function (r, c) { var x = ws[X.utils.encode_cell({ r: r - 1, c: c - 1 })]; return x ? x.v : null; };
    };

    // 시트 안에서 글자가 **정확히** 같은 셀을 찾는다 — {row, col} 또는 null
    var findCell = function (ws, X, rg, text, rowFrom, rowTo) {
        for (var r = (rowFrom || rg.s.r + 1); r <= (rowTo || rg.e.r + 1); r++) {
            for (var c = rg.s.c + 1; c <= rg.e.c + 1; c++) {
                var v = cellOf(ws, X)(r, c);
                if (v != null && _s(v) === text) return { row: r, col: c };
            }
        }
        return null;
    };

    // 워크북 → {meta, items, certs, ratings} 또는 null(이 양식이 아님)
    window._labelSpecParseWorkbook = function (wb) {
        if (!wb || !wb.SheetNames || !wb.SheetNames.length || !window.XLSX) return null;
        var X = window.XLSX;
        // 숫자 시트 중 가장 큰 것(= 가장 최근 리비전) — 없으면 'Revision History' 를 뺀 마지막 시트
        var numeric = wb.SheetNames.filter(function (n) { return /^\d+$/.test(String(n).trim()); });
        var sheetName = numeric.length
            ? numeric.sort(function (a, b) { return Number(a) - Number(b); }).pop()
            : (wb.SheetNames.filter(function (n) { return n !== 'Revision History'; }).pop() || wb.SheetNames[wb.SheetNames.length - 1]);
        var ws = wb.Sheets[sheetName];
        if (!ws || !ws['!ref']) return null;
        var rg = X.utils.decode_range(ws['!ref']);
        var cell = cellOf(ws, X);

        var sizeHdr = findCell(ws, X, rg, '라벨규격');
        if (!sizeHdr) return null;                           // 이 양식이 아니다
        var codeHdr = findCell(ws, X, rg, '라벨품목코드', sizeHdr.row, sizeHdr.row);
        var posHdr = findCell(ws, X, rg, '부착위치', sizeHdr.row, sizeHdr.row);
        if (!codeHdr) return null;
        var sizeCol = sizeHdr.col, codeCol = codeHdr.col, posCol = posHdr ? posHdr.col : (codeCol + 4);

        // ── 머리글 메타(사람이 이미 적은 값은 js/67 쪽에서 안 건드린다 — 여기선 REV 만 돌려준다)
        var revHdr = findCell(ws, X, rg, 'REV.', rg.s.r + 1, sizeHdr.row);
        var rev = revHdr ? _s(cell(revHdr.row, revHdr.col + 3)) : '';

        // ── 라벨 행 찾기 — codeCol 이 차 있는 모든 행
        var footerRe = /^\d+\s*-\s*\d+$/;                    // "1 - 1" 쪽 번호
        var itemRows = [];
        for (var r = sizeHdr.row + 1; r <= rg.e.r + 1; r++) {
            var a1 = _s(cell(r, 1));
            if (a1 && footerRe.test(a1)) break;               // 쪽 번호에서 끊는다
            var codeV = cell(r, codeCol);
            if (codeV != null && _s(codeV) !== '') itemRows.push(r);
        }

        var items = itemRows.map(function (r, idx) {
            var nextRow = itemRows[idx + 1] || (rg.e.r + 2);
            var pos = posCol ? _s(cell(r, posCol)) : '';
            if (!pos) {
                // 🩹 같은 행에 없으면 다음 라벨 행 전까지 근처 열에서 짧은 글자 값을 찾는다
                //    (실측 502382 "110x75/130875" 케이스 — 부착위치가 4행 아래·옆 칸에 있었다).
                for (var rr = r + 1; rr < nextRow && !pos; rr++) {
                    for (var cc = Math.max(1, posCol - 2); cc <= posCol + 2; cc++) {
                        var v = cell(rr, cc);
                        if (v == null) continue;
                        var sv = _s(v);
                        if (sv && sv.length <= 20 && !/^\d+(\.\d+)?$/.test(sv)) { pos = sv; break; }
                    }
                }
            }
            return { size: _s(cell(r, sizeCol)), code: _s(cell(r, codeCol)), position: pos, note: '' };
        });

        // ── 인증/정격 표 — 실측상 **첫 라벨과 둘째 라벨 사이 구간에만** 있다
        var certs = [], ratings = [];
        if (itemRows.length) {
            var scanFrom = itemRows[0] + 1, scanTo = (itemRows[1] || (rg.e.r + 2)) - 1;
            var certHdr = findCell(ws, X, rg, '인증 항목', scanFrom, scanTo);
            if (certHdr) {
                var certCol = certHdr.col;
                // 같은 행의 다음 칸들이 각각 Check/인쇄 적용/인쇄 구분 — 글자로 맞춘다(열 번호를 안 박는다)
                var checkCol = null, printCol = null, printTypeCol = null;
                for (var hc = certCol + 1; hc <= certCol + 4; hc++) {
                    var hv = _s(cell(certHdr.row, hc));
                    if (/^check$/i.test(hv) && checkCol == null) checkCol = hc;
                    else if (/인쇄\s*적용/.test(hv) && printCol == null) printCol = hc;
                    else if (/인쇄\s*구분/.test(hv) && printTypeCol == null) printTypeCol = hc;
                }
                if (checkCol == null) checkCol = certCol + 1;
                if (printCol == null) printCol = certCol + 2;
                for (var cr = certHdr.row + 1; cr <= scanTo; cr++) {
                    var nameV = _s(cell(cr, certCol));
                    var checkV = _s(cell(cr, checkCol));
                    if (!nameV || !checkV) continue;           // "* 특이사항 기재" 같은 안내 줄은 건너뛴다
                    var printV = _s(cell(cr, printCol));
                    // ⚠️ 실측: '-' 는 **정격표시 줄의 "값 없음"** 이다(LED Rating SPEC/CANDLE LAMP 가
                    //    측정 전이면 '-'/'-' 로 비워 둔다) — 인증 줄의 Check 는 'O'/'X' 둘뿐이었다.
                    //    '-' 를 인증으로 치면 그 두 줄이 인증 표로 잘못 들어간다(한 번 그렇게 틀렸다).
                    if (/^[ox]$/i.test(checkV)) {
                        certs.push({
                            name: nameV, check: /^o$/i.test(checkV) ? 'O' : '',
                            print: /^o$/i.test(printV) ? 'O' : '',
                            printType: printTypeCol != null ? _s(cell(cr, printTypeCol)) : ''
                        });
                    } else {
                        ratings.push({ name: nameV, spec: checkV, print: /^o$/i.test(printV) ? 'O' : '' });
                    }
                }
            }
        }

        if (!items.length) return null;
        return { sheet: sheetName, rev: rev, items: items, certs: certs, ratings: ratings };
    };

    // 사람이 고른 파일 → 파싱 → js/67 쪽(`_docLabelImportApply`)에 적용 요청
    window._labelSpecImportFile = async function (file, formId) {
        if (!file || typeof XLSX === 'undefined') {
            _toast('⚠️ ' + _t('엑셀 파일이 아닙니다.', 'Not an Excel file.'), 'error');
            return;
        }
        _toast('⏳ ' + _t('라벨사양서를 읽는 중…', 'Reading…'), 'info');
        var parsed;
        try {
            var wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
            parsed = window._labelSpecParseWorkbook(wb);
        } catch (e) {
            _toast('⚠️ ' + _t('읽지 못했습니다: ', 'Could not read: ') + (e && e.message || e), 'error');
            return;
        }
        if (!parsed) {
            _toast('ℹ️ ' + _t('이 양식(라벨규격·라벨품목코드·부착위치 열)을 못 찾았습니다.',
                              "Couldn't find the label-spec layout (size/code/position columns)."), 'info');
            return;
        }
        var ok = window._docLabelImportApply && window._docLabelImportApply(formId, parsed);
        if (ok === false) return;                            // 사람이 덮어쓰기를 취소했다
        _toast('✅ ' + _t('라벨 ' + parsed.items.length + '개 · 인증 ' + parsed.certs.length
                        + '개 · 정격 ' + parsed.ratings.length + '개 불러왔습니다 (' + parsed.sheet + ')',
                          'Imported ' + parsed.items.length + ' label(s).'), 'success');
    };
})();
