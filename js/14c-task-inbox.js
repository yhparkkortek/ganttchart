// [분리됨] 원본: js/14-ai-mail-analysis.js 의 1560~2339행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: [Phase 1] 업무 보관함 (Task Inbox) — 프로젝트 독립 스테이징
// =========================================================
// 📥 [Phase 1] 업무 보관함 (Task Inbox) — 프로젝트 독립 스테이징
// =========================================================
window.TaskInbox = {
    KEY: 'gantt_task_inbox',
    _driveFileId: null,
    _syncTimer: null,
    _fileName: function() {
        const name = (window.currentUserName || '').replace(/[\\\/:*?"<>|]/g, '').trim();
        return (name && name !== '비로그인 (로컬)') ? ('TaskInbox_' + name + '.json') : null;
    },
    load: function() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch(e) { return []; }
    },
    // 🐛 [2026-09-07 버그수정] "Setting the value of 'gantt_task_inbox' exceeded the quota" —
    //    처리완료(배치됨/전송됨) 항목도 '보관' 모드(기본값)에선 사람이 하나씩 🗑로 지우기 전까진
    //    영원히 목록에 남고, 각 항목이 메일 원문(mailRaw.body2000, 최대 2000자)까지 그대로 들고
    //    있어서 자동처리로 오래 쌓이면 localStorage 용량(브라우저별 5~10MB)을 넘길 수 있었다.
    //    이 상태에서 setItem이 그대로 throw하면 이후의 모든 add/setStatus 호출(메일 자동처리 파이프라인
    //    포함)이 연쇄로 실패해 화면엔 브라우저 원문 에러만 노출됐다 — 자동 경량화 후 재시도하도록 방어.
    save: function(list, skipSync) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(list));
        } catch (e) {
            if (!this._isQuotaError(e)) throw e;
            console.warn('[업무 보관함] localStorage 용량 초과 — 완료 항목부터 자동 정리 후 재시도합니다.', e);
            list = this._shrinkForQuota(list);
            try {
                localStorage.setItem(this.KEY, JSON.stringify(list));
            } catch (e2) {
                // 🩺 [2026-09-21] 저장소 닥터(js/34): 다시 만들 수 있는 캐시(Drive 폴더 캐시 등)만 자동으로 비우고 한 번 더 시도한다.
                //    그래도 안 되면 "어느 키가 공간을 차지하는지"까지 알려준다(보관함이 아니라 다른 저장 데이터가 원인인 경우가 있음 —
                //    예전엔 이 경우 🧹 버튼이 "정리할 항목 없음"만 반복했다).
                let recovered = false;
                try {
                    if (window._storageDoctorAuto && window._storageDoctorAuto()) { localStorage.setItem(this.KEY, JSON.stringify(list)); recovered = true; }
                } catch (e3) { /* 그래도 부족 */ }
                if (!recovered) {
                    const _why = window._storageDoctorWarnText && window._storageDoctorWarnText();
                    if (window.showToast) window.showToast(_why || window._t('⚠️ 업무 보관함 저장 공간이 가득 찼습니다. [업무 보관함] 헤더의 🧹 저장공간 정리 버튼을 눌러주세요.', '⚠️ Task Inbox storage is full. Please click the 🧹 Clean up storage button in the [Task Inbox] header.'), 'error');
                    throw e2; // 자동 정리로도 부족하면 호출자에게 계속 알림 (기존 동작 유지)
                }
            }
        }
        window.updateInboxBadge();
        if (!skipSync) this.scheduleDriveSync(); // 💡 저장할 때마다 드라이브 자동 동기화 (3초 디바운스)
        // 💡 [실시간 반영] add/remove/setStatus 등 어디서 저장이 일어나든, 업무 보관함 모달이 지금 열려있으면
        //    그 자리에서 바로 다시 그려줌 — 예전엔 batchToInbox 한 곳에서만 이 처리를 해서, 완전자동 등록이나
        //    자동틱처럼 다른 경로로 담긴 항목은 모달을 닫았다 다시 열어야만 보였음
        const ov = document.getElementById('task-inbox-overlay');
        if (ov && ov.style.display === 'flex' && window.renderTaskInbox) window.renderTaskInbox();
    },
    _isQuotaError: function(e) {
        return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
    },
    // 💡 용량 초과 시 자동 경량화. 순서:
    //    ① 처리완료(상태≠'대기') 항목의 메일 원문(mailRaw)부터 제거 — 이미 배치된 프로젝트의 해당
    //       업무 행(row._mailRaw)에도 같은 원문이 저장돼 있어(buildMailTaskRow), 여기서 지워도 안 사라짐.
    //    ② 그래도 부족하면(항목 수 자체가 너무 많음) 오래된 완료 항목부터 정리(최근 N건만 유지) — '대기'
    //       항목은 아직 사람이 처리해야 할 것들이라 개수와 무관하게 전부 보존한다.
    //    ③ 🐛 [2026-09-18 버그수정] "완료 항목엔 원문이 없다"고 나오는데도 저장공간이 계속 가득 차는
    //       사례 — 완료 항목이 아니라 '대기' 항목 자체가 대량으로 쌓여(메일 자동매칭이 애매해 사람 확인을
    //       기다리는 채로 방치된 경우 등) 용량을 다 쓰는 경우가 있었다. 위 ①②는 '대기' 항목을 전혀 건드리지
    //       않아서, 이 경우 자동 복구도 실패하고 수동 "🧹 저장공간 정리" 버튼도 "정리할 항목 없음"만 반복
    //       했다(업무 보관함.js의 window.inboxCleanupStorage가 여기 KEEP_PENDING_RAW_MAX를 그대로 재사용
    //       해 같은 기준으로 판단·안내함). 업무 자체(task)는 절대 지우지 않고, 오래된 '대기' 항목의 메일
    //       본문(mailRaw.body2000 — mailRaw 중 가장 큰 필드)만 정리한다. 최근 KEEP_PENDING_RAW_MAX개는
    //       아직 처리 전이라 "원문 보기"가 계속 필요할 가능성이 커서 그대로 둔다.
    KEEP_PENDING_RAW_MAX: 200,
    _shrinkForQuota: function(list) {
        const KEEP_DONE_MAX = 300;
        let shrunk = list.map(function(it) {
            return (it.status !== '대기' && it.mailRaw) ? Object.assign({}, it, { mailRaw: null, _mailRawStripped: true }) : it;
        });
        const pending = shrunk.filter(function(it) { return it.status === '대기'; });
        const done = shrunk.filter(function(it) { return it.status !== '대기'; })
            .sort(function(a, b) { return (b.addedAt || '').localeCompare(a.addedAt || ''); });
        if (done.length > KEEP_DONE_MAX) shrunk = pending.concat(done.slice(0, KEEP_DONE_MAX));

        const KEEP_PENDING_RAW_MAX = this.KEEP_PENDING_RAW_MAX;
        const pendingWithRaw = shrunk.filter(function(it) { return it.status === '대기' && it.mailRaw && it.mailRaw.body2000; })
            .sort(function(a, b) { return (b.addedAt || '').localeCompare(a.addedAt || ''); });
        if (pendingWithRaw.length > KEEP_PENDING_RAW_MAX) {
            const staleUids = {};
            pendingWithRaw.slice(KEEP_PENDING_RAW_MAX).forEach(function(it) { staleUids[it.uid] = true; });
            shrunk = shrunk.map(function(it) {
                if (!staleUids[it.uid]) return it;
                return Object.assign({}, it, { mailRaw: Object.assign({}, it.mailRaw, { body2000: null }), _mailRawBodyStripped: true });
            });
        }
        return shrunk;
    },
    add: function(task, meta) {
        const list = this.load();
        list.unshift({
            uid: 'ib_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            task: JSON.parse(JSON.stringify(task)),
            source: (meta && meta.source) || '메일분석',
            addedAt: new Date().toISOString(),
            status: '대기',            // 대기 | 배치됨 (Phase2에서 '전송됨' 추가)
            history: [],
            mailRaw: (meta && meta.mailRaw) ? meta.mailRaw : null,  // 💡 파싱 원문 보관 (없으면 null)
            // 💡 [매칭/점수 통일화] Stage1 매칭결과를 소스 라벨(텍스트)뿐 아니라 구조화 데이터로도 보관
            //    — 이게 없으면 "다른 프로젝트로 전송" 버튼이 매칭결과를 몰라서 매번 전체 목록을 새로 뒤져야 함
            matchedProject: (meta && meta.matchedProject) ? meta.matchedProject : null,
            alarmWorthy: !!(meta && meta.alarmWorthy)
        });
        this.save(list);
    },
    // ⭐ [2026-09-23 신규] 삭제 묘비(tombstone)
    //    보관함 드라이브 동기화는 uid 기준 "병합"이라, 묘비가 없으면 **삭제를 표현할 방법이 없다** —
    //    A PC에서 지우고 업로드까지 성공해도 B PC의 localStorage에 그 항목이 남아 있으면 B가 다음에
    //    업로드할 때 되살아난다(실제로 "지웠는데 다시 생긴다"의 원인).
    //    → 지운 uid와 시각을 따로 적어 두고, 파일에 inbox와 함께 올린다. 불러올 때는 양쪽 묘비를
    //      합쳐서 그 uid를 가진 항목을 모든 기기에서 지운다.
    //    되돌리기(↩)는 묘비를 지우는 것으로 표현한다(unmarkDeleted).
    TOMB_KEY: 'gantt_task_inbox_deleted',
    TOMB_MAX_DAYS: 90,   // 이보다 오래된 묘비는 버린다(그 무렵이면 어느 기기든 이미 동기화됐다고 본다)
    TOMB_MAX: 1000,      // 그래도 무한히 쌓이지 않도록 상한 — 오래된 것부터 버림

    loadTombs: function() {
        try { const a = JSON.parse(localStorage.getItem(this.TOMB_KEY) || '[]'); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    },
    saveTombs: function(list) {
        try { localStorage.setItem(this.TOMB_KEY, JSON.stringify(list)); }
        catch (e) {
            // 용량이 모자라면 최근 절반만 남기고 재시도 — 묘비 때문에 보관함 저장이 막히면 안 된다
            try { localStorage.setItem(this.TOMB_KEY, JSON.stringify(list.slice(-Math.ceil(list.length / 2)))); }
            catch (e2) { console.warn('[업무 보관함] 삭제 묘비 저장 실패(무시):', e2.message); }
        }
    },
    _pruneTombs: function(list) {
        const cut = Date.now() - this.TOMB_MAX_DAYS * 86400000;
        let out = (list || []).filter(function(t) {
            if (!t || !t.uid) return false;
            const ts = t.at ? new Date(t.at).getTime() : 0;
            return !ts || ts >= cut;
        });
        out.sort(function(a, b) { return String(a.at || '').localeCompare(String(b.at || '')); }); // 오래된 것 먼저
        if (out.length > this.TOMB_MAX) out = out.slice(-this.TOMB_MAX);
        return out;
    },
    /** uid들을 "삭제됨"으로 기록 (이미 있으면 시각만 갱신) */
    markDeleted: function(uids, atIso) {
        const arr = Array.isArray(uids) ? uids : [uids];
        if (!arr.length) return;
        const at = atIso || new Date().toISOString();
        const map = {};
        this.loadTombs().forEach(function(t) { if (t && t.uid) map[t.uid] = t; });
        arr.forEach(function(u) { if (u) map[u] = { uid: u, at: at }; });
        this.saveTombs(this._pruneTombs(Object.keys(map).map(function(k) { return map[k]; })));
    },
    /** 되돌리기 — 묘비를 지워 다시 살아나게 한다 */
    unmarkDeleted: function(uids) {
        const arr = Array.isArray(uids) ? uids : [uids];
        if (!arr.length) return;
        const drop = {};
        arr.forEach(function(u) { drop[u] = true; });
        this.saveTombs(this.loadTombs().filter(function(t) { return !(t && drop[t.uid]); }));
    },
    /** 로컬 + 원격 묘비를 합쳐 저장하고, uid Set을 돌려준다 */
    _mergeTombs: function(remoteTombs) {
        const map = {};
        this.loadTombs().forEach(function(t) { if (t && t.uid) map[t.uid] = t; });
        (remoteTombs || []).forEach(function(t) {
            if (!t || !t.uid) return;
            const cur = map[t.uid];
            if (!cur || String(t.at || '') > String(cur.at || '')) map[t.uid] = t;
        });
        const merged = this._pruneTombs(Object.keys(map).map(function(k) { return map[k]; }));
        this.saveTombs(merged);
        const set = {};
        merged.forEach(function(t) { set[t.uid] = true; });
        return set;
    },

    remove: function(uid) {
        this.markDeleted([uid]); // ⭐ [2026-09-23] 다른 기기에서 되살아나지 않도록 묘비를 먼저 남긴다
        this.save(this.load().filter(it => it.uid !== uid));
    },
    setStatus: function(uid, status, historyEntry) {
        const list = this.load();
        const it = list.find(x => x.uid === uid);
        if (!it) return;
        // 💡 [처리됨 자동삭제 모드] "대기"가 아닌 상태(=처리 완료)로 바뀌는 순간, 모드가 'auto'면
        //    [🧹 처리됨 정리]를 기다리지 않고 바로 목록에서 제거한다. (window.getInboxCleanupMode 참고)
        if (status !== '대기' && window.getInboxCleanupMode && window.getInboxCleanupMode() === 'auto') {
            this.markDeleted([uid]); // ⭐ [2026-09-23] 설정으로 선택한 삭제라 묘비 대상(다른 기기에서도 정리)
            this.save(list.filter(x => x.uid !== uid));
            return;
        }
        it.status = status;
        if (historyEntry) (it.history = it.history || []).push(historyEntry);
        this.save(list);
    },
    // ── 💡 [A안] 구글 드라이브 개인 보관함 동기화 ──
    _token: function() {
        try { const t = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null; return (t ? t.access_token : null) || window.googleAccessToken || null; } catch(e) { return window.googleAccessToken || null; }
    },
    scheduleDriveSync: function() {
        const self = this;
        if (self._syncTimer) clearTimeout(self._syncTimer);
        self._syncTimer = setTimeout(function() { self.syncToDrive(); }, 3000);
    },
    // ⭐ [2026-09-23] 호출부가 "드라이브까지 반영됐는지"를 알 수 있게 결과를 돌려준다.
    //    'ok'(업로드 성공) | 'skipped'(비로그인 — 로컬에만 저장) | 'failed'(시도했지만 실패)
    syncToDrive: async function() {
        const fname = this._fileName(); const token = this._token();
        if (!fname || !token) return 'skipped'; // 비로그인: localStorage 단독 동작
        try {
            const folderId = await window.getOrCreateTaskInboxFolder(token);
            if (!this._driveFileId) this._driveFileId = await window._findOrMigrateFile(token, fname, folderId);
            const boundary = 'inbox_sync_boundary';
            const metadata = { name: fname, mimeType: 'application/json' };
            if (!this._driveFileId) metadata.parents = [folderId];
            const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ inbox: this.load(), deleted: this.loadTombs(), savedAt: new Date().toISOString() }) + "\r\n--" + boundary + "--";
            const url = 'https://www.googleapis.com/upload/drive/v3/files' + (this._driveFileId ? '/' + this._driveFileId : '') + '?uploadType=multipart&supportsAllDrives=true';
            const resp = await fetch(url, { method: this._driveFileId ? 'PATCH' : 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, body: body });
            const file = await resp.json();
            if (resp.ok && file && file.id) this._driveFileId = file.id;
            return resp.ok ? 'ok' : 'failed';
        } catch (e) { console.warn('보관함 드라이브 동기화 실패(로컬에는 저장됨):', e); return 'failed'; }
    },

    // ⭐ [2026-09-23 신규] 예약된 3초 디바운스를 기다리지 않고 지금 바로 올린다.
    //    삭제처럼 "반영됐는지"가 중요한 조작은 이걸 쓰고 결과를 사람에게 알린다 —
    //    예전엔 3초 뒤 조용히 올리고 실패해도 console.warn뿐이라, 그 사이에 창을 닫거나
    //    업로드가 실패하면 다음 loadFromDrive(uid 기준 병합)에서 지운 항목이 다시 살아나왔다.
    syncNow: async function() {
        if (this._syncTimer) { clearTimeout(this._syncTimer); this._syncTimer = null; }
        return await this.syncToDrive();
    },
    loadFromDrive: async function() {
        const fname = this._fileName(); const token = this._token();
        if (!fname || !token) return;
        try {
            const folderId = await window.getOrCreateTaskInboxFolder(token);
            this._driveFileId = await window._findOrMigrateFile(token, fname, folderId);
            if (!this._driveFileId) { this.scheduleDriveSync(); return; } // 첫 사용: 로컬 내용을 드라이브로 업로드
            const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + this._driveFileId + '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!resp.ok) return;
            const data = await resp.json();
            const remote = (data && data.inbox) || [];
            // ⭐ [2026-09-23] 삭제 묘비 — 로컬+원격 묘비를 합쳐 저장하고, 그 uid는 양쪽 어디에 있든 지운다.
            //    이게 없으면 병합이 삭제를 표현하지 못해 다른 기기에 남은 항목이 계속 되살아난다.
            const tombSet = this._mergeTombs((data && data.deleted) || []);
            // 💡 uid 기준 병합: 같은 항목은 로컬 우선(현재 기기에서 조작한 상태가 최신), 드라이브에만 있으면 복원
            const local = this.load(); const byUid = {};
            remote.forEach(function(it) { if (it && it.uid) byUid[it.uid] = it; });
            local.forEach(function(it) { if (it && it.uid) byUid[it.uid] = it; });
            const merged = Object.keys(byUid)
                .filter(function(k) { return !tombSet[k]; }) // ⭐ 지운 건은 다시 살리지 않는다
                .map(function(k) { return byUid[k]; }).sort(function(a, b) { return (b.addedAt || '').localeCompare(a.addedAt || ''); });
            this.save(merged, true);
            this.scheduleDriveSync();
            const ov = document.getElementById('task-inbox-overlay');
            if (window.renderTaskInbox && ov && ov.style.display === 'flex') window.renderTaskInbox();
        } catch (e) { console.warn('보관함 드라이브 복원 실패(로컬 유지):', e); }
    }
};

// 💡 공용: 모달을 열 때마다 그 순간 가장 높은 z-index를 부여해서 항상 맨 위로 오게 함
window._topModalZ = window._topModalZ || 9999;
window.bringModalToFront = function(overlayId) {
    const el = document.getElementById(overlayId);
    if (!el) return;
    window._topModalZ += 1;
    el.style.zIndex = String(window._topModalZ);
};

// 열려있는 모달을 클릭하면 항상 최상단으로 (겹칠 때 마지막 클릭한 창이 위로)
window._bindClickToFront = function(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    el.addEventListener('mousedown', function() {
        window._topModalZ = (window._topModalZ || 9999) + 1;
        el.style.zIndex = String(window._topModalZ);
    });
};
['alarm-settings-modal', 'mail-analyzer-modal', 'task-inbox-modal', 'alarm-modal', 'alarm-schedule-modal', 'notice-modal'].forEach(window._bindClickToFront);

window.updateInboxBadge = function() {
    const badge = document.getElementById('inbox-badge');
    if (!badge) return;
    const n = window.TaskInbox.load().filter(it => it.status === '대기').length;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-block' : 'none';
};

window.openTaskInbox = function() {
    if (window._ibRepairPendingDates) window._ibRepairPendingDates(); // ⭐ [2026-09-23] 열 때 '날짜확인필요' 항목을 메일 수신일로 보수
    window.closeAllTopbarMenus(); // ✅ 업무 보관함 열릴 때 업무 드롭다운 자동 닫기
    window.renderTaskInbox();
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 미분류/신규발신자 배지가 이제 여기 있음
    if (window.refreshInboxCleanupModeButton) window.refreshInboxCleanupModeButton(); // 💡 처리됨 자동삭제/보관 토글 버튼 상태 갱신
    document.getElementById('task-inbox-overlay').style.display = 'flex';
    window.bringModalToFront('task-inbox-overlay');
};
window.closeTaskInbox = function() {
    document.getElementById('task-inbox-overlay').style.display = 'none';
};
// 🐛 [2026-09-07 버그수정 — AI 문답과 동일 패턴] 페이지 로드 시 자동으로 최소화되는 4개 모달 중
//    하나(19-shared-modal-drag.js DEFAULTS) — 로그인 완료 전에 한 번 렌더된 채 최소화된다. 이후
//    로그인해서 드라이브 보관함 동기화(TaskInbox.loadFromDrive)가 병합돼도, 그 완료 핸들러가
//    "모달이 지금 열려있을 때만" 다시 그려주는데(display==='flex' 조건) 최소화 중엔 안 열려있어서
//    건너뛴다 — 그 상태로 타스크바 칩으로 복원만 하면 옛 로컬 상태가 계속 보였음. 아래 3개 함수는
//    전부 "현재 상태 기준 재렌더"라 다시 불러도 안전(입력 중이던 내용을 지우지 않음)하므로 복원
//    훅에 등록.
window._modalRefreshOnRestore = window._modalRefreshOnRestore || {};
window._modalRefreshOnRestore['task-inbox-overlay'] = function() {
    if (window.renderTaskInbox) window.renderTaskInbox();
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    if (window.refreshInboxCleanupModeButton) window.refreshInboxCleanupModeButton();
};

