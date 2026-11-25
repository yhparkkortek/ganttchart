// 🔔 알람 수신자 해석 — 메일 분석이 적은 [발신자→수신자] 이름이 이메일 주소로 바뀌는 길 (2026-11-25)
//
// 돌리기: node tests/alarm-recipient-resolve.test.js
//
// 진짜 소스를 잘라 돌린다(사본 없음):
//   js/22b  ADDR_KO_TITLE_WORDS ~ _addrFindByName, _addrResolveRecipient
//   js/22a  _isAlarmDomainAllowed
//   js/22c  collectAlarmItems (화면 표 #table-body tr 만 가짜)
// 가짜는 경계에만: document.querySelectorAll·localStorage·loadAlarmSettings·collectTabData.
// 발송(fetch)은 이 함수가 하지 않는다 — 여기선 "누구에게 보내기로 계산하는가" 만 본다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function slice(text, startMark, endMark) {
    const a = text.indexOf(startMark);
    if (a < 0) throw new Error('시작 표식 없음: ' + startMark);
    const b = text.indexOf(endMark, a + startMark.length);
    if (b < 0) throw new Error('끝 표식 없음: ' + endMark);
    return text.slice(a, b);
}

// ── 가짜 경계 ──
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let fakeRows = [];
global.document = { querySelectorAll: sel => (sel === '#table-body tr' ? fakeRows : []), getElementById: () => null };
global.window = global;
window.KORTEK_INTERNAL_DOMAIN = 'kortek.co.kr';
window.loadAlarmSettings = () => ({ allowedExternalDomains: [], ccList: [] });
window.collectTabData = () => {};
window.formatTsToYMD = ts => new Date(ts).toISOString().slice(0, 10);
global.formatTsToYMD = window.formatTsToYMD;

const s22b = src('js/22b-summary-mctable-core1.js');
const s22a = src('js/22a-summary-mctable-parse.js');
const s22c = src('js/22c-summary-mctable-core2.js');
eval(slice(s22b, 'const ADDR_KO_TITLE_WORDS', '// 💡 Summary 프로젝트 멤버'));
eval(slice(s22b, 'window._normalizeRecipRow = function', '// ② Summary 프로젝트 멤버'));
eval(slice(s22a, 'window._isAlarmDomainAllowed = function', '// 외부 도메인 체크박스'));
global.ALARM_DAYS = [7, 3, 1];
eval(slice(s22c, 'window.collectAlarmItems = function', '// 💡 [2026-08-30 신규] 알람 목록 행 클릭'));

