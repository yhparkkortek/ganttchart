// ════════════════════════════════════════════════════════════════════════
// 📗 PRODUCT SPEC (제품 사양서) — Document 페이지 서식 (2026-11-24 신규)
// ════════════════════════════════════════════════════════════════════════
//  사용자 요청: "PRODUCT SPEC 문서 만들어 봅시다" + "다른 문서들과 동일한 방식으로 원본 문서와
//  동일한 정보를 앱에서 채우고(앱 정보를 자동채우기) 출력을 누르면 첨부와 동일한 문서가 나오도록".
//
//  📐 구조 (모델명세서·Sample Report 와 같은 원칙 — 원본 파일이 곧 양식)
//    · 양식 `templates/PRODUCT SPEC_양식.docx`(터치 장 없음) · `…_TOUCH.docx`(있음) 는
//      `tools/build-product-spec-template.py` 가 실제 사양서에서 **값 자리마다 표식**을 박아 만든다.
//    · 칸 목록 `templates/PRODUCT SPEC_schema.json` 하나를 화면(여기)·채우기·불러오기(백엔드)가
//      같이 쓴다 — 칸을 여기 손으로 다시 적지 않는다(두 벌이면 갈라진다).
//    · 앱이 아는 칸은 `PS_AUTO`(데이터)로 앱 값과 잇는다. 모르는 칸(핀배치·타이밍·VCP…)은
//      **[📂 불러오기]로 기존 사양서를 읽어** 채운다(같은 계열 문서면 도면 그림·쪽 맞춤 빈 줄까지).
//    · 모델(제품구분자)·리비전(V00/V01…)별로 따로 저장된다 — js/67 의 `perRevision` 그대로.
//  ⚠️ js/67 은 고치지 않고 **입구 셋**만 쓴다: `DOC_AUTO_HOOKS.ps`(자동값) · `form.docxSave`(원본저장)
//     · `form.importFile`(불러오기). 그 셋은 js/67 이 서식에 그 함수가 있을 때만 부른다.
// ════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';
    var FORM_ID = 'product-spec';
    var BACKEND = window.BACKEND_URL || 'http://127.0.0.1:5000';
    var _t = window._t || function (ko) { return ko; };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };

    // ── 🔗 앱 값 연결표 (데이터) ─────────────────────────────────────────
    //   칸 열쇠 → 차례로 시도할 출처. 앞에서 값이 나오면 그걸 쓴다.
    //   출처 모양: 'meta:<키>' · 'pl:<Project list 열>' · 'spec:<Customer SPEC 항목|별칭…>'[:0/:1 = x/y 쪼개기]
    //             · 'panel:<PARTS PANEL 항목>' · 'adbd:'·'conv:'·'touch:<라이브러리 항목>'
    //             · 'mat:<주요자재 구분>' · 'const:<글>' · 'fn:<계산 이름>'
    //   ⚠️ Customer SPEC 은 고객 요구라 **패널 라이브러리보다 먼저** 본다(광학 값).
    var SPEC = {
        lv: 'spec:Brightness(Centre. Min)|Brightness|휘도|Luminance',
        temp: 'spec:Color Temperature(K)|Color Temp',
        xy: 'spec:Color coordinate(x/y)|색좌표|Color Coordinate',
        gamut: 'spec:Color Gamut|Color Gamut(NTSC)|Color Gamut(%/NTSC)',
        uni: 'spec:Uniformity(%)|Uniformity',
        fw: 'spec:F/W Version|FW Version|Firmware|펌웨어',
        power: 'spec:Power|Input voltage|입력 전압|Power estimation'
    };
    window.PS_AUTO = window.PS_AUTO || {
        hasTouch: ['fn:hasTouch'],
        docRev: ['fn:docRev'],
        hdrKtkPn: ['meta:KTKPN'],
        issueDate: ['fn:revDate'],
        custPnLabel: ['fn:custPnLabel'],
        'cover.r1.c0': ['meta:KTKPN'],
        'cover.r1.c1': ['meta:KTK모델명'],
        'cover.r1.c2': ['pl:pn', 'meta:고객모델명'],
        // 부품 표 — 1 LCD Panel · 2 Scaler PCB · 3 BLU Converter · 4 Touch Sensor · 5 Touch Controller
        'parts.r1.c1': ['pl:panel', 'mat:PANEL'],
        'parts.r1.c2': ['const:-'],
        'parts.r1.c3': ['pl:panelMfr', 'panel:Panel Brand'],
        'parts.r2.c1': ['pl:adbd', 'mat:AD BOARD'],
        'parts.r2.c2': ['pl:adFw', SPEC.fw],
        'parts.r2.c3': ['adbd:Brand'],
        'parts.r3.c1': ['pl:bluDriver', 'mat:CONVERTER'],
        'parts.r3.c2': ['const:-'],
        'parts.r3.c3': ['conv:Brand'],
        'parts.r4.c1': ['pl:tsp', 'mat:TSP/GLASS', 'const:-'],
        'parts.r4.c2': ['const:-'],
        'parts.r5.c1': ['pl:touchCtrl', 'mat:TOUCH CTRL', 'const:-'],
        'parts.r5.c2': ['fn:touchFw'],
        'parts.r5.c3': ['touch:Brand'],
        // 개정 이력 — 리비전 R1..R5 가 각 줄(다른 리비전에 적어 둔 값을 읽어 온다)
        'rev.r1.c0': ['fn:rev:1:0'], 'rev.r1.c1': ['fn:rev:1:1'], 'rev.r1.c2': ['fn:rev:1:2'], 'rev.r1.c3': ['fn:rev:1:3'],
        'rev.r2.c0': ['fn:rev:2:0'], 'rev.r2.c1': ['fn:rev:2:1'], 'rev.r2.c2': ['fn:rev:2:2'], 'rev.r2.c3': ['fn:rev:2:3'],
        'rev.r3.c0': ['fn:rev:3:0'], 'rev.r3.c1': ['fn:rev:3:1'], 'rev.r3.c2': ['fn:rev:3:2'], 'rev.r3.c3': ['fn:rev:3:3'],
        'rev.r4.c0': ['fn:rev:4:0'], 'rev.r4.c1': ['fn:rev:4:1'], 'rev.r4.c2': ['fn:rev:4:2'], 'rev.r4.c3': ['fn:rev:4:3'],
        'rev.r5.c0': ['fn:rev:5:0'], 'rev.r5.c1': ['fn:rev:5:1'], 'rev.r5.c2': ['fn:rev:5:2'], 'rev.r5.c3': ['fn:rev:5:3'],
        scope: ['fn:scope'],
        feat1: ['fn:feat1'],
        feat3: ['const:- On Screen Display (OSD)'],
        // 인증 — CB · UL · CE · FCC (Project list 인증 칸)
        'cert.r2.c0': ['fn:cert:certCb'], 'cert.r2.c1': ['fn:cert:certUl'],
        'cert.r2.c2': ['fn:cert:certCe'], 'cert.r2.c3': ['fn:cert:certFcc'],
        pwrVoltage: ['pl:power1', SPEC.power],
        // 패널 화면 사양 — 표 행 순서 그대로(Display Area … Brightness Uniformity)
        'scr.r1.c1': ['panel:Active Area (HxV)'],
        'scr.r2.c1': ['panel:Display Color'],
        'scr.r3.c1': ['panel:Dot Resolution'],
        'scr.r4.c1': ['panel:Pixel Configuration'],
        'scr.r5.c1': ['panel:Dot Pitch (HxV)'],
        'scr.r6.c1': ['panel:Display Mode'],
        'scr.r7.c1': ['panel:Viewing Angle (L/R/U/D)'],
        'scr.r8.c1': ['panel:Transmissive Contrast Ratio'],
        'scr.r9.c1': ['panel:Response Time'],
        'scr.r10.c1': [SPEC.lv, 'panel:Brightness (Min/Typ) (cd/m²)'],
        'scr.r11.c1': [SPEC.temp, 'pl:colorTemp', 'panel:Color Temperature'],
        'scr.r12.c1': ['fn:xyPair', 'panel:White Color Coordinates'],
        'scr.r13.c1': [SPEC.gamut, 'pl:colorGamut', 'panel:NTSC Ratio'],
        'scr.r14.c1': [SPEC.uni, 'pl:uniformity'],
        panelVendor: ['pl:panelMfr', 'panel:Panel Brand'],
        // 시야각 표 — Right · Left · Up · Down (패널 'L/R/U/D' 를 쪼갠다)
        'va.r0.c4': ['fn:va:1'], 'va.r1.c4': ['fn:va:0'], 'va.r2.c4': ['fn:va:2'], 'va.r3.c4': ['fn:va:3'],
        lumYL: ['fn:lumYL'],
        // ⚠️ BLU 전류·전압·전력은 **안 잇는다** — 라이브러리엔 값이 하나뿐인데 표는 Min/Typ/Max 세 칸이라
        //    어느 칸인지 모른다(실측: 라이브러리 전압 값은 원본의 Max 칸 값이었다 — Typ 에 넣으면 조용한 오답이 된다).
        'blu.r5.c2': ['panel:Lamp Life Time (Hrs)'],
        'cie.r2.c1': [SPEC.xy + ':0', 'pl:cieX'],
        'cie.r2.c2': [SPEC.xy + ':1', 'pl:cieY'],
        'amr.r1.c2': ['fn:range:Storage Temperature:0'], 'amr.r1.c3': ['fn:range:Storage Temperature:1'],
        'amr.r2.c2': ['fn:range:Operating Temperature:0'], 'amr.r2.c3': ['fn:range:Operating Temperature:1'],
        vcpTitle: ['fn:vcpTitle'],
        // 터치 장
        'tmech.r1.c2': ['fn:size:0'], 'tmech.r2.c2': ['fn:size:1'], 'tmech.r3.c2': ['touch:Thickness'],
        'tperf.r1.c2': ['touch:Interface'], 'tperf.r2.c2': ['touch:Multi Touch'],
        'tperf.r3.c2': ['touch:Scan Speed'], 'tperf.r4.c2': ['touch:Response Time'],
        'tperf.r5.c2': ['touch:Linearity'], 'tperf.r6.c2': ['touch:Accuracy'],
        'tperf.r7.c2': ['touch:Accuracy at Edge'],
        'tpwr.r1.c2': ['touch:Input Voltage'],
        'tgen.r2.c2': ['touch:Brand'], 'tgen.r3.c2': ['pl:touchFw'],
        'tgen.r6.c2': ['pl:vidPid'],
        'tglass.r1.c2': ['pl:glassType'], 'tglass.r2.c2': ['pl:airGap']
    };
    // 앱 값의 **모양**을 문서 칸에 맞춘다(데이터) — 단위는 옆 'Unit' 칸에 이미 있어서 값에 또 붙이면
    //   '698.112 mm' + 'mm' 처럼 두 번 찍힌다(실측). 못 맞추면 받은 그대로 둔다(지우지 않는다).
    window.PS_FMT = window.PS_FMT || {
        'scr.r1.c1': 'noUnit', 'scr.r5.c1': 'noUnit', 'scr.r10.c1': 'rangeCdTight', 'scr.r11.c1': 'number',
        'scr.r12.c1': 'xyPair', 'scr.r13.c1': 'number', 'scr.r14.c1': 'minNumber',
        lumYL: 'rangeCd', 'cie.r2.c1': 'xyOne', 'cie.r2.c2': 'xyOne', 'blu.r5.c2': 'noUnit',
        'amr.r1.c2': 'signless', 'amr.r1.c3': 'signless', 'amr.r2.c2': 'signless', 'amr.r2.c3': 'signless',
        'parts.r1.c3': 'vendor', 'parts.r2.c3': 'vendor', 'parts.r3.c3': 'vendor', 'parts.r5.c3': 'vendor',
        'tgen.r2.c2': 'vendor',
        'parts.r4.c1': 'noneDash', 'parts.r5.c1': 'noneDash', 'parts.r5.c2': 'noneDash', 'parts.r2.c2': 'noneDash',
        'tgen.r3.c2': 'noneDash'
    };
    // 제조사 이름 → 문서에 쓰는 짧은 이름(데이터). 표지 Vendor 칸이 좁아서 'KORTEK Corporation' 이 두 줄로
    //   접히면 표지가 길어져 **문서 전체가 한 쪽 밀린다**(실측 22→23쪽). 없는 이름은 그대로 둔다.
    window.PS_VENDOR_SHORT = window.PS_VENDOR_SHORT || [
        { re: /^\s*kortek\b/i, name: 'Kortek' }
    ];
    // '없음' 표기(데이터) — Project list·주요자재가 빈 칸 대신 쓰는 글자들
    var PS_NONE_RE = /^\s*(x|-|–|n\/?a|no|none|없음|미적용)?\s*$/i;
    var _isNone = function (v) { return PS_NONE_RE.test(String(v == null ? '' : v)); };
    var _num = function (s) { var m = String(s).match(/-?\d[\d,]*(?:\.\d+)?/); return m ? m[0] : ''; };
    var _range = function (s) { var m = String(s).match(/(\d+(?:\.\d+)?)\s*[~∼\-–]\s*(\d+(?:\.\d+)?)/); return m ? m[1] + ' ~ ' + m[2] : ''; };
    var _stripXY = function (s) { return String(s).replace(/^\s*[xy]\s*[=:]\s*/i, '').trim(); };
    var FMT = {
        noUnit: function (v) { return String(v).replace(/\s*(mm|cm|hrs?|hours?)\s*$/i, '').trim(); },
        number: function (v) { return _num(v) || v; },
        minNumber: function (v) { return /^\s*\d+(\.\d+)?\s*%?\s*$/.test(v) ? 'Min = ' + _num(v) : v; },
        rangeCd: function (v) { var r = _range(v); return r ? r + ' cd/m2' : v; },
        rangeCdTight: function (v) { var r = _range(v); return r ? r + 'cd/m2' : v; },
        xyOne: function (v) { return _stripXY(v); },
        xyPair: function (v) {
            var m = String(v).match(/(\d*\.\d+)[^\d.]+(\d*\.\d+)/);
            return m ? 'x=' + m[1] + ', y=' + m[2] : v;
        },
        signless: function (v) { return String(v).replace(/^\s*\+/, '').trim(); },
        noneDash: function (v) { return _isNone(v) ? '-' : v; },
        vendor: function (v) {
            var hit = (window.PS_VENDOR_SHORT || []).filter(function (x) { return x.re.test(v); })[0];
            return hit ? hit.name : v;
        }
    };
    // 고객 PN 머리글 낱말(표지 표의 'SG PN' 칸) — 고객사 이름에 맞춰 (데이터)
    window.PS_CUST_PN_LABEL = window.PS_CUST_PN_LABEL || [
        { re: /LNW|L&W|LIGHT\s*&?\s*WONDER|SCIENTIFIC|\bSG\b/i, label: 'SG PN' }
    ];
    var PS_CUST_PN_DEFAULT = 'Customer PN';
    // 글 틀(데이터) — {자리}는 앱 값으로
    window.PS_TEXT = window.PS_TEXT || {
        scope: 'This document is the specification of {inch}” TFT-LCD MONITOR. {model} is a High quality TFT-LCD display solution for industrial display device having RoHS conformity.',
        feat1: '- Supports up to {res}, {hz}Hz for {inch}”'
    };

    // ── 📋 칸 목록(양식에서 뽑은 JSON) ──────────────────────────────────
    var _schema = null, _schemaErr = '';
    var _loadSchema = function () {
        var ver = (document.querySelector('script[src*="76-product-spec"]') || {}).src || '';
        var v = (ver.match(/[?&]v=([^&]+)/) || [])[1] || String(Date.now());
        return fetch('templates/PRODUCT SPEC_schema.json?v=' + v, { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (j) {
                _schema = j; _built = null;
                if (window._docState && window._docState.formId === FORM_ID && window._docRender) window._docRender();
            })
            .catch(function (e) { _schemaErr = (e && e.message) || String(e); });
    };

    // 화면 구역 만들기 — 양식 본문 순서(bodyIndex)대로, 그룹 제목으로 나눈다.
    var _built = null;
    var _buildSections = function () {
        if (!_schema) {
            return [{ title: _t('양식 목록을 불러오는 중…', 'Loading…'), cols: 2,
                      fields: [{ key: '__psLoading', label: _schemaErr ? ('⚠️ ' + _schemaErr) : '…' }] }];
        }
        if (_built) return _built;
        var items = [];
        Object.keys(_schema.paras).forEach(function (k) {
            var p = _schema.paras[k];
            items.push({ at: p.bodyIndex, kind: 'para', key: k, info: p });
        });
        Object.keys(_schema.tables).forEach(function (k) {
            var t = _schema.tables[k];
            items.push({ at: t.bodyIndex == null ? 9999 : t.bodyIndex, kind: 'table', key: k, info: t });
        });
        Object.keys(_schema.images).forEach(function (k) {
            var im = _schema.images[k];
            items.push({ at: im.bodyIndex, kind: 'image', key: k, info: im });
        });
        items.sort(function (a, b) { return a.at - b.at; });
        var groups = (_schema.groups || []).slice().sort(function (a, b) { return a.from - b.from; });
        var groupOf = function (at) {
            var g = groups[0];
            groups.forEach(function (x) { if (at >= x.from) g = x; });
            return g;
        };
        var out = [];
        // 맨 앞 — 터치 장 스위치(이게 출력 양식 두 판 중 하나를 고른다)
        out.push({ title: _t('출력 설정', 'Output'), cols: 2, fields: [
            { key: 'hasTouch', label: _t('Touch Controller 장 (YES/NO)', 'Touch Controller chapter (YES/NO)'),
              from: 'ps:hasTouch', hint: 'YES / NO' }
        ] });
        var curFields = null, lastGroup = null;
        var groupTouch = function (g) { return /Touch/i.test(g.title); };
        items.forEach(function (it) {
            var g = groupOf(it.at);
            var touchOnly = (it.info.when === 'touch') || (groupTouch(g) && it.info.when !== 'both');
            var head = (g !== lastGroup) ? g.title : '';
            if (g !== lastGroup) { curFields = null; lastGroup = g; }
            if (it.kind === 'para') {
                if (!curFields || curFields.__touch !== touchOnly) {
                    curFields = { title: head, cols: 2, fields: [], __touch: touchOnly, __group: g.title };
                    out.push(curFields);
                    head = '';
                }
                var long = /scope|feat|ledBar|vcpTitle|adH|conv/.test(it.key);
                curFields.fields.push({ key: it.key, label: it.info.label + (it.info.optional ? _t(' (비우면 줄 삭제)', ' (blank = drop line)') : ''),
                                        from: window.PS_AUTO[it.key] ? 'ps:' + it.key : null, wide: long });
            } else if (it.kind === 'table') {
                curFields = null;
                var rows = (it.info.rows || []).map(function (r) {
                    return { cells: (r.cells || []).map(function (c) {
                        if (c.key) return { key: c.key, from: window.PS_AUTO[c.key] ? 'ps:' + c.key : null };
                        return { fixed: c.merged ? '〃' : (c.fixed || '') };
                    }) };
                });
                out.push({ title: (head ? head + ' · ' : '') + it.info.title, kind: 'table', columns: [], rows: rows,
                           __touch: touchOnly });
            } else if (it.kind === 'image') {
                curFields = null;
                out.push({ title: (head ? head + ' · ' : '') + '🖼 ' + it.info.label, kind: 'attach', key: it.key,
                           hint: _t('그림을 끌어다 놓거나 올려 주세요(첫 장이 문서에 들어갑니다). 기존 사양서를 [📂 불러오기] 하면 원본 그림이 그대로 들어옵니다.',
                                    'Drop an image (the first one goes into the document).'),
                           __touch: touchOnly, __when: it.info.when });
            }
        });
        // 제목이 없는 글 묶음 — 칸이 하나면 그 칸 이름(예: 'A/D connector 1 — title'), 여럿이면 그룹 이름
        out.forEach(function (s) {
            if (s.title || !s.fields) return;
            s.title = s.fields.length === 1 ? s.fields[0].label : s.__group;
        });
        // ℹ️ 측정 방법·Incoming Inspection Standard 는 회사 공통 기준이라 양식 그대로 들어간다(입력 칸 없음 — 서식 note 에 적었다).
        _built = out;
        return out;
    };

    // ── 🔎 자동값 ──────────────────────────────────────────────────────
    var _plRow = function (ctx) {
        var pn = String((ctx.meta && ctx.meta.KTKPN) || '').replace(/\D/g, '');
        if (!pn) return null;
        var rows = (window._plData && window._plData.rows) || [];
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i].ktkPn || '').replace(/\D/g, '') === pn) return rows[i];
        }
        return null;
    };
    var _matDesc = function (ctx, cat) {
        var hit = (ctx.materials || []).filter(function (m) { return m.cat === cat; })[0];
        return hit ? (hit.desc || hit.pn || '') : '';
    };
    var _norm = function (s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); };
    var _specVal = function (ctx, names) {
        var want = names.map(_norm);
        var row = (ctx.spec || []).filter(function (r) { return want.indexOf(_norm(r.label)) >= 0; })[0];
        return row ? { v: String(row.value || '').trim(), label: row.label } : null;
    };
    // PARTS 라이브러리 기록 — 이 모델의 부품 이름으로 찾는다(라이브러리는 비동기로 한 번 받아 둔다)
    var LIB = { panel: { cat: 'PANEL', pl: 'panel' }, adbd: { cat: 'AD BOARD', pl: 'adbd', type: 'adbd' },
                conv: { cat: 'CONVERTER', pl: 'bluDriver', type: 'convbd' },
                touch: { cat: 'TOUCH CTRL', pl: 'touchCtrl', type: 'touchctrl' } };
    var _libPending = {};
    var _libRec = function (ctx, which) {
        var L = LIB[which], cache = window._epLibCache || {};
        var lib = which === 'panel' ? cache.panel : cache[L.type];
        if (!lib) {
            if (!_libPending[which]) {
                _libPending[which] = 1;
                var p = which === 'panel' ? (window.loadPanelLibrary && window.loadPanelLibrary())
                                         : (window.loadElecPartLibrary && window.loadElecPartLibrary(L.type));
                if (p && p.then) p.then(function () {
                    if (window._docState && window._docState.formId === FORM_ID && window._docRender) window._docRender();
                });
            }
            return null;
        }
        var row = _plRow(ctx) || {};
        var names = [row[L.pl], _matDesc(ctx, L.cat)].filter(Boolean);
        for (var i = 0; i < names.length; i++) {
            var rec = which === 'panel' ? (window.findPanelInLibrary && window.findPanelInLibrary(lib, names[i]))
                                        : (window.findElecPartInLibrary && window.findElecPartInLibrary(lib, names[i]));
            if (rec && rec.specs) return rec;
        }
        return null;
    };
    var _revNo = function () {
        var r = window._docActiveRevision ? window._docActiveRevision(FORM_ID) : 'R1';
        return Math.max(0, (parseInt(String(r || 'R1').slice(1), 10) || 1) - 1);
    };
    var _pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var _todayDash = function () { var d = new Date(); return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()); };
    var _maxRes = function () {
        var rows = window.resSelectedRows ? window.resSelectedRows() : [];
        var best = null;
        rows.forEach(function (r) {
            var m = String(r.label || '').match(/(\d{3,5})\s*[x×X]\s*(\d{2,5})[ip]?\s*@\s*([\d.]+)/);
            if (!m) return;
            var px = (+m[1]) * (+m[2]);
            if (!best || px > best.px) best = { w: m[1], h: m[2], hz: Math.round(parseFloat(m[3])), px: px };
        });
        return best;
    };
    var _inch = function (ctx) {
        var row = _plRow(ctx) || {};
        return String(row.panelInch || (ctx.meta && ctx.meta.인치) || '').replace(/["”]/g, '').trim();
    };
    var _split = function (v, i) {
        var parts = String(v || '').split(/\s*(?:~|\/|,|to)\s*/i).filter(function (x) { return x !== ''; });
        return parts.length > i ? parts[i] : '';
    };
    var _otherRevField = function (n, key) {
        var f = window._docRevisionFields ? window._docRevisionFields(FORM_ID, 'R' + n) : null;
        return f ? f[key] : undefined;
    };
    var FN = {
        hasTouch: function (ctx) {
            // ⚠️ Project list 는 '없음'을 `X` 로 적는다(실측 — 터치 없는 구분자) — 글자가 있다고 '있음'이 아니다.
            //    Project list 에 이 제품이 있으면 그걸 믿고, 없을 때만 **이 모델 카드 자신의** 주요자재를 본다
            //    (ctx.materials 는 다른 모델 카드로 폴백하므로 다른 구분자의 터치가 새어 들어온다).
            var row = _plRow(ctx);
            var has;
            if (row && Object.prototype.hasOwnProperty.call(row, 'touchCtrl')) {
                has = !_isNone(row.touchCtrl);
            } else {
                var card = ((window.tabData || {}).projectModels || []).filter(function (m) { return m && m.unitId === (window.mcActiveUnit || ''); })[0];
                var mats = (card && card.materials) || [];
                has = mats.some(function (m) { return m && m.category === 'TOUCH CTRL' && !_isNone(m.description || m.ktkPn); });
            }
            return { v: has ? 'YES' : 'NO', src: _t('Project list · 이 모델 주요자재 TOUCH CTRL 유무', 'touch controller present?') };
        },
        // 터치 컨트롤러가 없으면 F/W 도 '-' — Project list 에 컨트롤러는 X 인데 F/W 가 적힌 행이 있다(실측)
        touchFw: function (ctx) {
            if (FN.hasTouch(ctx).v !== 'YES') return { v: '-', src: _t('터치 컨트롤러 없음', 'no touch controller') };
            var row = _plRow(ctx) || {};
            return { v: _isNone(row.touchFw) ? '-' : String(row.touchFw).trim(), src: 'Project list ▸ touchFw' };
        },
        docRev: function () { return { v: 'V' + _pad(_revNo()), src: _t('지금 보는 리비전', 'current revision') }; },
        revDate: function () { return { v: _todayDash(), src: _t('오늘 날짜', 'today') }; },
        custPnLabel: function (ctx) {
            var c = String((ctx.meta && ctx.meta.고객사) || '');
            var hit = (window.PS_CUST_PN_LABEL || []).filter(function (x) { return x.re.test(c); })[0];
            return { v: hit ? hit.label : PS_CUST_PN_DEFAULT, src: _t('고객사로 정함', 'by customer') };
        },
        rev: function (ctx, a) {
            var n = +a[0], col = +a[1];
            var revs = window._docRevisions ? window._docRevisions(FORM_ID) : ['R1'];
            if (revs.indexOf('R' + n) < 0) return { v: '', src: '' };
            var own = _otherRevField(n, 'rev.r' + n + '.c' + col);
            if (own !== undefined && own !== null && String(own) !== '') return { v: String(own), src: 'R' + n };
            if (col === 0) {
                var d = _otherRevField(n, 'issueDate');
                return { v: d || (n === _revNo() + 1 ? _todayDash() : ''), src: 'R' + n + ' ISSUE DATE' };
            }
            if (col === 1) return { v: _pad(n - 1), src: 'R' + n };
            if (col === 2) return { v: n === 1 ? 'All' : '', src: '' };
            return { v: n === 1 ? '1’st issued' : '', src: '' };
        },
        scope: function (ctx) {
            // Scope 는 **제품 인치**(Summary, 예 32”) — 원본이 그렇다. 패널 실치수(31.5”)는 Features 쪽이다.
            var inch = String((ctx.meta && ctx.meta.인치) || _inch(ctx)).replace(/["”]/g, '').trim();
            var model = (ctx.meta && ctx.meta.KTK모델명) || '';
            if (!model) return { v: '', src: _t('Summary ▸ KTK 모델명 없음', 'no model name') };
            return { v: window.PS_TEXT.scope.replace('{inch}', inch).replace('{model}', model),
                     src: 'Summary ▸ KTK ' + _t('모델명·인치', 'model/inch') };
        },
        feat1: function (ctx) {
            // "Supports up to" = **패널 원래 해상도**(PARTS 패널 Dot Resolution → Customer SPEC Native Resolution).
            //   ⚠️ 지원 해상도 중 최대를 쓰면 안 된다 — 실측 프로젝트는 4K@30 을 '받기만' 하는데
            //   그걸 집어 'Supports up to <4K>, 30Hz' 가 됐다(원본은 패널 원래 해상도·60Hz).
            var r = null, src = '';
            var rec = _libRec(ctx, 'panel');
            var nat = (rec && rec.specs['Dot Resolution']) || ((_specVal(ctx, ['Native Resolution', '해상도', 'Resolution']) || {}).v) || '';
            var nm = String(nat).match(/(\d{3,5})\D{1,8}?(\d{3,5})/);
            if (nm) {
                r = { w: nm[1], h: nm[2], hz: 60 };
                src = rec ? 'PARTS ▸ PANEL ▸ Dot Resolution' : 'Customer SPEC ▸ Native Resolution';
                (window.resSelectedRows ? window.resSelectedRows() : []).forEach(function (x) {
                    var m = String(x.label || '').match(/(\d{3,5})\s*[x×X]\s*(\d{2,5})[ip]?\s*@\s*([\d.]+)/);
                    if (m && m[1] === r.w && m[2] === r.h) r.hz = Math.round(parseFloat(m[3]));
                });
            } else {
                r = _maxRes();
                src = _t('지원 해상도 중 최대', 'max picked resolution');
            }
            if (!r) return { v: '', src: _t('패널 해상도·지원 해상도 없음', 'no resolution') };
            var row = _plRow(ctx) || {};
            var inch = String(row.panelInch || _inch(ctx)).replace(/["”]/g, '');
            return { v: window.PS_TEXT.feat1.replace('{res}', r.w + ' x ' + r.h).replace('{hz}', r.hz).replace('{inch}', inch),
                     src: src };
        },
        cert: function (ctx, a) {
            var row = _plRow(ctx);
            if (!row) return { v: '', src: _t('Project list 에 이 KTK PN 없음', 'not in Project list') };
            var v = String(row[a[0]] || '').trim();
            if (!v) return { v: '', src: 'Project list' };
            return { v: /^(x|no|n|-)$/i.test(v) ? 'X' : (/^o$/i.test(v) ? 'O' : 'O'), src: 'Project list ▸ ' + a[0] };
        },
        xyPair: function (ctx) {
            var s = _specVal(ctx, SPEC.xy.slice(5).split('|'));
            if (!s || !s.v) return { v: '', src: '' };
            var x = _split(s.v, 0), y = _split(s.v, 1);
            return { v: (x && y) ? ('x=' + x + ', y=' + y) : s.v, src: 'Customer SPEC ▸ ' + s.label };
        },
        va: function (ctx, a) {
            var rec = _libRec(ctx, 'panel');
            var v = rec && rec.specs['Viewing Angle (L/R/U/D)'];
            return { v: _split(v, +a[0]), src: v ? 'PARTS ▸ PANEL' : '' };
        },
        lumYL: function (ctx) {
            var s = _specVal(ctx, SPEC.lv.slice(5).split('|'));
            if (!s || !s.v) return { v: '', src: '' };
            return { v: s.v + (/cd/i.test(s.v) ? '' : ' cd/m2'), src: 'Customer SPEC ▸ ' + s.label };
        },
        range: function (ctx, a) {
            var rec = _libRec(ctx, 'panel');
            var v = rec && rec.specs[a[0]];
            return { v: _split(String(v || '').replace(/℃|°C/g, ''), +a[1]), src: v ? 'PARTS ▸ PANEL ▸ ' + a[0] : '' };
        },
        size: function (ctx, a) {
            var rec = _libRec(ctx, 'touch');
            var v = rec && rec.specs['Board Size (WxH)'];
            var parts = String(v || '').split(/\s*[x×*]\s*/i);
            return { v: parts.length > +a[0] ? parts[+a[0]] : '', src: v ? 'PARTS ▸ TOUCH CTRL' : '' };
        },
        vcpTitle: function (ctx) {
            var c = String((ctx.meta && ctx.meta.고객사) || '').split('>')[0].trim();
            return { v: c ? c + ' VCP Specification' : 'VCP Specification', src: 'Summary ▸ ' + _t('고객사', 'customer') };
        }
    };
    var _resolve = function (ctx, token) {
        var i = token.indexOf(':');
        var kind = token.slice(0, i), arg = token.slice(i + 1);
        if (kind === 'const') return { v: arg, src: _t('기본값', 'default') };
        if (kind === 'meta') {
            var mv = String((ctx.meta && ctx.meta[arg]) || '').trim();
            return { v: mv, src: 'Summary ▸ ' + arg };
        }
        if (kind === 'pl') {
            var row = _plRow(ctx);
            return { v: row ? String(row[arg] || '').trim() : '', src: 'Project list ▸ ' + arg };
        }
        if (kind === 'mat') return { v: _matDesc(ctx, arg), src: 'Summary ▸ ' + _t('주요자재', 'materials') + ' ' + arg };
        if (kind === 'spec') {
            var pick = null, m = arg.match(/^(.*):(\d)$/);
            if (m) { arg = m[1]; pick = +m[2]; }
            var s = _specVal(ctx, arg.split('|'));
            if (!s) return { v: '', src: '' };
            return { v: pick === null ? s.v : _split(s.v, pick), src: 'Customer SPEC ▸ ' + s.label };
        }
        if (LIB[kind]) {
            var rec = _libRec(ctx, kind);
            var lv = rec ? String(rec.specs[arg] || '').trim() : '';
            return { v: lv, src: 'PARTS ▸ ' + LIB[kind].cat + ' ▸ ' + arg };
        }
        if (kind === 'fn') {
            var a = arg.split(':');
            var f = FN[a[0]];
            return f ? f(ctx, a.slice(1)) : { v: '', src: '' };
        }
        return { v: '', src: '' };
    };
    // js/67 `_autoOf` 가 'ps:<칸>' 을 이리 보낸다
    window.DOC_AUTO_HOOKS = window.DOC_AUTO_HOOKS || {};
    window.DOC_AUTO_HOOKS.ps = function (ctx, key) {
        var list = window.PS_AUTO[key] || [];
        var lastSrc = '';
        for (var i = 0; i < list.length; i++) {
            var r = _resolve(ctx || {}, list[i]) || { v: '', src: '' };
            if (r.v !== '' && r.v != null) {
                var fmt = FMT[(window.PS_FMT || {})[key]];
                var out = String(r.v);
                if (fmt) { try { out = String(fmt(out)); } catch (eF) { /* 받은 그대로 */ } }
                return { v: out, src: r.src };
            }
            if (r.src && !lastSrc) lastSrc = r.src;
        }
        return { v: '', src: lastSrc ? _t('앱에 값 없음 — ', 'empty — ') + lastSrc : '' };
    };

    // ── 터치 판인가 ─────────────────────────────────────────────────────
    var _touchOn = function () {
        var own = window._docFieldOwn ? window._docFieldOwn(FORM_ID, 'hasTouch') : undefined;
        var v = own;
        if (v === undefined || v === null || v === '') {
            var ctx = window._dgCollect ? window._dgCollect() : { meta: {} };
            v = FN.hasTouch(ctx).v;
        }
        return /^(y|yes|o|1|true|있음)/i.test(String(v).trim());
    };

    // ── 📤 원본저장 — 칸 값·그림을 모아 백엔드 양식 채우기로 ─────────────────
    var _allKeys = function () {
        var keys = [];
        if (!_schema) return keys;
        Object.keys(_schema.paras).forEach(function (k) { keys.push(k); });
        Object.keys(_schema.header || {}).forEach(function (k) { keys.push(k); });
        Object.keys(_schema.tables).forEach(function (pre) {
            (_schema.tables[pre].rows || []).forEach(function (r) {
                (r.cells || []).forEach(function (c) { if (c.key) keys.push(c.key); });
            });
        });
        return keys;
    };
    var _valueOf = function (ctx, key) {
        var own = window._docFieldOwn ? window._docFieldOwn(FORM_ID, key) : undefined;
        if (own !== undefined) return own;
        return window.PS_AUTO[key] ? window.DOC_AUTO_HOOKS.ps(ctx, key).v : '';
    };
    var _enDate = function () {
        var d = new Date(), M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var n = d.getDate(), s = (n % 10 === 1 && n !== 11) ? 'st' : (n % 10 === 2 && n !== 12) ? 'nd' : (n % 10 === 3 && n !== 13) ? 'rd' : 'th';
        return M[d.getMonth()] + ' ' + n + s + ' ' + d.getFullYear();
    };
    window._psPayload = function () {
        var ctx = window._dgCollect ? window._dgCollect() : { meta: {} };
        var values = {};
        _allKeys().forEach(function (k) { values[k] = _valueOf(ctx, k); });
        var d = window._docDataOf ? window._docDataOf(FORM_ID) : { att: {} };
        var images = {};
        Object.keys((_schema && _schema.images) || {}).forEach(function (k) {
            var list = (d.att && d.att[k]) || [];
            if (list.length) images[k] = list.map(function (a) {
                var o = { folder: a.folder, name: a.name };
                ['cx', 'cy', 'ph', 'pv'].forEach(function (x) { if (typeof a[x] === 'number') o[x] = a[x]; });
                return o;
            });
        });
        var variant = _touchOn() ? 'touch' : 'base';
        var lay = d.psLayout && d.psLayout.variant === variant ? d.psLayout.gaps : null;
        return { variant: variant, values: values, images: images, layout: lay,
                 author: window._appUserKey || window.currentUserName || '' };
    };
    var _fileName = function (ctx) {
        var cust = String((ctx.meta && ctx.meta.고객사) || '').split('>')[0].trim();
        var pn = _valueOf(ctx, 'cover.r1.c2') || (ctx.meta && ctx.meta.KTKPN) || '';
        var unit = window.mcActiveUnit || '';
        var parts = ['P03_Specification', cust, pn, unit, 'V' + _pad(_revNo()), _enDate()].filter(Boolean);
        return parts.join('_').replace(/[\\/:*?"<>|]/g, '-');
    };

    var _docxSave = async function (ctx, name) {
        if (!_schema) { _toast('⚠️ ' + _t('양식 목록을 아직 못 불러왔습니다.', 'Template list not loaded.'), 'error'); return true; }
        var payload = window._psPayload();
        payload.name = name;
        var res, blob = null, why = '';
        try {
            res = await fetch(BACKEND + '/doc/product-spec-docx', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            if (res.ok) blob = await res.blob();
            else { try { why = (await res.json()).error || ''; } catch (e0) { why = 'HTTP ' + res.status; } }
        } catch (e) { why = (e && e.message) || String(e); }
        if (!blob) {
            _toast('⚠️ ' + (res && res.status === 404
                ? _t('백엔드를 재시작해야 PRODUCT SPEC 원본 양식을 쓸 수 있습니다.', 'Restart the backend to use the PRODUCT SPEC template.')
                : _t('만들지 못했습니다: ', 'Failed: ') + why), 'error');
            return true;
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        var missing = Object.keys(_schema.images).filter(function (k) {
            var im = _schema.images[k];
            if (im.when === 'touch' && payload.variant !== 'touch') return false;
            if (im.when === 'base' && payload.variant !== 'base') return false;
            return !payload.images[k];
        });
        _toast('💾 ' + name + ' (' + Math.round(blob.size / 1024) + 'KB, ' + _t('원본 양식', 'original template') + ')'
            + (missing.length ? ' — ' + _t('그림 없는 칸 ' + missing.length + '곳은 비워 뒀습니다', missing.length + ' image slot(s) left empty') : ''),
            missing.length ? 'warning' : 'success');
        return true;
    };

    // ── 📂 불러오기 — 기존 사양서(.docx)를 읽어 칸·그림·쪽 맞춤까지 ─────────
    var _b64ToFile = function (b64, name, mime) {
        var bin = atob(b64), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new File([arr], name, { type: mime || 'application/octet-stream' });
    };
    var _importFile = async function (file) {
        if (!/\.docx$/i.test(file.name || '')) {
            _toast('⚠️ ' + _t('PRODUCT SPEC 은 Word 사양서(.docx)를 불러옵니다.', 'Pick a .docx specification.'), 'warning');
            return;
        }
        _toast('⏳ ' + _t('사양서를 읽는 중…', 'Reading…'), 'info');
        var fd = new FormData();
        fd.append('file', file, file.name);
        var res, j = null;
        try {
            res = await fetch(BACKEND + '/doc/product-spec-parse', { method: 'POST', body: fd });
            j = await res.json();
        } catch (e) {
            _toast('⚠️ ' + (res && res.status === 404
                ? _t('백엔드를 재시작해야 불러올 수 있습니다.', 'Restart the backend.')
                : _t('읽지 못했습니다: ', 'Failed: ') + ((e && e.message) || e)), 'error');
            return;
        }
        if (!j || !j.ok) { _toast('⚠️ ' + ((j && j.error) || _t('읽지 못했습니다.', 'Failed.')), 'error'); return; }
        var ratio = j.align && j.align.ratio;
        var nVal = Object.keys(j.values || {}).length, nImg = Object.keys(j.images || {}).length;
        var msg = _t('이 사양서에서 칸 ' + nVal + '개 · 그림 ' + nImg + '장을 가져옵니다.\n',
                     'Import ' + nVal + ' cells and ' + nImg + ' images.\n')
            + _t('터치 장: ', 'Touch chapter: ') + (j.variant === 'touch' ? 'YES' : 'NO') + '\n'
            + _t('양식과 맞는 정도: ', 'Structure match: ') + Math.round((ratio || 0) * 100) + '%'
            + (ratio < 0.9 ? _t('\n⚠️ 양식과 구조가 많이 달라 일부 칸이 엉뚱한 자리로 갈 수 있습니다.', '\n⚠️ Structure differs.') : '')
            + _t('\n\n앱이 아는 칸(KTK PN·패널 사양 등)은 앱 값을 그대로 두고, 앱이 모르는 칸만 채웁니다. 이 리비전의 그림은 바뀝니다. 계속할까요?',
                 '\n\nApp-known cells keep app values; only the rest is filled. Continue?');
        if (!confirm(msg)) return;
        var ctx = window._dgCollect ? window._dgCollect() : { meta: {} };
        var d = window._docDataOf(FORM_ID);
        var put = 0, kept = 0;
        Object.keys(j.values || {}).forEach(function (k) {
            var v = j.values[k];
            if (v == null) return;
            // 빈 칸은 적지 않는다 — 출력은 같고(빈 칸), 화면에 '✏️ 직접 적음' 이 수백 개 붙지 않는다
            if (!String(v).trim()) { if (Object.prototype.hasOwnProperty.call(d.fields, k)) delete d.fields[k]; return; }
            var auto = window.PS_AUTO[k] ? window.DOC_AUTO_HOOKS.ps(ctx, k).v : '';
            // 앱이 아는 칸은 앱 값을 둔다(앱 값이 비었을 때만 불러온 값) — "앱 정보 자동채우기" 가 이긴다
            if (auto) {
                if (String(auto) !== String(v) && Object.prototype.hasOwnProperty.call(d.fields, k)) delete d.fields[k];
                kept++;
                return;
            }
            d.fields[k] = String(v);
            put++;
        });
        d.fields.hasTouch = j.variant === 'touch' ? 'YES' : 'NO';
        d.psLayout = j.layout ? { variant: j.variant, gaps: j.layout } : null;
        // 그림 — NAS 첨부로 올리고(문서엔 참조만) 원래 크기·자리도 같이 둔다
        var keys = Object.keys(j.images || {});
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i], im = j.images[k];
            d.att[k] = [];
            await window._docAttachAdd(FORM_ID, k, [_b64ToFile(im.b64, k + '.' + (im.ext || 'png'), im.mime)]);
            var last = (d.att[k] || [])[d.att[k].length - 1];
            if (last) ['cx', 'cy', 'ph', 'pv'].forEach(function (x) { if (typeof im[x] === 'number') last[x] = im[x]; });
        }
        // 저장 대상으로 표시 — 앱의 진짜 표시는 `_markNonGanttDirty`(js/04a). (`markUnsavedChanges` 는 앱에 없다)
        if (window._markNonGanttDirty) window._markNonGanttDirty();
        _built = null;
        if (window._docRender) window._docRender();
        _toast('📥 ' + _t('불러왔습니다 — 칸 ' + put + '개 채움 · 앱 값 유지 ' + kept + '개 · 그림 ' + keys.length + '장'
            + (j.skipped && j.skipped.length ? ' · 못 읽음 ' + j.skipped.length + '개' : ''),
            'Imported ' + put + ' cells, ' + keys.length + ' images'), (j.skipped && j.skipped.length) ? 'warning' : 'success');
    };

    // ── 서식 등록 ──────────────────────────────────────────────────────
    var form = {
        id: FORM_ID, icon: '📗', label: 'PRODUCT SPEC', folder: 'PRODUCT SPEC',
        perRevision: true,
        note: _t('제품 사양서(P03 Specification). 앱이 아는 칸(KTK PN·모델명·부품·패널·광학·인증·지원 해상도)은 자동으로 채워지고,'
            + ' 앱에 없는 칸(핀배치·타이밍·VCP·도면)은 헤더의 [📂 불러오기]로 **기존 사양서(.docx)** 를 읽으면 그림·쪽 맞춤까지 그대로 들어옵니다.'
            + ' [💾 원본저장]은 원본과 같은 Word 문서로 나옵니다. 모델(제품구분자)·리비전(V00/V01…)별로 따로 저장됩니다.',
            'Product specification. App-known cells fill automatically; import an existing spec (.docx) for the rest.'),
        nameOf: function (ctx) { return _fileName(ctx) + '.docx'; },
        docxSave: _docxSave,
        importFile: _importFile
    };
    Object.defineProperty(form, 'sections', {
        enumerable: true,
        get: function () {
            var all = _buildSections();
            var touch = _touchOn();
            return all.filter(function (s) {
                if (s.__touch && !touch) return false;
                if (s.__when === 'base' && touch) return false;
                if (s.__when === 'touch' && !touch) return false;
                return true;
            });
        }
    });
    window.DOC_FORMS = window.DOC_FORMS || [];
    if (!window.DOC_FORMS.some(function (f) { return f.id === FORM_ID; })) window.DOC_FORMS.push(form);
    _loadSchema();
})();
