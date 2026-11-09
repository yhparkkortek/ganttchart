/* ============================================================================
   🔑 js/64-user-switch.js — 시작 화면 로그인(NAS 계정) + 로그아웃 (2026-11-09, 사용자 요청)

   요청: "하나의 PC에서 여러명이 자기 프로젝트 띄워놓고 발표" · "형식일지라도 개인 로그인이
         나중에 필요하니까 **NAS 비번 넣는 곳과 연동해서** 초기에 아이디·비번 눌러서 저장되게"

   그래서 이 화면은 🔑 설정의 NAS 계정과 **같은 저장소**를 쓴다(`/nas/login` → `nas_dsm`).
   여기서 로그인하면 그 계정이 이 PC 의 NAS 계정이 되고, 앱이 "나" 로 보는 사람도 그 사람이 된다.

   ⚠️⚠️ **틀리면 3번 만에 이 PC 의 IP 가 잠긴다**(계정이 아니라 PC 다, docs/nas-dsm.md).
      그래서 ① 남은 횟수를 **화면에 적고** ② 잠기면 푸는 방법을 적고 ③ **자동 재시도는 없다**.
      백엔드는 "로그인 성공한 뒤에만 저장" 한다 — 저장이 먼저면 `save_config` 의 `reset_block()`
      때문에 예산이 매번 되살아나 **잠금이 영영 안 걸린다**(그 자리를 DSM 자동차단이 대신한다).

   ⚠️⚠️ 이 값이 **일일보고 파일 이름**을 정한다(js/59 `myKey()` 가 `window._appUserKey` 를 맨 먼저 본다).
      잘못 두면 남의 보고 파일에 쓴다 → 고른 사람을 **헤더 배지에 늘** 띄우고, 사람이 바뀌면
      훑어 둔 '내 프로젝트' 캐시를 **전부 버린다**.

   ⚠️ 계정이 **실제로 바뀌면 새로고침한다** — 백엔드 NAS 세션은 PC 에 하나뿐이라, 앞사람이 열어 둔
      화면이 그대로 있으면 그 자동저장이 **뒷사람 계정으로** 나간다.
   검증: tests/user-switch.browser.js · py -3 tests/test_nas_login_with.py
   ============================================================================ */
