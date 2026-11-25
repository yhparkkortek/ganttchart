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
// 앱 전역(js/04j) — 한/영 고르기. 22a·22c 의 안내 문구가 이걸 부른다(2026-11-25)
window._currentLang = 'ko';
window._t = function (ko, en) { return window._currentLang === 'en' ? en : ko; };
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
        const mailRaw = (c && typeof c === 'object') ? c.mailRaw : null;
        if (c && typeof c === 'object') c = c.c;
        const row = ['업무' + (i + 1), due, c, '진행'];
        row._알림 = true; row._level = 3; row._origT3 = '업무' + (i + 1);
        if (mailRaw) row._mailRaw = mailRaw;
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
// 5-3) 📨 메일 헤더 대조 — 메일에서 온 업무는 원본 메일의 보낸사람·받는사람·참조 주소만 받는다
{
    // 고객사 Andy 가 보낸 메일 — AI 는 "Andy" 라고 적었고, 주소록의 사내 Andy(박지훈)로 풀린다
    const mr = { sender: 'Andy Lee <andy@customer.com>', to: '"Lee, Seoyeon" <SY.LEE@kortek.co.kr>', cc: '' };
    const [it] = run([{ c: '[샘플요청][Andy→이서연] 2026-11-20', mailRaw: mr }]);
    ok(!it.toEmail.includes('andy.park@'), '헤더에 없는 사내 Andy 에게 안 간다 (toEmail=' + it.toEmail + ')');
    ok(it.toEmail === 'sy.lee@kortek.co.kr', '헤더에 있는 사람(대소문자·표시이름 무관)은 받는다');
    ok((it.excludedPeople || []).some(x => x.name === 'Andy' && x.reason === 'not-in-mail-headers'), '사유: not-in-mail-headers');
    ok(!it.allowedPeople.includes('Andy'), '헤더에 없으면 텔레그램도 안 간다');
    // 헤더가 없는 업무(직접 입력·붙여넣기)는 예전 규칙 그대로
    const [it2] = run(['[샘플요청][Andy→이서연] 2026-11-20']);
    ok(it2.toEmail.split(',').includes('andy.park@kortek.co.kr'), '헤더 없는 업무는 주소록 규칙만 (toEmail=' + it2.toEmail + ')');
    const [it3] = run([{ c: '[샘플요청][Andy→이서연] 2026-11-20', mailRaw: { sender: '', to: '', cc: '', body2000: '...' } }]);
    ok(it3.toEmail.split(',').includes('andy.park@kortek.co.kr'), '헤더 글자가 비어 있으면 대조하지 않는다');
    // 이메일 없는 사람은 헤더로 확인할 길이 없다 → 제외
    const [it4] = run([{ c: '[검토요청][이서연→최유나] 2026-11-20', mailRaw: { sender: 'sy.lee@kortek.co.kr', to: 'team@kortek.co.kr' } }]);
    ok(!it4.allowedPeople.includes('최유나') && it4.excludedPeople.some(x => x.name === '최유나'), '이메일 없는 사람은 헤더 대조 불가 → 제외');
    ok(window._mailHeaderAddrs({ to: ['a@x.com', 'B@Y.co.kr'] }).join(',') === 'a@x.com,b@y.co.kr', '배열 헤더도 읽는다');
    // 🏢 같은 사람이 회사 + 개인(gmail) 주소로 두 줄 — 사내 주소 하나면 그 사람 (실측: 실제 주소록 1명)
    window.tabData.addressBook.push({ name: '박지훈', email: 'jh.personal@gmail.com' });
    ok(window._addrResolveRecipient('박지훈').email === 'andy.park@kortek.co.kr', '회사+개인 두 줄 → 회사 주소');
    const [d1] = run([{ c: '[문의][박지훈→이서연] 2026-11-20', mailRaw: { sender: 'jh.personal@gmail.com', to: 'sy.lee@kortek.co.kr' } }]);
    ok(!d1.toEmail.includes('andy.park@') && d1.blockedByDomain.includes('jh.personal@gmail.com'), '헤더에 개인 주소만 있으면 회사 주소로 안 보낸다(개인 주소는 외부 도메인 차단) (toEmail=' + d1.toEmail + ', blocked=' + d1.blockedByDomain + ')');
    window.tabData.addressBook.pop();
    // 진짜 동명이인(사내 주소 둘) — 헤더에 한 사람만 있으면 그 사람
    const [d2] = run([{ c: '[문의][김민수→이서연] 2026-11-20', mailRaw: { sender: 'KIM.MINSU@kortek.co.kr', to: 'sy.lee@kortek.co.kr' } }]);
    ok(d2.toEmail.split(',').includes('kim.minsu@kortek.co.kr') && !d2.toEmail.includes('minsu.kim@'), '동명이인을 메일 헤더로 가린다 (toEmail=' + d2.toEmail + ')');
    const [d3] = run([{ c: '[문의][김민수→이서연] 2026-11-20', mailRaw: { sender: 'kim.minsu@kortek.co.kr,minsu.kim@kortek.co.kr', to: 'sy.lee@kortek.co.kr' } }]);
    ok(!d3.toEmail.includes('minsu') && d3.excludedPeople.some(x => x.name === '김민수' && x.reason === 'ambiguous'), '헤더에 둘 다 있으면 여전히 모호 → 제외');
    // 👥 그룹 주소로 온 메일 — 주소록에서 이름 = 부서인 행이 그룹, 같은 부서 사람은 받는다
    window.tabData.addressBook.push({ name: '개발3팀', dept: '개발3팀', email: 'dev3@kortek.co.kr' });
    const g = { sender: 'Cust <cust@customer.com>', to: '개발3팀 <DEV3@kortek.co.kr>' };
    const [g1] = run([{ c: '[문의][이서연→박지훈] 2026-11-20', mailRaw: g }]);
    ok(g1.toEmail.split(',').sort().join(',') === 'andy.park@kortek.co.kr,sy.lee@kortek.co.kr', '그룹 주소로 온 메일 — 그 팀원은 받는다 (toEmail=' + g1.toEmail + ')');
    const [g2] = run([{ c: '[문의][이서연→정다은] 2026-11-20', mailRaw: g }]);
    ok(!g2.toEmail.includes('ada@') && g2.excludedPeople.some(x => x.name === '정다은' && x.reason === 'not-in-mail-headers'), '다른 부서 사람은 그대로 제외 (toEmail=' + g2.toEmail + ')');
    const [g3] = run([{ c: '[문의][이서연→박지훈] 2026-11-20', mailRaw: { sender: 'cust@customer.com', to: 'list@kortek.co.kr' } }]);
    ok(g3.toEmail === '', '주소록에 없는 메일링 리스트는 펼치지 않는다 (toEmail=' + g3.toEmail + ')');
    window.tabData.addressBook.pop();
}
// 5-4) 🏷 이름 옆 부서·직함으로 동명이인 가리기
{
    const R = window._addrResolveRecipient;
    const ab = window.tabData.addressBook;
    ab[0].title = '팀장'; ab[1].title = '책임매니저';
    ok(R('김민수(영업팀)').email === 'kim.minsu@kortek.co.kr', '괄호 부서로 가린다');
    ok(R('김민수 (개발1팀)').email === 'minsu.kim@kortek.co.kr', '괄호 앞 띄어쓰기도');
    ok(R('김민수 팀장').email === 'minsu.kim@kortek.co.kr' && R('팀장 김민수님').email === 'minsu.kim@kortek.co.kr', '이름 앞뒤 직함으로 가린다');
    ok(R('김민수 책임').email === 'kim.minsu@kortek.co.kr', '직함 일부(책임 ⊂ 책임매니저)');
    ok(R('김민수(구매팀)').reason === 'qualifier-mismatch', '괄호 부서가 어느 쪽과도 안 맞으면 제외');
    ok(R('이서연(영업팀)').reason === 'qualifier-mismatch', '한 사람뿐이어도 괄호 부서가 틀리면 제외');
    ok(R('이서연(개발3팀)').email === 'sy.lee@kortek.co.kr', '한 사람 + 괄호 부서 맞음');
    ok(R('이서연 팀장').email === 'sy.lee@kortek.co.kr', '한 사람일 땐 이름 옆 직함은 안 따진다(예전 그대로)');
    ok(R('김민수(kim.minsu@kortek.co.kr)').email === 'kim.minsu@kortek.co.kr', '괄호 안 주소로도 가린다');
    const [q1] = run(['[문의][이서연→김민수 팀장] 2026-11-20']);
    ok(q1.toEmail.split(',').sort().join(',') === 'minsu.kim@kortek.co.kr,sy.lee@kortek.co.kr', '알람 수신자도 직함으로 가려진다 (toEmail=' + q1.toEmail + ')');
    const [q2] = run(['[문의][이서연→김민수(구매팀)] 2026-11-20']);
    ok(q2.excludedPeople.some(x => x.reason === 'qualifier-mismatch') && /구매팀/.test(window._addrResolveReasonText(q2.excludedPeople[0])), '안 맞는 부서는 사유와 함께 제외');
    delete ab[0].title; delete ab[1].title;
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
