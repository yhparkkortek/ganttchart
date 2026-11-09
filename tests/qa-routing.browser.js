/* ============================================================================
   🧭 tests/qa-routing.browser.js — AI 문답 "명령 구분(라우팅)" 관찰 하네스
   (2026-11-09, 사용자: "문답창에 직접 명령 작성해서 구분이 잘되는지 TEST 해보고 디버깅해줘")

   무엇을 보는가: 질문 하나를 **진짜 입구**(`sendGanttQaMessage`)에 넣고,
   그 질문이 **어느 도메인으로 갔는지**를 관찰한다. 답의 품질이 아니라 **분류**만 본다.

   왜 이 모양인가 (CLAUDE.md "고쳤다의 정의"):
     · 입구는 진짜다 — js/04h 의 4,325줄·if 495개·return 212개를 그대로 지난다.
     · 가짜는 **바깥 경계 셋뿐**:
         ① `callAiBackend`  — 실제 AI 호출 금지(무료 키는 하루 20회다. 라우팅은 호출 **전에** 끝난다)
         ② `fetch` 중 도메인 엔드포인트(`/sap-*` `/gw/*` `/insa/*` `/doc/*` `/send-telegram`)
            — 실제 SAP/그룹웨어/인사 조회·로그인 시도 금지. **그 URL 이 곧 라우팅 결과다.**
         ③ 프로젝트 저장(`saveToGoogleDrive`) — 테스트가 남의 파일을 건드리지 않게
       그 밖(판정·어휘·프롬프트 조립·칩·로컬 명령)은 전부 **진짜 코드**로 돈다.

   쓰는 법 (앱 문답창이 있는 탭의 콘솔):
       await __qaRouteTest()                     // 기본 코퍼스 전부
       await __qaRouteTest({only:'sap'})         // 한 도메인만
       await __qaRouteTest({corpus:[{q:'...', want:'sap'}]})
   결과: 표 + 기대와 다른 것 목록 + `window.__qaRouteLast`(원자료).
   ⚠️ 콘솔에 **붙여넣는 게 기본**이다. 스크립트로 들여올 땐 `raw.githubusercontent.com` 이 아니라
      **앱과 같은 Pages 경로**(`/ganttchart/tests/qa-routing.browser.js?cb=…`)에서 받을 것 —
      raw 는 `?cb=` 를 붙여도 옛 사본을 준다(2026-11-09 실측: 고친 하네스가 안 와서 10분 날렸다).

   ⚠️ 이 하네스는 **AI 답 품질을 검증하지 않는다** — `callAiBackend` 가 가짜이므로
      "AI 가 잘 답하는가" 는 여기서 알 수 없다. 여기서 아는 것은 **어디로 보냈는가** 뿐이다.
   ============================================================================ */
