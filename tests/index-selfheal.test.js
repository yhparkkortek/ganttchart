// 🩹 색인 자동 복구 — "살아 있는 파일인데 항목이 없으면 되살린다" (2026-11-09)
//
//     node tests/index-selfheal.test.js
//
// 왜 이 하네스가 필요한가 — 이 기능은 **공용 색인에 쓰는** 코드다. 잘못 만들면
// ① 정상 삭제한 프로젝트를 되살리거나 ② 빈 항목을 색인에 굳히거나 ③ 두 PC 가
// 5분마다 서로 덮어쓰며 다툰다. 그 세 가지를 여기서 못 박는다.
//
// 가짜는 **바깥 경계에만**: localStorage · gapi(파일 읽기) · fetch(색인 읽기/쓰기)
// · `_storageRelOfId`(js/57) · `buildProjectIndexEntry`(js/04c) · showToast/_issueLog.
// 안쪽(빠진 파일 고르기·스냅샷·상한·쿨다운·쓰기 직전 재확인)은 **js/66 의 진짜 소스**가 돈다.
'use strict';
const fs = require('fs');
const path = require('path');

// 돌연변이 시험용 사본 지정: SELFHEAL_SRC=<경로> node tests/index-selfheal.test.js
const SRC = fs.readFileSync(process.env.SELFHEAL_SRC
    || path.join(__dirname, '..', 'js', '66-index-selfheal.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, why) {
    if (ok) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (why !== undefined ? '  — ' + JSON.stringify(why) : '')); }
}

function mkEnv(opts) {
    const o = opts || {};
    const store = Object.assign({}, o.localStorage || {});
    const state = { patched: null, patchCount: 0, getCount: 0, fileReads: [], logs: [], toasts: [], issues: [] };

    const win = {
        _projectIndexCache: { data: null, at: 0 },
        _invalidatePiModalCache: function () {},
        findProjectIndexFile: async function () { return o.noIndexFile ? '' : 'IDX'; },
        _storageRelOfId: function (id) { return (o.relMap || {})[id] || ''; },
        showToast: function (m, k) { state.toasts.push(String(m)); void k; },
        _issueLog: function (e) { state.issues.push(e); },
        // js/04c 의 함수 = 경계. 진짜와 같은 모양만 지킨다.
        buildProjectIndexEntry: function (fid, name, pm, mats) {
            return { drive_file_id: fid, file_name: name, model: pm.모델명 || '',
                     customer: pm.고객사 || '', assignee: pm.프로젝트담당자 || '',
                     keywords: [pm.모델명].filter(Boolean), completed: false,
                     team: pm.팀 || '', materials: (mats || []).length };
        }
    };

    const localStorage = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem: function (k, v) { if (o.lsFull) throw new Error('quota'); store[k] = String(v); },
        removeItem: function (k) { delete store[k]; }
    };

    const gapi = {
        client: {
            getToken: function () { return o.noToken ? null : { access_token: 't' }; },
            drive: { files: { get: async function (a) {
                state.fileReads.push(a.fileId);
                if (o.fileReadThrows) throw new Error('일부러 실패');
                const d = (o.files || {})[a.fileId];
                if (!d) throw new Error('없음');
                return { result: d };
            } } }
        }
    };

    const fetchFn = async function (url, init) {
        if (init && init.method === 'PATCH') {
            state.patchCount++;
            state.patched = JSON.parse(init.body);
            return { json: async function () { return {}; } };
        }
        state.getCount++;
        const doc = o.freshIndex !== undefined ? o.freshIndex : { projects: o.indexOnDisk || [] };
        return { json: async function () { return JSON.parse(JSON.stringify(doc)); } };
    };

    const code = SRC + '\nreturn { heal: window._indexSelfHeal, remember: window._indexSnapshotRemember,'
               + ' cfg: window.INDEX_SELFHEAL };';
    const made = new Function('window', 'localStorage', 'gapi', 'fetch', 'console', code)(
        win, localStorage, gapi, fetchFn,
        { warn: function (m) { state.logs.push(String(m)); }, log: function () {}, error: function (m) { state.logs.push('E:' + m); } });
    return { win: win, store: store, state: state, heal: made.heal, remember: made.remember, cfg: made.cfg };
}

