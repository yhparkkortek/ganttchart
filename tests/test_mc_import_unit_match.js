// 🧪 M.C 불러오기 — 제목/파일명에서 뽑은 괄호 토큰이 기존 제품구분자와 겹치면 그 기존
// 이름을 그대로 제안하는지 검증 (2026-11-19, 사용자 제보 "FHD로 불러오면 QHD로 바뀌고
// 토글하면 데이터가 없어짐/저장이 안 됨" — 실측 원인: js/45 _suggestUnit).
// js/45-mc-import.js는 DOM/window IIFE라 그대로 못 불러온다. 같은 로직을 여기 복사해서
// 돌린다 — 소스가 바뀌면 이 파일도 같이 맞춰야 한다(손으로 비교).
'use strict';

function suggestUnit(cand, units) {
    var m = String(cand.file || '').match(/_([^_]+?)_MC\s*Table/i);
    var base = m ? m[1].trim() : '';
    if (!base) base = String(cand.title || '').replace(/^KGP-\d+\s*/i, '').trim();
    var pm = String(cand.sheet || '').match(/\(([^)]+)\)/);
    if (pm) base = (base + ' ' + pm[1]).trim();
    base = base || String(cand.sheet || '');

    if (units && units.length) {
        var tokenSrc = String(cand.title || '') + ' ' + String(cand.file || '');
        var tokens = tokenSrc.match(/\(([^)]+)\)/g) || [];
        for (var i = 0; i < tokens.length; i++) {
            var tok = tokens[i].toLowerCase();
            var hit = units.filter(function (u) { return String(u).toLowerCase().indexOf(tok) !== -1; });
            if (hit.length === 1) return hit[0];
        }
    }
    return base;
}

var fails = [];
function expect(label, actual, expected) {
    if (actual !== expected) fails.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

// 실측 재현: LNW(SG)_SSBT(FHD,QHD,UHD) 프로젝트 — 벤더 파일명에 "_MC Table"이 없고
// (실제론 "_MC_R1.xlsx"), 시트 "MODEL :" 제목에만 해상도가 괄호로 들어있다.
var existingUnits = ['MVD(QHD)', 'MVD(FHD)', 'MVD(UHD)'];

expect('FHD 파일 → 기존 MVD(FHD)로',
    suggestUnit({ file: '261116_LNW_27in_UK_SSBT_MVD(FHD)_MC_R1.xlsx', title: 'SSBT 27"_MVD_500nit(FHD)', sheet: 'R1' }, existingUnits),
    'MVD(FHD)');
expect('QHD 파일 → 기존 MVD(QHD)로',
    suggestUnit({ file: '261116_LNW_27in_UK_SSBT_MVD(QHD)_MC_R1.xlsx', title: 'SSBT 27"_MVD_500nit(QHD)', sheet: 'R1' }, existingUnits),
    'MVD(QHD)');
expect('UHD 파일 → 기존 MVD(UHD)로',
    suggestUnit({ file: '261116_LNW_27in_UK_SSBT_MVD(UHD)_MC_R1.xlsx', title: 'SSBT 27"_MVD_500nit(UHD)', sheet: 'R1' }, existingUnits),
    'MVD(UHD)');

// 기존 제품구분자가 아직 없으면(처음 불러오는 프로젝트) 예전처럼 제목 글자를 그대로 쓴다 —
// 동작을 바꾸지 않는다.
expect('기존 유닛이 없으면 제목 그대로',
    suggestUnit({ file: '261116_LNW_27in_UK_SSBT_MVD(FHD)_MC_R1.xlsx', title: 'SSBT 27"_MVD_500nit(FHD)', sheet: 'R1' }, []),
    'SSBT 27"_MVD_500nit(FHD)');

// 겹치는 후보가 2개 이상이면(모호함) 새로 추정하지 않고 손대지 않는다.
expect('토큰이 여러 유닛과 겹치면 기존 추정값 유지',
    suggestUnit({ file: '261116_LNW_27in_UK_SSBT_MVD(FHD)_MC_R1.xlsx', title: 'SSBT 27"_MVD_500nit(FHD)', sheet: 'R1' },
        ['MVD(FHD)', 'TPR(FHD)']),
    'SSBT 27"_MVD_500nit(FHD)');

// 표준 "_MC Table" 파일명(기존 지원 양식)은 그대로 동작 — 회귀 확인.
expect('"_MC Table" 양식은 그대로',
    suggestUnit({ file: 'KONAMI_55in MVD_MC Table_Rev01.xlsx', title: 'KGP-4 55in MVD', sheet: 'R1' }, []),
    '55in MVD');

if (fails.length) {
    console.error('FAIL (' + fails.length + '):');
    fails.forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
} else {
    console.log('PASS — 기존 제품구분자와 겹치는 해상도 토큰이 있으면 그 이름을 그대로 쓴다(유령 유닛 방지).');
}
