// node tests/project-index-multimodel.test.js
//
// 🔎 buildProjectIndexEntry(js/04c)의 멀티모델 대표 라벨/키워드 — 사용자 제보 2건 이어보기
//
// 1차(topic-profile-multimodel.test.js): AI가 생성하는 topicKeywords가 모델#1만 담던 문제.
// 2차(이 파일): 그 1차 수정 뒤에도 "모델이 여러 개면 대표 모델명 대신 고객사>프로젝트명을
// 쓰라고 했는데 아직도 모델#1 번호(1641445-ALT1)를 쓴다"는 재제보 — buildProjectIndexEntry의
// `model` 필드(업무 보관함 그룹 라벨 등에 쓰임)와 `keywords`(Stage 1 후보 필터링)가 여전히
// pm.모델명/pm.고객모델명(모델#1)만 읽고 있었다.
//
// 네트워크 없이 돈다. 소스는 js/04c에서 실제 함수 하나만 잘라 돌린다(복제 아님) —
// CLAUDE.md "안쪽을 가짜로 만들면 테스트가 자기 자신을 테스트한다".

'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', '04c-core-app-mail-pipeline.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, why) {
    if (ok) { pass++; console.log('  ✅ ' + name); }
    else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}

/** 소스에서 `window.<name> = ...` 한 덩어리를 잘라 온다(끝은 들여쓰기 4칸 `};`). */
function slice(name) {
    const head = SRC.indexOf('window.' + name + ' = ');
    if (head < 0) throw new Error('함수를 못 찾음: ' + name);
    const end = SRC.indexOf('\n    };', head);
    if (end < 0) throw new Error('끝을 못 찾음: ' + name);
    return SRC.slice(head, end + '\n    };'.length);
}

function makeFn() {
    const win = {
        projectMeta: {}, tabData: { projectMaterials: [] },
        _parseMailKeywords: function () { return []; },
        _msIsKnownPersonName: function () { return false; },
        _getTopicProfile: function () { return null; }
    };
    // buildProjectIndexEntry 내부에서 **지역함수**(window. 아님) `_inchFromFileName`을 맨이름으로
    // 직접 부른다 — 같은 new Function 스코프에 똑같은 이름의 최상위 함수 선언을 같이 넣어준다.
    const stubInch = 'function _inchFromFileName(fileName) { return ""; }\n';
    const code = stubInch + slice('buildProjectIndexEntry');
    new Function('window', code)(win);
    return win.buildProjectIndexEntry;
}
const build = makeFn();

// 실측 재현: LNW>STELLAR32 — 모델#1 1641445-ALT1(LOWER), 모델#2 1644113-ALT1(UPPER),
// 모델#3 1647180-13P50(TOPPER). pm.고객사 칸엔 "고객사>프로젝트명"이 한 칸에 들어간다(f4a08ad).
const STELLAR32_PM = {
    고객사: 'LNW>STELLAR32',
    모델명: '1641445-ALT1', 고객모델명: '1641445-ALT1', 프로젝트명: 'LNW>S32>LOWER',
    models: [
        { 고객모델명: '1641445-ALT1', 프로젝트코드: 'G2608OB', 프로젝트명칭: 'LNW>S32>LOWER', KTKPN: '502574' },
        { 고객모델명: '1644113-ALT1', 프로젝트코드: 'G2610OB', 프로젝트명칭: 'LNW>S32>UPPER', KTKPN: '502573' },
        { 고객모델명: '1647180-13P50', 프로젝트코드: 'G2609OB', 프로젝트명칭: 'LNW>S32>TOPPER', KTKPN: '502572' }
    ]
};

console.log('[1] 모델이 여러 개 — 대표 라벨은 모델#1 번호가 아니라 고객사>프로젝트명 기준');
const entryMulti = build('fileid1', 'LNW_STELLAR32.json', STELLAR32_PM, []);
check('model이 "1641445-ALT1"이 아니다(모델#1로 대표시키지 않음)', entryMulti.model !== '1641445-ALT1', 'got=' + entryMulti.model);
check('model에 프로젝트명(STELLAR32)이 들어간다', entryMulti.model.indexOf('STELLAR32') !== -1, 'got=' + entryMulti.model);

console.log('[2] 모델이 여러 개 — keywords에 모델#2/#3 식별자도 들어간다(Stage 1 필터링용)');
check('모델#2 고객모델명(1644113-ALT1) 포함', entryMulti.keywords.indexOf('1644113-ALT1') !== -1);
check('모델#3 고객모델명(1647180-13P50) 포함', entryMulti.keywords.indexOf('1647180-13P50') !== -1);
check('모델#3 명칭(LNW>S32>TOPPER) 포함', entryMulti.keywords.indexOf('LNW>S32>TOPPER') !== -1);
check('모델#1 번호도 여전히 포함(모델#1 메일도 계속 잡혀야 함)', entryMulti.keywords.indexOf('1641445-ALT1') !== -1);

console.log('[3] 모델이 1개뿐인 프로젝트 — 기존 동작 불변(모델 번호를 대표 라벨로 그대로 씀)');
const SINGLE_PM = {
    고객사: 'ABC>WIDGET', 모델명: '999001', 고객모델명: '999001', 프로젝트명: 'ABC>WIDGET>MAIN',
    models: [{ 고객모델명: '999001', 프로젝트코드: 'X1', 프로젝트명칭: 'ABC>WIDGET>MAIN', KTKPN: '700001' }]
};
const entrySingle = build('fileid2', 'ABC_WIDGET.json', SINGLE_PM, []);
check('모델 1개면 그 모델 번호를 그대로 쓴다(기존 동작 불변)', entrySingle.model === '999001', 'got=' + entrySingle.model);

console.log('[4] models 필드 자체가 없는 옛 프로젝트(이 수정 전 저장분) — 역시 불변');
const LEGACY_PM = { 고객사: 'XYZ>FOO', 모델명: '555001', 고객모델명: '555001', 프로젝트명: 'XYZ>FOO>M1' };
const entryLegacy = build('fileid3', 'XYZ_FOO.json', LEGACY_PM, []);
check('models 없는 옛 프로젝트는 모델 번호를 그대로 쓴다', entryLegacy.model === '555001', 'got=' + entryLegacy.model);

console.log('\n' + (fail ? ('❌ ' + fail + ' 건 실패') : '✅ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
