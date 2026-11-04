/* 🚦 NAS 전환 직후 점검 — 콘솔에 붙여넣고 Enter
   (`localStorage.setItem('gantt_storage_backend','nas'); location.reload();` 한 뒤)

왜 있나: 전환은 한 줄이지만 **틀렸을 때 조용하다.** 목록이 짧게 나오거나, 옛 id 가 안 풀리거나,
  쓰기만 막혀 있어도 앱은 평소처럼 보인다. 그래서 전환 직후에 **읽기·id·쓰기**를 한 번에 본다.

⚠️ 진짜 프로젝트 파일은 **읽기만** 한다 — 고치지 않는다.
⚠️ 쓰기는 `_cutover_check/` 안에만 하고 끝나면 지운다.
⚠️ 여기서 다 통과해도 **"앱에서 프로젝트를 고치고 저장"은 사람이 한 번 해 봐야 한다.**
   이 스크립트는 저장 경로가 살아 있다는 것까지만 말한다.
*/
(async function () {
    'use strict';
    var BK = 'http://127.0.0.1:5000';
    var DIR = '_cutover_check';
    var ok = 0, bad = 0, warn = 0;
    function out(s) { console.log(s); }
    function check(label, cond, detail) {
        if (cond) { ok++; out('  ✅ ' + label + (detail ? ' · ' + detail : '')); }
        else { bad++; out('  ❌ ' + label + (detail ? ' · ' + detail : '')); }
        return cond;
    }
    function note(label, detail) { warn++; out('  ⚠️ ' + label + (detail ? ' · ' + detail : '')); }

    out('════ NAS 전환 점검 ════');
    var SA = window.STORAGE_ADAPTER;
    if (!SA) { out('❌ js/57 이 안 떠 있습니다 — Ctrl+Shift+R 로 새로고침하세요.'); return; }
    if (!check('NAS 모드다', SA.mode === 'nas', '지금: ' + (SA.mode || SA.backend))) {
        out("   → localStorage.setItem('gantt_storage_backend','nas'); location.reload();");
        return;
    }
    var badge = document.getElementById('drive-conn-badge');
    // 🏷 [2026-11-04] 저장소가 하나뿐이라 배지는 **안 띄운다**(늘 같은 답이라 말할 가치가 없다).
    //    ⚠️ 중요한 건 "숨었다"가 아니라 **"드라이브라고 말하지 않는다"** 이다 — 그 자리를
    //       원래 함수(js/04b)가 다시 그려 "구글 드라이브 연결됨"이 되는 게 진짜 사고였다.
    check('헤더 배지를 숨긴다',
          !badge || getComputedStyle(badge).display === 'none',
          badge ? ('보임: ' + (badge.textContent || '(빈칸)')) : '(배지 없음)');
    check('배지가 드라이브라고 말하지 않는다',
          !badge || !/드라이브|Drive/.test((badge.title || '') + (badge.textContent || '')),
          badge ? ((badge.title || '') + ' / ' + (badge.textContent || '')) : '');

    // ⚠️ [2026-11-04 추가] **배지가 🗄️ 인데 버튼은 회색**이던 사고가 있었다.
    //    버튼 활성화가 구글 OAuth 성공 콜백 안에만 있어서 NAS 모드에선 한 번도 안 돌았다.
    //    `fetch` 로만 검증하면 절대 안 잡힌다 — 사람이 누르는 건 **버튼**이다.
    var gray = ['drive_load_btn', 'drive_save_btn', 'backup_restore_btn'].filter(function (id) {
        var b = document.getElementById(id);
        return b && b.disabled;      // 없는 버튼(구버전 HTML)은 통과시킨다
    });
    check('프로젝트 열기/저장/복원 버튼이 눌린다', gray.length === 0,
          gray.length ? ('회색: ' + gray.join(', ')) : '');

    out('\n── ① 백엔드·앱 폴더 ──');
    var paths = null;
    try { paths = await (await fetch(BK + '/nas/paths')).json(); }
    catch (e) { check('백엔드 연결', false, '실행 중이 아닙니다 — kortek_backend.bat'); return; }
    if (!check('앱 폴더가 정해져 있다', !!(paths && paths.configured), (paths && paths.root) || '')) return;

    out('\n── ② 🗺 옛 id 지도 ──');
    var mapN = 0;
    try {
        var mr = await fetch(BK + '/nas/app/get?rel=' + encodeURIComponent('App_Config/nas_id_map.json'));
        var mj = mr.ok ? JSON.parse(await mr.text()) : null;
        mapN = mj && mj.map ? Object.keys(mj.map).length : 0;
    } catch (e) { /* 아래에서 잡힌다 */ }
    if (!check('지도가 있다', mapN > 0, mapN + '건')) {
        out('   → 🔑 로그인·저장소 설정 ▸ 📦 Drive → NAS 이사 를 한 번 누르면 만들어집니다.');
    }

    out('\n── ③ 프로젝트 목록 (앱 자신의 함수) ──');
    var files = null;
    try { files = await window._listProjectFiles(); }
    catch (e) { check('목록 조회', false, String(e && e.message || e)); }
    if (files) {
        check('프로젝트가 보인다', files.length > 0, files.length + '건');
        var gen = files.filter(function (f) { return String(f.id).indexOf('nas_') === 0; });
        // ⚠️ 이사해 온 파일은 **옛 Drive id** 로 와야 한다. 새로 만든 id 가 섞이면
        //    그 프로젝트를 가리키던 저장된 참조(메일 배분·보관함)가 안 맞는다.
        check('id 가 전부 옛 Drive id 다', gen.length === 0,
              gen.length ? ('새 id ' + gen.length + '건: ' + gen.slice(0, 3).map(function (f) { return f.name; }).join(', ')) : '');
        // ⚠️ [2026-11-04 추가] NAS 엔 Drive 의 파일 꼬리표(appProperties)가 없다.
        //    없으면 목록이 통째로 "미지정" 으로 묶인다(실사용 신고: "담당자 분류가 풀렸음").
        //    어댑터가 project_index 에서 채워 넣는다 — 목록이 보이는 것과 **다른 문제**다.
        var noPm = files.filter(function (f) { return !(f.appProperties && f.appProperties.pm); });
        check('담당자(appProperties.pm)가 붙어 있다', noPm.length === 0,
              noPm.length ? (noPm.length + '건 비어 있음: ' + noPm.slice(0, 3).map(function (f) { return f.name; }).join(', ')
                             + ' (그 프로젝트를 한 번 저장하면 채워진다)') : (files.length + '건'));
        files.slice(0, 20).forEach(function (f) { out('     · ' + f.name); });
    }

    out('\n── ④ project_index 의 id 가 전부 풀리나 ──');
    try {
        var ir = await fetch(BK + '/nas/app/get?rel=' + encodeURIComponent('App_Config/project_index.json'));
        var idx = JSON.parse(await ir.text());
        var projs = (idx.projects || []);
        var unresolved = [];
        for (var i = 0; i < projs.length; i++) {
            var fid = projs[i].drive_file_id;
            if (!fid) continue;
            if (!SA._fn.relOf(fid)) unresolved.push(projs[i].file_name || fid);
        }
        check('프로젝트 id 가 전부 풀린다', unresolved.length === 0,
              projs.length + '건 중 못 푼 것: ' + (unresolved.join(', ') || '없음'));
    } catch (e) {
        check('project_index 읽기', false, String(e && e.message || e));
    }

    out('\n── ⑤ 실제 프로젝트 파일을 열어 본다 (읽기만) ──');
    if (files && files.length) {
        var target = files[0];
        try {
            var pr = await fetch('https://www.googleapis.com/drive/v3/files/' +
                                 encodeURIComponent(target.id) + '?alt=media&supportsAllDrives=true');
            var txt = await pr.text();
            var pj = JSON.parse(txt);
            check('열린다 + JSON 이 온전하다', !!pj, target.name + ' · ' +
                  Math.round(txt.length / 1024) + 'KB');
            check('프로젝트 구조가 맞다', !!(pj.globalData || pj.tabData),
                  Object.keys(pj).slice(0, 6).join(', '));
        } catch (e) {
            check('프로젝트 열기', false, String(e && e.message || e));
        }
    }

    out('\n── ⑥ 설정 파일들 ──');
    var cfgOk = 0, cfgBad = [];
    for (var nm of ['AddressBook_Shared.json', 'Holidays_Shared.json', 'PriorityScore_Shared.json',
                    'MailFilterRules_Shared.json', 'AI_Prompt_Shared.json']) {
        try {
            var cr = await fetch(BK + '/nas/app/get?rel=' + encodeURIComponent('App_Config/' + nm));
            JSON.parse(await cr.text()); cfgOk++;
        } catch (e) { cfgBad.push(nm); }
    }
    check('설정 파일이 읽힌다', cfgBad.length === 0, cfgOk + '/5' + (cfgBad.length ? (' · 실패: ' + cfgBad.join(', ')) : ''));

    out('\n── ⑦ 쓰기가 되나 (진짜 데이터는 안 건드림) ──');
    var probeRel = DIR + '/probe_' + Date.now() + '.json';
    var probeBody = JSON.stringify({ 점검: '쓰기', t: Date.now() });
    try {
        var wr = await fetch(BK + '/nas/app/put', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rel: probeRel, text: probeBody })
        });
        var wj = await wr.json();
        check('NAS 에 쓴다', !!wj.ok, wj.message || '');
        var rb = await fetch(BK + '/nas/app/get?rel=' + encodeURIComponent(probeRel));
        check('쓴 그대로 읽힌다', rb.ok && (await rb.text()) === probeBody);
    } catch (e) {
        check('쓰기', false, String(e && e.message || e));
    } finally {
        try {
            await fetch(BK + '/nas/app/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rel: DIR })
            });
        } catch (e) { note('점검 폴더를 못 지웠습니다 — 앱 폴더의 ' + DIR + ' 을 직접 지워주세요'); }
    }

    // ── 📢 전환 선언(2026-11-04) — 안 옮긴 팀원이 "지금 어디에 저장되는지" 알 수 있는가
    var pol = window.STORAGE_POLICY || {};
    check('전환 선언이 데이터로 있다(STORAGE_POLICY)', !!pol.cutover, JSON.stringify(pol));
    // 🗄️ 고르게 하지 않는다 — 플래그가 없어도 NAS 여야 한다(아무것도 안 한 팀원이 기준).
    check('기본값이 사내 NAS 다(nasOnly)', !!pol.nasOnly, JSON.stringify(pol));
    var _savedFlag = null;
    try { _savedFlag = localStorage.getItem('gantt_storage_backend'); } catch (e) { /* ignore */ }
    check('플래그 없이도 NAS 로 돌고 있다',
          _savedFlag === null || _savedFlag === 'nas',
          '플래그=' + _savedFlag + ' (drive/mirror 면 비상 탈출구를 쓴 상태다)');
    var _badge = document.getElementById('drive-conn-badge');
    check('배지는 눌러도 안 바뀐다(고르기 없음)', !(_badge && _badge.onclick));
    // 📂 앱을 열 때 프로젝트 불러오기 창을 **한 번만** 띄운다(사용자 요청 2026-11-04).
    check('목록 자동 열기가 켜져 있다', !!pol.autoOpenProjectList, JSON.stringify(pol));
    check('이 페이지에서 한 번만 열렸다', window._projectListAutoOpened === true,
          '열린 적 없음 — 이미 프로젝트가 열려 있었거나 연결이 늦었을 수 있다');
    check('배너 함수가 있다', typeof window._storageBanner === 'function');
    check('🚀 간편 전환으로 가는 길이 있다', typeof window.storageOpenQuickSwitch === 'function');
    check('📥 설치 안내로 가는 길이 있다', typeof window.storageOpenBackendGuide === 'function');
    // 모드 목록: 미러는 내려가고, 드라이브엔 경고가 붙어야 한다
    try {
        window.storageOpenSwitcher(document.body);
        var pop = document.getElementById('storage-switch-pop');
        var rows = [].slice.call(pop.querySelectorAll('[data-mode]')).map(function (b) {
            return { mode: b.getAttribute('data-mode'), text: b.innerText };
        });
        pop.remove();
        var ids = rows.map(function (r) { return r.mode; });
        check('미러는 목록에서 내려갔다', ids.indexOf('mirror') < 0, ids.join(','));
        var dr = rows.filter(function (r) { return r.mode === 'drive'; })[0];
        check('드라이브에 경고가 붙었다', !!dr && /⚠️/.test(dr.text), dr && dr.text);
    } catch (e) {
        check('모드 목록', false, String(e && e.message || e));
    }
    // NAS → Drive 되돌리기는 **데이터가 갈라지는 일**이라고 말하는가 (실제로 바꾸지는 않는다)
    try {
        var seen = null, oc = window.confirm;
        window.confirm = function (m) { seen = m; return false; };
        window.storageSetMode('drive');
        window.confirm = oc;
        check('되돌릴 때 갈라짐을 경고한다', !!seen && /팀원에게 안 보이/.test(seen), seen);
        check('confirm 문구에 마크다운이 안 남았다', !!seen && seen.indexOf('**') < 0, seen);
    } catch (e) {
        check('되돌리기 경고', false, String(e && e.message || e));
    }

    // 🛡 색인을 0건으로 덮어쓰려는 쓰기를 막는가 — **이 검사는 아무것도 쓰지 않는다**
    //    (가드 함수는 막을지 말지 판단만 하고 쓰지 않는다). 지금 색인이 비어 있으면 판단할
    //    수 없으므로 건너뛰고 **그 사실을 말한다** — "통과"로 적으면 안 본 걸 봤다고 하는 것이다.
    try {
        if (typeof window._storageGuardIndexWrite !== 'function') {
            check('색인 덮어쓰기 가드가 있다', false, '함수 없음');
        } else {
            var idxNow = await (await fetch(BK + '/nas/app/get?rel='
                + encodeURIComponent('App_Config/project_index.json'))).json();
            var have = (idxNow.projects || []).length;
            var verdict = await window._storageGuardIndexWrite(
                'App_Config/project_index.json', JSON.stringify({ projects: [] }));
            if (!have) {
                note('색인이 지금 0건이라 "빈 덮어쓰기 차단"을 확인할 수 없습니다 — '
                   + 'tools/restore-project-index.py 로 되살린 뒤 다시 돌려주세요');
            } else {
                // ⚠️ 이 하네스의 check 는 성공해도 설명을 같이 찍는다 — 실패 전제로 쓴 문장을
                //    넣으면 ✅ 옆에 "통과시켰다"가 붙어 읽는 사람이 거꾸로 이해한다.
                check('색인을 0건으로 덮어쓰면 막는다', !!(verdict && verdict.blocked),
                      '지금 ' + have + '건');
            }
        }
    } catch (e) {
        check('색인 덮어쓰기 가드', false, String(e && e.message || e));
    }

    out('\n════ 통과 ' + ok + ' · 실패 ' + bad + (warn ? (' · 주의 ' + warn) : '') + ' ════');
    if (bad === 0) {
        out('✅ 읽기·id·쓰기 경로가 살아 있습니다.');
        out('⚠️ 다만 **앱에서 프로젝트를 고치고 저장 → 새로고침 → 남아 있는지**는');
        out('   사람이 한 번 해 봐야 합니다. 이 점검은 거기까지는 못 봅니다.');
    } else {
        out('❌ 되돌리려면: localStorage.removeItem("gantt_storage_backend"); location.reload();');
        out('   Drive 원본은 그대로 있습니다.');
    }
})();
