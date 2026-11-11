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
// ⚠️⚠️ [2026-11-05] 전엔 `_msResolveCategoryAssignee` 를 통째로 가짜로 뒀는데, 그건 **틀린
//    계약**이었다 — 진짜 앱은 "역할 → 칸 이름"(`_MS_CATEGORY_FIELD_MAP`, 데이터)을 보고
//    **그 프로젝트의 `projectMeta`** 에서 이름을 꺼낸다. 해석 함수를 가짜로 두면 프로젝트마다
//    담당자가 다르다는 사실 자체가 하네스에서 사라져, 여러 프로젝트를 훑는 코드가 **다른
//    프로젝트에 지금 열린 프로젝트의 담당자를 먹여도** 통과한다.
//    → 카탈로그는 진짜 모양 그대로, 이름은 meta 와 멤버-3 에 심는다.
win._MS_CATEGORY_FIELD_MAP = {
    'PM':  { name: '프로젝트담당자', email: '프로젝트담당자이메일' },
    'HW':  { name: 'HW담당자',       email: 'HW담당자이메일' },
    'FW':  { name: 'FW담당자',       email: 'FW담당자이메일' },
    'BLU': { name: 'Module담당자',   email: 'Module담당자이메일' }
};
// ⚠️ 진짜 카탈로그엔 `ME`·`SAL` 키가 **없다** — 그 역할은 '프로젝트 멤버-3' 의 role 로만 풀린다.
win.projectMeta = { 프로젝트담당자: '박용훈', HW담당자: '조익현,조재준' };
win.tabData = { projectMembers3: [{ role: 'ME 기구', name: '박지웅' }, { role: 'SAL 영업', name: '장영익' }] };

