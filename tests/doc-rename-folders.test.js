/* ============================================================================
   🗂 _dsRenameProjectFolders (js/48) — 순수 로직 하네스 (2026-11-11)

       node tests/doc-rename-folders.test.js

   ⚠️ 가짜는 **바깥 경계에만** — `fetch`(`/doc/rename` 호출) 하나뿐. 검사 대상은 js/48 의
      **진짜 함수**(`_dsRenameProjectFolders`, `PROJECT_FOLDER_RENAME_BASES`).
   브라우저에서 실제 백엔드로 돌리는 짝은 `tests/doc-rename-folders.browser.js`
   (사람이 이미 열어 둔 진짜 앱 세션에서 콘솔에 붙여넣는 것 — 이 Node 하네스는 그 세션을
   새로 열지 않고도 같은 계약을 먼저 확인하기 위한 것이다). 백엔드 자체 계약은
   `py -3 tests/test_doc_rename_folder.py` 가 진짜 `os.rename` 으로 확인한다.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const win = {};
global.window = win;
win._currentLang = 'ko';
win.showToast = () => {};
win._issueLog = () => {};
global.AbortSignal = { timeout: () => undefined };

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d !== undefined ? '  — ' + JSON.stringify(d) : '')); } };

// ── 진짜 js/48 로드 ─────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'js', '48-doc-store.js'), 'utf8');
new Function('window', src)(win);

function jsonRes(status, body) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

async function run(handler) {
    const calls = [];
    global.fetch = (url, opts) => {
        const body = opts && opts.body ? JSON.parse(opts.body) : null;
        calls.push({ url, body });
        return handler(url, body);
    };
    return calls;
}

(async () => {
    console.log('\n■ 네 base 모두 정상 이동');
    win.PROJECT_FOLDER_RENAME_BASES = ['CUSTOMER', 'SUMMARY', 'MC', 'DOCUMENT'];
    let calls = await run(() => jsonRes(200, { ok: true, from: 'x', to: 'y' }));
    let r = await win._dsRenameProjectFolders('LNW_27.0', 'LNW_OBSIDIAN27_DB_27.0');
    ok('4번 호출', calls.length === 4, calls.length);
    ok('전부 /doc/rename 으로', calls.every((c) => /\/doc\/rename$/.test(c.url)), calls.map((c) => c.url));
    ok('CUSTOMER/LNW_27.0 → LNW_OBSIDIAN27_DB_27.0', calls.some((c) =>
        c.body.folder === 'CUSTOMER/LNW_27.0' && c.body.newName === 'LNW_OBSIDIAN27_DB_27.0'), calls);
    ok('DOCUMENT 도 같이', calls.some((c) => c.body.folder === 'DOCUMENT/LNW_27.0'), calls);
    ok('moved 에 4개 다', r.moved.length === 4, r);

    console.log('\n■ 이름이 같으면 아예 안 부른다(옮길 게 없다)');
    calls = await run(() => jsonRes(200, { ok: true }));
    r = await win._dsRenameProjectFolders('SAME', 'SAME');
    ok('fetch 0회', calls.length === 0, calls.length);

    console.log('\n■ 이름이 비어 있으면 안 부른다(신규 프로젝트 — 옮길 "옛" 폴더가 없다)');
    calls = await run(() => jsonRes(200, { ok: true }));
    r = await win._dsRenameProjectFolders('', 'NEW');
    ok('fetch 0회', calls.length === 0, calls.length);

    console.log('\n■ 옛 폴더가 없던 base 는 skipped 로 — 오류로 보지 않는다');
    calls = await run((url, body) => body.folder.indexOf('DOCUMENT/') === 0
        ? jsonRes(200, { ok: true, skipped: 'source-missing', folder: body.folder })
        : jsonRes(200, { ok: true, from: 'x', to: 'y' }));
    r = await win._dsRenameProjectFolders('A', 'B');
    ok('skipped 에 DOCUMENT', r.skipped.indexOf('DOCUMENT') !== -1, r);
    ok('moved 엔 나머지 3개', r.moved.length === 3, r);
    ok('failed 는 0건(skip 은 실패가 아니다)', r.failed.length === 0, r);

    console.log('\n■ 겹치면(409) collided 로 — 조용히 삼키지 않고 토스트까지 띄운다');
    let toasted = null;
    win.showToast = (msg, kind) => { toasted = { msg, kind }; };
    calls = await run((url, body) => body.folder.indexOf('MC/') === 0
        ? jsonRes(409, { ok: false, collision: true, error: '이미 그 이름의 폴더가 있어 덮어쓰지 않았습니다: B' })
        : jsonRes(200, { ok: true, from: 'x', to: 'y' }));
    r = await win._dsRenameProjectFolders('A', 'B');
    win.showToast = () => {};
    ok('collided 에 MC', r.collided.indexOf('MC') !== -1, r);
    ok('moved 엔 나머지 3개', r.moved.length === 3, r);
    ok('failed 엔 안 들어간다(겹침은 실패와 다르다)', r.failed.length === 0, r);
    ok('사람이 볼 토스트를 띄운다(조용히 넘기지 않는다)', !!toasted && toasted.kind === 'warning', toasted);

    console.log('\n■ 백엔드 자체 오류는 failed 로 — 역시 삼키지 않는다');
    calls = await run((url, body) => body.folder.indexOf('SUMMARY/') === 0
        ? jsonRes(500, { ok: false, error: '일부러 실패' })
        : jsonRes(200, { ok: true, from: 'x', to: 'y' }));
    r = await win._dsRenameProjectFolders('A', 'B');
    ok('failed 에 SUMMARY', r.failed.some((f) => f.indexOf('SUMMARY') === 0), r);
    ok('나머지는 moved', r.moved.length === 3, r);

    console.log('\n' + (fail ? ('❌ ' + fail + '건 실패, ') : '✅ ') + pass + '/' + (pass + fail) + ' 통과');
    process.exit(fail ? 1 : 0);
})();
