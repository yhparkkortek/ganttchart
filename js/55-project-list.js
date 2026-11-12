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
        { k: 'sales', ko: '판매량',    en: 'Sales',       on: false }
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

    // 🔽 머리글 줄의 드롭다운 필터로 띄울 열(데이터) — 여기 한 줄이 곧 화면의 필터 하나다.
    //    ⚠️ 여기서 빼면 그 필터는 화면에서 사라지지만, **누가 이미 걸어 둔 값은 `_view.filters` 에
    //       남아 계속 행을 거른다**(저장된 화면 설정이 localStorage 에 남는다) — 고를 UI 가 없으니
    //       푸는 방법도 없어진다. 그래서 아래 `_view` 를 만들 때 **목록에 없는 필터 키는 버린다**.
    //    ⚠️ 열 정의의 `'sel'` 표시는 "드롭다운으로 쓸 만한 열"이라는 설명일 뿐 이 목록과 무관하다.
    //    (2026-11-05 사용자 요청으로 TYPE·Panel Mfr. 를 뺐다 — 쓰지 않는 칸이라 줄만 좁혔다.)
    window.PL_FILTER_KEYS = window.PL_FILTER_KEYS || ['customer', 'factory', 'project', 'status', 'cabinet'];

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

    // 📜 도면에서 읽는 것은 **REVISIONS / DISPLAY INFORMATION MATRIX 두 표뿐**이다(2026-10-30).
    //    예전엔 도면에서 30개 항목(도면번호·축척·공차…)을 뽑아 `dwg*` 열에 넣었는데, 그건
    //    사용자가 원한 것이 아니었다 — "Agile REV 를 누르면 그 도면의 REVISIONS 를 바로 보고 싶었다".
    //    그래서 그 기능과 열·버튼을 **통째로 지웠다**. 지금 남은 길은 `plOpenRevisions` 하나다.
    //    ⚠️ 이미 들어간 `dwg*` 값은 JSON 에 그대로 남겨 둔다 — 지우지 않는다(사람 자료니까).

    // ✂️ 칸에 보여줄 최대 글자 수(데이터) — 넘치면 …로 자르고 말풍선에 전문을 둔다.
    //    설명 1·2·3 은 한 칸에 문장이 통째로 들어와 표를 밀어내므로 20자로 끊는다(2026-10-29 사용자 요청).
    window.PL_CELL_MAX = window.PL_CELL_MAX || { desc: 20, desc2: 20, desc3: 20 };

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

    // 🧹 [2026-10-30] 옛 "도면 분석 30개 항목"이 남긴 `dwg*` 칸을 걷어낸다.
    //    그 기능은 지웠지만 이미 등록해 둔 값이 행에 남아 있었다(실측 1행 27칸). 사용자 요청으로 정리.
    //    ⚠️ NAS/Drive 의 JSON 을 **스크립트로 직접 고치지 않는다** — 그 파일을 열어 둔 앱이 메모리의
    //       옛 값으로 되돌려 쓴다(docs/doc-store.md 의 사진 이전 사고). 그래서 **앱이 스스로** 지운다.
    //    지울 게 없으면 아무것도 저장하지 않으므로, 각자의 PC 에서 딱 한 번씩만 돈다.
    window._plPurgeDwgFields = function (data) {
        var d = data || window._plData;
        if (!d || !Array.isArray(d.rows)) return 0;
        var cells = 0, rows = 0;
        d.rows.forEach(function (r) {
            var hit = Object.keys(r).filter(function (k) { return k.indexOf('dwg') === 0; });
            if (!hit.length) return;
            rows++;
            hit.forEach(function (k) { if (String(r[k] == null ? '' : r[k]).trim()) cells++; delete r[k]; });
        });
        // 변경 이력에도 그 칸을 가리키는 줄이 있으면 같이 뺀다(지금 파일엔 0건이지만 팀원 파일은 다를 수 있다).
        if (Array.isArray(d.history)) {
            var before = d.history.length;
            d.history = d.history.filter(function (h) { return String(h && h.col || '').indexOf('dwg') !== 0; });
            if (d.history.length !== before) cells += (before - d.history.length);
        }
        if (!rows && !cells) return 0;
        _plPushHistory({ ktkPn: '-', desc: _t('도면분석 칸 정리', 'Removed drawing-analysis fields') }, 'no', rows + _t('행', ' rows'), _t('삭제됨', 'deleted'));
        _persist();
        if (window.plRender) window.plRender();
        _toast('🧹 ' + _t('옛 도면분석 칸 ' + cells + '개를 지웠습니다(' + rows + '행).',
                          'Removed ' + cells + ' leftover drawing-analysis value(s) from ' + rows + ' row(s).'), 'info', 7000);
        return cells;
    };

    window._plData = window._plData || window.ProjectList.load();
    var D = function () { window._plData = window._plData || { rows: [], history: [] }; return window._plData; };
    // 💾 저장 경로는 두 갈래다.
    //    ① localStorage — 고치는 즉시(동기). 창이 죽어도 이 PC 에는 남는다.
    //    ② Drive 공용 파일 — 3초 디바운스(팀원이 같이 쓰는 파일이라 타자마다 올리면 안 된다).
    //    ⚠️ ②가 뜨기 전에 창을 닫으면 그 수정은 **나만 갖고 있게 된다**. 그래서 화면을 벗어나는
    //    모든 길목(탭 숨김·페이지 이탈·앱 안에서 다른 탭으로)에서 _plFlushSave() 로 즉시 밀어 올린다.
    var _plDirty = false;
    var _persist = function () { _plDirty = true; window._plViewStale = true; _plMarkDirty(); window.ProjectList.save(D()); };

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
        // 📄 [2026-11-12 사용자 요청] 지금 읽고 있는 실제 파일 이름 — `_plFindNasDataFile`이 복사본·
        //    철자가 다른 파일을 키워드로 찾아올 수 있어(510행 주석) "ProjectList_개발3팀.json"이라고
        //    늘 단정할 수 없다. NAS 는 실제로 읽은 이름(`_plNasLoadedName`)을 그대로 보여준다.
        var fel = document.getElementById('pl-saved-file');
        if (fel) {
            var fname = (where === 'NAS') ? (window._plNasLoadedName || _nasDataName())
                      : ((window.ProjectList && window.ProjectList.FILE_NAME) || _nasDataName());
            fel.textContent = '📄 ' + fname;
            fel.title = _t('지금 표가 읽어온 실제 파일입니다.', 'The actual file this table was loaded from.');
        }
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
            var v = Object.assign(def, o, { groups: Object.assign({}, def.groups, o.groups || {}) });
            // ⚠️ 화면에서 내린 필터는 **저장된 값까지 버린다**(PL_FILTER_KEYS 참고) — 안 그러면
            //    고를 칸이 없는데 행은 계속 걸러져 "목록이 왜 적지?" 가 된다(푸는 방법도 없다).
            if (v.filters) {
                Object.keys(v.filters).forEach(function (k) {
                    if (window.PL_FILTER_KEYS.indexOf(k) === -1) delete v.filters[k];
                });
            }
            return v;
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
    // ── 행 조립 ────────────────────────────────────────────
    //    자리표시 행을 나중에 채울 때도 **같은 함수**로 만든다 — 두 벌을 두면 한쪽만 고쳐 조용히 어긋난다.
    var _PL_EAGER = 60;              // 한 화면에 들어가는 행의 두배쳫 — 여기까지는 바로 그린다
    var _PL_ROW_H = 30;              // 자리표시 행 높이(실측 평균). 첫 렌더 뒤 진짜 높이로 고쳐 쓴다.
    var _plCtx = null;               // 지금 렌더의 열·고정열·팔레트

    var _plRowMeta = function (r, ri) {
        var pinned = (_view.pins || []).indexOf(r._id) !== -1;
        // 🦓 제브라 — 한 줄 건너 연한 배경. sticky 칸은 자기 배경을 따로 들고 있어야
        //    가로 스크롤 때 밑줄이 비쳐 보이지 않는다(배경 없는 sticky 는 투명이다).
        var zebra = (ri % 2 === 1);
        return { pinned: pinned, zebra: zebra, bg: pinned ? '#fff8e1' : (zebra ? _plCtx.P.zebraB : '#fff') };
    };

    var _plCellsHtml = function (r, ri, m) {
        var cols = _plCtx.cols, leftOf = _plCtx.leftOf, P = _plCtx.P, rowBg = m.bg, pinned = m.pinned;
        return cols.map(function (c) {
            var v = r[c.k] == null ? '' : String(r[c.k]);
            // ⚡ 고정 열의 position/left 는 **칸마다 적지 않는다** — 열 2개 × 164행이면 같은 문장을
            //    328번 쓰게 된다. 아래 _plStickyCss() 가 열 단위 CSS 규칙으로 한 번만 내보낸다.
            //    배경만 행마다 다르므로(제브라·고정행) 그것만 남긴다.
            var sticky = leftOf[c.k] !== undefined ? 'background:' + rowBg + ';' : '';
            var extra = '', cls = 'pl-td';
            if (c.type === 'num') extra += 'text-align:right;';
            if (c.k === 'no') {
                // 숫자가 주인공이다 — 예전엔 📌 아이콘이 44px 칸을 먹어 번호가 잘려 보였다(사용자 지적).
                //    고정(📌)은 행 메뉴 안으로 옮겼고, 여기선 고정된 행만 작게 표시한다.
                return '<td class="pl-td pl-no" data-id="' + r._id + '" data-k="' + c.k + '" style="' + sticky + '"'
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
                // 📜 아이콘은 **칸 오른쪽 끝에 고정**한다(값 뒤에 붙여 두면 긴 PN 에 밀려 잘려서 안 보였다 —
                //    사용자 지적 "말줄임 아이콘 안 보임"). 자료가 있으면 개수를 파랗게, 없으면 흐리게.
                var n = window._plDocCount ? window._plDocCount(r) : 0;
                ico = '<span class="pl-ico pl-ico-fix" onclick="event.stopPropagation(); window.plOpenDocBox(\'' + r._id + '\')"'
                    + ' style="' + (n ? 'opacity:1;' : 'opacity:.35;') + '"'
                    + ' title="' + _esc(n ? (n + _t('개 NAS 자료 — 열기/올리기/AI 분석', ' NAS file(s) — open/upload/AI analysis'))
                                          : _t('NAS 자료 없음 — 눌러서 올리기', 'No NAS file — click to upload')) + '">'
                    + (n ? '<b style="color:#1971c2; font-size:10px;">' + n + '</b>' : '') + '📜</span>';
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
            // ⚡ onclick 을 칸마다 달지 않는다 — 4,592칸이면 같은 문장이 4,592번 실려 HTML 이
            //    통째로 커진다(실측 935KB 중 약 175KB). 표 하나에 건 위임 핸들러가 받는다.
            return '<td class="' + cls + '" data-id="' + r._id + '" data-k="' + c.k + '"'
                 + ((cut || ico) ? ' title="' + _esc(v || '') + '"' : '')
                 + ' style="' + sticky + extra + '">'
                 + '<span class="pl-v">' + _esc(shown).replace(/\n/g, ' ') + '</span>' + ico + '</td>';
        }).join('');
    };

    var _plTrOpen = function (r, ri, m, lazy) {
        return '<tr data-id="' + r._id + '" data-ri="' + ri + '"' + (lazy ? ' data-lazy="1"' : '')
             + ' class="' + (m.zebra ? 'pl-zebra' : '') + (m.pinned ? ' pl-pinned' : '') + '"'
             + ' style="background:' + m.bg + ';">';
    };
    var _plRowHtml = function (r, ri) {
        var m = _plRowMeta(r, ri);
        return _plTrOpen(r, ri, m, false) + _plCellsHtml(r, ri, m) + '</tr>';
    };
    var _plLazyRowHtml = function (r, ri) {
        var m = _plRowMeta(r, ri);
        return _plTrOpen(r, ri, m, true)
             + '<td colspan="' + _plCtx.cols.length + '" style="height:' + _PL_ROW_H + 'px; padding:0;"></td></tr>';
    };

    /** 자리표시 행 하나를 진짜 칸으로 바꾼다. 보이기 전에 불러야 빈 행이 눈에 띄지 않는다. */
    window._plHydrateRow = function (tr) {
        if (!tr || !tr.getAttribute('data-lazy') || !_plCtx) return false;
        var r = _rowById(tr.getAttribute('data-id'));
        if (!r) return false;
        var ri = parseInt(tr.getAttribute('data-ri'), 10) || 0;
        tr.innerHTML = _plCellsHtml(r, ri, _plRowMeta(r, ri));
        tr.removeAttribute('data-lazy');
        return true;
    };

    /** 남은 자리표시 행을 전부 채운다 — 인쇄처럼 **화면 밖까지 다 써야 하는** 길목용. */
    window._plHydrateAll = function () {
        var n = 0;
        document.querySelectorAll('#pl-table tbody tr[data-lazy]').forEach(function (tr) { if (window._plHydrateRow(tr)) n++; });
        return n;
    };
    // 🖨️ 인쇄·PDF 는 화면 밖 행까지 종이에 나와야 한다 — 자리표시인 채로 찍히면 빈 줄이 된다.
    window.addEventListener('beforeprint', function () { try { window._plHydrateAll(); } catch (e) { /* 인쇄를 막지 않게 */ } });

    /** 스크롤을 따라 눈앞의 행만 채운다. 표를 다시 그릴 때마다 붙이지 않게 한 번만 건다. */
    window._plBindLazyScroll = function () {
        var wrap = document.getElementById('pl-table-wrap');
        if (!wrap || wrap._plLazyBound) return;
        wrap._plLazyBound = true;
        var pending = false;
        var sweep = function () {
            pending = false;
            var top = wrap.scrollTop - 600, bottom = wrap.scrollTop + wrap.clientHeight + 600;
            var trs = wrap.querySelectorAll('#pl-table tbody tr[data-lazy]');
            for (var i = 0; i < trs.length; i++) {
                var y = trs[i].offsetTop;
                if (y > bottom) break;                 // 행은 위에서 아래 순서라 더 볼 필요가 없다
                if (y + trs[i].offsetHeight >= top) window._plHydrateRow(trs[i]);
            }
        };
        var onScroll = function () {
            if (pending) return;
            pending = true;
            requestAnimationFrame(sweep);
        };
        wrap.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        wrap._plLazySweep = sweep;
    };

    // 🎨 [2026-11-11] 머리띠 버튼 — 전엔 이 함수가 JS 로 색만(테두리 없이 흐리게) 칠해서 호버가
    //    아예 없었다(사용자 지적: 다른 탭 버튼들과 안 어울린다). 이제 다른 탭의 제목띠 버튼과
    //    **같은 클래스**(`.concept-add-row-btn`, kortek_pm.html)를 쓴다 — bg/hoverBg(테두리)/darkText
    //    공식과 호버(hoverBg 배경·hoverBorder 테두리)를 js/21 `_cpApplyLive` 가 전부 대신 칠해 주므로
    //    여기서 따로 칠할 게 없다. 함수는 비워 두지 않고 그냥 지운다(호출부도 같이 제거).

    window.plRender = function (light) {
        var wrap = document.getElementById('pl-table-wrap');
        if (!wrap) return;
        var cols = _visibleCols(), rows = _visibleRows();
        var P = _pal();          // 🎨 테마 색 — 아래 인라인 배경(머리글/제브라/고정행)에 그대로 쓴다

        var left = 0, leftOf = {};
        cols.forEach(function (c) { if (STICKY.indexOf(c.k) !== -1) { leftOf[c.k] = left; left += c.w; } });

        // ⚠️ table-layout:fixed 에서는 **표 자체의 폭**이 정해져야 열 폭이 지켜진다. 폭을 안 주면
        //    브라우저가 컨테이너 폭(예: 990px)을 열 개수로 나눠버려 28열이 전부 35px 이 된다(실측).
        //    그래서 보이는 열 폭의 합을 표 폭으로 주고, th 에는 min/max 가 아니라 width 를 준다.
        var totalW = cols.reduce(function (s, c) { return s + c.w; }, 0);

        var th = cols.map(function (c) {
            var sticky = '';                     // 고정 열 규칙은 위 stickyCss 가 열 단위로 내보낸다
            var s = _view.sort || {};
            var mark = s.k === c.k ? (s.dir > 0 ? ' ▲' : ' ▼') : '';
            // 말풍선엔 **원래 이름**을 먼저 — 줄임말만 보고는 무슨 열인지 모르기 때문(사용자 요청).
            var tip = _headFull(c) + '\n' + _t('클릭: 정렬 · 우클릭: 이 열 숨기기', 'Click: sort · Right-click: hide this column');
            return '<th data-k="' + c.k + '" title="' + _esc(tip) + '"'
                 + ' onclick="window.plSort(\'' + c.k + '\')" oncontextmenu="window.plHideCol(\'' + c.k + '\'); return false;"'
                 + ' style="width:' + c.w + 'px; cursor:pointer; ' + sticky + '">'
                 + _esc(_headShort(c)) + mark + '</th>';
        }).join('');


        _plCtx = { cols: cols, leftOf: leftOf, P: P };
        // ⚡ 처음부터 164행을 다 그리지 않는다 — 4,592칸을 배치하느라 탭을 열 때마다 150ms 가 들었다.
        //    위에서 _PL_EAGER 개만 채워 내고, 나머지는 **자리표시 행**으로 두었다가 눈에 들어올 때 채운다
        //    (간트차트의 data-lazy 행과 같은 방식 — docs/gantt-internals.md).
        var body = rows.map(function (r, ri) {
            return (ri < _PL_EAGER) ? _plRowHtml(r, ri) : _plLazyRowHtml(r, ri);
        }).join('');

        // ⚡ 고정 열 규칙은 **열 하나에 한 줄** — 칸마다 쓰면 같은 문장이 수백 번 실린다.
        var stickyCss = '<style>' + Object.keys(leftOf).map(function (k) {
            return '#pl-table td[data-k="' + k + '"]{position:sticky;left:' + leftOf[k] + 'px;z-index:3;}'
                 + '#pl-table th[data-k="' + k + '"]{position:sticky;left:' + leftOf[k] + 'px;z-index:5;background:' + P.headerTint + ';}';
        }).join('') + '#pl-table td.pl-no{text-align:center;cursor:pointer;font-weight:bold;color:' + P.darkText + ';}</style>';

        wrap.innerHTML = stickyCss + '<table id="pl-table" class="concept-table pl-table" style="width:' + totalW + 'px;"><thead><tr>' + th + '</tr></thead><tbody>'
                       + (body || '<tr><td colspan="' + cols.length + '" style="padding:30px; text-align:center; color:#888;">'
                          + _esc(_t('표가 비어 있습니다 — [📥 엑셀 불러오기]로 제품 목록 엑셀을 넣어주세요.',
                                    'The table is empty — use [📥 Import Excel] to load the product list.')) + '</td></tr>')
                       + '</tbody></table>';

        var cnt = document.getElementById('pl-count');
        if (cnt) cnt.textContent = rows.length + ' / ' + (D().rows || []).length + _t('건', '');
        if (!light) window.plRenderChips();
        window.plRenderStats();
        window._plBindTableDnd();
        window._plBindTableClicks();
        window._plBindLazyScroll();
        // 첫 화면이 자리표시로 남지 않게 — 창이 크면 _PL_EAGER 보다 더 보일 수 있다.
        if (wrap._plLazySweep) wrap._plLazySweep();
        window.plRefreshLang();
        // ⚠️ 예전엔 여기서 `_cpApplyLive()` 를 **인자 없이** 불렀다 — 그 함수는 hex 가 없으면 첫 줄에서
        //    바로 던진다(실측 TypeError). 그래서 아무 일도 안 하면서 그릴 때마다 예외를 하나씩 만들었고,
        //    그게 "팔레트 → plRender → 팔레트" 무한재귀를 **우연히** 막고 있었다. 색은 이미 _pal() 이
        //    팔레트에서 직접 읽어 칠하므로 이 호출은 필요 없다.
        window._plViewStale = false;             // 지금 화면 = 지금 자료. 탭에 다시 들어와도 안 다시 그린다.
    };

    // ⚡ 칸 클릭은 **표 하나에 건 위임 핸들러**가 받는다(2026-10-30).
    //    예전엔 칸마다 onclick 을 달았다 — 164행 × 28열이면 같은 문장이 4,592번 실려서
    //    HTML 이 935KB 가 됐고, 탭에 들어올 때마다 그걸 다시 만들어 붙였다.
    window._plBindTableClicks = function () {
        var wrap = document.getElementById('pl-table-wrap');
        if (!wrap || wrap._plClickBound) return;
        wrap._plClickBound = true;
        wrap.addEventListener('click', function (e) {
            var ico = e.target.closest ? e.target.closest('.pl-ico') : null;
            if (ico) return;                     // 아이콘은 자기 onclick 이 따로 있다
            var td = e.target.closest ? e.target.closest('td.pl-td') : null;
            if (!td) return;
            if (td.classList.contains('pl-no')) { window.plOpenRowMenu(td.getAttribute('data-id'), e); return; }
            window.plEditCell(td);
        });
    };

    /** 탭에 들어올 때 쓰는 그리기 — 바뀐 게 없으면 **그대로 둔다**(표를 다시 만들면 150ms 가 든다). */
    window.plRenderIfStale = function () {
        if (window._plViewStale !== false || !document.getElementById('pl-table')) { window.plRender(); return true; }
        return false;
    };
    window._plMarkViewStale = function () { window._plViewStale = true; };

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
            fb.innerHTML = window.PL_FILTER_KEYS.map(function (k) {
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
        'pl-btn-check':   ['🔍 정보 확인',     '🔍 Check info'],
        'pl-btn-export':  ['📊 엑셀 저장',     '📊 Export Excel'],
        'pl-btn-import':  ['📂 불러오기',      '📂 Import'],
        'pl-btn-nas':     ['📁 NAS',           '📁 NAS'],
        'pl-btn-cols':    ['🔁 열',            '🔁 Columns'],
        'pl-btn-reset':   ['↺',                '↺']
    };
    window.PL_UI_TITLE = window.PL_UI_TITLE || {
        'pl-btn-reset':  ['검색·필터·정렬 초기화', 'Reset search, filters and sorting'],
        'pl-btn-search': ['지금 검색 (Enter)',     'Search now (Enter)'],
        'pl-btn-check':  ['프로젝트 파일(Summary·Customer SPEC)과 값이 다른 행을 찾아 표시',
                           'Find rows whose values differ from the project file (Summary · Customer SPEC)'],
        'pl-btn-import': ['NAS에서 목록(JSON)이나 엑셀을 불러옵니다',
                           'Import the list (JSON) or an Excel file from NAS'],
        'pl-btn-cols':  ['숨긴 열 되돌리기',      'Restore hidden columns'],
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
    // 🔍 [2026-11-11] 디바운스 없음 — 타이핑만으론 검색이 안 돈다(164행 × 91열 재렌더가 한 번에
    //    112ms 라 타자마다 돌리면 화면이 밀린다, 실측). [🔍 지금 검색] 버튼이나 Enter 를 눌러야
    //    `plSearchNow()`가 돈다 — js/26 간트 검색과 같은 이유·같은 방식(2026-11-11 사용자 요청).
    window.plSearch = function (v) { _view.search = v; };
    window.plSearchNow = function () { _saveView(); window.plRender(true); };
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
        // 🎨 [2026-11-11] Gantt 의 행 액션 팝업(.row-action-popup/.rap-btn 류, js/04i)과 **같은 버튼**을
        //    쓴다 — 전엔 이 페이지만 따로 만든 파스텔 사각형이라 앱 전체 톤과 어긋났다(사용자 지적).
        box.className = 'row-action-popup';
        box.style.cssText = 'position:fixed; z-index:100001;';
        var WIDE = 'grid-column: span 2; width:100%; height:28px; font-size:11px; font-weight:bold; gap:4px;';
        box.innerHTML =
            '<div style="font-size:10.5px; color:#9aa5a9; text-align:center; margin-bottom:6px;">'
          + _esc(_t('행 ', 'Row ') + (r.no || '')) + '</div>'
          + '<div style="display:grid; grid-template-columns:repeat(2,33px); grid-auto-rows:33px; gap:4px; justify-items:center;">'
          + '<span class="rap-btn" title="' + _esc(_t('위로 이동', 'Move up')) + '" onclick="window.plMoveRow(\'' + id + '\',-1)"><i class="ti ti-chevron-up"></i></span>'
          + '<span class="rap-btn" title="' + _esc(_t('아래로 이동', 'Move down')) + '" onclick="window.plMoveRow(\'' + id + '\',1)"><i class="ti ti-chevron-down"></i></span>'
          + '<span class="rap-btn rap-btn-add" title="' + _esc(_t('아래에 행 추가', 'Insert row below')) + '" onclick="window.plInsertRow(\'' + id + '\',1)"><i class="ti ti-plus"></i></span>'
          + '<span class="rap-btn rap-btn-danger" title="' + _esc(_t('이 행 삭제', 'Delete row')) + '" onclick="window.plDeleteRow(\'' + id + '\')"><i class="ti ti-minus"></i></span>'
          + '<span class="rap-btn" style="' + WIDE + '" title="' + _esc(_t('위에 행 추가', 'Insert row above')) + '" onclick="window.plInsertRow(\'' + id + '\',0)"><i class="ti ti-row-insert-top"></i>' + _esc(_t('위에 추가', 'Insert above')) + '</span>'
          + '<span class="rap-btn" style="' + WIDE + (pinned ? ' background:#fff8e1; border-color:#f2dfa0; color:#8a6d1a;' : '') + '" title="' + _esc(pinned ? _t('고정 해제', 'Unpin') : _t('맨 위에 고정', 'Pin to top')) + '" onclick="window.plTogglePin(\'' + id + '\'); window.plCloseRowMenu();"><i class="ti ti-pin"></i>' + _esc(pinned ? _t('고정 해제', 'Unpin') : _t('고정', 'Pin')) + '</span>'
          + '<span class="rap-btn" style="' + WIDE + '" title="' + _esc(_t('상세 보기', 'Detail')) + '" onclick="window.plCloseRowMenu(); window.plOpenDetail(\'' + id + '\')"><i class="ti ti-list-details"></i>' + _esc(_t('상세 보기', 'Detail')) + '</span>'
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
            // ⚠️ [2026-11-11] **모달 기본값**(docs/modal-ux.md) — 머리글은 `flex-shrink:0`,
            //    본문만 `flex:1; overflow-y:auto`. 전엔 바깥 박스 하나에만 `overflow:auto`를 줘서
            //    머리글까지 본문과 **같이** 스크롤로 말려 올라갔다(제목이 안 보이게 사라짐).
            box.style.cssText = 'display:none; position:fixed; z-index:100000; left:50%; top:50%; transform:translate(-50%,-50%);'
                              + ' background:#fff; border:1px solid #a3d9e0; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,.25);'
                              + ' max-height:82vh; overflow:hidden; display:flex; flex-direction:column;';
            box.onclick = function (e) { e.stopPropagation(); };
            document.body.appendChild(box);
        }
        box.style.width = wide ? '720px' : '460px';
        // ⚠️ [2026-11-12 사용자 지적] 머리글 높이가 다른 모달보다 낮았다 — 앱 전체 머리글은
        //    `padding:13px 18px`(11곳 실측, 예: notice-modal-header·cp-modal-header)인데 여긴
        //    `10px 14px`였다. 닫기 버튼도 `--modal-icon-*` CSS 변수를 쓰는 표준 28×28 버튼이 아니라
        //    글자만 있었다 — 둘 다 앱 표준으로 맞춘다.
        box.innerHTML = '<div id="pl-popup-head" style="display:flex; align-items:center; gap:8px; padding:13px 18px; background:#e0f5f7;'
                      + ' border-bottom:1px solid #a3d9e0; border-radius:10px 10px 0 0; font-weight:bold; color:#00707d; font-size:14px; flex-shrink:0;">'
                      + '<span style="flex:1;">' + title + '</span>'
                      + '<button onclick="window.plClosePopup()"'
                      + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text);'
                      + ' font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;"'
                      + ' onmouseover="this.style.background=\'var(--modal-icon-hover-bg)\'; this.style.borderColor=\'#adb5bd\';"'
                      + ' onmouseout="this.style.background=\'var(--modal-icon-bg)\'; this.style.borderColor=\'var(--modal-icon-border)\';"'
                      + ' onmousedown="event.stopPropagation()">✕</button></div>'
                      // ⚠️ `min-height:0` 필수 — flex 항목 기본값(auto)이면 안 줄어들어 스크롤이 안 생긴다.
                      + '<div style="padding:14px 16px; font-size:12.5px; overflow-y:auto; flex:1; min-height:0;">' + html + '</div>';
        // ⚠️⚠️ 'block'이 아니라 'flex' — 박스 자체가 `display:flex`(머리글 고정용)라, 'block'으로
        //    돌아가면 flex 컨텍스트가 깨져 본문의 `flex:1`이 무효가 되고(실측: 다시 글 길이만큼
        //    통째로 자란다) 머리글 고정이 도로 안 먹는다.
        box.style.display = 'flex';
        if (window._makeDraggable) { try { window._makeDraggable('pl-popup', 'pl-popup-head'); } catch (e) { /* 드래그 실패는 보기를 막지 않는다 */ } }
        return box;
    };
    window.plClosePopup = function () { var b = document.getElementById('pl-popup'); if (b) b.style.display = 'none'; };
    window._plPopup = _popup;

    // ── 팝업 안 버튼 — 역할별 한 벌(2026-11-12 사용자 요청: "팝업 안 버튼 스타일 통일") ──────
    //    전엔 팝업마다(담당자 카드·패널 카드·문서함·SAP 메뉴·이력·상세보기…) 똑같은 역할인데도
    //    패딩·글자크기·반경이 제각각 복붙돼 있었다(5px10px/12px vs 6px12px/12px vs 3px8px/11px 뒤섞임).
    //    ⚠️ 배경엔 **역할색(bg/neutral/danger/success)만** 쓴다 — darkText(#00707d)를 배경으로 쓰면
    //    테마를 바꿔도 그 버튼만 청록으로 굳는다(docs/ui-conventions.md 경고).
    var PL_BTN_ROLE = {
        primary: 'background:#e0f5f7; color:#00707d; border:none;',
        neutral: 'background:#eef2f5; color:#495057; border:none;',
        danger:  'background:#fbe4e2; color:#b1432f; border:none;',
        success: 'background:#d4f3dd; color:#2b7a45; border:1px solid #9bd8ae; font-weight:bold;',
        close:   'background:#f1f3f5; color:#495057; border:1px solid #dee2e6;'
    };
    /** opts: size('sm'=목록 행 안 아이콘 버튼 / 기본=팝업 하단 액션 버튼) · title · id · disabled · extraStyle(block 메뉴 등) */
    var _plBtn = function (role, html, onclick, opts) {
        opts = opts || {};
        var dims = opts.size === 'sm' ? 'padding:3px 8px; border-radius:5px; font-size:11px;' : 'padding:6px 12px; border-radius:6px; font-size:12px;';
        return '<button' + (opts.id ? ' id="' + opts.id + '"' : '')
             + (opts.title ? ' title="' + _esc(opts.title) + '"' : '')
             + ' onclick="' + onclick + '"'
             + (opts.disabled ? ' disabled' : '')
             + ' style="' + dims + (PL_BTN_ROLE[role] || PL_BTN_ROLE.primary) + ' cursor:pointer;' + (opts.extraStyle || '') + '">' + html + '</button>';
    };

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
                 + '<div style="margin-top:6px;">' + _plBtn('primary',
                     '📒 ' + _t('이 담당자 제품 ', 'Products by this owner ') + cnt + _t('건 보기', ''),
                     'window.plFilterByOwner(\'' + k + '\',\'' + _esc(nm) + '\')') + '</div></div>';
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
             + _plBtn('primary', '📜 ' + _t('NAS 사양서 열기', 'Open NAS spec'), 'window.plOpenPanelSpec(\'' + _esc(model) + '\')')
             + _plBtn('primary', '📒 ' + _t('이 패널 쓰는 제품 ', 'Products using this panel ') + same + _t('건 보기', ''), 'window.plFilterByPanel(\'' + _esc(model) + '\')')
             + _plBtn('primary', '⚡ ' + _t('PARTS 탭으로', 'Go to PARTS'), 'window.switchTab(\'elecparts\'); window.plClosePopup();')
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
        html += '<div style="margin-top:9px;">' + _plBtn('primary',
            '📒 ' + _t('같은 값 제품 ', 'Products with same value ') + same + _t('건 보기', ''),
            'window.plFilterByPanel(\'' + _esc(v) + '\')') + '</div>';
        var b = document.getElementById('pl-part-body');
        if (b) { b.style.color = ''; b.innerHTML = html; }
    };

    // ── 8-4. KTK PN 메뉴 — SAP 조회 / 프로젝트 열기 ──────────────────────────
    window.plOpenPnMenu = function (id) {
        var r = _rowById(id); if (!r) return;
        var pn = String(r.ktkPn || '').trim();
        if (!pn) { _toast(_t('KTK PN이 비어 있습니다.', 'KTK PN is empty.'), 'warning'); return; }
        var BLOCK = ' display:block; width:100%; text-align:left; margin-bottom:6px;';
        _popup('🏭 ' + _esc(pn),
            _plBtn('primary', '🔍 ' + _t('SAP 자재 내역 조회', 'SAP material description'), 'window.plAskAi(\'' + _esc(pn) + ' 자재내역 조회해줘\')', { extraStyle: BLOCK })
          + _plBtn('primary', '📦 ' + _t('SAP 재고 조회', 'SAP stock'), 'window.plAskAi(\'' + _esc(pn) + ' 재고 조회해줘\')', { extraStyle: BLOCK })
          + _plBtn('primary', '💰 ' + _t('SAP 가격 조회', 'SAP price'), 'window.plAskAi(\'' + _esc(pn) + ' 가격 조회해줘\')', { extraStyle: BLOCK })
          + _plBtn('primary', '🧱 ' + _t('SAP BOM 조회', 'SAP BOM'), 'window.plAskAi(\'' + _esc(pn) + ' BOM 조회해줘\')', { extraStyle: BLOCK })
          + '<div style="border-top:1px solid #eee; margin:8px 0;"></div>'
          + _plBtn('primary', '📂 ' + _t('이 모델의 프로젝트 찾기', 'Find the project for this model'), 'window.plOpenProjectOf(\'' + id + '\')', { extraStyle: BLOCK }));
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
    // 📐 [2026-10-30, 사용자 지적] 파일명 리비전("REV J4")과 문서 안 REVISIONS 표 표기("J.4")가
    //    서로 다른 모양이라 못 알아봤다 — 점을 지우지 말고 **문서 표기(점 있는 모양)로 통일**한다.
    //    "J4"/"J.4"/"j 4" 전부 "J.4" 하나로 모여야 표·prodRev/agileRev 칸과 같은 모양으로 비교된다.
    var _plNormRev = function (rv) {
        var m = String(rv || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z])\.?(\d+)?$/);
        if (!m) return String(rv || '').toUpperCase();
        return m[2] ? (m[1] + '.' + m[2]) : m[1];
    };
    window._plNormRev = _plNormRev;

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
        return { num: num, rev: _plNormRev(rev), name: name };
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
        return m ? _plNormRev(m[1]) : '';
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
            window._plViewStale = true;      // 배지 숫자가 바뀜을 수 있다
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
        _popup('📜 ' + _esc(nums.join(' / ')) + ' ' + _t('자료', 'documents')
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
            String(v || '').replace(/[A-Za-z](?:\.?\d+)?/g, function (m) { curRevs.push(_plNormRev(m)); return m; });
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
                     + _plBtn('primary', _t('열기', 'Open'), 'window._dsOpenInNewTab(\'' + NAS_FOLDER + '\',\'' + _esc(f.name) + '\')', { size: 'sm' })
                     + _plBtn('neutral', '🖥️', 'window._dsOpenNative && window._dsOpenNative(\'' + NAS_FOLDER + '\',\'' + _esc(f.name) + '\')', { size: 'sm', title: _t('NAS 원본을 연결 프로그램으로', 'Open the NAS original in its app') })
                     // 💾 이 파일 하나를 내 PC 로 받는다 — 열기/연결프로그램/분석과 같은 줄에 둔다(사용자 지적: 위치가 틀렸다)
                     + _plBtn('success', '💾', 'window.plDownloadDoc(\'' + _esc(f.name) + '\')', { size: 'sm', title: _t('이 파일을 내 PC에 저장', 'Save this file to my PC') })
                     // 🔍 분석은 **AI 를 안 쓰는** 결정론 추출이라 팔레트 색을 따른다. 보라색은
                     //    AI 한도를 쓰는 "🤖 AI로 더 읽기" 전용으로 남겨 둔다(색이 곧 경고다).
                     // 📜 [2026-10-30] 도면에서 읽는 건 **REVISIONS / DISPLAY INFORMATION MATRIX** 두 표뿐이다.
                     //    옛 "30개 항목 추출"은 사용자가 원한 게 아니어서 통째로 지웠다 — 여기도 그 표로 간다.
                     + _plBtn('primary', '📜 ' + _t('이력', 'Revisions'), 'window.plOpenRevisions(\'' + id + '\',\'' + _esc(f.name) + '\')', { size: 'sm' })
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
                 + _plBtn('success', '⬆️ ' + _t('NAS에 올리기', 'Upload to NAS'), 'window.plUploadDocs(\'' + id + '\')', { id: 'pl-doc-save', disabled: true, extraStyle: ' opacity:.45;' })
                 + _plBtn('primary', '📁 ' + _t('폴더 열기', 'Open folder'), 'window._dsOpenBrowser && window._dsOpenBrowser(\'' + NAS_FOLDER + '\')')
                 + _plBtn('neutral', '🔄 ' + _t('목록 새로고침', 'Refresh'), 'window.plRefreshDocCache(false)')
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

    /** 💾 NAS 파일 하나를 내 PC 로 — 사본이 NAS 를 건드리지 않는다.
     *  ⚠️⚠️ [2026-11-12 사용자 신고] `_dsFileUrl` 은 **백엔드(다른 출처) 주소**라 cross-origin
     *     anchor 는 `download` 속성을 브라우저가 무시하고 **그 주소로 페이지를 이동**시킨다 —
     *     그래서 "저장 안 되고 사이트 나가기(이탈 확인) 동작"이 났다(이 앱은 떠날 때 저장 확인
     *     창을 띄운다, js/07). → `_dsFileOf` 로 먼저 받아(같은 창 안의 blob) object URL 을 만들면
     *     `download` 이 항상 먹는다(doc-store.md "받기는 `<a download>`로" 와 같은 원칙 — 단, 주소가
     *     아니라 **받은 바이트**로 만들어야 한다). */
    window.plDownloadDoc = async function (name) {
        if (!window._dsFileOf) { _toast(_t('문서 저장소를 불러오지 못했습니다.', 'Document store unavailable.'), 'error'); return; }
        _toast('💾 ' + _esc(name) + _t(' 내려받는 중…', ' downloading…'), 'info');
        try {
            var f = await window._dsFileOf(NAS_FOLDER, name);
            var url = URL.createObjectURL(f);
            var a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        } catch (e) { _toast('⚠️ ' + (e && e.message ? e.message : e), 'error', 7000); }
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
    var _VENDORS = ['TOVIS', 'KORTEK', 'AUO', 'BOE', 'INNOLUX', 'AXIOMTEK', 'LGD', 'LG', 'TXD', 'INX'];
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

    /** pdf.js 모양 전용 MATRIX 읽기 — 행은 리비전 칸으로 시작하고, VENDOR 자리로 양식을 가른다
     *  ⚠️⚠️ [2026-11-11] VENDOR 가 REVISION 바로 다음(vi===0)에 오는 세 번째 양식이 있었다
     *  ("REVISION VENDOR PART NUMBER MODEL DESCRIPTION TOUCH SENSOR TOUCH F/W PANEL VIDEO F/W",
     *  1570705 REV N 실측) — A/B 둘 다 안 걸려서(vi 가 1도 2도 아님) 이 함수가 통째로 null 을
     *  돌려줬고, 그래서 아래 "줄=칸" 전용 대비책으로 떨어졌다가 **엉뚱한 줄에서 "DISPLAY
     *  INFORMATION MATRIX" 를 찾아**(리비전 H 의 변경내용 문장 속에 우연히 그 문구가 들어 있었다)
     *  머리글 자리에 리비전 기록 문장이 통째로 섞여 들어갔다(실측: "FIRMWARE TABLE 6. CABLE/LINE
     *  INSTALLTION: …" 글자 수프). C 양식을 추가하니 그 줄=칸 경로를 아예 안 타고 25행이 깨끗하게 나온다. */
    var _matFromLineRows = function (L, hasTitleAnywhere) {
        var A = ['REVISION', 'MANUFACTURER PART NUMBER', 'PART NUMBER', 'VENDOR',
                 'TOUCH SCREEN CONTROLLER', 'TOUCH SENSOR', 'TOUCH F/W', 'PANEL'];
        var B = ['REVISION', 'PART NUMBER', 'VENDOR', 'VENDOR P/N', 'TOUCH SCREEN',
                 'TOUCH SCREEN CONTROLLER', 'TOUCH SENSOR', 'TOUCH F/W', 'PANEL', 'VIDEO F/W'];
        var C = ['REVISION', 'VENDOR', 'PART NUMBER', 'MODEL', 'DESCRIPTION',
                 'TOUCH SENSOR', 'TOUCH F/W', 'PANEL', 'VIDEO F/W'];
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
            var cols = (vi === 2) ? A : (vi === 1 ? B : (vi === 0 ? C : null));
            if (!cols) continue;
            // ⚠️⚠️ [2026-11-11] 토큰이 양식이 요구하는 칸 수보다 **적은** 행(실측 "1570704_H":
            // MODEL 칸이 빠진 행 4/8건)을 그대로 slice 하면 뒤 칸이 전부 한 칸씩 당겨져 틀린
            // 값이 엉뚱한 열에 들어간다 — 모자라면 그 행은 아예 버린다(틀리게 채우지 않는다).
            if (toks.length < cols.length - 1) continue;
            if (!headers) headers = cols;
            if (headers !== cols) continue;                       // 한 도면에 양식이 섞이진 않는다
            rows.push([m[1].replace(/\s*-\s*/, '-')].concat(toks.slice(0, cols.length - 1)));
            if (rows.length > 40) break;
        }
        if (rows.length) return { headers: headers, rows: rows };
        // ⚠️ _matGeneric 은 VENDOR 를 토큰 위치 제한 없이(처음 5개 밖까지) 찾아서 A/B/C 보다
        // 오인식 여지가 더 크다 — "DISPLAY INFORMATION MATRIX" 문구가 문서 어딘가에(느슨하게)
        // 있을 때만 시도한다(표 자체가 없는 문서의 BOM 행이 걸리는 사고 방지, 실측 "1576437 REV M").
        return hasTitleAnywhere ? _matGeneric(L) : null;
    };

    // ⚠️⚠️⚠️ [2026-11-11 3차] A/B/C 전부 "REV 뒤 몇 번째 토큰이 VENDOR인가"가 **문서마다 고정된
    //    상수**라고 가정한다 — 그런데 실측(1571018·1590937·1629124)으로 보면 PART NUMBER 가 먼저
    //    오는 문서는 그 사이 DESCRIPTION 이 "18.5\" TOP DISPLAY"(3칸)·"ASY, MONITOR TOP, VJ-1"
    //    (4칸)·"ASY, TOPBOX FACADE, L7, CS-1"(5칸)처럼 **문서마다 글자 수가 다른 자유 문장**이라
    //    고정 위치로는 절대 못 묶는다. 게다가 PANEL 칸도 "AUO G185HAN01.1"처럼 **그 칸만** 브랜드+
    //    모델 두 토막일 수 있다(터치 조립 벤더와 패널 벤더가 다를 때만, 1570705 류는 벤더가 하나라
    //    한 토막).
    //    → 칸 수를 미리 정하지 않고 **VENDOR 이름 자체를 이정표로 그때그때 찾는다**:
    //      토큰0=PART NUMBER · 토큰1~(첫 VENDOR 전)=DESCRIPTION(통째로 합친다) · 그 VENDOR=VENDOR ·
    //      그 뒤에 **두 번째 VENDOR 이름**이 또 나오면 거기서부터 두 토막을 PANEL(브랜드+모델)로
    //      묶고, 둘 사이는 칸 하나씩(TOUCH 관련 등 문서마다 다른 몇 개), 두 번째 VENDOR가 없으면
    //      그 뒤 전부 칸 하나씩. 이러면 DESCRIPTION 글자 수·중간 칸 개수가 달라도 안 깨진다.
    // ⚠️⚠️ [2026-11-11 4차] 리비전 변경내용 문장도 "F UPDATE PANEL TO BOE WITH …"처럼 REV 글자로
    //    시작하고 문장 속에 VENDOR 이름이 우연히 섞여 **오인식될 수 있다**(실측 1571018). 진짜
    //    DESCRIPTION("18.5\" TOP DISPLAY" 등)은 흔한 연결어(AND/OR/TO/THE/WITH…)를 안 쓰므로,
    //    그 사이에 연결어가 보이면 그 줄은 행이 아니라 문장으로 보고 버린다.
    //    ⚠️ 꼬리 칸에도 법적 문구가 **같은 줄로 바로 붙는다**(1629124) — 연결어를 만나면 그 자리에서
    //    자른다(그 뒤는 버림). 둘 다 안 하면 양식 일치 검사가 법적 문구 길이 차이 때문에 깨진다.
    var _GEN_STOP = /^(AND|OR|TO|THE|WITH|FOR|FROM|THIS|THAT|SHALL|IS|ARE|OF|IN|ALL|NOT|BE)[,.]?$/i;
    // ⚠️ 꼬리 칸 잘라내기는 **낱말 금지어 목록**으로 못 한다 — 법적 문구 낱말이 너무 많다
    // (PROTECTION·UNDER·STATE·FEDERAL·COUNTRY·REGIONAL… 실측 전부 다른 낱말). 대신 **모양**으로
    // 본다: 진짜 칸 값(V1.0·VILW750LP03·N/A)은 숫자나 슬래시가 섞여 있거나 'N/A' 자체고,
    // 법적 문구는 **순수 알파벳 낱말이 연달아** 나온다 — 그 연속 쌍이 보이면 거기서부터 버린다.
    // 꼬리 끝에 혼자 남는 한 글자(도면 용지 크기 "D"·"F" 등 제목란 글자)도 떼어 낸다.
    var _looksLikeProseWord = function (t) {
        var bare = t.replace(/[,.:;]$/, '');
        return bare.length > 1 && /^[A-Za-z]+$/.test(bare) && bare.toUpperCase() !== 'N/A';
    };
    var _truncAtProse = function (arr) {
        var out = arr;
        for (var x = 0; x + 1 < arr.length; x++) {
            if (_looksLikeProseWord(arr[x]) && _looksLikeProseWord(arr[x + 1])) { out = arr.slice(0, x); break; }
        }
        if (out.length && /^[A-Z]$/.test(out[out.length - 1])) out = out.slice(0, -1);   // 혼자 남은 용지크기 글자
        return out;
    };
    var _matGeneric = function (L) {
        var rows = [], shape = null, midCount = 0, hasPanel2 = false;
        for (var i = 0; i < L.length; i++) {
            var m = L[i].match(/^([A-Z]\d*(?:\.\d+)?(?:\s*-\s*[A-Z]\d*(?:\.\d+)?)?)\s+(.*)$/);
            if (!m) continue;
            var toks = m[2].split(/\s+/);
            if (toks.length < 4) continue;
            // ⚠️ "10. DIMENSIONING: ALT1 KORTEK …"(NOTES 목록 10번) 같은 줄도 REV+VENDOR 모양을
            // 흉내 낸다(실측 1644741) — 진짜 PART NUMBER 는 전부 6~7자리 숫자라 "10." 처럼
            // 짧은 목록 번호는 버린다.
            if (/^\d{1,2}\.?$/.test(toks[0])) continue;
            var vi1 = -1;
            for (var k = 1; k < toks.length; k++) {
                if (_VENDORS.indexOf(toks[k].toUpperCase()) !== -1) { vi1 = k; break; }
            }
            if (vi1 < 1) continue;
            // ⚠️⚠️ [2026-11-11 5차] "E RELEASE TOVIS VERSION ASSEMBLY. V.BERNARD 7/29/2026" 처럼
            //    REVISIONS 표의 변경내용 한 줄도 REV 로 시작하고 VENDOR 이름이 우연히 섞인다
            //    (실측 1622777). DESCRIPTION 이 아예 없거나(vi1===1) 줄 안에 날짜가 있으면
            //    그건 리비전 기록이지 매트릭스 행이 아니다.
            if (vi1 < 2 || _DATE_RE.test(m[2])) continue;
            var descToks = toks.slice(1, vi1);
            if (descToks.some(function (t) { return _GEN_STOP.test(t); })) continue;  // 문장 오인식
            var vi2 = -1;
            for (var k2 = vi1 + 1; k2 < toks.length; k2++) {
                if (_VENDORS.indexOf(toks[k2].toUpperCase()) !== -1) { vi2 = k2; break; }
            }
            var desc = descToks.join(' ');
            var cells, curMid, curPanel2;
            if (vi2 > vi1 && vi2 + 1 < toks.length) {
                var midToks = _truncAtProse(toks.slice(vi1 + 1, vi2));
                if (midToks.length !== vi2 - vi1 - 1) continue;    // 중간 칸에서 잘렸으면 이 줄은 버린다
                var tail2 = _truncAtProse(toks.slice(vi2 + 2));
                var panel = toks.slice(vi2, vi2 + 2).join(' ');
                curPanel2 = true;
                curMid = midToks.length;
                cells = [toks[0], desc, toks[vi1]].concat(midToks, [panel], tail2);
            } else {
                var tail1 = _truncAtProse(toks.slice(vi1 + 1));
                curPanel2 = false;
                curMid = tail1.length;
                cells = [toks[0], desc, toks[vi1]].concat(tail1);
            }
            var curShape = cells.length + ':' + (curPanel2 ? 1 : 0);
            if (!shape) { shape = curShape; midCount = curMid; hasPanel2 = curPanel2; }
            if (curShape !== shape) continue;      // 양식이 안 맞는 줄(법적 문구 등 오인식)은 버린다
            rows.push([m[1].replace(/\s*-\s*/, '-')].concat(cells));
            if (rows.length > 40) break;
        }
        // ⚠️ [2026-11-11] "최소 2줄" 로 두었다가 실측 1629124(이 표가 진짜 1행뿐)까지 버렸다 —
        //    문장 오인식은 위 descToks 검사(흔한 연결어)가 이미 걸러 주므로 1행도 받는다.
        if (!rows.length) return null;
        return { headers: _matGenericHeaders(L, midCount, hasPanel2, rows[0].length), rows: rows };
    };

    /** _matGeneric 용 머리글 이름 — PART NUMBER/DESCRIPTION/VENDOR(앞 3칸)·PANEL(둘째 VENDOR 있으면)은
     *  구조로 이미 안다. 가운데 칸 이름은 흩어진 머리글 줄 속 글자가 **어느 칸 것인지 확신할 수
     *  없어**(실측: "VIDEO F/W" 가 가운데 칸으로 잘못 끌려와 칸이 모자랐다 — 1590937) 그냥
     *  "항목 n"으로 둔다 — **칸 수가 실제 값과 맞는 것**이 이름이 예쁜 것보다 훨씬 중요하다.
     *  단 "VIDEO F/W" 는 세 문서 전부(1570705·1571018·1590937·1629124) **마지막 칸**이었으므로
     *  그 이름이 문서에 있으면 마지막 칸에만 붙인다. */
    var _matGenericHeaders = function (L, midCount, hasPanel2, totalCells) {
        var hasVideoFw = L.join(' ').toUpperCase().indexOf('VIDEO F/W') >= 0;
        var headers = ['REVISION', 'PART NUMBER', 'DESCRIPTION', 'VENDOR'];
        for (var i = 0; i < midCount; i++) headers.push('항목' + (i + 1));
        if (hasPanel2) headers.push('PANEL');
        var tailLen = Math.max(0, totalCells - headers.length);
        for (var j = 0; j < tailLen; j++) {
            headers.push((j === tailLen - 1 && hasVideoFw) ? 'VIDEO F/W' : ('항목' + (midCount + j + 1)));
        }
        return headers;
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
        // ⚠️⚠️ [2026-11-11 6차] "제목이 있어야만 시도한다"를 _matFromLineRows 전체에 걸었다가
        //    **더 많이 깨졌다**(정상 39 → 16) — "1569940 REV J" 같은 멀쩡한 문서가 제목 글자
        //    자체가 pdf.js 추출에서 쪼개져 안 보이는 경우였다(실측: 템플릿 A/B/C 는 "리비전칸+
        //    VENDOR(처음 5토큰 안)+같은 모양 반복"이라는 조건만으로 이미 안전했다 — 제목 없이도
        //    잘 돌고 있었다). 그래서 제목 확인은 **_matGeneric 에만**(그 조건이 느슨해서 BOM
        //    표에서도 걸릴 수 있었다, 실측 "1576437 REV M": 제목 자체가 없는 문서인데 BOM 행
        //    "B ASY,TOPPER MONITOR,27" ... BOE MV270FHM-N20 ..."이 오인식됨) 신호로만 준다.
        var hasTitleAnywhere = /DISPLAY INFORMATION MATRIX/i.test(text);
        var byLine = _matFromLineRows(L, hasTitleAnywhere);
        if (byLine) return byLine;

        var at = -1, atLoose = -1;
        for (var i = 0; i < L.length; i++) {
            if (/^DISPLAY INFORMATION MATRIX$/i.test(L[i])) { at = i; break; }
            if (atLoose < 0 && /DISPLAY INFORMATION MATRIX/i.test(L[i])) atLoose = i;
        }
        if (at < 0) at = atLoose;
        if (at < 0) return { headers: [], rows: [] };

        // 머리글 — 첫 리비전 칸이 나오기 전까지
        // ⚠️⚠️ [2026-11-11] "줄=칸"(PyMuPDF) 모양 전용 가정 — 리비전 칸이 **그 줄 하나뿐**이어야
        //    머리글 수집이 멈춘다. 그런데 실측 여러 문서(1571018·1590937·1629124 등)가 "줄=행"
        //    (pdf.js, `_matFromLineRows`가 못 알아본 것들 — DESCRIPTION 칸이 "18.5\" TOP DISPLAY"
        //    처럼 **글자 수가 문서마다 다른 자유 문장**이라 고정 칸수 양식으로 못 묶는다)이라
        //    리비전 칸 뒤에 곧장 값이 붙는다 — 그 줄은 절대 "리비전 칸 하나뿐"이 될 수 없어
        //    머리글 수집이 멈추지 않고 **본문 데이터 행까지 머리글로 빨아들인다.**
        //    → 리비전 칸으로 **시작하면서 VENDOR 이름이 보이는 줄**도 멈추는 신호로 추가한다.
        var hLines = [], k = at + 1;
        for (; k < L.length && hLines.length < 16; k++) {
            if (!L[k]) continue;
            if (_isRevCell(L[k])) break;
            if (_REVCELL_RE.test(L[k])) {
                var afterRev = L[k].replace(/^[A-Z](?:\.\d+)?(?:\s*-\s*[A-Z](?:\.\d+)?)?\s+/, '').toUpperCase();
                if (_VENDORS.some(function (v) { return afterRev.indexOf(v) !== -1; })) break;
            }
            hLines.push(L[k]);
        }
        var joined = hLines.join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
        var vocab = (window.PL_MATRIX_COLS || []).slice().sort(function (a, b) { return b.length - a.length; });
        // ⚠️ [2026-11-11] 머리글 줄 **안에도** 법적 문구가 같은 줄에 바로 붙어 나온다
        //    ("…PANEL VIDEO F/W THE DESIGNS AND RELATED INFORMATION…" — 표 머리글과 도면
        //    하단 고지문이 한 줄에 섞였다). 사전에 없는 토막을 만나면 **법적 문구에서 흔한
        //    낱말**인지 먼저 보고, 맞으면 거기서 수집을 그만둔다(그 뒤는 전부 본문/고지문).
        var _STOP_WORD = /^(THE|AND|OR|TO|IN|THIS|FOR|ALL|SHALL|IS|ARE|OF|WITH|NOT|IT|ONE|MORE|ITS|UNLESS|OTHERWISE|UNDER|STATE,|FEDERAL,|COUNTRY,|CONFIDENTIAL|PROPRIETARY|SUBSIDIAR(?:Y|IES)|TOLERANCE|TOLERANCES|DIMENSIONS|RECIPIENT|DISCLOSED,|REPRODUCED,)$/;
        var headers = [], vocabHits = 0, guard = 0;
        while (joined && guard++ < 40) {
            var hit = '';
            for (var v = 0; v < vocab.length; v++) {
                if (joined.indexOf(vocab[v]) === 0) { hit = vocab[v]; break; }
            }
            if (hit) { headers.push(hit); vocabHits++; joined = joined.slice(hit.length).trim(); }
            else {                                   // 사전에 없는 말은 한 토막만 떼어 낸다
                var sp = joined.indexOf(' ');
                var tok0 = sp < 0 ? joined : joined.slice(0, sp);
                if (_STOP_WORD.test(tok0)) break;     // 법적 문구로 넘어간 신호 — 여기서 그만
                if (sp < 0) { headers.push(joined); joined = ''; }
                else { headers.push(joined.slice(0, sp)); joined = joined.slice(sp + 1); }
            }
        }
        // ⚠️⚠️ [2026-11-11] 알아본 진짜 열 이름이 2개 미만이거나, 열 개수가 실제 양식(A/B/C,
        //    많아야 10개)보다 훨씬 많으면 — 숫자·BOM 조각·다른 표의 머리글까지 섞여 들어온
        //    신호다(실측 "1590937": 22개, 그중 "1"·"2"·"1564166"·"BKT,"·"ITEM"·"QTY." 등
        //    전혀 다른 표의 글자가 섞여 있었다). 틀린 머리글을 자신있게 보여주느니
        //    "못 읽었다"고 정직하게 빈 표를 돌려준다.
        if (vocabHits < 2 || headers.length > 12) return { headers: [], rows: [] };

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
        // ⚠️ [2026-11-11] Agile REV 칸은 "PN      : K\nREF PN : K" 처럼 라벨+값이 들어 있다
        //    (PN 리비전과 REF PN 리비전을 한 칸에 적어 둔 것) — 라벨 글자까지 한 글자씩 훑으면
        //    P·N·R·E·F 가 리비전으로 잡혀 "표의 REV" 줄이 글자 수프가 된다
        //    (실측: J,J,P,N,K,R,E,F,P,N,K). "PN"/"REF PN" 라벨은 검색(매칭) 대상에서 뺀다.
        // ⚠️⚠️ [2026-11-11 2차] **줄바꿈 기준으로 자르면 안 된다** — 177행 전수 확인(`43건이 라벨을
        //    쓴다`) 중 1건(502633)이 "PN      : G REF PN : G" 처럼 **한 줄에 라벨 둘**이었다. 줄 단위로
        //    자르면 그 줄 전체가 "값"으로 남아 REF PN 라벨이 그대로 다시 새어 들어온다(실측: 고치기
        //    전 G,R,E,F,P,N,G). 그래서 줄이 아니라 **라벨 위치 자체**를 전역으로 찾아, 각 라벨의 값은
        //    "그 라벨 끝 ~ 다음 라벨 시작(또는 문자열 끝)"으로 자른다 — 라벨이 같은 줄에 붙어 있어도 안전.
        var _revTokens = function (raw) {
            var s = String(raw || '');
            var out = [];
            var LABEL_RE = /(?:REF\s*PN1?|PN)\s*:\s*/gi;
            var marks = [], m;
            while ((m = LABEL_RE.exec(s))) marks.push({ labelStart: m.index, valueStart: LABEL_RE.lastIndex });
            if (!marks.length) {
                s.replace(/[A-Z](?:\.\d+)?/g, function (t) { out.push(t.toUpperCase()); return t; });
                return out;
            }
            marks.forEach(function (mk, i) {
                var end = (i + 1 < marks.length) ? marks[i + 1].labelStart : s.length;
                s.slice(mk.valueStart, end).replace(/[A-Z](?:\.\d+)?/g, function (t) { out.push(t.toUpperCase()); return t; });
            });
            return out;
        };
        var mineProd = _revTokens(r.prodRev);
        var mineAgile = _revTokens(r.agileRev);
        var _uniq = function (arr) { var seen = {}, out = []; arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; };
        var _hitIn = function (rv, list) {
            rv = String(rv || '').toUpperCase();
            if (!rv) return false;
            if (list.indexOf(rv) !== -1) return true;
            var m = rv.match(/^([A-Z](?:\.\d+)?)\s*-\s*([A-Z](?:\.\d+)?)$/);   // 범위 칸(G.5-J.4)
            if (!m) return false;
            return list.some(function (x) { return x >= m[1] && x <= m[2]; });
        };
        // 🎨 [2026-11-11] 생산REV 일치(초록)와 Agile REV 일치(주황)를 **다른 색**으로 구분한다 —
        //    어느 칸 때문에 이 리비전이 "우리 것"으로 잡혔는지 구분해 달라는 요청. 둘 다면 보라.
        var HIT = {
            prod:  { bg: '#eefbf1', fg: '#2b7a45' },
            agile: { bg: '#fff4e6', fg: '#e8590c' },
            both:  { bg: '#f3ebfc', fg: '#6f42c1' }
        };
        var matchKind = function (rv) {
            var p = _hitIn(rv, mineProd), a = _hitIn(rv, mineAgile);
            return p && a ? 'both' : (p ? 'prod' : (a ? 'agile' : ''));
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
                  var kind = matchKind(x.rev), st = HIT[kind];
                  return '<tr style="border-bottom:1px solid #f1f3f5;' + (st ? ' background:' + st.bg + ';' : '') + '">'
                       + '<td style="padding:4px 6px; font-weight:bold; color:' + (st ? st.fg : '#1971c2') + '; white-space:nowrap;">'
                       + _esc(x.rev) + (st ? ' ◀' : '') + '</td>'
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
                  var kind = matchKind(row[0]), st = HIT[kind];
                  var ktk = /KORTEK/i.test(row.join(' '));
                  return '<tr style="border-bottom:1px solid #f1f3f5;' + (st && ktk ? ' background:' + st.bg + ';' : (ktk ? ' background:#fcfdff;' : '')) + '">'
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
          + (mineProd.length ? '<span style="color:' + HIT.prod.fg + ';">◀ ' + _t('생산REV: ', 'Prod. REV: ') + _esc(_uniq(mineProd).join(', ')) + '</span>' : '')
          + (mineAgile.length ? '<span style="color:' + HIT.agile.fg + ';">◀ ' + _t('Agile REV: ', 'Agile REV: ') + _esc(_uniq(mineAgile).join(', ')) + '</span>' : '')
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
              ? _plBtn('success', '✅ ' + _t('최신 REV(', 'Use latest REV (') + _esc(revs[revs.length - 1].rev) + _t(')를 이 행에 넣기', ') for this row'), 'window.plUseLatestRev()')
              : '')
          + _plBtn('primary', '📜 ' + _t('도면 열기', 'Open drawing'), 'window._dsOpenInNewTab(\'' + NAS_FOLDER + '\',\'' + _esc(pick) + '\')')
          + _plBtn('neutral', '📁 ' + _t('문서함', 'Documents'), 'window.plOpenDocBox(\'' + id + '\')')
          + '<span style="margin-left:auto;">' + _plBtn('close', _t('닫기', 'Close'), 'window.plClosePopup()') + '</span>'
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
        _popup('📜 ' + _esc(r.ktkPn || '-') + ' <span style="font-weight:normal; color:#555;">' + _esc(r.desc || '') + '</span>',
            '<div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">'
          + _plBtn('primary', '📎 ' + _t('문서함', 'Documents'), 'window.plOpenDocBox(\'' + id + '\')')
          + _plBtn('primary', '🏭 SAP', 'window.plOpenPnMenu(\'' + id + '\')')
          + _plBtn('primary', '📑 ' + _t('복제', 'Duplicate'), 'window.plDuplicateRow(\'' + id + '\')')
          + _plBtn('danger', '🗑️ ' + _t('삭제', 'Delete'), 'window.plDeleteRow(\'' + id + '\')')
          + '</div>' + html, true);
    };
    window.plCloseDetail = function () { window.plClosePopup(); };

    // ──────────────────────────────────────────────────────────────────────────
    // 11. 엑셀 불러오기 — 사내 "제품 SPEC" 시트를 그대로 받는다.
    //     머리글을 읽어 열을 맞추므로 열 순서가 달라도 따라간다(한/영 둘 다).
    //     ⚠️ [2026-11-11] 로컬 파일 선택창(옛 plImportExcel)은 "📂 불러오기"가 NAS 창을
    //        바로 여는 것으로 바뀌면서(plOpenNas) 호출하는 곳이 없어져 삭제했다 — NAS 의
    //        엑셀/CSV 선택이 같은 _plApplyWorkbook 으로 들어간다(plNasPick ②).
    // ──────────────────────────────────────────────────────────────────────────
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

    /** 📥 [2026-11-12 사용자 요청] 로컬 엑셀을 **페이지 아무 데나 끌어다 놓아** 바로 불러오기 —
     *  담당자가 본인 PC 에서 계속 쓰던 파일을 완료하면 NAS 업로드 단계 없이 곧장 등록한다
     *  (NAS 에 올리는 건 이후 자동 저장이 알아서 한다 — _persist() → plSaveToNasJson).
     *  ⚠️ 전역 드롭(js/04f, 프로젝트 엑셀 통째 불러오기)으로 새지 않게 stopPropagation 필수. */
    window.plDropImport = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        var zone = document.getElementById('pl-drop-zone');
        if (zone) zone.style.outline = 'none';
        var files = ev.dataTransfer && ev.dataTransfer.files ? Array.prototype.slice.call(ev.dataTransfer.files) : [];
        if (!files.length) return;
        var f = files[0];
        if (window._docIsWorkbook && !window._docIsWorkbook(f.name)) {
            _toast('⚠️ ' + _t('"' + f.name + '" 은(는) 엑셀이 아닙니다 — .xlsx/.xls/.csv 파일을 끌어다 놓아주세요.',
                              '"' + f.name + '" is not an Excel file — drop an .xlsx/.xls/.csv file.'), 'error', 7000);
            return;
        }
        _toast('📥 ' + _esc(f.name) + _t(' 불러오는 중…', ' loading…'), 'info');
        f.arrayBuffer().then(function (buf) { window._plApplyWorkbook(buf, f.name); })
            .catch(function (e) { _toast('⚠️ ' + (e && e.message ? e.message : e), 'error', 7000); });
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
    window.plOpenNas = function (drawingsFirst) {
        if (!window._dsOpenPicker) {
            _toast('⚠️ ' + _t('문서 저장소를 불러오지 못했습니다(백엔드 확인).', 'Document store unavailable (check the backend).'), 'error');
            return;
        }
        // ⚠️ "📂 불러오기"(목록 불러오기)와 "📁 NAS"(고객 도면)가 **같은 창**을 공유한다 —
        //    시작 탭만 다르다(사용자 요청: 불러오기=목록·백업, NAS=고객 도면 먼저 보이게).
        window._dsOpenPicker({
            folder: drawingsFirst ? NAS_FOLDER : NAS_DATA_FOLDER,
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
            await window.plOpenRevisions(row._id, name);
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
    // 11-2. 🔍 정보 확인 — 이 행의 값이 그 프로젝트(Gantt) 파일의 Summary·Customer SPEC 과
    //       다른지 찾아 보여준다(2026-11-11 사용자 요청, 2026-11-12 사용자 피드백으로 재설계).
    //   - 어느 프로젝트 파일인지는 **이 행이 들고 있지 않다** — CUSTOMER+CABINET 으로
    //     project_index.json 항목(의 파일명 모델 조각)과 맞춰 찾는다(`_plNameHit`, 양방향 포함 검사).
    //   - ⚠️ [2026-11-12] **전체를 한 번에 훑지 않는다** — 기본은 **지금 열린 프로젝트** 하나만
    //     비교하고, 필요하면 팝업의 드롭다운으로 다른 프로젝트를 고른다(`plCheckAgainstProjects(fileName)`).
    //   - 담당자는 `projectMeta.<역할>담당자`(js/66 DOC_MEMBER_ROLES 와 같은 자리). ⚠️ "회로담당(PM)"
    //     은 **PM(프로젝트담당자) + HW담당자를 합친 값**과 비교한다(사용자 지시 — 열 이름 자체가
    //     '회로담당(PM)'인 이유).
    //   - Customer SPEC(`tabData.briefSpec`/`briefSpecByUnit`)은 **항목 이름을 지어내지 않는다**
    //     (docs/project-list.md 경고 — 추측한 항목명은 전부 0건으로 떨어진 적 있다). 아래 표는
    //     실제 프로젝트 파일 5개를 열어 **실측한 TYPE 문자열**만 쓴다(정확히 같은 글자로 비교).
    // ──────────────────────────────────────────────────────────────────────────
    // ⚠️ [2026-11-12 실측] 대소문자만 다른 값("2560x1440" vs "2560 X 1440")이 "다르다"로 떴다 —
    //    소문자로도 맞춰야 한다(공백 제거만으론 부족).
    var _plCheckNorm = function (v) { return String(v == null ? '' : v).replace(/\s+/g, '').trim().toLowerCase(); };
    // "해당없음"을 적는 관례 — 칸마다 X 를 쓰기도, -를 쓰기도 한다(실측).
    var _PL_CHECK_BLANK_RE = /^(x|-|n\/a|none|없음|해당없음)$/i;
    /** Customer SPEC TYPE(실측 고정 문자열, 지어내지 않음) → Project list 열 매핑. */
    var PL_CHECK_SPEC_FIELDS = [
        { plKey: 'panel',       specType: 'Panel' },
        { plKey: 'resolution',  specType: 'Native Resolution' },
        { plKey: 'colorTemp',   specType: 'Color Temperature(K)' },
        { plKey: 'uniformity',  specType: 'Uniformity(%)' },
        { plKey: 'colorGamut',  specType: 'Color Gamut' },
        { plKey: 'ledLighting', specType: 'LED Lighting' },
        { plKey: 'adbd',        specType: 'AD Board' },
        { plKey: 'glassThk',    specType: 'Thickness of Glass' },
        { plKey: 'inputSignal', specType: 'Video input' },
        { plKey: 'luminance',   specType: 'Brightness(Centre. Min)' }
        // ⚠️ [2026-11-12 실측] 뺀 항목 — 비교해 봤더니 단위·관례가 달라 **값이 같아도 항상 달라 보였다**:
        //  power1('POWER RATING')은 PL 이 "24V=2.0A"(전압×전류), 파일은 "51W"(계산된 전력)라 단위가
        //  다른 표기일 뿐이라 정규화로 못 맞춘다. radius·enclosure 는 PL 이 "X"(해당없음 표시 관례)를
        //  자주 쓰는데 파일 쪽은 "Flat / Landscape"/"Open frame" 같은 서술형이라 비교할수록 소음만 늘었다.
    ];
    /** briefSpec 행에서 TYPE 이 **정확히 같은** 첫 항목의 값칸을 — 느슨한 접두어 매칭은 실제 TYPE
     *  이 "Native Resolution"처럼 수식어가 붙어 있어 조용히 0건으로 떨어뜨린 적이 있다(실측). */
    var _plCheckSpecValue = function (bs, exactType) {
        if (!Array.isArray(bs)) return '';
        var want = String(exactType).trim().toLowerCase();
        for (var i = 0; i < bs.length; i++) {
            var t = String((bs[i] && bs[i].type) || '').trim().toLowerCase();
            if (t === want) return String((bs[i] && bs[i].modelA) || '').trim();
        }
        return '';
    };
    var _plCheckBriefSpecOf = function (d) {
        var td = d.tabData || {};
        if (Array.isArray(td.briefSpec) && td.briefSpec.length) return td.briefSpec;
        var byUnit = td.briefSpecByUnit;
        if (byUnit && typeof byUnit === 'object') {
            var vals = Object.keys(byUnit).map(function (k) { return byUnit[k]; }).filter(function (v) { return Array.isArray(v) && v.length; });
            if (vals.length) return vals[0];
        }
        return [];
    };

    /** 프로젝트 파일명(`고객_모델_인치.json`)에서 **모델 조각**만 뺀다 — project_index.json 의
     *  `model` 필드(=Summary '모델명')는 사람이 PN 을 적기도 해 믿을 수 없지만(실측: STELLAR32
     *  프로젝트의 모델명이 "1641445-ALT1"), **파일명**은 항상 이 규칙으로 조립된다(js/04k). */
    var _plFileModelOf = function (fileName) {
        var base = String(fileName || '').replace(/\.json$/i, '');
        var parts = base.split('_');
        if (parts.length < 2) return base;
        var last = parts[parts.length - 1];
        if (/^\d+(\.\d+)?$/.test(last)) parts.pop(); // 끝 조각이 인치 숫자면 뺀다
        return parts.slice(1).join('_');
    };

    var PL_CHECK_TITLE = function () { return '🔍 ' + _t('프로젝트 파일과 다른 값', 'Differences from the project file'); };
    var _plCheckSameNames = function (a, b) {
        var split = function (v) { return String(v).split(/[,\/\s]+/).map(function (x) { return x.trim(); }).filter(Boolean).sort(); };
        var A = split(a), B = split(b);
        return A.length === B.length && A.every(function (x, i) { return x === B[i]; });
    };
    var _plCheckMergeNames = function () {
        var out = [];
        for (var i = 0; i < arguments.length; i++) {
            String(arguments[i] || '').split(/[,\/\s]+/).forEach(function (x) { x = x.trim(); if (x && out.indexOf(x) === -1) out.push(x); });
        }
        return out.sort().join(',');
    };

    // ⚠️⚠️ [2026-11-12 사용자 요청] "차이점을 모달에서 바로 수정" — 적용 버튼은 **값을 그대로
    //    onclick 문자열에 넣지 않는다**(담당자·사양 값엔 따옴표·쉼표·슬래시가 섞여 있어 그대로
    //    박으면 깨지거나 주입 위험이 있다). 대신 번호(`data-check-id`)만 버튼에 싣고, 진짜 값은
    //    `window._plCheckPending` 맵에 **메모리로만** 들고 있다가 위임 클릭에서 찾아 쓴다.
    window._plCheckPending = window._plCheckPending || {};
    window._plCheckIdSeq = window._plCheckIdSeq || 0;
    if (!window._plCheckApplyBound) {
        window._plCheckApplyBound = true;
        // ⚠️⚠️ [2026-11-12 실측] `_popup()`의 `box.onclick = stopPropagation`이 버블 단계에서
        //    이벤트를 막아, document 의 **버블(기본) 리스너는 절대 안 불린다**(실측으로 확인 —
        //    버튼을 눌러도 호출이 0회). **캡처 단계**(세 번째 인자 true)로 붙여야 그 전에 먼저 본다.
        document.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('.pl-check-apply') : null;
            if (!btn) return;
            var item = window._plCheckPending[btn.getAttribute('data-check-id')];
            if (!item) return;
            window._plCheckApplyField(item.rowId, item.plKey, item.newVal, item.fileName);
        }, true);
    }
    /** 차이 한 줄을 Project list 쪽에 적용 — 프로젝트 파일 값을 그대로 그 행의 칸에 써 넣는다. */
    window._plCheckApplyField = function (rowId, plKey, newVal, fileName) {
        var r = _rowById(rowId); if (!r) return;
        var before = r[plKey] == null ? '' : String(r[plKey]);
        if (before === newVal) return;
        r[plKey] = newVal;
        _plPushHistory(r, plKey, before, newVal);
        _persist(); window.plRender();
        var col = _colByKey[plKey];
        _toast('✅ ' + _t('적용했습니다: ', 'Applied: ') + (col ? (window._currentLang === 'en' ? col.en : col.ko) : plKey) + ' → ' + newVal, 'success', 4000);
        window.plCheckAgainstProjects(fileName); // 모달을 새 값 기준으로 다시 그린다(그 줄은 이제 같아져 사라진다)
    };

    window.plCheckAgainstProjects = async function (fileNameOverride) {
        if (typeof window._msLoadProjectIndex !== 'function' || !window.nasAppFile || !window.nasAppFile.get) {
            _toast('⚠️ ' + _t('프로젝트 파일 조회 기능을 불러오지 못했습니다.', 'Could not load project-file lookup.'), 'error');
            return;
        }
        window._plCheckPending = {}; // 다시 그릴 때마다 비운다 — 번호가 옛 값을 가리키지 않게
        var team = _team();
        var idx;
        try { idx = await window._msLoadProjectIndex(); } catch (e) { idx = []; }
        // ⚠️ [2026-11-11 실측] Project List 의 `project`(G2111OB 같은 사내 관리번호)는 프로젝트
        //    파일 어디에도 없다 — 실제로 겹치는 건 **CABINET**과 파일명의 모델 조각뿐이라 그걸로 맞춘다.
        var mine = (idx || []).filter(function (p) { return p && p.file_name && (!team || String(p.team || '').trim() === team); })
            .map(function (p) { return Object.assign({}, p, { _fileModel: _plFileModelOf(p.file_name) }); })
            .filter(function (p) { return p._fileModel; });
        if (!mine.length) { _toast('⚠️ ' + _t('이 팀의 프로젝트 파일을 찾지 못했습니다.', 'No project files found for this team.'), 'warning'); return; }

        // 기본값: **지금 열린 프로젝트**(2026-11-12 사용자 요청) — id 로 찾는다(이름은 바뀔 수 있다,
        //  js/59 와 같은 방법). 없으면 첫 번째 프로젝트, 드롭다운으로 바꿀 수 있다.
        var openId = String(window.currentDriveFileId || '').trim();
        var target = null;
        if (fileNameOverride) target = mine.filter(function (p) { return p.file_name === fileNameOverride; })[0] || null;
        if (!target && openId) target = mine.filter(function (p) { return String(p.drive_file_id || '').trim() === openId; })[0] || null;
        if (!target) target = mine[0];

        var optionsHtml = mine.map(function (p) {
            var label = String(p.file_name).replace(/\.json$/i, '');
            return '<option value="' + _esc(p.file_name) + '"' + (p.file_name === target.file_name ? ' selected' : '') + '>' + _esc(label) + '</option>';
        }).join('');
        var pickerHtml = '<div style="margin-bottom:10px; display:flex; align-items:center; gap:6px;">'
            + '<span style="font-size:11.5px; color:#567; white-space:nowrap;">' + _t('비교 대상 프로젝트', 'Compare against') + '</span>'
            + '<select onchange="window.plCheckAgainstProjects(this.value)" style="flex:1; padding:4px 6px; border:1px solid #cfe3e5; border-radius:5px; font-size:12px;">' + optionsHtml + '</select></div>';

        _popup(PL_CHECK_TITLE(), pickerHtml + '<div style="color:#888; padding:6px 0;">⏳ ' + _t('불러오는 중…', 'Loading…') + '</div>', true);

        var rel = (target.team ? target.team + '/' : '') + target.file_name;
        var d = null;
        try { d = await window.nasAppFile.get(rel, { json: true }); } catch (e) { d = null; }
        if (!d && window._storageRelOfId && target.drive_file_id) {
            var liveRel = window._storageRelOfId(target.drive_file_id);
            if (liveRel) { try { d = await window.nasAppFile.get(liveRel, { json: true }); } catch (e2) { d = null; } }
        }
        if (!d) {
            _popup(PL_CHECK_TITLE(), pickerHtml + '<div style="color:#b1432f; padding:6px 0;">⚠️ ' + _t('프로젝트 파일을 읽지 못했습니다.', 'Could not read the project file.') + '</div>', true);
            return;
        }

        // 이 프로젝트의 CUSTOMER+CABINET 에 맞는 Project list 행만. 같은 CABINET 에 인치가 다른
        // 행이 섞여 있으면(실측: SHUFFLER 3"/4.3") 가능하면 인치로 좁힌다.
        var allRows = (D().rows || []).filter(function (r) { return String(r.customer || '').trim() && String(r.cabinet || '').trim(); });
        var rows = allRows.filter(function (r) {
            return (window._plNameHit(target.customer || '', r.customer) || window._plNameHit(r.customer, target.customer || ''))
                && (window._plNameHit(target._fileModel, r.cabinet) || window._plNameHit(r.cabinet, target._fileModel));
        });
        if (rows.length > 1 && target.inch) {
            var inchWanted = _plCheckNorm(target.inch);
            var narrowed = rows.filter(function (r) { return _plCheckNorm(r.panelInch || r.cuttingInch || '') === inchWanted; });
            if (narrowed.length) rows = narrowed;
        }

        var pm = d.projectMeta || {};
        var bs = _plCheckBriefSpecOf(d);
        var mism = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var diffs = [];
            // ⚠️ [2026-11-12 사용자 요청] "모달에서 바로 수정" — 어느 열(plKey)의 차이인지도 같이
            //    담아 둔다. 담당자 합산 비교(예: 회로=PM+HW)는 **합친 값**을 그대로 적용하면 뜻이
            //    바뀌므로 적용 버튼을 안 둔다(plKey 를 안 주면 적용 버튼이 안 생긴다).
            var cmp = function (plVal, projVal, label, sameFn, plKey) {
                plVal = String(plVal == null ? '' : plVal).trim();
                projVal = String(projVal == null ? '' : projVal).trim();
                if (!plVal || !projVal) return;           // 둘 중 하나가 비어 있으면 "다르다"고 안 한다 — 미입력일 뿐
                // ⚠️ [2026-11-12 실측] "해당없음"을 적는 관례가 칸마다 다르다("X" vs "-") — 둘 다
                //  그런 표시일 땐 글자가 달라도 다른 값으로 치지 않는다(둘 다 실제 값이 없다는 뜻).
                if (_PL_CHECK_BLANK_RE.test(plVal) && _PL_CHECK_BLANK_RE.test(projVal)) return;
                if (sameFn ? sameFn(plVal, projVal) : _plCheckNorm(plVal) === _plCheckNorm(projVal)) return;
                diffs.push({ label: label, pl: plVal, proj: projVal, plKey: plKey });
            };
            // CUSTOMER — 파일은 "고객사>프로젝트명" 복합값일 수 있다(예: "LNW>OBSIDIAN27_DB").
            //  Project list 의 "LNW"가 그 안에 들어 있으면 같은 값이지 다른 값이 아니다. 복합값을
            //  그대로 적용하면 틀린 값이 되므로 적용 버튼은 안 둔다(plKey 생략).
            cmp(r.customer, pm.고객사, _t('CUSTOMER', 'CUSTOMER'), function (a, b) {
                return window._plNameHit(a, b) || window._plNameHit(b, a);
            });
            // 담당자 — 쉼표로 여러 명을 적는데 **순서가 사람마다 다르다**(실측: "A,B,C" vs "B,A,C"
            //  같은 세 명). 순서가 아니라 **누가 있나**로 비교한다.
            // 🔧 [2026-11-12] "회로담당(PM)"은 PM(프로젝트담당자)+HW담당자를 합친 값과 비교한다 —
            //  적용 버튼은 **합친 값 그대로** 넣는다(그게 이 칸이 뜻하는 값이다).
            cmp(r.ownerHw, _plCheckMergeNames(pm.프로젝트담당자, pm.HW담당자), _t('회로담당(PM)', 'HW owner (PM)'), _plCheckSameNames, 'ownerHw');
            cmp(r.ownerFw, pm.FW담당자, _t('펌웨어담당', 'FW owner'), _plCheckSameNames, 'ownerFw');
            cmp(r.ownerMech, pm.기구담당자, _t('기구담당', 'Mech owner'), _plCheckSameNames, 'ownerMech');
            cmp(r.ownerTouch, pm.TSP담당자, _t('터치담당', 'Touch owner'), _plCheckSameNames, 'ownerTouch');
            // Customer SPEC — 실측 TYPE 과 정확히 같은 항목만(PL_CHECK_SPEC_FIELDS).
            PL_CHECK_SPEC_FIELDS.forEach(function (f) {
                var val = _plCheckSpecValue(bs, f.specType);
                var col = _colByKey[f.plKey];
                if (val) cmp(r[f.plKey], val, _t(col ? col.ko : f.plKey, col ? col.en : f.plKey) + ' (' + f.specType + ')', null, f.plKey);
            });
            // Color coordinate(x/y) — 한 항목에 x/y 가 같이 들어 있어 쪼개야 한다(docs/project-list.md 경고).
            var coord = _plCheckSpecValue(bs, 'Color coordinate(x/y)');
            if (coord) {
                var cParts = coord.split('/').map(function (s) { return s.trim(); });
                if (cParts.length === 2) {
                    cmp(r.cieX, cParts[0], 'x (Color coordinate(x/y))', null, 'cieX');
                    cmp(r.cieY, cParts[1], 'y (Color coordinate(x/y))', null, 'cieY');
                }
            }
            if (diffs.length) mism.push({ row: r, diffs: diffs });
        }

        var body = pickerHtml;
        if (!rows.length) {
            body += '<div style="color:#888; padding:10px 0;">⚠️ ' + _t('이 프로젝트와 일치하는 CUSTOMER·CABINET 행이 Project list 에 없습니다.', 'No Project list rows match this project\'s CUSTOMER/CABINET.') + '</div>';
        } else if (!mism.length) {
            body += '<div style="color:#2e7d32; padding:10px 0;">✅ ' + _t('비교한 ', 'Compared ') + rows.length + _t('건 중 다른 값이 없습니다.', ' rows — no differences found.') + '</div>';
        } else {
            body += '<table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:11.5px;">'
                 + '<colgroup><col style="width:38px"><col style="width:170px"><col><col><col style="width:56px"></colgroup>'
                 + '<tr style="background:#f1f6f7;"><th style="padding:5px 6px; text-align:left; border-bottom:1px solid #d7e4e6;">No</th>'
                 + '<th style="padding:5px 6px; text-align:left; border-bottom:1px solid #d7e4e6;">' + _t('항목', 'Field') + '</th>'
                 + '<th style="padding:5px 6px; text-align:left; border-bottom:1px solid #d7e4e6;">Project list</th>'
                 + '<th style="padding:5px 6px; text-align:left; border-bottom:1px solid #d7e4e6;">' + _t('프로젝트 파일', 'Project file') + '</th>'
                 + '<th style="padding:5px 6px; border-bottom:1px solid #d7e4e6;"></th></tr>'
                 + mism.map(function (m) {
                     return m.diffs.map(function (df, di) {
                         var applyCell;
                         if (df.plKey) {
                             var cid = 'c' + (++window._plCheckIdSeq);
                             window._plCheckPending[cid] = { rowId: m.row._id, plKey: df.plKey, newVal: df.proj, fileName: target.file_name };
                             applyCell = '<td style="padding:5px 6px; text-align:center;"><button class="pl-check-apply" data-check-id="' + cid + '"'
                                       + ' title="' + _esc(_t('이 값을 Project list 에 적용', 'Apply this value to Project list')) + '"'
                                       + ' style="padding:3px 8px; border-radius:5px; font-size:11px; ' + PL_BTN_ROLE.primary + ' cursor:pointer;">➡️ ' + _t('적용', 'Apply') + '</button></td>';
                         } else {
                             applyCell = '<td></td>';
                         }
                         return '<tr style="border-bottom:1px solid #eef3f4;">'
                              + (di === 0 ? '<td style="padding:5px 6px; cursor:pointer; color:#00707d; text-decoration:underline; word-break:break-all;" onclick="window.plClosePopup(); window.plOpenDetail(\'' + m.row._id + '\')" rowspan="' + m.diffs.length + '">' + _esc(m.row.no || '') + '</td>' : '')
                              + '<td style="padding:5px 6px; word-break:break-word;">' + _esc(df.label) + '</td>'
                              + '<td style="padding:5px 6px; word-break:break-word;">' + _esc(df.pl) + '</td>'
                              + '<td style="padding:5px 6px; color:#b1432f; word-break:break-word;">' + _esc(df.proj) + '</td>'
                              + applyCell + '</tr>';
                     }).join('');
                 }).join('')
                 + '</table>'
                 + '<div style="color:#888; font-size:11px; margin-top:8px;">' + _t('비교 ', 'Compared ') + rows.length + _t('건 · 다른 값 ', ' rows · differences ') + mism.length + _t('건', ' rows') + '</div>';
        }
        _popup(PL_CHECK_TITLE(), body, true);
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
                // 🧹 옛 도면분석 칸 정리 — 어느 경로로 들어온 자료든(NAS·Drive·로컬 캐시) 한 번 훑는다.
                try { window._plPurgeDwgFields(); } catch (e) { console.warn('[Project list] dwg 정리 실패:', e && e.message); }
                await window.plRefreshDocCache(true);                   // 📜 배지용 NAS 파일 목록
                window.plRenderIfStale();
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
        window.plRenderIfStale();        // ⚡ 바뀐 게 없으면 그대로 둔다 — 표를 다시 만들면 150ms 가 든다
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
