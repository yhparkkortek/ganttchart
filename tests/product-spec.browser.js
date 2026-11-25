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
        if (window._psRef) window._psRef.set([]);        // 📑 다른 프로젝트 훑기는 하네스에서 안 돈다(NAS 를 안 읽는다)
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
                     'cie.r2.c1': '0.305', 'cie.r2.c2': '0.335', 'cert.r2.c3': '-', 'cert.r2.c0': 'O', 'scr.r12.c1': 'x=0.305, y=0.335',
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
        // 🏷 A/D Description — AD BD 라이브러리 커넥터 글(보드마다 적는 법이 다르다)에서 이름만.
        //   BOM 코드로 찾은 기록(777010)은 커넥터 칸이 비어 있고 **같은 이름의 다른 리비전**(777012)에만 있다(실측 모양)
        window._epLibCache.adbd.items.push({ model: '777012_ADB-TEST', specs: { 'Item Code': '777012', 'Part Name': 'ADB-TEST', Brand: 'Shown Co',
            'Control Connector': '6 Pin Inverter control: ABC200-06; EXT OSD KEY: ABC200-04',
            'Output Connector (Model/Pins)': 'KUSB99 (USB PORT) / 4 Pin' } });
        var ad0 = window._epLibCache.adbd.items[0];                     // 형제 병합 결과는 기록 객체마다 기억된다 —
        window._epLibCache.adbd.items[0] = { model: ad0.model, specs: ad0.specs };   // 라이브러리를 새로 받은 것처럼 새 객체로
        var cD = window._dgCollect(), H = window.DOC_AUTO_HOOKS.ps;
        var dJ3 = H(cD, 'adc.r2.c1'), dJ1 = H(cD, 'adc.r1.c1');
        check(dJ3.v === 'USB PORT' && /같은 이름 777012/.test(dJ3.src), 'Description = 라이브러리 괄호 이름 + 다른 리비전에서 빌림 (' + dJ3.v + ' / ' + dJ3.src + ')');
        check(dJ1.v === '', '같은 품번이 BOM 두 자리(J1·J7)에 있으면 설치지점 없는 이름을 안 고른다 (' + dJ1.v + ' / ' + dJ1.src + ')');
        window._epLibCache.adbd.items.pop();
        window._epLibCache.adbd.items[0] = ad0;
        // 대조 — 사람이 적은(불러온) 값이 BOM 과 다르면 칸 아래 경고, 같으면 조용
        var dX = window._docDataOf('product-spec').fields;
        dX['adc.r1.c0'] = 'J1'; dX['adc.r2.c0'] = 'SW1~4';
        var chk = window.DOC_CELL_CHECK['product-spec'];
        check(chk('adc.r1.c2', 'ABC200-05') === 'BOM: ABC200-04 (J1)' && chk('adc.r1.c2', 'ABC200-04') === ''
              && chk('adc.r1.c3', 'YEON-HO') === '' && chk('adc.r2.c3', 'XX') === 'BOM: CT',
              'BOM 대조 경고 (' + chk('adc.r1.c2', 'ABC200-05') + ' / ' + chk('adc.r2.c3', 'XX') + ')');
        delete dX['adc.r1.c0']; delete dX['adc.r2.c0'];
        // 📑 참고 사양서(2026-11-25) — 앱에 없는 칸을 같은 A/D 보드·같은 고객의 다른 사양서에서. 묶음 하나는 문서 하나에서만.
        //   UPPER(이 프로젝트 다른 모델) = 같은 A/D 보드(777010)·다른 컨버터(777029) · 다른 프로젝트 둘(같은 AD·고객 다름 / 같음)
        window.tabData.bomByUnit.UPPER = { rows: [
            { _level: 1, IDNRK: '777010', OJTXP: 'PBA-AD>VIDEO,ADB-TEST,R1,V00', WGBEZ60: 'BD 반제품/PBA' },
            { _level: 1, IDNRK: '777029', OJTXP: 'PBA-CNV>LEDRV,CONV-OTHER,R0', WGBEZ60: 'BD 반제품/PBA' }] };
        window.tabData.documents['product-spec#UPPER'] = { revisions: { R1: { fields: {
            adH1: 'J1 : 4 Pin External Power', 'adp1.r1.c1': 'GND', 'osd.r1.c1': 'MENU', pwrTermPn: 'TERM-UP',
            'cvi.r1.c1': 'VIN-UP', 'tim.r1.c1': '1920x1080', 'tim.r3.c1': '148.35' },
            att: { img_adbd: [{ folder: 'DOCUMENT/X/PRODUCT SPEC/attach', name: 'up_adbd.png', cx: 100, cy: 50 }],
                   img_conv: [{ folder: 'DOCUMENT/X/PRODUCT SPEC/attach', name: 'up_conv.png' }] } } } };
        var adOther = { adbd: { code: '777010', name: 'ADBTEST' }, conv: { code: '777099', name: '' }, touch: false };
        window._psRef.set([
            // 고객이 다른 문서가 **더 앞에** 서게(최근 리비전) — 고객 조건을 빼면 이게 집힌다
            { proj: 'OTHER_A', rank: 2, unit: '', rev: 'R3', dk: 'product-spec', customer: 'ABC', ident: adOther,
              fields: { 'vcp.r1.c1': 'VCP-ABC', 'adp2.r1.c1': 'FROM-A' }, att: {} },
            { proj: 'OTHER_L', rank: 2, unit: 'MVD', rev: 'R2', dk: 'product-spec#MVD', customer: 'LNW', ident: adOther,
              fields: { 'vcp.r1.c1': 'VCP-LNW', 'cvi.r1.c1': 'VIN-L' }, att: {} }]);
        var bs1 = window.tabData.briefSpec;
        window.tabData.briefSpec = bs1.concat([{ sub: 'Native Resolution', modelA: '1920 x 1080' }]);
        var cR = window._dgCollect(), HR = window.DOC_AUTO_HOOKS.ps;
        var r1 = HR(cR, 'adp1.r1.c1');
        check(r1.v === 'GND' && r1.src === '📑 UPPER V00 사양서'
              && /A\/D 커넥터 핀 표 ← 이 프로젝트 UPPER V00 사양서 \(같은 A\/D 777010\)/.test(HR(cR, 'refSummary').v),
              '같은 A/D 보드 다른 모델의 핀 표 + 칸 출처(짧게) + 맨 위 요약에 이유 (' + r1.v + ' / ' + r1.src + ')');
        check(HR(cR, 'adH1').v === 'J1 : 4 Pin External Power' && HR(cR, 'osd.r1.c1').v === 'MENU' && HR(cR, 'pwrTermPn').v === 'TERM-UP',
              '커넥터 제목·OSD·단자 PN 도 같은 문서에서');
        check(HR(cR, 'adp2.r1.c1').v === '', '한 묶음은 한 문서에서만 — 고른 문서(UPPER)에 없는 칸을 다른 문서로 채우지 않는다 (' + HR(cR, 'adp2.r1.c1').v + ')');
        check(HR(cR, 'cvi.r1.c1').v === '', '컨버터가 다르면 컨버터 핀 표는 안 옮긴다 (' + HR(cR, 'cvi.r1.c1').v + ')');
        check(HR(cR, 'vcp.r1.c1').v === 'VCP-LNW' && /OTHER_L MVD V01/.test(HR(cR, 'vcp.r1.c1').src),
              'VCP 는 같은 A/D 보드 + **같은 고객** 문서에서 (' + HR(cR, 'vcp.r1.c1').v + ')');
        check(HR(cR, 'tim.r3.c1').v === '148.35' && /📑/.test(HR(cR, 'tim.r3.c1').src) && HR(cR, 'tim.r4.c1').v === '1920',
              '같은 A/D·같은 해상도면 타이밍은 그 문서 값이 표준보다 먼저, 빈 칸은 표준 (' + HR(cR, 'tim.r3.c1').v + ')');
        check(HR(cR, 'adp1.r1.c1', { hardOnly: true }).v === '' && HR(cR, 'tim.r3.c1', { hardOnly: true }).v === '',
              '불러오기 판정(hardOnly)에선 다른 사양서·표준 타이밍이 "앱 값"이 아니다');
        var pR = window._psPayload();
        check(pR.images.img_adbd && pR.images.img_adbd[0].name === 'up_adbd.png' && pR.images.img_adbd[0].cx === 100 && !pR.images.img_conv,
              '그림도 같은 묶음 문서에서(컨버터 그림은 안 옴)');
        check(pR.values['adp1.r1.c1'] === 'GND' && /A\/D 커넥터 핀 표 ← 이 프로젝트 UPPER/.test(HR(cR, 'refSummary').v),
              '원본저장에 실림 + 맨 위 요약 칸 (' + HR(cR, 'refSummary').v + ')');
        // 블록도는 터치 구성까지 같아야 — 둘 다 터치 없음이면 오고, 참고 모델에만 터치가 있으면 안 온다
        window.tabData.documents['product-spec#UPPER'].revisions.R1.att.img_block = [{ folder: 'DOCUMENT/X/PRODUCT SPEC/attach', name: 'up_block.png' }];
        window.tabData.bomByUnit.UPPER.rows[1].IDNRK = '777020';           // 블록도는 컨버터도 같아야 — 이 확인 동안만
        window._psRef.set(window._psRef.scan.docs.slice());
        var hasBlk = !!(window._psPayload().images.img_block || [])[0];
        window.tabData.bomByUnit.UPPER.rows.push({ _level: 1, IDNRK: '777030', OJTXP: 'PBA-T>TOUCH,TCTRL-TEST,R0', WGBEZ60: 'BD 반제품/PBA' });
        window._psRef.set(window._psRef.scan.docs.slice());
        var noBlk = !window._psPayload().images.img_block;
        check(hasBlk && noBlk, '블록도 — 둘 다 터치 없음이면 옮기고, 참고 모델에만 터치가 있으면 안 옮긴다 (' + hasBlk + ', ' + noBlk + ')');
        window.tabData.bomByUnit.UPPER.rows.pop();
        window.tabData.bomByUnit.UPPER.rows[1].IDNRK = '777029';
        delete window.tabData.documents['product-spec#UPPER'].revisions.R1.att.img_block;
        window._psRef.set(window._psRef.scan.docs.slice());
        var hintSec = f.sections.filter(function (s) { return s.key === 'img_adbd'; })[0];
        check(hintSec && /up_adbd\.png/.test(hintSec.hint), '그림 칸 안내에 들어갈 그림을 적는다');
        window._docDataOf('product-spec').fields['adp1.r1.c1'] = 'MINE';
        check(window._psPayload().values['adp1.r1.c1'] === 'MINE', '사람이 적은 값이 이긴다');
        delete window._docDataOf('product-spec').fields['adp1.r1.c1'];
        window.tabData.bomByUnit.UPPER.rows[0].IDNRK = '777013';            // UPPER 의 A/D 보드가 다르면
        window._psRef.set([]);
        check(window.DOC_AUTO_HOOKS.ps(window._dgCollect(), 'adp1.r1.c1').v === '', 'A/D 보드가 다르면 안 옮긴다');
        // 같은 모델의 다른 리비전 — 부품을 물을 것 없이 그 문서에서(지금 보는 리비전 자신은 빼고).
        //   A/D 보드를 **아무 데서도 모르게** 해도(BOM·주요자재·Project list 에서 뺌) 같은 모델이면 가져온다
        var rv = window._docDataOf('product-spec');                     // 지금 R1
        rv.fields['adp3.r1.c1'] = 'R1-OWN';
        window.tabData.documents['product-spec#LOWER'].revisions.R2 = { fields: { 'tim.r0.c1': 'x' } };
        window._docState.revision = 'R2';
        var adRow = window.tabData.bomByUnit.LOWER.rows.splice(1, 1)[0];
        var mAd = window.tabData.projectModels[0].materials;
        window.tabData.projectModels[0].materials = mAd.filter(function (m) { return m.category !== 'AD BOARD'; });
        var plAd = window._plData.rows[0].adbd; delete window._plData.rows[0].adbd;
        var cRv = window._dgCollect();
        check(window.DOC_AUTO_HOOKS.ps(cRv, 'adp3.r1.c1').v === 'R1-OWN', '같은 모델 다른 리비전(R1)에서 — 부품을 몰라도 (' + window.DOC_AUTO_HOOKS.ps(cRv, 'adp3.r1.c1').v + ')');
        window.tabData.bomByUnit.LOWER.rows.splice(1, 0, adRow);
        window.tabData.projectModels[0].materials = mAd; window._plData.rows[0].adbd = plAd;
        delete window.tabData.documents['product-spec#LOWER'].revisions.R2;
        window._docState.revision = 'R1';
        delete rv.fields['adp3.r1.c1'];
        delete window.tabData.documents['product-spec#UPPER'];
        window.tabData.briefSpec = bs1;
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
        // 💡 BLU — 값에 적힌 (Typ.)·(Max.) 표시로 칸을 고른다, 표시 없는 전압은 안 넣는다
        var pSp = window._epLibCache.panel.panels[0].specs;
        pSp['Lamps Power Consumption'] = '26.5W (Typ.) / 27.8W (Max.)'; pSp['Lamp Voltage'] = '49V';
        var cB = window._dgCollect();
        var bl = ['blu.r4.c3', 'blu.r4.c4', 'blu.r4.c2', 'blu.r3.c3'].map(function (k) { return window.DOC_AUTO_HOOKS.ps(cB, k).v; });
        check(bl.join('|') === '26.5|27.8||', 'BLU 전력 Typ/Max 표시대로, 표시 없는 전압은 비움 (' + bl.join('|') + ')');
        delete pSp['Lamps Power Consumption']; delete pSp['Lamp Voltage'];
        // 📄 PDF 로 본 뒤 고친 모양 둘 — 시야각 마지막 칸은 숫자만, 문단 안 Vendor Name 은 한 줄로
        pSp['Viewing Angle (L/R/U/D)'] = '85/85/80/80 (Typ.) (CR≥10)';
        var vm0 = window._plData.rows[0].panelMfr; window._plData.rows[0].panelMfr = 'VENDA\nVENDB';
        var pV = window._psPayload();
        check(pV.values['va.r3.c4'] === '80' && pV.values.panelVendor === 'VENDA / VENDB',
              '시야각 숫자만·Vendor Name 한 줄 (' + pV.values['va.r3.c4'] + ' / ' + pV.values.panelVendor + ')');
        window._plData.rows[0].panelMfr = vm0; delete pSp['Viewing Angle (L/R/U/D)'];
        // 🕒 타이밍 표 — 1열 패널 원래 해상도, 2·3열 같은 화면비 상세 블록, 4~6열 Established, 값은 표준 표
        pSp['Dot Resolution'] = '1920 (H) × 1080 (V)';
        var cT = window._dgCollect(), HT = window.DOC_AUTO_HOOKS.ps;
        var tv = function (r, c) { return HT(cT, 'tim.r' + r + '.c' + c).v; };
        var res6 = [1, 2, 3, 4, 5, 6].map(function (c) { return tv(1, c); }).join(',');
        check(res6 === '1920x1080,1280x720,1366x768,640x480,800x600,1024x768', '타이밍 열 구성(화면비 같은 상세만) (' + res6 + ')');
        check(tv(3, 1) === '148.5' && tv(11, 2) === '748' && tv(12, 1) === '+hsync' && tv(12, 4) === '' && tv(14, 4) === ''
              && /표준 타이밍/.test(HT(cT, 'tim.r3.c1').src),
              '표준 타이밍 값·극성은 상세 열만·출처 (' + [tv(3, 1), tv(11, 2), tv(12, 1), tv(12, 4)].join('|') + ')');
        pSp['Dot Resolution'] = '1920 x 1200';            // 16:10 패널 — 16:9 상세 모드(1920x1080·1280x720)가 끼면 안 된다
        var cT3 = window._dgCollect();
        var d3 = [2, 3].map(function (c) { return HT(cT3, 'tim.r1.c' + c).v; }).join(',');
        check(d3 === '1680x1050,1440x900', '16:10 패널은 16:10 상세 모드만 (' + d3 + ')');
        pSp['Dot Resolution'] = '480 x 272';
        var cT2 = window._dgCollect();
        check(HT(cT2, 'tim.r1.c1').v === '480x272' && HT(cT2, 'tim.r3.c1').v === '' && /없음/.test(HT(cT2, 'tim.r3.c1').src)
              && HT(cT2, 'tim.r1.c4').v === '', '표준 표에 없는 해상도는 비우고 이유 · 원래 해상도보다 큰 열은 안 넣음');
        // 🧬 [2026-11-25] 이 모델에 불러 둔 실제 EDID(js/69) 가 있으면 타이밍 표는 EDID 에서 — 합성 EDID 둘(DP·HDMI)
        var mkEdid = function (dtds, est35) {
            var b = []; for (var z = 0; z < 128; z++) b.push(0);
            [0, 255, 255, 255, 255, 255, 255, 0].forEach(function (v, i) { b[i] = v; });
            b[18] = 1; b[19] = 3; b[20] = 0x80; b[35] = est35;
            for (var s = 38; s < 54; s++) b[s] = 1;
            dtds.forEach(function (t, k) {
                var o = 54 + k * 18, p = t[0] / 10;
                b[o] = p & 255; b[o + 1] = p >> 8; b[o + 2] = t[1] & 255; b[o + 3] = t[2] & 255; b[o + 4] = ((t[1] >> 8) << 4) | (t[2] >> 8);
                b[o + 5] = t[5] & 255; b[o + 6] = t[6] & 255; b[o + 7] = ((t[5] >> 8) << 4) | (t[6] >> 8);
                b[o + 8] = t[3]; b[o + 9] = t[4]; b[o + 10] = (t[7] << 4) | t[8]; b[o + 17] = t[9];
            });
            for (var d = 54 + dtds.length * 18; d < 126; d += 18) b[d + 3] = 0x10;
            var sum = 0; for (var q = 0; q < 127; q++) sum += b[q]; b[127] = (256 - (sum & 255)) & 255;
            return window.EDID.hex(b);
        };
        //   [kHz, H활성, H블랭크, H앞, H싱크, V활성, V블랭크, V앞, V싱크, 플래그] — 2560x1440 CVT-RB(+h −v) · 1920x1080 CTA
        var D2560 = [241500, 2560, 160, 48, 32, 1440, 41, 3, 5, 0x1A], D1080 = [148500, 1920, 280, 88, 44, 1080, 45, 4, 5, 0x1E];
        var edUnit = window.resActiveUnit();
        window.tabData.resolutionEdidByUnit = {};
        window.tabData.resolutionEdidByUnit[edUnit] = {
            HDMI: { file: 'EDID_HDMI.bin', hex: mkEdid([D1080], 0x20) },
            DP: { file: 'EDID_DP.bin', hex: mkEdid([D2560, D1080], 0xA1) }      // Established: 720x400@70 · 640x480@60 · 800x600@60
        };
        pSp['Dot Resolution'] = '2560 x 1440';
        var cE = window._dgCollect();
        var ev = function (r, c, o) { return HT(cE, 'tim.r' + r + '.c' + c, o).v; };
        var eRes = [1, 2, 3, 4, 5, 6].map(function (c) { return ev(1, c); }).join(',');
        check(eRes === '2560x1440,1920x1080,,720x400,640x480,800x600', 'EDID 열 구성 = DTD1·DTD2·(없음)·Established (' + eRes + ')');
        var col1 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(function (r) { return ev(r, 1); }).join('|');
        check(col1 === '241.5|2560|2608|2640|2720|1440|1443|1448|1481|+hsync|-vsync|YES', 'Preferred 열 = EDID DTD1 숫자 그대로 (' + col1 + ')');
        check(/EDID ▸ DP ▸ EDID_DP\.bin ▸ DTD1/.test(HT(cE, 'tim.r3.c1').src), '출처에 포트·파일·DTD (' + HT(cE, 'tim.r3.c1').src + ')');
        check([0, 1, 3, 4, 7, 12, 14].every(function (r) { return ev(r, 3) === ''; }) && /모드 없음/.test(HT(cE, 'tim.r1.c3').src),
              'EDID 에 DTD3 이 없으면 3열은 비운다 — 표준·다른 사양서로 섞지 않는다');
        check(ev(3, 5) === '25.175' && /Established ▸ 값은 표준 VESA DMT/.test(HT(cE, 'tim.r3.c5').src) && ev(12, 5) === '',
              'Established 열은 표준 DMT 숫자·극성 없음 (' + ev(3, 5) + ')');
        check(ev(1, 4) === '720x400' && ev(3, 4) === '' && /720x400@70 없음/.test(HT(cE, 'tim.r3.c4').src),
              '표준 표에 없는 Established 모드는 숫자 비우고 이유');
        check(ev(3, 1, { hardOnly: true }) === '241.5', 'EDID 는 "앱 값" — 불러온 사양서보다 이긴다(hardOnly)');
        var pE = window._psPayload();
        check(pE.values['tim.r3.c1'] === '241.5' && pE.values['tim.r11.c1'] === '1481' && (pE.values['tim.r1.c3'] || '') === '',
              '원본저장(.docx)으로 보내는 값에도 EDID 가 실린다 (' + [pE.values['tim.r3.c1'], pE.values['tim.r11.c1']].join('|') + ')');
        pSp['Dot Resolution'] = '1920 x 1080';
        var cE2 = window._dgCollect();
        check(HT(cE2, 'tim.r1.c1').v === '1920x1080' && /EDID ▸ HDMI/.test(HT(cE2, 'tim.r1.c1').src) && HT(cE2, 'tim.r1.c2').v === '',
              '패널 해상도와 기본 해상도가 같은 포트(HDMI)의 EDID 를 고른다 (' + HT(cE2, 'tim.r1.c1').src + ')');
        delete window.tabData.resolutionEdidByUnit;
        pSp['Dot Resolution'] = '2560 x 1440';
        var cE3 = window._dgCollect();
        check(HT(cE3, 'tim.r3.c1').v === '312.25' && /표준 타이밍/.test(HT(cE3, 'tim.r3.c1').src), 'EDID 가 없으면 예전처럼 표준 초안');
        delete pSp['Dot Resolution'];
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

        // 📚 양식 계열(2026-11-25) — 'psFamily' 칸으로 칸 목록·원본저장 양식이 바뀐다. 같은 뜻 칸은 같은 열쇠라 자동값이 그대로 통한다.
        var fF = window._docDataOf('product-spec').fields;
        var pS = window._psPayload();
        check(pS.family === 'stellar', '계열을 안 정하면 stellar');
        fF.psFamily = 'obsidian';
        var pO = window._psPayload();
        var secO = f.sections.map(function (s) { return s.title || ''; }).join(' | ');
        check(pO.family === 'obsidian' && 'scr.r113.c1' in pO.values && 'amr.r3.c2' in pO.values && 'adp2.r1.c7' in pO.values
              && !('adp10.r1.c0' in pO.values) && !('tim.r1.c6' in pO.values),
              'obsidian 칸 목록 — Gamma·충격 줄·8열 핀 표 있음, 커넥터 10번째·타이밍 6열 없음 (' + pO.family + ')');
        check(/LED Driver/.test(secO) && /VCP Code Table/.test(secO), 'obsidian 화면 구역 제목 (' + secO.slice(0, 80) + '…)');
        var same = ['cover.r1.c0', 'cover.r1.c2', 'parts.r1.c3', 'scr.r12.c1', 'cie.r2.c1', 'cert.r2.c3', 'rev.r1.c2'];
        check(same.every(function (k) { return pO.values[k] === pS.values[k] && pS.values[k] !== ''; }),
              '같은 뜻 칸은 같은 열쇠 — 앱 자동값이 계열과 상관없이 같다 (' + same.map(function (k) { return k + '=' + pO.values[k] + '/' + pS.values[k]; }).join(', ') + ')');
        check(pO.values.hdrKtkPn === undefined, 'OBSIDIAN 머리글엔 KTK PN 칸이 없다(원본이 그렇다)');
        fF.psFamily = 'nope';
        check(window._psPayload().family === 'stellar', '모르는 계열 이름이면 stellar');
        delete fF.psFamily;
        // 📑 계열 칸이 비면 참고 사양서(같은 보드 제품 문서)의 계열 — 불러오기 없이 앱 정보만으로도 그 양식 모양으로 나간다
        window.tabData.documents['product-spec#LOWER'].revisions.R2 = { fields: { psFamily: 'obsidian55', 'adp1.r1.c1': 'REF-P4' } };
        window._psRef.set([]);
        var pRf = window._psPayload();
        check(pRf.family === 'obsidian55' && !('vcp.r1.c1' in pRf.values) && pRf.values['adp1.r1.c1'] === 'REF-P4',
              '계열 칸이 비면 📑 참고 사양서의 계열 (' + pRf.family + ')');
        fF.psFamily = 'stellar';
        window._psRef.set([]);
        check(window._psPayload().family === 'stellar', '사람이 정한(불러오기가 정한) 계열이 참고 사양서보다 먼저');
        delete fF.psFamily;
        delete window.tabData.documents['product-spec#LOWER'].revisions.R2;
        window._psRef.set([]);
        check(window._psPayload().family === 'stellar', '참고 사양서가 없으면 다시 stellar');

        // 🩹 14차 실측(2026-11-25, SHUFFLER 4.3 — 불러오기 없이 원본저장)에서 찾은 잘못
        //   ① 스위치 묶음(SWC)이라도 설치지점이 커넥터·스위치 자리 이름(J/SW…)이 아니면(EMI1~4) A/D 연결표에 안 넣는다
        window.tabData.bomByUnit = { LOWER: { rows: [
            { _level: 1, IDNRK: '777010', OJTXP: 'PBA-AD>VIDEO,ADB-TEST,R1,V00', WGBEZ60: 'BD 반제품/PBA' },
            { _level: 2, IDNRK: '700009', OJTXP: 'SWC PUSH-BTN>S,SQ-99G,SR,1P', WGBEZ60: '회로자재/SWITCH', EBORT: 'EMI1,EMI2,EMI3,EMI4', MFRPN: 'EMI STOP' },
            { _level: 2, IDNRK: '700002', OJTXP: 'SWC TACT>S,9999SB9,SR,4P', WGBEZ60: '회로자재/SWITCH', EBORT: 'SW1,SW2,SW3,SW4', MFRPN: 'CT 전자' },
            { _level: 2, IDNRK: '700001', OJTXP: 'CON>D,NOR,ABC200-04,4P1MS,200', WGBEZ60: '회로자재/CONNECTOR', EBORT: 'J1', MFRPN: '연호전자' }] } };
        var cE = window._dgCollect(), HE = window.DOC_AUTO_HOOKS.ps;
        var syms = [1, 2, 3].map(function (n) { return HE(cE, 'adc.r' + n + '.c0').v; });
        check(syms.join(',') === 'J1,SW1~4,' , 'EMI 자리 스위치는 A/D 연결표에서 빠지고 OSD 키(SW1~4)·커넥터는 남는다 (' + syms.join(',') + ')');
        //   ④ 16차 실측(SHUFFLER 3.0·4.3): A/D 보드가 달라도 **같은 고객 + 같은 스케일러 IC** 면 VCP 를 가져온다(VCP 110칸이 같았다).
        //      핀 표는 그래도 A/D 보드가 같아야만(다른 보드 핀 표는 J 번호부터 다르다)
        window.tabData.bomByUnit.LOWER.rows.push({ _level: 2, IDNRK: '888001', OJTXP: 'IC_SCALR>S,RTD9999T,HDMI/DP,2K,LVDS', WGBEZ60: '회로자재/IC-VIDEO' });
        var otherAd = { code: '777555', name: 'ADBOTHER' };
        var candS = function (scCode, cust) {
            return { proj: 'OTHER_S', rank: 2, unit: 'PTD', rev: 'R1', dk: 'product-spec#PTD', customer: cust,
                     ident: { adbd: otherAd, conv: false, touch: false, scaler: { code: scCode, name: 'RTD9999T' } },
                     fields: { 'vcp.r1.c1': 'VCP-SC', 'adp1.r1.c1': 'PIN-OTHER', adH1: 'J9 : OTHER' }, att: {} };
        };
        window._psRef.set([candS('888001', 'LNW')]);
        var cS = window._dgCollect();
        check(HE(cS, 'vcp.r1.c1').v === 'VCP-SC' && /같은 SCALER 888001/.test(HE(cS, 'refSummary').v) && HE(cS, 'adp1.r1.c1').v !== 'PIN-OTHER',
              'A/D 보드가 달라도 같은 고객·같은 스케일러면 VCP 는 가져오고 핀 표는 안 가져온다 (' + HE(cS, 'vcp.r1.c1').v + ' / ' + HE(cS, 'adp1.r1.c1').v + ')');
        window._psRef.set([candS('888999', 'LNW')]);
        check(window.DOC_AUTO_HOOKS.ps(window._dgCollect(), 'vcp.r1.c1').v !== 'VCP-SC', '스케일러가 다르면 VCP 를 안 가져온다');
        window._psRef.set([candS('888001', 'ABC')]);
        check(window.DOC_AUTO_HOOKS.ps(window._dgCollect(), 'vcp.r1.c1').v !== 'VCP-SC', '고객이 다르면 VCP 를 안 가져온다');
        window._psRef.set([]);
        delete window.tabData.bomByUnit;
        //   ② 모델명 SAP 내역 모양('PTD>…@VINA') → 머리·꼬리 뗌(표지·Scope 둘 다)  ③ 인치 '04.3' → '4.3'
        var cardM = window.tabData.projectModels[0], mName0 = cardM.KTK모델명, pmName0 = window.projectMeta.KTK모델명, inch0 = window.projectMeta.인치;
        cardM.KTK모델명 = 'PTD>KTS999TEST01,LNW@VINA'; window.projectMeta.KTK모델명 = cardM.KTK모델명; window.projectMeta.인치 = '04.3';
        var cM = window._dgCollect();
        var cv = HE(cM, 'cover.r1.c1').v, sc = HE(cM, 'scope').v;
        check(cv === 'KTS999TEST01,LNW' && /specification of 4\.3” TFT/.test(sc) && /\. KTS999TEST01,LNW is a High/.test(sc),
              '모델명 머리·꼬리 떼기·인치 앞 0 떼기 (' + cv + ' / ' + sc.slice(0, 90) + ')');
        cardM.KTK모델명 = mName0; window.projectMeta.KTK모델명 = pmName0; window.projectMeta.인치 = inch0;

        // 📥 불러오기 섞임 3가지(2026-11-25, OBSIDIAN 27 사양서를 OBSIDIAN27 DB 에 불러와 Word 로 보고 찾음) — 합성 문서로 늘 돈다
        //   ① A/D 연결표는 원본 줄을 Symbol 로 BOM 줄에 맞춘다(순서로 넣으면 'J2 = DC JACK') · BOM 에 없는 설치지점은 뺀다
        //   ② 다른 제품(KTK PN 다름) 사양서의 개정 이력은 안 가져온다 · 같은 제품이면 가져온다
        //   ③ 원본에서 읽은 표의 나머지 칸은 초안(표준 타이밍)이 안 채운다
        window.tabData.bomByUnit = { LOWER: { rows: [
            { _level: 1, IDNRK: '777010', OJTXP: 'PBA-AD>VIDEO,ADB-TEST,R1,V00', WGBEZ60: 'BD 반제품/PBA' },
            { _level: 2, IDNRK: '700001', OJTXP: 'CON>D,NOR,ABC200-04,4P1MS,200', WGBEZ60: '회로자재/CONNECTOR', EBORT: 'J1,J7', MFRPN: '연호전자' },
            { _level: 2, IDNRK: '700002', OJTXP: 'SWC TACT>S,9999SB9,SR,4P', WGBEZ60: '회로자재/SWITCH', EBORT: 'SW1,SW2,SW3,SW4', MFRPN: 'CT 전자' },
            { _level: 2, IDNRK: '700003', OJTXP: 'JACK USB>D,2,B,AN,KUSB99,H,4P,PCB,WHT', WGBEZ60: '회로자재/JACK', EBORT: 'J3', MFRPN: '어느전자' }] } };
        var bsI = window.tabData.briefSpec;
        window.tabData.briefSpec = bsI.concat([{ sub: 'Native Resolution', modelA: '1920 x 1080' }]);
        var draftBefore = window.DOC_AUTO_HOOKS.ps(window._dgCollect(), 'tim.r1.c2').v;
        var fI = window._docDataOf('product-spec').fields;
        fI['adc.r1.c1'] = 'STALE-ROW-ORDER';                  // 지난번(줄 순서) 불러오기가 넣어 둔 값
        fI['rev.r2.c3'] = 'OTHER HISTORY';                    // 지난번 불러오기가 넣어 둔 다른 제품 이력
        var synth = function (pn) {
            return JSON.stringify({ ok: true, variant: 'base', layout: null, align: { ratio: 1 }, skipped: [], images: {}, shape: [],
                values: { 'cover.r1.c0': pn, 'rev.r2.c0': '2020-01-01', 'rev.r2.c3': 'OTHER HISTORY',
                    'adc.r1.c0': 'J9', 'adc.r1.c1': 'NOT IN BOM',
                    'adc.r2.c0': 'J7', 'adc.r2.c1': 'EXT OSD', 'adc.r2.c2': 'WRONGPN',
                    'adc.r3.c0': 'J1', 'adc.r3.c1': 'POWER IN',
                    'adc.r4.c0': 'SW1~4', 'adc.r4.c1': 'OSD KEY',
                    'tim.r1.c1': '1920x1080', 'tim.r3.c1': '148.5' } });
        };
        var runImport = async function (pn) {
            var body = synth(pn);
            window.fetch = function (u) {
                if (String(u).indexOf('/doc/product-spec-parse') >= 0) return Promise.resolve(new Response(body, { status: 200 }));
                return saved.fetch.apply(this, arguments);
            };
            toasts.length = 0;
            await window._docImportFile(new File([new Uint8Array([80, 75])], 'spec.docx'));
            window.fetch = saved.fetch;
            return window._psPayload().values;
        };
        var vI = await runImport('888777');
        var row = function (r) { return [vI['adc.r' + r + '.c0'], vI['adc.r' + r + '.c1'], vI['adc.r' + r + '.c2']].join('|'); };
        check([1, 2, 3, 4].map(row).join(' / ') === 'J1|POWER IN|ABC200-04 / J3||KUSB99 / J7|EXT OSD|ABC200-04 / SW1~4|OSD KEY|9999SB9',
              '① 원본 줄을 Symbol 로 BOM 줄에 맞춤·품번은 BOM (' + [1, 2, 3, 4].map(row).join(' / ') + ')');
        check(!Object.keys(vI).some(function (k) { return vI[k] === 'NOT IN BOM' || vI[k] === 'STALE-ROW-ORDER'; }),
              '① BOM 에 없는 설치지점(J9)·지난번 줄 순서 값은 안 남는다');
        var lastToast = (toasts.filter(function (t) { return /불러왔습니다/.test(t[1]); })[0] || [])[1] || '';
        check(/J9/.test(lastToast) && /다른 제품/.test(lastToast), '① ② 뺀 것을 토스트로 알린다 (' + lastToast.replace(/\n/g, ' ') + ')');
        check(vI['rev.r2.c3'] === '' && vI['rev.r2.c0'] !== '2020-01-01', '② 다른 제품 사양서의 개정 이력은 안 가져옴 (' + vI['rev.r2.c3'] + ')');
        check(draftBefore !== '' && vI['tim.r1.c2'] === '' && vI['tim.r3.c1'] === '148.5',
              '③ 불러온 타이밍 표의 빈 열은 초안이 안 채움 (전 "' + draftBefore + '" → "' + vI['tim.r1.c2'] + '")');
        var vS = await runImport('999001');                    // 같은 제품이면 이력을 가져온다
        check(vS['rev.r2.c3'] === 'OTHER HISTORY', '② 같은 제품(KTK PN 같음)이면 개정 이력도 가져옴 (' + vS['rev.r2.c3'] + ')');
        window.tabData.documents = {};
        window.tabData.briefSpec = bsI;
        delete window.tabData.bomByUnit;

        // 📂 불러오기 — 실제 사양서를 백엔드가 읽은 결과가 있으면
        var parsedText = null;
        try { var rr = await saved.fetch('tests/_tmp_ps_parse.json', { cache: 'no-store' }); if (rr.ok) parsedText = await rr.text(); } catch (e0) { /* 없음 */ }
        if (parsedText) {
            var j = JSON.parse(parsedText);
            // 표준 타이밍이 **있는** 상태로 불러온다 — 그래야 "불러온 실제 EDID 가 표준 초안에 지지 않는가"를 본다
            var natJ = String(j.values['tim.r1.c1'] || '').match(/(\d{3,5})\s*[x×X]\s*(\d{3,5})/);
            if (natJ) window.tabData.briefSpec = window.tabData.briefSpec.concat([{ sub: 'Native Resolution', modelA: natJ[1] + ' x ' + natJ[2] }]);
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
            var otherProd = String(j.values['cover.r1.c0'] || '').replace(/\W/g, '') !== '999001';
            if (otherProd) check(Object.keys(j.values).filter(function (k) { return window.PS_IMPORT_SAME_PRODUCT.test(k) && String(j.values[k]).trim(); })
                                     .every(function (k) { return String(p2.values[k] || '') !== String(j.values[k]) || /^rev\.r1\./.test(k); }),
                                 '다른 제품 사양서 — 개정 이력(2줄 이후)은 원본저장에 안 실림');
            Object.keys(j.values).forEach(function (k) {
                if (otherProd && window.PS_IMPORT_SAME_PRODUCT.test(k)) return;   // ② 일부러 안 가져온 칸
                // 앱이 **아는** 값(hardOnly)만 불러온 값을 이긴다 — 표준 타이밍·다른 사양서는 불러온 값에 진다
                var auto = window.PS_AUTO[k] ? window.DOC_AUTO_HOOKS.ps(ctx, k, { hardOnly: true }).v : '';
                if (!auto && !String(j.values[k]).trim()) return;       // 원본이 비운 칸 — 초안(표준 타이밍)이 채워도 된다
                var exp = auto || j.values[k];
                if (p2.values[k] !== exp && !(String(exp).trim() === '' && String(p2.values[k] || '').trim() === '')) { bad++; if (bad < 4) log.push('✗ 값 ' + k); }
            });
            check(bad === 0, '불러온 값/앱 값이 원본저장에 그대로 실려야 (어긋남 ' + bad + ')');
            check(Object.keys(j.images).every(function (k) { var a = (p2.images[k] || [])[0]; return a && a.cx === j.images[k].cx && a.cy === j.images[k].cy; }),
                  '그림의 원래 크기(cx,cy)가 실려야');
            check(JSON.stringify(p2.layout) === JSON.stringify(j.layout), '쪽 맞춤 빈 줄(layout)이 실려야');
            // 빈 값은 저장하지 않는다 — 단 원본에서 읽은 표의 칸을 초안이 못 채우게 막는 빈 값(③)은 예외
            var owned = Object.keys(window._docDataOf('product-spec').fields).filter(function (k) {
                return !String(window._docDataOf('product-spec').fields[k]).trim() && !(window.PS_AUTO[k] && window.DOC_AUTO_HOOKS.ps(ctx, k).v !== '' && !window.DOC_AUTO_HOOKS.ps(ctx, k, { hardOnly: true }).v && /\.r\d+\.c\d+$/.test(k));
            });
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
        if (window._psRef) window._psRef.reset();
    }
    return ok + ' 통과 / ' + fail + ' 실패' + (log.length ? '\n' + log.join('\n') : '');
};
