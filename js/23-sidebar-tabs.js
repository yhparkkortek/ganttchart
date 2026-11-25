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
        // 🐛 [2026-09-08 버그수정] Customer SPEC/M.C Table 칸을 고칠 때마다 즉시 사유를 묻지 않고
        //    쌓아뒀다가 한 번에 묻는 방식(bsFlushChangeReasons/mcFlushChangeReasons — 22h/22i 참고)인데,
        //    M.C Table은 리비전/종류/비교화면 전환 시에만 이걸 불러서 "완전히 다른 탭으로 이동"하는
        //    가장 흔한 이탈 경로에서는 쌓인 변경사항이 사유 확인 없이 조용히 넘어갔다(Customer SPEC은
        //    애초에 이걸 부르는 곳이 하나도 없었음). 그 탭을 실제로 나갈 때만(같은 탭 재클릭 제외)
        //    호출 — 쌓인 게 없으면 각 함수 내부에서 조용히 리턴하므로 다른 탭 전환엔 영향 없음.
        const prevActive = document.querySelector('.tab-panel.active');
        const prevTab = prevActive ? prevActive.id.replace(/^tab-/, '') : null;
        if (prevTab === 'briefspec' && tabName !== 'briefspec' && window.bsFlushChangeReasons) window.bsFlushChangeReasons();
        if (prevTab === 'mctable' && tabName !== 'mctable' && window.mcFlushChangeReasons) window.mcFlushChangeReasons();

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
                // 🐛 [2026-09-13 버그수정] 페이지 로드 시 Gantt가 아닌 다른 탭이 복원돼 있으면(마지막으로
                //    보던 탭) renderTable()의 "최초 1회 오늘 스크롤"이 탭이 숨겨진 상태라 조용히 실패했을
                //    수 있다(js/04j-core-app-upload-utils-5.js의 scrollToTodayRow 참고) — 아직 한 번도
                //    성공한 적 없으면 지금(탭이 실제로 화면에 보이는 시점) 다시 시도한다. 이미 성공했으면
                //    (=사용자가 그 뒤 직접 스크롤했을 수 있음) 매번 다시 안 건드리도록 조건을 건다.
                if (!window._didInitialScrollToToday && window.scrollToTodayRow && window.scrollToTodayRow()) {
                    window._didInitialScrollToToday = true;
                }
            }, 0);
        }
        // Weekly Report 탭은 매번 최신 기준주로 다시 그린다
        if (tabName === 'weekly' && window.showWeeklyReport) window.showWeeklyReport();
        // 📔 Daily Report — 들어올 때마다 그 날짜의 팀 전체를 NAS 에서 다시 읽는다(목록 1콜 + 필요한 파일만)
        if (tabName === 'daily' && window.dailyOnTabShown) window.dailyOnTabShown();
        // 🗂 프로젝트 요약(js/62) — 들어올 때마다 다시 그린다(그 사이 간트·메일이 바뀌었을 수 있다)
        if (tabName === 'psummary' && window._psOnTabShown) window._psOnTabShown();
        // 📒 Project list — 들어올 때마다 다시 그리고, 첫 진입에선 Drive 최신본/NAS 문서 개수를 받아온다
        if (tabName === 'projectlist' && window.plOnTabShown) window.plOnTabShown();
        // 📄 Document — 들어올 때마다 다시 그린다(그 사이 Summary·자재·SPEC 이 바뀌었을 수 있다).
        //    ⚠️ 다시 안 그리면 **옛 자동값이 그대로 보인다** — 사람이 그걸 그대로 출력한다.
        if (tabName === 'document' && window._docOnTabShown) window._docOnTabShown();
        // 🪐 JIRA — 들어올 때마다 3가지 연결(수동키·검색어·메일캡처)을 다시 모아 그린다
        //    (메일 분석이 그 사이 쌓였을 수 있고, 설정도 바뀔 수 있다).
        if (tabName === 'jira' && window._jiraOnTabShown) window._jiraOnTabShown();
        // 💾 Project list 를 **떠날 때**는 3초 디바운스를 기다리지 말고 바로 Drive 에 올린다 —
        //    표를 고치자마자 다른 탭으로 넘어가 창을 닫으면 그 수정이 내 PC 에만 남기 때문.
        if (prevTab === 'projectlist' && tabName !== 'projectlist' && window.plFlushSave) window.plFlushSave();
        // Summary 탭은 Gantt chart Level 0 데이터와 연동된 타임라인을 매번 다시 그린다
        if (tabName === 'summary' && window.renderSummaryTimeline) window.renderSummaryTimeline();
        if (tabName === 'summary' && window._sumColorizeDates) window._sumColorizeDates();
        // Summary 탭 진입 시 필수 항목(고객사/모델명/KTK PN/담당자) 미입력 하이라이트 갱신
        if (tabName === 'summary' && window._checkAllRequiredFields) window._checkAllRequiredFields();
        // "적용 목적" 자동 높이 — 숨겨진 동안엔 scrollHeight가 0이라 계산이 안 되므로,
        // 탭이 실제로 보이는 지금 다시 잰다(js/22g의 _sumAutoGrowPurpose 주석 참고).
        if (tabName === 'summary' && window._sumAutoGrowPurpose) window._sumAutoGrowPurpose();
        // Calendar 탭은 매번 최신 Gantt 데이터로 다시 그린다
        if (tabName === 'calendar' && window.calRender) window.calRender();
        // BOM 탭은 진입할 때마다 현재 모델(제품구분자)의 저장된 BOM으로 다시 그린다
        //  — M.C Table에서 제품구분자를 바꾸고 넘어왔을 수 있으므로 매번 갱신해야 한다.
        if (tabName === 'bom') {
            if (window.bomFillLayoutOptions) window.bomFillLayoutOptions();
            if (window.bomRender) window.bomRender();
        }
        // Elec Parts 탭 진입 시 마지막으로 보던 서브뷰(PANEL/AD BD/CONV BD)를 복원해서 그린다.
        // PANEL 뷰는 Summary 주요자재(PANEL) 등록값 반영 + 최신 라이브러리 상태로 매번 다시 그려진다(_switchElecView 내부).
        if (tabName === 'elecparts') {
            let savedElecView = 'panel';
            try { savedElecView = localStorage.getItem('gantt_elec_view') || 'panel'; } catch(e) {}
            window._switchElecView(savedElecView);
        }
        // 🏢 Calendar 탭 진입 시 그룹웨어 일정 겹쳐보기 상태 동기화(js/39) — 켜져 있으면 다시 불러온다
        if (tabName === 'calendar' && window._gwOnCalendarTab) window._gwOnCalendarTab();
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
        // 🧲 붙은 넓은 모달 — 탭마다 페이지를 비킬지가 다르다(간트·프로젝트 목록은 안 비킴, js/19 MODAL_DOCK_SKIP_TABS)
        if (window._modalRefitDocked) window._modalRefitDocked();
        if (window._modalDockSync) window._modalDockSync();
    };

    // 💡 [2026-08-29 변경] Alarm/Notice 밑줄탭 2개 고정 대신, Elec Parts(🖥️ PANEL ▾)와 동일한
    //    "단일 트리거 + 드롭다운" 구성으로 통일 — window._toggleAlarmViewDropdown 참고.
    window.ALARM_VIEW_META = {
        alarm:  { label: 'Alarm',  ko: '알람', icon: '🔔' },
        notice: { label: 'Notice', ko: '공지', icon: '📢' },
    };
    window._alarmViewLabel = function(m) { return m ? ((window._currentLang === 'en' || !m.ko) ? m.label : m.ko) : ''; };

    // 🌐 [2026-11-25] 페이지 이름 한/영 — 사이드 메뉴와 각 페이지 헤더 제목이 **이 표 한 곳**을 읽는다.
    //    (예전엔 둘 다 영어로 박혀 있어 언어를 바꿔도 그대로였다.) 새 페이지는 여기 한 줄 + 사이드바
    //    `.sb-item[data-tab]` + 헤더 제목에 `data-page-title="<탭>"` 을 달면 따라온다.
    window.PAGE_TITLES = {
        projectlist: { icon: '📒', ko: '프로젝트 목록', en: 'Project list' },
        summary:     { icon: '📝', ko: '프로젝트 개요', en: 'Summary' },
        briefspec:   { icon: '📐', ko: '고객 사양',     en: 'Customer SPEC' },
        bom:         { icon: '🧱', ko: 'BOM',           en: 'BOM' },
        elecparts:   { icon: '⚡', ko: '주요부품',      en: 'PARTS' },
        mctable:     { icon: '💰', ko: '재료비(M.C)',   en: 'M.C Table' },
        document:    { icon: '📄', ko: '문서',          en: 'Document' },
        jira:        { icon: '🪐', ko: 'JIRA',          en: 'JIRA' },
        gantt:       { icon: '📊', ko: '간트차트',      en: 'Gantt chart' },
        calendar:    { icon: '📅', ko: '캘린더',        en: 'Calendar' },
        weekly:      { icon: '📋', ko: '주간 보고',     en: 'Weekly Report' },
        daily:       { icon: '📔', ko: '일일 보고',     en: 'Daily Report' },
        psummary:    { icon: '📑', ko: '프로젝트 리뷰', en: 'Project Review' },
        alarm:       { icon: '🔔', ko: '알람/공지',     en: 'Alarm/Notice' },
        address:     { icon: '🪪', ko: '주소록',        en: 'Address' },
    };
    window._pageTitle = function(tab, withIcon) {
        var m = window.PAGE_TITLES[tab]; if (!m) return '';
        var t = window._currentLang === 'en' ? m.en : m.ko;
        return withIcon ? m.icon + ' ' + t : t;
    };
    // 🌐 [2026-11-25] 모달 제목 한/영 — **한 번만 만들어 두고 다시 쓰는** 모달은 만들 때의 언어로
    //    제목이 굳는다(만든 뒤 언어를 바꾸면 그대로였다). 그런 모달의 **고정 제목**만 여기 적는다:
    //    열 때마다 다시 그리는 모달·건수나 이름이 들어가는 제목은 적지 말 것(덮어쓰면 그 내용이 사라진다).
    //    04j LANG.ui 에 이미 있는 id(ai-summary-title 등)는 거기서 바뀌므로 여기 다시 적지 않는다.
    window.MODAL_TITLES = {
        'holiday-modal-title': ['🗓️ 휴일 등록 (추가 휴일)', '🗓️ Holiday Registration'],
        'sap-pn-find-title':   ['KTK PN_모델명 찾기 — Project list → SAP', 'Find KTK PN_Model — Project list → SAP'],
        'npw-devplan-title':   ['그룹웨어에서 개발 계획 가져오기', 'Import development plan from Groupware'],
        'matcart-title':       ['자재 보관함', 'Material Cart'],
        'saplogin-title':      ['자동 로그인 설정', 'Auto-login settings'],
        'ds-cfg-title':        ['NAS 문서 저장소 설정', 'NAS document store settings'],
        'pp-pick-title':       ['사내 프로젝트 목록', 'In-house project list'],
        'ovc-title':           ['밀린 업무 정리', 'Overdue cleanup'],
        'jira-link-title':     ['JIRA 연결 설정', 'JIRA link settings'],
        'jira-create-title':   ['새 이슈', 'New issue'],
        'cp-modal-title':      ['컬러 팔레트', 'Color Palette'],
        'bc-title':            ['미분류 백로그 일괄 정리', 'Consolidate unclassified backlog'],
        'mnb-title':           ['KORTEK 모델명 만들기', 'Build a KORTEK model name'],
    };
    // 🌐 [2026-11-25] 글자 옆에 영어를 같이 적는 방식 — 맵에 id 를 따로 등록하지 않아도 된다.
    //    `data-en="영어"`(글자) · `data-en-html="영어 HTML"`(<b> 등 섞인 글) · `data-en-title` · `data-en-ph`(placeholder).
    //    한국어 원문은 처음 바꿀 때 `data-ko*` 에 보관해 되돌린다. ⚠️ data-en 은 **자식 요소 없는 칸**에만 —
    //    textContent 로 덮어서 안의 요소가 사라진다. 모달이 열릴 때(js/19 → 04j `_applyLangLight`)와 언어 버튼에서 돈다.
    window._applyInlineI18n = function(root) {
        var en = window._currentLang === 'en', r = root || document;
        r.querySelectorAll('[data-en]').forEach(function (el) {
            if (!el.hasAttribute('data-ko')) el.setAttribute('data-ko', el.textContent);
            var t = en ? el.getAttribute('data-en') : el.getAttribute('data-ko');
            if (el.textContent !== t) el.textContent = t;
        });
        r.querySelectorAll('[data-en-html]').forEach(function (el) {
            if (!el.hasAttribute('data-ko-html')) el.setAttribute('data-ko-html', el.innerHTML);
            var t = en ? el.getAttribute('data-en-html') : el.getAttribute('data-ko-html');
            if (el.innerHTML !== t) el.innerHTML = t;
        });
        [['data-en-title', 'data-ko-title', 'title'], ['data-en-ph', 'data-ko-ph', 'placeholder']].forEach(function (a) {
            r.querySelectorAll('[' + a[0] + ']').forEach(function (el) {
                if (!el.hasAttribute(a[1])) el.setAttribute(a[1], el.getAttribute(a[2]) || '');
                el.setAttribute(a[2], en ? el.getAttribute(a[0]) : el.getAttribute(a[1]));
            });
        });
    };
    window._applyPageTitles = function() {
        try { window._applyInlineI18n(); } catch (e) { /* 번역 실패가 화면을 막지 않게 */ }
        var _mEn = window._currentLang === 'en';
        Object.keys(window.MODAL_TITLES).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.textContent = window.MODAL_TITLES[id][_mEn ? 1 : 0];
        });
        document.querySelectorAll('#sb-nav .sb-item[data-tab]').forEach(function (el) {
            var lab = el.querySelector('.sb-label'), t = window._pageTitle(el.dataset.tab);
            if (lab && t) lab.textContent = t;
            if (t) el.title = t;   // 사이드바를 접었을 때 이름이 안 보이므로 말풍선으로
        });
        document.querySelectorAll('[data-page-title]').forEach(function (el) {
            var t = window._pageTitle(el.getAttribute('data-page-title'), true);
            if (t) el.textContent = t;
        });
        var al = document.getElementById('alarm-view-trigger-label');
        var am = window.ALARM_VIEW_META[window._alarmView || 'alarm'];
        if (al && am) al.textContent = am.icon + ' ' + window._alarmViewLabel(am);
    };
    window._applyPageTitles();
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
        if (label && meta) label.textContent = meta.icon + ' ' + window._alarmViewLabel(meta);
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
        // 🖱️ [2026-11-25] 항목을 끌어 순서 바꾸기 — js/19b 공용 헬퍼(Document 드롭다운·사이드바와 같은 방식). 순서는 이 PC 의 localStorage.
        const options = window._ddReorder.order('gantt_alarmview_order_v1',
            Object.keys(window.ALARM_VIEW_META).map(function(key) { return Object.assign({ key: key }, window.ALARM_VIEW_META[key]); }),
            function(o) { return o.key; });
        popup.innerHTML = options.map(function(o) {
            return window._ddReorder.itemHtml({ id: o.key, active: o.key === window._alarmView,
                onclick: "window._switchAlarmView('" + o.key + "'); document.getElementById('alarm-view-dropdown').style.display='none';",
                labelHtml: o.icon + ' ' + window._alarmViewLabel(o) });
        }).join('');
        window._ddReorder.init(popup, 'gantt_alarmview_order_v1');
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

    // ⚡ [2026-08-28 변경] PARTS 탭 부품 종류 선택 — 밑줄탭 3개 고정 대신 드롭다운으로 변경.
    // 🗂 [2026-10-22 확장] Summary "주요 자재" 구분을 **전부** 드롭다운에 올린다.
    //    예전엔 스펙표(도표)가 설계된 4개(PANEL/AD BD/CONV/TOUCH CTRL)만 나왔다 — 나머지 구분은
    //    화면이 없으니 NAS 폴더도 없고, 사양서·사진을 둘 곳이 아예 없었다. 이제 모든 구분이
    //    **AD BD와 같은 비교표 화면**을 갖는다 — 전용 도표가 없는 구분은 공용 기본 항목
    //    (`GENERIC_PART_SPEC_SCHEMA`, js/22d)으로 쓰고, 화면은 AD BD를 복제해 만든다(js/50).
    //
    //    ⚠️ 구분명·아이콘·NAS 폴더 이름은 **데이터**다 — 새 구분이 생기면 여기 한 줄만 추가한다.
    //      • `view` — **전용** 스펙 도표가 설계된 구분만 적는다. 비우면 공용 기본 항목을 쓴다.
    //      • `nas`  — NAS 하위 폴더 이름(PARTS/<이름>). 구분명에 Windows 폴더명으로 못 쓰는
    //                 글자(`/`)가 있어서 따로 적는다. 비워 두면 구분명에서 그 글자를 공백으로 바꾼다.
    //      • `nasFull` — 폴더 경로를 그대로 쓸 때(`PARTS/` 를 안 붙인다).
    //                 ⚠️ PANEL은 데이터시트 198개가 든 기존 폴더를 쓴다 — 2026-10-22에 사람이
    //                 루트 `PANEL\` 을 `PARTS\PANEL\` 안으로 옮겼다. `_dsFindPanelSpec`(js/48)·
    //                 `PP_FOLDER`(js/49)도 같은 경로를 본다. 한 곳만 고치면 조용히 0건이 된다.
    window.ELEC_CATEGORY_META = {
        'PANEL':         { icon: '🖥️', view: 'panel',     nasFull: 'PARTS/PANEL' },
        'SLIM/CUT':      { icon: '✂️',                     nas: 'SLIM CUT' },
        // 💡 [2026-11-17, 사용자 지시로 통합] 터치센서패널(TSP PCT)과 커버글래스(GLASS
        //    TEMP/CHEM/SEMI/NON)를 "구분하지 말고" 하나로 — 드롭다운 1개·NAS 폴더 1개·
        //    라이브러리 1개(js/22d TSP_GLASS_SPEC_SCHEMA). 어느 쪽인지는 Item Description에
        //    원본 SAP 내역이 그대로 남아 있어 구분 칸 없이도 사람이 읽을 수 있다. 폴더명에
        //    `/` 를 못 써서 `nas` 는 `TSP_GLASS`.
        'TSP/GLASS':     { icon: '🖐️', view: 'tspglass', nas: 'TSP_GLASS' },
        'TOUCH CTRL':    { icon: '👆', view: 'touchctrl',  nas: 'TOUCH CTRL' },
        'AD BOARD':      { icon: '🔲', view: 'adbd',       nas: 'AD BD' },
        'CONVERTER':     { icon: '🔌', view: 'convbd',     nas: 'CONV' },
        'BLU':           { icon: '💡',                     nas: 'BLU' },
        'POWER':         { icon: '🔋',                     nas: 'POWER' },
        'METAL':         { icon: '🔩',                     nas: 'METAL' },
        'MOLD':          { icon: '🧱',                     nas: 'MOLD' },
        'DIE CAST':      { icon: '⚙️',                     nas: 'DIE CAST' },
        'PACKING':       { icon: '📦',                     nas: 'PACKING' },
        'ETC':           { icon: '🗃️',                     nas: 'ETC' },
    };
    // 스펙 비교표가 있는 뷰의 표시 이름 — 비교표 코드(js/22d·22e·38)가 이 이름을 쓴다.
    window.ELEC_VIEW_META = {
        panel:     { label: 'PANEL', icon: '🖥️' },
        adbd:      { label: 'AD BD', icon: '🔲' },
        convbd:    { label: 'CONV',  icon: '🔌' },
        touchctrl: { label: 'TOUCH CTRL', icon: '👆' },
        tspglass:  { label: 'TSP/GLASS', icon: '🖐️' },
    };
    // 전용 도표가 없는 구분의 뷰 키 — localStorage에 남고 DOM id에도 들어가므로 영숫자만 남긴다.
    window._elecCatSlug = function(cat) {
        return 'cat_' + String(cat || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    };
    window._elecViewKeyOf = function(cat) {
        const meta = window.ELEC_CATEGORY_META[cat];
        if (meta && meta.view && window.ELEC_VIEW_META[meta.view]) return meta.view;
        return window._elecCatSlug(cat);
    };

    // Summary 주요자재 구분명 → 비교표 뷰 키. 위 카탈로그에서 **뽑아낸다** — 두 곳에 적으면 엇나간다.
    //   ⚠️ 전용 도표가 없는 구분까지 **전부** 담는다. js/22e `_epProjectModelParts`와 js/38
    //   `_elecBomItemCode`가 이 맵을 거꾸로 읽어 "이 비교표가 주요자재 어느 줄이냐"를 찾기
    //   때문이다 — 4개만 담으면 나머지 구분에서 📥 주요자재에서·BOM 자재번호가 조용히 빈다.
    //   사람이 나중에 넣은 구분은 `_getElecDropdownOptions()`가 돌 때 여기에 채워진다.
    window.ELEC_CATEGORY_TO_VIEW = (function() {
        const m = {};
        (window.MATERIAL_FIXED_CATEGORIES || Object.keys(window.ELEC_CATEGORY_META))
            .forEach(function(cat) { m[cat] = window._elecViewKeyOf(cat); });
        return m;
    })();

    // Summary 주요자재 순서대로 — 고정 13개 + 사람이 더 넣은 구분까지 **전부**.
    window._getElecDropdownOptions = function() {
        const cats = (window.MATERIAL_FIXED_CATEGORIES || Object.keys(window.ELEC_CATEGORY_META)).slice();
        // 옛 구분명(별칭) → 지금 고정 구분명. js/22c _MATERIAL_CATEGORY_ALIASES 역방향 —
        // 안 거치면 "TOUCH / GLASS"처럼 합쳐지기 전 이름이 저장된 프로젝트가 드롭다운에
        // 중복 항목("…기본항목")으로 또 뜬다(실사용 제보, 2026-11-17).
        const aliasToFixed = {};
        const aliasMap = window._MATERIAL_CATEGORY_ALIASES || {};
        Object.keys(aliasMap).forEach(function(fixed) {
            aliasMap[fixed].forEach(function(old) { aliasToFixed[old] = fixed; });
        });
        // 자유추가 구분("앞으로 파생될 것들")도 올린다 — 주요자재에 적는 순간 화면이 생긴다.
        ((window.tabData && window.tabData.projectMaterials) || []).forEach(function(r) {
            let c = String((r && r.category) || '').trim();
            if (aliasToFixed[c]) c = aliasToFixed[c];
            if (c && cats.indexOf(c) === -1) cats.push(c);
        });
        const seen = {};
        const out = [];
        cats.forEach(function(cat) {
            const key = window._elecViewKeyOf(cat);
            if (!key || key === 'cat_' || seen[key]) return;
            seen[key] = true;
            window.ELEC_CATEGORY_TO_VIEW[cat] = key;   // 역방향 조회를 최신으로(위 주석 참고)
            const meta = window.ELEC_CATEGORY_META[cat] || {};
            const vm = window.ELEC_VIEW_META[key];
            const icon = meta.icon || (vm && vm.icon) || '📜';
            const label = (vm && vm.label) || cat;
            // 전용 도표가 없는 구분은 공용 기본 항목으로 비교표를 쓸 수 있게 등록해 둔다(js/50).
            // 등록을 여기서 부르는 이유: 구분 목록을 아는 곳이 여기 하나라서다.
            if (!vm && window._pcpRegisterType) window._pcpRegisterType(key, cat, icon, label);
            const pt = (window.ELEC_PART_TYPES || {})[key];
            out.push({
                key: key, category: cat, icon: icon, label: label,
                // 비교표를 그릴 수 있는가 — PANEL은 전용 엔진, 나머지는 ELEC_PART_TYPES 등록 여부.
                hasSchema: !!(vm || pt),
                // 전용 항목이 아니라 **공용 기본 항목**을 쓰는 중이라는 표시(드롭다운 꼬리표).
                generic: !!(pt && pt.generic)
            });
        });
        return out;
    };
    window._elecOptionOf = function(view) {
        const opts = window._getElecDropdownOptions();
        for (let i = 0; i < opts.length; i++) if (opts[i].key === view) return opts[i];
        return null;
    };

    // 📁 NAS 폴더 — PARTS 아래에 구분별로 둔다(없으면 백엔드가 그 자리에서 만든다).
    //    ⚠️ 상위 이름은 **탭 이름(PARTS)과 같게** 둔다 — 사람이 탐색기에서 찾을 때 헷갈리지 않게.
    //    폴더명에 못 쓰는 글자는 목록으로 걸러낸다(정규식 안 백슬래시를 피한다).
    const _NAS_BAD_CHARS = '/:*?"<>|' + String.fromCharCode(92);
    const PARTS_NAS_ROOT = 'PARTS';   // 백엔드 화이트리스트(DOCSTORE_APP_FOLDERS)와 같은 이름
    window._elecNasFolder = function(view) {
        const opt = window._elecOptionOf(view || window._elecView);
        const meta = (opt && window.ELEC_CATEGORY_META[opt.category]) || {};
        if (meta.nasFull) return meta.nasFull;   // PARTS 아래가 아닌 폴더(PANEL 자료실)
        let sub = meta.nas || '';
        if (!sub) {
            sub = String((opt && opt.category) || '').split('').map(function(ch) {
                return _NAS_BAD_CHARS.indexOf(ch) === -1 ? ch : ' ';
            }).join('').replace(/ +/g, ' ').trim();
        }
        return sub ? (PARTS_NAS_ROOT + '/' + sub) : PARTS_NAS_ROOT;
    };
    // 파일 고르기 창의 탭 목록 — 구분을 창 안에서 바로 바꿀 수 있게 전부 넘긴다.
    window._elecNasFolders = function() {
        return window._getElecDropdownOptions().map(function(o) {
            return { f: window._elecNasFolder(o.key), label: o.icon + ' ' + o.label };
        });
    };
    window._toggleElecViewDropdown = function(ev) {
        if (ev) ev.stopPropagation();
        const popup = document.getElementById('elec-view-dropdown');
        const btn = document.getElementById('elec-view-trigger');
        if (!popup || !btn) return;
        if (popup.style.display === 'block') { popup.style.display = 'none'; return; }
        // 🖱️ [2026-11-25] 항목을 끌어 순서 바꾸기 — js/19b 공용 헬퍼. 순서는 이 PC 의 localStorage(구분이 새로 생기면 끝에 붙는다).
        const options = window._ddReorder.order('gantt_elecview_order_v1', window._getElecDropdownOptions(), function(o) { return o.key; });
        const _ddEn = window._currentLang === 'en';
        popup.innerHTML = options.map(function(o) {
            // 전용 도표가 아니라 공용 기본 항목을 쓰는 구분은 꼬리표를 붙인다 — 항목이
            // 그 부품에 맞춰 설계된 게 아니라는 걸 눌러본 뒤에 알게 되면 안 된다.
            //   ⚠️ 중첩 템플릿 리터럴을 쓰지 않는다(백틱 하나로 파일 전체가 죽는 사고 이력).
            const mark = !o.generic ? '' :
                '<span style="margin-left:6px; font-size:10px; font-weight:normal; opacity:.7;">'
                + (_ddEn ? 'basic' : '기본항목') + '</span>';
            return window._ddReorder.itemHtml({ id: o.key, active: o.key === window._elecView,
                onclick: "window._switchElecView('" + o.key + "'); document.getElementById('elec-view-dropdown').style.display='none';",
                labelHtml: o.icon + ' ' + o.label + mark });
        }).join('');
        window._ddReorder.init(popup, 'gantt_elecview_order_v1');
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
        // 💡 등록 안 된 뷰(옛 localStorage 값이 가리키는 구분이 사라진 경우 등)는 PANEL로 폴백
        let opt = window._elecOptionOf(view);
        if (!opt) { view = 'panel'; opt = window._elecOptionOf('panel') || { key: 'panel', category: 'PANEL', icon: '🖥️', label: 'PANEL', hasSchema: true }; }
        window._elecView = view;
        // 🗂 전용 도표가 없는 구분은 AD BD 화면을 복제해 만든다(js/50) — **숨기기 전에** 만들어야
        //    아래 querySelectorAll이 새 화면도 같이 집는다.
        if (window._pcpEnsureView) window._pcpEnsureView(view);
        // BOM 서브뷰는 _elecBomOpen/_elecBomClose가 제어 — SPEC 전환 시 항상 숨긴다
        const bomView = document.getElementById('elec-view-bom');
        if (bomView) bomView.style.display = 'none';
        // ⚠️ 화면 목록을 코드에 박지 않는다 — 구분이 런타임에 늘어난다(복제). 클래스로 집는다.
        document.querySelectorAll('.elec-spec-view').forEach(function(sec) {
            sec.style.display = (sec.id === 'elec-view-' + view) ? 'flex' : 'none'; // 💡 [2026-09-02] 'block'→'flex': CSS flex 레이아웃과 연동
        });
        // 헤더 버튼 묶음도 같은 이유로 선택자로 집는다(eh-<키>-btns · eh-bom-btns).
        document.querySelectorAll('[id^="eh-"][id$="-btns"]').forEach(function(sp) {
            sp.style.display = (sp.id === 'eh-' + view + '-btns') ? 'contents' : 'none';
        });
        const label = document.getElementById('elec-view-trigger-label');
        if (label) label.textContent = opt.icon + ' ' + opt.label;
        if (view === 'panel') {
            if (window.renderPanelCompareTab) window.renderPanelCompareTab();
        } else if ((window.ELEC_PART_TYPES || {})[view]) {
            if (window.renderElecCompareTab) window.renderElecCompareTab(view);
        }
        try { localStorage.setItem('gantt_elec_view', view); } catch(e) {}
        if (window._elecUpdateModeToggle) window._elecUpdateModeToggle('spec');
    };

    // 🎨 [2026-10-19] 색을 JS에서 직접 칠하지 않는다 — 활성 클래스만 토글하고 색은
    //    styles.css(.elec-mode-btn)와 팔레트 오버라이드(js/21 _cpApplyLive)가 정한다.
    //    예전엔 여기서 인라인 style로 #00707d를 박아서, 팔레트를 바꿔도 이 버튼만
    //    청록으로 남았다(인라인이 팔레트 CSS를 이긴다).
    window._elecUpdateModeToggle = function(mode) {
        var specBtn = document.getElementById('elec-mode-spec-btn');
        var bomBtn = document.getElementById('elec-mode-bom-btn');
        if (!specBtn || !bomBtn) return;
        var gw = (mode === 'bom');
        specBtn.classList.toggle('elec-mode-btn-active', !gw);
        bomBtn.classList.toggle('elec-mode-btn-active', gw);
    };
    window._elecModeSpec = function() { if (window._elecBomClose) window._elecBomClose(); };

    // 📜↔📊 [2026-10-22] 지금 보고 있는 뷰만 다시 그린다 — js/42 왕복 불러오기의 repaint 대상.
    //    `_switchElecView()`를 인자 없이 부르면 PANEL로 튕기므로(등록 안 된 뷰 폴백) 현재 뷰를 명시한다.
    window._elecRepaintCurrent = function() { window._switchElecView(window._elecView || 'panel'); };

    // 🖱️ [2026-10-26 신규] 사이드바 메뉴를 마우스로 끌어서 순서를 바꿀 수 있게 — 사용자 취향이라
    //    프로젝트 데이터(tabData)가 아니라 이 PC의 localStorage에 저장한다(접힘 상태와 같은 방식).
    var SB_ORDER_KEY = 'gantt_sidebar_order_v1';

    function _sbSaveOrder() {
        var order = Array.prototype.map.call(
            document.querySelectorAll('#sb-nav .sb-item[data-tab]'),
            function (el) { return el.dataset.tab; }
        );
        try { localStorage.setItem(SB_ORDER_KEY, JSON.stringify(order)); } catch (e) { /* ignore */ }
    }

    // 저장된 순서대로 재배치 — 저장 목록에 없는(새로 생긴) 탭은 원래 자리 순서 그대로 끝에 남는다.
    function _sbApplySavedOrder() {
        var nav = document.getElementById('sb-nav');
        if (!nav) return;
        var saved;
        try { saved = JSON.parse(localStorage.getItem(SB_ORDER_KEY) || 'null'); } catch (e) { saved = null; }
        if (!saved || !saved.length) return;
        var items = {};
        nav.querySelectorAll('.sb-item[data-tab]').forEach(function (el) { items[el.dataset.tab] = el; });
        saved.forEach(function (tab) {
            if (items[tab]) { nav.appendChild(items[tab]); delete items[tab]; }
        });
        Object.keys(items).forEach(function (tab) { nav.appendChild(items[tab]); });
    }

    // 끌기 자체 — 드래그 중인 항목을 마우스가 걸쳐진 항목의 위/아래로 바로 옮겨서, 놓을 때 이미
    // 제자리에 있게 한다(별도 미리보기 placeholder 없이 가장 단순한 방식).
    function _sbInitDragReorder() {
        var nav = document.getElementById('sb-nav');
        if (!nav) return;
        var dragEl = null;
        nav.querySelectorAll('.sb-item[data-tab]').forEach(function (el) {
            el.setAttribute('draggable', 'true');
            el.addEventListener('dragstart', function (e) {
                dragEl = el;
                el.classList.add('sb-dragging');
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', el.dataset.tab); } catch (err) { /* ignore */ }
            });
            el.addEventListener('dragend', function () {
                el.classList.remove('sb-dragging');
                dragEl = null;
                _sbSaveOrder();
            });
            el.addEventListener('dragover', function (e) {
                if (!dragEl || dragEl === el) return;
                e.preventDefault();
                var rect = el.getBoundingClientRect();
                var before = (e.clientY - rect.top) < rect.height / 2;
                nav.insertBefore(dragEl, before ? el : el.nextSibling);
            });
            el.addEventListener('drop', function (e) { e.preventDefault(); });
        });
    }

    // 🎨 [2026-11-25] Summary 마일스톤(계획·실적) 날짜 입력칸 글자색 — 일·공휴일=빨강, 토=파랑, 평일=회색(다른 페이지와 같은 규칙).
    //    값은 여러 곳(불러오기·달력 선택·마법사 등)에서 코드로 채워지므로 한 곳(_sumColorizeDates)에서 클래스만 다시 단다.
    window._sumColorizeDates = function () {
        var cls = ['date-day-hol', 'date-day-sat', 'date-day-wk'];
        document.querySelectorAll('#sum-milestone-body input[data-stage], #sum-milestone-body-actual input[data-stage]').forEach(function (inp) {
            cls.forEach(function (c) { inp.classList.remove(c); });
            var c = window._dateDayCls ? window._dateDayCls(inp.value) : '';
            if (c) inp.classList.add(c);
        });
    };
    ['input', 'change'].forEach(function (ev) {
        document.addEventListener(ev, function (e) {
            var t = e.target;
            if (t && t.matches && t.matches('#sum-milestone-body input[data-stage], #sum-milestone-body-actual input[data-stage]')) window._sumColorizeDates();
        }, true);
    });
    if (typeof window.populateTabData === 'function') {
        var _sumPopPrev = window.populateTabData;
        window.populateTabData = function () {
            var r = _sumPopPrev.apply(this, arguments);
            try { window._sumColorizeDates(); setTimeout(window._sumColorizeDates, 400); } catch (e) { /* 색만 — 저장·불러오기를 막지 않는다 */ }
            return r;
        };
    }

    // 새로고침해도 마지막 상태 복원
    try {
        _sbApplySavedOrder();
        _sbInitDragReorder();
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
