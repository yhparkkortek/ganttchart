// 📝 [2026-10-22 신규] 기안 작성 — 기존 기안을 **틀**로 삼고 값은 **지금 열린 프로젝트**에서 채운다
//
//   기존 기안(틀)  ─┐
//                  ├─→ 칸마다 값 결정 ─→ 사람 확인(출처 표시) ─→ 임시저장
//   현재 프로젝트  ─┘
//
// 백엔드는 이미 다 있다(`/gw/approval/read` → `/gw/approval/copy`의 fields 덮어쓰기).
// 여기는 **가운데 "어느 칸에 어느 값을 넣을지"** 만 담당한다.
//
// 설계 원칙(CLAUDE.md):
//  · 매핑 규칙은 **코드가 아니라 카탈로그**(APPROVAL_FIELD_SOURCES) — 양식이 늘면 항목만 추가
//  · **결정론 먼저** — 사전으로 찾고, 못 찾은 칸만 사람에게 묻는다(AI는 다음 단계)
//  · **사람 승인 후 적용** — 칸마다 출처를 보여주고, 고친 건 사전에 적립해 다음엔 자동
//  · 상신은 어느 경로에서도 하지 않는다
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };
    var _norm = function (s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); };

    // ── 📚 매핑 카탈로그 (데이터) ───────────────────────────────────────
    //   from: 'meta'   projectMeta[key]
    //         'spec'   Customer SPEC(briefSpec)에서 label 과 맞는 행의 값
    //         'summary' tabData.summary[key]
    //         'user'   지금 사용자 이름
    //         'doc'    **이 프로젝트의 선행 결재문서**에서 읽는다(아래 참조 사다리)
    //         'blank'  일부러 비운다(신규 채번처럼 사람이 정할 것)
    //         (없음)   원본 기안 값을 그대로 쓴다
    //   label 은 **별칭 목록** — 양식·프로젝트마다 말이 달라서 한 개로는 못 맞춘다.
    //
    //  ── 📜 `from:'doc'` — 선행 문서 참조 (2026-11-09 신설) ─────────────────────
    //   왜 필요한가: 앱에 **원본이 없는 값**이 있다. 프로젝트 코드·제품 코드·자재 코드는
    //   결재로 **채번되고**, FW ver·EDID·광학 실측값은 시험 문서에서 **확정된다.**
    //   그 값들은 앱이 아니라 **앞서 쓴 문서**가 원본이다.
    //
    //   ⚠️⚠️ **순서표를 박지 않는다.** 프로젝트 4개를 실측했더니 작성 순서가 제각각이었다 —
    //     개발 의뢰서가 SLIM SLOT 에선 1위인데 OBSIDIAN 에선 6위, 프로젝트코드 등록 신청서는
    //     ICONIC 엔 **아예 없다**. 그래서 `ref` 는 **후보 목록**이고, 지금 이 프로젝트의
    //     결재함에 **실제로 있는** 문서 중에서 고른다. 없으면 fallback 으로 내려간다.
    //
    //   ⚠️⚠️ 참조 문서는 **이 프로젝트 것만** 쓴다. 양식만 보고 "최근 문서"를 집으면
    //     **남의 프로젝트 코드**가 그대로 결재선을 타고 올라간다(조용한 오답 중 최악).
    //     그래서 프로젝트 키워드로 먼저 걸러낸다(`_apvProjectDocs`).
    //
    //   rule: { from:'doc', ref:['양식 이름', …], label:['칸 이름', …],
    //           fallback:'meta'|'spec'|'summary'|'source'|'blank', key/label…, why }
    window.APPROVAL_FIELD_SOURCES = window.APPROVAL_FIELD_SOURCES || {
        '제품코드 등록 신청서': {
            '프로젝트 코드': { from: 'meta', key: '프로젝트코드' },
            '프로젝트 명칭': { from: 'meta', key: '프로젝트명' },
            'Buyer':        { from: 'meta', key: '고객사' },
            '등록요청자':     { from: 'user' },
            '패널인치':       { from: 'spec', label: ['패널인치', 'Size', 'Panel Size', '화면크기', 'Active Screen Size'] },
            '패널타입':       { from: 'spec', label: ['패널타입', 'Panel Type', 'LCD Type', 'Driving mode'] },
            '터치타입':       { from: 'spec', label: ['터치타입', 'Touch Type', 'TSP', 'Touch'] },
            'AD Board.':     { from: 'spec', label: ['AD Board', 'AD BD', 'ADBD', 'A/D Board'] },
            'Type&Optical':  { from: 'spec', label: ['Type&Optical', 'Optical', 'Optical Type'] },
            // 🏭 자재번호를 같이 주면 SAP 에서 읽어 채운다. 안 주면 아래 fallback 대로
            //    비우거나(자재코드) 원본을 유지한다 — **원본 값을 물려받으면 안 되는 칸**이다.
            '자재코드':       { from: 'sap', key: 'self',  fallback: 'blank', why: '새로 채번할 코드라 비웁니다' },
            'Description':   { from: 'sap', key: 'MAKTX', fallback: 'blank', why: '새 모델 내역이라 비웁니다' },
            '자재그룹넘버':    { from: 'sap', key: 'MATKL', fallback: 'source' },
            '자재내역2':      { from: 'sap', key: 'ZTEXT', fallback: 'source' }
            // 그 밖(자재상태·생산지·오리진그룹 등)은 적지 않았다 =
            // **원본 기안 값을 그대로** 쓴다. 앱에 대응하는 데이터가 없는 칸들이다.
        },
        // 🧪 [2026-10-22] 칸 이름은 실제 문서(RD3-2610-046)를 읽어 확인한 것이다 — 추측 아님.
        //    ⚠️ 이 양식은 js/04h 의 **전용 흐름**("132933 원자재 승인원 기안 작성해줘")이 공급업체
        //       조회(ZMM006→LIFNR→ZMM005)까지 해 준다. 틀이 필요 없으면 그쪽이 더 완전하다.
        //       여기 매핑은 "기존 문서를 틀로 쓰고 싶을 때"를 위한 것이다.
        '원자재 승인 결과서': {
            'Item Code':       { from: 'sap', key: 'self',  fallback: 'blank', why: '자재번호를 같이 주세요' },
            'Model':           { from: 'sap', key: 'MAKTX', fallback: 'blank', why: '자재번호를 같이 주세요' },
            'Item Group No':   { from: 'sap', key: 'MATKL', fallback: 'blank', why: '자재번호를 같이 주세요' },
            'Sub Description': { from: 'sap', key: 'ZTEXT', fallback: 'blank', why: '자재번호를 같이 주세요' },
            'Date':            { from: 'today' },
            // ⚠️ 공급업체는 **자재마다 다르다** — 원본 값을 물려받으면 엉뚱한 업체가 그대로 올라간다.
            //    SAP ZMM006 조회는 js/04h 전용 흐름에 있으니 여기선 비우고 사람이 확인하게 한다.
            'Name':            { from: 'vendor', key: 'name',    why: '자재번호를 같이 주세요' },
            'Address':         { from: 'vendor', key: 'address', why: '자재번호를 같이 주세요' },
            'Tel':             { from: 'vendor', key: 'tel',     why: '자재번호를 같이 주세요' }
            // Customer·Rev.No·Page·Summary·Remark 는 적지 않았다 = 원본 유지
        },
        // 🧪 [2026-10-22] 아래 다섯 양식의 칸 이름은 최근 결재문서를 **실제로 읽어** 확인한 것이다
        //    (근거 문서번호는 js/52 `APPROVAL_DOC_TYPES[].sampled`). 추측으로 적으면 미리보기에서
        //    전부 '원본 기안'으로 떨어지고, 사람은 매핑이 있는 줄 알고 그냥 넘긴다.
        //    코드등록 계열은 최근 50건 중 22건(44%)으로 가장 많이 쓰는 양식이라 먼저 매핑했다.
        //    ⚠️ 칸 이름의 **공백도 그대로** 써야 한다 — '자재 코드'(여기)와 '자재코드'(제품코드
        //       등록 신청서)는 서로 다른 양식의 다른 칸이다.
        '프로젝트코드 등록 신청서': {
            '프로젝트 코드':          { from: 'blank', why: '새로 채번할 코드라 비웁니다' },
            '프로젝트 명칭':          { from: 'meta', key: '프로젝트명' },
            '프로젝트 Description':  { from: 'meta', key: '모델명' },
            '고객사':                { from: 'meta', key: '고객사' },
            '착수년도':               { from: 'year' },
            '과제리더':               { from: 'meta', key: '프로젝트담당자' }
            // Level 1~4·F/S 코드·개발비 구분·개발팀장·참여연구원·Start 는 적지 않았다 = 원본 유지.
            // 사내 분류 체계·인사 정보라 앱에 대응하는 데이터가 없다.
        },
        '원자재/반제품 코드등록신청서': {
            '자재 코드':      { from: 'sap', key: 'self',  fallback: 'blank', why: '새로 채번할 코드라 비웁니다' },
            'Description':   { from: 'sap', key: 'MAKTX', fallback: 'blank', why: '자재번호를 같이 주세요' },
            '자재그룹 No.':   { from: 'sap', key: 'MATKL', fallback: 'source' },
            '제조사':         { from: 'sap', key: 'MFRPN', fallback: 'source' },
            '등록 요청자':    { from: 'user' }
            // 구분·개발형태·내작/외작·단가·납기일·BOM 종속 예정일·도급/무상·비고 = 원본 유지(사람 판단)
        },
        '회로 원자재/PBA 코드 등록 신청서': {
            '자재 코드':      { from: 'sap', key: 'self',  fallback: 'blank', why: '새로 채번할 코드라 비웁니다' },
            'Description':   { from: 'sap', key: 'MAKTX', fallback: 'blank', why: '자재번호를 같이 주세요' },
            '자재그룹 No.':   { from: 'sap', key: 'MATKL', fallback: 'source' },
            '제조사':         { from: 'sap', key: 'MFRPN', fallback: 'source' },
            // ⚠️ 공급사는 **자재마다 다르다** — 원본을 물려받으면 엉뚱한 업체로 결재가 올라간다.
            '공급사':         { from: 'vendor', key: 'name', why: '자재번호를 같이 주세요' },
            '공급사코드':      { from: 'blank', why: '공급사 코드(LIFNR)는 사람이 확인해주세요' },
            '등록 요청자':    { from: 'user' }
        },
        'DMS 등록 신청서': {
            '1. 자재/제품 번호': { from: 'sap', key: 'self',  fallback: 'source' },
            '주요모델명':         { from: 'meta', key: '모델명' },
            '2. DMS 문서번호':   { from: 'blank', why: 'DMS 문서번호는 등록 후에 생기므로 사람이 채워주세요' }
        },
        // 🧪 [2026-11-09] 기안서[시제품 제작의뢰서] — 값이 **입력칸이 아니라 본문 표**에 있다.
        //   실측(RD3-2604-016 / RD3-2512-010): fields 5개(문서번호·작성일 등 시스템 값)
        //   / bodyFields **30개**(실제 내용 전부). 그래서 아래 칸 이름은 전부 bodyFields 다.
        //   한 프로젝트에서 4번 쓴 양식이고, 같은 표가 Sample Report·모델명세서에도 또 들어간다.
        //   ⚠️ 수량·출고처·일정·회차는 **사람이 정하는 값**이라 원본을 유지한다(적지 않는다) —
        //     지난 회차의 날짜가 그대로 올라가면 안 되니 미리보기에서 고치게 둔다.
        '기안서[시제품 제작의뢰서]': {
            // ① 채번된 코드 — 앱(Summary)에 적혀 있을 수도 있지만 **문서가 원본**이다.
            '프로젝트 코드': { from: 'doc', ref: ['프로젝트코드 등록 신청서', '제품코드 등록 신청서'],
                            label: ['프로젝트 코드'], fallback: 'meta', key: '프로젝트코드' },
            '제품 코드':     { from: 'doc', ref: ['제품코드 등록 신청서'],
                            label: ['자재코드', '자재 코드', '제품코드'], fallback: 'meta', key: 'KTKPN' },
            '모 델 명':      { from: 'doc', ref: ['제품코드 등록 신청서'],
                            label: ['Description'], fallback: 'meta', key: 'PN_모델명' },
            'B U Y E R':    { from: 'meta', key: '고객사' },
            // ② 사람 — 앱이 원본이다(Summary 프로젝트 멤버).
            '모델 담당자':    { from: 'meta', key: 'HW담당자',  fallback: 'meta2', key2: '프로젝트담당자' },
            '기구 담당자':    { from: 'meta', key: '기구담당자' },
            'FW 담당자':     { from: 'meta', key: 'FW담당자' },
            // ③ 확정값 — 시험 의뢰서에서 확정된다. 앱엔 없다.
            'FW Ver':       { from: 'doc', ref: ['신뢰성 시험 의뢰서'], label: ['Firmware 형명'],
                            fallback: 'blank', why: '아직 확정 전이면 비웁니다 — 확인해 주세요' },
            // ④ 광학 사양 — Customer SPEC 에 적어 두면 거기서, 아니면 시험 의뢰서에서.
            'X':            { from: 'doc', ref: ['신뢰성 시험 의뢰서'], label: ['x'],
                            fallback: 'spec', label2: ['색좌표 X', 'Color Coordinate X', 'White X'] },
            'Y':            { from: 'doc', ref: ['신뢰성 시험 의뢰서'], label: ['y'],
                            fallback: 'spec', label2: ['색좌표 Y', 'Color Coordinate Y', 'White Y'] },
            'Lv':           { from: 'spec', label: ['휘도', 'Brightness', 'Luminance', 'White Luminance'] },
            // ⑤ 주요자재 11칸 — Summary 탭 주요자재의 **고정 구분**과 1:1 로 맞물린다.
            //    `matCat` = window.MATERIAL_FIXED_CATEGORIES 의 구분 이름, `matKey` = 꺼낼 값.
            'LCM(Panel) 코드':      { from: 'mat', matCat: 'PANEL',       matKey: 'ktkPn' },
            'LCM(Panel) 부품 명':    { from: 'mat', matCat: 'PANEL',       matKey: 'description' },
            'A/D Board 코드':       { from: 'mat', matCat: 'AD BOARD',    matKey: 'ktkPn' },
            'A/D Board 부품 명':     { from: 'mat', matCat: 'AD BOARD',    matKey: 'description' },
            'Converter 코드':       { from: 'mat', matCat: 'CONVERTER',   matKey: 'ktkPn' },
            'Converter 부품 명':     { from: 'mat', matCat: 'CONVERTER',   matKey: 'description' },
            'TSP(Glass) 코드':      { from: 'mat', matCat: 'TOUCH / GLASS', matKey: 'ktkPn' },
            'TSP(Glass) 부품 명':    { from: 'mat', matCat: 'TOUCH / GLASS', matKey: 'description' },
            'TSP CTRL 코드':        { from: 'mat', matCat: 'TOUCH CTRL',  matKey: 'ktkPn' },
            'TSP CTRL 부품 명':      { from: 'mat', matCat: 'TOUCH CTRL',  matKey: 'description' }
            // 개발 단계·제작 회차·총 제작수량·출고 수량·출고 요청일·조립 예상일·제작 기간·
            // EDID CHECK SUM·LCM(Panel) 비고 = 원본 유지(사람이 정한다).
        },
        // 🧪 [2026-11-09] 단계별 DR 회의록 — 실측 RD3-2606-023.
        //   시간·장소·내용·일정은 **회의 고유값**이라 적지 않는다(원본 유지 → 사람이 고친다).
        '단계별 DR 회의록': {
            '과 제 명':        { from: 'meta', key: '프로젝트명' },
            '프로젝트 코드':     { from: 'doc', ref: ['프로젝트코드 등록 신청서', '제품코드 등록 신청서'],
                               label: ['프로젝트 코드'], fallback: 'meta', key: '프로젝트코드' },
            'M o d e l':      { from: 'meta', key: 'KTK모델명', fallback: 'meta2', key2: '모델명' },
            '담 당':           { from: 'meta', key: '팀' },
            '주관부서(담당자)':   { from: 'metaJoin', keys: ['팀', '프로젝트담당자'], fmt: '{0}({1})' },
            // 날짜·시간은 비운다 — 지난 회의 날짜가 그대로 올라가면 안 된다.
            '시 간':           { from: 'blank', why: '회의 시간은 사람이 정해주세요' },
            '장 소':           { from: 'blank', why: '회의 장소는 사람이 정해주세요' },
            '내 용':           { from: 'blank', why: '회의 내용은 사람이 적어주세요' }
        },
        // 🧪 [2026-11-09] JIRA 프로젝트 등록 요청서 — 실측 RD3-2510-035.
        //   구성요소·이슈유형·이슈필드·알림계획은 **양식 고정값**이라 원본 유지가 맞다.
        'JIRA 프로젝트 등록 요청서': {
            '프로젝트명':         { from: 'meta', key: '프로젝트명' },
            '프로젝트 카테고리':   { from: 'metaJoin', keys: ['팀', '고객사'], fmt: '{0}-{1}' }
        },
        // 🧪 [2026-11-09] 환경 대응 의뢰서 — 실측 RD3-2605-022.
        '환경 대응 의뢰서': {
            '고객(Buyer)':        { from: 'meta', key: '고객사' },
            '제품명 / 제품코드':    { from: 'metaJoin', keys: ['KTKPN', 'PN_모델명'], fmt: '{0} {1}' },
            '회로 / 기구 담당자':   { from: 'metaJoin', keys: ['HW담당자', '기구담당자'], fmt: '{0}/{1}' },
            // 기한·접수일은 **이번 요청의 값**이다. 원본의 지난 날짜가 올라가면 안 된다.
            '고객요청 접수일':      { from: 'today' },
            '대응완료 요청일자':    { from: 'blank', why: '요청 기한은 사람이 정해주세요' },
            '대응가능 일자':        { from: 'blank', why: '대응 가능일은 사람이 정해주세요' }
        },
        // 🧪 [2026-11-09] 신뢰성 시험 의뢰서 — 실측 RD3-2510-044(칸 53개).
        //   체크박스 묶음 30여 개는 원본 유지가 맞다(사람 판단) — 아래 칸만 프로젝트에서 온다.
        '신뢰성 시험 의뢰서': {
            '고객(Buyer)':   { from: 'meta', key: '고객사' },
            '모델(Model)':   { from: 'meta', key: 'KTK모델명', fallback: 'meta2', key2: '모델명' },
            '의뢰부서':       { from: 'meta', key: '팀' },
            '의뢰자 (회로, 기구담당포함)': { from: 'metaJoin', keys: ['HW담당자', '기구담당자'], fmt: '{0}, {1}' },
            '해상도':         { from: 'spec', label: ['해상도', 'Resolution', 'Native Resolution'] },
            '품명(Serial No.)': { from: 'mat', matCat: 'PANEL', matKey: 'description' },
            // 시료수·시험기간·접수일은 이번 의뢰의 값이다 — 지난 값이 올라가면 안 된다.
            '시료수(Q\'ty)':  { from: 'blank', why: '시료 수량은 사람이 정해주세요' },
            '시험 기간':      { from: 'blank', why: '시험 기간은 사람이 정해주세요' }
        },
        '개발품 자재상태 전환 요청서': {
            '제품코드':             { from: 'sap', key: 'self',  fallback: 'blank', why: '제품코드를 같이 주세요' },
            '제품 Description명':  { from: 'sap', key: 'MAKTX', fallback: 'blank', why: '제품코드를 같이 주세요' },
            // 날짜는 일정 판단이라 비운다 — 원본의 지난 날짜가 그대로 올라가면 안 된다.
            'P0 전환 예정일':       { from: 'blank', why: '전환 예정일은 사람이 정해주세요' },
            '등록예정일':           { from: 'blank', why: '등록예정일은 사람이 정해주세요' }
        }
    };

    // 사람이 미리보기에서 고친 값을 양식·칸 단위로 적립 → 다음엔 그 값이 먼저 제안된다.
    var LEARN_KEY = 'gantt_approval_field_learn_v1';
    var _learnAll = function () {
        try { return JSON.parse(localStorage.getItem(LEARN_KEY) || '{}'); } catch (e) { return {}; }
    };
    var _learnGet = function (form, label) { return ((_learnAll()[form] || {})[label]); };
    var _learnPut = function (form, label, value) {
        try {
            var all = _learnAll();
            all[form] = all[form] || {};
            all[form][label] = value;
            localStorage.setItem(LEARN_KEY, JSON.stringify(all));
        } catch (e) { /* 저장 실패가 기안 작성을 막지는 않는다 */ }
    };
    window._apvLearned = _learnAll;

    // ── 🔎 [2026-10-27] 작성 전 사전 스캔 — "이 프로젝트에 채울 정보가 있는지" ────────────
    //  양식이 APPROVAL_FIELD_SOURCES 에 등록 안 돼 있으면 _resolveOne 이 메타/스펙/서머리를
    //  전혀 안 본다(모든 칸이 바로 '원본 기안'행으로 떨어진다) — 매핑이 없다고 **데이터까지
    //  없는 건 아니다.** 사람이 "summary/spec 쪽만 보면 채울 수 있을 것 같은데" 물어본 질문
    //  그대로: 칸 매핑과 무관하게, 지금 프로젝트에 **뭐가 있고 뭐가 없는지**만 먼저 보여준다.
    //  읽기 전용 — 아무 칸에도 자동으로 채워 넣지 않는다(추측 금지 원칙은 그대로).
    window._apvProjectFactScan = function () {
        var meta = window.projectMeta || {};
        var metaOut = {};
        Object.keys(meta).forEach(function (k) {
            if (/이메일$/.test(k)) return;              // 연락처 노이즈는 뺀다
            var v = meta[k];
            if (v === undefined || v === null || typeof v === 'object') return;
            v = String(v).trim();
            if (v) metaOut[k] = v;
        });

        var summary = ((window.tabData || {}).summary) || {};
        var summaryOut = {};
        Object.keys(summary).forEach(function (k) {
            var v = summary[k];
            if (v === undefined || v === null) return;
            if (Array.isArray(v)) { if (v.length) summaryOut[k] = v.length + '건'; return; }
            if (typeof v === 'object') return;
            v = String(v).trim();
            if (v) summaryOut[k] = v;
        });

        var rows = (window.tabData && window.tabData.briefSpec) || [];
        var specOut = [];
        rows.forEach(function (row) {
            var label = (row.sub || row.type || '').toString().trim();
            var val = (row.modelA || row.modelB || row.modelC || '').toString().trim();
            if (label && val) specOut.push({ label: label, value: val });
        });

        return {
            meta: metaOut, metaCount: Object.keys(metaOut).length,
            summary: summaryOut, summaryCount: Object.keys(summaryOut).length,
            spec: specOut, specCount: specOut.length,
            note: specOut.length ? '' : 'Customer SPEC 이 비어 있습니다(이 프로젝트/제품구분자엔 아직 입력 안 됨).'
        };
    };

    // ── 현재 프로젝트에서 값 찾기 ───────────────────────────────────────
    // Customer SPEC 은 {type, sub, modelA/B/C, note} 행들이다. 지금 보는 제품구분자의
    // 열(modelA)을 먼저 보고, 라벨은 별칭·부분일치까지 허용한다.
    var _specFind = function (labels) {
        var rows = (window.tabData && window.tabData.briefSpec) || [];
        var want = (labels || []).map(_norm);
        for (var i = 0; i < rows.length; i++) {
            var sub = _norm(rows[i].sub), typ = _norm(rows[i].type);
            var hit = want.some(function (w) { return w && (sub === w || typ === w); })
                   || want.some(function (w) { return w && sub && sub.indexOf(w) >= 0; });
            if (!hit) continue;
            var v = rows[i].modelA || rows[i].modelB || rows[i].modelC || '';
            if (String(v).trim()) return String(v).trim();
        }
        return '';
    };

    // 📊 주요 자재 — Summary 탭의 **고정 구분**(window.MATERIAL_FIXED_CATEGORIES) 이름으로 찾는다.
    //   모델이 여러 개면 지금 보는 모델(#1)을 먼저 본다. 합본(projectMaterials)도 폴백으로 본다.
    //   ⚠️ 구분 이름은 바뀐 적이 있다(SLIMMING/CUTTING → SLIM/CUT) — 별칭표를 같이 본다.
    var _matFind = function (cat, key) {
        var td = window.tabData || {};
        var lists = [];
        var models = td.projectModels || [];
        if (models.length && Array.isArray(models[0].materials)) lists.push(models[0].materials);
        models.forEach(function (m) { if (Array.isArray(m.materials)) lists.push(m.materials); });
        if (Array.isArray(td.projectMaterials)) lists.push(td.projectMaterials);
        var names = [cat].concat(((window._MATERIAL_CATEGORY_ALIASES || {})[cat]) || []).map(_norm);
        for (var i = 0; i < lists.length; i++) {
            for (var j = 0; j < lists[i].length; j++) {
                var r = lists[i][j] || {};
                if (names.indexOf(_norm(r.category)) === -1) continue;
                var v = String(r[key] == null ? '' : r[key]).trim();
                if (v) return v;
            }
        }
        return '';
    };

    // 📜 선행 문서에서 칸 하나 읽기 — ctx.docs 는 미리 읽어 둔 {양식열쇠: {칸: 값}} 이다.
    //   ⚠️ 여기서 fetch 하지 않는다(이 함수는 동기다) — 미리 읽는 건 _apvPrefetchRefDocs.
    var _docFind = function (ctx, refForms, labels) {
        var docs = (ctx && ctx.docs) || {};
        var want = (labels || []).map(_norm);
        for (var i = 0; i < (refForms || []).length; i++) {
            var d = docs[refForms[i]];
            if (!d || !d.fields) continue;
            var keys = Object.keys(d.fields);
            for (var w = 0; w < want.length; w++) {
                for (var k = 0; k < keys.length; k++) {
                    if (_norm(keys[k]) !== want[w]) continue;
                    var v = String(d.fields[keys[k]] == null ? '' : d.fields[keys[k]]).trim();
                    if (v) return { value: v, form: refForms[i], docNum: d.docNum || '', label: keys[k] };
                }
            }
        }
        return null;
    };

    // 칸 하나의 값을 정한다 → {value, from, note}
    //   from 은 **사람에게 보여줄 출처**다. 비워 두지 말 것 — 출처가 안 보이면 다 맞다고 믿고 넘긴다.
    //   ruleOverride: 폴백으로 내려갈 때 쓰는 임시 규칙(카탈로그를 다시 안 본다).
    var _resolveOne = function (form, label, srcValue, ctx, ruleOverride) {
        ctx = ctx || {};
        if (!ruleOverride) {
            var learned = _learnGet(form, label);
            if (learned !== undefined && learned !== null && String(learned).trim()) {
                return { value: String(learned), from: _t('지난번 수정값', 'learned'), kind: 'learn' };
            }
        }
        var rule = ruleOverride || (window.APPROVAL_FIELD_SOURCES[form] || {})[label];
        if (!rule) return { value: srcValue || '', from: _t('원본 기안', 'source doc'), kind: 'source' };

        // ── 폴백 사다리 ────────────────────────────────────────────────
        //  ⚠️ 폴백이 **없으면** 비운다(원본을 조용히 물려받지 않는다) — 이 규칙이 있는 칸은
        //     "원본 값을 그대로 쓰면 안 되는 칸"이라 명시한 칸이기 때문이다.
        var _fb = function (why) {
            var f = rule.fallback;
            if (!f || f === 'blank') {
                return { value: '', from: _t('비움', 'blank'), kind: 'blank', note: why || rule.why || '' };
            }
            if (f === 'source') {
                return { value: srcValue || '', from: _t('원본 기안', 'source doc'), kind: 'source' };
            }
            var sub = { from: (f === 'meta2' ? 'meta' : f),
                        key: rule.key2 || rule.key, label: rule.label2 || rule.label,
                        keys: rule.keys, fmt: rule.fmt,
                        matCat: rule.matCat, matKey: rule.matKey, why: rule.why };
            return _resolveOne(form, label, srcValue, ctx, sub);
        };

        if (rule.from === 'blank') {
            return { value: '', from: _t('비움', 'blank'), kind: 'blank', note: rule.why || '' };
        }
        if (rule.from === 'user') {
            var u = window.currentUserName || '';
            return u ? { value: u, from: _t('현재 사용자', 'current user'), kind: 'app' }
                     : { value: srcValue || '', from: _t('원본 기안(사용자 이름 없음)', 'source doc'), kind: 'source' };
        }
        if (rule.from === 'meta') {
            var v = ((window.projectMeta || {})[rule.key] || '').toString().trim();
            if (v) return { value: v, from: _t('프로젝트 > ', 'project > ') + rule.key, kind: 'app' };
            // 폴백을 적은 규칙만 내려간다 — 기존 규칙(폴백 없음)은 예전처럼 'miss' 그대로.
            if (rule.fallback) return _fb(_t('프로젝트에 ' + rule.key + ' 없음', 'no ' + rule.key));
            return { value: '', from: _t('프로젝트에 ', 'project has no ') + rule.key + _t(' 없음', ''), kind: 'miss' };
        }
        // 🔗 여러 meta 값을 한 칸에 — '개발3팀(박용훈)'·'박용훈/이재우' 처럼 양식이 합쳐 적는 칸.
        //    ⚠️ 하나라도 비면 '개발3팀()' 같은 반쪽 값이 결재선을 탄다 → **전부 있을 때만** 쓴다.
        if (rule.from === 'metaJoin') {
            var pm = window.projectMeta || {};
            var vals = (rule.keys || []).map(function (k) { return String(pm[k] == null ? '' : pm[k]).trim(); });
            if (vals.length && vals.every(function (x) { return !!x; })) {
                var out = String(rule.fmt || vals.join(' '));
                vals.forEach(function (x, i) { out = out.split('{' + i + '}').join(x); });
                return { value: out, from: _t('프로젝트 > ', 'project > ') + (rule.keys || []).join(' + '), kind: 'app' };
            }
            var lack = (rule.keys || []).filter(function (k, i) { return !vals[i]; });
            if (rule.fallback) return _fb(_t('프로젝트에 ' + lack.join('·') + ' 없음', 'missing ' + lack.join(', ')));
            return { value: '', from: _t('프로젝트에 ', 'project has no ') + lack.join('·') + _t(' 없음', ''), kind: 'miss' };
        }
        // 📊 주요 자재(Summary 탭) — 구분 이름으로 찾는다.
        if (rule.from === 'mat') {
            var mv = _matFind(rule.matCat, rule.matKey || 'ktkPn');
            if (mv) return { value: mv, from: _t('주요자재 > ', 'materials > ') + rule.matCat, kind: 'app' };
            if (rule.fallback) return _fb(_t('주요자재에 ' + rule.matCat + ' 없음', 'no ' + rule.matCat));
            return { value: '', from: _t('주요자재에 ' + rule.matCat + ' 가 비어 있음', 'materials: ' + rule.matCat + ' empty'), kind: 'miss' };
        }
        // 📜 선행 문서 — 이 프로젝트의 앞선 결재문서에서 읽는다(미리 읽어 둔 ctx.docs).
        if (rule.from === 'doc') {
            var dh = _docFind(ctx, rule.ref || [], rule.label || []);
            if (dh) {
                return { value: dh.value, kind: 'app',
                         from: '📜 ' + dh.form + (dh.docNum ? ' ' + dh.docNum : '') + ' > ' + dh.label };
            }
            // 못 찾은 이유를 구분해 적는다 — "문서가 없다"와 "문서엔 그 칸이 없다"는 다른 사실이다.
            var tried = (rule.ref || []).join(', ');
            var had = (rule.ref || []).some(function (f) { return (ctx.docs || {})[f]; });
            return _fb(had ? _t(tried + ' 에 그 칸이 비어 있음', 'field empty in ' + tried)
                           : _t('이 프로젝트에 ' + tried + ' 문서가 없음', 'no ' + tried + ' for this project'));
        }
        if (rule.from === 'summary') {
            var s = (((window.tabData || {}).summary || {})[rule.key] || '').toString().trim();
            return s ? { value: s, from: _t('Summary > ', 'summary > ') + rule.key, kind: 'app' }
                     : { value: '', from: _t('Summary 에 값 없음', 'no value in summary'), kind: 'miss' };
        }
        if (rule.from === 'vendor') {
            var vv = (ctx.vendor && ctx.vendor[rule.key]) || '';
            vv = String(vv || '').trim();
            if (vv) return { value: vv, from: _t('SAP 공급업체 > ', 'SAP supplier > ') + rule.key, kind: 'app' };
            // ⚠️ 못 찾으면 **비운다** — 원본을 물려받으면 엉뚱한 업체가 그대로 올라간다.
            return { value: '', from: _t('비움', 'blank'), kind: 'blank',
                     note: ctx.material ? _t('SAP 에 공급업체 정보 없음', 'no supplier in SAP') : (rule.why || '') };
        }
        if (rule.from === 'today') {
            var d0 = new Date();
            var W = ['일', '월', '화', '수', '목', '금', '토'][d0.getDay()];
            var pad = function (n) { return (n < 10 ? '0' : '') + n; };
            return { value: d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate()) + '(' + W + ')',
                     from: _t('오늘 날짜', 'today'), kind: 'app' };
        }
        // 착수년도처럼 **연도만** 넣는 칸 — 'today' 형식(2026-10-22(수))을 넣으면 양식이 거부한다.
        if (rule.from === 'year') {
            return { value: String(new Date().getFullYear()), from: _t('올해', 'this year'), kind: 'app' };
        }
        if (rule.from === 'sap') {
            // 자재번호를 안 줬거나 SAP 조회가 안 됐으면 fallback 으로 — 조용히 원본을 쓰지 않는다.
            var sv2 = (rule.key === 'self') ? (ctx.material || '')
                                            : ((ctx.sap && ctx.sap[rule.key]) || '');
            sv2 = String(sv2 || '').trim();
            if (sv2) return { value: sv2, from: _t('SAP > ', 'SAP > ') + rule.key, kind: 'app' };
            if (rule.fallback === 'source') return { value: srcValue || '', from: _t('원본 기안(SAP 값 없음)', 'source doc'), kind: 'source' };
            return { value: '', from: _t('비움', 'blank'), kind: 'blank',
                     note: ctx.material ? _t('SAP 에 값 없음', 'not in SAP') : (rule.why || '') };
        }
        if (rule.from === 'spec') {
            var sv = _specFind(rule.label);
            if (sv) return { value: sv, from: _t('Customer SPEC > ', 'Customer SPEC > ') + (rule.label || [])[0], kind: 'app' };
            if (rule.fallback) return _fb(_t('Customer SPEC 에서 못 찾음', 'not in Customer SPEC'));
            return { value: '', from: _t('Customer SPEC 에서 못 찾음', 'not found in Customer SPEC'), kind: 'miss' };
        }
        return { value: srcValue || '', from: _t('원본 기안', 'source doc'), kind: 'source' };
    };

    // 📜 제목 속 자재번호 바꾸기.
    //    양식마다 제목 형식이 다르다(`Customer Approval Sheet[133015]_V01`, `[133015] 승인원`, …).
    //    그래서 **형식을 알아내려 하지 않고**, 원본의 옛 자재번호가 제목 어디에 있든 새 번호로
    //    바꾼다. 형식과 무관하게 동작하고, 옛 번호가 없으면 **아무것도 안 바꾼다**(추측 금지).
    //    옛 번호는 원본의 Item Code 류 칸에서 찾고, 없으면 제목의 5~8자리 숫자를 쓴다.
    var _subjectWithMaterial = function (subject, srcFields, newMat) {
        subject = String(subject || '');
        newMat = String(newMat || '').trim();
        if (!subject || !newMat) return { value: subject, changed: false };
        var oldMat = '';
        // 🧪 [2026-10-22] 양식마다 이 칸 이름이 다르다 — 실측으로 확인한 이름을 전부 적는다.
        //    '자재 코드'(코드등록 계열)는 공백이 있어 기존 '자재코드'로는 안 걸렸다.
        var keys = ['Item Code', '자재코드', '자재 코드', 'ItemCode',
                    '제품코드', '1. 자재/제품 번호'];
        for (var i = 0; i < keys.length && !oldMat; i++) {
            var v = String((srcFields || {})[keys[i]] || '').trim();
            if (/^\d{5,8}$/.test(v)) oldMat = v;
        }
        if (!oldMat) oldMat = (subject.match(/\b\d{5,8}\b/) || [''])[0];
        if (!oldMat || oldMat === newMat || subject.indexOf(oldMat) === -1) {
            return { value: subject, changed: false, oldMat: oldMat };
        }
        return { value: subject.split(oldMat).join(newMat), changed: true, oldMat: oldMat };
    };

    // ── 📜 선행 문서 참조 — 미리 읽기 ──────────────────────────────────────
    //  수치는 데이터로 — 참조 문서 하나 읽기가 실측 3~22초라 상한이 반드시 있어야 한다.
    window.APV_REF = window.APV_REF || {
        maxRefForms: 4,      // 한 번 작성에 읽을 **참조 양식** 수 상한
        listLimit: 80        // 프로젝트 문서 목록 상한(실측: 한 프로젝트 45건, 긴 것은 105건)
    };
    var BACKEND = 'http://127.0.0.1:5000';

    // 이 프로젝트를 가리키는 **검색어 후보** — 앞에 있는 것부터 써 보고, 걸리는 첫 번째를 쓴다.
    //  ⚠️ 짧은 말은 쓰지 않는다 — 두 글자면 남의 프로젝트가 통째로 걸린다.
    //  메일키워드가 가장 믿을 만하다 — 사람이 "이 프로젝트를 가리키는 말"로 직접 적어 둔 칸이다.
    var _apvProjectKeywords = function () {
        var pm = window.projectMeta || {};
        var cand = [];
        var push = function (s) {
            s = String(s == null ? '' : s).trim();
            if (s.length < 3) return;
            if (cand.indexOf(s) === -1) cand.push(s);
        };
        String(pm.메일키워드 || '').split(',').forEach(push);
        push(pm.모델명); push(pm.KTK모델명); push(pm.고객모델명);
        var pn = String(pm.프로젝트명 || '');
        if (pn.indexOf('>') >= 0) push(pn.split('>').pop());   // '고객사>모델' 이면 뒤쪽이 더 좁다
        push(pn);
        return cand;
    };

    // 이 프로젝트의 결재문서 목록 — **참조 문서를 남의 프로젝트에서 집지 않게** 하는 장치다.
    //  ⚠️⚠️ 양식만 보고 "최근 문서"를 집으면 **남의 프로젝트 코드**가 그대로 결재선을 탄다.
    var _apvProjectDocs = async function (ctx) {
        if (ctx._projDocs) return ctx._projDocs;
        var kws = _apvProjectKeywords();
        for (var i = 0; i < kws.length; i++) {
            try {
                var r = await fetch(BACKEND + '/gw/approval/doclist?box=all&duration=all&searchtype=title'
                    + '&limit=' + encodeURIComponent(window.APV_REF.listLimit)
                    + '&keyword=' + encodeURIComponent(kws[i]));
                var d = await r.json();
                var docs = (d && d.docs) || [];
                if (docs.length) { ctx._projDocs = { keyword: kws[i], docs: docs }; return ctx._projDocs; }
            } catch (e) { /* 다음 후보로 — 왜 못 찾았는지는 칸 출처에 적힌다 */ }
        }
        ctx._projDocs = { keyword: '', docs: [] };
        return ctx._projDocs;
    };

    // 🔎 [2026-11-09 공개] "이 프로젝트의 결재문서 찾기" 는 **여기 한 곳**이 정한다 —
    //    Document 페이지(js/67)도 이걸 쓴다. 두 벌로 두면 한쪽만 고쳐져서 "기안에선 찾는데
    //    문서 페이지에선 못 찾는다" 가 된다(CLAUDE.md: 같은 것을 정하는 코드가 둘이면 터진다).
    //    forms: 양식 이름 배열(비우면 전부). 돌려주는 값: { keyword, docs }
    window._apvProjectKeywords = _apvProjectKeywords;
    window._apvFindProjectDocs = async function (forms) {
        var pool = await _apvProjectDocs({});
        var want = (forms || []).map(_norm);
        var docs = (pool.docs || []).filter(function (x) {
            if (!want.length) return true;
            var key = window._apvFormKey ? window._apvFormKey(x.formName, x.title) : x.formName;
            return want.indexOf(_norm(x.formName)) >= 0 || want.indexOf(_norm(key)) >= 0;
        });
        // 최근 것이 위로 — 사람이 고르는 목록이다
        docs.sort(function (a, b) { return String(b.draftedAt || '').localeCompare(String(a.draftedAt || '')); });
        return { keyword: pool.keyword, docs: docs, total: (pool.docs || []).length };
    };

    // 그 목록에서 양식이 맞는 **가장 최근** 문서. 양식 열쇠(접두어 포함)로 맞춘다.
    var _apvNewestOf = function (docs, refForm) {
        var want = _norm(refForm);
        var best = null;
        (docs || []).forEach(function (x) {
            var key = window._apvFormKey ? window._apvFormKey(x.formName, x.title) : x.formName;
            if (_norm(key) !== want && _norm(x.formName) !== want) return;
            if (!best || String(x.draftedAt || '') > String(best.draftedAt || '')) best = x;
        });
        return best;
    };

    // 이 양식의 `from:'doc'` 규칙이 가리키는 참조 문서들을 **미리** 읽어 ctx.docs 에 담는다.
    //  ⚠️ 칸마다 읽으면 몇 분씩 걸린다 — SAP 조회를 한 번만 하는 것과 같은 이유.
    var _apvPrefetchRefDocs = async function (form, ctx, say) {
        var map = window.APPROVAL_FIELD_SOURCES[form] || {};
        var refs = [];
        Object.keys(map).forEach(function (k) {
            var r = map[k] || {};
            if (r.from !== 'doc') return;
            (r.ref || []).forEach(function (f) { if (refs.indexOf(f) === -1) refs.push(f); });
        });
        if (!refs.length) return;
        ctx.docs = ctx.docs || {};
        say && say('🔎 ' + _t('이 프로젝트의 선행 문서를 찾는 중입니다…', 'Finding earlier documents…'));
        var pool = await _apvProjectDocs(ctx);
        ctx.refKeyword = pool.keyword;
        ctx.refWanted = refs.slice();
        if (!pool.docs.length) {
            // 조용히 넘기지 않는다 — 왜 참조를 못 했는지 미리보기에 밝힌다.
            ctx.refNote = _t('이 프로젝트의 결재문서를 못 찾았습니다(검색어 후보: '
                             + (_apvProjectKeywords().join(', ') || '없음')
                             + ') — 선행 문서에서 가져오는 칸은 앱 값이나 빈칸으로 둡니다.',
                             'No approval documents found for this project.');
            return;
        }
        var read = 0;
        for (var i = 0; i < refs.length && read < window.APV_REF.maxRefForms; i++) {
            var hit = _apvNewestOf(pool.docs, refs[i]);
            if (!hit) continue;
            read++;
            say && say('📜 ' + refs[i] + ' (' + (hit.docNum || ('id:' + hit.id)) + ') '
                       + _t('를 읽는 중…', 'reading…'));
            try {
                var q = hit.docNum ? ('docNum=' + encodeURIComponent(hit.docNum))
                                   : ('docId=' + encodeURIComponent(hit.id));
                var rr = await fetch(BACKEND + '/gw/approval/read?' + q);
                var dd = await rr.json();
                if (!dd || !dd.ok) continue;
                // 참조 문서도 본문이 표인 양식일 수 있다 — 둘을 합쳐 본다(입력칸이 이긴다).
                var merged = {};
                Object.keys(dd.bodyFields || {}).forEach(function (k) { merged[k] = dd.bodyFields[k]; });
                Object.keys(dd.fields || {}).forEach(function (k) { merged[k] = dd.fields[k]; });
                ctx.docs[refs[i]] = { docNum: hit.docNum || ('id:' + hit.id), fields: merged };
            } catch (e) { /* 못 읽은 문서는 '없는 것'으로 — 사유는 칸 출처에 적힌다 */ }
        }
    };

    // 카탈로그 칸 이름 찾기 — 띄어쓰기만 다른 라벨도 같은 칸으로 본다.
    //  (본문 표 라벨은 리더가 공백을 한 칸으로 줄여 돌려주므로 글자가 미세하게 다를 수 있다)
    var _apvCatalogKey = function (form, label) {
        var map = window.APPROVAL_FIELD_SOURCES[form] || {};
        if (map[label]) return label;
        var want = _norm(label);
        var keys = Object.keys(map);
        for (var i = 0; i < keys.length; i++) if (_norm(keys[i]) === want) return keys[i];
        return label;
    };

    // ── 진입점 ─────────────────────────────────────────────────────────
    //  opts.asIs = true 면 **매핑하지 않고 원본 값 그대로** 쓴다(= "그대로 복사").
    //  확인 화면·적용 경로는 똑같이 쓴다 — 복사도 사람이 한 번 보고 넣는 게 맞다.
    //  🔎 [2026-10-28] docNum 없이 docId 만으로도 돌 수 있다(opts.docId) — 검색 결과에
    //  docNum 이 비어 있는 문서(임시저장/진행중)를 "id:12345"로만 본 뒤 복사해 달라고 하면
    //  이 경로다. docNum 자리에 id 숫자를 넣으면 100% 실패한다(docs/groupware.md 참고) —
    //  그래서 여기서 **아예 다른 쿼리 파라미터**로 보낸다.
    window.apvComposeFrom = async function (docNum, opts) {
        opts = opts || {};
        docNum = String(docNum || '').trim();
        var docId = String(opts.docId || '').trim();
        if (!docNum && !docId) { _toast('⚠️ ' + _t('참고할 문서번호가 필요합니다.', 'A source document number is required.'), 'error'); return; }
        if (window._gwEnsureLogin) {
            var g = await window._gwEnsureLogin();
            if (!g || !g.ok) { _toast('🔒 ' + ((g && g.message) || _t('그룹웨어 로그인이 필요합니다.', 'Groupware login required.')), 'error'); return; }
        }
        if (window.collectTabData) { try { window.collectTabData(); } catch (e) { /* 수집 실패해도 있는 값으로 */ } }

        _toast('📜 ' + _t('원본 기안을 읽는 중입니다…', 'Reading the source document…'), 'info');
        var src;
        try {
            var q = docNum ? ('docNum=' + encodeURIComponent(docNum)) : ('docId=' + encodeURIComponent(docId));
            var r = await fetch('http://127.0.0.1:5000/gw/approval/read?' + q);
            src = await r.json();
        } catch (e) { src = { ok: false, message: String(e && e.message || e) }; }
        if (!src || !src.ok) {
            _toast('⚠️ ' + _t('원본을 읽지 못했습니다: ', 'Could not read the source: ') + ((src && src.message) || ''), 'error');
            if (window._issueLog) { try { window._issueLog('approval-compose', { docNum: docNum, docId: docId, err: (src && src.message) || '' }); } catch (e2) { /* 기록 실패가 흐름을 막지 않게 */ } }
            return;
        }
        // 📛 매핑 열쇠는 **양식 이름 + 제목 접두어**다 — '기안서' 는 양식이 아니라 봉투라서
        //    formName 만으로는 [시제품 제작의뢰서]와 표준원가 문서가 한 덩어리가 된다(js/52).
        var formName = ((src.meta || {}).formName || '').trim();
        var form = (window._apvFormKey
            ? window._apvFormKey(formName, (src.meta || {}).title || src.subject || '')
            : formName) || formName;
        var srcFields = src.fields || {};

        // 🏭 자재번호를 줬고 이 양식에 SAP 출처 칸이 있으면 **한 번만** 조회한다.
        //    칸마다 부르면 SAP 가 느려서 몇 분씩 걸린다(docs/sap-lookup.md 의 46초 사고와 같은 종류).
        var ctx = { material: String(opts.material || '').trim(), sap: null, vendor: null };
        var needSap = !opts.asIs && ctx.material
            && Object.keys(window.APPROVAL_FIELD_SOURCES[form] || {})
                 .some(function (k) { return (window.APPROVAL_FIELD_SOURCES[form][k] || {}).from === 'sap'; });
        if (needSap) {
            _toast('🏭 ' + _t('SAP 에서 ' + ctx.material + ' 을 읽는 중입니다…', 'Reading ' + ctx.material + ' from SAP…'), 'info');
            try {
                var sr = await window._withTimeout(
                    fetch('http://127.0.0.1:5000/sap-material-rows?materials=' + encodeURIComponent(ctx.material)),
                    150000, _t('SAP 조회 시간 초과', 'SAP lookup timed out'));
                var sj = await sr.json();
                ctx.sap = (sj.materials || [])[0] || null;
                if (!ctx.sap) _toast('⚠️ ' + _t('SAP 에서 ' + ctx.material + ' 을 못 찾았습니다 — 그 칸은 비워둡니다.',
                                                'Material not found in SAP.'), 'error');
            } catch (e) {
                // 조용히 삼키지 않는다 — SAP 가 안 되면 그 칸이 왜 비었는지 알아야 한다.
                _toast('⚠️ ' + _t('SAP 조회 실패: ', 'SAP lookup failed: ') + (e && e.message ? e.message : e), 'error');
            }
        }
        // 🏢 공급업체(상호·주소·전화) — js/04h 승인원 흐름이 쓰는 경로를 **그대로 재사용**한다
        //    (ZMM006 → LIFNR → ZMM005). 처음엔 "중복 구현 피하자"고 비워뒀는데, 이미 있는
        //    기능을 안 쓰는 셈이라 사람이 매번 손으로 넣어야 했다(사용자 지적 2026-10-22).
        var needVendor = !opts.asIs && ctx.material
            && Object.keys(window.APPROVAL_FIELD_SOURCES[form] || {})
                 .some(function (k) { return (window.APPROVAL_FIELD_SOURCES[form][k] || {}).from === 'vendor'; });
        if (needVendor) {
            _toast('🏢 ' + _t('공급업체를 찾는 중입니다…', 'Looking up the supplier…'), 'info');
            try {
                var vr = await window._withTimeout(
                    fetch('http://127.0.0.1:5000/sap-vendor-info?material=' + encodeURIComponent(ctx.material)),
                    90000, _t('공급업체 조회 시간 초과', 'Vendor lookup timed out'));
                var vj = await vr.json();
                ctx.vendor = (vj && vj.vendor) || null;
                if (!ctx.vendor) _toast('⚠️ ' + _t('SAP 에 이 자재의 공급업체가 없습니다 — 그 칸은 비워둡니다. '
                                                   + '협력사 승인원 표지(.docx)가 있으면 기존 "원자재 승인원 기안" 흐름이 거기서 읽습니다.',
                                                   'No supplier in SAP for this material.'), 'error');
            } catch (e) {
                _toast('⚠️ ' + _t('공급업체 조회 실패: ', 'Vendor lookup failed: ') + (e && e.message ? e.message : e), 'error');
            }
        }

        // 새 기안에서 시스템이 채우는 칸은 애초에 다루지 않는다(원본 문서번호가 박힌다).
        var SKIP = ['문서번호', '작성일', '작성부서', '작성자', '제목', '기안부서', '기안자'];
        // ⚠️ 제목은 그동안 미리보기에 **안 보이고 고칠 수도 없었다** — 그런데 저장은 됐다.
        //    Item Code 는 새 자재인데 제목엔 옛 번호가 남아 결재선을 타는 상황이 된다(사용자 지적).
        var _sub = opts.asIs ? { value: src.subject || '', changed: false }
                             : _subjectWithMaterial(src.subject, srcFields, ctx.material);
        var subjRow = { label: _t('제목', 'Subject'), srcValue: src.subject || '', value: _sub.value,
                        from: _sub.changed ? (_t('자재번호 교체 ', 'material swapped ') + _sub.oldMat + '→' + ctx.material)
                                           : _t('원본 기안', 'source doc'),
                        kind: _sub.changed ? 'app' : 'source', note: '', isSubject: true };

        // 📜 선행 문서 참조 — 칸을 풀기 **전에** 미리 읽어 둔다(칸마다 읽으면 몇 분씩 걸린다).
        if (!opts.asIs) {
            await _apvPrefetchRefDocs(form, ctx, function (m) { _toast(m, 'info'); });
        }

        var rows = Object.keys(srcFields)
            .filter(function (k) { return SKIP.indexOf(k.replace(/\s/g, '')) === -1; })
            .map(function (k) {
                var d = opts.asIs
                    ? { value: srcFields[k] || '', from: _t('원본 기안', 'source doc'), kind: 'source' }
                    : _resolveOne(form, _apvCatalogKey(form, k), srcFields[k], ctx);
                return { label: k, srcValue: srcFields[k], value: d.value, from: d.from, kind: d.kind, note: d.note || '' };
            });

        // 📝 본문 표 칸 — 이 양식의 값이 **입력칸이 아니라 본문 표**에 있는 경우다.
        //   실측: 기안서[시제품 제작의뢰서] 는 fields 5개(시스템 값)뿐이고 내용 30칸이 전부 여기다.
        //   ⚠️ 이걸 안 다루면 "채웠다"면서 **원본 값이 그대로** 결재선을 타고 올라간다.
        var bodySrc = (src.bodyFields && typeof src.bodyFields === 'object') ? src.bodyFields : {};
        Object.keys(bodySrc).forEach(function (k) {
            if (SKIP.indexOf(k.replace(/\s/g, '')) !== -1) return;
            var d = opts.asIs
                ? { value: bodySrc[k] || '', from: _t('원본 기안', 'source doc'), kind: 'source' }
                : _resolveOne(form, _apvCatalogKey(form, k), bodySrc[k], ctx);
            rows.push({ label: k, srcValue: bodySrc[k], value: d.value, from: d.from,
                        kind: d.kind, note: d.note || '', isBody: true });
        });

        rows.unshift(subjRow);
        _apvOpen(docNum, docId, src, form, rows, opts.asIs, ctx.material, ctx);
    };

    // ── 미리보기 (칸마다 출처를 보여준다) ───────────────────────────────
    window._apvPending = null;
    var _apvOpen = function (docNum, docId, src, form, rows, asIs, material, ctx) {
        window._apvPending = { docNum: docNum, docId: docId, src: src, form: form, rows: rows,
                               asIs: !!asIs, material: material || '', ctx: ctx || {} };
        var ov = document.getElementById('apv-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'apv-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="apv-box" style="pointer-events:all; position:fixed; left:50%; top:8%; transform:translateX(-50%);'
                + ' width:min(1020px,94vw); max-height:80vh; display:flex; flex-direction:column; background:#fff; border:1px solid #a5c8f0;'
                + ' border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden; resize:both; min-width:580px; min-height:340px;">'
                + '<div id="apv-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px;'
                + ' padding:9px 12px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2; font-weight:bold; font-size:13px;'
                + ' cursor:grab; user-select:none;"><span id="apv-title"></span>'
                + '<button onclick="window._apvClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="apv-body" style="flex:1; overflow:auto; padding:10px 12px;"></div>'
                + '<div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center; gap:6px; padding:9px 12px; border-top:1px solid #e9ecef;">'
                + '<span id="apv-warn" style="font-size:11px; color:#b1432f;"></span>'
                + '<span><button onclick="window._apvClose()" style="padding:6px 12px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6;'
                + ' border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">' + _esc(_t('취소', 'Cancel')) + '</button> '
                + '<button id="apv-apply" onclick="window._apvApply()" onmouseover="this.style.background=\'#c9ecd3\'; this.style.borderColor=\'#7cc494\';"'
                + ' onmouseout="this.style.background=\'#e6f6ea\'; this.style.borderColor=\'#a8dab8\';"'
                + ' style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px;'
                + ' font-size:12px; font-weight:bold; cursor:pointer;">✅ ' + _esc(_t('이대로 임시저장', 'Save as draft')) + '</button></span></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('apv-box', 'apv-head'); } catch (e) { /* 드래그 실패가 열기를 막지 않게 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('apv-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('apv-overlay'); } catch (e) { /* 〃 */ } }
        _apvRender();
    };

    var KIND_STYLE = {
        app:    { bg: '#e6f6ea', fg: '#1f7a3d', icon: '📘' },
        learn:  { bg: '#e8f4fd', fg: '#1a4f7a', icon: '🧠' },
        source: { bg: '#f1f3f5', fg: '#495057', icon: '📜' },
        blank:  { bg: '#fff8e6', fg: '#7a5210', icon: '✏️' },
        miss:   { bg: '#fbe4e2', fg: '#b1432f', icon: '⚠️' }
    };

    var _apvRender = function () {
        var p = window._apvPending; if (!p) return;
        var pm = window.projectMeta || {};
        document.getElementById('apv-title').textContent =
            (p.asIs ? '📜 ' + _t('그대로 복사 — ', 'Copy as-is — ') : '📝 ' + _t('기안 작성 — ', 'Compose draft — ')) + p.form
            + _t(' / 참고 ', ' / from ') + (p.docNum || ('id:' + p.docId))
            + _t(' / 프로젝트 ', ' / project ') + (pm.프로젝트명 || pm.고객모델명 || _t('(안 열림)', '(none)'));

        var html = '<div style="margin-bottom:8px; font-size:11.5px; color:#868e96;">'
            + _esc(_t('칸마다 값이 어디서 왔는지 함께 표시했습니다. 고치면 그 값이 다음부터 이 양식에 먼저 제안됩니다.',
                      'Each field shows where its value came from. Edits are remembered for this form.'))
            + '</div><table style="border-collapse:collapse; width:100%; font-size:11.5px;"><thead><tr>'
            // 🐛 [2026-10-22 사용자 지적 "인식용이니 열 너비가 넓을 필요 없다"]
            //    ⚠️ 원인은 `styles.css` 의 전역 규칙 **`table { table-layout: fixed }`** 다.
            //    고정 레이아웃에서는 폭을 안 준 열이 **똑같이 n등분**되므로, ● 하나만 담는 열이
            //    '원본 기안 값' 열과 같은 폭을 차지했다(실측: 980px 표에서 5열 × 196px).
            //    → ● 열에만 폭을 준다. 나머지 네 열이 남는 폭을 고르게 나눠 갖는다.
            //    ⚠️ 여기서 다른 열에 `width:100%` 를 주면 **나머지가 0px 로 접힌다**(고정 레이아웃의
            //      성질 — 실측으로 확인). 폭은 ● 열 하나만 못박을 것.
            + [['', 'width:22px; padding:4px 2px;'],
               [_t('칸', 'Field'), ''],
               [_t('넣을 값', 'Value'), ''],
               [_t('출처', 'Source'), ''],
               [_t('원본 기안 값', 'Source doc'), '']].map(function (c) {
                return '<th style="background:#e7f3ff; border:1px solid #e9ecef; padding:4px 6px; text-align:left;'
                     + ' white-space:nowrap;' + c[1] + '">' + _esc(c[0]) + '</th>';
            }).join('') + '</tr></thead><tbody>';

        // 🔁 원본과 **달라진 칸**을 한눈에 — 안 그러면 네 칸을 눈으로 비교해야 한다(사용자 요청).
        //    바뀐 줄: 왼쪽에 ● 표시 + 줄 배경 + 값 칸 굵게 / 원본 값에 취소선.
        var changed = 0;
        p.rows.forEach(function (r, i) {
            var st = KIND_STYLE[r.kind] || KIND_STYLE.source;
            var isDiff = String(r.value || '') !== String(r.srcValue || '');
            if (isDiff) changed++;
            html += '<tr style="background:' + (isDiff ? '#fffbe6' : 'transparent') + ';">'
                + '<td style="border:1px solid #e9ecef; padding:3px 2px; text-align:center; width:22px; color:#e6a817; font-weight:bold;"'
                + ' title="' + _esc(isDiff ? _t('원본과 다름', 'changed') : '') + '">' + (isDiff ? '●' : '') + '</td>'
                // 📝 = 본문 표 안의 칸(입력칸이 아니다). 어디에 들어가는 값인지 보여야 한다.
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; white-space:nowrap; font-weight:bold;"'
                + (r.isBody ? ' title="' + _esc(_t('본문 표 안의 칸', 'cell inside the body table')) + '"' : '')
                + '>' + (r.isBody ? '📝 ' : '') + _esc(r.label) + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:2px 4px;"><input type="text" id="apv-v-' + i + '" value="' + _esc(r.value)
                + '" style="width:100%; box-sizing:border-box; padding:3px 5px; border:1px solid ' + (isDiff ? '#e6a817' : '#ced4da')
                + '; border-radius:4px; font-size:11.5px;' + (isDiff ? ' font-weight:bold;' : '') + '"></td>'
                // ⚠️ nowrap 금지 — '자재가 바뀌면 공급업체도 달라집니다' 같은 긴 사유가
                //    옆 칸(원본 기안 값)을 **덮어버린다**(실사용 화면에서 확인).
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; max-width:230px; word-break:break-word;'
                + ' background:' + st.bg + '; color:' + st.fg + ';">'
                + st.icon + ' ' + _esc(r.from) + (r.note ? ' <span style="opacity:.75;">(' + _esc(r.note) + ')</span>' : '') + '</td>'
                + '<td style="border:1px solid #e9ecef; padding:3px 6px; color:#868e96; max-width:220px; overflow:hidden;'
                + ' text-overflow:ellipsis; white-space:nowrap;' + (isDiff ? ' text-decoration:line-through;' : '') + '"'
                + ' title="' + _esc(r.srcValue) + '">' + _esc(r.srcValue || '-') + '</td></tr>';
        });
        html += '</tbody></table>';
        // 표 위에 요약 한 줄 — 스크롤하지 않고도 "몇 칸이 바뀌는지" 알 수 있어야 한다.
        html = '<div style="margin-bottom:6px; font-size:12px;">'
            + '<span style="color:#e6a817; font-weight:bold;">●</span> '
            + _esc(_t('원본과 달라지는 칸 ', 'changed from source: ')) + '<b>' + changed + '</b>'
            + _esc(_t('개 / 전체 ', ' of ')) + p.rows.length + _esc(_t('개', ''))
            + '</div>' + html;

        var miss = p.rows.filter(function (r) { return r.kind === 'miss'; }).length;
        var blank = p.rows.filter(function (r) { return r.kind === 'blank'; }).length;
        var chk = (p.src.checks || []);
        html += '<div style="margin-top:8px; font-size:11px; color:#666;">'
            + _esc(_t('체크 항목은 원본 그대로 들어갑니다: ', 'Checkboxes copied as-is: ')) + (chk.length ? _esc(chk.join(', ')) : '-')
            + '</div>';
        // ⚠️ 이 양식의 매핑이 아예 없으면 **모든 칸이 원본 그대로** 나온다 = 사실상 복사다.
        //    말 안 하면 사용자는 "틀로 작성을 눌렀는데 SAP도 프로젝트도 안 쓴다"로만 보인다(실제 제보).
        // ⚠️ 이 양식은 SAP 값이 필요한데 **자재번호를 안 받았다** — 그러면 SAP 를 아예 안 부른다.
        //    예전 메시지의 버튼을 누르면 그 값이 안 실려 있어 이 상태가 된다(실사용에서 "SAP 조회를
        //    못한다"로 보였다). 빈칸만 남기면 왜 비었는지 알 수 없으니 **크게 밝힌다.**
        if (!p.asIs && !p.material && window.APPROVAL_FIELD_SOURCES[p.form]
            && Object.keys(window.APPROVAL_FIELD_SOURCES[p.form]).some(function (k) {
                   return (window.APPROVAL_FIELD_SOURCES[p.form][k] || {}).from === 'sap'; })) {
            html += '<div style="margin-top:8px; padding:6px 9px; background:#fff3cd; border-left:3px solid #e6a817;'
                + ' border-radius:0 4px 4px 0; font-size:11.5px; color:#7a5210;">🏭 '
                + _esc(_t('자재번호를 안 받아서 SAP 조회를 하지 않았습니다 — Item Code·Model 같은 칸이 비어 있습니다. '
                          + '자재번호를 넣어 다시 요청하시면(예: "' + (p.docNum || p.docId) + ' 참고하고 132933 로 기안 작성해줘") 채워집니다.',
                          'No material number given, so SAP was not queried.'))
                + '</div>';
        }
        if (!p.asIs && !window.APPROVAL_FIELD_SOURCES[p.form]) {
            html += '<div style="margin-top:8px; padding:6px 9px; background:#fbe4e2; border-left:3px solid #b1432f;'
                + ' border-radius:0 4px 4px 0; font-size:11.5px; color:#b1432f;">'
                + _esc(_t('이 양식("' + p.form + '")은 아직 매핑이 없어 **모든 칸이 원본 그대로**입니다 — '
                          + '프로젝트·SAP 값을 쓰지 않았습니다. 바꿀 칸은 직접 고쳐주세요.',
                          'No mapping for "' + p.form + '" yet — every field is the source value.'))
                + '</div>';
        }
        if ((p.src.attachments || []).length) {
            html += '<div style="margin-top:4px; font-size:11px; color:#7a5210;">'
                + _esc(_t('원본 첨부 ' + p.src.attachments.length + '건은 가져오지 않습니다 — 새로 올려주세요.',
                          p.src.attachments.length + ' attachment(s) are not copied.')) + '</div>';
        }
        // 📋 [2026-10-29] 본문(자유 서식) — 이 양식의 본문은 입력칸들의 모음이 아니라
        //    **DEXT5 에디터 한 덩어리**라 칸마다 쪼개 보여줄 수가 없다(docs/groupware.md 8-0-3).
        //    대신 "원본 그대로 들어간다"는 사실과 **들어갈 내용 전부**를 보여준다 — 칸마다
        //    출처를 보여주는 이 모달의 원칙을 본문에서도 지키려면 이게 최선이다.
        // 📜 선행 문서 참조를 못 한 이유가 있으면 **먼저** 밝힌다 — 빈칸만 남기면 왜 비었는지 모른다.
        if (!p.asIs && (p.ctx || {}).refNote) {
            html += '<div style="margin-top:8px; padding:6px 9px; background:#fff3cd; border-left:3px solid #e6a817;'
                + ' border-radius:0 4px 4px 0; font-size:11.5px; color:#7a5210;">📜 ' + _esc(p.ctx.refNote) + '</div>';
        } else if (!p.asIs && (p.ctx || {}).refKeyword) {
            var _rd = Object.keys((p.ctx.docs) || {});
            html += '<div style="margin-top:8px; font-size:11px; color:#1f7a3d;">📜 '
                + _esc(_t('선행 문서 참조: 검색어 "' + p.ctx.refKeyword + '" 로 찾은 ',
                          'earlier docs via "' + p.ctx.refKeyword + '": '))
                + (_rd.length
                    ? _esc(_rd.map(function (f) { return f + '(' + p.ctx.docs[f].docNum + ')'; }).join(', '))
                    : _esc(_t('문서 중 참조할 양식이 없었습니다 — 앱 값이나 빈칸으로 둡니다',
                              'none of the referenced forms exist yet')))
                + '</div>';
        }
        var _bodyTxt = String(p.src.body || '').trim();
        var _bodyRows = p.rows.filter(function (r) { return r.isBody; });
        var _bodyDiff = _bodyRows.filter(function (r) { return String(r.value || '') !== String(r.srcValue || ''); });
        if (_bodyTxt) {
            html += '<div style="margin-top:8px; padding:6px 9px; background:#e8f4fd; border-left:3px solid #1a4f7a;'
                + ' border-radius:0 4px 4px 0; font-size:11.5px; color:#1a4f7a;">📋 '
                + _esc(p.asIs
                    ? _t('본문은 아래 내용이 원본 그대로 새 기안 본문에 들어갑니다.',
                         'The body is copied into the new draft exactly as shown below.')
                    : (_bodyRows.length
                        ? _t('본문 표의 칸 ' + _bodyRows.length + '개는 위 표에서 📝 로 표시했습니다 — '
                             + '그중 ' + _bodyDiff.length + '개를 프로젝트 값으로 바꿔 넣습니다. '
                             + '나머지 본문은 원본 그대로 들어갑니다.',
                             _bodyRows.length + ' body cells shown above with 📝 — '
                             + _bodyDiff.length + ' will be replaced.')
                        : _t('본문은 칸으로 쪼개지지 않아 원본 그대로 들어갑니다 — '
                             + '임시저장 뒤 그룹웨어에서 고쳐 주세요.',
                             'The body could not be split into cells, so it is copied as-is.')))
                + '</div>'
                + '<pre style="margin:6px 0 0; padding:7px 9px; background:#f8f9fa; border:1px solid #e9ecef;'
                + ' border-radius:4px; font-size:11px; line-height:1.5; max-height:220px; overflow:auto;'
                + ' white-space:pre-wrap; word-break:break-word;">' + _esc(_bodyTxt.slice(0, 4000)) + '</pre>';
        }
        document.getElementById('apv-body').innerHTML = html;
        document.getElementById('apv-warn').textContent =
            (miss ? _t('프로젝트에서 못 찾은 칸 ' + miss + '개', miss + ' field(s) not found') : '')
            + (miss && blank ? ' · ' : '')
            + (blank ? _t('일부러 비운 칸 ' + blank + '개', blank + ' intentionally blank') : '');
    };

    window._apvClose = function () {
        var ov = document.getElementById('apv-overlay');
        if (ov) ov.style.display = 'none';
        window._apvPending = null;
    };

    // ── 🔁 실행 루프 (docs/ai-harness-environment.md 4절) ────────────────────
    //  사람이 "이대로 임시저장"을 **한 번** 누르면, 거기서부터는 판정 실패를 스스로 고쳐 본다.
    //  원칙 셋 — 하나라도 빼면 자율이 아니라 사고가 된다:
    //   · **판정은 코드가 한다.** AI 에게 "확인해 줘"라고 묻지 않는다 — 자기가 만든 걸 자기가 본다.
    //     판정의 실물은 `approval_draft` 가 넣고 **되읽어** 찍는 `log` 다.
    //   · **AI 는 후보 중에서 고르기만 한다.** 화면에 실제로 없는 칸 이름을 돌려주면 버린다.
    //   · **상한이 반드시 있다.** 상한 없이 자동 판정을 돌렸다가 한 스윕 76연발로
    //     하루 AI 한도를 태운 적이 있다(2026-10-21).
    window.APV_LOOP = window.APV_LOOP || {
        maxRetries: 2,
        // 실패 사유 → 종류. 코드에 정규식을 박지 말고 **여기 한 줄** 추가할 것.
        //  structure = 다시 해도 같다(재시도 금지) · label/value = 값만 바꾸면 될 수 있다.
        kinds: [
            { kind: 'structure', re: /에디터를 찾지 못했|API 가 없습니다|작성 화면이 열리지|버튼을 찾지 못했/ },
            { kind: 'label', re: /해당 칸 없음|해당 체크박스 없음/ }
        ],
        fallback: 'value'
    };

    var _apvFailKind = function (why) {
        var cfg = window.APV_LOOP || {};
        var w = String(why || '');
        var hit = (cfg.kinds || []).filter(function (k) { return k.re.test(w); })[0];
        return hit ? hit.kind : (cfg.fallback || 'value');
    };

    var _apvAiText = function (res) {
        if (window._extractGanttQaAiText) {
            try { var t = window._extractGanttQaAiText(res); if (t) return String(t); } catch (e) { /* 아래 경로로 */ }
        }
        try { return String(res.data.result.candidates[0].content.parts[0].text || ''); } catch (e) { return ''; }
    };

    // 못 채운 칸을 어떻게 메울지 AI 에게 **후보 중에서** 고르게 한다.
    // ⚠️ 돌려받은 칸 이름이 화면에 실제로 없으면 버린다 — 지어낸 값이 결재선을 타면 안 된다.
    var _apvAskAiForFields = async function (failed, fieldNames, facts) {
        var key = window.getActiveAiKey && window.getActiveAiKey();
        if (!key || !window.callAiBackend) return { picked: {}, dropped: [], why: _t('AI 키가 없습니다', 'no AI key') };
        var lines = [];
        lines.push('전자결재 기안의 칸 채우기를 고치는 중입니다.');
        lines.push('');
        lines.push('[못 채운 항목]');
        failed.forEach(function (f) { lines.push('- ' + f.field + ' : ' + (f.why || '원인 미상')); });
        lines.push('');
        lines.push('[이 양식 화면에 실제로 있는 칸 이름]');
        lines.push(fieldNames.join(' / '));
        lines.push('');
        lines.push('[지금 열려 있는 프로젝트에서 쓸 수 있는 값]');
        lines.push(JSON.stringify(facts));
        lines.push('');
        lines.push('규칙:');
        lines.push('1. 칸 이름은 위 "실제로 있는 칸 이름" 목록에 있는 것만 쓸 것. 새로 지어내지 말 것.');
        lines.push('2. 값은 위 프로젝트 값에서 가져올 것. 확실하지 않으면 그 칸을 아예 넣지 말 것.');
        lines.push('3. 설명 없이 JSON 객체 하나만 답할 것.');
        lines.push('4. 채울 수 있는 칸이 없으면 빈 객체로 답할 것.');
        var raw = '';
        try {
            var res = await window._withTimeout(
                window.callAiBackend(key, lines.join('\n'), { feature: 'approval-loop' }),
                60000, _t('AI 응답 시간 초과', 'AI timed out'));
            if (!res || !res.ok) {
                return { picked: {}, dropped: [], why: String((res && res.error && res.error.message) || 'AI 호출 실패') };
            }
            raw = _apvAiText(res);
        } catch (e) { return { picked: {}, dropped: [], why: String(e && e.message || e) }; }

        var m = String(raw || '').match(/\{[\s\S]*\}/);
        if (!m) return { picked: {}, dropped: [], why: _t('AI 응답에서 JSON을 못 찾음', 'no JSON in AI reply') };
        var ans;
        try { ans = JSON.parse(m[0]); } catch (e) {
            return { picked: {}, dropped: [], why: _t('AI 응답이 JSON 이 아님', 'AI reply was not JSON') };
        }
        var picked = {}, dropped = [];
        Object.keys(ans || {}).forEach(function (k) {
            var name = String(k).trim();
            var v = ans[k];
            if (typeof v !== 'string' && typeof v !== 'number') return;
            v = String(v).trim();
            if (!v || v.length > 200) return;
            if (fieldNames.indexOf(name) === -1) { dropped.push(name); return; }   // 목록 밖은 버린다
            picked[name] = v;
        });
        return { picked: picked, dropped: dropped, why: '' };
    };

    var _apvPost = async function (path, body) {
        try {
            var r = await fetch('http://127.0.0.1:5000' + path, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            return await r.json();
        } catch (e) { return { ok: false, message: String(e && e.message || e) }; }
    };

    var _apvReportFail = function (p, res, where) {
        _toast('⚠️ ' + _t('임시저장 실패: ', 'Draft save failed: ') + ((res && res.message) || ''), 'error');
        if (window._issueLog) {
            try {
                window._issueLog('approval-compose', {
                    docNum: p.docNum, docId: p.docId, form: p.form,
                    where: where, err: (res && res.message) || ''
                });
            } catch (e) { /* 기록 실패가 흐름을 막지 않게 */ }
        }
    };

    window._apvApply = async function () {
        var p = window._apvPending; if (!p) return;
        var fields = {}, bodyEdits = {}, edited = 0, subject = null;
        p.rows.forEach(function (r, i) {
            var el = document.getElementById('apv-v-' + i);
            var v = el ? el.value : r.value;
            // 제목은 **입력칸이 아니다** — fields 에 넣으면 'Subject' 라는 칸을 찾다 실패한다.
            if (r.isSubject) { subject = v; return; }
            // 📝 본문 표 칸은 입력칸이 아니다 — fields 에 넣으면 "해당 칸 없음"으로 떨어지고,
            //    실행 루프가 그걸 메우려고 AI 를 부르다 상한만 태운다. 따로 보낸다.
            //    ⚠️ **바뀐 칸만** 보낸다 — 안 바뀐 칸까지 다시 쓰면 원본과 같은 글자를 덮어쓰는
            //       헛일이고, 못 찾은 라벨 경고만 늘어난다.
            if (r.isBody) {
                if (String(v) !== String(r.srcValue == null ? '' : r.srcValue)) bodyEdits[r.label] = v;
            } else {
                fields[r.label] = v;
            }
            // 사람이 고친 값만 적립한다 — 자동으로 나온 값까지 저장하면 사전이 금방 오염된다.
            // ⚠️ 아래 루프에서 AI 가 고른 값은 **적립하지 않는다**(같은 이유).
            if (String(v) !== String(r.value)) { _learnPut(p.form, r.label, v); edited++; }
        });

        var btn = document.getElementById('apv-apply');
        var warn = document.getElementById('apv-warn');
        var _say = function (t) { if (warn) warn.textContent = t || ''; };
        var _busy = function (t) { if (btn) { btn.disabled = true; btn.textContent = t; } };
        var _free = function () {
            if (btn) { btn.disabled = false; btn.textContent = '✅ ' + _t('이대로 임시저장', 'Save as draft'); }
        };
        var _sub = (subject === null ? undefined : subject);

        // 1) 작성 화면을 **한 번만** 열고 채운다. 아직 저장하지 않는다 — 판정이 먼저다.
        _busy(_t('⏳ 채우는 중…', '⏳ Filling…'));
        var first = await _apvPost('/gw/approval/copy', {
            docNum: p.docNum || undefined, docId: p.docNum ? undefined : p.docId,
            fields: fields, subject: _sub, dryRun: true,
            // 📝 본문 표 칸 바꿔치기 — copy 단계에서만 보낸다. 그다음 draft-fill 은 **같은 화면을
            //    다시 쓰므로**(reuseScreen) 에디터에 이미 들어간 본문이 그대로 남는다.
            bodyEdits: bodyEdits
        });
        if (!first || !first.ok) { _free(); _say(''); _apvReportFail(p, first, 'fill'); return; }

        var src = first.source || {};
        var notes = first.notes || [];
        var draft = first.draft || {};
        var MAX = (window.APV_LOOP || {}).maxRetries || 0;
        var tries = 0, loopNote = '', aiUsed = 0, aiDropped = 0;

        // 2) 판정 → 고치기 → 다시 채우기. **상한까지만.**
        while (true) {
            var log = draft.log || [];
            var names = draft.fieldNames || [];
            var failed = log.filter(function (x) { return !x.ok; });
            if (!failed.length) break;

            var structural = failed.filter(function (x) { return _apvFailKind(x.why) === 'structure'; });
            if (structural.length) {
                // 구조 문제는 백 번 해도 같다 — 재시도하지 않고 사실대로 알린다.
                loopNote = _t('구조 문제라 재시도 안 함: ', 'structural, not retried: ')
                    + structural.map(function (x) { return x.field; }).join(', ');
                break;
            }
            if (tries >= MAX || !names.length) {
                loopNote = tries ? _t('자동으로 ' + tries + '번 고쳐 봤지만 남았습니다',
                                      tries + ' auto-retries, still failing') : '';
                break;
            }
            tries++;
            _busy(_t('🤖 빈 칸 메우는 중… (' + tries + '/' + MAX + ')', '🤖 Retrying… (' + tries + '/' + MAX + ')'));
            _say(_t('못 채운 칸 ' + failed.length + '개 — AI에게 후보를 물어보는 중',
                    failed.length + ' unfilled — asking AI for candidates'));

            var facts = window._apvProjectFactScan ? window._apvProjectFactScan() : {};
            var got = await _apvAskAiForFields(failed, names, facts);
            aiDropped += (got.dropped || []).length;
            var keys = Object.keys(got.picked || {});
            if (!keys.length) {
                loopNote = _t('AI가 채울 칸을 못 찾았습니다', 'AI found nothing to fill')
                    + (got.why ? ' (' + got.why + ')' : '');
                break;
            }
            keys.forEach(function (k) { fields[k] = got.picked[k]; });
            aiUsed += keys.length;
            _say(_t('AI 제안 ' + keys.length + '개 적용 — 다시 채우는 중', 'applying ' + keys.length + ' — refilling'));

            // ⚠️ 여기서 /gw/approval/copy 를 다시 부르면 **원본 문서로 이동해 작성 화면을 떠난다.**
            //    지금 화면만 다시 채우는 draft-fill 을 쓴다(문서 id 도 더 안 생긴다).
            var again = await _apvPost('/gw/approval/draft-fill', {
                formId: src.formId, deptId: src.deptId, subject: _sub,
                fields: fields, dryRun: true, reuseScreen: true
            });
            if (!again || !again.ok) { _free(); _say(''); _apvReportFail(p, again, 'refill'); return; }
            draft = again;
        }

        // 3) 여기까지 왔으면 저장한다. **상신은 하지 않는다.**
        _busy(_t('⏳ 임시저장 중…', '⏳ Saving…'));
        _say('');
        var saved = await _apvPost('/gw/approval/draft-fill', {
            formId: src.formId, deptId: src.deptId, subject: _sub,
            fields: fields, dryRun: false, reuseScreen: true
        });
        _free();
        if (!saved || !saved.ok) { _apvReportFail(p, saved, 'save'); return; }

        // 못 채운 칸은 조용히 넘기지 않는다 — 어느 칸이 비었는지 사람이 알아야 한다.
        var finalFailed = (saved.log || []).filter(function (x) { return !x.ok; })
            .map(function (x) { return x.field; });
        // 본문은 '칸'이 아니라 위 목록만으로는 들어갔는지가 안 보인다 — 따로 알린다.
        //  ⚠️ 본문 관련 알림이 **둘 이상**이다(본문 넣기 / 본문 표 칸 바꾸기) — 첫 줄만 쓰면
        //     "표 칸을 몇 개 바꿨는지"가 조용히 사라진다.
        var bodyNote = notes.filter(function (n) { return /본문/.test(String(n)); }).join(' / ');

        if (finalFailed.length && window._issueLog) {
            try {
                window._issueLog('approval-compose', {
                    docNum: p.docNum, docId: p.docId, form: p.form,
                    where: 'loop', tries: tries, unfilled: finalFailed, note: loopNote
                });
            } catch (e) { /* 〃 */ }
        }

        _toast('📝 ' + _t('임시저장했습니다 — ', 'Saved as draft — ') + p.form
            + (bodyNote ? ' / ' + bodyNote : '')
            + (aiUsed ? _t(' / AI가 ' + aiUsed + '칸을 메웠습니다', ' / AI filled ' + aiUsed) : '')
            + (aiDropped ? _t(' / 없는 칸 ' + aiDropped + '개는 버렸습니다', ' / dropped ' + aiDropped) : '')
            + (edited ? _t(' / 고친 칸 ' + edited + '개는 다음에 먼저 제안됩니다', '') : '')
            + (finalFailed.length ? _t(' / 못 채운 칸: ', ' / not filled: ') + finalFailed.join(', ') : '')
            + (loopNote ? ' / ' + loopNote : ''), finalFailed.length ? 'info' : 'success');
        window._apvClose();
    };
})();
