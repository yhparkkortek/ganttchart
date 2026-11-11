// ══════════════════════════════════════════════════════════════════════════
// 🪐 JIRA(Kortek Issue Tracker) 탭 — 2026-11-11 신규
// ──────────────────────────────────────────────────────────────────────────
// 목적: 지금 열린 간트 프로젝트와 관련된 JIRA 이슈를 한 화면에서 조회·댓글(대응)·
//       상태전환·필드수정(요약/담당자/우선순위)까지 한다. 실제 HTTP 호출은 백엔드
//       (/jira/*, jira_bridge.py)가 하고, 이 파일은 화면 + 연결(3가지) 수집만 한다.
//
// 연결은 4가지를 **모두 쓴다**(사용자 결정, 2026-11-11):
//   ① 수동 이슈 키  — tabData.jiraLinks.manualKeys (쉼표 구분 입력)
//   ② 키워드 자동검색(JQL text~) — tabData.jiraLinks.keyword (기본값: 프로젝트 모델명)
//   ③ 메일에서 이미 캡처된 이슈번호 — row._mailRaw.subject/body2000 정규식 스캔(저장 안 함,
//      매번 다시 스캔 — 메일 분석이 쌓일수록 자동으로 늘어난다)
//   ④ JIRA 프로젝트 전체 — tabData.jiraLinks.projectKey (코드 또는 이름으로 찾아 **key로
//      저장**, 2026-11-11 추가). 사용자 실측: JIRA 프로젝트는 "LNW>SHUFFLER 3.0"" 처럼
//      이름에 특수문자·따옴표가 섞여 있어 JQL `project = "그 이름"` 매칭이 깨지기 쉽다
//      (실측 400) → 이름은 **찾는 용도로만**, 저장/조회는 항상 key(`project = GABKJ`).
// 네 소스는 **따로 조회한다**(한 JQL로 OR 하지 않음) — 메일 스캔은 존재하지 않는 키를
// 주워올 수 있는데, JIRA의 `key in (...)`는 그중 하나라도 없으면 전체가 400으로 죽는다.
// 소스 하나가 깨져도 나머지는 멀쩡히 보여야 한다.
//
// 쓰기(댓글/상태전환/필드수정)는 **사람이 상세 모달에서 버튼을 눌러야만** 실행된다 —
// AI 문답 도구(js/40 QA_TOOLS)는 mode:'read'만 등록돼 있어 조회만 할 수 있다
// (docs/qa-tool-router.md "쓰기는 읽기와 경로 분리" 원칙).
(function () {
    'use strict';
    const BASE = 'http://127.0.0.1:5000';
    const T = function (ko, en) { return window._t ? window._t(ko, en) : ko; };
    const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
    const KEY_RE = /^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/;

    var _issueCache = {};   // key -> issue (상세 모달·행 갱신 공용)
    var _lastRows = [];     // 지금 표에 그려진 {key, src:[...]} 목록

    // ── 연결 설정 읽기/쓰기 ──────────────────────────────────────────
    function links() {
        window.tabData = window.tabData || {};
        var l = window.tabData.jiraLinks;
        if (!l || typeof l !== 'object') l = { manualKeys: [], keyword: '', projectKey: '', projectName: '' };
        if (!Array.isArray(l.manualKeys)) l.manualKeys = [];
        if (typeof l.projectKey !== 'string') l.projectKey = '';
        if (typeof l.projectName !== 'string') l.projectName = '';
        window.tabData.jiraLinks = l;
        return l;
    }

    function defaultKeyword() {
        var pm = window.projectMeta || {};
        return pm.고객모델명 || pm.모델명 || pm.프로젝트명 || '';
    }

    // ── ③ 메일에서 이미 캡처된 이슈번호 스캔(저장하지 않음, 매번 다시) ──────
    function mailScanKeys() {
        var rows = window.globalData;
        if (!Array.isArray(rows)) return [];
        var re = /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g;
        var found = [];
        var seen = {};
        for (var i = rows.length - 1; i >= 1 && found.length < 20; i--) {
            var row = rows[i];
            var mr = row && row._mailRaw;
            if (!mr) continue;
            var text = (mr.subject || '') + ' ' + (mr.body2000 || '');
            var m;
            re.lastIndex = 0;
            while ((m = re.exec(text))) {
                var k = m[0];
                if (!seen[k]) { seen[k] = true; found.push(k); }
            }
        }
        return found;
    }

    function jql(parts) { return parts.filter(Boolean).join(' AND '); }

    async function fetchJson(url) {
        var r = await fetch(url);
        var d = await r.json();
        return d;
    }

    // ── 표 렌더 ──────────────────────────────────────────────────────
    function statusColor(name) {
        var s = String(name || '').toLowerCase();
        if (/closed|done|complete|해결|완료|종료/.test(s)) return { bg: '#e6f4ea', fg: '#1f7a3d' };
        if (/progress|진행/.test(s)) return { bg: '#fff4e0', fg: '#8b5a00' };
        if (/reopen|재오픈/.test(s)) return { bg: '#fdecea', fg: '#a3281c' };
        return { bg: '#eef1f4', fg: '#555' };
    }

    function srcChip(src) {
        var map = { manual: ['🔗', T('수동', 'manual')], mail: ['📧', T('메일', 'mail')], keyword: ['🔍', T('검색', 'search')], project: ['📁', T('프로젝트', 'project')] };
        return src.map(function (s) {
            var m = map[s] || ['•', s];
            return '<span style="font-size:10px; padding:1px 5px; border-radius:8px; background:#f0f0f0; color:#777; margin-right:2px;">' + m[0] + ' ' + m[1] + '</span>';
        }).join('');
    }

    function renderTable(merged, note) {
        var box = document.getElementById('jira-table-wrap');
        if (!box) return;
        _lastRows = merged;
        if (!merged.length) {
            box.innerHTML = '<div style="padding:30px; text-align:center; color:#999; font-size:12.5px;">'
                + (note || T('연결된 JIRA 이슈가 없습니다 — ⚙️ 연결 설정에서 키/검색어를 등록해주세요.',
                             'No linked JIRA issues — register keys/keyword under ⚙️ Link settings.'))
                + '</div>';
            return;
        }
        merged.sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); });
        var html = '<table class="concept-table" style="width:100%; border-collapse:separate; border-spacing:0; font-size:12.5px;">'
            + '<thead><tr style="background:#eef6f7;">'
            + '<th style="padding:7px 8px; text-align:left; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('키', 'Key') + '</th>'
            + '<th style="padding:7px 8px; text-align:left; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('요약', 'Summary') + '</th>'
            + '<th style="padding:7px 8px; text-align:center; width:90px; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('상태', 'Status') + '</th>'
            + '<th style="padding:7px 8px; text-align:center; width:90px; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('담당자', 'Assignee') + '</th>'
            + '<th style="padding:7px 8px; text-align:center; width:70px; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('우선순위', 'Priority') + '</th>'
            + '<th style="padding:7px 8px; text-align:center; width:110px; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('수정일', 'Updated') + '</th>'
            + '<th style="padding:7px 8px; text-align:left; width:140px; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('출처', 'Source') + '</th>'
            + '</tr></thead><tbody>'
            + merged.map(function (it) {
                var c = statusColor(it.status);
                return '<tr onclick="window._jiraOpenIssueModal(\'' + esc(it.key) + '\')" style="cursor:pointer; border-bottom:1px solid #f0f0f0;" onmouseover="this.style.background=\'#fafcfc\'" onmouseout="this.style.background=\'\'">'
                    + '<td style="padding:7px 8px; font-weight:bold; color:#8b5a00;">' + esc(it.key) + '</td>'
                    + '<td style="padding:7px 8px;">' + esc(it.summary) + '</td>'
                    + '<td style="padding:7px 8px; text-align:center;"><span style="font-size:11px; padding:2px 8px; border-radius:10px; background:' + c.bg + '; color:' + c.fg + ';">' + esc(it.status) + '</span></td>'
                    + '<td style="padding:7px 8px; text-align:center;">' + esc(it.assignee || '—') + '</td>'
                    + '<td style="padding:7px 8px; text-align:center;">' + esc(it.priority || '—') + '</td>'
                    + '<td style="padding:7px 8px; text-align:center; color:#888;">' + esc((it.updated || '').slice(0, 16).replace('T', ' ')) + '</td>'
                    + '<td style="padding:7px 8px;">' + srcChip(it.src) + '</td>'
                    + '</tr>';
            }).join('')
            + '</tbody></table>'
            + (note ? '<div style="padding:6px 8px; font-size:11px; color:#b06b00;">⚠️ ' + esc(note) + '</div>' : '');
        box.innerHTML = html;
    }

    function setHeaderState(html) {
        var el = document.getElementById('jira-tab-state');
        if (el) el.innerHTML = html || '';
    }

    // ── 탭 진입 시마다 다시 수집한다(메일 분석·설정이 그 사이 바뀌었을 수 있다) ──
    window._jiraOnTabShown = async function () {
        var box = document.getElementById('jira-table-wrap');
        if (!box) return;
        box.innerHTML = '<div style="padding:30px; text-align:center; color:#999;">' + T('불러오는 중...', 'Loading...') + '</div>';
        setHeaderState('');

        var gate = window._jiraEnsureLogin ? await window._jiraEnsureLogin(function (m) { setHeaderState('<span style="color:#888;">' + esc(m) + '</span>'); }) : { ok: true };
        if (!gate.ok) {
            setHeaderState('<span style="color:#b1432f;">🔒 ' + esc(gate.message || '') + '</span>');
            renderTable([], gate.message || T('JIRA에 로그인하지 못했습니다.', 'Could not sign in to JIRA.'));
            return;
        }
        setHeaderState('<span style="color:#1f7a3d;">✅ ' + T('연결됨', 'Connected') + '</span>');

        var L = links();
        var manualKeys = (L.manualKeys || []).filter(function (k) { return KEY_RE.test(k); });
        var mailKeys = mailScanKeys().filter(function (k) { return manualKeys.indexOf(k) === -1; });
        var keyword = (L.keyword || '').trim();

        var byKey = {};
        var notes = [];

        async function pull(keys, tag) {
            if (!keys.length) return;
            try {
                var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent('key in (' + keys.join(',') + ') ORDER BY updated DESC') + '&maxResults=' + keys.length);
                if (!d || d.ok === false) { notes.push((tag === 'mail' ? T('메일에서 찾은 키 조회 실패(존재하지 않는 키 포함 가능): ', 'Failed to look up mail-captured keys (may include nonexistent keys): ') : T('수동 키 조회 실패: ', 'Manual key lookup failed: ')) + (d && d.message)); return; }
                (d.issues || []).forEach(function (iss) {
                    if (!byKey[iss.key]) byKey[iss.key] = Object.assign({ src: [] }, iss);
                    if (byKey[iss.key].src.indexOf(tag) === -1) byKey[iss.key].src.push(tag);
                });
            } catch (e) { notes.push(String(e && e.message || e)); }
        }
        async function pullKeyword() {
            if (!keyword) return;
            try {
                var safe = keyword.replace(/["\\]/g, '');
                var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent('text ~ "' + safe + '*" ORDER BY updated DESC') + '&maxResults=30');
                if (!d || d.ok === false) { notes.push(T('검색어 조회 실패: ', 'Keyword search failed: ') + (d && d.message)); return; }
                (d.issues || []).forEach(function (iss) {
                    if (!byKey[iss.key]) byKey[iss.key] = Object.assign({ src: [] }, iss);
                    if (byKey[iss.key].src.indexOf('keyword') === -1) byKey[iss.key].src.push('keyword');
                });
            } catch (e) { notes.push(String(e && e.message || e)); }
        }
        async function pullProject() {
            var pk = (L.projectKey || '').trim();
            if (!pk) return;
            try {
                // ⚠️ 이름이 아니라 **key로만** 조회한다 — 이름엔 특수문자·따옴표가 섞여
                //    JQL 매칭이 깨진다(위 헤더 주석, 실측 400).
                var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent('project = ' + pk + ' ORDER BY updated DESC') + '&maxResults=50');
                if (!d || d.ok === false) { notes.push(T('프로젝트 조회 실패: ', 'Project lookup failed: ') + (d && d.message)); return; }
                (d.issues || []).forEach(function (iss) {
                    if (!byKey[iss.key]) byKey[iss.key] = Object.assign({ src: [] }, iss);
                    if (byKey[iss.key].src.indexOf('project') === -1) byKey[iss.key].src.push('project');
                });
            } catch (e) { notes.push(String(e && e.message || e)); }
        }

        await pull(manualKeys, 'manual');
        await pull(mailKeys, 'mail');
        await pullKeyword();
        await pullProject();

        Object.keys(byKey).forEach(function (k) { _issueCache[k] = byKey[k]; });
        renderTable(Object.keys(byKey).map(function (k) { return byKey[k]; }), notes.join(' / '));

        if (!manualKeys.length && !mailKeys.length && !keyword && !(L.projectKey || '').trim()) {
            renderTable([], null);
        }
    };

    window._jiraRefresh = function () { window._jiraOnTabShown(); };

    // ── ⚙️ 연결 설정 모달 ────────────────────────────────────────────
    window._jiraOpenLinkSettings = function () {
        var L = links();
        var wrap = document.getElementById('jira-link-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'jira-link-modal';
            wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
            wrap.innerHTML =
                '<div id="jira-link-box" style="pointer-events:all; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);'
                + ' width:min(420px,94vw); max-height:86vh; background:#fff; box-shadow:0 8px 30px rgba(0,0,0,.3); border-radius:10px; overflow:hidden;'
                + ' display:flex; flex-direction:column;">'
                + '<div id="jira-link-drag" style="padding:10px 14px; background:#fff4e0; border-bottom:1px solid #f0d090; color:#8b5a00;'
                + ' cursor:move; display:flex; align-items:center; gap:8px;">'
                + '<strong style="font-size:14px;">⚙️ ' + T('JIRA 연결 설정', 'JIRA link settings') + '</strong>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="document.getElementById(\'jira-link-modal\').style.display=\'none\'"'
                + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text);'
                + ' border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div style="padding:14px 16px; flex:1; min-height:0; overflow-y:auto; font-size:12px;">'
                + '<div style="margin-bottom:10px; color:#777; line-height:1.5;">'
                + T('이 프로젝트와 연결할 JIRA 이슈를 네 가지 방법으로 모읍니다 — 같이 켜 둘 수 있습니다.', 'Collects linked JIRA issues four ways — all can be on at once.')
                + '</div>'
                + '<label style="display:block; margin-bottom:4px; color:#555;">📁 ' + T('JIRA 프로젝트(코드 또는 이름 — 그 프로젝트 전체 이슈)', 'JIRA project (code or name — all its issues)') + '</label>'
                + '<div style="display:flex; gap:6px; margin-bottom:4px;">'
                + '<input id="jira-link-project" style="flex:1; min-width:0; padding:7px 9px; border:1px solid #ccc; border-radius:6px; font-size:12px;" placeholder="' + T('예: GABKJ 또는 SHUFFLER', 'e.g. GABKJ or SHUFFLER') + '">'
                + '<button onclick="window._jiraSearchProject()" style="padding:7px 12px; border-radius:6px; font-size:12px; cursor:pointer; border:1px solid #f0d090; background:#fff4e0; color:#8b5a00;">🔍 ' + T('찾기', 'Find') + '</button>'
                + '</div>'
                + '<div id="jira-link-project-hits" style="display:none; max-height:130px; overflow-y:auto; border:1px solid #eee; border-radius:6px; margin-bottom:10px;"></div>'
                + '<div style="border-top:1px dashed #e5e5e5; margin:4px 0 10px;"></div>'
                + '<label style="display:block; margin-bottom:4px; color:#555;">🔗 ' + T('수동 이슈 키 (쉼표로 구분, 예: GABKJ-1, GABKJ-5)', 'Manual issue keys (comma-separated, e.g. GABKJ-1, GABKJ-5)') + '</label>'
                + '<input id="jira-link-manual" style="width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #ccc; border-radius:6px; font-size:12px; margin-bottom:10px;">'
                + '<label style="display:block; margin-bottom:4px; color:#555;">🔍 ' + T('검색어(JQL text 검색, 비우면 모델명 사용)', 'Search keyword (JQL text search; blank uses the model name)') + '</label>'
                + '<input id="jira-link-keyword" style="width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #ccc; border-radius:6px; font-size:12px; margin-bottom:6px;" placeholder="' + esc(defaultKeyword()) + '">'
                + '<div style="font-size:11px; color:#999; margin-bottom:10px;">📧 ' + T('메일에서 캡처된 이슈번호는 자동으로 같이 모읍니다(별도 입력 불필요).', 'Issue numbers already captured from mail are collected automatically (no input needed).') + '</div>'
                + '<div id="jira-link-status" style="display:none; font-size:11.5px; margin-bottom:8px; line-height:1.5;"></div>'
                + '<div style="display:flex; justify-content:flex-end;">'
                + '<button onclick="window._jiraSaveLinkSettings()" style="padding:7px 14px; border-radius:6px; font-size:12px; cursor:pointer; border:1px solid #f0d090; background:#fff4e0; color:#8b5a00; font-weight:bold;">💾 ' + T('저장', 'Save') + '</button>'
                + '</div></div></div>';
            document.body.appendChild(wrap);
            if (window._makeDraggable) window._makeDraggable('jira-link-box', 'jira-link-drag');
            if (window._bindClickToFront) window._bindClickToFront('jira-link-modal');
            // 검색 결과 목록은 위임 클릭 하나로 — onclick 에 이름/키를 문자열로 박으면
            // 프로젝트 이름의 따옴표·꺾쇠(실측 `LNW>SHUFFLER 3.0"`)가 그대로 HTML을 깬다.
            document.getElementById('jira-link-project-hits').addEventListener('click', function (e) {
                var el = e.target.closest('[data-idx]');
                if (!el) return;
                var p = _projectHits[Number(el.dataset.idx)];
                if (!p) return;
                var inp = document.getElementById('jira-link-project');
                inp.value = p.key + ' — ' + p.name;
                inp.dataset.key = p.key;
                inp.dataset.name = p.name;
                document.getElementById('jira-link-project-hits').style.display = 'none';
            });
        }
        document.getElementById('jira-link-manual').value = (L.manualKeys || []).join(', ');
        document.getElementById('jira-link-keyword').value = L.keyword || '';
        var projEl = document.getElementById('jira-link-project');
        projEl.value = L.projectKey ? (L.projectKey + (L.projectName ? (' — ' + L.projectName) : '')) : '';
        projEl.dataset.key = L.projectKey || '';
        projEl.dataset.name = L.projectName || '';
        document.getElementById('jira-link-project-hits').style.display = 'none';
        document.getElementById('jira-link-status').style.display = 'none';
        wrap.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('jira-link-modal');
    };

    // ⚠️ 프로젝트 이름이 아니라 **key로 저장**(헤더 주석 참고) — 찾기로 고르면 dataset.key가
    //    바로 채워지고, 직접 타이핑만 했으면 저장 시 한 번 더 서버에 확인한다.
    var _projectHits = [];

    window._jiraSearchProject = async function () {
        var q = (document.getElementById('jira-link-project').value || '').split(' — ')[0].trim();
        var box = document.getElementById('jira-link-project-hits');
        if (!q) { box.style.display = 'none'; return; }
        box.style.display = 'block';
        box.innerHTML = '<div style="padding:8px; color:#999;">' + T('찾는 중...', 'Searching...') + '</div>';
        try {
            var d = await fetchJson(BASE + '/jira/projects?q=' + encodeURIComponent(q));
            if (!d || d.ok === false) { box.innerHTML = '<div style="padding:8px; color:#a3281c;">⚠️ ' + esc((d && d.message) || '') + '</div>'; return; }
            _projectHits = (d.projects || []).slice(0, 50);
            if (!_projectHits.length) { box.innerHTML = '<div style="padding:8px; color:#999;">' + T('일치하는 프로젝트가 없습니다.', 'No matching project.') + '</div>'; return; }
            box.innerHTML = _projectHits.map(function (p, i) {
                return '<div data-idx="' + i + '" style="padding:6px 8px; cursor:pointer; border-bottom:1px solid #f2f2f2;" onmouseover="this.style.background=\'#fafafa\'" onmouseout="this.style.background=\'\'"><b>' + esc(p.key) + '</b> — ' + esc(p.name) + '</div>';
            }).join('');
        } catch (e) {
            box.innerHTML = '<div style="padding:8px; color:#a3281c;">⚠️ ' + esc(String(e && e.message || e)) + '</div>';
        }
    };

    function linkStatus(msg, kind) {
        var el = document.getElementById('jira-link-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'err' ? '#b1432f' : '#1f7a3d';
        el.textContent = msg || '';
    }

    window._jiraSaveLinkSettings = async function () {
        var L = links();
        var raw = (document.getElementById('jira-link-manual').value || '').toUpperCase();
        L.manualKeys = raw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return KEY_RE.test(s); });
        L.keyword = (document.getElementById('jira-link-keyword').value || '').trim();

        var projEl = document.getElementById('jira-link-project');
        var typed = (projEl.value || '').split(' — ')[0].trim();
        linkStatus('', '');
        if (!typed) {
            L.projectKey = ''; L.projectName = '';
        } else if (projEl.dataset.key && projEl.dataset.key.toUpperCase() === typed.toUpperCase().split(' ')[0]) {
            L.projectKey = projEl.dataset.key;
            L.projectName = projEl.dataset.name || '';
        } else {
            // 찾기로 고르지 않고 직접 타이핑만 함 — 저장 전에 한 번 더 확인한다(추측 금지).
            try {
                var d = await fetchJson(BASE + '/jira/projects?q=' + encodeURIComponent(typed));
                var hits = (d && d.projects) || [];
                var exact = hits.filter(function (p) { return (p.key || '').toUpperCase() === typed.toUpperCase(); })[0];
                if (exact) { L.projectKey = exact.key; L.projectName = exact.name; }
                else if (hits.length === 1) { L.projectKey = hits[0].key; L.projectName = hits[0].name; }
                else {
                    linkStatus(hits.length
                        ? T('⚠️ 여러 프로젝트와 일치해 프로젝트 연결은 저장하지 않았습니다 — 🔍 찾기로 골라주세요.', '⚠️ Matches several projects — project link not saved; use 🔍 Find to pick one.')
                        : T('⚠️ 일치하는 프로젝트가 없어 프로젝트 연결은 저장하지 않았습니다.', '⚠️ No matching project — project link not saved.'), 'err');
                    L.projectKey = ''; L.projectName = '';
                }
            } catch (e) {
                linkStatus('⚠️ ' + String(e && e.message || e), 'err');
                L.projectKey = ''; L.projectName = '';
            }
        }

        if (window.collectTabData) { try { window.collectTabData(); } catch (e) { /* 있는 값으로 */ } }
        window.tabData.jiraLinks = L;  // collectTabData가 건드리지 않는 키라 다시 얹어 둔다
        if (window._markDirty) window._markDirty();
        if (!L.projectKey && typed) {
            // 프로젝트만 못 골랐고 나머지는 저장됐다 — 창을 열어 둬서 경고를 보게 한다.
        } else {
            document.getElementById('jira-link-modal').style.display = 'none';
        }
        window._jiraOnTabShown();
    };

    // ── 📝 이슈 상세 모달(조회 + 댓글 + 상태전환 + 필드수정) ────────────
    function fieldRow(label, inner) {
        return '<label style="display:flex; align-items:flex-start; gap:8px; margin-bottom:9px; font-size:12px;">'
            + '<span style="width:70px; flex:0 0 auto; color:#555; padding-top:6px;">' + label + '</span>' + inner + '</label>';
    }
    var inputSt = 'flex:1; min-width:0; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:12px;';
    var btnSt = 'padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer; border:1px solid #f0d090; background:#fff4e0; color:#8b5a00;';

    function modalSetStatus(msg, kind) {
        var el = document.getElementById('jira-issue-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'err' ? '#a3281c' : (kind === 'ok' ? '#1f7a3d' : '#555');
        el.innerHTML = msg || '';
    }

    window._jiraOpenIssueModal = async function (key) {
        var wrap = document.getElementById('jira-issue-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'jira-issue-modal';
            wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            document.body.appendChild(wrap);
        }
        wrap.innerHTML =
            '<div id="jira-issue-box" style="pointer-events:all; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);'
            + ' width:min(640px,94vw); max-height:88vh; background:#fff; box-shadow:0 8px 30px rgba(0,0,0,.3); border-radius:10px; overflow:hidden;'
            + ' display:flex; flex-direction:column;">'
            + '<div id="jira-issue-drag" style="padding:10px 14px; background:#fff4e0; border-bottom:1px solid #f0d090; color:#8b5a00;'
            + ' cursor:move; display:flex; align-items:center; gap:8px;">'
            + '<strong id="jira-issue-title" style="font-size:14px;">🪐 ' + esc(key) + '</strong>'
            + '<a id="jira-issue-openlink" target="_blank" rel="noopener" style="font-size:11px; color:#8b5a00;">' + T('JIRA에서 열기 ↗', 'Open in JIRA ↗') + '</a>'
            + '<span style="flex:1;"></span>'
            + '<button onclick="document.getElementById(\'jira-issue-modal\').style.display=\'none\'"'
            + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text);'
            + ' border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
            + '<div id="jira-issue-body" style="padding:14px 16px; flex:1; min-height:0; overflow-y:auto; font-size:12px;">'
            + '<div style="text-align:center; color:#999; padding:30px;">' + T('불러오는 중...', 'Loading...') + '</div>'
            + '</div></div>';
        wrap.style.display = 'block';
        if (window._makeDraggable) window._makeDraggable('jira-issue-box', 'jira-issue-drag');
        if (window._bindClickToFront) window._bindClickToFront('jira-issue-modal');
        if (window.bringModalToFront) window.bringModalToFront('jira-issue-modal');
        await window._jiraRenderIssueBody(key);
    };

    window._jiraRenderIssueBody = async function (key) {
        var body = document.getElementById('jira-issue-body');
        if (!body) return;
        var d;
        try {
            d = await fetchJson(BASE + '/jira/issue/' + encodeURIComponent(key));
        } catch (e) {
            body.innerHTML = '<div style="color:#a3281c; padding:20px;">⚠️ ' + esc(String(e && e.message || e)) + '</div>';
            return;
        }
        if (!d || d.ok === false) {
            body.innerHTML = '<div style="color:#a3281c; padding:20px;">⚠️ ' + esc((d && d.message) || T('조회 실패', 'Lookup failed')) + '</div>';
            return;
        }
        var issue = d.issue;
        _issueCache[key] = Object.assign({ src: (_issueCache[key] || {}).src || [] }, issue);
        var openLink = document.getElementById('jira-issue-openlink');
        if (openLink) openLink.href = issue.url || '#';

        var trRes;
        try { trRes = await fetchJson(BASE + '/jira/issue/' + encodeURIComponent(key) + '/transitions'); } catch (e) { trRes = { transitions: [] }; }
        var transitions = (trRes && trRes.transitions) || [];

        var prRes;
        try { prRes = await fetchJson(BASE + '/jira/priorities'); } catch (e) { prRes = { priorities: [] }; }
        var priorities = (prRes && prRes.priorities) || [];

        body.innerHTML =
            fieldRow(T('요약', 'Summary'), '<input id="jira-f-summary" style="' + inputSt + '" value="' + esc(issue.summary) + '">')
            + fieldRow(T('설명', 'Description'), '<textarea id="jira-f-description" rows="5" style="' + inputSt + ' resize:vertical; font-family:inherit;">' + esc(issue.description) + '</textarea>')
            + fieldRow(T('담당자', 'Assignee'), '<input id="jira-f-assignee" style="' + inputSt + '" value="' + esc(issue.assigneeName) + '" placeholder="' + T('JIRA 아이디(이름 아님)', 'JIRA username (not display name)') + '">')
            + fieldRow(T('우선순위', 'Priority'), '<select id="jira-f-priority" style="' + inputSt + '">'
                + priorities.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === issue.priorityId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('')
                + '</select>')
            + '<div style="display:flex; justify-content:flex-end; margin-bottom:12px;">'
            + '<button onclick="window._jiraSaveFields(\'' + esc(key) + '\')" style="' + btnSt + ' font-weight:bold;">💾 ' + T('필드 저장', 'Save fields') + '</button></div>'
            + '<div style="border-top:1px dashed #e5e5e5; margin:4px 0 12px;"></div>'
            + fieldRow(T('상태 전환', 'Transition'), (transitions.length
                ? ('<select id="jira-f-transition" style="' + inputSt + '">'
                    + transitions.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + (t.to ? (' → ' + esc(t.to)) : '') + '</option>'; }).join('')
                    + '</select><button onclick="window._jiraDoTransition(\'' + esc(key) + '\')" style="' + btnSt + ' margin-left:8px;">▶ ' + T('전환', 'Go') + '</button>')
                : ('<span style="color:#999;">(' + T('현재 상태: ', 'current: ') + esc(issue.status) + T(' — 전환 가능한 상태 없음)', ' — no transitions available)') + '</span>')))
            + '<div style="border-top:1px dashed #e5e5e5; margin:4px 0 12px;"></div>'
            + '<div style="font-weight:bold; color:#555; margin-bottom:6px;">💬 ' + T('댓글(대응)', 'Comments') + '</div>'
            + '<div id="jira-comments-list" style="max-height:160px; overflow-y:auto; border:1px solid #eee; border-radius:6px; padding:8px; margin-bottom:8px; background:#fafafa;">'
            + (issue.comments.length
                ? issue.comments.map(function (c) {
                    return '<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #e5e5e5;">'
                        + '<div style="font-size:11px; color:#888;">' + esc(c.author || '') + ' · ' + esc((c.created || '').slice(0, 16).replace('T', ' ')) + '</div>'
                        + '<div style="white-space:pre-wrap;">' + esc(c.body) + '</div></div>';
                }).join('')
                : '<div style="color:#aaa; text-align:center;">' + T('댓글 없음', 'No comments') + '</div>')
            + '</div>'
            + '<textarea id="jira-comment-input" rows="2" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:12px; resize:vertical;" placeholder="' + T('댓글을 입력하세요...', 'Write a comment...') + '"></textarea>'
            + '<div style="display:flex; justify-content:flex-end; margin-top:6px;">'
            + '<button onclick="window._jiraAddComment(\'' + esc(key) + '\')" style="' + btnSt + ' font-weight:bold;">📨 ' + T('댓글 등록', 'Post comment') + '</button></div>'
            + '<div id="jira-issue-status" style="display:none; font-size:11.5px; margin-top:8px; line-height:1.5;"></div>';
    };

    window._jiraSaveFields = async function (key) {
        var fields = {
            summary: document.getElementById('jira-f-summary').value,
            description: document.getElementById('jira-f-description').value
        };
        var assignee = (document.getElementById('jira-f-assignee').value || '').trim();
        if (assignee) fields.assignee = { name: assignee };
        var priorityId = document.getElementById('jira-f-priority').value;
        if (priorityId) fields.priority = { id: priorityId };
        modalSetStatus('⏳ ' + T('저장 중...', 'Saving...'), '');
        try {
            var d = await fetch(BASE + '/jira/issue/' + encodeURIComponent(key), {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: fields })
            }).then(function (r) { return r.json(); });
            if (!d || d.ok === false) { modalSetStatus('⚠️ ' + esc((d && d.message) || ''), 'err'); return; }
            modalSetStatus('✅ ' + T('저장했습니다.', 'Saved.'), 'ok');
            window._jiraRenderIssueBody(key);
            window._jiraRefresh();
        } catch (e) {
            modalSetStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
    };

    window._jiraDoTransition = async function (key) {
        var sel = document.getElementById('jira-f-transition');
        if (!sel || !sel.value) return;
        modalSetStatus('⏳ ' + T('전환 중...', 'Transitioning...'), '');
        try {
            var d = await fetch(BASE + '/jira/issue/' + encodeURIComponent(key) + '/transitions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transitionId: sel.value })
            }).then(function (r) { return r.json(); });
            if (!d || d.ok === false) { modalSetStatus('⚠️ ' + esc((d && d.message) || ''), 'err'); return; }
            modalSetStatus('✅ ' + T('전환했습니다.', 'Transitioned.'), 'ok');
            window._jiraRenderIssueBody(key);
            window._jiraRefresh();
        } catch (e) {
            modalSetStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
    };

    window._jiraAddComment = async function (key) {
        var ta = document.getElementById('jira-comment-input');
        var text = (ta && ta.value || '').trim();
        if (!text) return;
        modalSetStatus('⏳ ' + T('등록 중...', 'Posting...'), '');
        try {
            var d = await fetch(BASE + '/jira/issue/' + encodeURIComponent(key) + '/comment', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: text })
            }).then(function (r) { return r.json(); });
            if (!d || d.ok === false) { modalSetStatus('⚠️ ' + esc((d && d.message) || ''), 'err'); return; }
            modalSetStatus('✅ ' + T('등록했습니다.', 'Posted.'), 'ok');
            window._jiraRenderIssueBody(key);
        } catch (e) {
            modalSetStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
    };
})();
