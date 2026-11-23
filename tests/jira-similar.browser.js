// 🔍 JIRA 유사 이슈 찾기(js/70) — "AI 과다 호출 금지" 불변식 검증 (2026-11-23)
//
// 돌리는 법: 앱(백엔드·JIRA 로그인 된 상태)을 열고 콘솔에 이 파일을 붙여넣은 뒤
//            await __jiraSimilarTest('GABJO-2')   ← 기준으로 쓸 실제 이슈 키
//
// 가짜는 **AI 경계 둘뿐**(callAiBackend·getActiveAiKey) — JIRA 검색·순위·보관은 진짜 코드.
// 그래서 실제 AI 하루 한도를 한 번도 쓰지 않는다. 끝나면 AI 검색어 보관함을 원래대로 되돌린다
// (안 되돌리면 가짜 검색어가 남아 사람의 진짜 첫 클릭이 그걸 쓴다).
window.__jiraSimilarTest = async function (baseKey) {
    var pass = 0, fail = 0;
    function ok(name, cond, detail) {
        if (cond) { pass++; console.log('  ok   ' + name); }
        else { fail++; console.warn('  FAIL ' + name + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); }
    }
    var CK = 'gantt_jira_simkw_v1';
    var before = localStorage.getItem(CK);
    var origAi = window.callAiBackend, origKey = window.getActiveAiKey;
    var calls = 0;
    try {
        localStorage.removeItem(CK);
        // ① 결정론 경로 — AI 를 세기만 한다(진짜 호출이 나가면 실패로 잡힌다)
        window.callAiBackend = function () { calls++; return Promise.resolve({ ok: false }); };
        var t = window._jiraSimTerms("TSP+BK Ass'y 조립시 BK부위 양면테이프 떨어짐");
        ok('조사 떼기(조립시→조립은 불용어라 빠짐, BK부위→bk)', t.indexOf('bk') >= 0 && t.indexOf('조립시') === -1, t);
        var g = window._jiraSimGroups(t);
        ok('복합어 안의 묶음 말 꺼내기(양면테이프 → 테이프/tape)', g.some(function (x) { return x.indexOf('tape') >= 0; }), g);
        await window._jiraFindSimilar(baseKey);
        ok('모달 열기 + 검색까지 AI 호출 0회', calls === 0, calls);
        var rows = document.querySelectorAll('#jira-search-body tbody tr');
        ok('결과가 나온다', rows.length > 0, rows.length);
        var proj = baseKey.split('-')[0];
        var own = Array.prototype.some.call(rows, function (tr) { return (tr.children[1] || {}).textContent === proj; });
        ok('기준 이슈의 프로젝트는 빠진다', !own);

        // ② AI 버튼 — 가짜 AI 로 1회, 연타·재클릭·다시 열기는 0회
        window.getActiveAiKey = function () { return 'FAKE'; };
        window.callAiBackend = async function () {
            calls++;
            await new Promise(function (r) { setTimeout(r, 100); });
            return { ok: true, data: { result: { candidates: [{ content: { parts: [{ text: '["adhesive","peel","EVT"]' }] } }] } } };
        };
        calls = 0;
        await Promise.all([window._jiraSimAiExpand(), window._jiraSimAiExpand()]);
        ok('연타해도 AI 1회', calls === 1, calls);
        var v = document.getElementById('jira-sim-terms').value;
        ok('AI 검색어가 합쳐지고 단계명(EVT)은 버려진다', v.indexOf('adhesive') >= 0 && v.indexOf('evt') === -1, v);
        await window._jiraSimAiExpand();
        ok('다시 눌러도 보관본 사용 — AI 0회 추가', calls === 1, calls);
        await window._jiraFindSimilar(baseKey);
        ok('같은 이슈를 다시 열어도 AI 0회 추가', calls === 1, calls);
    } finally {
        window.callAiBackend = origAi; window.getActiveAiKey = origKey;
        if (before == null) localStorage.removeItem(CK); else localStorage.setItem(CK, before);
        var m = document.getElementById('jira-search-modal'); if (m) m.style.display = 'none';
    }
    console.log('PASS ' + pass + ' / FAIL ' + fail);
    return { pass: pass, fail: fail };
};
