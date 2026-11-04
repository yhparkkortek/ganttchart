/* ============================================================================
   간트 엑셀 왕복이 행 메타(_level·_origT*·_mailRaw·_rowUid …)를 날리는지 — 재현 하네스
   (2026-11-04, STELLAR32 유실 사고 조사)

       node tests/gantt-excel-meta-loss.test.js

   ⚠️ 가짜는 **바깥 경계에만** 둔다 — window/document 스텁뿐이고, 검사하는
      `_ganttRows`(get)·`_ganttSet`(set)은 js/42 의 **진짜 함수**다
      (`window.PAGE_EXCEL_SPECS` 의 gantt 항목에서 꺼내 쓴다).

   왜 이 하네스가 필요했나 — `tests/page-excel-roundtrip.browser.js` 는 왕복 뒤
   **칸 값만** 비교하고(`IGNORE_FIELDS = { gantt: ['wbs'] }`) 행의 `_` 속성은
   보지 않는다. 그래서 메타가 전부 날아가도 통과한다. 실제로 그렇게 지나갔다.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

// ── 바깥 경계 스텁 (여기까지만 가짜다) ──────────────────────────────────────
const win = {};
global.window = win;
global.document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; },
    body: { appendChild() {} }
};
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
win.document = global.document;
win.localStorage = global.localStorage;
win._currentLang = 'ko';
win._t = (ko) => ko;
win.showToast = () => {};
win.pushUndoSnapshot = () => { pushed++; };
let pushed = 0;

// ── 진짜 코드 로드 ──────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'js', '42-page-excel-io.js'), 'utf8');
// 파일은 즉시실행함수 하나다 — 스텁 전역 위에서 그대로 돌린다.
new Function('window', 'document', 'localStorage', src)(win, global.document, global.localStorage);

const spec = (win.PAGE_EXCEL_SPECS || []).find((s) => s.id === 'gantt');
if (!spec) { console.error('❌ PAGE_EXCEL_SPECS 에 gantt 항목이 없다 — js/42 구조가 바뀌었다.'); process.exit(1); }
const block = spec.blocks[0];
const get = block.get, set = block.set;

// ── 실제 프로젝트와 같은 모양의 행을 만든다 ─────────────────────────────────
//    열 구성은 실측(개발3팀 12개 파일 전부 동일): NO·LEVEL(WBS)·시작·완료·소요일·
//    상태·개발업무(WBS)·업무 상세내용·현황  (담당자/대응내용 열은 없다 → -1)
win.colIdx = {
    no: 0, bogo: 1, start: 2, plan: 3, period: 4, status: 5, wbs: 6, content: 7, chart: 8,
    dur1: -1, dur2: -1, dur3: -1, dur4: -1, assignee: -1, taskType1: -1, taskType2: -1,
    taskType3: -1, taskType4: -1, customer: -1, model: -1, inch: -1, devStage: -1, answer: -1
};

function mkRow(no, level, name, start, plan, content, meta) {
    const r = ['', '', '', '', '', '', '', '', ''];
    r[0] = no; r[1] = level; r[2] = start; r[3] = plan; r[4] = 1; r[5] = '진행';
    r[6] = name; r[7] = content; r[8] = '█░░░░';
    r._level = level;
    r._origDev = level === 0 ? name : '';
    r._origT1 = level === 1 ? name : '';
    r._origT2 = level === 2 ? name : '';
    r._origT3 = level === 3 ? name : '';
    r._origT4 = level === 4 ? name : '';
    r._rowUid = 'uid' + no;
    r._calcStartTs = Date.parse(start);
    r._calcPlanTs = Date.parse(plan);
    r._startForced = true;
    r._planForced = true;
    r._isParallel = false;
    Object.assign(r, meta || {});
    return r;
}

const header = ['NO', 'LEVEL(WBS)', '시작', '완료', '소요일', '상태', '개발업무 (WBS)', '업무 상세내용', '현황'];
header._level = null;
win.globalData = [
    header,
    mkRow(1, 0, 'RFQ(KICK OFF)', '2026-02-23', '2026-02-23', ''),
    mkRow(2, 3, '인증비용 문의 ＊AI📧', '2026-03-05', '2026-03-06',
          '[검토요청][Andy→박용훈] 2026-03-05\n[핵심내용]인증비용 확인 요청\n[To do]견적 회신\n[출처]인증_0305_Andy',
          { _mailRaw: { subject: '인증비용 문의', sender: 'andy@x.com', body2000: '...' },
            _담당구분: 'HW', _aiRegistered: true, _aiConfidence: '상',
            _aiOrigStart: '2026-03-05', _aiOrigPlan: '2026-03-06' }),
    mkRow(3, 4, '샘플 발송', '2026-03-09', '2026-03-10', '[자료제공][박용훈→Andy] 2026-03-09\n[핵심내용]샘플 발송\n[To do]수령 확인\n[출처]샘플_0309_박용훈',
          { _mailRaw: { subject: '샘플 발송', sender: 'yh@x.com', body2000: '...' }, _담당구분: 'ME' })
];

// ── 왕복: 진짜 get() → 진짜 set() ───────────────────────────────────────────
const exported = get();
const before = win.globalData.slice(1).map((r) => ({
    uid: r._rowUid, lvl: r._level, t3: r._origT3, t4: r._origT4,
    mail: !!r._mailRaw, disc: r._담당구분, ai: !!r._aiRegistered
}));
set(exported);
const after = win.globalData.map((r) => ({
    uid: r._rowUid, lvl: r._level, t3: r._origT3, t4: r._origT4,
    mail: !!r._mailRaw, disc: r._담당구분, ai: !!r._aiRegistered,
    cells: Array.from(r)
}));

// ── 검사 ────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
};

console.log('\n■ 왕복 전 행 메타');
before.forEach((b, i) => console.log('   행%d lvl=%s t3/t4=%s mail=%s 담당구분=%s',
    i + 1, b.lvl, (b.t3 || b.t4 || '(없음)'), b.mail, b.disc));
console.log('\n■ 왕복 후 행 메타 (set() 통과 후)');
after.forEach((a, i) => console.log('   행%d lvl=%s t3/t4=%s mail=%s 담당구분=%s',
    i, a.lvl, (a.t3 || a.t4 || '(없음)'), a.mail, a.disc));

console.log('\n■ 칸 값은 살아남는가 (살아남아야 정상)');
ok('상세내용 유지', after.some((a) => String(a.cells[7] || '').includes('[출처]')));
ok('시작일 유지', after.some((a) => String(a.cells[2] || '').startsWith('2026-')));

console.log('\n■ 행 메타는 살아남는가 (이게 사고의 핵심)');
ok('_level 유지', after.filter((a) => a.lvl != null).length >= 3,
   '남은 _level 행 수 = ' + after.filter((a) => a.lvl != null).length);
ok('_origT3/_origT4(업무명 원본) 유지', after.filter((a) => a.t3 || a.t4).length >= 2,
   '남은 행 수 = ' + after.filter((a) => a.t3 || a.t4).length);
ok('_mailRaw(원문 보기) 유지', after.filter((a) => a.mail).length === 2,
   '남은 행 수 = ' + after.filter((a) => a.mail).length + ' / 기대 2');
ok('_담당구분 유지', after.filter((a) => a.disc).length === 2,
   '남은 행 수 = ' + after.filter((a) => a.disc).length + ' / 기대 2');
ok('_aiRegistered(학습 신호) 유지', after.filter((a) => a.ai).length === 1,
   '남은 행 수 = ' + after.filter((a) => a.ai).length + ' / 기대 1');
ok('_rowUid 유지', after.filter((a) => a.uid).length >= 3,
   '남은 행 수 = ' + after.filter((a) => a.uid).length);

console.log('\n■ 부수 확인');
ok('Undo 스냅샷을 남긴다', pushed === 1, 'pushUndoSnapshot 호출 ' + pushed + '회');

console.log('\n' + (fail === 0 ? '✅ ' : '⛔ ') + pass + '/' + (pass + fail) + ' 통과');
if (fail) {
    console.log('\n→ 실패한 항목이 2026-11-04 STELLAR32 유실의 재현이다.');
    console.log('   원인: js/42 `_ganttSet` 의 `old[i].slice()` — Array.prototype.slice 는');
    console.log('   인덱스 요소만 복사하고 배열에 붙은 커스텀 속성(_level 등)은 복사하지 않는다.');
}
process.exit(fail ? 1 : 0);
