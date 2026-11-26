// ══════════════════════════════════════════════════════════════════════════
// 🪐 JIRA(Kortek Issue Tracker) 탭 — 2026-11-11 신규
// ──────────────────────────────────────────────────────────────────────────
// 목적: 지금 열린 간트 프로젝트와 관련된 JIRA 이슈를 한 화면에서 조회·댓글(대응)·
//       상태전환·필드수정(요약/담당자/우선순위)까지 한다. 실제 HTTP 호출은 백엔드
//       (/jira/*, jira_bridge.py)가 하고, 이 파일은 화면 + 연결(3가지) 수집만 한다.
//
// 연결은 4가지를 **모두 쓸 수 있다**, 전부 지금 모델 기준(아래 2차 참고):
//   ① 수동 이슈 키  — tabData.jiraLinksByUnit[unit].manualKeys (쉼표 구분 입력)
//   ② 키워드 자동검색(JQL text~) — tabData.jiraLinksByUnit[unit].keyword (기본값: 모델명)
//   ③ 메일에서 이미 캡처된 이슈번호 — row._mailRaw.subject/body2000 정규식 스캔(저장 안 함,
//      매번 다시 스캔 — 메일 분석이 쌓일수록 자동으로 늘어난다, 모델 구분 없이 전체 스캔)
//   ④ JIRA 프로젝트 전체 — tabData.jiraLinksByUnit[unit].projectKey (코드 또는 이름으로 찾아
//      **key로 저장**, 2026-11-11 추가). 사용자 실측: JIRA 프로젝트는 "LNW>SHUFFLER 3.0"" 처럼
//      이름에 특수문자·따옴표가 섞여 있어 JQL `project = "그 이름"` 매칭이 깨지기 쉽다
//      (실측 400) → 이름은 **찾는 용도로만**, 저장/조회는 항상 key(`project = GABKJ`).
// ⚠️⚠️ [2026-11-12 사용자 제보] 넷을 전부 자동으로 돌렸더니 모델끼리 이슈가 섞였다
// (검색어 JQL `text ~`가 모델명 숫자 하나 겹치는 **다른 프로젝트** 이슈까지 끌어왔다 — 실측:
// GABKJ를 연결했는데 GABKH·GABJO 이슈까지 표에 보임). → **자동은 ④(프로젝트 코드, 결정론)
// 하나뿐**이고, ①②③은 출처 열 머리글의 🔍(2026-11-24 전엔 표 아래 "🔍 더 찾기" 버튼)를 사람이 눌러야 돈다(CLAUDE.md "결정론
// 먼저" 그대로 — 느슨한 검색은 사람이 트리거할 때만). 네 소스는 **따로 조회한다**(한 JQL로
// OR 하지 않음) — 메일 스캔은 존재하지 않는 키를 주워올 수 있는데, JIRA의 `key in (...)`는
// 그중 하나라도 없으면 전체가 400으로 죽는다. 소스 하나가 깨져도 나머지는 멀쩡히 보여야 한다.
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
    var _lastRows = [];     // 지금 merge된 **원본**(필터 전) 목록 — 정렬·필터는 이걸 걸러서 다시 그린다
    var _lastNote = '';     // 그 원본을 만들 때 쌓인 경고/실패 메시지(아래 renderFilteredSortedTable 공용)
    var _byKey = {};        // 지금 merge 중인 결과(자동 + "더 찾기") — _jiraOnTabShown/_jiraPullExtraSources 공용
    var _notes = [];        // 그 과정에서 쌓인 경고/실패 메시지

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

    var SRC_LABELS = { manual: T('수동', 'manual'), mail: T('메일', 'mail'), keyword: T('검색', 'search'), project: T('프로젝트', 'project') };
    var SRC_ICONS = { manual: '🔗', mail: '📧', keyword: '🔍', project: '📁' };

    function srcChip(src) {
        return src.map(function (s) {
            return '<span style="' + window._uiBadgeStyle() + ' background:#f0f0f0; color:#777; margin-right:2px;">'
                + (SRC_ICONS[s] || '•') + ' ' + (SRC_LABELS[s] || s) + '</span>';
        }).join('');
    }

    // ── 🔽 헤더 정렬·필터 (2026-11-12 사용자 요청) ──────────────────────────
    //  열 머리글을 누르면 그 열 기준으로 정렬(오름/내림 토글), 🔽 아이콘을 누르면 필터
    //  🎨 [2026-11-24 "아이콘 통일"] 필터 표시는 🔽 가 아니라 ▾ — 🔽 는 앱 전체에서 '펼치기'이고, 이모지는 color 가
    //     안 먹어서 '필터 걸림(테마색)/안 걸림(회색)' 구분이 화면에 안 보였다. ▾ 는 글자라 색이 먹는다.
    //  팝업(체크박스 또는 포함검색)이 뜬다 — 전부 **클라이언트 사이드**: 지금 merge된
    //  `_lastRows`(원본, 필터 전)를 걸러서 다시 그릴 뿐 서버에 다시 묻지 않는다.
    // 🧮 [2026-11-24] 정렬·필터 상태를 **표마다** 따로 든다 — 이 탭의 연결 이슈 표(main)와
    //    🔍 전체 이슈 검색 표(search)가 **같은 코드**(머리글·필터 팝업·토글)를 쓴다. 표마다
    //    복사해 두면 한쪽만 고쳐진다. onclick 문자열은 마지막 인자로 표 이름을 싣는다.
    var _tables = {};       // 이름 -> { cols, byKey, filters, sortCol, sortDir, rows(), render() }
    function tblState(name) { return _tables[name || 'main']; }
    var _filterUnit = null; // 모델이 바뀔 때만 초기화(새로고침은 유지) — 아래 _jiraOnTabShown 참고

    var COLUMNS = [
        { key: 'key', label: T('키', 'Key'), type: 'text', get: function (it) { return it.key || ''; } },
        { key: 'summary', label: T('요약', 'Summary'), type: 'text', get: function (it) { return it.summary || ''; } },
        { key: 'status', label: T('상태', 'Status'), type: 'select', get: function (it) { return it.status || ''; } },
        { key: 'assignee', label: T('담당자', 'Assignee'), type: 'select', get: function (it) { return it.assignee || ''; } },
        // 🙋 [2026-11-24 사용자 요청] 이슈를 제기한 사람 — JIRA 화면과 같은 말 '보고자'(Reporter)
        { key: 'reporter', label: T('보고자', 'Reporter'), type: 'select', title: T('이슈를 제기한 사람', 'Who raised the issue'), get: function (it) { return it.reporter || ''; } },
        { key: 'priority', label: T('우선순위', 'Priority'), type: 'select', get: function (it) { return it.priority || ''; } },
        {
            key: 'meta', label: T('구성/해결/MS', 'Comp/Res/MS'), type: 'text',
            title: T('구성 요소 · 해결책 · Milestone', 'Components · Resolution · Milestone'),
            get: function (it) { return metaCellText(it); }
        },
        { key: 'updated', label: T('수정일', 'Updated'), type: 'date', get: function (it) { return it.updated || ''; } },
        {
            key: 'src', label: T('출처', 'Source'), type: 'select', multi: true,
            get: function (it) { return (it.src || []).map(function (s) { return SRC_LABELS[s] || s; }).join(', '); },
            getArray: function (it) { return it.src || []; },
            display: function (v) { return SRC_LABELS[v] || v; },
            // 🔍 [2026-11-24 사용자 요청] 표 아래 안내줄 대신 **출처 머리글의 돋보기 하나** — 설명은 말풍선으로.
            //    출처가 곧 "어떤 방법으로 연결됐나"라서 그 방법을 더 돌리는 버튼도 여기 있는 게 맞다.
            action: {
                icon: function () { return _extraBusy ? '⏳' : '🔍'; },
                onclick: 'window._jiraPullExtraSources()',
                title: function () { return extraSourcesTitle(); }
            }
        }
    ];
    var COLUMNS_BY_KEY = {};
    COLUMNS.forEach(function (c) { COLUMNS_BY_KEY[c.key] = c; });
    _tables.main = {
        cols: COLUMNS, byKey: COLUMNS_BY_KEY, filters: {}, sortCol: 'updated', sortDir: 'desc',
        rows: function () { return _lastRows; },
        render: function () { renderFilteredSortedTable(); }
    };

    function uniqueColumnValues(colKey, tbl) {
        var S = tblState(tbl);
        var col = S.byKey[colKey];
        var seen = {};
        var out = [];
        S.rows().forEach(function (it) {
            if (col.multi) {
                (col.getArray(it) || []).forEach(function (tag) { if (!seen[tag]) { seen[tag] = true; out.push(tag); } });
            } else {
                var v = (col.get(it) || '').toString();
                if (!seen[v]) { seen[v] = true; out.push(v); }
            }
        });
        out.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); });
        return out;
    }

    function passesColFilters(it, tbl) {
        var S = tblState(tbl);
        for (var i = 0; i < S.cols.length; i++) {
            var col = S.cols[i];
            var f = S.filters[col.key];
            if (!f) continue;
            if (col.type === 'text') {
                var val = (col.get(it) || '').toString().toLowerCase();
                if (val.indexOf(String(f).toLowerCase()) === -1) return false;
            } else if (col.multi) {
                var arr = col.getArray(it) || [];
                if (!arr.some(function (tag) { return f[tag]; })) return false;
            } else {
                var v = (col.get(it) || '').toString();
                if (!f[v]) return false;
            }
        }
        return true;
    }

    // 원본 행에 지금의 필터·정렬을 입힌 "보이는 행" — 표 그리기는 이것만 받는다.
    // sortCol 이 비어 있으면(null) **원래 순서 그대로**다(유사 이슈의 '비슷한 순' 같은 서버·코드
    // 순서를 사람이 머리글을 누르기 전까지는 흩뜨리지 않는다).
    function viewRows(tbl) {
        var S = tblState(tbl);
        // 🔍 [2026-11-24 사용자 요청] 표 전체 찾기 — 다른 페이지와 같은 규칙(js/04a: 낱말 AND·공백/기호 무시).
        //    낱말이 한 이슈의 서로 다른 열(키·요약·상태·담당자·보고자·구성…)에 있어도 걸린다.
        //    ⚠️ 서버를 다시 부르지 않는다 — 이미 받은 연결 이슈만 거른다(JIRA 전체는 헤더 🔍 전체 검색).
        var qToks = (S.q && window._searchTokens) ? window._searchTokens(S.q) : [];
        var view = S.rows().filter(function (it) {
            if (!passesColFilters(it, tbl)) return false;
            if (!qToks.length) return true;
            return window._searchMatchAll(S.cols.map(function (c) { return (c.get(it) || '').toString(); }).join(' \u0001 '), qToks);
        });
        var col = S.sortCol ? S.byKey[S.sortCol] : null;
        if (!col) return view;
        view.sort(function (a, b) {
            var cmp;
            if (col.type === 'number') cmp = (Number(col.get(a)) || 0) - (Number(col.get(b)) || 0);
            else cmp = (col.get(a) || '').toString().localeCompare((col.get(b) || '').toString(), undefined, { numeric: true, sensitivity: 'base' });
            return S.sortDir === 'asc' ? cmp : -cmp;
        });
        return view;
    }

    // merge 결과(_lastRows, 원본)에 지금의 필터·정렬을 입혀 다시 그린다 — 열 머리글
    // 클릭이나 필터 체크박스가 바뀔 때마다 이것만 부르면 된다(서버 재조회 없음).
    function renderFilteredSortedTable() {
        var v = viewRows('main');
        renderTable(v, _lastNote);
        findAfterRender(v.length);
    }

    // ─── 🔍 [2026-11-24] 연결 이슈 찾기칸 — 헤더(상태 글 뒤)에 런타임으로 꽂는다 ───
    function ensureFindBox() {
        if (document.getElementById('jira-find-input')) return;
        var anchor = document.getElementById('jira-tab-state');
        if (!anchor || !anchor.parentNode || !window._hdrFindWidget) return;
        // 🔍 [2026-11-24 "검색 UI 를 헤더로"] 칸 대신 🔍 버튼(js/22b) — 오른쪽 끝의 🔍(JIRA 전체 검색)와
        //    헷갈리지 않게 **상태 글 바로 뒤(왼쪽)**에 두고 말풍선으로 가른다.
        var w = window._hdrFindWidget({ inputId: 'jira-find-input', countId: 'jira-find-count', dates: true,
            ko: '🔍 연결 이슈에서 찾기', en: '🔍 Find in linked issues',
            titleKo: '연결 이슈에서 찾기 (받아 둔 목록만 — JIRA 전체는 오른쪽 🔍)', titleEn: 'Find in linked issues (loaded list only — whole JIRA: 🔍 on the right)',
            inputTitle: T('이미 불러온 연결 이슈만 거릅니다(여러 낱말 가능). JIRA 전체는 오른쪽 🔍 전체 검색.',
                          'Filters the linked issues already loaded (several words OK). Whole JIRA: 🔍 search on the right.') });
        anchor.parentNode.insertBefore(w.el, anchor.nextSibling);
        var inp = w.input;
        var t = null;
        inp.oninput = function () { clearTimeout(t); t = setTimeout(function () { _tables.main.q = inp.value; renderFilteredSortedTable(); }, 150); };
        inp.onkeydown = function (e) { if (e.key === 'Escape' && inp.value) { inp.value = ''; _tables.main.q = ''; renderFilteredSortedTable(); } };
    }
    function findAfterRender(nShown) {
        ensureFindBox();
        var toks = (_tables.main.q && window._searchTokens) ? window._searchTokens(_tables.main.q) : [];
        var c = document.getElementById('jira-find-count');
        if (c) c.textContent = toks.length ? (nShown + ' / ' + _lastRows.length + T('건', '')) : '';
        if (!toks.length) return;
        var box = document.getElementById('jira-table-wrap');
        if (!box) return;
        Array.prototype.forEach.call(box.querySelectorAll('tbody tr'), function (tr) {
            // 첫 칸은 No.(순번) — 숫자로 찾으면 순번이 같이 칠해지므로 뺀다
            Array.prototype.forEach.call(tr.cells, function (td, ci) {
                if (ci > 0 && td.textContent && window._searchMatchAny(td.textContent, toks)) td.classList.add('search-hit');
            });
        });
    }
    window._jiraFindInternals = { viewRows: viewRows, state: function () { return _tables.main; }, setRows: function (r) { _lastRows = r; } };

    // 날짜·숫자 열은 처음 누르면 큰 것(최근)부터, 글자 열은 가나다/ABC 순부터
    window._jiraSetSort = function (colKey, tbl) {
        var S = tblState(tbl);
        var col = S.byKey[colKey] || {};
        if (S.sortCol === colKey) { S.sortDir = (S.sortDir === 'asc') ? 'desc' : 'asc'; }
        else { S.sortCol = colKey; S.sortDir = (col.type === 'date' || col.type === 'number') ? 'desc' : 'asc'; }
        S.render();
    };

    function colFilterBox() {
        var box = document.getElementById('jira-colfilter-box');
        if (box) return box;
        box = document.createElement('div');
        box.id = 'jira-colfilter-box';
        // ⚠️ z-index 는 전체 검색 모달(9400)보다 위여야 한다 — 아래면 그 모달 표의 🔽 를 눌러도 팝업이 뒤에 숨는다
        box.style.cssText = 'position:fixed; z-index:100500; display:none; min-width:170px; max-width:260px; max-height:260px;'
            + ' overflow-y:auto; border:1px solid #ced4da; border-radius:8px; background:#fff; box-shadow:0 4px 12px rgba(0,0,0,.15);'
            + ' font-size:12px; padding:8px;';
        document.body.appendChild(box);
        document.addEventListener('click', function (e) {
            if (box.style.display === 'none') return;
            if (box.contains(e.target) || e.target.closest('[data-jira-filter-btn]')) return;
            box.style.display = 'none';
        });
        return box;
    }

    // onclick 문자열 안에 넣는 인자 — 열 키·표 이름은 영문 고정값이라 따옴표만 감싼다
    function qa(colKey, tbl) { return '\'' + colKey + '\', \'' + (tbl || 'main') + '\''; }

    function buildColFilterContent(colKey, tbl) {
        var S = tblState(tbl);
        var col = S.byKey[colKey];
        if (!col) return '';
        if (col.type === 'text') {
            var cur = S.filters[colKey] || '';
            return '<div style="margin-bottom:6px; color:#777;">' + esc(col.label) + ' (' + T('포함 검색', 'contains') + ')</div>'
                + '<input type="text" value="' + esc(cur) + '" oninput="window._jiraApplyTextFilter(' + qa(colKey, tbl) + ', this.value)"'
                + ' style="width:100%; box-sizing:border-box; padding:5px 7px; border:1px solid #ccc; border-radius:5px; font-size:12px;"'
                + ' placeholder="' + esc(T('검색어', 'search')) + '">'
                + (cur ? ('<div style="text-align:right; margin-top:6px;"><button onclick="window._jiraApplyTextFilter(' + qa(colKey, tbl) + ', \'\')"'
                    + ' style="border:none; background:none; color:#00707d; cursor:pointer; font-size:11px;">✕ ' + T('지우기', 'Clear') + '</button></div>') : '');
        }
        var values = uniqueColumnValues(colKey, tbl);
        var f = S.filters[colKey];
        var allChecked = !f;
        return '<div style="margin-bottom:6px; color:#777;">' + esc(col.label) + '</div>'
            + '<label style="display:flex; align-items:center; gap:6px; padding:3px 2px; border-bottom:1px solid #f0f0f0; margin-bottom:4px; cursor:pointer;">'
            + '<input type="checkbox"' + (allChecked ? ' checked' : '') + ' onchange="window._jiraToggleAllColFilter(' + qa(colKey, tbl) + ', this.checked)">'
            + '<b>' + T('전체', 'All') + '</b></label>'
            + values.map(function (v) {
                var checked = allChecked || !!(f && f[v]);
                var label = col.display ? col.display(v) : v;
                return '<label style="display:flex; align-items:center; gap:6px; padding:3px 2px; cursor:pointer;">'
                    + '<input type="checkbox" value="' + esc(v) + '"' + (checked ? ' checked' : '') + ' onchange="window._jiraToggleValueColFilter(' + qa(colKey, tbl) + ', this.value, this.checked)">'
                    + '<span>' + (label ? esc(label) : '<span style="color:#aaa;">(' + T('없음', 'none') + ')</span>') + '</span></label>';
            }).join('');
    }

    function refreshOpenFilterBox(colKey, tbl) {
        var box = document.getElementById('jira-colfilter-box');
        if (box && box.style.display !== 'none' && box.dataset.col === colKey && box.dataset.tbl === (tbl || 'main')) {
            box.innerHTML = buildColFilterContent(colKey, tbl);
        }
    }

    window._jiraToggleColFilter = function (el, colKey, tbl) {
        tbl = tbl || 'main';
        var box = colFilterBox();
        var already = box.style.display !== 'none' && box.dataset.col === colKey && box.dataset.tbl === tbl;
        box.style.display = 'none';
        if (already) { box.dataset.col = ''; return; }
        box.dataset.col = colKey;
        box.dataset.tbl = tbl;
        var r = el.getBoundingClientRect();
        box.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 270)) + 'px';
        box.style.top = (r.bottom + 4) + 'px';
        box.innerHTML = buildColFilterContent(colKey, tbl);
        box.style.display = 'block';
    };

    window._jiraApplyTextFilter = function (colKey, tbl, value) {
        var S = tblState(tbl);
        value = (value || '').trim();
        if (value) S.filters[colKey] = value; else delete S.filters[colKey];
        S.render();
        // ⚠️ 포함검색 칸은 다시 그리지 않는다 — 다시 그리면 치던 칸에서 포커스가 날아간다
        if (!value) refreshOpenFilterBox(colKey, tbl);
    };

    window._jiraToggleAllColFilter = function (colKey, tbl, checked) {
        var S = tblState(tbl);
        if (checked) delete S.filters[colKey];
        else S.filters[colKey] = {};
        S.render();
        refreshOpenFilterBox(colKey, tbl);
    };

    window._jiraToggleValueColFilter = function (colKey, tbl, value, checked) {
        var S = tblState(tbl);
        var values = uniqueColumnValues(colKey, tbl);
        var f = S.filters[colKey];
        if (!f) { f = {}; values.forEach(function (v) { f[v] = true; }); }
        if (checked) f[value] = true; else delete f[value];
        var allOn = values.length > 0 && values.every(function (v) { return f[v]; });
        if (allOn) delete S.filters[colKey]; else S.filters[colKey] = f;
        S.render();
        refreshOpenFilterBox(colKey, tbl);
    };

    window._jiraClearAllFilters = function (tbl) {
        var S = tblState(tbl);
        S.filters = {};
        if (!tbl || tbl === 'main') {   // 🔍 찾기칸도 같이 비운다 — 0건 안내의 '필터 초기화'가 그것까지 풀어야 빠져나온다
            S.q = '';
            var qi = document.getElementById('jira-find-input'); if (qi) qi.value = '';
        }
        S.render();
        var box = document.getElementById('jira-colfilter-box');
        if (box) box.style.display = 'none';
    };

    function sortArrow(colKey, tbl) {
        var S = tblState(tbl);
        if (S.sortCol !== colKey) return '';
        return window._uiSortMark(S.sortDir === 'asc');
    }

    function headerCell(colKey, widthPct, align, tbl) {
        var S = tblState(tbl);
        var col = S.byKey[colKey];
        var filterActive = !!S.filters[colKey];
        return '<th style="padding:6px 8px; text-align:center; width:' + widthPct + '%; background:#eef6f7; border-bottom:1px solid #cfe3e5; white-space:nowrap;"'
            + (col.title ? (' title="' + esc(col.title) + '"') : '') + '>'
            + '<span onclick="window._jiraSetSort(' + qa(colKey, tbl) + ')" style="cursor:pointer;" title="' + esc(T('클릭해서 정렬', 'Click to sort')) + '">'
            + esc(col.label) + sortArrow(colKey, tbl) + '</span>'
            + (col.noFilter ? '' : (' <span data-jira-filter-btn onclick="window._jiraToggleColFilter(this, ' + qa(colKey, tbl) + ')"'
                + ' style="cursor:pointer; font-size:13px; padding:0 3px; color:' + (filterActive ? '#00707d' : '#bbb') + ';" title="' + esc(T('필터', 'Filter')) + '">▾</span>'))
            + (col.action && (tbl || 'main') === 'main' ? (' <span data-jira-col-action onclick="event.stopPropagation();' + col.action.onclick + '"'
                + ' style="cursor:pointer; font-size:11px;" title="' + esc(col.action.title()) + '">' + col.action.icon() + '</span>') : '')
            + '</th>';
    }

    // "N개 열에 필터 적용 중 · 전체 해제" 띠 — 두 표가 같은 모양을 쓴다
    function filterBarHtml(tbl) {
        var n = Object.keys(tblState(tbl).filters).length;
        if (!n) return '';
        return '<div style="padding:5px 8px; font-size:11px; color:#00707d; background:#eef6f7; border-top:1px solid #cfe3e5; display:flex; align-items:center; gap:8px;">'
            + '▾ ' + esc(T(n + '개 열에 필터 적용 중', n + ' column filter(s) active'))
            + '<button onclick="window._jiraClearAllFilters(\'' + (tbl || 'main') + '\')" title="' + esc(T('필터 전체 해제', 'Clear all filters')) + '" style="' + window._uiBtnStyle('danger') + '">'
            + '↺ ' + T('전체 해제', 'Clear all') + '</button></div>';
    }

    function renderTable(merged, note) {
        var box = document.getElementById('jira-table-wrap');
        if (!box) return;
        var filterBar = filterBarHtml('main');
        if (!merged.length) {
            var emptyMsg;
            if (!note && _lastRows.length > 0) {
                // ⚠️ [2026-11-12 사용자 요청: 헤더 필터] 원본(_lastRows)엔 행이 있는데 필터링
                //    결과가 0건이면 "연결된 이슈가 없다"가 아니라 "필터에 다 걸렸다"가 맞는 말이다
                //    — 메시지를 구분하지 않으면 사람이 필터를 잊고 "이슈가 사라졌다"로 오인한다.
                emptyMsg = T('필터 조건에 맞는 이슈가 없습니다 — ', 'No issues match the current filters — ')
                    + '<button onclick="window._jiraClearAllFilters()" style="border:none; background:none; color:var(--ui-accent, #00707d); cursor:pointer; text-decoration:underline; font-size:12.5px;">'
                    + T('필터 초기화', 'clear filters') + '</button>';
            } else {
                emptyMsg = note || T('연결된 JIRA 이슈가 없습니다 — ⚙️ 연결 설정에서 키/검색어를 등록해주세요.',
                                     'No linked JIRA issues — register keys/keyword under ⚙️ Link settings.');
            }
            box.innerHTML = '<div style="padding:30px; text-align:center; color:#999; font-size:12.5px;">' + emptyMsg + '</div>' + filterBar;
            return;
        }
        // ⚠️ table-layout:fixed 가 없으면 th 의 width 는 힌트일 뿐이라 브라우저가 내용 기준으로
        //    다시 배분한다 — 그래서 '요약'은 안 넓어지고 '담당자/우선순위/수정일/출처'만 헐렁하게
        //    늘어나 보였다(실측). 폭 비율은 여기 한 곳(%, 합 100)에서만 바꾼다.
        // 📌 [2026-11-12 사용자 요청] 키 왼쪽에 No. 열 — 지금 정렬 기준 순번일 뿐이라 JIRA 자체
        //    값이 아니다(정렬 바뀌면 같이 바뀐다).
        // 📋 [2026-11-12 2차] 구성 요소·해결책·Milestone도 표에 열로 — 한 칸에 `metaCellText`로
        //    압축해 넣는다(세 칸으로 나누면 좁은 화면에서 공간을 너무 많이 먹는다).
        // 🔽 [2026-11-12 3차, 사용자 요청] 각 열 머리글에 정렬(클릭)·필터(🔽) — headerCell() 한
        //    곳에서 공통으로 그린다(COLUMNS 레지스트리, 위 "헤더 정렬·필터" 절). 정렬은 여기서
        //    다시 안 한다 — merged는 renderFilteredSortedTable이 이미 정렬해서 넘긴다.
        var html = '<table class="concept-table ui-hover-rows" style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; font-size:12.5px;">'
            + '<thead><tr style="background:#eef6f7;">'
            + '<th style="padding:6px 8px; text-align:center; width:4%; background:#eef6f7; border-bottom:1px solid #cfe3e5;">' + T('No.', 'No.') + '</th>'
            // ⚠️ [2026-11-24] 보고자 열을 넣으며 수정일을 10% 로 줄였더니 '2026-11-19 16:42' 가 두 줄로 접혀
            //    **모든 행 높이가 두 배**가 됐다(사용자 신고) — 수정일 11%·요약 28% 는 그대로(요약도 26% 면 긴 제목이 접힌다, 실측), 줄인 폭은 상태·담당자·구성·출처에서
            + headerCell('key', 7, 'left')
            + headerCell('summary', 28, 'left')
            + headerCell('status', 6, 'center')
            + headerCell('assignee', 7, 'center')
            + headerCell('reporter', 7, 'center')
            + headerCell('priority', 7, 'center')
            + headerCell('meta', 13, 'left')
            + headerCell('updated', 11, 'center')
            + headerCell('src', 10, 'left')
            + '</tr></thead><tbody>'
            + merged.map(function (it, i) {
                // 💬 [2026-11-26 사용자 요청] 긴 요약은 줄바꿈하지 않고(행 높이 그대로) 잘라서 말풍선(title)으로 — 전체 검색 표(td)와 같은 모양
                var td1 = 'padding:6px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
                var c = statusColor(it.status);
                var metaTxt = metaCellText(it);
                // 🦓 [2026-11-24] 다른 페이지와 같은 흰색 + 팔레트 제브라(tr 에 — hover 의 inline 색이 이기게)
                return '<tr' + (i % 2 ? ' class="jira-zebra-b"' : '') + ' onclick="window._jiraOpenIssueModal(\'' + esc(it.key) + '\')" style="cursor:pointer; border-bottom:1px solid #f0f0f0;">'
                    + '<td style="padding:6px 8px; text-align:center; font-size:11.5px; color:#888;">' + (i + 1) + '</td>'
                    + '<td style="padding:6px 8px; color:#00707d; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(it.key) + '</td>'
                    + '<td style="' + td1 + '" title="' + esc(it.summary) + '">' + esc(it.summary) + '</td>'
                    + '<td style="padding:6px 8px; text-align:center;"><span style="' + window._uiBadgeStyle() + ' background:' + c.bg + '; color:' + c.fg + ';">' + esc(it.status) + '</span></td>'
                    + '<td style="' + td1 + ' text-align:center;" title="' + esc(it.assignee || '') + '">' + esc(it.assignee || '—') + '</td>'
                    + '<td style="' + td1 + ' text-align:center;" title="' + esc(it.reporter || '') + '">' + esc(it.reporter || '—') + '</td>'
                    + '<td style="' + td1 + ' text-align:center;" title="' + esc(it.priority || '') + '">' + esc(it.priority || '—') + '</td>'
                    + '<td style="padding:6px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#555;" title="' + esc(metaTxt) + '">' + (metaTxt ? esc(metaTxt) : '—') + '</td>'
                    + '<td class="' + (window._dateDayCls ? window._dateDayCls(it.updated) : '') + '" style="padding:6px 8px; text-align:center; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc((it.updated || '').slice(0, 16).replace('T', ' ')) + '</td>'
                    + '<td style="' + td1 + '" title="' + esc((it.src || []).map(function (s) { return SRC_LABELS[s] || s; }).join(', ')) + '">' + srcChip(it.src) + '</td>'
                    + '</tr>';
            }).join('')
            + '</tbody></table>'
            + (note ? '<div style="padding:6px 8px; font-size:11px; color:#b06b00;">⚠️ ' + esc(note) + '</div>' : '')
            + filterBar;
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
            + ' style="padding:6px 10px; min-width:auto; border-radius:5px; cursor:pointer; font-size:12px; font-weight:bold;">'
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

    // ── 네 소스 조회 함수(모듈 스코프) — 자동(프로젝트 코드)·수동 버튼("더 찾기") 공용 ──
    async function pullKeysByTag(keys, tag) {
        if (!keys.length) return;
        try {
            var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent('key in (' + keys.join(',') + ') ORDER BY updated DESC') + '&maxResults=' + keys.length);
            if (!d || d.ok === false) { _notes.push((tag === 'mail' ? T('메일에서 찾은 키 조회 실패(존재하지 않는 키 포함 가능): ', 'Failed to look up mail-captured keys (may include nonexistent keys): ') : T('수동 키 조회 실패: ', 'Manual key lookup failed: ')) + (d && d.message)); return; }
            (d.issues || []).forEach(function (iss) {
                if (!_byKey[iss.key]) _byKey[iss.key] = Object.assign({ src: [] }, iss);
                if (_byKey[iss.key].src.indexOf(tag) === -1) _byKey[iss.key].src.push(tag);
            });
        } catch (e) { _notes.push(String(e && e.message || e)); }
    }
    async function pullKeyword(keyword) {
        if (!keyword) return;
        try {
            var safe = keyword.replace(/["\\]/g, '');
            var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent('text ~ "' + safe + '*" ORDER BY updated DESC') + '&maxResults=30');
            if (!d || d.ok === false) { _notes.push(T('검색어 조회 실패: ', 'Keyword search failed: ') + (d && d.message)); return; }
            (d.issues || []).forEach(function (iss) {
                if (!_byKey[iss.key]) _byKey[iss.key] = Object.assign({ src: [] }, iss);
                if (_byKey[iss.key].src.indexOf('keyword') === -1) _byKey[iss.key].src.push('keyword');
            });
        } catch (e) { _notes.push(String(e && e.message || e)); }
    }
    async function pullProject(L) {
        var pk = (L.projectKey || '').trim();
        if (!pk) return;
        try {
            // ⚠️ 이름이 아니라 **key로만** 조회한다 — 이름엔 특수문자·따옴표가 섞여
            //    JQL 매칭이 깨진다(위 헤더 주석, 실측 400).
            var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent('project = ' + pk + ' ORDER BY updated DESC') + '&maxResults=50');
            if (!d || d.ok === false) { _notes.push(T('프로젝트 조회 실패: ', 'Project lookup failed: ') + (d && d.message)); return; }
            (d.issues || []).forEach(function (iss) {
                if (!_byKey[iss.key]) _byKey[iss.key] = Object.assign({ src: [] }, iss);
                if (_byKey[iss.key].src.indexOf('project') === -1) _byKey[iss.key].src.push('project');
            });
        } catch (e) { _notes.push(String(e && e.message || e)); }
    }

    function renderMergedTable(L) {
        _lastRows = Object.keys(_byKey).map(function (k) { return _byKey[k]; });
        _lastNote = _notes.join(' / ');
        renderFilteredSortedTable();
    }

    // ── 🔍 "더 찾기"(수동 키·검색어·메일 추정) — 사람이 눌러야만 돈다 ─────────
    //  ⚠️⚠️ [2026-11-12 사용자 제보] 네 소스를 전부 자동으로 돌리니 키가 모델끼리 겹쳤다
    //  (검색어 JQL `text ~`가 모델명 숫자 하나 겹치는 다른 프로젝트 이슈까지 끌어왔다 — 실측
    //  화면에 GABKJ 프로젝트를 연결했는데 GABKH·GABJO 이슈까지 섞여 나왔다). → **결정론
    //  (프로젝트 코드, Summary 탭 "JIRA 코드"와 같은 저장소)만 자동으로 돌리고, 나머지
    //  (수동 키·검색어·메일 추정)는 사람이 이 버튼을 눌러야 돈다**(CLAUDE.md "결정론 먼저").
    var _extraBusy = false;
    // 출처 머리글 🔍 의 말풍선 — 무엇을 더 찾는지(지금 연결 설정 기준)와 왜 자동이 아닌지
    function extraSourcesTitle() {
        var L = links();
        var manualCount = (L.manualKeys || []).filter(function (k) { return KEY_RE.test(k); }).length;
        var keyword = (L.keyword || '').trim();
        return T('🔍 더 찾기 — 누르면 지금 조회합니다', '🔍 Search more — runs now') + '\n'
            + '· ' + (manualCount ? T('🔗 수동 키 ' + manualCount + '개', '🔗 ' + manualCount + ' manual key(s)') : T('🔗 수동 키 없음', '🔗 no manual keys')) + '\n'
            + '· ' + T('🔍 검색어 ', '🔍 keyword ') + (keyword ? '"' + keyword + '"' : T('(모델명 기본값)', '(default: model name)')) + '\n'
            + '· ' + T('📧 메일에서 찾은 이슈번호', '📧 issue numbers found in mail') + '\n'
            + T('자동으로는 📁 프로젝트 코드만 불러옵니다(검색어는 다른 프로젝트 이슈가 섞일 수 있어서).',
                'Only the 📁 project code loads automatically (keyword search can pull in other projects).');
    }

    window._jiraPullExtraSources = async function () {
        if (_extraBusy) return;
        _extraBusy = true;
        renderFilteredSortedTable();   // 머리글 🔍 → ⏳
        var L = links();
        var beforeCount = Object.keys(_byKey).length;
        // ⚠️ 중간에 무엇이 던져도 ⏳ 에 갇히지 않게(다시 누를 수 없게 된다) — 실패는 토스트로 드러낸다
        try {

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
        // 하나뿐인 프로젝트는 섞일 대상이 없으므로 그대로 전체를 쓴다. 버튼으로 돌려도 이
        // 가드는 그대로 유지한다.
        var _units = window.getMcUnits ? window.getMcUnits() : [];
        if (_units.length > 1) {
            var myKey = (L.projectKey || '').trim();
            mailKeys = myKey ? mailKeys.filter(function (k) { return k.split('-')[0] === myKey; }) : [];
        }
        var keyword = (L.keyword || '').trim();

        await pullKeysByTag(manualKeys, 'manual');
        await pullKeysByTag(mailKeys, 'mail');
        await pullKeyword(keyword);

        } catch (e) {
            _notes.push(String(e && e.message || e));
            if (window.showToast) window.showToast('⚠️ ' + T('더 찾기 실패: ', 'Search failed: ') + (e && e.message ? e.message : e), 'warning');
        } finally {
            _extraBusy = false;
        }
        Object.keys(_byKey).forEach(function (k) { _issueCache[k] = _byKey[k]; });
        var added = Object.keys(_byKey).length - beforeCount;
        renderMergedTable(L);
        if (window.showToast) window.showToast('🔍 ' + (added > 0 ? T(added + '건 더 찾았습니다.', 'Found ' + added + ' more.') : T('더 찾은 이슈가 없습니다.', 'Nothing more found.')), added > 0 ? 'success' : 'info');
    };

    // ── 탭 진입 시마다 다시 수집한다(메일 분석·설정이 그 사이 바뀌었을 수 있다) ──
    //  자동으로는 **프로젝트 코드만**(위 "더 찾기" 절 참고) — Summary 탭 "JIRA 코드" 입력칸과
    //  같은 저장소를 쓰므로, 거기서 코드를 넣고 저장하면 다음 탭 진입 때 바로 보인다.
    window._jiraOnTabShown = async function () {
        window.jiraRenderUnitBar();
        ensureFindBox();   // 🔍 헤더 찾기 버튼 — 로그인 전·조회 전에도 자리는 보이게(표가 그려질 때만 달면 안 보였다)
        var box = document.getElementById('jira-table-wrap');
        if (!box) return;
        box.innerHTML = '<div style="padding:30px; text-align:center; color:#999;">' + T('불러오는 중...', 'Loading...') + '</div>';
        setHeaderState('');

        // 🔽 [2026-11-12 사용자 요청] 정렬·필터는 **모델이 바뀔 때만** 초기화한다 — 단순
        // "🔄 새로고침"으로는 공들여 걸어 둔 필터가 날아가면 안 된다(모델 전환은 다른
        // 프로젝트를 보는 것이라 이전 필터가 의미 없어지는 경우가 많다).
        var curUnit = jiraActiveUnit();
        if (curUnit !== _filterUnit) {
            _tables.main.sortCol = 'updated'; _tables.main.sortDir = 'desc'; _tables.main.filters = {};
            _filterUnit = curUnit;
        }

        var gate = window._jiraEnsureLogin ? await window._jiraEnsureLogin(function (m) { setHeaderState('<span style="color:#888;">' + esc(m) + '</span>'); }) : { ok: true };
        if (!gate.ok) {
            setHeaderState('<span style="color:#b1432f;">🔒 ' + esc(gate.message || '') + '</span>');
            _lastRows = []; _lastNote = '';
            renderTable([], gate.message || T('JIRA에 로그인하지 못했습니다.', 'Could not sign in to JIRA.'));
            return;
        }
        setHeaderState('<span style="color:#1f7a3d;">✅ ' + T('연결됨', 'Connected') + '</span>');

        var L = links();
        _byKey = {};
        _notes = [];
        await pullProject(L);

        Object.keys(_byKey).forEach(function (k) { _issueCache[k] = _byKey[k]; });
        renderMergedTable(L);
    };

    window._jiraRefresh = function () { window._jiraOnTabShown(); };

    // ── 🔍 전체 이슈 검색 (2026-11-23 사용자 요청) ──────────────────────────
    //  "노이즈·벤트·외관불량·신뢰성 등으로 — 나의 프로젝트와 유사한 이슈/해결책이
    //  있었는지 찾고 싶다(DFMA 참고)." 지금 연결된 프로젝트와 **무관하게 JIRA 전체**를
    //  뒤진다 — `pullKeyword()`(위)와 같은 JQL(`text ~`)이지만 그건 "이 프로젝트에
    //  연결할 이슈 찾기"가 목적이라 결과가 현재 표(`_byKey`)에 섞여 들어간다. 이건
    //  목적이 다르다(참고용 전수 검색) — 결과를 표에 안 섞고 **별도 모달**에 보여준다.
    //  AI 0회(JIRA 서버 전문검색 그대로) — 결정론 먼저(CLAUDE.md), 새 백엔드 라우트도
    //  없다(기존 `/jira/search`).
    var _searchHits = [];
    var _searchTotal = 0;

    // 👥 [2026-11-24 사용자 요청] 개발팀 필터 — JIRA 에 **부서 그룹**이 있다(실측 `개발1팀`~`개발7팀`,
    //    `/rest/api/2/groups/picker`). 이슈의 '부서' 필드(customfield_10303·10400)는 **한 건도 안 쓰여**
    //    (실측 0건) 쓸 수 없고, 대신 **담당자 또는 보고자가 그 그룹 사람**인 이슈로 서버에서 거른다
    //    (`membersOf`). 그래서 50건 상한 안에서 거르는 게 아니라 **그 팀 것만 50건**이 온다.
    //    ⚠️ 그룹 이름은 JIRA 에 있는 그대로 — 없는 이름을 넣으면 JQL 이 통째로 실패한다.
    window.JIRA_SEARCH_POLICY = window.JIRA_SEARCH_POLICY || {
        teamGroups: ['개발1팀', '개발2팀', '개발3팀', '개발4팀', '개발5팀', '개발6팀', '개발7팀'],
        teamStoreKey: 'gantt_jira_search_team_v1',  // 마지막으로 고른 팀(다음에 열 때 그대로)
        // 🔍 [2026-11-24 사용자 요청] "이슈뿐 아니라 보고자·담당자·프로젝트… 가능한 모든 검색" — 검색 대상.
        //    'all' 은 글자 검색 + 그 이름의 사람(보고자·담당자) + 그 이름의 프로젝트를 **OR** 로 한 번에.
        fields: [
            { id: 'all', label: '🔍 전체', labelEn: '🔍 Everything' },
            { id: 'text', label: '📝 내용(요약·설명·댓글)', labelEn: '📝 Text (summary/description/comments)' },
            { id: 'summary', label: '📌 요약만', labelEn: '📌 Summary only' },
            { id: 'reporter', label: '🙋 보고자', labelEn: '🙋 Reporter' },
            { id: 'assignee', label: '🧑‍🔧 담당자', labelEn: '🧑‍🔧 Assignee' },
            { id: 'person', label: '👤 사람(보고자·담당자)', labelEn: '👤 Person (reporter/assignee)' },
            { id: 'project', label: '📁 프로젝트(코드·이름)', labelEn: '📁 Project (key/name)' }
        ],
        fieldStoreKey: 'gantt_jira_search_field_v1',
        maxUsers: 30,       // 이름으로 찾은 사람을 JQL 에 넣는 상한('박' → 8명 실측)
        maxProjects: 40     // 이름·코드로 찾은 프로젝트를 JQL 에 넣는 상한(604개 중)
    };
    if (window.STORAGE_REGISTRY && !window.STORAGE_REGISTRY.some(function (r) { return r.key === window.JIRA_SEARCH_POLICY.teamStoreKey; })) {
        window.STORAGE_REGISTRY.push({ key: window.JIRA_SEARCH_POLICY.teamStoreKey, label: 'JIRA 전체 검색 — 마지막으로 고른 개발팀',
            labelEn: 'JIRA search — last chosen team', cls: 'cache', strategy: { type: 'drop' } });
    }
    if (window.STORAGE_REGISTRY && !window.STORAGE_REGISTRY.some(function (r) { return r.key === window.JIRA_SEARCH_POLICY.fieldStoreKey; })) {
        window.STORAGE_REGISTRY.push({ key: window.JIRA_SEARCH_POLICY.fieldStoreKey, label: 'JIRA 전체 검색 — 마지막으로 고른 검색 대상',
            labelEn: 'JIRA search — last chosen search field', cls: 'cache', strategy: { type: 'drop' } });
    }
    function searchTeam() {
        var el = document.getElementById('jira-search-team');
        if (el) return el.value || '';
        try { return localStorage.getItem(window.JIRA_SEARCH_POLICY.teamStoreKey) || ''; } catch (e) { return ''; }
    }
    function searchField() {
        var el = document.getElementById('jira-search-field');
        if (el) return el.value || 'all';
        try { return localStorage.getItem(window.JIRA_SEARCH_POLICY.fieldStoreKey) || 'all'; } catch (e) { return 'all'; }
    }
    window._jiraSearchFieldChanged = function () {
        try { localStorage.setItem(window.JIRA_SEARCH_POLICY.fieldStoreKey, searchField()); } catch (e) { /* 기억 못 해도 검색은 된다 */ }
        var q = ((document.getElementById('jira-search-q') || {}).value || '').trim();
        if (q && _searchMode !== 'similar') return window._jiraSearchRun();
    };
    function jqlStr(v) { return '"' + String(v).replace(/["\\]/g, '') + '"'; }

    // 이름 일부 → JIRA 아이디 목록. ⚠️ 백엔드가 재시작 전이면 `/jira/users` 가 없다(404) — 그때는
    //    적은 글자를 **전체 이름**으로 그대로 쓴다(JQL 은 표시 이름도 받는다 — `assignee = "박용훈"` 실측
    //    106건). 그러면 '박' 같은 일부로는 못 찾으니 그 사실을 안내에 적는다.
    async function findUsers(q) {
        try {
            var d = await fetchJson(BASE + '/jira/users?q=' + encodeURIComponent(q));
            if (d && d.ok !== false && Array.isArray(d.users)) {
                return { ids: d.users.slice(0, window.JIRA_SEARCH_POLICY.maxUsers).map(function (u) { return u.name; }),
                         names: d.users.map(function (u) { return u.displayName + '(' + u.name + ')'; }), total: d.users.length };
            }
        } catch (e) { /* 아래 폴백 */ }
        return { ids: [q], names: [q], total: 1, fallback: true };
    }
    async function findProjects(q) {
        try {
            var d = await fetchJson(BASE + '/jira/projects?q=' + encodeURIComponent(q));
            if (d && d.ok !== false && Array.isArray(d.projects)) {
                return { keys: d.projects.slice(0, window.JIRA_SEARCH_POLICY.maxProjects).map(function (p) { return p.key; }), total: d.projects.length };
            }
        } catch (e) { /* 프로젝트를 못 찾으면 그 조건만 뺀다 */ }
        return { keys: [], total: 0 };
    }

    // 검색 대상 + 검색어 → { jql(조건 부분), note(무엇으로 찾았는지) } — 조건이 하나도 안 서면 jql=''.
    //    "어떤 사람·프로젝트로 찾았는지"를 숨기지 않는다 — '박' 이 8명에 걸렸다는 걸 모르면 결과를 오해한다.
    async function buildSearchClause(field, q) {
        var safe = q.replace(/["\\]/g, '');
        var parts = [], notes = [];
        var wantText = field === 'all' || field === 'text';
        var wantPeople = field === 'all' || field === 'reporter' || field === 'assignee' || field === 'person';
        var wantProj = field === 'all' || field === 'project';
        if (wantText) parts.push('text ~ "' + safe + '*"');
        if (field === 'summary') parts.push('summary ~ "' + safe + '*"');
        var tasks = [];
        if (wantPeople) tasks.push(findUsers(q).then(function (u) {
            if (!u.ids.length) { if (field !== 'all') notes.push(T('👤 "' + q + '" 인 사람을 못 찾았습니다', '👤 No user matches "' + q + '"')); return; }
            var list = '(' + u.ids.map(jqlStr).join(', ') + ')';
            if (field === 'reporter') parts.push('reporter in ' + list);
            else if (field === 'assignee') parts.push('assignee in ' + list);
            else parts.push('reporter in ' + list, 'assignee in ' + list);
            // '전체' 에서 폴백이면 검색어가 사람 이름인지조차 모른다 — "깨짐을 이름으로 찾음" 은 소음이라 안 적는다
            if (u.fallback && field === 'all') return;
            notes.push('👤 ' + (u.fallback
                ? T('"' + q + '" 을(를) 전체 이름으로 찾음 — 이름 일부로 찾으려면 백엔드 재시작 필요', '"' + q + '" as a full name — restart the backend to search by part of a name')
                : T('찾은 사람 ' + u.total + '명: ', u.total + ' user(s): ') + u.names.slice(0, 6).join(', ') + (u.total > 6 ? ' …' : '')
                  + (u.total > u.ids.length ? T(' (앞 ' + u.ids.length + '명만)', ' (first ' + u.ids.length + ')') : '')));
        }));
        if (wantProj) tasks.push(findProjects(q).then(function (p) {
            if (!p.keys.length) { if (field !== 'all') notes.push(T('📁 "' + q + '" 인 프로젝트를 못 찾았습니다', '📁 No project matches "' + q + '"')); return; }
            parts.push('project in (' + p.keys.join(', ') + ')');
            notes.push('📁 ' + T('프로젝트 ' + p.total + '개', p.total + ' project(s)')
                + (p.total > p.keys.length ? T(' (앞 ' + p.keys.length + '개만)', ' (first ' + p.keys.length + ')') : '')
                + (p.keys.length <= 5 ? ': ' + p.keys.join(', ') : ''));
        }));
        await Promise.all(tasks);
        return { jql: parts.length ? '(' + parts.join(' OR ') + ')' : '', note: notes.join(' · ') };
    }
    var _searchNote = '';

    function teamClause() {
        var t = searchTeam().replace(/["\\]/g, '');
        return t ? ' AND (assignee in membersOf("' + t + '") OR reporter in membersOf("' + t + '"))' : '';
    }
    window._jiraSearchTeamChanged = function () {
        try { localStorage.setItem(window.JIRA_SEARCH_POLICY.teamStoreKey, searchTeam()); } catch (e) { /* 기억 못 해도 검색은 된다 */ }
        if (_searchMode === 'similar' && _simBase) return window._jiraSimRun();
        var q = ((document.getElementById('jira-search-q') || {}).value || '').trim();
        if (q) return window._jiraSearchRun();
    };

    // 🔽 [2026-11-24 사용자 요청] 검색 표도 머리글 정렬(오름/내림)·필터 — 연결 이슈 표와 **같은 코드**
    //    (_tables 위 "헤더 정렬·필터" 절). 처음엔 sortCol 이 비어 있어 **받은 순서 그대로**(유사 이슈는
    //    '비슷한 순')이고, 사람이 머리글을 누를 때부터 바뀐다.
    var SEARCH_COLUMNS = [
        { key: 'match', label: T('일치', 'Match'), type: 'number', noFilter: true,
          title: T('요약에 걸린 검색어 묶음 수', 'Number of term groups found in the summary'),
          get: function (it) { return (it._sim && it._sim.score) || 0; } },
        { key: 'project', label: T('프로젝트', 'Project'), type: 'select', get: function (it) { return (it.key || '').split('-')[0]; } },
        { key: 'key', label: T('키', 'Key'), type: 'text', get: function (it) { return it.key || ''; } },
        { key: 'summary', label: T('요약', 'Summary'), type: 'text', get: function (it) { return it.summary || ''; } },
        { key: 'status', label: T('상태', 'Status'), type: 'select', get: function (it) { return it.status || ''; } },
        { key: 'resolution', label: T('해결책', 'Resolution'), type: 'select', get: function (it) { return it.resolution || ''; } },
        { key: 'assignee', label: T('담당자', 'Assignee'), type: 'select', get: function (it) { return it.assignee || ''; } },
        // 🙋 [2026-11-24 사용자 요청] 이슈를 제기한 사람 — JIRA 화면과 같은 말 '보고자'(Reporter)
        { key: 'reporter', label: T('보고자', 'Reporter'), type: 'select', title: T('이슈를 제기한 사람', 'Who raised the issue'), get: function (it) { return it.reporter || ''; } },
        { key: 'updated', label: T('수정일', 'Updated'), type: 'date', get: function (it) { return it.updated || ''; } }
    ];
    var SEARCH_COLUMNS_BY_KEY = {};
    SEARCH_COLUMNS.forEach(function (c) { SEARCH_COLUMNS_BY_KEY[c.key] = c; });
    _tables.search = {
        cols: SEARCH_COLUMNS, byKey: SEARCH_COLUMNS_BY_KEY, filters: {}, sortCol: null, sortDir: 'desc',
        rows: function () { return _searchHits; },
        render: function () { _jiraRenderSearchResults(_searchTotal); }
    };
    // 새 검색을 하면 필터·정렬을 비운다 — 앞 검색의 담당자·프로젝트 값으로 거른 채 두면 새 결과가 통째로 안 보인다
    function resetSearchView() { _tables.search.filters = {}; _tables.search.sortCol = null; _tables.search.sortDir = 'desc'; }

    window._jiraOpenSearchModal = function () {
        var wrap = document.getElementById('jira-search-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'jira-search-modal';
            wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            document.body.appendChild(wrap);
        }
        var P = window.JIRA_SEARCH_POLICY;
        var curTeam = searchTeam();
        var teamSel = '<select id="jira-search-team" onchange="window._jiraSearchTeamChanged()"'
            + ' title="' + T('담당자 또는 보고자가 그 팀(JIRA 그룹)인 이슈만', 'Only issues whose assignee or reporter is in that team (JIRA group)') + '"'
            + ' style="' + inputSt + ' flex:0 0 auto; width:auto;">'
            + '<option value="">👥 ' + T('전체 팀', 'All teams') + '</option>'
            + P.teamGroups.map(function (g) { return '<option value="' + esc(g) + '"' + (g === curTeam ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('')
            + '</select>';
        var curField = searchField();
        var fieldSel = '<select id="jira-search-field" onchange="window._jiraSearchFieldChanged()"'
            + ' title="' + T('무엇으로 찾을지 — 전체는 글자·사람·프로젝트를 한 번에', 'What to search — Everything = text, people and projects at once') + '"'
            + ' style="' + inputSt + ' flex:0 0 auto; width:auto;">'
            + P.fields.map(function (f) { return '<option value="' + f.id + '"' + (f.id === curField ? ' selected' : '') + '>' + esc(T(f.label, f.labelEn)) + '</option>'; }).join('')
            + '</select>';
        // ⚠️ 표가 상자 밖으로 넘치지 않게 — 상자는 `height` 로 잡고(크기 기억이 height 를 다시 줄 수 있다)
        //    본문만 스크롤한다. flex 자식은 기본 min-height:auto 라 **min-height:0 이 없으면 안 줄어든다**
        //    (docs/modal-ux.md "섹션을 더하면 모달이 조용히 잘린다"와 같은 함정).
        wrap.innerHTML =
            '<div id="jira-search-box" style="pointer-events:all; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);'
            + ' width:min(860px,94vw); height:min(760px,88vh); max-height:94vh; background:#fff; box-shadow:0 8px 30px rgba(0,0,0,.3); border-radius:10px; overflow:hidden;'
            + ' display:flex; flex-direction:column;">'
            + '<div id="jira-search-drag" style="flex:0 0 auto; padding:13px 18px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; border-radius:10px 10px 0 0;'
            + ' cursor:grab; display:flex; align-items:center; gap:8px;">'
            + '<strong style="font-size:14px;">🔍 ' + T('전체 이슈 검색', 'Search all issues') + '</strong>'
            + '<span style="flex:1;"></span>'
            + '<button onclick="document.getElementById(\'jira-search-modal\').style.display=\'none\'"'
            + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text);'
            + ' border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
            + '<div style="flex:0 0 auto; padding:12px 14px 6px;">'
            + '<div style="font-size:11px; color:#888; margin-bottom:6px;">' + T('지금 연결된 프로젝트와 상관없이 JIRA 전체에서 찾습니다 — 예: 노이즈, 번들림, 외관불량, 신뢰성 · 이슈 키(예: GABJO-2)를 넣으면 그 이슈와 비슷한 이슈를 찾습니다', 'Searches across all of JIRA, not just the linked project — e.g. noise, warping, cosmetic defect, reliability · enter an issue key (e.g. GABJO-2) to find issues similar to it') + '</div>'
            + '<div style="display:flex; gap:6px;">'
            + teamSel
            + fieldSel
            + '<input id="jira-search-q" placeholder="' + T('검색어 · 이름 · 프로젝트 · 이슈 키', 'Term · name · project · issue key') + '" style="' + inputSt + ' min-width:0;" onkeydown="if(event.key===\'Enter\')window._jiraSearchRun()">'
            + '<button onclick="window._jiraSearchRun()"' + btnHover + ' style="' + btnSt + ' font-weight:bold; flex-shrink:0;">🔍 ' + T('검색', 'Search') + '</button>'
            + '</div></div>'
            + '<div id="jira-search-sim" style="flex:0 0 auto; display:none; padding:0 14px 6px;"></div>'
            + '<div id="jira-search-body" style="padding:0 14px 14px; flex:1 1 auto; min-height:0; overflow:auto; font-size:12px;"></div>'
            + '</div>';
        wrap.style.display = 'block';
        if (window._makeDraggable) window._makeDraggable('jira-search-box', 'jira-search-drag');
        if (window._bindClickToFront) window._bindClickToFront('jira-search-modal');
        if (window.bringModalToFront) window.bringModalToFront('jira-search-modal');
        var qEl = document.getElementById('jira-search-q');
        if (qEl) qEl.focus();
    };

    // ⚠️ `safe`는 pullKeyword()와 같은 이스케이프(따옴표·역슬래시 제거) — JQL 문자열 안에
    //    그대로 들어가므로 안 지우면 검색 자체가 깨진다(JQL 파싱 오류).
    window._jiraSearchRun = async function () {
        var box = document.getElementById('jira-search-body');
        var qInp = document.getElementById('jira-search-q');
        var q = ((qInp && qInp.value) || '').trim();
        if (!q) { box.innerHTML = ''; return; }
        // 이슈 키를 넣었으면 "그 이슈와 비슷한 것" 찾기로 넘긴다(아래 유사 이슈 절)
        if (KEY_RE.test(q.toUpperCase())) { return window._jiraFindSimilar(q.toUpperCase()); }
        _searchMode = 'text';
        resetSearchView();
        var simBox = document.getElementById('jira-search-sim');
        if (simBox) { simBox.style.display = 'none'; simBox.innerHTML = ''; }
        box.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">' + T('검색 중...', 'Searching...') + '</div>';
        try {
            var built = await buildSearchClause(searchField(), q);
            _searchNote = built.note;
            if (!built.jql) {
                _searchHits = []; _searchTotal = 0;
                box.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">' + esc(built.note || T('찾을 조건이 없습니다.', 'Nothing to search.')) + '</div>';
                return;
            }
            var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent(built.jql + teamClause() + ' ORDER BY updated DESC') + '&maxResults=50');
            if (!d || d.ok === false) { box.innerHTML = '<div style="color:#a3281c; padding:16px;">⚠️ ' + esc((d && d.message) || T('검색 실패', 'Search failed')) + '</div>'; return; }
            _searchHits = d.issues || [];
            _searchTotal = d.total || _searchHits.length;
            _jiraRenderSearchResults(_searchTotal);
        } catch (e) {
            box.innerHTML = '<div style="color:#a3281c; padding:16px;">⚠️ ' + esc(String(e && e.message || e)) + '</div>';
        }
    };

    function _jiraRenderSearchResults(total) {
        var box = document.getElementById('jira-search-body');
        if (!box) return;
        var team = searchTeam();
        var teamNote = team ? ' · 👥 ' + T(team + ' 담당·보고 이슈만', 'only ' + team + ' assignee/reporter') : '';
        if (!_searchHits.length) { box.innerHTML = '<div style="padding:24px 10px; text-align:center; color:#999; font-size:12.5px;">' + T('일치하는 이슈가 없습니다.', 'No matching issues.') + esc(teamNote) + '</div>'; return; }
        // 결과가 상한(50)에 걸렸으면 "전부"가 아니라는 걸 숨기지 않는다 — 검색어를 좁혀야
        // 더 보인다는 안내까지(CLAUDE.md "끊었으면 끊었다는 사실을 드러낼 것").
        var countNote = total > _searchHits.length
            ? T(total + '건 중 ' + _searchHits.length + '건 표시 — 검색어를 더 좁혀보세요', 'Showing ' + _searchHits.length + ' of ' + total + ' — try narrowing the search term')
            : T(_searchHits.length + '건', _searchHits.length + ' result(s)');
        var view = viewRows('search');
        if (view.length !== _searchHits.length) countNote += T(' · 필터 후 ' + view.length + '건', ' · ' + view.length + ' after filters');
        var sim = _searchMode === 'similar';
        var td = 'padding:6px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        var head = '<thead><tr style="background:#eef6f7;">'
            + (sim ? headerCell('match', 15, 'left', 'search') : '')
            + headerCell('project', sim ? 8 : 9, 'left', 'search')
            + headerCell('key', sim ? 10 : 11, 'left', 'search')
            + headerCell('summary', sim ? 22 : 28, 'left', 'search')
            + headerCell('status', 8, 'center', 'search')
            // 🩹 "해결책·대책이 있었나"가 이 검색의 목적이라 해결책 열을 둔다 — 비어 있으면 대책이 댓글에 있을 수 있다(상세에서 확인)
            + headerCell('resolution', 10, 'center', 'search')
            + headerCell('assignee', sim ? 8 : 10, 'center', 'search')
            + headerCell('reporter', sim ? 8 : 10, 'center', 'search')
            + headerCell('updated', sim ? 11 : 14, 'center', 'search')
            + '</tr></thead>';
        var bodyRows = view.length ? view.map(function (it, vi) {
                var c = statusColor(it.status);
                var proj = (it.key || '').split('-')[0];
                var matchCell = '';
                if (sim) {
                    var m = (it._sim && it._sim.matched) || [];
                    matchCell = '<td style="' + td + '" title="' + esc(m.join(', ')) + '">'
                        + (m.length
                            ? '<b style="color:#00707d;">' + m.length + '</b> ' + m.map(function (w) {
                                return '<span style="font-size:10.5px; padding:1px 6px; margin-right:2px; border-radius:8px; background:#e0f5f7; color:#00707d;">' + esc(w) + '</span>';
                            }).join('')
                            : '<span style="font-size:10.5px; color:#999;">' + T('본문·댓글', 'body/comments') + '</span>')
                        + '</td>';
                }
                return '<tr' + (vi % 2 ? ' class="jira-zebra-b"' : '') + ' onclick="window._jiraOpenIssueModal(\'' + esc(it.key) + '\')" style="cursor:pointer; border-bottom:1px solid #f0f0f0;">'
                    + matchCell
                    + '<td style="' + td + ' color:#888;">' + esc(proj) + '</td>'
                    + '<td style="' + td + ' color:#00707d;">' + esc(it.key) + '</td>'
                    + '<td style="' + td + '" title="' + esc(it.summary) + '">' + esc(it.summary) + '</td>'
                    + '<td style="padding:6px 8px; text-align:center;"><span style="' + window._uiBadgeStyle() + ' background:' + c.bg + '; color:' + c.fg + ';">' + esc(it.status) + '</span></td>'
                    + '<td style="' + td + ' text-align:center; color:' + (it.resolution ? '#1f7a3d' : '#bbb') + ';">' + esc(it.resolution || '—') + '</td>'
                    + '<td style="' + td + ' text-align:center;">' + esc(it.assignee || '—') + '</td>'
                    + '<td style="' + td + ' text-align:center;">' + esc(it.reporter || '—') + '</td>'
                    + '<td class="' + (window._dateDayCls ? window._dateDayCls(it.updated) : '') + '" style="padding:6px 8px; text-align:center; color:#888;">' + esc((it.updated || '').slice(0, 10)) + '</td>'
                    + '</tr>';
            }).join('')
            : '<tr><td colspan="' + (sim ? 9 : 8) + '" style="padding:24px 10px; text-align:center; color:#999; font-size:12.5px;">'
                + T('필터 조건에 맞는 이슈가 없습니다 — ', 'No issues match the current filters — ')
                + '<button onclick="window._jiraClearAllFilters(\'search\')" style="border:none; background:none; color:var(--ui-accent, #00707d); cursor:pointer; text-decoration:underline; font-size:12.5px;">'
                + T('필터 초기화', 'clear filters') + '</button></td></tr>';
        // ⚠️ 머리글은 스크롤해도 위에 붙어 있게(sticky) — 50줄을 내리다 보면 어느 열인지 잊는다
        var whatNote = (_searchMode === 'text' && _searchNote) ? '<div style="font-size:11px; color:#00707d; margin:6px 0 0;">' + esc(_searchNote) + '</div>' : '';
        box.innerHTML = whatNote + '<div style="font-size:11px; color:#888; margin:6px 0;">' + esc(countNote + teamNote) + '</div>'
            + filterBarHtml('search')
            + '<table class="concept-table jira-search-table ui-hover-rows" style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; font-size:12.5px;">'
            + head + '<tbody>' + bodyRows + '</tbody></table>';
        var ths = box.querySelectorAll('thead th');
        for (var i = 0; i < ths.length; i++) { ths[i].style.position = 'sticky'; ths[i].style.top = '0'; ths[i].style.zIndex = '2'; }
    }

    // ── 🔍 유사 이슈 찾기 (2026-11-23 사용자 요청) ──────────────────────────
    //  "내 프로젝트 이슈를 골라 다른 프로젝트에 비슷한 문제·대책이 있었는지" + **"AI 과다 호출이
    //  발생되지 않는 방법으로"**(사용자 지시). 그래서 기본 경로는 **AI 0회**다:
    //   ① 고른 이슈 요약에서 검색어를 뽑는다(결정론 — 구분자로 자르고 조사·불용어를 뺀다)
    //   ② 같은 뜻 묶음(JIRA_SIMILAR_POLICY.synonyms, 데이터)으로 넓힌다
    //   ③ JIRA 전체(**내 프로젝트는 빼고**)를 OR 로 **한 번** 검색한다(`/jira/search` 1회)
    //   ④ 요약에 몇 개의 묶음이 걸렸는지로 **코드가** 줄 세운다(AI 가 순위를 매기지 않는다)
    //  AI 는 사람이 `🤖 AI로 검색어 넓히기`를 **누를 때만**, 이슈당 **한 번**이다 — 결과를
    //  localStorage 에 두고 같은 이슈를 다시 열면 그걸 쓴다(호출 0회). 모달을 열거나 검색하는
    //  것만으로는 절대 부르지 않는다(2026-10-21 군집 판정이 모달 열기마다 돌아 하루 한도를 태운
    //  사고). 어휘·한계값은 아래 데이터 한 곳 — 코드를 안 고치고 늘린다(CLAUDE.md 학습 방향).
    window.JIRA_SIMILAR_POLICY = window.JIRA_SIMILAR_POLICY || {
        maxQueryTerms: 12,   // JQL 에 넣는 검색어 상한(넓힌 말 포함) — 넘으면 앞쪽(원래 말)부터 남긴다
        maxResults: 50,
        minTermLen: 2,
        aiMaxTerms: 8,       // AI 가 돌려주는 검색어 상한
        aiCacheMax: 300,     // 보관하는 AI 검색어 묶음 수(오래된 것부터 버린다)
        // 낱말 끝에서 떼는 꼬리(조사·부위 표현) — 떼고 남는 게 minTermLen 이상일 때만
        suffixes: ['에서', '으로', '부위', '부분', '시', '에', '을', '를', '은', '는', '의'],
        // 검색어로 쓰면 거의 모든 프로젝트가 걸리는 말(단계·시험명·일반어)
        stopwords: ['일반성능', '불량', '오류', '문제', '이슈', '현상', '발생', '확인', '요청', '검토', '문의', '보임',
                    '필요', '개선', '관련', '및', '후', '전', '건', '내측', '외측', '좌측', '우측', '상단', '하단', '조립',
                    'evt', 'dvt', 'pvt', 'proto', 'es', 'ws', 'mp', 'pp', 'issue', 'error', 'ng', 'the', 'and', 'of', 'ass', 'assy'],
        // 같은 뜻 묶음 — 요약 낱말에 묶음의 말이 **들어 있으면**(예: '양면테이프' ⊃ '테이프') 그 묶음 전부로 찾는다
        synonyms: [
            ['떨어짐', '탈락', '박리', '들뜸', '분리'],
            ['노이즈', '잡음', 'noise'],
            ['깨짐', '크랙', 'crack', '파손'],
            ['긁힘', '스크래치', 'scratch'],
            ['이물', 'foreign'],
            ['변형', '뒤틀림', 'warpage'],
            ['깜빡임', '플리커', 'flicker'],
            ['얼룩', '무라', 'mura'],
            ['dead', '데드'],
            ['날카로움', 'burr'],
            ['진동', 'vibration'],
            ['외관', 'cosmetic'],
            ['신뢰성', 'reliability'],
            ['누설', 'leak'],
            ['소손', '탄화', '번트', 'burn'],
            ['발열', 'thermal'],
            ['esd', '정전기'],
            ['쇼트', '단락', 'short'],
            ['테이프', 'tape'],
            ['패널', 'panel'],
            ['터치', 'touch', 'tsp']
        ]
    };

    var _searchMode = 'text';   // 'text' = 검색어 그대로 · 'similar' = 기준 이슈와 비슷한 것
    var _simBase = null;        // { key, summary, description, project }
    var _simAiBusy = false;
    var SIM_AI_CACHE = 'gantt_jira_simkw_v1';
    if (window.STORAGE_REGISTRY && !window.STORAGE_REGISTRY.some(function (r) { return r.key === SIM_AI_CACHE; })) {
        window.STORAGE_REGISTRY.push({ key: SIM_AI_CACHE, label: 'JIRA 유사 이슈 — AI 검색어 보관(이슈당 1회 호출 결과)',
            labelEn: 'JIRA similar issues — saved AI search terms', cls: 'cache', strategy: { type: 'drop' } });
    }

    // 요약 → 검색어(결정론). 같은 말은 한 번만, 원래 순서대로.
    window._jiraSimTerms = function (text) {
        var P = window.JIRA_SIMILAR_POLICY;
        var stop = {}; P.stopwords.forEach(function (w) { stop[w.toLowerCase()] = 1; });
        var out = [];
        String(text || '').split(/[\s_\-\[\]\(\)\{\}\/\\,.:;+'"&<>|~!?·…=※#@%^*]+/).forEach(function (raw) {
            var w = raw.trim().toLowerCase();
            for (var i = 0; i < P.suffixes.length; i++) {
                var s = P.suffixes[i];
                if (w.length - s.length >= P.minTermLen && w.slice(-s.length) === s) { w = w.slice(0, -s.length); break; }
            }
            if (w.length < P.minTermLen || /^\d+$/.test(w) || stop[w]) return;
            if (out.indexOf(w) === -1) out.push(w);
        });
        return out;
    };

    // 검색어 → 묶음 목록. 묶음 사전에 걸리면 그 묶음 전부, 아니면 자기 자신 하나.
    // ⚠️ 요약 낱말이 묶음의 말을 **품고 있으면** 그 말을 따로 꺼낸다('양면테이프' → '테이프') —
    //    옛 JIRA 검색은 붙여 쓴 한국어 복합어의 일부로는 못 찾기 때문이다.
    window._jiraSimGroups = function (terms) {
        var P = window.JIRA_SIMILAR_POLICY;
        var groups = [], seen = {};
        terms.forEach(function (t) {
            var hit = null;
            for (var i = 0; i < P.synonyms.length && !hit; i++) {
                if (P.synonyms[i].some(function (w) { return t.indexOf(w.toLowerCase()) >= 0; })) hit = P.synonyms[i];
            }
            var g = hit ? [t].concat(hit.map(function (w) { return w.toLowerCase(); })) : [t];
            g = g.filter(function (w, j) { return w.length >= P.minTermLen && g.indexOf(w) === j; });
            var sig = g.slice().sort().join('|');
            if (seen[sig] || !g.length) return;
            seen[sig] = 1;
            groups.push(g);
        });
        return groups;
    };

    // 묶음 → JQL 에 넣을 말(원래 말 먼저, 넓힌 말은 그 뒤) — 상한을 넘으면 뒤쪽을 버린다
    function simQueryTerms(groups) {
        var P = window.JIRA_SIMILAR_POLICY, out = [];
        groups.forEach(function (g) { if (out.indexOf(g[0]) === -1) out.push(g[0]); });
        groups.forEach(function (g) { g.slice(1).forEach(function (w) { if (out.indexOf(w) === -1) out.push(w); }); });
        return out.slice(0, P.maxQueryTerms);
    }

    function simCacheGet(sig) {
        try { var c = JSON.parse(localStorage.getItem(SIM_AI_CACHE) || '{}'); return c[sig] || null; } catch (e) { return null; }
    }
    function simCacheSet(sig, terms) {
        try {
            var c = JSON.parse(localStorage.getItem(SIM_AI_CACHE) || '{}');
            c[sig] = { terms: terms, at: Date.now() };
            var keys = Object.keys(c);
            var max = window.JIRA_SIMILAR_POLICY.aiCacheMax;
            if (keys.length > max) {
                keys.sort(function (a, b) { return (c[a].at || 0) - (c[b].at || 0); })
                    .slice(0, keys.length - max).forEach(function (k) { delete c[k]; });
            }
            localStorage.setItem(SIM_AI_CACHE, JSON.stringify(c));
        } catch (e) { /* 보관 실패는 다음에 다시 부르게 될 뿐 — 기능은 막지 않는다 */ }
    }
    // 같은 이슈라도 요약이 바뀌면 다시 만들 수 있게 요약까지 열쇠에 넣는다
    function simSig(base) { return base.key + '|' + String(base.summary || '').slice(0, 120); }

    window._jiraFindSimilar = async function (key) {
        key = String(key || '').toUpperCase();
        var issue = _issueCache[key];
        if (!issue || !issue.description) {
            try {
                var d = await fetchJson(BASE + '/jira/issue/' + encodeURIComponent(key));
                if (!d || d.ok === false) {
                    if (window.showToast) window.showToast('⚠️ ' + ((d && d.message) || T('이슈를 찾지 못했습니다.', 'Issue not found.')), 'warning');
                    return;
                }
                issue = d.issue;
            } catch (e) {
                if (window.showToast) window.showToast('⚠️ ' + (e && e.message ? e.message : e), 'warning');
                return;
            }
        }
        var modal = document.getElementById('jira-search-modal');
        if (!modal || modal.style.display === 'none') window._jiraOpenSearchModal();
        var qInp = document.getElementById('jira-search-q');
        if (qInp) qInp.value = key;
        _searchMode = 'similar';
        _simBase = { key: key, summary: issue.summary || '', description: issue.description || '', project: key.split('-')[0] };
        var terms = window._jiraSimTerms(_simBase.summary);
        var cached = simCacheGet(simSig(_simBase));
        if (cached) cached.terms.forEach(function (t) { if (terms.indexOf(t) === -1) terms.push(t); });
        renderSimPanel(terms, !!cached);
        await window._jiraSimRun();
    };

    function renderSimPanel(terms, aiUsed) {
        var box = document.getElementById('jira-search-sim');
        if (!box || !_simBase) return;
        box.style.display = 'block';
        box.innerHTML = '<div style="background:#f6fbfb; border:1px solid #cfe3e5; border-radius:8px; padding:8px 10px; font-size:12px;">'
            + '<div style="margin-bottom:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🎯 ' + T('기준', 'Base') + ': <b style="color:#00707d;">' + esc(_simBase.key) + '</b> '
            + esc(_simBase.summary) + ' <span style="color:#999;">(' + T(_simBase.project + ' 는 빼고 찾습니다', 'excluding ' + _simBase.project) + ')</span></div>'
            + '<div style="display:flex; gap:6px; align-items:center;">'
            + '<span style="flex-shrink:0; color:#555;">' + T('검색어', 'Terms') + '</span>'
            + '<input id="jira-sim-terms" value="' + esc(terms.join(', ')) + '" title="' + T('쉼표로 구분 — 고친 뒤 다시 찾기', 'Comma-separated — edit and search again') + '" style="' + inputSt + '" onkeydown="if(event.key===\'Enter\')window._jiraSimRun()">'
            + '<button onclick="window._jiraSimRun()"' + btnHover + ' style="' + btnSt + ' flex-shrink:0;">🔄 ' + T('다시 찾기', 'Search again') + '</button>'
            + '<button id="jira-sim-ai-btn" onclick="window._jiraSimAiExpand()"' + btnHover
            + ' title="' + T('AI 가 부품·증상 검색어를 더 만들어 줍니다. 이슈당 한 번만 부르고 결과는 저장됩니다.', 'AI suggests more part/symptom terms. Called once per issue; the result is saved.') + '"'
            + ' style="' + btnSt + ' flex-shrink:0;">' + (aiUsed ? '🤖 ' + T('AI 검색어 적용됨', 'AI terms applied') : '🤖 ' + T('AI로 검색어 넓히기 (1회)', 'Widen with AI (1 call)')) + '</button>'
            + '</div>'
            + '<div id="jira-sim-expanded" style="margin-top:5px; font-size:11px; color:#888;"></div>'
            + '<div id="jira-sim-ai-status" style="margin-top:3px; font-size:11px; display:none;"></div>'
            + '</div>';
    }

    window._jiraSimRun = async function () {
        var box = document.getElementById('jira-search-body');
        if (!box || !_simBase) return;
        var raw = ((document.getElementById('jira-sim-terms') || {}).value || '');
        var terms = raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
        if (!terms.length) { box.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">' + T('검색어가 없습니다 — 위 칸에 적어 주세요.', 'No terms — please type some above.') + '</div>'; return; }
        var groups = window._jiraSimGroups(terms);
        var q = simQueryTerms(groups);
        var exp = document.getElementById('jira-sim-expanded');
        if (exp) exp.textContent = T('실제로 찾는 말', 'Actually searching') + ' (' + q.length + '): ' + q.join(', ');
        box.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">' + T('검색 중...', 'Searching...') + '</div>';
        var jqlStr = 'project != ' + _simBase.project + ' AND ('
            + q.map(function (w) { return 'text ~ "' + w.replace(/["\\]/g, '') + '*"'; }).join(' OR ')
            + ')' + teamClause() + ' ORDER BY updated DESC';
        try {
            var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent(jqlStr) + '&maxResults=' + window.JIRA_SIMILAR_POLICY.maxResults);
            if (!d || d.ok === false) { box.innerHTML = '<div style="color:#a3281c; padding:16px;">⚠️ ' + esc((d && d.message) || T('검색 실패', 'Search failed')) + '</div>'; return; }
            var hits = d.issues || [];
            // 순위는 코드가 — 요약에 걸린 묶음 수(많을수록 비슷) → 해결책 있는 것 → 최근 순
            hits.forEach(function (it) {
                var s = String(it.summary || '').toLowerCase();
                var matched = [];
                groups.forEach(function (g) {
                    var w = g.find(function (x) { return s.indexOf(x) >= 0; });
                    if (w) matched.push(w);
                });
                it._sim = { score: matched.length, matched: matched };
            });
            hits.sort(function (a, b) {
                return (b._sim.score - a._sim.score)
                    || ((b.resolution ? 1 : 0) - (a.resolution ? 1 : 0))
                    || String(b.updated || '').localeCompare(String(a.updated || ''));
            });
            _searchHits = hits;
            _searchTotal = d.total || hits.length;
            resetSearchView();
            _jiraRenderSearchResults(_searchTotal);
        } catch (e) {
            box.innerHTML = '<div style="color:#a3281c; padding:16px;">⚠️ ' + esc(String(e && e.message || e)) + '</div>';
        }
    };

    function simAiStatus(msg, kind) {
        var el = document.getElementById('jira-sim-ai-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'err' ? '#a3281c' : (kind === 'ok' ? '#1f7a3d' : '#555');
        el.textContent = msg || '';
    }

    // 🤖 사람이 누를 때만 — 이슈당 한 번, 결과 보관. 두 번 눌러도(연타) 한 번만 나간다(_simAiBusy).
    window._jiraSimAiExpand = async function () {
        if (!_simBase || _simAiBusy) return;
        var sig = simSig(_simBase);
        var inp = document.getElementById('jira-sim-terms');
        var mergeAndRun = function (aiTerms) {
            var cur = ((inp && inp.value) || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
            aiTerms.forEach(function (t) { if (cur.indexOf(t) === -1) cur.push(t); });
            if (inp) inp.value = cur.join(', ');
            var btn = document.getElementById('jira-sim-ai-btn');
            if (btn) btn.textContent = '🤖 ' + T('AI 검색어 적용됨', 'AI terms applied');
            return window._jiraSimRun();
        };
        var cached = simCacheGet(sig);
        if (cached) {
            simAiStatus('♻️ ' + T('저장해 둔 AI 검색어를 썼습니다 — AI 호출 0회', 'Used saved AI terms — 0 AI calls'), 'ok');
            return mergeAndRun(cached.terms);
        }
        var apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
        if (!apiKey || !window.callAiBackend) {
            simAiStatus('⚠️ ' + T('AI 키가 없습니다 — 설정에서 등록해 주세요. (AI 없이 찾은 결과는 그대로 쓸 수 있습니다)', 'No AI key — register one in settings. (The no-AI results are still usable.)'), 'err');
            return;
        }
        _simAiBusy = true;
        var btn = document.getElementById('jira-sim-ai-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + T('AI 검색어 만드는 중...', 'Asking AI...'); }
        simAiStatus('', '');
        try {
            var P = window.JIRA_SIMILAR_POLICY;
            var prompt = '아래 사내 JIRA 이슈와 같은 종류의 문제를 다른 제품 프로젝트에서 찾으려 한다. '
                + 'JIRA 전문검색에 넣을 검색어를 만들어라.\n'
                + '규칙: 부품 이름과 증상을 짧은 낱말(1~2 단어)로, 한국어와 영어 둘 다, 같은 뜻의 다른 표현 포함, 최대 ' + P.aiMaxTerms + '개. '
                + '프로젝트 코드·모델명·사람 이름·날짜·개발 단계(EVT/DVT/ES/Proto 등)는 넣지 마라. '
                + '설명 없이 JSON 배열 하나만 출력하라. 예: ["테이프","tape","탈락","peel"]\n\n'
                + '[요약] ' + _simBase.summary + '\n'
                + '[설명] ' + String(_simBase.description || '').slice(0, 400);
            var r = await window._withTimeout(window.callAiBackend(apiKey, prompt, { feature: 'jira-similar-terms' }), 60000,
                T('AI 응답 시간 초과', 'AI timed out'));
            var text = (r && r.ok && window._extractGanttQaAiText) ? window._extractGanttQaAiText(r) : '';
            var m = String(text || '').match(/\[[\s\S]*?\]/);
            var arr = [];
            try { arr = m ? JSON.parse(m[0]) : []; } catch (e) { arr = []; }
            var stop = {}; P.stopwords.forEach(function (w) { stop[w.toLowerCase()] = 1; });
            var terms = (Array.isArray(arr) ? arr : []).map(function (x) { return String(x || '').trim().toLowerCase(); })
                .filter(function (x, i, a) { return x.length >= P.minTermLen && x.length <= 30 && !stop[x] && a.indexOf(x) === i; })
                .slice(0, P.aiMaxTerms);
            if (!terms.length) {
                // 실패는 보관하지 않는다 — 보관하면 다음에 눌러도 빈 결과만 돌려준다
                simAiStatus('⚠️ ' + T('AI 가 쓸 만한 검색어를 주지 않았습니다. (AI 없이 찾은 결과는 그대로입니다)', 'AI returned no usable terms. (The no-AI results are unchanged.)'), 'err');
                if (btn) btn.textContent = '🤖 ' + T('AI로 검색어 넓히기 (1회)', 'Widen with AI (1 call)');
                return;
            }
            simCacheSet(sig, terms);
            simAiStatus('✅ ' + T('AI 검색어 ' + terms.length + '개를 더했습니다(이 이슈는 다음부터 AI 호출 0회): ', 'Added ' + terms.length + ' AI terms (0 AI calls next time for this issue): ') + terms.join(', '), 'ok');
            await mergeAndRun(terms);
        } catch (e) {
            simAiStatus('⚠️ ' + String(e && e.message || e), 'err');
            if (btn) btn.textContent = '🤖 ' + T('AI로 검색어 넓히기 (1회)', 'Widen with AI (1 call)');
        } finally {
            _simAiBusy = false;
            if (btn) btn.disabled = false;
        }
    };

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
                + '<div id="jira-link-drag" style="padding:13px 18px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; border-radius:10px 10px 0 0;'
                + ' cursor:grab; display:flex; align-items:center; gap:8px;">'
                + '<strong style="font-size:14px;">⚙️ <span id="jira-link-title">' + T('JIRA 연결 설정', 'JIRA link settings') + '</span></strong>'
                + '<span id="jira-link-unit-badge" style="font-size:11px; padding:1px 8px; border-radius:10px; background:#fff; border:1px solid #a3d9e0; color:#00707d; font-weight:bold;"></span>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="document.getElementById(\'jira-link-modal\').style.display=\'none\'"'
                + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text);'
                + ' border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div style="padding:14px 16px; flex:1; min-height:0; overflow-y:auto; font-size:12px;">'
                + '<div style="margin-bottom:10px; color:#777; line-height:1.5;">'
                + T('지금 모델(위 배지)과 연결할 JIRA 이슈를 네 가지 방법으로 모읍니다 — 모델마다 따로 저장됩니다. 📁 프로젝트만 탭을 열 때 자동으로 조회되고, 나머지(🔗🔍📧)는 표 아래 "🔍 더 찾기" 버튼을 눌러야 돕니다(다른 모델 이슈가 섞이는 걸 막기 위한 안전장치).', 'Collects linked JIRA issues for the current model (badge above) four ways — saved separately per model. Only 📁 project auto-runs when the tab opens; the rest (🔗🔍📧) need the "🔍 Search these too" button below the table (a safeguard against pulling in another model\'s issues).')
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
                + '<div style="font-size:11px; color:#999; margin-bottom:10px;">📧 ' + T('메일에서 캡처된 이슈번호는 별도 입력 없이 함께 모이지만, 표 아래 "🔍 더 찾기"를 눌러야 조회됩니다 — 모델이 여럿이면 📁 프로젝트 코드를 등록해야 그 모델 것만 보입니다.', 'Issue numbers captured from mail need no extra input, but are only fetched when you click "🔍 Search these too" below the table — with multiple models, set the 📁 project code so only this model\'s issues show.') + '</div>'
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

    // 🏷 [2026-11-12] 구성 요소·해결책·Milestone — 모달(1줄 압축, metaLineHtml)과 표(새 열,
    // metaCellText)가 **같은 순서·같은 값**을 쓴다(metaParts 한 곳). 전부 읽기 전용 참고 정보.
    function metaParts(issue) {
        return [
            [T('구성 요소', 'Components'), (issue.components && issue.components.length) ? issue.components.join(', ') : ''],
            [T('해결책', 'Resolution'), issue.resolution || ''],
            ['Milestone', issue.milestone || '']
        ];
    }
    function metaLineHtml(issue) {
        // 📌 [2026-11-12 2차, 사용자 요청] "공간을 많이 차지하지 않도록" 세 줄이 아니라 한 줄로.
        return metaParts(issue).map(function (p, i) {
            return (i ? '<span style="color:#ddd; margin:0 10px;">│</span>' : '')
                + '<span style="color:#888;">' + esc(p[0]) + ':</span> '
                + '<b style="color:#333; font-weight:600;">' + (p[1] ? esc(p[1]) : '<span style="color:#aaa; font-weight:normal;">—</span>') + '</b>';
        }).join('');
    }
    function metaCellText(issue) {
        var bits = metaParts(issue).map(function (p) { return p[1]; }).filter(Boolean);
        return bits.length ? bits.join(' · ') : '';
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

    // 💬 [2026-11-17 사용자 요청] 댓글 수정/삭제 — onclick에 댓글 내용을 그대로 박으면
    // 따옴표·줄바꿈 섞인 글에서 깨진다(JIRA 프로젝트 이름 사고와 같은 이유) — 첨부 목록과
    // 같은 방식으로 인덱스로 찾는다. 수정/삭제 권한은 JIRA가 가진다(본인 댓글이 아니거나
    // "Edit/Delete" 권한이 없으면 403) — 그래서 버튼은 모든 댓글에 보여주고, 서버가 막으면
    // 그 사유를 그대로 상태줄에 띄운다(추측으로 미리 숨기지 않는다).
    var _commentList = [];

    function renderComments(list, key) {
        _commentList = list || [];
        if (!list || !list.length) {
            return '<div style="color:#aaa; text-align:center;">' + T('댓글 없음', 'No comments') + '</div>';
        }
        return list.map(function (c, i) {
            return '<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #e5e5e5;">'
                + '<div style="display:flex; align-items:baseline; gap:8px;">'
                + '<div style="font-size:11px; color:#888; flex:1; min-width:0;">' + esc(c.author || '') + ' · ' + esc((c.created || '').slice(0, 16).replace('T', ' ')) + '</div>'
                + '<a onclick="window._jiraEditComment(\'' + esc(key) + '\', ' + i + ')" style="font-size:11px; color:var(--ui-accent, #00707d); cursor:pointer; white-space:nowrap;">✏️ ' + T('수정', 'Edit') + '</a>'
                + '<a onclick="window._jiraDeleteComment(\'' + esc(key) + '\', ' + i + ')" style="font-size:11px; color:#a3281c; cursor:pointer; white-space:nowrap;">🗑️ ' + T('삭제', 'Delete') + '</a>'
                + '</div>'
                + '<div id="jira-comment-body-' + i + '" style="white-space:pre-wrap;">' + esc(c.body) + '</div></div>';
        }).join('');
    }

    window._jiraEditComment = function (key, i) {
        var c = _commentList[i];
        var holder = document.getElementById('jira-comment-body-' + i);
        if (!c || !holder) return;
        holder.innerHTML =
            '<textarea id="jira-comment-edit-' + i + '" rows="2" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:12px; resize:vertical;">' + esc(c.body) + '</textarea>'
            + '<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:4px;">'
            + '<a onclick="window._jiraCancelEditComment(' + i + ')" style="font-size:11px; color:#777; cursor:pointer;">' + T('취소', 'Cancel') + '</a>'
            + '<a onclick="window._jiraSaveEditComment(\'' + esc(key) + '\', ' + i + ')" style="font-size:11px; color:var(--ui-accent, #00707d); cursor:pointer; font-weight:bold;">' + T('저장', 'Save') + '</a>'
            + '</div>';
        var ta = document.getElementById('jira-comment-edit-' + i);
        if (ta) ta.focus();
    };

    window._jiraCancelEditComment = function (i) {
        var c = _commentList[i];
        var holder = document.getElementById('jira-comment-body-' + i);
        if (!c || !holder) return;
        holder.innerHTML = esc(c.body);
    };

    window._jiraSaveEditComment = async function (key, i) {
        var c = _commentList[i];
        var ta = document.getElementById('jira-comment-edit-' + i);
        if (!c || !ta) return;
        var text = ta.value.trim();
        if (!text) return;
        modalSetStatus('⏳ ' + T('수정 중...', 'Saving...'), '');
        try {
            var d = await fetch(BASE + '/jira/issue/' + encodeURIComponent(key) + '/comment/' + encodeURIComponent(c.id), {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: text })
            }).then(function (r) { return r.json(); });
            if (!d || d.ok === false) { modalSetStatus('⚠️ ' + esc((d && d.message) || ''), 'err'); return; }
            await window._jiraRenderIssueBody(key);
            modalSetStatus('✅ ' + T('수정했습니다.', 'Saved.'), 'ok');
        } catch (e) {
            modalSetStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
    };

    window._jiraDeleteComment = async function (key, i) {
        var c = _commentList[i];
        if (!c) return;
        if (!confirm(T('이 댓글을 삭제할까요? 되돌릴 수 없습니다.', 'Delete this comment? This cannot be undone.'))) return;
        modalSetStatus('⏳ ' + T('삭제 중...', 'Deleting...'), '');
        try {
            var d = await fetch(BASE + '/jira/issue/' + encodeURIComponent(key) + '/comment/' + encodeURIComponent(c.id), {
                method: 'DELETE'
            }).then(function (r) { return r.json(); });
            if (!d || d.ok === false) { modalSetStatus('⚠️ ' + esc((d && d.message) || ''), 'err'); return; }
            await window._jiraRenderIssueBody(key);
            modalSetStatus('✅ ' + T('삭제했습니다.', 'Deleted.'), 'ok');
        } catch (e) {
            modalSetStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
    };

    function modalSetStatus(msg, kind) {
        var el = document.getElementById('jira-issue-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'err' ? '#a3281c' : (kind === 'ok' ? '#1f7a3d' : '#555');
        el.innerHTML = msg || '';
    }

    // ── 📤 이슈 공유 (2026-11-23 사용자 요청, 2차: "팝업 말고 모달 안쪽 제일 상단에
    //    컴팩트하게 1행으로") ───────────────────────────────────────────
    //  처음엔 body 바로 밑에 띄우는 별도 팝업(.row-action-popup, z-index:9999 고정)
    //  이었는데, 모달을 맨 앞으로 가져올 때(bringModalToFront)는 window._topModalZ를
    //  계속 올려써서(js/19) 모달 쪽 z-index가 금방 9999를 넘어 팝업이 그 뒤로 숨었다
    //  (사용자 제보 "공유 팝업이 뒤에 숨어서 안보임"). 팝업을 더 높이는 대신, 아예
    //  모달 **본문 안**(정상적인 문서 흐름, 모달과 같은 쌓임 맥락이라 늘 보인다)에
    //  한 줄로 넣어 구조적으로 문제를 없앴다. 이름 칸 하나 + 아이콘 버튼 셋(복사·
    //  텔레그램·이메일) — 이름을 비우면 "나"로 보낸다(기존 팝업과 같은 규칙).
    //  수신자는 **주소록**(tabData.addressBook)에서 이름으로 찾는다 — AI 문답의
    //  "텔레그램으로 보내줘"(js/04h)와 같은 방식. 전송은 기존 공용 라우트
    //  `/send-telegram`·`/send-mail`(kortek_backend.py) 그대로 — JIRA 전용 새
    //  백엔드 라우트는 두지 않는다.
    function _jiraShareText(issue) {
        var lines = [
            '🪐 [' + issue.key + '] ' + issue.summary,
            T('상태', 'Status') + ': ' + (issue.status || '-')
                + ' | ' + T('담당자', 'Assignee') + ': ' + (issue.assignee || T('미지정', 'Unassigned'))
                + ' | ' + T('우선순위', 'Priority') + ': ' + (issue.priority || '-')
        ];
        if (issue.url) lines.push('🔗 ' + issue.url);
        return lines.join('\n');
    }

    // ✉️ (2026-11-23 2차, 사용자 요청 "텔레그램말고도 이메일로 (전달)공유 기능") — 기존
    // `/send-mail`(SMTP, kortek_backend.py)을 재사용한다. 알람 수동발송(js/22c)과 같은
    // "HTML 표 한 칸짜리" 본문 모양을 그대로 따른다.
    function _jiraShareEmailHtml(issue) {
        var row = function (ko, en, val) {
            return '<tr><td style="padding:4px 8px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; white-space:nowrap;">'
                + T(ko, en) + '</td><td style="padding:4px 8px; border:1px solid #dcdde1;">' + esc(val || '-') + '</td></tr>';
        };
        return '<div style="font-family:sans-serif; font-size:13px; line-height:1.6;">'
            + '<p>🪐 <b>[' + esc(issue.key) + ']</b> ' + esc(issue.summary) + '</p>'
            + '<table style="border-collapse:collapse;">'
            + row('상태', 'Status', issue.status) + row('담당자', 'Assignee', issue.assignee)
            + row('우선순위', 'Priority', issue.priority) + '</table>'
            + (issue.url ? '<p><a href="' + esc(issue.url) + '">🔗 ' + T('JIRA에서 보기', 'Open in JIRA') + '</a></p>' : '')
            + '<p style="color:#888; font-size:12px;">' + T('KORTEK PM 앱의 JIRA 탭에서 공유했습니다.', 'Shared from the JIRA tab in the KORTEK PM app.') + '</p></div>';
    }

    // 이름 칸의 글자 → 주소록 1명. 비우면 "나", 두 명 이상 겹치면 누구인지 모르니
    // 보내지 않고 사람에게 되묻는다(추측해서 엉뚱한 사람에게 보내는 게 더 나쁘다).
    // ⚠️ [2026-11-23, 사용자 제보 "박용훈 이(가) 2명과 겹칩니다"] 동명이인이 주소록에
    // 있으면 자동완성 드롭다운(부서·직함까지 보여줌)에서 분명히 한 명을 골라도, 칸에는
    // 똑같은 이름 글자만 남아서 글자 다시 찾기가 다시 둘을 집어 똑같이 막혔다 — 자동완성이
    // "고른 사람"을 기억하게 하고(onPick, nameInp._jiraSharePicked) 그 사람이고 글자를
    // 그 뒤로 안 고쳤으면 되묻지 않고 바로 확정한다.
    function _jiraShareResolvePerson(nameInp) {
        var q = ((nameInp && nameInp.value) || '').trim();
        if (!q) {
            var myName = String(window.currentUserName || '').trim();
            var me = (myName && window._addrFindByName) ? window._addrFindByName(myName) : null;
            return { person: me, label: T('나', 'me'), isMe: true };
        }
        if (nameInp && nameInp._jiraSharePicked && nameInp._jiraSharePicked.name === q) {
            return { person: nameInp._jiraSharePicked, label: nameInp._jiraSharePicked.name };
        }
        var book = (window.tabData || {}).addressBook || [];
        var hits = book.filter(function (p) { return p && p.name && p.name.indexOf(q) >= 0; });
        if (hits.length === 1) return { person: hits[0], label: hits[0].name };
        if (hits.length > 1) return { person: null, label: q, ambiguous: hits.length };
        return { person: null, label: q, notFound: true };
    }

    window._jiraShareCopy = function (key) {
        var issue = _issueCache[key];
        if (!issue) return;
        var text = _jiraShareText(issue);
        var done = function () { if (window.showToast) window.showToast('📋 ' + T('복사했습니다.', 'Copied.'), 'success'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(function () {
                if (window.showToast) window.showToast('⚠️ ' + T('복사에 실패했습니다.', 'Copy failed.'), 'warning');
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { if (window.showToast) window.showToast('⚠️ ' + T('복사에 실패했습니다.', 'Copy failed.'), 'warning'); }
            ta.remove();
        }
    };

    window._jiraShareSendTg = async function (key) {
        var issue = _issueCache[key];
        if (!issue) return;
        var nameInp = document.getElementById('jira-share-name');
        var r = _jiraShareResolvePerson(nameInp);
        if (r.ambiguous) { if (window.showToast) window.showToast('⚠️ "' + r.label + '" ' + T('이(가) ' + r.ambiguous + '명과 겹칩니다 — 더 자세히 적어주세요.', 'matches ' + r.ambiguous + ' people — be more specific.'), 'warning'); return; }
        if (r.notFound) { if (window.showToast) window.showToast('⚠️ ' + T('주소록에 없는 이름입니다.', 'No such name in the address book.'), 'warning'); return; }
        var chatId = '';
        if (r.isMe) {
            if (r.person && r.person.telegramId) chatId = String(r.person.telegramId);
            // 비어 있으면 백엔드가 알람 설정의 기본 Chat ID로 보낸다.
        } else {
            if (!r.person.telegramId) { if (window.showToast) window.showToast('⚠️ ' + r.label + T(' 님은 텔레그램 ID가 없습니다 — 주소록에서 등록해주세요.', ' has no Telegram ID — please add it in the Address Book.'), 'warning'); return; }
            chatId = String(r.person.telegramId);
        }
        if (!window.sendTelegramAlarm) { if (window.showToast) window.showToast('⚠️ ' + T('텔레그램 발송 기능을 아직 못 찾았습니다(페이지를 새로고침해보세요).', 'Telegram sender not loaded yet — try reloading the page.'), 'warning'); return; }
        try {
            // ⚠️ /send-telegram 의 `to`는 백엔드 팀원 명단(TELEGRAM_MEMBERS, 이 앱의 주소록과
            // 다른 저장소)의 이름으로 찾는다 — 주소록에서 바로 얻은 숫자 chatId는 **`chatId`
            // 파라미터로만** 보낸다(js/22b `sendTelegramAlarm`, AI 문답 텔레그램 발송과 같은 길).
            var res = await window.sendTelegramAlarm(_jiraShareText(issue), chatId ? { chatId: chatId } : {});
            if (!res || !res.ok) { if (window.showToast) window.showToast('⚠️ ' + ((res && res.errDesc) || T('전송 실패', 'Send failed')), 'warning'); return; }
            if (window.showToast) window.showToast('✅ ' + T(r.label + '에게 보냈습니다.', 'Sent to ' + r.label + '.'), 'success');
        } catch (e) {
            if (window.showToast) window.showToast('⚠️ ' + String(e && e.message || e), 'warning');
        }
    };

    window._jiraShareSendMail = async function (key) {
        var issue = _issueCache[key];
        if (!issue) return;
        var nameInp = document.getElementById('jira-share-name');
        var r = _jiraShareResolvePerson(nameInp);
        if (r.ambiguous) { if (window.showToast) window.showToast('⚠️ "' + r.label + '" ' + T('이(가) ' + r.ambiguous + '명과 겹칩니다 — 더 자세히 적어주세요.', 'matches ' + r.ambiguous + ' people — be more specific.'), 'warning'); return; }
        if (r.notFound) { if (window.showToast) window.showToast('⚠️ ' + T('주소록에 없는 이름입니다.', 'No such name in the address book.'), 'warning'); return; }
        if (!r.person || !r.person.email) { if (window.showToast) window.showToast('⚠️ ' + r.label + T(' 님은 이메일 주소가 없습니다 — 주소록에서 등록해주세요.', ' has no email address — please add it in the Address Book.'), 'warning'); return; }
        try {
            var d = await fetch(BASE + '/send-mail', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: r.person.email, subject: '[JIRA] [' + issue.key + '] ' + issue.summary, body: _jiraShareEmailHtml(issue) })
            }).then(function (res) { return res.json(); });
            if (!d || d.ok === false) { if (window.showToast) window.showToast('⚠️ ' + ((d && d.error) || T('발송 실패', 'Send failed')), 'warning'); return; }
            if (window.showToast) window.showToast('✅ ' + T(r.label + '에게 보냈습니다.', 'Sent to ' + r.label + '.'), 'success');
        } catch (e) {
            if (window.showToast) window.showToast('⚠️ ' + String(e && e.message || e), 'warning');
        }
    };

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
            + '<div id="jira-issue-drag" style="padding:13px 18px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; border-radius:10px 10px 0 0;'
            + ' cursor:grab; display:flex; align-items:center; gap:8px;">'
            + '<strong id="jira-issue-title" style="font-size:14px;">🪐 ' + esc(key) + '</strong>'
            + '<a id="jira-issue-openlink" target="_blank" rel="noopener" style="font-size:11px; color:var(--ui-accent, #00707d);">' + T('JIRA에서 열기 ↗', 'Open in JIRA ↗') + '</a>'
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

        var shareBtnSt = 'flex-shrink:0; width:28px; height:26px; padding:0; border-radius:5px; font-size:13px; line-height:26px; cursor:pointer; border:none; background:#e0f5f7; color:#00707d;';
        var shareRow = '<div style="display:flex; align-items:center; gap:5px; margin-bottom:10px; padding:5px 7px; background:#f7fbfb; border:1px solid #d9eceb; border-radius:6px;">'
            + '<span style="font-size:11px; color:#555; font-weight:bold; flex-shrink:0;">📤 ' + T('공유', 'Share') + '</span>'
            + '<input id="jira-share-name" placeholder="' + T('이름(비우면 나)', 'name (blank = me)') + '" style="flex:1; min-width:0; padding:4px 6px; border:1px solid #ccc; border-radius:5px; font-size:11px;">'
            + '<button onclick="window._jiraShareCopy(\'' + esc(key) + '\')" title="' + T('클립보드로 복사', 'Copy to clipboard') + '"' + btnHover + ' style="' + shareBtnSt + '">📋</button>'
            + '<button onclick="window._jiraShareSendTg(\'' + esc(key) + '\')" title="' + T('텔레그램으로 보내기', 'Send via Telegram') + '"' + btnHover + ' style="' + shareBtnSt + '">💬</button>'
            + '<button onclick="window._jiraShareSendMail(\'' + esc(key) + '\')" title="' + T('이메일로 보내기', 'Send via email') + '"' + btnHover + ' style="' + shareBtnSt + '">✉️</button>'
            + '</div>';

        body.innerHTML =
            shareRow
            + fieldRow(T('요약', 'Summary'), '<input id="jira-f-summary" style="' + inputSt + '" value="' + esc(issue.summary) + '">')
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
            // 📌 [2026-11-12 사용자 요청] 실제 JIRA 화면의 "자세히" 패널에 있는 구성 요소/해결책/
            // Milestone도 여기 보여준다 — 전부 **읽기 전용**(이 모달에서 고치는 칸이 아니라
            // 참고용, JIRA 쪽 화면에서 고치면 "🔄 새로고침"으로 다시 받아온다). Milestone은
            // 이 인스턴스의 커스텀 필드라 이름이 영문 그대로다(jira_bridge._field_id_by_name).
            // ⚠️ [2026-11-12 2차] "공간을 많이 차지하지 않도록" 세 칸 각각이 아니라 **한 줄**로
            // 압축한다(metaLineHtml, 위 "구성 요소·해결책·Milestone" 절).
            + fieldRow('📋', '<div style="flex:1; min-width:0; display:flex; align-items:center;'
                + ' flex-wrap:wrap; padding-top:6px; font-size:12px; line-height:1.7;">' + metaLineHtml(issue) + '</div>')
            // 🪂 [2026-11-17 사용자 요청] JIRA 이슈 → 간트 업무로 기록 이동/등록. 사람이 이
            // 버튼을 눌러야만 실행된다(쓰기는 읽기와 경로 분리, 위 헤더 주석과 같은 원칙).
            + '<div style="display:flex; justify-content:flex-end; gap:6px; margin-bottom:8px;">'
            + '<button onclick="window._jiraFindSimilar(\'' + esc(key) + '\')" title="' + T('다른 프로젝트에서 비슷한 이슈·대책 찾기(AI 없이)', 'Find similar issues/fixes in other projects (no AI)') + '"' + btnHover + ' style="' + btnSt + '">🔍 ' + T('유사 이슈', 'Similar issues') + '</button>'
            + '<button onclick="window._jiraRegisterAsTask(\'' + esc(key) + '\')"' + btnHover + ' style="' + btnSt + '">📋 ' + T('간트 업무로 등록', 'Register as gantt task') + '</button></div>'
            + '<div style="display:flex; justify-content:flex-end; margin-bottom:12px;">'
            + '<button onclick="window._jiraSaveFields(\'' + esc(key) + '\')"' + btnHover + ' style="' + btnSt + ' font-weight:bold;">💾 ' + T('필드 저장', 'Save fields') + '</button></div>'
            + renderAttachments(issue.attachments)
            + '<div id="jira-attach-dropzone" style="border:1.5px dashed #a3d9e0; border-radius:6px; padding:9px 10px;'
            + ' text-align:center; background:#fafefe; font-size:11.5px; color:#789; cursor:pointer; margin-bottom:8px; transition:background .15s;">'
            + '📎 <span id="jira-attach-filename">' + T('파일을 여기로 끌어놓거나 클릭해서 고르세요 · 붙여넣기(Ctrl+V)도 됩니다', 'Drop a file here or click to choose · Ctrl+V to paste too') + '</span>'
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
            + renderComments(issue.comments, key)
            + '</div>'
            + '<textarea id="jira-comment-input" rows="2" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1px solid #ccc; border-radius:6px; font-size:12px; resize:vertical;" placeholder="' + T('댓글을 입력하세요...', 'Write a comment...') + '"></textarea>'
            + '<div style="display:flex; justify-content:flex-end; margin-top:6px;">'
            + '<button onclick="window._jiraAddComment(\'' + esc(key) + '\')"' + btnHover + ' style="' + btnSt + ' font-weight:bold;">📨 ' + T('댓글 등록', 'Post comment') + '</button></div>'
            + '<div id="jira-issue-status" style="display:none; font-size:11.5px; margin-top:8px; line-height:1.5;"></div>';

        // 📤 공유 이름 칸 자동완성 — 새로 짜지 않고 Summary 멤버 칸과 같은 공용 함수
        // (window.attachAddressAutocomplete, js/22g)를 그대로 쓴다. 이메일 칸이 따로
        // 없는 자리라 emailEl은 null, 한 명만 고르는 자리라 isMulti=false. onPick으로
        // "고른 그 사람"을 칸에 적어둬(_jiraSharePicked) 동명이인이어도 되묻지 않는다
        // (_jiraShareResolvePerson이 읽음) — 글자를 직접 고치면 더 안 맞을 수 있으니 버린다.
        if (window.attachAddressAutocomplete) {
            var shareNameInp = document.getElementById('jira-share-name');
            window.attachAddressAutocomplete(shareNameInp, null, false, function (person) {
                shareNameInp._jiraSharePicked = person;
            });
            shareNameInp.addEventListener('input', function () {
                if (shareNameInp._jiraSharePicked && shareNameInp._jiraSharePicked.name !== shareNameInp.value) {
                    shareNameInp._jiraSharePicked = null;
                }
            });
        }

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
        var defaultFnameMsg = T('파일을 여기로 끌어놓거나 클릭해서 고르세요 · 붙여넣기(Ctrl+V)도 됩니다', 'Drop a file here or click to choose · Ctrl+V to paste too');
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

    // 📋 [2026-11-17 사용자 요청] 첨부 칸에 붙여넣기(Ctrl+V)도 — 스크린샷 찍어서 파일로
    // 저장하는 번거로움 없이 바로 붙여넣을 수 있다(js/73 `_dzFilesFromClipboard` 공용 헬퍼).
    // ⚠️ 상세 모달은 `_jiraRenderIssueBody`가 매번 본문을 통째로 다시 그리므로, 그 안에서
    // `document.addEventListener`를 걸면 열 때마다 리스너가 쌓인다 — 그래서 **한 번만** 걸고
    // "지금 첨부 칸이 떠 있나"만 매번 확인한다(일일보고 js/59 `bindFileDropOnce`와 같은 패턴).
    (function bindJiraAttachPasteOnce() {
        document.addEventListener('paste', function (e) {
            var wrap = document.getElementById('jira-issue-modal');
            var dz = document.getElementById('jira-attach-dropzone');
            var attFileEl = document.getElementById('jira-attach-file');
            var fnameEl = document.getElementById('jira-attach-filename');
            if (!wrap || wrap.style.display === 'none' || !dz || !attFileEl || !fnameEl) return;
            var files = window._dzFilesFromClipboard ? window._dzFilesFromClipboard(e, 'jira') : [];
            if (!files.length) return;   // 글자 붙여넣기는 그대로 입력칸으로
            e.preventDefault(); e.stopPropagation();
            try {
                var dt = new DataTransfer();
                files.forEach(function (f) { dt.items.add(f); });
                attFileEl.files = dt.files;
            } catch (e2) { /* DataTransfer 생성자가 없는 오래된 브라우저 — 조용히 포기 */ return; }
            fnameEl.textContent = files[0].name;
            dz.style.background = '#e0f5f7';
            setTimeout(function () { dz.style.background = '#fafefe'; }, 200);
        });
    })();

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
            // ⚠️⚠️ [2026-11-17 사용자 제보 "필드 저장·첨부 저장 안됨"] 성공 메시지를 먼저 띄우고
            // 그 다음에 본문을 다시 그리면, 다시 그리기가 body.innerHTML을 통째로 바꾸면서
            // 방금 띄운 "✅" 메시지가 그 즉시 지워진다(새 #jira-issue-status는 display:none으로
            // 다시 시작한다) — 사람 눈엔 "아무 반응도 없다"로 보인다. **다시 그린 뒤에** 메시지를
            // 띄워야 실제로 화면에 남는다(아래 세 함수도 전부 같은 순서로 고쳤다).
            await window._jiraRenderIssueBody(key);
            modalSetStatus('✅ ' + T('첨부를 저장했습니다.', 'Attachment saved.'), 'ok');
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
            await window._jiraRenderIssueBody(key);
            modalSetStatus('✅ ' + T('저장했습니다.', 'Saved.'), 'ok');
            window._jiraRefresh();
        } catch (e) {
            modalSetStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // 📋 [2026-11-17 사용자 요청] JIRA 이슈 → 지금 열린 간트 프로젝트의 업무로 등록.
    //    메일 자동등록(js/14b `buildMailTaskRow`)과는 **다른 함수** — 그건 "메일"이
    //    전제(자동알림 판정·＊AI📧 표식·`_mailRaw`)라 그대로 쓰면 JIRA 업무가 메일
    //    유래로 잘못 분류된다(기간요약 js/62가 `[출처]`로 메일을 가른다). 중복 방지는
    //    **JIRA 키 자체**로 한다(메일의 `[출처]` 태그와 같은 역할의 다른 태그 `[JIRA]`).
    //    ⚠️ 사람이 이 버튼을 눌러야만 실행된다 — AI 문답 도구는 mode:'read'만 등록돼
    //    있어 이 경로를 못 탄다(js/40 QA_TOOLS "쓰기는 읽기와 경로 분리" 원칙).
    // ══════════════════════════════════════════════════════════════════════
    function jiraFindExistingTaskRow(key, gd, ci) {
        if (!key || !Array.isArray(gd) || !ci || ci.content == null || ci.content === -1) return null;
        var tag = '[JIRA] ' + key;
        for (var i = 1; i < gd.length; i++) {
            var row = gd[i];
            if (row && String(row[ci.content] || '').indexOf(tag) !== -1) return row;
        }
        return null;
    }
    function todayYmd() {
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    window._jiraRegisterAsTask = async function (key) {
        var gd = window.globalData, ci = window.colIdx;
        if (!Array.isArray(gd) || !gd.length || !ci) {
            if (window.showToast) window.showToast(T('열린 프로젝트가 없습니다.', 'No project is open.'), 'error');
            return;
        }
        var iss = _issueCache[key];
        if (!iss || !iss.summary) {
            try { var d2 = await fetchJson(BASE + '/jira/issue/' + encodeURIComponent(key)); if (d2 && d2.ok !== false) iss = d2.issue; } catch (e) { /* 아래서 처리 */ }
        }
        if (!iss) {
            if (window.showToast) window.showToast(T('이슈 정보를 못 불러왔습니다.', 'Could not load the issue.'), 'error');
            return;
        }
        if (jiraFindExistingTaskRow(key, gd, ci)) {
            if (window.showToast) window.showToast(T('이미 간트 업무로 등록돼 있습니다.', 'Already registered as a gantt task.'), 'info');
            return;
        }

        var newRow = new Array(gd[0].length).fill('');
        newRow._level = 1;
        newRow._origDev = ''; newRow._origT1 = ''; newRow._origT2 = ''; newRow._origT3 = ''; newRow._origT4 = '';
        newRow._origT1 = '[' + key + '] ' + (iss.summary || '') + ' ＊JIRA🪐';
        newRow._startForced = true; newRow._planForced = true;

        var refRow = null;
        for (var i = 1; i < gd.length; i++) { if (gd[i]) { refRow = gd[i]; break; } }
        if (ci.customer !== -1) newRow[ci.customer] = refRow ? (refRow[ci.customer] || '') : '';
        if (ci.model !== -1) newRow[ci.model] = refRow ? (refRow[ci.model] || '') : '';
        if (ci.inch !== -1) newRow[ci.inch] = refRow ? (refRow[ci.inch] || '') : '';
        if (ci.assignee !== -1) newRow[ci.assignee] = refRow ? (refRow[ci.assignee] || '') : '';

        var today = todayYmd();
        if (ci.start !== -1) newRow[ci.start] = today;
        if (ci.plan !== -1) newRow[ci.plan] = today;
        if (ci.dur1 !== -1) newRow[ci.dur1] = '1';
        var doneLike = /done|closed|resolved|완료|해결|종료/i.test(iss.status || '');
        if (ci.status !== -1) newRow[ci.status] = doneLike ? T('완료', 'Done') : T('진행', 'In progress');

        var bits = ['[JIRA] ' + key, T('요약: ', 'Summary: ') + (iss.summary || '')];
        if (iss.status) bits.push(T('상태: ', 'Status: ') + iss.status);
        if (iss.assignee) bits.push(T('담당(JIRA): ', 'Assignee(JIRA): ') + iss.assignee);
        if (iss.priority) bits.push(T('우선순위: ', 'Priority: ') + iss.priority);
        if (iss.resolution) bits.push(T('해결책: ', 'Resolution: ') + iss.resolution);
        if (iss.milestone) bits.push('Milestone: ' + iss.milestone);
        if (iss.components && iss.components.length) bits.push(T('구성 요소: ', 'Components: ') + iss.components.join(', '));
        if (iss.url) bits.push(iss.url);
        if (ci.content !== -1) newRow[ci.content] = bits.join('\n');
        newRow._jiraKey = key;

        gd.push(newRow);
        // ⚠️ pushUndoSnapshot 을 따로 안 부른다 — recalculateSchedules() 종료 시 자동으로
        //    찍는다(js/04e 헤더 주석, "되돌리기 지점은 바꾼 뒤에" CLAUDE.md 규칙 그대로).
        if (window.recalculateSchedules) window.recalculateSchedules();
        if (window.renderTable) window.renderTable();
        if (window.saveToGoogleDrive) window.saveToGoogleDrive();
        if (window.showToast) window.showToast('✅ ' + T('간트 업무로 등록했습니다.', 'Registered as a gantt task.'), 'success');
        var statusEl = document.getElementById('jira-issue-status');
        if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = '#2f9e44'; statusEl.textContent = '✅ ' + T('간트 업무로 등록했습니다.', 'Registered as a gantt task.'); }
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
            await window._jiraRenderIssueBody(key);
            modalSetStatus('✅ ' + T('전환했습니다.', 'Transitioned.'), 'ok');
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
            await window._jiraRenderIssueBody(key);
            modalSetStatus('✅ ' + T('등록했습니다.', 'Posted.'), 'ok');
        } catch (e) {
            modalSetStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
    };

    // ── 🆕 새 이슈(키) 생성 (2026-11-12 사용자 요청, "제일 중요한 신규 이슈 생성 기능") ──
    //  지금 모델에 연결된 📁 프로젝트 코드(Summary 탭 "JIRA 코드" 칸과 같은 저장소)로
    //  만든다 — 어느 프로젝트에 만들지 알 수 없으면(코드 미연결) 폼 대신 안내만 보여주고
    //  막는다(추측하지 않는다). 사람이 버튼을 눌러야만 실행된다(AI 자율 루프는 js/40에
    //  이 라우트가 없어 못 탄다 — 다른 쓰기 경로와 같은 원칙).
    var _createAssigneeHits = [];

    window._jiraOpenCreateModal = async function () {
        var wrap = document.getElementById('jira-create-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'jira-create-modal';
            wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:9350; pointer-events:none; background:none;';
            wrap.innerHTML =
                '<div id="jira-create-box" style="pointer-events:all; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);'
                + ' width:min(460px,94vw); max-height:88vh; background:#fff; box-shadow:0 8px 30px rgba(0,0,0,.3); border-radius:10px; overflow:hidden;'
                + ' display:flex; flex-direction:column;">'
                + '<div id="jira-create-drag" style="padding:13px 18px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; border-radius:10px 10px 0 0;'
                + ' cursor:grab; display:flex; align-items:center; gap:8px;">'
                + '<strong style="font-size:14px;">🎫 <span id="jira-create-title">' + T('새 이슈', 'New issue') + '</span></strong>'
                + '<span id="jira-create-unit-badge" style="font-size:11px; padding:1px 8px; border-radius:10px; background:#fff; border:1px solid #a3d9e0; color:#00707d; font-weight:bold;"></span>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="document.getElementById(\'jira-create-modal\').style.display=\'none\'"'
                + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); color:var(--modal-icon-text);'
                + ' border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="jira-create-body" style="padding:14px 16px; flex:1; min-height:0; overflow-y:auto; font-size:12px;"></div>'
                + '</div>';
            document.body.appendChild(wrap);
            if (window._makeDraggable) window._makeDraggable('jira-create-box', 'jira-create-drag');
            if (window._bindClickToFront) window._bindClickToFront('jira-create-modal');
            // 담당자 찾기 결과 위임 클릭 — 모달 본문을 매번 통째로 다시 그려도(아래
            // _jiraRenderCreateBody) 이 리스너는 바깥 컨테이너(#jira-create-body)에 한 번만
            // 걸어 둔다(이슈 상세 모달의 담당자 찾기와 같은 이유 — 따옴표 섞인 이름이 안전).
            document.getElementById('jira-create-body').addEventListener('click', function (e) {
                var hitsBox = document.getElementById('jira-create-assignee-hits');
                var el = hitsBox && e.target.closest('[data-idx]');
                if (!el || !hitsBox.contains(el)) return;
                var u = _createAssigneeHits[Number(el.dataset.idx)];
                if (!u) return;
                var inp = document.getElementById('jira-c-assignee');
                if (inp) inp.value = u.name;
                hitsBox.style.display = 'none';
            });
        }
        var badge = document.getElementById('jira-create-unit-badge');
        if (badge) {
            var curUnit = jiraActiveUnit();
            badge.textContent = curUnit || '';
            badge.style.display = curUnit ? 'inline-block' : 'none';
        }
        wrap.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('jira-create-modal');
        await window._jiraRenderCreateBody();
    };

    function createStatus(msg, kind) {
        var el = document.getElementById('jira-create-status');
        if (!el) return;
        el.style.display = msg ? 'block' : 'none';
        el.style.color = kind === 'err' ? '#a3281c' : (kind === 'ok' ? '#1f7a3d' : '#555');
        el.innerHTML = msg || '';
    }

    window._jiraRenderCreateBody = async function () {
        var body = document.getElementById('jira-create-body');
        if (!body) return;
        var L = links();
        var pk = (L.projectKey || '').trim();
        body.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">' + T('불러오는 중...', 'Loading...') + '</div>';
        if (!pk) {
            // ⚠️ 프로젝트 코드가 없으면 **폼 자체를 안 보여준다** — "일단 적당히 만들고 나중에
            // 옮기자"는 더 큰 실수를 부른다(결정론 먼저, CLAUDE.md).
            body.innerHTML = '<div style="padding:10px; color:#a3281c; line-height:1.6;">⚠️ '
                + T('지금 모델에 📁 JIRA 프로젝트 코드가 연결돼 있지 않아 어느 프로젝트에 만들지 알 수 없습니다 — Summary 탭의 🪐 JIRA 코드 칸(🔍 찾기)이나 ⚙️ 연결 설정에서 먼저 지정해주세요.',
                           'No 📁 JIRA project is linked to this model, so there\'s no way to know where to create it — set it first via the 🪐 JIRA code field (🔍 Find) in the Summary tab, or ⚙️ Link settings.')
                + '</div>';
            return;
        }
        var typesRes, priRes, compRes;
        try { typesRes = await fetchJson(BASE + '/jira/issuetypes'); } catch (e) { typesRes = { issuetypes: [] }; }
        try { priRes = await fetchJson(BASE + '/jira/priorities'); } catch (e) { priRes = { priorities: [] }; }
        try { compRes = await fetchJson(BASE + '/jira/project/' + encodeURIComponent(pk) + '/components'); } catch (e) { compRes = { components: [] }; }
        var types = (typesRes && typesRes.issuetypes) || [];
        var priorities = (priRes && priRes.priorities) || [];
        var comps = (compRes && compRes.components) || [];

        body.innerHTML =
            '<div style="margin-bottom:10px; color:#777;">📁 ' + T('프로젝트', 'Project') + ': <b style="color:#00707d;">' + esc(pk) + '</b></div>'
            + fieldRow(T('유형', 'Type'), (types.length
                ? ('<select id="jira-c-type" style="' + inputSt + '">'
                    + types.map(function (t) { return '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>'; }).join('')
                    + '</select>')
                : ('<input id="jira-c-type" style="' + inputSt + '" value="Task">')))
            + fieldRow(T('요약', 'Summary') + ' *', '<input id="jira-c-summary" style="' + inputSt + '" placeholder="' + T('필수', 'Required') + '">')
            + fieldRow(T('설명', 'Description'), '<textarea id="jira-c-description" rows="4" style="' + inputSt + ' resize:vertical; font-family:inherit;"></textarea>')
            + fieldRow(T('우선순위', 'Priority'), '<select id="jira-c-priority" style="' + inputSt + '">'
                + '<option value="">(' + T('기본값', 'default') + ')</option>'
                + priorities.map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('')
                + '</select>')
            + fieldRow(T('구성 요소', 'Components'), comps.length
                ? ('<select id="jira-c-components" multiple size="' + Math.min(5, Math.max(2, comps.length)) + '" style="' + inputSt + '">'
                    + comps.map(function (c) { return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>'; }).join('')
                    + '</select>')
                : ('<span style="color:#aaa; padding-top:6px;">(' + T('이 프로젝트엔 등록된 구성 요소가 없습니다', 'No components registered for this project') + ')</span>'))
            + fieldRow(T('담당자', 'Assignee'), '<div style="flex:1; min-width:0;">'
                + '<div style="display:flex; gap:6px;">'
                + '<input id="jira-c-assignee" style="' + inputSt + '" placeholder="' + T('JIRA 아이디(비우면 미배정)', 'JIRA username (blank = unassigned)') + '">'
                + '<button onclick="window._jiraSearchAssigneeForCreate()"' + btnHover + ' style="' + btnSt + '">🔍 ' + T('찾기', 'Find') + '</button>'
                + '</div>'
                + '<div id="jira-create-assignee-hits" style="display:none; max-height:130px; overflow-y:auto; border:1px solid #eee; border-radius:6px; margin-top:4px;"></div>'
                + '</div>')
            + '<div id="jira-create-status" style="display:none; font-size:11.5px; margin:4px 0 8px; line-height:1.5;"></div>'
            + '<div style="display:flex; justify-content:flex-end;">'
            + '<button onclick="window._jiraSubmitCreateIssue(\'' + esc(pk) + '\')"' + btnHover + ' style="' + btnSt + ' font-weight:bold;">➕ ' + T('만들기', 'Create') + '</button>'
            + '</div>';
    };

    window._jiraSearchAssigneeForCreate = async function () {
        var L = links();
        var pk = (L.projectKey || '').trim();
        var q = (document.getElementById('jira-c-assignee').value || '').trim();
        var box = document.getElementById('jira-create-assignee-hits');
        if (!box || !pk) return;
        box.style.display = 'block';
        box.innerHTML = '<div style="padding:8px; color:#999;">' + T('찾는 중...', 'Searching...') + '</div>';
        try {
            var d = await fetchJson(BASE + '/jira/project/' + encodeURIComponent(pk) + '/assignable-users'
                + (q ? ('?q=' + encodeURIComponent(q)) : ''));
            if (!d || d.ok === false) { box.innerHTML = '<div style="padding:8px; color:#a3281c;">⚠️ ' + esc((d && d.message) || '') + '</div>'; return; }
            _createAssigneeHits = (d.users || []).slice(0, 50);
            if (!_createAssigneeHits.length) { box.innerHTML = '<div style="padding:8px; color:#999;">' + T('일치하는 사람이 없습니다.', 'No matching person.') + '</div>'; return; }
            box.innerHTML = _createAssigneeHits.map(function (u, i) {
                return '<div data-idx="' + i + '" style="padding:6px 8px; cursor:pointer; border-bottom:1px solid #f2f2f2;" onmouseover="this.style.background=\'#fafafa\'" onmouseout="this.style.background=\'\'"><b>' + esc(u.displayName) + '</b> <span style="color:#999;">(' + esc(u.name) + ')</span></div>';
            }).join('');
        } catch (e) {
            box.innerHTML = '<div style="padding:8px; color:#a3281c;">⚠️ ' + esc(String(e && e.message || e)) + '</div>';
        }
    };

    window._jiraSubmitCreateIssue = async function (pk) {
        var summaryEl = document.getElementById('jira-c-summary');
        var summary = (summaryEl && summaryEl.value || '').trim();
        if (!summary) { createStatus('⚠️ ' + T('요약을 입력해주세요.', 'Please enter a summary.'), 'err'); if (summaryEl) summaryEl.focus(); return; }
        var typeEl = document.getElementById('jira-c-type');
        var priEl = document.getElementById('jira-c-priority');
        var compEl = document.getElementById('jira-c-components');
        var comps = compEl ? Array.prototype.slice.call(compEl.selectedOptions || []).map(function (o) { return o.value; }) : [];
        createStatus('⏳ ' + T('만드는 중...', 'Creating...'), '');
        try {
            var d = await fetch(BASE + '/jira/issue', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectKey: pk,
                    summary: summary,
                    description: (document.getElementById('jira-c-description').value || '').trim(),
                    issuetype: typeEl ? typeEl.value : '',
                    priority: priEl ? priEl.value : '',
                    assignee: (document.getElementById('jira-c-assignee').value || '').trim(),
                    components: comps
                })
            }).then(function (r) { return r.json(); });
            if (!d || d.ok === false) { createStatus('⚠️ ' + esc((d && d.message) || T('생성 실패', 'Create failed')), 'err'); return; }
            var key = d.issue && d.issue.key;
            createStatus('✅ ' + T('생성했습니다: ', 'Created: ') + '<b>' + esc(key || '') + '</b>', 'ok');
            if (window._jiraRefresh) window._jiraRefresh();
            if (key) {
                setTimeout(function () {
                    var m = document.getElementById('jira-create-modal');
                    if (m) m.style.display = 'none';
                    window._jiraOpenIssueModal(key);
                }, 600);
            }
        } catch (e) {
            createStatus('⚠️ ' + esc(String(e && e.message || e)), 'err');
        }
    };

    // ══ 🔗 Summary 탭 모델 카드 ↔ JIRA 양방향 참조 (2026-11-11, 사용자 요청) ═══════
    //  js/22g를 직접 고치지 않고 **감싼다**(js/43이 populateTabData/mcSwitchUnit을 감싸는 것과
    //  같은 방식 — 이 파일만 빼면 예전 동작으로 돌아간다). 복사본을 만들지 않는다 — 두 화면이
    //  **같은 저장소**(tabData.jiraLinksByUnit[unitId].projectKey)를 그대로 읽고 쓰므로
    //  "동기화"할 코드 자체가 없다(한쪽에서 바꾸면 다른 쪽은 다음에 그릴 때 그 값을 본다).
    // ⚠️⚠️ [2026-11-11 사용자 정정] 첫 시도는 JIRA 코드를 **새 줄**로 맨 아래에 붙였는데,
    //  사용자가 원한 건 "프로젝트 코드" 자리를 **같은 줄에서** 4칸 → 6칸으로 늘려 그 옆에
    //  넣는 것이었다. 그때는 js/22g 그리드가 4열(고객모델명·프로젝트코드 / 프로젝트명칭·KTK)
    //  뿐이라 6열로 늘리고 "프로젝트 명칭" 앞에 끼워 넣는 이정표 매칭이 필요했다.
    // 🔀 [2026-11-18 사용자 요청] "프로젝트 코드·명칭은 pair로, 고객모델명은 새 고객모델내역과
    //  pair로" 배치를 다시 짜면서 js/22g 자체가 **이미 6열**(고객모델명·프로젝트코드·KTK /
    //  고객모델내역·프로젝트명칭·(빈칸))을 반환하도록 바뀌었다 — 2행 3번째 칸이 바로 이
    //  JIRA 칸 자리라, 이제 그리드 폭을 늘릴 필요 없이 **원본 HTML의 맨 끝에 붙이기만** 하면
    //  정확히 그 빈칸을 채운다(아래 전신 fallback과 같은 방식 — 그래서 이정표 매칭 자체를
    //  없앴다). js/22g가 다시 열 수를 바꾸면 이 자리도 같이 맞춰야 한다.
    (function () {
        var orig = window._renderModelCardHtml;
        if (typeof orig !== 'function' || orig.__jiraWrapped) return;
        var LBL = '<label style="font-size:12.5px; color:#666; border:1px solid #cfe3e5; border-radius:6px; padding:6px 8px; background:#fff; white-space:nowrap;">';
        var fn = function (model, idx) {
            var html = orig(model, idx);
            var unit = model.unitId || '';
            var store = (window.tabData && window.tabData.jiraLinksByUnit) || {};
            var val = (store[unit] && store[unit].projectKey) || '';
            // 📌 [2026-11-12 사용자 요청] 입력칸 옆에 🔍 찾기 버튼 — JIRA 탭 모달을 열지 않고도
            //    여기서 바로 프로젝트 코드/이름을 검색해 넣는다(아래 _jiraFindProjectFromSummary).
            var field = LBL + '🪐 ' + T('JIRA 코드', 'JIRA code') + '</label>'
                + '<div class="jira-code-row" style="display:flex; gap:4px; min-width:0;">'
                + '<input type="text" class="u-input" data-jira-field="projectKey" style="flex:1 1 0; min-width:0;"'
                + ' title="' + esc(T('이 모델과 연결할 JIRA 프로젝트 코드 — 🔍로 찾아 바로 넣을 수 있습니다', 'JIRA project code linked to this model — use 🔍 to look it up')) + '"'
                + ' placeholder="' + T('예: GABKJ', 'e.g. GABKJ') + '" value="' + esc(val) + '"'
                + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault(); window._jiraFindProjectFromSummary(this.parentElement.querySelector(\'button\'));}">'
                + '<button type="button" onclick="window._jiraFindProjectFromSummary(this)"'
                + ' onmouseover="this.style.background=\'#a3d9e0\';" onmouseout="this.style.background=\'#e0f5f7\';"'
                + ' title="' + esc(T('JIRA 프로젝트 찾기', 'Find JIRA project')) + '"'
                + ' style="flex:0 0 auto; padding:0 9px; border-radius:5px; font-size:12px; cursor:pointer; border:none;'
                + ' background:#e0f5f7; color:#00707d; transition:background .15s;">🔍</button>'
                + '</div>';
            var tail = '</div></div>';
            if (html.slice(-tail.length) === tail) html = html.slice(0, -tail.length) + field + tail;
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

    // ── 🔍 Summary 탭 "JIRA 코드" 칸의 찾기 버튼 — JIRA 탭 모달을 안 열어도 여기서
    //    바로 검색해서 넣는다(사용자 요청, 2026-11-12). JIRA 연결 설정 모달의
    //    🔍 찾기(window._jiraSearchProject)와 같은 조회(/jira/projects?q=)를 쓰되,
    //    카드가 여러 개(모델 여럿)일 수 있어 결과 목록은 **공용 floating 박스 하나**를
    //    버튼 위치에 맞춰 띄운다(JIRA 연결 설정의 고정 박스와 달리 카드마다 못 둔다).
    var _summaryProjectHits = [];
    var _summaryProjectTargetInput = null;

    function summaryProjectHitsBox() {
        var box = document.getElementById('jira-summary-project-hits');
        if (box) return box;
        box = document.createElement('div');
        box.id = 'jira-summary-project-hits';
        box.style.cssText = 'position:fixed; z-index:9500; display:none; min-width:220px; max-height:170px;'
            + ' overflow-y:auto; border:1px solid #cfe3e5; border-radius:6px; background:#fff;'
            + ' box-shadow:0 4px 16px rgba(0,0,0,.18); font-size:12px;';
        document.body.appendChild(box);
        box.addEventListener('click', function (e) {
            var el = e.target.closest('[data-idx]');
            if (!el || !_summaryProjectTargetInput) return;
            var p = _summaryProjectHits[Number(el.dataset.idx)];
            if (!p) return;
            _summaryProjectTargetInput.value = p.key;
            box.style.display = 'none';
            // 고르자마자 저장소에 반영 — 탭을 벗어나지 않아도 다음 JIRA 탭 진입 때 바로 쓰인다.
            if (window._syncProjectModelsFromDom) window._syncProjectModelsFromDom();
            if (window._markDirty) window._markDirty();
        });
        document.addEventListener('click', function (e) {
            if (box.style.display === 'none') return;
            if (box.contains(e.target) || e.target.closest('.jira-code-row')) return;
            box.style.display = 'none';
        });
        return box;
    }

    window._jiraFindProjectFromSummary = async function (btn) {
        var row = btn && btn.closest('.jira-code-row');
        var input = row ? row.querySelector('[data-jira-field="projectKey"]') : null;
        if (!input) return;
        var q = (input.value || '').trim();
        _summaryProjectTargetInput = input;
        var box = summaryProjectHitsBox();
        var r = btn.getBoundingClientRect();
        box.style.left = Math.max(4, r.right - 260) + 'px';
        box.style.top = (r.bottom + 4) + 'px';
        box.style.display = 'block';
        if (!q) { box.innerHTML = '<div style="padding:8px; color:#999;">' + T('프로젝트 코드나 이름을 입력하세요.', 'Enter a project code or name.') + '</div>'; return; }
        box.innerHTML = '<div style="padding:8px; color:#999;">' + T('찾는 중...', 'Searching...') + '</div>';
        try {
            var d = await fetchJson(BASE + '/jira/projects?q=' + encodeURIComponent(q));
            if (!d || d.ok === false) { box.innerHTML = '<div style="padding:8px; color:#a3281c;">⚠️ ' + esc((d && d.message) || '') + '</div>'; return; }
            _summaryProjectHits = (d.projects || []).slice(0, 50);
            if (!_summaryProjectHits.length) { box.innerHTML = '<div style="padding:8px; color:#999;">' + T('일치하는 프로젝트가 없습니다.', 'No matching project.') + '</div>'; return; }
            box.innerHTML = _summaryProjectHits.map(function (p, i) {
                return '<div data-idx="' + i + '" style="padding:6px 8px; cursor:pointer; border-bottom:1px solid #f2f2f2;"'
                    + ' onmouseover="this.style.background=\'#fafafa\'" onmouseout="this.style.background=\'\'">'
                    + '<b>' + esc(p.key) + '</b> — ' + esc(p.name) + '</div>';
            }).join('');
        } catch (e) {
            box.innerHTML = '<div style="padding:8px; color:#a3281c;">⚠️ ' + esc(String(e && e.message || e)) + '</div>';
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // 📅 [2026-11-17 사용자 요청] 다른 기능(AI 요약 등)이 재사용하는 공용 조회 —
    //    **결정론(프로젝트 코드)만**. 이 파일의 BASE/fetchJson/jql 을 그대로 쓴다
    //    (HTTP 호출 로직을 다른 파일에 또 베끼지 않는다). 수동 키·검색어·메일 추정은
    //    모델끼리 섞이는 사고가 있어(위 헤더 주석) 사람이 "더 찾기"를 눌러야만 돈다 —
    //    그래서 여기선 안 쓴다. 쓰기(댓글/상태전환/필드수정)는 여전히 js/70 모달에서만.
    // ══════════════════════════════════════════════════════════════════════
    window._jiraProjectKeysOf = function (jiraLinksByUnit) {
        var store = jiraLinksByUnit || {};
        var seen = {}, out = [];
        Object.keys(store).forEach(function (u) {
            var pk = String((store[u] || {}).projectKey || '').trim();
            if (pk && !seen[pk]) { seen[pk] = true; out.push(pk); }
        });
        return out;
    };

    window._jiraFetchIssuesByKeys = async function (projectKeys, opts) {
        var keys = (projectKeys || []).filter(Boolean);
        if (!keys.length) return { ok: true, issues: [] };
        var o = opts || {};
        var parts = ['project in (' + keys.join(',') + ')'];
        if (o.updatedFrom) parts.push('updated >= "' + o.updatedFrom + '"');
        if (o.updatedTo) parts.push('updated <= "' + o.updatedTo + '"');
        var max = o.maxResults || 50;
        try {
            var d = await fetchJson(BASE + '/jira/search?jql=' + encodeURIComponent(jql(parts) + ' ORDER BY updated DESC') + '&maxResults=' + max);
            if (!d || d.ok === false) return { ok: false, issues: [], error: (d && d.message) || 'failed' };
            return { ok: true, issues: d.issues || [] };
        } catch (e) {
            return { ok: false, issues: [], error: String(e && e.message || e) };
        }
    };

    // 🤖 [2026-11-17] AI 문답 도구 루프(js/40 `jira_project_issues`)가 부르는 로컬 도구 —
    //    지금 열린 프로젝트의 연결(프로젝트 코드)을 코드가 먼저 풀어 주므로 AI는 키를 몰라도 된다.
    //    QA_TOOLS의 `local` 계약대로 **항상 객체를 반환**하고(실패해도 throw 하지 않는다 —
    //    "연결 안 됨"은 오류가 아니라 사실이다), 네트워크 실패만 throw 해 도구 루프가 그대로 드러낸다.
    window._jiraLocalProjectIssues = async function (args) {
        var keys = window._jiraProjectKeysOf((window.tabData || {}).jiraLinksByUnit);
        if (!keys.length) {
            return { ok: true, issues: [], projectKeys: [],
                     message: T('이 프로젝트는 JIRA에 연결돼 있지 않습니다(JIRA 탭에서 프로젝트 코드를 등록하세요).',
                                 'This project has no linked JIRA project (link a project code in the JIRA tab).') };
        }
        var max = (args && args.maxResults) || 30;
        var r = await window._jiraFetchIssuesByKeys(keys, { maxResults: max });
        if (!r.ok) throw new Error(r.error || T('JIRA 조회 실패', 'JIRA lookup failed'));
        return { ok: true, issues: r.issues, projectKeys: keys };
    };
})();
