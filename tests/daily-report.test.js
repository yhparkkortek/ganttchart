/* ============================================================================
   📔 일일 업무보고 1단계 — 순수 로직 하네스 (2026-11-04)

       node tests/daily-report.test.js

   ⚠️ 가짜는 **바깥 경계에만** 둔다 — window/document/localStorage 스텁과 NAS 왕복
      (`window.nasAppFile`) 뿐이고, 검사 대상은 js/59 의 **진짜 함수**다
      (`_mailContentParse` · `dailyBuildDraft` · `dailySave` · `DAILY_PATHS`).
   ⚠️ 화면(모달·탭)은 여기서 안 본다 — 그건 브라우저에서 사람이 지나는 경로로 확인한다.
      이 하네스가 통과한다고 "화면이 된다"는 뜻이 아니다.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const win = {};
global.window = win;
global.document = {
    readyState: 'complete', addEventListener() {}, getElementById() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; },
    createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; },
    body: { appendChild() {} }
};
const store = {};
global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
};
win.document = global.document;
win.localStorage = global.localStorage;
win._currentLang = 'ko';
win._t = (ko) => ko;
win.escapeHtml = (s) => String(s == null ? '' : s);
win.showToast = () => {};
win._storageMode = () => 'nas';
win._nasAccount = 'yhpark';          // 🪪 파일 이름의 근거는 **NAS 계정**(js/57 이 드러낸다)
win.currentUserName = '박용훈';       // 표시용 이름 — 파일 이름에 쓰면 안 된다(아래 시험)
win.currentDriveFileName = 'LNW_STELLAR32_32.0.json';

// js/20 의 진짜 파서를 쓴다고 설계했으므로, 그 전역이 있는 상태를 재현한다.
// (js/20 전체를 로드하려면 DOM 이 더 필요해서, 쓰는 함수 두 개만 원본과 같은 동작으로 둔다)
win.wrExtractIssue = function (s) {
    if (!s) return { issue: '', fix: '' };
    const i = s.match(/\[문제점\]([^\n\[]*)/), f = s.match(/\[대책\]([^\n\[]*)/);
    return { issue: i ? i[1].trim() : '', fix: f ? f[1].trim() : '' };
};
win.wrTaskName = function (row) {
    if (!row) return '';
    return ['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][row._level] ? (row[['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][row._level]] || '') : '';
};
win._normalizeWbsDiscipline = (d) => ({ '영업': 'SAL', '기구': 'ME' }[String(d || '').trim()] || d);
win._addrSplitNames = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
win._msResolveCategoryAssignee = function (cat) {
    const map = { HW: '조익현,조재준', ME: '박지웅', PM: '박용훈', SAL: '장영익' };
    return map[cat] ? { category: cat, name: map[cat], email: '' } : null;
};

// ── NAS 는 가짜(메모리) — 경계다 ────────────────────────────────────────────
const nas = {};
win.nasAppFile = {
    get: async (rel, opts) => {
        if (!(rel in nas)) return null;
        return opts && opts.json ? JSON.parse(nas[rel]) : nas[rel];
    },
    put: async (rel, body) => { nas[rel] = typeof body === 'string' ? body : JSON.stringify(body); return { ok: true }; },
    list: async (rel) => Object.keys(nas).filter((k) => k.startsWith(rel + '/'))
        .map((k) => ({ name: k.slice(rel.length + 1), isdir: false })),
    exists: async () => false
};

// ── 진짜 js/59 로드 ─────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'js', '59-daily-report.js'), 'utf8');
new Function('window', 'document', 'localStorage', src)(win, global.document, global.localStorage);

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  — ' + d : '')); } };

// ══ 1. 메일 내용 파서 — 표식이 아니라 내용으로 판정한다 ══════════════════════
console.log('\n■ _mailContentParse (칸 내용으로 판정)');
const MAIL = '[검토요청][Andy → 박용훈] 2026-11-03\n'
    + '[핵심내용]55FLAT 인증비용 확인 요청. EMC/ESD 포함 견적이 필요하다.\n'
    + '[To do]박용훈이 11/10까지 인증기관 견적 회신\n'
    + '[문제점]인증기관 일정이 2주 밀렸다\n[대책]대체 기관 병행 문의\n'
    + '[출처]인증비용문의_20261103_Andy';
const p1 = win._mailContentParse(MAIL);
ok('메일 유래로 본다', p1.isMail === true);
ok('[핵심내용] 추출', p1.core.indexOf('55FLAT 인증비용') === 0, JSON.stringify(p1.core));
ok('[To do] 추출', p1.todo.indexOf('박용훈이 11/10') === 0, JSON.stringify(p1.todo));
ok('[출처] 추출', p1.source === '인증비용문의_20261103_Andy', p1.source);
ok('발신→수신 추출', p1.from === 'Andy' && p1.to === '박용훈', p1.from + '/' + p1.to);
ok('업무유형 추출', p1.type === '검토요청', p1.type);
ok('[문제점]은 js/20 함수로 위임', p1.issue === '인증기관 일정이 2주 밀렸다', p1.issue);
ok('[대책]도 같이', p1.fix === '대체 기관 병행 문의', p1.fix);
const p2 = win._mailContentParse('그냥 사람이 쓴 메모');
ok('메일 아닌 글은 isMail=false', p2.isMail === false);
ok('빈 값에도 안 터진다', win._mailContentParse('').isMail === false && win._mailContentParse(null).core === '');

// ══ 2. 경로 규칙 ════════════════════════════════════════════════════════════
console.log('\n■ DAILY_PATHS');
ok('파일 경로(월 폴더는 밑줄 — DSM 이 숫자+하이픈 이름을 거부한다)', win.DAILY_PATHS.file('2026-11-04', 'yhpark') === 'App_Config/DailyReport/2026_11/2026-11-04__yhpark.json',
   win.DAILY_PATHS.file('2026-11-04', 'yhpark'));
ok('월 폴더', win.DAILY_PATHS.month('2026-11-04') === 'App_Config/DailyReport/2026_11', win.DAILY_PATHS.month('2026-11-04'));
const pr = win.DAILY_PATHS.parse('2026-11-04__yhpark.json');
ok('파일명 역파싱', pr && pr.ymd === '2026-11-04' && pr.key === 'yhpark');
ok('엉뚱한 이름은 null', win.DAILY_PATHS.parse('_roster.json') === null);
// 🪪 [2026-11-05 실측 사고 회귀] 파일 이름의 근거는 **NAS 계정** 하나다.
//    예전엔 `currentUserName`(표시용)을 썼다 — 한글 실명·'비로그인 (로컬)' 이 ascii 치환에서
//    전부 깎여 `'unknown'` 이 되고, 그 결과 **팀원 전원이 한 파일을 함께 썼다.**
ok('키는 NAS 계정에서 온다(표시용 한글 이름을 쓰지 않는다)', win._dailyMyKey() === 'yhpark', win._dailyMyKey());
ok('계정을 모르면 키가 빈 값이다 — unknown 으로 떨어지지 않는다', (function () {
    const a = win._nasAccount; win._nasAccount = '';
    win.currentUserName = '비로그인 (로컬)';
    const k = win._dailyMyKey();
    win._nasAccount = a; win.currentUserName = '박용훈';
    return k === '';
})(), '키=' + (function () {
    const a = win._nasAccount; win._nasAccount = ''; const k = win._dailyMyKey(); win._nasAccount = a; return JSON.stringify(k);
})());
ok('계정을 모르면 쓰기가 거부된다', (function () {
    const a = win._nasAccount; win._nasAccount = '';
    let threw = false;
    try { win._dailyRequireKey(); } catch (e) { threw = /계정/.test(e.message); }
    win._nasAccount = a;
    return threw;
})());

// ══ 3. 자동 초안 — 간트에서 꺼내 쓴다(AI 호출 0회) ═══════════════════════════
console.log('\n■ dailyBuildDraft (AI 호출 없음)');
win.colIdx = { no: 0, bogo: 1, start: 2, plan: 3, period: 4, status: 5, wbs: 6, content: 7, chart: 8,
               assignee: -1, answer: -1, devStage: -1, customer: -1, model: -1, inch: -1 };
const today = win._dailyYmd();
const t0 = new Date(today + 'T00:00:00').getTime();
function row(lvl, name, content, startTs, planTs, disc) {
    const r = ['', lvl, '', '', 1, '진행', name, content, ''];
    r._level = lvl; r._calcStartTs = startTs; r._calcPlanTs = planTs;
    r['_origT' + lvl] = name; if (lvl === 0) r._origDev = name;
    if (disc) r._담당구분 = disc;
    return r;
}
const hdr = ['NO', 'LEVEL(WBS)', '시작', '완료', '소요일', '상태', '개발업무 (WBS)', '업무 상세내용', '현황'];
win.globalData = [
    hdr,
    row(3, '인증비용 문의 ＊AI📧', MAIL, t0, t0 + 86400000, 'PM'),          // 내 일(PM=박용훈)
    // ⚠️ 전부 같은 레벨로 둔다 — 더 깊은 행이 뒤따르면 그 행은 **부모**가 되어 후보에서
    //    빠진다(리프만 본다, js/20 wrClassifyTasks 와 같은 규칙). 처음 이 하네스를 쓸 때
    //    lvl4 를 lvl3 뒤에 둬서 "업무가 하나 사라진다"고 오해했다 — 코드가 아니라 픽스처가 틀렸다.
    row(3, '사출물 견적', '[자료제공][a → b] 2026-11-04\n[핵심내용]견적 접수\n[To do]검토\n[출처]x', t0, t0, 'HW'), // 남의 일
    row(3, '영업 확인', '[핵심내용]가격 확인\n[출처]y', t0, t0, '영업'),     // 정규화되면 SAL=장영익 → 남의 일
    row(3, '지난 업무', '[핵심내용]옛것\n[출처]z', t0 - 86400000 * 9, t0 - 86400000 * 8, 'PM') // 오늘 아님
];
win.changeLogs = [];
win._dailyRosterSet = null;

// 명단을 넣기 전: 내 이름을 모르니 "내 일"을 가릴 수 없다 → 전부 others (조용히 틀리지 않는다)
let d0 = win.dailyBuildDraft(today);
ok('명단 없으면 내 일로 단정하지 않는다', d0.mine.length === 0,
   'mine=' + d0.mine.length + ' others=' + d0.others.length);
ok('오늘 걸린 업무만 후보에 든다', d0.mine.length + d0.others.length === 3,
   '후보 ' + (d0.mine.length + d0.others.length) + '건(지난 업무 1건은 빠져야 한다)');

// 명단을 넣으면 역할로 내 일을 가린다
nas[win.DAILY_PATHS.roster] = JSON.stringify({ members: [
    { key: 'yhpark', name: '박용훈', aliases: ['박PM'], team: '개발3팀', active: true },
    { key: 'jschoi', name: '최종석', aliases: [], team: '개발3팀', active: true }
] });

(async function main() {
    await win.dailyLoadRoster(true);
    const d1 = win.dailyBuildDraft(today);
    ok('역할(_담당구분)로 내 일을 가린다', d1.mine.length === 1 && d1.mine[0].name.indexOf('인증비용 문의') === 0,
       'mine=' + JSON.stringify(d1.mine.map((x) => x.name)));
    ok('남의 일은 others 로', d1.others.length === 2, 'others=' + d1.others.length);
    ok('초안에 [핵심내용]이 실려 온다', (d1.mine[0].core || '').indexOf('55FLAT') === 0, d1.mine[0].core);
    ok('초안에 [To do]가 실려 온다', (d1.mine[0].todo || '').indexOf('박용훈이') === 0, d1.mine[0].todo);
    ok('＊AI📧 꼬리표는 업무명에서 뗀다', d1.mine[0].name.indexOf('AI📧') === -1, d1.mine[0].name);
    ok('메일 유래 표시', d1.mine[0].isMail === true);

    // `영업`(정규화 전) 도 SAL 로 풀려 장영익에게 간다 — 나와 안 섞인다
    ok('SAL/영업 정규화가 먹는다', !d1.mine.some((x) => x.name === '영업 확인'));

    // 오늘 내가 손댄 업무 — changeLogs 의 ko-KR 시각 문자열을 읽는다
    const dd = new Date(today + 'T10:00:00');
    win.changeLogs = [
        { time: dd.toLocaleString('ko-KR'), userName: 'yhpark', rowName: '포장재 검토 ＊AI📧', colName: '상태' },
        { time: dd.toLocaleString('ko-KR'), userName: '다른사람', rowName: '남의 업무', colName: '상태' }
    ];
    const d2 = win.dailyBuildDraft(today);
    ok('오늘 내가 손댄 업무를 모은다', d2.touched.length === 1 && d2.touched[0].name === '포장재 검토',
       JSON.stringify(d2.touched));

    // ══ 4. 저장 가드 ════════════════════════════════════════════════════════
    console.log('\n■ dailySave 가드');
    const doc = { date: today, key: 'yhpark', dayType: 'work',
                  items: [{ name: '인증비용 문의', note: '견적 회신' }], next: '검토', issue: '', rev: 0 };
    const saved = await win.dailySave(JSON.parse(JSON.stringify(doc)));
    ok('처음 저장되고 rev 가 올라간다', saved.rev === 1, 'rev=' + saved.rev);
    ok('NAS 에 사람×날짜 파일로 들어간다', !!nas[win.DAILY_PATHS.file(today, 'yhpark')]);

    // rev 충돌 — 다른 창이 먼저 저장한 상황
    let conflicted = false;
    try { await win.dailySave(JSON.parse(JSON.stringify(doc))); }  // rev 0 으로 또 저장
    catch (e) { conflicted = !!e.conflict; }
    ok('rev 가 다르면 덮어쓰지 않는다', conflicted);

    // 빈 내용 덮어쓰기 거부
    let blocked = false;
    try { await win.dailySave({ date: today, key: 'yhpark', dayType: 'work', items: [], next: '', issue: '', rev: 1 }); }
    catch (e) { blocked = /비어 있어/.test(e.message); }
    ok('내용 있는 날을 빈 것으로 덮지 않는다', blocked);

    // 휴가는 비어 있어도 저장된다(그게 정상 상태다)
    let leaveOk = false;
    try {
        const r = await win.dailySave({ date: today, key: 'yhpark', dayType: 'leave', items: [], next: '', issue: '', rev: 1 });
        leaveOk = r.rev === 2;
    } catch (e) { leaveOk = false; }
    ok('휴가는 빈 내용으로도 저장된다', leaveOk);

    // 읽기 실패 시 쓰지 않는다 — project_index 사고와 같은 가드
    const realGet = win.nasAppFile.get;
    win.nasAppFile.get = async () => { throw new Error('NAS 읽기 실패(HTTP 403)'); };
    let refused = false;
    try { await win.dailySave({ date: today, key: 'yhpark', dayType: 'work', items: [{ name: 'x' }], rev: 2 }); }
    catch (e) { refused = /읽지 못해/.test(e.message); }
    win.nasAppFile.get = realGet;
    ok('지금 저장본을 못 읽으면 저장을 멈춘다', refused);

    // ══ 5. 하루 집계 ════════════════════════════════════════════════════════
    console.log('\n■ dailyLoadDay (목록 1콜 + 필요한 파일만)');
    nas[win.DAILY_PATHS.file(today, 'jschoi')] = JSON.stringify(
        { date: today, key: 'jschoi', name: '최종석', dayType: 'work', items: [{ name: 'BOM 검토' }], rev: 1 });
    const day = await win.dailyLoadDay(today);
    ok('그 날짜 파일만 모은다', day.length === 2, '모인 수 ' + day.length);
    ok('다른 날짜는 안 섞인다', (function () {
        nas[win.DAILY_PATHS.file('2026-10-01', 'yhpark')] = JSON.stringify({ date: '2026-10-01', key: 'yhpark', items: [] });
        return true;
    })());
    const day2 = await win.dailyLoadDay(today);
    ok('같은 달 다른 날짜를 걸러낸다', day2.length === 2, '모인 수 ' + day2.length);

    console.log('\n' + (fail === 0 ? '✅ ' : '⛔ ') + pass + '/' + (pass + fail) + ' 통과');
    console.log('⚠️ 화면(모달·탭)은 이 하네스가 보지 않는다 — 브라우저에서 따로 확인할 것.');
    process.exit(fail ? 1 : 0);
})();
