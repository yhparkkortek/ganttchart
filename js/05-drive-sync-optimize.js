    
    // =========================================================
    // 3. 구글 드라이브 연동 최적화 (F5 캐시 꼬임 원천 차단 및 UI 안내)
    // =========================================================

    // 1) 새로고침 버튼 텍스트 변경 (사용자 안내 문구 추가)
    setTimeout(() => {
        const btns = document.querySelectorAll('.action-btn');
        btns.forEach(btn => {
            if (btn.innerText.includes('새로고침')) {
                btn.innerText = '🔄 새로고침 (Ctrl+F5 권장)';
                btn.title = "구글 인증 시스템의 캐시 꼬임(먹통) 방지를 위해 Ctrl+F5를 사용해 주세요.";
            }
        });
    }, 500);

    // 2) GIS 초기화 (문제의 원인이었던 '세션 자동 복구' 로직 완전 제거)
    window.gisLoaded = function() {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: ''
        });
        gisInited = true;
    };
    if (window._gisReady) window.gisLoaded(); // 스크립트가 이 정의보다 먼저 로드 완료된 경우 즉시 실행

    // 3) 버튼 클릭 핸들러 (캐시 꼬임 시 방어 로직 추가) + 동기화 이후 바로 드라이브에서 불러오기 팝업 이동
