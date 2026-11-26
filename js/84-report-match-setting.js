// 📅 보고 업무 기준 설정 (2026-11-26) — 일일보고·주간보고에 어떤 업무를 올릴지를 사람이 고른다.
//   사용자 요청: "시작일 업무 / 시작일이 포함된(기간이 걸친) 업무를 선택할 수 있도록 설정에 추가".
//   · 'start'   = 그 날/그 주에 **시작한** 업무만(기본 — 메일 업무는 시작일 = 메일 수신일).
//   · 'overlap' = 기간이 그 날/그 주에 **걸쳐 있으면** 든다(예전 동작 — 진행 중인 업무도 같이).
// ■ 값은 새로 만들지 않는다 — 이미 있는 정책 객체의 한 칸을 바꿀 뿐이다: 일일보고 `DAILY_SCAN.matchBy`(js/59) · 주간보고 `WR_POLICY.matchBy`(js/20).
//   판정 코드는 각자 그 자리에 그대로(두 벌로 두면 갈라진다). 여기는 **고르는 화면 + 저장 + 켤 때 적용**만 한다.
// ■ 저장은 이 PC 의 localStorage(`gantt_report_match_v1`) — 보고에 무엇을 올릴지는 사람마다 취향이라 팀 공용 파일로 안 올린다.
// ■ 메뉴 위치: ⚙️ 설정 ▸ 🗓️ 일정 (같은 구역에 🧹 밀린 업무 정리·🗓️ 휴일 등록).
(function () {
    'use strict';
    var KEY = 'gantt_report_match_v1';
    var T = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

    // 데이터 — 보고가 늘면 한 줄 추가(policy = 바꿀 정책 객체 이름, 기본값은 각 보고의 코드가 정한다)
    window.REPORT_MATCH_TARGETS = window.REPORT_MATCH_TARGETS || [
        { id: 'daily',  ko: '일일보고 — 후보 업무',  en: 'Daily report — candidates',  policy: 'DAILY_SCAN', refresh: function () { if (window._dailyRescan) window._dailyRescan(); } },
        { id: 'weekly', ko: '주간보고 — 이번주·다음주 업무', en: 'Weekly report — this/next week', policy: 'WR_POLICY',
          refresh: function () { var p = document.querySelector('.tab-panel.active'); if (p && p.id === 'tab-weekly' && window.showWeeklyReport) window.showWeeklyReport(); } }
    ];
    window.REPORT_MATCH_OPTIONS = window.REPORT_MATCH_OPTIONS || [
        { v: 'start',   ko: '시작일 업무',          en: 'Started in range',   hint: ['그 날(그 주)에 시작한 업무만', 'Only tasks that START in the day/week'] },
        { v: 'overlap', ko: '시작일이 포함된 업무',  en: 'Overlapping range',  hint: ['기간이 걸쳐 있는 진행 중 업무도 포함', 'Also tasks whose period spans the day/week'] }
    ];

    function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
    function valid(v) { return (window.REPORT_MATCH_OPTIONS || []).some(function (o) { return o.v === v; }); }
    function apply() {
        var saved = load();
        (window.REPORT_MATCH_TARGETS || []).forEach(function (t) {
            var pol = window[t.policy]; if (!pol || !valid(saved[t.id])) return;   // 저장한 적 없으면 코드의 기본값 그대로
            pol.matchBy = saved[t.id];
        });
    }
    function current(t) { var pol = window[t.policy]; return (pol && pol.matchBy) || 'start'; }

    window._rmSet = function (id, v) {
        var t = (window.REPORT_MATCH_TARGETS || []).filter(function (x) { return x.id === id; })[0];
        if (!t || !valid(v)) return;
        var saved = load(); saved[id] = v;
        try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* 저장 실패해도 이번 화면엔 적용 */ }
        if (window[t.policy]) window[t.policy].matchBy = v;
        try { t.refresh && t.refresh(); } catch (e) { /* 다시 그리기 실패가 설정을 막지는 않는다 */ }
        paint();
        if (window.showToast) window.showToast(T('적용했습니다', 'Applied'), 'success');
    };

    function paint() {
        var body = document.getElementById('rm-body'); if (!body) return;
        body.innerHTML =
            '<div style="font-size:12px; color:#555; line-height:1.5; margin-bottom:12px;">' + esc(T(
                '보고에 어떤 업무를 올릴지 고릅니다. 메일에서 들어온 업무는 시작일이 곧 메일 수신일입니다. 이 PC 에만 저장됩니다.',
                'Choose which tasks go into each report. For mail-derived tasks the start date is the mail received date. Saved on this PC only.')) + '</div>' +
            (window.REPORT_MATCH_TARGETS || []).map(function (t) {
                var cur = current(t);
                return '<div style="border:1px solid #dde3ea; border-radius:8px; padding:10px 12px; margin-bottom:10px;">' +
                    '<div style="font-weight:bold; font-size:13px; margin-bottom:6px;">' + esc(T(t.ko, t.en)) + '</div>' +
                    (window.REPORT_MATCH_OPTIONS || []).map(function (o) {
                        return '<label style="display:flex; align-items:flex-start; gap:8px; padding:4px 0; cursor:pointer;">' +
                            '<input type="radio" name="rm-' + t.id + '" ' + (cur === o.v ? 'checked ' : '') + 'onchange="window._rmSet(\'' + t.id + '\',\'' + o.v + '\')" style="margin-top:3px;">' +
                            '<span><b style="font-size:12.5px;">' + esc(T(o.ko, o.en)) + '</b><br><span style="font-size:11.5px; color:#777;">' + esc(T(o.hint[0], o.hint[1])) + '</span></span></label>';
                    }).join('') + '</div>';
            }).join('');
    }

    window.openReportMatchSetting = function () {
        var id = 'report-match-modal', m = document.getElementById(id);
        if (!m) {
            m = document.createElement('div');
            m.id = id;
            m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
            m.innerHTML =
                '<div id="rm-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:min(460px,94vw); max-height:88vh; display:flex; flex-direction:column; background:#fff; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.22); overflow:hidden;">' +
                  '<div id="rm-drag" style="flex-shrink:0; padding:13px 18px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; font-weight:bold; font-size:14px; display:flex; justify-content:space-between; align-items:center; cursor:grab;">' +
                    '<span>📅 <span id="rm-title"></span></span>' +
                    '<button onclick="document.getElementById(\'' + id + '\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); width:28px; height:28px; cursor:pointer; font-size:16px; line-height:1;">✕</button>' +
                  '</div>' +
                  '<div id="rm-body" style="flex:1; min-height:0; overflow-y:auto; padding:14px 18px;"></div>' +
                '</div>';
            document.body.appendChild(m);
            if (window._makeDraggable) window._makeDraggable('rm-box', 'rm-drag');
            if (window._bindClickToFront) window._bindClickToFront(id);
        }
        document.getElementById('rm-title').textContent = T('보고 업무 기준', 'Report task basis');
        m.style.display = 'flex';          // 닫을 땐 none 이므로 열 때마다 다시 켠다
        paint();
        if (window.bringModalToFront) window.bringModalToFront(id);
    };

    apply();   // 켤 때 저장값을 정책에 반영 — js/20·js/59 보다 뒤에 로드된다(그 파일들이 기본값을 만든 다음)
})();
