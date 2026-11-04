/* 📦 Drive → NAS 이사 검증 — Drive 는 경계에서만 가짜, NAS 는 진짜
   (앱을 열고 브라우저 콘솔에 붙여넣어 실행)

전제: 백엔드가 돌고 `/nas/app/*` 가 살아 있을 것. **Drive 모드(플래그 OFF)**에서 돌릴 것.

왜 가짜를 쓰나: 이사는 Drive 를 읽어야 하는데 구글 로그인 없이는 못 읽는다.
  그렇다고 검증을 건너뛰면 안 된다 — 가짜는 **바깥 경계(Drive)에만** 두고
  안쪽(트리 순회·건너뛰기 판정·b64 변환·NAS 쓰기·대조)은 전부 진짜로 돌린다.
  끝나면 **파일이 실제로 NAS 에 올라가 있다**(그걸 확인한다).

확인하는 것:
  ① 트리를 끝까지 훑는다(하위 폴더 포함)
  ② 1,000건을 넘어도 **안 잘린다**(nextPageToken)
  ③ 이진 파일이 **바이트 그대로** 간다 (.enc 같은 것)
  ④ 다시 돌리면 **전부 건너뛴다**(멱등 · 재개)
  ⑤ 크기가 다르면 다시 옮긴다
  ⑥ 이름이 겹치면 신고하고 **최신만** 옮긴다
  ⑦ 대조가 실제로 샌 것을 잡아낸다
  ⑧ NAS 모드에서는 **돌기를 거부한다**(아무 일도 안 하고 성공할 자리라서)

⚠️ 가짜 Drive 의 루트에는 `_migrate_probe` 폴더 하나만 둔다 — 그래야 복사가
   **그 폴더 안에만** 생긴다. 끝나면 지운다.
⚠️ 끝나면 새로고침할 것(가짜 Drive 가 걸려 있다).
*/
(async function () {
    'use strict';
    var DIR = '_migrate_probe';
    var BK = 'http://127.0.0.1:5000';
    var ok = 0, bad = 0;
    function out(s) { console.log(s); }
    function check(label, cond, detail) {
        if (cond) { ok++; out('  ✅ ' + label + (detail ? ' · ' + detail : '')); }
        else { bad++; out('  ❌ ' + label + (detail ? ' · ' + detail : '')); }
        return cond;
    }

    if (!window.nasMigrate) { out('❌ js/58 가 안 떠 있습니다 (Ctrl+Shift+R)'); return; }
    var SA = window.STORAGE_ADAPTER;
    if (SA && SA.mode === 'nas') {
        out('⚠️ NAS 모드입니다 — Drive 모드로 바꾸고 새로고침하세요:');
        out("   localStorage.removeItem('gantt_storage_backend'); location.reload();");
        return;
    }
    var realFetch = window.fetch.bind(window);
    var pr = await (await realFetch(BK + '/nas/paths')).json().catch(function () { return {}; });
    if (!check('/nas/paths configured', !!pr.configured, pr.root || pr.message || '')) return;

    // ── 가짜 Drive ────────────────────────────────────────────────────────
    var ROOT = (typeof SHARED_FOLDER_ID !== 'undefined') ? SHARED_FOLDER_ID : 'root';
    var FOLDER = 'application/vnd.google-apps.folder';
    var bin = new Uint8Array(512); for (var i = 0; i < 512; i++) bin[i] = i % 256;
    var tree = {};                 // folderId -> [entries]
    var blobs = {};                // fileId -> ArrayBuffer
    function addFile(folderId, id, name, bytes, mtime) {
        var buf = (bytes instanceof Uint8Array) ? bytes : new TextEncoder().encode(bytes);
        blobs[id] = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        (tree[folderId] = tree[folderId] || []).push({
            id: id, name: name, mimeType: 'application/octet-stream',
            size: String(buf.byteLength), modifiedTime: mtime || '2026-11-01T00:00:00.000Z'
        });
    }
    function addFolder(parentId, id, name) {
        (tree[parentId] = tree[parentId] || []).push({ id: id, name: name, mimeType: FOLDER });
        tree[id] = tree[id] || [];
    }
    addFolder(ROOT, 'f_probe', DIR);
    addFile('f_probe', 'x1', 'a.json', '{"n":1}');
    addFile('f_probe', 'x2', 'bin.enc', bin);                      // ③ 이진
    addFolder('f_probe', 'f_team', '개발9팀');
    addFile('f_team', 'x3', '한글 프로젝트.json', '{"team":9,"한":"글"}');
    // ⑥ 같은 폴더에 같은 이름 둘 — 최신(x5)만 가야 한다
    addFile('f_team', 'x4', 'dup.json', '{"old":true}', '2026-10-01T00:00:00.000Z');
    addFile('f_team', 'x5', 'dup.json', '{"new":true}', '2026-11-02T00:00:00.000Z');
    // ② 페이지 넘김 — 한 폴더에 1,000건을 넘겨 본다(내용은 작게)
    addFolder('f_probe', 'f_many', 'many');
    var MANY = 1205;
    for (var k = 0; k < MANY; k++) addFile('f_many', 'm' + k, 'm' + k + '.txt', 'x');

    var listCalls = 0;
    function fakeList(p) {
        listCalls++;
        var m = /'([^']+)' in parents/.exec(p.q || '');
        var all = (tree[m ? m[1] : ''] || []).slice();
        var start = p.pageToken ? Number(p.pageToken) : 0;
        var page = all.slice(start, start + 1000);      // Drive 와 같게 1,000건씩
        var next = (start + 1000 < all.length) ? String(start + 1000) : undefined;
        return Promise.resolve({ result: { files: page, nextPageToken: next } });
    }
    // ⚠️ 구글 로그인이 안 된 창에서는 `gapi.client.drive` 가 **아예 없다**(discovery 가 안 실린다).
    //    그걸 가정하고 바로 덮어쓰려다 TypeError 로 조용히 멈췄다 — 없으면 만들어 둔다.
    if (!window.gapi) window.gapi = {};
    if (!gapi.client) gapi.client = {};
    var hadDrive = !!gapi.client.drive;
    if (!gapi.client.drive) gapi.client.drive = {};
    if (!gapi.client.drive.files) gapi.client.drive.files = {};
    var origList = gapi.client.drive.files.list;
    var origFetch = window.fetch;
    var origToken = gapi.client.getToken;
    gapi.client.drive.files.list = fakeList;
    gapi.client.getToken = function () { return { access_token: 'fake' }; };
    window.fetch = function (input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var m = /googleapis\.com\/drive\/v3\/files\/([^/?#]+)\?alt=media/.exec(url);
        if (!m) return origFetch(input, init);
        var id = decodeURIComponent(m[1]);
        if (!blobs[id]) return Promise.resolve(new Response('', { status: 404 }));
        return Promise.resolve(new Response(blobs[id], { status: 200 }));
    };
    function restore() {
        if (hadDrive) gapi.client.drive.files.list = origList;
        else delete gapi.client.drive;          // 우리가 만든 것이면 치운다
        gapi.client.getToken = origToken;
        window.fetch = origFetch;
    }
    out('   (Drive 를 경계에서 가짜로 바꿨습니다 — NAS 는 진짜입니다)');

    async function nasGet(rel) {
        var r = await realFetch(BK + '/nas/app/get?rel=' + encodeURIComponent(rel));
        return r.ok ? await r.arrayBuffer() : null;
    }

    try {
        out('\n== ① 트리 조사 ==');
        var planAll = await window.nasMigrate.scan();
        var rels = planAll.files.map(function (f) { return f.rel; });
        check('하위 폴더까지 훑는다', rels.indexOf(DIR + '/개발9팀/한글 프로젝트.json') >= 0);
        check('폴더 목록에 하위가 들어 있다', planAll.folders.indexOf(DIR + '/개발9팀') >= 0,
              planAll.folders.join(', ').slice(0, 80));

        out('\n== ② 1,000건을 넘겨도 안 잘린다 (nextPageToken) ==');
        var manyCount = rels.filter(function (r) { return r.indexOf(DIR + '/many/') === 0; }).length;
        check('many 폴더 ' + MANY + '건이 다 잡힌다', manyCount === MANY, '잡힌 수: ' + manyCount);

        out('\n== ⑥ 이름이 겹치면 신고하고 최신만 ==');
        check('겹침을 신고한다', planAll.duplicates.length === 1, JSON.stringify(planAll.duplicates));
        var dupEntries = planAll.files.filter(function (f) { return f.rel === DIR + '/개발9팀/dup.json'; });
        check('목록엔 한 건만 남는다', dupEntries.length === 1);
        check('최신 것이 남는다', dupEntries[0] && dupEntries[0].id === 'x5', dupEntries[0] && dupEntries[0].id);

        out('\n== ③ 실제로 옮긴다 (이진 포함) ==');
        // ⚠️ 복사는 **작은 것만** 한다 — many/ 1,205건을 정말 옮기면 NAS 왕복만 7분이고,
        //    느린 검증은 아무도 안 돌린다. 페이지 넘김은 ②(조사)에서 이미 봤다.
        var notMany = function (r) { return r.indexOf(DIR + '/many') !== 0; };
        var plan = {
            files: planAll.files.filter(function (f) { return notMany(f.rel); }),
            folders: planAll.folders.filter(notMany),
            duplicates: planAll.duplicates, tooDeep: planAll.tooDeep,
            aliases: planAll.aliases          // ⚠️ 빠뜨리면 밀려난 id 가 지도에 안 들어간다
        };
        out('   (복사 대상 ' + plan.files.length + '건 — many/ 는 조사까지만)');
        var res = await window.nasMigrate.run(plan);
        check('실패 0건', res.failed === 0, JSON.stringify(res.errors.slice(0, 2)));
        check('옮긴 건수 = 계획 건수', res.copied === plan.files.length,
              res.copied + '/' + plan.files.length);
        var gotBin = await nasGet(DIR + '/bin.enc');
        var same = gotBin && new Uint8Array(gotBin).every(function (v, i2) { return v === bin[i2]; })
                   && gotBin.byteLength === bin.length;
        check('이진 파일이 **바이트 그대로**', !!same, gotBin ? (gotBin.byteLength + 'B') : '없음');
        var gotKo = await nasGet(DIR + '/개발9팀/한글 프로젝트.json');
        check('한글 이름·내용 그대로', gotKo && new TextDecoder().decode(gotKo) === '{"team":9,"한":"글"}');
        var gotDup = await nasGet(DIR + '/개발9팀/dup.json');
        check('겹친 이름은 최신 내용', gotDup && new TextDecoder().decode(gotDup) === '{"new":true}');

        out('\n== ⑦ 대조 ==');
        var v = await window.nasMigrate.verify(plan);
        check('전부 확인됨', v.ok === v.total && !v.missing.length && !v.sizeDiff.length,
              v.ok + '/' + v.total);

        out('\n== ④ 다시 돌리면 전부 건너뛴다 (멱등·재개) ==');
        var res2 = await window.nasMigrate.run(plan);
        check('옮긴 것 0건', res2.copied === 0, '옮김 ' + res2.copied);
        check('건너뛴 것 = 전체', res2.skipped === plan.files.length,
              res2.skipped + '/' + plan.files.length);

        out('\n== ⑤ 크기가 다르면 다시 옮긴다 ==');
        await realFetch(BK + '/nas/app/put', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rel: DIR + '/a.json', text: '짧게 바꿔치기' })
        });
        var res3 = await window.nasMigrate.run(plan);
        check('바뀐 1건만 다시 옮긴다', res3.copied === 1, '옮김 ' + res3.copied);
        var gotA = await nasGet(DIR + '/a.json');
        check('원래 내용으로 되돌아왔다', gotA && new TextDecoder().decode(gotA) === '{"n":1}');

        out('\n== ⑨ 🗺 id 지도 — 밀려난 중복 id 까지 들어가야 한다 ==');
        // ⚠️⚠️ 실데이터에서 잡혔다: Drive 에 같은 이름 파일이 둘이면 하나만 옮겨지는데,
        //    **밀려난 id 를 들고 있는 데이터**가 NAS 모드에서 "모르는 파일 id" 로 막힌다.
        //    (project_index 의 프로젝트 한 건이 정확히 그랬다)
        // ⚠⚠ 진짜 지도(`App_Config/nas_id_map.json`)를 건드리지 않는다 —
        //    검증용 경로에 쓴다. 예전엔 이걸 안 나눠 **진짜 1,498건을 4건으로 덮어썼다.**
        var MAP_PROBE = DIR + '/_id_map_probe.json';
        var mapN = await window.nasMigrate.writeIdMap(plan, MAP_PROBE);
        var mj = await (await realFetch(BK + '/nas/app/get?rel=' + encodeURIComponent(MAP_PROBE))).json();
        check('지도가 NAS 에 저장됐다', mj && mj.map && Object.keys(mj.map).length === mapN,
              mapN + '건');
        check('살아남은 쪽(x5)이 제 경로로', mj.map['x5'] === DIR + '/개발9팀/dup.json', mj.map['x5']);
        check('**밀려난 쪽(x4)도 같은 파일을 가리킨다**', mj.map['x4'] === DIR + '/개발9팀/dup.json',
              mj.map['x4'] || '없음 — 이러면 그 id 를 쓰던 데이터가 막힌다');
        check('이진 파일도 지도에', mj.map['x2'] === DIR + '/bin.enc', mj.map['x2']);

        out('\n== ⑧ NAS 모드에서는 거부한다 ==');
        // ⚠️ NAS 모드면 Drive 호출이 어댑터에 가로채여 "NAS 에서 읽어 NAS 에 쓰기"가 된다 —
        //    아무 일도 안 하고 성공해 버리는 자리라 **막아야** 한다.
        localStorage.setItem('gantt_storage_backend', 'nas');
        var refused = false;
        try { await window.nasMigrate.run(plan); } catch (e) { refused = /NAS 모드/.test(String(e.message)); }
        localStorage.removeItem('gantt_storage_backend');
        check('NAS 모드면 거부', refused);

    } catch (e) {
        bad++; out('  ❌ 예외: ' + ((e && e.message) || e)); console.error(e);
    } finally {
        restore();
        out('\n== 뒷정리 ==');
        try {
            var r = await realFetch(BK + '/nas/app/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rel: DIR })
            });
            var j = await r.json();
            check('검증 폴더 삭제(확인까지)', !!j.verified, j.message || '');
        } catch (e2) {
            out('  ⚠️ ' + DIR + ' 을 직접 지워주세요: ' + ((e2 && e2.message) || e2));
        }
        out('\n통과 ' + ok + ' · 실패 ' + bad);
        out('⚠️ 가짜 Drive 는 되돌렸지만, 깨끗하게 하려면 새로고침하세요.');
    }
})();
