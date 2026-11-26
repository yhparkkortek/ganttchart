/* ============================================================================
   📅 AI 요약 일일/주간/월간(js/62) — 진짜 앱에서 돌리는 하네스 (2026-11-08)
   앱을 열고 콘솔에 붙여넣는다. 프로젝트가 안 열려 있어도 된다 — globalData 를 잠시 바꿔 넣고 되돌린다.
   가짜: globalData/colIdx(픽스처), callAiBackend(AI 응답), 끝나면 전부 원상복구. 나머지는 진짜(모달·렌더·접지 검사·QA 입구).
   ============================================================================ */
(async function () {
    'use strict';
    var pass = 0, fail = 0, out = [];
    function ok(n, c, d) { if (c) { pass++; out.push('  OK   ' + n); } else { fail++; out.push('  FAIL ' + n + (d !== undefined ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : '')); } }
    var P = window.PERIOD_SUMMARY;
    if (!P || !window._psCollectFacts) { console.error('js/62 미로드'); return; }
    var _act = document.querySelector('.tab-panel.active');
    var keep = { tab: _act ? _act.id.replace(/^tab-/, '') : 'gantt', gd: window.globalData, ci: window.colIdx, pm: window.projectMeta, call: window.callAiBackend, key: window.getActiveAiKey, mode: localStorage.getItem(P.modeKey), hist: window._ganttQaHistory,
                 filt: localStorage.getItem(P.filterKey), scan: P.scanProjects, fileName: window.currentDriveFileName, nas: window.nasAppFile };
    // 📚 보관함(App_Config/AiSummary)은 **메모리 가짜** — 진짜 NAS 에 시험 요약을 남기지 않는다.
    //    가짜는 nasAppFile 경계 하나라, 이름 짓기·해시로 찾기·재사용은 진짜 코드가 돈다.
    var ARCH = {}, ADIR = (P.archiveDir || 'App_Config/AiSummary') + '/';
    window.nasAppFile = Object.assign({}, keep.nas || {}, {
        list: async function (rel) { return (String(rel).replace(/\/$/, '') + '/') === ADIR ? Object.keys(ARCH).map(function (n) { return { name: n }; }) : (keep.nas ? keep.nas.list(rel) : []); },
        get: async function (rel, o) { if (String(rel).indexOf(ADIR) === 0) { var t = ARCH[rel.slice(ADIR.length)]; return t ? JSON.parse(t) : null; } return keep.nas ? keep.nas.get(rel, o) : null; },
        put: async function (rel, b) { if (String(rel).indexOf(ADIR) === 0) { ARCH[rel.slice(ADIR.length)] = JSON.stringify(b); return { ok: true }; } throw new Error('하네스: NAS 쓰기 차단 ' + rel); }
    });
    // ⚠️ 열린 프로젝트 이름을 픽스처 값으로 — 비워 두면(실제로 열린 프로젝트가 없을 때) 로컬
    //    사실의 `project` 가 '' 가 되어 PM 선택지 보강 로직(_psCollectFacts 의 projDir)이
    //    그 사실을 못 줍는다. 실제 앱에선 프로젝트를 열면 항상 값이 있으므로 그 상태를 흉내낸다.
    window.currentDriveFileName = 'LOCAL_TEST_PROJ';
    // ⚠️ 다른 프로젝트 훑기는 **끈다** — 이 하네스는 픽스처만 본다(NAS 가 섞이면 숫자가 흔들린다).
    P.scanProjects = false;
    // ⚠️ 끄는 것만으로는 **이미 모아 둔 사실**이 안 사라진다 — 진짜 NAS 데이터가
//    픽스처 시험에 섮여 숫자가 틀어진다(2026-11-09 여기서 두 건 가짜 실패가 났다).
    if (window._psResetScan) window._psResetScan();
    localStorage.removeItem(P.filterKey);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var D = function (n) { var x = new Date(today); x.setDate(x.getDate() + n); return x; };
    function row(level, name, content, mailDate, start) {
        var r = ['', name, start ? ymd(start) : '', '', '진행', '', content];
        r._level = level; r[['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][level]] = name; r._담당구분 = 'HW';
        if (mailDate) r._mailRaw = { date: ymd(mailDate) + ' 10:00', subject: name, sender: 'a@b.c' };
        if (start) r._calcStartTs = start.getTime();
        return r;
    }
    try {
        var hdr = ['No', 'WBS', 'start', 'plan', 'status', 'x', 'content']; hdr._level = undefined;
        window.globalData = [hdr,
            row(1, '오늘 메일 업무', '[고객→박용훈]\n[핵심내용] 패널 단가 회신 요청\n[To do] 11/10 까지 견적 송부\n[출처]x_' + today.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][today.getMonth()] + ' ' + today.getFullYear() + ' 09:00:00_a@b.c', D(0)),   // ⚠️ 날짜를 박으면 그날만 통과한다(11-08 에 쓰여 그 뒤로 실패했다)
            row(1, '이번 주 초 메일 업무', '[핵심내용] 금형 수정 일정 확인\n[문제점] 금형 업체 회신 지연\n[대책] 11/12 재확인\n[출처]y_z_a', D(-2), D(-2)),
            row(1, '지난달 메일 업무', '[핵심내용] 옛날 건\n[출처]q', D(-40)),
            row(1, '사람이 친 업무(메일 아님)', '그냥 메모', null, D(0)),
            row(1, '날짜는 시작일뿐', '[핵심내용] 시작일로 잡힌다\n[출처]z', null, D(-1))
        ];
        window.colIdx = { no: 0, wbs: 1, start: 2, plan: 3, status: 4, answer: 5, content: 6, assignee: -1 };
        window.projectMeta = { 고객사: 'LNW', 고객모델명: 'TEST', aiSummaryReport: null };

        var R = window._psRange('week', today);
        ok('주간 범위는 월~일 7일', Math.round((R.to - R.from) / 86400000) === 7 && R.from.getDay() === 1 && R.to.getDay() === 0, R);
        var day = window._psCollectFacts('day');
        ok('일일: 오늘 메일 업무 1건(사람이 친 업무·시작일만 있는 어제 것 제외)', day.facts.length === 1 && day.facts[0].task === '오늘 메일 업무' && day.facts[0].core === '패널 단가 회신 요청' && day.facts[0].todo.indexOf('견적 송부') > 0, day.facts);
        var month = window._psCollectFacts('month');
        ok('월간: 지난달 것은 빠진다', month.facts.every(function (f) { return f.task !== '지난달 메일 업무'; }) && month.facts.length >= 1, month.facts.map(function (f) { return f.task; }));
        var wk = window._psCollectFacts('week');
        var inWeek = D(-2) >= R.from;
        ok('주간: 이틀 전 메일 업무는 이번 주에 속할 때만 포함(문제점·대책 파싱)', inWeek ? wk.facts.some(function (f) { return f.task === '이번 주 초 메일 업무' && f.issue.indexOf('지연') >= 0 && f.fix.indexOf('재확인') >= 0; }) : true, wk.facts);
        ok('시작일만 있는 메일 업무도 날짜를 잡는다(어제)', window._psCollectFacts('month').facts.some(function (f) { return f.task === '날짜는 시작일뿐'; }) || ymd(D(-1)).slice(0, 7) !== ymd(today).slice(0, 7));

        // 접지 검사
        var g = window._psGround(['사실 #G1 에 근거', '근거 없는 추정 문장', '#G999 없는 번호', '#G2 와 #G1 둘 다'], [{ idx: 1 }, { idx: 2 }]);
        ok('접지: 유효 #G 없는 문장 2개 버림', g.kept.length === 2 && g.dropped === 2, g);

        // 🗂 [2026-11-23] 프로젝트 요약은 **페이지**다 — 옛 진입로(AI 도구 ▸ AI 요약)도 페이지로 간다.
        localStorage.setItem(P.modeKey, 'week');
        window.openAiProjectSummaryModal();
        var pageTab = document.getElementById('tab-psummary');
        ok('옛 메뉴(AI 요약)는 프로젝트 요약 페이지로 간다', !!pageTab && pageTab.classList.contains('active'));
        var body = document.getElementById('psummary-page');
        ok('툴바(어제~이번달/기간설정)가 그려졌다', !!body.querySelector('#ps-period-toolbar') && /오늘|Today/.test(body.textContent) && /지난주|Last week/.test(body.textContent) && /이번달|This month/.test(body.textContent) && /기간설정|Range/.test(body.textContent));
        ok('모달 쪽에는 같은 화면이 없다(id 겹침 방지)', !document.querySelector('#ai-summary-body #ps-period-toolbar'));
        // 📊 [2026-11-09] '일정 현황' 은 간트 상태 칸이 관리되지 않아 접었다(showLegacy:false).
        ok('일정 현황 버튼이 없다', !/일정 현황|Schedule view/.test(body.textContent), body.textContent.slice(0, 80));
        // ⚠️ 옛 설정이 'legacy' 로 남아 있어도 **갇히지 않는다**(돌아올 버튼이 없으니까).
        localStorage.setItem(P.modeKey, P.legacyId);
        ok('꺼 둔 모드가 저장돼 있어도 기본 모드로 돌아온다', window._psMode() === P.defaultMode, window._psMode());
        ok('기간 모드엔 완료/진행/대기/지연 네 칸이 없다', !/repeat\(4,\s*1fr\)/.test(body.innerHTML));
        window._renderAiProjectSummaryBody();
        ok('사실 목록이 #G 링크로 그려졌다', /#G1\b/.test(body.textContent) && /패널 단가 회신 요청/.test(body.textContent));
        ok('페이지 생성 버튼 라벨이 기간용', /AI 요약 생성|Generate AI summary/.test((document.getElementById('ps-page-gen-btn') || {}).textContent || ''));
        // 일정 현황(옛) 모드 — 스위치를 켜면 **여전히 돈다**(지운 게 아니라 접은 것이다) — 그땐 옛 모달.
        P.showLegacy = true;
        window.switchTab('gantt');
        window.openAiProjectSummaryModal();
        var mbody = document.getElementById('ai-summary-body');
        window._psSetMode(P.legacyId);
        ok('켜면 일정 현황이 (모달에) 다시 나온다', !!mbody && /일정 현황|Schedule view/.test(mbody.textContent));
        ok('일정 현황 모드에서도 숫자 네 칸은 숨긴다(showCounts=false)', !!mbody && !/repeat\(4,\s*1fr\)/.test(mbody.innerHTML) && !!mbody.querySelector('#ps-period-toolbar'));
        P.showLegacy = false;
        var mm0 = document.getElementById('ai-summary-modal'); if (mm0) mm0.style.display = 'none';
        // 📋 [2026-11-26] 기본 보기는 '회의 브리핑' — 이 하네스는 행 목록(표) 보기를 시험한다. 브리핑은 period-summary-brief.browser.js
        window._psTblSet({ view: 'rows' });
        window.switchTab('psummary');
        window._psSetMode('day');
        body = document.getElementById('psummary-page');

        // AI 생성 — 가짜 응답(접지 안 된 문장 1개 포함)
        window.getActiveAiKey = function () { return 'fake'; };
        var prompts = [];
        window.callAiBackend = async function (k, prompt) {
            prompts.push(prompt);
            return { ok: true, data: { result: { candidates: [{ content: { parts: [{ text: '```json\n{"요약":["패널 단가 회신을 요청받음 #G1","환각 문장 — 근거 없음"],"요청·결정":["11/10 까지 견적 송부 요청 #G1"],"미해결":[]}\n```' }] } }] } } };
        };
        var res = await window.generatePeriodSummary('day');
        ok('프롬프트는 사실 목록만 싣고 #G 근거를 요구한다', prompts.length === 1 && /\[사실 목록\]/.test(prompts[0]) && /#G1 \[/.test(prompts[0]) && /반드시/.test(prompts[0]) && !/완료 \d+/.test(prompts[0]), prompts[0] && prompts[0].slice(0, 300));
        ok('근거 없는 문장 1개 제거 · 2행 유지 · 캐시 저장', res && res.dropped === 1 && res.rows.length === 2 && res.요약.length === 1 && res.요청결정.length === 1 && window.projectMeta.aiPeriodSummary.day.rangeKey === window._psCollectFacts('day').sig, res);
        ok('화면에 AI 요약 표와 제거 수가 보인다', /패널 단가 회신을 요청받음/.test(body.textContent) && /근거 없음 1 제거/.test(body.textContent) && document.querySelectorAll('#ps-ai-tbl tbody tr').length === 2);
        ok('보관함에 1건 저장', Object.keys(ARCH).length === 1, Object.keys(ARCH));
        // ♻️ 같은 조건이면 AI 를 다시 부르지 않는다(보관본 재사용)
        if (window.projectMeta.aiPeriodSummary) delete window.projectMeta.aiPeriodSummary.day;
        var res2 = await window.generatePeriodSummary('day');
        ok('같은 조건 재생성 → 보관본 재사용(AI 0회)', prompts.length === 1 && res2 && res2.reused === true && res2.rows.length === 2, { n: prompts.length });
        // 🔄 새로 생성은 AI 를 부른다
        await window.generatePeriodSummary('day', { force: true });
        ok('새로 생성(force)은 AI 를 다시 부르고 보관본이 하나 더', prompts.length === 2 && Object.keys(ARCH).length >= 1, { n: prompts.length, a: Object.keys(ARCH).length });
        // 📊 표 정렬·분류 필터
        window._psTblSet({ toggleCat: 'decision' });
        ok('분류 칩으로 거르기', document.querySelectorAll('#ps-ai-tbl tbody tr').length === 1);
        window._psTblSet({ reset: 1 });
        // 👷 [2026-11-23] 표에서 업무 담당자(담당 구분) 바꾸기 → 간트 행에 반영. 경계(setWbsDiscipline)만 가짜.
        var realSetDisc = window.setWbsDiscipline, discCalls = [];
        window.setWbsDiscipline = function (ri, v) { discCalls.push([ri, v]); window.globalData[ri]._담당구분 = v; };
        try {
            var roleSel = document.querySelector('#ps-ai-tbl tbody tr select');
            ok('열린 프로젝트 행엔 담당 구분 고르기가 있다', !!roleSel);
            window._psSetRole(0, 'FW');
            ok('고르면 근거 간트 행의 담당 구분이 바뀐다', discCalls.length >= 1 && discCalls[0][0] === 1 && window.globalData[1]._담당구분 === 'FW', discCalls);
            // ⚠️ textContent 로 보면 고르기 상자의 **모든 선택지** 글자가 잡혀 늘 통과한다 — 고른 값을 본다.
            var sel2 = document.querySelector('#ps-ai-tr0-who select') || document.querySelector('#ps-row-0 select');
            // 📧 [2026-11-24] 1행은 상세내용에 `[고객→박용훈]` 이 있어 담당자가 상세내용에서 온다 — 고른 칸은 "📧 FW · 박용훈".
            ok('표가 바뀐 담당 구분을 바로 보여 준다', !!sel2 && /FW/.test(sel2.selectedOptions[0].textContent), sel2 && sel2.selectedOptions[0].textContent);
            ok('📧 상세내용의 받는이가 담당자로 보인다(역할 담당자가 아니라)', !!sel2 && /📧/.test(sel2.selectedOptions[0].textContent) && /박용훈/.test(sel2.selectedOptions[0].textContent), sel2 && sel2.selectedOptions[0].textContent);
            // 👤 담당자 직접 입력 → 간트 행 `_담당자` → 사실·표가 그 이름을 쓴다(역할보다 먼저)
            var realSetAsg = window.setRowAssignee, realPrompt = window.prompt, asgCalls = [];
            window.setRowAssignee = function (ri, v) { asgCalls.push([ri, v]); var t = String(v || '').trim(); if (t) window.globalData[ri]._담당자 = t; else delete window.globalData[ri]._담당자; return true; };
            window.prompt = function () { return '홍길동'; };
            try {
                window._psSetRole(0, '__manual__');
                ok('직접 입력은 근거 간트 행의 담당자로 저장된다', asgCalls.length === 1 && asgCalls[0][0] === 1 && window.globalData[1]._담당자 === '홍길동', asgCalls);
                ok('사실의 업무 담당자가 직접 지정 이름이 된다', window._psCollectFacts('day').facts.some(function (f) { return f.assignee === '홍길동' && f.manual; }));
                var sel3 = document.querySelector('#ps-row-0 select');
                ok('표에 👤 이름으로 보인다', !!sel3 && /👤 홍길동/.test(sel3.selectedOptions[0].textContent), sel3 && sel3.selectedOptions[0].textContent);
                window._psSetRole(0, '__clear__');
                ok('해제하면 역할로 돌아간다', !window.globalData[1]._담당자 && !window._psCollectFacts('day').facts.some(function (f) { return f.manual; }));
            } finally { window.setRowAssignee = realSetAsg; window.prompt = realPrompt; delete window.globalData[1]._담당자; }
        } finally { window.setWbsDiscipline = realSetDisc; window.globalData[1]._담당구분 = 'HW'; }
        // 📌 [2026-11-24] 표·사실 카드에서 핀셋(알람) — 근거 간트 행의 `_알림` 을 켜고 끈다. 저장은 경계에서 막혀 있다.
        {
            var pinBtn = document.querySelector('#ps-row-0 .ps-pin-btn');
            ok('열린 프로젝트 행엔 📌 버튼이 있다', !!pinBtn);
            var was = !!window.globalData[1]._알림;
            window._psPinRow(0);
            ok('📌 누르면 근거 간트 행의 알람이 바뀐다', !!window.globalData[1]._알림 === !was);
            var pinBtn2 = document.querySelector('#ps-row-0 .ps-pin-btn');
            ok('표가 바뀐 상태를 바로 보여 준다', !!pinBtn2 && pinBtn2.classList.contains('on') === !was, pinBtn2 && pinBtn2.className);
            var cardBtn = document.querySelector('[id^="ps-fact-"] .ps-pin-btn');
            ok('사실 카드에도 📌 버튼이 있다', !!cardBtn);
            if (cardBtn) { var before = window.globalData.slice(1).filter(function (r) { return r && r._알림; }).length; cardBtn.click();
                ok('카드 📌 도 간트 알람을 바꾼다', window.globalData.slice(1).filter(function (r) { return r && r._알림; }).length !== before); }
            window.globalData.forEach(function (r) { if (r && typeof r === 'object') delete r._알림; });
            window._renderAiProjectSummaryBody();
            // 📌 핀셋만 보기 — 표와 사실 카드 둘 다 거른다.
            var allRows = document.querySelectorAll('#ps-ai-tbl tbody tr[id^="ps-row-"]').length;
            var allCards = document.querySelectorAll('[id^="ps-fact-"]').length;
            ok('핀셋만 체크박스가 있다', !!document.querySelector('input[onchange*="pinned"]'));
            window._psTblSet({ pinned: true });
            ok('핀셋 0개면 표 행 0 · 카드 0 · 안내', document.querySelectorAll('#ps-ai-tbl tbody tr[id^="ps-row-"]').length === 0 && document.querySelectorAll('[id^="ps-fact-"]').length === 0 && /핀셋을 켠 업무가 없습니다/.test(document.getElementById('psummary-page').textContent));
            window.globalData[1]._알림 = true;
            window._renderAiProjectSummaryBody();
            var pr = document.querySelectorAll('#ps-ai-tbl tbody tr[id^="ps-row-"]').length, pc = document.querySelectorAll('[id^="ps-fact-"]').length;
            ok('켠 업무만 남는다(표·카드)', pr >= 1 && pr <= allRows && pc === 1, { pr: pr, allRows: allRows, pc: pc, allCards: allCards });
            ok('남은 카드가 켠 그 업무다', !!document.querySelector('[id^="ps-fact-"] .ps-pin-btn.on'));
            window._psTblSet({ reset: 1 });
            ok('초기화하면 전부 다시', document.querySelectorAll('#ps-ai-tbl tbody tr[id^="ps-row-"]').length === allRows && document.querySelectorAll('[id^="ps-fact-"]').length === allCards);
            delete window.globalData[1]._알림;
            window._renderAiProjectSummaryBody();
        }
        // 🚩 [2026-11-26] 회의 브리핑 — "오늘 회의에서 정할 것" 한 줄 → 아래 업무 줄로 가서 깜빡 → 그 줄을 누르면 돌아온다.
        {
            window._psTblSet({ view: 'brief' });
            var meet = document.getElementById('ps-meet-0');
            ok('회의에서 정할 것 줄이 눌린다', !!meet && /_psGoBrief/.test(meet.getAttribute('onclick') || ''));
            ok('회의 상자는 스크롤 밖 고정 머리에 있다', !!meet && !!meet.closest('#ps-sticky') && !meet.closest('#ps-scroll'));
            window._psTblSet({ big: true });
            ok('표를 다시 그려도(크게 보기) 회의 상자가 고정 머리에 하나만', document.querySelectorAll('#ps-sticky [id^="ps-meet-"]').length >= 1 && !document.querySelector('#ps-scroll [id^="ps-meet-"]') && document.querySelectorAll('#ps-meet-0').length === 1);
            window._psTblSet({ big: false });
            meet = document.getElementById('ps-meet-0');
            if (meet) {
                meet.click();
                var hint = document.getElementById('ps-meet-hint'), tr = hint && hint.closest('tr[id^="ps-brief-"]');
                ok('누르면 그 업무 줄로 가서 깜빡이고 돌아가기 안내가 붙는다', !!tr && /fff3bf|255, 243, 191/.test(tr.style.background) && /결정 필요/.test(tr.textContent), tr && tr.outerHTML.slice(0, 200));
                await new Promise(function (r) { setTimeout(r, 2200); });
                ok('하이라이트는 2초가 지나도 남아 있다', !!tr && /fff3bf|255, 243, 191/.test(tr.style.background), tr && tr.style.background);
                var md = function (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); };
                if (tr) { md(tr.querySelector('td:nth-child(2)')); tr.querySelector('td:nth-child(2)').click(); }
                var meet2 = document.getElementById('ps-meet-0');
                ok('업무 줄을 누르면 안내·업무 줄 하이라이트가 지워지고 회의 줄이 하이라이트된다', !document.getElementById('ps-meet-hint') && !!meet2 && /ffe3e3|255, 227, 227/.test(meet2.style.background) && !!tr && !tr.style.background);
                if (tr) tr.click();
                ok('돌아온 뒤 업무 줄을 또 눌러도 아무 일 없다', !document.getElementById('ps-meet-hint'));
                md(document.getElementById('psummary-page'));
                ok('다른 곳을 누르면 하이라이트가 사라진다', !!meet2 && !meet2.style.background);
            }
            ok('"프로젝트를 열어야 바꿀 수 있다" 안내 띠는 없다', !/그 프로젝트를 열어야/.test(document.getElementById('psummary-page').textContent));
            window._psTblSet({ view: 'rows' });
            ok('행 목록 보기로 바꾸면 회의 상자가 없다', !document.getElementById('ps-meet-0'));
            var st = document.getElementById('ps-sticky');
            var metaSpan = st && [].slice.call(st.querySelectorAll('span[title]')).filter(function (e) { return /^🤖 요약/.test(e.textContent); })[0];
            ok('🤖 요약 정보는 📅 기간 줄(메일 건수 옆)에 한 줄로', !!metaSpan && /메일/.test(metaSpan.parentNode.textContent) && (st.innerText.match(/🤖/g) || []).length === 1 && !/건만으로/.test(st.innerText), st && st.innerText.slice(0, 300));
        }
        // 🔁 [2026-11-23 "엑셀에 근거가 2번"] 같은 행의 두 사본(열린 쪽 #G7 · 훑은 쪽 #G200007)을 근거로 집어도 하나로
        var dup = window._psRowsFromAi({ items: [{ 분류: '한 일', 내용: 'x', 근거: ['#G7', '#G200007', '#G7'] }] },
            [{ idx: 7, project: 'P1', date: '2026-11-20', task: 't' }, { idx: 200007, rowIdx: 7, project: 'P1', date: '2026-11-20', task: 't' }]);
        ok('같은 행의 두 사본은 근거 하나', dup.rows.length === 1 && dup.rows[0].refs.length === 1, dup);
        var txt = window.periodSummaryText('day');
        ok('글 버전(텔레그램용)에 분류·사실이 함께', /한 일|결정·요청/.test(txt) && /#G1/.test(txt) && /패널 단가/.test(txt), txt.slice(0, 200));

        // AI 문답 입구 "일일 요약" — 캐시가 있어 AI 를 다시 안 부른다
        window._ganttQaHistory = [];
        var inp = document.getElementById('gantt-qa-input');
        if (!inp) { window.openGanttQaModal(); inp = document.getElementById('gantt-qa-input'); }
        var n0 = prompts.length;
        inp.value = '일일 요약해줘';
        await window.sendGanttQaMessage();
        var H = window._ganttQaHistory;
        ok('문답창에 질문 + 기간 요약 답(AI 재호출 0)', H.some(function (m) { return m.role === 'user' && /일일 요약/.test(m.text); }) && H.some(function (m) { return m.role === 'ai' && !m.pending && /#G1/.test(m.text); }) && prompts.length === n0, H.map(function (m) { return (m.text || '').slice(0, 60); }));
        // ══ 기간설정 + 담당자·프로젝트 고르기 (2026-11-09 요청) ═════════════════
        // 📅 직접 기간 — 두 칸을 다 골라야 움직인다.
        window._psSetFilter({ from: ymd(D(-3)), to: ymd(D(-1)) });
        var cr = window._psRange(P.customId);
        ok('기간설정은 고른 날짜 그대로', cr.key === ymd(D(-3)) + '~' + ymd(D(-1)), cr.key);
        var cc = window._psCollectFacts(P.customId);
        ok('기간 밖 사실은 안 든다', cc.facts.every(function (f) { return f.date >= ymd(D(-3)) && f.date <= ymd(D(-1)); }),
           cc.facts.map(function (f) { return f.date; }).join(','));
        // ⚠️ 거꾸로 골라도 되게 — 시작/끝이 뒤집혀 오면 바꿔 끼운다.
        window._psSetFilter({ from: ymd(D(-1)), to: ymd(D(-3)) });
        ok('시작·끝이 뒤집혀도 같은 기간', window._psRange(P.customId).key === ymd(D(-1)) + '~' + ymd(D(-3)),
           window._psRange(P.customId).key);
        window._psSetFilter({ from: '', to: '' });

        // 👤 담당자 — 역할(`_담당구분`)을 그 프로젝트의 projectMeta 로 푼다.
        window.projectMeta.HW담당자 = '조익현';
        var cm = window._psCollectFacts('month');
        // 📧 [2026-11-24] 상세내용에 `[보낸이 → 받는이]` 가 있으면 받는이(사내)가 먼저, 없으면 역할.
        ok('담당자를 역할에서 푼다(상세내용에 받는이가 없는 행)', cm.facts.length > 1 && cm.facts.every(function (f) { return f.task === '오늘 메일 업무' ? f.assignee === '박용훈' && f.fromContent : f.assignee === '조익현' && !f.fromContent; }),
           JSON.stringify(cm.facts.map(function (f) { return f.task + ':' + f.assignee; })));
        var ex = window._extractMailSenderReceiver, mp = window._mailContentParse;
        var own = function (c) { return window._psContentOwner(ex(c), mp(c)); };
        var NL = String.fromCharCode(10);
        var c1 = '[검토요청][박용훈 → 김종진, 박예빈] 2026-11-23' + NL + '[핵심내용]x';
        ok('상세내용: 받는이 중 사내 사람들', own(c1) === '김종진, 박예빈', own(c1));
        ok('상세내용: 받는이가 외부면 보낸이(사내)', own('[회신][박용훈 → John Smith]' + NL + '[핵심내용]x') === '박용훈');
        ok('상세내용: 외부→사내+외부면 사내 받는이만', own('[문의][John Smith → 박용훈, Mike]' + NL + '[핵심내용]x') === '박용훈');
        ok('상세내용: "고객" 같은 말은 사람으로 안 본다', own('[문의][고객 → Mike]' + NL + '[핵심내용]x') === '');
        ok('고를 거리에 그 담당자가 있다', cm.people.indexOf('조익현') >= 0, JSON.stringify(cm.people));

        window._psSetFilter({ who: '조익현' });
        var cw = window._psCollectFacts('month');
        var nJo = cm.facts.filter(function (f) { return f.assignee === '조익현'; }).length;
        ok('담당자로 고르면 그 사람 것만', cw.total === nJo && nJo > 0 && cw.filtered === true, cw.total + '/' + nJo);
        window._psSetFilter({ who: '없는사람' });
        var cz = window._psCollectFacts('month');
        ok('없는 담당자를 고르면 0건(조용히 전부 보여주지 않는다)', cz.total === 0, cz.total);
        // ⚠️ 선택지는 **거르기 전** 목록에서 만든다 — 한 번 고르면 다른 선택지가 사라지면 안 된다.
        ok('걸러도 고를 거리는 그대로', cz.people.indexOf('조익현') >= 0, JSON.stringify(cz.people));

        // 🔑 캐시 열쇠에 필터가 들어간다 — 다른 조건의 요약을 같은 것으로 보여 주면 조용한 오답이다.
        window._psSetFilter({ who: '' });
        var sigA = window._psCollectFacts('month').sig;
        window._psSetFilter({ who: '조익현' });
        var sigB = window._psCollectFacts('month').sig;
        ok('필터가 다르면 요약 캐시 열쇠도 다르다', sigA !== sigB, sigA + ' vs ' + sigB);
        window._psSetFilter({ who: '', proj: '' });

        // ══ 기간을 바꿔도 NAS 를 다시 읽지 않는다 (2026-11-09 신고) ═══════════
        // ⚠️ 신고: "일일/주간/월간/기간설정마다 담당자·프로젝트 업무를 못 가져오는 건지
        //    표현이 안 되는 건지 동작이 이상함". 원인은 캐시 열쇠에 **기간**이 들어가서
        //    누를 때마다 프로젝트 파일을 전부 다시 읽은 것(실측 1.0~7.5초). 그 동안 화면은
        //    "0건 · 선택지 없음" 이라 **못 가져오는 것처럼** 보였다.
        var scanCalls = 0;
        var realScan = window.dailyScanMyProjects;
        var tsOf = function (d) { return d.getTime(); };
        window.dailyScanMyProjects = function (tag, collect, onStep) {
            scanCalls++;
            // 다른 프로젝트 한 개 — 오늘 1건, 40일 전 1건(월간·기간설정에서만 보여야 한다)
            var mk = function (idx, when, who) {
                return { idx: idx, date: ymd(when), _ts: tsOf(when), task: '타프로젝트 ' + idx,
                         cat: 'HW', assignee: who, project: 'OTHER_PROJ', local: false,
                         status: '', sender: '', receiver: '', core: 'x', todo: '', issue: '', fix: '', answer: '' };
            };
            var got = { project: 'OTHER_PROJ', scanned: 2, facts: [mk(901, today, '남담당'), mk(902, D(-40), '남담당')] };
            if (onStep) onStep({ done: 0, total: 1, kept: 0 });
            // 진짜 스캐너처럼 **한 건 끝나자마자** collect 를 부른다(그 안에서 합친다)
            collect({ rows: [], ci: {}, meta: {}, members3: [], project: 'OTHER_PROJ' });
            return Promise.resolve({ results: [got], total: 1, kept: 1, errs: [], entries: [] });
        };
        P.scanProjects = true;
        window._psResetScan();
        // ⚠️ 가짜 collect 는 빈 행을 주므로 facts 가 0 이다 — 모아 두는 쪽을 직접 채워 흉내 낸다.
        window._psScan();
        await new Promise(function (r) { setTimeout(r, 50); });
        window._psOtherScan.facts = [
            { idx: 901, date: ymd(today), _ts: tsOf(today), task: '타프로젝트 오늘', cat: 'HW',
              assignee: '남담당', project: 'OTHER_PROJ', local: false, core: 'x', todo: '', issue: '', fix: '', answer: '' },
            { idx: 902, date: ymd(D(-40)), _ts: tsOf(D(-40)), task: '타프로젝트 지난달', cat: 'HW',
              assignee: '남담당', project: 'OTHER_PROJ', local: false, core: 'y', todo: '', issue: '', fix: '', answer: '' }
        ];
        window._psOtherScan.loaded = true;
        window._psOtherScan.busy = false;

        var before = scanCalls;
        var cDay = window._psCollectFacts('day');
        var cMon = window._psCollectFacts('month');
        window._psSetFilter({ from: ymd(D(-45)), to: ymd(D(-35)) });
        var cCus = window._psCollectFacts(P.customId);
        ok('기간을 바꿔도 다시 훑지 않는다', scanCalls === before, scanCalls + ' vs ' + before);
        ok('일일엔 오늘 것만 온다', cDay.facts.some(function (f) { return f.idx === 901; }) &&
           !cDay.facts.some(function (f) { return f.idx === 902; }),
           cDay.facts.map(function (f) { return f.idx; }).join(','));
        ok('월간/기간설정엔 그 기간 것이 온다',
           cMon.facts.some(function (f) { return f.idx === 901; }) &&
           cCus.facts.some(function (f) { return f.idx === 902; }) &&
           !cCus.facts.some(function (f) { return f.idx === 901; }),
           JSON.stringify([cMon.facts.map(function (f) { return f.idx; }), cCus.facts.map(function (f) { return f.idx; })]));
        ok('다른 프로젝트 담당자가 고를 거리에 들어온다', cMon.people.indexOf('남담당') >= 0, JSON.stringify(cMon.people));
        ok('다른 프로젝트가 고를 거리에 들어온다', cMon.projects.indexOf('OTHER_PROJ') >= 0, JSON.stringify(cMon.projects));
        window._psSetFilter({ from: '', to: '' });

        // ══ 담당자(프로젝트 담당자=PM) 기본 필터 + 캐스케이딩 (2026-11-11 요청) ═════════
        // 열린 프로젝트 PM='조익현', 다른 프로젝트(OTHER_PROJ) PM='남담당피엠' 로 나눠 둔다.
        window.projectMeta.프로젝트담당자 = '조익현';
        window._psOtherScan.facts.forEach(function (f) { f.pm = '남담당피엠'; });
        var cPm = window._psCollectFacts('month');
        ok('업무마다 프로젝트 담당자(PM)를 담는다', cPm.facts.filter(function (f) { return f.local; }).every(function (f) { return f.pm === '조익현'; }),
           JSON.stringify(cPm.facts.map(function (f) { return f.pm; })));
        ok('PM 고를 거리에 둘 다 있다', cPm.pms.indexOf('조익현') >= 0 && cPm.pms.indexOf('남담당피엠') >= 0, JSON.stringify(cPm.pms));

        window._psSetFilter({ pm: '조익현' });
        var cPmSel = window._psCollectFacts('month');
        ok('PM을 고르면 그 PM 소속 프로젝트만 남는다',
           cPmSel.projects.indexOf('OTHER_PROJ') === -1 && !cPmSel.facts.some(function (f) { return f.project === 'OTHER_PROJ'; }),
           JSON.stringify(cPmSel.projects));
        ok('업무 담당자(보조) 고를 거리도 PM 범위로 좁혀진다', cPmSel.people.indexOf('남담당') === -1, JSON.stringify(cPmSel.people));
        window._psSetFilter({ pm: '' });
        var cPmAll = window._psCollectFacts('month');
        ok('PM 필터를 풀면 다시 둘 다 보인다', cPmAll.projects.indexOf('OTHER_PROJ') >= 0, JSON.stringify(cPmAll.projects));

        // ⚠️⚠️ [2026-11-11 2차 신고] "담당자가 지금 접속한 나만 보인다 — 개발3팀 전부가 보여야 한다"
        //    — 원인은 PM·프로젝트 선택지를 **기간이 적용된 사실**에서 뽑은 것이었다. 이번 달(기간)엔
        //    메일이 **한 건도 없는** 팀 프로젝트(`QUIET_PROJ`, PM='조용한피엠')를 project_index
        //    항목(`entries`)에만 심어 두고, 그래도 선택지에 나오는지 확인한다.
        window._psOtherScan.entries = [{ file_name: 'QUIET_PROJ.json', team: '개발3팀', assignee: '조용한피엠' }];
        var cQuiet = window._psCollectFacts('month');
        ok('이번 기간에 사실이 0건인 프로젝트도 PM 선택지에 보인다', cQuiet.pms.indexOf('조용한피엠') >= 0, JSON.stringify(cQuiet.pms));
        ok('그 프로젝트도 프로젝트 선택지에 보인다', cQuiet.projects.indexOf('QUIET_PROJ') >= 0, JSON.stringify(cQuiet.projects));
        ok('하지만 사실 목록엔 안 들어온다(0건이니까)', !cQuiet.facts.some(function (f) { return f.project === 'QUIET_PROJ'; }));
        window._psOtherScan.entries = [];
        window._psSetFilter({ pm: '', who: '', proj: '' });

        // ⚠️ 훑는 중엔 "없습니다" 라고 하면 안 된다 — 없는 것과 아직 못 읽은 것이 구분이 안 된다.
        window._psOtherScan.facts = [];
        window._psOtherScan.busy = true;
        window._psOtherScan.done = 2; window._psOtherScan.total = 5;
        window._psSetFilter({ from: '2020-01-01', to: '2020-01-31' });   // 확실히 0건인 기간
        window._psSetMode(P.customId);
        await new Promise(function (r) { setTimeout(r, 200); });
        var busyTxt = document.getElementById('psummary-page').innerText;
        ok('훑는 중엔 "확인하는 중" 이라고 말한다', /확인하는 중|Scanning/.test(busyTxt) && !/없습니다/.test(busyTxt),
           busyTxt.split('\n').filter(Boolean).slice(-2));
        window._psOtherScan.busy = false;
        await new Promise(function (r) { setTimeout(r, 150); });
        window._renderAiProjectSummaryBody();
        ok('다 읽고 나서야 "없습니다"', /없습니다|No mail-derived/.test(document.getElementById('psummary-page').innerText));
        window._psSetFilter({ from: '', to: '' });
        window.dailyScanMyProjects = realScan;
        window._psResetScan();
        P.scanProjects = false;

    } finally {
        window.globalData = keep.gd; window.colIdx = keep.ci; window.projectMeta = keep.pm; window.callAiBackend = keep.call; window.getActiveAiKey = keep.key; window._ganttQaHistory = keep.hist || [];
        window.currentDriveFileName = keep.fileName; window.nasAppFile = keep.nas;
        if (keep.mode == null) localStorage.removeItem(P.modeKey); else localStorage.setItem(P.modeKey, keep.mode);
        if (keep.filt == null) localStorage.removeItem(P.filterKey); else localStorage.setItem(P.filterKey, keep.filt);
        P.scanProjects = keep.scan;
        var m = document.getElementById('ai-summary-modal'); if (m) m.style.display = 'none';
        if (window.switchTab && keep.tab) { try { window.switchTab(keep.tab); } catch (e) { /* 무시 */ } }
        if (window._renderAiProjectSummaryBody) { try { window._renderAiProjectSummaryBody(); } catch (e) { /* 무시 */ } }
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    return { pass: pass, fail: fail };
})();