// ── 합성 주소록(실제 사람 아님) ──
window.tabData = { addressBook: [
    { name: '김민수', nameEn: 'Minsu Kim',  email: 'minsu.kim@kortek.co.kr',  telegramId: '111', dept: '개발1팀' },
    { name: '김민수', nameEn: 'Minsu Kim2', email: 'kim.minsu@kortek.co.kr',  telegramId: '222', dept: '영업팀' },   // 동명이인
    { name: '박지훈', nameEn: 'Andy',       email: 'andy.park@kortek.co.kr',  telegramId: '333', dept: '개발3팀' },
    { name: '이서연', nameEn: 'Seoyeon Lee', email: 'sy.lee@kortek.co.kr',    telegramId: '444', dept: '개발3팀' },
    { name: '이서연', nameEn: 'Seoyeon Lee', email: 'SY.LEE@kortek.co.kr',    telegramId: '444', dept: '개발3팀' }, // 같은 사람 두 줄(중복 등록) — 모호 아님
    { name: '최유나', nameEn: 'Yuna Choi',  email: '',                        telegramId: '555', dept: '개발3팀' },   // 이메일 없음
    { name: '정다은', nameEn: 'Ada',   email: 'ada@kortek.co.kr',        telegramId: '666', dept: '개발2팀' },
] };
window.colIdx = { plan: 1, content: 2, status: 3, wbs: 0, assignee: -1 };
const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
function setRows(contents) {
    const gd = [['헤더']];
    fakeRows = [];
    contents.forEach((c, i) => {
        const row = ['업무' + (i + 1), due, c, '진행'];
        row._알림 = true; row._level = 3; row._origT3 = '업무' + (i + 1);
        gd.push(row);
        fakeRows.push({ dataset: { rowIndex: String(i + 1) }, querySelectorAll: () => [] });
    });
    window.globalData = gd;
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
const run = contents => { setRows(contents); return window.collectAlarmItems(); };

// 1) 동명이인 — 첫 번째 사람에게 말없이 가면 안 된다
{
    const [it] = run(['[검토요청][이서연→김민수] 2026-11-20\n[핵심내용]…']);
    ok(!it.toEmail.includes('minsu.kim@') && !it.toEmail.includes('kim.minsu@'), '동명이인 김민수: 어느 쪽에도 메일이 가지 않는다 (toEmail=' + it.toEmail + ')');
    ok(it.toEmail === 'sy.lee@kortek.co.kr', '모호하지 않은 이서연(같은 사람 두 줄)은 그대로 받는다');
    ok((it.excludedPeople || []).some(x => x.name === '김민수' && x.reason === 'ambiguous'), '제외 사유가 남는다(ambiguous)');
    ok(!(it.allowedPeople || []).includes('김민수'), '동명이인은 텔레그램 대상에서도 빠진다');
}
// 2) 이름 자리에 이메일 — 주소록에 없는 주소는 그대로 보내지 않는다
{
    const [it] = run(['[자료제공][fake.person@kortek.co.kr→이서연] 2026-11-20']);
    ok(!it.toEmail.includes('fake.person@'), '주소록에 없는 사내 주소는 발송 제외 (toEmail=' + it.toEmail + ')');
    ok((it.excludedPeople || []).some(x => x.reason === 'email-not-in-book'), '사유: email-not-in-book');
    const [it2] = run(['[자료제공][ANDY.PARK@kortek.co.kr→이서연] 2026-11-20']);
    ok(it2.toEmail.split(',').includes('andy.park@kortek.co.kr'), '주소록에 있는 주소는 (대소문자 달라도) 주소록 값으로 받는다 (toEmail=' + it2.toEmail + ')');
}
// 3) 영문 직함 떼기가 이름 글자를 먹지 않는다 — "Adams" 가 "Ada" 가 되어 정다은에게 가면 안 된다
{
    const [it] = run(['[회의안내][Adams→이서연] 2026-11-20']);
    ok(!it.toEmail.includes('ada@'), '"Adams" → "Ada"(정다은)로 새지 않는다 (toEmail=' + it.toEmail + ')');
    ok(window._addrStripTitleSuffix('Drew') === 'Drew', '"Drew" 는 그대로 (Dr 직함 아님)');
    ok(window._addrStripTitleSuffix('Mr. Kim') === 'Kim', '"Mr. Kim" → "Kim"');
    ok(window._addrStripTitleSuffix('Minsu Kim, Manager') === 'Minsu Kim', '"…, Manager" 꼬리 직함은 뗀다');
    ok(window._addrStripTitleSuffix('윤재권 팀장님') === '윤재권', '한글 직함·존칭은 예전대로');
}
// 4) 정상 경로는 그대로
{
    const [it] = run(['[검토요청][박지훈 책임→이서연, 최유나] 2026-11-20']);
    ok(it.toEmail.split(',').sort().join(',') === 'andy.park@kortek.co.kr,sy.lee@kortek.co.kr', '직함 뗀 이름·여러 수신인 정상 (toEmail=' + it.toEmail + ')');
    ok(it.missingPeople.includes('최유나'), '이메일 없는 사람은 예전처럼 미등록');
    ok(it.allowedPeople.includes('최유나'), '이메일 없는 사람은 텔레그램 대상엔 남는다');
    ok(!(it.excludedPeople || []).length, '정상 건엔 제외 사유가 없다');
}
// 5) 주소록에 없는 외부인 — 예전처럼 미등록(누구에게도 안 감)
{
    const [it] = run(['[샘플발송][Taylor Kim→Morgan Lee] 2026-11-20']);
    ok(it.toEmail === '', '외부인 이름만 있으면 업무 수신 주소 없음');
    ok(it.missingPeople.length === 2, '둘 다 미등록으로 드러난다');
}
// 5-2) 외부 도메인 게이트 — 발신인이 여럿일 때 합친 글자의 "마지막 도메인"만 보던 버그
{
    window.tabData.addressBook.push({ name: '외부인', nameEn: 'Outsider', email: 'out@customer.com', telegramId: '' });
    const [it] = run(['[검토요청][외부인/이서연→박지훈] 2026-11-20']);
    ok(!it.toEmail.includes('out@customer.com'), '허용 안 된 외부 주소는 사내 주소와 함께 있어도 빠진다 (toEmail=' + it.toEmail + ')');
    ok(it.blockedByDomain.includes('out@customer.com'), '차단 배지에 외부 주소가 오른다');
    window.tabData.addressBook.pop();
}
// 6) 해석기 직접 — 공개 계약
{
    const r = window._addrResolveRecipient;
    ok(typeof r === 'function', '_addrResolveRecipient 가 있다');
    if (typeof r === 'function') {
        ok(r('김민수').reason === 'ambiguous' && !r('김민수').email, 'r(김민수) ambiguous');
        ok(r('Andy').reason === 'ok' && r('Andy').email === 'andy.park@kortek.co.kr', 'r(Andy) ok');
        ok(r('최유나').reason === 'no-email', 'r(최유나) no-email');
        ok(r('홍길동').reason === 'none', 'r(홍길동) none');
        ok(r('nobody@kortek.co.kr').reason === 'email-not-in-book', 'r(주소록에 없는 주소)');
    }
}

// 7) 진짜 checkAndSendAlarms — 업무 수신자를 못 찾으면 프로젝트 전원에게 대신 보내지 않는다(2026-11-25 사용자 결정)
//    가짜는 fetch 하나(/health 는 ok, /send-mail 은 기록만 — 실제로 나가지 않는다)
(async function () {
    eval(slice(s22a, 'const MAIL_SERVER', '// 💡 [멀티시트]'));
    const sent = [];
    global.fetch = async (url, opt) => {
        if (/\/health$/.test(url)) return { json: async () => ({ ok: true }) };
        if (/\/send-mail$/.test(url)) { sent.push(JSON.parse(opt.body).to); return { json: async () => ({ ok: true }) }; }
        throw new Error('예상 못 한 요청 ' + url);
    };
    let alertMsg = '';
    window.bmAlertModal = m => { alertMsg = m; };
    window.projectMeta = { 프로젝트담당자이메일: 'pm.all@kortek.co.kr', HW담당자이메일: 'hw.all@kortek.co.kr' };
    setRows(['[샘플발송][Taylor Kim→Morgan Lee] 2026-11-20', '[검토요청][이서연→김민수] 2026-11-20']);
    Object.keys(store).forEach(k => delete store[k]);
    await window.checkAndSendAlarms(true);
    ok(!sent.some(t => /pm\.all|hw\.all/.test(t)), '수신자 못 찾은 업무가 프로젝트 전원에게 가지 않는다 (sent=' + JSON.stringify(sent) + ')');
    ok(sent.length === 1 && sent[0] === 'sy.lee@kortek.co.kr', '수신자 있는 업무만 발송');
    ok(/찾지 못한 1건/.test(alertMsg), '건너뛴 건수를 알린다 (' + alertMsg.replace(/\n/g, ' ') + ')');
    ok(!Object.keys(store).some(k => /_1_.*d$/.test(k)), '건너뛴 업무는 발송 기록을 안 남긴다(고치면 다음 체크에 나간다)');
    window.projectMeta = {};
    sent.length = 0;
    Object.keys(store).forEach(k => delete store[k]);
    await window.checkAndSendAlarms(true);
    ok(sent.length === 1, 'Summary 담당자 이메일이 비어도 업무 수신자가 있으면 보낸다 (sent=' + sent.length + ')');

    console.log((fail ? '❌' : '✅') + ' 알람 수신자 해석 ' + pass + '/' + (pass + fail));
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('❌ 예외', e); process.exit(1); });