// 현재 프로젝트의 개발단계(L0) 목록 수집
window.getCurrentL0List = function() {
    if (!globalData || globalData.length <= 1 || !colIdx) return [];
    return window.buildL0SectionInfo(globalData, colIdx);
};

// 💡 [버그 수정] "▼ 상세 보기"로 펼친 상태는 지금까지 DOM(display:none/block)에만 있었는데,
//    renderTaskInbox()는 목록 전체를 innerHTML로 통째로 새로 그리기 때문에, 버튼 하나(현재 Proj 전송/
//    매칭 Proj 전송/🗑 등)를 눌러 목록이 다시 그려지는 순간 펼쳐놨던 상세 내용이 전부 접혀버렸음.
//    → 어떤 카드를 펼쳤는지 uid 기준으로 별도 기억해뒀다가, 다시 그릴 때 그 상태를 그대로 복원한다.
window._ibExpandedUids = window._ibExpandedUids || new Set();
window._ibToggleDetail = function(uid, linkEl) {
    const d = document.getElementById('inbox-detail-' + uid);
    if (!d) return;
    const open = d.style.display === 'none';
    d.style.display = open ? 'block' : 'none';
    const _en = window._currentLang === 'en';
    linkEl.textContent = open ? (_en ? '▲ Collapse' : '▲ 상세 접기') : (_en ? '▼ Details' : '▼ 상세 보기');
    if (open) window._ibExpandedUids.add(uid); else window._ibExpandedUids.delete(uid);
};

// 💡 [2026-09-06 신규] 업무 보관함 상단 집계 요약 — 사용자 피드백: "대기가 너무 많아서 뭐가 문제인지
//    분별이 안 됨" → 카드 수십 개를 하나씩 읽지 않고도 어느 프로젝트에 몰려있는지 바로 보이게 함.
// 💡 [2026-09-06 개선] ①상태별(자동배치됨/대기/전송됨/배치됨) 전부 프로젝트별 세부 집계 추가
//    ②칩을 클릭하면 그 상태(+프로젝트)만 걸러서 아래 목록에 표시(window._tiFilter) ③이 요약 자체는
//    스크롤 안 되는 고정 영역(#inbox-summary, HTML 쪽 변경)에 그려짐.
var _TI_STATUS_STYLE = {
    '대기':       { bg: '#fff3e0', fg: '#a85d0a', emoji: '🟠' },
    '자동배치됨': { bg: '#f3f0ff', fg: '#5f3dc4', emoji: '🟣' },
    '전송됨':     { bg: '#e7f3ff', fg: '#1971c2', emoji: '🔵' },
    '배치됨':     { bg: '#e6f6ea', fg: '#1f7a3d', emoji: '🟢' }
};
// 💡 [2026-09-12 i18n] 요약 칩(_tiBuildSummaryHtml)과 카드 배지(renderTaskInboxList) 양쪽에서
// 공유하는 상태명 영문 매핑 — 예전엔 요약 칩 쪽에 이 매핑이 아예 없어서 영문 모드에서도
// "자동배치됨/대기/전송됨/배치됨"이 그대로 노출되고 있었음.
var _TI_STATUS_LABEL_EN = { '대기': 'Pending', '배치됨': 'Placed', '전송됨': 'Sent', '자동배치됨': 'Auto-placed' };

/** 업무 1건이 매칭된 프로젝트명 (없으면 noMatchLabel) — 요약 집계·필터 양쪽에서 재사용 */
function _tiProjectOf(it, noMatchLabel) {
    return (it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0])
        ? (it.matchedProject.candidates[0].model || it.matchedProject.candidates[0].customer)
        : noMatchLabel;
}

window._tiFilter = window._tiFilter || null; // { status, project(선택, null=그 상태 전체) }
/** 요약 칩 클릭 핸들러 — 같은 칩을 다시 누르면 필터 해제(토글) */
window._tiSetFilter = function(status, project) {
    project = project || null;
    if (window._tiFilter && window._tiFilter.status === status && (window._tiFilter.project || null) === project) {
        window._tiFilter = null;
    } else {
        window._tiFilter = { status: status, project: project };
    }
    window.renderTaskInbox();
};
window._tiClearFilter = function() {
    window._tiFilter = null;
    window.renderTaskInbox();
};

// ⭐ [2026-09-23 신규] 요약에서 상태+프로젝트로 걸러낸 묶음을 통째로 지우는 버튼(🗑).
//    자동배치가 끝난 건들이 보관함에 수백 건씩 남아 "전체 479건" 같은 상태가 되는데, 프로젝트별로
//    정리하려면 카드마다 🗑을 눌러야 했다. 선택된 프로젝트 칩 옆에서 한 번에 지운다.
//    ⚠️ 지우는 건 "보관함 기록"일 뿐 — 이미 간트차트에 배치된 업무 자체는 그대로 남는다.
// 💡 확인창(confirm)은 쓰지 않는다(보관함 수동 작업 공통 규칙) — 대신 지운 묶음을 메모리에 들고
//    있다가 요약에 [↩ 삭제 취소] 칩을 띄워 되돌릴 수 있게 한다(실수 복구 경로를 먼저 만들어 둠).
window._tiUndoBuffer = window._tiUndoBuffer || null; // { items:[...], label:'', at:ms }

/** ↩ 삭제 취소 칩에 붙일 "(프로젝트 · 상태)" 문구 — 저장값은 한글 고정이므로 표시할 때만 영문으로 바꿼다 */
function _tiUndoLabel(ub, en) {
    const st = ub.status ? (en ? (_TI_STATUS_LABEL_EN[ub.status] || ub.status) : ub.status) : '';
    const parts = [ub.project, st].filter(Boolean);
    return parts.length ? ` <span style="color:#b98a4b;">(${escapeHtml(parts.join(' · '))})</span>` : '';
}

window._tiBulkDeleteFiltered = async function(status, project) {
    const _en = window._currentLang === 'en';
    const noMatchLabel = _en ? '(no match)' : '(매칭없음)';
    const all = window.TaskInbox.load();
    const hit = function(it) {
        if (status && it.status !== status) return false;
        if (project && _tiProjectOf(it, noMatchLabel) !== project) return false;
        return true;
    };
    const doomed = all.filter(hit);
    if (!doomed.length) return;
    // 💡 [i18n] 라벨을 미리 문자열로 굳혀놓으면 언어를 바꿔도 상태명이 한글로 남는다 — 값만 보관하고 표시는 렌더링 시점에
    window._tiUndoBuffer = { items: doomed, status: status || '', project: project || '', at: Date.now() };
    window.TaskInbox.markDeleted(doomed.map(function(it) { return it.uid; })); // ⭐ [2026-09-23] 삭제 묘비 — 다른 기기에서도 지워진다
    window.TaskInbox.save(all.filter(function(it) { return !hit(it); }));
    window.renderTaskInbox();
    // ⭐ [2026-09-23] 3초 디바운스를 기다리지 않고 즉시 드라이브까지 반영한다 —
    //    업로드 전에 창을 닫거나 실패하면, 다음 loadFromDrive(uid 기준 병합)에서 지운 항목이 되살아난다.
    const _sync = await window.TaskInbox.syncNow();
    if (window.showToast) {
        // ⭐ [2026-09-23] '대기'는 아직 어느 프로젝트에도 안 들어간 업무라 지우면 그 자체로 사라진다 —
        //    배치 끝난 기록을 정리하는 것과 무게가 다르므로 안내 문구를 구분한다.
        const _pending = status === '대기';
        window.showToast(_en
            ? (_pending
                ? `🗑 Removed ${doomed.length} PENDING record(s) — these were not placed in any project. Use [↩ Undo delete] in the summary to restore.`
                : `🗑 Removed ${doomed.length} inbox record(s) — use [↩ Undo delete] in the summary to restore. Tasks already placed in the Gantt chart are NOT affected.`)
            : (_pending
                ? `🗑 대기 기록 ${doomed.length}건 삭제 — 어느 프로젝트에도 배치되지 않았던 건입니다. 요약의 [↩ 삭제 취소]로 되돌릴 수 있습니다.`
                : `🗑 보관함 기록 ${doomed.length}건 삭제 — 요약의 [↩ 삭제 취소]로 되돌릴 수 있습니다. 이미 간트차트에 배치된 업무는 그대로입니다.`),
            'info', 6000);
    }
    // ⭐ 드라이브 반영 결과는 따로 알린다(실패를 조용히 삼키면 "지웠는데 다시 생김"으로 돌아온다)
    if (_sync === 'failed' && window.showToast) {
        window.showToast(window._t(
            '⚠️ 드라이브 반영에 실패했습니다(로컬에는 삭제됨) — 연결 확인 후 다시 지우거나, 그대로 두면 다음 접속 때 복구될 수 있습니다.',
            '⚠️ Failed to sync the deletion to Drive (deleted locally) — check your connection and delete again, otherwise the items may come back on next sign-in.'
        ), 'error', 7000);
    }
};

window._tiUndoBulkDelete = async function() {
    const buf = window._tiUndoBuffer;
    if (!buf || !buf.items || !buf.items.length) return;
    const cur = window.TaskInbox.load();
    const seen = {};
    cur.forEach(function(it) { seen[it.uid] = true; });
    const restored = buf.items.filter(function(it) { return !seen[it.uid]; });
    window.TaskInbox.unmarkDeleted(buf.items.map(function(it) { return it.uid; })); // ⭐ 묘비를 지워야 다시 살아난다
    window.TaskInbox.save(restored.concat(cur));
    window._tiUndoBuffer = null;
    window.renderTaskInbox();
    const _sync = await window.TaskInbox.syncNow(); // ⭐ 복구도 드라이브에 바로 반영
    if (window.showToast) {
        window.showToast(window._t(
            `↩ ${restored.length}건을 되돌렸습니다.${_sync === 'failed' ? ' (드라이브 반영 실패 — 로컬엔 복구됨)' : ''}`,
            `↩ Restored ${restored.length} record(s).${_sync === 'failed' ? ' (Drive sync failed — restored locally)' : ''}`), _sync === 'failed' ? 'error' : 'info');
    }
};

