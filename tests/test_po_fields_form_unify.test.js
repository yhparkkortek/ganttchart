// node tests/test_po_fields_form_unify.test.js
//
// 🧾 구매오더 입력 폼에 PDF 추출정보(사업자등록번호·공급자·작성일자·통화·수량·단가)를
//    직접 수정할 수 있게 합친 기능 (2026-11-13, 사용자 요청: "분석한 내용 따로 사용자
//    입력정보 따로 인데, 하나의 도표로 통합해서 ... 사업자 번호, 가격, 기타 분석한
//    내용을 정정할수 있을것 같음").
//
// `_ganttQaRenderPoFieldsFormHtml`/`_ganttQaSubmitPoFieldsForm`을 소스에서 그대로
// 잘라 돌린다(복제 아님) — `document`/`escapeHtml`/`localStorage`/`window._t` 등
// 경계만 가짜로 채운다.

'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', '04h-core-app-upload-utils-3.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, why) {
    if (ok) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}

function sliceFn(name) {
    const head = SRC.indexOf('window.' + name + ' = ');
    if (head < 0) throw new Error('함수를 못 찾음: ' + name);
    const end = SRC.indexOf('\n    };', head);
    if (end < 0) throw new Error('끝을 못 찾음: ' + name);
    return SRC.slice(head, end + '\n    };'.length);
}

// 전역 경계 — escapeHtml은 이 파일 안에서 bare identifier로 쓰인다.
global.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
};

function makeFakeDocument(values) {
    const map = values; // id -> { value } (또는 textContent만 쓰는 error div)
    return {
        getElementById: function (id) {
            if (!map[id]) map[id] = { value: '', textContent: '', focus: function () {} };
            return map[id];
        },
    };
}

function buildModule() {
    const code = sliceFn('_ganttQaRenderPoFieldsFormHtml') + '\n'
        + sliceFn('_ganttQaSubmitPoFieldsForm') + '\n'
        + 'return { render: window._ganttQaRenderPoFieldsFormHtml, submit: window._ganttQaSubmitPoFieldsForm };';
    return new Function('window', 'document', 'localStorage', code);
}

function makeWin() {
    const win = {
        _t: function (ko, en) { return ko; },
        _currentLang: 'ko',
        _PO_TEMP_CODE_TABLE: [{ code: '900203', desc: '개발용 PBM' }, { code: '900101', desc: '개발용 Panel' }],
        _PO_PURPOSE_TABLE: [{ code: 'P04', desc: '연구개발' }],
        _ganttQaPoFieldsForm: null,
        _ganttQaRunPoBatchAutomatically: null, // 테스트마다 주입
        _ganttQaHistory: [],
        _renderGanttQaMessages: function () {},
    };
    return win;
}

function mkDoc() {
    return {
        bizRegNo: '1068147845', vendorName: '정림전자(주)', invoiceDate: '20261111', currency: 'KRW', note: '',
        items: [
            { desc: 'P550QAR01.0 T-CON BOARD', qty: 5, unitPrice: 14776.3, tempCode: '900203' },
            { desc: 'P550QAR01.0 OC', qty: 5, unitPrice: 479558.1, tempCode: '900101' },
        ],
    };
}

