/* 🔀 저장소 어댑터 — **앱이 실제로 지나는 경로**로 검증
   (앱을 열고 브라우저 콘솔에 이 파일을 붙여넣어 실행)

왜 이게 따로 있나: tests/storage-adapter.test.js 는 **번역기만** 본다.
  정작 깨지는 건 늘 연결부였다(2026-10-29 칩 표 사고: 렌더러만 돌려 보고 "된다"고 보고했는데
  루프→calls→부착부 연결이 끊겨 있었다). 여기서는 앱이 쓰는 그대로
  `gapi.client.drive.files.list` 와 `fetch('https://www.googleapis.com/…')` 를 불러서
  NAS 까지 갔다 오는지 확인한다. 가짜는 **바깥 경계에 없다** — 백엔드도 NAS 도 진짜다.

전제:
  ① 백엔드가 돌고 있고 `/nas/paths` 가 200 (구버전이면 404 → 재시작 필요)
  ② NAS 로그인 저장됨(`python nas_set_login.py`) + 앱 루트 지정됨(`python nas_set_root.py --root …`)
  ③ 이 페이지가 **NAS 모드**로 떠 있어야 한다:
       localStorage.setItem('gantt_storage_backend','nas'); location.reload();
     (안 켠 상태로 실행하면 그 사실을 먼저 알려주고 멈춘다 — Drive 에 쓰지 않는다)

⚠️ 검증 파일은 앱 루트 아래 `_adapter_probe/` 안에만 만들고 **끝나면 지운다**(실패해도).
⚠️ 앱의 실제 데이터 파일은 **읽지도 쓰지도 않는다.**
*/
(async function () {
    'use strict';
    var DIR = '_adapter_probe';
    var ok = 0, bad = 0;
    var log = [];
    function out(s) { log.push(s); console.log(s); }
    function check(label, cond, detail) {
        if (cond) { ok++; out('  ✅ ' + label + (detail ? ' · ' + detail : '')); }
        else { bad++; out('  ❌ ' + label + (detail ? ' · ' + detail : '')); }
        return cond;
    }

    var SA = window.STORAGE_ADAPTER;
    if (!SA) { out('❌ js/57-storage-adapter.js 가 안 떠 있습니다 (캐시일 수 있음 — Ctrl+Shift+R)'); return; }
    out('어댑터 v' + SA.version + ' · backend=' + SA.backend + ' · installed=' + SA.installed);
    if (!SA.installed) {
        out('⚠️ NAS 모드가 아닙니다. 이대로 돌리면 **진짜 Drive 에 쓰게 되므로** 멈춥니다.');
        out('   켜고 새로고침 후 다시 실행하세요:');
        out("   localStorage.setItem('gantt_storage_backend','nas'); location.reload();");
        return;
    }

    out('\n== ⓪ 백엔드 · NAS 가 준비됐나 ==');
    // ⚠️ "안 돌고 있다" 와 "돌지만 구버전" 은 **다른 고장**이다. 처음엔 둘을 한 덩어리로
    //    묶어 404(구버전)에도 "백엔드에 못 붙었습니다"라고 말했다 — 사람을 엉뚱한 곳으로 보낸다.
    //    (실제로 이 검증을 처음 돌렸을 때 그 오진이 나왔다)
    var paths = null, res = null;
    try {
        res = await fetch('http://127.0.0.1:5000/nas/paths');
    } catch (e) {
        out('  ❌ 백엔드가 안 돌고 있습니다 (연결 실패: ' + (e.message || e) + ')');
        out('     → kortek_backend.bat 을 실행하세요.');
        return;
    }
    if (res.status === 404) {
        out('  ❌ 백엔드는 돌고 있지만 **구버전입니다** — /nas/* 라우트가 없습니다(HTTP 404).');
        out('     → 재시작하세요: kortek_backend.bat (창을 닫고 다시 실행)');
        return;
    }
    try { paths = await res.json(); }
    catch (e) {
        out('  ❌ /nas/paths 응답이 JSON 이 아닙니다 (HTTP ' + res.status + '): ' + (e.message || e));
        return;
    }
    if (!check('/nas/paths 200 + configured', !!(paths && paths.configured),
               (paths && (paths.message || paths.root)) || ('HTTP ' + res.status))) {
        out('     → configured:false 면 앱 루트가 아직 안 정해진 것입니다:');
        out('        python nas_set_root.py --list   그리고   python nas_set_root.py --root "<경로>"');
        return;
    }
    out('     root=' + paths.root + ' · 팀 분리=' + paths.teamSeparate);

    var ROOT = SA._fn.rootId();
    var probeDirId = SA._fn.idOf(DIR, true);
    var tok = 'p' + Date.now();

    try {
        out('\n== ① 앱이 쓰는 그대로: fetch 로 만들기(multipart) ==');
        // js/04b 가 조립하는 모양 그대로 — 여기서 모양을 바꾸면 검증 가치가 없다.
        var bd = 'probe_boundary';
        var meta = { name: tok + '.json', mimeType: 'application/json', parents: [probeDirId] };
        var content = JSON.stringify({ 안녕: '하세요', tok: tok, n: 1 });
        var body = '\r\n--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
                   JSON.stringify(meta) +
                   '\r\n--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + content +
                   '\r\n--' + bd + '--';
        var up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer nas', 'Content-Type': 'multipart/related; boundary="' + bd + '"' },
            body: body
        });
        var created = await up.json();
        check('업로드가 Drive 모양으로 성공 응답', up.ok && !!created.id,
              up.status + ' · ' + (created.id || JSON.stringify(created).slice(0, 120)));
        if (!created.id) throw new Error('업로드 실패 — 이후 검증을 못 합니다');

        out('\n== ② 같은 id 로 내용 읽기 (alt=media) ==');
        var dl = await fetch('https://www.googleapis.com/drive/v3/files/' + created.id + '?alt=media', {
            headers: { 'Authorization': 'Bearer nas' }
        });
        var got = await dl.text();
        check('읽은 내용이 **한 글자도 안 틀린다**', got === content,
              got === content ? '' : '받은 값: ' + got.slice(0, 120));

        out('\n== ③ 앱이 쓰는 그대로: gapi.client.drive.files.list ==');
        var lst = await gapi.client.drive.files.list({
            q: "mimeType='application/json' and trashed=false and '" + probeDirId + "' in parents",
            fields: 'files(id, name, modifiedTime, appProperties)',
            orderBy: 'modifiedTime desc'
        });
        var names = (lst.result.files || []).map(function (f) { return f.name; });
        check('목록에 방금 쓴 파일이 보인다', names.indexOf(tok + '.json') >= 0, names.join(', '));
        var mine = (lst.result.files || []).filter(function (f) { return f.name === tok + '.json'; })[0];
        check('목록의 id 가 ②에서 쓴 id 와 같다', mine && mine.id === created.id);
        check('modifiedTime 이 ISO 로 온다', !!(mine && /^\d{4}-\d\d-\d\dT/.test(mine.modifiedTime)),
              mine && mine.modifiedTime);

        out('\n== ④ 덮어쓰기 (PATCH + multipart) — 원자적 교체 ==');
        var content2 = JSON.stringify({ 안녕: '또 왔습니다', tok: tok, n: 2, pad: '가'.repeat(300) });
        var body2 = '\r\n--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
                    JSON.stringify({ name: tok + '.json' }) +
                    '\r\n--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + content2 +
                    '\r\n--' + bd + '--';
        var pt = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + created.id +
                             '?uploadType=multipart&supportsAllDrives=true', {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer nas', 'Content-Type': 'multipart/related; boundary="' + bd + '"' },
            body: body2
        });
        check('PATCH 성공', pt.ok, String(pt.status));
        var got2 = await (await fetch('https://www.googleapis.com/drive/v3/files/' + created.id + '?alt=media')).text();
        check('새 내용으로 바뀜', got2 === content2);
        check('옛 내용이 안 섞임', got2.indexOf('"n":1') < 0);

        out('\n== ⑤ 폴더 조회 — 하위 폴더가 Drive 폴더로 보이나 ==');
        var fl = await gapi.client.drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder' and '" + ROOT + "' in parents and trashed=false",
            fields: 'files(id, name)'
        });
        var fnames = (fl.result.files || []).map(function (f) { return f.name; });
        check('앱 루트 하위 폴더 목록이 온다', fnames.indexOf(DIR) >= 0, fnames.join(', '));

        out('\n== ⑥ 없는 파일 — 조용히 빈 값을 주지 않는다 ==');
        var miss = await fetch('https://www.googleapis.com/drive/v3/files/' +
                               SA._fn.idOf(DIR + '/없는파일zzz.json', false) + '?alt=media');
        check('404 로 떨어진다', miss.status === 404, 'HTTP ' + miss.status);

        out('\n== ⑦ 모르는 질의는 **신고**한다 (조건을 덜 걸고 전건을 주지 않는다) ==');
        var weird = await fetch('https://www.googleapis.com/drive/v3/files?q=' +
                                encodeURIComponent("fullText contains 'x' and '" + ROOT + "' in parents"));
        var wj = await weird.json();
        check('오류로 돌려준다', !weird.ok && !!(wj.error && /못 읽는/.test(wj.error.message)),
              (wj.error && wj.error.message) || String(weird.status));

        out('\n== ⑧ 삭제 ==');
        var del = await fetch('https://www.googleapis.com/drive/v3/files/' + created.id, { method: 'DELETE' });
        check('DELETE 204', del.status === 204, 'HTTP ' + del.status);
        var after = await gapi.client.drive.files.list({
            q: "'" + probeDirId + "' in parents and trashed=false", fields: 'files(id, name)'
        });
        check('지운 파일이 목록에서 사라졌다',
              (after.result.files || []).every(function (f) { return f.name !== tok + '.json'; }));

    } catch (e) {
        bad++;
        out('  ❌ 예외: ' + (e && e.message || e));
        console.error(e);
    } finally {
        out('\n== 뒷정리 ==');
        try {
            var r = await fetch('http://127.0.0.1:5000/nas/app/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rel: DIR })
            });
            var j = await r.json();
            check('검증 폴더 삭제(확인까지)', !!j.verified, j.message || '');
        } catch (e2) {
            out('  ⚠️ 검증 폴더를 못 지웠습니다 — 앱 루트의 ' + DIR + ' 을 직접 지워주세요: ' + (e2.message || e2));
        }
        out('\n통과 ' + ok + ' · 실패 ' + bad);
        out('어댑터 호출 기록 마지막 10건:');
        (SA.log() || []).slice(-10).forEach(function (e3) {
            out('   ' + e3.kind + ' · ' + (typeof e3.detail === 'string' ? e3.detail : JSON.stringify(e3.detail)));
        });
        out('⚠️ 끝났으면 Drive 로 되돌리세요:' +
            " localStorage.removeItem('gantt_storage_backend'); location.reload();");
    }
    window._adapterProbeLog = log.join('\n');
})();
