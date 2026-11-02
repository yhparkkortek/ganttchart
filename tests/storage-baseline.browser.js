// 📏 저장소 기준선 실측 — Drive 대 NAS, **같은 자리(브라우저)에서** 잰다.
//
// 쓰는 법: 앱을 열고 → 구글 드라이브 연동 → 백엔드 실행 → F12 콘솔에 이 파일 전체를 붙여넣기.
//          끝나면 표가 찍히고 `window._sbResult` 에 JSON 이 남는다(클립보드에도 복사 시도).
//
// 왜 브라우저에서 재나: 실제 사용자가 지나는 경로가 브라우저다. 백엔드만 따로 재면
//   (tests/storage-baseline.py) fetch 비용·브라우저 큐가 빠져 NAS 쪽이 실제보다 좋게 나온다.
//   양쪽을 같은 자리에서 같은 크기로 재야 비교가 성립한다. (CLAUDE.md: 근거는 실측뿐)
//
// ⚠️ 이사 **전에** 돌려야 의미가 있다 — 이사 뒤에는 Drive 수치를 다시 뽑을 수 없다.
// ⚠️ 쓰기 측정은 임시파일 1개를 올렸다 **바로 지운다**. Drive 쪽 이름은 `백업_` 으로 시작해서
//    프로젝트 목록 필터(js/04b `_listProjectFiles`)에 안 걸린다 — 남의 화면에 프로젝트로
//    보이는 일이 없다. 삭제는 finally 에서 반드시 한다.
// ⚠️ 읽기 측정은 **기존 파일을 읽기만** 한다. 데이터를 건드리지 않는다.
(async function () {
    'use strict';

    var N_META = 5;     // 목록 조회 반복
    var N_IO = 5;       // 읽기/쓰기 반복
    var TMP_DRIVE = '백업_baseline_tmp_delete_me.json';
    var TMP_NAS = '_baseline_tmp_delete_me.json';
    var NAS_FOLDER = 'PROJECT LIST';
    var B = 'http://127.0.0.1:5000';

    var R = { at: new Date().toISOString(), drive: {}, nas: {}, note: [] };

    function med(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length / 2)]; }
    function mn(xs) { return Math.min.apply(null, xs); }
    function mx(xs) { return Math.max.apply(null, xs); }

    async function bench(label, fn, n) {
        var xs = [];
        for (var i = 0; i < n; i++) {
            var t = performance.now();
            await fn();
            xs.push(performance.now() - t);
        }
        var o = { min: +mn(xs).toFixed(1), median: +med(xs).toFixed(1), max: +mx(xs).toFixed(1), n: n };
        console.info('  %s  n=%d  min %sms · 중앙 %sms · 최대 %sms', label, n, o.min, o.median, o.max);
        return o;
    }

    // ── 사전 점검 ─────────────────────────────────────────────────────────
    var tok = null;
    try { tok = gapi.client.getToken(); } catch (e) { /* 미연동 */ }
    var token = tok && tok.access_token;
    var folderId = (typeof SHARED_FOLDER_ID !== 'undefined') ? SHARED_FOLDER_ID : null;
    if (!token) { R.note.push('Drive 미연동 — Drive 측정 건너뜀(연동하고 다시 돌리세요)'); }
    if (!folderId) { R.note.push('SHARED_FOLDER_ID 를 못 찾음 — Drive 쓰기 측정 건너뜀'); }

    var nasOk = false;
    try {
        var c = await (await fetch(B + '/doc/config')).json();
        nasOk = !!(c && c.ok && c.reachable);
        if (!nasOk) R.note.push('NAS 경로 접근 불가(사내망/권한) — NAS 측정 건너뜀');
    } catch (e) { R.note.push('백엔드(5000) 미실행 — NAS 측정 건너뜀'); }

    console.info('%c📏 저장소 기준선 실측 시작', 'font-weight:bold;font-size:13px');
    console.info('   Drive 연동 %s · NAS %s', token ? 'OK' : '없음', nasOk ? 'OK' : '없음');

    // ── ① 바닥값: localhost 왕복 (NAS 쪽 비용에서 빼야 하는 값) ───────────
    if (nasOk) {
        console.info('① 바닥값 — 백엔드 왕복(디스크 안 탐)');
        R.nas.floor = await bench('/health', function () { return fetch(B + '/health'); }, 10);
    }

    // ── ② 목록 조회 ───────────────────────────────────────────────────────
    var newest = null;
    if (token && window._listProjectFiles) {
        console.info('② 프로젝트 목록 — Drive (팀 폴더 병렬 쿼리, 실제 경로)');
        var files = [];
        R.drive.list = await bench('_listProjectFiles()', async function () {
            files = await window._listProjectFiles();
        }, N_META);
        R.drive.listCount = files.length;
        newest = files[0] || null;          // 수정시간 내림차순
        console.info('   프로젝트 %d개 · 최신 "%s"', files.length, newest && newest.name);
    }
    if (nasOk) {
        console.info('② 폴더 훑기 — NAS');
        R.nas.list = await bench('/doc/list', function () {
            return fetch(B + '/doc/list?folder=' + encodeURIComponent(NAS_FOLDER));
        }, N_META);
    }

    // ── ③ 읽기 ────────────────────────────────────────────────────────────
    var sizeBytes = 0;
    if (token && newest) {
        var url = 'https://www.googleapis.com/drive/v3/files/' + newest.id + '?alt=media&supportsAllDrives=true';
        var h = { Authorization: 'Bearer ' + token };
        var first = await fetch(url, { headers: h });
        var txt = await first.text();
        sizeBytes = new Blob([txt]).size;
        console.info('③ 읽기 — Drive · "%s" (%d KB)', newest.name, Math.round(sizeBytes / 1024));
        R.drive.read = await bench('files/{id}?alt=media', async function () {
            await (await fetch(url, { headers: h })).text();
        }, N_IO);
        R.drive.readKB = Math.round(sizeBytes / 1024);
        R.drive.readMBs = +(sizeBytes / 1048576 / (R.drive.read.median / 1000)).toFixed(2);
        console.info('   → %s MB/s', R.drive.readMBs);
    }
    if (nasOk) {
        // Drive 와 같은 크기로 비교하기 위해, 같은 크기의 임시파일을 올려 두고 그걸 읽는다.
        var padSize = sizeBytes || 280 * 1024;
        var blob = new Blob([JSON.stringify({ pad: 'a'.repeat(padSize) }).slice(0, padSize)],
                            { type: 'application/json' });
        R.nas.sizeKB = Math.round(blob.size / 1024);
        var put = function () {
            var fd = new FormData();
            fd.append('file', new File([blob], TMP_NAS, { type: 'application/json' }));
            return fetch(B + '/doc/put?folder=' + encodeURIComponent(NAS_FOLDER)
                         + '&name=' + encodeURIComponent(TMP_NAS) + '&overwrite=1',
                         { method: 'POST', body: fd });
        };
        try {
            await put();   // 측정 전 1회 — 읽기 대상 만들기
            console.info('③ 읽기 — NAS · 같은 크기(%d KB)', R.nas.sizeKB);
            R.nas.read = await bench('/doc/get', async function () {
                await (await fetch(B + '/doc/get?folder=' + encodeURIComponent(NAS_FOLDER)
                                   + '&name=' + encodeURIComponent(TMP_NAS))).text();
            }, N_IO);
            R.nas.readMBs = +(blob.size / 1048576 / (R.nas.read.median / 1000)).toFixed(2);
            console.info('   → %s MB/s', R.nas.readMBs);

            console.info('④ 쓰기 — NAS · %d KB', R.nas.sizeKB);
            R.nas.write = await bench('/doc/put', put, N_IO);
            R.nas.writeMBs = +(blob.size / 1048576 / (R.nas.write.median / 1000)).toFixed(2);
            console.info('   → %s MB/s', R.nas.writeMBs);
        } finally {
            var del = await (await fetch(B + '/doc/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: NAS_FOLDER, name: TMP_NAS })
            })).json();
            console.info('   NAS 임시파일 삭제: ok=%s', del && del.ok);
        }
    }

    // ── ④ 쓰기 — Drive (임시파일 생성 → 덮어쓰기 반복 → 삭제) ─────────────
    if (token && folderId) {
        var wSize = sizeBytes || 280 * 1024;
        var payload = JSON.stringify({ pad: 'a'.repeat(wSize) }).slice(0, wSize);
        var bnd = '-------baseline' + Date.now();
        var meta = { name: TMP_DRIVE, parents: [folderId], mimeType: 'application/json' };
        var multipart = '--' + bnd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
            + JSON.stringify(meta) + '\r\n--' + bnd
            + '\r\nContent-Type: application/json\r\n\r\n' + payload + '\r\n--' + bnd + '--';
        var tmpId = null;
        console.info('④ 쓰기 — Drive · %d KB (임시파일, 측정 후 삭제)', Math.round(wSize / 1024));
        try {
            var cRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + bnd + '"' },
                body: multipart
            });
            tmpId = (await cRes.json()).id;
            R.drive.createOnce = null;
            R.drive.write = await bench('upload files/{id}?uploadType=media', function () {
                return fetch('https://www.googleapis.com/upload/drive/v3/files/' + tmpId + '?uploadType=media&supportsAllDrives=true', {
                    method: 'PATCH',
                    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: payload
                });
            }, N_IO);
            R.drive.writeKB = Math.round(wSize / 1024);
            R.drive.writeMBs = +(wSize / 1048576 / (R.drive.write.median / 1000)).toFixed(2);
            console.info('   → %s MB/s', R.drive.writeMBs);
        } catch (e) {
            R.note.push('Drive 쓰기 측정 실패: ' + (e && e.message));
            console.warn('   Drive 쓰기 측정 실패:', e);
        } finally {
            if (tmpId) {
                try {
                    await fetch('https://www.googleapis.com/drive/v3/files/' + tmpId + '?supportsAllDrives=true',
                                { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
                    console.info('   Drive 임시파일 삭제 완료');
                } catch (e) { console.error('   ⚠️ Drive 임시파일 삭제 실패 — 공유 폴더에서 "%s" 를 직접 지워주세요', TMP_DRIVE); }
            }
        }
    }

    // ── 표 ────────────────────────────────────────────────────────────────
    var rows = [];
    function row(what, d, n, unit) { rows.push({ 항목: what, Drive: d, NAS: n, 단위: unit }); }
    row('목록 조회(중앙)', R.drive.list && R.drive.list.median, R.nas.list && R.nas.list.median, 'ms');
    row('읽기(중앙)', R.drive.read && R.drive.read.median, R.nas.read && R.nas.read.median, 'ms');
    row('읽기 처리량', R.drive.readMBs, R.nas.readMBs, 'MB/s');
    row('쓰기(중앙)', R.drive.write && R.drive.write.median, R.nas.write && R.nas.write.median, 'ms');
    row('쓰기 처리량', R.drive.writeMBs, R.nas.writeMBs, 'MB/s');
    row('백엔드 왕복 바닥값', '-', R.nas.floor && R.nas.floor.median, 'ms');
    console.table(rows);
    if (R.note.length) console.warn('확인 못 한 것:', R.note);

    window._sbResult = R;
    try { await navigator.clipboard.writeText(JSON.stringify(R, null, 2)); console.info('📋 결과 JSON 을 클립보드에 복사했습니다.'); }
    catch (e) { console.info('결과 JSON: window._sbResult (클립보드 복사는 실패)'); }
})();
