// tests/ms-auto-register-topic-regen.test.js — 헤드리스 배치가 opts.noTopicRegen 이면 토픽 AI 재생성을 건너뛰는가
// (2026-11-23: 대기 재판정이 건마다 AI 재생성에 몇 분씩 묶였다 — 25건에 38분)
// 진짜 js/15b 의 _msAutoRegisterToProject 소스를 잘라 돌린다. 가짜는 바깥 경계뿐:
//   gapi.client.drive.files.get(읽기)·fetch(쓰기)·_tpMaybeAutoRegen(AI)·행 조립 헬퍼.
// 실행: node tests/ms-auto-register-topic-regen.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', '15b-mail-server-tab-1.js'), 'utf8');
const start = src.indexOf('window._msAutoRegisterToProject = async function(');
const end = src.indexOf('\n};', start) + 3;
if (start < 0 || end < 3) { console.error('함수를 못 찾음'); process.exit(1); }
const fnSrc = src.slice(start, end);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✅ ' + m); } else { fail++; console.log('❌ ' + m); } };

async function run(opts, conflictOnce, policy) {
    let regen = 0, puts = 0, metaCalls = 0, lastBody = '';
    const win = {
        currentDriveFileId: 'OTHER', currentUserName: 'tester',
        _t: (k) => k,
        computeCalcDatesForRows() {}, buildL0SectionInfo: () => [], pickL0SectionByDate: () => '__END__',
        buildMailTaskRow: () => ({ row: Object.assign(['x'], {}), taskName: 't' }),
        computeL0InsertPos: () => ({ pos: 1, previewLabel: 'p' }),
        _tpMaybeAutoRegen: async () => { regen++; return { patterns: [] }; },
    };
    win.window = win;
    if (policy) win.MAIL_ROUTING_POLICY = policy;
    win.globalData = undefined;
    win.gapi = { client: { getToken: () => ({ access_token: 'tok' }), drive: { files: { get: async (q) => {
        if (q.alt === 'media') return { result: { globalData: [{ data: ['h'] }], colIdx: { devStage: -1 }, projectMeta: {} } };
        metaCalls++;
        // 첫 읽기·첫 재확인이 다르면 충돌 → 1회 재시도
        const t = (conflictOnce && metaCalls === 2) ? 'T2' : 'T1';
        return { result: { modifiedTime: t } };
    } } } } };
    win.fetch = async (url, init) => { puts++; lastBody = String((init && init.body) || ''); return { ok: true, json: async () => ({ id: 'F' }) }; };
    const ctx = vm.createContext(win);
    vm.runInContext(fnSrc, ctx);
    const r = await win._msAutoRegisterToProject('u', { 시작일: '2026-11-01' }, 'F', 'f.json', null, 0, false, opts);
    return { r, regen, puts, lastBody };
}

(async () => {
    const ON = { headlessTopicRegen: true };
    let x = await run(undefined, false, ON);
    ok(x.r.ok && x.regen === 1, '1 정책을 켜면(headlessTopicRegen) 평소 배치는 토픽 재생성 판정을 부른다');
    x = await run({ noTopicRegen: true }, false, ON);
    ok(x.r.ok && x.regen === 0 && x.puts === 1, '2 noTopicRegen 이면 정책과 무관하게 AI 재생성을 부르지 않고 저장은 한다');
    x = await run({ noTopicRegen: true }, true, ON);
    ok(x.r.ok && x.regen === 0, '3 충돌 재시도 경로도 opts 를 물려받아 AI 재생성을 건너뛴다');
    x = await run(undefined, false, null);
    ok(x.r.ok && x.regen === 0 && x.puts === 1, '4 [2026-11-23 기본] 정책이 없거나 꺼져 있으면 헤드리스 배치는 AI 재생성을 기다리지 않는다');
    // 5 [2026-11-23] 헤드리스 쓰기는 파일 이름을 보내지 않는다 — 옛 이름(색인이 기억하던)을 보내면 NAS 에서 이름이 되돌아가며 파일이 둘로 갈라졌다
    x = await run(undefined, false, null);
    const metaJson = (x.lastBody.split('Content-Type: application/json; charset=UTF-8')[1] || '').split('--')[0].trim();
    let meta = null; try { meta = JSON.parse(metaJson); } catch (e) { meta = null; }
    ok(meta && !('name' in meta), '5 헤드리스 PATCH 메타데이터에 name 이 없다(내용만 쓴다)');
    console.log(`ms-auto-register-topic-regen: ${pass}/${pass + fail}`);
    process.exit(fail ? 1 : 0);
})();
