// 📑 보고 페이지 묶기 — 주간 보고 + 프로젝트 리뷰를 **한 메뉴, 두 화면**으로 (2026-11-25, 합치기 2단계)
//
// 두 화면은 "기간을 고르고 프로젝트·담당자로 거르는 읽기 전용 보고 화면" 이다. 다른 점은 근거뿐 —
//   📋 주간 보고   = 간트 일정(계획: 이번 주·다음 주 업무와 문제점) — js/20
//   📑 프로젝트 리뷰 = 메일 분석 사실(실적: 실제로 있었던 일, 일·주·월·기간, AI 요약) — js/62
//
// ■ 화면 고르기는 **이 앱의 기존 방식 그대로** — 알람/공지(`#alarm-view-toggle`, js/23 `_toggleAlarmViewDropdown`)·
//    PARTS·Document 가 쓰는 "헤더 맨 앞 글자형 드롭다운"(`🔔 알람 ▾`: 15px 굵게·`#2c5f8a`·`.row-action-popup`).
//    그 마크업·스타일·팝업 항목 모양을 베꼈다 — **새 모양을 만들지 않는다**(처음엔 헤더 위에 전환 줄을 새로 만들었다가
//    "UI 를 마음대로 만들지 말고 통일화" 지적을 받아 걷어냈다).
//    알람/공지는 한 패널 안의 구역 둘이라 토글 요소를 옮겨 쓰지만, 여기는 **패널이 둘**이라 각 헤더에 자기 트리거를 두고
//    항목을 고르면 `switchTab` 을 부른다.
//
// ■ **패널(#tab-weekly · #tab-psummary)과 `switchTab('weekly'|'psummary')` 는 그대로** — 텔레그램 `/ai 주간 요약`·AI 문답
//    진입로·마지막 탭 복원·하네스가 전부 그 이름을 부른다. 바뀐 건 헤더 제목 자리(h2 → 드롭다운 트리거)와 사이드바뿐.
//    트리거 라벨은 `data-page-title` 을 달아 js/23 `_applyPageTitles` 가 한/영을 맡는다(알람처럼 따로 쓰지 않는다).
//
// ■ 사이드바는 알람/공지처럼 **두 화면 이름을 슬래시로 이은 한 항목**(`보고/리뷰`). `프로젝트 리뷰` 항목은 **숨기고**(없애지 않는다),
//    리뷰 화면이 열려 있어도 그 항목이 켜져 있다.
//
// ■ 기간·찾기를 **탭을 옮길 때 이어준다**(2026-11-25 "기간·검색 통합") — 새 화면 요소는 없고 기존 동작을 연결할 뿐이다.
//    · 찾기: 두 화면 다 **헤더 🔍 한 개**(공용 위젯 `_hdrFindWidget`, 화면만 거르는 찾기)라 같은 찾기어를 양쪽에 맞춘다.
//    · 기간: 주간의 ◀▶ 로 **옮긴 주** ↔ 리뷰의 `📅 기간설정`(시작~끝). 주간에서 다른 주로 옮겼다가 리뷰로 가면 그 주(월~일)가
//      기간설정으로 들어가고, 리뷰에서 기간설정을 해 두고 주간으로 오면 그 시작일이 든 주를 보여 준다.
//      ⚠️ 칩(어제·이번주·…)은 복수 선택이라 한 주로 못 줄이므로 **기간설정일 때만** 넘긴다. 마지막으로 맞춘 주(`_lastKey`)와
//      같으면 다시 덮지 않는다 — 안 그러면 리뷰에서 칩으로 바꾼 뒤 탭을 오갈 때마다 옛 기간으로 되돌아간다.
//
// ■ 일부러 합치지 않은 것 — docs/ui-conventions.md "보고 페이지 헤더"
//    · 기간 고르기 **모양**: 주간은 ◀ 이전/다음 ▶(한 주씩), 프로젝트 리뷰는 겹쳐 고르는 칩 — 동작이 달라 모양만 맞추면 의미가 바뀐다.
//    · 프로젝트 리뷰 표 위 `업무 검색`(#ps-q, Enter)은 화면 필터가 아니라 **AI 요약 범위(캐시 열쇠)를 바꾸는 조건**이라 헤더 🔍 와 다르다.
//
// ■ 숨기는 건 JS 가 한다 — 이 파일이 안 불려도 `프로젝트 리뷰` 사이드바 항목이 남아 길이 끊기지 않는다(fail-safe).
(function () {
    'use strict';

    var LABEL = { ko: '보고/리뷰', en: 'Report/Review' };
    var TIP = {
        ko: '주간 보고(계획) / 프로젝트 리뷰(실적) — 화면 위 제목을 눌러 오갑니다',
        en: 'Weekly Report (plan) / Project Review (actual) — click the title at the top to switch'
    };
    var VIEWS = ['weekly', 'psummary'];   // 드롭다운에 오르는 화면 — 이름·아이콘은 js/23 PAGE_TITLES 한 곳에서 읽는다

    function navItem(tab) { return document.querySelector('#sb-nav .sb-item[data-tab="' + tab + '"]'); }

    /** 사이드바: 리뷰 항목 숨김 + 주간 항목을 '보고/리뷰' 로. 언어가 바뀌면 다시(js/23 이 라벨을 덮어쓰므로). */
    function applyNav() {
        var en = window._currentLang === 'en';
        var ps = navItem('psummary'); if (ps) ps.style.display = 'none';
        var wk = navItem('weekly');
        if (wk) {
            var lab = wk.querySelector('.sb-label'); if (lab) lab.textContent = en ? LABEL.en : LABEL.ko;
            wk.title = en ? TIP.en : TIP.ko;
            // 🧭 [2026-11-26 사용자 요청 "다른 곳 갔다 와도 보던 정보"] 사이드바 '보고/리뷰' 는 **마지막으로 보던 화면**으로.
            //    예전엔 늘 주간 보고로 열려 리뷰를 보다 다녀오면 다시 골라야 했다. 코드가 부르는 switchTab('weekly') 은 그대로 주간 보고다.
            wk.setAttribute('onclick', 'window._reportOpenLast()');
        }
    }
    var LAST_KEY = 'gantt_report_view';
    window._reportOpenLast = function () {
        var v = 'weekly';
        try { v = localStorage.getItem(LAST_KEY) || 'weekly'; } catch (e) { /* 무시 */ }
        window.switchTab(VIEWS.indexOf(v) >= 0 ? v : 'weekly');
    };

    /** 프로젝트 리뷰가 열려 있으면 '보고/리뷰' 항목이 켜져 있어야 한다. */
    function syncActive() {
        var panel = document.getElementById('tab-psummary');
        var wk = navItem('weekly');
        if (wk && panel && panel.classList.contains('active')) wk.classList.add('active');
    }

    /**
     * 헤더 맨 앞 `📋 주간 보고 ▾` 를 눌렀을 때 — 알람/공지 `_toggleAlarmViewDropdown`(js/23)과 **같은 모양**의 팝업.
     * @param {string} cur 지금 이 헤더가 속한 화면(`weekly`|`psummary`) — 켜진 항목 표시용
     */
    window._toggleReportViewDropdown = function (ev, cur) {
        if (ev) ev.stopPropagation();
        var popup = document.getElementById('rpt-view-dropdown-' + cur);
        var btn = document.getElementById('rpt-view-trigger-' + cur);
        if (!popup || !btn) return;
        if (popup.style.display === 'block') { popup.style.display = 'none'; return; }
        // 🖱️ [2026-11-25] 항목을 끌어 순서 바꾸기 — js/19b 공용 헬퍼. 두 화면의 드롭다운이 **같은 순서**를 쓴다(저장 키 하나).
        popup.innerHTML = window._ddReorder.order('gantt_rptview_order_v1', VIEWS, function (k) { return k; }).map(function (key) {
            return window._ddReorder.itemHtml({ id: key, active: key === cur,
                onclick: "document.getElementById('rpt-view-dropdown-" + cur + "').style.display='none'; window.switchTab('" + key + "');",
                labelHtml: window._pageTitle ? window._pageTitle(key, true) : key });
        }).join('');
        window._ddReorder.init(popup, 'gantt_rptview_order_v1');
        var rect = btn.getBoundingClientRect();
        popup.style.left = rect.left + 'px';
        popup.style.top = (rect.bottom + 4) + 'px';
        popup.style.display = 'block';
        if (!window._rptDropdownListenerAdded) {
            window._rptDropdownListenerAdded = true;
            document.addEventListener('click', function (e) {
                VIEWS.forEach(function (k) {
                    var p = document.getElementById('rpt-view-dropdown-' + k), b = document.getElementById('rpt-view-trigger-' + k);
                    if (p && p.style.display === 'block' && !p.contains(e.target) && !(b && b.contains(e.target))) p.style.display = 'none';
                });
            });
        }
    };

    // ── 탭을 옮길 때 찾기어·기간 이어주기 ────────────────────────────────
    function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    /** 그 날이 든 주(월~일) — 주간 보고(js/20 wrGetWeekRange)·프로젝트 리뷰(P.weekStartsMonday)와 같은 월요일 시작. */
    function weekOf(base) {
        var d = new Date(base), diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
        var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff), sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
        return { from: ymd(mon), to: ymd(sun) };
    }
    var _lastKey = weekOf(new Date()).from;   // 마지막으로 두 화면이 맞춘 주(월요일 날짜) — 처음엔 이번 주

    /** 찾기어 — 두 화면 다 헤더 🔍 한 개. 값이 다르면 대상 입력칸에 넣고 input 이벤트를 쏜다(각 화면이 제 방식으로 다시 그린다). */
    function carrySearch(fromId, toId) {
        var a = document.getElementById(fromId), b = document.getElementById(toId);
        if (!a || !b || a.value === b.value) return;
        b.value = a.value; b.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function carryPeriod(from, to) {
        if (from === 'weekly' && to === 'psummary') {
            var base = window.wrBaseDate || new Date(), w = weekOf(base);
            if (w.from === weekOf(new Date()).from || w.from === _lastKey) return;      // 이번 주(기본)이거나 이미 맞춘 주면 리뷰의 자기 기간을 건드리지 않는다
            _lastKey = w.from;
            var P = window.PERIOD_SUMMARY || {};
            if (window._psSetMode && P.customId) window._psSetMode(P.customId);
            if (window._psSetFilter) window._psSetFilter({ from: w.from, to: w.to });  // 마지막이라 한 번만 다시 그린다
        } else if (from === 'psummary' && to === 'weekly') {
            var P2 = window.PERIOD_SUMMARY || {};
            if (!window._psMode || !window._psFilter || window._psMode() !== P2.customId) return;   // 칩(복수 선택)은 한 주로 못 줄인다
            var f = window._psFilter(); if (!f.from || !f.to) return;
            var k = weekOf(new Date(f.from + 'T00:00:00')).from;
            if (k === _lastKey) return;
            _lastKey = k;
            window.wrBaseDate = new Date(f.from + 'T00:00:00');
            if (window.showWeeklyReport) window.showWeeklyReport();
        }
    }
    function carry(prevTab, nextTab) {
        if (prevTab === nextTab || VIEWS.indexOf(prevTab) < 0 || VIEWS.indexOf(nextTab) < 0) return;
        if (nextTab === 'psummary') carrySearch('wr-search-input', 'ps-tbl-q'); else carrySearch('ps-tbl-q', 'wr-search-input');
        carryPeriod(prevTab, nextTab);
    }

    // js/23 `switchTab` 은 이름이 같은 사이드바 항목만 켠다 — 리뷰 항목은 숨겼으니 '보고/리뷰' 항목을 대신 켠다.
    if (typeof window.switchTab === 'function') {
        var _switch = window.switchTab;
        window.switchTab = function (tabName) {
            var act = document.querySelector('.tab-panel.active');
            var prevTab = act ? act.id.replace(/^tab-/, '') : '';
            var r = _switch.apply(this, arguments);
            try { if (VIEWS.indexOf(tabName) >= 0) localStorage.setItem(LAST_KEY, tabName); } catch (e) { /* 기억은 덤 */ }
            try { syncActive(); } catch (e) { /* 표시만 — 탭 전환을 막지 않는다 */ }
            try { carry(prevTab, tabName); } catch (e) { /* 이어주기는 덤 — 탭 전환을 막지 않는다 */ }
            return r;
        };
    }
    // js/23 `_applyPageTitles`(언어 전환 때도 불린다)가 사이드바 라벨을 되돌리므로 그 뒤에 다시 얹는다.
    if (typeof window._applyPageTitles === 'function') {
        var _titles = window._applyPageTitles;
        window._applyPageTitles = function () {
            var r = _titles.apply(this, arguments);
            try { applyNav(); } catch (e) { /* 라벨만 */ }
            return r;
        };
    }

    applyNav();
    syncActive();   // 마지막 탭 복원(js/23 이 먼저 돌아 이 파일보다 앞선다)이 리뷰였던 경우
})();
