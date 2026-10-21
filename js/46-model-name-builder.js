/* ================================================================
   46-model-name-builder.js
   🧩 KORTEK 모델명 만들기 — 사내 명명 규칙을 따라 한 글자씩 골라 조립
   ================================================================
   · 근거 문서: "KORTEK Model name Descriptions" V10 (2024-05-13, Rev10)
   · 구조:  KT + 제품구분(1) + 외형/크기(3) + 입력전원(1) + 터치(1) + 고객사(1) + 일련번호(2)
     예)   KTS195DPI01  =  KT · S(STD) · 195(19.5인치) · D(DC) · P(PCT) · I(I.G.T) · 01
   · 코드가 아니라 **데이터**다(MNB_CHART) — 규칙이 개정되면 이 표만 고친다.
   · 표 값은 Word 표를 **셀 단위로** 읽어 확정했다(2026-10-21). 처음엔 문서를 통짜 텍스트로
     뽑아 읽어서 제품구분·터치·고객사에 오류가 있었다(아래 각 항목 주석 참고) — 표가 셀 경계
     없이 한 줄로 이어져 나오면 추측이 섞인다. 다시 확인할 일이 있으면 Word COM으로
     doc.Tables(n).Cell(r,c).Range.Text 를 읽을 것.
   ----------------------------------------------------------------
   · window._mnbOpen(targetInputId)   빌더 열기 (완성되면 그 입력란에 삽입)
   · window._mnbCompose(sel)          선택값 → 모델명 문자열 (순수함수, 테스트 가능)
   · window._mnbParse(name)           모델명 → 선택값 역파싱 (기존 값 불러오기용)
================================================================ */

