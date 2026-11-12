// node tests/topic-profile-multimodel.test.js
//
// 🔎 토픽 프로파일(js/26) — 멀티모델 프로젝트의 keywords 프롬프트 보강 — `window._tpMultiModelNote`
//
// 배경(2026-11-12, 사용자 제보): 프로젝트 파일 하나에 모델이 여러 개(예: LNW>STELLAR32의
// 모델#1 1641445-ALT1/LOWER, 모델#2 1644113-ALT1/UPPER, 모델#3 1647180-13P50/TOPPER)일 때,
// Summary의 `collectTabData()`(js/22g)는 하위호환을 위해 모델#1만 단일값 필드(pm.모델명 등)에
// 반영한다 — 그래서 토픽 프로파일 AI 프롬프트도 모델#1 식별자만 알았고, keywords에도 모델#1만
// 담겨 메일이 "Stellar Topper"(모델#3)를 얘기해도 js/61 근거 인용 검증이 이 프로젝트를 특정하는
// 단어를 못 찾아 자동배치가 "중" 신뢰도로 보류됐다(실측).
//
// 고친 것: js/22g가 pm.models(모델별 고객모델명/명칭/KTKPN)를 추가로 채우고, js/26이 그걸 읽어
// 프롬프트에 "각 모델 식별자를 keywords에 전부 포함하라"는 지시를 덧붙인다 — `_tpMultiModelNote`.
//
// 네트워크·AI 없이 돈다 — 순수 문자열 조립 로직만 검증.

const fs = require('fs');
const path = require('path');

const window = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', '26-topic-profile.js'), 'utf8'))(window);

let pass = 0, fail = 0;
function eq(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + '\n      got : ' + JSON.stringify(got) + '\n      want: ' + JSON.stringify(want)); }
}
function has(label, text, needle) {
    const ok = String(text || '').indexOf(needle) !== -1;
    if (ok) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + '\n      (문자열에 ' + JSON.stringify(needle) + ' 없음)\n      got: ' + text); }
}

const STELLAR32_MODELS = [
    { 고객모델명: '1641445-ALT1', 프로젝트코드: 'G2608OB', 프로젝트명칭: 'LNW>S32>LOWER', KTKPN: '502574', KTK모델명: 'KTS320DPS01' },
    { 고객모델명: '1644113-ALT1', 프로젝트코드: 'G2610OB', 프로젝트명칭: 'LNW>S32>UPPER', KTKPN: '502573', KTK모델명: 'KTS320DGS01' },
    { 고객모델명: '1647180-13P50', 프로젝트코드: 'G2609OB', 프로젝트명칭: 'LNW>S32>TOPPER', KTKPN: '502572', KTK모델명: 'KTK320DGS02' }
];

console.log('[1] 모델이 1개 이하면 아무것도 덧붙이지 않는다(기존 동작 그대로)');
eq('models 없음', window._tpMultiModelNote({}), '');
eq('models 빈 배열', window._tpMultiModelNote({ models: [] }), '');
eq('models 1개', window._tpMultiModelNote({ models: [STELLAR32_MODELS[0]] }), '');

console.log('[2] 모델이 여러 개면 각 모델의 식별자를 전부 보여주고 keywords 지시를 덧붙인다');
const note = window._tpMultiModelNote({ models: STELLAR32_MODELS });
has('모델#1 고객모델명(1641445-ALT1) 포함', note, '1641445-ALT1');
has('모델#2 고객모델명(1644113-ALT1) 포함', note, '1644113-ALT1');
has('모델#3 고객모델명(1647180-13P50) 포함', note, '1647180-13P50');
has('모델#3 명칭(TOPPER) 포함', note, 'LNW>S32>TOPPER');
has('모델#2 명칭(UPPER) 포함', note, 'LNW>S32>UPPER');
has('"모델#1 식별자만 넣지 말고" 지시 포함', note, '모델#1 식별자만 넣지 말고');
has('모델 개수(3개)를 명시', note, '모델이 3개');

console.log('[3] 고객모델명·명칭이 둘 다 빈 모델 카드는 셈에서 제외된다(새 모델 추가 직후 빈 카드)');
const withEmpty = window._tpMultiModelNote({
    models: STELLAR32_MODELS.concat([{ 고객모델명: '', 프로젝트코드: '', 프로젝트명칭: '', KTKPN: '', KTK모델명: '' }])
});
eq('빈 카드를 더해도 결과가 동일(3개 기준 그대로)', withEmpty, note);

console.log('\n' + (fail ? ('✗ ' + fail + ' 건 실패') : '✓ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
