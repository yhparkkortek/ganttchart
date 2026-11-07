/* ============================================================================
   🤖📱 텔레그램 ↔ AI 문답 다리(js/60) — 순수 로직 하네스 (2026-11-08)

       "C:\Program Files\nodejs\node" tests/telegram-qa-bridge.test.js

   ⚠️ 가짜는 **바깥 경계에만**: NAS 왕복(`window.nasAppFile`), 텔레그램 발송
      (`_qaTelegramSendText`), 그리고 AI 문답 입구(`sendGanttQaMessage` — 입력창을 읽어
      말풍선을 밀어 넣는 **모양만** 흉내). 검사 대상은 js/60 의 진짜 함수들이다
      (`_tgqaPollTick` → `_tgqaProcess` → `_tgqaAsk` → `_tgqaCollect` → 회신).
   ⚠️ 스텁은 호출 **순서가 아니라 내용**(질문 글자)으로 갈린다 — CLAUDE.md 규칙.
   ⚠️ 화면(모달)은 여기서 안 본다 — 그건 tests/telegram-qa-bridge.browser.js.
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const win = {};
global.window = win;
const INPUT = { value: '', focus() {} };
const MODAL = { style: { display: 'none' } };
global.document = {
    getElementById(id) { return id === 'gantt-qa-input' ? INPUT : (id === 'gantt-qa-modal' ? MODAL : null); },
    addEventListener() {}, querySelectorAll() { return []; }, body: { appendChild() {} }
};
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
win.document = global.document; win.localStorage = global.localStorage;
win._t = (ko) => ko;
win._currentLang = 'ko';
win._tgqaNoAutoStart = true;
win.currentDriveFileName = 'LNW_TEST.json';
win._dailyMyKey = () => 'yhpark';
win.dailyEnsureIdentity = async () => 'yhpark';
win._ganttQaHistory = [];
let renders = 0;
win._renderGanttQaMessages = () => { renders++; };
let modalOpens = 0;
win.openGanttQaModal = () => { modalOpens++; MODAL.style.display = 'block'; };
win._mdToTelegramText = (s) => '[tg]' + s;

// ── 경계 가짜 ① NAS ───────────────────────────────────────────────────────
const NAS = { files: {}, failDel: false, log: [] };
win.nasAppFile = {
    async get(rel, o) { NAS.log.push('get ' + rel); const v = NAS.files[rel]; if (v == null) return null; return o && o.json ? JSON.parse(v) : v; },
    async put(rel, body) { NAS.log.push('put ' + rel); NAS.files[rel] = typeof body === 'string' ? body : JSON.stringify(body); return { ok: true }; },
    async del(rel) { NAS.log.push('del ' + rel); if (NAS.failDel) throw new Error('삭제 실패'); delete NAS.files[rel]; return { ok: true }; },
    async list(rel) {
        const pre = rel.replace(/\/$/, '') + '/';
        return Object.keys(NAS.files).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => ({ name: k.slice(pre.length), size: NAS.files[k].length }));
    }
};
// ── 경계 가짜 ② 텔레그램 발송 ──────────────────────────────────────────────
const SENT = [];
let sendOk = true;
win._qaTelegramSendText = async (text, chatId) => { SENT.push({ text, chatId }); return sendOk ? { ok: true, sent: 1, total: 1 } : { ok: false, errDesc: 'chat not found' }; };
// ── 경계 가짜 ③ AI 문답 입구 — 입력창을 읽어 말풍선을 민다(내용으로 갈린다) ──
const ASKED = [];
win._ganttQaSending = false;
win.sendGanttQaMessage = async function () {
    if (win._ganttQaSending) return;
    const q = INPUT.value.trim(); if (!q) return;
    ASKED.push(q); INPUT.value = '';
    const H = win._ganttQaHistory;
    H.push({ role: 'user', text: q });
    const pend = { role: 'ai', pending: true, text: '⏳' }; H.push(pend);
    await new Promise((r) => setTimeout(r, 30));
    H.splice(H.indexOf(pend), 1);
    if (/칩표/.test(q)) { H.push({ role: 'ai', rawHtml: '<table>…</table>', tgText: '| 자재 | 재고 |\n|---|---|\n| 999001 | 12 |' }); return; }
    if (/확인/.test(q)) { H.push({ role: 'ai', text: '초안입니다', confirmButtonsId: 'cb1' }); return; }
    if (/버튼만/.test(q)) { H.push({ role: 'ai', rawHtml: '<button>…</button>' }); return; }
    if (/느림/.test(q)) { setTimeout(() => { H.push({ role: 'ai', text: '늦게 온 답 ' + q }); }, 150); return; }
    if (/묵묵/.test(q)) { return; }                      // 아무 답도 안 민다
    if (/키없음/.test(q)) { win.alert('먼저 AI API 키를 입력하고 저장해주세요.'); return; }   // 실측: 키 없으면 alert 만
    if (/토스트/.test(q)) { win.showToast('프로젝트를 먼저 열어주세요', 'error'); return; }
    H.push({ role: 'ai', text: '답: ' + q });
};

// js/60 로드
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', '60-telegram-qa-bridge.js'), 'utf8'), { filename: '60-telegram-qa-bridge.js' });
const C = win.TG_QA_BRIDGE;
C.settleStepMs = 10; C.settleQuietMs = 50; C.settleMaxMs = 1500; C.heartbeatMs = 100000;

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); } }
function reset() {
    NAS.files = {}; NAS.failDel = false; NAS.log.length = 0; SENT.length = 0; ASKED.length = 0;
    win._ganttQaHistory.length = 0; win._ganttQaSending = false; INPUT.value = ''; sendOk = true; delete store[C.offKey];
}
function req(name, doc) { NAS.files[C.dir + '/' + name] = JSON.stringify(Object.assign({ id: name.replace(/\.json$/, '').split('__')[1], key: 'yhpark', chatId: '111', name: '박용훈', via: 'telegram', reply: 'telegram', at: new Date().toISOString() }, doc)); }

(async () => {
    console.log('\n[1] 파일 이름 해석');
    ok('<key>__<id>.json', JSON.stringify(win._tgqaParseName('yhpark__tg1001.json')) === JSON.stringify({ key: 'yhpark', id: 'tg1001' }));
    ok('online__ 신호 파일은 요청이 아니다', win._tgqaParseName('online__yhpark.json') === null);
    ok('엉뚱한 이름은 null', win._tgqaParseName('answers') === null && win._tgqaParseName('x.txt') === null);

    console.log('\n[2] 한 바퀴 — 내 요청만 집어 답하고 텔레그램으로 되보낸다');
    reset();
    req('yhpark__tg1001.json', { text: '999001 재고' });
    req('kim__tg1002.json', { text: '남의 질문' });
    INPUT.value = '치던 글';
    const r = await win._tgqaPollTick();
    ok('내 것 1건만 처리', r.done.length === 1 && ASKED.length === 1 && ASKED[0] === '999001 재고', r);
    ok('남의 요청은 그대로 남아 있다', !!NAS.files[C.dir + '/kim__tg1002.json'] && !NAS.files[C.dir + '/yhpark__tg1001.json']);
    ok('답하기 **전에** 지웠다(선점)', NAS.log.indexOf('del ' + C.dir + '/yhpark__tg1001.json') < NAS.log.length && ASKED.length === 1 && NAS.log.filter((l) => l.startsWith('del')).length === 1);
    ok('텔레그램 회신 1통 · 그 chatId · 마크다운 변환 거침', SENT.length === 1 && SENT[0].chatId === '111' && SENT[0].text === '[tg]답: 999001 재고', SENT);
    ok('사람이 치던 글을 되돌렸다', INPUT.value === '치던 글', INPUT.value);
    ok('모달을 열었다', modalOpens === 1 && MODAL.style.display === 'block');
    ok('문답창에 "텔레그램에서 온 질문" 과 "회신했습니다" 가 남는다',
        win._ganttQaHistory.some((m) => m.tgResult && /텔레그램에서 온 질문/.test(m.text)) && win._ganttQaHistory.some((m) => m.tgResult && /회신했습니다/.test(m.text)));
    ok('온라인 신호 파일을 찍었다', !!NAS.files[C.dir + '/online__yhpark.json']);
    ok('같은 바퀴를 또 돌려도 다시 안 집는다(seen)', (await win._tgqaPollTick()).done.length === 0 && ASKED.length === 1);

    console.log('\n[3] 칩 표(rawHtml) 는 tgText(마크다운) 로 보낸다');
    reset(); req('yhpark__tg2001.json', { text: '칩표 보여줘' });
    await win._tgqaPollTick();
    ok('tgText 가 나갔다', SENT.length === 1 && /999001 \| 12/.test(SENT[0].text), SENT);

    console.log('\n[4] 확인 버튼이 붙은 답 → "PC 에서 버튼을" 안내가 따라붙는다(폰에서 쓰기 금지)');
    reset(); req('yhpark__tg2002.json', { text: '확인 필요한 일' });
    await win._tgqaPollTick();
    ok('초안 + 안내', SENT.length === 1 && /초안입니다/.test(SENT[0].text) && /버튼을 눌러/.test(SENT[0].text), SENT);
    reset(); req('yhpark__tg2003.json', { text: '버튼만 있는 답' });
    await win._tgqaPollTick();
    ok('tgText 없는 rawHtml 뿐이면 안내만', SENT.length === 1 && /버튼을 눌러/.test(SENT[0].text), SENT);

    console.log('\n[5] 답이 await 뒤에 늦게 와도(비동기 경로) 기다려 싣는다');
    reset(); req('yhpark__tg2004.json', { text: '느림 조회' });
    await win._tgqaPollTick();
    ok('늦게 온 답을 실었다', SENT.length === 1 && /늦게 온 답/.test(SENT[0].text), SENT);

    console.log('\n[6] 아무 답도 안 생기면 빈 답이라고 정직하게');
    reset(); req('yhpark__tg2005.json', { text: '묵묵부답' });
    await win._tgqaPollTick();
    ok('"답변이 비어 있습니다"', SENT.length === 1 && /비어 있습니다/.test(SENT[0].text), SENT);

    console.log('\n[6b] 입구가 alert/토스트로만 말하고 끝나면 그 문구를 답에 싣는다(실측: AI 키 없음)');
    win.alert = () => { throw new Error('alert 가 가로채지지 않았다'); };
    reset(); req('yhpark__tg2005a.json', { text: '키없음 질문' });
    await win._tgqaPollTick();
    ok('alert 문구가 회신에 실렸다 · 진짜 alert 는 안 떴다', SENT.length === 1 && /AI API 키/.test(SENT[0].text) && /앱 알림/.test(SENT[0].text), SENT);
    ok('alert 를 원래대로 되돌렸다', (() => { try { win.alert('x'); return false; } catch (e) { return true; } })());
    win.showToast = () => {};
    reset(); req('yhpark__tg2005b.json', { text: '토스트 질문' });
    await win._tgqaPollTick();
    ok('오류 토스트 문구가 회신에 실렸다', SENT.length === 1 && /프로젝트를 먼저/.test(SENT[0].text), SENT);

    console.log('\n[7] 오래된 요청은 답하지 않고 사유만');
    reset(); req('yhpark__tg2006.json', { text: '옛 질문', at: new Date(Date.now() - (C.maxAgeMin + 30) * 60000).toISOString() });
    const r7 = await win._tgqaPollTick();
    ok('AI 입구를 안 불렀다 · ⏰ 사유 회신', ASKED.length === 0 && SENT.length === 1 && /⏰/.test(SENT[0].text) && r7.done[0].skipped === 'expired', r7);

    console.log('\n[8] 선점(삭제) 실패면 답하지 않는다 — 다른 탭이 답할 수 있으므로');
    reset(); NAS.failDel = true; req('yhpark__tg2007.json', { text: '질문' });
    const r8 = await win._tgqaPollTick();
    ok('발송 0 · 입구 호출 0 · 파일 남음', SENT.length === 0 && ASKED.length === 0 && !!NAS.files[C.dir + '/yhpark__tg2007.json'] && r8.done[0].skipped === 'claim', r8);

    console.log('\n[9] reply:"file" — 텔레그램이 아니라 answers/ 에 쓴다(스크립트·다른 도구용)');
    reset(); req('yhpark__cli42.json', { text: '파일로 답해', reply: 'file', chatId: '' });
    await win._tgqaPollTick();
    const ans = NAS.files[C.answersDir + '/cli42.json'];
    ok('answers/cli42.json 생성 · 텔레그램 발송 0', !!ans && SENT.length === 0 && JSON.parse(ans).text === '답: 파일로 답해', ans);

    console.log('\n[10] 사람이 보내는 중이면 기다리고, 너무 오래면 정직하게 실패 회신');
    reset(); win._ganttQaSending = true; C.settleMaxMs = 120; req('yhpark__tg2008.json', { text: '바쁠 때' });
    await win._tgqaPollTick();
    C.settleMaxMs = 1500;
    ok('입구 호출 0 · "처리하지 못했습니다" 회신', ASKED.length === 0 && SENT.length === 1 && /처리하지 못했/.test(SENT[0].text), SENT);

    console.log('\n[11] 회신 실패는 삼키지 않는다(문답창에 ⚠️)');
    reset(); sendOk = false; req('yhpark__tg2009.json', { text: '질문' });
    await win._tgqaPollTick();
    ok('문답창에 회신 실패 표시', win._ganttQaHistory.some((m) => m.tgResult && m.error && /회신 실패/.test(m.text)));

    console.log('\n[12] 킬스위치·저장소 없음');
    reset(); store[C.offKey] = '1'; req('yhpark__tg2010.json', { text: '질문' });
    ok('off → 건너뜀', (await win._tgqaPollTick()).skipped === 'off' && ASKED.length === 0);
    delete store[C.offKey];
    const keep = win.nasAppFile; win.nasAppFile = null;
    ok('nasAppFile 없음 → 건너뜀', (await win._tgqaPollTick()).skipped === 'no-storage');
    win.nasAppFile = keep;

    console.log('\n[13] 긴 답은 자르고 "앱에 전문" 을 적는다');
    reset(); C.maxAnswerChars = 40; req('yhpark__tg2011.json', { text: 'x'.repeat(200) });
    await win._tgqaPollTick();
    C.maxAnswerChars = 12000;
    ok('잘림 + 안내', SENT.length === 1 && SENT[0].text.length < 200 && /잘랐습니다/.test(SENT[0].text));

    console.log('\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    process.exit(fail ? 1 : 0);
})();
