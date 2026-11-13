// node tests/test_po_abort_stop.test.js
//
// 🛑 구매오더 자동 처리 "중지" 기능 (2026-11-13, 사용자 요청: "SAP 동작을 중간에 멈추는
//    기능이 필요함") — 🛑 버튼을 누르면 다음 "안전한 틈"(엑셀 생성 후 / SAP 입력 완료 후·
//    저장 전 / 다음 문서로 넘어가기 전)에서 멈추고, 저장(재무 커밋) 전이면 SAP 화면을
//    그대로 둔 채 사람에게 넘긴다는 것만 확인한다.
//
// 네트워크 없이 돈다 — 실제 `_ganttQaPrepareAndSaveOneDoc`/`_ganttQaRunPoBatchAutomatically`/
// `_ganttQaPoCheckAbort`를 소스에서 그대로 잘라 돌리고(복제 아님), `fetch`/`_ganttQaParsePoApiResponse`
// 경계만 스텁한다(CLAUDE.md "안쪽을 가짜로 만들면 테스트가 자기 자신을 테스트한다").

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

function buildModule(win) {
    const shimFetch = 'function fetch(url, opts) { return window.__fetchMock(url, opts); }\n';
    const code = shimFetch
        + sliceFn('_ganttQaPoStopButtonHtml') + '\n'
        + sliceFn('_ganttQaPoCheckAbort') + '\n'
        + sliceFn('_ganttQaPrepareAndSaveOneDoc') + '\n'
        + sliceFn('_ganttQaRunPoBatchAutomatically') + '\n'
        + 'return { prepareAndSave: window._ganttQaPrepareAndSaveOneDoc, runBatch: window._ganttQaRunPoBatchAutomatically };';
    return new Function('window', code)(win);
}

// `step`별 가짜 fetch 응답 — url 끝부분으로 분기(build-excel / sap-prepare / sap-confirm-save)
function makeFetchMock(opts) {
    opts = opts || {};
    const calls = [];
    return async function (url, _init) {
        calls.push(url);
        if (opts.onCall) opts.onCall(url, calls.length);
        if (url.includes('po-build-excel')) {
            return { ok: true, json: async () => ({ ok: true, path: 'x.xlsx' }) };
        }
        if (url.includes('po-sap-prepare')) {
            return { ok: true, json: async () => ({ ok: true, text: '(준비됨)' }) };
        }
        if (url.includes('po-sap-confirm-save')) {
            return { ok: true, json: async () => ({ ok: true, poNumber: '4500001234', autoSaved: true, pdfPath: 'po.pdf' }) };
        }
        throw new Error('예상 못한 호출: ' + url);
    };
}

function makeWin(fetchImpl) {
    const win = {
        _t: function (ko, en) { return ko; },
        _withTimeout: function (p) { return p; },
        getActiveUserName: function () { return '박용훈'; },
        __fetchMock: fetchImpl,
        _ganttQaHistory: [],
        _renderGanttQaMessages: function () {},
        _ganttQaShowConfirmButtons: function () { win._confirmShown = true; },
        _ganttQaPoAbortRequested: false,
        _ganttQaParsePoApiResponse: async function (res) { return await res.json(); },
        _ganttQaRunGoodsReceipt: async function () {}, // 이 테스트의 관심사 밖 — 입고 처리는 별도
    };
    const mod = buildModule(win);
    win.runBatch = mod.runBatch;
    win.prepareAndSave = mod.prepareAndSave;
    return win;
}

function mkDoc(name) {
    return {
        vendorName: name, bizRegNo: '1068147845', invoiceDate: '20261111', currency: 'KRW',
        items: [{ desc: 'item', qty: 1, unitPrice: 100, tempCode: '900101' }],
        projectCode: 'X', reason: 'r', purpose: 'p',
    };
}

