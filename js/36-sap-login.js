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
                + '<strong style="font-size:14px;">🔑 ' + T('SAP 자동 로그인 설정', 'SAP auto-login settings') + '</strong>'
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
