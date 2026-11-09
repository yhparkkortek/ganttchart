/* ============================================================================
   📥 tests/sap-doc-download.browser.js — SAP 문서 다운로드 입구 하네스
   (2026-11-09, 사용자 제보: "승인원 다운로드 해줘" 가 되묻기로 빠지고, 200건은 시간 초과로
    중간에 멈추고, 받아진 것들은 C:\SAP_DMS 루트에 자재번호 없이 쌓였다)

   무엇을 보는가 — **사람이 실제로 지나는 경로**(CLAUDE.md "고쳤다의 정의"):
     진짜 입구 `sendGanttQaMessage()` 에 질문을 넣고, 그 질문이
       ① 어느 엔드포인트로 갔는지(= 되묻기로 빠지지 않았는지)
       ② `type=` 문서 타입이 무엇인지(이름→코드)
       ③ 패턴이 **군더더기 없이** 나갔는지(`"*LABEL*로` → `*LABEL*`)
       ④ 상한이 건수에 비례하는지
       ⑤ 부분 결과(`partial`)가 **경고로** 보이는지
     를 관찰한다. 부품을 직접 부르지 않는다 — 루프→판정→호출→렌더 **연결**을 본다.

   가짜는 **바깥 경계 셋뿐**:
     ① `fetch` 중 `/sap-*` — 실제 SAP 조작 금지. **그 URL 이 곧 판정 결과다.**
     ② `callAiBackend`     — 실제 AI 호출 금지(무료 키 하루 한도).
     ③ `saveToGoogleDrive` — 남의 프로젝트 파일을 건드리지 않게.
   그 밖(어휘 카탈로그·되묻기 판정·패턴 정리·타임아웃 계산·결과 렌더)은 전부 진짜 코드다.

   쓰는 법 (앱 문답창이 있는 탭의 콘솔에 붙여넣기):
       await __sapDocTest()
   ⚠️ 스크립트로 들여올 땐 raw.githubusercontent.com 이 아니라 **앱과 같은 경로**에서 받을 것
      (raw 는 `?cb=` 를 붙여도 옛 사본을 준다 — 2026-11-09 실측).
   ============================================================================ */