window._tiBuildSummaryHtml = function(items) {
    if (!items || !items.length) return '';
    const _en = window._currentLang === 'en';
    const noMatchLabel = _en ? '(no match)' : '(매칭없음)';
    function topCount(arr, keyFn, limit) {
        const m = {};
        arr.forEach(x => { const k = keyFn(x) || (_en ? '(unknown)' : '(알수없음)'); m[k] = (m[k] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, limit || 8);
    }
    const filter = window._tiFilter;
    function chip(label, count, bg, fg, status, project) {
        const active = filter && filter.status === status && (filter.project || null) === (project || null);
        return `<span class="ti-chip" data-status="${escapeHtml(status)}" data-project="${escapeHtml(project || '')}" ` +
            `title="${_en ? 'Click to filter the list below' : '클릭하면 아래 목록을 이 항목만 보여줍니다'}" ` +
            `style="display:inline-block;background:${bg};color:${fg};border-radius:10px;padding:2px 8px;margin:2px 4px 2px 0;` +
            `font-size:11px;white-space:nowrap;cursor:pointer;${active ? 'outline:2px solid ' + fg + ';' : ''}">` +
            `${escapeHtml(label)} <b>${count}</b>` +
            // ⭐ [2026-09-23] 선택된 칩에 작은 휴지통 — 그 묶음을 통째로 지운다.
            //    프로젝트 칩은 "그 상태+그 프로젝트", 상태 칩(큰 분류)은 "그 상태 전체"가 대상이다.
            (active
                ? `<span class="ti-bulk-del" data-status="${escapeHtml(status)}" data-project="${escapeHtml(project || '')}" ` +
                  `title="${status === '대기'
                      ? (_en ? 'Delete these ' + count + ' pending records — they are NOT placed in any project yet, so the tasks are lost (undo available right after)'
                             : '이 ' + count + '건의 대기 기록을 지웁니다 — 아직 어느 프로젝트에도 배치되지 않은 업무라 같이 사라집니다 (직후 되돌리기 가능)')
                      : (_en ? 'Delete these ' + count + ' inbox records (tasks already placed in the Gantt chart are not affected)'
                             : '이 ' + count + '건의 보관함 기록을 지웁니다 (간트차트에 배치된 업무는 그대로)')}" ` +
                  `style="margin-left:5px;padding:0 4px;border-radius:5px;cursor:pointer;color:#b1432f;background:#fbe4e2;border:1px solid #eeb0ac;font-size:10.5px;line-height:1.5;">🗑︎</span>`
                : '') +
            `</span>`;
    }

    // 💡 [2026-09-06 개선] "전체 N건" 자체를 클릭하면 필터가 해제되도록(➜ 기존 "✕ 해제" 버튼은 제거,
    //    전체보기로 돌아가는 길이 이거 하나로 통일돼서 더 직관적) — class="ti-clear-filter"를 그대로 재사용.
    const statusTop = topCount(items, x => x.status, 10);
    let html = `<div id="inbox-summary-box" style="padding:10px 12px;background:#f8faff;border:1px solid #e3ecfa;border-radius:8px;font-size:11.5px;color:#333;">` +
        `<div><span class="ti-clear-filter" title="${_en ? 'Click to show all (clear filter)' : '클릭하면 전체보기(필터 해제)'}" ` +
        `style="cursor:pointer;text-decoration:underline dotted;"><b>${_en ? 'Total' : '전체'} ${items.length}${_en ? '' : '건'}</b></span> — ` +
        statusTop.map(e => {
            const sc = _TI_STATUS_STYLE[e[0]] || { bg: '#eef3ff', fg: '#1a4f7a' };
            const label = _en ? (_TI_STATUS_LABEL_EN[e[0]] || e[0]) : e[0];
            return chip(label, e[1], sc.bg, sc.fg, e[0], null);
        }).join('') + `</div>`;

    // 💡 [2026-09-06 개선] "자리를 많이 차지한다"는 피드백 — 기본으로는 위 상태별 건수 줄만 보이고,
    //    상태 칩을 클릭해 그 상태로 필터링된 동안에만(=아코디언, 한 번에 하나) 그 상태의 프로젝트별
    //    세부 집계를 펼쳐 보여준다. 별도 펼침 상태를 안 두고 window._tiFilter.status를 그대로 재사용 —
    //    필터 해제(=전체보기)로 돌아가면 자동으로 전부 접힌다.
    if (filter) {
        const st = filter.status;
        const subset = items.filter(x => x.status === st);
        // ⭐ [2026-09-23] 예전엔 (1) 프로젝트가 한 종류뿐이면(byProject.length > 1 조건) 아예 안 보이고
        //    (2) 상위 8개만 보여줘서, "대기 175건"처럼 많은 상태가 프로젝트별로 전혀 정리되지
        //    않았다(미분류 항목이 많으면 전부 "(매칭없음)" 한 바구니라 줄 자체가 사라졌다).
        //    → 상태를 고르면 항상 프로젝트별 줄을 보여주고, 상위 12개까지 내보내고 나머지는 "그 외" 칩으로 알린다.
        const PROJ_CHIP_MAX = 12;
        const byProjectAll = topCount(subset, x => _tiProjectOf(x, noMatchLabel), 9999);
        const byProject = byProjectAll.slice(0, PROJ_CHIP_MAX);
        const restGroups = byProjectAll.slice(PROJ_CHIP_MAX);
        const restCount = restGroups.reduce((a, e) => a + e[1], 0);
        if (subset.length) {
            const dates = subset.map(x => (x.addedAt || '').slice(0, 10)).filter(Boolean).sort();
            const range = dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '';
            const sc = _TI_STATUS_STYLE[st] || { bg: '#eef3ff', fg: '#1a4f7a', emoji: '🔹' };
            const stLabel = _en ? (_TI_STATUS_LABEL_EN[st] || st) : st;
            html += `<div style="margin-top:6px;"><b>${sc.emoji} ${stLabel} ${subset.length}${_en ? '' : '건'} ${_en ? 'by project' : '프로젝트별'}:</b><br>` +
                byProject.map(e => chip(e[0], e[1], sc.bg, sc.fg, st, e[0])).join('') +
                (restGroups.length
                    ? `<span title="${_en ? restGroups.map(e => e[0] + ' ' + e[1]).join(', ') : escapeHtml(restGroups.map(e => e[0] + ' ' + e[1] + '건').join(', '))}" ` +
                      `style="display:inline-block;color:#888;font-size:11px;padding:2px 6px;">` +
                      `${_en ? `+${restGroups.length} more (${restCount})` : `외 ${restGroups.length}개 프로젝트 ${restCount}건`}</span>`
                    : '') +
                (range ? `<span style="color:#999;margin-left:4px;">(${escapeHtml(range)})</span>` : '') + `</div>`;
        }
        const filterStatusLabel = _en ? (_TI_STATUS_LABEL_EN[filter.status] || filter.status) : filter.status;
        const filterLabel = filter.project ? `${filterStatusLabel} · ${filter.project}` : filterStatusLabel;
        html += `<div style="margin-top:8px;"><span style="font-size:11px;color:#1971c2;font-weight:bold;">🔎 ${_en ? 'Filtered' : '필터링 중'}: ${escapeHtml(filterLabel)}</span></div>`;
    }
    // ⭐ [2026-09-23] 방금 묶음 삭제한 게 있으면 되돌릴 길을 열어둔다(확인창 없이 지우므로 필수)
    if (window._tiUndoBuffer && window._tiUndoBuffer.items && window._tiUndoBuffer.items.length) {
        const ub = window._tiUndoBuffer;
        html += `<div style="margin-top:6px;"><span class="ti-undo-del" ` +
            `title="${_en ? 'Restore the records just deleted' : '방금 지운 기록을 되돌립니다'}" ` +
            `style="display:inline-block;background:#fff3e0;color:#a85d0a;border:1px solid #ffca75;border-radius:10px;` +
            `padding:2px 8px;font-size:11px;cursor:pointer;">↩ ${_en ? 'Undo delete' : '삭제 취소'} ` +
            `<b>${ub.items.length}</b>${_en ? '' : '건'}${_tiUndoLabel(ub, _en)}</span></div>`;
    }
    html += `</div>`;
    return html;
};

window.renderTaskInbox = function() {
    const listEl = document.getElementById('inbox-list');
    if (!listEl) return;
    // 💡 목록을 통째로 다시 그리기 전에, 여러 카드가 공유하는 dist-step2가
    //    현재 어느 카드 안에 들어있든 함께 파괴되지 않도록 body로 먼저 대피
    const step2 = document.getElementById('dist-step2');
    if (step2 && step2.parentElement && step2.parentElement.id !== 'inbox-dist-overlay') {
        step2.style.display = 'none';
        document.body.appendChild(step2);
    }
    const items = window.TaskInbox.load();
    const _ibEn = window._currentLang === 'en';
    const noMatchLabel = _ibEn ? '(no match)' : '(매칭없음)';

    // 💡 [2026-09-06] 요약 패널은 스크롤 안 되는 고정 영역(#inbox-summary)에 항상 "전체 items" 기준으로
    //    그린다 — 필터가 걸려도 다른 칩으로 바로 갈아탈 수 있어야 하므로 요약 자체는 필터링하지 않음.
    const summaryEl = document.getElementById('inbox-summary');
    if (summaryEl) {
        summaryEl.innerHTML = window._tiBuildSummaryHtml(items);
        if (!summaryEl._tiDelegated) {
            summaryEl._tiDelegated = true; // 렌더할 때마다 innerHTML을 통째로 새로 그리므로, 리스너는 한 번만 위임 바인딩
            summaryEl.addEventListener('click', function(e) {
                if (e.target.closest('.ti-clear-filter')) { window._tiClearFilter(); return; }
                // ⭐ [2026-09-23] 휴지통은 칩 안에 있으므로 칩 토글보다 먼저 가로채야 한다
                const delEl = e.target.closest('.ti-bulk-del');
                if (delEl) {
                    e.stopPropagation();
                    window._tiBulkDeleteFiltered(delEl.dataset.status || null, delEl.dataset.project || null);
                    return;
                }
                if (e.target.closest('.ti-undo-del')) { window._tiUndoBulkDelete(); return; }
                const chipEl = e.target.closest('.ti-chip');
                if (!chipEl) return;
                window._tiSetFilter(chipEl.dataset.status || null, chipEl.dataset.project || null);
            });
        }
    }

    if (items.length === 0) {
        listEl.innerHTML = '<div style="padding:40px 0; text-align:center; color:#aaa; font-size:13px;">' + (_ibEn ? 'Inbox is empty.<br>Use the [📥 Inbox] button in the mail analysis screen to add tasks.' : '보관함이 비어 있습니다.<br>메일 분석 화면에서 [📥 보관함] 버튼으로 업무를 담아주세요.') + '</div>';
        return;
    }

    // 💡 [2026-09-06] 요약 칩 클릭으로 설정된 필터(window._tiFilter)를 여기서 실제로 적용
    const _tiF = window._tiFilter;
    const filteredItems = _tiF
        ? items.filter(function(it) {
            if (_tiF.status && it.status !== _tiF.status) return false;
            if (_tiF.project && _tiProjectOf(it, noMatchLabel) !== _tiF.project) return false;
            return true;
        })
        : items;
    if (!filteredItems.length) {
        listEl.innerHTML = '<div style="padding:40px 0; text-align:center; color:#aaa; font-size:13px;">' +
            (_ibEn ? 'No items match the current filter.' : '이 필터에 해당하는 업무가 없습니다.') + '</div>';
        return;
    }

    const l0List = window.getCurrentL0List();
    const statusStyle = { '대기': 'background:#fff3e0;color:#e67e22;', '배치됨': 'background:#d4edda;color:#2f9e44;', '전송됨': 'background:#e7f3ff;color:#1971c2;', '자동배치됨': 'background:#f3f0ff;color:#7048e8;' };
    const statusLabel = _ibEn
        ? _TI_STATUS_LABEL_EN
        : { '대기': '대기', '배치됨': '배치됨', '전송됨': '전송됨', '자동배치됨': '자동배치됨' };
    let html = '';
    filteredItems.forEach(function(it) {
        const t = it.task || {};
        // 💡 업무의 개발단계 값이 실제 구간명과 정확히 일치하면 그걸 우선 쓰고,
        //    아니면(AI분석 업무는 대부분 여기 해당) 날짜 기반으로 알맞은 구간을 자동 선택
        const devStageVal = (t['개발단계'] || '').trim();
        const wantName = l0List.some(function(sec) { return sec.name === devStageVal; })
            ? devStageVal
            : window.pickL0SectionByDate(l0List, t['시작일'] || '');
        const l0Options = ['<option value="__END__">' + (_ibEn ? '(Append at end)' : '(맨 끝에 추가)') + '</option>']
            .concat(l0List.map(function(sec) {
                const selAttr = (sec.name === wantName) ? ' selected' : '';
                const range = window.formatYM(sec.startTs) + '~' + window.formatYM(sec.endTs);
                return '<option value="' + escapeHtml(sec.name) + '"' + selAttr + '>' + escapeHtml(sec.name) + (_ibEn ? ' end (' : ' 구간 끝 (') + range + ')</option>';
            })).join('');
        const dateStr = (t['시작일'] || '?') + ' ~ ' + (t['완료일'] || '?');
        const when = it.addedAt ? new Date(it.addedAt).toLocaleString() : '';
        // 💡 [담당구분] 매칭된 프로젝트가 지금 열려있는 시트와 같을 때만 실제 담당자명까지 붙임
        //    (다른 프로젝트로 매칭된 항목은 그 프로젝트의 Summary 정보가 메모리에 없어 이름을 알 수 없음)
        const catVal = (t['담당구분'] || '').trim();
        let assigneeBadge = '';
        if (catVal && catVal !== '미분류') {
            const isCurProj = it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0]
                && it.matchedProject.candidates[0].drive_file_id === window.currentDriveFileId;
            const resolved = isCurProj && window._msResolveCategoryAssignee ? window._msResolveCategoryAssignee(catVal) : null;
            assigneeBadge = (_ibEn ? ' · Owner: ' : ' · 담당: ') + escapeHtml(catVal) + (resolved && resolved.name ? ' (' + escapeHtml(resolved.name) + ')' : '');
        }
        // 💡 [2026-09-12 i18n] it.source는 이 업무가 보관함에 들어온 경로를 나타내는 내부 태그 값(저장은
        // 항상 한글 고정 — 다른 코드가 문자열로 비교/매칭할 수 있어 저장값 자체는 안 바꿈)이라, 화면
        // 표시할 때만 골라서 영문으로 바꿔치기한다. 목록에 없는 값(옛 데이터 등)은 원문 그대로 표시.
        const _sourceEnMap = {
            '업무 추가(메일분석)': 'Added (mail analysis)',
            '업무보관함': 'Task Inbox',
            '업무보관함(다중전송)': 'Task Inbox (multi-send)',
            '메일자동처리(커트라인)': 'Mail auto-process (cutoff)',
            '미분류 재분석(다중전송)': 'Unclassified re-analysis (multi-send)',
        };
        const sourceDisplay = _ibEn
            ? (_sourceEnMap[it.source] || (it.source || '').replace('🔀 오매칭 재배치', '🔀 Mismatch reassignment'))
            : (it.source || '');
        html += `
        <div style="border:1px solid #e0e0e0; border-radius:8px; padding:10px 12px; margin-bottom:8px; background:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
                    <span style="font-size:13px; font-weight:bold; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t['업무명'] || (_ibEn ? 'New Task' : '새 업무'))} 📧</span>
                    <a href="javascript:void(0)" onclick="window._ibToggleDetail('${it.uid}', this)" style="flex-shrink:0; font-size:11px; color:#1971c2; text-decoration:none; font-weight:bold; white-space:nowrap;">${window._ibExpandedUids.has(it.uid) ? (_ibEn ? '▲ Collapse' : '▲ 상세 접기') : (_ibEn ? '▼ Details' : '▼ 상세 보기')}</a>
                    <button onclick="window.extractInboxForAI('${it.uid}')" onmouseover="this.style.background='#e4dbff'; this.style.borderColor='#b8a4f0';" onmouseout="this.style.background='#f3f0ff'; this.style.borderColor='#d0bfff';" title="${_ibEn ? 'Copy mail source + analysis result to clipboard, to discuss a mismatch with AI' : '메일 원문 + 분석 결과를 복사해서 AI에게 오매칭 여부를 문의할 수 있습니다'}" style="flex-shrink:0; font-size:11px; padding:2px 8px; background:#f3f0ff; color:#5f3dc4; border:1px solid #d0bfff; border-radius:5px; cursor:pointer; font-weight:bold; white-space:nowrap; transition:background .15s, border-color .15s;">📋 ${_ibEn ? 'Extract reason' : '추출사유'}</button>
                    ${it.status === '대기' ? `<button onclick="window.inboxCreateNewProjectFromPending('${it.uid}')" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" title="${_ibEn ? 'No project matched (or matched project is wrong) — register this mail as a new project (AI-prefilled)' : '아직 어느 프로젝트에도 배치되지 않은 건 — 이 메일로 새 프로젝트를 등록합니다(AI 자동 추출)'}" style="flex-shrink:0; font-size:11px; padding:2px 8px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:5px; cursor:pointer; font-weight:bold; white-space:nowrap; transition:background .15s, border-color .15s;">➕ ${_ibEn ? 'New Proj' : '새 Proj 생성'}</button>` : ''}
                    ${it.status !== '대기' ? `<button onclick="window.inboxReportFalseMatch('${it.uid}')" onmouseover="this.style.background='#ffe0b2'; this.style.borderColor='#ef8c25';" onmouseout="this.style.background='#fff3e0'; this.style.borderColor='#ffca75';" title="${_ibEn ? 'Report as false match — logs to topic learning, removes from current Gantt if placed here' : '오매칭으로 신고 — 토픽 학습에 기록 · 현재 Proj 배치됨이면 간트에서도 삭제'}" style="flex-shrink:0; font-size:11px; padding:2px 8px; background:#fff3e0; color:#b05000; border:1px solid #ffca75; border-radius:5px; cursor:pointer; font-weight:bold; white-space:nowrap; transition:background .15s, border-color .15s;">🚨 ${_ibEn ? 'False match' : '오매칭 신고'}</button>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                ${(window._confBadge && it.matchedProject && it.matchedProject.confidence)
                    ? window._confBadge(it.matchedProject.confidence, 'match',
                        ((it.matchedProject.multiCount || (it.matchedProject.candidates || []).length) > 1)
                            ? (_ibEn ? `${it.matchedProject.multiCount || it.matchedProject.candidates.length} candidates`
                                     : `후보 ${it.matchedProject.multiCount || it.matchedProject.candidates.length}개`)
                            : '')
                    : ''}
                <span title="${(it.matchedProject && it.matchedProject.matchBasis) ? escapeHtml((it.matchedProject.confidence ? '[' + (_ibEn ? 'AI match confidence: ' : 'AI 매칭 신뢰도: ') + it.matchedProject.confidence + '] ' : '') + it.matchedProject.matchBasis) : ''}" style="flex-shrink:0; font-size:10px; font-weight:bold; padding:2px 8px; border-radius:10px; white-space:nowrap; ${statusStyle[it.status] || statusStyle['대기']}">${statusLabel[it.status] || it.status}</span>
                </div>
            </div>
            <div style="font-size:11px; color:#888; margin-top:3px;">
                ${dateStr}${t['_dateSource'] ? (t['_dateSource'] === 'mail' ? (_ibEn ? ' 📅(from mail date)' : ' 📅(수신일 기준)') : (_ibEn ? ' 📅(today)' : ' 📅(오늘 기준)')) : ''}${t['개발단계'] ? ' · L0: ' + escapeHtml(t['개발단계']) : ''}${assigneeBadge} · ${escapeHtml(sourceDisplay)} · ${when}
            </div>
            <!-- 💡 [2026-09-09 신규] "왜 자동배치 안 되고 대기인지" — AI가 매 건마다 반환하는 매칭근거를
                 지금까진 신뢰도 판정에만 쓰고 버렸는데(사람이 이유를 알 방법이 없었음), 후보/신뢰도와
                 함께 상태뱃지 툴팁 + 대기 항목에 한해 카드에 바로 보이는 줄로도 노출한다. -->
            <!-- ⭐ [2026-09-23 신규] "신뢰도는 상인데 왜 대기인지" — 자동배치 조건 중 무엇에 걸렸는지를
                 콘솔이 아니라 카드에서 바로 보여준다(window._ibPendingReason). -->
            ${it.status === '대기' ? (function(){ const _r = window._ibPendingReason ? window._ibPendingReason(it) : ''; return _r ? `
            <div style="font-size:10.5px; color:#7a5210; background:#fff8e6; border:1px solid #ffe08a; border-radius:5px; padding:3px 7px; margin-top:4px; line-height:1.4; display:flex; gap:4px; align-items:flex-start;">
                <span style="flex-shrink:0;">⏸</span><span>${escapeHtml(_r)}</span>
            </div>` : ''; })() : ''}
            ${(it.status === '대기' && it.matchedProject && it.matchedProject.matchBasis) ? `
            <div style="font-size:10.5px; color:#a85d0a; margin-top:3px; line-height:1.4; display:flex; gap:4px; align-items:flex-start;">
                <span style="flex-shrink:0;">🤖</span>
                <span>${(_ibEn ? 'AI reasoning' : 'AI 판단 근거')}${it.matchedProject.confidence ? ` (${_ibEn ? 'match confidence: ' : '매칭 신뢰도: '}${escapeHtml(it.matchedProject.confidence)})` : ''}: ${escapeHtml(it.matchedProject.matchBasis)}</span>
            </div>` : ''}
            <div id="inbox-detail-${it.uid}" style="display:${window._ibExpandedUids.has(it.uid) ? 'block' : 'none'}; margin-top:6px; padding:8px 10px; background:#f8f9fb; border:1px solid #e6e9ef; border-radius:6px; font-size:11.5px; color:#444; line-height:1.6;">
                <div><b>${_ibEn ? 'Task' : '업무명'}</b> : ${escapeHtml(t['업무명'] || '')}</div>
                <div><b>${_ibEn ? 'Detail' : '상세내용'}</b> : <span style="white-space:pre-wrap;">${escapeHtml((t['상세내용'] || '').toString())}</span></div>
                <div><b>${_ibEn ? 'Period' : '기간'}</b> : ${escapeHtml(t['시작일'] || '?')} ~ ${escapeHtml(t['완료일'] || '?')} · <b>${_ibEn ? 'Status' : '상태'}</b> : ${escapeHtml(t['상태'] || '진행')} · <b>${_ibEn ? 'WBS Level' : 'WBS레벨'}</b> : L${escapeHtml(String(t['wbs레벨'] !== undefined ? t['wbs레벨'] : 4))}</div>
                ${(it.history && it.history.length) ? '<div style="margin-top:4px;"><b>' + (_ibEn ? 'History' : '이력') + '</b> : ' + it.history.map(function(h){ return escapeHtml((h.time || '') + ' ' + (h.type || '') + ' → ' + (h.target || '')); }).join('<br>　　　　') + '</div>' : ''}
                ${it.mailRaw ? `<div style="margin-top:6px;"><button onclick="window.showInboxMailRaw('${it.uid}')" style="font-size:11px; padding:3px 10px; background:#e7f3ff; color:#1971c2; border:1px solid #a5c8f0; border-radius:5px; cursor:pointer;">📧 ${_ibEn ? 'View Mail Source' : '원문 보기'}</button></div>` : ''}
            </div>
            ${(it.history && it.history.length) ? `<div style="font-size:10px; color:#1971c2; margin-top:2px;">↳ ${it.history.map(function(h){ return escapeHtml((h.type || '') + ': ' + (h.target || '')); }).join(' / ')}</div>` : ''}
            ${(it.matchedProject && it.matchedProject.status === 'ambiguous' && it.matchedProject.candidates && it.matchedProject.candidates.length > 1) ? `
            <div id="inbox-multi-${it.uid}" style="margin-top:8px; padding:8px 10px; background:#eef6ff; border:1px solid #a5c8f0; border-radius:6px;">
                <div style="font-size:11px; font-weight:bold; color:#1a4f7a; margin-bottom:5px;">🔀 ${_ibEn ? 'May belong to several projects at once (check all that apply, then distribute)' : '여러 프로젝트에 공통으로 해당될 수 있는 후보 — 체크한 곳에 모두 배분'}</div>
                <div style="display:flex; flex-direction:column; gap:3px; max-height:120px; overflow-y:auto;">
                    ${it.matchedProject.candidates.map(function(c, ci) {
                        const label = [c.model, c.inch ? c.inch + '"' : ''].filter(Boolean).join(' ') || c.file_name || (_ibEn ? '(no name)' : '(이름없음)');
                        const sub = [c.customer, c.assignee ? (_ibEn ? 'Owner:' : '담당:') + c.assignee : ''].filter(Boolean).join(' · ');
                        return `<label style="display:flex; align-items:center; gap:6px; font-size:11.5px; color:#333; cursor:pointer;">
                            <input type="checkbox" data-idx="${ci}" checked style="cursor:pointer; flex-shrink:0;">
                            <span style="font-weight:bold;">${escapeHtml(label)}</span>${sub ? `<span style="color:#888;">${escapeHtml(sub)}</span>` : ''}
                        </label>`;
                    }).join('')}
                </div>
                <button onclick="window.inboxDistributeToMultiCandidates('${it.uid}')" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="margin-top:6px; width:100%; height:28px; box-sizing:border-box; font-size:11.5px; font-weight:bold; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:5px; cursor:pointer; transition:background .15s, border-color .15s;">📤 ${_ibEn ? 'Distribute to checked projects' : '체크한 프로젝트에 배분'}</button>
            </div>` : ''}
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; align-items:center;">
                <select id="inbox-l0-${it.uid}" onchange="window.inboxRecomputePreview('${it.uid}')" style="flex:0 1 200px; min-width:60px; max-width:220px; padding:0 3px; height:31px; box-sizing:border-box; border:1px solid #ced4da; border-radius:6px; font-size:11px; background:#fff;">${l0Options}</select>
                <button onclick="window.inboxPlaceToCurrent('${it.uid}')" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1.6 1 0; min-width:0; font-size:12px; white-space:nowrap; padding:0 6px; height:31px; box-sizing:border-box; border:1px solid #a5c8f0; border-radius:6px; background:#e8f4fd; color:#1a4f7a; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➡️ ${_ibEn ? 'Current Proj' : '현재 Proj 전송'}</button>
                ${(it.matchedProject && it.matchedProject.status === 'matched' && it.matchedProject.candidates && it.matchedProject.candidates[0] && it.matchedProject.candidates[0].drive_file_id)
                    ? `<button onclick="window.inboxQuickRegisterMatched('${it.uid}')" title="${escapeHtml((it.matchedProject.candidates[0].model || it.matchedProject.candidates[0].customer || '') + ' (' + (it.matchedProject.candidates[0].assignee || '') + ')')}" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1.6 1 0; min-width:0; font-size:12px; white-space:nowrap; padding:0 6px; height:31px; box-sizing:border-box; border:1px solid #a8dab8; border-radius:6px; background:#e6f6ea; color:#1f7a3d; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ ${_ibEn ? 'Send to matched' : '매칭 Proj 전송'}</button>`
                    : ''}
                <button onclick="window.inboxOpenDistribute('${it.uid}')" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="flex:1.6 1 0; min-width:0; font-size:12px; white-space:nowrap; padding:0 6px; height:31px; box-sizing:border-box; border:1px solid #edbf85; border-radius:6px; background:#fbead9; color:#a85d0a; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📤 ${_ibEn ? 'Other Proj' : '다른 Proj 선택'}</button>
                <button onclick="window.inboxDeleteWithFeedback('${it.uid}')" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:0 0 auto; font-size:13px; padding:0 12px; height:31px; box-sizing:border-box; border:1px solid #eeb0ac; border-radius:6px; background:#fbe4e2; color:#b1432f; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🗑</button>
            </div>
            <div id="inbox-dist-inline-${it.uid}" style="display:none; margin-top:8px; padding:8px; background:#fff8f0; border:1px solid #f5c68a; border-radius:8px; max-height:260px; overflow-y:auto;"></div>
            <div id="inbox-cur-auto-row-${it.uid}" style="display:flex; align-items:center; gap:6px; margin-top:6px; font-size:11px; color:#555;">
                <label style="display:flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
                    <input type="checkbox" id="inbox-auto-${it.uid}" checked onchange="window.inboxRecomputePreview('${it.uid}')" style="cursor:pointer;">
                    ${_ibEn ? '🎯 Auto-position in current project (by start date)' : '🎯 현재 프로젝트 자동위치(시작일 기준)'}
                </label>
                <span id="inbox-preview-${it.uid}" style="color:#1971c2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
            </div>
        </div>`;
    });
    listEl.innerHTML = html;
    filteredItems.forEach(function(it) { window.inboxRecomputePreview(it.uid); }); // 초기 미리보기 계산
};

// 💡 [2026-09-07 신규] "복수 프로젝트 — 공통 이슈" 매칭(_msResolveAiProjectMatch 참고) — AI가 "이 메일은
//    같은 제품군 여러 모델(예: AMUSNET 32/43/55인치)에 다같이 해당될 수 있다"고 폭넓게 후보를 짚어준
//    경우, 카드에 체크박스로 후보를 보여주고 사람이 실제로 해당되는 것만 골라 한 번에 배분한다.
//    실제 배분은 Phase 7의 다중 프로젝트 배분(mailDistributeToProject, 14a-ai-mail-analysis-1.js)과
//    동일한 재배치 큐(gantt_ai_reassign_queue_v1)를 그대로 재사용 — 대상 프로젝트를 열면 똑같이 알림이 뜬다.
window.inboxDistributeToMultiCandidates = function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it || !it.matchedProject || !it.matchedProject.candidates) return;
    const container = document.getElementById('inbox-multi-' + uid);
    if (!container) return;
    const _en = window._currentLang === 'en';
    const checked = Array.from(container.querySelectorAll('input[type=checkbox]:checked'))
        .map(function(cb) { return it.matchedProject.candidates[parseInt(cb.dataset.idx, 10)]; })
        .filter(function(c) { return c && c.drive_file_id; });
    if (!checked.length) {
        alert(_en ? 'Select at least one project to distribute to.' : '배분할 프로젝트를 1개 이상 선택해주세요.');
        return;
    }
    const taskName = (it.task && it.task['업무명']) || (_en ? '(untitled)' : '새 업무');
    // 💡 후보들이 같은 모델명(예: AMUSNET)에 인치만 다른 경우가 흔하므로, 확인창/이력에서도 구별되도록 인치를 함께 표기
    const targetNames = checked.map(function(c) {
        return ([c.model, c.inch ? c.inch + '"' : ''].filter(Boolean).join(' ')) || c.customer || c.file_name || '';
    });
    // 💡 [2026-09-10] 체크박스로 대상 프로젝트를 직접 골라 [배분] 버튼까지 누른 시점에 이미 의사표시가
    //    끝난 것이므로 confirm() 없이 바로 진행 — 결과는 아래 showToast로 안내한다.

    let queue = [];
    try { queue = JSON.parse(localStorage.getItem('gantt_ai_reassign_queue_v1') || '[]'); } catch(e) {}
    checked.forEach(function(c) {
        queue.push({
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            ts: new Date().toISOString(),
            targetProjectId: c.drive_file_id,
            targetProjectName: c.file_name || c.model || c.customer || '',
            taskData: {
                업무명: taskName,
                상세내용: (it.task && it.task['상세내용']) || '',
                시작일: (it.task && it.task['시작일']) || '',
                완료일: (it.task && it.task['완료일']) || '',
                상태: (it.task && it.task['상태']) || '진행',
                개발단계: (it.task && it.task['개발단계']) || '',
                담당구분: (it.task && it.task['담당구분']) || '',
                wbs레벨: (it.task && it.task['wbs레벨'] != null) ? String(it.task['wbs레벨']) : '3',
                _aiMeta: {
                    confidence: '하',
                    matchBasis: '복수 프로젝트 공통 이슈(업무 보관함에서 배분)',
                    keywords: [],
                    snippet: ((it.task && it.task['상세내용']) || '').substring(0, 150)
                }
            },
            status: 'pending'
        });
    });
    try {
        localStorage.setItem('gantt_ai_reassign_queue_v1', JSON.stringify(queue));
    } catch (e) {
        alert((_en ? 'Failed to queue: ' : '배분 큐 저장 실패: ') + e.message);
        return;
    }

    window.TaskInbox.setStatus(uid, '전송됨', {
        type: '복수 배분',
        target: targetNames.join(', '),
        at: new Date().toISOString()
    });
    if (window.showToast) {
        window.showToast(_en
            ? `📤 "${taskName}" → ${checked.length} project(s) queued — a notice will show when each is opened`
            : `📤 "${taskName}" → ${checked.length}개 프로젝트에 배분 완료 — 각 프로젝트를 열면 알림이 표시됩니다`, 'info');
    }
    window.renderTaskInbox();
};

// 💡 [매칭/점수 통일화] Stage1이 단일 프로젝트로 확정한 항목은 "다른 프로젝트" 모달로 전체 목록을
//    다시 뒤질 필요 없이, 이미 알고 있는 drive_file_id로 바로 전송 — _msAutoRegisterToProject(자동틱과 동일 로직) 재사용
window.inboxQuickRegisterMatched = async function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const mp = it.matchedProject;
    if (!mp || mp.status !== 'matched' || !mp.candidates || !mp.candidates[0] || !mp.candidates[0].drive_file_id) {
        alert(window._t('매칭된 프로젝트 정보가 없습니다. [📤 다른 프로젝트]로 직접 선택해주세요.', 'No matched project info. Please select one directly via [📤 Other Project].'));
        return;
    }
    const target = mp.candidates[0];
    window._ibRepairDatesFromMail(it); // ⭐ [2026-09-23] 막기 전에 메일 수신일로 채우는 것부터 시도
    if ((it.task['시작일'] || '').includes('날짜확인필요') || (it.task['완료일'] || '').includes('날짜확인필요')) {
        alert(window._t('⚠️ 시작일/완료일이 미확정(날짜확인필요) 상태입니다.\n메일 분석 화면에서 날짜를 확정한 후 다시 시도해주세요.', '⚠️ Start/end date is unconfirmed ("date needs confirmation"). Please confirm the date in the mail analyzer screen and try again.'));
        return;
    }
    // 💡 [2026-09-10] "✅ 매칭전송" 버튼 클릭 자체가 이미 명시적 의사표시라 확인창은 불필요한 클릭 한 번
    //    더 요구할 뿐 — confirm() 없이 바로 전송하고, 결과는 성공/실패 토스트(아래)로 안내한다.
    const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) { alert(window._t('🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.', '🔒 Please sign in to Google via [🔵 Connect Drive] at the top first.')); return; }

    // ⭐ [2026-09-23] 사람이 방금 누른 단건 전송은 코얼레싱하지 않고 즉시 저장한다(기존 동작 유지)
    const result = await window._msAutoRegisterToProject(uid, it.task, target.drive_file_id, target.file_name, it.mailRaw, 0, !!it.alarmWorthy, { coalesce: false });
    if (result.ok) {
        window.TaskInbox.setStatus(uid, '배치됨', { type: '매칭프로젝트 즉시전송', target: target.file_name, at: new Date().toISOString() });
        window.renderTaskInbox();
        const msg = `✅ "${it.task['업무명'] || '새 업무'}" → ${target.file_name} 전송 완료 (${result.label || ''})`;
        if (window.showToast) window.showToast(msg, 'info'); else alert(msg);
    } else {
        alert(window._t('❌ 전송 실패: ', '❌ Send failed: ') + (result.reason || window._t('알 수 없는 오류', 'Unknown error')));
    }
};

// ⭐ [2026-09-23 신규] '날짜확인필요'로 굳어버린 기존 대기 항목을 메일 수신일로 보수한다.
//    신규 분석 건은 _applyMailDateFallback(js/15a)이 분석 직후에 이미 채워주지만, 그 전에 쌓인
//    항목들은 여전히 '날짜확인필요'라 자동배치·수동전송이 전부 막힌 채 남아 있다.
//    수신일(mailRaw.date)이 없으면 보관함에 담긴 시각(addedAt)을 쓴다 — 둘 다 없을 때만 포기.
//    업무 데이터를 바꾸는 작업이므로 이력(history)에 반드시 남긴다(조용히 바꾸지 않는다).
window._ibRepairDatesFromMail = function(uidOrItem) {
    try {
        const uid = (typeof uidOrItem === 'string') ? uidOrItem : (uidOrItem && uidOrItem.uid);
        if (!uid || !window._applyMailDateFallback) return false;
        const list = window.TaskInbox.load();
        const it = list.find(function(x) { return x.uid === uid; });
        if (!it || !it.task) return false;
        const ymd = window._applyMailDateFallback(it.task, (it.mailRaw && it.mailRaw.date) || it.addedAt, { allowToday: false });
        if (!ymd) return false;
        (it.history = it.history || []).push({
            time: new Date().toLocaleString(), type: '날짜 보정(메일 수신일)', target: ymd
        });
        window.TaskInbox.save(list);
        // 호출부가 이미 들고 있던 사본에도 반영 (load()는 매번 새 객체를 주므로)
        if (typeof uidOrItem === 'object' && uidOrItem && uidOrItem.task) {
            uidOrItem.task['시작일'] = it.task['시작일'];
            uidOrItem.task['완료일'] = it.task['완료일'];
            uidOrItem.task['_dateSource'] = it.task['_dateSource'];
        }
        return true;
    } catch (e) { console.warn('[날짜 보정] 실패(무시):', e.message); return false; }
};

// 💡 대기 중인 항목들의 날짜를 한 번에 보수 — 보관함을 열 때와 유휴 스윕 시작 시 호출한다.
window._ibRepairPendingDates = function() {
    try {
        const list = window.TaskInbox.load();
        let n = 0;
        list.forEach(function(it) {
            if (!it || it.status !== '대기' || !it.task) return;
            const s = String(it.task['시작일'] || ''), e = String(it.task['완료일'] || '');
            if (!s.includes('날짜확인필요') && !e.includes('날짜확인필요') && s && e) return;
            if (!window._applyMailDateFallback) return;
            const ymd = window._applyMailDateFallback(it.task, (it.mailRaw && it.mailRaw.date) || it.addedAt, { allowToday: false });
            if (ymd) {
                (it.history = it.history || []).push({
                    time: new Date().toLocaleString(), type: '날짜 보정(메일 수신일)', target: ymd
                });
                n++;
            }
        });
        if (n) {
            window.TaskInbox.save(list);
            console.info(`[날짜 보정] 대기 항목 ${n}건의 시작일을 메일 수신일로 채웠습니다.`);
        }
        return n;
    } catch (e) { console.warn('[날짜 보정] 일괄 보수 실패(무시):', e.message); return 0; }
};

// ⭐ [2026-09-23 신규] "왜 이 항목이 아직 '대기'인지"를 카드에서 바로 읽히게 하는 한 줄 사유.
//    사용자 제보: 신뢰도가 "상"으로 보이는데 대기라서 이유를 알 수 없었다 — 매칭 신뢰도는
//    자동배치 조건 중 하나일 뿐이고(날짜 확정·후보 수·모드·직전 실패가 각각 따로 걸림),
//    그 조건 중 무엇에 걸렸는지 여태 화면 어디에도 없었다(콘솔에만 찍힘).
// 💡 [하드코딩 지양] 문구는 조건 판정과 1:1로 붙어 있지만, 판정 기준 자체는 전부
//    _ibIsAutoPlaceReady / MAX_AUTO_PLACE_TARGETS / IB_AUTO_RETRY 등 한 곳의 값을 읽어 쓴다.
window._ibPendingReason = function(it) {
    if (!it || it.status !== '대기') return '';
    const en = window._currentLang === 'en';
    const T = function(ko, eng) { return en ? eng : ko; };
    const C = function(conf) { return en ? ({ '상':'High', '중':'Med', '하':'Low' }[conf] || conf || '?') : (conf || '?'); };
    const mp = it.matchedProject;
    if (!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled())) {
        return T('메일 자동배치가 OFF입니다 — 상단 [🟢 메일 완전자동]으로 켜면 자동으로 배치됩니다',
                 'Mail auto-placement is OFF — turn on [🟢 Mail Auto (Gantt)] in the top menu');
    }
    if (!mp || !mp.candidates || !mp.candidates.length) {
        return T('매칭된 프로젝트가 없습니다(미분류) — [➕ 새 Proj 생성]이나 [📤 다른 프로젝트]로 처리하세요',
                 'No matched project (unclassified) — use [➕ New Proj] or [📤 Other project]');
    }
    if (mp.status !== 'matched') {
        const n = mp.multiCount || mp.candidates.length;
        if (mp.ambiguousReason === 'multi_over_cap') {
            return T(`후보 ${n}개 — 자동배치 상한(${window.MAX_AUTO_PLACE_TARGETS}개)을 넘어서 사람이 골라야 합니다`,
                     `${n} candidates — over the auto-place cap (${window.MAX_AUTO_PLACE_TARGETS}), pick manually`);
        }
        if (mp.multi) {
            return T(`후보 ${n}개 — AI가 하나로 좁히지 못했습니다(매칭 신뢰도 ${mp.confidence || '?'})`,
                     `${n} candidates — AI could not narrow it down (match confidence ${C(mp.confidence)})`);
        }
        return T(`매칭 신뢰도가 "${mp.confidence || '?'}" — 확정("상")이 아니라 사람 확인이 필요합니다`,
                 `Match confidence "${C(mp.confidence)}" — not confirmed ("High"), needs review`);
    }
    if (!mp.candidates[0].drive_file_id) {
        return T('매칭된 프로젝트의 Drive 파일 정보가 없습니다 — [📤 다른 프로젝트]로 직접 보내세요',
                 'Matched project has no Drive file id — send it manually with [📤 Other project]');
    }
    const t = it.task || {};
    if (String(t['시작일'] || '').includes('날짜확인필요') || String(t['완료일'] || '').includes('날짜확인필요')) {
        // ⭐ [2026-09-23] 이제 날짜는 메일 수신일로 자동 대체된다 — 그래도 여기 남았다면
        //    메일 수신일도 보관함 등록일도 없는 예외적인 건(수작업 추가 등)이다.
        return T('날짜가 확정되지 않았고 대체할 메일 수신일도 없습니다 — 날짜를 직접 채우면 자동으로 배치됩니다',
                 'Dates are unconfirmed and there is no mail date to fall back on — fill them in and it will be placed automatically');
    }
    const ap = it.autoPlace;
    if (ap && ap.givenUp) {
        return T(`자동배치 ${ap.fails}회 실패(${ap.lastReason}) — 자동 재시도를 멈췄습니다. [✅매칭전송]으로 직접 처리하세요`,
                 `Auto-placement failed ${ap.fails}x (${ap.lastReason}) — retries stopped; use [✅ Send matched]`);
    }
    if (ap && ap.fails) {
        const when = ap.nextAt ? new Date(ap.nextAt).toLocaleTimeString() : '';
        return T(`자동배치 ${ap.fails}회 실패(${ap.lastReason}) — ${when} 이후 자동으로 다시 시도합니다`,
                 `Auto-placement failed ${ap.fails}x (${ap.lastReason}) — will retry after ${when}`);
    }
    return T('자동배치 대기 중 — 다음 자동 점검(최대 10분) 때 처리됩니다',
             'Waiting for auto-placement — will be handled at the next sweep (within 10 min)');
};

// ─── ⭐ [2026-09-23 신규] 자동배치 실패 재시도 + 유휴 시점 자동 스윕 ──────────────────
// 💡 왜 필요한가 (사용자 제보: "신뢰도 상인데 왜 대기지?"):
//    ① 자동배치(완전자동)는 Drive 충돌·토큰 만료·업로드 실패 같은 일시적 이유로 실패할 수 있는데,
//       예전엔 console.warn 한 줄만 남기고 '대기'로 방치돼서 **다시 시도되는 일이 영영 없었다**.
//       사람이 보관함을 열어 [🚀 매칭건 일괄전송]을 누르기 전까지는 영구 대기.
//    ② 완전자동 도입 전에 쌓인 옛 '대기' 항목도 같은 이유로 저절로 넘어가지 않았다.
//    → 실패를 항목에 기록(_ibMarkAutoPlaceFail)하고, 한가한 시점마다 조건을 다시 만족하는
//      '대기' 항목을 훑어 자동으로 재시도한다. 실패가 반복되면 지수 백오프로 간격을 벌리고,
//      상한(maxFails)을 넘으면 자동 재시도를 멈춰 사람 확인 대상으로 남긴다(무한 재시도 금지).
// 💡 [하드코딩 지양] 재시도 정책 수치는 코드 곳곳에 흩지 말고 여기 한 곳(window.IB_AUTO_RETRY)에
//    모아 둔다 — 나중에 설정 UI/원장으로 옮길 때 이 객체만 데이터 소스로 바꾸면 된다.
window.IB_AUTO_RETRY = window.IB_AUTO_RETRY || {
    baseMin:    10,   // 1회 실패 후 최소 대기(분) — 이후 실패마다 2배
    capMin:     360,  // 재시도 간격 상한(분, 6시간)
    maxFails:   6,    // 이 횟수를 넘기면 자동 재시도 중단(사람 확인 대상)
    perSweep:   3,    // ⭐ [2026-09-23] 10→3 — 한 회차가 길어질수록 화면이 멈추는 것처럼 느껴짐
    gapMs:      1200, // ⭐ [2026-09-23] 400→1200 — 건 사이에 UI가 숨 쉰 틈을 준다
    idleGraceSec: 45, // ⭐ [2026-09-23] 마지막 조작 후 이 시간이 지나야 "한가하다"고 본다
    firstDelayMin: 3, // 드라이브 연동 후 첫 스윕까지 대기(분) — 로그인 직후 초기 로드/AI 호출과 안 겹치게
    everyMin:   10    // 이후 스윕 주기(분)
};

// 💡 자동배치 실패를 항목에 기록 — 다음 스윕이 언제 다시 시도할지(nextAt)까지 같이 계산해 둔다.
window._ibMarkAutoPlaceFail = function(uid, reason) {
    try {
        const cfg = window.IB_AUTO_RETRY;
        const list = window.TaskInbox.load();
        const it = list.find(function(x) { return x.uid === uid; });
        if (!it) return;
        const prev = it.autoPlace || {};
        const fails = (prev.fails || 0) + 1;
        const waitMin = Math.min(cfg.capMin, cfg.baseMin * Math.pow(2, fails - 1));
        it.autoPlace = {
            fails: fails,
            lastReason: String(reason || 'unknown').substring(0, 120),
            lastAt: new Date().toISOString(),
            nextAt: new Date(Date.now() + waitMin * 60000).toISOString(),
            givenUp: fails >= cfg.maxFails
        };
        window.TaskInbox.save(list);
        console.warn(`[자동배치 재시도] "${(it.task && it.task['업무명']) || uid}" ${fails}회 실패(${it.autoPlace.lastReason}) — ` +
            (it.autoPlace.givenUp ? '자동 재시도 중단(사람 확인 필요)' : `${waitMin}분 뒤 재시도 예정`));
    } catch (e) { console.warn('[자동배치 재시도] 실패 기록 중 오류(무시):', e.message); }
};

// 💡 지금 자동배치를 (다시) 시도해도 되는 '대기' 항목인지 — 수동 [🚀 매칭건 일괄전송]과 동일한
//    기본 조건(매칭 확정 + drive_file_id + 날짜 확정)에, 재시도 백오프 조건만 추가로 본다.
window._ibIsAutoPlaceReady = function(it, now) {
    if (!it || it.status !== '대기') return false;
    const mp = it.matchedProject;
    if (!mp || mp.status !== 'matched') return false;
    const c = mp.candidates && mp.candidates[0];
    if (!c || !c.drive_file_id) return false;
    const t = it.task || {};
    if (String(t['시작일'] || '').includes('날짜확인필요')) return false;
    if (String(t['완료일'] || '').includes('날짜확인필요')) return false;
    const ap = it.autoPlace;
    if (ap) {
        if (ap.givenUp) return false;
        if (ap.nextAt && new Date(ap.nextAt).getTime() > (now || Date.now())) return false;
    }
    return true;
};

// 💡 유휴 스윕 본체 — 조건을 만족하는 '대기' 항목을 자동배치한다(재시도 + 옛 항목 백필 겸용).
//    본 기능을 절대 방해하지 않도록: 메일 자동틱이 도는 중이면 양보하고, 실패해도 조용히 다음 기회로 넘긴다.
window._ibAutoPlaceSweep = async function(opts) {
    opts = opts || {};
    const cfg = window.IB_AUTO_RETRY;
    if (window._ibSweepRunning) return { skipped: 'sweep_running' };
    if (localStorage.getItem('gantt_autoplace_sweep_off') === '1') return { skipped: 'disabled_by_user' };
    if (!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled())) return { skipped: 'mode_off' };
    if (window._msAutoTickRunning) return { skipped: 'mail_tick_running' }; // AI 분석 중 — 한가할 때 다시
    // ⭐ [2026-09-23] "한가한 시점"을 시간 경과만으로 판단하면 안 된다(사용자 제보: 쓰는 도중에 화면이
    //    통째로 멈춤). 배치 1건이 recalculateSchedules(전체 딥카피 Undo 스냅샷) + 프로젝트 통째 저장을
    //    유발하므로, 사람이 지금 만지고 있는 중이면 아예 시작하지 않고 다음 점검(1분 뒤)으로 미룬다.
    if (!opts.force && !document.hidden && window._ibLastUserActivityAt
        && (Date.now() - window._ibLastUserActivityAt) < cfg.idleGraceSec * 1000) {
        return { skipped: 'user_busy' };
    }
    const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) return { skipped: 'no_token' };

    // ⭐ [2026-09-23] 배치 판정 전에 '날짜확인필요' 항목을 메일 수신일로 먼저 보수한다
    //    — 이것만으로 자동배치가 막혀 무기한 대기하던 건들이 이번 회차에 바로 풀린다.
    window._ibRepairPendingDates();
    const now = Date.now();
    const ready = window.TaskInbox.load().filter(function(it) { return window._ibIsAutoPlaceReady(it, now); });
    if (!ready.length) return { skipped: 'none' };

    // ⭐ [2026-09-23 성능] 지금 열려있는 프로젝트로 갈 건들을 먼저 몰아서(perSweep 안에서) 처리한다 —
    //    이 그룹은 행 삽입만 연달아 하고 재계산·저장은 맨 끝에 한 번만 하므로, N건이 1건 비용으로 끝난다.
    //    (헤드리스 Drive 경로는 파일마다 fetch+PATCH가 필요해 묶을 수 없어 건수 자체를 적게 가져간다.)
    const cur = [], others = [];
    ready.forEach(function(it) {
        const fid = it.matchedProject.candidates[0].drive_file_id;
        (fid === window.currentDriveFileId ? cur : others).push(it);
    });
    const targets = cur.concat(others).slice(0, cfg.perSweep);

    window._ibSweepRunning = true;
    let ok = 0; const fails = []; const deferredUids = [];
    try {
        for (const it of targets) {
            const target = it.matchedProject.candidates[0];
            const isCurrent = target.drive_file_id === window.currentDriveFileId;
            let result;
            try {
                result = await window._msAutoRegisterToProject(it.uid, it.task, target.drive_file_id,
                    target.file_name, it.mailRaw, 0, !!it.alarmWorthy, { deferRefresh: isCurrent });
            } catch (e) { result = { ok: false, reason: e.message }; }
            if (result && result.ok) {
                if (result.deferred) {
                    // 저장이 끝난 뒤에 상태를 확정한다(저장 실패 시 '대기'로 남겨야 하므로)
                    deferredUids.push({ uid: it.uid, name: target.file_name, task: it.task, fileId: target.drive_file_id, raw: it.mailRaw });
                } else {
                    window.TaskInbox.setStatus(it.uid, '자동배치됨', {
                        type: (it.autoPlace ? '자동배치 재시도' : '자동배치 스윕'),
                        target: target.file_name, at: new Date().toISOString()
                    });
                    if (window._tpAppendMailSignal) window._tpAppendMailSignal(target.drive_file_id, it.task, it.mailRaw);
                    ok++;
                }
            } else {
                window._ibMarkAutoPlaceFail(it.uid, result && result.reason);
                fails.push(`${(it.task && it.task['업무명']) || it.uid}: ${(result && result.reason) || 'unknown'}`);
            }
            await new Promise(function(r) { setTimeout(r, cfg.gapMs); });
        }

        // ⭐ 미뤄둔 현재 프로젝트 건들 — 재계산 1회 + 저장 1회로 마무리
        if (deferredUids.length) {
            try {
                window.recalculateSchedules();
                // recalculateSchedules는 내부에서 setTimeout으로 실제 계산을 뒤로 미룬다 — 저장 전에 한 틱
                // 양보해 계산이 끝난 상태를 저장하고, 그 사이에 UI도 한 번 숨을 쉬게 한다.
                await new Promise(function(r) { setTimeout(r, 300); });
                if (window._tpCheckAutoRegen) window._tpCheckAutoRegen();
                const saved = await window.saveToGoogleDrive({ suppressAlert: true });
                if (saved) {
                    deferredUids.forEach(function(d) {
                        window.TaskInbox.setStatus(d.uid, '자동배치됨', {
                            type: '자동배치 스윕(묶음)', target: d.name, at: new Date().toISOString()
                        });
                        if (window._tpAppendMailSignal) window._tpAppendMailSignal(d.fileId, d.task, d.raw);
                        ok++;
                    });
                } else {
                    // 저장이 막힌 경우: 행은 이미 화면(globalData)에 있으므로 다음 저장 때 함께 저장된다.
                    // 상태는 '대기'로 남겨 재시도 대상으로 두되, 중복 삽입은 [출처] 태그 대조로 막힌다.
                    deferredUids.forEach(function(d) {
                        window._ibMarkAutoPlaceFail(d.uid, 'batch_save_blocked: ' + String(window._lastSaveBlockReason || '').slice(0, 60));
                        fails.push(`${(d.task && d.task['업무명']) || d.uid}: batch_save_blocked`);
                    });
                    if (window._saveLocalBackup) window._saveLocalBackup('autoplace-sweep-save-blocked');
                }
            } catch (e) {
                deferredUids.forEach(function(d) { window._ibMarkAutoPlaceFail(d.uid, 'batch_finalize_failed: ' + e.message); });
                fails.push('batch_finalize_failed: ' + e.message);
            }
        }
    } finally {
        window._ibSweepRunning = false;
    }
    if (typeof window.renderTaskInbox === 'function') { try { window.renderTaskInbox(); } catch (e) {} }
    if (ok && window.showToast) {
        window.showToast(window._t(
            `🎯 대기 중이던 업무 ${ok}건을 자동배치했습니다${fails.length ? ` (실패 ${fails.length}건)` : ''}`,
            `🎯 Auto-placed ${ok} pending task(s)${fails.length ? ` (${fails.length} failed)` : ''}`), 'info');
    }
    if (fails.length) console.warn('[자동배치 스윕] 실패 목록:', fails);
    return { ok: ok, failed: fails.length, remaining: Math.max(0, ready.length - targets.length) };
};
// 💡 스케줄러 — "한가한 시점"의 정의(사용자 지시 2026-09-23):
//    드라이브 연동(토큰 확보)이 끝나고 firstDelayMin분이 지난 뒤 첫 스윕, 이후 everyMin분 주기.
//    (로그인 직후엔 프로젝트 로드·토픽 프로파일·메일 자동수집 등 AI/네트워크 작업이 몰려 있어서
//     그 구간을 피한다. 스윕 자체도 메일 자동틱이 도는 중이면 그 회차를 건너뛴다.)
window._ibStartAutoPlaceScheduler = function() {
    if (window._ibSweepTimer) return;
    window._ibSweepTimer = setInterval(function() {
        const cfg = window.IB_AUTO_RETRY;
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { window._ibDriveReadyAt = 0; return; } // 아직 미연동 — 연동되면 그때부터 다시 카운트
        if (!window._ibDriveReadyAt) { window._ibDriveReadyAt = Date.now(); return; }
        const now = Date.now();
        if (now - window._ibDriveReadyAt < cfg.firstDelayMin * 60000) return;
        if (window._ibLastSweepAt && now - window._ibLastSweepAt < cfg.everyMin * 60000) return;
        window._ibLastSweepAt = now;
        window._ibAutoPlaceSweep().then(function(r) {
            // 실행 자체를 건너뛴 회차는 "돌았다"고 치지 않고 다음 점검(1분 뒤)에 바로 다시 보게 한다
            if (r && r.skipped && r.skipped !== 'none') window._ibLastSweepAt = 0;
        });
    }, 60 * 1000);
};
// ⭐ [2026-09-23] "사람이 지금 쓰는 중인지"를 알아야 진짜 유휴 시점에만 돌 수 있다.
//    passive 리스너 2개로 마지막 입력 시각만 기록한다(핸들러는 대입 한 줄 — 비용 없음).
window._ibLastUserActivityAt = Date.now();
['pointerdown', 'keydown'].forEach(function(ev) {
    document.addEventListener(ev, function() { window._ibLastUserActivityAt = Date.now(); }, { passive: true, capture: true });
});
document.addEventListener('DOMContentLoaded', function() { window._ibStartAutoPlaceScheduler(); });

// 💡 [완전자동 백필] 완전자동 기능이 생기기 전부터 쌓여있던 '대기' 항목들은 그때는 자동전송 대상이 아니었으므로
//    새로 분석되는 메일과 달리 저절로 넘어가지 않는다 — 매칭 확정 + 날짜 확정된 기존 대기 항목을 한 번에 훑어서 전송
window.inboxBatchRegisterMatched = async function() {
    const _en = window._currentLang === 'en';
    const targets = window.TaskInbox.load().filter(function(it) {
        return it.status === '대기' && it.matchedProject && it.matchedProject.status === 'matched'
            && it.matchedProject.candidates && it.matchedProject.candidates[0] && it.matchedProject.candidates[0].drive_file_id
            && !String((it.task || {})['시작일'] || '').includes('날짜확인필요')
            && !String((it.task || {})['완료일'] || '').includes('날짜확인필요');
    });
    if (!targets.length) {
        alert(_en
            ? 'Nothing to batch-send.\n(Only "Pending" items with a single confirmed match + confirmed dates qualify — multiple candidates/unmatched/undated items still need manual handling.)'
            : '일괄전송할 항목이 없습니다.\n(매칭이 단일 확정 + 날짜 확정된 "대기" 항목만 대상 — 후보 다수/미매칭/날짜미확정 건은 여전히 직접 처리해야 합니다.)');
        return;
    }
    // 💡 [2026-09-10] "🚀 매칭건 일괄전송" 버튼 클릭 자체가 이미 명시적 의사표시라 confirm() 제거 —
    //    결과는 아래 showToast(실패 있으면 console.warn 상세 로그 병행)로만 안내한다.
    const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) { alert(_en ? '🔒 Please connect Google Drive first from the top menu.' : '🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return; }

    let okCount = 0; const fails = [];
    for (const it of targets) {
        const target = it.matchedProject.candidates[0];
        try {
            const result = await window._msAutoRegisterToProject(it.uid, it.task, target.drive_file_id, target.file_name, it.mailRaw, 0, !!it.alarmWorthy);
            if (result.ok) {
                // 💡 [버그 수정 2026-09-06] 이 함수는 사람이 "🚀 매칭건 일괄전송" 버튼을 눌러서(2026-09-10부터
                //    confirm() 없이 즉시) 실행하는 수동 액션인데 '자동배치됨'으로 기록되고 있었음 — 진짜 자동
                //    (사람 개입 0, 완전자동 메일모드의 커트라인 배치)과 구분이 안 돼서 "몇 건이 진짜 자동으로
                //    처리됐는지" 집계가 부정확해짐. 단건 버전(inboxQuickRegisterMatched)과 성격이 같으므로 '배치됨'으로 통일.
                window.TaskInbox.setStatus(it.uid, '배치됨', { type: '일괄전송', target: target.file_name, at: new Date().toISOString() });
                okCount++;
            } else {
                fails.push(`${it.task['업무명'] || (_en ? '(untitled)' : '(제목없음)')}: ${result.reason || (_en ? 'unknown' : '알수없음')}`);
            }
        } catch (e) {
            fails.push(`${it.task['업무명'] || (_en ? '(untitled)' : '(제목없음)')}: ${e.message}`);
        }
    }
    // ⭐ [2026-09-23 성능] 위 루프에서 현재 프로젝트 건들은 재계산·저장이 코얼레싱돼 미뤄져 있다 —
    //    사람이 결과 토스트를 보고 바로 창을 닫을 수 있으므로 여기서 한 번에 마무리해 넣는다.
    if (window._msFlushCurrentProjectFinalize) { try { await window._msFlushCurrentProjectFinalize(); } catch (e) {} }
    window.renderTaskInbox();
    // 💡 [2026-09-10] confirm() 없이 바로 실행하는 흐름과 짝을 맞춰, 결과도 alert(막힘) 대신 toast(안 막힘)로
    //    안내 — 실패 상세 목록은 toast에 다 담기 어려우니 console.warn으로 남기고 toast엔 건수만 표기.
    let msg = _en ? `✅ ${okCount} sent` : `✅ ${okCount}건 전송 완료`;
    if (fails.length) {
        msg += _en ? `, ❌ ${fails.length} failed (see console for details)` : `, ❌ ${fails.length}건 실패 (상세는 콘솔 참고)`;
        console.warn('[업무 보관함] 일괄전송 실패 목록:', fails);
    }
    if (window.showToast) window.showToast(msg, fails.length ? 'error' : 'info'); else alert(msg);
};

window.showMailRawModal = function(r) {
    if (!r) return;
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('inbox-mailraw-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'inbox-mailraw-modal';
        // 💡 [2026-09-07] 다른 모달들과 달리 이 모달은 배경 클릭으로도 닫히길 원한다는 요청 —
        //    그러려면 오버레이 자체가 클릭을 받아야 하므로 pointer-events:none(배경 클릭이 뒤로
        //    그냥 통과되던 기존 패턴)이 아니라 auto로 바꾸고, 오버레이에 직접 onclick(닫기)을 단다.
        //    안쪽 박스(inbox-mailraw-box)는 그대로 stopPropagation을 유지해 내부 클릭으론 안 닫힘.
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:auto; background:none;';
        modal.onclick = function() { modal.style.display = 'none'; };
        modal.innerHTML = `
        <div id="inbox-mailraw-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:400px;">
            <div id="inbox-mailraw-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span id="inbox-mailraw-title">📧 메일 원문</span>
                <button onclick="document.getElementById('inbox-mailraw-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="inbox-mailraw-meta" style="padding:8px 16px; font-size:11.5px; color:#555; background:#fafafa; border-bottom:1px solid #eee;"></div>
            <div id="inbox-mailraw-attachments" style="display:none; padding:6px 14px 6px; background:#f0f5ff; border-bottom:1px solid #d8e6ff; font-size:11.5px;"></div>
            <!-- 💡 [2026-08-24] wrap="off" + white-space:pre 조합이 줄바꿈을 강제로 막아서, 모달을 아무리 넓게
                 늘려도 긴 줄은 늘 원래 길이 그대로 남아 좌우 스크롤이 필요했다. white-space:pre-wrap으로
                 바꿔서 원문의 줄바꿈(엔터)은 그대로 보존하되, 한 줄이 너무 길면 모달 폭에 맞춰 자동으로
                 접히도록(wrap) 한다 — wrap="off" 속성도 제거(기본값 soft로 줄바꿈 허용). -->
            <textarea id="inbox-mailraw-body" readonly style="flex:1; margin:12px; font-size:12px; font-family:Consolas,'D2Coding','Courier New',monospace,'Malgun Gothic'; white-space:pre-wrap; word-break:break-word; tab-size:4; border:1px solid #ced4da; border-radius:6px; padding:10px; resize:none; overflow:auto; line-height:1.5; background:#f8f9fa; color:#333;"></textarea>
            <div id="inbox-mailraw-translated" style="display:none; flex:1; margin:12px; font-size:12px; border:1px solid #ced4da; border-radius:6px; padding:10px; overflow:auto; line-height:1.5; background:#f8f9fa;"></div>
            <div style="padding:10px 16px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee;">
                <button id="inbox-mailraw-translate-btn" onclick="window._toggleMailRawTranslation()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="${_en ? 'AI translates each paragraph that is not Korean and shows the Korean translation right below it' : '한국어가 아닌 문단마다 AI가 번역한 한글을 바로 아래에 붙여서 보여줍니다'}" style="padding:7px 14px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🌐 ${_en ? 'Show Translation' : '번역 보기'}</button>
                <button onclick="document.getElementById('inbox-mailraw-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="padding:7px 18px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:12px; cursor:pointer; transition:background .15s, border-color .15s;">✖ ${_en ? 'Close' : '닫기'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('inbox-mailraw-box', 'inbox-mailraw-drag');
        window._bindClickToFront('inbox-mailraw-modal');
    }
    const _en2 = window._currentLang === 'en';
    document.getElementById('inbox-mailraw-title').textContent = '📧 ' + (_en2 ? 'Mail Source' : '메일 원문');
    // 💡 [2026-09-12 신규] 발신자만 있고 수신자(To/Cc)는 아예 안 보이던 문제 — mailRaw에 to/cc가
    //    이제 같이 보존되니(위 mailRaw 구성부 참고) 있으면 같이 보여준다. 옛 기록 등 to/cc가 없는
    //    항목은 "수신: -"로 채우지 않고 그 구간 자체를 생략(예전과 동일하게 보이게).
    const _toCcParts = [];
    if (r.to) _toCcParts.push(`<b>${_en2 ? 'To' : '수신'}</b>: ${escapeHtml(r.to)}`);
    if (r.cc) _toCcParts.push(`<b>${_en2 ? 'Cc' : '참조'}</b>: ${escapeHtml(r.cc)}`);
    const _toCcHtml = _toCcParts.length ? ('&nbsp;&nbsp;|&nbsp;&nbsp;' + _toCcParts.join('&nbsp;&nbsp;|&nbsp;&nbsp;')) : '';
    document.getElementById('inbox-mailraw-meta').innerHTML =
        `<b>${_en2 ? 'Subject' : '제목'}</b>: ${escapeHtml(r.subject || '-')}&nbsp;&nbsp;|&nbsp;&nbsp;<b>${_en2 ? 'Sender' : '발신'}</b>: ${escapeHtml(r.sender || '-')}&nbsp;&nbsp;|&nbsp;&nbsp;<b>${_en2 ? 'Date' : '날짜'}</b>: ${escapeHtml(r.date || '-')}${_toCcHtml}`;
    // 💡 [2026-09-09 신규] 첨부파일 목록 표시 — 실제 파일 내용은 가져오지 않고 메타데이터만 pill로 렌더링
    (function() {
        var attDiv = document.getElementById('inbox-mailraw-attachments');
        var atts = r.attachments;
        if (!atts || !atts.length) { attDiv.style.display = 'none'; attDiv.innerHTML = ''; return; }
        function fmtSize(bytes) {
            if (!bytes || bytes <= 0) return '';
            if (bytes >= 1048576) return ' (' + (bytes / 1048576).toFixed(1) + ' MB)';
            if (bytes >= 1024)    return ' (' + Math.round(bytes / 1024) + ' KB)';
            return ' (' + bytes + ' B)';
        }
        var pills = atts.map(function(a) {
            return '<span style="display:inline-flex;align-items:center;gap:3px;background:#e0ecff;border:1px solid #b8d0f8;border-radius:12px;padding:2px 9px;margin:2px 3px 2px 0;font-size:11px;color:#1c4fa0;white-space:nowrap;">'
                + '📎 ' + escapeHtml(a.name || '(이름 없음)') + '<span style="color:#5585cc;">' + fmtSize(a.size) + '</span>'
                + '</span>';
        }).join('');
        var label = _en2 ? 'Attachments' : '첨부파일';
        attDiv.innerHTML = '<span style="font-weight:bold;color:#1c4fa0;margin-right:6px;">📎 ' + label + ' ' + atts.length + '개</span>' + pills;
        attDiv.style.display = 'block';
    })();
    document.getElementById('inbox-mailraw-body').value = r.body2000 || '';
    // 💡 [2026-09-12 신규] 다른 메일로 다시 열렸을 수 있으니, 번역 보기 상태로 남아있지 않도록
    // 항상 "원문 보기"로 초기화(캐시는 그대로 둬서 같은 메일을 또 열면 재호출 없이 바로 보여줌).
    const _trTextarea = document.getElementById('inbox-mailraw-body');
    const _trDiv = document.getElementById('inbox-mailraw-translated');
    const _trBtn = document.getElementById('inbox-mailraw-translate-btn');
    if (_trDiv) _trDiv.style.display = 'none';
    if (_trTextarea) _trTextarea.style.display = '';
    if (_trBtn) _trBtn.textContent = '🌐 ' + (_en2 ? 'Show Translation' : '번역 보기');
    modal.style.display = 'block';
    window.bringModalToFront('inbox-mailraw-modal');
};

// 💡 [2026-09-12 신규] "메일 원문이 영문인 경우 문단마다 한글 번역을 달아달라"는 요청 — 원문
// textarea는 그대로 두고(복사/선택 편의 보존), 번역 결과는 별도 div에 문단별로 원문+번역을
// 나란히 렌더링해서 버튼으로 토글한다. 어떤 문단이 번역이 필요한지(한국어가 아닌지) 판단하는
// 것도 AI에게 같이 맡긴다(정규식 언어감지보다 실제 메일의 혼합언어 상황에 더 안정적).
window._mailRawTranslatedCache = null; // { body, html } — 같은 원문 재조회 시 AI 재호출 방지
window._toggleMailRawTranslation = async function() {
    const btn = document.getElementById('inbox-mailraw-translate-btn');
    const textarea = document.getElementById('inbox-mailraw-body');
    const transDiv = document.getElementById('inbox-mailraw-translated');
    const _en = window._currentLang === 'en';
    if (!btn || !textarea || !transDiv) return;

    // 이미 번역 보기 상태면 → 원문 보기로 되돌리기(토글)
    if (transDiv.style.display !== 'none') {
        transDiv.style.display = 'none';
        textarea.style.display = '';
        btn.textContent = '🌐 ' + (_en ? 'Show Translation' : '번역 보기');
        return;
    }

    const body = textarea.value || '';
    if (!body.trim()) return;

    // 같은 원문을 다시 보는 경우 AI 재호출 없이 캐시 재사용
    if (window._mailRawTranslatedCache && window._mailRawTranslatedCache.body === body) {
        transDiv.innerHTML = window._mailRawTranslatedCache.html;
        textarea.style.display = 'none';
        transDiv.style.display = 'block';
        btn.textContent = '🌐 ' + (_en ? 'Show Original' : '원문 보기');
        return;
    }

    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) {
        alert(window._t('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.', 'Please enter and save your AI API key in [🤖 AI Tools → ⚙️ Settings → AI Analysis Settings] first.'));
        return;
    }

    // 빈 줄 기준으로 문단 분리 — 빈 줄이 아예 없는(한 덩어리) 원문이면 줄 단위로 대신 분리
    // (이 앱의 메일 본문은 흔히 [태그]/줄바꿈으로만 구분돼 있고 빈 줄이 없는 경우가 많음).
    const blocksByBlank = body.split(/\n\s*\n/).map(function(s) { return s.trim(); }).filter(Boolean);
    const blocks = blocksByBlank.length > 1 ? blocksByBlank : body.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    if (!blocks.length) return;

    const origBtnHtml = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ ' + (_en ? 'Translating...' : '번역 중...');

    try {
        // 💡 [2026-09-16 속도개선] 이 앱의 메일은 대부분 헤더/서명/한글 문단이 다수라, 라틴·중국어·
        // 일본어 문자가 전혀 없는(=한국어이거나 숫자·기호뿐인) 블록은 애초에 번역할 이유가 없다.
        // 예전엔 이런 블록까지 전부 AI에 보내 "번역 불필요"라고 판단만 시켰는데, 그 판단 자체가
        // AI 호출 왕복(청크 수)을 늘려 전체 번역 속도를 늦추고 있었다 — 사용자가 "문단마다 번역해서
        // 느린가"라고 물어본 게 정확히 이 부분(청크 수가 불필요하게 많다는 것)을 가리켰다. 정규식
        // 하나로 이런 블록을 미리 걸러 AI 호출 대상에서 아예 제외하면, 실제 외국어가 섞인 블록만
        // 남아 청크 수(=왕복 횟수)가 크게 줄어든다 — 정확도 손실 없음(한국어만 있는 블록은 원래도
        // AI가 "번역 안 함"으로 판정하던 것과 결과가 같고, 그 판정을 로컬에서 대신 내리는 것뿐).
        const FOREIGN_LETTER_RE = /[A-Za-zÀ-ɏ぀-ヿ一-鿿]/;
        const blocksToTranslate = [];
        blocks.forEach(function(b, i) {
            if (FOREIGN_LETTER_RE.test(b)) blocksToTranslate.push({ idx: i, block: b });
        });

        // 💡 [2026-09-14 버그수정] 원문이 길고(빈 줄이 없어 줄 단위로 잘게 쪼개짐) 블록 수가 많으면,
        // 한 번의 요청에 모든 블록의 JSON을 다 담아 응답하라고 시키는 게 모델의 출력 토큰 한도를
        // 넘겨 응답이 중간에 잘리는 경우가 있었다 — 그러면 배열이 "]"로 안 닫힌 채 끊겨서 아래 정규식이
        // 아예 매치를 못 찾고 "AI 응답에서 JSON을 찾을 수 없습니다" 로 실패했다(제보 사례).
        // 청크(묶음) 단위로 나눠 병렬 호출하면 요청당 응답 크기가 줄어 잘릴 위험이 크게 낮아지고,
        // 일부 청크만 실패해도 나머지는 정상 표시되도록(부분 성공) 완화했다.
        const CHUNK_SIZE = 25;
        const chunks = [];
        for (let start = 0; start < blocksToTranslate.length; start += CHUNK_SIZE) {
            chunks.push(blocksToTranslate.slice(start, start + CHUNK_SIZE));
        }

        const extractAiText = function(result) {
            return (result.data.result && result.data.result.candidates && result.data.result.candidates[0]
                && result.data.result.candidates[0].content && result.data.result.candidates[0].content.parts
                && result.data.result.candidates[0].content.parts[0] && result.data.result.candidates[0].content.parts[0].text) || '';
        };

        let firstFailure = null;
        const chunkResults = chunks.length ? await Promise.all(chunks.map(async function(chunk) {
            const blockListText = chunk.map(function(c) { return c.idx + ': ' + c.block; }).join('\n');
            // 💡 [2026-09-16 속도개선] 번역이 필요 없는 블록까지 매번 {"translate":false,"ko":""}로
            // 응답에 채우게 하면 출력 토큰이 그만큼 늘어 응답이 느려지고 잘릴 위험도 커진다 — 이제
            // 블록 자체를 위에서 미리 걸렀으므로(외국어 문자가 있는 것만 이 프롬프트에 옴) 대부분
            // 번역이 필요하지만, 그래도 AI가 "짧은 코드/암호 같은 문자열이라 번역 무의미"로 판단할
            // 수 있는 경우를 위해 필요 없는 항목은 아예 배열에서 빼라고 지시해 출력을 더 줄인다.
            const prompt = '당신은 번역 보조 AI입니다. 아래는 이메일 원문을 줄/문단 단위 블록으로 나눈 것입니다(외국어 문자가 포함된 블록만 추려서 보냈습니다).\n'
                + '각 블록이 영어 등 한국어가 아닌 언어로 되어 있으면 자연스러운 한국어로 번역하세요. 이미 한국어이거나 단순 코드·기호·매우 짧은 헤더 등 번역할 의미가 없는 블록은 아예 응답 배열에서 제외하세요.\n\n'
                + '[블록 목록]\n' + blockListText + '\n\n'
                + '다음 JSON 배열 형식으로만 답하세요 (번역이 필요한 블록만 담고, 필요 없는 블록은 배열에서 제외 — idx는 원본 그대로 유지, 마크다운 코드블록(```)이나 설명 문장 없이 JSON 배열 하나만 출력):\n'
                + '[{"idx": ' + chunk[0].idx + ', "ko": "번역문"}, ...]';
            try {
                const result = await window.callAiBackend(apiKey, prompt, {});
                if (!result.ok) throw result.error || new Error(window._t('번역 실패', 'Translation failed'));
                const text = extractAiText(result);
                const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
                const match = cleaned.match(/\[[\s\S]*\]/);
                if (!match) throw new Error(window._t('AI 응답에서 JSON을 찾을 수 없습니다.', 'Could not find JSON in the AI response.') + (text ? ' — ' + window._t('AI 원문 응답', 'raw AI response') + ': ' + text.slice(0, 300) : ' (' + window._t('빈 응답', 'empty response') + ')'));
                return JSON.parse(match[0]);
            } catch (e) {
                // 💡 청크 하나가 실패해도 전체를 막지 않고, 원인 진단용으로 콘솔에는 남긴다.
                console.error('[메일 원문 번역] 블록 ' + chunk[0].idx + '~' + chunk[chunk.length - 1].idx + ' 청크 번역 실패:', e);
                if (!firstFailure) firstFailure = e;
                return null;
            }
        })) : [];

        const parsed = [];
        let anySucceeded = false;
        chunkResults.forEach(function(r) { if (r) { anySucceeded = true; parsed.push.apply(parsed, r); } });
        // 💡 [2026-09-16] 위에서 외국어 문자가 있는 블록만 걸러 보냈으므로, 애초에 그런 블록이
        // 하나도 없었으면(blocksToTranslate가 비어 chunks 자체가 없었으면) chunkResults도 비고
        // anySucceeded는 항상 false다 — 이건 "번역이 실패한 것"이 아니라 "번역할 게 없는 것"이므로
        // 청크가 하나라도 있었을 때만 실패로 취급한다(안 그러면 순수 한글 메일마다 매번 에러가 남).
        if (chunks.length && !anySucceeded) throw firstFailure || new Error(window._t('번역 실패', 'Translation failed'));

        const html = blocks.map(function(b, i) {
            const entry = parsed.find(function(p) { return p.idx === i; });
            const escaped = escapeHtml(b).replace(/\n/g, '<br>');
            if (entry && entry.ko && String(entry.ko).trim()) {
                return '<div style="margin-bottom:10px;">'
                    + '<div style="color:#333; white-space:pre-wrap;">' + escaped + '</div>'
                    + '<div style="color:#1971c2; background:#eef6ff; border-left:3px solid #a5c8f0; padding:4px 8px; margin-top:3px; border-radius:0 4px 4px 0; white-space:pre-wrap;">🇰🇷 ' + escapeHtml(String(entry.ko).trim()) + '</div>'
                    + '</div>';
            }
            return '<div style="margin-bottom:10px; color:#333; white-space:pre-wrap;">' + escaped + '</div>';
        }).join('');

        window._mailRawTranslatedCache = { body: body, html: html };
        transDiv.innerHTML = html;
        textarea.style.display = 'none';
        transDiv.style.display = 'block';
        btn.textContent = '🌐 ' + (_en ? 'Show Original' : '원문 보기');
        if (firstFailure && anySucceeded && window.showToast) {
            window.showToast(window._t('⚠️ 일부 구간은 번역하지 못했습니다(원문 그대로 표시).', '⚠️ Some sections could not be translated (shown as original text).'));
        }
    } catch (e) {
        console.error('[메일 원문 번역] 전체 실패:', e);
        alert(window._t('⚠️ 번역 실패: ', '⚠️ Translation failed: ') + (e && e.message ? e.message : e));
        btn.textContent = origBtnHtml;
    } finally {
        btn.disabled = false;
    }
};

window.showInboxMailRaw = function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it || !it.mailRaw) return;
    window.showMailRawModal(it.mailRaw);
};

