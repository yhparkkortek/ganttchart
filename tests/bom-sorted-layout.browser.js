// 브라우저 콘솔에 붙여넣기(또는 fetch('tests/bom-sorted-layout.browser.js').then(r=>r.text()).then(eval))
//
// 🧱 BOM — "모 품목·자 품목 연결이 뒤죽박죽"(2026-11-05 제보) 회귀 검증.
//
// 무엇이 고장나 있었나: 파서(`_bomParseSapText`)는 2026-10-20부터 계층 성립 여부를 계산했고
// 렌더러도 그 값을 읽고 있었는데, **조회가 그 값을 store에 안 실어 줬다**. 그래서 화면에선
// 늘 `undefined`(= 계층 정상)로 떨어져, ALV에 정렬이 걸린 응답을 받아도 경고 한 줄 없이
// 남의 부모 밑에 자식을 그렸다. 즉 깨져 있던 건 **판정이 아니라 연결**이라, 파서만 불러보는
// 테스트로는 절대 안 잡힌다(CLAUDE.md "고쳤다의 정의").
//   → 그래서 이 하네스는 **사람이 지나는 경로**를 쓴다: store에 넣고 `bomRender()`를 부른 뒤
//     **진짜 DOM**(레벨 블록 머리행·접기 화살표·경고 문구)을 읽는다.
//
// SAP·네트워크·AI 없이 돈다(가짜는 SAP 응답 텍스트 하나뿐). 저장은 막고, 끝나면 원래 store를 되돌린다.
(function () {
    var pass = 0, fail = 0, logs = [];
    function ok(label, cond, extra) {
        if (cond) { pass++; console.log('%c  ✓ ' + label, 'color:#2a7'); }
        else { fail++; console.log('%c  ✗ ' + label + (extra ? '\n      ' + extra : ''), 'color:#c33'); logs.push(label); }
    }
    function sec(t) { console.log('%c' + t, 'font-weight:bold'); }

    if (!window._bomParseSapText || !window.bomRender) {
        console.error('js/38-bom-tab.js 가 로드되지 않았습니다 — kortek_pm.html 에서 돌려주세요.');
        return;
    }

    // ── 가짜 SAP 응답 ────────────────────────────────────────────────
    // 모양은 실물 그대로(메타헤더 → 빈 줄 → 헤더행 → `[ N     ]` STUFE). 값은 전부 지어낸 것.
    var HEAD = ['[SAP BOM 전개(ZPP033): 자재 999900, 플랜트 1000]', '',
        'STUFE\tIDNRK\tOJTXP\tMMSTA\tMENGE\tMMEIN\tWGBEZ60\tEBORT'].join('\n');
    var PARENT = '\t999900\tMVD>ZZTEST,LNW@DB\tE3\t\t\t완제품/MVD\t';
    function row(lv, code, name, qty, loc) {
        return '[ ' + lv + '     ]\t' + code + '\t' + name + '\tP1\t' + qty + '\tEA\t회로자재/TEST\t' + (loc || '');
    }
    // 자연 순서(깊이 우선) — 레벨1 뒤에 그 자식 레벨2가 붙는다
    var NATURAL = [HEAD, PARENT,
        row(1, '900001', 'SUB(P)>ZZ-A', 1),
        row(2, '900002', 'RES>CHP1005', 2, 'R1'),
        row(2, '900003', 'TR>FET-N', 1, 'Q1'),
        row(1, '900004', 'SCREW>M3', 4),
        row(2, '900005', 'X-TAL>24M', 1, 'X1')].join('\n');
    // 정렬된 순서 — 같은 행인데 구성부품내역 내림차순(제보 화면과 같은 모양: 레벨2가 맨 앞)
    var SORTED = [HEAD, PARENT,
        row(2, '900005', 'X-TAL>24M', 1, 'X1'),
        row(2, '900003', 'TR>FET-N', 1, 'Q1'),
        row(1, '900001', 'SUB(P)>ZZ-A', 1),
        row(1, '900004', 'SCREW>M3', 4),
        row(2, '900002', 'RES>CHP1005', 2, 'R1')].join('\n');

    sec('[1] 파싱 — 계층 성립 여부 판정');
    var pn = window._bomParseSapText(NATURAL), ps = window._bomParseSapText(SORTED);
    ok('자연 순서는 rows 5건 + 모체 1건', pn && pn.rows.length === 5 && !!pn.parent,
        pn ? 'rows=' + pn.rows.length + ' parent=' + !!pn.parent : 'null');
    ok('자연 순서 → hierarchyOk true', pn.hierarchyOk === true, String(pn.hierarchyOk));
    ok('정렬된 순서 → hierarchyOk false', ps.hierarchyOk === false, String(ps.hierarchyOk));
    ok('_bomHierarchyOk 는 행만 보고 같은 답을 낸다',
        window._bomHierarchyOk(pn.rows) === true && window._bomHierarchyOk(ps.rows) === false);

    // ── 화면에 실제로 그려 본다 ──────────────────────────────────────
    var tb = document.getElementById('bom-body');
    if (!tb) { console.error('BOM 탭 DOM(#bom-body)이 없습니다 — 프로젝트를 연 뒤 돌려주세요.'); return; }

    var saved = {
        units: window.getMcUnits, unit: window.mcActiveUnit, tabData: window.tabData,
        save: window.saveToGoogleDrive, dirty: window.markUnsaved
    };
    window.saveToGoogleDrive = function () { console.warn('[harness] 저장 차단'); };   // 킬스위치
    window.markUnsaved = function () {};
    var UNIT = '__TEST_UNIT__';
    window.getMcUnits = function () { return [UNIT]; };
    window.mcActiveUnit = UNIT;
    window.tabData = Object.assign({}, saved.tabData || {});
    window.tabData.bomByUnit = {};

    function put(parsed, extra) {
        window.tabData.bomByUnit[UNIT] = Object.assign({
            material: '999900', plant: '1000', explosion: 'multi', layout: '/KTK_LOC',
            layoutApplied: true, tcode: 'ZPP033', fetchedAt: new Date().toISOString(),
            cols: parsed.cols, parent: parsed.parent, rows: parsed.rows, totals: parsed.totals,
            truncated: parsed.truncated, totalRows: parsed.totalRows,
            _collapsed: {}, notes: {}, locations: {}
        }, extra || {});
        window.bomRender();
        return window.tabData.bomByUnit[UNIT];
    }
    var metaTxt = function () { var m = document.getElementById('bom-meta'); return m ? m.textContent : ''; };
    var lvHdrs = function () { return document.querySelectorAll('#bom-body tr.bom-lvhdr').length; };
    var dataRows = function () { return document.querySelectorAll('#bom-body tr.bom-row:not(.bom-row-top)').length; };
    var arrows = function () { return document.querySelectorAll('#bom-body tr.bom-row [onclick*="bomToggleBranch"]').length; };

    // 끝나면 반드시 원래대로 — 이 하네스가 남긴 가짜 모델이 프로젝트에 저장되면 안 된다.
    function done() {
        window.tabData = saved.tabData;
        window.getMcUnits = saved.units; window.mcActiveUnit = saved.unit;
        window.saveToGoogleDrive = saved.save; window.markUnsaved = saved.dirty;
        try { window.bomRender(); } catch (e) {}
        console.log('%c결과: ' + pass + ' 통과 / ' + fail + ' 실패', fail ? 'color:#c33;font-weight:bold' : 'color:#2a7;font-weight:bold');
        if (fail) console.log(logs);
        window.__bomHarness = { pass: pass, fail: fail, failed: logs };
    }

    try {
        sec('[2] 계층이 정상일 때 — 지금까지와 같아야 한다(무회귀)');
        put(pn, { hierarchyOk: pn.hierarchyOk });
        ok('레벨 블록 머리행이 없다', lvHdrs() === 0, 'lvhdr=' + lvHdrs());
        ok('모자 관계 화살표가 그려진다(레벨1 두 개)', arrows() === 2, 'arrows=' + arrows());
        ok('정렬 경고가 없다', metaTxt().indexOf('상·하위 관계를 복원할 수 없') === -1);

        sec('[3] 🚨 이번 사고 그대로 — store 에 hierarchyOk 가 없는 정렬된 결과');
        // 옛 조회가 저장한 데이터(= 플래그 없음)와 2026-11-05 이전 코드의 상태가 정확히 이것이다.
        var st3 = put(ps, {});   // ← hierarchyOk 를 **일부러 안 넣는다**
        ok('store 에 플래그가 없어도 계층이 깨진 걸 알아챈다', window._bomHierOk(st3) === false);
        ok('모자 관계를 그리지 않는다(화살표 0)', arrows() === 0, 'arrows=' + arrows());
        ok('레벨 블록 머리행 2개(레벨1·레벨2)', lvHdrs() === 2, 'lvhdr=' + lvHdrs());
        ok('데이터 행은 5건 그대로', dataRows() === 5, 'rows=' + dataRows());
        ok('경고가 화면에 보인다', metaTxt().indexOf('상·하위 관계를 복원할 수 없') !== -1, metaTxt().slice(0, 160));
        ok('경고가 레이아웃 이름을 말해 준다', metaTxt().indexOf('/KTK_LOC') !== -1);
        ok('경고가 고치는 방법(정렬 순서 탭)을 말해 준다', metaTxt().indexOf('정렬 순서') !== -1);

        sec('[4] 화면 ↔ 엑셀 뷰 상태 일치(접힘 키가 레벨인 모드)');
        var vis = window._bomVisibleRows(st3);
        ok('엑셀이 가져갈 행 = 화면 데이터 행 수', vis.length === dataRows(), vis.length + ' vs ' + dataRows());
        ok('레벨 오름차순으로 묶여 나온다', vis.map(function (r) { return r._level; }).join('') === '11222',
            vis.map(function (r) { return r._level; }).join(''));
        window.bomToggleLevel(2);   // 레벨 2 접기
        var vis2 = window._bomVisibleRows(window._bomStore(UNIT));
        ok('레벨2를 접으면 화면 데이터 행이 2건', dataRows() === 2, 'rows=' + dataRows());
        ok('엑셀도 같이 2건(= 행 인덱스 2번이 아니라 레벨 2가 접힌 것)', vis2.length === 2, 'vis=' + vis2.length);
        ok('남은 건 레벨1 두 건', vis2.every(function (r) { return r._level === 1; }));
        window.bomToggleLevel(2);

        sec('[4b] 백엔드가 SAP에서 직접 읽어 온 정렬 기준');
        // sap_bridge_32.py `_sap_read_alv_sort`가 계층이 깨졌을 때만 채워 준다.
        put(ps, { sortInfo: ['SELTEXT=구성부품내역 / DOWN=X'] });
        ok('무엇으로 정렬됐는지 화면에 적는다', metaTxt().indexOf('SELTEXT=구성부품내역') !== -1,
            metaTxt().slice(0, 240));
        ok('추측 문구와 실측 문구가 같이 뜬다(둘을 섞지 않는다)',
            metaTxt().indexOf('걸린 정렬') !== -1 && metaTxt().indexOf('상·하위 관계를 복원할 수 없') !== -1);
        put(ps, {});   // 구버전 백엔드 = sortInfo 없음
        ok('정렬을 못 읽었으면 그 줄을 안 띄운다', metaTxt().indexOf('걸린 정렬') === -1);

        sec('[5] 설치지점(EBORT) 연속 행이 주인을 못 찾은 경우');
        put(ps, { locOverflow: 3 });
        ok('메인 탭도 그 사실을 말한다(전엔 저장조차 안 했다)', metaTxt().indexOf('설치지점 3건') !== -1,
            metaTxt().slice(0, 200));

        sec('[6] 📍 설치지점은 레벨2(부품)에만 있다 — 접으면 안 보이는 게 정상');
        // 실측(자재 502627): 레벨1 61행 0건 / 레벨2 157행 140건 — 접힘 62행이면 Loc 칸이 0개다.
        // "location 을 못 가져온다"는 제보의 정체가 이것이었다(데이터는 멀쩡했다).
        // ⚠️ 안내 문구는 **일부러 안 띄운다**(사용자 요청, 2026-11-05) — [▾ 펼치기] 버튼이 이미 있다.
        var pl = window._bomParseSapText(NATURAL);
        var stL = put(pl, { hierarchyOk: true });
        stL._collapsed = {}; window.bomRender();
        var locFilled = function () {
            return [...document.querySelectorAll('#bom-body input[data-bom-loc]')]
                .filter(function (i) { return i.value.trim(); }).length;
        };
        ok('펼친 상태에선 설치지점 칸이 채워져 있다', locFilled() === 3, 'filled=' + locFilled());
        window.bomToggleAll(true);   // 레벨1만 보이게 접기
        ok('접으면 설치지점 칸이 하나도 안 보인다(레벨1엔 원래 없다)', locFilled() === 0, 'filled=' + locFilled());
        ok('그래도 데이터는 그대로다', stL.rows.filter(function (r) { return (r.EBORT || '').trim(); }).length === 3);
        ok('접혀 있다는 안내 줄은 띄우지 않는다', metaTxt().indexOf('하위 레벨(부품)에 있습니다') === -1,
            metaTxt().slice(0, 200));

        sec('[7] 조회 경로가 신호를 store 에 싣는가(연결부)');
        // `bomFetch` 는 SAP 이 필요해 여기서 못 돌린다 → 소스에서 그 대입이 살아 있는지를 본다.
        // (이 한 줄이 빠져 있던 게 이번 사고다. 지우면 여기서 바로 실패한다.)
        fetch('js/38-bom-tab.js').then(function (r) { return r.text(); }).then(function (src) {
            var hasMain = /hierarchyOk: parsed\.hierarchyOk/.test(src);
            var cnt = (src.match(/hierarchyOk: parsed\.hierarchyOk/g) || []).length;
            ok('메인·전자부품 두 조회 모두 hierarchyOk 를 store 에 싣는다', hasMain && cnt === 2, 'count=' + cnt);
            ok('locOverflow 도 메인 store 에 실린다', /locOverflow: parsed\.locOverflow \|\| 0,[\s\S]{0,200}layoutDiag/.test(src));
            done();
        }, function (e) { ok('소스 읽기', false, String(e)); done(); });
    } catch (e) {
        ok('하네스가 끝까지 돈다', false, String(e && e.stack || e));
        done();
    }
})();
