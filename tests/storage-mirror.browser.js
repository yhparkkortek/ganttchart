/* 🪞 미러 쓰기 검증 — Drive 는 경계에서만 가짜, NAS 는 진짜
   (앱을 열고 브라우저 콘솔에 붙여넣어 실행)

전제:
  ① 백엔드가 돌고 `/nas/app/*` 가 살아 있다(구버전이면 404)
  ② 이 페이지가 **미러 모드**여야 한다:
       localStorage.setItem('gantt_storage_backend','mirror'); location.reload();

왜 가짜를 쓰나: 미러는 "Drive 에 쓸 때 NAS 에도 쓴다"라서 Drive 응답이 있어야 돈다.
  그런데 Drive 는 구글 로그인 없이 못 부른다. **그렇다고 검증을 건너뛰면 안 된다** —
  가짜는 **바깥 경계(Drive)에만** 두고 안쪽(경로 해석·줄 세우기·NAS 쓰기)은 진짜로 돌린다.
  NAS 는 진짜다 — 이 검증이 끝나면 **파일이 실제로 NAS 에 올라가 있다**(그걸 확인한다).

확인하는 것:
  ① Drive 응답이 **손대지 않은 채** 그대로 앱에 간다 (본문까지)
  ② 만들기/덮어쓰기가 NAS 에 그대로 간다
  ③ Drive 가 실패하면 미러하지 않는다
  ④ NAS 가 실패해도 **앱은 성공을 받는다** (불변식)
  ⑤ 앱 폴더 밖 파일은 건너뛴다(고장이 아니다)
  ⑥ 같은 파일 연속 저장이 **순서대로** 간다 (자동저장 + 수동저장 충돌)
  ⑦ 삭제가 NAS 에도 간다

⚠️ `_adapter_mirror/` 안에만 만들고 끝나면 지운다(실패해도).
⚠️ 끝나면 반드시 새로고침할 것 — 가짜 Drive 가 남아 있다.
*/
(async function () {
    'use strict';
    var DIR = '_adapter_mirror';
    var BK = 'http://127.0.0.1:5000';
    var ok = 0, bad = 0;
    function out(s) { console.log(s); }
    function check(label, cond, detail) {
        if (cond) { ok++; out('  ✅ ' + label + (detail ? ' · ' + detail : '')); }
        else { bad++; out('  ❌ ' + label + (detail ? ' · ' + detail : '')); }
        return cond;
    }

    var SA = window.STORAGE_ADAPTER;
    if (!SA) { out('❌ js/57 가 안 떠 있습니다 (Ctrl+Shift+R)'); return; }
    if (SA.mode !== 'mirror') {
        out('⚠️ 미러 모드가 아닙니다 (지금: ' + (SA.mode || SA.backend) + '). 켜고 새로고침하세요:');
        out("   localStorage.setItem('gantt_storage_backend','mirror'); location.reload();");
        return;
    }
    out('어댑터 v' + SA.version + ' · mode=' + SA.mode);

    var realFetch = window.fetch.bind(window);   // 지금은 미러 래퍼. 백엔드 확인에만 쓴다.
    var pr = await (await realFetch(BK + '/nas/paths')).json().catch(function () { return {}; });
    if (!check('/nas/paths configured', !!pr.configured, pr.root || pr.message || '')) {
        out('   → 백엔드를 재시작했는지 확인하세요.');
        return;
    }

    // ── 가짜 Drive — **경계 하나뿐** ───────────────────────────────────────
    // 앱 폴더 구조를 흉내 낸다. 루트 id 는 앱이 들고 있는 상수 그대로.
    var ROOT = SA._fn.rootId();
    var TEAM_ID = 'driveFolder_team3';
    var OUTSIDE_ID = 'driveFolder_outside';   // 앱 루트로 안 이어지는 폴더
    var files = {};                           // driveId -> {name, parents}
    files[TEAM_ID] = { name: '개발3팀', parents: [ROOT], mimeType: 'application/vnd.google-apps.folder' };
    files[OUTSIDE_ID] = { name: '남의폴더', parents: [], mimeType: 'application/vnd.google-apps.folder' };

    var driveCalls = [];
    var failNextWrite = false;          // ③ Drive 실패를 만들 때
    function j(o, status) {
        return new Response(JSON.stringify(o), { status: status || 200,
                                                 headers: { 'Content-Type': 'application/json' } });
    }
    function fakeDrive(input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (url.indexOf('googleapis.com') < 0) return realFetch(input, init);   // NAS·그 외는 진짜
        var method = String((init && init.method) || 'GET').toUpperCase();
        driveCalls.push(method + ' ' + url);
        var m = /drive\/v3\/files\/([^/?#]+)/.exec(url);
        var id = m ? decodeURIComponent(m[1]) : '';
        if (method === 'GET' && id && /fields=name,parents/.test(url)) {
            if (!files[id]) return Promise.resolve(j({ error: { message: 'not found' } }, 404));
            return Promise.resolve(j(files[id]));
        }
        if (failNextWrite) { failNextWrite = false; return Promise.resolve(j({ error: { message: 'boom' } }, 500)); }
        if (method === 'DELETE') { delete files[id]; return Promise.resolve(new Response(null, { status: 204 })); }
        // 만들기/덮어쓰기 — 앱이 받는 **진짜 Drive 모양** 응답
        var newId = id || ('driveFile_' + Object.keys(files).length + '_' + Date.now());
        return Promise.resolve(j({ id: newId, name: 'ok', kind: 'drive#file' }));
    }
    SA.mirror._reinstall(fakeDrive);
    out('   (Drive 를 경계에서 가짜로 바꿨습니다 — NAS 는 진짜입니다)');

    function mp(meta, content) {
        var b = 'mirror_b';
        return {
            ctype: 'multipart/related; boundary="' + b + '"',
            body: '\r\n--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
                  JSON.stringify(meta) +
                  '\r\n--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + content +
                  '\r\n--' + b + '--'
        };
    }
    function upload(meta, content, fileId) {
        var p = mp(meta, content);
        var u = 'https://www.googleapis.com/upload/drive/v3/files' +
                (fileId ? '/' + fileId : '') + '?uploadType=multipart&supportsAllDrives=true';
        return fetch(u, { method: fileId ? 'PATCH' : 'POST',
                          headers: { Authorization: 'Bearer x', 'Content-Type': p.ctype },
                          body: p.body });
    }
    async function nasRead(rel) {
        var r = await realFetch(BK + '/nas/app/get?rel=' + encodeURIComponent(rel));
        return r.ok ? await r.text() : null;
    }

    try {
        out('\n== ① Drive 응답을 손대지 않고 그대로 돌려주는가 ==');
        var c1 = JSON.stringify({ 안녕: '하세요', n: 1 });
        var res1 = await upload({ name: 'm1.json', mimeType: 'application/json', parents: [TEAM_ID] }, c1);
        var body1 = await res1.json();
        check('앱이 Drive 의 성공 응답을 받는다', res1.ok && !!body1.id, body1.id || ('HTTP ' + res1.status));
        check('본문을 어댑터가 안 먹었다 (clone 을 쓴다)', body1.kind === 'drive#file', JSON.stringify(body1));

        out('\n== ② 그 사이 NAS 에도 같이 쓰였는가 ==');
        await SA.mirror.drain();
        var rel1 = '개발3팀/m1.json';
        var got1 = await nasRead(rel1);
        check('NAS 에 같은 내용이 올라갔다', got1 === c1, got1 === null ? '없음' : (got1 || '').slice(0, 60));

        out('\n== ③ Drive 가 실패하면 미러하지 않는다 ==');
        var before = SA.mirror.stats().ok;
        failNextWrite = true;
        var resF = await upload({ name: 'm_fail.json', mimeType: 'application/json', parents: [TEAM_ID] }, '{"x":1}');
        await SA.mirror.drain();
        check('Drive 실패가 그대로 전달된다', !resF.ok, 'HTTP ' + resF.status);
        check('NAS 엔 안 썼다', (await nasRead('개발3팀/m_fail.json')) === null);
        check('성공 카운터가 안 늘었다', SA.mirror.stats().ok === before);

        out('\n== ④ NAS 쪽이 실패해도 앱은 성공을 받는다 (불변식) ==');
        // NAS 만 깨뜨린다 — 이름에 상위참조를 넣으면 경로 가드가 거절한다(Drive 는 받아 준다).
        var failBefore = SA.mirror.stats().fail;
        var resN = await upload({ name: '../밖으로.json', mimeType: 'application/json',
                                  parents: [TEAM_ID] }, '{"x":1}');
        await SA.mirror.drain();
        check('앱은 성공을 받는다', resN.ok, 'HTTP ' + resN.status);
        check('미러는 실패로 셌다(조용히 넘어가지 않는다)', SA.mirror.stats().fail > failBefore,
              '· fail=' + SA.mirror.stats().fail);
        failBefore = SA.mirror.stats().fail;

        out('\n== ⑤ 앱 폴더 밖 파일은 건너뛴다 (고장이 아니다) ==');
        var skipBefore = SA.mirror.stats().skip;
        var resO = await upload({ name: 'outside.json', mimeType: 'application/json',
                                  parents: [OUTSIDE_ID] }, '{"x":1}');
        await SA.mirror.drain();
        check('앱은 그대로 성공', resO.ok, 'HTTP ' + resO.status);
        check('건너뜀으로 센다(실패 아님)', SA.mirror.stats().skip > skipBefore,
              JSON.stringify(SA.mirror.stats()));
        check('실패 카운터는 안 늘었다', SA.mirror.stats().fail === failBefore,
              '· fail=' + SA.mirror.stats().fail);

        out('\n== ⑥ 같은 파일 연속 저장 — 순서가 안 뒤집히는가 ==');
        out('   (자동저장 1분 + 수동 저장이 겹치는 상황. 기다리지 않고 쏘므로 줄을 세워야 한다)');
        var fid = body1.id;
        files[fid] = { name: 'm1.json', parents: [TEAM_ID], mimeType: 'application/json' };
        var last = null, shots = [];
        for (var i = 2; i <= 6; i++) {
            last = JSON.stringify({ 안녕: '하세요', n: i });
            shots.push(upload({ name: 'm1.json' }, last, fid));   // 겹쳐서 쏜다
        }
        // ⚠️ 앱이 하는 만큼만 기다린다 — **Drive 응답까지**. 미러는 그 뒤에 줄을 서므로
        //    순서 검증은 그대로 유효하다.
        //    (처음엔 이것도 안 기다리고 바로 drain 했는데, 그땐 아직 줄에 **등록도 안 된**
        //     상태라 drain 이 즉시 끝나 "안 써졌다"는 가짜 실패가 났다 — 하네스 버그였다)
        await Promise.all(shots);
        await SA.mirror.drain();
        var got6 = await nasRead(rel1);
        check('마지막에 쓴 값이 **마지막으로** 남는다', got6 === last,
              got6 === last ? 'n=6' : '받은 값: ' + (got6 || '없음').slice(0, 70));

        out('\n== ⑦ 삭제도 NAS 에 간다 ==');
        var resD = await fetch('https://www.googleapis.com/drive/v3/files/' + fid, { method: 'DELETE' });
        await SA.mirror.drain();
        check('앱은 204 를 받는다', resD.status === 204, 'HTTP ' + resD.status);
        check('NAS 에서도 사라졌다', (await nasRead(rel1)) === null);

        out('\n== 미러 상태 ==');
        out('   ' + JSON.stringify(SA.mirror.stats()));
        check('대기 중인 미러가 없다', SA.mirror.stats().pending === 0);

    } catch (e) {
        bad++; out('  ❌ 예외: ' + ((e && e.message) || e)); console.error(e);
    } finally {
        out('\n== 뒷정리 ==');
        for (var rel of ['개발3팀/m1.json', '개발3팀/nas_x.json', '개발3팀/m_fail.json']) {
            try {
                await realFetch(BK + '/nas/app/delete', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rel: rel })
                });
            } catch (e2) { /* 없으면 그만 */ }
        }
        out('  ✅ 검증 파일 정리 시도 완료 (' + DIR + ' 은 쓰지 않았습니다)');
        out('\n통과 ' + ok + ' · 실패 ' + bad);
        out('⚠️ 가짜 Drive 가 아직 걸려 있습니다 — **새로고침**하세요.');
        out("⚠️ Drive 로 되돌리려면: localStorage.removeItem('gantt_storage_backend'); location.reload();");
    }
})();