(function () {
    'use strict';

    // ── 관찰로 라우트를 가리는 규칙 — **앱이 들고 있으면 그걸 쓴다**(js/64 `QA_ROUTE_RULES`).
    //    두 벌로 두면 하네스와 런타임이 서로 다른 답을 내고, 그게 제일 고치기 어려운 종류다.
    //    아래는 js/64 가 없는(옛) 앱에서도 돌게 두는 사본이다.
    var ROUTE_RULES = window.QA_ROUTE_RULES || [
        { route: 'sap',      url: /\/sap[-/]/i },
        { route: 'gw',       url: /\/gw\// },
        { route: 'insa',     url: /\/insa\// },
        { route: 'doc',      url: /\/doc\// },
        { route: 'telegram', url: /\/send-telegram|api\.telegram\.org/ },
        { route: 'mailsrv',  url: /\/mail[-/]|\/pop3|\/imap/i }
    ];
    var AI_MARK = [
        { route: 'toolloop', re: /\[\[\s*TOOL\s*:|\[\[\s*NO_TOOL\s*\]\]/ },
        { route: 'ai-gantt', re: /간트|프로젝트 일정|업무\(WBS\)|WBS/ }
    ];

    // ── 기본 코퍼스 — `want` 는 **설계 의도**(지금 동작이 아니다) ────────────────
    //    ambig: 둘 다 말이 되는 것(되묻기가 정답인 자리). 사고 재현은 bug: 로 표시.
    var CORPUS = [
        // 🏭 SAP
        { q: '999001 재고 확인해줘',              want: 'sap' },
        { q: '999001 가격 알려줘',                want: 'sap' },
        { q: '999001 BOM 보여줘',                 want: 'local', note: '먼저 ZPP033 레이아웃을 고르게 되묻는다(정상)' },
        { q: '999001 제품에 사용된 패널명 확인해줘', want: 'sap' },
        // ⚠️ [2026-11-09 실측] "🏭 SAP 요청으로 이해했지만, 아직 이 유형은 직접 조회하지 못합니다" 로
        //    끝난다 — SAP **의도는** 맞혔는데 `matlist`(ZMM009_ROW_CAPS, js/33) 로는 안 붙는다.
        //    즉 어휘 문제가 아니라 **의도→기능 매칭**이 비어 있는 자리. 남은 일.
        { q: 'ZMM009 자재코드 목록 조회',          want: 'sap', note: '미해결 — 의도는 SAP, 기능 매칭 실패' },
        // 🏢 그룹웨어 — 메일 조회의 자연스러운 말들(2026-11-09에 전부 빠져 있던 자리)
        { q: '오늘 받은 메일 목록 보여줘',          want: 'gw' },
        { q: '메일 목록 보여줘',                   want: 'gw' },
        { q: '받은 메일 보여줘',                   want: 'gw' },
        { q: '메일 확인해줘',                      want: 'gw' },
        { q: '이번 주 메일 보여줘',                want: 'gw', note: '여기가 막히면 notKw 가 너무 넓다' },
        { q: '지난주 게시판 공지 요약해줘',         want: 'gw' },
        // ⚙️ 아래 셋은 **일부러** 도구 루프로 보낸다(결정론 블록이 없다) — 기간·인자를 루프가 다룬다.
        //    js/32 `gw_calendar` 주석 참고. 즉 'toolloop' 이 정답이고, 'gw' 가 나오면 누가 블록을 새로 만든 것.
        //    ⚠️ 대신 **질문 하나에 AI 2~3회**를 쓴다(실측) — 무료 키 하루 20회의 진짜 소비처다.
        { q: '이번 주 그룹웨어 일정 알려줘',        want: 'toolloop', note: 'gw_calendar 도구가 처리(설계)' },
        { q: '결재 대기 문서 뭐 있어?',             want: 'toolloop', note: 'gw_approval_box 도구가 처리(설계)' },
        // 🧑‍💼 인사관리 — insa_* 도구(설계)
        { q: '내 근무계획 조회해줘',                want: 'toolloop', note: 'insa_workplan_form 도구' },
        // 📁 문서 저장소 — gw_docs 도구(설계)
        { q: 'PANEL 사양서 찾아줘',                 want: 'toolloop', note: 'gw_docs 도구' },
        // 📒 앱(열린 프로젝트)
        { q: '이 프로젝트 이름 뭐야',               want: 'local' },
        { q: '지연된 업무 알려줘',                  want: 'local|ai-gantt' },
        { q: '이번 주 마감 업무 뭐야',              want: 'local|ai-gantt' },
        { q: '주간 요약해줘',                       want: 'local' },
        { q: '오늘 보고 초안',                      want: 'local' },
        // 💬 자유추론
        { q: '간트차트 작성 팁 알려줘',             want: 'ai-gantt|toolloop' },
        { q: '리튬이온 배터리 원리 설명해줘',        want: 'ai-gantt|toolloop' },
        // ⚠️ 사고 재현·애매한 것
        { q: '요약해줘',                            want: 'ambig', note: '대상이 없다 — 되묻는 게 맞다' },
        { q: '프로젝트 조회해줘',                   want: 'ambig', note: '2026-10-12: 자재내역으로 샜던 문장' },
        // 🧭 2026-11-09 회귀 — 지시어가 붙은 "그 메일"은 조회가 아니다(목록 재조회 금지)
        { q: '아래 메일을 요약해줘',                want: 'toolloop|ai|ai-gantt', note: '11-02 사고 문장 — gw 로 가면 회귀' },
        { q: '위 메일 요약해줘',                    want: 'toolloop|ai|ai-gantt' },
        { q: '그룹웨어 메일 보내줘',                want: 'local|toolloop|ai', note: '발송은 조회 블록에 걸리면 안 된다' },
        { q: '그룹웨어 메일 요약해줘',              want: 'gw', note: '지시어가 없으면 조회가 맞다' },
        { q: '일정 알려줘',                         want: 'ambig', note: '앱 일정 ↔ 그룹웨어 일정' },
        { q: '승인원 만들어줘',                     want: 'ambig', note: 'SAP 표지 ↔ 그룹웨어 기안 — 되묻기가 설계' }
    ];

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function H() { window._ganttQaHistory = window._ganttQaHistory || []; return window._ganttQaHistory; }
    function cut(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n || 160); }

    window.__qaRouteTest = async function (opts) {
        opts = opts || {};
        var corpus = opts.corpus || CORPUS;
        if (opts.only) corpus = corpus.filter(function (c) { return (c.want || '').indexOf(opts.only) >= 0; });
        var perMs = opts.perMs || 30000, quietMs = opts.quietMs || 1200;

        if (typeof window.sendGanttQaMessage !== 'function') { console.error('sendGanttQaMessage 미로드'); return; }
        var input = document.getElementById('gantt-qa-input');
        if (!input && window.openGanttQaModal) { window.openGanttQaModal(); await sleep(400); input = document.getElementById('gantt-qa-input'); }
        if (!input) { console.error('gantt-qa-input 없음 — 문답창을 한 번 열어 주세요'); return; }

        // ── 경계 가짜 셋 ────────────────────────────────────────────────────
        var obs = { fetches: [], ai: [], saves: 0, alerts: [], toasts: [] };
        var oFetch = window.fetch, oAi = window.callAiBackend, oSave = window.saveToGoogleDrive;
        var oAlert = window.alert, oToast = window.showToast;
        var BLOCK = /\/sap[-/]|\/gw\/|\/insa\/|\/doc\/|\/send-telegram|api\.telegram\.org|\/mail-|\/pop3|\/imap/i;
        window.fetch = function (u, init) {
            var url = (u && u.url) || String(u || '');
            if (BLOCK.test(url)) {
                obs.fetches.push(url);
                return Promise.resolve(new Response(
                    JSON.stringify({ ok: false, status: 'error', message: '(라우팅 테스트: 경계 차단)' }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
            return oFetch.apply(this, arguments);
        };
        window.callAiBackend = async function (key, prompt) {
            obs.ai.push(String(prompt || ''));
            // 도구 루프는 바로 빠져나오게 해 둔다(라우팅만 보면 되므로)
            if (/\[\[\s*NO_TOOL\s*\]\]/.test(String(prompt || ''))) return '[[NO_TOOL]]';
            return '(라우팅 테스트: 가짜 AI 응답)';
        };
        window.saveToGoogleDrive = function () { obs.saves++; return Promise.resolve({ ok: true, test: true }); };
        window.alert = function (m) { obs.alerts.push(cut(m, 120)); };
        window.showToast = function (m, k) { obs.toasts.push(cut(m, 120) + (k ? ' [' + k + ']' : '')); };

        var rows = [], keep = input.value;
        // 🧪 기록기(js/64)에 "이건 하네스다" 를 알린다 — 그 줄은 `_qaRouteStats()` 집계에서 빠진다.
        window.__qaRouteTestRunning = true;
        try {
            for (var i = 0; i < corpus.length; i++) {
                var c = corpus[i];
                obs.fetches = []; obs.ai = []; obs.alerts = []; obs.toasts = [];
                var n = H().length, t0 = Date.now();
                input.value = c.q;
                try { await window.sendGanttQaMessage(); } catch (e) { obs.alerts.push('throw: ' + e.message); }
                // 조용해질 때까지
                var lastLen = -1, quiet = Date.now();
                while (Date.now() - t0 < perMs) {
                    var after = H().slice(n);
                    var pend = window._ganttQaSending || after.some(function (m) { return m && m.pending; });
                    if (H().length !== lastLen) { lastLen = H().length; quiet = Date.now(); }
                    if (!pend && Date.now() - quiet >= quietMs) break;
                    await sleep(250);
                }
                var bubbles = H().slice(n).filter(function (m) { return m && m.role === 'ai' && !m.pending; })
                    .map(function (m) { return cut(m.rawHtml ? (m.tgText || '[표/칩]') : m.text, 150); });
                // 관찰 → 라우트
                var got = '';
                for (var r = 0; r < ROUTE_RULES.length && !got; r++) {
                    if (obs.fetches.some(function (u) { return ROUTE_RULES[r].url.test(u); })) got = ROUTE_RULES[r].route;
                }
                if (!got && obs.ai.length) {
                    for (var a = 0; a < AI_MARK.length && !got; a++) {
                        if (obs.ai.some(function (p) { return AI_MARK[a].re.test(p); })) got = AI_MARK[a].route;
                    }
                    got = got || 'ai';
                }
                got = got || (bubbles.length ? 'local' : 'none');
                var okWant = (c.want === 'ambig') ? null : (c.want || '').split('|').indexOf(got) >= 0;
                rows.push({ q: c.q, want: c.want, got: got, ok: okWant, ms: Date.now() - t0,
                            fetch: obs.fetches.slice(0, 3), ai: obs.ai.length, bubbles: bubbles,
                            alerts: obs.alerts.slice(0, 2), toasts: obs.toasts.slice(0, 2), note: c.note || '' });
                console.log('%s  %-34s want=%-18s got=%s', okWant === false ? '❌' : (okWant === null ? '🤔' : '✅'),
                            c.q, c.want, got);
                await sleep(300);
            }
        } finally {
            window.fetch = oFetch; window.callAiBackend = oAi; window.saveToGoogleDrive = oSave;
            window.alert = oAlert; window.showToast = oToast;
            input.value = keep;
            window.__qaRouteTestRunning = false;
        }
        window.__qaRouteLast = rows;
        var bad = rows.filter(function (r) { return r.ok === false; });
        var amb = rows.filter(function (r) { return r.ok === null; });
        console.table(rows.map(function (r) { return { q: r.q, want: r.want, got: r.got, ai: r.ai, ms: r.ms, first: (r.bubbles[0] || '').slice(0, 60) }; }));
        console.log('결과: 일치 %d · 어긋남 %d · 애매(판단 필요) %d / 총 %d',
                    rows.length - bad.length - amb.length, bad.length, amb.length, rows.length);
        if (obs.saves) console.warn('⚠️ 저장이 %d번 시도됐다(막았다) — 입구가 쓰기 경로를 탔다는 뜻', obs.saves);
        return { rows: rows, bad: bad, ambiguous: amb };
    };
    console.log('🧭 __qaRouteTest 준비됨 — await __qaRouteTest() 로 실행');
})();
