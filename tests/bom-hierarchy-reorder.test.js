// node tests/bom-hierarchy-reorder.test.js
//
// 🔎 AI 문답의 일반 "BOM 보여줘" 경로(js/04h `_aiFetchSapContext`)가 BOM 탭(js/38)과 같은
//    레벨 블록 폴백을 쓰는지 검증 — `window._bomReorderTextForHierarchy`.
//
// 배경(2026-11-12): 팀 공용 SAP 계정의 ZPP033 "기본 레이아웃"이 다른 걸로 바뀌어 있으면
// BOM 조회 결과의 행 순서가 깨질 수 있다(원인은 sap_bridge_32.py 쪽에서 자동 보정하도록
// 고쳤지만, 혹시 다른 이유로 또 깨지더라도) — 그때 js/04h가 백엔드 원본 텍스트를 그대로
// AI에게 넘기면 뒤섞인 순서를 그대로 보여주게 된다. BOM 탭이 이미 하는 폴백(`_bomLevelGroups`,
// 레벨별로 묶어서 보여줌)과 같은 규칙으로 텍스트를 다시 조립해야 한다.
//
// 네트워크·SAP 없이 돈다. 안쪽은 js/38 진짜 코드(`_bomParseSapText`/`_bomLevelGroups`/
// `_bomHierarchyOk`)를 그대로 쓴다 — 복제하지 않는다.

const fs = require('fs');
const path = require('path');

const window = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', '38-bom-tab.js'), 'utf8'))(window);

let pass = 0, fail = 0;
function eq(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + '\n      got : ' + JSON.stringify(got) + '\n      want: ' + JSON.stringify(want)); }
}

// 정상(깊이 우선) 응답 — 손대지 말아야 한다.
const OK_TEXT = [
    '[SAP BOM 전개(ZPP033): 자재 502574, 플랜트 1000]',
    '[레이아웃: "/KTK_LOC" 적용됨]',
    '',
    'STUFE\tIDNRK\tOJTXP\tMENGE\tMMEIN',
    '\t502574\tMVD>KTS320DPS01,LNW\t\t',
    '[ 1     ]\t131769\tLCM IPS>MV315QHM-N41,=\t1\tEA',
    '[   2   ]\t132487\tPCB MAIN>ADONIS-QLW,=\t1\tEA',
    '[ 1     ]\t900107\tFAN>ZZ99FAN,DC24V,=\t1\tEA'
].join('\n');

// 깨진 응답(실측 재현, 2026-11-12) — 첫 데이터 행이 레벨2로 시작한다.
const BROKEN_TEXT = [
    '[SAP BOM 전개(ZPP033): 자재 502574, 플랜트 1000]',
    '[레이아웃: "/KTK_LOC" 적용됨]',
    '[⚠️ 계층 깨짐: 결과가 정렬된 순서로 와서 상·하위 관계를 복원할 수 없습니다]',
    '',
    'STUFE\tIDNRK\tOJTXP\tMENGE\tMMEIN',
    '\t502574\tMVD>KTS320DPS01,LNW\t\t',
    '[   2   ]\t116992\tX-TAL>S,14.31M,=\t1\tEA',
    '[   2   ]\t107848\tX-TAL>S,12M,=\t2\tEA',
    '[ 1     ]\t132933\tTSP PCT>TOUCH,=\t1\tEA',
    '[   2   ]\t117794\tTR>S,FET-P,=\t1\tEA',
    '[ 1     ]\t107558\tSILICAGEL>POWER,=\t1.5\tEA'
].join('\n');

console.log('[1] 정상 응답 — 원본 그대로, 손대지 않는다');
eq('텍스트가 완전히 동일하다(===)', window._bomReorderTextForHierarchy(OK_TEXT) === OK_TEXT, true);

console.log('[2] 깨진 응답 — 레벨 블록으로 다시 묶인다');
const fixed = window._bomReorderTextForHierarchy(BROKEN_TEXT);
const fixedLines = fixed.split('\n').filter(function (l) { return l.indexOf('\t') !== -1; });
// 첫 데이터 줄은 완제품(헤더, STUFE 빈칸)이어야 한다.
eq('첫 줄은 머리글(STUFE 칼럼명)', fixedLines[0].split('\t')[0], 'STUFE');
eq('둘째 줄은 완제품(부모) — STUFE 빈칸', fixedLines[1].split('\t')[0].trim(), '');
eq('완제품 다음은 레벨1 항목부터(132933, 107558)',
    [fixedLines[2].split('\t')[1], fixedLines[3].split('\t')[1]].sort(),
    ['107558', '132933']);
eq('레벨1 다음에 레벨2 항목들(116992, 107848, 117794)',
    [fixedLines[4], fixedLines[5], fixedLines[6]].map(function (l) { return l.split('\t')[1]; }).sort(),
    ['107848', '116992', '117794']);
eq('재조립 후 다시 파싱하면 계층이 정상으로 판정된다(둘째 패스)',
    window._bomParseSapText(fixed).hierarchyOk, true);
eq('메타 헤더(계층 깨짐 경고 포함)는 그대로 보존된다',
    fixed.indexOf('[⚠️ 계층 깨짐') !== -1, true);
eq('재조립됐다는 안내가 덧붙는다',
    fixed.indexOf('레벨별로 다시 묶어 표시') !== -1, true);

console.log('[3] 빈 입력 / STUFE 없는 텍스트는 그대로 통과');
eq('빈 문자열', window._bomReorderTextForHierarchy(''), '');
eq('탭 없는 일반 텍스트', window._bomReorderTextForHierarchy('그냥 오류 메시지'), '그냥 오류 메시지');

console.log('\n' + (fail ? ('✗ ' + fail + ' 건 실패') : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
