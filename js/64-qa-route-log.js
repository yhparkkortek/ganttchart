/* ============================================================================
   🧭 js/64-qa-route-log.js — AI 문답이 **어디로 보냈는지**를 기록한다 (2026-11-09)

   왜: 입구(`sendGanttQaMessage`, js/04h)는 4,325줄 한 함수에 `if` 495개·`return` 212개다.
   우선순위가 **줄 번호**라 새 어휘가 옛 기능을 먹는 사고가 반복됐는데(2026-10-12 프로젝트
   조회→자재내역, 11-02 메일 요약→목록 재조회, 11-09 메일 조회 어휘가 거꾸로),
   **어디로 갔는지를 아무도 기록하지 않아** 사람이 "이거 왜 이래" 할 때만 드러났다.
   → 고치기 전에 **재는 것부터**. 이 파일이 라벨을 만든다.

   어떻게: **212개 return 을 건드리지 않는다.** 입구를 한 겹 감싸고(js/33·62·63 과 같은 자리)
   그 한 번의 호출 동안 일어난 일을 관찰해 라우트를 가린다 —
     · `fetch` 로 어느 도메인을 불렀나(`/sap-*` `/gw/*` `/insa/*` `/doc/*` …) ← 가장 강한 증거
     · `callAiBackend` 를 몇 번 불렀나, 프롬프트에 `[[TOOL:` 표식이 있나(도구 루프인가)
     · 아무것도 안 불렀으면 로컬 명령(결정론 블록)
   **관찰만 한다 — 응답·동작을 바꾸지 않는다.** 실패는 전부 삼키고 기록만 포기한다.

   같이 적는 것(공짜 라벨):
     · `_qaClassify`(js/33)의 점수·확신 — **이미 있는 점수 라우터**가 뭐라고 봤는지.
       if-체인과 **다르게 본 질문들**이 곧 "구분을 고쳐야 할 목록"이다.
     · 재질문(`_ganttQaQuestionSimilarity`) — 방금 비슷한 걸 또 물었으면 앞 기록에 `reask:true`.
       **오라우팅 의심 신호**다(사람이 답을 못 얻어 다시 묻는다).

   보기: `_qaRouteStats()` · 원자료 `_qaRouteLog()` · 끄기 `localStorage.gantt_qa_route_off='1'`
   검증: `node tests/qa-route-log.test.js` · 브라우저 `tests/qa-routing.browser.js`
   ============================================================================ */
