// ════════════════════════════════════════════════════════════════════════════
// 🅿️ 페이지 모달 주차(park) — 다른 페이지로 가면 그 페이지에서 열어 둔 모달을 숨기고,
//    그 페이지로 돌아오면 다시 띄운다. (2026-11-26 사용자 요청)
//
//    처음엔 JIRA 만이었다("JIRA 에서 모달을 열어 두고 다른 페이지로 가면 계속 떠 있어 이상하다").
//    같은 날 "일일 업무 보고·캘린더·알림/공지… 비슷한 곳도" → 공용으로 옮겼다(js/70 에 있던 것).
//
//    규칙
//    - 대상은 **목록(`PAGE_PARK_MODALS`, 데이터)에 적힌 모달만** — 앱 전역 모달(AI 문답·메일 분석·
//      업무 보관함·설정 창들)은 어느 페이지에서나 쓰는 것이라 안 넣는다. 새 페이지 모달은 한 줄 추가.
//    - 어느 페이지 것인지는 **목록에 적지 않는다** — 떠나는 순간 보이던 모달이 그 페이지 것이다.
//      (지원 해상도 창처럼 Customer SPEC·Document 두 곳에서 여는 모달도 저절로 맞는다)
//    - **닫지 않고 숨긴다** — 클래스 하나(`.page-parked`, display:none !important)만 붙인다.
//      DOM·인라인 style 을 그대로 두므로 적던 글·검색어·스크롤·겹친 순서가 그대로 돌아온다.
//    - 숨겨 둔 사이 그 모달의 style 이 바뀌면(코드가 닫았거나, 다른 페이지에서 다시 열었으면)
//      **주차를 풀고 손을 뗀다** — 닫힌 건 돌아와도 안 열리고, 다시 연 건 지금 보인다.
//      (탭을 옮기고 나서 팝업을 닫는 코드가 있어도 되살아나지 않는다)
//    - 최소화한 모달(하단 칩)은 이미 안 보이므로 건드리지 않는다.
//    - ⚠️ 페이지 안에서만 기억한다 — 새로고침하면 안 열린다(앱을 켤 때 모달이 저절로 뜨면 더 이상하다).
// ════════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // 숨기고 다시 띄울 요소 id — **보였다 안 보였다 하는 바깥 요소**(display 가 바뀌는 그 요소)를 적는다.
    window.PAGE_PARK_MODALS = window.PAGE_PARK_MODALS || [
        // 🪐 JIRA
        'jira-search-modal', 'jira-link-modal', 'jira-issue-modal', 'jira-create-modal',
        // 📔 일일 업무 보고
        'daily-modal', 'daily-roster-modal',
        // 📅 캘린더
        'cal-day-popup-overlay', 'cal-sync-help-overlay',
        // 🔔 알람/공지
        'alarm-modal', 'alarm-schedule-modal', 'notice-modal',
        // 📋 주간 보고 · 프로젝트 리뷰
        'wr-pv-modal', 'ai-summary-modal',
        // 📒 Project list
        'pl-popup',
        // 📄 Document
        'docrevvs-overlay', 'doclabelart-overlay', 'doclabelcp-overlay', 'docopt-overlay',
        'doccie-overlay', 'docgw-overlay', 'docimp-overlay',
        // 🖥 지원 해상도(Customer SPEC·Document)
        'respick-overlay', 'resedid-overlay',
        // 🗂 PARTS
        'pc-add-modal', 'pc-spec-modal', 'ep-lightbox-modal', 'ep-add-modal', 'ep-pinmap-modal',
        'ep-spec-modal', 'pp-pick-modal',
        // 🧾 M.C Table · 📘 Summary
        'mc-imp-overlay', 'mnb-modal',
        // 📊 Gantt
        'gantt-organize-wizard-modal', 'wbs-group-suggest-modal',
        // 📊↔📄 페이지 엑셀 AI 매핑 · 📁 NAS 고르기(페이지 버튼에서 연다)
        'px-ai-overlay', 'ds-pick-modal'
    ];

    var CLS = 'page-parked';
    var _parked = {};      // 탭 이름 → [{ id, z }] (겹친 순서, 낮은 것부터)
    var _watch = {};       // id → MutationObserver (주차 중 style 이 바뀌는지)

    (function injectCss() {
        if (document.getElementById('page-parked-style')) return;
        var st = document.createElement('style');
        st.id = 'page-parked-style';
        st.textContent = '.' + CLS + '{display:none !important;}';
        (document.head || document.documentElement).appendChild(st);
    })();

    function shown(el) { return !!el && !el.classList.contains(CLS) && getComputedStyle(el).display !== 'none'; }

    // 주차를 풀고 감시도 끊는다(목록에서도 뺀다) — 다시 띄울 때·코드가 손댔을 때 공용
    function release(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove(CLS);
        if (_watch[id]) { _watch[id].disconnect(); delete _watch[id]; }
        Object.keys(_parked).forEach(function (t) {
            _parked[t] = _parked[t].filter(function (it) { return it.id !== id; });
        });
    }

    function park(tab) {
        var list = [];
        (window.PAGE_PARK_MODALS || []).forEach(function (id) {
            var el = document.getElementById(id);
            if (!shown(el)) return;
            list.push({ id: id, z: parseInt(getComputedStyle(el).zIndex, 10) || 0 });
        });
        if (!list.length) return;
        list.sort(function (a, b) { return a.z - b.z; });
        list.forEach(function (it) {
            var el = document.getElementById(it.id);
            el.classList.add(CLS);
            var before = el.getAttribute('style') || '';
            var mo = new MutationObserver(function () {
                // 주차 중 그 모달의 style 이 바뀌었다 = 코드가 닫았거나 다시 열었다 → 손을 뗀다
                if ((el.getAttribute('style') || '') !== before) release(it.id);
            });
            mo.observe(el, { attributes: true, attributeFilter: ['style'] });
            _watch[it.id] = mo;
        });
        _parked[tab] = (_parked[tab] || []).concat(list);
        // 표 머리글 ▾ 열 필터 상자(JIRA)는 body 에 떠 있어 모달과 같이 안 숨는다 — 혼자 남지 않게 닫는다
        var fb = document.getElementById('jira-colfilter-box');
        if (fb) fb.style.display = 'none';
    }

    function unpark(tab) {
        var list = (_parked[tab] || []).slice();
        delete _parked[tab];
        list.forEach(function (it) {
            release(it.id);
            if (window.bringModalToFront && shown(document.getElementById(it.id))) window.bringModalToFront(it.id);   // 원래 겹친 순서대로
        });
    }

    // 하네스·진단용 — { 탭: [id…] }
    window._pageParkedModals = function () {
        var o = {};
        Object.keys(_parked).forEach(function (t) { if (_parked[t].length) o[t] = _parked[t].map(function (it) { return it.id; }); });
        return o;
    };

    (function wrapSwitchTab() {
        var orig = window.switchTab;
        if (typeof orig !== 'function' || orig._pagePark) return;
        var wrapped = function (tabName) {
            var prev = document.querySelector('.tab-panel.active');
            var prevTab = prev ? prev.id.replace(/^tab-/, '') : null;
            if (prevTab && prevTab !== tabName) { try { park(prevTab); } catch (e) { /* 숨기기 실패가 탭 전환을 막으면 안 된다 */ } }
            var r = orig.apply(this, arguments);
            if (tabName && tabName !== prevTab) { try { unpark(tabName); } catch (e) { /* 위와 같다 */ } }
            return r;
        };
        wrapped._pagePark = true;
        window.switchTab = wrapped;
    })();
})();
