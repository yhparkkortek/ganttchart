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
        //   ⚠️ [2026-11-24 사용자 결정] **BOM 이 실제 정보** — BOM → 이 모델 카드 주요자재 → Project list 순서.
        //      실측: Project list 는 AD 보드를 다른 보드로, 주요자재는 패널 끝 글자를 다르게, 터치 없는 모델 카드엔
        //      복사된 터치 컨트롤러를 들고 있었다. BOM 은 셋 다 원본 사양서와 맞았다.
        'parts.r1.c1': ['bom:PANEL', 'umat:PANEL', 'pl:panel'],
        'parts.r1.c2': ['const:-'],
        'parts.r1.c3': ['pl:panelMfr', 'panel:Panel Brand'],
        'parts.r2.c1': ['bom:AD BOARD', 'umat:AD BOARD', 'pl:adbd'],
        'parts.r2.c2': ['pl:adFw', SPEC.fw],
        'parts.r2.c3': ['adbd:Brand'],
        'parts.r3.c1': ['bom:CONVERTER', 'umat:CONVERTER', 'pl:bluDriver'],
        'parts.r3.c2': ['const:-'],
        'parts.r3.c3': ['conv:Brand'],
        'parts.r4.c1': ['fn:touchPart:TSP/GLASS:tsp'],
        'parts.r4.c2': ['const:-'],
        'parts.r5.c1': ['fn:touchPart:TOUCH CTRL:touchCtrl'],
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
        // [2026-11-24] 전원 소비·커넥터 — Customer SPEC 'Power estimation'(LCD Monitor 줄)·'Input voltage' 의 '/' 뒤
        //   (실측: 'DC 24V / <제조사> 6P_<품번>' → 원본 사양서 '<제조사> <품번>' 과 글자까지 같았다)
        pwrConsumption: ['fn:pwrCons'],
        pwrConnPn: ['fn:pwrConn'],
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
        'scr.r14.c1': [SPEC.uni, 'pl:uniformity', 'panel:White Variation (Max/Min)'],
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
        'tglass.r1.c2': ['pl:glassType'], 'tglass.r2.c2': ['pl:airGap'],
        // 🧾 A/D Board connection 표 — BOM 에서 A/D 보드 바로 아래 커넥터(설치지점·품번·제조사). 설명 칸은 BOM 에 없다.
        'adc.r1.c0': ['fn:adc:1:0'], 'adc.r1.c2': ['fn:adc:1:2'], 'adc.r1.c3': ['fn:adc:1:3'],
        'adc.r2.c0': ['fn:adc:2:0'], 'adc.r2.c2': ['fn:adc:2:2'], 'adc.r2.c3': ['fn:adc:2:3'],
        'adc.r3.c0': ['fn:adc:3:0'], 'adc.r3.c2': ['fn:adc:3:2'], 'adc.r3.c3': ['fn:adc:3:3'],
        'adc.r4.c0': ['fn:adc:4:0'], 'adc.r4.c2': ['fn:adc:4:2'], 'adc.r4.c3': ['fn:adc:4:3'],
        'adc.r5.c0': ['fn:adc:5:0'], 'adc.r5.c2': ['fn:adc:5:2'], 'adc.r5.c3': ['fn:adc:5:3'],
        'adc.r6.c0': ['fn:adc:6:0'], 'adc.r6.c2': ['fn:adc:6:2'], 'adc.r6.c3': ['fn:adc:6:3'],
        'adc.r7.c0': ['fn:adc:7:0'], 'adc.r7.c2': ['fn:adc:7:2'], 'adc.r7.c3': ['fn:adc:7:3'],
        'adc.r8.c0': ['fn:adc:8:0'], 'adc.r8.c2': ['fn:adc:8:2'], 'adc.r8.c3': ['fn:adc:8:3'],
        'adc.r9.c0': ['fn:adc:9:0'], 'adc.r9.c2': ['fn:adc:9:2'], 'adc.r9.c3': ['fn:adc:9:3'],
        'adc.r10.c0': ['fn:adc:10:0'], 'adc.r10.c2': ['fn:adc:10:2'], 'adc.r10.c3': ['fn:adc:10:3'],
        // [2026-11-24] PARTS 에서 더 가져오는 것 — 실측으로 원본 사양서 값과 맞는지 확인한 칸만
        'tpwr.r1.c2': ['fn:atSplit:Input Voltage:0'],          // '5V @150mA' → 5V
        'tpwr.r2.c2': ['fn:atSplit:Input Voltage:1'],          //              → 150mA
        'tgen.r4.c2': ['fn:ctrlId'],                           // 'Kortek / <품목 코드>'
        // BLU — 라이브러리 값에 적힌 '(Typ.)'·'(Max.)' 표시로 칸을 고른다(표시 없는 전압·전력은 칸이 모호해 안 넣는다,
        //   전류는 예전처럼 표시가 없으면 Typ). 실측: 'Lamps Power Consumption 26.5W (Typ.)' = 원본 Typ 칸 26.5
        'blu.r2.c2': ['fn:lampLbl:Lamp Current:min'], 'blu.r2.c3': ['fn:lampLbl:Lamp Current:typ:typ'], 'blu.r2.c4': ['fn:lampLbl:Lamp Current:max'],
        'blu.r3.c2': ['fn:lampLbl:Lamp Voltage:min'], 'blu.r3.c3': ['fn:lampLbl:Lamp Voltage:typ'], 'blu.r3.c4': ['fn:lampLbl:Lamp Voltage:max'],
        'blu.r4.c2': ['fn:lampLbl:Lamps Power Consumption|BLU Power Consumption:min'],
        'blu.r4.c3': ['fn:lampLbl:Lamps Power Consumption|BLU Power Consumption:typ'],
        'blu.r4.c4': ['fn:lampLbl:Lamps Power Consumption|BLU Power Consumption:max'],
        // A/D connection Description — AD BD 라이브러리 커넥터 칸('<품번> (<이름>) / N Pin')의 괄호가 설치지점이 아니면
        //   그게 이름이다(실측: 출력 커넥터 'LVDS_OUT 1' 이 원본 Description 과 같았다). 설치지점(J1)뿐이면 비운다.
        'adc.r1.c1': ['fn:adcDesc:1'],
        'adc.r2.c1': ['fn:adcDesc:2'],
        'adc.r3.c1': ['fn:adcDesc:3'],
        'adc.r4.c1': ['fn:adcDesc:4'],
        'adc.r5.c1': ['fn:adcDesc:5'],
        'adc.r6.c1': ['fn:adcDesc:6'],
        'adc.r7.c1': ['fn:adcDesc:7'],
        'adc.r8.c1': ['fn:adcDesc:8'],
        'adc.r9.c1': ['fn:adcDesc:9'],
        'adc.r10.c1': ['fn:adcDesc:10'],
        // 컨버터 커넥터 문장 — BOM 의 설치지점·품번·제조사('J1 : <품번> (<제조사>)', 원본 모양 그대로).
        //   어느 쪽이 입력/출력인지는 PARTS 라이브러리의 입력/출력 커넥터 품번과 맞춰 가린다. 없으면 라이브러리 모델명만.
        convIn: ['fn:convConn:in:Input Connector (Model/Pins)', 'fn:connModel:Input Connector (Model/Pins)'],
        convOut: ['fn:convConn:out:Output Connector (Model/Pins/Qty)', 'fn:connModel:Output Connector (Model/Pins/Qty)']
    };
    // 🕒 Supply Video Timing Chart(15줄 × 6열) — 전부 'fn:tim:<줄>:<열>' 로. 열 구성은 PS_TIMING_COLS, 값은 PS_STD_TIMINGS(데이터)
    (function () {
        for (var tr = 0; tr <= 14; tr++) for (var tc = 1; tc <= 6; tc++) {
            var tk = 'tim.r' + tr + '.c' + tc;
            if (!window.PS_AUTO[tk]) window.PS_AUTO[tk] = ['fn:tim:' + tr + ':' + tc];
        }
    })();
    // 🕒 표준 타이밍(데이터) — 'WxH@Hz' → 규격·도트클럭(MHz)·H(활성/싱크시작/싱크끝/전체)·V(〃)·극성.
    //   ⚠️ 실제 제품 EDID(스케일러 펌웨어)는 표준과 몇 값이 다를 수 있다 — 실측(2026-11-24, 32" QHD 원본 사양서):
    //   800x600·1024x768 은 DMT 와 글자까지 같고, 나머지 넷은 V Total·싱크 자리·극성이 몇 개 달랐다.
    //   그래서 출처에 '표준값'임을 밝히고, 실제 값은 사람이 고치거나 기존 사양서를 불러온다.
    window.PS_STD_TIMINGS = window.PS_STD_TIMINGS || {
        '640x480@60':   { std: 'VESA DMT', clk: '25.175', h: [640, 656, 752, 800], v: [480, 490, 492, 525], hp: '-', vp: '-' },
        '800x600@60':   { std: 'VESA DMT', clk: '40', h: [800, 840, 968, 1056], v: [600, 601, 605, 628], hp: '+', vp: '+' },
        '1024x768@60':  { std: 'VESA DMT', clk: '65', h: [1024, 1048, 1184, 1344], v: [768, 771, 777, 806], hp: '-', vp: '-' },
        '1280x720@60':  { std: 'VESA CVT', clk: '74.5', h: [1280, 1344, 1472, 1664], v: [720, 723, 728, 748], hp: '-', vp: '+' },
        '1280x800@60':  { std: 'VESA DMT (CVT)', clk: '83.5', h: [1280, 1352, 1480, 1680], v: [800, 803, 809, 831], hp: '-', vp: '+' },
        '1280x1024@60': { std: 'VESA DMT', clk: '108', h: [1280, 1328, 1440, 1688], v: [1024, 1025, 1028, 1066], hp: '+', vp: '+' },
        '1366x768@60':  { std: 'VESA DMT', clk: '85.5', h: [1366, 1436, 1579, 1792], v: [768, 771, 774, 798], hp: '+', vp: '+' },
        '1440x900@60':  { std: 'VESA DMT (CVT)', clk: '106.5', h: [1440, 1520, 1672, 1904], v: [900, 903, 909, 934], hp: '-', vp: '+' },
        '1600x900@60':  { std: 'VESA DMT (RB)', clk: '108', h: [1600, 1624, 1704, 1800], v: [900, 901, 904, 1000], hp: '+', vp: '+' },
        '1680x1050@60': { std: 'VESA DMT (CVT)', clk: '146.25', h: [1680, 1784, 1960, 2240], v: [1050, 1053, 1059, 1089], hp: '-', vp: '+' },
        '1920x1080@60': { std: 'CTA-861 (VIC 16)', clk: '148.5', h: [1920, 2008, 2052, 2200], v: [1080, 1084, 1089, 1125], hp: '+', vp: '+' },
        '1920x1200@60': { std: 'VESA DMT (RB)', clk: '154', h: [1920, 1968, 2000, 2080], v: [1200, 1203, 1209, 1235], hp: '+', vp: '-' },
        '2560x1440@60': { std: 'VESA CVT', clk: '312.25', h: [2560, 2752, 3024, 3488], v: [1440, 1443, 1448, 1493], hp: '-', vp: '+' },
        '3840x2160@30': { std: 'CTA-861 (VIC 95)', clk: '297', h: [3840, 4016, 4104, 4400], v: [2160, 2168, 2178, 2250], hp: '+', vp: '+' },
        '3840x2160@60': { std: 'CTA-861 (VIC 97)', clk: '594', h: [3840, 4016, 4104, 4400], v: [2160, 2168, 2178, 2250], hp: '+', vp: '+' }
    };
    // 열 구성(데이터) — 원본 사양서 모양: 1열 = 패널 원래 해상도(Preferred), 2·3열 = 상세 블록 후보 중 원래 해상도보다
    //   크지 않은 앞의 둘, 4~6열 = EDID Established 타이밍. 블록 이름 글자는 원본 그대로(줄바꿈 포함).
    window.PS_TIMING_COLS = window.PS_TIMING_COLS || {
        detail: ['1920x1080@60', '1280x720@60', '1366x768@60', '1600x900@60', '1920x1200@60', '1680x1050@60', '1440x900@60', '1280x800@60', '1280x1024@60'],
        aspectTol: 0.03,   // 상세 블록은 원래 해상도와 화면비가 같은 것만(±3%) — FHD 패널에 16:10 모드가 끼지 않게
        established: ['640x480@60', '800x600@60', '1024x768@60'],
        priority: ['Primary', 'Secondary', 'Tertiary', '', '', ''],
        block: ['Preferred \nBlock', 'Detail \nBlock 1', 'Detail \nBlock 2', 'Established \nBlock', 'Established \nBlock', 'Established \nBlock'],
        refresh: 'YES'
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
        feat1: '- Supports up to {res}, {hz}Hz for {inch}”',
        pwrCons: '{w}[W] Max (Display only)'
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
    // 🧾 BOM 에서 부품 종류 가르기(데이터) — 내역 앞 구분자(`LCM IPS>…`·`PBA-AD>…`) 또는 자재그룹(WGBEZ60).
    //    구분자는 사내 자재그룹표 그대로라 `_bomPartNameOf`(js/56) 가 같은 규칙으로 부품명 자리를 안다.
    //    ⚠️ 보드는 자재그룹이 다 'BD 반제품/PBA' 라 **구분자로만** 가른다(LED 보드 `PBA-LED` 와 섞이면 안 된다).
    window.PS_BOM_PARTS = window.PS_BOM_PARTS || {
        'PANEL': { seps: ['LCM', 'FOG', 'OLED', 'KD LCM', 'KD-LCM', 'KE LCM', 'KE-LCM'], groups: ['DISPLAY/'] },
        'AD BOARD': { seps: ['PBA-AD', 'PBM AD'] },
        'CONVERTER': { seps: ['PBA-CNV'] },
        'TOUCH CTRL': { seps: ['PBA-T', 'PBM TCH-CON'] },
        'TSP/GLASS': { seps: ['TSP'], groups: ['TOUCH SCREEN MODULE', 'TOUCH SCREEN ASSY'] }
    };
    // 이 모델 BOM 에서 그 부품 — null = BOM 을 안 받아서 모름 · false = BOM 엔 없음 · {code,name,desc}
    var _bomPart = function (cat) {
        var st = window._bomStore ? window._bomStore() : null;
        var rows = (st && st.rows) || [];
        if (!rows.length) return null;
        var rule = (window.PS_BOM_PARTS || {})[cat];
        if (!rule) return null;
        var best = null, bestLv = 99;
        rows.forEach(function (r) {
            var d = String(r.OJTXP || '').trim();
            var gt = d.indexOf('>');
            var sep = gt > 0 ? d.slice(0, gt).trim().toUpperCase().replace(/\s+/g, ' ') : '';
            var grp = String(r.WGBEZ60 || '').toUpperCase();
            var hit = (rule.seps || []).some(function (x) { return sep === x || sep.indexOf(x + ' ') === 0; })
                   || (rule.groups || []).some(function (x) { return grp.indexOf(x) === 0 || grp.indexOf('/' + x) >= 0; });
            if (!hit) return;
            var lv = (typeof r._level === 'number') ? r._level : 9;
            if (lv < bestLv) { bestLv = lv; best = r; }
        });
        if (!best) return false;
        var nm = window._bomPartNameOf ? window._bomPartNameOf(best.OJTXP) : null;
        return { code: String(best.IDNRK || '').trim(), name: nm || '', desc: String(best.OJTXP || '').trim() };
    };
    // 🔌 BOM 커넥터(데이터) — 보드 바로 아래 행 중 내역 구분자가 이것으로 시작하면 커넥터·스위치로 본다
    window.PS_BOM_CONN_SEPS = window.PS_BOM_CONN_SEPS || ['CON', 'JACK', 'SWC'];
    // 제조사 한글 이름 → 문서 표기(데이터) — **원본 사양서에서 확인된 것만**. 없는 이름은 그대로 둔다.
    window.PS_MAKER_EN = window.PS_MAKER_EN || { '연호전자': 'YEON-HO', '후성테크': 'FUSUNG', 'CT 전자': 'CT', 'CT전자': 'CT' };
    // 설치지점 이름 모양(데이터) — 라이브러리 커넥터 괄호가 이 모양이면 '이름'이 아니라 자리다
    window.PS_DESIGNATOR_RE = window.PS_DESIGNATOR_RE || /^(J|SW|CN|P|U)\d+([~,\-]\s*\d+)?$/i;
    // PARTS 라이브러리에서 그대로 못 찾을 때 떼어 볼 이름 꼬리(데이터) — 끝 괄호(패널 리비전 '(B10)' 등)
    window.PS_LIB_NAME_TRIM = window.PS_LIB_NAME_TRIM || [/\s*\([^()]*\)\s*$/];
    var _maker = function (m) {
        var x = String(m || '').trim(), t = window.PS_MAKER_EN || {};
        return t[x] || t[x.replace(/\s+/g, '')] || x;
    };
    var _alnum = function (v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
    // 라이브러리 커넥터 글을 항목으로 — ';' ',' ' / ' 로 자르되 **괄호 안은 자르지 않는다**('(6pin,Inverter)')
    var _connEntries = function (text) {
        var s = String(text || ''), out = [], cur = '', depth = 0;
        for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (ch === '(') depth++;
            if (ch === ')') depth = Math.max(0, depth - 1);
            var cut = depth === 0 && (ch === ';' || ch === ',' || (ch === '/' && s[i - 1] === ' ' && s[i + 1] === ' '));
            if (cut) { out.push(cur); cur = ''; } else cur += ch;
        }
        out.push(cur);
        return out.map(function (x) { return x.trim(); }).filter(Boolean);
    };
    var _prefixSame = function (a, b) { var x = _alnum(a), y = _alnum(b); return !!(x && y && (x.indexOf(y) === 0 || y.indexOf(x) === 0)); };
    // 그 보드 바로 아래 커넥터들 — null = BOM 없음 · [] = 보드가 없거나 커넥터 없음
    var _bomConnectors = function (cat) {
        var st = window._bomStore ? window._bomStore() : null;
        var rows = (st && st.rows) || [];
        if (!rows.length) return null;
        var bp = _bomPart(cat);
        if (!bp) return [];
        var at = -1;
        for (var i = 0; i < rows.length; i++) {
            if (String(rows[i].IDNRK || '').trim() === bp.code && String(rows[i].OJTXP || '').trim() === bp.desc) { at = i; break; }
        }
        if (at < 0) return [];
        var lv = rows[at]._level, out = [];
        for (var j = at + 1; j < rows.length && rows[j]._level > lv; j++) {
            var r = rows[j];
            if (r._level !== lv + 1) continue;          // 보드에 바로 달린 것만(그 아래 묶음은 안 본다)
            var d = String(r.OJTXP || '').trim(), gt = d.indexOf('>');
            var sep = gt > 0 ? d.slice(0, gt).trim().toUpperCase() : '';
            if (!(window.PS_BOM_CONN_SEPS || []).some(function (x) { return sep === x || sep.indexOf(x + ' ') === 0; })) continue;
            var eb = String(r.EBORT || '').split(/[,\s]+/).filter(Boolean);
            if (!eb.length) continue;
            var nm = window._bomPartNameOf ? window._bomPartNameOf(d) : null;
            // 자재그룹 규칙에 이름 자리가 없거나 틀리면(실측: USB 잭) **품번처럼 생긴 첫 낱말**(영문+숫자 5자 이상) —
            //   그것도 없으면 내역 그대로(빈 값으로 속이지 않는다)
            if (!nm) {
                var toks = d.slice(gt + 1).split(',').map(function (x) { return x.trim(); });
                nm = toks.filter(function (x) { return x.length >= 5 && /[A-Z]/i.test(x) && /\d/.test(x); })[0] || '';
            }
            out.push({ eb: eb, part: nm || d.slice(gt + 1).trim(), maker: _maker(r.MFRPN), code: String(r.IDNRK || '').trim() });
        }
        return out;
    };
    // 설치지점 자연 정렬 키(J2 < J10 < J301, SW 는 뒤)
    var _ebKey = function (e) { var m = String(e).match(/^([A-Z]+)(\d+)/i); return m ? [m[1].toUpperCase(), +m[2]] : [String(e), 0]; };
    // A/D connection 표의 줄 — 연속 번호 스위치는 'SW1~4' 로 한 줄(원본 모양), 띄엄띄엄인 J1,J7 은 따로 줄
    var _adcRows = function () {
        var cs = _bomConnectors('AD BOARD');
        if (!cs) return null;
        var rows = [];
        cs.forEach(function (c) {
            var ks = c.eb.map(_ebKey);
            var samePre = ks.every(function (k) { return k[0] === ks[0][0]; });
            var consec = samePre && ks.length > 1 && ks.every(function (k, i) { return i === 0 || k[1] === ks[i - 1][1] + 1; });
            if (consec) rows.push({ sym: ks[0][0] + ks[0][1] + '~' + ks[ks.length - 1][1], first: ks[0], all: c.eb, part: c.part, maker: c.maker });
            else c.eb.forEach(function (e) { rows.push({ sym: e, first: _ebKey(e), all: [e], part: c.part, maker: c.maker }); });
        });
        rows.sort(function (a, b) { return a.first[0] === b.first[0] ? a.first[1] - b.first[1] : (a.first[0] < b.first[0] ? -1 : 1); });
        return rows;
    };
    // 문서 Symbol 칸('J1', 'SW1~4', 'J2,J3')에 해당하는 BOM 줄
    var _adcFind = function (sym) {
        var rows = _adcRows();
        if (!rows) return undefined;
        var first = String(sym || '').toUpperCase().split(/[~,\s]/)[0].trim();
        if (!first) return undefined;
        return rows.filter(function (r) { return r.all.some(function (e) { return String(e).toUpperCase() === first; }); })[0] || null;
    };
    // 지금 모델 카드 **자신의** 주요자재 한 줄(다른 카드로 폴백하지 않는다)
    var _ownMat = function (cat) {
        var card = ((window.tabData || {}).projectModels || []).filter(function (m) { return m && m.unitId === (window.mcActiveUnit || ''); })[0];
        return ((card && card.materials) || []).filter(function (m) { return m && m.category === cat && !_isNone(m.description || m.ktkPn); })[0] || null;
    };
    // 👥 같은 이름 다른 리비전 기록으로 빈 칸 메우기 — 2026-11-24 실측: BOM 코드로 정확히 찾은 AD 보드 기록(R6)은
    //    커넥터 칸이 전부 '-' 이고, 같은 이름의 다른 리비전 하나에만 적혀 있었다. 빈 칸만, 형제들이 **한 값으로
    //    일치할 때만** 빌린다(실측: 같은 이름 형제끼리 값이 다른 칸이 12% — 다르면 고르지 않는다). 빌린 칸은
    //    `_psFill[칸] = 그 형제 코드` 로 남겨 출처에 보인다. 캐시 객체는 안 건드리고 겉 객체를 만든다.
    var PS_SIB_SKIP = /^(Item Code|Item Description|Revision|Note|Expected Price|Issue Date|Datasheet Version)$/;
    var _libMerged = typeof WeakMap === 'function' ? new WeakMap() : null;
    var _nameKey = function (x) {
        var n = (x.specs && x.specs['Part Name']) || String(x.model || '').replace(/^\d{6}_/, '');
        return String(n).toUpperCase().replace(/[^A-Z0-9]/g, '');
    };
    var _withSiblings = function (rec, items) {
        if (_libMerged && _libMerged.has(rec)) return _libMerged.get(rec);
        var key = _nameKey(rec), out = rec;
        var sibs = key ? (items || []).filter(function (x) { return x !== rec && x && x.specs && _nameKey(x) === key; }) : [];
        if (sibs.length) {
            var specs = {}, fill = {}, f;
            for (f in rec.specs) specs[f] = rec.specs[f];
            var fields = {};
            sibs.forEach(function (x) { for (var k in x.specs) fields[k] = 1; });
            for (f in fields) {
                if (PS_SIB_SKIP.test(f) || !_isNone(specs[f])) continue;
                var vals = [], code = '';
                sibs.forEach(function (x) {
                    var v = String(x.specs[f] == null ? '' : x.specs[f]).trim();
                    if (_isNone(v)) return;
                    if (vals.indexOf(v) < 0) vals.push(v);
                    if (!code) code = String(x.specs['Item Code'] || x.model || '').trim();
                });
                if (vals.length === 1) { specs[f] = vals[0]; fill[f] = code; }
            }
            if (Object.keys(fill).length) { out = Object.create(rec); out.specs = specs; out._psFill = fill; }
        }
        if (_libMerged) _libMerged.set(rec, out);
        return out;
    };
    // 출처 꼬리 — 꼬리 떼고 찾았으면 '(찾은 이름)', 형제에게 빌렸으면 '← 같은 이름 <코드>'
    var _libSrcTail = function (rec, field) {
        if (!rec) return '';
        return (rec._psFill && rec._psFill[field] ? ' ← ' + _t('같은 이름 ', 'same name ') + rec._psFill[field] : '');
    };
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
        // 🔎 찾는 순서 = 부품 표 이름과 같은 순서(BOM → 주요자재 → Project list) — 한 문서에서 이름은 이 부품,
        //    사양은 저 부품이 되면 안 된다. 각 출처에선 **품목 코드 먼저**(이름은 라이브러리마다 적는 법이 달라
        //    못 찾았다 — 실측: 터치 컨트롤러). 패널은 라이브러리에 코드가 비어 있어 이름으로 찾힌다.
        var row = _plRow(ctx) || {};
        var bp = _bomPart(L.cat);
        var mat = _ownMat(L.cat);
        // BOM 을 받았는데 그 부품이 없으면 **기록도 없다** — 주요자재·Project list 로 넘어가지 않는다
        //   (터치 없는 모델 카드에 복사돼 남은 터치 컨트롤러로 기록을 찾으면 안 된다)
        if (bp === false) return null;
        var names = [];
        if (bp) { if (bp.code) names.push(bp.code); if (bp.name) names.push(bp.name); }
        if (mat) { if (mat.ktkPn) names.push(String(mat.ktkPn).trim()); if (mat.description) names.push(mat.description); }
        if (!_isNone(row[L.pl])) names.push(String(row[L.pl]).trim());
        if (!names.length) { var md = _matDesc(ctx, L.cat); if (md) names.push(md); }
        var items = which === 'panel' ? lib.panels : lib.items;
        var find = function (nm) {
            var x = which === 'panel' ? (window.findPanelInLibrary && window.findPanelInLibrary(lib, nm))
                                      : (window.findElecPartInLibrary && window.findElecPartInLibrary(lib, nm));
            return x && x.specs ? _withSiblings(x, items) : x;
        };
        for (var i = 0; i < names.length; i++) {
            var rec = find(names[i]);
            if (rec && rec.specs) return rec;
        }
        // 🔁 [2026-11-24 실측] 그대로는 못 찾으면 **이름 꼬리를 뗀 이름**으로 한 번 더 — BOM 패널 이름은
        //    'XXX-N20(B10)' 처럼 끝에 패널 리비전이 붙는데 라이브러리는 기본 이름('XXX-N20')으로 적혀 있어
        //    패널 사양 칸 9개가 통째로 비었다. 뗀 규칙은 데이터(PS_LIB_NAME_TRIM), 그렇게 찾은 건
        //    출처에 '(찾은 이름)' 을 붙여 사람이 볼 수 있게 한다(캐시 객체는 건드리지 않는다).
        for (var j = 0; j < names.length; j++) {
            var base = String(names[j]);
            (window.PS_LIB_NAME_TRIM || []).forEach(function (re) { base = base.replace(re, ''); });
            base = base.trim();
            if (!base || base === String(names[j]).trim()) continue;
            var r2 = find(base);
            if (r2 && r2.specs) { var w = Object.create(r2); w._psVia = base; return w; }
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
    // 패널 원래 해상도 — PARTS 패널 Dot Resolution → Customer SPEC Native Resolution (feat1 과 같은 순서)
    var _nativeRes = function (ctx) {
        var rec = _libRec(ctx, 'panel');
        var fromLib = rec && rec.specs['Dot Resolution'];
        var nat = fromLib || ((_specVal(ctx, ['Native Resolution', '해상도', 'Resolution']) || {}).v) || '';
        var m = String(nat).match(/(\d{3,5})\D{1,8}?(\d{3,5})/);
        if (!m) return null;
        return { w: +m[1], h: +m[2], src: fromLib ? 'PARTS ▸ PANEL ▸ Dot Resolution' + _libSrcTail(rec, 'Dot Resolution') : 'Customer SPEC ▸ Native Resolution' };
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
            //    [2026-11-24] **BOM 이 있으면 BOM 이 정한다**(터치 컨트롤러나 터치 센서가 BOM 에 있는가).
            var row = _plRow(ctx);
            var has;
            var bt = _bomPart('TOUCH CTRL'), bs = _bomPart('TSP/GLASS');
            if (bt !== null || bs !== null) {
                has = !!(bt || bs);
                return { v: has ? 'YES' : 'NO', src: 'BOM ▸ ' + _t('터치 컨트롤러·센서 유무', 'touch parts in BOM') };
            }
            if (row && Object.prototype.hasOwnProperty.call(row, 'touchCtrl')) {
                has = !_isNone(row.touchCtrl);
            } else {
                var card = ((window.tabData || {}).projectModels || []).filter(function (m) { return m && m.unitId === (window.mcActiveUnit || ''); })[0];
                var mats = (card && card.materials) || [];
                has = mats.some(function (m) { return m && m.category === 'TOUCH CTRL' && !_isNone(m.description || m.ktkPn); });
            }
            return { v: has ? 'YES' : 'NO', src: _t('Project list · 이 모델 주요자재 TOUCH CTRL 유무', 'touch controller present?') };
        },
        // 터치 부품 이름 — 터치가 없으면 '-', 있으면 BOM → 주요자재 → Project list
        touchPart: function (ctx, a) {
            if (FN.hasTouch(ctx).v !== 'YES') return { v: '-', src: _t('터치 없음', 'no touch') };
            var bp = _bomPart(a[0]);
            if (bp) return { v: bp.name || bp.desc, src: 'BOM ▸ ' + bp.code };
            var m = _ownMat(a[0]);
            if (m && bp !== false) return { v: m.description || m.ktkPn, src: 'Summary ▸ ' + _t('주요자재', 'materials') + ' ' + a[0] };
            var row = _plRow(ctx) || {};
            return { v: _isNone(row[a[1]]) ? '-' : String(row[a[1]]).trim(), src: 'Project list ▸ ' + a[1] };
        },
        // '5V @150mA' 처럼 한 칸에 둘 — '@' 로 쪼갠다(터치 전원 전압·전류)
        atSplit: function (ctx, a) {
            var rec = _libRec(ctx, 'touch');
            var v = rec && rec.specs[a[0]];
            var parts = String(v || '').split('@').map(function (x) { return x.trim(); });
            return { v: parts.length > +a[1] ? parts[+a[1]] : '', src: v ? 'PARTS ▸ TOUCH CTRL ▸ ' + a[0] : '' };
        },
        // 'Kortek / <품목 코드>' — 원본 사양서 Controller 칸 모양(제조사 짧은 이름 / 코드)
        ctrlId: function (ctx) {
            var rec = _libRec(ctx, 'touch');
            if (!rec) return { v: '', src: '' };
            var code = String(rec.specs['Item Code'] || '').trim();
            var brand = FMT.vendor(String(rec.specs.Brand || '').trim());
            return { v: [brand, code].filter(Boolean).join(' / '), src: 'PARTS ▸ TOUCH CTRL ▸ Brand · Item Code' };
        },
        // A/D connection 표 R번째 줄 — 0 Symbol · 2 Parts Number · 3 Manufacture (BOM)
        adc: function (ctx, a) {
            var rows = _adcRows();
            if (!rows) return { v: '', src: '' };
            var r = rows[+a[0] - 1];
            if (!r) return { v: '', src: '' };
            var more = (+a[0] === 10 && rows.length > 10) ? _t(' · BOM 커넥터 ' + rows.length + '개 중 10개만(표 줄 수가 양식 그대로)', ' · only 10 of ' + rows.length) : '';
            var v = +a[1] === 0 ? r.sym : (+a[1] === 2 ? r.part : r.maker);
            return { v: v, src: 'BOM ▸ A/D ' + _t('보드 커넥터', 'board connector') + more };
        },
        // 컨버터 입력/출력 커넥터 문장 — 라이브러리의 입력/출력 품번과 같은 BOM 커넥터를 찾아 'J1 : 품번 (제조사)'
        convConn: function (ctx, a) {
            var cs = _bomConnectors('CONVERTER');
            if (!cs || !cs.length) return { v: '', src: '' };
            var rec = _libRec(ctx, 'conv');
            var lm = rec ? String(rec.specs[a[1]] || '').split('/')[0].trim() : '';
            if (_isNone(lm)) return { v: '', src: _t('PARTS CONVERTER 에 입출력 커넥터가 없어 BOM 커넥터를 못 가림', 'cannot tell in/out') };
            var c = cs.filter(function (x) { return _prefixSame(x.part, lm); })[0];
            if (!c) return { v: '', src: '' };
            return { v: c.eb.join(',') + ' : ' + c.part + (c.maker ? ' (' + c.maker + ')' : ''), src: 'BOM ▸ CONVERTER ' + _t('커넥터', 'connector') };
        },
        // 커넥터 모델명만 — '12345WR-12A / 12' → '12345WR-12A'
        connModel: function (ctx, a) {
            var rec = _libRec(ctx, 'conv');
            var v = rec && String(rec.specs[a[0]] || '').split('/')[0].trim();
            return { v: _isNone(v) ? '' : v, src: v ? 'PARTS ▸ CONVERTER ▸ ' + a[0] : '' };
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
        // BLU 값을 '(Typ.)'·'(Max.)'·'(Min.)' 표시로 칸에 — 'a: 필드1|필드2 : 원하는 칸 : 표시 없을 때의 칸'
        lampLbl: function (ctx, a) {
            var rec = _libRec(ctx, 'panel');
            if (!rec) return { v: '', src: '' };
            var fields = a[0].split('|'), want = a[1], dflt = a[2] || '';
            for (var i = 0; i < fields.length; i++) {
                var raw = String(rec.specs[fields[i]] || '').trim();
                if (_isNone(raw)) continue;
                var segs = raw.split(/\s*\/\s*/);
                for (var j = 0; j < segs.length; j++) {
                    var lm = segs[j].match(/\(\s*(typ|max|min)/i);
                    var lbl = lm ? lm[1].toLowerCase() : (segs.length === 1 ? dflt : '');
                    if (lbl !== want) continue;
                    var n = segs[j].match(/-?\d[\d,]*(?:\.\d+)?/);
                    if (n) return { v: n[0], src: 'PARTS ▸ PANEL' + (rec._psVia ? ' (' + rec._psVia + ')' : '') + ' ▸ ' + fields[i] + _libSrcTail(rec, fields[i]) };
                }
            }
            return { v: '', src: '' };
        },
        // A/D connection Description — 그 줄 BOM 품번과 같은 라이브러리 커넥터의 괄호 이름(설치지점이 아닐 때만)
        adcDesc: function (ctx, a) {
            // 그 줄 Symbol 을 사람이 적었거나 불러왔으면 **그 설치지점**의 BOM 줄로 — 자리 순서로 집으면
            //   불러온 문서(원본 줄 순서)와 BOM 정렬 순서가 달라 남의 커넥터 이름이 들어간다(실측)
            var ownSym = window._docFieldOwn ? window._docFieldOwn(FORM_ID, 'adc.r' + a[0] + '.c0') : undefined;
            var r;
            if (ownSym !== undefined && ownSym !== null && String(ownSym).trim() !== '') r = _adcFind(ownSym);
            else { var rows = _adcRows(); r = rows && rows[+a[0] - 1]; }
            if (!r || !r.part) return { v: '', src: '' };
            var rec = _libRec(ctx, 'adbd');
            if (!rec) return { v: '', src: '' };
            // ⚠️ 라이브러리 커넥터 칸은 **보드마다 적는 법이 다르다**(실측 8가지 넘음):
            //   'PART (이름) / N Pin' · '이름: PART' · '이름 (PART)' · 'CN2 PART(6pin,이름)' · 'J302 (PART / 4 Pins)'
            //   그래서 모양을 박지 않고, 항목에서 품번·설치지점·괄호 안 핀 수를 걷어 내고 남은 글을 이름으로 본다.
            //   같은 품번이 이름 다른 두 곳에 있으면(전원 4핀·OSD 4핀) **고르지 않는다** — 설치지점이 적혀 있어 맞을 때만.
            var syms = (r.all || []).map(function (x) { return String(x).toUpperCase(); });
            var keys = Object.keys(rec.specs).filter(function (k) { return /connector/i.test(k); });
            var cands = [];
            keys.forEach(function (k) {
                _connEntries(rec.specs[k]).forEach(function (e) {
                    var toks = e.split(/[\s(),:\/]+/).filter(Boolean);
                    var pt = toks.filter(function (t) { return _alnum(t).length >= 5 && _prefixSame(t, r.part); })[0];
                    if (!pt) return;
                    var des = toks.filter(function (t) { return window.PS_DESIGNATOR_RE.test(t); }).map(function (t) { return t.toUpperCase(); });
                    if (des.length && !des.some(function (d) { return syms.indexOf(d) >= 0; })) return;   // 다른 자리 것
                    var name = e.split(pt).join(' ')
                        .replace(/\(([^)]*)\)/g, function (all, inner) { return ' (' + inner.replace(/\b\d+\s*pins?\b/gi, ' ') + ') '; })
                        .split(/\s+/).filter(function (t) { return !window.PS_DESIGNATOR_RE.test(t.replace(/[(),:]/g, '')); }).join(' ')
                        .replace(/[()]/g, ' ').replace(/\s*[,:]\s*/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!/[A-Za-z가-힣]{2,}/.test(name.replace(/\bpins?\b/gi, ''))) return;               // 이름 없음(핀 수뿐)
                    cands.push({ name: name, key: k, sym: des.length > 0 });
                });
            });
            var bySym = cands.filter(function (c) { return c.sym; });
            var pick = bySym.length === 1 ? bySym[0] : null;
            // 같은 품번이 BOM 에 다른 자리로 또 있으면(J1·J7 둘 다 4핀) 설치지점 없는 이름은 어느 쪽 것인지 모른다
            var allRows = _adcRows() || [];
            var twins = allRows.filter(function (x) { return x.sym !== r.sym && x.part && _prefixSame(x.part, r.part); }).length;
            if (!pick && twins) return { v: '', src: cands.length ? _t('BOM 에 같은 품번이 다른 자리에도 있어 고르지 않음', 'same part at other positions') : '' };
            if (!pick) {
                var names = cands.map(function (c) { return c.name; }).filter(function (n, i, arr) { return arr.indexOf(n) === i; });
                if (names.length === 1) pick = cands[0];
                else if (names.length > 1) return { v: '', src: _t('PARTS AD BOARD 에 이 품번이 이름 다른 곳에 ' + names.length + '번 — 고르지 않음', 'ambiguous in PARTS') };
            }
            return pick ? { v: pick.name, src: 'PARTS ▸ AD BOARD ▸ ' + pick.key + _libSrcTail(rec, pick.key) } : { v: '', src: '' };
        },
        // 🕒 타이밍 표 한 칸 — 열 계획(원래 해상도 + 상세 2 + Established 3)을 세우고 표준 표에서 값을 꺼낸다
        tim: function (ctx, a) {
            var row = +a[0], col = +a[1];
            var nat = _nativeRes(ctx);
            if (!nat) return { v: '', src: _t('패널 원래 해상도 없음(PARTS 패널 Dot Resolution · Customer SPEC)', 'no native resolution') };
            var C = window.PS_TIMING_COLS, natKey = nat.w + 'x' + nat.h + '@60';
            var fits = function (k) { var m = k.match(/^(\d+)x(\d+)/); return m && +m[1] <= nat.w && +m[2] <= nat.h && k !== natKey; };
            var sameAspect = function (k) { var m = k.match(/^(\d+)x(\d+)/); return m && Math.abs((+m[1] / +m[2]) / (nat.w / nat.h) - 1) <= (C.aspectTol || 0.03); };
            var plan = [natKey].concat(C.detail.filter(function (k) { return fits(k) && sameAspect(k); }).slice(0, 2));
            while (plan.length < 3) plan.push('');
            plan = plan.concat(C.established.filter(fits).slice(0, 3));
            var key = plan[col - 1] || '';
            if (!key) return { v: '', src: '' };
            var isDetail = col <= 3;
            if (row === 0) return { v: C.priority[col - 1] || '', src: _t('타이밍 표 열 구성', 'timing columns') };
            if (row === 2) return { v: C.block[col - 1] || '', src: _t('타이밍 표 열 구성', 'timing columns') };
            if (row === 1) return { v: key.replace(/@.*$/, ''), src: col === 1 ? nat.src : _t('타이밍 표 열 구성', 'timing columns') };
            if (row === 14) return { v: isDetail ? C.refresh : '', src: '' };
            var t = window.PS_STD_TIMINGS[key];
            if (!t) return { v: '', src: _t('표준 타이밍 표에 ' + key + ' 없음', key + ' not in standard table') };
            var src = _t('표준 타이밍 ▸ ', 'standard timing ▸ ') + t.std + _t(' (실제 EDID 와 다를 수 있음)', ' (may differ from EDID)');
            var v = '';
            if (row === 3) v = t.clk;
            else if (row >= 4 && row <= 7) v = String(t.h[row - 4]);
            else if (row >= 8 && row <= 11) v = String(t.v[row - 8]);
            else if (row === 12) v = isDetail ? t.hp + 'hsync' : '';
            else if (row === 13) v = isDetail ? t.vp + 'vsync' : '';
            return { v: v, src: src };
        },
        // 'Consumption' — Customer SPEC 소비전력(첫 줄 = LCD Monitor, 디스플레이만)의 숫자만 원본 문장 모양으로
        pwrCons: function (ctx) {
            //   ⚠️ Customer SPEC 은 이 항목을 하위 줄로 나눠 적고(LCD Monitor·Light·Total·Touch) 라벨은 **하위 이름**이다(js/66)
            var s = _specVal(ctx, ['LCD Monitor', 'Power estimation (Max. W)', 'Power estimation', 'Power Consumption']);
            var m = s && String(s.v).match(/([\d.]+)\s*\[?\s*W/i);
            if (!m) return { v: '', src: s ? 'Customer SPEC ▸ ' + s.label : '' };
            return { v: window.PS_TEXT.pwrCons.replace('{w}', m[1]), src: 'Customer SPEC ▸ ' + s.label };
        },
        // 'Connector PN' — 'DC 24V / Acme 6P_11-22-3344' 의 '/' 뒤에서 핀 수 표기('6P_')를 떼고 '제조사 품번'
        pwrConn: function (ctx) {
            var s = _specVal(ctx, ['Input voltage', 'Input Voltage', '입력 전압']);
            var tail = s ? String(s.v).split('/').slice(1).join('/').trim() : '';
            var m = tail.match(/^([A-Za-z][A-Za-z.&\-]*)\s+(?:\d+\s*P(?:IN)?[_\s-]+)?([0-9A-Za-z][\w.\-]*)\s*$/i);
            if (!m) return { v: '', src: s ? 'Customer SPEC ▸ ' + s.label : '' };
            return { v: m[1] + ' ' + m[2], src: 'Customer SPEC ▸ ' + s.label };
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
        if (kind === 'bom') {
            var bp = _bomPart(arg);
            if (bp === null) return { v: '', src: '' };                 // BOM 을 안 받았다 → 다음 출처
            if (bp === false) return { v: '-', src: 'BOM ▸ ' + _t('이 부품 없음', 'not in BOM') };   // BOM 에 없다 → 여기서 끝
            return { v: bp.name || bp.desc, src: 'BOM ▸ ' + bp.code };
        }
        if (kind === 'umat') {
            var um = _ownMat(arg);
            return { v: um ? String(um.description || um.ktkPn || '').trim() : '', src: 'Summary ▸ ' + _t('주요자재', 'materials') + ' ' + arg };
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
            return { v: lv, src: 'PARTS ▸ ' + LIB[kind].cat + (rec && rec._psVia ? ' (' + rec._psVia + ')' : '') + ' ▸ ' + arg + _libSrcTail(rec, arg) };
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

    // ── ⚠️ BOM 대조 — 사람이 적었거나 불러온 A/D connection 표가 BOM 과 다르면 칸 아래에 BOM 값을 띄운다.
    //    고치지 않는다(원본 사양서가 틀렸는지 BOM 이 틀렸는지는 사람이 정한다) — 실측으로 원본에서 품번이
    //    뒤바뀐 줄·핀 수가 다른 줄을 찾았다.
    window.DOC_CELL_CHECK = window.DOC_CELL_CHECK || {};
    window.DOC_CELL_CHECK[FORM_ID] = function (key, value) {
        var m = /^adc\.r(\d+)\.c([023])$/.exec(key);
        if (!m) return '';
        var symKey = 'adc.r' + m[1] + '.c0';
        var own = window._docFieldOwn ? window._docFieldOwn(FORM_ID, symKey) : undefined;
        if (own === undefined) return '';                  // 앱이 채운 줄은 BOM 그 자체 — 대조할 게 없다
        var sym = String(own || '').trim();
        if (!sym) return '';
        var b = _adcFind(sym);
        if (b === undefined) return '';                    // BOM 을 안 받았다
        if (b === null) return m[2] === '0' ? _t('BOM 에 이 설치지점이 없음', 'not in BOM') : '';
        var v = String(value || '').trim();
        if (m[2] === '2' && !_prefixSame(v, b.part)) return 'BOM: ' + b.part + ' (' + b.all.join(',') + ')';
        if (m[2] === '3' && _alnum(_maker(v)) !== _alnum(b.maker)) return 'BOM: ' + (b.maker || '-');
        return '';
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
