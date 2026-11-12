// node tests/task-inbox-project-label.test.js
//
// 🔎 업무 보관함(js/14c) 그룹 라벨 — `_tiProjectOf`가 매칭 당시 스냅샷이 아니라
//    지금 캐시된 project_index의 최신 model을 쓰는지 검증.
//
// 배경(2026-11-12, 사용자 제보): 멀티모델 프로젝트(LNW>STELLAR32)의 대표 라벨을
// 모델#1 번호("1641445-ALT1") 대신 고객사>프로젝트명("STELLAR32")으로 바꿨는데,
// 업무 보관함 그룹 칩은 계속 옛 라벨을 보여줬다 — `it.matchedProject.candidates[0].model`이
// "그 메일을 매칭한 시점"에 찍힌 스냅샷이라, 그 뒤 project_index.json의 model이 바뀌어도
// 안 따라갔다(같은 시간 토픽 프로파일 뷰어는 project_index를 직접 읽어서 바로 바뀐 것과 대조).
//
// 네트워크 없이 돈다 — `_tiProjectOf`를 소스에서 직접 잘라 돌린다(복제 아님).

'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', '14c-task-inbox.js'), 'utf8');

function sliceFn(name) {
    const head = SRC.indexOf('function ' + name + '(');
    if (head < 0) throw new Error('not found: ' + name);
    const end = SRC.indexOf('\n}', head);
    if (end < 0) throw new Error('end not found: ' + name);
    return SRC.slice(head, end + '\n}'.length);
}

let pass = 0, fail = 0;
function eq(label, got, want) {
    if (got === want) { pass++; console.log('  ✅ ' + label); }
    else { fail++; console.log('  ❌ ' + label + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}

// `_tiProjectOf`는 `function _tiProjectOf(...) {...}` 선언이라 window에 안 붙는다 —
// 끝에 그 이름을 그대로 반환시켜서 받는다. 본문이 참조하는 `window`는 여기서 만든 mockWin
// 하나로 고정(클로저로 캡처됨) — 이후 테스트는 mockWin의 속성만 바꿔가며 같은 함수를 부른다.
const mockWin = {};
const _tiProjectOf = new Function('window', sliceFn('_tiProjectOf') + '\nreturn _tiProjectOf;')(mockWin);

console.log('[1] 매칭 안 된 업무는 noMatchLabel');
eq('matchedProject 없음', _tiProjectOf({}, '미분류'), '미분류');

console.log('[2] 캐시가 없으면(아직 안 불러옴) 매칭 당시 스냅샷을 그대로 쓴다(기존 동작)');
const itOldOnly = { matchedProject: { candidates: [{ drive_file_id: 'fid1', model: '1641445-ALT1' }] } };
eq('캐시 없음 → 스냅샷 모델', _tiProjectOf(itOldOnly, '미분류'), '1641445-ALT1');

console.log('[3] 캐시에 같은 파일의 최신 model이 있으면 그걸 우선한다(이번에 고친 부분)');
mockWin._projectIndexCache = { data: [{ drive_file_id: 'fid1', model: 'STELLAR32' }] };
eq('캐시의 최신 모델(STELLAR32)을 쓴다', _tiProjectOf(itOldOnly, '미분류'), 'STELLAR32');

console.log('[4] 캐시에 그 파일이 없으면(삭제됨 등) 스냅샷으로 안전하게 폴백');
mockWin._projectIndexCache.data = [{ drive_file_id: 'other', model: 'OTHER' }];
eq('캐시에 없음 → 스냅샷 폴백', _tiProjectOf(itOldOnly, '미분류'), '1641445-ALT1');

console.log('[5] model도 customer도 없는 후보는 noMatchLabel로 떨어지지 않고 customer라도 쓴다');
mockWin._projectIndexCache.data = [];
const itCustomerOnly = { matchedProject: { candidates: [{ drive_file_id: 'fid2', customer: 'LNW>FOO' }] } };
eq('customer 폴백', _tiProjectOf(itCustomerOnly, '미분류'), 'LNW>FOO');

console.log('\n' + (fail ? ('❌ ' + fail + ' 건 실패') : '✅ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
