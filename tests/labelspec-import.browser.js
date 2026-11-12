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
//  ⚠️ `/sap-label-search`·`/sap-open-file`·`/sap-label-images`·`/sap-label-image-bytes` 는
//     백엔드 재시작이 필요해 **이 하네스에선 안 본다**(그건 `tests/test_sap_label_search.py`
//     가 app.test_client() 로 본다). 대신 `await __labelArtTest()` 가 그 라우트들과
//     `_dgUploadBlob` 을 **네트워크 경계에서만** 가짜로 바꿔(fetch 가로채기) 찾기→미리보기→
//     고르기→공용 라이브러리 저장까지의 **클라이언트 쪽 로직**을 검증한다 — 특히
//     "`DOCUMENT/<프로젝트>/...` 가 아니라 `라벨도안/<코드>.<ext>` 공용 폴더에 저장되는가"
//     (사용자 지적: "공통문서라서 프로젝트로 가면 안 될 것 같다").
//  ⚠️⚠️ **(2026-11-12 실측 버그, 사용자 신고 "토스트만 뜨고 아무 반응 없음")** 썸네일 "고르기" 는
//     `_docLabelPickImage` 를 **직접 부르지 않고 실제 렌더된 <img> 를 `.click()`** 한다 — 윈도
//     경로(백슬래시+숫자, 예 `\1`)를 onclick="...('...')" 에 그대로 넣었더니 JS 가 8진
//     이스케이프로 읽어 경로가 조용히 깨지는 버그였는데, 함수를 직접 호출하는 시험으로는
//     그 깨짐이 **onclick 문자열이 브라우저에서 다시 파싱될 때만** 나타나서 절대 못 잡는다
//     (이 하네스도 처음엔 직접 호출로 썼다가 그 버그를 놓쳤다).
//  ⚠️⚠️ **(2026-11-12 11차, 사용자 신고 "이미지는 커졌는데 도표는 조정되지 않음" +
//     "문서 기본 양식 반영해서 수정해줘")** 표시·자르기·크기조절을 표 안에서 전부 빼서
//     **전용 모달**(`#doclabelart-overlay`)로 옮겼다 — 메인 표는 실제 문서처럼 항상 작은
//     썸네일만 둔다. 이 하네스도 모달을 열어(`_docLabelArtModalOpen`) 그 안의
//     `#doclabelart-img`/크기 손잡이/자르기 드래그를 본다. 자르기 적용은 **일부러 업로드를
//     실패시켜** 예외가 나도 토스트가 뜨는지까지 본다(사용자 신고 "자르기 적용 눌렀는데
//     아무 반응 없음" 재발 방지). PDF 는 `pdfjsLib` 를 스텁으로 바꿔 1페이지 추출 경로만 본다
//     (진짜 PDF 렌더는 라이브로 확인).
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

    // 🖼 [2026-11-12 2차] 도안 찾기 → 미리보기 → 고르기 → 공용 라이브러리 저장
    //    가짜는 fetch(네트워크)와 _dgUploadBlob(NAS 업로드) **둘뿐** — 그 사이의 렌더·상태
    //    전이·URL 조립은 전부 진짜 js/67 코드로 돈다.
    window.__labelArtTest = async function (opt) {
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

        var saved = {
            save: window.saveToGoogleDrive, dirty: window.markUnsavedChanges,
            docs: window.tabData && window.tabData.documents,
            state: window._docState && JSON.parse(JSON.stringify(window._docState)),
            fetch: window.fetch, dgUpload: window._dgUploadBlob, toast: window.showToast,
            pdfjsLib: window.pdfjsLib,
            artIndex: window._docLabelArtIndex, findResult: window._docLabelFindResult,
            findMatches: window._docLabelFindMatches, imgState: window._docLabelImgState,
            notesCache: window._docLabelNotesCache, sizeCache: window._docLabelSizeCache,
            artModal: window._docLabelArtModal
        };
        window.saveToGoogleDrive = function () { return Promise.resolve({ skipped: 'test' }); };
        window.markUnsavedChanges = function () {};
        window.tabData = window.tabData || {};
        window.tabData.documents = {};
        window._docLabelArtIndex = {};               // 빈 공용 라이브러리로 시작(아직 아무 코드도 없음)
        window._docLabelFindResult = {}; window._docLabelFindMatches = {}; window._docLabelImgState = {};
        window._docLabelNotesCache = {}; window._docLabelSizeCache = {}; window._docLabelArtModal = null;
        var toastCalls = [];
        window.showToast = function (msg, kind) { toastCalls.push({ msg: msg, kind: kind }); };

        var FAKE_CODE = '999001';
        // ⚠️⚠️ 일부러 "\1" 을 심는다 — 실측 버그(윈도 경로를 onclick="...('...')" 에 그대로
        //    박으면 JS 가 `\1` 을 8진 이스케이프로 읽어 조용히 깨졌다)가 **재발하면 바로 잡힌다**.
        //    실제 사고 경로와 글자 모양이 같다("...P01202300096\124291...").
        var FAKE_PATH = 'C:\\SAP_DMS\\원자재승인원\\P01100000001\\124291_LABEL STICKER-,PRO_CE_VINA,-,SLV,75X70 (1).XLSX';
        var uploadCalls = [];
        var imageBytesCalls = [];
        var searchCalls = [];
        window._dgUploadBlob = async function (folder, name, blob) {
            uploadCalls.push({ folder: folder, name: name, size: blob && blob.size });
            return { ok: true, name: name, size: blob && blob.size || 0 };
        };
        window.fetch = function (url, init) {
            var u = String(url);
            if (u.indexOf('/sap-label-search') >= 0) {
                searchCalls.push(u);
                return Promise.resolve({ status: 200, ok: true, json: function () {
                    return Promise.resolve({ ok: true, matches: [{ name: '124291_LABEL.XLSX', folder: '원자재승인원\\P01100000001', path: FAKE_PATH }], partial: false });
                } });
            }
            if (u.indexOf('/sap-label-images') >= 0) {
                return Promise.resolve({ status: 200, ok: true, json: function () {
                    return Promise.resolve({ ok: true, images: [{ inner: '', member: 'xl/media/image1.png', size: 12345 }], skipped: 1 });
                } });
            }
            if (u.indexOf('/sap-label-image-bytes') >= 0) {
                imageBytesCalls.push(u);
                return Promise.resolve({ status: 200, ok: true, blob: function () { return Promise.resolve(new Blob(['fake-png-bytes'], { type: 'image/png' })); } });
            }
            // ⚠️⚠️ [2026-11-12 11차 실측] 표시·크기 사이드카(`_docLabelNotesLoad`)가 모달을 열
            //    때마다 백엔드(`/doc/get`)로 **가짜 없이 실제 fetch** 를 쏘고 있었다 — 여기서
            //    안 막으면 실제 네트워크 요청(연결 거부)이 **비동기로 임의의 시점에** 풀려서
            //    업로드 횟수 검증이 가끔 흔들렸다(실측: 한 번은 39/41, 다시 돌리니 40/40). 404
            //    로 즉시 끊어 "아직 표시 없음"으로 빠지게 한다 — 레이스 자체를 없앤다.
            if (u.indexOf('/doc/get') >= 0 && u.indexOf('.notes.json') >= 0) {
                return Promise.resolve({ status: 404, ok: false });
            }
            // ⚠️⚠️ [2026-11-12 11차 실측 2] 이 하네스를 **연달아 여러 번** 돌리면 더 드물게
            //    실패했다 — `finally` 가 `_docLabelArtIndex` 를 이전 실행 전 값(첫 실행이면
            //    원래의 `null`)으로 되돌린 뒤 `_docRender()` 를 부르는데, 그 렌더가
            //    `_docLabelArtIndex === null` 을 보고 **실제** `/doc/list` 를 쏘는 배경 작업을
            //    새로 깨운다. 그 fetch 가 다음 실행 **도중** 임의의 시점에 풀려 `_docLabelArtIndex`
            //    를 다시 `null`/`{}` 로 덮어써 `[FAKE_CODE]` 읽기가 "null 의 속성" 으로 터졌다.
            //    `/doc/list` 도 막아 그 배경 작업 자체를 네트워크에 안 나가게 한다.
            if (u.indexOf('/doc/list') >= 0) {
                return Promise.resolve({ status: 200, ok: true, json: function () { return Promise.resolve({ ok: true, files: [] }); } });
            }
            return saved.fetch(url, init);
        };

        try {
            window.switchTab && window.switchTab('document');
            window._docPick('label-spec');
            var d = window.tabData.documents['label-spec'] = window.tabData.documents['label-spec'] || { fields: {}, att: {} };
            d.labelItems = [{ size: '75 X 70', code: FAKE_CODE, position: '제품', note: '' }];
            window._docRender();

            // ═══ 1. 찾기(코드) ═══
            await window._docLabelFind('label-spec', 0);
            var key = 'label-spec|0';
            var res1 = window._docLabelFindResult[key] || '';
            ok(res1.indexOf('124291_LABEL.XLSX') >= 0, '검색 결과에 파일명이 안 보인다: ' + res1);
            ok(res1.indexOf('미리보기') >= 0, '미리보기 토글 링크가 없다');
            ok(searchCalls[searchCalls.length - 1].indexOf('code=' + FAKE_CODE) >= 0,
               '코드 검색인데 code= 파라미터가 안 실렸다: ' + searchCalls[searchCalls.length - 1]);
            ok(res1.indexOf('SAP 에서') >= 0, '코드 검색엔 "SAP 에서 다시 받기" 링크가 있어야 한다: ' + res1);

            // ═══ 1b. [2026-11-12 10차] 규격으로도 찾기 — 코드 없이 규격만으로 ═══
            //    ⚠️ 규격 검색은 자재번호를 모르니 "SAP 에서 다시 받기" 링크가 **없어야** 한다.
            await window._docLabelFindBySize('label-spec', 0);
            var resSize = window._docLabelFindResult[key] || '';
            ok(searchCalls[searchCalls.length - 1].indexOf('q=' + encodeURIComponent('75 X 70')) >= 0,
               '규격 검색인데 q= 파라미터가 안 실렸다: ' + searchCalls[searchCalls.length - 1]);
            ok(resSize.indexOf('124291_LABEL.XLSX') >= 0, '규격 검색 결과에 파일명이 안 보인다: ' + resSize);
            ok(resSize.indexOf('SAP 에서') < 0, '규격 검색엔 "SAP 에서 다시 받기" 링크가 없어야 한다(코드를 모른다): ' + resSize);

            // ═══ 1c. 규격이 너무 짧으면 검색 자체를 막는다(백엔드 호출 전에) ═══
            d.labelItems[0].size = 'ab';
            var callsBefore = searchCalls.length;
            await window._docLabelFindBySize('label-spec', 0);
            ok(searchCalls.length === callsBefore, '규격이 짧은데도 검색 요청을 보냈다');
            d.labelItems[0].size = '75 X 70';   // 되돌려서 이후 단계(미리보기·고르기)가 코드 검색 결과를 쓰게

            // 다시 코드로 찾아 이후 단계(미리보기·고르기)가 쓸 결과를 맞춰 둔다
            await window._docLabelFind('label-spec', 0);

            // ═══ 2. 미리보기 펼치기 ═══
            await window._docLabelToggleImages(key, 0);
            var res2 = window._docLabelFindResult[key] || '';
            ok(res2.indexOf('/sap-label-image-bytes') >= 0, '썸네일 <img> 가 안 보인다: ' + res2);
            ok(res2.indexOf('member=xl%2Fmedia%2Fimage1.png') >= 0 || res2.indexOf('xl/media/image1.png') >= 0,
               '썸네일 URL 에 member 가 안 실렸다: ' + res2);

            // ═══ 3. 고르기 → 공용 라이브러리(라벨도안) 저장, 프로젝트 폴더 아님 ═══
            //    ⚠️⚠️ 함수를 직접 부르지 않고 **실제 렌더된 썸네일을 진짜로 클릭한다** — 이 버그는
            //    onclick="...('...')" 문자열이 브라우저에서 다시 파싱될 때만 나타나서, 함수를
            //    직접 호출하는 시험으로는 절대 못 잡는다(바로 이 방식으로 한 번 놓쳤다).
            window._docRender();
            var thumb = document.querySelector('#doc-page-body img[title*="image1.png"]');
            ok(!!thumb, '썸네일 <img> 를 실제 DOM 에서 못 찾았다');
            if (thumb) thumb.click();
            await new Promise(function (res) { setTimeout(res, 50); });   // 클릭 핸들러의 await 들이 풀리게

            ok(imageBytesCalls.length === 1, '/sap-label-image-bytes 가 한 번 안 불렸다: ' + imageBytesCalls.length);
            if (imageBytesCalls.length) {
                var calledPath = decodeURIComponent((imageBytesCalls[0].split('path=')[1] || '').split('&')[0]);
                ok(calledPath === FAKE_PATH,
                   '경로가 onclick 문자열을 거치며 깨졌다(실측 버그 — `\\1` 이 8진 이스케이프로 읽힘): '
                   + JSON.stringify(calledPath) + ' !== ' + JSON.stringify(FAKE_PATH));
            }
            ok(uploadCalls.length === 1, '_dgUploadBlob 이 한 번 안 불렸다: ' + uploadCalls.length);
            var up = uploadCalls[0] || {};
            ok(up.folder === '라벨도안', '프로젝트 폴더가 아니라 공용 폴더(라벨도안)에 저장돼야 한다: ' + up.folder);
            ok(up.name === FAKE_CODE + '.png', '파일 이름이 <코드>.<ext> 가 아니다: ' + up.name);
            ok(window._docLabelArtIndex[FAKE_CODE] === FAKE_CODE + '.png',
               '공용 인덱스에 코드가 안 올라갔다: ' + JSON.stringify(window._docLabelArtIndex));
            ok(!window._docLabelFindResult[key], '저장 후 찾기 상태가 안 지워졌다');

            // ═══ 4. 다시 그리면 재검색 없이 바로 보여야 한다(같은 인덱스 재사용) ═══
            window._docRender();
            var img = document.querySelector('#doc-page-body td img');
            ok(!!img, '저장한 도안이 라벨 줄에 안 보인다');
            if (img) {
                ok(img.src.indexOf('/doc/get') >= 0 && img.src.indexOf('folder=' + encodeURIComponent('라벨도안')) >= 0,
                   '도안 <img> src 가 공용 폴더를 안 가리킨다: ' + img.src);
                ok(img.src.indexOf('999001.png') >= 0, '도안 <img> src 에 파일명이 안 들어갔다: ' + img.src);
            }

            // ═══ 5. [2026-11-12 11차, 사용자 요청 "문서 기본 양식 반영"] 표시·자르기·크기조절은
            //    이제 표 안이 아니라 **전용 모달**에서만 — 메인 표 이미지가 5배로 커졌을 때 표
            //    자체의 열(규격/코드/부착위치) 폭이 깨지던 문제(사용자 스크린샷)를 이 분리로
            //    근본적으로 없앴다. 썸네일/링크를 누르면 모달이 뜬다. ═══
            window._docLabelArtModalOpen('label-spec', 0);
            ok(!!window._docLabelArtModal && window._docLabelArtModal.code === FAKE_CODE, '모달을 열어도 상태가 안 든다');
            var modalBox = document.getElementById('doclabelart-box');
            ok(!!modalBox, '모달 DOM 이 안 생겼다');
            var modalImg = document.getElementById('doclabelart-img');
            ok(!!modalImg && modalImg.getAttribute('data-crop-img') === FAKE_CODE, '모달 안 이미지를 못 찾았다');
            var resizeHandle = document.querySelector('#doclabelart-body [data-resize-handle]');
            ok(!!resizeHandle && typeof resizeHandle.onmousedown === 'function', '크기 조절 손잡이가 안 걸렸다(idle 상태인데)');

            // ═══ 6. 배경 잘라내기 — 드래그 선택 상태 전이(실제 이미지 로딩·캔버스는 cross-origin
            //    이라 이 하네스에선 안 본다 — 라이브로 직접 확인했다) ═══
            window._docLabelCropArm(FAKE_CODE);
            ok(window._docLabelCropState && window._docLabelCropState.code === FAKE_CODE, '자르기를 켜도 상태가 안 들어간다');
            ok(window._docLabelNotePlacing === null, '자르기를 켜면 표시 찍기는 꺼져 있어야 한다');
            var cropImg = document.getElementById('doclabelart-img');
            ok(!!cropImg, '자르기 모드인데 모달 이미지를 못 찾았다');
            ok(cropImg && typeof cropImg.onmousedown === 'function', '자르기 모드인데 드래그 리스너가 안 걸렸다');
            if (cropImg) {
                // getBoundingClientRect 는 테스트 DOM 에서 0일 수 있어 — 드래그 수학은 함수 안
                // toFrac 비율 계산이라 사실상 `rect` 에만 의존한다. 실제 숫자 검증은 라이브로
                // 이미 했으니, 여기선 "드래그하면 선택이 생긴다"까지만 가볍게 본다.
                var rect0 = cropImg.getBoundingClientRect();
                if (rect0.width > 0) {
                    cropImg.dispatchEvent(new MouseEvent('mousedown', { clientX: rect0.left + 2, clientY: rect0.top + 2, bubbles: true }));
                    document.dispatchEvent(new MouseEvent('mousemove', { clientX: rect0.left + rect0.width * 0.4, clientY: rect0.top + rect0.height * 0.4, bubbles: true }));
                    document.dispatchEvent(new MouseEvent('mouseup', { clientX: rect0.left + rect0.width * 0.4, clientY: rect0.top + rect0.height * 0.4, bubbles: true }));
                    ok(!!(window._docLabelCropState && window._docLabelCropState.sel), '드래그해도 선택 영역이 안 생긴다');
                }
            }

            // ═══ 7. [실측 버그 회귀, 사용자 신고 "자르기 적용 눌렀는데 아무 반응 없음"] 자르기
            //    적용 중 어느 단계든 예외가 나도 — 이제 try/catch 가 전체를 감싸서 — 반드시
            //    토스트가 뜬다. 예전엔 토스트 한 줄 없이 조용히 멈췄다(원인은 아직 확실치 않아도,
            //    이제 "뭐가 나든 토스트로 드러난다"는 계약 자체를 고정해 둔다). ═══
            if (window._docLabelCropState && window._docLabelCropState.sel) {
                var toastCountBefore = toastCalls.length;
                var origUpload = window._dgUploadBlob;
                window._dgUploadBlob = function () { throw new Error('강제 실패(시험)'); };
                await window._docLabelCropApply();
                ok(toastCalls.length > toastCountBefore, '자르기 적용 중 예외가 나도 토스트가 안 떴다(이전 버그 재발)');
                ok(toastCalls[toastCalls.length - 1].kind === 'error', '실패 토스트의 종류가 error 가 아니다');
                window._dgUploadBlob = origUpload;
            }
            window._docLabelCropCancel();
            ok(window._docLabelCropState === null, '취소해도 자르기 상태가 안 꺼진다');

            // ═══ 8. [2026-11-12 11차, 사용자 요청] 크기 조절 — 손잡이를 끌면 캐시에 크기가
            //    남고(표시와 같은 사이드카에 같이 저장), 리셋하면 지워진다 ═══
            window._docLabelArtModalOpen('label-spec', 0);   // 다시 idle 상태로
            var handle2 = document.querySelector('#doclabelart-body [data-resize-handle]');
            var img2 = document.getElementById('doclabelart-img');
            if (handle2 && img2) {
                var r2 = img2.getBoundingClientRect();
                if (r2.width > 0) {
                    handle2.dispatchEvent(new MouseEvent('mousedown', { clientX: r2.left, clientY: r2.top, bubbles: true }));
                    document.dispatchEvent(new MouseEvent('mousemove', { clientX: r2.left + 40, clientY: r2.top + 30, bubbles: true }));
                    document.dispatchEvent(new MouseEvent('mouseup', { clientX: r2.left + 40, clientY: r2.top + 30, bubbles: true }));
                    ok(!!(window._docLabelSizeCache && window._docLabelSizeCache[FAKE_CODE]), '손잡이를 끌어도 크기가 캐시에 안 남는다');
                }
            }
            window._docLabelArtModalClose();
            ok(window._docLabelArtModal === null, '닫아도 모달 상태가 안 지워진다');

            // ═══ 9. [2026-11-12 11차, 사용자 요청 "PDF 파일도 도안 검색에 추가해줘"] 검색 결과에
            //    PDF 항목이 섞이면 이미지 썸네일 대신 "📄 PDF" 버튼으로, 고르면 pdf.js(스텁)로
            //    1페이지를 그려 **같은 공용 라이브러리**에 저장한다 ═══
            window.pdfjsLib = {
                getDocument: function () {
                    return { promise: Promise.resolve({
                        getPage: function () {
                            return Promise.resolve({
                                getViewport: function () { return { width: 40, height: 30 }; },
                                render: function () { return { promise: Promise.resolve() }; }
                            });
                        }
                    }) };
                }
            };
            window.fetch = function (url, init) {
                var u = String(url);
                if (u.indexOf('/sap-label-images') >= 0) {
                    return Promise.resolve({ status: 200, ok: true, json: function () {
                        return Promise.resolve({ ok: true, images: [{ inner: 'inner.pdf', member: '__pdf_page1__', kind: 'pdf', size: 999 }], skipped: 0 });
                    } });
                }
                if (u.indexOf('/sap-label-image-bytes') >= 0) {
                    imageBytesCalls.push(u);
                    return Promise.resolve({ status: 200, ok: true, arrayBuffer: function () { return Promise.resolve(new ArrayBuffer(8)); } });
                }
                if (u.indexOf('/doc/get') >= 0 && u.indexOf('.notes.json') >= 0) {
                    return Promise.resolve({ status: 404, ok: false });
                }
                if (u.indexOf('/doc/list') >= 0) {
                    return Promise.resolve({ status: 200, ok: true, json: function () { return Promise.resolve({ ok: true, files: [] }); } });
                }
                return saved.fetch(url, init);
            };
            await window._docLabelToggleImages(key, 0);
            var resPdf = window._docLabelFindResult[key] || '';
            ok(resPdf.indexOf('PDF') >= 0, 'PDF 항목인데 썸네일 대신 글자 버튼이 안 보인다: ' + resPdf);
            window._docRender();
            var pdfBtn = document.querySelector('#doc-page-body [onclick*="_docLabelPickPdfPage"]');
            ok(!!pdfBtn, 'PDF 고르기 버튼을 DOM 에서 못 찾았다');
            var uploadCallsBeforePdf = uploadCalls.length;
            if (pdfBtn) pdfBtn.click();
            await new Promise(function (res) { setTimeout(res, 50); });
            ok(uploadCalls.length === uploadCallsBeforePdf + 1,
               'PDF 1페이지 저장이 공용 라이브러리에 한 번 더 안 올라갔다: ' + uploadCalls.length);
            var upPdf = uploadCalls[uploadCalls.length - 1] || {};
            ok(upPdf.folder === '라벨도안', 'PDF 결과도 공용 폴더(라벨도안)에 저장돼야 한다: ' + upPdf.folder);
            ok(upPdf.name === FAKE_CODE + '.png', 'PDF 결과 파일 이름이 <코드>.png 가 아니다: ' + upPdf.name);

        } catch (e) {
            fail++; notes.push('💥 ' + (e && e.stack || e));
            console.error(e);
        } finally {
            try { window._docLabelArtModalClose && window._docLabelArtModalClose(); } catch (e3) { /* 〃 */ }
            window.saveToGoogleDrive = saved.save;
            window.markUnsavedChanges = saved.dirty;
            window.fetch = saved.fetch;
            window._dgUploadBlob = saved.dgUpload;
            window.showToast = saved.toast;
            window.pdfjsLib = saved.pdfjsLib;
            window._docLabelArtIndex = saved.artIndex;
            window._docLabelFindResult = saved.findResult;
            window._docLabelFindMatches = saved.findMatches;
            window._docLabelImgState = saved.imgState;
            window._docLabelNotesCache = saved.notesCache;
            window._docLabelSizeCache = saved.sizeCache;
            window._docLabelArtModal = saved.artModal;
            if (saved.docs) window.tabData.documents = saved.docs; else delete window.tabData.documents;
            if (saved.state) window._docState = saved.state;
            try { window._docRender && window._docRender(); } catch (e2) { /* 〃 */ }
        }

        console.log((fail ? '❌' : '✅') + ' 라벨 도안 공용 라이브러리: ' + pass + '/' + (pass + fail));
        notes.forEach(function (n) { console.log('   ' + n); });
        return { pass: pass, fail: fail, notes: notes };
    };

    console.log('🏷 준비됨 — `await __labelSpecTest()` 그리고 `await __labelArtTest()` 를 치세요 (빈 앱에서).');
})();
