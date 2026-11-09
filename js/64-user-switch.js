/* ============================================================================
   👤 js/64-user-switch.js — "지금 누구로 보고 있나" 고르기 + 로그아웃 (2026-11-09, 사용자 요청)

   요청: "앱 실행하면 로그인 창 띄워주고 로그아웃 기능도 넣어줘 /
          하나의 PC에서 여러명이 자기 프로젝트 띄워놓고 발표해야 하는 경우가 필요하니까"
   그리고 이어서: **"형식적인 로그아웃 기능 — 회의실에서 업무 보고할 때"**

   ⚠️⚠️ 그래서 이건 **접근 제한이 아니다.** 비밀번호를 묻지 않고, 아무나 아무 이름이나 고를 수 있다.
      바뀌는 건 "앱이 **나**라고 보는 사람" 하나다 — 일일보고의 내 파일, '내 프로젝트', 담당자 기준.
      ⛔ 진짜 인증을 원하면 NAS 로그인을 붙여야 하는데, 그건 **실패 3번이면 그 PC 의 IP 가 잠긴다**
         (docs/nas-dsm.md). 회의실에서 돌려쓰며 타자 실수가 쌓이기 딱 좋은 자리라 **일부러 안 붙였다.**
      그래서 화면에도 "접근 제한이 아니다" 라고 적어 둔다 — 로그인처럼 보이면 사람은 지켜 준다고 믿는다.

   ⚠️⚠️ **가장 위험한 것은 일일보고 파일 이름이다.** `myKey()`(js/59)가 파일 이름을 정하므로,
      신원을 잘못 둔 채 저장하면 **남의 보고 파일에 쓴다**(이 설계의 단 하나뿐인 불변식이 깨진다).
      → 그래서 ① 고른 사람을 **헤더에 늘 띄우고** ② 바꾸면 훑어 둔 '내 프로젝트' 캐시를 **전부 버린다**.

   연결: js/59 `myKey()` 가 `window._appUserKey` 를 **맨 먼저** 본다(한 줄). 나머지(내 일 판정·
        담당자 필터·명단)는 전부 그 아래를 지나므로 따라온다.
   검증: tests/user-switch.browser.js
   ============================================================================ */
