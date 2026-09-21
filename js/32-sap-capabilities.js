/* ════════════════════════════════════════════════════════════════════
   Phase 11 — SAP 기능 카탈로그 (2026-09-21)
   설계: docs/qa-router-and-sap-learning.md

   "지금 이 앱이 SAP로 할 수 있는 일"의 기계가 읽는 단일 원본(source of truth).
   쓰임새
   1) 질문 라우터(33번)가 SAP 여부를 판정할 때의 어휘집
   2) "아직 지원하지 않는 SAP 요청"에 대한 안내(지원 목록/가장 비슷한 기능)
   3) 학습 적립(31번)이 새 요청이 기존 기능의 변형인지 신규 후보인지 판정할 때의 비교 대상
   기능을 새로 구현하면 여기에 항목을 추가한다 — 그러면 이후 비슷한 요청은 "구현됨 이후 재요청"으로 추적된다.
   kw는 "그 기능만의 구체적인 단어"만 넣을 것(조회/자재/문서 같은 일반어는 프로젝트 질문과 섞여 오분류를 만든다).
   verified: live(실환경 검증) | partial(일부만) | unverified(구현만, 실환경 미검증)
   ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    window.SAP_CAPABILITIES = [
        { id: 'bom', title: 'BOM 전개', titleEn: 'BOM explosion', tcode: 'ZPP033 / ZPP038', mode: 'read', verified: 'live',
          kw: ['bom', '구성품', '부품구성', '전개', 'explosion'], needs: '자재번호', ex: '502572 BOM 보여줘' },
        { id: 'whereused', title: '사용처(역전개)', titleEn: 'Where-used', tcode: 'CS15 / ZPP046', mode: 'read', verified: 'live',
          kw: ['사용처', '역전개', '어디에 쓰', '어디 쓰', 'where-used', 'whereused'], needs: '자재번호', ex: '104446 사용처 조회해줘' },
        { id: 'matlist', title: '자재 리스트 조회', titleEn: 'Material list', tcode: 'ZMM009', mode: 'read', verified: 'unverified',
          kw: ['자재 리스트', '자재리스트', '자재 목록', 'zmm009'], needs: '자재번호(복수 가능)', ex: '133025,133026 엑셀 출력해줘' },
        { id: 'matdocs', title: '자재 문서 목록/열기', titleEn: 'Material documents', tcode: 'MM03', mode: 'read', verified: 'live',
          kw: ['문서 열', '문서 목록', '첨부문서', 'p01 문서', '문서데이터', '원본 파일'], needs: '자재번호 (+문서타입 P01 등)', ex: '106188 P01 문서 열어줘' },
        { id: 'docbatch', title: '문서 일괄 다운로드', titleEn: 'Batch document download', tcode: 'ZDMSR004', mode: 'read', verified: 'live',
          kw: ['일괄 다운로드', '문서 다운로드', '문서 일괄', '승인원 다운로드'], needs: '자재번호 2개 이상', ex: '133012, 133010 문서 다운로드해줘' },
        { id: 'descpattern', title: '자재내역 패턴 조회 / 일괄 다운로드', titleEn: 'Description pattern search', tcode: 'MM60 (F4 검색도움말)', mode: 'read', verified: 'partial', wildcard: true,
          kw: ['패턴', '와일드카드', '자재내역', '조회된 아이템', '내역으로 검색'], needs: '패턴(예: SMAJ12A*)', ex: 'SMAJ12A* 조회해줘 / *01+01*150*로 조회된 아이템 승인원 다운로드해줘' },
        { id: 'itemdesc', title: '품목 내역(품목/품목2)', titleEn: 'Item description', tcode: 'MM03', mode: 'read', verified: 'live',
          kw: ['품목 내역', '품목내역', '품명', '자재 내역', '자재내역 보여', '품목2'], needs: '자재번호', ex: '133025 품목 내역 보여줘' },
        { id: 'approval', title: '승인원 표지 생성', titleEn: 'Approval cover sheet', tcode: 'MM03', mode: 'write-file', verified: 'live',
          kw: ['승인원 표지', '표지 생성', '가승인원', '승인원 만들'], needs: '자재번호', ex: '104446 승인원 표지 만들어줘' },
        { id: 'excel', title: '조회 결과 엑셀 저장', titleEn: 'Export lookup to Excel', tcode: '-', mode: 'write-file', verified: 'live',
          kw: ['엑셀로', 'excel', 'xlsx', '엑셀 출력', '엑셀 저장'], needs: '직전 조회 결과 또는 자재번호', ex: '엑셀로 저장해줘' },
        { id: 'po', title: '구매오더 요청(PDF → 발주)', titleEn: 'Purchase order request', tcode: 'ZMMR060 / ZMM018', mode: 'write', verified: 'partial',
          kw: ['구매오더', '발주', '세금계산서', '거래명세서', '견적서', '발주서'], needs: 'PDF 첨부', ex: '(세금계산서 PDF 첨부 후 전송)' },
        { id: 'screen', title: '현재 SAP 화면 읽기', titleEn: 'Read current SAP screen', tcode: '(열려 있는 화면)', mode: 'read', verified: 'live',
          kw: ['지금 화면', '현재 화면', '열려있는 화면', '열려 있는 화면', '화면 내용', '화면에 보이는'], needs: '없음(SAP에 미리 로그인)', ex: 'SAP 지금 화면 내용 요약해줘' }
    ];

    var STOP = {};
    ('해줘 해주세요 해봐 알려줘 알려주세요 보여줘 보여주세요 조회 조회해줘 조회해 좀 그리고 하고 이거 그거 저거 있어 없어 뭐야 뭔가 대해 대한 관련 정보 내용 확인 해줄래 줄래 주세요 the a an of to')
        .split(' ').forEach(function (w) { STOP[w] = 1; });

    /** 질문과 각 기능의 유사도(0~1). 구체적 키워드 일치 수 기반 — 결정론적이라 AI 호출이 없다. */
    window._qaMatchCapabilities = function (text) {
        var q = String(text || '').toLowerCase();
        var hasWild = /[^\s,]*\*[^\s,]*/.test(q) && q.replace(/[^\s,]*\*[^\s,]*/g, '').length < q.length;
        var out = [];
        window.SAP_CAPABILITIES.forEach(function (c) {
            var m = 0;
            c.kw.forEach(function (k) { if (q.indexOf(k) >= 0) m++; });
            if (c.wildcard && hasWild) m += 1.5;
            if (m > 0) out.push({ id: c.id, title: c.title, score: Math.min(1, Math.round(m / 2 * 100) / 100) });
        });
        out.sort(function (a, b) { return b.score - a.score; });
        return out;
    };

    /** "같은 종류의 요청"끼리 묶기 위한 의도 시그니처 — 부품번호/패턴/숫자는 자리표시자로 바꿔서
     *  "SMAJ12A* 조회"와 "SMBJ5.0A* 조회"가 같은 요청으로 묶이게 한다. */
    window._qaIntentSig = function (text) {
        var t = String(text || '').toLowerCase();
        t = t.replace(/[^\s,]*\*[^\s,]*/g, ' 〈패턴〉 ').replace(/[a-z]*\d[a-z0-9_.\-+]*/g, ' 〈코드〉 ').replace(/#+/g, ' 〈번호〉 ');
        var seen = {}, words = [];
        t.split(/[\s,.!?~()\[\]"'`:;\/]+/).forEach(function (w) {
            if (!w || STOP[w]) return;
            if (w.length < 2 && w.charAt(0) !== '〈') return;
            if (!seen[w]) { seen[w] = 1; words.push(w); }
        });
        return words.sort().slice(0, 5).join('+');
    };

    /** 사람이 읽는 지원 목록(안내문/AI 프롬프트용). */
    window._qaCapabilityListText = function (en) {
        return window.SAP_CAPABILITIES.map(function (c) {
            return '• ' + (en ? (c.titleEn || c.title) : c.title) + ' [' + c.tcode + '] — ' + (en ? 'e.g. ' : '예) ') + c.ex;
        }).join('\n');
    };
    window._qaCapabilityCompactJson = function () {
        return JSON.stringify(window.SAP_CAPABILITIES.map(function (c) { return { id: c.id, title: c.title, tcode: c.tcode, needs: c.needs, mode: c.mode, verified: c.verified }; }));
    };
})();
