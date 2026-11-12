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
// 🆕 [2026-11-12] js/56 의 _bomTextRows 가 이제 js/38 의 진짜 파서(_bomParseSapText)를
//    그대로 쓴다(레이아웃 변경에 안전하게 열 이름으로 칸을 찾으려고) — 그래서 js/38 도
//    같이 로드한다. 가짜로 대신하면 "그 파서를 쓰는가"를 못 보고 테스트가 자기 자신을
//    테스트하게 된다(CLAUDE.md "안쪽을 가짜로 만들면 테스트가 자기 자신을 테스트한다").
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', '38-bom-tab.js'), 'utf8'))(window);
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

console.log('[6] 레이아웃 변경에도 올바른 칸을 읽는다 (2026-11-12 — BOM 탭 방식 상속)');
// 팀 공용 SAP 계정이라 누가 레이아웃의 **열 구성**을 바꾸면(새 열 삽입·순서 변경) 자재그룹(WGBEZ60)의
// 탭 위치가 달라진다. 예전 _bomTextRows는 p[6]을 무조건 자재그룹으로 읽어서 이럴 때 조용히
// 다른 칸을 읽었다 — 이제 _bomParseSapText(js/38)를 써서 **열 이름**으로 찾으므로 위치가 바뀌어도
// 맞는 칸을 읽어야 한다.
const BOM_REORDERED = [
    '[SAP BOM 전개(ZPP033): 자재 999001, 플랜트 1000]',
    '',
    // ⚠️ WGBEZ60 앞에 새 열(EXTRACOL)이 끼어들었다 — 누가 레이아웃에 열을 추가한 상황을 흉내 낸다.
    'STUFE\tIDNRK\tOJTXP\tMMSTA\tMENGE\tMMEIN\tEXTRACOL\tWGBEZ60\tMTSTB',
    '[ 5     ]\t900106\tFOG IPS>ZZ999PANEL-X9,3840X2160,-,-,VB=\tX1\t1\tEA\tSHOULD_NOT_BE_READ_AS_GROUP\tDISPLAY/FOG\t관리자재'
].join('\n');
eq('열이 밀려도 자재그룹은 이름으로 찾아 읽는다(위치 아님)',
   window._bomPickParts(BOM_REORDERED, kindOf('panel')).map(h => h.group), ['DISPLAY/FOG']);
eq('끼어든 열 값이 자재그룹으로 새지 않는다',
   window._bomPickParts(BOM_REORDERED, kindOf('panel')).some(h => h.group === 'SHOULD_NOT_BE_READ_AS_GROUP'), false);

console.log('[7] 레이아웃 진단 경고 (layoutApplied / sortInfo)');
// 이 조회는 트리 계층을 안 쓰지만, 레이아웃이 안 먹으면 WGBEZ60 자체가 빈 칸일 수 있어
// "없음"과 "레이아웃이 안 먹어서 못 봤음"을 구분하지 못하면 조용한 오답이 된다(BOM 탭과 같은 경고를 물려받는다).
const rOk = { material: '999001', kind: kindOf('panel'), hits: window._bomPickParts(BOM, kindOf('panel')), total: 8, raw: BOM, layoutApplied: true, sortInfo: null };
eq('레이아웃이 정상 적용되면 경고가 없다', window.bomPartLayoutWarning(rOk), '');
const rBad = { material: '999001', kind: kindOf('panel'), hits: window._bomPickParts(BOM, kindOf('panel')), total: 8, raw: BOM, layoutApplied: false, layoutDiag: 'not_in_catalog', sortInfo: null };
eq('레이아웃 적용 실패를 경고한다', window.bomPartLayoutWarning(rBad).indexOf('레이아웃을 적용하지 못했습니다') !== -1, true);
eq('실패 사유(layoutDiag)를 같이 보여준다', window.bomPartLayoutWarning(rBad).indexOf('not_in_catalog') !== -1, true);
const rSorted = { material: '999001', kind: kindOf('panel'), hits: window._bomPickParts(BOM, kindOf('panel')), total: 8, raw: BOM, layoutApplied: true, sortInfo: ['IDNRK ASC'] };
eq('정렬이 걸려 있으면 그 기준을 보여준다', window.bomPartLayoutWarning(rSorted).indexOf('IDNRK ASC') !== -1, true);
eq('경고가 0건 결과(bomPartLookupText)에도 붙는다',
   window.bomPartLookupText({ material: '999001', kind: kindOf('speaker'), hits: [], total: 8, raw: BOM, layoutApplied: false, layoutDiag: 'timeout' }).indexOf('레이아웃을 적용하지 못했습니다') !== -1, true);

console.log('\n' + (fail ? '❌ ' + fail + '건 실패' : '✅ 전부 통과') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
