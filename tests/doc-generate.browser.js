// 📄 Document — 프로젝트 문서 생성(js/66) 검증 하네스
//
//  돌리는 법: 앱을 열고 콘솔에 붙여넣은 뒤 `await __dgDocTest()`
//            실제 프로젝트가 열려 있으면 **거부한다** → 정말 돌리려면 `await __dgDocTest({force:true})`
//
//  ■ 무엇을 진짜로 돌리나
//    · js/66 은 진짜다 — `_dgCollect`·`_dgGaps`·`_dgRender`·실제 pptx 생성·`_dgMake` 까지 지난다.
//    · 만든 pptx 를 **zip 으로 뜯어** 슬라이드 수와 그 안의 글자까지 확인한다
//      (만들었다는 반환값은 증거가 아니다 — 파일 안을 본다).
//    · 가짜는 **바깥 경계 셋**뿐: `fetch`(/doc/put) · `PptxGenJS.prototype.writeFile`(내려받기)
//      · `confirm`(덮어쓰기 확인). → **NAS 에 아무것도 안 올라가고 파일도 안 받아진다.**
//
//  ■⚠️ 왜 "실제 프로젝트가 열려 있으면 거부"하나
//    이 하네스는 마일스톤 **입력칸(DOM)에 합성 날짜를 써 넣는다**. 실제 프로젝트가 열려 있으면
//    그 값이 화면에 들어가고 **앱 자체의 자동저장**이 NAS 에 써 버린다(2026-11-04 `_ganttSet`
//    사고와 같은 모양 — 하네스가 남의 데이터를 고친다). 그래서
//      ① 프로젝트가 열려 있으면 기본적으로 **안 돌린다**
//      ② 돌릴 때는 `saveToGoogleDrive` 를 **킬스위치로 막는다**
//      ③ 끝나면 입력칸·전역값을 **전부 원상복구**한다
(function () {
    'use strict';

    var OK = 0, FAIL = 0, LOG = [];
    var ok = function (n, c, x) {
        if (c) { OK++; LOG.push('  ✅ ' + n); } else { FAIL++; LOG.push('  ❌ ' + n + (x ? '  → ' + x : '')); }
    };
    var eq = function (n, got, want) {
        ok(n + ' (' + JSON.stringify(want) + ')', String(got) === String(want), '실제: ' + JSON.stringify(got));
    };

    /** 만들어진 .pptx(zip)를 뜯어 본다 — 외부 라이브러리 없이 중앙 디렉터리를 직접 읽는다.
     *  (tests/weekly-ppt-export.browser.js 와 같은 방식 — zip 읽기는 업무 규칙이 아니라 도구다) */
    async function openPptx(buf) {
        var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
        for (var i = u8.length - 22; i >= 0 && i > u8.length - 70000; i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) return null;
        var count = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), entries = [];
        for (var n = 0; n < count; n++) {
            if (dv.getUint32(off, true) !== 0x02014b50) break;
            var nameLen = dv.getUint16(off + 28, true);
            entries.push({
                name: new TextDecoder().decode(u8.slice(off + 46, off + 46 + nameLen)),
                method: dv.getUint16(off + 10, true),
                compSize: dv.getUint32(off + 20, true),
                localOff: dv.getUint32(off + 42, true)
            });
            off += 46 + nameLen + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
        }
        async function read(e) {
            var lh = e.localOff;
            var start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
            var data = u8.slice(start, start + e.compSize);
            if (e.method === 0) return new TextDecoder().decode(data);
            var out = await new Response(new Blob([data]).stream()
                .pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
            return new TextDecoder().decode(out);
        }
        return { entries: entries, read: read };
    }

    // ── 합성 프로젝트 (실측 값 모양을 따랐다 — 사내 실제 값은 쓰지 않는다) ──
    var FAKE_META = {
        프로젝트코드: 'G0000TT', 프로젝트명: 'TESTBUYER>TESTPROJ(15.6)',
        고객사: 'TESTBUYER', 모델명: 'TESTPROJ', 인치: '15.6',
        KTKPN: '500000', KTK모델명: 'KTTEST01', PN_모델명: 'BTN-P>KTTEST01,TEST@VINA',
        프로젝트담당자: '총괄자', HW담당자: '회로자', 기구담당자: '기구자', FW담당자: '펌웨어자',
        팀: '개발3팀', 메일키워드: 'TESTPROJ'
    };
    var FAKE_MS = {
        '기획Start': '2025-06-10', '기획Finish': '2025-09-19', 'ProtoDR': '2025-09-30',
        'ESStart': '2025-10-01', 'ESEnd': '2026-06-19', 'DVR': '2026-06-30',
        'PPStart': '2026-07-01', 'PPEnd': '2026-09-18', 'PRA': '2026-09-30'
    };
    var FAKE_TAB = {
        summary: {},
        briefSpec: [
            { type: 'Display', sub: 'Panel', modelA: 'Innolux TEST-L01', note: 'KTK note A' },
            { type: 'Display', sub: 'Native Resolution', modelA: '1920 x 510', note: '' },
            { type: 'Optical', sub: '휘도', modelA: '500~550', note: '' },
            { type: 'Mech', sub: 'Casing', modelA: 'Die-casting', note: '' }
        ],
        projectModels: [{ materials: [
            { category: 'PANEL',          ktkPn: '131475', description: 'FOG IPS>TEST-PANEL,1920X510' },
            { category: 'AD BOARD',       ktkPn: '303194', description: 'PBA-AD>VIDEO,TULIP-TEST' },
            { category: 'CONVERTER',      ktkPn: '303237', description: 'PBA-CNV>LEDRV,KCB-TEST' },
            { category: 'TOUCH / GLASS',  ktkPn: '303245', description: 'TSP PCT ASSY>TEST' },
            { category: 'TOUCH CTRL',     ktkPn: '303223', description: 'PBA-T>FLAMINGO-TEST' }
        ] }],
        projectMembers3: [{ name: '영업담당', role: '영업 담당자', email: 'x@y.z' }]
    };

    window.__dgDocTest = async function (opt) {
        opt = opt || {};
        OK = 0; FAIL = 0; LOG = [];
        LOG.push('📄 Document 문서 생성 검증');

        if (typeof window.openDocumentPicker !== 'function') {
            console.log('❌ js/66 이 로드되지 않았습니다 (openDocumentPicker 없음).'); return { ok: 0, fail: 1 };
        }
        // ⚠️ 실제 프로젝트가 열려 있으면 거부 — 이 하네스는 입력칸에 값을 써 넣는다.
        var live = String((window.projectMeta || {}).프로젝트명 || '').trim();
        if (live && !opt.force) {
            console.log('⛔ 실제 프로젝트가 열려 있습니다: "' + live + '"\n'
                + '   이 하네스는 마일스톤 입력칸에 합성 날짜를 써 넣으므로, 앱 자동저장이 그 값을\n'
                + '   NAS 에 쓸 수 있습니다. 빈 화면(새로고침 직후)에서 돌리세요.\n'
                + '   그래도 돌리려면: await __dgDocTest({force:true})  — 저장은 막고 끝나면 되돌립니다.');
            return { ok: 0, fail: 0, refused: true };
        }

        // ── 킬스위치 + 원상복구 스냅샷 ──
        var realSave = window.saveToGoogleDrive;
        var realAuto = window.autoSaveCurrentSnapshot;
        var realCollect = window.collectTabData;
        var realFetch = window.fetch;
        var realWrite = window.PptxGenJS && window.PptxGenJS.prototype.writeFile;
        var realConfirm = window.confirm;
        var realToast = window.showToast;
        var realMeta = window.projectMeta, realTab = window.tabData;
        var msSnap = [];
        var puts = [], downloads = [], confirmAnswer = false;

        window.saveToGoogleDrive = function () { console.warn('[doc-generate harness] 저장 차단됨'); return Promise.resolve(); };
        window.autoSaveCurrentSnapshot = function () {};
        // ⚠️ `collectTabData` 는 화면을 읽어 tabData 를 덮어쓴다 — 합성값이 날아가므로 막는다.
        window.collectTabData = function () {};
        window.showToast = function () {};
        window.confirm = function () { return confirmAnswer; };

        try {
            window.projectMeta = JSON.parse(JSON.stringify(FAKE_META));
            window.tabData = JSON.parse(JSON.stringify(FAKE_TAB));
            // 마일스톤은 **DOM 입력칸**에서 읽으므로 거기 써 넣는다(원래 값은 되돌린다).
            (window.DOC_MILESTONES || []).forEach(function (m) {
                ['#sum-milestone-body', '#sum-milestone-body-actual'].forEach(function (root) {
                    var el = document.querySelector(root + ' [data-stage="' + m.stage + '"]');
                    if (!el) return;
                    msSnap.push({ el: el, v: el.value });
                    el.value = (root.indexOf('actual') >= 0) ? '' : (FAKE_MS[m.stage] || '');
                });
            });

            // ── A. 사실 수집 ──
            LOG.push('');
            LOG.push('── A. 사실 수집 (_dgCollect) ──');
            var ctx = window._dgCollect();
            eq('프로젝트코드', ctx.meta.프로젝트코드, 'G0000TT');
            eq('제품코드(= KTKPN)', ctx.meta.제품코드, '500000');
            eq('모델 풀네임', ctx.meta.모델풀네임, 'BTN-P>KTTEST01,TEST@VINA');
            eq('고객사', ctx.meta.고객사, 'TESTBUYER');
            eq('마일스톤 계획 9칸 전부 읽힘', Object.keys(ctx.milestones.plan)
                .filter(function (k) { return ctx.milestones.plan[k]; }).length, 9);
            eq('ProtoDR 날짜', ctx.milestones.plan['ProtoDR'], '2025-09-30');
            eq('PRA 날짜', ctx.milestones.plan['PRA'], '2026-09-30');
            eq('빈 계획 칸 없음', ctx.milestones.missing.length, 0);
            eq('Customer SPEC 항목 수', ctx.spec.length, 4);
            eq('주요 자재 5종', ctx.materials.length, 5);
            // ⚠️ 기대값은 `MATERIAL_FIXED_CATEGORIES` **그 순서**다 — 내가 외운 순서가 아니다.
            //    처음에 PANEL,AD BOARD,… 로 적었다가 틀렸다(실제는 PANEL,SLIM/CUT,TOUCH…,AD BOARD,…).
            var wantOrder = (window.MATERIAL_FIXED_CATEGORIES || [])
                .filter(function (c) { return ctx.materials.some(function (m) { return m.cat === c; }); }).join(',');
            eq('자재 순서는 고정 구분 순서', ctx.materials.map(function (m) { return m.cat; }).join(','), wantOrder);
            // ⚠️⚠️ 멤버는 **저장값(projectMeta)** 에서 와야 한다 — Summary 탭을 한 번도 안 열면
            //    입력칸이 비어 있어서 DOM 만 읽는 구현은 멤버를 통째로 빠뜨린다(실제로 그랬다).
            ok('멤버 10역할이 저장값에서 온다(탭을 안 열어도)', ctx.members.length >= 5,
               JSON.stringify(ctx.members.map(function (m) { return m.role + ':' + m.name; })));
            ok('기구 담당자가 저장값에서 온다',
               ctx.members.some(function (m) { return m.name === '기구자'; }),
               JSON.stringify(ctx.members));
            ok('멤버-3(영업 담당자)도 들어온다',
               ctx.members.some(function (m) { return m.name === '영업담당'; }));
            // 마일스톤도 저장값에서 — DOM 을 비워도 읽혀야 한다
            var msDomSnap = [];
            (window.DOC_MILESTONES || []).forEach(function (m) {
                var el = document.querySelector('#sum-milestone-body [data-stage="' + m.stage + '"]');
                if (el) { msDomSnap.push({ el: el, v: el.value }); el.value = ''; }
            });
            window.tabData.summary = window.tabData.summary || {};
            window.tabData.summary.milestones = { 'ProtoDR': { date: '2025-09-30' }, 'PRA': { date: '2026-09-30' } };
            var ctxS = window._dgCollect();
            eq('마일스톤이 저장값(summary.milestones)에서 읽힌다', ctxS.milestones.plan['ProtoDR'], '2025-09-30');
            msDomSnap.forEach(function (s) { s.el.value = s.v; });
            delete window.tabData.summary.milestones;

            // ── B. 빈 칸 집어내기 ──
            LOG.push('');
            LOG.push('── B. 비어 있는 것 집어내기 (_dgGaps) ──');
            var spec = (window.DOC_GEN_SPECS || [])[0];
            ok('문서 종류가 카탈로그에 있다', !!spec, JSON.stringify(window.DOC_GEN_SPECS));
            var gaps = window._dgGaps(spec, ctx);
            // 개요 3칸을 안 채웠으므로 그게 잡혀야 한다
            ok('개요가 비었음을 집어낸다', gaps.some(function (g) { return /적용 목적/.test(g.what); }),
               JSON.stringify(gaps.map(function (g) { return g.what; })));
            ok('어디서 채우는지도 적는다', gaps.every(function (g) { return !!g.where; }));
            // 개요를 채우면 그 항목이 사라져야 한다
            var pz = document.getElementById('sum-purpose'), vz = document.getElementById('sum-volume'),
                dz = document.getElementById('sum-mp-date');
            var ovSnap = [pz && pz.value, vz && vz.value, dz && dz.value];
            if (pz) pz.value = '시험 목적';
            if (vz) vz.value = '4,000대/년';
            if (dz) dz.value = '2026-07';
            var ctx2 = window._dgCollect();
            var gaps2 = window._dgGaps(spec, ctx2);
            eq('개요를 채우면 빈 항목 0개', gaps2.length, 0);
            eq('적용 목적이 읽힌다', ctx2.overview.purpose, '시험 목적');

            // ── C. pptx 생성 — 파일 안을 본다 ──
            LOG.push('');
            LOG.push('── C. pptx 생성 (만든 파일을 zip 으로 뜯어 본다) ──');
            var captured = null;
            window.PptxGenJS.prototype.writeFile = async function (o) {
                var b = await this.write({ outputType: 'arraybuffer' });
                captured = { fileName: (o && o.fileName) || '', buf: b };
                downloads.push(captured.fileName);
                return captured.fileName;
            };
            window._dgState.specId = spec.id;
            window._dgState.stage = 'Proto DR';
            await window._dgMake(false);
            ok('내려받기가 한 번 불렸다', downloads.length === 1, JSON.stringify(downloads));
            ok('파일 이름 규칙(고객사_모델_인치in_단계_V00_날짜.pptx)',
               /^TESTBUYER_TESTPROJ_15\.6in_Proto DR_V00_.+\.pptx$/.test(captured ? captured.fileName : ''),
               captured && captured.fileName);
            var u = new Uint8Array(captured.buf);
            ok('진짜 pptx(zip) 다', u[0] === 0x50 && u[1] === 0x4B, u[0] + ',' + u[1]);
            var z = await openPptx(captured.buf);
            ok('zip 을 열 수 있다', !!z);
            var slides = z.entries.filter(function (e) { return /^ppt\/slides\/slide\d+\.xml$/.test(e.name); });
            eq('슬라이드 수(표지+요약+조직+일정+SPEC+자재)', slides.length, 6);
            var all = '';
            for (var i = 0; i < slides.length; i++) all += await z.read(slides[i]);
            // ⚠️ 슬라이드 XML 에선 `>` `<` `&` 가 **이스케이프**돼 있다 — 글자를 그대로 찾으면
            //    `FOG IPS>TEST-PANEL` 같은 값이 "없다"로 나온다(처음에 그렇게 틀렸다).
            var has = function (s) {
                var esc = String(s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
                return all.indexOf(s) >= 0 || all.indexOf(esc) >= 0;
            };
            // 값이 **실제로 파일 안에** 들어갔는지 — 반환값이 아니라 내용을 본다
            ok('표지/머리에 프로젝트 코드가 들어갔다', has('G0000TT'));
            ok('제품 코드가 들어갔다', has('500000'));
            ok('모델 풀네임이 들어갔다', has('BTN-P>KTTEST01,TEST@VINA'));
            ok('마일스톤 날짜가 들어갔다(ProtoDR)', has('2025-09-30'));
            ok('마일스톤 날짜가 들어갔다(PRA)', has('2026-09-30'));
            ok('멤버 이름이 들어갔다(저장값 유래)', has('기구자'));
            ok('멤버-3 이름도 들어갔다', has('영업담당'));
            ok('Customer SPEC 값이 들어갔다', has('Innolux TEST-L01'));
            ok('SPEC 의 KTK Note 도 들어갔다', has('KTK note A'));
            ok('주요자재 코드가 들어갔다', has('131475'));
            ok('주요자재 내역이 들어갔다(XML 이스케이프 감안)', has('FOG IPS>TEST-PANEL'));
            ok('개요(적용 목적)가 들어갔다', has('시험 목적'));
            ok('단계 이름이 들어갔다', has('Proto DR'));

            // ── D. 빈 값은 **빨간 글씨로 드러난다**(조용히 '-' 로 넘기지 않는다) ──
            LOG.push('');
            LOG.push('── D. 빈 값을 숨기지 않는지 ──');
            if (pz) pz.value = ''; if (vz) vz.value = ''; if (dz) dz.value = '';
            window.tabData.briefSpec = [];
            downloads.length = 0; captured = null;
            await window._dgMake(false);
            var z2 = await openPptx(captured.buf);
            var sl2 = z2.entries.filter(function (e) { return /^ppt\/slides\/slide\d+\.xml$/.test(e.name); });
            var all2 = '';
            for (var k = 0; k < sl2.length; k++) all2 += await z2.read(sl2[k]);
            ok('개요가 비면 그렇다고 적는다', /프로젝트 개요가 비어/.test(all2) || all2.indexOf('B1432F') >= 0,
               '빈 안내가 안 보인다');
            ok('Customer SPEC 이 비면 그렇다고 적는다', /Customer SPEC/.test(all2) && /비어/.test(all2),
               '빈 안내가 안 보인다');
            window.tabData.briefSpec = JSON.parse(JSON.stringify(FAKE_TAB.briefSpec));

            // ── E. NAS 업로드 — 덮어쓰기를 사람 확인 없이 하지 않는지 ──
            LOG.push('');
            LOG.push('── E. NAS 업로드 (/doc/put) ──');
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
                    return { ok: true, folder: 'DOCUMENT', name: 'x.pptx', size: 12345 }; } };
            };
            puts.length = 0; nextStatus = 200;
            await window._dgMake(true);
            eq('업로드 호출 1회', puts.length, 1);
            ok('folder=DOCUMENT 로 간다', /folder=DOCUMENT/.test(puts[0] || ''), puts[0]);
            ok('이름이 같이 간다', /name=/.test(puts[0] || ''), puts[0]);
            ok('처음엔 overwrite 를 안 붙인다', (puts[0] || '').indexOf('overwrite=1') === -1, puts[0]);

            // 같은 이름이 있는데 사람이 **거절**하면 → 덮어쓰기 요청이 나가면 안 된다
            puts.length = 0; nextStatus = 409; confirmAnswer = false;
            await window._dgMake(true);
            eq('409 + 거절 → 요청은 1회뿐', puts.length, 1);
            ok('⚠️ 거절했으면 overwrite 요청이 없다',
               !puts.some(function (p) { return p.indexOf('overwrite=1') >= 0; }), JSON.stringify(puts));

            // 사람이 **승인**하면 → overwrite=1 로 한 번 더
            puts.length = 0; nextStatus = 409; confirmAnswer = true;
            await window._dgMake(true);
            eq('409 + 승인 → 요청 2회', puts.length, 2);
            ok('두 번째는 overwrite=1', (puts[1] || '').indexOf('overwrite=1') >= 0, puts[1]);
            confirmAnswer = false;

            // ── F. 화면 렌더가 터지지 않는지 (미리보기) ──
            LOG.push('');
            LOG.push('── F. 미리보기 렌더 ──');
            window.openDocumentPicker();
            var body = document.getElementById('dg-body');
            ok('미리보기 모달이 열린다', !!body && body.innerHTML.length > 100);
            ok('문서 종류 버튼이 그려진다', !!document.querySelector('#dg-body button[onclick*="_dgPick"]'));
            ok('파일 이름을 미리 보여준다', /\.pptx/.test(body ? body.innerHTML : ''));
            window._dgClose();
        } catch (e) {
            ok('예외 없이 끝남', false, String(e && e.stack || e));
        } finally {
            // 원상복구 — 하나라도 빠뜨리면 다음 사람 화면이 더럽혀진다
            msSnap.forEach(function (s) { try { s.el.value = s.v; } catch (e) {} });
            try {
                var p2 = document.getElementById('sum-purpose'), v2 = document.getElementById('sum-volume'),
                    d2 = document.getElementById('sum-mp-date');
                if (p2 && typeof ovSnap !== 'undefined') p2.value = ovSnap[0] || '';
                if (v2 && typeof ovSnap !== 'undefined') v2.value = ovSnap[1] || '';
                if (d2 && typeof ovSnap !== 'undefined') d2.value = ovSnap[2] || '';
            } catch (e) {}
            window.saveToGoogleDrive = realSave;
            window.autoSaveCurrentSnapshot = realAuto;
            window.collectTabData = realCollect;
            window.fetch = realFetch;
            if (realWrite) window.PptxGenJS.prototype.writeFile = realWrite;
            window.confirm = realConfirm;
            window.showToast = realToast;
            window.projectMeta = realMeta;
            window.tabData = realTab;
        }

        LOG.push('');
        LOG.push('━'.repeat(60));
        LOG.push((FAIL ? '❌' : '✅') + ' ' + OK + '/' + (OK + FAIL) + ' 통과' + (FAIL ? ('  (실패 ' + FAIL + '건)') : ''));
        console.log(LOG.join('\n'));
        return { ok: OK, fail: FAIL };
    };

    console.log('📄 준비됨 — `await __dgDocTest()` 를 실행하세요. '
              + '(실제 프로젝트가 열려 있으면 거부합니다 — 새로고침 직후 빈 화면에서 돌리세요)');
})();
