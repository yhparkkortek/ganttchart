// ══════════════════════════════════════════════════════════════════════════════
// 📁 페이지별 NAS 자료실 — 엑셀 왕복이 없는 페이지에도 'NAS' 버튼을 붙인다
//
//  js/42(PAGE_EXCEL_SPECS)가 'NAS'를 다는 페이지는 **불러오기**가 목적이다 — 파일을 고르면
//  그 페이지로 들어온다. 여기 적는 페이지들은 되돌려 넣을 곳이 없다(캘린더·주간보고·알람은
//  전부 간트에서 계산되는 파생 뷰다). 그래서 **열기·올리기만 하는 탐색기**로 연다.
//
//  ⚠️ 같은 탭에 js/42가 이미 'NAS'를 달았으면 **달지 않는다** — 버튼이 두 개가 된다.
//     판정은 그 탭 안에 `#px-share-*` 가 있는지로(js/42가 붙이는 id).
//
//  ⚠️ 폴더 이름은 **NAS에 실제로 있는 철자 그대로**다. 'CALENDER'는 오타처럼 보이지만
//     사람이 그렇게 만들어 둔 폴더라 바꾸면 못 찾는다 — 고치려면 NAS 폴더부터 바꿀 것.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };

    // 페이지 → 자료실 폴더(데이터). 새 페이지는 여기 한 줄.
    //   anchor : 버튼을 끼울 자리. 없으면 그 탭의 인쇄 버튼 앞에 넣는다.
    window.PAGE_NAS_FOLDERS = [
        { tab: 'tab-calendar', folder: 'CALENDER',     label: ['캘린더', 'Calendar'] },
        { tab: 'tab-weekly',   folder: 'REPORT',       label: ['주간 업무 보고', 'Weekly report'] },
        // 알람 탭엔 인쇄 버튼이 없다 — 헤더 버튼 묶음 앞에 끼운다.
        { tab: 'tab-alarm',    folder: 'ALARM&NOTICE', label: ['알람·공지', 'Alarm & Notice'],
          anchor: '#alarm-header-box .btn-group' }
    ];

    var BTN = 'white-space:nowrap; padding:6px 12px; background:#e0f5f7; color:#00707d; border:none;'
            + ' border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s;'
            + ' margin-right:4px;';

    function _render() {
        (window.PAGE_NAS_FOLDERS || []).forEach(function (p) {
            var tabEl = document.getElementById(p.tab);
            if (!tabEl) return;
            // js/42가 이미 달았으면 그쪽이 맡는다(불러오기까지 되므로 그게 낫다).
            if (tabEl.querySelector('[id^="px-share-"]')) return;

            var id = 'pn-nas-' + p.tab;
            if (document.getElementById(id)) return;

            var at = p.anchor ? document.querySelector(p.anchor) : null;
            if (!at) {
                var all = tabEl.querySelectorAll('button[onclick*="printTabSection"]');
                at = all.length ? all[0] : null;
            }
            if (!at || !at.parentNode) return;

            var b = document.createElement('button');
            b.id = id;
            b.style.cssText = BTN;
            b.textContent = '📁 NAS';
            b.title = _t('이 페이지의 NAS 자료실을 엽니다 — 파일을 올리거나 열어 볼 수 있습니다.',
                         'Open this page\'s NAS folder — upload or open files.');
            b.onmouseover = function () { b.style.background = '#a3d9e0'; };
            b.onmouseout = function () { b.style.background = '#e0f5f7'; };
            b.onclick = function () {
                if (!window._dsOpenBrowser) {
                    if (window.showToast) window.showToast('⚠️ ' + _t('문서 저장소 기능을 불러오지 못했습니다.', 'The document store is not available.'), 'error');
                    return;
                }
                window._dsOpenBrowser(p.folder, {
                    // ⚠️ 모달 헤더에 📂 아이콘이 이미 붙어 있다(js/48 ds-pick-title) — 여기서 또
                    // 📁를 붙이면 "📂 📁 캘린더"처럼 아이콘이 중복된다(2026-10-26 사용자 지적).
                    title: Array.isArray(p.label) ? _t(p.label[0], p.label[1]) : p.label
                });
            };
            at.parentNode.insertBefore(b, at);
        });
    }

    window._pnRenderNasButtons = _render;
    // 탭은 나중에 그려지는 것도 있어서, 로드 후 한 번 + 클릭마다 다시 시도한다(js/42와 같은 방식).
    var boot = function () { try { _render(); } catch (e) { /* 버튼 실패가 페이지를 막지 않게 */ } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('button, a, [onclick]')) setTimeout(boot, 140);
    }, true);
})();