(function () {
    'use strict';

    window.USER_SWITCH = window.USER_SWITCH || {
        userKey: 'gantt_app_user',            // {key,name,at} — 이 브라우저가 기억하는 "지금 나"
        rememberKey: 'gantt_app_user_remember',
        askOnBoot: true,
        bootDelayMs: 2500,                    // 명단·NAS 상태가 들어올 틈을 준다
        badgeId: 'app-user-badge',
        backend: 'http://127.0.0.1:5000'
    };
    var U = window.USER_SWITCH;
    var _busy = false, _msg = '', _budget = null;
    //  마지막으로 읽은 `/nas/status` — 로그인 때 "이 PC 가 설정돼 있나"를 다시 묻지 않으려고 둔다.
    var _status = null;

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function readUser() {
        try {
            var o = JSON.parse(localStorage.getItem(U.userKey) || 'null');
            if (o && o.key) return { key: String(o.key), name: String(o.name || o.key) };
        } catch (e) { /* 아래 */ }
        return null;
    }
    window._appUser = readUser;

    function remembered() {
        try { return localStorage.getItem(U.rememberKey) === '1'; } catch (e) { return false; }
    }

    /** 계정 id → 사람 이름(명단은 주소록에서 온다). 못 찾으면 id 그대로 — 지어내지 않는다. */
    function nameOf(key) {
        var k = String(key || '').trim().toLowerCase();
        var hit = ((typeof window._dailyRoster === 'function' ? window._dailyRoster() : []) || [])
            .filter(function (m) { return m && String(m.key || '').toLowerCase() === k; })[0];
        return (hit && hit.name) || key || '';
    }

    async function api(method, path, body) {
        var r = await fetch(U.backend + path, {
            method: method, cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        var txt = await r.text();
        try { return JSON.parse(txt); } catch (e) {
            // 구버전 백엔드는 404 HTML 을 준다 — "안 돌고 있다" 와 "돌지만 구버전" 을 나눠 말한다.
            throw new Error(r.status === 404
                ? T('백엔드가 구버전입니다 — 재시작해주세요.', 'Backend is outdated — please restart it.')
                : T('백엔드 응답을 읽지 못했습니다(' + r.status + ').', 'Bad backend response (' + r.status + ').'));
        }
    }

    // ── 신원 적용 ───────────────────────────────────────────────────────────
    function apply(u) {
        window._appUserKey = u ? u.key : '';
        if (u && u.name) window.currentUserName = u.name;
        // 🧹 '내 프로젝트'·'내 일' 은 사람마다 다르다 — 앞사람 기준이 남으면 조용한 오답이 된다.
        try { if (window._dailyResetScans) window._dailyResetScans(); } catch (e) { /* 없으면 그만 */ }
        try { if (window._psResetScan) window._psResetScan(); } catch (e) { /* 없으면 그만 */ }
        try { if (window._ovcReset) window._ovcReset(); } catch (e) { /* 없으면 그만 */ }
        paintBadge();
        try { if (window.dailyRenderTab) window.dailyRenderTab(); } catch (e) { /* 탭이 없을 수 있다 */ }
    }

    function store(u, remember) {
        try {
            localStorage.setItem(U.userKey, JSON.stringify({ key: u.key, name: u.name, at: Date.now() }));
            localStorage.setItem(U.rememberKey, remember ? '1' : '0');
        } catch (e) { /* 저장소가 꽉 차도 이번 판은 돌아야 한다 */ }
    }

    /** 코드에서 신원만 바꾼다(하네스·내부용). 로그인은 `_appUserLogin` 이 한다. */
    window.appUserSet = function (key, name, remember) {
        var k = String(key || '').trim();
        if (!k) return;
        var u = { key: k, name: String(name || nameOf(k) || k) };
        store(u, remember);
        apply(u);
        closePicker();
    };

    /**
     * 🚪 로그아웃 — NAS 세션을 끊고(다음 사람이 제 계정으로 들어오게) 로그인 화면으로 돌아간다.
     * ⚠️ 저장된 계정(아이디·비밀번호)은 **지우지 않는다** — 주소·앱 폴더가 같은 파일에 있어서
     *    지우면 다음 사람이 설정을 처음부터 해야 한다. 다음 사람은 자기 계정으로 로그인하면
     *    그때 덮어쓴다(`save` 를 켰을 때만).
     */
    window.appUserLogout = async function () {
        try { localStorage.removeItem(U.userKey); localStorage.removeItem(U.rememberKey); } catch (e) { /* 무시 */ }
        try { await api('DELETE', '/nas/login'); } catch (e) { /* 끊기에 실패해도 화면은 돌려놓는다 */ }
        apply(null);
        _msg = T('로그아웃했습니다 — 아이디와 비밀번호를 넣어주세요.', 'Signed out — please sign in.');
        openPicker();
    };

    // ── 로그인 화면 ─────────────────────────────────────────────────────────
    function closePicker() {
        var el = document.getElementById('app-user-gate');
        if (el) el.style.display = 'none';
    }
    window._appUserClosePicker = closePicker;

    function gateHtml(st) {
        var idv = (readUser() || {}).key || (st && st.user) || '';
        // 🆕 [2026-11-09] 아직 NAS 설정이 없는 PC(= 새로 깐 PC)면 **여기서 전환까지** 한다.
        //    왜: `/nas/login` 은 주소가 이미 저장돼 있어야 되는 호출이라, 새 PC 는 이 화면에서
        //    반드시 실패하고 사람이 🔑 설정까지 찾아가야 했다("굳이 여기까지 와서 로그인할
        //    필요 없는데"). 설정이 없으면 `/nas/setup` 을 부르면 되고, 그건 **주소·아이디·
        //    비밀번호만** 있으면 앱 폴더·자료실 경로·포트를 스스로 정한다(실측: 31곳 4.0초 → 1곳).
        //    주소는 `nas_defaults.json` 이 있으면 **미리 채운다** — 사람이 칠 것은 아이디·비번뿐.
        var needSetup = !(st && st.configured);
        var hostv = (st && st.host) || (st && st.defaults && st.defaults.host) || '';
        var left = _budget && typeof _budget.left === 'number' ? _budget.left : null;
        var blocked = !!(st && st.reason === 'blocked');
        var warn = '';
        if (blocked) {
            warn = '<div style="padding:9px 11px; background:#fbe4e2; border:1px solid #eeb0ac; border-radius:7px; font-size:11.5px; color:#b1432f; text-align:left; margin-bottom:10px;">⛔ ' +
                   esc(T('여러 번 틀려서 잠겼습니다. 🔑 설정 ▸ NAS 에서 비밀번호를 다시 저장하면 풀립니다.',
                         'Locked after repeated failures. Re-save the password in 🔑 settings to unlock.')) + '</div>';
        } else if (_msg) {
            warn = '<div style="padding:9px 11px; background:#fbead9; border:1px solid #edbf85; border-radius:7px; font-size:11.5px; color:#a85d0a; text-align:left; margin-bottom:10px;">' +
                   esc(_msg) + (left !== null ? ' (' + esc(T(left + '번 더 시도할 수 있습니다', left + ' attempt(s) left')) + ')' : '') + '</div>';
        }
        var inp = 'width:100%; box-sizing:border-box; padding:11px 12px; border:1px solid #2aa5b5; border-radius:6px; font-size:14px; background:#eef8fa; margin-bottom:8px;';
        return '' +
        '<div style="width:min(430px,92vw); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,.25); padding:28px 26px 22px; text-align:center;">' +
          '<div style="font-size:30px; font-weight:900; letter-spacing:-1px; color:#00707d; margin-bottom:4px;">kortek</div>' +
          '<div style="font-size:12px; color:#888; margin-bottom:18px;">' + esc(T('업무 관리', 'Project Manager')) + '</div>' +
          warn +
          '<input id="app-user-id" value="' + esc(idv) + '" autocomplete="username" placeholder="' + esc(T('아이디', 'ID')) + '" style="' + inp + '">' +
          '<input id="app-user-pw" type="password" autocomplete="current-password" placeholder="' + esc(T('비밀번호', 'Password')) + '" style="' + inp + '" ' +
            'onkeydown="if(event.key===\'Enter\'){window._appUserLogin();}">' +
          // 주소 칸은 **설정이 없을 때만** 보인다 — 이미 쓰는 PC 에 없던 칸이 생기면 그것만으로 연락이 온다.
          (needSetup
            ? '<input id="app-user-host" value="' + esc(hostv) + '" autocomplete="off" placeholder="' +
                esc(T('NAS 주소 (담당자에게 받으세요)', 'NAS address')) + '" style="' + inp + '" ' +
                'onkeydown="if(event.key===\'Enter\'){window._appUserLogin();}">' +
              '<div style="font-size:11px; color:#888; text-align:left; margin:-4px 0 8px;">' +
                esc(hostv ? T('이 PC 는 처음입니다 — 주소는 채워 뒀습니다. 아이디·비밀번호만 넣으면 나머지는 자동으로 맞춥니다.',
                              'First time on this PC — the address is prefilled; the rest is automatic.')
                          : T('이 PC 는 처음입니다 — 주소만 한 번 넣으면 나머지(앱 폴더·자료실)는 자동으로 맞춥니다.',
                              'First time on this PC — enter the address once; the rest is automatic.')) +
              '</div>'
            : '') +
          '<button id="app-user-go" onclick="window._appUserLogin()"' + (blocked ? ' disabled' : '') +
            ' style="width:100%; box-sizing:border-box; padding:11px 0; border:none; border-radius:6px; background:' + (blocked ? '#bbb' : '#19b4c8') + '; color:#fff; font-size:15px; font-weight:bold; cursor:' + (blocked ? 'default' : 'pointer') + ';">' +
            esc(_busy ? T('로그인 중…', 'Signing in…') : T('로그인', 'Sign in')) + '</button>' +
          '<label style="display:flex; align-items:center; gap:6px; margin-top:12px; font-size:12px; color:#666; cursor:pointer;">' +
            '<input type="checkbox" id="app-user-remember"' + (remembered() ? ' checked' : '') + '> ' +
            esc(T('계정 저장 (이 PC 에 저장하고 다음부터 이 창을 안 띄웁니다)', 'Save on this PC')) + '</label>' +
          '<div style="margin-top:14px; padding-top:12px; border-top:1px solid #eee; font-size:11px; color:#aaa; line-height:1.5; text-align:left;">' +
            esc(T('사내 NAS 계정입니다(🔑 설정의 그 계정과 같습니다). 로그인한 사람 기준으로 일일보고·내 프로젝트·담당자를 보여 줍니다.',
                  'Your NAS account — the same one in 🔑 settings.')) +
            '<br>⚠️ ' + esc(T('비밀번호를 여러 번 틀리면 이 PC 가 잠깁니다 — 천천히 확인하고 넣어주세요.',
                             'Repeated failures lock this PC — type carefully.')) +
          '</div>' +
        '</div>';
    }

    async function openPicker() {
        var el = document.getElementById('app-user-gate');
        if (!el) {
            el = document.createElement('div');
            el.id = 'app-user-gate';
            el.style.cssText = 'position:fixed; inset:0; z-index:99000; background:rgba(245,248,250,.97); display:flex; align-items:center; justify-content:center;';
            document.body.appendChild(el);
        }
        el.style.display = 'flex';            // ⚠️ 닫을 땐 none 이므로 열 때마다 다시 켠다
        var st = null;
        try { st = await api('GET', '/nas/status'); } catch (e) { /* 백엔드가 꺼져 있어도 화면은 띄운다 */ }
        _budget = (st && st.budget) || _budget;
        _status = st || null;
        el.innerHTML = gateHtml(st || {});
        var pw = document.getElementById('app-user-pw');
        if (pw) try { pw.focus(); } catch (e) { /* 무시 */ }
    }
    window.appUserOpenPicker = openPicker;

    window._appUserLogin = async function () {
        if (_busy) return;
        var id = (document.getElementById('app-user-id') || {}).value || '';
        var pw = (document.getElementById('app-user-pw') || {}).value || '';
        var rem = !!(document.getElementById('app-user-remember') || {}).checked;
        id = String(id).trim();
        if (!id || !pw) { _msg = T('아이디와 비밀번호를 모두 넣어주세요.', 'Enter both ID and password.'); return openPicker(); }
        _busy = true;
        var btn = document.getElementById('app-user-go');
        if (btn) { btn.disabled = true; btn.textContent = T('로그인 중…', 'Signing in…'); }
        var before = String(window._nasAccount || '').trim().toLowerCase();
        try {
            // ⚠️ 비밀번호는 **본문으로만** 간다(쿼리에 실으면 로그에 남는다). 자동 재시도는 없다.
            // 🆕 [2026-11-09] 아직 설정이 없는 PC 면 **로그인이 아니라 전환**을 부른다.
            //    `/nas/login` 은 주소가 저장돼 있어야 되는 호출이라 새 PC 에선 반드시 실패했고,
            //    그래서 사람이 🔑 설정까지 찾아가야 했다. `/nas/setup` 은 주소·아이디·비밀번호만
            //    있으면 계정저장 → 로그인 → 앱 폴더 찾기 → 자료실 경로까지 한 번에 밟는다.
            //    ⚠️ 로그인 실패 예산은 백엔드가 관리한다 — 여기서 재시도하지 않는다(계정·IP 잠김).
            var needSetup = !(_status && _status.configured);
            var r;
            if (needSetup) {
                var host = String((document.getElementById('app-user-host') || {}).value || '').trim();
                if (!host) {
                    _msg = T('NAS 주소를 넣어주세요 (담당자에게 받으세요).', 'Enter the NAS address.');
                    _busy = false;
                    return openPicker();
                }
                r = await api('POST', '/nas/setup', { host: host, user: id, password: pw });
                // 전환은 단계별 결과를 준다 — **어디서 막혔는지** 그대로 보여준다(숨기면 사람이 못 고친다).
                if (r && !r.ok) {
                    var bad = (r.steps || []).filter(function (s) { return s && !s.ok; }).pop();
                    _msg = (bad && (bad.message || bad.step)) || T('설정하지 못했습니다.', 'Setup failed.');
                    if (r.rootHits && r.rootHits.length > 1) {
                        _msg += ' — ' + T('앱 폴더 후보가 여러 곳입니다. 🔑 설정 ▸ NAS 에서 골라주세요.',
                                          'Multiple app folders — pick one in 🔑 settings.');
                    }
                }
            } else {
                r = await api('POST', '/nas/login', { user: id, password: pw, save: rem });
            }
            _budget = r && r.budget || null;
            if (!r || !r.ok) {
                if (!_msg) _msg = (r && r.message) || T('로그인하지 못했습니다.', 'Sign-in failed.');
                _busy = false;
                return openPicker();
            }
            _status = null;                 // 설정이 바뀌었을 수 있다 — 다음에 열 때 다시 묻는다
            _msg = '';
            _busy = false;
            var key = String(r.user || id).toLowerCase();
            // 명단을 다시 들여야 이름이 나온다(처음 로그인이면 아직 못 읽었다).
            try { if (window.dailyLoadRoster) await window.dailyLoadRoster(true); } catch (e) { /* 이름은 id 로 */ }
            store({ key: key, name: nameOf(key) }, rem);
            window._nasAccount = r.user || id;
            closePicker();
            // ⚠️ 계정이 **진짜 바뀌었으면** 새로고침한다 — 앞사람이 열어 둔 화면의 자동저장이
            //    뒷사람 계정으로 나가는 것을 막는 가장 확실한 방법이다.
            if (before && before !== key) { window._appUserReload(); return; }
            apply({ key: key, name: nameOf(key) });
            if (window.showToast) window.showToast('👤 ' + T(nameOf(key) + ' 으로 로그인했습니다.', 'Signed in as ' + nameOf(key)), 'success');
            try { if (window._storageLoadSharedData) window._storageLoadSharedData(); } catch (e) { /* 아래에서 배너가 말한다 */ }
        } catch (e) {
            _busy = false;
            _msg = String((e && e.message) || e);
            return openPicker();
        }
    };

    /**
     * 화면을 새로 여는 지점 — 하네스가 갈아 끼울 수 있게 한 칸 놨다.
     * ⚠️ `location.reload` 는 **덮어쓸 수 없다**(조용히 무시된다) — 실측으로 확인했고,
     *    그래서 하네스가 페이지를 정말 새로고쳐 결과를 통째로 잃었다.
     */
    window._appUserReload = function () { location.reload(); };

    // ── 헤더 배지 ───────────────────────────────────────────────────────────
    /**
     * 헤더 배지 = **로그아웃 버튼**(2026-11-09 요청 "로그아웃 버튼으로 인식하게 해줘").
     *
     * 로그인 중이면 누르는 순간 로그아웃이다. 그런데 이름만 적혀 있으면 "내 정보" 처럼 보여
     * 누르는 사람이 무슨 일이 날지 모른다 → **마우스를 올리면 `🚪 로그아웃` 으로 바뀐다.**
     * (머리줄은 좁아서 늘 두 가지를 같이 적을 수 없다 — 평소엔 누구인지, 올리면 무엇을 하는지.)
     * ⚠️ 안 한 상태(`👤 로그인`)에서는 누르면 로그인 창이 뜬다 — 같은 자리, 반대 일이다.
     */
    function paintBadge() {
        var host = document.getElementById('lang-toggle-btn');
        if (!host || !host.parentNode) return;
        var b = document.getElementById(U.badgeId);
        if (!b) {
            b = document.createElement('button');
            b.id = U.badgeId;
            b.className = 'topbar-btn';
            host.parentNode.insertBefore(b, host);
        }
        var u = readUser();
        // 🚪 접속자와 로그아웃을 **둘 다 한눈에** — 사람은 마우스를 올려 보고 알아차리지 않는다.
        // ⚠️ 아이콘(🚪)만 붙였더니 머리줄 글꼴에서 **흑백 막대처럼** 보여 뭔지 알 수 없었다
        //    (실측: 확대해 보고서야 알았다) → 글자로 적는다. 이모지 렌더링에 기대지 않는다.
        var inLabel = u ? ('👤 ' + u.name + ' · ' + T('로그아웃', 'Sign out'))
                        : ('👤 ' + T('로그인', 'Sign in'));
        b.textContent = inLabel;
        b.dataset.inLabel = inLabel;
        b.title = u
            ? T(u.name + ' 으로 보고 있습니다 — 누르면 로그아웃합니다', 'Signed in as ' + u.name + ' — click to sign out')
            : T('아직 로그인하지 않았습니다 — 누르면 로그인합니다', 'Not signed in — click to sign in');
        b.onclick = u
            ? function () { window.appUserLogout(); }
            : function () { window.appUserOpenPicker(); };
        b.style.cssText = 'flex-shrink:0; ' + (u ? '' : 'background:#fbead9; color:#a85d0a; border-color:#edbf85;');
    }
    window._appUserPaintBadge = paintBadge;

    // ── 시작할 때 ───────────────────────────────────────────────────────────
    async function boot() {
        try { if (window.dailyLoadRoster) await window.dailyLoadRoster(); } catch (e) { /* 명단 없이도 화면은 뜬다 */ }
        var u = readUser();
        if (u && remembered()) {
            // 저장해 둔 사람 — 백엔드가 그 계정으로 붙어 있으면 그대로 들어간다.
            var st = null;
            try { st = await api('GET', '/nas/status'); } catch (e) { /* 아래에서 다시 묻는다 */ }
            if (st && st.ok && String(st.user || '').toLowerCase() === u.key) { apply(u); return; }
            // 저장은 돼 있는데 아직 안 붙었으면 js/57 이 자동 로그인을 한 번 한다 — 잠깐 기다렸다 다시 본다.
            await new Promise(function (r) { setTimeout(r, 1500); });
            try { st = await api('GET', '/nas/status'); } catch (e) { /* 아래 */ }
            if (st && st.ok && String(st.user || '').toLowerCase() === u.key) { apply(u); return; }
            _msg = T('다시 로그인해주세요.', 'Please sign in again.');
        }
        apply(u || null);
        if (U.askOnBoot) openPicker();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', function () { setTimeout(boot, U.bootDelayMs); });
    } else {
        setTimeout(boot, U.bootDelayMs);
    }
})();
