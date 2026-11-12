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
    //   cats   : 찾은 부품의 사양서가 있는 **PARTS 구분**(js/23 `ELEC_CATEGORY_META` 의 키).
    //            여기에 경로를 적지 않는 이유 — NAS 경로를 보는 곳이 이미 넷이라 한 곳만 고치면
    //            조용히 0건이 된다(CLAUDE.md). 경로는 그 카탈로그에서 **읽어 온다**.
    //            적지 않은 종류는 📄 사양서 칩을 **안 보여준다**(누르면 아무 일도 안 나는 칩 금지).
    window.BOM_PART_KINDS = window.BOM_PART_KINDS || [
        { id: 'panel',   ko: '패널',      en: 'Panel',
          kw: ['패널', 'panel', 'lcd', 'lcm', 'fog', '액정', '디스플레이', 'display'],
          groups: ['DISPLAY/'], cats: ['PANEL'] },
        { id: 'touch',   ko: '터치',      en: 'Touch',
          kw: ['터치', 'touch', 'tsp', '터치스크린'],
          groups: ['TOUCH SCREEN MODULE', 'TOUCH SCREEN ASSY', 'TOUCH CONTROLLER', 'IC-TOUCH CONTROLLER'],
          cats: ['TOUCH CTRL', 'TOUCH / GLASS'] },
        { id: 'blu',     ko: 'BLU',       en: 'BLU',
          kw: ['blu', '백라이트', 'backlight', '광원', 'bm'],
          groups: ['BLU MODULE', 'BM PART MODULE', 'BM PART(ASSY)', 'LED MODULE'], cats: ['BLU'] },
        { id: 'board',   ko: '보드',      en: 'Board',
          kw: ['보드', 'pba', 'pcb', '기판', 'board', 'ad bd', '에이디보드'],
          groups: ['BD 반제품/', 'BARE PCB'], cats: ['AD BOARD', 'CONVERTER'] },
        { id: 'power',   ko: '파워',      en: 'Power',
          kw: ['파워', '전원', 'power', 'smps', '아답타', '어댑터', 'adapter'],
          groups: ['전장자재/POWER', 'POWER ASSY', 'CONVERTER'], cats: ['POWER'] },
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
          groups: ['포장자재/'], cats: ['PACKING'] },
        { id: 'mech',    ko: '기구물',    en: 'Mechanical',
          kw: ['기구', '사출', '프레스', 'mech', '브라켓', 'bracket'],
          groups: ['기구자재/', '기구반제품/'], cats: ['METAL', 'MOLD', 'DIE CAST'] }
    ];

    // ── 데이터 ② 구분자 → "제조사 품명" 이 몇 번째 값인가(0부터) ───────────────
    //   사내 자재그룹표 R100(2026-03-24) 의 DESC' RULE 에서 뽑았다. 구분자 860개 — 607개는 이름 칸이 있고,
    //   **253개는 −1**(규칙에 이름 칸이 없다 — 예: `재질,두께,위치,…`). −1 은 내역을 그대로 보여주라는 뜻이다.
    //   ⚠️ 이름 토큰은 세 가지만 인정한다 — `제조사 품명` · `모델명` · `보드명`(PBA 계열).
    //   `조립부품명`·`적용모델`은 **그 부품의 이름이 아니라** 제외하고, `제조사`만 있는 칸도 이름이 아니다
    //   (그 둘을 안 막아 BLU 가 제조사 코드를, 기구물이 `PAD` 를 이름이라고 답했다 — 2026-11-02 사용자 지적).
    //   ⚠️ 같은 구분자가 서로 다른 규칙으로 중복된 게 23개 있다(자리가 충돌) — 그럴 땐 고르지 않고 −1.
    //      한 쪽을 찍었다가 `RFT/S` 가 모델명 대신 `4M 여부`(`-`)를 이름이라고 내놓았다.
    window.MATGROUP_NAME_POS = window.MATGROUP_NAME_POS || {"ABS":-1,"ABS+GF20":-1,"ACQ AD BD":0,"AD BD":1,"AD CONV":2,"ADAPTOR":1,"ADHESIVE TAPE":6,"AL/COIL":-1,"AL/SHEET":-1,"ANT/S":-1,"ARCADE":0,"ASA":-1,"ATC":0,"ATC-S":0,"ATM":0,"ATM-C":0,"AUDIO AMP":3,"AUDIO PROCESSOR":2,"AVIONICS AD BD":0,"B/CVR":-1,"BACK ASSY":-1,"BACK ASSY(D)":-1,"BACK ASSY(E)":-1,"BACK ASSY(M)":-1,"BACK ASSY(P)":-1,"BACK MOD(D)":-1,"BACK MOD(E)":-1,"BACK MOD(M)":-1,"BACK MOD(P)":-1,"BACK(D)":3,"BACK(E)":3,"BACK(M)":3,"BACK(P)":3,"BACK(P)_MP":1,"BACK_PL(D)":3,"BACK_PL(E)":3,"BACK_PL(M)":3,"BACK_PL(P)":3,"BACK_PL(P)_MP":1,"BACK_SUB(D)":3,"BACK_SUB(E)":3,"BACK_SUB(M)":3,"BACK_SUB(P)":3,"BACK_SUB(P)_MP":1,"BADGE":3,"BAG":-1,"BASE(D)":3,"BASE(E)":3,"BASE(M)":3,"BASE(P)":3,"BASE(P)_MP":1,"BATT":-1,"BATT HOLDER":3,"BD REWORK":1,"BEAD":3,"BEAD DIP":3,"BEAD SMD":0,"BIMETAL":1,"BKT":-1,"BKT ASSY":-1,"BKT BASE":-1,"BKT CHASSIS":-1,"BKT CLAMP":-1,"BKT CORNER":-1,"BKT COVER":-1,"BKT CTRL":-1,"BKT GLASS":-1,"BKT HANDLE":-1,"BKT HINGE":-1,"BKT INV":-1,"BKT JACK":-1,"BKT KEY":-1,"BKT LINK":-1,"BKT MOD":-1,"BKT MOUNT":-1,"BKT MOUNT_MP":-1,"BKT PANEL":-1,"BKT PC":-1,"BKT PCB":-1,"BKT PCB_MP":-1,"BKT PSU":-1,"BKT SUB":-1,"BKT SUB(M)_MP":-1,"BKT SUB_MP":-1,"BKT WALL":-1,"BLU CCFL ASSY":0,"BLU CUSTOM ASSY":-1,"BLU LED ASSY":-1,"BLU SUB MATERIAL":0,"BM":1,"BM CS":-1,"BONDING":2,"BOX ACC":-1,"BOX ANGLE":-1,"BOX CAP":-1,"BOX CTN":-1,"BOX SYS":-1,"BTM_COVER(D)":3,"BTM_COVER(E)":3,"BTM_COVER(M)":3,"BTM_COVER(P)":3,"BTM_COVER(P)_MP":1,"BTN":0,"BTN DECK":0,"BTN-C":0,"BTN-P":0,"BUFFER":0,"BUSHING":1,"BUTTON(M)":-1,"BUZZER":2,"C/BTM ASSY":-1,"C/BTM MOD":-1,"C/BTM(D)":3,"C/BTM(E)":3,"C/BTM(M)":3,"C/BTM(P)":3,"C/BTM(P)_MP":1,"C/TOP ASSY":-1,"C/TOP MOD":-1,"C/TOP(D)":3,"C/TOP(E)":3,"C/TOP(M)":3,"C/TOP(P)":3,"C/TOP(P)_MP":1,"CABLE TIE":-1,"CAM MOD":1,"CAP":4,"CAP DIP":4,"CAP DIP EL":0,"CAP DIP POLY":0,"CAP SMD":4,"CAP SMD EL":0,"CAP SMD POLY":0,"CAP SMD TANTAL":0,"CB ANTENA":1,"CB BNC":2,"CB DP":2,"CB DP+DVI":2,"CB DP+VGA":2,"CB DSUB":3,"CB DVI":4,"CB DVI+HDMI":2,"CB DVI+VGA":2,"CB HDMI":3,"CB LAN":2,"CB STEREO":3,"CB USB":9,"CB VGA":3,"CBN BTN":0,"CBN SUB":0,"CBN WRAP":0,"CBN-G":0,"CBN-L":0,"CD":-1,"CHARGER":1,"CLAMP CABLE":-1,"CLAMP PCB SUPPORT":-1,"CLINCH NUT":-1,"CLINICAL →CR":0,"CLK DRV":2,"CLK SYNTH":2,"CLUSTER CENTER FASCIA → CAR":0,"CNV/INV":0,"CON":2,"CON AN":3,"CON HOU":2,"CON SR":2,"CONV":1,"CONV SIG":0,"CORE CLIP":0,"CORE RING":0,"COVER MOD":-1,"COVER(D)":3,"COVER(E)":3,"COVER(M)":3,"COVER(P)":3,"COVER(P)_MP":1,"CPS/S":-1,"CPU DUAL":1,"CRT":0,"CTRL MOD/HOU":1,"CUSHION(EPS)":-1,"CUSHION(PE FOAM)":-1,"CVR":-1,"CVR2":-1,"CVT C/S (D)":-1,"CVT C/S (E)":-1,"CVT C/S (M)":-1,"CVT C/S (P)":-1,"CVT C/S MOD":-1,"D-BLU":-1,"D/CVR":-1,"DA CONV":2,"DANPLA":-1,"DB ASSY":0,"DBEF":-1,"DC CORD":0,"DDC MANAGER":0,"DDR":0,"DDR2":0,"DDR3":0,"DDR4":0,"DEBUG BD":0,"DECAL":3,"DELETE":-1,"DEMUX(IO-EXTENDER)":2,"DFF/P":-1,"DFF/S":-1,"DIAGNOSTIC →DN":0,"DIFF ASSY":-1,"DIFF. RX":1,"DIFFUSION(M)":-1,"DIODE":3,"DIODE DIP":3,"DIODE DIP TVS":7,"DIODE SMD":2,"DIODE SMD SCH":2,"DIODE SMD TVS":3,"DIODE SMD ZENER":3,"DIODE TVS":7,"DIODE ZEN":3,"DIV ASSY":1,"DIV MOD/HOU":1,"DOUBLE TAPE":6,"DP CONV":1,"E-BLU":-1,"EDGE BOX":0,"EEPROM":2,"EMI TAPE":-1,"EPROM":2,"ETC":0,"ETC PART":0,"EXT BD ASSY":0,"FAN":0,"FAN ASSY":0,"FET":3,"FIFO":3,"FLEX DISPLAY":0,"FLT":2,"FLT DIP":0,"FLT SMD":2,"FOAM TAPE":6,"FOAM TAPE ASSY":4,"FOG":0,"FOG ASSY":0,"FOG CURVED":0,"FOG DB":0,"FOG FFS":0,"FOG IPS":0,"FOG KTMP":0,"FOG KTTP":0,"FOG PLS":0,"FOG RESIZED":0,"FOG TN":0,"FOG VA":0,"FPCB":0,"FPCB BD":0,"FPD":0,"FPGA":2,"FRAME ASSY":2,"FRAME ASSY(D)":-1,"FRAME ASSY(M)":-1,"FRAME ASSY(P)":-1,"FRAME MOD(D)":-1,"FRAME MOD(E)":-1,"FRAME MOD(M)":-1,"FRAME MOD(P)":-1,"FRAME(D)":3,"FRAME(E)":3,"FRAME(M)":3,"FRAME(M)_MP":-1,"FRAME(P)":3,"FRAME(P)_MP":1,"FRC BD":0,"FRM":-1,"FRONT ASSY":-1,"FRONT ASSY(D)":-1,"FRONT ASSY(E)":-1,"FRONT ASSY(M)":-1,"FRONT ASSY(P)":-1,"FRONT MOD(D)":-1,"FRONT MOD(E)":-1,"FRONT MOD(M)":-1,"FRONT MOD(P)":-1,"FRONT(D)":3,"FRONT(E)":3,"FRONT(M)":3,"FRONT(P)":3,"FRONT(P)_MP":1,"FRT/PART":-1,"FUSE":-1,"FUSE DIP":0,"FUSE HOLDER":1,"FUSE SMD":3,"FUSE/BREAKER":0,"G/PNL ASSY":-1,"G/PNL MOD":-1,"G/PNL MOD(M)_MP":-1,"G/PNL(D)":3,"G/PNL(E)":3,"G/PNL(M)":3,"G/PNL(P)":3,"GAME AS":-1,"GAME CS":-1,"GAME CS → GAME SET CS":-1,"GASKET EMI":7,"GENDER BD":-1,"GENERAL AD BD":0,"GENESIS WFRC BD":0,"GENESIS WOFRC BD":0,"GLASS CHEM":-1,"GLASS EMI FLT":2,"GLASS NON":-1,"GLASS SEMI":-1,"GLASS TEMP":-1,"GUIDE(M)":-1,"HANDLE(D)":3,"HANDLE(M)":3,"HDD SATA":1,"HDMI DUST CAP":0,"HDMI EXPANDER":2,"HDMI RX":1,"HDMI SWC":2,"HDMI TX":1,"HEAT SINK":-1,"HLD":-1,"HMI EV":0,"HN AC":-1,"HN ACIO":-1,"HN AD_PWR":-1,"HN BTB":-1,"HN BTW":-1,"HN FFC":-1,"HN INV":-1,"HN LVDS":-1,"HN MULTI":-1,"HN VBY1":-1,"HN WIRE":-1,"I/S PROCESS":-1,"I2C DRV":2,"IC SOCKET":1,"IC_A-AMP":3,"IC_A-PRO":2,"IC_ADC":2,"IC_CLOCK":2,"IC_CTRL":3,"IC_DAC":2,"IC_DIFRX":1,"IC_DPCNV":1,"IC_EPROM":2,"IC_EXPAN":2,"IC_FPGA":2,"IC_FRAM":3,"IC_HDMRX":1,"IC_HDMSW":2,"IC_HDMTX":1,"IC_HDSDI":7,"IC_LAN":1,"IC_LEDRV":2,"IC_LINEDRV":2,"IC_LINEQ":2,"IC_LOGIC":3,"IC_MICOM":2,"IC_OPAMP":2,"IC_PHOTO":3,"IC_PMIC":2,"IC_PROSR":2,"IC_PWRSW":3,"IC_RAM":3,"IC_REG":4,"IC_RESET":2,"IC_RS232":3,"IC_RS485":3,"IC_RTC":2,"IC_SCALR":1,"IC_SHUNT":1,"IC_SWC":3,"IC_TCH":3,"IC_TIMER":2,"IC_UART":2,"IC_USBCT":2,"IC_V-AMP":2,"IC_V-CNV":2,"IC_V-MUX":2,"IC_V-SNC":1,"IC_VIDEO COMP":2,"IDB":0,"IFP AD BD":0,"IFPD":0,"IGS":0,"INDU":4,"INDU DIP":4,"INDU SMD":0,"INNER BOX":-1,"INSERT":-1,"INSULATE(M)":-1,"INSULATOR":7,"INTERFACE BD":0,"INV":1,"IO EXPANDER":2,"IO SWITCHER ASSY":0,"IO SWITCHER BD":-1,"IR CAP":3,"IR RX":1,"IRIS ASSY":-1,"IRX ASSY":0,"IRX CONTR BD":-1,"IT MONITOR":0,"IWB AD BD":0,"JACK BD":0,"JACK BNC":4,"JACK COUPLER":2,"JACK D-SUB":4,"JACK DC":3,"JACK DIN":4,"JACK DP":3,"JACK DVI":4,"JACK HDMI":5,"JACK MULTI":2,"JACK PHONE":4,"JACK PUSH TML":3,"JACK RCA":3,"JACK RJ11":2,"JACK RJ45":3,"JACK SCSI":3,"JACK USB":9,"JACK VGA":3,"JIG BACK LIGHT":0,"JIG BTN":0,"JIG TSP → JIG":0,"JOYSTICK BD":-1,"KBD":0,"KD LCM":0,"KD OCM":-1,"KD OTM":-1,"KD-LCM":0,"KD-OCM":0,"KD-OSM":0,"KD-OTM":0,"KE LCM":0,"KE-LCM":0,"KNOB":3,"LABEL PLATE":-1,"LABEL STICKER":-1,"LAN CARD":0,"LAN CONTR":1,"LCM":0,"LCM 3D":0,"LCM ASSY CURVED":0,"LCM ASSY KTMP":0,"LCM ASSY KTTM":0,"LCM ASSY KTTP":0,"LCM ASSY MLD":0,"LCM ASSY RESIZED":0,"LCM ASSY STD":0,"LCM DB":0,"LCM FFS":0,"LCM IPS":0,"LCM PLS":0,"LCM TN":0,"LCM VA":0,"LCM+TSP ASSY":0,"LED":-1,"LED ACCESSARY":-1,"LED ASSY":0,"LED BD":-1,"LED DIP":4,"LED DISPLAY CS":-1,"LED DRV":2,"LED KIT":0,"LED MOD":1,"LED MOD/HOU":1,"LED PIPE(M)":3,"LED SMD":3,"LED-ASM":-1,"LED-MD":0,"LED-OD":0,"LED-SUB":-1,"LED/ARR":0,"LED/ARR ASSY":-1,"LED/HSG ASSY":-1,"LED/HSG MOD":-1,"LED/HSG(D)":3,"LED/HSG(E)":3,"LED/HSG(M)":3,"LED/HSG(P)":3,"LEDIS":-1,"LENS":-1,"LEVER(M)":-1,"LGP":3,"LGP ASSY":-1,"LGP MOD":-1,"LICENSE KEY":-1,"LINE EQ":2,"LOGIC":3,"LOT":0,"M-SCREW":-1,"M-TAP SCREW":-1,"MAGNET":-1,"MAIN BD":-1,"MANGANESE BATT":0,"MANUAL":-1,"MASK FILM":-1,"MB":1,"MED AS":-1,"MED CS":-1,"MEMBRANE SWC":1,"MEMORY STICK BD":-1,"MIC":1,"MIC ASSY":0,"MICOM":2,"MILITARY → MIL":0,"MLCC":4,"MLF":-1,"MNT":0,"MNT ASSY BTN":0,"MNT ASSY MVD":0,"MNT ASSY MVD-C":0,"MNT ASSY PTD":0,"MNT ASSY TVD":0,"MNT ASSY TVD-C":0,"MNT WFRC BD":0,"MNT WOFRC BD":0,"MONITOR AD BD":0,"MOUNT STAND":1,"MOUNT WALL → MOUNT":3,"MOUNT(D)":3,"MOUNT(E)":3,"MOUNT(M)":3,"MOUNT(P)":3,"MOUNT(P)_MP":1,"MPPO":-1,"MSTAR WFRC BD":0,"MSTAR WOFRC BD":0,"MULTI AD BD":0,"MVD":0,"MVD-C":0,"MVD-E":0,"MVD-P":0,"NAND FLASH":3,"NOISE FLT":2,"NOR FLASH":0,"NOVATEK WFRC BD":0,"NOVATEK WOFRC BD":0,"NUT":-1,"O/S PROCESS":-1,"OBM":0,"OCM/C":-1,"OD":0,"OLD":-1,"OLED":0,"OLED ASSY STD":0,"OP AMP":2,"OPTICAL FILM LAMI":-1,"OPTICAL FLT":3,"OPTICAL GLASS":0,"OPTICAL GLASS ASSY":-1,"OPTICAL SHEET":-1,"OS LICENSE LABEL":0,"OSC":3,"OSC DIP":3,"OSD BD":0,"OSD SMD":3,"P-CON":0,"P-CORD":3,"P-SOCKET":0,"PACKING ASSY":-1,"PAD":-1,"PAD THERMAL":-1,"PALLET":-1,"PAPER CARD":-1,"PAPER PRINT":-1,"PATIENT MONITOR":0,"PBA-AD":1,"PBA-B":1,"PBA-CNV":1,"PBA-FRC":1,"PBA-LED":-1,"PBA-M":1,"PBA-OSD":-1,"PBA-S":-1,"PBA-T":0,"PBM AD":1,"PBM FRC":1,"PBM OSD":1,"PBM PDLC":1,"PBM SUB":1,"PBM TCH-CAM":1,"PBM TCH-CON":1,"PBM TCON":1,"PC":1,"PC ASSY":0,"PC+GF10":-1,"PC+GF20":-1,"PC/ABS":-1,"PCB JIG":0,"PCB MAIN":0,"PCB OSD":0,"PCB PWR":0,"PCB SUB":0,"PCB SUPPORT":7,"PCB TCH":0,"PCB USB":0,"PCM/COIL":-1,"PCM/SHEET":-1,"PD AS":-1,"PD CS":-1,"PDP":0,"PDP BUFFER PBM":0,"PDP IMG PBM":0,"PDP LOGIC PBM":0,"PDP MAIN PBM":0,"PDP MAIN+BUFFER PBM":0,"PDP PBM":0,"PDP POWER PBM":0,"PDP SKD PBM":0,"PDP → PDP SET":0,"PEN":-1,"PHOTOCOUPLER":3,"PIXELWORKS WFRC BD":0,"PIXELWORKS WOFRC BD":0,"PLD":2,"PODIUM":0,"PODIUM AD BD":0,"POLARIZER":4,"POLYSW":4,"POLYSW SMD":4,"POM":-1,"POM+GF20":-1,"POTENTIOMETER":1,"PPE/PS+GF10":-1,"PROCESSOR":2,"PROM":2,"PROTECTION FILM":-1,"PROTECTION WRAP":0,"PRS/S":-1,"PS_PART":3,"PTD":0,"PWR ASSY":0,"PWR BD":-1,"RACK(M)":-1,"RAM MOD":3,"REALTEK WFRC BD":0,"REALTEK WOFRC BD":0,"REG":0,"REG BOOST":0,"REG BUCK":4,"REG INVERT":3,"REG PMIC":2,"RELAY":1,"REMOCON":1,"RES":5,"RES DIP":5,"RES DIP AR":0,"RES MOR":0,"RES SMD":4,"RES SMD AR":4,"RES VR":0,"RES WIRE WOUND":0,"RESET IC":2,"RESIZED":0,"RESONATOR DIP":2,"RFT/S":-1,"RIVET":-1,"RS232DRV":3,"RS485DRV":3,"RTC":2,"RTC BATT":-1,"RUBBER":-1,"RUGGED COMM":0,"S/BAR(E)":-1,"S/BAR(P)":-1,"S/RFT":2,"SAMPLE 사용금지]":-1,"SCREW MACHINE":-1,"SCREW SPECIAL":-1,"SCREW TAPPING":-1,"SCREW TAPTITE":-1,"SDRAM":3,"SECC/COIL":-1,"SECC/SHEET":-1,"SENSOR AMB":1,"SENSOR BD":0,"SENSOR GYRO":1,"SENSOR IMG":1,"SENSOR MAG":1,"SENSOR TCH":1,"SENSOR TMP":1,"SENSOR TOF":1,"SERVICE":-1,"SGCC/COIL":-1,"SGCC/SHEET":-1,"SGI AD BD":0,"SHD":-1,"SILICAGEL":0,"SKD-ETC":-1,"SMPS":2,"SMPS MOD":0,"SMPS O/F(OPEN FRAME)":2,"SMT NUT":0,"SOFTWARE":1,"SPCC/COIL":-1,"SPCC/SHEET":-1,"SPEAKER":0,"SPEAKER ASSY":0,"SPECIAL AD BD":0,"SPECIAL SCREW":-1,"SPRING":6,"SPT/P":3,"SRAM":3,"SRC C/S MOD":-1,"SRC C/S(D)":-1,"SRC C/S(E)":-1,"SRC C/S(M)":-1,"SRC C/S(P)":-1,"SSD":0,"STAND MOD(D)":-1,"STAND MOD(E)":-1,"STAND MOD(M)":-1,"STAND MOD(P)":-1,"STAND OFF":-1,"STAND(D)":3,"STAND(E)":3,"STAND(M)":3,"STAND(P)":3,"STAND(P)_MP":1,"STFN(D)":3,"STFN(E)":3,"STFN(M)":3,"STFN(P)":3,"STIFFENER(P)_MP":1,"STS/COIL":-1,"STS/SHEET":-1,"STUD":-1,"SUB":0,"SUB BD":-1,"SUB MATERIAL":0,"SUB WORKING":0,"SUB(D)":3,"SUB(E)":3,"SUB(M)":3,"SUB(P)":3,"SUB(P)_MP":1,"SUB-P":0,"SUB-SG":0,"SUBSTRATE FILM":-1,"SURGICAL →SG":0,"SW/PUSH-BTN":0,"SWC ANALOG":3,"SWC BUS":0,"SWC DIP":1,"SWC MICRO":1,"SWC POWER":0,"SWC PUSH-BTN":1,"SWC ROTARY":1,"SWC SLIDE":1,"SWC TACT":1,"SWC USB PWR":3,"SYSTEM TMR":2,"T-CON C/S MOD":-1,"T-CON C/S(D)":-1,"T-CON C/S(E)":-1,"T-CON C/S(M)":-1,"T-CON C/S(P)":-1,"T-UPDATE TOOL → UPDATE TOOL":0,"T/CVR":-1,"TABLE TCH AD BD":0,"TABLE TOUCH → TABLE":0,"TAPE EMI":6,"TAPE THERMAL":6,"TAPPING SCREW":-1,"TCD":0,"TCH IC":3,"THERMAL PAD":-1,"THERMAL TAPE":6,"THERMISTOR":3,"TOP DISPLAY → MRI":0,"TOP_COVER(D)":3,"TOP_COVER(E)":3,"TOP_COVER(M)":3,"TOP_COVER(P)":3,"TOP_COVER(P)_MP":1,"TPR":0,"TPR-P":0,"TPR-S":0,"TPU":-1,"TR":4,"TRANS":1,"TSP ACTUATOR":1,"TSP ACTUATOR ASSY":0,"TSP CAM":2,"TSP CAM ASSY":3,"TSP CAP":1,"TSP CAP ASSY":0,"TSP CURVED":1,"TSP CURVED ASSY":0,"TSP INF":1,"TSP INF ASSY":0,"TSP MCT":0,"TSP MCT ASSY":0,"TSP OPT":1,"TSP OPT ASSY":0,"TSP PCT":1,"TSP PCT ASSY":0,"TSP PCT TSB":1,"TSP RES":1,"TSP RES ASSY":0,"TSP SAW":1,"TSP SAW ASSY":0,"TUBE":0,"TUNER":1,"TV AD BD":0,"TVD":0,"TVD-C":0,"TVD-P":0,"UART":2,"UGA":0,"UGA 1.2":0,"UGA 2.0":0,"US":0,"US AD BD":0,"US CTRL →USCP":0,"US HCU":0,"US I/O BOX":0,"USB BD":-1,"USB CONTR":2,"VARISTOR":2,"VARISTOR DIP":2,"VARISTOR SMD":1,"VGA CARD":1,"VIDEO AMP":2,"VIDEO COMP":2,"VIDEO DECODER → IC_V-DEC":2,"VIDEO ENCODER":0,"VIDEO EQ":2,"VIDEO HD SDI":7,"VIDEO LVDS":2,"VIDEO MUX":2,"VIDEO OSD":2,"VIDEO RAM":3,"VIDEO SCALER":1,"VIDEO SYNC":1,"VIDEOWALL → VW":0,"WASHER":-1,"WIN":-1,"WIRELESS MOD":0,"WOODEN BOX":-1,"WRAP(D)":3,"WRAP(E)":3,"WRAP(M)":3,"WRAP(P)":3,"WRAPPER(P)_MP":1,"X-TAL":5,"X-TAL DIP":5,"X-TAL SMD":4,"개발용 신규 DISPLAY":-1,"개발용 신규 기구자재":-1,"개발용 신규 전장자재":-1,"개발용 신규 포장자재":-1,"개발용 신규 회로자재":-1};

    // ── 데이터 ③ 구분자 이름으로 바로 물을 때 ─────────────────────────────────
    //  사용자 실제 질문(2026-11-02): "999001 제품에 사용된 **HN VBY1** 명 확인해줘".
    //  `HN VBY1` 은 부품 **종류**가 아니라 내역 **구분자**다. kw 에 없어서 이 기능이 안 걸렸고,
    //  질문이 SAP 일반 경로로 새서 494행 BOM 이 통째로 AI 에게 갈 뻔했다.
    //  → 어휘를 한 줄 더 박지 않는다. **이미 데이터로 있는 구분자 860개**(MATGROUP_NAME_POS 의 키)를
    //    그대로 어휘로 쓴다. 사내에서 부품을 부르는 말이 원래 이것이다.
    //  ⚠️ 짧은 키(`PC`·`SUB`·`BM`·`ETC`)는 아무 문장에나 걸린다 — 길이 하한 + 앞뒤가 영숫자면 제외
    //     (js/55 에서 `654321` 이 `1654321` 안에 걸려 남의 도면을 끌어온 것과 같은 가드).
    window.BOM_SEP_MIN = window.BOM_SEP_MIN || 4;
    //  부품 이름이 될 수 없는 구분자(표에는 있지만 공정·관리용) — 데이터.
    window.BOM_SEP_STOPWORDS = window.BOM_SEP_STOPWORDS || [
        'DELETE', 'SERVICE', 'ETC', 'ETC PART', 'OLD', 'SUB WORKING', 'I/S PROCESS',
        'O/S PROCESS', 'LICENSE KEY', 'SOFTWARE', 'BD REWORK', 'SAMPLE 사용금지]'
    ];

    /** 질문 안의 **구분자 이름**(가장 긴 것). 없으면 null. */
    window._bomSepHit = function (q) {
        var s = String(q || '').toUpperCase().replace(/\s+/g, ' ');
        var POS = window.MATGROUP_NAME_POS || {};
        var stop = window.BOM_SEP_STOPWORDS, best = '';
        for (var k in POS) {
            if (k.length < window.BOM_SEP_MIN || k.length <= best.length) continue;
            if (stop.indexOf(k) >= 0) continue;
            var i = s.indexOf(k);
            if (i < 0) continue;
            var before = i > 0 ? s.charAt(i - 1) : ' ';
            var after = s.charAt(i + k.length) || ' ';
            if (/[A-Z0-9]/.test(before) || /[A-Z0-9]/.test(after)) continue;   // 남의 말 안에 걸린 것
            best = k;
        }
        return best || null;
    };

    /** 구분자 하나를 종류처럼 쓰는 임시 종류. `seps` 가 있으면 자재그룹이 아니라 **내역 구분자**로 가른다. */
    window._bomSepKind = function (sep) {
        return { id: 'sep_' + sep, ko: sep, en: sep, kw: [], groups: [], seps: [sep] };
    };

    /** 내역(`<구분자>><값…>`)의 구분자가 그중 하나인가. `FOG` 로 물으면 `FOG IPS` 도 받는다. */
    window._bomDescSepIs = function (ojtxp, seps) {
        var s = String(ojtxp || '');
        var gt = s.indexOf('>');
        if (gt <= 0) return false;
        var sep = s.slice(0, gt).trim().toUpperCase().replace(/\s+/g, ' ');
        return (seps || []).some(function (p) {
            var P = String(p).toUpperCase().trim();
            return sep === P || sep.indexOf(P + ' ') === 0;
        });
    };

    /** 이 자재그룹이 속하는 **진짜** 종류(칩의 NAS 사양서 폴더를 고르는 데 쓴다). */
    window._bomRealKindFor = function (group) {
        return (window.BOM_PART_KINDS || []).filter(function (k) {
            return window._bomGroupIsKind(group, k);
        })[0] || null;
    };

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
        // −1 = **표에 있고, 이름 칸이 없는** 구분자(예: 규칙이 `재질,두께,…` 뿐).
        //      이때는 접두어로 남의 규칙을 끌어오면 안 된다 — `PBA-T` 가 `PBA` 규칙을 집어
        //      PCB 버전(`V20`)을 보드 이름이라고 답하던 자리다(2026-11-02 사용자 지적).
        if (idx === -1) return null;
        if (idx == null) {
            // 표에 그대로 없을 때만 **접두어가 가장 긴** 구분자로 맞춰 본다(`FOG IPS` ← `FOG`).
            var bestKey = '', k;
            for (k in POS) {
                if (sep.indexOf(k) === 0 && k.length > bestKey.length) bestKey = k;
            }
            if (!bestKey || POS[bestKey] === -1) return null;
            idx = POS[bestKey];
        }
        var v = (vals[idx] == null) ? '' : String(vals[idx]).trim();
        // SAP 내역은 빈 칸을 `-` 로 채운다 — 그걸 이름이라고 내놓으면 안 된다(광학필름에서 실제로 났다).
        if (!v || v === '-' || v === '—' || v.toUpperCase() === 'N/A') return null;
        // 끝의 `=` 는 ALV 가 **글자를 자른 자리**다. 잘린 조각(`UK-`)을 부품 이름이라고 내놓지 않는다.
        if (v.slice(-1) === '=') return null;
        return v;
    };

    /**
     * BOM 텍스트(TSV) → 행 배열. [2026-11-12] **탭 위치를 고정으로 읽지 않는다** — BOM 탭의
     * 진짜 파서(`_bomParseSapText`, js/38)를 그대로 쓴다. 전엔 `p[6]`을 무조건 자재그룹으로
     * 읽었는데, SAP 계정이 팀 공용이라 누가 `/KTK_LOC` 레이아웃의 **열 구성**을 바꾸면(정렬뿐
     * 아니라 열을 추가·삭제·이동해도) 이 조회가 **조용히 다른 칸을 자재그룹으로 읽는다** —
     * BOM 탭이 겪은 "다른 사용자 레이아웃 변경" 사고(CLAUDE.md js/38 항목)와 같은 종류다.
     * `_bomParseSapText`는 머리글 행에서 열 이름(STUFE/IDNRK/OJTXP/MENGE/MMEIN/WGBEZ60)을
     * 찾아 그 이름으로 칸을 읽으므로, 열 순서가 바뀌어도 올바른 칸을 읽는다. 설치지점(EBORT)
     * 연속 행 병합도 같이 물려받는다(이 조회는 `show_location=0`이라 보통 안 생기지만, 공용
     * 레이아웃에 누가 Location Information을 켜 두면 생길 수 있다 — 조용히 깨지는 대신 처리됨).
     */
    window._bomTextRows = function (text) {
        var parsed = window._bomParseSapText ? window._bomParseSapText(text) : null;
        if (!parsed) return [];
        return (parsed.rows || []).map(function (o) {
            return {
                level: String(o._level == null ? '' : o._level),
                code: String(o.IDNRK || '').trim(),
                desc: String(o.OJTXP || '').trim(),
                qty: String(o.MENGE || '').trim(),
                unit: String(o.MMEIN || '').trim(),
                group: String(o.WGBEZ60 || '').trim()
            };
        });
    };

    /** 그 종류의 행만. 같은 자재가 여러 번 나오면(여러 상위에 물림) 한 번만. */
    window._bomPickParts = function (text, kind) {
        var seen = {}, out = [];
        //  구분자로 물었으면(`seps`) 내역 구분자로, 아니면 자재그룹으로 가른다.
        var bySep = !!(kind && kind.seps && kind.seps.length);
        window._bomTextRows(text).forEach(function (r) {
            var hit = bySep ? window._bomDescSepIs(r.desc, kind.seps)
                            : window._bomGroupIsKind(r.group, kind);
            if (!hit) return;
            if (seen[r.code]) return;
            seen[r.code] = 1;
            r.name = window._bomPartNameOf(r.desc);
            //  칩 메뉴(js/40 `QA_ROW_CHIP_KINDS.bompart`)는 행 하나만 받는다 — 그 행이 어떤
            //  종류로 걸린 건지 알아야 사양서 폴더를 고를 수 있어서 종류를 행에 달아 둔다.
            //  구분자로 물었을 땐 그 임시 종류엔 PARTS 구분이 없으므로 **자재그룹으로 진짜 종류**를
            //  찾아 단다(그래야 `FOG IPS` 로 물어도 📄 사양서 칩이 나온다).
            r.kind = bySep ? (window._bomRealKindFor(r.group) || kind) : kind;
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
        // 🆕 [2026-11-12] BOM 탭(js/38 bomFetchFromSap)과 같은 1회 재시도 — 간헐적으로 SAP이
        //    결과 그리드 대신 선택화면(source:'fields')을 돌려준다(고정 sleep 네비게이션의 한계).
        var j = null, attempt = 0;
        while (attempt < 2) {
            attempt++;
            var res = await fetch(url);
            j = await res.json();
            if (!j || !j.ok) throw new Error((j && j.error) || _t('BOM 조회 실패', 'BOM lookup failed'));
            if (j.source === 'grid') break;
            if (attempt < 2) say(_t('결과 화면을 못 읽어 재시도합니다…', 'Could not read result screen — retrying…'));
        }
        if (j.source !== 'grid') {
            throw new Error(_t('SAP가 BOM 결과 표 대신 다른 화면을 돌려줬습니다(source: ' + j.source + '). 자재번호를 확인하거나 잠시 뒤 다시 시도해주세요.',
                'SAP returned a non-table screen (source: ' + j.source + '). Check the material number or retry.'));
        }
        var rows = window._bomTextRows(j.text);
        var hits = window._bomPickParts(j.text, kind);
        // 🆕 [2026-11-12] BOM 탭이 쓰는 레이아웃·정렬 진단을 그대로 물려받는다 — 백엔드는 이미
        //    이 값들을 돌려주고 있었는데(`sap_bridge_32.fetch_bom`) 여기선 지금까지 버리고 있었다.
        //    팀 공용 SAP 계정이라 누가 레이아웃을 못 적용되게 만들거나(`layoutApplied:false`) 그
        //    레이아웃에 정렬을 넣으면(`sortInfo`) 조용히 다른 결과를 줄 수 있다 — 삼키지 않는다.
        return {
            material: material, kind: kind, hits: hits, total: rows.length, raw: j.text,
            layoutApplied: j.layoutApplied, layoutDiag: j.layoutDiag || '',
            sortInfo: j.sortInfo || null, sortDiag: j.sortDiag || '',
            truncated: !!j.truncated, totalRows: j.totalRows || 0
        };
    };

    /** 결과를 사람이 읽는 글로. 못 찾았으면 **무엇을 찾았는지**까지 밝힌다(조용히 0건 금지). */
    window.bomPartLookupText = function (r) {
        var kindName = (window._currentLang === 'en') ? r.kind.en : r.kind.ko;
        if (!r.hits.length) {
            //  "없음"과 "못 찾음"을 사람이 가를 수 있게 **그 BOM 에 실제로 있던 것**을 보여준다.
            //  구분자로 물었으면 구분자 목록을(그 말이 맞는지 봐야 하니까), 아니면 자재그룹 목록을.
            var bySep = !!(r.kind && r.kind.seps && r.kind.seps.length);
            var seen = {};
            window._bomTextRows(r.raw).forEach(function (x) {
                var key = x.group;
                if (bySep) {
                    var gt = String(x.desc || '').indexOf('>');
                    key = gt > 0 ? String(x.desc).slice(0, gt).trim().toUpperCase().replace(/\s+/g, ' ') : '';
                }
                if (key) seen[key] = (seen[key] || 0) + 1;
            });
            var list = Object.keys(seen).sort().slice(0, 40).join(' · ');
            return '⚠️ ' + _t(r.material + ' BOM(' + r.total + '행)에 **' + kindName + '**(으)로 분류된 자재가 없습니다.',
                              'No **' + kindName + '** material in the BOM of ' + r.material + ' (' + r.total + ' rows).')
                 + '\n\n' + (bySep ? _t('이 BOM 에 있는 구분자: ', 'Separators in this BOM: ')
                                   : _t('이 BOM 에 있는 자재그룹: ', 'Material groups in this BOM: ')) + list
                 + window.bomPartLayoutWarning(r);
        }
        return window.bomPartLookupHeader(r) + '\n\n' + window.bomPartMarkdownTable(r);
    };

    /**
     * 레이아웃 진단 — [2026-11-12] BOM 탭(js/38)이 계층 깨짐을 경고할 때 쓰는 두 신호
     * (`layoutApplied`·`sortInfo`)를 그대로 물려받는다. 이 조회는 트리 계층을 안 쓰지만,
     * 레이아웃이 안 먹으면 자재그룹(WGBEZ60) 칸 자체가 비어 **"없음"과 "레이아웃이 안
     * 먹어서 못 봤음"을 구분 못 하는 조용한 오답**이 난다 — 삼키지 않고 알린다.
     */
    window.bomPartLayoutWarning = function (r) {
        var out = '';
        if (r.layoutApplied !== true) {
            out += '\n\n⚠️ ' + _t('이 조회는 레이아웃을 적용하지 못했습니다'
                    + (r.layoutDiag ? '(' + r.layoutDiag + ')' : '')
                    + ' — SAP 화면에 마지막으로 남아 있던 레이아웃으로 읽었습니다. 팀 공용 계정이라 '
                    + '누가 다른 레이아웃을 쓰고 나가면 그게 기본값으로 남습니다. 결과가 이상하면 다시 조회해보세요.',
                'This lookup could not apply the requested layout'
                    + (r.layoutDiag ? ' (' + r.layoutDiag + ')' : '')
                    + ' — it read whatever layout was last left on the SAP screen. The account is shared, so '
                    + "a colleague's last layout can stay as the default. Retry if the result looks off.");
        }
        if (r.sortInfo && r.sortInfo.length) {
            out += '\n\n⚠️ ' + _t('SAP 레이아웃에 걸린 정렬: ', 'Sort applied in the SAP layout: ')
                 + '**' + r.sortInfo.join(' ; ') + '**';
        }
        return out;
    };

    /** 머리글 한 줄 — 칩 표와 마크다운 표가 **같은 글**을 쓴다(두 군데 적지 않는다). */
    window.bomPartLookupHeader = function (r) {
        var kindName = (window._currentLang === 'en') ? r.kind.en : r.kind.ko;
        return '🔎 **' + r.material + '** ' + _t('에 사용된 ', ' — ') + kindName
             + ' ' + r.hits.length + _t('건', '')
             + _t('  (BOM ' + r.total + '행 다단계 전개)', '  (multi-level BOM, ' + r.total + ' rows)');
    };

    /**
     * 마크다운 표 — 칩 표를 못 그릴 때의 폴백이고, **텔레그램으로 보낼 때 쓰는 글**이다
     * (칩 표는 rawHtml 이라 그대로 보내면 태그가 글자로 나간다 — 메일 표에서 겪은 그 자리).
     * ⚠️ 이름 옆에 **내역을 항상 같이** 보여준다. DESC' RULE 의 "제조사 품명" 자리가
     *    부품 종류에 따라 모델명이 아니라 제조사(예: BLU 의 `제조사,재질,…`)일 수 있고,
     *    ALV 가 내역을 잘라 보내기도 한다(끝의 `=`). 이름만 보여주면 그게 **조용한 오답**이 된다.
     */
    window.bomPartMarkdownTable = function (r) {
        var body = ['| ' + _t('이름', 'Name') + ' | ' + _t('내역(SAP)', 'Description (SAP)') + ' | ' + _t('자재코드', 'Material')
                  + ' | ' + _t('자재그룹', 'Group') + ' | ' + _t('단계', 'Lv') + ' | ' + _t('수량', 'Qty') + ' |',
                    '|---|---|---|---|---|---|'];
        r.hits.forEach(function (h) {
            var d = h.desc;
            if (d.slice(-1) === '=') d = d.slice(0, -1) + '…';
            if (d.length > 42) d = d.slice(0, 42) + '…';   // 좁은 모달에서 이름 칸을 밀어내지 않게
            body.push('| ' + (h.name || '—') + ' | ' + d + ' | ' + h.code
                    + ' | ' + h.group + ' | ' + h.level + ' | ' + h.qty + ' ' + h.unit + ' |');
        });
        return body.join('\n') + window.bomPartCutNote(r) + window.bomPartLayoutWarning(r);
    };

    /** ALV 가 자른 행이 몇 건인지 — 자른 사실을 숨기지 않는다. */
    window.bomPartCutNote = function (r) {
        var cut = (r.hits || []).filter(function (h) { return String(h.desc || '').slice(-1) === '='; }).length;
        if (!cut) return '';
        return '\n\n' + _t('※ 내역 끝의 …는 SAP 화면이 글자를 자른 것입니다(' + cut + '건).',
                           '※ … means SAP truncated the description (' + cut + ' row(s)).');
    };

    // ── 🔗 찾은 부품 → 다른 기능 (행 클릭 칩) ─────────────────────────────────
    //  사용자 요청(2026-11-02): "부품 찾았으면 칩 버튼 기능 구현해줘".
    //  표를 **행 클릭 칩 표**(js/04h `_qaBuildRowChipTable`, 전자결재·메일과 같은 공용 경로)로
    //  바꾼다 — 칩 목록은 js/40 `QA_ROW_CHIP_KINDS.bompart`(데이터), 실행은 js/04h.
    //  여기 있는 건 칩이 부르는 **동작 두 개**(사양서 열기 · Project list 에서 찾기)뿐이다.

    /**
     * 그 종류의 사양서가 있는 NAS 폴더 — **경로를 여기 적지 않는다**.
     * js/23 `ELEC_CATEGORY_META`(PARTS 구분 카탈로그)에서 읽어 온다. 구분 이름이 바뀌면
     * 칩이 **사라진다**(엉뚱한 폴더를 0건으로 뒤지는 것보다 낫다).
     */
    window._bomPartNasFolders = function (kind) {
        var meta = window.ELEC_CATEGORY_META || {};
        return ((kind && kind.cats) || []).map(function (cat) {
            var m = meta[cat];
            if (!m) return null;
            return { folder: m.nasFull || ('PARTS/' + (m.nas || cat)), label: cat };
        }).filter(Boolean);
    };

    /**
     * 📄 찾은 부품 이름으로 NAS 사양서 열기. 1건이면 바로 열고, 여러 건이면 고르게 하고,
     * 0건이면 **어느 폴더를 몇 장 뒤졌는지** 밝힌다(조용히 0건으로 끝내지 않는다).
     * 반환: `{opened, hits, searched}` — 부르는 쪽이 채팅에 적을 수 있게.
     */
    window._bomPartOpenSpec = async function (row) {
        var folders = window._bomPartNasFolders(row && row.kind);
        var name = (row && row.name) || '';
        if (!name || !folders.length || !window._dsFindPanelSpecAll) return { opened: false, hits: [], searched: [] };
        var hits = [], searched = [];
        for (var i = 0; i < folders.length; i++) {
            var fs = [];
            try { fs = await window._dsFindPanelSpecAll(name, folders[i].folder); } catch (e) { fs = []; }
            searched.push(folders[i].folder);
            fs.forEach(function (f) { hits.push({ folder: folders[i].folder, name: f.name }); });
        }
        if (hits.length === 1 && window._dsOpenInNewTab) {
            //  팝업이 막히면 `_dsOpenInNewTab` 이 연결 프로그램으로 넘기고 false 를 준다 —
            //  "새 창에서 열었습니다"라고 **거짓말하지 않도록** 어디로 열렸는지 같이 돌려준다.
            var viaTab = window._dsOpenInNewTab(hits[0].folder, hits[0].name);
            return { opened: true, viaNative: !viaTab, hits: hits, searched: searched };
        }
        if (hits.length > 1 && window._dsOpenPicker) {
            // 여러 장이면 공용 고르기 창에 **검색어를 넣어** 걸린 파일 전부를 보여준다(js/48 와 같은 방식).
            window._dsOpenPicker({
                folder: hits[0].folder,
                folders: folders.map(function (f) { return { f: f.folder, label: f.label }; }),
                q: name,
                title: '📄 ' + name + ' — ' + _t(hits.length + '개 파일', hits.length + ' files'),
                onPick: function (f, n) { window._dsOpenInNewTab(f, n); }
            });
            return { opened: true, hits: hits, searched: searched };
        }
        return { opened: false, hits: hits, searched: searched };
    };

    /** 📒 Project list 탭으로 가서 그 이름으로 검색 — "이 부품을 쓰는 다른 제품"을 사람이 본다. */
    window._bomPartFindInProjectList = function (name) {
        if (!name) return false;
        if (window.switchTab) window.switchTab('projectlist');
        var si = document.getElementById('pl-search');
        if (si) si.value = name;
        // 🔍 [2026-11-11] plSearch 는 이제 입력만 받고 그리지 않는다(디바운스 제거) — 여기선
        //    사람이 Enter/버튼을 누를 수 없는 "코드가 대신 검색해 주는" 자리라 바로 반영해야 한다.
        if (window.plSearch) window.plSearch(name);
        if (window.plSearchNow) window.plSearchNow();
        else if (window.plRender) window.plRender(true);
        return !!si;
    };

    /**
     * 결과를 **칩 표**로 말풍선에 넣는다. 칩 표를 못 만들면 마크다운 표로 떨어진다
     * (렌더러가 표로 그린다 — 사람이 보는 게 사라지지 않게).
     */
    window._bomPartPushTable = function (r) {
        var header = window.bomPartLookupHeader(r);
        var md = window.bomPartMarkdownTable(r);
        var html = window._qaBuildRowChipTable ? window._qaBuildRowChipTable('bompart', r.hits) : '';
        if (!html) {
            window._ganttQaHistory.push({ role: 'ai', text: header + '\n\n' + md });
            return false;
        }
        window._ganttQaHistory.push({
            role: 'ai', rawHtml: true,
            text: window._mdToHtml(header + window.bomPartCutNote(r) + window.bomPartLayoutWarning(r)) + html,
            tgText: header + '\n\n' + md
        });
        return true;
    };
})();