// 💡 [추출] 업무 보관함 카드의 "메일 원문 + AI 분석 결과"를 한 텍스트로 정리.
//    클립보드 복사(다른 곳에 붙여넣기용)와, 앱 안에서 바로 AI에게 "왜 이렇게 분석했는지" 물어보는
//    미니 채팅 모달 양쪽에서 공용으로 쓰는 컨텍스트 빌더 — 내용이 어긋나지 않도록 한 곳에서만 만든다.
window._ibBuildAnalysisContext = function(it) {
    const t = it.task || {};
    const _en = window._currentLang === 'en';
    const lines = [];
    lines.push(_en ? '[Analysis result]' : '[분석 결과]');
    lines.push((_en ? 'Task name: ' : '업무명: ') + (t['업무명'] || ''));
    lines.push((_en ? 'Detail: ' : '상세내용: ') + (t['상세내용'] || ''));
    lines.push((_en ? 'Start: ' : '시작일: ') + (t['시작일'] || '?') + (_en ? ' ~ End: ' : ' ~ 완료일: ') + (t['완료일'] || '?'));
    lines.push((_en ? 'Status: ' : '상태: ') + (t['상태'] || ''));
    lines.push((_en ? 'Dev stage(L0): ' : '개발단계(L0): ') + (t['개발단계'] || ''));
    lines.push((_en ? 'Assignee category: ' : '담당구분: ') + (t['담당구분'] || ''));
    lines.push('WBS' + (_en ? ' level: L' : '레벨: L') + (t['wbs레벨'] !== undefined ? t['wbs레벨'] : 4));
    // 💡 [2026-08-28 버그 수정] 여기 담당자(assignee)를 후보 옆에 괄호로 보여주고 있었는데, 실제 매칭
    //    프롬프트(window.getSystemPrompt 뒤에 붙는 "프로젝트 매칭 판단 요청" 섹션)는 model/inch/customer/
    //    keywords만 AI에게 보여주고 assignee는 애초에 넘기지도 않는다 — 그런데도 여기 담당자 이름이
    //    같이 보이니, 이 "왜 매칭됐어?" 미니 채팅 AI가 실제 근거 대신 담당자 이름을 근거로 지어내
    //    답하는 사고(오탐 설명)로 이어졌다. 실제 매칭에 쓰인 근거(keywords)로 바꾸고, 담당자는 매칭과
    //    무관하다는 점을 명시해서 AI가 엉뚱한 근거를 만들어내지 못하게 막는다.
    if (it.matchedProject) {
        const _stLabel = it.matchedProject.status === 'matched'
            ? (_en ? 'Auto-confirmed (AI confidence: high/"상")' : '자동 확정 (AI 신뢰도: 상)')
            : (it.matchedProject.status || '');
        lines.push((_en ? 'Matched project status: ' : '매칭 프로젝트 상태: ') + _stLabel);
        if (it.matchedProject.candidates && it.matchedProject.candidates.length) {
            lines.push(_en
                ? 'Matched candidates (ACTUAL matching evidence — only model name/inch/customer/registered keywords are used for matching. Assignee/owner name is NEVER used for matching, even if shown elsewhere — do not cite it as a reason.):'
                : '매칭 후보(실제 매칭에 쓰인 근거 — 모델명/인치/고객사/등록 키워드만 매칭에 사용됨. 담당자 이름은 다른 곳에 보이더라도 매칭 근거로 절대 쓰이지 않으니 이유로 들지 말 것):');
            it.matchedProject.candidates.forEach(function(c) {
                const kw = (c.keywords && c.keywords.length)
                    ? c.keywords.slice(0, 8).join(', ')
                    : (_en ? '(no keywords registered)' : '(등록된 키워드 없음)');
                lines.push('  - ' + (c.file_name || c.model || c.customer || '')
                    + (c.inch ? ` (${c.inch}${_en ? '"' : '인치'})` : '')
                    + (_en ? ' | registered keywords: ' : ' | 등록 키워드: ') + kw);
            });
        }
    }
    lines.push('');
    if (it.mailRaw) {
        lines.push(_en ? '[Original mail]' : '[메일 원문]');
        lines.push((_en ? 'Subject: ' : '제목: ') + (it.mailRaw.subject || ''));
        lines.push((_en ? 'Sender: ' : '발신: ') + (it.mailRaw.sender || ''));
        lines.push((_en ? 'Date: ' : '날짜: ') + (it.mailRaw.date || ''));
        lines.push('');
        lines.push(it.mailRaw.body2000 || '');
    } else {
        lines.push(_en ? '[No mail source attached to this task]' : '[이 업무에는 메일 원문이 없습니다]');
    }
    return lines.join('\n');
};

