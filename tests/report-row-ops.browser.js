// 🚩 보고 화면 붉은 바·현황·삭제 하네스 (2026-11-26) — 브라우저 콘솔에 붙여넣기. 메일 유래 업무가 있는 프로젝트를 연 채로.
//   진짜: 프로젝트 리뷰 근거 사실 표 · 일일보고 후보 표 · js/80 조작 · 간트 행(메모리) · 되돌리기(Ctrl+Z 와 같은 undoLastAction).
//   가짜 없음 — 단 **저장은 막혀 있어야 한다**(실제 팀 프로젝트면 docs/ui-conventions.md "읽기 전용으로 여는 법" 3겹을 먼저). 이 하네스는 메모리의 간트 행을 바꿨다가 되돌린다.
(async function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var g = function () { return window.globalData; };
    var idOf = function (el, fn) { var m = new RegExp(fn + '\\((\\d+)').exec(el.getAttribute('onclick') || ''); return m ? +m[1] : null; };
    try {
        window.switchTab('psummary'); await w(1200);
        window._psTblSet({ reset: 1, view: 'brief' });
        window._psSetMode('week'); await w(3500);
        var body = document.getElementById('ps-facts-body');
        ok('근거 사실 표에 붉은 바 칸이 있다', !!body && !!body.querySelector('td.rp-cell .rp-bar'));
        ok('옛 📌 버튼(button.ps-pin-btn)은 없다', !body.querySelector('button.ps-pin-btn'));
        ok('현황·삭제 열이 있다', /현황·삭제/.test(body.innerText));
        var tr = [].slice.call(body.querySelectorAll('tbody tr[id^="ps-fact-"]')).filter(function (t) { return t.querySelector('.rp-bar:not(.closed)') && t.querySelector('select'); })[0];
        ok('열린 프로젝트 행이 하나 이상 있다(시험 대상)', !!tr);
        if (!tr) throw new Error('시험 대상 없음');
        var barId = idOf(tr.querySelector('.rp-bar'), '_rrPin'), ri = window._rr.resolve(barId).rows[0];
        var nm = window._rr.nameOf(g()[ri]), was = !!g()[ri]._알림;
        // 🚩 핀셋 — 바 클릭 = 간트 행 _알림
        tr.querySelector('.rp-bar').click(); await w(500);
        ok('바를 누르면 간트 행 핀셋이 바뀐다', !!g()[ri]._알림 === !was);
        var tr2 = document.getElementById(tr.id);
        ok('다시 그린 뒤 바 모양이 상태를 따른다(켜짐 클래스 on)', !!tr2 && tr2.querySelector('.rp-bar').classList.contains('on') === !was);
        tr2.querySelector('.rp-bar').click(); await w(500);
        ok('다시 누르면 원래대로', !!g()[ri]._알림 === was);
        // ✅ 현황 — 완료로 보내면 목록에서 숨고, 간트 상태 칸이 바뀐다
        var ci = window.colIdx, prevStatus = window._rr.koStatus(g()[ri][ci.status]);
        var sel = document.getElementById(tr.id).querySelector('select'); var visBefore = body.querySelectorAll('tbody tr[id^="ps-fact-"]').length;
        sel.value = '완료'; sel.dispatchEvent(new Event('change', { bubbles: true })); await w(700);
        ok('간트 상태 칸이 완료로 바뀐다', window._rr.koStatus(g()[ri][ci.status]) === '완료', g()[ri][ci.status]);
        ok('완료 행은 목록에서 숨는다', !document.getElementById(tr.id));
        ok('"완료 N건 숨김 — 보기" 칩이 생긴다', /완료 \d+건 숨김/.test(document.getElementById('psummary-page').innerText));
        window._psTblSet({ showDone: true }); await w(500);
        ok('칩을 누르면 완료 행이 다시 보인다', !!document.getElementById(tr.id));
        window._psTblSet({ showDone: false }); await w(300);
        window.undoLastAction(); await w(700);
        ok('Ctrl+Z 로 원래 상태', window._rr.koStatus(g()[ri][ci.status]) === prevStatus, g()[ri][ci.status]);
        // 🗑️ 삭제 — 간트 행이 사라지고 되돌리기로 돌아온다
        window._psTblSet({ showDone: false }); await w(400);
        body = document.getElementById('ps-facts-body');
        var tr3 = [].slice.call(body.querySelectorAll('tbody tr[id^="ps-fact-"]')).filter(function (t) { return t.querySelector('.rp-bar:not(.closed)') && t.querySelector('button[onclick*="_rrDelete"]'); })[0];
        var delId = idOf(tr3.querySelector('button[onclick*="_rrDelete"]'), '_rrDelete'), ri3 = window._rr.resolve(delId).rows[0], nm3 = window._rr.nameOf(g()[ri3]);
        var hasKids = g()[ri3 + 1] && (g()[ri3 + 1]._level || 0) > (g()[ri3]._level || 0);
        var len0 = g().length, realConfirm = window.confirm; window.confirm = function () { return true; };
        try { tr3.querySelector('button[onclick*="_rrDelete"]').click(); await w(900); } finally { window.confirm = realConfirm; }
        ok('삭제하면 간트 행이 줄어든다', g().length < len0, [len0, g().length]);
        window.undoLastAction(); await w(900);
        ok('Ctrl+Z 로 삭제가 돌아온다', g().length === len0, [len0, g().length]);
        // 📔 일일보고 후보 표
        window.dailyOpenModal(); await w(9000);
        var dc = document.getElementById('daily-cand');
        ok('일일보고 후보 표에 붉은 바·현황 열이 있다', !!dc && !!dc.querySelector('td.rp-cell .rp-bar') && /현황·삭제/.test(dc.innerText));
        var dtr = [].slice.call(dc.querySelectorAll('tbody tr[onclick]')).filter(function (t) { return t.querySelector('.rp-bar:not(.closed)') && t.querySelector('select'); })[0];
        ok('열린 프로젝트 후보가 있다', !!dtr);
        if (dtr) {
            var dId = idOf(dtr.querySelector('.rp-bar'), '_rrPin'), dri = window._rr.resolve(dId).rows[0], dWas = !!g()[dri]._알림, items0 = (document.querySelectorAll('[data-daily-item]') || []).length;
            dtr.querySelector('.rp-bar').click(); await w(500);
            ok('후보 표의 바도 간트 핀셋을 바꾼다', !!g()[dri]._알림 === !dWas);
            ok('바를 눌러도 보고에 담기지는 않는다(클릭 전파 차단)', document.querySelectorAll('[data-daily-item]').length === items0);
            document.getElementById('daily-cand').querySelector('.rp-bar[onclick*="' + '_rrPin"]');
            // 원상복구
            var back = [].slice.call(document.getElementById('daily-cand').querySelectorAll('tbody tr[onclick]')).filter(function (t) { var b = t.querySelector('.rp-bar'); return b && idOf(b, '_rrPin') && window._rr.resolve(idOf(b, '_rrPin')).rows[0] === dri; })[0];
            if (back) { back.querySelector('.rp-bar').click(); await w(400); }
            ok('후보 핀셋 원상복구', !!g()[dri]._알림 === dWas);
        }
        // 다른 프로젝트 후보는 눌러도 안 바뀐다
        var closed = dc && dc.querySelector('.rp-bar.closed');
        ok('열지 않은 프로젝트 후보의 바는 꺼진 채 눌리지 않는다(closed)', !closed || (!closed.getAttribute('onclick') && /열면|Open this project/.test(closed.title)));
        window.dailyCloseModal(); localStorage.removeItem(window.DAILY_POLICY.draftKey);
    } catch (e) { ok('실행', false, e && e.message); }
    console.log(res.join('\n')); return res;
})();
