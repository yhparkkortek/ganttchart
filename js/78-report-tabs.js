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
// ■ 일부러 합치지 않은 것 (동작이 달라서 모양만 맞추면 의미가 바뀐다) — docs/ui-conventions.md "보고 페이지 헤더"
//    · 기간 고르기: 주간은 ◀ 이전/다음 ▶(한 주씩), 프로젝트 리뷰는 겹쳐 고르는 칩.
//    · 검색: 프로젝트 리뷰 `업무 검색` 은 화면 필터가 아니라 AI 요약 범위(캐시 열쇠)를 바꾸는 조건.
//    · 탭을 옮겨도 기간을 넘겨주지 않는다(주간의 기준 주 ↔ 리뷰의 칩은 서로 모른다).
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
        }
    }

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
        popup.innerHTML = VIEWS.map(function (key) {
            var active = key === cur;
            return '<div onclick="document.getElementById(\'rpt-view-dropdown-' + cur + '\').style.display=\'none\'; window.switchTab(\'' + key + '\');"'
                 + ' style="padding:7px 10px; cursor:pointer; border-radius:4px; font-size:12.5px; font-weight:bold; white-space:nowrap;'
                 + ' background:' + (active ? '#2c5f8a' : 'transparent') + '; color:' + (active ? '#fff' : '#333') + ';"'
                 + ' onmouseover="if(this.style.background!==\'rgb(44, 95, 138)\') this.style.background=\'#f1f3f5\';"'
                 + ' onmouseout="if(this.style.background!==\'rgb(44, 95, 138)\') this.style.background=\'transparent\';">'
                 + (window._pageTitle ? window._pageTitle(key, true) : key) + '</div>';
        }).join('');
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

    // js/23 `switchTab` 은 이름이 같은 사이드바 항목만 켠다 — 리뷰 항목은 숨겼으니 '보고/리뷰' 항목을 대신 켠다.
    if (typeof window.switchTab === 'function') {
        var _switch = window.switchTab;
        window.switchTab = function (tabName) {
            var r = _switch.apply(this, arguments);
            try { syncActive(); } catch (e) { /* 표시만 — 탭 전환을 막지 않는다 */ }
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
