// ══════════════════════════════════════════════════════════════════════════════
// 📒 Project list — 제품(모델) 전수 목록 페이지
//
//  무엇인가: 고객사/공장/프로젝트별 제품 한 줄씩, 사양·담당자·패널·인증·판매량까지 한 표에
//  모아 보는 **프로젝트 공통(전사) 목록**이다. Summary/Gantt 가 "프로젝트 하나"를 다루는 것과
//  달리 이 표는 **프로젝트를 가로질러** 존재하므로, 저장도 프로젝트 JSON 이 아니라 주소록과
//  같은 공용 파일(App_Config/ProjectList_Shared.json)에 한다.
//
//  ⚠️ 데이터는 저장소에 안 넣는다 — 이 저장소는 GitHub Pages 로 공개돼 있다(CLAUDE.md).
//     고객사명·PN·패널모델·판매량이 들어간 실제 표는 **구글 드라이브(사내)에만** 있고,
//     코드에는 "빈 표 + 엑셀 불러오기" 만 있다. 처음 쓸 땐 📥 엑셀 불러오기로 넣는다.
//
//  열 목록은 전부 **데이터**(PL_COLUMNS)다 — 새 열은 여기 한 줄 추가하면 표·상세·엑셀·필터가
//  전부 따라온다(CLAUDE.md "하드코딩 지양" 원칙).
//
//  참조(양방향):
//    · 담당자 열  → 주소록 자동완성(attachAddressAutocomplete) + 그 사람 제품만 보기
//    · Panel 열   → 앱 패널 라이브러리(loadPanelLibrary) + NAS 패널 사양서(_dsOpenPanelSpec)
//                   + 그 패널을 쓰는 제품만 보기
//    · PN 열      → 📎 NAS 문서함(PROJECTLIST 폴더) + 🤖 AI 문서 분석 → 값 채우기
//    · KTK PN 열  → SAP 조회(AI 문답 경로 재사용) · 같은 모델의 Gantt 프로젝트 열기
//
//  ⚠️ NAS 문서함은 **PN 열**에 붙는다(2026-10-29 사용자 요청 — 처음엔 LNW Agile REV 에 붙였다).
//     문서는 PN 단위로 쌓이고, 거기서 돌린 AI 분석 결과가 LNW Agile REV·생산 REV 를 채운다.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _toast = function (msg, type, ms) { if (window.showToast) window.showToast(msg, type || 'info', ms || 3000); };
    var _esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };
    /** 머리글 대조용 정규화 — 공백·줄바꿈을 **전부 지우고** 대소문자/끝 마침표 차이를 없앤다.
     *  ⚠️ 공백을 한 칸으로 "줄이기만" 하면 안 된다 — 실제 파일 머리글이 "회로담당\n(PM)" 이라
     *  한 칸으로 줄이면 "회로담당 (PM)" 이 되어 "회로담당(PM)" 과 안 맞는다(실측에서 이 열이
     *  통째로 안 들어왔다). 양쪽을 같은 규칙으로 지우므로 "Panel inch" 같은 열도 그대로 맞는다. */
    var _norm = function (s) { return String(s == null ? '' : s).replace(/\s+/g, '').replace(/\.$/, '').trim().toLowerCase(); };

    var NAS_FOLDER = 'PROJECTLIST';

    // ──────────────────────────────────────────────────────────────────────────
    // 1. 열 카탈로그(데이터)
    //    k: 내부 키 / ko·en: 머리글 / g: 그룹 / w: 기본 폭(px) / type: 특수 동작
    //    type — person(주소록 자동완성) · panel(패널 참조) · doc(NAS 문서함) · sap(SAP 조회)
    //           num(숫자 오른쪽 정렬) · sel(값 목록 필터 대상)
    // ──────────────────────────────────────────────────────────────────────────
    window.PL_GROUPS = window.PL_GROUPS || [
        { k: 'basic', ko: '기본',      en: 'Basic',       on: true  },
        { k: 'owner', ko: '담당',      en: 'Owners',      on: true  },
        { k: 'panel', ko: '패널',      en: 'Panel',       on: true  },
        { k: 'optic', ko: '광학',      en: 'Optical',     on: false },
        { k: 'power', ko: '전원',      en: 'Power',       on: false },
        { k: 'parts', ko: '주요자재',  en: 'Key parts',   on: false },
        { k: 'cable', ko: '케이블',    en: 'Cables',      on: false },
        { k: 'touch', ko: '터치',      en: 'Touch',       on: false },
        { k: 'mech',  ko: '기구/포장', en: 'Mech/Pack',   on: false },
        { k: 'cert',  ko: '인증',      en: 'Certs',       on: false },
        { k: 'sales', ko: '판매량',    en: 'Sales',       on: false }
    ];

    var C = function (k, ko, en, g, w, type) { return { k: k, ko: ko, en: en, g: g, w: w || 110, type: type || '' }; };

    window.PL_COLUMNS = window.PL_COLUMNS || [
        C('no',          'No',                'No',                  'basic', 44),
        C('ktkPn',       'KTK PN',            'KTK PN',              'basic', 78,  'sap'),
        C('customer',    'CUSTOMER',          'CUSTOMER',            'basic', 78,  'sel'),
        C('factory',     'Factory',           'Factory',             'basic', 62,  'sel'),
        C('project',     'Project',           'Project',             'basic', 88,  'sel'),
        C('type',        'TYPE',              'TYPE',                'basic', 72,  'sel'),
        C('desc',        'Description',       'Description',         'basic', 220),
        C('status',      'Product Status',    'Product Status',      'basic', 64,  'sel'),
        C('cabinet',     'CABINET',           'CABINET',             'basic', 110, 'sel'),
        C('pn',          'PN',                'PN',                  'basic', 150, 'doc'),
        C('prodRev',     '생산 REV',          'Prod. REV',           'basic', 64),
        C('desc2',       'Description2',      'Description2',        'basic', 200),
        C('desc3',       'Description3',      'Description3',        'basic', 200),
        C('agileRev',    'LNW Agile REV',     'LNW Agile REV',       'basic', 130),

        C('ownerHw',     '회로담당(PM)',      'HW owner (PM)',       'owner', 92,  'person'),
        C('ownerFw',     '펌웨어담당',        'FW owner',            'owner', 92,  'person'),
        C('ownerMech',   '기구담당',          'Mech owner',          'owner', 92,  'person'),
        C('ownerTouch',  '터치담당',          'Touch owner',         'owner', 140, 'person'),

        C('panelMfr',    'Panel Mfr.',        'Panel Mfr.',          'panel', 72,  'sel'),
        C('panel',       'Panel',             'Panel',               'panel', 140, 'panel'),
        C('panelInch',   'Panel inch',        'Panel inch',          'panel', 80),
        C('cuttingInch', 'Cutting inch',      'Cutting inch',        'panel', 80),
        C('etching',     'Etching',           'Etching',             'panel', 64),
        C('panelSupply', 'Panel Supply',      'Panel Supply',        'panel', 70),
        C('bluModify',   'BLU Modify',        'BLU Modify',          'panel', 120),
        C('flipMirror',  'Flip & Mirror',     'Flip & Mirror',       'panel', 80),
        C('driveMode',   'Drive Mode',        'Drive Mode',          'panel', 110),
        C('haze',        'Haze',              'Haze',                'panel', 56),

        C('resolution',  'Resolution',        'Resolution',          'optic', 90),
        C('cieX',        'x',                 'x',                   'optic', 56),
        C('cieY',        'y',                 'y',                   'optic', 56),
        C('colorTemp',   'Color Temp(K)',     'Color Temp(K)',       'optic', 80),
        C('luminance',   'Luminance(min-max)','Luminance(min-max)',  'optic', 100),
        C('uniformity',  'Uniformity(%)',     'Uniformity(%)',       'optic', 72),
        C('gamma',       'Gamma',             'Gamma',               'optic', 56),
        C('colorGamut',  'Color Gamut(%/NTSC)','Color Gamut(%/NTSC)','optic', 110),
        C('inputSignal', 'Input signal',      'Input signal',        'optic', 72),

        C('power1',      'POWER RATING',      'POWER RATING',        'power', 90),
        C('powerNote1',  'NOTE',              'NOTE',                'power', 80),
        C('power2',      'POWER RATING2',     'POWER RATING2',       'power', 90),
        C('powerNote2',  'NOTE2',             'NOTE2',               'power', 80),
        C('power3',      'POWER RATING3',     'POWER RATING3',       'power', 90),
        C('powerNote3',  'NOTE3',             'NOTE3',               'power', 80),

        C('adbd',        'AD BD',             'AD BD',               'parts', 120, 'part:adbd'),
        C('adFw',        'AD F/W VER',        'AD F/W VER',          'parts', 110),
        C('adFw2',       'AD F/W VER2',       'AD F/W VER2',         'parts', 90),
        C('acSw',        'Auto Calibration SW Ver.',   'Auto Cal. SW Ver.',   'parts', 100),
        C('acFile',      'Auto Calibration File Ver.', 'Auto Cal. File Ver.', 'parts', 100),
        C('bluDriver',   'BLU Driver',        'BLU Driver',          'parts', 130),
        C('ledLighting', 'LED Lighting',      'LED Lighting',        'parts', 140),
        C('ledView',     'LED View',          'LED View',            'parts', 70),
        C('msl',         'MSL',               'MSL',                 'parts', 50),
        C('ledDriver',   'LED Lighting Driver','LED Lighting Driver','parts', 100),

        C('cableDp',     'DP Cable',          'DP Cable',            'cable', 64),
        C('cableHdmi',   'HDMI Cable',        'HDMI Cable',          'cable', 64),
        C('cableDvi',    'DVI Cable',         'DVI Cable',           'cable', 64),
        C('cableDsub',   'DSUB Cable',        'DSUB Cable',          'cable', 64),
        C('cableUsb',    'USB Cable',         'USB Cable',           'cable', 64),

        C('touchFw',     'TOUCH F/W VER',     'TOUCH F/W VER',       'touch', 90),
        C('touchFw2',    'TOUCH F/W VER2',    'TOUCH F/W VER2',      'touch', 80),
        C('vidPid',      'VID/PID',           'VID/PID',             'touch', 150),
        C('touchCtrl',   'CTRL',              'CTRL',                'touch', 120, 'part:touchctrl'),
        C('tsp',         'TSP',               'TSP',                 'touch', 140),
        C('glassType',   'Glass Type',        'Glass Type',          'touch', 90),
        C('glassThk',    'Glass Thickness',   'Glass Thickness',     'touch', 70),
        C('pet',         'PET',               'PET',                 'touch', 50),
        C('glassTemper', 'Glass Tempering Type','Glass Tempering Type','touch', 80),
        C('airGap',      'Air Gap',           'Air Gap',             'touch', 60),

        C('radius',      'Radius',            'Radius',              'mech',  80),
        C('mechanic',    'MECHANIC',          'MECHANIC',            'mech',  90),
        C('enclosure',   'Enclosure',         'Enclosure',           'mech',  80),
        C('candle',      'Candle',            'Candle',              'mech',  70),
        C('packingIM',   'Packing I(individual) M(multi)', 'Packing I/M', 'mech', 60),
        C('packingMat',  'Packing PE / EPS / PAPER',       'Packing material', 'mech', 80),
        C('tamperLabel', 'Tamper Label',      'Tamper Label',        'mech',  70),

        C('certCe',      'CE',                'CE',                  'cert',  46),
        C('certCb',      'CB',                'CB',                  'cert',  46),
        C('certUl',      'NRTL UL',           'NRTL UL',             'cert',  56),
        C('certFcc',     'FCC',               'FCC',                 'cert',  46),
        C('certRohs',    'RoHS II',           'RoHS II',             'cert',  56),
        C('certTuv',     'NRTL TUV',          'NRTL TUV',            'cert',  56),
        C('certSabs',    'SABS',              'SABS',                'cert',  50),
        C('certEtc',     'etc.',              'etc.',                'cert',  70),

        C('salesTotal',  '총 판매량',         'Total sales',         'sales', 80,  'num'),
        C('sales21',     '21년 판매',         'FY21 sales',          'sales', 70,  'num'),
        C('sales22',     '22년 판매',         'FY22 sales',          'sales', 70,  'num'),
        C('sales23',     '23년 판매',         'FY23 sales',          'sales', 70,  'num'),
        C('sales24',     '24년 예상',         'FY24 est.',           'sales', 70,  'num'),
        C('sales25',     '25년 예상',         'FY25 est.',           'sales', 70,  'num'),
        C('sales26',     '26년 예상',         'FY26 est.',           'sales', 70,  'num'),
        C('sales27',     '27년 예상',         'FY27 est.',           'sales', 70,  'num')
    ];

    // 엑셀 머리글 별칭(데이터) — 사람이 쓰는 표기가 조금씩 달라도 같은 열로 들어오게.
    window.PL_HEADER_ALIASES = window.PL_HEADER_ALIASES || {
        ktkPn:      ['KTK PN', 'KTK P/N', 'KTKPN', '자재코드', '품번'],
        customer:   ['CUSTOMER', '고객사', '고객'],
        factory:    ['Factory', '공장', '생산지'],
        status:     ['Product Status', 'Status', '제품상태'],
        pn:         ['PN', 'P/N', 'Part Number', '고객 PN'],
        prodRev:    ['생산 REV', '생산REV', 'Prod REV', 'Production REV'],
        agileRev:   ['LNW Agile REV', 'Agile REV', 'AGILE REV'],
        ownerHw:    ['회로담당(PM)', '회로담당', 'PM', '회로 담당'],
        ownerFw:    ['펌웨어담당', 'F/W 담당', '펌웨어 담당'],
        ownerMech:  ['기구담당', '기구 담당'],
        ownerTouch: ['터치담당', '터치 담당'],
        panelMfr:   ['Panel Mfr', 'Panel Maker', '패널 제조사'],
        panel:      ['Panel', '패널', 'Panel Model'],
        packingIM:  ['Packing I(individual) M(multi)', 'Packing I/M', 'Packing'],
        packingMat: ['Packing PE / EPS / PAPER', 'Packing material', 'Packing 재질'],
        acSw:       ['Auto Calibration SW Ver', 'Auto Cal SW Ver'],
        acFile:     ['Auto Calibration File Ver', 'Auto Cal File Ver'],
        salesTotal: ['총 판매량', '총판매량', 'Total sales']
    };

    // 🏷 머리글 줄임말(데이터) — 머리글은 **한 줄**로만 그린다(2026-10-29 사용자 요청).
    //    열이 90개라 머리글이 두세 줄로 접히면 표가 세로로 뚱뚱해지고 한눈에 안 들어온다.
    //    그래서 글자는 줄여 쓰고, 원래 이름은 말풍선(title)으로 보여준다. 여기 없는 열은
    //    원래 이름을 그대로 쓴다 — 짧은 이름이 필요해지면 여기 한 줄만 추가하면 된다.
    window.PL_SHORT = window.PL_SHORT || {
        customer:    ['고객',      'Cust.'],
        factory:     ['공장',      'Fab'],
        desc:        ['설명',      'Desc.'],
        status:      ['상태',      'Status'],
        prodRev:     ['생산REV',   'P.REV'],
        desc2:       ['설명2',     'Desc.2'],
        desc3:       ['설명3',     'Desc.3'],
        agileRev:    ['Agile REV', 'Agile REV'],
        ownerHw:     ['회로',      'HW'],
        ownerFw:     ['펌웨어',    'FW'],
        ownerMech:   ['기구',      'Mech'],
        ownerTouch:  ['터치',      'Touch'],
        panelMfr:    ['Mfr.',      'Mfr.'],
        panelInch:   ['inch',      'inch'],
        cuttingInch: ['Cut inch',  'Cut inch'],
        panelSupply: ['Supply',    'Supply'],
        bluModify:   ['BLU Mod.',  'BLU Mod.'],
        flipMirror:  ['Flip/Mir.', 'Flip/Mir.'],
        driveMode:   ['Drive',     'Drive'],
        resolution:  ['해상도',    'Res.'],
        colorTemp:   ['색온도',    'C.Temp'],
        luminance:   ['휘도',      'Lum.'],
        uniformity:  ['균일도',    'Unif.'],
        colorGamut:  ['색재현',    'Gamut'],
        inputSignal: ['입력',      'Input'],
        power1:      ['전원',      'Power'],
        powerNote1:  ['비고',      'Note'],
        power2:      ['전원2',     'Power2'],
        powerNote2:  ['비고2',     'Note2'],
        power3:      ['전원3',     'Power3'],
        powerNote3:  ['비고3',     'Note3'],
        adFw:        ['AD F/W',    'AD F/W'],
        adFw2:       ['AD F/W2',   'AD F/W2'],
        acSw:        ['A.Cal SW',  'A.Cal SW'],
        acFile:      ['A.Cal File','A.Cal File'],
        bluDriver:   ['BLU Drv.',  'BLU Drv.'],
        ledLighting: ['LED Light', 'LED Light'],
        ledDriver:   ['LED Drv.',  'LED Drv.'],
        cableDp:     ['DP',        'DP'],
        cableHdmi:   ['HDMI',      'HDMI'],
        cableDvi:    ['DVI',       'DVI'],
        cableDsub:   ['DSUB',      'DSUB'],
        cableUsb:    ['USB',       'USB'],
        touchFw:     ['T.F/W',     'T.F/W'],
        touchFw2:    ['T.F/W2',    'T.F/W2'],
        glassType:   ['Glass',     'Glass'],
        glassThk:    ['두께',      'Thk.'],
        glassTemper: ['강화',      'Temper'],
        mechanic:    ['기구',      'Mech.'],
        enclosure:   ['외함',      'Encl.'],
        packingIM:   ['Pack I/M',  'Pack I/M'],
        packingMat:  ['Pack 재질', 'Pack mat.'],
        tamperLabel: ['Tamper',    'Tamper'],
        certUl:      ['UL',        'UL'],
        certTuv:     ['TUV',       'TUV'],
        certRohs:    ['RoHS',      'RoHS'],
        certEtc:     ['기타',      'etc.'],
        salesTotal:  ['총판매',    'Total'],
        sales21:     ["'21",       "'21"],
        sales22:     ["'22",       "'22"],
        sales23:     ["'23",       "'23"],
        sales24:     ["'24",       "'24"],
        sales25:     ["'25",       "'25"],
        sales26:     ["'26",       "'26"],
        sales27:     ["'27",       "'27"]
    };

    var _colByKey = {};
    window.PL_COLUMNS.forEach(function (c) { _colByKey[c.k] = c; });
    window.PL_COL_BY_KEY = _colByKey;

    /** 화면에 그릴 머리글 — 줄임말이 있으면 그걸, 없으면 원래 이름 */
    var _headShort = function (c) {
        var s = window.PL_SHORT[c.k];
        if (s) return (window._currentLang === 'en') ? (s[1] || s[0]) : s[0];
        return window._currentLang === 'en' ? c.en : c.ko;
    };
    /** 말풍선에 쓸 원래 이름(줄바꿈은 공백으로 — title 은 줄바꿈을 그대로 보여준다) */
    var _headFull = function (c) { return String(window._currentLang === 'en' ? c.en : c.ko).replace(/\s+/g, ' '); };

    /** 엑셀 머리글 → 내부 키 (한/영/별칭 전부 받는다 — 불러오기는 두 언어 다, 내보내기는 현재 언어 하나) */
    var _keyOfHeader = function (h) {
        var n = _norm(h);
        if (!n) return '';
        for (var i = 0; i < window.PL_COLUMNS.length; i++) {
            var c = window.PL_COLUMNS[i];
            if (_norm(c.ko) === n || _norm(c.en) === n || _norm(c.k) === n) return c.k;
        }
        var al = window.PL_HEADER_ALIASES;
        for (var k in al) {
            if (!Object.prototype.hasOwnProperty.call(al, k)) continue;
            for (var j = 0; j < al[k].length; j++) { if (_norm(al[k][j]) === n) return k; }
        }
        return '';
    };
    window._plKeyOfHeader = _keyOfHeader;

    // ──────────────────────────────────────────────────────────────────────────
    // 2. 저장소 — 주소록(AddressBook)과 같은 패턴: localStorage 캐시 + App_Config 공용 JSON.
    //    안전장치도 그대로 가져왔다: ① 빈 목록으로 덮어쓰기 차단 ② savedAt 낙관적 동시성 제어.
    //    (주소록이 365명 → 빈 배열로 반복 붕괴했던 사고가 있었다 — js/22f 주석 참고)
    // ──────────────────────────────────────────────────────────────────────────
    window.ProjectList = window.ProjectList || {
        KEY: 'gantt_project_list_shared',
        FILE_NAME: 'ProjectList_Shared.json',
        _driveFileId: null,
        _syncTimer: null,
        _lastKnownServerCount: 0,
        _lastKnownSavedAt: null,
        _mergeCfg: { merge: function (contents) {
            // 같은 이름의 파일이 둘 이상 발견되면(과거 마이그레이션 흔적) KTK PN 기준으로 합친다.
            var base = (contents[0] && Array.isArray(contents[0].rows)) ? contents[0].rows.slice() : [];
            var hist = (contents[0] && Array.isArray(contents[0].history)) ? contents[0].history.slice() : [];
            var seen = {};
            base.forEach(function (r) { var k = String(r && r.ktkPn || '').trim(); if (k) seen[k] = 1; });
            for (var i = 1; i < contents.length; i++) {
                ((contents[i] && contents[i].rows) || []).forEach(function (r) {
                    var k = String(r && r.ktkPn || '').trim();
                    if (k && !seen[k]) { seen[k] = 1; base.push(r); }
                });
                hist = hist.concat((contents[i] && contents[i].history) || []);
            }
            return { rows: base, history: hist.slice(-3000), savedAt: new Date().toISOString() };
        } },

        load: function () {
            try {
                var o = JSON.parse(localStorage.getItem(this.KEY) || '{}');
                return { rows: Array.isArray(o.rows) ? o.rows : [], history: Array.isArray(o.history) ? o.history : [] };
            } catch (e) { return { rows: [], history: [] }; }
        },
        save: function (data, skipSync) {
            try { localStorage.setItem(this.KEY, JSON.stringify({ rows: data.rows || [], history: (data.history || []).slice(-3000) })); }
            catch (e) { console.warn('[Project list] 로컬 저장 실패(용량?):', e.message); }
            if (!skipSync) this.scheduleDriveSync(data);
        },
        scheduleDriveSync: function (data) {
            var self = this;
            if (self._syncTimer) clearTimeout(self._syncTimer);
            self._syncTimer = setTimeout(function () { self.syncToDrive(data); }, 3000);
        },
        syncToDrive: async function (data) {
            var tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
            var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return;                       // 비로그인: localStorage 단독 동작
            var rows = data.rows || [];
            if (this._lastKnownServerCount > 5 && rows.length === 0) {
                console.warn('[Project list 안전장치] Drive 동기화 스킵 — 서버엔 ' + this._lastKnownServerCount + '건이 있는데 지금 올리려는 목록이 비어 있습니다.');
                return;
            }
            try {
                var folderId = await window.getOrCreateConfigFolder(token);
                if (!this._driveFileId) this._driveFileId = await window._findOrMigrateFile2(token, this.FILE_NAME, folderId, this._mergeCfg);
                if (this._driveFileId && this._lastKnownSavedAt) {
                    try {
                        var chk = await gapi.client.drive.files.get({ fileId: this._driveFileId, alt: 'media', supportsAllDrives: true });
                        var cur = chk.result && chk.result.savedAt;
                        if (cur && cur !== this._lastKnownSavedAt) {
                            _toast('⚠️ ' + _t('다른 팀원이 방금 Project list를 저장해서, 덮어쓰지 않고 최신본을 다시 불러왔습니다. 방금 바꾼 내용은 다시 입력해주세요.',
                                              'Another member just saved the Project list — reloaded the latest instead of overwriting. Please re-enter your recent change.'), 'warning', 7000);
                            var fresh = await this.loadFromDrive();
                            if (fresh) { window._plData = fresh; if (window.plRender) window.plRender(); }
                            return;
                        }
                    } catch (e) { /* 확인 실패는 그냥 진행 */ }
                }
                var boundary = 'pl_sync_boundary';
                var metadata = { name: this.FILE_NAME, mimeType: 'application/json' };
                if (!this._driveFileId) metadata.parents = [folderId];
                var newSavedAt = new Date().toISOString();
                var payload = { rows: rows, history: (data.history || []).slice(-3000), savedAt: newSavedAt };
                var body = '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
                         + JSON.stringify(metadata)
                         + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
                         + JSON.stringify(payload) + '\r\n--' + boundary + '--';
                var url = 'https://www.googleapis.com/upload/drive/v3/files' + (this._driveFileId ? '/' + this._driveFileId : '')
                        + '?uploadType=multipart&supportsAllDrives=true';
                var resp = await fetch(url, {
                    method: this._driveFileId ? 'PATCH' : 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
                    body: body
                });
                var file = await resp.json();
                if (file && file.id) this._driveFileId = file.id;
                if (resp.ok) { this._lastKnownServerCount = rows.length; this._lastKnownSavedAt = newSavedAt; }
                if (resp.ok && window._plSetSavedMark) window._plSetSavedMark(newSavedAt);
            } catch (e) { console.warn('[Project list] Drive 동기화 실패:', e.message); }
        },
        loadFromDrive: async function () {
            var tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
            var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return null;
            try {
                var folderId = await window.getOrCreateConfigFolder(token);
                if (!this._driveFileId) this._driveFileId = await window._findOrMigrateFile2(token, this.FILE_NAME, folderId, this._mergeCfg);
                if (!this._driveFileId) return null;
                var res = await gapi.client.drive.files.get({ fileId: this._driveFileId, alt: 'media', supportsAllDrives: true });
                var d = res.result || {};
                var out = { rows: Array.isArray(d.rows) ? d.rows : [], history: Array.isArray(d.history) ? d.history : [] };
                this._lastKnownServerCount = Math.max(this._lastKnownServerCount, out.rows.length);
                if (d.savedAt) { this._lastKnownSavedAt = d.savedAt; if (window._plSetSavedMark) window._plSetSavedMark(d.savedAt); }
                this.save(out, true);
                return out;
            } catch (e) { console.warn('[Project list] Drive 조회 실패:', e.message); return null; }
        }
    };

    window._plData = window._plData || window.ProjectList.load();
    var D = function () { window._plData = window._plData || { rows: [], history: [] }; return window._plData; };
    var _persist = function () { window.ProjectList.save(D()); };

    window._plSetSavedMark = function (iso) {
        var el = document.getElementById('pl-saved-mark');
        if (!el) return;
        var d = iso ? new Date(iso) : new Date();
        el.textContent = '☁️ ' + d.toLocaleString(window._currentLang === 'en' ? 'en-US' : 'ko-KR');
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 3. 변경 이력 — 누가·언제·어느 제품의·무슨 칸을·무엇에서 무엇으로.
    //    표가 계속 갱신되는 문서라 "언제 바뀌었나"가 핵심이라 셀 단위로 남긴다.
    // ──────────────────────────────────────────────────────────────────────────
    var _plPushHistory = function (row, field, before, after) {
        if (String(before == null ? '' : before) === String(after == null ? '' : after)) return;
        D().history = D().history || [];
        D().history.push({
            at: new Date().toISOString(),
            by: window.currentUserName || (window.getActiveUserName ? window.getActiveUserName() : '') || '-',
            pn: String(row && row.ktkPn || row && row.pn || '').trim(),
            desc: String(row && row.desc || '').slice(0, 60),
            f: field,
            b: String(before == null ? '' : before).slice(0, 200),
            a: String(after == null ? '' : after).slice(0, 200)
        });
        if (D().history.length > 3000) D().history = D().history.slice(-3000);
    };
    window._plPushHistory = _plPushHistory;

    window.plToggleHistoryBox = function () {
        var body = document.getElementById('pl-history-body'), ico = document.getElementById('pl-history-toggle-icon');
        if (!body) return;
        var open = body.style.display === 'none';
        body.style.display = open ? 'block' : 'none';
        if (ico) ico.textContent = open ? '▼' : '▶';
        if (open) window.plRenderHistory();
    };

    window.plRenderHistory = function () {
        var el = document.getElementById('pl-history-table');
        if (!el) return;
        var hist = (D().history || []).slice().reverse().slice(0, 500);
        if (!hist.length) {
            el.innerHTML = '<tr><td style="padding:12px; color:#888; font-size:12px;">'
                + _t('아직 변경 이력이 없습니다.', 'No change history yet.') + '</td></tr>';
            return;
        }
        var head = '<tr><th style="width:140px;">' + _t('일시', 'When') + '</th><th style="width:90px;">' + _t('사용자', 'User')
                 + '</th><th style="width:90px;">' + _t('제품', 'Product') + '</th><th style="width:120px;">' + _t('항목', 'Field')
                 + '</th><th>' + _t('변경 전 → 후', 'Before → After') + '</th></tr>';
        var body = hist.map(function (h) {
            var col = _colByKey[h.f];
            var label = col ? (window._currentLang === 'en' ? col.en : col.ko) : h.f;
            return '<tr><td>' + _esc(new Date(h.at).toLocaleString(window._currentLang === 'en' ? 'en-US' : 'ko-KR')) + '</td>'
                 + '<td>' + _esc(h.by) + '</td><td>' + _esc(h.pn) + '</td><td>' + _esc(label) + '</td>'
                 + '<td><span style="color:#b1432f; text-decoration:line-through;">' + _esc(h.b || '(빈칸)') + '</span>'
                 + ' → <span style="color:#1971c2; font-weight:bold;">' + _esc(h.a || '(빈칸)') + '</span></td></tr>';
        }).join('');
        el.innerHTML = head + body;
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 4. 보기 상태(열 그룹·검색·필터·정렬·고정) — localStorage 에만 둔다(사람마다 다른 취향).
    // ──────────────────────────────────────────────────────────────────────────
    var VIEW_KEY = 'gantt_pl_view_v1';
    var _view = (function () {
        var def = { groups: {}, search: '', filters: {}, sort: { k: '', dir: 1 }, pins: [], hidden: {} };
        window.PL_GROUPS.forEach(function (g) { def.groups[g.k] = g.on; });
        try {
            var o = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
            return Object.assign(def, o, { groups: Object.assign({}, def.groups, o.groups || {}) });
        } catch (e) { return def; }
    })();
    window._plView = _view;
    var _saveView = function () { try { localStorage.setItem(VIEW_KEY, JSON.stringify(_view)); } catch (e) { /* 용량 초과는 무시 */ } };

    var _visibleCols = function () {
        return window.PL_COLUMNS.filter(function (c) { return _view.groups[c.g] && !_view.hidden[c.k]; });
    };

    // 보이는 행 — 검색 + 필터 + 정렬 + 고정(📌 맨 위)
    var _visibleRows = function () {
        var q = String(_view.search || '').trim().toLowerCase();
        var fl = _view.filters || {};
        var rows = (D().rows || []).filter(function (r) {
            for (var k in fl) {
                if (!Object.prototype.hasOwnProperty.call(fl, k) || !fl[k]) continue;
                if (String(r[k] == null ? '' : r[k]).trim() !== fl[k]) return false;
            }
            if (!q) return true;
            for (var i = 0; i < window.PL_COLUMNS.length; i++) {
                var v = r[window.PL_COLUMNS[i].k];
                if (v != null && String(v).toLowerCase().indexOf(q) !== -1) return true;
            }
            return false;
        });
        var s = _view.sort || {};
        if (s.k) {
            var isNum = (_colByKey[s.k] || {}).type === 'num';
            rows.sort(function (a, b) {
                var x = a[s.k], y = b[s.k];
                if (isNum) { x = parseFloat(String(x).replace(/[^\d.-]/g, '')) || 0; y = parseFloat(String(y).replace(/[^\d.-]/g, '')) || 0; return (x - y) * s.dir; }
                return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'ko') * s.dir;
            });
        }
        var pins = _view.pins || [];
        if (pins.length) {
            rows.sort(function (a, b) {
                var pa = pins.indexOf(a._id) !== -1 ? 0 : 1, pb = pins.indexOf(b._id) !== -1 ? 0 : 1;
                return pa - pb;
            });
        }
        return rows;
    };
    window._plVisibleRows = _visibleRows;

    var _rowById = function (id) {
        var rows = D().rows || [];
        for (var i = 0; i < rows.length; i++) { if (rows[i]._id === id) return rows[i]; }
        return null;
    };
    window._plRowById = _rowById;

    var _newId = function () { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

    // ──────────────────────────────────────────────────────────────────────────
    // 5. 표 렌더
    // ──────────────────────────────────────────────────────────────────────────
    var STICKY = ['no', 'ktkPn'];   // 가로 스크롤해도 남는 열

    window.plRender = function () {
        var wrap = document.getElementById('pl-table-wrap');
        if (!wrap) return;
        var cols = _visibleCols(), rows = _visibleRows();

        var left = 0, leftOf = {};
        cols.forEach(function (c) { if (STICKY.indexOf(c.k) !== -1) { leftOf[c.k] = left; left += c.w; } });

        // ⚠️ table-layout:fixed 에서는 **표 자체의 폭**이 정해져야 열 폭이 지켜진다. 폭을 안 주면
        //    브라우저가 컨테이너 폭(예: 990px)을 열 개수로 나눠버려 28열이 전부 35px 이 된다(실측).
        //    그래서 보이는 열 폭의 합을 표 폭으로 주고, th 에는 min/max 가 아니라 width 를 준다.
        var totalW = cols.reduce(function (s, c) { return s + c.w; }, 0);

        var th = cols.map(function (c) {
            var sticky = leftOf[c.k] !== undefined
                ? 'position:sticky; left:' + leftOf[c.k] + 'px; z-index:5; background:var(--pl-head-bg,#e0f5f7);' : '';
            var s = _view.sort || {};
            var mark = s.k === c.k ? (s.dir > 0 ? ' ▲' : ' ▼') : '';
            // 말풍선엔 **원래 이름**을 먼저 — 줄임말만 보고는 무슨 열인지 모르기 때문(사용자 요청).
            var tip = _headFull(c) + '\n' + _t('클릭: 정렬 · 우클릭: 이 열 숨기기', 'Click: sort · Right-click: hide this column');
            return '<th data-k="' + c.k + '" title="' + _esc(tip) + '"'
                 + ' onclick="window.plSort(\'' + c.k + '\')" oncontextmenu="window.plHideCol(\'' + c.k + '\'); return false;"'
                 + ' style="width:' + c.w + 'px; cursor:pointer; ' + sticky + '">'
                 + _esc(_headShort(c)) + mark + '</th>';
        }).join('');

        var body = rows.map(function (r) {
            var pinned = (_view.pins || []).indexOf(r._id) !== -1;
            var tds = cols.map(function (c) {
                var v = r[c.k] == null ? '' : String(r[c.k]);
                var sticky = leftOf[c.k] !== undefined
                    ? 'position:sticky; left:' + leftOf[c.k] + 'px; z-index:3; background:#fff;' : '';
                var extra = '', cls = 'pl-td';
                if (c.type === 'num') extra += 'text-align:right;';
                if (c.k === 'no') {
                    return '<td class="pl-td pl-no" style="' + sticky + ' text-align:center; cursor:pointer;"'
                         + ' onclick="window.plOpenDetail(\'' + r._id + '\')"'
                         + ' title="' + _esc(_t('클릭: 상세 보기', 'Click: detail view')) + '">'
                         + '<span class="pl-pin" onclick="event.stopPropagation(); window.plTogglePin(\'' + r._id + '\')" style="cursor:pointer; opacity:' + (pinned ? '1' : '.25') + ';">📌</span> '
                         + _esc(v) + '</td>';
                }
                // 특수 열 — 값 옆에 작은 아이콘, 아이콘을 눌러야 창이 뜬다(글자 수정과 안 겹치게)
                var ico = '';
                if (c.type === 'doc') {
                    var n = window._plDocCount ? window._plDocCount(r) : 0;
                    ico = '<span class="pl-ico" onclick="event.stopPropagation(); window.plOpenDocBox(\'' + r._id + '\')"'
                        + ' title="' + _esc(_t('NAS 문서함 — 올리기/열기/AI 분석', 'NAS documents — upload/open/AI analysis')) + '">📎'
                        + (n ? '<b style="color:#1971c2;">' + n + '</b>' : '') + '</span>';
                } else if (c.type === 'panel') {
                    ico = '<span class="pl-ico" onclick="event.stopPropagation(); window.plOpenPanelCard(\'' + r._id + '\')"'
                        + ' title="' + _esc(_t('패널 정보 — 앱 라이브러리 + NAS 사양서', 'Panel info — app library + NAS spec')) + '">🔎</span>';
                } else if (c.type === 'sap') {
                    ico = '<span class="pl-ico" onclick="event.stopPropagation(); window.plOpenPnMenu(\'' + r._id + '\')"'
                        + ' title="' + _esc(_t('SAP 조회 · 프로젝트 열기', 'SAP lookup / open project')) + '">🏭</span>';
                } else if (c.type === 'person') {
                    ico = v ? '<span class="pl-ico" onclick="event.stopPropagation(); window.plOpenPersonCard(\'' + r._id + '\',\'' + c.k + '\')"'
                        + ' title="' + _esc(_t('담당자 정보 · 이 담당자 제품만 보기', 'Owner info / filter by this owner')) + '">👤</span>' : '';
                } else if (String(c.type).indexOf('part:') === 0) {
                    ico = v ? '<span class="pl-ico" onclick="event.stopPropagation(); window.plOpenPartCard(\'' + r._id + '\',\'' + c.k + '\',\'' + String(c.type).slice(5) + '\')"'
                        + ' title="' + _esc(_t('PARTS 라이브러리에서 보기', 'Open in PARTS library')) + '">🔎</span>' : '';
                }
                return '<td class="' + cls + '" data-id="' + r._id + '" data-k="' + c.k + '"'
                     + ' onclick="window.plEditCell(this)" style="' + sticky + extra + '">'
                     + '<span class="pl-v">' + _esc(v).replace(/\n/g, '<br>') + '</span>' + ico + '</td>';
            }).join('');
            return '<tr data-id="' + r._id + '"' + (pinned ? ' style="background:#fffbe6;"' : '') + '>' + tds + '</tr>';
        }).join('');

        wrap.innerHTML = '<table id="pl-table" class="concept-table pl-table" style="width:' + totalW + 'px;"><thead><tr>' + th + '</tr></thead><tbody>'
                       + (body || '<tr><td colspan="' + cols.length + '" style="padding:30px; text-align:center; color:#888;">'
                          + _esc(_t('표가 비어 있습니다 — [📥 엑셀 불러오기]로 제품 목록 엑셀을 넣어주세요.',
                                    'The table is empty — use [📥 Import Excel] to load the product list.')) + '</td></tr>')
                       + '</tbody></table>';

        var cnt = document.getElementById('pl-count');
        if (cnt) cnt.textContent = rows.length + ' / ' + (D().rows || []).length + _t('건', '');
        window.plRenderChips();
        window.plRenderStats();
        if (window._cpApplyLive) { try { window._cpApplyLive(); } catch (e) { /* 팔레트 미초기화 시 무시 */ } }
    };

    // 열 그룹 칩 + 필터 드롭다운
    window.plRenderChips = function () {
        var box = document.getElementById('pl-group-chips');
        if (box) {
            box.innerHTML = window.PL_GROUPS.map(function (g) {
                var on = !!_view.groups[g.k];
                return '<span onclick="window.plToggleGroup(\'' + g.k + '\')" style="cursor:pointer; user-select:none; padding:3px 9px; margin-right:4px;'
                     + ' border-radius:12px; font-size:11.5px; font-weight:bold; border:1px solid ' + (on ? '#52a5af' : '#dde3e5') + ';'
                     + ' background:' + (on ? '#d4eef1' : '#f6f8f9') + '; color:' + (on ? '#00707d' : '#9aa5a9') + ';">'
                     + (on ? '☑ ' : '☐ ') + _esc(window._currentLang === 'en' ? g.en : g.ko) + '</span>';
            }).join('');
        }
        var fb = document.getElementById('pl-filter-box');
        if (fb) {
            var FKEYS = ['customer', 'factory', 'project', 'type', 'status', 'panelMfr'];
            fb.innerHTML = FKEYS.map(function (k) {
                var c = _colByKey[k]; if (!c) return '';
                var vals = {}, rows = D().rows || [];
                rows.forEach(function (r) { var v = String(r[k] == null ? '' : r[k]).trim(); if (v) vals[v] = (vals[v] || 0) + 1; });
                var opts = Object.keys(vals).sort().map(function (v) {
                    return '<option value="' + _esc(v) + '"' + ((_view.filters || {})[k] === v ? ' selected' : '') + '>' + _esc(v) + ' (' + vals[v] + ')</option>';
                }).join('');
                return '<select onchange="window.plSetFilter(\'' + k + '\', this.value)" title="' + _esc(window._currentLang === 'en' ? c.en : c.ko) + '"'
                     + ' style="margin-right:4px; padding:4px 6px; border:1px solid #cfe3e5; border-radius:6px; font-size:11.5px; max-width:130px;">'
                     + '<option value="">' + _esc(window._currentLang === 'en' ? c.en : c.ko) + ' ' + _t('전체', 'All') + '</option>' + opts + '</select>';
            }).join('');
        }
    };

    // 요약 — "지금 보이는 것"이 무엇인지 한 줄로(고객사·상태 분포). 164건을 훑기 전에 감을 잡게.
    window.plRenderStats = function () {
        var el = document.getElementById('pl-stats');
        if (!el) return;
        var rows = _visibleRows();
        if (!rows.length) { el.textContent = ''; return; }
        var by = function (k) {
            var m = {}; rows.forEach(function (r) { var v = String(r[k] == null ? '' : r[k]).trim() || '-'; m[v] = (m[v] || 0) + 1; });
            return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 6)
                .map(function (v) { return _esc(v) + ' ' + m[v]; }).join(' · ');
        };
        el.innerHTML = '<b>' + _t('고객', 'Customer') + '</b> ' + by('customer')
                     + ' &nbsp;|&nbsp; <b>' + _t('상태', 'Status') + '</b> ' + by('status');
    };

    window.plToggleGroup = function (g) { _view.groups[g] = !_view.groups[g]; _saveView(); window.plRender(); };
    window.plHideCol = function (k) {
        _view.hidden[k] = true; _saveView(); window.plRender();
        _toast(_t('열을 숨겼습니다 — [열 되돌리기]로 복구합니다.', 'Column hidden — use [Reset columns] to restore.'), 'info');
    };
    window.plResetCols = function () { _view.hidden = {}; _saveView(); window.plRender(); };
    window.plSort = function (k) {
        var s = _view.sort || {};
        _view.sort = (s.k === k) ? { k: k, dir: -s.dir } : { k: k, dir: 1 };
        _saveView(); window.plRender();
    };
    window.plSetFilter = function (k, v) { _view.filters = _view.filters || {}; _view.filters[k] = v; _saveView(); window.plRender(); };
    window.plSearch = function (v) { _view.search = v; _saveView(); window.plRender(); };
    window.plClearFilters = function () {
        _view.filters = {}; _view.search = ''; _view.sort = { k: '', dir: 1 };
        var si = document.getElementById('pl-search'); if (si) si.value = '';
        _saveView(); window.plRender();
    };
    window.plTogglePin = function (id) {
        _view.pins = _view.pins || [];
        var i = _view.pins.indexOf(id);
        if (i === -1) _view.pins.push(id); else _view.pins.splice(i, 1);
        _saveView(); window.plRender();
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 6. 셀 편집 — 평소엔 글자만 그리고, 누를 때 그 칸만 입력칸으로 바꾼다.
    //    (164행 × 90열을 전부 <input>으로 그리면 1만 개가 넘는다 — 주소록과 다른 이유)
    // ──────────────────────────────────────────────────────────────────────────
    window.plEditCell = function (td) {
        if (!td || td.querySelector('input, textarea')) return;
        var id = td.getAttribute('data-id'), k = td.getAttribute('data-k');
        var row = _rowById(id), col = _colByKey[k];
        if (!row || !col) return;
        var before = row[k] == null ? '' : String(row[k]);
        var multi = before.indexOf('\n') !== -1 || col.w >= 200;
        var el = document.createElement(multi ? 'textarea' : 'input');
        el.value = before;
        el.style.cssText = 'width:100%; box-sizing:border-box; border:1px solid #52a5af; border-radius:3px; font-size:11.5px;'
                         + ' font-family:inherit; padding:2px 3px;' + (multi ? ' min-height:46px; resize:vertical;' : '');
        var done = function (commit) {
            var after = commit ? el.value : before;
            if (commit && after !== before) {
                row[k] = after;
                _plPushHistory(row, k, before, after);
                _persist();
            }
            window.plRender();
        };
        el.onblur = function () { done(true); };
        el.onkeydown = function (e) {
            if (e.key === 'Escape') { e.preventDefault(); el.onblur = null; done(false); }
            if (e.key === 'Enter' && !multi) { e.preventDefault(); el.blur(); }
        };
        td.innerHTML = '';
        td.appendChild(el);
        el.focus();
        el.select();
        // 담당자 칸은 주소록 자동완성을 붙인다(여러 명은 공백으로 구분 — 터치담당이 그렇게 쓰고 있다)
        if (col.type === 'person' && window.attachAddressAutocomplete) {
            try { window.attachAddressAutocomplete(el, null, true, null); } catch (e) { /* 자동완성 실패는 입력을 막지 않는다 */ }
        }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 7. 행 추가/복제/삭제
    // ──────────────────────────────────────────────────────────────────────────
    window.plAddRow = function () {
        var rows = D().rows;
        var maxNo = 0;
        rows.forEach(function (r) { var n = parseInt(r.no, 10); if (n > maxNo) maxNo = n; });
        var r = { _id: _newId(), no: String(maxNo + 1) };
        rows.push(r);
        _plPushHistory(r, 'no', '', r.no);
        _persist();
        window.plRender();
        _toast('➕ ' + _t('행을 추가했습니다.', 'Row added.'), 'success');
    };
    window.plDuplicateRow = function (id) {
        var src = _rowById(id); if (!src) return;
        var copy = Object.assign({}, src);
        copy._id = _newId();
        var maxNo = 0;
        (D().rows || []).forEach(function (r) { var n = parseInt(r.no, 10); if (n > maxNo) maxNo = n; });
        copy.no = String(maxNo + 1);
        copy.ktkPn = '';
        D().rows.push(copy);
        _plPushHistory(copy, 'no', '', copy.no + ' (' + _t('복제', 'duplicated') + ')');
        _persist(); window.plRender(); window.plCloseDetail();
        _toast('📑 ' + _t('행을 복제했습니다 — KTK PN은 비워뒀습니다.', 'Row duplicated — KTK PN left blank.'), 'success');
    };
    window.plDeleteRow = function (id) {
        var r = _rowById(id); if (!r) return;
        if (!confirm(_t('이 제품 행을 삭제할까요?\n' + (r.ktkPn || '') + ' ' + (r.desc || ''),
                        'Delete this product row?\n' + (r.ktkPn || '') + ' ' + (r.desc || '')))) return;
        D().rows = (D().rows || []).filter(function (x) { return x._id !== id; });
        _plPushHistory(r, 'no', r.no, _t('(삭제됨)', '(deleted)'));
        _persist(); window.plRender(); window.plCloseDetail();
        _toast('🗑️ ' + _t('삭제했습니다.', 'Deleted.'), 'info');
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 8. 공용 팝업(가벼운 카드) — 모달 하나를 돌려 쓴다
    // ──────────────────────────────────────────────────────────────────────────
    var _popup = function (title, html, wide) {
        var box = document.getElementById('pl-popup');
        if (!box) {
            box = document.createElement('div');
            box.id = 'pl-popup';
            box.style.cssText = 'display:none; position:fixed; z-index:100000; left:50%; top:50%; transform:translate(-50%,-50%);'
                              + ' background:#fff; border:1px solid #a3d9e0; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,.25);'
                              + ' max-height:82vh; overflow:auto;';
            box.onclick = function (e) { e.stopPropagation(); };
            document.body.appendChild(box);
        }
        box.style.width = wide ? '720px' : '460px';
        box.innerHTML = '<div id="pl-popup-head" style="display:flex; align-items:center; gap:8px; padding:10px 14px; background:#e0f5f7;'
                      + ' border-bottom:1px solid #a3d9e0; border-radius:10px 10px 0 0; font-weight:bold; color:#00707d; font-size:13.5px;">'
                      + '<span style="flex:1;">' + title + '</span>'
                      + '<span onclick="window.plClosePopup()" style="cursor:pointer; font-size:15px;">✕</span></div>'
                      + '<div style="padding:14px 16px; font-size:12.5px;">' + html + '</div>';
        box.style.display = 'block';
        if (window._makeDraggable) { try { window._makeDraggable('pl-popup', 'pl-popup-head'); } catch (e) { /* 드래그 실패는 보기를 막지 않는다 */ } }
        return box;
    };
    window.plClosePopup = function () { var b = document.getElementById('pl-popup'); if (b) b.style.display = 'none'; };
    window._plPopup = _popup;

    // ── 8-1. 담당자 카드 ───────────────────────────────────────────────────────
    window.plOpenPersonCard = function (id, k) {
        var r = _rowById(id); if (!r) return;
        var names = String(r[k] || '').split(/[\s,/]+/).filter(Boolean);
        var book = (window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : [];
        var cards = names.map(function (nm) {
            var p = book.filter(function (b) { return String(b.name || '').trim() === nm; })[0];
            var cnt = (D().rows || []).filter(function (x) { return String(x[k] || '').indexOf(nm) !== -1; }).length;
            return '<div style="border:1px solid #e3e6ea; border-radius:6px; padding:9px 11px; margin-bottom:7px;">'
                 + '<b style="font-size:13px;">' + _esc(nm) + '</b>'
                 + (p ? ' <span style="color:#666;">' + _esc(p.dept || '') + ' ' + _esc(p.title || '') + '</span>'
                        + '<div style="color:#555; margin-top:3px;">' + _esc(p.email || '') + (p.mobile ? ' · ' + _esc(p.mobile) : '') + '</div>'
                      : ' <span style="color:#b1432f;">' + _t('주소록에 없음', 'not in Address book') + '</span>')
                 + '<div style="margin-top:6px;"><button onclick="window.plFilterByOwner(\'' + k + '\',\'' + _esc(nm) + '\')"'
                 + ' style="padding:4px 9px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:11.5px; cursor:pointer;">'
                 + '📒 ' + _t('이 담당자 제품 ', 'Products by this owner ') + cnt + _t('건 보기', '') + '</button></div></div>';
        }).join('');
        _popup('👤 ' + _esc(window._currentLang === 'en' ? _colByKey[k].en : _colByKey[k].ko),
               cards || '<div style="color:#888;">' + _t('지정된 담당자가 없습니다.', 'No owner set.') + '</div>');
    };
    window.plFilterByOwner = function (k, name) {
        window.plClosePopup();
        _view.search = name; _view.filters = {};
        var si = document.getElementById('pl-search'); if (si) si.value = name;
        _saveView(); window.plRender();
    };

    // ── 8-2. 패널 카드 — 앱 라이브러리 + NAS 사양서 + 이 패널을 쓰는 제품 ───────
    window.plOpenPanelCard = async function (id) {
        var r = _rowById(id); if (!r) return;
        var model = String(r.panel || '').trim();
        if (!model) { _toast(_t('Panel 값이 비어 있습니다.', 'Panel is empty.'), 'warning'); return; }
        var same = (D().rows || []).filter(function (x) { return String(x.panel || '').trim() === model; }).length;
        _popup('🖥️ ' + _esc(model), '<div id="pl-panel-body" style="color:#888;">' + _t('불러오는 중…', 'Loading…') + '</div>', true);
        var html = '';
        try {
            var lib = window.loadPanelLibrary ? await window.loadPanelLibrary() : null;
            var entry = (lib && window.findPanelInLibrary) ? window.findPanelInLibrary(lib, model) : null;
            if (entry && entry.specs) {
                var keys = Object.keys(entry.specs).filter(function (kk) { return String(entry.specs[kk] || '').trim(); });
                html += '<div style="font-weight:bold; color:#2c5f8a; margin-bottom:6px;">📚 ' + _t('앱 패널 라이브러리', 'App panel library')
                      + ' <span style="font-weight:normal; color:#888;">(' + keys.length + _t('개 항목', ' items') + ')</span></div>'
                      + '<div style="max-height:300px; overflow:auto; border:1px solid #e3e6ea; border-radius:6px;">'
                      + '<table style="width:100%; font-size:11.5px; border-collapse:collapse;">'
                      + keys.map(function (kk) {
                          return '<tr><td style="padding:3px 7px; color:#666; border-bottom:1px solid #f1f3f5; width:45%;">' + _esc(kk) + '</td>'
                               + '<td style="padding:3px 7px; border-bottom:1px solid #f1f3f5;">' + _esc(entry.specs[kk]) + '</td></tr>';
                      }).join('') + '</table></div>';
            } else {
                html += '<div style="color:#b1432f; margin-bottom:8px;">📚 ' + _t('앱 패널 라이브러리에 이 모델이 없습니다.', 'This model is not in the app panel library.') + '</div>';
            }
        } catch (e) { html += '<div style="color:#b1432f;">' + _t('라이브러리 조회 실패: ', 'Library lookup failed: ') + _esc(e.message) + '</div>'; }

        html += '<div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">'
             + '<button onclick="window.plOpenPanelSpec(\'' + _esc(model) + '\')" style="padding:5px 10px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">📄 ' + _t('NAS 사양서 열기', 'Open NAS spec') + '</button>'
             + '<button onclick="window.plFilterByPanel(\'' + _esc(model) + '\')" style="padding:5px 10px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">📒 ' + _t('이 패널 쓰는 제품 ', 'Products using this panel ') + same + _t('건 보기', '') + '</button>'
             + '<button onclick="window.switchTab(\'elecparts\'); window.plClosePopup();" style="padding:5px 10px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">⚡ ' + _t('PARTS 탭으로', 'Go to PARTS') + '</button>'
             + '</div>';
        var b = document.getElementById('pl-panel-body');
        if (b) { b.style.color = ''; b.innerHTML = html; }
    };
    window.plOpenPanelSpec = async function (model) {
        if (!window._dsOpenPanelSpec) { _toast(_t('문서 저장소를 불러오지 못했습니다.', 'Document store unavailable.'), 'error'); return; }
        try { await window._dsOpenPanelSpec(model); }
        catch (e) { _toast('⚠️ ' + (e && e.message ? e.message : e), 'error'); }
    };
    window.plFilterByPanel = function (model) {
        window.plClosePopup();
        _view.search = model; _view.filters = {};
        var si = document.getElementById('pl-search'); if (si) si.value = model;
        _saveView(); window.plRender();
    };

    // ── 8-3. PARTS(AD BD / CTRL) 카드 ─────────────────────────────────────────
    window.plOpenPartCard = async function (id, k, type) {
        var r = _rowById(id); if (!r) return;
        var v = String(r[k] || '').trim();
        var same = (D().rows || []).filter(function (x) { return String(x[k] || '').trim() === v; }).length;
        _popup('🔎 ' + _esc(v), '<div id="pl-part-body" style="color:#888;">' + _t('불러오는 중…', 'Loading…') + '</div>');
        var html = '';
        try {
            var lib = window.loadElecPartLibrary ? await window.loadElecPartLibrary(type) : null;
            var list = (lib && (lib.items || lib.parts || lib.panels)) || [];
            var hit = window._epFlexibleFind ? window._epFlexibleFind(list, v,
                        function (p) { return p.model; },
                        function (p) { return p.specs && p.specs['Item Code']; },
                        function (p) { return p.specs && p.specs['Part Name']; }) : null;
            if (hit && hit.specs) {
                var keys = Object.keys(hit.specs).filter(function (kk) { return String(hit.specs[kk] || '').trim(); });
                html += '<div style="max-height:280px; overflow:auto; border:1px solid #e3e6ea; border-radius:6px;"><table style="width:100%; font-size:11.5px; border-collapse:collapse;">'
                      + keys.map(function (kk) {
                          return '<tr><td style="padding:3px 7px; color:#666; border-bottom:1px solid #f1f3f5; width:45%;">' + _esc(kk) + '</td>'
                               + '<td style="padding:3px 7px; border-bottom:1px solid #f1f3f5;">' + _esc(hit.specs[kk]) + '</td></tr>';
                      }).join('') + '</table></div>';
            } else {
                html += '<div style="color:#b1432f;">' + _t('PARTS 라이브러리에 없습니다.', 'Not found in the PARTS library.') + '</div>';
            }
        } catch (e) { html += '<div style="color:#b1432f;">' + _esc(e.message) + '</div>'; }
        html += '<div style="margin-top:9px;"><button onclick="window.plFilterByPanel(\'' + _esc(v) + '\')"'
             + ' style="padding:5px 10px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">📒 '
             + _t('같은 값 제품 ', 'Products with same value ') + same + _t('건 보기', '') + '</button></div>';
        var b = document.getElementById('pl-part-body');
        if (b) { b.style.color = ''; b.innerHTML = html; }
    };

    // ── 8-4. KTK PN 메뉴 — SAP 조회 / 프로젝트 열기 ──────────────────────────
    window.plOpenPnMenu = function (id) {
        var r = _rowById(id); if (!r) return;
        var pn = String(r.ktkPn || '').trim();
        if (!pn) { _toast(_t('KTK PN이 비어 있습니다.', 'KTK PN is empty.'), 'warning'); return; }
        var B = 'display:block; width:100%; text-align:left; margin-bottom:6px; padding:7px 11px; background:#e0f5f7; color:#00707d;'
              + ' border:none; border-radius:6px; font-size:12.5px; cursor:pointer;';
        _popup('🏭 ' + _esc(pn),
            '<button style="' + B + '" onclick="window.plAskAi(\'' + _esc(pn) + ' 자재내역 조회해줘\')">🔍 ' + _t('SAP 자재 내역 조회', 'SAP material description') + '</button>'
          + '<button style="' + B + '" onclick="window.plAskAi(\'' + _esc(pn) + ' 재고 조회해줘\')">📦 ' + _t('SAP 재고 조회', 'SAP stock') + '</button>'
          + '<button style="' + B + '" onclick="window.plAskAi(\'' + _esc(pn) + ' 가격 조회해줘\')">💰 ' + _t('SAP 가격 조회', 'SAP price') + '</button>'
          + '<button style="' + B + '" onclick="window.plAskAi(\'' + _esc(pn) + ' BOM 조회해줘\')">🧱 ' + _t('SAP BOM 조회', 'SAP BOM') + '</button>'
          + '<div style="border-top:1px solid #eee; margin:8px 0;"></div>'
          + '<button style="' + B + '" onclick="window.plOpenProjectOf(\'' + id + '\')">📂 ' + _t('이 모델의 프로젝트 찾기', 'Find the project for this model') + '</button>');
    };
    /** AI 문답 창에 질문을 그대로 넣어 보낸다 — SAP 경로/권한/가드를 전부 그대로 재사용한다 */
    window.plAskAi = function (q) {
        window.plClosePopup();
        if (window.openGanttQaModal) window.openGanttQaModal();
        setTimeout(function () {
            var input = document.getElementById('gantt-qa-input');
            if (!input) { _toast(_t('AI 문답 창을 열지 못했습니다.', 'Could not open the AI chat.'), 'error'); return; }
            input.value = q;
            if (window.sendGanttQaMessage) window.sendGanttQaMessage();
        }, 350);
    };
    /** 같은 모델명을 쓰는 Gantt 프로젝트를 Drive 목록에서 찾아 연다(양방향 참조) */
    window.plOpenProjectOf = async function (id) {
        var r = _rowById(id); if (!r) return;
        window.plClosePopup();
        var keys = [String(r.ktkPn || '').trim(), String(r.desc || '').trim()].filter(Boolean);
        if (!keys.length) return;
        if (window.showDriveFileListModal) {
            _toast('📂 ' + _t('드라이브 목록에서 "', 'Search the Drive list for "') + keys[0] + _t('"로 검색해보세요.', '".'), 'info', 6000);
            window.showDriveFileListModal();
        } else {
            _toast(_t('드라이브 불러오기 창을 열 수 없습니다.', 'Cannot open the Drive list.'), 'error');
        }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 9. 📎 NAS 문서함 (PN 열) + 🤖 AI 문서 분석
    //    파일은 NAS `PROJECTLIST` 폴더에 `<KTK PN>__<원래이름>` 으로 쌓는다.
    //    폴더를 PN 마다 만들지 않는 이유: 제품이 수백 개라 폴더가 폭발하고, 문서함 목록을
    //    한 번의 목록 조회로 전부 가져와 행마다 개수를 표시할 수 없게 된다.
    // ──────────────────────────────────────────────────────────────────────────
    var _docPrefix = function (r) { return String(r.ktkPn || r.pn || r._id || '').trim().replace(/[\\/:*?"<>|]/g, '_'); };
    window._plDocCache = window._plDocCache || { at: 0, names: [] };

    window._plDocCount = function (r) {
        var p = _docPrefix(r);
        if (!p) return 0;
        return (window._plDocCache.names || []).filter(function (n) { return n.indexOf(p + '__') === 0; }).length;
    };
    /** 문서함 목록을 한 번만 받아 와 캐시 — 행마다 📎 숫자를 그리기 위한 것(없으면 0으로 그린다) */
    window.plRefreshDocCache = async function (silent) {
        if (!window._dsList) return;
        try {
            var j = await window._dsList(NAS_FOLDER);
            var files = (j && (j.files || j.items || j.list)) || [];
            window._plDocCache = { at: Date.now(), names: files.map(function (f) { return String(f.name || f); }) };
            if (!silent) window.plRender();
        } catch (e) {
            if (!silent) _toast('⚠️ ' + _t('NAS 문서함을 읽지 못했습니다: ', 'Could not read the NAS folder: ') + e.message, 'warning', 6000);
        }
    };

    window.plOpenDocBox = async function (id) {
        var r = _rowById(id); if (!r) return;
        var p = _docPrefix(r);
        if (!p) { _toast(_t('KTK PN(또는 PN)을 먼저 입력해주세요 — 문서를 그 번호로 보관합니다.', 'Enter KTK PN (or PN) first — documents are filed under it.'), 'warning', 6000); return; }
        _popup('📎 ' + _esc(p) + ' ' + _t('문서함', 'documents')
             + ' <span style="font-weight:normal; color:#666; font-size:11.5px;">PN: ' + _esc(String(r.pn || '').split('\n')[0]) + '</span>',
            '<div id="pl-doc-body" style="color:#888;">' + _t('목록을 불러오는 중…', 'Loading…') + '</div>', true);
        await window.plRefreshDocCache(true);
        window._plRenderDocBody(id);
    };

    window._plRenderDocBody = function (id) {
        var r = _rowById(id); if (!r) return;
        var p = _docPrefix(r);
        var mine = (window._plDocCache.names || []).filter(function (n) { return n.indexOf(p + '__') === 0; });
        var list = mine.length
            ? mine.map(function (n) {
                var shown = n.slice(p.length + 2);
                return '<div style="display:flex; align-items:center; gap:6px; padding:5px 8px; border-bottom:1px solid #f1f3f5;">'
                     + '<span style="flex:1; word-break:break-all;">📄 ' + _esc(shown) + '</span>'
                     + '<button onclick="window._dsOpenInNewTab(\'' + NAS_FOLDER + '\',\'' + _esc(n) + '\')" style="padding:3px 8px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:11px; cursor:pointer;">' + _t('열기', 'Open') + '</button>'
                     + '<button onclick="window.plAnalyzeDoc(\'' + id + '\',\'' + _esc(n) + '\')" style="padding:3px 8px; background:#efe6fb; color:#6741d9; border:none; border-radius:5px; font-size:11px; cursor:pointer;">🤖 ' + _t('분석', 'Analyze') + '</button>'
                     + '</div>';
            }).join('')
            : '<div style="color:#888; padding:10px 2px;">' + _t('보관된 문서가 없습니다.', 'No documents yet.') + '</div>';

        var html = '<div style="border:1px solid #e3e6ea; border-radius:6px; margin-bottom:10px; max-height:240px; overflow:auto;">' + list + '</div>'
                 + '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">'
                 + '<input type="file" id="pl-doc-file" multiple style="font-size:11.5px; max-width:300px;">'
                 + '<button onclick="window.plUploadDocs(\'' + id + '\')" style="padding:5px 11px; background:#d4f3dd; color:#2b7a45; border:none; border-radius:5px; font-size:12px; font-weight:bold; cursor:pointer;">⬆️ ' + _t('NAS에 올리기', 'Upload to NAS') + '</button>'
                 + '<button onclick="window._dsOpenBrowser && window._dsOpenBrowser(\'' + NAS_FOLDER + '\')" style="padding:5px 11px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">📁 ' + _t('폴더 열기', 'Open folder') + '</button>'
                 + '</div>'
                 + '<div style="margin-top:9px; color:#888; font-size:11px; line-height:1.5;">'
                 + _t('· 문서는 NAS ', '· Files are stored in NAS ') + NAS_FOLDER + _t(' 폴더에 "' + p + '__원래이름"으로 보관됩니다.', ' as "' + p + '__originalname".')
                 + '<br>' + _t('· 🤖 분석은 문서에서 REV·PN·변경점을 읽어 이 행의 칸을 채워줍니다(미리보기 후 적용).',
                               '· 🤖 Analyze reads REV/PN/changes from the document and fills this row (with preview).') + '</div>';
        var b = document.getElementById('pl-doc-body');
        if (b) { b.style.color = ''; b.innerHTML = html; }
    };

    window.plUploadDocs = async function (id) {
        var r = _rowById(id); if (!r) return;
        var inp = document.getElementById('pl-doc-file');
        var files = inp && inp.files ? Array.prototype.slice.call(inp.files) : [];
        if (!files.length) { _toast(_t('올릴 파일을 먼저 고르세요.', 'Choose files first.'), 'warning'); return; }
        if (!window._dsPut) { _toast(_t('문서 저장소를 불러오지 못했습니다.', 'Document store unavailable.'), 'error'); return; }
        var p = _docPrefix(r), ok = 0, fail = [];
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            try {
                var named = new File([f], p + '__' + f.name, { type: f.type });
                await window._dsPut(NAS_FOLDER, named, true);
                ok++;
            } catch (e) { fail.push(f.name + ': ' + (e && e.message ? e.message : e)); }
        }
        await window.plRefreshDocCache(true);
        window._plRenderDocBody(id);
        window.plRender();
        if (ok) _toast('⬆️ ' + ok + _t('개 파일을 NAS에 올렸습니다.', ' file(s) uploaded to NAS.'), 'success');
        if (fail.length) _toast('⚠️ ' + fail.join(' / '), 'error', 8000);
    };

    // 🤖 문서 분석 — NAS 문서의 글자를 뽑아 AI에게 "이 행에 넣을 값"을 묻는다.
    //    결정론으로 못 푸는 일(사람이 쓴 문서에서 값 찾기)이라 AI를 쓰되, **사람 승인 후에만** 적용한다.
    window.PL_DOC_AI_FIELDS = window.PL_DOC_AI_FIELDS || ['agileRev', 'prodRev', 'pn', 'desc2', 'desc3', 'panel', 'panelMfr'];

    window.plAnalyzeDoc = async function (id, fileName) {
        var r = _rowById(id); if (!r) return;
        var key = window.getActiveAiKey && window.getActiveAiKey();
        if (!key) { _toast('🔑 ' + _t('AI 키가 없습니다 — [AI 도구 > AI 분석 설정]에서 먼저 등록해주세요.', 'No AI key — register one under [AI Tools > AI Analysis Settings].'), 'error', 7000); return; }
        _toast('🤖 ' + _t('문서를 읽는 중…', 'Reading the document…'), 'info');
        var text = '';
        try {
            if (window._dsTextOf) text = await window._dsTextOf(NAS_FOLDER, fileName);
            if (!String(text || '').trim() && window._dsFileOf && window._pxExtractText) {
                var file = await window._dsFileOf(NAS_FOLDER, fileName);
                text = await window._pxExtractText(file, null);
            }
        } catch (e) { _toast('⚠️ ' + _t('문서에서 글자를 뽑지 못했습니다: ', 'Could not extract text: ') + (e && e.message ? e.message : e), 'error', 8000); return; }
        if (!String(text || '').trim()) { _toast('⚠️ ' + _t('문서에 읽을 글자가 없습니다(스캔 이미지일 수 있습니다).', 'No readable text (it may be a scanned image).'), 'error', 7000); return; }
        if (text.length > 60000) text = text.slice(0, 60000);

        var fields = window.PL_DOC_AI_FIELDS.map(function (k) {
            var c = _colByKey[k]; return c ? (k + ' = ' + c.ko) : k;
        }).join(', ');
        var cur = window.PL_DOC_AI_FIELDS.map(function (k) { return k + ': ' + (r[k] || '(빈칸)'); }).join('\n');
        var prompt = '너는 디스플레이 제품 문서를 읽고 제품 목록표의 칸을 채우는 도우미다.\n'
                   + '아래 문서에서 이 제품(KTK PN ' + (r.ktkPn || '-') + ', ' + (r.desc || '') + ')에 해당하는 값만 찾아라.\n\n'
                   + '[채울 칸]\n' + fields + '\n\n'
                   + '[지금 표에 들어 있는 값]\n' + cur + '\n\n'
                   + '[문서 내용]\n' + text + '\n\n'
                   + '[출력 형식] 설명 없이 JSON 객체 하나만 출력한다. 키는 위 칸의 영문 키만 쓴다.\n'
                   + '문서에서 확실히 읽은 값만 넣고, 없으면 그 키를 아예 빼라. 원문에 없는 값을 지어내지 마라.\n'
                   + '추가로 "_summary" 키에 이 문서가 무엇이고 무엇이 바뀌었는지 두 문장으로 적어라.';

        _toast('🤖 ' + _t('AI가 분석 중입니다…', 'AI is analyzing…'), 'info');
        var res;
        try {
            res = await window._withTimeout(window.callAiBackend(key, prompt, { feature: 'Project list - 문서 분석' }),
                                            120000, _t('⏱️ AI 응답이 120초 안에 오지 않았습니다.', '⏱️ No AI response within 120s.'));
        } catch (e) { res = { ok: false, error: e }; }
        if (!res || !res.ok) {
            var em = (res && res.error && res.error.message) ? res.error.message : String((res && res.error) || '');
            _toast('⚠️ ' + _t('AI 분석 실패: ', 'AI analysis failed: ') + em, 'error', 8000);
            if (window._issueLog) { try { window._issueLog('project-list-doc-ai', { file: fileName, err: em }); } catch (e2) { /* 기록 실패가 흐름을 막지 않게 */ } }
            return;
        }
        var raw = window._extractGanttQaAiText ? window._extractGanttQaAiText(res) : '';
        var obj = null;
        try {
            var m = String(raw).match(/\{[\s\S]*\}/);
            obj = m ? JSON.parse(m[0]) : null;
        } catch (e) { obj = null; }
        if (!obj) {
            _toast('⚠️ ' + _t('AI 답을 읽지 못했습니다.', 'Could not parse the AI answer.'), 'error');
            if (window._issueLog) { try { window._issueLog('project-list-doc-ai', { file: fileName, err: 'parse', head: String(raw).slice(0, 300) }); } catch (e3) { /* 〃 */ } }
            return;
        }
        var summary = obj._summary || '';
        delete obj._summary;
        var picks = Object.keys(obj).filter(function (k) {
            return _colByKey[k] && String(obj[k] == null ? '' : obj[k]).trim() && String(obj[k]).trim() !== String(r[k] || '').trim();
        });
        if (!picks.length) {
            _popup('🤖 ' + _t('문서 분석 결과', 'Analysis result'),
                '<div style="margin-bottom:8px; color:#444;">' + _esc(summary) + '</div>'
              + '<div style="color:#888;">' + _t('표에 새로 넣을 값은 찾지 못했습니다(이미 같은 값이거나 문서에 없음).',
                                                 'No new values found (already identical or absent in the document).') + '</div>');
            return;
        }
        window._plAiPending = { id: id, obj: obj, picks: picks, file: fileName };
        var rowsHtml = picks.map(function (k, i) {
            var c = _colByKey[k];
            return '<tr><td style="padding:4px 6px;"><input type="checkbox" checked data-i="' + i + '" class="pl-ai-ck"></td>'
                 + '<td style="padding:4px 6px; color:#666;">' + _esc(window._currentLang === 'en' ? c.en : c.ko) + '</td>'
                 + '<td style="padding:4px 6px; color:#b1432f;">' + _esc(r[k] || '(빈칸)') + '</td>'
                 + '<td style="padding:4px 6px; color:#1971c2; font-weight:bold;">' + _esc(obj[k]) + '</td></tr>';
        }).join('');
        _popup('🤖 ' + _t('문서 분석 결과 — 적용할 값을 확인해주세요', 'Analysis result — confirm what to apply'),
            (summary ? '<div style="margin-bottom:9px; padding:8px 10px; background:#f8f9fa; border-radius:6px; color:#444;">' + _esc(summary) + '</div>' : '')
          + '<table style="width:100%; font-size:11.5px; border-collapse:collapse;">'
          + '<tr style="background:#f1f3f5;"><th style="width:28px;"></th><th style="text-align:left;">' + _t('항목', 'Field') + '</th>'
          + '<th style="text-align:left;">' + _t('현재', 'Current') + '</th><th style="text-align:left;">' + _t('문서에서 읽은 값', 'From document') + '</th></tr>'
          + rowsHtml + '</table>'
          + '<div style="margin-top:11px; text-align:right;">'
          + '<button onclick="window.plClosePopup()" style="padding:6px 12px; margin-right:6px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6; border-radius:6px; font-size:12px; cursor:pointer;">' + _t('취소', 'Cancel') + '</button>'
          + '<button onclick="window.plApplyAi()" style="padding:6px 14px; background:#d4f3dd; color:#2b7a45; border:1px solid #9bd8ae; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">✅ ' + _t('선택 항목 적용', 'Apply selected') + '</button>'
          + '</div>', true);
    };

    window.plApplyAi = function () {
        var p = window._plAiPending; if (!p) return;
        var r = _rowById(p.id); if (!r) { window.plClosePopup(); return; }
        var cks = document.querySelectorAll('.pl-ai-ck');
        var n = 0;
        Array.prototype.forEach.call(cks, function (ck) {
            if (!ck.checked) return;
            var k = p.picks[parseInt(ck.getAttribute('data-i'), 10)];
            if (!k) return;
            var before = r[k] == null ? '' : String(r[k]);
            r[k] = String(p.obj[k]);
            _plPushHistory(r, k, before, r[k]);
            n++;
        });
        window._plAiPending = null;
        _persist(); window.plClosePopup(); window.plRender();
        _toast('✅ ' + n + _t('개 항목을 적용했습니다(문서: ', ' field(s) applied (document: ') + p.file + ').', 'success', 5000);
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 10. 상세 보기 — 92개 칸을 그룹별 카드로. 표에서 숨긴 그룹도 여기선 다 보인다.
    // ──────────────────────────────────────────────────────────────────────────
    window.plOpenDetail = function (id) {
        var r = _rowById(id); if (!r) return;
        var html = window.PL_GROUPS.map(function (g) {
            var cols = window.PL_COLUMNS.filter(function (c) { return c.g === g.k; });
            var cells = cols.map(function (c) {
                var v = r[c.k] == null ? '' : String(r[c.k]);
                return '<div style="display:flex; gap:6px; align-items:flex-start; padding:3px 0; border-bottom:1px solid #f4f6f7;">'
                     + '<div style="width:46%; color:#666; font-size:11.5px;">' + _esc(window._currentLang === 'en' ? c.en : c.ko) + '</div>'
                     + '<div style="flex:1; font-size:11.5px; white-space:pre-wrap; word-break:break-word;'
                     + (v ? '' : ' color:#bbb;') + '">' + _esc(v || '-') + '</div></div>';
            }).join('');
            return '<div style="margin-bottom:12px;"><div style="font-weight:bold; color:#2c5f8a; font-size:12.5px; margin-bottom:4px;">'
                 + _esc(window._currentLang === 'en' ? g.en : g.ko) + '</div>' + cells + '</div>';
        }).join('');
        _popup('📄 ' + _esc(r.ktkPn || '-') + ' <span style="font-weight:normal; color:#555;">' + _esc(r.desc || '') + '</span>',
            '<div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">'
          + '<button onclick="window.plOpenDocBox(\'' + id + '\')" style="padding:5px 10px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">📎 ' + _t('문서함', 'Documents') + '</button>'
          + '<button onclick="window.plOpenPnMenu(\'' + id + '\')" style="padding:5px 10px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">🏭 SAP</button>'
          + '<button onclick="window.plDuplicateRow(\'' + id + '\')" style="padding:5px 10px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">📑 ' + _t('복제', 'Duplicate') + '</button>'
          + '<button onclick="window.plDeleteRow(\'' + id + '\')" style="padding:5px 10px; background:#fbe4e2; color:#b1432f; border:none; border-radius:5px; font-size:12px; cursor:pointer;">🗑️ ' + _t('삭제', 'Delete') + '</button>'
          + '</div>' + html, true);
    };
    window.plCloseDetail = function () { window.plClosePopup(); };

    // ──────────────────────────────────────────────────────────────────────────
    // 11. 엑셀 불러오기 — 사내 "제품 SPEC" 시트를 그대로 받는다.
    //     머리글을 읽어 열을 맞추므로 열 순서가 달라도 따라간다(한/영 둘 다).
    // ──────────────────────────────────────────────────────────────────────────
    window.plImportExcel = function () {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.xlsx,.xls,.csv';
        inp.onchange = async function () {
            var f = inp.files && inp.files[0];
            if (!f) return;
            try {
                var buf = await f.arrayBuffer();
                window._plApplyWorkbook(buf, f.name);
            } catch (e) { _toast('⚠️ ' + _t('파일을 읽지 못했습니다: ', 'Could not read the file: ') + e.message, 'error', 7000); }
        };
        inp.click();
    };

    window._plApplyWorkbook = function (arrayBuffer, label) {
        var wb = XLSX.read(arrayBuffer, { type: 'array' });
        // 머리글이 가장 많이 맞는 시트를 고른다 — 파일에 의뢰서/리스트 등 다른 시트가 섞여 있다.
        var best = null;
        wb.SheetNames.forEach(function (sn) {
            var aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', blankrows: false });
            if (!aoa.length) return;
            for (var hr = 0; hr < Math.min(5, aoa.length); hr++) {
                var hit = (aoa[hr] || []).filter(function (h) { return _keyOfHeader(h); }).length;
                if (!best || hit > best.hit) best = { sheet: sn, aoa: aoa, headRow: hr, hit: hit };
            }
        });
        if (!best || best.hit < 5) {
            _toast('⚠️ ' + _t('이 파일에서 제품 목록 머리글(KTK PN·CUSTOMER·Panel 등)을 찾지 못했습니다.',
                              'Could not find product-list headers (KTK PN, CUSTOMER, Panel…) in this file.'), 'error', 8000);
            return;
        }
        var head = best.aoa[best.headRow] || [];
        var map = head.map(function (h) { return _keyOfHeader(h); });
        var rows = [];
        for (var i = best.headRow + 1; i < best.aoa.length; i++) {
            var line = best.aoa[i] || [];
            var o = { _id: _newId() }, any = false;
            for (var c = 0; c < map.length; c++) {
                if (!map[c]) continue;
                var v = line[c];
                v = (v == null) ? '' : String(v).trim();
                if (v) any = true;
                o[map[c]] = v;
            }
            if (any && (String(o.ktkPn || '').trim() || String(o.desc || '').trim())) rows.push(o);
        }
        if (!rows.length) { _toast('⚠️ ' + _t('읽을 제품 행이 없습니다.', 'No product rows found.'), 'error'); return; }

        var cur = (D().rows || []).length;
        var mode = cur
            ? (confirm(_t('지금 표에 ' + cur + '건이 있습니다.\n\n[확인] KTK PN 기준으로 합치기(같은 번호는 덮어씀)\n[취소] 통째로 교체',
                          'The table has ' + cur + ' rows.\n\n[OK] Merge by KTK PN (same number overwritten)\n[Cancel] Replace all')) ? 'merge' : 'replace')
            : 'replace';

        if (mode === 'replace') {
            if (cur && !confirm(_t('기존 ' + cur + '건을 전부 지우고 ' + rows.length + '건으로 교체합니다. 계속할까요?',
                                   'This replaces all ' + cur + ' rows with ' + rows.length + ' rows. Continue?'))) return;
            D().rows = rows;
            _plPushHistory({ ktkPn: '-', desc: label }, 'no', cur + _t('건', ''), rows.length + _t('건 (엑셀 교체)', ' rows (Excel replace)'));
        } else {
            var byPn = {};
            (D().rows || []).forEach(function (r) { var k = String(r.ktkPn || '').trim(); if (k) byPn[k] = r; });
            var added = 0, updated = 0;
            rows.forEach(function (n) {
                var k = String(n.ktkPn || '').trim();
                var old = k ? byPn[k] : null;
                if (old) {
                    window.PL_COLUMNS.forEach(function (c) {
                        var nv = n[c.k];
                        if (nv == null || nv === '') return;
                        if (String(old[c.k] == null ? '' : old[c.k]) === String(nv)) return;
                        _plPushHistory(old, c.k, old[c.k], nv);
                        old[c.k] = nv;
                    });
                    updated++;
                } else { D().rows.push(n); added++; }
            });
            _plPushHistory({ ktkPn: '-', desc: label }, 'no', '', _t('엑셀 합치기: 추가 ' + added + ' / 갱신 ' + updated,
                                                                     'Excel merge: +' + added + ' / updated ' + updated));
        }
        _persist();
        window.plRender();
        window.plRefreshDocCache(true);
        _toast('✅ ' + _esc(label) + ' — ' + rows.length + _t('건을 불러왔습니다. (시트: ', ' rows imported. (sheet: ') + best.sheet + ')', 'success', 6000);
    };

    /** 엑셀 내보내기 — 지금 보이는 열/행 그대로(내보낼 땐 현재 언어 하나, 불러올 땐 두 언어 다) */
    window.plExportExcel = function () {
        var cols = _visibleCols(), rows = _visibleRows();
        if (!rows.length) { _toast(_t('내보낼 행이 없습니다.', 'Nothing to export.'), 'warning'); return; }
        var aoa = [cols.map(function (c) { return window._currentLang === 'en' ? c.en : c.ko; })];
        rows.forEach(function (r) { aoa.push(cols.map(function (c) { return r[c.k] == null ? '' : String(r[c.k]); })); });
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = cols.map(function (c) { return { wpx: Math.max(60, c.w) }; });
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, _t('Project list', 'Project list'));
        var name = 'ProjectList_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.xlsx';
        XLSX.writeFile(wb, name);
        _toast('📊 ' + name + _t(' 로 저장했습니다.', ' saved.'), 'success');
    };

    /** 지금 표를 NAS 에 엑셀로 보관 — 스냅샷(월말 백업 등) */
    window.plSaveToNas = async function () {
        if (!window._dsPut) { _toast(_t('문서 저장소를 불러오지 못했습니다.', 'Document store unavailable.'), 'error'); return; }
        var cols = window.PL_COLUMNS, rows = D().rows || [];
        if (!rows.length) { _toast(_t('저장할 행이 없습니다.', 'Nothing to save.'), 'warning'); return; }
        var aoa = [cols.map(function (c) { return window._currentLang === 'en' ? c.en : c.ko; })];
        rows.forEach(function (r) { aoa.push(cols.map(function (c) { return r[c.k] == null ? '' : String(r[c.k]); })); });
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Project list');
        var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        var name = 'ProjectList_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.xlsx';
        try {
            await window._dsPut(NAS_FOLDER, new File([out], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), true);
            await window.plRefreshDocCache(true);
            _toast('📁 ' + _t('NAS에 저장했습니다: ', 'Saved to NAS: ') + name, 'success', 5000);
        } catch (e) { _toast('⚠️ ' + (e && e.message ? e.message : e), 'error', 7000); }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 12. 초기화 — 탭이 열릴 때 그리고, Drive 에서 최신본을 한 번 받아온다.
    // ──────────────────────────────────────────────────────────────────────────
    window.plOnTabShown = function () {
        window.plRender();
        if (!window._plDriveLoaded) {
            window._plDriveLoaded = true;
            window.ProjectList.loadFromDrive().then(function (d) {
                if (d) { window._plData = d; window.plRender(); }
            });
            window.plRefreshDocCache(true).then(function () { window.plRender(); });
        }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 13. AI 문답 도구 — "LNW 제품 몇 개야?", "DV430QUB-P10 쓰는 모델 알려줘" 처럼
    //     이 표를 근거로 답하게 한다. 읽기 전용이고 네트워크를 안 탄다(local 도구).
    //     ⚠️ 돌려주는 행은 **상한을 둔다** — 164행 × 91열을 그대로 실으면 프롬프트가 터진다.
    // ──────────────────────────────────────────────────────────────────────────
    window._plQaSearchTool = function (args) {
        args = args || {};
        var rows = D().rows || [];
        var q = String(args.q || '').trim().toLowerCase();
        var field = String(args.field || '').trim();
        var limit = Math.max(1, Math.min(parseInt(args.limit, 10) || 25, 60));
        var hit = rows.filter(function (r) {
            if (!q) return true;
            if (field && _colByKey[field]) return String(r[field] == null ? '' : r[field]).toLowerCase().indexOf(q) !== -1;
            for (var i = 0; i < window.PL_COLUMNS.length; i++) {
                var v = r[window.PL_COLUMNS[i].k];
                if (v != null && String(v).toLowerCase().indexOf(q) !== -1) return true;
            }
            return false;
        });
        // 사람이 표에서 먼저 보는 칸만 — 전체 91열을 싣지 않는다
        var BRIEF = ['no', 'ktkPn', 'customer', 'factory', 'project', 'type', 'desc', 'status',
                     'pn', 'agileRev', 'ownerHw', 'panelMfr', 'panel', 'panelInch', 'salesTotal'];
        var brief = hit.slice(0, limit).map(function (r) {
            var o = {};
            BRIEF.forEach(function (k) { if (String(r[k] == null ? '' : r[k]).trim()) o[k] = r[k]; });
            return o;
        });
        var tally = function (k) {
            var m = {};
            hit.forEach(function (r) { var v = String(r[k] == null ? '' : r[k]).trim() || '-'; m[v] = (m[v] || 0) + 1; });
            return m;
        };
        return {
            전체건수: rows.length,
            조건에맞는건수: hit.length,
            돌려준건수: brief.length,
            잘렸는가: hit.length > brief.length,
            고객사별: tally('customer'),
            상태별: tally('status'),
            패널제조사별: tally('panelMfr'),
            rows: brief
        };
    };

    (function registerQaTool() {
        if (!window.QA_TOOLS) { setTimeout(registerQaTool, 400); return; }   // js/40 보다 먼저 실행될 수 있다
        if (window.QA_TOOLS.some(function (t) { return t.id === 'project_list_search'; })) return;
        window.QA_TOOLS.push({
            id: 'project_list_search', mode: 'read',
            title: 'Project list(제품 전수 목록) 조회',
            desc: '앱의 📒 Project list 페이지에 들어 있는 **제품(모델) 전수 목록**을 검색한다. '
                + '고객사·공장·프로젝트·TYPE·제품상태·KTK PN·PN·패널 모델/제조사·담당자·판매량이 들어 있다. '
                + '"LNW 제품 몇 개야?", "EU 고객 모델 보여줘", "DV430QUB-P10 쓰는 모델 알려줘", '
                + '"박용훈이 회로담당인 제품", "KASCADA43 캐비닛 제품 목록", "502270 어떤 제품이야?" '
                + '같은 질문에 쓴다. '
                + '⚠️ 이 목록은 사람이 엑셀로 올려 둔 것이라 비어 있을 수도 있다 — 전체건수가 0이면 '
                + '"Project list 페이지에 아직 자료가 없습니다"라고 답하라(없는 값을 지어내지 말 것). '
                + '⚠️ 돌려주는 행 수에는 상한이 있다(잘렸는가=true면 일부만 보여준 것) — 건수는 '
                + '`조건에맞는건수`로 답하고, 분포 질문은 `고객사별`·`상태별`·`패널제조사별` 집계를 쓰라.',
            local: '_plQaSearchTool', pick: 'rows',
            params: [
                { name: 'q', type: 'text', max: 60, desc: '찾을 말(제품코드·고객사·패널모델·담당자 이름 등). 비우면 전체 집계' },
                { name: 'field', type: 'text', max: 20, desc: '특정 칸에서만 찾을 때의 칸 키(customer/panel/ownerHw/ktkPn 등). 비우면 모든 칸' },
                { name: 'limit', type: 'number', min: 1, max: 60, default: 25, desc: '돌려줄 행 수(기본 25, 최대 60)' }
            ]
        });
    })();

    document.addEventListener('DOMContentLoaded', function () {
        var si = document.getElementById('pl-search');
        if (si) si.value = _view.search || '';
        if (document.getElementById('pl-table-wrap')) window.plRender();
    });
    document.addEventListener('click', function () { /* 팝업 바깥 클릭 닫기 */ window.plClosePopup(); });
})();