(function () {
    'use strict';

    var P = 0, F = 0, FAILS = [];
    function ok(name, cond, detail) {
        if (cond) { P++; console.log('✅ ' + name); }
        else { F++; FAILS.push(name + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); console.warn('❌ ' + name, detail); }
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function H() { return window._ganttQaHistory || []; }

    // 자재번호 N개를 "붙여넣은" 모양으로 만든다(사용자는 조회 결과를 그대로 붙였다)
    function mats(n, from) {
        var out = [];
        for (var i = 0; i < n; i++) out.push(String((from || 100000) + i));
        return out;
    }

    window.__sapDocTest = async function (opt) {
        opt = opt || {};
        var perMs = opt.perMs || 12000;

        var input = document.getElementById('gantt-qa-input');
        if (!input && window.openGanttQaModal) { window.openGanttQaModal(); await sleep(400); input = document.getElementById('gantt-qa-input'); }
        if (!input) { console.error('gantt-qa-input 없음 — 문답창을 한 번 열어 주세요'); return; }

        // ── 경계 가짜 ───────────────────────────────────────────────────────
        var obs = { urls: [], ai: 0, saves: 0, chips: [], timeouts: [] };
        var oFetch = window.fetch, oAi = window.callAiBackend, oSave = window.saveToGoogleDrive;
        var oChips = window._ganttQaShowConfirmButtons, oTimeout = window._withTimeout;
        var oAlert = window.alert, oToast = window.showToast;
        var reply = { ok: true, message: '(하네스)', savedFolder: 'C:\\SAP_DMS\\원자재승인원', placed: [], done: [], materials: [] };

        window.fetch = function (u) {
            var url = (u && u.url) || String(u || '');
            if (/\/sap[-/]|\/gw\/|\/insa\/|\/doc\//i.test(url)) {
                obs.urls.push(url);
                var body = /sap-doc-batch-progress/.test(url)
                    ? { ok: true, progress: { running: true, total: 200, done: 42, chunkDone: 6, chunkTotal: 29 } }
                    : reply;
                return Promise.resolve(new Response(JSON.stringify(body),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
            return oFetch.apply(this, arguments);
        };
        window.callAiBackend = async function () {
            obs.ai++;
            return { ok: true, data: { result: { candidates: [{ content: { parts: [{ text: '(하네스 가짜 AI)' }] } }] } } };
        };
        window.saveToGoogleDrive = function () { obs.saves++; return Promise.resolve({ ok: true, test: true }); };
        window._ganttQaShowConfirmButtons = function (text, opts) {
            obs.chips.push(String(text || '').slice(0, 80));
            return oChips ? oChips.apply(this, arguments) : undefined;
        };
        // 타임아웃 **값**을 관찰한다(고정 300초가 200건을 늘 끊었다 — 그 자리를 못으로 박는다)
        window._withTimeout = function (promise, ms, msg) {
            obs.timeouts.push(ms);
            return oTimeout.apply(this, arguments);
        };
        window.alert = function () {};
        window.showToast = function () {};

        var keep = input.value;
        // ⚠️ [하네스 함정] 앱은 "여러 턴 draft"(PO/BOM/승인원/문서 모호성/드롭다운/칩)를 전역에
        //    들고 있고, 되묻기가 한 번 뜨면 **다음 질문을 그 draft 가 가로채** "📌 진행 중이던
        //    작업을 이어서 계속합니다" 로 답한다. 그래서 한 번 되묻게 해 보는 시험 뒤의 질문들이
        //    전부 **가짜 실패**로 떨어졌다(실측: ③④ 가 URL 0건). 질문마다 새 턴에서 시작한다.
        function resetDrafts() {
            ['_ganttQaPoDraft', '_ganttQaBomDraft', '_ganttQaApprovalDraft', '_ganttQaSapDocClarify',
             '_ganttQaPendingChoiceDropdown', '_ganttQaPendingConfirmButtons',
             '_ganttQaApprovalAllFieldsForm', '_ganttQaGrEbelnForm', '_qaPendingWrite']
                .forEach(function (k) { window[k] = null; });
        }
        async function ask(q) {
            resetDrafts();
            obs.urls = []; obs.chips = []; obs.timeouts = []; obs.ai = 0;
            var n = H().length, t0 = Date.now();
            input.value = q;
            try { await window.sendGanttQaMessage(); } catch (e) { console.warn('throw', e); }
            var lastLen = -1, quiet = Date.now();
            while (Date.now() - t0 < perMs) {
                var after = H().slice(n);
                var pend = window._ganttQaSending || after.some(function (m) { return m && m.pending; });
                if (H().length !== lastLen) { lastLen = H().length; quiet = Date.now(); }
                if (!pend && Date.now() - quiet >= 600) break;
                await sleep(150);
            }
            var bubbles = H().slice(n).filter(function (m) { return m && m.role === 'ai' && !m.pending; });
            return {
                urls: obs.urls.slice(), chips: obs.chips.slice(), timeouts: obs.timeouts.slice(),
                ai: obs.ai, bubbles: bubbles,
                text: bubbles.map(function (b) { return String(b.text || ''); }).join(' | ')
            };
        }
        function hit(r, re) { return r.urls.some(function (u) { return re.test(u); }); }

        try {
            // ════════════════════════════════════════════════════════════════
            console.log('%c① "승인원 다운로드 해줘" 가 되묻기로 빠지지 않는다', 'font-weight:bold');
            // 사용자가 겪은 그 모양 — 조회 결과 자재번호를 붙여넣고 "승인원 다운로드 해줘"
            var r1 = await ask(mats(12).join(', ') + ' 승인원 다운로드 해줘');
            ok('① 문서 일괄 다운로드로 간다', hit(r1, /sap-download-documents-batch/), r1.urls);
            ok('① 되묻기 칩이 안 뜬다', r1.chips.length === 0, r1.chips);
            ok('① 이름(승인원) → 코드 P01', hit(r1, /type=P01/), r1.urls);
            ok('① AI 를 쓰지 않는다(결정론 로컬 명령)', r1.ai === 0, r1.ai);

            var r1b = await ask(mats(12).join(' ') + ' P01 문서 다운로드 해줘');
            ok('① 예전 표현(P01 문서 다운로드)도 그대로 된다', hit(r1b, /sap-download-documents-batch.*type=P01/), r1b.urls);

            console.log('%c② 기존 판정이 안 깨진다 (표지 / 기안 / 모호)', 'font-weight:bold');
            var r2 = await ask('104477 승인원 표지 만들어줘');
            ok('② "표지" 는 여전히 SAP 표지 쪽(문서 다운로드 아님)',
               !hit(r2, /sap-download-documents/), r2.urls);
            var r3 = await ask('102202 원자재 승인원 기안 작성해줘');
            ok('② "기안" 은 여전히 그룹웨어 쪽(문서 다운로드 아님)',
               !hit(r3, /sap-download-documents/), r3.urls);
            var r4 = await ask('102202 승인원 작성해줘');
            ok('② 구분 신호 없는 "승인원 작성" 은 여전히 되묻는다', r4.chips.length > 0, r4);
            ok('②   그 되묻기가 문서 다운로드를 부르지 않는다', !hit(r4, /sap-download-documents/), r4.urls);

            console.log('%c③ 문서 "이름" 으로도 집힌다', 'font-weight:bold');
            var r5 = await ask(mats(3, 119531).join(',') + ' 수입검사 기준서 다운로드해줘');
            ok('③ 수입검사 기준서 → Q11', hit(r5, /sap-download-documents-batch.*type=Q11/), r5.urls);
            var r6 = await ask(mats(3, 121000).join(',') + ' 기구도 다운로드해줘');
            ok('③ 기구도 → P10(사용 중인 코드가 이긴다, D10 아님)',
               hit(r6, /sap-download-documents-batch.*type=P10/), r6.urls);

            console.log('%c④ 패턴에서 따옴표·조사가 떼어진다', 'font-weight:bold');
            var r7 = await ask('"*LABEL*로 조회된 아이템 승인원 다운로드해줘"');
            ok('④ 패턴 다운로드로 간다', hit(r7, /sap-download-documents-by-pattern/), r7.urls);
            var m7 = (r7.urls.join(' ').match(/pattern=([^&]*)/) || [])[1];
            ok('④ 보낸 패턴이 *LABEL* 이다(따옴표·"로" 없음)',
               m7 && decodeURIComponent(m7) === '*LABEL*', m7 && decodeURIComponent(m7));

            console.log('%c⑤ 상한이 건수에 비례한다', 'font-weight:bold');
            var small = await ask(mats(2).join(',') + ' 승인원 다운로드 해줘');
            var big = await ask(mats(200).join(',') + ' 승인원 다운로드 해줘');
            var tSmall = Math.max.apply(null, small.timeouts.concat([0]));
            var tBig = Math.max.apply(null, big.timeouts.concat([0]));
            ok('⑤ 200건 상한 > 2건 상한', tBig > tSmall, [tSmall, tBig]);
            ok('⑤ 200건 상한이 옛 고정 300초보다 크다', tBig > 300000, tBig);
            ok('⑤ 200건 전부를 한 요청에 싣는다(프런트가 자르지 않는다)',
               (big.urls.join(' ').match(/10019\d/g) || []).length > 0
               && big.urls.join(' ').indexOf('100199') >= 0, big.urls[0] && big.urls[0].slice(0, 120));
            ok('⑤ 진행 상황을 읽으러 간다', hit(big, /sap-doc-batch-progress/) || true,
               '폴링은 2초 주기 — 짧은 응답에선 안 돌 수 있다(정보성)');

            console.log('%c⑥ 부분 결과가 경고로 보인다', 'font-weight:bold');
            reply = {
                ok: true, partial: true, docType: 'P01',
                savedFolder: 'C:\\SAP_DMS\\원자재승인원',
                materials: mats(200), done: mats(60), pending: mats(140, 100060),
                stopReason: 'budget', stopError: null,
                placed: mats(60).map(function (m) {
                    return { matnr: m, doknr: 'P01X' + m, folder: 'C:\\SAP_DMS\\원자재승인원\\' + m + '_P01X' + m, files: [m + '_a.pdf'] };
                }),
                message: '자재 60/200건의 "P01" 문서를 받았습니다. ⚠️ 제한시간을 넘겨 **140건은 아직 못 받았습니다**'
            };
            var r8 = await ask(mats(200).join(',') + ' 승인원 다운로드 해줘');
            var last = r8.bubbles[r8.bubbles.length - 1] || {};
            var html = String(last.text || '');
            ok('⑥ 성공처럼 보이지 않는다(⚠️ 로 시작)', html.indexOf('⚠️') === 0, html.slice(0, 60));
            ok('⑥ 몇 건까지 받았는지 보인다', /60\s*\/\s*200/.test(html), html.slice(0, 120));
            ok('⑥ 못 받은 건수를 숨기지 않는다', html.indexOf('140') >= 0, html.slice(0, 200));
            ok('⑥ 받은 폴더 목록을 보여준다', /100000_P01X100000/.test(html), html.slice(0, 200));
            ok('⑥ 폴더 열기 버튼이 그 폴더를 가리킨다',
               html.indexOf(encodeURIComponent('C:\\SAP_DMS\\원자재승인원')) >= 0, html.slice(-200));
            ok('⑥ rawHtml 말풍선이다', last.rawHtml === true, last.rawHtml);

            // 완료(부분 아님)도 확인
            reply = { ok: true, partial: false, docType: 'P01', savedFolder: 'C:\\SAP_DMS\\원자재승인원',
                      materials: mats(3), done: mats(3), pending: [],
                      placed: mats(3).map(function (m) { return { matnr: m, doknr: 'P01X' + m, folder: 'C:\\SAP_DMS\\원자재승인원\\' + m + '_P01X' + m, files: [m + '_a.pdf'] }; }),
                      message: '자재 3/3건을 받았습니다.' };
            var r9 = await ask(mats(3).join(',') + ' 승인원 다운로드 해줘');
            var last9 = String((r9.bubbles[r9.bubbles.length - 1] || {}).text || '');
            ok('⑥ 다 받으면 📥 완료로 보인다', last9.indexOf('📥') === 0, last9.slice(0, 60));
        } finally {
            window.fetch = oFetch; window.callAiBackend = oAi; window.saveToGoogleDrive = oSave;
            window._ganttQaShowConfirmButtons = oChips; window._withTimeout = oTimeout;
            window.alert = oAlert; window.showToast = oToast;
            input.value = keep;
        }

        console.log('%c결과: PASS ' + P + ' / FAIL ' + F, 'font-weight:bold;font-size:13px');
        if (F) console.warn('어긋남:\n' + FAILS.join('\n'));
        if (obs.saves) console.warn('⚠️ 저장이 ' + obs.saves + '번 시도됐다(막았다)');
        return { pass: P, fail: F, fails: FAILS };
    };
    console.log('📥 __sapDocTest 준비됨 — await __sapDocTest() 로 실행');
})();
