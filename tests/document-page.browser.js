// 📄 Document 페이지(js/67) + 생성 엔진(js/66) 검증 하네스
//
//  돌리는 법: 앱을 열고 콘솔에 붙여넣은 뒤 `await __docPageTest()`
//            실제 프로젝트가 열려 있으면 **거부한다** → `await __docPageTest({force:true})`
//
//  ■ 무엇을 진짜로 돌리나
//    · js/67 은 진짜다 — `_docRender`(실제 DOM 에 그린다)·입력 위임·`_docSetField`·
//      `_docResetField`·`_docToAoa`·`_docExport` 까지 지난다.
//    · 엑셀은 **진짜 XLSX 로 만들고** 받은 바이트를 zip 으로 뜯어 시트까지 확인한다.
//    · 가짜는 **바깥 경계 넷**뿐: `XLSX.writeFile`·`PptxGenJS.writeFile`(내려받기)
//      · `fetch`(/doc/put)  · `confirm`(덮어쓰기). → **NAS 에 안 올라가고 파일도 안 받아진다.**
//
//  ■⚠️ 왜 "실제 프로젝트가 열려 있으면 거부"하나
//    `projectMeta`/`tabData` 를 합성값으로 바꿔치기한다. 실제 프로젝트가 열려 있으면
//    앱 자동저장이 그 합성값을 NAS 에 쓸 수 있다 → 저장은 킬스위치로 막고, 끝나면 되돌린다.
(function () {
    'use strict';

    var OK = 0, FAIL = 0, LOG = [];
    var ok = function (n, c, x) {
        if (c) { OK++; LOG.push('  ✅ ' + n); } else { FAIL++; LOG.push('  ❌ ' + n + (x ? '  → ' + x : '')); }
    };
    var eq = function (n, got, want) {
        ok(n + ' (' + JSON.stringify(want) + ')', String(got) === String(want), '실제: ' + JSON.stringify(got));
    };
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    var FAKE_META = {
        프로젝트코드: 'G0000TT', 프로젝트명: 'TESTBUYER>TESTPROJ', 고객사: 'TESTBUYER',
        모델명: 'TESTPROJ', 인치: '15.6', KTKPN: '500000', KTK모델명: 'KTTEST01',
        PN_모델명: 'BTN-P>KTTEST01,TEST@VINA', 프로젝트담당자: '총괄자', HW담당자: '회로자',
        기구담당자: '기구자', FW담당자: '펌웨어자', 팀: '개발3팀'
    };
    var FAKE_TAB = {
        summary: { purpose: '시험 목적', volume: '4,000대/년', mpDate: '2026년 7월',
                   milestones: { ProtoDR: { date: '2025-09-30' }, PRA: { date: '2026-09-30' } } },
        // ⚠️ 항목 이름은 **참조 엑셀의 실제 이름**이다(실측) — 지어낸 이름으로 적으면
        //    하네스만 통과하고 앱에선 한 칸도 안 채워진다.
        briefSpec: [
            { type: 'Color coordinate(x/y)', sub: '', modelA: '0.305 / 0.335', note: 'LNW SPEC' },
            { type: 'Brightness(Centre. Min)', sub: '', modelA: '500~550', note: '' },
            { type: 'F/W Version', sub: '', modelA: 'TULW138IS02', note: '' },
            { type: 'EDID Check Sum', sub: '', modelA: 'DP 0x36', note: '' },
            { type: 'Panel', sub: '', modelA: 'Innolux TEST-L01', note: 'KTK note A' }
        ],
        projectModels: [{ materials: [
            { category: 'PANEL',         ktkPn: '131475', description: 'FOG IPS>TEST-PANEL' },
            { category: 'AD BOARD',      ktkPn: '303194', description: 'PBA-AD>TULIP-TEST' },
            { category: 'CONVERTER',     ktkPn: '303237', description: 'PBA-CNV>KCB-TEST' },
            { category: 'TOUCH / GLASS', ktkPn: '303245', description: 'TSP PCT ASSY>TEST' },
            { category: 'TOUCH CTRL',    ktkPn: '303223', description: 'PBA-T>FLAMINGO-TEST' }
        ] }],
        projectMembers3: [{ name: '영업담당', role: '영업 담당자' }]
    };

    /** 만든 .xlsx(zip)를 뜯어 시트 이름만 확인한다 — "만들었다"는 반환값은 증거가 아니다. */
    async function zipNames(buf) {
        var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
        for (var i = u8.length - 22; i >= 0 && i > u8.length - 70000; i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) return null;
        var count = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), out = [];
        for (var n = 0; n < count; n++) {
            if (dv.getUint32(off, true) !== 0x02014b50) break;
            var nl = dv.getUint16(off + 28, true);
            out.push(new TextDecoder().decode(u8.slice(off + 46, off + 46 + nl)));
            off += 46 + nl + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
        }
        return out;
    }

    window.__docPageTest = async function (opt) {
        opt = opt || {};
        OK = 0; FAIL = 0; LOG = [];
        LOG.push('📄 Document 페이지 검증');

        if (typeof window._docRender !== 'function') {
            console.log('❌ js/67 이 로드되지 않았습니다 (_docRender 없음).'); return { ok: 0, fail: 1 };
        }
        if (!document.getElementById('doc-page-body')) {
            console.log('❌ Document 탭이 HTML 에 없습니다 (#doc-page-body).'); return { ok: 0, fail: 1 };
        }
        var live = String((window.projectMeta || {}).프로젝트명 || '').trim();
        if (live && !opt.force) {
            console.log('⛔ 실제 프로젝트가 열려 있습니다: "' + live + '"\n'
                + '   이 하네스는 projectMeta/tabData 를 합성값으로 바꿉니다 — 앱 자동저장이 그걸\n'
                + '   NAS 에 쓸 수 있습니다. 새로고침 직후(프로젝트 안 연 상태)에 돌리세요.\n'
                + '   그래도 돌리려면: await __docPageTest({force:true})');
            return { ok: 0, fail: 0, refused: true };
        }

        var realSave = window.saveToGoogleDrive, realAuto = window.autoSaveCurrentSnapshot,
            realCollect = window.collectTabData, realToast = window.showToast,
            realMeta = window.projectMeta, realTab = window.tabData,
            realFetch = window.fetch, realConfirm = window.confirm,
            realXW = (typeof XLSX !== 'undefined') ? XLSX.writeFile : null,
            realPW = (typeof PptxGenJS !== 'undefined') ? PptxGenJS.prototype.writeFile : null,
            realState = window._docState, realUnit = window.mcActiveUnit;
        var puts = [], confirmAnswer = false, wroteX = null, wroteP = null;

        window.saveToGoogleDrive = function () { console.warn('[document-page harness] 저장 차단됨'); return Promise.resolve(); };
        window.autoSaveCurrentSnapshot = function () {};
        window.collectTabData = function () {};   // 화면을 읽어 합성값을 덮지 못하게
        window.showToast = function () {};
        window.confirm = function () { return confirmAnswer; };

        try {
            window.projectMeta = JSON.parse(JSON.stringify(FAKE_META));
            window.tabData = JSON.parse(JSON.stringify(FAKE_TAB));
            window._docState = { formId: 'proto-req', stage: 'Proto DR' };
            window._docRender();
            await sleep(60);
            var body = document.getElementById('doc-page-body');
            var q = function (k) { return body.querySelector('input[data-doc-key="' + k + '"]'); };

            // ── A. 서식이 페이지로 펼쳐지는가 ──
            LOG.push(''); LOG.push('── A. 문서 초안이 페이지에 펼쳐지는가 ──');
            var titles = [].slice.call(body.querySelectorAll('.doc-sec'))
                .map(function (d) { return d.textContent.trim(); });
            // 📦 출고이력 · 시제품 제작의뢰서 · 광학/펌웨어 · 지원 해상도 · 주요자재 · 요청사항 · 참고자료
            //    (2026-11-11: `# 지원 해상도` 가 늘어 6 → 7 — 옛 기대값이 그대로 남아 있었다)
            eq('구역 7개가 그려진다(+샘플 출고 이력·지원 해상도)', titles.length, 7);
            ok('주요자재 표가 5행이다',
               [].slice.call(body.querySelectorAll('input[data-doc-key$="|코드"]')).length === 5);
            var toolsTxt = document.getElementById('doc-header-tools').textContent;
            // 💾 [2026-11-11 사용자 요청] `🖨 문서 출력` 버튼은 **없앴다**(브라우저 Ctrl+P 로 대체)
            //    — 그 자리는 실측 원본과 같은 **Word 문서**로 저장하는 `원본저장` 이다.
            ok('헤더에 원본저장(.docx) 버튼이 있다', /원본저장/.test(toolsTxt), toolsTxt);
            ok('옛 문서 출력 버튼은 없다', !/문서 출력/.test(toolsTxt), toolsTxt);
            ok('엑셀은 옵션으로 있다', /엑셀/.test(toolsTxt), toolsTxt);
            ok('시제품 제작의뢰서엔 PPT 버튼이 없다', !/PPT/.test(toolsTxt), toolsTxt);
            // 📄 문서 고르기는 **드롭다운**이다(PARTS 와 같은 방식)
            ok('드롭다운 트리거가 있다', !!document.getElementById('doc-form-trigger'));
            window._toggleDocFormDropdown();
            var dd = document.getElementById('doc-form-dropdown');
            ok('드롭다운이 열린다', dd && dd.style.display === 'block');
            // 🙈 [2026-11-11 사용자 결정] 드롭다운엔 **보이는 서식만** — 시제품 제작의뢰서는
            //    Sample Report 가 품고 있어서 둘 다 있으면 같은 문서를 두 번 쓰는 것처럼 보였다.
            var VIS = window._docVisibleForms();
            eq('드롭다운에 보이는 문서가 전부 나온다',
               [].slice.call(dd.querySelectorAll('div')).length, VIS.length);
            ok('숨긴 서식은 드롭다운에 없다',
               (window.DOC_FORMS || []).filter(function (f) { return f.hidden; })
                   .every(function (f) { return dd.textContent.indexOf(f.label) < 0; }), dd.textContent);
            ok('숨긴 서식이 하나라도 있다(이 검사가 헛돌지 않게)',
               VIS.length < (window.DOC_FORMS || []).length);
            window._docPick('proto-req');
            // ⚠️⚠️ 두 번 속는 자리다 — ① 고르면 **다시 그려서 팝업 요소가 바뀐다**(들고 있던
            //    `dd` 는 떨어져 나간 옛 노드다) ② 새 노드는 inline `display` 가 **빈 문자열**이고
            //    안 보이게 하는 건 `.row-action-popup` **CSS** 다. 그래서 `style.display==='none'`
            //    으로 보면 **닫혀 있는데도 실패**한다 — 눈에 보이는가는 computed 로 재라.
            var dd2 = document.getElementById('doc-form-dropdown');
            ok('고르면 드롭다운이 닫힌다', dd2 && getComputedStyle(dd2).display === 'none',
               dd2 ? ('inline="' + dd2.style.display + '" computed=' + getComputedStyle(dd2).display) : 'no node');
            // ⚠️ 마지막으로 본 서식이 숨겨졌어도 **그걸 열지 않는다**(목록에 없는 문서가 뜬다)
            var keepLast = null;
            try {
                keepLast = localStorage.getItem('gantt_doc_last_form');
                localStorage.setItem('gantt_doc_last_form', 'proto-req');
            } catch (e) { /* 무시 */ }
            window._docState = { formId: null, stage: 'Proto DR' };
            window._docRender();
            ok('숨긴 서식을 기본으로 열지 않는다', window._docState.formId !== 'proto-req',
               String(window._docState.formId));
            try {                                   // 사람이 쓰던 값을 돌려 놓는다
                if (keepLast === null) localStorage.removeItem('gantt_doc_last_form');
                else localStorage.setItem('gantt_doc_last_form', keepLast);
            } catch (e) { /* 무시 */ }
            window._docPick('proto-req');           // 아래 검사들이 보는 화면으로 되돌린다
            await sleep(30);
            // 🎨 문서 스타일 — 흰 종이 + 구역 띠(원본 문서와 비슷하게)
            ok('흰 종이 영역이 있다', !!body.querySelector('.doc-paper'));
            // 🎨 구역 띠 색을 **고정 hex 로 검사하지 않는다** — 팔레트(js/21)를 따라 바뀌는 게 맞다.
            //    불변식은 "칠해져 있고, 헤더 박스와 **같은 팔레트 색**이다"(둘 다 `gen.bg`).
            var secBg = getComputedStyle(body.querySelector('.doc-sec')).backgroundColor;
            var hdrBg = getComputedStyle(document.getElementById('doc-header-box')).backgroundColor;
            ok('구역 띠가 칠해져 있다', !!secBg && secBg !== 'rgba(0, 0, 0, 0)' && secBg !== 'transparent', secBg);
            ok('구역 띠가 헤더와 같은 팔레트 색이다', secBg === hdrBg, secBg + ' vs ' + hdrBg);
            // 색이 **클래스**로 와야 팔레트가 덮을 수 있다 — 주입 <style> 이 남아 있으면 안 된다
            ok('주입 <style> 없이 styles.css 가 맡는다', !document.getElementById('doc-page-style'));

            // ── B. 기본 정보가 자동으로 표시되는가 ──
            LOG.push(''); LOG.push('── B. 기본 정보 자동 표시 ──');
            eq('프로젝트 코드', q('프로젝트 코드').value, 'G0000TT');
            eq('제품 코드', q('제품 코드').value, '500000');
            eq('모 델 명', q('모 델 명').value, 'BTN-P>KTTEST01,TEST@VINA');
            eq('B U Y E R', q('B U Y E R').value, 'TESTBUYER');
            // ⚠️ 담당자는 `_dgCollect` 가 meta 로 꺼내 줘야 채워진다(처음에 안 꺼내 3칸이 비었다)
            eq('모델 담당자(HW)', q('모델 담당자').value, '회로자');
            eq('기구 담당자', q('기구 담당자').value, '기구자');
            eq('FW 담당자', q('FW 담당자').value, '펌웨어자');
            eq('Lv (Customer SPEC)', q('Lv').value, '500~550');
            eq('주요자재 PANEL 코드', q('LCM(Panel)|코드').value, '131475');
            eq('주요자재 TOUCH CTRL 내역', q('TSP CTRL|부품명').value, 'PBA-T>FLAMINGO-TEST');
            ok('사람이 적는 칸은 비어 있다', !q('총 제작수량').value && !q('제작 회차').value);
            // 출처는 **사람이 읽을 말**이어야 한다 — 내부 경로를 노출하지 않는다
            var srcTexts = [].slice.call(body.querySelectorAll('div'))
                .map(function (d) { return d.textContent.trim(); }).filter(function (t) { return /^📘/.test(t); });
            ok('출처가 보인다', srcTexts.length >= 5, String(srcTexts.length));
            ok('출처에 내부 경로가 안 보인다',
               !srcTexts.some(function (t) { return /meta\.|overview\./.test(t); }),
               JSON.stringify(srcTexts.slice(0, 3)));

            // ── C. 사용자가 추가 기입 → 저장 → 되돌리기 ──
            LOG.push(''); LOG.push('── C. 추가 기입 · 저장 · 되돌리기 ──');
            var t1 = q('총 제작수량');
            t1.value = '36 (24고객+12개발검토)';
            t1.dispatchEvent(new Event('input', { bubbles: true }));
            ok('사람이 적은 값이 프로젝트에 저장된다',
               (((window.tabData.documents || {})['proto-req'] || {}).fields || {})['총 제작수량'] === '36 (24고객+12개발검토)',
               JSON.stringify((window.tabData.documents || {})['proto-req']));
            window._docRender(); await sleep(30);
            eq('다시 그려도 남아 있다', q('총 제작수량').value, '36 (24고객+12개발검토)');

            var m1 = q('기구 담당자');
            m1.value = '다른사람'; m1.dispatchEvent(new Event('input', { bubbles: true }));
            window._docRender(); await sleep(30);
            eq('자동값을 덮어쓸 수 있다', q('기구 담당자').value, '다른사람');
            // ⚠️ 자동값과 같아지면 저장에서 빠져야 한다 — 안 그러면 앱 값이 바뀌어도 문서가 옛값을 든다
            var m2 = q('기구 담당자');
            m2.value = '기구자'; m2.dispatchEvent(new Event('input', { bubbles: true }));
            ok('자동값과 같아지면 저장에서 빠진다',
               !('기구 담당자' in (window.tabData.documents['proto-req'].fields || {})),
               JSON.stringify(Object.keys(window.tabData.documents['proto-req'].fields)));

            window._docSetField('proto-req', '기구 담당자', '또다른사람');
            window._docResetField('proto-req', '기구 담당자');
            await sleep(30);
            eq('↺ 되돌리면 앱 값으로', q('기구 담당자').value, '기구자');

            // ── D. 엑셀 출력 — 서식에서 바로 (모든 문서 공통) ──
            LOG.push(''); LOG.push('── D. 엑셀 출력 (기본) ──');
            if (typeof XLSX === 'undefined') { ok('XLSX 로드됨', false); }
            else {
                XLSX.writeFile = function (wb, name) { wroteX = { name: name, sheets: wb.SheetNames }; };
                await window._docExport('xlsx');
                ok('엑셀 내려받기가 불렸다', !!wroteX, String(wroteX));
                ok('파일 이름이 .xlsx 다', /\.xlsx$/.test((wroteX || {}).name || ''), (wroteX || {}).name);
                ok('시트 이름이 문서 이름이다', ((wroteX || {}).sheets || [])[0] === '시제품 제작의뢰서',
                   JSON.stringify((wroteX || {}).sheets));
                var aoa = window._docToAoa('proto-req');
                ok('엑셀에 자동값이 들어간다',
                   aoa.some(function (r) { return r[1] === 'G0000TT'; }));
                ok('엑셀에 사람이 적은 값이 들어간다',
                   aoa.some(function (r) { return String(r[1] || '').indexOf('36 (24고객') >= 0; }));
                ok('엑셀에 주요자재 표가 들어간다',
                   aoa.some(function (r) { return r[0] === 'LCM(Panel)' && r[1] === '131475'; }));
                ok('구역 제목이 엑셀에도 있다',
                   aoa.some(function (r) { return r.length === 1 && r[0] === '# 주요자재'; }));
                // 진짜 바이트로 만들어 zip 을 뜯어 본다
                var wb2 = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(aoa), 'T');
                var names = await zipNames(XLSX.write(wb2, { bookType: 'xlsx', type: 'array' }).buffer
                    || XLSX.write(wb2, { bookType: 'xlsx', type: 'array' }));
                ok('진짜 xlsx(zip) 가 만들어진다', !!names && names.some(function (n) { return /sheet1\.xml$/.test(n); }),
                   JSON.stringify((names || []).slice(0, 4)));
            }

            // ── D-2. Sample Report · 첨부 구역 ──
            LOG.push(''); LOG.push('── D-2. Sample Report · 첨부 ──');
            window._docPick('sample-report'); await sleep(60);
            var sbody = document.getElementById('doc-page-body');
            var ssecs = [].slice.call(sbody.querySelectorAll('.doc-sec')).map(function (d) { return d.textContent.trim(); });
            ok('Sample Report 구역이 10개 넘는다', ssecs.length >= 10, String(ssecs.length));
            ok('제품 외관·내부·문제점 구역이 있다',
               ssecs.indexOf('# 제품 외관') >= 0 && ssecs.indexOf('# 제품 내부') >= 0
               && ssecs.indexOf('# 문제점 개선 요청') >= 0, JSON.stringify(ssecs));
            var zones = [].slice.call(sbody.querySelectorAll('[data-doc-att]'))
                .map(function (z) { return z.getAttribute('data-doc-att'); });
            eq('첨부 구역 4개', zones.length, 4);
            ok('첨부 올리기 버튼이 구역마다 있다',
               [].slice.call(sbody.querySelectorAll('button'))
                 .filter(function (b) { return /첨부/.test(b.textContent); }).length === 4);
            // ⚠️ 시제품 제작의뢰서 표는 **한 번 만들어 양쪽이 같이 쓴다**(베끼지 않는다)
            ok('시제품 제작의뢰서 표를 같이 들고 있다', ssecs.indexOf('# 주요자재') >= 0);

            // ── D-3. 광학·F/W·EDID 는 Customer SPEC **실측 이름**에서 온다 ──
            LOG.push(''); LOG.push('── D-3. 광학 · F/W · EDID (Customer SPEC 실측 이름) ──');
            window._docPick('proto-req'); await sleep(60);
            var q2 = function (k) { return document.querySelector('#doc-page-body input[data-doc-key="' + k + '"]'); };
            // ⚠️⚠️ 색좌표는 **한 항목에 x/y 가 같이** 들어 있다(`0.305 / 0.335`).
            //    처음엔 '색좌표 X' 처럼 **지어낸 이름**으로 찾아 한 칸도 안 맞았다 — 실측 이름으로만.
            eq('X 는 Color coordinate(x/y) 에서 쪼개진다', q2('X').value, '0.305');
            eq('Y 도 같은 항목에서', q2('Y').value, '0.335');
            eq('Lv = Brightness(Centre. Min)', q2('Lv').value, '500~550');
            eq('FW Ver = F/W Version', q2('FW Ver').value, 'TULW138IS02');
            eq('EDID = EDID Check Sum', q2('EDID CHECK SUM').value, 'DP 0x36');
            ok('Customer SPEC 보탬 항목이 카탈로그에 있다',
               (window.BS_EXTRA_ITEMS || []).length === 2, JSON.stringify(window.BS_EXTRA_ITEMS));

            // ── D-4. 📦 샘플 출고 이력 · 🔎 그룹웨어 의뢰서 고르기 ──
            LOG.push(''); LOG.push('── D-4. 샘플 출고 이력 ──');
            var realConfirm2 = window.confirm;
            window.confirm = function () { return true; };
            window._docHistAdd(); window._docHistAdd(); window._docHistAdd();
            await sleep(40);
            var hist = (window.tabData.documents['proto-req'] || {}).history || [];
            eq('회차 3줄이 생긴다', hist.length, 3);
            // ⚠️ 회차는 **고르는 값이 아니라 적는 값**이다 — 기본값만 채우고 자유 수정(거래선마다 다르다)
            eq('기본 회차가 PROTO A/B/C 로 붙는다', hist.map(function (r) { return r.stage; }).join(','),
               (window.DOC_SAMPLE_STAGES || []).slice(0, 3).join(','));
            var qi = document.querySelector('#doc-page-body input[data-doc-hist="0|qty"]');
            var di = document.querySelector('#doc-page-body input[data-doc-hist="0|date"]');
            ok('출고 일자 칸이 날짜 입력이다', di && di.type === 'date', di && di.type);
            qi.value = '24'; qi.dispatchEvent(new Event('input', { bubbles: true }));
            eq('수량이 저장된다', (window.tabData.documents['proto-req'].history[0] || {}).qty, '24');
            // 회차를 자유롭게 고칠 수 있다(ES/PP 등)
            var si = document.querySelector('#doc-page-body input[data-doc-hist="1|stage"]');
            si.value = 'ES'; si.dispatchEvent(new Event('input', { bubbles: true }));
            eq('회차를 자유 입력할 수 있다', window.tabData.documents['proto-req'].history[1].stage, 'ES');
            // 삭제
            window._docHistDel(2); await sleep(30);
            eq('이력을 지울 수 있다', (window.tabData.documents['proto-req'].history || []).length, 2);
            // 🔎 그룹웨어 고르기 — fetch 는 가짜다(그룹웨어에 요청이 안 간다)
            var realFind = window._apvFindProjectDocs;
            window._apvFindProjectDocs = async function () {
                return { keyword: 'TESTPROJ', total: 9, docs: [
                    { docNum: 'M3T-2608-011', draftedAt: '2026-08-05T10:00:00+09:00',
                      formName: '샘플/시제품 의뢰서', drafterName: '김대환', title: 'Rev. B FA 샘플 의뢰서' }] };
            };
            var realEnsure = window._gwEnsureLogin;
            window._gwEnsureLogin = async function () { return { ok: true }; };
            await window._docGwPick(0); await sleep(60);
            ok('고르기 모달이 열린다',
               document.getElementById('docgw-overlay') &&
               document.getElementById('docgw-overlay').style.display === 'flex');
            window._docGwChoose(0); await sleep(60);
            var h0 = window.tabData.documents['proto-req'].history[0];
            eq('고른 문서번호가 들어간다', h0.doc, 'M3T-2608-011');
            ok('문서 제목도 같이 들어간다', !!h0.docTitle, JSON.stringify(h0));
            // ⚠️ 출고 일자가 비어 있으면 기안일로 채워 준다(사람이 고칠 수 있다)
            eq('빈 출고 일자는 기안일로 채워진다', h0.date, '2026-08-05');
            ok('고르면 모달이 닫힌다',
               document.getElementById('docgw-overlay').style.display === 'none');
            // 엑셀에도 이력이 들어간다
            var aoaH = window._docToAoa('proto-req');
            ok('엑셀에 출고 이력이 들어간다',
               aoaH.some(function (r) { return r[3] === 'M3T-2608-011'; }),
               JSON.stringify(aoaH.filter(function (r) { return r[0] === 'PROTO A'; })));
            window._apvFindProjectDocs = realFind;
            window._gwEnsureLogin = realEnsure;
            window.confirm = realConfirm2;
            window.tabData.documents['proto-req'].history = [];

            // ── E. 이미 만든 종류(DR/DVR)도 같은 페이지에서 ──
            LOG.push(''); LOG.push('── E. DR / DVR 발표자료 ──');
            window._docPick('stage-dr'); await sleep(40);
            var tools = document.getElementById('doc-header-tools').textContent;
            ok('DR/DVR 에는 PPT 버튼이 생긴다', /PPT/.test(tools), tools);
            ok('엑셀 버튼도 그대로 있다', /엑셀/.test(tools), tools);
            var b2 = document.getElementById('doc-page-body').textContent;
            ok('PROJECT SCHEDULE 구역이 보인다', b2.indexOf('PROJECT SCHEDULE') >= 0);
            ok('마일스톤 날짜가 보인다', b2.indexOf('2025-09-30') >= 0);
            ok('조직도에 멤버가 보인다', b2.indexOf('기구자') >= 0 && b2.indexOf('영업담당') >= 0);
            ok('단계 칩 4개', [].slice.call(document.getElementById('doc-page-body').querySelectorAll('button'))
                .filter(function (b) { return /DR|DVR|PRA/.test(b.textContent); }).length === 4);
            if (realPW) {
                PptxGenJS.prototype.writeFile = async function (o) {
                    var b = await this.write({ outputType: 'arraybuffer' });
                    wroteP = { name: o.fileName, bytes: b.byteLength };
                    return o.fileName;
                };
                await window._docExport('pptx');
                ok('PPT 가 만들어진다', !!wroteP && wroteP.bytes > 20000, JSON.stringify(wroteP));
                ok('PPT 이름에 단계가 들어간다', /Proto DR/.test((wroteP || {}).name || ''), (wroteP || {}).name);
            }
            var aoaDr = window._docToAoa('stage-dr');
            ok('DR 도 엑셀이 나온다(서식에서 바로)', aoaDr.length > 15, String(aoaDr.length));
            ok('DR 엑셀에 마일스톤 줄이 있다', aoaDr.some(function (r) { return r[0] === '계획'; }));

            // ── F. NAS 업로드 — 확인 없이 덮어쓰지 않는지 ──
            LOG.push(''); LOG.push('── F. NAS 업로드 ──');
            var nextStatus = 200;
            window.fetch = async function (url, init) {
                var s = String(url);
                if (s.indexOf('/doc/put') < 0) return realFetch.apply(window, arguments);
                puts.push(s);
                if (nextStatus === 409) {
                    return { ok: false, status: 409, json: async function () {
                        return { ok: false, exists: true, error: '같은 이름의 파일이 이미 있습니다' }; } };
                }
                return { ok: true, status: 200, json: async function () {
                    return { ok: true, folder: 'DOCUMENT', name: 'x.xlsx', size: 4321 }; } };
            };
            window._docPick('proto-req'); await sleep(30);
            puts.length = 0; nextStatus = 200;
            await window._docExport('nas');
            eq('업로드 호출 1회', puts.length, 1);
            // 📁 [2026-11-09] 문서는 **프로젝트마다 폴더**에 들어간다(사용자 결정).
            //    ⚠️ `고객사` 에 `>` 가 들어 있어도(실측 `LNW>STELLAR32`) 폴더 이름이 깨지면 안 된다.
            ok('folder 가 DOCUMENT/<프로젝트> 다',
               /folder=DOCUMENT%2F/.test(puts[0] || ''), puts[0]);
            // 🗂 [2026-11-11 신고 "신규 프로젝트 폴더 형식이 기존 것들과 상이함 / 프로젝트 코드는
            //    포함되지 않았음"] 폴더 이름은 **앱 공용 규칙**(`_dsCurrentProjectFolderName`, js/48)을
            //    따른다 — CUSTOMER·SUMMARY 와 같은 꼴이어야 하고 **프로젝트 코드는 안 들어간다**.
            //    프로젝트를 안 열었으면 `고객사_모델명` 으로 떨어진다(그게 지금 하네스 상황).
            var EXP = 'DOCUMENT/' + (window._dsCurrentProjectFolderName && window._dsCurrentProjectFolderName()
                        ? window._dsCurrentProjectFolderName()
                        : (FAKE_META['고객사'] + '_' + FAKE_META['모델명']).replace(/[\\/:*?"<>|]/g, '-'));
            ok('폴더 이름이 앱 공용 규칙과 같다',
               String(window._docFolderOf() || '').indexOf(EXP) === 0,
               window._docFolderOf() + ' vs ' + EXP);
            ok('폴더 이름에 프로젝트 코드가 안 들어간다',
               (window._docFolderOf() || '').indexOf('G0000TT') < 0, window._docFolderOf());
            ok('폴더 이름에 금지 문자가 없다',
               !/[\\:*?"<>|]/.test(String(window._docFolderOf() || '').replace(/^DOCUMENT\//, '')),
               window._docFolderOf());
            ok('처음엔 overwrite 를 안 붙인다', (puts[0] || '').indexOf('overwrite=1') === -1, puts[0]);

            puts.length = 0; nextStatus = 409; confirmAnswer = false;
            await window._docExport('nas');
            eq('409 + 거절 → 요청 1회뿐', puts.length, 1);
            ok('⚠️ 거절했으면 덮어쓰기 요청이 없다',
               !puts.some(function (p) { return p.indexOf('overwrite=1') >= 0; }), JSON.stringify(puts));

            puts.length = 0; nextStatus = 409; confirmAnswer = true;
            await window._docExport('nas');
            eq('409 + 승인 → 요청 2회', puts.length, 2);
            ok('두 번째는 overwrite=1', (puts[1] || '').indexOf('overwrite=1') >= 0, puts[1]);
            confirmAnswer = false;

            // ── G. 🏷 모델(제품구분자)별 문서 분리 (2026-11-13 요청) ──
            //    "Document 페이지 문서는 Summary 에 등록된 모델(MVD/TVD/TPR…)별로 나와야 함"
            //    M.C/BOM/Customer SPEC 과 같은 `window.mcActiveUnit` 을 공유한다.
            LOG.push(''); LOG.push('── G. 모델(제품구분자)별 문서 분리 ──');
            window.tabData.mcUnits = [];
            window.mcActiveUnit = '';
            window._docPick('proto-req'); await sleep(30);
            ok('모델을 하나도 안 늘린 프로젝트는 모델 바가 안 보인다',
               !document.getElementById('doc-header-tools').querySelector('.unit-cycle-btn[onclick*="docCycleUnit"]'));
            window.tabData.mcUnits = ['MVD', 'TVD'];
            window.mcActiveUnit = 'MVD';
            window._docRender(); await sleep(30);
            var unitBtn = document.getElementById('doc-header-tools').querySelector('.unit-cycle-btn[onclick*="docCycleUnit"]');
            ok('모델이 둘 이상이면 모델 바가 보인다', !!unitBtn, document.getElementById('doc-header-tools').textContent);
            ok('모델 바에 지금 모델명이 보인다', unitBtn && unitBtn.textContent.trim() === 'MVD', unitBtn && unitBtn.textContent);
            // ⚠️ '기구 담당자'는 자동값(`meta.기구담당자`)이 있는 칸이라 **프로젝트 전체 공통값**을
            //    보여 주는 게 맞다(위 B절에서 이미 확인) — 모델별 분리를 보려면 자동값도 없고
            //    위 섹션에서 손댄 적도 없는 깨끗한 칸('제작 회차')으로 확인해야 한다
            //    ('총 제작수량'은 C절에서 이미 값을 넣어 둬서, 거기서 새 모델을 시험하면
            //    "모델 분리 전 값을 이어받는다"(이관, 의도된 동작)와 "비어 있다"가 헷갈린다).
            var FK = '제작 회차';
            window._docSetField('proto-req', FK, 'MVD-전용');
            eq('MVD 몫에 저장된다', (window.tabData.documents['proto-req#MVD'] || {}).fields[FK], 'MVD-전용');
            ok('MVD 문서 열쇠엔 #MVD 가 붙는다', 'proto-req#MVD' in window.tabData.documents);
            window.docCycleUnit();                    // MVD → TVD
            eq('다음 모델로 전환된다', window.mcActiveUnit, 'TVD');
            ok('모델 바 글자도 같이 바뀐다',
               document.getElementById('doc-header-tools').querySelector('.unit-cycle-btn[onclick*="docCycleUnit"]').textContent.trim() === 'TVD');
            var q3 = function (k) { return document.querySelector('#doc-page-body input[data-doc-key="' + k + '"]'); };
            ok('새 모델은 그 모델만의 문서라 전 모델 값을 안 보여준다(값이 비어 있다)',
               !q3(FK).value, q3(FK).value);
            window._docSetField('proto-req', FK, 'TVD-전용');
            window.docCycleUnit();                    // TVD → MVD (모델 2개뿐이라 한 번이면 돌아온다)
            eq('MVD 로 되돌아온다', window.mcActiveUnit, 'MVD');
            window._docRender(); await sleep(30);
            eq('MVD 몫은 그대로 — TVD 를 적어도 안 섞인다', q3(FK).value, 'MVD-전용');
            ok('TVD 몫도 따로 남아 있다',
               (window.tabData.documents['proto-req#TVD'] || {}).fields[FK] === 'TVD-전용');

            // ⚠️ 모델 분리 **전**에 이미 적어 둔 문서(열쇠에 #모델 없음)는 잃지 않는다 —
            //    그 모델로 처음 들어올 때 한 번 베껴 담는다(이관, js/43 과 같은 방식).
            window.mcActiveUnit = '';
            window._docSetField('sample-report', '제 목', '모델분리 전 제목');
            window.tabData.mcUnits.push('BRANDNEW');
            window.mcActiveUnit = 'BRANDNEW';
            var q4 = function (k) { return document.querySelector('#doc-page-body input[data-doc-key="' + k + '"]'); };
            window._docPick('sample-report'); await sleep(30);
            eq('처음 보는 모델도 모델 구분 전 옛 문서를 이어받는다', q4('제 목').value, '모델분리 전 제목');
            window._docSetField('sample-report', '제 목', 'BRANDNEW 전용으로 수정');
            ok('옛 문서(모델 없음)는 그대로 — 이관은 복사지 이동이 아니다',
               (window.tabData.documents['sample-report@' + window._docState.round] || {}).fields['제 목'] === '모델분리 전 제목',
               JSON.stringify(window.tabData.documents['sample-report@' + window._docState.round]));

            // ── H. 🏷 라벨사양서 리비전(R1/R2…) 관리 + 🆚 VS 비교 (2026-11-13 요청) ──
            //    "라벨 사양서는 M.C Table 처럼 R1,2,3… 관리가 필요함 / VS 는 … 차이점 요약"
            LOG.push(''); LOG.push('── H. 라벨사양서 리비전 + VS 비교 ──');
            window.mcActiveUnit = '';   // 앞 절(G)이 남긴 BRANDNEW 모델에서 빠져나온다
            window._docPick('label-spec'); await sleep(30);
            var revBtn = document.getElementById('doc-rev-bar');
            ok('리비전 바가 보인다(라벨사양서는 perRevision)', !!revBtn, document.getElementById('doc-header-tools').textContent);
            ok('기본값은 R1', revBtn && /R1/.test(revBtn.textContent), revBtn && revBtn.textContent);
            ok('리비전이 하나뿐이면 VS 버튼이 없다', !/🆚 VS/.test(document.getElementById('doc-header-tools').textContent));

            // R1 에 라벨 1개
            window._docLabelItemAdd('label-spec'); await sleep(30);
            var qlit = function (k) { return document.querySelector('#doc-page-body input[data-doc-litem="' + k + '"], #doc-page-body textarea[data-doc-litem="' + k + '"]'); };
            qlit('0|size').value = '75 X 70'; qlit('0|size').dispatchEvent(new Event('input', { bubbles: true }));
            qlit('0|code').value = '124291'; qlit('0|code').dispatchEvent(new Event('input', { bubbles: true }));
            qlit('0|position').value = '제품'; qlit('0|position').dispatchEvent(new Event('input', { bubbles: true }));
            eq('R1 라벨이 실제 입력 경로로 저장된다',
               (window.tabData.documents['label-spec'].revisions.R1.labelItems[0] || {}).code, '124291');

            // ➕ 리비전 추가 — 복사 확인(기존 confirmAnswer 스위치 재사용)
            confirmAnswer = true;
            window._docRevAdd('label-spec'); await sleep(30);
            revBtn = document.getElementById('doc-rev-bar');
            ok('추가하면 R2 로 전환되고 바에도 R2 가 보인다', revBtn && /R2/.test(revBtn.textContent), revBtn && revBtn.textContent);
            eq('R2 는 R1 내용을 복사해서 시작한다(라벨 1개)',
               window.tabData.documents['label-spec'].revisions.R2.labelItems.length, 1);

            // R2 에서 부착위치를 고치고 라벨 1개 추가 — 전부 실제 입력 경로
            qlit('0|position').value = '후면'; qlit('0|position').dispatchEvent(new Event('input', { bubbles: true }));
            window._docLabelItemAdd('label-spec'); await sleep(30);
            qlit('1|size').value = '40 X 20'; qlit('1|size').dispatchEvent(new Event('input', { bubbles: true }));
            qlit('1|code').value = '309213'; qlit('1|code').dispatchEvent(new Event('input', { bubbles: true }));
            qlit('1|position').value = '박스'; qlit('1|position').dispatchEvent(new Event('input', { bubbles: true }));

            // 인증 항목도 하나 적어 VS 가 인증 쪽도 비교하는지 확인
            window._docLabelCertAdd('label-spec', 'c'); await sleep(30);
            var qlcert = function (k) { return document.querySelector('#doc-page-body input[data-doc-lcert="' + k + '"]'); };
            qlcert('c|0|name').value = 'CE'; qlcert('c|0|name').dispatchEvent(new Event('input', { bubbles: true }));

            // ◀ 로 R1 로 돌아가 — 실제 화면에 R1 의 옛값이 그대로 보이는지(R2 수정이 안 섞였는지)
            window._docRevGo('label-spec', -1); await sleep(30);
            revBtn = document.getElementById('doc-rev-bar');
            ok('◀ 를 누르면 R1 로 돌아간다', revBtn && /R1/.test(revBtn.textContent), revBtn && revBtn.textContent);
            eq('R1 화면엔 라벨이 여전히 1개뿐이다(R2 의 추가분이 안 섞인다)',
               document.querySelectorAll('#doc-page-body input[data-doc-litem$="|code"]').length, 1);
            eq('R1 부착위치는 제품 그대로(R2 에서 후면으로 고친 게 안 번진다)', qlit('0|position').value, '제품');

            // ▶ 로 다시 R2 로 — VS 버튼이 떴는지(리비전 2개 다 내용 있음)
            window._docRevGo('label-spec', 1); await sleep(30);
            ok('VS 버튼은 내용 있는 리비전이 2개 이상일 때만 뜬다',
               /🆚 VS/.test(document.getElementById('doc-header-tools').textContent));

            window._docRevVsOpen('label-spec'); await sleep(30);
            var vsOv = document.getElementById('docrevvs-overlay');
            ok('VS 모달이 열린다', vsOv && vsOv.style.display === 'flex');
            var vsBody = document.getElementById('docrevvs-body').textContent;
            ok('요약에 추가된 라벨(309213)이 나온다', vsBody.indexOf('309213') >= 0, vsBody);
            ok('요약에 바뀐 부착위치(제품→후면)가 나온다', vsBody.indexOf('제품') >= 0 && vsBody.indexOf('후면') >= 0, vsBody);
            ok('표에도 두 리비전(R1/R2) 열이 있다', vsBody.indexOf('R1') >= 0 && vsBody.indexOf('R2') >= 0);
            ok('표에 인증 항목(CE)도 나온다', vsBody.indexOf('CE') >= 0, vsBody);

            window._docRevVsClose();
            ok('닫으면 모달이 숨는다', document.getElementById('docrevvs-overlay').style.display === 'none');
        } catch (e) {
            ok('예외 없이 끝남', false, String(e && e.stack || e));
        } finally {
            window.saveToGoogleDrive = realSave;
            window.autoSaveCurrentSnapshot = realAuto;
            window.collectTabData = realCollect;
            window.showToast = realToast;
            window.projectMeta = realMeta;
            window.tabData = realTab;
            window.fetch = realFetch;
            window.confirm = realConfirm;
            if (realXW) XLSX.writeFile = realXW;
            if (realPW) PptxGenJS.prototype.writeFile = realPW;
            window._docState = realState;
            window.mcActiveUnit = realUnit;
            try { window._docRender(); } catch (e) { /* 되돌린 상태로 다시 그린다 */ }
        }

        LOG.push('');
        LOG.push('━'.repeat(60));
        LOG.push((FAIL ? '❌' : '✅') + ' ' + OK + '/' + (OK + FAIL) + ' 통과' + (FAIL ? ('  (실패 ' + FAIL + '건)') : ''));
        console.log(LOG.join('\n'));
        return { ok: OK, fail: FAIL };
    };

    console.log('📄 준비됨 — `await __docPageTest()` (프로젝트가 열려 있으면 거부합니다)');
})();
