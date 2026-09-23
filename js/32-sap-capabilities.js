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

    // 📄 [2026-09-22 신규] 문서 별칭 사전(데이터) — 사람이 "문서 타입 코드" 대신 부르는 이름.
    //    "119531 승인원 조회해서 저장해줘"가 "문서/파일" 단어·P01 코드가 없어서 SAP 로컬 명령에 안 걸리고
    //    AI로 새던 문제(할당량만 소모). js/04h의 문서 열기/목록/배치/모호성 판정이 전부 이 목록을 읽는다
    //    — 새 별칭(예: "성적서"→Q11)이 확인되면 코드가 아니라 여기에 한 줄 추가.
    //    docType: 이 별칭이 가리키는 SAP 문서 타입(승인원=P01, docs/sap-lookup.md 패턴 다운로드 절에서 확인).
    window.SAP_DOC_ALIASES = window.SAP_DOC_ALIASES || [
        { word: '승인원', docType: 'P01' }
    ];

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
        { id: 'itemdesc', title: '품목 내역(품목/품목2)', titleEn: 'Item description', tcode: 'ZMM009 (품목2 요청 시 MM03)', mode: 'read', verified: 'live',
          kw: ['품목 내역', '품목내역', '품명', '자재 내역', '자재내역 보여', '품목2'], needs: '자재번호', ex: '133025 품목 내역 보여줘' },
        { id: 'approval', title: '승인원 표지 생성', titleEn: 'Approval cover sheet', tcode: 'MM03', mode: 'write-file', verified: 'live',
          kw: ['승인원 표지', '표지 생성', '가승인원', '승인원 만들'], needs: '자재번호', ex: '104446 승인원 표지 만들어줘' },
        { id: 'excel', title: '조회 결과 엑셀 저장', titleEn: 'Export lookup to Excel', tcode: '-', mode: 'write-file', verified: 'live',
          kw: ['엑셀로', 'excel', 'xlsx', '엑셀 출력', '엑셀 저장'], needs: '직전 조회 결과 또는 자재번호', ex: '엑셀로 저장해줘' },
        { id: 'po', title: '구매오더 요청(PDF → 발주)', titleEn: 'Purchase order request', tcode: 'ZMMR060 / ZMM018', mode: 'write', verified: 'partial',
          kw: ['구매오더', '발주', '세금계산서', '거래명세서', '견적서', '발주서'], needs: 'PDF 첨부', ex: '(세금계산서 PDF 첨부 후 전송)' },
        { id: 'screen', title: '현재 SAP 화면 읽기', titleEn: 'Read current SAP screen', tcode: '(열려 있는 화면)', mode: 'read', verified: 'live',
          kw: ['지금 화면', '현재 화면', '열려있는 화면', '열려 있는 화면', '화면 내용', '화면에 보이는'], needs: '없음(SAP에 미리 로그인)', ex: 'SAP 지금 화면 내용 요약해줘' },
        { id: 'teambudget', title: '팀 운영비/복리후생비 조회', titleEn: 'Team budget lookup', tcode: 'ZCO021', mode: 'read', verified: 'live',
          kw: ['팀비', '팀운영비', '팀 운영비', '복리후생비'], needs: '팀 이름(없으면 드롭다운으로 물어봄)', ex: '개발3팀 팀운영비 확인해줘' },
        { id: 'goodsreceipt', title: '자재 입고 처리', titleEn: 'Goods receipt processing', tcode: 'ZMM062', mode: 'write', verified: 'unverified',
          kw: ['입고 처리', '입고처리'], needs: '구매오더 번호(없으면 직전 발주 목록에서 고르거나 물어봄)', ex: '9100019479 입고 처리해줘' },
        { id: 'screendump', title: '화면 구조 덤프(개발용 진단)', titleEn: 'Screen tree dump (dev diagnostic)', tcode: '(열려 있는 화면)', mode: 'read', verified: 'live',
          kw: ['화면 덤프', '화면덤프', '트리 덤프', '화면 구조', '필드 id', '필드아이디'], needs: '없음(SAP에 미리 로그인 + 대상 화면 열어둠)', ex: 'SAP 화면 덤프해줘' },
        { id: 'materialprice', title: '표준가격/기간별단가 조회', titleEn: 'Standard/period price lookup', tcode: 'MM03', mode: 'read', verified: 'unverified',
          kw: ['표준가격', '표준 가격', '기간별단가', '기간별 단가', '기간별간가'], needs: '자재번호', ex: '106437 표준가격 기간별단가 확인해줘' },
        { id: 'sapcancel', title: '진행 중인 SAP 작업 중단', titleEn: 'Cancel a running SAP operation', tcode: '-', mode: 'control', verified: 'live',
          kw: ['중단', '그만', '멈춰', '스톱', 'stop', 'cancel'], needs: '없음(자재 여러 건 조회처럼 오래 걸리는 작업이 진행 중일 때)', ex: '그만' }
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

    // ── 앱 전체(SAP 외) 기능 카탈로그 + 연결(chain) 의도 표 — 2026-09-21, 사용자 요청 ────────────────────────
    // 🚩 신고의 "SAP 외 새 기능/연결 요청"과 자동 감지된 연결 요청(chain_unsupported)이 "이미 있는 앱 기능과 얼마나 비슷한가"를
    // 판정할 때 쓰는 비교 대상. 기능을 새로 만들면 여기에 한 줄 추가한다(→ 이후 재요청이 추적됨). SAP 기능은 SAP_CAPABILITIES 참고.
    window.APP_CAPABILITIES = window.APP_CAPABILITIES || [
        { id: 'mail_draft',  title: '메일 작성/발송(AI 문답 초안 → 확인 → 발송)', kw: ['메일 보내', '메일로 보내', '메일 작성', '메일 발송', '이메일 보내'], how: 'AI 문답 [[ACTION:MAIL_DRAFT]] → SEND_MAIL' },
        { id: 'gantt_add',   title: 'Gantt 업무 추가(초안 → 확인)',              kw: ['간트에 추가', '간트에 등록', '업무 추가', '업무 등록', 'gantt에 추가'], how: 'AI 문답 GANTT_ADD_DRAFT → APPLY_GANTT_ADD' },
        { id: 'gantt_edit',  title: 'Gantt 업무 수정(초안 → 확인)',              kw: ['업무 수정', '일정 변경', '담당자 변경', '상태 변경', '마감일 변경'], how: 'AI 문답 GANTT_EDIT_DRAFT → APPLY_GANTT_EDIT' },
        { id: 'alarm',       title: '알람 설정/해제(업무별)',                    kw: ['알람 설정', '알람 켜', '알람 꺼', '알람 해제'], how: 'AI 문답 SET_ALARM / CLEAR_ALARM' },
        { id: 'notice',      title: '공지 등록',                                 kw: ['공지 등록', '공지 올려', '공지사항'], how: 'AI 문답 NOTICE_DRAFT → REGISTER_NOTICE' },
        { id: 'project_open',title: '다른 프로젝트 조회/열기',                    kw: ['다른 프로젝트', '프로젝트 열어', '프로젝트 전환'], how: 'AI 문답 질문 대상 선택 / OPEN_PROJECT_TO_EDIT' },
        { id: 'inbox',       title: '업무 보관함 → 프로젝트 배분(다중 선택)',      kw: ['보관함', '다른 프로젝트로 전송', '배분'], how: 'AI 업무 보관함 [다른 프로젝트로 전송]' },
        { id: 'excel_save',  title: '조회 결과 엑셀 저장(C:\\SAP_DMS\\SAP조회)',   kw: ['엑셀로 저장', '엑셀 출력', '엑셀로 출력'], how: 'AI 문답 SAP 엑셀 내보내기(로컬 명령)' }
    ];
    window._qaMatchAppCapabilities = function (text) {
        var q = String(text || '').toLowerCase(), out = [];
        window.APP_CAPABILITIES.forEach(function (c) {
            var m = 0; c.kw.forEach(function (k) { if (q.indexOf(k) >= 0) m++; });
            if (m > 0) out.push({ id: c.id, title: c.title, score: Math.min(1, Math.round(m / 2 * 100) / 100) });
        });
        return out.sort(function (a, b) { return b.score - a.score; });
    };
    window._qaAppCapabilityCompactJson = function () {
        return JSON.stringify(window.APP_CAPABILITIES.map(function (c) { return { id: c.id, title: c.title, how: c.how }; }));
    };

    // 연결(chain) 의도 — "SAP 조회한 결과를 메일로/프로젝트에 등록" 같이 로컬 명령의 결과를 다른 기능으로 이어 달라는 표현.
    // 로컬 명령(엑셀 저장·패턴 조회 등)은 앞부분만 처리하고 뒷부분을 조용히 무시했다 — 그 뒷부분을 감지해 적립하는 데 쓴다.
    window.QA_CHAIN_INTENTS = window.QA_CHAIN_INTENTS || [
        { id: 'mail',     label: '메일로 보내기',            labelEn: 'Send by email',        re: /(메일|이메일|e-?mail)\s*(로|을|를)?\s*(좀\s*)?(보내|전송|발송|첨부)|(보내|전송|발송).{0,6}(메일|이메일)|메일로/i },
        { id: 'register', label: '프로젝트/Gantt에 등록',    labelEn: 'Register to project/Gantt', re: /(프로젝트|간트|gantt|업무\s*보관함).{0,10}(등록|추가|반영|올려|넣어)/i },
        { id: 'notify',   label: '알람/공지로 연결',          labelEn: 'Link to alarm/notice', re: /(알람|공지|텔레그램|telegram).{0,8}(등록|설정|보내|올려|알려\s*줘)/i }
    ];
    // ⭐ [2026-09-23 신규] 앱 범위 밖 주제 카탈로그 — AI를 부르지 않고 즉답할 질문들.
    //    근거(Phase 10 학습 자료 digest_20260923): "오늘 날씨 확인해줘"가 재질문 4회로 1위권
    //    클러스터였다. AI가 매번 "인터넷 검색을 이용하세요"라고 답했는데, 사람 입장에선 답이
    //    아니라서 계속 다시 물었고 그때마다 AI 호출(=하루 할당량)이 소진됐다.
    //    → 이런 주제는 "못 한다"가 이미 확정된 사실이므로, 데이터로 적어 두고 즉시 답한다.
    //    ⚠️ 하드코딩이 아니라 카탈로그다 — 새 주제가 생기면 여기 한 줄만 추가하고,
    //       반대로 앱이 그 기능을 갖게 되면 이 줄을 지우면 된다(코드는 그대로).
    //    오탐 방지: kw가 실제 업무 맥락(자재번호·#G·프로젝트/SAP 단어)과 같이 오면 발동하지 않고,
    //    질문이 짧을 때(기본 30자 이하)만 본다 — "날씨 때문에 납기 지연" 같은 문장은 통과시킨다.
    window.QA_OUT_OF_SCOPE = window.QA_OUT_OF_SCOPE || [
        { id: 'weather', kw: ['날씨', '기온', '미세먼지', '비 와', '비와', 'weather'],
          ko: '날씨는 이 앱이 다루지 않습니다 — 프로젝트 데이터·SAP·메일만 조회할 수 있어서 인터넷 날씨 서비스를 이용해주세요.',
          en: 'Weather is out of scope — this app only looks at project data, SAP and mail. Please use a weather service.' },
        { id: 'market', kw: ['환율', '주가', '주식 시세', '코스피', '비트코인'],
          ko: '환율·시세는 이 앱이 다루지 않습니다 — 프로젝트 데이터·SAP·메일만 조회할 수 있습니다.',
          en: 'Exchange rates and market prices are out of scope — this app only looks at project data, SAP and mail.' },
        { id: 'news', kw: ['뉴스', '오늘 이슈', '속보'],
          ko: '뉴스는 이 앱이 다루지 않습니다 — 프로젝트 데이터·SAP·메일만 조회할 수 있습니다.',
          en: 'News is out of scope — this app only looks at project data, SAP and mail.' }
    ];
    // 이 단어들이 같이 있으면 "업무 맥락"으로 보고 범위 밖 판정을 하지 않는다
    var _OOS_WORK_HINT = /#?G\d|\d{5,}|자재|프로젝트|업무|일정|간트|gantt|sap|메일|발주|구매|재고|알람|공지|보고/i;

    /** 범위 밖 질문이면 즉답 문구를, 아니면 null. (AI 호출 전에 확인) */
    window._qaOutOfScopeAnswer = function (text) {
        var q = String(text || '').trim();
        if (!q || q.length > 30) return null;          // 긴 문장은 업무 맥락일 가능성이 커서 건드리지 않음
        if (_OOS_WORK_HINT.test(q)) return null;
        var en = window._currentLang === 'en';
        for (var i = 0; i < window.QA_OUT_OF_SCOPE.length; i++) {
            var t = window.QA_OUT_OF_SCOPE[i];
            for (var j = 0; j < t.kw.length; j++) {
                if (q.toLowerCase().indexOf(String(t.kw[j]).toLowerCase()) !== -1) {
                    return (en ? t.en : t.ko) + (en
                        ? '\n\n(Answered without calling the AI — this saves your daily quota.)'
                        : '\n\n(AI를 부르지 않고 바로 답했습니다 — 하루 사용량을 아끼기 위함입니다.)');
                }
            }
        }
        return null;
    };

    window._qaDetectChain = function (text) {
        var q = String(text || '');
        return window.QA_CHAIN_INTENTS.filter(function (c) { return c.re.test(q); }).map(function (c) { return { id: c.id, label: c.label, labelEn: c.labelEn }; });
    };

    /** 같은 종류의 요청 시그니처 — 받는 사람·자재번호처럼 요청마다 달라지는 값에 흔들리지 않게, 가능하면 "연결 종류 + 매칭된 기능 id"로 만든다.
     *  (단어 기반 시그니처는 "박용훈에게 메일"과 "김철수에게 메일"을 다른 요청으로 갈랐다.) 매칭이 없으면 단어 기반으로 폴백. */
    window._qaSigFor = function (maskedQ, caps, chainIds) {
        var ids = (caps || []).filter(function (c) { return c.score >= 0.3; }).slice().sort(function (a, b) { return b.score - a.score || (a.id < b.id ? -1 : 1); })
            .slice(0, 2).map(function (c) { return c.id; }).sort().join('+');
        if (chainIds && chainIds.length) return 'chain:' + chainIds.slice().sort().join('+') + (ids ? '|' + ids : '');
        if (ids) return 'cap:' + ids;
        return window._qaIntentSig ? window._qaIntentSig(maskedQ) : '';
    };
})();
