// 🧹 모델 카드 재배정/삭제 시 orphan 제품구분자 정리 (2026-11-17, 2차 수정)
//
//     node tests/model-card-unit-prune.test.js
//
// 신고 1: "고객SPEC BOM MC TABLE document 등에서 summary 정보를 바꾸면 연동되는데
//          초기에 만든 MVD 가 없어지지 않음"
// 신고 2(1차 수정 뒤): "변화 없는데 직접 확인해봐 백 프론트 모두 재시작했는데 MVD 유령
//          그대로 남아있음" — 1차 수정은 **재배정/삭제하는 그 순간에만** 청소했다. 이미
//          재배정이 지난 뒤(= 이미 유령이 박혀 있는 기존 프로젝트)는 재시작·새로고침해도
//          파일을 그냥 읽기만 할 뿐 재배정을 다시 하는 게 아니라서 전혀 청소되지 않았다.
//
// 무엇을 보나
//   `_mcPruneOrphanUnits()`는 특정 유닛 하나가 아니라 **매번 전체를 쓸어본다** — 지금
//   모델 카드 중 아무도 안 쓰는 제품구분자를 전부 `tabData.mcUnits`에서 뺀다. 이 함수는
//   `renderProjectModels()`가 돌 때마다 불리고, `renderProjectModels()`는
//   `populateTabData()`(프로젝트를 열 때마다)가 이미 부르므로 — 재배정을 다시 안 해도
//   **그냥 프로젝트를 여는 것만으로** 과거에 생긴 유령까지 청소되는지를 본다.
//
// ⚠️ 데이터는 안 건드린다 — `mcRevisionsByUnit[oldName]` 등 실제 저장 데이터는 그대로
//    두고 `tabData.mcUnits`(탭 목록)에서만 뺀다(`mcRemoveUnit`과 같은 원칙: 데이터 보존,
//    목록에서만 숨김 — 같은 이름을 다시 추가하면 그 데이터가 되살아난다).
//
// 가짜는 **바깥 경계에만**(CLAUDE.md "고쳤다"의 정의) — DOM이 전혀 없는 이 함수들의
// 유일한 바깥 의존(`document.getElementById`/`querySelectorAll`로 입력칸·컨테이너를
// 거둬들이는 부분, `showToast`, `mcRenderUnitTabs`)만 최소 스텁으로 두고, 안쪽
// (`setProjectModelUnit`·`removeProjectModel`·`renderProjectModels`·
// `_mcPruneOrphanUnits`)은 js/22g의 **진짜 소스를 그대로** 돈다.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', '22g-name-autocomplete.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, why) {
    if (ok) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}

function makeSandbox() {
    const sandbox = {};
    sandbox.window = sandbox;
    // sum-models-container는 실제 kortek_pm.html에 항상 존재하는 정적 엘리먼트
    // (Summary 탭이 안 보여도 DOM에서 안 사라진다) — renderProjectModels()가 실제로
    // 그 안쪽(쓸어내기 포함)까지 실행되려면 이 id만큼은 진짜처럼 truthy해야 한다.
    const fakeContainer = { innerHTML: '' };
    sandbox.document = {
        getElementById: function (id) { return id === 'sum-models-container' ? fakeContainer : null; },
        querySelectorAll: function () { return []; } // 입력칸 없음 → _syncProjectModelsFromDom이 기존 tabData 그대로 반환
    };
    sandbox._fakeContainer = fakeContainer;
    sandbox._currentLang = 'ko';
    sandbox.mcActiveUnit = '';
    sandbox.mcRenderUnitTabs = function () { sandbox._mcRenderCalled = (sandbox._mcRenderCalled || 0) + 1; };
    sandbox.showToast = function (msg) { sandbox._lastToast = msg; };
    // getMcUnits는 js/22i-brief-mc-common-2.js가 정의하지만(같은 전역 스코프를 공유) —
    // 이 하네스는 js/22g 하나만 돌리므로, 실제 구현(js/22i:363)과 동일한 동작으로 직접 둔다.
    sandbox.getMcUnits = function () {
        sandbox.tabData = sandbox.tabData || {};
        sandbox.tabData.mcUnits = sandbox.tabData.mcUnits || [];
        return sandbox.tabData.mcUnits;
    };
    sandbox.escapeHtml = function (s) { return String(s == null ? '' : s); };
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: '22g-name-autocomplete.js' });
    return sandbox;
}

// ── 시나리오 1: 신고 1 그대로 — 모델 #1을 'MVD'에서 기존 'MVD(FHD)'로 재배정 ──
(function () {
    const w = makeSandbox();
    w.tabData = {
        mcUnits: ['MVD', 'MVD(FHD)'],
        projectModels: [{ unitId: 'MVD', 고객모델명: 'STELLAR32' }]
    };
    w.setProjectModelUnit(0, 'MVD(FHD)');

    check('재배정 후 "MVD"가 mcUnits에서 빠진다', w.tabData.mcUnits.indexOf('MVD') === -1);
    check('새로 고른 "MVD(FHD)"는 그대로 남는다', w.tabData.mcUnits.indexOf('MVD(FHD)') !== -1);
    check('모델 #1 카드는 이제 MVD(FHD)를 가리킨다', w.tabData.projectModels[0].unitId === 'MVD(FHD)');
    check('BOM/M.C/Customer SPEC/Document 쪽에 다시 그리라고 알린다', w._mcRenderCalled === 1);
})();

