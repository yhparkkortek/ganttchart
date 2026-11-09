// -*- coding: utf-8 -*-
/* 🧭 tests/qa-route-log.test.js — 라우팅 기록기(js/64)의 순수 부분 (2026-11-09)
 *
 *     node tests/qa-route-log.test.js
 *
 * ⚠️ 가짜는 **브라우저 경계만**(window·localStorage·document). 검사 대상은 js/64 의
 *    진짜 코드다 — 관찰→라우트 판정(`_qaRouteOf`), 입구 감싸기, 재질문 표시, 집계.
 * ⚠️ 입구(`sendGanttQaMessage`)는 **가짜 함수**를 넣고 감싼다 — 진짜 04h(4,325줄)는
 *    node 에서 못 돌린다. 그래서 "감싼 뒤에도 원래 값·예외가 그대로 나오는가"를 본다
 *    (기록기가 동작을 바꾸면 안 되는 것이 이 파일의 제1 불변식).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  OK   ' + name); }
    else { FAIL++; console.log('  FAIL ' + name + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
}

function makeEnv(opts) {
    opts = opts || {};
    const store = {};
    const win = {
        _ganttQaHistory: [],
        STORAGE_REGISTRY: [],
        fetch: async function (u) { win.__realFetchCalls = (win.__realFetchCalls || 0) + 1; return { url: String(u), ok: true }; },
        callAiBackend: async function (k, p) { win.__realAiCalls = (win.__realAiCalls || 0) + 1; return { ok: true, prompt: p }; },
        _qaClassify: opts.classify || function () { return { cls: 'sap', confident: true }; },
        _qaMatchCapabilities: opts.caps || function () { return [{ id: 'stock', score: 0.9 }]; },
        _ganttQaQuestionSimilarity: opts.sim || function (a, b) { return a === b ? 1 : 0; }
    };
    const input = { value: '' };
    const ctx = {
        window: win, console,
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; }
        },
        document: { getElementById: id => (id === 'gantt-qa-input' ? input : null) },
        setInterval: () => 0, clearInterval: () => {}, setTimeout: (f, ms) => setTimeout(f, ms),
        Date, JSON, Math, Array, Object, String, Number, isFinite, Promise, RegExp, Error
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    return { win, ctx, input, store };
}

function load(env) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', '64-qa-route-log.js'), 'utf8');
    vm.runInContext(src, env.ctx);
}

console.log('\n[1] 관찰 → 라우트 판정 (`_qaRouteOf`) — URL 이 가장 강한 증거');
{
    const e = makeEnv(); load(e);
    const R = e.win._qaRouteOf;
    ok('/sap- → sap', R({ urls: ['http://127.0.0.1:5000/sap-mard-stock?material=999001'] }) === 'sap');
    ok('/gw/ → gw', R({ urls: ['http://127.0.0.1:5000/gw/status'] }) === 'gw');
    ok('/insa/ → insa', R({ urls: ['http://127.0.0.1:5000/insa/screen'] }) === 'insa');
    ok('/doc/ → doc', R({ urls: ['http://127.0.0.1:5000/doc/list'] }) === 'doc');
    ok('텔레그램 → telegram', R({ urls: ['http://127.0.0.1:5000/send-telegram'] }) === 'telegram');
    ok('도메인 URL 이 AI 보다 이긴다', R({ urls: ['/sap-x'], ai: ['[[TOOL:gw_mail]]'] }) === 'sap');
    ok('[[TOOL: 표식 → toolloop', R({ ai: ['… [[TOOL:gw_mail {"n":1}]]'] }) === 'toolloop');
    ok('[[NO_TOOL]] 안내도 toolloop(루프를 지났다)', R({ ai: ['… [[NO_TOOL]] …'] }) === 'toolloop');
    ok('표식 없는 AI → ai', R({ ai: ['간트차트 일정을 설명하라'] }) === 'ai');
    ok('아무 호출 없이 말풍선만 → local', R({ bubbles: 2 }) === 'local');
    ok('아무것도 없으면 none', R({}) === 'none');
    ok('NAS·구글 호출은 라우트가 아니다', R({ urls: ['http://127.0.0.1:5000/nas/app/get?rel=x', 'https://www.googleapis.com/x'], bubbles: 1 }) === 'local');
}

console.log('\n[2] 입구를 감싸도 **동작이 그대로**인가 (제1 불변식)');
{
    const e = makeEnv();
    e.win.sendGanttQaMessage = async function () { return '원래 반환값'; };
    load(e);
    ok('감싸졌다', e.win.sendGanttQaMessage._routeLogWrapped === true);
    (async () => {
        e.input.value = '999001 재고';
        const r = await e.win.sendGanttQaMessage();
        ok('반환값 그대로', r === '원래 반환값', r);

        // 예외도 그대로 나와야 한다 — 기록 때문에 삼켜지면 입구가 조용히 성공한 것처럼 보인다
        e.win.sendGanttQaMessage = async function () { throw new Error('입구 오류'); };
        delete e.win.sendGanttQaMessage._routeLogWrapped;
        load(e);
        let msg = '';
        e.input.value = '오류 나는 질문';
        try { await e.win.sendGanttQaMessage(); } catch (ex) { msg = ex.message; }
        ok('예외 그대로 전파', msg === '입구 오류', msg);
        ok('예외가 나도 기록은 남는다', (e.win._qaRouteLog() || []).some(r2 => r2.q === '오류 나는 질문'));

        console.log('\n[3] 안쪽에서 일어난 호출을 관찰해 라우트를 적는다');
        const e3 = makeEnv();
        e3.win.sendGanttQaMessage = async function () {
            await e3.win.fetch('http://127.0.0.1:5000/gw/mail/list');
            e3.win._ganttQaHistory.push({ role: 'ai', text: '메일 10건' });
            return 'ok';
        };
        load(e3);
        e3.input.value = '메일 목록 보여줘';
        await e3.win.sendGanttQaMessage();
        const rows3 = e3.win._qaRouteLog();
        ok('1건 기록', rows3.length === 1, rows3);
        ok('route=gw', rows3[0].route === 'gw', rows3[0]);
        ok('질문·말풍선 수·소요시간이 있다', rows3[0].q === '메일 목록 보여줘' && rows3[0].bubbles === 1 && typeof rows3[0].ms === 'number', rows3[0]);
        ok('도메인 URL 만 남긴다', rows3[0].urls.length === 1 && /\/gw\//.test(rows3[0].urls[0]), rows3[0].urls);
        ok('진짜 fetch 가 그대로 불렸다(통과시킨다)', e3.win.__realFetchCalls === 1, e3.win.__realFetchCalls);
        ok('fetch 를 원래대로 돌려놨다', !String(e3.win.fetch).includes('obs.urls'), String(e3.win.fetch).slice(0, 40));
        ok('점수 라우터 판단도 같이 적는다', rows3[0].cls === 'sap' && rows3[0].clsOk === true && rows3[0].caps[0] === 'stock:0.9', rows3[0]);

        console.log('\n[4] AI 호출 수와 도구 루프 표식');
        const e4 = makeEnv();
        e4.win.sendGanttQaMessage = async function () {
            await e4.win.callAiBackend('k', '... [[NO_TOOL]] 중에서 고르라');
            await e4.win.callAiBackend('k', '일반 답변 프롬프트');
            e4.win._ganttQaHistory.push({ role: 'ai', text: '답' });
        };
        load(e4);
        e4.input.value = '리튬이온 원리 설명해줘';
        await e4.win.sendGanttQaMessage();
        const r4 = e4.win._qaRouteLog()[0];
        ok('AI 2회가 세졌다', r4.ai === 2, r4);
        ok('표식이 있으니 toolloop', r4.route === 'toolloop', r4);
        ok('진짜 callAiBackend 가 2번 불렸다', e4.win.__realAiCalls === 2, e4.win.__realAiCalls);

        console.log('\n[5] 🔁 재질문 = 오라우팅 의심 — 앞 기록에 표시한다');
        const e5 = makeEnv({ sim: (a, b) => (a === b ? 1 : 0) });
        e5.win.sendGanttQaMessage = async function () { e5.win._ganttQaHistory.push({ role: 'ai', text: 'x' }); };
        load(e5);
        e5.input.value = '메일 목록 보여줘';
        await e5.win.sendGanttQaMessage();
        await e5.win.sendGanttQaMessage();           // 같은 질문을 또
        const rows5 = e5.win._qaRouteLog();
        ok('앞 기록에 reask 표시', rows5.length === 2 && rows5[0].reask === true, rows5);
        ok('두 번째엔 아직 표시 없음', !rows5[1].reask, rows5[1]);
        e5.input.value = '전혀 다른 질문';
        await e5.win.sendGanttQaMessage();
        ok('다른 질문은 표시 안 함', !e5.win._qaRouteLog()[1].reask);

        console.log('\n[6] 집계 — 도메인별 건수·질문당 AI·재질문율');
        const s5 = e5.win._qaRouteStats();
        ok('총건수', s5.total === 3, s5);
        ok('재질문 1건', s5.reask === 1, s5);
        ok('byRoute 에 local', !!s5.byRoute.local && s5.byRoute.local.n === 3, s5.byRoute);
        ok('점수라우터→실제라우트 교차표', !!s5.classifierVsRoute['sap→local'], s5.classifierVsRoute);

        console.log('\n[7] 킬스위치·링버퍼·레지스트리');
        const e7 = makeEnv();
        e7.win.sendGanttQaMessage = async function () { return 1; };
        load(e7);
        e7.ctx.localStorage.setItem('gantt_qa_route_off', '1');
        e7.input.value = '끄고 물어본 질문';
        await e7.win.sendGanttQaMessage();
        ok('끄면 한 건도 안 쌓인다', e7.win._qaRouteLog().length === 0, e7.win._qaRouteLog());
        e7.ctx.localStorage.removeItem('gantt_qa_route_off');
        e7.win.QA_ROUTE_LOG_CFG.max = 3;
        for (let i = 0; i < 6; i++) { e7.input.value = '질문 ' + i; await e7.win.sendGanttQaMessage(); }
        const r7 = e7.win._qaRouteLog();
        ok('링버퍼가 max 를 지킨다', r7.length === 3, r7.length);
        ok('최신이 남는다', r7[r7.length - 1].q === '질문 5', r7.map(x => x.q));
        ok('레지스트리에 두 키 등록', e7.win.STORAGE_REGISTRY.filter(x => /route/.test(x.key)).length === 2,
           e7.win.STORAGE_REGISTRY.map(x => x.key));
        ok('로그 전략은 js/34 가 아는 type', (e7.win.STORAGE_REGISTRY.find(x => x.key === 'gantt_qa_route_log_v1') || {}).strategy.type === 'array');

        console.log('\n[8] 돌연변이 — 라우트 규칙을 비우면 전부 local/ai 로 떨어진다(연결이 끊기면 보인다)');
        const e8 = makeEnv();
        e8.win.sendGanttQaMessage = async function () {
            await e8.win.fetch('http://127.0.0.1:5000/sap-mard-stock');
            e8.win._ganttQaHistory.push({ role: 'ai', text: 'x' });
        };
        load(e8);
        e8.win.QA_ROUTE_RULES.length = 0;
        e8.input.value = '999001 재고';
        await e8.win.sendGanttQaMessage();
        ok('(돌연변이) sap 이 아니라 local', e8.win._qaRouteLog()[0].route === 'local', e8.win._qaRouteLog()[0]);

        console.log('\n[9] 빈 질문·분류 실패를 삼키지만 기록은 멈추지 않는다');
        const e9 = makeEnv({ classify: () => { throw new Error('분류기 고장'); } });
        e9.win.sendGanttQaMessage = async function () { e9.win._ganttQaHistory.push({ role: 'ai', text: 'x' }); };
        load(e9);
        e9.input.value = '   ';
        await e9.win.sendGanttQaMessage();
        ok('빈 질문은 안 쌓는다', e9.win._qaRouteLog().length === 0);
        e9.input.value = '분류기가 터지는 질문';
        await e9.win.sendGanttQaMessage();
        const r9 = e9.win._qaRouteLog()[0];
        ok('분류 실패해도 기록은 남는다', !!r9 && r9.cls === '' && r9.route === 'local', r9);

        console.log('\n[10] 🧪 하네스가 넣은 줄은 집계에서 빼야 한다(라벨 오염 방지)');
        const e10 = makeEnv();
        e10.win.sendGanttQaMessage = async function () { e10.win._ganttQaHistory.push({ role: 'ai', text: 'x' }); };
        load(e10);
        e10.input.value = '사람이 물어본 질문';
        await e10.win.sendGanttQaMessage();
        e10.win.__qaRouteTestRunning = true;
        e10.input.value = '하네스가 넣은 질문';
        await e10.win.sendGanttQaMessage();
        e10.win.__qaRouteTestRunning = false;
        const rows10 = e10.win._qaRouteLog();
        ok('하네스 줄에 test 표시', rows10.length === 2 && !rows10[0].test && rows10[1].test === true, rows10);
        ok('기본 집계는 사람 것만', e10.win._qaRouteStats().total === 1, e10.win._qaRouteStats());
        ok('withTest 면 같이 센다', e10.win._qaRouteStats({ withTest: true }).total === 2);

        console.log('\n결과: %d/%d 통과', PASS, PASS + FAIL);
        process.exit(FAIL ? 1 : 0);
    })();
}
