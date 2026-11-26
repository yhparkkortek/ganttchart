// 📅 주간보고 후보 = 그 주에 **시작한** 업무만 (2026-11-26, WR_POLICY.matchBy) — 브라우저 콘솔에 붙여넣기.
//   ⚠️ 프로젝트를 연 채로 돌리지 말 것 — globalData 를 합성 행으로 바꾼다(앱 자동저장이 NAS 에 쓸 수 있다). 프로젝트를 안 연 빈 앱에서 돌린다.
//   진짜: wrClassifyTasks(js/20) 전체. 가짜: 없음(합성 행만).
(function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    try {
        if (window.currentDriveFileId || (window.globalData && globalData.length > 1)) { console.log('SKIP — 프로젝트가 열려 있다(빈 앱에서 돌릴 것)'); return; }
        var DAY = 86400000;
        window.wrBaseDate = new Date(); window.wrState = window.wrState || {}; window.wrState.taskMode = 'wbs'; window.wrState.levelFilter = [0, 1, 2, 3, 4];
        var w0 = window.wrClassifyTasks(), ts = w0.thisWeek.start, ns = w0.nextWeek.start, ne = w0.nextWeek.end;
        var mk = function (n, s, e) { var r = ['x']; r._level = 4; r._origT4 = n; r._calcStartTs = s; r._calcPlanTs = e; return r; };
        globalData.length = 0;
        globalData.push(['hdr'], mk('이번주 시작', ts + DAY, ts + 2 * DAY), mk('지난주 시작 이번주까지', ts - 3 * DAY, ts + DAY),
            mk('다음주 시작', ns + DAY, ns + 2 * DAY), mk('이번주 시작 다음주까지', ts + 3 * DAY, ns + DAY), mk('이번주에 걸친 장기', ts - 10 * DAY, ne + 10 * DAY));
        var nm = function (l) { return l.map(function (x) { return x.wrName; }).join('|'); };
        var a = window.wrClassifyTasks();
        ok('이번주: 그 주에 시작한 업무만', nm(a.thisList) === '이번주 시작|이번주 시작 다음주까지', nm(a.thisList));
        ok('다음주: 다음 주에 시작한 업무만', nm(a.nextList) === '다음주 시작', nm(a.nextList));
        ok('지난주 시작·장기 업무는 어느 쪽에도 안 든다', nm(a.thisList).indexOf('지난주') === -1 && nm(a.thisList).indexOf('장기') === -1);
        window.WR_POLICY.matchBy = 'overlap';
        var b = window.wrClassifyTasks();
        ok("matchBy='overlap' 이면 예전처럼 걸친 업무도 든다(되돌리는 스위치)", nm(b.thisList).indexOf('지난주 시작 이번주까지') !== -1 && nm(b.thisList).indexOf('이번주에 걸친 장기') !== -1, nm(b.thisList));
        window.WR_POLICY.matchBy = 'start';
        globalData.length = 0;
    } catch (e) { ok('실행', false, e && e.message); }
    console.log(res.join('\n')); return res;
})();
