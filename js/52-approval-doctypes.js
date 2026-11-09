// 📋 [2026-10-22 신규] 전자결재 **문서 종류** 카탈로그 — AI 문답이 어느 양식인지 스스로 고른다
//
//  ■ 왜 만들었나
//    "기안 작성해줘"만으로는 어느 양식인지 알 수 없어서, 사람이 매번 참고 문서번호를 손으로
//    집어줘야 했다(실사용: "RD3-2610-046 문서 참고하고…", "RD3-2610-036 해봅시다").
//    kw 만 보던 04h 는 어떤 기안 요청이든 '원자재 승인 결과서' 하나로 샜다(문서 220176 사고).
//    → 양식을 **말에서 판정**하고, 틀로 쓸 문서는 **결재함에서 런타임에 찾는다.**
//
//  ■ 근거 (추측 아님)
//    최근 결재문서 50건의 양식 분포를 세고, 양식마다 문서 1건을 `/gw/approval/read` 로 실제로
//    열어 **칸 이름**을 받아 적었다(2026-10-22). `sampled` 가 그 근거 문서번호다.
//    최근 50건은 25개 양식에 퍼져 있고, 코드등록 계열 4종이 22건(44%)으로 가장 많다.
//
//  ■ 설계 원칙 (CLAUDE.md)
//    · 어휘·칸 이름은 **데이터**다 — 판정에 정규식을 쓰지 않는다(`_qaKwSeqHit` 재사용).
//    · 틀로 쓸 문서번호를 **하드코딩하지 않는다** — `_apvLatestDocOf()` 가 결재함에서 찾는다.
//      문서는 매주 쌓이므로 박아두면 그 순간부터 과거를 가리킨다.
//    · 못 읽은 건 `fields: null` 로 **모른다고 표시**한다. 빈 배열(= 칸이 없다)과 다른 뜻이다.
//    · 이 파일은 읽기/판정만 한다. 실제 작성은 js/47(미리보기 → 사람 승인 → 임시저장).
(function () {
    'use strict';

    var BACKEND = 'http://127.0.0.1:5000';
    var _norm = function (s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); };

    // ── 📚 문서 종류 카탈로그 (데이터) ─────────────────────────────────
    //   form    : 그룹웨어가 돌려주는 **양식 이름 그대로**(판정·조회에 이 문자열을 쓴다)
    //   kw      : 사람이 이 양식을 부를 때 쓰는 말. `_qaKwSeqHit` 이 조사·간격 변형을 흡수하므로
    //             "프로젝트 코드 등록" 하나로 "프로젝트코드를 등록하는 기안"까지 걸린다.
    //   notKw   : 이 말이 있으면 이 양식이 **아니다**(공유 어휘 차단용)
    //   fields  : 실측한 칸 이름. null = 아직 안 읽음(모른다). [] = 읽었는데 칸이 안 잡힘.
    //   needs   : 사람이 같이 줘야 채울 수 있는 것
    //   sampled : 칸 이름을 확인한 근거 문서번호
    window.APPROVAL_DOC_TYPES = window.APPROVAL_DOC_TYPES || [
        {
            form: '프로젝트코드 등록 신청서',
            kw: ['프로젝트 코드 등록', '프로젝트코드 등록', '프로젝트 코드 신청', '프로젝트코드 신청',
                 '프로젝트 코드 기안', '프로젝트코드 기안', '프로젝트 등록 신청'],
            needs: '지금 열린 프로젝트(명칭·고객사). 프로젝트 코드는 새로 채번하는 값이라 비워둔다.',
            sampled: 'RD3-2609-077',
            fields: ['프로젝트 코드', '프로젝트 명칭', '프로젝트 Description', '고객사', '착수년도',
                     'Start', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'F/S 코드',
                     '개발비 구분', '개발팀장', '과제리더', '참여연구원']
        },
        {
            form: '제품코드 등록 신청서',
            kw: ['제품코드 등록', '제품 코드 등록', '제품코드 신청', '제품 코드 신청',
                 '제품코드 기안', '제품 코드 기안'],
            // ⚠️ '원자재'·'반제품'·'회로'·'PBA' 가 있으면 아래 코드등록 계열이다 — 제품코드가 아니다.
            notKw: ['원자재', '반제품', '회로', 'pba'],
            needs: '지금 열린 프로젝트 + Customer SPEC(패널인치·패널타입·터치타입 등). 자재번호를 주면 SAP 내역도 채운다.',
            sampled: 'RD3-2610-046',
            fields: null   // 이 양식은 js/47 매핑으로 먼저 만들었다 — 칸 전수는 아직 안 받아 적음
        },
        {
            form: '원자재/반제품 코드등록신청서',
            kw: ['원자재 코드 등록', '원자재 코드등록', '반제품 코드 등록', '반제품 코드등록',
                 '원자재 등록 신청', '반제품 등록 신청', '기구 자재 코드 등록'],
            notKw: ['승인원', '승인 결과서', '회로', 'pba'],
            needs: '자재번호(있으면 SAP 내역·자재그룹을 채운다). 새로 채번하는 코드면 비워둔다.',
            sampled: 'RD3-2609-050',
            fields: ['자재 코드', 'Description', '자재그룹 No.', '제조사', '구분', '개발형태 (기구물)',
                     '내작/외작', '단가 (KRW, \\)', '소요량 단위', '납기일', 'BOM 종속 예정일',
                     '도급/무상 사급여부', '등록 요청자', '비고']
        },
        {
            form: '회로 원자재/PBA 코드 등록 신청서',
            kw: ['회로 원자재', '회로 코드 등록', 'pba 코드 등록', 'pba 등록 신청', '회로 자재 등록'],
            notKw: ['승인원', '승인 결과서'],
            needs: '자재번호(있으면 SAP 내역·자재그룹을 채운다). 공급사·제조사는 자재마다 달라 원본을 물려받지 않는다.',
            sampled: 'RD3-2609-074',
            fields: ['자재 코드', 'Description', '자재그룹 No.', '제조사', '공급사', '공급사코드',
                     '구분', '단가 (KRW, \\)', '소요량 단위', '납기일', '최소 주문수량', '최소 포장수량',
                     '도급/무상 사급여부', '등록 요청자', '비고']
        },
        {
            form: 'DMS 등록 신청서',
            kw: ['dms 등록', 'dms 신청', 'dms 문서 등록', 'dms 기안', 'dms 변경 신청'],
            needs: '자재/제품 번호와 주요모델명. DMS 문서번호는 사람이 채운다.',
            sampled: 'RD3-2610-022',
            fields: ['1. 자재/제품 번호', '2. DMS 문서번호', '3. 구분', '주요모델명', '문서유형', '사유']
        },
        {
            form: '개발품 자재상태 전환 요청서',
            kw: ['자재상태 전환', '자재 상태 전환', '상태전환 요청', '상태 전환 요청',
                 'p0 전환', '개발품 상태 전환'],
            needs: '제품코드와 요청 자재상태(예: E3 P0 Z1). 전환 예정일은 사람이 정한다.',
            sampled: 'RD3-2609-084',
            fields: ['제품코드', '제품 Description명', '요청 자재상태', 'P0 전환 예정일', '등록예정일',
                     'DMS', '공유 문서 Check List', '문서명', '문서유형', '구분']
        },
        {
            form: 'E.C.O',
            // ⚠️ 'eco' 세 글자만으로는 영문 단어 안에서 걸린다 — 반드시 한정사와 붙여 적는다.
            kw: ['e.c.o', 'eco no', 'eco 기안', 'eco 작성', 'eco 발행', '설계변경 통보'],
            needs: 'ECR 문서번호와 자재번호. 등급·적용방식·목적구분은 판단이 필요해 비워둔다.',
            sampled: 'RD3-2608-010',
            // 한·베트남 2개 국어 양식이다 — 칸 이름에 베트남어가 붙어 있어 그대로 적는다.
            fields: ['ECO NO', 'ECR 문서 번호', '자재번호 Số NVL', '자재상태', '현재버전 Phiên bản hiện tại',
                     '내역', 'Type', '구분 Phân loại', '등급 Cấp', '목적구분 Phân loại mục đích',
                     '적용 생산지 Nơi áp dụng', '적용방식 Thời điểm áp dụng',
                     '요구 시행일 Thời điểm yêu cầu', '사유 Lý do']
        },
        {
            form: '원자재 승인 결과서',
            kw: ['원자재 승인원', '원자재 승인 결과서', '승인 결과서'],
            notKw: ['표지'],          // '표지'는 SAP 쪽 기능(붙일 파일)이다 — GW_CAPABILITIES 와 같은 판정
            needs: '자재번호. SAP 내역 + 공급업체(ZMM006→LIFNR→ZMM005)까지 자동으로 채운다.',
            sampled: 'RD3-2610-046',
            fields: ['Item Code', 'Model', 'Item Group No', 'Sub Description', 'Date',
                     'Name', 'Address', 'Tel', 'Customer', 'Rev.No', 'Summary', 'Remark'],
            // 이 양식만 04h 에 **전용 흐름**이 있다 — 틀 문서 없이도 처음부터 만들어 준다.
            direct: '<자재번호> 원자재 승인원 기안 작성해줘'
        },
        {
            form: 'Artwork&PCB 제작발주 의뢰서',
            kw: ['artwork 발주', 'pcb 제작 발주', 'pcb 발주 의뢰', 'artwork 의뢰'],
            needs: '-',
            sampled: 'RD3-2609-075',
            // ⚠️ 실제로 읽었는데 입력칸이 **0개**로 나왔다. 이 양식은 editorForm 구조가 달라
            //    칸 단위 매핑을 못 한다 — 틀로 쓰면 '그대로 복사'만 된다. 모르는 척하지 않고 적어 둔다.
            fields: [],
            note: '입력칸을 못 읽었다(양식 구조가 다름) — 틀로 쓰면 원본 값 그대로 복사만 된다.'
        },

        // ───────────────────────────────────────────────────────────────
        // 🧪 [2026-11-09 추가] 한 프로젝트(LNW Slim Slot iDeck 15.6")의 전자결재 45건을
        //    전수로 훑어, 아래 양식들의 칸 이름을 **문서를 실제로 읽어** 받아 적었다.
        //    근거 문서번호는 각 항목의 `sampled`. 추측으로 적은 칸은 하나도 없다.
        // ───────────────────────────────────────────────────────────────

        // ⚠️⚠️ '기안서' 는 **양식이 아니라 봉투다.** 실측: 한 프로젝트의 '기안서' 7건이
        //    [시제품 제작의뢰서] 4건 · 표준원가/E2 BOM(비용) 3건으로 **전혀 다른 문서**였다.
        //    formName 만 보면 셋이 한 덩어리가 되므로 **제목 접두어까지** 봐야 한다
        //    (사내 관행으로 이미 `[...]` 를 붙인다 — 45건 중 20건).
        {
            form: '기안서',
            titlePrefix: ['시제품 제작의뢰서'],
            kw: ['시제품 제작의뢰서', '시제품 제작 의뢰서', '시제품 의뢰 기안', '시제품 제작 기안'],
            needs: '지금 열린 프로젝트(코드·제품코드·모델명·담당자) + Summary 주요자재. '
                 + '수량·출고처·일정은 사람이 정한다.',
            sampled: 'RD3-2604-016 / RD3-2512-010',
            // ⚠️⚠️ 이 양식은 값이 **입력칸(fields)에 없다** — fields 는 문서번호·작성일 등
            //    시스템이 채우는 5개뿐이고, 실제 내용 30칸이 전부 **본문 표**(bodyFields)에 있다.
            //    그래서 아래 목록은 `bodyFields` 의 칸 이름이다(js/47 이 본문 경로로 채운다).
            bodyForm: true,
            fields: [],
            bodyFields: ['프로젝트 코드', '제품 코드', '모 델 명', 'B U Y E R',
                         '모델 담당자', '기구 담당자', 'FW 담당자',
                         '개발 단계', '제작 회차', '총 제작수량', '출고 수량', '출고 요청일',
                         '조립 예상일', '제작 기간', 'X', 'Y', 'Lv', 'FW Ver', 'EDID CHECK SUM',
                         'LCM(Panel) 코드', 'LCM(Panel) 부품 명', 'LCM(Panel) 비고',
                         'A/D Board 코드', 'A/D Board 부품 명',
                         'Converter 코드', 'Converter 부품 명',
                         'TSP(Glass) 코드', 'TSP(Glass) 부품 명',
                         'TSP CTRL 코드', 'TSP CTRL 부품 명'],
            note: '본문이 표인 양식 — 값이 fields 가 아니라 bodyFields 에 있다.'
        },
        {
            form: '단계별 DR 회의록',
            kw: ['dr 회의록', 'dvr 회의록', '단계별 dr', '회의록 기안', 'dr 회의 기안'],
            needs: '지금 열린 프로젝트(코드·과제명·모델). 시간·장소·내용·일정은 회의 고유값이라 사람이 쓴다.',
            sampled: 'RD3-2606-023',
            fields: ['과 제 명', '프로젝트 코드', 'M o d e l', '담 당', '주관부서(담당자)',
                     '시 간', '장 소', '내 용', '일 정']
        },
        {
            form: 'JIRA 프로젝트 등록 요청서',
            kw: ['jira 등록', 'jira 프로젝트 등록', '지라 등록', '지라 프로젝트 등록'],
            needs: '지금 열린 프로젝트(명칭·팀·고객사). 구성요소·이슈유형은 양식 고정값이라 원본을 쓴다.',
            sampled: 'RD3-2510-035',
            fields: ['프로젝트명', '프로젝트 카테고리', '구성 요소', '이슈 유형', '이슈 필드', '알림 계획']
        },
        {
            form: '환경 대응 의뢰서',
            kw: ['환경 대응 의뢰', '환경대응 의뢰', 'rohs 의뢰', 'reach 의뢰', '환경 자료 의뢰'],
            needs: '지금 열린 프로젝트(고객·제품코드·모델명·회로/기구 담당자). 요청사항·기한은 사람이 정한다.',
            sampled: 'RD3-2605-022',
            fields: ['고객(Buyer)', '제품명 / 제품코드', '회로 / 기구 담당자', '의 뢰 자', '의뢰부서',
                     '의뢰목적(사유)', '고객요청 접수일', '대응완료 요청일자', '대응가능 일자',
                     '출 향 지(Countrty)', '요청사항', '단계(Event)', '보완사항']
        },
        {
            form: '신뢰성 시험 의뢰서',
            kw: ['신뢰성 시험 의뢰', '신뢰성시험 의뢰', '신뢰성 의뢰서', '신뢰성 시험 기안'],
            needs: '지금 열린 프로젝트 + Customer SPEC(해상도·전압) + 주요자재(패널 PN). '
                 + '시료수·시험기간·체크항목은 사람이 정한다.',
            sampled: 'RD3-2510-044',
            // 실측 53칸 중 **프로젝트에서 올 수 있는 칸만** 적는다 — 체크박스 묶음 30여 개는
            // 원본 그대로가 맞다(사람 판단).
            fields: ['고객(Buyer)', '모델(Model)', '제품명/부품명', '의뢰부서',
                     '의뢰자 (회로, 기구담당포함)', '해상도', '품명(Serial No.)', 'Firmware 형명',
                     '입력 전압', 'x', 'y', 'Brightness', 'Contrast', 'Color Temp'],
            note: '실측 53칸이지만 대부분이 체크박스 묶음이다 — 위 14칸만 프로젝트에서 온다.'
        },
        {
            form: '연구개발과제 발의서',
            kw: ['연구개발과제 발의', '과제 발의서', '개발 발의서', '발의서 기안'],
            needs: '-',
            sampled: 'RD3-2506-066',
            // ⚠️ 실측으로 **본문 칸이 0개**다. 내용 전부가 첨부(설계입력기준서.docx /
            //    개발발의서.xlsx)에 있다 — 칸 채우기로는 할 수 있는 일이 없다.
            fields: [],
            note: '본문·입력칸이 0개이고 내용이 전부 첨부파일에 있다 — 칸 채우기로는 못 만든다. '
                + '첨부 생성 기능이 생기면 그때 연결할 양식이다.'
        },
        {
            form: '개발 완료 보고서',
            kw: ['개발 완료 보고', '개발완료 보고서', '개발 완료 기안'],
            needs: '-',
            sampled: 'RD3-2608-011',
            // ⚠️⚠️ 읽기 자체가 깨진다 — 실측에서 라벨/값 짝이 어긋났다
            //    (`16.51 = FRONT PARTS`, `Rev = 제품 기획`, `No = Sub Board`).
            //    매핑을 적으면 **엉뚱한 칸에 값이 들어간다.** 리더를 먼저 고쳐야 한다.
            fields: null,
            note: '⚠️ /gw/approval/read 가 이 양식의 라벨/값 짝을 잘못 읽는다(실측). '
                + '리더를 고치기 전에는 매핑을 적지 말 것 — 엉뚱한 칸에 들어간다.'
        }
    ];
    // 📌 여기 없는 양식도 많다(사내 97개, 최근 50건만 세어도 25종). 사람이 보는 전체 색인은
    //    `docs/groupware-forms.md`. 양식을 추가할 때는 **문서 1건을 실제로 읽어** 칸 이름을
    //    받아 적을 것 — 추측으로 적으면 미리보기에서 전부 '원본 기안'으로 떨어진다.

    // ── 말 → 양식 판정 ─────────────────────────────────────────────────
    //  ⚠️ 가장 **구체적인** 어휘가 이겨야 한다. '원자재'(승인 결과서)와 '원자재 코드 등록'
    //     (코드등록신청서)처럼 한쪽이 다른 쪽에 포함되는 말이 실제로 있어서, 먼저 걸린 걸
    //     쓰면 코드등록 요청이 승인원으로 샌다. 그래서 **맞은 어휘의 길이**로 점수를 준다.
    window._apvDocTypeHit = function (text) {
        var q = String(text || '');
        if (!q.trim() || !window._qaKwSeqHit) return null;
        var best = null, bestScore = 0;
        (window.APPROVAL_DOC_TYPES || []).forEach(function (t) {
            if ((t.notKw || []).some(function (k) { return window._qaKwSeqHit(q, k); })) return;
            (t.kw || []).forEach(function (k) {
                if (!window._qaKwSeqHit(q, k)) return;
                var score = _norm(k).length;
                if (score > bestScore) { bestScore = score; best = t; }
            });
        });
        return best;
    };

    // ⚠️⚠️ 양식 이름은 **서로 부분문자열이다.** '제품코드등록신청서' 는 '원자재/반제품코드등록
    //   신청서' 안에 그대로 들어 있다. 그래서 "포함되면 같은 양식"으로 보면 제품코드 등록 요청이
    //   원자재 문서를 틀로 집는다 — 실측으로 잡았다(제품코드 → RD3-2609-050, 원자재 문서).
    //   그래서 **정확히 같은 이름을 최우선**으로 두고, 포함 관계는 가장 긴 쪽만 인정한다.
    //   돌려주는 값: 이 이름에 가장 잘 맞는 카탈로그 항목 하나(없으면 null).
    // ── 📛 양식 **열쇠**(formKey) — 양식 이름 + 제목 접두어 ──────────────────
    //  ⚠️⚠️ '기안서' 는 양식이 아니라 봉투다(위 카탈로그 주석). 그래서 매핑을 찾을 때 쓰는
    //    열쇠는 양식 이름 하나가 아니라 **'기안서[시제품 제작의뢰서]'** 처럼 접두어까지다.
    //    접두어가 없는 양식은 열쇠가 그냥 양식 이름이라 기존 동작이 그대로 유지된다.
    var _typeKey = function (t) {
        if (!t) return '';
        var p = (t.titlePrefix || [])[0];
        return p ? (t.form + '[' + p + ']') : t.form;
    };
    window._apvTypeKey = _typeKey;

    // 제목에서 `[...]` 접두어를 꺼낸다. 없으면 빈 문자열.
    var _titlePrefixOf = function (title) {
        var m = String(title == null ? '' : title).match(/^\s*\[([^\]]+)\]/);
        return m ? m[1].trim() : '';
    };

    //  formName(+title) → 카탈로그 항목 하나.
    //  ⚠️ title 을 안 주면 `titlePrefix` 가 있는 항목은 **고르지 않는다** — 접두어를 확인하지
    //     못한 상태에서 고르면 '기안서' 전부가 시제품 제작의뢰서 매핑을 쓰게 된다.
    //     단, formName 자체가 '기안서[시제품 제작의뢰서]' 꼴이면 그걸로 맞춘다.
    var _bestTypeFor = function (formName, title) {
        var fn = _norm(formName);
        if (!fn) return null;
        var pre = _norm(_titlePrefixOf(title) || _titlePrefixOf(String(formName).replace(/^[^\[]*/, '')));
        var best = null, bestRank = -1;
        (window.APPROVAL_DOC_TYPES || []).forEach(function (t) {
            var tn = _norm(t.form);
            if (!tn) return;
            var pres = (t.titlePrefix || []).map(_norm);
            if (pres.length) {
                // 접두어가 있는 항목은 **접두어가 맞을 때만** 인정한다.
                var keyn = _norm(_typeKey(t));
                var preHit = (pre && pres.indexOf(pre) >= 0) || (keyn === fn);
                if (!preHit) return;
                // 양식 이름도 맞아야 한다(제목만 같고 양식이 다른 문서를 집지 않게).
                if (!(fn.indexOf(tn) >= 0 || keyn === fn)) return;
                if (Infinity > bestRank) { bestRank = Infinity; best = t; }
                return;
            }
            var rank = (tn === fn) ? 1e9
                     : ((fn.indexOf(tn) >= 0 || tn.indexOf(fn) >= 0) ? tn.length : -1);
            if (rank > bestRank) { bestRank = rank; best = t; }
        });
        return bestRank >= 0 ? best : null;
    };
    window._apvDocTypeByForm = function (form, title) { return _bestTypeFor(form, title); };

    //  📛 매핑을 찾을 때 쓸 열쇠를 돌려준다 — js/47 이 `APPROVAL_FIELD_SOURCES[key]` 로 쓴다.
    //    카탈로그에 접두어 항목이 있으면 그 열쇠, 없으면 양식 이름 그대로.
    window._apvFormKey = function (formName, title) {
        var t = _bestTypeFor(formName, title);
        if (t && (t.titlePrefix || []).length) return _typeKey(t);
        return String(formName == null ? '' : formName).trim();
    };

    // ── 그 양식의 **최근 문서**를 결재함에서 찾는다 (틀로 쓸 문서) ──────
    //  하드코딩하지 않는 이유: 문서는 매주 쌓이고, 박아두면 그 순간부터 과거를 가리킨다.
    //  box=all 로 모든 함을 합쳐 본다 — 기안함에만 있는 양식, 결재함에만 있는 양식이 둘 다 있다.
    window._apvLatestDocOf = async function (form, limit) {
        var want = _norm(form);
        if (!want) return null;
        // 찾는 양식이 카탈로그에 있으면, 문서의 양식 이름도 **같은 판정**(_bestTypeFor)으로
        // 돌려 둘이 같은 항목을 가리킬 때만 인정한다 — 부분문자열 오매칭을 그렇게 막는다.
        var wantType = _bestTypeFor(form);
        try {
            var r = await fetch(BACKEND + '/gw/approval/doclist?box=all&duration=all&limit='
                                + encodeURIComponent(limit || 100));
            var d = await r.json();
            if (!d || d.ok === false) return null;
            // ⚠️⚠️ 접두어가 있는 양식('기안서[시제품 제작의뢰서]')은 **제목까지 봐야** 한다.
            //    formName 만 보면 같은 '기안서' 인 표준원가 문서를 틀로 집는다(실측: 한
            //    프로젝트의 '기안서' 7건이 서로 다른 세 문서였다).
            var wantPre = (wantType && (wantType.titlePrefix || []).length)
                ? (wantType.titlePrefix || []).map(_norm) : null;
            var hit = (d.docs || []).find(function (x) {
                var fn = _norm(x.formName);
                if (!x.docNum || !fn) return false;
                if (wantPre) {
                    if (fn !== _norm(wantType.form)) return false;
                    return wantPre.indexOf(_norm(_titlePrefixOf(x.title))) >= 0;
                }
                if (fn === want) return true;                       // 정확히 같은 이름이면 끝
                if (wantType) return _bestTypeFor(x.formName, x.title) === wantType;
                // 카탈로그에 없는 양식(사람이 직접 이름을 준 경우)만 포함 관계를 허용한다.
                return fn.indexOf(want) >= 0 || want.indexOf(fn) >= 0;
            });
            return hit ? { docNum: hit.docNum, subject: hit.title || '', draftedAt: hit.draftedAt || '' } : null;
        } catch (e) {
            // 조용히 삼키지 않는다 — 틀을 못 찾은 이유를 부르는 쪽이 사람에게 말해야 한다.
            if (window._issueLog) { try { window._issueLog('approval-doctype', { form: form, err: String(e && e.message || e) }); } catch (e2) { /* 기록 실패가 흐름을 막지 않게 */ } }
            return null;
        }
    };

    // ── AI 문답용 요약 (프롬프트/도구 응답에 싣는다) ────────────────────
    //  칸 이름까지 전부 실으면 토큰이 커진다 — 기본은 **이름·어휘·필요한 것**만,
    //  특정 양식을 물었을 때만 칸 목록을 준다.
    window._apvDocTypeSummary = function (form) {
        var one = form ? window._apvDocTypeByForm(form) : null;
        var pack = function (t) {
            var o = { 양식: t.form, 부르는말: (t.kw || []).slice(0, 4), 필요한것: t.needs || '' };
            if (t.sampled) o.확인한문서 = t.sampled;
            if (t.direct) o.바로쓰는명령 = t.direct;
            if (t.note) o.주의 = t.note;
            if (t.fields === null) o.칸 = '아직 안 읽음';
            else if (!t.fields.length) o.칸 = '읽었으나 0개';
            else o.칸 = t.fields;
            return o;
        };
        if (one) return { forms: [pack(one)] };
        // 🔎 [2026-10-27] 요청한 양식(form)이 있었는데 카탈로그에 없으면(= 칸 매핑 없음)도
        // "복사만 가능"으로 끝내지 않는다 — 프로젝트에 채울 정보가 있는지부터 보여준다
        // (사람이 "summary/spec 쪽만 보면 채울 수 있을 것 같은데" 물어본 것과 같은 요청).
        var scan = (form && window._apvProjectFactScan) ? window._apvProjectFactScan() : null;
        return {
            forms: (window.APPROVAL_DOC_TYPES || []).map(function (t) {
                var o = pack(t);
                if (Array.isArray(o.칸)) o.칸 = o.칸.length + '개';   // 전체 목록일 땐 개수만
                return o;
            }),
            안내: '여기 있는 양식만 칸 단위로 채울 수 있다. 다른 양식은 기존 문서를 틀로 삼아 '
                + '그대로 복사한 뒤 사람이 고쳐야 한다. 사내 전체 양식 색인은 docs/groupware-forms.md.',
            요청한양식: form || undefined,
            지금프로젝트에있는정보: scan || undefined
        };
    };

    // 🛠 AI 문답 도구(js/40 `gw_approval_forms`)의 실행부 — 로컬 데이터라 백엔드를 안 거친다.
    window._apvDocTypeTool = function (args) {
        return window._apvDocTypeSummary((args && args.form) || '');
    };

    // ── 📝 "양식 이름"만으로 기안 작성 시작 ─────────────────────────────
    //  사람이 참고 문서번호를 집어주지 않아도 되게 하는 지점이다 — 그 양식의 **최근 문서**를
    //  결재함에서 찾아 틀로 쓴다. 찾은 다음은 js/47 의 기존 경로(미리보기 → 사람 승인 →
    //  임시저장)를 그대로 타므로, 틀을 잘못 골랐더라도 사람이 보고 막을 수 있다.
    //  opts: { material, onStep }  ·  돌려주는 값: { ok, docNum, form, message }
    window.apvComposeByForm = async function (form, opts) {
        opts = opts || {};
        var step = (typeof opts.onStep === 'function') ? opts.onStep : function () {};
        var type = window._apvDocTypeByForm(form);
        // ⚠️ 접두어가 있는 양식은 **열쇠**('기안서[시제품 제작의뢰서]')로 넘긴다 — `type.form`
        //    만 넘기면 접두어가 날아가 같은 '기안서' 인 표준원가 문서를 틀로 집는다.
        var name = (type ? _typeKey(type) : '') || String(form || '').trim();
        if (!name) return { ok: false, message: '어떤 양식인지 알 수 없습니다.' };

        if (window._gwEnsureLogin) {
            var g = await window._gwEnsureLogin(step);
            if (!g || !g.ok) return { ok: false, message: (g && g.message) || '그룹웨어 로그인이 필요합니다.' };
        }
        step('🔎 "' + name + '" 양식의 최근 문서를 찾는 중입니다…');
        var latest = await window._apvLatestDocOf(name);
        if (!latest) {
            // 틀이 없으면 **지어내지 않는다** — 왜 못 했는지 그대로 말한다.
            return { ok: false, form: name,
                     message: '최근 결재문서 100건에서 "' + name + '" 양식을 찾지 못했습니다. '
                            + '그 양식으로 작성한 기존 문서번호를 알려주시면 그걸 틀로 쓰겠습니다.' };
        }
        if (!window.apvComposeFrom) return { ok: false, message: '기안 작성 기능을 불러오지 못했습니다(js/47).' };
        try {
            window.apvComposeFrom(latest.docNum, { material: String(opts.material || '') });
        } catch (e) {
            return { ok: false, form: name, message: String(e && e.message || e) };
        }
        return { ok: true, form: name, docNum: latest.docNum, subject: latest.subject,
                 mapped: !!(window.APPROVAL_FIELD_SOURCES || {})[name] };
    };
})();
