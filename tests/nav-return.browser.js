// ↩ 돌아가기 하네스 (2026-11-26) — 브라우저 콘솔에 붙여넣기. 메일 유래 업무가 있는 프로젝트를 연 채로(저장은 막고).
//   진짜: 프로젝트 리뷰 표 · 일일보고 후보 표 · 메일 원문 창 · `#G` 링크 이동(_aiJumpToRow) · 공용 모듈 js/83. 가짜 없음 — 읽기와 화면 이동만 한다(끝에 원래 탭으로).
(async function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var shown = function (id) { var m = document.getElementById(id); return !!m && m.style.display !== 'none' && getComputedStyle(m).display !== 'none'; };
    try {
        ok('공용 모듈이 로드돼 있다', !!window._nav && typeof window._mailRawBack === 'function');
        // ── 1) 프로젝트 리뷰 근거 사실 표 → 📧 원문 → ← 돌아가기 ──
        window.switchTab('psummary'); await w(1200);
        window._psTblSet({ reset: 1, view: 'brief' }); window._fdup.reset('ps-facts');
        window._psSetMode('week'); await w(4000);
        for (var wi = 0; wi < 60 && /확인 중|Scanning/.test(document.getElementById('psummary-page').innerText); wi++) await w(500);
        await w(800);
        var d = document.getElementById('ps-facts-det'); if (d) d.open = true;
        var tr = [].slice.call(document.querySelectorAll('#ps-facts-body tbody tr[id^="ps-fact-"]')).filter(function (t) { return t.querySelector('button[onclick*="_psShowMail"]'); })[0];
        ok('📧 원문 단추가 있는 줄이 있다', !!tr);
        var sc = document.getElementById('ps-scroll'); tr.scrollIntoView({ block: 'center' }); sc.scrollTop = Math.max(0, sc.scrollTop + 7); var top0 = sc.scrollTop;
        tr.querySelector('button[onclick*="_psShowMail"]').click(); await w(700);
        ok('원문 창이 열린다', shown('inbox-mailraw-modal'));
        var bb = document.getElementById('inbox-mailraw-back-btn');
        ok('[← 돌아가기] 단추가 보인다', !!bb && bb.style.display !== 'none', bb && bb.style.display);
        ok('말풍선에 연 자리가 적힌다', !!bb && /돌아갑니다/.test(bb.title) && bb.title.length > 14, bb && bb.title);
        sc.scrollTop = 0; await w(100);                                        // 원문을 보는 동안 위치가 바뀌었다고 치고
        bb.click(); await w(500);
        ok('돌아가기를 누르면 원문 창이 닫힌다', !shown('inbox-mailraw-modal'));
        ok('목록 스크롤이 원래 자리로 돌아온다', Math.abs(sc.scrollTop - top0) < 80 || !!document.getElementById(tr.id), [sc.scrollTop, top0]);
        ok('연 줄을 깜빡여 보여 준다(테두리 그림자)', /inset|rgb\(240, 140, 0\)/.test(getComputedStyle(document.getElementById(tr.id) || tr).boxShadow) || /240, 140, 0/.test(String(document.getElementById(tr.id).style.boxShadow)), document.getElementById(tr.id).style.boxShadow);
        ok('프로젝트 리뷰 탭에 그대로 있다', window._nav.activeTab() === 'psummary');
        // ── 2) 탭이 바뀐 뒤에도 연 탭으로 ──
        var ctx = (function () { var f = document.querySelector('#ps-facts-body tbody tr[id^="ps-fact-"]'); var ev = { target: f.querySelector('td') }; window.event = undefined; return window._nav.capture(); })();
        window.switchTab('gantt'); await w(400);
        ok('다른 탭(간트)으로 옮겼다', window._nav.activeTab() === 'gantt');
        window._nav.restore(ctx); await w(500);
        ok('restore 가 연 탭으로 되돌린다', window._nav.activeTab() === 'psummary', window._nav.activeTab());
        // ── 3) #G 링크로 간트 행에 이동 → 떠 있는 ↩ 돌아가기 칩 ──
        var link = document.querySelector('#ps-facts-body .ai-task-ref');
        if (link) {
            link.click(); await w(700);
            ok('#G 링크는 간트 탭으로 이동한다', window._nav.activeTab() === 'gantt');
            var chip = document.getElementById('nav-return-chip');
            ok('이동 뒤 [↩ 돌아가기 · 연 자리] 칩이 뜬다', !!chip && /돌아가기/.test(chip.innerText), chip && chip.innerText);
            document.getElementById('nav-return-go').click(); await w(600);
            ok('칩을 누르면 연 탭으로 돌아오고 칩이 사라진다', window._nav.activeTab() === 'psummary' && !document.getElementById('nav-return-chip'), window._nav.activeTab());
        } else { ok('(#G 링크가 없어 3) 은 건너뜀)', true); }
        // 같은 탭에서 한 점프엔 칩이 없다
        window.switchTab('gantt'); await w(300);
        window._aiJumpToRow(1); await w(400);
        ok('이미 간트 탭이면 칩이 안 뜬다', !document.getElementById('nav-return-chip'));
        // ── 4) 일일보고 창에서 연 원문 → 돌아가기 → 일일보고 창이 앞에 ──
        window.switchTab('psummary'); await w(400);
        window.dailyOpenModal(); await w(3000);
        for (var wj = 0; wj < 40 && window._dailyOtherScan && window._dailyOtherScan.busy; wj++) await w(500);
        await w(800);
        var mailBtn = document.querySelector('#daily-cand tbody tr[onclick] span[onclick*="_dailyCandShowMailRawC"]');
        ok('일일보고 후보에 📧 가 있다', !!mailBtn);
        if (mailBtn) {
            mailBtn.click(); await w(700);
            ok('일일보고 창에서 연 원문 — 돌아가기 단추가 보인다', shown('inbox-mailraw-modal') && document.getElementById('inbox-mailraw-back-btn').style.display !== 'none');
            document.getElementById('inbox-mailraw-back-btn').click(); await w(500);
            ok('돌아가면 원문은 닫히고 일일보고 창은 그대로 떠 있다', !shown('inbox-mailraw-modal') && shown('daily-modal'));
        }
        window.dailyCloseModal(); localStorage.removeItem(window.DAILY_POLICY.draftKey);
    } catch (e) { ok('실행', false, e && e.message); }
    finally { var m = document.getElementById('inbox-mailraw-modal'); if (m) m.style.display = 'none'; if (window._nav) window._nav.dropChip(); }
    console.log(res.join('\n')); return res;
})();