const F = function (id, name) { return { id: id, name: name }; };
const ENT = function (id, name, who) {
    return { drive_file_id: id, file_name: name, assignee: who || '박용훈', team: '개발3팀',
             themeColor: '#2c5f8a', keywords: ['k1', 'k2'], topicKeywords: ['t1', 't2', 't3'] };
};
const DOC = function (who) {
    return { projectMeta: { 모델명: 'POLED', 고객사: 'LNW', 프로젝트담당자: who, 팀: '개발3팀' },
             tabData: { themeColor: '#2c5f8a', projectMaterials: [{ ktkPn: 'X' }] } };
};

(async function () {
    console.log('\n=== 1) 스냅샷이 있으면 그걸로 되살린다 (키워드·토픽까지) ===');
    {
        const snap = {}; snap['rel:개발3팀/B.json'] = ENT('bOld', 'B.json', '임희철');
        const env = mkEnv({
            relMap: { a: '개발3팀/A.json', b: '개발3팀/B.json', bOld: '개발3팀/B.json' },
            localStorage: { gantt_index_entry_cache_v1: JSON.stringify(snap) },
            indexOnDisk: [ENT('a', 'A.json')]
        });
        const n = await env.heal([F('a', 'A.json'), F('b', 'B.json')], [ENT('a', 'A.json')]);
        check('1건 되살렸다', n === 1, n);
        const added = (env.state.patched.projects || []).filter(function (p) { return p.file_name === 'B.json'; });
        check('항목이 색인에 들어갔다', added.length === 1, env.state.patched.projects.map(p => p.file_name));
        check('keywords 가 그대로', JSON.stringify(added[0].keywords) === '["k1","k2"]', added[0].keywords);
        check('topicKeywords 가 그대로', (added[0].topicKeywords || []).length === 3, added[0].topicKeywords);
        check('담당자·색 그대로', added[0].assignee === '임희철' && added[0].themeColor === '#2c5f8a');
        check('id 는 지금 목록이 내놓는 것으로 교정', added[0].drive_file_id === 'b', added[0].drive_file_id);
        check('프로젝트 파일은 읽지 않았다(싸다)', env.state.fileReads.length === 0, env.state.fileReads);
        check('기존 항목은 그대로', (env.state.patched.projects || []).length === 2);
        check('반복되면 옛 앱 탓임을 알려준다', env.state.logs.some(function (m) { return /옛 버전 앱/.test(m); }));
        check('토스트로 사람에게 보인다', env.state.toasts.length === 1, env.state.toasts);
        check('_issueLog 에 남는다', env.state.issues.length === 1 && env.state.issues[0].kind === 'index_entry_healed');
    }

    console.log('\n=== 2) 스냅샷이 없으면 프로젝트 파일에서 만든다 ===');
    {
        const env = mkEnv({
            relMap: { b: '개발3팀/B.json' },
            files: { b: DOC('김시윤') },
            indexOnDisk: [ENT('a', 'A.json')]
        });
        const n = await env.heal([F('a', 'A.json'), F('b', 'B.json')], [ENT('a', 'A.json')]);
        check('1건 되살렸다', n === 1, n);
        check('파일을 읽었다', env.state.fileReads.length === 1, env.state.fileReads);
        const added = env.state.patched.projects.filter(function (p) { return p.file_name === 'B.json'; })[0];
        check('담당자를 파일에서 가져왔다', added && added.assignee === '김시윤', added);
        check('테마색도 채운다', added && added.themeColor === '#2c5f8a', added);
    }

    console.log('\n=== 3) 담당자가 비면 아무것도 넣지 않는다 (빈 "미지정" 을 굳히지 않는다) ===');
    {
        const env = mkEnv({ relMap: { b: '개발3팀/B.json' }, files: { b: DOC('') },
                            indexOnDisk: [ENT('a', 'A.json')] });
        const n = await env.heal([F('a', 'A.json'), F('b', 'B.json')], [ENT('a', 'A.json')]);
        check('0건', n === 0, n);
        check('쓰지 않았다', env.state.patchCount === 0);
        check('왜 건너뛰는지 적는다', env.state.logs.some(function (m) { return /담당자가 비어/.test(m); }));
    }

    console.log('\n=== 4) 정상 삭제는 되살아나지 않는다 (파일이 없으면 후보가 아니다) ===');
    {
        const env = mkEnv({ relMap: { a: '개발3팀/A.json', gone: '개발3팀/GONE.json' },
                            localStorage: { gantt_index_entry_cache_v1: JSON.stringify(
                                { 'rel:개발3팀/GONE.json': ENT('gone', 'GONE.json') }) },
                            indexOnDisk: [ENT('a', 'A.json')] });
        const n = await env.heal([F('a', 'A.json')], [ENT('a', 'A.json')]);   // GONE 은 파일 목록에 없다
        check('0건 — 스냅샷에 있어도 안 되살린다', n === 0, n);
        check('쓰지 않았다', env.state.patchCount === 0);
    }

    console.log('\n=== 5) 이미 있는 항목은 세 열쇠 전부로 알아본다 ===');
    {
        // 색인 항목의 id 가 **다른 승자**지만 같은 경로 → 있는 것으로 봐야 한다
        const env = mkEnv({ relMap: { b: '개발3팀/B.json', bOld: '개발3팀/B.json' },
                            indexOnDisk: [ENT('bOld', 'B-옛이름.json')] });
        const n = await env.heal([F('b', 'B.json')], [ENT('bOld', 'B-옛이름.json')]);
        check('경로가 같으면 안 더한다', n === 0, n);
        check('쓰지 않았다', env.state.patchCount === 0);
    }
    {
        const env = mkEnv({ relMap: {}, indexOnDisk: [ENT('zzz', 'B.json')] });
        const n = await env.heal([F('b', 'B.json')], [ENT('zzz', 'B.json')]);
        check('이름이 같으면 안 더한다(경로를 몰라도)', n === 0, n);
    }

    console.log('\n=== 6) 쓰기 직전 다시 읽어 — 그 사이 누가 되살렸으면 안 더한다 ===');
    {
        const snap = { 'rel:개발3팀/B.json': ENT('b', 'B.json') };
        const env = mkEnv({ relMap: { b: '개발3팀/B.json' },
                            localStorage: { gantt_index_entry_cache_v1: JSON.stringify(snap) },
                            freshIndex: { projects: [ENT('a', 'A.json'), ENT('b', 'B.json')] } });
        const n = await env.heal([F('a', 'A.json'), F('b', 'B.json')], [ENT('a', 'A.json')]);
        check('0건 — 중복을 안 만든다', n === 0, n);
        check('쓰지 않았다', env.state.patchCount === 0);
    }

    console.log('\n=== 7) 색인을 못 읽으면 쓰지 않는다 ===');
    {
        const snap = { 'rel:개발3팀/B.json': ENT('b', 'B.json') };
        for (const bad of [{ projects: [] }, {}, null]) {
            const env = mkEnv({ relMap: { b: '개발3팀/B.json' },
                                localStorage: { gantt_index_entry_cache_v1: JSON.stringify(snap) },
                                freshIndex: bad });
            const n = await env.heal([F('b', 'B.json')], []);
            check('빈/깨진 색인(' + JSON.stringify(bad) + ')엔 안 쓴다', n === 0 && env.state.patchCount === 0, n);
        }
    }

    console.log('\n=== 8) 목록이 비면 아무 판단도 안 한다 ===');
    {
        const env = mkEnv({ indexOnDisk: [ENT('a', 'A.json')] });
        check('빈 배열 → 0건', (await env.heal([], [ENT('a', 'A.json')])) === 0);
        check('배열이 아니면 → 0건', (await env.heal(null, [])) === 0);
        check('쓰지 않았다', env.state.patchCount === 0);
    }

    console.log('\n=== 9) 한 스윕 상한 ===');
    {
        const snap = {};
        const files = [];
        for (let i = 0; i < 9; i++) {
            snap['rel:개발3팀/P' + i + '.json'] = ENT('p' + i, 'P' + i + '.json');
            files.push(F('p' + i, 'P' + i + '.json'));
        }
        const relMap = {};
        files.forEach(function (f, i) { relMap['p' + i] = '개발3팀/P' + i + '.json'; });
        const env = mkEnv({ relMap: relMap,
                            localStorage: { gantt_index_entry_cache_v1: JSON.stringify(snap) },
                            indexOnDisk: [ENT('a', 'A.json')] });
        const n = await env.heal(files, [ENT('a', 'A.json')]);
        check('상한(maxPerSweep) 을 넘지 않는다', n === env.cfg.maxPerSweep, n + ' vs ' + env.cfg.maxPerSweep);
    }

    console.log('\n=== 10) 쿨다운 — 같은 파일을 연달아 두 번 안 건드린다 ===');
    {
        const snap = { 'rel:개발3팀/B.json': ENT('b', 'B.json') };
        const env = mkEnv({ relMap: { b: '개발3팀/B.json' },
                            localStorage: { gantt_index_entry_cache_v1: JSON.stringify(snap) },
                            indexOnDisk: [] , freshIndex: { projects: [ENT('a', 'A.json')] } });
        const n1 = await env.heal([F('b', 'B.json')], []);
        const n2 = await env.heal([F('b', 'B.json')], []);     // 색인은 그대로(가짜) → 또 빠져 보인다
        check('첫 번째는 되살린다', n1 === 1, n1);
        check('두 번째는 쉰다(쿨다운)', n2 === 0, n2);
        check('쓰기는 한 번뿐', env.state.patchCount === 1, env.state.patchCount);
    }

    console.log('\n=== 11) 킬스위치 ===');
    {
        const snap = { 'rel:개발3팀/B.json': ENT('b', 'B.json') };
        const env = mkEnv({ relMap: { b: '개발3팀/B.json' },
                            localStorage: { gantt_index_entry_cache_v1: JSON.stringify(snap),
                                            gantt_index_selfheal_off: '1' },
                            indexOnDisk: [] });
        check('꺼면 0건', (await env.heal([F('b', 'B.json')], [])) === 0);
        check('쓰지 않았다', env.state.patchCount === 0);
    }

    console.log('\n=== 12) 토큰이 없으면 조용히 넘어간다 ===');
    {
        const snap = { 'rel:개발3팀/B.json': ENT('b', 'B.json') };
        const env = mkEnv({ relMap: { b: '개발3팀/B.json' }, noToken: true,
                            localStorage: { gantt_index_entry_cache_v1: JSON.stringify(snap) },
                            indexOnDisk: [] });
        check('0건', (await env.heal([F('b', 'B.json')], [])) === 0);
        check('쓰지 않았다', env.state.patchCount === 0);
    }

    console.log('\n=== 13) 파일 읽기가 터져도 다른 건은 계속한다 ===');
    {
        const env = mkEnv({ relMap: { b: '개발3팀/B.json' }, fileReadThrows: true,
                            indexOnDisk: [ENT('a', 'A.json')] });
        const n = await env.heal([F('a', 'A.json'), F('b', 'B.json')], [ENT('a', 'A.json')]);
        check('0건이지만 예외가 새지 않는다', n === 0, n);
        check('왜 못 했는지 적는다', env.state.logs.some(function (m) { return /못 읽었/.test(m); }));
    }

    console.log('\n=== 14) 스냅샷 기억하기 ===');
    {
        const env = mkEnv({ relMap: { a: '개발3팀/A.json' } });
        env.remember([ENT('a', 'A.json')]);
        const snap = JSON.parse(env.store.gantt_index_entry_cache_v1);
        check('경로 열쇠로 적는다', !!snap['rel:개발3팀/A.json'], Object.keys(snap));
        env.remember([]);
        check('빈 목록은 안 적는다(지우지 않는다)', !!JSON.parse(env.store.gantt_index_entry_cache_v1)['rel:개발3팀/A.json']);
    }
    {
        const env = mkEnv({ lsFull: true });
        let threw = false;
        try { env.remember([ENT('a', 'A.json')]); } catch (e) { threw = true; }
        check('localStorage 가 꽉 차도 안 터진다', !threw);
    }

    console.log('\n=== 15) 소스 불변식 ===');
    {
        check('수치는 데이터로 뺀다', /window\.INDEX_SELFHEAL\s*=\s*\{/.test(SRC));
        check('킬스위치가 있다', /gantt_index_selfheal_off/.test(SRC));
        check('빈 색인 덮어쓰기 가드가 있다', /Array\.isArray\(doc\.projects\)\s*\|\|\s*!doc\.projects\.length/.test(SRC));
        check('더하기만 한다(필터로 지우는 코드가 없다)',
              !/doc\.projects\s*=\s*doc\.projects\.filter/.test(SRC));
    }

    console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + '/' + (pass + fail));
    process.exit(fail ? 1 : 0);
})();
