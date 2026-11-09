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
        briefSpec: [
            { type: 'Optical', sub: '휘도', modelA: '500~550', note: '' },
            { type: 'Display', sub: 'Panel', modelA: 'Innolux TEST-L01', note: 'KTK note A' }
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
            realState = window._docState;
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
            var titles = [].slice.call(body.querySelectorAll('div'))
                .map(function (d) { return d.textContent.trim(); })
                // ⚠️ 구역 제목은 **앞부분으로** 찾는다 — '광학 사양 · 펌웨어' 처럼 꼬리가 붙는다
                //    (처음에 `^광학 사양$` 로 적었다가 가짜 실패가 났다)
                .filter(function (t) { return /^(시제품 제작의뢰서|광학 사양|# 주요자재|# 요청사항|# 참고 자료)/.test(t); });
            eq('구역 5개가 그려진다', titles.length, 5);
            ok('주요자재 표가 5행이다',
               [].slice.call(body.querySelectorAll('input[data-doc-key$="|코드"]')).length === 5);
            ok('헤더에 엑셀 출력 버튼이 있다(기본 출력)',
               /엑셀/.test(document.getElementById('doc-header-tools').textContent));
            ok('시제품 제작의뢰서엔 PPT 버튼이 없다',
               !/PPT/.test(document.getElementById('doc-header-tools').textContent),
               document.getElementById('doc-header-tools').textContent);

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
            ok('folder=DOCUMENT 로 간다', /folder=DOCUMENT/.test(puts[0] || ''), puts[0]);
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
