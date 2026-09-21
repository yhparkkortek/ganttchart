/* ════════════════════════════════════════════════════════════════════
   Phase 11 — AI 문답 질문 라우터 + SAP 적립학습 수집 (2026-09-21)
   설계: docs/qa-router-and-sap-learning.md

   문제: 질문이 SAP 조회인지/프로젝트 JSON 분석인지/일반 추론인지 구분을 못 해서, 예를 들어 "SMAJ12A* 조회해줘"가
   프로젝트 데이터 답변("데이터에서 확인되지 않습니다 … AI 추론")으로 새는 일이 있었다.

   3단계 라우터 — 규칙 우선, 확실할 때만 동작을 바꾸고 애매하면 기존 경로(legacy)를 그대로 쓴다.
     0) 명시 지정: "자주 쓰는 질문" 줄의 분류 선택 상자(자동/SAP/프로젝트/추론) 또는 "#sap ", "#프로젝트 ", "#추론 " 접두어
     1) 규칙 점수(AI 호출 없음): SAP 신호(SAP 단어/tcode/자재번호/와일드카드 패턴/기능 키워드) vs 프로젝트 신호
        (업무·일정·담당자 어휘 + "질문 속 부품번호가 실제 프로젝트 데이터에 있는가" 존재 확인) vs 일반 추론 …
     2) (예정) 애매할 때만 AI 분류 — 데이터가 쌓인 뒤
   분류 결과는 답변 위 배지로 보이고, 사람이 한 번 클릭해 다른 분류로 다시 실행할 수 있다(→ reroute 이벤트로
   수집되어 규칙 개선의 정답 데이터가 된다).

   적립학습: 지원하지 않는 SAP 요청은 가짜 답변을 만들지 않고 안내 + "새 SAP 기능 후보"로 적립(sap_unsupported 이벤트,
   기존 기능과의 유사도 포함) — 31번 리포트의 "🧠 SAP 학습 적립"에서 수요순으로 보고 AI 추론/상태 관리를 한다.
   ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var API = 'http://127.0.0.1:5000';
    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    var CLASSES = {
        sap:     { icon: '🏭', ko: 'SAP 조회',        en: 'SAP lookup' },
        project: { icon: '📊', ko: '프로젝트 데이터', en: 'Project data' },
        action:  { icon: '⚙️', ko: '앱 동작',        en: 'App action' },
        general: { icon: '💡', ko: '일반 추론',       en: 'General' },
        other:   { icon: '💬', ko: '기타',            en: 'Other' },
        auto:    { icon: '🏷', ko: '자동(불확실 — 기존 방식)', en: 'Auto (unsure — legacy)' }
    };
    var PREFIX_RE = /^#(sap|프로젝트|project|추론|일반|general)\s+/i;
    var PREFIX_CLS = { sap: 'sap', '프로젝트': 'project', project: 'project', '추론': 'general', '일반': 'general', general: 'general' };
    var PREFIX_KEY = { sap: 'sap', project: '프로젝트', general: '추론' };

    // ── 신호 추출 ──────────────────────────────────────────────────────
    var TCODE_RE = /\b(?:Z[A-Z]{2,4}\d{2,4}|MM0[1-3]|MM60|MMBE|MB5[12B]|CS1[1-5]|CS0[1-3]|ME2[1-3]N|ME2[A-Z]|ME5[1-3]N|MIGO|MIRO|VA0[1-3]|VL0[1-3]N|FB0[1-3]|FBL[1-5]N|CO0[1-3]|CA0[1-3]|MD0[1-4]|SE1[1-6]|SM\d{2}|SU\d{2}|SPRO)\b/g;
    var PROJECT_CUE_RE = /(#g\d+|wbs|업무|일정|담당자|담당|지연|마감|진행률|진척|프로젝트|간트|시작일|종료일|완료|미완료|고객사|모델명|summary|customer\s*spec|m\.c|elec\s*parts|이번\s*주|다음\s*주|이번\s*달|캘린더|공지|알람)/gi;
    var ACTION_RE = /((알람|공지|메일).*(보내|켜|꺼|해제|등록|삭제|작성|발송))|((삭제|이동|수정|변경|추가|등록|바꿔|올려|내려)\s*(해|줘|해줘|주세요|해주세요))|(탭\s*(으로|전환|이동))/;
    var GENERAL_CUE_RE = /(뭐야|뭔가요|뭐예요|무엇|무슨\s*뜻|의미|차이|왜\s|원리|어떻게\s*(동작|작동|되|하|쓰)|설명해|개념|정의|장단점|비교|추천|what\s+is|why\s|how\s+does|difference)/i;
    var OTHER_RE = /^\s*(안녕|하이|hello|hi\b|고마워|감사|도움말|사용법|뭘\s*할\s*수|무엇을\s*할\s*수|help\b)/i;
    var SCREEN_RE = /(화면|보이는|지금|현재|열려)/;
    var KO_STOP = /^(조회|알려|보여|해줘|해주|있어|없어|이거|그거|정보|내용|관련|대해|대한|확인|이번|다음|지금|현재|전체|모든|업무|일정|담당|프로젝트|진행|완료|지연|마감|설명|무엇)/;

    function patternOf(q) {
        var m = String(q || '').match(/[A-Za-z0-9가-힣_+\-.\/]*\*[A-Za-z0-9가-힣_+\-.\/*]*/g) || [];
        return m.filter(function (p) { return p.replace(/\*/g, '').length >= 2; });
    }
    function materialNumbers(q) {
        var s = String(q || ''), out = [], re = /\b\d{5,8}\b/g, m;
        while ((m = re.exec(s))) {
            var n = m[0], before = s.slice(Math.max(0, m.index - 2), m.index);
            if (/#?g$/i.test(before)) continue;                                              // #G 인덱스
            if (n.length === 8 && /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(n)) continue; // 날짜
            out.push(n);
        }
        return out;
    }
    var _hay = null, _hayAt = 0;
    /** 프로젝트 데이터 전체를 소문자 한 덩어리로(30초 캐시) — "질문 속 토큰이 프로젝트에 실제로 있는가" 확인용. */
    function haystack() {
        var now = Date.now();
        if (_hay !== null && now - _hayAt < 30000) return _hay;
        var parts = [];
        try {
            var gd = (typeof globalData !== 'undefined' ? globalData : window.globalData) || [];
            gd.forEach(function (r) {
                if (!r) return;
                Object.keys(r).forEach(function (k) { if (k.charAt(0) === '_') return; var v = r[k]; if (typeof v === 'string' || typeof v === 'number') parts.push(String(v)); });
            });
        } catch (e) { /* ignore */ }
        try { if (window.tabData) parts.push(JSON.stringify(window.tabData).slice(0, 2000000)); } catch (e) { /* ignore */ }
        _hay = parts.join('\n').toLowerCase(); _hayAt = now;
        return _hay;
    }
    window._qaInvalidateHay = function () { _hay = null; };
    /** 부품번호/모델명처럼 "특정성이 높은" 토큰(영문+숫자 혼합 또는 대문자 3자↑) — 프로젝트 존재 확인 대상. */
    function specificTokens(q) {
        var out = [], seen = {}, s = String(q || '').replace(TCODE_RE, ' ');
        (s.match(/[A-Za-z][A-Za-z0-9_.\-+]{2,}/g) || []).forEach(function (t) {
            var base = t.replace(/[.\-+]+$/, '');
            var ok = /\d/.test(base) || (/^[A-Z]{3,}$/.test(base));
            var k = base.toLowerCase();
            if (ok && !seen[k] && k.length >= 3) { seen[k] = 1; out.push(k); }
        });
        return out;
    }

    /** 1단계 분류 — 순수 함수(테스트 가능). hay를 넘기면 그걸로 존재 확인. */
    window._qaClassify = function (question, hayOverride) {
        var q = String(question || '');
        var sc = { sap: 0, project: 0, action: 0, general: 0, other: 0 };
        var why = { sap: [], project: [], action: [], general: [], other: [] };
        function add(c, n, r) { sc[c] += n; why[c].push(r); }
        var hay = hayOverride != null ? String(hayOverride).toLowerCase() : haystack();

        if (/sap/i.test(q)) add('sap', 5, 'SAP 언급');
        var tc = q.match(TCODE_RE); if (tc) add('sap', 4, '트랜잭션 ' + tc[0]);
        var wild = patternOf(q); if (wild.length) add('sap', 4, '와일드카드 패턴 ' + wild[0]);
        var mats = materialNumbers(q);
        if (mats.length) {
            add('sap', 3, '자재번호 형태 ' + mats[0]);
            if (hay && hay.indexOf(mats[0]) >= 0) add('project', 2, '이 번호가 프로젝트 데이터에도 있음');
        }
        var caps = window._qaMatchCapabilities ? window._qaMatchCapabilities(q) : [];
        if (caps.length && caps[0].score >= 0.5) add('sap', Math.min(4, Math.round(caps[0].score * 4)), 'SAP 기능 키워드: ' + caps[0].title);

        var pc = (q.match(PROJECT_CUE_RE) || []).map(function (x) { return x.toLowerCase(); });
        var uniqCue = pc.filter(function (x, i) { return pc.indexOf(x) === i; });
        if (uniqCue.length) add('project', Math.min(8, uniqCue.length * 2), '프로젝트 어휘: ' + uniqCue.slice(0, 3).join(','));
        var found = 0, foundList = [];
        specificTokens(q).forEach(function (t) { if (hay && hay.indexOf(t) >= 0) { found++; foundList.push(t); } });
        if (found) add('project', Math.min(6, found * 3), '프로젝트 데이터에 존재: ' + foundList.slice(0, 2).join(','));
        // 한글 고유명(사람/고객사/부품명 등) — 3자 이상 토큰의 조사를 떼고 프로젝트 데이터에 실제로 있는지 확인
        var koFound = [];
        (q.match(/[가-힣]{3,}/g) || []).forEach(function (w) {
            var base = w.replace(/(으로|에서|에게|이랑|까지|부터|처럼|보다|님|은|는|이|가|을|를|의|에|와|과|도|만|로)$/, '');
            if (base.length < 3 || KO_STOP.test(base)) return;
            if (hay && hay.indexOf(base) >= 0 && koFound.indexOf(base) < 0) koFound.push(base);
        });
        if (koFound.length) add('project', Math.min(4, koFound.length * 2), '프로젝트 데이터에 존재: ' + koFound.slice(0, 2).join(','));

        if (ACTION_RE.test(q)) add('action', uniqCue.length ? 4 : 1, '앱 동작 표현');
        if (GENERAL_CUE_RE.test(q)) add('general', 2, '일반 질문 표현');
        if (sc.sap <= 1 && sc.project <= 1 && sc.action <= 1 && q.replace(/\s+/g, '').length > 6) add('general', 2, 'SAP·프로젝트 신호 없음');
        if (OTHER_RE.test(q)) add('other', 5, '인사/도움말');

        var order = Object.keys(sc).sort(function (a, b) { return sc[b] - sc[a]; });
        var top = order[0], second = order[1];
        var confident = sc[top] >= 4 && (sc[top] - sc[second]) >= 3;
        // 일반 추론은 특히 보수적으로 — 프로젝트/SAP 신호가 조금이라도 있으면 확정하지 않는다(오분류 시 프로젝트 질문이 데이터 없이 답변됨)
        if (top === 'general' && (sc.project > 0 || sc.sap > 1)) confident = false;
        return { cls: top, confident: confident, scores: sc, reasons: why, patterns: wild, materials: mats, tcodes: tc || [], caps: caps.slice(0, 3) };
    };

    window._qaParsePrefix = function (q) {
        var m = PREFIX_RE.exec(String(q || ''));
        if (!m) return null;
        return { cls: PREFIX_CLS[m[1].toLowerCase()] || PREFIX_CLS[m[1]], question: String(q).slice(m[0].length).trim() };
    };

    // ── 이벤트 기록(Phase 10 수집기로) ────────────────────────────────
    function maskQ(q) { return window._issueMask ? window._issueMask(q, 160) : ''; }
    function logRoute(kind, q, extra) {
        try {
            if (!window._issueLog) return;
            var caps = window._qaMatchCapabilities ? window._qaMatchCapabilities(q).slice(0, 3) : [];
            window._issueLog({ domain: kind === 'reroute' ? 'qa' : 'sap', kind: kind, rid: '', route: '',
                params: Object.assign({ q: maskQ(q), qLen: String(q || '').length, sig: window._qaIntentSig ? window._qaIntentSig(maskQ(q)) : '', caps: caps }, extra || {}) });
        } catch (e) { /* 수집 실패는 무시 */ }
    }
    window._qaLogRoute = logRoute;

    // ── 🎨 분류별 색(데이터) — 2026-09-21, 사용자 지시: 자동=파랑(현재색) / 프로젝트=초록 / 추론=살구 / SAP=빨강 (기본 파스텔 R·G·B + 살구) ──
    // userBg/userFg: 내 질문 말풍선, aiBg: 답변 말풍선(더 연하게), accent: 테두리, sel*: 분류 선택 상자. 색을 바꾸고 싶으면 이 표만 고치면 된다.
    window._qaClassPalette = window._qaClassPalette || {
        auto:    { userBg: '#e7f3ff', userFg: '#0056b3', aiBg: '#f1f3f5', accent: '#a5c8f0', selBg: '#e7f3ff', selFg: '#1971c2', selBorder: '#a5c8f0' },
        project: { userBg: '#dff3e4', userFg: '#1f6b3a', aiBg: '#f0faf2', accent: '#9ccfab', selBg: '#e6f6ea', selFg: '#1f7a3d', selBorder: '#a8dab8' },
        general: { userBg: '#ffe6d1', userFg: '#9a4a12', aiBg: '#fff4ea', accent: '#f2b98a', selBg: '#ffeedd', selFg: '#a24a12', selBorder: '#f2b98a' },
        sap:     { userBg: '#fde3e1', userFg: '#a8322a', aiBg: '#fff1f0', accent: '#eea59f', selBg: '#fbe4e2', selFg: '#b1432f', selBorder: '#eeb0ac' }
    };
    /** 말풍선 색을 바꿀 분류만 팔레트를 돌려준다(auto/other/action은 null → 기존 파랑·회색 그대로). */
    window._qaPaletteFor = function (cls) { return (cls === 'sap' || cls === 'project' || cls === 'general') ? window._qaClassPalette[cls] : null; };

    // ── 분류 지정(0단계) — "자주 쓰는 질문" 줄 오른쪽의 작은 선택 상자 ─────────────────────
    // 🧹 [2026-09-21 UI 정리] 예전엔 입력창 위에 칩 4개 줄을 따로 띄웠는데 화면을 너무 차지해서, 이미 있는 "자주 쓰는 질문" 줄에 합쳤다.
    window._qaForceClass = '';
    var CHIPS = [['', '자동', 'Auto'], ['sap', '🏭 SAP', '🏭 SAP'], ['project', '📊 프로젝트', '📊 Project'], ['general', '💡 추론', '💡 General']];
    window._qaSetForce = function (cls) { window._qaForceClass = cls || ''; ensureChips(); var i = document.getElementById('gantt-qa-input'); if (i) i.focus(); };
    function ensureChips() {
        try {
            var freq = document.getElementById('gantt-qa-freq-select');
            if (!freq || !freq.parentNode) return;
            var oldRow = document.getElementById('gantt-qa-route-chips'); if (oldRow && oldRow.parentNode) oldRow.parentNode.removeChild(oldRow);   // 이전 버전의 칩 줄 정리
            var row = freq.parentNode;
            var lab = document.getElementById('gantt-qa-route-label'), sel = document.getElementById('gantt-qa-route-select');
            if (!sel) {
                lab = document.createElement('label'); lab.id = 'gantt-qa-route-label'; lab.htmlFor = 'gantt-qa-route-select';
                lab.style.cssText = 'font-size:10.5px; color:#888; white-space:nowrap; margin-left:6px;';
                sel = document.createElement('select'); sel.id = 'gantt-qa-route-select';
                sel.style.cssText = 'font-size:11px; padding:3px 6px; border:1px solid #ccc; border-radius:5px; max-width:120px;';
                sel.onchange = function () { window._qaSetForce(sel.value); };
                row.appendChild(lab); row.appendChild(sel);
            }
            lab.textContent = '🏷 ' + T('분류', 'Type');
            lab.title = T('질문을 어떻게 이해할지 직접 지정합니다. 입력창에 #sap / #프로젝트 / #추론 을 앞에 붙여도 됩니다.', 'Choose how the question is understood. You can also prefix #sap / #project / #general.');
            var cur = window._qaForceClass || '';
            sel.innerHTML = CHIPS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === cur ? ' selected' : '') + '>' + esc(T(c[1], c[2])) + '</option>'; }).join('');
            var pal = window._qaClassPalette[cur || 'auto'] || window._qaClassPalette.auto;      // 🎨 값별 파스텔(자동=파랑/SAP=빨강/프로젝트=초록/추론=살구)
            sel.style.borderColor = pal.selBorder; sel.style.background = pal.selBg; sel.style.color = pal.selFg; sel.style.fontWeight = 'bold';
            Array.prototype.forEach.call(sel.options, function (o) { var op = window._qaClassPalette[o.value || 'auto']; o.style.background = op.selBg; o.style.color = op.selFg; });
        } catch (e) { /* ignore */ }
    }
    (function wrapOpen(tries) {
        if (typeof window.openGanttQaModal === 'function' && !window.openGanttQaModal._qaWrapped) {
            var orig = window.openGanttQaModal;
            window.openGanttQaModal = function () { var r = orig.apply(this, arguments); setTimeout(ensureChips, 0); return r; };
            window.openGanttQaModal._qaWrapped = true;
        } else if (tries < 20) { setTimeout(function () { wrapOpen(tries + 1); }, 500); }
    })(0);

    // ── 답변 아래 분류 표시(한 줄, 왼쪽) + ⇄ 다시 분류(펼침) ──────────────────────────────
    window._qaRouteInlineHtml = function (m) {
        var r = m && m.route; if (!r) return '';
        var meta = CLASSES[r.cls] || CLASSES.auto;
        var tip = (r.forced ? T('직접 지정', 'Chosen by you') : T('자동 판단', 'Auto')) + (r.reasons && r.reasons.length ? ' — ' + r.reasons.join(' / ') : '');
        var short = r.cls === 'auto' ? T('자동', 'Auto') : T(meta.ko, meta.en);
        var _lp = window._qaPaletteFor(r.cls);
        return '<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; color:' + (_lp ? _lp.userFg : '#999') + ';">' +
            '<span title="' + esc(tip) + '">' + meta.icon + ' ' + esc(short) + (r.forced ? ' ' + esc(T('(지정)', '(set)')) : '') + '</span>' +
            '<button onclick="window._qaToggleReroute(\'' + esc(m.uid) + '\')" title="' + esc(T('다른 분류로 다시 답변받기', 'Re-answer as another type')) + '" style="font-size:11px; padding:0 5px; border:1px solid #dde3ea; background:#fff; color:#888; border-radius:9px; cursor:pointer; line-height:16px;">⇄</button></span>';
    };
    window._qaRerouteRowHtml = function (m) {
        var r = m && m.route; if (!r) return '';
        var btns = ['sap', 'project', 'general'].filter(function (c) { return c !== r.cls; }).map(function (c) {
            var mm = CLASSES[c];
            return '<button onclick="window._qaReroute(\'' + esc(m.uid) + '\',\'' + c + '\')" style="font-size:10.5px; padding:1px 8px; border:1px solid #ccd6e0; background:#fff; color:#555; border-radius:9px; cursor:pointer;">' + mm.icon + ' ' + esc(T(mm.ko, mm.en)) + esc(T('로', '')) + '</button>';
        }).join(' ');
        return '<div id="qa-reroute-' + esc(m.uid) + '" style="display:none; justify-content:flex-end; align-items:center; gap:6px; margin-top:3px; font-size:10.5px; color:#888; flex-wrap:wrap;">' +
            '<span>' + esc(T('다시 분류:', 'Retry as:')) + '</span>' + btns + '</div>';
    };
    window._qaToggleReroute = function (uid) {
        try { var el = document.getElementById('qa-reroute-' + uid); if (el) el.style.display = (el.style.display === 'none' || !el.style.display) ? 'flex' : 'none'; } catch (e) { /* ignore */ }
    };
    window._qaReroute = function (uid, cls) {
        try {
            if (window._ganttQaSending) return;
            var m = (window._ganttQaHistory || []).find(function (x) { return x.uid === uid; });
            if (!m || !m.question) return;
            logRoute('reroute', m.question, { from: (m.route && m.route.cls) || '', to: cls, forcedBefore: !!(m.route && m.route.forced) });
            var input = document.getElementById('gantt-qa-input'); if (!input) return;
            input.value = '#' + PREFIX_KEY[cls] + ' ' + m.question;
            window.sendGanttQaMessage();
        } catch (e) { console.warn('[QA 라우터] 다시 분류 실패:', e); }
    };

    // ── 응답 도우미 ──────────────────────────────────────────────────
    function newUid() { return 'qamsg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
    function pushUser(question, input, route) { window._ganttQaHistory.push({ role: 'user', text: question, route: route }); if (input) input.value = ''; }
    function pushAi(text, question, route, extra) {
        window._ganttQaHistory.push(Object.assign({ role: 'ai', text: text, uid: newUid(), question: question, route: route }, extra || {}));
    }
    function finish(input) { window._renderGanttQaMessages(); if (input) input.focus(); }

    // ── 자재내역 패턴 조회(새 로컬 명령) ─────────────────────────────
    async function runPatternLookup(question, pattern, input, route) {
        pushUser(question, input, route);
        window._ganttQaHistory.push({ role: 'ai', text: '⏳ ' + T('SAP에서 자재내역 "' + pattern + '" 패턴을 검색하는 중...', 'Searching SAP for description pattern "' + pattern + '"...'), pending: true });
        window._renderGanttQaMessages();
        var reply;
        try {
            var p = fetch(API + '/sap-material-pattern?pattern=' + encodeURIComponent(pattern));
            var res = await (window._withTimeout ? window._withTimeout(p, 100000, T('SAP 패턴 조회 시간 초과', 'SAP pattern lookup timed out')) : p);
            if ((res.headers.get('content-type') || '').indexOf('json') < 0) throw new Error(T('백엔드가 구버전이거나 꺼져 있습니다 — kortek_backend.bat을 다시 실행해주세요.', 'Backend is outdated or offline — restart kortek_backend.bat.'));
            var d = await res.json();
            if (!d.ok) throw new Error(d.error || T('알 수 없는 오류', 'unknown error'));
            var list = d.materials || [];
            if (!list.length) {
                reply = '🔎 ' + T('자재내역 "' + pattern + '" 패턴에 매치되는 자재가 없습니다. 앞뒤에 *를 붙여 범위를 넓혀보세요(예: *' + pattern.replace(/\*/g, '') + '*).', 'No materials match "' + pattern + '". Try widening it with * on both sides.');
            } else {
                var shown = list.slice(0, 150);
                reply = '🔎 ' + T('자재내역 "' + pattern + '" 패턴 매치 ' + list.length + '건', 'Description pattern "' + pattern + '" matched ' + list.length + ' material(s)') + '\n' +
                    T('자재번호\t자재내역', 'Material\tDescription') + '\n' +
                    shown.map(function (x) { return x.matnr + '\t' + (x.desc || ''); }).join('\n') +
                    (list.length > shown.length ? '\n' + T('… 외 ' + (list.length - shown.length) + '건(화면에는 150건까지 표시)', '… and ' + (list.length - shown.length) + ' more (first 150 shown)') : '') +
                    '\n\n' + T('💡 이 자재들의 승인원(P01)을 받으려면: "' + pattern + '로 조회된 아이템 승인원 다운로드해줘"', '💡 To download their P01 documents: "download approval docs for items matching ' + pattern + '"');
            }
        } catch (e) {
            reply = '⚠️ ' + T('SAP 패턴 조회에 실패했습니다: ', 'SAP pattern lookup failed: ') + (e && e.message ? e.message : e);
        }
        window._ganttQaHistory.pop();
        pushAi(reply, question, route);
        finish(input);
    }

    // ── 지원하지 않는 SAP 요청: 가짜 답변 대신 안내 + 적립 ─────────────
    function runUnsupported(question, input, route, cls) {
        pushUser(question, input, route);
        var en = window._currentLang === 'en';
        var caps = window._qaMatchCapabilities ? window._qaMatchCapabilities(question).slice(0, 2) : [];
        var msg = '🏭 ' + T('SAP 요청으로 이해했지만, 아직 이 유형은 직접 조회하지 못합니다. (SAP에 없는 정보를 지어내지 않기 위해 프로젝트 데이터로 추측해 답하지 않았습니다.)',
            'Understood as a SAP request, but this type is not supported yet. (I did not guess from project data to avoid making things up.)');
        if (route && route.reasons && route.reasons.length) msg += '\n' + T('이해한 근거: ', 'Why: ') + route.reasons.join(' / ');
        if (caps.length) msg += '\n\n' + T('가장 비슷한 기능: ', 'Closest capability: ') + caps.map(function (c) { return c.title + ' (' + Math.round(c.score * 100) + '%)'; }).join(', ');
        msg += '\n\n' + T('지금 가능한 SAP 요청:', 'Supported SAP requests now:') + '\n' + window._qaCapabilityListText(en);
        msg += '\n\n📌 ' + T('이 요청을 "새 SAP 기능 후보"로 적립했습니다. 같은 요청이 쌓이면 우선순위로 반영됩니다. 어느 화면(tcode)에서 어떻게 하시는지 🚩 신고에 적어주시면 구현이 훨씬 빨라집니다.',
            'This request was logged as a "new SAP capability candidate". If the same request repeats it gets prioritized. Telling us the screen (tcode) and steps via 🚩 speeds it up.');
        pushAi(msg, question, route);
        logRoute('sap_unsupported', question, { cls: cls || 'sap', reasons: (route && route.reasons) || [] });
        finish(input);
    }

    // ── 연결(chain) 요청 자동 감지 — 2026-09-21, 사용자 요청 ─────────────────────────────────────────
    // 사례: "엑셀로 출력해서 박용훈 한테 메일로 보내줘" → 엑셀 저장(로컬 명령)만 하고 "메일로 보내기"는 조용히 무시됐다.
    // 로컬 명령(엑셀 저장/SAP 패턴 조회/문서 다운로드 등)이 끝난 답변에 뒷부분(메일/등록/알람 연결)이 요청돼 있었는데 처리되지
    // 않았으면, 그 사실을 답변에 알리고 "새 기능/연결 요청(chain_unsupported)"으로 적립한다(리포트 학습 탭에서 수요순으로 보임).
    // AI가 직접 답한 경로(route가 있고 local이 아님)는 대상이 아니다 — 그쪽은 AI가 메일 초안 등을 스스로 처리할 수 있다.
    function localFlowDone() {
        return !(window._ganttQaPoDraft || window._ganttQaBomDraft || window._ganttQaApprovalDraft || window._ganttQaSapDocClarify ||
            window._ganttQaPendingChoiceDropdown || window._ganttQaPendingConfirmButtons);
    }
    window._qaAfterSend = function (rawQuestion, histLenBefore) {
        var pf = window._qaParsePrefix(rawQuestion), q = pf ? pf.question : String(rawQuestion || '');
        var chain = window._qaDetectChain ? window._qaDetectChain(q) : [];
        if (!chain.length) return false;
        var h = window._ganttQaHistory || [], m = null;
        for (var i = h.length - 1; i >= histLenBefore; i--) { if (h[i].role === 'ai' && !h[i].pending && !h[i].error) { m = h[i]; break; } }
        if (!m || m.chainNoted) return false;
        if (m.route && !m.route.local) return false;      // AI가 직접 답한 경로
        if (!localFlowDone()) return false;               // 여러 턴 draft가 아직 진행 중
        var en = window._currentLang === 'en';
        var labels = chain.map(function (c) { return en ? c.labelEn : c.label; }).join(', ');
        m.text += '\n\n📌 ' + T('요청하신 "' + labels + '" 연결은 아직 지원하지 않아 앞부분만 처리했습니다. 이 연결 요청을 "새 기능 요청"으로 적립했습니다 — 같은 요청이 쌓이면 우선순위로 반영됩니다.',
            'The follow-up "' + labels + '" is not supported yet, so only the first part was done. It was logged as a new feature request and will be prioritized if it repeats.');
        m.chainNoted = true;
        try {
            if (window._issueLog) {
                var mq = window._issueMask ? window._issueMask(q, 160) : '';
                window._issueLog({ domain: 'qa', kind: 'chain_unsupported', rid: '', route: '',
                    params: { q: mq, qLen: q.length, sig: window._qaSigFor(mq, (window._qaMatchCapabilities ? window._qaMatchCapabilities(q) : []).concat(window._qaMatchAppCapabilities ? window._qaMatchAppCapabilities(q) : []), chain.map(function (c) { return c.id; })), chain: chain.map(function (c) { return c.id; }),
                        caps: window._qaMatchAppCapabilities ? window._qaMatchAppCapabilities(q).slice(0, 3) : [], prevRoute: m.route ? m.route.cls : 'local' } });
            }
        } catch (e) { /* 수집 실패는 무시 */ }
        window._renderGanttQaMessages();
        return true;
    };
    (function wrapSend(tries) {
        if (typeof window.sendGanttQaMessage === 'function' && !window.sendGanttQaMessage._chainWrapped) {
            var orig = window.sendGanttQaMessage;
            window.sendGanttQaMessage = async function () {
                var inp = document.getElementById('gantt-qa-input'), q = inp ? inp.value.trim() : '', n = (window._ganttQaHistory || []).length;
                var r = await orig.apply(this, arguments);
                try { window._qaAfterSend(q, n); } catch (e) { /* 라우터 부가 기능 실패는 무시 */ }
                return r;
            };
            window.sendGanttQaMessage._chainWrapped = true;
        } else if (tries < 20) { setTimeout(function () { wrapSend(tries + 1); }, 500); }
    })(0);

    // ── 일반 추론용 가벼운 프롬프트(프로젝트 JSON을 싣지 않음) ────────────
    window._qaBuildGeneralPrompt = function (question, hist) {
        var en = window._currentLang === 'en';
        var h = (hist || []).filter(function (m) { return m && !m.pending && m.text; }).slice(-6)
            .map(function (m) { return (m.role === 'user' ? 'User: ' : 'AI: ') + String(m.text).slice(0, 600); }).join('\n');
        var rules = en
            ? 'You are the in-app assistant of the KORTEK Gantt Chart web app. This question was classified as a general knowledge/reasoning question that does NOT need the project data or live SAP data. Do not pretend to have project data or SAP lookup results. If you are unsure, say so. If it actually needs project data or a SAP lookup, say that in one sentence. Answer concisely in English.'
            : '당신은 KORTEK 간트차트 웹앱의 AI 문답 도우미입니다. 이 질문은 프로젝트 데이터나 SAP 실데이터가 필요 없는 일반 지식/추론 질문으로 분류되었습니다. 프로젝트 데이터나 SAP 조회 결과를 가진 것처럼 답하지 마세요. 확실하지 않으면 확실하지 않다고 말하고, 실제로는 프로젝트 데이터나 SAP 조회가 필요한 질문이면 그 사실을 한 문장으로만 알려주세요. 핵심 위주로 간결하게 한국어로 답하세요.';
        return rules + (h ? '\n\n[대화 기록]\n' + h : '') + '\n\n[질문]\n' + question;
    };

    // ── 라우팅 진입점(04h가 로컬 명령 이후, AI 호출 직전에 부른다) ─────────
    window._qaRouteAndMaybeHandle = async function (question, input) {
        var forced = window._qaTurnForced || window._qaForceClass || '';
        window._qaTurnForced = null;                       // 접두어 지정은 그 턴에만 적용(칩은 유지)
        var res = window._qaClassify(question);
        var cls = forced || (res.confident ? res.cls : 'auto');
        var route = { cls: cls, forced: !!forced, conf: res.confident, scores: res.scores, reasons: (res.reasons[cls] || []).slice(0, 4) };
        window._qaLastRoute = route;
        if (cls === 'sap') {
            route.local = true;                                   // 라우터가 직접 처리(로컬 명령) — 연결 요청 감지 대상
            if (res.patterns.length) { await runPatternLookup(question, res.patterns[0], input, route); return { handled: true, route: route }; }
            if (res.materials.length || ((/sap/i.test(question) || res.tcodes.length) && SCREEN_RE.test(question))) { route.local = false; route.useSapContext = true; return { handled: false, route: route }; }
            runUnsupported(question, input, route, cls);
            return { handled: true, route: route };
        }
        if (cls === 'general') route.skipProject = true;
        return { handled: false, route: route };
    };
})();
