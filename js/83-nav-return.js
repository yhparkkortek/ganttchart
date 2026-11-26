// ↩ 돌아가기 — **연 자리로** 되돌아오는 공용 길 (2026-11-26)
//    사용자 요청: "메일 원문을 보고 이전으로 돌아가는 기능이 없다 / 다른 곳도 찾아봐줘" → "연 자리로 돌아가기"(원문을 연 화면이 앞으로 오고 목록 위치가 복원).
//
// ■ 무엇을 기억하나(`capture`) — 누른 그 순간의 **탭 · 겹쳐 떠 있던 창(바깥 fixed 요소) · 누른 줄 · 스크롤 위치들**.
//   누른 요소는 `window.event.target`(인라인 onclick 에서 동기로 부르면 늘 있다), 없으면 `document.activeElement`.
// ■ 돌아가기(`restore`) — 탭이 바뀌었으면 그 탭으로 · 열어 둔 창이 있으면 앞으로(`bringModalToFront`) · 스크롤을 되돌리고 · 누른 줄을 화면 가운데로 가져와 **깜빡여 어디였는지** 보여 준다.
// ■ 쓰는 곳 — ① 메일 원문 창의 [← 돌아가기](js/14c) ② 다른 탭으로 **이동시키는** 링크가 남기는 떠 있는 칩 `↩ 돌아가기`(`chip`) — `_aiJumpToRow`(AI 문답·AI 요약·리뷰의 #G 링크, js/08)·`_wowJumpToRow`(js/04e).
//   새로 "다른 화면으로 보내는" 기능을 만들면 이동 **전에** `ctx = _nav.capture()` 를 하고 이동 뒤에 `_nav.chip(ctx)` 를 부를 것(탭이 안 바뀌었으면 칩이 필요 없다).
(function () {
    'use strict';
    var T = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

    function activeTab() { var p = document.querySelector('.tab-panel.active'); return p ? p.id.replace(/^tab-/, '') : ''; }
    function tabLabel(name) {
        var n = name && document.querySelector('#sb-nav .sb-item[data-tab="' + name + '"]');
        return n ? n.textContent.replace(/\s+/g, ' ').trim() : (name || '');
    }
    /** 바깥에서부터 가장 먼저 만나는 fixed + id 요소 — 겹쳐 떠 있는 창의 바깥 요소(bringModalToFront 가 받는 그 id). */
    function outerFixed(el) {
        var found = null;
        for (var p = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
            if (p.id && getComputedStyle(p).position === 'fixed') found = p;
        }
        return found;
    }

    function capture() {
        var ev = window.event, el = (ev && ev.target && ev.target.nodeType === 1) ? ev.target : document.activeElement;
        if (el === document.body || el === document.documentElement) el = null;
        var ctx = { tab: activeTab(), at: Date.now(), row: null, rowId: '', modalId: '', scrolls: [], scrollY: window.scrollY || 0, label: '' };
        if (el) {
            var m = outerFixed(el);
            if (m) {
                ctx.modalId = m.id;
                var hd = m.querySelector('[id$="-drag"]');
                ctx.label = hd ? hd.textContent.replace(/\s+/g, ' ').trim().replace(/[✕×]\s*$/, '').trim().slice(0, 28) : '';
            }
            ctx.row = el.closest('tr, [data-daily-item], li, [id^="ps-"]') || el;
            ctx.rowId = ctx.row.id || '';
            for (var p = el.parentElement; p; p = p.parentElement) { if (p.scrollTop > 0) ctx.scrolls.push([p, p.scrollTop]); }
        }
        if (!ctx.label) ctx.label = tabLabel(ctx.tab);
        return ctx;
    }

    function flash(el) {
        if (!el || !el.style) return;
        var prev = [el.style.transition, el.style.boxShadow];
        el.style.transition = 'box-shadow .3s';
        el.style.boxShadow = 'inset 0 0 0 3px #f08c00';
        setTimeout(function () { el.style.boxShadow = prev[1]; el.style.transition = prev[0]; }, 1600);
    }

    /** 연 자리로. 되돌릴 게 있었으면 true. */
    function restore(ctx) {
        if (!ctx) return false;
        var did = false;
        if (ctx.tab && activeTab() !== ctx.tab && typeof window.switchTab === 'function') { window.switchTab(ctx.tab); did = true; }
        if (ctx.modalId) {
            var m = document.getElementById(ctx.modalId);
            if (m && m.style.display !== 'none' && typeof window.bringModalToFront === 'function') { window.bringModalToFront(ctx.modalId); did = true; }
        }
        // 탭 전환·창 되살리기가 화면을 다시 그릴 수 있어 한 틱 뒤에 위치를 맞춘다
        setTimeout(function () {
            ctx.scrolls.forEach(function (s) { if (document.contains(s[0])) s[0].scrollTop = s[1]; });
            var row = (ctx.row && document.contains(ctx.row)) ? ctx.row : (ctx.rowId ? document.getElementById(ctx.rowId) : null);
            if (row) { try { row.scrollIntoView({ block: 'center' }); } catch (e) { /* 무시 */ } flash(row); }
        }, 60);
        return did || !!ctx.row;
    }

    var _chipTimer = null;
    function dropChip() {
        var c = document.getElementById('nav-return-chip'); if (c) c.remove();
        if (_chipTimer) { clearInterval(_chipTimer); _chipTimer = null; }
    }
    /** 다른 탭으로 보내고 난 뒤 화면 아래에 뜨는 `↩ 돌아가기 · 연 자리` 칩. 탭이 안 바뀌었으면 안 띄운다. 눌렀거나, 직접 그 탭으로 돌아갔거나, 60초가 지나면 사라진다. */
    function chip(ctx) {
        if (!ctx || !ctx.tab) return;
        dropChip();
        var el = document.createElement('div');
        el.id = 'nav-return-chip';
        el.style.cssText = 'position:fixed; left:50%; bottom:64px; transform:translateX(-50%); z-index:10050; display:flex; align-items:center; gap:2px; background:#2c5f8a; color:#fff; border-radius:18px; box-shadow:0 4px 16px rgba(0,0,0,.28); font-size:12.5px; overflow:hidden;';
        el.innerHTML = '<button id="nav-return-go" title="' + esc(T('연 자리로 돌아갑니다', 'Go back to where you came from')) + '" style="background:none; border:none; color:#fff; font-weight:bold; font-size:12.5px; padding:8px 8px 8px 14px; cursor:pointer;">↩ ' + esc(T('돌아가기', 'Go back')) + ' · ' + esc(ctx.label || tabLabel(ctx.tab)) + '</button>' +
                       '<button id="nav-return-x" title="' + esc(T('닫기', 'Dismiss')) + '" style="background:none; border:none; color:#cfe0ee; font-size:14px; padding:8px 12px 8px 4px; cursor:pointer;">✕</button>';
        document.body.appendChild(el);
        document.getElementById('nav-return-go').onclick = function () { dropChip(); restore(ctx); };
        document.getElementById('nav-return-x').onclick = dropChip;
        var t0 = Date.now();
        _chipTimer = setInterval(function () { if (activeTab() === ctx.tab || Date.now() - t0 > 60000) dropChip(); }, 1500);
    }

    window._nav = { capture: capture, restore: restore, chip: chip, dropChip: dropChip, flash: flash, activeTab: activeTab };
})();