// 🐛 [버그 수정] 위(2692행 부근)의 첫 번째 handleAuthClick 정의에는 있던
// "gapi.client.setToken(resp)"가 이 두 번째(나중에 로드되어 실제로 이 함수를 덮어쓰는) 정의에는
// 빠져 있었음 — 그 결과 로그인에 성공해도 gapi.client가 새 토큰을 모른 채 계속 이전(만료된) 토큰
// 또는 무토큰 상태로 Drive API를 호출해서 곧바로 401로 "연결 끊김" 처리되고, 사용자가 다시
// [연동하기]를 누를 때마다 (조용한 갱신이 아니라) prompt:'consent'로 매번 전체 로그인 팝업이
// 뜨는 게 반복됐다 — "구글 로그인 팝업이 너무 자주 뜬다"의 실제 원인 중 하나였다.
//
// 💡 [2026-08-31 개선] 위 버그를 고친 뒤에도 "그래도 팝업이 자주 뜬다"는 지적 — 남은 원인은
// [연동하기]를 누를 때마다 무조건 prompt:'consent'(계정선택+권한동의 전체 화면)로만 시도했기
// 때문이다. 브라우저에 구글 로그인이 이미 되어 있고 예전에 권한도 허용해뒀다면(=대부분의 "연결
// 끊김"이 이 경우다 — 12분 주기 조용한 갱신이 순간적으로 실패했을 뿐, 로그인/권한 자체는 안 끊긴
// 경우가 많음), prompt:''(조용한 방식)만으로도 화면에 아무것도 안 띄우고 바로 재연동이 된다.
// 그래서 이제 클릭하면 먼저 조용한 방식을 시도하고, 그게 진짜 실패할 때만(최초 연동이거나
// 권한이 실제로 취소된 경우) 무거운 전체 동의 화면으로 넘어가도록 순서를 바꿨다 — 성공/실패 처리
// 로직 자체는 그대로 두고 "어떤 prompt로 시도할지"만 authSuccessHandler/onFinalFailure로 분리.
// 💡 [2026-09-06 신규] silentOnly=true(자동로그인 — window._tryAutoLogin에서만 넘김)면:
//    ① 버튼 텍스트/비활성화 등 화면을 건드리지 않고 조용히 시도만 하고
//    ② 실패해도 계정선택/동의화면으로 절대 확전하지 않으며(사용자 클릭 없이 뜨는 팝업은 브라우저가
//       차단할 수도 있고, 예고 없이 튀어나오면 UX도 나쁨) 그냥 지금까지처럼 수동 버튼을 눌러야 하는
//       상태로 조용히 남는다. 일반 클릭(silentOnly 생략)의 기존 동작은 전혀 바뀌지 않는다.
window.handleAuthClick = function(event, silentOnly) {
        if (!tokenClient) {
            if (silentOnly) { setTimeout(function() { window.handleAuthClick(null, true); }, 500); return; }
            alert("⏳ 구글 인증 모듈을 준비 중입니다. 1~2초 뒤에 다시 클릭해 주세요.\n(지속적으로 안 될 경우 Ctrl+F5를 눌러주세요)");
            return;
        }
        // 💡 [2026-09-03] Shift+클릭 = 계정 전환 모드.
        //    이전 이메일 hint가 있어서 항상 같은 계정으로만 자동 연결되던 문제 해결.
        const _isAccountSwitch = !silentOnly && !!(event && event.shiftKey);

        const authBtn = document.getElementById('auth_button');
        if (!silentOnly) {
            authBtn.innerText = window._currentLang === 'en' ? "🔄 Connecting..." : "🔄 연동 진행 중...";
            authBtn.disabled = true;
        }

        // 💡 조용한 시도/전체 동의 시도 둘 다 성공하면 완전히 동일한 후처리를 거쳐야 하므로 공용 함수로 뺌.
        const onAuthSuccess = async (resp) => {
            gapi.client.setToken(resp);
            window.googleAccessToken = resp.access_token;

            // 🐛 [2026-08-31 버그 수정] "로그인 성공 직후 구글 드라이브 연결이 꼬였습니다" 알림이 반복
            //    발생하던 문제 — 원인은 gapi.client.drive가 준비될 때까지 20회×250ms(=5초)만 기다리고
            //    포기하는 게 너무 짧았던 것. gapi.load('client', ...) → gapi.client.init(discoveryDocs)
            //    로 이어지는 두 단계 네트워크 요청이 느린 회선/첫 로드(특히 Ctrl+F5 직후 캐시가 비어
            //    있을 때)에서는 5초를 쉽게 넘긴다 — 이걸 "브라우저 캐시 문제"로 잘못 안내해서, 실제로는
            //    "조금 더 기다리면 되는" 상황에 사용자가 오히려 Ctrl+F5(캐시 비우기)를 눌러 매번 더
            //    느려지는 악순환이었다. 대기 시간을 60회×250ms(=15초)로 늘리고, 중간(2.5초 지점)에
            //    한 번 더 gapi.load를 재요청해서 콜백이 드물게 안 불리는 경우도 방어한다.
            let retries = 0;
            while (!(window.gapi && gapi.client && gapi.client.drive) && retries < 60) {
                // 💡 [2026-09-03] 재시도를 5회(1.25s)와 10회(2.5s) 두 차례 시도 — 한 번만 하는 것보다
                //    콜백이 드물게 묵살되는 경우를 더 잘 방어한다.
                if ((retries === 5 || retries === 10) && window.intializeGapiClient) {
                    try { gapi.load('client', window.intializeGapiClient); } catch (e) {}
                }
                await new Promise(r => setTimeout(r, 250));
                retries++;
            }

            if (!(window.gapi && gapi.client && gapi.client.drive)) {
                // 💡 자동로그인(silentOnly)은 인증 자체는 성공했지만 gapi 초기화가 느린 드문 경우인데,
                //    사용자가 아무 조작도 안 했는데 alert가 튀어나오면 놀라니 로그만 남기고 조용히 물러난다.
                if (!silentOnly) {
                    alert("❌ 구글 드라이브 연결 준비가 너무 오래 걸립니다 (네트워크가 느리거나 일시적 오류일 수 있습니다).\n잠시 후 [🔵 드라이브 연동하기]를 다시 눌러주세요. 계속 안 되면 그때 Ctrl+F5로 강력 새로고침 후 시도해 주세요.");
                    authBtn.innerText = window._currentLang === 'en' ? "🔵 Connect Google Drive" : "🔵 구글 드라이브 연동하기";
                    authBtn.disabled = false;
                } else {
                    console.warn('[자동로그인] 인증은 성공했지만 Drive API 초기화가 오래 걸려 중단됨');
                }
                return;
            }

            try {
                // 💡 [2026-09-03 성능 개선] about.get과 동시에 팀 폴더 캐시 워밍을 시작한다.
                //    팀 폴더 도입 이후 _getChildFolderIds API 호출이 파일 목록 조회 직전에 직렬로
                //    붙어 ~400ms가 추가됐다. localStorage 캐시가 있으면 이 Promise는 즉시 resolve
                //    되고, 없어도 about.get과 병렬로 실행되어 숨겨진 시간에 처리된다.
                var _folderCacheWarm = (window._getChildFolderIds && typeof SHARED_FOLDER_ID !== 'undefined')
                    ? window._getChildFolderIds(SHARED_FOLDER_ID, ['Backups', 'App_Config']).catch(function(){})
                    : Promise.resolve();
                let [aboutResp] = await Promise.all([
                    gapi.client.drive.about.get({fields: 'user'}),
                    _folderCacheWarm
                ]);
                window.currentUserName = aboutResp.result.user.displayName || "알 수 없는 사용자";
                // 💡 [2026-08-31 신규] 조용한 토큰 갱신 시 계정을 못 정해 "계정 선택" 창이 뜬 채 안 닫히는
                //    문제 방지용 — 로그인 성공 시 이메일을 기억해뒀다가, 이후 조용한 갱신 요청에 hint로
                //    같이 넘겨서 구글이 어느 계정인지 바로 알 수 있게 한다(브라우저에 구글 계정이 여러 개
                //    로그인돼 있으면 hint 없이는 조용한 요청도 "계정 선택" UI를 띄우고 사용자 입력을
                //    기다리게 됨 — 이게 배지는 초록색(연결됨)인데 팝업이 안 닫히던 증상의 실제 원인).
                window.currentUserEmail = aboutResp.result.user.emailAddress || '';
                try { localStorage.setItem('gantt_google_email_hint', window.currentUserEmail); } catch(e) {}

                authBtn.innerText = `🟢 ${window.currentUserName}`;
                // 💡 [2026-08-28] _handleDriveDisconnected가 끊김 표시로 빨갛게 물들여 놨을 수 있는
                //    테두리/글자색을 재연동 성공 시 원래대로 되돌린다(안 지우면 "🟢 이름"인데 빨간
                //    테두리가 남아있는 모순된 모습이 됨).
                authBtn.style.borderColor = '';
                authBtn.style.color = '';
                document.getElementById('drive_save_btn').disabled = false;
                document.getElementById('drive_load_btn').disabled = false;
                const bkBtn2 = document.getElementById('backup_restore_btn'); if (bkBtn2) bkBtn2.disabled = false;
                const psBtn = document.getElementById('project-select-btn'); if (psBtn) psBtn.disabled = false;
                window.isDriveConnected = true; // ✅ 연동 완료 플래그
                // 💡 [2026-08-25 신규] 이 함수(두 번째로 정의된 handleAuthClick)가 실제로 쓰이는 버전인데,
                //    startSilentTokenRefresh() 호출이 빠져 있어서 45분 주기 조용한 토큰 갱신이 지금까지
                //    한 번도 실제로 동작하지 않고 있었다 — "로그인이 계속 끊긴다"는 증상의 유력한 원인 중 하나.
                //    상단 연결 표시등 갱신 + 끊김 재알림 플래그 리셋도 함께 처리.
                window._driveWasEverConnected = true;
                window._driveDisconnectNotified = false;
                window._silentRefreshFailCount = 0; // 💡 재연동 성공 — 연속 실패 카운트도 같이 리셋
                if (window._updateDriveConnBadge) window._updateDriveConnBadge();
                if (window.startSilentTokenRefresh) window.startSilentTokenRefresh();
                window.closeAllTopbarMenus(); // ✅ 로그인 완료 시 열려있던 파일 드롭다운 자동 닫기

                // 🐛 [버그 수정] 첫 번째(지금은 이 함수에 덮어써져 죽은) handleAuthClick 정의에는 있던
                // 로그인 성공 시 자동 동기화(팀 공용 AI 프롬프트/공휴일/비밀번호 동기화/개인 업무 보관함/
                // 공용 주소록)가 이 실제 동작 버전에는 빠져 있었음 — 되살림.
                if (typeof window.loadPromptFromDrive === 'function') window.loadPromptFromDrive();
                if (typeof window.loadProjectSummaryPromptFromDrive === 'function') window.loadProjectSummaryPromptFromDrive();
            if (typeof window.loadGanttQaPromptFromDrive === 'function') window.loadGanttQaPromptFromDrive();
                if (typeof window.loadHolidaysFromDrive === 'function') window.loadHolidaysFromDrive();
                setTimeout(() => { if (typeof window.checkPasswordSync === 'function') window.checkPasswordSync(); }, 1500);
                if (window.TaskInbox && window.TaskInbox.loadFromDrive) window.TaskInbox.loadFromDrive();
                if (window.AddressBook && window.AddressBook.loadFromDrive) {
                    window.tabData = window.tabData || {};
                    window.tabData.addressBook = window.AddressBook.load();
                    // 💡 [2026-09-07 신규] "내 팀" 자동 인식 1차 시도 — 로컬 캐시 주소록 기준
                    if (window._autoDetectMyTeam) window._autoDetectMyTeam();
                    window.AddressBook.loadFromDrive().then(function(list) {
                        if (list) { window.tabData.addressBook = list; if (window.renderAddressTable) window.renderAddressTable(); }
                        // 💡 Drive 최신 주소록 기준으로 재시도(로컬 캐시가 없거나 오래됐을 수 있어서)
                        if (window._autoDetectMyTeam) window._autoDetectMyTeam();
                    });
                }

                // 💡 [2026-09-03] 600ms → 50ms: 팀 폴더 도입 이후 캐시 워밍을 about.get과 병렬로
                //    올려서 파일 목록까지의 직렬 지연이 크게 줄었다. 50ms는 버튼 상태 업데이트가
                //    화면에 반영될 충분한 여유이면서도 불필요한 대기를 없앤다.
                setTimeout(() => {
                    loadFromGoogleDrive();
                }, 50);

            } catch(e) {
                console.error("사용자 정보 가져오기 에러:", e);
                if (!silentOnly) {
                    alert("❌ 권한 정보를 가져오는데 실패했습니다. 팝업 차단 여부를 확인해 주세요.");
                    authBtn.innerText = "🔵 구글 드라이브 연동하기";
                    authBtn.disabled = false;
                }
            }
        };

        // 💡 전체 동의 화면(prompt:'consent')까지 실패/취소한 경우에만 버튼을 원래 상태로 되돌린다.
        const onFinalFailure = (resp) => {
            if (silentOnly) {
                console.info('[자동로그인] 조용한 시도 실패 — 수동으로 [🔵 드라이브 연동하기]를 눌러주세요:', resp.error);
                return; // 확전 없이 조용히 종료 (버튼 상태도 건드리지 않음)
            }
            console.error("인증 실패 또는 취소:", resp.error);
            // ✅ 로컬 이름이 있으면 복원, 없으면 기본값
            const savedName = localStorage.getItem('gantt_local_user');
            if (savedName) {
                authBtn.innerText = `👤 ${savedName} (${window._currentLang === 'en' ? 'Connect Drive' : '드라이브 연동하기'})`;
                authBtn.style.borderColor = '#28a745';
                authBtn.style.color = '#28a745';
            } else {
                authBtn.innerText = window._currentLang === 'en' ? "🔵 Connect Google Drive" : "🔵 구글 드라이브 연동하기";
                authBtn.style.borderColor = '#4285F4';
                authBtn.style.color = '#4285F4';
            }
            authBtn.disabled = false;
        };

        // 💡 이전 로그인에서 기억해둔 이메일이 있으면 hint로 같이 넘겨서, 브라우저에 구글 계정이
        //    여러 개 로그인돼 있어도 "계정 선택" 창 없이 바로 그 계정으로 조용히 시도하게 한다.
        //    단, Shift+클릭(계정 전환)이면 hint를 초기화해서 계정 선택창이 나오게 한다.
        if (_isAccountSwitch) {
            window.currentUserEmail = '';
            try { localStorage.removeItem('gantt_google_email_hint'); } catch(e) {}
            console.info('[구글 인증] Shift+클릭 — hint 초기화 후 계정 선택창 표시');
        }
        const _emailHint = _isAccountSwitch ? '' :
            (window.currentUserEmail || (function() { try { return localStorage.getItem('gantt_google_email_hint') || ''; } catch(e) { return ''; } })());

        // 💡 자동로그인은 힌트(예전에 연동했던 계정)가 없으면 조용히 포기한다 — window._tryAutoLogin에서도
        //    이미 걸러지지만, 이 함수 자체가 실수로 다른 silentOnly 호출부에서 쓰일 가능성까지 방어.
        if (silentOnly && !_emailHint) return;

        // ── 케이스별 인증 흐름 ──────────────────────────────────────────────────────────
        // [A] Shift+클릭 또는 hint 없음(첫 방문) → 계정 선택창(select_account) 바로 표시
        //     - select_account: 계정 목록만 보여주고, 이미 권한을 허락했으면 동의창은 안 뜸
        //     - consent: 권한 동의까지 모두 다시 보여주는 무거운 화면 — 여기선 쓰지 않음
        // [B] 일반 클릭 + hint 있음 → 조용한 시도(prompt:'') → 실패 시 계정 선택창
        //     (silentOnly는 위에서 걸러져 항상 hint가 있으므로 여기선 무조건 [B] 경로만 탄다)
        if (_isAccountSwitch || !_emailHint) {
            // [A] 계정 선택창 바로 표시
            tokenClient.callback = async (resp) => {
                if (resp.error !== undefined) { onFinalFailure(resp); return; }
                await onAuthSuccess(resp);
            };
            tokenClient.requestAccessToken({ prompt: 'select_account' });
        } else {
            // [B] 1차: 조용한 시도(prompt:'') — 이미 로그인+권한이 살아있으면 화면에 아무것도 안 띄우고 성공한다.
            tokenClient.callback = async (resp) => {
                if (resp.error !== undefined) {
                    if (silentOnly) { onFinalFailure(resp); return; } // 자동로그인은 여기서 확전하지 않고 종료
                    console.info('[구글 인증] 조용한 재연동 실패 → 계정 선택창으로 전환:', resp.error);
                    // 2차: 조용한 시도가 실패했을 때만 계정 선택창으로 넘어간다(consent 전체화면보다 가볍고 깔끔).
                    tokenClient.callback = async (resp2) => {
                        if (resp2.error !== undefined) { onFinalFailure(resp2); return; }
                        await onAuthSuccess(resp2);
                    };
                    tokenClient.requestAccessToken(_emailHint ? { prompt: 'select_account', hint: _emailHint } : { prompt: 'select_account' });
                    return;
                }
                await onAuthSuccess(resp);
            };
            tokenClient.requestAccessToken({ prompt: '', hint: _emailHint });
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 💡 [2026-09-06 신규] 자동로그인 — "새로고침/새 탭마다 드라이브 연동하기를 눌러야 하는" 번거로움
    //    개선. 기본값 OFF(기존 동작 그대로) — 켜고 싶은 사람만 ⚙️ 설정에서 개별로 켠다.
    //    켜져 있어도 "예전에 연동했던 계정 힌트"가 있을 때만, 딱 "조용한 방식"까지만 시도하고, 실패하면
    //    절대 계정선택/동의화면으로 확전하지 않는다(handleAuthClick의 silentOnly 인자 참고) — 클릭 없이
    //    뜨는 팝업은 브라우저가 차단할 수 있고, 예고 없이 튀어나오면 UX도 나쁘기 때문. 실패해도 사용자
    //    입장에서는 지금까지와 똑같이 [🔵 드라이브 연동하기]가 그대로 남아있을 뿐이다.
    window.isAutoLoginEnabled = function() {
        try { return localStorage.getItem('gantt_auto_drive_login') === 'on'; } catch(e) { return false; }
    };
    window.setAutoLogin = function(enabled) {
        try { localStorage.setItem('gantt_auto_drive_login', enabled ? 'on' : 'off'); } catch(e) {}
        window.refreshAutoLoginButton(enabled);
    };
    window.toggleAutoLogin = function() {
        window.setAutoLogin(!window.isAutoLoginEnabled());
    };
    window.refreshAutoLoginButton = function(enabled) {
        const btn = document.getElementById('auto-login-toggle-btn');
        if (!btn) return;
        const isEn = window._currentLang === 'en';
        btn.textContent = enabled
            ? (isEn ? '🟢 Auto Sign-in ON'  : '🟢 자동로그인 ON')
            : (isEn ? '🔴 Auto Sign-in OFF' : '🔴 자동로그인 OFF');
    };
    /** 페이지 로드 시 1회 호출 — DOMContentLoaded 초기화 블록(22a-summary-mctable-parse.js)에서 실행 */
    window._tryAutoLogin = function() {
        if (window.isDriveConnected) return; // 이미 연결됨
        if (!window.isAutoLoginEnabled()) return;
        let emailHint = '';
        try { emailHint = localStorage.getItem('gantt_google_email_hint') || ''; } catch(e) {}
        if (!emailHint) return; // 한 번도 연동한 적 없으면 애초에 실패할 게 뻔하므로 시도 자체를 안 함
        window.handleAuthClick(null, true); // silentOnly=true
    };
