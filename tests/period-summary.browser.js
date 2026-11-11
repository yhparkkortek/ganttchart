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
    var keep = { gd: window.globalData, ci: window.colIdx, pm: window.projectMeta, call: window.callAiBackend, key: window.getActiveAiKey, mode: localStorage.getItem(P.modeKey), hist: window._ganttQaHistory,
                 filt: localStorage.getItem(P.filterKey), scan: P.scanProjects, fileName: window.currentDriveFileName };
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
            row(1, '오늘 메일 업무', '[고객→박용훈]\n[핵심내용] 패널 단가 회신 요청\n[To do] 11/10 까지 견적 송부\n[출처]x_8 Nov 2026 09:00:00_a@b.c', D(0)),
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

        // 모달 — 기간 모드가 기본, 숫자 네 칸 없음, 툴바 있음
        localStorage.setItem(P.modeKey, 'week');
        window.openAiProjectSummaryModal();
        var body = document.getElementById('ai-summary-body');
        ok('툴바(일일/주간/월간/기간설정)가 그려졌다', !!body.querySelector('#ps-period-toolbar') && /일일|Daily/.test(body.textContent) && /월간|Monthly/.test(body.textContent) && /기간설정|Range/.test(body.textContent));
        // 📊 [2026-11-09] '일정 현황' 은 간트 상태 칸이 관리되지 않아 접었다(showLegacy:false).
        //    ⚠️ 숨기는 것으로 끝나면 안 된다 — 그 모드에만 매인 버튼(프롬프트·PPT)이 남아 있으면
        //       눌러도 "먼저 리포트를 만들어주세요" 만 뜬다.
        ok('일정 현황 버튼이 없다', !/일정 현황|Schedule view/.test(body.textContent), body.textContent.slice(0, 80));
        ok('그 모드 전용 버튼도 같이 숨는다', (function () {
            var p = document.getElementById('ai-summary-open-prompt-btn');
            var ppt = document.querySelector('#ai-summary-modal [onclick*="exportAiProjectSummaryPPT"]');
            return (!p || p.style.display === 'none') && (!ppt || ppt.style.display === 'none');
        })());
        ok('🖨️ PDF 는 남는다(기간 모드에서도 찍힌다)', (function () {
            var pdf = document.querySelector('#ai-summary-modal [onclick*="printAiProjectSummary"]');
            return !!pdf && pdf.style.display !== 'none';
        })());
        // ⚠️ 옛 설정이 'legacy' 로 남아 있어도 **갇히지 않는다**(돌아올 버튼이 없으니까).
        localStorage.setItem(P.modeKey, P.legacyId);
        ok('꺼 둔 모드가 저장돼 있어도 기본 모드로 돌아온다', window._psMode() === P.defaultMode, window._psMode());
        ok('기간 모드엔 완료/진행/대기/지연 네 칸이 없다', !/repeat\(4,\s*1fr\)/.test(body.innerHTML));
        ok('사실 목록이 #G 링크로 그려졌다', /#G1\b/.test(body.textContent) && /패널 단가 회신 요청/.test(body.textContent));
        ok('생성 버튼 라벨이 기간용', /AI 요약 생성|Generate AI summary/.test(document.getElementById('ai-summary-generate-btn').textContent));
        // 일정 현황(옛) 모드 — 스위치를 켜면 **여전히 돈다**(지운 게 아니라 접은 것이다).
        P.showLegacy = true;
        window._psSetMode(P.legacyId);
        ok('켜면 일정 현황이 다시 나온다', /일정 현황|Schedule view/.test(body.textContent));
        ok('일정 현황 모드에서도 숫자 네 칸은 숨긴다(showCounts=false)', !/repeat\(4,\s*1fr\)/.test(body.innerHTML) && !!body.querySelector('#ps-period-toolbar'));
        ok('그 모드에선 전용 버튼이 보인다', (function () {
            var p = document.getElementById('ai-summary-open-prompt-btn');
            return !p || p.style.display !== 'none';
        })());
        P.showLegacy = false;
        window._psSetMode('day');

        // AI 생성 — 가짜 응답(접지 안 된 문장 1개 포함)
        window.getActiveAiKey = function () { return 'fake'; };
        var prompts = [];
        window.callAiBackend = async function (k, prompt) {
            prompts.push(prompt);
            return { ok: true, data: { result: { candidates: [{ content: { parts: [{ text: '```json\n{"요약":["패널 단가 회신을 요청받음 #G1","환각 문장 — 근거 없음"],"요청·결정":["11/10 까지 견적 송부 요청 #G1"],"미해결":[]}\n```' }] } }] } } };
        };
        var res = await window.generatePeriodSummary('day');
        ok('프롬프트는 사실 목록만 싣고 #G 근거를 요구한다', prompts.length === 1 && /\[사실 목록\]/.test(prompts[0]) && /#G1 \[/.test(prompts[0]) && /반드시/.test(prompts[0]) && !/완료 \d+/.test(prompts[0]), prompts[0] && prompts[0].slice(0, 300));
        ok('근거 없는 문장 1개 제거 · 2문장 유지 · 캐시 저장', res && res.dropped === 1 && res.요약.length === 1 && res.요청결정.length === 1 && window.projectMeta.aiPeriodSummary.day.rangeKey === ymd(today), res);
        ok('화면에 AI 요약과 제거 수가 보인다', /패널 단가 회신을 요청받음/.test(body.textContent) && /근거 없는 문장 1개/.test(body.textContent));
        var txt = window.periodSummaryText('day');
        ok('글 버전(텔레그램용)에 요약·사실이 함께', /요약/.test(txt) && /#G1/.test(txt) && /패널 단가/.test(txt), txt.slice(0, 200));

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
        ok('담당자를 역할에서 푼다', cm.facts.length > 0 && cm.facts.every(function (f) { return f.assignee === '조익현'; }),
           JSON.stringify(cm.facts.map(function (f) { return f.assignee; })));
        ok('고를 거리에 그 담당자가 있다', cm.people.indexOf('조익현') >= 0, JSON.stringify(cm.people));

        window._psSetFilter({ who: '조익현' });
        var cw = window._psCollectFacts('month');
        ok('담당자로 고르면 그 사람 것만', cw.total === cm.total && cw.filtered === true, cw.total + '/' + cm.total);
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
        var busyTxt = document.getElementById('ai-summary-body').innerText;
        ok('훑는 중엔 "확인하는 중" 이라고 말한다', /확인하는 중|Scanning/.test(busyTxt) && !/없습니다/.test(busyTxt),
           busyTxt.split('\n').filter(Boolean).slice(-2));
        window._psOtherScan.busy = false;
        await new Promise(function (r) { setTimeout(r, 150); });
        window._renderAiProjectSummaryBody();
        ok('다 읽고 나서야 "없습니다"', /없습니다|No mail-derived/.test(document.getElementById('ai-summary-body').innerText));
        window._psSetFilter({ from: '', to: '' });
        window.dailyScanMyProjects = realScan;
        window._psResetScan();
        P.scanProjects = false;

    } finally {
        window.globalData = keep.gd; window.colIdx = keep.ci; window.projectMeta = keep.pm; window.callAiBackend = keep.call; window.getActiveAiKey = keep.key; window._ganttQaHistory = keep.hist || [];
        window.currentDriveFileName = keep.fileName;
        if (keep.mode == null) localStorage.removeItem(P.modeKey); else localStorage.setItem(P.modeKey, keep.mode);
        if (keep.filt == null) localStorage.removeItem(P.filterKey); else localStorage.setItem(P.filterKey, keep.filt);
        P.scanProjects = keep.scan;
        var m = document.getElementById('ai-summary-modal'); if (m) m.style.display = 'none';
        if (window._renderAiProjectSummaryBody) { try { window._renderAiProjectSummaryBody(); } catch (e) { /* 무시 */ } }
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과');
    return { pass: pass, fail: fail };
})();
