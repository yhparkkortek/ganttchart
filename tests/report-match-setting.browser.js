// 📅 보고 업무 기준 설정(js/84) 하네스 — 브라우저 콘솔에 붙여넣기. 빈 앱(프로젝트 안 연)에서. 저장 키는 끝에 지운다.
//   진짜: 설정 메뉴 버튼 · 모달 · 라디오 클릭 · localStorage · 정책 객체. 가짜 없음. (새로고침 뒤 유지는 이 하네스 밖 — 새로고침 후 `[DAILY_SCAN.matchBy, WR_POLICY.matchBy]` 로 확인)
(async function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var KEY = 'gantt_report_match_v1', before = localStorage.getItem(KEY);
    try {
        localStorage.removeItem(KEY);
        var btn = document.getElementById('report-match-btn');
        ok('설정 ▸ 🗓️ 일정 구역(휴일 등록 바로 아래)에 버튼이 있다', !!btn && btn.previousElementSibling && btn.previousElementSibling.id === 'holiday-btn');
        var d0 = DAILY_SCAN.matchBy, w0 = WR_POLICY.matchBy;
        btn.click(); await w(300);
        var m = document.getElementById('report-match-modal');
        ok('모달이 열린다', !!m && getComputedStyle(m).display !== 'none');
        m.querySelector('input[name=rm-daily]:not(:checked)').click(); await w(200);
        var flip = function (v) { return v === 'start' ? 'overlap' : 'start'; };
        ok('일일보고 선택이 정책에 반영된다(주간은 그대로)', DAILY_SCAN.matchBy === flip(d0) && WR_POLICY.matchBy === w0, [DAILY_SCAN.matchBy, WR_POLICY.matchBy]);
        m.querySelector('input[name=rm-weekly]:not(:checked)').click(); await w(200);
        ok('주간보고 선택이 정책에 반영된다', WR_POLICY.matchBy === flip(w0), WR_POLICY.matchBy);
        var saved = JSON.parse(localStorage.getItem(KEY) || '{}');
        ok('이 PC 에 저장된다(두 보고 각각)', saved.daily === DAILY_SCAN.matchBy && saved.weekly === WR_POLICY.matchBy, saved);
        ok('라디오 표시가 현재 값을 따른다', m.querySelector('input[name=rm-daily]:checked').getAttribute('onchange').indexOf("'" + DAILY_SCAN.matchBy + "'") !== -1);
        // 훑기 캐시 열쇠에 기준이 들어 있나(옛 기준 후보 재사용 방지) — 소스에서 확인
        var src = await (await fetch('js/59-daily-report.js?_=' + Date.now())).text();
        ok('일일보고 훑기 캐시 열쇠에 matchBy 가 들어 있다', /var key = tag[^\n]*matchBy/.test(src));
        DAILY_SCAN.matchBy = d0; WR_POLICY.matchBy = w0; m.style.display = 'none';
    } catch (e) { ok('실행', false, e && e.message); }
    finally { if (before == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before); }
    console.log(res.join('\n')); return res;
})();
