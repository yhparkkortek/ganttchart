// ══════════════════════════════════════════════════════
// 사이드바 접기/펴기 + 탭 전환 (신규)
// ══════════════════════════════════════════════════════
(function() {
    function applySidebarState(collapsed) {
        const sidebar = document.getElementById('app-sidebar');
        const main = document.getElementById('app-main');
        const btn = document.getElementById('sb-toggle-btn');
        if (!sidebar || !main) return;
        sidebar.classList.toggle('collapsed', collapsed);
        main.classList.toggle('sb-collapsed', collapsed);
        if (btn) btn.textContent = collapsed ? '☰' : '☰';
    }

    window.toggleSidebar = function() {
        const sidebar = document.getElementById('app-sidebar');
        const collapsed = !sidebar.classList.contains('collapsed');
        applySidebarState(collapsed);
        try { localStorage.setItem('gantt_sidebar_collapsed', collapsed ? '1' : '0'); } catch(e) {}
        // 💡 사이드바 폭이 바뀌면 Gantt 표의 sticky 컬럼 위치/차트 확장 폭이 어긋날 수 있으므로,
        //    transition이 끝난 뒤 기존 재계산 함수들을 호출해 정합성을 맞춘다.
        setTimeout(function() {
            if (window.updateStickyPositions) window.updateStickyPositions();
            window.dispatchEvent(new Event('resize'));
        }, 200);
    };

    window.switchTab = function(tabName) {
        document.querySelectorAll('.tab-panel').forEach(function(el) { el.classList.remove('active'); });
        document.querySelectorAll('#sb-nav .sb-item[data-tab]').forEach(function(el) { el.classList.remove('active'); });
        const panel = document.getElementById('tab-' + tabName);
        const navItem = document.querySelector('#sb-nav .sb-item[data-tab="' + tabName + '"]');
        if (panel) panel.classList.add('active');
        if (navItem) navItem.classList.add('active');
        try { localStorage.setItem('gantt_active_tab', tabName); } catch(e) {}
        // Gantt 탭으로 돌아올 때, 숨겨져 있던 동안 어긋났을 수 있는 sticky/차트 폭을 재계산
        if (tabName === 'gantt') {
            setTimeout(function() {
                if (window.updateStickyPositions) window.updateStickyPositions();
                window.dispatchEvent(new Event('resize'));
            }, 0);
        }
        // Weekly Report 탭은 매번 최신 기준주로 다시 그린다
        if (tabName === 'weekly' && window.showWeeklyReport) window.showWeeklyReport();
        // Summary 탭은 Gantt chart Level 0 데이터와 연동된 타임라인을 매번 다시 그린다
        if (tabName === 'summary' && window.renderSummaryTimeline) window.renderSummaryTimeline();
        // Summary 탭 진입 시 필수 항목(고객사/모델명/KTK PN/담당자) 미입력 하이라이트 갱신
        if (tabName === 'summary' && window._checkAllRequiredFields) window._checkAllRequiredFields();
        // Calendar 탭은 매번 최신 Gantt 데이터로 다시 그린다
        if (tabName === 'calendar' && window.calRender) window.calRender();
        // Elec Parts 탭 진입 시 마지막으로 보던 서브뷰(PANEL/AD BD/CONV BD)를 복원해서 그린다.
        // PANEL 뷰는 Summary 주요자재(PANEL) 등록값 반영 + 최신 라이브러리 상태로 매번 다시 그려진다(_switchElecView 내부).
        if (tabName === 'elecparts') {
            let savedElecView = 'panel';
            try { savedElecView = localStorage.getItem('gantt_elec_view') || 'panel'; } catch(e) {}
            window._switchElecView(savedElecView);
        }
        // Alarm/Notice 탭 진입 시 마지막으로 보던 뷰(알람/공지)를 복원해서 그린다
        if (tabName === 'alarm') {
            let savedView = 'alarm';
            try { savedView = localStorage.getItem('gantt_alarm_view') || 'alarm'; } catch(e) {}
            window._switchAlarmView(savedView);
        } else {
            // 다른 탭으로 이동하면 Notice 뷰가 화면에 남아있지 않도록 숨김
            const noticeSec = document.getElementById('tab-notice');
            if (noticeSec) noticeSec.style.display = 'none';
        }
    };

    // 💡 [2026-08-29 변경] Alarm/Notice 밑줄탭 2개 고정 대신, Elec Parts(🖥️ PANEL ▾)와 동일한
    //    "단일 트리거 + 드롭다운" 구성으로 통일 — window._toggleAlarmViewDropdown 참고.
    window.ALARM_VIEW_META = {
        alarm:  { label: 'Alarm',  icon: '🔔' },
        notice: { label: 'Notice', icon: '📢' },
    };
    window._alarmView = window._alarmView || 'alarm';
    window._switchAlarmView = function(view) {
        window._alarmView = view;
        const alarmSec  = document.getElementById('alarm-view-alarm');
        const noticeSec = document.getElementById('tab-notice');
        if (alarmSec)  alarmSec.style.display  = view === 'alarm'  ? 'flex' : 'none'; // 💡 [2026-09-02] flex 레이아웃 뷰포트 채우기 대응
        if (noticeSec) noticeSec.style.display = view === 'notice' ? 'flex' : 'none'; // 💡 [2026-09-02 수정] tab-alarm 내부 flex 자식이 됐으므로 block→flex
        // 💡 [멀티시트 UI 통일] 알람/공지 토글을 지금 보이는 뷰의 헤더박스 맨 앞으로 옮겨서,
        //    두 뷰 모두 "토글 | 상태·설명  ...버튼들" 한 줄짜리 통합 헤더로 보이게 함
        const toggleEl = document.getElementById('alarm-view-toggle');
        const targetBox = document.getElementById(view === 'alarm' ? 'alarm-header-box' : 'notice-header-box');
        if (toggleEl && targetBox && targetBox.firstElementChild !== toggleEl) targetBox.insertBefore(toggleEl, targetBox.firstChild);
        const meta = window.ALARM_VIEW_META[view];
        const label = document.getElementById('alarm-view-trigger-label');
        if (label && meta) label.textContent = meta.icon + ' ' + meta.label;
        if (view === 'alarm'  && window.renderAlarmTab)  window.renderAlarmTab();
        if (view === 'notice' && window.renderNoticeTab) window.renderNoticeTab();
        try { localStorage.setItem('gantt_alarm_view', view); } catch(e) {}
    };
    window._toggleAlarmViewDropdown = function(ev) {
        if (ev) ev.stopPropagation();
        const popup = document.getElementById('alarm-view-dropdown');
        const btn = document.getElementById('alarm-view-trigger');
        if (!popup || !btn) return;
        if (popup.style.display === 'block') { popup.style.display = 'none'; return; }
        const options = Object.keys(window.ALARM_VIEW_META).map(function(key) { return Object.assign({ key: key }, window.ALARM_VIEW_META[key]); });
        popup.innerHTML = options.map(function(o) {
            const active = o.key === window._alarmView;
            return `<div onclick="window._switchAlarmView('${o.key}'); document.getElementById('alarm-view-dropdown').style.display='none';"
                         style="padding:8px 10px; cursor:pointer; border-radius:4px; font-size:13px; font-weight:bold; white-space:nowrap;
                                background:${active ? '#2c5f8a' : 'transparent'}; color:${active ? '#fff' : '#333'};"
                         onmouseover="if(this.style.background!=='rgb(44, 95, 138)') this.style.background='#f1f3f5';"
                         onmouseout="if(this.style.background!=='rgb(44, 95, 138)') this.style.background='transparent';">${o.icon} ${o.label}</div>`;
        }).join('');
        const rect = btn.getBoundingClientRect();
        popup.style.left = rect.left + 'px';
        popup.style.top = (rect.bottom + 4) + 'px';
        popup.style.display = 'block';
        if (!window._alarmDropdownListenerAdded) {
            window._alarmDropdownListenerAdded = true;
            document.addEventListener('click', function(e) {
                const p = document.getElementById('alarm-view-dropdown');
                const b = document.getElementById('alarm-view-trigger');
                if (p && p.style.display === 'block' && !p.contains(e.target) && e.target !== b && !(b && b.contains(e.target))) {
                    p.style.display = 'none';
                }
            });
        }
    };

    // ⚡ [2026-08-28 변경] Elec Parts 탭 부품 종류 선택 — 밑줄탭 3개 고정 대신 드롭다운으로 변경.
    //    Summary "주요 자재"의 고정 13개 구분(MATERIAL_FIXED_CATEGORIES) 순서를 그대로 훑되, 그 중
    //    실제로 스펙표(스키마)가 등록된 것만 드롭다운에 나타난다 — 지금은 PANEL/AD BOARD/CONVERTER
    //    3개뿐(= Summary 주요자재에서 🔎 버튼이 뜨는 것과 정확히 같은 기준). 나머지 10개는 각자의
    //    스펙표 정의(도표 설계)를 나중에 만들어서 아래 ELEC_CATEGORY_TO_VIEW에 한 줄만 추가하면
    //    자동으로 드롭다운에 나타난다 — HTML/드롭다운 코드는 손댈 필요 없음.
    window.ELEC_VIEW_META = {
        panel:  { label: 'PANEL', icon: '🖥️' },
        adbd:   { label: 'AD BD', icon: '🔲' },
        convbd: { label: 'CONV',  icon: '🔌' },
    };
    // Summary 주요자재 구분명 → Elec Parts 뷰 키. 아직 스펙표가 없는 구분(SLIM/CUT, TOUCH / GLASS,
    // TOUCH CTRL, BLU, POWER, METAL, MOLD, DIE CAST, PACKING, ETC)은 의도적으로 비워둠.
    window.ELEC_CATEGORY_TO_VIEW = {
        'PANEL': 'panel',
        'AD BOARD': 'adbd',
        'CONVERTER': 'convbd',
    };
    // Summary 순서 기준으로, 실제 등록된(=ELEC_VIEW_META에 있는) 뷰만 걸러서 드롭다운 옵션 목록 생성
    window._getElecDropdownOptions = function() {
        const cats = window.MATERIAL_FIXED_CATEGORIES || Object.keys(window.ELEC_CATEGORY_TO_VIEW);
        const seen = {};
        const out = [];
        cats.forEach(function(cat) {
            const key = window.ELEC_CATEGORY_TO_VIEW[cat];
            if (!key || seen[key] || !window.ELEC_VIEW_META[key]) return;
            seen[key] = true;
            out.push(Object.assign({ key: key }, window.ELEC_VIEW_META[key]));
        });
        return out;
    };
    window._toggleElecViewDropdown = function(ev) {
        if (ev) ev.stopPropagation();
        const popup = document.getElementById('elec-view-dropdown');
        const btn = document.getElementById('elec-view-trigger');
        if (!popup || !btn) return;
        if (popup.style.display === 'block') { popup.style.display = 'none'; return; }
        const options = window._getElecDropdownOptions();
        popup.innerHTML = options.map(function(o) {
            const active = o.key === window._elecView;
            return `<div onclick="window._switchElecView('${o.key}'); document.getElementById('elec-view-dropdown').style.display='none';"
                         style="padding:8px 10px; cursor:pointer; border-radius:4px; font-size:13px; font-weight:bold; white-space:nowrap;
                                background:${active ? '#2c5f8a' : 'transparent'}; color:${active ? '#fff' : '#333'};"
                         onmouseover="if(this.style.background!=='rgb(44, 95, 138)') this.style.background='#f1f3f5';"
                         onmouseout="if(this.style.background!=='rgb(44, 95, 138)') this.style.background='transparent';">${o.icon} ${o.label}</div>`;
        }).join('');
        const rect = btn.getBoundingClientRect();
        popup.style.left = rect.left + 'px';
        popup.style.top = (rect.bottom + 4) + 'px';
        popup.style.display = 'block';
        if (!window._elecDropdownListenerAdded) {
            window._elecDropdownListenerAdded = true;
            document.addEventListener('click', function(e) {
                const p = document.getElementById('elec-view-dropdown');
                const b = document.getElementById('elec-view-trigger');
                if (p && p.style.display === 'block' && !p.contains(e.target) && e.target !== b && !(b && b.contains(e.target))) {
                    p.style.display = 'none';
                }
            });
        }
    };

    window._elecView = window._elecView || 'panel';
    // 💡 [2026-08-26] PANEL(구 Panel Compare)이 이 탭으로 들어오면서 3-way가 됨 — 콘텐츠는 뷰별로
    //    하나씩(panel/adbd/convbd) 있지만, 헤더의 액션 버튼 묶음은 뷰마다 구성이 달라(대상 함수가 다름)
    //    eh-panel-btns/eh-convbd-btns 두 묶음만 display:contents ↔ none으로 토글한다(AD BD는 버튼 없음).
    window._switchElecView = function(view) {
        // 💡 등록 안 된 뷰(예: 옛 localStorage 값이 가리키는 뷰가 사라졌거나 아직 없는 경우)는 PANEL로 폴백
        if (!window.ELEC_VIEW_META[view]) view = 'panel';
        window._elecView = view;
        const sections = { panel: 'elec-view-panel', adbd: 'elec-view-adbd', convbd: 'elec-view-convbd' };
        Object.keys(sections).forEach(function(v) {
            const sec = document.getElementById(sections[v]);
            if (sec) sec.style.display = (v === view) ? 'flex' : 'none'; // 💡 [2026-09-02] 'block'→'flex': CSS flex 레이아웃과 연동
        });
        const meta = window.ELEC_VIEW_META[view];
        const label = document.getElementById('elec-view-trigger-label');
        if (label && meta) label.textContent = meta.icon + ' ' + meta.label;
        const panelBtns = document.getElementById('eh-panel-btns');
        const adbdBtns = document.getElementById('eh-adbd-btns');
        const convbdBtns = document.getElementById('eh-convbd-btns');
        if (panelBtns) panelBtns.style.display = (view === 'panel') ? 'contents' : 'none';
        if (adbdBtns) adbdBtns.style.display = (view === 'adbd') ? 'contents' : 'none';
        if (convbdBtns) convbdBtns.style.display = (view === 'convbd') ? 'contents' : 'none';
        if (view === 'panel' && window.renderPanelCompareTab) window.renderPanelCompareTab();
        if (view === 'adbd' && window.renderElecCompareTab) window.renderElecCompareTab('adbd');
        if (view === 'convbd' && window.renderElecCompareTab) window.renderElecCompareTab('convbd');
        try { localStorage.setItem('gantt_elec_view', view); } catch(e) {}
    };

    // 새로고침해도 마지막 상태 복원
    try {
        if (localStorage.getItem('gantt_sidebar_collapsed') === '1') applySidebarState(true);
        let lastTab = localStorage.getItem('gantt_active_tab');
        if (lastTab === 'notice') { lastTab = 'alarm'; try { localStorage.setItem('gantt_alarm_view', 'notice'); } catch(e) {} }
        // 💡 [2026-08-26] Panel Compare가 최상위 탭에서 Elec Parts > PANEL 서브탭으로 이동하면서, 예전에
        //    저장된 "마지막 탭=panelcompare" 값이 있는 사용자가 새로고침해도 조용히 기본 Gantt 탭으로
        //    떨어지지 않도록 Elec Parts의 PANEL 뷰로 이어준다(Notice→Alarm 이관과 동일한 패턴).
        if (lastTab === 'panelcompare') { lastTab = 'elecparts'; try { localStorage.setItem('gantt_elec_view', 'panel'); } catch(e) {} }
        if (lastTab && document.getElementById('tab-' + lastTab)) window.switchTab(lastTab);
    } catch(e) {}
})();