(function () {
    'use strict';

    // ── 데이터 — 관찰 → 라우트 규칙(위에서 아래로 첫 일치). 하네스도 이걸 쓴다 ──────
    window.QA_ROUTE_RULES = window.QA_ROUTE_RULES || [
        { route: 'sap',      url: /\/sap[-/]/i },
        { route: 'gw',       url: /\/gw\// },
        { route: 'insa',     url: /\/insa\// },
        { route: 'doc',      url: /\/doc\// },
        { route: 'telegram', url: /\/send-telegram|api\.telegram\.org/ },
        { route: 'mailsrv',  url: /\/mail[-/]|\/pop3|\/imap/i }
    ];
    window.QA_ROUTE_LOG_CFG = window.QA_ROUTE_LOG_CFG || {
        key: 'gantt_qa_route_log_v1',
        offKey: 'gantt_qa_route_off',
        max: 300,                 // 링 버퍼(기존 gantt_qa_tool_log_v1 과 같은 크기)
        qMax: 200,                // 질문은 이만큼만 저장(원문 보관 목적이 아니다)
        reaskWindowMs: 300000,    // 5분 안에 비슷한 질문을 또 하면 "다시 물었다"
        reaskSim: 0.6,            // `_ganttQaQuestionSimilarity` 임계치
        toolMark: /\[\[\s*TOOL\s*:|\[\[\s*NO_TOOL\s*\]\]/
    };
    var C = window.QA_ROUTE_LOG_CFG;

    function off() { try { return localStorage.getItem(C.offKey) === '1'; } catch (e) { return false; } }
    function read() {
        try { var v = JSON.parse(localStorage.getItem(C.key) || '[]'); return Array.isArray(v) ? v : []; }
        catch (e) { return []; }
    }
    function write(list) {
        try { localStorage.setItem(C.key, JSON.stringify(list.slice(-C.max))); } catch (e) { /* 꽉 찼으면 포기 */ }
    }
    window._qaRouteLog = function () { return read(); };

    /** 관찰 한 묶음 → 라우트 이름. 순수 함수(하네스·node 검증이 같은 걸 쓴다). */
    window._qaRouteOf = function (obs) {
        var urls = (obs && obs.urls) || [], ai = (obs && obs.ai) || [];
        for (var i = 0; i < window.QA_ROUTE_RULES.length; i++) {
            var r = window.QA_ROUTE_RULES[i];
            for (var u = 0; u < urls.length; u++) if (r.url.test(urls[u])) return r.route;
        }
        if (ai.length) {
            for (var a = 0; a < ai.length; a++) if (C.toolMark.test(String(ai[a] || ''))) return 'toolloop';
            return 'ai';
        }
        return (obs && obs.bubbles) ? 'local' : 'none';
    };

    /** 집계 — 도메인별 건수·AI 호출·재질문율. "어디가 비싼가"와 "어디가 자주 틀리나". */
    window._qaRouteStats = function () {
        var rows = read(), by = {}, cls = {};
        rows.forEach(function (r) {
            var b = by[r.route] = by[r.route] || { n: 0, ai: 0, reask: 0, ms: 0 };
            b.n++; b.ai += (r.ai || 0); b.reask += (r.reask ? 1 : 0); b.ms += (r.ms || 0);
            if (r.cls) {
                var k = r.cls + '→' + r.route;
                cls[k] = (cls[k] || 0) + 1;
            }
        });
        Object.keys(by).forEach(function (k) {
            var b = by[k];
            b.aiPerQ = Math.round(b.ai / b.n * 100) / 100;
            b.reaskPct = Math.round(b.reask / b.n * 100);
            b.msAvg = Math.round(b.ms / b.n);
        });
        var out = { total: rows.length, byRoute: by, classifierVsRoute: cls,
                    aiTotal: rows.reduce(function (s, r) { return s + (r.ai || 0); }, 0),
                    zeroAi: rows.filter(function (r) { return !r.ai; }).length,
                    reask: rows.filter(function (r) { return r.reask; }).length };
        try { console.table(by); } catch (e) { /* 콘솔 없음 */ }
        return out;
    };

    // ── 입구 한 겹 — js/33·62·63 과 같은 방식(마지막에 로드돼 가장 바깥) ───────────
    function wrap() {
        if (typeof window.sendGanttQaMessage !== 'function' || window.sendGanttQaMessage._routeLogWrapped) return false;
        var inner = window.sendGanttQaMessage;
        var wrapped = async function () {
            if (off()) return await inner.apply(this, arguments);
            var input = document.getElementById('gantt-qa-input');
            var q = input ? String(input.value || '') : '';
            var obs = { urls: [], ai: [], bubbles: 0 };
            var t0 = Date.now();
            var hist = window._ganttQaHistory || [];
            var n0 = hist.length;
            var oFetch = window.fetch, oAi = window.callAiBackend;
            // 가로채되 **그대로 통과시킨다** — 반환값·예외를 손대지 않는다.
            try {
                window.fetch = function (u) {
                    try { obs.urls.push((u && u.url) || String(u || '')); } catch (e) { /* 기록 실패 무시 */ }
                    return oFetch.apply(this, arguments);
                };
                if (typeof oAi === 'function') {
                    window.callAiBackend = function (key, prompt) {
                        try { obs.ai.push(String(prompt || '').slice(0, 400)); } catch (e) { /* 무시 */ }
                        return oAi.apply(this, arguments);
                    };
                }
            } catch (e) { /* 감싸기 실패 — 그냥 원래대로 */ }
            try {
                return await inner.apply(this, arguments);
            } finally {
                window.fetch = oFetch; if (typeof oAi === 'function') window.callAiBackend = oAi;
                try {
                    var h = window._ganttQaHistory || [];
                    obs.bubbles = h.slice(n0).filter(function (m) { return m && m.role === 'ai' && !m.pending; }).length;
                    record(q, obs, Date.now() - t0);
                } catch (e) { /* 기록은 실패해도 조용히 */ }
            }
        };
        wrapped._routeLogWrapped = true;
        window.sendGanttQaMessage = wrapped;
        return true;
    }

    function record(q, obs, ms) {
        if (!String(q || '').trim()) return;
        var rows = read();
        // 🔁 재질문 = 오라우팅 의심. 바로 앞 기록과 비슷하고 5분 안이면 거기에 표시한다.
        var prev = rows[rows.length - 1];
        if (prev && prev.q && window._ganttQaQuestionSimilarity) {
            try {
                var dt = Date.now() - Date.parse(prev.at || '');
                if (isFinite(dt) && dt <= C.reaskWindowMs &&
                    window._ganttQaQuestionSimilarity(prev.q, q) >= C.reaskSim) {
                    prev.reask = true;
                }
            } catch (e) { /* 유사도 실패 무시 */ }
        }
        var cls = null, caps = [];
        try { if (window._qaClassify) cls = window._qaClassify(q); } catch (e) { /* 분류 실패 무시 */ }
        try { caps = (window._qaMatchCapabilities ? window._qaMatchCapabilities(q) : []).slice(0, 2)
                        .map(function (c) { return c.id + ':' + (Math.round((c.score || 0) * 100) / 100); }); } catch (e) { /* 무시 */ }
        rows.push({
            at: new Date().toISOString(),
            q: String(q).slice(0, C.qMax),
            route: window._qaRouteOf(obs),
            ai: obs.ai.length,
            urls: obs.urls.filter(function (u) { return /\/(sap|gw|insa|doc|mail)[-/]/i.test(u); }).slice(0, 3),
            bubbles: obs.bubbles,
            ms: ms,
            // 📊 이미 있는 **점수 라우터**(js/33)가 같은 질문을 뭐라고 봤는지 — if-체인과의 차이가
            //    곧 "구분을 고쳐야 할 목록"이다(점수 라우터는 지금 칩·배지에만 쓰인다).
            cls: cls ? cls.cls : '',
            clsOk: cls ? !!cls.confident : null,
            caps: caps
        });
        write(rows);
    }

    // 입구는 다른 파일들이 감싸므로(js/33·62·63) **그 뒤에** 한 번 더 감싼다 — 늦게 뜨면 재시도.
    if (!wrap()) {
        var tries = 0;
        var t = setInterval(function () { if (wrap() || ++tries > 40) clearInterval(t); }, 500);
    }

    // 🧹 저장소 의사(js/34)에 새 키를 알린다 — 새 localStorage 키는 레지스트리에 적는 규칙
    try {
        if (window.STORAGE_REGISTRY) {
            [[C.key, 'AI 문답 라우팅 기록(최근 300건)', 'QA routing log'],
             [C.offKey, 'AI 문답 라우팅 기록 끄기', 'QA routing log kill switch']]
            .forEach(function (e) {
                if (!window.STORAGE_REGISTRY.some(function (r) { return r.key === e[0]; })) {
                    // ⚠️ `strategy.type` 은 js/34 가 아는 것만 — 'array'(keep/order)·'drop'·'fn'·'byProject'.
                    //    모르는 type 은 "줄일 게 없다"로 떨어진다(= 손대지 않는다).
                    window.STORAGE_REGISTRY.push({ key: e[0], label: e[1], labelEn: e[2],
                        cls: e[0] === C.offKey ? 'setting' : 'log',
                        strategy: e[0] === C.offKey ? { type: 'keep' }
                                                    : { type: 'array', keep: C.max, order: 'newest-last' } });
                }
            });
        }
    } catch (e) { /* 레지스트리 없음 */ }
})();
