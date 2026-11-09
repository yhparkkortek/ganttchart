/* ============================================================================
   👤 사람 바꾸기 / 로그아웃 (js/64) — 진짜 앱에서 돌리는 하네스 (2026-11-09)
   앱을 열고 콘솔에 붙여넣는다. NAS 가 붙어 있어야 명단이 있다(없으면 "명단 없음" 으로 정직하게 멈춘다).

   ⚠️ 저장은 한 번도 하지 않는다 — 남의 보고 파일을 만들지 않으려고 `_dailySave` 를 막고 돈다.
   ⚠️ 끝나면 원래 고르던 사람·기억 여부를 **그대로 되돌린다**.
   ============================================================================ */
(async function () {
    'use strict';
    var pass = 0, fail = 0, out = [];
    function ok(n, c, d) { if (c) { pass++; out.push('  OK   ' + n); } else { fail++; out.push('  FAIL ' + n + (d !== undefined ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 240) : '')); } }
    var U = window.USER_SWITCH;
    if (!U || !window.appUserSet) { console.error('js/64 미로드'); return; }

    var keep = {
        user: localStorage.getItem(U.userKey),
        remember: localStorage.getItem(U.rememberKey),
        save: window._dailySave,
        draft: localStorage.getItem(window.DAILY_POLICY && window.DAILY_POLICY.draftKey)
    };
    // 🔒 킬스위치 — 이 하네스가 보고를 쓰는 일이 없게
    window._dailySave = function () { console.warn('[harness] 저장 차단'); };

    function gateOn() {
        var g = document.getElementById('app-user-gate');
        return !!(g && g.style.display !== 'none');
    }
    function badge() { var b = document.getElementById('app-user-badge'); return b ? b.textContent : ''; }

    try {
        if (window.dailyLoadRoster) await window.dailyLoadRoster();
        var list = (window._dailyRoster() || []).filter(function (m) { return m && m.key && m.active !== false; });
        ok('명단이 있다(없으면 아래가 전부 뜻이 없다)', list.length >= 2, list.length);
        if (list.length < 2) throw new Error('명단 부족 — NAS 연결을 확인하세요');

        var nasAcct = window._nasAccount;
        var a = list.filter(function (m) { return m.key === nasAcct; })[0] || list[0];
        var b = list.filter(function (m) { return m.key !== a.key; })[0];

        // 🚪 로그아웃 → 고르는 화면이 뜬다
        window.appUserLogout();
        await new Promise(function (r) { setTimeout(r, 300); });
        ok('로그아웃하면 고르는 화면이 뜬다', gateOn());
        ok('안 고른 상태를 배지가 드러낸다', /누구|Who/.test(badge()), badge());
        // ⚠️ 안 골랐을 때의 기본은 **이 PC 의 NAS 계정** — 비워 두면 파일 이름이 빈 채로 간다.
        ok('안 고르면 이 PC 계정으로 떨어진다', window._dailyMyKey() === String(nasAcct || '').toLowerCase(),
           window._dailyMyKey() + ' vs ' + nasAcct);

        // 👤 다른 사람으로 바꾸면 **일일보고 파일 이름**이 따라온다(이게 이 기능의 전부이자 위험한 지점)
        window.appUserSet(b.key, b.name, false);
        await new Promise(function (r) { setTimeout(r, 300); });
        ok('고르면 화면이 닫힌다', !gateOn());
        ok('신원이 바뀐다', window._dailyMyKey() === b.key, window._dailyMyKey() + ' vs ' + b.key);
        ok('일일보고 파일 이름이 따라온다',
           window.DAILY_PATHS.file('2026-01-02', window._dailyMyKey()).indexOf('__' + b.key + '.json') > 0,
           window.DAILY_PATHS.file('2026-01-02', window._dailyMyKey()));
        ok('배지가 그 사람을 보여 준다', badge().indexOf(b.name) >= 0, badge());
        // ⚠️⚠️ NAS 연결은 **건드리지 않는다** — 끊으면 다음 사람이 아무것도 못 연다(형식적 전환이다).
        ok('NAS 계정·연결은 그대로', window._nasAccount === nasAcct, window._nasAccount + ' vs ' + nasAcct);

        // 🧹 훑어 둔 '내 프로젝트' 는 앞사람 기준이라 버려야 한다
        ok('일일보고 훑기 캐시가 비워진다', (window._dailyOtherScan || {}).total === 0, (window._dailyOtherScan || {}).total);
        ok('기간 요약 훑기 캐시가 비워진다', (window._psOtherScan || {}).key === '', (window._psOtherScan || {}).key);

        // 💾 기억 — 켜면 다음에 안 묻는다(끄면 매번 묻는다)
        window.appUserSet(a.key, a.name, true);
        ok('기억을 켜면 그렇게 적힌다', localStorage.getItem(U.rememberKey) === '1');
        window.appUserSet(a.key, a.name, false);
        ok('기억을 끄면 그렇게 적힌다', localStorage.getItem(U.rememberKey) === '0');

        // 🪟 한 번 닫은 뒤에도 다시 열린다(js/59 에서 났던 `display:flex` 버그와 같은 자리)
        window.appUserOpenPicker();
        await new Promise(function (r) { setTimeout(r, 200); });
        ok('닫았다 다시 열어도 보인다', gateOn());
        ok('고르는 목록이 그대로다', document.querySelectorAll('#app-user-pick option').length === list.length,
           document.querySelectorAll('#app-user-pick option').length + '/' + list.length);
        window._appUserClosePicker();

        // ⚙️ 설정 메뉴에 길이 있다
        ok('설정 메뉴에 사람 바꾸기·로그아웃이 있다',
           !!document.getElementById('app-user-switch-btn') && !!document.getElementById('app-user-logout-btn'));
    } catch (e) {
        ok('하네스가 끝까지 돌았다', false, String(e && e.message || e));
    } finally {
        window._dailySave = keep.save;
        if (keep.user == null) localStorage.removeItem(U.userKey); else localStorage.setItem(U.userKey, keep.user);
        if (keep.remember == null) localStorage.removeItem(U.rememberKey); else localStorage.setItem(U.rememberKey, keep.remember);
        if (window.DAILY_POLICY) {
            if (keep.draft == null) localStorage.removeItem(window.DAILY_POLICY.draftKey);
            else localStorage.setItem(window.DAILY_POLICY.draftKey, keep.draft);
        }
        var u = window._appUser();
        window._appUserKey = u ? u.key : '';
        if (window._appUserPaintBadge) window._appUserPaintBadge();
        window._appUserClosePicker();
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    return { pass: pass, fail: fail };
})();
