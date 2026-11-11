/* ============================================================================
   🩺 저장소 닥터 레지스트리 — gantt_task_inbox · ms_new_sender_queue 등록 (2026-11-11)

       node tests/storage-doctor-registry.test.js

   왜 — "🧹 저장공간 정리" 창(js/34)이 가장 큰 두 항목(ms_pending_queue·gantt_task_inbox)을
   정리 대상에 안 보여준다는 지적. gantt_task_inbox 는 레지스트리에 아예 없어서 못 건드렸다.
   등록했더니 생긴 새 문제(겹침 — 같은 모달을 여는 함수가 이중으로 돈다)까지 같이 검증한다.

   ⚠️ 가짜는 **바깥 경계에만** — localStorage(진짜 Storage 인터페이스를 흉내 낸, 용량 제한 있는
      가짜)·document·confirm/alert/showToast 뿐이고, 검사 대상은 js/14c·js/34 의 **진짜 함수**다
      (`TaskInbox._shrinkForQuota` · `_taskInboxSlimForRegistry` · `STORAGE_REGISTRY` ·
      `window.inboxCleanupStorage`의 실제 겹침 방지 분기).
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

// ── 진짜 Storage 인터페이스를 흉내 낸, **용량 제한이 있는** 가짜 localStorage ──────────
// probeFree()(js/34)가 실제로 setItem을 늘려가며 써 보는 방식이라, 용량 제한이 없으면
// 8MB까지 전부 "성공"으로 보여 pct 계산이 의미 없어진다.
function makeLocalStorage(quotaChars) {
    const m = new Map();
    function total() { let t = 0; for (const [k, v] of m) t += k.length + v.length; return t; }
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => {
            v = String(v);
            const prev = m.has(k) ? (k.length + m.get(k).length) : 0;
            const next = total() - prev + k.length + v.length;
            if (next > quotaChars) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
            m.set(k, v);
        },
        removeItem: (k) => { m.delete(k); },
        get length() { return m.size; },
        key: (i) => Array.from(m.keys())[i],
        _raw: m
    };
}

const win = {};
global.window = win;
global.document = {
    addEventListener() {}, getElementById() { return null; },
    createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; },
    body: { appendChild() {} }
};
win.document = global.document;
win._t = (ko) => ko;
win._currentLang = 'ko';

let toasts = [];
win.showToast = (msg) => { toasts.push(msg); };
let alerts = [];
global.alert = (msg) => { alerts.push(msg); };
let confirmCalls = 0, confirmAnswer = true;
global.confirm = () => { confirmCalls++; return confirmAnswer; };
win.updateInboxBadge = () => {};
win._issueLog = () => {};

// js/14c 가 먼저 로드돼 window.TaskInbox·window.inboxCleanupStorage 를 만들어 둬야
// js/34의 즉시실행 래퍼(wrapCleanup)가 바로 그걸 감싼다(실제 로딩 순서와 같다 — 14 < 34).
const src14c = fs.readFileSync(path.join(__dirname, '..', 'js', '14c-task-inbox.js'), 'utf8');
new Function('window', 'document', src14c)(win, global.document);
const src34 = fs.readFileSync(path.join(__dirname, '..', 'js', '34-storage-doctor.js'), 'utf8');
new Function('window', 'document', src34)(win, global.document);
// window._msSlimQueue 의 진짜 정의는 js/15b — ms_new_sender_queue 등록이 가리키는 그 함수가
// 실제로 존재하는지까지 보려면 이 파일도 실제로 실행해 본다(가짜로 흉내내지 않는다).
let src15bOk = true, src15bErr = null;
try {
    const src15b = fs.readFileSync(path.join(__dirname, '..', 'js', '15b-mail-server-tab-1.js'), 'utf8');
    new Function('window', 'document', src15b)(win, global.document);
} catch (e) { src15bOk = false; src15bErr = e; }

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  — ' + JSON.stringify(d) : '')); } };

// 🐛 js/15b 는 이 작은 하네스가 다 갖추지 못한 다른 전역(그룹웨어/SAP 연동 등)도 top-level에서
// 건드려서, 끝까지 돌지는 않는다 — 그래도 `window._msSlimQueue` 는 그 실패 지점보다 **앞서**
// 정의되므로(아래에서 실제로 호출해 확인한다) 이 테스트의 목적엔 지장이 없다. 완주 실패는
// fail로 세지 않고 참고로만 남긴다.
if (!src15bOk) console.log('  ℹ️  js/15b 전체 실행은 ' + (src15bErr && src15bErr.message) + ' 에서 멈췄다(아래 _msSlimQueue 자체 호출로 확인하니 무관)');

console.log('\n■ 레지스트리 등록 — 전엔 없던 두 키');
{
    const reg = win.STORAGE_REGISTRY;
    const inboxEntry = reg.find((r) => r.key === 'gantt_task_inbox');
    const newSenderEntry = reg.find((r) => r.key === 'ms_new_sender_queue');
    ok('gantt_task_inbox 가 레지스트리에 있다', !!inboxEntry, reg.map((r) => r.key));
    ok('그 전략 함수(_taskInboxSlimForRegistry)가 실제로 존재한다',
        !!inboxEntry && inboxEntry.strategy.type === 'fn' && typeof win[inboxEntry.strategy.fn] === 'function');
    ok('cls는 log — 확인 없이 자동 정리되면 안 된다(사람이 쓴 업무 데이터)', !!inboxEntry && inboxEntry.cls === 'log');
    ok('ms_new_sender_queue 도 레지스트리에 있다', !!newSenderEntry, reg.map((r) => r.key));
    ok('그 전략 함수(_msSlimQueue, 기존 ms_pending_queue 와 동일 재사용)가 존재한다',
        !!newSenderEntry && typeof win[newSenderEntry.strategy.fn] === 'function');
    // 존재만이 아니라 **실제로 돌려서** 확인 — 큰 메일 레코드를 budget 밖으로 밀어낸다.
    const bigList = Array.from({ length: 50 }, (_, i) => ({ fileName: 'm' + i + '.eml', body: 'q'.repeat(50000) }));
    const slimmed = win[newSenderEntry.strategy.fn](bigList);
    ok('_msSlimQueue 가 실제로 예산 밖 항목을 줄인다', slimmed.list.length < bigList.length, slimmed.list.length);
}

console.log('\n■ _taskInboxSlimForRegistry — 완료 항목만 원문을 비우고, 대기 항목은 그대로');
{
    const list = [];
    for (let i = 0; i < 5; i++) {
        list.push({ uid: 'p' + i, status: '대기', addedAt: new Date(2026, 10, i + 1).toISOString(),
                    mailRaw: { subject: 's', body2000: 'x'.repeat(50) } });
    }
    for (let i = 0; i < 10; i++) {
        list.push({ uid: 'd' + i, status: '배치됨', addedAt: new Date(2026, 10, i + 1).toISOString(),
                    mailRaw: { subject: 's', body2000: 'y'.repeat(50) } });
    }
    const out = win._taskInboxSlimForRegistry(list);
    ok('반환 모양이 {list, json} — 레지스트리 type:fn 계약과 같다', Array.isArray(out.list) && typeof out.json === 'string');
    const pendingAfter = out.list.filter((it) => it.status === '대기');
    const doneAfter = out.list.filter((it) => it.status !== '대기');
    ok('대기 5건은 메일 원문이 그대로 남는다', pendingAfter.length === 5 && pendingAfter.every((it) => !!it.mailRaw));
    ok('완료 10건은 메일 원문이 비워진다(_mailRawStripped)',
        doneAfter.length === 10 && doneAfter.every((it) => it.mailRaw === null && it._mailRawStripped));
    ok('json 문자열이 실제로 더 짧아졌다(원문이 빠졌으니)', out.json.length < JSON.stringify(list).length);
}

console.log('\n■ 🧹 겹침 방지 — gantt_task_inbox 를 레지스트리 단계에서 이미 비웠으면 보관함 자체 정리가 또 돌지 않는다');
{
    // 완료 400건(300 상한을 넘김 + 메일원문 보유) — inboxHasCleanable() 이 정리 전엔 true.
    const list = [];
    for (let i = 0; i < 400; i++) {
        list.push({ uid: 'd' + i, status: '배치됨', addedAt: new Date(2020, 0, 1 + i).toISOString(),
                    mailRaw: { subject: '제목' + i, body2000: 'z'.repeat(300) } });
    }
    const json = JSON.stringify(list);
    // 용량은 **실제로 만든 페이로드 크기**에서 역산 — 추측하지 않는다(이 항목 하나로 55%를 넘기게).
    const quota = Math.round(json.length / 0.55);
    win.localStorage = makeLocalStorage(quota);
    global.localStorage = win.localStorage;
    win.localStorage.setItem('gantt_task_inbox', json);

    toasts = []; alerts = []; confirmCalls = 0; confirmAnswer = true;
    win.inboxCleanupStorage();

    ok('확인창이 정확히 한 번만 떴다(겹쳐서 두 번 묻지 않는다)', confirmCalls === 1, confirmCalls);
    ok('"정리 완료" 토스트가 떴다', toasts.some((t) => String(t).indexOf('정리 완료') !== -1), toasts);
    ok('뒤이어 "정리할 항목이 없습니다" 경고가 또 뜨지 않는다(겹침 버그라면 여기서 뜬다)',
        !alerts.some((a) => String(a).indexOf('정리할 항목이 없습니다') !== -1 || String(a).indexOf('Nothing to clean') !== -1),
        alerts);

    const after = JSON.parse(win.localStorage.getItem('gantt_task_inbox'));
    ok('저장된 값도 실제로 줄어들었다(완료 300건 상한 + 원문 비움)', after.length <= 300 && after.every((it) => it.mailRaw === null));
    ok('지금 TaskInbox.load() 로 읽어도 같은(줄어든) 값이 보인다 — 직접 쓰기가 실제 경로와 어긋나지 않는다',
        win.TaskInbox.load().length === after.length);
}

console.log('\n■ 대기 항목이 있으면(정리할 게 지금은 없으면) 겹침 분기 자체가 더는 안 걸린다');
{
    // 이번엔 **대기 5건만**(완료 없음) — inboxHasCleanable() 이 애초에 false 라 겹침 분기 자체가 안 걸린다.
    const list = [];
    for (let i = 0; i < 5; i++) {
        list.push({ uid: 'p' + i, status: '대기', addedAt: new Date(2026, 10, i + 1).toISOString(),
                    mailRaw: { subject: 's', body2000: 'x'.repeat(50) } });
    }
    const json = JSON.stringify(list);
    win.localStorage = makeLocalStorage(Math.round(json.length / 0.1));   // 넉넉한 용량 — pct 낮게
    global.localStorage = win.localStorage;
    win.localStorage.setItem('gantt_task_inbox', json);

    toasts = []; alerts = []; confirmCalls = 0;
    win.inboxCleanupStorage();

    ok('정리할 게 없다는 안내만 뜨고(확인창 자체가 안 뜬다)', confirmCalls === 0, confirmCalls);
    ok('대기 항목은 그대로 남아 있다(지우지 않는다)', JSON.parse(win.localStorage.getItem('gantt_task_inbox')).length === 5);
}

console.log('\n' + (fail === 0 ? '✅ ' : '⛔ ') + pass + '/' + (pass + fail) + ' 통과');
process.exit(fail ? 1 : 0);