(async () => {
    console.log('[1] 중지 안 누르면 — 기존과 100% 동일(2문서 모두 성공, 비상정지 버튼은 끝나면 사라짐)');
    {
        const win = makeWin(makeFetchMock());
        const pd = { docs: [mkDoc('A사'), mkDoc('B사')], buyerEmpId: '2004051002' };
        await win.runBatch(pd);
        const last = win._ganttQaHistory.slice().reverse().find(function(m) { return m.text && (m.text.indexOf('🏁') === 0 || m.text.indexOf('🛑') === 0); });
        check('🏁 완료 문구(중지 아님)', last.text.indexOf('🏁') === 0, last.text);
        check('2건 다 성공', last.text.indexOf('2/2건 성공') !== -1, last.text);
        check('비상정지 버튼 메시지는 안 남음', !win._ganttQaHistory.some(function(m) { return m.text && m.text.indexOf('po-stop-btn') !== -1; }));
    }

    console.log('\n[2] 1번째 문서 엑셀 생성 직후(SAP 입력 전) 중지 — 2번째 문서는 시작도 안 함');
    {
        const win = makeWin(makeFetchMock({ onCall: function (url) {
            if (url.includes('po-build-excel')) win._ganttQaPoAbortRequested = true; // 엑셀 생성 "직후" 중지 누른 상황 재현
        }}));
        const pd = { docs: [mkDoc('A사'), mkDoc('B사')], buyerEmpId: '2004051002' };
        await win.runBatch(pd);
        const last = win._ganttQaHistory.slice().reverse().find(function(m) { return m.text && (m.text.indexOf('🏁') === 0 || m.text.indexOf('🛑') === 0); });
        check('🛑 중지 문구', last.text.indexOf('🛑') === 0, last.text);
        check('SAP 손 안 댄 상태임을 안내', last.text.indexOf('SAP에 아직 손대지 않은') !== -1, last.text);
        check('2번째 문서는 "시작 전 건너뜀"', last.text.indexOf('시작 전에 건너뜀') !== -1, last.text);
        check('재처리 제안 안 뜸(중지 직후라 어색함)', !win._confirmShown);
    }

    console.log('\n[3] SAP 입력 완료 직후(저장 전) 중지 — 가장 중요한 지점: "SAP 화면 그대로" 안내');
    {
        const win = makeWin(makeFetchMock({ onCall: function (url) {
            if (url.includes('po-sap-prepare')) win._ganttQaPoAbortRequested = true;
        }}));
        const pd = { docs: [mkDoc('A사')], buyerEmpId: '2004051002' };
        await win.runBatch(pd);
        const last = win._ganttQaHistory.slice().reverse().find(function(m) { return m.text && (m.text.indexOf('🏁') === 0 || m.text.indexOf('🛑') === 0); });
        check('🛑 중지 + "저장은 하지 않았습니다" 안내', last.text.indexOf('저장은 하지 않았습니다') !== -1, last.text);
        check('"SAP 창을 직접 확인" 안내', last.text.indexOf('SAP 창을 직접 확인') !== -1, last.text);
    }

    console.log('\n[4] 이전 배치에서 중지 플래그가 켜진 채 남아있어도(이상 상황) 새 배치는 깨끗하게 시작한다');
    {
        // 🛑 버튼은 배치가 시작될 때 비로소 떠서, "배치 시작 전에 이미 중지를 누른" 상황은
        // 실제로는 있을 수 없다 — 그 대신, 혹시라도 플래그가 꼬여 true로 남아있을 때
        // 새 배치의 첫 줄(`_ganttQaPoAbortRequested = false`)이 그걸 깨끗이 지우는지를 본다.
        const win = makeWin(makeFetchMock());
        win._ganttQaPoAbortRequested = true; // 버그로 이전 상태가 새어든 상황을 흉내
        const pd = { docs: [mkDoc('A사'), mkDoc('B사')], buyerEmpId: '2004051002' };
        await win.runBatch(pd);
        const last = win._ganttQaHistory.slice().reverse().find(function(m) { return m.text && (m.text.indexOf('🏁') === 0 || m.text.indexOf('🛑') === 0); });
        check('새 배치는 영향받지 않고 2건 다 정상 처리', last.text.indexOf('2/2건 성공') !== -1, last.text);
    }

    console.log('\n[5] 저장 호출까지 간 뒤에는(이미 완료) 중지가 걸려도 그 문서는 정상 성공 처리');
    {
        const win = makeWin(makeFetchMock({ onCall: function (url) {
            if (url.includes('po-sap-confirm-save')) win._ganttQaPoAbortRequested = true; // 저장 호출 "중"에 눌렀어도 이미 보낸 요청은 끝까지
        }}));
        const pd = { docs: [mkDoc('A사'), mkDoc('B사')], buyerEmpId: '2004051002' };
        await win.runBatch(pd);
        const last = win._ganttQaHistory.slice().reverse().find(function(m) { return m.text && (m.text.indexOf('🏁') === 0 || m.text.indexOf('🛑') === 0); });
        check('1번째 문서는 정상 성공(✅)', last.text.indexOf('✅ 1. A사') !== -1, last.text);
        check('2번째 문서는 다음 틈에서 중지', last.text.indexOf('🛑') !== -1 && last.text.indexOf('2.') !== -1, last.text);
    }

    console.log('\n[6] 중지 후 플래그가 자동으로 꺼진다(다음 배치에 영향 안 줌)');
    {
        const win = makeWin(makeFetchMock({ onCall: function (url) {
            if (url.includes('po-build-excel')) win._ganttQaPoAbortRequested = true;
        }}));
        const pd = { docs: [mkDoc('A사')], buyerEmpId: '2004051002' };
        await win.runBatch(pd);
        check('배치가 끝나면 abort 플래그가 다시 false로 리셋됨', win._ganttQaPoAbortRequested === false);
    }

    console.log('\n' + (fail ? ('❌ ' + fail + ' 건 실패') : '✅ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
    process.exit(fail ? 1 : 0);
})();
