// 🧪 업무 보관함/프로젝트 목록 그룹 라벨("model" 필드) — 단일모델 프로젝트인데 "고객 모델명"
// 칸에 숫자+하이픈 코드(PN 등)가 들어있으면 코드 그대로 라벨로 새는지 검증 (2026-11-19, 사용자
// 제보 "164994 로 필터 이름을 쓰고있음" / "STELLAR는 고쳤는데 확대 적용이 안 됨" — 실측 원인:
// js/04c buildProjectIndexEntry의 model 폴백이 "모델이 여러 개"일 때만 고객사 칸의 프로젝트명을
// 우선했고, 모델이 하나뿐인 LNW_SHUFFLER(고객모델명="1640994-ALT1")는 그대로 번호가 샜다).
// js/04c-core-app-mail-pipeline.js는 DOM/window IIFE라 그대로 못 불러온다 — 같은 로직을 복사해서
// 돌린다(소스가 바뀌면 이 파일도 같이 맞춰야 한다).
'use strict';

function computeModel(pm, customerProjectParts, hasMultiModel) {
    var custPart = customerProjectParts.join(' ');
    var repName = pm.모델명 || pm.고객모델명 || '';
    if (hasMultiModel) return custPart || pm.프로젝트명 || repName || '';
    var looksLikeCode = /^\d{5,}[-_]/.test(String(repName).trim());
    if (looksLikeCode && custPart) return custPart;
    return repName || pm.프로젝트명 || custPart || '';
}

var fails = [];
function expect(label, actual, expected) {
    if (actual !== expected) fails.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

// 실측 재현: LNW_SHUFFLER_04.3 — 고객사>프로젝트명 "LNW>SHUFFLER", 고객모델명 "1640994-ALT1".
expect('SHUFFLER(단일모델, 숫자+하이픈 코드) → 고객사 칸의 프로젝트명',
    computeModel({ 고객모델명: '1640994-ALT1' }, ['SHUFFLER'], false), 'SHUFFLER');

// 고객사 칸에 프로젝트명 세그먼트가 없으면(예: "고객사" 한 단어뿐) 폴백할 게 없어 번호 그대로.
expect('고객사 세그먼트가 없으면 번호 그대로(손댈 게 없음)',
    computeModel({ 고객모델명: '1640994-ALT1' }, [], false), '1640994-ALT1');

// 정상적으로 읽을 수 있는 이름이면 그대로 — 동작 불변(회귀).
expect('STELLAR32(정상 이름)은 그대로',
    computeModel({ 고객모델명: 'STELLAR32' }, ['STELLAR32'], false), 'STELLAR32');
expect('KGP-4(글자로 시작)는 코드로 안 봄',
    computeModel({ 고객모델명: 'KGP-4' }, ['KGP-4'], false), 'KGP-4');
expect('AMUSNET 55J-R1500(숫자 2자리뿐)은 코드로 안 봄',
    computeModel({ 고객모델명: '55J-R1500' }, ['AMUSNET'], false), '55J-R1500');

// 모델이 여러 개인 기존 분기(2026-11-12 수정)는 손대지 않았다 — 회귀 확인.
expect('다중모델 기존 동작 불변',
    computeModel({ 모델명: '1641445-ALT1' }, ['STELLAR32'], true), 'STELLAR32');

if (fails.length) {
    console.error('FAIL (' + fails.length + '):');
    fails.forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
} else {
    console.log('PASS — 단일모델 프로젝트도 고객모델명이 순수 코드처럼 보이면 고객사 칸의 프로젝트명을 그룹 라벨로 쓴다.');
}
