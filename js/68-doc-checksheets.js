// ✅ [2026-11-09] SPL Check sheet — 시제품 점검표 (데이터만)
//
//   Sample Report 의 ⑦번째 구성이다. 항목 167개는 **원본 문서에서 기계로 뽑았다** —
//   손으로 옮기지 않았다(그 개수면 오타가 난다).
//   근거 문서: 260311_LNW_Slim Slot iDeck_KTBR14DPS01_Proto B_Sample Report_V00.docx
//
//  ■ 표 구조 (실측 10열)
//     항목 | 내역 | 개발담당자(점검요청·해당없음) | 시제품담당자(합격·불합격·N/A)
//          | 제품보증담당자(합격·불합격·N/A)
//     원본은 점검항목마다 바로 아래에 'Note>' 줄이 하나씩 따른다 → 화면에선 **비고 칸**으로 둔다.
//
//  ■ 시트 6장 (같은 이름이 여러 장이라 key 에 번호를 붙였다)
//     하드웨어 1(ADB·Converter·PANEL·LED TRIM) 24 · 하드웨어 2(Harness·외관·Customer SPEC) 24
//     펌웨어 1(DISPLAY·OSD·DPMS·SETTING) 22 · 펌웨어 2(PANEL CHECK·Etc.) 25
//     펌웨어 3(Resolution) 48 · 기구설계 24
//
//  ⚠️ 항목을 고칠 때는 **원본 문서를 다시 뽑아** 바꿀 것 — 여기서 손으로 고치면 다음 재생성에
//     되돌아간다. 뽑는 스크립트는 저장소에 두지 않았다(사내 문서를 읽는 일회용이다):
//     python-docx 로 'CHECK SHEET' 가 든 표만 훑어 `항목 | 내역` 을 모으면 이 모양이 된다.
(function () {
    'use strict';
    window.DOC_CHECK_SHEETS = window.DOC_CHECK_SHEETS || [
    {
        "key": "SAMPLE CHECK SHEET(하드웨어) 1",
        "name": "SAMPLE CHECK SHEET(하드웨어)",
        "items": [
            {
                "g": "ADB",
                "q": "ADB Series별 P/N이 정확한가?(동일 PCB의 시정수 값 상이함)"
            },
            {
                "g": "ADB",
                "q": "입력전원을 만족하는가? (DC 12V or DC 24V)"
            },
            {
                "g": "ADB",
                "q": "ADB의 분기된 전원 Spec을 만족하는가? (5V,3.3V,1.8V,1.2V)"
            },
            {
                "g": "ADB",
                "q": "정확한 Version의 펌웨어를 확인하였는가?"
            },
            {
                "g": "ADB",
                "q": "Power 시퀀스가 부합하는가?"
            },
            {
                "g": "ADB",
                "q": "발열 문제는 없는가?(Spec 기재)"
            },
            {
                "g": "ADB",
                "q": "EDID Check Sum을 확인하였는가?"
            },
            {
                "g": "Converter",
                "q": "정격의 입력 전원을 만족하는가?"
            },
            {
                "g": "Converter",
                "q": "CONVERTER의 최대 Current가 Spec In인가?"
            },
            {
                "g": "Converter",
                "q": "발열 문제는 없는가?(Spec 기재)"
            },
            {
                "g": "Converter",
                "q": "Dimming Control 확인하였는가?"
            },
            {
                "g": "Converter",
                "q": "A-DIM P-DIM(120Hz~수KHz)"
            },
            {
                "g": "PANEL",
                "q": "패널 Signal 시퀀스가 부합하는가?"
            },
            {
                "g": "PANEL",
                "q": "(영상깨짐) 과도 현상의 증상이 있는가?"
            },
            {
                "g": "PANEL",
                "q": "Pixel Clock이 Spec In인가?(Spec 기재)"
            },
            {
                "g": "PANEL",
                "q": "패널의 In-Rush Current는 만족하는가?"
            },
            {
                "g": "PANEL",
                "q": "화면의 Noise가 있는가?"
            },
            {
                "g": "PANEL",
                "q": "휘도 및 White Color는 만족하는가?"
            },
            {
                "g": "LED TRIM",
                "q": "LED(Full white) 개수 별 최대 Current가 만족하는가?"
            },
            {
                "g": "LED TRIM",
                "q": "LED의 끝단 전원 Spec 및 Signal이 정확하게 전달 되는가?"
            },
            {
                "g": "LED TRIM",
                "q": "LED Spec에 준하는 Level 및 Timing인가?"
            },
            {
                "g": "LED TRIM",
                "q": "R,G,B 색상이 정확한가?"
            },
            {
                "g": "LED TRIM",
                "q": "LED 빠짐 불량은 없는가?"
            },
            {
                "g": "LED TRIM",
                "q": "LED 발열 문제는 없는가?"
            }
        ]
    },
    {
        "key": "SAMPLE CHECK SHEET(하드웨어) 2",
        "name": "SAMPLE CHECK SHEET(하드웨어)",
        "items": [
            {
                "g": "Harness",
                "q": "Cable 및 Connector의 정격 Spec을 만족하는가?"
            },
            {
                "g": "Harness",
                "q": "Cable의 길이는 적정한가?"
            },
            {
                "g": "Harness",
                "q": "Cable의 배선의 작업성은 용이한가?"
            },
            {
                "g": "Appearance Inspection",
                "q": "Panel Defect > Dot/ Line/ Mura/ Crosstalk/ 이물"
            },
            {
                "g": "Appearance Inspection",
                "q": "Display Noise > Flicker/ Color Noise/ Clock Dot"
            },
            {
                "g": "Appearance Inspection",
                "q": "Active area Active > Display - Edge 1line (master pt)"
            },
            {
                "g": "Appearance Inspection",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Appearance Inspection",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Appearance Inspection",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Appearance Inspection",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Appearance Inspection",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Custmor SPEC",
                "q": "추가 샘플 점검 내용 상세 기술"
            }
        ]
    },
    {
        "key": "SAMPLE CHECK SHEET(펌웨어) 1",
        "name": "SAMPLE CHECK SHEET(펌웨어)",
        "items": [
            {
                "g": "DISPLAY CHECK",
                "q": "화면의 shift 나 Full Scan 은 정상인가"
            },
            {
                "g": "DISPLAY CHECK",
                "q": "해상도 변경 시 Garbage / Still 발생 여부"
            },
            {
                "g": "DISPLAY CHECK",
                "q": "Power off / on 시 Garbage 발생 여부"
            },
            {
                "g": "DISPLAY CHECK",
                "q": "No Signal 신호 동작 여부"
            },
            {
                "g": "DISPLAY CHECK",
                "q": "화면 Size / Position 변경 동작 여부"
            },
            {
                "g": "DISPLAY CHECK",
                "q": "Frame Lock 기능 동작 여부"
            },
            {
                "g": "DISPLAY CHECK",
                "q": "White Balance Spec in 여부 (Buyer 요청 사항)"
            },
            {
                "g": "DISPLAY CHECK",
                "q": "Video Rotation 0 / 180"
            },
            {
                "g": "OSD",
                "q": "OSD 각 기능 정상 동작 여부 (가변 및 범위)"
            },
            {
                "g": "OSD",
                "q": "OSD 에 의한 (상태)LED 동작 여부"
            },
            {
                "g": "OSD",
                "q": "Factory Mode Key 동작 여부"
            },
            {
                "g": "OSD",
                "q": "OSD 및 Factory Mode Setting"
            },
            {
                "g": "OSD",
                "q": "OSD Rotation 0 / 180"
            },
            {
                "g": "DPMS",
                "q": "DPMS 동작 여부 (LED, 신호 변경, On/off 설정)"
            },
            {
                "g": "DPMS",
                "q": "Cable 착탈에 따른 동작 여부"
            },
            {
                "g": "DPMS",
                "q": "DPMS 진입 소요 시간 (Spec 명기)"
            },
            {
                "g": "SETTING CHECK",
                "q": "Power off / on 후 Last save 여부"
            },
            {
                "g": "SETTING CHECK",
                "q": "Factory Setting 변경후 Last save 여부"
            },
            {
                "g": "SETTING CHECK",
                "q": "Aging Mode 동작 / 해제 여부"
            },
            {
                "g": "SETTING CHECK",
                "q": "Auto Color Calibration 동작 여부"
            },
            {
                "g": "SETTING CHECK",
                "q": "Recall 시 Setting 초기화 여부"
            },
            {
                "g": "SETTING CHECK",
                "q": "DDC/CI 동작여부"
            }
        ]
    },
    {
        "key": "SAMPLE CHECK SHEET(펌웨어) 2",
        "name": "SAMPLE CHECK SHEET(펌웨어)",
        "items": [
            {
                "g": "PANEL CHECK",
                "q": "Mechanical Rotation 시계,반시계방향 확인"
            },
            {
                "g": "PANEL CHECK",
                "q": "Swing Level 측정"
            },
            {
                "g": "PANEL CHECK",
                "q": "Power Sequence"
            },
            {
                "g": "PANEL CHECK",
                "q": "Dot Clock > 패널SPEC 확인"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Etc.",
                "q": "추가 샘플 점검 내용 상세 기술"
            }
        ]
    },
    {
        "key": "SAMPLE CHECK SHEET(펌웨어) 3",
        "name": "SAMPLE CHECK SHEET(펌웨어)",
        "items": [
            {
                "g": "Resolution",
                "q": "IBM 640×350@70"
            },
            {
                "g": "Resolution",
                "q": "VESA 640×350@85"
            },
            {
                "g": "Resolution",
                "q": "IBM 640×400@70"
            },
            {
                "g": "Resolution",
                "q": "VESA 640×400@85"
            },
            {
                "g": "Resolution",
                "q": "VESA 720×400@70"
            },
            {
                "g": "Resolution",
                "q": "VESA 720×400@85"
            },
            {
                "g": "Resolution",
                "q": "VESA 640×480@59.9"
            },
            {
                "g": "Resolution",
                "q": "MAC 640×480@66.7"
            },
            {
                "g": "Resolution",
                "q": "640×480@70"
            },
            {
                "g": "Resolution",
                "q": "VESA 640×480@72.8"
            },
            {
                "g": "Resolution",
                "q": "VESA 640×480@75"
            },
            {
                "g": "Resolution",
                "q": "VESA 640×480@85"
            },
            {
                "g": "Resolution",
                "q": "VESA 800×600@56.2"
            },
            {
                "g": "Resolution",
                "q": "VESA 800×600@60.3"
            },
            {
                "g": "Resolution",
                "q": "800×600@70"
            },
            {
                "g": "Resolution",
                "q": "VESA 800×600@72.2"
            },
            {
                "g": "Resolution",
                "q": "VESA 800×600@75"
            },
            {
                "g": "Resolution",
                "q": "VESA 800×600@85.1"
            },
            {
                "g": "Resolution",
                "q": "MAC 832×624@74.6"
            },
            {
                "g": "Resolution",
                "q": "VESA 1024×768@59.8"
            },
            {
                "g": "Resolution",
                "q": "VESA 1024×768@70"
            },
            {
                "g": "Resolution",
                "q": "VESA 1024×768@74.9"
            },
            {
                "g": "Resolution",
                "q": "VESA 1024×768@85"
            },
            {
                "g": "Resolution",
                "q": "VESA 1152×864@70.2"
            },
            {
                "g": "Resolution",
                "q": "VESA 1152×864@75"
            },
            {
                "g": "Resolution",
                "q": "VESA 1152×864@85"
            },
            {
                "g": "Resolution",
                "q": "MAC 1152×870@75.1"
            },
            {
                "g": "Resolution",
                "q": "1280×720@60"
            },
            {
                "g": "Resolution",
                "q": "1280×768@60.3"
            },
            {
                "g": "Resolution",
                "q": "VESA 1280x960@60"
            },
            {
                "g": "Resolution",
                "q": "VESA 1280x960@75"
            },
            {
                "g": "Resolution",
                "q": "VESA 1280x960@85"
            },
            {
                "g": "Resolution",
                "q": "1360×768@59.9"
            },
            {
                "g": "Resolution",
                "q": "1366×768@59.9"
            },
            {
                "g": "Resolution",
                "q": "VESA 1280×1024@60"
            },
            {
                "g": "Resolution",
                "q": "VESA 1280×1024@70"
            },
            {
                "g": "Resolution",
                "q": "VESA 1280×1024@75"
            },
            {
                "g": "Resolution",
                "q": "VESA 1280×1024@85"
            },
            {
                "g": "Resolution",
                "q": "1440x900@60"
            },
            {
                "g": "Resolution",
                "q": "1680x1050@60"
            },
            {
                "g": "Resolution",
                "q": "1600x900@60"
            },
            {
                "g": "Resolution",
                "q": "VESA 1600x1200@60"
            },
            {
                "g": "Resolution",
                "q": "1920X1080@60"
            },
            {
                "g": "Resolution",
                "q": "768x600@60"
            },
            {
                "g": "Resolution",
                "q": "960x600@60"
            },
            {
                "g": "Resolution",
                "q": "3840X2160@60"
            },
            {
                "g": "Resolution",
                "q": "1920X510@60"
            },
            {
                "g": "Resolution",
                "q": "1280X242@60"
            }
        ]
    },
    {
        "key": "SAMPLE CHECK SHEET(기구설계)",
        "name": "SAMPLE CHECK SHEET(기구설계)",
        "items": [
            {
                "g": "내부 구조",
                "q": "Panel 조립 guide 준수 여부"
            },
            {
                "g": "내부 구조",
                "q": "Panel user hole Check!"
            },
            {
                "g": "내부 구조",
                "q": "Cable 및 Harness 연결이 합리적인가"
            },
            {
                "g": "내부 구조",
                "q": "Cable 및 Harness Path 가 합리적인가"
            },
            {
                "g": "내부 구조",
                "q": "Air vent 가 고려 되었는가"
            },
            {
                "g": "내부 구조",
                "q": "Cable 및 Harness류의 Frame간 간섭은 없는가?"
            },
            {
                "g": "외관",
                "q": "Glass 돌출 SPEC.을 만족하는가.(Spec 기재)"
            },
            {
                "g": "외관",
                "q": "Parting gap spec. 을 만족하는가.(Spec 기재)"
            },
            {
                "g": "외관",
                "q": "Lighting hot spot 이 있는가"
            },
            {
                "g": "외관",
                "q": "빛샘 관측 여부"
            },
            {
                "g": "안전규격",
                "q": "외관에 날카로운 모서리나 Burr가 있는가 (sheet metal 제외)"
            },
            {
                "g": "안전규격",
                "q": "고압부와 Metal 사이 안전거리를 유지하는가"
            },
            {
                "g": "조립 성 및 Rework",
                "q": "Panel 교체가 용이한가."
            },
            {
                "g": "조립 성 및 Rework",
                "q": "Touch or Glass 교체가 용이한가"
            },
            {
                "g": "조립 성 및 Rework",
                "q": "PCB 교체가 용이한가."
            },
            {
                "g": "조립 성 및 Rework",
                "q": "Enclosure 교체가 용이한가."
            },
            {
                "g": "조립 성 및 Rework",
                "q": "표준화 Screw가 적용되었는가"
            },
            {
                "g": "User Mounting",
                "q": "고객사 user mounting 요청에 부합하는가."
            },
            {
                "g": "User Mounting",
                "q": "VESA 규격을 지원하는가"
            },
            {
                "g": "Packing",
                "q": "고객사 Packing 요청에 부합하는가."
            },
            {
                "g": "Packing",
                "q": "표준화 Pallet 가 적용되었는가"
            },
            {
                "g": "Special Feature",
                "q": "고객사 요청에 부합하는가."
            },
            {
                "g": "Special Feature",
                "q": "추가 샘플 점검 내용 상세 기술"
            },
            {
                "g": "Special Feature",
                "q": "추가 샘플 점검 내용 상세 기술"
            }
        ]
    }
];
})();
