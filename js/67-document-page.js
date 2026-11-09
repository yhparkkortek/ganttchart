// 📄 [2026-11-09 신규] Document 페이지 — 문서를 **골라서 그 자리에서 쓴다**
//
//   사용자 요청(2026-11-09):
//     "PARTS 페이지처럼 / PANEL AD BD… 와 같이 문서를 선택할 수 있고, 문서를 선택하면
//      해당 페이지에 문서 초안이 페이지로 나열되면서 보여지면 기본 정보는 자동으로 표시되고,
//      사용자가 필요한 정보를 추가 기입 / 헤더에 출력 버튼들은 출력 기능 처리"
//     "엑셀은 기본으로 설정해주고 이미 제작된 문서 종류도 출력할 수 있도록"
//
//  ■ 구조 — PARTS(js/50)와 같은 모양
//     헤더: `📄 <문서>▾` 로 고르고, 그 옆이 **출력 버튼**
//     본문: `doc-view-<문서id>` 들 중 **고른 것만** 보인다
//     문서 추가 = `DOC_FORMS` 에 항목 하나(화면·엑셀이 같이 따라온다)
//
//  ■ 핵심 — **서식 하나에서 화면과 엑셀이 같이 나온다**
//     서식(`sections`)이 곧 화면이고 곧 엑셀 시트다. 그래서 새 문서를 붙이면
//     **엑셀 출력이 공짜로 따라온다**(사용자 요청: 엑셀을 기본으로).
//     전용 출력기(PPT 등)는 **가진 문서만** `builder` 로 더 갖는다.
//
//  ■ 값은 어디서 오나 (출처를 화면에 적는다)
//     · 자동: js/66 `_dgCollect()` 가 모은 앱 데이터(`from` 의 점 경로)
//     · 사람: 칸을 고치면 그 값이 **그 문서에 고정**되고 `↺` 로 앱 값으로 되돌린다
//     · 저장: `tabData.documents[문서id].fields` — 프로젝트 파일에 같이 저장된다
//     ⚠️ 자동값은 **저장하지 않는다.** 저장하면 앱 값이 바뀌어도 문서가 옛값을 들고 있게 된다
//        — 사람이 고친 것만 적는다(js/47 기안 작성기와 같은 원칙).
//
//  ■ 인쇄
//     인쇄 버튼은 **만들지 않는다**(2026-11-05 에 11개를 다 없애고 브라우저 인쇄로 돌렸다).
//     `.concept-tab-wrap` 안에 있으므로 Ctrl+P 가 기존 `beforeprint` 준비를 그대로 탄다.
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };

    // 주요자재 표의 '항목' 이름 ↔ Summary 고정 구분 (데이터)
    //  ⚠️ 왼쪽은 **문서에 적히는 말**, 오른쪽은 `MATERIAL_FIXED_CATEGORIES` 의 구분이다.
    //     실측(RD3-2604-016)에서 문서가 쓰는 이름이 왼쪽 그대로였다.
    var MAT_ROWS = [
        { item: 'LCM(Panel)', cat: 'PANEL' },
        { item: 'A/D Board',  cat: 'AD BOARD' },
        { item: 'Converter',  cat: 'CONVERTER' },
        { item: 'TSP(Glass)', cat: 'TOUCH / GLASS' },
        { item: 'TSP CTRL',   cat: 'TOUCH CTRL' }
    ];

    // ── 📚 문서 서식 카탈로그 (데이터) ──────────────────────────────────
    //   id       : 내부 식별자(저장 키이기도 하다 — 바꾸면 사람이 적은 값이 끊긴다)
    //   label    : 헤더 드롭다운에 보이는 이름
    //   folder   : NAS 폴더
    //   builder  : 전용 출력기 이름(없으면 엑셀만)
    //   nameOf   : 파일 이름(실측 이름 규칙)
    //   sections : 화면이자 엑셀. kind = 'fields'(기본) | 'table' | 'text'
    //     field  : { key, label?, from?, hint? }
    //              from = `_dgCollect()` 결과의 **점 경로**(예: 'meta.프로젝트코드')
    window.DOC_FORMS = window.DOC_FORMS || [
        {
            id: 'proto-req',
            label: '시제품 제작의뢰서',
            folder: 'DOCUMENT',
            nameOf: function (ctx) {
                return [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join('_')
                     + '_시제품 제작의뢰서_' + _today() + '.xlsx';
            },
            note: '그룹웨어 기안의 본문 표와 같은 서식입니다 — 실측(RD3-2604-016)으로 칸 이름을 받아 적었습니다.',
            sections: [
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
                    title: '광학 사양 · 펌웨어', cols: 2,
                    fields: [
                        { key: 'X',  from: 'specX',  hint: '예: 0.305' },
                        { key: 'Y',  from: 'specY',  hint: '예: 0.335' },
                        { key: 'Lv', from: 'specLv', hint: '예: 500~550' },
                        { key: 'FW Ver',          hint: '확정 전이면 비워 두세요' },
                        { key: 'EDID CHECK SUM',  hint: '예: DP 0x36' }
                    ]
                },
                {
                    title: '# 주요자재', kind: 'table',
                    columns: ['항목', '코드', '부품 명', '비고'],
                    rows: MAT_ROWS.map(function (m) {
                        return { label: m.item,
                                 cells: [{ fixed: m.item },
                                         { key: m.item + '|코드',  from: 'mat:' + m.cat + ':pn' },
                                         { key: m.item + '|부품명', from: 'mat:' + m.cat + ':desc' },
                                         { key: m.item + '|비고' }] };
                    })
                },
                { title: '# 요청사항', kind: 'text', key: '요청사항',
                  hint: '예: Auto GAMMA Calibration / CUTTING 모델 원자재 …' },
                { title: '# 참고 자료', kind: 'text', key: '참고자료',
                  hint: '제품 spec / 패널 spec / Cutting 도면 등' }
            ]
        },
        {
            // 🧩 이미 만들어 둔 종류 — 같은 페이지에서 고르고 **PPT 로도** 출력한다(사용자 요청).
            id: 'stage-dr',
            label: 'DR / DVR 발표자료',
            folder: 'DOCUMENT',
            builder: 'stage-dr',
            stages: ['Kickoff & Proto DR', 'Proto DR', 'DVR', 'PRA'],
            nameOf: function (ctx, opt) {
                var who = [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join('_') || 'PROJECT';
                var inch = ctx.meta.인치 ? ('_' + ctx.meta.인치 + 'in') : '';
                return who + inch + '_' + ((opt && opt.stage) || 'DR') + '_V00_'
                     + (window._dgEnDate ? window._dgEnDate() : _today());
            },
            note: '도면·사진·블록도는 들어가지 않습니다(사람이 넣는 부분). PPT 로 받으면 슬라이드 6장입니다.',
            sections: [
                {
                    title: 'PROJECT SUMMARY', cols: 2,
                    fields: [
                        { key: '프로젝트 코드', from: 'meta.프로젝트코드' },
                        { key: '제품 코드',     from: 'meta.제품코드' },
                        { key: '모델명',        from: 'meta.모델풀네임' },
                        { key: '고객사',        from: 'meta.고객사' },
                        { key: '적용 목적',     from: 'overview.purpose' },
                        { key: '연간 수요량',   from: 'overview.volume' },
                        { key: '목표 양산 일정', from: 'overview.mpDate' },
                        { key: '추진 배경',     from: 'overview.background' },
                        { key: '추정 재료비',   hint: 'M.C Table 합계 — 지금은 사람이 적습니다' },
                        { key: '예상 판매가' }
                    ]
                },
                { title: 'PROJECT SCHEDULE', kind: 'milestones' },
                { title: '프로젝트 조직',      kind: 'members' },
                { title: 'SPECIFICATION',    kind: 'spec' },
                { title: '주요 자재',          kind: 'materials' }
            ]
        }
    ];

    var _today = function () {
        var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    };

    // ── 값 찾기 ────────────────────────────────────────────────────────
    //  from 은 점 경로('meta.프로젝트코드') 또는 특수 표기:
    //    'mat:<구분>:pn|desc'  주요자재  ·  'specX|specY|specLv'  Customer SPEC 의 광학 칸
    var _SPEC_ALIAS = {
        specX:  ['색좌표 X', 'Color Coordinate X', 'White X', 'x'],
        specY:  ['색좌표 Y', 'Color Coordinate Y', 'White Y', 'y'],
        specLv: ['휘도', 'Brightness', 'Luminance', 'White Luminance']
    };
    var _norm = function (s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); };

    var _autoOf = function (ctx, from) {
        if (!from) return { v: '', src: '' };
        if (from.indexOf('mat:') === 0) {
            var p = from.split(':');          // mat / 구분 / pn|desc
            var hit = (ctx.materials || []).filter(function (m) { return m.cat === p[1]; })[0];
            if (!hit) return { v: '', src: _t('주요자재에 ' + p[1] + ' 없음', 'no ' + p[1]) };
            return { v: (p[2] === 'desc' ? hit.desc : hit.pn) || '',
                     src: _t('주요자재 > ' + p[1], 'materials > ' + p[1]) };
        }
        if (_SPEC_ALIAS[from]) {
            var want = _SPEC_ALIAS[from].map(_norm);
            var row = (ctx.spec || []).filter(function (r) { return want.indexOf(_norm(r.label)) >= 0; })[0];
            return row ? { v: row.value, src: 'Customer SPEC > ' + row.label }
                       : { v: '', src: _t('Customer SPEC 에 없음', 'not in Customer SPEC') };
        }
        var cur = ctx;
        var parts = from.split('.');
        for (var i = 0; i < parts.length; i++) {
            if (cur == null) break;
            cur = cur[parts[i]];
        }
        var v = (cur == null) ? '' : String(cur).trim();
        // 출처는 **사람이 읽을 말**로 — 내부 경로(`meta.HW담당자`)를 그대로 보여주면
        // "이 값이 어디서 왔나"를 확인하러 갈 자리를 모른다(출처를 보여주는 이유가 그건데).
        return { v: v, src: v ? _srcLabel(from) : _t('앱에 값 없음 — ', 'empty in app — ') + _srcLabel(from) };
    };

    // 점 경로 → 사람이 읽을 출처 (데이터)
    var _SRC_WHERE = {
        meta: 'Summary ▸ 프로젝트 정보',
        overview: 'Summary ▸ 프로젝트 개요'
    };
    var _SRC_FIELD = {
        'meta.프로젝트코드': 'Summary ▸ 프로젝트 코드',
        'meta.제품코드': 'Summary ▸ KTK PN',
        'meta.모델풀네임': 'Summary ▸ KTK PN_모델명',
        'meta.고객사': 'Summary ▸ 고객사',
        'overview.purpose': 'Summary ▸ 적용 목적',
        'overview.volume': 'Summary ▸ 연간 수요량',
        'overview.mpDate': 'Summary ▸ 목표 양산 일정',
        'overview.background': 'Summary ▸ 추진 배경'
    };
    var _srcLabel = function (from) {
        if (!from) return '';
        if (_SRC_FIELD[from]) return _SRC_FIELD[from];
        if (/담당자$/.test(from)) return 'Summary ▸ 프로젝트 멤버 (' + from.split('.').pop() + ')';
        var head = String(from).split('.')[0];
        return _SRC_WHERE[head] || from;
    };

    // ── 사람이 적은 값 (프로젝트 파일에 저장된다) ────────────────────────
    var _docData = function (id) {
        window.tabData = window.tabData || {};
        window.tabData.documents = window.tabData.documents || {};
        window.tabData.documents[id] = window.tabData.documents[id] || { fields: {} };
        var d = window.tabData.documents[id];
        d.fields = d.fields || {};
        return d;
    };
    var _hasOwn = function (id, key) {
        var f = _docData(id).fields;
        return Object.prototype.hasOwnProperty.call(f, key);
    };

    window._docSetField = function (id, key, value) {
        var d = _docData(id);
        // ⚠️ 자동값과 **같아지면 저장에서 뺀다** — 그래야 앱 값이 바뀌면 문서도 따라간다.
        var ctx = window._dgCollect ? window._dgCollect() : {};
        var field = _findField(id, key);
        var auto = field ? _autoOf(ctx, field.from).v : '';
        if (String(value) === String(auto)) delete d.fields[key];
        else d.fields[key] = value;
        d.savedAt = new Date().toISOString();
        _markDirty();
    };
    window._docResetField = function (id, key) {
        delete _docData(id).fields[key];
        _markDirty();
        window._docRender();
    };

    //  저장은 앱의 기존 경로를 탄다 — 여기서 직접 NAS 에 쓰지 않는다.
    var _markDirty = function () {
        try { if (window.markUnsavedChanges) window.markUnsavedChanges(); } catch (e) { /* 없으면 넘어간다 */ }
    };

    var _findField = function (id, key) {
        var form = _formById(id);
        var found = null;
        (form ? form.sections : []).forEach(function (s) {
            (s.fields || []).forEach(function (f) { if (f.key === key) found = f; });
            (s.rows || []).forEach(function (r) {
                (r.cells || []).forEach(function (c) { if (c.key === key) found = c; });
            });
            if (s.kind === 'text' && s.key === key) found = s;
        });
        return found;
    };
    var _formById = function (id) {
        return (window.DOC_FORMS || []).filter(function (f) { return f.id === id; })[0] || null;
    };

    // ── 상태 ───────────────────────────────────────────────────────────
    window._docState = window._docState || { formId: null, stage: 'Proto DR' };

    window._docPick = function (id) {
        window._docState.formId = id;
        try { localStorage.setItem('gantt_doc_last_form', id); } catch (e) { /* 저장 실패는 무시 */ }
        window._docRender();
    };
    window._docSetStage = function (v) { window._docState.stage = v; window._docRender(); };

    // ── 그리기 ─────────────────────────────────────────────────────────
    var CELL = 'border:1px solid #e9ecef; padding:4px 7px;';
    var LAB = CELL + ' background:#f8f9fa; font-weight:bold; white-space:nowrap; width:130px;';
    var INP = 'width:100%; box-sizing:border-box; padding:3px 6px; border:1px solid #ced4da;'
            + ' border-radius:4px; font-size:12px;';

    var _inputCell = function (id, key, value, isOwn, src, hint) {
        var h = '<td style="' + CELL + '">'
            + '<input type="text" value="' + _esc(value) + '" placeholder="' + _esc(hint || '') + '"'
            + ' data-doc-key="' + _esc(key) + '"'
            + ' style="' + INP + (isOwn ? ' border-color:#e6a817; font-weight:bold; background:#fffbe6;' : '') + '">'
            + '<div style="margin-top:2px; font-size:10px; color:' + (isOwn ? '#7a5210' : '#868e96') + ';">'
            + (isOwn
                ? '✏️ ' + _esc(_t('직접 적음', 'edited'))
                  + ' <a href="#" onclick="window._docResetField(\'' + _esc(id) + '\',\'' + _esc(key) + '\');return false;"'
                  + ' style="color:#1971c2;">↺ ' + _esc(_t('앱 값으로', 'reset')) + '</a>'
                : (src ? (/없음|empty|not in/.test(src) ? '⚠️ ' : '📘 ') + _esc(src) : ''))
            + '</div></td>';
        return h;
    };

    window._docRender = function () {
        var body = document.getElementById('doc-page-body');
        var tools = document.getElementById('doc-header-tools');
        if (!body || !tools) return;

        var forms = window.DOC_FORMS || [];
        var st = window._docState;
        if (!st.formId) {
            var last = '';
            try { last = localStorage.getItem('gantt_doc_last_form') || ''; } catch (e) { /* 무시 */ }
            st.formId = (forms.filter(function (f) { return f.id === last; })[0] || forms[0] || {}).id || null;
        }
        var form = _formById(st.formId);
        var ctx = window._dgCollect ? window._dgCollect() : { meta: {}, overview: {}, milestones: { plan: {}, actual: {}, missing: [] }, members: [], spec: [], materials: [] };

        // ── 헤더: 문서 고르기 + 출력 버튼 ──
        var BTN = 'margin:0 4px 0 0; padding:6px 12px; background:#e0f5f7; color:#00707d; border:none;'
                + ' border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;';
        var th = '';
        forms.forEach(function (f) {
            var on = f.id === st.formId;
            th += '<button onclick="window._docPick(\'' + _esc(f.id) + '\')" style="' + BTN
                + (on ? ' background:#00707d; color:#fff;' : '') + '">'
                + (f.builder ? '📊 ' : '📗 ') + _esc(f.label) + '</button>';
        });
        th += '<span style="display:inline-block; width:1px; height:16px; background:#ddd; margin:0 10px; vertical-align:middle;"></span>';
        // 📗 엑셀이 **기본** — 모든 문서가 서식에서 바로 나온다(사용자 요청)
        th += '<button onclick="window._docExport(\'xlsx\')" style="' + BTN + '">📗 ' + _esc(_t('엑셀 출력', 'Excel')) + '</button>';
        if (form && form.builder) {
            th += '<button onclick="window._docExport(\'pptx\')" style="' + BTN + '">📊 ' + _esc(_t('PPT 출력', 'PPT')) + '</button>';
        }
        th += '<button onclick="window._docExport(\'nas\')" style="' + BTN + '">📁 ' + _esc(_t('NAS 에 올리기', 'Upload')) + '</button>';
        tools.innerHTML = th;

        if (!form) { body.innerHTML = '<div style="padding:12px; color:#b1432f;">'
            + _esc(_t('문서 서식이 없습니다.', 'No document forms.')) + '</div>'; return; }

        // ── 본문 ──
        var h = '';
        var pname = [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join(' > ');
        h += '<div style="margin:0 0 8px; font-size:12px; color:#868e96;">'
           + (pname ? '📁 ' + _esc(pname) : '⚠️ ' + _esc(_t('프로젝트가 열려 있지 않습니다 — 자동으로 채울 값이 없습니다.', 'No project open.')))
           + '</div>';
        if (form.stages) {
            h += '<div style="margin-bottom:8px; font-size:12px;">' + _esc(_t('단계', 'Stage')) + ': ';
            form.stages.forEach(function (sv) {
                var on = st.stage === sv;
                h += '<button onclick="window._docSetStage(\'' + _esc(sv) + '\')" style="margin-right:4px;'
                   + ' padding:3px 10px; font-size:11px; cursor:pointer; border-radius:12px;'
                   + ' border:1px solid ' + (on ? '#00707d' : '#dee2e6') + ';'
                   + ' background:' + (on ? '#e0f5f7' : '#fff') + '; font-weight:' + (on ? 'bold' : 'normal') + ';">'
                   + _esc(sv) + '</button>';
            });
            h += '</div>';
        }
        if (form.note) {
            h += '<div style="margin-bottom:10px; padding:6px 9px; background:#e8f4fd; border-left:3px solid #1a4f7a;'
               + ' border-radius:0 4px 4px 0; font-size:11.5px; color:#1a4f7a;">ℹ️ ' + _esc(form.note) + '</div>';
        }

        form.sections.forEach(function (s) {
            h += '<div style="margin:14px 0 4px; font-size:14px; font-weight:bold; color:#2c5f8a;">'
               + _esc(s.title) + '</div>';
            // ⚠️ 칸 구역엔 `table-layout:fixed` 를 쓰지 않는다 — 좁은 창에서 라벨 칸이
            //    30px 로 눌려 글자가 **세로로 깨진다**(실측 442px 창에서 "프 로 젝 트 코 드").
            //    표 구역(주요자재·SPEC)은 열이 고르게 보여야 해서 fixed 를 쓴다.
            var fixedLayout = (s.kind === 'table' || s.kind === 'spec' || s.kind === 'materials'
                               || s.kind === 'milestones' || s.kind === 'members');
            h += '<table style="border-collapse:collapse; width:100%; font-size:12px;'
               + (fixedLayout ? ' table-layout:fixed;' : '') + '">';

            if (s.kind === 'text') {
                var tv = _hasOwn(form.id, s.key) ? _docData(form.id).fields[s.key] : '';
                h += '<tr><td style="' + CELL + '">'
                   + '<textarea data-doc-key="' + _esc(s.key) + '" rows="3" placeholder="' + _esc(s.hint || '')
                   + '" style="' + INP + ' resize:vertical;">' + _esc(tv) + '</textarea></td></tr>';
            } else if (s.kind === 'table') {
                h += '<tr>' + s.columns.map(function (c) {
                    return '<th style="' + LAB + ' width:auto; text-align:center;">' + _esc(c) + '</th>';
                }).join('') + '</tr>';
                s.rows.forEach(function (r) {
                    h += '<tr>';
                    r.cells.forEach(function (c) {
                        if (c.fixed !== undefined) {
                            h += '<td style="' + LAB + ' width:auto; text-align:center;">' + _esc(c.fixed) + '</td>';
                            return;
                        }
                        var own = _hasOwn(form.id, c.key);
                        var a = _autoOf(ctx, c.from);
                        h += _inputCell(form.id, c.key, own ? _docData(form.id).fields[c.key] : a.v, own, a.src, c.hint);
                    });
                    h += '</tr>';
                });
            } else if (s.kind === 'milestones') {
                h += '<tr><th style="' + LAB + '">' + _esc(_t('구분', 'Stage')) + '</th>'
                   + (window.DOC_MILESTONES || []).map(function (m) {
                       return '<th style="' + LAB + ' width:auto; text-align:center;">' + _esc(m.label) + '</th>'; }).join('') + '</tr>';
                ['plan', 'actual'].forEach(function (kind) {
                    h += '<tr><td style="' + LAB + '">' + _esc(kind === 'plan' ? _t('계획', 'Plan') : _t('실적', 'Actual')) + '</td>'
                       + (window.DOC_MILESTONES || []).map(function (m) {
                           var v = ctx.milestones[kind][m.stage] || '';
                           return '<td style="' + CELL + ' text-align:center; color:' + (v ? '#000' : '#b1432f') + ';">'
                                + _esc(v || '-') + '</td>'; }).join('') + '</tr>';
                });
                h += '</table><div style="font-size:11px; color:#868e96; margin-top:3px;">📘 '
                   + _esc(_t('Summary 탭 ▸ 개발기간 표에서 옵니다 — 여기서는 고치지 않습니다.',
                             'From the Summary tab.')) + '</div><table style="display:none;">';
            } else if (s.kind === 'members') {
                h += '<tr><th style="' + LAB + ' text-align:center;">' + _esc(_t('구분', 'Role')) + '</th>'
                   + '<th style="' + LAB + ' width:auto; text-align:center;">' + _esc(_t('성명', 'Name')) + '</th></tr>';
                (ctx.members.length ? ctx.members : [{ role: '-', name: '-' }]).forEach(function (m) {
                    h += '<tr><td style="' + LAB + ' text-align:center;">' + _esc(m.role) + '</td>'
                       + '<td style="' + CELL + '">' + _esc(m.name) + '</td></tr>';
                });
            } else if (s.kind === 'spec') {
                h += '<tr><th style="' + LAB + ' text-align:center; width:50px;">NO</th>'
                   + '<th style="' + LAB + ' width:auto; text-align:center;">TYPE</th>'
                   + '<th style="' + LAB + ' width:auto; text-align:center;">Description</th>'
                   + '<th style="' + LAB + ' width:auto; text-align:center;">KTK Note</th></tr>';
                if (!ctx.spec.length) {
                    h += '<tr><td colspan="4" style="' + CELL + ' color:#b1432f;">'
                       + _esc(_t('Customer SPEC 이 비어 있습니다 — Customer SPEC 탭에서 입력해 주세요.', 'Customer SPEC is empty.'))
                       + '</td></tr>';
                }
                ctx.spec.forEach(function (r, i) {
                    h += '<tr><td style="' + CELL + ' text-align:center;">' + (i + 1) + '</td>'
                       + '<td style="' + CELL + '">' + _esc(r.label) + '</td>'
                       + '<td style="' + CELL + '">' + _esc(r.value) + '</td>'
                       + '<td style="' + CELL + '">' + _esc(r.note) + '</td></tr>';
                });
            } else if (s.kind === 'materials') {
                h += '<tr><th style="' + LAB + ' text-align:center;">' + _esc(_t('구분', 'Category')) + '</th>'
                   + '<th style="' + LAB + ' width:auto; text-align:center;">' + _esc(_t('코드', 'PN')) + '</th>'
                   + '<th style="' + LAB + ' width:auto; text-align:center;">' + _esc(_t('내역', 'Description')) + '</th></tr>';
                if (!ctx.materials.length) {
                    h += '<tr><td colspan="3" style="' + CELL + ' color:#b1432f;">'
                       + _esc(_t('Summary 탭 ▸ 주요 자재가 비어 있습니다.', 'No key materials.')) + '</td></tr>';
                }
                ctx.materials.forEach(function (m) {
                    h += '<tr><td style="' + LAB + ' text-align:center;">' + _esc(m.cat) + '</td>'
                       + '<td style="' + CELL + ' text-align:center;">' + _esc(m.pn) + '</td>'
                       + '<td style="' + CELL + '">' + _esc(m.desc) + '</td></tr>';
                });
            } else {
                // 좁은 창에서는 **한 열**로 떨어뜨린다 — 2열(칸 4개)은 700px 아래에서 안 들어간다.
                var cols = s.cols || 2;
                if ((body.clientWidth || 0) > 0 && body.clientWidth < 700) cols = 1;
                for (var i = 0; i < s.fields.length; i += cols) {
                    h += '<tr>';
                    for (var c = 0; c < cols; c++) {
                        var f = s.fields[i + c];
                        if (!f) { h += '<td style="' + CELL + '"></td><td style="' + CELL + '"></td>'; continue; }
                        var own = _hasOwn(form.id, f.key);
                        var a = _autoOf(ctx, f.from);
                        h += '<td style="' + LAB + '">' + _esc(f.label || f.key) + '</td>'
                           + _inputCell(form.id, f.key, own ? _docData(form.id).fields[f.key] : a.v, own, a.src, f.hint);
                    }
                    h += '</tr>';
                }
            }
            h += '</table>';
        });

        body.innerHTML = h;
        // 입력은 **위임**으로 받는다 — 칸마다 핸들러를 달면 다시 그릴 때마다 늘어난다.
        body.oninput = function (e) {
            var el = e.target;
            if (!el || !el.getAttribute) return;
            var key = el.getAttribute('data-doc-key');
            if (!key) return;
            window._docSetField(form.id, key, el.value);
        };
    };

    // ── 📗📊📁 출력 ────────────────────────────────────────────────────
    //  엑셀은 **서식에서 바로** 만든다 — 그래서 문서를 늘려도 엑셀이 공짜로 따라온다.
    window._docToAoa = function (formId) {
        var form = _formById(formId);
        var ctx = window._dgCollect();
        var d = _docData(formId);
        var rows = [];
        var val = function (key, from) {
            return _hasOwn(formId, key) ? d.fields[key] : _autoOf(ctx, from).v;
        };
        rows.push([form.label]);
        rows.push([(ctx.meta.고객사 || '') + ' ' + (ctx.meta.모델명 || ''), '', '', _t('출력일', 'date') + ': ' + _today()]);
        rows.push([]);
        form.sections.forEach(function (s) {
            rows.push([s.title]);
            if (s.kind === 'text') {
                rows.push([val(s.key, null) || '']);
            } else if (s.kind === 'table') {
                rows.push(s.columns.slice());
                s.rows.forEach(function (r) {
                    rows.push(r.cells.map(function (c) {
                        return c.fixed !== undefined ? c.fixed : val(c.key, c.from);
                    }));
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
        var st = window._docState;
        var form = _formById(st.formId);
        if (!form) { _toast('⚠️ ' + _t('문서를 고르세요.', 'Pick a document.'), 'error'); return; }
        var ctx = window._dgCollect();
        var opt = { stage: st.stage };

        // 📊 PPT — 전용 생성기를 가진 문서만
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

        // 📗 엑셀 (기본) / 📁 NAS
        if (typeof XLSX === 'undefined') {
            _toast('⚠️ ' + _t('엑셀 라이브러리를 불러오지 못했습니다.', 'XLSX not loaded.'), 'error'); return;
        }
        var aoa = window._docToAoa(form.id);
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 20 }, { wch: 34 }, { wch: 26 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, ws, form.label.slice(0, 28));
        var name = form.nameOf(ctx, opt);
        if (!/\.(xlsx|pptx)$/i.test(name)) name += '.xlsx';
        name = name.replace(/\.pptx$/i, '.xlsx');

        if (how !== 'nas') {
            XLSX.writeFile(wb, name);
            _toast('📗 ' + name, 'success');
            return;
        }
        if (!window._dgUploadBlob) { _toast('⚠️ ' + _t('업로드 기능을 불러오지 못했습니다.', 'Upload unavailable.'), 'error'); return; }
        var buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        _toast('⏳ ' + _t('NAS 에 올리는 중…', 'Uploading…'), 'info');
        var r = await window._dgUploadBlob(form.folder, name, blob);
        if (r.ok) _toast('📁 ' + form.folder + '/' + r.name + ' (' + Math.round((r.size || 0) / 1024) + 'KB)', 'success');
        else if (r.skipped) _toast(_t('올리지 않았습니다.', 'Not uploaded.'), 'info');
        else _toast('⚠️ ' + _t('올리지 못했습니다: ', 'Upload failed: ') + r.error, 'error');
    };

    // 탭이 열릴 때마다 다시 그린다(앱 값이 바뀌었을 수 있다).
    window._docOnTabShown = function () { try { window._docRender(); } catch (e) { /* 그리기 실패가 탭을 막지 않게 */ } };
    var boot = function () {
        if (!document.getElementById('doc-page-body')) return;
        try { window._docRender(); } catch (e) { /* 〃 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