(function () {
    'use strict';

    window.USER_SWITCH = window.USER_SWITCH || {
        userKey: 'gantt_app_user',            // {key,name,at} — 이 브라우저가 기억하는 "지금 나"
        rememberKey: 'gantt_app_user_remember',
        askOnBoot: true,                      // 앱을 열면 고르는 화면부터
        bootDelayMs: 2500,                    // 명단(주소록)이 들어올 틈을 준다
        badgeId: 'app-user-badge'
    };
    var U = window.USER_SWITCH;

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

    /** 명단(주소록 기반). 아직 안 들어왔으면 빈 배열 — 그땐 화면이 "불러오는 중" 으로 말한다. */
    function roster() {
        var list = (typeof window._dailyRoster === 'function') ? (window._dailyRoster() || []) : [];
        return list.filter(function (m) { return m && m.key && m.active !== false; });
    }

    /** 이 PC 의 NAS 계정에 해당하는 사람 — 고르는 화면의 기본값. */
    function defaultKey() {
        return String(window._nasAccount || '').trim().toLowerCase();
    }

    // ── 신원 적용 ───────────────────────────────────────────────────────────
    /**
     * ⚠️ 바꾸면 **훑어 둔 것을 전부 버린다** — '내 프로젝트'·'내 일' 은 사람마다 다른데,
     *    캐시가 남아 있으면 앞사람 기준이 그대로 보인다(오류는 안 난다 = 조용한 오답).
     */
    function apply(u) {
        window._appUserKey = u ? u.key : '';
        if (u && u.name) window.currentUserName = u.name;
        try { if (window._dailyResetScans) window._dailyResetScans(); } catch (e) { /* 없으면 그만 */ }
        try { if (window._psResetScan) window._psResetScan(); } catch (e) { /* 없으면 그만 */ }
        paintBadge();
        try { if (window.dailyRenderTab) window.dailyRenderTab(); } catch (e) { /* 탭이 없을 수 있다 */ }
        try {
            var m = document.getElementById('ai-summary-modal');
            if (m && m.style.display !== 'none' && window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
        } catch (e) { /* 모달이 없으면 그만 */ }
    }

    window.appUserSet = function (key, name, remember) {
        var k = String(key || '').trim();
        if (!k) return;
        var u = { key: k, name: String(name || k), at: Date.now() };
        try {
            localStorage.setItem(U.userKey, JSON.stringify(u));
            localStorage.setItem(U.rememberKey, remember ? '1' : '0');
        } catch (e) { /* 저장소가 꽉 차도 이번 판은 돌아야 한다 */ }
        apply(u);
        closePicker();
        if (window.showToast) window.showToast('👤 ' + T(u.name + ' 으로 보고 있습니다.', 'Viewing as ' + u.name), 'info');
    };

    /**
     * 🚪 로그아웃 — **형식적인 것**이다. NAS 연결은 그대로 둔다(끊으면 다음 사람이 아무것도 못 연다).
     *    바뀌는 건 "앱이 나라고 보는 사람" 뿐이고, 고르는 화면이 다시 뜬다.
     */
    window.appUserLogout = function () {
        try { localStorage.removeItem(U.userKey); localStorage.removeItem(U.rememberKey); } catch (e) { /* 무시 */ }
        apply(null);
        openPicker();
    };

    // ── 고르는 화면 ─────────────────────────────────────────────────────────
    function closePicker() {
        var el = document.getElementById('app-user-gate');
        if (el) el.style.display = 'none';
    }
    window._appUserClosePicker = closePicker;

    function pickerHtml() {
        var list = roster();
        var cur = (readUser() || {}).key || defaultKey();
        var opts = list.map(function (m) {
            var label = (m.name || m.key) + (m.team ? ' · ' + m.team : '');
            return '<option value="' + esc(m.key) + '"' + (m.key === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('');
        var none = !list.length;
        return '' +
        '<div style="width:min(420px,92vw); background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,.25); padding:28px 26px 22px; text-align:center;">' +
          '<div style="font-size:30px; font-weight:900; letter-spacing:-1px; color:#00707d; margin-bottom:4px;">kortek</div>' +
          '<div style="font-size:12px; color:#888; margin-bottom:18px;">' + esc(T('업무 관리', 'Project Manager')) + '</div>' +
          (none
            ? '<div style="padding:14px; background:#fff8e6; border:1px solid #f0d9a0; border-radius:8px; font-size:12px; color:#8a6d3b; margin-bottom:14px;">' +
                esc(T('명단을 아직 못 불러왔습니다 — NAS 연결을 확인하고 새로고침해주세요. (👥 명단은 주소록에서 만들어집니다)',
                      'Roster not loaded yet — check the NAS connection and reload.')) + '</div>'
            : '<select id="app-user-pick" style="width:100%; box-sizing:border-box; padding:11px 12px; border:1px solid #2aa5b5; border-radius:6px; font-size:14px; background:#eef8fa; margin-bottom:10px;">' + opts + '</select>') +
          '<button onclick="window._appUserSubmit()" ' + (none ? 'disabled ' : '') +
            'style="width:100%; box-sizing:border-box; padding:11px 0; border:none; border-radius:6px; background:' + (none ? '#bbb' : '#19b4c8') + '; color:#fff; font-size:15px; font-weight:bold; cursor:' + (none ? 'default' : 'pointer') + ';">' +
            esc(T('시작', 'Start')) + '</button>' +
          '<label style="display:flex; align-items:center; gap:6px; margin-top:12px; font-size:12px; color:#666; cursor:pointer;">' +
            '<input type="checkbox" id="app-user-remember"' + (remembered() ? ' checked' : '') + '> ' +
            esc(T('이 PC 에서 기억 (다음부터 이 창을 안 띄웁니다)', 'Remember on this PC')) + '</label>' +
          // ⚠️ 로그인처럼 보이면 사람은 "지켜 준다"고 믿는다 — 아니라고 적는다.
          '<div style="margin-top:14px; padding-top:12px; border-top:1px solid #eee; font-size:11px; color:#aaa; line-height:1.5; text-align:left;">' +
            esc(T('이 화면은 일일보고·내 프로젝트·담당자를 누구 기준으로 볼지 정합니다. 비밀번호를 묻지 않으며 접근을 막지 않습니다 — 회의실에서 발표자를 바꾸기 위한 것입니다.',
                  'This only sets whose daily report / projects you are looking at. It asks no password and restricts nothing.')) +
          '</div>' +
        '</div>';
    }

    function openPicker() {
        var el = document.getElementById('app-user-gate');
        if (!el) {
            el = document.createElement('div');
            el.id = 'app-user-gate';
            el.style.cssText = 'position:fixed; inset:0; z-index:99000; background:rgba(245,248,250,.97); display:flex; align-items:center; justify-content:center;';
            document.body.appendChild(el);
        }
        el.style.display = 'flex';            // ⚠️ 닫을 때 none 으로 두므로 열 때마다 다시 켠다(js/59 와 같은 버그를 피한다)
        el.innerHTML = pickerHtml();
    }
    window.appUserOpenPicker = openPicker;

    window._appUserSubmit = function () {
        var sel = document.getElementById('app-user-pick');
        var rem = document.getElementById('app-user-remember');
        if (!sel || !sel.value) return;
        var name = sel.options[sel.selectedIndex] ? String(sel.options[sel.selectedIndex].textContent).split(' · ')[0] : sel.value;
        window.appUserSet(sel.value, name, !!(rem && rem.checked));
    };

    // ── 헤더 배지 ───────────────────────────────────────────────────────────
    function paintBadge() {
        var host = document.getElementById('lang-toggle-btn');
        if (!host || !host.parentNode) return;
        var b = document.getElementById(U.badgeId);
        if (!b) {
            b = document.createElement('button');
            b.id = U.badgeId;
            b.className = 'topbar-btn';
            b.onclick = function () { window.appUserOpenPicker(); };
            host.parentNode.insertBefore(b, host);
        }
        var u = readUser();
        // ⚠️ 안 고른 상태도 **보여 준다** — 비워 두면 "아무나"로 저장될 수 있다는 걸 아무도 모른다.
        b.textContent = '👤 ' + (u ? u.name : T('누구?', 'Who?'));
        b.title = u
            ? T(u.name + ' 기준으로 보고 있습니다 — 누르면 바꿉니다', 'Viewing as ' + u.name + ' — click to switch')
            : T('누구로 볼지 아직 안 골랐습니다 — 누르면 고릅니다', 'No one picked yet — click to choose');
        b.style.cssText = 'flex-shrink:0; ' + (u ? '' : 'background:#fbead9; color:#a85d0a; border-color:#edbf85;');
    }
    window._appUserPaintBadge = paintBadge;

    // ── 시작할 때 ───────────────────────────────────────────────────────────
    async function boot() {
        try { if (window.dailyLoadRoster) await window.dailyLoadRoster(); } catch (e) { /* 명단 없이도 화면은 뜬다 */ }
        var u = readUser();
        if (u) {
            apply(u);
            // 기억 안 했으면 매번 묻는다(발표용 PC 에서 앞사람 이름이 그대로 남지 않게).
            if (!remembered() && U.askOnBoot) openPicker();
            return;
        }
        apply(null);
        if (U.askOnBoot) openPicker();
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', function () { setTimeout(boot, U.bootDelayMs); });
    } else {
        setTimeout(boot, U.bootDelayMs);
    }
})();
