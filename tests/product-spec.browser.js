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
        // Scope 는 제품 인치(Summary 32), Features 는 패널 실치수(Project list 31.5) — 원본이 그렇다
        check(/specification of 32” TFT-LCD MONITOR\. KTS999TEST01 is/.test(p.values.scope), 'Scope 글 틀(제품 인치) ' + p.values.scope);
        // Project list 의 '없음'(X) 은 터치가 없다는 뜻 — 터치 판이 되면 안 된다
        window._plData.rows[0].touchCtrl = 'X';
        window.tabData.projectModels[0].materials = window.tabData.projectModels[0].materials.filter(function (m) { return m.category !== 'TOUCH CTRL'; });
        var pX = window._psPayload();
        check(pX.variant === 'base' && pX.values['parts.r5.c1'] === '-' && pX.values['parts.r5.c2'] === '-',
              'touchCtrl=X → base 판·부품 표 "-" (' + pX.variant + ', ' + pX.values['parts.r5.c1'] + ', ' + pX.values['parts.r5.c2'] + ')');
        window._plData.rows[0].touchCtrl = 'TCTRL-TEST';
        window.tabData.projectModels[0].materials.push({ category: 'TOUCH CTRL', description: 'TCTRL-TEST' });
        check(p.variant === 'touch', '터치 컨트롤러가 있으면 터치 판');
        // 💾 칸을 고치면 **저장 대상으로 표시**돼야 한다 — 2026-11-24 실측: js/67 이 앱에 없는 함수
        //    (`markUnsavedChanges`)를 불러 표시가 안 켜졌고, 실제 프로젝트에 불러온 칸 602개가 자동저장에서 빠졌다.
        var dirtyBefore = window._nonGanttDirty;
        window._nonGanttDirty = false;
        window.markUnsavedChanges = saved.dirty;   // 진짜 상태(없음)로 — 위에서 가짜로 바꿔 둔 것을 되돌린다
        window._docSetField('product-spec', 'pwrConnPn', 'TEST-CONN-PN');
        check(window._nonGanttDirty === true, '칸을 고치면 _nonGanttDirty 가 켜져야(자동저장 대상)');
        window._nonGanttDirty = dirtyBefore;
        window.markUnsavedChanges = function () {};
        var nOn = f.sections.length;
        window._docDataOf('product-spec').fields.hasTouch = 'NO';
        check(window._psPayload().variant === 'base' && f.sections.length < nOn, '터치 끄면 base 판 + 터치 구역 숨김');
        delete window._docDataOf('product-spec').fields.hasTouch;
        // 🔎 PARTS 라이브러리 찾기 규칙(2026-11-24) — 합성 라이브러리를 잠깐 끼운다(경계: 라이브러리 캐시)
        var libSaved = window._epLibCache;
        window._epLibCache = {
            panel: { panels: [{ model: 'PNL-TEST-01B', specs: { 'Item Code': '', 'Part Name': 'PNL-TEST-01B', 'Lamp Current': '70mA', 'Panel Brand': 'PVEND' } }] },
            adbd: { items: [{ model: 'ADB-TEST', specs: { 'Item Code': '777010', 'Part Name': 'ADB-TEST', Brand: 'Shown Co' } },
                            { model: 'ADB-OTHER', specs: { 'Item Code': '777011', 'Part Name': 'ADB-OTHER', Brand: 'Other Co' } }] },
            convbd: { items: [{ model: '777020_CONV-TEST', specs: { 'Item Code': '777020', 'Part Name': 'CONV-TEST', Brand: 'KORTEK Corporation',
                            'Input Connector (Model/Pins)': '11111WR-12A / 12' } }] },
            touchctrl: { items: [{ model: '777030_PBA-T>TCTRL-TEST,R0', specs: { 'Item Code': '777030', 'Part Name': 'PBA-T>TCTRL-TEST,R0',
                            Brand: 'KORTEK Corporation', 'Input Voltage': '5V @150mA', 'Board Size (WxH)': '100.0 ± 0.2mm x 62.0 ± 0.2mm' } }] }
        };
        var mats0 = window.tabData.projectModels[0].materials;
        window.tabData.projectModels[0].materials = [
            { category: 'PANEL', ktkPn: '', description: 'PNL-TEST-01B' },            // 보이는 이름(PNL-TEST-01)과 끝이 다른 같은 계열
            { category: 'AD BOARD', ktkPn: '777011', description: 'ADB-OTHER' },      // 보이는 이름(ADB-TEST)과 다른 부품
            { category: 'CONVERTER', ktkPn: '777020', description: 'CONV-TEST' },
            { category: 'TOUCH CTRL', ktkPn: '777030', description: 'TCTRL-TEST' }];
        window._plData.rows[0].touchCtrl = 'TCTRL-TEST_V00';                         // 이름만으론 못 찾는다
        var pL = window._psPayload();
        check(pL.values['tgen.r4.c2'] === 'Kortek / 777030', '터치 컨트롤러를 품목 코드로 찾아 "제조사 / 코드" (' + pL.values['tgen.r4.c2'] + ')');
        check(pL.values['tpwr.r1.c2'] === '5V' && pL.values['tpwr.r2.c2'] === '150mA', '터치 전원 "5V @150mA" 쪼개기');
        check(pL.values['tmech.r1.c2'] === '100.0 ± 0.2mm' && pL.values['tmech.r2.c2'] === '62.0 ± 0.2mm', '터치 보드 크기 W·H');
        // [2026-11-24 사용자 결정] BOM → 주요자재 → Project list — BOM 이 없으면 주요자재(코드)가 이긴다
        check(pL.values['parts.r2.c1'] === 'ADB-OTHER' && pL.values['parts.r2.c3'] === 'Other Co',
              'BOM 없으면 주요자재 기준 — 이름·기록 모두 주요자재 부품 (' + pL.values['parts.r2.c1'] + ', ' + pL.values['parts.r2.c3'] + ')');
        // 🧾 BOM 이 있으면 BOM 이 정답 — 주요자재에 복사된 터치가 있어도 BOM 에 없으면 터치 없음
        window.tabData.bomByUnit = { LOWER: { rows: [
            { _level: 1, IDNRK: '777099', OJTXP: 'LCM IPS>PNL-BOM-01,1920X1080,300=', WGBEZ60: 'DISPLAY/LCM' },
            { _level: 1, IDNRK: '777010', OJTXP: 'PBA-AD>VIDEO,ADB-TEST,R1,V00', WGBEZ60: 'BD 반제품/PBA' },
            { _level: 2, IDNRK: '700001', OJTXP: 'CON>D,NOR,ABC200-04,4P1MS,200', WGBEZ60: '회로자재/CONNECTOR', EBORT: 'J1,J7', MFRPN: '연호전자' },
            { _level: 2, IDNRK: '700002', OJTXP: 'SWC TACT>S,9999SB9,SR,4P', WGBEZ60: '회로자재/SWITCH', EBORT: 'SW1,SW2,SW3,SW4', MFRPN: 'CT 전자' },
            { _level: 2, IDNRK: '700003', OJTXP: 'JACK USB>D,2,B,AN,KUSB99,H,4P,PCB,WHT', WGBEZ60: '회로자재/JACK', EBORT: 'J3', MFRPN: '어느전자' },
            { _level: 1, IDNRK: '777088', OJTXP: 'PBA-LED>PCB,LED-TEST,V00', WGBEZ60: 'BD 반제품/PBA' },   // LED 보드(섞이면 안 된다)
            { _level: 2, IDNRK: '700099', OJTXP: 'CON>D,NOR,LEDCON-02,2P1MS,200', WGBEZ60: '회로자재/CONNECTOR', EBORT: 'J8', MFRPN: '연호전자' },
            { _level: 1, IDNRK: '777020', OJTXP: 'PBA-CNV>LEDRV,CONV-TEST,R0', WGBEZ60: 'BD 반제품/PBA' },
            { _level: 2, IDNRK: '700010', OJTXP: 'CON>S,NOR,11111WR-12,12P1MR,125', WGBEZ60: '회로자재/CONNECTOR', EBORT: 'J1', MFRPN: '연호전자' }] } };
        window.mcActiveUnit = 'LOWER';
        var pB = window._psPayload();
        check(pB.values['parts.r1.c1'] === 'PNL-BOM-01' && pB.values['parts.r2.c1'] === 'ADB-TEST' && pB.values['parts.r3.c1'] === 'CONV-TEST',
              'BOM 부품명(구분자 규칙) — LED 보드와 안 섞임 (' + [pB.values['parts.r1.c1'], pB.values['parts.r2.c1'], pB.values['parts.r3.c1']].join(', ') + ')');
        check(pB.values['parts.r2.c3'] === 'Shown Co', 'BOM 부품 코드로 라이브러리 기록 (' + pB.values['parts.r2.c3'] + ')');
        check(pB.variant === 'base' && pB.values['parts.r5.c1'] === '-' && pB.values['tgen.r4.c2'] === '',
              'BOM 에 터치가 없으면 복사된 주요자재가 있어도 터치 없음 (' + pB.variant + ', ' + pB.values['parts.r5.c1'] + ', "' + pB.values['tgen.r4.c2'] + '")');
        // 🔌 BOM 커넥터 — A/D connection 표(설치지점 자연 정렬·연속 스위치는 한 줄·제조사 표기) · 컨버터 문장
        var adc = [1, 2, 3, 4].map(function (r) { return [pB.values['adc.r' + r + '.c0'], pB.values['adc.r' + r + '.c2'], pB.values['adc.r' + r + '.c3']].join('|'); });
        check(adc.join(' / ') === 'J1|ABC200-04|YEON-HO / J3|KUSB99|어느전자 / J7|ABC200-04|YEON-HO / SW1~4|9999SB9|CT',
              'BOM 커넥터로 A/D connection 표 (' + adc.join(' / ') + ')');
        check(pB.values.convIn === 'J1 : 11111WR-12 (YEON-HO)', '컨버터 입력 커넥터 문장 = BOM 설치지점·품번·제조사 (' + pB.values.convIn + ')');
        // 대조 — 사람이 적은(불러온) 값이 BOM 과 다르면 칸 아래 경고, 같으면 조용
        var dX = window._docDataOf('product-spec').fields;
        dX['adc.r1.c0'] = 'J1'; dX['adc.r2.c0'] = 'SW1~4';
        var chk = window.DOC_CELL_CHECK['product-spec'];
        check(chk('adc.r1.c2', 'ABC200-05') === 'BOM: ABC200-04 (J1)' && chk('adc.r1.c2', 'ABC200-04') === ''
              && chk('adc.r1.c3', 'YEON-HO') === '' && chk('adc.r2.c3', 'XX') === 'BOM: CT',
              'BOM 대조 경고 (' + chk('adc.r1.c2', 'ABC200-05') + ' / ' + chk('adc.r2.c3', 'XX') + ')');
        delete dX['adc.r1.c0']; delete dX['adc.r2.c0'];
        delete window.tabData.bomByUnit;
        check(pL.values['blu.r2.c3'] === '70', '보이는 이름으로 못 찾으면 주요자재로 — 패널 LED 전류 Typ (' + pL.values['blu.r2.c3'] + ')');
        check(pL.values.convIn === '11111WR-12A', '컨버터 입력 커넥터 모델명 (' + pL.values.convIn + ')');
        // 🔁 이름 끝 괄호(패널 리비전 '(B10)')를 떼면 찾힌다 — 2026-11-24 실측: 패널 사양 칸 9개가 통째로 비었다
        window.tabData.projectModels[0].materials[0].description = 'PNL-TEST-01B(B10)';
        var pT = window._psPayload();
        var sT = window.DOC_AUTO_HOOKS.ps(window._dgCollect(), 'blu.r2.c3');
        check(pT.values['blu.r2.c3'] === '70' && /\(PNL-TEST-01B\)/.test(sT.src),
              '이름 꼬리 "(B10)" 떼고 라이브러리 기록 + 출처에 찾은 이름 (' + pT.values['blu.r2.c3'] + ', ' + sT.src + ')');
        check(!window._epLibCache.panel.panels[0]._psVia, '꼬리 떼고 찾아도 라이브러리 캐시 객체는 그대로');
        window.tabData.projectModels[0].materials[0].description = 'PNL-TEST-01B';
        window._epLibCache = libSaved;
        // 🔌 전원 — Customer SPEC 의 소비전력(하위 줄 'LCD Monitor')·입력 커넥터('/' 뒤, 핀 수 표기 떼기)
        var bs0 = window.tabData.briefSpec;
        window.tabData.briefSpec = bs0.concat([{ type: 'Input voltage', sub: '', modelA: 'DC 24V / Acme 6P_11-22-3344' },
            { type: 'Power estimation (Max. W)', sub: 'LCD Monitor', modelA: '45W' }, { type: '', sub: 'Total', modelA: '60W' }]);
        var cP = window._dgCollect();
        var pc = window.DOC_AUTO_HOOKS.ps(cP, 'pwrConsumption').v, pn = window.DOC_AUTO_HOOKS.ps(cP, 'pwrConnPn').v;
        check(pc === '45[W] Max (Display only)' && pn === 'Acme 11-22-3344', '전원 소비·커넥터 (' + pc + ' / ' + pn + ')');
        window.tabData.briefSpec = bs0;
        window.tabData.projectModels[0].materials = mats0;
        window._plData.rows[0].touchCtrl = 'TCTRL-TEST';
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
            // 2026-11-24 실측 사고: 이름에 모델이 없어 다른 모델 문서의 그림이 같은 이름으로 서로를 덮어썼다
            check(uploads.every(function (n) { return /_product-spec_LOWER_R1_img_/.test(n); }),
                  '첨부 이름에 모델·리비전이 들어가야 (' + uploads[0] + ')');
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