// 💡 클릭 한 번으로 ① 클립보드 복사(다른 AI 채팅창에 붙여넣고 싶을 때 대비)와
//    ② 앱 안에서 바로 AI에게 "왜 이렇게 분석됐는지" 물어보는 미니 채팅 모달을 동시에 띄운다.
window.extractInboxForAI = async function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const _en = window._currentLang === 'en';
    const context = window._ibBuildAnalysisContext(it);
    const closingQuestion = _en
        ? 'Does the analysis result above correctly match the mail content? If it is a mismatch, please point out exactly which part is wrong.'
        : '위 분석 결과가 메일 원문 내용과 잘 맞게 추출된 것인지 확인해줘. 오매칭이라면 어느 부분이 왜 잘못됐는지 짚어줘.';

    // ① 클립보드 복사는 되든 안 되든(권한 문제 등) 채팅 모달 진행을 막지 않음 — 실패해도 조용히 넘어감
    try {
        await navigator.clipboard.writeText(
            (_en ? '===== Please review this AI mail-analysis result for mismatches =====' : '===== AI 메일 업무분석 결과 오매칭 검토 요청 =====')
            + '\n\n' + context + '\n\n' + closingQuestion
        );
        if (window.showToast) window.showToast(_en ? '📋 Copied to clipboard as well.' : '📋 클립보드에도 복사해뒀습니다.', 'info');
    } catch (e) { /* 클립보드 실패는 무시 — 아래 채팅 모달이 주 경로 */ }

    // ② 앱 내 AI 채팅 모달을 열고, 오매칭 여부를 묻는 첫 질문을 바로 전송
    if (!(window.getActiveAiKey && window.getActiveAiKey())) {
        alert(_en ? '⚠️ No AI API key configured. Set one in Settings first (mail analysis screen).' : '⚠️ AI API 키가 설정되어 있지 않습니다. 메일 분석 화면 상단 설정에서 먼저 키를 등록해주세요.');
        return;
    }
    window._ibAiChatState = window._ibAiChatState || {};
    window._ibAiChatState[uid] = { context: context, messages: [] };
    window._ibOpenAiChatModal(uid);
    window._ibSendAiChatTurn(uid, closingQuestion);
};

