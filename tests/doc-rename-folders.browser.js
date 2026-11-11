/* 🗂 _dsRenameProjectFolders (js/48) — 프로젝트 이름이 바뀌면 NAS 하위 폴더 4개를 같이 옮긴다
   (2026-11-11, "프로젝트명을 바꾸면 폴더명도 자동 변경되면 좋겠다" 요청)

   브라우저 콘솔에서:
     await __docRenameFoldersTest()

   가짜는 `window.fetch` 하나뿐 — `/doc/rename` 이 실제로 몇 번, 어떤 body 로 불리는지만 본다.
   NAS·백엔드 불필요. 진짜 앱이 열려 있어야 한다(js/48 이 로드돼 있어야 `_dsRenameProjectFolders`
   를 찾는다).
*/
window.__docRenameFoldersTest = async function () {
    const PASS = [], FAIL = [];
    function check(name, cond, detail) {
        (cond ? PASS : FAIL).push(name);
        console.log((cond ? '  ok   ' : '  FAIL ') + name + (!cond && detail ? '  — ' + JSON.stringify(detail) : ''));
    }

    if (typeof window._dsRenameProjectFolders !== 'function') {
        console.error('window._dsRenameProjectFolders 가 없다 — js/48 이 로드됐는지 확인할 것');
        return { pass: 0, fail: 1 };
    }

    const origFetch = window.fetch;
    const origBases = window.PROJECT_FOLDER_RENAME_BASES;

    function mockFetch(handler) {
        window.fetch = function (url, opts) {
            return Promise.resolve(handler(String(url), opts));
        };
    }
    function jsonRes(status, body) {
        return { ok: status >= 200 && status < 300, status: status, json: async () => body };
    }

    try {
        console.log('\n=== 1) 네 base 모두 정상 이동 ===');
        window.PROJECT_FOLDER_RENAME_BASES = ['CUSTOMER', 'SUMMARY', 'MC', 'DOCUMENT'];
        const calls = [];
        mockFetch((url, opts) => {
            calls.push({ url, body: JSON.parse(opts.body) });
            return jsonRes(200, { ok: true, from: 'x', to: 'y' });
        });
        const r1 = await window._dsRenameProjectFolders('LNW_27.0', 'LNW_OBSIDIAN27_DB_27.0');
        check('4번 호출', calls.length === 4, calls.length);
        check('전부 /doc/rename 으로', calls.every((c) => /\/doc\/rename$/.test(c.url)), calls.map((c) => c.url));
        check('CUSTOMER/LNW_27.0 → LNW_OBSIDIAN27_DB_27.0', calls.some((c) =>
            c.body.folder === 'CUSTOMER/LNW_27.0' && c.body.newName === 'LNW_OBSIDIAN27_DB_27.0'), calls);
        check('DOCUMENT 도 같이', calls.some((c) => c.body.folder === 'DOCUMENT/LNW_27.0'), calls);
        check('moved 에 4개 다', r1 && r1.moved.length === 4, r1);

        console.log('\n=== 2) 이름이 같으면 아예 안 부른다(옮길 게 없다) ===');
        const calls2 = [];
        mockFetch((url, opts) => { calls2.push(url); return jsonRes(200, { ok: true }); });
        await window._dsRenameProjectFolders('SAME', 'SAME');
        check('fetch 0회', calls2.length === 0, calls2.length);

        console.log('\n=== 3) 옛 폴더가 없던 base 는 skipped 로 — 오류로 보지 않는다 ===');
        mockFetch((url, opts) => {
            const b = JSON.parse(opts.body);
            if (b.folder.indexOf('DOCUMENT/') === 0) return jsonRes(200, { ok: true, skipped: 'source-missing', folder: b.folder });
            return jsonRes(200, { ok: true, from: 'x', to: 'y' });
        });
        const r3 = await window._dsRenameProjectFolders('A', 'B');
        check('skipped 에 DOCUMENT', r3.skipped.indexOf('DOCUMENT') !== -1, r3);
        check('moved 엔 나머지 3개', r3.moved.length === 3, r3);
        check('failed 는 0건(skip 은 실패가 아니다)', r3.failed.length === 0, r3);

        console.log('\n=== 4) 겹치면(409) collided 로 — 조용히 삼키지 않고 토스트까지 띄운다 ===');
        let toasted = null;
        const origToast = window.showToast;
        window.showToast = function (msg, kind) { toasted = { msg, kind }; };
        mockFetch((url, opts) => {
            const b = JSON.parse(opts.body);
            if (b.folder.indexOf('MC/') === 0) {
                return jsonRes(409, { ok: false, collision: true, error: '이미 그 이름의 폴더가 있어 덮어쓰지 않았습니다: B' });
            }
            return jsonRes(200, { ok: true, from: 'x', to: 'y' });
        });
        const r4 = await window._dsRenameProjectFolders('A', 'B');
        window.showToast = origToast;
        check('collided 에 MC', r4.collided.indexOf('MC') !== -1, r4);
        check('moved 엔 나머지 3개', r4.moved.length === 3, r4);
        check('failed 엔 안 들어간다(겹침은 실패와 다르다)', r4.failed.length === 0, r4);
        check('사람이 볼 토스트를 띄운다(조용히 넘기지 않는다)', !!toasted && toasted.kind === 'warning', toasted);

        console.log('\n=== 5) 백엔드 자체 오류는 failed 로 — 역시 삼키지 않는다 ===');
        mockFetch((url, opts) => {
            const b = JSON.parse(opts.body);
            if (b.folder.indexOf('SUMMARY/') === 0) return jsonRes(500, { ok: false, error: '일부러 실패' });
            return jsonRes(200, { ok: true, from: 'x', to: 'y' });
        });
        const r5 = await window._dsRenameProjectFolders('A', 'B');
        check('failed 에 SUMMARY', r5.failed.some((f) => f.indexOf('SUMMARY') === 0), r5);
        check('나머지는 moved', r5.moved.length === 3, r5);
    } finally {
        window.fetch = origFetch;
        window.PROJECT_FOLDER_RENAME_BASES = origBases;
    }

    console.log('\n' + '─'.repeat(60));
    console.log(PASS.length + '/' + (PASS.length + FAIL.length) + ' 통과');
    if (FAIL.length) console.error('❌ 실패:', FAIL);
    return { pass: PASS.length, fail: FAIL.length };
};
