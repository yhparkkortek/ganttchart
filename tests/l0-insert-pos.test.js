// tests/l0-insert-pos.test.js — 메일·결재 업무가 들어갈 자리(computeL0InsertPos, js/14b)
// 2026-11-24 실측: 업무 날짜가 구간 시작보다 이르면(지난 결재·옛 메일) 구간 머리(LEVEL 0) **앞** = 프로젝트 맨 위에 꽂혔고,
//   이어 들어온 것도 같은 자리에 쌓여 날짜 순서가 깨졌다(결재 12행·메일 19행). 머리는 비교하지 않고, 머리 위로는 안 넣는다.
// 진짜 js/14b 소스에서 그 함수와 도우미(_msMailFullTs)를 잘라 돌린다. 가짜는 날짜 해석(parseDateValue) 하나.
// 실행: node tests/l0-insert-pos.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', '14b-ai-mail-analysis-2.js'), 'utf8');
function cut(startMarker, endMarker) {
    const s = src.indexOf(startMarker); const e = src.indexOf(endMarker, s) + endMarker.length;
    if (s < 0 || e < endMarker.length) { console.error('못 찾음: ' + startMarker); process.exit(1); }
    return src.slice(s, e);
}
const helper = cut('function _msMailFullTs(dateStr) {', '\n}');
const fnSrc = cut('window.computeL0InsertPos = function(', '\n};');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('✅ ' + m); } else { fail++; console.log('❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };

const win = { _currentLang: 'ko' };
win.window = win;
win.parseDateValue = (s) => { const t = Date.parse(String(s).slice(0, 10)); return isNaN(t) ? null : { ts: t }; };
const ctx = vm.createContext(win);
vm.runInContext(helper + '\n' + fnSrc, ctx);

const ci = { devStage: -1, wbs: 0, start: 1 };
const R = (lv, name, date) => { const r = [name, date]; r._level = lv; r._origDev = name; r._calcStartTs = Date.parse(date); return r; };
function project() {
    return [['업무', '시작'],
        R(0, 'RFQ', '2026-11-02'), R(1, 'RFQ a', '2026-11-02'), R(1, 'RFQ b', '2026-11-12'),
        R(0, 'PROTO', '2026-12-01'), R(1, 'PROTO a', '2026-12-01')];
}
const ins = (rows, name, date) => {
    const p = win.computeL0InsertPos(rows, ci, 'RFQ', date, true, date);
    rows.splice(p.pos, 0, R(4, name, date));
    return p.pos;
};

// 1. 구간 시작보다 이른 업무 → 머리 바로 아래(구간 안), 머리 위가 아니다
let rows = project();
ok(ins(rows, 'old', '2026-08-31') === 2 && rows[1][0] === 'RFQ', '1 구간 시작보다 이른 업무는 머리 바로 아래에 들어간다(머리 위 = 프로젝트 맨 위가 아니다)', rows.map(r => r[0]));

// 2. 이른 업무 여럿을 뒤죽박죽 넣어도 날짜 순서
rows = project();
['2026-10-26', '2026-08-31', '2026-09-10', '2026-09-02'].forEach((d, i) => ins(rows, 'd' + i, d));
const dates = rows.slice(2, 6).map(r => r[1]);
ok(JSON.stringify(dates) === JSON.stringify(['2026-08-31', '2026-09-02', '2026-09-10', '2026-10-26']), '2 이른 업무 여러 건을 아무 순서로 넣어도 날짜 순서로 선다', rows.map(r => r[0] + ':' + r[1]));
ok(rows[1][0] === 'RFQ' && rows[1]._level === 0, '2b 구간 머리는 여전히 맨 위(첫 행)');

// 3. 구간 안 날짜 → 그 날짜 자리(기존 동작 유지)
rows = project();
ok(ins(rows, 'mid', '2026-11-05') === 3, '3 구간 안 날짜는 그 사이에 들어간다(11-02 와 11-12 사이)', rows.map(r => r[0]));

// 4. 구간 모든 행보다 늦으면 구간 끝(기존 동작 유지)
rows = project();
ok(ins(rows, 'late', '2026-11-20') === 4 && rows[5][0] === 'PROTO', '4 구간 모든 행보다 늦으면 구간 끝, 다음 구간 머리 앞', rows.map(r => r[0]));

console.log('l0-insert-pos: ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
