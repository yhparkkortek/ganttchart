// [분리됨] 원본: js/04-core-app.js 의 203~1181행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 구글 드라이브 연동 로직
// =========================================================
    // 🛠️ 구글 드라이브 연동 로직 (인증 토큰 배달 사고 및 먹통 해결 버전)
    // =========================================================
    window.gapiLoaded = function() { gapi.load('client', window.intializeGapiClient); }
    if (window._gapiReady) window.gapiLoaded(); // 스크립트가 이 정의보다 먼저 로드 완료된 경우 즉시 실행

    window.intializeGapiClient = async function() {
        await gapi.client.init({ apiKey: API_KEY, discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
        gapiInited = true;
    }
    
    window.gisLoaded = function() {
        tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '' });
        gisInited = true;
    }
    // 🐛 [2026-08-31 버그 수정] 바로 위 gapiLoaded와 달리 이 gisLoaded 정의에는 "스크립트가 이 정의보다
    //    먼저 로드 완료된 경우 즉시 실행" catch-up 체크가 빠져 있었다 — 구글 gsi/client 스크립트가
    //    이 줄에 도달하기 전에 이미 로드를 마치면(문서 최상단의 스텁 gisLoaded가 대신 호출되어
    //    window._gisReady만 true로 기록되고 tokenClient는 여태 안 만들어진 상태), 이 실제 정의로
    //    덮어써도 아무도 다시 호출해주지 않아 tokenClient가 계속 비어있었다 — "구글 로그인 버튼을
    //    눌러도 반응이 없다(⏳ 준비 중 알림만 뜸)"는 간헐적 증상의 실제 원인. (아래쪽 12500행대 부근의
    //    두 번째 gisLoaded 재정의에는 이 체크가 있어서 그쪽이 대신 만회해줄 때만 우연히 정상 동작했음 —
    //    타이밍에 따라 그마저도 못 만회하면 로그인이 완전히 막혔다.)
    if (window._gisReady) window.gisLoaded(); // 스크립트가 이 정의보다 먼저 로드 완료된 경우 즉시 실행

    // 💡 [2026-08-25 신규] 상단 어디서든 눈에 띄는 연결 상태 표시등. Drive 연동 성공/끊김이 있을 때마다
    //    호출해서 갱신한다 — 저장 실패로 401을 맞기 전까지는 끊긴 줄 몰랐던("헛수고") 문제를 줄이기 위함.
    window._updateDriveConnBadge = function() {
        const el = document.getElementById('drive-conn-badge');
        if (!el) return;
        const _en = window._currentLang === 'en';
        if (window.isDriveConnected) {
            el.textContent = '🟢';
            el.title = _en ? 'Google Drive connected' : '구글 드라이브 연결됨';
            el.style.cursor = 'default';
            el.onclick = null;
        } else {
            el.textContent = '🔴';
            el.title = _en ? 'Google Drive disconnected — click to reconnect' : '구글 드라이브 연결 끊김 — 클릭해서 재연동';
            el.style.cursor = 'pointer';
            el.onclick = function() { window.handleAuthClick(); };
        }
        // 💡 아직 한 번도 연동을 시도한 적 없는 최초 상태(currentUserName 없음)에서는 굳이 "끊김"으로
        //    붉게 표시하지 않는다 — 로그인 전인 것과 "로그인했다가 끊긴 것"은 사용자에게 다른 의미이므로.
        el.style.display = (window.isDriveConnected || window._driveWasEverConnected) ? 'inline-flex' : 'none';
    };

    // 💡 [2026-08-25 신규] 저장 401/무토큰, 조용한 토큰 갱신 실패 등 "연결이 끊겼다"고 판단되는 모든
    //    지점에서 공통으로 호출하는 단일 진입점. 상태 갱신 + 토스트 + (설정돼 있으면) 본인 텔레그램 알림까지
    //    한 번에 처리해서, 사람이 저장을 시도해보고 나서야("헛수고") 끊김을 알게 되는 일을 줄인다.
    window._driveDisconnectNotified = false;
    // 💡 [2026-08-25 신규] 연결이 끊긴 동안 작업이 메모리(globalData 등)에만 있으면, 그 상태에서 브라우저
    //    탭이 강제로 닫히거나 죽으면(beforeunload 경고를 무시하고 닫는 경우 포함) 그대로 유실된다.
    //    끊김이 감지될 때마다 지금 화면 내용을 localStorage에 스냅샷으로 남겨, 다음에 이 프로젝트를 다시
    //    열 때 "저장 안 된 로컬 백업이 있다"고 알아채고 복원을 제안할 수 있게 한다.
    window._LOCAL_BACKUP_PREFIX = 'gantt_local_backup_';
    window._saveLocalBackup = function(reason) {
        try {
            if (!window._hasUnsavedChangesNow || !window._hasUnsavedChangesNow()) return; // 바뀐 게 없으면 백업할 필요 없음
            if (typeof globalData === 'undefined' || !globalData) return;
            const key = window._LOCAL_BACKUP_PREFIX + (window.currentDriveFileId || 'new');
            const serializedGlobalData = globalData.map(function(row) {
                const obj = { data: Array.from(row) };
                for (const k in row) { if (k.startsWith('_')) obj[k] = row[k]; }
                return obj;
            });
            const payload = {
                savedAt: new Date().toISOString(),
                reason: reason || '',
                fileId: window.currentDriveFileId || null,
                fileName: window.currentDriveFileName || '',
                changeLogsCount: window.changeLogs ? window.changeLogs.length : 0,
                data: {
                    globalData: serializedGlobalData,
                    changeLogs: window.changeLogs,
                    colIdx: (typeof colIdx !== 'undefined') ? colIdx : null,
                    filterColumns: (typeof filterColumns !== 'undefined') ? filterColumns : null,
                    projectMeta: window.projectMeta || {},
                    tabData: window.collectTabData ? window.collectTabData() : (window.tabData || {}),
                    distributions: window.projectDistributions || [],
                    scheduleBaselines: window._scheduleBaselinesForSave ? window._scheduleBaselinesForSave() : (window._scheduleBaselines || [])
                }
            };
            localStorage.setItem(key, JSON.stringify(payload));
            console.info('[로컬 백업] 저장됨 (' + (reason || '') + '):', key);
        } catch (e) {
            console.warn('[로컬 백업] 저장 실패(용량 초과 등 — 무시하고 진행):', e.message);
        }
    };
    window._clearLocalBackup = function(fileId) {
        try { localStorage.removeItem(window._LOCAL_BACKUP_PREFIX + (fileId || 'new')); } catch (e) {}
    };
    // 프로젝트를 열었을 때, 그 파일에 대한 로컬 백업이 방금 받아온 원격 내용보다 "앞서 있으면"(더 많은
    // changeLogs) 복원을 제안 — 연결이 끊긴 동안 저장 못 하고 남겨졌던 변경사항일 가능성이 높음.
    window._checkLocalBackupOnOpen = function(fileId, remoteChangeLogsCount) {
        try {
            const key = window._LOCAL_BACKUP_PREFIX + fileId;
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const backup = JSON.parse(raw);
            if (!backup || !backup.data || (backup.changeLogsCount || 0) <= (remoteChangeLogsCount || 0)) {
                localStorage.removeItem(key); // 이미 반영됐거나 원격보다 오래된 백업 — 정리
                return;
            }
            const _en = window._currentLang === 'en';
            const when = backup.savedAt ? new Date(backup.savedAt).toLocaleString() : '';
            const restore = confirm(_en
                ? `A local backup of unsaved changes for "${backup.fileName || fileId}" was found (saved on this browser at ${when} — likely because Google Drive was disconnected at that time).\n\nRestore it now? (Review it, then save normally.)`
                : `"${backup.fileName || fileId}" 프로젝트의 저장되지 않은 로컬 백업이 이 브라우저에 남아있습니다 (저장 시각: ${when} — 당시 구글 드라이브 연결이 끊겼을 가능성이 있습니다).\n\n지금 복원할까요? (복원 후 내용을 확인하고 직접 저장해주세요)`);
            if (restore) {
                window._applyLocalBackupData(backup.data);
                if (window.showToast) window.showToast(_en ? '📥 Local backup restored — please review and save.' : '📥 로컬 백업을 복원했습니다 — 확인 후 저장해주세요.', 'info', 8000);
            } else {
                localStorage.removeItem(key); // 복원 안 하기로 했으면 더는 물어보지 않게 정리
            }
        } catch (e) { console.warn('[로컬 백업] 복원 확인 실패:', e.message); }
    };
    window._applyLocalBackupData = function(data) {
        globalData = (data.globalData || []).map(function(obj) {
            const row = obj.data;
            for (const k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        window.changeLogs = data.changeLogs || window.changeLogs;
        window._nonGanttDirty = true; // 복원 직후는 아직 저장 전 상태이므로 "안 저장한 변경사항"으로 취급
        if (data.colIdx) colIdx = data.colIdx;
        if (data.filterColumns) filterColumns = data.filterColumns;
        window.projectMeta = data.projectMeta || window.projectMeta;
        window.tabData = data.tabData || window.tabData;
        window.projectDistributions = data.distributions || window.projectDistributions;
        if (data.scheduleBaselines && data.scheduleBaselines.length) window._scheduleBaselines = data.scheduleBaselines;
        if (window.mcNormalizeAfterLoad) window.mcNormalizeAfterLoad();
        if (window.populateTabData) window.populateTabData();
        window.recalculateSchedules();
        // ✅ [AI 학습 Phase 1] 재배치 대기 알림 — 이 프로젝트로 재배치 요청이 와 있으면 배너 표시
        if (window._checkReassignQueueOnLoad) window._checkReassignQueueOnLoad();
    };

    window._handleDriveDisconnected = function(reason) {
        const wasConnected = window.isDriveConnected;
        window.isDriveConnected = false;
        window._updateDriveConnBadge();
        // 💡 [2026-08-28 버그 수정] "연결이 끊겼는데도 상단이 계속 초록색으로 표시된다"는 지적 — 위
        //    drive-conn-badge(🔴/🟢 점)는 여기서 같이 갱신되지만, 바로 옆 auth_button("🟢 사용자이름"
        //    드롭다운 행)은 로그인 성공 시에만 "🟢 이름"으로 바뀌고 끊겼을 때 되돌리는 코드가 여태
        //    없었다 — 그래서 배지는 빨간불이어도 이 버튼만 계속 초록색 이름으로 남아 혼란을 줬다.
        //    더 나아가 다른 코드(6650줄)가 "로그인 여부"를 이 버튼 텍스트에 '🟢'이 있는지로 판정하고
        //    있어서, 안 되돌리면 그 판정까지 같이 낡은 상태를 참으로 잘못 본다 — 여기서 같이 되돌린다.
        const authBtn = document.getElementById('auth_button');
        if (authBtn) {
            const _enBtn = window._currentLang === 'en';
            authBtn.innerText = _enBtn ? '🔴 Reconnect needed (click)' : '🔴 재연동 필요 (클릭)';
            authBtn.style.borderColor = '#e03131';
            authBtn.style.color = '#e03131';
            authBtn.disabled = false;
        }
        window._saveLocalBackup('drive-disconnected:' + (reason || ''));
        if (!wasConnected && window._driveDisconnectNotified) return; // 이미 끊긴 상태에서 또 감지된 건 중복 알림 생략
        window._driveDisconnectNotified = true;
        const _en = window._currentLang === 'en';
        if (window.showToast) {
            window.showToast(_en
                ? '🔴 Google Drive connection lost. Please reconnect from the top menu.'
                : '🔴 구글 드라이브 연결이 끊어졌습니다. 상단 메뉴에서 재연동해 주세요.', 'error', 8000);
        }
        console.warn('[구글 인증] 연결 끊김 감지:', reason);
        // 💡 본인 텔레그램 알림 — 주소록에 내 이름으로 등록된 텔레그램 ID가 있고, 로컬 백엔드(kortek_backend)가
        //    켜져 있을 때만 실제 전송됨. 둘 중 하나라도 없으면 sendTelegramAlarm이 조용히 실패하므로 그냥 무시.
        try {
            const me = window._addrFindByName ? window._addrFindByName(window.currentUserName || '') : null;
            if (me && me.telegramId && window.sendTelegramAlarm) {
                window.sendTelegramAlarm(
                    `🔴 [Gantt Chart] 구글 드라이브 연결이 끊어졌습니다.\n다시 로그인해 주세요. (사유: ${reason || '알 수 없음'})`,
                    { chatId: me.telegramId }
                );
            }
        } catch (e) { /* 텔레그램 알림 실패는 무시 — 화면 표시/토스트가 주 경로 */ }
    };

    window._silentRefreshTimer = null;
    // 💡 [2026-08-28 개선] "연결이 끊겼는데도 45분 동안 상단이 계속 초록색"이라는 지적에 대한 후속 조치 —
    //    저장을 시도해야만 즉시 감지되던 것과 별개로, 아무 조작 없이 조용히 끊긴 경우를 얼마나 빨리
    //    잡아낼지는 순전히 이 주기에 달려있었다. 45분 → 12분으로 줄여 최대 지연을 크게 단축하되,
    //    한 번 실패했다고 바로 "끊김"으로 단정하지 않고 연속 2회(24분 이내) 실패해야만 끊김 처리한다
    //    (아래 _silentRefreshFailCount) — 순간적인 네트워크 hiccup이나 서드파티 쿠키 차단 등으로 어쩌다
    //    한 번 조용한 갱신이 스치듯 실패하는 오탐까지 "연결 끊김" 토스트·텔레그램 알림으로 이어지는 걸
    //    막기 위함(주기를 짧게 줄일수록 이런 우연한 1회성 실패를 만날 기회도 그만큼 늘어나므로 필수적인 안전장치).
    window._silentRefreshFailCount = 0;
    window.startSilentTokenRefresh = function() {
        if (window._silentRefreshTimer) return;
        window._silentRefreshTimer = setInterval(() => {
            if (!tokenClient || !window.isDriveConnected) return;
            // 💡 [2026-08-25] 예전엔 여기서도 handleAuthClick이 마지막으로 심어둔 callback을 그대로 재사용해서,
            //    조용한 갱신 성공 시에도 "로그인 성공" 전체 처리(프로젝트 목록 재조회 등 무거운 부수효과)가
            //    배경에서 통째로 다시 실행되고 있었다. 조용한 갱신 전용 콜백으로 토큰만 갈아끼우고,
            //    실패하면(=브라우저 세션 만료 등으로 prompt:''가 실패) 연결 끊김으로 간주해 사람이 알 수 있게 표시한다.
            tokenClient.callback = (resp) => {
                if (resp.error !== undefined) {
                    window._silentRefreshFailCount++;
                    console.warn(`[구글 인증] 조용한 토큰 갱신 실패 (${window._silentRefreshFailCount}회 연속):`, resp.error);
                    if (window._silentRefreshFailCount >= 2) {
                        window._handleDriveDisconnected('silent-refresh-failed:' + resp.error);
                    }
                    return;
                }
                window._silentRefreshFailCount = 0; // 성공하면 연속 실패 카운트 리셋
                gapi.client.setToken(resp);
                window.googleAccessToken = resp.access_token;
                console.info('[구글 인증] 조용한 토큰 갱신 성공');
            };
            // 💡 [2026-08-31] 브라우저에 구글 계정이 여러 개 로그인돼 있으면 hint 없는 조용한 요청은
            //    "계정 선택" 창을 띄운 채 사용자 입력을 기다리며 안 닫힌다 — 이게 상단 배지는 초록색
            //    (아직 연결 끊김 판정 전)인데 팝업만 계속 떠 있던 증상의 실제 원인. 로그인 성공 시
            //    기억해둔 이메일을 hint로 넘겨 계정을 미리 지정해서 이 창 자체가 뜨지 않게 한다.
            const _emailHint = window.currentUserEmail || (function() { try { return localStorage.getItem('gantt_google_email_hint') || ''; } catch(e) { return ''; } })();
            tokenClient.requestAccessToken(_emailHint ? { prompt: '', hint: _emailHint } : { prompt: '' });
        }, 12 * 60 * 1000);
    }

    window.handleAuthClick = function() {
        if (!tokenClient) {
            alert("⏳ 구글 인증 모듈을 준비 중입니다. 1~2초 뒤에 다시 클릭해 주세요.\n(지속적으로 안 될 경우 Ctrl+F5를 눌러주세요)");
            return;
        }

        const authBtn = document.getElementById('auth_button');
        if (authBtn) {
            authBtn.innerText = window._currentLang === 'en' ? "🔄 Connecting..." : "🔄 연동 진행 중...";
            authBtn.disabled = true;
        }

        tokenClient.callback = async (resp) => {
            if (resp.error !== undefined) { 
                console.error("구글 인증 실패:", resp.error);
                if (authBtn) {
                    authBtn.innerText = window._currentLang === 'en' ? "🔵 Connect Google Drive" : "🔵 구글 드라이브 연동하기";
                    authBtn.disabled = false;
                }
                return; 
            }
            
            // 💡 [🔑 핵심 해결] 획득한 토큰을 GAPI 엔진과 브라우저 전역 공간에 확실하게 주입합니다!
            gapi.client.setToken(resp);
            window.googleAccessToken = resp.access_token;
            window.isDriveConnected = true;
            window._driveWasEverConnected = true;
            window._driveDisconnectNotified = false; // 💡 재연동 성공 — 다음에 또 끊기면 다시 알림 가능하도록 리셋
            window._silentRefreshFailCount = 0; // 💡 재연동 성공 — 연속 실패 카운트도 같이 리셋
            window._updateDriveConnBadge();
            window.startSilentTokenRefresh();

            // 💡 드라이브 연동 성공 시 팀 공용 AI 프롬프트 자동 동기화
            if (typeof window.loadPromptFromDrive === 'function') window.loadPromptFromDrive();
            if (typeof window.loadProjectSummaryPromptFromDrive === 'function') window.loadProjectSummaryPromptFromDrive();
            if (typeof window.loadGanttQaPromptFromDrive === 'function') window.loadGanttQaPromptFromDrive();
            if (typeof window.loadHolidaysFromDrive === 'function') window.loadHolidaysFromDrive();
            // 💡 비밀번호 변경 감지 + Telegram 설정 자동 동기화
            setTimeout(() => { if (typeof window.checkPasswordSync === 'function') window.checkPasswordSync(); }, 1500);

            try {
                let aboutResp = await gapi.client.drive.about.get({fields: 'user'});
                window.currentUserName = aboutResp.result.user.displayName || "알 수 없는 사용자";
                window.showToast(window._currentLang === 'en' ? `🎉 Google Drive connected! Welcome, ${window.currentUserName}!` : `🎉 구글 드라이브 연동 완료! 반갑습니다, ${window.currentUserName}님!`);
                if (authBtn) authBtn.innerText = `🟢 ${window.currentUserName}`;
                if (window.TaskInbox && window.TaskInbox.loadFromDrive) window.TaskInbox.loadFromDrive(); // 💡 개인 보관함 드라이브 복원
                if (window.AddressBook && window.AddressBook.loadFromDrive) {
                    window.tabData = window.tabData || {};
                    window.tabData.addressBook = window.AddressBook.load(); // 로컬 캐시 즉시 반영
                    window.AddressBook.loadFromDrive().then(function(list) {
                        if (list) { window.tabData.addressBook = list; if (window.renderAddressTable) window.renderAddressTable(); }
                    }); // 💡 공용 주소록 드라이브 최신본 복원
                }
            } catch(e) {
                console.error("사용자 정보 추출 실패, 공용 모드로 진입:", e);
                window.currentUserName = "익명 사용자";
                window.showToast(window._currentLang === 'en' ? '✅ Google Drive connected! Synced with shared team folder.' : '✅ 구글 드라이브 연동 완료! 팀 공용 폴더와 동기화됩니다.');
                if (authBtn) authBtn.innerText = "🟢 공용 드라이브 연동됨";
            }
            
            if (authBtn) authBtn.disabled = true;
            document.getElementById('drive_save_btn').disabled = false;
            document.getElementById('drive_load_btn').disabled = false;
            const bkBtn1 = document.getElementById('backup_restore_btn'); if (bkBtn1) bkBtn1.disabled = false;
            
            // 연동 성공 직후 프로젝트 리스트 팝업 자동 동기화
            setTimeout(() => {
                if (typeof window.loadFromGoogleDrive === 'function') {
                    window.loadFromGoogleDrive();
                }
            }, 600);
        };
        tokenClient.requestAccessToken({prompt: 'consent'}); 
    }

    // ── Drive 쿼리 헬퍼 ─────────────────────────────────────────────────────────
    // Google Drive API v3는 'in ancestors' 를 지원하지 않음 — 'in parents' 만 유효.
    // 팀 하위 폴더까지 탐색하려면 직속 자식 폴더 ID 를 먼저 구한 뒤 OR 조건으로 묶어야 한다.

    // 💡 [2026-09-03 성능 개선] _childFolderCache를 localStorage에 영속화 (30분 TTL).
    //    팀 폴더 도입 이후 로그인 직후 _getChildFolderIds API 호출이 추가되어 파일 목록까지
    //    체감 대기 시간이 ~400ms 늘었다. localStorage에 저장해두면 재방문 시 이 API 호출을
    //    건너뛰어 대기 시간이 사라진다. 팀 폴더 구조는 자주 바뀌지 않으므로 30분 TTL은 안전하다.
    var _childFolderCache = {}; // { parentId: { ids, ts } }  — 메모리 캐시 (30분 TTL)
    var _FOLDER_CACHE_KEY = 'gantt_folder_cache_v1';
    var _FOLDER_CACHE_TTL = 30 * 60 * 1000; // 30분
    try {
        var _persisted = JSON.parse(localStorage.getItem(_FOLDER_CACHE_KEY) || '{}');
        var _now = Date.now();
        Object.keys(_persisted).forEach(function(k) {
            if (_now - _persisted[k].ts < _FOLDER_CACHE_TTL) _childFolderCache[k] = _persisted[k];
        });
    } catch(e) {}

    /**
     * parentId 바로 아래 자식 폴더 ID 목록 반환.
     * excludeNames 배열에 이름이 있는 폴더는 제외 (예: 'Backups', 'App_Config').
     */
    window._getChildFolderIds = async function(parentId, excludeNames) {
        var cached = _childFolderCache[parentId];
        if (cached && Date.now() - cached.ts < _FOLDER_CACHE_TTL) {
            return excludeNames ? cached.ids.filter(function(o) { return !excludeNames.includes(o.name); }).map(function(o) { return o.id; })
                                : cached.ids.map(function(o) { return o.id; });
        }
        try {
            var res = await gapi.client.drive.files.list({
                q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
                fields: 'files(id, name)', corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true
            });
            var items = (res.result.files || []).map(function(f) { return { id: f.id, name: f.name }; });
            _childFolderCache[parentId] = { ids: items, ts: Date.now() };
            // localStorage에 영속화 — 다음 페이지 로드 시 API 호출 없이 바로 사용
            try { localStorage.setItem(_FOLDER_CACHE_KEY, JSON.stringify(_childFolderCache)); } catch(e) {}
            return excludeNames ? items.filter(function(o) { return !excludeNames.includes(o.name); }).map(function(o) { return o.id; })
                                : items.map(function(o) { return o.id; });
        } catch(e) { return []; }
    };
    // 팀 폴더 구조가 실제로 바뀐 경우(폴더 추가/이름 변경) 수동으로 캐시를 무효화하는 함수.
    window._clearFolderCache = function() {
        _childFolderCache = {};
        try { localStorage.removeItem(_FOLDER_CACHE_KEY); } catch(e) {}
        console.info('[폴더 캐시] 초기화됨 — 다음 파일 목록 조회 시 Drive API로 재조회');
    };

    /**
     * parentId + 그 직속 자식 폴더(팀 폴더)들을 포함하는 Drive `in parents` OR 쿼리 조각 반환.
     * excludeNames: 'Backups', 'App_Config' 같이 포함하지 않을 폴더 이름 목록.
     */
    window._buildParentsQuery = async function(parentId, excludeNames) {
        var subIds = await window._getChildFolderIds(parentId, excludeNames);
        var allIds = [parentId].concat(subIds);
        return allIds.map(function(id) { return `'${id}' in parents`; }).join(' or ');
    };

    window.findSaveFile = async function(dynamicFileName) {
        try {
            var parentsQ = await window._buildParentsQuery(SHARED_FOLDER_ID, ['Backups', 'App_Config']);
            let response = await gapi.client.drive.files.list({
                q: `name='${dynamicFileName}' and trashed=false and (${parentsQ})`,
                fields: 'files(id, name)', corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true
            });
            return response.result.files && response.result.files.length > 0 ? response.result.files[0].id : null;
        } catch (err) { console.error("클라우드 파일 검색 실패:", err); return null; }
    }

    // 💡 "프로젝트 선택": 현재 프로젝트를 먼저 저장한 뒤에만 다른 프로젝트 목록을 연다 (미저장 유실 방지)
    window.selectProject = async function() {
        if (!window.isDriveConnected) {
            alert(window._t("🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.", "🔒 Please connect Google Drive first."));
            return;
        }
        window.closeAllTopbarMenus();
        const _en = window._currentLang === 'en';
        // 💡 [2026-08-25] 예전엔 저장할 데이터가 조금이라도 있으면(_hasUnsavedProjectData) 무조건
        //    조용히 자동저장부터 했다 — 이미 저장된 상태라도 매번 실제로 Drive에 다시 쓰는 낭비였고,
        //    사용자가 "저장할지 말지"를 고를 기회도 없었다. 이제는 실제로 "안 저장한 변경사항"이
        //    있을 때만(_hasUnsavedChangesNow) 3지선다 모달로 물어보고, 변경사항이 없으면 그냥 바로 이동한다.
        if (window._hasUnsavedChangesNow && window._hasUnsavedChangesNow()) {
            const choice = await window._showSaveChoiceModal(window.currentDriveFileName, 'open');
            if (choice === 'cancel') return;
            if (choice === 'save') {
                window.showToast(_en ? "💾 Saving current project before opening the list..." : "💾 프로젝트 이동 전, 현재 작업을 저장하는 중...", 'info');
                // 💡 [진단용 계측] "프로젝트 열기가 느리다"는 신고가 반복돼서, 다음에 또 느려질 때 정확히
                //    어느 단계(전환 전 저장 vs 목록 조회 vs 파일 열기)가 느린지 바로 알 수 있게 시간을 잰다.
                const _t0 = performance.now();
                // 💡 [UX 수정] 저장이 막혀도 여기서 alert을 띄우지 않게 하고(suppressAlert), 사유만 받아온다.
                //    예전엔 ①저장 실패 안내 alert + ②"그래도 목록을 여시겠습니까?" confirm — 모달이 두 번
                //    연달아 떴고, 두 번째에서 취소하면 프로젝트 목록 자체를 못 열었다.
                const saved = await window.saveToGoogleDrive({ suppressAlert: true });
                const _saveMs = Math.round(performance.now() - _t0);
                console.info(`[프로젝트 열기 계측] 전환 전 저장(saveToGoogleDrive): ${_saveMs}ms`);
                if (_saveMs > 3000) console.warn(`[프로젝트 열기 계측] ⚠️ 전환 전 저장이 ${_saveMs}ms나 걸림 — Drive 응답 지연 또는 병합 처리가 원인일 수 있음`);
                // 💡 저장이 막힌 경우(필수정보 미입력 / 새 프로젝트 비밀번호 미입력 등)에도 프로젝트 목록은
                //    항상 열어준다 — 저장된 다른 프로젝트를 여는 것 자체는 막을 이유가 없고, 지금 화면 내용은
                //    멀티시트 탭에 그대로 남아 있어 유실되지 않는다. 안내는 사유와 함께 "한 번만" 표시.
                if (!saved) {
                    const _why = window._lastSaveBlockReason || '';
                    alert(_en
                        ? (_why ? _why + '\n\n' : '') + '→ Skipping the save and opening the project list.\n(Current screen content stays in its sheet tab — nothing is lost.)'
                        : (_why ? _why + '\n\n' : '') + '→ 저장은 건너뛰고 프로젝트 목록을 엽니다.\n(지금 화면 내용은 시트 탭에 그대로 남아 있어 사라지지 않습니다)');
                }
            }
            // choice === 'discard' → 저장 없이 그대로 목록을 엶
        }
        const _t1 = performance.now();
        window.loadFromGoogleDrive().then(function() {
            console.info(`[프로젝트 열기 계측] 목록 조회(loadFromGoogleDrive): ${Math.round(performance.now() - _t1)}ms`);
        });
    }

    // 💡 상단바 현재 프로젝트 파일명 표시 갱신 — 로드된 파일이 없으면 아예 숨김
    window.updateCurrentFileLabel = function() {
        const el  = document.getElementById('current-project-filename');
        const sep = document.getElementById('current-file-sep');
        if (!el) return;
        if (window.currentDriveFileName) {
            el.textContent = '📄 ' + window.currentDriveFileName;
            el.style.display = 'inline-flex';
            if (sep) sep.style.display = 'block';
        } else {
            el.style.display = 'none';
            if (sep) sep.style.display = 'none';
        }
    };

    // 💡 [공용화] 팀 공용 폴더의 "실제 프로젝트 파일" 목록만 걸러서 반환 — 공유설정/인덱스/백업류
    //    (project_index.json·PriorityScore_Shared.json 등)는 프로젝트가 아니므로 제외.
    //    loadFromGoogleDrive(열기)와 deleteProjectFlow(삭제) 양쪽에서 같은 필터 기준을 공유한다.
    window._listProjectFiles = async function() {
        // 💡 [2026-09-03 성능 개선] 팀 폴더 도입 후 발생한 파일 목록 조회 지연 해결.
        //
        //    기존 방식(OR 쿼리): Drive API에 10개 폴더를 하나의 OR 조건으로 묶어 전달
        //      files.list(q: "'ROOT' in parents or 'team1' in parents or ... or 'team9' in parents")
        //    → Drive는 OR 조건을 내부적으로 순차 처리 → 폴더 수만큼 선형으로 느려짐
        //      9팀 폴더 기준 약 1,200~2,500ms 소요 (팀 폴더 추가 전 대비 약 10배)
        //
        //    새 방식(병렬 쿼리): 폴더마다 files.list를 Promise.all로 동시 실행
        //      → 각 쿼리는 단일 폴더 조건이라 Drive가 즉시 처리
        //      → 네트워크 왕복 1회분의 시간 안에 모든 폴더 결과를 합산 → 약 300~600ms로 단축
        //      _getChildFolderIds 결과는 이미 localStorage 캐시 → 추가 API 호출 없음
        var childIds = await window._getChildFolderIds(SHARED_FOLDER_ID, ['Backups', 'App_Config']);
        var allFolderIds = [SHARED_FOLDER_ID].concat(childIds);
        var _fileQ = `mimeType='application/json' and trashed=false`;
        var _listOpts = { fields: 'files(id, name, modifiedTime, appProperties)', corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true };

        var responses = await Promise.all(allFolderIds.map(function(folderId) {
            return gapi.client.drive.files.list(Object.assign({}, _listOpts, {
                q: _fileQ + ` and '${folderId}' in parents`,
                orderBy: 'modifiedTime desc'
            }));
        }));

        // 결과 병합 + 중복 제거(같은 파일이 두 폴더에 걸쳐 나올 수 있는 엣지케이스 방어)
        var seenIds = {};
        var allFiles = [];
        responses.forEach(function(resp) {
            (resp.result.files || []).forEach(function(f) {
                if (!seenIds[f.id]) { seenIds[f.id] = true; allFiles.push(f); }
            });
        });
        // 각 폴더 결과를 합쳤으므로 수정시간 내림차순 재정렬
        allFiles.sort(function(a, b) { return (b.modifiedTime || '') > (a.modifiedTime || '') ? 1 : -1; });

        var _abExclude = window.AddressBook ? window.AddressBook.FILE_NAME : 'AddressBook_Shared.json';
        return allFiles.filter(function(f) {
            return !f.name.startsWith('백업_')
                && !f.name.startsWith('TaskInbox_')
                && f.name !== PROMPT_DRIVE_FILENAME
                && f.name !== HOLIDAY_DRIVE_FILENAME
                && f.name !== PRIORITY_CONFIG_FILENAME
                && f.name !== PROJECT_INDEX_FILENAME
                && f.name !== MS_FILTER_RULES_DRIVE_FILENAME
                && f.name !== _abExclude;
        });
    };

    window.loadFromGoogleDrive = async function() {
        const _ldEn = window._currentLang === 'en';
        try {
            // 💡 [팀 그룹핑] 파일 목록 + project_index(팀 정보) 병렬 로드 — 직렬보다 빠르고 추가 지연 없음
            const [files, indexProjects] = await Promise.all([
                window._listProjectFiles(),
                window._loadProjectIndexForModal ? window._loadProjectIndexForModal().catch(function() { return []; }) : Promise.resolve([])
            ]);
            if (!files || files.length === 0) {
                window.showToast(_ldEn ? "No project files found in the shared team folder." : "팀 공용 폴더에 저장된 간트차트 프로젝트 파일이 없습니다.", 'error');
                return;
            }
            window.closeAllTopbarMenus(); // ✅ 드라이브 파일 목록 팝업 뜨기 전, 열려있던 파일 드롭다운 자동 닫기
            window.showDriveFileModal(files, 'open', indexProjects);
            window.showToast(_ldEn ? "✅ Project list loaded. Please select a file." : "✅ 공용 프로젝트 목록을 불러왔습니다. 화면에서 파일을 선택해 주세요.");
        } catch (err) { alert(_ldEn ? "Failed to load list: insufficient permissions or invalid folder ID." : "목록 호출 실패: 권한이 없거나 폴더 ID가 잘못되었습니다."); }
    }

    // 💡 [2026-08-25 신규] "🗑️ 프로젝트 삭제" — 구글 드라이브에서 프로젝트 파일을 지워도
    //    project_index.json(메일 자동매칭용 인덱스)엔 그 항목이 유령처럼 계속 남아있던 문제 해결.
    //    같은 목록 모달을 'delete' 모드로 열어서, 여기서 지우면 ①드라이브 파일 휴지통 이동
    //    ②project_index.json 항목 제거 ③열려있던 시트 탭 정리까지 한 번에 처리한다.
    window.deleteProjectFlow = async function() {
        const _en = window._currentLang === 'en';
        if (!window.isDriveConnected) {
            alert(_en ? "🔒 Please connect Google Drive first." : "🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.");
            return;
        }
        window.closeAllTopbarMenus();
        try {
            // 💡 [팀 그룹핑] 파일 목록 + project_index 병렬 로드
            const [files, indexProjects] = await Promise.all([
                window._listProjectFiles(),
                window._loadProjectIndexForModal ? window._loadProjectIndexForModal().catch(function() { return []; }) : Promise.resolve([])
            ]);
            if (!files || files.length === 0) {
                window.showToast(_en ? "No project files found in the shared team folder." : "팀 공용 폴더에 저장된 간트차트 프로젝트 파일이 없습니다.", 'error');
                return;
            }
            window.showDriveFileModal(files, 'delete', indexProjects);
        } catch (err) {
            alert((_en ? "Failed to load list: " : "목록 호출 실패: ") + err.message);
        }
    };

    // project_index.json에서 특정 프로젝트 항목만 제거 (드라이브에서 파일을 지운 뒤, 메일 자동매칭
    // 후보 목록에 유령으로 남지 않도록 함께 정리). 인덱스 파일 자체가 없으면 지울 것도 없으니 통과.
    window._removeProjectIndexEntry = async function(driveFileId) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;
            const indexFileId = await window.findProjectIndexFile(token);
            if (!indexFileId) return true;
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const loaded = await res.json();
            if (!loaded || !Array.isArray(loaded.projects)) return true;
            const before = loaded.projects.length;
            loaded.projects = loaded.projects.filter(function(p) { return p.drive_file_id !== driveFileId; });
            if (loaded.projects.length === before) return true; // 원래 인덱스에 없었음
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media&supportsAllDrives=true`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(loaded)
            });
            return true;
        } catch (err) { console.warn('project_index.json 항목 제거 실패:', err.message); return false; }
    };

    // 실제 삭제 실행 — ①파일명 직접 입력 확인(오클릭 방지) ②관리자 비밀번호 확인 ③드라이브 휴지통 이동
    // ④project_index.json 정리 ⑤열려있는 시트 탭 정리, 순서로 진행. 완전삭제가 아니라 "휴지통 이동"이라
    // 구글 드라이브 휴지통에서 30일 내 복구는 가능함(실수 대비 최소 안전장치).
    window._confirmDeleteProjectFile = async function(file) {
        const _en = window._currentLang === 'en';
        const typed = prompt(_en
            ? `⚠️ This permanently removes the project from the shared folder (recoverable from Google Drive Trash for a limited time).\nType the exact file name to confirm:\n\n${file.name}`
            : `⚠️ 이 프로젝트를 공용 폴더에서 삭제합니다 (구글 드라이브 휴지통에서 일정 기간 복구 가능).\n확인을 위해 파일명을 정확히 입력하세요:\n\n${file.name}`);
        if (typed !== file.name) {
            if (typed !== null) alert(_en ? '❌ File name did not match. Cancelled.' : '❌ 파일명이 일치하지 않습니다. 삭제가 취소되었습니다.');
            return;
        }
        if (!verifyAdminPassword(_en
            ? '🔒 Enter the admin password to delete this project.\n(case-insensitive)'
            : '🔒 프로젝트를 삭제하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
            alert(_en ? '❌ Authentication failed. Deletion cancelled.' : '❌ 비밀번호 인증 실패. 삭제가 취소되었습니다.');
            return;
        }
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) { alert(_en ? '🔒 Auth token lost. Please reconnect Google Drive.' : '🔒 구글 인증 토큰을 확보하지 못했습니다. 연동 버튼을 다시 클릭해 주세요.'); return; }

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?supportsAllDrives=true`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ trashed: true })
            });
            if (!res.ok) {
                const errBody = await res.json().catch(function() { return {}; });
                throw new Error((errBody.error && errBody.error.message) || ('HTTP ' + res.status));
            }

            await window._removeProjectIndexEntry(file.id);

            // 지금 열려있는 시트 중 이 파일과 연결된 탭이 있으면 정리(이미 지운 파일이라 저장하지 않고 그냥 닫음)
            const openIdx = window._sheets ? window._sheets.findIndex(function(s) { return s.fileId === file.id; }) : -1;
            if (openIdx !== -1) {
                const wasActive = window._sheets[openIdx].key === window._activeSheetKey;
                window._sheets.splice(openIdx, 1);
                if (wasActive) {
                    if (window._sheets.length) {
                        const next = window._sheets[Math.min(openIdx, window._sheets.length - 1)];
                        window._activeSheetKey = next.key;
                        window._restoreSheetSnapshot(next.snapshot);
                    } else {
                        window._activeSheetKey = null;
                        window._resetToBlankNoConfirm(true);
                    }
                } else {
                    window.renderSheetTabsBar();
                }
            }

            if (window.showToast) window.showToast(_en ? `🗑️ Deleted: ${file.name}` : `🗑️ 삭제 완료: ${file.name}`, 'info');

            // 같은 모달에서 이어서 다른 프로젝트도 지울 수 있도록 목록을 새로고침 (캐시된 인덱스 재사용)
            const remaining = await window._listProjectFiles();
            if (remaining.length) window.showDriveFileModal(remaining, 'delete', window._piModalCache || []); else window.closeDriveModal();
        } catch (err) {
            alert((_en ? 'Delete failed: ' : '삭제 실패: ') + err.message);
        }
    };

    // 💡 백업 폴더(Drive) 찾기/생성 — SHARED_FOLDER_ID 안에 "Backups" 폴더가 없으면 새로 만듦
    window.getOrCreateBackupFolder = async function(token) {
        if (window._backupFolderId) return window._backupFolderId;
        const q = `mimeType='application/vnd.google-apps.folder' and name='Backups' and trashed=false and '${SHARED_FOLDER_ID}' in parents`;
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)&orderBy=modifiedTime%20desc`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const listData = await listRes.json();
        if (listData.files && listData.files.length > 0) {
            window._backupFolderId = listData.files[0].id;
            return window._backupFolderId;
        }
        const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Backups', mimeType: 'application/vnd.google-apps.folder', parents: [SHARED_FOLDER_ID] })
        });
        const created = await createRes.json();
        window._backupFolderId = created.id;
        return window._backupFolderId;
    };

    // 💡 [팀별 백업 폴더] Backups/ 안에 팀명 서브폴더를 찾거나 생성.
    //    구조: SHARED_FOLDER_ID/Backups/개발N팀/백업_*.json
    window._backupTeamFolderCache = window._backupTeamFolderCache || {};
    window._getOrCreateBackupTeamFolder = async function(token, teamName) {
        if (window._backupTeamFolderCache[teamName]) return window._backupTeamFolderCache[teamName];
        const backupFolderId = await window.getOrCreateBackupFolder(token);
        if (!backupFolderId) return backupFolderId;
        const q = `mimeType='application/vnd.google-apps.folder' and name='${teamName}' and trashed=false and '${backupFolderId}' in parents`;
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const listData = await listRes.json();
        if (listData.files && listData.files.length > 0) {
            window._backupTeamFolderCache[teamName] = listData.files[0].id;
            return window._backupTeamFolderCache[teamName];
        }
        const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: teamName, mimeType: 'application/vnd.google-apps.folder', parents: [backupFolderId] })
        });
        const created = await createRes.json();
        window._backupTeamFolderCache[teamName] = created.id;
        return window._backupTeamFolderCache[teamName];
    };

    // ═══════════════════════════════════════════════════════════
    // 📁 [Drive 폴더 정리] 공용 폴더 루트에 흩어져 있던 설정/백업류 파일을 하위 폴더로 정리.
    //    프로젝트 *.json 파일은 지금처럼 그대로 루트에 둔다(파일 탐색기에서 바로 보이게).
    //    - _App_Config/     : AddressBook_Shared.json, PriorityScore_Shared.json, Holidays_Shared.json,
    //                         AI_Prompt_Shared.json, project_index.json, MailFilterRules_Shared.json
    //    - TaskInbox_Backups/ : TaskInbox_<이름>.json (개인별 업무 보관함 백업)
    //    - Backups/ (기존 유지) : mail_secure.enc, telegram_secure.enc, gantt_pw_sync.json
    // ═══════════════════════════════════════════════════════════
    window._namedFolderIdCache = window._namedFolderIdCache || {};
    // 💡 getOrCreateBackupFolder와 동일한 find-or-create 패턴의 범용 버전 — 폴더 이름만 바꿔가며 재사용
    // 💡 [버그 수정] 실사용 중 Drive 연동 직후 주소록/우선순위점수/휴일/AI프롬프트/프로젝트인덱스/필터규칙
    //    등 여러 기능이 거의 동시에 각자 "_App_Config 폴더 있나? 없으면 만들기"를 시도하면서, 아직 아무도
    //    생성을 못 끝낸 그 찰나(수백ms)에 서로 "없다"고 판단해 같은 이름의 폴더를 중복 생성하는 사고가
    //    실제로 발생함(_App_Config 폴더가 2개 생김). 이미 진행 중인 생성 작업이 있으면 새로 조회/생성하지
    //    않고 그 결과를 그대로 기다리게 해서(in-flight 프라미스 공유) 경합을 없앤다.
    window._namedFolderPromiseCache = window._namedFolderPromiseCache || {};
    window._getOrCreateNamedFolder = function(token, folderName) {
        if (window._namedFolderIdCache[folderName]) return Promise.resolve(window._namedFolderIdCache[folderName]);
        if (window._namedFolderPromiseCache[folderName]) return window._namedFolderPromiseCache[folderName];

        const p = (async () => {
            const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false and '${SHARED_FOLDER_ID}' in parents`;
            const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)&orderBy=modifiedTime%20desc`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const listData = await listRes.json();
            if (listData.files && listData.files.length > 0) {
                window._namedFolderIdCache[folderName] = listData.files[0].id;
                return window._namedFolderIdCache[folderName];
            }
            const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [SHARED_FOLDER_ID] })
            });
            const created = await createRes.json();
            window._namedFolderIdCache[folderName] = created.id;
            return window._namedFolderIdCache[folderName];
        })();

        window._namedFolderPromiseCache[folderName] = p;
        p.finally(() => { delete window._namedFolderPromiseCache[folderName]; });
        return p;
    };
    window.getOrCreateConfigFolder    = function(token) { return window._getOrCreateNamedFolder(token, 'App_Config'); };
    window.getOrCreateTaskInboxFolder = function(token) { return window._getOrCreateNamedFolder(token, 'TaskInbox_Backups'); };
    // 💡 [팀 폴더] 팀명으로 Drive 하위 폴더를 가져오거나 생성. _getOrCreateNamedFolder와 동일하나 의도를 명시.
    window.getOrCreateTeamFolder = function(token, teamName) { return window._getOrCreateNamedFolder(token, teamName); };

    // 💡 [팀 폴더 이동] Drive 파일을 해당 팀 폴더로 이동(아직 팀 폴더에 없을 때만). 저장 자체를 막지 않도록
    //    fire-and-forget으로 호출하며, 실패해도 console.warn만 남긴다.
    window._moveFileToTeamFolder = async function(token, fileId, teamName) {
        if (!token || !fileId || !teamName) return;
        try {
            const teamFolderId = await window._getOrCreateNamedFolder(token, teamName);
            if (!teamFolderId) return;
            // 현재 파일 위치 조회
            const metaRes = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const meta = await metaRes.json();
            const currentParents = meta.parents || [];
            if (currentParents.includes(teamFolderId)) return; // 이미 팀 폴더 안에 있음
            const removeParents = currentParents.join(',');
            const patchUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`
                + `?addParents=${encodeURIComponent(teamFolderId)}`
                + `&removeParents=${encodeURIComponent(removeParents)}`
                + `&supportsAllDrives=true&fields=id`;
            await fetch(patchUrl, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: '{}'
            });
            console.info(`[팀 폴더] 이동 완료: ${fileId} → ${teamName}`);
        } catch(e) {
            console.warn('[팀 폴더] 파일 이동 실패 (저장 자체는 정상 완료):', e);
        }
    };

    // 💡 [마이그레이션 포함 조회] 이미 팀이 루트에 저장해둔 기존 설정 파일을 "새로 만든 것처럼" 못 찾아서
    //    빈 기본값으로 초기화되는 사고를 막기 위해: 새 하위 폴더에서 먼저 찾고, 없으면 예전 위치(루트)에서
    //    찾아 그 파일을 하위 폴더로 실제로 옮긴다(복제가 아니라 이동 — 되돌리기 쉬움, 데이터 유실 없음).
    window._findOrMigrateFile = async function(token, fileName, targetFolderId) {
        const qSub = `name='${fileName}' and trashed=false and '${targetFolderId}' in parents`;
        const subRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qSub)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const subData = await subRes.json();
        if (subData.files && subData.files.length > 0) return subData.files[0].id;

        const qRoot = `name='${fileName}' and trashed=false and '${SHARED_FOLDER_ID}' in parents`;
        const rootRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qRoot)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const rootData = await rootRes.json();
        if (!rootData.files || !rootData.files.length) return null; // 어디에도 없음 — 신규 파일

        const oldId = rootData.files[0].id;
        try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${oldId}?addParents=${targetFolderId}&removeParents=${SHARED_FOLDER_ID}&supportsAllDrives=true`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }
            });
            console.info(`💡 [Drive 폴더 정리] "${fileName}"을(를) 루트에서 하위 폴더로 이동했습니다.`);
        } catch (e) { console.warn('Drive 파일 폴더 이동 실패(루트에 그대로 둠):', fileName, e.message); }
        return oldId;
    };

    // 💡 저장 시마다 드라이브 Backups 폴더에 타임스탬프 백업 파일 생성 + 7일 지난 백업 자동 삭제
    window.backupToDrive = async function(saveData, baseName) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return;
            // 💡 [팀별 백업] pm.팀이 설정돼 있으면 Backups/팀명/ 서브폴더에, 없으면 Backups/ 루트에 저장
            const _backupTeam = (window.projectMeta || {}).팀 || '';
            const folderId = (_backupTeam && window._getOrCreateBackupTeamFolder)
                ? await window._getOrCreateBackupTeamFolder(token, _backupTeam)
                : await window.getOrCreateBackupFolder(token);

            const now = new Date();
            const ts = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0')
                + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
            const backupName = '백업_' + (baseName || 'GanttChart').replace(/\.json$/i, '') + '_' + ts + '.json';

            const boundary = 'backup_boundary';
            // 💡 [2026-08-30 신규] 복원 목록에서도 저장된 테마 색을 바로 보여주기 위해 appProperties에 같이 태움.
            const metadata = { name: backupName, mimeType: 'application/json', parents: [folderId], appProperties: { themeColor: (saveData && saveData.tabData && saveData.tabData.themeColor) || '' } };
            const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(saveData)
                + "\r\n--" + boundary + "--";

            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                body: body
            });

            // 💡 7일(604800000ms) 지난 백업은 자동 정리
            const listQ = `'${folderId}' in parents and trashed=false`;
            const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(listQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,createdTime)`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const listData = await listRes.json();
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const oldFiles = (listData.files || []).filter(function(f) { return new Date(f.createdTime).getTime() < cutoff; });
            for (const f of oldFiles) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        } catch (err) { alert("목록 호출 실패: 권한이 없거나 폴더 ID가 잘못되었습니다."); }
    }

    // ─── 🤖 팀 공용 AI 프롬프트 — 드라이브에 JSON으로 저장/동기화 ───
    const PROMPT_DRIVE_FILENAME = 'AI_Prompt_Shared.json';

    window.findPromptDriveFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, PROMPT_DRIVE_FILENAME, folderId);
    };

    // 💡 드라이브에서 최신 팀 공용 프롬프트를 받아와 localStorage에 반영 (미연동이면 조용히 종료)
    window.loadPromptFromDrive = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;

            // 💡 [2026-08-24 버그 수정] "AI 개선 채택"을 드라이브 미연동 상태(또는 업로드 실패)로 했다면
            //    로컬에 아직 드라이브로 못 올라간 변경이 남아있을 수 있음 — 이 상태에서 그냥 드라이브
            //    최신본을 받아와 덮어쓰면 방금 채택한 변경이 조용히 사라진다. 대기 중인 로컬 변경이
            //    있으면 "받아오기" 대신 그 변경을 먼저 드라이브로 "올려주기"로 전환.
            if (localStorage.getItem('gantt_mail_prompt_pending_push') === '1') {
                const pendingText = localStorage.getItem('gantt_mail_prompt');
                if (pendingText && window.savePromptToDrive) {
                    const pushed = await window.savePromptToDrive(pendingText);
                    if (pushed) localStorage.removeItem('gantt_mail_prompt_pending_push');
                }
                return pendingText; // 성공/실패 어느 쪽이든, 아직 못 올렸을 수 있으니 로컬 변경을 보존하고 그대로 반환
            }

            const fileId = await window.findPromptDriveFile(token);
            if (!fileId) return null;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.prompt) {
                localStorage.setItem('gantt_mail_prompt', data.prompt);
                window._promptDriveMeta = { updatedBy: data.updatedBy || '', updatedAt: data.updatedAt || '' };
                return data.prompt;
            }
            return null;
        } catch (err) { console.error('프롬프트 드라이브 로드 실패:', err); return null; }
    };

    // 💡 현재 프롬프트를 드라이브 공용 파일로 업로드 (여러 사람이 이어서 발전시킬 수 있도록)
    window.savePromptToDrive = async function(text) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;

            const fileId = await window.findPromptDriveFile(token);
            const payload = {
                prompt: text,
                updatedBy: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
                updatedAt: new Date().toLocaleString('ko-KR'),
                version: (window._promptVersion || 1)  // 💡 버전 번호 (채택 시 증가)
            };

            // 💡 [버그 수정] fetch()는 HTTP 오류 응답에도 예외 없이 resolve된다 — res.ok를 확인하지 않으면
            //    업로드 실패를 "성공"으로 착각해 pending_push 플래그가 잘못 해제되고, 다음 드라이브
            //    재연결 시 옛 버전이 로컬 편집을 덮어써버림 (AI 프로젝트 요약 프롬프트에서 발견된 것과
            //    동일한 패턴의 버그 — 그쪽을 고치며 함께 수정).
            let res;
            if (fileId) {
                res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'prompt_boundary';
                const metadata = { name: PROMPT_DRIVE_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(payload)
                    + "\r\n--" + boundary + "--";
                res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: body
                });
            }
            if (!res.ok) throw new Error(`Drive 업로드 HTTP ${res.status}`);
            return true;
        } catch (err) { console.error('프롬프트 드라이브 저장 실패:', err); return false; }
    };

    // ─── 🤖 [2026-08-24 신규] AI 프로젝트 요약 프롬프트 — 위 메일분석 프롬프트와 완전히 동일한 패턴을
    //    그대로 복제한 "별도" 파일. AI_Prompt_Shared.json 안에 필드 하나 추가하는 방법도 가능했지만,
    //    그러면 updatedBy/updatedAt/version이 서로 다른 두 프롬프트의 이력을 한 필드로 뭉뚱그려서
    //    "누가 언제 뭘 고쳤는지"가 헷갈리게 됨 — 이 코드베이스가 이미 AddressBook/PriorityScore/
    //    MailFilterRules처럼 "파일 하나 = 관심사 하나" 원칙을 따르고 있어서, 그 관례를 그대로 따름 ───
    const PROJECT_SUMMARY_PROMPT_DRIVE_FILENAME = 'AI_ProjectSummary_Prompt_Shared.json';

    window.findProjectSummaryPromptDriveFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, PROJECT_SUMMARY_PROMPT_DRIVE_FILENAME, folderId);
    };

    // 💡 드라이브에서 최신 팀 공용 프롬프트를 받아와 localStorage에 반영 (미연동이면 조용히 종료)
    window.loadProjectSummaryPromptFromDrive = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;

            // 💡 [2026-08-24 버그 수정] "AI 개선 채택"을 드라이브 미연동 상태(또는 업로드 실패)로 했다면
            //    로컬에 아직 드라이브로 못 올라간 변경이 남아있을 수 있음 — 이 상태에서 그냥 드라이브
            //    최신본을 받아와 덮어쓰면 방금 채택한 변경이 조용히 사라진다. 대기 중인 로컬 변경이
            //    있으면 "받아오기" 대신 그 변경을 먼저 드라이브로 "올려주기"로 전환.
            if (localStorage.getItem('gantt_project_summary_prompt_pending_push') === '1') {
                const pendingText = localStorage.getItem('gantt_project_summary_prompt');
                if (pendingText && window.saveProjectSummaryPromptToDrive) {
                    const pushed = await window.saveProjectSummaryPromptToDrive(pendingText);
                    if (pushed) localStorage.removeItem('gantt_project_summary_prompt_pending_push');
                }
                return pendingText; // 성공/실패 어느 쪽이든, 아직 못 올렸을 수 있으니 로컬 변경을 보존하고 그대로 반환
            }

            const fileId = await window.findProjectSummaryPromptDriveFile(token);
            if (!fileId) return null;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.prompt) {
                localStorage.setItem('gantt_project_summary_prompt', data.prompt);
                window._projectSummaryPromptDriveMeta = { updatedBy: data.updatedBy || '', updatedAt: data.updatedAt || '' };
                return data.prompt;
            }
            return null;
        } catch (err) { console.error('AI 요약 프롬프트 드라이브 로드 실패:', err); return null; }
    };

    // 💡 현재 프롬프트를 드라이브 공용 파일로 업로드 (여러 사람이 이어서 발전시킬 수 있도록)
    window.saveProjectSummaryPromptToDrive = async function(text) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;

            const fileId = await window.findProjectSummaryPromptDriveFile(token);
            const payload = {
                prompt: text,
                updatedBy: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
                updatedAt: new Date().toLocaleString('ko-KR'),
                version: (window._projectSummaryPromptVersion || 1)
            };

            // 💡 [버그 수정] fetch()는 401/403/404 등 HTTP 오류 응답에도 정상적으로 resolve되고 예외를
            //    던지지 않는다 — 아래에서 res.ok를 확인하지 않으면 업로드가 실제로는 실패했는데도
            //    이 함수가 true를 반환해서 "드라이브 저장 완료" 상태(pending_push 플래그 해제)로
            //    잘못 표시된다. 그러면 다음번 loadProjectSummaryPromptFromDrive() 호출(드라이브
            //    재연결 시 자동 실행됨) 때 옛 드라이브 버전을 그대로 받아와 방금 편집한 로컬 프롬프트를
            //    조용히 덮어써버려 "프롬프트를 수정해도 분석에 반영이 안 되는" 증상으로 이어졌음.
            let res;
            if (fileId) {
                res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'proj_summary_prompt_boundary';
                const metadata = { name: PROJECT_SUMMARY_PROMPT_DRIVE_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(payload)
                    + "\r\n--" + boundary + "--";
                res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: body
                });
            }
            if (!res.ok) throw new Error(`Drive 업로드 HTTP ${res.status}`);
            return true;
        } catch (err) { console.error('AI 요약 프롬프트 드라이브 저장 실패:', err); return false; }
    };

    // ─── 💬 [2026-08-31 신규] AI 문답 프롬프트 — 드라이브에 JSON으로 저장/동기화 ───
    //    기존엔 소스 코드(_buildGanttQaPrompt)에 통째로 하드코딩되어 있어 문구 하나 고치려면 코드를
    //    수정·배포해야 했다. AI 업무분석/AI 프로젝트 요약과 완전히 동일한 패턴(팀 공용 Drive JSON +
    //    localStorage 캐시)으로 옮겨서, 코드 수정 없이 앱 화면에서 프롬프트를 조정하고 팀과 공유할 수 있게 함.
    const GANTT_QA_PROMPT_DRIVE_FILENAME = 'AI_QA_Prompt_Shared.json';

    window.findGanttQaPromptDriveFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, GANTT_QA_PROMPT_DRIVE_FILENAME, folderId);
    };

    // 💡 드라이브에서 최신 팀 공용 프롬프트를 받아와 localStorage에 반영 (미연동이면 조용히 종료)
    window.loadGanttQaPromptFromDrive = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;

            // 💡 위 두 프롬프트와 동일한 안전장치 — 아직 드라이브로 못 올린 로컬 변경이 있으면
            //    "받아오기" 대신 그 변경을 먼저 드라이브로 "올려주기"로 전환.
            if (localStorage.getItem('gantt_qa_prompt_pending_push') === '1') {
                const pendingText = localStorage.getItem('gantt_qa_prompt');
                if (pendingText && window.saveGanttQaPromptToDrive) {
                    const pushed = await window.saveGanttQaPromptToDrive(pendingText);
                    if (pushed) localStorage.removeItem('gantt_qa_prompt_pending_push');
                }
                return pendingText;
            }

            const fileId = await window.findGanttQaPromptDriveFile(token);
            if (!fileId) return null;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.prompt) {
                localStorage.setItem('gantt_qa_prompt', data.prompt);
                window._ganttQaPromptDriveMeta = { updatedBy: data.updatedBy || '', updatedAt: data.updatedAt || '' };
                return data.prompt;
            }
            return null;
        } catch (err) { console.error('AI 문답 프롬프트 드라이브 로드 실패:', err); return null; }
    };

    // 💡 현재 프롬프트를 드라이브 공용 파일로 업로드 (여러 사람이 이어서 발전시킬 수 있도록)
    window.saveGanttQaPromptToDrive = async function(text) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;

            const fileId = await window.findGanttQaPromptDriveFile(token);
            const payload = {
                prompt: text,
                updatedBy: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
                updatedAt: new Date().toLocaleString('ko-KR'),
                version: (window._ganttQaPromptVersion || 1)
            };

            let res;
            if (fileId) {
                res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'qa_prompt_boundary';
                const metadata = { name: GANTT_QA_PROMPT_DRIVE_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(payload)
                    + "\r\n--" + boundary + "--";
                res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: body
                });
            }
            if (!res.ok) throw new Error(`Drive 업로드 HTTP ${res.status}`);
            return true;
        } catch (err) { console.error('AI 문답 프롬프트 드라이브 저장 실패:', err); return false; }
    };

    // ─── 🗓️ 팀 공용 휴일 목록 — 드라이브에 JSON으로 저장/동기화 ───
    const HOLIDAY_DRIVE_FILENAME = 'Holidays_Shared.json';

    window.findHolidayDriveFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, HOLIDAY_DRIVE_FILENAME, folderId);
    };

    // 💡 드라이브에서 팀 공용 휴일 목록을 받아와 로컬 캐시(localStorage)에 반영 (미연동이면 조용히 종료)
    window.loadHolidaysFromDrive = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;

            const fileId = await window.findHolidayDriveFile(token);
            if (!fileId) return null;

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (Array.isArray(data)) {
                localStorage.setItem('gantt_custom_holidays', JSON.stringify(data));
                if (window.renderCustomHolidayList) window.renderCustomHolidayList();
                return data;
            }
            return null;
        } catch (err) { console.error('휴일 목록 드라이브 로드 실패:', err); return null; }
    };

    // 💡 현재 휴일 목록을 드라이브 공용 파일로 업로드 (여러 사람이 등록/삭제한 내용을 공유)
    window.saveHolidaysToDrive = async function(list) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;

            const fileId = await window.findHolidayDriveFile(token);
            const body = JSON.stringify(list);

            if (fileId) {
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: body
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'holiday_boundary';
                const metadata = { name: HOLIDAY_DRIVE_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body
                    + "\r\n--" + boundary + "--";
                await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: multipartBody
                });
            }
            return true;
        } catch (err) { console.error('휴일 목록 드라이브 저장 실패:', err); return false; }
    };

