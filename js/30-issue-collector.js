/* ════════════════════════════════════════════════════════════════════
   Phase 10 — SAP·구매오더·AI 문답 이슈 수집기 (2026-09-21)
   설계: docs/phase10-issue-learning-design.md

   하는 일
   1) window.fetch 래퍼 — 로컬 백엔드(127.0.0.1:5000)의 /sap-*, /po-* 호출만 골라, 요청 상관 id(_rid
      쿼리 파라미터 — 커스텀 헤더는 백엔드 CORS Allow-Headers가 Content-Type뿐이라 쓰면 구버전 백엔드가 깨짐)를
      붙이고, "백엔드가 못 보는 실패"(네트워크 오류/타임아웃, JSON이 아닌 응답=구버전·꺼진 백엔드)만 기록한다.
      백엔드가 본 실패/느림/레이아웃 미적용은 백엔드가 issue_events.jsonl에 직접 기록한다.
   2) 사용자 반응 — 👎(기존 피드백 래핑), 🚩 신고(신규), 재질문, 전역 인터럽트.
   3) localStorage 아웃박스 + 백엔드 우편함(/issue-drain)을 합쳐 Drive `Backups/SAP_Issues/`의
      사용자·월별 샤드(issues_<이름>_<YYYYMM>.json)에 올린다(이벤트 id로 중복 제거).

   원칙: 수집 코드는 본 기능을 절대 방해하지 않는다 — 전 구간 try/catch, 래퍼는 원래 fetch 결과를
   그대로 돌려준다. 즉시 끄기: localStorage.setItem('gantt_issue_collect_off','1')
   ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var OFF_KEY = 'gantt_issue_collect_off';
    var OUTBOX_KEY = 'gantt_issue_outbox_v1';
    var OUTBOX_MAX = 300;
    var FLUSH_DELAY_MS = 30000;
    var FLUSH_INTERVAL_MS = 10 * 60 * 1000;
    var SHARD_MAX_EVENTS = 3000;
    var API = 'http://127.0.0.1:5000';
    var SAP_URL_RE = /^https?:\/\/(127\.0\.0\.1|localhost):5000\/(sap|po)-/;

    function off() { try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; } }

    // ── 마스킹 (백엔드 _issue_mask와 동일 규칙) ────────────────────────
    window._issueMask = function (text, limit) {
        try {
            var t = String(text == null ? '' : text);
            t = t.replace(/\b\d{3}-\d{2}-\d{5}\b/g, '#biz');   // 하이픈 형태만 — 하이픈 없는 10자리(COM 오류코드 등)는 아래 5자리↑ 규칙이 '#'로 처리
            t = t.replace(/\d{5,}/g, '#');
            t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '#mail');
            t = t.replace(/([A-Za-z]:[\\/]Users[\\/])[^\\/\s"']+/gi, '$1<user>');
            return t.slice(0, limit || 400);
        } catch (e) { return ''; }
    };
    window._issueNorm = function (text) {
        var t = window._issueMask(text, 300);
        t = t.replace(/"[^"]*"/g, '"?"').replace(/'[^']*'/g, "'?'");
        return t.replace(/\s+/g, ' ').trim().slice(0, 120);
    };

    // ── 사용자/환경 ────────────────────────────────────────────────────
    function userName() {
        // getActiveUserName()은 미로그인 시 prompt()를 띄우므로 쓰지 않는다.
        var n = window.currentUserName;
        if (n && n !== '비로그인 (로컬)' && n !== '익명 사용자') return String(n);
        try { var l = localStorage.getItem('gantt_local_user'); if (l) return l + ' (PC)'; } catch (e) { /* ignore */ }
        return '익명';
    }
    function safeUser(name) { return String(name || '익명').replace(/\s*\(PC\)\s*$/, '').replace(/[^0-9A-Za-z가-힣_\-]/g, '_').slice(0, 30) || '익명'; }
    function pageVersion() {
        try {
            var el = document.querySelector('script[src*="30-issue-collector"]');
            var m = el && /[?&]v=([^&]+)/.exec(el.getAttribute('src') || '');
            return m ? m[1] : '';
        } catch (e) { return ''; }
    }
    function newId() { return 'ev_' + Date.now().toString(16) + '_' + Math.random().toString(16).slice(2, 6); }
    function getToken() {
        try {
            var tokenObj = window.gapi && gapi.client && gapi.client.getToken && gapi.client.getToken();
            return (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken || null;
        } catch (e) { return null; }
    }

    // ── 아웃박스 ───────────────────────────────────────────────────────
    function readOutbox() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') || []; } catch (e) { return []; } }
    function writeOutbox(arr) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(arr.slice(-OUTBOX_MAX))); } catch (e) { /* 용량 초과 등 — 무시 */ } }

    var _flushTimer = null;
    function scheduleFlush(delay) { clearTimeout(_flushTimer); _flushTimer = setTimeout(flush, delay || FLUSH_DELAY_MS); }

    /** 이벤트 기록 진입점. 기본 필드를 채우고 마스킹한 뒤 아웃박스에 쌓는다. */
    window._issueLog = function (evt) {
        try {
            if (off()) return null;
            var e = evt || {};
            e.id = e.id || newId();
            e.v = 1;
            e.ts = e.ts || new Date().toISOString();
            e.user = e.user || userName();
            e.env = Object.assign({ page: pageVersion() }, e.env || {});
            if (e.result) {
                if (e.result.errorRaw != null) e.result.errorRaw = window._issueMask(e.result.errorRaw);
                if (e.result.errorNorm == null && e.result.errorRaw != null) e.result.errorNorm = window._issueNorm(e.result.errorRaw);
            }
            if (e.user_note) e.user_note = window._issueMask(e.user_note, 200);
            var ob = readOutbox(); ob.push(e); writeOutbox(ob);
            scheduleFlush();
            return e.id;
        } catch (err) { return null; }
    };

    // ── ① fetch 래퍼 ──────────────────────────────────────────────────
    window._issueRecentSap = window._issueRecentSap || [];   // {rid, route, ts} — 🚩 신고가 최근 SAP 호출을 자동 첨부
    var _origFetch = window.fetch ? window.fetch.bind(window) : null;
    window._issueRawFetch = _origFetch;                        // 테스트에서 Drive/백엔드 모킹용 이음새
    function _raw() { return window._issueRawFetch || _origFetch; }
    if (_origFetch && !window._issueFetchWrapped) {
        window._issueFetchWrapped = true;
        window.fetch = function (input, init) {
            var url = (typeof input === 'string') ? input : '';
            if (!url || off() || !SAP_URL_RE.test(url)) return _raw()(input, init);
            var rid, t0, route;
            try {
                rid = 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                t0 = Date.now();
                route = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
                var ring = window._issueRecentSap; ring.push({ rid: rid, route: route, ts: t0 });
                if (ring.length > 20) ring.shift();
                url = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_rid=' + rid;
            } catch (e) { return _raw()(input, init); }
            var p = _raw()(url, init);
            return p.then(function (res) {
                try {
                    var ct = (res.headers && res.headers.get('content-type')) || '';
                    if (ct.indexOf('json') < 0) {
                        // HTML 등 — 이 라우트가 없는 구버전 백엔드이거나 백엔드 앞단 오류. 백엔드 훅이 없는 버전은 스스로 못 남긴다.
                        window._issueLog({ domain: route.indexOf('/po-') === 0 ? 'po' : 'sap', kind: 'fe_stale_backend', rid: rid, route: route,
                            result: { ok: false, http: res.status, durMs: Date.now() - t0, errorRaw: 'JSON 아닌 응답(' + (ct || 'content-type 없음') + ') — 구버전/이상 백엔드 의심' } });
                    }
                } catch (e) { /* 수집 실패는 무시 */ }
                return res;
            }, function (err) {
                try {
                    var aborted = err && (err.name === 'AbortError' || /abort|timeout/i.test(String(err.message || '')));
                    window._issueLog({ domain: route.indexOf('/po-') === 0 ? 'po' : 'sap', kind: 'fe_network_fail', rid: rid, route: route,
                        result: { ok: false, http: 0, durMs: Date.now() - t0, errorRaw: aborted ? 'AbortError(타임아웃)' : String((err && err.message) || err) } });
                } catch (e) { /* ignore */ }
                throw err;
            });
        };
    }

    // ── ③ Drive 업로드 ─────────────────────────────────────────────────
    var _folderPromise = null;
    function getIssueFolder(token) {
        if (_folderPromise) return _folderPromise;
        _folderPromise = (async function () {
            var backupsId = await window.getOrCreateBackupFolder(token);
            var q = "mimeType='application/vnd.google-apps.folder' and name='SAP_Issues' and trashed=false and '" + backupsId + "' in parents";
            var res = await _raw()('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)', { headers: { Authorization: 'Bearer ' + token } });
            var data = await res.json();
            if (data.files && data.files.length) return data.files[0].id;
            var cr = await _raw()('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
                method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'SAP_Issues', mimeType: 'application/vnd.google-apps.folder', parents: [backupsId] })
            });
            var created = await cr.json();
            if (!created.id) throw new Error('SAP_Issues 폴더 생성 실패');
            return created.id;
        })();
        _folderPromise.catch(function () { _folderPromise = null; }); // 실패하면 다음 기회에 재시도
        return _folderPromise;
    }
    window._issueGetFolder = getIssueFolder;

    async function uploadShard(token, folderId, ym, events) {
        var fname = 'issues_' + safeUser(events[0].user) + '_' + ym + '.json';
        var q = "name='" + fname + "' and trashed=false and '" + folderId + "' in parents";
        var lr = await _raw()('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)', { headers: { Authorization: 'Bearer ' + token } });
        var ld = await lr.json();
        var fileId = ld.files && ld.files.length ? ld.files[0].id : null;
        var existing = [];
        if (fileId) {
            var gr = await _raw()('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } });
            if (gr.ok) { try { existing = await gr.json(); } catch (e) { existing = []; } }
            if (!Array.isArray(existing)) existing = [];
        }
        var seen = {}; existing.forEach(function (e) { if (e && e.id) seen[e.id] = 1; });
        var merged = existing.concat(events.filter(function (e) { return e && e.id && !seen[e.id]; }));
        if (merged.length > SHARD_MAX_EVENTS) merged = merged.slice(-SHARD_MAX_EVENTS);
        var payload = JSON.stringify(merged);
        var r;
        if (fileId) {
            r = await _raw()('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media&supportsAllDrives=true', {
                method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: payload });
        } else {
            var boundary = 'issue' + Date.now();
            var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify({ name: fname, parents: [folderId], mimeType: 'application/json' }) +
                '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + payload + '\r\n--' + boundary + '--';
            r = await _raw()('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body });
        }
        if (!r.ok) throw new Error('샤드 업로드 실패 HTTP ' + r.status);
    }

    var _flushing = false;
    async function flush() {
        if (_flushing || off()) return;
        _flushing = true;
        try {
            var token = getToken();
            if (!token) return;                       // 로그인 전 — 아웃박스에 보관, 다음 기회에
            var drained = null;
            try {                                     // 백엔드 우편함(없거나 구버전이면 조용히 건너뜀)
                var dr = await _raw()(API + '/issue-drain?max=200');
                if (dr.ok && (dr.headers.get('content-type') || '').indexOf('json') >= 0) drained = await dr.json();
            } catch (e) { /* 백엔드 꺼짐 */ }
            var backendEvents = (drained && drained.ok && drained.events) || [];
            var outbox = readOutbox();
            var all = backendEvents.concat(outbox);
            if (!all.length) return;
            var me = userName();
            all.forEach(function (e) { if (!e.user) e.user = me; });
            var byMonth = {};
            all.forEach(function (e) { var ym = String(e.ts || '').slice(0, 7).replace('-', '') || 'unknown'; (byMonth[ym] = byMonth[ym] || []).push(e); });
            var folderId = await getIssueFolder(token);
            var months = Object.keys(byMonth);
            for (var i = 0; i < months.length; i++) await uploadShard(token, folderId, months[i], byMonth[months[i]]);
            // 전부 성공한 뒤에만 정리 — 실패하면 아웃박스/우편함이 그대로 남아 다음에 재전송(id로 중복 제거)
            var sent = {}; outbox.forEach(function (e) { sent[e.id] = 1; });
            writeOutbox(readOutbox().filter(function (e) { return !sent[e.id]; }));
            if (drained && drained.ok && backendEvents.length) {
                try { await _raw()(API + '/issue-ack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: drained.next }) }); } catch (e) { /* 다음에 재전송 */ }
            }
            console.log('[이슈 수집] Drive 업로드 완료:', all.length + '건');
        } catch (e) {
            console.warn('[이슈 수집] 업로드 실패(무시, 다음에 재시도):', e);
        } finally { _flushing = false; }
    }
    window._issueFlushNow = flush;
    window._issueStatus = function () {
        return { off: off(), outbox: readOutbox().length, hasToken: !!getToken(), recentSap: (window._issueRecentSap || []).length };
    };

    // ── ② 사용자 반응 ──────────────────────────────────────────────────
    function questionOf(uid) {
        try {
            var h = window._ganttQaHistory || [];
            var i = -1;
            for (var k = 0; k < h.length; k++) { if (h[k].uid === uid) { i = k; break; } }
            if (i < 0) return '';
            if (h[i].question) return h[i].question;
            for (var j = i - 1; j >= 0; j--) { if (h[j].role === 'user') return h[j].text || ''; }
        } catch (e) { /* ignore */ }
        return '';
    }
    function recentRids(minutes) {
        var cut = Date.now() - (minutes || 10) * 60000;
        return (window._issueRecentSap || []).filter(function (x) { return x.ts >= cut; }).map(function (x) { return x.rid; });
    }
    /** AI 문답 반응 이벤트. 질문은 마스킹한 앞 160자만 저장(답변 본문은 저장하지 않음 — 사내 기밀 정책 미확정). */
    window._issueLogQa = function (kind, extra) {
        try {
            var x = extra || {};
            var rids = recentRids(10);
            var q = x.question != null ? x.question : (x.uid ? questionOf(x.uid) : '');
            return window._issueLog({
                domain: rids.length ? 'sap' : 'qa', kind: kind, rid: rids.length ? rids[rids.length - 1] : '', route: '',
                params: { q: window._issueMask(q, 160), qLen: String(q || '').length, rids: rids, activeDraft: x.activeDraft || undefined },
                user_note: x.note || undefined
            });
        } catch (e) { return null; }
    };

    function wrapWhenReady(name, wrapper, tries) {
        try {
            if (typeof window[name] === 'function') { window[name] = wrapper(window[name]); return; }
        } catch (e) { return; }
        if ((tries || 0) < 20) setTimeout(function () { wrapWhenReady(name, wrapper, (tries || 0) + 1); }, 500);
    }
    // 👎 — 기존 피드백 저장은 그대로 두고 수집만 덧붙임
    wrapWhenReady('saveGanttQaFeedback', function (orig) {
        return function (uid, rating) {
            try { if (rating === 'bad') window._issueLogQa('user_thumbs_down', { uid: uid }); } catch (e) { /* ignore */ }
            return orig.apply(this, arguments);
        };
    });
    // 재질문 — 기존 감지 결과를 그대로 반환하고 수집만 덧붙임
    wrapWhenReady('_ganttQaCheckReaskPattern', function (orig) {
        return function (question) {
            var r = orig.apply(this, arguments);
            try { if (r && r.uid) window._issueLogQa('reask', { question: question }); } catch (e) { /* ignore */ }
            return r;
        };
    });
    // 전역 인터럽트 — 04h가 draft를 비우기 직전에 호출(그 시점엔 어느 단계였는지 아직 남아있음)
    window._issueLogInterrupt = function () {
        try {
            var names = ['_ganttQaPoDraft', '_ganttQaBomDraft', '_ganttQaApprovalDraft', '_ganttQaSapDocClarify', '_ganttQaPendingChoiceDropdown', '_ganttQaPendingConfirmButtons'];
            var active = names.filter(function (n) { return !!window[n]; }).map(function (n) {
                var d = window[n]; return n.replace(/^_ganttQa/, '') + (d && d.stage ? ':' + d.stage : '');
            });
            window._issueLogQa('interrupt', { question: '', activeDraft: active.join(',') });
        } catch (e) { /* ignore */ }
    };

    // ── 🚩 신고 모달 ───────────────────────────────────────────────────
    window._issueOpenReport = function (uid) {
        try {
            var t = window._t || function (ko) { return ko; };
            var modal = document.getElementById('issue-report-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'issue-report-modal';
                modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9350; pointer-events:none; background:none;'; // 투명 래퍼 — 배경 조작/복사·붙여넣기 가능(모달 컨벤션)
                modal.innerHTML =
                    '<div id="issue-report-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:20vh; left:calc(50vw - min(220px,46vw)); background:#fff; border-radius:10px; width:min(440px,92vw); box-shadow:0 8px 30px rgba(0,0,0,0.25); overflow:hidden; font-family:inherit;">' +
                    '<div id="issue-report-handle" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; display:flex; justify-content:space-between; align-items:center; cursor:grab; user-select:none;">' +
                    '<span id="issue-report-title"></span>' +
                    '<button onclick="event.stopPropagation(); document.getElementById(\'issue-report-modal\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>' +
                    '<div style="padding:16px 18px;">' +
                    '<div id="issue-report-hint" style="font-size:12px; color:#666; margin-bottom:8px; line-height:1.5;"></div>' +
                    '<textarea id="issue-report-note" rows="3" maxlength="200" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ddd; border-radius:6px; font-size:13px; resize:vertical;"></textarea>' +
                    '<div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">' +
                    '<button id="issue-report-cancel" style="padding:7px 16px; background:#f8f9fa; color:#666; border:1px solid #ccc; border-radius:6px; font-size:12.5px; cursor:pointer;"></button>' +
                    '<button id="issue-report-submit" style="padding:7px 16px; background:#fff8e6; color:#7a5210; border:1px solid #ffe08a; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;"></button>' +
                    '</div></div></div>';
                document.body.appendChild(modal);
                if (window._makeDraggable) { try { window._makeDraggable('issue-report-box', 'issue-report-handle'); } catch (e) { /* ignore */ } }
            }
            document.getElementById('issue-report-title').textContent = t('🚩 문제 신고', '🚩 Report a problem');
            document.getElementById('issue-report-hint').textContent = t(
                '어떤 점이 문제였나요? 짧게 적어주세요(선택). 자재번호 등 숫자·이메일은 저장 전에 자동으로 가려집니다. 팀 이슈 리포트에 반영됩니다.',
                'What went wrong? A short note is enough (optional). Long numbers and emails are masked before saving. It will appear in the team issue report.');
            document.getElementById('issue-report-note').value = '';
            document.getElementById('issue-report-cancel').textContent = t('취소', 'Cancel');
            document.getElementById('issue-report-submit').textContent = t('신고', 'Report');
            document.getElementById('issue-report-cancel').onclick = function () { modal.style.display = 'none'; };
            document.getElementById('issue-report-submit').onclick = function () {
                var note = document.getElementById('issue-report-note').value || '';
                window._issueLogQa('user_flag', { uid: uid, note: note });
                modal.style.display = 'none';
                scheduleFlush(3000);
                if (window.showToast) window.showToast(t('🚩 신고가 접수되었습니다. 팀 이슈 리포트에 반영됩니다.', '🚩 Reported. It will appear in the team issue report.'), 'info');
            };
            modal.style.display = 'block';
            if (window.bringModalToFront) window.bringModalToFront('issue-report-modal');
        } catch (e) { console.warn('[이슈 신고] 모달 열기 실패:', e); }
    };

    // ── 시작: 로드 30초 뒤 + 10분마다 업로드 시도, 탭이 숨겨질 때 한 번 더 ──
    setTimeout(flush, FLUSH_DELAY_MS);
    setInterval(flush, FLUSH_INTERVAL_MS);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
})();
