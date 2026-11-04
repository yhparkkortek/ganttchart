// ═══════════════════════════════════════════════════════════════════════════
// 📦 js/58-storage-migrate.js — Drive → NAS 일괄 이사
//
// 왜 필요한가: 어댑터를 `nas` 로 켜면 구글 로그인은 사라지지만, **데이터가 NAS 에 없으면
//   프로젝트가 0건으로 보인다.** 미러 쓰기는 "쓸 때만" 옮기므로 **아무도 안 여는 프로젝트는
//   영영 안 옮겨진다** — 이사를 끝내려면 결국 한 번은 통째로 복사해야 한다.
//
// ⚠️ 왜 브라우저에서 도는가: **Drive 토큰은 브라우저에만 있다.** 백엔드는 Drive 자격증명이
//   없다. 그래서 브라우저가 Drive 에서 읽어 로컬 백엔드(`/nas/app/put`)를 거쳐 NAS 에 쓴다.
//
// ⚠️⚠️ **Drive 는 절대 건드리지 않는다.** 읽기만 한다 — 지우지도, 고치지도, 옮기지도 않는다.
//    이사가 틀려도 원본이 그대로 있어야 되돌아갈 데가 있다.
// ⚠️ **멱등·재개 가능**해야 한다. 수백 건이면 중간에 끊긴다(네트워크·브라우저 종료).
//    다시 돌렸을 때 중복이 생기거나 멀쩡한 걸 덮어쓰면 안 된다 →
//    같은 이름+같은 크기면 **건너뛴다**.
// ⚠️ `nas` 모드에서는 **돌지 않는다.** 그 모드에선 Drive 호출이 어댑터에 가로채여
//    "Drive 에서 읽어 NAS 에 쓴다"가 "NAS 에서 읽어 NAS 에 쓴다"가 된다(아무 일도 안 한 채 성공).
// ⚠️ 이름이 겹치는 Drive 파일은 **조용히 합치지 않는다.** NAS 는 같은 경로 = 한 파일이라
//    나중 것이 앞의 것을 덮는다. 겹치면 신고하고 **가장 최근 것만** 복사한다.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var BK = 'http://127.0.0.1:5000';
    var FOLDER_MIME = 'application/vnd.google-apps.folder';
    var MAX_DEPTH = 5;              // 루트 → 팀 → Backups/팀 … 실제론 2~3단이면 끝난다
    var state = { running: false, abort: false };

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }

    function mode() {
        try { return (localStorage.getItem('gantt_storage_backend') || 'drive').toLowerCase(); }
        catch (e) { return 'drive'; }
    }

    function token() {
        try {
            var t = window.gapi && gapi.client && gapi.client.getToken && gapi.client.getToken();
            return (t && t.access_token) || null;
        } catch (e) { return null; }
    }

    function bytesToB64(buf) {
        var b = new Uint8Array(buf), s = '';
        for (var i = 0; i < b.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
        }
        return btoa(s);
    }

    function joinRel(parent, name) { return parent ? parent + '/' + name : name; }

    async function nasJson(method, route, payload) {
        var opts = { method: method };
        if (payload !== undefined && method !== 'GET') {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(payload);
        }
        var res;
        try { res = await fetch(BK + route, opts); }
        catch (e) { throw new Error(T('백엔드가 실행 중이 아닙니다 — kortek_backend.bat 을 실행해주세요.',
                                      'The backend is not running — start kortek_backend.bat.')); }
        if (res.status === 404) {
            throw new Error(T('백엔드가 구버전입니다 — 다시 실행해주세요.', 'The backend is outdated — restart it.'));
        }
        var j = null;
        try { j = await res.json(); } catch (e) { /* ignore */ }
        if (!res.ok || (j && j.ok === false)) {
            var err = new Error('NAS ' + route + ' (HTTP ' + res.status + '): ' + ((j && j.message) || '사유 없음'));
            err.status = res.status;
            throw err;
        }
        return j || {};
    }

    /** Drive 폴더 하나의 내용. 1,000건을 넘으면 페이지를 넘겨 전부 가져온다. */
    async function driveList(folderId) {
        var out = [], pageToken = null;
        do {
            var p = {
                q: "'" + folderId + "' in parents and trashed=false",
                fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
                pageSize: 1000, corpora: 'allDrives',
                includeItemsFromAllDrives: true, supportsAllDrives: true
            };
            if (pageToken) p.pageToken = pageToken;
            var r = await gapi.client.drive.files.list(p);
            out = out.concat(r.result.files || []);
            // ⚠️ 페이지를 안 넘기면 1,000건에서 **조용히 잘린다** — 이사에선 그게 곧 유실이다.
            pageToken = r.result.nextPageToken || null;
        } while (pageToken);
        return out;
    }

    /**
     * ① 조사 — Drive 앱 폴더를 훑어 "무엇을 옮겨야 하는지" 목록을 만든다.
     * 실제로 옮기지 않는다. 사람이 보고 결정할 수 있게 먼저 보여주려고 따로 뒀다.
     */
    async function scan(onStep) {
        if (!token()) throw new Error(T('구글 로그인이 필요합니다 — 먼저 Drive 에 연결해주세요.',
                                        'Google sign-in is required — connect to Drive first.'));
        var rootId = (typeof SHARED_FOLDER_ID !== 'undefined') ? SHARED_FOLDER_ID : null;
        if (!rootId) throw new Error('SHARED_FOLDER_ID 를 찾지 못했습니다.');

        var files = [], folders = [''], dups = [], deep = [];
        var queue = [{ id: rootId, rel: '', depth: 0 }];
        while (queue.length) {
            var cur = queue.shift();
            if (onStep) onStep(T('조사 중: ', 'Scanning: ') + (cur.rel || '/') + ' … ' + files.length + T('건', ''));
            var items = await driveList(cur.id);
            var seen = {};
            for (var i = 0; i < items.length; i++) {
                var f = items[i];
                if (f.mimeType === FOLDER_MIME) {
                    if (cur.depth + 1 > MAX_DEPTH) { deep.push(joinRel(cur.rel, f.name)); continue; }
                    folders.push(joinRel(cur.rel, f.name));
                    queue.push({ id: f.id, rel: joinRel(cur.rel, f.name), depth: cur.depth + 1 });
                    continue;
                }
                // 같은 폴더에 같은 이름이 둘 이상 — NAS 엔 한 자리뿐이다. 신고하고 최신만 남긴다.
                var key = f.name;
                if (seen[key]) {
                    dups.push({ rel: joinRel(cur.rel, f.name), ids: [seen[key].id, f.id] });
                    if ((f.modifiedTime || '') <= (seen[key].modifiedTime || '')) continue;
                    files = files.filter(function (x) { return x.id !== seen[key].id; });
                }
                seen[key] = f;
                files.push({ id: f.id, name: f.name, rel: joinRel(cur.rel, f.name),
                             size: f.size === undefined ? null : Number(f.size),
                             modifiedTime: f.modifiedTime, folderRel: cur.rel });
            }
        }
        var bytes = files.reduce(function (a, b) { return a + (b.size || 0); }, 0);
        return { files: files, folders: folders, duplicates: dups, tooDeep: deep,
                 totalBytes: bytes, byFolder: countByFolder(files) };
    }

    function countByFolder(files) {
        var m = {};
        files.forEach(function (f) {
            var k = f.folderRel || '(루트)';
            if (!m[k]) m[k] = { count: 0, bytes: 0 };
            m[k].count++; m[k].bytes += (f.size || 0);
        });
        return m;
    }

    /** NAS 쪽 현황을 **폴더당 한 번**만 묻는다 — 파일마다 물으면 고정비 61ms × N 이 된다. */
    async function nasIndex(folderRels, onStep) {
        var idx = {};
        for (var i = 0; i < folderRels.length; i++) {
            var rel = folderRels[i];
            if (onStep) onStep(T('NAS 확인: ', 'Checking NAS: ') + (rel || '/'));
            try {
                var j = await nasJson('GET', '/nas/app/list?rel=' + encodeURIComponent(rel));
                (j.items || []).forEach(function (it) {
                    if (!it.isdir) idx[joinRel(rel, it.name)] = (it.size === null || it.size === undefined) ? -1 : Number(it.size);
                });
            } catch (e) {
                // 아직 없는 폴더다(처음 이사). 오류가 아니다.
                if (!e.status || e.status === 403) idx['__missing__' + rel] = true;
            }
        }
        return idx;
    }

    /**
     * ② 복사 — 건너뛸 것과 옮길 것을 가르고 실제로 옮긴다.
     * `알아서 멱등`: 같은 이름 + 같은 크기면 건너뛴다. 그래서 다시 돌리면 이어서 간다.
     */
    async function run(plan, onStep) {
        if (state.running) throw new Error(T('이미 이사 중입니다.', 'A migration is already running.'));
        if (mode() === 'nas') {
            throw new Error(T('지금은 NAS 모드입니다 — 이사는 Drive 모드에서 돌려야 합니다(그래야 Drive 를 읽습니다).',
                              'You are in NAS mode — run the migration in Drive mode so Drive can be read.'));
        }
        state.running = true; state.abort = false;
        var t = token();
        var res = { copied: 0, skipped: 0, failed: 0, bytes: 0, errors: [] };
        try {
            var idx = await nasIndex(plan.folders, onStep);
            for (var i = 0; i < plan.files.length; i++) {
                if (state.abort) { res.aborted = true; break; }
                var f = plan.files[i];
                var pre = idx[f.rel];
                if (pre !== undefined && f.size !== null && pre === f.size) { res.skipped++; continue; }
                if (onStep) onStep('(' + (i + 1) + '/' + plan.files.length + ') ' + f.rel);
                try {
                    var dl = await fetch('https://www.googleapis.com/drive/v3/files/' +
                        encodeURIComponent(f.id) + '?alt=media&supportsAllDrives=true',
                        { headers: { Authorization: 'Bearer ' + t } });
                    if (!dl.ok) throw new Error('Drive 읽기 실패 HTTP ' + dl.status);
                    var buf = await dl.arrayBuffer();
                    // ⚠️ 반드시 b64 로 보낸다 — `.enc` 같은 **이진 파일**이 섞여 있고,
                    //    텍스트로 보내면 조용히 깨진다(UTF-8 로 해석되면서 바이트가 바뀐다).
                    await nasJson('POST', '/nas/app/put', { rel: f.rel, b64: bytesToB64(buf) });
                    res.copied++; res.bytes += buf.byteLength;
                } catch (e) {
                    res.failed++;
                    res.errors.push({ rel: f.rel, why: String((e && e.message) || e) });
                    if (res.errors.length > 50) res.errors.push({ rel: '…', why: '(이하 생략)' });
                }
            }
        } finally {
            state.running = false;
        }
        return res;
    }

    /**
     * ③ 대조 — 옮긴 뒤 **정말 그 자리에 있는지** 센다.
     * "복사했다"는 응답은 증거가 아니다(2026-11-03에 그걸로 한 번 틀렸다).
     */
    async function verify(plan, onStep) {
        var idx = await nasIndex(plan.folders, onStep);
        var missing = [], sizeDiff = [];
        plan.files.forEach(function (f) {
            var got = idx[f.rel];
            if (got === undefined) { missing.push(f.rel); return; }
            if (f.size !== null && got >= 0 && got !== f.size) {
                sizeDiff.push({ rel: f.rel, drive: f.size, nas: got });
            }
        });
        return { total: plan.files.length, ok: plan.files.length - missing.length - sizeDiff.length,
                 missing: missing, sizeDiff: sizeDiff };
    }

    /**
     * ④ id 지도 — **옛 Drive 파일 id 를 그대로 살린다.**
     *
     * ⚠️⚠️ 이게 없으면 NAS 로 전환하는 순간 **조용히 틀린다.** 앱 데이터 안에 Drive 파일 id 가
     *    박혀 있기 때문이다 — 실측으로 **5,089곳**(프로젝트 파일 3,214 · TaskInbox 백업 1,862 ·
     *    project_index 13). 코드도 `drive_file_id === window.currentDriveFileId` 처럼 **같은지
     *    비교**하는 자리가 40곳 가까이다. id 체계가 바뀌면 그 비교가 전부 빗나가고,
     *    오류가 아니라 **메일 배분·보관함 배치·중복 검사가 조용히 안 맞는다.**
     *
     * 왜 데이터를 고쳐 쓰지 않았나: 5,089곳을 바꾸는 건 되돌리기 어렵고, Drive 로 돌아갈 길도
     *    같이 끊긴다. 대신 **id → 경로 지도**를 한 장 만들어 두면 옛 id 가 계속 통한다.
     *    어댑터가 이 지도를 읽어 ① 옛 id 를 경로로 풀고 ② 목록에도 **그 옛 id 를 그대로** 실어 준다.
     */
    var ID_MAP_REL = 'App_Config/nas_id_map.json';

    async function writeIdMap(plan) {
        var map = {};
        plan.files.forEach(function (f) { if (f.id) map[f.id] = f.rel; });
        var body = JSON.stringify({ version: 1, builtAt: new Date().toISOString(), map: map });
        await nasJson('POST', '/nas/app/put', { rel: ID_MAP_REL, text: body });
        return Object.keys(map).length;
    }

    function fmtBytes(n) {
        if (n < 1024) return n + 'B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
        return (n / 1024 / 1024).toFixed(1) + 'MB';
    }

    window.nasMigrate = {
        scan: scan, run: run, verify: verify, writeIdMap: writeIdMap, ID_MAP_REL: ID_MAP_REL,
        stop: function () { state.abort = true; },
        isRunning: function () { return state.running; },
        fmtBytes: fmtBytes
    };

    // ── 🔑 설정 모달에서 쓰는 진행 화면 ────────────────────────────────────
    //   ⚠️ 조사 결과를 **먼저 보여주고 사람이 확인한 뒤** 복사한다. 수백 건을 말없이
    //      옮기기 시작하면 무엇이 옮겨지는지 아무도 모른 채 끝난다.
    function esc0(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]; }); }

    function say(html, kind) {
        var el = document.getElementById('naslogin-status');
        if (!el) { console.log(String(html).replace(/<[^>]+>/g, '')); return; }
        el.style.display = 'block';
        el.style.color = kind === 'err' ? '#b1432f' : (kind === 'ok' ? '#1f7a3d' : '#555');
        el.innerHTML = html;
    }

    window.nasMigrateUI = async function () {
        if (state.running) { say('⏳ ' + T('이미 이사 중입니다.', 'Already running.'), ''); return; }
        try {
            if (mode() === 'nas') {
                say('⚠️ ' + T('지금은 NAS 모드라 Drive 를 읽을 수 없습니다. 이사는 Drive(또는 미러) 모드에서 하세요.',
                              'You are in NAS mode so Drive cannot be read. Run the migration in Drive (or mirror) mode.'), 'err');
                return;
            }
            say('⏳ ' + T('Drive 를 조사하는 중…', 'Scanning Drive…'), '');
            var plan = await scan(function (s) { say('⏳ ' + s, ''); });

            var lines = Object.keys(plan.byFolder).sort().map(function (k) {
                return '· ' + k + ' — ' + plan.byFolder[k].count + T('건', '') + ' / ' + fmtBytes(plan.byFolder[k].bytes);
            });
            var warn = '';
            if (plan.duplicates.length) {
                warn += '<br>⚠️ ' + T('이름이 겹치는 파일 ', 'Duplicate names: ') + plan.duplicates.length
                     + T('건 — 가장 최근 것만 옮깁니다.', ' — only the newest is copied.');
            }
            if (plan.tooDeep.length) {
                warn += '<br>⚠️ ' + T('너무 깊어 건너뛴 폴더 ', 'Folders skipped (too deep): ') + plan.tooDeep.length;
            }
            var msg = T('옮길 것: ', 'To copy: ') + '<b>' + plan.files.length + T('건', '') + ' / '
                    + fmtBytes(plan.totalBytes) + '</b><br>' + lines.join('<br>') + warn
                    + '<br><br>' + T('※ Drive 는 읽기만 합니다(지우거나 고치지 않습니다). 이미 같은 크기로 있는 파일은 건너뜁니다.',
                                     'Drive is only read. Files already present with the same size are skipped.');
            say(msg, '');
            if (!confirm(T('NAS 로 ' + plan.files.length + '건을 옮길까요?\n\n' +
                           'Drive 는 읽기만 하며 그대로 남습니다. 중간에 끊겨도 다시 눌러 이어서 할 수 있습니다.',
                           'Copy ' + plan.files.length + ' files to NAS?'))) {
                say(T('취소했습니다.', 'Cancelled.'), '');
                return;
            }

            var t0 = Date.now();
            var res = await run(plan, function (s) { say('⏳ ' + T('옮기는 중 ', 'Copying ') + s, ''); });
            say('⏳ ' + T('옮긴 뒤 대조하는 중…', 'Verifying…'), '');
            var v = await verify(plan, function (s) { say('⏳ ' + s, ''); });
            // ⚠ 대조가 끝나면 **항상** id 지도를 다시 써둔다 — 전부 건너뛰었을 때도.
            //   이게 없으면 NAS 모드에서 옛 Drive id 가 안 풀려 조용히 틀린다.
            var mapN = 0, mapErr = null;
            try { mapN = await writeIdMap(plan); }
            catch (e) { mapErr = String((e && e.message) || e); }

            var secs = Math.round((Date.now() - t0) / 1000);
            var ok = res.failed === 0 && v.missing.length === 0 && v.sizeDiff.length === 0;
            var out = (ok ? '✅ ' : '⚠️ ') + T('옮김 ', 'Copied ') + res.copied + T('건', '')
                    + ' · ' + T('건너뜀 ', 'skipped ') + res.skipped
                    + ' · ' + T('실패 ', 'failed ') + res.failed
                    + ' · ' + fmtBytes(res.bytes) + ' · ' + secs + T('초', 's')
                    + '<br>' + T('대조: ', 'Verify: ') + v.ok + '/' + v.total
                    + (v.missing.length ? ('<br>❌ ' + T('NAS 에 없음 ', 'missing ') + v.missing.length + T('건:<br>', ':<br>')
                                           + v.missing.slice(0, 5).map(function (x) { return '· ' + x; }).join('<br>')
                                           + (v.missing.length > 5 ? ('<br>… ' + (v.missing.length - 5) + T('건 더', ' more')) : '')) : '')
                    // ⚠️ 건수만 보여주면 **어느 파일인지 알 수가 없다** — 사람이 다음 수를 못 정한다.
                    //    실제로 1,498건 중 1건이 어긋났는데 화면엔 "1건"뿐이라 추적할 수가 없었다.
                    //    (대개는 **옮기는 동안 그 파일이 Drive 에서 또 저장된 것**이다 — 자동저장이 1분마다 돈다.
                    //     다시 누르면 크기가 다르니 그 1건만 새로 옮겨 간다)
                    + (v.sizeDiff.length ? ('<br>❌ ' + T('크기 다름 ', 'size differs ') + v.sizeDiff.length + T('건', '') + ':<br>'
                        + v.sizeDiff.slice(0, 5).map(function (x) {
                            return '· ' + x.rel + ' (Drive ' + fmtBytes(x.drive) + ' / NAS ' + fmtBytes(x.nas) + ')';
                        }).join('<br>')
                        + (v.sizeDiff.length > 5 ? ('<br>… ' + (v.sizeDiff.length - 5) + T('건 더', ' more')) : '')
                        + '<br>' + T('↻ <b>이사</b>를 다시 누르면 이 파일만 새로 옮깁니다(옮기는 중 Drive 에서 또 저장되면 생깁니다).',
                                     'Press <b>Migrate</b> again to re-copy just these.')) : '')
                    + (res.aborted ? ('<br>⏹ ' + T('중단됨 — 다시 누르면 이어서 합니다.', 'Stopped — press again to resume.')) : '')
                    + (mapErr
                        ? ('<br>❌ ' + T('id 지도를 못 썼습니다 — NAS 모드에서 옛 id 가 안 풀립니다: ',
                                        'Could not write the id map: ') + esc0(mapErr))
                        : ('<br>🗺 ' + T('옛 id 지도 ' + mapN + '건 저장 — 전환 후에도 옛 id 가 그대로 통합니다.',
                                        'Saved ' + mapN + ' legacy id mappings.')));
            if (res.errors.length) {
                out += '<br>' + res.errors.slice(0, 3).map(function (e) { return '· ' + e.rel + ' — ' + e.why; }).join('<br>');
            }
            say(out, ok ? 'ok' : 'err');
            console.log('[nas-migrate]', { result: res, verify: v });
        } catch (e) {
            say('⚠️ ' + String((e && e.message) || e), 'err');
            console.error('[nas-migrate]', e);
        }
    };
})();
