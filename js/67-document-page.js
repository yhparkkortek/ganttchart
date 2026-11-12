// 📄 [2026-11-09] Document 페이지 — 문서를 골라 **그 자리에서 쓰고 그 모양 그대로 출력**한다
//
//   사용자 요청(2026-11-09, 2차):
//     · "PART 페이지처럼 메뉴는 클릭하면 드롭다운 되어서 선택할 수 있도록, 전체 UI 도 통일화"
//     · "문서 출력물은 작성된 문서 형식으로 출력되도록, 엑셀은 옵션 선택"
//     · "문서 양식을 가능한 동일하게", "UI 도 문서 스타일도 가능한 원본 문서와 비슷하게"
//     · "첨부가 필요한 곳에는 첨부를 넣을 수 있는 UI"
//
//  ■ 구조 — PARTS(js/23 `_toggleElecViewDropdown`)와 **같은 드롭다운**
//     헤더 `📄 <문서> ▾` 를 누르면 목록이 뜨고, 고르면 본문이 그 서식으로 바뀐다.
//     팝업은 앱 공용 클래스 `row-action-popup` 을 그대로 쓴다(UI 통일).
//
//  ■ 출력 — **문서 형식이 기본**, 엑셀은 옵션
//     `🖨 문서 출력` = 화면에 보이는 **그 문서 모양 그대로** 인쇄/PDF.
//        ⚠️ 2026-11-05 에 인쇄 버튼 11개를 없애고 Ctrl+P 로 돌렸는데, 여기는 **출력이 기능 자체**라
//           버튼을 둔다(사용자 요청). 누르면 하는 일은 `window.print()` 하나 —
//           준비(`beforeprint`)는 기존 경로를 그대로 탄다.
//     `📗 엑셀` / `📊 PPT`(가진 문서만) / `📁 NAS` 는 **옵션**이다.
//
//  ■ 서식이 곧 화면이고 곧 엑셀 (`DOC_FORMS`)
//     구역 종류: fields · table · text · attach · milestones · members · spec · materials
//     새 문서 = 항목 하나. 화면·엑셀·인쇄가 같이 따라온다.
//
//  ■ 값의 규칙 (js/47 기안 작성기와 같은 원칙)
//     자동값은 `_dgCollect()` 에서 오고 **저장하지 않는다** → 앱이 바뀌면 문서도 따라간다.
//     사람이 고친 값만 `tabData.documents[문서id].fields` 에 적히고 `↺` 로 되돌린다.
(function () {
    'use strict';

    var BACKEND = 'http://127.0.0.1:5000';
    var DOC_ROOT = 'DOCUMENT';
    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };

    // ── 📦 샘플 출고 이력 (데이터) ───────────────────────────────────────
    //   사용자 결정(2026-11-09): "제작 회차·출고 일자에 따라 샘플 출고 이력이 남아야 한다.
    //   문서번호를 부여할지 Proto A/B/C 로 할지 — 어떤 거래선은 ES·PP 를 쓰는 등 다양하니
    //   **기본은 PROTO A,B,C 로 가고 수정할 수 있게**."
    //   ⚠️ 그래서 회차는 **고르는 값이 아니라 적는 값**이다(기본값만 넣어 주고 자유 수정).
    //      거래선 어휘를 코드에 박으면 새 거래선마다 코드를 고쳐야 한다.
    window.DOC_SAMPLE_STAGES = window.DOC_SAMPLE_STAGES || ['PROTO A', 'PROTO B', 'PROTO C', 'ES', 'PP'];
    // 🔎 그룹웨어에서 찾아 고를 양식 (데이터) — 영업이 개발로 발행하는 의뢰서.
    //   ⚠️ 양식 이름은 그룹웨어가 돌려주는 **그대로**다(실측). 다른 이름이 늘면 여기 한 줄.
    window.DOC_REQ_FORMS = window.DOC_REQ_FORMS || ['샘플/시제품 의뢰서', '기안서[시제품 제작의뢰서]'];

    var MAT_ROWS = [
        { item: 'LCM(Panel)', cat: 'PANEL' },
        { item: 'A/D Board',  cat: 'AD BOARD' },
        { item: 'Converter',  cat: 'CONVERTER' },
        { item: 'TSP(Glass)', cat: 'TOUCH / GLASS' },
        { item: 'TSP CTRL',   cat: 'TOUCH CTRL' }
    ];
    // 시제품 제작의뢰서 구역 — Sample Report 안에도 **같은 표**가 들어간다(실측).
    //  ⚠️ 두 군데에 베껴 쓰지 않는다 — 한 번 만들어 양쪽이 같이 쓴다.
    var _protoReqSections = function () {
        return [
            // 📦 [2026-11-09 사용자 요청] 출고 이력은 **맨 위**다 — 이 문서가 "몇 회차의 샘플인가"
            //    를 먼저 보여 줘야 아래 내용을 읽을 수 있다(Sample Report 에서는 표지 바로 아래).
            { title: '# 샘플 출고 이력', kind: 'history' },
            {
                title: '시제품 제작의뢰서', cols: 2,
                fields: [
                    { key: '프로젝트 코드', from: 'meta.프로젝트코드' },
                    { key: '모델 담당자',   from: 'meta.HW담당자' },
                    { key: '기구 담당자',   from: 'meta.기구담당자' },
                    { key: 'FW 담당자',    from: 'meta.FW담당자' },
                    { key: '제품 코드',     from: 'meta.제품코드' },
                    { key: '모 델 명',      from: 'meta.모델풀네임' },
                    { key: 'B U Y E R',   from: 'meta.고객사' },
                    { key: '출고 요청일', label: '출고 요청 일자',
                      hint: '예: 2026-02-13 X 2 SET / 2026-03-12 X 22 SET' },
                    { key: '총 제작수량',   hint: '예: 36 (24고객 + 12개발검토)' },
                    { key: '조립 예상일', label: '조립 예상 일자', date: true },
                    { key: '출고 수량',     hint: '예: 24 (USA X 1 + UK X 1 + CTR X 22)' },
                    { key: '제작 기간',     hint: '예: 2026-02-02 ~ 2026-02-13' },
                    { key: '개발 단계',     hint: 'Proto A / Proto B / ES / PP' },
                    { key: '제작 회차',     hint: '예: 1' }
                ]
            },
            {
                // 🎯 전부 Customer SPEC 에서 온다(실측 이름) — F/W·EDID 는 js/43 이 보탠 항목이다.
                title: '광학 사양 · 펌웨어', cols: 2,
                fields: [
                    { key: 'X',  from: 'specX',  hint: '예: 0.305' },
                    { key: 'Y',  from: 'specY',  hint: '예: 0.335' },
                    { key: 'Lv', from: 'specLv', hint: '예: 500~550' },
                    { key: 'FW Ver',         from: 'specFw',   hint: '확정 전이면 비워 두세요' },
                    { key: 'EDID CHECK SUM', from: 'specEdid', hint: '예: DP 0x36' }
                ]
            },
            // 🖥 EDID 가 어떤 해상도를 어느 입력으로 받는가 — 고르는 건 팝업(js/69)이 한다.
            //   ⚠️ 여기엔 **고른 줄만** 찍는다(카탈로그가 150줄이 넘는다).
            { title: '# 지원 해상도 (RESOLUTION SPEC)', kind: 'resolution' },
            {
                title: '# 주요자재', kind: 'table',
                columns: ['항목', '코드', '부품 명', '비고'],
                rows: MAT_ROWS.map(function (m) {
                    return { cells: [{ fixed: m.item },
                                     { key: m.item + '|코드',  from: 'mat:' + m.cat + ':pn' },
                                     { key: m.item + '|부품명', from: 'mat:' + m.cat + ':desc' },
                                     { key: m.item + '|비고' }] };
                })
            },
            { title: '# 요청사항', kind: 'text', key: '요청사항',
              hint: '예: Auto GAMMA Calibration / CUTTING 모델 원자재 …' },
            { title: '# 참고 자료', kind: 'text', key: '참고자료',
              hint: '제품 spec / 패널 spec / Cutting 도면 등' }
        ];
    };

    // ── 📚 문서 서식 카탈로그 (데이터) ──────────────────────────────────
    window.DOC_FORMS = window.DOC_FORMS || [
        {
            id: 'proto-req', icon: '🧾', label: '시제품 제작의뢰서', folder: '시제품 제작의뢰서',
            // 🙈 [2026-11-11 사용자 결정] **목록에서 숨긴다** — Sample Report 가 이 7구역을
            //    통째로 품고 있어(원본 .docx 의 `TABLE#3` 이 바로 이것) 드롭다운에 둘 다 있으면
            //    "같은 문서를 두 번 쓰는 것"처럼 보인다. ⚠️ 지우지 않는다 —
            //    출고 이력의 주인(`HIST_FORM='proto-req'`)이고 구역 묶음(`_protoReqSections()`)도
            //    여기 있다. 되돌리려면 **이 한 줄만** 지우면 된다.
            hidden: true,
            note: '그룹웨어 기안의 본문 표와 같은 서식입니다(실측 RD3-2604-016).',
            nameOf: function (ctx) { return _projKey(ctx) + '_시제품 제작의뢰서_' + _today(); },
            sections: _protoReqSections()
        },
        {
            // 🧾 실측 원본: `260311_LNW_Slim Slot iDeck_KTBR14DPS01_Proto B_Sample Report_V00.docx`
            //    원본은 **7부 구성**이다(표지 뒤 '#문서 구분' 표에 그렇게 적혀 있다).
            //    ⚠️ SAMPLE CHECK SHEET(하드웨어·펌웨어·기구 6장, 300행 체크표)는 아직 안 넣었다 —
            //       넣을 땐 `kind:'check'` 를 새로 만들어 붙인다. 모르는 척하지 않고 적어 둔다.
            id: 'sample-report', icon: '📑', label: 'Sample Report (시제품)', folder: 'SAMPLE REPORT',
            perRound: true,   // 📦 회차마다 문서가 따로 생긴다(실측 원본 파일 이름에도 'Proto B' 가 들어 있다)
            note: '원본 구성: ①시제품 제작의뢰서 ②라벨 사양 ③검토 내역서(시제품팀) '
                + '④광학 측정 ⑤제작 특이사항 ⑥검토 내역서(제품보증팀) ⑦SPL Check sheet. '
                + '⑦ 체크시트(6장·300행)는 아직 안 들어갑니다.',
            nameOf: function (ctx) {
                var rd = (window._docState && window._docState.round) || '';
                return _ymd() + '_' + _projKey(ctx) + (rd ? '_' + rd : '') + '_Sample Report_V00';
            },
            sections: [
                {
                    title: 'Sample Report', kind: 'cover', cols: 2,
                    fields: [
                        { key: 'Customer',     from: 'meta.고객사' },
                        { key: 'Project Name', from: 'meta.프로젝트명' },
                        { key: 'Model Name',   from: 'meta.KTK모델명' },
                        // 📦 이 보고서가 **몇 회차의 샘플**인지 — 실측 원본 파일 이름에도 들어 있다
                        { key: 'Sample Stage', from: 'round' },
                        { key: 'ISSUE DATE',   from: 'today' }
                    ]
                }
            ].concat(_protoReqSections()).concat([
                {
                    title: '시제품 라벨 사양', cols: 1,
                    fields: [
                        { key: '라벨 인쇄 사양', hint: '라벨에 들어갈 내용(규격·인증 표시 등)' },
                        { key: '부착 위치',      hint: '예: 후면 Back cover 우측 하단' }
                    ]
                },
                { title: '라벨 도면 · 이미지', kind: 'attach', key: 'att_label',
                  hint: '라벨 도면이나 부착 위치 사진을 올려 주세요.' },
                {
                    title: '시제품 검토 내역서 (시제품팀)', cols: 2,
                    fields: [
                        { key: '작 성 일', label: '작성 일자', from: 'today' },
                        { key: '작 성 부 서', hint: '시제품팀' },
                        { key: '작 성 자' },
                        { key: '제품 출고일', label: '제품 출고 일자', date: true },
                        { key: '제 목',      hint: '예: LNW>COSMIC SLIM SLOT 15.6"(1/2) 샘플 의뢰서' },
                        { key: '요청부서',   from: 'meta.팀' },
                        { key: 'PM 담당자',  from: 'meta.프로젝트담당자' },
                        { key: '총 제작수량(검토)' },
                        { key: '출고 수량(검토)' }
                    ]
                },
                {
                    title: '시제품 검토 내역서 (제품 보증팀) · 광학 측정', cols: 2,
                    fields: [
                        { key: '접수일', label: '접수 일자', date: true },
                        { key: '검사일자', label: '검사 일자', date: true },
                        { key: 'Label No.' }, { key: '검사자' },
                        { key: '부적합 내역', hint: '없으면 "없음"' },
                        { key: '계측기',      hint: '예: CA-210' }
                    ]
                },
                {
                    title: '광학 측정 데이터', kind: 'table',
                    columns: ['Items', 'DP_1', 'DP_2', '비고'],
                    rows: [
                        { cells: [{ fixed: 'White Color x' }, { key: 'opt|x1' }, { key: 'opt|x2' }, { key: 'opt|xn' }] },
                        { cells: [{ fixed: 'White Color y' }, { key: 'opt|y1' }, { key: 'opt|y2' }, { key: 'opt|yn' }] },
                        { cells: [{ fixed: 'Luminance Lv' }, { key: 'opt|lv1' }, { key: 'opt|lv2' }, { key: 'opt|lvn' }] }
                    ]
                },
                // 🔬 [2026-11-12 요청] "Gamma tuning 로그로 샘플 광학 측정 이력을 남기고 싶다" —
                //    위 표는 사람이 손으로 두 지점만 적는 칸이고, 이건 **Gamma 리포트 zip(바코드별
                //    Final_Report.txt)을 통째로 가져와 자동으로 쌓는** 이력이다. 다른 이름이다.
                { title: '🔬 광학 측정 이력 (Gamma 리포트, 바코드별)', kind: 'optical' },
                {
                    title: 'OSD Control', cols: 2,
                    fields: [
                        { key: 'Brightness',    hint: '예: 75' },
                        { key: 'Contrast',      hint: '예: 50' },
                        { key: 'Color Temp',    hint: '예: 6500K' },
                        { key: 'R/G/B Setting', hint: '예: 128 / 128 / 128' }
                    ]
                },
                { title: '# 제품 외관', kind: 'attach', key: 'att_out',
                  hint: '외관 사진을 올려 주세요(여러 장 가능).' },
                { title: '# 제품 내부', kind: 'attach', key: 'att_in',
                  hint: '내부 사진을 올려 주세요.' },
                { title: '# 문제점 개선 요청', kind: 'attach', key: 'att_issue',
                  hint: '문제가 보이는 사진·자료를 올려 주세요.' },
                { title: '# 제작 특이사항', kind: 'text', key: '제작특이사항' },
                // ✅ SPL Check sheet — 항목은 js/68 `DOC_CHECK_SHEETS`(원본에서 기계로 뽑은 데이터)
                { title: 'SPL Check sheet', kind: 'check' },
                {
                    title: '디버깅 내역', cols: 2,
                    fields: [
                        { key: '디버깅 제목' },
                        { key: '발생 부문',  hint: '예: H/W, F/W - EMI' },
                        { key: '발생 일자', label: '발생 일자', date: true },
                        { key: '디버깅 담당자' },
                        { key: '문제 발생',  wide: true },
                        { key: '발생 요인',  wide: true },
                        { key: '해결 방법',  wide: true }
                    ]
                }
            ])
        },
        {
            id: 'stage-dr', icon: '📊', label: 'DR / DVR 발표자료', folder: 'DR_DVR 발표자료',
            builder: 'stage-dr', stages: ['Kickoff & Proto DR', 'Proto DR', 'DVR', 'PRA'],
            note: '도면·사진·블록도는 들어가지 않습니다(사람이 넣는 부분). PPT 로 받으면 슬라이드 6장입니다.',
            nameOf: function (ctx, opt) {
                return _projKey(ctx) + (ctx.meta.인치 ? '_' + ctx.meta.인치 + 'in' : '')
                     + '_' + ((opt && opt.stage) || 'DR') + '_V00_'
                     + (window._dgEnDate ? window._dgEnDate() : _today());
            },
            sections: [
                {
                    title: 'PROJECT SUMMARY', cols: 2,
                    fields: [
                        { key: '프로젝트 코드', from: 'meta.프로젝트코드' },
                        { key: '제품 코드',     from: 'meta.제품코드' },
                        { key: '모델명',        from: 'meta.모델풀네임' },
                        { key: '고객사',        from: 'meta.고객사' },
                        { key: '적용 목적',     from: 'overview.purpose', wide: true },
                        { key: '연간 수요량',   from: 'overview.volume' },
                        { key: '목표 양산 일정', from: 'overview.mpDate' },
                        { key: '추진 배경',     from: 'overview.background', wide: true },
                        { key: '추정 재료비',   hint: 'M.C Table 합계' },
                        { key: '예상 판매가' }
                    ]
                },
                { title: 'PROJECT SCHEDULE', kind: 'milestones' },
                { title: '프로젝트 조직',      kind: 'members' },
                { title: 'SPECIFICATION',    kind: 'spec' },
                { title: '주요 자재',          kind: 'materials' },
                { title: '참고 이미지 (도면 · 사진 · 블록도)', kind: 'attach', key: 'att_dr',
                  hint: 'PPT 에는 안 들어갑니다 — 화면·인쇄에만 보입니다.' }
            ]
        }
    ];

    var _pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var _today = function () { var d = new Date(); return d.getFullYear() + _pad(d.getMonth() + 1) + _pad(d.getDate()); };
    var _ymd = function () { var d = new Date(); return String(d.getFullYear()).slice(2) + _pad(d.getMonth() + 1) + _pad(d.getDate()); };
    var _todayDash = function () { var d = new Date(); return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()); };
    // 파일 이름의 프로젝트 부분 — 고객사·모델명에서 만든다.
    var _projKey = function (ctx) {
        var s = [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join('_') || 'PROJECT';
        return _safe(s);
    };
    // 윈도 폴더·파일에 못 쓰는 글자를 바꾼다.
    //  ⚠️ `고객사` 에 `LNW>STELLAR32` 처럼 **`>` 가 들어 있다**(실측) — 그대로 쓰면 폴더가 안 만들어진다.
    var _safe = function (s) {
        return String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
    };

    // ── 📁 프로젝트별 폴더 (사용자 결정 2026-11-09) ──────────────────────
    //   `DOCUMENT/<프로젝트>/`  · 그 안에 문서 파일, `attach/` 에 첨부.
    //   열쇠는 **프로젝트 코드를 앞에 붙인다** — 사람이 `고객사>프로젝트명` 을 고치면 모델명이
    //   바뀌어 폴더가 갈릴 수 있는데(이 저장소가 겪은 고장 모양), 코드는 한 번 채번하면
    //   안 바뀌므로 **코드로 같은 프로젝트임을 알아볼 수 있다**.
    //   ⚠️ 코드가 아직 없으면(채번 전) 고객사_모델명만 쓴다 — 그땐 이름이 바뀌면 폴더도 갈린다.
    //      그 경우 NAS 에서 옛 폴더를 손으로 합쳐야 한다(숨기지 않고 적어 둔다).
    //  📁📁 [2026-11-11 신고] 폴더 이름은 **앱 공용 규칙 하나**를 쓴다 —
    //     `window._dsCurrentProjectFolderName()`(js/48: 프로젝트 파일 이름에서 `.json` 뗀 것).
    //     CUSTOMER·SUMMARY·MC 가 전부 그걸 쓰므로 NAS 에 같은 꼴로 모인다:
    //       `LNW_STELLAR32_32.0` · `KONAMI_KGP-4_55.0` · `LNW_Digital Wheel Back-Box Display_32.0`
    //     ⚠️⚠️ 처음엔 여기서 **따로 조립**해서(`프로젝트코드_고객사_모델명`) 혼자만 달랐다 —
    //        실측 `G2608OB_LNW-STELLAR32_1641445-ALT1` vs 다른 폴더 `LNW_STELLAR32_32.0`.
    //        ① 프로젝트 코드가 앞에 붙고 ② `>` 를 `-` 로 바꿔 `LNW-` 가 되고 ③ 모델명 자리에
    //        KTK PN 이 들어가 **세 군데가 어긋났다**. 같은 것을 정하는 코드가 둘이면 갈라진다.
    //     ⚠️ 프로젝트를 안 연 상태(하네스·새 창)에서만 meta 로 만들어 쓴다.
    var _projFolderName = function (ctx) {
        if (window._dsCurrentProjectFolderName) {
            var shared = window._dsCurrentProjectFolderName();
            if (shared) return shared;
        }
        var name = _safe([ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join('_'));
        return name || 'ETC';
    };
    var _projFolder = function (ctx) { return DOC_ROOT + '/' + _projFolderName(ctx); };

    // 🗂🗂 [2026-11-09 사용자 요청] 문서마다 **제 폴더**를 둔다 — CUSTOMER 폴더와 같은 모양.
    //   `DOCUMENT/<프로젝트>/SAMPLE REPORT/` · `…/DR_DVR 발표자료/` · `…/시제품 제작의뢰서/`
    //   앞으로 서식을 늘리면 폴더도 **저절로** 는다(이름은 서식 데이터의 `folder`, 없으면 label).
    //   ⚠️ 폴더 이름에 `/` 를 쓰면 안 된다 — 윈도 경로에서 한 단계가 더 생긴다. 그래서
    //      'DR / DVR 발표자료' 는 폴더로는 `DR_DVR 발표자료` 다.
    var _formFolderName = function (form) {
        if (!form) return '';
        return _safe(form.folder || form.label);
    };
    var _docFolder = function (ctx, form) {
        var f = _formFolderName(form || _formById(window._docState.formId));
        return _projFolder(ctx) + (f ? '/' + f : '');
    };
    var _attFolder = function (ctx, form) { return _docFolder(ctx, form) + '/attach'; };

    // 📂 폴더를 **미리 만든다** — 사람이 NAS 탐색기를 열었을 때 자리가 보여야 한다.
    //   ⚠️ 폴더는 원래 뭔가를 쓰거나 읽을 때 생긴다(백엔드 `_docstore_dir`). 그래서 아무것도
    //      안 올린 프로젝트는 `DOCUMENT` 가 **텅 비어 있었다**(사용자 신고 2026-11-09, 실측 0건).
    //   ⚠️ 한 번 지난 폴더는 다시 안 만든다(SMB 왕복이 비싸다) · 실패해도 화면을 막지 않는다.
    var _mkdirSeen = {};
    // 한 번 만든 폴더를 다시 안 만들려고 기억해 둔다. 열쇠는 **전체 경로**라 프로젝트가 바뀌어도
    // 섞이지 않는다. (하네스가 같은 걸 두 번 재려면 이걸 비워야 한다 — 안 그러면 2회차가 0건이다)
    window._docResetFolderCache = function () { _mkdirSeen = {}; };
    var _docEnsureFolder = async function (rel) {
        if (!rel || _mkdirSeen[rel]) return;
        _mkdirSeen[rel] = 1;
        try {
            await fetch(BACKEND + '/doc/list?folder=' + encodeURIComponent(rel));
        } catch (e) { delete _mkdirSeen[rel]; }      // 다음에 다시 해 본다
    };
    window._docEnsureFolders = async function () {
        var ctx = _ctx();
        if (!ctx.meta || (!ctx.meta.고객사 && !ctx.meta.모델명 && !ctx.meta.프로젝트코드)) return;
        // 지금 고른 문서 폴더 먼저, 나머지 서식은 그다음(한 번에 다 만들어 둔다)
        var cur = _formById(window._docState.formId);
        // 🙈 숨긴 서식은 폴더도 안 만든다 — 아무도 거기에 올릴 수 없으니 팀 NAS 에
        //    빈 폴더만 남는다(이미 만들어 둔 것은 그대로 남아 있다 — 지우지 않는다).
        var forms = window._docVisibleForms().slice().sort(function (a, b) {
            return (a === cur ? -1 : 0) - (b === cur ? -1 : 0);
        });
        for (var i = 0; i < forms.length; i++) {
            await _docEnsureFolder(_docFolder(ctx, forms[i]));
        }
    };
    // 지금 열린 프로젝트의 사실 묶음 — 폴더를 물을 때마다 모은다(프로젝트가 바뀌면 폴더도 바뀐다).
    var _ctx = function () {
        return window._dgCollect ? window._dgCollect() : { meta: {} };
    };
    window._docFolderOf = function () { return _docFolder(_ctx()); };

    // ── 값 찾기 ────────────────────────────────────────────────────────
    // ⚠️⚠️ 항목 이름은 **참조 엑셀의 실제 이름**이다(2026-11-09 실측, 표준 28항목).
    //    처음엔 '휘도'·'Color Coordinate X' 처럼 지어낸 이름으로 적었다가 **한 칸도 안 맞았다**.
    //    · 색좌표는 **한 항목에 x/y 가 같이** 들어 있다(`0.305 / 0.335`) → `pick` 으로 쪼갠다.
    //    · F/W·EDID 는 참조 엑셀에 없어서 js/43 `BS_EXTRA_ITEMS` 로 보탰다(사용자 결정).
    var _SPEC_ALIAS = {
        specXY:   { names: ['Color coordinate(x/y)', '색좌표', 'Color Coordinate'] },
        specX:    { names: ['Color coordinate(x/y)', '색좌표', 'Color Coordinate'], pick: 0 },
        specY:    { names: ['Color coordinate(x/y)', '색좌표', 'Color Coordinate'], pick: 1 },
        specLv:   { names: ['Brightness(Centre. Min)', 'Brightness', '휘도', 'Luminance'] },
        specFw:   { names: ['F/W Version', 'FW Version', 'Firmware', '펌웨어'] },
        specEdid: { names: ['EDID Check Sum', 'EDID CHECK SUM', 'EDID'] },
        specTemp: { names: ['Color Temperature(K)', 'Color Temp'] },
        specRes:  { names: ['Native Resolution', '해상도', 'Resolution'] },
        specPanel:{ names: ['Panel'] },
        specVolt: { names: ['Input voltage', '입력 전압'] }
    };
    var _norm = function (s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); };
    var _SRC_WHERE = { meta: 'Summary ▸ 프로젝트 정보', overview: 'Summary ▸ 프로젝트 개요' };
    var _SRC_FIELD = {
        'meta.프로젝트코드': 'Summary ▸ 프로젝트 코드', 'meta.제품코드': 'Summary ▸ KTK PN',
        'meta.모델풀네임': 'Summary ▸ KTK PN_모델명', 'meta.고객사': 'Summary ▸ 고객사',
        'meta.프로젝트명': 'Summary ▸ 프로젝트명', 'meta.KTK모델명': 'Summary ▸ KTK 모델명',
        'meta.팀': 'Summary ▸ 팀',
        'overview.purpose': 'Summary ▸ 적용 목적', 'overview.volume': 'Summary ▸ 연간 수요량',
        'overview.mpDate': 'Summary ▸ 목표 양산 일정', 'overview.background': 'Summary ▸ 추진 배경',
        'today': '오늘 날짜'
    };
    var _srcLabel = function (from) {
        if (!from) return '';
        if (_SRC_FIELD[from]) return _SRC_FIELD[from];
        if (/담당자$/.test(from)) return 'Summary ▸ 프로젝트 멤버 (' + from.split('.').pop() + ')';
        if (from.indexOf('mat:') === 0) return 'Summary ▸ 주요 자재 (' + from.split(':')[1] + ')';
        if (_SPEC_ALIAS[from]) return 'Customer SPEC';
        return _SRC_WHERE[String(from).split('.')[0]] || from;
    };

    var _autoOf = function (ctx, from) {
        if (!from) return { v: '', src: '' };
        if (from === 'today') return { v: _todayDash(), src: _srcLabel(from) };
        // 📦 지금 보고 있는 회차 — 헤더의 회차 바가 정한다(출고 이력이 목록의 원본이다)
        if (from === 'round') {
            return { v: (window._docState && window._docState.round) || '',
                     src: _t('샘플 출고 이력 ▸ 회차', 'Shipping history ▸ stage') };
        }
        if (from.indexOf('mat:') === 0) {
            var p = from.split(':');
            var hit = (ctx.materials || []).filter(function (m) { return m.cat === p[1]; })[0];
            if (!hit) return { v: '', src: _t('주요자재에 ' + p[1] + ' 없음', 'no ' + p[1]) };
            return { v: (p[2] === 'desc' ? hit.desc : hit.pn) || '', src: _srcLabel(from) };
        }
        if (_SPEC_ALIAS[from]) {
            var rule = _SPEC_ALIAS[from];
            var want = rule.names.map(_norm);
            var row = (ctx.spec || []).filter(function (r) { return want.indexOf(_norm(r.label)) >= 0; })[0];
            if (!row) {
                return { v: '', src: _t('Customer SPEC 에 "' + rule.names[0] + '" 항목이 없음',
                                        'no "' + rule.names[0] + '" in Customer SPEC') };
            }
            var v = String(row.value == null ? '' : row.value).trim();
            // 한 항목에 둘이 들어 있는 칸(색좌표 `0.305 / 0.335`)은 쪼개서 쓴다.
            //  ⚠️ 못 쪼개면 **통째로 넣지 않는다** — x 칸에 "0.305 / 0.335" 가 들어가면 조용한 오답이다.
            if (rule.pick !== undefined && v) {
                var parts = v.split(/[\/,·]|\s{2,}/).map(function (x) { return x.trim(); }).filter(Boolean);
                v = (parts.length > rule.pick) ? parts[rule.pick] : '';
                if (!v) return { v: '', src: 'Customer SPEC ▸ ' + row.label
                    + _t(' (x/y 로 못 쪼갰습니다 — "0.305 / 0.335" 꼴로 적어 주세요)', ' (cannot split)') };
            }
            return { v: v, src: 'Customer SPEC ▸ ' + row.label };
        }
        var cur = ctx, parts = from.split('.');
        for (var i = 0; i < parts.length; i++) { if (cur == null) break; cur = cur[parts[i]]; }
        var v = (cur == null) ? '' : String(cur).trim();
        return { v: v, src: v ? _srcLabel(from) : _t('앱에 값 없음 — ', 'empty — ') + _srcLabel(from) };
    };

    // ── 사람이 적은 값 · 첨부 (프로젝트 파일에 저장) ─────────────────────
    //
    // 🔁 [2026-11-09] **회차마다 문서가 따로 생긴다** (사용자: "샘플 출고 이력마다 sample 리포트가
    //    새롭게 생겨야 하는 건데 … PROTO A,B,C,D,E… 문서가 계속 신규 생성되어야 함").
    //    실측 원본 파일 이름에도 회차가 들어 있다:
    //      `260311_LNW_Slim Slot iDeck_KTBR14DPS01_Proto B_Sample Report_V00.docx`
    //    → `perRound: true` 인 서식은 저장 열쇠에 회차를 붙인다(`sample-report@PROTO B`).
    //    ⚠️ 열쇠를 **여기 한 곳**에서만 만든다 — 칸·첨부·불러오기·엑셀이 전부 `_docData` 를 지나므로
    //       이 한 줄로 전부 회차별이 된다(화면마다 고치면 고친 화면만 산다).
    var _dataKey = function (id) {
        var form = _formById(id);
        if (!form || !form.perRound) return id;
        return id + '@' + (window._docState.round || _docRounds()[0] || 'PROTO A');
    };
    var _docData = function (id) {
        window.tabData = window.tabData || {};
        window.tabData.documents = window.tabData.documents || {};
        var k = _dataKey(id);
        var d = window.tabData.documents[k] = window.tabData.documents[k] || {};
        d.fields = d.fields || {};
        d.att = d.att || {};
        return d;
    };
    var _hasOwn = function (id, key) {
        return Object.prototype.hasOwnProperty.call(_docData(id).fields, key);
    };
    var _formById = function (id) {
        // ⚠️ 숨긴 서식도 **찾을 수 있어야 한다** — 출고 이력의 주인이 `proto-req` 이고,
        //    코드가 직접 고른 경우(하네스·되돌림)에도 그려져야 한다. 거르는 건 아래 하나뿐.
        return (window.DOC_FORMS || []).filter(function (f) { return f.id === id; })[0] || null;
    };
    // 🙈 사람에게 보이는 서식만 — 드롭다운·기본 선택·NAS 폴더 만들기가 **이 하나**를 쓴다.
    //    (세 곳이 각자 거르면 한 곳만 고쳐져 "목록엔 없는데 폴더는 생긴다"가 난다.)
    window._docVisibleForms = function () {
        return (window.DOC_FORMS || []).filter(function (f) { return !f.hidden; });
    };
    var _findField = function (id, key) {
        var form = _formById(id), found = null;
        (form ? form.sections : []).forEach(function (s) {
            (s.fields || []).forEach(function (f) { if (f.key === key) found = f; });
            (s.rows || []).forEach(function (r) {
                (r.cells || []).forEach(function (c) { if (c.key === key) found = c; });
            });
            if (s.kind === 'text' && s.key === key) found = s;
        });
        return found;
    };
    var _markDirty = function () {
        try { if (window.markUnsavedChanges) window.markUnsavedChanges(); } catch (e) { /* 없으면 넘어간다 */ }
    };

    window._docSetField = function (id, key, value) {
        var d = _docData(id);
        var ctx = window._dgCollect ? window._dgCollect() : {};
        var f = _findField(id, key);
        // ⚠️ 자동값과 같아지면 **저장에서 뺀다** — 안 빼면 앱 값이 바뀌어도 문서가 옛값을 든다.
        if (f && String(value) === String(_autoOf(ctx, f.from).v)) delete d.fields[key];
        else d.fields[key] = value;
        d.savedAt = new Date().toISOString();
        _markDirty();
    };
    window._docResetField = function (id, key) {
        delete _docData(id).fields[key]; _markDirty(); window._docRender();
    };

    // ── ✅ 점검표 항목 ─────────────────────────────────────────────────
    //  🖥 [2026-11-09 요청] `Resolution` 묶음은 **고정 48줄이 아니라 고른 해상도**다 —
    //     "SAMPLE CHECK SHEET(펌웨어) 3 / 해상도 부분도 # 지원 해상도 연결해서 필요한 것만".
    //     묶음 이름은 데이터(`DOC_CHECK_FROM_RESOLUTION`) — 원본을 다시 뽑아도 js/68 은 안 건드린다.
    //  ⚠️⚠️ 저장 열쇠는 **번호가 아니라 `id`** 다. 해상도 줄은 `res:<해상도열쇠>` 라서, 고른 목록이
    //     바뀌어도 체크가 **그 해상도를 따라간다**. 번호로 두면 해상도를 하나 더 고르는 순간
    //     아래 줄들의 체크가 통째로 밀려 **조용한 오답**이 된다.
    window.DOC_CHECK_FROM_RESOLUTION = window.DOC_CHECK_FROM_RESOLUTION || ['Resolution'];
    var RES_GROUPS = window.DOC_CHECK_FROM_RESOLUTION;

    // ➕ [2026-11-09 요청] 항목(묶음)마다 **내역을 더할 수 있다**.
    //   ⚠️ 저장은 `checkAdd['<시트>\u0000<묶음>'] = [{id, q}]` 이고 **id 는 만들 때 한 번** 정한다 —
    //      번호(자리)로 두면 앞 줄을 지우는 순간 아래 줄들의 체크가 통째로 밀린다(해상도와 같은 함정).
    //   ⚠️⚠️ **그리기만 해도 저장이 커지면 안 된다** — 읽기(`_checkAddRead`)는 없으면 빈 배열을
    //      돌려주기만 하고, 칸을 **만드는 건 더할 때뿐**이다. 처음엔 읽기에서도 만들었더니
    //      화면 한 번 그릴 때마다 묶음 21개가 빈 배열로 프로젝트 파일에 적혔다(실측).
    var _checkAddKey = function (sheetKey, group) { return sheetKey + '\u0000' + group; };
    var _checkAddRead = function (id, sheetKey, group) {
        var d = _docData(id);
        return (d.checkAdd && d.checkAdd[_checkAddKey(sheetKey, group)]) || [];
    };
    var _checkAdd = function (id, sheetKey, group) {
        var d = _docData(id);
        d.checkAdd = d.checkAdd || {};
        var k = _checkAddKey(sheetKey, group);
        d.checkAdd[k] = d.checkAdd[k] || [];
        return d.checkAdd[k];
    };
    window._docCheckAddRow = function (formId, sheetKey, group) {
        _checkAdd(formId, sheetKey, group).push({
            id: 'add' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), q: ''
        });
        _markDirty(); window._docRender();
    };
    window._docCheckDelRow = function (formId, sheetKey, group, rowId) {
        var list = _checkAdd(formId, sheetKey, group);
        var i = -1;
        list.forEach(function (r, n) { if (r.id === rowId) i = n; });
        if (i < 0) return;
        var q = String(list[i].q || '').trim();
        if (q && !confirm(_t('이 내역을 지웁니다:\n\n' + q + '\n\n체크한 것도 같이 사라집니다.', 'Delete this item?'))) return;
        list.splice(i, 1);
        _markDirty(); window._docRender();
    };

    var _sheetItems = function (sh, formId) {
        var out = [], done = {};
        var push = function (it) { out.push(it); };
        (sh.items || []).forEach(function (it, n) {
            if (RES_GROUPS.indexOf(it.g) < 0) { push({ g: it.g, q: it.q, id: String(n) }); return; }
            if (done[it.g]) return;                 // 묶음 전체를 **한 번만** 바꿔 넣는다
            done[it.g] = 1;
            var picked = window.resSelectedRows ? window.resSelectedRows() : [];
            picked.forEach(function (r) {
                var ports = (window.RES_PORTS || []).filter(function (p) { return r.ports[p.key]; })
                    .map(function (p) { return p.label; }).join('·');
                push({ g: it.g, q: r.label + (ports ? '  (' + ports + ')' : ''), id: 'res:' + r.key, res: true });
            });
            if (!picked.length) push({ g: it.g, q: '', id: 'res:none', empty: true });
        });
        // ➕ 사람이 보탠 내역을 **그 묶음 끝에** 붙인다(묶음이 끊기지 않게 — rowspan 이 연속을 본다)
        if (formId) {
            var groups = [];
            out.forEach(function (it) { if (groups.indexOf(it.g) < 0) groups.push(it.g); });
            var merged = [];
            groups.forEach(function (g) {
                out.forEach(function (it) { if (it.g === g) merged.push(it); });
                _checkAddRead(formId, sh.key, g).forEach(function (r) {
                    merged.push({ g: g, q: r.q || '', id: r.id, added: true });
                });
            });
            out = merged;
        }
        return out;
    };

    // ── 📦 회차 (샘플 출고 이력이 곧 회차 목록이다) ──────────────────────
    //   ⚠️ 회차는 **출고 이력 한 곳**에서만 온다 — 따로 목록을 두면 "이력엔 있는데 문서는 없다"
    //      가 생긴다. 이력에 회차를 더하면 그 회차의 Sample Report 가 **그 자리에서 생긴다**.
    var HIST_FORM = 'proto-req';         // 이력의 주인 — 어느 문서를 보고 있든 같은 목록이다

    // 📦📦 [2026-11-09 사용자 요청] **한 단계 안에서도 회차가 여럿일 수 있다**
    //   ("PROTO A 에서도 회차가 있을 수 있음 / 각 단계에서 1,2,3,4,5 회차로 제작할 수 있는 경우")
    //   → 샘플 하나를 가리키는 이름은 **단계(stage) + 회차(seq)** 다.
    //   ⚠️⚠️ 1차는 **단계 이름 그대로**다(`PROTO A`). 꼬리를 붙이면 이미 적어 둔 문서의 저장 열쇠
    //      (`sample-report@PROTO A`)가 어긋나 **그동안 쓴 내용이 통째로 안 보인다**.
    //      2차부터만 `PROTO A 2차` 가 된다.
    var _roundLabel = function (r) {
        var st = String((r && r.stage) || '').trim();
        var sq = String((r && r.seq) || '').trim();
        if (!st) return '';
        if (!sq || sq === '1') return st;
        return st + ' ' + sq + _t('차', '');
    };
    window._docRoundLabel = _roundLabel;

    var _docRounds = function () {
        var out = [];
        (_hist() || []).forEach(function (r) {
            var s = _roundLabel(r);
            if (s && out.indexOf(s) === -1) out.push(s);
        });
        if (!out.length) out.push((window.DOC_SAMPLE_STAGES || ['PROTO A'])[0]);
        return out;
    };
    window._docRounds = _docRounds;

    // ── 상태 ───────────────────────────────────────────────────────────
    window._docState = window._docState || { formId: null, stage: 'Proto DR', round: '' };
    window._docPick = function (id) {
        window._docState.formId = id;
        try { localStorage.setItem('gantt_doc_last_form', id); } catch (e) { /* 무시 */ }
        var pop = document.getElementById('doc-form-dropdown');
        if (pop) pop.style.display = 'none';
        window._docRender();
    };
    window._docSetStage = function (v) { window._docState.stage = v; window._docRender(); };
    /** ✅ 점검요청만 보기 ↔ 전체 보기 */
    window._docToggleChkOnly = function () {
        window._docState.chkOnly = !window._docState.chkOnly;
        window._docRender();
    };
    /** 🙈 [2026-11-12 요청] 점검요청 '해당없음' 항목 접기 ↔ 펴기 (기본 접힘, Resolution 묶음은 예외) */
    window._docToggleHideNA = function () {
        window._docState.hideNA = (window._docState.hideNA === false) ? true : false;
        window._docRender();
    };
    /** 📂 [2026-11-12 3차 요청] SPL Check sheet 장(시트) 하나만 접기 ↔ 펴기 */
    window._docToggleSheetCollapse = function (sheetKey) {
        window._docState.chkSheetCollapsed = window._docState.chkSheetCollapsed || {};
        window._docState.chkSheetCollapsed[sheetKey] = !window._docState.chkSheetCollapsed[sheetKey];
        window._docRender();
    };

    // ── 📦 회차 넘기기 (M.C Table·BOM 의 제품구분자 바와 **같은 장치**) ───
    //   ⚠️ 새로 디자인하지 않는다 — 삼각형 ◀ ▶ 로 앞뒤 회차를 넘기고, 가운데 버튼은 누를 때마다
    //      다음 회차로 돈다(`unit-cycle-btn` 과 같은 모양). 사람이 이미 아는 동작이다.
    window._docRoundGo = function (delta) {
        var rounds = _docRounds();
        var i = rounds.indexOf(window._docState.round);
        if (i < 0) i = 0;
        window._docState.round = rounds[((i + delta) % rounds.length + rounds.length) % rounds.length];
        window._docRender();
    };
    window._docSetRound = function (v) {
        window._docState.round = v;
        window._docRender();
    };
    /** 회차를 하나 더 만든다 = 출고 이력에 한 줄 더하고 그 회차로 간다(문서가 새로 생긴다) */
    /**
     * 헤더 ➕ — `same` 이면 **지금 단계의 다음 회차**, 아니면 **다음 단계** 1차.
     *  ⚠️ 보고 있는 문서가 PROTO A 인데 ➕ 가 PROTO B 만 만들면 "PROTO A 2차" 를 만들 길이 없다.
     */
    window._docRoundAdd = function (same) {
        var made = window._docHistAdd(!!same);
        var rounds = _docRounds();
        window._docState.round = made || rounds[rounds.length - 1];
        window._docRender();
        _toast('📦 ' + (window._docState.round || '') + _t(' 문서를 만들었습니다.', ' created.'), 'success');
    };
    /**
     * 🔗 그 줄의 샘플/시제품 의뢰서를 **그룹웨어에서 연다**.
     *  ⚠️ 사람이 로그인해 둔 곳은 **전용 크롬**이라 앱 쪽 브라우저로 열면 로그인 화면만 뜬다
     *     → 백엔드가 전용 크롬에 새 탭을 띄운다. 그 길이 막히면(구버전 백엔드·크롬 꺼짐)
     *     주소를 알고 있을 때만 이 브라우저에서 열어 본다(막다른 길을 만들지 않는다).
     */
    window._docOpenReq = async function (i) {
        var list = _hist();
        var r = list[i];
        if (!r) return;
        var num = String(r.doc || '').trim();
        if (!num && !r.docId) {
            _toast('⚠️ ' + _t('먼저 [🔎 그룹웨어에서 찾기]로 의뢰서를 고르세요.', 'Pick a document first.'), 'error');
            return;
        }
        _toast('🔗 ' + _t('그룹웨어에서 여는 중…', 'Opening…'), 'info');
        var res = null;
        try {
            var resp = await fetch(BACKEND + '/gw/open-doc', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docId: r.docId || '', docNum: num })
            });
            res = await resp.json();
        } catch (e) { res = { ok: false, message: String(e && e.message || e) }; }
        if (res && res.ok) {
            // 연 주소를 기억해 둔다 — 다음엔 찾는 단계를 건너뛴다
            if (res.url && r.docUrl !== res.url) { r.docUrl = res.url; r.docId = res.docId || r.docId; _markDirty(); }
            _toast('🔗 ' + _t('그룹웨어 창에서 열었습니다.', 'Opened in the groupware window.'), 'success');
            return;
        }
        var url = r.docUrl || '';
        if (url) {
            var w = window.open(url, '_blank');
            _toast(w ? '🔗 ' + _t('새 탭에서 열었습니다 — 로그인이 필요할 수 있습니다.', 'Opened in a new tab.')
                     : '⚠️ ' + _t('팝업이 막혔습니다: ', 'Popup blocked: ') + url, w ? 'info' : 'error');
            return;
        }
        _toast('⚠️ ' + ((res && res.message) || _t('그룹웨어 창을 열지 못했습니다.', 'Could not open.'))
               + _t(' (백엔드를 재시작하면 이 기능이 켜집니다)', ''), 'error');
    };

    /** 출고 이력 줄에서 그 회차의 Sample Report 로 바로 간다 */
    window._docGoRound = function (stage, formId) {
        var s = String(stage || '').trim();
        if (!s) { _toast('⚠️ ' + _t('회차 이름을 먼저 적어 주세요.', 'Type a stage name first.'), 'error'); return; }
        window._docState.round = s;
        window._docPick(formId || 'sample-report');
    };

    // ── 📄 드롭다운 (PARTS 와 같은 방식·같은 팝업 클래스) ────────────────
    window._toggleDocFormDropdown = function (ev) {
        if (ev) ev.stopPropagation();
        var pop = document.getElementById('doc-form-dropdown');
        if (!pop) return;
        if (pop.style.display === 'block') { pop.style.display = 'none'; return; }
        var cur = window._docState.formId;
        pop.innerHTML = window._docVisibleForms().map(function (f) {
            var on = f.id === cur;
            return '<div onclick="window._docPick(\'' + _esc(f.id) + '\')"'
                 + ' style="padding:8px 10px; cursor:pointer; border-radius:4px; font-size:13px;'
                 + ' font-weight:bold; white-space:nowrap;'
                 + ' background:' + (on ? '#00707d' : 'transparent') + '; color:' + (on ? '#fff' : '#333') + ';"'
                 + ' onmouseover="if(this.style.background!==\'rgb(0, 112, 125)\') this.style.background=\'#f1f3f5\';"'
                 + ' onmouseout="if(this.style.background!==\'rgb(0, 112, 125)\') this.style.background=\'transparent\';">'
                 + (f.icon || '📄') + ' ' + _esc(f.label)
                 + (f.builder ? '<span style="margin-left:6px; font-size:10px; font-weight:normal; opacity:.7;">PPT</span>' : '')
                 + '</div>';
        }).join('');
        // 📍 [2026-11-11 신고 "드롭다운 가려짐"] 자리를 **직접 잡는다** — PARTS 와 같은 방식
        //    (js/23 `_toggleElecViewDropdown`: `rect.left` · `rect.bottom + 4`).
        //    ⚠️⚠️ `.row-action-popup` 은 `position:fixed` 인데 제 `top/left` 가 없다. 안 잡아 주면
        //       **문서 흐름상의 자리**에 떠서 트리거(실측 105~133px)보다 위인 63px 에 그려지고,
        //       그 자리는 프로젝트 탭 띠 밑이라 **첫 항목이 가린다**(사용자 화면).
        var btn = document.getElementById('doc-form-trigger');
        if (btn) {
            var rect = btn.getBoundingClientRect();
            pop.style.left = rect.left + 'px';
            pop.style.top = (rect.bottom + 4) + 'px';
        }
        pop.style.display = 'block';
    };
    document.addEventListener('click', function () {
        var pop = document.getElementById('doc-form-dropdown');
        if (pop && pop.style.display === 'block') pop.style.display = 'none';
    });

    // ── 📎 첨부 ────────────────────────────────────────────────────────
    //  바이트는 **NAS 에** 올리고 문서엔 참조만 둔다(프로젝트 파일이 비대해지지 않게 —
    //  메일 본문을 밖으로 뺀 것과 같은 이유). 올리기 실패를 조용히 삼키지 않는다.
    window._docAttachPick = function (id, key) {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.multiple = true;
        inp.onchange = function () { window._docAttachAdd(id, key, inp.files); };
        inp.click();
    };
    window._docAttachAdd = async function (id, key, files) {
        files = [].slice.call(files || []);
        if (!files.length) return;
        if (!window._dgUploadBlob) { _toast('⚠️ ' + _t('업로드 기능을 불러오지 못했습니다.', 'Upload unavailable.'), 'error'); return; }
        var d = _docData(id);
        d.att[key] = d.att[key] || [];
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var nm = _today() + '_' + id + '_' + key + '_' + (f.name || ('file' + i));
            nm = nm.replace(/[\\/:*?"<>|]/g, '-');
            _toast('⏳ ' + (f.name || '') + ' ' + _t('올리는 중…', 'uploading…'), 'info');
            var r = await window._dgUploadBlob(_attFolder(_ctx()), nm, f);
            if (r.ok) {
                // 🗂 올린 **폴더를 같이 적는다** — 나중에 폴더 규칙을 바꿔도 옷 첨부가 살아있어야 한다.
                //   (적어 두지 않으면 규칙을 바꾸는 순간 올려 둔 파일이 전부 404 가 된다)
                d.att[key].push({ name: r.name || nm, orig: f.name || '', size: r.size || f.size || 0,
                                  type: f.type || '', at: new Date().toISOString(),
                                  folder: _attFolder(_ctx()) });
                _markDirty();
            } else if (!r.skipped) {
                // 조용히 넘기지 않는다 — 첨부가 "들어간 줄 알았는데 없는" 게 제일 나쁘다.
                _toast('⚠️ ' + (f.name || '') + ' — ' + _t('올리지 못했습니다: ', 'upload failed: ') + (r.error || ''), 'error');
            }
        }
        window._docRender();
    };
    window._docAttachRemove = function (id, key, idx) {
        var d = _docData(id);
        var list = d.att[key] || [];
        if (idx < 0 || idx >= list.length) return;
        // ⚠️ NAS 파일은 지우지 않는다 — 문서에서 뗄 뿐이다(팀 공유라 되돌릴 수 없다).
        if (!confirm(_t('이 문서에서 첨부를 뗍니다(NAS 파일은 그대로 둡니다):\n\n' + (list[idx].orig || list[idx].name),
                        'Remove this attachment from the document?'))) return;
        list.splice(idx, 1);
        _markDirty(); window._docRender();
    };
    // ⚠️ 체부 주소는 **그 파일을 올렸던 폴더**로 만든다. 폴더 규칙이 바뀜기 전에 올린 것은
    //    `folder` 가 없으므로 **옷 자리**(`DOCUMENT/<프로젝트>/attach`)를 본다.
    var _attUrl = function (a) {
        var folder = (a && a.folder) || (_projFolder(_ctx()) + '/attach');
        var name = (a && a.name) || a;
        return BACKEND + '/doc/get?folder=' + encodeURIComponent(folder) + '&name=' + encodeURIComponent(name);
    };

    // ── 🔬 광학 측정 이력 (Gamma 리포트 zip, 바코드별) ────────────────────
    //  2026-11-12 요청 — 샘플 광학 측정 이력을 Gamma tuning 로그로 남긴다. Final_Report.txt 는
    //  완전 고정 포맷이라 **AI 없이** 백엔드 정규식 파서(`/doc/parse-optical-zip`)로 구조화한다
    //  (실측 16개 샘플 전부 같은 라벨·같은 표 모양). Log_File.txt(원시 보정 로그)는 파싱하지
    //  않고 증적으로만 같이 보관한다. ⚠️ 미리보기 승인 전엔 저장하지 않는다(이 앱의 모든
    //  가져오기와 같은 규칙) · ⚠️ NAS 업로드는 **기존 `_dgUploadBlob`(/doc/put) 재사용** —
    //  쓰기 경로를 두 벌로 만들지 않는다.
    window._docOpticalPick = function (formId) {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.zip';
        inp.onchange = function () { if (inp.files && inp.files[0]) window._docOpticalImport(formId, inp.files[0]); };
        inp.click();
    };
    window._docOpticalImport = async function (formId, file) {
        _toast('⏳ ' + _esc(file.name) + ' ' + _t('zip 을 열어 읽는 중…', 'reading zip…'), 'info');
        var fd = new FormData();
        fd.append('file', file, file.name);
        var body = null;
        try {
            var res = await fetch(BACKEND + '/doc/parse-optical-zip', { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
            body = await res.json();
        } catch (e) {
            _toast('⚠️ ' + _t('zip 을 읽지 못했습니다: ', 'failed to read zip: ') + (e.message || e), 'error'); return;
        }
        if (!body || !body.ok) { _toast('⚠️ ' + ((body && body.error) || _t('알 수 없는 오류', 'unknown error')), 'error'); return; }
        if (!body.items || !body.items.length) {
            _toast('⚠️ ' + _t('이 zip 에서 읽을 수 있는 리포트가 없습니다.', 'No readable reports in this zip.'), 'error'); return;
        }
        window._docOpticalPending = { formId: formId, items: body.items, picked: body.items.map(function () { return true; }) };
        if (body.warnings && body.warnings.length) {
            _toast('ℹ️ ' + body.warnings.length + _t('건은 건너뛰었습니다(형식이 다름).', ' item(s) skipped (unrecognized format).'), 'info');
        }
        _docOpticalPreview();
    };
    var _docOpticalPreview = function () {
        var p = window._docOpticalPending; if (!p) return;
        var existing = {};
        (_docData(p.formId).opticalLogs || []).forEach(function (it) { existing[it.barcode] = true; });
        var ov = document.getElementById('docopt-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'docopt-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9500; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="docopt-box" style="pointer-events:all; position:fixed; left:50%; top:8%;'
                + ' transform:translateX(-50%); width:min(760px,94vw); max-height:82vh; display:flex; flex-direction:column;'
                + ' background:#fff; border:1px solid #a3d9e0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18);'
                + ' overflow:hidden;">'
                + '<div id="docopt-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between;'
                + ' padding:9px 12px; background:#e0f5f7; border-bottom:1px solid #a3d9e0; color:#00707d;'
                + ' font-weight:bold; font-size:13px; cursor:grab;"><span id="docopt-title"></span>'
                + '<button onclick="window._docOpticalCancel()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="docopt-body" style="flex:1; min-height:0; overflow-y:auto; padding:10px 12px;"></div>'
                + '<div style="flex-shrink:0; display:flex; justify-content:flex-end; gap:6px; padding:9px 12px; border-top:1px solid #e9ecef;">'
                + '<button onclick="window._docOpticalCancel()" style="padding:6px 12px; background:#f1f3f5; color:#495057;'
                + ' border:1px solid #dee2e6; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">'
                + _esc(_t('취소', 'Cancel')) + '</button>'
                + '<button id="docopt-apply-btn" onclick="window._docOpticalApply()" style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d;'
                + ' border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">✅ '
                + _esc(_t('선택한 항목 가져오기', 'Import selected')) + '</button></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('docopt-box', 'docopt-head'); } catch (e) { /* 〃 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('docopt-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('docopt-overlay'); } catch (e) { /* 〃 */ } }
        document.getElementById('docopt-title').textContent =
            '📥 ' + _t('광학 측정 이력 가져오기 — ', 'Import optical history — ') + p.items.length + _t('건', ' item(s)');
        var rows = p.items.map(function (it, i) {
            var dup = !!existing[it.barcode];
            var pqOk = it.pqFail === 0;
            return '<tr' + (dup ? ' style="opacity:.55;"' : '') + '>'
                + '<td style="text-align:center;"><input type="checkbox" ' + (p.picked[i] && !dup ? 'checked' : '')
                + (dup ? ' disabled' : '') + ' onchange="window._docOpticalTogglePick(' + i + ',this.checked)"></td>'
                + '<td>' + _esc(it.barcode) + (dup ? ' <span style="font-size:10px; color:#b1432f;">('
                  + _esc(_t('이미 있음', 'already have')) + ')</span>' : '') + '</td>'
                + '<td style="font-size:11px;">' + _esc(it.startTime) + '</td>'
                + '<td>' + _esc(it.nativeX) + ' / ' + _esc(it.nativeY) + '</td>'
                + '<td>' + _esc(it.gamutPct) + '%</td>'
                + '<td style="color:' + (pqOk ? '#1f7a3d' : '#b1432f') + '; font-weight:bold;">'
                + (pqOk ? 'PASS' : it.pqFail + '/' + it.pqTotal + ' FAIL') + '</td></tr>';
        }).join('');
        document.getElementById('docopt-body').innerHTML =
            '<div style="font-size:11.5px; color:#868e96; margin-bottom:8px;">'
            + _esc(_t('이미 있는 바코드는 다시 가져오지 않습니다(회색, 선택 불가). Log_File.txt 는 원본 증적으로 같이 보관됩니다(파싱하지 않음).',
                      'Already-imported barcodes are skipped.')) + '</div>'
            + '<table class="doc-t"><tr><th style="width:30px;"></th><th>' + _esc(_t('바코드', 'Barcode')) + '</th>'
            + '<th>' + _esc(_t('측정일시', 'Measured')) + '</th><th>Native X/Y</th><th>Gamut</th><th>PQ</th></tr>'
            + rows + '</table>';
    };
    window._docOpticalTogglePick = function (i, v) {
        if (window._docOpticalPending) window._docOpticalPending.picked[i] = v;
    };
    window._docOpticalCancel = function () {
        window._docOpticalPending = null;
        var ov = document.getElementById('docopt-overlay');
        if (ov) ov.style.display = 'none';
    };
    window._docOpticalApply = async function () {
        var p = window._docOpticalPending; if (!p) return;
        var d = _docData(p.formId);
        d.opticalLogs = d.opticalLogs || [];
        var existing = {};
        d.opticalLogs.forEach(function (it) { existing[it.barcode] = true; });
        var picked = p.items.filter(function (it, i) { return p.picked[i] && !existing[it.barcode]; });
        if (!picked.length) { window._docOpticalCancel(); return; }
        var btn = document.getElementById('docopt-apply-btn');
        if (btn) { btn.disabled = true; btn.textContent = _t('올리는 중…', 'uploading…'); }
        var ctx = _ctx(), folder = _attFolder(ctx, _formById(p.formId));
        var roundSafe = String(window._docState.round || '').replace(/[\\/:*?"<>|]/g, '-');
        var okCount = 0;
        for (var i = 0; i < picked.length; i++) {
            var it = picked[i];
            var files = [];
            var reportName = roundSafe + '_' + (it.reportFileName || (it.barcode + '_Final_Report.txt'));
            var r1 = await window._dgUploadBlob(folder, reportName, new Blob([it.reportText || ''], { type: 'text/plain' }));
            if (r1.ok) files.push({ name: r1.name, folder: folder, kind: 'report' });
            if (it.logFileName) {
                var logName = roundSafe + '_' + it.logFileName;
                var r2 = await window._dgUploadBlob(folder, logName, new Blob([it.logText || ''], { type: 'text/plain' }));
                if (r2.ok) files.push({ name: r2.name, folder: folder, kind: 'log' });
            }
            d.opticalLogs.push({
                barcode: it.barcode, model: it.model, startTime: it.startTime, endTime: it.endTime,
                targetX: it.targetX, targetY: it.targetY, nativeX: it.nativeX, nativeY: it.nativeY,
                maxPwmLv: it.maxPwmLv, defaultPwmLv: it.defaultPwmLv, gamutPct: it.gamutPct,
                pqTotal: it.pqTotal, pqPass: it.pqPass, pqFail: it.pqFail,
                files: files, importedAt: new Date().toISOString()
            });
            okCount++;
        }
        _markDirty();
        window._docOpticalCancel();
        _toast('✅ ' + okCount + _t('건을 가져왔습니다.', ' item(s) imported.'), 'success');
        window._docRender();
    };
    window._docOpticalRemove = function (formId, idx) {
        var d = _docData(formId);
        var list = d.opticalLogs || [];
        if (idx < 0 || idx >= list.length) return;
        // ⚠️ NAS 파일은 지우지 않는다 — 다른 첨부와 같은 규칙(팀 공유라 되돌릴 수 없다).
        if (!confirm(_t('이 측정 이력을 지웁니다(NAS 원본 파일은 그대로 둡니다):\n\n' + list[idx].barcode,
                        'Remove this record?'))) return;
        list.splice(idx, 1);
        _markDirty(); window._docRender();
    };
    window._docOpticalToggleAll = function () {
        window._docState.opticalAllRounds = !window._docState.opticalAllRounds;
        window._docRender();
    };

    // 🎨 문서 모양 서식은 **styles.css** 에 있다(`#doc-page-body .doc-*`).
    //   ⚠️⚠️ 여기서 `<style>` 을 심지 않는다 — 색을 두 군데서 정하면 팔레트(js/21 `_cpApplyLive`)가
    //      덮어도 주입 스타일이 이겨서 "테마를 바꿔도 이 페이지만 안 바뀐다" 가 된다.
    //      색을 고칠 땐 **styles.css 와 js/21 두 곳을 같이** 고친다(js/59 가 겪은 그 사고).
    var _ensureCss = function () { /* styles.css 가 맡는다 */ };

    // ── 그리기 ─────────────────────────────────────────────────────────
    // 📅 [2026-11-09 요청] 날짜 칸은 **앱 공용 달력 모달**로 고른다 — `readonly` + `showGenericCalendar`.
    //   ⚠️ 새 달력을 만들지 않는다. 앱 전체가 이 하나(js/04i)를 쓴다(간트·Summary·공휴일…).
    //   ⚠️ 타이핑도 되게 더블클릭 보조를 같이 건다(`_msEnableDirectEdit`, 마일스톤 칸과 같은 규칙).
    var _dateAttrs = function () {
        return ' readonly onclick="window.showGenericCalendar && window.showGenericCalendar(this)"'
             + ' ondblclick="window._msEnableDirectEdit && window._msEnableDirectEdit(this)"'
             + ' style="cursor:pointer;"';
    };
    var _inputCell = function (id, key, value, own, src, hint, span, isDate) {
        return '<td' + (span ? ' colspan="' + span + '"' : '') + '>'
            + '<input type="' + (isDate ? 'date' : 'text') + '" value="' + _esc(value) + '"'
            + (isDate ? _dateAttrs() : ' placeholder="' + _esc(hint || '') + '"')
            + ' data-doc-key="' + _esc(key) + '" class="doc-in' + (own ? ' own' : '') + '">'
            + '<div class="doc-src' + (own ? ' own' : '') + '">'
            + (own
                ? '✏️ ' + _esc(_t('직접 적음', 'edited'))
                  + ' <a href="#" class="doc-noprint" onclick="window._docResetField(\'' + _esc(id) + '\',\'' + _esc(key) + '\');return false;"'
                  + ' style="color:#1971c2;">↺ ' + _esc(_t('앱 값으로', 'reset')) + '</a>'
                : (src ? (/없음|empty|not in/.test(src) ? '⚠️ ' : '📘 ') + _esc(src) : '&nbsp;'))
            + '</div></td>';
    };

    window._docRender = function () {
        var body = document.getElementById('doc-page-body');
        var tools = document.getElementById('doc-header-tools');
        if (!body || !tools) return;
        _ensureCss();

        // 🙈 처음 고르는 것도 **보이는 서식에서만** — 안 그러면 숨긴 문서가 열린 채로 뜨고
        //    드롭다운엔 그게 없어서 "내가 지금 보는 게 목록에 없다"가 된다.
        //    ⚠️ 마지막으로 본 서식(`gantt_doc_last_form`)이 숨겨졌을 때도 같다.
        var forms = window._docVisibleForms(), st = window._docState;
        if (!st.formId) {
            var last = '';
            try { last = localStorage.getItem('gantt_doc_last_form') || ''; } catch (e) { /* 무시 */ }
            st.formId = (forms.filter(function (f) { return f.id === last; })[0] || forms[0] || {}).id || null;
        }
        var form = _formById(st.formId);
        // 📦 회차 — 목록에 없는 회차를 들고 있으면 되돌린다(이력에서 지운 회차일 수 있다)
        var rounds = _docRounds();
        if (!st.round || rounds.indexOf(st.round) < 0) st.round = rounds[rounds.length - 1];
        var ctx = window._dgCollect ? window._dgCollect()
            : { meta: {}, overview: {}, milestones: { plan: {}, actual: {}, missing: [] }, members: [], spec: [], materials: [] };

        // ── 헤더 — PARTS 와 같은 드롭다운 + 출력(문서 형식이 기본, 엑셀은 옵션) ──
        // 🎨 헤더 버튼은 **한 벌**이다 — 원본저장·엑셀·불러오기·NAS 가 같은 모양·같은 팔레트.
        //   ⚠️⚠️ `background:#00707d`(darkText)를 쓰지 말 것 — js/21 은 그 hex 를 **글자색 역할**로만
        //      매핑해서(`textRoles`), 배경으로 쓰면 테마를 바꿔도 **그 버튼만 청록으로 굳는다**
        //      (사용자 신고 2026-11-11). 배경으로 다시 칠해지는 건 `bgRoles` 에 있는 hex 뿐이다
        //      (`bg #e0f5f7` · `headerTint` · `zebraB` · `hoverBg`).
        var OPT = 'margin:0 4px 0 0; padding:6px 12px; background:#e0f5f7; color:#00707d; border:none;'
                + ' border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;';
        var th = '<div id="doc-form-toggle" style="position:relative; display:flex; align-items:center; flex-shrink:0;">'
            + '<button id="doc-form-trigger" onclick="window._toggleDocFormDropdown(event)"'
            + ' title="' + _esc(_t('문서 종류를 고릅니다', 'Pick a document type')) + '"'
            + ' style="display:flex; align-items:center; gap:4px; font-size:15px; font-weight:bold; cursor:pointer;'
            + ' color:#00707d; background:none; border:none; padding:0; margin:0; user-select:none;">'
            + '<span id="doc-form-trigger-label">' + (form ? (form.icon || '📄') + ' ' + _esc(form.label) : '📄 ' + _esc(_t('문서', 'Document')))
            + '</span><span style="font-size:11px;">▾</span></button>'
            + '<div id="doc-form-dropdown" class="row-action-popup" style="min-width:220px; padding:6px;"></div></div>';
        // 📦 회차 바 — 회차마다 문서가 따로인 서식에서만 보인다(M.C·BOM 의 전환 바와 같은 모양).
        if (form && form.perRound) {
            var ri = rounds.indexOf(st.round);
            th += '<span style="display:inline-block; width:1px; height:16px; background:#ddd; margin:0 8px;"></span>'
                + '<div id="doc-round-bar" style="display:flex; align-items:center; gap:2px; flex-shrink:0;">'
                + '<button onclick="window._docRoundGo(-1)" title="' + _esc(_t('이전 회차', 'Previous')) + '"'
                + ' style="padding:6px 8px; min-width:auto; border:none; background:none; color:#555; cursor:pointer; font-size:12px;">◀</button>'
                + '<button class="unit-cycle-btn" onclick="window._docRoundGo(1)" title="'
                + _esc(_t('누를 때마다 다음 회차로 — 회차마다 문서가 따로입니다', 'Next round')) + '"'
                + ' style="padding:6px 10px; min-width:auto; border-radius:5px; cursor:pointer;'
                + ' font-size:12px; font-weight:bold;">📦 ' + _esc(st.round || '-') + '</button>'
                + '<button onclick="window._docRoundGo(1)" title="' + _esc(_t('다음 회차', 'Next')) + '"'
                + ' style="padding:6px 8px; min-width:auto; border:none; background:none; color:#555; cursor:pointer; font-size:12px;">▶</button>'
                + '<span style="font-size:11px; color:#868e96;">' + ((ri < 0 ? 0 : ri + 1) + '/' + rounds.length) + '</span>'
                + '<button onclick="window._docRoundAdd()" title="' + _esc(_t('회차 추가 — 새 문서가 생깁니다', 'Add a round')) + '"'
                + ' style="margin-left:2px; padding:6px 8px; min-width:auto; border:none; background:none; color:#2c5f8a; cursor:pointer; font-size:14px;">➕</button>'
                + '</div>';
        }
        th += ''
            // 📌 [2026-11-09 사용자 요청] 출력 버튼은 **오른쪽 끝**에 붙인다 — PARTS 와 같은
            //    장치인 `.btn-group`(styles.css 에서 `margin-left:auto`)을 그대로 쓴다.
            //    ⚠️ 직접 `margin-left:auto` 를 쓰지 않는다 — 한 곳에서 정하게 둔다.
            + '<span class="btn-group">'
            // 💾 [2026-11-09 요청] 인쇄 버튼은 **없앴다** — 브라우저 인쇄(Ctrl+P)로 대체.
            //    대신 **원본 문서 모양(.docx)** 으로 저장한다(실측 원본과 같은 Word 파일).
            + '<button onclick="window._docSaveDocx()" style="' + OPT + '">💾 ' + _esc(_t('원본저장', 'Save as Word')) + '</button>'
            + '<button onclick="window._docExport(\'xlsx\')" style="' + OPT + '">📊 ' + _esc(_t('엑셀 저장', 'Excel')) + '</button>';
        if (form && form.builder) {
            th += '<button onclick="window._docExport(\'pptx\')" style="' + OPT + '">📑 ' + _esc(_t('PPT 저장', 'PPT')) + '</button>';
        }
        // 📂 불러오기 — 다른 페이지와 **같은 뜻**이다: 파일을 읽어 이 페이지 칸을 채운다.
        // 📁 NAS — 다른 페이지와 **같은 뜻**이다: 자료실 탐색기를 연다(올리기·열기는 거기서).
        //   ⚠️ 예전엔 NAS 버튼이 "엑셀을 NAS 에 올리기"였다 — 같은 글자가 페이지마다 다른 일을
        //      하면 사람이 매번 눌러 보고 알아내야 한다(사용자 지적 2026-11-09).
        th += '<button onclick="window._docImportPick()" style="' + OPT + '">📂 ' + _esc(_t('불러오기', 'Import')) + '</button>'
            + '<button onclick="window._docOpenNas()" style="' + OPT + '">📁 ' + _esc(_t('NAS', 'NAS')) + '</button>'
            + '</span>';
        tools.innerHTML = th;

        if (!form) { body.innerHTML = '<div style="padding:12px; color:#b1432f;">'
            + _esc(_t('문서 서식이 없습니다.', 'No document forms.')) + '</div>'; return; }

        // ── 본문 — 흰 종이 위의 문서 ──
        // ⚠️ [2026-11-09 사용자 요청] 프로젝트 경로 줄(`📁 고객사 > 모델`)과 서식 안내(ℹ️)는
        //    **두지 않는다** — 문서 위에 앱 안내가 얹히면 문서처럼 안 보인다.
        //    프로젝트가 안 열렸을 때만 한 줄 경고한다(그건 값이 안 채워지는 이유라 숨기면 안 된다).
        var h = '<div class="doc-paper">';
        if (!ctx.meta.고객사 && !ctx.meta.모델명) {
            h += '<div class="doc-noprint" style="margin:0 0 8px; font-size:12px; color:#b1432f;">⚠️ '
               + _esc(_t('프로젝트가 열려 있지 않습니다 — 자동으로 채울 값이 없습니다.', 'No project open.')) + '</div>';
        }
        h += '<div class="doc-title">' + _esc(form.label) + '</div>';
        if (form.stages) {
            h += '<div class="doc-noprint" style="margin-bottom:10px; font-size:12px;">' + _esc(_t('단계', 'Stage')) + ': ';
            form.stages.forEach(function (sv) {
                var on = st.stage === sv;
                h += '<button onclick="window._docSetStage(\'' + _esc(sv) + '\')" style="margin-right:4px;'
                   + ' padding:3px 10px; font-size:11px; cursor:pointer; border-radius:12px;'
                   + ' border:1px solid ' + (on ? '#52a5af' : '#cfe3e5') + ';'
                   + ' background:' + (on ? '#e0f5f7' : '#fff') + '; font-weight:' + (on ? 'bold' : 'normal') + ';">'
                   + _esc(sv) + '</button>';
            });
            h += '</div>';
        }

        form.sections.forEach(function (s) {
            // 📂 [2026-11-12 요청] 'check'(SPL Check sheet) 섹션은 제목 줄에 전체 접기/펴기 버튼을
            //    오른쪽 정렬로 넣어야 해서 **자기 제목을 스스로 그린다**(아래 kind==='check' 블록).
            if (s.kind !== 'cover' && s.kind !== 'check') h += '<div class="doc-sec">' + _esc(s.title) + '</div>';
            h += '<table class="doc-t">';

            if (s.kind === 'attach') {
                var list = (_docData(form.id).att[s.key]) || [];
                h += '<tr><td style="padding:8px;"><div class="doc-att" data-doc-att="' + _esc(s.key) + '">';
                if (!list.length) {
                    h += '<div style="color:#868e96; font-size:11.5px; padding:14px 6px;">'
                       + _esc(s.hint || _t('파일을 끌어다 놓거나 아래 버튼으로 올려 주세요.', 'Drop files here.')) + '</div>';
                }
                list.forEach(function (a, i) {
                    var isImg = /^image\//.test(a.type || '') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || '');
                    h += '<div class="thumb">'
                       + (isImg ? '<img src="' + _esc(_attUrl(a)) + '" alt="">'
                                : '<div style="height:76px; display:flex; align-items:center; justify-content:center; font-size:26px;">📄</div>')
                       + '<div style="font-size:10px; word-break:break-all; margin-top:3px;">' + _esc(a.orig || a.name) + '</div>'
                       + '<div class="doc-noprint" style="text-align:right;">'
                       + '<a href="' + _esc(_attUrl(a)) + '" target="_blank" style="font-size:10px; color:#1971c2;">열기</a> '
                       + '<a href="#" onclick="window._docAttachRemove(\'' + _esc(form.id) + '\',\'' + _esc(s.key) + '\',' + i + ');return false;"'
                       + ' style="font-size:10px; color:#b1432f;">떼기</a></div></div>';
                });
                h += '</div><div class="doc-noprint" style="margin-top:6px;">'
                   + '<button onclick="window._docAttachPick(\'' + _esc(form.id) + '\',\'' + _esc(s.key) + '\')"'
                   + ' style="padding:4px 10px; font-size:11.5px; cursor:pointer; border:1px solid #a3d9e0;'
                   + ' background:#e0f5f7; color:#00707d; border-radius:5px; font-weight:bold;">📎 '
                   + _esc(_t('첨부 올리기', 'Attach')) + '</button>'
                   + '<span style="margin-left:8px; font-size:11px; color:#868e96;">'
                   + _esc(_t('끌어다 놓기 · Ctrl+V 붙여넣기도 됩니다. 파일은 NAS 에 올라가고 문서엔 참조만 남습니다.',
                             'Drag & drop or paste.')) + '</span></div></td></tr>';
            } else if (s.kind === 'check') {
                // ✅ SPL Check sheet — 6장·167항목. 체크는 **라디오가 아니라 칸 클릭**이다
                //    (원본이 O 를 손으로 적는 표라, 같은 모양으로 눌러 O 를 켠다).
                //    저장 열쇠: `chk|<시트>|<번호>|<열>` · 비고는 `chk|<시트>|<번호>|note`
                var sheets = window.DOC_CHECK_SHEETS || [];
                if (!sheets.length) {
                    h += '<tr><td style="color:#b1432f;">'
                       + _esc(_t('점검표 데이터(js/68)를 불러오지 못했습니다.', 'check sheet data missing')) + '</td></tr>';
                }
                // ✅ [2026-11-09 요청] **개발담당자 점검요청을 켠 것만** 보기 —
                //    해상도 팝업·Customer SPEC 의 `🔽 펼치기` 와 같은 뜻이다(새로 디자인하지 않는다).
                //    ⚠️ 167항목을 다 펼쳐 두면 "내가 뭘 요청했는지" 가 안 보인다.
                var chkOnly = !!window._docState.chkOnly;
                var hideNA = window._docState.hideNA !== false;
                // 🙈 [2026-11-12 2차 요청] 버튼 둘을 "SPL Check sheet" 박스(테두리) 안으로 모으고
                //    오른쪽 정렬 + 첨부(📎) 버튼과 같은 납작한 한 가지 스타일로 통일한다
                //    (상태에 따라 색이 뒤집히던 것 → 라벨/화살표만 바뀌는 쪽으로).
                var _chkBtnStyle = 'padding:4px 10px; font-size:11.5px; cursor:pointer;'
                    + ' border:1px solid #a3d9e0; border-radius:5px; font-weight:bold; background:#e0f5f7; color:#00707d;';
                h += '</table><div class="doc-sec">' + _esc(s.title) + '</div>'
                   + '<div class="doc-noprint" style="margin:2px 0 8px; border:1px solid #a3d9e0;'
                   + ' border-radius:6px; padding:8px 10px; background:#fff;">'
                   + '<div style="font-size:11px; color:#868e96; margin-bottom:6px;">'
                   + _esc(_t('개발담당자 칸에 ‘점검요청’ 을 켜 둔 내역만 보여 줍니다. ‘해당없음’ 으로 선택한 항목은'
                             + ' 기본으로 접어 둡니다(Resolution 제외).',
                             'Shows only requested items. N/A items are folded by default (except Resolution).'))
                   + '</div>'
                   + '<div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">'
                   + '<button onclick="window._docToggleChkOnly()" style="' + _chkBtnStyle + '">'
                   + (chkOnly ? '▼ ' + _esc(_t('전체 보기', 'Show all'))
                              : '▶ ' + _esc(_t('점검요청만', 'Requested only'))) + '</button>'
                   + '<button onclick="window._docToggleHideNA()" style="' + _chkBtnStyle + '">'
                   + (hideNA ? '▶ ' + _esc(_t('해당없음도 보기', 'Show N/A'))
                             : '▼ ' + _esc(_t('해당없음 접기', 'Hide N/A'))) + '</button>'
                   + '</div></div>';
                sheets.forEach(function (sh) {
                    var items = _sheetItems(sh, form.id);
                    if (chkOnly) {
                        items = items.filter(function (it) {
                            return _docData(form.id).fields['chk|' + sh.key + '|' + it.id + '|점검요청'] === 'O';
                        });
                        // 요청한 게 하나도 없는 장은 **제목째** 접는다(빈 표만 남으면 더 헷갈린다)
                        if (!items.length) return;
                    }
                    // 🙈 [2026-11-12 요청] '해당없음' 항목 접기 — chkOnly 가 켜져 있으면 이미 'O' 만
                    //    남았으므로 다시 거를 필요가 없다(해당없음이 섞여 있을 수 없다).
                    var naCount = 0;
                    if (hideNA && !chkOnly) {
                        items = items.filter(function (it) {
                            if (RES_GROUPS.indexOf(it.g) >= 0) return true;
                            if (_docData(form.id).fields['chk|' + sh.key + '|' + it.id + '|해당없음'] === 'O') {
                                naCount++; return false;
                            }
                            return true;
                        });
                    }
                    // 📂 [2026-11-12 3차 요청] 시트 헤더마다 **그 시트 하나만** 접고 펼치는 버튼을
                    //    헤더 박스(.doc-sec) 안쪽에 오른쪽 정렬로 둔다 — 위 전체 토글(점검요청/해당없음)과
                    //    다른 축이다: 이건 '해당없음' 과 무관하게 긴 표 자체를 안 보이게 접는다.
                    var collapsed = !!(window._docState.chkSheetCollapsed && window._docState.chkSheetCollapsed[sh.key]);
                    h += '<div class="doc-sec" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">'
                       + '<span>' + _esc(sh.key) + (collapsed ? '<span class="doc-noprint" style="font-weight:normal;'
                           + ' color:#868e96; margin-left:8px;">(' + items.length + _esc(_t('개 항목', ' items')) + ')</span>' : '')
                       + '</span>'
                       + '<button class="doc-noprint" onclick="window._docToggleSheetCollapse(\''
                       + _esc(sh.key).replace(/'/g, "\\'") + '\')" style="padding:3px 9px; font-size:11px; cursor:pointer;'
                       + ' border:1px solid #a3d9e0; border-radius:5px; font-weight:bold; background:#fff; color:#00707d;'
                       + ' flex-shrink:0;">'
                       + (collapsed ? '▶ ' + _esc(_t('펼치기', 'Expand')) : '▼ ' + _esc(_t('접기', 'Collapse'))) + '</button>'
                       + '</div>';
                    if (collapsed) return;
                    h += '<table class="doc-t" style="table-layout:fixed;">'
                       + '<colgroup><col style="width:110px"><col><col style="width:168px">'
                       + '<col style="width:150px"><col style="width:150px"></colgroup>'
                       + '<tr><th>' + _esc(_t('항목', 'Group')) + '</th><th>' + _esc(_t('내역', 'Item')) + '</th>'
                       + '<th>' + _esc(_t('개발담당자', 'Dev')) + '</th>'
                       + '<th>' + _esc(_t('시제품담당자', 'Proto')) + '</th>'
                       + '<th>' + _esc(_t('제품보증담당자', 'QA')) + '</th></tr>';
                    // 🧩 [2026-11-09 요청] 항목(묶음)은 **한 칸으로 묶는다**(rowspan).
                    //    ⚠️ 항목마다 줄이 **둘**(점검 줄 + Note 줄)이라 묶는 높이는 개수 × 2 다.
                    var span = {};
                    for (var a = 0; a < items.length;) {
                        var b = a;
                        while (b + 1 < items.length && items[b + 1].g === items[a].g) b++;
                        span[a] = (b - a + 1) * 2;
                        a = b + 1;
                    }
                    if (!items.length) {
                        h += '<tr><td colspan="5" style="color:#b1432f;">'
                           + (naCount ? _esc(_t('이 장은 전부 ‘해당없음’ 으로 접혀 있습니다.', 'All items are N/A (hidden).'))
                                      : _esc(_t('이 장에 점검할 항목이 없습니다.', 'No items.')))
                           + '</td></tr>';
                    }
                    items.forEach(function (it, n) {
                        var base = 'chk|' + sh.key + '|' + it.id + '|';
                        var cell = function (cols) {
                            return '<td style="text-align:center; white-space:nowrap;">' + cols.map(function (c) {
                                var k = base + c, on = _docData(form.id).fields[k] === 'O';
                                // ⚠️ 색은 인라인이 아니라 **클래스**(`.doc-chk` / `.on`)로 — 팔레트가 먹어야 한다
                                return '<span class="doc-chk' + (on ? ' on' : '') + '" data-doc-chk="' + _esc(k) + '"'
                                     + ' title="' + _esc(c) + '">' + _esc(c) + (on ? ' O' : '') + '</span>';
                            }).join('') + '</td>';
                        };
                        // ✏️ [2026-11-09 요청] 내역은 **고칠 수 있다**. 기본값은 카탈로그(js/68)이고
                        //    사람이 고친 것만 저장한다 — 기본값과 같아지면 뺀다(다른 칸과 같은 규칙).
                        //    ⚠️ js/68 을 손으로 고치지 말라는 규칙은 그대로다. 여기 고친 값은 **이 프로젝트**
                        //       것이고, 원본을 다시 뽑아도 안 지워진다.
                        var tkey = base + 'text';
                        var tv = _hasOwn(form.id, tkey) ? _docData(form.id).fields[tkey] : it.q;
                        // ⚠️ 묶음 칸은 **줄바꿈**(`doc-grp`) — `Appearance Inspection`·`조립 성 및 Rework`
                        //    같은 긴 이름이 110px 칸을 삐져나갔다(사용자 지적).
                        // ➕ 그 칸 밑에 **행 추가**를 둔다 — 줄을 하나 더 끼우면 rowspan 셈이 틀어진다.
                        h += '<tr>'
                           + (span[n] ? '<td class="doc-lab doc-grp" style="vertical-align:middle;"'
                                        + ' rowspan="' + span[n] + '">' + _esc(it.g)
                                        + (chkOnly ? '' :
                                           '<div class="doc-noprint" style="margin-top:3px; font-weight:normal;">'
                                           + '<a href="#" onclick="window._docCheckAddRow(\'' + _esc(form.id) + '\',\''
                                           + _esc(sh.key).replace(/'/g, "\\'") + '\',\'' + _esc(it.g).replace(/'/g, "\\'")
                                           + '\');return false;" style="color:#1971c2; font-size:10.5px;">＋ '
                                           + _esc(_t('행 추가', 'Add row')) + '</a></div>')
                                        + '</td>' : '')
                           + '<td><input type="text" class="doc-in' + ((it.added || _hasOwn(form.id, tkey)) ? ' own' : '') + '"'
                           + (it.added ? ' data-doc-add="' + _esc(sh.key) + '\u0001' + _esc(it.g) + '\u0001' + _esc(it.id) + '"'
                                       : ' data-doc-text="' + _esc(tkey) + '" data-doc-def="' + _esc(it.q) + '"')
                           + ' value="' + _esc(tv) + '" style="font-size:11.5px;'
                           + (it.added ? ' width:calc(100% - 20px);' : '') + '"'
                           + (it.added ? ' placeholder="' + _esc(_t('보탤 점검 내역을 적으세요', 'new item')) + '"'
                              : (it.empty ? ' placeholder="' + _esc(_t('지원 해상도에서 고르면 여기에 나옵니다', 'pick resolutions above')) + '"' : ''))
                           + '>'
                           + (it.added ? '<a href="#" onclick="window._docCheckDelRow(\'' + _esc(form.id) + '\',\''
                                         + _esc(sh.key).replace(/'/g, "\\'") + '\',\'' + _esc(it.g).replace(/'/g, "\\'")
                                         + '\',\'' + _esc(it.id) + '\');return false;"'
                                         + ' class="doc-noprint" title="' + _esc(_t('이 줄 빼기', 'remove'))
                                         + '" style="color:#b1432f; margin-left:4px;">✕</a>' : '')
                           + '</td>'
                           + cell(['점검요청', '해당없음']) + cell(['합격', '불합격', 'N/A']) + cell(['합격', '불합격', 'N/A'])
                           + '</tr>'
                           // 📝 확인자 의견 줄 — 원본이 항목마다 하나씩 들고 있다.
                           //   ⚠️ [2026-11-09 요청] 굵은 `Note` 글자는 **지웠다**(항목 칸은 위에서 묶인다)
                           //      — 빈 라벨이 줄마다 끼면 묶음이 끊겨 보인다. 대신 무엇을 적는 칸인지
                           //      **안내 글**로 말한다("비고" 로는 누가 무엇을 적는지 알 수 없다).
                           + '<tr><td colspan="4"><input type="text" class="doc-in" data-doc-key="' + _esc(base + 'note') + '"'
                           + ' value="' + _esc(_docData(form.id).fields[base + 'note'] || '') + '"'
                           + ' placeholder="' + _esc(_t('확인자 의견 란 — 의견을 자유롭게 기재해주세요',
                                                        'Reviewer comment — write freely')) + '" style="font-size:11px;"></td></tr>';
                    });
                    h += '</table>';
                    if (naCount) {
                        h += '<div class="doc-noprint" style="margin:2px 0 8px; font-size:11px; color:#868e96;">🙈 '
                           + _esc(_t(naCount + '건은 ‘해당없음’ 으로 접혀 있습니다.', naCount + ' item(s) hidden (N/A).'))
                           + ' <a href="#" onclick="window._docToggleHideNA();return false;"'
                           + ' style="color:#1971c2;">' + _esc(_t('펴기', 'show')) + '</a></div>';
                    }
                    if ((sh.items || []).some(function (x) { return RES_GROUPS.indexOf(x.g) >= 0; })) {
                        h += '<div class="doc-noprint" style="margin:2px 0 8px; font-size:11px; color:#868e96;">🖥 '
                           + _esc(_t('이 장의 항목은 위 [# 지원 해상도]에서 고른 것만 나옵니다.',
                                     'Items come from the picked resolutions.'))
                           + ' <a href="#" onclick="window.resOpenPicker && window.resOpenPicker();return false;"'
                           + ' style="color:#1971c2;">' + _esc(_t('해상도 고르기', 'pick')) + '</a></div>';
                    }
                });
                h += '<table style="display:none;">';
            } else if (s.kind === 'history') {
                // 📦 샘플 출고 이력 — 회차·출고일자·수량·그룹웨어 의뢰서
                //   ⚠️ 회차는 **적는 값**이다(기본값만 넣어 준다) — 거래선마다 PROTO/ES/PP 가 달라
                //      고르는 목록으로 막으면 새 거래선이 못 들어온다(사용자 결정 2026-11-09).
                var hist = _hist();
                // 📦 단계(PROTO A…) 와 회차(1,2,3…)는 **다른 것**이다 — 한 단계에서 여러 번 만든다.
                h += '<tr><th style="width:110px;">' + _esc(_t('단계', 'Stage')) + '</th>'
                   + '<th style="width:66px;">' + _esc(_t('회차', 'Run')) + '</th>'
                   + '<th style="width:140px;">' + _esc(_t('출고 일자', 'Shipped')) + '</th>'
                   + '<th style="width:100px;">' + _esc(_t('수량', 'Qty')) + '</th>'
                   + '<th>' + _esc(_t('샘플/시제품 의뢰서', 'Sample request')) + '</th>'
                   // 🔗 [2026-11-09 요청] 여기는 원래 `보고서`(지금 보고 있는 그 리포트)라 뜻이 없었다
                   //    — 의뢰서를 **그룹웨어에서 바로 여는 자리**로 바꿨다.
                   + '<th class="doc-noprint" style="width:110px;">' + _esc(_t('열람', 'Open')) + '</th>'
                   + '<th class="doc-noprint" style="width:56px;"></th></tr>';
                if (!hist.length) {
                    h += '<tr><td colspan="7" style="color:#868e96;">'
                       + _esc(_t('아직 출고 이력이 없습니다 — 아래 [＋ 단계 추가]를 누르세요.', 'No shipping history yet.'))
                       + '</td></tr>';
                }
                // ⚠️ 같은 단계·회차가 두 줄이면 **같은 문서**를 가리킨다 — 조용히 두지 않고 드러낸다.
                var labCount = {};
                hist.forEach(function (r) {
                    var L = window._docRoundLabel(r);
                    if (L) labCount[L] = (labCount[L] || 0) + 1;
                });
                hist.forEach(function (r, i) {
                    var rlab = window._docRoundLabel(r);
                    var ron = rlab && window._docState.round === rlab;
                    // 📦 [2026-11-09 사용자 요청] **지금 보고 있는 회차 줄을 표시한다**
                    //   🎨 색은 테마색이 아니라 **보색**이다(사용자 지시) — 캘린더 핀셋 알람·일일보고
                    //      '미작성' 과 같은 규칙이라, 어떤 테마를 골라도 대비되는 색이 자동으로 나온다.
                    //   ⚠️⚠️ 그래서 **인라인이 아니라 클래스**(`doc-hist-now`)다. 인라인 hex 는 js/21 이
                    //      `[style*="#hex"]` 로 테마색만 갈아 끼우므로 보색을 못 만든다.
                    //      기본값은 styles.css, 라이브는 js/21 `_cpApplyLive` — **두 곳을 같이** 고칠 것.
                    //   ⚠️ 인쇄에도 남긴다: 이 보고서가 몇 회차의 것인지가 한눈에 보여야 한다.
                    h += '<tr' + (ron ? ' class="doc-hist-now"' : '') + '>'
                       + '<td><input type="text" class="doc-in' + (ron ? ' doc-hist-now-txt' : '')
                       + '" data-doc-hist="' + i + '|stage" value="' + _esc(r.stage || '') + '">'
                       + (ron ? '<div class="doc-src doc-hist-now-txt">● '
                                + _esc(_t('지금 보고 있는 문서', 'current document')) + '</div>' : '')
                       + (rlab && labCount[rlab] > 1
                          ? '<div class="doc-src" style="color:#b1432f;">⚠️ '
                            + _esc(_t('같은 단계·회차가 둘 — 문서가 하나로 합쳐집니다', 'duplicate stage/run')) + '</div>'
                          : '')
                       + '</td>'
                       // 📦 회차 — 비우거나 1 이면 단계 이름이 곧 문서 이름이다(옛 문서가 그대로 열린다)
                       + '<td><input type="text" class="doc-in" data-doc-hist="' + i + '|seq" value="' + _esc(r.seq || '') + '"'
                       + ' placeholder="1" style="text-align:center;"></td>'
                       + '<td><input type="date" class="doc-in" data-doc-hist="' + i + '|date" value="' + _esc(r.date || '') + '"' + _dateAttrs() + '></td>'
                       + '<td><input type="text" class="doc-in" data-doc-hist="' + i + '|qty" value="' + _esc(r.qty || '') + '"'
                       + ' placeholder="' + _esc(_t('예: 24', 'e.g. 24')) + '"></td>'
                       + '<td><input type="text" class="doc-in" data-doc-hist="' + i + '|doc" value="' + _esc(r.doc || '') + '"'
                       + ' placeholder="' + _esc(_t('그룹웨어 문서번호', 'doc no.')) + '">'
                       + '<div class="doc-src doc-noprint">'
                       + '<a href="#" onclick="window._docGwPick(' + i + ');return false;" style="color:#1971c2;">🔎 '
                       + _esc(_t('그룹웨어에서 찾기', 'find in groupware')) + '</a>'
                       + (r.docTitle ? ' <span style="opacity:.8;">' + _esc(r.docTitle) + '</span>' : '')
                       + '</div></td>'
                       // 📦 이 회차의 Sample Report 로 — 회차마다 보고서가 따로 생긴다
                       // 🔗 그룹웨어에서 그 의뢰서를 연다 (전용 크롬 — 사람이 로그인해 둔 곳)
                       + '<td class="doc-noprint" style="text-align:center; font-size:11px;">'
                       + (String(r.doc || '').trim() || r.docId
                          ? '<a href="#" onclick="window._docOpenReq(' + i + ');return false;" style="color:#1971c2;">🔗 '
                            + _esc(_t('의뢰서 열기', 'Open')) + '</a>'
                          : '<span style="color:#868e96;">' + _esc(_t('의뢰서를 고르세요', 'pick a document')) + '</span>')
                       + '</td>'
                       + '<td class="doc-noprint" style="text-align:center;">'
                       + '<a href="#" onclick="window._docHistDel(' + i + ');return false;" style="color:#b1432f; font-size:11px;">'
                       + _esc(_t('삭제', 'del')) + '</a></td></tr>';
                });
                var ADDBTN = 'padding:4px 10px; font-size:11.5px; cursor:pointer; border:1px solid #a3d9e0;'
                           + ' background:#e0f5f7; color:#00707d; border-radius:5px; font-weight:bold; margin-right:6px;';
                h += '</table><div class="doc-noprint" style="margin-top:6px;">'
                   + '<button onclick="window._docHistAdd()" title="'
                   + _esc(_t('다음 단계 1차 (PROTO A → B → C → ES → PP)', 'next stage')) + '" style="' + ADDBTN + '">＋ '
                   + _esc(_t('단계 추가', 'Add stage')) + '</button>'
                   + '<button onclick="window._docHistAdd(true)" title="'
                   + _esc(_t('같은 단계의 다음 회차 (PROTO A 1차 → PROTO A 2차)', 'next run of the same stage'))
                   + '" style="' + ADDBTN + '">＋ ' + _esc(_t('회차 추가', 'Add run')) + '</button>'
                   + '<span style="margin-left:2px; font-size:11px; color:#868e96;">'
                   + _esc(_t('단계·회차마다 Sample Report 가 따로 생깁니다. 한 단계에서 여러 번 만들면 회차(2,3,4…)를 올리세요 — 1차는 단계 이름 그대로입니다.',
                             'A report per stage/run.')) + '</span></div>'
                   + '<table style="display:none;">';
            } else if (s.kind === 'resolution') {
                // 🖥 지원 해상도 — 고르기는 팝업(js/69), 여기는 **고른 줄만** 보여 준다.
                //   ⚠️ 포트 이름은 `RES_PORTS`(데이터) 한 곳에서 온다. 옛 문서의 `PC` 는 `RGB` 다.
                var rports = window.RES_PORTS || [];
                var rrows = window.resSelectedRows ? window.resSelectedRows() : [];
                h += '<tr><th style="width:44px;">NO</th><th style="text-align:left;">RESOLUTION</th>'
                   + rports.map(function (p) {
                       return '<th title="' + _esc(p.title || p.label) + '" style="width:62px;">' + _esc(p.label) + '</th>';
                   }).join('') + '</tr>';
                if (!rrows.length) {
                    h += '<tr><td colspan="' + (2 + rports.length) + '" style="color:#b1432f;">'
                       + _esc(_t('아직 고른 해상도가 없습니다 — 아래 [🖥 해상도 고르기]를 누르세요.',
                                 'No resolution selected yet.')) + '</td></tr>';
                }
                rrows.forEach(function (r, i) {
                    h += '<tr><td style="text-align:center;">' + (i + 1) + '</td><td>' + _esc(r.label) + '</td>'
                       + rports.map(function (p) {
                           return '<td style="text-align:center;">' + (r.ports[p.key] ? 'O' : '') + '</td>';
                       }).join('') + '</tr>';
                });
                h += '</table><div class="doc-noprint" style="margin-top:6px;">'
                   + '<button onclick="window.resOpenPicker && window.resOpenPicker()"'
                   + ' style="padding:4px 10px; font-size:11.5px; cursor:pointer; border:1px solid #a3d9e0;'
                   + ' background:#e0f5f7; color:#00707d; border-radius:5px; font-weight:bold;">🖥 '
                   + _esc(_t('해상도 고르기', 'Pick resolutions')) + '</button>'
                   + '<span style="margin-left:8px; font-size:11px; color:#868e96;">'
                   + _esc(window.resSummary && window.resSummary()
                          ? window.resSummary()
                          : _t('VESA·CTA 표준 목록에서 고르거나 직접 적어 넣을 수 있습니다.',
                               'Pick from VESA/CTA list or type your own.')) + '</span></div>'
                   + '<table style="display:none;">';
            } else if (s.kind === 'text') {
                var tv = _hasOwn(form.id, s.key) ? _docData(form.id).fields[s.key] : '';
                h += '<tr><td><textarea data-doc-key="' + _esc(s.key) + '" rows="3" placeholder="' + _esc(s.hint || '')
                   + '" class="doc-in" style="resize:vertical;">' + _esc(tv) + '</textarea></td></tr>';
            } else if (s.kind === 'table') {
                h += '<tr>' + s.columns.map(function (c) { return '<th>' + _esc(c) + '</th>'; }).join('') + '</tr>';
                s.rows.forEach(function (r) {
                    h += '<tr>';
                    r.cells.forEach(function (c) {
                        if (c.fixed !== undefined) { h += '<td class="doc-lab" style="text-align:center;">' + _esc(c.fixed) + '</td>'; return; }
                        var own = _hasOwn(form.id, c.key), a = _autoOf(ctx, c.from);
                        h += _inputCell(form.id, c.key, own ? _docData(form.id).fields[c.key] : a.v, own, a.src, c.hint, 0, !!c.date);
                    });
                    h += '</tr>';
                });
            } else if (s.kind === 'optical') {
                // 🔬 바코드별 Gamma 측정 이력 — 기본은 이 회차만, 토글로 전체 회차를 모아 본다
                //   (출고 이력과 같은 집계 방식: 저장은 회차별 그대로, 읽을 때만 _docRounds() 를 돈다).
                var showAll = !!window._docState.opticalAllRounds;
                var rowsToShow = [];
                if (showAll) {
                    _docRounds().forEach(function (rd) {
                        var rdList = (window.tabData.documents['sample-report@' + rd] || {}).opticalLogs || [];
                        rdList.forEach(function (it) {
                            var cp = {}; for (var k2 in it) cp[k2] = it[k2];
                            cp.round = rd; rowsToShow.push(cp);
                        });
                    });
                } else {
                    (_docData(form.id).opticalLogs || []).forEach(function (it) {
                        var cp = {}; for (var k3 in it) cp[k3] = it[k3];
                        cp.round = st.round; rowsToShow.push(cp);
                    });
                }
                h += '<tr>' + (showAll ? '<th style="width:90px;">' + _esc(_t('회차', 'Round')) + '</th>' : '')
                   + '<th style="width:120px;">' + _esc(_t('바코드', 'Barcode')) + '</th>'
                   + '<th style="width:130px;">' + _esc(_t('측정일시', 'Measured')) + '</th>'
                   + '<th>Native X / Y</th><th>Max / Default Lv</th><th>Gamut</th><th>PQ Check</th>'
                   + '<th class="doc-noprint" style="width:60px;">📎</th>'
                   + '<th class="doc-noprint" style="width:40px;"></th></tr>';
                if (!rowsToShow.length) {
                    h += '<tr><td colspan="9" style="color:#868e96;">'
                       + _esc(_t('아직 가져온 측정 이력이 없습니다 — 아래 [📥 Gamma 리포트 zip 가져오기]를 눌러 주세요.',
                                 'No optical history yet — use [Import Gamma report zip] below.'))
                       + '</td></tr>';
                }
                rowsToShow.forEach(function (it, idx) {
                    var pqOk = it.pqFail === 0;
                    var tgt = (it.targetX && it.targetY)
                        ? _t('타겟', 'target') + ' X ' + it.targetX.min + '~' + it.targetX.max
                          + ' / Y ' + it.targetY.min + '~' + it.targetY.max
                        : '';
                    h += '<tr>' + (showAll ? '<td>' + _esc(it.round) + '</td>' : '')
                       + '<td>' + _esc(it.barcode) + '</td>'
                       + '<td style="font-size:11px;">' + _esc(it.startTime) + '</td>'
                       + '<td title="' + _esc(tgt) + '">' + _esc(it.nativeX) + ' / ' + _esc(it.nativeY) + '</td>'
                       + '<td>' + _esc(it.maxPwmLv) + ' / ' + _esc(it.defaultPwmLv) + '</td>'
                       + '<td>' + _esc(it.gamutPct) + '%</td>'
                       + '<td style="color:' + (pqOk ? '#1f7a3d' : '#b1432f') + '; font-weight:bold;">'
                       + (pqOk ? '✅ PASS' : '⚠️ ' + it.pqFail + '/' + it.pqTotal + ' FAIL') + '</td>'
                       + '<td class="doc-noprint" style="text-align:center;">'
                       + (it.files || []).map(function (fl) {
                           return '<a href="' + _esc(_attUrl(fl)) + '" target="_blank" title="' + _esc(fl.name) + '">'
                               + (fl.kind === 'log' ? '🧾' : '📄') + '</a>';
                       }).join(' ')
                       + '</td>'
                       + '<td class="doc-noprint" style="text-align:center;">'
                       + (showAll ? '' : '<a href="#" onclick="window._docOpticalRemove(\'' + _esc(form.id) + '\',' + idx + ');return false;"'
                                         + ' style="color:#b1432f; font-size:11px;">' + _esc(_t('삭제', 'del')) + '</a>')
                       + '</td></tr>';
                });
                h += '</table>';
                if (showAll) {
                    var byRound = {};
                    rowsToShow.forEach(function (it) { (byRound[it.round] = byRound[it.round] || []).push(it); });
                    h += '<div class="doc-noprint" style="display:flex; flex-wrap:wrap; gap:8px; margin:6px 0;">';
                    _docRounds().forEach(function (rd) {
                        var arr = byRound[rd]; if (!arr || !arr.length) return;
                        var passN = arr.filter(function (it) { return it.pqFail === 0; }).length;
                        var avgLv = (arr.reduce(function (s2, it) { return s2 + (parseFloat(it.maxPwmLv) || 0); }, 0) / arr.length).toFixed(2);
                        var avgGamut = (arr.reduce(function (s2, it) { return s2 + (parseFloat(it.gamutPct) || 0); }, 0) / arr.length).toFixed(2);
                        h += '<span style="font-size:11px; color:#555; padding:4px 8px; background:#f8f9fa;'
                           + ' border:1px solid #e9ecef; border-radius:5px;"><b>' + _esc(rd) + '</b> '
                           + arr.length + _esc(_t('개', ' ea')) + ' · PASS ' + passN + '/' + arr.length
                           + ' · ' + _esc(_t('평균', 'avg')) + ' Lv ' + avgLv + ' · Gamut ' + avgGamut + '%</span>';
                    });
                    h += '</div>';
                }
                h += '<div class="doc-noprint" style="margin-top:4px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">'
                   + '<button onclick="window._docOpticalPick(\'' + _esc(form.id) + '\')" style="padding:4px 10px; font-size:11.5px;'
                   + ' cursor:pointer; border:1px solid #a3d9e0; background:#e0f5f7; color:#00707d; border-radius:5px; font-weight:bold;">📥 '
                   + _esc(_t('Gamma 리포트 zip 가져오기', 'Import Gamma report zip')) + '</button>'
                   + '<button onclick="window._docOpticalToggleAll()" style="padding:4px 10px; font-size:11.5px;'
                   + ' cursor:pointer; border:1px solid #cfe3e5; background:#fff; color:#555; border-radius:5px; font-weight:bold;">'
                   + (showAll ? '📦 ' + _esc(_t('이 회차만', 'This round only')) : '📈 ' + _esc(_t('전체 회차 보기', 'All rounds'))) + '</button>'
                   + '<span style="font-size:11px; color:#868e96;">'
                   + _esc(_t('Final_Report.txt 를 읽어 바코드별 요약을 만듭니다(AI 안 씀). Log_File.txt 는 원본 증적으로 같이 보관됩니다.',
                             'Reads Final_Report.txt deterministically (no AI).')) + '</span></div>'
                   + '<table style="display:none;">';
            } else if (s.kind === 'milestones') {
                h += '<tr><th>' + _esc(_t('구분', 'Stage')) + '</th>'
                   + (window.DOC_MILESTONES || []).map(function (m) { return '<th>' + _esc(m.label) + '</th>'; }).join('') + '</tr>';
                ['plan', 'actual'].forEach(function (k) {
                    h += '<tr><td class="doc-lab">' + _esc(k === 'plan' ? _t('계획', 'Plan') : _t('실적', 'Actual')) + '</td>'
                       + (window.DOC_MILESTONES || []).map(function (m) {
                           var v = ctx.milestones[k][m.stage] || '';
                           return '<td style="text-align:center;' + (v ? '' : 'color:#b1432f;') + '">' + _esc(v || '-') + '</td>';
                       }).join('') + '</tr>';
                });
            } else if (s.kind === 'members') {
                h += '<tr><th style="width:170px;">' + _esc(_t('구분', 'Role')) + '</th><th>' + _esc(_t('성명', 'Name')) + '</th></tr>';
                (ctx.members.length ? ctx.members : [{ role: '-', name: '-' }]).forEach(function (m) {
                    h += '<tr><td class="doc-lab">' + _esc(m.role) + '</td><td>' + _esc(m.name) + '</td></tr>';
                });
            } else if (s.kind === 'spec') {
                h += '<tr><th style="width:50px;">NO</th><th>TYPE</th><th>Description</th><th>KTK Note</th></tr>';
                if (!ctx.spec.length) h += '<tr><td colspan="4" style="color:#b1432f;">'
                    + _esc(_t('Customer SPEC 이 비어 있습니다 — Customer SPEC 탭에서 입력해 주세요.', 'Customer SPEC is empty.')) + '</td></tr>';
                ctx.spec.forEach(function (r, i) {
                    h += '<tr><td style="text-align:center;">' + (i + 1) + '</td><td>' + _esc(r.label) + '</td>'
                       + '<td>' + _esc(r.value) + '</td><td>' + _esc(r.note) + '</td></tr>';
                });
            } else if (s.kind === 'materials') {
                h += '<tr><th style="width:150px;">' + _esc(_t('구분', 'Category')) + '</th><th style="width:110px;">'
                   + _esc(_t('코드', 'PN')) + '</th><th>' + _esc(_t('내역', 'Description')) + '</th></tr>';
                if (!ctx.materials.length) h += '<tr><td colspan="3" style="color:#b1432f;">'
                    + _esc(_t('Summary 탭 ▸ 주요 자재가 비어 있습니다.', 'No key materials.')) + '</td></tr>';
                ctx.materials.forEach(function (m) {
                    h += '<tr><td class="doc-lab">' + _esc(m.cat) + '</td><td style="text-align:center;">' + _esc(m.pn)
                       + '</td><td>' + _esc(m.desc) + '</td></tr>';
                });
            } else {
                // 표지/일반 칸 — 좁으면 1열로 떨어뜨린다(라벨이 세로로 깨지는 걸 막는다)
                var cols = s.cols || 2;
                if ((body.clientWidth || 0) > 0 && body.clientWidth < 760) cols = 1;
                for (var i = 0; i < s.fields.length; i++) {
                    var f = s.fields[i];
                    var wide = f.wide || cols === 1;
                    if (i === 0 || wide || (i % cols) === 0) h += '<tr>';
                    var own = _hasOwn(form.id, f.key), a = _autoOf(ctx, f.from);
                    h += '<td class="doc-lab">' + _esc(f.label || f.key) + '</td>'
                       + _inputCell(form.id, f.key, own ? _docData(form.id).fields[f.key] : a.v, own, a.src, f.hint,
                                    wide ? (cols * 2 - 1) : 0, !!f.date);
                    if (wide || (i % cols) === cols - 1 || i === s.fields.length - 1) h += '</tr>';
                }
            }
            h += '</table>';
        });
        h += '</div>';

        body.innerHTML = h;
        body.oninput = function (e) {
            var el = e.target;
            if (!el || !el.getAttribute) return;
            var key = el.getAttribute('data-doc-key');
            if (key) { window._docSetField(form.id, key, el.value); return; }
            // ➕ 사람이 보탠 점검 내역 — 그 줄 자체에 적는다(기본값이 없다)
            var ak = el.getAttribute('data-doc-add');
            if (ak) {
                var ap = ak.split('\u0001');
                _checkAdd(form.id, ap[0], ap[1]).forEach(function (row) {
                    if (row.id === ap[2]) row.q = el.value;
                });
                _markDirty();
                return;
            }
            // ✏️ 점검표 내역 — 기본값(카탈로그)과 같아지면 **저장에서 뺀다**
            var tk = el.getAttribute('data-doc-text');
            if (tk) {
                var d = _docData(form.id);
                if (el.value === (el.getAttribute('data-doc-def') || '')) delete d.fields[tk];
                else d.fields[tk] = el.value;
                d.savedAt = new Date().toISOString();
                _markDirty();
                return;
            }
            // 📦 출고 이력 칸 — `<행번호>|<칸>` 으로 들어온다
            var hk = el.getAttribute('data-doc-hist');
            if (hk) {
                var pp = hk.split('|'), list = _hist(), row = list[Number(pp[0])];
                if (row) { row[pp[1]] = el.value; _markDirty(); }
            }
        };
        // ✅ 점검표 칸 켜고 끄기 — 위임으로 받는다(167항목 × 8칸에 핸들러를 달지 않는다)
        body.onclick = function (e) {
            var el = e.target && e.target.closest ? e.target.closest('[data-doc-chk]') : null;
            if (!el) return;
            var k = el.getAttribute('data-doc-chk');
            var d = _docData(form.id);
            if (d.fields[k] === 'O') delete d.fields[k]; else d.fields[k] = 'O';
            _markDirty();
            // 누른 칸만 다시 칠한다 — 167항목을 통째로 다시 그리면 눈에 띄게 느리다
            var on = d.fields[k] === 'O';
            el.classList.toggle('on', on);     // 색은 클래스가 정한다(팔레트 대응)
            el.textContent = el.getAttribute('title') + (on ? ' O' : '');
        };
        // 📎 끌어다 놓기 — 첨부 구역에 떨어뜨린 것만 받는다(앱 전역 드롭과 겹치지 않게 막는다)
        [].slice.call(body.querySelectorAll('[data-doc-att]')).forEach(function (zone) {
            zone.addEventListener('dragover', function (ev) { ev.preventDefault(); ev.stopPropagation(); zone.style.background = '#eef7ff'; });
            zone.addEventListener('dragleave', function () { zone.style.background = ''; });
            zone.addEventListener('drop', function (ev) {
                ev.preventDefault(); ev.stopPropagation(); zone.style.background = '';
                window._docAttachAdd(form.id, zone.getAttribute('data-doc-att'), ev.dataTransfer.files);
            });
        });
    };

    // 📋 Ctrl+V — Document 탭이 보일 때만, 첫 첨부 구역으로 받는다
    document.addEventListener('paste', function (ev) {
        var tab = document.getElementById('tab-document');
        if (!tab || !tab.classList.contains('active')) return;
        var items = (ev.clipboardData && ev.clipboardData.items) || [];
        var files = [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f) files.push(f); }
        }
        if (!files.length) return;
        var zone = document.querySelector('#doc-page-body [data-doc-att]');
        if (!zone) return;
        ev.preventDefault();
        window._docAttachAdd(window._docState.formId, zone.getAttribute('data-doc-att'), files);
    });

    // ── 📦 샘플 출고 이력 ───────────────────────────────────────────────
    // 📦 출고 이력은 **문서마다가 아니라 프로젝트마다 하나**다 — 어느 서식을 보고 있든 같은 목록.
    //   ⚠️ 예전엔 지금 열린 서식에 붙였다. 그 구역은 시제품 제작의뢰서와 Sample Report 가
    //      **같이 쓰는 표**(`_protoReqSections`)라, 서식을 바꾸면 이력이 빈 것처럼 보였다.
    var _hist = function () {
        var d = _docData(HIST_FORM);
        if (!d.history) {
            // 옛 데이터 구하기 — 다른 서식 밑에 적혀 있던 이력을 한 번만 가져온다.
            var docs = (window.tabData && window.tabData.documents) || {};
            var old = null;
            Object.keys(docs).forEach(function (k) {
                if (k !== HIST_FORM && docs[k] && docs[k].history && docs[k].history.length && !old) old = docs[k].history;
            });
            d.history = old ? old.slice() : [];
        }
        return d.history;
    };
    /**
     * 이력 한 줄 더하기.
     *  - 기본: **다음 단계** 1차 (PROTO A → B → C → ES → PP)
     *  - `sameStage` 를 주면: **그 단계의 다음 회차** (PROTO A 1차 → PROTO A 2차)
     *    사용자 요청(2026-11-09): "각 단계에서 1,2,3,4,5 회차로 제작할 수 있는 경우가 있으니".
     */
    window._docHistAdd = function (sameStage) {
        var list = _hist();
        var norm = function (v) { return String(v || '').trim().toUpperCase(); };
        var base = String(sameStage || '').trim();
        if (base === 'true' || sameStage === true) {
            // 지금 보고 있는 회차의 단계 — 없으면 마지막 줄의 단계
            var cur = (list.filter(function (r) { return _roundLabel(r) === window._docState.round; })[0]
                       || list[list.length - 1] || {});
            base = String(cur.stage || '').trim();
        }
        var row = { stage: '', seq: '1', date: '', qty: '', doc: '', docTitle: '' };
        if (base) {
            row.stage = base;
            var mx = 0;
            list.forEach(function (r) {
                if (norm(r.stage) !== norm(base)) return;
                mx = Math.max(mx, parseInt(r.seq, 10) || 1);
            });
            row.seq = String(mx + 1);
        } else {
            // 아직 안 쓴 단계 중 첫 번째. 전부 썼으면 비워 둔다(사람이 적는다).
            var used = list.map(function (r) { return norm(r.stage); });
            row.stage = (window.DOC_SAMPLE_STAGES || []).filter(function (s) {
                return used.indexOf(norm(s)) === -1;
            })[0] || '';
        }
        list.push(row);
        _markDirty(); window._docRender();
        return _roundLabel(row);
    };
    window._docHistDel = function (i) {
        var list = _hist();
        if (i < 0 || i >= list.length) return;
        var r = list[i];
        // ⚠️ 출고 이력은 **기록**이다 — 실수로 지우면 언제 몇 개를 냈는지가 사라진다. 한 번 묻는다.
        if (!confirm(_t('이 출고 이력을 지웁니다:\n\n' + (_roundLabel(r) || '(회차 없음)')
                        + ' / ' + (r.date || '(일자 없음)') + ' / ' + (r.qty || '-') + '\n\n지울까요?',
                        'Delete this shipping record?'))) return;
        list.splice(i, 1);
        _markDirty(); window._docRender();
    };

    // 🔎 그룹웨어에서 **이 프로젝트의** 샘플/시제품 의뢰서를 찾아 고른다.
    //   ⚠️ 찾는 법은 js/47 `_apvFindProjectDocs` **한 곳**이 정한다 — 여기서 다시 구현하지 않는다.
    //      (프로젝트 키워드로 거르는 규칙이 두 벌이 되면 한쪽만 고쳐진다)
    window._docGwPick = async function (rowIdx) {
        if (!window._apvFindProjectDocs) {
            _toast('⚠️ ' + _t('기안 조회 기능을 불러오지 못했습니다(js/47).', 'Approval lookup unavailable.'), 'error');
            return;
        }
        if (window._gwEnsureLogin) {
            var g = await window._gwEnsureLogin();
            if (!g || !g.ok) {
                _toast('🔒 ' + ((g && g.message) || _t('그룹웨어 로그인이 필요합니다.', 'Groupware login required.')), 'error');
                return;
            }
        }
        _toast('🔎 ' + _t('그룹웨어에서 의뢰서를 찾는 중…', 'Searching…'), 'info');
        var r;
        try { r = await window._apvFindProjectDocs(window.DOC_REQ_FORMS || []); }
        catch (e) { _toast('⚠️ ' + (e && e.message || e), 'error'); return; }
        // 🔎 [2026-11-09 사용자 신고: "그룹웨어 조회 안되는데?"]
        //    못 찾았을 때 **그냥 끝내지 않는다**. 프로젝트 키워드(메일키워드·모델명)가 문서 제목과
        //    안 맞으면 0건이 나오는데, 그때 사람이 할 수 있는 일이 없었다.
        //    → 창은 열고, **직접 검색**할 수 있게 한다(검색어는 사람이 정한다).
        window._docGwPending = {
            rowIdx: rowIdx, docs: r.docs, keyword: r.keyword, total: r.total, scope: 'project'
        };
        _docGwShow();
        if (!r.docs.length) {
            _toast('ℹ️ ' + _t('이 프로젝트의 의뢰서를 못 찾았습니다'
                   + (r.keyword ? ' (검색어 "' + r.keyword + '", 전체 ' + r.total + '건)'
                                : ' — Summary 의 메일키워드/모델명이 비어 검색어를 못 만들었습니다')
                   + ' — 창에서 직접 검색해 보세요.',
                   'Not found — search manually in the dialog.'), 'info');
        }
    };

    /** 창 안에서 사람이 직접 검색한다 — 비우면 **양식 이름**으로 전건을 훑는다. */
    window._docGwSearch = async function () {
        var p = window._docGwPending; if (!p) return;
        var el = document.getElementById('docgw-q');
        var term = el ? String(el.value || '').trim() : '';
        var forms = (window.DOC_REQ_FORMS || []);
        var url = BACKEND + '/gw/approval/doclist?box=all&duration=all&limit=80'
                + (term ? '&searchtype=title&keyword=' + encodeURIComponent(term)
                        : '&searchtype=formName&keyword=' + encodeURIComponent(forms[0] || ''));
        var body = document.getElementById('docgw-body');
        if (body) body.innerHTML = '<div style="padding:16px; color:#868e96;">🔎 ' + _esc(_t('찾는 중…', 'Searching…')) + '</div>';
        var docs = [];
        try {
            var res = await fetch(url);
            var d = await res.json();
            docs = (d && d.docs) || [];
        } catch (e) {
            if (body) body.innerHTML = '<div style="padding:16px; color:#b1432f;">⚠️ ' + _esc(e && e.message || e) + '</div>';
            return;
        }
        // 양식으로 한 번 거른다 — 의뢰서가 아닌 문서까지 고르게 두면 엉뚱한 번호가 적힌다.
        var norm = function (v) { return String(v == null ? '' : v).replace(/\s+/g, '').toLowerCase(); };
        var want = forms.map(norm);
        var hit = docs.filter(function (x) {
            var key = window._apvFormKey ? window._apvFormKey(x.formName, x.title) : x.formName;
            return want.indexOf(norm(x.formName)) >= 0 || want.indexOf(norm(key)) >= 0;
        });
        hit.sort(function (a, b) { return String(b.draftedAt || '').localeCompare(String(a.draftedAt || '')); });
        p.docs = hit; p.keyword = term || (forms[0] || ''); p.total = docs.length;
        p.scope = 'manual';     // ⚠️ 이 목록은 **이 프로젝트 것만이 아니다** — 창에 그렇게 적는다
        _docGwShow();
        var q = document.getElementById('docgw-q');
        if (q) { q.value = term; q.focus(); }
    };

    var _docGwShow = function () {
        var p = window._docGwPending; if (!p) return;
        var ov = document.getElementById('docgw-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'docgw-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9500; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="docgw-box" style="pointer-events:all; position:fixed; left:50%; top:10%;'
                + ' transform:translateX(-50%); width:min(820px,94vw); max-height:74vh; display:flex; flex-direction:column;'
                + ' background:#fff; border:1px solid #a3d9e0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18);'
                + ' overflow:hidden;">'
                + '<div id="docgw-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between;'
                + ' padding:9px 12px; background:#e0f5f7; border-bottom:1px solid #a3d9e0; color:#00707d;'
                + ' font-weight:bold; font-size:13px; cursor:grab;"><span id="docgw-title"></span>'
                + '<button onclick="window._docGwClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="docgw-body" style="flex:1; min-height:0; overflow-y:auto; padding:10px 12px;"></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('docgw-box', 'docgw-head'); } catch (e) { /* 〃 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('docgw-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('docgw-overlay'); } catch (e) { /* 〃 */ } }
        document.getElementById('docgw-title').textContent =
            '🔎 ' + _t('샘플/시제품 의뢰서', 'Sample request docs')
            + (p.keyword ? ' — "' + p.keyword + '"' : '') + ' (' + p.docs.length + _t('건', '') + ')';
        // 🔎 직접 검색 줄 — 프로젝트 키워드가 안 맞을 때 사람이 손으로 찾는다(막다른 길 방지).
        var h = '<div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">'
              + '<input id="docgw-q" type="text" placeholder="'
              + _esc(_t('제목으로 검색 (비우고 [찾기] = 의뢰서 전체)', 'search by title')) + '"'
              + ' onkeydown="if(event.key===\'Enter\'){window._docGwSearch();}"'
              + ' style="flex:1; padding:4px 8px; border:1px solid #cfe3e5; border-radius:5px; font-size:12px;">'
              + '<button onclick="window._docGwSearch()" style="padding:4px 12px; font-size:12px; cursor:pointer;'
              + ' border:1px solid #a3d9e0; background:#e0f5f7; color:#00707d; border-radius:5px; font-weight:bold;">🔎 '
              + _esc(_t('찾기', 'Search')) + '</button></div>';
        if (p.scope === 'manual') {
            // ⚠️ 이건 **이 프로젝트 것만이 아니다** — 숨기면 남의 프로젝트 번호가 조용히 적힌다.
            h += '<div style="margin-bottom:8px; font-size:11.5px; color:#b1432f;">⚠️ '
               + _esc(_t('이 목록은 프로젝트로 거르지 않았습니다 — 제목을 보고 고르세요.',
                         'Not filtered by project — check the title.')) + '</div>';
        }
        if (!p.docs.length) {
            h += '<div style="padding:14px 4px; color:#868e96; font-size:12px;">'
               + _esc(_t('조건에 맞는 의뢰서가 없습니다. 검색어를 바꾸거나 비우고 [찾기] 를 눌러 보세요.',
                         'No matching documents.')) + '</div>';
        }
        h += '<table style="border-collapse:collapse; width:100%; font-size:11.5px;"><tr>'
              + '<th style="border:1px solid #cfe3e5; padding:4px; background:#eef6f7; text-align:left;">' + _esc(_t('문서번호', 'No.')) + '</th>'
              + '<th style="border:1px solid #cfe3e5; padding:4px; background:#eef6f7; text-align:left;">' + _esc(_t('기안 일자', 'Date')) + '</th>'
              + '<th style="border:1px solid #cfe3e5; padding:4px; background:#eef6f7; text-align:left;">' + _esc(_t('기안자', 'Drafter')) + '</th>'
              + '<th style="border:1px solid #cfe3e5; padding:4px; background:#eef6f7; text-align:left;">' + _esc(_t('제목', 'Title')) + '</th></tr>';
        p.docs.forEach(function (d, i) {
            h += '<tr onclick="window._docGwChoose(' + i + ')" style="cursor:pointer;"'
               + ' onmouseover="this.style.background=\'#eef6f7\';" onmouseout="this.style.background=\'\';">'
               + '<td style="border:1px solid #cfe3e5; padding:3px 6px; white-space:nowrap; font-weight:bold;">'
               + _esc(d.docNum || ('id:' + d.id)) + '</td>'
               + '<td style="border:1px solid #cfe3e5; padding:3px 6px; white-space:nowrap;">' + _esc(String(d.draftedAt || '').slice(0, 10)) + '</td>'
               + '<td style="border:1px solid #cfe3e5; padding:3px 6px; white-space:nowrap;">' + _esc(d.drafterName || '') + '</td>'
               + '<td style="border:1px solid #cfe3e5; padding:3px 6px;">' + _esc(d.title || '') + '</td></tr>';
        });
        document.getElementById('docgw-body').innerHTML = h + '</table>';
    };
    window._docGwClose = function () {
        var ov = document.getElementById('docgw-overlay'); if (ov) ov.style.display = 'none';
        window._docGwPending = null;
    };
    window._docGwChoose = function (i) {
        var p = window._docGwPending; if (!p) return;
        var d = p.docs[i]; if (!d) return;
        var list = _hist();
        if (p.rowIdx < 0 || p.rowIdx >= list.length) { window._docGwClose(); return; }
        list[p.rowIdx].doc = d.docNum || ('id:' + d.id);
        list[p.rowIdx].docTitle = d.title || '';
        // 🔗 여는 데 필요한 것도 같이 적어 둔다 — 문서번호만으로는 매번 결재함을 뒤져야 한다
        //   (채번 전 문서는 `docNum` 이 비어 있어 **id 가 유일한 손잡이**다)
        list[p.rowIdx].docId = String(d.id || '');
        list[p.rowIdx].docUrl = d.url || '';
        // 출고 일자가 비어 있으면 **기안일로 채워 준다**(사람이 고칠 수 있다) — 보통 그 무렵이다.
        if (!list[p.rowIdx].date && d.draftedAt) list[p.rowIdx].date = String(d.draftedAt).slice(0, 10);
        _markDirty(); window._docGwClose(); window._docRender();
        _toast('🔎 ' + (d.docNum || '') + _t(' 를 넣었습니다.', ' linked.'), 'success');
    };

    // ── 📁 NAS — 다른 페이지와 같은 자료실 탐색기 ────────────────────────
    window._docOpenNas = function () {
        var form = _formById(window._docState.formId);
        if (!window._dsOpenBrowser) {
            _toast('⚠️ ' + _t('문서 저장소 기능을 불러오지 못했습니다.', 'Document store unavailable.'), 'error'); return;
        }
        // 이 프로젝트의 폴더를 연다 — 없으면 백엔드가 만들면서 연다(`_docstore_dir` 이 makedirs).
        // 🗂 프로젝트 폴더를 열어 **문서 폴더들을 한눈에** 보여 준다(한 문서 안이 아니라)
        window._docEnsureFolders();
        // 📁 [2026-11-11 신고 "헤더에 적히는 폴더 명이 이상"] 탭·제목은 **다른 페이지와 같은 장치**
        //    (`_dsProjectAwareFolders`, js/48)가 만든다 — 그래야 `📌 <프로젝트>` / `📁 DOCUMENT (전체)`
        //    로 CUSTOMER·MC 와 같은 말이 나온다. 전엔 제목이 그냥 `Document` 한 마디였다.
        var tabs = window._dsProjectAwareFolders ? window._dsProjectAwareFolders(DOC_ROOT) : null;
        window._dsOpenBrowser(_projFolder(_ctx()), {
            title: DOC_ROOT,
            folders: tabs || undefined
        });
    };

    // ── 📂 불러오기 — 문서를 읽어 이 페이지 칸을 채운다 ──────────────────
    //  ⚠️ **AI 를 안 쓴다**(결정론). 서식의 칸 이름으로 `라벨 → 값` 을 찾는다:
    //    · 엑셀이면 시트를 표로 읽어 `[라벨, 값]` 쌍을 만든다(이 페이지가 내보낸 모양 그대로)
    //    · 그 외(docx/pdf/txt/html)는 글자를 뽑아 **줄 단위**로 라벨을 찾는다
    //  ⚠️ 바로 적용하지 않는다 — **무엇을 어디에 넣을지 보여주고 사람이 승인**해야 들어간다
    //    (틀린 값이 문서에 조용히 박히는 게 제일 나쁘다).
    var _impNorm = function (s) {
        return String(s == null ? '' : s).replace(/[\s:：·.]/g, '').toLowerCase();
    };
    var _formFieldList = function (form) {
        var out = [];
        (form.sections || []).forEach(function (s) {
            if (s.kind === 'check' || s.kind === 'attach' || s.kind === 'optical') return;
            (s.fields || []).forEach(function (f) { out.push({ key: f.key, label: f.label || f.key }); });
            (s.rows || []).forEach(function (r) {
                (r.cells || []).forEach(function (c) { if (c.key) out.push({ key: c.key, label: c.key }); });
            });
            if (s.kind === 'text' && s.key) out.push({ key: s.key, label: s.title.replace(/^#\s*/, '') });
        });
        return out;
    };

    window._docImportPick = function () {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.onchange = function () { if (inp.files && inp.files[0]) window._docImportFile(inp.files[0]); };
        inp.click();
    };

    window._docImportFile = async function (file) {
        var form = _formById(window._docState.formId);
        if (!form) return;
        if (window._docCanRead && !window._docCanRead(file.name)) {
            _toast('⚠️ ' + (window._docReadHint ? window._docReadHint(file.name)
                : _t('이 종류는 아직 못 읽습니다.', 'Cannot read this type.')), 'error');
            return;
        }
        _toast('⏳ ' + _t('문서를 읽는 중…', 'Reading…'), 'info');
        var pairs = [];
        try {
            var isWb = window._docIsWorkbook && window._docIsWorkbook(file.name);
            if (isWb && typeof XLSX !== 'undefined') {
                var wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
                (wb.SheetNames || []).forEach(function (n) {
                    XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }).forEach(function (row) {
                        // 한 줄에 `라벨 | 값` 또는 `라벨 | 값 | 라벨 | 값` 이 올 수 있다
                        for (var i = 0; i + 1 < row.length; i += 2) {
                            var a = String(row[i] || '').trim(), b = String(row[i + 1] || '').trim();
                            if (a && b) pairs.push([a, b]);
                        }
                    });
                });
            } else {
                var txt = await window._pxExtractText(file, null);
                String(txt || '').split(/\r?\n/).forEach(function (ln) {
                    // `라벨 : 값` · `라벨 <탭/2칸이상> 값` 둘 다 받는다
                    var m = ln.match(/^\s*([^:\t]{1,30}?)\s*[:：]\s*(.+?)\s*$/)
                         || ln.match(/^\s*(.{1,30}?)(?:\t|\s{2,})(.+?)\s*$/);
                    if (m && m[1].trim() && m[2].trim()) pairs.push([m[1].trim(), m[2].trim()]);
                });
            }
        } catch (e) {
            _toast('⚠️ ' + _t('읽지 못했습니다: ', 'Could not read: ') + (e && e.message || e), 'error');
            return;
        }

        // 라벨로 짝짓기 — 먼저 나온 값이 이긴다(문서 앞쪽이 본문이다)
        var byLabel = {};
        pairs.forEach(function (p) { var k = _impNorm(p[0]); if (k && !byLabel[k]) byLabel[k] = p[1]; });
        var hits = [];
        _formFieldList(form).forEach(function (f) {
            var v = byLabel[_impNorm(f.label)] || byLabel[_impNorm(f.key)];
            if (v === undefined || v === '') return;
            var cur = _hasOwn(form.id, f.key) ? _docData(form.id).fields[f.key] : '';
            if (String(cur) === String(v)) return;   // 이미 같은 값이면 보여줄 것도 없다
            hits.push({ key: f.key, label: f.label, now: cur, next: v });
        });
        if (!hits.length) {
            _toast('ℹ️ ' + _t('이 문서에서 채울 칸을 못 찾았습니다(라벨이 서식과 달라 보입니다). 파일: ',
                              'No matching fields. ') + (file.name || ''), 'info');
            return;
        }
        window._docImportPending = { formId: form.id, hits: hits, file: file.name || '' };
        _docImportPreview();
    };

    var _docImportPreview = function () {
        var p = window._docImportPending; if (!p) return;
        var ov = document.getElementById('docimp-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'docimp-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9500; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="docimp-box" style="pointer-events:all; position:fixed; left:50%; top:9%;'
                + ' transform:translateX(-50%); width:min(760px,94vw); max-height:78vh; display:flex; flex-direction:column;'
                + ' background:#fff; border:1px solid #a5c8f0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18);'
                + ' overflow:hidden;">'
                + '<div id="docimp-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between;'
                + ' padding:9px 12px; background:#e7f3ff; border-bottom:1px solid #a5c8f0; color:#1971c2;'
                + ' font-weight:bold; font-size:13px; cursor:grab;"><span id="docimp-title"></span>'
                + '<button onclick="window._docImportClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="docimp-body" style="flex:1; min-height:0; overflow-y:auto; padding:10px 12px;"></div>'
                + '<div style="flex-shrink:0; display:flex; justify-content:flex-end; gap:6px; padding:9px 12px; border-top:1px solid #e9ecef;">'
                + '<button onclick="window._docImportClose()" style="padding:6px 12px; background:#f1f3f5; color:#495057;'
                + ' border:1px solid #dee2e6; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">'
                + _esc(_t('취소', 'Cancel')) + '</button>'
                + '<button onclick="window._docImportApply()" style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d;'
                + ' border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">✅ '
                + _esc(_t('이대로 채우기', 'Apply')) + '</button></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('docimp-box', 'docimp-head'); } catch (e) { /* 〃 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('docimp-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('docimp-overlay'); } catch (e) { /* 〃 */ } }
        document.getElementById('docimp-title').textContent =
            '📂 ' + _t('불러오기 — ', 'Import — ') + p.file + ' (' + p.hits.length + _t('칸', '') + ')';
        var h = '<div style="margin-bottom:8px; font-size:11.5px; color:#868e96;">'
              + _esc(_t('문서에서 찾은 값입니다. 체크된 칸만 채웁니다 — 기존 값은 덮어씁니다.',
                        'Checked fields will be filled.')) + '</div>'
              + '<table style="border-collapse:collapse; width:100%; font-size:11.5px;"><tr>'
              + '<th style="border:1px solid #e9ecef; padding:4px; width:26px;"></th>'
              + '<th style="border:1px solid #e9ecef; padding:4px; text-align:left;">' + _esc(_t('칸', 'Field')) + '</th>'
              + '<th style="border:1px solid #e9ecef; padding:4px; text-align:left;">' + _esc(_t('지금', 'Now')) + '</th>'
              + '<th style="border:1px solid #e9ecef; padding:4px; text-align:left;">' + _esc(_t('문서에서', 'From file')) + '</th></tr>';
        p.hits.forEach(function (x, i) {
            h += '<tr><td style="border:1px solid #e9ecef; padding:3px; text-align:center;">'
               + '<input type="checkbox" id="docimp-c-' + i + '" checked></td>'
               + '<td style="border:1px solid #e9ecef; padding:3px 6px; font-weight:bold; white-space:nowrap;">' + _esc(x.label) + '</td>'
               + '<td style="border:1px solid #e9ecef; padding:3px 6px; color:#868e96;">' + _esc(x.now || '-') + '</td>'
               + '<td style="border:1px solid #e9ecef; padding:3px 6px; color:#1f7a3d; font-weight:bold;">' + _esc(x.next) + '</td></tr>';
        });
        document.getElementById('docimp-body').innerHTML = h + '</table>';
    };
    window._docImportClose = function () {
        var ov = document.getElementById('docimp-overlay'); if (ov) ov.style.display = 'none';
        window._docImportPending = null;
    };
    window._docImportApply = function () {
        var p = window._docImportPending; if (!p) return;
        var n = 0;
        p.hits.forEach(function (x, i) {
            var c = document.getElementById('docimp-c-' + i);
            if (c && !c.checked) return;
            window._docSetField(p.formId, x.key, x.next); n++;
        });
        window._docImportClose();
        window._docRender();
        _toast('📂 ' + _t(n + '칸을 채웠습니다.', 'Filled ' + n + ' field(s).'), 'success');
    };

    // ── 💾 원본저장 (.docx) ─────────────────────────────────────────────
    //  [2026-11-09 사용자 요청] "문서 출력 버튼은 브라우저 인쇄로 대체할 거니까 삭제하고,
    //   원본저장 버튼을 만들어서 첨부와 동일한 형태(원본문서)로 저장되게".
    //  실측 원본(`260929_LNW_S32_…_Proto B_Sample Report_V00.docx`)은 표 19개짜리 Word 문서다.
    //
    //  ⚠️⚠️ 내용은 **`_docToAoa` 한 곳**에서 온다 — 화면·엑셀·워드가 같은 목록을 쓴다.
    //     여기서 따로 조립하면 구역을 하나 늘릴 때마다 세 곳을 고쳐야 하고, 곧 갈라진다.
    //  ⚠️ 만드는 일은 **백엔드**가 한다(python-docx). 브라우저엔 Word 를 만들 수단이 없다.
    //  ⚠️ 백엔드 재시작 전엔 404 — 그때는 "엑셀 저장"으로 받으라고 정직하게 안내한다.
    window._docSaveDocx = async function () {
        var st = window._docState, form = _formById(st.formId);
        if (!form) { _toast('⚠️ ' + _t('문서를 고르세요.', 'Pick a document.'), 'error'); return; }
        var pop = document.getElementById('doc-form-dropdown');
        if (pop) pop.style.display = 'none';
        var ctx = window._dgCollect(), opt = { stage: st.stage };
        var name = form.nameOf(ctx, opt).replace(/\.(pptx|xlsx|docx)$/i, '') + '.docx';
        _toast('⏳ ' + _t('원본 문서를 만드는 중…', 'Building…'), 'info');
        var res;
        try {
            res = await fetch(BACKEND + '/doc/docx', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, rows: window._docToAoa(form.id) })
            });
        } catch (e) {
            _toast('⚠️ ' + _t('백엔드에 닿지 못했습니다: ', 'Backend unreachable: ') + (e && e.message || e), 'error');
            return;
        }
        if (!res.ok) {
            var why = '';
            try { why = (await res.json()).error || ''; } catch (e2) { /* HTML 404 면 본문이 JSON 이 아니다 */ }
            _toast('⚠️ ' + (why || (res.status === 404
                    ? _t('백엔드를 재시작해야 쓸 수 있습니다(원본저장). 지금은 [📊 엑셀 저장]을 쓰세요.',
                         'Restart the backend to use this.')
                    : _t('만들지 못했습니다.', 'Failed.'))), 'error');
            return;
        }
        var blob = await res.blob();
        // 받기 — `<a download>` 로 **이름을 붙여** 내려받는다(blob: 주소엔 이름이 안 실린다)
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        _toast('💾 ' + name + ' (' + Math.round(blob.size / 1024) + 'KB)', 'success');
    };

    // ── 📗📊📁 옵션 출력 ───────────────────────────────────────────────
    window._docToAoa = function (formId) {
        var form = _formById(formId), ctx = window._dgCollect(), d = _docData(formId);
        var rows = [], val = function (key, from) {
            return _hasOwn(formId, key) ? d.fields[key] : _autoOf(ctx, from).v;
        };
        rows.push([form.label]);
        rows.push([(ctx.meta.고객사 || '') + ' ' + (ctx.meta.모델명 || ''), '', '', _t('출력일', 'date') + ': ' + _todayDash()]);
        rows.push([]);
        form.sections.forEach(function (s) {
            rows.push([s.title]);
            if (s.kind === 'history') {
                rows.push([_t('회차', 'Stage'), _t('출고 일자', 'Shipped'), _t('수량', 'Qty'),
                           _t('샘플/시제품 의뢰서', 'Sample request'), _t('제목', 'Title')]);
                _hist().forEach(function (r) {
                    rows.push([r.stage || '', r.date || '', r.qty || '', r.doc || '', r.docTitle || '']);
                });
            } else if (s.kind === 'check') {
                (window.DOC_CHECK_SHEETS || []).forEach(function (sh) {
                    rows.push([sh.key]);
                    rows.push([_t('항목', 'Group'), _t('내역', 'Item'), _t('개발', 'Dev'),
                               _t('시제품', 'Proto'), _t('보증', 'QA'), _t('확인자 의견', 'Comment')]);
                    // ⚠️ 화면과 **같은 목록**(해상도 연결·내역 수정 포함)을 쓴다 — 두 벌로 두면 갈라진다
                    _sheetItems(sh, formId).forEach(function (it) {
                        var base = 'chk|' + sh.key + '|' + it.id + '|';
                        var on = function (cols) {
                            return cols.filter(function (c) { return d.fields[base + c] === 'O'; }).join(',');
                        };
                        var tkey = base + 'text';
                        rows.push([it.g, _hasOwn(formId, tkey) ? d.fields[tkey] : it.q,
                                   on(['점검요청', '해당없음']),
                                   on(['합격', '불합격', 'N/A']), on(['합격', '불합격', 'N/A']),
                                   d.fields[base + 'note'] || '']);
                    });
                    rows.push([]);
                });
            } else if (s.kind === 'resolution') {
                var xports = window.RES_PORTS || [];
                rows.push(['NO', 'RESOLUTION'].concat(xports.map(function (p) { return p.label; })));
                (window.resSelectedRows ? window.resSelectedRows() : []).forEach(function (r, i) {
                    rows.push([i + 1, r.label].concat(xports.map(function (p) { return r.ports[p.key] ? 'O' : ''; })));
                });
            } else if (s.kind === 'attach') {
                var list = (d.att[s.key] || []);
                rows.push([_t('첨부', 'attachments') + ' ' + list.length + _t('건', '')]);
                list.forEach(function (a) { rows.push(['', a.orig || a.name]); });
            } else if (s.kind === 'text') {
                rows.push([val(s.key, null) || '']);
            } else if (s.kind === 'table') {
                rows.push(s.columns.slice());
                s.rows.forEach(function (r) {
                    rows.push(r.cells.map(function (c) { return c.fixed !== undefined ? c.fixed : val(c.key, c.from); }));
                });
            } else if (s.kind === 'optical') {
                // 🔬 이 문서(=이 회차)의 측정 이력만 — 전체 회차 집계는 화면 전용(인쇄물은 한 회차 보고서다)
                rows.push([_t('바코드', 'Barcode'), _t('측정일시', 'Measured'), 'Native X', 'Native Y',
                           'Max PWM Lv', 'Default PWM Lv', 'Gamut(%NTSC)', 'PQ Check']);
                (d.opticalLogs || []).forEach(function (it) {
                    rows.push([it.barcode, it.startTime, it.nativeX, it.nativeY, it.maxPwmLv, it.defaultPwmLv,
                               it.gamutPct, (it.pqFail === 0 ? 'PASS' : it.pqFail + '/' + it.pqTotal + ' FAIL')]);
                });
            } else if (s.kind === 'milestones') {
                rows.push([_t('구분', 'Stage')].concat((window.DOC_MILESTONES || []).map(function (m) { return m.label; })));
                ['plan', 'actual'].forEach(function (k) {
                    rows.push([k === 'plan' ? _t('계획', 'Plan') : _t('실적', 'Actual')]
                        .concat((window.DOC_MILESTONES || []).map(function (m) { return ctx.milestones[k][m.stage] || ''; })));
                });
            } else if (s.kind === 'members') {
                rows.push([_t('구분', 'Role'), _t('성명', 'Name')]);
                ctx.members.forEach(function (m) { rows.push([m.role, m.name]); });
            } else if (s.kind === 'spec') {
                rows.push(['NO', 'TYPE', 'Description', 'KTK Note']);
                ctx.spec.forEach(function (r, i) { rows.push([i + 1, r.label, r.value, r.note]); });
            } else if (s.kind === 'materials') {
                rows.push([_t('구분', 'Category'), _t('코드', 'PN'), _t('내역', 'Description')]);
                ctx.materials.forEach(function (m) { rows.push([m.cat, m.pn, m.desc]); });
            } else {
                (s.fields || []).forEach(function (f) { rows.push([f.label || f.key, val(f.key, f.from)]); });
            }
            rows.push([]);
        });
        return rows;
    };

    window._docExport = async function (how) {
        var st = window._docState, form = _formById(st.formId);
        if (!form) { _toast('⚠️ ' + _t('문서를 고르세요.', 'Pick a document.'), 'error'); return; }
        var ctx = window._dgCollect(), opt = { stage: st.stage };

        if (how === 'pptx') {
            if (!form.builder || !window._dgBuildStageDeck) {
                _toast('⚠️ ' + _t('이 문서는 PPT 출력이 없습니다.', 'No PPT builder.'), 'error'); return;
            }
            try {
                var pptx = window._dgBuildStageDeck(ctx, opt);
                await pptx.writeFile({ fileName: form.nameOf(ctx, opt) + '.pptx' });
                _toast('📊 ' + form.label, 'success');
            } catch (e) { _toast('⚠️ ' + (e && e.message || e), 'error'); }
            return;
        }
        if (typeof XLSX === 'undefined') {
            _toast('⚠️ ' + _t('엑셀 라이브러리를 불러오지 못했습니다.', 'XLSX not loaded.'), 'error'); return;
        }
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet(window._docToAoa(form.id));
        ws['!cols'] = [{ wch: 20 }, { wch: 34 }, { wch: 26 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, ws, form.label.slice(0, 28));
        var name = form.nameOf(ctx, opt).replace(/\.(pptx|xlsx)$/i, '') + '.xlsx';

        if (how !== 'nas') { XLSX.writeFile(wb, name); _toast('📗 ' + name, 'success'); return; }
        if (!window._dgUploadBlob) { _toast('⚠️ ' + _t('업로드 기능을 불러오지 못했습니다.', 'Upload unavailable.'), 'error'); return; }
        var buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        _toast('⏳ ' + _t('NAS 에 올리는 중…', 'Uploading…'), 'info');
        var r = await window._dgUploadBlob(_docFolder(ctx), name, blob);
        if (r.ok) _toast('📁 ' + _docFolder(ctx) + '/' + r.name + ' (' + Math.round((r.size || 0) / 1024) + 'KB)', 'success');
        else if (r.skipped) _toast(_t('올리지 않았습니다.', 'Not uploaded.'), 'info');
        else _toast('⚠️ ' + _t('올리지 못했습니다: ', 'Upload failed: ') + r.error, 'error');
    };

    window._docOnTabShown = function () {
        try { window._docRender(); } catch (e) { /* 그리기 실패가 탭을 막지 않게 */ }
        // 🗂 탭에 들어오면 이 프로젝트의 문서 폴더들을 만들어 둔다(없으면 NAS 가 텅 비어 보인다).
        //   ⚠️ 기다리지 않는다 — 폴더 만들기가 화면을 붙잡으면 안 된다.
        try { window._docEnsureFolders(); } catch (e) { /* 〃 */ }
    };
    var boot = function () {
        if (!document.getElementById('doc-page-body')) return;
        try { window._docRender(); } catch (e) { /* 〃 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
