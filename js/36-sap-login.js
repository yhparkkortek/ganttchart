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
                + ' width:min(440px,94vw); max-height:90vh; background:#fff; box-shadow:0 8px 30px rgba(0,0,0,.3); border-radius:10px; overflow:hidden;'
                + ' display:flex; flex-direction:column;">'
                // SAP 계열 → 하늘색 헤더(ui-conventions)
                + '<div id="saplogin-drag" style="padding:10px 14px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2;'
                + ' cursor:move; display:flex; align-items:center; gap:8px;">'
                + '<strong style="font-size:14px;">🔑 ' + T('자동 로그인 설정', 'Auto-login settings') + '</strong>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="document.getElementById(\'saplogin-modal\').style.display=\'none\'"'
                + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text);'
                + ' border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                // ⚠️⚠️ 본문은 **스크롤돼야 한다.** 섹션이 넷(SAP·그룹웨어·인사·NAS)이라 내용이
                //    화면보다 길다. 바깥 상자가 `overflow:hidden` 이라 그냥 두면 아래가 **잘리고
                //    스크롤도 안 된다** — 저장 버튼에 손이 안 닿는다(실측: 본문 1198px / 상자 756px).
                //    `min-height:0` 이 같이 있어야 한다 — flex 항목은 기본이 `min-height:auto` 라
                //    안 줄어들고, 그러면 `overflow-y:auto` 가 일할 자리가 없어 스크롤바가 안 생긴다.
                + '<div style="padding:14px 16px; flex:1; min-height:0; overflow-y:auto;">'
                + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">'
                + '<strong style="font-size:13px; color:#1971c2;">🏭 ' + T('SAP 자동 로그인', 'SAP auto-login') + '</strong></div>'
                + '<div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">'
                + T('SAP 이 꺼져 있을 때 이 계정으로 자동 로그인합니다. 비밀번호는 이 PC 에만 암호화 저장됩니다.',
                    'Auto-logs in to SAP with this account when it is closed. Password is stored encrypted on this PC only.')
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
                + '<div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">'
                + T('실패 시 보안문자(CAPTCHA)가 뜨는 구조라 <b>한 번만</b> 시도합니다. 비밀번호 보관은 SAP과 동일.',
                    'Tried only <b>once</b> — a failed login triggers a CAPTCHA. Password storage is the same as SAP.')
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
                + '<div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">'
                + T('아이디는 <b>사번</b>입니다. 그룹웨어와 같은 창에서 열리며, 한 번만 시도합니다.',
                    'ID is your <b>employee number</b>. Opens in the same window as groupware; tried only once.')
                + '</div>'
                + fieldRow(T('아이디(사번)', 'ID (emp. no.)'), '<input id="insalogin-user" autocomplete="off" style="' + inputSt + '" placeholder="' + T('예: 12345', 'e.g. 12345') + '">')
                + fieldRow(T('비밀번호', 'Password'), '<input id="insalogin-pw" type="password" autocomplete="new-password" style="' + inputSt + '">')
                + '<div id="insalogin-status" style="display:none; font-size:11.5px; margin:4px 0 10px; line-height:1.5; white-space:pre-wrap;"></div>'
                + '<div style="display:flex; gap:8px;">'
                + '<button onclick="window._insaLoginDelete()" style="' + btnSt + ' background:#fdecea; color:#a3281c; border-color:#f0b4ad;">🗑 ' + T('설정 삭제', 'Delete') + '</button>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="window._insaLoginTest()" style="' + btnSt + '">🔌 ' + T('로그인 테스트', 'Test login') + '</button>'
                + '<button onclick="window._insaLoginSave()" style="' + btnSt + ' font-weight:bold;">💾 ' + T('저장', 'Save') + '</button>'
                + '</div>'   // ⚠ 인사 버튼 행(flex)을 **여기서 닫는다** — 안 닫고 다음 섹션을 붙였다가
                             //   모든 글자가 flex 항목이 돼 **한 자씩 세로로** 깨졌다(화면으로 확인).
                // ── 🪐 JIRA(Kortek Issue Tracker) ─────────────────────────────
                //  http://jira.kortek.co.kr — Jira Server 5.2.11(2013년 빌드, PAT 없음, 실측).
                //  REST API가 이미 열려 있어 Basic Auth 만으로 된다(브라우저 자동화 불필요).
                //  ⚠️ CAPTCHA/계정잠금 정책을 모르므로 그룹웨어·인사관리와 같은 보수적 규칙:
                //     **한 번만** 시도하고 실패하면 재시도하지 않는다.
                + '<div style="border-top:1px solid #e5e5e5; margin:14px 0 12px;"></div>'
                + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">'
                + '<strong style="font-size:13px; color:#8b5a00;">🪐 ' + T('JIRA 로그인', 'JIRA login') + '</strong>'
                + '<span id="jiralogin-state" style="font-size:11px; color:#888;"></span></div>'
                + '<div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">'
                + T('이 JIRA는 <b>HTTP(암호화 없음)</b>이고 몇 번 틀리면 잠기는지 모릅니다 — <b>한 번만</b> 시도합니다.',
                    'This JIRA is <b>HTTP (unencrypted)</b> and its lockout policy is unknown — tried only <b>once</b>.')
                + '</div>'
                + fieldRow(T('아이디', 'ID'), '<input id="jiralogin-user" autocomplete="off" style="' + inputSt + '">')
                + fieldRow(T('비밀번호', 'Password'), '<input id="jiralogin-pw" type="password" autocomplete="new-password" style="' + inputSt + '">')
                + '<div id="jiralogin-status" style="display:none; font-size:11.5px; margin:4px 0 10px; line-height:1.5; white-space:pre-wrap;"></div>'
                + '<div style="display:flex; gap:8px;">'
                + '<button onclick="window._jiraLoginDelete()" style="' + btnSt + ' background:#fdecea; color:#a3281c; border-color:#f0b4ad;">🗑 ' + T('설정 삭제', 'Delete') + '</button>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="window._jiraLoginTest()" style="' + btnSt + '">🔌 ' + T('로그인 테스트', 'Test login') + '</button>'
                + '<button onclick="window._jiraLoginSave()" style="' + btnSt + ' font-weight:bold;">💾 ' + T('저장', 'Save') + '</button>'
                + '</div>'
                // ── 🗄️ NAS(사내 저장소) 로그인 ─────────────────────────────────
                //  ⚠️ 이건 "또 하나의 외부 시스템"이 아니라 **앱 데이터가 사는 곳**이다.
                //     여기 계정이 곧 신원이고, 무엇을 볼 수 있는지는 **NAS 폴더 권한**이 정한다
                //     (앱 쪽 게이트는 장식이다 — 사람은 자기 PC를 제어한다).
                //  ⚠️ DSM 은 비밀번호 실패가 쌓이면 계정이 아니라 **이 PC 의 IP 를 차단한다.**
                //     그래서 한 번 실패하면 잠그고, 사람이 설정을 다시 저장할 때까지 재시도하지 않는다.
                + '<div style="border-top:1px solid #e5e5e5; margin:14px 0 12px;"></div>'
                + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">'
                + '<strong style="font-size:13px; color:#6741d9;">🗄️ ' + T('NAS(사내 저장소) 로그인', 'NAS (in-house storage) login') + '</strong>'
                + '<span id="naslogin-state" style="font-size:11px; color:#888;"></span></div>'
                + '<div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">'
                + T('앱 데이터(프로젝트·설정·백업)가 저장되는 곳입니다. ⚠️ 비밀번호를 틀리면 <b>이 PC 의 접속 자체</b>가 차단되니 한 번만 시도합니다.',
                    'Where app data (projects, settings, backups) is stored. ⚠️ Wrong passwords block <b>this PC</b>, so it is tried only once.')
                + '</div>'
                // ══ 🚀 기본 경로 — 아이디·비밀번호만 넣으면 끝 ═══════════════════
                //  ⚠️⚠️ [2026-11-06, 사용자 지적] 이게 **기본**이어야 하는 이유:
                //     NAS 로 데이터를 옮긴 건 한 번이지만 **PC 설정은 PC 마다 매번** 다시 한다
                //     (`nas_login_config.json`·`docstore_config.json` 은 .gitignore, 각 PC 로컬).
                //     새 PC·재설치·노트북 교체·신규 입사자마다 처음부터다. 그리고 맞출 게 넷이다 —
                //     ①DSM 계정 ②앱 폴더 ③자료실 SMB 경로(①과 **전혀 다른 길**) ④저장소 모드.
                //     아래 '직접 입력'은 그중 **①만** 한다. 그게 맨 위에 "NAS 로그인"이라는 이름으로
                //     먼저 보이던 동안, 그걸 채운 PC 가 "🗄️ 는 뜨는데 프로젝트가 안 열린다 /
                //     사양서가 안 열린다" 로 끝났다(2026-11-04·11-05 팀원 신고 두 건).
                //     → 넷을 다 밟는 `/nas/setup` 을 기본으로 올리고 수동은 고급으로 내린다.
                //        고를 수 있게 둔 것 자체가 반쪽 설정의 입구였다.
                + '<div id="naslogin-quick" style="border:1px solid #d0bfff; background:#f8f5ff;'
                + ' border-radius:8px; padding:10px 11px 2px; margin:0 0 10px;">'
                + fieldRow(T('아이디', 'ID'), '<input id="nasq-user" autocomplete="off" style="' + inputSt + '">')
                + fieldRow(T('비밀번호', 'Password'), '<input id="nasq-pw" type="password" autocomplete="new-password" style="' + inputSt + '">')
                + fieldRow(T('NAS 주소', 'NAS address'),
                    '<input id="nasq-host" autocomplete="off" style="' + inputSt + '" placeholder="' + T('담당자가 알려준 주소', 'the address you were given') + '">')
                // 🗑 [2026-11-09] `📄 기본설정 파일`·`📤 설정 코드 복사`·`설정 코드 붙여넣기` 삭제.
                //    실측으로 **필요가 없다**: `/nas/setup` 은 주소·아이디·비밀번호만 받으면
                //    앱 폴더를 스스로 찾고(`find_app_folder` — 이 NAS 에선 31곳을 4.0초에 훑어
                //    **정확히 1곳**), 자료실 경로·포트·HTTPS 까지 거기서 만들어 쓴다.
                //    사용자가 팀원 PC 에서 **주소만 넣고 연결** 해서 확인했다.
                //    ⚠️ `nas_defaults.json` 을 **읽는** 쪽은 남긴다 — 있으면 주소를 미리 채워
                //    주고(`/nas/status.defaults` → `_nasQuickPrefill`), 설치 스크립트도 그 파일을
                //    옆에 두면 같이 깐다. 만드는 UI 만 없앤 것이다.
                + '<div id="nasq-log" style="display:none; font-size:11.5px; line-height:1.6; margin:0 0 8px;"></div>'
                + '<div style="display:flex; gap:6px; justify-content:flex-end; align-items:center; margin-bottom:8px;">'
                + '<button onclick="window._nasQuickRun()" style="' + btnSt + ' font-weight:bold; background:#efe6ff; border-color:#b197fc; color:#5f3dc4;">🚀 '
                + T('연결하기', 'Connect') + '</button></div></div>'
                + '<div id="naslogin-status" style="display:none; font-size:11.5px; margin:4px 0 10px; line-height:1.5; white-space:pre-wrap;"></div>'
                // 🔀 저장소 고르기 — Drive 모드에서 **들어가는 길**은 여기뿐이다.
                //    (헤더 배지는 nas/mirror 일 때만 뜬다 — 아직 안 옮긴 팀원 화면에
                //     못 보던 아이콘이 생기면 그것만으로 연락이 온다)
                + '<div style="border-top:1px dashed #e5e5e5; margin:10px 0 9px;"></div>'
                + '<label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:12px;">'
                + '<span style="width:92px; flex:0 0 auto; color:#555;">' + T('저장소', 'Storage') + '</span>'
                + '<span id="storage-mode-now" style="flex:1; min-width:0; color:#333;"></span>'
                // 🗄️ [2026-11-04] 고르기 버튼을 뺐다 — 저장소는 팀 전체가 같은 곳이어야 한다.
                //    (비상 탈출구는 콘솔 한 줄로 남겨 뒀다 — docs/nas-dsm.md)
                + '<button hidden style="' + btnSt
                + ' padding:6px 10px;">🔀 ' + T('바꾸기', 'Change') + '</button></label>'
                // 📁 문서 저장소(사양서·도면) — **메뉴 어디에도 들어가는 길이 없었다.**
                //    `_dsOpenSettings()` 는 있는데 부르는 곳이 js/48 의 오류 화면뿐이라,
                //    자료실이 NAS 로 옮겨간 뒤 팀원이 경로를 바꿀 방법이 없었다(2026-11-04).
                //    NAS 설정과 한 화면에 둔다 — 팀원이 볼 곳이 하나여야 한다.
                + '<label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:12px;">'
                + '<span style="width:92px; flex:0 0 auto; color:#555;">' + T('문서 저장소', 'Doc store') + '</span>'
                + '<span id="docstore-root-now" style="flex:1; min-width:0; color:#333; overflow:hidden;'
                + ' text-overflow:ellipsis; white-space:nowrap;" title=""></span>'
                + '<button onclick="window._dsOpenSettings && window._dsOpenSettings()" style="' + btnSt
                + ' padding:6px 10px;">📁 ' + T('설정', 'Settings') + '</button></label>'
                // ── 🔧 직접 입력(고급) — 자동이 못 고른 경우에만 ─────────────────
                //  ⚠️ 지우지 않고 **접어 둔다**: 앱 폴더 후보가 여러 개면 `/nas/setup` 은
                //     스스로 정하지 않고 사람에게 넘긴다(그게 맞다). 그때 고르는 자리가 여기다.
                + '<div style="border-top:1px dashed #e5e5e5; margin:10px 0 8px;"></div>'
                + '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">'
                + '<span style="font-size:11.5px; color:#888;">🔧 ' + T('직접 입력 (고급)', 'Manual entry (advanced)') + '</span>'
                + '<button id="nasadv-toggle" onclick="window._nasAdvToggle()" style="' + btnSt + ' padding:4px 9px;">'
                + T('열기', 'Open') + '</button></div>'
                + '<div id="naslogin-adv" style="display:none;">'
                + '<div style="font-size:11px; color:#b06b00; margin:0 0 8px; line-height:1.5;">'
                + T('⚠️ 여기는 <b>계정만</b> 맞춥니다 — 앱 폴더·자료실 경로는 따로 지정해야 합니다. '
                    + '위 <b>연결하기</b>가 앱 폴더를 혼자 못 정했을 때만 쓰세요.',
                    '⚠️ This sets the <b>account only</b> — the app folder and doc-store path must be set separately. '
                    + 'Use it only when Connect could not pick the app folder.')
                + '</div>'
                + fieldRow(T('주소', 'Address'),
                    '<input id="naslogin-host" autocomplete="off" style="' + inputSt + '" placeholder="' + T('예: nas.사내주소', 'e.g. nas.internal') + '">'
                    + '<span style="font-size:11px; color:#777;">:</span>'
                    + '<input id="naslogin-port" inputmode="numeric" style="width:62px; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:12px;" placeholder="5001">'
                    + '<label style="display:flex; align-items:center; gap:4px; font-size:11.5px; color:#555; white-space:nowrap;">'
                    + '<input type="checkbox" id="naslogin-https" checked> HTTPS</label>')
                + fieldRow(T('아이디', 'ID'), '<input id="naslogin-user" autocomplete="off" style="' + inputSt + '">')
                + fieldRow(T('비밀번호', 'Password'), '<input id="naslogin-pw" type="password" autocomplete="new-password" style="' + inputSt + '">')
                + fieldRow(T('앱 폴더', 'App folder'),
                    '<input id="naslogin-root" autocomplete="off" style="' + inputSt + '" placeholder="/공유폴더/KORTEK_PM">'
                    + '<button onclick="window._nasPickRoot()" style="' + btnSt + ' padding:6px 10px;">📂 ' + T('찾기', 'Browse') + '</button>')
                + '<div id="naslogin-cands" style="display:none; max-height:132px; overflow:auto; border:1px solid #e0e0e0; border-radius:6px; margin:-4px 0 10px; font-size:11.5px;"></div>'
                + '<div style="display:flex; gap:8px;">'
                + '<button onclick="window._nasLoginDelete()" style="' + btnSt + ' background:#fdecea; color:#a3281c; border-color:#f0b4ad;">🗑 ' + T('설정 삭제', 'Delete') + '</button>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="window._nasLoginTest()" style="' + btnSt + '">🔌 ' + T('연결 테스트', 'Test') + '</button>'
                + '<button onclick="window._nasLoginSave()" style="' + btnSt + ' font-weight:bold;">💾 ' + T('저장', 'Save') + '</button>'
                + '</div></div>'
                + '</div></div>';
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
        window._jiraLoginRefresh();
        window._nasLoginRefresh();
        window._nasQuickPrefill();      // ⚠️ 기본 경로는 늘 펼쳐져 있다 — 미리채우기를 여기서 건다
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
                // 📧 [2026-10-30] 메일 서버 설정에서 가져온 경우를 구분해 보여준다 — 둘 다 "설정됨"으로
                //    보이면 여기서 지워도 자동 로그인이 계속 되는 이유를 알 수 없다.
                var _fromMail = cfg.source === 'mail';
                if (pwEl) {
                    pwEl.placeholder = _fromMail
                        ? T('(메일 설정의 비밀번호를 씁니다 — 따로 쓰려면 입력)', '(uses the mail password — type to override)')
                        : T('(저장됨 — 바꿀 때만 입력)', '(saved — type only to change)');
                }
                if (st) {
                    st.textContent = _fromMail ? T('· 메일 설정 사용 중', '· using mail settings')
                                               : T('· 설정됨', '· configured');
                    st.style.color = _fromMail ? '#1971c2' : '#1f7a3d';
                }
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
                // 🔓 [2026-10-29] 사람이 여기서 성공시켰으면 AI 문답 게이트의 잠금도 푼다 —
                //    안 풀면 같은 탭에서 AI 문답은 계속 옛 실패 메시지만 돌려준다(실사용 제보).
                if (window._gwResetLoginGate) window._gwResetLoginGate();
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
        // ⚠️ [2026-10-21] 크롬이 http 사이트를 https 로 올렸다 실패해 **차단 화면**이 떠 있는 경우는
        //    자격증명 문제가 아니다. 재시도 금지 가드도 걸지 않는다 — 크롬을 다시 띄우면 바로 풀린다.
        if (d && d.blocked) {
            _insaTried = false;
            var fixed = false;
            try {
                say('🌐 ' + T('전용 크롬을 다시 시작해 http 차단을 풉니다...',
                              'Restarting the dedicated browser to clear the HTTP block...'));
                var rr = await fetch(BASE + '/gw/chrome-restart', { method: 'POST' }).then(function (r) { return r.json(); });
                fixed = !!(rr && rr.ok);
            } catch (e) { fixed = false; }
            if (fixed) {
                // 다시 띄웠으니 **이번 한 번만** 로그인을 재시도한다(차단 때문이었지 실패가 아니었다)
                try {
                    var d2 = await fetch(BASE + '/insa/login', { method: 'POST' }).then(function (r) { return r.json(); });
                    if (d2 && d2.ok) { _insaFailMsg = ''; return { ok: true }; }
                    // 이번엔 **실제로 서버까지 간** 시도다 — 여기서 실패하면 가드를 다시 건다(계정 잠금 방지)
                    if (d2 && !d2.blocked) _insaTried = true;
                    d = d2 || d;
                } catch (e) { /* 아래 공통 실패 경로로 */ }
            }
        }
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
    //     · ⚠️ [2026-10-29 실사용 제보] 단 **"자격증명이 서버까지 간 적이 없는 실패"까지**
    //       영구히 잠그면 안 된다 — 크롬이 안 떠 있거나 로그인 화면에 도달하지 못한 것은
    //       실패가 **쌓이지 않는다**(CAPTCHA도 안 뜬다). 그런데 예전엔 그것까지 한 번에
    //       잠가 버려서, 같은 `login_once()` 를 부르는데도 "설정창에서는 되고 AI 문답에서는
    //       안 되는" 증상이 났다(첫 시도가 로그인 화면 이동 때문에 죽고 → 영구 잠금 →
    //       사람이 설정창에서 누르면 그땐 이미 /login 이라 성공). 백엔드가 `retryable` 로
    //       그 구분을 알려주므로, 그 경우만 상한(_GW_SAFE_RETRY_MAX)까지 다시 받아준다.
    //       `failed`/`captcha_*`(=서버까지 간 실패)는 예전처럼 **영구 금지** 그대로다.
    //
    // 반환: { ok:true, session } | { ok:false, message:'사용자에게 보여줄 한 줄' }
    var _gwAutoTried  = false;   // 이 페이지 세션에서 자동 로그인을 시도했는가
    var _gwAutoFailMsg = '';     // 실패 사유(재사용 — 같은 이유로 다시 시도하지 않는다)
    var _gwSafeRetries = 0;      // 잠금과 무관한 실패를 몇 번 받아줬나
    var _GW_SAFE_RETRY_MAX = 3;  // 그래도 무한 반복은 막는다(백엔드가 계속 못 뜨는 경우)

    // 설정창에서 사람이 직접 로그인에 성공했을 때 등, 게이트를 풀어 주는 공용 입구.
    window._gwResetLoginGate = function () {
        _gwAutoTried = false; _gwAutoFailMsg = ''; _gwSafeRetries = 0;
    };

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
        if (d && d.ok) { window._gwResetLoginGate(); return { ok: true, session: d.session }; }

        // 🔎 서버까지 간 실패인가? 백엔드가 `retryable:true`를 주면 **자격증명을 보낸 적이
        //    없는 실패**(크롬 미실행·로그인 화면 미도달·클릭 실패)라 잠금과 무관하다.
        var _safe = !!(d && d.retryable);
        _gwAutoFailMsg = (d && d.result === 'not_configured')
            ? ('🔑 ' + (d.message || T('저장된 그룹웨어 로그인 정보가 없습니다 — AI 문답 창의 🔑에서 등록해주세요.',
                                       'No saved groupware login — register it with the 🔑 here.')))
            : ('🔒 ' + (d && d.message ? d.message
                                       : T('그룹웨어 로그인에 실패했습니다 — AI 문답 창의 🔑에서 직접 로그인해주세요.',
                                           'Groupware sign-in failed — use the 🔑 here.'))
               + ' ' + (_safe
                   ? T('(아직 로그인 시도가 서버까지 가지 않아 다음 명령에서 한 번 더 시도합니다)',
                       '(nothing was sent to the server yet — will try once more on the next command)')
                   : T('(계정 잠금을 막기 위해 자동 재시도는 하지 않습니다)',
                       '(no automatic retry, to avoid account lockout)')));
        if (_safe && _gwSafeRetries < _GW_SAFE_RETRY_MAX) {
            _gwSafeRetries++;
            _gwAutoTried = false;      // 잠금과 무관한 실패 — 다음 명령에서 한 번 더 받아준다
        }
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

    // ══ 🗄️ NAS(사내 저장소) 로그인 ══════════════════════════════════════
    //  ⚠️⚠️ 실패하면 **다시 시도하지 않는다.** DSM 은 비밀번호 실패가 쌓이면 계정이 아니라
    //     이 PC 의 IP 를 차단한다(그룹웨어·인사와 같은 규칙, 결과는 더 넓다).
    //     백엔드가 한 번 실패를 기록하면 잠그고, **설정을 다시 저장해야** 풀린다.
    //  ⚠️ 비밀번호는 입력칸에만 잠깐 있다가 저장 즉시 지운다 — localStorage 에 안 남긴다.
    //  ⚠️⚠️ 응답을 **바로 .json() 하지 말 것.** 구버전 백엔드는 이 경로가 없어서 404 HTML 을
    //     돌려주는데, 그걸 파싱하면 사람에게 `Unexpected token '<'` 라고 말하게 된다 —
    //     원인이 "재시작 안 함"인데 사람은 자기 아이디·비밀번호를 의심한다(실제로 그렇게 나왔다).
    //     "안 돌고 있다"와 "돌지만 구버전"도 **다른 고장**이라 따로 말한다.
    var nasApi = async function (path, opts) {
        var res;
        try {
            res = await fetch(BASE + path, opts);
        } catch (e) {
            throw new Error(T('백엔드(kortek_backend)가 실행 중이 아닙니다 — kortek_backend.bat 을 실행해주세요.',
                              'The backend is not running — start kortek_backend.bat.'));
        }
        if (res.status === 404) {
            throw new Error(T('백엔드가 구버전입니다 — 창을 닫고 kortek_backend.bat 을 다시 실행해주세요.',
                              'The backend is outdated — restart kortek_backend.bat.'));
        }
        var j = null;
        try { j = await res.json(); } catch (e) { /* 본문이 JSON 이 아닐 수 있다 */ }
        if (!j) throw new Error(T('백엔드 응답을 읽지 못했습니다(HTTP ', 'Could not read the backend response (HTTP ') + res.status + ')');
        return j;
    };

    var nasStatus = function (msg, kind) {
        var el = document.getElementById('naslogin-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'ok' ? '#1f7a3d' : (kind === 'err' ? '#b1432f' : '#555');
        el.innerHTML = msg || '';
    };

    // 지금 어느 저장소인지 설정창에도 적어 둔다 — 헤더 배지는 Drive 모드엔 안 뜨므로,
    // Drive 를 쓰는 사람에게는 **여기가 유일하게 확인할 수 있는 자리**다.
    function paintStorageNow() {
        var el = document.getElementById('storage-mode-now');
        if (!el) return;
        // ⚠️⚠️ [2026-11-06] 여기서 localStorage 를 **직접** 읽고 `|| 'drive'` 로 떨어뜨리고 있었다.
        //    플래그가 없으면 앱은 NAS 로 도는데(STORAGE_POLICY.nasOnly) 이 줄만 "☁️ 구글
        //    드라이브"라고 말했다 — 즉 **설정창이 실제와 다른 저장소를 알려 주고 있었다**
        //    (실측: `_storageMode()`='nas' 인데 화면은 드라이브). 저장소를 물을 땐 반드시
        //    `window._storageMode()` 를 쓴다(js/04a 의 그 주석이 가리키는 사고가 이것이다).
        var m = 'nas';
        try { m = (window._storageMode ? window._storageMode() : 'nas'); } catch (e) { /* ignore */ }
        var label = { drive: '☁️ ' + T('구글 드라이브', 'Google Drive'),
                      mirror: '🪞 ' + T('미러 — 드라이브 + NAS', 'Mirror — Drive + NAS'),
                      nas: '🗄️ ' + T('사내 NAS', 'In-house NAS') }[m] || m;
        el.textContent = label;
        el.style.color = (m === 'nas') ? '#1f7a3d' : (m === 'mirror' ? '#1971c2' : '#555');
        paintDocStoreNow();
    }

    // 📁 사양서·도면이 **지금 어디서 오는지**를 같이 보여준다.
    //    ⚠️ 저장소 모드(위 줄)와 **다른 설정**이다 — 앱 데이터는 NAS 인데 자료실은
    //       아직 옛 파일 서버인 상태가 될 수 있다. 둘을 나란히 둬야 그게 눈에 띈다.
    function paintDocStoreNow() {
        var el = document.getElementById('docstore-root-now');
        if (!el) return;
        el.textContent = T('확인 중…', 'Checking…');
        el.title = '';
        if (!window._dsConfig) { el.textContent = T('(문서 저장소 모듈 없음)', '(module missing)'); return; }
        window._dsConfig().then(function (c) {
            var root = (c && c.root) || '';
            if (!root) { el.textContent = T('설정 안 됨', 'Not set'); el.style.color = '#c00'; return; }
            // 전체 경로는 말풍선으로 — 사내 경로가 길어 한 줄을 다 먹는다.
            el.title = root;
            var tail = root.replace(/[\\/]+$/, '').split(/[\\/]/).slice(-2).join('\\');
            el.textContent = (c.reachable === false ? '⚠️ ' : '') + tail;
            el.style.color = (c.reachable === false) ? '#c00' : '#333';
        }).catch(function () {
            el.textContent = T('(백엔드 응답 없음)', '(no backend)');
            el.style.color = '#c00';
        });
    }

    window._nasLoginRefresh = async function () {
        paintStorageNow();
        var st = document.getElementById('naslogin-state');
        var pwEl = document.getElementById('naslogin-pw');
        if (pwEl) pwEl.value = '';
        nasStatus('', '');
        var cands = document.getElementById('naslogin-cands');
        if (cands) cands.style.display = 'none';
        try {
            var s = await nasApi('/nas/status');
            if (s.configured) {
                document.getElementById('naslogin-host').value = s.host || '';
                document.getElementById('naslogin-port').value = s.port || '';
                document.getElementById('naslogin-https').checked = !!s.https;
                document.getElementById('naslogin-user').value = s.user || '';
                if (pwEl) pwEl.placeholder = T('(저장됨 — 바꿀 때만 입력)', '(saved — type only to change)');
            } else {
                // 🔑 [2026-11-05] 아직 설정 전인 PC(=팀원의 새 PC)는 **팀 공용 기본값**으로 주소를 채운다.
                //    백엔드 `/nas/status` 가 바로 이걸 쓰라고 `defaults` 를 같이 내려보내는데(그쪽 주석)
                //    여기서 안 읽고 있었다 — 그래서 팀원 화면은 주소가 **빈 칸**이었고, 사람이 사내 IP 를
                //    손으로 쳤다. 오타 한 번이 곧 로그인 실패이고, 실패가 쌓이면 **그 PC 의 IP 가 차단**된다.
                //    (간편 전환 쪽은 이미 이렇게 하고 있다 — 두 칸이 서로 다르게 동작하고 있었던 것.)
                var d0 = s.defaults || {};
                if (d0.host) {
                    var hEl = document.getElementById('naslogin-host');
                    var ptEl = document.getElementById('naslogin-port');
                    if (hEl && !hEl.value) hEl.value = d0.host;
                    if (ptEl && !ptEl.value && d0.port) ptEl.value = d0.port;
                    if (d0.https !== undefined) document.getElementById('naslogin-https').checked = !!d0.https;
                }
            }
            // 앱 폴더는 따로 묻는다 — 로그인은 됐는데 폴더만 안 정해진 상태가 흔하다.
            var p = await nasApi('/nas/paths');
            if (p.configured) document.getElementById('naslogin-root').value = p.root || '';
            if (st) {
                if (!s.configured) { st.textContent = T('· 미설정', '· not set'); st.style.color = '#888'; }
                else if (s.reason === 'blocked') {
                    st.textContent = T('· 잠김', '· locked'); st.style.color = '#b1432f';
                    nasStatus('⛔ ' + T('로그인 실패로 잠겨 있습니다 — 아이디·비밀번호를 확인하고 <b>다시 저장</b>하면 풀립니다.',
                                        'Locked after a failed login — check the ID/password and <b>save again</b> to unlock.')
                              + '<br>' + esc(s.message || ''), 'err');
                } else if (s.ok) {
                    st.textContent = p.configured ? T('· 연결됨', '· connected')
                                                  : T('· 연결됨(앱 폴더 미지정)', '· connected (no app folder)');
                    st.style.color = p.configured ? '#1f7a3d' : '#b06b00';
                } else { st.textContent = T('· 설정됨(미접속)', '· configured (not connected)'); st.style.color = '#1971c2'; }
            }
            return s;
        } catch (e) {
            if (st) { st.textContent = T('· 백엔드 없음', '· backend down'); st.style.color = '#b1432f'; }
            return null;
        }
    };

    window._nasLoginSave = async function () {
        var host = document.getElementById('naslogin-host').value.trim();
        var user = document.getElementById('naslogin-user').value.trim();
        var pw = document.getElementById('naslogin-pw').value;
        var https = document.getElementById('naslogin-https').checked;
        var port = document.getElementById('naslogin-port').value.trim();
        if (!host || !user) { nasStatus('⚠️ ' + T('주소와 아이디를 입력해주세요.', 'Enter the address and ID.'), 'err'); return; }
        // ⚠️ 주소를 통째로 붙여넣는 사람이 많다 — http://host:5000 에서 알아서 떼어 준다.
        var m = /^\s*(https?):\/\/([^/:\s]+)(?::(\d+))?/i.exec(host);
        if (m) {
            https = m[1].toLowerCase() === 'https';
            host = m[2];
            if (m[3]) port = m[3];
            document.getElementById('naslogin-host').value = host;
            document.getElementById('naslogin-https').checked = https;
            if (port) document.getElementById('naslogin-port').value = port;
        }
        if (!port) port = https ? '5001' : '5000';
        nasStatus('⏳ ' + T('저장하고 한 번만 접속해 봅니다…', 'Saving and trying once…'), '');
        try {
            var r = await nasApi('/nas/config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host: host, port: Number(port), https: https, user: user, password: pw })
            });
            if (!r.ok) { nasStatus('⚠️ ' + esc(r.message || ''), 'err'); return; }
            document.getElementById('naslogin-pw').value = '';
            // 저장 직후 **딱 한 번** 접속해 본다. 실패하면 백엔드가 잠그고 다시 안 한다.
            var lg = await nasApi('/nas/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            // 🗂 [2026-11-05 사용자 지적 "여기에만 저장하면 접속도 돼야 하는 거 아닌가"]
            //    맞다 — 로그인은 여기서 된다. 그런데 **앱 폴더(root)** 는 이 칸이 건드리지 않아서,
            //    팀원의 새 PC 는 "🗄️ 는 뜨는데 프로젝트가 안 열린다" 로 끝났다(간편 전환만 폴더까지 맞춘다).
            //    팀 공용 기본값에 폴더가 적혀 있으면 **비어 있을 때만** 여기서 같이 맞춘다.
            //    ⚠️ 실패를 삼키지 않는다 — 권한이 없으면 `set_roots` 의 `ensure_folder` 가 정직하게 실패하고,
            //       그 문구("ACL 거부" 등)가 곧 "NAS 에서 이 팀원에게 폴더 권한을 줘야 한다"는 신호다.
            var autoRoot = '', rootErr = '';
            if (lg.ok) {
                try {
                    var p0 = await nasApi('/nas/paths');
                    if (!(p0 && p0.root)) {
                        var s0 = await nasApi('/nas/status');
                        var dRoot = ((s0 && s0.defaults) || {}).root || '';
                        if (dRoot) {
                            var rr = await nasApi('/nas/root', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ root: dRoot })
                            });
                            if (rr && rr.ok) autoRoot = dRoot;
                            else rootErr = (rr && rr.message) || '';
                        }
                    }
                } catch (e) { rootErr = (e && e.message) ? e.message : String(e); }
            }
            // 🗂 [2026-11-05 팀원 PC 신고 "프로젝트 파일은 불러오는데 다른 NAS 파일은 접속 못함"]
            //    프로젝트 파일(/nas/app/* · DSM API)과 사양서·도면·자료실(/doc/* · 윈도 SMB UNC)은
            //    **다른 길**이라, 계정만 저장한 PC 는 앞은 되고 뒤는 경로가 빈 채로 남았다.
            //    자료실 경로까지 여기서 같이 맞춘다 — 이미 닿고 있으면 백엔드가 그냥 둔다.
            var docRoot = '', docErr = '';
            if (lg.ok) {
                try {
                    var dr = await nasApi('/nas/docroot-auto', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
                    });
                    if (dr && dr.ok && dr.changed) docRoot = dr.root || '';
                    else if (dr && !dr.ok) docErr = dr.message || '';
                } catch (e) { docErr = (e && e.message) ? e.message : String(e); }
            }
            await window._nasLoginRefresh();
            if (lg.ok) {
                // 앱 폴더가 이미 정해져 있는데 "골라주세요"라고 하면 사람이 뭘 더 해야 하나 싶어진다.
                // 안내는 **정말 비어 있을 때만** 한다.
                var needRoot = !document.getElementById('naslogin-root').value.trim();
                nasStatus('✅ ' + T('접속됐습니다.', 'Connected.')
                          + (autoRoot ? ('<br>' + T('앱 폴더도 팀 공용 기본값으로 맞췄습니다: ', 'App folder set from the team default: ')
                                         + '<b>' + esc(autoRoot) + '</b>') : '')
                          + (rootErr ? ('<br>⚠️ ' + T('앱 폴더를 맞추지 못했습니다: ', 'Could not set the app folder: ')
                                        + esc(rootErr)
                                        + '<br>' + T('NAS 에서 이 계정에 그 폴더 권한이 있는지 확인해주세요.',
                                                     'Check that this account has permission on that folder.')) : '')
                          + (docRoot ? ('<br>' + T('문서 저장소(사양서·도면)도 맞췄습니다: ', 'Document store set too: ')
                                        + '<b>' + esc(docRoot) + '</b>') : '')
                          + (docErr ? ('<br>⚠️ ' + T('문서 저장소(사양서·도면·자료실)는 아직 못 씁니다: ',
                                                     'The document store is not reachable yet: ') + esc(docErr)
                                       + '<br>' + T('프로젝트 파일과는 <b>다른 길</b>입니다 — 탐색기에서 그 공유 폴더를 한 번 열어 '
                                                    + '계정을 입력(자격 증명 기억)한 뒤 다시 저장해주세요.',
                                                    'It is a <b>different path</b> from project files — open the share once in Explorer, '
                                                    + 'sign in (remember credentials), then save again.')) : '')
                          + (needRoot && !rootErr ? (' ' + T('이제 <b>📂 찾기</b>로 앱 폴더를 골라주세요.',
                                                 'Now pick the app folder with <b>📂 Browse</b>.')) : ''),
                          (rootErr || docErr) ? 'err' : 'ok');
            } else {
                nasStatus('❌ ' + esc(lg.message || T('접속하지 못했습니다.', 'Could not connect.'))
                          + '<br>' + T('⚠️ 다시 시도하지 않습니다 — 아이디·비밀번호를 고쳐 <b>다시 저장</b>해주세요.',
                                       '⚠️ It will not retry — fix the ID/password and <b>save again</b>.'), 'err');
            }
        } catch (e) {
            nasStatus('⚠️ ' + esc(e && e.message ? e.message : e), 'err');
        }
    };

    //  "연결 테스트"는 **이미 저장된 계정으로** 한 번 붙어 보는 것뿐이다.
    //  비밀번호를 새로 받지 않는다 — 테스트라는 이름으로 실패를 쌓지 않기 위해서다.
    window._nasLoginTest = async function () {
        nasStatus('⏳ ' + T('접속해 봅니다…', 'Trying…'), '');
        try {
            var s = await nasApi('/nas/status');
            if (!s.configured) { nasStatus('⚠️ ' + T('먼저 저장해주세요.', 'Save first.'), 'err'); return; }
            if (s.reason === 'blocked') {
                nasStatus('⛔ ' + T('잠겨 있습니다 — 설정을 <b>다시 저장</b>해야 풀립니다.',
                                    'Locked — <b>save again</b> to unlock.'), 'err');
                return;
            }
            var lg = s.ok ? { ok: true }
                          : await nasApi('/nas/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            await window._nasLoginRefresh();
            nasStatus(lg.ok ? ('✅ ' + T('접속됩니다.', 'Connected.'))
                            : ('❌ ' + esc(lg.message || '') + '<br>'
                               + T('⚠️ 다시 시도하지 않습니다 — 설정을 고쳐 다시 저장해주세요.',
                                   '⚠️ It will not retry — fix the settings and save again.')), lg.ok ? 'ok' : 'err');
        } catch (e) {
            nasStatus('⚠️ ' + esc(e && e.message ? e.message : e), 'err');
        }
    };

    //  앱 폴더 고르기 — 쓰기 권한이 **실제로 보이는** 곳만 보여준다.
    //  ⚠️ 공유 루트 자체는 고르지 못하게 한다(백엔드가 거절한다) — 남의 자료와 섞인다.
    window._nasPickRoot = async function () {
        var box = document.getElementById('naslogin-cands');
        if (!box) return;
        box.style.display = 'block';
        box.innerHTML = '<div style="padding:8px; color:#777;">⏳ ' + T('찾는 중…', 'Looking…') + '</div>';
        try {
            var r = await nasApi('/nas/root-candidates');
            if (!r.ok) {
                box.innerHTML = '<div style="padding:8px; color:#b1432f;">' + esc(r.message || '') + '</div>';
                return;
            }
            var items = r.items || [];
            if (!items.length) {
                box.innerHTML = '<div style="padding:8px; color:#b1432f;">'
                    + T('쓰기 권한이 있는 폴더가 보이지 않습니다 — NAS 관리자에게 문의해주세요.',
                        'No writable folder is visible — ask your NAS administrator.') + '</div>';
                return;
            }
            // ⚠️ 폴더 이름을 화면이 따로 들고 있으면 안 된다 — 여기엔 `kortek_pm`(소문자)이
            //    박혀 있었고, **DSM 은 대소문자를 가리므로** 이름을 `KORTEK_PM` 으로 바꾼 뒤에도
            //    이 버튼은 계속 빈 소문자 폴더를 만들 제안을 하고 있었다(유령 폴더 사고와 같은 뿌리).
            var APPNAME = (r.appFolderNames && r.appFolderNames[0]) || 'KORTEK_PM';
            box.innerHTML = items.map(function (i) {
                var suggested = i.path + '/' + APPNAME;
                return '<div data-root="' + esc(suggested) + '" style="padding:6px 8px; cursor:pointer; border-bottom:1px solid #f0f0f0;">'
                    + '<span style="color:#6741d9;">📂</span> ' + esc(i.path)
                    + '<span style="color:#999;">/' + esc(APPNAME) + '</span>'
                    + '<span style="float:right; color:#aaa; font-size:10.5px;">' + esc(i.rights) + '</span></div>';
            }).join('');
            box.onclick = function (ev) {
                var row = ev.target.closest('[data-root]');
                if (!row) return;
                document.getElementById('naslogin-root').value = row.getAttribute('data-root');
                box.style.display = 'none';
                window._nasRootSave();          // ⚠️ 바꾸기 전에 확인을 받는다(아래)
            };
        } catch (e) {
            box.innerHTML = '<div style="padding:8px; color:#b1432f;">' + esc(e && e.message ? e.message : e) + '</div>';
        }
    };

    // ⚠️⚠️ 앱 폴더를 바꾸는 건 **데이터가 사는 곳을 통째로 옮겨 가리키는 일**이다.
    //    예전엔 후보를 한 번 클릭하면 아무것도 묻지 않고 바로 바뀌었다 — 실제로 그렇게
    //    옛 js 가 캐시된 창에서 후보를 고르는 바람에, **데이터가 든 폴더를 가리키던 설정이
    //    빈 폴더로 조용히 바뀌었다**(앱에서는 프로젝트가 사라진 것처럼 보였을 것이다).
    //    그래서 ① 지금 폴더에 내용이 있으면 **그 사실을 보여주고** ② 사람 확인을 받는다.
    window._nasRootSave = async function () {
        var root = document.getElementById('naslogin-root').value.trim();
        if (!root) return;
        try {
            var cur = await nasApi('/nas/paths');
            if (cur.configured && cur.root && cur.root !== root) {
                var n = 0;
                try {
                    var lst = await nasApi('/nas/app/list?rel=');
                    n = (lst.items || []).length;
                } catch (e) { /* 못 읽으면 0 으로 본다 */ }
                var warn = T('앱 폴더를 바꿉니다.', 'Change the app folder?') + '\n\n'
                    + T('지금: ', 'Now: ') + cur.root + (n ? ('  (' + n + T('개 항목 들어 있음', ' items inside') + ')') : '') + '\n'
                    + T('바꿀 곳: ', 'New: ') + root + '\n\n'
                    + (n ? T('⚠️ 지금 폴더에 데이터가 있습니다. 바꾸면 앱이 그 데이터를 더 이상 보지 않습니다(지워지지는 않습니다).',
                             '⚠️ The current folder has data. After the change the app will no longer see it (it is not deleted).')
                         : T('지금 폴더는 비어 있습니다.', 'The current folder is empty.'));
                if (!confirm(warn)) {
                    // ⚠️ 칸에 바뀐 값을 남겨 두면 **실제와 어긋나 보인다** — 취소했는데도
                    //    "바뀐 것 같은" 화면이 된다. 지금 값으로 되돌린다.
                    document.getElementById('naslogin-root').value = cur.root;
                    nasStatus(T('그대로 두었습니다 — 앱 폴더는 ', 'Left unchanged — the app folder is still ')
                              + esc(cur.root), '');
                    return;
                }
            }
        } catch (e) { /* 확인을 못 해도 아래에서 백엔드가 막는다 */ }
        nasStatus('⏳ ' + T('앱 폴더를 설정합니다…', 'Setting the app folder…'), '');
        try {
            var r = await nasApi('/nas/root', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ root: root })
            });
            await window._nasLoginRefresh();
            nasStatus(r.ok ? ('✅ ' + T('앱 폴더: ', 'App folder: ') + esc(r.root || root))
                           : ('⚠️ ' + esc(r.message || '')), r.ok ? 'ok' : 'err');
        } catch (e) {
            nasStatus('⚠️ ' + esc(e && e.message ? e.message : e), 'err');
        }
    };

    // ══ 🚀 간편 전환 ══════════════════════════════════════════════════
    //  ⚠️ 비밀번호는 입력칸에만 잠깐 있다가 보내고 즉시 지운다. 코드(설정 코드)에도 넣지 않는다.
    //  ⚠️ 실패해도 **재시도하지 않는다** — 남은 횟수는 백엔드 예산(기본 3회)이 말해 준다.

    // 🔧 [2026-11-06] 직접 입력(고급) 접기/펴기. 기본은 접힘 — 반쪽 설정의 입구였던 자리라
    //    "할 수는 있지만 먼저 보이지는 않는" 곳에 둔다.
    window._nasAdvToggle = function () {
        var box = document.getElementById('naslogin-adv');
        if (!box) return;
        var open = box.style.display === 'none';
        box.style.display = open ? 'block' : 'none';
        var tb = document.getElementById('nasadv-toggle');
        if (tb) tb.textContent = open ? T('닫기', 'Close') : T('열기', 'Open');
    };

    // ⚠️ [2026-11-06] 기본 경로가 **처음부터 펼쳐져 있게** 바뀌면서, 예전에 '열기'를 누를 때만
    //    돌던 미리채우기가 영영 안 돌 뻔했다(주소 칸이 빈 채로 남아 사람이 사내 IP 를 손으로
    //    치게 되고, 오타 한 번이 곧 로그인 실패 → 그 PC 의 IP 차단이다). 토글과 분리해 둔다.
    window._nasQuickPrefill = function () {
        // 아이디는 **짐작해서 채워 둔다** — 사내 NAS 아이디는 그룹웨어/메일 아이디와 같다
        // (실측: 메일 user 의 @ 앞부분 = 그룹웨어 user). 틀리면 사람이 고치면 된다.
        var u = document.getElementById('nasq-user');
        var h = document.getElementById('nasq-host');
        if (!u && !h) return;
        if (u && !u.value) {
            var guess = '';
            try {
                var s = (window.loadAlarmSettings ? window.loadAlarmSettings() : {}).smtp || {};
                guess = String(s.user || '').split('@')[0];
            } catch (e) { /* 설정이 없으면 비워 둔다 */ }
            u.value = guess;
        }
        nasApi('/nas/status').then(function (s) {
            window._nasQuickConfigured = !!(s && s.configured);
            // 🔑 [2026-11-04] 아직 설정 전이면 **팀 공용 기본값**으로 주소를 채운다.
            //    (`nas_defaults.json` — 설치 폴더에 같이 둔다. 저장소엔 안 들어간다:
            //     이 저장소는 공개라 사내 주소를 박을 수 없다.) 팀원이 칠 것은 사번·비밀번호뿐.
            var d = (s && s.defaults) || {};
            if (h && !h.value && d.host) h.value = d.host;
            if (d.host) window._nasQuickCode = Object.assign({}, d, window._nasQuickCode || {});
            if (s && s.configured) {
                if (h && !h.value) h.value = s.host || '';
                if (u && s.user) u.value = s.user;
                var pe = document.getElementById('nasq-pw');
                // 이미 저장된 PC 는 비밀번호를 **다시 받지 않는다** — 테스트 삼아 다시 누를 때
                // 비밀번호를 또 적게 하면, 그 자리가 곧 오타가 쌓이는 자리가 된다.
                if (pe) pe.placeholder = T('(저장됨 — 바꿀 때만 입력)', '(saved — type only to change)');
            }
        }).catch(function () { /* 백엔드가 없으면 전환 때 그대로 알려준다 */ });
    };

    // ⚠️ 호환용으로 남긴다 — js/57 의 `storageOpenQuickSwitch`(배너 '로그인' 버튼·미설정 자동
    //    열기)가 이걸 부른다. 이제 기본 경로는 늘 펼쳐져 있으므로 "열려 있게 하고 채운다"만 한다.
    window._nasQuickToggle = function () {
        var box = document.getElementById('naslogin-quick');
        if (box) box.style.display = 'block';
        window._nasQuickPrefill();
    };


    var STEP_LABEL = {
        config:      [ '계정 저장', 'Account saved' ],
        login:       [ 'NAS 로그인', 'NAS login' ],
        'find-root': [ '앱 폴더 찾기', 'Find app folder' ],
        root:        [ '앱 폴더', 'App folder' ],
        docstore:    [ '문서 저장소(사양서·도면)', 'Doc store' ],
        input:       [ '입력 확인', 'Input' ],
        module:      [ '백엔드 모듈', 'Backend module' ]
    };

    function quickLog(steps, extra) {
        var el = document.getElementById('nasq-log');
        if (!el) return;
        el.style.display = 'block';
        el.innerHTML = (steps || []).map(function (s) {
            var lab = STEP_LABEL[s.step] || [ s.step, s.step ];
            return '<div style="color:' + (s.ok ? '#1f7a3d' : '#b1432f') + ';">'
                + (s.ok ? '✅ ' : '❌ ') + esc(T(lab[0], lab[1]))
                + (s.message ? ('<span style="color:#777;"> — ' + esc(s.message) + '</span>') : '')
                + '</div>';
        }).join('') + (extra || '');
    }

    window._nasQuickRun = async function () {
        var user = (document.getElementById('nasq-user') || {}).value || '';
        var pw = (document.getElementById('nasq-pw') || {}).value || '';
        var host = (document.getElementById('nasq-host') || {}).value || '';
        var code = window._nasQuickCode || {};
        user = user.trim(); host = host.trim();
        // 주소를 통째로 붙여넣는 사람이 많다 — http://host:5001 에서 떼어 준다.
        var https = (code.https === undefined) ? true : !!code.https;
        var port = code.port || '';
        var m = /^\s*(https?):\/\/([^/:\s]+)(?::(\d+))?/i.exec(host);
        if (m) { https = m[1].toLowerCase() === 'https'; host = m[2]; if (m[3]) port = m[3]; }
        if (!host || !user || (!pw && !window._nasQuickConfigured)) {
            nasStatus('⚠️ ' + T('아이디·비밀번호·주소를 모두 넣어주세요.', 'Enter the ID, password and address.'), 'err');
            return;
        }
        nasStatus('⏳ ' + T('맞추는 중입니다… (앱 폴더를 찾는 데 몇 초 걸립니다)',
                            'Setting up… (finding the app folder takes a few seconds)'), '');
        quickLog([]);
        var r;
        try {
            r = await nasApi('/nas/setup', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host: host, port: port ? Number(port) : undefined, https: https,
                                       user: user, password: pw,
                                       root: code.root || '', docRoot: code.docRoot || '' })
            });
        } catch (e) {
            nasStatus('⚠️ ' + esc(e && e.message ? e.message : e), 'err');
            return;
        } finally {
            var pwEl = document.getElementById('nasq-pw');
            if (pwEl) pwEl.value = '';        // 비밀번호는 칸에 남기지 않는다
        }
        quickLog(r.steps);
        await window._nasLoginRefresh();
        if (!r.ok) {
            var b = (r.budget || {});
            var tail = (b.left !== undefined && b.left > 0)
                ? ('<br>' + T('비밀번호를 고쳐 다시 눌러주세요 — ', 'Fix the password and press again — ')
                   + b.left + T('번 더 할 수 있습니다.', ' attempt(s) left.'))
                : (b.left === 0 ? ('<br>' + T('⛔ 더 시도하지 않습니다 — 담당자에게 알려주세요.',
                                              '⛔ No more attempts — contact the administrator.')) : '');
            // 앱 폴더를 못 찾은 경우엔 후보를 바로 보여준다(사람이 고르면 끝난다)
            //  ⚠️ [2026-11-06] 고를 자리는 이제 접혀 있는 '직접 입력(고급)' 안이다 —
            //     어디로 가야 하는지 말해 주지 않으면 사람은 후보만 보고 멈춘다.
            if (r.rootHits && r.rootHits.length) {
                tail += '<br>' + T('후보: ', 'Candidates: ') + esc(r.rootHits.join(', '))
                     + '<br>' + T('아래 <b>🔧 직접 입력(고급) ▸ 열기 ▸ 📂 찾기</b>에서 골라주세요.',
                                  'Pick it under <b>Manual entry (advanced) ▸ Open ▸ Browse</b> below.');
            }
            nasStatus('❌ ' + T('전환하지 못했습니다.', 'Could not switch.') + tail, 'err');
            return;
        }
        var docFail = (r.steps || []).filter(function (s) { return s.step === 'docstore' && !s.ok; })[0];
        if (docFail) {
            // ⚠️ 자료실만 못 닿는 상태 — 앱 데이터는 이미 NAS 다. 전환을 막을 이유는 없지만
            //    **조용히 넘기지도 않는다**(사양서·도면이 안 열리는 이유가 이것이다).
            quickLog(r.steps, '<div style="margin-top:6px; color:#b06b00;">⚠️ '
                + T('사양서·도면 폴더에는 아직 못 닿았습니다 — 탐색기에서 그 공유를 한 번 열어 '
                    + '계정을 넣은 뒤, 위 <b>문서 저장소 ▸ 📁 설정</b>에서 경로를 다시 저장하세요.',
                    'The spec/drawing folder is not reachable yet — open that share once in Explorer, '
                    + 'then save the path again under <b>Doc store ▸ Settings</b>.')
                + '</div><div style="margin-top:6px;"><button onclick="location.reload()" style="'
                + btnSt + ' font-weight:bold;">🗄️ ' + T('그래도 계속하기', 'Continue anyway') + '</button></div>');
            nasStatus('⚠️ ' + T('앱 데이터는 준비됐습니다. 자료실만 남았습니다.',
                                'App data is ready. Only the doc store is left.'), 'err');
            return;
        }
        nasStatus('✅ ' + T('준비됐습니다 — 새로고침합니다.', 'Ready — reloading.'), 'ok');
        // ⚠️ `storageSetMode('nas')` 를 부르지 않는다 — 기본값이 이미 nas 라 "지금 그 모드"로
        //    보고 **아무 일도 하지 않는다**(그래서 새로고침이 안 됐다). 그냥 다시 읽는다.
        setTimeout(function () { location.reload(); }, 900);
    };

    window._nasLoginDelete = async function () {
        if (!confirm(T('저장된 NAS 로그인 정보를 삭제할까요? (앱 폴더 설정도 같이 지워집니다)',
                       'Delete the saved NAS login? (the app folder setting goes too)'))) return;
        try {
            await nasApi('/nas/config', { method: 'DELETE' });
            ['naslogin-host', 'naslogin-port', 'naslogin-user', 'naslogin-pw', 'naslogin-root']
                .forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
            await window._nasLoginRefresh();
            nasStatus('🗑 ' + T('삭제했습니다.', 'Deleted.'), 'ok');
        } catch (e) {
            nasStatus('⚠️ ' + esc(e && e.message ? e.message : e), 'err');
        }
    };

    // ── 🪐 JIRA 로그인 ─────────────────────────────────────────────────
    //  그룹웨어·인사관리 블록과 같은 모양 — 같은 성격의 기능이 다르게 생기면 안 된다.
    var jiraStatus = function (msg, kind) {
        var el = document.getElementById('jiralogin-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'ok' ? '#1f7a3d' : (kind === 'err' ? '#b1432f' : '#555');
        el.textContent = msg || '';
    };

    window._jiraLoginRefresh = async function () {
        var st = document.getElementById('jiralogin-state');
        var pwEl = document.getElementById('jiralogin-pw');
        if (pwEl) pwEl.value = '';
        jiraStatus('', '');
        try {
            var cfg = await fetch(BASE + '/jira/status').then(function (r) { return r.json(); });
            if (cfg.configured) {
                document.getElementById('jiralogin-user').value = cfg.user || '';
                if (pwEl) pwEl.placeholder = T('(저장됨 — 바꿀 때만 입력)', '(saved — type only to change)');
                if (st) {
                    if (cfg.blocked) { st.textContent = T('· 🔒 잠김', '· 🔒 blocked'); st.style.color = '#b1432f'; }
                    else { st.textContent = cfg.verified ? T('· 확인됨', '· verified') : T('· 설정됨(미확인)', '· configured (unverified)'); st.style.color = '#1f7a3d'; }
                }
            } else if (st) {
                st.textContent = T('· 미설정', '· not set'); st.style.color = '#999';
            }
        } catch (e) {
            if (st) { st.textContent = T('· 백엔드 연결 안 됨', '· backend unreachable'); st.style.color = '#b1432f'; }
        }
    };

    window._jiraLoginSave = async function () {
        var user = (document.getElementById('jiralogin-user').value || '').trim();
        var pw = document.getElementById('jiralogin-pw').value;
        if (!user) { jiraStatus('⚠️ ' + T('아이디를 입력해주세요.', 'Enter the ID.'), 'err'); return false; }
        if (!pw) { jiraStatus('⚠️ ' + T('비밀번호를 입력해주세요.', 'Enter the password.'), 'err'); return false; }
        try {
            var r = await fetch(BASE + '/jira/login-config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: user, pw: pw })
            });
            var d = await r.json();
            document.getElementById('jiralogin-pw').value = '';
            jiraStatus(d.ok ? ('✅ ' + d.message) : ('⚠️ ' + (d.message || '')), d.ok ? 'ok' : 'err');
            if (d.ok) { _jiraTried = false; _jiraFailMsg = ''; window._jiraLoginRefresh(); }
            return !!d.ok;
        } catch (e) {
            jiraStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
            return false;
        }
    };

    window._jiraLoginTest = async function () {
        if (document.getElementById('jiralogin-pw').value) {
            if (!(await window._jiraLoginSave())) return;
        }
        jiraStatus('⏳ ' + T('로그인 확인 중… (실패해도 재시도하지 않습니다)', 'Verifying… (no retry on failure)'), '');
        try {
            var d = await fetch(BASE + '/jira/login', { method: 'POST' }).then(function (r) { return r.json(); });
            // 사람이 직접 누른 테스트는 **가드를 푼다** — 비밀번호를 고쳤을 수 있다.
            _jiraTried = !d.ok; _jiraFailMsg = d.ok ? '' : (d.message || '');
            jiraStatus((d.ok ? ('✅ ' + T('확인됨 — ', 'Verified — ') + (d.displayName || d.name || '')) : ('🔒 ' + (d.message || ''))), d.ok ? 'ok' : 'err');
        } catch (e) {
            jiraStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
        }
    };

    window._jiraLoginDelete = async function () {
        if (!confirm(T('저장된 JIRA 로그인 정보를 삭제할까요?', 'Delete the saved JIRA login?'))) return;
        try {
            var d = await fetch(BASE + '/jira/login-config', { method: 'DELETE' }).then(function (r) { return r.json(); });
            document.getElementById('jiralogin-user').value = '';
            document.getElementById('jiralogin-pw').value = '';
            _jiraTried = false; _jiraFailMsg = '';
            jiraStatus(d.ok ? ('🗑 ' + d.message) : ('⚠️ ' + (d.message || '')), d.ok ? 'ok' : 'err');
            window._jiraLoginRefresh();
        } catch (e) {
            jiraStatus('⚠️ ' + T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.'), 'err');
        }
    };

    // ── 🔑 JIRA 로그인 게이트 (JIRA 탭 + AI 문답 도구 루프 공용) ─────────────
    //  ⚠️⚠️ 계정 잠금 방지가 이 함수의 존재 이유다 — 인사관리 _insaEnsureLogin과 같은 역할.
    //  이 서버가 몇 번 틀리면 잠기는지 모르므로, 한 세션에서 **한 번 실패하면 다시 시도하지
    //  않고** 그때 받은 사유를 그대로 돌려준다. 새 경로를 붙일 땐 반드시 이 함수를 거칠 것
    //  (/jira/login을 직접 부르지 말 것 — 서버 쪽 _BLOCKED가 최종 방어선이지만, 매번 그걸
    //  믿고 때리면 "몇 번 실패했는지"가 쌓여 더 위험하다).
    var _jiraTried = false, _jiraFailMsg = '';

    window._jiraEnsureLogin = async function (onStep) {
        var say = function (m) { try { if (onStep) onStep(m); } catch (e) { /* 안내 실패가 흐름을 막지 않게 */ } };
        var st;
        try {
            st = await fetch(BASE + '/jira/status').then(function (r) { return r.json(); });
        } catch (e) {
            return { ok: false, message: T('백엔드(kortek_backend)에 연결하지 못했습니다 — 실행 중인지 확인해주세요.',
                                           'Could not reach the backend — is it running?') };
        }
        if (st && st.verified && !st.blocked) return { ok: true };
        if (st && !st.reachable) return { ok: false, message: st.message || T('JIRA 서버에 연결할 수 없습니다.', 'JIRA server unreachable.') };
        if (st && st.blocked) return { ok: false, message: st.blocked };
        if (!st || !st.configured) {
            return { ok: false, message: T('🔑 저장된 JIRA 로그인 정보가 없습니다 — 🔑 설정에서 등록해주세요.',
                                           'No saved JIRA login — register it under 🔑.') };
        }
        if (_jiraTried) {
            return { ok: false, message: _jiraFailMsg || T('JIRA 로그인에 실패했습니다 — 🔑에서 확인해주세요.',
                                                           'JIRA sign-in failed — check it under 🔑.') };
        }
        _jiraTried = true;
        say('🔑 ' + T('JIRA 로그인 확인 중... (실패해도 재시도하지 않습니다)',
                      'Verifying JIRA sign-in... (no retry on failure)'));
        var d;
        try {
            d = await fetch(BASE + '/jira/login', { method: 'POST' }).then(function (r) { return r.json(); });
        } catch (e) {
            _jiraFailMsg = T('백엔드에 연결하지 못했습니다.', 'Backend unreachable.');
            return { ok: false, message: _jiraFailMsg };
        }
        if (d && d.ok) { _jiraTried = false; _jiraFailMsg = ''; return { ok: true }; }
        _jiraFailMsg = (d && d.message) || T('🔒 JIRA 로그인에 실패했습니다.', '🔒 JIRA sign-in failed.');
        return { ok: false, message: _jiraFailMsg };
    };

})();
