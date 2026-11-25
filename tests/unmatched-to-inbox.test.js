/* ============================================================================
   📥 미분류 → 업무 보관함 합치기 — 하네스 (2026-11-25)

       node tests/unmatched-to-inbox.test.js

   사용자 결정: "미분류를 보관함의 '프로젝트 없음'으로 합쳐줘". 후보 0개 메일이 이 PC 의 미분류 목록에만
   남던 것을 업무 보관함 대기 카드로 보낸다. 검사 대상은 진짜 js/15b. 가짜는 경계(localStorage·DOM·
   TaskInbox 저장소·타이머)뿐 — TaskInbox 는 add/load 만 쓰므로 메모리 배열로 둔다.
   ============================================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const store = {};
const timers = [];
const inbox = [];
const ctx = {};
ctx.window = ctx;
ctx.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, innerHTML: '', textContent: '', value: '' });
ctx.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, createElement: el, body: el(), head: el(), readyState: 'complete' };
ctx.addEventListener = () => {};
ctx.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
ctx.clearTimeout = () => {}; ctx.setInterval = () => 0; ctx.clearInterval = () => {};
ctx.fetch = async () => ({ ok: false, json: async () => ({}) });
ctx.console = { log() {}, info() {}, warn() {}, error() {} };
ctx._t = (ko) => ko;
ctx._currentLang = 'ko';
ctx.TaskInbox = {
    load: () => inbox.slice(),
    add: (task, meta) => { inbox.unshift(Object.assign({ uid: 'u' + (inbox.length + 1), status: '대기', task }, meta)); },
    save() {}, syncNow() {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', '15b-mail-server-tab-1.js'), 'utf8'), ctx, { filename: '15b' });

let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  — ' + JSON.stringify(d).slice(0, 300) : '')); } }

const task = (n) => ({ 업무명: n, 시작일: '2026-11-25', 완료일: '2026-11-25' });
ctx._msResults = [
    { fileName: 'f1', key: 'k1', subject: '신규 패널 문의', sender: 'a@x.com', body: '본문1', project: null, task: task('신규 패널 문의'), matchReason: '등록된 프로젝트 없음' },
    { fileName: 'f2', key: 'k2', subject: 'STELLAR32 샘플', sender: 'b@x.com', body: '본문2', project: 'STELLAR32 (32인치)', task: task('STELLAR32 샘플') },
    { fileName: 'f3', key: 'k3', subject: 'AI 실패 건', sender: 'c@x.com', body: '본문3', project: null, task: null, error: 'AI분석실패' },
    { fileName: 'f4', key: 'k4', subject: '이미 보관함', sender: 'd@x.com', body: '본문4', project: null, task: task('이미 보관함') }
];
inbox.push({ uid: 'old', status: '배치됨', task: task('이미 보관함'), mailRaw: { key: 'k4', fileName: 'f4' } });

console.log('\n[1] 미분류(후보 0개, 업무 있음) → 보관함 대기 카드');
let n = ctx._msUnmatchedToInbox();
ok('새로 만든 카드는 1건(f1)', n === 1, n);
const c1 = inbox.find((x) => x.mailRaw && x.mailRaw.key === 'k1');
ok('카드는 대기 · 후보 없음 · 사유는 AI 근거', !!c1 && c1.status === '대기' && c1.matchedProject.candidates.length === 0 && c1.matchedProject.matchBasis === '등록된 프로젝트 없음', c1);
ok('원문(본문·열쇠)이 카드에 실린다', !!c1 && c1.mailRaw.body2000 === '본문1' && c1.mailRaw.fileName === 'f1', c1 && c1.mailRaw);
ok('매칭된 건(f2)은 손대지 않는다', ctx._msResults[1].project === 'STELLAR32 (32인치)' && !inbox.some((x) => x.mailRaw && x.mailRaw.key === 'k2'));
ok('AI 실패 건(f3)은 미분류에 남는다', ctx._msResults[2].project === null && !inbox.some((x) => x.mailRaw && x.mailRaw.key === 'k3'));
ok('이미 보관함에 있는 메일(f4)은 카드를 또 만들지 않는다', inbox.filter((x) => x.mailRaw && x.mailRaw.key === 'k4').length === 1);
ok('옮긴 건은 미분류 목록에서 빠진다', ctx._msQueueGetRows('unmatched').map((r) => r.fileName).join(',') === 'f3', ctx._msQueueGetRows('unmatched').map((r) => r.fileName));

console.log('\n[2] 두 번 돌려도, 보관함에서 지워도 다시 안 생긴다');
n = ctx._msUnmatchedToInbox();
ok('두 번째 실행은 0건', n === 0, n);
inbox.splice(inbox.indexOf(c1), 1);
n = ctx._msUnmatchedToInbox();
ok('보관함에서 지운 뒤에도 다시 안 만든다', n === 0 && !inbox.some((x) => x.mailRaw && x.mailRaw.key === 'k1'), n);

console.log('\n[3] 입구 — 큐 저장이 곧 옮기기를 예약한다');
ctx._msResults.push({ fileName: 'f5', key: 'k5', subject: '새 미분류', sender: 'e@x.com', body: '', project: null, task: task('새 미분류') });
timers.length = 0;
ctx._msSaveQueueToStorage();
ok('저장하면 타이머가 하나 걸린다', timers.length === 1, timers.length);
if (timers[0]) timers[0].fn();
ok('타이머가 돌면 카드가 생긴다', inbox.some((x) => x.mailRaw && x.mailRaw.key === 'k5'));
ok('저장본(localStorage)에도 옮긴 표시가 남는다', /보관함\(프로젝트 없음\)/.test(store['ms_pending_queue'] || ''));

console.log('\n[4] 끄기');
store['gantt_unmatched_to_inbox_off'] = '1';
ctx._msResults.push({ fileName: 'f6', key: 'k6', subject: '끈 뒤', sender: 'f@x.com', body: '', project: null, task: task('끈 뒤') });
ok('끄면 아무것도 안 옮긴다', ctx._msUnmatchedToInbox() === 0 && ctx._msResults[ctx._msResults.length - 1].project === null);

console.log('\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
process.exit(fail ? 1 : 0);