// ─── 업무 보관함 "📋 추출" → AI 미니 채팅 모달 ──────────────────────────────
window._ibOpenAiChatModal = function(uid) {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('inbox-ai-chat-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'inbox-ai-chat-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9110; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="inbox-ai-chat-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:440px;">
            <!-- 💡 [2026-08-30 모달 헤더 정리] 이 모달의 원래 색(#e0f5f7 등)이 하필 스와핑 테마 역할값과
                 똑같아서, 팔레트로 다른 색을 고르면 이 AI 모달만 의도치 않게 같이 바뀌고 있었음 —
                 AI 계열 모달은 전부 하늘색(#e7f3ff)으로 통일하는 게 맞아서 옮기는 김에 그 부작용도 해결됨. -->
            <div id="inbox-ai-chat-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span>🤖 <span id="inbox-ai-chat-title">${_en ? 'Ask about AI matching basis' : 'AI 분석 근거 문의'}</span></span>
                <button onclick="document.getElementById('inbox-ai-chat-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="inbox-ai-chat-log" style="flex:1; overflow-y:auto; padding:12px 14px; background:#fafafa;"></div>
            <div style="padding:10px; border-top:1px solid #eee; display:flex; gap:6px; align-items:stretch;">
                <textarea id="inbox-ai-chat-input" placeholder="${_en ? 'Ask a follow-up (Enter to send, Shift+Enter for newline)' : '추가로 물어볼 내용을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)'}" style="flex:1; resize:none; height:65px; font-size:12px; padding:6px 8px; border:1px solid #ced4da; border-radius:6px; font-family:inherit;" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); window._ibSubmitAiChatInput(this); }"></textarea>
                <button onclick="window._ibSubmitAiChatInput(document.getElementById('inbox-ai-chat-input'))" onmouseover="this.style.background='#dcd0f5'; this.style.borderColor='#a98ce0';" onmouseout="this.style.background='#ede9fb'; this.style.borderColor='#c9b8f0';" style="flex-shrink:0; padding:8px 14px; background:#ede9fb; color:#6741d9; border:1px solid #c9b8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? 'Send' : '전송'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('inbox-ai-chat-box', 'inbox-ai-chat-drag');
        window._bindClickToFront('inbox-ai-chat-modal');
    }
    modal.dataset.uid = uid;
    window._ibRenderAiChatLog(uid);
    modal.style.display = 'block';
    window.bringModalToFront('inbox-ai-chat-modal');
};

window._ibRenderAiChatLog = function(uid) {
    const state = window._ibAiChatState && window._ibAiChatState[uid];
    const log = document.getElementById('inbox-ai-chat-log');
    if (!state || !log) return;
    const wasAtBottom = (log.scrollTop + log.clientHeight) >= (log.scrollHeight - 20);
    log.innerHTML = state.messages.map(function(m) {
        const isUser = m.role === 'user';
        return `<div style="display:flex; justify-content:${isUser ? 'flex-end' : 'flex-start'}; margin-bottom:8px;">
            <div style="max-width:85%; padding:8px 12px; border-radius:10px; white-space:pre-wrap; font-size:12.5px; line-height:1.6; ${isUser ? 'background:#ede9fb; border:1px solid #c9b8f0; color:#6741d9;' : 'background:#fff; border:1px solid #e0e0e0; color:#333;'}">${escapeHtml(m.text)}</div>
        </div>`;
    }).join('') + (state.loading ? '<div style="color:#888; font-size:12px; padding:4px 0;">🤖 ' + (window._currentLang === 'en' ? 'Thinking…' : '생각 중...') + '</div>' : '');
    if (wasAtBottom || state.loading) log.scrollTop = log.scrollHeight;
};

window._ibSetAiChatLoading = function(uid, loading) {
    const state = window._ibAiChatState && window._ibAiChatState[uid];
    if (state) state.loading = loading;
    const modal = document.getElementById('inbox-ai-chat-modal');
    const btn = modal ? modal.querySelector('button[onclick*="_ibSubmitAiChatInput"]') : null;
    const input = document.getElementById('inbox-ai-chat-input');
    if (btn) btn.disabled = loading;
    if (input) input.disabled = loading;
    window._ibRenderAiChatLog(uid);
};

