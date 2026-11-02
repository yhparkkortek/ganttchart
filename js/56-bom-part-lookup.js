// ══════════════════════════════════════════════════════════════════════════════
// 🔎 56-bom-part-lookup.js — "이 제품에 쓰인 <부품> 뭐야?" (2026-11-02)
//
//   사용자 요청: "SAP에서 999001 제품에 사용된 (특정부품 정보)패널명 확인해줘".
//   사람이 BOM 494행을 눈으로 훑어 패널을 찾는 일을 앱이 대신한다.
//
//   ⚠️ 실측으로 확인한 두 가지가 이 기능의 전부다(2026-11-02, 자재 999001):
//   ① **패널은 단층 BOM 에 없다.** 완제품 바로 아래가 아니라 **5단계 아래**에 있다
//      (L5 `DISPLAY/FOG`). 그래서 이 조회는 **반드시 다단계 전개**(explosion=multi)다.
//      단층(102행)으로 찾으면 "패널 없음"이라는 **조용한 오답**이 나온다.
//   ② **부품 종류는 자재그룹(WGBEZ60)으로 가른다.** BOM 이 주는 값은 `대분류/중분류`
//      꼴이다 — `DISPLAY/FOG`, `전장자재/TOUCH SCREEN MODULE`, `기구자재/GASKET`.
//      내역 글자(OJTXP)를 뒤지면 안 된다. "PANEL" 이라는 낱말은 `G/PNL MOD`(기구물)
//      같은 데도 나오고, 정작 패널 행 내역엔 "PANEL" 이 한 번도 안 나온다.
//
//   📇 부품명은 **DESC' RULE 이 정한 자리**에서 뽑는다 — 사내 자재그룹표(R100, 2026-03-24)
//      에서 구분자 618개의 "제조사 품명" 토큰 위치를 뽑아 `MATGROUP_NAME_POS` 로 굳혔다.
//      내역은 `<구분자>><값1>,<값2>,…` 꼴이라 자리만 알면 이름이 바로 나온다.
//        FOG IPS>ZZ999PANEL-X9,3840X2160,…   → 0번째 = 패널 모델명
//        TSP CURVED>TOUCH,ZZ999TOUCH01 → 1번째 = 터치 모델명
//      자리를 코드에 박으면 부품 종류마다 틀린다(위 둘이 서로 다르다).
//
//   새 부품 종류는 `BOM_PART_KINDS` 에 **한 줄** 추가하면 된다(데이터).
// ══════════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };

    // ── 데이터 ① 부품 종류 카탈로그 ──────────────────────────────────────────
    //   kw     : 사람이 쓰는 말(이 말이 질문에 있으면 그 종류로 본다)
    //   groups : 자재그룹(WGBEZ60) 패턴. `대분류/중분류` 전체, 또는 `대분류/`(그 대분류 전부),
    //            또는 중분류 이름만(대분류 무관). 자재그룹표 R100 의 실제 이름을 쓴다.
    window.BOM_PART_KINDS = window.BOM_PART_KINDS || [
        { id: 'panel',   ko: '패널',      en: 'Panel',
          kw: ['패널', 'panel', 'lcd', 'lcm', 'fog', '액정', '디스플레이', 'display'],
          groups: ['DISPLAY/'] },
        { id: 'touch',   ko: '터치',      en: 'Touch',
          kw: ['터치', 'touch', 'tsp', '터치스크린'],
          groups: ['TOUCH SCREEN MODULE', 'TOUCH SCREEN ASSY', 'TOUCH CONTROLLER', 'IC-TOUCH CONTROLLER'] },
        { id: 'blu',     ko: 'BLU',       en: 'BLU',
          kw: ['blu', '백라이트', 'backlight', '광원', 'bm'],
          groups: ['BLU MODULE', 'BM PART MODULE', 'BM PART(ASSY)', 'LED MODULE'] },
        { id: 'board',   ko: '보드',      en: 'Board',
          kw: ['보드', 'pba', 'pcb', '기판', 'board', 'ad bd', '에이디보드'],
          groups: ['BD 반제품/', 'BARE PCB'] },
        { id: 'power',   ko: '파워',      en: 'Power',
          kw: ['파워', '전원', 'power', 'smps', '아답타', '어댑터', 'adapter'],
          groups: ['전장자재/POWER', 'POWER ASSY', 'CONVERTER'] },
        { id: 'harness', ko: '케이블',    en: 'Cable',
          kw: ['케이블', '하네스', 'harness', 'cable', '배선'],
          groups: ['HARNESS'] },
        { id: 'fan',     ko: '팬',        en: 'Fan',
          kw: ['팬', 'fan', '쿨러', '냉각'],
          groups: ['FAN'] },
        { id: 'speaker', ko: '스피커',    en: 'Speaker',
          kw: ['스피커', 'speaker', '음향'],
          groups: ['SPEAKER ASSY', 'SPEAKER'] },
        { id: 'optical', ko: '광학필름',  en: 'Optical film',
          kw: ['광학', '필름', 'optical', '시트', '편광', 'pol'],
          groups: ['기구자재/OPTICAL', 'FOG ASSY', 'LCM ASSY'] },
        { id: 'packing', ko: '포장재',    en: 'Packaging',
          kw: ['포장', '박스', 'box', 'packing', '완충', '팔레트'],
          groups: ['포장자재/'] },
        { id: 'mech',    ko: '기구물',    en: 'Mechanical',
          kw: ['기구', '사출', '프레스', 'mech', '브라켓', 'bracket'],
          groups: ['기구자재/', '기구반제품/'] }
    ];

    // ── 데이터 ② 구분자 → "제조사 품명" 이 몇 번째 값인가(0부터) ───────────────
    //   사내 자재그룹표(SAP)자재그룹표_R100_20260324.xlsx 의 DESC' RULE 에서 뽑았다.
    //   표에 없는 구분자는 그냥 내역 전체를 보여준다(지어내지 않는다).
    window.MATGROUP_NAME_POS = window.MATGROUP_NAME_POS || {"AD BD":1,"AD CONV":2,"ADAPTOR":1,"ADHESIVE TAPE":6,"ANT/S":1,"ARCADE":0,"ATC":0,"ATC-S":0,"ATM":0,"ATM-C":0,"AUDIO AMP":3,"AUDIO PROCESSOR":2,"BACK(D)":3,"BACK(E)":3,"BACK(M)":3,"BACK(P)":3,"BACK(P)_MP":1,"BACK_PL(D)":3,"BACK_PL(E)":3,"BACK_PL(M)":3,"BACK_PL(P)":3,"BACK_PL(P)_MP":1,"BACK_SUB(D)":3,"BACK_SUB(E)":3,"BACK_SUB(M)":3,"BACK_SUB(P)":3,"BACK_SUB(P)_MP":1,"BADGE":3,"BASE(D)":3,"BASE(E)":3,"BASE(M)":3,"BASE(P)":3,"BASE(P)_MP":1,"BATT":3,"BATT HOLDER":3,"BD REWORK":1,"BEAD":3,"BEAD DIP":3,"BEAD SMD":0,"BIMETAL":1,"BLU CCFL ASSY":0,"BLU SUB MATERIAL":0,"BM":1,"BONDING":2,"BTM_COVER(D)":3,"BTM_COVER(E)":3,"BTM_COVER(M)":3,"BTM_COVER(P)":3,"BTM_COVER(P)_MP":1,"BTN":0,"BTN DECK":0,"BTN-C":0,"BTN-P":0,"BUFFER":0,"BUSHING":1,"BUZZER":2,"C/BTM MOD":5,"C/BTM(D)":3,"C/BTM(E)":3,"C/BTM(M)":3,"C/BTM(P)":3,"C/BTM(P)_MP":1,"C/TOP MOD":5,"C/TOP(D)":3,"C/TOP(E)":3,"C/TOP(M)":3,"C/TOP(P)":3,"C/TOP(P)_MP":1,"CABLE TIE":0,"CAM MOD":1,"CAP":4,"CAP DIP":4,"CAP DIP EL":0,"CAP DIP POLY":0,"CAP SMD":4,"CAP SMD EL":0,"CAP SMD POLY":0,"CAP SMD TANTAL":0,"CB ANTENA":1,"CB BNC":2,"CB DP":2,"CB DP+DVI":2,"CB DP+VGA":2,"CB DSUB":3,"CB DVI":4,"CB DVI+HDMI":2,"CB DVI+VGA":2,"CB HDMI":3,"CB LAN":2,"CB STEREO":3,"CB USB":9,"CB VGA":3,"CBN BTN":0,"CBN SUB":0,"CBN WRAP":0,"CBN-G":0,"CBN-L":0,"CHARGER":1,"CLAMP CABLE":1,"CLAMP PCB SUPPORT":1,"CLINICAL →CR":0,"CLK DRV":2,"CLK SYNTH":2,"CLUSTER CENTER FASCIA → CAR":0,"CNV/INV":0,"CON":2,"CON AN":3,"CON HOU":2,"CON SR":2,"CONV":1,"CONV SIG":0,"CORE CLIP":0,"CORE RING":0,"COVER(D)":3,"COVER(E)":3,"COVER(M)":3,"COVER(P)":3,"COVER(P)_MP":1,"CPS/S":1,"CPU DUAL":1,"CRT":0,"CTRL MOD/HOU":1,"CVT C/S MOD":3,"DA CONV":2,"DB ASSY":0,"DBEF":1,"DC CORD":0,"DDC MANAGER":0,"DDR":0,"DDR2":0,"DDR3":0,"DDR4":0,"DEBUG BD":0,"DECAL":3,"DEMUX(IO-EXTENDER)":2,"DFF/P":2,"DFF/S":1,"DIAGNOSTIC →DN":0,"DIFF. RX":1,"DIODE":3,"DIODE DIP":3,"DIODE DIP TVS":7,"DIODE SMD":2,"DIODE SMD SCH":2,"DIODE SMD TVS":3,"DIODE SMD ZENER":3,"DIODE TVS":7,"DIODE ZEN":3,"DIV ASSY":1,"DIV MOD/HOU":1,"DOUBLE TAPE":6,"DP CONV":1,"EDGE BOX":0,"EEPROM":2,"EPROM":2,"ETC":0,"ETC PART":0,"EXT BD ASSY":0,"FAN":0,"FAN ASSY":0,"FET":3,"FIFO":3,"FLEX DISPLAY":0,"FLT":2,"FLT DIP":0,"FLT SMD":2,"FOAM TAPE":6,"FOAM TAPE ASSY":4,"FOG":0,"FOG ASSY":0,"FOG CURVED":0,"FOG DB":0,"FOG FFS":0,"FOG IPS":0,"FOG KTMP":0,"FOG KTTP":0,"FOG PLS":0,"FOG RESIZED":0,"FOG TN":0,"FOG VA":0,"FPCB BD":0,"FPD":0,"FPGA":2,"FRAME ASSY":2,"FRAME(D)":3,"FRAME(E)":3,"FRAME(M)":3,"FRAME(P)":3,"FRAME(P)_MP":1,"FRC BD":0,"FRONT(D)":3,"FRONT(E)":3,"FRONT(M)":3,"FRONT(P)":3,"FRONT(P)_MP":1,"FUSE":3,"FUSE DIP":0,"FUSE HOLDER":1,"FUSE SMD":3,"FUSE/BREAKER":0,"G/PNL MOD":5,"G/PNL MOD(M)_MP":5,"G/PNL(D)":3,"G/PNL(E)":3,"G/PNL(M)":3,"G/PNL(P)":3,"GAME AS":0,"GAME CS → GAME SET CS":0,"GASKET EMI":7,"GLASS EMI FLT":2,"HANDLE(D)":3,"HANDLE(M)":3,"HDD SATA":1,"HDMI DUST CAP":0,"HDMI EXPANDER":2,"HDMI RX":1,"HDMI SWC":2,"HDMI TX":1,"HEAT SINK":1,"HLD":8,"HMI EV":0,"HN AC":6,"HN ACIO":6,"I2C DRV":2,"IC SOCKET":1,"IC_A-AMP":3,"IC_A-PRO":2,"IC_ADC":2,"IC_CLOCK":2,"IC_CTRL":3,"IC_DAC":2,"IC_DIFRX":1,"IC_DPCNV":1,"IC_EPROM":2,"IC_EXPAN":2,"IC_FPGA":2,"IC_FRAM":3,"IC_HDMRX":1,"IC_HDMSW":2,"IC_HDMTX":1,"IC_HDSDI":7,"IC_LAN":1,"IC_LEDRV":2,"IC_LINEDRV":2,"IC_LINEQ":2,"IC_LOGIC":3,"IC_MICOM":2,"IC_OPAMP":2,"IC_PHOTO":3,"IC_PMIC":2,"IC_PROSR":2,"IC_PWRSW":3,"IC_RAM":3,"IC_REG":4,"IC_RESET":2,"IC_RS232":3,"IC_RS485":3,"IC_RTC":2,"IC_SCALR":1,"IC_SHUNT":1,"IC_SWC":3,"IC_TCH":3,"IC_TIMER":2,"IC_UART":2,"IC_USBCT":2,"IC_V-AMP":2,"IC_V-CNV":2,"IC_V-MUX":2,"IC_V-SNC":1,"IC_VIDEO COMP":2,"IDB":0,"IFPD":0,"IGS":0,"INDU":4,"INDU DIP":4,"INDU SMD":0,"INSULATOR":7,"INTERFACE BD":0,"INV":1,"IO EXPANDER":2,"IO SWITCHER ASSY":0,"IR CAP":3,"IR RX":1,"IRX ASSY":0,"IT MONITOR":0,"JACK BNC":4,"JACK COUPLER":2,"JACK D-SUB":4,"JACK DC":3,"JACK DIN":4,"JACK DP":3,"JACK DVI":4,"JACK HDMI":5,"JACK MULTI":2,"JACK PHONE":4,"JACK PUSH TML":3,"JACK RCA":3,"JACK RJ11":2,"JACK RJ45":3,"JACK SCSI":3,"JACK USB":9,"JACK VGA":3,"JIG BACK LIGHT":0,"JIG BTN":0,"JIG TSP → JIG":0,"KBD":0,"KD LCM":0,"KD-LCM":0,"KD-OCM":0,"KD-OSM":0,"KD-OTM":0,"KE LCM":0,"KE-LCM":0,"KNOB":3,"LAN CARD":0,"LAN CONTR":1,"LCM":0,"LCM 3D":0,"LCM ASSY CURVED":0,"LCM ASSY KTMP":0,"LCM ASSY KTTM":0,"LCM ASSY KTTP":0,"LCM ASSY MLD":0,"LCM ASSY RESIZED":0,"LCM ASSY STD":0,"LCM DB":0,"LCM FFS":0,"LCM IPS":0,"LCM PLS":0,"LCM TN":0,"LCM VA":0,"LCM+TSP ASSY":0,"LED":4,"LED ACCESSARY":4,"LED ASSY":0,"LED DIP":4,"LED DRV":2,"LED KIT":0,"LED MOD":1,"LED MOD/HOU":1,"LED PIPE(M)":3,"LED SMD":3,"LED-ASM":1,"LED-MD":0,"LED-OD":0,"LED-SUB":1,"LED/ARR":0,"LED/HSG MOD":3,"LED/HSG(D)":3,"LED/HSG(E)":3,"LED/HSG(M)":3,"LED/HSG(P)":3,"LEDIS":4,"LENS":0,"LGP":0,"LGP MOD":0,"LINE EQ":2,"LOGIC":3,"LOT":0,"MAGNET":0,"MANGANESE BATT":0,"MASK FILM":2,"MB":1,"MED AS":0,"MED CS":0,"MEMBRANE SWC":1,"MIC":1,"MIC ASSY":0,"MICOM":2,"MILITARY → MIL":0,"MLCC":4,"MLF":1,"MNT":0,"MNT ASSY BTN":0,"MNT ASSY MVD":0,"MNT ASSY MVD-C":0,"MNT ASSY PTD":0,"MNT ASSY TVD":0,"MNT ASSY TVD-C":0,"MOUNT STAND":1,"MOUNT WALL → MOUNT":3,"MOUNT(D)":3,"MOUNT(E)":3,"MOUNT(M)":3,"MOUNT(P)":3,"MOUNT(P)_MP":1,"MVD":0,"MVD-C":0,"MVD-E":0,"MVD-P":0,"NAND FLASH":3,"NOISE FLT":2,"NOR FLASH":0,"OBM":0,"OD":0,"OLED":0,"OLED ASSY STD":0,"OP AMP":2,"OPTICAL FLT":0,"OPTICAL GLASS":0,"OPTICAL SHEET":0,"OS LICENSE LABEL":0,"OSC":3,"OSC DIP":3,"OSD BD":0,"OSD SMD":3,"P-CON":0,"P-CORD":3,"P-SOCKET":0,"PAD":8,"PATIENT MONITOR":0,"PBA-AD":1,"PBA-B":1,"PBA-CNV":1,"PBA-FRC":1,"PBA-M":1,"PBM AD":1,"PBM FRC":1,"PBM OSD":1,"PBM PDLC":1,"PBM SUB":1,"PBM TCH-CAM":1,"PBM TCH-CON":1,"PBM TCON":1,"PC":1,"PC ASSY":0,"PCB SUPPORT":7,"PD AS":0,"PD CS":0,"PDP":0,"PDP BUFFER PBM":0,"PDP IMG PBM":0,"PDP LOGIC PBM":0,"PDP MAIN PBM":0,"PDP MAIN+BUFFER PBM":0,"PDP PBM":0,"PDP POWER PBM":0,"PDP SKD PBM":0,"PDP → PDP SET":0,"PEN":0,"PHOTOCOUPLER":3,"PLD":2,"PODIUM":0,"POLARIZER":4,"POLYSW":4,"POLYSW SMD":4,"POTENTIOMETER":1,"PROCESSOR":2,"PROM":2,"PROTECTION FILM":3,"PROTECTION WRAP":0,"PRS/S":1,"PS_PART":3,"PTD":0,"PWR ASSY":0,"RAM MOD":3,"REG":0,"REG BOOST":0,"REG BUCK":4,"REG INVERT":3,"REG PMIC":2,"RELAY":1,"REMOCON":1,"RES":5,"RES DIP":5,"RES DIP AR":0,"RES MOR":0,"RES SMD":4,"RES SMD AR":4,"RES VR":0,"RES WIRE WOUND":0,"RESET IC":2,"RESIZED":0,"RESONATOR DIP":2,"RFT/S":1,"RS232DRV":3,"RS485DRV":3,"RTC":2,"RTC BATT":3,"RUGGED COMM":0,"S/RFT":2,"SDRAM":3,"SENSOR AMB":1,"SENSOR BD":0,"SENSOR GYRO":1,"SENSOR IMG":1,"SENSOR MAG":1,"SENSOR TCH":1,"SENSOR TMP":1,"SENSOR TOF":1,"SILICAGEL":0,"SMPS":2,"SMPS MOD":0,"SMPS O/F(OPEN FRAME)":2,"SMT NUT":0,"SOFTWARE":1,"SPEAKER":0,"SPEAKER ASSY":0,"SPRING":6,"SPT/P":3,"SRAM":3,"SRC C/S MOD":3,"SSD":0,"STAND(D)":3,"STAND(E)":3,"STAND(M)":3,"STAND(P)":3,"STAND(P)_MP":1,"STFN(D)":3,"STFN(E)":3,"STFN(M)":3,"STFN(P)":3,"STIFFENER(P)_MP":1,"SUB":0,"SUB MATERIAL":0,"SUB WORKING":0,"SUB(D)":3,"SUB(E)":3,"SUB(M)":3,"SUB(P)":3,"SUB(P)_MP":1,"SUB-P":0,"SUB-SG":0,"SUBSTRATE FILM":0,"SURGICAL →SG":0,"SW/PUSH-BTN":0,"SWC ANALOG":3,"SWC BUS":0,"SWC DIP":1,"SWC MICRO":1,"SWC POWER":0,"SWC PUSH-BTN":1,"SWC ROTARY":1,"SWC SLIDE":1,"SWC TACT":1,"SWC USB PWR":3,"SYSTEM TMR":2,"T-CON C/S MOD":3,"T-UPDATE TOOL → UPDATE TOOL":0,"TABLE TOUCH → TABLE":0,"TAPE EMI":6,"TAPE THERMAL":6,"TCD":0,"TCH IC":3,"THERMAL TAPE":6,"THERMISTOR":3,"TOP DISPLAY → MRI":0,"TOP_COVER(D)":3,"TOP_COVER(E)":3,"TOP_COVER(M)":3,"TOP_COVER(P)":3,"TOP_COVER(P)_MP":1,"TPR":0,"TPR-P":0,"TPR-S":0,"TR":4,"TRANS":1,"TSP ACTUATOR":1,"TSP ACTUATOR ASSY":0,"TSP CAM":2,"TSP CAM ASSY":3,"TSP CAP":1,"TSP CAP ASSY":0,"TSP CURVED":1,"TSP CURVED ASSY":0,"TSP INF":1,"TSP INF ASSY":0,"TSP MCT":0,"TSP MCT ASSY":0,"TSP OPT":1,"TSP OPT ASSY":0,"TSP PCT":1,"TSP PCT ASSY":0,"TSP PCT TSB":1,"TSP RES":1,"TSP RES ASSY":0,"TSP SAW":1,"TSP SAW ASSY":0,"TUBE":0,"TUNER":1,"TVD":0,"TVD-C":0,"TVD-P":0,"UART":2,"UGA":0,"UGA 1.2":0,"UGA 2.0":0,"US":0,"US CTRL →USCP":0,"US HCU":0,"US I/O BOX":0,"USB CONTR":2,"VARISTOR":2,"VARISTOR DIP":2,"VARISTOR SMD":1,"VGA CARD":1,"VIDEO AMP":2,"VIDEO COMP":2,"VIDEO DECODER → IC_V-DEC":2,"VIDEO ENCODER":0,"VIDEO EQ":2,"VIDEO HD SDI":7,"VIDEO LVDS":2,"VIDEO MUX":2,"VIDEO OSD":2,"VIDEO RAM":3,"VIDEO SCALER":1,"VIDEO SYNC":1,"VIDEOWALL → VW":0,"WIRELESS MOD":0,"WRAP(D)":3,"WRAP(E)":3,"WRAP(M)":3,"WRAP(P)":3,"WRAPPER(P)_MP":1,"X-TAL":5,"X-TAL DIP":5,"X-TAL SMD":4};

    // ── 판정·추출 ────────────────────────────────────────────────────────────

    /** 질문에서 부품 종류 찾기 — 카탈로그 kw 로만 본다(코드에 낱말을 박지 않는다). */
    window._bomPartKindHit = function (q) {
        var s = String(q || '').toLowerCase();
        var best = null, bestLen = 0;
        window.BOM_PART_KINDS.forEach(function (k) {
            k.kw.forEach(function (w) {
                var lw = String(w).toLowerCase();
                if (s.indexOf(lw) !== -1 && lw.length > bestLen) { best = k; bestLen = lw.length; }
            });
        });
        return best;
    };

    /** 이 자재그룹이 그 종류인가. `대분류/중분류` 전체·`대분류/`·중분류 이름 세 꼴을 받는다. */
    window._bomGroupIsKind = function (wgbez, kind) {
        var g = String(wgbez || '').toUpperCase().trim();
        if (!g || !kind) return false;
        var sub = g.indexOf('/') !== -1 ? g.slice(g.indexOf('/') + 1).trim() : g;
        return (kind.groups || []).some(function (p) {
            var P = String(p).toUpperCase().trim();
            if (P.slice(-1) === '/') return g.indexOf(P) === 0;      // 대분류 전부
            if (P.indexOf('/') !== -1) return g === P;               // 대분류/중분류 정확히
            return sub === P;                                        // 중분류 이름만
        });
    };

    /**
     * 내역에서 부품 이름 뽑기 — `<구분자>><값1>,<값2>,…`.
     * 구분자는 **가장 긴 것부터** 맞춘다(`FOG IPS` 가 `FOG` 보다 먼저 걸려야 한다).
     * 자리를 모르면 `null` — 부르는 쪽이 내역 전체를 보여준다(빈 값으로 속이지 않는다).
     */
    window._bomPartNameOf = function (ojtxp) {
        var s = String(ojtxp || '').trim();
        var gt = s.indexOf('>');
        if (gt <= 0) return null;
        var sep = s.slice(0, gt).trim().toUpperCase().replace(/\s+/g, ' ');
        var vals = s.slice(gt + 1).split(',');
        var POS = window.MATGROUP_NAME_POS || {};
        var idx = POS[sep];
        if (idx == null) {
            // 표에 그대로 없으면 **접두어가 가장 긴** 구분자로 맞춰 본다(`FOG IPS` ← `FOG`).
            var bestKey = '', k;
            for (k in POS) {
                if (sep.indexOf(k) === 0 && k.length > bestKey.length) bestKey = k;
            }
            if (!bestKey) return null;
            idx = POS[bestKey];
        }
        var v = (vals[idx] == null) ? '' : String(vals[idx]).trim();
        return v || null;
    };

    /** BOM 텍스트(TSV) → 행 배열. 백엔드가 주는 `text` 를 그대로 읽는다. */
    window._bomTextRows = function (text) {
        var out = [];
        String(text || '').split('\n').forEach(function (line) {
            if (line.charAt(0) !== '[' || line.indexOf('\t') === -1) return;
            var p = line.split('\t');
            if (p.length < 7) return;
            out.push({
                level: String(p[0]).replace(/[^\d]/g, ''),
                code: String(p[1]).trim(),
                desc: String(p[2]).trim(),
                qty: String(p[4]).trim(),
                unit: String(p[5]).trim(),
                group: String(p[6]).trim()
            });
        });
        return out;
    };

    /** 그 종류의 행만. 같은 자재가 여러 번 나오면(여러 상위에 물림) 한 번만. */
    window._bomPickParts = function (text, kind) {
        var seen = {}, out = [];
        window._bomTextRows(text).forEach(function (r) {
            if (!window._bomGroupIsKind(r.group, kind)) return;
            if (seen[r.code]) return;
            seen[r.code] = 1;
            r.name = window._bomPartNameOf(r.desc);
            out.push(r);
        });
        return out;
    };

    // ── 조회 ─────────────────────────────────────────────────────────────────

    /**
     * 자재 하나의 BOM 을 **다단계로** 받아 그 종류의 부품만 돌려준다.
     * ⚠️ explosion=multi 고정 — 단층으로는 패널이 안 나온다(실측, 위 주석 ①).
     */
    window.sapBomPartLookup = async function (material, kind, onStep) {
        var say = function (m) { try { if (onStep) onStep(m); } catch (e) { /* 진행 표시 실패가 조회를 막지 않게 */ } };
        say(_t('BOM 다단계 전개 중… (30~90초)', 'Exploding the BOM (multi-level, 30–90s)…'));
        var url = (window.BACKEND_BASE || 'http://127.0.0.1:5000')
                + '/sap-bom?material=' + encodeURIComponent(material)
                + '&plant=1000&tcode=single&explosion=multi&show_price=0&show_location=0';
        var res = await fetch(url);
        var j = await res.json();
        if (!j || !j.ok) throw new Error((j && j.error) || _t('BOM 조회 실패', 'BOM lookup failed'));
        var rows = window._bomTextRows(j.text);
        var hits = window._bomPickParts(j.text, kind);
        return { material: material, kind: kind, hits: hits, total: rows.length, raw: j.text };
    };

    /** 결과를 사람이 읽는 글로. 못 찾았으면 **무엇을 찾았는지**까지 밝힌다(조용히 0건 금지). */
    window.bomPartLookupText = function (r) {
        var kindName = (window._currentLang === 'en') ? r.kind.en : r.kind.ko;
        if (!r.hits.length) {
            var groups = {};
            window._bomTextRows(r.raw).forEach(function (x) { groups[x.group] = (groups[x.group] || 0) + 1; });
            var list = Object.keys(groups).sort().slice(0, 40).join(' · ');
            return '⚠️ ' + _t(r.material + ' BOM(' + r.total + '행)에 **' + kindName + '**(으)로 분류된 자재가 없습니다.',
                              'No **' + kindName + '** material in the BOM of ' + r.material + ' (' + r.total + ' rows).')
                 + '\n\n' + _t('이 BOM 에 있는 자재그룹: ', 'Material groups in this BOM: ') + list;
        }
        var head = '🔎 **' + r.material + '** ' + _t('에 사용된 ', ' — ') + kindName
                 + ' ' + r.hits.length + _t('건', '')
                 + _t('  (BOM ' + r.total + '행 다단계 전개)', '  (multi-level BOM, ' + r.total + ' rows)') + '\n\n';
        // ⚠️ 이름 옆에 **내역을 항상 같이** 보여준다. DESC' RULE 의 "제조사 품명" 자리가
        //    부품 종류에 따라 모델명이 아니라 제조사(예: BLU 의 `제조사,재질,…`)일 수 있고,
        //    ALV 가 내역을 잘라 보내기도 한다(끝의 `=`). 이름만 보여주면 그게 **조용한 오답**이 된다.
        var body = ['| ' + _t('이름', 'Name') + ' | ' + _t('내역(SAP)', 'Description (SAP)') + ' | ' + _t('자재코드', 'Material')
                  + ' | ' + _t('자재그룹', 'Group') + ' | ' + _t('단계', 'Lv') + ' | ' + _t('수량', 'Qty') + ' |',
                    '|---|---|---|---|---|---|'];
        var cut = 0;
        r.hits.forEach(function (h) {
            var d = h.desc;
            if (d.slice(-1) === '=') { cut++; d = d.slice(0, -1) + '…'; }
            if (d.length > 42) d = d.slice(0, 42) + '…';   // 좁은 모달에서 이름 칸을 밀어내지 않게
            body.push('| ' + (h.name || '—') + ' | ' + d + ' | ' + h.code
                    + ' | ' + h.group + ' | ' + h.level + ' | ' + h.qty + ' ' + h.unit + ' |');
        });
        var note = cut ? ('\n\n' + _t('※ 내역 끝의 …는 SAP 화면이 글자를 자른 것입니다(' + cut + '건).',
                                      '※ … means SAP truncated the description (' + cut + ' row(s)).')) : '';
        return head + body.join('\n') + note;
    };
})();
