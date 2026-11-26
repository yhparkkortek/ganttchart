// 🗂 간트 일정 도구 "그룹 제안" 묶음 이름 하네스 (2026-11-26) — 브라우저 콘솔에 붙여넣기. 프로젝트를 연 채로. **읽기만 한다**(후보 탐지 `_wbsDetectGroupCandidates` 는 데이터를 안 바꾼다).
//   사용자 요청: "추천 단어를 하나만 쓰고 있다 — 2단어 이상이면 2단어 이상으로 추천 묶음 이름을 보여 달라".
(function () {
    var res = [], ok = function (n, c, d) { res.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(d || ''))); };
    var cands = window._wbsDetectGroupCandidates();
    var words = function (c) { return String(c.suggestedName || '').split(/\s+/).filter(Boolean); };
    var has = function (title, w) { return String(title).toLowerCase().indexOf(String(w).toLowerCase()) >= 0; };
    ok('묶음 후보가 있다', cands.length > 0, cands.length);
    var multi = cands.filter(function (c) { return words(c).length >= 2; });
    ok('이름이 두 낱말 이상인 묶음이 있다', multi.length > 0, multi.length);
    ok('이름의 낱말은 모두 **둘 이상의 멤버** 제목에 들어 있다', multi.every(function (c) { return words(c).every(function (w) { return c.titles.filter(function (t) { return has(t, w); }).length >= 2; }); }),
       multi.filter(function (c) { return !words(c).every(function (w) { return c.titles.filter(function (t) { return has(t, w); }).length >= 2; }); }).slice(0, 3).map(function (c) { return [c.suggestedName, c.titles]; }));
    var two = multi.filter(function (c) { return c.memberIdx.length === 2; });
    ok('멤버가 둘이면 이름의 낱말이 **두 제목 모두**에 들어 있다', two.every(function (c) { return words(c).every(function (w) { return c.titles.every(function (t) { return has(t, w); }); }); }), two.length);
    ok('이름이 너무 길지 않다(낱말 4개 이하)', cands.every(function (c) { return words(c).length <= 4 || words(c).length === String(c.suggestedName).split(/\s+/).length && c.suggestedName === c.titles[0]; }));
    ok('빈 이름이 없다', cands.every(function (c) { return String(c.suggestedName || '').trim().length > 0; }));
    // 🏷 [대괄호] 꼬리표(예: [결재])는 이름에도 판정에도 안 센다 — 이름의 낱말은 **꼬리표를 뺀 제목**에서 둘 이상 멤버가 가져야 한다
    var TAG = /\[[^\]]*(?:\]|$)|【[^】]*(?:】|$)/g;
    var bare = function (t) { return String(t).replace(TAG, ' '); };
    ok('이름에 [결재] 같은 꼬리표 낱말이 없다(꼬리표를 뺀 제목에서 둘 이상 멤버가 가진 낱말만)', cands.every(function (c) { return words(c).length === 0 || words(c).every(function (w) { return c.titles.filter(function (t) { return has(bare(t), w); }).length >= 2 || c.titles.length < 2; }); }),
       cands.filter(function (c) { return !words(c).every(function (w) { return c.titles.filter(function (t) { return has(bare(t), w); }).length >= 2; }); }).slice(0, 3).map(function (c) { return [c.suggestedName, c.titles]; }));
    ok('"결재" 로 시작하는 이름은 제목 본문에 "결재" 가 있을 때뿐이다', cands.every(function (c) { return !/^결재(\s|$)/.test(c.suggestedName) || c.titles.filter(function (t) { return /결재/.test(bare(t)); }).length >= 2; }),
       cands.filter(function (c) { return /^결재(\s|$)/.test(c.suggestedName); }).map(function (c) { return c.suggestedName; }));
    var sample = cands.slice(0, 8).map(function (c) { return c.suggestedName + '  ←  ' + c.titles.slice(0, 3).join(' | '); });
    console.log(res.join('\n')); console.log(sample.join('\n'));
    return { res: res, sample: sample, total: cands.length, multiWord: multi.length };
})();
