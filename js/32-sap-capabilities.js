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

    // 📋 [2026-09-29 신규] 회사 SAP DMS 문서 종류 목록 (데이터) — 사용자가 제공한 화면 기준.
    //    inactive: true = "(미사용)" 항목. 새 종류가 추가/변경되면 코드가 아니라 이 목록만 갱신.
    //    — 트리거 인식(_sapHasDocCode), 드롭다운(_ganttQaShowDocTypeDropdown) 모두 이 목록 사용.
    window.SAP_DOC_TYPES = window.SAP_DOC_TYPES || [
        { code: 'C01', label: '부품포 (BOM)',         inactive: true  },
        { code: 'C02', label: '유체적 BOM',           inactive: true  },
        { code: 'C03', label: '거래선 스펙',           inactive: true  },
        { code: 'C04', label: '원자재 승인 결과서',     inactive: true  },
        { code: 'C05', label: '신뢰성 시험 의뢰서',     inactive: true  },
        { code: 'C06', label: '신뢰성 시험 결과서',     inactive: true  },
        { code: 'C07', label: '서비스 매뉴얼',         inactive: true  },
        { code: 'C08', label: '동작 매뉴얼',           inactive: true  },
        { code: 'C09', label: '제품 규격서',           inactive: true  },
        { code: 'C10', label: '규격 인증 요청서',       inactive: true  },
        { code: 'C11', label: '규격 인증 체크리스트',   inactive: true  },
        { code: 'C12', label: '규격 인증 완료 자료',    inactive: true  },
        { code: 'C13', label: '고객 요구사항 정리 자료', inactive: true  },
        { code: 'C14', label: '로크메락 스펙(제품)',    inactive: true  },
        { code: 'C15', label: 'CE Report',            inactive: true  },
        { code: 'C16', label: 'RM Template',          inactive: true  },
        { code: 'C17', label: 'ECR',                  inactive: true  },
        { code: 'C18', label: 'ECO',                  inactive: true  },
        { code: 'D02', label: '회로도',               inactive: true  },
        { code: 'D03', label: 'PCB Gerber Data',      inactive: true  },
        { code: 'D04', label: 'PCB JOB Data',         inactive: true  },
        { code: 'D05', label: '기구도',               inactive: true  },
        { code: 'D06', label: '조립도',               inactive: true  },
        { code: 'E01', label: 'SOP',                  inactive: false },
        { code: 'E02', label: 'JIG',                  inactive: false },
        { code: 'M01', label: '업재등록관리',           inactive: false },
        { code: 'P01', label: '원자재 승인 결과서',     inactive: false },
        { code: 'P02', label: '서비스 매뉴얼',         inactive: false },
        { code: 'P03', label: '동작 매뉴얼',           inactive: false },
        { code: 'P04', label: '제품 규격서',           inactive: false },
        { code: 'P05', label: '규격 인증 완료 자료',    inactive: false },
        { code: 'P06', label: '제품 로크메락 스펙',     inactive: false },
        { code: 'P07', label: 'ECO',                  inactive: false },
        { code: 'P08', label: '회로도',               inactive: false },
        { code: 'P09', label: 'PCB Gerber Data',      inactive: false },
        { code: 'P10', label: '기구도',               inactive: false },
        { code: 'P11', label: '최종 F/W',             inactive: false },
        { code: 'P12', label: '최종 EDID',            inactive: false },
        { code: 'P13', label: 'SOP',                  inactive: false },
        { code: 'Q11', label: '수입검사 기준서',        inactive: false },
        { code: 'Q12', label: '출하검사 기준서',        inactive: false },
        { code: 'S01', label: 'S/W, F/W 소스코드',    inactive: true  },
        { code: 'S02', label: 'S/W 라이브러리',        inactive: true  },
        { code: 'S03', label: 'S/W, F/W 요구상세스펙', inactive: true  },
        { code: 'S04', label: 'S/W, F/W 테스트문서',  inactive: true  },
        { code: 'S05', label: '양산 F/W',             inactive: true  },
        { code: 'S06', label: 'EDID',                 inactive: true  }
    ];

    // 🗂 [2026-09-28 신규, 사용자 지정] MB21의 사내 정식 업무는 **"계정대체청구"**다 — 프로젝트
    //    코드 조회는 그 화면을 빌려 쓰는 부수 용도일 뿐이고, 본 용도는 개발용 자재를 청구/반납해
    //    계정을 대체하는 것. 사람이 부르는 이름이 여러 개라 **코드가 아니라 이 표(데이터)**로 둔다 —
    //    새 표현이 나오면 여기 한 줄만 추가하면 로컬 명령/라우터가 같이 따라온다.
    //    ⚠️ 이동유형은 사내 설정값이라 표준 SAP 관례로 추측하면 틀린다(261을 넣었다가 SAP이
    //    "261에 대한 예약이 불가능합니다"로 거절한 실사례 — docs/sap-lookup.md 참고).
    //    [2026-10-02] title은 MB21 신규품목 화면(521)의 KM07R-BTEXT가 실제로 보여주는 문구로 맞췄다.
    //    defaultLgort = 그 이동유형의 기본 저장위치(951 원자재 청구=1000 자재창고 / 907 반납=5000).
    //    사용자가 자재 보관함에서 바꿀 수 있고(datalist), 비워 두면 이 값이 적용된다.
    window.SAP_MB21_MOVEMENT_TYPES = window.SAP_MB21_MOVEMENT_TYPES || [
        { bwart: '951', title: '연구개발 출고', titleEn: 'R&D goods issue', defaultLgort: '1000',
          kw: ['계정대체청구서', '계정대체', '자재청구서', '자재청구', '자재출고'] },
        { bwart: '907', title: '개발 입고처리', titleEn: 'Dev goods receipt', defaultLgort: '5000',
          kw: ['자재입고', '자재반납', '반납입고'] }
    ];

    // 🏭 [2026-10-02] 플랜트 / 저장위치 드롭다운 후보(데이터).
    //    자재 보관함은 이 목록을 <datalist>로 띄우므로 **목록에 없는 코드도 직접 입력**할 수 있다
    //    (해외 공장 등). 새 코드가 확정되면 코드가 아니라 여기에 한 줄만 추가할 것.
    //    ⚠️ VINA(해외) 플랜트 코드는 아직 확인 전 — 확인되면 아래에 추가.
    window.SAP_PLANTS = window.SAP_PLANTS || [
        { code: '1000', label: '코텍 송도 공장', labelEn: 'Kortek Songdo' }
    ];
    window.SAP_STORAGE_LOCATIONS = window.SAP_STORAGE_LOCATIONS || [
        { code: '1000', label: '자재창고 (951 기본)', labelEn: 'Material store (951 default)' },
        { code: '5000', label: '반납 입고 (907 기본)', labelEn: 'Return receipt (907 default)' }
    ];

    // 📏 [2026-10-02 덤프 확인] MB21 신규품목 화면(521)의 품목 그리드는 한 화면에 28행(RSPOS 1~28).
    //    보관함이 이보다 많으면 예약을 여러 건으로 나눠 생성한다(사용자 선택: 쪼개기).
    window.SAP_RESERVATION_MAX_ITEMS = window.SAP_RESERVATION_MAX_ITEMS || 28;
    /** 문장에서 MB21 이동유형을 고른다(없으면 null) — 결정론적, AI 호출 없음. */
    window._sapMb21MovementType = function (text) {
        var q = String(text || '').toLowerCase();
        var best = null;
        window.SAP_MB21_MOVEMENT_TYPES.forEach(function (m) {
            m.kw.forEach(function (k) {
                // 더 긴 표현이 더 구체적이므로 우선(예: "자재청구서" > "자재청구")
                if (q.indexOf(k.toLowerCase()) >= 0 && (!best || k.length > best.kwLen)) {
                    best = { bwart: m.bwart, title: m.title, kw: k, kwLen: k.length };
                }
            });
        });
        return best;
    };

    // 📐 [2026-10-02 신규, 사용자 요청] SAP 조회 결과 표시 레이아웃 — **데이터**.
    //    제보: "구매정보 레코드·변경이력처럼 출력이 사용자가 볼 수 없는 형태로 나와 뭐가 뭔지 모르겠다."
    //    원인은 표 모양이 아니라 **형태 선택**이었다 — 36컬럼 1행을 가로로 눕히면 어떻게 꾸며도 안 읽힌다.
    //    규칙(_ganttQaFormatSapRecord): 행 1건 && 컬럼 CARD_MIN_COLS 초과 → 세로 카드, 그 외 → 가로 표.
    //    primary = 카드/표에서 먼저 보여줄 컬럼 순서. 나머지는 "전체 보기"로 접힌다.
    //    새 SAP 조회가 생기면 코드가 아니라 여기에 한 줄만 추가할 것.
    window.SAP_RESULT_LAYOUT = window.SAP_RESULT_LAYOUT || {
        CARD_MIN_COLS: 8,
        // ⚠️ [2026-10-02 실데이터 확인] ZMM006 출력에서 실제 단가가 들어오는 칸은 NETPR_G이고
        //    NETPR·KBETR은 비어 있었다 — NETPR만 우선 컬럼에 두면 **단가가 접힌 영역으로 숨는다**.
        //    셋 다 앞에 둔다(빈 값은 렌더러가 자동으로 감춘다).
        purchaseinfo: { title: '구매정보 레코드', primary: [
            'LIFNR', 'NAME1', 'NETPR_G', 'NETPR', 'KBETR', 'WAERS', 'PEINH', 'BPRME', 'MEINS',
            'DATAB', 'DATBI', 'EKGRP', 'EKNAM', 'MATKL', 'WGBEZ',
            'APLFZ', 'NORBM', 'MINBM', 'WERKS', 'EKORG', 'ESOKZ_T',
            'INFNR', 'TELF1', 'ERDAT', 'CHDAT'] },
        chghist: { title: '상태변경이력', primary: [
            'OBJECTID', 'MAKTX', 'MTART', 'VALUE_NEW', 'UDATE'] }
    };

    window.SAP_CAPABILITIES = [
        { id: 'matcart', title: '자재 보관함 → 계정대체 청구서(MB21)', titleEn: 'Material cart → reservation (MB21)',
          tcode: 'MB21 → ZMM019', mode: 'write', verified: 'unverified',
          kw: ['자재 보관함', '자재보관함', '계정대체청구서', '자재청구서', '자재청구', '자재출고', '자재입고', '자재반납', '장바구니'],
          needs: '담아둔 자재 + 오더 + 코스트센터', ex: '🧺 담기로 모은 뒤 "청구서 만들기"' },
        { id: 'bom', title: 'BOM 전개', titleEn: 'BOM explosion', tcode: 'ZPP033 / ZPP038', mode: 'read', verified: 'live',
          kw: ['bom', '구성품', '부품구성', '전개', 'explosion'], needs: '자재번호', ex: '502572 BOM 보여줘' },
        { id: 'whereused', title: '사용처(역전개)', titleEn: 'Where-used', tcode: 'CS15 / ZPP046', mode: 'read', verified: 'live',
          kw: ['사용처', '역전개', '어디에 쓰', '어디 쓰', 'where-used', 'whereused'], needs: '자재번호', ex: '104446 사용처 조회해줘' },
        { id: 'matlist', title: '자재 리스트 조회', titleEn: 'Material list', tcode: 'ZMM009', mode: 'read', verified: 'unverified',
          kw: ['자재 리스트', '자재리스트', '자재 목록', 'zmm009'], needs: '자재번호(복수 가능)', ex: '133025,133026 엑셀 출력해줘' },
        { id: 'mardstock', title: '재고 수량 조회 (MB52+MM03)', titleEn: 'Stock quantity (MB52+MM03)', tcode: 'MB52 / MM03→회계1', mode: 'read', verified: 'unverified',
          kw: ['재고 수량', '재고수량', '재고 확인', '재고확인', '재고 조회', '재고조회', '가용 재고', '가용재고', 'lbkum', '일반평가', '수량 확인', '수량확인'],
          needs: '자재번호(복수 쉼표 가능)', ex: '301966 재고수량 확인해줘 / 301966,301967 재고 확인' },
        { id: 'matdocs', title: '자재 문서 열람(SAP 뷰어)', titleEn: 'Material documents (SAP viewer)', tcode: 'MM03', mode: 'read', verified: 'live',
          kw: ['문서 열', '문서 열람', '문서 목록', '첨부문서', 'p01 문서', '문서데이터', '원본 파일', '열람'], needs: '자재번호 (+문서타입 P01 등)', ex: '106188 P01 문서 열어줘 / 106188 P01 문서 열람' },
        { id: 'docbatch', title: '문서 저장(ZDMSR004 → C:\\SAP_DMS)', titleEn: 'Document save via ZDMSR004', tcode: 'ZDMSR004', mode: 'read', verified: 'live',
          kw: ['문서 저장', '문서 다운로드', '일괄 다운로드', '문서 일괄', '승인원 다운로드', '저장해줘', '받아줘'], needs: '자재번호 (단일 또는 복수)', ex: '133012 P01 문서 저장해줘 / 133012, 133010 문서 다운로드해줘' },
        { id: 'dms_lookup', title: 'DMS 문서번호 조회(ZDMSR004 조회전용)', titleEn: 'DMS document number lookup (ZDMSR004 read-only)', tcode: 'ZDMSR004', mode: 'read', verified: 'live',
          kw: ['문서번호 확인', '문서번호 조회', '문서 번호', '문서 있는지', '문서 없는', '문서 없음', '문서 있음', '문서 조회', 'dms 조회', 'cv04'],
          needs: '자재번호 (단수 또는 복수, 쉼표 구분) + 문서 타입(P01/P02 등)', ex: '501362 P02 문서번호 확인해줘 / 501362,501363 P02 문서 있는지 확인해줘 / P02 문서 없는 코드 알려줘' },
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
        // 🗣 [2026-09-28] 트리거 어휘는 **여기(데이터)에만** 둔다 — 예전엔 js/04h 안에 정규식으로
        //    박혀 있어서 "SAP 덤프해줘"처럼 조금만 달리 말하면 못 알아들었다(사용자 지적).
        //    새 표현이 나오면 이 kw 배열에 한 줄만 추가하면 로컬 명령이 바로 따라온다.
        { id: 'screendump', title: '화면 구조 덤프(개발용 진단)', titleEn: 'Screen tree dump (dev diagnostic)', tcode: '(열려 있는 화면)', mode: 'read', verified: 'live',
          kw: ['덤프', 'dump', '화면 구조', '화면구조', '화면 구성', '필드 id', '필드아이디', '필드 아이디', '컨트롤 id'],
          needs: '없음(SAP에 미리 로그인 + 대상 화면 열어둠)', ex: 'SAP 화면 덤프해줘 / SAP 덤프해줘' },
        { id: 'materialprice', title: '표준가격/기간별단가 조회', titleEn: 'Standard/period price lookup', tcode: 'MM03', mode: 'read', verified: 'unverified',
          kw: ['표준가격', '표준 가격', '기간별단가', '기간별 단가', '기간별간가',
               '현재가격', '현재 가격', '이동평균가', '이동 평균가',
               '가격 확인', '가격확인', '단가 확인', '단가확인', '단가 조회', '단가조회',
               '가격 조회', '가격조회', '가격 알려', '단가 알려'],
          needs: '자재번호(또는 BOM에서 조회된 이름)', ex: '106437 표준가격 확인해줘 / BY1 현재가격 확인해줘' },
        { id: 'projectcode', title: '프로젝트 코드(내부오더) 패턴 조회', titleEn: 'Project code lookup', tcode: 'MB21 (계정대체청구)', mode: 'read', verified: 'live',
          kw: ['프로젝트 코드', '프로젝트코드', '프로젝트 번호', '프로젝트명', '프로젝트 이름', '내부오더'],
          needs: '패턴(예: *G26* / *STELLAR*) — 코드(오더) 또는 프로젝트명(내역)으로 검색, 대소문자 구분',
          ex: '*G26* 26년도 프로젝트 코드 조회해줘 / *STELLAR* 프로젝트명으로 찾아줘' },
        // 반납 입고 전체 자동화 (MB21 907 → F00151 실전기, 2026-10-01 구현)
        { id: 'returnreceipt', title: '반납 입고 (MB21 907 + F00151 전기)', titleEn: 'Return goods receipt', tcode: 'MB21+F00151', mode: 'write', verified: 'live',
          kw: ['반납 입고', '반납입고', '자재 반납', '자재반납'],
          needs: '자재번호+수량(+단위/저장위치)+내부오더번호 (+텍스트 선택)',
          ex: '502573, 502574 각 2EA 반납 입고 — 오더 G2610OB, 저장위치 5000, 텍스트 LNW>STELLAR_32>반납',
          endpoint: '/sap-return-receipt' },
        // ⛔ 아직 미구현(적립용) — MB21 출고(951) 쪽. 반납(907)은 위 returnreceipt로 구현됨.
        { id: 'mb21posting', title: '계정대체청구(개발 자재 출고 951)', titleEn: 'Account reassignment request (issue)', tcode: 'MB21 (계정대체청구)', mode: 'write', verified: 'planned',
          kw: ['계정대체청구서', '계정대체', '자재청구서', '자재청구', '자재출고'],
          needs: '프로젝트코드·자재·수량 (출고 951)', ex: '(미구현) G2610OB 자재청구서 만들어줘' },
        { id: 'sapcancel', title: '진행 중인 SAP 작업 중단', titleEn: 'Cancel a running SAP operation', tcode: '-', mode: 'control', verified: 'live',
          kw: ['중단', '그만', '멈춰', '스톱', '패스', '완료', '다음', 'stop', 'cancel', 'pass', 'done', 'next'], needs: '없음(자재 여러 건 조회처럼 오래 걸리는 작업이 진행 중일 때)', ex: '그만' },
        { id: 'openfolder', title: 'SAP 저장 경로 폴더 열기', titleEn: 'Open SAP save folder', tcode: '-', mode: 'control', verified: 'live',
          kw: ['저장경로', '저장 경로', '저장위치', '저장 위치', '저장폴더', '저장 폴더', '어디 저장', '폴더 열', '경로 열', '폴더 위치',
               '저장된 거 확인', '파일 어디', '어디 있어', '어디 있나'],
          needs: '없음(컨텍스트로 폴더 자동 선택 — 승인원/발주서/BOM/P01 등 문서 코드 포함)',
          ex: '승인원 저장경로 열어줘 / 발주서 폴더 / P01 저장경로 열어줘 / P01 파일 어디 있어 / Q11 확인해줘' },
        // ── 2026-10-01 개발3팀 SAP 메뉴 미구현 항목 ──────────────────────────
        { id: 'bom_compare', title: 'BOM 비교 (CS14)', titleEn: 'BOM comparison (CS14)', tcode: 'CS14', mode: 'read', verified: 'live',
          kw: ['bom 비교', 'bom비교', '비교 bom', '두 자재 비교', '부품 비교', '구성품 비교', 'cs14'],
          needs: '자재번호 2개 (쉼표 구분)', ex: '502574, 502575 BOM 비교해줘' },
        { id: 'zco006a', title: '활동원가 구성별 표준원가 (ZCO006A)', titleEn: 'Standard cost by activity (ZCO006A)', tcode: 'ZCO006A', mode: 'read', verified: 'unverified',
          kw: ['표준원가', '활동원가', '원가 구성', '원가구성', 'zco006', '표준 원가'],
          needs: '자재번호 또는 패턴', ex: '502574 표준원가 확인해줘' },
        { id: 'mb23', title: '예약 조회 (MB23)', titleEn: 'Reservation display (MB23)', tcode: 'MB23', mode: 'read', verified: 'live',
          kw: ['예약 조회', '예약조회', '예약 확인', '예약확인', '예약 번호', '예약번호', '청구서 조회', 'mb23'],
          needs: '예약 번호 또는 프로젝트코드', ex: '1234567 예약 조회해줘' },
        { id: 'mm019', title: '자재 예약 리스트 (MM019)', titleEn: 'Material reservation list (MM019)', tcode: 'MM019', mode: 'read', verified: 'unverified',
          kw: ['예약 리스트', '예약리스트', '계정대체 출력', '청구서 목록', '청구서 리스트', 'mm019'],
          needs: '프로젝트코드 또는 조회 조건', ex: 'G2610OB 예약 리스트 출력해줘' },
        { id: 'migo', title: '자재 이동 (MIGO)', titleEn: 'Goods movement (MIGO)', tcode: 'MIGO', mode: 'write', verified: 'unverified',
          kw: ['자재 이동', '자재이동', '이동 유형', '이동유형', 'migo', '자재 전기'],
          needs: '이동 유형 + 자재번호 + 수량', ex: '(미구현) MIGO 자재 이동' },
        { id: 'mb22', title: '예약 변경 (MB22)', titleEn: 'Reservation change (MB22)', tcode: 'MB22', mode: 'write', verified: 'unverified',
          kw: ['예약 변경', '예약변경', '예약 수정', '예약수정', 'mb22'],
          needs: '예약 번호', ex: '(미구현) 1234567 예약 변경해줘' },
        { id: 'zmmr060b', title: 'VINA 연구소 구매오더 생성 (ZMMR060B)', titleEn: 'VINA lab PO creation (ZMMR060B)', tcode: 'ZMMR060B', mode: 'write', verified: 'unverified',
          kw: ['vina', '비나', '연구소 발주', '베트남 발주', 'zmmr060b'],
          needs: 'PDF 첨부', ex: '(미구현) VINA 연구소 구매오더 만들어줘' },
        { id: 'zcor054', title: '개발비 집계 Report (ZCOR054)', titleEn: 'R&D cost summary (ZCOR054)', tcode: 'ZCOR054', mode: 'read', verified: 'unverified',
          kw: ['개발비', '개발비 집계', '개발비집계', 'zcor054', 'co 개발비', '연구개발비'],
          needs: '프로젝트코드 또는 기간', ex: 'G2610OB 개발비 집계 확인해줘' },
        { id: 'zpp023', title: '자재마스터 유통형황 조회 (ZPP023)', titleEn: 'Material master distribution (ZPP023)', tcode: 'ZPP023', mode: 'read', verified: 'unverified',
          kw: ['유통 형황', '유통형황', '유통 현황', '유통현황', 'zpp023'],
          needs: '자재번호', ex: '502574 유통형황 확인해줘' },
        { id: 'zco037', title: '자재마스터 변경이력 (ZCO037)', titleEn: 'Material master change history (ZCO037)', tcode: 'ZCO037', mode: 'read', verified: 'live',
          kw: ['변경이력', '변경 이력', '자재 이력', '자재이력', '마스터 변경', 'zco037'],
          needs: '자재번호', ex: '502574 변경이력 확인해줘' },
        { id: 'co03', title: '생산 오더 조회 (CO03)', titleEn: 'Production order display (CO03)', tcode: 'CO03', mode: 'read', verified: 'live',
          kw: ['생산오더', '생산 오더', '제조오더', '제조 오더', 'co03'],
          needs: '생산 오더 번호 또는 자재번호', ex: '1000012345 생산오더 조회해줘' },
        { id: 'coois', title: '생산오더정보시스템 (COOIS)', titleEn: 'Production order information system (COOIS)', tcode: 'COOIS', mode: 'read', verified: 'live',
          kw: ['생산 정보', '생산정보', '오더 현황', '오더현황', 'coois', '생산오더 목록', '생산오더목록'],
          needs: '자재번호 또는 기간', ex: '502574 생산오더 현황 확인해줘' },
        { id: 'zsd027', title: '납품 내역 관리 (ZSD027)', titleEn: 'Delivery history (ZSD027)', tcode: 'ZSD027', mode: 'read', verified: 'live',
          kw: ['납품', '납품내역', '납품 내역', '출하', '출하내역', '판매납품', 'zsd027'],
          needs: '판매오더 번호 또는 자재번호', ex: '502574 납품 내역 확인해줘' },
        { id: 'zmm005', title: '공급업체 리스트 (ZMM005)', titleEn: 'Vendor list (ZMM005)', tcode: 'ZMM005', mode: 'read', verified: 'unverified',
          kw: ['공급업체', '공급 업체', '공급자', '협력사', '벤더', 'vendor', 'zmm005'],
          needs: '자재번호 또는 업체명/사업자번호', ex: '502574 공급업체 조회해줘' },
        { id: 'zmm006', title: '구매 정보 레코드 조회 (ZMM006)', titleEn: 'Purchasing info record (ZMM006)', tcode: 'ZMM006', mode: 'read', verified: 'live',
          kw: ['구매 정보', '구매정보', '구매정보레코드', '구매 정보 레코드', '인포레코드', 'zmm006', '최근 납품가'],
          needs: '자재번호', ex: '502574 구매 정보 레코드 조회해줘' }
    ];

    /** 🆕 [2026-09-28] 어떤 기능의 트리거 어휘(kw)가 문장에 있는지 — 로컬 명령이 **정규식을 코드에
     *  박는 대신** 이 함수로 카탈로그(데이터)를 읽게 하기 위한 공용 판정기.
     *  공백 유무 차이("화면 덤프"/"화면덤프")는 양쪽 공백을 지워서 함께 인정한다. */
    window._sapCapKwHit = function (text, capId) {
        var q = String(text || '').toLowerCase();
        var qFlat = q.replace(/\s+/g, '');
        var cap = (window.SAP_CAPABILITIES || []).find(function (c) { return c.id === capId; });
        if (!cap) return false;
        return cap.kw.some(function (k) {
            var kk = String(k).toLowerCase();
            return q.indexOf(kk) >= 0 || qFlat.indexOf(kk.replace(/\s+/g, '')) >= 0;
        });
    };

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
