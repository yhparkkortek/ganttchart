// ═══════════════════════════════════════════════════════════════════
// 🖨️ 브라우저 인쇄 전환 + 🏢 그룹웨어 건수 숨김 — 검증 하네스 (2026-11-05)
//
//   앱(kortek_pm.html)을 띄운 **브라우저 콘솔에 통째로 붙여넣는다.**
//   AI 키·그룹웨어·SAP 없이 돈다. 가짜는 **바깥 경계에만**(fetch 와 _gwEnsureLogin 둘뿐),
//   안쪽은 진짜 코드가 돈다.
//
//   왜 이 파일이 있나 — 2026-11-05 에 각 페이지의 "🖨️ 인쇄 (PDF)" 버튼 11개를 전부 없애고
//   브라우저 인쇄(Ctrl+P)로 돌렸다. 그 버튼은 단순한 버튼이 아니라 **세 가지의 기준점**이었다:
//     ① js/42 의 📊 엑셀 버튼이 붙는 자리(anchor)
//     ② js/53 의 📁 NAS 버튼이 붙는 자리
//     ③ 인쇄 사본을 만드는 유일한 입구(없으면 인쇄 CSS 가 전부 숨겨 **백지**가 나온다)
//   그래서 "버튼이 사라졌다"만 보고 끝내면 ①②③ 이 조용히 깨진 걸 놓친다.
//   ⚠️ 인쇄 **대화상자**는 자동으로 못 띄운다 — 여기서는 브라우저가 인쇄 직전에 보내는
//      `beforeprint` 를 그대로 쏘아 **앱이 무엇을 준비하는지**를 본다(그게 연결부다).
//
//   돌연변이로 확인한 것(일부러 깨뜨리면 해당 항목이 실제로 실패한다):
//     · js/04f 의 beforeprint 리스너 제거        → [C] 전부 실패
//     · _preparePrintGantt 의 _ganttHydrateAll 제거 → [D] 실패(자리표시가 사본에 섞인다)
//     · _clearPrintingModeClasses 의 notice 줄 제거 → [E] 실패
//     · js/42 의 append 폴백 제거                → [B] 실패
//     · js/39 의 건수 숨김 되돌리기              → [F] 실패
// ═══════════════════════════════════════════════════════════════════
(async function () {
    'use strict';
    var pass = 0, fail = 0, lines = [];
    function ok(name, cond, extra) {
        if (cond) { pass++; lines.push('  ✅ ' + name); }
        else { fail++; lines.push('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
    }
    function head(t) { lines.push('\n── ' + t); }
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    var TABS = ['gantt', 'summary', 'briefspec', 'mctable', 'address', 'projectlist',
                'calendar', 'weekly', 'daily', 'bom', 'elecparts', 'alarm'];

    // ─────────────────────────────────────────────────────────────
    head('[A] 인쇄(PDF) 버튼이 한 개도 남아 있지 않다');
    var leftovers = document.querySelectorAll('button[onclick*="printTabSection"], #print-btn, #pl-btn-print');
    ok('onclick/id 로 남은 인쇄 버튼 0개', leftovers.length === 0, leftovers.length);
    var byText = [].filter.call(document.querySelectorAll('button'), function (b) { return /인쇄\s*\(PDF\)/.test(b.textContent); });
    ok('글자로 남은 인쇄 버튼 0개', byText.length === 0, byText.map(function (b) { return b.textContent.trim(); }));
    ok('간트 툴바 앵커(#gantt-toolbar-end)가 있다', !!document.getElementById('gantt-toolbar-end'));

    // ─────────────────────────────────────────────────────────────
    head('[B] 인쇄 버튼 자리에 붙던 📊 엑셀 · 📁 NAS 버튼이 그대로 있다');
    // 그 버튼들이 "인쇄 버튼 앞"을 앵커로 삼고 있었다 — 버튼을 지우면 **여기가 먼저 조용히 깨진다**.
    var EXPECT = {               // 탭 → 그 탭에 있어야 하는 버튼 묶음 id 조각
        gantt:     ['px-btns-gantt'],
        summary:   ['px-btns-summary'],
        briefspec: ['px-btns-briefspec'],
        mctable:   ['px-btns-mctable'],
        address:   ['px-btns-address'],
        elecparts: ['px-btns-elecparts'],
        calendar:  ['pn-nas-tab-calendar'],
        weekly:    ['pn-nas-tab-weekly'],
        alarm:     ['px-btns-alarm', 'pn-nas-tab-alarm']
    };
    for (var t in EXPECT) {
        window.switchTab(t);
        await sleep(220);
        try { window._pxRenderButtons && window._pxRenderButtons(); } catch (e) {}
        try { window._pnRenderNasButtons && window._pnRenderNasButtons(); } catch (e) {}
        await sleep(120);
        var tabEl = document.getElementById('tab-' + t);
        EXPECT[t].forEach(function (id) {
            var el = tabEl && tabEl.querySelector('#' + id);
            ok(t + ' → #' + id + ' 가 화면에 있다', !!el && el.getBoundingClientRect().width > 0);
        });
    }

    // ─────────────────────────────────────────────────────────────
    head('[C] beforeprint 하나로 모든 탭이 인쇄 사본을 만든다 (백지 방지)');
    // 인쇄 CSS(styles.css 11절)는 printing-mode 일 때 사본 말고 전부 숨긴다 —
    // 사본을 못 만들면 **백지**다. 그래서 "클래스가 붙었나 + 사본에 내용이 있나" 둘 다 본다.
    for (var i = 0; i < TABS.length; i++) {
        var tab = TABS[i];
        window._clearPrintingModeClasses();
        window.switchTab(tab);
        await sleep(280);
        window.dispatchEvent(new Event('beforeprint'));
        await sleep(80);
        var cls = [].filter.call(document.body.classList, function (c) { return /printing/.test(c); });
        var ga = document.getElementById('gantt-print-area');
        var pa = document.getElementById('tab-print-area');
        var chars = (ga ? ga.innerHTML.length : 0) + (pa ? pa.innerHTML.length : 0);
        ok(tab + ' → printing-mode 클래스가 붙는다', cls.length > 0, cls);
        ok(tab + ' → 인쇄 사본이 비어 있지 않다', chars > 300, chars);
        window._clearPrintingModeClasses();
    }
    // Notice 는 tab-alarm 안에 있고 `.concept-tab-wrap` 이 없다 — 예전엔 여기서 백지가 나왔다.
    window.switchTab('alarm');
    if (window._switchAlarmView) window._switchAlarmView('notice');
    await sleep(300);
    window.dispatchEvent(new Event('beforeprint'));
    await sleep(80);
    ok('alarm(Notice 뷰) → 인쇄 사본이 비어 있지 않다',
       document.getElementById('tab-print-area').innerHTML.length > 300);
    ok('alarm(Notice 뷰) → printing-tab-notice 가 붙는다',
       document.body.classList.contains('printing-tab-notice'));

    // ─────────────────────────────────────────────────────────────
    head('[E] 인쇄 뒤 printing-mode 클래스가 **전부** 지워진다');
    // ⚠️ printing-tab-notice 가 목록에서 빠져 있어 한 번 공지를 인쇄하면 그 클래스가 남고,
    //    그 뒤 다른 탭 인쇄에 공지용 레이아웃(A4 세로·40행)이 얹히던 버그가 있었다.
    window._clearPrintingModeClasses();
    var stuck = [].filter.call(document.body.classList, function (c) { return /printing/.test(c); });
    ok('정리 후 남은 printing-* 클래스 0개', stuck.length === 0, stuck);
    if (window._switchAlarmView) window._switchAlarmView('alarm');
    window.switchTab('calendar');
    await sleep(300);
    window.dispatchEvent(new Event('beforeprint'));
    await sleep(80);
    ok('공지 인쇄 다음의 캘린더 인쇄에 공지 클래스가 안 묻는다',
       !document.body.classList.contains('printing-tab-notice'),
       [].slice.call(document.body.classList).filter(function (c) { return /printing/.test(c); }));
    window._clearPrintingModeClasses();

    // ─────────────────────────────────────────────────────────────
    head('[D] 간트 — 스크롤 가상화 자리표시가 사본에 섞이지 않는다');
    // 화면 밖 행은 높이만 가진 빈 <tr data-lazy> 다(js/04j). 복제 **전에** 채우지 않으면
    // 종이에 빈 줄이 찍힌다 — 눈으로만 보면 절대 못 잡는다.
    window.switchTab('gantt');
    await sleep(400);
    var tbody = document.querySelector('#myTable tbody');
    var screenRows = tbody ? tbody.children.length : 0;
    if (screenRows < 5) {
        // ⚠️ 빈 앱에선 건너뛴다 — 그러면 이 항목은 **검증된 게 아니다**. 프로젝트를 열고 다시 돌릴 것.
        //    급하면 콘솔에서 행을 심어도 된다(⚠️ renderTable() 만으로는 안 그려진다 — recalculateSchedules()):
        //      for(let i=0;i<150;i++){const r=new Array(globalData[0]?globalData[0].length:12).fill('');
        //        r._level=1; r[1]='테스트 '+(i+1); globalData.push(r);} recalculateSchedules();
        lines.push('  ⏭  행이 ' + screenRows + '개뿐 — 프로젝트를 열고 다시 돌릴 것(이 항목은 **검증 안 됨**)');
    } else {
        var lazyOnScreen = tbody.querySelectorAll('[data-lazy]').length;
        window._clearPrintingModeClasses();
        window.dispatchEvent(new Event('beforeprint'));
        await sleep(200);
        var area = document.getElementById('gantt-print-area');
        var cloned = area.querySelectorAll('tbody tr');
        var emptyCloned = [].filter.call(cloned, function (tr) { return !tr.textContent.trim(); }).length;
        ok('사본 행 수 = 화면 행 수 (' + screenRows + ')', cloned.length === screenRows, cloned.length);
        ok('사본에 data-lazy 자리표시 0개 (화면엔 ' + lazyOnScreen + '개)',
           area.querySelectorAll('[data-lazy]').length === 0);
        ok('사본에 빈 행 0개', emptyCloned === 0, emptyCloned);
        window._clearPrintingModeClasses();
    }

    // ─────────────────────────────────────────────────────────────
    head('[F] 🏢 그룹웨어 — 성공 건수는 숨기고, 실패는 그대로 보여준다');
    window.switchTab('calendar');
    await sleep(350);
    // ⚠️ [2026-11-06] 계약이 바뀌었다 — 버튼 **왼쪽 안내 스팬(#gw-cal-status)을 없앴다**
    //    (nowrap 이라 긴 문구가 툴바를 밀어 머리말이 깨졌다). 성공이든 실패든 머리말엔
    //    아무것도 안 그리고, **사유는 토글 버튼 말풍선**에 싣는다. 그래서 이 절은
    //    "스팬이 없다 + 말풍선이 말한다" 로 검사한다.
    var statusEl = document.getElementById('gw-cal-status');
    var toggleBtn = document.getElementById('gw-cal-toggle-btn');
    ok('버튼 왼쪽 안내 스팬이 없다 (#gw-cal-status)', statusEl === null, statusEl && statusEl.outerHTML);
    if (!toggleBtn || !window._gwLoadEvents) {
        lines.push('  ⏭  Calendar 의 그룹웨어 UI 를 못 찾음 — 건너뜀');
    } else {
        var realFetch = window.fetch, realLogin = window._gwEnsureLogin, realMode = window._gwState.mode;
        window._gwEnsureLogin = async function () { return { ok: true }; };

        // ① 성공 40건 — 머리말엔 아무 말도 없어야 하고, 건수는 버튼 말풍선에 있어야 한다
        window.fetch = async function (u) {
            if (String(u).indexOf('/gw/events') !== -1) {
                return { json: async function () {
                    var evs = []; for (var k = 0; k < 40; k++) evs.push({ id: k, title: '회의' + k, start: '2026-11-10', end: '2026-11-10' });
                    return { ok: true, count: 40, events: evs };
                } };
            }
            return realFetch.apply(window, arguments);
        };
        window._gwState.mode = 'gw'; window._gwState.fetchedAt = 0; window._gwState.loading = false;
        await window._gwLoadEvents(true);
        await sleep(150);
        ok('성공 시 안내가 비어 있다', (window._gwState.statusMsg || '') === '', window._gwState.statusMsg);
        ok('건수(40)는 버튼 말풍선에 남아 있다', /40/.test(toggleBtn.title), toggleBtn.title);
        ok('성공 시 말풍선에 ⚠️·🔒 같은 사유가 안 붙는다', !/⚠️|🔒/.test(toggleBtn.title), toggleBtn.title);

        // ② 실패 — 조용히 삼키면 "일정 없음"과 구분이 안 된다
        window.fetch = async function (u) {
            if (String(u).indexOf('/gw/events') !== -1) return { json: async function () { return { ok: false, message: '세션 만료' }; } };
            if (String(u).indexOf('/gw/status') !== -1) return { json: async function () { return { ok: false }; } };
            return realFetch.apply(window, arguments);
        };
        window._gwState.fetchedAt = 0; window._gwState.loading = false;
        await window._gwLoadEvents(true);
        await sleep(150);
        // 실패를 지우면 "일정 없음"과 구분이 안 된다 — 자리만 옮겼지 없애지 않았음을 확인한다.
        ok('실패 시 사유가 남아 있다', (window._gwState.statusMsg || '').trim().length > 0, window._gwState.statusMsg);
        ok('실패 사유가 버튼 말풍선에 실린다', toggleBtn.title.indexOf(window._gwState.statusMsg) === 0, toggleBtn.title);
        ok('실패 말풍선에도 전환 안내가 같이 있다', /누르면|click/i.test(toggleBtn.title), toggleBtn.title);

        window.fetch = realFetch; window._gwEnsureLogin = realLogin; window._gwState.mode = realMode;
    }

    window._clearPrintingModeClasses();
    window.switchTab('gantt');

    console.log(lines.join('\n'));
    console.log('\n══════════ ' + pass + ' / ' + (pass + fail) + ' 통과'
                + (fail ? '  ❌ 실패 ' + fail + '건' : '  ✅ 전부 통과') + ' ══════════');
})();
