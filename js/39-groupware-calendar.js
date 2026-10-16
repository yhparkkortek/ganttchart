// ═══════════════════════════════════════════════════════════════════
// 🏢 [2026-10-16 신규] 그룹웨어(다우오피스) 일정을 Calendar 탭에 겹쳐 보여준다.
//
//  데이터 경로: 브라우저 세션 → 그룹웨어 내부 REST API → 백엔드(gw_bridge.py) → 여기
//   · DOM 스크래핑이 아니라 그룹웨어 자체 API의 JSON이라 화면 개편에 안 깨진다.
//   · 로그인은 **사람이 직접** 한다(자동 로그인 금지 — 실패가 쌓이면 CAPTCHA→계정 잠금).
//     세션이 끊기면 조용히 비우지 않고 "로그인 필요" 상태를 화면에 드러낸다.
//   · 읽기 전용. 그룹웨어에 아무것도 쓰지 않는다.
//
//  기존 캘린더(js/24)를 거의 건드리지 않는 설계:
//   · calRender가 만든 eventsByDay 맵에 `_gwMergeIntoCalendar()`로 끼워 넣기만 한다.
//   · 간트 업무는 **마감일 하루**에 찍히지만, 그룹웨어 일정은 실제 달력처럼
//     시작~종료 **모든 날**에 걸쳐 표시한다(회의·출장·전시회가 기간으로 보여야 맞음).
// ═══════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    var _t = function (ko, en) { return window._currentLang === 'en' ? en : ko; };

    // 🔀 [2026-10-16 사용자 요청] 겹쳐보기가 아니라 **전환**이다 — 간트 일정 ↔ 그룹웨어 일정.
    //    겹쳐 놨더니 하루 칩 상한(월간 10개)을 그룹웨어 일정이 선점해 내 간트 업무가
    //    통째로 잘려나갔다(실측: 그룹웨어 12건이면 간트 0건). 한 번에 하나만 보여주면
    //    자리 경쟁 자체가 없어지고, 무엇을 보고 있는지도 분명해진다.
    window._gwState = window._gwState || {
        mode: 'gantt',        // 'gantt' = 내 프로젝트 업무 | 'gw' = 그룹웨어 일정
        events: [],
        status: null,         // 마지막 /gw/status 결과
        loading: false,
        error: null,
        fetchedAt: 0
    };

    var GW_MODE_KEY = 'gantt_cal_source';
    try {
        var saved = localStorage.getItem(GW_MODE_KEY);
        if (saved === 'gw' || saved === 'gantt') window._gwState.mode = saved;
    } catch (e) {}

    var _ymd = function (d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
             + '-' + String(d.getDate()).padStart(2, '0');
    };

    // 캘린더가 지금 보여주는 범위보다 넉넉히 받아둔다(월 5개 보기/주 4개 보기 모두 커버)
    var _range = function () {
        var base = new Date(window.calState ? window.calState.year : new Date().getFullYear(),
                            window.calState ? window.calState.month : new Date().getMonth(), 1);
        var from = new Date(base); from.setMonth(from.getMonth() - 2);
        var to   = new Date(base); to.setMonth(to.getMonth() + 4);
        return { from: _ymd(from), to: _ymd(to) };
    };

    window._gwSetStatus = function (msg, kind) {
        var el = document.getElementById('gw-cal-status');
        if (!el) return;
        el.style.color = kind === 'error' ? '#b1432f' : (kind === 'busy' ? '#00707d' : '#888');
        el.textContent = msg || '';
    };

    window._gwCheckStatus = async function () {
        try {
            var r = await fetch('http://127.0.0.1:5000/gw/status');
            var d = await r.json();
            window._gwState.status = d;
            return d;
        } catch (e) {
            window._gwState.status = { ok: false, reason: 'backend', message: _t('백엔드에 연결할 수 없습니다.', 'Backend unreachable.') };
            return window._gwState.status;
        }
    };

    // 🔑 로그인 정보 등록 UI는 **AI 문답 창의 🔑**(js/36, SAP과 같은 자리)에 있다.
    //    여기서는 그 모달을 열어주기만 한다 — 설정 자리가 두 군데로 갈라지지 않게.
    window._gwSetupLogin = function () {
        if (window.openSapLoginSettings) window.openSapLoginSettings();
        else window._gwSetStatus(_t('AI 문답 창의 🔑에서 설정해주세요.', 'Use the 🔑 in the AI chat window.'), 'error');
    };

    // 저장된 계정으로 **1회만** 로그인. 실패하면 재시도하지 않고 사람에게 넘긴다.
    window._gwAutoLogin = async function () {
        window._gwSetStatus(_t('그룹웨어 로그인 시도 중…', 'Signing in to groupware…'), 'busy');
        try {
            var r = await fetch('http://127.0.0.1:5000/gw/login', { method: 'POST' });
            var d = await r.json();
            if (d.ok) {
                var em = (d.session && d.session.email) || '';
                window._gwSetStatus('✅ ' + (d.result === 'already'
                    ? _t('이미 로그인됨 ', 'Already signed in ') : _t('로그인됨 ', 'Signed in ')) + em, 'ok');
                window._gwLoadEvents(true);
                return;
            }
            if (d.result === 'not_configured') {
                window._gwSetStatus('🔑 ' + d.message, 'error');
                return;
            }
            // 실패 — 재시도하지 않고 창을 열어 사람에게 넘긴다
            window._gwSetStatus('🔒 ' + (d.message || ''), 'error');
            if (d.handoff) {
                await fetch('http://127.0.0.1:5000/gw/open', { method: 'POST' }).catch(function () {});
                alert('🔒 ' + d.message);
            }
        } catch (e) {
            window._gwSetStatus('⚠️ ' + (e && e.message ? e.message : String(e)), 'error');
        }
    };

    // 그룹웨어 브라우저 창 열기 — 로그인은 사람이 한다
    window._gwOpenBrowser = async function () {
        window._gwSetStatus(_t('그룹웨어 브라우저를 여는 중…', 'Opening groupware browser…'), 'busy');
        try {
            var r = await fetch('http://127.0.0.1:5000/gw/open', { method: 'POST' });
            var d = await r.json();
            if (!d.ok) { window._gwSetStatus('⚠️ ' + (d.message || ''), 'error'); return; }
            var s = d.session || {};
            if (s.ok) {
                window._gwSetStatus('✅ ' + _t('로그인됨: ', 'Signed in: ') + (s.email || ''), 'ok');
                window._gwLoadEvents(true);
            } else {
                window._gwSetStatus(_t('브라우저가 열렸습니다 — 창에서 직접 로그인해주세요(자동 로그인은 하지 않습니다).',
                                       'Browser opened — please sign in there yourself (no auto-login).'), 'busy');
            }
        } catch (e) {
            window._gwSetStatus('⚠️ ' + (e && e.message ? e.message : String(e)), 'error');
        }
    };

    window._gwLoadEvents = async function (force) {
        if (window._gwState.loading) return;
        // 2분 이내 재호출은 캐시 사용 — 탭을 오갈 때마다 브라우저를 때리지 않게
        if (!force && Date.now() - window._gwState.fetchedAt < 120000 && window._gwState.events.length) {
            if (window.calRender) window.calRender();
            return;
        }
        window._gwState.loading = true;
        window._gwState.error = null;
        window._gwSetStatus(_t('그룹웨어 일정을 불러오는 중…', 'Loading groupware events…'), 'busy');
        try {
            var rg = _range();
            var r = await fetch('http://127.0.0.1:5000/gw/events?from=' + rg.from + '&to=' + rg.to);
            var d = await r.json();
            if (!d.ok) {
                window._gwState.events = [];
                window._gwState.error = d.message || _t('불러오지 못했습니다.', 'Failed to load.');
                // 세션 문제인지 구분해서 안내 — 조용히 빈 화면으로 두지 않는다
                var st = await window._gwCheckStatus();
                if (st && !st.ok) {
                    window._gwSetStatus('🔒 ' + _t('그룹웨어 로그인이 필요합니다 — [로그인 창 열기]를 누르세요.',
                                                   'Groupware sign-in required — press [Open sign-in window].'), 'error');
                } else {
                    window._gwSetStatus('⚠️ ' + window._gwState.error, 'error');
                }
            } else {
                window._gwState.events = d.events || [];
                window._gwState.fetchedAt = Date.now();
                window._gwSetStatus('🏢 ' + _t('그룹웨어 일정 ', 'Groupware events ') + (d.count || 0)
                                    + _t('건', ''), 'ok');
            }
        } catch (e) {
            window._gwState.events = [];
            window._gwState.error = e && e.message ? e.message : String(e);
            window._gwSetStatus('⚠️ ' + window._gwState.error, 'error');
        } finally {
            window._gwState.loading = false;
            if (window.calRender) window.calRender();
        }
    };

    window._gwToggleOverlay = function () {
        window._gwState.mode = (window._gwState.mode === 'gw') ? 'gantt' : 'gw';
        try { localStorage.setItem(GW_MODE_KEY, window._gwState.mode); } catch (e) {}
        window._gwSyncToggleBtn();
        if (window._gwState.mode === 'gw') window._gwLoadEvents(false);
        else { window._gwSetStatus(''); if (window.calRender) window.calRender(); }
    };

    // 버튼에는 **지금 보고 있는 것**을 적고, 누르면 반대쪽으로 넘어간다고 알려준다.
    window._gwSyncToggleBtn = function () {
        var b = document.getElementById('gw-cal-toggle-btn');
        if (!b) return;
        var gw = window._gwState.mode === 'gw';
        b.style.background = gw ? '#5b3fa3' : '#e0f5f7';
        b.style.color = gw ? '#fff' : '#00707d';
        b.textContent = gw ? ('🏢 ' + _t('그룹웨어 일정', 'Groupware'))
                           : ('📊 ' + _t('Gantt 일정', 'Gantt'));
        b.setAttribute('aria-pressed', gw ? 'true' : 'false');
        b.title = gw
            ? _t('지금 그룹웨어 일정을 보는 중 — 누르면 Gantt 업무로 전환합니다',
                 'Showing groupware events — click to switch to Gantt tasks')
            : _t('지금 Gantt 업무를 보는 중 — 누르면 그룹웨어 일정으로 전환합니다 (읽기 전용, 로그인은 AI 문답 창의 🔑)',
                 'Showing Gantt tasks — click to switch to groupware events (read-only; sign in from the 🔑 in AI chat)');
    };

    // 간트 업무는 마감일 하루에만 찍히지만, 그룹웨어 일정은 기간 전체에 걸쳐 표시한다.
    var _spreadDays = function (ev) {
        var out = [];
        var s = new Date(ev.start), e = new Date(ev.end || ev.start);
        if (isNaN(s.getTime())) return out;
        if (isNaN(e.getTime())) e = new Date(s);
        // 종일 일정의 종료는 23:59:59.999라 날짜만 비교하면 된다
        var cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
        var end = new Date(e.getFullYear(), e.getMonth(), e.getDate());
        var guard = 0;
        while (cur <= end && guard++ < 400) {
            out.push(_ymd(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return out;
    };

    // js/24의 calRender가 eventsByDay(간트 업무)를 만든 직후 호출한다.
    //  · 간트 모드면 아무것도 하지 않는다 → 기존 캘린더 그대로.
    //  · 그룹웨어 모드면 간트 업무를 **치우고** 그룹웨어 일정으로 갈아끼운다(전환이므로).
    window._gwMergeIntoCalendar = function (eventsByDay) {
        if (window._gwState.mode !== 'gw') return;
        Object.keys(eventsByDay).forEach(function (k) { delete eventsByDay[k]; });
        if (!window._gwState.events.length) return;
        window._gwState.events.forEach(function (ev, i) {
            var label = ev.title || _t('(제목 없음)', '(untitled)');
            var timeTxt = '';
            if (!ev.allDay && ev.start) {
                var d = new Date(ev.start);
                if (!isNaN(d.getTime())) {
                    timeTxt = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' ';
                }
            }
            _spreadDays(ev).forEach(function (k) {
                (eventsByDay[k] = eventsByDay[k] || []).push({
                    _gw: true,
                    _gwIdx: i,
                    idx: -1000 - i,            // 간트 행 인덱스와 겹치지 않는 값
                    name: timeTxt + label,
                    start: new Date(ev.start).getTime(),
                    end: new Date(ev.end || ev.start).getTime(),
                    status: '', alarm: false, content: ev.description || '',
                    gwCalendar: ev.calendar || '', gwLocation: ev.location || '',
                    gwCreator: ev.creator || '', gwAllDay: !!ev.allDay
                });
            });
        });
    };

    // 그룹웨어 칩 클릭 — 간트 행 선택이 아니라 상세만 보여준다
    window._gwShowEvent = function (i) {
        var ev = window._gwState.events[i];
        if (!ev) return;
        var lines = [
            '🏢 ' + (ev.title || ''),
            (ev.calendar ? _t('캘린더: ', 'Calendar: ') + ev.calendar : ''),
            (ev.allDay ? _t('종일', 'All day')
                       : (ev.start || '').slice(0, 16).replace('T', ' ') + ' ~ ' + (ev.end || '').slice(0, 16).replace('T', ' ')),
            (ev.location ? _t('장소: ', 'Location: ') + ev.location : ''),
            (ev.creator ? _t('등록: ', 'By: ') + ev.creator : ''),
            (ev.description ? '\n' + ev.description : '')
        ].filter(Boolean).join('\n');
        if (window.showToast) window.showToast(lines.split('\n').slice(0, 3).join(' · '), 'info');
        alert(lines);
    };

    // Calendar 탭에 들어올 때 상태를 맞춘다(js/23의 switchTab에서 호출)
    window._gwOnCalendarTab = function () {
        window._gwSyncToggleBtn();
        if (window._gwState.mode === 'gw') window._gwLoadEvents(false);
    };

    // 첫 로드 때도 버튼이 저장된 on/off 상태로 보이게 한다 — switchTab을 거치지 않고
    // 바로 Calendar 탭이 복원되는 경우가 있어 여기서도 한 번 맞춘다.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { window._gwSyncToggleBtn(); });
    } else {
        setTimeout(function () { window._gwSyncToggleBtn(); }, 0);
    }
})();
