// 🧪 project_index 항목 upsert — "이름을 바꿔 저장하면 미지정이 된다" 회귀 (2026-11-09)
//
//     node tests/project-index-upsert.test.js
//
// 무엇을 보나
//   NAS 모드에선 한 경로에 옛 Drive id 가 여럿 걸려 있고, 목록이 내놓는 "승자" id 는
//   **파일 이름이 바뀌는 순간 뒤바뀐다**(js/57 `remapIdPath`). `updateProjectIndexEntry`
//   가 id 로만 항목을 찾으면 그때 **못 찾아 하나를 더 밀어 넣고**, 둘 중 하나는 어느
//   live 파일과도 안 맞아 "유령"으로 보인다 → 목록에서 담당자·팀·색이 빈 **"미지정"**.
//
// 가짜는 **바깥 경계에만** (CLAUDE.md "고쳤다"의 정의):
//   · gapi 토큰 · `findProjectIndexFile` · `fetch`(네트워크)
//   · `_storageRelOfId`(= js/57 어댑터) · 04c 밖에 사는 작은 헬퍼 셋
//   안쪽(찾기·밀어넣기·중복 모으기·항목 만들기)은 **js/04c 의 진짜 소스**를 잘라 돌린다.
'use strict';
const fs = require('fs');
const path = require('path');

