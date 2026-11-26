// 🎨 날짜 글자색 검증 하네스 — 일·공휴일 빨강 / 토 파랑 / 평일 회색 (2026-11-25)
//
//  돌리는 법: 앱을 연 직후(프로젝트 안 연 상태) 콘솔에 붙여넣은 뒤 `await __dateColorTest()`
//            실제 프로젝트가 열려 있으면 **거부한다** → `await __dateColorTest({force:true})`
//
//  ■ 무엇을 검사하나 — 규칙은 docs/ui-conventions.md "날짜 글자색 기준"
//    · 판정 함수 `_dateDayCls`(js/04a) 단위 확인 (일·토·평일·평일 공휴일·빈 값·날짜 아닌 글자)
//    · 페이지별로 **화면에 그려진 날짜의 실제 계산된 색·굵기**를 읽어 규칙과 대조:
//      Daily Report 하루 헤더·월 머리글 / Calendar 월·주 / Summary 마일스톤 / Document 날짜 칸 /
//      Weekly Report 카드·문제점 표·타임라인 / Project Review 표·근거 사실 목록
//    · JIRA 표·JIRA 검색 표·Alarm·Notice 는 ⚠️ **간접 확인** — 데이터를 넣어 그리는 입구가 모듈 안에 있어
//      못 부른다. 같은 범위(#tab-jira 등) 안에 `date-day-*` 클래스를 단 td 를 만들어 팔레트 CSS 가 먹는지만 본다.
//      (각 화면 코드가 클래스를 붙이는 것은 소스에서 확인할 것: js/70·js/22b·js/22c)
//
//  ■ 가짜는 **경계에만**: 일일보고의 NAS 읽기 4개(`dailyEnsureIdentity`/`dailyLoadRoster`/`dailyLoadMonth`/`dailyLoadDay`),
//    Project Review 의 사실 수집(`_psCollectFacts`)·캐시, 간트 `globalData`(합성 업무). 화면을 그리고 색을 다는 코드는 전부 진짜.
//
//  ■⚠️ 왜 "실제 프로젝트가 열려 있으면 거부"하나
//    간트 `globalData`·`colIdx`·마일스톤 입력칸·`projectMeta.aiPeriodSummary` 를 합성값으로 바꾼다.
//    앱 자동저장이 그걸 NAS 에 쓸 수 있다 → 저장은 막고 끝나면 되돌리지만, **끝나면 새로고침**하는 게 가장 안전하다.
//
//  ■ 날짜는 2026 년 값을 쓴다 — 공휴일 표(`isHoliday`)에 2026-10-09·2026-12-25(평일 공휴일)가 있다고 가정.
//    다른 해로 옮기면 `HOLI` 를 고칠 것. 1회 돌릴 때마다 새로고침 후 다시 돌리는 걸 권한다.
//
//  ■ 돌연변이 확인용 한 줄: `_dateDayCls` 를 감싸 토요일을 'date-day-wk' 로 돌려 보내면 21건이 실패해야 한다
//    (날짜 색을 칠하는 모든 페이지가 이 함수를 거친다 — 요일을 제 코드로 계산하는 페이지는 없다).
//
//  ■ 처음 만든 검사식이 가짜 실패를 낸 적이 있다 — 평일 굵기를 틀리게 가정했다(Daily 하루 라벨은 원래 700).
//    "코드가 틀렸나, 검사가 틀렸나" 를 먼저 가를 것.
(function () {
    'use strict';

    var OK = 0, FAIL = 0, LOG = [];
    var ok = function (n, c, x) {
        if (c) { OK++; LOG.push('  ✅ ' + n); } else { FAIL++; LOG.push('  ❌ ' + n + (x ? '  → ' + x : '')); }
    };
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var raf = function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(r, 30); }); }); }); };

    var RED = 'rgb(211, 47, 47)', BLUE = 'rgb(30, 111, 232)', GRAY = 'rgb(85, 85, 85)';
    var CAL_RED = 'rgb(224, 49, 49)';          // Calendar 만 원래 쓰던 빨강(#e03131)
    var DAILY_WK = 'rgb(68, 68, 68)';          // Daily 하루 보기 라벨은 평일에 원래 색(#444)을 그대로 둔다
    var HOLI = ['2026-10-09', '2026-12-25'];   // 평일에 걸린 공휴일 — 이게 안 잡히면 공휴일 판정이 죽은 것

    function kind(s) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); if (!m) return '';
        var wd = new Date(+m[1], +m[2] - 1, +m[3]).getDay();
        var hol = wd === 0 || !!(window.isHoliday && window.isHoliday(m[1] + '-' + m[2] + '-' + m[3]));
        return hol ? 'hol' : (wd === 6 ? 'sat' : 'wk');
    }
    function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function goTab(n) {
        var t = document.querySelector('[onclick*="switchTab(\'' + n + '"]');
        if (!t) throw new Error('탭을 못 찾음: ' + n);
        t.click();
    }
    function newTally() { return { hol: 0, sat: 0, wk: 0, bad: [] }; }
    /** 한 칸 판정. 빨강·파랑은 **볼드**, 평일은 굵기 불문(페이지별 원래 스타일 유지). */
    function judge(t, e, cs, o) {
        o = o || {};
        t[e]++;
        var want = e === 'hol' ? (o.red || RED) : (e === 'sat' ? BLUE : (o.wk || GRAY));
        if (cs.color !== want) return false;
        if (e !== 'wk' && +cs.fontWeight < 600) return false;
        if (e === 'wk' && o.wkNormal && +cs.fontWeight >= 600) return false;
        return true;
    }
    function report(name, t, o) {
        o = o || {};
        ok(name + ' — 불일치 0건 (일·공휴일 ' + t.hol + ' / 토 ' + t.sat + ' / 평일 ' + t.wk + ')', t.bad.length === 0, JSON.stringify(t.bad.slice(0, 4)));
        // 한 종류도 안 만났으면 검사가 허공을 친 것(통과는 의미 없다)
        ok(name + ' — 세 종류 날짜를 다 만났다', t.hol > 0 && t.sat > 0 && t.wk > 0, 'hol=' + t.hol + ' sat=' + t.sat + ' wk=' + t.wk);
    }

    window.__dateColorTest = async function (opt) {
        opt = opt || {};
        OK = 0; FAIL = 0; LOG = [];
        LOG.push('🎨 날짜 글자색 검증');

        if (typeof window._dateDayCls !== 'function') { console.log('❌ js/04a 의 _dateDayCls 가 없습니다.'); return { ok: 0, fail: 1 }; }
        var live = String((window.projectMeta || {}).프로젝트명 || '').trim();
        if (live && !opt.force) {
            console.log('⛔ 실제 프로젝트가 열려 있습니다: "' + live + '"\n'
                + '   이 하네스는 간트 데이터·입력칸을 합성값으로 바꿉니다 — 새로고침 직후에 돌리세요.\n'
                + '   그래도 돌리려면: await __dateColorTest({force:true})');
            return { ok: 0, fail: 0, refused: true };
        }
        // 로그인 가림막(있으면)을 치워야 화면 값을 읽을 수 있다
        document.querySelectorAll('body *').forEach(function (e) {
            var cs = getComputedStyle(e);
            if (cs.position === 'fixed' && e.querySelector && e.querySelector('input[type=password]')) e.style.display = 'none';
        });

        // ── 되돌릴 것 보관 + 저장 차단 ───────────────────────────────
        var saved = {
            save: window.saveToGoogleDrive, auto: window.autoSaveCurrentSnapshot,
            ensure: window.dailyEnsureIdentity, roster: window.dailyLoadRoster, month: window.dailyLoadMonth,
            day: window.dailyLoadDay, sync: window.dailyRosterSyncIfNotifier,
            dView: window._dailyView, dDate: window._dailyTabDate,
            ps: window._psCollectFacts, aiSum: (window.projectMeta || {}).aiPeriodSummary,
            wrState: window.wrState, wrBase: window.wrBaseDate,
            cal: window.calState ? JSON.parse(JSON.stringify(window.calState)) : null,
            gd: (typeof globalData !== 'undefined') ? globalData.slice() : null,
            contentCol: (typeof colIdx !== 'undefined') ? colIdx.content : undefined
        };
        window.saveToGoogleDrive = function () { console.warn('[date-color harness] 저장 차단됨'); return Promise.resolve(); };
        window.autoSaveCurrentSnapshot = function () {};
        var sumInputs = [], sumBefore = [];

        try {
            // ── 0) 판정 함수 단위 ─────────────────────────────────────
            ok('_dateDayCls: 일요일 → hol', window._dateDayCls('2026-11-22') === 'date-day-hol');
            ok('_dateDayCls: 토요일 → sat', window._dateDayCls('2026-11-21') === 'date-day-sat');
            ok('_dateDayCls: 평일 → wk', window._dateDayCls('2026-11-25') === 'date-day-wk');
            HOLI.forEach(function (h) { ok('_dateDayCls: 평일 공휴일 ' + h + ' → hol', window._dateDayCls(h) === 'date-day-hol'); });
            ok('_dateDayCls: 빈 값 → 빈 문자열', window._dateDayCls('') === '' && window._dateDayCls(null) === '');
            ok('_dateDayCls: 날짜 아닌 글자 → 빈 문자열', window._dateDayCls('abc') === '');
            ok('_dateDayCls: 시각이 붙어도 읽는다', window._dateDayCls('2026-11-22 10:30') === 'date-day-hol');

            // ── 1) Daily Report ───────────────────────────────────────
            try {
                window.dailyEnsureIdentity = async function () {};
                window.dailyLoadRoster = async function () { return [{ key: 'a', name: '홍', active: true }]; };
                window.dailyLoadMonth = async function () { return {}; };
                window.dailyLoadDay = async function () { return []; };
                window.dailyRosterSyncIfNotifier = function () {};
                goTab('daily'); await sleep(600);
                var dd = newTally(); window._dailyView = 'day';
                for (var i = 0; i < 92; i++) {
                    var s = ymd(new Date(2026, 9, 1 + i)); window._dailyTabDate = s; await window.dailyRenderTab();
                    var e = kind(s), cs = getComputedStyle(document.getElementById('daily-day-label')); dd[e]++;
                    var good = e === 'wk' ? cs.color === DAILY_WK : (cs.color === (e === 'hol' ? RED : BLUE) && +cs.fontWeight >= 600);
                    if (!good) dd.bad.push([s, e, cs.color, cs.fontWeight]);
                }
                report('Daily Report 하루 보기 헤더 라벨(92일)', dd);
                var dm = newTally(); window._dailyView = 'month';
                for (var mm = 0; mm < 12; mm++) {
                    var s2 = '2026-' + String(mm + 1).padStart(2, '0') + '-15'; window._dailyTabDate = s2; await window.dailyRenderTab();
                    var ths = [].slice.call(document.querySelectorAll('#daily-report-page thead th')).slice(1);
                    var last = new Date(2026, mm + 1, 0).getDate();
                    var widths = [];
                    if (ths.length !== last) dm.bad.push(['칸 수', s2, ths.length, last]);
                    ths.forEach(function (th, i2) {
                        var ds = '2026-' + String(mm + 1).padStart(2, '0') + '-' + String(i2 + 1).padStart(2, '0'); var ee = kind(ds);
                        if (!judge(dm, ee, getComputedStyle(th))) dm.bad.push([ds, ee]);
                        widths.push(th.getBoundingClientRect().width);
                    });
                    // ⚠️ 칸 폭은 "28px 고정" 이 아니라 "모두 같다" 가 약속이다 — 화면이 넓으면 표가 컨테이너를 채우며 29px 대로 늘어난다
                    //    (1280px 뷰포트에서 29.1~29.3px 가 나와 가짜 실패가 났다). 하한 27.5px 는 좁은 화면에서 줄어들지 않는지 본다.
                    if (widths.length && (Math.max.apply(null, widths) - Math.min.apply(null, widths) > 1.5 || Math.min.apply(null, widths) < 27.5)) dm.bad.push(['칸 폭이 고르지 않다', s2, Math.min.apply(null, widths).toFixed(2), Math.max.apply(null, widths).toFixed(2)]);
                }
                report('Daily Report 월 보기 머리글(12개월, 칸 폭이 고르다)', dm);
            } catch (err) { ok('Daily Report 실행', false, err.message); }

            // ── 2) Calendar 월 / 주 ──────────────────────────────────
            try {
                goTab('calendar'); await sleep(700);
                var calChk = function (t, seen) {
                    document.querySelectorAll('.cal-day-cell').forEach(function (c) {
                        // ⚠️ 달력은 앞뒤 달까지 이어서 그린다 — 날짜는 "표시 월+숫자" 가 아니라 칸의 onclick 에서 읽는다
                        var m = /'(\d{4}-\d{2}-\d{2})'/.exec(c.getAttribute('onclick') || '');
                        if (!m || c.classList.contains('cal-today')) return;       // 오늘 칸은 자체 강조색
                        var ds = m[1]; if (seen[ds]) return; seen[ds] = 1;
                        var n = c.querySelector('.cal-day-num'); var ee = kind(ds);
                        if (+n.textContent.trim().replace(/\D/g, '') !== +ds.slice(8)) t.bad.push(['숫자≠날짜', ds, n.textContent.trim()]);
                        if (!judge(t, ee, getComputedStyle(n), { red: CAL_RED, wkNormal: true })) t.bad.push([ds, ee]);
                    });
                };
                var cm = newTally(), seenM = {}; window.calState.viewMode = 'month';
                for (var q = 0; q < 12; q++) { window.calState.year = 2026; window.calState.month = q; window.calRender(); await sleep(50); calChk(cm, seenM); }
                report('Calendar 월 보기(2026 한 해 + 앞뒤 달)', cm);
                var cw = newTally(), seenW = {}; window.calSetViewMode('week');
                var d0 = new Date(2026, 0, 1); d0.setDate(d0.getDate() - d0.getDay()); window.calState.weekStart = d0.getTime(); window.calRender();
                for (var w = 0; w < 54; w++) { await sleep(35); calChk(cw, seenW); window.calChangePeriod(1); }
                report('Calendar 주간 보기(54주)', cw);
                window.calSetViewMode('month');
            } catch (err) { ok('Calendar 실행', false, err.message); }

            // ── 3) Summary 마일스톤 ──────────────────────────────────
            try {
                goTab('summary'); await sleep(600);
                var selS = '#sum-milestone-body input[data-stage], #sum-milestone-body-actual input[data-stage]';
                sumInputs = [].slice.call(document.querySelectorAll(selS)); sumBefore = sumInputs.map(function (x) { return x.value; });
                var su = newTally();
                for (var r = 0; r < 6; r++) {
                    sumInputs.forEach(function (inp, k) { inp.value = ymd(new Date(2026, 9, 1 + r * 18 + k)); inp.dispatchEvent(new Event('input', { bubbles: true })); });
                    sumInputs.forEach(function (inp) { var ee = kind(inp.value); if (!judge(su, ee, getComputedStyle(inp), { wkNormal: true })) su.bad.push([inp.value, ee]); });
                }
                report('Summary 마일스톤 계획·실적 입력칸(' + sumInputs.length + '칸 × 6라운드)', su);
                // 코드가 값을 채우고(이벤트 없음) 탭을 다시 열었을 때 — 프로젝트 불러오기·마법사 경로
                sumInputs.forEach(function (inp, k) { inp.value = ymd(new Date(2026, 9, 1 + 300 + k)); });
                goTab('gantt'); await sleep(100); goTab('summary'); await sleep(200);
                var coded = newTally();
                sumInputs.forEach(function (inp) { var ee = kind(inp.value); if (!judge(coded, ee, getComputedStyle(inp), { wkNormal: true })) coded.bad.push([inp.value, ee]); });
                ok('Summary — 코드로 채운 값도 탭 재진입 때 칠해진다(불일치 0)', coded.bad.length === 0, JSON.stringify(coded.bad.slice(0, 3)));
                sumInputs.forEach(function (inp) { inp.value = ''; inp.dispatchEvent(new Event('change', { bubbles: true })); });
                ok('Summary — 값을 지우면 색 클래스도 사라진다', sumInputs.filter(function (i) { return /date-day-/.test(i.className); }).length === 0);
                sumInputs[0].value = 'abc'; sumInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                ok('Summary — 날짜 아닌 글자에는 색이 안 붙는다', !/date-day-/.test(sumInputs[0].className));
            } catch (err) { ok('Summary 실행', false, err.message); }

            // ── 4) Document ──────────────────────────────────────────
            // ⚠️ 이 칸들은 앱이 `requestAnimationFrame` 으로 색을 다시 단다 — 브라우저 창이 **숨겨져** 있으면 rAF 가 안 돌아
            //    색이 영영 안 붙는다(코드 고장이 아니라 환경). 그때 ❌ 로 오보하지 않고 건너뜀을 알린다.
            var rafWorks = await Promise.race([raf().then(function () { return true; }), sleep(800).then(function () { return false; })]);
            if (!rafWorks) {
                LOG.push('  ⚠️ Document 날짜 칸 — 건너뜀: 창이 숨겨져 있어 requestAnimationFrame 이 안 돈다(미리보기 창을 보이게 하고 다시 돌릴 것)');
            } else try {
                goTab('document'); await sleep(900);
                var host = document.getElementById('doc-page-body'); var dc = newTally();
                var forms = ['model-spec', 'sample-report', 'proto-req', 'label-spec'];   // 날짜 입력칸이 있는 서식
                for (var fi = 0; fi < forms.length; fi++) {
                    window._docPick(forms[fi]); await sleep(450);
                    for (var r3 = 0; r3 < 5; r3++) {
                        host.querySelectorAll('input[type=date]').forEach(function (inp, k) { inp.value = ymd(new Date(2026, 9, 1 + r3 * 13 + k)); inp.dispatchEvent(new Event('input', { bubbles: true })); });
                        await raf();
                        host.querySelectorAll('input[type=date]').forEach(function (inp) { var ee = kind(inp.value); if (!judge(dc, ee, getComputedStyle(inp), { wkNormal: true })) dc.bad.push([inp.value, ee]); });
                    }
                }
                report('Document 날짜 칸(서식 4종 × 5라운드)', dc);
                // 감시(MutationObserver) 경로 — 합성 칸을 본문에 끼워 넣는다
                var box = document.createElement('div'); host.appendChild(box); var syn = newTally();
                for (var k2 = 0; k2 < 92; k2++) { var inp2 = document.createElement('input'); inp2.type = 'date'; inp2.value = ymd(new Date(2026, 9, 1 + k2)); box.appendChild(inp2); }
                await raf();
                box.querySelectorAll('input[type=date]').forEach(function (inp) { var ee = kind(inp.value); if (!judge(syn, ee, getComputedStyle(inp), { wkNormal: true })) syn.bad.push([inp.value, ee]); });
                report('Document 합성 날짜 칸 92개(감시 경로)', syn);
                var first = box.querySelector('input'); first.value = ''; first.dispatchEvent(new Event('change', { bubbles: true })); await raf();
                ok('Document — 값을 지우면 색 클래스도 사라진다', !/date-day-/.test(first.className));
                box.remove();
            } catch (err) { ok('Document 실행', false, err.message); }

            // ── 5) Weekly Report (카드·문제점 표·타임라인) ─────────────
            try {
                colIdx.content = 0;
                var H = [['content']];
                for (var wi = 0; wi < 14; wi++) {      // 11/16(월)~11/29(일) 하루씩, 시작·종료가 이어진다
                    var s0 = new Date(2026, 10, 16 + wi).getTime(), e0 = new Date(2026, 10, 17 + wi).getTime();
                    var a = ['']; a._level = 0; a._origDev = 'L0-' + wi; a._calcStartTs = s0; a._calcPlanTs = e0; H.push(a);
                    var b = ['[문제점] 이슈' + wi + '\n[대책] 대책' + wi]; b._level = 3; b._origT3 = '업무' + wi; b._calcStartTs = s0; b._calcPlanTs = e0; H.push(b);
                }
                globalData.length = 0; H.forEach(function (x) { globalData.push(x); });
                window.wrState = { levelFilter: [3, 4], taskMode: 'wbs' }; window.wrBaseDate = new Date(2026, 10, 18);
                goTab('weekly'); await sleep(700); window.showWeeklyReport(); await sleep(600);
                var pg = document.getElementById('weekly-report-page');
                var wScan = function (t, root) {
                    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
                    while ((n = tw.nextNode())) {
                        var g = /(\d{2})\/(\d{2}) '(\d{2})/g, m;
                        while ((m = g.exec(n.nodeValue))) {
                            var ds = '20' + m[3] + '-' + m[1] + '-' + m[2]; var ee = kind(ds);
                            var el = n.parentElement, cs = getComputedStyle(el), colored = /date-day-/.test(el.className);
                            if (ee === 'wk') { t.wk++; if (colored || cs.color === RED || cs.color === BLUE) t.bad.push([ds, ee, '평일이 칠해짐']); }
                            else if (!(colored && judge(t, ee, cs))) t.bad.push([ds, ee, el.className]);
                        }
                    }
                };
                var wc = newTally(), wt = newTally(), wl = newTally();
                // ⚠️ 카드는 이번 주·다음 주 두 목록으로 나뉜다 — 한쪽만 훑으면 절반을 놓친다(카드마다 훑을 것)
                pg.querySelectorAll('.wr-print-item').forEach(function (c) { wScan(wc, c); });
                [].slice.call(pg.querySelectorAll('table')).filter(function (t) { return /문제점|Issue/.test(t.textContent); }).forEach(function (t) { wScan(wt, t); });
                var tl = pg.querySelector('#wr-level0-timeline'); if (tl) wScan(wl, tl);
                report('Weekly Report 업무 카드 제목(시작·종료)', wc);
                report('Weekly Report 문제점 표(첫 칸 + 추진일정)', wt);
                report('Weekly Report 타임라인 날짜', wl);
                ok('Weekly Report — 업무 카드 14장', pg.querySelectorAll('.wr-print-item').length === 14, String(pg.querySelectorAll('.wr-print-item').length));
            } catch (err) { ok('Weekly Report 실행', false, err.message); }

            // ── 6) Project Review (표·근거 사실 목록) ────────────────
            try {
                // ⚠️ 주간 보고 단계가 `wrBaseDate` 를 11/18 로 바꿔 두었다 — 그대로 리뷰로 넘어가면 js/78 이 그 주를 리뷰의 `📅 기간설정` 으로 이어줘서
                //    모드가 바뀌고, 아래에서 **옛 모드 열쇠**로 심은 요약 캐시를 못 찾아 표가 안 그려진다(순서 의존 가짜 실패). 이어주기가 안 일어나게 이번 주로 되돌린다.
                window.wrBaseDate = new Date();
                var dates = []; for (var dd2 = 16; dd2 <= 29; dd2++) dates.push('2026-11-' + dd2);
                dates.push('2026-12-25', '2026-10-09', '2026-12-26', '2026-12-27');
                var orig = window._psCollectFacts;
                window._psCollectFacts = function (kd, base) {
                    var c = orig.call(this, kd, base);
                    c.facts = dates.map(function (dt, i) { return { date: dt, idx: 100 + i, rowIdx: 100 + i, task: 'T' + i, project: 'PRJ', cat: 'HW', assignee: '홍', core: '핵심' + i, local: false }; });
                    c.sig = 'TESTSIG'; c.total = c.facts.length; c.scanned = c.facts.length; c.projects = ['PRJ']; return c;
                };
                var kd = window._psMode(); window.projectMeta = window.projectMeta || {}; window.projectMeta.aiPeriodSummary = {};
                window.projectMeta.aiPeriodSummary[kd] = { rangeKey: 'TESTSIG', at: Date.now(), by: 't', factCount: dates.length,
                    rows: dates.map(function (dt, i) { return { cat: 'done', projects: ['PRJ'], people: ['홍'], roles: [], date: dt, text: '행' + i, refs: [], common: false }; }) };
                goTab('psummary'); await sleep(1500);
                var det = document.getElementById('ps-facts-det'); if (det) det.open = true;
                var pt = newTally(), pf = newTally();
                [].slice.call(document.querySelectorAll('#ps-ai-tbl tbody tr')).forEach(function (tr) {
                    var td = tr.children[4], s = td.textContent.trim(), ee = kind(s);
                    if (!judge(pt, ee, getComputedStyle(td), { wkNormal: true })) pt.bad.push([s, ee]);
                });
                // 📋 [2026-11-26] 근거 사실 목록은 카드 → 표(js/79) — 날짜는 둘째 칸. AI 요약 표와 같은 규칙(평일은 평범한 회색).
                [].slice.call(document.querySelectorAll('#ps-facts-body tbody tr[id^="ps-fact-"]')).forEach(function (tr) {
                    var td = tr.children[1], s = td.textContent.trim().slice(0, 10), ee = kind(s);
                    if (!judge(pf, ee, getComputedStyle(td), { wkNormal: true })) pf.bad.push([s, ee]);
                });
                ok('Project Review 근거 사실 표에 행이 그려졌다', document.querySelectorAll('#ps-facts-body tbody tr[id^="ps-fact-"]').length > 0);
                report('Project Review 표 날짜 열(' + dates.length + '행)', pt);
                report('Project Review 근거 사실 표 날짜 열', pf);
            } catch (err) { ok('Project Review 실행', false, err.message); }

            // ── 7) JIRA 표·검색 표·Alarm·Notice — ⚠️ 간접 확인(범위 CSS) ──
            try {
                var scopes = [['JIRA 표', 'tab-jira'], ['JIRA 검색 표', 'jira-search-modal'], ['Alarm', 'tab-alarm'], ['Notice', 'tab-alarm']];
                scopes.forEach(function (sc) {
                    var host = document.getElementById(sc[1]), made = false;
                    if (!host) { host = document.createElement('div'); host.id = sc[1]; document.body.appendChild(host); made = true; }   // 검색 모달은 열기 전엔 없다
                    var tb = document.createElement('table'), t = newTally(); host.appendChild(tb);
                    for (var k = 0; k < 92; k++) {
                        var ds = ymd(new Date(2026, 9, 1 + k)), td = tb.insertRow().insertCell();
                        td.className = window._dateDayCls(ds); td.textContent = ds; td.style.cssText = 'color:#888';   // 실제 칸처럼 인라인 색을 깔아 둔다 — 팔레트가 덮는지 본다
                    }
                    [].slice.call(tb.querySelectorAll('td')).forEach(function (td) {
                        var ee = kind(td.textContent), cs = getComputedStyle(td);
                        if (ee === 'wk') { t.wk++; if (cs.color === RED || cs.color === BLUE) t.bad.push([td.textContent, '평일이 칠해짐']); }
                        else if (!judge(t, ee, cs)) t.bad.push([td.textContent, ee, cs.color]);
                    });
                    tb.remove(); if (made) host.remove();
                    report(sc[0] + ' 범위 CSS (간접 확인)', t);
                });
            } catch (err) { ok('JIRA/Alarm/Notice CSS 실행', false, err.message); }
        } finally {
            // ── 되돌리기 ─────────────────────────────────────────────
            window.saveToGoogleDrive = saved.save; window.autoSaveCurrentSnapshot = saved.auto;
            window.dailyEnsureIdentity = saved.ensure; window.dailyLoadRoster = saved.roster; window.dailyLoadMonth = saved.month;
            window.dailyLoadDay = saved.day; window.dailyRosterSyncIfNotifier = saved.sync;
            window._dailyView = saved.dView; window._dailyTabDate = saved.dDate;
            window._psCollectFacts = saved.ps; if (window.projectMeta) window.projectMeta.aiPeriodSummary = saved.aiSum;
            window.wrState = saved.wrState; window.wrBaseDate = saved.wrBase;
            if (saved.cal && window.calState) Object.keys(saved.cal).forEach(function (k) { window.calState[k] = saved.cal[k]; });
            if (saved.gd) { globalData.length = 0; saved.gd.forEach(function (x) { globalData.push(x); }); }
            if (typeof colIdx !== 'undefined') colIdx.content = saved.contentCol;
            sumInputs.forEach(function (inp, i) { inp.value = sumBefore[i]; try { inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* 색만 */ } });
        }

        console.log(LOG.join('\n') + '\n\n' + (FAIL ? '❌' : '✅') + ' 통과 ' + OK + ' / 실패 ' + FAIL
            + '\n(끝나면 새로고침을 권한다 — 간트·입력칸을 합성값으로 바꿨다 되돌렸다)');
        return { ok: OK, fail: FAIL, log: LOG };
    };
    console.log('🎨 날짜 색 하네스 로드됨 — 새로고침 직후에 `await __dateColorTest()`');
})();
