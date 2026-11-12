// 🏷 [2026-11-12] 라벨사양서(js/67 'label-spec' + js/72 파서) 하네스
//
//  돌리는 법: 앱을 연 브라우저 콘솔에 **통째로** 붙여넣고  `await __labelSpecTest()`
//
//  ⚠️⚠️ **실제 프로젝트가 열려 있으면 거부한다** — `tabData.documents` 를 건드리므로 앱
//     자동저장이 합성값을 NAS 에 쓸 수 있다. 빈 앱(프로젝트 안 연 상태)에서 돌릴 것.
//     `{force:true}` 로 넘길 수 있지만 그때도 저장은 막고 끝나면 원래대로 되돌린다.
//  🎯 가짜는 **저장(saveToGoogleDrive/markUnsavedChanges)뿐** — 시트 레이아웃·파서·렌더·토글·
//     내보내기(_docToAoa)는 전부 **진짜 코드**로 돈다. 워크북은 `XLSX.utils.aoa_to_sheet` 로
//     실측 3개 파일의 모양(머리글 글자로 열을 찾기·리비전 시트 선택·'제품' 하나에만 딸린
//     인증/정격 표·부착위치가 다른 행/열에 떨어진 경우)을 합성한다 — **실제 고객 파일은
//     저장소에 안 넣는다**(그 안에 실제 모델·품목코드가 있다).
//  ⚠️ `/sap-label-search`·`/sap-open-file` 는 백엔드 재시작이 필요해 **이 하네스에선 안 본다**
//     (그건 `tests/test_sap_label_search.py` 가 본다, app.test_client() 로).
(function () {
    'use strict';

    // 행(1-based) 배열에 "열(1-based): 값" 을 꽂아 aoa 한 줄을 만든다
    var row = function (pairs) {
        var r = [];
        Object.keys(pairs).forEach(function (c) { r[Number(c) - 1] = pairs[c]; });
        return r;
    };

    var buildWorkbook = function () {
        var X = window.XLSX;
        // 'decoy' 시트('00') — **최신 리비전이 아니라서 무시돼야 한다**(다른 코드를 심어 확인)
        var decoyAoa = [];
        decoyAoa[4] = row({ 1: '라 벨 종 류', 15: '라벨규격', 18: '라벨품목코드', 22: '부착위치' });
        decoyAoa[5] = row({ 15: '99 X 99', 18: '999999', 22: '제품' });

        // '01' 시트 — 현재본. 실측 3개 파일의 까다로운 지점을 한 시트에 모은다.
        var aoa = [];
        aoa[2] = row({ 17: 'REV.', 20: '01' });
        aoa[4] = row({ 1: '라 벨 종 류', 15: '라벨규격', 18: '라벨품목코드', 22: '부착위치' });
        // 라벨①(제품) — 이 라벨에만 인증/정격 표가 딸린다
        aoa[5] = row({ 15: '75 X 70', 18: '124291', 22: '제품' });
        aoa[7] = row({ 26: '인증 항목', 27: 'Check', 28: '인쇄 적용', 29: '인쇄 구분' });
        aoa[8] = row({ 26: 'CE', 27: 'O', 28: 'O', 29: '기본' });
        aoa[9] = row({ 26: 'FCC', 27: 'X', 28: 'X' });
        aoa[11] = row({ 26: 'Set Rating SPEC', 27: 'DC 24V / 8A', 28: 'O' });
        // ⚠️ '-' 는 정격 "값 없음" 이지 인증 Check 가 아니다 — 인증으로 잘못 집히면 실패해야 한다
        aoa[12] = row({ 26: 'LED Rating SPEC', 27: '-', 28: '-' });
        // "* 특이사항 기재" 같은 안내 줄 — Check 칸이 비어 있어 건너뛰어야 한다
        aoa[14] = row({ 26: '* 특이사항 기재' });
        // 라벨②(C/T BOX) — ⚠️ 부착위치가 **같은 행에 없다**(실측 502382 케이스). 4행 아래,
        //    한 칸 오른쪽(23열)에 떨어져 있다 — 다음 라벨 행 전까지 근처 열에서 찾아야 한다.
        aoa[16] = row({ 15: '105 X 105', 18: '124231' });
        aoa[19] = row({ 23: 'C/T BOX' });
        // 라벨③(제품, 두 번째) — 인증/정격 표는 라벨①②③ 중 **①에만** 있어야 한다
        aoa[21] = row({ 15: '50 X 25', 18: '122549', 22: '제품' });
        aoa[23] = row({ 1: '1 - 1' });                      // 쪽 번호 — 여기서 표가 끝난다

        var wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(decoyAoa), '00');
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), '01');
        X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Date', 'Rev.No.', 'Summary']]), 'Revision History');
        return wb;
    };

    window.__labelSpecTest = async function (opt) {
        opt = opt || {};
        var pm = window.projectMeta || {};
        if (!opt.force && (pm.모델명 || pm.고객사 || pm.프로젝트명)) {
            console.error('⛔ 실제 프로젝트가 열려 있습니다 — 빈 앱에서 돌리세요. ({force:true} 로 강제 가능)');
            return { refused: true };
        }
        if (typeof window.XLSX === 'undefined' || !window._labelSpecParseWorkbook) {
            console.error('⛔ XLSX 또는 js/72(_labelSpecParseWorkbook) 가 안 실려 있습니다.');
            return { refused: true };
        }

        var pass = 0, fail = 0, notes = [];
        var ok = function (cond, what) {
            if (cond) { pass++; } else { fail++; notes.push('❌ ' + what); console.error('❌ ' + what); }
        };

        var saved = {
            save: window.saveToGoogleDrive, dirty: window.markUnsavedChanges,
            docs: window.tabData && window.tabData.documents,
            state: window._docState && JSON.parse(JSON.stringify(window._docState))
        };
        window.saveToGoogleDrive = function () { return Promise.resolve({ skipped: 'test' }); };
        window.markUnsavedChanges = function () {};
        window.tabData = window.tabData || {};
        window.tabData.documents = {};

        try {
            // ═══ 1. 순수 파서 — 시트 선택 + 열 찾기 + 라벨 행 + 인증/정격 분류 ═══
            var wb = buildWorkbook();
            var p = window._labelSpecParseWorkbook(wb);
            ok(!!p, '파서가 null 을 돌려줬다(양식을 못 찾음)');
            if (p) {
                ok(p.sheet === '01', '최신 리비전 시트(01)가 아니라 ' + p.sheet + ' 를 읽었다');
                ok(p.rev === '01', 'REV 값을 못 읽었다: ' + p.rev);
                ok(p.items.length === 3, '라벨이 3개가 아니라 ' + p.items.length + '개');
                var l1 = p.items[0] || {};
                ok(l1.size === '75 X 70' && l1.code === '124291' && l1.position === '제품',
                   '라벨① 못 읽음: ' + JSON.stringify(l1));
                var l2 = p.items[1] || {};
                ok(l2.code === '124231' && l2.position === 'C/T BOX',
                   '🩹 부착위치가 다른 행/열에 있을 때 못 찾는다: ' + JSON.stringify(l2));
                var l3 = p.items[2] || {};
                ok(l3.code === '122549' && l3.position === '제품', '라벨③ 못 읽음: ' + JSON.stringify(l3));

                ok(p.certs.length === 2, '인증 항목이 2개가 아니라 ' + p.certs.length + '개: ' + JSON.stringify(p.certs));
                var ce = p.certs.filter(function (c) { return c.name === 'CE'; })[0];
                ok(ce && ce.check === 'O' && ce.print === 'O' && ce.printType === '기본', 'CE 줄 못 읽음: ' + JSON.stringify(ce));
                var fcc = p.certs.filter(function (c) { return c.name === 'FCC'; })[0];
                ok(fcc && fcc.check === '' && fcc.print === '', 'FCC(X/X) 가 O 로 읽혔다: ' + JSON.stringify(fcc));

                ok(p.ratings.length === 2, '정격 항목이 2개가 아니라 ' + p.ratings.length + '개: ' + JSON.stringify(p.ratings));
                var setR = p.ratings.filter(function (r) { return r.name === 'Set Rating SPEC'; })[0];
                ok(setR && setR.spec === 'DC 24V / 8A' && setR.print === 'O', 'Set Rating SPEC 못 읽음: ' + JSON.stringify(setR));
                var led = p.ratings.filter(function (r) { return r.name === 'LED Rating SPEC'; })[0];
                ok(led && led.spec === '-' && led.print === '', "'-' 가 인증으로 잘못 분류됐다: " + JSON.stringify(led));
            }

            // ═══ 2. 실제 경로 — 📂 불러오기 버튼이 타는 길 그대로(_docImportFile → 분기 → 적용) ═══
            window.switchTab && window.switchTab('document');
            window._docPick('label-spec');
            var buf = window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            var file = new File([buf], 'test.xlsx', { type: 'application/octet-stream' });
            await window._docImportFile(file);
            // `_docData` 의 실제 키 규칙(회차 접미사 등)을 몰라도 되게 — documents 를 통째로 훑는다
            var found = null;
            Object.keys(window.tabData.documents || {}).forEach(function (k) {
                if (window.tabData.documents[k] && window.tabData.documents[k].labelItems) found = window.tabData.documents[k];
            });
            ok(!!found, '📂 불러오기 경로로는 labelItems 가 하나도 안 채워졌다');
            if (found) {
                ok(found.labelItems.length === 3, '불러오기 후 라벨 개수가 다르다: ' + found.labelItems.length);
                ok((found.labelCerts.certs || []).length === 2, '불러오기 후 인증 개수가 다르다');
            }

            // ═══ 3. 화면에 실제로 그려지는가 + 엑셀 내보내기(aoa)에도 들어가는가 ═══
            // ⚠️ 라벨 코드·인증/정격 이름은 **입력칸 value** 다 — `.innerText` 는 input 값을
            //    안 읽으므로(값이 있어도 안 잡힌다) data-doc-* 셀렉터로 실제 칸 값을 본다.
            window._docRender();
            var codeIn = document.querySelector('[data-doc-litem="0|code"]');
            ok(codeIn && codeIn.value === '124291', '불러온 코드가 화면 입력칸에 없다: ' + (codeIn && codeIn.value));
            var ratingNameIn = document.querySelector('[data-doc-lcert="r|0|name"]');
            ok(ratingNameIn && ratingNameIn.value === 'Set Rating SPEC',
               '정격 항목이 화면 입력칸에 없다: ' + (ratingNameIn && ratingNameIn.value));
            var aoa2 = window._docToAoa('label-spec');
            var flat = aoa2.map(function (r) { return (r || []).join('|'); }).join('\n');
            ok(flat.indexOf('124291') >= 0, '엑셀 내보내기(aoa)에 라벨 코드가 없다');
            ok(flat.indexOf('CE') >= 0 && flat.indexOf('O') >= 0, '엑셀 내보내기에 인증 표가 없다');

            // ═══ 4. 행 추가/삭제 + 토글이 실제 저장소에 반영되는가 ═══
            window._docLabelItemAdd('label-spec');
            ok(found.labelItems.length === 4, '라벨 추가가 안 먹는다');
            window._docLabelItemDel('label-spec', 3);
            ok(found.labelItems.length === 3, '라벨 삭제가 안 먹는다(빈 줄이라 확인창 없이 지워져야 한다)');
            window._docLabelCertAdd('label-spec', 'r');
            var newR = found.labelCerts.ratings[found.labelCerts.ratings.length - 1];
            ok(newR && newR.name === '' && newR.spec === '', '정격 행 추가 모양이 다르다: ' + JSON.stringify(newR));
            window._docLabelCertDel('label-spec', 'r', found.labelCerts.ratings.length - 1);
            ok(found.labelCerts.ratings.length === 2, '정격 행 삭제가 안 먹는다');

        } catch (e) {
            fail++; notes.push('💥 ' + (e && e.stack || e));
            console.error(e);
        } finally {
            window.saveToGoogleDrive = saved.save;
            window.markUnsavedChanges = saved.dirty;
            if (saved.docs) window.tabData.documents = saved.docs; else delete window.tabData.documents;
            if (saved.state) window._docState = saved.state;
            try { window._docRender && window._docRender(); } catch (e2) { /* 〃 */ }
        }

        console.log((fail ? '❌' : '✅') + ' 라벨사양서: ' + pass + '/' + (pass + fail));
        notes.forEach(function (n) { console.log('   ' + n); });
        return { pass: pass, fail: fail, notes: notes };
    };

    console.log('🏷 준비됨 — `await __labelSpecTest()` 를 치세요 (빈 앱에서).');
})();
