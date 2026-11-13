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
        },
        // 🏷 [2026-11-12 신규] 라벨사양서 — 실측 원본("모델명세서_라벨_<품목코드>_<모델>_V/R<REV>.xlsx")은
        //    라벨이 모델마다 3~5개(규격·6자리 라벨품목코드·부착위치) 반복되고, '제품' 라벨 하나에만
        //    인증(CE/FCC/UL…)·정격표시(Set/LED Rating SPEC…) 표가 딸린다. 둘 다 개수가 들쭉날쭉해
        //    고정 `table` kind 로는 못 받는다 — 'check' kind 와 같은 add/del-row 전용 kind 둘로 받는다.
        {
            id: 'label-spec', icon: '🏷', label: '라벨사양서', folder: '라벨사양서',
            note: '라벨마다 규격·라벨품목코드(6자리)·부착위치를 적으면, 그 코드로 SAP 원자재승인원'
                + ' 폴더에서 라벨 도안을 바로 찾아 엽니다.',
            nameOf: function (ctx) { return _projKey(ctx) + '_라벨사양서_' + _today(); },
            sections: [
                {
                    title: '라벨사양서', cols: 2,
                    fields: [
                        { key: 'BUYER', from: 'meta.고객사' },
                        { key: 'MODEL', from: 'meta.모델풀네임' },
                        { key: '품목코드', from: 'meta.제품코드', hint: '예: 502293' },
                        { key: 'REV', hint: '예: 00' },
                        { key: '작성일자', from: 'today', date: true }
                    ]
                },
                { title: '# 라벨 목록', kind: 'labelitems' },
                { title: '# 인증 · 정격 표시 (제품 라벨)', kind: 'labelcerts' }
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
    // 🏷 [2026-11-13 요청] "Document 페이지 문서는 Summary 에 등록된 모델(MVD/TVD/TPR…)별로
    //    나와야 함" — M.C/BOM/Customer SPEC/Resolution spec 과 **같은** `window.mcActiveUnit`
    //    을 공유한다(제품구분자를 따로 두지 않는다 — 안 그러면 "M.C 는 TPR 인데 Document 는
    //    MVD" 같은 어긋남이 생긴다). 모델을 하나도 안 늘린 프로젝트는 `getMcUnits()` 가 빈
    //    배열이라 `window.mcActiveUnit` 이 항상 `''`이고, 저장 열쇠도 **옛날과 완전히 같다**
    //    — 기존 단일모델 프로젝트는 손댈 필요가 없다.
    var _dataKeyBase = function (id) {
        var form = _formById(id);
        if (!form || !form.perRound) return id;
        return id + '@' + (window._docState.round || _docRounds()[0] || 'PROTO A');
    };
    var _dataKey = function (id) {
        var base = _dataKeyBase(id);
        var u = window.mcActiveUnit || '';
        return u ? base + '#' + u : base;
    };
    var _docData = function (id) {
        window.tabData = window.tabData || {};
        window.tabData.documents = window.tabData.documents || {};
        var k = _dataKey(id);
        var isNew = !window.tabData.documents[k];
        var d = window.tabData.documents[k] = window.tabData.documents[k] || {};
        d.fields = d.fields || {};
        d.att = d.att || {};
        // ⚠️⚠️ **모델을 처음 추가한 프로젝트**가 그 모델로 처음 들어올 때, 모델 구분이 없던
        //    옛 문서 내용을 한 번 베껴 담는다(이관, js/43 과 같은 방식) — 안 그러면 모델을
        //    추가하는 순간 이미 적어 둔 문서가 그 모델에선 전부 빈 걸로 보인다. **복사**만
        //    하고 옛 키(모델 없음)는 그대로 둔다 — 다음부터는 k 가 이미 있어 이 블록을 다시
        //    지나지 않는다(멱등). `.history`(샘플 출고 이력)는 `_hist()` 가 **따로** 더 넓게
        //    훑어 이관하므로 여기서는 건드리지 않는다.
        if (isNew && k.indexOf('#') !== -1) {
            var legacy = window.tabData.documents[k.slice(0, k.indexOf('#'))];
            if (legacy) {
                if (legacy.fields) d.fields = JSON.parse(JSON.stringify(legacy.fields));
                if (legacy.att) d.att = JSON.parse(JSON.stringify(legacy.att));
            }
        }
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

    // ── 🏷 라벨사양서 — 라벨 목록 + 인증/정격 표 (2026-11-12 신규) ─────────
    //   둘 다 모델마다 행 개수가 다르다(실측 3~5개 라벨 · 3~4개 인증 · 1~3개 정격) — 번호(자리)로
    //   두면 행을 지웠을 때 아래 줄 전부가 밀린다는 함정은 없다(해상도·checkAdd 와 달리 '같은
    //   항목을 다른 저장에서도 찾아야 하는' 자리가 아니라서 — 순서만 유지하면 그만이다).
    window._docLabelItemAdd = function (formId) {
        var d = _docData(formId);
        d.labelItems = d.labelItems || [];
        d.labelItems.push({ size: '', code: '', position: '', note: '' });
        _markDirty(); window._docRender();
    };
    window._docLabelItemDel = function (formId, idx) {
        var list = _docData(formId).labelItems || [], it = list[idx];
        if (!it) return;
        var filled = [it.size, it.code, it.position, it.note].filter(Boolean).join(' ');
        if (filled && !confirm(_t('이 라벨을 지웁니다:\n\n' + filled, 'Delete this label?'))) return;
        list.splice(idx, 1);
        // 🔎 찾기 결과는 자리(행 번호)로 저장돼 있어 — 지우면 뒤 칸들의 번호가 밀리므로 비운다
        if (window._docLabelFindResult) {
            Object.keys(window._docLabelFindResult).forEach(function (k) {
                if (k.indexOf(formId + '|') === 0) delete window._docLabelFindResult[k];
            });
        }
        _markDirty(); window._docRender();
    };
    window._docLabelCertAdd = function (formId, kind) {
        var lc = _docData(formId).labelCerts = _docData(formId).labelCerts || { certs: [], ratings: [] };
        if (kind === 'c') lc.certs.push({ name: '', check: '', print: '', printType: '' });
        else lc.ratings.push({ name: '', spec: '', print: '' });
        _markDirty(); window._docRender();
    };
    window._docLabelCertDel = function (formId, kind, idx) {
        var lc = _docData(formId).labelCerts || {}, list = kind === 'c' ? lc.certs : lc.ratings;
        if (!list || !list[idx]) return;
        list.splice(idx, 1);
        _markDirty(); window._docRender();
    };
    // 🖼 [2026-11-12 2차] 라벨 도안 **공용 라이브러리** — 라벨품목코드(6자리)가 주인이지
    //    프로젝트가 주인이 아니다(사용자 지적: "공통문서라서 프로젝트로 가면 안 될 것 같다").
    //    같은 코드를 다른 프로젝트도 쓸 수 있어서, PARTS/PANEL 과 같은 성격의 **공용 폴더**
    //    (`라벨도안/<코드>.<ext>`, 코드당 파일 하나)에 둔다. `DOCUMENT/<프로젝트>/...` 가 아니다.
    //    한 번 찾아 저장하면 그 뒤로는 **같은 코드면 재검색 없이 바로 보인다**.
    var _LABEL_ART_FOLDER = '라벨도안';
    window._docLabelArtIndex = window._docLabelArtIndex === undefined ? null : window._docLabelArtIndex;
    window._docLabelArtLoading = false;
    window._docLabelArtLoadFailedAt = 0;   // ⚠️ 아래 설명 — 실패 뒤 재시도 쿨다운(5초)
    // ⚠️⚠️ [2026-11-13, 사용자 신고 "크기변경/회전/배경삭제 결과가 실시간으로 안 보인다"] 파일명이
    //    그대로라(`<코드>.png`, 덮어쓰기) 브라우저가 **옛 캐시 그림**을 계속 보여줬다 — 업로드는
    //    성공했지만 화면만 안 바뀌었다. 덮어쓸 때마다 올리는 버전 번호를 쿼리에 실어 매번 다른
    //    주소로 만든다(코드 하나에 번호 하나 — 모달·표 썸네일 둘 다 이 번호를 같이 쓴다).
    window._docLabelArtVer = window._docLabelArtVer || {};
    var _docLabelBumpVer = function (code) { window._docLabelArtVer[code] = (window._docLabelArtVer[code] || 0) + 1; };
    var _docLabelArtSrc = function (code, artFile) {
        return BACKEND + '/doc/get?folder=' + encodeURIComponent(_LABEL_ART_FOLDER) + '&name=' + encodeURIComponent(artFile)
            + '&_v=' + (window._docLabelArtVer[code] || 0);
    };
    // 📏 [2026-11-13, 사용자 요청] 표 썸네일도 끌어서 크기를 조절할 수 있다 — 모달의 `size`(큰 보기)
    //    와는 **다른 칸**(`thumbSize`)에 저장한다(표는 늘 작게·모달은 늘 크게 보여야 하는 11차 결정과
    //    충돌하지 않게). 끌 때 비율을 지킬지는 전역 체크(`_docLabelAspectLock`) 하나로 모달·표 둘 다 같이 쓴다.
    window._docLabelThumbSizeCache = window._docLabelThumbSizeCache || {};   // code -> {w,h} | null
    window._docLabelAspectLock = window._docLabelAspectLock !== false;       // 기본 켬
    // 📋 [2026-11-13, 사용자 요청] "빈 라벨지에 기입해야 하는 내용을 도표 형태로" — 실측 예시
    //    라벨(Part No·Q'ty·Serial No·Product Des.·Mfr. Name·Mfr. PN·Made in)의 고정 항목표.
    //    ⚠️ 도안(artwork)·표시(notes)는 **코드가 주인**(공용)이지만, 이 값들은 **이 프로젝트의
    //    그 라벨 한 장**에만 해당하는 값(시리얼 등)이라 공용 폴더가 아니라 `it`(labelItems 행)
    //    자체에 저장한다 — 코드가 같아도 프로젝트마다·라벨마다 값이 다르다.
    var LABEL_FIELD_CATALOG = [
        { key: 'partNo', label: 'Part No' },
        { key: 'qty', label: "Q'ty" },
        { key: 'serialNo', label: 'Serial No' },
        { key: 'productDes', label: 'Product Des.' },
        { key: 'mfrName', label: 'Mfr. Name' },
        { key: 'mfrPn', label: 'Mfr. PN' },
        { key: 'madeIn', label: 'Made in' }
    ];
    window._docLabelFieldsOpen = window._docLabelFieldsOpen || {};   // "<formId>|<idx>" -> true(펼침, 저장 안 함 — 화면 상태일 뿐)
    window._docLabelFieldsToggle = function (key) {
        window._docLabelFieldsOpen[key] = !window._docLabelFieldsOpen[key];
        window._docRender();
    };
    window._docLabelFieldAddCustom = function (formId, idx) {
        var it = (_docData(formId).labelItems || [])[idx];
        if (!it) return;
        it.fieldsCustom = it.fieldsCustom || [];
        it.fieldsCustom.push({ label: '', value: '' });
        _markDirty(); window._docRender();
    };
    window._docLabelFieldDelCustom = function (formId, idx, ci) {
        var it = (_docData(formId).labelItems || [])[idx];
        var list = it && it.fieldsCustom;
        if (!list || !list[ci]) return;
        list.splice(ci, 1);
        _markDirty(); window._docRender();
    };
    window._docLabelArtLoad = async function () {
        if (window._docLabelArtLoading) return;
        window._docLabelArtLoading = true;
        var idx = {};
        try {
            var r = await fetch(BACKEND + '/doc/list?folder=' + encodeURIComponent(_LABEL_ART_FOLDER));
            var j = await r.json();
            if (j && j.ok) {
                (j.files || []).forEach(function (f) { idx[f.name.replace(/\.[^.]+$/, '')] = f.name; });
            }
            window._docLabelArtIndex = idx;      // 폴더가 아직 없거나 비었어도 {} 로 — 다시 재시도만 안 하면 된다
        } catch (e) {
            // ⚠️⚠️ [2026-11-12 11차 실측] 백엔드가 안 닿으면(CORS·연결 거부) 실패마다 `_docRender()`
            //    를 부르고, 그 렌더는 `_docLabelArtIndex===null` 을 보고 **바로** 이 함수를 또
            //    부른다 — 백엔드가 계속 안 닿는 동안 **무한 루프로 네트워크를 두드렸다**(실측:
            //    렌더-재시도가 쉴 새 없이 수백 번). 실패 시각을 적어 두고 render-gate 가 5초
            //    쿨다운을 지키게 한다(SAP·그룹웨어 로그인과 같은 "실패 후 바로 재시도 금지" 결).
            window._docLabelArtIndex = null;     // 네트워크 문제는 쿨다운 지난 뒤 다시 시도
            window._docLabelArtLoadFailedAt = Date.now();
        }
        window._docLabelArtLoading = false;
        window._docRender();
    };
    // 📍 [2026-11-12 3차] 라벨 도안 위 표시(원본의 빨간 화살표+텍스트와 같은 뜻, 예:
    //    "REV 정보는 영업 P/O 정보와 반드시 일치해야 함") — 도안 이미지처럼 **코드가 주인**이다
    //    (그 도안의 어느 지점을 가리키는 내용이라 어느 프로젝트에서 봐도 같아야 한다). 그래서
    //    이미지와 같은 공용 폴더에 **사이드카**(`<코드>.notes.json`)로 둔다. 화살표 대신 번호
    //    매긴 동그라미(①②…) + 아래 번호 목록 — 선을 자동으로 그려 붙이는 것보다 단순하고
    //    인쇄에도 그대로 나온다.
    window._docLabelNotesCache = window._docLabelNotesCache || {};     // code -> [{x,y,text}] (0~1 비율)
    window._docLabelSizeCache = window._docLabelSizeCache || {};       // code -> {w,h}(px) | null(기본 크기)
    window._docLabelNotePlacing = window._docLabelNotePlacing || null; // 지금 "표시 추가" 대기 중인 code
    // 🔤 [2026-11-13, 사용자 요청] "번호만 찍혀 있고 내용은 아래 목록에만" → 도안 위에 **실제 표시
    //    내용**을 바로 보여준다 + 글자 크기를 사람이 조절 + **이미지 크기와 연동**(도안을 늘리면
    //    글자도 같이 커진다). 절대 px 를 저장하면 이미지를 늘릴 때마다 다시 맞춰야 하므로,
    //    저장은 **배율**(`fontScale`, 기본 1)만 두고 실제 px 는 "이미지 폭 × 비율 × 배율"로
    //    매번 계산한다(이미지 폭 하나만 바뀌면 전부 같이 바뀌게).
    window._docLabelNoteFontScale = window._docLabelNoteFontScale || {};   // code -> number(배율) | undefined(기본 1)
    // 🏷 [2026-11-13, 사용자 요청] 인증마크(UL·CE·CB·FCC) 도장 — 표시(notes)와 같은 사이드카에
    //    `marks:[{key,x,y,wem}]` 로 같이 저장한다(**코드가 주인** — 도안·표시와 같은 이유, 실제
    //    물리 라벨도 그 자리에 마크가 찍혀 있다). ⚠️ "많지 않으니 UL CE CB FCC 정도만" — 종류를
    //    늘리고 싶으면 이 카탈로그 한 줄만 추가(코드에 if 분기 없음).
    //    ⚠️ [2026-11-13, 사용자 정정] CB 는 **별도 도형 마크가 없다**(CB Scheme 은 인증서 체계라
    //    UL·CE·FCC 처럼 찍는 로고가 없음) — `noImage:true` 로 두면 이미지 대신 글자 배지로 찍는다.
    var CERT_MARK_CATALOG = [
        { key: 'UL', label: 'UL' },
        { key: 'CE', label: 'CE' },
        { key: 'CB', label: 'CB', noImage: true },
        { key: 'FCC', label: 'FCC' }
    ];
    var _CERT_MARK_FOLDER = _LABEL_ART_FOLDER + '/_marks';   // 라벨도안/_marks/<KEY>.png — 코드(제품)가 아니라 마크 종류가 주인
    window._docLabelMarksCache = window._docLabelMarksCache || {};   // code -> [{key,x,y,wem}]
    window._docCertMarkIndex = window._docCertMarkIndex === undefined ? null : window._docCertMarkIndex; // null=아직 안 불러옴
    window._docCertMarkLoading = false;
    window._docCertMarkLoadFailedAt = 0;
    // ⚠️ 마크 그림은 **종류 하나당 파일 하나**(도안·패널 라이브러리와 같은 공용 자료) — 코드(제품)
    //    별이 아니라 **한 번만** 불러온다. 실패 후 재시도 쿨다운은 `_docLabelArtLoad` 와 같은 이유.
    window._docCertMarkLoad = async function () {
        if (window._docCertMarkLoading) return;
        window._docCertMarkLoading = true;
        var idx = {};
        try {
            var r = await fetch(BACKEND + '/doc/list?folder=' + encodeURIComponent(_CERT_MARK_FOLDER));
            var j = await r.json();
            if (j && j.ok) (j.files || []).forEach(function (f) { idx[f.name.replace(/\.[^.]+$/, '').toUpperCase()] = f.name; });
            window._docCertMarkIndex = idx;
        } catch (e) {
            window._docCertMarkIndex = null;
            window._docCertMarkLoadFailedAt = Date.now();
        }
        window._docCertMarkLoading = false;
        _docLabelRefresh();
    };
    // ⬜ [2026-11-13, 사용자 요청] "도안 위에 도표를 그려 넣고 싶은데" — 빈 네모 칸을 여러 개 올려
    //    가로/세로 칸 구분선처럼 쓸 수 있게 한다(표/마크와 같은 사이드카에 `boxes:[{x,y,wem,hem}]`).
    //    ⚠️ [2026-11-13, 사용자 요청] "기본적으로 박스는 모두 모서리 R 값 적용" — 둥근 모서리가 기본.
    window._docLabelBoxesCache = window._docLabelBoxesCache || {};   // code -> [{x,y,wem,hem}]
    window._docLabelBoxAdd = function (code) {
        var list = window._docLabelBoxesCache[code] = window._docLabelBoxesCache[code] || [];
        var n = list.length;
        list.push({ x: Math.min(0.85, 0.2 + (n % 3) * 0.12), y: Math.min(0.85, 0.2 + Math.floor(n / 3) * 0.12), wem: 10, hem: 4 });
        _docLabelRefresh();
        window._docLabelNotesSave(code);
    };
    window._docLabelBoxDel = async function (code, idx) {
        var list = window._docLabelBoxesCache[code] || [];
        if (!list[idx]) return;
        if (!confirm(_t('이 박스를 지웁니다.', 'Delete this box?'))) return;
        list.splice(idx, 1);
        _docLabelRefresh();
        await window._docLabelNotesSave(code);
    };
    window._docLabelBoxDragWire = function (wrap, img, code, idx) {
        var moved = false;
        var onMove = function (ev) {
            moved = true;
            var r = img.getBoundingClientRect();
            var x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
            var y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
            wrap.style.left = (x * 100) + '%'; wrap.style.top = (y * 100) + '%';
            var list = window._docLabelBoxesCache[code] || [];
            if (list[idx]) { list[idx].x = x; list[idx].y = y; }
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (moved) window._docLabelNotesSave(code);
        };
        wrap.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            moved = false;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    // 📏 박스는 마크(너비만)와 달리 **가로·세로 둘 다** 조절한다 — 표 칸 크기를 자유롭게 맞추려면 필수.
    window._docLabelBoxResizeWire = function (handle, wrap, code, idx) {
        var startX, startY, startW, startH, fontPx, moved = false;
        var onMove = function (ev) {
            moved = true;
            var w = Math.max(fontPx * 1.5, startW + (ev.clientX - startX));
            var h = Math.max(fontPx * 1, startH + (ev.clientY - startY));
            wrap.style.width = w + 'px'; wrap.style.height = h + 'px';
            var list = window._docLabelBoxesCache[code] || [];
            if (list[idx]) { list[idx].wem = Math.round((w / fontPx) * 100) / 100; list[idx].hem = Math.round((h / fontPx) * 100) / 100; }
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (moved) window._docLabelNotesSave(code);
        };
        handle.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            moved = false;
            startX = ev.clientX; startY = ev.clientY;
            var r = wrap.getBoundingClientRect();
            startW = r.width; startH = r.height;
            fontPx = parseFloat(getComputedStyle(wrap).fontSize) || 16;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    // ⬜ 박스 HTML — 테두리만 있는 빈 네모(표의 칸 구분선 용도), **모서리는 기본 둥글게**(사용자 요청).
    var _docLabelBoxMarkersHtml = function (boxes, draggable, code) {
        return (boxes || []).map(function (b, bi) {
            var wrapStyle = 'position:absolute; left:' + (b.x * 100) + '%; top:' + (b.y * 100) + '%;'
                + ' width:' + (b.wem || 10) + 'em; height:' + (b.hem || 4) + 'em;'
                + ' border:2px solid #1971c2; border-radius:0.3em; background:rgba(255,255,255,.12); z-index:1;'
                + (draggable ? ' pointer-events:auto; cursor:grab;' : ' pointer-events:none;');
            return '<span data-box-wrap data-box-idx="' + bi + '" style="' + wrapStyle + '">'
                + (draggable ? '<span data-box-resize title="' + _esc(_t('끌어서 크기 조절', 'drag to resize')) + '"'
                  + ' style="position:absolute; right:-0.5em; bottom:-0.5em; width:1em; height:1em; border-radius:0.25em;'
                  + ' background:#1971c2; border:2px solid #fff; box-shadow:0 0 0 1px #1971c2; cursor:nwse-resize; z-index:2;"></span>'
                  + '<a href="#" onclick="window._docLabelBoxDel(\'' + _esc(code) + '\',' + bi + ');return false;"'
                  + ' style="position:absolute; left:-0.6em; top:-0.6em; width:1em; height:1em; line-height:1em; text-align:center;'
                  + ' background:#b1432f; color:#fff; border-radius:50%; font-size:0.7em; font-weight:bold; text-decoration:none;'
                  + ' box-shadow:0 0 0 1px #fff;">✕</a>' : '')
                + '</span>';
        }).join('');
    };
    // 🖼️🔍 [2026-11-12 11차] 표시·자르기·크기조절은 전부 이 **별도 모달**에서만 한다 — 메인
    //    표 안에 큰 이미지를 직접 넣었더니 열(규격/코드/부착위치) 폭을 다 깨뜨렸다(사용자 실측
    //    스크린샷: "이미지는 커졌는데 도표는 조정되지 않음"). 표 쪽은 실제 문서(위 스크린샷)처럼
    //    **작은 썸네일 + 좁은 글자 칸**만 유지하고, 편집은 표 레이아웃과 완전히 분리된 오버레이에서.
    window._docLabelArtModal = window._docLabelArtModal || null;       // {formId, idx, code}
    var _docLabelRefresh = function () {
        window._docRender();
        if (window._docLabelArtModal) _docLabelArtModalRender();
    };
    window._docLabelNotesLoad = async function (code) {
        if (window._docLabelNotesCache[code] !== undefined) return;    // 이미 불렀거나 불러오는 중
        window._docLabelNotesCache[code] = null;
        var notes = [], size = null, thumbSize = null, fontScale = null, marks = [], boxes = [];
        try {
            var r = await fetch(BACKEND + '/doc/get?folder=' + encodeURIComponent(_LABEL_ART_FOLDER)
                + '&name=' + encodeURIComponent(code + '.notes.json'));
            if (r.ok) {
                var parsed = JSON.parse(await r.text());
                notes = (parsed && parsed.notes) || [];
                size = (parsed && parsed.size) || null;
                thumbSize = (parsed && parsed.thumbSize) || null;
                fontScale = (parsed && parsed.fontScale) || null;
                marks = (parsed && parsed.marks) || [];
                boxes = (parsed && parsed.boxes) || [];
            }
        } catch (e) { /* 아직 없으면(404) 빈 값 — 네트워크 문제도 여기선 그냥 빈 채로 둔다 */ }
        // ⚠️ [2026-11-12 11차, 실측] 이 fetch 가 느리게 도는 동안 사람이 먼저 표시를 찍거나
        //    크기를 끌었을 수 있다(모달을 열자마자 바로 손잡이를 끄는 등) — 그 새 값을 뒤늦게
        //    도착한(옛) 서버 응답으로 덮어쓰지 않는다. "아직 로딩 표식 그대로일 때만" 적용.
        if (window._docLabelNotesCache[code] === null) window._docLabelNotesCache[code] = notes;
        if (window._docLabelSizeCache[code] === undefined) window._docLabelSizeCache[code] = size;
        if (window._docLabelThumbSizeCache[code] === undefined) window._docLabelThumbSizeCache[code] = thumbSize;
        if (window._docLabelNoteFontScale[code] === undefined) window._docLabelNoteFontScale[code] = fontScale || 1;
        if (window._docLabelMarksCache[code] === undefined) window._docLabelMarksCache[code] = marks;
        if (window._docLabelBoxesCache[code] === undefined) window._docLabelBoxesCache[code] = boxes;
        _docLabelRefresh();
    };
    window._docLabelNotesSave = async function (code) {
        var notes = window._docLabelNotesCache[code] || [];
        var size = window._docLabelSizeCache[code] || null;
        var thumbSize = window._docLabelThumbSizeCache[code] || null;
        var fontScale = window._docLabelNoteFontScale[code] || 1;
        var marks = window._docLabelMarksCache[code] || [];
        var boxes = window._docLabelBoxesCache[code] || [];
        var blob = new Blob([JSON.stringify({ notes: notes, size: size, thumbSize: thumbSize, fontScale: fontScale, marks: marks, boxes: boxes })], { type: 'application/json' });
        var res = await window._dgUploadBlob(_LABEL_ART_FOLDER, code + '.notes.json', blob, { forceOverwrite: true });
        if (!res.ok) _toast('⚠️ ' + _t('표시를 저장하지 못했습니다: ', 'Could not save the note: ') + (res.error || ''), 'error');
        return res.ok;
    };
    // 🏷 [2026-11-13, 사용자 요청] 인증마크 추가 — 기본 자리는 오른쪽 위부터 3개씩 줄줄이(실제 라벨도
    //    보통 그 자리에 몰려 찍힌다), 정확한 자리는 드래그로. `wem` 기본 4(대략 글자 4개 폭).
    window._docLabelMarkAdd = function (code, key) {
        if (window._docCertMarkIndex === null && !window._docCertMarkLoading) window._docCertMarkLoad();
        var list = window._docLabelMarksCache[code] = window._docLabelMarksCache[code] || [];
        var n = list.length;
        list.push({ key: key, x: Math.min(0.92, 0.74 + (n % 3) * 0.09), y: Math.min(0.9, 0.08 + Math.floor(n / 3) * 0.13), wem: 4 });
        _docLabelRefresh();
        window._docLabelNotesSave(code);
    };
    window._docLabelMarkDel = async function (code, idx) {
        var list = window._docLabelMarksCache[code] || [];
        var m = list[idx];
        if (!m) return;
        var cat = CERT_MARK_CATALOG.filter(function (c) { return c.key === m.key; })[0];
        if (!confirm(_t('이 인증마크를 지웁니다: ' + ((cat && cat.label) || m.key), 'Delete this certification mark?'))) return;
        list.splice(idx, 1);
        _docLabelRefresh();
        await window._docLabelNotesSave(code);
    };
    // 🖱📏 [2026-11-13] 인증마크 끌어서 옮기기·크기 조절 — 표시(notes)의 드래그/너비조절과 같은 짝.
    window._docLabelMarkDragWire = function (wrap, img, code, idx) {
        var moved = false;
        var onMove = function (ev) {
            moved = true;
            var r = img.getBoundingClientRect();
            var x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
            var y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
            wrap.style.left = (x * 100) + '%'; wrap.style.top = (y * 100) + '%';
            var list = window._docLabelMarksCache[code] || [];
            if (list[idx]) { list[idx].x = x; list[idx].y = y; }
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (moved) window._docLabelNotesSave(code);
        };
        wrap.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            moved = false;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    window._docLabelMarkWidthWire = function (handle, wrap, code, idx) {
        var startX, startW, fontPx, moved = false;
        var onMove = function (ev) {
            moved = true;
            var w = Math.max(fontPx * 1.5, startW + (ev.clientX - startX));
            wrap.style.width = w + 'px';
            var list = window._docLabelMarksCache[code] || [];
            if (list[idx]) list[idx].wem = Math.round((w / fontPx) * 100) / 100;
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (moved) window._docLabelNotesSave(code);
        };
        handle.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            moved = false;
            startX = ev.clientX;
            var r = wrap.getBoundingClientRect();
            startW = r.width;
            fontPx = parseFloat(getComputedStyle(wrap).fontSize) || 16;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    // 🏷 [2026-11-13] 마커 HTML — 표시(notes)와 같은 틀, 그림은 이미지 하나(UL·CE·FCC)거나
    //    글자 배지 하나(CB, `noImage`)뿐이라 번호 원이 없다. `draggable` 일 때만 손잡이가 붙는다.
    var _docLabelMarkMarkersHtml = function (marks, draggable, code) {
        return (marks || []).map(function (m, mi) {
            var cat = CERT_MARK_CATALOG.filter(function (c) { return c.key === m.key; })[0] || { key: m.key, label: m.key };
            var wrapStyle = 'position:absolute; left:' + (m.x * 100) + '%; top:' + (m.y * 100) + '%; transform:translate(-50%,-50%);'
                + ' z-index:1;' + (draggable ? ' pointer-events:auto; cursor:grab;' : ' pointer-events:none;');
            var inner;
            if (cat.noImage) {
                inner = '<span style="display:inline-block; border:0.12em solid #333; border-radius:0.2em; padding:0.1em 0.4em;'
                    + ' font-weight:bold; background:#fff; color:#222; font-size:1.3em; white-space:nowrap;">' + _esc(cat.label) + '</span>';
            } else {
                wrapStyle += ' width:' + (m.wem || 4) + 'em;';
                var markFile = window._docCertMarkIndex && window._docCertMarkIndex[cat.key];
                inner = markFile
                    ? ('<img data-mark-img src="' + _esc(BACKEND + '/doc/get?folder=' + encodeURIComponent(_CERT_MARK_FOLDER)
                        + '&name=' + encodeURIComponent(markFile)) + '" style="display:block; width:100%; height:auto;"'
                        + ' draggable="false" ondragstart="return false;">')
                    : ('<span style="display:flex; align-items:center; justify-content:center; width:100%; height:2.2em;'
                        + ' border:1px dashed #cfe3e5; border-radius:0.2em; background:#f8fbfb; color:#adb5bd; font-size:0.65em;'
                        + ' font-weight:bold;">' + _esc(cat.label) + '</span>');
            }
            return '<span data-mark-wrap data-mark-idx="' + mi + '" title="' + _esc(cat.label) + '" style="' + wrapStyle + '">'
                + inner
                + ((draggable && !cat.noImage) ? '<span data-mark-wresize title="' + _esc(_t('끌어서 크기 조절', 'drag to resize')) + '"'
                  + ' style="position:absolute; right:-0.5em; top:0; bottom:0; width:1em; cursor:ew-resize;'
                  + ' display:flex; align-items:center; justify-content:center; z-index:2;">'
                  + '<span style="width:2px; height:60%; background:#333; border-radius:1px;"></span></span>' : '')
                + (draggable ? '<a href="#" onclick="window._docLabelMarkDel(\'' + _esc(code) + '\',' + mi + ');return false;"'
                  + ' style="position:absolute; left:-0.6em; top:-0.6em; width:1em; height:1em; line-height:1em; text-align:center;'
                  + ' background:#b1432f; color:#fff; border-radius:50%; font-size:0.7em; font-weight:bold; text-decoration:none;'
                  + ' box-shadow:0 0 0 1px #fff;">✕</a>' : '')
                + '</span>';
        }).join('');
    };
    window._docLabelNoteArm = function (code) { window._docLabelNotePlacing = code; _docLabelRefresh(); };
    window._docLabelNoteDisarm = function () { window._docLabelNotePlacing = null; _docLabelRefresh(); };
    window._docLabelImgClick = async function (ev, code) {
        if (window._docLabelNotePlacing !== code) return;   // 그냥 보는 중이면 클릭은 아무 일도 안 한다
        var rect = ev.target.getBoundingClientRect();
        var x = (ev.clientX - rect.left) / rect.width;
        var y = (ev.clientY - rect.top) / rect.height;
        window._docLabelNotePlacing = null;                 // 한 번 찍으면 바로 해제 — 연속으로 안 찍힌다
        var text = prompt(_t('이 위치에 표시할 내용을 입력하세요(예: REV 정보는 영업 P/O 정보와 반드시 일치해야 함)',
                              'Enter the note text for this spot:'));
        if (text == null || !text.trim()) { _docLabelRefresh(); return; }
        window._docLabelNotesCache[code] = window._docLabelNotesCache[code] || [];
        window._docLabelNotesCache[code].push({ x: x, y: y, text: text.trim() });
        _docLabelRefresh();
        await window._docLabelNotesSave(code);
    };
    window._docLabelNoteDel = async function (code, i) {
        var list = window._docLabelNotesCache[code] || [];
        if (!list[i]) return;
        if (!confirm(_t('이 표시를 지웁니다:\n\n' + list[i].text, 'Delete this note?'))) return;
        list.splice(i, 1);
        _docLabelRefresh();
        await window._docLabelNotesSave(code);
    };
    // ✏️ [2026-11-13, 사용자 요청] 목록 칸에서 바로 글자를 고친다(지우고 다시 찍을 필요 없게) —
    //    onchange(블러 시)만 저장한다, 입력마다 다시 그리면 타이핑 중 포커스가 날아간다.
    window._docLabelNoteTextEdit = async function (code, i, val) {
        var list = window._docLabelNotesCache[code] || [];
        if (!list[i]) return;
        list[i].text = String(val || '').trim();
        await window._docLabelNotesSave(code);
        _docLabelRefresh();
    };
    // 📋 [2026-11-13, 사용자 요청] "도표 형태로도 작성 가능했으면" — 도안을 클릭하지 않고 글만 입력해
    //    표처럼 줄줄이 추가한다. 자리는 기본값(왼쪽 위부터 아래로 쌓기)이고, 정확한 위치는 추가한
    //    뒤 끌어서(드래그) 옮기면 된다 — 빈 라벨지에 Part No·Q'ty 같은 여러 항목을 한 번에 채울 때 유용.
    window._docLabelNoteQuickAdd = async function (code) {
        var inp = document.getElementById('doclabelart-newnote');
        var text = inp && inp.value && inp.value.trim();
        if (!text) return;
        var list = window._docLabelNotesCache[code] = window._docLabelNotesCache[code] || [];
        var y = Math.min(0.92, 0.08 + list.length * 0.09);
        list.push({ x: 0.1, y: y, text: text });
        _docLabelRefresh();
        await window._docLabelNotesSave(code);
    };
    // 🖱 [2026-11-13, 사용자 요청] "개별 글자 위치 조정 가능" — 마커(원+글자상자)를 끌어서 옮긴다.
    //    모달에서만(표 썸네일은 보기 전용) `idle`(표시추가·자르기 중이 아닐 때)에만 건다 —
    //    그래야 "표시 추가" 클릭 대기 중에 마커를 끌다가 새 표시가 같이 찍히는 혼선이 없다.
    window._docLabelNoteDragWire = function (wrap, img, code, idx) {
        var moved = false;
        var onMove = function (ev) {
            moved = true;
            var r = img.getBoundingClientRect();
            var x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
            var y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
            wrap.style.left = (x * 100) + '%'; wrap.style.top = (y * 100) + '%';
            var list = window._docLabelNotesCache[code] || [];
            if (list[idx]) { list[idx].x = x; list[idx].y = y; }
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (moved) window._docLabelNotesSave(code);
        };
        wrap.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            moved = false;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    // 📏 [2026-11-13, 사용자 요청 "TXT 박스 가로 길이를 자유롭게 조절"] 글자상자 오른쪽 손잡이를 끌면
    //    너비가 바뀐다. **em 단위로 저장**(`n.wem`) — px 로 저장하면 글자 크기(배율)를 나중에 바꿀 때
    //    상자 비율이 틀어진다. `ev.stopPropagation()` 필수 — 안 하면 마커 끌기(위치 이동)가 같이 걸린다.
    window._docLabelNoteWidthWire = function (handle, widthBox, code, idx) {
        var startX, startW, fontPx, moved = false;
        var onMove = function (ev) {
            moved = true;
            var w = Math.max(fontPx * 3, startW + (ev.clientX - startX));
            widthBox.style.width = w + 'px'; widthBox.style.maxWidth = 'none';
            var list = window._docLabelNotesCache[code] || [];
            if (list[idx]) list[idx].wem = Math.round((w / fontPx) * 100) / 100;
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (moved) window._docLabelNotesSave(code);
        };
        handle.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            moved = false;
            startX = ev.clientX;
            var r = widthBox.getBoundingClientRect();
            startW = r.width;
            fontPx = parseFloat(getComputedStyle(widthBox).fontSize) || 16;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    // 🔤 [2026-11-13, 사용자 요청] 마커(원 번호 + **실제 표시내용**) HTML — 모달·표 썸네일이 같은
    //    모양을 쓰도록 한 곳에 모은다(두 벌로 두면 한쪽만 고쳐진다). ⚠️ 글자상자엔 **테두리를 안 둔다**
    //    (사용자 요청 — 배경·그림자만으로 구분). `draggable` 이면 끌 수 있게 pointer-events 를 연다.
    // 📏 [2026-11-13, 사용자 요청 "TXT 박스 가로 길이를 자유롭게 조절"] 글자상자 너비는 고정 14em 이
    //    기본값이고, 오른쪽 손잡이로 끌면 `n.wem`(글자크기 em 단위 — px 로 저장하면 글자 크기를
    //    바꿀 때마다 상자 크기가 어긋난다)에 저장돼 다음부터 그 너비로 열린다.
    var _docLabelNoteMarkersHtml = function (notes, draggable) {
        return (notes || []).map(function (n, ni) {
            var wStyle = (n.wem ? (' width:' + n.wem + 'em; max-width:none;') : ' max-width:14em;');
            // ⚠️ [2026-11-13, 사용자 요청] 번호 원을 글자상자 **오른쪽**으로 — flex 자식 순서만
            //    바꾼다(위치 기준점은 전체 묶음 가운데라 순서를 바꿔도 끌기 좌표 계산은 그대로).
            return '<span data-note-wrap data-note-idx="' + ni + '" title="' + _esc(n.text) + '" style="position:absolute;'
                + ' left:' + (n.x * 100) + '%; top:' + (n.y * 100) + '%; transform:translate(-50%,-50%);'
                + ' display:flex; align-items:center; gap:0.3em; z-index:1;'
                + (draggable ? ' pointer-events:auto; cursor:grab;' : ' pointer-events:none;') + '">'
                + '<span data-note-widthbox style="position:relative; display:inline-block;' + wStyle + '">'
                // ⚠️⚠️ [2026-11-13, 사용자 신고 "줄바꿈 이미지에는 반영 안 됨"] `white-space:normal` 은
                //    HTML 이 원래 그런 것처럼 줄바꿈 문자(`\n`)를 **공백 하나로 뭉갠다** — 입력칸엔
                //    여러 줄로 보여도 도안 위 글자상자에선 한 줄로 이어 붙었다. `pre-wrap` 으로 바꾸면
                //    사람이 친 줄바꿈은 그대로 살리면서 칸 폭을 넘는 긴 줄만 자동으로 더 접는다.
                + '<span style="display:block; background:rgba(255,255,255,.94); color:#b1432f; font-weight:bold;'
                + ' padding:0.15em 0.45em; border-radius:0.3em; box-shadow:0 1px 3px rgba(0,0,0,.18);'
                + ' white-space:pre-wrap; word-break:keep-all; overflow-wrap:break-word; line-height:1.25;">'
                + _esc(n.text) + '</span>'
                + (draggable ? '<span data-note-wresize title="' + _esc(_t('끌어서 너비 조절', 'drag to resize width')) + '"'
                  + ' style="position:absolute; right:-0.5em; top:0; bottom:0; width:1em; cursor:ew-resize;'
                  + ' display:flex; align-items:center; justify-content:center; z-index:2; pointer-events:auto;">'
                  + '<span style="width:2px; height:60%; background:#e03131; border-radius:1px;"></span></span>' : '')
                + '</span>'
                + '<span style="width:1.8em; height:1.8em; min-width:1.8em; border-radius:50%; background:#e03131;'
                + ' color:#fff; font-weight:bold; display:flex; align-items:center; justify-content:center;'
                + ' box-shadow:0 0 0 2px #fff; flex-shrink:0;">' + (ni + 1) + '</span>'
                + '</span>';
        }).join('');
    };
    // 🔤 [2026-11-13, 사용자 요청] 표시 글자 크기 — 사람이 조절(＋／－) + 이미지 크기와 연동.
    //    배율만 저장하고(`_docLabelNoteFontScale`) 실제 px는 렌더마다 "이미지 폭 × 비율 × 배율"
    //    로 계산 — `_docLabelNotesApplyFont`(아래) 한 곳에서만 계산해 모달·드래그 중 호출이 같은 값을 쓴다.
    window._docLabelNoteFontAdjust = function (code, dir) {
        var cur = window._docLabelNoteFontScale[code] || 1;
        var next = Math.max(0.5, Math.min(3, Math.round((cur + dir * 0.15) * 100) / 100));
        window._docLabelNoteFontScale[code] = next;
        _docLabelRefresh();
        window._docLabelNotesSave(code);
    };
    // px = 이미지 표시폭 × 3.2% × 배율 — 3.2%는 기본 배율(1)에서 보기 좋은 값으로 고른 상수.
    window._docLabelNoteFontPx = function (imgWidthPx, code) {
        var scale = (window._docLabelNoteFontScale && window._docLabelNoteFontScale[code]) || 1;
        return Math.max(9, Math.round((imgWidthPx || 0) * 0.032 * scale));
    };
    // wrap(표시 마커들을 담은 상위 엘리먼트)의 각 `[data-note-wrap]`에 계산된 px를 적는다 —
    // 하나의 font-size 로 원 번호·글자 상자가 **같은 em 기준**이라 함께 커진다(마커 HTML 쪽 em 참고).
    window._docLabelNotesApplyFont = function (bodyEl, img, code, widthPxOverride) {
        if (!bodyEl || !img) return;
        var w = widthPxOverride || img.getBoundingClientRect().width;
        if (!w) return;
        var px = window._docLabelNoteFontPx(w, code);
        [].slice.call(bodyEl.querySelectorAll('[data-note-wrap]')).forEach(function (el) { el.style.fontSize = px + 'px'; });
    };
    // 🔧 [2026-11-12 11차, 사용자 요청] 크기 조정 — 모달 안 이미지 우하단 손잡이를 끌면 크기를
    //    바꾼다. 표시(notes)와 **같은 사이드카**(`<코드>.notes.json`)에 `size:{w,h}` 로 같이
    //    저장한다(공용 자료라 다음에 열 때도, 다른 프로젝트에서도 그 크기 그대로 보인다).
    // 📐 [2026-11-13, 사용자 요청] "비율 고정" 체크(`_docLabelAspectLock`, 전역 — 모달·표 썸네일이
    //    같이 쓴다) — 켜져 있으면 가로로 끈 만큼만 보고 세로는 **끌기 시작 시점의 가로세로 비율**
    //    로 따라간다(세로로도 끌 수는 있지만 무시 — 가로 하나만 보면 된다). 꺼져 있으면 예전처럼
    //    가로·세로를 각각 끈 대로.
    // ⚠️ `onResize(wPx)` 는 끄는 **동안** 실시간으로 불린다(선택) — 표시 글자 크기가 이미지 폭을
    //    따라가는 걸 눈으로 바로 보려면, 다 끌고 놓을 때까지 기다리지 말고 끄는 중에도 갱신해야 한다.
    window._docLabelSizeWire = function (handle, img, code, onResize) {
        var startX, startY, startW, startH, ratio, moved = false;
        var onMove = function (ev) {
            moved = true;
            var w = Math.max(80, startW + (ev.clientX - startX));
            var h = window._docLabelAspectLock ? Math.max(60, Math.round(w / ratio))
                                                : Math.max(60, startH + (ev.clientY - startY));
            img.style.width = w + 'px'; img.style.height = h + 'px';
            img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
            window._docLabelSizeCache[code] = { w: Math.round(w), h: Math.round(h) };
            if (onResize) onResize(w);
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (moved) window._docLabelNotesSave(code);
        };
        handle.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            moved = false;
            startX = ev.clientX; startY = ev.clientY;
            var r = img.getBoundingClientRect();
            startW = r.width; startH = r.height;
            ratio = startW / startH || 1;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    window._docLabelSizeReset = async function (code) {
        window._docLabelSizeCache[code] = null;
        _docLabelRefresh();
        await window._docLabelNotesSave(code);
    };
    // 📏 [2026-11-13] 표 썸네일용 — 같은 방식이지만 **가로는 열 폭을 못 넘게 묶는다**(430px, 11차에
    //    도안을 표 안에 직접 넣었다가 열이 깨졌던 사고의 재발 방지 — 세로는 행이 늘어나도 그만이라 안 묶는다).
    window._docLabelThumbSizeWire = function (handle, img, code, onResize) {
        var startX, startY, startW, startH, ratio, moved = false;
        var onMove = function (ev) {
            moved = true;
            var w = Math.max(40, Math.min(430, startW + (ev.clientX - startX)));
            var h = window._docLabelAspectLock ? Math.max(30, Math.round(w / ratio))
                                                : Math.max(30, startH + (ev.clientY - startY));
            img.style.width = w + 'px'; img.style.height = h + 'px';
            img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
            window._docLabelThumbSizeCache[code] = { w: Math.round(w), h: Math.round(h) };
            if (onResize) onResize(w);
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (moved) window._docLabelNotesSave(code);
        };
        handle.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            moved = false;
            startX = ev.clientX; startY = ev.clientY;
            var r = img.getBoundingClientRect();
            startW = r.width; startH = r.height;
            ratio = startW / startH || 1;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    window._docLabelThumbSizeReset = async function (code) {
        window._docLabelThumbSizeCache[code] = null;
        _docLabelRefresh();
        await window._docLabelNotesSave(code);
    };
    // ✂️ [2026-11-12 9차, 사용자 요청] 도안 배경 잘라내기 — 드래그로 사각형을 고르면 그 안쪽만
    //    남긴다(캔버스로 잘라서 **같은 공용 파일을 덮어쓴다** — 다른 프로젝트도 보는 자료라
    //    "이 잘린 모습이 맞다"는 정정은 전부에게 적용돼야 한다). ⚠️ 자른 범위 밖에 있던 표시
    //    (📍)는 더 이상 그 도안 위 어디도 가리키지 못해 지워지고, 안에 있던 표시는 새 비율
    //    좌표로 다시 맞춘다.
    window._docLabelCropState = window._docLabelCropState || null;   // {code, sel:{x0,y0,x1,y1}|null}
    window._docLabelCropArm = function (code) {
        window._docLabelNotePlacing = null;   // 표시 찍기와 동시에 켜지면 혼란스럽다 — 하나만
        window._docLabelCropState = { code: code, sel: null };
        _docLabelRefresh();
    };
    window._docLabelCropCancel = function () {
        window._docLabelCropState = null;
        _docLabelRefresh();
    };
    // 렌더 직후(`_docRender` 끝) 한 번만 불린다 — 매번 `innerHTML` 을 통째로 새로 만들어서
    // 옛 리스너는 엘리먼트와 함께 이미 사라졌다(따로 떼어낼 필요가 없다).
    window._docLabelCropWire = function (img) {
        var state = window._docLabelCropState;
        if (!state) return;
        var wrap = img.parentElement;
        var box = null, start = null;
        var toFrac = function (ev) {
            var r = img.getBoundingClientRect();
            return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
                     y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
        };
        var onMove = function (ev) {
            if (!start) return;
            var p = toFrac(ev);
            var x0 = Math.min(start.x, p.x), x1 = Math.max(start.x, p.x);
            var y0 = Math.min(start.y, p.y), y1 = Math.max(start.y, p.y);
            if (!box) {
                box = document.createElement('div');
                box.className = 'doc-noprint';
                box.style.cssText = 'position:absolute; border:2px dashed #1971c2; border-radius:3px; background:rgba(25,113,194,.15); pointer-events:none;';
                wrap.appendChild(box);
            }
            box.style.left = (x0 * 100) + '%'; box.style.top = (y0 * 100) + '%';
            box.style.width = ((x1 - x0) * 100) + '%'; box.style.height = ((y1 - y0) * 100) + '%';
            state.sel = { x0: x0, y0: y0, x1: x1, y1: y1 };
        };
        var onUp = function () {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            var hadSel = start && box;
            start = null;
            if (hadSel) _docLabelRefresh();   // "적용" 버튼을 보이게 — 드래그 중엔 다시 안 그린다(끊기지 않게)
        };
        img.onmousedown = function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            start = toFrac(ev);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    };
    // ⚠️⚠️ [2026-11-12 11차, 사용자 신고 "자르기 적용 눌렀는데 아무 반응 없음"] 이전엔 try/catch
    //    가 없어서 중간 어느 단계든(fetch·이미지 로딩·canvas·업로드) 예외가 나면 **토스트 한 줄도
    //    없이 조용히 멈췄다** — 그게 "아무 반응 없음"의 정체였다. 이제 뭐가 나든 토스트로 드러난다.
    window._docLabelCropApply = async function () {
        var state = window._docLabelCropState;
        if (!state || !state.sel) return;
        var code = state.code, sel = state.sel;
        if ((sel.x1 - sel.x0) < 0.02 || (sel.y1 - sel.y0) < 0.02) {
            _toast('⚠️ ' + _t('선택한 영역이 너무 작습니다 — 다시 드래그해 주세요.', 'Selection too small — drag again.'), 'error');
            return;
        }
        var artFile = window._docLabelArtIndex && window._docLabelArtIndex[code];
        if (!artFile) { _toast('⚠️ ' + _t('도안을 찾을 수 없습니다.', 'Artwork not found.'), 'error'); return; }
        _toast('⏳ ' + _t('자르는 중…', 'Cropping…'), 'info');
        try {
            var url = BACKEND + '/doc/get?folder=' + encodeURIComponent(_LABEL_ART_FOLDER) + '&name=' + encodeURIComponent(artFile)
                + '&_cb=' + Date.now();   // ⚠️ 캔버스로 읽으려면 브라우저 캐시의 옛 그림이 아니라 지금 파일이어야 한다
            var img = new Image();
            // ⚠️⚠️ [실측 버그] `crossOrigin` 을 `src` **전에** 안 주면 — 백엔드가 CORS 헤더를 이미
            //    돌려주고 있어도(`kortek_backend.py` 전역 CORS) — 브라우저가 이 이미지를 "오염된"
            //    것으로 표시해 `canvas.toBlob()` 이 SecurityError 로 죽는다(앱과 백엔드가 다른 포트,
            //    즉 다른 출처라서). 속성을 먼저 선언해야 CORS 모드로 다시 받아온다.
            img.crossOrigin = 'anonymous';
            var loaded = await new Promise(function (resolve) {
                img.onload = function () { resolve(true); };
                img.onerror = function () { resolve(false); };
                img.src = url;
            });
            if (!loaded) { _toast('⚠️ ' + _t('이미지를 불러오지 못했습니다.', 'Could not load the image.'), 'error'); return; }
            var sx = Math.round(sel.x0 * img.naturalWidth), sy = Math.round(sel.y0 * img.naturalHeight);
            var sw = Math.max(1, Math.round((sel.x1 - sel.x0) * img.naturalWidth));
            var sh = Math.max(1, Math.round((sel.y1 - sel.y0) * img.naturalHeight));
            var canvas = document.createElement('canvas');
            canvas.width = sw; canvas.height = sh;
            canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
            if (!blob) { _toast('⚠️ ' + _t('자르기에 실패했습니다.', 'Crop failed.'), 'error'); return; }
            if (!window._dgUploadBlob) { _toast('⚠️ ' + _t('업로드 기능을 불러오지 못했습니다.', 'Upload unavailable.'), 'error'); return; }
            // ⚠️ 항상 .png 로 저장한다(canvas.toBlob 기본) — 원본 확장자가 .jpeg 였으면 그 옛 파일은
            //    NAS 에 그대로 남지만(공용 폴더는 안 지운다) 인덱스가 새 .png 파일을 가리켜 화면엔 안 보인다.
            var fname = code + '.png';
            var res = await window._dgUploadBlob(_LABEL_ART_FOLDER, fname, blob, { forceOverwrite: true });
            if (!res.ok) { _toast('⚠️ ' + _t('저장하지 못했습니다: ', 'Could not save: ') + (res.error || ''), 'error'); return; }
            window._docLabelArtIndex[code] = fname;
            _docLabelBumpVer(code);
            // 📍 잘린 범위 밖의 표시는 더 이상 가리킬 자리가 없어 지운다 — 안쪽 것은 새 비율로 다시 맞춘다
            var notes = window._docLabelNotesCache[code] || [];
            var kept = [], dropped = 0;
            notes.forEach(function (n) {
                if (n.x >= sel.x0 && n.x <= sel.x1 && n.y >= sel.y0 && n.y <= sel.y1) {
                    kept.push({ x: (n.x - sel.x0) / (sel.x1 - sel.x0), y: (n.y - sel.y0) / (sel.y1 - sel.y0), text: n.text });
                } else dropped++;
            });
            window._docLabelNotesCache[code] = kept;
            window._docLabelSizeCache[code] = null;   // 잘렸으니 가로세로 비율이 달라진다 — 기본 크기로
            await window._docLabelNotesSave(code);
            window._docLabelCropState = null;
            _toast('✅ ' + _t('잘라서 저장했습니다' + (dropped ? ' (표시 ' + dropped + '개는 범위 밖이라 지워졌습니다)' : '.'),
                              'Cropped and saved.'), 'success');
            _docLabelRefresh();
        } catch (e) {
            _toast('⚠️ ' + _t('자르기 중 오류가 났습니다: ', 'Crop failed: ') + (e && e.message || e), 'error');
        }
    };
    // ⟲⟳ [2026-11-13, 사용자 요청] 회전 — 90도씩, 자르기와 같은 방식으로 **같은 공용 파일을
    //    덮어쓴다**(캔버스에 돌려 그려 저장 — 화면에만 CSS 로 돌리면 표시(notes)·크기 손잡이의
    //    좌표 계산이 전부 따로 틀어진다). 표시는 같은 90도로 좌표를 맞추고, 가로세로가
    //    바뀌었으니 크기는 기본값으로 되돌린다(자르기와 같은 이유).
    window._docLabelRotate = async function (code, dir) {
        var artFile = window._docLabelArtIndex && window._docLabelArtIndex[code];
        if (!artFile) { _toast('⚠️ ' + _t('도안을 찾을 수 없습니다.', 'Artwork not found.'), 'error'); return; }
        _toast('⏳ ' + _t('회전하는 중…', 'Rotating…'), 'info');
        try {
            var url = BACKEND + '/doc/get?folder=' + encodeURIComponent(_LABEL_ART_FOLDER) + '&name=' + encodeURIComponent(artFile)
                + '&_cb=' + Date.now();
            var img = new Image();
            img.crossOrigin = 'anonymous';
            var loaded = await new Promise(function (resolve) {
                img.onload = function () { resolve(true); };
                img.onerror = function () { resolve(false); };
                img.src = url;
            });
            if (!loaded) { _toast('⚠️ ' + _t('이미지를 불러오지 못했습니다.', 'Could not load the image.'), 'error'); return; }
            var w = img.naturalWidth, h = img.naturalHeight;
            var canvas = document.createElement('canvas');
            canvas.width = h; canvas.height = w;
            var ctx = canvas.getContext('2d');
            if (dir > 0) {                 // ⟳ 시계방향 90도
                ctx.translate(h, 0);
                ctx.rotate(Math.PI / 2);
            } else {                       // ⟲ 반시계방향 90도
                ctx.translate(0, w);
                ctx.rotate(-Math.PI / 2);
            }
            ctx.drawImage(img, 0, 0);
            var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
            if (!blob) { _toast('⚠️ ' + _t('회전에 실패했습니다.', 'Rotation failed.'), 'error'); return; }
            if (!window._dgUploadBlob) { _toast('⚠️ ' + _t('업로드 기능을 불러오지 못했습니다.', 'Upload unavailable.'), 'error'); return; }
            var fname = code + '.png';
            var res = await window._dgUploadBlob(_LABEL_ART_FOLDER, fname, blob, { forceOverwrite: true });
            if (!res.ok) { _toast('⚠️ ' + _t('저장하지 못했습니다: ', 'Could not save: ') + (res.error || ''), 'error'); return; }
            window._docLabelArtIndex[code] = fname;
            _docLabelBumpVer(code);
            var notes = window._docLabelNotesCache[code] || [];
            var rotated = notes.map(function (n) {
                return dir > 0
                    ? { x: 1 - n.y, y: n.x, text: n.text }      // 시계방향: (x,y) → (1-y, x)
                    : { x: n.y, y: 1 - n.x, text: n.text };     // 반시계방향: (x,y) → (y, 1-x)
            });
            window._docLabelNotesCache[code] = rotated;
            window._docLabelSizeCache[code] = null;   // 가로세로가 바뀌었으니 기본 크기로
            await window._docLabelNotesSave(code);
            _toast('✅ ' + _t('회전해서 저장했습니다.', 'Rotated and saved.'), 'success');
            _docLabelRefresh();
        } catch (e) {
            _toast('⚠️ ' + _t('회전 중 오류가 났습니다: ', 'Rotation failed: ') + (e && e.message || e), 'error');
        }
    };
    // 📤 [2026-11-13, 사용자 요청 "PPT 같은 연결프로그램으로 라벨 도안을 완성하고 이미지를 도표로
    //    옮기는 방법도 가능할까?"] — 가능하다: SAP 검색을 안 거치고 **로컬 파일을 바로** 공용
    //    도안(`라벨도안/<코드>.<ext>`)으로 올린다. PPT·Illustrator 등에서 완성한 뒤 PNG/JPG 로
    //    내보내 여기로 올리면 끝 — 크기조절·자르기·회전·표시 추가는 그 뒤 모달에서 그대로 쓴다.
    window._docLabelArtUploadPick = function (code) {
        if (!code) { _toast('⚠️ ' + _t('코드를 먼저 적으세요.', 'Enter the code first.'), 'error'); return; }
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = function () { if (inp.files && inp.files[0]) window._docLabelArtUploadApply(code, inp.files[0]); };
        inp.click();
    };
    window._docLabelArtUploadApply = async function (code, file) {
        if (!window._dgUploadBlob) { _toast('⚠️ ' + _t('업로드 기능을 불러오지 못했습니다.', 'Upload unavailable.'), 'error'); return; }
        var ext = (String(file.name || '').split('.').pop() || 'png').toLowerCase();
        if (!/^(png|jpg|jpeg|gif|bmp|webp)$/.test(ext)) ext = 'png';
        var fname = code + '.' + ext;
        // ⚠️ 공용 자료다 — 코드 하나당 파일 하나(덮어쓰기 확인 없이, 다른 도안 선택 함수들과 같은 규칙)
        _toast('⏳ ' + _t('올리는 중…', 'Uploading…'), 'info');
        var res = await window._dgUploadBlob(_LABEL_ART_FOLDER, fname, file, { forceOverwrite: true });
        if (!res.ok) { _toast('⚠️ ' + _t('저장하지 못했습니다: ', 'Could not save: ') + (res.error || ''), 'error'); return; }
        window._docLabelArtIndex = window._docLabelArtIndex || {};
        window._docLabelArtIndex[code] = fname;
        _docLabelBumpVer(code);
        // 완전히 새 디자인일 수 있다 — 자르기·회전과 같은 이유로 가로세로 비율이 달라졌을 수 있으니
        // 크기는 기본값으로(표시 위치는 그대로 둔다 — 같은 도안을 다시 올린 경우일 수도 있어서).
        window._docLabelSizeCache[code] = null;
        window._docLabelThumbSizeCache[code] = null;
        await window._docLabelNotesSave(code);
        _toast('✅ ' + _t('공용 라벨 도안(' + _LABEL_ART_FOLDER + ')에 저장했습니다: ' + fname,
                          'Saved to the shared label artwork library.'), 'success');
        _docLabelRefresh();
    };
    // 🖼️🔍 [2026-11-12 11차, 사용자 요청 "문서 기본 양식 반영"] 표시·자르기·크기조절 전용 모달 —
    //    실제 문서(스크린샷)는 도안 칸이 작고 규격/코드/부착위치가 좁은 글자 칸으로 옆에 나란하다.
    //    그 모양을 지키려고 메인 표의 썸네일은 항상 **고정된 작은 크기**로 두고, 편집은 표와
    //    완전히 분리된 이 오버레이에서만 한다(다른 문서 모달과 같은 `_makeDraggable` 틀).
    window._docLabelArtModalOpen = function (formId, idx) {
        var it = (_docData(formId).labelItems || [])[idx];
        var code = String((it && it.code) || '').trim();
        var artFile = code && window._docLabelArtIndex && window._docLabelArtIndex[code];
        if (!artFile) {
            _toast('⚠️ ' + _t('도안이 없습니다 — 먼저 🔎 로 찾아서 저장하세요.', 'No artwork yet — find and save one first.'), 'error');
            return;
        }
        window._docLabelArtModal = { formId: formId, idx: idx, code: code };
        if (window._docLabelNotesCache[code] === undefined) window._docLabelNotesLoad(code);
        _docLabelArtModalRender();
    };
    window._docLabelArtModalClose = function () {
        window._docLabelArtModal = null;
        window._docLabelNotePlacing = null;
        window._docLabelCropState = null;
        var ov = document.getElementById('doclabelart-overlay');
        if (ov) ov.style.display = 'none';
    };
    var _docLabelArtModalRender = function () {
        var m = window._docLabelArtModal; if (!m) return;
        var code = m.code;
        var artFile = window._docLabelArtIndex && window._docLabelArtIndex[code];
        if (!artFile) { window._docLabelArtModalClose(); return; }
        var ov = document.getElementById('doclabelart-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'doclabelart-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9600; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="doclabelart-box" style="pointer-events:all; position:fixed; left:50%; top:6%;'
                + ' transform:translateX(-50%); width:min(760px,94vw); max-height:88vh; display:flex; flex-direction:column;'
                + ' background:#fff; border:1px solid #a3d9e0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden;">'
                + '<div id="doclabelart-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between;'
                + ' padding:9px 12px; background:#e0f5f7; border-bottom:1px solid #a3d9e0; color:#00707d; font-weight:bold;'
                + ' font-size:13px; cursor:grab;"><span id="doclabelart-title"></span>'
                + '<button onclick="window._docLabelArtModalClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="doclabelart-body" style="flex:1; min-height:0; overflow:auto; padding:14px; text-align:center;"></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('doclabelart-box', 'doclabelart-head'); } catch (e) { /* 〃 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('doclabelart-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('doclabelart-overlay'); } catch (e) { /* 〃 */ } }
        var titleEl = document.getElementById('doclabelart-title');
        if (titleEl) titleEl.textContent = '🏷 ' + _t('라벨 도안 — ', 'Artwork — ') + code;

        var notes = window._docLabelNotesCache[code] || [];
        var marks = window._docLabelMarksCache[code] || [];
        var boxes = window._docLabelBoxesCache[code] || [];
        // 🏷 [2026-11-13] 마크 그림 목록(UL·CE·FCC 공용 파일)은 코드와 상관없이 **한 번만** 불러온다
        if (window._docCertMarkIndex === null && !window._docCertMarkLoading
            && (Date.now() - window._docCertMarkLoadFailedAt) > 5000) window._docCertMarkLoad();
        var placing = window._docLabelNotePlacing === code;
        var cropping = window._docLabelCropState && window._docLabelCropState.code === code;
        var cropSel = cropping ? window._docLabelCropState.sel : null;
        var size = window._docLabelSizeCache && window._docLabelSizeCache[code];
        var idle = !placing && !cropping;
        var imgStyle = 'border:1px solid #dee2e6; border-radius:3px; display:block; margin:0 auto;'
            + (placing || cropping ? ' cursor:crosshair;' : ' cursor:default;')
            + ((size && size.w && size.h)
               ? (' width:' + size.w + 'px; height:' + size.h + 'px; max-width:none; max-height:none;')
               : ' max-width:min(700px,85vw); max-height:60vh;');
        var h = '<div style="position:relative; display:inline-block;">'
            + '<img id="doclabelart-img" data-crop-img="' + _esc(code) + '" draggable="false" ondragstart="return false;"'
                + ' src="' + _esc(_docLabelArtSrc(code, artFile))
                + '" style="' + imgStyle + '" onclick="window._docLabelImgClick(event,\'' + _esc(code) + '\')">'
            // 🔤 [2026-11-13, 사용자 요청] 번호 원 + **실제 표시내용**을 도안 위에 같이 보여준다
            //    (전엔 원만 찍고 내용은 아래 목록·말풍선뿐이었다). `idle` 일 때만 끌 수 있게.
            + _docLabelNoteMarkersHtml(notes, idle)
            // 🏷 [2026-11-13, 사용자 요청] 인증마크(UL·CE·CB·FCC) 도장 — 같은 틀로 끌어서 배치
            + _docLabelMarkMarkersHtml(marks, idle, code)
            // ⬜ [2026-11-13, 사용자 요청] "도안 위에 도표를 그려 넣고 싶은데" — 빈 박스(표 칸 구분선 용도)
            + _docLabelBoxMarkersHtml(boxes, idle, code)
            + (cropSel ? '<div style="position:absolute; pointer-events:none;'
                + ' left:' + (cropSel.x0 * 100) + '%; top:' + (cropSel.y0 * 100) + '%;'
                + ' width:' + ((cropSel.x1 - cropSel.x0) * 100) + '%; height:' + ((cropSel.y1 - cropSel.y0) * 100) + '%;'
                + ' border:2px dashed #1971c2; border-radius:3px; background:rgba(25,113,194,.15);"></div>' : '')
            + (idle ? '<div data-resize-handle title="' + _esc(_t('끌어서 크기 조절', 'drag to resize')) + '"'
                + ' style="position:absolute; right:-7px; bottom:-7px; width:15px; height:15px; border-radius:3px;'
                + ' background:#1971c2; border:2px solid #fff; box-shadow:0 0 0 1px #1971c2; cursor:nwse-resize; z-index:2;"></div>' : '')
            + '</div>'
            + '<div style="margin-top:8px; font-size:12px;">'
            + (placing
               ? '<span style="color:#e03131;">' + _esc(_t('이미지를 클릭하세요…', 'Click the image…')) + '</span>'
                 + ' <a href="#" onclick="window._docLabelNoteDisarm();return false;">' + _esc(_t('취소', 'cancel')) + '</a>'
               : cropping
               ? (cropSel
                  ? '<a href="#" onclick="window._docLabelCropApply();return false;" style="color:#1971c2; font-weight:bold;">✅ '
                    + _esc(_t('자르기 적용', 'Apply crop')) + '</a>'
                  : '<span style="color:#1971c2;">' + _esc(_t('드래그해서 영역을 고르세요…', 'Drag to select an area…')) + '</span>')
                 + ' <a href="#" onclick="window._docLabelCropCancel();return false;">' + _esc(_t('취소', 'cancel')) + '</a>'
               : '<a href="#" onclick="window._docLabelNoteArm(\'' + _esc(code) + '\');return false;" style="color:#7a5210;">✏️ '
                 + _esc(_t('표시 추가', 'Add note')) + '</a>'
                 + ' · <a href="#" onclick="window._docLabelCropArm(\'' + _esc(code) + '\');return false;" style="color:#7a5210;">✂️ '
                 + _esc(_t('배경 잘라내기', 'Crop')) + '</a>'
                 + ' · <a href="#" onclick="window._docLabelRotate(\'' + _esc(code) + '\',-1);return false;" style="color:#7a5210;">⟲ '
                 + _esc(_t('왼쪽으로 회전', 'Rotate left')) + '</a>'
                 + ' · <a href="#" onclick="window._docLabelRotate(\'' + _esc(code) + '\',1);return false;" style="color:#7a5210;">⟳ '
                 + _esc(_t('오른쪽으로 회전', 'Rotate right')) + '</a>'
                 + (size ? ' · <a href="#" onclick="window._docLabelSizeReset(\'' + _esc(code) + '\');return false;" style="color:#495057;">↺ '
                   + _esc(_t('크기 기본값', 'Reset size')) + '</a>' : '')
                 // 📐 [2026-11-13, 사용자 요청] 손잡이로 끌 때 비율을 지킬지 — 전역 체크 하나(표 썸네일과 공유)
                 + ' · <label style="cursor:pointer; font-weight:normal; color:#495057;"><input type="checkbox" '
                   + (window._docLabelAspectLock ? 'checked' : '')
                   + ' onchange="window._docLabelAspectLock=this.checked;" style="vertical-align:middle; margin-right:3px;">'
                   + _esc(_t('비율 고정', 'Lock ratio')) + '</label>'
                 // 🔤 [2026-11-13, 사용자 요청] 표시 글자 크기 — ＋／－로 조절, 이미지 크기와 연동(px 아님)
                 + (notes.length ? ' · <span style="color:#495057;">' + _esc(_t('표시 글자크기', 'Note text size')) + ': '
                   + '<a href="#" onclick="window._docLabelNoteFontAdjust(\'' + _esc(code) + '\',-1);return false;"'
                     + ' title="' + _esc(_t('작게', 'smaller')) + '" style="padding:0 4px; font-weight:bold;">－</a>'
                   + '<a href="#" onclick="window._docLabelNoteFontAdjust(\'' + _esc(code) + '\',1);return false;"'
                     + ' title="' + _esc(_t('크게', 'bigger')) + '" style="padding:0 4px; font-weight:bold;">＋</a></span>' : ''))
            + '</div>'
            // 🏷 [2026-11-13, 사용자 요청] "UL CE CB FCC 정도만 사용 — 인증마크도 도안 위에 넣고 싶다"
            //    누르면 바로 도안 위에 찍힌다(기본 자리는 오른쪽 위) — 정확한 위치는 끌어서.
            + (idle ? '<div style="margin-top:6px; font-size:12px; color:#495057;">🏷 ' + _esc(_t('인증마크 추가', 'Add cert mark')) + ': '
              + CERT_MARK_CATALOG.map(function (c) {
                  return '<a href="#" onclick="window._docLabelMarkAdd(\'' + _esc(code) + '\',\'' + _esc(c.key) + '\');return false;"'
                      + ' style="margin-right:10px; color:#7a5210; font-weight:bold;">' + _esc(c.label) + '</a>';
              }).join('')
              // ⬜ [2026-11-13, 사용자 요청] "도안 위에 도표를 그려 넣고 싶은데" — 누를 때마다 빈 박스가
              //    하나씩 늘고(표 칸 구분선처럼 여러 개 쌓아 배치), 자리·크기는 끌어서 맞춘다.
              + ' · <a href="#" onclick="window._docLabelBoxAdd(\'' + _esc(code) + '\');return false;"'
              + ' style="color:#1971c2; font-weight:bold;">⬜ ' + _esc(_t('박스 추가', 'Add box')) + '</a>'
              + '</div>' : '')
            // 📋 [2026-11-13, 사용자 요청] "빈 라벨지에 기입해야 하는 내용을 도표 형태로도 작성 가능했으면
            //    좋겠음" — 번호 목록을 **입력칸으로** 바꿔 클릭 위치 없이 타이핑만으로 고칠 수 있게 하고,
            //    맨 아래에 "입력 후 추가" 줄을 둬서 도안을 클릭하지 않고도 표처럼 줄줄이 적을 수 있다
            //    (기본 위치에 쌓인다 — 정확한 자리는 이제 **끌어서**(위 드래그) 옮기면 된다).
            // ⚠️ [2026-11-13, 사용자 요청] 표시 입력칸도 비고·기재내용과 같이 textarea — 한 줄 `<input>`
            //    은 Enter 로 줄을 못 나눈다. 새로 추가하는 칸은 Enter 가 줄바꿈으로 바뀌었으니 **추가는
            //    Ctrl+Enter 로**(또는 ＋ 추가 버튼).
            + (notes.length ? '<div style="text-align:left; font-size:11.5px; color:#495057; margin-top:8px;'
                + ' border-top:1px solid #e9ecef; padding-top:6px;">'
                + notes.map(function (n, ni) {
                    return '<div style="display:flex; align-items:flex-start; gap:4px; margin-top:2px;">' + (ni + 1) + '.'
                        + ' <textarea rows="2" onchange="window._docLabelNoteTextEdit(\'' + _esc(code) + '\',' + ni + ',this.value)"'
                        + ' style="flex:1; font-size:11.5px; padding:2px 5px; text-align:left; resize:vertical; font-family:inherit;">'
                        + _esc(n.text) + '</textarea>'
                        + ' <a href="#" onclick="window._docLabelNoteDel(\'' + _esc(code) + '\',' + ni
                        + ');return false;" style="color:#b1432f;">✕</a></div>';
                }).join('') + '</div>' : '')
            + (idle ? '<div style="margin-top:8px; display:flex; gap:6px; align-items:flex-start;">'
                + '<textarea id="doclabelart-newnote" rows="2" placeholder="' + _esc(_t('새 표시 내용을 입력 — 자리는 나중에 끌어서 옮기세요(추가는 Ctrl+Enter)',
                  'Type a new note (Ctrl+Enter to add) — drag it into place after.')) + '"'
                + ' onkeydown="if((event.ctrlKey||event.metaKey)&&event.key===\'Enter\'){window._docLabelNoteQuickAdd(\'' + _esc(code)
                + '\');return false;}" style="flex:1; font-size:11.5px; padding:4px 6px; text-align:left; resize:vertical; font-family:inherit;"></textarea>'
                + '<button onclick="window._docLabelNoteQuickAdd(\'' + _esc(code) + '\')" style="padding:4px 10px; font-size:11.5px;'
                + ' cursor:pointer; border:1px solid #a3d9e0; background:#e0f5f7; color:#00707d; border-radius:5px; font-weight:bold;">＋ '
                + _esc(_t('추가', 'Add')) + '</button></div>' : '');
        var bodyEl = document.getElementById('doclabelart-body');
        if (bodyEl) bodyEl.innerHTML = h;
        // 렌더 직후 한 번만 — `innerHTML` 교체로 옛 리스너는 이미 사라졌다(따로 뗄 필요 없음).
        var img = document.getElementById('doclabelart-img');
        var handle = bodyEl && bodyEl.querySelector('[data-resize-handle]');
        if (img && handle) {
            // 🔤 [2026-11-13] 끄는 동안에도 실시간으로 글자 크기를 같이 키운다(놓을 때까지 기다리지 않음)
            window._docLabelSizeWire(handle, img, code, function (wPx) {
                window._docLabelNotesApplyFont(bodyEl, img, code, wPx);
            });
        }
        if (img && cropping) window._docLabelCropWire(img);
        if (img && bodyEl) {
            window._docLabelNotesApplyFont(bodyEl, img, code);
            // 이미지가 아직 안 불러와졌으면(첫 진입) 로드 후 실제 폭으로 다시 맞춘다
            if (!img.complete) img.addEventListener('load', function () { window._docLabelNotesApplyFont(bodyEl, img, code); }, { once: true });
        }
        // 🖱 [2026-11-13] 마커 끌기·너비 조절은 `idle` 일 때만(표시추가·자르기 중엔 건드리지 않는다)
        if (img && idle) {
            [].slice.call(bodyEl.querySelectorAll('[data-note-wrap]')).forEach(function (wrap) {
                var idx = Number(wrap.getAttribute('data-note-idx'));
                window._docLabelNoteDragWire(wrap, img, code, idx);
                var widthBox = wrap.querySelector('[data-note-widthbox]');
                var wHandle = wrap.querySelector('[data-note-wresize]');
                if (widthBox && wHandle) window._docLabelNoteWidthWire(wHandle, widthBox, code, idx);
            });
            // 🏷 [2026-11-13] 인증마크도 같은 규칙으로 끌기·크기조절
            [].slice.call(bodyEl.querySelectorAll('[data-mark-wrap]')).forEach(function (wrap) {
                var midx = Number(wrap.getAttribute('data-mark-idx'));
                window._docLabelMarkDragWire(wrap, img, code, midx);
                var mHandle = wrap.querySelector('[data-mark-wresize]');
                if (mHandle) window._docLabelMarkWidthWire(mHandle, wrap, code, midx);
            });
            // ⬜ [2026-11-13] 박스도 같은 규칙으로 끌기 + 가로세로 크기조절
            [].slice.call(bodyEl.querySelectorAll('[data-box-wrap]')).forEach(function (wrap) {
                var bidx = Number(wrap.getAttribute('data-box-idx'));
                window._docLabelBoxDragWire(wrap, img, code, bidx);
                var bHandle = wrap.querySelector('[data-box-resize]');
                if (bHandle) window._docLabelBoxResizeWire(bHandle, wrap, code, bidx);
            });
        }
    };
    // 🔎 6자리 라벨품목코드로 `C:\SAP_DMS\원자재승인원`(+`자재문서`) 안을 파일명 기준으로 찾는다
    //   — 그 폴더는 ZDMSR004 다운로드 결과라 이름 규칙이 제각각이다(`<code>.xlsx` ·
    //   `승인원_<code>_REV02.zip` · `<code>_설명_날짜_REV00.zip` 등). 공통점은 6자리 코드가
    //   파일명 어딘가에 토큰으로 있다는 것뿐이라, 서버(`/sap-label-search`)가 숫자 경계로
    //   훑어 찾는다(부분일치 오탐 방지는 서버 쪽 정규식이 맡는다).
    window._docLabelFindResult = window._docLabelFindResult || {};
    window._docLabelFindMatches = window._docLabelFindMatches || {};
    window._docLabelImgState = window._docLabelImgState || {};
    // 🖼 매치 한 줄(파일 열기 + 미리보기 펼침/접힘 + 썸네일) — _docLabelFind 와 _docLabelToggleImages
    //    둘 다 결과 문자열을 다시 그려야 해서 한 곳으로 모은다.
    window._docLabelFindAllowSap = window._docLabelFindAllowSap || {};   // key -> 코드 검색이었나(규격 검색엔 SAP 다시받기가 없다)
    var _docLabelRenderMatches = function (formId, idx, key, matches, partial, allowSapRefresh) {
        if (allowSapRefresh !== undefined) window._docLabelFindAllowSap[key] = allowSapRefresh;
        var html = '🔎 ' + matches.length + _esc(_t('건 찾음', ' found')) + '<div class="doc-noprint"'
                 + ' style="margin-top:4px; display:flex; flex-direction:column; gap:6px;">'
            + matches.map(function (m, mi) {
                var skey = key + '|' + mi, st = window._docLabelImgState[skey];
                var line = '<a href="#" onclick="window._docLabelOpen(\'' + _esc(key).replace(/'/g, "\\'") + '\',' + mi
                     + ');return false;" style="color:#1971c2;" title="' + _esc(m.folder || '') + '">📎 ' + _esc(m.name) + '</a>'
                     + ' <a href="#" onclick="window._docLabelToggleImages(\'' + _esc(key).replace(/'/g, "\\'") + '\',' + mi
                     + ');return false;" style="color:#7a5210;">🖼 ' + (st && st.open ? _esc(_t('접기', 'hide'))
                                                                                       : _esc(_t('미리보기', 'preview'))) + '</a>';
                if (st && st.open) {
                    if (st.loading) {
                        line += '<div style="margin-top:3px; color:#868e96;">⏳ ' + _esc(_t('이미지 찾는 중…', 'loading…')) + '</div>';
                    } else if (st.error) {
                        line += '<div style="margin-top:3px; color:#b1432f;">⚠️ ' + _esc(st.error) + '</div>';
                    } else if (!st.images || !st.images.length) {
                        line += '<div style="margin-top:3px; color:#868e96;">'
                              + _esc(_t('이 파일엔 쓸 수 있는 이미지가 없습니다', 'No usable image in this file'))
                              + (st.skipped ? _esc(_t(' (그림 ' + st.skipped + '개는 지원하지 않는 형식).', '.'))
                                            : _esc(_t('.', '.'))) + '</div>';
                    } else {
                        // ⚠️⚠️ [버그 실측] 윈도 경로(`\1`, `\P` 등)를 onclick="...('...')" 문자열에
                        //    그대로 넣으면 JS 가 `\1` 을 **8진 이스케이프**(제어문자)로 읽어 경로가
                        //    조용히 깨진다(백엔드가 그 깨진 경로를 못 찾아 "가져오지 못했습니다") —
                        //    `_docLabelOpen` 처럼 **자리(키)만** 넘기고 실제 값은 저장된 상태에서
                        //    다시 찾는다(문자열 이스케이프가 아예 필요 없어진다).
                        // 📄 [2026-11-12 11차] PDF 는 바로 썸네일을 못 그린다(라이브 캔버스 렌더가
                        //    필요) — 대신 클릭하면 그때 pdf.js 로 1페이지를 그려 저장하는 사각형
                        //    버튼을 보여준다(`_docLabelPickPdfPage`, 이미지 쪽과 같은 자리(key·mi·ii)
                        //    전달 방식 — 경로 문자열은 onclick 에 절대 안 넣는다).
                        line += '<div style="margin-top:3px; display:flex; flex-wrap:wrap; gap:6px;">'
                            + st.images.map(function (im, ii) {
                                if (im.kind === 'pdf') {
                                    return '<div title="' + _esc(im.member) + ' (' + Math.round(im.size / 1024) + 'KB)"'
                                        + ' style="width:90px; height:80px; border:1px solid #dee2e6; border-radius:3px; cursor:pointer;'
                                        + ' display:flex; flex-direction:column; align-items:center; justify-content:center;'
                                        + ' font-size:10px; color:#495057; background:#f8fbfb; text-align:center; padding:2px;"'
                                        + ' onclick="window._docLabelPickPdfPage(\'' + _esc(key).replace(/'/g, "\\'") + '\',' + mi + ',' + ii + ')">'
                                        + '📄 PDF<br>' + _esc(_t('1페이지 저장', 'save page 1')) + '</div>';
                                }
                                var src = BACKEND + '/sap-label-image-bytes?path=' + encodeURIComponent(m.path)
                                    + '&inner=' + encodeURIComponent(im.inner || '') + '&member=' + encodeURIComponent(im.member);
                                return '<img src="' + _esc(src) + '" title="' + _esc(im.member) + ' (' + Math.round(im.size / 1024) + 'KB)"'
                                    + ' style="max-width:90px; max-height:80px; border:1px solid #dee2e6; border-radius:3px; cursor:pointer;"'
                                    + ' onclick="window._docLabelPickImage(\'' + _esc(key).replace(/'/g, "\\'") + '\',' + mi + ',' + ii + ')">';
                            }).join('') + '</div>'
                            + '<div style="font-size:10px; color:#868e96; margin-top:2px;">'
                            + _esc(_t('그림을 누르면 공용 라벨 도안(' + _LABEL_ART_FOLDER + ')으로 저장됩니다.',
                                      'Click a thumbnail to save it as the shared artwork.')) + '</div>';
                    }
                }
                return line;
            }).join('')
            + '</div>'
            + (partial ? ' (' + _esc(_t('너무 많아 일부만', 'truncated')) + ')' : '')
            + (window._docLabelFindAllowSap[key] !== false ? _docLabelSapRefreshLink(key, true) : '');
        window._docLabelFindResult[key] = html;
    };
    // 🔄 [2026-11-12 4차, 사용자 지적] "로컬 폴더 검색"은 과거에 내려받아 둔 사본만 본다 —
    //    SAP 에 라벨이 **새로 등록**되면 그 파일은 아직 로컬에 없어 검색에서 조용히 빠진다.
    //    기존 "📥 문서 다운로드(ZDMSR004)" 배치(`/sap-download-documents-batch`, 이미 있는
    //    기능 — 새 라우트 아님)를 그 코드 하나로 불러 **SAP 에서 직접 받고**, 받은 뒤 같은
    //    로컬 검색을 다시 돌린다. ⚠️ SAP GUI 가 로그인돼 있어야 하고 시간이 걸릴 수 있어
    //    자동으로는 안 돌리고 **사람이 누를 때만** 돈다.
    var _docLabelSapRefreshLink = function (key, found) {
        return '<div class="doc-noprint" style="margin-top:4px;">'
            + '<a href="#" onclick="window._docLabelFetchFromSap(\'' + _esc(key).replace(/'/g, "\\'") + '\');return false;"'
            + ' style="color:#7a5210; font-size:11px; font-weight:bold;">🔄 '
            + _esc(found ? _t('SAP 에서 최신 문서로 다시 받기', 'Fetch the latest from SAP')
                         : _t('SAP 에서 새로 받아오기(최근 등록된 라벨이면 로컬에 아직 없을 수 있습니다)',
                              'Fetch from SAP (a newly registered label may not be downloaded locally yet)'))
            + '</a></div>';
    };
    window._docLabelFetchFromSap = async function (key) {
        var parts = key.split('|'), formId = parts[0], idx = Number(parts[1]);
        var it = (_docData(formId).labelItems || [])[idx];
        var code = String((it && it.code) || '').trim();
        if (!/^\d{4,7}$/.test(code)) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc(_t('6자리 코드를 먼저 적으세요.', 'Enter the 6-digit code first.'));
            window._docRender(); return;
        }
        window._docLabelFindResult[key] = '⏳ ' + _esc(_t('SAP 에서 최신 문서를 받는 중… (SAP GUI 로그인이 필요하고, 1분 이상 걸릴 수 있습니다)',
                                                          'Fetching the latest document from SAP… (SAP GUI must be logged in; may take a minute or more)'));
        window._docRender();
        var res, r;
        try {
            r = await fetch(BACKEND + '/sap-download-documents-batch?materials=' + encodeURIComponent(code) + '&type=P01',
                             { signal: AbortSignal.timeout(170000) });
        } catch (e) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc(_t('백엔드에 닿지 못했거나 시간이 초과됐습니다.', 'Backend unreachable or timed out.'));
            window._docRender(); return;
        }
        if (r.status === 404) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc(_t('백엔드를 재시작해야 쓸 수 있습니다(SAP 문서 다운로드).',
                                                              'Restart the backend to use this.'));
            window._docRender(); return;
        }
        try { res = await r.json(); } catch (e2) { res = null; }
        if (!res || !res.ok) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc((res && res.error) || _t('SAP 에서 받지 못했습니다.', 'Could not fetch from SAP.'))
                + _docLabelSapRefreshLink(key, false);
            window._docRender(); return;
        }
        _toast('✅ ' + (res.message || _t('SAP 에서 받았습니다.', 'Fetched from SAP.')), 'success');
        await window._docLabelFind(formId, idx);   // 받은 뒤 같은 로컬 검색을 다시 돌려 찾는다
    };
    // 🔎 [2026-11-12 7차] 코드뿐 아니라 **라벨규격**(예: "75 X 70")으로도 찾을 수 있다 — 실측
    //    파일명에 치수가 공백 없이 그대로 들어 있다(`...SLV,75X70 (1).XLSX`). 코드/규격 둘 다
    //    같은 결과 렌더링(`_docLabelRenderMatches`)·같은 "SAP 에서 새로 받기" 흐름을 타게
    //    **공용 실행기 하나**로 모은다(검색 경로가 둘이어도 결과 처리는 한 곳).
    var _docLabelSearchRun = async function (formId, idx, qs, allowSapRefresh, notFoundLabel) {
        var key = formId + '|' + idx;
        window._docLabelFindResult[key] = '⏳ ' + _esc(_t('찾는 중…', 'Searching…'));
        window._docRender();
        var res, r;
        try {
            r = await fetch(BACKEND + '/sap-label-search?' + qs);
        } catch (e) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc(_t('백엔드에 닿지 못했습니다.', 'Backend unreachable.'));
            window._docRender(); return;
        }
        // ⚠️ 404 는 "못 찾았다" 가 아니라 **구버전 백엔드** 다 — 재시작 전엔 이 라우트가 없다
        //    (_docSaveDocx 와 같은 판정, docs/backend-auto-update.md).
        if (r.status === 404) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc(_t('백엔드를 재시작해야 쓸 수 있습니다(라벨 도안 찾기).',
                                                              'Restart the backend to use this.'));
            window._docRender(); return;
        }
        try { res = await r.json(); } catch (e2) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc(_t('응답을 읽지 못했습니다.', 'Could not read the response.'));
            window._docRender(); return;
        }
        if (!res || !res.ok) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc((res && res.error) || _t('검색 실패', 'Search failed'));
        } else if (!res.matches || !res.matches.length) {
            window._docLabelFindResult[key] = '🔍 ' + _esc(_t('도안을 못 찾았습니다(확인해 주세요): ', 'No drawing found for: ')) + _esc(notFoundLabel)
                + (allowSapRefresh ? _docLabelSapRefreshLink(key, false) : '');
        } else {
            window._docLabelFindMatches[key] = res.matches;
            _docLabelRenderMatches(formId, idx, key, res.matches, res.partial, allowSapRefresh);
        }
        window._docRender();
    };
    window._docLabelFind = async function (formId, idx) {
        var it = (_docData(formId).labelItems || [])[idx];
        var code = String((it && it.code) || '').trim();
        var key = formId + '|' + idx;
        if (!/^\d{4,7}$/.test(code)) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc(_t('6자리 코드를 먼저 적으세요.', 'Enter the 6-digit code first.'));
            window._docRender(); return;
        }
        window._docLabelFetchSapDesc(formId, idx, code);   // 도안 찾기와 별개로 끝날 때까지 안 기다림
        await _docLabelSearchRun(formId, idx, 'code=' + encodeURIComponent(code), true, code);
    };
    // 📋 [2026-11-13, 사용자 요청] "라벨 규격은 라벨 품목 코드 조회하면 SAP 의 내역을 표시해주면" —
    //    코드로 도안을 찾을 때 SAP 자재 내역(`/sap-material-rows`, ZMM009 — BOM·QA 문답과 같은 경로,
    //    `MAKTX`)도 같이 받아 규격 칸 밑에 참고로 보여준다. **규격 칸을 자동으로 덮어쓰지 않는다**
    //    — 사람이 내역을 보고 직접 규격을 적어 넣는다(SAP 내역 문구가 그대로 "규격"은 아니라서).
    window._docLabelFetchSapDesc = async function (formId, idx, code) {
        var it = (_docData(formId).labelItems || [])[idx];
        if (!it) return;
        try {
            var r = await fetch(BACKEND + '/sap-material-rows?materials=' + encodeURIComponent(code));
            var d = await r.json();
            var m = d && d.ok && d.materials && d.materials[0];
            it.sapDesc = (m && m.MAKTX) || '';
        } catch (e) {
            return;   // 조용히 넘긴다 — 도안 찾기는 이미 따로 끝났고, 이건 참고 정보일 뿐이다
        }
        if (it.sapDesc) { _markDirty(); window._docRender(); }
    };
    // 🤖 [2026-11-13, 사용자 요청] "라벨 품목 코드를 넣지 않는 경우는 AI 문답 창을 띄워서 찾도록
    //    유도해줘" — 코드 칸이 비어 있을 때만 보이는 버튼. 기존 AI 문답 입구를 그대로 쓴다
    //    (`openGanttQaModal→#gantt-qa-input→focus`, js/71 과 같은 방식 — 입구를 베끼지 않는다).
    window._docLabelAskAiCode = function (formId, idx) {
        var it = (_docData(formId).labelItems || [])[idx];
        var size = String((it && it.size) || '').trim();
        var q = size
            ? _t('라벨품목코드를 모르겠습니다 — 규격 ' + size + ' 라벨의 SAP 자재코드를 찾아주세요.',
                 'I don\'t know the label item code — please help me find the SAP material code for a ' + size + ' label.')
            : _t('라벨품목코드를 모르겠습니다 — 이 라벨의 SAP 자재코드를 찾아주세요.',
                 'I don\'t know the label item code — please help me find the SAP material code for this label.');
        if (!window.openGanttQaModal) { _toast('⚠️ ' + _t('AI 문답 창을 열지 못했습니다.', 'Could not open the AI chat.'), 'error'); return; }
        window.openGanttQaModal();
        var apply = function () {
            var inp = document.getElementById('gantt-qa-input');
            if (!inp) return;
            inp.value = q;
            inp.focus();
            try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* 〃 */ }
        };
        apply();
        setTimeout(apply, 80);   // openGanttQaModal 자체 focus(js/04h, 50ms 뒤)보다 늦게 한 번 더
    };
    window._docLabelFindBySize = async function (formId, idx) {
        var it = (_docData(formId).labelItems || [])[idx];
        var size = String((it && it.size) || '').trim();
        var key = formId + '|' + idx;
        if (size.length < 3) {
            window._docLabelFindResult[key] = '⚠️ ' + _esc(_t('라벨규격을 먼저 적으세요(3자 이상).', 'Enter the label size first (3+ chars).'));
            window._docRender(); return;
        }
        // ⚠️ 규격만으로는 코드를 모르니 SAP "다시 받기"(자재번호 필요)는 못 쓴다 — 링크를 안 보인다.
        await _docLabelSearchRun(formId, idx, 'q=' + encodeURIComponent(size), false, size);
    };
    window._docLabelToggleImages = async function (key, mi) {
        var parts = key.split('|'), formId = parts[0], idx = Number(parts[1]);
        var matches = window._docLabelFindMatches[key] || [];
        var skey = key + '|' + mi, cur = window._docLabelImgState[skey];
        if (cur && cur.open) {
            window._docLabelImgState[skey] = { open: false };
            _docLabelRenderMatches(formId, idx, key, matches, false);
            window._docRender(); return;
        }
        var m = matches[mi];
        if (!m) return;
        window._docLabelImgState[skey] = { open: true, loading: true, images: [] };
        _docLabelRenderMatches(formId, idx, key, matches, false);
        window._docRender();
        var res, r;
        try {
            r = await fetch(BACKEND + '/sap-label-images?path=' + encodeURIComponent(m.path));
        } catch (e) {
            window._docLabelImgState[skey] = { open: true, loading: false, images: [],
                                                error: _t('백엔드에 닿지 못했습니다.', 'Backend unreachable.') };
            _docLabelRenderMatches(formId, idx, key, matches, false); window._docRender(); return;
        }
        if (r.status === 404) {
            window._docLabelImgState[skey] = { open: true, loading: false, images: [],
                                                error: _t('백엔드를 재시작해야 쓸 수 있습니다.', 'Restart the backend to use this.') };
            _docLabelRenderMatches(formId, idx, key, matches, false); window._docRender(); return;
        }
        try { res = await r.json(); } catch (e2) { res = null; }
        window._docLabelImgState[skey] = { open: true, loading: false,
            images: (res && res.ok) ? res.images : [], skipped: res && res.skipped,
            error: (!res || !res.ok) ? ((res && res.error) || _t('이미지 목록을 읽지 못했습니다.', 'Could not list images.')) : '' };
        _docLabelRenderMatches(formId, idx, key, matches, false);
        window._docRender();
    };
    // ⚠️⚠️ [2026-11-12 실측 버그] `(formId, idx, path, inner, member)` 로 **경로를 onclick 문자열에
    //    직접 박았더니** 윈도 경로의 `\1`(예: `...P01202300096\124291...`) 을 JS 가 **8진
    //    이스케이프**(제어문자)로 읽어 경로가 조용히 깨졌다 — 백엔드가 그 경로를 못 찾아 매번
    //    "이미지를 가져오지 못했습니다" 로 끝났다(사용자 신고: "토스트만 뜨고 아무 반응 없음").
    //    `_docLabelOpen` 과 같은 방식으로 **자리(key·mi·ii)만** 받고 실제 경로는 이미 저장된
    //    `_docLabelFindMatches`/`_docLabelImgState` 에서 다시 찾는다 — 문자열 이스케이프가 아예
    //    필요 없어진다.
    window._docLabelPickImage = async function (key, mi, ii) {
        var parts = key.split('|'), formId = parts[0], idx = Number(parts[1]);
        var m = (window._docLabelFindMatches[key] || [])[mi];
        var im = (window._docLabelImgState[key + '|' + mi] && window._docLabelImgState[key + '|' + mi].images || [])[ii];
        if (!m || !im) { _toast('⚠️ ' + _t('이 그림을 더 이상 찾을 수 없습니다 — 미리보기를 다시 열어주세요.',
                                           'This image is no longer available — reopen the preview.'), 'error'); return; }
        var it = (_docData(formId).labelItems || [])[idx];
        var code = String((it && it.code) || '').trim();
        if (!code) { _toast('⚠️ ' + _t('코드를 먼저 적으세요.', 'Enter the code first.'), 'error'); return; }
        _toast('⏳ ' + _t('이미지를 가져오는 중…', 'Fetching…'), 'info');
        var blob;
        try {
            var r = await fetch(BACKEND + '/sap-label-image-bytes?path=' + encodeURIComponent(m.path)
                + '&inner=' + encodeURIComponent(im.inner || '') + '&member=' + encodeURIComponent(im.member));
            if (!r.ok) { _toast('⚠️ ' + _t('이미지를 가져오지 못했습니다.', 'Could not fetch the image.'), 'error'); return; }
            blob = await r.blob();
        } catch (e) {
            _toast('⚠️ ' + _t('백엔드에 닿지 못했습니다.', 'Backend unreachable.'), 'error'); return;
        }
        var ext = (String(im.member).split('.').pop() || 'png').toLowerCase();
        var fname = code + '.' + ext;
        if (!window._dgUploadBlob) { _toast('⚠️ ' + _t('업로드 기능을 불러오지 못했습니다.', 'Upload unavailable.'), 'error'); return; }
        // ⚠️ 공용 자료다 — 코드 하나당 파일 하나(덮어쓰기 확인 없이): 같은 코드를 다시 고르는 건
        //    "이 코드엔 이 도안이 맞다"는 정정이라, 그 정정은 이 코드를 쓰는 모두에게 적용돼야 한다.
        var res = await window._dgUploadBlob(_LABEL_ART_FOLDER, fname, blob, { forceOverwrite: true });
        if (!res.ok) { _toast('⚠️ ' + _t('저장하지 못했습니다: ', 'Could not save: ') + (res.error || ''), 'error'); return; }
        window._docLabelArtIndex = window._docLabelArtIndex || {};
        window._docLabelArtIndex[code] = fname;
        _docLabelBumpVer(code);
        delete window._docLabelFindResult[formId + '|' + idx];
        Object.keys(window._docLabelImgState).forEach(function (k) {
            if (k.indexOf(formId + '|' + idx + '|') === 0) delete window._docLabelImgState[k];
        });
        _toast('✅ ' + _t('공용 라벨 도안(' + _LABEL_ART_FOLDER + ')에 저장했습니다: ' + fname,
                          'Saved to the shared label artwork library.'), 'success');
        window._docRender();
    };
    // 📄 [2026-11-12 11차, 사용자 요청 "PDF 파일도 도안 검색에 추가해줘"] 서버는 PDF 원본 바이트만
    //    그대로 주고(`/sap-label-image-bytes`, member=`__pdf_page1__`), **1페이지를 PNG 로 바꾸는
    //    건 이 함수**다 — 이미 전역 로드된 pdf.js(`pdfjsLib`, `02-pdfjs-worker-init.js`)를 그대로
    //    쓴다(서버에 새 PDF 의존성을 더하지 않는다). 결과는 이미지 쪽과 똑같이 공용 도안으로 저장.
    window._docLabelPickPdfPage = async function (key, mi, ii) {
        var parts = key.split('|'), formId = parts[0], idx = Number(parts[1]);
        var m = (window._docLabelFindMatches[key] || [])[mi];
        var im = (window._docLabelImgState[key + '|' + mi] && window._docLabelImgState[key + '|' + mi].images || [])[ii];
        if (!m || !im) { _toast('⚠️ ' + _t('이 PDF 를 더 이상 찾을 수 없습니다 — 미리보기를 다시 열어주세요.',
                                           'This PDF is no longer available — reopen the preview.'), 'error'); return; }
        var it = (_docData(formId).labelItems || [])[idx];
        var code = String((it && it.code) || '').trim();
        if (!code) { _toast('⚠️ ' + _t('코드를 먼저 적으세요.', 'Enter the code first.'), 'error'); return; }
        if (!window.pdfjsLib) {
            _toast('⚠️ ' + _t('PDF 처리 기능을 불러오지 못했습니다.', 'PDF support failed to load.'), 'error'); return;
        }
        _toast('⏳ ' + _t('PDF 페이지를 그리는 중…', 'Rendering the PDF page…'), 'info');
        try {
            var r = await fetch(BACKEND + '/sap-label-image-bytes?path=' + encodeURIComponent(m.path)
                + '&inner=' + encodeURIComponent(im.inner || '') + '&member=' + encodeURIComponent(im.member));
            if (!r.ok) { _toast('⚠️ ' + _t('PDF 를 가져오지 못했습니다.', 'Could not fetch the PDF.'), 'error'); return; }
            var buf = await r.arrayBuffer();
            var pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
            var page = await pdf.getPage(1);
            var viewport = page.getViewport({ scale: 2 });
            var canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
            if (!blob) { _toast('⚠️ ' + _t('변환에 실패했습니다.', 'Conversion failed.'), 'error'); return; }
            if (!window._dgUploadBlob) { _toast('⚠️ ' + _t('업로드 기능을 불러오지 못했습니다.', 'Upload unavailable.'), 'error'); return; }
            var fname = code + '.png';
            var res = await window._dgUploadBlob(_LABEL_ART_FOLDER, fname, blob, { forceOverwrite: true });
            if (!res.ok) { _toast('⚠️ ' + _t('저장하지 못했습니다: ', 'Could not save: ') + (res.error || ''), 'error'); return; }
            window._docLabelArtIndex = window._docLabelArtIndex || {};
            window._docLabelArtIndex[code] = fname;
            _docLabelBumpVer(code);
            delete window._docLabelFindResult[formId + '|' + idx];
            Object.keys(window._docLabelImgState).forEach(function (k) {
                if (k.indexOf(formId + '|' + idx + '|') === 0) delete window._docLabelImgState[k];
            });
            _toast('✅ ' + _t('공용 라벨 도안(' + _LABEL_ART_FOLDER + ')에 저장했습니다(PDF 1페이지): ' + fname,
                              'Saved PDF page 1 to the shared artwork library.'), 'success');
            window._docRender();
        } catch (e) {
            _toast('⚠️ ' + _t('PDF 를 처리하지 못했습니다: ', 'Could not process the PDF: ') + (e && e.message || e), 'error');
        }
    };
    window._docLabelOpen = async function (key, mi) {
        var m = (window._docLabelFindMatches[key] || [])[mi];
        if (!m) return;
        try {
            var r = await fetch(BACKEND + '/sap-open-file?path=' + encodeURIComponent(m.path));
            if (r.status === 404) {
                _toast('⚠️ ' + _t('백엔드를 재시작해야 쓸 수 있습니다(파일 열기).', 'Restart the backend to use this.'), 'error');
                return;
            }
            var res = await r.json();
            if (!res || !res.ok) _toast('⚠️ ' + _esc((res && res.error) || _t('열지 못했습니다.', 'Could not open.')), 'error');
        } catch (e) {
            _toast('⚠️ ' + _t('백엔드에 닿지 못했습니다.', 'Backend unreachable.'), 'error');
        }
    };
    // 📥 엑셀 불러오기(js/72 `_labelSpecImportFile`)가 다리로 부른다 — `_docData` 가 이 파일의
    //    닫힌 스코프 안에 있어서 파서(순수 함수, 앱 상태를 모른다) 쪽에서 직접 못 건드린다.
    //    ⚠️ 이미 적어 둔 내용이 있으면 **1회 확인** 후에만 통째로 바꾼다(되돌릴 길이 없어서다).
    window._docLabelImportApply = function (formId, parsed) {
        var d = _docData(formId);
        var has = (d.labelItems && d.labelItems.length)
            || (d.labelCerts && ((d.labelCerts.certs || []).length || (d.labelCerts.ratings || []).length));
        if (has && !confirm(_t('지금 있는 라벨 목록·인증/정격 표를 불러온 내용으로 덮어씁니다. 계속할까요?',
                                'Overwrite the current labels and cert/rating table with the imported file?'))) {
            return false;
        }
        d.labelItems = parsed.items || [];
        d.labelCerts = { certs: parsed.certs || [], ratings: parsed.ratings || [] };
        // BUYER/MODEL/품목코드/작성일자는 이미 프로젝트 값에서 자동으로 채워지니 건드리지 않는다
        // — REV 만 사람이 아직 안 적었을 때만 채운다(자동 소스가 없는 유일한 칸이다).
        if (parsed.rev && !_hasOwn(formId, 'REV')) window._docSetField(formId, 'REV', parsed.rev);
        window._docLabelFindResult = {}; window._docLabelFindMatches = {};   // 옛 찾기 결과는 자리가 안 맞을 수 있다
        _markDirty(); window._docRender();
        return true;
    };

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
    // 🏷 모델(제품구분자) 전환 — BOM·Customer SPEC 과 같은 "누를 때마다 다음 모델" 버튼.
    //    같은 전환 함수(`mcSwitchUnit`)를 쓴다 — 저장 열쇠(`_dataKey`)가 바로 그 값을 본다.
    window.docCycleUnit = function () {
        var units = window.getMcUnits ? window.getMcUnits() : [];
        if (units.length < 2) return;
        var cur = window.mcActiveUnit || units[0];
        var next = units[(units.indexOf(cur) + 1) % units.length];
        if (window.mcSwitchUnit) window.mcSwitchUnit(next); else window.mcActiveUnit = next;
        window._docRender();
    };
    /** 🙈 [2026-11-12 요청] 점검요청 '해당없음' 항목 접기 ↔ 펴기 (기본 접힘, Resolution 묶음은 예외) */
    window._docToggleHideNA = function () {
        window._docState.hideNA = (window._docState.hideNA === false) ? true : false;
        window._docRender();
    };
    /** 📂 [2026-11-12 5차 요청] 시트 헤더 버튼 하나로 3단 순환: 접기 → 펼치기1(점검요청만) →
     *  펼치기2(전체) → 접기... 기본값(未지정)은 '전체' — 예전 화면과 같은 첫 모습을 지킨다. */
    window._docToggleSheetCollapse = function (sheetKey) {
        window._docState.chkSheetState = window._docState.chkSheetState || {};
        var cur = window._docState.chkSheetState[sheetKey] || 'all';
        window._docState.chkSheetState[sheetKey] = cur === 'all' ? 'collapsed' : (cur === 'collapsed' ? 'req' : 'all');
        window._docRender();
    };
    /** 📂 [2026-11-12 4차 요청] 문서 안 섹션(.doc-sec) 전부에 접기 ↔ 펴기 — 섹션 제목(s.title)으로 구분 */
    window._docToggleSectionCollapse = function (sectionTitle) {
        window._docState.secCollapsed = window._docState.secCollapsed || {};
        window._docState.secCollapsed[sectionTitle] = !window._docState.secCollapsed[sectionTitle];
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

        // ── 올릴 파일 목록(바코드별 report+log)을 먼저 만든다 ──────────────────
        var uploads = []; // { pIdx, kind:'report'|'log', name, blob }
        picked.forEach(function (it, pIdx) {
            var reportName = roundSafe + '_' + (it.reportFileName || (it.barcode + '_Final_Report.txt'));
            uploads.push({ pIdx: pIdx, kind: 'report', name: reportName, blob: new Blob([it.reportText || ''], { type: 'text/plain' }) });
            if (it.logFileName) {
                var logName = roundSafe + '_' + it.logFileName;
                uploads.push({ pIdx: pIdx, kind: 'log', name: logName, blob: new Blob([it.logText || ''], { type: 'text/plain' }) });
            }
        });
        // ── 1차: 안 겹치는 파일은 그대로 올린다 · 겹치는 파일은 묻지 않고 모아만 둔다
        //    (파일마다 confirm 을 띄우면 샘플 16개×2 파일 = 32번 뜬다, 2026-11-12 신고) ──
        var up1 = {}; // key = pIdx+'|'+kind → {ok,name}
        var conflicts = [];
        for (var u = 0; u < uploads.length; u++) {
            var upl = uploads[u];
            var r = await window._dgUploadBlob(folder, upl.name, upl.blob, { forceOverwrite: false });
            if (r.ok) up1[upl.pIdx + '|' + upl.kind] = r;
            else if (r.exists) conflicts.push(upl);
        }
        // ── 2차: 겹친 파일이 있으면 **전체를 한 번만** 묻고, 좋다면 전부 덮어쓴다 ──
        if (conflicts.length) {
            var ovwAll = confirm(_t('NAS 에 같은 이름의 파일이 이미 ' + conflicts.length + '개 있습니다.\n\n'
                                    + '전부 덮어쓸까요? (되돌릴 수 없습니다 — 팀 공유 폴더입니다)',
                                    conflicts.length + ' file(s) already exist on NAS.\n\nOverwrite all? (cannot be undone — shared team folder)'));
            for (var c = 0; c < conflicts.length; c++) {
                var cu = conflicts[c];
                if (!ovwAll) continue;
                var r2 = await window._dgUploadBlob(folder, cu.name, cu.blob, { forceOverwrite: true });
                if (r2.ok) up1[cu.pIdx + '|' + cu.kind] = r2;
            }
        }

        var okCount = 0;
        for (var i = 0; i < picked.length; i++) {
            var it = picked[i];
            var files = [];
            var rr = up1[i + '|report'];
            if (rr && rr.ok) files.push({ name: rr.name, folder: folder, kind: 'report' });
            var rl = up1[i + '|log'];
            if (rl && rl.ok) files.push({ name: rl.name, folder: folder, kind: 'log' });
            d.opticalLogs.push({
                barcode: it.barcode, model: it.model, startTime: it.startTime, endTime: it.endTime,
                targetX: it.targetX, targetY: it.targetY, nativeX: it.nativeX, nativeY: it.nativeY,
                maxPwmLv: it.maxPwmLv, defaultPwmLv: it.defaultPwmLv, gamutPct: it.gamutPct,
                pqTotal: it.pqTotal, pqPass: it.pqPass, pqFail: it.pqFail, pqManual: '',
                // 🔬 균일도·색재현율은 zip 에 없다 — 빈 채로 두고 "🔽 상세" 를 펼쳐 손으로 보탤 수 있다.
                dimming: '', grade: '', remark: '', category: '', aging: '', label: '',
                points: ['', '', '', '', '', '', '', '', ''],
                primaries: { Rx: '', Ry: '', Gx: '', Gy: '', Bx: '', By: '' },
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

    // ── 🔬🔬 [2026-11-12 2차] 손으로 재는 9포인트 균일도 + R/G/B 색재현율 ───────
    //  사용자 확인: 9포인트 Lv(1~9, 3x3)·R/G/B 삼원색 좌표는 **장비 로그가 없어 직접 입력**해야
    //  한다. 공식은 실제 예시 표를 역산해 맞춘 것 — 첨부(RGB 수동조절 시뮬레이터)의 "NTSC" 프리셋
  //  숫자는 **그대로 쓰면 95%가 아니라 125%대가 나와 안 맞았고**, 국제 표준 NTSC(1953)
    //  삼원색(R 0.67,0.33 / G 0.21,0.71 / B 0.14,0.08)을 써야 실제 표(95%)와 맞았다(사용자 승인).
    //  ⚠️ "PQ"(26포인트 감마/컬러트래킹)와는 **다른 개념** — zip 없이 9포인트만 적은 행은 26포인트
    //  원본이 없어 진짜 PQ를 계산할 수 없으므로, 그 행은 PQ 를 **비워 두고 사람이 직접 입력**한다
    //  (사용자 결정 — Uniformity/Gamut 기준 충족으로 자동 판정하면 다른 개념이 한 칸에 섞인다).
    window.DOC_NTSC1953 = window.DOC_NTSC1953 || { Rx: 0.67, Ry: 0.33, Gx: 0.21, Gy: 0.71, Bx: 0.14, By: 0.08 };
    var _triArea = function (x1, y1, x2, y2, x3, y3) {
        return 0.5 * Math.abs(x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    };
    var _NTSC53_AREA = _triArea(window.DOC_NTSC1953.Rx, window.DOC_NTSC1953.Ry, window.DOC_NTSC1953.Gx,
                                 window.DOC_NTSC1953.Gy, window.DOC_NTSC1953.Bx, window.DOC_NTSC1953.By);
    /** 9포인트(또는 그 이하) Lv → Uniformity% = min/max×100. 숫자 2개 미만이면 못 구한다(null). */
    var _opticalUniformity = function (points) {
        var nums = (points || []).map(function (v) { return parseFloat(v); }).filter(function (v) { return !isNaN(v) && v > 0; });
        if (nums.length < 2) return null;
        var min = Math.min.apply(null, nums), max = Math.max.apply(null, nums);
        if (max <= 0) return null;
        return { pct: Math.round((min / max) * 100), min: min, max: max };
    };
    window._opticalUniformity = _opticalUniformity;
    /** R/G/B 삼원색(x,y) → Color Gamut(%NTSC) = 측정 삼각형 넓이 ÷ NTSC(1953) 표준 삼각형 넓이 × 100.
     *  셋 중 하나라도 비었으면 null(빈 값으로 지어내지 않는다). */
    var _opticalGamut = function (prim) {
        if (!prim) return null;
        var rx = parseFloat(prim.Rx), ry = parseFloat(prim.Ry), gx = parseFloat(prim.Gx), gy = parseFloat(prim.Gy),
            bx = parseFloat(prim.Bx), by = parseFloat(prim.By);
        if ([rx, ry, gx, gy, bx, by].some(function (v) { return isNaN(v); })) return null;
        var area = _triArea(rx, ry, gx, gy, bx, by);
        return { area: area, pct: Math.round((area / _NTSC53_AREA) * 10000) / 100 };
    };
    window._opticalGamut = _opticalGamut;
    // ── 🔬🔬 [2026-11-12 3차] Uniformity/Gamut PASS·FAIL — Customer SPEC 최소 기준과 대조 ──
    //  Customer SPEC(`tabData.briefSpec`, 지금 모델을 가리키는 별칭 — js/43)의 TYPE 은 **지어내지
    //  않는다**: js/55 `PL_CHECK_SPEC_FIELDS` 가 실측해 둔 그 문자열('Uniformity(%)'/'Color Gamut')
    //  과 정확히 같은 이름만 찾는다. 값은 "80% Min"처럼 자유 서술형이라 **첫 숫자를 하한**으로 본다
    //  (이 두 스펙은 관례상 항상 '이상이면 합격'이라 최댓값 스펙과 다르다). PQ 는 그 로그 안에
    //  이미 PASS/FAIL 이 있어 대조가 필요 없지만, 이 둘은 **스펙 자체가 앱 밖(Customer SPEC)에만
    //  있어서** 대조가 필요하다 — 그래서 PQ 와 달리 이 둘만 배지를 매긴다.
    var _opticalSpecValue = function (exactType) {
        var bs = (window.tabData && window.tabData.briefSpec) || [];
        if (!Array.isArray(bs)) return '';
        var want = String(exactType).trim().toLowerCase();
        for (var i = 0; i < bs.length; i++) {
            var t = String((bs[i] && bs[i].type) || '').trim().toLowerCase();
            if (t === want) return String((bs[i] && bs[i].modelA) || '').trim();
        }
        return '';
    };
    /** 측정값(%) vs Customer SPEC 최소 기준 → {pass,min,specText} | null(스펙이 없거나 숫자를
     *  못 읽으면 **판정하지 않는다** — 기준 없이 PASS/FAIL 을 지어내지 않음). */
    var _opticalSpecCheck = function (exactType, measuredPct) {
        if (measuredPct == null || measuredPct === '' || isNaN(measuredPct)) return null;
        var specText = _opticalSpecValue(exactType);
        if (!specText) return null;
        var m = specText.match(/[\d.]+/);
        if (!m) return null;
        var min = parseFloat(m[0]);
        return { pass: measuredPct >= min, min: min, specText: specText };
    };
    window._opticalSpecCheck = _opticalSpecCheck;
    /** {pass,min,specText}|null → 칸에 바로 붙일 수 있는 작은 PASS/FAIL 배지 HTML(없으면 ''). */
    var _opticalBadgeHtml = function (chk) {
        if (!chk) return '';
        return ' <span style="font-size:9px; font-weight:bold; color:' + (chk.pass ? '#1f7a3d' : '#b1432f')
             + ';" title="' + _esc(_t('Customer SPEC 기준', 'Customer SPEC threshold') + ' ' + chk.specText) + '">'
             + (chk.pass ? '✅' : '⚠️') + '</span>';
    };
    window._opticalBadgeHtml = _opticalBadgeHtml;

    window._docOpticalAddManual = function (formId) {
        var d = _docData(formId);
        d.opticalLogs = d.opticalLogs || [];
        d.opticalLogs.push({
            barcode: '', model: '', startTime: '', endTime: '',
            nativeX: '', nativeY: '', maxPwmLv: '', defaultPwmLv: '',
            pqTotal: 0, pqPass: 0, pqFail: 0, pqManual: '',
            dimming: '', grade: '', remark: '', category: '', aging: '', label: '',
            points: ['', '', '', '', '', '', '', '', ''],
            primaries: { Rx: '', Ry: '', Gx: '', Gy: '', Bx: '', By: '' },
            files: [], manual: true, importedAt: new Date().toISOString()
        });
        window._docState.opticalExpand = window._docState.opticalExpand || {};
        window._docState.opticalExpand[d.opticalLogs.length - 1] = true;   // 방금 추가한 행은 펼쳐서 바로 입력
        _markDirty(); window._docRender();
    };
    window._docOpticalClearAll = function (formId) {
        var d = _docData(formId);
        var n = (d.opticalLogs || []).length;
        if (!n) return;
        if (!confirm(_t('이 회차의 광학 측정 이력 ' + n + '건을 전부 지웁니다(NAS 원본 파일은 그대로 둡니다). 되돌릴 수 없습니다.',
                        'Delete all ' + n + ' optical records for this round? NAS files are kept.'))) return;
        d.opticalLogs = [];
        _markDirty(); window._docRender();
    };
    window._docOpticalToggleDetail = function (idx) {
        window._docState.opticalExpand = window._docState.opticalExpand || {};
        window._docState.opticalExpand[idx] = !window._docState.opticalExpand[idx];
        window._docRender();
    };
    // ⚡ 9포인트·R/G/B 칸은 **전체 다시 그리지 않는다** — 타이핑 중 포커스가 날아간다(다른 수동
    //    입력칸들과 같은 원칙). 값만 저장하고 Uniformity/Gamut 표시만 직접 고쳐 칠한다.
    window._docOpticalRepaint = function (idx) {
        var d = _docData(window._docState.formId);
        var row = (d.opticalLogs || [])[idx]; if (!row) return;
        var uni = _opticalUniformity(row.points);
        var gam = _opticalGamut(row.primaries);
        var uEl = document.getElementById('opt-uni-' + idx);
        if (uEl) uEl.innerHTML = (uni ? uni.pct + '%' : '-') + _opticalBadgeHtml(_opticalSpecCheck('Uniformity(%)', uni ? uni.pct : null));
        var gEl = document.getElementById('opt-gamut-' + idx);
        if (gEl) {
            gEl.innerHTML = (gam ? gam.pct + '%' : '-') + _opticalBadgeHtml(_opticalSpecCheck('Color Gamut', gam ? gam.pct : null));
            // ⚠️ 텍스트만 고치면 안 된다 — 처음 렌더 때 gam 이 null 이었으면 onclick 자체가 안 달려
            //    있어서, 타이핑으로 방금 완성됐는데도 클릭이 안 먹는 채로 남는다.
            if (gam) {
                gEl.style.cursor = 'pointer'; gEl.style.color = '#1971c2'; gEl.style.textDecoration = 'underline';
                gEl.title = _t('클릭하면 CIE1931 그래프', 'Click for CIE1931 chart');
                gEl.onclick = function () { window._docOpticalShowCIE(window._docState.formId, idx); };
            } else {
                gEl.style.cursor = ''; gEl.style.color = ''; gEl.style.textDecoration = ''; gEl.title = ''; gEl.onclick = null;
            }
        }
    };

    // ── 🎨 CIE1931 크로마시티 팝업 — Color Gamut 값을 누르면 측정 삼각형 vs NTSC(1953) 를 그린다 ──
    //    ⚠️ Delta E·SPD 등은 안 옮긴다(여긴 "이 샘플의 색재현율이 어떤 모양인가"만 보여주는 자리).
    //    스펙트럼 궤적(물리 상수, CIE1931)은 색 공간을 보여주는 배경선이라 그대로 재사용했다.
    var DOC_SPECTRUM_LOCUS = [
        { x: 0.1741, y: 0.0050 }, { x: 0.1440, y: 0.0297 }, { x: 0.1096, y: 0.0868 }, { x: 0.0687, y: 0.2007 },
        { x: 0.0235, y: 0.4127 }, { x: 0.0039, y: 0.6548 }, { x: 0.0743, y: 0.8338 }, { x: 0.1540, y: 0.8059 },
        { x: 0.2296, y: 0.7543 }, { x: 0.3016, y: 0.6885 }, { x: 0.3731, y: 0.6058 }, { x: 0.4441, y: 0.5152 },
        { x: 0.5125, y: 0.4866 }, { x: 0.5752, y: 0.4242 }, { x: 0.6270, y: 0.3725 }, { x: 0.6658, y: 0.3340 },
        { x: 0.6915, y: 0.3083 }, { x: 0.7079, y: 0.2920 }, { x: 0.7230, y: 0.2770 }, { x: 0.7300, y: 0.2700 },
        { x: 0.7347, y: 0.2653 }, { x: 0.1741, y: 0.0050 }
    ];
    window._docOpticalShowCIE = function (formId, idx) {
        var d = _docData(formId);
        var row = (d.opticalLogs || [])[idx]; if (!row) return;
        var gam = _opticalGamut(row.primaries);
        var ov = document.getElementById('doccie-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'doccie-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9550; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="doccie-box" style="pointer-events:all; position:fixed; left:50%; top:8%;'
                + ' transform:translateX(-50%); width:min(560px,94vw); max-height:86vh; display:flex; flex-direction:column;'
                + ' background:#fff; border:1px solid #a3d9e0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden;">'
                + '<div id="doccie-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between;'
                + ' padding:9px 12px; background:#e0f5f7; border-bottom:1px solid #a3d9e0; color:#00707d; font-weight:bold; font-size:13px; cursor:grab;">'
                + '<span id="doccie-title"></span>'
                + '<button onclick="document.getElementById(\'doccie-overlay\').style.display=\'none\'" style="background:var(--modal-icon-bg);'
                + ' border:1px solid var(--modal-icon-border); color:var(--modal-icon-text); border-radius:6px; font-size:16px;'
                + ' cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div style="flex:1; min-height:0; overflow:auto; padding:12px; text-align:center;">'
                + '<canvas id="doccie-canvas" width="480" height="440" style="max-width:100%; background:#fff; border:1px solid #e9ecef; border-radius:6px;"></canvas>'
                + '<div id="doccie-note" style="margin-top:8px; font-size:11.5px; color:#555; text-align:left;"></div>'
                + '</div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('doccie-box', 'doccie-head'); } catch (e) { /* 〃 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('doccie-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('doccie-overlay'); } catch (e) { /* 〃 */ } }
        document.getElementById('doccie-title').textContent =
            '🎨 CIE 1931 — ' + _t('색재현율', 'Color Gamut') + (row.barcode ? ' (' + row.barcode + ')' : '');
        document.getElementById('doccie-note').innerHTML = gam
            ? _esc(_t('측정 삼각형 넓이 ' + gam.area.toFixed(4) + ' ÷ NTSC(1953) 표준 ' + _NTSC53_AREA.toFixed(4)
                      + ' × 100 = ', 'Measured area ' + gam.area.toFixed(4) + ' ÷ NTSC(1953) standard ' + _NTSC53_AREA.toFixed(4) + ' × 100 = '))
              + '<b>' + gam.pct + '% NTSC</b>'
            : _esc(_t('R/G/B 삼원색 좌표를 전부 입력해야 그려집니다.', 'Enter all R/G/B primary coordinates to draw.'));
        _docCieDraw(row.primaries, gam);
    };
    var _docCieDraw = function (prim, gam) {
        var cv = document.getElementById('doccie-canvas'); if (!cv) return;
        var ctx = cv.getContext('2d'), w = cv.width, h = cv.height, margin = 40;
        ctx.clearRect(0, 0, w, h);
        var toX = function (x) { return margin + (x / 0.8) * (w - 2 * margin); };
        var toY = function (y) { return h - margin - (y / 0.9) * (h - 2 * margin); };
        // 축 + 격자
        ctx.strokeStyle = '#e9ecef'; ctx.lineWidth = 1; ctx.font = '10px sans-serif'; ctx.fillStyle = '#868e96';
        for (var gx = 0; gx <= 0.8; gx += 0.1) {
            ctx.beginPath(); ctx.moveTo(toX(gx), toY(0)); ctx.lineTo(toX(gx), toY(0.9)); ctx.stroke();
            ctx.fillText(gx.toFixed(1), toX(gx) - 8, h - margin + 14);
        }
        for (var gy = 0; gy <= 0.9; gy += 0.1) {
            ctx.beginPath(); ctx.moveTo(toX(0), toY(gy)); ctx.lineTo(toX(0.8), toY(gy)); ctx.stroke();
            ctx.fillText(gy.toFixed(1), margin - 26, toY(gy) + 3);
        }
        // CIE1931 스펙트럼 궤적(배경 윤곽선)
        ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 1.2; ctx.beginPath();
        DOC_SPECTRUM_LOCUS.forEach(function (p, i) { var fn = i === 0 ? 'moveTo' : 'lineTo'; ctx[fn](toX(p.x), toY(p.y)); });
        ctx.stroke();
        var drawTri = function (p, color, label, dashed) {
            ctx.beginPath(); ctx.moveTo(toX(p.Rx), toY(p.Ry)); ctx.lineTo(toX(p.Gx), toY(p.Gy));
            ctx.lineTo(toX(p.Bx), toY(p.By)); ctx.closePath();
            ctx.strokeStyle = color; ctx.lineWidth = dashed ? 2 : 1.8;
            if (dashed) ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
            ctx.stroke(); ctx.setLineDash([]);
            [['R', p.Rx, p.Ry], ['G', p.Gx, p.Gy], ['B', p.Bx, p.By]].forEach(function (v) {
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(toX(v[1]), toY(v[2]), 3, 0, 2 * Math.PI); ctx.fill();
            });
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = color; ctx.fillText(label, toX(p.Rx) + 5, toY(p.Ry) - 5);
        };
        drawTri(window.DOC_NTSC1953, '#dc2626', 'NTSC(1953)', true);
        if (gam) drawTri(prim, '#1971c2', _t('측정', 'Measured'), false);
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
        // 🏷 모델(제품구분자) 바 — 모델을 하나도 안 늘린 프로젝트는 숨긴다(BOM·Customer SPEC 과 같은 규칙).
        var _docUnits = window.getMcUnits ? window.getMcUnits() : [];
        if (_docUnits.length) {
            var _docUnitCur = window.mcActiveUnit || _docUnits[0];
            th += '<span style="display:inline-block; width:1px; height:16px; background:#ddd; margin:0 8px;"></span>'
                + '<button class="unit-cycle-btn" onclick="window.docCycleUnit()" title="'
                + _esc(_t('클릭할 때마다 다음 모델로 전환 — 모델마다 문서가 따로입니다', 'Click to switch to the next model — each model keeps its own documents')) + '"'
                + ' style="padding:6px 10px; min-width:auto; border:1px solid #00707d; border-radius:5px; cursor:pointer;'
                + ' font-size:12px; font-weight:bold; background:#00707d; color:#fff; flex-shrink:0;">'
                + _esc(_docUnitCur) + '</button>';
        }
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

        // 🔘 [2026-11-12 5차 요청] 접기/펼치기 버튼은 **한 스타일**만 쓴다(삼각형·폰트 크기가
        //    섹션 제목용과 시트 제목용에서 갈라지지 않게 — 작은 쪽으로 통일).
        var _COLLAPSE_BTN_STYLE = 'padding:3px 9px; font-size:11px; cursor:pointer;'
            + ' border:1px solid #a3d9e0; border-radius:5px; font-weight:bold; background:#fff; color:#00707d;'
            + ' flex-shrink:0;';
        form.sections.forEach(function (s) {
            // 📂 [2026-11-12 4차 요청] 섹션 제목(.doc-sec) 전부에 접기/펴기 버튼을 오른쪽 정렬로
            //    단다(사용자: "하늘색 박스 전부"). kind 마다 내용 모양이 달라 **통째로 감싸는 div
            //    하나**만 display:none 으로 접는다 — kind별 분기 코드는 안 건드린다.
            //    ⚠️ [2026-11-12 5차] 'check'(SPL Check sheet)는 제목 줄 자체를 **안 그린다** —
            //    시트마다 이미 제 접기 버튼이 있어 위에 한 겹 더 두면 군더더기다(사용자 지시).
            var secCollapsed = !!(window._docState.secCollapsed && window._docState.secCollapsed[s.title]);
            if (s.kind !== 'cover' && s.kind !== 'check') {
                h += '<div class="doc-sec" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">'
                   + '<span>' + _esc(s.title) + '</span>'
                   + '<button class="doc-noprint" onclick="window._docToggleSectionCollapse(\''
                   + _esc(s.title).replace(/'/g, "\\'") + '\')" style="' + _COLLAPSE_BTN_STYLE + '">'
                   + (secCollapsed ? '▶ ' + _esc(_t('펼치기', 'Expand')) : '▼ ' + _esc(_t('접기', 'Collapse'))) + '</button>'
                   + '</div>';
            }
            h += '<div class="doc-sec-wrap"' + (secCollapsed ? ' style="display:none;"' : '') + '>';
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
                var hideNA = window._docState.hideNA !== false;
                // 🗑️ [2026-11-12 5차 요청] "SPL Check sheet" 제목 줄은 완전히 없앴다(위에서
                //    kind==='check' 를 건너뛴다) — 시트 헤더 버튼이 접기/펼치기1(점검요청만)/
                //    펼치기2(전체)를 전부 맡는다. hideNA 는 '전체' 상태에서만 뜻이 있고 그 아래
                //    '🙈 N건 접힘 · 펴기' 링크로 계속 켜고 끌 수 있다.
                h += '</table>';
                sheets.forEach(function (sh) {
                    var itemsAll = _sheetItems(sh, form.id);
                    // 📂 [2026-11-12 5차 요청] 시트 헤더 버튼 하나가 3단을 순환한다:
                    //    접기 → 펼치기1(점검요청 켠 것만) → 펼치기2(전체, 해당없음은 기존처럼 접음) → 접기…
                    var state = (window._docState.chkSheetState && window._docState.chkSheetState[sh.key]) || 'all';
                    var items = itemsAll, naCount = 0, reqCount = 0;
                    if (state === 'req') {
                        items = itemsAll.filter(function (it) {
                            var hit = _docData(form.id).fields['chk|' + sh.key + '|' + it.id + '|점검요청'] === 'O';
                            if (hit) reqCount++;
                            return hit;
                        });
                    } else if (state === 'all' && hideNA) {
                        items = itemsAll.filter(function (it) {
                            if (RES_GROUPS.indexOf(it.g) >= 0) return true;
                            if (_docData(form.id).fields['chk|' + sh.key + '|' + it.id + '|해당없음'] === 'O') {
                                naCount++; return false;
                            }
                            return true;
                        });
                    }
                    var arrow = state === 'collapsed' ? '▶' : (state === 'req' ? '▼' : '▲');
                    var label = state === 'collapsed' ? _t('펼치기', 'Expand')
                              : (state === 'req' ? _t('전체 보기', 'Show all') : _t('접기', 'Collapse'));
                    var badge = state === 'collapsed' ? '(' + itemsAll.length + _t('개 항목', ' items') + ')'
                              : (state === 'req' ? '(' + reqCount + '/' + itemsAll.length + _t('개 항목', ' items') + ')' : '');
                    h += '<div class="doc-sec" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">'
                       + '<span>' + _esc(sh.key) + (badge ? '<span class="doc-noprint" style="font-weight:normal;'
                           + ' color:#868e96; margin-left:8px;">' + _esc(badge) + '</span>' : '')
                       + '</span>'
                       + '<button class="doc-noprint" onclick="window._docToggleSheetCollapse(\''
                       + _esc(sh.key).replace(/'/g, "\\'") + '\')" style="' + _COLLAPSE_BTN_STYLE + '">'
                       + arrow + ' ' + _esc(label) + '</button>'
                       + '</div>';
                    if (state === 'collapsed') return;
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
                           + (state === 'req' ? _esc(_t('‘점검요청’ 으로 표시된 항목이 없습니다.', 'No items requested.'))
                              : naCount ? _esc(_t('이 장은 전부 ‘해당없음’ 으로 접혀 있습니다.', 'All items are N/A (hidden).'))
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
                                        + (state === 'req' ? '' :
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
            } else if (s.kind === 'labelitems') {
                // 🏷 [2026-11-12] 라벨 목록 — 개수가 모델마다 다르다(실측 3~5개) → 'check' kind 와
                //    같은 add/del-row 로 받는다. 코드 옆 🔎 는 C:\SAP_DMS\원자재승인원 을 파일명으로
                //    훑는 라우트(`/sap-label-search`)를 부른다(그 폴더는 이름 규칙이 들쭉날쭉해서
                //    6자리 코드가 파일명 어딘가에 있다는 것만 믿고 찾는다).
                // 🖼 [2026-11-12 2차] 원본 문서는 왼쪽 큰 칸에 **라벨 도안 이미지**가 박혀 있다
                //    (실측: 승인원 엑셀 안에 PNG/JPEG 로 그대로 들어있다). "찾기" 결과에서 미리보기
                //    썸네일을 펼쳐 사람이 하나 고르면 그 즉시 저장된다.
                //    ⚠️⚠️ [사용자 지적] 라벨 도안은 **라벨품목코드가 주인**이지 이 프로젝트 것이 아니다
                //    — 같은 코드(예: 124291)를 다른 프로젝트도 쓸 수 있다. 그래서 프로젝트 폴더
                //    (`DOCUMENT/<프로젝트>/...`)가 아니라 **공용 라이브러리**(`라벨도안/<코드>.<ext>`,
                //    PARTS/PANEL 과 같은 성격의 공용 폴더)에 코드 하나당 파일 하나로 둔다 — 한 번
                //    찾아 저장하면 **다른 프로젝트에서도 같은 코드면 바로 보인다**(재검색 불필요).
                //    ⚠️ 한 파일에 로고·치수도면 등 10개 넘게 섞여 있어 자동으로 고르지 않는다.
                var litems = _docData(form.id).labelItems = _docData(form.id).labelItems || [];
                if (window._docLabelArtIndex === null && !window._docLabelArtLoading
                    && (Date.now() - window._docLabelArtLoadFailedAt) > 5000) window._docLabelArtLoad();
                // ⚠️⚠️ [2026-11-13, 사용자 신고 "붉은색 표시 항목들이 열 너비에 맞춰지지 않고 넘침"] 이
                //    표가 쓰던 공용 `<table class="doc-t">`(고정폭 아님, auto layout)는 셀 **내용**이
                //    길면 그 칸을 밀어 열 폭이 흐트러진다(폭 지정은 그냥 "희망값"일 뿐이었다) — 기재내용
                //    글상자·긴 표시 목록이 들어오면서 실제로 넘쳤다. **이 표만** `table-layout:fixed`
                //    (전체 % 합 100) 로 바꿔 셀 내용이 아무리 길어도 열 폭 자체는 절대 안 바뀌게 한다
                //    (대신 칸 안에서 줄바꿈·세로로만 늘어난다 — 넘치지 않는다).
                h += '</table><table class="doc-t" style="table-layout:fixed; width:100%;">'
                   + '<tr><th class="doc-noprint" style="width:32%;">' + _esc(_t('라벨 도안', 'Artwork')) + '</th>'
                   + '<th style="width:10%;">' + _esc(_t('라벨규격', 'Size')) + '</th>'
                   + '<th style="width:16%;">' + _esc(_t('라벨품목코드', 'Code')) + '</th>'
                   + '<th style="width:10%;">' + _esc(_t('부착위치', 'Position')) + '</th>'
                   + '<th style="width:28%;">' + _esc(_t('비고', 'Note')) + '</th>'
                   + '<th class="doc-noprint" style="width:4%;"></th></tr>';
                if (!litems.length) {
                    h += '<tr><td colspan="6" style="color:#868e96;">'
                       + _esc(_t('아직 라벨이 없습니다 — 아래 [＋ 라벨 추가]를 누르거나 모델명세서_라벨 엑셀을 불러오세요.',
                                 'No labels yet — add one or import the label spec sheet.')) + '</td></tr>';
                }
                litems.forEach(function (it, i) {
                    var found = window._docLabelFindResult && window._docLabelFindResult[form.id + '|' + i];
                    var itCode = String(it.code || '').trim();
                    var artFile = (window._docLabelArtIndex && itCode) ? window._docLabelArtIndex[itCode] : null;
                    // ⚠️ [2026-11-13] 비고 열에서도 표시 목록을 보여주려면 artFile 유무와 상관없이 필요하다
                    //    — if/else 안에서만 선언하면 도안 없는 줄에선 `notes` 가 비어 쓰레기값(undefined).
                    if (itCode && window._docLabelNotesCache[itCode] === undefined) window._docLabelNotesLoad(itCode);
                    var notes = (itCode && window._docLabelNotesCache[itCode]) || [];
                    var marks = (itCode && window._docLabelMarksCache[itCode]) || [];
                    var boxes = (itCode && window._docLabelBoxesCache[itCode]) || [];
                    if (window._docCertMarkIndex === null && !window._docCertMarkLoading
                        && (Date.now() - window._docCertMarkLoadFailedAt) > 5000) window._docCertMarkLoad();
                    var artCell;
                    // 📤 [2026-11-13, 사용자 요청] "PPT 등으로 완성한 이미지를 바로 올릴 수 있나" — 코드만
                    //    있으면 SAP 검색 없이도 로컬 파일을 바로 공용 도안으로 올린다(크기·회전과 같이
                    //    `_docLabelArtUploadPick` 한 곳).
                    var uploadLink = '<a href="#" onclick="window._docLabelArtUploadPick(\'' + _esc(itCode)
                        + '\');return false;" class="doc-noprint" style="color:#7a5210; font-size:11px;">📤 '
                        + _esc(_t('직접 올리기', 'Upload file')) + '</a>';
                    // 📋 [2026-11-13, 사용자 요청] "빈 라벨지에 기입해야 하는 내용을 도표 형태로" — 고정
                    //    항목(Part No 등)을 펼쳐서 입력하는 토글. `fkey` 는 펼침 상태만의 열쇠라(저장 안 함)
                    //    이름·순서가 바뀌어도 무방 — 값은 `it.fields`/`it.fieldsCustom` 에 저장된다.
                    var fkey = form.id + '|' + i;
                    var fieldsOpen = !!window._docLabelFieldsOpen[fkey];
                    var fieldsFilled = Object.keys(it.fields || {}).some(function (k) { return it.fields[k]; })
                        || (it.fieldsCustom || []).some(function (c) { return c.label || c.value; });
                    var fieldsLink = '<a href="#" onclick="window._docLabelFieldsToggle(\'' + _esc(fkey)
                        + '\');return false;" class="doc-noprint" style="color:#7a5210; font-size:11px;">📋 '
                        + _esc(_t('기재내용', 'Fill-in content')) + (fieldsOpen ? ' ▲' : (fieldsFilled ? ' ●' : ' ▼')) + '</a>';
                    if (window._docLabelArtIndex === null) {
                        artCell = '<div style="color:#adb5bd; font-size:10.5px;">' + _esc(_t('불러오는 중…', 'loading…')) + '</div>';
                    } else if (artFile) {
                        // 🖼️🔍 [2026-11-12 11차, 사용자 요청 "문서 기본 양식 반영해서 수정해줘"] 실제
                        //    문서(스크린샷)는 도안 칸이 **작고** 규격/코드/부착위치가 좁은 글자 칸으로
                        //    옆에 나란하다 — 5배로 키운 이미지를 이 표 안에 직접 넣었더니 그 열 폭이
                        //    통째로 깨졌다(사용자 신고: "이미지는 커졌는데 도표는 조정되지 않음").
                        //    표시·자르기·크기조절(모달 전용)은 그대로 **별도 모달**(`_docLabelArtModalOpen`)
                        //    에서만 하되, ⚠️ [2026-11-13, 사용자 요청] 표 썸네일 자체의 **보이는 크기**는
                        //    여기서도 끌어서 조절할 수 있다(`thumbSize`, 모달 `size` 와는 별도 칸) — 가로는
                        //    430px 로 묶어 열 폭(450px)을 못 넘게 한다(11차 사고 재발 방지).
                        var thumbSz = window._docLabelThumbSizeCache && window._docLabelThumbSizeCache[itCode];
                        // ⚠️ [2026-11-13] `max-width:100%` 는 **항상** 둔다 — 고정 폭(`thumbSz`)을 골라도
                        //    표 칸 자체가 더 좁으면(예: 좁은 창) 그 안으로 다시 줄어들어야 넘치지 않는다.
                        var thumbImgStyle = 'border:1px solid #dee2e6; border-radius:3px; display:block; margin:0 auto; cursor:pointer; max-width:100%;'
                            + ((thumbSz && thumbSz.w && thumbSz.h)
                               ? (' width:' + thumbSz.w + 'px; height:' + thumbSz.h + 'px; max-height:none;')
                               : ' max-height:400px;');
                        // 🔤 [2026-11-13, 사용자 요청] "모달에서 수정한 내용을 도표에서도 실시간으로" —
                        //    표 썸네일에도 **같은 마커**(보기 전용, 끌기는 모달에서만)를 얹는다. 모달에서
                        //    표시를 고치면 `_docLabelRefresh()` 가 이 표도 같이 다시 그려서 따로 손댈 게 없다.
                        artCell = '<div style="position:relative; display:inline-block;">'
                                + '<img data-thumb-img="' + _esc(itCode) + '" src="' + _esc(_docLabelArtSrc(itCode, artFile))
                                + '" style="' + thumbImgStyle + '"'
                                + ' onclick="window._docLabelArtModalOpen(\'' + _esc(form.id) + '\',' + i + ');return false;">'
                                + _docLabelNoteMarkersHtml(notes, false)
                                + _docLabelMarkMarkersHtml(marks, false, itCode)
                                + _docLabelBoxMarkersHtml(boxes, false, itCode)
                                + '<div data-thumb-resize="' + _esc(itCode) + '" title="' + _esc(_t('끌어서 크기 조절', 'drag to resize')) + '"'
                                + ' class="doc-noprint" style="position:absolute; right:2px; bottom:2px; width:13px; height:13px;'
                                + ' border-radius:3px; background:#1971c2; border:2px solid #fff; box-shadow:0 0 0 1px #1971c2;'
                                + ' cursor:nwse-resize; z-index:2;"></div></div>'
                                + '<div style="margin-top:3px;"><a href="#" onclick="window._docLabelArtModalOpen(\''
                                + _esc(form.id) + '\',' + i + ');return false;" style="color:#1971c2; font-weight:bold; font-size:11px;">🔍 '
                                + _esc(_t('크게 보기', 'View / edit')) + (notes.length ? ' (' + notes.length + ')' : '') + '</a>'
                                + (thumbSz ? ' · <a href="#" onclick="window._docLabelThumbSizeReset(\'' + _esc(itCode)
                                  + '\');return false;" class="doc-noprint" style="color:#495057; font-size:11px;">↺ '
                                  + _esc(_t('기본 크기', 'Reset size')) + '</a>' : '')
                                + ' · ' + uploadLink + ' · ' + fieldsLink + '</div>';
                    } else {
                        artCell = '<div style="width:100%; max-width:400px; height:300px; margin:0 auto; display:flex; align-items:center;'
                            + ' justify-content:center; background:#f8fbfb; border:1px dashed #cfe3e5; border-radius:4px;'
                            + ' box-sizing:border-box; color:#adb5bd; font-size:11px;">' + _esc(_t('도안 없음', 'no artwork')) + '</div>'
                            + '<div style="margin-top:3px;">' + uploadLink + ' · ' + fieldsLink + '</div>';
                    }
                    // 🔎 [2026-11-12 10차, 사용자 요청] "도안 찾기" 글자는 지우고 아이콘만 남긴다 —
                    //    같은 아이콘을 **규격 칸**에도 달아, 코드를 몰라도 규격(예: "75 X 70")만으로
                    //    찾을 수 있게 한다(서버가 파일명에서 공백 무시 부분일치로 찾는다).
                    var _findIconBtn = 'padding:3px 6px; font-size:12px; line-height:1; cursor:pointer;'
                        + ' border:1px solid #a3d9e0; border-radius:4px; background:#e0f5f7; color:#00707d;'
                        + ' font-weight:bold; vertical-align:middle;';
                    // ⚠️⚠️ [2026-11-13, 사용자 신고] input+button 을 `white-space:nowrap` 으로 한 줄에
                    //    묶었더니(고정 폭 76~86px + 버튼) 좁아진 열(10%) 을 넘쳤다 — `flex-wrap:wrap` 으로
                    //    바꿔 모자라면 버튼이 **다음 줄로** 내려가게 한다(열 폭 자체는 절대 안 넘친다).
                    h += '<tr>'
                       + '<td class="doc-noprint" style="text-align:center; vertical-align:middle; padding:5px;">' + artCell + '</td>'
                       + '<td><div style="display:flex; flex-wrap:wrap; align-items:center; gap:3px;">'
                       + '<input type="text" class="doc-in" data-doc-litem="' + i + '|size" value="' + _esc(it.size || '')
                       + '" placeholder="예: 75 X 70" style="font-size:11.5px; width:0; flex:1 1 56px; min-width:48px;">'
                       + '<button class="doc-noprint" title="' + _esc(_t('규격으로 도안 찾기', 'Find artwork by size')) + '"'
                       + ' onclick="window._docLabelFindBySize(\'' + _esc(form.id) + '\',' + i + ')" style="' + _findIconBtn + '">🔎</button></div>'
                       // 📋 [2026-11-13, 사용자 요청] "라벨품목코드 조회하면 SAP 내역을 표시" — 코드로
                       //    찾을 때 같이 받아온 SAP 자재내역(`it.sapDesc`, MAKTX)을 참고용으로 보여준다.
                       //    규격 칸을 자동으로 덮어쓰진 않는다(사람이 보고 직접 적는다).
                       + (it.sapDesc ? '<div class="doc-noprint" style="margin-top:3px; font-size:10px; color:#495057;'
                         + ' white-space:normal; word-break:break-all;" title="' + _esc(_t('SAP 자재내역', 'SAP material description'))
                         + '">🏭 ' + _esc(it.sapDesc) + '</div>' : '') + '</td>'
                       + '<td><div style="display:flex; flex-wrap:wrap; align-items:center; gap:3px;">'
                       + '<input type="text" class="doc-in" data-doc-litem="' + i + '|code"'
                       + ' value="' + _esc(it.code || '') + '" placeholder="예: 124291"'
                       + ' style="font-size:11.5px; width:0; flex:1 1 64px; min-width:52px;">'
                       + '<button class="doc-noprint" title="' + _esc(_t('코드로 도안 찾기', 'Find artwork by code')) + '"'
                       + ' onclick="window._docLabelFind(\'' + _esc(form.id) + '\',' + i + ')" style="' + _findIconBtn + '">🔎</button>'
                       // 🤖 [2026-11-13, 사용자 요청] "코드를 넣지 않는 경우는 AI 문답 창을 띄워서 찾도록 유도"
                       + (it.code ? '' : '<a href="#" onclick="window._docLabelAskAiCode(\'' + _esc(form.id) + '\',' + i
                         + ');return false;" class="doc-noprint" title="' + _esc(_t('AI 문답으로 코드 찾기', 'Ask AI to find the code'))
                         + '" style="' + _findIconBtn + '">🤖</a>')
                       + '</div></td>'
                       + '<td><input type="text" class="doc-in" data-doc-litem="' + i + '|position" value="'
                       + _esc(it.position || '') + '" placeholder="예: 제품 / C.T BOX" style="font-size:11.5px;"></td>'
                       // 📋 [2026-11-13, 사용자 요청] "비고 사용자 작성란은 아래로 이동" — 도안 위 표시
                       //    내용(읽기 전용 "1. 2. 3." 요약)을 **먼저**, 사람이 직접 쓰는 textarea 는 **그 아래**.
                       + '<td>' + (notes.length ? '<div class="doc-noprint" style="font-size:10.5px; color:#495057; text-align:left;'
                         + ' white-space:pre-line; margin-bottom:4px;">'
                         + notes.map(function (n, ni) { return (ni + 1) + '. ' + _esc(n.text); }).join('<br>') + '</div>' : '')
                       // ⚠️ [2026-11-13, 사용자 요청] 비고도 기재내용과 같은 이유로 textarea — 한 줄
                       //    `<input>` 은 Enter 로 줄을 못 나눈다.
                       + '<textarea class="doc-in" data-doc-litem="' + i + '|note" rows="2"'
                       + ' style="font-size:11.5px; width:100%; box-sizing:border-box; text-align:left; resize:vertical; font-family:inherit;">'
                       + _esc(it.note || '') + '</textarea>'
                       + '</td>'
                       + '<td class="doc-noprint"><a href="#" onclick="window._docLabelItemDel(\'' + _esc(form.id) + '\',' + i
                       + ');return false;" title="' + _esc(_t('이 라벨 빼기', 'remove')) + '" style="color:#b1432f;">✕</a></td>'
                       + '</tr>';
                    // 📋 [2026-11-13, 사용자 요청] 기재내용 표 — "found" 줄과 같은 colspan=6 펼침 줄.
                    //    ⚠️ 이 값들은 공용 도안과 달리 **이 라벨 한 장만의 값**이라 `it.fields`(이 labelItem)
                    //    에만 저장한다 — 같은 코드를 쓰는 다른 프로젝트·다른 줄과 섞이면 안 된다.
                    if (fieldsOpen) {
                        var fx = it.fields || {};
                        var fc = it.fieldsCustom || [];
                        h += '<tr><td colspan="6" class="doc-noprint" style="background:#f8fbfb; padding:8px 10px;">'
                           + '<table style="width:auto; border:none; border-collapse:collapse;">'
                           // ⚠️ [2026-11-13, 사용자 신고 "엔터 쳐도 줄바꿈 안 됨·왼쪽 정렬 안 됨"] 한 줄
                           //    `<input>`은 애초에 줄바꿈을 못 받는다(Enter 가 아무 일도 안 함) — 길게
                           //    쓰는 칸(Product Des. 등)은 `<textarea>` 로 바꿔 Enter 로 줄을 나눌 수
                           //    있게 하고 `text-align:left` 를 명시한다.
                           + LABEL_FIELD_CATALOG.map(function (f) {
                               return '<tr><td style="border:none; padding:2px 8px 2px 0; font-size:11.5px; white-space:nowrap; font-weight:bold; vertical-align:top;">'
                                   + _esc(f.label) + '</td><td style="border:none; padding:2px 0;">'
                                   + '<textarea class="doc-in" data-doc-lfield="' + i + '|' + f.key + '" rows="2"'
                                   + ' style="font-size:11.5px; width:280px; text-align:left; resize:vertical; font-family:inherit;">'
                                   + _esc(fx[f.key] || '') + '</textarea></td></tr>';
                           }).join('')
                           + fc.map(function (c, ci) {
                               return '<tr><td style="border:none; padding:2px 8px 2px 0; vertical-align:top;">'
                                   + '<input type="text" class="doc-in" data-doc-lfieldcl="' + i + '|' + ci + '" value="' + _esc(c.label || '')
                                   + '" placeholder="' + _esc(_t('항목명', 'Field name')) + '"'
                                   + ' style="font-size:11.5px; width:120px; font-weight:bold; text-align:left;"></td>'
                                   + '<td style="border:none; padding:2px 0;">'
                                   + '<textarea class="doc-in" data-doc-lfieldc="' + i + '|' + ci + '" rows="2"'
                                   + ' style="font-size:11.5px; width:260px; text-align:left; resize:vertical; font-family:inherit; display:inline-block; vertical-align:top;">'
                                   + _esc(c.value || '') + '</textarea>'
                                   + ' <a href="#" onclick="window._docLabelFieldDelCustom(\'' + _esc(form.id) + '\',' + i + ',' + ci
                                   + ');return false;" style="color:#b1432f;">✕</a></td></tr>';
                           }).join('')
                           + '</table><a href="#" onclick="window._docLabelFieldAddCustom(\'' + _esc(form.id) + '\',' + i + ');return false;"'
                           + ' style="color:#1971c2; font-size:11px; font-weight:bold;">＋ ' + _esc(_t('항목 추가', 'Add field')) + '</a>'
                           + '</td></tr>';
                    }
                    if (found) {
                        h += '<tr><td colspan="6" class="doc-noprint" style="font-size:11px; color:#495057;'
                           + ' background:#f8fbfb; padding:3px 8px;">' + found + '</td></tr>';
                    }
                });
                h += '</table><div class="doc-noprint" style="margin-top:6px; display:flex; align-items:center; gap:14px;">'
                   + '<a href="#" onclick="window._docLabelItemAdd(\'' + _esc(form.id) + '\');return false;"'
                   + ' style="color:#1971c2; font-size:11.5px; font-weight:bold;">＋ ' + _esc(_t('라벨 추가', 'Add label'))
                   + '</a>'
                   // 📐 [2026-11-13, 사용자 요청] 썸네일을 끌어서 늘일 때 비율을 지킬지 — 모달의 체크와
                   //    같은 전역 값을 공유한다(둘 다 같은 `_docLabelAspectLock` 을 본다).
                   + '<label style="font-size:11px; color:#495057; cursor:pointer; font-weight:normal;">'
                   + '<input type="checkbox" ' + (window._docLabelAspectLock ? 'checked' : '')
                   + ' onchange="window._docLabelAspectLock=this.checked;" style="vertical-align:middle; margin-right:3px;">'
                   + _esc(_t('도안 크기조절 비율 고정', 'Lock aspect ratio when resizing artwork')) + '</label>'
                   + '</div><table style="display:none;">';
            } else if (s.kind === 'labelcerts') {
                // 🏷 [2026-11-12] 인증(CE/FCC/UL…)·정격표시(Set/LED Rating SPEC…) — 실측 3개 파일
                //    전부 **'제품' 라벨 하나에만** 딸려 있었다. 묶는 열쇠를 따로 두지 않고 라벨
                //    목록의 '제품' 첫 줄(없으면 맨 앞 줄)을 **안내로만** 보여 준다 — 저장은 독립적이다.
                var lc = _docData(form.id).labelCerts = _docData(form.id).labelCerts || { certs: [], ratings: [] };
                var mainItem = (_docData(form.id).labelItems || []).filter(function (it) {
                    return /제품/.test(it.position || '');
                })[0] || (_docData(form.id).labelItems || [])[0];
                h += '<tr><td colspan="5" class="doc-noprint" style="font-size:11px; color:#868e96; padding:2px 0 6px;">'
                   + '🏷 ' + _esc(_t('적용 라벨: ', 'Applies to: '))
                   + (mainItem ? _esc((mainItem.size || '-') + ' / ' + (mainItem.code || '-') + ' (' + (mainItem.position || '-') + ')')
                               : _esc(_t('위 라벨 목록을 먼저 채워 주세요.', 'Add a label above first.')))
                   + '</td></tr>';
                h += '<tr><th colspan="5" style="text-align:left; background:none; border:none; font-weight:bold; padding:6px 0 2px;">'
                   + _esc(_t('인증 항목', 'Certifications')) + '</th></tr>';
                h += '<tr><th>' + _esc(_t('항목', 'Item')) + '</th><th style="width:60px;">Check</th>'
                   + '<th style="width:80px;">' + _esc(_t('인쇄 적용', 'Printed')) + '</th>'
                   + '<th style="width:110px;">' + _esc(_t('인쇄 구분', 'Print type')) + '</th>'
                   + '<th class="doc-noprint" style="width:40px;"></th></tr>';
                (lc.certs || []).forEach(function (r, i) {
                    h += '<tr>'
                       + '<td><input type="text" class="doc-in" data-doc-lcert="c|' + i + '|name" value="' + _esc(r.name || '')
                       + '" placeholder="예: CE" style="font-size:11.5px;"></td>'
                       + '<td style="text-align:center;"><span class="doc-chk' + (r.check === 'O' ? ' on' : '')
                       + '" data-doc-ltoggle="c|' + i + '|check" title="Check">' + (r.check === 'O' ? 'O' : 'X') + '</span></td>'
                       + '<td style="text-align:center;"><span class="doc-chk' + (r.print === 'O' ? ' on' : '')
                       + '" data-doc-ltoggle="c|' + i + '|print" title="' + _esc(_t('인쇄 적용', 'Printed')) + '">'
                       + (r.print === 'O' ? 'O' : 'X') + '</span></td>'
                       + '<td><input type="text" class="doc-in" data-doc-lcert="c|' + i + '|printType" value="'
                       + _esc(r.printType || '') + '" placeholder="예: 기본/코텍" style="font-size:11.5px;"></td>'
                       + '<td class="doc-noprint"><a href="#" onclick="window._docLabelCertDel(\'' + _esc(form.id)
                       + '\',\'c\',' + i + ');return false;" style="color:#b1432f;">✕</a></td></tr>';
                });
                h += '<tr><td colspan="5" class="doc-noprint"><a href="#" onclick="window._docLabelCertAdd(\''
                   + _esc(form.id) + '\',\'c\');return false;" style="color:#1971c2; font-size:11.5px; font-weight:bold;">＋ '
                   + _esc(_t('인증 항목 추가', 'Add cert')) + '</a></td></tr>';

                h += '<tr><th colspan="5" style="text-align:left; background:none; border:none; font-weight:bold; padding:10px 0 2px;">'
                   + _esc(_t('정격 표시', 'Rating spec')) + '</th></tr>';
                h += '<tr><th>' + _esc(_t('항목', 'Item')) + '</th><th colspan="2">' + _esc(_t('규격값', 'Spec')) + '</th>'
                   + '<th style="width:80px;">' + _esc(_t('인쇄 적용', 'Printed')) + '</th>'
                   + '<th class="doc-noprint" style="width:40px;"></th></tr>';
                (lc.ratings || []).forEach(function (r, i) {
                    h += '<tr>'
                       + '<td><input type="text" class="doc-in" data-doc-lcert="r|' + i + '|name" value="' + _esc(r.name || '')
                       + '" placeholder="예: Set Rating SPEC" style="font-size:11.5px;"></td>'
                       + '<td colspan="2"><input type="text" class="doc-in" data-doc-lcert="r|' + i + '|spec" value="'
                       + _esc(r.spec || '') + '" placeholder="예: DC 24V / 8A" style="font-size:11.5px;"></td>'
                       + '<td style="text-align:center;"><span class="doc-chk' + (r.print === 'O' ? ' on' : '')
                       + '" data-doc-ltoggle="r|' + i + '|print" title="' + _esc(_t('인쇄 적용', 'Printed')) + '">'
                       + (r.print === 'O' ? 'O' : 'X') + '</span></td>'
                       + '<td class="doc-noprint"><a href="#" onclick="window._docLabelCertDel(\'' + _esc(form.id)
                       + '\',\'r\',' + i + ');return false;" style="color:#b1432f;">✕</a></td></tr>';
                });
                h += '<tr><td colspan="5" class="doc-noprint"><a href="#" onclick="window._docLabelCertAdd(\''
                   + _esc(form.id) + '\',\'r\');return false;" style="color:#1971c2; font-size:11.5px; font-weight:bold;">＋ '
                   + _esc(_t('정격 항목 추가', 'Add rating')) + '</a></td></tr>';
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
                var optExpand = window._docState.opticalExpand || {};
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
                var baseCols = showAll ? 9 : 10;
                h += '<tr>' + (showAll ? '<th style="width:85px;">' + _esc(_t('회차', 'Round')) + '</th>' : '')
                   + '<th style="width:110px;">' + _esc(_t('바코드/라벨', 'Barcode/Label')) + '</th>'
                   + '<th style="width:110px;">' + _esc(_t('측정일시', 'Measured')) + '</th>'
                   + '<th>Native X / Y</th><th>Lv</th>'
                   + '<th style="width:60px;">' + _esc(_t('균일도', 'Uniform.')) + '</th>'
                   + '<th style="width:60px;">Gamut</th><th style="width:70px;">PQ</th>'
                   + '<th class="doc-noprint" style="width:50px;">📎</th>'
                   + (showAll ? '' : '<th class="doc-noprint" style="width:40px;"></th>'
                                   + '<th class="doc-noprint" style="width:36px;"></th>')
                   + '</tr>';
                if (!rowsToShow.length) {
                    h += '<tr><td colspan="' + baseCols + '" style="color:#868e96;">'
                       + _esc(_t('아직 측정 이력이 없습니다 — 아래 [📥 zip 가져오기] 또는 [➕ 직접 추가]를 눌러 주세요.',
                                 'No optical history yet — use [Import zip] or [Add manually] below.'))
                       + '</td></tr>';
                }
                rowsToShow.forEach(function (it, idx) {
                    var uni = _opticalUniformity(it.points);
                    var gam = (it.primaries) ? _opticalGamut(it.primaries) : null;
                    var gamPct = gam ? gam.pct : (it.gamutPct || '');
                    // 🔬 Customer SPEC 최소 기준과 대조 — 기준이 없거나 측정값이 없으면 배지를 안 띄운다.
                    var uniChk = _opticalSpecCheck('Uniformity(%)', uni ? uni.pct : null);
                    var gamChk = _opticalSpecCheck('Color Gamut', gamPct !== '' ? parseFloat(gamPct) : null);
                    var hasPQ26 = it.pqTotal > 0;
                    var pqOk = hasPQ26 ? it.pqFail === 0 : (it.pqManual === 'PASS');
                    var pqLabel = hasPQ26 ? (pqOk ? '✅ PASS' : '⚠️ ' + it.pqFail + '/' + it.pqTotal + ' FAIL')
                                : (it.pqManual || '-');
                    var pqColor = hasPQ26 ? (pqOk ? '#1f7a3d' : '#b1432f')
                                : (it.pqManual === 'PASS' ? '#1f7a3d' : it.pqManual === 'FAIL' ? '#b1432f' : '#868e96');
                    var tgt = (it.targetX && it.targetY)
                        ? _t('타겟', 'target') + ' X ' + it.targetX.min + '~' + it.targetX.max
                          + ' / Y ' + it.targetY.min + '~' + it.targetY.max
                        : '';
                    var expanded = !showAll && !!optExpand[idx];
                    h += '<tr>' + (showAll ? '<td>' + _esc(it.round) + '</td>' : '')
                       + '<td>' + _esc(it.barcode || it.label || '-') + (it.manual ? ' <span style="font-size:9px; color:#868e96;">('
                         + _esc(_t('수동', 'manual')) + ')</span>' : '') + '</td>'
                       + '<td style="font-size:11px;">' + _esc(it.startTime) + '</td>'
                       + '<td title="' + _esc(tgt) + '">' + _esc(it.nativeX) + ' / ' + _esc(it.nativeY) + '</td>'
                       + '<td>' + _esc(it.maxPwmLv) + (it.defaultPwmLv ? ' / ' + _esc(it.defaultPwmLv) : '') + '</td>'
                       + '<td id="opt-uni-' + idx + '">' + (uni ? uni.pct + '%' : '-') + _opticalBadgeHtml(uniChk) + '</td>'
                       + '<td id="opt-gamut-' + idx + '"' + (gam ? ' style="cursor:pointer; color:#1971c2; text-decoration:underline;"'
                         + ' title="' + _esc(_t('클릭하면 CIE1931 그래프', 'Click for CIE1931 chart')) + '"'
                         + ' onclick="window._docOpticalShowCIE(\'' + _esc(form.id) + '\',' + idx + ')"' : '') + '>'
                       + (gamPct !== '' && gamPct != null ? gamPct + '%' : '-') + _opticalBadgeHtml(gamChk) + '</td>'
                       + '<td style="color:' + pqColor + '; font-weight:bold; font-size:11px;">' + _esc(pqLabel) + '</td>'
                       + '<td class="doc-noprint" style="text-align:center;">'
                       + (it.files || []).map(function (fl) {
                           return '<a href="' + _esc(_attUrl(fl)) + '" target="_blank" title="' + _esc(fl.name) + '">'
                               + (fl.kind === 'log' ? '🧾' : '📄') + '</a>';
                       }).join(' ')
                       + '</td>';
                    if (!showAll) {
                        h += '<td class="doc-noprint" style="text-align:center;">'
                           + '<a href="#" onclick="window._docOpticalToggleDetail(' + idx + ');return false;" style="color:#555; font-size:11px;">'
                           + (expanded ? '🔼' : '🔽') + '</a></td>'
                           + '<td class="doc-noprint" style="text-align:center;">'
                           + '<a href="#" onclick="window._docOpticalRemove(\'' + _esc(form.id) + '\',' + idx + ');return false;"'
                           + ' style="color:#b1432f; font-size:11px;">' + _esc(_t('삭제', 'del')) + '</a></td>';
                    }
                    h += '</tr>';
                    if (expanded) {
                        var pts = it.points || [];
                        var prim = it.primaries || {};
                        var qc = [
                            ['barcode', _t('바코드/라벨', 'Barcode'), it.barcode], ['label', _t('라벨', 'Label'), it.label],
                            ['dimming', 'Dimming', it.dimming], ['grade', _t('등급', 'Grade'), it.grade],
                            ['category', _t('구분', 'Category'), it.category], ['aging', 'Aging', it.aging]
                        ].map(function (f) {
                            return '<label style="display:flex; flex-direction:column; gap:2px; font-size:10.5px; color:#555;">' + _esc(f[1])
                                 + '<input type="text" value="' + _esc(f[2] || '') + '" data-doc-opt="' + idx + '|' + f[0] + '"'
                                 + ' style="padding:3px 5px; border:1px solid #ddd; border-radius:4px; font-size:11.5px; width:90px;"></label>';
                        }).join('');
                        var ptInputs = '';
                        for (var pI = 0; pI < 9; pI++) {
                            ptInputs += '<input type="text" value="' + _esc(pts[pI] || '') + '" placeholder="' + (pI + 1) + '"'
                                + ' data-doc-opt="' + idx + '|points|' + pI + '"'
                                + ' style="width:48px; padding:3px 4px; border:1px solid #ddd; border-radius:4px; font-size:11px; text-align:center;">';
                        }
                        var rgbInputs = ['R', 'G', 'B'].map(function (ch) {
                            return '<span style="font-size:10.5px; color:#555; margin-right:4px;">' + ch + '</span>'
                                 + '<input type="text" value="' + _esc(prim[ch + 'x'] || '') + '" placeholder="x"'
                                 + ' data-doc-opt="' + idx + '|primaries|' + ch + 'x"'
                                 + ' style="width:56px; padding:3px 4px; border:1px solid #ddd; border-radius:4px; font-size:11px; margin-right:3px;">'
                                 + '<input type="text" value="' + _esc(prim[ch + 'y'] || '') + '" placeholder="y"'
                                 + ' data-doc-opt="' + idx + '|primaries|' + ch + 'y"'
                                 + ' style="width:56px; padding:3px 4px; border:1px solid #ddd; border-radius:4px; font-size:11px; margin-right:10px;">';
                        }).join('');
                        var pqSelect = hasPQ26 ? '' :
                            '<label style="display:flex; flex-direction:column; gap:2px; font-size:10.5px; color:#555;">PQ ('
                            + _esc(_t('26포인트 원본 없음 — 직접 입력', 'no 26-pt data — enter manually')) + ')'
                            + '<select data-doc-opt="' + idx + '|pqManual" style="padding:3px 5px; border:1px solid #ddd; border-radius:4px; font-size:11.5px; width:90px;">'
                            + ['', 'PASS', 'FAIL'].map(function (v) {
                                return '<option value="' + v + '"' + (it.pqManual === v ? ' selected' : '') + '>' + (v || '-') + '</option>';
                            }).join('') + '</select></label>';
                        h += '<tr><td colspan="' + baseCols + '" style="background:#fafbfc; padding:10px 14px;">'
                           + '<div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:8px;">' + qc + pqSelect + '</div>'
                           + '<div style="font-size:10.5px; color:#555; margin-bottom:4px;">' + _esc(_t('균일도용 9포인트 Lv(3×3, 5번=중앙)', '9-point Lv for uniformity (5=center)')) + '</div>'
                           + '<div style="display:grid; grid-template-columns:repeat(3,52px); gap:3px; margin-bottom:10px;">' + ptInputs + '</div>'
                           + '<div style="font-size:10.5px; color:#555; margin-bottom:4px;">' + _esc(_t('색재현율용 R/G/B 삼원색 좌표(x,y)', 'R/G/B primary coordinates (x,y) for gamut')) + '</div>'
                           + '<div>' + rgbInputs + '</div>'
                           + '</td></tr>';
                    }
                });
                h += '</table>';
                if (showAll) {
                    var byRound = {};
                    rowsToShow.forEach(function (it) { (byRound[it.round] = byRound[it.round] || []).push(it); });
                    h += '<div class="doc-noprint" style="display:flex; flex-wrap:wrap; gap:8px; margin:6px 0;">';
                    _docRounds().forEach(function (rd) {
                        var arr = byRound[rd]; if (!arr || !arr.length) return;
                        var passN = arr.filter(function (it) { return it.pqTotal > 0 ? it.pqFail === 0 : it.pqManual === 'PASS'; }).length;
                        var avgLv = (arr.reduce(function (s2, it) { return s2 + (parseFloat(it.maxPwmLv) || 0); }, 0) / arr.length).toFixed(2);
                        var gamVals = arr.map(function (it) { var g = it.primaries ? _opticalGamut(it.primaries) : null; return g ? g.pct : parseFloat(it.gamutPct); })
                            .filter(function (v) { return !isNaN(v); });
                        var avgGamut = gamVals.length ? (gamVals.reduce(function (a, b) { return a + b; }, 0) / gamVals.length).toFixed(2) : '-';
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
                   + _esc(_t('Gamma 리포트 zip 가져오기', 'Import Gamma report zip')) + '</button>';
                if (!showAll) {
                    h += '<button onclick="window._docOpticalAddManual(\'' + _esc(form.id) + '\')" style="padding:4px 10px; font-size:11.5px;'
                       + ' cursor:pointer; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; font-weight:bold;">➕ '
                       + _esc(_t('직접 추가', 'Add manually')) + '</button>'
                       + '<button onclick="window._docOpticalClearAll(\'' + _esc(form.id) + '\')" style="padding:4px 10px; font-size:11.5px;'
                       + ' cursor:pointer; border:1px solid #f0b4ad; background:#fdecea; color:#a3281c; border-radius:5px; font-weight:bold;">🗑 '
                       + _esc(_t('전체 삭제', 'Delete all')) + '</button>';
                }
                h += '<button onclick="window._docOpticalToggleAll()" style="padding:4px 10px; font-size:11.5px;'
                   + ' cursor:pointer; border:1px solid #cfe3e5; background:#fff; color:#555; border-radius:5px; font-weight:bold;">'
                   + (showAll ? '📦 ' + _esc(_t('이 회차만', 'This round only')) : '📈 ' + _esc(_t('전체 회차 보기', 'All rounds'))) + '</button>'
                   + '<span style="font-size:11px; color:#868e96;">'
                   + _esc(_t('zip = Final_Report.txt 26포인트 PQ 자동, 직접 추가 = 균일도·색재현율만(PQ는 직접 입력).',
                             'zip = 26-pt PQ auto; manual = uniformity/gamut only (PQ entered by hand).')) + '</span></div>'
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
            h += '</div>'; // .doc-sec-wrap 닫기 — 섹션 전체 접기/펴기가 이 한 줄에 달려 있다
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
                return;
            }
            // 🔬 광학 측정 이력 수동 칸 — `<행번호>|<칸>` 또는 `<행번호>|points|<0~8>` 또는
            //    `<행번호>|primaries|<Rx 등>`. 전체 다시 그리지 않는다(타이핑 중 포커스 보존).
            var ok = el.getAttribute('data-doc-opt');
            if (ok) {
                var op = ok.split('|');
                var od = _docData(form.id), olist = od.opticalLogs || [], orow = olist[Number(op[0])];
                if (orow) {
                    if (op[1] === 'points') { orow.points = orow.points || []; orow.points[Number(op[2])] = el.value; }
                    else if (op[1] === 'primaries') { orow.primaries = orow.primaries || {}; orow.primaries[op[2]] = el.value; }
                    else orow[op[1]] = el.value;
                    _markDirty();
                    if (op[1] === 'points' || op[1] === 'primaries') window._docOpticalRepaint(Number(op[0]));
                }
            }
            // 🏷 라벨 목록 칸 — `<행번호>|<size|code|position|note>`
            var lk = el.getAttribute('data-doc-litem');
            if (lk) {
                var lpp = lk.split('|'), llist2 = _docData(form.id).labelItems || [], lrow2 = llist2[Number(lpp[0])];
                if (lrow2) { lrow2[lpp[1]] = el.value; _markDirty(); }
                return;
            }
            // 🏷 인증/정격 표 글자 칸 — `<c|r>|<행번호>|<name|printType|spec>`
            var lck = el.getAttribute('data-doc-lcert');
            if (lck) {
                var lcp = lck.split('|'), lc3 = _docData(form.id).labelCerts || {};
                var llist3 = lcp[0] === 'c' ? lc3.certs : lc3.ratings, lrow3 = llist3 && llist3[Number(lcp[1])];
                if (lrow3) { lrow3[lcp[2]] = el.value; _markDirty(); }
                return;
            }
            // 📋 라벨 기재내용 고정 항목 — `<행번호>|<key>` (Part No·Q'ty 등, `it.fields` 에 저장)
            var lfk = el.getAttribute('data-doc-lfield');
            if (lfk) {
                var lfp = lfk.split('|'), lfRow = (_docData(form.id).labelItems || [])[Number(lfp[0])];
                if (lfRow) { lfRow.fields = lfRow.fields || {}; lfRow.fields[lfp[1]] = el.value; _markDirty(); }
                return;
            }
            // 📋 라벨 기재내용 자유 추가 항목 값 — `<행번호>|<항목번호>`
            var lfck = el.getAttribute('data-doc-lfieldc');
            if (lfck) {
                var lfcp = lfck.split('|'), lfcList = ((_docData(form.id).labelItems || [])[Number(lfcp[0])] || {}).fieldsCustom;
                var lfcItem = lfcList && lfcList[Number(lfcp[1])];
                if (lfcItem) { lfcItem.value = el.value; _markDirty(); }
                return;
            }
            // 📋 라벨 기재내용 자유 추가 항목 이름 — `<행번호>|<항목번호>`
            var lfclk = el.getAttribute('data-doc-lfieldcl');
            if (lfclk) {
                var lfclp = lfclk.split('|'), lfclList = ((_docData(form.id).labelItems || [])[Number(lfclp[0])] || {}).fieldsCustom;
                var lfclItem = lfclList && lfclList[Number(lfclp[1])];
                if (lfclItem) { lfclItem.label = el.value; _markDirty(); }
                return;
            }
        };
        // ✅ 점검표 칸 켜고 끄기 — 위임으로 받는다(167항목 × 8칸에 핸들러를 달지 않는다)
        body.onclick = function (e) {
            var el = e.target && e.target.closest ? e.target.closest('[data-doc-chk]') : null;
            if (el) {
                var k = el.getAttribute('data-doc-chk');
                var d = _docData(form.id);
                if (d.fields[k] === 'O') delete d.fields[k]; else d.fields[k] = 'O';
                _markDirty();
                // 누른 칸만 다시 칠한다 — 167항목을 통째로 다시 그리면 눈에 띄게 느리다
                var on = d.fields[k] === 'O';
                el.classList.toggle('on', on);     // 색은 클래스가 정한다(팔레트 대응)
                el.textContent = el.getAttribute('title') + (on ? ' O' : '');
                return;
            }
            // 🏷 라벨 인증/정격 표의 O↔X 토글 — `<c|r>|<행번호>|<check|print>`, 플랫 fields 가 아니라
            //    `labelCerts` 배열 안에 산다(이름·규격값과 같은 행 객체에 같이 둬야 내보내기가 쉽다).
            var lt = e.target && e.target.closest ? e.target.closest('[data-doc-ltoggle]') : null;
            if (lt) {
                var lp = lt.getAttribute('data-doc-ltoggle').split('|');
                var lc2 = _docData(form.id).labelCerts || {};
                var llist = lp[0] === 'c' ? lc2.certs : lc2.ratings;
                var lrow = llist && llist[Number(lp[1])];
                if (lrow) {
                    lrow[lp[2]] = (lrow[lp[2]] === 'O') ? '' : 'O';
                    _markDirty();
                    var lon = lrow[lp[2]] === 'O';
                    lt.classList.toggle('on', lon);
                    lt.textContent = lon ? 'O' : 'X';
                }
            }
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
        // 🏷 라벨 사양서 — 표 썸네일 크기조절 손잡이(렌더마다 다시 그려지므로 매번 새로 건다)
        //    + 마커 글자 크기를 썸네일 폭에 맞춘다(모달과 같은 계산, `_docLabelNotesApplyFont`).
        [].slice.call(body.querySelectorAll('[data-thumb-resize]')).forEach(function (handle) {
            var tcode = handle.getAttribute('data-thumb-resize');
            var twrap = handle.parentElement;
            var timg = twrap && twrap.querySelector('[data-thumb-img]');
            if (!timg) return;
            window._docLabelThumbSizeWire(handle, timg, tcode, function (wPx) {
                window._docLabelNotesApplyFont(twrap, timg, tcode, wPx);
            });
            window._docLabelNotesApplyFont(twrap, timg, tcode);
            if (!timg.complete) timg.addEventListener('load', function () { window._docLabelNotesApplyFont(twrap, timg, tcode); }, { once: true });
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
        // 🏷 라벨사양서는 "라벨 | 값" 짝짓기가 아니라 반복 행(라벨마다 규격·코드·부착위치) +
        //    인증/정격 표라서 모양이 전혀 다르다 — 전용 파서(js/72)로 먼저 보낸다.
        if (form.id === 'label-spec' && window._labelSpecImportFile) {
            await window._labelSpecImportFile(file, form.id);
            return;
        }
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
            } else if (s.kind === 'labelitems') {
                // 📋 [2026-11-13, 사용자 요청] 기재내용(Part No 등) 고정 항목도 같이 — 화면에 추가한 칸은
                //    `LABEL_FIELD_CATALOG` 한 곳에만 적으면 여기도 같이 늘어난다(서식=화면=엑셀 원칙).
                rows.push([_t('라벨규격', 'Size'), _t('라벨품목코드', 'Code'), _t('부착위치', 'Position'), _t('비고', 'Note')]
                    .concat(LABEL_FIELD_CATALOG.map(function (f) { return f.label; }))
                    .concat([_t('추가 항목', 'Extra fields'), _t('인증마크', 'Cert marks'), _t('도안 표시사항', 'Artwork notes')]));
                (d.labelItems || []).forEach(function (it) {
                    // 📍 도안 위 표시(화면의 번호 목록)·인증마크도 같이 — 불러온 적 없으면 빈칸(강제로 불러오진 않는다)
                    var codeKey = String(it.code || '').trim();
                    var notes = (window._docLabelNotesCache && window._docLabelNotesCache[codeKey]) || [];
                    var marksHere = (window._docLabelMarksCache && window._docLabelMarksCache[codeKey]) || [];
                    var fx = it.fields || {};
                    var extra = (it.fieldsCustom || []).filter(function (c) { return c.label || c.value; })
                        .map(function (c) { return (c.label || '') + ': ' + (c.value || ''); }).join(' / ');
                    rows.push([it.size || '', it.code || '', it.position || '', it.note || '']
                        .concat(LABEL_FIELD_CATALOG.map(function (f) { return fx[f.key] || ''; }))
                        .concat([extra, marksHere.map(function (m) { return m.key; }).join(' / '),
                                 notes.map(function (n, ni) { return (ni + 1) + '. ' + n.text; }).join(' / ')]));
                });
            } else if (s.kind === 'labelcerts') {
                var lc = d.labelCerts || {};
                rows.push([_t('인증 항목', 'Certifications')]);
                rows.push([_t('항목', 'Item'), 'Check', _t('인쇄 적용', 'Printed'), _t('인쇄 구분', 'Print type')]);
                (lc.certs || []).forEach(function (r) {
                    rows.push([r.name || '', r.check || '', r.print || '', r.printType || '']);
                });
                rows.push([]);
                rows.push([_t('정격 표시', 'Rating spec')]);
                rows.push([_t('항목', 'Item'), _t('규격값', 'Spec'), _t('인쇄 적용', 'Printed')]);
                (lc.ratings || []).forEach(function (r) {
                    rows.push([r.name || '', r.spec || '', r.print || '']);
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
                rows.push([_t('바코드/라벨', 'Barcode/Label'), _t('측정일시', 'Measured'), 'Native X', 'Native Y',
                           'Max PWM Lv', _t('균일도(%)', 'Uniformity(%)'), 'Gamut(%NTSC)', 'PQ',
                           'Dimming', _t('등급', 'Grade'), _t('구분', 'Category'), 'Aging', _t('비고', 'Remark')]);
                (d.opticalLogs || []).forEach(function (it) {
                    var uni = window._opticalUniformity ? window._opticalUniformity(it.points) : null;
                    var gam = (it.primaries && window._opticalGamut) ? window._opticalGamut(it.primaries) : null;
                    var gamPctX = gam ? gam.pct : it.gamutPct;
                    // 🔬 Customer SPEC 최소 기준과 대조해 PASS/FAIL 을 값 뒤에 붙인다(화면 배지와 같은 판정 — _opticalSpecCheck 한 곳).
                    var uChk = window._opticalSpecCheck ? window._opticalSpecCheck('Uniformity(%)', uni ? uni.pct : null) : null;
                    var gChk = window._opticalSpecCheck ? window._opticalSpecCheck('Color Gamut', gamPctX !== '' && gamPctX != null ? parseFloat(gamPctX) : null) : null;
                    var pqTxt = it.pqTotal > 0 ? (it.pqFail === 0 ? 'PASS' : it.pqFail + '/' + it.pqTotal + ' FAIL') : (it.pqManual || '');
                    rows.push([it.barcode || it.label || '', it.startTime, it.nativeX, it.nativeY, it.maxPwmLv,
                               (uni ? uni.pct : '') + (uChk ? (uChk.pass ? ' (PASS)' : ' (FAIL)') : ''),
                               (gamPctX != null ? gamPctX : '') + (gChk ? (gChk.pass ? ' (PASS)' : ' (FAIL)') : ''), pqTxt,
                               it.dimming || '', it.grade || '', it.category || '', it.aging || '', it.remark || '']);
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

    // 🏷 다른 탭(M.C·BOM·Customer SPEC·JIRA)에서 모델을 바꿔도 **지금 Document 탭이 열려
    //    있으면** 바로 따라간다 — 안 감싸면 탭을 한 번 나갔다 들어와야만(`_docOnTabShown`)
    //    새 모델의 문서가 보인다. js/43 이 Brief SPEC 에 쓰는 것과 같은 감싸기 방식.
    (function () {
        var orig = window.mcSwitchUnit;
        if (typeof orig !== 'function' || orig.__docWrapped) return;
        var wrapped = function () {
            var r = orig.apply(this, arguments);
            try { if (window._docRender) window._docRender(); } catch (e) { /* 문서 탭이 안 열려 있을 수 있다 */ }
            return r;
        };
        wrapped.__docWrapped = true;
        window.mcSwitchUnit = wrapped;
    })();

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