// 저장 파일의 행 복원 — js/14d `_deserializeGlobalDataForMerge` 와 **같은 구현**(그 파일은
// 딸린 게 많아 통째로 못 싣는다). 모양이 어긋나면 여기 먼저 의심할 것.
win._deserializeGlobalDataForMerge = function (savedArr) {
    if (!Array.isArray(savedArr)) return null;
    return savedArr.map(function (obj) {
        if (!obj || !obj.data) return null;
        const r = obj.data.slice();
        for (const k in obj) { if (k !== 'data') r[k] = obj[k]; }
        return r;
    });
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
let _noSeq = 0;
function row(lvl, name, content, startTs, planTs, disc) {
    // ⚠️ No. 칸을 비워 두면 안 된다 — `changeLogs.rowName` 이 **이 값**이라,
    //    빈 채로 두면 '손댄 업무' 경로가 하네스에서만 다른 길을 탄다(그래서 버그를 놓쳤다).
    const r = [String(++_noSeq), lvl, '', '', 1, '진행', name, content, ''];
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

    // 오늘 내가 손댄 업무 — changeLogs 의 ko-KR 시각 문자열을 읽는다.
    // ⚠️⚠️ [2026-11-05 실사용 신고] `rowName` 은 **업무명이 아니라 No. 칸 값**이다
    //    (js/04i `logChange`). 어떤 기록은 아예 **행 인덱스**를 넣는다(js/04g·14d·04d).
    //    그걸 업무명으로 믿어서 보고에 `8` `851` `NO` `고객` 이 담겼다.
    const dd = new Date(today + 'T10:00:00');
    win.changeLogs = [
        { time: dd.toLocaleString('ko-KR'), userName: 'yhpark', rowName: '2', colName: '상태' },
        { time: dd.toLocaleString('ko-KR'), userName: 'yhpark', rowName: '851', colName: '상태' },   // 없는 번호
        { time: dd.toLocaleString('ko-KR'), userName: 'yhpark', rowName: 'NO', colName: '상태' },    // 머리글 글자
        { time: dd.toLocaleString('ko-KR'), userName: 'yhpark', rowName: '고객', colName: '상태' },  // 칸 이름
        { time: dd.toLocaleString('ko-KR'), userName: 'yhpark', rowName: 1, colName: '행 조작' },    // 인덱스다
        { time: dd.toLocaleString('ko-KR'), userName: '다른사람', rowName: '3', colName: '상태' }
    ];
    const d2 = win.dailyBuildDraft(today);
    ok('번호를 업무명으로 되찾는다', d2.touched.length === 1 && d2.touched[0].name === '사출물 견적',
       JSON.stringify(d2.touched));
    ok('없는 번호·머리글 글자·칸 이름은 담지 않는다(8·851·NO·고객 사고)',
        !d2.touched.some((x) => ['851', 'NO', '고객'].indexOf(x.name) >= 0),
        d2.touched.map((x) => x.name).join(','));
    ok('행 조작 기록은 건너뛴다(rowName 이 인덱스라 엉뚱한 업무가 된다)',
        !d2.touched.some((x) => x.name === '인증비용 문의'), d2.touched.map((x) => x.name).join(','));
    ok('되찾은 업무에 구분이 따라온다', d2.touched[0] && d2.touched[0].cat === 'HW',
        d2.touched[0] && d2.touched[0].cat);

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
    // ⚠️ 문구가 아니라 **동작**으로 본다 — 예전엔 `/비어 있어/` 로 글자를 박아 둬서, 안내를 고치면
    //    고장이 아닌데도 시험이 깨졌다(2026-11-09 에 실제로 그랬다).
    let blocked = false;
    try { await win.dailySave({ date: today, key: 'yhpark', dayType: 'work', items: [], next: '', issue: '', rev: 1 }); }
    catch (e) { blocked = true; }
    ok('내용 있는 날을 빈 것으로 덮지 않는다', blocked && (win.DAILY_PATHS.file(today, 'yhpark') in nas));

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


    // ══ 📎 사진·파일 첨부 ══════════════════════════════════════════════════
    //  ⚠️ 사진 줄이기(canvas)는 여기서 **안 본다** — 브라우저만 있는 것이다.
    //     여기선 문서(.pdf)로 돌려 "바이트가 NAS 로 가고 참조가 남는가"만 본다.
    console.log('\n■ 📎 첨부 — 이름 눕히기(백엔드 _daily_safe_name 과 같은 결과여야 한다)');
    const BS = String.fromCharCode(92);
    ok('경로 구분자를 지운다', win.DAILY_PATHS.safeName('a/b' + BS + 'c.jpg') === 'a_b_c.jpg',
        win.DAILY_PATHS.safeName('a/b' + BS + 'c.jpg'));
    const bad = win.DAILY_PATHS.safeName('..' + BS + 'pw.txt');
    ok('경로 탈출도 숨은 파일도 나오지 않는다',
        bad.indexOf('/') < 0 && bad.indexOf(BS) < 0 && bad[0] !== '.' && bad === '_pw.txt', bad);
    ok('금지 문자를 밑줄로', win.DAILY_PATHS.safeName('a:b*c?.pdf') === 'a_b_c_.pdf',
        win.DAILY_PATHS.safeName('a:b*c?.pdf'));
    ok('빈 이름은 file', win.DAILY_PATHS.safeName('') === 'file');
    ok('긴 이름도 확장자를 지킨다', (function () {
        const s = win.DAILY_PATHS.safeName('x'.repeat(120) + '.xlsx');
        return s.length <= 90 && /\.xlsx$/.test(s);
    })());
    ok('한글 이름은 그대로', win.DAILY_PATHS.safeName('현장 사진.JPG') === '현장 사진.JPG');

    const frel = win.DAILY_PATHS.fileRel('2026-11-05', 'yhpark', '현장.jpg');
    ok('첨부 폴더는 글자로 시작한다(files)', frel.split('/')[2] === '2026_11' && frel.indexOf('/files/') > 0, frel);
    ok('첨부 이름에 날짜·계정이 들어간다', /2026-11-05__yhpark__현장\.jpg$/.test(frel), frel);

    console.log('\n■ 📎 올리기 — 바이트는 NAS, 보고엔 참조만');
    // 바깥 경계 셋: 파일 읽기(FileReader) · 종류 판정(js/42) · NAS 이진 왕복
    global.FileReader = function () {
        this.readAsDataURL = (blob) => {
            this.result = 'data:application/octet-stream;base64,' + (blob && blob._b64 ? blob._b64 : '');
            setTimeout(() => this.onload && this.onload(), 0);
        };
    };
    win.FileReader = global.FileReader;
    global.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    win.URL = global.URL;
    win._docKindOf = (n) => (/\.(png|jpe?g)$/i.test(n) ? { k: 'image' } : (/\.pdf$/i.test(n) ? { k: 'pdf' } : null));
    const bytes = {};                       // rel → b64 (이진 전용 가짜 저장소)
    const deleted = [];
    win.nasAppFile.putBytes = async (rel, b64) => { bytes[rel] = b64; nas[rel] = '(binary)'; return { ok: true }; };
    win.nasAppFile.del = async (rel) => { deleted.push(rel); delete bytes[rel]; delete nas[rel]; return { ok: true }; };
    win.nasAppFile.getBlob = async (rel) => (rel in bytes ? { _b64: bytes[rel] } : null);
    const mkFile = (name, size, b64) => ({ name: name, size: size, _b64: b64 || 'QUJD' });

    // 모달을 거쳐야 `_doc` 이 선다 — 사람이 지나는 입구 그대로 쓴다.
    const attachDate = today;
    delete nas[win.DAILY_PATHS.file(attachDate, 'yhpark')];
    await win.dailyOpenModal(attachDate);
    await win.dailyAttachFiles([mkFile('사양서.pdf', 1234, 'QUJD')]);
    const relPdf = win.DAILY_PATHS.fileRel(attachDate, 'yhpark', '사양서.pdf');
    ok('바이트가 NAS 로 갔다', bytes[relPdf] === 'QUJD', Object.keys(bytes));
    await win._dailySave();
    const saved0 = JSON.parse(nas[win.DAILY_PATHS.file(attachDate, 'yhpark')]);
    ok('보고엔 참조만 남는다(바이트가 안 들어간다)',
        (saved0.files || []).length === 1 && saved0.files[0].rel === relPdf
        && JSON.stringify(saved0).indexOf('QUJD') < 0, JSON.stringify(saved0.files));
    ok('누가 올렸는지(via)·크기가 적힌다',
        saved0.files[0].via === 'app' && saved0.files[0].size === 1234, saved0.files[0]);

    await win.dailyAttachFiles([mkFile('사양서.pdf', 50, 'WFla')]);
    const saved1 = (function () { return win.DAILY_PATHS.fileRel(attachDate, 'yhpark', '사양서-2.pdf'); })();
    ok('같은 이름은 번호가 붙는다(먼저 올린 게 안 덮인다)',
        bytes[saved1] === 'WFla' && bytes[relPdf] === 'QUJD', Object.keys(bytes));

    const before = Object.keys(bytes).length;
    await win.dailyAttachFiles([mkFile('대형.pdf', (win.DAILY_POLICY.fileMaxMB + 1) * 1048576, 'QQ==')]);
    ok('상한을 넘는 파일은 올리지 않는다', Object.keys(bytes).length === before, Object.keys(bytes));

    console.log('\n■ 📎 지우기 — 바이트를 먼저, 그 다음 참조');
    await win._dailySave();            // _doc 을 NAS 와 먼저 맞춘다 — 안 맞춘 상태로
    //    세면 "저장 안 한 2개" vs "저장된 1개" 를 비교해 하네스가 거짓 실패를 낸다.
    win.nasAppFile.del = async () => { throw new Error('권한 거부(403)'); };
    const nBefore = (await win.dailyLoad(attachDate)).files.length;
    await win.dailyDropFile(0);
    await win._dailySave();
    ok('바이트를 못 지우면 참조도 그대로 둔다(지웠다고 거짓말하지 않는다)',
        (JSON.parse(nas[win.DAILY_PATHS.file(attachDate, 'yhpark')]).files || []).length === nBefore,
        JSON.parse(nas[win.DAILY_PATHS.file(attachDate, 'yhpark')]).files);
    win.nasAppFile.del = async (rel) => { deleted.push(rel); delete bytes[rel]; delete nas[rel]; return { ok: true }; };
    await win.dailyDropFile(0);
    ok('지우면 NAS 바이트가 먼저 사라진다', deleted.indexOf(relPdf) >= 0 && !(relPdf in bytes), deleted);

    console.log('\n■ 📎 사진만 달린 보고를 "빈 것"으로 보지 않는다');
    const fdate = '2026-11-07';
    nas[win.DAILY_PATHS.file(fdate, 'yhpark')] = JSON.stringify({
        date: fdate, key: 'yhpark', items: [], files: [{ name: 'a.pdf', safe: 'a.pdf', rel: 'r', size: 1 }],
        next: '', issue: '', rev: 2
    });
    let wiped = null;
    try {
        await win.dailySave({ date: fdate, key: 'yhpark', items: [], files: [], next: '', issue: '', rev: 2 });
        wiped = 'saved';
    } catch (e) { wiped = e.message; }
    // ⚠️ 문구가 아니라 **동작**으로 — 안내를 고치면 고장이 아닌데도 깨진다(2026-11-09).
    ok('첨부만 있던 보고를 빈 것으로 덮지 못한다', wiped !== 'saved' && (win.DAILY_PATHS.file(fdate, 'yhpark') in nas), wiped);
    const keep = await win.dailySave({ date: fdate, key: 'yhpark', items: [],
        files: [{ name: 'b.pdf', safe: 'b.pdf', rel: 'r2', size: 2 }], next: '', issue: '', rev: 2 });
    ok('첨부만 바꾸는 저장은 통과한다', keep && keep.rev === 3, keep && keep.rev);

    console.log('\n■ 📎 참조가 가리키는 파일이 없으면 화면에 드러낸다');
    // ⚠️ 모달이 열릴 때 부르는 그 함수를 그대로 부른다(`window.dailyMarkMissingFiles`).
    const mdate = '2026-11-08';
    nas[win.DAILY_PATHS.fileRel(mdate, 'yhpark', '있다.pdf')] = '(binary)';
    const mdoc = {
        date: mdate, key: 'yhpark', items: [{ name: 'A' }], next: '', issue: '', rev: 1,
        files: [{ name: '있다.pdf', safe: '있다.pdf', rel: win.DAILY_PATHS.fileRel(mdate, 'yhpark', '있다.pdf'), size: 1 },
                { name: '없다.pdf', safe: '없다.pdf', rel: win.DAILY_PATHS.fileRel(mdate, 'yhpark', '없다.pdf'), size: 1 }]
    };
    await win.dailyMarkMissingFiles(mdoc);
    ok('없는 파일만 ⚠️ 로 표시된다',
        mdoc.files[0].missing === false && mdoc.files[1].missing === true,
        mdoc.files.map((f) => f.name + ':' + f.missing).join(','));

    // 폴더 목록을 못 보는 경우(권한 거부는 **빈 배열**로 온다) — "없다"고 단정하면 안 된다
    const realList = win.nasAppFile.list;
    win.nasAppFile.list = async () => [];
    const mdoc2 = JSON.parse(JSON.stringify(mdoc));
    mdoc2.files.forEach((f) => { delete f.missing; });
    await win.dailyMarkMissingFiles(mdoc2);
    ok('목록을 못 보면 아무것도 ⚠️ 로 만들지 않는다',
        !mdoc2.files.some((f) => f.missing), mdoc2.files.map((f) => f.name + ':' + f.missing).join(','));
    win.nasAppFile.list = realList;


    // ══ 📎 열기 — 연결 프로그램 → 새 탭 → 이름 붙여 내려받기 ═══════════════════════
    //  ⚠️ 2026-11-05 실사용 신고: 사진을 눌렀더니 `242b6110-…`(확장자 없음)로 받아졌다.
    //     `blob:` URL 엔 **이름이 실리지 않는다**는 것이 원인이고, 아래가 그 세 갈래다.
    console.log('\n■ 📎 첨부 열기');
    const opened = [], downloaded = [], natived = [];
    let popupOk = true, nativeOk = true;
    global.Blob = global.Blob || function (parts, o) { return { parts, type: (o || {}).type }; };
    global.URL.createObjectURL = (b) => 'blob:fake#' + ((b && b.type) || 'none');
    global.URL.revokeObjectURL = () => {};
    win.URL = global.URL;
    win.open = (u) => { opened.push(u); return popupOk ? {} : null; };
    win.nasAppFile.openNative = async (rel) => {
        natived.push(rel);
        if (!nativeOk) throw new Error('그 파일이 공유에서 안 보입니다');
        return { ok: true, rel };
    };
    // js/42 는 바깥이다 — 종류 판정은 거기 카탈로그가 하고, 여기선 경계로 둔다.
    win._docMimeOf = (n) => (/\.jpe?g$/i.test(n) ? { mime: 'image/jpeg', view: true }
                          : (/\.xlsx$/i.test(n) ? { mime: 'application/vnd…sheet', view: false }
                          : { mime: '', view: false }));
    const realCreate = global.document.createElement;
    global.document.createElement = (tag) => (tag === 'a'
        ? { href: '', download: '', style: {}, click() { downloaded.push({ href: this.href, name: this.download }); }, remove() {} }
        : realCreate(tag));
    global.document.body.appendChild = () => {};
    win.document = global.document;

    const relJpg = win.DAILY_PATHS.fileRel('2026-11-09', 'yhpark', 'photo_115659.jpg');
    const relXls = win.DAILY_PATHS.fileRel('2026-11-09', 'yhpark', '원가.xlsx');
    nas[relJpg] = '(binary)'; nas[relXls] = '(binary)';
    win.nasAppFile.getBlob = async (rel) => (rel in nas ? { _b64: 'QQ==' } : null);

    // ① 연결 프로그램이 되면 거기서 끝 — 받지도, 새 탭을 열지도 않는다
    const r1 = await win.dailyOpenRel(relJpg, 'photo_115659.jpg');
    ok('연결 프로그램으로 연다', r1 === true && natived.length === 1, { r1, natived });
    ok('그때는 받지 않는다', downloaded.length === 0 && opened.length === 0, { downloaded, opened });

    // ② 연결 프로그램이 안 되면 — 볼 수 있는 종류는 새 탭, 그것도 **MIME 을 달아서**
    nativeOk = false;
    const r2 = await win.dailyOpenRel(relJpg, 'photo_115659.jpg');
    ok('못 열면 새 탭으로 되돌린다', r2 === true && opened.length === 1, { r2, opened });
    ok('blob 에 MIME 이 붙는다(안 붙이면 전부 받아진다)',
        opened[0].indexOf('image/jpeg') > 0, opened[0]);
    ok('새 탭으로 열렸으면 받지 않는다', downloaded.length === 0, downloaded);

    // ③ 팝업이 막히면 — **이름을 붙여** 내려받는다(GUID 가 아니라)
    popupOk = false;
    const r3 = await win.dailyOpenRel(relJpg, 'photo_115659.jpg');
    ok('팝업이 막히면 내려받는다', r3 === false && downloaded.length === 1, { r3, downloaded });
    ok('받는 이름에 확장자가 붙는다', downloaded[0].name === 'photo_115659.jpg', downloaded[0]);

    // ④ 브라우저가 못 보는 종류는 **새 탭으로 보내지 않는다**(그게 그 신고의 증상이었다)
    popupOk = true;
    opened.length = 0; downloaded.length = 0;
    const r4 = await win.dailyOpenRel(relXls, '원가.xlsx');
    ok('엑셀은 새 탭으로 안 보낸다', opened.length === 0, opened);
    ok('엑셀은 이름을 붙여 받는다', r4 === false && downloaded[0] && downloaded[0].name === '원가.xlsx', downloaded);

    // ⑤ 없는 파일은 조용히 넘어가지 않는다
    opened.length = 0; downloaded.length = 0;
    const r5 = await win.dailyOpenRel(win.DAILY_PATHS.fileRel('2026-11-09', 'yhpark', '없다.jpg'), '없다.jpg');
    ok('없는 파일은 열지도 받지도 않는다',
        r5 === false && !opened.length && !downloaded.length, { r5, opened, downloaded });


    // ══ 칸 이름 · 프로젝트 · 업무 구분 (2026-11-05 요청) ═══════════════════
    console.log('\n■ 칸 이름은 데이터 한 곳 — 표 머리글·엑셀이 여기서 읽는다');
    ok('해야 할 일 / 막힌 일 로 바뀌었다',
        win.DAILY_FIELDS.map((f) => f.ko).join(',') === '오늘 한 일,해야 할 일,막힌 일',
        win.DAILY_FIELDS.map((f) => f.ko).join(','));
    ok('영문도 같이 바뀌었다',
        win.DAILY_FIELDS.map((f) => f.en).join(',') === 'Done today,To do,Blockers',
        win.DAILY_FIELDS.map((f) => f.en).join(','));

    console.log('\n■ 업무 구분(HW·FW·ME…)은 간트에서 따라온다');
    win._dailyRosterSet = [{ key: 'yhpark', name: '박용훈', aliases: [], team: '개발3팀', active: true }];
    const dcat = win.dailyBuildDraft(today);
    const all = [].concat(dcat.mine, dcat.others);
    const byName = {};
    all.forEach((c) => { byName[c.name.replace(/\s*＊AI📧?\s*$/, '')] = c; });
    ok('내 일에 구분이 실린다', (byName['인증비용 문의'] || {}).cat === 'PM', (byName['인증비용 문의'] || {}).cat);
    ok('남의 일에도 실린다', (byName['사출물 견적'] || {}).cat === 'HW', (byName['사출물 견적'] || {}).cat);
    ok('정규화를 거친다(영업 → SAL)', (byName['영업 확인'] || {}).cat === 'SAL', (byName['영업 확인'] || {}).cat);
    ok('프로젝트 이름에서 .json 을 뗀다',
        all.every((c) => !/\.json$/i.test(c.project)) && all[0].project === 'LNW_STELLAR32_32.0',
        all[0] && all[0].project);

    console.log('\n■ 항목 한 줄 — 화면과 엑셀이 같은 함수를 쓴다');
    ok('구분·프로젝트·메모가 한 줄에',
        win._dailyItemLine({ name: 'A', cat: 'HW', project: 'P.json', note: 'n' }) === '• [HW] A (P) — n',
        win._dailyItemLine({ name: 'A', cat: 'HW', project: 'P.json', note: 'n' }));
    ok('구분이 없으면 대괄호도 없다',
        win._dailyItemLine({ name: 'A', project: 'P' }) === '• A (P)',
        win._dailyItemLine({ name: 'A', project: 'P' }));
    ok('빈 항목에도 안 터진다', typeof win._dailyItemLine({}) === 'string');

    console.log('\n■ 행 더블클릭 — 내 행에서만 열린다');
    const realOpen = win.dailyOpenModal;
    let dblOpened = 0;
    win.dailyOpenModal = async () => { dblOpened++; };
    win._dailyTabDate = today;
    win._dailyRowDbl('jschoi');
    ok('남의 행에서는 안 연다(한 파일에 쓰는 사람은 한 명)', dblOpened === 0, dblOpened);
    win._dailyRowDbl('yhpark');
    ok('내 행에서는 연다', dblOpened === 1, dblOpened);
    win._dailyRowDbl('YHPARK');
    ok('대소문자가 달라도 내 행이다', dblOpened === 2, dblOpened);
    win.dailyOpenModal = realOpen;


    // ══ 저장 전 초안 — **통째로 덮지 않는다** ═════════════════════════════
    //  ⚠️ 2026-11-05: 오늘 보고에서 사진 참조가 사라진 걸 보고 이 경로를 들여다봤다.
    //     초안은 "이 브라우저가 마지막으로 본 모습"일 뿐이라, 그 사이 텔레그램으로 들어온
    //     항목·사진이 저장 때 조용히 사라진다(읽고-고쳐-통째로 쓰기).
    console.log('\n■ 초안 되살리기는 합치기다');
    const ddate = '2026-11-21';
    nas[win.DAILY_PATHS.file(ddate, 'yhpark')] = JSON.stringify({
        date: ddate, key: 'yhpark', dayType: 'work', rev: 7, savedAt: '2026-11-21T01:00:00.000Z',
        items: [{ name: '텔레그램으로 온 업무', via: 'telegram' }],
        files: [{ name: 'photo.jpg', safe: 'photo.jpg', rel: 'r', size: 9 }],
        next: '', issue: ''
    });
    // 사람이 그 전에 모달을 열어 두고 친 글(= 사진·텔레그램 항목을 모르는 초안)
    localStorage.setItem(win.DAILY_POLICY.draftKey, JSON.stringify({
        at: Date.parse('2026-11-21T02:00:00.000Z'),
        doc: { date: ddate, key: 'yhpark', dayType: 'work', rev: 0, savedAt: '',
               items: [{ name: '내가 적은 업무' }], files: [], next: '손으로 친 글', issue: '' }
    }));
    await win.dailyOpenModal(ddate);
    const merged = JSON.parse(nas[win.DAILY_PATHS.file(ddate, 'yhpark')]);   // 아직 저장 전
    await win._dailySave();
    const after = JSON.parse(nas[win.DAILY_PATHS.file(ddate, 'yhpark')]);
    ok('사람이 친 글은 초안이 이긴다', after.next === '손으로 친 글', after.next);
    ok('📎 사진이 살아남는다(전엔 조용히 사라졌다)',
        (after.files || []).length === 1 && after.files[0].name === 'photo.jpg', after.files);
    ok('그 사이 들어온 텔레그램 항목도 살아남는다',
        (after.items || []).some((i) => i.name === '텔레그램으로 온 업무'), (after.items || []).map((i) => i.name));
    ok('내가 적은 업무도 그대로',
        (after.items || []).some((i) => i.name === '내가 적은 업무'), (after.items || []).map((i) => i.name));
    ok('rev 는 NAS 기준으로 올라간다(충돌 가드가 쓴다)', after.rev === 8, after.rev);
    ok('초안은 저장 뒤 지워진다', !localStorage.getItem(win.DAILY_POLICY.draftKey));
    void merged;


    // ══ 📒 명단은 주소록에서 (2026-11-05 요청) ════════════════════════════
    //  ⚠️ 주소록은 **전사**다(실측 394명) — 부서로 거르지 않으면 남의 팀이 전부 '미작성'이 된다.
    console.log('\n■ 명단을 주소록에서 꾸린다');
    win.tabData = win.tabData || {};
    win.tabData.addressBook = [
        { name: '박용훈', dept: '개발3팀', email: 'yhpark@x.co.kr', telegramId: '8790493335' },
        { name: '최종석', dept: '개발3팀', email: 'jschoi@x.co.kr', telegramId: '' },
        { name: '장영익', dept: '개발3팀', email: 'yijang@x.co.kr', telegramId: '111' },
        { name: '개발3팀', dept: '개발3팀', email: 'dev3@x.co.kr', telegramId: '' },   // 그룹 메일 주소
        { name: '메일없음', dept: '개발3팀', email: '', telegramId: '' },               // 계정을 못 만든다
        { name: '남의팀', dept: '개발6팀', email: 'other@x.co.kr', telegramId: '222' }
    ];

    const fromAb = win.dailyRosterFromAddressBook('개발3팀');
    ok('우리 팀만 뽑는다', fromAb.length === 3, fromAb.map((m) => m.name).join(','));
    ok('이름이 부서와 같은 행(그룹 주소)은 사람이 아니다',
        !fromAb.some((m) => m.name === '개발3팀'), fromAb.map((m) => m.name).join(','));
    ok('메일이 없으면 넣지 않는다(파일 이름을 못 만든다)',
        !fromAb.some((m) => m.name === '메일없음'), fromAb.map((m) => m.name).join(','));
    ok('계정id 는 메일 @ 앞부분', fromAb.map((m) => m.key).sort().join(',') === 'jschoi,yhpark,yijang',
        fromAb.map((m) => m.key).join(','));
    ok('텔레그램 chat id 를 주소록에서 가져온다(두 번 적지 않는다)',
        (fromAb.filter((m) => m.key === 'yhpark')[0] || {}).tgChatId === '8790493335');
    ok('팀을 모르면 아무도 안 넣는다(전사 394명을 띄울 순 없다)',
        win.dailyRosterFromAddressBook('').length === 0 && win.dailyRosterFromAddressBook(null).length === 0);
    ok('계정id 눕히는 규칙이 myKey 와 같다',
        win._dailyKeyClean('Y.Park@x') === 'y.park-x' && win._dailyKeyClean('  AB  ') === 'ab',
        win._dailyKeyClean('Y.Park@x'));

    console.log('\n■ 합칠 때 사람이 적은 값이 이긴다');
    nas[win.DAILY_PATHS.roster] = JSON.stringify({
        rev: 3,
        members: [
            { key: 'yhpark', name: '박용훈', team: '개발3팀', aliases: ['PM박'], tgChatId: '8790493335',
              active: true, notifier: true },
            { key: 'jschoi', name: '', team: '', aliases: [], tgChatId: '', active: false }
        ]
    });
    const merged2 = await win.dailyLoadRoster(true);
    const byK = {};
    merged2.forEach((m) => { byK[m.key] = m; });
    ok('파일에 없던 팀원이 더해진다', !!byK['yijang'], Object.keys(byK).join(','));
    ok('📣 담당 표시가 살아남는다', byK['yhpark'].notifier === true);
    ok('사용 안 함 표시가 살아남는다(주소록이 되살리지 않는다)', byK['jschoi'].active === false);
    ok('별칭이 살아남는다', (byK['yhpark'].aliases || []).join(',') === 'PM박');
    ok('빈 칸만 주소록으로 채운다', byK['jschoi'].name === '최종석' && byK['jschoi'].team === '개발3팀',
        JSON.stringify(byK['jschoi']));
    ok('남의 팀은 안 들어온다', !byK['other'], Object.keys(byK).join(','));


    // ══ 업무별 보고 (2026-11-05 요청) ═════════════════════════════════════
    console.log('\n■ 해야 할 일·막힌 일·사진이 업무마다 붙는다');
    ok('칸 정의에 항목 이름이 같이 있다',
        win.DAILY_FIELDS.map((f) => f.key + '→' + f.itemKey).join(',') === 'done→note,next→next,issue→issue',
        win.DAILY_FIELDS.map((f) => f.itemKey).join(','));
    ok('done 만 항목에선 note 다(옛 보고의 글이 안 사라지게)',
        win.DAILY_FIELDS[0].itemKey === 'note');

    const pdate = '2026-11-24';
    delete nas[win.DAILY_PATHS.file(pdate, 'yhpark')];
    await win.dailyOpenModal(pdate);
    document.getElementById = (id) => (id === 'daily-manual' ? { value: 'A 업무' } : null);
    win._dailyAddManual();
    document.getElementById = (id) => (id === 'daily-manual' ? { value: 'B 업무' } : null);
    win._dailyAddManual();
    document.getElementById = () => null;
    win._dailyItemField(0, 'note', 'A 를 했다');
    win._dailyItemField(0, 'next', 'A 를 더 한다');
    win._dailyItemField(1, 'issue', 'B 가 막혔다');
    await win._dailySave();
    const pd = JSON.parse(nas[win.DAILY_PATHS.file(pdate, 'yhpark')]);
    ok('업무마다 세 칸이 따로 저장된다',
        pd.items[0].note === 'A 를 했다' && pd.items[0].next === 'A 를 더 한다'
        && !pd.items[1].next && pd.items[1].issue === 'B 가 막혔다',
        JSON.stringify(pd.items));
    ok('보고 전체 칸은 비어 있다(업무에 붙었으니)', !pd.next && !pd.issue, [pd.next, pd.issue].join('|'));

    console.log('\n■ 사진도 업무에 붙는다 — 꼬리표(task)로');
    await win.dailyAttachFiles([mkFile('a.pdf', 10, 'QUJD')], 'A 업무');
    await win.dailyAttachFiles([mkFile('b.pdf', 10, 'WFla')], 'B 업무');
    await win.dailyAttachFiles([mkFile('c.pdf', 10, 'Q0NO')], '');
    await win._dailySave();
    const pf = JSON.parse(nas[win.DAILY_PATHS.file(pdate, 'yhpark')]);
    const tag = {};
    (pf.files || []).forEach((f) => { tag[f.name] = String(f.task || '(없음)'); });
    ok('파일이 제 업무에 붙는다', tag['a.pdf'] === 'A 업무' && tag['b.pdf'] === 'B 업무',
        JSON.stringify(tag));
    ok('꼬리표 없는 것은 보고 전체(기타)', tag['c.pdf'] === '(없음)', JSON.stringify(tag));
    ok('배열은 하나 그대로다(옛 보고가 안 깨진다)', Array.isArray(pf.files) && pf.files.length === 3,
        (pf.files || []).length);

    // ⚠️ 카드에 보이는 번호는 걸러 낸 목록의 번호가 아니라 **_doc.files 안의 진짜 자리**여야 한다.
    //    아니면 두 번째 업무의 사진을 지울 때 첫 번째 업무 것이 지워진다.
    const idxB = pf.files.findIndex((f) => f.name === 'b.pdf');
    await win.dailyDropFile(idxB);
    await win._dailySave();
    const pf2 = JSON.parse(nas[win.DAILY_PATHS.file(pdate, 'yhpark')]);
    ok('지우면 그 업무 것만 사라진다',
        pf2.files.map((f) => f.name).sort().join(',') === 'a.pdf,c.pdf',
        pf2.files.map((f) => f.name).join(','));

    // ══ 8. 내가 맡은 **다른** 프로젝트도 훑는다 ═══════════════════════════════
    console.log('\n■ 여러 프로젝트에서 모은다 (간트에서 불러오기)');

    // 저장 파일 모양 — 행은 {data:[...], _level, _담당구분, …} 이다(js/04c `_serializeGD`).
    function savedRow(lvl, name, content, startTs, planTs, disc) {
        const o = { data: ['1', lvl, '', '', 1, '진행', name, content, ''],
                    _level: lvl, _calcStartTs: startTs, _calcPlanTs: planTs };
        o['_origT' + lvl] = name;
        if (disc) o._담당구분 = disc;
        return o;
    }
    const tToday = new Date(today + 'T00:00:00').getTime();
    function savedProject(meta, rows) {
        return JSON.stringify({
            globalData: [{ data: ['NO', 'LEVEL(WBS)', '시작', '완료', '소요일', '상태', '개발업무 (WBS)', '업무 상세내용', '현황'] }].concat(rows),
            colIdx: { no: 0, bogo: 1, start: 2, plan: 3, period: 4, status: 5, wbs: 6, content: 7, chart: 8 },
            projectMeta: meta,
            tabData: { projectMembers3: [] },
            changeLogs: []
        });
    }

    // ⚠️⚠️ 핵심 함정: **담당자는 프로젝트마다 다르다.** 아래 두 파일에서 같은 역할(PM/HW)이
    //    서로 다른 사람을 가리킨다 — 다른 프로젝트를 훑으면서 지금 열린 프로젝트의 meta 를
    //    쓰면 이 시험이 깨진다(그게 바로 조용한 오답이다).
    nas['개발3팀/B_PROJECT.json'] = savedProject(
        { 프로젝트담당자: '최종석', HW담당자: '박용훈' },           // 여기선 내가 HW 담당이다
        [savedRow(3, 'B-내 HW 업무', '[핵심내용]B 프로젝트 HW\n[출처]x', tToday, tToday, 'HW'),
         savedRow(3, 'B-남의 PM 업무', '[핵심내용]B 프로젝트 PM\n[출처]y', tToday, tToday, 'PM'),
         savedRow(3, 'B-지난 업무', '[핵심내용]옛것\n[출처]z', tToday - 86400000 * 9, tToday - 86400000 * 8, 'HW')]);
    nas['개발3팀/C_DONE.json'] = savedProject({ 프로젝트담당자: '박용훈' },
        [savedRow(3, 'C-끝난 프로젝트 업무', '[핵심내용]안 나와야 한다\n[출처]q', tToday, tToday, 'PM')]);
    nas['개발9팀/D_OTHERTEAM.json'] = savedProject({ 프로젝트담당자: '박용훈' },
        [savedRow(3, 'D-남의 팀 업무', '[핵심내용]안 나와야 한다\n[출처]q', tToday, tToday, 'PM')]);
    // 🙋 내가 **어디에도 안 든** 프로젝트 — 읽기는 하지만 후보로는 한 건도 안 담아야 한다.
    //    (안 거르면 실측에서 후보 170건 중 154건이 남의 일이었다.)
    nas['개발3팀/F_NOTMINE.json'] = savedProject({ 프로젝트담당자: '최종석', HW담당자: '조익현' },
        [savedRow(3, 'F-남의 프로젝트 업무', '[핵심내용]안 나와야 한다\n[출처]q', tToday, tToday, 'PM'),
         savedRow(3, 'F-남의 프로젝트 HW', '[핵심내용]안 나와야 한다\n[출처]q', tToday, tToday, 'HW')]);

    nas['App_Config/project_index.json'] = JSON.stringify({ projects: [
        { file_name: 'A_OPEN.json',      team: '개발3팀', assignee: '박용훈', completed: false, updated_at: '1' },
        { file_name: 'B_PROJECT.json',   team: '개발3팀', assignee: '최종석', completed: false, updated_at: '1' },
        { file_name: 'C_DONE.json',      team: '개발3팀', assignee: '박용훈', completed: true,  updated_at: '1' },
        { file_name: 'D_OTHERTEAM.json', team: '개발9팀', assignee: '박용훈', completed: false, updated_at: '1' },
        { file_name: 'E_MISSING.json',   team: '개발3팀', assignee: '박용훈', completed: false, updated_at: '1' },
        { file_name: 'F_NOTMINE.json',   team: '개발3팀', assignee: '최종석', completed: false, updated_at: '1' }
    ] });

    // 읽기 횟수를 센다 — 캐시가 정말 먹는지 보려면 숫자가 필요하다.
    let reads = 0;
    const scanGet = win.nasAppFile.get;
    win.nasAppFile.get = async function (rel, opts) { if (/^개발/.test(rel)) reads++; return scanGet(rel, opts); };

    win.currentDriveFileName = 'A_OPEN.json';     // 지금 열린 프로젝트
    const sc = await win.dailyScanOtherProjects(today);

    ok('열린 프로젝트·끝난 것·남의 팀은 후보에서 빠진다', sc.total === 3,
        'total=' + sc.total + ' (B_PROJECT·E_MISSING·F_NOTMINE 셋만 남아야 한다)');
    const gotNames = sc.mine.concat(sc.others).map((x) => x.name);
    ok('끝난 프로젝트는 안 본다', !gotNames.some((n) => n.indexOf('C-') === 0), gotNames.join(','));
    ok('남의 팀 프로젝트는 안 본다', !gotNames.some((n) => n.indexOf('D-') === 0), gotNames.join(','));
    ok('오늘 걸린 것만 가져온다', !gotNames.some((n) => n.indexOf('B-지난') === 0), gotNames.join(','));
    ok('그 프로젝트의 meta 로 내 일을 가린다 — HW담당자가 나다',
        sc.mine.length === 1 && sc.mine[0].name === 'B-내 HW 업무',
        'mine=' + JSON.stringify(sc.mine.map((x) => x.name)));
    ok('그 프로젝트의 PM 은 남이다(열린 프로젝트 meta 를 쓰면 여기서 깨진다)',
        sc.others.some((x) => x.name === 'B-남의 PM 업무'),
        'others=' + JSON.stringify(sc.others.map((x) => x.name)));
    ok('어느 프로젝트 것인지 싣는다', sc.mine[0].project === 'B_PROJECT', sc.mine[0].project);
    ok('[핵심내용]도 같이 온다', (sc.mine[0].core || '').indexOf('B 프로젝트') === 0, sc.mine[0].core);
    // ⚠️ 못 읽은 것은 **삼키지 않는다** — 조용히 빠지면 "그 프로젝트엔 원래 일이 없다"와 구분이 안 된다.
    ok('못 읽은 프로젝트를 드러낸다', sc.errs.length === 1 && /E_MISSING/.test(sc.errs[0]), JSON.stringify(sc.errs));
    // 🙋 내가 안 든 프로젝트는 **한 건도** 안 담는다 — 색인 담당자도 나가 아니고 meta 에도 없다.
    ok('내가 안 든 프로젝트 업무는 안 담는다', !gotNames.some((n) => n.indexOf('F-') === 0), gotNames.join(','));
    ok('내가 든 프로젝트만 센다', sc.kept === 1, 'kept=' + sc.kept + ' (B_PROJECT 하나)');

    // ⚠️ 두 번째 훑기는 **force** 로 부른다 — 안 그러면 "이미 끝났다" 로 바로 돌아와
    //    캐시가 아니라 **그 지름길**을 시험하게 된다(가짜 통과).
    const after1 = reads;
    await win.dailyScanOtherProjects(today, true);
    // 캐시된 B 는 안 읽고, **못 읽었던 E 는 다시 시도한다**(실패를 캐시하면 고쳐 둬도 영영 안 돌아온다).
    ok('안 바뀐 프로젝트는 다시 안 읽는다 — 실패한 것만 다시 시도', reads === after1 + 1,
        '읽기 ' + after1 + ' → ' + reads + ' (E_MISSING 재시도 1건만 늘어야 한다. ' +
        '내가 안 든 F 도 "건너뜀" 으로 캐시돼 다시 안 읽어야 한다)');

    nas['App_Config/project_index.json'] = JSON.stringify({ projects: [
        { file_name: 'A_OPEN.json',    team: '개발3팀', assignee: '박용훈', completed: false, updated_at: '1' },
        { file_name: 'B_PROJECT.json', team: '개발3팀', assignee: '최종석', completed: false, updated_at: '2' }
    ] });
    const after2 = reads;
    await win.dailyScanOtherProjects(today, true);
    ok('updated_at 이 바뀌면 그 프로젝트를 다시 읽는다', reads === after2 + 1,
        '읽기 ' + after2 + ' → ' + reads + ' (B_PROJECT 한 건)');
    win.nasAppFile.get = realGet;

    // ══ 9. 보고 지우기 — 항목을 전부 빼고 저장 ════════════════════════════════
    console.log('\n■ 보고 지우기 (빈 덮어쓰기 가드는 그대로)');

    const rmdate = '2026-09-17';
    const rmrel = win.DAILY_PATHS.file(rmdate, 'yhpark');
    function seedReport() {
        nas[rmrel] = JSON.stringify({ date: rmdate, key: 'yhpark', name: '박용훈', team: '개발3팀',
            dayType: 'work', items: [{ name: 'A 업무', note: '했다' }, { name: 'B 업무', next: '할 것' }],
            files: [], next: '', issue: '', rev: 3, savedAt: '2026-09-17T08:00:00.000Z' });
        try { global.localStorage.removeItem(win.DAILY_POLICY.draftKey); } catch (e) { /* 없으면 그만 */ }
    }

    // ⚠️ 가드는 남아 있어야 한다 — 사람이 비우지 않았는데 빈 것이 써지는 길(낡은 초안·배경 경로)은
    //    2026-11-04 색인 유실과 같은 모양이다.
    seedReport();
    let rmBlocked = '';
    try {
        await win.dailySave({ date: rmdate, key: 'yhpark', dayType: 'work', items: [], files: [],
                              next: '', issue: '', rev: 3 });
    } catch (e) { rmBlocked = e.message; }
    ok('사람이 비우지 않은 빈 저장은 여전히 막는다', !!rmBlocked && rmrel in nas, rmBlocked || '(안 막혔다)');
    // 🗑 [2026-11-09 신고] 옛 안내는 "지우려면 항목을 하나씩 지워주세요" 였는데, 하나씩 지운
    //    **마지막 상태**가 바로 막히는 그 상태라 빠져나갈 길이 없었다.
    ok('막다른 안내("하나씩 지워주세요")를 쓰지 않는다', rmBlocked.indexOf('하나씩') === -1, rmBlocked);

    // 사람이 이 창에서 항목을 전부 빼고 저장하면 → 파일이 사라진다(빈 껍데기를 남기지 않는다).
    seedReport();
    await win.dailyOpenModal(rmdate);
    win._dailyDropItem(0);
    win._dailyDropItem(0);
    await win._dailySave();
    ok('사람이 비우고 저장하면 파일이 지워진다', !(rmrel in nas) && deleted.indexOf(rmrel) >= 0,
        'nas=' + (rmrel in nas) + ' deleted=' + JSON.stringify(deleted.slice(-1)));

    // ↩ 되돌리기 — 지운 그대로 되살아난다(이 창을 닫기 전까지).
    await win.dailyUndoDelete();
    const back = nas[rmrel] ? JSON.parse(nas[rmrel]) : null;
    ok('되돌리면 업무가 그대로 돌아온다',
        !!back && back.items.length === 2 && back.items[0].name === 'A 업무' && back.items[0].note === '했다',
        back ? JSON.stringify(back.items.map((x) => x.name)) : '(없음)');

    // 🏖 휴가처럼 "보고할 일이 없는 날"은 원래부터 빈 채로 저장된다 — 지우기가 아니다.
    seedReport();
    await win.dailyOpenModal(rmdate);
    win._dailyDropItem(0);
    win._dailyDropItem(0);
    win._dailySetType('leave');
    await win._dailySave();
    const lv = nas[rmrel] ? JSON.parse(nas[rmrel]) : null;
    ok('휴가는 빈 채로 저장되고 파일은 남는다', !!lv && lv.dayType === 'leave' && (lv.items || []).length === 0,
        lv ? lv.dayType : '(파일이 지워졌다)');
    delete nas[rmrel];

    // ══════════════════════════════════════════════════════════════════════
    console.log('\n■ 📌 업무 연속성 — 이월 알림(A) (2026-11-11)');
    // ══════════════════════════════════════════════════════════════════════
    // ⚠️ B(직접 추가가 간트에 없으면 배지)는 `_dailyAddManual` 이 DOM 입력칸(`#daily-manual`)을
    //    직접 읽어서 이 document 스텁(getElementById → null)으론 못 돈다 — 화면에서 확인할 것.
    {
        const cToday = '2030-03-12';
        const cPrev = '2030-03-10';          // 주말을 건너뛴 "가장 최근 작성일" 흉내
        nas[win.DAILY_PATHS.file(cPrev, 'yhpark')] = JSON.stringify({
            date: cPrev, key: 'yhpark', items: [
                { name: 'A 업무', project: 'LNW_STELLAR32_32.0', cat: 'PM', note: '했다', next: '검토 요청', issue: '' },
                { name: 'B 업무', project: 'LNW_STELLAR32_32.0', cat: 'PM', note: '했다', next: '', issue: '' }
            ], files: [], rev: 1
        });
        localStorage.removeItem(win.DAILY_POLICY.draftKey);
        await win.dailyOpenModal(cToday);
        win._dailyResetScans();                       // 열 때 미리 쏜 백그라운드 조회를 버리고
        await win._dailyEnsureCarryOver(cToday);       // 이번엔 직접 기다린다

        ok('주말 등으로 "어제" 가 비어도 가장 최근 작성일을 찾는다 — 해야 할 일 있는 것만',
            win._dailyCarryRaw.length === 1 && win._dailyCarryRaw[0].name === 'A 업무',
            JSON.stringify(win._dailyCarryRaw));

        win._dailyAddCarryOver(0);
        ok('클릭해 담으면 이월 후보에서 빠진다(다시 안 뜬다)',
            win._dailyPendingCarryOver().length === 0, JSON.stringify(win._dailyPendingCarryOver()));

        const draft1 = JSON.parse(localStorage.getItem(win.DAILY_POLICY.draftKey));
        ok('담긴 항목 — carriedOver 표시 + "해야 할 일" 이 오늘 메모로 들어간다',
            draft1.doc.items.some((it) => it.name === 'A 업무' && it.note === '검토 요청' && it.carriedOver === true),
            JSON.stringify(draft1.doc.items));

        const lenBefore = draft1.doc.items.length;
        win._dailyAddCarryOver(0);     // pend 가 이미 비었으니 인덱스 0 은 없는 항목
        const draft2 = JSON.parse(localStorage.getItem(win.DAILY_POLICY.draftKey));
        ok('이미 담은 건 다시 안 담긴다(중복 방지)', draft2.doc.items.length === lenBefore, JSON.stringify(draft2.doc.items));

        delete nas[win.DAILY_PATHS.file(cPrev, 'yhpark')];
    }
    {
        // 최근 7일에 내 보고가 하나도 없으면 — 추측하지 않고 빈 채로 둔다.
        const cToday2 = '2030-06-01';
        localStorage.removeItem(win.DAILY_POLICY.draftKey);
        await win.dailyOpenModal(cToday2);
        win._dailyResetScans();
        await win._dailyEnsureCarryOver(cToday2);
        ok('최근 7일에 내 보고가 하나도 없으면 빈 채로 둔다', win._dailyCarryRaw.length === 0, JSON.stringify(win._dailyCarryRaw));
    }

    console.log('\n' + (fail === 0 ? '✅ ' : '⛔ ') + pass + '/' + (pass + fail) + ' 통과');
    console.log('⚠️ 화면(모달·탭)은 이 하네스가 보지 않는다 — 브라우저에서 따로 확인할 것.');
    process.exit(fail ? 1 : 0);
})();
