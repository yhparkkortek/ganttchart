// ══════════════════════════════════════════════════════════════════════════
// 🪐 JIRA(Kortek Issue Tracker) 탭 — 2026-11-11 신규
// ──────────────────────────────────────────────────────────────────────────
// 목적: 지금 열린 간트 프로젝트와 관련된 JIRA 이슈를 한 화면에서 조회·댓글(대응)·
//       상태전환·필드수정(요약/담당자/우선순위)까지 한다. 실제 HTTP 호출은 백엔드
//       (/jira/*, jira_bridge.py)가 하고, 이 파일은 화면 + 연결(3가지) 수집만 한다.
//
// 연결은 4가지를 **모두 쓴다**(사용자 결정, 2026-11-11), 전부 지금 모델 기준(아래 2차 참고):
//   ① 수동 이슈 키  — tabData.jiraLinksByUnit[unit].manualKeys (쉼표 구분 입력)
//   ② 키워드 자동검색(JQL text~) — tabData.jiraLinksByUnit[unit].keyword (기본값: 모델명)
//   ③ 메일에서 이미 캡처된 이슈번호 — row._mailRaw.subject/body2000 정규식 스캔(저장 안 함,
//      매번 다시 스캔 — 메일 분석이 쌓일수록 자동으로 늘어난다, 모델 구분 없이 전체 스캔)
//   ④ JIRA 프로젝트 전체 — tabData.jiraLinksByUnit[unit].projectKey (코드 또는 이름으로 찾아
//      **key로 저장**, 2026-11-11 추가). 사용자 실측: JIRA 프로젝트는 "LNW>SHUFFLER 3.0"" 처럼
//      이름에 특수문자·따옴표가 섞여 있어 JQL `project = "그 이름"` 매칭이 깨지기 쉽다
//      (실측 400) → 이름은 **찾는 용도로만**, 저장/조회는 항상 key(`project = GABKJ`).
// 네 소스는 **따로 조회한다**(한 JQL로 OR 하지 않음) — 메일 스캔은 존재하지 않는 키를
// 주워올 수 있는데, JIRA의 `key in (...)`는 그중 하나라도 없으면 전체가 400으로 죽는다.
// 소스 하나가 깨져도 나머지는 멀쩡히 보여야 한다.
//
// 🧩 [2026-11-11 2차, 사용자 요청] 연결은 **제품구분자(모델)별**이다 — `tabData.jiraLinksByUnit
// [unitId]`. 한 간트 프로젝트에 모델이 여러 개(MVD/TPR/BTN…)면 모델마다 JIRA 프로젝트가 다를 수
// 있다(M.C Table·BOM·Customer SPEC과 같은 `window.mcActiveUnit` 전환을 그대로 쓴다 — 따로 두면
// "M.C는 TPR을 보는데 JIRA는 MVD" 같은 어긋남이 생긴다, js/43의 교훈 그대로). 헤더의 토글 바
// (#jira-unit-bar)로 전환하고, Summary 탭 모델 카드의 "JIRA 코드" 칸과 **같은 값을 공유**해
// 양방향 참조가 된다(한쪽이 아니라 같은 저장소를 읽고 쓰므로 "동기화 코드" 자체가 없다 — 아래
// _renderModelCardHtml/_syncProjectModelsFromDom 감싸기 참고).
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

    // ── 제품구분자(모델) — M.C/BOM/Customer SPEC과 같은 것을 공유 ──────────
    function jiraActiveUnit() {
        var units = window.getMcUnits ? window.getMcUnits() : [];
        var cur = window.mcActiveUnit || '';
        if (cur) return cur;
        return units.length ? units[0] : '';
    }

    function jiraLinksStore() {
        window.tabData = window.tabData || {};
        var store = window.tabData.jiraLinksByUnit;
        if (!store || typeof store !== 'object') store = {};
        window.tabData.jiraLinksByUnit = store;
        return store;
    }

    // ── 연결 설정 읽기/쓰기(지금 모델 기준) ───────────────────────────
    function links() {
        var store = jiraLinksStore();
        var unit = jiraActiveUnit();
        var l = store[unit];
        if (!l || typeof l !== 'object') l = { manualKeys: [], keyword: '', projectKey: '', projectName: '' };
        if (!Array.isArray(l.manualKeys)) l.manualKeys = [];
        if (typeof l.projectKey !== 'string') l.projectKey = '';
        if (typeof l.projectName !== 'string') l.projectName = '';
        store[unit] = l;
        return l;
    }

    function defaultKeyword() {
        // 모델이 여럿이면 **지금 모델의** 고객모델명을 우선한다(전체 프로젝트 값이 아니라) —
        // 그래야 "모델 갯수에 맞는 JIRA 검색"이 된다(사용자 요청, 2026-11-11).
        var unit = jiraActiveUnit();
        var models = (window.tabData && window.tabData.projectModels) || [];
        var mine = models.filter(function (m) { return (m.unitId || '') === unit; })[0];
        if (mine && mine.고객모델명) return mine.고객모델명;
        var pm = window.projectMeta || {};
        return pm.고객모델명 || pm.모델명 || pm.프로젝트명 || '';
    }

    // ── ③ 메일에서 이미 캡처된 이슈번호 스캔(저장하지 않음, 매번 다시) ──────
    //  ⚠️⚠️ [2026-11-11 실사용 제보] 정규식만으로는 전자부품 코드·사내 제품번호까지
    //  주워온다(실측: AR-1·CN-02·DFN-1610·KTK-101·WHC-1000·ACM2012-900 등 14건이 전부
    //  "존재하지 않는 이슈"로 실패해 경고 줄이 화면을 덮었다). 이 JIRA 인스턴스의 실제
    //  프로젝트 키는 전부 **순수 알파벳**(실측 GABKJ·GABJO·PAAEP 등, 숫자 없음)이고
    //  `validPrefixes`(list_projects로 받은 진짜 키 집합)에 없는 접두어는 **결정론으로
    //  버린다** — 규칙(CLAUDE.md "결정론 먼저")대로 추측 대신 실제 카탈로그와 대조한다.
    function mailScanKeys(validPrefixes) {
        var rows = window.globalData;
        if (!Array.isArray(rows)) return [];
        var re = /\b[A-Z]{2,10}-\d{1,6}\b/g;
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
                var prefix = k.split('-')[0];
                if (validPrefixes && !validPrefixes[prefix]) continue;   // 실제 JIRA 프로젝트가 아니면 버림
                if (!seen[k]) { seen[k] = true; found.push(k); }
            }
        }
        return found;
    }

    // 실제 프로젝트 키 집합(이름이 아니라 key로만 — 위 "4가지 동시 연결" 절 참고). 실패하면
    // null을 돌려줘서 호출부가 "걸러내지 않고 예전처럼" 동작하게 한다(로그인 전 등).
    async function validProjectPrefixes() {
        try {
            var d = await fetchJson(BASE + '/jira/projects');
            if (d && d.ok && Array.isArray(d.projects)) {
                var s = {};
                d.projects.forEach(function (p) { if (p.key) s[p.key] = true; });
                return s;
            }
        } catch (e) { /* 실패하면 거르지 않는다 */ }
        return null;
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
        // ⚠️ table-layout:fixed 가 없으면 th 의 width 는 힌트일 뿐이라 브라우저가 내용 기준으로
        //    다시 배분한다 — 그래서 '요약'은 안 넓어지고 '담당자/우선순위/수정일/출처'만 헐렁하게
        //    늘어나 보였다(실측). 폭 비율은 여기 한 곳(%, 합 100)에서만 바꾼다.
        var html = '<table class="concept-table" style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; font-size:12.5px;">'
            + '<thead><tr style="background:#eef6f7;">'
            + '<th style="padding:7px 8px; text-align:left; width:9%; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('키', 'Key') + '</th>'
            + '<th style="padding:7px 8px; text-align:left; width:38%; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('요약', 'Summary') + '</th>'
            + '<th style="padding:7px 8px; text-align:center; width:8%; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('상태', 'Status') + '</th>'
            + '<th style="padding:7px 8px; text-align:center; width:10%; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('담당자', 'Assignee') + '</th>'
            + '<th style="padding:7px 8px; text-align:center; width:8%; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('우선순위', 'Priority') + '</th>'
            + '<th style="padding:7px 8px; text-align:center; width:12%; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('수정일', 'Updated') + '</th>'
            + '<th style="padding:7px 8px; text-align:left; width:15%; background:#eef6f7; border-bottom:2px solid #cfe3e5;">' + T('출처', 'Source') + '</th>'
            + '</tr></thead><tbody>'
            + merged.map(function (it) {
                var c = statusColor(it.status);
                return '<tr onclick="window._jiraOpenIssueModal(\'' + esc(it.key) + '\')" style="cursor:pointer; border-bottom:1px solid #f0f0f0;" onmouseover="this.style.background=\'#fafcfc\'" onmouseout="this.style.background=\'\'">'
                    + '<td style="padding:7px 8px; font-weight:bold; color:#00707d; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(it.key) + '</td>'
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

    // ── 🏷 제품구분자 전환 바 ──────────────────────────────────────────
    //   M.C Table(#mc-unit-bar)·BOM(#bom-unit-bar)·Customer SPEC(#bs-unit-bar)과
    //   **같은 모양·같은 동작**이다 — 탭마다 다르게 생기면 같은 기능으로 안 보인다(js/43 교훈).
    window.jiraRenderUnitBar = function () {
        var bar = document.getElementById('jira-unit-bar');
        if (!bar) return;
        var units = window.getMcUnits ? window.getMcUnits() : [];
        if (!units.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        var cur = jiraActiveUnit() || units[0];
        bar.style.display = 'flex';
        bar.innerHTML = '<button class="unit-cycle-btn" onclick="window.jiraCycleUnit()" title="'
            + esc(T('클릭할 때마다 다음 모델로 전환', 'Click to switch to the next model')) + '"'
            + ' style="padding:6px 10px; min-width:auto; border:1px solid #00707d; border-radius:5px; cursor:pointer; font-size:12px; font-weight:bold; background:#00707d; color:#fff;">'
            + esc(cur) + '</button>';
    };

    window.jiraCycleUnit = function () {
        var units = window.getMcUnits ? window.getMcUnits() : [];
        if (units.length < 2) return;
        var i = units.indexOf(jiraActiveUnit());
        if (window.mcSwitchUnit) window.mcSwitchUnit(units[(i + 1) % units.length]);
    };

    // 다른 탭(M.C/BOM/Customer SPEC)에서 모델을 바꿔도, 지금 JIRA 탭을 보고 있으면 같이
    // 전환돼야 한다 — js/43이 populateTabData/mcSwitchUnit을 감싸는 것과 같은 방식.
    (function () {
        var orig = window.mcSwitchUnit;
        if (typeof orig !== 'function' || orig.__jiraWrapped) return;
        var fn = function () {
            var r = orig.apply(this, arguments);
            window.jiraRenderUnitBar();
            var panel = document.getElementById('tab-jira');
            if (panel && panel.classList.contains('active') && window._jiraOnTabShown) window._jiraOnTabShown();
            return r;
        };
        fn.__jiraWrapped = true;
        window.mcSwitchUnit = fn;
    })();

    // ── 탭 진입 시마다 다시 수집한다(메일 분석·설정이 그 사이 바뀌었을 수 있다) ──
    window._jiraOnTabShown = async function () {
        window.jiraRenderUnitBar();
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
        var validPrefixes = await validProjectPrefixes();
        var mailKeys = mailScanKeys(validPrefixes).filter(function (k) { return manualKeys.indexOf(k) === -1; });
        // ⚠️⚠️ [2026-11-11 사용자 제보] "키가 섞이고, JIRA 등록건이 없는데 키가 오매칭되어
        // 있음" — 메일 스캔은 모델 구분 없이 **전체 메일**을 훑으므로(헤더 주석 ③ 참고),
        // 모델이 여럿인 프로젝트에서는 **다른 모델의 JIRA 프로젝트 이슈까지** 전부 섞여
        // 나왔다(실측: TPR 탭에 아무 연결도 안 했는데 사실은 TVD 쪽 이슈인 GABJQ-4 가 보임).
        // → 모델이 둘 이상이면: ① 지금 모델에 프로젝트 코드가 있으면 **그 코드로 시작하는
        // 키만** 남기고 ② 아직 아무 프로젝트도 등록 안 했으면 **메일 추정 자체를 안 보여준다**
        // (어느 모델 것인지 알 길이 없는데 섞어 보여주는 것보다 "없음"이 정직하다). 모델이
        // 하나뿐인 프로젝트는 섞일 대상이 없으므로 그대로 전체를 쓴다.
        var _units = window.getMcUnits ? window.getMcUnits() : [];
        if (_units.length > 1) {
            var myKey = (L.projectKey || '').trim();
            mailKeys = myKey ? mailKeys.filter(function (k) { return k.split('-')[0] === myKey; }) : [];
        }
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
                + '<div id="jira-link-drag" style="padding:10px 14px; background:#eef6f7; border-bottom:1px solid #cfe3e5; color:#00707d;'
                + ' cursor:move; display:flex; align-items:center; gap:8px;">'
                + '<strong style="font-size:14px;">⚙️ ' + T('JIRA 연결 설정', 'JIRA link settings') + '</strong>'
                + '<span id="jira-link-unit-badge" style="font-size:11px; padding:1px 8px; border-radius:10px; background:#00707d; color:#fff; font-weight:bold;"></span>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="document.getElementById(\'jira-link-modal\').style.display=\'none\'"'
                + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text);'
                + ' border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div style="padding:14px 16px; flex:1; min-height:0; overflow-y:auto; font-size:12px;">'
                + '<div style="margin-bottom:10px; color:#777; line-height:1.5;">'
                + T('지금 모델(위 배지)과 연결할 JIRA 이슈를 네 가지 방법으로 모읍니다 — 같이 켜 둘 수 있고, 모델마다 따로 저장됩니다.', 'Collects linked JIRA issues for the current model (badge above) four ways — all can be on at once, saved separately per model.')
                + '</div>'
                + '<label style="display:block; margin-bottom:4px; color:#555;">📁 ' + T('JIRA 프로젝트(코드 또는 이름 — 그 프로젝트 전체 이슈)', 'JIRA project (code or name — all its issues)') + '</label>'
                + '<div style="display:flex; gap:6px; margin-bottom:4px;">'
                + '<input id="jira-link-project" style="flex:1; min-width:0; padding:7px 9px; border:1px solid #ccc; border-radius:6px; font-size:12px;" placeholder="' + T('예: GABKJ 또는 SHUFFLER', 'e.g. GABKJ or SHUFFLER') + '">'
                + '<button onclick="window._jiraSearchProject()"'
                + ' onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                + ' style="padding:7px 12px; border-radius:6px; font-size:12px; cursor:pointer; border:none; background:#e0f5f7; color:#00707d; transition:background .15s;">🔍 ' + T('찾기', 'Find') + '</button>'
                + '</div>'
                + '<div id="jira-link-project-hits" style="display:none; max-height:130px; overflow-y:auto; border:1px solid #eee; border-radius:6px; margin-bottom:10px;"></div>'
                + '<div style="border-top:1px dashed #e5e5e5; margin:4px 0 10px;"></div>'
                + '<label style="display:block; margin-bottom:4px; color:#555;">🔗 ' + T('수동 이슈 키 (쉼표로 구분, 예: GABKJ-1, GABKJ-5)', 'Manual issue keys (comma-separated, e.g. GABKJ-1, GABKJ-5)') + '</label>'
                + '<input id="jira-link-manual" style="width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #ccc; border-radius:6px; font-size:12px; margin-bottom:10px;">'
                + '<label style="display:block; margin-bottom:4px; color:#555;">🔍 ' + T('검색어(JQL text 검색, 비우면 모델명 사용)', 'Search keyword (JQL text search; blank uses the model name)') + '</label>'
                + '<input id="jira-link-keyword" style="width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid #ccc; border-radius:6px; font-size:12px; margin-bottom:6px;" placeholder="' + esc(defaultKeyword()) + '">'
                + '<div style="font-size:11px; color:#999; margin-bottom:10px;">📧 ' + T('메일에서 캡처된 이슈번호는 자동으로 같이 모읍니다(별도 입력 불필요) — 모델이 여럿이면 📁 프로젝트 코드를 등록해야 그 모델 것만 보입니다.', 'Issue numbers already captured from mail are collected automatically (no input needed) — with multiple models, set the 📁 project code so only this model\'s issues show.') + '</div>'
                + '<div id="jira-link-status" style="display:none; font-size:11.5px; margin-bottom:8px; line-height:1.5;"></div>'
                + '<div style="display:flex; justify-content:flex-end;">'
                + '<button onclick="window._jiraSaveLinkSettings()"'
                + ' onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                + ' style="padding:7px 14px; border-radius:6px; font-size:12px; cursor:pointer; border:none; background:#e0f5f7; color:#00707d; font-weight:bold; transition:background .15s;">💾 ' + T('저장', 'Save') + '</button>'
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
        var unitBadge = document.getElementById('jira-link-unit-badge');
        if (unitBadge) {
            var curUnit = jiraActiveUnit();
            unitBadge.textContent = curUnit || '';
            unitBadge.style.display = curUnit ? 'inline-block' : 'none';
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
        jiraLinksStore()[jiraActiveUnit()] = L;  // collectTabData가 건드리지 않는 키라 다시 얹어 둔다
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
    var btnSt = 'padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer; border:none; background:#e0f5f7; color:#00707d;';
    var btnHover = ' onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"';

    // 📎 [2026-11-11 사용자 제보] 댓글에 "첨부 파일 참조"라고 적혀 있는데 정작 파일이 안
    // 보였다 — JIRA는 첨부를 댓글이 아니라 **이슈**에 붙인다. 이미지는 썸네일로 미리 보여준다
    // (다운로드는 /jira/attachment 프록시 — 브라우저는 Basic Auth가 없어 직접 못 받는다).
    function humanSize(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1024 / 1024).toFixed(1) + ' MB';
    }

    function attachmentUrl(att) {
        return BASE + '/jira/attachment?url=' + encodeURIComponent(att.url) + '&name=' + encodeURIComponent(att.filename);
    }

    // 상세 모달을 다시 그릴 때마다 renderAttachments가 다시 채운다 — onclick에 이름을 그대로
    // 박으면 따옴표 섞인 파일명에서 깨지므로(JIRA 프로젝트 이름 사고와 같은 이유) 인덱스로 찾는다.
    var _attachList = [];

    function renderAttachments(list) {
        _attachList = list || [];
        if (!list || !list.length) return '';
        var items = list.map(function (a, i) {
            var href = attachmentUrl(a);
            var isImg = /^image\//.test(a.mimeType || '');
            var inner = isImg
                ? '<img src="' + esc(href) + '" alt="' + esc(a.filename) + '" style="width:90px; height:90px; object-fit:cover; border-radius:6px; display:block;">'
                : '<div style="width:90px; height:90px; display:flex; align-items:center; justify-content:center; font-size:30px; background:#f5f7f8; border-radius:6px;">📄</div>';
            var nameLine = '<span style="font-size:10.5px; color:#555; text-align:center; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(a.filename) + '</span>'
                + '<span style="font-size:10px; color:#aaa;">' + esc(humanSize(a.size)) + '</span>';
            var commonSt = 'display:flex; flex-direction:column; align-items:center; gap:3px; width:94px; text-decoration:none; cursor:pointer;';
            if (isImg) {
                // 🖼 이미지는 브라우저가 바로 보여줄 수 있다 — 그대로 새 탭.
                return '<a href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(a.filename) + ' (' + humanSize(a.size) + ')" style="' + commonSt + '">' + inner + nameLine + '</a>';
            }
            // 📄 [2026-11-12 사용자 요청] 그 외(엑셀 등)는 브라우저가 못 띄우니(결국 다운로드일 뿐)
            // **연결 프로그램으로 먼저** 연다 — 실패하면(Windows 아님 등) 내려받기로 돌아간다.
            return '<div onclick="window._jiraOpenAttachmentNative(' + i + ')" title="' + esc(a.filename) + ' (' + humanSize(a.size) + ') — '
                + esc(T('클릭하면 연결 프로그램으로 엽니다', 'Click to open with the associated app')) + '" style="' + commonSt + '">' + inner + nameLine + '</div>';
        }).join('');
        return '<div style="margin-bottom:12px;">'
            + '<div style="font-weight:bold; color:#555; margin-bottom:6px;">📎 ' + T('첨부파일', 'Attachments') + ' (' + list.length + ')</div>'
            + '<div style="display:flex; flex-wrap:wrap; gap:10px;">' + items + '</div>'
            + '</div>';
    }

    // 🖥️ [2026-11-12 사용자 요청] 첨부를 연결 프로그램으로 — NAS(`_dsOpenNative`)와 같은 역할이지만
    // JIRA 첨부는 로컬에 없어 백엔드가 먼저 받은 뒤 연다. 실패하면(Windows 아님·백엔드 오류)
    // 조용히 끝내지 않고 기존 다운로드 링크로 돌아간다(`_dsOpenNative`의 폴백과 같은 모양).
    window._jiraOpenAttachmentNative = async function (i) {
        var a = _attachList[i];
        if (!a) return;
        try {
            var d = await fetch(BASE + '/jira/attachment/open-native', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: a.url, name: a.filename })
            }).then(function (r) { return r.json(); });
            if (!d || d.ok === false) throw new Error((d && d.message) || T('실패', 'Failed'));
        } catch (e) {
            if (window.showToast) window.showToast('⚠️ ' + (e && e.message ? e.message : e) + ' — '
                + T('대신 내려받습니다', 'downloading instead'), 'warning');
            window.open(attachmentUrl(a), '_blank');
        }
    };

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
            + '<div id="jira-issue-drag" style="padding:10px 14px; background:#eef6f7; border-bottom:1px solid #cfe3e5; color:#00707d;'
            + ' cursor:move; display:flex; align-items:center; gap:8px;">'
            + '<strong id="jira-issue-title" style="font-size:14px;">🪐 ' + esc(key) + '</strong>'
            + '<a id="jira-issue-openlink" target="_blank" rel="noopener" style="font-size:11px; color:#00707d;">' + T('JIRA에서 열기 ↗', 'Open in JIRA ↗') + '</a>'
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
            + fieldRow(T('담당자', 'Assignee'), '<div style="flex:1; min-width:0;">'
                + '<div style="display:flex; gap:6px;">'
                + '<input id="jira-f-assignee" style="' + inputSt + '" value="' + esc(issue.assigneeName) + '" placeholder="' + T('JIRA 아이디(이름 아님)', 'JIRA username (not display name)') + '">'
                + '<button onclick="window._jiraSearchAssignee(\'' + esc(key) + '\')"' + btnHover + ' style="' + btnSt + '">🔍 ' + T('찾기', 'Find') + '</button>'
                + '</div>'
                + '<div id="jira-assignee-hits" style="display:none; max-height:130px; overflow-y:auto; border:1px solid #eee; border-radius:6px; margin-top:4px;"></div>'
                + '</div>')
            + fieldRow(T('우선순위', 'Priority'), '<select id="jira-f-priority" style="' + inputSt + '">'
                + priorities.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === issue.priorityId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('')
                + '</select>')
            + '<div style="display:flex; justify-content:flex-end; margin-bottom:12px;">'
            + '<button onclick="window._jiraSaveFields(\'' + esc(key) + '\')"' + btnHover + ' style="' + btnSt + ' font-weight:bold;">💾 ' + T('필드 저장', 'Save fields') + '</button></div>'
            + renderAttachments(issue.attachments)
            + '<div id="jira-attach-dropzone" style="border:1.5px dashed #a3d9e0; border-radius:6px; padding:9px 10px;'
            + ' text-align:center; background:#fafefe; font-size:11.5px; color:#789; cursor:pointer; margin-bottom:8px; transition:background .15s;">'
            + '📎 <span id="jira-attach-filename">' + T('파일을 여기로 끌어놓거나 클릭해서 고르세요', 'Drop a file here or click to choose') + '</span>'
            + '<input type="file" id="jira-attach-file" style="display:none;">'
            + '</div>'
            + '<div style="display:flex; justify-content:flex-end; margin-bottom:12px;">'
            + '<button onclick="window._jiraUploadAttachment(\'' + esc(key) + '\')"' + btnHover + ' style="' + btnSt + ' font-weight:bold;">⬆ ' + T('첨부 저장', 'Save attachment') + '</button>'
            + '</div>'
            + '<div style="border-top:1px dashed #e5e5e5; margin:4px 0 12px;"></div>'
            + fieldRow(T('상태 전환', 'Transition'), (transitions.length
                ? ('<select id="jira-f-transition" style="' + inputSt + '">'
                    + transitions.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + (t.to ? (' → ' + esc(t.to)) : '') + '</option>'; }).join('')
                    + '</select><button onclick="window._jiraDoTransition(\'' + esc(key) + '\')"' + btnHover + ' style="' + btnSt + ' margin-left:8px;">▶ ' + T('전환', 'Go') + '</button>')
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
            + '<button onclick="window._jiraAddComment(\'' + esc(key) + '\')"' + btnHover + ' style="' + btnSt + ' font-weight:bold;">📨 ' + T('댓글 등록', 'Post comment') + '</button></div>'
            + '<div id="jira-issue-status" style="display:none; font-size:11.5px; margin-top:8px; line-height:1.5;"></div>';

        // 모달 본문을 통째로 다시 그리므로(위 innerHTML) 위임 리스너도 매번 다시 건다.
        document.getElementById('jira-assignee-hits').addEventListener('click', function (e) {
            var el = e.target.closest('[data-idx]');
            if (!el) return;
            var u = _assigneeHits[Number(el.dataset.idx)];
            if (!u) return;
            var inp = document.getElementById('jira-f-assignee');
            inp.value = u.name;
            document.getElementById('jira-assignee-hits').style.display = 'none';
        });

        // 📎 [2026-11-12 사용자 요청] 첨부 고르기에도 드래그앤드롭 — 클릭하면 그대로 파일 고르기,
        // 끌어다 놓으면 그 파일이 선택된다(바로 올리지 않는다 — ⬆ 버튼으로 한 번 더 확인).
        var dz = document.getElementById('jira-attach-dropzone');
        var attFileEl = document.getElementById('jira-attach-file');
        var fnameEl = document.getElementById('jira-attach-filename');
        var defaultFnameMsg = T('파일을 여기로 끌어놓거나 클릭해서 고르세요', 'Drop a file here or click to choose');
        var paintFname = function () {
            var f = attFileEl.files && attFileEl.files[0];
            fnameEl.textContent = f ? f.name : defaultFnameMsg;
        };
        dz.addEventListener('click', function () { attFileEl.click(); });
        attFileEl.addEventListener('change', paintFname);
        dz.addEventListener('dragover', function (e) {
            e.preventDefault(); e.stopPropagation();   // ⚠️ 안 막으면 js/04f 전역 드롭(프로젝트 엑셀 열기)이 같이 돈다
            dz.style.background = '#e0f5f7';
        });
        dz.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); dz.style.background = '#fafefe'; });
        dz.addEventListener('drop', function (e) {
            e.preventDefault(); e.stopPropagation();
            dz.style.background = '#fafefe';
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                attFileEl.files = e.dataTransfer.files;
                paintFname();
            }
        });
    };

    // 👤 [2026-11-11 사용자 요청] 담당자 변경 확장 — 아이디를 몰라도 이름으로 찾는다.
    //  ⚠️ JIRA 자체 검색(query=)은 이 서버에서 조용히 무시된다(실측) — 전체를 받아
    //  **우리가 직접** 거른다(jira_bridge.assignable_users).
    var _assigneeHits = [];

    window._jiraSearchAssignee = async function (key) {
        var q = (document.getElementById('jira-f-assignee').value || '').trim();
        var box = document.getElementById('jira-assignee-hits');
        box.style.display = 'block';
        box.innerHTML = '<div style="padding:8px; color:#999;">' + T('찾는 중...', 'Searching...') + '</div>';
        try {
            var d = await fetchJson(BASE + '/jira/issue/' + encodeURIComponent(key) + '/assignable-users'
                + (q ? ('?q=' + encodeURIComponent(q)) : ''));
            if (!d || d.ok === false) { box.innerHTML = '<div style="padding:8px; color:#a3281c;">⚠️ ' + esc((d && d.message) || '') + '</div>'; return; }
            _assigneeHits = (d.users || []).slice(0, 50);
            if (!_assigneeHits.length) { box.innerHTML = '<div style="padding:8px; color:#999;">' + T('일치하는 사람이 없습니다.', 'No matching person.') + '</div>'; return; }
            box.innerHTML = _assigneeHits.map(function (u, i) {
                return '<div data-idx="' + i + '" style="padding:6px 8px; cursor:pointer; border-bottom:1px solid #f2f2f2;" onmouseover="this.style.background=\'#fafafa\'" onmouseout="this.style.background=\'\'"><b>' + esc(u.displayName) + '</b> <span style="color:#999;">(' + esc(u.name) + ')</span></div>';
            }).join('');
        } catch (e) {
            box.innerHTML = '<div style="padding:8px; color:#a3281c;">⚠️ ' + esc(String(e && e.message || e)) + '</div>';
        }
    };

    // 📎 [2026-11-11 사용자 요청] 첨부 저장 — 사람이 파일을 고르고 눌러야만 올라간다(AI 자율
    //  루프는 이 라우트를 아예 모른다, js/40에 미등록).
    window._jiraUploadAttachment = async function (key) {
        var fileEl = document.getElementById('jira-attach-file');
        var file = fileEl && fileEl.files && fileEl.files[0];
        if (!file) { modalSetStatus('⚠️ ' + T('올릴 파일을 선택해주세요.', 'Choose a file to upload.'), 'err'); return; }
        modalSetStatus('⏳ ' + T('올리는 중...', 'Uploading...'), '');
        try {
            var fd = new FormData();
            fd.append('file', file);
            var d = await fetch(BASE + '/jira/issue/' + encodeURIComponent(key) + '/attachment', {
                method: 'POST', body: fd
            }).then(function (r) { return r.json(); });
            if (!d || d.ok === false) { modalSetStatus('⚠️ ' + esc((d && d.message) || ''), 'err'); return; }
            modalSetStatus('✅ ' + T('첨부를 저장했습니다.', 'Attachment saved.'), 'ok');
            window._jiraRenderIssueBody(key);
        } catch (e) {
            modalSetStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
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

    // ══ 🔗 Summary 탭 모델 카드 ↔ JIRA 양방향 참조 (2026-11-11, 사용자 요청) ═══════
    //  js/22g를 직접 고치지 않고 **감싼다**(js/43이 populateTabData/mcSwitchUnit을 감싸는 것과
    //  같은 방식 — 이 파일만 빼면 예전 동작으로 돌아간다). 복사본을 만들지 않는다 — 두 화면이
    //  **같은 저장소**(tabData.jiraLinksByUnit[unitId].projectKey)를 그대로 읽고 쓰므로
    //  "동기화"할 코드 자체가 없다(한쪽에서 바꾸면 다른 쪽은 다음에 그릴 때 그 값을 본다).
    // ⚠️⚠️ [2026-11-11 사용자 정정] 첫 시도는 JIRA 코드를 **새 줄**로 맨 아래에 붙였는데,
    //  사용자가 원한 건 "프로젝트 코드" 자리를 **같은 줄에서** 4칸 → 6칸으로 늘려 그 옆에
    //  넣는 것이었다(첨부 스크린샷 — 고객모델명·프로젝트코드 다음 칸에 JIRA 코드가 나란히).
    //  그래서 끝에 덧붙이지 않고, 프로젝트 코드 칸 **바로 뒤·프로젝트 명칭 칸 바로 앞**에
    //  끼워 넣고 그리드를 4열→6열로 늘린다. 원본(js/22g) 문자열이 바뀌면(다른 버전) 그
    //  이정표를 못 찾을 수 있으니, 그때는 예전처럼 맨 끝에 붙이는 것으로 안전하게 물러난다.
    (function () {
        var orig = window._renderModelCardHtml;
        if (typeof orig !== 'function' || orig.__jiraWrapped) return;
        var GRID4 = 'grid-template-columns:140px 1fr 140px 1fr; padding:10px 12px;';
        var GRID6 = 'grid-template-columns:140px 1fr 140px 1fr 110px 1fr; padding:10px 12px;';
        var LBL = '<label style="font-size:12.5px; color:#666; border:1px solid #cfe3e5; border-radius:6px; padding:6px 8px; background:#fff; white-space:nowrap;">';
        var PROJNAME_ANCHOR = LBL + '프로젝트 명칭</label>';
        var fn = function (model, idx) {
            var html = orig(model, idx);
            var unit = model.unitId || '';
            var store = (window.tabData && window.tabData.jiraLinksByUnit) || {};
            var val = (store[unit] && store[unit].projectKey) || '';
            var field = LBL + '🪐 ' + T('JIRA 코드', 'JIRA code') + '</label>'
                + '<input type="text" class="u-input" data-jira-field="projectKey"'
                + ' title="' + esc(T('이 모델과 연결할 JIRA 프로젝트 코드 — JIRA 탭에서 찾아 저장할 수도 있습니다', 'JIRA project code linked to this model — can also be set from the JIRA tab')) + '"'
                + ' placeholder="' + T('예: GABKJ', 'e.g. GABKJ') + '" value="' + esc(val) + '">';
            if (html.indexOf(GRID4) !== -1 && html.indexOf(PROJNAME_ANCHOR) !== -1) {
                html = html.replace(GRID4, GRID6).replace(PROJNAME_ANCHOR, field + PROJNAME_ANCHOR);
            } else {
                var tail = '</div></div>';
                if (html.slice(-tail.length) === tail) html = html.slice(0, -tail.length) + field + tail;
            }
            return html;
        };
        fn.__jiraWrapped = true;
        window._renderModelCardHtml = fn;
    })();

    (function () {
        var orig = window._syncProjectModelsFromDom;
        if (typeof orig !== 'function' || orig.__jiraWrapped) return;
        var fn = function () {
            var out = orig.apply(this, arguments);
            document.querySelectorAll('.sum-model-card').forEach(function (card) {
                var input = card.querySelector('[data-jira-field="projectKey"]');
                if (!input) return;
                var unit = card.dataset.unitId || '';
                var val = (input.value || '').trim().toUpperCase();
                var store = jiraLinksStore();
                var L = store[unit] || { manualKeys: [], keyword: '', projectKey: '', projectName: '' };
                if (L.projectKey !== val) { L.projectKey = val; L.projectName = ''; }  // 코드가 바뀌면 옛 이름은 버린다(다음 조회가 다시 채운다)
                store[unit] = L;
            });
            return out;
        };
        fn.__jiraWrapped = true;
        window._syncProjectModelsFromDom = fn;
    })();
})();
