/* 🎙️🗣 SAP 와일드카드 음성 구분자("별표"/"엔드") — 실제 함수로 돌리는 검증 (2026-11-04)
 *
 *   쓰는 법: 앱을 아무 페이지나 열어두고(window._ganttQaNormalizeSapWildcard가 로드돼 있으면 됨,
 *            AI 문답 창을 열 필요도 없음) 브라우저 콘솔에 이 파일 전체를 붙여넣는다.
 *
 * 왜 이 파일이 따로 있나
 * ──────────────────────
 * 사용자 제보: "음성으로 *를 부르기 어렵다 — KT 엔드 55 엔드 LNW 처럼 말하면 *KT*55*LNW*로
 * 자동인식해야 한다". js/32의 SAP_WILDCARD_SEPARATORS(데이터: 별표/엔드)를 js/04h의
 * window._ganttQaNormalizeSapWildcard가 읽어 sendGanttQaMessage 맨 앞에서 문장을 정규화한다.
 * ⚠️ 첫 구현은 정규식이 "구분자 뒤 Korean 글자 클래스"로 다음 단어(동사 "조회해줘")까지 통째로
 * 삼키는 버그가 있었다(실측으로 잡음, 유닛만 봤으면 못 잡았을 것) — 지금은 "내용어 바로 뒤에
 * 구분자가 있는 쌍만 확정 편입"하는 단어 배열 스캔으로 고쳤다. 가짜 없음 — 순수 함수라 바로
 * window._ganttQaNormalizeSapWildcard(text)를 호출해 실제 코드를 돈다.
 */
(function () {
    'use strict';
    var f = window._ganttQaNormalizeSapWildcard;
    if (typeof f !== 'function') { console.error('❌ window._ganttQaNormalizeSapWildcard 가 없습니다 — js/04h가 로드됐는지 확인하세요'); return; }

    var fails = 0, passes = 0;
    var ok = function (cond, label, extra) {
        if (cond) { passes++; console.log('%c ✅ ' + label, 'color:#1f7a3d'); }
        else { fails++; console.log('%c ❌ ' + label + (extra ? ' — ' + extra : ''), 'color:#c92a2a'); }
    };
    var eq = function (actual, expected, label) {
        ok(actual === expected, label, 'got "' + actual + '" expected "' + expected + '"');
    };

    // 1) 기본 — "엔드"로 3토큰, 매 토큰 뒤 구분자(사용자 원래 예시)
    eq(f('SAP에서 KT 엔드 55 엔드 LNW 엔드 조회해줘'), 'SAP에서 *KT*55*LNW* 조회해줘',
        '엔드 3토큰, 뒤에 동사 — 동사가 패턴에 안 딸려들어감(2026-11-04 1차 구현 버그)');

    // 2) "별표"도 똑같이 동작
    eq(f('SAP에서 KT 별표 55 별표 LNW 별표 프로젝트 조회해줘'), 'SAP에서 *KT*55*LNW* 프로젝트 조회해줘',
        '별표 구분자도 엔드와 동일하게 동작');

    // 3) 마지막 토큰에 구분자가 없으면 — 모호하므로 그 토큰은 패턴에 안 넣는다(동사를 삼키는 것보다 안전)
    eq(f('SAP에서 KT 엔드 55 엔드 LNW 찾아줘'), 'SAP에서 *KT*55* LNW 찾아줘',
        '마지막 토큰에 구분자 없으면 그 토큰은 제외(부분 와일드카드로 안전하게 축소)');

    // 4) 단어 하나뿐(구분자 없음) + SAP + 조회류 동사 → *단어*로 자동 감싸기
    eq(f('SAP에서 LNW 검색해줘'), 'SAP에서 *LNW* 검색해줘', '단일 토큰 자동 감싸기(프로젝트란 말 없어도 동작)');
    eq(f('SAP에서 LNW 프로젝트 조회해줘'), 'SAP에서 *LNW* 프로젝트 조회해줘', '단일 토큰 자동 감싸기("프로젝트" 있어도 동작)');

    // 5) 트랜잭션코드처럼 보이는 토큰(MM03)은 검색 패턴이 아니라 화면 코드이므로 감싸지 않음
    eq(f('SAP에서 MM03 조회해줘'), 'SAP에서 MM03 조회해줘', '트랜잭션코드(MM03)는 감싸지 않음');

    // 6) 이미 * 가 있으면 손대지 않음(사람이 직접 입력)
    eq(f('SAP에서 *G26* 프로젝트 코드 조회해줘'), 'SAP에서 *G26* 프로젝트 코드 조회해줘', '이미 *가 있으면 그대로 둠');

    // 7) SAP 언급이 없으면 전혀 관여하지 않음 — "엔드포인트"처럼 구분자 단어가 다른 단어의
    //    일부(띄어쓰기 없이 붙음)여도 안전(정확히 그 단어와 일치해야만 구분자로 인식)
    eq(f('오늘 할 일 엔드포인트 점검해줘'), '오늘 할 일 엔드포인트 점검해줘', 'SAP 언급 없으면 무관(엔드포인트도 오탐 없음)');

    // 8) 후보 토큰이 2개 이상이면 모호하므로 아무것도 감싸지 않음
    eq(f('SAP에서 LNW STELLAR 검색해줘'), 'SAP에서 LNW STELLAR 검색해줘', '후보 토큰 2개 이상이면 감싸지 않음(모호)');

    // 9) 토큰 수 확장(5개)도 정상 동작 — 체인 길이에 상한 없음
    eq(f('SAP에서 A 엔드 B 엔드 C 엔드 D 엔드 E 엔드 조회해줘'), 'SAP에서 *A*B*C*D*E* 조회해줘', '5토큰 체인도 정상 처리');

    // 10) 문장이 구분자로 바로 끝나도(뒤에 아무 말도 없어도) 안전
    eq(f('SAP에서 KT 엔드 55 엔드 조회해줘'), 'SAP에서 *KT*55* 조회해줘', '최소 2토큰 체인');

    console.log('\n🎙️ SAP 와일드카드 음성 구분자 검증 결과: ' + passes + '/' + (passes + fails) + ' 통과' + (fails ? ' ⚠️' : ' ✅'));
})();
