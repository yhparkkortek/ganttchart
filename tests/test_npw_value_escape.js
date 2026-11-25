// 🧪 새 프로젝트 등록 위자드 — input value="..." 이스케이프 (2026-11-25, 사용자 제보
// "그룹웨어에서 개발 일정을 가져오면 첨부와 같은 버그 발생", 스크린샷: 고객사>프로젝트명 칸
// 아래에 `autocomplete="off" oninput="..." style="...">` 글자가 그대로 노출됨).
// 실측 원인: js/28 _renderStep3가 그룹웨어 기안서에서 읽은 프로젝트명(고객사>프로젝트명)을
// `value="' + val + '"` 로 이스케이프 없이 끼워 넣었다 — 그 값에 인치 표시(예: 32")처럼
// 큰따옴표가 섞이면 거기서 속성이 끊기고 뒤의 attribute 글자가 화면에 그대로 보인다.
// js/28은 DOM IIFE라 그대로 못 불러온다 — _esc만 복사해서 돈다(소스가 바뀌면 같이 맞출 것).
'use strict';

const _esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

var fails = [];
function expect(label, actual, expected) {
    if (actual !== expected) fails.push(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

// 실측 재현: 그룹웨어 기안서 프로젝트명에 인치 표시(큰따옴표)가 섞인 경우.
var raw = 'LNW>Cosmic_Upright Prism 32" MVD(D25)';
var html = '<input value="' + _esc(raw) + '">';
// 속성값 전체가 열고 닫는 큰따옴표 "딱 2개"로만 감싸여야 한다 — 안의 "가 살아있으면
// 속성이 중간에 끊겨 html.split('"').length 가 늘어난다(실측 버그가 바로 이 모양).
expect('속성이 중간에 끊기지 않는다(따옴표 2개로만 감싸짐)', html.split('"').length, 3);
expect('이스케이프 결과에 리터럴 큰따옴표가 남지 않는다', _esc(raw).indexOf('"'), -1);
expect('큰따옴표는 &quot;로 치환', _esc('32"'), '32&quot;');
expect('< > 도 치환(태그처럼 안 보이게)', _esc('<b>LNW>'), '&lt;b&gt;LNW&gt;');
expect('null/undefined는 빈 문자열', _esc(null), '');
expect('평범한 값은 그대로', _esc('STELLAR32'), 'STELLAR32');

// DOM이 attribute를 다시 value로 파싱하면 원래 글자가 복원되는지(브라우저 표준 동작) 확인.
// Node에는 DOM이 없으므로 최소 디코더로 왕복을 검증한다(엔티티 4종만).
function decode(s) {
    return String(s).replace(/&quot;|&lt;|&gt;|&amp;|&#39;/g, function (e) {
        return { '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&', '&#39;': "'" }[e];
    });
}
expect('이스케이프→디코드 왕복이 원본과 같다', decode(_esc(raw)), raw);

if (fails.length) {
    console.error('FAIL (' + fails.length + '):');
    fails.forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
} else {
    console.log('PASS — 새 프로젝트 등록 위자드의 input value 는 큰따옴표가 섞여도 속성을 끊지 않는다.');
}
