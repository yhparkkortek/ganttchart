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

console.log('[3-b] 이름이라고 내놓으면 안 되는 것 (2026-11-02 사용자 지적으로 보강)');
// 아래 구분자들은 **실제 카탈로그에 있는 값**이다 — 표가 정한 대로 동작하는지 본다.
eq('보드명이 0번째인 PBA-T', window._bomPartNameOf('PBA-T>ZZBOARD-9,R0,V20'), 'ZZBOARD-9');
// 예전엔 PBA-T 가 표에 이름 칸이 없다고 보고 **접두어 `PBA` 규칙을 끌어다** PCB 버전(V20)을 답했다.
eq('이름 칸 없는 구분자는 접두어로 끌어오지 않는다(기구물)', window._bomPartNameOf('G/PNL MOD>PC+GF10%,-,-,-,BLK,PAD'), null);
// `조립부품명`이 "품명"으로, `제조사`가 "제조사 품명"으로 오탐돼 PAD·제조사코드를 이름이라 답했었다.
eq('제조사만 있는 칸은 이름이 아니다(BLU)', window._bomPartNameOf('LGP MOD>ZZMFR,PMMA,LENTI,2.0T'), null);
eq('빈 칸 표시 `-` 는 이름이 아니다', window._bomPartNameOf('FOG IPS>-,3840X2160,-'), null);
eq('ALV 가 자른 조각(끝의 =)은 이름이 아니다', window._bomPartNameOf('FOG IPS>ZZTRUNCA='), null);

console.log('[4] 질문에서 종류 찾기');
eq('패널명 확인', (window._bomPartKindHit('999001 제품에 사용된 패널명 확인해줘') || {}).id, 'panel');
eq('터치', (window._bomPartKindHit('999001 에 들어간 터치 뭐야') || {}).id, 'touch');
eq('부품 말이 없으면 안 걸린다', window._bomPartKindHit('999001 BOM 보여줘'), null);

console.log('[4-b] 구분자 이름으로 바로 묻기 (2026-11-02 사용자 실제 질문)');
// "999001 제품에 사용된 HN VBY1 명 확인해줘" — HN VBY1 은 종류가 아니라 **내역 구분자**다.
// kw 에 없어서 이 기능이 아예 안 걸렸고 질문이 SAP 일반 경로로 샜다(앱에서 실측).
eq('구분자 이름을 집는다', window._bomSepHit('999001 제품에 사용된 HN VBY1 명 확인해줘'), 'HN VBY1');
eq('가장 긴 구분자를 고른다', window._bomSepHit('999001 에 쓰인 TSP CURVED ASSY 뭐야'), 'TSP CURVED ASSY');
eq('짧은 키는 아무 문장에나 걸리지 않는다(PC·BM·ETC)', window._bomSepHit('이 제품 PC 랑 BM 알려줘'), null);
eq('남의 말 안에 걸린 건 제외', window._bomSepHit('FOGGY 한 화면'), null);
eq('공정·관리용 구분자는 제외', window._bomSepHit('999001 SERVICE 내역'), null);
// 구분자로 고르면 자재그룹이 아니라 **내역 구분자**로 가른다.
const sepKind = window._bomSepKind('FOG IPS');
eq('구분자로 그 행만 고른다', window._bomPickParts(BOM, sepKind).map(h => h.code), ['900106']);
eq('구분자는 접두어로도 받는다(FOG → FOG IPS)',
   window._bomPickParts(BOM, window._bomSepKind('FOG')).map(h => h.name), ['ZZ999PANEL-X9']);
// 임시 종류엔 PARTS 구분이 없다 → 자재그룹으로 **진짜 종류**를 찾아 행에 달아야 📄 사양서 칩이 나온다.
eq('행에는 진짜 종류가 달린다', window._bomPickParts(BOM, sepKind)[0].kind.id, 'panel');
eq('자재그룹 → 종류 되찾기', (window._bomRealKindFor('전장자재/FAN') || {}).id, 'fan');

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
