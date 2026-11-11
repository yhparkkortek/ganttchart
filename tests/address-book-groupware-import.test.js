/* ============================================================================
   🏢 importAddressFromGroupware (js/22f) — 순수 로직 하네스 (2026-11-11)

       node tests/address-book-groupware-import.test.js

   ⚠️ 가짜는 **바깥 경계에만** — `confirm`/`alert`/`fetch`/`_gwEnsureLogin`/`AddressBook.save`·
      `loadFromDrive`. 검사 대상은 js/22f 의 **진짜 함수**(`importAddressFromGroupware`).
   - 병합: 그룹웨어 값(부서·직함·이메일·휴대폰·근무처전화)은 새로 채우고, 그룹웨어엔 없는
     사람이 직접 적은 값(영문 이름·텔레그램 ID)은 유지한다.
   - 그룹웨어 조회가 실패하면 공유 저장소(NAS, `AddressBook.loadFromDrive`)로 폴백한다 — 새
     경로를 안 만들고 **이미 다른 화면들도 쓰는 그 함수**를 그대로 부른다.
   - 성공하면 `AddressBook.save()`를 불러 공유 저장소에도 반영한다("불러오면 자동으로 NAS에
     저장" 요청).
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const win = {};
global.window = win;
global.document = {
    getElementById() { return null; },
    querySelectorAll() { return []; }
};
win.document = global.document;
win._currentLang = 'ko';
win._t = (ko) => ko;

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d !== undefined ? '  — ' + JSON.stringify(d) : '')); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'js', '22f-address-book.js'), 'utf8');
new Function('window', src)(win);

// `window.AddressBook` 은 js/22f 가 방금 정의한 **진짜 객체**다 — 그 안의 Drive API 호출
// (save/loadFromDrive)만 경계로 바꿔 끼운다(통째로 객체를 새로 만들면 다음에 또 바뀔 수 있는
// 실제 모양을 안 쓰고 가짜 계약을 시험하게 된다).
let savedWith = null;
win.AddressBook.save = function (list) { savedWith = list; };
win.AddressBook.loadFromDrive = async function () { return win.__nasFallbackList; };
win.__nasFallbackList = [{ name: '김나스', dept: 'NAS전용', title: '', email: '', mobile: '', phone: '', nameEn: '', telegramId: '' }];

global.confirm = () => true;
let lastAlert = '';
global.alert = (m) => { lastAlert = m; };

async function run(fetchImpl, gwLoginImpl) {
    global.fetch = fetchImpl;
    win._gwEnsureLogin = gwLoginImpl;
    savedWith = null; lastAlert = '';
    await win.importAddressFromGroupware();
}

function jsonRes(body) { return Promise.resolve({ ok: true, status: 200, json: async () => body }); }

(async () => {
    console.log('\n■ 병합 — 그룹웨어 값은 새로, 영문 이름·텔레그램 ID는 유지');
    win.tabData = { addressBook: [
        { name: '박용훈', nameEn: 'Park Yonghoon', dept: '옛부서', title: '옛직함', email: 'old@x.com', mobile: '000', phone: '000', telegramId: '12345' },
        { name: '외부협력사', nameEn: '', dept: '협력사', title: '대표', email: 'ext@partner.com', mobile: '999', phone: '', telegramId: '' }
    ] };
    await run(
        () => jsonRes({ ok: true, contacts: [
            { name: '박용훈', dept: 'HW팀', position: '책임', email: 'new@kortek.co.kr', mobile: '010-1111-2222', tel: '031-000-0000' },
            { name: '신입사원', dept: 'FW팀', position: '사원', email: 'new2@kortek.co.kr', mobile: '010-3333-4444', tel: '' }
        ] }),
        async () => ({ ok: true })
    );
    const byName = Object.fromEntries(win.tabData.addressBook.map((p) => [p.name, p]));
    ok('박용훈 부서/직함/이메일이 그룹웨어 값으로 갱신됐다', byName['박용훈'].dept === 'HW팀' && byName['박용훈'].title === '책임' && byName['박용훈'].email === 'new@kortek.co.kr', byName['박용훈']);
    ok('박용훈 영문 이름은 유지된다(그룹웨어엔 없다)', byName['박용훈'].nameEn === 'Park Yonghoon', byName['박용훈']);
    ok('박용훈 텔레그램 ID도 유지된다', byName['박용훈'].telegramId === '12345', byName['박용훈']);
    ok('그룹웨어에만 있던 신입사원이 추가됐다', !!byName['신입사원'] && byName['신입사원'].dept === 'FW팀', byName['신입사원']);
    ok('그룹웨어 검색에 없던 외부협력사는 안 지워진다', !!byName['외부협력사'] && byName['외부협력사'].dept === '협력사', byName['외부협력사']);
    ok('AddressBook.save() 가 병합 결과로 불렸다(공유 저장소 자동 반영)', savedWith && savedWith.length === win.tabData.addressBook.length, savedWith);

    console.log('\n■ 그룹웨어 로그인 실패 — NAS 공유 주소록으로 폴백, save()는 안 부른다');
    win.tabData = { addressBook: [{ name: '아무개', dept: '', title: '', email: '', mobile: '', phone: '', nameEn: '', telegramId: '' }] };
    await run(
        () => { throw new Error('호출되면 안 된다'); },
        async () => ({ ok: false, message: '그룹웨어 로그인 실패(테스트)' })
    );
    ok('NAS 폴백 목록으로 교체됐다', win.tabData.addressBook.length === 1 && win.tabData.addressBook[0].name === '김나스', win.tabData.addressBook);
    ok('실패했다고 안내한다', /그룹웨어/.test(lastAlert) || /groupware/i.test(lastAlert), lastAlert);
    ok('AddressBook.save() 는 안 불린다(그룹웨어 실패 시 되쓰지 않는다)', savedWith === null, savedWith);

    console.log('\n■ 그룹웨어 조회 자체가 빈 결과(0명)를 주면 — 역시 NAS 폴백(빈 값으로 전체 교체하지 않는다)');
    win.tabData = { addressBook: [{ name: '아무개2', dept: '', title: '', email: '', mobile: '', phone: '', nameEn: '', telegramId: '' }] };
    await run(
        () => jsonRes({ ok: true, contacts: [] }),
        async () => ({ ok: true })
    );
    ok('0명 응답이면 그걸로 교체하지 않고 NAS 폴백을 쓴다', win.tabData.addressBook[0] && win.tabData.addressBook[0].name === '김나스', win.tabData.addressBook);

    console.log('\n' + (fail ? ('❌ ' + fail + '건 실패, ') : '✅ ') + pass + '/' + (pass + fail) + ' 통과');
    process.exit(fail ? 1 : 0);
})();