// 돌연변이 시험용으로 다른 사본을 가리킬 수 있다: PI_SRC=<경로> node tests/project-index-upsert.test.js
const SRC = fs.readFileSync(process.env.PI_SRC
    || path.join(__dirname, '..', 'js', '04c-core-app-mail-pipeline.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, why) {
    if (ok) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}

/** 소스에서 `window.<name> = ...` 한 덩어리를 잘라 온다(끝은 들여쓰기 4칸 `};`). */
function slice(name) {
    const head = SRC.indexOf('window.' + name + ' = ');
    if (head < 0) throw new Error('함수를 못 찾음: ' + name);
    const end = SRC.indexOf('\n    };', head);
    if (end < 0) throw new Error('끝을 못 찾음: ' + name);
    return SRC.slice(head, end + '\n    };'.length);
}

// ── 사로잡은 환경 하나 만들기 ───────────────────────────────────────────────
function makeEnv(opts) {
    const o = opts || {};
    const win = {};
    const state = { patched: null, patchCount: 0, logs: [] };

    win.projectMeta = o.pm || {};
    win.tabData = { projectMaterials: [] };
    // 04c 밖에 사는 헬퍼 = 경계
    win._parseMailKeywords = function () { return []; };
    win._msIsKnownPersonName = function () { return false; };
    win._getTopicProfile = function () { return null; };
    win._invalidatePiModalCache = function () {};
    win.findProjectIndexFile = async function () { return 'IDX'; };
    // 어댑터(js/57) = 경계. Drive 모드를 흉내 낼 땐 아예 없다.
    if (o.relMap) {
        win._storageRelOfId = function (id) { return o.relMap[String(id)] || ''; };
    }

    const index = { projects: JSON.parse(JSON.stringify(o.projects || [])) };
    const sandbox = {
        window: win,
        gapi: { client: { getToken: function () { return { access_token: 't' }; } } },
        console: {
            log: function (m) { state.logs.push(String(m)); },
            error: function (m) { state.logs.push('E:' + String(m)); },
            warn: function (m) { state.logs.push('W:' + String(m)); }
        },
        fetch: async function (url, init) {
            if (init && init.method === 'PATCH') {
                state.patchCount++;
                state.patched = JSON.parse(init.body);
                return { json: async function () { return {}; } };
            }
            return { json: async function () { return JSON.parse(JSON.stringify(index)); } };
        },
        Date: Date, JSON: JSON, Array: Array, Object: Object, Set: Set, String: String
    };

    // 04c 의 진짜 소스를 잘라 넣는다 — 안쪽은 가짜가 없다.
    const code = '"use strict";\n'
        + SRC.slice(SRC.indexOf('    function _inchFromFileName'),
                    SRC.indexOf('\n    }', SRC.indexOf('    function _inchFromFileName')) + 6) + '\n'
        + slice('buildProjectIndexEntry') + '\n'
        + slice('updateProjectIndexEntry') + '\n'
        + 'return window.updateProjectIndexEntry;';
    const fn = new Function('window', 'gapi', 'console', 'fetch', code);
    return { run: fn(sandbox.window, sandbox.gapi, sandbox.console, sandbox.fetch), state: state, win: win };
}

const PM = { 모델명: 'OBSIDIAN27', 고객사: 'LNW', 프로젝트담당자: '임희철', 팀: '개발3팀' };
const REL = '개발3팀/LNW_27.0.json';

(async function () {
    console.log('\n=== 1) 이름을 바꿔 저장 — 승자 id 가 바뀌어도 항목이 하나다 ===');
    {
        // 색인엔 옛 승자(A)로 적혀 있고, 지금 저장은 새 승자(B)로 들어온다. 둘 다 같은 경로.
        const env = makeEnv({
            pm: PM,
            projects: [{ drive_file_id: 'A', file_name: 'LNW_OBSIDIAN27_DB_27.0.json', assignee: '임희철', team: '개발3팀' },
                       { drive_file_id: 'Z', file_name: '남의프로젝트.json', assignee: '박용훈' }],
            relMap: { A: REL, B: REL, Z: '개발3팀/other.json' }
        });
        const ok = await env.run('B', 'LNW_27.0.json');
        const ps = env.state.patched.projects;
        check('저장 자체는 성공', ok === true);
        check('항목이 늘지 않는다(2건 그대로)', ps.length === 2, '실제 ' + ps.length + '건');
        const mine = ps.filter(function (p) { return (env.win._storageRelOfId(p.drive_file_id)) === REL; });
        check('그 경로를 가리키는 항목은 **하나**', mine.length === 1, '실제 ' + mine.length + '건');
        check('id 가 지금 승자로 교정된다', mine[0] && mine[0].drive_file_id === 'B',
              mine[0] && mine[0].drive_file_id);
        check('담당자·팀이 살아 있다(= 미지정이 안 된다)',
              mine[0] && mine[0].assignee === '임희철' && mine[0].team === '개발3팀');
        check('파일 이름도 새 이름으로', mine[0] && mine[0].file_name === 'LNW_27.0.json');
        check('남의 항목은 안 건드린다', ps.some(function (p) { return p.drive_file_id === 'Z'; }));
        check('경로로 찾았다고 로그에 남는다', env.state.logs.some(function (m) { return /경로로 찾아/.test(m); }));
    }

    console.log('\n=== 2) 옛 js 가 만들어 둔 중복을 하나로 모은다 ===');
    {
        const env = makeEnv({
            pm: PM,
            projects: [{ drive_file_id: 'A', file_name: 'old.json', assignee: '임희철' },
                       { drive_file_id: 'B', file_name: 'LNW_27.0.json', assignee: '임희철' },
                       { drive_file_id: 'Z', file_name: '남의것.json', assignee: '박용훈' }],
            relMap: { A: REL, B: REL, Z: '개발3팀/other.json' }
        });
        await env.run('B', 'LNW_27.0.json');
        const ps = env.state.patched.projects;
        check('3건 → 2건', ps.length === 2, '실제 ' + ps.length + '건');
        check('남는 건 지금 승자', ps.filter(function (p) { return p.drive_file_id === 'B'; }).length === 1);
        check('옛 id 항목은 사라진다', !ps.some(function (p) { return p.drive_file_id === 'A'; }));
        check('남의 항목은 그대로', ps.some(function (p) { return p.drive_file_id === 'Z'; }));
        check('모았다고 로그에 남는다', env.state.logs.some(function (m) { return /중복 항목/.test(m); }));
    }

    console.log('\n=== 3) 평범한 저장(id 가 그대로) — 예전과 똑같다 ===');
    {
        const env = makeEnv({
            pm: PM,
            projects: [{ drive_file_id: 'B', file_name: 'LNW_27.0.json', assignee: '임희철', keywords: ['옛것'] }],
            relMap: { B: REL }
        });
        await env.run('B', 'LNW_27.0.json');
        const ps = env.state.patched.projects;
        check('1건 그대로', ps.length === 1);
        check('id 유지', ps[0].drive_file_id === 'B');
        check('경로로 찾을 일이 없었다', !env.state.logs.some(function (m) { return /경로로 찾아/.test(m); }));
    }

    console.log('\n=== 4) 새 프로젝트 — 없으면 더한다 ===');
    {
        const env = makeEnv({ pm: PM, projects: [{ drive_file_id: 'Z', file_name: '남의것.json' }],
                              relMap: { NEW: '개발3팀/새것.json', Z: '개발3팀/other.json' } });
        await env.run('NEW', '새것.json');
        const ps = env.state.patched.projects;
        check('2건이 된다', ps.length === 2, '실제 ' + ps.length + '건');
        check('새 항목이 들어갔다', ps.some(function (p) { return p.drive_file_id === 'NEW'; }));
    }

    console.log('\n=== 5) Drive 모드(어댑터 없음) — 동작 불변 ===');
    {
        const env = makeEnv({
            pm: PM,
            projects: [{ drive_file_id: 'A', file_name: 'old.json', assignee: '임희철' }]
            // relMap 없음 → window._storageRelOfId 자체가 없다
        });
        check('_storageRelOfId 가 없는 환경', typeof env.win._storageRelOfId === 'undefined');
        await env.run('B', 'LNW_27.0.json');
        const ps = env.state.patched.projects;
        check('예전처럼 id 가 다르면 하나 더 들어간다', ps.length === 2, '실제 ' + ps.length + '건');
        check('기존 항목은 손대지 않는다', ps.some(function (p) { return p.drive_file_id === 'A'; }));
        check('중복 모으기도 안 돈다', !env.state.logs.some(function (m) { return /중복 항목/.test(m); }));
    }

    console.log('\n=== 6) 경로를 모르는 항목은 절대 안 건드린다 ===');
    {
        // 지도에 없는 id(= relOfId 가 '') 가 섞여 있어도 '' 끼리 묶여 지워지면 안 된다.
        const env = makeEnv({
            pm: PM,
            projects: [{ drive_file_id: 'unknown1', file_name: 'a.json', assignee: '김시윤' },
                       { drive_file_id: 'unknown2', file_name: 'b.json', assignee: '권혁성' }],
            relMap: { B: REL }
        });
        await env.run('B', 'LNW_27.0.json');
        const ps = env.state.patched.projects;
        check('모르는 항목 2건이 그대로 남는다', ps.length === 3, '실제 ' + ps.length + '건');
        check('unknown1 살아 있다', ps.some(function (p) { return p.drive_file_id === 'unknown1'; }));
        check('unknown2 살아 있다', ps.some(function (p) { return p.drive_file_id === 'unknown2'; }));
    }

    console.log('\n=== 7) 읽기 실패는 여전히 쓰지 않는다(옛 가드 보존) ===');
    {
        const env = makeEnv({ pm: PM, projects: [] });
        // 색인을 못 읽은 상황을 흉내 — fetch 가 모양 아닌 걸 준다
        const bad = makeEnv({ pm: PM, projects: [] });
        bad.run = (function (orig) { return orig; })(bad.run);
        // 직접 깨뜨린다: projects 가 배열이 아닌 응답
        const win = {}; // 새 환경을 손으로
        const st = { patchCount: 0 };
        const code = '"use strict";\n'
            + SRC.slice(SRC.indexOf('    function _inchFromFileName'),
                        SRC.indexOf('\n    }', SRC.indexOf('    function _inchFromFileName')) + 6) + '\n'
            + slice('buildProjectIndexEntry') + '\n' + slice('updateProjectIndexEntry') + '\n'
            + 'return window.updateProjectIndexEntry;';
        win.projectMeta = PM; win.tabData = { projectMaterials: [] };
        win._parseMailKeywords = function () { return []; };
        win._msIsKnownPersonName = function () { return false; };
        win._getTopicProfile = function () { return null; };
        win.findProjectIndexFile = async function () { return 'IDX'; };
        const run = new Function('window', 'gapi', 'console', 'fetch', code)(
            win,
            { client: { getToken: function () { return { access_token: 't' }; } } },
            { log: function () {}, error: function () {}, warn: function () {} },
            async function (url, init) {
                if (init && init.method === 'PATCH') { st.patchCount++; return { json: async function () { return {}; } }; }
                return { json: async function () { return { oops: true }; } };
            });
        const r = await run('B', 'x.json');
        check('false 를 돌려준다', r === false);
        check('한 번도 쓰지 않았다', st.patchCount === 0, 'PATCH ' + st.patchCount + '회');
        void env;
    }

    console.log('\n=== 8) 소스 불변식 ===');
    {
        const blk = SRC.slice(SRC.indexOf('window.updateProjectIndexEntry = async function'),
                              SRC.indexOf('window.updateProjectIndexEntry = async function') + 4000);
        check('이름으로는 찾지 않는다(팀이 다른 동명 파일 오매칭 방지)',
              !/p\.file_name\s*===\s*dynamicFileName/.test(blk), 'file_name 매칭이 생겼다');
        check('경로 열쇠를 쓴다', /_storageRelOfId/.test(blk));
        check('읽기 실패 가드가 남아 있다', /Array\.isArray\(loaded\.projects\)/.test(SRC));
    }

    console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + '/' + (pass + fail));
    process.exit(fail ? 1 : 0);
})();