window._ibSendAiChatTurn = async function(uid, userText) {
    const state = window._ibAiChatState && window._ibAiChatState[uid];
    if (!state) return;
    const _en = window._currentLang === 'en';
    state.messages.push({ role: 'user', text: userText });
    window._ibRenderAiChatLog(uid);
    window._ibSetAiChatLoading(uid, true);

    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) {
        state.messages.push({ role: 'ai', text: _en ? '⚠️ No AI API key configured.' : '⚠️ AI API 키가 설정되어 있지 않습니다.' });
        window._ibSetAiChatLoading(uid, false);
        return;
    }
    const transcript = state.messages.map(function(m) {
        return (m.role === 'user' ? (_en ? '[User question] ' : '[사용자 질문] ') : (_en ? '[AI answer] ' : '[AI 답변] ')) + m.text;
    }).join('\n\n');
    const prompt = state.context + '\n\n' + transcript + '\n\n' + (_en
        ? 'Based on the context above, answer the last [User question] in plain natural-language text (no JSON), citing concrete evidence from the mail/analysis result.'
        : '위 맥락을 참고해서 마지막 [사용자 질문]에 대해, 메일 원문/분석 결과의 구체적인 근거를 들어 자연스러운 설명 텍스트로만(JSON 금지) 답변해줘.');

    let result;
    try {
        result = await window.callAiBackend(apiKey, prompt);
    } catch (e) {
        result = { ok: false, error: e };
    }
    if (!result.ok) {
        state.messages.push({ role: 'ai', text: (_en ? '⚠️ AI call failed: ' : '⚠️ AI 호출 실패: ') + (result.error && result.error.message || (_en ? 'Unknown error' : '알 수 없는 오류')) });
    } else {
        const text = result.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || (_en ? '(empty response)' : '(응답 없음)');
        state.messages.push({ role: 'ai', text: text.trim() });
        window._ibSaveRationaleAsLearning(uid, text.trim()); // 💡 [2026-09-06] 아래 참고 — 대화가 버려지지 않도록 학습 기록
    }
    window._ibSetAiChatLoading(uid, false);
};

// 💡 [2026-09-06 신규] "AI 분석 근거 문의" 대화가 그동안 단순 1회성 채팅으로 끝나고 아무 데도
//    반영되지 않았다는 지적 — 사람이 메일 원문까지 같이 보면서 "이 매칭이 맞는지" 검토한 결과물이라
//    실제 매칭보다 신뢰도가 높은 데이터인데 화면을 닫으면 그냥 사라졌음. 매 턴마다 ①AI 학습 로그
//    (gantt_ai_learning_v1, 오매칭 신고와 같은 저장소 — 나중에 오염 진단·재검토 시 참고 가능)에
//    기록하고, ②AI 답변이 명백히 "오매칭"이라고 말한 게 아니면(그 경우는 키워드를 넣으면 오히려
//    틀린 신호가 됨) 현재 매칭된 프로젝트의 토픽 키워드에도 반영한다(_tpAppendMailSignal — 메일이
//    실제 프로젝트에 배치될 때와 동일한, 이미 검증된 파이프라인 재사용). 턴마다 기록하되 프로젝트
//    키별 200건 캡(_writeLearningEntry 자체 로직)이 있어 무한히 쌓이지 않는다.
window._ibSaveRationaleAsLearning = function(uid, aiText) {
    if (!window._writeLearningEntry) return;
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const t = it.task || {};
    const mc = it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0];
    const projectKey = (mc && mc.drive_file_id) || window.currentDriveFileId || window.currentDriveFileName || '__unclassified__';

    // 💡 [2026-09-07] 오매칭을 지적하는 답변인지 미리 판정해서 entry에 같이 저장해둔다 — 아래 신호
    //    반영뿐 아니라, 나중에 _generateTopicProfile()이 이 로그를 "긍정/부정 사례"로 나눠 재사용할 때
    //    매번 텍스트를 다시 정규식 검사할 필요 없이 이 플래그 하나로 바로 구분할 수 있게 하기 위함.
    const looksLikeMismatch = /오매칭|잘못|불일치|아닙니다|아니에요|다른 프로젝트|mismatch|incorrect|wrong project/i.test(aiText);

    window._writeLearningEntry(projectKey, {
        type: 'rationale_review',
        reason: 'AI 분석 근거 문의',
        taskName: t['업무명'] || '',
        confidence: (mc && mc.confidence) || t['매칭신뢰도'] || '',
        matchedProjectId: (mc && mc.drive_file_id) || '',
        matchedProjectName: (mc && (mc.file_name || mc.model || mc.customer)) || '',
        matchBasis: (mc && (mc.model || mc.customer)) || '',
        matchKeywords: (mc && mc.keywords) ? mc.keywords.slice(0, 8) : [],
        sourceSnippet: (it.mailRaw && it.mailRaw.body2000 ? it.mailRaw.body2000.slice(0, 300) : ''),
        aiVerdict: aiText.slice(0, 500),
        looksMismatch: looksLikeMismatch
    });

    // 💡 AI 답변이 오매칭을 지적하는 경우엔 잘못된 키워드를 강화하지 않도록 신호 반영을 건너뜀 —
    //    그런 경우는 사용자가 별도로 [🚨 오매칭 신고]를 눌러야 실제 데이터(간트 삭제 등)가 정리됨.
    if (!looksLikeMismatch && mc && mc.drive_file_id && window._tpAppendMailSignal) {
        window._tpAppendMailSignal(mc.drive_file_id, t, it.mailRaw);
    }
};

window._ibSubmitAiChatInput = function(textarea) {
    const modal = document.getElementById('inbox-ai-chat-modal');
    const uid = modal ? modal.dataset.uid : null;
    if (!uid) return;
    const val = (textarea.value || '').trim();
    if (!val) return;
    textarea.value = '';
    window._ibSendAiChatTurn(uid, val);
};

window.showGanttMailRaw = function(rowIndex) {
    const row = globalData[rowIndex];
    if (!row || !row._mailRaw) return;
    window.showMailRawModal(row._mailRaw);
};

// 💡 [2026-08-24 신규] "📅 AI 분석 날짜로 복원" — 메일 자동등록 시 buildMailTaskRow/mfDirectInsert가
//    같이 남겨둔 _aiOrigStart/_aiOrigPlan(AI가 원래 뽑았던 값)으로 시작일/완료일을 되돌린다.
//    단순히 셀 값만 바꾸면 다음 자동 일정계산 때 다시 틀어질 수 있어(특히 ＊AI마커로 _isParallel이
//    켜진 업무는, 시작일이 강제(forced)되어 있지 않으면 "이전 형제 업무와 같은 시작일"로 다시 흡수됨),
//    값과 함께 _startForced/_planForced도 같이 다시 켜서 재계산에도 안 풀리게 고정한다.
//    Ctrl(⌘) 또는 Shift를 누른 채 클릭하면, 지금 다중 선택(window._selectedRows)돼 있는 행 전부에
//    한 번에 적용한다 — No. 칸 Ctrl/Shift 클릭으로 여러 행을 먼저 선택해두고 이 버튼을 누르면 됨.
//
// 💡 [2026-08-27 신규] _aiOrigStart 백업이 없는 과거 업무(이 백업 기능이 생기기 전에 메일로 자동등록된
//    업무) 대응 — AI 분석 프롬프트가 "상세내용" 첫 줄에 항상 [업무유형][발신자→수신자] YYYY-MM-DD
//    형식으로 시작일을 같이 적어두므로(getMailAnalysisPrompt 참고), 백업이 없으면 거기서 시작일만
//    추출해 복원한다. 완료일은 이 형식에 아예 포함되지 않아(AI가 완료일을 못 뽑은 메일이 대부분이라
//    처음부터 정보 자체가 없었음) 과거 업무는 복원 대상에서 제외 — 새로 생긴 정보가 아니라 원래 없던 값.
window._extractAiOrigStartFromContent = function(row) {
    if (!row) return null;
    const contentStr = colIdx.content !== -1 ? (row[colIdx.content] || '').toString() : '';
    if (!contentStr) return null;
    const firstLine = contentStr.split('\n')[0] || '';
    const m = firstLine.match(/\]\s*(\d{4}-\d{2}-\d{2})\b/);
    return m ? m[1] : null;
};
window._getAiOrigStart = function(row) {
    return (row && row._aiOrigStart) || window._extractAiOrigStartFromContent(row);
};
window.restoreAiTaskDate = function(rowIndex, event) {
    if (event) event.stopPropagation();
    const bulk = !!(event && (event.ctrlKey || event.metaKey || event.shiftKey));
    const targets = (bulk && window._selectedRows && window._selectedRows.size)
        ? Array.from(window._selectedRows)
        : [rowIndex];

    let restoredCount = 0, skippedCount = 0;
    targets.forEach(function(idx) {
        const row = globalData[idx];
        const origStart = window._getAiOrigStart(row);
        if (!row || (!origStart && !row._aiOrigPlan)) { skippedCount++; return; }
        const oldStart = colIdx.start !== -1 ? row[colIdx.start] : '';
        const oldPlan  = colIdx.plan  !== -1 ? row[colIdx.plan]  : '';
        let changed = false;
        if (origStart && colIdx.start !== -1 && row[colIdx.start] !== origStart) {
            row[colIdx.start] = origStart;
            row._startForced = true;
            changed = true;
        }
        if (row._aiOrigPlan && colIdx.plan !== -1 && row[colIdx.plan] !== row._aiOrigPlan) {
            row[colIdx.plan] = row._aiOrigPlan;
            row._planForced = true;
            changed = true;
        }
        if (changed) {
            logChange(idx, colIdx.start, `${oldStart || '-'} ~ ${oldPlan || '-'}`, `${row[colIdx.start] || '-'} ~ ${row[colIdx.plan] || '-'}`, 'AI 분석 날짜로 복원');
        }
        restoredCount++;
    });

    if (!restoredCount) {
        alert(window._t('⚠️ 복원할 AI 분석 원본 날짜가 없습니다.\n(백업도 없고, 상세내용에서 날짜를 추출할 수도 없는 업무입니다.)', "⚠️ No original AI-analyzed date to restore.\n(No backup exists, and a date couldn't be extracted from the details either.)"));
        return;
    }

    window.recalculateSchedules();
    if (window.showToast) {
        const msg = (targets.length > 1)
            ? `📅 선택된 ${restoredCount}건의 날짜를 AI 분석 원본으로 복원했습니다.${skippedCount ? ` (백업 없는 ${skippedCount}건 제외)` : ''}`
            : '📅 AI 분석 원본 날짜로 복원했습니다.';
        window.showToast(msg, 'info');
    }
};

// 💡 [2026-08-25 신규] "🛠️ 일정 도구" 메뉴 전용 — 위 restoreAiTaskDate()는 행을 미리 선택해야 하는데,
//    "일단 이 프로젝트 전체를 AI 원본 날짜로 되돌리고 싶다"는 요청이 있어 표 전체(선택 여부 무관)를
//    한 번에 훑어서 백업(_aiOrigStart/_aiOrigPlan)이 있는 업무만 전부 복원하는 버전을 추가한다.
//    핵심 로직(값+forced 플래그 동시 복원)은 동일 — 선택 없이 globalData 전체를 순회할 뿐.
window.restoreAiTaskDateAll = function() {
    const _en = window._currentLang === 'en';
    if (!globalData || globalData.length <= 1) return;
    // 💡 [2026-08-27] _aiOrigStart 백업이 없어도 상세내용에서 시작일을 추출할 수 있으면 대상에 포함
    const eligibleCount = globalData.slice(1).filter(function(row) { return row && (window._getAiOrigStart(row) || row._aiOrigPlan); }).length;
    if (!eligibleCount) {
        alert(_en
            ? '⚠️ No AI-analyzed original dates to restore.\n(No backup, and no date could be extracted from the detail text either.)'
            : '⚠️ 복원할 AI 분석 원본 날짜가 없습니다.\n(백업도 없고, 상세내용에서 날짜를 추출할 수도 없는 업무입니다.)');
        return;
    }
    const confirmMsg = _en
        ? `Restore AI-analyzed original dates for ${eligibleCount} task(s) in this project?\nRestored dates will be locked (forced) again so auto-recalculation doesn't move them.`
        : `이 프로젝트의 업무 ${eligibleCount}건을 AI 분석 원본 날짜로 복원할까요?\n복원된 날짜는 자동 재계산에 밀리지 않도록 다시 고정(잠금)됩니다.`;
    const doRestore = function() {
        let restoredCount = 0;
        for (let idx = 1; idx < globalData.length; idx++) {
            const row = globalData[idx];
            const origStart = window._getAiOrigStart(row);
            if (!row || (!origStart && !row._aiOrigPlan)) continue;
            const oldStart = colIdx.start !== -1 ? row[colIdx.start] : '';
            const oldPlan  = colIdx.plan  !== -1 ? row[colIdx.plan]  : '';
            let changed = false;
            if (origStart && colIdx.start !== -1 && row[colIdx.start] !== origStart) {
                row[colIdx.start] = origStart;
                row._startForced = true;
                changed = true;
            }
            if (row._aiOrigPlan && colIdx.plan !== -1 && row[colIdx.plan] !== row._aiOrigPlan) {
                row[colIdx.plan] = row._aiOrigPlan;
                row._planForced = true;
                changed = true;
            }
            if (changed) {
                logChange(idx, colIdx.start, `${oldStart || '-'} ~ ${oldPlan || '-'}`, `${row[colIdx.start] || '-'} ~ ${row[colIdx.plan] || '-'}`, 'AI 분석 날짜로 복원(전체)');
                restoredCount++;
            }
        }
        window.recalculateSchedules();
        if (window.showToast) {
            window.showToast(_en
                ? `📅 Restored AI-analyzed original dates for ${restoredCount} task(s).`
                : `📅 ${restoredCount}건의 날짜를 AI 분석 원본으로 복원했습니다.`, 'info');
        }
    };
    const _restoreOkLabel = _en ? 'Restore' : '복원';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doRestore, _restoreOkLabel, '#0056b3');
    else if (confirm(confirmMsg)) doRestore();
};

window.inboxRecomputePreview = function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const sel = document.getElementById('inbox-l0-' + uid);
    const autoEl = document.getElementById('inbox-auto-' + uid);
    const previewEl = document.getElementById('inbox-preview-' + uid);
    if (!sel || !previewEl) return;
    const info = window.computeL0InsertPos(globalData, colIdx, sel.value, it.task['시작일'], autoEl ? autoEl.checked : true, it.mailRaw && it.mailRaw.date);
    previewEl.textContent = info.previewLabel;
};

window.inboxPlaceToCurrent = function(uid) {
    if (!globalData || globalData.length <= 1) { alert(window._t('먼저 프로젝트(엑셀 또는 드라이브)를 로드해주세요.', 'Please load a project (Excel or Drive) first.')); return; }
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    window._ibRepairDatesFromMail(it); // ⭐ [2026-09-23] 막기 전에 메일 수신일로 채우는 것부터 시도
    const r = it.task;
    if ((r['시작일'] || '').includes('날짜확인필요') || (r['완료일'] || '').includes('날짜확인필요')) {
        alert(window._t('⚠️ 시작일/완료일이 미확정(날짜확인필요) 상태입니다.\n메일 분석 화면에서 날짜를 확정한 후 보관함에 담아주세요.', '⚠️ Start/end date is unconfirmed ("date needs confirmation"). Please confirm the date in the mail analyzer screen before adding to the inbox.'));
        return;
    }
    const sel = document.getElementById('inbox-l0-' + uid);
    const autoEl = document.getElementById('inbox-auto-' + uid);
    const chosenL0 = sel ? sel.value : '__END__';
    const useAuto = autoEl ? autoEl.checked : true;

    const built = window.buildMailTaskRow(r, undefined, undefined, it.mailRaw);
    const posInfo = window.computeL0InsertPos(globalData, colIdx, chosenL0, r['시작일'], useAuto, it.mailRaw && it.mailRaw.date);
    const pos = posInfo.pos;
    if (chosenL0 !== '__END__' && colIdx.devStage !== -1) {
        built.row[colIdx.devStage] = chosenL0; // 배치 구간과 개발단계 값 일치시킴
    }
    globalData.splice(pos, 0, built.row);

    logChange(pos, -1, "없음", `보관함에서 배치: ${built.taskName}`);
    window.recalculateSchedules();
    window.TaskInbox.setStatus(uid, '배치됨', {
        type: '현재프로젝트배치',
        target: (window.projectMeta || {}).프로젝트명 || '현재 프로젝트',
        at: new Date().toISOString()
    });
    window.renderTaskInbox();
    alert(`✅ "${built.taskName}" 업무가 배치되었습니다.\n(${posInfo.previewLabel})`);
};

// ─── 💡 [처리됨 정리 모드] 처리됨(대기 아닌 상태) 항목을 어떻게 다룰지 두 모드 ─────────────────
//    - keep(처리됨 보관, 기본값): 지금까지 동작 그대로 — 처리돼도 목록에 남고, 사람이 각 행의 🗑로
//      직접 훑어보고 지운다.
//    - auto(처리됨 자동삭제): TaskInbox.setStatus()로 상태가 "대기"가 아닌 값(배치됨/자동배치됨/전송됨 등)으로
//      바뀌는 그 순간 바로 목록에서 제거 — 직접 지울 필요 없이 처리 즉시 사라짐.
//    💡 [2026-08-29] 이 모드를 켜고 끄던 업무 보관함 헤더의 토글 버튼은 삭제하고, 설정(⚙️ 메일 자동배치
//    설정 → ⏱️ 수집설정)의 체크박스(mac-cleanup-auto)로 이동함 — 값은 그대로 localStorage 사용.
window.getInboxCleanupMode = function() {
    return localStorage.getItem('inbox_cleanup_mode') || 'keep'; // 기본값: 보관(기존 동작 유지)
};

// 💡 [2026-09-07] 사용자가 직접 누르는 "🧹 저장공간 정리" — quota 초과로 저장이 막히기 전에
//    미리(또는 이미 막힌 뒤에라도) 완료 항목의 무거운 메일 원문을 비우고 오래된 완료 항목을 정리한다.
//    TaskInbox.save()의 자동 quota 복구(_shrinkForQuota)와 같은 로직을 그대로 재사용.
window.inboxCleanupStorage = function() {
    const _en = window._currentLang === 'en';
    const before = window.TaskInbox.load();
    const beforeBytes = JSON.stringify(before).length;
    const strippedCount = before.filter(function(it) { return it.status !== '대기' && it.mailRaw; }).length;
    const doneCount = before.filter(function(it) { return it.status !== '대기'; }).length;
    // 🐛 [2026-09-18 버그수정] 완료 항목만 보고 "정리할 항목 없음"이라 답하던 버그 — 저장공간이 가득
    // 차는 원인이 완료 항목이 아니라 '대기' 항목 자체가 쌓인 것일 수도 있음(_shrinkForQuota의 ③ 참고).
    // 같은 기준(KEEP_PENDING_RAW_MAX)으로 판단해야 실제 정리 결과와 안내 문구가 어긋나지 않는다.
    const KEEP_PENDING_RAW_MAX = window.TaskInbox.KEEP_PENDING_RAW_MAX;
    const stalePendingCount = Math.max(0, before.filter(function(it) { return it.status === '대기' && it.mailRaw && it.mailRaw.body2000; }).length - KEEP_PENDING_RAW_MAX);
    if (!strippedCount && doneCount <= 300 && !stalePendingCount) {
        alert(_en ? 'Nothing to clean up — no bulky completed items found.' : '정리할 항목이 없습니다. (완료 항목에 남은 메일 원문이 없거나 이미 정리돼 있습니다)');
        return;
    }
    const extra = stalePendingCount
        ? (_en
            ? ` Also, the mail body of ${stalePendingCount} old pending item(s) will be trimmed (the task itself is kept, only the long body is cleared; the most recent ${KEEP_PENDING_RAW_MAX} pending items are left untouched).`
            : ` 대기 항목 중 오래된 ${stalePendingCount}건의 메일 본문도 함께 정리합니다(업무 자체는 지우지 않고 긴 본문만 비웁니다 — 최근 ${KEEP_PENDING_RAW_MAX}건은 그대로 둡니다).`)
        : '';
    if (!confirm((_en
        ? `Clear the stored mail source from ${strippedCount} completed item(s) (kept in their placed project already), and if there are more than 300 completed items, keep only the most recent 300?`
        : `완료(배치됨/전송됨) 항목 ${strippedCount}건의 저장된 메일 원문을 지우고(이미 배치된 프로젝트 쪽엔 그대로 남아있습니다), 완료 항목이 300건을 넘으면 최근 300건만 남기고 정리할까요?`) + extra)) return;
    const after = window.TaskInbox._shrinkForQuota(before);
    window.TaskInbox.save(after);
    const afterBytes = JSON.stringify(after).length;
    const freedKb = Math.max(0, Math.round((beforeBytes - afterBytes) / 1024));
    const msg = _en
        ? `🧹 Cleanup done — freed about ${freedKb}KB (${before.length - after.length} old item(s) removed).`
        : `🧹 정리 완료 — 약 ${freedKb}KB 확보 (오래된 항목 ${before.length - after.length}건 삭제).`;
    if (window.showToast) window.showToast(msg, 'info'); else alert(msg);
};

