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
        // 📒 Project list — 들어올 때마다 다시 그리고, 첫 진입에선 Drive 최신본/NAS 문서 개수를 받아온다
        if (tabName === 'projectlist' && window.plOnTabShown) window.plOnTabShown();
        // Summary 탭은 Gantt chart Level 0 데이터와 연동된 타임라인을 매번 다시 그린다
        if (tabName === 'summary' && window.renderSummaryTimeline) window.renderSummaryTimeline();
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
        'TOUCH / GLASS': { icon: '🪟',                     nas: 'TOUCH GLASS' },
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
        // 자유추가 구분("앞으로 파생될 것들")도 올린다 — 주요자재에 적는 순간 화면이 생긴다.
        ((window.tabData && window.tabData.projectMaterials) || []).forEach(function(r) {
            const c = String((r && r.category) || '').trim();
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
            const icon = meta.icon || (vm && vm.icon) || '📄';
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
        const options = window._getElecDropdownOptions();
        const _ddEn = window._currentLang === 'en';
        popup.innerHTML = options.map(function(o) {
            const active = o.key === window._elecView;
            // 전용 도표가 아니라 공용 기본 항목을 쓰는 구분은 꼬리표를 붙인다 — 항목이
            // 그 부품에 맞춰 설계된 게 아니라는 걸 눌러본 뒤에 알게 되면 안 된다.
            //   ⚠️ 중첩 템플릿 리터럴을 쓰지 않는다(백틱 하나로 파일 전체가 죽는 사고 이력).
            const mark = !o.generic ? '' :
                '<span style="margin-left:6px; font-size:10px; font-weight:normal; opacity:.7;">'
                + (_ddEn ? 'basic' : '기본항목') + '</span>';
            return `<div onclick="window._switchElecView('${o.key}'); document.getElementById('elec-view-dropdown').style.display='none';"
                         style="padding:8px 10px; cursor:pointer; border-radius:4px; font-size:13px; font-weight:bold; white-space:nowrap;
                                background:${active ? '#2c5f8a' : 'transparent'}; color:${active ? '#fff' : '#333'};"
                         onmouseover="if(this.style.background!=='rgb(44, 95, 138)') this.style.background='#f1f3f5';"
                         onmouseout="if(this.style.background!=='rgb(44, 95, 138)') this.style.background='transparent';">${o.icon} ${o.label}${mark}</div>`;
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

    // 📄↔📊 [2026-10-22] 지금 보고 있는 뷰만 다시 그린다 — js/42 왕복 불러오기의 repaint 대상.
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
