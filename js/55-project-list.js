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

    // 📁 고객 도면/사양서가 실제로 쌓여 있는 NAS 폴더 — **철자/띄어쓰기는 NAS 그대로**('PROJECT LIST').
    //    실측 66개 파일이 전부 "7자리 고객PN + 구분자 + (REV) + 리비전" 이름이라, 파일을 **이름 그대로 두고**
    //    앞 숫자로 색인한다(앱이 파일을 다시 이름 짓지 않는다 — 사람이 NAS를 직접 열어 쓰는 폴더다).
    var NAS_FOLDER = 'PROJECT LIST/CUSTOMER';

    // 🎨 테마 팔레트 — 행 배경·머리글처럼 **JS 가 인라인으로 칠하는 곳**은 팔레트를 직접 읽어야 한다.
    //    (인라인 style 은 팔레트가 주입하는 <style id="cp-live-style"> 규칙보다 항상 세서, 안 읽으면
    //     테마를 바꿔도 이 표만 청록으로 남는다 — docs/ui-conventions.md 의 그 패턴)
    var _pal = function () {
        var T = window.CP_CURRENT_TEAL || {};
        var get = function (role, fallback) {
            try { return (window._cpRoleHex ? window._cpRoleHex(role) : '') || fallback; }
            catch (e) { return fallback; }
        };
        return {
            bg:          get('bg',          T.bg          || '#e0f5f7'),
            headerTint:  get('headerTint',  T.headerTint  || '#eef6f7'),
            border:      get('border',      T.border      || '#cfe3e5'),
            zebraB:      get('zebraB',      T.zebraB      || '#e8f2f3'),
            darkText:    get('darkText',    T.darkText    || '#00707d'),
            hoverBg:     get('hoverBg',     T.hoverBg     || '#a3d9e0'),
            hoverBorder: get('hoverBorder', T.hoverBorder || '#52a5af')
        };
    };
    window._plPal = _pal;

    // ── 팀별 관리 ─────────────────────────────────────────────────────────────
    //    이 표는 팀마다 다른 제품을 들고 있다. 그래서 공용 파일을 팀 이름으로 나눠 둔다
    //    (App_Config/ProjectList_<팀>.json). 팀을 바꾸면 그 팀 파일만 읽고 쓴다.
    window.PL_TEAMS = window.PL_TEAMS || ['개발1팀', '개발2팀', '개발3팀', '시제품팀'];
    var TEAM_KEY = 'gantt_pl_team';
    var _team = function () {
        var t = '';
        try { t = localStorage.getItem(TEAM_KEY) || ''; } catch (e) { /* 비공개 모드 */ }
        return t || '개발3팀';          // 기본 배정(2026-10-29 사용자 요청)
    };
    window._plTeam = _team;

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
        { k: 'sales', ko: '판매량',    en: 'Sales',       on: false },
        { k: 'dwg',   ko: '도면분석',  en: 'From drawing', on: false }
    ];

    var C = function (k, ko, en, g, w, type) { return { k: k, ko: ko, en: en, g: g, w: w || 110, type: type || '' }; };

    window.PL_COLUMNS = window.PL_COLUMNS || [
        C('no',          'No',                'No',                  'basic', 54),
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
        C('agileRev',    'LNW Agile REV',     'LNW Agile REV',       'basic', 130, 'rev'),

        C('ownerHw',     '회로담당(PM)',      'HW owner (PM)',       'owner', 92,  'person'),
        C('ownerFw',     '펌웨어담당',        'FW owner',            'owner', 92,  'person'),
        C('ownerMech',   '기구담당',          'Mech owner',          'owner', 92,  'person'),
        C('ownerTouch',  '터치담당',          'Touch owner',         'owner', 92,  'person'),

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

    // ══════════════════════════════════════════════════════════════════════════
    // 📐 도면 분석 항목 카탈로그(데이터) — NAS 고객 도면 67개를 **실제로 전부 읽어** 뽑은 목록이다
    //    (2026-10-29. 엑셀 91열에 없는 것까지 포함하라는 사용자 요청).
    //    cov = 67개 중 그 항목이 실제로 들어 있던 도면 수(실측). 낮다고 빼지 않는다 —
    //    있는 도면에서는 읽어야 하고, 없으면 그냥 빈칸으로 둔다.
    //    cmp = 엑셀에서 온 기존 열. 값이 다르면 상세보기에서 "도면≠표" 로 표시해 준다.
    //    ⚠️ 값은 대부분 **정규식으로 결정론 추출**한다(_plExtractDwg) — AI 는 못 뽑은 것만 맡는다
    //       (CLAUDE.md "결정론 먼저" + 무료 키 하루 한도).
    // ══════════════════════════════════════════════════════════════════════════
    window.PL_DOC_ITEMS = window.PL_DOC_ITEMS || [
        { k: 'dwgNo',      ko: '도면번호',        en: 'Drawing no.',      w: 80,  cov: 66, cmp: 'pn' },
        { k: 'dwgTitle',   ko: '도면 제목',       en: 'Drawing title',    w: 190, cov: 66, cmp: 'desc2' },
        { k: 'dwgRev',     ko: '도면 REV',        en: 'Drawing REV',      w: 64,  cov: 66, cmp: 'prodRev' },
        { k: 'dwgRevDesc', ko: '최신 REV 변경내용', en: 'Latest REV note', w: 220, cov: 66 },
        { k: 'dwgRevDate', ko: '최신 REV 일자',   en: 'Latest REV date',  w: 84,  cov: 56 },
        { k: 'dwgDrawnBy', ko: '작성자',          en: 'Drawn by',         w: 90,  cov: 66 },
        { k: 'dwgEngineer',ko: '설계 담당(ENG)',  en: 'Engineer',         w: 70,  cov: 66 },
        { k: 'dwgSize',    ko: '도면 크기',       en: 'Dwg size',         w: 56,  cov: 66 },
        { k: 'dwgScale',   ko: '축척',            en: 'Scale',            w: 56,  cov: 66 },
        { k: 'dwgSheets',  ko: '시트 수',         en: 'Sheets',           w: 60,  cov: 66 },
        { k: 'dwgUnit',    ko: '단위',            en: 'Units',            w: 56,  cov: 27 },
        { k: 'dwgTol',     ko: '일반 공차',       en: 'Tolerances',       w: 110, cov: 66 },
        { k: 'dwgWeight',  ko: '조립 중량',       en: 'Assembly weight',  w: 90,  cov: 2  },
        { k: 'dwgCustomer',ko: '도면 발행사',     en: 'Issuing company',  w: 110, cov: 66, cmp: 'customer' },
        { k: 'dwgSupplier',ko: '지정 공급사',     en: 'Named supplier',   w: 90,  cov: 64 },
        { k: 'dwgPanel',   ko: '도면 패널 모델',  en: 'Panel (in dwg)',   w: 130, cov: 62, cmp: 'panel' },
        { k: 'dwgTsp',     ko: '도면 TSP',        en: 'TSP (in dwg)',     w: 130, cov: 39, cmp: 'tsp' },
        { k: 'dwgTouchCtrl', ko: '도면 터치 CTRL', en: 'Touch CTRL (dwg)', w: 140, cov: 40, cmp: 'touchCtrl' },
        { k: 'dwgTouchFw', ko: '도면 터치 F/W',   en: 'Touch F/W (dwg)',  w: 80,  cov: 49, cmp: 'touchFw' },
        { k: 'dwgKtkModel',ko: '도면 KTK 모델',   en: 'KTK model (dwg)',  w: 120, cov: 29 },
        { k: 'dwgAltLegend', ko: 'ALT 구성 범례', en: 'ALT legend',       w: 220, cov: 21 },
        { k: 'dwgBomCount',ko: 'BOM 품목 수',     en: 'BOM items',        w: 70,  cov: 63 },
        { k: 'dwgBomTop',  ko: 'BOM 주요 품목',   en: 'BOM highlights',   w: 220, cov: 50 },
        { k: 'dwgEnv',     ko: '환경 규제',       en: 'Environmental',    w: 130, cov: 51 },
        { k: 'dwgMarking', ko: '식별 표기 요구',  en: 'Marking required', w: 160, cov: 63 },
        { k: 'dwgTamper',  ko: '탬퍼 씰',         en: 'Tamper seal',      w: 70,  cov: 52, cmp: 'tamperLabel' },
        { k: 'dwgPacking', ko: '포장 요구',       en: 'Packaging',        w: 140, cov: 41 },
        { k: 'dwgTorque',  ko: '체결 토크',       en: 'Torque',           w: 110, cov: 39 },
        { k: 'dwgSpecRefs',ko: '참조 규격',       en: 'Referenced specs', w: 120, cov: 56 },
        { k: 'dwgBright',  ko: '도면 밝기',       en: 'Brightness (dwg)', w: 90,  cov: 46, cmp: 'luminance' }
    ];
    // 카탈로그를 그대로 **열**로도 쓴다 — 기본은 꺼둔 그룹이라 평소 표는 그대로고, 켜면 비교가 된다.
    window.PL_COLUMNS = window.PL_COLUMNS.concat(window.PL_DOC_ITEMS.map(function (it) {
        return { k: it.k, ko: it.ko, en: it.en, g: 'dwg', w: it.w, type: '' };
    }));

    // ✂️ 칸에 보여줄 최대 글자 수(데이터) — 넘치면 …로 자르고 말풍선에 전문을 둔다.
    //    설명 1·2·3 은 한 칸에 문장이 통째로 들어와 표를 밀어내므로 20자로 끊는다(2026-10-29 사용자 요청).
    window.PL_CELL_MAX = window.PL_CELL_MAX || { desc: 20, desc2: 20, desc3: 20,
        dwgTitle: 24, dwgRevDesc: 24, dwgAltLegend: 24, dwgBomTop: 24, dwgMarking: 20, dwgPacking: 20 };

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
        // 팀마다 파일이 다르다 — 키/파일명은 고정값이 아니라 지금 팀에서 만든다.
        get KEY() { return 'gantt_project_list_' + _team(); },
        get FILE_NAME() { return 'ProjectList_' + _team() + '.json'; },
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
            // 💾 NAS(주) 와 Drive(보조)에 같이 쓴다 — NAS 는 구글 로그인이 없어도 되고,
            //    Drive 는 연동돼 있을 때만 쓰인다(syncToDrive 가 토큰 없으면 조용히 빠진다).
            self._syncTimer = setTimeout(function () {
                if (window.plSaveToNasJson) window.plSaveToNasJson(data);
                self.syncToDrive(data);
            }, 3000);
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
                var out = { rows: Array.isArray(d.rows) ? d.rows : [], history: Array.isArray(d.history) ? d.history : [], savedAt: d.savedAt || null };
                this._lastKnownServerCount = Math.max(this._lastKnownServerCount, out.rows.length);
                if (d.savedAt) { this._lastKnownSavedAt = d.savedAt; if (window._plSetSavedMark) window._plSetSavedMark(d.savedAt); }
                this.save(out, true);
                return out;
            } catch (e) { console.warn('[Project list] Drive 조회 실패:', e.message); return null; }
        }
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 💾 NAS JSON — **주 저장소**(2026-10-29 사용자 제안).
    //    도면이 이미 NAS 에 있고, NAS 는 구글 로그인 없이 팀 전체가 닿는다. 그래서 표 자체도
    //    같은 자리에 가벼운 JSON 한 벌로 둔다: `PROJECT LIST/ProjectList_<팀>.json`.
    //    읽는 순서: **NAS → Drive → 이 PC 캐시**. 셋 다 없으면 빈 표 + "엑셀 불러오기" 안내.
    //    쓰기: NAS 에 쓰고, 구글 연동이 돼 있으면 Drive 에도 같은 내용을 남긴다(사외/백업용).
    //    ⚠️ 경로(루트 UNC)는 코드에 적지 않는다 — 각 PC 의 docstore_config.json 에만 있다(저장소 공개).
    // ══════════════════════════════════════════════════════════════════════════
    var NAS_DATA_FOLDER = 'PROJECT LIST';
    // 파일 이름은 팀 이름 그대로(`ProjectList_개발3팀.json`). 사람이 NAS 폴더에서 보고
    //    알 수 있어야 하고, 실제로 UTF-8 그대로 오갔다(2026-10-30 확인).
    //    ⚠️ 단, **이름이 정확히 같아야 찾는 방식에 의지하지 않는다** — 사람이 복사본을 두거나
    //    이름을 조금 바꿀 수 있으니, 못 찾으면 폴더 목록에서 **키워드로** 고른다(_plFindNasDataFile).
    window.PL_TEAM_SLUG = window.PL_TEAM_SLUG || {
        '개발1팀': 'dev1', '개발2팀': 'dev2', '개발3팀': 'dev3', '개발4팀': 'dev4', '시제품팀': 'proto'
    };
    var _teamSlug = function (t) {
        t = t || _team();
        return window.PL_TEAM_SLUG[t] || String(t).replace(/[^A-Za-z0-9]+/g, '') || 'team';
    };
    var _nasDataName = function () { return 'ProjectList_' + _team() + '.json'; };
    window._plNasSavedAt = null;

    /** 파일명 키워드 매칭 — 사람이 지은 이름은 띄어쓰기·하이픈·대소문자가 제각이다.
     *  → 양쪽에서 글자·숫자만 남기고 소발로 낮춘 뒤 "들어 있는가"만 본다. */
    window._plNameHit = function (name, kw) {
        var flat = function (v) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9가-힣]+/g, ''); };
        var k = flat(kw);
        if (!k) return false;
        // ⚠️ 숫자 키워드는 **앞뒤가 숫자면 안 된다** — 6자리 KTK PN "303222" 가 7자리 고객 PN
        //    "1303222" 안에 그대로 들어 있어, 그냥 "들어 있나"로 보면 남의 도면을 끌어온다.
        //    그래서 숫자일 때만 구분자를 '-' 로 **남겨** 둔다: "1234567-1 사양서"(파생본)는 걸리고
        //    "11234567"(남의 번호)은 안 걸린다. 글자 키워드는 반대로 구분자를 떼야 한다
        //    (사람이 "AB123XY-Z1" 로 치고 파일은 "AB123XY Z1 도면.pdf" 인 경우).
        if (/^\d+$/.test(k)) {
            var dashed = String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-');
            for (var i = dashed.indexOf(k); i !== -1; i = dashed.indexOf(k, i + 1)) {
                var before = i > 0 ? dashed.charAt(i - 1) : '';
                var after = dashed.charAt(i + k.length);
                if (!/\d/.test(before) && !/\d/.test(after)) return true;
            }
            return false;
        }
        return flat(name).indexOf(k) !== -1;
    };

    /** 팀 목록 JSON 고르기 — 이름이 정확히 같은 파일이 없으면 폴더를 뒤지다.
     *  사람이 "ProjectList_개발3팀 (1).json" 처럼 복사본을 뇨도 찾아지게 하기 위해. 최신본을 고른다. */
    window._plFindNasDataFile = async function () {
        var exact = _nasDataName();
        if (!window._dsList) return exact;
        try {
            var j = await window._dsList(NAS_DATA_FOLDER);
            var files = (j && (j.files || j.items || j.list)) || [];
            var names = files.map(function (f) { return (f && f.name) ? f : { name: String(f) }; });
            if (names.some(function (f) { return f.name === exact; })) return exact;
            var team = _team(), slug = _teamSlug(team);
            var cand = names.filter(function (f) {
                return /\.json$/i.test(f.name) && window._plNameHit(f.name, 'projectlist')
                    && (window._plNameHit(f.name, team) || window._plNameHit(f.name, slug));
            });
            if (!cand.length) return exact;
            cand.sort(function (a, b) { return String(b.mtime || '').localeCompare(String(a.mtime || '')); });
            return cand[0].name;
        } catch (e) { return exact; }
    };

    window.plLoadFromNas = async function () {
        if (!window._dsFileOf) return null;
        try {
            var nm = await window._plFindNasDataFile();
            var f = await window._dsFileOf(NAS_DATA_FOLDER, nm);
            var o = JSON.parse(await f.text());
            if (!o || !Array.isArray(o.rows)) return null;
            window._plNasSavedAt = o.savedAt || null;
            window._plNasLoadedName = nm;
            return { rows: o.rows, history: Array.isArray(o.history) ? o.history : [], savedAt: o.savedAt || null };
        } catch (e) {
            // 파일이 아직 없는 건 오류가 아니다(처음 쓰는 팀) — 폴더 권한 문제만 밖으로 알린다.
            var m = (e && e.message) ? e.message : '';
            if (/허용되지 않은 폴더|not allowed/i.test(m)) window._plDocCache.error = m;
            return null;
        }
    };

    window.plSaveToNasJson = async function (data) {
        if (!window._dsPut) return false;
        try {
            // 낙관적 동시성 — 내가 마지막으로 본 savedAt 과 지금 파일의 savedAt 이 다르면
            // 그 사이 다른 팀원이 저장한 것이다. 내 화면으로 덮지 않고 최신본을 가져온다.
            var mine = window._plNasSavedAtMine;
            if (mine) {
                var cur = await window.plLoadFromNas();      // _plNasSavedAt 을 지금 값으로 갱신한다
                if (cur && window._plNasSavedAt && window._plNasSavedAt !== mine) {
                    _toast('⚠️ ' + _t('다른 팀원이 방금 저장해서, 덮어쓰지 않고 최신본을 불러왔습니다. 방금 바꾼 내용은 다시 입력해주세요.',
                                      'Another member just saved — reloaded the latest instead of overwriting. Please re-enter your recent change.'), 'warning', 8000);
                    window._plData = cur;
                    window._plNasSavedAtMine = window._plNasSavedAt;
                    window.ProjectList.save(cur, true);       // 로컬 캐시만 갱신
                    window.plRender();
                    return false;
                }
            }
            var savedAt = new Date().toISOString();
            var payload = {
                team: _team(), savedAt: savedAt,
                by: window.currentUserName || '-',
                rows: data.rows || [], history: (data.history || []).slice(-3000)
            };
            var file = new File([JSON.stringify(payload)], _nasDataName(), { type: 'application/json' });
            await window._dsPut(NAS_DATA_FOLDER, file, true);
            window._plNasSavedAt = savedAt;
            window._plNasSavedAtMine = savedAt;
            if (window._plSetSavedMark) window._plSetSavedMark(savedAt, 'NAS');
            return true;
        } catch (e) {
            var msg = (e && e.message) ? e.message : String(e);
            if (/허용되지 않은 폴더|not allowed/i.test(msg)) {
                msg = _t('백엔드를 다시 시작해야 NAS 저장이 됩니다.', 'Restart the backend to enable NAS saving.');
            }
            console.warn('[Project list] NAS 저장 실패:', msg);
            var el = document.getElementById('pl-saved-mark');
            if (el) { el.textContent = '⚠️ ' + msg; el.style.color = '#b1432f'; }
            return false;
        }
    };

    /** 팀 전환 — 지금 팀 내용을 먼저 저장하고(디바운스 중일 수 있다) 그 팀 파일로 갈아탄다 */
    window.plSwitchTeam = async function (team) {
        if (!team || team === _team()) return;
        try { window.ProjectList.syncToDrive(window._plData || { rows: [], history: [] }); } catch (e) { /* 저장 실패가 전환을 막지 않게 */ }
        try { localStorage.setItem(TEAM_KEY, team); } catch (e) { /* 〃 */ }
        window.ProjectList._driveFileId = null;          // 팀이 바뀌면 파일도 다른 파일이다
        window.ProjectList._lastKnownSavedAt = null;
        window.ProjectList._lastKnownServerCount = 0;
        window._plData = window.ProjectList.load();      // 그 팀의 로컬 캐시 먼저
        window.plRender();
        _toast('👥 ' + team + _t(' 목록으로 바꿨습니다.', ' list loaded.'), 'info');
        var fresh = await window.ProjectList.loadFromDrive();
        if (fresh) { window._plData = fresh; window.plRender(); }
    };

    window._plData = window._plData || window.ProjectList.load();
    var D = function () { window._plData = window._plData || { rows: [], history: [] }; return window._plData; };
    // 💾 저장 경로는 두 갈래다.
    //    ① localStorage — 고치는 즉시(동기). 창이 죽어도 이 PC 에는 남는다.
    //    ② Drive 공용 파일 — 3초 디바운스(팀원이 같이 쓰는 파일이라 타자마다 올리면 안 된다).
    //    ⚠️ ②가 뜨기 전에 창을 닫으면 그 수정은 **나만 갖고 있게 된다**. 그래서 화면을 벗어나는
    //    모든 길목(탭 숨김·페이지 이탈·앱 안에서 다른 탭으로)에서 _plFlushSave() 로 즉시 밀어 올린다.
    var _plDirty = false;
    var _persist = function () { _plDirty = true; _plMarkDirty(); window.ProjectList.save(D()); };

    /** 디바운스를 기다리지 않고 지금 올린다(이탈 직전용). */
    window.plFlushSave = function () {
        if (!_plDirty) return;
        var PL = window.ProjectList;
        if (PL._syncTimer) { clearTimeout(PL._syncTimer); PL._syncTimer = null; }
        try { if (window.plSaveToNasJson) window.plSaveToNasJson(D()); } catch (e) { console.warn('[Project list] NAS 즉시 저장 실패:', e && e.message); }
        try { PL.syncToDrive(D()); } catch (e) { console.warn('[Project list] Drive 즉시 저장 실패:', e && e.message); }
    };

    var _plMarkDirty = function () {
        var el = document.getElementById('pl-saved-mark');
        if (el) {
            el.textContent = '● ' + _t('저장 중…', 'saving…');
            el.style.color = '#b98900';
        }
    };

    /** Drive 에 올라간 시각 — 여기까지 와야 "팀원도 볼 수 있는 저장"이다. */
    window._plSetSavedMark = function (iso, where) {
        if (window._plClearDirty) window._plClearDirty();
        var el = document.getElementById('pl-saved-mark');
        if (!el) return;
        var d = iso ? new Date(iso) : new Date();
        var tag = (where === 'NAS') ? '🗄️ ' + _t('NAS 저장 ', 'saved to NAS ') : '☁️ ' + _t('드라이브 저장 ', 'saved to Drive ');
        el.textContent = tag + d.toLocaleString(window._currentLang === 'en' ? 'en-US' : 'ko-KR');
        el.style.color = '#2b7a45';
        el.title = _t('팀 공용 파일(App_Config/ProjectList_' + _team() + '.json)에 반영된 시각입니다.',
                      'Time this was written to the shared team file (App_Config/ProjectList_' + _team() + '.json).');
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
            // 🔢 숫자 칸은 숫자로 — 글자로 비교하면 1, 10, 100, 2 순이 된다(사용자 지적).
            //    No·판매량만이 아니라 **값이 전부 숫자인 칸**이면 숫자로 본다(KTK PN 등).
            var col = _colByKey[s.k] || {};
            var isNum = col.type === 'num' || s.k === 'no';
            if (!isNum) {
                var seen = 0, allNum = true;
                for (var qi = 0; qi < rows.length && qi < 60; qi++) {
                    var sv = String(rows[qi][s.k] == null ? '' : rows[qi][s.k]).trim();
                    if (!sv) continue;
                    seen++;
                    if (!/^-?\d+(\.\d+)?$/.test(sv)) { allNum = false; break; }
                }
                isNum = allNum && seen > 0;
            }
            rows.sort(function (a, b) {
                var x = a[s.k], y = b[s.k];
                if (isNum) {
                    var nx = parseFloat(String(x == null ? '' : x).replace(/[^\d.-]/g, ''));
                    var ny = parseFloat(String(y == null ? '' : y).replace(/[^\d.-]/g, ''));
                    if (isNaN(nx)) nx = -Infinity;        // 빈칸은 항상 끝쪽으로
                    if (isNaN(ny)) ny = -Infinity;
                    if (nx !== ny) return (nx - ny) * s.dir;
                    return 0;
                }
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

    /** @param {boolean} light 검색어 타자처럼 "표만" 다시 그리면 되는 경우 true —
     *  필터 드롭다운(값마다 건수를 다시 세고 <select> 를 새로 만든다)을 건너뛴다. */
    // 🎨 머리띠 버튼 칠하기 — HTML 에 인라인으로 박힌 색은 팔레트 <style> 보다 세서, 테마를 바꿔도
    //    이 띠만 옛 색으로 남는다. 특히 "📐 도면 분석"은 보라색이 박혀 있어 혼자 튀었다(2026-10-30 지적).
    //    기본 버튼은 팔레트 bg/darkText, 도면 분석만 한 단계 진한 hoverBg 로 구분한다(색은 전부 팔레트).
    window._plPaintHeaderButtons = function () {
        var P = _pal();
        var paint = function (id, bg, fg, bd) {
            var el = document.getElementById(id); if (!el) return;
            el.style.background = bg; el.style.color = fg;
            el.style.border = '1px solid ' + bd;
        };
        ['pl-btn-reset', 'pl-btn-add', 'pl-btn-import', 'pl-btn-export', 'pl-btn-nas', 'pl-btn-cols', 'pl-btn-print']
            .forEach(function (id) { paint(id, P.bg, P.darkText, P.border); });
        paint('pl-btn-dwg', P.hoverBg, P.darkText, P.hoverBorder);
    };

    window.plRender = function (light) {
        var wrap = document.getElementById('pl-table-wrap');
        if (!wrap) return;
        window._plPaintHeaderButtons();
        var cols = _visibleCols(), rows = _visibleRows();
        var P = _pal();          // 🎨 테마 색 — 아래 인라인 배경(머리글/제브라/고정행)에 그대로 쓴다

        var left = 0, leftOf = {};
        cols.forEach(function (c) { if (STICKY.indexOf(c.k) !== -1) { leftOf[c.k] = left; left += c.w; } });

        // ⚠️ table-layout:fixed 에서는 **표 자체의 폭**이 정해져야 열 폭이 지켜진다. 폭을 안 주면
        //    브라우저가 컨테이너 폭(예: 990px)을 열 개수로 나눠버려 28열이 전부 35px 이 된다(실측).
        //    그래서 보이는 열 폭의 합을 표 폭으로 주고, th 에는 min/max 가 아니라 width 를 준다.
        var totalW = cols.reduce(function (s, c) { return s + c.w; }, 0);

        var th = cols.map(function (c) {
            var sticky = leftOf[c.k] !== undefined
                ? 'position:sticky; left:' + leftOf[c.k] + 'px; z-index:5; background:' + P.headerTint + ';' : '';
            var s = _view.sort || {};
            var mark = s.k === c.k ? (s.dir > 0 ? ' ▲' : ' ▼') : '';
            // 말풍선엔 **원래 이름**을 먼저 — 줄임말만 보고는 무슨 열인지 모르기 때문(사용자 요청).
            var tip = _headFull(c) + '\n' + _t('클릭: 정렬 · 우클릭: 이 열 숨기기', 'Click: sort · Right-click: hide this column');
            return '<th data-k="' + c.k + '" title="' + _esc(tip) + '"'
                 + ' onclick="window.plSort(\'' + c.k + '\')" oncontextmenu="window.plHideCol(\'' + c.k + '\'); return false;"'
                 + ' style="width:' + c.w + 'px; cursor:pointer; ' + sticky + '">'
                 + _esc(_headShort(c)) + mark + '</th>';
        }).join('');

        var body = rows.map(function (r, ri) {
            var pinned = (_view.pins || []).indexOf(r._id) !== -1;
            // 🦓 제브라 — 한 줄 건너 연한 배경. sticky 칸은 자기 배경을 따로 들고 있어야
            //    가로 스크롤 때 밑줄이 비쳐 보이지 않는다(배경 없는 sticky 는 투명이다).
            var zebra = (ri % 2 === 1);
            var rowBg = pinned ? '#fff8e1' : (zebra ? P.zebraB : '#fff');
            var tds = cols.map(function (c) {
                var v = r[c.k] == null ? '' : String(r[c.k]);
                var sticky = leftOf[c.k] !== undefined
                    ? 'position:sticky; left:' + leftOf[c.k] + 'px; z-index:3; background:' + rowBg + ';' : '';
                var extra = '', cls = 'pl-td';
                if (c.type === 'num') extra += 'text-align:right;';
                if (c.k === 'no') {
                    // 숫자가 주인공이다 — 예전엔 📌 아이콘이 44px 칸을 먹어 번호가 잘려 보였다(사용자 지적).
                    //    고정(📌)은 행 메뉴 안으로 옮겼고, 여기선 고정된 행만 작게 표시한다.
                    return '<td class="pl-td pl-no" style="' + sticky + ' text-align:center; cursor:pointer; font-weight:bold; color:' + P.darkText + ';"'
                         + ' onclick="event.stopPropagation(); window.plOpenRowMenu(\'' + r._id + '\', event)"'
                         + ' title="' + _esc(_t('클릭: 행 메뉴(위/아래 추가·삭제·상세)', 'Click: row menu (insert/delete/detail)')) + '">'
                         + (pinned ? '<span style="font-size:9px;">📌</span>' : '') + _esc(v) + '</td>';
                }
                // ✂️ 긴 글은 정해진 글자 수까지만 — 설명 1·2·3 처럼 한 칸에 문장이 들어오는 열(사용자 요청 20자).
                //    잘린 건 말풍선에 전문이 들어 있고, 칸을 누르면 입력칸에서 전체가 보인다.
                var shown = v, cut = false;
                var lim = window.PL_CELL_MAX[c.k];
                if (lim && v.length > lim) { shown = v.slice(0, lim) + '…'; cut = true; }
                // 특수 열 — 값 옆에 작은 아이콘, 아이콘을 눌러야 창이 뜬다(글자 수정과 안 겹치게)
                var ico = '';
                if (c.type === 'doc') {
                    // 📄 아이콘은 **칸 오른쪽 끝에 고정**한다(값 뒤에 붙여 두면 긴 PN 에 밀려 잘려서 안 보였다 —
                    //    사용자 지적 "말줄임 아이콘 안 보임"). 자료가 있으면 개수를 파랗게, 없으면 흐리게.
                    var n = window._plDocCount ? window._plDocCount(r) : 0;
                    ico = '<span class="pl-ico pl-ico-fix" onclick="event.stopPropagation(); window.plOpenDocBox(\'' + r._id + '\')"'
                        + ' style="' + (n ? 'opacity:1;' : 'opacity:.35;') + '"'
                        + ' title="' + _esc(n ? (n + _t('개 NAS 자료 — 열기/올리기/AI 분석', ' NAS file(s) — open/upload/AI analysis'))
                                              : _t('NAS 자료 없음 — 눌러서 올리기', 'No NAS file — click to upload')) + '">'
                        + (n ? '<b style="color:#1971c2; font-size:10px;">' + n + '</b>' : '') + '📄</span>';
                } else if (c.type === 'rev') {
                    // 📜 Agile REV — 누르면 그 도면의 REVISIONS 표를 그대로 보여 준다(값을 쓰는 게 아니라 보는 것)
                    var dn = window._plDocCount ? window._plDocCount(r) : 0;
                    ico = '<span class="pl-ico pl-ico-fix" onclick="event.stopPropagation(); window.plOpenRevisions(\'' + r._id + '\')"'
                        + ' style="' + (dn ? 'opacity:1;' : 'opacity:.35;') + '"'
                        + ' title="' + _esc(dn ? _t('도면의 REVISIONS 이력 보기', 'View the drawing\'s REVISIONS table')
                                               : _t('연결된 도면이 없습니다 — PN을 확인하세요', 'No linked drawing — check the PN')) + '">📜</span>';
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
                // 아이콘이 있는 칸은 오른쪽에 자리를 비워 두고(padding-right) 그 자리에 아이콘을 고정한다.
                if (ico) { cls += ' pl-has-ico'; }
                return '<td class="' + cls + '" data-id="' + r._id + '" data-k="' + c.k + '"'
                     + ((cut || ico) ? ' title="' + _esc(v || '') + '"' : '')
                     + ' onclick="window.plEditCell(this)" style="' + sticky + extra + '">'
                     + '<span class="pl-v">' + _esc(shown).replace(/\n/g, ' ') + '</span>' + ico + '</td>';
            }).join('');
            return '<tr data-id="' + r._id + '" class="' + (zebra ? 'pl-zebra' : '') + (pinned ? ' pl-pinned' : '') + '"'
                 + ' style="background:' + rowBg + ';">' + tds + '</tr>';
        }).join('');

        wrap.innerHTML = '<table id="pl-table" class="concept-table pl-table" style="width:' + totalW + 'px;"><thead><tr>' + th + '</tr></thead><tbody>'
                       + (body || '<tr><td colspan="' + cols.length + '" style="padding:30px; text-align:center; color:#888;">'
                          + _esc(_t('표가 비어 있습니다 — [📥 엑셀 불러오기]로 제품 목록 엑셀을 넣어주세요.',
                                    'The table is empty — use [📥 Import Excel] to load the product list.')) + '</td></tr>')
                       + '</tbody></table>';

        var cnt = document.getElementById('pl-count');
        if (cnt) cnt.textContent = rows.length + ' / ' + (D().rows || []).length + _t('건', '');
        if (!light) window.plRenderChips();
        window.plRenderStats();
        window._plBindTableDnd();
        window.plRefreshLang();
        if (window._cpApplyLive) { try { window._cpApplyLive(); } catch (e) { /* 팔레트 미초기화 시 무시 */ } }
    };

    // 열 그룹 칩 + 필터 드롭다운
    window.plRenderChips = function () {
        var box = document.getElementById('pl-group-chips');
        if (box) {
            var CP = _pal();
            box.innerHTML = window.PL_GROUPS.map(function (g) {
                var on = !!_view.groups[g.k];
                return '<span onclick="window.plToggleGroup(\'' + g.k + '\')" style="cursor:pointer; user-select:none; padding:3px 9px; margin-right:4px;'
                     + ' border-radius:12px; font-size:11.5px; font-weight:bold; border:1px solid ' + (on ? CP.hoverBorder : '#dde3e5') + ';'
                     + ' background:' + (on ? CP.bg : '#f6f8f9') + '; color:' + (on ? CP.darkText : '#9aa5a9') + ';">'
                     + (on ? '☑ ' : '☐ ') + _esc(window._currentLang === 'en' ? g.en : g.ko) + '</span>';
            }).join('');
        }
        var fb = document.getElementById('pl-filter-box');
        if (fb) {
            var FKEYS = ['customer', 'factory', 'project', 'type', 'status', 'cabinet', 'panelMfr'];
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

    // 🌐 머리글 바 문구 — docs/ui-conventions.md 규칙대로 **JS 한 곳에서** 한/영을 만든다.
    //    정적 HTML 에 한글을 박아 두면 언어를 바꿔도 이 페이지만 한글로 남는다(그 사고가 반복됐다).
    //    언어 전환(toggleLang)에서도 불러 주므로, 이미 그려진 화면도 같이 따라간다.
    window.PL_UI_TEXT = window.PL_UI_TEXT || {
        'pl-btn-add':     ['➕ 행 추가',        '➕ Add row'],
        'pl-btn-import':  ['📥 엑셀 불러오기', '📥 Import Excel'],
        'pl-btn-export':  ['📊 엑셀 저장',     '📊 Export Excel'],
        'pl-btn-nas':     ['📁 NAS',           '📁 NAS'],
        'pl-btn-dwg':     ['📐 도면 분석',     '📐 Analyze drawings'],
        'pl-btn-cols':    ['🔁 열',            '🔁 Columns'],
        'pl-btn-print':   ['🖨️ 인쇄 (PDF)',    '🖨️ Print (PDF)'],
        'pl-btn-reset':   ['↺',                '↺']
    };
    window.PL_UI_TITLE = window.PL_UI_TITLE || {
        'pl-btn-reset': ['검색·필터·정렬 초기화', 'Reset search, filters and sorting'],
        'pl-btn-cols':  ['숨긴 열 되돌리기',      'Restore hidden columns'],
        'pl-btn-dwg':   ['NAS에 저장된 도면을 전부 읽어 "도면분석" 칸을 채웁니다 — AI를 쓰지 않습니다',
                         'Reads every linked NAS drawing and fills the "From drawing" columns — no AI used'],
        'pl-btn-nas':   ['NAS 자료실 — 목록(JSON)·백업과 고객 도면을 열고, 올리고, 불러오고, AI로 분석합니다',
                         'NAS files — open, upload, import and AI-analyze the team list (JSON), backups and customer drawings'],
        'pl-team':      ['이 목록을 관리하는 팀 — 팀마다 목록이 따로 저장됩니다',
                         'Team that owns this list — each team has its own list']
    };
    window.plRefreshLang = function () {
        var en = window._currentLang === 'en';
        Object.keys(window.PL_UI_TEXT).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.textContent = window.PL_UI_TEXT[id][en ? 1 : 0];
        });
        Object.keys(window.PL_UI_TITLE).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.title = window.PL_UI_TITLE[id][en ? 1 : 0];
        });
        var h2 = document.querySelector('#pl-header-box h2');
        if (h2) h2.textContent = '📒 ' + (en ? 'Project list' : 'Project list');
        var si = document.getElementById('pl-search');
        if (si) si.placeholder = en ? '🔍 Search (all cells)' : '🔍 검색 (모든 칸)';
        var sel = document.getElementById('pl-team');
        if (sel && !sel._plFilled) {
            sel._plFilled = true;
            sel.innerHTML = window.PL_TEAMS.map(function (t) {
                return '<option value="' + _esc(t) + '"' + (t === _team() ? ' selected' : '') + '>👥 ' + _esc(t) + '</option>';
            }).join('');
        }
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
    // ⚡ 검색은 **타자마다** 부르면 느리다 — 164행 × 91열 재렌더가 한 번에 112ms 라(실측)
    //    글자를 칠 때마다 화면이 밀린다. 입력이 멎고 나서 한 번만 그린다(필터 목록은 건너뛴다).
    var _searchTimer = null;
    window.plSearch = function (v) {
        _view.search = v;
        if (_searchTimer) clearTimeout(_searchTimer);
        _searchTimer = setTimeout(function () { _saveView(); window.plRender(true); }, 160);
    };
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
    // 🔢 NO 숫자를 누르면 뜨는 행 메뉴 — 위/아래로 이동, 위/아래에 행 추가, 삭제, 고정, 상세.
    //    누른 자리 바로 옆에 작게 띄운다(표가 길어 화면 가운데 모달은 되레 불편하다).
    window.plOpenRowMenu = function (id, ev) {
        if (ev) { ev.stopPropagation(); }
        var r = _rowById(id); if (!r) return;
        var pinned = (_view.pins || []).indexOf(id) !== -1;
        var box = document.getElementById('pl-rowmenu');
        if (!box) {
            box = document.createElement('div');
            box.id = 'pl-rowmenu';
            box.onclick = function (e) { e.stopPropagation(); };
            document.body.appendChild(box);
        }
        // 🎨 모양은 사용자가 준 디자인 그대로 — 흰 라운드 상자 안에 **파스텔 라운드 사각형 2×2**.
        //    ⌃⌄(파랑) 이동 · ＋(초록) 추가 · －(빨강) 삭제. 통일성 때문에 다른 팝업도 이 톤을 쓴다.
        var _b = function (bg, bd, fg) {
            return 'width:42px; height:36px; border:1px solid ' + bd + '; border-radius:9px; background:' + bg + ';'
                 + ' color:' + fg + '; cursor:pointer; font-size:15px; font-weight:bold; line-height:1;'
                 + ' display:flex; align-items:center; justify-content:center; transition:filter .12s;';
        };
        var BLUE = _b('#e8f1fd', '#c7ddf7', '#4a7fd4');
        var GREEN = _b('#e9f7ec', '#bfe6c9', '#35a35a');
        var RED = _b('#fdeceb', '#f6c9c5', '#d4584f');
        var SMALL = 'flex:1; padding:5px 0; border:1px solid #dde6ea; border-radius:9px; background:#fff; cursor:pointer;'
                  + ' font-size:11px; color:#5b6b73;';
        box.style.cssText = 'position:fixed; z-index:100001; background:#fff; border:1px solid #e3eaed; border-radius:14px;'
                          + ' box-shadow:0 8px 22px rgba(0,0,0,.16); padding:9px;';
        box.innerHTML =
            '<div style="font-size:10.5px; color:#9aa5a9; text-align:center; margin-bottom:6px;">'
          + _esc(_t('행 ', 'Row ') + (r.no || '')) + '</div>'
          + '<div style="display:grid; grid-template-columns:repeat(2,42px); gap:7px;">'
          + '<button title="' + _esc(_t('위로 이동', 'Move up')) + '" onclick="window.plMoveRow(\'' + id + '\',-1)" style="' + BLUE + '">⌃</button>'
          + '<button title="' + _esc(_t('아래로 이동', 'Move down')) + '" onclick="window.plMoveRow(\'' + id + '\',1)" style="' + BLUE + '">⌄</button>'
          + '<button title="' + _esc(_t('아래에 행 추가', 'Insert row below')) + '" onclick="window.plInsertRow(\'' + id + '\',1)" style="' + GREEN + '">＋</button>'
          + '<button title="' + _esc(_t('이 행 삭제', 'Delete row')) + '" onclick="window.plDeleteRow(\'' + id + '\')" style="' + RED + '">－</button>'
          + '</div>'
          + '<div style="display:flex; gap:6px; margin-top:7px;">'
          + '<button title="' + _esc(_t('위에 행 추가', 'Insert row above')) + '" onclick="window.plInsertRow(\'' + id + '\',0)" style="' + SMALL + '">＋↑</button>'
          + '<button title="' + _esc(pinned ? _t('고정 해제', 'Unpin') : _t('맨 위에 고정', 'Pin to top')) + '" onclick="window.plTogglePin(\'' + id + '\'); window.plCloseRowMenu();" style="' + SMALL + (pinned ? ' background:#fff8e1; border-color:#f2dfa0;' : '') + '">📌</button>'
          + '<button title="' + _esc(_t('상세 보기', 'Detail')) + '" onclick="window.plCloseRowMenu(); window.plOpenDetail(\'' + id + '\')" style="' + SMALL + '">📋</button>'
          + '</div>';
        box.style.display = 'block';
        // 화면 밖으로 나가지 않게 — 아래/오른쪽이 모자라면 위/왼쪽으로 붙인다
        var x = ev ? ev.clientX : 100, y = ev ? ev.clientY : 100;
        var w = box.offsetWidth || 115, h = box.offsetHeight || 150;
        box.style.left = Math.max(6, Math.min(x + 6, window.innerWidth - w - 8)) + 'px';
        box.style.top = Math.max(6, Math.min(y + 6, window.innerHeight - h - 8)) + 'px';
    };
    window.plCloseRowMenu = function () { var b = document.getElementById('pl-rowmenu'); if (b) b.style.display = 'none'; };

    /** 행 순서 바꾸기 — 보이는 순서가 아니라 **원본 배열**에서 옮긴다(정렬/필터가 걸려 있어도 결과가 같게) */
    window.plMoveRow = function (id, dir) {
        var rows = D().rows || [];
        var i = rows.findIndex(function (x) { return x._id === id; });
        var j = i + dir;
        if (i < 0 || j < 0 || j >= rows.length) return;
        var t = rows[i]; rows[i] = rows[j]; rows[j] = t;
        _plPushHistory(t, 'no', _t('순서 ', 'order ') + (i + 1), _t('순서 ', 'order ') + (j + 1));
        _persist(); window.plRender(); window.plCloseRowMenu();
    };
    /** 위(0)/아래(1)에 빈 행 추가 */
    window.plInsertRow = function (id, below) {
        var rows = D().rows || [];
        var i = rows.findIndex(function (x) { return x._id === id; });
        if (i < 0) return;
        var at = i + (below ? 1 : 0);
        var r = { _id: _newId(), no: '' };
        rows.splice(at, 0, r);
        _plRenumber();
        _plPushHistory(r, 'no', '', (below ? _t('아래에 추가', 'inserted below') : _t('위에 추가', 'inserted above')));
        _persist(); window.plRender(); window.plCloseRowMenu();
    };
    /** No 다시 매기기 — 끼워 넣거나 지운 뒤 번호가 어긋나지 않게 */
    var _plRenumber = function () {
        (D().rows || []).forEach(function (r, i) { r.no = String(i + 1); });
    };
    window._plRenumber = _plRenumber;

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
        _plRenumber();
        _persist(); window.plRender(); window.plCloseDetail(); window.plCloseRowMenu();
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
    // 📇 색인 규칙(실측 66개 파일에서 뽑음)
    //    파일명: "<숫자> [구분자] [REV] <리비전>" — 구분자는 공백/밑줄/하이픈, REV 글자는 있을 수도 없을 수도,
    //    뒤의 "(1)" "(2)" 는 같은 리비전의 중복본 표시다.
    //      1234567 REV K.pdf · 1234567_REV J4.pdf · 1234568_H.pdf · 1234569-A.2 (1).pdf
    //      1234570-revB (2).PDF · 1234571 UPPER DISPLAY REV E.pdf
    //    ⚠️ 리비전을 "숫자 바로 뒤 글자"로 잡으면 안 된다 — "1234571 UPPER DISPLAY REV E" 가 U 가 된다.
    //       REV 라는 말이 있으면 그걸 먼저 찾고, 없을 때만 "구분자 + 리비전 하나"로 본다.
    window._plParseDocName = function (name) {
        var base = String(name || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');   // 확장자
        base = base.replace(/\s*\(\d+\)\s*$/, '').trim();                   // (1) (2) 중복본 표시
        var m = base.match(/^(\d{6,8})/);
        if (!m) return null;
        var num = m[1], rest = base.slice(num.length);
        var rev = '';
        var mv = rest.match(/rev\.?\s*([A-Za-z](?:\.?\d+)?)/i);             // "REV K" / "revB" / "REV J4"
        if (mv) rev = mv[1];
        else {
            var mt = rest.match(/^[\s_-]+([A-Za-z](?:\.?\d+)?)\s*$/);       // "_H" / "-B" / "-A.2"
            if (mt) rev = mt[1];
        }
        return { num: num, rev: rev.replace(/\./g, '').toUpperCase(), name: name };
    };

    /** 이 행이 가진 색인 번호들 — PN 칸의 7자리(여러 개일 수 있다) + KTK PN 6자리.
     *  사용자 질문("6자리 숫자도 분류가 필요한데")에 대한 답: 폴더를 나누지 않고 **번호 길이로** 가른다.
     *  7자리는 고객 PN(=지금 쌓여 있는 도면들), 6자리는 KTK 자재코드로 각각 맞춰 본다. */
    window._plRowDocNums = function (r) {
        var out = [];
        String(r.pn || '').replace(/\d{6,8}/g, function (m) { out.push(m); return m; });
        var k = String(r.ktkPn || '').trim();
        if (/^\d{6,8}$/.test(k)) out.push(k);
        return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
    };

    window._plDocCache = window._plDocCache || { at: 0, byNum: {}, all: [], total: 0, error: '' };

    // ⚠️ 색인은 "앞 숫자"만으로 보지 않는다(2026-10-30 사용자 지적).
    //    "고객 도면은 매번 파일명을 수정해서 올릴 수 없으니, 키워드가 들어간 파일은 모두 표시해줘."
    //    → 앞 숫자가 아니라 **파일명에 그 번호가 들어 있는가**로 본다. 그래서
    //      "LNW UPPER 1234567 rev K.pdf" · "1234567-1 사양서.pdf" 처럼 아무 자리에 있어도 걸린다.
    //    앞 숫자 색인(byNum)은 리비전 정렬이 정확하니 그대로 두고, 키워드 히트를 **합친다**.
    window._plDocsOf = function (r) {
        var nums = window._plRowDocNums(r);
        if (!nums.length) return [];
        var ck = window._plDocCache.at + '|' + nums.join(',');
        window._plDocsOfCache = window._plDocsOfCache || {};
        if (window._plDocsOfCache[ck]) return window._plDocsOfCache[ck];

        var out = [], seen = {};
        var push = function (f) { if (f && !seen[f.name]) { seen[f.name] = 1; out.push(f); } };
        nums.forEach(function (n) { (window._plDocCache.byNum[n] || []).forEach(push); });
        (window._plDocCache.all || []).forEach(function (nm) {
            for (var i = 0; i < nums.length; i++) {
                if (window._plNameHit(nm, nums[i])) {
                    var p = window._plParseDocName(nm);
                    push({ name: nm, num: nums[i], rev: (p && p.rev) || _plRevFromName(nm) });
                    return;
                }
            }
        });
        out.sort(function (a, b) { return String(b.rev).localeCompare(String(a.rev), 'en'); });
        window._plDocsOfCache[ck] = out;
        return out;
    };

    /** 앞 숫자 규칙에 안 맞는 이름에서도 리비전만은 건져 본다 — "… rev K.pdf" / "…_REV J4.pdf" */
    var _plRevFromName = function (nm) {
        var m = String(nm || '').match(/rev\.?\s*([A-Za-z](?:\.?\d+)?)/i);
        return m ? m[1].replace(/\./g, '').toUpperCase() : '';
    };
    window._plDocCount = function (r) { return window._plDocsOf(r).length; };

    /** 폴더 목록을 한 번 받아 번호별로 묶어 둔다 — 행마다 다시 묻지 않기 위해(164행 × 왕복은 못 쓴다) */
    window.plRefreshDocCache = async function (silent) {
        if (!window._dsList) return;
        try {
            var j = await window._dsList(NAS_FOLDER);
            var files = (j && (j.files || j.items || j.list)) || [];
            var byNum = {};
            files.forEach(function (f) {
                var nm = String(f && f.name ? f.name : f);
                var p = window._plParseDocName(nm);
                if (!p) return;
                (byNum[p.num] = byNum[p.num] || []).push({ name: nm, rev: p.rev, num: p.num });
            });
            Object.keys(byNum).forEach(function (n) {
                byNum[n].sort(function (a, b) { return String(b.rev).localeCompare(String(a.rev), 'en'); });
            });
            // all = 이름 전부. 앞 숫자 규칙에 안 맞는 파일도 키워드로 걸리게 하려면 원본 목록이 필요하다.
            var all = files.map(function (f) { return String(f && f.name ? f.name : f); });
            window._plDocCache = { at: Date.now(), byNum: byNum, all: all, total: files.length, error: '' };
            window._plDocsOfCache = {};
            if (!silent) window.plRender();
        } catch (e) {
            var msg = (e && e.message) ? e.message : String(e);
            // "허용되지 않은 폴더" = 백엔드가 아직 옛 버전이라는 뜻이다(폴더 목록이 코드에 있다).
            //    원문만 보여주면 사람이 NAS 를 뒤지게 되므로, 무엇을 하면 되는지로 바꿔 말한다.
            if (/허용되지 않은 폴더|not allowed/i.test(msg)) {
                msg = _t('백엔드를 다시 시작해야 합니다 — "' + NAS_FOLDER + '" 폴더 사용 권한이 최신 백엔드에만 있습니다.',
                         'Restart the backend — the "' + NAS_FOLDER + '" folder is only allowed in the updated backend.');
            }
            window._plDocCache.error = msg;
            if (!silent) _toast('⚠️ ' + msg, 'warning', 9000);
        }
    };

    window.plOpenDocBox = async function (id) {
        var r = _rowById(id); if (!r) return;
        var nums = window._plRowDocNums(r);
        if (!nums.length) {
            _toast(_t('PN(7자리) 또는 KTK PN(6자리)을 먼저 입력해주세요 — 그 번호로 NAS 파일을 찾습니다.',
                      'Enter a PN (7-digit) or KTK PN (6-digit) first — files are matched by that number.'), 'warning', 7000);
            return;
        }
        _popup('📄 ' + _esc(nums.join(' / ')) + ' ' + _t('자료', 'documents')
             + ' <span style="font-weight:normal; color:#666; font-size:11.5px;">' + _esc(String(r.desc || '').slice(0, 40)) + '</span>',
            '<div id="pl-doc-body" style="color:#888;">' + _t('목록을 불러오는 중…', 'Loading…') + '</div>', true);
        if (!window._plDocCache.at) await window.plRefreshDocCache(true);
        window._plRenderDocBody(id);
    };

    window._plRenderDocBody = function (id) {
        var r = _rowById(id); if (!r) return;
        var nums = window._plRowDocNums(r);
        var mine = window._plDocsOf(r);
        // 지금 REV — 생산 REV 와 Agile REV 에서 글자를 뽑아 "현재" 표시를 단다(어느 도면이 지금 것인지가 제일 중요)
        var curRevs = [];
        [r.prodRev, r.agileRev].forEach(function (v) {
            String(v || '').replace(/[A-Za-z](?:\.?\d+)?/g, function (m) { curRevs.push(m.replace(/\./g, '').toUpperCase()); return m; });
        });
        var list = mine.length
            ? mine.map(function (f) {
                var isCur = f.rev && curRevs.indexOf(f.rev) !== -1;
                return '<div style="display:flex; align-items:center; gap:6px; padding:5px 8px; border-bottom:1px solid #f1f3f5;'
                     + (isCur ? ' background:#f1fbf3;' : '') + '">'
                     + '<span style="width:52px; flex:none; font-weight:bold; color:' + (isCur ? '#2b7a45' : '#868e96') + ';">'
                     + (f.rev ? 'REV ' + _esc(f.rev) : '-') + '</span>'
                     + (isCur ? '<span title="' + _esc(_t('표의 REV와 같은 도면', 'matches the REV in the table')) + '">✅</span>' : '')
                     + '<span style="flex:1; word-break:break-all; color:#444;">' + _esc(f.name) + '</span>'
                     + '<button onclick="window._dsOpenInNewTab(\'' + NAS_FOLDER + '\',\'' + _esc(f.name) + '\')" style="padding:3px 8px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:11px; cursor:pointer;">' + _t('열기', 'Open') + '</button>'
                     + '<button onclick="window._dsOpenNative && window._dsOpenNative(\'' + NAS_FOLDER + '\',\'' + _esc(f.name) + '\')" title="' + _esc(_t('NAS 원본을 연결 프로그램으로', 'Open the NAS original in its app')) + '" style="padding:3px 8px; background:#eef2f5; color:#495057; border:none; border-radius:5px; font-size:11px; cursor:pointer;">🖥️</button>'
                     // 💾 이 파일 하나를 내 PC 로 받는다 — 열기/연결프로그램/분석과 같은 줄에 둔다(사용자 지적: 위치가 틀렸다)
                     + '<button onclick="window.plDownloadDoc(\'' + _esc(f.name) + '\')" title="' + _esc(_t('이 파일을 내 PC에 저장', 'Save this file to my PC')) + '" style="padding:3px 8px; background:#eef7ef; color:#2b7a45; border:none; border-radius:5px; font-size:11px; cursor:pointer;">💾</button>'
                     // 🔍 분석은 **AI 를 안 쓰는** 결정론 추출이라 팔레트 색을 따른다. 보라색은
                     //    AI 한도를 쓰는 "🤖 AI로 더 읽기" 전용으로 남겨 둔다(색이 곧 경고다).
                     + '<button onclick="window.plAnalyzeDoc(\'' + id + '\',\'' + _esc(f.name) + '\')" style="padding:3px 8px; background:' + _pal().hoverBg + '; color:' + _pal().darkText + '; border:none; border-radius:5px; font-size:11px; cursor:pointer;">🔍 ' + _t('분석', 'Analyze') + '</button>'
                     + '</div>';
            }).join('')
            : '<div style="color:#888; padding:10px 2px;">'
              + (window._plDocCache.error
                 ? '⚠️ ' + _esc(window._plDocCache.error)
                 : _t('이 번호로 된 파일이 NAS에 없습니다.', 'No file in NAS starts with this number.')) + '</div>';

        var html = '<div style="border:1px solid #e3e6ea; border-radius:6px; margin-bottom:10px; max-height:260px; overflow:auto;">' + list + '</div>'
                 + '<div id="pl-doc-drop" ondragover="event.preventDefault(); this.style.background=\'#eaf8ea\';"'
                 + ' ondragleave="this.style.background=\'#fbfdfd\';"'
                 + ' ondrop="window.plDropDocs(event, \'' + id + '\')"'
                 + ' style="border:2px dashed #a3d9e0; border-radius:8px; background:#fbfdfd; padding:12px; text-align:center; color:#5a8a92; font-size:12px; cursor:pointer;"'
                 + ' onclick="document.getElementById(\'pl-doc-file\').click()">'
                 + '⬆️ ' + _esc(_t('여기에 파일을 끌어다 놓거나 눌러서 고르세요 (NAS에 바로 올라갑니다)',
                                   'Drop files here, or click to choose — uploaded straight to NAS'))
                 + '<input type="file" id="pl-doc-file" multiple style="display:none;" onchange="window.plStageDocs(\'' + id + '\')"></div>'
                 // 💾 고른 파일을 **바로 올리지 않고** 여기 모아 뒀다가 [저장]을 눌러 올린다(사용자 요청).
                 //    끌어다 놓은 파일도 같은 자리에 모인다 — 올리기 전에 무엇이 올라가는지 보이게.
                 + '<div id="pl-doc-staged" style="margin-top:8px; font-size:11.5px; color:#2b7a45; display:none;"></div>'
                 + '<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">'
                 + '<button id="pl-doc-save" onclick="window.plUploadDocs(\'' + id + '\')" disabled'
                 + ' style="padding:5px 13px; background:#d4f3dd; color:#2b7a45; border:1px solid #9bd8ae; border-radius:5px; font-size:12px; font-weight:bold; cursor:pointer; opacity:.45;">⬆️ ' + _t('NAS에 올리기', 'Upload to NAS') + '</button>'
                 + '<button onclick="window._dsOpenBrowser && window._dsOpenBrowser(\'' + NAS_FOLDER + '\')" style="padding:5px 11px; background:#e0f5f7; color:#00707d; border:none; border-radius:5px; font-size:12px; cursor:pointer;">📁 ' + _t('폴더 열기', 'Open folder') + '</button>'
                 + '<button onclick="window.plRefreshDocCache(false)" style="padding:5px 11px; background:#eef2f5; color:#495057; border:none; border-radius:5px; font-size:12px; cursor:pointer;">🔄 ' + _t('목록 새로고침', 'Refresh') + '</button>'
                 + '</div>'
                 + '<div style="margin-top:9px; color:#888; font-size:11px; line-height:1.55;">'
                 + _esc(_t('· 파일은 이름을 바꾸지 않고 그대로 올립니다 — 앞 숫자(' + nums.join(', ') + ')로 이 행과 이어집니다.',
                           '· Files keep their names — they link to this row by the leading number (' + nums.join(', ') + ').'))
                 + '<br>' + _esc(_t('· 앞 숫자가 없는 파일은 "' + (nums[0] || '') + ' " 를 앞에 붙여 올립니다.',
                                    '· A file without a leading number is uploaded with "' + (nums[0] || '') + ' " prefixed.'))
                 + '<br>' + _esc(_t('· 🤖 분석은 도면에서 REV·PN 등을 읽어 이 행의 칸을 채웁니다(미리보기 후 적용).',
                                    '· 🤖 Analyze reads REV/PN from the drawing and fills this row (with preview).')) + '</div>';
        var b = document.getElementById('pl-doc-body');
        if (b) { b.style.color = ''; b.innerHTML = html; }
    };

    /** 올릴 때 이름 규칙 — 이미 이 행의 번호로 시작하면 **그대로**, 아니면 번호만 앞에 붙인다.
     *  (사람이 NAS 폴더를 직접 열어 쓰기 때문에 앱이 이름을 헤집어 놓으면 안 된다) */
    var _uploadName = function (r, fileName) {
        var nums = window._plRowDocNums(r);
        var m = String(fileName).match(/^(\d{6,8})/);
        if (m && nums.indexOf(m[1]) !== -1) return fileName;
        return (nums[0] || '') + ' ' + fileName;
    };

    // 💾 올리기 전 대기열 — 고르거나 끌어다 놓은 파일을 모아 두고 [저장]에서 한 번에 올린다.
    window._plStaged = window._plStaged || [];
    var _renderStaged = function () {
        var box = document.getElementById('pl-doc-staged');
        var btn = document.getElementById('pl-doc-save');
        var n = window._plStaged.length;
        if (box) {
            box.style.display = n ? 'block' : 'none';
            box.innerHTML = n
                ? '📎 ' + _esc(_t('저장 대기 ' + n + '개: ', n + ' file(s) waiting: '))
                  + _esc(window._plStaged.map(function (f) { return f.name; }).join(', ')).slice(0, 300)
                  + ' <span onclick="window.plClearStaged()" style="cursor:pointer; color:#b1432f;">✕ ' + _t('비우기', 'clear') + '</span>'
                : '';
        }
        if (btn) { btn.disabled = !n; btn.style.opacity = n ? '1' : '.45'; }
    };
    window.plClearStaged = function () { window._plStaged = []; _renderStaged(); };

    /** 💾 NAS 파일 하나를 내 PC 로 — 백엔드 URL 을 그대로 내려받는다(사본이 NAS 를 건드리지 않는다) */
    window.plDownloadDoc = function (name) {
        if (!window._dsFileUrl) { _toast(_t('문서 저장소를 불러오지 못했습니다.', 'Document store unavailable.'), 'error'); return; }
        var a = document.createElement('a');
        a.href = window._dsFileUrl(NAS_FOLDER, name);
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        _toast('💾 ' + _esc(name) + _t(' 내려받는 중…', ' downloading…'), 'info');
    };

    window.plStageDocs = function (id) {
        var inp = document.getElementById('pl-doc-file');
        var files = inp && inp.files ? Array.prototype.slice.call(inp.files) : [];
        if (!files.length) return;
        window._plStaged = window._plStaged.concat(files);
        _renderStaged();
    };
    window.plDropDocs = function (ev, id) {
        ev.preventDefault();
        ev.stopPropagation();                       // 〃 window 전역 드롭 핸들러(js/04f)로 새지 않게
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        var box = document.getElementById('pl-doc-drop');
        if (box) box.style.background = '#fbfdfd';
        var files = ev.dataTransfer && ev.dataTransfer.files ? Array.prototype.slice.call(ev.dataTransfer.files) : [];
        if (!files.length) return;
        window._plStaged = window._plStaged.concat(files);
        _renderStaged();
    };
    window.plUploadDocs = async function (id) {
        var files = window._plStaged.slice();
        if (!files.length) { _toast(_t('저장할 파일을 먼저 고르거나 끌어다 놓으세요.', 'Choose or drop files first.'), 'warning'); return; }
        window._plStaged = []; _renderStaged();
        await window._plPutDocs(id, files);
    };
    window._plPutDocs = async function (id, files) {
        var r = _rowById(id); if (!r) return;
        if (!window._dsPut) { _toast(_t('문서 저장소를 불러오지 못했습니다(백엔드 확인).', 'Document store unavailable (check the backend).'), 'error'); return; }
        var ok = 0, fail = [];
        _toast('⬆️ ' + files.length + _t('개 올리는 중…', ' file(s) uploading…'), 'info');
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            try {
                var nm = _uploadName(r, f.name);
                await window._dsPut(NAS_FOLDER, (nm === f.name) ? f : new File([f], nm, { type: f.type }), true);
                ok++;
            } catch (e) { fail.push(f.name + ': ' + (e && e.message ? e.message : e)); }
        }
        await window.plRefreshDocCache(true);
        if (document.getElementById('pl-doc-body')) window._plRenderDocBody(id);
        window.plRender();
        if (ok) _toast('✅ ' + ok + _t('개 파일을 NAS에 올렸습니다.', ' file(s) uploaded to NAS.'), 'success');
        if (fail.length) _toast('⚠️ ' + fail.join(' / '), 'error', 9000);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 📐 결정론 추출기 — 도면 글자에서 **AI 없이** 읽어낸다.
    //    NAS 도면 67개를 실제로 전부 열어 보고 만든 규칙이라, 대부분의 항목이 여기서 끝난다
    //    (AI 는 못 읽은 칸만 맡는다 — 무료 키 하루 한도 + 결정론 먼저).
    //    ⚠️ 한 줄씩 끊긴 PDF 텍스트라 "라벨 옆 값"이 아니라 **라벨 다음 줄들**에서 찾아야 한다.
    // ══════════════════════════════════════════════════════════════════════════
    var _one = function (re, t, g) { var m = t.match(re); return m ? String(m[g || 1]).trim() : ''; };
    var _all = function (re, t, g) {
        var out = [], m, rx = new RegExp(re.source, re.flags.indexOf('g') === -1 ? re.flags + 'g' : re.flags);
        while ((m = rx.exec(t)) !== null) { var v = String(m[g || 1]).trim(); if (v && out.indexOf(v) === -1) out.push(v); }
        return out;
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 📜 도면 안의 **표 두 개**를 그대로 읽어 온다 — 이게 사람이 실제로 보고 싶어 하는 것이다
    //    (2026-10-30 사용자 정정: "Agile REV 열을 누르면 그 도면의 REVISIONS 정보를 바로 보고 싶었다").
    //
    //    ① REVISIONS      : REV. | DESCRIPTION | DRAWN BY | DATE
    //    ② DISPLAY INFORMATION MATRIX
    //                     : REVISION | MFR PN | PART NUMBER | VENDOR | TOUCH CTRL | TOUCH SENSOR | F/W | PANEL
    //
    //    PDF 글자는 칸 단위로 줄이 쪼개져 들어온다. 그래서 **끝나는 신호**를 기준으로 끊는다 —
    //    REVISIONS 는 날짜(m/d/yyyy), MATRIX 는 터치 F/W(V0.02 같은 것). 그 앞뒤로 칸을 센다.
    // ══════════════════════════════════════════════════════════════════════════
    var _lines = function (t) {
        return String(t || '').replace(/\r\n?/g, '\n').split('\n')
            .map(function (x) { return x.replace(/\s+/g, ' ').trim(); });
    };
    // 날짜 모양이 도면마다 다르다(실측 4종): `6/15/2021` · `06/06/22` · `12-FEB-25` · `16 JAN 26`
    var _isDate = function (s) {
        return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)
            || /^\d{1,2}\s*-\s*[A-Z]{3}\s*-\s*\d{2,4}$/i.test(s)
            || /^\d{1,2}\s+[A-Z]{3}\s+\d{2,4}$/i.test(s);
    };
    var _isRev = function (s) { return /^[A-Z](?:\.\d+)?$/.test(s); };
    var _isPerson = function (s) {
        // "A. SMITH" · "B.LEE" · "C.KIM" · "D,PARK"(쉼표도 쓴다) · "John Smith"
        return /^[A-Z][.,]\s?[A-Z][A-Za-z'-]+$/.test(s) || /^[A-Z][a-z]+\s+[A-Z][A-Za-z'-]+$/.test(s);
    };

    /** 리비전 칸 모양 — 한 개(`K`, `J.4`) 또는 범위(`G.3-G.5`, `H-K`, `A-E.2`) */
    var _isRevCell = function (s) { return /^[A-Z](?:\.\d+)?(?:\s*-\s*[A-Z](?:\.\d+)?)?$/.test(s); };

    // ⚠️⚠️ 글자를 뽑는 도구가 **둘**이고 결과 모양이 전혀 다르다(2026-10-30 실측 사고).
    //    · pdf.js(앱이 실제로 쓰는 것, `_pxExtractText`) : **한 줄 = 표의 한 행**.
    //        "G.3 ADDED -ALT1 SUFFIX … J. SMITH 6/15/2021" 처럼 칸이 공백으로 이어지고,
    //        줄 끝에는 도면 다른 영역의 글자가 섞여 들어온다.
    //    · PyMuPDF(내가 검증할 때 쓴 것) : **한 줄 = 표의 한 칸**.
    //    처음엔 PyMuPDF 모양만 보고 규칙을 짜서, 앱에서는 표가 통째로 뭉개져 보였다.
    //    그래서 **줄-행 모양을 먼저 시도하고**, 안 나오면 칸-줄 모양으로 떨어진다.
    var _VENDORS = ['TOVIS', 'KORTEK', 'AUO', 'BOE', 'INNOLUX', 'AXIOMTEK', 'LGD', 'TXD', 'INX'];
    var _DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s*-\s*[A-Z]{3}\s*-\s*\d{2,4}|\d{1,2}\s+[A-Z]{3}\s+\d{2,4})/i;
    var _HEAD_RE = /^(REV\.?\s+DESCRIPTION|DRAWN\s*BY|REVISIONS?|DATE|BY\s*\/?\s*DATE)\b/i;
    var _REVCELL_RE = /^[A-Z](?:\.\d+)?(?:\s*-\s*[A-Z](?:\.\d+)?)?\s+\S/;

    /** 설명 조각인가 — 치수·도면 좌표·BOM 행·매트릭스 행은 아니어야 한다 */
    var _isDescFrag = function (s) {
        if (!s || s.length < 6 || _HEAD_RE.test(s)) return false;
        if (_DATE_RE.test(s)) return false;
        if (/^[\d\s.,°R()+-]+$/.test(s)) return false;                 // 605.214 · 228.2 · R3048
        if (/^\d+\s+\d+\s+\S/.test(s)) return false;                   // BOM 행 "8 1 1554302-00-0 …"
        var up = s.toUpperCase();
        if (_REVCELL_RE.test(s) && _VENDORS.some(function (v) { return up.indexOf(v) !== -1; })) return false;
        return (s.match(/[A-Za-z]/g) || []).length >= 6;
    };

    /** pdf.js 모양(한 줄 = 한 행) 전용 REVISIONS 읽기. 못 읽으면 빈 배열. */
    var _revFromLineRows = function (L) {
        var PERSON = /([A-Z][.,]\s?[A-Z][A-Za-z'-]+|[A-Z]{2,4})\s*$/;
        var recs = [];
        for (var i = 0; i < L.length; i++) {
            var m = L[i].match(new RegExp(_DATE_RE.source + '\\s*$', 'i'));
            if (!m) continue;
            var before = L[i].slice(0, m.index).trim();
            var mp = before.match(PERSON);
            var by = mp ? mp[1] : '';
            var rest = mp ? before.slice(0, mp.index).trim() : before;
            var mr = rest.match(/^([A-Z](?:\.\d+)?)\b\s*/);
            recs.push({ i: i, rev: mr ? mr[1] : '', inline: mr ? rest.slice(mr[0].length).trim() : rest,
                        by: by, date: m[1], pre: [], post: [] });
        }
        if (recs.length < 2) return [];
        // 설명 조각은 **가장 가까운 기록**에 붙인다 — 앞 기록이 뒤 기록 설명을 가져가면 표가 어긋난다.
        var at = recs.map(function (r) { return r.i; });
        for (var j = 0; j < L.length; j++) {
            if (at.indexOf(j) !== -1 || !_isDescFrag(L[j])) continue;
            var best = -1, bd = 99;
            for (var k = 0; k < at.length; k++) {
                var d = Math.abs(at[k] - j);
                if (d < bd || (d === bd && at[k] > j)) { best = k; bd = d; }
            }
            if (best < 0 || bd > 2) continue;
            (j < recs[best].i ? recs[best].pre : recs[best].post).push(L[j]);
        }
        return recs.map(function (r) {
            var desc = r.pre.concat(r.inline ? [r.inline] : []).concat(r.post).join(' ');
            desc = desc.replace(/\s+/g, ' ').trim().replace(/^[A-Z]\s+(?=[A-Z]{2})/, '');
            return { rev: r.rev, desc: desc, by: r.by, date: r.date };
        });
    };

    /** pdf.js 모양 전용 MATRIX 읽기 — 행은 리비전 칸으로 시작하고, VENDOR 자리로 양식을 가른다 */
    var _matFromLineRows = function (L) {
        var A = ['REVISION', 'MANUFACTURER PART NUMBER', 'PART NUMBER', 'VENDOR',
                 'TOUCH SCREEN CONTROLLER', 'TOUCH SENSOR', 'TOUCH F/W', 'PANEL'];
        var B = ['REVISION', 'PART NUMBER', 'VENDOR', 'VENDOR P/N', 'TOUCH SCREEN',
                 'TOUCH SCREEN CONTROLLER', 'TOUCH SENSOR', 'TOUCH F/W', 'PANEL', 'VIDEO F/W'];
        var headers = null, rows = [];
        for (var i = 0; i < L.length; i++) {
            var m = L[i].match(/^([A-Z](?:\.\d+)?(?:\s*-\s*[A-Z](?:\.\d+)?)?)\s+(.*)$/);
            if (!m) continue;
            var toks = m[2].split(/\s+/);
            var vi = -1;
            for (var k = 0; k < toks.length && k < 5; k++) {
                if (_VENDORS.indexOf(toks[k].toUpperCase()) !== -1) { vi = k; break; }
            }
            if (vi < 0) continue;
            var cols = (vi === 2) ? A : (vi === 1 ? B : null);
            if (!cols) continue;
            if (!headers) headers = cols;
            if (headers !== cols) continue;                       // 한 도면에 양식이 섞이진 않는다
            rows.push([m[1].replace(/\s*-\s*/, '-')].concat(toks.slice(0, cols.length - 1)));
            if (rows.length > 40) break;
        }
        return rows.length ? { headers: headers, rows: rows } : null;
    };

    /** ① REVISIONS 표 → [{rev, desc, by, date}] (도면에 적힌 순서 그대로)
     *  ⚠️ 양식이 두 가지다(실측):
     *     A) `REV. | DESCRIPTION | DRAWN BY | DATE` — 작성자와 날짜가 **각각 한 줄**
     *     B) `REVISION | DESCRIPTION | BY/ DATE`   — 둘이 **한 줄**("JG 06/06/22")
     *     그래서 "날짜로 끝난다"를 두 모양 다 받는다. */
    window.plParseRevisions = function (text) {
        var L = _lines(text);
        var byLine = _revFromLineRows(L);          // pdf.js 모양 먼저(앱이 실제로 받는 글자)
        if (byLine.length) return byLine;
        var start = -1;
        for (var i = 0; i < L.length; i++) {
            if (/^REVISIONS?$/i.test(L[i]) || /^REV\.?\s+DESCRIPTION/i.test(L[i])) { start = i; break; }
        }
        if (start < 0) return [];
        var HEAD = /^(REV\.?|REVISIONS?|REVISION|DESCRIPTION|DRAWN\s*BY|DATE|BY\s*\/?\s*DATE|REV\.?\s+DESCRIPTION)$/i;
        var out = [], buf = [];
        var push = function (by, date) {
            if (!buf.length) { buf = []; return; }
            var head = buf[0], rev = '', rest = buf.slice(1);
            var m = head.match(/^([A-Z](?:\.\d+)?)(?:\s+(.*))?$/);
            if (m) { rev = m[1]; if (m[2]) rest.unshift(m[2]); }
            else rest.unshift(head);
            out.push({ rev: rev, desc: rest.join(' ').replace(/\s+/g, ' ').trim(), by: by, date: date });
            buf = [];
        };
        for (var j = start + 1; j < L.length && out.length < 80; j++) {
            var s = L[j];
            if (!s || HEAD.test(s)) continue;
            if (_isDate(s)) {                                   // 양식 A — 날짜만 있는 줄
                var by = (buf.length && _isPerson(buf[buf.length - 1])) ? buf.pop() : '';
                push(by, s);
                continue;
            }
            var mb = s.match(/^([A-Z][A-Za-z.,\s'-]{0,18}?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-[A-Z]{3}-\d{2,4})$/i);
            if (mb) { push(mb[1].trim(), mb[2]); continue; }     // 양식 B — "JG 06/06/22"
            if (/^(DISPLAY INFORMATION MATRIX|NOTES\b|PART NUMBER LEGEND)/i.test(s) && out.length) break;
            buf.push(s);
            if (buf.length > 14) buf.shift();                   // 표 밖 글이 섞여도 폭주하지 않게
        }
        return out;
    };

    // DISPLAY INFORMATION MATRIX 의 **열 이름 사전**(데이터) — PDF 는 머리글도 줄바꿈으로 쪼개 주므로
    // 머리글 줄을 전부 이어 붙인 뒤 이 목록으로 **긴 것부터** 끊어 읽는다. 양식마다 열 구성이 다르다.
    window.PL_MATRIX_COLS = window.PL_MATRIX_COLS || [
        'MANUFACTURER PART NUMBER', 'TOUCH SCREEN CONTROLLER', 'MANUFACTURING PART NUMBER',
        'TOUCH SCREEN', 'TOUCH SENSOR', 'TOUCH F/W', 'VIDEO F/W', 'VENDOR P/N', 'MFG P/N',
        'PART NUMBER', 'REVISION', 'VENDOR', 'PANEL', 'DISPLAY', 'NOTES'
    ];

    /** ② DISPLAY INFORMATION MATRIX → {headers:[…], rows:[[셀…]]}
     *  행은 **리비전 칸으로 시작한다**는 규칙으로 끊는다(F/W 로 끊으면 N/A 인 옛 양식을 놓친다). */
    window.plParseDisplayMatrix = function (text) {
        var L = _lines(text);
        var byLine = _matFromLineRows(L);          // pdf.js 모양 먼저
        if (byLine) return byLine;
        var at = -1;
        for (var i = 0; i < L.length; i++) {
            if (/DISPLAY INFORMATION MATRIX/i.test(L[i])) { at = i; break; }
        }
        if (at < 0) return { headers: [], rows: [] };

        // 머리글 — 첫 리비전 칸이 나오기 전까지
        var hLines = [], k = at + 1;
        for (; k < L.length && hLines.length < 16; k++) {
            if (!L[k]) continue;
            if (_isRevCell(L[k])) break;
            hLines.push(L[k]);
        }
        var joined = hLines.join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
        var vocab = (window.PL_MATRIX_COLS || []).slice().sort(function (a, b) { return b.length - a.length; });
        var headers = [], guard = 0;
        while (joined && guard++ < 40) {
            var hit = '';
            for (var v = 0; v < vocab.length; v++) {
                if (joined.indexOf(vocab[v]) === 0) { hit = vocab[v]; break; }
            }
            if (hit) { headers.push(hit); joined = joined.slice(hit.length).trim(); }
            else {                                   // 사전에 없는 말은 한 토막만 떼어 낸다
                var sp = joined.indexOf(' ');
                if (sp < 0) { headers.push(joined); joined = ''; }
                else { headers.push(joined.slice(0, sp)); joined = joined.slice(sp + 1); }
            }
        }

        // 본문 — 리비전 칸에서 다음 리비전 칸 전까지가 한 행
        var rows = [], cur = null;
        for (; k < L.length; k++) {
            var s = L[k];
            if (!s) continue;
            // 도면 테두리의 좌표 글자(1, A, B…)나 표제란이 나오면 표가 끝난 것
            if (/^(DESCRIPTION|PART NUMBER|ENGINEER|NOTES)$/i.test(s)) break;
            if (/^\d{1,2}$/.test(s) && cur && cur.length >= headers.length) break;
            if (_isRevCell(s)) {
                if (cur && cur.length > 1) rows.push(cur);
                cur = [s.replace(/\s*-\s*/, '-')];
                continue;
            }
            if (!cur) continue;
            // 한 줄에 두 칸이 붙어 온 경우("ABC123XYZ-SV 1234567-XXX-ALT1")는 쪼갠다
            if (cur.length + 1 < headers.length && /^\S+\s\S+$/.test(s) && /-/.test(s)) {
                var p2 = s.split(' ');
                cur.push(p2[0]); cur.push(p2[1]);
            } else cur.push(s);
            if (cur.length > headers.length + 2) { rows.push(cur); cur = null; }
        }
        if (cur && cur.length > 1) rows.push(cur);
        // 칸 수를 머리글에 맞춰 다듬는다(모자라면 빈칸, 넘치면 마지막 칸에 합친다)
        rows = rows.map(function (r) {
            if (!headers.length) return r;
            if (r.length > headers.length) {
                return r.slice(0, headers.length - 1).concat([r.slice(headers.length - 1).join(' ')]);
            }
            while (r.length < headers.length) r.push('');
            return r;
        });
        return { headers: headers, rows: rows };
    };

    window.plExtractDwg = function (text, row) {
        // ⚠️ PDF 글자는 **CRLF** 로 온다 — 줄 끝을 \n 으로 보고 짠 규칙이 전부 빗나간다
        //    (실측: 도면 제목이 67개 중 한 건도 안 잡혔다). 맨 먼저 눕혀 두고 시작한다.
        var t = String(text || '').replace(/\r\n?/g, '\n');
        var U = t.toUpperCase();
        var o = {};

        o.dwgNo = _one(/\b(1\d{6})\b/, t);
        // 제목 — "DISPLAY ASSY, K-43, SK-1" 처럼 대문자 + 쉼표로 이어진 줄
        o.dwgTitle = _one(/(?:^|\n)((?:DISPLAY|TOPPER|MONITOR|BUTTON|IDECK|PANEL|ASSY|ASSEMBLY|LCD)[A-Z0-9 ,.\/&-]{6,60})(?:\n|$)/, U);
        // REVISION 라벨 다음에 오는 한 글자(+소수) 리비전
        o.dwgRev = _one(/REVISION\s*\n+\s*([A-Z](?:\.\d+)?)\s*(?:\n|$)/, U) || _one(/\n([A-Z](?:\.\d+)?)\s*\nDWG\s*SIZE/, U);
        o.dwgSize = _one(/DWG\s*SIZE\s*\n+\s*([A-Z0-9]{1,3})\s*(?:\n|$)/, U) || _one(/\n([A-D])\s*\nSHEET/, U);
        o.dwgScale = _one(/\b(\d{1,3}\s*:\s*\d{1,3})\b/, t).replace(/\s+/g, '');
        o.dwgSheets = _one(/\b(\d+\s*OF\s*\d+)\b/, U).replace(/\s+/g, ' ');
        o.dwgUnit = /\bMM\b/.test(U) ? (/\bINCH\b/.test(U) ? 'MM / INCH' : 'MM') : (/\bINCH\b/.test(U) ? 'INCH' : '');
        // 설계 담당은 'ENGINEER' 라벨 **옆이 아니다** — 라벨 뒤엔 기밀 문구가 길게 붙고,
        //    실제 값은 표제란 순서로 들어온다(실측): <도면 제목> / <7자리 도면번호> / <담당 이니셜>
        var tb = U.match(/\n([A-Z0-9][A-Z0-9 ,.\/&()-]{5,60})\n(1\d{6})\n([A-Z]{2,5})\n/);
        if (tb) {
            // 표제란이 **정답**이다 — 위의 느슨한 규칙은 주석(예: "DISPLAY SHALL HAVE AN ASSEMBLED
            // WEIGHT…")을 제목으로 집는 경우가 있어서, 표제란이 잡히면 그걸로 덮는다.
            o.dwgTitle = tb[1].trim();
            o.dwgNo = tb[2];
            o.dwgEngineer = tb[3];
        }

        // 리비전 이력 — "<REV> <설명…> <사람> <m/d/yyyy>" 가 줄로 쪼개져 들어온다. 날짜를 기준으로 뒤에서 센다.
        var dates = _all(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/, t);
        if (dates.length) {
            var last = dates[dates.length - 1];
            o.dwgRevDate = last;
            var at = t.lastIndexOf(last);
            var before = t.slice(Math.max(0, at - 420), at).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
            o.dwgDrawnBy = '';
            for (var i = before.length - 1; i >= 0 && i >= before.length - 3; i--) {
                if (/^[A-Z]\.\s?[A-Z][A-Za-z]+$/.test(before[i]) || /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(before[i])) { o.dwgDrawnBy = before[i]; break; }
            }
            var desc = before.filter(function (x) { return x.length > 12 && /[A-Z]{3}/.test(x.toUpperCase()); });
            o.dwgRevDesc = desc.length ? desc[desc.length - 1].slice(0, 180) : '';
        }

        var tols = _all(/±\s*([\d.]+)/, t);
        if (tols.length) o.dwgTol = '±' + tols.slice(0, 4).join(' / ±');
        o.dwgWeight = _one(/(\d{1,3}(?:\.\d+)?\s*-\s*\d{1,3}(?:\.\d+)?\s*(?:LBS|KG))/, U) || _one(/\b(\d{1,3}(?:\.\d+)?\s*(?:LBS|KG))\b/, U);

        var cust = [];
        if (/LIGHT\s*&\s*WONDER/.test(U)) cust.push('Light & Wonder');
        if (/SCIENTIFIC\s+GAMES/.test(U)) cust.push('Scientific Games');
        if (/\bBALLY\b/.test(U)) cust.push('Bally');
        o.dwgCustomer = cust.join(' / ');
        o.dwgSupplier = _all(/\b(KORTEK|TOVIS|INNOLUX|BOE|AUO|LG\s?DISPLAY)\b/, U).slice(0, 4).join(', ');

        o.dwgPanel = _all(/\b((?:LC|DV|MV|LD|LM|P\d|T\d|G\d)[A-Z0-9][A-Z0-9-]{5,})\b/, U).slice(0, 3).join(', ');
        o.dwgTsp = _all(/\b(XP[0-9A-Z]{6,})\b/, U).slice(0, 3).join(', ');
        o.dwgTouchCtrl = _all(/\b(PP[0-9A-Z]{8,})\b/, U).slice(0, 3).join(', ');
        o.dwgTouchFw = _all(/\b(V\d+\.\d+)\b/, U).slice(0, 4).join(', ');
        o.dwgKtkModel = _all(/\b(KT[CKBR][0-9A-Z]{3,})\b/, U).slice(0, 3).join(', ');

        var alts = _all(/(ALT\s*[1-4]\s*:\s*[A-Z0-9 \/&.-]{2,40})/, U);
        var vars_ = _all(/(VAR\s*:\s*[A-Z0-9 \/&.-]{2,40})/, U);
        o.dwgAltLegend = alts.concat(vars_).join(' · ').replace(/\s+/g, ' ');

        // BOM — "품번 + 설명" 쌍이 반복된다. 개수와 눈에 띄는 것 몇 개만.
        var bom = _all(/\b((?:PCA\d{6,7}|NLS-[A-Z0-9-]{6,}|LSPP-[A-Z0-9-]{6,}|\d{7}-[A-Z0-9-]{2,}))\b/, U);
        if (bom.length) { o.dwgBomCount = String(bom.length); o.dwgBomTop = bom.slice(0, 6).join(', '); }

        var env = [];
        if (/ROHS/.test(U)) env.push('RoHS');
        if (/REACH/.test(U)) env.push('REACH');
        if (/CONFLICT\s+MINERALS/.test(U)) env.push('Conflict Minerals');
        o.dwgEnv = env.join(', ');

        var mk = [];
        if (/COUNTRY\s+OF\s+ORIGIN/.test(U)) mk.push(_t('원산지', 'Country of origin'));
        if (/DATE\s*CODE/.test(U)) mk.push(_t('제조일 코드', 'Date code'));
        if (/VENDOR\s*I\.?D\.?/.test(U)) mk.push(_t('벤더 ID', 'Vendor ID'));
        if (/REVISION\s+LETTER/.test(U)) mk.push(_t('리비전 문자', 'Revision letter'));
        o.dwgMarking = mk.join(', ');

        o.dwgTamper = /TAMPER/.test(U) ? 'O' : '';
        o.dwgPacking = /PACKAG/.test(U) ? _one(/((?:PARTS|PRODUCT)[A-Z ,]{0,30}PACK[A-Z ,]{0,60})/, U).slice(0, 120) || 'O' : '';
        o.dwgTorque = _one(/(TORQUE[^\n]{0,60})/, U).replace(/\s+/g, ' ').slice(0, 110);
        o.dwgSpecRefs = _all(/\b(20\d{4})\b/, t).slice(0, 6).join(', ');
        o.dwgBright = _one(/(\d{2,4}\s*(?:NITS|CD\/M))/, U);

        // 빈 값은 아예 빼서 "못 읽음"과 "빈칸"을 구분한다
        Object.keys(o).forEach(function (k) { if (!String(o[k] || '').trim()) delete o[k]; });
        return o;
    };

    // 🤖 문서 분석 — NAS 문서의 글자를 뽑아 AI에게 "이 행에 넣을 값"을 묻는다.
    //    결정론으로 못 푸는 일(사람이 쓴 문서에서 값 찾기)이라 AI를 쓰되, **사람 승인 후에만** 적용한다.
    window.PL_DOC_AI_FIELDS = window.PL_DOC_AI_FIELDS || ['agileRev', 'prodRev', 'pn', 'desc2', 'desc3', 'panel', 'panelMfr'];

    /** 도면 글자 받아오기 — 서버 캐시(_dsTextOf)가 있으면 그걸 쓰고, 없으면 원본을 받아 뽑는다 */
    window._plDocText = async function (folder, fileName) {
        var text = '';
        if (window._dsTextOf) { try { text = await window._dsTextOf(folder, fileName); } catch (e) { /* 아래에서 원본으로 */ } }
        if (!String(text || '').trim() && window._dsFileOf && window._pxExtractText) {
            var file = await window._dsFileOf(folder, fileName);
            text = await window._pxExtractText(file, null);
        }
        return text || '';
    };

    /** 📐 결정론 분석 — AI 한 번도 안 쓰고 도면에서 30개 항목을 읽어 미리보기로 보여준다(기본 경로). */
    window.plAnalyzeDoc = async function (id, fileName, folder) {
        var FD = folder || NAS_FOLDER;
        var r = _rowById(id); if (!r) return;
        _toast('📐 ' + _t('도면을 읽는 중…', 'Reading the drawing…'), 'info');
        var text = '';
        try { text = await window._plDocText(FD, fileName); }
        catch (e) { _toast('⚠️ ' + _t('도면에서 글자를 뽑지 못했습니다: ', 'Could not extract text: ') + (e && e.message ? e.message : e), 'error', 8000); return; }
        if (!String(text || '').trim()) { _toast('⚠️ ' + _t('도면에 읽을 글자가 없습니다(스캔 이미지일 수 있습니다).', 'No readable text (it may be a scanned image).'), 'error', 7000); return; }

        window.plShowDwgInfo(id, fileName, FD, window.plExtractDwg(text, r), text);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 📐 도면 정보 모달 — **표와 별개로**, 그 도면 한 장에서 뽑을 수 있는 정보를 전부 정리해 보여준다.
    //    (2026-10-29 사용자 요청: "바로 분석해서 테이블에 넣는 게 아니고, 정리된 모달을 먼저 보고
    //     그 정보를 기준으로 취사선택해서 테이블에 자동등록")
    //    · 읽힌 항목만이 아니라 **카탈로그 30개 전부**를 보여준다 — 뭘 못 읽었는지도 정보다.
    //    · 표에 등록할 수 있는 항목만 체크박스를 준다. 기본 체크는 "표가 비었고 도면엔 있는" 칸.
    //    · 표 값과 다르면 ⚠️ 로 나란히 보여주고, 그건 **기본 체크를 안 한다**(사람이 판단).
    // ══════════════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════════
    // 📜 Agile REV 셀을 누르면 뜨는 창 — **그 도면의 REVISIONS 표**를 그대로 보여 준다.
    //    (2026-10-30 사용자 정정: 이게 처음부터 원했던 것. 표에 값을 채우는 게 아니라 "보는" 것.)
    //    같이 있는 DISPLAY INFORMATION MATRIX 도 함께 보여 준다 — 그 리비전에서 어떤 패널/터치가
    //    쓰이는지가 바로 이 표에 있어서, REVISIONS 와 늘 같이 본다.
    // ══════════════════════════════════════════════════════════════════════════
    window.plOpenRevisions = async function (id, fileName) {
        var r = _rowById(id); if (!r) return;
        var docs = window._plDocsOf(r);
        if (!docs.length) {
            _toast('⚠️ ' + _t('이 행에 연결된 도면이 없습니다 — PN을 확인하거나 NAS 목록을 새로고침해주세요.',
                              'No drawing linked to this row — check the PN or refresh the NAS list.'), 'warning', 8000);
            return;
        }
        var pick = fileName || docs.slice().sort(function (a, b) { return String(b.rev).localeCompare(String(a.rev), 'en'); })[0].name;
        _popup('📜 ' + _esc(pick), '<div id="pl-rev-body" style="color:#888;">' + _t('도면을 읽는 중…', 'Reading the drawing…') + '</div>', true);
        var text = '';
        try { text = await window._plDocText(NAS_FOLDER, pick); }
        catch (e) {
            var b0 = document.getElementById('pl-rev-body');
            if (b0) b0.innerHTML = '<div style="color:#b1432f;">' + _esc(e && e.message ? e.message : e) + '</div>';
            return;
        }
        window._plRevCache = { id: id, file: pick, text: text };
        window._plRenderRevBody(id, pick, text, docs);
    };

    window._plRenderRevBody = function (id, pick, text, docs) {
        var r = _rowById(id) || {};
        var revs = window.plParseRevisions(text);
        var mat = window.plParseDisplayMatrix(text);

        // 표에 적힌 REV(생산REV·Agile REV)와 같은 줄을 찾아 표시한다 — "지금 우리가 쓰는 리비전"
        var mine = [];
        [r.prodRev, r.agileRev].forEach(function (v) {
            String(v || '').replace(/[A-Z](?:\.\d+)?/g, function (m) { mine.push(m.toUpperCase()); return m; });
        });
        var isMine = function (rv) {
            rv = String(rv || '').toUpperCase();
            if (!rv) return false;
            if (mine.indexOf(rv) !== -1) return true;
            var m = rv.match(/^([A-Z](?:\.\d+)?)\s*-\s*([A-Z](?:\.\d+)?)$/);   // 범위 칸(G.5-J.4)
            if (!m) return false;
            return mine.some(function (x) { return x >= m[1] && x <= m[2]; });
        };

        var pickSel = (docs && docs.length > 1)
            ? '<select onchange="window.plOpenRevisions(\'' + id + '\', this.value)" style="padding:3px 6px; border:1px solid #cfe3e5; border-radius:5px; font-size:11.5px;">'
              + docs.slice().sort(function (a, b) { return String(b.rev).localeCompare(String(a.rev), 'en'); }).map(function (d) {
                  return '<option value="' + _esc(d.name) + '"' + (d.name === pick ? ' selected' : '') + '>'
                       + (d.rev ? 'REV ' + _esc(d.rev) + ' · ' : '') + _esc(d.name) + '</option>';
              }).join('') + '</select>'
            : '';

        var revHtml = revs.length
            ? '<table style="width:100%; font-size:11.5px; border-collapse:collapse; table-layout:fixed;">'
              + '<tr style="background:#f1f3f5; position:sticky; top:0;">'
              + '<th style="text-align:left; padding:5px 6px; width:56px;">REV</th>'
              + '<th style="text-align:left; padding:5px 6px;">' + _t('변경 내용', 'Description') + '</th>'
              + '<th style="text-align:left; padding:5px 6px; width:96px;">' + _t('작성자', 'Drawn by') + '</th>'
              + '<th style="text-align:left; padding:5px 6px; width:84px;">' + _t('일자', 'Date') + '</th></tr>'
              + revs.map(function (x) {
                  var hit = isMine(x.rev);
                  return '<tr style="border-bottom:1px solid #f1f3f5;' + (hit ? ' background:#eefbf1;' : '') + '">'
                       + '<td style="padding:4px 6px; font-weight:bold; color:' + (hit ? '#2b7a45' : '#1971c2') + '; white-space:nowrap;">'
                       + _esc(x.rev) + (hit ? ' ◀' : '') + '</td>'
                       + '<td style="padding:4px 6px; color:#444;">' + _esc(x.desc) + '</td>'
                       + '<td style="padding:4px 6px; color:#666; overflow-wrap:anywhere;">' + _esc(x.by) + '</td>'
                       + '<td style="padding:4px 6px; color:#666; white-space:nowrap;">' + _esc(x.date) + '</td></tr>';
              }).join('') + '</table>'
            : '<div style="padding:12px; color:#888;">' + _t('이 도면에서 REVISIONS 표를 찾지 못했습니다.', 'No REVISIONS table found in this drawing.') + '</div>';

        var matHtml = (mat.rows && mat.rows.length)
            // ⚠️ `table-layout:fixed` 가 없으면 nowrap 글자가 **옆 칸을 덮는다**(알람 도표와 같은 함정).
            //    매트릭스는 칸 값이 길어서(부품번호·펌웨어) 실제로 겹쳐 읽을 수 없었다 — 2026-10-30.
            //    칸 폭은 머리글 수로 고르게 나누고, 넘치는 글자는 **줄을 바꾼다**(잘라내면 PN 을 못 읽는다).
            ? '<table style="width:100%; font-size:11px; border-collapse:collapse; table-layout:fixed;">'
              + '<tr style="background:#f1f3f5;">' + mat.headers.map(function (h) {
                  return '<th style="text-align:left; padding:4px 5px; overflow-wrap:anywhere; word-break:break-word;">' + _esc(h) + '</th>';
              }).join('') + '</tr>'
              + mat.rows.map(function (row) {
                  var hit = isMine(row[0]);
                  var ktk = /KORTEK/i.test(row.join(' '));
                  return '<tr style="border-bottom:1px solid #f1f3f5;' + (hit && ktk ? ' background:#eefbf1;' : (ktk ? ' background:#fcfdff;' : '')) + '">'
                       + row.map(function (c, ci) {
                           return '<td style="padding:3px 5px; overflow-wrap:anywhere; word-break:break-word;' + (ci === 0 ? ' font-weight:bold; color:#1971c2;' : ' color:#444;') + '">'
                                + _esc(c) + '</td>';
                       }).join('') + '</tr>';
              }).join('') + '</table>'
            : '';

        var html =
            '<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; font-size:11.5px; color:#555; flex-wrap:wrap;">'
          + '<b style="color:#2c5f8a;">' + _t('REVISIONS', 'REVISIONS') + '</b>'
          + '<span>' + revs.length + _t('건', ' rows') + '</span>'
          + (mine.length ? '<span style="color:#2b7a45;">◀ ' + _t('표의 REV: ', 'REV in table: ') + _esc(mine.join(', ')) + '</span>' : '')
          + '<span style="margin-left:auto;">' + pickSel + '</span>'
          + '</div>'
          + '<div style="max-height:40vh; overflow:auto; border:1px solid #e3e6ea; border-radius:6px;">' + revHtml + '</div>'
          + (matHtml
              ? '<div style="margin:12px 0 6px; font-size:11.5px;"><b style="color:#2c5f8a;">DISPLAY INFORMATION MATRIX</b>'
                + ' <span style="color:#888;">' + mat.rows.length + _t('건 · KORTEK 행은 연한 배경', ' rows · KORTEK rows tinted') + '</span></div>'
                + '<div style="max-height:30vh; overflow:auto; border:1px solid #e3e6ea; border-radius:6px;">' + matHtml + '</div>'
              : '')
          + '<div style="margin-top:11px; display:flex; gap:6px; align-items:center;">'
          + (revs.length
              ? '<button onclick="window.plUseLatestRev()" style="padding:6px 12px; background:#d4f3dd; color:#2b7a45; border:1px solid #9bd8ae; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">✅ '
                + _t('최신 REV(', 'Use latest REV (') + _esc(revs[revs.length - 1].rev) + _t(')를 이 행에 넣기', ') for this row') + '</button>'
              : '')
          + '<button onclick="window._dsOpenInNewTab(\'' + NAS_FOLDER + '\',\'' + _esc(pick) + '\')" style="padding:6px 12px; background:#e0f5f7; color:#00707d; border:none; border-radius:6px; font-size:12px; cursor:pointer;">📄 ' + _t('도면 열기', 'Open drawing') + '</button>'
          + '<button onclick="window.plOpenDocBox(\'' + id + '\')" style="padding:6px 12px; background:#eef2f5; color:#495057; border:none; border-radius:6px; font-size:12px; cursor:pointer;">📁 ' + _t('문서함', 'Documents') + '</button>'
          + '<span style="margin-left:auto;"><button onclick="window.plClosePopup()" style="padding:6px 12px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6; border-radius:6px; font-size:12px; cursor:pointer;">' + _t('닫기', 'Close') + '</button></span>'
          + '</div>';
        var b = document.getElementById('pl-rev-body');
        if (b) { b.style.color = ''; b.innerHTML = html; }
    };

    /** 도면의 최신 REV 를 이 행의 Agile REV 칸에 넣는다(사람이 눌렀을 때만) */
    window.plUseLatestRev = function () {
        var c = window._plRevCache; if (!c) return;
        var r = _rowById(c.id); if (!r) return;
        var revs = window.plParseRevisions(c.text);
        if (!revs.length) return;
        var last = revs[revs.length - 1];
        var before = r.agileRev == null ? '' : String(r.agileRev);
        var after = last.rev + (last.date ? ' (' + last.date + ')' : '');
        if (before === after) { _toast(_t('이미 같은 값입니다.', 'Already the same.'), 'info'); return; }
        r.agileRev = after;
        _plPushHistory(r, 'agileRev', before, after);
        _persist(); window.plClosePopup(); window.plRender();
        _toast('✅ Agile REV → ' + after, 'success', 5000);
    };

    window.plShowDwgInfo = function (id, fileName, folder, det, rawText) {
        var r = _rowById(id); if (!r) return;
        window._plDwgInfo = { id: id, file: fileName, folder: folder, det: det, text: rawText || '' };

        var items = window.PL_DOC_ITEMS || [];
        var gotN = items.filter(function (it) { return det[it.k]; }).length;

        var rowsHtml = items.map(function (it, i) {
            var v = det[it.k] == null ? '' : String(det[it.k]);
            var cur = String(r[it.k] == null ? '' : r[it.k]).trim();         // 도면 전용 칸의 현재 값
            var cmpCol = it.cmp ? _colByKey[it.cmp] : null;
            var cmpVal = cmpCol ? String(r[it.cmp] == null ? '' : r[it.cmp]).trim() : '';
            var clash = v && cmpVal
                && v.toUpperCase().indexOf(cmpVal.toUpperCase()) === -1
                && cmpVal.toUpperCase().indexOf(v.toUpperCase()) === -1;
            var same = v && cur && v === cur;
            var canPick = !!v && !same;
            var checked = canPick && !clash;                                  // 충돌하면 사람이 직접 고르게
            return '<tr style="border-bottom:1px solid #f1f3f5;' + (clash ? ' background:#fff7e6;' : (v ? '' : ' color:#bbb;')) + '">'
                 + '<td style="padding:4px 6px; text-align:center;">'
                 + (canPick ? '<input type="checkbox" class="pl-dwg-ck" data-k="' + it.k + '"' + (checked ? ' checked' : '') + '>' : (same ? '✔' : ''))
                 + '</td>'
                 + '<td style="padding:4px 6px; color:#555; white-space:nowrap;">' + _esc(window._currentLang === 'en' ? it.en : it.ko) + '</td>'
                 + '<td style="padding:4px 6px; font-weight:' + (v ? 'bold' : 'normal') + '; color:' + (v ? '#1971c2' : '#bbb') + '; word-break:break-all;">'
                 + _esc(v || _t('(도면에 없음)', '(not in drawing)')) + '</td>'
                 + '<td style="padding:4px 6px; color:#888; font-size:10.5px; word-break:break-all;">'
                 + (cmpCol ? _esc(window._currentLang === 'en' ? cmpCol.en : cmpCol.ko) + ': ' + _esc(cmpVal || '-') : '')
                 + (clash ? ' <b style="color:#b1432f;">⚠️ ' + _t('다름', 'differs') + '</b>' : '')
                 + '</td></tr>';
        }).join('');

        _popup('📐 ' + _esc(fileName) + ' — ' + _t('도면에서 읽은 정보', 'information read from this drawing'),
            '<div style="display:flex; gap:10px; align-items:center; margin-bottom:9px; font-size:11.5px; color:#555;">'
          + '<span>' + _t('읽은 항목 ', 'Read ') + '<b style="color:#1971c2;">' + gotN + '</b> / ' + items.length + '</span>'
          + '<span style="color:#9aa5a9;">·</span><span>' + _t('AI 안 씀(규칙으로 읽음)', 'no AI — rule-based') + '</span>'
          + '<span style="margin-left:auto;">'
          + '<a href="#" onclick="window.plDwgCheckAll(true); return false;" style="color:#1971c2; text-decoration:none;">' + _t('모두 선택', 'select all') + '</a> · '
          + '<a href="#" onclick="window.plDwgCheckAll(false); return false;" style="color:#868e96; text-decoration:none;">' + _t('모두 해제', 'none') + '</a>'
          + '</span></div>'
          + '<div style="max-height:46vh; overflow:auto; border:1px solid #e3e6ea; border-radius:6px;">'
          + '<table style="width:100%; font-size:11.5px; border-collapse:collapse;">'
          + '<tr style="background:#f1f3f5; position:sticky; top:0;"><th style="width:30px;"></th>'
          + '<th style="text-align:left; padding:5px 6px;">' + _t('항목', 'Item') + '</th>'
          + '<th style="text-align:left; padding:5px 6px;">' + _t('도면에서 읽은 값', 'Value from drawing') + '</th>'
          + '<th style="text-align:left; padding:5px 6px;">' + _t('표의 값', 'Table value') + '</th></tr>'
          + rowsHtml + '</table></div>'
          + '<div style="margin-top:11px; display:flex; gap:6px; align-items:center;">'
          + window._plAiMoreBtn(id, fileName, folder)
          + '<button onclick="window.plClosePopup()" style="padding:6px 12px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6; border-radius:6px; font-size:12px; cursor:pointer;">' + _t('닫기', 'Close') + '</button>'
          + '<button onclick="window.plRegisterDwg()" style="padding:6px 14px; background:#d4f3dd; color:#2b7a45; border:1px solid #9bd8ae; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">✅ '
          + _t('선택 항목 표에 등록', 'Register selected into the table') + '</button>'
          + '</div>'
          + '<div style="margin-top:8px; color:#888; font-size:11px; line-height:1.5;">'
          + _esc(_t('· 체크한 항목만 이 행에 들어갑니다 — 모달을 닫으면 표는 그대로입니다.',
                    '· Only checked items are written to this row — closing changes nothing.'))
          + '<br>' + _esc(_t('· 표의 값과 다른 항목(⚠️)은 기본으로 해제해 뒀습니다.',
                             '· Items that differ from the table (⚠️) are unchecked by default.')) + '</div>', true);
    };

    window.plDwgCheckAll = function (on) {
        Array.prototype.forEach.call(document.querySelectorAll('.pl-dwg-ck'), function (c) { c.checked = !!on; });
    };

    /** 체크한 항목만 이 행에 등록 */
    window.plRegisterDwg = function () {
        var p = window._plDwgInfo; if (!p) return;
        var r = _rowById(p.id); if (!r) { window.plClosePopup(); return; }
        var n = 0;
        Array.prototype.forEach.call(document.querySelectorAll('.pl-dwg-ck'), function (c) {
            if (!c.checked) return;
            var k = c.getAttribute('data-k');
            var v = p.det[k];
            if (v == null || !_colByKey[k]) return;
            var before = r[k] == null ? '' : String(r[k]);
            if (before === String(v)) return;
            r[k] = String(v);
            _plPushHistory(r, k, before, r[k]);
            n++;
        });
        if (!n) { _toast(_t('선택된 항목이 없습니다.', 'Nothing selected.'), 'warning'); return; }
        _view.groups.dwg = true; _saveView();          // 등록한 값이 바로 보이게 그룹을 켠다
        _persist(); window.plClosePopup(); window.plRender();
        _toast('✅ ' + n + _t('개 항목을 표에 등록했습니다(도면: ', ' item(s) registered (drawing: ') + p.file + ').', 'success', 6000);
    };

    /** 미리보기 — 결정론/AI 결과를 같은 모양으로 보여준다. 엑셀 값과 다르면 "표≠도면" 으로 표시. */
    window._plShowDocPreview = function (id, fileName, obj, picks, note, folder) {
        var r = _rowById(id); if (!r) return;
        window._plAiPending = { id: id, obj: obj, picks: picks, file: fileName };
        var rowsHtml = picks.map(function (k, i) {
            var c = _colByKey[k] || { ko: k, en: k };
            var it = (window.PL_DOC_ITEMS || []).filter(function (x) { return x.k === k; })[0];
            var cmpCol = it && it.cmp ? _colByKey[it.cmp] : null;
            var cmpVal = cmpCol ? String(r[it.cmp] == null ? '' : r[it.cmp]).trim() : '';
            var clash = cmpVal && String(obj[k]).trim().toUpperCase().indexOf(cmpVal.toUpperCase()) === -1
                                && cmpVal.toUpperCase().indexOf(String(obj[k]).trim().toUpperCase()) === -1;
            return '<tr' + (clash ? ' style="background:#fff7e6;"' : '') + '>'
                 + '<td style="padding:4px 6px;"><input type="checkbox" checked data-i="' + i + '" class="pl-ai-ck"></td>'
                 + '<td style="padding:4px 6px; color:#666;">' + _esc(window._currentLang === 'en' ? c.en : c.ko) + '</td>'
                 + '<td style="padding:4px 6px; color:#b1432f;">' + _esc(String(r[k] || '(빈칸)').slice(0, 60)) + '</td>'
                 + '<td style="padding:4px 6px; color:#1971c2; font-weight:bold;">' + _esc(String(obj[k]).slice(0, 80)) + '</td>'
                 + '<td style="padding:4px 6px; font-size:10.5px; color:#9a6b00;">'
                 + (clash ? '⚠️ ' + _esc(window._currentLang === 'en' ? cmpCol.en : cmpCol.ko) + ': ' + _esc(cmpVal.slice(0, 30)) : '') + '</td></tr>';
        }).join('');
        _popup('📐 ' + _esc(fileName) + ' — ' + _t('적용할 값을 확인해주세요', 'confirm what to apply'),
            '<div style="margin-bottom:8px; color:#2b7a45; font-size:11.5px;">' + _esc(note) + '</div>'
          + '<table style="width:100%; font-size:11.5px; border-collapse:collapse;">'
          + '<tr style="background:#f1f3f5;"><th style="width:26px;"></th><th style="text-align:left;">' + _t('항목', 'Field') + '</th>'
          + '<th style="text-align:left;">' + _t('현재', 'Current') + '</th><th style="text-align:left;">' + _t('도면에서 읽은 값', 'From drawing') + '</th>'
          + '<th style="text-align:left;">' + _t('표와 비교', 'vs table') + '</th></tr>' + rowsHtml + '</table>'
          + '<div style="margin-top:11px; display:flex; gap:6px; justify-content:flex-end; align-items:center;">'
          + window._plAiMoreBtn(id, fileName, folder)
          + '<button onclick="window.plClosePopup()" style="padding:6px 12px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6; border-radius:6px; font-size:12px; cursor:pointer;">' + _t('취소', 'Cancel') + '</button>'
          + '<button onclick="window.plApplyAi()" style="padding:6px 14px; background:#d4f3dd; color:#2b7a45; border:1px solid #9bd8ae; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">✅ ' + _t('선택 항목 적용', 'Apply selected') + '</button>'
          + '</div>', true);
    };
    window._plAiMoreBtn = function (id, fileName, folder) {
        return '<button onclick="window.plAnalyzeDocAi(\'' + id + '\',\'' + _esc(fileName) + '\',\'' + _esc(folder || NAS_FOLDER) + '\')"'
             + ' title="' + _esc(_t('정규식이 못 읽은 칸을 AI에게 맡깁니다(무료 키 하루 한도를 씁니다)', 'Ask AI for what the rules could not read (uses your daily AI quota)')) + '"'
             + ' style="margin-right:auto; padding:6px 12px; background:#efe6fb; color:#6741d9; border:1px solid #d6c8f0; border-radius:6px; font-size:12px; cursor:pointer;">🤖 '
             + _t('AI로 더 읽기', 'Ask AI for more') + '</button>';
    };

    // 🤖 AI 분석 — 결정론이 못 읽은 칸만 맡긴다(아래 프롬프트는 카탈로그에서 만든다).
    window.plAnalyzeDocAi = async function (id, fileName, folder) {
        var FD = folder || NAS_FOLDER;
        var r = _rowById(id); if (!r) return;
        var key = window.getActiveAiKey && window.getActiveAiKey();
        if (!key) { _toast('🔑 ' + _t('AI 키가 없습니다 — [AI 도구 > AI 분석 설정]에서 먼저 등록해주세요.', 'No AI key — register one under [AI Tools > AI Analysis Settings].'), 'error', 7000); return; }
        window.plClosePopup();
        _toast('🤖 ' + _t('문서를 읽는 중…', 'Reading the document…'), 'info');
        var text = '';
        try { text = await window._plDocText(FD, fileName); }
        catch (e) { _toast('⚠️ ' + (e && e.message ? e.message : e), 'error', 8000); return; }
        if (!String(text || '').trim()) { _toast('⚠️ ' + _t('문서에 읽을 글자가 없습니다.', 'No readable text.'), 'error'); return; }
        if (text.length > 60000) text = text.slice(0, 60000);

        // 채울 칸 = 엑셀 열 일부 + 도면 분석 카탈로그 전체. 결정론이 이미 읽은 칸은 빼서
        // AI 가 '모르는 것'에만 집중하게 한다(한도 절약 + 환각 줄이기).
        var _already = {};
        try { Object.keys(window.plExtractDwg(text, r)).forEach(function (k) { _already[k] = 1; }); } catch (e) { /* 추출 실패해도 AI 는 돌린다 */ }
        var _askKeys = ['agileRev', 'prodRev', 'pn', 'desc2', 'desc3', 'panel', 'panelMfr']
            .concat((window.PL_DOC_ITEMS || []).map(function (it) { return it.k; }))
            .filter(function (k, i, arr) { return arr.indexOf(k) === i && !_already[k]; });
        var fields = _askKeys.map(function (k) {
            var c = _colByKey[k]; return c ? (k + ' = ' + c.ko) : k;
        }).join(', ');
        var cur = _askKeys.map(function (k) { return k + ': ' + (r[k] || '(빈칸)'); }).join(String.fromCharCode(10));
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
        window._plShowDocPreview(id, fileName, obj, picks,
            (summary ? '🤖 ' + summary : _t('🤖 AI가 읽음', '🤖 Read by AI')), folder);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 📐📐 저장된 도면 **전체** 분석 — AI 를 한 번도 안 쓰고 결정론으로만 돌린다.
    //    NAS 도면 67개를 직접 읽어 만든 규칙이라 30개 항목이 그대로 채워진다(실측 커버리지는
    //    docs/project-list.md 표 참고). 한 행에 도면이 여러 벌이면 **리비전이 가장 최근인 것**
    //    하나만 본다(옛 리비전이 최신 값을 덮어쓰지 않게).
    // ══════════════════════════════════════════════════════════════════════════
    window.plAnalyzeAll = async function () {
        var rows = (D().rows || []).filter(function (r) { return window._plDocCount(r) > 0; });
        if (!rows.length) {
            _toast('⚠️ ' + _t('도면이 연결된 행이 없습니다 — NAS 목록을 먼저 새로고침하거나 PN을 채워주세요.',
                              'No row has a linked drawing — refresh the NAS list or fill in PNs first.'), 'warning', 8000);
            return;
        }
        _toast('📐 ' + rows.length + _t('개 행의 도면을 읽는 중… (AI 안 씀)', ' rows: reading drawings… (no AI)'), 'info', 4000);

        // ⚠️ 여기서 표를 고치지 않는다 — 읽기만 하고 **목록으로 보여준 뒤** 고른 행만 등록한다
        //    (사용자 요청: "바로 분석해서 테이블에 넣는 게 아니고, 정리된 걸 보고 취사선택").
        var results = [], miss = 0, i = 0;
        for (i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (i % 5 === 0) _toast('📐 ' + (i + 1) + '/' + rows.length + _t(' 도면 읽는 중…', ' reading drawings…'), 'info', 1200);
            var docs = window._plDocsOf(r).slice().sort(function (a, b) { return String(b.rev).localeCompare(String(a.rev), 'en'); });
            var text = '';
            try { text = await window._plDocText(NAS_FOLDER, docs[0].name); }
            catch (e) { miss++; continue; }
            if (!String(text || '').trim()) { miss++; continue; }
            var det = window.plExtractDwg(text, r);
            var newKeys = Object.keys(det).filter(function (k) {
                return _colByKey[k] && String(det[k]) !== String(r[k] == null ? '' : r[k]);
            });
            if (newKeys.length) results.push({ id: r._id, file: docs[0].name, det: det, keys: newKeys, row: r });
        }
        if (!results.length) {
            _popup('📐 ' + _t('도면 읽기 결과', 'Drawing scan'),
                '<div style="color:#888;">' + _t('표에 새로 넣을 값을 찾지 못했습니다.', 'Nothing new found.') + '</div>');
            return;
        }
        window._plBatch = results;
        var listHtml = results.map(function (x, n) {
            return '<tr style="border-bottom:1px solid #f1f3f5;">'
                 + '<td style="padding:4px 6px; text-align:center;"><input type="checkbox" class="pl-batch-ck" data-i="' + n + '" checked></td>'
                 + '<td style="padding:4px 6px; white-space:nowrap;">' + _esc(x.row.ktkPn || x.row.no || '-') + '</td>'
                 + '<td style="padding:4px 6px; color:#666;">' + _esc(String(x.row.desc || '').slice(0, 26)) + '</td>'
                 + '<td style="padding:4px 6px; color:#888; word-break:break-all;">' + _esc(x.file) + '</td>'
                 + '<td style="padding:4px 6px; text-align:right;"><b style="color:#1971c2;">' + x.keys.length + '</b></td>'
                 + '<td style="padding:4px 6px;"><button onclick="window.plBatchOpen(' + n + ')" style="padding:2px 8px; background:#eef2f5; color:#495057; border:none; border-radius:5px; font-size:11px; cursor:pointer;">'
                 + _t('보기', 'View') + '</button></td></tr>';
        }).join('');
        _popup('📐 ' + _t('도면에서 읽은 정보 — 등록할 행을 골라주세요', 'Read from drawings — choose rows to register'),
            '<div style="margin-bottom:9px; font-size:11.5px; color:#555;">'
          + _t('대상 ', 'Scanned ') + rows.length + _t('행 중 ', ' rows; ') + results.length + _t('행에서 새 값을 찾았습니다.', ' have new values.')
          + (miss ? ' <span style="color:#b1432f;">' + _t('글자를 못 읽은 도면 ', 'unreadable: ') + miss + '</span>' : '')
          + '</div>'
          + '<div style="max-height:46vh; overflow:auto; border:1px solid #e3e6ea; border-radius:6px;">'
          + '<table style="width:100%; font-size:11.5px; border-collapse:collapse;">'
          + '<tr style="background:#f1f3f5; position:sticky; top:0;"><th style="width:30px;"></th>'
          + '<th style="text-align:left; padding:5px 6px;">KTK PN</th>'
          + '<th style="text-align:left; padding:5px 6px;">' + _t('설명', 'Description') + '</th>'
          + '<th style="text-align:left; padding:5px 6px;">' + _t('도면', 'Drawing') + '</th>'
          + '<th style="text-align:right; padding:5px 6px;">' + _t('새 값', 'New') + '</th><th></th></tr>'
          + listHtml + '</table></div>'
          + '<div style="margin-top:11px; display:flex; gap:6px; justify-content:flex-end;">'
          + '<button onclick="window.plClosePopup()" style="padding:6px 12px; background:#f1f3f5; color:#495057; border:1px solid #dee2e6; border-radius:6px; font-size:12px; cursor:pointer;">' + _t('닫기', 'Close') + '</button>'
          + '<button onclick="window.plBatchRegister()" style="padding:6px 14px; background:#d4f3dd; color:#2b7a45; border:1px solid #9bd8ae; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">✅ '
          + _t('선택한 행 등록', 'Register selected rows') + '</button></div>'
          + '<div style="margin-top:8px; color:#888; font-size:11px;">'
          + _esc(_t('· [보기]를 누르면 그 도면에서 읽은 항목을 하나씩 골라 등록할 수 있습니다.',
                    '· [View] lets you pick items one by one for that drawing.')) + '</div>', true);
    };

    /** 목록에서 [보기] — 그 행의 도면 정보 모달을 열어 항목별로 골라 등록한다 */
    window.plBatchOpen = function (i) {
        var x = (window._plBatch || [])[i]; if (!x) return;
        window.plShowDwgInfo(x.id, x.file, NAS_FOLDER, x.det, '');
    };

    /** 체크한 행만 — 그 행에서 새로 읽힌 값을 등록한다(사람이 적어 둔 엑셀 칸은 안 덮는다) */
    window.plBatchRegister = function () {
        var list = window._plBatch || [];
        var n = 0, rowsN = 0;
        Array.prototype.forEach.call(document.querySelectorAll('.pl-batch-ck'), function (c) {
            if (!c.checked) return;
            var x = list[parseInt(c.getAttribute('data-i'), 10)]; if (!x) return;
            var r = _rowById(x.id); if (!r) return;
            var k2 = 0;
            x.keys.forEach(function (k) {
                var before = r[k] == null ? '' : String(r[k]);
                if (before.trim() && String(k).indexOf('dwg') !== 0) return;   // 엑셀 칸은 빈칸만
                r[k] = String(x.det[k]);
                _plPushHistory(r, k, before, r[k]);
                k2++;
            });
            if (k2) { n += k2; rowsN++; }
        });
        if (!n) { _toast(_t('등록할 값이 없습니다.', 'Nothing to register.'), 'warning'); return; }
        _view.groups.dwg = true; _saveView();
        _persist(); window.plClosePopup(); window.plRender();
        _toast('✅ ' + rowsN + _t('개 행에 ', ' row(s), ') + n + _t('개 항목을 등록했습니다.', ' item(s) registered.'), 'success', 6000);
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

    // ══════════════════════════════════════════════════════════════════════════
    // 📁 NAS — 다른 페이지(js/42 `_dsImportToPage`)와 **같은 창, 같은 조작**을 쓴다.
    //    목록/열기/올리기/삭제/새 폴더/드래그앤드롭/연결 프로그램 열기가 전부 공용 창에 들어 있어서,
    //    이 페이지만 따로 만들면 생김새도 동작도 어긋난다(사용자 요청 "다른 페이지처럼 상속").
    //    여기서 더하는 것은 **고른 파일을 무엇으로 볼지** 하나뿐:
    //      · .json  → 이 표 자체(팀 목록) 불러오기
    //      · 엑셀/CSV → 제품 목록 엑셀로 불러오기(교체/합치기)
    //      · 그 외(PDF·도면 등) → 파일명 앞 숫자로 **그 제품 행을 찾아** AI 분석에 건다
    // ══════════════════════════════════════════════════════════════════════════
    window.plOpenNas = function () {
        if (!window._dsOpenPicker) {
            _toast('⚠️ ' + _t('문서 저장소를 불러오지 못했습니다(백엔드 확인).', 'Document store unavailable (check the backend).'), 'error');
            return;
        }
        window._dsOpenPicker({
            folder: NAS_DATA_FOLDER,
            folders: [
                { f: NAS_DATA_FOLDER, label: '📒 ' + _t('목록·백업', 'List & backups') },
                { f: NAS_FOLDER,      label: '📐 ' + _t('고객 도면', 'Customer drawings') }
            ],
            title: 'NAS DATA',
            onPick: function (f, name) { window.plNasPick(f, name); }
        });
    };

    window.plNasPick = async function (folder, name) {
        var low = String(name || '').toLowerCase();
        try {
            // ① 팀 목록 JSON — 이 표를 통째로 되돌리거나 다른 팀 파일을 들여다볼 때
            if (/\.json$/.test(low)) {
                var jf = await window._dsFileOf(folder, name);
                var o = JSON.parse(await jf.text());
                if (!o || !Array.isArray(o.rows)) { _toast('⚠️ ' + _t('제품 목록 JSON이 아닙니다.', 'Not a project-list JSON.'), 'error'); return; }
                if (!confirm(_t('"' + name + '" 의 ' + o.rows.length + '건으로 지금 표(' + (D().rows || []).length + '건)를 교체할까요?',
                                'Replace the current table (' + (D().rows || []).length + ' rows) with ' + o.rows.length + ' rows from "' + name + '"?'))) return;
                window._plData = { rows: o.rows, history: Array.isArray(o.history) ? o.history : (D().history || []) };
                _plPushHistory({ ktkPn: '-', desc: name }, 'no', '', _t('NAS JSON 불러오기 ', 'loaded from NAS JSON ') + o.rows.length + _t('건', ' rows'));
                _persist(); window.plRender();
                _toast('✅ ' + name + ' — ' + o.rows.length + _t('건을 불러왔습니다.', ' rows loaded.'), 'success', 6000);
                return;
            }
            // ② 제품 목록 엑셀 — 지금까지의 [엑셀 불러오기]와 똑같은 흐름(교체/합치기)
            if (/\.(xlsx|xlsm|xls|csv)$/.test(low)) {
                _toast('⏳ ' + _t('"' + name + '" 받는 중…', 'Fetching "' + name + '"…'), 'info');
                var xf = await window._dsFileOf(folder, name);
                window._plApplyWorkbook(await xf.arrayBuffer(), name);
                return;
            }
            // ③ 그 밖의 파일(도면 PDF 등) — 공용 창과 같은 질문을 먼저 한다(AI 한도 때문에).
            var choice = window._dsAskAiOrNative ? await window._dsAskAiOrNative(name) : 'native';
            if (choice === 'cancel') return;
            if (choice !== 'ai') { await window._dsOpenNative(folder, name); return; }
            // AI 분석은 **행에 걸어야** 의미가 있다 — 파일명 앞 숫자로 그 제품을 찾는다.
            var p = window._plParseDocName(name);
            var row = null;
            if (p) {
                row = (D().rows || []).filter(function (r) { return window._plRowDocNums(r).indexOf(p.num) !== -1; })[0] || null;
            }
            if (!row) {
                _toast('⚠️ ' + _t('이 파일의 앞 숫자(' + ((p && p.num) || '?') + ')와 맞는 제품 행이 없습니다 — 먼저 그 행의 PN을 채워주세요.',
                                  'No product row matches this file\'s leading number (' + ((p && p.num) || '?') + ') — fill that row\'s PN first.'), 'warning', 9000);
                return;
            }
            if (folder !== NAS_FOLDER) {
                _toast('ℹ️ ' + _t('고객 도면 폴더의 파일이 아니라 분석만 합니다.', 'Analyzing only — this file is outside the drawings folder.'), 'info');
            }
            await window.plAnalyzeDoc(row._id, name, folder);
        } catch (e) {
            _toast('❌ ' + (e && e.message ? e.message : e), 'error', 8000);
        }
    };

    /** NAS 엑셀 한 장을 불러오기 — 표가 비어 있을 때의 자동 구제도 사람이 고를 때와 같은 길을 쓴다.
     *  표가 비어 있으면 _plApplyWorkbook 은 물어보지 않는다(cur===0 이면 강제 교체) — 부트 중 확인창이 뜨지 않게. */
    window.plImportNasExcel = async function (name) {
        var f = await window._dsFileOf(NAS_DATA_FOLDER, name);
        window._plApplyWorkbook(await f.arrayBuffer(), name);
    };

    /** 지금 표를 NAS 에 엑셀로 보관 — 스냅샷(월말 백업 등). 토스트 메뉴 없이 함수로만 쓴다. */
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
    // 📥 목록 자동 불러오기 — 한 군데에서만.
    //    사용자 지적(2026-10-30): "구글 드라이브 접속하고 프로젝트 파일 열면 NAS 최신 파일을 띄워달라".
    //    전엔 **Project list 탭을 눌렀을 때 딱 한 번**만 불렀고, 그런데 그게 다른 사정으로
    //    실패하면(백엔드가 아직 안 떠 있었다면) 다시 안 불러서 로컬 캐시(1행)만 보여 줌다.
    //    → ① 떠고 3초 뒤 ② 프로젝트 파일을 여는 새 길바닥(populateTabData) ③ 탭 진입, 세 길 모두에서 부른다.
    //    NAS 는 **구글 로그인이 필요 없다** — 그래서 연동 전에도 목록이 뜨는 게 맞다.
    //    ⚠️ 어느 것을 샴 것인가는 **savedAt 이 가장 늦은 쪽** — "NAS 가 비에있지 않으면 NAS"로
    //       놓으면 드라이부에 더 새 본이 있어도 역전된다.
    var _PL_RELOAD_MS = 2 * 60 * 1000;
    window._plLoadedAt = window._plLoadedAt || 0;

    window.plEnsureLoaded = function (force) {
        if (window._plLoadInflight) return window._plLoadInflight;
        if (!force && window._plLoadedAt && Date.now() - window._plLoadedAt < _PL_RELOAD_MS) return Promise.resolve(false);
        window._plLoadInflight = (async function () {
            var changed = false;
            try {
                var nas = await window.plLoadFromNas();
                var drv = await window.ProjectList.loadFromDrive();     // 토튰 없으면 조용히 null
                var best = null, bestAt = '';
                [[nas, 'NAS'], [drv, 'Drive']].forEach(function (pair) {
                    var d = pair[0];
                    if (!d || !(d.rows || []).length) return;
                    var at = String(d.savedAt || '');
                    if (!best || at > bestAt) { best = d; bestAt = at; best._src = pair[1]; }
                });
                if (best) {
                    window._plData = { rows: best.rows, history: best.history || [] };
                    if (best._src === 'NAS') window._plNasSavedAtMine = window._plNasSavedAt;
                    window.ProjectList.save(window._plData, true);      // 로컬 캐시만(방금 읽은 걸 되쓰지 않게)
                    if (window._plSetSavedMark) window._plSetSavedMark(bestAt, best._src);
                    changed = true;
                } else if (!(D().rows || []).length) {
                    // 어디에도 목록이 없다 — NAS 에 엘셀은 있는가(사람이 올려만 남긴 경우)
                    var xl = await window._plNewestNasExcel();
                    if (xl) {
                        _toast('📥 ' + _t('NAS에서 가장 최신 엘셀을 읽고 있습니다: ', 'Importing the newest Excel from NAS: ') + xl, 'info', 6000);
                        try { await window.plImportNasExcel(xl); changed = true; }
                        catch (e) { console.warn('[Project list] NAS 엘셀 자동 불러오기 실패:', e && e.message); }
                    } else {
                        _toast('📥 ' + _t('아직 자료가 없습니다 — [엘셀 불러오기]로 제품 목록을 넣어주세요.',
                                          'No data yet — use [Import Excel] to load the product list.'), 'info', 7000);
                    }
                }
                window._plLoadedAt = Date.now();
                await window.plRefreshDocCache(true);                   // 📄 배지용 NAS 파일 목록
                window.plRender();
            } finally {
                window._plLoadInflight = null;
            }
            return changed;
        })();
        return window._plLoadInflight;
    };

    /** NAS 폴더의 가장 최신 엘셀 한 장 — 사람이 JSON 없이 엘셀만 올렸을 때의 구제 */
    window._plNewestNasExcel = async function () {
        if (!window._dsList) return '';
        try {
            var j = await window._dsList(NAS_DATA_FOLDER);
            var files = ((j && (j.files || j.items || j.list)) || []).map(function (f) { return (f && f.name) ? f : { name: String(f) }; });
            var xl = files.filter(function (f) { return /\.xlsx?$/i.test(f.name); });
            if (!xl.length) return '';
            xl.sort(function (a, b) { return String(b.mtime || '').localeCompare(String(a.mtime || '')); });
            return xl[0].name;
        } catch (e) { return ''; }
    };

    window.plOnTabShown = function () {
        window.plRender();
        window.plEnsureLoaded(false);
    };

    // ① 떠고 3초 — 구글 연동을 기다리지 않는다(NAS 는 로그인 부요).
    setTimeout(function () { window.plEnsureLoaded(false); }, 3000);
    // ② 프로젝트 파일을 여는 모든 길(드라이다 불러오기·새 시트·백업 복원)은 populateTabData 를 거친다.
    //    시트 전환마다 네트워크를 타면 안 되니 _PL_RELOAD_MS 사이 간경은 그상 지나간다.
    (function () {
        var orig = window.populateTabData;
        if (typeof orig !== 'function') return;
        window.populateTabData = function () {
            var r = orig.apply(this, arguments);
            try { window.plEnsureLoaded(false); } catch (e) { /* 목록 불러오기 실패가 시트 렌더를 맑지 않게 */ }
            return r;
        };
    })();

    // ──────────────────────────────────────────────────────────────────────────
    // 13. AI 문답 도구 — "LNW 제품 몇 개야?", "ABC430XYZ-P10 쓰는 모델 알려줘" 처럼
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
                + '"LNW 제품 몇 개야?", "EU 고객 모델 보여줘", "ABC430XYZ-P10 쓰는 모델 알려줘", '
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

    // 🖐 표 위로 파일을 끌어다 놓으면 **그 행의** 자료로 올라간다 — 문서함을 열지 않아도 되게.
    //    행 위에 있는 동안 그 행을 초록 테두리로 표시해, 어디에 떨어지는지 눈으로 보이게 한다.
    var _dropRowId = null;
    var _markDropRow = function (tr) {
        if (window._plDropMarked && window._plDropMarked !== tr) window._plDropMarked.style.outline = '';
        window._plDropMarked = tr || null;
        if (tr) tr.style.outline = '2px solid #2b7a45';
    };
    window._plBindTableDnd = function () {
        var wrap = document.getElementById('pl-table-wrap');
        if (!wrap || wrap._plDnd) return;
        wrap._plDnd = true;
        wrap.addEventListener('dragover', function (e) {
            if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') === -1) return;
            e.preventDefault();
            var tr = e.target && e.target.closest ? e.target.closest('tr[data-id]') : null;
            _dropRowId = tr ? tr.getAttribute('data-id') : null;
            _markDropRow(tr);
        });
        wrap.addEventListener('dragleave', function (e) { if (e.target === wrap) _markDropRow(null); });
        wrap.addEventListener('drop', function (e) {
            var files = e.dataTransfer && e.dataTransfer.files ? Array.prototype.slice.call(e.dataTransfer.files) : [];
            if (!files.length) return;
            e.preventDefault();
            // ⚠️ 전파를 반드시 끊는다 — js/04f 가 **window 에** 드롭 핸들러를 걸어 두고 "페이지 어디에
            //    떨어뜨려도 간트 엑셀로 불러오기"를 한다. 안 끊으면 여기서 받은 도면 PDF 가 그대로
            //    그쪽으로 흘러가 엑셀 파서를 타고(또는 덮어쓰기 비밀번호를 물으며) 실패한다.
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            _markDropRow(null);
            // 떨어뜨린 지점에서 직접 행을 찾는다 — dragover 때 기억해 둔 값(_dropRowId)은 보조다.
            //    (dragover 가 한 번도 안 뜬 채 drop 만 오는 경우가 있어 그때 아무 일도 안 일어났다)
            var tgt = e.target && e.target.closest ? e.target.closest('tr[data-id]') : null;
            var id = (tgt && tgt.getAttribute('data-id')) || _dropRowId;
            _dropRowId = null;
            if (!id) {
                _toast('⚠️ ' + _t('제품 행 위에 떨어뜨려주세요.', 'Drop the file onto a product row.'), 'warning');
                return;
            }
            var r = _rowById(id);
            if (!r) return;
            if (!window._plRowDocNums(r).length) {
                _toast('⚠️ ' + _t('이 행에 PN(7자리)이나 KTK PN(6자리)이 없어 파일을 이어줄 수 없습니다.',
                                  'This row has no PN/KTK PN, so files cannot be linked.'), 'warning', 7000);
                return;
            }
            window._plPutDocs(id, files);
        });
    };

    document.addEventListener('DOMContentLoaded', function () {
        var si = document.getElementById('pl-search');
        if (si) si.value = _view.search || '';
        if (document.getElementById('pl-table-wrap')) window.plRender();
    });
    document.addEventListener('click', function () { /* 팝업 바깥 클릭 닫기 */ window.plClosePopup(); window.plCloseRowMenu(); });

    // 💾 이탈 직전 플러시 — 3초 디바운스가 뜨기 전에 닫으면 그 수정이 내 PC 에만 남기 때문.
    //    visibilitychange(hidden) 이 탭 전환·최소화·닫기에서 가장 확실히 뜨는 신호다(모바일 포함).
    //    pagehide/beforeunload 는 보조 — 셋 다 _plDirty 가 있을 때만 실제로 움직인다.
    window._plClearDirty = function () { _plDirty = false; };
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') window.plFlushSave();
    });
    window.addEventListener('pagehide', function () { window.plFlushSave(); });
    window.addEventListener('beforeunload', function () { window.plFlushSave(); });
})();
