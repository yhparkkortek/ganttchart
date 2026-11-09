// 🖥📦 [2026-11-09] 지원 해상도 팝업(js/69) + 회차별 Sample Report(js/67) + Customer SPEC 보탬 항목 자리(js/43)
//
//  돌리는 법: 앱을 연 브라우저 콘솔에 **통째로** 붙여넣고  `await __resRoundTest()`
//
//  ⚠️⚠️ **실제 프로젝트가 열려 있으면 거부한다** — `tabData.documents` 와 `briefSpec` 을 건드리므로
//     앱 자동저장이 그 값을 NAS 에 쓸 수 있다. 빈 앱(프로젝트 안 연 상태)에서 돌릴 것.
//     `{force:true}` 로 넘길 수 있지만 그때도 저장은 막고 끝나면 원래대로 되돌린다.
//  🎯 가짜는 **바깥 경계에만** — 저장(`saveToGoogleDrive`/`markUnsavedChanges`)뿐이다.
//     해상도 카탈로그·팝업 DOM·문서 렌더·회차 전환은 전부 **진짜 코드**로 돈다.
(function () {
    'use strict';

    window.__resRoundTest = async function (opt) {
        opt = opt || {};
        var pm = window.projectMeta || {};
        if (!opt.force && (pm.모델명 || pm.고객사 || pm.프로젝트명)) {
            console.error('⛔ 실제 프로젝트가 열려 있습니다 — 빈 앱에서 돌리세요. ({force:true} 로 강제 가능)');
            return { refused: true };
        }

        var pass = 0, fail = 0, notes = [];
        var ok = function (cond, what) {
            if (cond) { pass++; } else { fail++; notes.push('❌ ' + what); console.error('❌ ' + what); }
        };

        // ── 저장 막기 (끝나면 되돌린다) ──
        var saved = {
            save: window.saveToGoogleDrive, dirty: window.markUnsavedChanges,
            docs: window.tabData && window.tabData.documents,
            res: window.tabData && window.tabData.resolutionSpecByUnit,
            custom: window.tabData && window.tabData.resolutionCustom,
            state: window._docState && JSON.parse(JSON.stringify(window._docState))
        };
        window.saveToGoogleDrive = function () { return Promise.resolve({ skipped: 'test' }); };
        window.markUnsavedChanges = function () {};
        window.tabData = window.tabData || {};
        window.tabData.documents = {};
        window.tabData.resolutionSpecByUnit = {};
        delete window.tabData.resolutionCustom;

        try {
            // ═══ 1. 해상도 카탈로그 ═══════════════════════════════════════
            ok(typeof window.resAllRows === 'function', 'js/69 가 안 실려 있다 (resAllRows 없음)');
            var rows = window.resAllRows();
            ok(rows.length > 100, '해상도가 ' + rows.length + '개뿐 — 카탈로그가 덜 실렸다');

            var seen = {}, dup = [];
            rows.forEach(function (r) { if (seen[r.key]) dup.push(r.label); seen[r.key] = 1; });
            ok(!dup.length, '열쇠가 겹친다: ' + dup.join(', '));

            // 원본 문서에 있던 `1600x1200@60` 과 `VESA 1600x1200@60` 은 **한 줄**이어야 한다
            ok(window.resKeyOf('1600×1200@60') === window.resKeyOf('VESA 1600x1200@60'),
               '같은 모드가 접두어 때문에 두 줄로 갈린다');
            // `p`(프로그레시브)는 안 적은 것과 같고, `i`(인터레이스)·`RB` 는 다른 모드다
            ok(window.resKeyOf('1920×1080p@60') === window.resKeyOf('1920×1080@60'), 'p 는 같은 모드여야 한다');
            ok(window.resKeyOf('1920×1080i@60') !== window.resKeyOf('1920×1080@60'), 'i 는 다른 모드다');
            ok(window.resKeyOf('VESA 1280×768@60 (RB)') !== window.resKeyOf('1280×768@60.3'), 'RB 는 다른 타이밍이다');
            // 주사율 실측값(59.9 / 60.3)은 반올림해서 같은 줄로 본다
            ok(window.resKeyOf('VESA 640×480@59.9') === window.resKeyOf('640×480@60'), '59.9 와 60 은 같은 줄이어야 한다');

            // 🔤 용어 — 옛 문서의 `PC` 칸은 `RGB` 로 적는다(사용자 지시)
            var pkeys = (window.RES_PORTS || []).map(function (p) { return p.key; });
            ok(pkeys.indexOf('RGB') === 0, '첫 포트가 RGB 여야 한다: ' + pkeys.join(','));
            ok(pkeys.indexOf('PC') < 0, '포트에 PC 가 남아 있다 (RGB 로 바꿔야 한다)');
            ok(pkeys.join(',') === 'RGB,DVI,HDMI,DP', '포트 구성이 문서와 다르다: ' + pkeys.join(','));

            // 새 해상도는 **코드를 안 고치고** 는다
            var before = window.resAllRows().length;
            window.tabData.resolutionCustom = ['9999×1234@61'];
            ok(window.resAllRows().length === before + 1, '사람이 보탠 해상도가 목록에 안 는다');
            delete window.tabData.resolutionCustom;

            // ═══ 2. 고르기 · 요약 ════════════════════════════════════════
            window.resSetPort('1920X1080@60', '1920×1080@60', 'HDMI', true);
            window.resSetPort('1920X1080@60', '1920×1080@60', 'DP', true);
            window.resSetPort('1280X1024@60', 'VESA 1280×1024@60', 'RGB', true);
            var sel = window.resSelectedRows();
            ok(sel.length === 2, '고른 줄이 2개여야 한다 (지금 ' + sel.length + ')');
            ok(/RGB 1 · DVI 0 · HDMI 1 · DP 1/.test(window.resSummary()), '요약이 틀렸다: ' + window.resSummary());
            // 포트를 전부 끄면 줄 자체가 사라진다(빈 줄을 문서에 찍지 않는다)
            window.resSetPort('1280X1024@60', '', 'RGB', false);
            ok(window.resSelectedRows().length === 1, '포트를 다 끈 줄이 남아 있다');

            // ═══ 3. 팝업이 진짜 DOM 에 그려지는가 ═════════════════════════
            window.resOpenPicker();
            var box = document.getElementById('respick-box');
            ok(!!box, '팝업이 안 열린다');
            var cbs = box.querySelectorAll('input[data-res]');
            ok(cbs.length === rows.length * pkeys.length,
               '칸 수가 안 맞는다: ' + cbs.length + ' ≠ ' + (rows.length * pkeys.length));
            // 이미 고른 것이 체크되어 보여야 한다
            var checked = box.querySelectorAll('input[data-res]:checked');
            ok(checked.length === 2, '고른 칸이 팝업에 안 비친다 (' + checked.length + ')');
            // 칸을 **실제로 눌러** 저장까지 가는가 (위임 핸들러를 지난다)
            var one = box.querySelector('input[data-res$="|RGB"]');
            one.checked = true;
            one.dispatchEvent(new Event('change', { bubbles: true }));
            ok(window.resSelectedRows().length === 2, '팝업에서 켠 칸이 저장에 안 들어간다');
            // 검색 — 보이는 줄만 줄어든다
            window.resFilter('2560');
            var vis = box.querySelectorAll('input[data-res]').length / pkeys.length;
            ok(vis > 0 && vis < rows.length, '검색이 안 걸린다 (' + vis + '줄)');
            window.resFilter('');
            window.resClearAll();
            ok(window.resSelectedRows().length === 0, '전부 해제가 안 된다');
            window.resClosePicker();
            ok((document.getElementById('respick-overlay') || {}).style.display === 'none', '팝업이 안 닫힌다');

            // ═══ 4. Customer SPEC 보탬 항목 자리 (js/43) ══════════════════
            ok(typeof window._bsPlaceExtraItems === 'function', 'js/43 _bsPlaceExtraItems 가 없다');
            // 🎯 자리는 **`Power estimation` 바로 위**다 (사용자 확정: "Power 위로" · "26~27 번 사이")
            var order = function (rows) { return rows.map(function (r) { return r.type; }).join(' > '); };
            var a = [{ type: 'Panel', sub: '' }, { type: 'Power estimation', sub: 'LCD Monitor' }, { type: 'Touch', sub: '' }];
            var c1 = window._bsPlaceExtraItems(a);
            ok(c1 === 2, '보탬 항목 2개가 안 들어갔다 (' + c1 + ')');
            ok(order(a) === 'Panel > F/W Version > EDID Check Sum > Power estimation > Touch',
               '보탬 항목이 Power 바로 위가 아니다: ' + order(a));
            ok(window._bsPlaceExtraItems(a) === 0, '두 번째 호출이 또 바꾼다 (멱등이 아니다)');

            // 맨 뒤에 값까지 들고 있던 옛 데이터 → **값을 지닌 채** Power 위로 올라온다
            var b = [{ type: 'Panel', sub: '' }, { type: 'Power estimation', sub: 'LCD Monitor' },
                     { type: 'F/W Version', sub: '', modelA: 'V1.02', note: '보존' },
                     { type: 'EDID Check Sum', sub: '', modelA: '0x36' }];
            window._bsPlaceExtraItems(b);
            ok(order(b) === 'Panel > F/W Version > EDID Check Sum > Power estimation', '맨 뒤에서 안 올라왔다: ' + order(b));
            ok(b[1].modelA === 'V1.02' && b[1].note === '보존', '옮기면서 값이 사라졌다');
            ok(b[2].modelA === '0x36', 'EDID 값이 사라졌다');
            ok(b.length === 4, '옮기다가 행이 늘거나 줄었다 (' + b.length + ')');

            // 🔁 회귀 — **이미 맨 위로 올라간** 프로젝트도 Power 위로 되돌아온다.
            //    (2026-11-09 에 한 번 맨 위로 올렸다가 되돌렸다. "앞에 있으면 그대로 둔다" 로
            //     짜면 이 줄이 영영 안 내려온다.)
            var c = [{ type: 'F/W Version', sub: '', modelA: 'V1.02' }, { type: 'EDID Check Sum', sub: '' },
                     { type: 'Panel', sub: '' }, { type: 'Power estimation', sub: 'LCD Monitor' }, { type: 'Touch', sub: '' }];
            window._bsPlaceExtraItems(c);
            ok(order(c) === 'Panel > F/W Version > EDID Check Sum > Power estimation > Touch',
               '맨 위에 있던 항목이 Power 위로 안 내려온다: ' + order(c));
            ok(window._bsPlaceExtraItems(c) === 0, '되돌린 뒤 멱등이 깨진다 (부를 때마다 순서가 뒤바뀐다)');
            ok(c[1].modelA === 'V1.02', '되돌리면서 값이 사라졌다');

            // 기준 행이 없는 표에서는 맨 뒤 — 조용히 엉뚱한 데 넣지 않는다
            var e = [{ type: 'Panel', sub: '' }, { type: 'Touch', sub: '' }];
            window._bsPlaceExtraItems(e);
            ok(order(e) === 'Panel > Touch > F/W Version > EDID Check Sum', 'Power 가 없을 때 자리가 이상하다: ' + order(e));

            // ═══ 5. 회차마다 Sample Report 가 따로 (js/67) ════════════════
            if (window.switchTab) window.switchTab('document');
            window._docPick('proto-req');
            window._docHistAdd(); window._docHistAdd();
            var rds = window._docRounds();
            ok(rds.length === 2 && rds[0] === 'PROTO A' && rds[1] === 'PROTO B',
               '회차 목록이 출고 이력에서 안 온다: ' + rds.join(','));

            window._docPick('sample-report');
            ok(!!document.getElementById('doc-round-bar'), '회차 바(◀ ▶)가 안 보인다');
            window._docSetRound('PROTO A');
            window._docSetField('sample-report', '제작특이사항', 'A-TEXT');
            window._docSetRound('PROTO B');
            window._docSetField('sample-report', '제작특이사항', 'B-TEXT');
            var dk = Object.keys(window.tabData.documents);
            ok(dk.indexOf('sample-report@PROTO A') >= 0 && dk.indexOf('sample-report@PROTO B') >= 0,
               '회차별 문서가 안 생긴다: ' + dk.join(','));
            ok(window.tabData.documents['sample-report@PROTO A'].fields['제작특이사항'] === 'A-TEXT'
               && window.tabData.documents['sample-report@PROTO B'].fields['제작특이사항'] === 'B-TEXT',
               '회차끼리 값이 섞인다');
            // ◀ ▶ 가 실제로 회차를 넘기는가
            window._docRoundGo(-1);
            ok(window._docState.round === 'PROTO A', '◀ 가 이전 회차로 안 간다');
            window._docRoundGo(1);
            ok(window._docState.round === 'PROTO B', '▶ 가 다음 회차로 안 간다');
            // 회차는 **이력 한 곳**에서 온다 — 서식을 바꿔도 같은 목록이어야 한다
            window._docPick('proto-req');
            ok(window._docRounds().length === 2, '서식을 바꾸니 회차 목록이 달라진다');
            // 회차 추가 = 새 문서
            window._docPick('sample-report');
            window._docRoundAdd();
            ok(window._docRounds().length === 3, '➕ 가 회차를 안 늘린다');
            ok(window._docState.round === window._docRounds()[2], '➕ 뒤에 새 회차로 안 간다');
            // 파일 이름에 회차가 들어간다(원본 실측: `…_Proto B_Sample Report_V00`)
            var form = (window.DOC_FORMS || []).filter(function (f) { return f.id === 'sample-report'; })[0];
            var nm = form.nameOf({ meta: {} });
            ok(nm.indexOf(window._docState.round) >= 0, '파일 이름에 회차가 없다: ' + nm);

            // ═══ 6. 문서에 찍히는가 ═══════════════════════════════════════
            window._docPick('proto-req');
            var txt = document.getElementById('doc-page-body').innerText;
            ok(txt.indexOf('RESOLUTION SPEC') >= 0, '문서에 해상도 구역이 없다');
            ok(txt.indexOf('샘플/시제품 의뢰서') >= 0, '출고 이력 열 이름이 "샘플/시제품 의뢰서" 가 아니다');
            ok(txt.indexOf('그룹웨어 의뢰서') < 0, '옛 열 이름(그룹웨어 의뢰서)이 남아 있다');
            ok(txt.indexOf('📑 Sample Report') >= 0, '이력 줄에서 그 회차 보고서로 가는 길이 없다');
            // 고른 해상도가 그대로 찍히는가
            window.resSetPort('1920X1080@60', '1920×1080@60', 'HDMI', true);
            window._docRender();
            txt = document.getElementById('doc-page-body').innerText;
            ok(txt.indexOf('1920×1080@60') >= 0, '고른 해상도가 문서에 안 찍힌다');
            // 엑셀 묶음(aoa)에도 같은 표가 들어가는가 — 파일은 만들지 않는다
            var aoa = window._docToAoa('proto-req');
            var hit = aoa.filter(function (r) { return r && r[1] === '1920×1080@60'; });
            ok(hit.length === 1 && hit[0][4] === 'O', '엑셀에 해상도 줄이 안 들어간다');
            var hdr = aoa.filter(function (r) { return r && r[1] === 'RESOLUTION'; })[0];
            ok(hdr && hdr[2] === 'RGB', '엑셀 머리글이 RGB 가 아니다: ' + (hdr && hdr.join('|')));

        } catch (e) {
            fail++; notes.push('💥 ' + (e && e.stack || e));
            console.error(e);
        } finally {
            // ── 원래대로 ──
            window.saveToGoogleDrive = saved.save;
            window.markUnsavedChanges = saved.dirty;
            if (saved.docs) window.tabData.documents = saved.docs; else delete window.tabData.documents;
            if (saved.res) window.tabData.resolutionSpecByUnit = saved.res; else delete window.tabData.resolutionSpecByUnit;
            if (saved.custom) window.tabData.resolutionCustom = saved.custom; else delete window.tabData.resolutionCustom;
            if (saved.state) window._docState = saved.state;
            try { window._docRender && window._docRender(); } catch (e2) { /* 〃 */ }
        }

        console.log((fail ? '❌' : '✅') + ' 지원 해상도 · 회차별 보고서: ' + pass + '/' + (pass + fail));
        notes.forEach(function (n) { console.log('   ' + n); });
        return { pass: pass, fail: fail, notes: notes };
    };

    console.log('🖥📦 준비됨 — `await __resRoundTest()` 를 치세요 (빈 앱에서).');
})();
