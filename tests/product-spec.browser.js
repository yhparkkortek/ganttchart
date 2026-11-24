// 📗 PRODUCT SPEC 화면 하네스 (2026-11-24) — 브라우저 콘솔에 붙여넣고 `await __psTest()`
//
//  보는 것: 서식 등록·구역 수 · 앱 값 자동채우기(합성 프로젝트) · 터치 켜기/끄기 · 다른 서식 안 깨짐
//           · [📂 불러오기] 진짜 경로(`_docImportFile` → js/76 importFile) · 원본저장 payload · 파일 이름
//  가짜는 경계뿐: `collectTabData`(빈 Summary DOM 이 합성 값을 지운다) · `_docEnsureFolders`·`_dgUploadBlob`
//           (NAS 에 안 쓴다) · `fetch` 의 `/doc/product-spec-*` 두 라우트 · `confirm` · `<a>.click`(다운로드).
//  ⚠️ **프로젝트가 열려 있으면 거부한다** — projectMeta/tabData 를 합성값으로 바꾼다(자동저장이 NAS 에 쓸 수 있다).
//  불러오기 부분은 `tests/_tmp_ps_parse.json` 이 있을 때만 돈다 — 실제 사양서를 백엔드로 읽은 결과다:
//     py -3 -I -c "import io,sys;sys.path.insert(0,'.');import kortek_backend as kb;c=kb.app.test_client();
//       r=c.post('/doc/product-spec-parse',data={'file':(io.BytesIO(open(sys.argv[1],'rb').read()),'x.docx')},
//       content_type='multipart/form-data');open('tests/_tmp_ps_parse.json','w',encoding='utf-8').write(r.get_data(as_text=True))" <사양서.docx>
//  ⚠️⚠️ 그 파일엔 **고객 값이 들어 있다 — 커밋 금지**(쓰고 나서 지울 것).
window.__psTest = async function (opt) {
    opt = opt || {};
    var ok = 0, fail = 0, log = [];
    var check = function (c, m) { if (c) ok++; else { fail++; log.push('✗ ' + m); } };
    if (window.currentDriveFileId && !opt.force) return '⛔ 프로젝트가 열려 있습니다 — 빈 상태에서 돌리세요';
    var saved = { collect: window.collectTabData, ens: window._docEnsureFolders, up: window._dgUploadBlob,
                  fetch: window.fetch, confirm: window.confirm, toast: window.showToast, dirty: window.markUnsavedChanges,
                  click: HTMLAnchorElement.prototype.click,
                  pm: window.projectMeta, td: window.tabData, unit: window.mcActiveUnit, pl: window._plData };
    var uploads = [], toasts = [], downloads = [], sent = null;
    try {
        window.collectTabData = function () {};
        window._docEnsureFolders = async function () {};
        window._dgUploadBlob = async function (folder, name, blob) { uploads.push(name); return { ok: true, name: name, size: blob.size }; };
        window.confirm = function () { return true; };
        window.showToast = function (m, k) { toasts.push([k, m]); };
        window.markUnsavedChanges = function () {};
        HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
        window.projectMeta = { 고객사: 'LNW>TESTPROJ', 인치: '32', KTKPN: '999001', KTK모델명: 'KTS999TEST01', 모델명: 'TESTPROJ' };
        window.tabData = { mcUnits: ['LOWER', 'UPPER'], documents: {},
            projectModels: [{ unitId: 'LOWER', KTKPN: '999001', KTK모델명: 'KTS999TEST01', 고객모델명: 'CUST-TEST',
                materials: [{ category: 'PANEL', description: 'PNL-TEST-01' }, { category: 'AD BOARD', description: 'ADB-TEST' },
                            { category: 'CONVERTER', description: 'CONV-TEST' }, { category: 'TOUCH CTRL', description: 'TCTRL-TEST' }] }],
            briefSpec: [{ sub: 'Brightness(Centre. Min)', modelA: '400~450' }, { sub: 'Color coordinate(x/y)', modelA: '0.305 / 0.335' },
                        { sub: 'Color Temperature(K)', modelA: '6850' }, { sub: 'F/W Version', modelA: 'FW-TEST-01' }] };
        window.mcActiveUnit = 'LOWER';
        window._plData = { rows: [{ ktkPn: '999001', pn: '1234567-ALT9', panel: 'PNL-TEST-01', panelMfr: 'TESTVENDOR',
            adbd: 'ADB-TEST', adFw: 'ADFW-T1', certCb: 'O', certUl: 'O', certCe: 'O', certFcc: 'X', power1: 'DC + 24[V] / 2[A]',
            touchCtrl: 'TCTRL-TEST', touchFw: 'V9.9', glassType: 'Sodalime Glass', airGap: '1.00T', panelInch: '31.5' }], history: [] };

        var f = (window.DOC_FORMS || []).filter(function (x) { return x.id === 'product-spec'; })[0];
        check(!!f, '서식이 등록돼야');
        for (var w = 0; w < 30 && f && f.sections.length < 10; w++) await new Promise(function (r) { setTimeout(r, 100); });
        check(f.sections.length > 40, '양식 목록(JSON)을 읽어 구역이 40개 넘어야 (' + f.sections.length + ')');
        window._docState.formId = 'product-spec';
        window._docRender();
        var p = window._psPayload();
        var want = { hdrKtkPn: '999001', docRev: 'V00', custPnLabel: 'SG PN', 'cover.r1.c2': '1234567-ALT9',
                     'parts.r1.c3': 'TESTVENDOR', 'parts.r2.c2': 'ADFW-T1', 'parts.r5.c2': 'V9.9',
                     'cie.r2.c1': '0.305', 'cie.r2.c2': '0.335', 'cert.r2.c3': 'X', 'scr.r12.c1': 'x=0.305, y=0.335',
                     vcpTitle: 'LNW VCP Specification', 'rev.r1.c1': '00', 'rev.r1.c2': 'All', 'tglass.r2.c2': '1.00T' };
        Object.keys(want).forEach(function (k) { check(p.values[k] === want[k], '자동값 ' + k + ' = ' + JSON.stringify(p.values[k]) + ' (기대 ' + want[k] + ')'); });
        check(/31\.5” TFT-LCD MONITOR\. KTS999TEST01 is/.test(p.values.scope), 'Scope 글 틀');
        check(p.variant === 'touch', '터치 컨트롤러가 있으면 터치 판');
        var nOn = f.sections.length;
        window._docDataOf('product-spec').fields.hasTouch = 'NO';
        check(window._psPayload().variant === 'base' && f.sections.length < nOn, '터치 끄면 base 판 + 터치 구역 숨김');
        delete window._docDataOf('product-spec').fields.hasTouch;
        // 다른 서식이 안 깨지는가
        ['model-spec', 'label-spec', 'sample-report', 'stage-dr'].forEach(function (id) {
            try { window._docState.formId = id; window._docRender(); ok++; } catch (e) { fail++; log.push('✗ ' + id + ' 렌더: ' + e.message); }
        });
        window._docState.formId = 'product-spec';

        // 📂 불러오기 — 실제 사양서를 백엔드가 읽은 결과가 있으면
        var parsedText = null;
        try { var rr = await saved.fetch('tests/_tmp_ps_parse.json', { cache: 'no-store' }); if (rr.ok) parsedText = await rr.text(); } catch (e0) { /* 없음 */ }
        if (parsedText) {
            var j = JSON.parse(parsedText);
            window.fetch = function (u, o) {
                if (String(u).indexOf('/doc/product-spec-parse') >= 0) return Promise.resolve(new Response(parsedText, { status: 200 }));
                if (String(u).indexOf('/doc/product-spec-docx') >= 0) { sent = JSON.parse(o.body); return Promise.resolve(new Response(new Blob([new Uint8Array(1024)]), { status: 200 })); }
                return saved.fetch.apply(this, arguments);
            };
            await window._docImportFile(new File([new Uint8Array([80, 75])], 'spec.docx'));
            check(uploads.length === Object.keys(j.images).length, '그림마다 NAS 첨부 업로드 (' + uploads.length + ')');
            var ctx = window._dgCollect(), p2 = window._psPayload(), bad = 0;
            Object.keys(j.values).forEach(function (k) {
                var auto = window.PS_AUTO[k] ? window.DOC_AUTO_HOOKS.ps(ctx, k).v : '';
                var exp = auto || (String(j.values[k]).trim() ? j.values[k] : (p2.values[k] === '' ? '' : j.values[k]));
                if (p2.values[k] !== exp && !(String(exp).trim() === '' && String(p2.values[k] || '').trim() === '')) { bad++; if (bad < 4) log.push('✗ 값 ' + k); }
            });
            check(bad === 0, '불러온 값/앱 값이 원본저장에 그대로 실려야 (어긋남 ' + bad + ')');
            check(Object.keys(j.images).every(function (k) { var a = (p2.images[k] || [])[0]; return a && a.cx === j.images[k].cx && a.cy === j.images[k].cy; }),
                  '그림의 원래 크기(cx,cy)가 실려야');
            check(JSON.stringify(p2.layout) === JSON.stringify(j.layout), '쪽 맞춤 빈 줄(layout)이 실려야');
            var owned = Object.keys(window._docDataOf('product-spec').fields).filter(function (k) { return !String(window._docDataOf('product-spec').fields[k]).trim(); });
            check(owned.length === 0, '빈 값은 저장하지 않아야 (' + owned.length + ')');
            await window._docSaveDocx();
            check(sent && sent.variant === j.variant && Object.keys(sent.values).length > 600, '원본저장이 payload 를 보내야');
            check(downloads.length === 1 && /^P03_Specification_LNW_1234567-ALT9_LOWER_V00_/.test(downloads[0]), '파일 이름 ' + downloads[0]);
        } else {
            log.push('ℹ️ tests/_tmp_ps_parse.json 없음 — 불러오기 부분 건너뜀');
        }
    } finally {
        window.collectTabData = saved.collect; window._docEnsureFolders = saved.ens; window._dgUploadBlob = saved.up;
        window.fetch = saved.fetch; window.confirm = saved.confirm; window.showToast = saved.toast;
        window.markUnsavedChanges = saved.dirty; HTMLAnchorElement.prototype.click = saved.click;
        window.projectMeta = saved.pm; window.tabData = saved.td; window.mcActiveUnit = saved.unit; window._plData = saved.pl;
    }
    return ok + ' 통과 / ' + fail + ' 실패' + (log.length ? '\n' + log.join('\n') : '');
};
