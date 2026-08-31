// 🎨 [2026-08-30] 컬러 팔레트 모달 — hex↔HSL 변환 + "원색의 hue만 뽑아서 역할별 고정 채도/명도로
//    재조합" 방식으로, 지금 청록 테마를 실제로 만들 때 썼던 값들(아래 CP_ROLES)을 그대로 공식화함.
window._cpHexToHsl = function(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1));
        switch (max) {
            case r: h = 60 * (((g - b) / d) % 6); break;
            case g: h = 60 * ((b - r) / d + 2); break;
            case b: h = 60 * ((r - g) / d + 4); break;
        }
    }
    if (h < 0) h += 360;
    return { h: h, s: s * 100, l: l * 100 };
};
window._cpHslToHex = function(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
};
// 💡 지금 청록 테마 실측값(bg #e0f5f7, 헤더 #eef6f7, 테두리 #cfe3e5, 제브라B #e8f2f3,
//    진한글씨 #00707d, 호버배경 #a3d9e0, 호버테두리 #52a5af)을 역산해서 얻은 채도/명도 공식.
//    hue만 입력색에서 뽑아 쓰고 s/l은 고정값이라, 어떤 색을 골라도 "청록과 같은 파스텔 규칙"이 유지됨.
window.CP_ROLES = [
    { key: 'bg',          label: '배경(bg)',        s: 58, l: 94 },
    { key: 'headerTint',  label: '헤더 / 테이블 틴트', s: 41, l: 95 },
    { key: 'border',      label: '테두리',           s: 26, l: 87 },
    { key: 'zebraB',      label: '제브라 B행',        s: 30, l: 93 },
    { key: 'darkText',    label: '진한 텍스트',       s: 100, l: 25 },
    { key: 'hoverBg',     label: '호버 배경(강조)',    s: 48, l: 75 },
    { key: 'hoverBorder', label: '호버 테두리',       s: 36, l: 51 }
];
window.CP_CURRENT_TEAL = { bg: '#e0f5f7', headerTint: '#eef6f7', border: '#cfe3e5', zebraB: '#e8f2f3', darkText: '#00707d', hoverBg: '#a3d9e0', hoverBorder: '#52a5af' };
window.CP_CURRENT_NAV = { base: '#aedae0', hover: '#90cdd5', active: '#72c0ca', text: '#00636e' };
// 💡 [2026-08-30 버그 수정] 회색 계열(#495057)이 있었는데, 이 팔레트 도구는 "원색의 색상환 각도(hue)만
// 뽑아서 재조합"하는 방식이라 무채색(회색)은 hue 자체가 없어서(R/G/B가 거의 같음) RGB의 미세한 오차로
// 엉뚱한 hue(파란빛)가 뽑혀 나갔음 — 애초에 이 방식으로는 "무채색 테마"를 표현할 수 없어 프리셋에서 제외.
window.CP_PRESETS = ['#e03131', '#e67e22', '#f1c40f', '#2f9e44', '#00707d', '#2c5f8a', '#6f42c1', '#d6336c'];
// 💡 [2026-08-31 신규] 프로젝트에 저장된 테마색이 없을 때(=새 프로젝트, 또는 아직 팔레트를 한 번도
//    안 건드린 프로젝트) 적용할 기본값 — 기존엔 이게 없어서 "아무 것도 안 하면" HTML/CSS에 하드코딩된
//    청록(#00707d)이 그대로 보였다. 청록 → 파랑 프리셋으로 기본값을 바꾼다(아래 _cpApplyStoredTheme 참고).
window.CP_DEFAULT_HEX = '#2c5f8a';

window._cpSwatch = function(hex, label) {
    const textColor = (window._cpHexToHsl(hex).l < 55) ? '#fff' : '#333';
    return '<div style="border:1px solid #e0e0e0; border-radius:8px; overflow:hidden;">'
        + '<div style="height:44px; background:' + hex + '; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; color:' + textColor + ';">' + hex + '</div>'
        + '<div style="padding:5px 8px; font-size:11px; color:#555; background:#fafafa;">' + label + '</div>'
        + '</div>';
};

window._cpRenderPreview = function(hex) {
    document.getElementById('cp-custom-color').value = hex;
    document.getElementById('cp-custom-color').title = '직접 선택 (' + hex + ') — 클릭하면 색상 선택기가 열립니다'; // 💡 별도 텍스트(cp-custom-hex) 대신 툴팁으로 통합
    const hue = window._cpHexToHsl(hex).h;
    const gen = {};
    window.CP_ROLES.forEach(r => { gen[r.key] = window._cpHslToHex(hue, r.s, r.l); });
    const genNav = window._cpComputeGenNav(hue);
    document.getElementById('cp-preview-swatches').innerHTML = window.CP_ROLES.map(r => window._cpSwatch(gen[r.key], r.label)).join('')
        + window._cpSwatch(genNav.base, '사이드바/상단바 배경') + window._cpSwatch(genNav.hover, '메뉴 호버')
        + window._cpSwatch(genNav.active, '메뉴 active') + window._cpSwatch(genNav.text, '메뉴 글자색');

    // 미니 미리보기 표 — 실제 청록 표(헤더/제브라/테두리/버튼 호버)와 동일한 구조
    document.getElementById('cp-preview-demo').innerHTML =
        '<div style="background:' + gen.bg + '; border:1px solid ' + gen.hoverBg + '; border-radius:8px; padding:12px;">'
        + '<div style="background:#fff; border:1px solid ' + gen.border + '; border-radius:8px; overflow:hidden;">'
        + '<table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="background:' + gen.headerTint + '; border-bottom:2px solid ' + gen.border + ';">'
        + '<th style="padding:8px 10px; text-align:left; color:' + gen.darkText + ';">항목</th><th style="padding:8px 10px; text-align:center; color:' + gen.darkText + ';">상태</th><th style="padding:8px 10px; text-align:center; color:' + gen.darkText + ';">액션</th>'
        + '</tr></thead><tbody>'
        + '<tr style="background:#fff; border-bottom:1px solid ' + gen.border + ';"><td style="padding:8px 10px;">샘플 행 A</td><td style="padding:8px 10px; text-align:center;">🟢</td><td style="padding:8px 10px; text-align:center;"><button style="padding:4px 10px; background:' + gen.bg + '; color:' + gen.darkText + '; border:1px solid ' + gen.border + '; border-radius:6px; cursor:default; font-size:11px;">버튼</button></td></tr>'
        + '<tr style="background:' + gen.zebraB + '; border-bottom:1px solid ' + gen.border + ';"><td style="padding:8px 10px;">샘플 행 B</td><td style="padding:8px 10px; text-align:center;">🔴</td><td style="padding:8px 10px; text-align:center;"><button style="padding:4px 10px; background:' + gen.hoverBg + '; color:#fff; border:1px solid ' + gen.hoverBorder + '; border-radius:6px; cursor:default; font-size:11px;">호버 예시</button></td></tr>'
        + '</tbody></table></div></div>';

    // 💡 이미 "실제 페이지에 적용" 중이면(라이브 모드), 프리셋/커스텀 색을 바꿀 때마다 실제 화면도
    //    같이 즉시 갱신 — 매번 "적용" 버튼을 다시 누를 필요 없이 색상만 계속 바꿔가며 실시간 비교 가능.
    // 🐛 [버그 수정] 이 hex가 "지금 이미 적용 중인 색과 같으면" 재적용을 건너뛴다 — 안 그러면 로고를
    //    클릭해 팔레트를 열기만 해도(직접선택 칸의 기본값 '#2c5f8a'로 미리보기를 그리며) 실제 테마가
    //    조용히 그 기본값으로 바뀌고 저장 안 한 변경사항으로 표시되는 사고가 있었다(openColorPaletteModal
    //    이 이 함수를 호출할 때 그 칸 값을 지금 라이브 테마로 먼저 맞춰두므로, 아무것도 안 골랐으면
    //    hex===_cpLiveAppliedHex라 여기서 걸러진다 — 실제로 다른 색을 고르면 정상적으로 통과).
    if (window._cpLiveAppliedHex && hex !== window._cpLiveAppliedHex) window._cpApplyLive(hex);
};

