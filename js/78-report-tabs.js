// 📑 보고 페이지 묶기 — 주간 보고 + 프로젝트 리뷰를 **한 메뉴, 두 탭**으로 (2026-11-25, 합치기 2단계)
//
// 두 화면은 "기간을 고르고 프로젝트·담당자로 거르는 읽기 전용 보고 화면" 이다. 다른 점은 근거뿐 —
//   📋 주간 보고   = 간트 일정(계획: 이번 주·다음 주 업무와 문제점) — js/20
//   📑 프로젝트 리뷰 = 메일 분석 사실(실적: 실제로 있었던 일, 일·주·월·기간, AI 요약) — js/62
//
// ■ 어떻게 묶었나 — **패널(#tab-weekly · #tab-psummary)과 `switchTab('weekly'|'psummary')` 는 그대로** 둔다.
//    텔레그램 `/ai 주간 요약`·AI 문답 진입로·마지막 탭 복원·하네스가 전부 그 이름을 부르므로, 고치면 조용히 어긋난다.
//    묶는 건 **내비게이션 층뿐**이다:
//    ① 두 패널의 **헤더 위** 한 줄(`.rpt-tabs`)에 `[📋 주간 보고 | 📑 프로젝트 리뷰]` 전환 버튼(HTML, 캘린더 월/주와 같은 모양).
//       버튼에 `data-page-title` 을 달아 두어 한/영 전환은 js/23 `_applyPageTitles` 가 그대로 맡는다. 두 패널의 헤더에서 제목(h2)은 뺐다 — 이 줄이 제목이다.
//       ⚠️ 처음엔 헤더 **안**(제목 자리)에 넣었다가 주간 보고 헤더가 1366px·1280px 에서 **두 줄(67px)** 이 돼서 뺐다 — 그 헤더는 이미 꽉 차 있다(실측: 원래 h2 91px 로 간신히 맞았다).
//    ② 사이드바는 한 항목 — `프로젝트 리뷰` 항목은 **숨기고**(없애지 않는다), `주간 보고` 항목을 `보고` 로.
//       프로젝트 리뷰 화면이 열려 있어도 그 항목이 켜져 있다.
//
// ■ 일부러 합치지 않은 것 (동작이 달라서 모양만 맞추면 의미가 바뀐다) — docs/ui-conventions.md "보고 페이지 헤더"
//    · 기간 고르기: 주간은 ◀ 이전/다음 ▶(한 주씩), 프로젝트 리뷰는 겹쳐 고르는 칩.
//    · 검색: 프로젝트 리뷰 `업무 검색` 은 화면 필터가 아니라 AI 요약 범위(캐시 열쇠)를 바꾸는 조건.
//    · 탭을 옮겨도 기간을 넘겨주지 않는다(주간의 기준 주 ↔ 리뷰의 칩은 서로 모른다).
//
// ■ 숨기는 건 JS 가 한다 — 이 파일이 안 불려도 `프로젝트 리뷰` 사이드바 항목이 남아 길이 끊기지 않는다(fail-safe).
(function () {
    'use strict';

    var LABEL = { ko: '보고', en: 'Reports' };
    var TIP = {
        ko: '주간 보고(계획) · 프로젝트 리뷰(실적) — 화면 위의 버튼으로 오갑니다',
        en: 'Weekly Report (plan) · Project Review (actual) — switch with the buttons at the top'
    };

    function navItem(tab) { return document.querySelector('#sb-nav .sb-item[data-tab="' + tab + '"]'); }

    /** 사이드바: 리뷰 항목 숨김 + 주간 항목을 '보고' 로. 언어가 바뀌면 다시(js/23 이 라벨을 덮어쓰므로). */
    function applyNav() {
        var en = window._currentLang === 'en';
        var ps = navItem('psummary'); if (ps) ps.style.display = 'none';
        var wk = navItem('weekly');
        if (wk) {
            var lab = wk.querySelector('.sb-label'); if (lab) lab.textContent = en ? LABEL.en : LABEL.ko;
            wk.title = en ? TIP.en : TIP.ko;
        }
    }

    /** 프로젝트 리뷰가 열려 있으면 '보고' 항목이 켜져 있어야 한다. */
    function syncActive() {
        var panel = document.getElementById('tab-psummary');
        var wk = navItem('weekly');
        if (wk && panel && panel.classList.contains('active')) wk.classList.add('active');
    }

    // js/23 `switchTab` 은 이름이 같은 사이드바 항목만 켠다 — 리뷰 항목은 숨겼으니 '보고' 항목을 대신 켠다.
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