(function() {
'use strict';

var _en = function() { return window._currentLang === 'en'; };
var _t  = function(ko, en) { return _en() ? en : ko; };

// ── 명명 규칙 표 (문서 V10) ───────────────────────────────────────────
window.MNB_CHART = {
    prefix: 'KT',
    // 2. 제품 구분 (문서 3쪽 주황색 표) — Word 표를 셀 단위로 읽어 확정(2026-10-21).
    //    ⚠️ 처음엔 문서를 통짜 텍스트로 뽑아 읽는 바람에 Z(3DP)·T(KTTP)·M(MLD)·D(KRYPTONE)·P를
    //    현재 항목처럼 넣었는데, 실제 표에는 **없다**. Rev08("Product type 삭제 : Z, P, T, M ->
    //    E(Extra)")로 사라진 것들이 본문 다른 곳에 흔적만 남아 있던 것이다. 현재 표는 아래 7개뿐.
    //    L도 'SUB/PT'가 아니라 'SUB/PTD'가 맞다.
    type: [
        { code: 'S', name: 'STD',         nameKo: '표준' },
        { code: 'C', name: 'CURVED',      nameKo: '커브드' },
        { code: 'B', name: 'BUTTON DECK', nameKo: '버튼 데크' },
        { code: 'K', name: 'SET',         nameKo: 'SET' },
        { code: 'L', name: 'SUB/PTD',     nameKo: 'SUB/PTD' },
        { code: 'E', name: 'Extra',       nameKo: '기타 — 3D·KTMP·KTTP·MLD 통합' },
        { code: 'N', name: 'LED',         nameKo: 'LED — 모든 제품 (wo/Deco)' }
    ],
    // Rev08에서 E(Extra)로 통합되어 더는 쓰지 않는 코드 — 옛 모델명을 읽을 때의 참고용
    typeRetired: ['Z(3D)', 'P', 'T(KTTP)', 'M(MLD)'],
    // 4. 입력 전원 (초록색 칸)
    power: [
        { code: 'A', name: 'AC POWER', nameKo: '교류(AC)' },
        { code: 'D', name: 'DC POWER', nameKo: '직류(DC)' }
    ],
    // 5. 터치 방식 (파란색 칸)
    touch: [
        { code: 'R', name: 'RESISTIVE',       nameKo: '감압식' },
        { code: 'C', name: 'CAPACITIVE',      nameKo: '정전식' },
        { code: 'P', name: 'PCT',             nameKo: 'PCT' },
        { code: 'V', name: 'MCT',             nameKo: 'MCT' },
        { code: 'I', name: 'IR',              nameKo: '적외선' },
        { code: 'O', name: 'OPTICAL',         nameKo: '광학식' },
        { code: 'M', name: 'MULTI TOUCH',     nameKo: '멀티터치' },
        { code: 'S', name: 'SAW',             nameKo: 'SAW' },
        { code: 'G', name: 'GLASS',           nameKo: '글라스' },
        { code: 'B', name: 'MECHANICAL BUTTON', nameKo: '기계식 버튼' },
        { code: 'N', name: 'NONE',            nameKo: '없음' }
    ],
    // 6. 고객사 (남색 칸)
    customer: [
        { code: 'I', name: 'I.G.T' },
        { code: 'W', name: 'WMS' },
        { code: 'E', name: 'EUROCOIN' },
        { code: 'A', name: 'ARISTOCRAT' },
        { code: 'G', name: 'GTECH' },
        { code: 'Z', name: 'ZITRO' },
        { code: 'K', name: 'KONAMI' },
        { code: 'S', name: 'LNW(SG)' },   // ⚠️ 표에는 'LNW(SG)' — 'SG'로만 적으면 이 회사 최대 고객을 못 알아본다
        { code: '1', name: 'AMERICAN AREA',   nameKo: '미주 지역' },
        { code: '2', name: 'EUROPEAN AREA',   nameKo: '유럽 지역' },
        { code: '3', name: 'AUSTRALIAN AREA', nameKo: '호주 지역' },
        { code: '4', name: 'ETC AREA',        nameKo: '기타 지역' }
    ],
    // 3. 외형/크기 (노란색 칸) — 제품 구분에 따라 "무엇을 적는지"가 달라진다
    appearance: [
        { mode: 'std',    labelKo: '표준 — 대각 인치',        labelEn: 'Standard — diagonal inch',
          hintKo: '19.5인치 → 195 (인치 × 10)',               hintEn: '19.5" → 195 (inch × 10)' },
        { mode: 'resize', labelKo: '리사이즈 — R + 대각 인치', labelEn: 'Resized — R + diagonal inch',
          hintKo: '31.8인치 → R31 (정수부만)',                 hintEn: '31.8" → R31 (integer part)' },
        { mode: 'led',    labelKo: 'LED 모듈 — 피치',          labelEn: 'LED module — pitch',
          hintKo: '피치 1.667 → 166',                          hintEn: 'pitch 1.667 → 166' },
        { mode: 'button', labelKo: '버튼 데크 — 버튼 개수',     labelEn: 'Button deck — button count',
          hintKo: '버튼 12개 → 12',                            hintEn: '12 buttons → 12' }
    ]
};

// ── 고객사 보기 = 문서 표 + 고객사 카탈로그(앞자리 코드) ───────────────
/**
 * 💡 [2026-10-21 신규, 사용자 요청] 고객사 카탈로그(js/04a CUSTOMER_CATALOG)의 회사도 ⑤에 띄우고,
 *    코드는 **회사명 앞자리**를 쓴다.
 *    ⚠️ 고객사 칸은 **한 글자**뿐이라 앞자리가 겹치면 둘 중 하나밖에 못 쓴다. 겹치는 걸 조용히
 *    버리거나 아무 글자나 배정하면 나중에 "왜 이 회사가 목록에 없지"가 된다 — 문서 표(확정)를
 *    항상 우선하고, 겹친 회사는 선택지가 아니라 **경고로 드러내서** 사람이 글자를 정하게 한다.
 *    반환: { options:[...선택 가능], clash:[{name, code, taken}] }
 */
function _mnbNormCo(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

window._mnbCustomerOptions = function() {
    var doc = (window.MNB_CHART.customer || []).slice();
    var taken = {};
    doc.forEach(function(o) { taken[o.code] = o.name; });

    var added = [], clash = [];
    (window.CUSTOMER_CATALOG || []).forEach(function(c) {
        var nm = String((c && c.name) || '').trim();
        if (!nm) return;
        var key = _mnbNormCo(nm);
        // 문서 표에 이미 있는 회사는 건너뛴다 — 같은 회사가 두 줄로 뜨면 안 된다.
        //    LNW(SG) ↔ LNW, I.G.T ↔ IGT 처럼 표기가 달라도 같은 회사로 본다(정규화 후 포함관계).
        var dup = doc.some(function(o) {
            var k2 = _mnbNormCo(o.name);
            return k2 === key || k2.indexOf(key) !== -1 || key.indexOf(k2) !== -1;
        });
        if (dup) return;

        // 💡 [2026-10-21] 카탈로그에 code가 **적혀 있으면** 사람이 정해준 것이다 — 이미 쓰이는
        //    코드와 겹쳐도 충돌이 아니라 의도된 공유로 본다. 사내 규칙이 지역 코드(1~4)를 폴백으로
        //    두고 있어서, 전용 코드가 없는 고객사는 지역 코드를 함께 쓴다(예: AMUSNET=2 EUROPEAN).
        //    ⚠️ 대신 모델명만으로는 둘을 구분할 수 없다 — 그래서 화면에 어느 코드를 함께 쓰는지 밝힌다.
        if (c.code) {
            var fixed = String(c.code).toUpperCase();
            added.push({ code: fixed, name: nm, src: 'catalog', aliasOf: taken[fixed] || '' });
            return;
        }

        // code가 없으면 앞자리로 자동 배정 — 이건 겹치면 임의 배정이 되므로 경고로 돌린다
        var ch = key.charAt(0);
        if (!ch) return;
        if (taken[ch]) { clash.push({ name: nm, code: ch, taken: taken[ch] }); return; }
        taken[ch] = nm;
        added.push({ code: ch, name: nm, src: 'catalog' });
    });
    return { options: doc.concat(added), clash: clash };
};

// ── 조립 / 역파싱 (순수함수) ──────────────────────────────────────────
/**
 * 외형/크기 3자리를 만든다.
 *  std    : 인치 × 10 → "195"  (19.5)
 *  resize : "R" + 정수 인치 → "R31" (31.8)
 *  led    : 피치 × 100 → "166"  (1.667 — 반올림이 아니라 버림: 문서 예시가 1.667 → 166)
 *  button : 버튼 개수 그대로
 */
window._mnbAppearance = function(mode, raw) {
    var v = String(raw == null ? '' : raw).trim();
    if (!v) return '';
    var n = parseFloat(v);
    if (isNaN(n)) return '';
    if (mode === 'std')    return String(Math.round(n * 10));
    if (mode === 'resize') return 'R' + String(Math.floor(n));
    if (mode === 'led')    return String(Math.floor(n * 100));
    return v.replace(/[^0-9]/g, ''); // button
};

/** 선택값 → 모델명. 빈 칸은 '_'로 채워 어디가 비었는지 보이게 한다. */
window._mnbCompose = function(sel) {
    sel = sel || {};
    var pad = function(v, n) {
        v = String(v == null ? '' : v);
        return v || new Array(n + 1).join('_');
    };
    return window.MNB_CHART.prefix
        + pad(sel.type, 1)
        + pad(sel.appearance, 3)
        + pad(sel.power, 1)
        + pad(sel.touch, 1)
        + pad(sel.customer, 1)
        + pad(sel.serial, 2);
};

/** 모델명 → 선택값. 형식이 안 맞으면 맞는 데까지만 채운다. */
window._mnbParse = function(name) {
    var s = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.indexOf('KT') !== 0) return {};
    var body = s.slice(2);
    // 외형 3자리 중 첫 글자가 R이면 리사이즈
    var out = { type: body.slice(0, 1) };
    out.appearance = body.slice(1, 4);
    out.power      = body.slice(4, 5);
    out.touch      = body.slice(5, 6);
    out.customer   = body.slice(6, 7);
    out.serial     = body.slice(7, 9);
    return out;
};

// ── UI ────────────────────────────────────────────────────────────────
var _mnbTargetId = null;
var _mnbSel = { type: '', appearance: '', power: '', touch: '', customer: '', serial: '' };
var _mnbMode = 'std';
var _mnbRaw  = '';

function _mnbEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _mnbOptionsHtml(key, list, cur) {
    return list.map(function(o) {
        var label = (_en() ? o.name : (o.nameKo || o.name));
        var mark = o.uncertain ? ' ⚠️' : '';
        var style = 'display:inline-flex; align-items:center; gap:4px; padding:4px 9px; margin:0 4px 4px 0; border-radius:14px; font-size:11.5px; cursor:pointer; border:1px solid '
            + (cur === o.code ? '#1f7a3d; background:#d8f0d8; color:#145c2b; font-weight:bold;' : '#ddd; background:#fff; color:#555;')
            + (o.legacy ? ' opacity:.55;' : '');
        return '<span class="mnb-opt" data-key="' + key + '" data-code="' + _mnbEsc(o.code) + '" style="' + style + '" title="'
            + _mnbEsc(o.name + (o.legacy ? ' — ' + _t('현재는 E(Extra)로 통합', 'merged into E (Extra)') : '')
                     + (o.uncertain ? ' / ' + _t('원본 문서 판독 불확실 — 확인 필요', 'uncertain reading of the source doc') : '')
                     // 카탈로그에서 온 회사는 사내 문서 표에 없는 것 — 앞자리로 임시 배정한 코드다
                     + (o.src === 'catalog' ? ' — ' + (o.aliasOf
                            ? _t('코드 ' + o.code + '를 "' + o.aliasOf + '"와 함께 씁니다 — 모델명만으로는 둘을 구분할 수 없습니다',
                                 'shares code ' + o.code + ' with "' + o.aliasOf + '" — the model name cannot tell them apart')
                            : _t('고객사 카탈로그(앞자리 코드) · 사내 규칙 문서에는 없음',
                                 'from the customer catalog (first-letter code) · not in the in-house rule doc')) : '')) + '">'
            + '<b>' + _mnbEsc(o.code) + '</b> ' + _mnbEsc(label) + mark + '</span>';
    }).join('');
}

function _mnbRender() {
    var C = window.MNB_CHART;
    var _mnbCust = window._mnbCustomerOptions();   // 문서 표 + 카탈로그(앞자리) + 충돌 목록
    var ap = C.appearance.filter(function(a) { return a.mode === _mnbMode; })[0] || C.appearance[0];
    var body = document.getElementById('mnb-body');
    if (!body) return;
    body.innerHTML =
      '<div style="font-size:11.5px; color:#888; margin-bottom:10px; line-height:1.6;">'
      + _t('사내 규칙 <b>KORTEK Model name Descriptions V10</b>(2024-05-13) 기준입니다. 순서대로 고르면 아래에 모델명이 만들어집니다.',
           'Based on the in-house rule <b>KORTEK Model name Descriptions V10</b> (2024-05-13). Pick in order and the name is assembled below.')
      + '</div>'
      // ① 제품 구분
      + '<div style="font-size:12px; font-weight:bold; color:#333; margin:10px 0 5px;">① ' + _t('제품 구분', 'Product type') + '</div>'
      + '<div>' + _mnbOptionsHtml('type', C.type, _mnbSel.type) + '</div>'
      + '<div style="font-size:10.5px; color:#aaa; margin-top:3px;">'
      + _t('Rev08에서 E(Extra)로 통합되어 더는 쓰지 않음: ', 'Retired in Rev08 (merged into E): ')
      + _mnbEsc((C.typeRetired || []).join(', ')) + '</div>'
      // ② 외형/크기
      + '<div style="font-size:12px; font-weight:bold; color:#333; margin:12px 0 5px;">② ' + _t('외형 / 크기', 'Appearance / size') + '</div>'
      + '<div style="margin-bottom:6px;">'
      + C.appearance.map(function(a) {
            var on = a.mode === _mnbMode;
            return '<span class="mnb-mode" data-mode="' + a.mode + '" style="display:inline-block; padding:4px 9px; margin:0 4px 4px 0; border-radius:14px; font-size:11.5px; cursor:pointer; border:1px solid '
                + (on ? '#1f7a3d; background:#d8f0d8; color:#145c2b; font-weight:bold;' : '#ddd; background:#fff; color:#555;') + '">'
                + _mnbEsc(_en() ? a.labelEn : a.labelKo) + '</span>';
        }).join('')
      + '</div>'
      + '<div style="display:flex; align-items:center; gap:8px;">'
      + '<input id="mnb-raw" type="text" value="' + _mnbEsc(_mnbRaw) + '" placeholder="' + _mnbEsc(_en() ? ap.hintEn : ap.hintKo) + '"'
      + ' style="width:180px; padding:6px 10px; border:1.5px solid #a8dab8; border-radius:7px; font-size:13px;">'
      + '<span style="font-size:11.5px; color:#888;">' + _mnbEsc(_en() ? ap.hintEn : ap.hintKo) + '</span>'
      + '<span style="font-size:12px; color:#1f6a3a; font-weight:bold;">→ ' + _mnbEsc(_mnbSel.appearance || '___') + '</span>'
      + '</div>'
      // ③ 입력 전원
      + '<div style="font-size:12px; font-weight:bold; color:#333; margin:12px 0 5px;">③ ' + _t('입력 전원', 'Input power') + '</div>'
      + '<div>' + _mnbOptionsHtml('power', C.power, _mnbSel.power) + '</div>'
      // ④ 터치
      + '<div style="font-size:12px; font-weight:bold; color:#333; margin:12px 0 5px;">④ ' + _t('터치 방식', 'Touch type') + '</div>'
      + '<div>' + _mnbOptionsHtml('touch', C.touch, _mnbSel.touch) + '</div>'
      // ⑤ 고객사
      + '<div style="font-size:12px; font-weight:bold; color:#333; margin:12px 0 5px;">⑤ ' + _t('고객사', 'Customer') + '</div>'
      + '<div>' + _mnbOptionsHtml('customer', _mnbCust.options, _mnbSel.customer) + '</div>'
      // ⚠️ 앞자리가 겹쳐 코드를 못 준 회사 — 숨기면 "왜 이 회사가 없지"가 되므로 드러낸다
      + (_mnbCust.clash.length
          ? '<div style="margin-top:5px; padding:6px 9px; background:#fff8e6; border:1px solid #ffe08a; border-radius:6px; font-size:10.5px; color:#8a6100; line-height:1.6;">'
            + '⚠️ ' + _t('앞자리가 겹쳐 코드를 못 준 회사 — 고객사 칸은 한 글자뿐입니다. 쓰시려면 글자를 따로 정해 ',
                         'Same first letter, so no code was assigned — the customer slot is one character. Assign a letter in ')
            + '<code>CUSTOMER_CATALOG</code>' + _t('에 넣어주세요.', '.') + '<br>'
            + _mnbCust.clash.map(function(c) {
                return _mnbEsc(c.name) + ' <span style="color:#b9975b;">(' + _mnbEsc(c.code) + ' → ' + _mnbEsc(c.taken) + ' 사용 중)</span>';
              }).join(' · ')
            + '</div>'
          : '')
      // ⑥ 일련번호
      + '<div style="font-size:12px; font-weight:bold; color:#333; margin:12px 0 5px;">⑥ ' + _t('일련번호', 'Serial') + '</div>'
      + '<input id="mnb-serial" type="text" maxlength="5" value="' + _mnbEsc(_mnbSel.serial) + '" placeholder="01"'
      + ' style="width:110px; padding:6px 10px; border:1.5px solid #a8dab8; border-radius:7px; font-size:13px; font-family:monospace;">'
      + '<div style="font-size:11px; color:#888; margin-top:5px; line-height:1.6;">'
      + _t('· 일반 제품은 두 자리(01, 02 …)<br>· LED 모듈(LED-MD)은 <b>XXYYZ</b> — XX 연도 · YY 순번 · Z 보드(K=코텍 KLDC, N=Novastar). 예) 2401N',
           '· Regular products use two digits (01, 02 …)<br>· LED modules (LED-MD) use <b>XXYYZ</b> — XX year · YY number · Z board (K=Kortek KLDC, N=Novastar). e.g. 2401N')
      + '</div>'
      // 💡 SAP 중복 확인 — 일련번호를 뺀 앞자리로 조회(일련번호는 "몇 번째 건"일 뿐이라 중복 판단 기준이 아니다)
      + '<div style="margin-top:14px; padding:10px 12px; background:#f4fbf4; border:1px solid #cfe8cf; border-radius:8px;">'
      + '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">'
      + '<button type="button" onclick="window._mnbCheckSap()" style="padding:5px 12px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer;">🔍 '
      + _t('SAP 중복 확인', 'Check SAP for duplicates') + '</button>'
      + '<span style="font-size:11px; color:#777;">' + _t('일련번호를 뺀 앞자리로 조회합니다 → ', 'Searches by the prefix without the serial → ')
      + '<b style="font-family:monospace;">*' + _mnbEsc((window._mnbPrefix ? window._mnbPrefix() : '') || '______') + '*</b></span>'
      + '</div>'
      + '<div id="mnb-sap" style="margin-top:8px; font-size:11.5px; color:#555; line-height:1.6;"></div>'
      + '</div>'
      + '<div style="margin-top:12px; padding:8px 10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:7px; font-size:11px; color:#777; line-height:1.6;">'
      + _t('💡 UGA 모델은 이 규칙이 아니라 <code>KT-</code> + UGA 모델명 + 리비전번호 형식입니다. 예) <code>KT-IVY01</code>',
           '💡 UGA models use a different form: <code>KT-</code> + UGA model name + revision. e.g. <code>KT-IVY01</code>')
      + '</div>';
    _mnbUpdatePreview();
}

function _mnbUpdatePreview() {
    var el = document.getElementById('mnb-preview');
    if (!el) return;
    var name = window._mnbCompose(_mnbSel);
    var done = name.indexOf('_') === -1;
    el.innerHTML = '<span style="font-family:monospace; font-size:21px; font-weight:bold; letter-spacing:1px; color:'
        + (done ? '#145c2b' : '#999') + ';">' + _mnbEsc(name) + '</span>'
        + (done ? '' : ' <span style="font-size:11px; color:#c00;">' + _t('— 비어 있는 칸(_)을 채워주세요', '— fill the blanks (_)') + '</span>');
    var btn = document.getElementById('mnb-use-btn');
    if (btn) { btn.disabled = !done; btn.style.opacity = done ? '1' : '.5'; btn.style.cursor = done ? 'pointer' : 'not-allowed'; }
}

window._mnbOpen = function(targetInputId) {
    _mnbTargetId = targetInputId || null;
    var m = document.getElementById('mnb-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'mnb-modal';
        m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9600; pointer-events:none;';
        m.innerHTML =
          '<div id="mnb-box" onclick="event.stopPropagation()" style="pointer-events:auto; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);'
        + ' background:#fff; border-radius:10px; width:var(--modal-w-md, 620px); max-width:94vw; max-height:88vh; display:flex; flex-direction:column;'
        + ' box-shadow:0 8px 32px rgba(0,0,0,0.22); overflow:hidden; resize:both; min-width:380px; min-height:300px;">'
        + '  <div id="mnb-drag" style="padding:13px 18px; border-bottom:1px solid #a8dab8; font-weight:bold; font-size:14px; background:#eaf7ea;'
        + '       border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1f6a3a;">'
        + '    <span>🧩 <span id="mnb-title">' + _t('KORTEK 모델명 만들기', 'Build a KORTEK model name') + '</span></span>'
        + '    <button onclick="document.getElementById(\'mnb-modal\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
        + '       border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;'
        + '       display:flex; align-items:center; justify-content:center;">✕</button>'
        + '  </div>'
        + '  <div id="mnb-body" style="overflow:auto; flex:1; padding:14px 18px;"></div>'
        + '  <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:10px; align-items:center; background:#fafdfa;">'
        + '    <div id="mnb-preview" style="flex:1; min-width:0; overflow-wrap:break-word;"></div>'
        + '    <button id="mnb-use-btn" onclick="window._mnbUse()" style="padding:7px 16px; background:#28a745; color:#fff; border:none;'
        + '       border-radius:6px; font-size:12.5px; font-weight:bold;">' + _t('이 모델명 사용', 'Use this name') + '</button>'
        + '    <button onclick="document.getElementById(\'mnb-modal\').style.display=\'none\'" style="padding:7px 14px; background:#f8f9fa; color:#555;'
        + '       border:1px solid #ccc; border-radius:6px; font-size:12px; cursor:pointer;">' + _t('닫기', 'Close') + '</button>'
        + '  </div>'
        + '</div>';
        document.body.appendChild(m);
        if (window._makeDraggable) window._makeDraggable('mnb-box', 'mnb-drag');
        if (window._bindClickToFront) window._bindClickToFront('mnb-modal');

        // 🐛 [2026-10-21 버그수정, 사용자 제보 "버튼이 안 눌린다"]
        //    위임 리스너를 오버레이(m)에 달았는데, 박스(#mnb-box)에 onclick="event.stopPropagation()"이
        //    걸려 있어서 박스 안에서 난 클릭이 오버레이까지 **올라오지 못했다** — 칩을 눌러도 아무 일도
        //    안 일어나고, 일련번호를 입력해도 미리보기가 안 바뀌었다(input도 같은 이유로 막혔다).
        //    → 박스 자신에 단다. 박스의 stopPropagation은 "바깥(오버레이) 클릭으로 닫히는 것"을 막는
        //    용도라 건드리지 않는다.
        const _mnbEvtRoot = document.getElementById('mnb-box') || m;
        // 이벤트 위임 — 칩 선택 / 모드 전환 / 입력
        _mnbEvtRoot.addEventListener('click', function(e) {
            var opt = e.target.closest ? e.target.closest('.mnb-opt') : null;
            if (opt) { _mnbSel[opt.dataset.key] = opt.dataset.code; _mnbRender(); return; }
            var mode = e.target.closest ? e.target.closest('.mnb-mode') : null;
            if (mode) { _mnbMode = mode.dataset.mode; _mnbSel.appearance = window._mnbAppearance(_mnbMode, _mnbRaw); _mnbRender(); return; }
            // SAP 조회가 제안한 다음 일련번호를 그대로 채택
            var next = e.target.closest ? e.target.closest('.mnb-usenext') : null;
            if (next) { _mnbSel.serial = next.dataset.v; _mnbRender(); }
        });
        _mnbEvtRoot.addEventListener('input', function(e) {
            if (e.target.id === 'mnb-raw') {
                _mnbRaw = e.target.value;
                _mnbSel.appearance = window._mnbAppearance(_mnbMode, _mnbRaw);
                var tag = e.target.parentNode.querySelector('span:last-child');
                if (tag) tag.textContent = '→ ' + (_mnbSel.appearance || '___');
                _mnbUpdatePreview();
            } else if (e.target.id === 'mnb-serial') {
                _mnbSel.serial = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                _mnbUpdatePreview();
            }
        });
    }
    // 대상 입력란에 이미 모델명이 있으면 역파싱해서 이어서 고칠 수 있게 한다
    var tgt = _mnbTargetId ? document.getElementById(_mnbTargetId) : null;
    var existing = tgt ? String(tgt.value || '') : '';
    var mm = existing.match(/KT[A-Z0-9]{8,}/i);
    if (mm) {
        var p = window._mnbParse(mm[0]);
        _mnbSel = { type: p.type || '', appearance: p.appearance || '', power: p.power || '',
                    touch: p.touch || '', customer: p.customer || '', serial: p.serial || '' };
        _mnbMode = (p.appearance || '').charAt(0) === 'R' ? 'resize' : 'std';
        _mnbRaw = '';
    }
    m.style.display = 'block';
    if (window.bringModalToFront) window.bringModalToFront('mnb-modal');
    _mnbRender();
};

// ── SAP 중복 확인 ─────────────────────────────────────────────────────
/**
 * 💡 [2026-10-21 신규, 사용자 요청] 모델명을 짓고 나서 **일련번호를 뺀 앞자리**로 SAP을 조회해
 *    같은 사양의 자재가 이미 있는지 보여준다. 일련번호는 "몇 번째 건인지"일 뿐이라, 중복 판단은
 *    그 앞 6자리(구분·크기·전원·터치·고객사)로 해야 맞다.
 *    읽기 전용 엔드포인트 /sap-material-pattern(= resolve_pattern, ZMM009)을 그대로 쓴다 —
 *    새 SAP 자동화를 만들지 않는다(CLAUDE.md: 런타임 SAP 경로는 sap_bridge_32.py 하나뿐).
 */
window._mnbPrefix = function(sel) {
    sel = sel || _mnbSel;
    if (!sel.type || !sel.appearance || !sel.power || !sel.touch || !sel.customer) return '';
    return window.MNB_CHART.prefix + sel.type + sel.appearance + sel.power + sel.touch + sel.customer;
};

window._mnbCheckSap = async function() {
    const prefix = window._mnbPrefix();
    const box = document.getElementById('mnb-sap');
    if (!box) return;
    if (!prefix) {
        box.innerHTML = '<span style="color:#c00;">' + _t('일련번호를 뺀 앞자리가 아직 안 채워졌습니다 — ①~⑤를 먼저 고르세요.',
            'The part before the serial is incomplete — pick ①–⑤ first.') + '</span>';
        return;
    }
    // 🐛 [2026-10-21 버그수정, 실사용] 앞에만 '*'를 붙이면(KTC490DPS*) 영영 0건이 나온다.
    //    SAP 자재내역(MAKTX)은 모델명으로 **시작하지 않는다** — 이 앱의 KTK PN 형식
    //    "502574_MVD>KTS320DPS01,LNW"에서 보듯 자재내역은 "MVD>KTS320DPS01,LNW" 꼴이라
    //    모델명 앞에 제품구분자(MVD/MAIN 등)와 '>'가 붙는다. 양쪽을 열어야 중간 일치가 잡힌다.
    //    (SAP_CAPABILITIES의 descpattern 예시도 "*01+01*150*"처럼 앞뒤를 연다.)
    const pattern = '*' + prefix + '*';
    box.innerHTML = '<span style="color:#888;">⏳ ' + _t('SAP 조회 중... ', 'Querying SAP... ') + _mnbEsc(pattern) + '</span>';
    try {
        const res = await fetch('http://127.0.0.1:5000/sap-material-pattern?pattern=' + encodeURIComponent(pattern),
            { signal: AbortSignal.timeout(95000) });
        const j = await res.json();
        if (!j || !j.ok) throw new Error((j && j.error) || 'SAP 조회 실패');
        // 브릿지가 돌려주는 키가 경로에 따라 matnr/desc 또는 MATNR/MAKTX 라 둘 다 받는다.
        // 실측(2026-10-21) 응답 예: {MATNR:"502574", MAKTX:"MVD>KTS320DPS01,LNW", MMSTA:"E3",
        //                          WGBEZ60:"완제품/MVD", STPRS1:"322,666"}
        const rows = (j.materials || []).map(function(m) {
            return {
                no:    m.matnr || m.MATNR || '',
                desc:  m.desc  || m.MAKTX || m.maktx || '',
                // 자재상태는 중복 판단에 바로 쓰인다 — 같은 앞자리라도 EOL이면 새로 따도 되는 경우가 있다
                stat:  m.MMSTA || m.mmsta || '',
                group: m.WGBEZ60 || m.wgbez60 || ''
            };
        }).filter(function(r) { return r.no || r.desc; });

        if (!rows.length) {
            box.innerHTML = '<span style="color:#1f7a3d; font-weight:bold;">✅ '
                + _t('중복 없음 — ' + _mnbEsc(pattern) + ' 로 조회된 자재가 없습니다.',
                     'No duplicate — nothing matched ' + _mnbEsc(pattern) + '.') + '</span>'
                // 0건이 "정말 없음"인지 "조회가 헛돈 것"인지 구분되게 조회 조건을 같이 남긴다
                + '<div style="color:#888; margin-top:3px;">'
                + _t('SAP 자재내역(MAKTX) 기준입니다. 자재내역에 모델명이 다른 형태로 적혀 있으면 안 잡힐 수 있습니다.',
                     'Matched against SAP material description (MAKTX). A differently written description may not match.') + '</div>';
            return;
        }
        // 이미 쓰인 일련번호를 모아 다음 번호를 제안한다 — 이게 실제로 알고 싶은 것
        const used = [];
        rows.forEach(function(r) {
            const m = String(r.desc || '').toUpperCase().match(new RegExp(prefix + '([0-9A-Z]{1,5})'));
            if (m && used.indexOf(m[1]) === -1) used.push(m[1]);
        });
        const nums = used.map(function(u) { return parseInt(u, 10); }).filter(function(n) { return !isNaN(n); });
        const next = nums.length ? String(Math.max.apply(null, nums) + 1).padStart(2, '0') : '';

        box.innerHTML =
            '<div style="font-weight:bold; color:#b05000; margin-bottom:5px;">⚠️ '
            + _t(rows.length + '건이 이미 등록돼 있습니다 (' + _mnbEsc(prefix) + '*)',
                 rows.length + ' already registered (' + _mnbEsc(prefix) + '*)') + '</div>'
            + (used.length ? '<div style="margin-bottom:5px;">' + _t('사용 중인 일련번호: ', 'Serials in use: ')
                + '<b>' + _mnbEsc(used.join(', ')) + '</b>'
                + (next ? ' → ' + _t('다음 번호 제안 ', 'suggested next ')
                    + '<b style="color:#145c2b;">' + next + '</b>'
                    + ' <span class="mnb-usenext" data-v="' + next + '" style="cursor:pointer; text-decoration:underline; color:#1f7a3d;">'
                    + _t('(이 번호로 넣기)', '(use it)') + '</span>' : '')
                + '</div>' : '')
            + '<div style="max-height:160px; overflow:auto; border:1px solid #eee; border-radius:6px;">'
            + rows.map(function(r) {
                return '<div style="padding:3px 7px; border-bottom:1px solid #f4f4f4; font-size:11px;">'
                    + '<span style="font-family:monospace; color:#1a4f7a;">' + _mnbEsc(r.no) + '</span> · '
                    + _mnbEsc(r.desc)
                    + (r.stat ? ' <span style="padding:0 5px; border-radius:8px; background:#eef3f8; color:#1a4f7a; font-size:10px;">'
                        + _mnbEsc(r.stat) + '</span>' : '')
                    + (r.group ? ' <span style="color:#aaa;">' + _mnbEsc(r.group) + '</span>' : '')
                    + '</div>';
            }).join('')
            + '</div>';
    } catch (e) {
        const msg = String((e && e.message) || e);
        box.innerHTML = '<span style="color:#c00;">❌ ' + _mnbEsc(msg) + '</span>'
            + '<div style="color:#888; margin-top:3px;">'
            + _t('백엔드(127.0.0.1:5000)와 SAP 로그인이 필요합니다. SAP 조회는 화면을 직접 조작하므로 다른 SAP 작업 중이면 실패할 수 있습니다.',
                 'Requires the local backend (127.0.0.1:5000) and a signed-in SAP session.') + '</div>';
    }
};

/** 완성된 모델명을 대상 입력란에 넣는다 */
window._mnbUse = function() {
    var name = window._mnbCompose(_mnbSel);
    if (name.indexOf('_') !== -1) return;
    var tgt = _mnbTargetId ? document.getElementById(_mnbTargetId) : null;
    if (!tgt) {
        // 대상이 없으면 복사만 — 조용히 아무것도 안 하면 "눌러도 반응 없다"가 된다
        try { navigator.clipboard.writeText(name); } catch (e) { /* ignore */ }
        if (window.showToast) window.showToast(_t('📋 복사했습니다: ', '📋 Copied: ') + name, 'info');
        return;
    }
    var cur = String(tgt.value || '');
    // KTK PN 형식은 "502574_MAIN>KTS320DPS01,LNW" — '>' 뒤 모델명 자리만 바꾼다.
    // 그런 형식이 아니면 기존 모델명을 치환하거나, 없으면 그대로 넣는다.
    var next;
    if (cur.indexOf('>') !== -1) {
        next = cur.replace(/>([^,]*)/, '>' + name);
    } else if (/KT[A-Z0-9]{8,}/i.test(cur)) {
        next = cur.replace(/KT[A-Z0-9]{8,}/i, name);
    } else {
        next = cur ? (cur + name) : name;
    }
    tgt.value = next;
    tgt.dispatchEvent(new Event('input', { bubbles: true }));
    tgt.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('mnb-modal').style.display = 'none';
    if (window.showToast) window.showToast(_t('🧩 모델명 입력됨: ', '🧩 Model name inserted: ') + name, 'info');
};

})();