// 🎨 [실제 적용] 청록 작업에 실제로 쓰인 hex 상수들을, 페이지 전체에서 "그 hex 문자열을 inline
//    style에 포함한 모든 요소"를 CSS 속성-값 선택자([style*="..."])로 찾아 !important로 새 색으로
//    덮어쓰는 방식. 수천 곳에 흩어진 인라인 색상을 하나하나 바꾸지 않고도, 실제 화면 전체에
//    (사이드바·상단바·표 헤더·제브라·테두리·버튼 호버까지) 한 번에 반영해서 진짜로 눈으로 비교 가능.
//    background-color/border-color만 건드리고(border-style이 없으면 안 보여서 안전), 텍스트 역할
//    (darkText/nav text)에는 color만 건드려서 엉뚱한 곳에 배경이 생기는 부작용을 막았다.
window._cpComputeGenNav = function(hue) {
    const nav = window.CP_CURRENT_NAV;
    return {
        base: window._cpHslToHex(hue, window._cpHexToHsl(nav.base).s, window._cpHexToHsl(nav.base).l),
        hover: window._cpHslToHex(hue, window._cpHexToHsl(nav.hover).s, window._cpHexToHsl(nav.hover).l),
        active: window._cpHslToHex(hue, window._cpHexToHsl(nav.active).s, window._cpHexToHsl(nav.active).l),
        text: window._cpHslToHex(hue, window._cpHexToHsl(nav.text).s, window._cpHexToHsl(nav.text).l)
    };
};
window._cpLiveAppliedHex = null;
// 💡 [2026-08-30 신규] "지금 프로젝트 파일에 실제로 저장되어 있는" 테마 색 기준값 — populateTabData
// (프로젝트 로드/시트 전환)와 저장 성공 시점마다 갱신된다. 팔레트에서 색을 이리저리 바꿔보다가
// 결국 이 값으로 돌아오면 "실제로는 아무것도 안 바뀐 것"이므로 dirty로 잡지 않기 위한 비교 기준.
window._cpSavedThemeHex = null;
window._cpApplyLive = function(hex, skipSave) {
    const hue = window._cpHexToHsl(hex).h;
    const gen = {};
    window.CP_ROLES.forEach(r => { gen[r.key] = window._cpHslToHex(hue, r.s, r.l); });
    const nav = window.CP_CURRENT_NAV;
    const genNav = window._cpComputeGenNav(hue);

    // 💡 [2026-08-30 신규] Calendar 페이지의 "핀셋 알람"/"이번달·이번주 강조"는 테마색 그 자체가 아니라
    // 색상환 반대편(보색, hue+180°)으로 강조되도록 요청받음 — 같은 CP_ROLES 공식(S/L 고정, hue만 교체)을
    // 보색 hue에 적용해서, 어떤 테마를 고르든 항상 "테마와 대비되는" 파스텔 강조색이 자동으로 나오게 한다.
    const compHue = (hue + 180) % 360;
    const compGen = {};
    window.CP_ROLES.forEach(r => { compGen[r.key] = window._cpHslToHex(compHue, r.s, r.l); });

    const logoHsl = window._cpHexToHsl('#00a1b6');
    const genLogo = window._cpHslToHex(hue, logoHsl.s, logoHsl.l);

    // 🐛 [버그 수정] 처음엔 hex 하나당 [style*="그 hex"] 한 줄로 배경/테두리를 한꺼번에 덮어썼는데,
    // 한 요소의 style 문자열 안에 "배경용 hex"와 "테두리용 hex"가 같이 들어있으면(예:
    // style="background:#e0f5f7; border-color:#a3d9e0;") 두 규칙이 전부 매치되면서 나중 규칙이
    // background-color까지 덮어써 버려 엉뚱한(너무 진한) 색이 배경에 칠해지는 사고가 있었다.
    // → 이제 "background:HEX"/"background-color:HEX"처럼 프로퍼티까지 포함한 문자열로 매치해서,
    // 그 hex가 실제로 배경으로 쓰인 경우에만 배경을, 테두리로 쓰인 경우에만 테두리를 바꾸도록 분리.
    const bgRoles = [
        [window.CP_CURRENT_TEAL.bg, gen.bg], [window.CP_CURRENT_TEAL.headerTint, gen.headerTint],
        [window.CP_CURRENT_TEAL.zebraB, gen.zebraB], [window.CP_CURRENT_TEAL.hoverBg, gen.hoverBg],
        [nav.base, genNav.base], [nav.hover, genNav.hover], [nav.active, genNav.active]
    ];
    const borderRoles = [
        [window.CP_CURRENT_TEAL.border, gen.border], [window.CP_CURRENT_TEAL.hoverBorder, gen.hoverBorder],
        [window.CP_CURRENT_TEAL.hoverBg, gen.hoverBg] // hoverBg(#a3d9e0)는 버튼 배경으로도, 박스 테두리로도 둘 다 쓰임
    ];
    // 💡 [2026-08-30 추가] "변경 이력 확인" 헤더 라벨(gantt/addr/summary/M.C Table/Brief SPEC/Panel
    // Compare/Elec Parts 등 8곳)을 비롯해 모달 제목·섹션 라벨 40여 곳이 청록 전환 이전부터 쓰던 옛
    // 원색 파랑(#2c5f8a)을 텍스트 색으로 그대로 쓰고 있어서, 팔레트로 어떤 테마를 골라도 이 글자들만
    // 안 바뀌는 문제가 있었다 — darkText 역할과 같은 의미(강조 텍스트)이므로 같이 매핑.
    const textRoles = [[window.CP_CURRENT_TEAL.darkText, gen.darkText], ['#2c5f8a', gen.darkText], [nav.text, genNav.text]];

    let css = '';
    // 💡 [2026-08-30] .concept-section(서브 카드 박스 전부의 공용 클래스)의 기본 테두리(#cfe3e5, border
    // 역할)는 클래스 규칙이라 인라인 매칭으로는 안 잡힘 — 각 페이지의 "프로젝트 멤버/주요자재/제품 사진"
    // 등 흰 카드 테두리가 전부 이걸 씀. 반드시 아래 배경/테두리 속성-매칭 규칙들보다 "먼저" 선언해서,
    // 바깥쪽 큰 박스처럼 인라인으로 다른 테두리색(hoverBg 역할)을 따로 가진 경우엔 나중에 나오는
    // 더 구체적인 규칙이 이걸 덮어쓰도록 순서를 지킨다(동일 특이도라 나중 규칙이 이김).
    css += '.concept-section { border-color: ' + gen.border + ' !important; }\n'
        + '.concept-section:hover:not(.summary-outer-box) { border-color: ' + gen.hoverBorder + ' !important; }\n'
        + '.concept-grid label { border-color: ' + gen.border + ' !important; }\n'
        + '.concept-grid label:hover, .concept-grid input:hover, .concept-grid textarea:hover, #sum-background:hover { border-color: ' + gen.hoverBorder + ' !important; background-color: ' + gen.headerTint + ' !important; }\n'
        + '.concept-grid input, .concept-grid textarea { border-color: ' + gen.border + ' !important; }\n'
        + '#sum-milestone-body input.u-input, #sum-milestone-body-actual input.u-input { border-color: ' + gen.border + ' !important; }\n'
        // 💡 페이지 제목 옆 액션 버튼들(.action-btn: 인쇄/펼치기/MVD/R1/VS 등) 공용 호버가 옛날 원색
        // 파랑(#2c5f8a)으로 박혀 있어서 페이지마다 "제목 버튼 호버만 테마 미적용"으로 보였던 부분.
        + '.action-btn:hover { background-color: ' + gen.hoverBg + ' !important; border-color: ' + gen.hoverBorder + ' !important; color: ' + gen.darkText + ' !important; }\n'
        // 💡 [2026-08-30 되돌림] 점선 안쪽 배경은 사진이 없을 때도 항상 흰 종이처럼 보이도록 고정 흰색으로
        // 유지 요청 — 테마가 바뀌어도 이 배경만은 건드리지 않고 테두리 색만 테마를 따름.
        + '.prod-img-slot { border-color: ' + gen.hoverBg + ' !important; background: #fff !important; }\n'
        + '.prod-img-slot:hover { border-color: ' + gen.hoverBorder + ' !important; }\n'
        // 💡 [2026-08-30 추가] Gantt 메인 표를 감싸는 .container(외곽 테두리+배경, 그 안에 표와
        // "변경 이력 확인" 박스가 같이 들어있음)도 클래스 규칙이라 인라인 매칭이 안 잡아서 항상 청록으로
        // 박혀 있었음.
        + '.container { border-color: ' + gen.hoverBg + ' !important; background: ' + gen.bg + ' !important; }\n';
    // 🐛 [버그 수정] onmouseover/onmouseout처럼 JS가 el.style.xxx = '#hex'로 직접 건드리는 순간, 브라우저가
    // 그 요소의 style 속성 전체를 rgb(...) 표기로 다시 직렬화해버린다(건드리지 않은 다른 속성까지 포함)
    // — 그러면 hex 문자열이 통째로 사라져서 [style*="#hex"] 매칭이 전부 실패하고, 마우스를 올리거나
    // 클릭(선택)하는 순간 원래 청록으로 "돌아간 것처럼" 보였다(실제로는 청록으로 돌아간 게 아니라
    // 내 오버라이드가 더 이상 그 요소를 못 찾는 것). hex 표기와 브라우저가 실제로 쓰는
    // "rgb(r, g, b)" 표기를 둘 다 매칭 대상에 넣어서 해결.
    const hexToRgbStr = function(hex) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
        return 'rgb(' + r + ', ' + g + ', ' + b + ')';
    };
    bgRoles.forEach(function(p) {
        const rgbOld = hexToRgbStr(p[0]);
        css += '[style*="background:' + p[0] + '"], [style*="background: ' + p[0] + '"], [style*="background-color:' + p[0] + '"], [style*="background-color: ' + p[0] + '"], [style*="background: ' + rgbOld + '"], [style*="background-color: ' + rgbOld + '"] { background-color: ' + p[1] + ' !important; }\n';
    });
    borderRoles.forEach(function(p) {
        const rgbOld = hexToRgbStr(p[0]);
        css += '[style*="border-color:' + p[0] + '"], [style*="border-color: ' + p[0] + '"], [style*="solid ' + p[0] + '"], [style*="dashed ' + p[0] + '"], [style*="dotted ' + p[0] + '"], [style*="border-color: ' + rgbOld + '"], [style*="solid ' + rgbOld + '"], [style*="dashed ' + rgbOld + '"] { border-color: ' + p[1] + ' !important; }\n';
    });
    textRoles.forEach(function(p) {
        // 💡 " color:HEX"(앞에 공백)만 매치 — "background-color:"/"border-color:"는 "color:" 앞에
        // 공백이 없는 한 단어라 여기 안 걸림(위 배경/테두리 규칙과 서로 침범하지 않음).
        const rgbOld = hexToRgbStr(p[0]);
        css += '[style*=" color:' + p[0] + '"], [style*=" color: ' + rgbOld + '"] { color: ' + p[1] + ' !important; }\n';
    });

    // 💡 [style*="..."] 방식은 인라인 style에 그 hex가 "문자 그대로" 들어있는 요소만 잡는다 — 사이드바/
    //    상단바/표 헤더/각 페이지 제목 박스/로고 등 상당수는 인라인이 아니라 <style> 블록의 클래스/id
    //    규칙으로 색이 정해져 있어서(#app-sidebar, .concept-table th, .concept-header-box, .tb-logo 등)
    //    위 규칙만으로는 안 바뀐다. 이 세션에서 실제로 찾아낸 그 규칙들을 여기서 직접 다시 선언해
    //    덮어쓴다(동일 특이도 + !important면 나중에 로드된 이 <style>이 이김 — 이 태그는 항상 런타임에
    //    body 맨 끝에 추가되므로 항상 나중임).
    css += '#app-topbar { background: ' + genNav.base + ' !important; color: ' + genNav.text + ' !important; }\n'
        + '#app-sidebar { background: ' + genNav.base + ' !important; }\n'
        + '#app-sidebar .sb-item { color: ' + genNav.text + ' !important; }\n'
        + '#app-sidebar .sb-item:hover { background: ' + genNav.hover + ' !important; }\n'
        + '#app-sidebar .sb-item.active { background: ' + genNav.active + ' !important; }\n'
        + '#app-sidebar .sb-toggle-btn { color: ' + genNav.text + ' !important; }\n'
        + '#app-sidebar .sb-toggle-btn:hover { background: ' + genNav.hover + ' !important; }\n'
        + '.topbar-btn { color: ' + genNav.text + ' !important; }\n'
        + '.topbar-btn:hover { background: ' + genNav.hover + ' !important; }\n'
        // 💡 [2026-08-30 추가 → 같은 날 세 차례 수정] 언어 토글 "영문 선택됨" 강조 — 진한 배경+흰 글자
        // → 사이드바 .sb-item.active와 같은 옅은 파스텔(genNav.active) 순으로 바꿔봤지만, 상단바
        // 자체 배경(genNav.base)과는 여전히 다른 톤이라 버튼이 박스처럼 튀어 보인다는 지적("배경이
        // 한 가지 색이 되도록")으로, 최종적으로 상단바 자기 배경과 완전히 같은 색(genNav.base)을 써서
        // 평소엔 버튼 박스 자체가 상단바에 묻혀 안 보이고 "한글"/"ENG" 글자로만 상태가 구분되게 한다.
        + '.topbar-btn.lang-active { background: ' + genNav.base + ' !important; color: ' + genNav.text + ' !important; }\n'
        + '.topbar-btn.lang-active:hover { background: ' + genNav.hover + ' !important; }\n'
        // 💡 [2026-08-30 추가] 상단바의 "📄 현재 프로젝트 파일명" 표시가 옛 고정 청록(글자/호버 배경
        // 둘 다)이라 테마가 안 먹혔음 — 같은 상단바 안의 .topbar-btn과 같은 톤(genNav)으로 통일.
        + '#current-project-filename { color: ' + genNav.text + ' !important; }\n'
        + '#current-project-filename:hover { background: ' + genNav.hover + ' !important; }\n'
        // 💡 [2026-08-30 추가] Elec Parts "🔌 핀맵 보기"/"🔌 보기" 버튼 호버도 다른 테마 추적 호버와
        // 동일하게(.concept-add-row-btn:hover와 같은 gen 팔레트 사용).
        + '.ep-theme-hover-btn:hover { background-color: ' + gen.hoverBg + ' !important; border-color: ' + gen.hoverBorder + ' !important; color: ' + gen.darkText + ' !important; }\n'
        + '#app-topbar .tb-logo { background-color: ' + genLogo + ' !important; }\n'
        + '.concept-header-box, .concept-header-box h2, #table-info, #table-info-text { color: ' + gen.darkText + ' !important; }\n'
        + '.concept-header-box, #table-info { background-color: ' + gen.bg + ' !important; border-color: ' + gen.hoverBg + ' !important; }\n'
        + '.concept-table th, .concept-table td, #myTable th, #myTable td { border-color: ' + gen.border + ' !important; }\n';

    // 💡 [2026-08-30] 탭마다 "sticky 헤더는 별도로 재선언해야 함" 패턴이 반복돼서(각 탭 .concept-table
    // thead th에 #tab-XXX 접두사가 붙은 !important 규칙이 따로 있음 — 스크롤 시 헤더 고정을 위해),
    // 그 전체 목록을 여기 한 곳에 모아 전부 덮어쓴다. 하나라도 빠지면 그 탭만 색이 안 바뀜.
    const headerSelectors = [
        '.concept-table th', '#myTable th', '#tab-notice thead th',
        '#tab-address .concept-table thead th', '#tab-summary .concept-table thead th',
        '#tab-briefspec .concept-table thead th', '#tab-elecparts .concept-table thead th',
        '#tab-mctable .concept-table thead th', '#mc-comparison-table thead th',
        // 💡 [2026-08-30 추가] 주요 자재 표(2개, 좌/우)는 .concept-table 클래스가 아닌 일반 table이라
        // 위 목록 어디에도 안 걸려서 전역 `th{background:#f4f6f8}` 회색 규칙이 그대로 이겼음.
        '#major-materials-section thead th'
    ];
    css += headerSelectors.join(', ') + ' { background: ' + gen.headerTint + ' !important; color: ' + gen.darkText + ' !important; }\n';

    const zebraBSelectors = [
        '#tab-alarm .concept-table tbody tr.mc-zebra-b',
        '#tab-address .concept-table tbody tr.mc-zebra-b', '#tab-address .concept-table tbody tr.mc-zebra-b input',
        '#tab-elecparts .concept-table tbody tr.mc-zebra-b',
        '#tab-mctable .concept-table tbody tr.mc-zebra-b', '#tab-mctable .concept-table tbody tr.mc-zebra-b input',
        '#tab-briefspec .concept-table tbody tr.mc-zebra-b', '#tab-briefspec .concept-table tbody tr.mc-zebra-b input'
    ];
    css += zebraBSelectors.join(', ') + ' { background-color: ' + gen.zebraB + ' !important; }\n';
    css += '#myTable tbody tr.gantt-zebra-b td { background: ' + gen.zebraB + ' !important; }\n'
        + '.concept-add-row-btn, .gantt-filter-trigger-btn:not(.filter-active) { background: ' + gen.bg + ' !important; border-color: ' + gen.hoverBg + ' !important; color: ' + gen.darkText + ' !important; }\n'
        + '.concept-add-row-btn:hover, .gantt-filter-trigger-btn:not(.filter-active):hover, #gantt-filter-trigger-cal-wbs:hover, #gantt-filter-trigger-wr-wbs:hover, #print-btn:hover { background-color: ' + gen.hoverBg + ' !important; border-color: ' + gen.hoverBorder + ' !important; color: ' + gen.darkText + ' !important; }\n'
        // 💡 [2026-08-30 추가 → 같은 날 수정] M.C Table 제품구분자 패널의 ✏️(이름변경)/➕(추가) 호버도
        // "펼치기"(위 .concept-add-row-btn)와 동일한 테마색으로 통일(🗑️ 삭제는 위험 액션이라 빨강 고정
        // 유지). ✏️는 이후 요청으로 테두리를 아예 없앴으므로(border:none) border-color는 더 이상 넣지
        // 않음 — ➕도 원래 border:none이라 border-color가 있어도 효과가 없었지만 정리 차원에서 같이 뺌.
        + '#mc-add-unit-btn:hover, #mc-unit-rename-btn:hover { background-color: ' + gen.hoverBg + ' !important; color: ' + gen.darkText + ' !important; }\n'
        // 💡 [2026-08-30 추가 → 같은 날 수정] ✏️(이름변경)는 ➕/🗑️와 달리 평소에도 배경이 있는 박스
        // 형태라(➕/🗑️는 투명 배경) 흰 배경이 고정으로 박혀 있었음 — 평소 상태도 "펼치기"와 같은
        // 테마색으로. 테두리는 이후 요청으로 제거(border:none, 배경색만으로 구분).
        + '#mc-unit-rename-btn { background-color: ' + gen.bg + ' !important; color: ' + gen.darkText + ' !important; }\n'
        // 💡 [2026-08-30 추가] "변경/수정 이력 확인" 헤더의 강조 밑줄도 테마색으로.
        + '[id$="-history-header"] { border-bottom-color: ' + gen.hoverBorder + ' !important; }\n'
        // 💡 [2026-08-30 추가] Calendar의 월/주 토글(.cal-view-btn)이 옛 파스텔-블루 고정색이라 테마가
        // 안 먹혀서 항상 파랗게 박혀 보였음 — LEVEL(WBS) 트리거와 같은 톤 규칙으로 편입.
        + '.cal-view-btn { background: ' + gen.bg + ' !important; color: ' + gen.darkText + ' !important; }\n'
        + '.cal-view-btn:not(.cal-view-btn-active):hover { background: ' + gen.hoverBg + ' !important; }\n'
        + '.cal-view-btn.cal-view-btn-active { background: ' + gen.hoverBg + ' !important; color: ' + gen.darkText + ' !important; }\n'
        + '.cal-view-btn + .cal-view-btn { border-left-color: ' + gen.hoverBg + ' !important; }\n'
        // 💡 [2026-08-30 추가] 달력 칸 안의 업무 상자(.cal-event-chip, 기본/오늘 표시)가 옛 고정 파랑이라
        // 테마가 안 먹혔음 — 일반 업무 상자와 "오늘" 표시는 현재 테마색을 그대로 따르도록 편입.
        + '.cal-event-chip { background: ' + gen.headerTint + ' !important; color: ' + gen.darkText + ' !important; border-left-color: ' + gen.hoverBorder + ' !important; }\n'
        + '.cal-event-chip:hover { background: ' + gen.hoverBg + ' !important; }\n'
        + '.cal-event-chip.cal-selected { background: ' + gen.darkText + ' !important; border-left-color: ' + gen.darkText + ' !important; }\n'
        + '.cal-day-cell.cal-today { background: ' + gen.bg + ' !important; }\n'
        + '.cal-day-cell.cal-today .cal-day-num { background: ' + gen.darkText + ' !important; color: #fff !important; }\n'
        // 💡 [2026-08-30 추가] 요일 헤더 토요일 글자/토요일 날짜 숫자 색, 달력 표 바깥 테두리가 옛 고정
        // 파랑(#1971c2/#cfe3e5)이라 테마가 안 먹혔음 — 일요일 빨강은 관례대로 고정 유지하고, 토요일과
        // 테두리만 테마색을 따르도록 편입.
        + '.cal-weekday-row > div:last-child { color: ' + gen.darkText + ' !important; }\n'
        + '.cal-day-cell.cal-weekend-sat .cal-day-num { color: ' + gen.darkText + ' !important; }\n'
        + '.cal-grid-wrap { border-color: ' + gen.border + ' !important; }\n'
        // 🐛 [2026-08-30 버그 수정] "달력 년월 표시/요일 셀/도표 색상이 계속 회색으로 박혀서 테마가
        // 안 바뀐다"는 반복된 지적 — 원인은 그동안 "파란색만"/"이번주·이번달만" 같은 좁은 범위로만
        // 하나씩 고쳐와서, 정작 (1) 현재 달이 아닌 다른 달들의 "OOOO년 O월" 제목(.cal-month-title,
        // 이번달만 compGen으로 덮여 있었음), (2) 요일 헤더 줄의 배경/밑줄과 월~금 글자색,
        // (3) 날짜 칸 사이 구분선(.cal-day-cell 테두리)은 그동안 단 한 번도 테마 규칙에 안 들어가
        // 있었다 — 항상 정적 회색(#f4f6f8/#e3e6ea/#555/#eee)이었던 것. 이번에 전부 포함시킨다.
        + '.cal-month-title { color: ' + gen.darkText + ' !important; }\n'
        + '.cal-weekday-row { background: ' + gen.headerTint + ' !important; }\n'
        + '.cal-weekday-row > div { border-bottom-color: ' + gen.border + ' !important; }\n'
        // 🐛 [2026-08-30 주의] 위 규칙에 color까지 같이 넣으면 !important끼리는 특이도와 무관하게
        // "이 rule이 이겨야 하는" :first-child(일요일 빨강, 아래 static 규칙엔 !important가 없음)
        // 보다 이 규칙이 우선해버려 일요일까지 테마색으로 덮어써 버린다 — 월~금(5칸)만 콕 집어서
        // 적용해 일요일 빨강/토요일 테마색(위에서 이미 처리) 둘 다 안전하게 유지한다.
        + '.cal-weekday-row > div:not(:first-child):not(:last-child) { color: ' + gen.darkText + ' !important; }\n'
        + '.cal-day-cell { border-color: ' + gen.border + ' !important; }\n'
        // 💡 [2026-08-30 추가] 월/주 토글(.cal-view-toggle) 바깥 테두리도 옛 고정 하늘색이었음.
        + '.cal-view-toggle { border-color: ' + gen.hoverBg + ' !important; }\n'
        // 💡 [2026-08-30 추가] Address 표 헤더 클릭 정렬 호버/정렬 표시(▲▼)도 테마색으로.
        + '#tab-address .concept-table thead th[data-sort-field]:hover { background-color: ' + gen.hoverBg + ' !important; }\n'
        + '#tab-address .addr-sort-indicator { color: ' + gen.darkText + ' !important; }\n'
        // 💡 [2026-08-30 추가] "핀셋 알람"/"이번달·이번주 강조"는 테마색이 아니라 그 보색(위 compGen)으로
        // — 업무 상자(테마색)와는 확실히 구분되면서, 어떤 테마를 고르든 항상 대비되는 색이 나오게 함.
        + '.cal-event-chip.cal-alarm-on { background: ' + compGen.headerTint + ' !important; border-left-color: ' + compGen.hoverBorder + ' !important; color: ' + compGen.darkText + ' !important; }\n'
        + '.cal-month-block.cal-month-current { background: ' + compGen.headerTint + ' !important; outline-color: ' + compGen.hoverBorder + ' !important; }\n'
        + '.cal-month-block.cal-month-current .cal-month-title { color: ' + compGen.darkText + ' !important; }\n'
        // 💡 [2026-08-30 추가] 날짜 클릭 시 뜨는 "업무 목록" 팝업의 각 항목도 파스텔 호버(테두리+배경 채우기)
        // 적용 — 라벨 박스 호버와 동일한 규칙. 핀셋 알람 항목은 위 그리드 칩과 통일해서 보색 사용.
        + '.cal-day-popup-item { border-color: ' + gen.border + ' !important; }\n'
        + '.cal-day-popup-item:hover { background: ' + gen.headerTint + ' !important; border-color: ' + gen.hoverBorder + ' !important; }\n'
        + '.cal-day-popup-item.cal-alarm-on { background: ' + compGen.headerTint + ' !important; border-color: ' + compGen.hoverBorder + ' !important; }\n'
        + '.cal-day-popup-item.cal-alarm-on:hover { background: ' + compGen.hoverBg + ' !important; }\n';

    // 🐛 [버그 수정] "핀셋(알람 켜짐)" 행 파란 하이라이트(tr.alarm-on, #e3f2fd + 좌측 파란 선)가 지브라
    // 줄무늬보다 항상 위에 오도록 원래 코드에서 이미 한 번 재선언까지 해뒀는데, 지금 라이브 테마
    // 오버라이드(위 gantt-zebra-b 규칙)가 동일 특이도로 "더 나중에" 끼어들면서 도로 덮어써 알람 표시가
    // 테마색에 가려 안 보이게 됐다. 알람 표시는 청록/보라 등 테마와 무관한 고정 상태색이므로(M.C Table
    // MVD/R1/VS처럼) 절대 안 바뀌어야 함 — 이 오버라이드 블록 "맨 끝"에 원래 색을 다시 선언해 항상 이기게 함.
    // 💡 [2026-08-30 추가/보정] 처음엔 hue 195~235°(딱 "파랑" 프리셋 부근)만 예외로 뒀는데, 직접
    // 색상표에서 고르다 보면 청록·남색·보라처럼 "B(파랑) 값이 우세한" 색이 훨씬 넓은 범위에서 나오고
    // 그때마다 알람의 고정 파랑과 비슷해져 안 보인다는 지적 — hue 각도로 좁게 재는 대신, 방금 고른
    // 원색 자체의 R/G/B를 직접 비교해서 "B가 R,G보다 크거나 같은(=파랑이 우세한) 모든 색"을 예외로 함.
    const _pickedRgb = { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
    const isBlueTheme = _pickedRgb.b >= _pickedRgb.r && _pickedRgb.b >= _pickedRgb.g;
    const alarmBg = isBlueTheme ? '#fbe4e2' : '#e3f2fd';
    const alarmAccent = isBlueTheme ? '#e03131' : '#4285f4';
    css += '#myTable tbody tr.alarm-on td { background-color: ' + alarmBg + ' !important; }\n'
        + '#myTable tbody tr.alarm-on td:first-child { box-shadow: inset 3px 0 0 0 ' + alarmAccent + ' !important; }\n';

    // 💡 [2026-08-30 추가] 셀 안 번역(🌐) 버튼/번역 결과 글자색이 옛 고정 파랑(#0056b3)이었음 —
    // "완료" 행에서만 회색으로 바뀌는 예외는 더 구체적인 선택자라 그대로 유지됨.
    css += '.trans-btn-hide-print { color: ' + gen.darkText + ' !important; }\n';
    document.documentElement.style.setProperty('--trans-text', gen.darkText);

    // 💡 파일 곳곳(body 안)에 흩어진 <style> 블록 중 이 override보다 "문서상 나중에" 오는 것들이 있으면
    //    동일 특이도+!important 상황에서 그게 이겨버린다 — <head> 끝이 아니라 항상 body 맨 끝에 붙여서
    //    문서 전체에서 가장 마지막 스타일이 되도록 보장한다(매번 다시 appendChild해서 위치 유지).
    let styleTag = document.getElementById('cp-live-style');
    if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'cp-live-style'; }
    document.body.appendChild(styleTag);
    styleTag.textContent = css;

    // 🐛 [버그 수정] 이 두 트리거 버튼은 인라인 style에 직접 !important가 박혀 있어서(HTML 원본에
    // style="background:#e0f5f7 !important; ..."), 어떤 <style> 규칙도(설령 !important를 걸어도)
    // 인라인 !important보다 우선순위가 낮아 절대 못 이긴다 — 요소를 직접 찾아 스타일 자체를 새로 써야 함.
    ['gantt-filter-trigger-cal-wbs', 'gantt-filter-trigger-wr-wbs'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el || el.classList.contains('filter-active')) return; // 필터 활성 상태는 별도 파란 계열이라 건드리지 않음
        el.style.setProperty('background', gen.bg, 'important');
        el.style.setProperty('border-color', gen.hoverBg, 'important');
        el.style.setProperty('color', gen.darkText, 'important');
    });

    window._cpLiveAppliedHex = hex;
    window._cpUpdateApplyStatus();
    if (window.renderSheetTabsBar) window.renderSheetTabsBar(); // 💡 이미 그려진 시트 탭도 새 테마색으로 다시 그림

    // 💡 [2026-08-30 신규] "이전에 고른 테마 색을 저장해달라"는 요청 — 로그인 계정별 별도 저장소를 새로
    // 만들 필요 없이, 이미 프로젝트 파일 저장/불러오기에 실려다니는 tabData에 그냥 값 하나(themeColor)로
    // 얹는다. collectTabData()가 이 tabData를 통째로 반환해서 저장 payload에 그대로 실리고,
    // populateTabData()가 실행될 때마다(=드라이브 불러오기/새 시트 열기/로컬 백업 복원 등 모든 로드
    // 경로 공통) 아래 _cpApplyStoredTheme()이 자동으로 다시 적용한다 — "프로젝트 = 그 프로젝트를 쓰는
    // 사람"이라 사실상 로그인(사용자)별로 저장해두는 것과 같은 효과.
    // skipSave=true는 populateTabData 직후 "이미 저장된 값을 화면에 되살리는" 호출이라 다시 저장(및
    // dirty 표시)하지 않기 위함 — 안 그러면 프로젝트를 열기만 해도 "저장 안 한 변경사항 있음"으로 뜸.
    if (!skipSave) {
        window.tabData = window.tabData || {};
        window.tabData.themeColor = hex;
        // 🐛 [버그 수정] 여기서 무조건(전역 공용 플래그로) dirty 표시했더니, 팔레트에서 다른 색을
        // 눌러봤다가 결국 원래(저장돼 있던) 색으로 되돌아와도 한 번 켜진 dirty 플래그가 그대로 남아
        // 시트를 옮길 때마다 계속 저장 여부를 물어봤다 — 실제로는 아무것도 안 바뀐 상태인데도.
        // 다른 편집(Summary/Brief SPEC 등)의 dirty 플래그와는 별도로 "테마만의 dirty" 상태를 전용
        // 플래그(_cpThemeDirty)로 따로 관리해서, 저장된 기준값으로 되돌아오면 다시 꺼질 수 있게 한다
        // (_hasUnsavedChangesNow() 등에서 이 플래그도 같이 확인함).
        window._cpThemeDirty = (hex !== window._cpSavedThemeHex);
    }
};
// 💡 프로젝트를 저장할 때 테마도 같이 저장되도록, "청록으로 되돌리기"도 저장 대상 상태로 기록한다
// (안 그러면 새로고침 없이 저장만 했을 때 되돌린 게 반영 안 되고 이전 색이 계속 복원됨).
window._cpMarkRevertedForSave = function() {
    if (window.tabData) { delete window.tabData.themeColor; }
    // 🐛 [버그 수정] 저장된 기준값이 애초에 없었으면(=커스텀 테마를 저장한 적 없는 프로젝트) 되돌리기는
    // 실제로 아무것도 바꾸지 않는 조작이므로 dirty로 잡지 않는다.
    window._cpThemeDirty = !!window._cpSavedThemeHex;
};
// 💡 프로젝트를 불러온 직후(populateTabData) 저장돼 있던 테마 색이 있으면 자동으로 다시 적용.
// 💡 [2026-08-30 신규] "엑셀로 내보내기" 결과물(xlsx)이 항상 고정된 남색(1F3A5F)/회색 헤더로 나가던 것을,
// 지금 화면에 적용 중인 테마(팔레트로 고른 색이 있으면 그 색, 없으면 기본 청록)에 맞춰 색이 바뀌도록
// 하는 헬퍼. XLSX 셀 색은 "#" 없는 6자리 대문자 hex라 그 형식으로 반환한다.
// 💡 CP_ROLES(배경/헤더틴트/제브라/테두리/진한텍스트/호버배경/호버테두리) 중 하나를, 지금 라이브 적용된
// 커스텀 테마가 있으면 그 색으로, 없으면 기본 청록으로 계산해 "#rrggbb" 형태로 돌려준다 — JS로 동적
// 생성/갱신되는 UI(시트 탭바 등)가 하드코딩 hex 대신 이걸 직접 참조하면, onmouseover가 style을 건드려도
// (재직렬화 문제와 무관하게) 항상 최신 테마색을 쓰게 된다.
// 💡 baseHex를 명시적으로 넘기면 "지금 화면에 적용된 라이브 테마"가 아니라 그 색 기준으로 역할색을
// 계산한다 — 시트 탭바처럼 "지금 활성화된 시트"와 무관하게 "그 시트 자신이 저장해둔 테마"로 각자
// 색을 내야 하는 경우에 씀(아래 renderSheetTabsBar 참고).
window._cpRoleHexFor = function(roleKey, baseHex) {
    let hex;
    if (baseHex) {
        const hue = window._cpHexToHsl(baseHex).h;
        const roleDef = window.CP_ROLES.find(function(r) { return r.key === roleKey; });
        hex = roleDef ? window._cpHslToHex(hue, roleDef.s, roleDef.l) : window.CP_CURRENT_TEAL[roleKey];
    } else {
        hex = window.CP_CURRENT_TEAL[roleKey];
    }
    return hex || '#000000';
};
window._cpRoleHex = function(roleKey) {
    return window._cpRoleHexFor(roleKey, window._cpLiveAppliedHex);
};
// 💡 [2026-08-30 신규] "프로젝트 열기/삭제/복원" 목록의 파일 한 줄(row)이, 지금 화면에 적용 중인
// 테마가 아니라 "그 파일 자신이 저장해둔" 테마 색으로 보이도록 — 시트 탭바(renderSheetTabsBar)와
// 똑같은 원리. Drive appProperties.themeColor(가벼운 메타데이터 조회만으로 얻을 수 있음, 파일 내용
// 전체를 안 받아도 됨)를 기준으로 역할별 색을 계산해서 돌려준다.
window._driveRowThemeColors = function(file) {
    const hex = (file && file.appProperties && file.appProperties.themeColor) || null;
    return {
        bg: window._cpRoleHexFor('bg', hex),
        border: window._cpRoleHexFor('hoverBg', hex),
        hoverBg: window._cpRoleHexFor('zebraB', hex),
        hoverBorder: window._cpRoleHexFor('hoverBorder', hex),
        darkText: window._cpRoleHexFor('darkText', hex)
    };
};
window._cpXlsxRole = function(roleKey) {
    return window._cpRoleHex(roleKey).replace('#', '').toUpperCase();
};
// 🐛 [버그 수정] Calendar/Weekly Report의 LEVEL(WBS) 트리거 버튼(#gantt-filter-trigger-cal-wbs,
// #gantt-filter-trigger-wr-wbs)은 원본 HTML에 인라인 !important 스타일이 박혀 있어서(위 _cpApplyLive의
// "이 두 트리거 버튼은..." 주석 참고) 어떤 CSS :hover 규칙도 이걸 못 이긴다 — 실측 결과 마우스를
// 올려도 색이 전혀 안 바뀌었음. 베이스 색과 똑같이 hover도 JS로 직접 스타일을 바꿔야 한다.
// filter-active(실제 필터 적용중) 상태는 별도 파란 계열 강조색이라 건드리지 않고 그대로 둔다.
window._gftHover = function(el, entering) {
    if (!el || el.classList.contains('filter-active')) return;
    const bg = entering ? window._cpRoleHex('hoverBg') : window._cpRoleHex('bg');
    const border = entering ? window._cpRoleHex('hoverBorder') : window._cpRoleHex('hoverBg');
    el.style.setProperty('background', bg, 'important');
    el.style.setProperty('border-color', border, 'important');
    el.style.setProperty('color', window._cpRoleHex('darkText'), 'important');
};
window._cpApplyStoredTheme = function() {
    // 💡 [2026-08-31 수정] 프로젝트에 저장된 테마색이 없으면(신규/미설정 프로젝트) 예전엔 아무 것도
    //    적용하지 않아 하드코딩된 청록 그대로 보였다 — 이제 CP_DEFAULT_HEX(파랑)를 기본값으로 적용한다.
    const hex = (window.tabData && window.tabData.themeColor) || window.CP_DEFAULT_HEX;
    // 💡 [2026-08-30] 이 프로젝트가 실제로 저장해둔(또는 안 해둔) 테마를 "기준값"으로 기록 — 팔레트를
    // 열어 색을 이리저리 눌러보다가 결국 이 값으로 되돌아오면 dirty로 잡지 않기 위함.
    window._cpSavedThemeHex = hex || null;
    window._cpThemeDirty = false; // 방금 불러온 프로젝트는 아직 아무것도 안 건드린 깨끗한 상태
    if (hex && window._cpApplyLive) window._cpApplyLive(hex, true);
};
if (!window._cpPopulateTabDataWrapped) {
    window._cpPopulateTabDataWrapped = true;
    window.addEventListener('DOMContentLoaded', function() {
        // 💡 [2026-08-31 신규] populateTabData는 프로젝트를 실제로 열었을 때만 호출된다 — 그래서 기본값
        //    적용을 그 안에서만 하면, 아직 프로젝트를 안 연 "빈 화면"(사이드바/상단바 등)은 새로고침(F5)
        //    직후에도 계속 하드코딩된 청록으로 보였다. 여기서 한 번 더 즉시 호출해서, 프로젝트를 열기
        //    전부터 기본값(파랑)이 곧바로 적용되게 한다(tabData가 비어 있으면 CP_DEFAULT_HEX로 대체됨).
        window._cpApplyStoredTheme();
        const _origPopulateTabData = window.populateTabData;
        window.populateTabData = function() {
            const ret = _origPopulateTabData ? _origPopulateTabData.apply(this, arguments) : undefined;
            window._cpApplyStoredTheme();
            return ret;
        };
    });
}
window._cpRevertLive = function() {
    const styleTag = document.getElementById('cp-live-style');
    if (styleTag) styleTag.textContent = '';
    ['gantt-filter-trigger-cal-wbs', 'gantt-filter-trigger-wr-wbs'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el || el.classList.contains('filter-active')) return;
        el.style.setProperty('background', '#e0f5f7', 'important');
        el.style.setProperty('border-color', '#a3d9e0', 'important');
        el.style.setProperty('color', '#00707d', 'important');
    });
    // 💡 --trans-text는 <style id="cp-live-style"> 안이 아니라 documentElement 인라인으로 직접 설정하므로
    // (CSS 커스텀 프로퍼티라 !important 규칙으로는 못 지움), 되돌리기 시 여기서도 같이 teal 기본값으로 되돌려야 함.
    document.documentElement.style.setProperty('--trans-text', '#00707d');
    window._cpLiveAppliedHex = null;
    window._cpUpdateApplyStatus();
    if (window._cpMarkRevertedForSave) window._cpMarkRevertedForSave();
    if (window.renderSheetTabsBar) window.renderSheetTabsBar();
};
window._cpUpdateApplyStatus = function() {
    const el = document.getElementById('cp-apply-status');
    if (!el) return;
    if (window._cpLiveAppliedHex) {
        el.textContent = '✅ 지금 실제 페이지에 적용 중 (' + window._cpLiveAppliedHex + ' 기반)';
        el.style.color = '#1f7a3d';
    } else {
        el.textContent = '⚪ 아직 미리보기만 — 실제 페이지는 원래 청록 그대로입니다';
        el.style.color = '#888';
    }
};