// ── 시나리오 2: 다른 카드가 아직 그 제품군을 쓰면 지우지 않는다(데이터 안전) ──
(function () {
    const w = makeSandbox();
    w.tabData = { mcUnits: ['MVD', 'TPR'], projectModels: [{ unitId: 'MVD' }, { unitId: 'MVD' }] };
    w._mcPruneOrphanUnits();
    check('아직 쓰는 카드가 있으면 "MVD"는 목록에 남는다', w.tabData.mcUnits.indexOf('MVD') !== -1);
    check('TPR은 아무 카드도 안 쓰므로 빠진다', w.tabData.mcUnits.indexOf('TPR') === -1);
})();

// ── 시나리오 3: 모델 카드를 통째로 삭제(✕)해도 그 유닛이 목록에서 빠진다 ──
(function () {
    const w = makeSandbox();
    w.tabData = {
        mcUnits: ['MVD(FHD)', 'MVD(QHD)', 'MVD(UHD)'],
        projectModels: [{ unitId: 'MVD(FHD)' }, { unitId: 'MVD(QHD)' }, { unitId: 'MVD(UHD)' }]
    };
    w.removeProjectModel(2);
    check('카드가 2개로 줄었다', w.tabData.projectModels.length === 2);
    check('삭제된 카드의 "MVD(UHD)"가 mcUnits에서 빠진다', w.tabData.mcUnits.indexOf('MVD(UHD)') === -1);
    check('남은 카드가 쓰는 유닛은 그대로 있다',
        w.tabData.mcUnits.indexOf('MVD(FHD)') !== -1 && w.tabData.mcUnits.indexOf('MVD(QHD)') !== -1);
})();

// ── 시나리오 4: 지워지는 유닛이 지금 활성(mcActiveUnit)이면 빈 값으로 리셋 ──
(function () {
    const w = makeSandbox();
    w.tabData = { mcUnits: ['MVD'], projectModels: [{ unitId: 'MVD(FHD)' }] };
    w.mcActiveUnit = 'MVD';
    w._mcPruneOrphanUnits();
    check('orphan "MVD"가 지워진다', w.tabData.mcUnits.indexOf('MVD') === -1);
    check('mcActiveUnit이 지워진 이름을 가리켰으면 리셋된다', w.mcActiveUnit === '');
})();

// ── 시나리오 5: idx===0(기본 모델) 카드는 removeProjectModel 자체가 막는다(기존 동작 불변) ──
(function () {
    const w = makeSandbox();
    w.tabData = { mcUnits: ['MVD'], projectModels: [{ unitId: 'MVD' }] };
    w.removeProjectModel(0);
    check('기본 모델(idx 0)은 삭제되지 않는다', w.tabData.projectModels.length === 1);
    check('기본 모델의 유닛도 그대로 남는다', w.tabData.mcUnits.indexOf('MVD') !== -1);
})();

// ── 시나리오 6: 신고 2 그대로 — 재배정을 "다시" 하지 않고 그냥 프로젝트를 열기만 해도
//    (= renderProjectModels() 호출 한 번만으로) 이미 박혀 있던 유령이 청소돼야 한다.
//    실제 신고 당시 데이터(사용자의 LNW(SG)_SSBT(FHD,QHD,UHD) 프로젝트)를 읽기 전용으로
//    확인한 값 그대로: mcUnits에 과거 "MVD"가 남아있고, 카드 3개는 전부 FHD/QHD/UHD.
(function () {
    const w = makeSandbox();
    w.tabData = {
        mcUnits: ['MVD', 'MVD(QHD)', 'MVD(FHD)', 'MVD(UHD)'], // 실제 신고 당시 파일 그대로
        projectModels: [
            { unitId: 'MVD(FHD)' },
            { unitId: 'MVD(QHD)' },
            { unitId: 'MVD(UHD)' }
        ]
    };
    w.renderProjectModels(); // setProjectModelUnit/removeProjectModel을 안 거치고 "그냥 열기"만 재현
    check('재배정을 다시 안 해도 렌더 한 번으로 "MVD"가 빠진다', w.tabData.mcUnits.indexOf('MVD') === -1);
    check('실제 쓰는 셋(FHD/QHD/UHD)은 그대로 있다',
        w.tabData.mcUnits.length === 3 &&
        ['MVD(FHD)', 'MVD(QHD)', 'MVD(UHD)'].every(function (u) { return w.tabData.mcUnits.indexOf(u) !== -1; }));
    check('카드를 실제로 그렸다(컨테이너에 내용이 들어갔다)', w._fakeContainer.innerHTML.indexOf('모델 #1') !== -1);
})();

console.log('\n통과 ' + pass + ' · 실패 ' + fail);
process.exitCode = fail ? 1 : 0;