window.mailRightToInbox = function() {
    if (!window._mailAnalyzedResult) { alert(window._t('먼저 분석을 실행해주세요.', 'Please run the analysis first.')); return; }
    window.TaskInbox.add(window._mailAnalyzedResult, { source: '업무 추가(메일분석)', mailRaw: window._mailParsedRaw || null });
    // 💡 상단바 배지 카운트 즉시 갱신
    if (window.updateInboxBadge) window.updateInboxBadge();
    // 💡 업무 보관함이 지금 열려있다면(둘 다 열어둔 상태), 그 자리에서 바로 목록도 갱신
    const ov = document.getElementById('task-inbox-overlay');
    if (ov && ov.style.display === 'flex' && window.renderTaskInbox) window.renderTaskInbox();
    alert(`📥 "${window._mailAnalyzedResult['업무명'] || '새 업무'}" 업무를 보관함에 담았습니다.\n상단바 [업무 보관함]에서 프로젝트별로 배치할 수 있습니다.`);
};

// 💡 원본 메일 보기 접기/펼치기 — 헤더는 한 번 클릭, 본문은 더블클릭으로 토글(2026-08-28 변경: 본문을
//    드래그해서 원문을 복사하려 하면 드래그 끝의 클릭이 토글까지 같이 터뜨려 바로 접혀버리던 문제 수정 —
//    본문은 더블클릭에만 반응하도록 바꿔서 한 번의 드래그 선택으로는 더 이상 안 접힘).
window.toggleMailOriginal = function() {
    const b = document.getElementById('mail-original-body');
    const a = document.getElementById('mail-original-arrow');
    if (!b || !a) return;
    const open = b.style.display !== 'none';
    b.style.display = open ? 'none' : 'block';
    a.textContent = open ? '▼' : '▲';
};

// ─── 💡 [Phase 8 연동] 오매칭 신고 — 보관함에서 전송된 업무의 오탐을 즉시 학습 시스템에 반영 ─────
// · 배치됨 / 자동배치됨: 현재 열린 globalData에서 해당 업무를 찾아 삭제 + negative_match 기록
// · 전송됨:              토픽 학습 기록만 → 그 파일에서는 직접 삭제하도록 안내
window.inboxReportFalseMatch = function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const _en = window._currentLang === 'en';
    const t = it.task || {};
    const taskName = t['업무명'] || (_en ? '(untitled)' : '(제목없음)');

    // ① 대상 프로젝트 키 + 레이블 추론
    var projectKey = '';
    var targetLabel = '';
    var isCurrentProject = (it.status === '배치됨' || it.status === '자동배치됨');
    if (isCurrentProject) {
        projectKey = window.currentDriveFileId || window.currentDriveFileName || '';
        targetLabel = (window.projectMeta && window.projectMeta.프로젝트명) || (_en ? 'Current Project' : '현재 프로젝트');
    } else if (it.status === '전송됨') {
        // matchedProject의 candidates[0]에 drive_file_id가 있으면 가장 신뢰도 높음
        const mc = it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0];
        if (mc) {
            projectKey = mc.drive_file_id || mc.file_name || '';
            targetLabel = mc.file_name || mc.model || mc.customer || (_en ? 'Target Project' : '대상 프로젝트');
        }
        // fallback: history 마지막 항목의 target(fileName)
        if (!projectKey) {
            const lastH = (it.history || []).slice(-1)[0];
            if (lastH && lastH.target) { projectKey = lastH.target; targetLabel = lastH.target; }
        }
    }

    if (!projectKey) {
        alert(_en
            ? '⚠️ Cannot determine the target project.\nPlease delete the task directly from the Gantt chart.'
            : '⚠️ 대상 프로젝트를 특정할 수 없습니다.\n간트차트에서 직접 오매칭 삭제해주세요.');
        return;
    }

    // ② 확인 — [2026-09-07] "오매칭 신고" + "새 프로젝트로 등록할지"를 확인창 2번으로 나눠 물었더니
    //    번거롭다는 피드백 → 하나로 합침. 확인하면 삭제까지 하고 곧바로 새 프로젝트 등록(AI 추출)
    //    위자드를 이어서 연다. 이미 등록된 "다른" 프로젝트 건이면 취소하고 [📤 다른 Proj 선택]을
    //    쓰라고 문구에 명시해서, 신규가 아닌데 새 프로젝트가 중복 생성되는 오남용을 줄인다.
    const confirmMsg = isCurrentProject
        ? (_en
            ? `Report "${taskName}" as a false match?\n✅ Removes it from the current Gantt chart, then opens the new-project registration screen (AI-extracted) right after.\n(If it belongs to a project that already exists, cancel and use [📤 Other Project] instead.)`
            : `"${taskName}"\n오매칭으로 신고할까요?\n✅ 현재 간트차트에서도 삭제하고, 곧바로 새 프로젝트 등록 화면(AI 추출)을 이어서 엽니다.\n(이미 등록된 다른 프로젝트 건이면 취소하고 [📤 다른 Proj 선택]을 이용해주세요)`)
        : (_en
            ? `Report "${taskName}" as a false match for [${targetLabel}]?\n(Please delete it from that project manually.)\n✅ Also opens the new-project registration screen (AI-extracted) right after.\n(If it belongs to a project that already exists, cancel and use [📤 Other Project] instead.)`
            : `"${taskName}"\n[${targetLabel}] 프로젝트의 오매칭으로 신고할까요?\n(해당 프로젝트에서는 직접 삭제해주세요.)\n✅ 신고 후 곧바로 새 프로젝트 등록 화면(AI 추출)을 이어서 엽니다.\n(이미 등록된 다른 프로젝트 건이면 취소하고 [📤 다른 Proj 선택]을 이용해주세요)`);
    if (!confirm(confirmMsg)) return;

    // ③ 매칭 메타 수집 → 학습 품질 향상
    const mc2 = it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0];
    const matchKeywords = (mc2 && mc2.keywords) ? mc2.keywords.slice(0, 8) : [];
    const matchBasis    = (mc2 && (mc2.model || mc2.customer)) || targetLabel;
    const confidence    = (mc2 && mc2.confidence) || t['매칭신뢰도'] || '';

    // ④ negative_match 학습 기록 (Phase 3 → Phase 8 연동)
    if (window._writeLearningEntry) {
        window._writeLearningEntry(projectKey, {
            type:             'negative_match',
            reason:           _en ? 'False match (inbox report)' : '오매칭(보관함 신고)',
            taskName:         taskName,
            confidence:       confidence,
            matchedProjectId: projectKey,
            matchBasis:       matchBasis,
            matchKeywords:    matchKeywords,
            sourceSnippet:    ''
        });
    }

    // ⑤ 현재 프로젝트이면 globalData에서 해당 업무 찾아 삭제
    var removedFromGantt = false;
    if (isCurrentProject && typeof globalData !== 'undefined' && globalData && globalData.length > 1) {
        // 우선순위: ① mailRaw.subject 일치 (가장 확실), ② 업무명 + 시작일 일치
        const mailSubject = it.mailRaw && it.mailRaw.subject ? it.mailRaw.subject.trim() : '';
        const startDate   = (t['시작일'] || '').trim();

        for (var i = 1; i < globalData.length; i++) {
            const row = globalData[i];
            if (!row) continue;
            // mailRaw 비교 (buildMailTaskRow가 _mailRaw를 그대로 첨부)
            if (mailSubject && row._mailRaw && (row._mailRaw.subject || '').trim() === mailSubject) {
                typeof logChange === 'function' && logChange(i, -1, taskName, '삭제', '오매칭 수거(보관함)');
                globalData.splice(i, 1);
                removedFromGantt = true;
                break;
            }
            // fallback: 업무명 + 시작일 매칭
            var cols = typeof colIdx !== 'undefined' ? colIdx : {};
            var rowNameCells = [
                cols.task1 !== undefined && cols.task1 !== -1 ? row[cols.task1] : null,
                cols.task2 !== undefined && cols.task2 !== -1 ? row[cols.task2] : null,
                cols.task3 !== undefined && cols.task3 !== -1 ? row[cols.task3] : null,
                cols.task4 !== undefined && cols.task4 !== -1 ? row[cols.task4] : null,
                row._origT1, row._origT2, row._origT3, row._origT4, row._origDev
            ].filter(Boolean).map(function(v) { return String(v).replace(/\s*＊AI📧\s*$/, '').trim(); });
            const rowStart  = cols.start !== undefined && cols.start !== -1 ? (row[cols.start] || '') : '';
            const nameMatch = rowNameCells.some(function(n) { return n === taskName || n.startsWith(taskName.slice(0, 8)); });
            if (nameMatch && (!startDate || rowStart === startDate)) {
                typeof logChange === 'function' && logChange(i, -1, taskName, '삭제', '오매칭 수거(보관함)');
                globalData.splice(i, 1);
                removedFromGantt = true;
                break;
            }
        }
        if (removedFromGantt && typeof window.recalculateSchedules === 'function') {
            window.recalculateSchedules();
        }
    }

    // ⑥ 보관함 이력 기록
    window.TaskInbox.setStatus(uid, it.status, {
        type:             '오매칭 신고',
        target:           targetLabel,
        removedFromGantt: removedFromGantt,
        at:               new Date().toISOString()
    });

    // ⑦ 결과 토스트
    if (window.showToast) {
        if (removedFromGantt) {
            window.showToast(
                _en ? '🚨 Removed from Gantt + topic learning recorded.' : '🚨 간트에서 삭제 + 토픽 학습 기록 완료',
                'info', 4000
            );
        } else {
            window.showToast(
                _en
                    ? `🚨 Learning recorded — please delete from [${targetLabel}] manually.`
                    : `🚨 학습 기록 완료 — [${targetLabel}]에서 직접 삭제해주세요.`,
                'warn', 5000
            );
        }
    }
    window.renderTaskInbox();

    // ⑧ [2026-09-07 신규 → 같은날 확인창 통합] 위 ②에서 이미 "신고 후 새 프로젝트 등록 화면을
    //    이어서 연다"는 것까지 한 번에 확인받았으므로, 여기서 다시 묻지 않고 곧바로 이어간다.
    window._ibStartNewProjectFromMismatch(it);
};

// 💡 [2026-09-07 신규] 오매칭 신고 직후 "새 프로젝트로 등록"을 고르면 — 15b-mail-server-tab-1.js의
//    _msPickNewProject와 동일한 흐름(새 빈 시트 분리 → AI로 메일 필드 추출 → 위자드를 MP(EC) 상태로
//    오픈)을 업무 보관함 항목(mailRaw 기반) 소스로 재사용한다. _msPickNewProject 자체를 그대로 부르지
//    않는 이유: 그쪽은 window._msReanalyzeTarget/_msResults(메일서버 탭 전용 전역상태)를 참조해서 이
//    경로엔 안 맞고, 위에서 이미 한 번 confirm을 받았으니 거기서 또 뜨는 "계속하시겠습니까?" 확인을
//    중복으로 띄우고 싶지 않다.
window._ibStartNewProjectFromMismatch = async function(it) {
    const _en2 = window._currentLang === 'en';
    // 현재 프로젝트는 그대로 탭에 유지되고, 새 빈 시트로 전환된다 (startNewProject/_msPickNewProject와 동일 패턴)
    if (window._openAsNewSheet) window._openAsNewSheet('new_' + Date.now(), null, null);
    if (window._resetToBlankNoConfirm) window._resetToBlankNoConfirm(true);

    const mr = it.mailRaw || {};
    const mailRecord = {
        subject: mr.subject || (it.task && it.task['업무명']) || '',
        from:    mr.sender || '',
        body:    mr.body2000 || (it.task && it.task['상세내용']) || ''
    };

    let prefill = {};
    if (window._npwExtractFromMail && window.getActiveAiKey && window.getActiveAiKey() && (mailRecord.subject || mailRecord.body)) {
        if (window.showToast) window.showToast(_en2 ? '⏳ AI is extracting project info from the mail...' : '⏳ AI가 메일에서 프로젝트 정보를 추출하는 중...', 'info', 3000);
        try { prefill = await window._npwExtractFromMail(mailRecord); } catch (e) { console.warn('[오매칭→새 프로젝트] AI 추출 실패:', e); }
    }
    if (window._npwOpen) {
        window._npwOpen(prefill, 'MP(EC)');
    } else {
        alert(_en2 ? 'Wizard module not loaded. Please reload the page and try again.' : '위자드 모듈이 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.');
    }
};

// 💡 [2026-09-07 신규] "새 Proj 생성"을 오매칭 신고(자동배치됨/전송됨) 흐름에만 붙여놨었는데,
//    생각해보니 실제로 더 필요한 건 아직 어느 프로젝트에도 안 놓인 "대기" 상태다 — 이미 매칭돼서
//    간트에 들어가 있는 걸 "오매칭이니 새 프로젝트로" 바꾸는 경우보다, 애초에 매칭될 프로젝트가
//    없어서(또는 매칭이 틀려서) "대기"에 계속 쌓여있는 신규 건이 훨씬 흔한 케이스이므로. 오매칭
//    신고와 달리 여기는 학습로그 기록·간트 삭제가 필요 없어(아직 어디에도 안 놓였으므로)
//    _ibStartNewProjectFromMismatch를 곧바로 재사용하되 확인창만 이 흐름에 맞게 새로 붙인다.
window.inboxCreateNewProjectFromPending = function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const _en = window._currentLang === 'en';
    const taskName = (it.task && it.task['업무명']) || (_en ? '(untitled)' : '(제목없음)');
    if (!confirm(_en
        ? `Register "${taskName}" as a new project?\n(Opens a separate blank sheet with AI-prefilled fields for you to review — the current project stays in its own tab.)`
        : `"${taskName}"\n이 메일 내용으로 새 프로젝트를 등록할까요?\n(별도의 빈 시트를 열고 AI가 메일에서 추출한 정보로 미리 채워드립니다 — 현재 프로젝트는 탭에 그대로 유지됩니다.)`)) return;
    window._ibStartNewProjectFromMismatch(it);
};

// ─── 💡 [버그 수정 2026-09-07] 업무 보관함 카드의 🗑 버튼이 이유 없이 곧장 TaskInbox.remove()만
//    호출해서 AI 학습(gantt_ai_learning_v1)에 전혀 기록되지 않고 있었음. 사용자 제보: "AI 업무
//    보관함에서 보다가 지웠는데 [학습+삭제] 기능(Gantt 행 삭제 시 뜨는 사유 선택 팝업)없이
//    삭제되는데?" — Gantt 행 삭제(_showAiDeleteFeedback)와 같은 취지로, 지우기 전에 사유
//    (오매칭/중복/불필요/기타)를 물어 학습 로그에 남긴다. 아직 어느 프로젝트에도 배치 전이라
//    globalData splice가 필요 없어(=Gantt 재배치 대상 드롭다운 불필요) _showAiDeleteFeedback을
//    그대로 재사용하지 않고 더 단순한 전용 팝업으로 분리했다 — 재배치가 필요하면 이미 있는
//    [📤 다른 Proj 선택] 버튼(inboxOpenDistribute)을 쓰면 되므로 여기서 중복 구현하지 않음.
window.inboxDeleteWithFeedback = function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const _en = window._currentLang === 'en';
    const t = it.task || {};
    const taskName = t['업무명'] || (_en ? '(untitled)' : '(제목없음)');
    const mc = it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0];

    const existing = document.getElementById('inbox-delete-feedback-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'inbox-delete-feedback-modal';
    // 💡 다른 확인용 팝업들과 동일하게 배경 조작 허용(pointer-events:none 오버레이 + 내부 박스만 all).
    modal.style.cssText = 'position:fixed;inset:0;z-index:100010;background:none;pointer-events:none;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML =
        '<div style="pointer-events:all;background:#fff;border-radius:14px;padding:26px 30px;min-width:340px;max-width:440px;' +
        'box-shadow:0 10px 44px rgba(0,0,0,0.22);font-family:sans-serif;max-height:88vh;overflow-y:auto;">' +
          '<div style="font-size:17px;font-weight:700;margin-bottom:4px;">🗑 ' + (_en ? 'Delete Inbox Item' : '업무 보관함 항목 삭제') + '</div>' +
          '<div style="font-size:12px;color:#888;margin-bottom:14px;">' + (_en ? 'Let us know why — it helps improve future analysis.' : '이유를 알려주시면 다음 분석 정확도가 높아집니다.') + '</div>' +
          '<div style="background:#f8f9fa;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px;font-weight:600;">' + escapeHtml(taskName) + '</div>' +
          '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">' + (_en ? 'Reason' : '삭제 이유') + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;"><input type="radio" name="ib-del-reason" value="오매칭"> ❌ ' + (_en ? 'False match — not this project' : '오매칭 — 이 프로젝트 업무가 아님') + '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;"><input type="radio" name="ib-del-reason" value="중복"> ♻️ ' + (_en ? 'Duplicate — already registered' : '중복 — 이미 등록된 업무') + '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;"><input type="radio" name="ib-del-reason" value="불필요"> 🚫 ' + (_en ? 'Irrelevant' : '불필요 — 등록할 필요 없는 내용') + '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;"><input type="radio" name="ib-del-reason" value="기타"> 💬 ' + (_en ? 'Other' : '기타') + '</label>' +
          '</div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
            '<button id="ib-del-cancel-btn" style="padding:9px 18px;background:#dee2e6;color:#333;border:none;border-radius:7px;font-size:13px;cursor:pointer;">' + (_en ? 'Cancel' : '취소') + '</button>' +
            '<button id="ib-del-plain-btn" style="padding:9px 16px;background:#f8f9fa;color:#495057;border:1px solid #ced4da;border-radius:7px;font-size:13px;cursor:pointer;">' + (_en ? 'Just delete' : '그냥 삭제') + '</button>' +
            '<button id="ib-del-learn-btn" style="padding:9px 18px;background:#d63384;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;">📚 ' + (_en ? 'Learn + Delete' : '학습+삭제') + '</button>' +
          '</div>' +
        '</div>';
    document.body.appendChild(modal);

    function closeModal() { modal.remove(); }
    function doRemove() {
        window._ibExpandedUids.delete(uid);
        window.TaskInbox.remove(uid);
        window.renderTaskInbox();
        // ⭐ [2026-09-23] 단건 삭제도 3초 대기 없이 바로 드라이브까지 반영
        window.TaskInbox.syncNow().then(function(r) {
            if (r === 'failed' && window.showToast) {
                window.showToast(window._t(
                    '⚠️ 드라이브 반영에 실패했습니다(로컬에는 삭제됨) — 연결 확인 후 다시 시도해주세요.',
                    '⚠️ Failed to sync the deletion to Drive (deleted locally) — check your connection and try again.'), 'error', 6000);
            }
        });
    }
    document.getElementById('ib-del-cancel-btn').onclick = closeModal;
    document.getElementById('ib-del-plain-btn').onclick = function() { closeModal(); doRemove(); };
    document.getElementById('ib-del-learn-btn').onclick = function() {
        const reasonEl = modal.querySelector('input[name="ib-del-reason"]:checked');
        const reason = reasonEl ? reasonEl.value : '';
        if (!reason) { alert(_en ? 'Please choose a reason.' : '사유를 선택해주세요.'); return; }
        const projectKey = (mc && mc.drive_file_id) || window.currentDriveFileId || window.currentDriveFileName || '__unclassified__';
        if (window._writeLearningEntry) {
            window._writeLearningEntry(projectKey, {
                type: reason === '오매칭' ? 'negative_match' :
                      reason === '중복'   ? 'duplicate' :
                      reason === '불필요' ? 'irrelevant' : 'other',
                reason: reason,
                taskName: taskName,
                confidence: (mc && mc.confidence) || t['매칭신뢰도'] || '',
                matchedProjectId: (mc && mc.drive_file_id) || '',
                matchedProjectName: (mc && (mc.file_name || mc.model || mc.customer)) || '',
                matchBasis: (mc && (mc.model || mc.customer)) || '',
                matchKeywords: (mc && mc.keywords) ? mc.keywords.slice(0, 8) : [],
                sourceSnippet: (it.mailRaw && it.mailRaw.body2000 ? it.mailRaw.body2000.slice(0, 300) : '')
            });
        }
        closeModal();
        doRemove();
        if (window.showToast) window.showToast(_en ? '📚 Learning recorded' : '📚 학습 데이터가 기록됐습니다', 'info');
    };
};