window.openColorPaletteModal = function() {
    // 💡 [2026-08-30 수정] 청록(#00707d) 프리셋만은 다른 프리셋처럼 _cpApplyLive(hex)로 "그 색을 새로
    // 적용"하는 게 아니라 _cpRevertLive()로 "원래 기본 상태로 되돌리기"를 호출한다 — 둘 다 화면에
    // 보이는 색은 똑같지만(청록 hue로 역산한 값이라), _cpApplyLive는 _cpLiveAppliedHex를 '#00707d'로
    // 남겨 "커스텀 색을 청록과 우연히 같게 골랐을 뿐"인 상태가 되어 저장 시 불필요하게 "변경사항
    // 있음"으로 잡히던 문제(예전 "↩️ 청록으로 되돌리기" 버튼이 이 구분을 위해 따로 있었음)가 있었다.
    document.getElementById('cp-preset-swatches-list').innerHTML = window.CP_PRESETS.map(function(hex) {
        const isDefault = hex === '#00707d';
        const action = isDefault ? "window._cpRevertLive();" : "window._cpApplyLive('" + hex + "');";
        const title = isDefault ? hex + ' (기본 청록 — 클릭하면 원래대로 되돌아갑니다)' : hex;
        return '<div onclick="window._cpRenderPreview(\'' + hex + '\'); ' + action + '" title="' + title + '" style="width:32px; height:32px; border-radius:50%; background:' + hex + '; cursor:pointer; border:2px solid #fff; box-shadow:0 0 0 1px #ddd;"></div>';
    }).join('');
    // 🐛 [버그 수정] "직접 선택" 칸이 항상 하드코딩 기본값(#2c5f8a)에서 시작해서, 이미 다른 색(예:
    // 빨강)이 저장/적용돼 있는 프로젝트에서 로고를 눌러 팔레트를 열기만 해도 그 기본값으로 미리보기가
    // 그려지며(아래 _cpRenderPreview가 라이브 모드일 때 자동 재적용) 실제 테마가 조용히 바뀌었었다.
    // 지금 실제로 적용 중인 색이 있으면 그 색으로 칸을 먼저 맞춰서, 아무것도 새로 고르지 않았으면
    // 정말 아무 변화도 없도록 한다.
    document.getElementById('cp-custom-color').value = window._cpLiveAppliedHex || '#2c5f8a';
    window._cpRenderPreview(window._cpLiveAppliedHex || document.getElementById('cp-custom-color').value || '#2c5f8a');
    window._cpUpdateApplyStatus();
    document.getElementById('color-palette-modal-overlay').style.display = 'block';
    document.getElementById('color-palette-modal').style.display = 'block';
    if (window.bringModalToFront) window.bringModalToFront('color-palette-modal');
};
window.closeColorPaletteModal = function() {
    document.getElementById('color-palette-modal-overlay').style.display = 'none';
    document.getElementById('color-palette-modal').style.display = 'none';
};
if (window._makeDraggable) window._makeDraggable('color-palette-modal', 'cp-modal-header');
if (window._bindClickToFront) window._bindClickToFront('color-palette-modal');
