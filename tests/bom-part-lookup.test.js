// node tests/bom-part-lookup.test.js
//
// 🔎 BOM 부품 찾기(js/56) 검증 — "이 제품에 쓰인 패널/터치가 뭐냐"를 자재그룹으로 가르고,
//    DESC' RULE 이 정한 자리에서 이름을 뽑는 부분.
//
// ⚠️ 여기 쓰인 자재코드·모델명은 **전부 지어낸 값**이다. 저장소가 GitHub Pages 로 공개돼 있어
//    실제 BOM 을 넣을 수 없다(CLAUDE.md). 대신 **모양은 실물 그대로**다 —
//    2026-11-02 에 ZPP033 다단계 전개로 받은 실제 응답의 줄 구조(`[ N ]\t코드\t내역\t…`),
//    자재그룹 표기(`대분류/중분류`), ALV 가 내역을 자르며 남기는 끝의 `=` 까지 같다.
//
// 네트워크·SAP 없이 돈다. 가짜는 바깥 경계(window)에만 두고 안쪽은 js/56 진짜 코드를 쓴다.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'js', '56-bom-part-lookup.js');
const window = {};
// js/56 은 IIFE 라 그대로 평가하면 window 에 함수들이 달린다.
new Function('window', fs.readFileSync(SRC, 'utf8'))(window);

// 실제 응답과 같은 모양의 가짜 BOM — 패널은 **5단계 아래**, 터치는 1·2단계에 흩어져 있다.
const BOM = [
    '[SAP BOM 전개(ZPP033): 자재 999001, 플랜트 1000]',
    '',
    'STUFE\tIDNRK\tOJTXP\tMMSTA\tMENGE\tMMEIN\tWGBEZ60\tMTSTB',
    '[ 1     ]\t900101\tTSP CURVED>TOUCH,ZZ999TOUCH01,43",=\tX1\t1\tEA\t전장자재/TOUCH SCREEN MODULE\t관리자재',
    '[ 1     ]\t900102\tTAPE EMI>FAB-CN,-,-,30x70,0.12T,GRY,=\tP1\t4\tEA\t기구자재/GASKET\tMP 단계',
    '[ 1     ]\t900103\tPBA-M>POWER,ZZBOARD-9,V00,R0,PCA99901=\tX1\t1\tEA\tBD 반제품/PBA\t관리자재',
    '[ 2     ]\t900104\tIC_TCH>B,CAP,80CH,ZZ99TCTRL,3.0/3.6V,=\tX1\t1\tEA\t회로자재/IC-TOUCH CONTROLLER\t관리자재',
    '[ 2     ]\t900105\tG/PNL MOD>PC+GF10%,-,-,-,BLK,PAD,430,V1\tX1\t1\tEA\t기구자재/BM PART MODULE\t관리자재',
    '[ 5     ]\t900106\tFOG IPS>ZZ999PANEL-X9,3840X2160,-,-,VB=\tX1\t1\tEA\tDISPLAY/FOG\t관리자재',
    '[ 5     ]\t900106\tFOG IPS>ZZ999PANEL-X9,3840X2160,-,-,VB=\tX1\t1\tEA\tDISPLAY/FOG\t관리자재',
    '[ 1     ]\t900107\tFAN>ZZ99FAN,DC24V,80x80x25,2P\tX1\t1\tEA\t전장자재/FAN\t관리자재'
].join('\n');

let pass = 0, fail = 0;
function eq(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log('  ✓ ' + label); }
    else { fail++; console.log('  ✗ ' + label + '\n      got : ' + JSON.stringify(got) + '\n      want: ' + JSON.stringify(want)); }
}
const kindOf = id => window.BOM_PART_KINDS.find(k => k.id === id);
const namesOf = id => window._bomPickParts(BOM, kindOf(id)).map(h => h.name);

console.log('[1] 줄 파싱');
eq('부품 행만 읽는다(머리글·제목 줄 제외)', window._bomTextRows(BOM).length, 8)  // 부품 행 8줄(같은 자재 중복 1줄 포함);

console.log('[2] 자재그룹으로 종류 가르기');
// ⚠️ 이게 이 기능의 핵심 — 내역 글자가 아니라 자재그룹으로 가른다.
//    `G/PNL MOD`(기구물)에는 "PNL" 이 들어 있지만 패널이 아니고,
//    정작 패널 행 내역엔 "PANEL" 이라는 낱말이 없다.
eq('패널 = DISPLAY 대분류만, 같은 자재는 한 번만', namesOf('panel'), ['ZZ999PANEL-X9']);
eq('터치 = 모듈 + 컨트롤러', namesOf('touch'), ['ZZ999TOUCH01', 'ZZ99TCTRL']);
eq('기구물에 패널이 섞이지 않는다', window._bomGroupIsKind('기구자재/BM PART MODULE', kindOf('panel')), false);
eq('대분류만 쓴 패턴(포장자재/)', window._bomGroupIsKind('포장자재/LABEL', kindOf('packing')), true);
eq('중분류 이름만 쓴 패턴(FAN)', window._bomGroupIsKind('전장자재/FAN', kindOf('fan')), true);

console.log('[3] DESC\' RULE 자리에서 이름 뽑기');
// 자리가 종류마다 다르다 — FOG 는 0번째, TSP 는 1번째. 코드에 박으면 한쪽이 틀린다.
eq('FOG IPS → 0번째(제조사 품명)', window._bomPartNameOf('FOG IPS>ZZ999PANEL-X9,3840X2160,-'), 'ZZ999PANEL-X9');
eq('TSP CURVED → 1번째', window._bomPartNameOf('TSP CURVED>TOUCH,ZZ999TOUCH01,43"'), 'ZZ999TOUCH01');
eq('표에 없는 구분자는 지어내지 않는다', window._bomPartNameOf('ZZUNKNOWN>A,B,C'), null);
eq('`>` 가 없으면 null', window._bomPartNameOf('그냥 글자'), null);
eq('접두어가 더 긴 구분자를 먼저 맞춘다', window._bomPartNameOf('FOG>AA,BB'), 'AA');

console.log('[4] 질문에서 종류 찾기');
eq('패널명 확인', (window._bomPartKindHit('999001 제품에 사용된 패널명 확인해줘') || {}).id, 'panel');
eq('터치', (window._bomPartKindHit('999001 에 들어간 터치 뭐야') || {}).id, 'touch');
eq('부품 말이 없으면 안 걸린다', window._bomPartKindHit('999001 BOM 보여줘'), null);

console.log('[5] 결과 글');
const r = { material: '999001', kind: kindOf('panel'), hits: window._bomPickParts(BOM, kindOf('panel')), total: 8, raw: BOM };
const txt = window.bomPartLookupText(r);
eq('이름이 들어간다', txt.indexOf('ZZ999PANEL-X9') !== -1, true);
eq('내역을 같이 보여준다(이름만 믿지 않게)', txt.indexOf('FOG IPS>') !== -1, true);
eq('잘린 내역을 밝힌다', txt.indexOf('자른 것입니다') !== -1, true);
const none = window.bomPartLookupText({ material: '999001', kind: kindOf('speaker'), hits: [], total: 8, raw: BOM });
eq('0건이면 무엇이 있었는지 밝힌다', none.indexOf('DISPLAY/FOG') !== -1, true);

console.log('\n' + (fail ? '❌ ' + fail + '건 실패' : '✅ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
