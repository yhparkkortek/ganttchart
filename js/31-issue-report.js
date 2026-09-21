/* ════════════════════════════════════════════════════════════════════
   Phase 10 — 이슈 리포트 (관리자 모달) (2026-09-21)
   설계: docs/phase10-issue-learning-design.md §6~§7
   - Drive `Backups/SAP_Issues/`의 사용자·월별 샤드를 모두 읽어 병합 → 결정론적 시그니처로 군집 → 순위.
   - [내보내기]는 백엔드 /issue-export로 C:\SAP_DMS\SAP이슈\digest_<날짜>.json 에 저장(브라우저 다운로드 금지 원칙).
     Claude에게 "이슈 정리해줘"라고 하면 그 파일을 읽어 원인 진단·수정을 진행한다.
   - 군집·순위 계산(_issueCluster)은 순수 함수라 화면과 분리돼 있다(테스트 가능).
   ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var API = 'http://127.0.0.1:5000';
    var RECENT_DAYS = 14;
    var LOAD_MONTHS = 3;
    var REACTION_KINDS = { user_flag: 1, user_thumbs_down: 1, reask: 1, interrupt: 1 };
    var _state = { events: [], clusters: [], resolved: {}, resolvedFileId: null, folderId: null, loadedAt: null };

    function t(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function getToken() {
        try {
            var o = window.gapi && gapi.client && gapi.client.getToken && gapi.client.getToken();
            return (o ? o.access_token : null) || window.googleAccessToken || null;
        } catch (e) { return null; }
    }

    // ── 군집 (순수 함수) ───────────────────────────────────────────────
    function sigOf(e) {
        if (REACTION_KINDS[e.kind]) return null;   // 반응 이벤트는 호출 군집에 연결하거나 별도 군집
        var r = e.result || {};
        return [e.domain || '', e.kind || '', e.route || '', e.stage || '', String(r.errorNorm || '').slice(0, 80), (e.snapshot && e.snapshot.tcode) || ''].join('|');
    }
    var ENV_RE = /SAP GUI Scripting|SAP GUI가 켜져|SAP GUI가 실행 중|로그인해주세요|열려 있는 SAP 연결|32비트 Python|pywin32/;
    function layerHint(c) {
        var n = c.errorNorm || '';
        // 사용자 환경 문제(SAP 미실행/미로그인/스크립팅 미설정/32비트 런타임) — 코드 버그가 아니므로 따로 표시하고 점수도 낮춘다
        if (ENV_RE.test(n)) return t('환경: SAP 미실행/미로그인/설정(코드 문제 아님)', 'Env: SAP not running/logged in/configured (not a code bug)');
        if (c.kind === 'fe_stale_backend') return t('배포: 구버전/꺼진 백엔드', 'Deploy: stale/offline backend');
        if (c.kind === 'fe_network_fail') return t('환경/타임아웃(③ 코드 or 환경)', 'Env/timeout');
        if (c.kind === 'degraded_layout') return t('③ 코드·지식: 레이아웃 카탈로그', '③ code/knowledge: layout catalog');
        if (c.snapshot && c.snapshot.windows >= 2) return t('③ 코드: 팝업 잔존 처리', '③ code: leftover popup');
        if (/찾지 못|없습니다|필드|컨트롤/.test(n)) return t('③ 코드: 필드/컨트롤 탐색', '③ code: field/control lookup');
        if (c.kind === 'reaction') return t('② 프롬프트/UX', '② prompt/UX');
        return t('미분류(사람이 판단)', 'Unclassified');
    }
    /** events → 순위가 매겨진 군집 배열. resolved = {sig: {at, note}} */
    window._issueCluster = function (events, resolved) {
        resolved = resolved || {};
        var now = Date.now(), recentCut = now - RECENT_DAYS * 86400000;
        var map = {}, byRid = {};
        (events || []).forEach(function (e) {
            var s = sigOf(e);
            if (!s) return;
            var c = map[s];
            if (!c) {
                var r = e.result || {};
                c = map[s] = { sig: s, kind: e.kind, domain: e.domain, route: e.route || '', stage: e.stage || '', errorNorm: r.errorNorm || '', tcode: (e.snapshot && e.snapshot.tcode) || '',
                    count: 0, recentCount: 0, users: {}, first: e.ts, last: e.ts, envBackends: {}, concurrent: 0, reactions: {}, samples: [], snapshot: null, events: [] };
            }
            c.count++; c.events.push(e);
            if (new Date(e.ts).getTime() >= recentCut) c.recentCount++;
            c.users[e.user || '?'] = 1;
            if (e.ts < c.first) c.first = e.ts;
            if (e.ts > c.last) c.last = e.ts;
            var bh = (e.env && e.env.backend) || 'unknown'; c.envBackends[bh] = (c.envBackends[bh] || 0) + 1;
            if (e.flags && e.flags.indexOf('concurrent_session_suspect') >= 0) c.concurrent++;
            if (c.samples.length < 3) c.samples.push({ ts: e.ts, user: e.user, params: e.params, errorRaw: (e.result || {}).errorRaw, layout: (e.result || {}).layout });
            if (e.snapshot) c.snapshot = e.snapshot;   // 가장 최근 스냅샷
            if (e.rid) byRid[e.rid] = c;
        });
        var reactionOnly = {};
        (events || []).forEach(function (e) {
            if (!REACTION_KINDS[e.kind]) return;
            var rids = (e.params && e.params.rids) || [];
            var linked = false;
            rids.forEach(function (rid) { var c = byRid[rid]; if (c) { c.reactions[e.kind] = (c.reactions[e.kind] || 0) + 1; linked = true; } });
            if (linked) return;
            var q = String((e.params && e.params.q) || '').slice(0, 40);
            var s = 'qa|' + e.kind + '|' + q;
            var c = reactionOnly[s];
            if (!c) c = reactionOnly[s] = { sig: s, kind: 'reaction', domain: 'qa', route: '', stage: '', errorNorm: e.kind + ': ' + q, tcode: '', count: 0, recentCount: 0, users: {}, first: e.ts, last: e.ts,
                envBackends: {}, concurrent: 0, reactions: {}, samples: [], snapshot: null, events: [] };
            c.count++; c.events.push(e); c.users[e.user || '?'] = 1;
            if (new Date(e.ts).getTime() >= recentCut) c.recentCount++;
            if (e.ts < c.first) c.first = e.ts;
            if (e.ts > c.last) c.last = e.ts;
            if (c.samples.length < 3) c.samples.push({ ts: e.ts, user: e.user, params: e.params, errorRaw: e.user_note });
        });
        var out = Object.keys(map).map(function (k) { return map[k]; }).concat(Object.keys(reactionOnly).map(function (k) { return reactionOnly[k]; }));
        out.forEach(function (c) {
            c.userList = Object.keys(c.users);
            c.userCount = c.userList.length;
            c.layerHint = layerHint(c);
            var mostlyConcurrent = c.count > 0 && c.concurrent / c.count > 0.5;
            if (mostlyConcurrent) c.layerHint = t('⚠ 세션 충돌 의심 — ', '⚠ Possible session clash — ') + c.layerHint;
            var reactionN = Object.keys(c.reactions).reduce(function (a, k) { return a + c.reactions[k]; }, 0);
            c.isEnv = ENV_RE.test(c.errorNorm || '');
            c.score = c.userCount * (c.count + c.recentCount + reactionN) * (mostlyConcurrent ? 0.5 : 1) * (c.isEnv ? 0.3 : 1);   // 환경 문제는 코드 수정 대상이 아니므로 순위를 낮춤
            var rs = resolved[c.sig];
            c.resolved = rs || null;
            c.recurred = !!(rs && c.events.some(function (e) { return e.ts > rs.at; }));
            delete c.users;
        });
        out.sort(function (a, b) { return b.score - a.score; });
        return out;
    };

    // ── Drive 로드/저장 ────────────────────────────────────────────────
    async function driveList(token, q) {
        var r = await fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=200&fields=files(id,name)', { headers: { Authorization: 'Bearer ' + token } });
        var d = await r.json(); return d.files || [];
    }
    async function driveJson(token, id) {
        var r = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } });
        if (!r.ok) return null; try { return await r.json(); } catch (e) { return null; }
    }
    async function loadAll() {
        var token = getToken();
        if (!token) throw new Error(t('먼저 구글 드라이브에 연동해주세요.', 'Please connect Google Drive first.'));
        var folderId = await window._issueGetFolder(token);
        _state.folderId = folderId;
        var files = await driveList(token, "'" + folderId + "' in parents and trashed=false");
        var cut = new Date(); cut.setMonth(cut.getMonth() - (LOAD_MONTHS - 1));
        var minYm = cut.getFullYear() * 100 + (cut.getMonth() + 1);
        var shards = files.filter(function (f) { var m = /^issues_.+_(\d{6})\.json$/.exec(f.name); return m && parseInt(m[1], 10) >= minYm; });
        var resFile = files.filter(function (f) { return f.name === '_resolved.json'; })[0] || null;
        var parts = await Promise.all(shards.map(function (f) { return driveJson(token, f.id); }));
        var seen = {}, events = [];
        parts.forEach(function (arr) { (Array.isArray(arr) ? arr : []).forEach(function (e) { if (e && e.id && !seen[e.id]) { seen[e.id] = 1; events.push(e); } }); });
        _state.events = events;
        _state.resolvedFileId = resFile ? resFile.id : null;
        _state.resolved = resFile ? (await driveJson(token, resFile.id)) || {} : {};
        _state.loadedAt = new Date().toISOString();
        _state.shardCount = shards.length;
        _state.clusters = window._issueCluster(events, _state.resolved);
    }
    async function saveResolved() {
        var token = getToken(); var payload = JSON.stringify(_state.resolved);
        if (_state.resolvedFileId) {
            var r = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + _state.resolvedFileId + '?uploadType=media&supportsAllDrives=true', { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: payload });
            if (!r.ok) throw new Error('HTTP ' + r.status);
        } else {
            var b = 'res' + Date.now();
            var body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: '_resolved.json', parents: [_state.folderId], mimeType: 'application/json' }) + '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + payload + '\r\n--' + b + '--';
            var r2 = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + b }, body: body });
            if (!r2.ok) throw new Error('HTTP ' + r2.status);
            try { _state.resolvedFileId = (await r2.json()).id; } catch (e) { /* ignore */ }
        }
    }

    // ── 내보내기 (Claude가 읽는 digest) ────────────────────────────────
    function buildDigest() {
        return {
            generatedAt: new Date().toISOString(), generatedBy: window.currentUserName || '', range: { months: LOAD_MONTHS }, shards: _state.shardCount || 0,
            totals: { events: _state.events.length, clusters: _state.clusters.length },
            note: '이벤트는 마스킹됨(자재/사업자/메일/사용자경로). 스냅샷은 화면 구조만(필드 값 없음). resolved.at 이후 재발 여부는 recurred.',
            clusters: _state.clusters.map(function (c, i) {
                return { rank: i + 1, sig: c.sig, kind: c.kind, domain: c.domain, route: c.route, stage: c.stage, errorNorm: c.errorNorm, tcode: c.tcode,
                    count: c.count, recentCount: c.recentCount, users: c.userCount, first: c.first, last: c.last, score: Math.round(c.score * 10) / 10,
                    layerHint: c.layerHint, isEnvIssue: c.isEnv, envBackends: c.envBackends, concurrent: c.concurrent, reactions: c.reactions,
                    resolved: c.resolved, recurred: c.recurred, samples: c.samples, snapshot: c.snapshot };
            })
        };
    }
    /** Drive 폴더 안의 같은 이름 파일을 갱신(없으면 생성) — digest를 하루 1개로 덮어쓴다. */
    async function driveUpsertJson(token, folderId, name, obj) {
        var files = await driveList(token, "name='" + name + "' and trashed=false and '" + folderId + "' in parents");
        var payload = JSON.stringify(obj, null, 1);
        var r;
        if (files.length) {
            r = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + files[0].id + '?uploadType=media&supportsAllDrives=true', { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: payload });
        } else {
            var bd = 'dg' + Date.now();
            var body = '--' + bd + '\r\n' + 'Content-Type: application/json; charset=UTF-8' + '\r\n' + '\r\n' + JSON.stringify({ name: name, parents: [folderId], mimeType: 'application/json' }) + '\r\n' + '--' + bd + '\r\n' + 'Content-Type: application/json' + '\r\n' + '\r\n' + payload + '\r\n' + '--' + bd + '--';
            r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + bd }, body: body });
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
    }
    /** 내보내기 — ① 로컬 C:\SAP_DMS\SAP이슈\(Claude가 읽는 파일) ② Google Drive Backups/SAP_Issues/(팀 공용). 한쪽이 실패해도 다른 쪽은 진행한다. */
    window._issueExportDigest = async function () {
        var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
        var fileName = 'digest_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
        var digest = buildDigest(), localPath = null, localErr = null, driveOk = false, driveErr = null;
        try {
            var r = await fetch(API + '/issue-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: fileName, data: digest }) });
            if ((r.headers.get('content-type') || '').indexOf('json') < 0) throw new Error(t('백엔드가 구버전이거나 꺼져 있습니다 — kortek_backend.bat을 다시 실행해주세요.', 'Backend is outdated or offline — restart kortek_backend.bat.'));
            var j = await r.json();
            if (!j.ok) throw new Error(j.error || 'export failed');
            localPath = j.path;
        } catch (e) { localErr = e.message || String(e); }
        try {
            var token = getToken();
            if (!token) throw new Error(t('구글 드라이브 미연동', 'Google Drive not connected'));
            var folderId = _state.folderId || await window._issueGetFolder(token);
            await driveUpsertJson(token, folderId, fileName, digest);
            driveOk = true;
        } catch (e) { driveErr = e.message || String(e); }
        if (!localPath && !driveOk) { alert(t('내보내기 실패\n\n로컬: ', 'Export failed\nLocal: ') + localErr + '\nDrive: ' + driveErr); return; }
        var parts = [];
        if (localPath) parts.push(t('로컬 ', 'Local ') + localPath);
        if (driveOk) parts.push('Google Drive(Backups/SAP_Issues/' + fileName + ')');
        if (window.showToast) window.showToast(t('✅ 리포트 저장 — ', '✅ Report saved — ') + parts.join(' + ') + (localErr ? t(' (로컬 실패: ', ' (local failed: ') + localErr + ')' : '') + (driveErr ? t(' (Drive 실패: ', ' (Drive failed: ') + driveErr + ')' : ''), 'info');
    };

    // ── 화면 ───────────────────────────────────────────────────────────
    function fmt(ts) { try { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); } catch (e) { return ts || ''; } }
    function render() {
        var body = document.getElementById('issue-rpt-body'); if (!body) return;
        var cs = _state.clusters;
        var head = '<div style="font-size:12px; color:#666; margin-bottom:8px;">' +
            esc(t('이벤트 ', 'Events ')) + '<b>' + _state.events.length + '</b>' + esc(t('건 · 군집 ', ' · Clusters ')) + '<b>' + cs.length + '</b>' + esc(t('개 · 최근 ' + LOAD_MONTHS + '개월 · 갱신 ', ' · last ' + LOAD_MONTHS + ' months · loaded ')) + esc(fmt(_state.loadedAt)) + '</div>';
        if (!cs.length) { body.innerHTML = head + '<div style="padding:30px; text-align:center; color:#999;">' + esc(t('수집된 이슈가 없습니다.', 'No issues collected yet.')) + '</div>'; return; }
        var rows = cs.map(function (c, i) {
            var resolvedBadge = c.resolved ? (c.recurred ? '<span style="background:#ffe3e3; color:#c92a2a; padding:1px 6px; border-radius:8px; font-size:10.5px; font-weight:bold;">🔁 ' + esc(t('재발', 'Recurred')) + '</span>' : '<span style="background:#d3f9d8; color:#2b8a3e; padding:1px 6px; border-radius:8px; font-size:10.5px;">✔ ' + esc(t('해결됨', 'Resolved')) + '</span>') : '';
            var react = Object.keys(c.reactions).map(function (k) { return k.replace('user_', '') + '×' + c.reactions[k]; }).join(' ');
            return '<tr style="border-top:1px solid #eee; vertical-align:top;">' +
                '<td style="padding:6px; color:#999;">' + (i + 1) + '</td>' +
                '<td style="padding:6px; white-space:nowrap;"><b>' + c.count + '</b>' + esc(t('건', '')) + ' / ' + c.userCount + esc(t('명', ' users')) + '<div style="font-size:10.5px; color:#999;">' + esc(fmt(c.last)) + '</div></td>' +
                '<td style="padding:6px; word-break:break-all;"><div style="font-weight:bold;">' + esc(c.domain) + ' ' + esc(c.route) + (c.stage ? ' <span style="color:#888;">[' + esc(c.stage) + ']</span>' : '') + ' ' + resolvedBadge + '</div>' +
                '<div style="color:#555; font-size:11.5px;">' + esc(c.errorNorm || c.kind) + '</div>' +
                '<div style="font-size:10.5px; color:#888;">' + esc(c.kind) + (c.tcode ? ' · ' + esc(c.tcode) : '') + (react ? ' · ' + esc(react) : '') + '</div></td>' +
                '<td style="padding:6px; font-size:11.5px;">' + esc(c.layerHint) + '</td>' +
                '<td style="padding:6px; white-space:nowrap;"><button onclick="window._issueRptDetail(' + i + ')" style="font-size:11px; padding:2px 8px; border:1px solid #ccc; background:#f8f9fa; border-radius:5px; cursor:pointer;">' + esc(t('상세', 'Detail')) + '</button> ' +
                '<button onclick="window._issueRptResolve(' + i + ')" style="font-size:11px; padding:2px 8px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; cursor:pointer;">' + esc(t('해결됨', 'Resolved')) + '</button></td></tr>' +
                '<tr id="issue-rpt-detail-' + i + '" style="display:none;"><td></td><td colspan="4" style="padding:6px 6px 12px; background:#fafafa; font-size:11.5px;"></td></tr>';
        }).join('');
        body.innerHTML = head + '<table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="text-align:left; color:#7a5210; background:#fff8e6;">' +
            '<th style="padding:6px;">#</th><th style="padding:6px;">' + esc(t('건수/사용자', 'Count/Users')) + '</th><th style="padding:6px;">' + esc(t('시그니처', 'Signature')) + '</th><th style="padding:6px;">' + esc(t('추정 층', 'Layer')) + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
    window._issueRptDetail = function (i) {
        var tr = document.getElementById('issue-rpt-detail-' + i); if (!tr) return;
        if (tr.style.display !== 'none') { tr.style.display = 'none'; return; }
        var c = _state.clusters[i], td = tr.children[1];
        var html = '<div><b>' + esc(t('환경(백엔드 해시)', 'Env (backend hash)')) + ':</b> ' + esc(JSON.stringify(c.envBackends)) + ' · <b>' + esc(t('사용자', 'Users')) + ':</b> ' + esc(c.userList.join(', ')) + '</div>';
        html += '<div style="margin-top:4px;"><b>' + esc(t('대표 사례', 'Samples')) + ':</b></div>' + c.samples.map(function (s) {
            return '<div style="margin-left:8px; color:#555;">' + esc(fmt(s.ts)) + ' · ' + esc(s.user) + ' · ' + esc(JSON.stringify(s.params || {})) + (s.errorRaw ? ' · ' + esc(s.errorRaw) : '') + (s.layout ? ' · layout=' + esc(JSON.stringify(s.layout)) : '') + '</div>';
        }).join('');
        if (c.snapshot) {
            var sn = c.snapshot;
            html += '<div style="margin-top:6px;"><b>' + esc(t('화면 스냅샷', 'Screen snapshot')) + ':</b> tcode=' + esc(sn.tcode) + ' · windows=' + esc(sn.windows) + ' · status=' + esc(JSON.stringify(sn.status || {})) + ' · nodes=' + ((sn.tree || []).length) + '</div>' +
                '<pre style="margin:4px 0 0 8px; max-height:140px; overflow:auto; background:#fff; border:1px solid #eee; padding:6px; font-size:10.5px;">' + esc((sn.tree || []).slice(0, 40).map(function (n) { return n.slice(0, 5).join(' | '); }).join('\n')) + '</pre>';
        }
        td.innerHTML = html; tr.style.display = '';
    };
    window._issueRptResolve = async function (i) {
        var c = _state.clusters[i]; if (!c) return;
        var note = prompt(t('해결 메모(선택) — 예: 라벨 컨트롤 회피 수정', 'Resolution note (optional)'), '');
        if (note === null) return;
        try {
            _state.resolved[c.sig] = { at: new Date().toISOString(), note: String(note).slice(0, 120), by: window.currentUserName || '' };
            await saveResolved();
            _state.clusters = window._issueCluster(_state.events, _state.resolved);
            render();
        } catch (e) { alert(t('저장 실패: ', 'Save failed: ') + (e.message || e)); }
    };
    window._issueRptReload = async function () {
        var body = document.getElementById('issue-rpt-body');
        if (body) body.innerHTML = '<div style="padding:30px; text-align:center; color:#999;">' + esc(t('불러오는 중…', 'Loading…')) + '</div>';
        try { await loadAll(); render(); }
        catch (e) { if (body) body.innerHTML = '<div style="padding:30px; text-align:center; color:#c92a2a;">' + esc(e.message || e) + '</div>'; }
    };

    window.openIssueReportModal = function () {
        try {
            if (window.verifyAdminPassword && !window.verifyAdminPassword(t('🔒 이슈 리포트를 열려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)', '🔒 Enter the admin password to open the issue report.\n(case-insensitive)'))) return;
            var modal = document.getElementById('issue-rpt-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'issue-rpt-modal';
                modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
                modal.innerHTML =
                    '<div id="issue-rpt-box" style="pointer-events:all; position:fixed; top:8vh; left:calc(50vw - min(490px,48vw)); width:min(980px,96vw); height:78vh; min-width:420px; min-height:300px; resize:both; overflow:hidden; background:#fff; border-radius:10px; box-shadow:0 8px 30px rgba(0,0,0,0.25); display:flex; flex-direction:column;">' +
                    '<div id="issue-rpt-handle" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; display:flex; justify-content:space-between; align-items:center; cursor:grab; user-select:none;">' +
                    '<span id="issue-rpt-title"></span><span style="display:flex; gap:6px; align-items:center;">' +
                    '<button id="issue-rpt-reload" onclick="window._issueRptReload()" style="font-size:11.5px; padding:4px 10px; border:1px solid #ffe08a; background:#fff; color:#7a5210; border-radius:6px; cursor:pointer;"></button>' +
                    '<button id="issue-rpt-export" onclick="window._issueExportDigest()" style="font-size:11.5px; padding:4px 10px; border:1px solid #ffe08a; background:#fff; color:#7a5210; border-radius:6px; cursor:pointer;"></button>' +
                    '<button onclick="event.stopPropagation(); document.getElementById(\'issue-rpt-modal\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></span></div>' +
                    '<div id="issue-rpt-body" style="padding:14px 18px; overflow:auto; flex:1;"></div></div>';
                document.body.appendChild(modal);
                if (window._makeDraggable) { try { window._makeDraggable('issue-rpt-box', 'issue-rpt-handle'); } catch (e) { /* ignore */ } }
                if (window._bindClickToFront) { try { window._bindClickToFront('issue-rpt-modal'); } catch (e) { /* ignore */ } }
            }
            document.getElementById('issue-rpt-title').textContent = t('🧾 SAP·AI 문답 이슈 리포트', '🧾 SAP / AI Q&A Issue Report');
            document.getElementById('issue-rpt-reload').textContent = t('🔄 새로고침', '🔄 Reload');
            document.getElementById('issue-rpt-export').textContent = t('📤 내보내기', '📤 Export');
            modal.style.display = 'flex';
            if (window.bringModalToFront) window.bringModalToFront('issue-rpt-modal');
            window._issueRptReload();
        } catch (e) { console.warn('[이슈 리포트] 열기 실패:', e); }
    };
})();