(() => {
    console.log('[1] 렌더링 — PDF 추출정보(사업자번호/공급자/작성일자/통화)와 수량/단가가 입력칸으로 나온다');
    {
        const win = makeWin();
        const localStorageFake = { getItem: function () { return ''; }, setItem: function () {} };
        const fakeDoc = makeFakeDocument({});
        const mod = buildModule()(win, fakeDoc, localStorageFake);
        const form = { id: 't1', pd: { docs: [mkDoc()] } };
        const html = mod.render(form);
        check('사업자등록번호 입력칸이 현재 값으로 채워짐', html.indexOf('id="pof-t1-biz-0" value="1068147845"') !== -1, html.length);
        check('공급자 입력칸 존재', html.indexOf('id="pof-t1-vendor-0"') !== -1);
        check('작성일자 입력칸 존재', html.indexOf('id="pof-t1-date-0" value="20261111"') !== -1);
        check('통화 선택(select) 존재', html.indexOf('id="pof-t1-currency-0"') !== -1);
        check('1번 품목 수량 입력칸(5)', html.indexOf('id="pof-t1-qty-0-0" type="number" value="5"') !== -1);
        check('1번 품목 단가 입력칸(14776.3)', html.indexOf('id="pof-t1-price-0-0" type="number" step="0.01" value="14776.3"') !== -1);
        check('2번 품목 단가 입력칸(479558.1)', html.indexOf('id="pof-t1-price-0-1" type="number" step="0.01" value="479558.1"') !== -1);
    }

    console.log('\n[2] 제출 — 표에서 고친 사업자번호/공급자/통화/수량/단가가 doc/item에 그대로 반영된다');
    {
        const win = makeWin();
        let ranBatch = null;
        win._ganttQaRunPoBatchAutomatically = async function (pd) { ranBatch = pd; };
        const pd = { docs: [mkDoc()] };
        win._ganttQaPoFieldsForm = { id: 't2', pd: pd };
        const values = {
            'pof-t2-yr-0': { value: '2004' }, 'pof-t2-mo-0': { value: '05' }, 'pof-t2-dy-0': { value: '10' }, 'pof-t2-sr-0': { value: '02' },
            'pof-t2-biz-0': { value: '106-81-47845' }, // 하이픈 섞어도 10자리로 정규화되는지
            'pof-t2-vendor-0': { value: '정림전자 주식회사(수정됨)' },
            'pof-t2-date-0': { value: '20261112' },
            'pof-t2-currency-0': { value: 'USD' },
            'pof-t2-temp-0-0': { value: '900203' }, 'pof-t2-qty-0-0': { value: '7' }, 'pof-t2-price-0-0': { value: '15000' },
            'pof-t2-proj-0-0': { value: 'G26LWK1' }, 'pof-t2-purpose-0-0': { value: 'P04' }, 'pof-t2-reason-0-0': { value: '시제품' },
            'pof-t2-temp-0-1': { value: '900101' }, 'pof-t2-qty-0-1': { value: '3' }, 'pof-t2-price-0-1': { value: '500000' },
            'pof-t2-proj-0-1': { value: 'G26LWK1' }, 'pof-t2-purpose-0-1': { value: 'P04' }, 'pof-t2-reason-0-1': { value: '시제품' },
            'pof-t2-error': { value: '', textContent: '' },
        };
        const localStorageFake = { getItem: function () { return ''; }, setItem: function () {} };
        const mod = buildModule()(win, makeFakeDocument(values), localStorageFake);
        mod.submit('t2').then(function () {
            check('사업자등록번호가 하이픈 제거된 10자리로 반영됨', pd.docs[0].bizRegNo === '1068147845', pd.docs[0].bizRegNo);
            check('공급자명이 수정한 값으로 반영됨', pd.docs[0].vendorName === '정림전자 주식회사(수정됨)');
            check('작성일자가 수정한 값으로 반영됨', pd.docs[0].invoiceDate === '20261112');
            check('통화가 USD로 반영됨', pd.docs[0].currency === 'USD');
            check('1번 품목 수량이 7로 반영됨', pd.docs[0].items[0].qty === 7, pd.docs[0].items[0].qty);
            check('1번 품목 단가가 15000으로 반영됨', pd.docs[0].items[0].unitPrice === 15000);
            check('2번 품목 수량이 3으로 반영됨', pd.docs[0].items[1].qty === 3);
            check('2번 품목 단가가 500000으로 반영됨', pd.docs[0].items[1].unitPrice === 500000);
            check('자동 처리 배치가 호출됨(검증 통과 후 진행)', ranBatch === pd);
            check('에러 메시지 없음', values['pof-t2-error'].textContent === '');
            run3();
        });
    }

    function run3() {
        console.log('\n[3] 사업자등록번호가 10자리가 아니면 — 제출을 막고 에러를 보여준다(자동 처리로 안 넘어감)');
        const win = makeWin();
        let ranBatch = false;
        win._ganttQaRunPoBatchAutomatically = async function () { ranBatch = true; };
        const pd = { docs: [mkDoc()] };
        win._ganttQaPoFieldsForm = { id: 't3', pd: pd };
        const values = {
            'pof-t3-yr-0': { value: '2004' }, 'pof-t3-mo-0': { value: '05' }, 'pof-t3-dy-0': { value: '10' }, 'pof-t3-sr-0': { value: '02' },
            'pof-t3-biz-0': { value: '123' }, // 10자리 아님
            'pof-t3-vendor-0': { value: '정림전자' }, 'pof-t3-date-0': { value: '20261111' }, 'pof-t3-currency-0': { value: 'KRW' },
            'pof-t3-error': { value: '', textContent: '' },
        };
        const localStorageFake = { getItem: function () { return ''; }, setItem: function () {} };
        const mod = buildModule()(win, makeFakeDocument(values), localStorageFake);
        mod.submit('t3').then(function () {
            check('에러 메시지가 표시됨', values['pof-t3-error'].textContent.indexOf('사업자등록번호') !== -1, values['pof-t3-error'].textContent);
            check('자동 처리는 시작되지 않음', ranBatch === false);
            run4();
        });
    }

    function run4() {
        console.log('\n[4] 수량/단가가 비었거나 0이면 — 제출을 막는다');
        const win = makeWin();
        let ranBatch = false;
        win._ganttQaRunPoBatchAutomatically = async function () { ranBatch = true; };
        const doc = mkDoc();
        const pd = { docs: [doc] };
        win._ganttQaPoFieldsForm = { id: 't4', pd: pd };
        const values = {
            'pof-t4-yr-0': { value: '2004' }, 'pof-t4-mo-0': { value: '05' }, 'pof-t4-dy-0': { value: '10' }, 'pof-t4-sr-0': { value: '02' },
            'pof-t4-biz-0': { value: '1068147845' }, 'pof-t4-vendor-0': { value: '정림전자' }, 'pof-t4-date-0': { value: '20261111' }, 'pof-t4-currency-0': { value: 'KRW' },
            'pof-t4-temp-0-0': { value: '900203' }, 'pof-t4-qty-0-0': { value: '0' }, 'pof-t4-price-0-0': { value: '15000' },
            'pof-t4-proj-0-0': { value: 'G26LWK1' }, 'pof-t4-purpose-0-0': { value: 'P04' }, 'pof-t4-reason-0-0': { value: '시제품' },
            'pof-t4-temp-0-1': { value: '900101' }, 'pof-t4-qty-0-1': { value: '3' }, 'pof-t4-price-0-1': { value: '500000' },
            'pof-t4-proj-0-1': { value: 'G26LWK1' }, 'pof-t4-purpose-0-1': { value: 'P04' }, 'pof-t4-reason-0-1': { value: '시제품' },
            'pof-t4-error': { value: '', textContent: '' },
        };
        const localStorageFake = { getItem: function () { return ''; }, setItem: function () {} };
        const mod = buildModule()(win, makeFakeDocument(values), localStorageFake);
        mod.submit('t4').then(function () {
            check('수량 0은 거부됨 — 에러 표시', values['pof-t4-error'].textContent.indexOf('수량') !== -1, values['pof-t4-error'].textContent);
            check('자동 처리는 시작되지 않음', ranBatch === false);
            finish();
        });
    }

    function finish() {
        console.log('\n' + (fail ? ('❌ ' + fail + ' 건 실패') : '✅ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
        process.exit(fail ? 1 : 0);
    }
})();
