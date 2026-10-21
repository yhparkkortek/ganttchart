// ═══ 🔑 SAP 자동 로그인 설정 (2026-10-13, 사용자 요청) ═══════════════════════════════════
// SAP이 꺼져 있거나 로그아웃된 상태에서 SAP 질문을 하면, 여기서 등록한 계정으로 자동 로그인한 뒤
// 명령을 수행한다. 실제 로그인은 백엔드(sap_bridge_32.py `_get_sap_session`)가 하고, 이 파일은
// ① 설정 모달(접속항목/클라이언트/ID/비밀번호 저장·삭제·테스트) ② 로그인 시간만큼 SAP 조회 타임아웃 연장만 담당.
// 비밀번호는 백엔드가 Windows DPAPI로 암호화해 이 PC에만 저장하고 어떤 응답에도 돌려주지 않는다 —
// 이 파일/브라우저(localStorage 포함)에는 비밀번호를 남기지 않는다(입력칸도 저장 즉시 비움).
(function () {
    'use strict';
    const BASE = 'http://127.0.0.1:5000';
    const T = function (ko, en) { return window._t ? window._t(ko, en) : ko; };
    const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

    window._sapAutoLoginOn = false;

    // 설정 유무를 미리 알아둔다(SAP 조회 타임아웃 연장 판단용). 백엔드가 꺼져 있으면 조용히 무시.
    window._sapLoginRefreshState = function () {
        return fetch(BASE + '/sap-login-config').then(function (r) { return r.json(); }).then(function (d) {
            window._sapAutoLoginOn = !!(d && d.configured);
            return d;
        }).catch(function () { return null; });
    };
    setTimeout(function () { window._sapLoginRefreshState(); }, 2500);

    // 자동 로그인이 켜져 있으면 SAP 조회 요청에 로그인 시간(최대 ~45초)을 더 준다 — 안 그러면 로그인하다가
    // 프런트 타임아웃(예: 단일 BOM 30초)이 먼저 끊는다. 타임아웃 메시지에 'SAP'가 들어간 호출만 대상.
    const origWithTimeout = window._withTimeout;
    if (typeof origWithTimeout === 'function') {
        window._withTimeout = function (promise, ms, msg) {
            if (window._sapAutoLoginOn && /SAP/i.test(String(msg || ''))) ms = (ms || 0) + 45000;
            return origWithTimeout.call(this, promise, ms, msg);
        };
    }

    function setStatus(html, kind) {
        const el = document.getElementById('saplogin-status');
        if (!el) return;
        el.style.display = html ? 'block' : 'none';
        el.style.color = kind === 'err' ? '#a3281c' : (kind === 'ok' ? '#1f7a3d' : '#555');
        el.innerHTML = html || '';
    }

    function fieldRow(label, inner) {
        return '<label style="display:flex; align-items:center; gap:8px; margin-bottom:9px; font-size:12px;">'
            + '<span style="width:92px; flex:0 0 auto; color:#555;">' + label + '</span>' + inner + '</label>';
    }
    const inputSt = 'flex:1; min-width:0; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:12px;';
    const btnSt = 'padding:7px 14px; border-radius:6px; font-size:12px; cursor:pointer; border:1px solid #ffe08a; background:#fff8e6; color:#7a5210;';

    window.openSapLoginSettings = async function () {
        let wrap = document.getElementById('saplogin-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'saplogin-modal';
            wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
            wrap.innerHTML =
                '<div id="saplogin-box" style="pointer-events:all; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);'
                + ' width:min(440px,94vw); background:#fff; box-shadow:0 8px 30px rgba(0,0,0,.3); border-radius:10px; overflow:hidden;'
                + ' display:flex; flex-direction:column;">'
                // SAP 계열 → 하늘색 헤더(ui-conventions)
                + '<div id="saplogin-drag" style="padding:10px 14px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2;'
                + ' cursor:move; display:flex; align-items:center; gap:8px;">'
                + '<strong style="font-size:14px;">🔑 ' + T('자동 로그인 설정', 'Auto-login settings') + '</strong>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="document.getElementById(\'saplogin-modal\').style.display=\'none\'"'
                + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text);'
                + ' border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div style="padding:14px 16px;">'
                + '<div style="font-size:11.5px; color:#666; margin-bottom:12px; line-height:1.5;">'
                + T('SAP이 꺼져 있거나 로그아웃된 상태에서 SAP 질문을 하면 이 계정으로 자동 로그인한 뒤 명령을 수행합니다. '
                    + '비밀번호는 <b>이 PC의 Windows 계정에 묶여 암호화</b>되어 저장되며(다른 PC/계정에선 복호화 불가) 화면·로그에 다시 나오지 않습니다.',
                    'If SAP is closed or logged out, asking a SAP question logs in with this account first. '
                    + 'The password is stored <b>encrypted and bound to this PC\'s Windows account</b> and is never shown again.')
                + '</div>'
                + fieldRow(T('접속 항목', 'Connection'), '<input id="saplogin-sysname" list="saplogin-entries" style="' + inputSt + '" placeholder="SAP Logon 목록의 이름"><datalist id="saplogin-entries"></datalist>')
                + fieldRow(T('클라이언트', 'Client'), '<input id="saplogin-client" maxlength="3" style="' + inputSt + '" placeholder="예: 100 (비워도 됨)">')
                + fieldRow(T('사용자 ID', 'User ID'), '<input id="saplogin-user" autocomplete="off" style="' + inputSt + '">')
                + fieldRow(T('비밀번호', 'Password'), '<input id="saplogin-pw" type="password" autocomplete="new-password" style="' + inputSt + '">')
                + fieldRow(T('언어', 'Language'), '<input id="saplogin-lang" maxlength="2" style="' + inputSt + '" value="KO">')
                + '<div id="saplogin-status" style="display:none; font-size:11.5px; margin:4px 0 10px; line-height:1.5; white-space:pre-wrap;"></div>'
                + '<div style="display:flex; gap:8px;">'
                + '<button onclick="window._sapLoginDelete()" style="' + btnSt + ' background:#fdecea; color:#a3281c; border-color:#f0b4ad;">🗑 ' + T('설정 삭제', 'Delete') + '</button>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="window._sapLoginTest()" style="' + btnSt + '">🔌 ' + T('로그인 테스트', 'Test login') + '</button>'
                + '<button onclick="window._sapLoginSave()" style="' + btnSt + ' font-weight:bold;">💾 ' + T('저장', 'Save') + '</button>'
                + '</div>'
                // ── 🏢 그룹웨어(다우오피스) ─────────────────────────────────
                //  SAP과 같은 자리에 두는 게 맞다(사용자 요청) — 둘 다 "사외 시스템 자동 로그인".
                //  ⚠️ 다만 동작 규칙이 SAP보다 더 보수적이다: 이 사이트는 **로그인 실패 후에만**
                //     CAPTCHA가 뜨므로, 실패하면 재시도하지 않고 창을 열어 사람에게 넘긴다.
                + '<div style="border-top:1px solid #e5e5e5; margin:14px 0 12px;"></div>'
                + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">'
                + '<strong style="font-size:13px; color:#5b3fa3;">🏢 ' + T('그룹웨어 자동 로그인', 'Groupware auto-login') + '</strong>'
                + '<span id="gwlogin-state" style="font-size:11px; color:#888;"></span></div>'
                + '<div style="font-size:11.5px; color:#666; margin-bottom:10px; line-height:1.5;">'
                + T('그룹웨어는 <b>로그인에 실패해야 보안문자(CAPTCHA)가 나타나는</b> 구조라, '
                    + '자동 로그인은 <b>한 번만</b> 시도하고 실패하면 재시도하지 않고 창을 열어드립니다 '
                    + '(계정이 잠기면 메일·전자결재까지 멈춥니다). 비밀번호 보관 방식은 SAP과 동일합니다.',
                    'Groupware shows a CAPTCHA only <b>after a failed sign-in</b>, so auto-login is tried '
                    + '<b>once</b> and never retried — the window opens for you instead. Password storage is the same as SAP.')
                + '</div>'
                + fieldRow(T('아이디', 'ID'), '<input id="gwlogin-user" autocomplete="off" style="' + inputSt + '" placeholder="예: yhpark">')
                + fieldRow(T('비밀번호', 'Password'), '<input id="gwlogin-pw" type="password" autocomplete="new-password" style="' + inputSt + '">')
                + '<div id="gwlogin-status" style="display:none; font-size:11.5px; margin:4px 0 10px; line-height:1.5; white-space:pre-wrap;"></div>'
                + '<div style="display:flex; gap:8px;">'
                + '<button onclick="window._gwLoginDelete()" style="' + btnSt + ' background:#fdecea; color:#a3281c; border-color:#f0b4ad;">🗑 ' + T('설정 삭제', 'Delete') + '</button>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="window._gwLoginTest()" style="' + btnSt + '">🔌 ' + T('로그인 테스트', 'Test login') + '</button>'
                + '<button onclick="window._gwLoginSave()" style="' + btnSt + ' font-weight:bold;">💾 ' + T('저장', 'Save') + '</button>'
                + '</div>'
                // ── 🧑‍💼 인사관리(kInsa) ─────────────────────────────────────
                //  http://insa.kortek.co.kr — SAP·그룹웨어와 같은 "사외 시스템 자동 로그인" 묶음.
                //  ⚠️ 그룹웨어와 같은 보수적 규칙: **한 번만** 시도하고 실패하면 재시도하지 않는다.
                //     이 시스템이 몇 번 틀리면 잠기는지 우리가 모르기 때문이다(모르면 안 한다).
                + '<div style="border-top:1px solid #e5e5e5; margin:14px 0 12px;"></div>'
                + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">'
                + '<strong style="font-size:13px; color:#1a6b73;">🧑‍💼 ' + T('인사관리 자동 로그인', 'HR (kInsa) auto-login') + '</strong>'
                + '<span id="insalogin-state" style="font-size:11px; color:#888;"></span></div>'
                + '<div style="font-size:11.5px; color:#666; margin-bottom:10px; line-height:1.5;">'
                + T('사내 인사관리(insa.kortek.co.kr) 자동 로그인입니다. 아이디는 <b>사번</b>입니다. '
                    + '그룹웨어와 같은 이유로 <b>한 번만</b> 시도하고 실패하면 재시도하지 않습니다. '
                    + '비밀번호 보관 방식은 SAP·그룹웨어와 동일합니다(이 PC의 Windows 계정에서만 풀림).',
                    'Auto-login for the in-house HR system (insa.kortek.co.kr). The ID is your <b>employee number</b>. '
                    + 'Like groupware it is tried <b>once</b> and never retried. Password storage is the same as SAP.')
                + '</div>'
                + fieldRow(T('아이디(사번)', 'ID (emp. no.)'), '<input id="insalogin-user" autocomplete="off" style="' + inputSt + '" placeholder="' + T('예: 12345', 'e.g. 12345') + '">')
                + fieldRow(T('비밀번호', 'Password'), '<input id="insalogin-pw" type="password" autocomplete="new-password" style="' + inputSt + '">')
                + '<div id="insalogin-status" style="display:none; font-size:11.5px; margin:4px 0 10px; line-height:1.5; white-space:pre-wrap;"></div>'
                + '<div style="display:flex; gap:8px;">'
                + '<button onclick="window._insaLoginDelete()" style="' + btnSt + ' background:#fdecea; color:#a3281c; border-color:#f0b4ad;">🗑 ' + T('설정 삭제', 'Delete') + '</button>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="window._insaLoginTest()" style="' + btnSt + '">🔌 ' + T('로그인 테스트', 'Test login') + '</button>'
                + '<button onclick="window._insaLoginSave()" style="' + btnSt + ' font-weight:bold;">💾 ' + T('저장', 'Save') + '</button>'
                + '</div></div></div>';
            document.body.appendChild(wrap);
            if (window._makeDraggable) window._makeDraggable('saplogin-box', 'saplogin-drag');
            if (window._bindClickToFront) window._bindClickToFront('saplogin-modal');
        }
        wrap.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('saplogin-modal');
        setStatus('', '');
        document.getElementById('saplogin-pw').value = '';
        // 현재 저장 상태 + SAP Logon 접속 항목 목록
        try {
            const [cfg, ent] = await Promise.all([
                fetch(BASE + '/sap-login-config').then(function (r) { return r.json(); }),
                fetch(BASE + '/sap-login-entries').then(function (r) { return r.json(); })
            ]);
            document.getElementById('saplogin-entries').innerHTML = (ent.entries || []).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
            if (cfg.configured) {
                document.getElementById('saplogin-sysname').value = cfg.sysname || '';
                document.getElementById('saplogin-client').value = cfg.client || '';
                document.getElementById('saplogin-user').value = cfg.user || '';
                document.getElementById('saplogin-lang').value = cfg.language || 'KO';
                document.getElementById('saplogin-pw').placeholder = T('(저장됨 — 바꿀 때만 입력)', '(saved — type only to change)');
                setStatus('✅ ' + T('자동 로그인이 설정돼 있습니다.', 'Auto-login is configured.'), 'ok');
            } else if ((ent.entries || []).length === 1 && !document.getElementById('saplogin-sysname').value) {
                document.getElementById('saplogin-sysname').value = ent.entries[0]; // 항목이 하나뿐이면 미리 채움
            }
            window._sapAutoLoginOn = !!cfg.configured;
        } catch (e) {
            setStatus('⚠️ ' + T('백엔드(kortek_backend)에 연결하지 못했습니다 — 실행 중인지 확인해주세요.', 'Could not reach the backend — is it running?'), 'err');
        }
        window._gwLoginRefresh();
        window._insaLoginRefresh();
    };

    // ── 🏢 그룹웨어 자동 로그인 ───────────────────────────────────────
    var gwStatus = function (msg, kind) {
        var el = document.getElementById('gwlogin-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'ok' ? '#1f7a3d' : (kind === 'err' ? '#b1432f' : '#555');
        el.textContent = msg || '';
    };

    window._gwLoginRefresh = async function () {
        var st = document.getElementById('gwlogin-state');
        var pwEl = document.getElementById('gwlogin-pw');
        if (pwEl) pwEl.value = '';
        gwStatus('', '');
        try {
            var cfg = await fetch(BASE + '/gw/login-config').then(function (r) { return r.json(); });
            if (cfg.configured) {
                document.getElementById('gwlogin-user').value = cfg.user || '';
                if (pwEl) pwEl.placeholder = T('(저장됨 — 바꿀 때만 입력)', '(saved — type only to change)');
                if (st) { st.textContent = T('· 설정됨', '· configured'); st.style.color = '#1f7a3d'; }
            } else if (st) {
                st.textContent = T('· 미설정', '· not set'); st.style.color = '#999';
            }
        } catch (e) {
            if (st) { st.textContent = T('· 백엔드 연결 안 됨', '· backend unreachable'); st.style.color = '#b1432f'; }
        }
    };

    window._gwLoginSave = async function () {
        var user = (document.getElementById('gwlogin-user').value || '').trim();
        var pw = document.getElementById('gwlogin-pw').value;
        if (!user) { gwStatus('⚠️ ' + T('아이디를 입력해주세요.', 'Enter the ID.'), 'err'); return false; }
        if (!pw) { gwStatus('⚠️ ' + T('비밀번호를 입력해주세요.', 'Enter the password.'), 'err'); return false; }
        try {
            var r = await fetch(BASE + '/gw/login-config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: user, pw: pw })
            });
            var d = await r.json();
            document.getElementById('gwlogin-pw').value = '';
            gwStatus(d.ok ? ('✅ ' + d.message) : ('⚠️ ' + (d.message || '')), d.ok ? 'ok' : 'err');
            if (d.ok) window._gwLoginRefresh();
            return !!d.ok;
        } catch (e) {
            gwStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
            return false;
        }
    };

    window._gwLoginTest = async function () {
        // 비밀번호를 새로 입력했으면 먼저 저장하고 시도한다(SAP 테스트와 같은 흐름)
        if (document.getElementById('gwlogin-pw').value) {
            if (!(await window._gwLoginSave())) return;
        }
        gwStatus('⏳ ' + T('로그인 시도 중… (실패해도 재시도하지 않습니다)', 'Signing in… (no retry on failure)'), '');
        try {
            var d = await fetch(BASE + '/gw/login', { method: 'POST' }).then(function (r) { return r.json(); });
            if (d.ok) {
                var em = (d.session && d.session.email) || '';
                gwStatus('✅ ' + (d.result === 'already'
                    ? T('이미 로그인되어 있습니다. ', 'Already signed in. ')
                    : T('로그인했습니다. ', 'Signed in. ')) + em, 'ok');
                if (window._gwLoadEvents) window._gwLoadEvents(true);
            } else {
                gwStatus('🔒 ' + (d.message || ''), 'err');
            }
        } catch (e) {
            gwStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
        }
    };

    window._gwLoginDelete = async function () {
        if (!confirm(T('저장된 그룹웨어 로그인 정보를 삭제할까요?', 'Delete the saved groupware login?'))) return;
        try {
            var d = await fetch(BASE + '/gw/login-config', { method: 'DELETE' }).then(function (r) { return r.json(); });
            document.getElementById('gwlogin-user').value = '';
            document.getElementById('gwlogin-pw').value = '';
            gwStatus(d.ok ? ('🗑 ' + d.message) : ('⚠️ ' + (d.message || '')), d.ok ? 'ok' : 'err');
            window._gwLoginRefresh();
        } catch (e) {
            gwStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
        }
    };

    // ── 🧑‍💼 인사관리(kInsa) 자동 로그인 ─────────────────────────────
    //  그룹웨어 블록과 같은 모양이다 — 같은 성격의 기능이 창 안에서 다르게 생기면 안 된다.
    var insaStatus = function (msg, kind) {
        var el = document.getElementById('insalogin-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'ok' ? '#1f7a3d' : (kind === 'err' ? '#b1432f' : '#555');
        el.textContent = msg || '';
    };

    window._insaLoginRefresh = async function () {
        var st = document.getElementById('insalogin-state');
        var pwEl = document.getElementById('insalogin-pw');
        if (pwEl) pwEl.value = '';
        insaStatus('', '');
        try {
            var cfg = await fetch(BASE + '/insa/login-config').then(function (r) { return r.json(); });
            if (cfg.configured) {
                document.getElementById('insalogin-user').value = cfg.user || '';
                if (pwEl) pwEl.placeholder = T('(저장됨 — 바꿀 때만 입력)', '(saved — type only to change)');
                if (st) { st.textContent = T('· 설정됨', '· configured'); st.style.color = '#1f7a3d'; }
            } else if (st) {
                st.textContent = T('· 미설정', '· not set'); st.style.color = '#999';
            }
        } catch (e) {
            if (st) { st.textContent = T('· 백엔드 연결 안 됨', '· backend unreachable'); st.style.color = '#b1432f'; }
        }
    };

    window._insaLoginSave = async function () {
        var user = (document.getElementById('insalogin-user').value || '').trim();
        var pw = document.getElementById('insalogin-pw').value;
        if (!user) { insaStatus('⚠️ ' + T('아이디(사번)를 입력해주세요.', 'Enter the ID.'), 'err'); return false; }
        if (!pw) { insaStatus('⚠️ ' + T('비밀번호를 입력해주세요.', 'Enter the password.'), 'err'); return false; }
        try {
            var r = await fetch(BASE + '/insa/login-config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: user, pw: pw })
            });
            var d = await r.json();
            document.getElementById('insalogin-pw').value = '';
            insaStatus(d.ok ? ('✅ ' + d.message) : ('⚠️ ' + (d.message || '')), d.ok ? 'ok' : 'err');
            if (d.ok) { _insaTried = false; _insaFailMsg = ''; window._insaLoginRefresh(); }
            return !!d.ok;
        } catch (e) {
            insaStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
            return false;
        }
    };

    window._insaLoginTest = async function () {
        if (document.getElementById('insalogin-pw').value) {
            if (!(await window._insaLoginSave())) return;
        }
        insaStatus('⏳ ' + T('로그인 시도 중… (실패해도 재시도하지 않습니다)', 'Signing in… (no retry on failure)'), '');
        try {
            var d = await fetch(BASE + '/insa/login', { method: 'POST' }).then(function (r) { return r.json(); });
            // 사람이 직접 누른 테스트는 **가드를 푼다** — 비밀번호를 고쳤을 수 있다.
            _insaTried = !d.ok; _insaFailMsg = d.ok ? '' : (d.message || '');
            insaStatus((d.ok ? '✅ ' : '🔒 ') + (d.message || ''), d.ok ? 'ok' : 'err');
        } catch (e) {
            insaStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
        }
    };

    window._insaLoginDelete = async function () {
        if (!confirm(T('저장된 인사관리 로그인 정보를 삭제할까요?', 'Delete the saved HR login?'))) return;
        try {
            var d = await fetch(BASE + '/insa/login-config', { method: 'DELETE' }).then(function (r) { return r.json(); });
            document.getElementById('insalogin-user').value = '';
            document.getElementById('insalogin-pw').value = '';
            _insaTried = false; _insaFailMsg = '';
            insaStatus(d.ok ? ('🗑 ' + d.message) : ('⚠️ ' + (d.message || '')), d.ok ? 'ok' : 'err');
            window._insaLoginRefresh();
        } catch (e) {
            insaStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
        }
    };

    // ── 🔑 인사관리 자동 로그인 게이트 ────────────────────────────────
    //
    // ⚠️⚠️ **계정 잠금 방지가 이 함수의 존재 이유다.** 그룹웨어의 _gwEnsureLogin 과 같은 역할.
    //    이 시스템이 몇 번 틀리면 잠기는지 확인할 방법이 없으므로, 한 세션에서 **한 번 실패하면
    //    다시 시도하지 않고** 그때 받은 사유를 그대로 돌려준다. 가드는 여기(프런트)에 있다 —
    //    백엔드 /insa/login 은 부를 때마다 그냥 시도하므로, 새 경로를 붙일 땐 **반드시 이 함수를
    //    통할 것**(/insa/login 을 직접 부르지 말 것).
    var _insaTried = false, _insaFailMsg = '';

    window._insaEnsureLogin = async function (onStep) {
        var say = function (m) { try { if (onStep) onStep(m); } catch (e) { /* 안내 실패가 흐름을 막지 않게 */ } };
        var st;
        try {
            st = await fetch(BASE + '/insa/status').then(function (r) { return r.json(); });
        } catch (e) {
            return { ok: false, message: T('백엔드(kortek_backend)에 연결하지 못했습니다 — 실행 중인지 확인해주세요.',
                                           'Could not reach the backend — is it running?') };
        }
        if (st && st.loggedIn) return { ok: true };
        if (st && !st.reachable) return { ok: false, message: st.message || T('인사관리 서버에 연결할 수 없습니다.', 'HR server unreachable.') };
        if (!st || !st.configured) {
            return { ok: false, message: T('🔑 저장된 인사관리 로그인 정보가 없습니다 — AI 문답 창의 🔑에서 등록해주세요.',
                                           'No saved HR login — register it under 🔑.') };
        }
        if (_insaTried) {
            // 이미 한 번 실패했다. **다시 시도하지 않는다.**
            return { ok: false, message: _insaFailMsg || T('인사관리 로그인에 실패했습니다 — 🔑에서 확인해주세요.',
                                                           'HR sign-in failed — check it under 🔑.') };
        }
        _insaTried = true;
        say('🔑 ' + T('인사관리 자동 로그인 시도 중... (실패해도 재시도하지 않습니다)',
                      'Signing in to HR... (no retry on failure)'));
        var d;
        try {
            d = await fetch(BASE + '/insa/login', { method: 'POST' }).then(function (r) { return r.json(); });
        } catch (e) {
            _insaFailMsg = T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.');
            return { ok: false, message: _insaFailMsg };
        }
        if (d && d.ok) { _insaTried = false; _insaFailMsg = ''; return { ok: true }; }
        _insaFailMsg = '🔒 ' + ((d && d.message) || T('인사관리 로그인에 실패했습니다.', 'HR sign-in failed.'));
        return { ok: false, message: _insaFailMsg };
    };


    // ── 🔑 그룹웨어 자동 로그인 게이트 (AI 문답 그룹웨어 경로 공용) ─────────────
    //
    // [2026-10-20] 그전까지 AI 문답의 그룹웨어 경로(도구 루프 js/40, 04h의 메일·게시판·
    // 기안 블록)는 /gw/status만 보고, 끊겨 있으면 "🔑에서 로그인해주세요"라며 **포기**했다.
    // 계정을 저장해 뒀는데도 명령마다 사람이 🔑을 눌러야 했다 — 사용자 요청으로 연결한다.
    // (SAP 자동 로그인을 2026-10-13에 허용한 것과 같은 번복이다.)
    //
    // ⚠️⚠️ **계정 잠금 방지가 이 함수의 존재 이유다.** 그룹웨어는 로그인에 실패해야
    //   CAPTCHA가 뜨는 구조라, 실패를 반복하면 사내 계정이 잠긴다. 그래서:
    //     · 백엔드 login_once()는 "호출 1회 = 시도 1회"일 뿐 실패를 기억하지 않는다
    //       (gw_bridge.py). → **재시도 금지 가드는 여기(프런트)에 있어야 한다.**
    //     · 실패하면 이 페이지 세션 동안 두 번 다시 자동 시도하지 않고, 기억해 둔 사유를
    //       그대로 돌려준다. 사람이 🔑에서 직접 하는 길만 남긴다.
    //     · 성공하면 가드를 푼다 — 나중에 세션이 만료돼도 한 번은 더 받아준다. 실패가
    //       반복될 수는 없다(한 번 실패하면 잠기고, 푸는 건 성공뿐이다).
    //     · 이미 로그인돼 있으면 /gw/login을 **아예 부르지 않는다**(상태 조회로 끝).
    //
    // 반환: { ok:true, session } | { ok:false, message:'사용자에게 보여줄 한 줄' }
    var _gwAutoTried  = false;   // 이 페이지 세션에서 자동 로그인을 시도했는가
    var _gwAutoFailMsg = '';     // 실패 사유(재사용 — 같은 이유로 다시 시도하지 않는다)

    window._gwEnsureLogin = async function (onStep) {
        var say = (typeof onStep === 'function') ? onStep : function () {};

        // ① 현재 상태부터. 로그인돼 있으면 아무것도 하지 않는다.
        var st;
        try {
            st = await fetch(BASE + '/gw/status').then(function (r) { return r.json(); });
        } catch (e) {
            return { ok: false, message: '⚠️ ' + T('백엔드(127.0.0.1:5000)에 연결할 수 없습니다 — kortek_backend가 켜져 있는지 확인해주세요.',
                                                   'Cannot reach the local backend (127.0.0.1:5000).') };
        }
        if (st && st.ok) return { ok: true, session: st };

        // ② 이미 한 번 시도해 실패했다면 **다시 시도하지 않는다**(계정 잠금 방지).
        if (_gwAutoTried) return { ok: false, message: _gwAutoFailMsg };

        // ③ 저장된 계정으로 단 한 번.
        _gwAutoTried = true;
        say('🔑 ' + T('그룹웨어 자동 로그인 시도 중... (실패해도 재시도하지 않습니다)',
                      'Signing in to groupware... (no retry on failure)'));
        var d;
        try {
            d = await fetch(BASE + '/gw/login', { method: 'POST' }).then(function (r) { return r.json(); });
        } catch (e) {
            _gwAutoFailMsg = '⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.');
            return { ok: false, message: _gwAutoFailMsg };
        }
        if (d && d.ok) { _gwAutoTried = false; return { ok: true, session: d.session }; }

        _gwAutoFailMsg = (d && d.result === 'not_configured')
            ? ('🔑 ' + (d.message || T('저장된 그룹웨어 로그인 정보가 없습니다 — AI 문답 창의 🔑에서 등록해주세요.',
                                       'No saved groupware login — register it with the 🔑 here.')))
            : ('🔒 ' + (d && d.message ? d.message
                                       : T('그룹웨어 로그인에 실패했습니다 — AI 문답 창의 🔑에서 직접 로그인해주세요.',
                                           'Groupware sign-in failed — use the 🔑 here.'))
               + ' ' + T('(계정 잠금을 막기 위해 자동 재시도는 하지 않습니다)',
                         '(no automatic retry, to avoid account lockout)'));
        return { ok: false, message: _gwAutoFailMsg };
    };

    window._sapLoginSave = async function () {
        const g = function (id) { return (document.getElementById(id).value || '').trim(); };
        const body = { sysname: g('saplogin-sysname'), client: g('saplogin-client'), user: g('saplogin-user'),
                       language: g('saplogin-lang') || 'KO', password: document.getElementById('saplogin-pw').value };
        if (!body.sysname || !body.user) { setStatus('⚠️ ' + T('접속 항목과 사용자 ID는 필수입니다.', 'Connection and User ID are required.'), 'err'); return false; }
        try {
            const r = await fetch(BASE + '/sap-login-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const d = await r.json();
            document.getElementById('saplogin-pw').value = '';  // 입력칸에 비밀번호를 남기지 않는다
            if (!d.ok) { setStatus('⚠️ ' + esc(d.error || T('저장 실패', 'Save failed')), 'err'); return false; }
            window._sapAutoLoginOn = true;
            document.getElementById('saplogin-pw').placeholder = T('(저장됨 — 바꿀 때만 입력)', '(saved — type only to change)');
            setStatus('✅ ' + T('저장했습니다. "로그인 테스트"로 확인해보세요.', 'Saved. Try "Test login" to verify.'), 'ok');
            return true;
        } catch (e) {
            setStatus('⚠️ ' + T('저장 실패: ', 'Save failed: ') + esc(e && e.message ? e.message : e), 'err');
            return false;
        }
    };

    window._sapLoginTest = async function () {
        // 입력칸에 새로 적은 값이 있으면 먼저 저장한 뒤 테스트(저장 없이 테스트하면 헷갈리므로)
        const pw = document.getElementById('saplogin-pw').value;
        if (pw || !window._sapAutoLoginOn) { if (!(await window._sapLoginSave())) return; }
        setStatus('⏳ ' + T('SAP 로그인 상태를 확인하는 중... (꺼져 있으면 실행·로그인까지 최대 1분)', 'Checking SAP login... (up to a minute if SAP must be launched)'), '');
        try {
            const r = await fetch(BASE + '/sap-ensure-login', { method: 'POST' });
            const d = await r.json();
            if (d.ok) {
                setStatus('✅ ' + (d.autoLoggedIn
                    ? T('자동으로 로그인했습니다', 'Logged in automatically') : T('이미 로그인돼 있습니다', 'Already logged in'))
                    + (d.user ? ' (' + esc(d.user) + ')' : ''), 'ok');
            } else {
                setStatus('⚠️ ' + esc(d.error || T('로그인 실패', 'Login failed')), 'err');
            }
        } catch (e) {
            setStatus('⚠️ ' + T('테스트 실패: ', 'Test failed: ') + esc(e && e.message ? e.message : e), 'err');
        }
    };

    window._sapLoginDelete = async function () {
        if (!confirm(T('저장된 SAP 자동 로그인 설정을 삭제할까요?', 'Delete the saved SAP auto-login settings?'))) return;
        try {
            await fetch(BASE + '/sap-login-config/delete', { method: 'POST' });
            window._sapAutoLoginOn = false;
            ['saplogin-sysname', 'saplogin-client', 'saplogin-user', 'saplogin-pw'].forEach(function (id) { document.getElementById(id).value = ''; });
            document.getElementById('saplogin-pw').placeholder = '';
            setStatus('🗑 ' + T('삭제했습니다.', 'Deleted.'), 'ok');
        } catch (e) {
            setStatus('⚠️ ' + esc(e && e.message ? e.message : e), 'err');
        }
    };
})();
