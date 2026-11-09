/* ============================================================================
   🔑 시작 화면 로그인 / 로그아웃 (js/64) — 진짜 앱에서 돌리는 하네스 (2026-11-09)
   앱을 열고 콘솔에 붙여넣는다.

   ⚠️⚠️ **진짜 로그인은 시도하지 않는다.** 비밀번호를 틀리면 3번 만에 이 PC 가 잠긴다
      (docs/nas-dsm.md) — 하네스가 그걸 태우면 안 된다. 그래서 `/nas/login` **그 한 줄만**
      가짜로 막고(나머지 fetch 는 진짜), 성공·실패 응답을 흉내 내서 화면 반응을 본다.
   ⚠️ 저장은 한 번도 하지 않는다(`_dailySave` 킬스위치). 끝나면 원래 상태로 되돌린다.
   ============================================================================ */
(async function () {
    'use strict';
    var pass = 0, fail = 0, out = [];
    function ok(n, c, d) { if (c) { pass++; out.push('  OK   ' + n); } else { fail++; out.push('  FAIL ' + n + (d !== undefined ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 240) : '')); } }
    var U = window.USER_SWITCH;
    if (!U || !window._appUserLogin) { console.error('js/64 미로드(또는 구버전)'); return; }

    var keep = {
        user: localStorage.getItem(U.userKey),
        remember: localStorage.getItem(U.rememberKey),
        save: window._dailySave,
        fetch: window.fetch,
        reload: window._appUserReload,
        acct: window._nasAccount
    };
    window._dailySave = function () { console.warn('[harness] 저장 차단'); };

    // 🔒 /nas/login 만 가로챈다 — 진짜 시도는 **한 번도** 나가지 않는다.
    var sent = [], reply = { ok: false, message: '비밀번호가 맞지 않습니다', budget: { max: 3, left: 2 } };
    var fakeStatus = null;          // 필요할 때만 켜서 예산을 맞춘다
    var reloaded = 0;
    window.fetch = function (url, opt) {
        var u = String(url || '');
        if (u.indexOf('/nas/login') >= 0 && opt && String(opt.method).toUpperCase() === 'POST') {
            var body = {};
            try { body = JSON.parse(opt.body || '{}'); } catch (e) { /* 무시 */ }
            sent.push(body);
            return Promise.resolve(new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        // ⚠️ 화면은 남은 횟수를 **`/nas/status` 에서** 읽는다(그게 진짜 값이다).
        //    로그인만 가짜로 두면 둘이 어긋나 가짜 실패가 난다 — 같은 경계를 같이 맞춘다.
        if (u.indexOf('/nas/status') >= 0 && fakeStatus) {
            return Promise.resolve(new Response(JSON.stringify(fakeStatus), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        if (u.indexOf('/nas/login') >= 0 && opt && String(opt.method).toUpperCase() === 'DELETE') {
            sent.push({ logout: true });
            return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
        }
        return keep.fetch.apply(window, arguments);
    };

    function gateOn() { var g = document.getElementById('app-user-gate'); return !!(g && g.style.display !== 'none'); }
    function badge() { var b = document.getElementById('app-user-badge'); return b ? b.textContent : ''; }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms || 400); }); }

    try {
        if (window.dailyLoadRoster) await window.dailyLoadRoster();
        var list = (window._dailyRoster() || []).filter(function (m) { return m && m.key && m.active !== false; });
        ok('명단이 있다(이름을 못 붙이면 id 로 떨어진다)', list.length >= 2, list.length);
        var me = window._nasAccount;
        var other = (list.filter(function (m) { return m.key !== me; })[0] || {}).key;

        // ── 로그인 화면 ────────────────────────────────────────────────────
        await window.appUserOpenPicker();
        await wait(300);
        ok('아이디·비밀번호 칸이 있다',
           !!document.getElementById('app-user-id') && !!document.getElementById('app-user-pw'));
        ok('계정 저장 체크가 있다', !!document.getElementById('app-user-remember'));
        ok('안내에 잠금 경고가 있다', /여러 번 틀리면|lock/i.test(document.getElementById('app-user-gate').innerText));

        // ⚠️ 빈 칸으로 누르면 **백엔드로 나가지 않는다**(헛된 실패로 예산을 깎지 않는다).
        document.getElementById('app-user-id').value = '';
        document.getElementById('app-user-pw').value = '';
        var n0 = sent.length;
        await window._appUserLogin();
        await wait(300);
        ok('빈 칸이면 시도조차 안 한다', sent.length === n0, sent.length + ' vs ' + n0);
        ok('빈 칸이면 왜 안 되는지 말한다', /모두 넣어|Enter both/.test(document.getElementById('app-user-gate').innerText));

        // ── 틀렸을 때: 남은 횟수를 보여 준다 ───────────────────────────────
        document.getElementById('app-user-id').value = me || 'someone';
        document.getElementById('app-user-pw').value = 'xxx';
        document.getElementById('app-user-remember').checked = false;
        fakeStatus = { configured: true, ok: false, reason: 'no_session', user: me, budget: { max: 3, left: 2 } };
        await window._appUserLogin();
        await wait(400);
        ok('틀리면 비밀번호를 본문으로만 보낸다(쿼리 아님)', sent.length === n0 + 1 && sent[sent.length - 1].password === 'xxx',
           JSON.stringify(sent[sent.length - 1] || {}).replace(/xxx/, '***'));
        ok('저장 체크가 꺼져 있으면 save 를 안 보낸다', sent[sent.length - 1].save === false, sent[sent.length - 1].save);
        ok('남은 횟수를 화면에 적는다', /2번 더|2 attempt/.test(document.getElementById('app-user-gate').innerText),
           document.getElementById('app-user-gate').innerText.split('\n').slice(0, 4));
        ok('틀려도 화면은 닫히지 않는다', gateOn());

        // ── 성공했을 때: 같은 계정이면 새로고침하지 않는다 ─────────────────
        // ⚠️ `location.reload` 는 덮어쓸 수 없다(실측) — js/64 가 놨 이음쇠를 갈아 끼운다.
        window._appUserReload = function () { reloaded++; };
        fakeStatus = null;
        reply = { ok: true, user: me, saved: true };
        document.getElementById('app-user-id').value = me;
        document.getElementById('app-user-pw').value = 'right';
        document.getElementById('app-user-remember').checked = true;
        await window._appUserLogin();
        await wait(600);
        ok('성공하면 화면이 닫힌다', !gateOn());
        ok('저장 체크를 켜면 save 를 보낸다', sent[sent.length - 1].save === true, sent[sent.length - 1].save);
        ok('같은 계정이면 새로고침하지 않는다', reloaded === 0, reloaded);
        ok('신원이 그 계정으로 선다', window._dailyMyKey() === String(me).toLowerCase(),
           window._dailyMyKey() + ' vs ' + me);
        ok('배지가 그 사람을 보여 준다', badge().indexOf('👤') === 0 && badge().length > 2, badge());

        // ── 다른 계정으로 들어오면 화면을 새로 연다(앞사람 자동저장 방지) ───
        if (other) {
            reply = { ok: true, user: other, saved: false };
            await window.appUserOpenPicker();
            await wait(250);
            document.getElementById('app-user-id').value = other;
            document.getElementById('app-user-pw').value = 'right';
            await window._appUserLogin();
            await wait(600);
            ok('계정이 바뀌면 새로고침한다', reloaded === 1, reloaded);
        }

        // ── 🧹 사람이 바뀌면 훑어 둔 것을 버린다 ───────────────────────────
        window.appUserSet(me, undefined, true);
        ok('일일보고 훑기 캐시가 비워진다', (window._dailyOtherScan || {}).total === 0, (window._dailyOtherScan || {}).total);
        ok('기간 요약 훑기 캐시가 비워진다', (window._psOtherScan || {}).key === '', (window._psOtherScan || {}).key);
        ok('일일보고 파일 이름이 그 사람으로',
           window.DAILY_PATHS.file('2026-01-02', window._dailyMyKey()).indexOf('__' + String(me).toLowerCase() + '.json') > 0,
           window.DAILY_PATHS.file('2026-01-02', window._dailyMyKey()));

        // ── 🪪 배지 = 접속자 + 로그아웃 버튼 ───────────────────────────────
        window.appUserSet(me, undefined, true);
        var bEl = document.getElementById(U.badgeId);
        ok('배지가 접속자를 보여 준다', bEl.textContent.indexOf('👤') === 0 && bEl.textContent.length > 3, bEl.textContent);
        // ⚠️ 이름만 있으면 "내 정보" 처럼 보인다 — 누르면 무슨 일이 나는지도 **글자로** 같이 보여야 한다.
        //    아이콘만 붙였더니 머리줄 글꼴에서 흑백 막대처럼 보여 아무 뜻도 전하지 못했다(실측).
        ok('배지에 로그아웃이 글자로 같이 있다', /로그아웃|Sign out/.test(bEl.textContent), bEl.textContent);
        ok('말풍선도 로그아웃이라고 말한다', /로그아웃|sign out/i.test(bEl.title), bEl.title);

        // 누르면 **로그아웃이다**(로그인 창이 아니라).
        var n1 = sent.length;
        bEl.onclick();
        await wait(500);
        ok('배지를 누르면 로그아웃한다', sent.slice(n1).some(function (s) { return s.logout; }), sent.slice(n1));
        ok('로그아웃 뒤 배지는 로그인으로 바뀐다',
           /로그인|Sign in/.test(document.getElementById(U.badgeId).textContent) &&
           !/로그아웃|Sign out/.test(document.getElementById(U.badgeId).textContent),
           document.getElementById(U.badgeId).textContent);
        // ⚠️ 안 한 상태에서는 같은 자리가 **반대 일**을 한다 — 로그인 창이 떠야 한다.
        window._appUserClosePicker();
        document.getElementById(U.badgeId).onclick();
        await wait(400);
        ok('로그인 전에는 같은 배지가 로그인 창을 연다', gateOn());
        // ⚠️ 로그인 전에는 '로그아웃' 이라고 적히면 안 된다(거꾸로다).
        ok('로그인 전에는 로그아웃이라고 안 적는다', !/로그아웃|Sign out/.test(document.getElementById(U.badgeId).textContent),
           document.getElementById(U.badgeId).textContent);

        // ── 🚪 로그아웃 ────────────────────────────────────────────────────
        window.appUserSet(me, undefined, true);
        var before = sent.length;
        await window.appUserLogout();
        await wait(400);
        ok('로그아웃은 NAS 세션을 끊는다', sent.slice(before).some(function (s) { return s.logout; }), sent.slice(before));
        ok('로그아웃하면 로그인 화면이 뜬다', gateOn());
        ok('기억이 지워진다', localStorage.getItem(U.userKey) === null);

        ok('설정 메뉴에 로그인·로그아웃이 있다',
           !!document.getElementById('app-user-switch-btn') && !!document.getElementById('app-user-logout-btn'));
    } catch (e) {
        ok('하네스가 끝까지 돌았다', false, String(e && e.message || e));
    } finally {
        window.fetch = keep.fetch;
        window._appUserReload = keep.reload;
        window._dailySave = keep.save;
        window._nasAccount = keep.acct;
        if (keep.user == null) localStorage.removeItem(U.userKey); else localStorage.setItem(U.userKey, keep.user);
        if (keep.remember == null) localStorage.removeItem(U.rememberKey); else localStorage.setItem(U.rememberKey, keep.remember);
        var u = window._appUser();
        window._appUserKey = u ? u.key : '';
        if (window._appUserPaintBadge) window._appUserPaintBadge();
        window._appUserClosePicker();
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    return { pass: pass, fail: fail };
})();
