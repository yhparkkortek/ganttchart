// 🧪 BOM 모자 관계 보존 정렬 — 핵심 알고리즘만 떼어 독립 검증 (2026-11-18)
// js/38-bom-tab.js 는 DOM/window 에 묶인 IIFE라 그대로 못 불러온다. 같은 로직을
// 여기 복사해서 돌린다 — 소스가 바뀌면 이 파일도 같이 맞춰야 한다(손으로 비교).
'use strict';

function buildTree(rows) {
    var roots = [], stack = [];
    rows.forEach(function (r, i) {
        var node = { row: r, idx: i, children: [] };
        while (stack.length && stack[stack.length - 1].level >= r._level) stack.pop();
        (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
        stack.push({ level: r._level, node: node });
    });
    return roots;
}
function sortSiblings(nodes, rowCmp) {
    var nodeCmp = function (a, b) { return rowCmp(a.row, b.row); };
    var ordered = nodes.slice().sort(nodeCmp);
    ordered.forEach(function (n) { if (n.children.length) n.children = sortSiblings(n.children, rowCmp); });
    return ordered;
}
function flatten(nodes, collapsed, out) {
    nodes.forEach(function (n) {
        var hasChild = n.children.length > 0;
        var isCollapsed = hasChild && !!collapsed[n.idx];
        out.push({ row: n.row, idx: n.idx, hasChild: hasChild, collapsed: isCollapsed });
        if (hasChild && !isCollapsed) flatten(n.children, collapsed, out);
    });
    return out;
}
function cmpGroup2(a, b) { return String(a.Group2).localeCompare(String(b.Group2)); }

// 사용자 스크린샷과 같은 모양: 모체(레벨0) + 레벨1 둘(각자 자식 있음) + 레벨1 단독 여럿
var rows = [
    { _level: 0, IDNRK: 'MVD', Group2: '완제품/MVD' },
    { _level: 1, IDNRK: 'LCM', Group2: 'DISPLAY/LCM' },
    { _level: 1, IDNRK: 'PBA-AD', Group2: 'BD 반제품/PBA' },
    { _level: 2, IDNRK: 'HARNESS-A', Group2: '전장자재/HARNESS' },
    { _level: 2, IDNRK: 'PRESS-A', Group2: '기구자재/PRESS' },
    { _level: 1, IDNRK: 'PBA-CNV', Group2: 'BD 반제품/PBA' },
    { _level: 2, IDNRK: 'TAPE-A', Group2: '기구자재/TAPE' },
    { _level: 1, IDNRK: 'HN-STANDALONE', Group2: '전장자재/HARNESS' }
];

var tree = sortSiblings(buildTree(rows), cmpGroup2);
var flat = flatten(tree, {}, []);
var order = flat.map(function (x) { return x.row.IDNRK + '(L' + x.row._level + ')'; });

console.log(order.join(' -> '));

var fails = [];
function expectAdjacentAfter(parentId, childIds) {
    var pIdx = flat.findIndex(function (x) { return x.row.IDNRK === parentId; });
    if (pIdx === -1) { fails.push('부모 ' + parentId + ' 못 찾음'); return; }
    childIds.forEach(function (cid, k) {
        var found = flat[pIdx + 1 + k];
        if (!found || found.row.IDNRK !== cid) {
            fails.push(parentId + ' 바로 다음에 ' + cid + ' 가 없음 (실제: ' + (found ? found.row.IDNRK : 'none') + ')');
        }
    });
}
// PBA-AD 의 자식(HARNESS-A, PRESS-A)이 PBA-AD 바로 다음에 그대로 붙어 있어야 한다
// (둘의 상대 순서는 HARNESS < PRESS 알파벳순으로 형제끼리 재배열됨)
expectAdjacentAfter('PBA-AD', ['HARNESS-A', 'PRESS-A'].sort(function (a, b) {
    return cmpGroup2(rows.find(function (r) { return r.IDNRK === a; }), rows.find(function (r) { return r.IDNRK === b; }));
}));
expectAdjacentAfter('PBA-CNV', ['TAPE-A']);

// 최상위(레벨1) 형제는 Group2 기준으로 재배열됐어야 한다 — 알파벳순으로 "BD" < "DISPLAY" < "전장자재"
var topOrder = flat.filter(function (x) { return x.row._level === 1; }).map(function (x) { return x.row.IDNRK; });
var expectedTop = ['PBA-AD', 'PBA-CNV', 'LCM', 'HN-STANDALONE']; // BD,BD < DISPLAY < 전장자재(한글은 로케일순 뒤)
// 정확한 한글 vs 영문 로케일 비교 결과는 환경마다 다를 수 있어, "두 PBA 가 서로 붙어있는지"만 확인
var pbaIdx = topOrder.map(function (id, i) { return id.indexOf('PBA') === 0 ? i : -1; }).filter(function (i) { return i >= 0; });
if (pbaIdx.length === 2 && pbaIdx[1] - pbaIdx[0] !== 1) fails.push('두 PBA(같은 Group2) 형제가 서로 안 붙음: ' + topOrder.join(','));

if (fails.length) {
    console.error('FAIL (' + fails.length + '):');
    fails.forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
} else {
    console.log('PASS — 정렬해도 모자 관계가 유지된다(부모 바로 다음에 그 자식들).');
}
