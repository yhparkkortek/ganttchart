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
    var ATT_FOLDER = 'DOCUMENT/attach';   // 첨부 바이트는 문서와 섞지 않는다
    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };

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
                    { key: '출고 요청일',   hint: '예: 2026-02-13 X 2 SET / 2026-03-12 X 22 SET' },
                    { key: '총 제작수량',   hint: '예: 36 (24고객 + 12개발검토)' },
                    { key: '조립 예상일' },
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
            id: 'proto-req', icon: '🧾', label: '시제품 제작의뢰서', folder: 'DOCUMENT',
            note: '그룹웨어 기안의 본문 표와 같은 서식입니다(실측 RD3-2604-016).',
            nameOf: function (ctx) { return _projKey(ctx) + '_시제품 제작의뢰서_' + _today(); },
            sections: _protoReqSections()
        },
        {
            // 🧾 실측 원본: `260311_LNW_Slim Slot iDeck_KTBR14DPS01_Proto B_Sample Report_V00.docx`
            //    원본은 **7부 구성**이다(표지 뒤 '#문서 구분' 표에 그렇게 적혀 있다).
            //    ⚠️ SAMPLE CHECK SHEET(하드웨어·펌웨어·기구 6장, 300행 체크표)는 아직 안 넣었다 —
            //       넣을 땐 `kind:'check'` 를 새로 만들어 붙인다. 모르는 척하지 않고 적어 둔다.
            id: 'sample-report', icon: '📑', label: 'Sample Report (시제품)', folder: 'DOCUMENT',
            note: '원본 구성: ①시제품 제작의뢰서 ②라벨 사양 ③검토 내역서(시제품팀) '
                + '④광학 측정 ⑤제작 특이사항 ⑥검토 내역서(제품보증팀) ⑦SPL Check sheet. '
                + '⑦ 체크시트(6장·300행)는 아직 안 들어갑니다.',
            nameOf: function (ctx) { return _ymd() + '_' + _projKey(ctx) + '_Sample Report_V00'; },
            sections: [
                {
                    title: 'Sample Report', kind: 'cover', cols: 2,
                    fields: [
                        { key: 'Customer',     from: 'meta.고객사' },
                        { key: 'Project Name', from: 'meta.프로젝트명' },
                        { key: 'Model Name',   from: 'meta.KTK모델명' },
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
                        { key: '작 성 일',   from: 'today' },
                        { key: '작 성 부 서', hint: '시제품팀' },
                        { key: '작 성 자' },
                        { key: '제품 출고일' },
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
                        { key: '접수일' }, { key: '검사일자' },
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
                {
                    title: '디버깅 내역', cols: 2,
                    fields: [
                        { key: '디버깅 제목' },
                        { key: '발생 부문',  hint: '예: H/W, F/W - EMI' },
                        { key: '발생 일자' },
                        { key: '디버깅 담당자' },
                        { key: '문제 발생',  wide: true },
                        { key: '발생 요인',  wide: true },
                        { key: '해결 방법',  wide: true }
                    ]
                }
            ])
        },
        {
            id: 'stage-dr', icon: '📊', label: 'DR / DVR 발표자료', folder: 'DOCUMENT',
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
    //  ⚠️ 폴더 이름으로는 쓰지 않는다 — `고객사` 에 `LNW>STELLAR32` 처럼 `>` 가 들어 있고(실측),
    //     프로젝트 이름은 사람이 고칠 때마다 바뀐다. 폴더를 그걸로 만들면 **이름이 바뀌는 순간
    //     옛 문서가 미아가 된다**(이 저장소가 세 번 겪은 고장 모양이다). 그래서 문서는
    //     `DOCUMENT/` 에 평평하게 두고 **파일 이름에** 프로젝트를 적는다.
    var _projKey = function (ctx) {
        var s = [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join('_') || 'PROJECT';
        return s.replace(/[\\/:*?"<>|]/g, '-').trim();
    };

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
    var _docData = function (id) {
        window.tabData = window.tabData || {};
        window.tabData.documents = window.tabData.documents || {};
        var d = window.tabData.documents[id] = window.tabData.documents[id] || {};
        d.fields = d.fields || {};
        d.att = d.att || {};
        return d;
    };
    var _hasOwn = function (id, key) {
        return Object.prototype.hasOwnProperty.call(_docData(id).fields, key);
    };
    var _formById = function (id) {
        return (window.DOC_FORMS || []).filter(function (f) { return f.id === id; })[0] || null;
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

    // ── 상태 ───────────────────────────────────────────────────────────
    window._docState = window._docState || { formId: null, stage: 'Proto DR' };
    window._docPick = function (id) {
        window._docState.formId = id;
        try { localStorage.setItem('gantt_doc_last_form', id); } catch (e) { /* 무시 */ }
        var pop = document.getElementById('doc-form-dropdown');
        if (pop) pop.style.display = 'none';
        window._docRender();
    };
    window._docSetStage = function (v) { window._docState.stage = v; window._docRender(); };

    // ── 📄 드롭다운 (PARTS 와 같은 방식·같은 팝업 클래스) ────────────────
    window._toggleDocFormDropdown = function (ev) {
        if (ev) ev.stopPropagation();
        var pop = document.getElementById('doc-form-dropdown');
        if (!pop) return;
        if (pop.style.display === 'block') { pop.style.display = 'none'; return; }
        var cur = window._docState.formId;
        pop.innerHTML = (window.DOC_FORMS || []).map(function (f) {
            var on = f.id === cur;
            return '<div onclick="window._docPick(\'' + _esc(f.id) + '\')"'
                 + ' style="padding:8px 10px; cursor:pointer; border-radius:4px; font-size:13px;'
                 + ' font-weight:bold; white-space:nowrap;'
                 + ' background:' + (on ? '#2c5f8a' : 'transparent') + '; color:' + (on ? '#fff' : '#333') + ';"'
                 + ' onmouseover="if(this.style.background!==\'rgb(44, 95, 138)\') this.style.background=\'#f1f3f5\';"'
                 + ' onmouseout="if(this.style.background!==\'rgb(44, 95, 138)\') this.style.background=\'transparent\';">'
                 + (f.icon || '📄') + ' ' + _esc(f.label)
                 + (f.builder ? '<span style="margin-left:6px; font-size:10px; font-weight:normal; opacity:.7;">PPT</span>' : '')
                 + '</div>';
        }).join('');
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
            var r = await window._dgUploadBlob(ATT_FOLDER, nm, f);
            if (r.ok) {
                d.att[key].push({ name: r.name || nm, orig: f.name || '', size: r.size || f.size || 0,
                                  type: f.type || '', at: new Date().toISOString() });
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
    var _attUrl = function (name) {
        return BACKEND + '/doc/get?folder=' + encodeURIComponent(ATT_FOLDER) + '&name=' + encodeURIComponent(name);
    };

    // ── 🎨 문서 스타일 (원본 문서와 비슷하게) ────────────────────────────
    var _CSS_ID = 'doc-page-style';
    var _ensureCss = function () {
        if (document.getElementById(_CSS_ID)) return;
        var st = document.createElement('style');
        st.id = _CSS_ID;
        st.textContent = [
            // 흰 종이 느낌 — 원본이 A4 문서라 화면도 그 모양으로 본다
            '#doc-page-body .doc-paper{background:#fff;border:1px solid #d7dde3;border-radius:2px;',
            '  box-shadow:0 1px 4px rgba(0,0,0,.07);max-width:1040px;margin:0 auto 18px;padding:26px 30px 34px;}',
            '#doc-page-body .doc-title{font-size:20px;font-weight:bold;text-align:center;letter-spacing:1px;',
            '  padding:6px 0 14px;border-bottom:2px solid #2c5f8a;margin-bottom:16px;color:#1b3a57;}',
            '#doc-page-body .doc-sec{margin:16px 0 4px;font-size:13px;font-weight:bold;color:#fff;',
            '  background:#2c5f8a;padding:5px 10px;border-radius:2px;}',
            '#doc-page-body table.doc-t{border-collapse:collapse;width:100%;font-size:12px;}',
            '#doc-page-body table.doc-t td,#doc-page-body table.doc-t th{border:1px solid #9aa7b1;padding:4px 7px;}',
            '#doc-page-body table.doc-t th,#doc-page-body table.doc-t td.doc-lab{background:#eef2f6;font-weight:bold;',
            '  white-space:nowrap;text-align:center;}',
            '#doc-page-body table.doc-t td.doc-lab{text-align:left;width:140px;}',
            '#doc-page-body .doc-in{width:100%;box-sizing:border-box;padding:3px 5px;border:1px solid #ced4da;',
            '  border-radius:3px;font-size:12px;background:#fff;}',
            '#doc-page-body .doc-in.own{border-color:#e6a817;background:#fffbe6;font-weight:bold;}',
            '#doc-page-body .doc-src{margin-top:2px;font-size:10px;color:#868e96;}',
            '#doc-page-body .doc-src.own{color:#7a5210;}',
            '#doc-page-body .doc-att{display:flex;flex-wrap:wrap;gap:8px;padding:8px;border:1px dashed #9aa7b1;',
            '  border-radius:4px;background:#fafbfc;min-height:64px;align-items:flex-start;}',
            '#doc-page-body .doc-att .thumb{width:118px;border:1px solid #d7dde3;border-radius:3px;background:#fff;padding:4px;}',
            '#doc-page-body .doc-att .thumb img{width:100%;height:76px;object-fit:contain;display:block;}',
            // 🖨 인쇄 — 종이에선 입력칸 테두리·출처·버튼을 지운다(문서처럼 보이게)
            '@media print{',
            '  #doc-page-body .doc-paper{box-shadow:none;border:none;max-width:none;margin:0;padding:0;}',
            '  #doc-page-body .doc-src,#doc-page-body .doc-noprint{display:none !important;}',
            '  #doc-page-body .doc-in{border:none;background:none;padding:1px 2px;font-weight:normal;}',
            '  #doc-page-body .doc-in.own{background:none;}',
            '  #doc-page-body .doc-sec{-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
            '  #doc-page-body table.doc-t{page-break-inside:auto;}',
            '  #doc-page-body table.doc-t tr{page-break-inside:avoid;}',
            '}'
        ].join('\n');
        document.head.appendChild(st);
    };

    // ── 그리기 ─────────────────────────────────────────────────────────
    var _inputCell = function (id, key, value, own, src, hint, span) {
        return '<td' + (span ? ' colspan="' + span + '"' : '') + '>'
            + '<input type="text" value="' + _esc(value) + '" placeholder="' + _esc(hint || '') + '"'
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

        var forms = window.DOC_FORMS || [], st = window._docState;
        if (!st.formId) {
            var last = '';
            try { last = localStorage.getItem('gantt_doc_last_form') || ''; } catch (e) { /* 무시 */ }
            st.formId = (forms.filter(function (f) { return f.id === last; })[0] || forms[0] || {}).id || null;
        }
        var form = _formById(st.formId);
        var ctx = window._dgCollect ? window._dgCollect()
            : { meta: {}, overview: {}, milestones: { plan: {}, actual: {}, missing: [] }, members: [], spec: [], materials: [] };

        // ── 헤더 — PARTS 와 같은 드롭다운 + 출력(문서 형식이 기본, 엑셀은 옵션) ──
        var PRIM = 'margin:0 4px 0 0; padding:6px 13px; background:#2c5f8a; color:#fff; border:none;'
                 + ' border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;';
        var OPT = 'margin:0 4px 0 0; padding:6px 12px; background:#e0f5f7; color:#00707d; border:none;'
                + ' border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;';
        var th = '<div id="doc-form-toggle" style="position:relative; display:flex; align-items:center; flex-shrink:0;">'
            + '<button id="doc-form-trigger" onclick="window._toggleDocFormDropdown(event)"'
            + ' title="' + _esc(_t('문서 종류를 고릅니다', 'Pick a document type')) + '"'
            + ' style="display:flex; align-items:center; gap:4px; font-size:15px; font-weight:bold; cursor:pointer;'
            + ' color:#2c5f8a; background:none; border:none; padding:0; margin:0; user-select:none;">'
            + '<span id="doc-form-trigger-label">' + (form ? (form.icon || '📄') + ' ' + _esc(form.label) : '📄 ' + _esc(_t('문서', 'Document')))
            + '</span><span style="font-size:11px;">▾</span></button>'
            + '<div id="doc-form-dropdown" class="row-action-popup" style="min-width:220px; padding:6px;"></div></div>'
            + '<span style="display:inline-block; width:1px; height:16px; background:#ddd; margin:0 12px;"></span>'
            // 🖨 문서 형식이 **기본** 출력이다(사용자 요청) — 보이는 그대로 인쇄/PDF
            + '<button onclick="window._docPrint()" style="' + PRIM + '">🖨 ' + _esc(_t('문서 출력', 'Print')) + '</button>'
            + '<button onclick="window._docExport(\'xlsx\')" style="' + OPT + '">📗 ' + _esc(_t('엑셀', 'Excel')) + '</button>';
        if (form && form.builder) {
            th += '<button onclick="window._docExport(\'pptx\')" style="' + OPT + '">📊 ' + _esc(_t('PPT', 'PPT')) + '</button>';
        }
        th += '<button onclick="window._docExport(\'nas\')" style="' + OPT + '">📁 ' + _esc(_t('NAS', 'NAS')) + '</button>';
        tools.innerHTML = th;

        if (!form) { body.innerHTML = '<div style="padding:12px; color:#b1432f;">'
            + _esc(_t('문서 서식이 없습니다.', 'No document forms.')) + '</div>'; return; }

        // ── 본문 — 흰 종이 위의 문서 ──
        var h = '<div class="doc-paper">';
        var pname = [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join(' > ');
        h += '<div class="doc-noprint" style="margin:0 0 8px; font-size:12px; color:#868e96;">'
           + (pname ? '📁 ' + _esc(pname) : '⚠️ ' + _esc(_t('프로젝트가 열려 있지 않습니다 — 자동으로 채울 값이 없습니다.', 'No project open.')))
           + '</div>';
        h += '<div class="doc-title">' + _esc(form.label) + '</div>';
        if (form.stages) {
            h += '<div class="doc-noprint" style="margin-bottom:10px; font-size:12px;">' + _esc(_t('단계', 'Stage')) + ': ';
            form.stages.forEach(function (sv) {
                var on = st.stage === sv;
                h += '<button onclick="window._docSetStage(\'' + _esc(sv) + '\')" style="margin-right:4px;'
                   + ' padding:3px 10px; font-size:11px; cursor:pointer; border-radius:12px;'
                   + ' border:1px solid ' + (on ? '#2c5f8a' : '#dee2e6') + ';'
                   + ' background:' + (on ? '#e7f0f7' : '#fff') + '; font-weight:' + (on ? 'bold' : 'normal') + ';">'
                   + _esc(sv) + '</button>';
            });
            h += '</div>';
        }
        if (form.note) {
            h += '<div class="doc-noprint" style="margin-bottom:12px; padding:6px 9px; background:#e8f4fd;'
               + ' border-left:3px solid #1a4f7a; border-radius:0 4px 4px 0; font-size:11.5px; color:#1a4f7a;">ℹ️ '
               + _esc(form.note) + '</div>';
        }

        form.sections.forEach(function (s) {
            if (s.kind !== 'cover') h += '<div class="doc-sec">' + _esc(s.title) + '</div>';
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
                       + (isImg ? '<img src="' + _esc(_attUrl(a.name)) + '" alt="">'
                                : '<div style="height:76px; display:flex; align-items:center; justify-content:center; font-size:26px;">📄</div>')
                       + '<div style="font-size:10px; word-break:break-all; margin-top:3px;">' + _esc(a.orig || a.name) + '</div>'
                       + '<div class="doc-noprint" style="text-align:right;">'
                       + '<a href="' + _esc(_attUrl(a.name)) + '" target="_blank" style="font-size:10px; color:#1971c2;">열기</a> '
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
                        h += _inputCell(form.id, c.key, own ? _docData(form.id).fields[c.key] : a.v, own, a.src, c.hint);
                    });
                    h += '</tr>';
                });
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
                                    wide ? (cols * 2 - 1) : 0);
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
            if (key) window._docSetField(form.id, key, el.value);
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

    // ── 🖨 문서 출력 (기본) ─────────────────────────────────────────────
    //  보이는 그대로 인쇄한다 — 준비(`beforeprint`)는 기존 경로를 그대로 탄다.
    window._docPrint = function () {
        var pop = document.getElementById('doc-form-dropdown');
        if (pop) pop.style.display = 'none';
        window.print();
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
            if (s.kind === 'attach') {
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
        var r = await window._dgUploadBlob(form.folder, name, blob);
        if (r.ok) _toast('📁 ' + form.folder + '/' + r.name + ' (' + Math.round((r.size || 0) / 1024) + 'KB)', 'success');
        else if (r.skipped) _toast(_t('올리지 않았습니다.', 'Not uploaded.'), 'info');
        else _toast('⚠️ ' + _t('올리지 못했습니다: ', 'Upload failed: ') + r.error, 'error');
    };

    window._docOnTabShown = function () { try { window._docRender(); } catch (e) { /* 그리기 실패가 탭을 막지 않게 */ } };
    var boot = function () {
        if (!document.getElementById('doc-page-body')) return;
        try { window._docRender(); } catch (e) { /* 〃 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
