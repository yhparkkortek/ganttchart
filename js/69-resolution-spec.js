// 🖥 [2026-11-09 신규] 지원 해상도(RESOLUTION SPEC) — 고르는 팝업 하나
//
//  왜: Customer SPEC 의 F/W Version · EDID Check Sum 옆에는 "이 EDID 가 어떤 해상도를
//      어느 입력으로 지원하는가" 가 따라다닌다(원본 문서 `4. RESOLUTION SPEC`).
//      지금까지는 그 표가 앱에 없어서 문서를 따로 손으로 적고 있었다.
//      사용자 요청(2026-11-09): "F/W EDID 에 지원 해상도를 선택할 수 있는 팝업을 하나 띄우면
//      좋겠는데, 지금은 좀 오래된 해상도가 있으니 VESA 지원 해상도 추가해서 선택할 수 있게 해줘."
//
//  🔤 용어 (사용자 지시): 원본 문서의 `PC` 칸은 **아날로그 RGB(D-Sub/VGA)** 를 뜻한다 →
//      이 앱에서는 `RGB` 로 적는다. 포트 목록은 `RES_PORTS`(데이터) 한 곳에만 있다.
//
//  ⚠️ 해상도는 **코드에 박지 않는다** — `RESOLUTION_CATALOG`(데이터) + 사람이 그 자리에서
//      보태는 `tabData.resolutionCustom` 두 곳에서 온다. 새 해상도가 생기면 앱을 고치지 않고
//      팝업에서 한 줄 적어 넣으면 된다.
//  ⚠️ 같은 모드가 두 번 뜨지 않게 **정규화 열쇠**(W×H[i]@Hz[RB])로 합친다 — 원본 목록에도
//      `1600x1200@60` 과 `VESA 1600x1200@60` 이 따로 들어가 있었다(실측).
//  ⚠️ 저장은 제품구분자(모델)별이다 — M.C/BOM/Customer SPEC 과 **같은** `mcActiveUnit` 을 쓴다.
//      한 프로젝트 안에서 모델마다 EDID 가 다를 수 있다.
(function () {
    'use strict';

    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _td = function () { window.tabData = window.tabData || {}; return window.tabData; };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };
    // ⚠️ [2026-11-24] `markUnsavedChanges` 는 앱에 없는 함수였다 — 고른 해상도가 저장 대상으로 표시되지 않았다(js/67 같은 버그).
    var _markDirty = function () {
        try {
            if (window._markNonGanttDirty) window._markNonGanttDirty();
            else if (window.markUnsavedChanges) window.markUnsavedChanges();
        } catch (e) { /* 없으면 넘어간다 */ }
    };

    // ── 🔌 입력 포트 (데이터) ───────────────────────────────────────────
    //   ⚠️ 옛 문서의 `PC` = 아날로그 RGB. 용어를 RGB 로 통일한다(사용자 지시 2026-11-09).
    window.RES_PORTS = window.RES_PORTS || [
        { key: 'RGB',  label: 'RGB',  title: '아날로그 RGB (D-Sub / VGA) — 옛 문서의 "PC" 칸' },
        { key: 'DVI',  label: 'DVI',  title: 'DVI-D / DVI-I 디지털' },
        { key: 'HDMI', label: 'HDMI', title: 'HDMI' },
        { key: 'DP',   label: 'DP',   title: 'DisplayPort (eDP 포함)' }
    ];

    // ── 📺 해상도 카탈로그 (데이터) ─────────────────────────────────────
    //   `기존 목록` 은 원본 문서 `4. RESOLUTION SPEC` 을 **그대로** 옮긴 것이다(실측 49행).
    //   나머지 묶음은 사용자 요청으로 보탠 VESA 표준 해상도다.
    window.RESOLUTION_CATALOG = window.RESOLUTION_CATALOG || [
        {
            g: '기존 목록 (문서 실측)',
            list: [
                'IBM 640×350@70', '640×240@60', 'IBM 640×400@70', 'VESA 640×400@85',
                'VESA 720×400@70', 'VESA 720×400@85',
                'VESA 640×480@59.9', 'MAC 640×480@66.7', '640×480@70', 'VESA 640×480@72.8',
                'VESA 640×480@75', 'VESA 640×480@85',
                'VESA 800×600@56.2', 'VESA 800×600@60.3', '800×600@70', 'VESA 800×600@72.2',
                'VESA 800×600@75', 'VESA 800×600@85.1',
                'MAC 832×624@74.6',
                'VESA 1024×768@59.8', 'VESA 1024×768@70', 'VESA 1024×768@74.9', 'VESA 1024×768@85',
                'VESA 1152×864@70.2', 'VESA 1152×864@75', 'VESA 1152×864@85', 'MAC 1152×870@75.1',
                '1280×720@60', '1280×768@60.3',
                'VESA 1280×960@60', 'VESA 1280×960@75', 'VESA 1280×960@85',
                '1360×768@59.9', '1366×768@59.9',
                'VESA 1280×1024@60', 'VESA 1280×1024@70', 'VESA 1280×1024@75', 'VESA 1280×1024@85',
                '1600×1200@60', '1600×900@60', 'VESA 1600×1200@60',
                '1680×1050@60', '1920×1080@60', '1280×800@60', '960×600@60',
                '1920×1920@60', '2560×2880@60', '1280×242@60', '1920×510@60'
            ]
        },
        {
            // VESA DMT — 모니터 표준 타이밍. (RB) = Reduced Blanking(감축 블랭킹)으로 **다른 타이밍**이다.
            g: 'VESA DMT (추가)',
            list: [
                'VESA 1280×768@60 (RB)', 'VESA 1280×768@75', 'VESA 1280×768@85',
                'VESA 1280×800@60 (RB)', 'VESA 1280×800@75', 'VESA 1280×800@85',
                'VESA 1366×768@60 (RB)',
                'VESA 1400×1050@60 (RB)', 'VESA 1400×1050@60', 'VESA 1400×1050@75', 'VESA 1400×1050@85',
                'VESA 1440×900@60 (RB)', 'VESA 1440×900@60', 'VESA 1440×900@75', 'VESA 1440×900@85',
                'VESA 1600×900@60 (RB)',
                'VESA 1600×1200@65', 'VESA 1600×1200@70', 'VESA 1600×1200@75', 'VESA 1600×1200@85',
                'VESA 1680×1050@60 (RB)', 'VESA 1680×1050@75', 'VESA 1680×1050@85',
                'VESA 1792×1344@60', 'VESA 1792×1344@75',
                'VESA 1856×1392@60', 'VESA 1856×1392@75',
                'VESA 1920×1200@60 (RB)', 'VESA 1920×1200@60', 'VESA 1920×1200@75', 'VESA 1920×1200@85',
                'VESA 1920×1440@60', 'VESA 1920×1440@75',
                'VESA 2048×1152@60 (RB)',
                'VESA 2560×1600@60 (RB)', 'VESA 2560×1600@60', 'VESA 2560×1600@75', 'VESA 2560×1600@85',
                'VESA 4096×2160@60 (RB)'
            ]
        },
        {
            // VESA CVT / CVT-RB — 요즘 쓰는 와이드·고해상도. 모니터 쪽에서 실제로 들어오는 것들.
            g: 'VESA CVT (와이드 · 고해상도)',
            list: [
                'VESA 1920×1080@120', 'VESA 1920×1080@144',
                'VESA 2560×1080@60', 'VESA 2560×1440@60', 'VESA 2560×1440@120',
                'VESA 3440×1440@60', 'VESA 3440×1440@100',
                'VESA 3840×1080@60', 'VESA 3840×1200@60',
                'VESA 3840×2160@30', 'VESA 3840×2160@60', 'VESA 3840×2160@120',
                'VESA 5120×1440@60', 'VESA 5120×2880@60', 'VESA 7680×4320@60'
            ]
        },
        {
            // CTA-861 — HDMI/DP 가 영상 기기에서 받는 포맷. `i` 는 인터레이스(다른 모드다).
            g: 'CTA-861 (HDMI · DP 영상 포맷)',
            list: [
                '720×480p@60', '720×576p@50',
                '1280×720p@50', '1280×720p@60',
                '1920×1080i@50', '1920×1080i@60',
                '1920×1080p@24', '1920×1080p@25', '1920×1080p@30', '1920×1080p@50', '1920×1080p@60',
                '2560×1440p@60',
                '3840×2160p@24', '3840×2160p@25', '3840×2160p@30', '3840×2160p@50', '3840×2160p@60',
                '4096×2160p@24', '4096×2160p@30', '4096×2160p@60'
            ]
        }
    ];

    // ── 🔑 정규화 열쇠 ──────────────────────────────────────────────────
    //   같은 모드를 두 번 보여주지 않기 위한 것. `p`(프로그레시브)는 안 적은 것과 같은 것으로 보고,
    //   `i`(인터레이스)와 `RB`(감축 블랭킹)는 **다른 모드**라 열쇠에 남긴다.
    //   주사율은 반올림한다 — 문서가 `59.9`/`60.3` 처럼 실측값을 적어 두기 때문이다.
    window.resKeyOf = function (label) {
        var s = String(label == null ? '' : label).toUpperCase().replace(/\s+/g, ' ');
        var rb = /\(RB\)|\bRB\b/.test(s) ? 'RB' : '';
        var m = s.match(/(\d{3,5})\s*[X×]\s*(\d{2,5})\s*([IP])?\s*@\s*([\d.]+)/);
        if (!m) return s.replace(/[^A-Z0-9]/g, '');   // 모양이 다르면 글자 그대로 (사람이 적어 넣은 것)
        var hz = Math.round(parseFloat(m[4]) || 0);
        return m[1] + 'X' + m[2] + (m[3] === 'I' ? 'I' : '') + '@' + hz + rb;
    };

    // 카탈로그 + 사람이 보탠 것 → [{key,label,g}] (중복 제거, 먼저 나온 이름이 이긴다)
    window.resAllRows = function () {
        var out = [], seen = {};
        var push = function (label, g) {
            var lab = String(label == null ? '' : label).trim();
            if (!lab) return;
            var k = window.resKeyOf(lab);
            if (!k || seen[k]) return;
            seen[k] = true;
            out.push({ key: k, label: lab, g: g });
        };
        (window.RESOLUTION_CATALOG || []).forEach(function (grp) {
            (grp.list || []).forEach(function (lab) { push(lab, grp.g); });
        });
        window.resCustomList().forEach(function (lab) { push(lab, CUSTOM_G); });
        return out;
    };

    // ── 🧑‍💼 CUSTOMER RESOLUTION — 고객이 따로 요구하는 해상도 ───────────
    //   표준 목록에 없는 모드는 프로젝트마다 다르다(실측 원본에도 `1280×242@60`·`1920×510@60`
    //   같은 줄이 있다). **코드가 아니라 이 프로젝트의 데이터**로 둔다.
    //   ⚠️ 제품구분자별이 아니라 **프로젝트 하나**다 — 같은 고객 모델의 어휘라서 모델마다
    //      따로 적게 하면 같은 줄을 두 번 적게 된다(고른 것은 모델별로 따로 남는다).
    var CUSTOM_G = 'CUSTOMER RESOLUTION';
    window.RES_CUSTOM_GROUP = CUSTOM_G;
    window.resCustomList = function () {
        var td = _td();
        if (!Array.isArray(td.resolutionCustom)) td.resolutionCustom = [];
        return td.resolutionCustom;
    };
    /** 빈 행 하나 — 사람이 그 자리에서 적는다 */
    window.resCustomAdd = function () {
        window.resCustomList().push('');
        _markDirty(); _paintRows();
        var els = document.querySelectorAll('#respick-body input[data-res-custom]');
        var last = els[els.length - 1];
        if (last) { last.focus(); }
    };
    /**
     * 이름 고치기. ⚠️ **고른 것이 따라와야 한다** — 열쇠는 이름에서 나오므로, 이름을 고치면
     * 옛 열쇠에 붙어 있던 체크가 길을 잃는다(오타 한 글자에 체크가 통째로 사라진다).
     */
    window.resCustomSet = function (i, v) {
        var list = window.resCustomList();
        if (i < 0 || i >= list.length) return;
        var old = String(list[i] || '').trim();
        v = String(v == null ? '' : v).trim();
        if (old === v) return;
        var st = _store(), ok = old ? window.resKeyOf(old) : '', nk = v ? window.resKeyOf(v) : '';
        list[i] = v;
        if (ok && st[ok]) {
            if (nk && nk !== ok) { st[nk] = { label: v, ports: st[ok].ports }; delete st[ok]; }
            else if (!nk) { delete st[ok]; }          // 이름을 비우면 고른 것도 뺀다
            else { st[ok].label = v; }                 // 열쇠는 같고 글자만 바뀐 경우
        }
        _markDirty(); _paintRows(); _paintFoot();
    };
    window.resCustomDel = function (i) {
        var list = window.resCustomList();
        if (i < 0 || i >= list.length) return;
        var lab = String(list[i] || '').trim();
        if (lab && !confirm(_t('이 해상도를 목록에서 뺍니다:\n\n' + lab + '\n\n빼면 고른 표시도 같이 사라집니다.',
                               'Remove this resolution?'))) return;
        var st = _store(), k = lab ? window.resKeyOf(lab) : '';
        if (k && st[k]) delete st[k];
        list.splice(i, 1);
        _markDirty(); _paintRows(); _paintFoot();
    };

    // ── 💾 저장 (제품구분자별) ──────────────────────────────────────────
    window.resActiveUnit = function () {
        if (window.bsActiveUnit) { try { return window.bsActiveUnit() || '_'; } catch (e) { /* 〃 */ } }
        return window.mcActiveUnit || '_';
    };
    var _store = function () {
        var td = _td();
        td.resolutionSpecByUnit = td.resolutionSpecByUnit || {};
        var u = window.resActiveUnit();
        td.resolutionSpecByUnit[u] = td.resolutionSpecByUnit[u] || {};
        return td.resolutionSpecByUnit[u];
    };
    /** 지금 모델의 선택 — { '<key>': { label:'…', ports:{HDMI:1,…} } } */
    window.resSel = function () { return _store(); };

    window.resPortOn = function (key, port) {
        var r = _store()[key];
        return !!(r && r.ports && r.ports[port]);
    };
    window.resSetPort = function (key, label, port, on) {
        var st = _store();
        var r = st[key];
        if (!r) { r = st[key] = { label: label || key, ports: {} }; }
        // 이름은 **고를 때 쓴 이름**을 남긴다 — 카탈로그가 바뀌어도 옛 선택이 글자를 잃지 않는다.
        if (label && !r.label) r.label = label;
        if (on) r.ports[port] = 1; else delete r.ports[port];
        if (!Object.keys(r.ports).length) delete st[key];   // 한 칸도 없으면 줄 자체를 지운다
        _markDirty();
    };

    /** 고른 줄만, 카탈로그 순서로 → [{key,label,ports,g}] */
    window.resSelectedRows = function () {
        var st = _store(), out = [], seen = {};
        window.resAllRows().forEach(function (r) {
            if (st[r.key]) { out.push({ key: r.key, label: r.label, ports: st[r.key].ports || {}, g: r.g }); seen[r.key] = 1; }
        });
        // 카탈로그에서 사라진 옛 선택도 **버리지 않는다**(사람이 고른 사실이 더 중요하다)
        Object.keys(st).forEach(function (k) {
            if (!seen[k]) out.push({ key: k, label: st[k].label || k, ports: st[k].ports || {}, g: _t('목록 밖', 'Other') });
        });
        return out;
    };

    /** 'RGB 3 · DVI 0 · HDMI 12 · DP 14' (고른 게 없으면 '') */
    window.resSummary = function () {
        var rows = window.resSelectedRows();
        if (!rows.length) return '';
        return (window.RES_PORTS || []).map(function (p) {
            var n = 0;
            rows.forEach(function (r) { if (r.ports[p.key]) n++; });
            return p.label + ' ' + n;
        }).join(' · ');
    };

    // ── 🪟 팝업 ────────────────────────────────────────────────────────
    //   ⚠️ 새로 디자인하지 않는다 — 앱의 다른 고르기 창(js/67 `docgw-*`)과 **같은 모양**이고
    //      끌기는 공용 `_makeDraggable` 하나를 쓴다(js/19).
    var _filter = '';
    var _onDone = null;
    // ✅ 고른 것만 보기 (접기) — Customer SPEC·M.C Table 의 `🔽 펼치기` 와 **같은 뜻**이다.
    //   ⚠️ 117줄을 다 펼쳐 두면 "내가 뭘 골랐는지" 가 안 보인다(사용자 요청 2026-11-09).
    var _onlyChecked = false;

    window.resOpenPicker = function (opts) {
        opts = opts || {};
        _onDone = opts.onDone || null;
        var ov = document.getElementById('respick-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'respick-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9500; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="respick-box" style="pointer-events:all; position:fixed; left:50%; top:7%;'
                + ' transform:translateX(-50%); width:min(880px,95vw); max-height:84vh; display:flex; flex-direction:column;'
                + ' background:#fff; border:1px solid #a3d9e0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18);'
                + ' overflow:hidden;">'
                + '<div id="respick-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between;'
                + ' padding:9px 12px; background:#e0f5f7; border-bottom:1px solid #a3d9e0; color:#00707d;'
                + ' font-weight:bold; font-size:13px; cursor:grab;"><span id="respick-title"></span>'
                + '<button onclick="window.resClosePicker()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="respick-bar" style="flex-shrink:0; padding:8px 12px; border-bottom:1px solid #cfe3e5;'
                + ' display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px;"></div>'
                + '<div id="respick-body" style="flex:1; min-height:0; overflow-y:auto; padding:0 12px 10px;"></div>'
                + '<div id="respick-foot" style="flex-shrink:0; padding:8px 12px; border-top:1px solid #cfe3e5;'
                + ' background:#eef6f7; display:flex; align-items:center; gap:10px; font-size:12px;"></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('respick-box', 'respick-head'); } catch (e) { /* 〃 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('respick-overlay'); } catch (e) { /* 〃 */ } }
            // 🧬 EDID 파일을 창에 끌어다 놓기 — ⚠️ stopPropagation 필수(안 막으면 js/04f 전역 드롭이
            //    그 파일을 프로젝트 엑셀로 열려 한다, docs/file-upload-dragdrop-audit.md)
            var box = document.getElementById('respick-box');
            box.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); });
            box.addEventListener('drop', function (e) {
                e.preventDefault(); e.stopPropagation();
                var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (f) window.resEdidLoadFile(f);
            });
            // 칸 누르기는 **위임**으로 받는다 — 줄이 수백 개라 칸마다 달면 느리다.
            document.getElementById('respick-body').addEventListener('change', function (e) {
                var el = e.target;
                if (!el || !el.getAttribute) return;
                var k = el.getAttribute('data-res');
                if (!k) return;
                var parts = k.split('|');
                window.resSetPort(parts[0], el.getAttribute('data-res-label') || parts[0], parts[1], el.checked);
                _paintFoot();
            });
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('respick-overlay'); } catch (e) { /* 〃 */ } }
        _filter = '';
        // 고른 게 있으면 **접힌 채로** 연다 — 그게 지금 이 프로젝트의 답이다(Customer SPEC 과 같은 규칙).
        // 아무것도 안 골랐으면 접어 봐야 빈 화면이라 펼쳐서 연다.
        _onlyChecked = Object.keys(_store()).length > 0;
        _render();
    };

    window.resClosePicker = function () {
        var ov = document.getElementById('respick-overlay');
        if (ov) ov.style.display = 'none';
        if (_onDone) { try { _onDone(); } catch (e) { console.warn('[res onDone]', e); } }
        if (window._docRender && window._docState && window._docState.formId) {
            try { window._docRender(); } catch (e) { /* 문서 페이지가 없으면 넘어간다 */ }
        }
    };

    window.resFilter = function (v) { _filter = String(v || '').trim(); _paintRows(); };

    /** 지금 보이는 줄 전부를 그 포트로 켜거나 끈다 (CUSTOMER 줄도 보이면 같이) */
    window.resToggleColumn = function (port, on) {
        var rows = _visibleRows().concat(_customRows().filter(function (r) { return !!r.key; }));
        rows.forEach(function (r) { window.resSetPort(r.key, r.label, port, on); });
        _paintRows(); _paintFoot();
        _toast('🖥 ' + port + ' — ' + rows.length + _t(' 줄을 ', ' rows ') + (on ? _t('켰습니다.', 'on.') : _t('껐습니다.', 'off.')), 'info');
    };

    window.resClearAll = function () {
        var st = _store();
        Object.keys(st).forEach(function (k) { delete st[k]; });
        _markDirty(); _paintRows(); _paintFoot();
    };

    var _visibleRows = function () {
        var f = _filter.toUpperCase().replace(/\s+/g, '');
        var st = _store();
        return window.resAllRows().filter(function (r) {
            if (r.g === CUSTOM_G) return false;       // CUSTOMER 묶음은 따로 그린다(빈 행도 보여야 한다)
            if (_onlyChecked && !st[r.key]) return false;
            if (!f) return true;
            return (r.label + ' ' + r.g).toUpperCase().replace(/\s+/g, '').indexOf(f) >= 0;
        });
    };

    /**
     * CUSTOMER 묶음에서 **화면에 그릴** 줄 — `{ idx, label, key }`.
     * ⚠️ 접어 뒀어도 **빈 행(새로 더한 행)은 보여 준다** — 안 그러면 적을 자리가 사라진다.
     */
    var _customRows = function () {
        var f = _filter.toUpperCase().replace(/\s+/g, '');
        var st = _store();
        return window.resCustomList().map(function (lab, i) {
            return { idx: i, label: String(lab || ''), key: lab ? window.resKeyOf(lab) : '' };
        }).filter(function (r) {
            if (!r.label) return true;
            if (_onlyChecked && !st[r.key]) return false;
            if (!f) return true;
            return r.label.toUpperCase().replace(/\s+/g, '').indexOf(f) >= 0;
        });
    };

    /** 접기(고른 것만) ↔ 펼치기(전체) */
    window.resToggleOnlyChecked = function () {
        _onlyChecked = !_onlyChecked;
        _paintRows(); _paintToggleBtn();
    };

    var _paintToggleBtn = function () {
        var b = document.getElementById('respick-only');
        if (!b) return;
        // 앱의 다른 표와 같은 말: 접혀 있으면 [🔽 전체 보기], 펼쳐져 있으면 [🔼 고른 것만]
        b.textContent = _onlyChecked ? '🔽 ' + _t('전체 보기', 'Show all') : '🔼 ' + _t('고른 것만', 'Picked only');
        b.style.background = _onlyChecked ? '#00707d' : '#e0f5f7';
        b.style.color = _onlyChecked ? '#fff' : '#00707d';
    };

    var _render = function () {
        var unit = window.resActiveUnit();
        document.getElementById('respick-title').textContent =
            '🖥 ' + _t('지원 해상도 (RESOLUTION SPEC)', 'Supported resolutions')
            + (unit && unit !== '_' ? ' — ' + unit : '');

        var ports = window.RES_PORTS || [];
        document.getElementById('respick-bar').innerHTML =
            '<input id="respick-q" type="text" oninput="window.resFilter(this.value)" placeholder="'
            + _esc(_t('해상도 검색 (예: 1920, @60, VESA)', 'search')) + '"'
            + ' style="flex:1; min-width:160px; padding:4px 8px; border:1px solid #cfe3e5; border-radius:5px; font-size:12px;">'
            // ✅ 고른 것만 보기 — Customer SPEC 의 `🔽 펼치기` 버튼과 같은 모양·같은 뜻
            + '<button id="respick-only" onclick="window.resToggleOnlyChecked()" title="'
            + _esc(_t('체크한 해상도만 보이게 접습니다', 'Show only checked rows')) + '"'
            + ' style="padding:4px 10px; border:1px solid #a3d9e0; border-radius:5px; font-size:11.5px;'
            + ' font-weight:bold; cursor:pointer; white-space:nowrap;"></button>'
            + '<span style="color:#868e96;">' + _esc(_t('보이는 줄 전체:', 'All visible:')) + '</span>'
            + ports.map(function (p) {
                return '<span style="white-space:nowrap;"><b>' + _esc(p.label) + '</b> '
                     + '<a href="#" onclick="window.resToggleColumn(\'' + _esc(p.key) + '\',true);return false;" style="color:var(--ui-accent, #00707d);">'
                     + _esc(_t('켜기', 'on')) + '</a> / '
                     + '<a href="#" onclick="window.resToggleColumn(\'' + _esc(p.key) + '\',false);return false;" style="color:#b1432f;">'
                     + _esc(_t('끄기', 'off')) + '</a></span>';
            }).join('')
            + '<span style="margin-left:auto; color:#868e96;">'
            + _esc(_t('RGB = 아날로그 D-Sub(옛 문서의 "PC")', 'RGB = analog D-Sub ("PC")')) + '</span>'
            // 🧬 [2026-11-25] 실제 EDID 파일에서 해상도를 읽어 채운다 (js/77 판독기, AI 0회)
            + '<div style="flex-basis:100%; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">'
            + '<button onclick="window.resEdidPick()" title="'
            + _esc(_t('펌웨어 EDID 파일(.ddc · .bin · .hex · .txt)을 읽어 그 포트의 지원 해상도를 체크합니다 — 창에 끌어다 놓아도 됩니다',
                      'Read an EDID file and check its modes for a port (drag & drop also works)')) + '"'
            + ' style="padding:4px 10px; border:1px solid #a3d9e0; border-radius:5px; font-size:11.5px; font-weight:bold;'
            + ' cursor:pointer; white-space:nowrap; background:#e0f5f7; color:#00707d;">🧬 ' + _esc(_t('EDID 불러오기', 'Load EDID')) + '</button>'
            + '<span id="respick-edid" style="color:#555;"></span></div>';

        document.getElementById('respick-foot').innerHTML =
            '<button onclick="window.resCustomAdd()" title="'
            + _esc(_t('표준 목록에 없는 고객 요구 해상도를 적습니다', 'Add a customer-specific resolution')) + '"'
            + ' style="padding:4px 10px; font-size:11.5px; cursor:pointer;'
            + ' border:1px solid #a3d9e0; background:#e0f5f7; color:#00707d; border-radius:5px; font-weight:bold;">＋ '
            + _esc(_t('CUSTOMER RESOLUTION 행 추가', 'Add customer row')) + '</button>'
            + '<a href="#" onclick="window.resClearAll();return false;" style="color:#b1432f;">'
            + _esc(_t('전부 해제', 'Clear all')) + '</a>'
            + '<span id="respick-count" style="margin-left:auto; font-weight:bold; color:#00707d;"></span>'
            + '<button onclick="window.resClosePicker()" style="padding:5px 14px; font-size:12px; cursor:pointer;'
            + ' border:1px solid #a3d9e0; background:#e0f5f7; color:#00707d; border-radius:5px; font-weight:bold;">'
            + _esc(_t('닫기', 'Close')) + '</button>';

        _paintRows(); _paintFoot(); _paintToggleBtn(); _paintEdidStatus();
    };

    var _paintRows = function () {
        var body = document.getElementById('respick-body');
        if (!body) return;
        var ports = window.RES_PORTS || [];
        var rows = _visibleRows();
        var h = '<table style="border-collapse:collapse; width:100%; font-size:11.5px;">'
              + '<thead><tr>'
              + '<th style="position:sticky; top:0; z-index:2; border:1px solid #cfe3e5; padding:5px; background:#eef6f7; width:44px;">NO</th>'
              + '<th style="position:sticky; top:0; z-index:2; border:1px solid #cfe3e5; padding:5px; background:#eef6f7; text-align:left;">RESOLUTION</th>'
              + ports.map(function (p) {
                  return '<th title="' + _esc(p.title || p.label) + '" style="position:sticky; top:0; z-index:2;'
                       + ' border:1px solid #cfe3e5; padding:5px; background:#eef6f7; width:62px;">' + _esc(p.label) + '</th>';
              }).join('')
              + '</tr></thead><tbody>';
        var customs = _customRows();
        if (!rows.length && !customs.length) {
            // 왜 비었는지 갈라서 말한다 — 접혀 있어 빈 것과 정말 없는 것은 다른 사실이다.
            h += '<tr><td colspan="' + (2 + ports.length) + '" style="padding:18px; text-align:center; color:#868e96;">'
               + _esc(_onlyChecked
                      ? _t('아직 고른 해상도가 없습니다 — 위 [🔽 전체 보기] 를 눌러 고르세요.', 'Nothing picked yet.')
                      : _t('찾는 해상도가 없습니다 — 아래 [＋ CUSTOMER RESOLUTION 행 추가] 로 적어 넣을 수 있습니다.', 'No match.')) + '</td></tr>';
        }
        var prevG = null, n = 0;
        rows.forEach(function (r) {
            if (r.g !== prevG) {
                h += '<tr><td colspan="' + (2 + ports.length) + '" style="border:1px solid #cfe3e5; padding:4px 6px;'
                   + ' background:#e0f5f7; color:#00707d; font-weight:bold;">' + _esc(r.g) + '</td></tr>';
                prevG = r.g;
            }
            n++;
            var on = !!_store()[r.key];
            h += '<tr style="background:' + (on ? '#f3fbfc' : '') + ';">'
               + '<td style="border:1px solid #cfe3e5; padding:3px 6px; text-align:center; color:#868e96;">' + n + '</td>'
               + '<td style="border:1px solid #cfe3e5; padding:3px 6px;' + (on ? ' font-weight:bold;' : '') + '">' + _esc(r.label) + '</td>'
               + ports.map(function (p) {
                   return '<td style="border:1px solid #cfe3e5; padding:3px; text-align:center;">'
                        + '<input type="checkbox" data-res="' + _esc(r.key) + '|' + _esc(p.key) + '"'
                        + ' data-res-label="' + _esc(r.label) + '"'
                        + (window.resPortOn(r.key, p.key) ? ' checked' : '') + '></td>';
               }).join('')
               + '</tr>';
        });

        // ── 🧑‍💼 CUSTOMER RESOLUTION — 사람이 적는 줄 ──────────────────
        //   ⚠️ 묶음 머리글과 [＋ 행 추가] 는 **늘 보여 준다** — 접혀 있든 검색 중이든
        //      "여기에 적으면 된다" 가 보여야 한다.
        h += '<tr><td colspan="' + (2 + ports.length) + '" style="border:1px solid #cfe3e5; padding:4px 6px;'
           + ' background:#e0f5f7; color:#00707d; font-weight:bold;">' + _esc(CUSTOM_G)
           + ' <span style="font-weight:normal; opacity:.75;">'
           + _esc(_t('— 표준 목록에 없는 고객 요구 해상도', '— customer-specific')) + '</span></td></tr>';
        customs.forEach(function (r) {
            n++;
            var on = !!(r.key && _store()[r.key]);
            h += '<tr style="background:' + (on ? '#f3fbfc' : '') + ';">'
               + '<td style="border:1px solid #cfe3e5; padding:3px 6px; text-align:center; color:#868e96;">' + n + '</td>'
               // ⚠️ 칸 + ✕ 는 **flex 한 줄**로 묶는다 — `calc(100% - 26px)` 로 폭을 재면 테두리·여백
               //    때문에 ✕ 가 다음 줄로 밀려 줄 높이가 26 → 41px 이 된다(실측).
               + '<td style="border:1px solid #cfe3e5; padding:2px 4px;">'
               + '<div style="display:flex; align-items:center; gap:6px;">'
               // ⚠️ 글자가 바뀔 때마다 다시 그리면 치던 칸에서 포커스가 날아간다 → `change`(칸을 떠날 때)
               + '<input type="text" data-res-custom="' + r.idx + '" value="' + _esc(r.label) + '"'
               + ' onchange="window.resCustomSet(' + r.idx + ', this.value)"'
               + ' onkeydown="if(event.key===\'Enter\'){this.blur();}"'
               + ' placeholder="' + _esc(_t('예: 1920×720@60', 'e.g. 1920×720@60')) + '"'
               + ' style="flex:1; min-width:0; padding:3px 6px; border:1px solid #cfe3e5; border-radius:4px;'
               + ' font-size:11.5px;' + (on ? ' font-weight:bold;' : '') + '">'
               + '<a href="#" onclick="window.resCustomDel(' + r.idx + ');return false;" title="'
               + _esc(_t('이 줄 빼기', 'remove')) + '" style="color:#b1432f; font-size:12px; flex-shrink:0;">✕</a>'
               + '</div></td>'
               + ports.map(function (p) {
                   // 이름을 안 적은 줄은 고를 수 없다 — 열쇠가 없으면 어디에 적을지 모른다
                   if (!r.key) return '<td style="border:1px solid #cfe3e5; padding:3px; text-align:center; color:#ccc;">·</td>';
                   return '<td style="border:1px solid #cfe3e5; padding:3px; text-align:center;">'
                        + '<input type="checkbox" data-res="' + _esc(r.key) + '|' + _esc(p.key) + '"'
                        + ' data-res-label="' + _esc(r.label) + '"'
                        + (window.resPortOn(r.key, p.key) ? ' checked' : '') + '></td>';
               }).join('')
               + '</tr>';
        });
        h += '<tr><td colspan="' + (2 + ports.length) + '" style="border:1px solid #cfe3e5; padding:5px 6px;">'
           + '<a href="#" onclick="window.resCustomAdd();return false;" style="color:var(--ui-accent, #00707d); font-weight:bold;">＋ '
           + _esc(_t('행 추가', 'Add row')) + '</a>'
           + (customs.length ? '' : ' <span style="color:#868e96;">'
              + _esc(_t('고객이 따로 요구하는 해상도를 여기에 적습니다.', 'Add customer resolutions here.')) + '</span>')
           + '</td></tr>';

        body.innerHTML = h + '</tbody></table>';
    };

    var _paintFoot = function () {
        var el = document.getElementById('respick-count');
        if (!el) return;
        var rows = window.resSelectedRows();
        el.textContent = _t('고른 해상도 ', 'Selected ') + rows.length + _t('개', '')
            + (rows.length ? '  (' + window.resSummary() + ')' : '');
    };
    // ══ 🧬 [2026-11-25] EDID 로 지원 해상도 채우기 ═══════════════════════════════
    //   흐름: 파일 고르기/끌어다 놓기 → js/77 `EDID.parse`(AI 0회) → **미리보기** → 사람이 [적용]
    //   ⚠️ 바로 덮어쓰지 않는다 — EDID 는 "광고하는 모드" 라 실제로 받는 모드보다 적을 수 있다.
    //      그래서 EDID 에 없는 체크는 **기본으로 그대로 둔다**(끄려면 사람이 상자를 켠다).
    //   ⚠️ 목록에 없는 모드는 CUSTOMER RESOLUTION 에 한 줄로 더한다 — 열쇠는 `resKeyOf` 한 곳이 정한다.
    //   💾 원본 바이트는 모델×포트로 보관한다(`tabData.resolutionEdidByUnit[모델][포트]`, 128~512바이트)
    //      — 펌웨어가 바뀌면 이전 EDID 와 무엇이 달라졌는지 보여 준다.

    // 파일 이름 낱말 → 포트 (데이터). 실측 이름: `P12_DP_1_LNW_S32_V1.1.ddc`
    window.RES_EDID_PORT_WORDS = window.RES_EDID_PORT_WORDS || {
        DP: 'DP', DISPLAYPORT: 'DP', EDP: 'DP', HDMI: 'HDMI', DVI: 'DVI',
        VGA: 'RGB', RGB: 'RGB', DSUB: 'RGB', ANALOG: 'RGB', PC: 'RGB'
    };
    var _edidPortFromName = function (name) {
        var words = String(name || '').toUpperCase().replace(/D-SUB/g, 'DSUB').split(/[^A-Z0-9]+/);
        var map = window.RES_EDID_PORT_WORDS || {};
        for (var i = 0; i < words.length; i++) if (map[words[i]]) return map[words[i]];
        return '';
    };

    var _edidStore = function (create) {
        var td = _td();
        if (!td.resolutionEdidByUnit) { if (!create) return {}; td.resolutionEdidByUnit = {}; }
        var u = window.resActiveUnit();
        if (!td.resolutionEdidByUnit[u]) { if (!create) return {}; td.resolutionEdidByUnit[u] = {}; }
        return td.resolutionEdidByUnit[u];
    };
    window.resEdidSaved = function () { return _edidStore(false); };

    var _paintEdidStatus = function () {
        var el = document.getElementById('respick-edid');
        if (!el) return;
        var st = _edidStore(false), ports = Object.keys(st);
        if (!ports.length) {
            el.innerHTML = '<span style="color:#868e96;">' + _esc(_t('이 모델에 불러온 EDID 없음 — 파일을 이 창에 끌어다 놓아도 됩니다.',
                'No EDID loaded for this model — you can drop a file here.')) + '</span>';
            return;
        }
        el.innerHTML = ports.map(function (p) {
            var r = st[p] || {};
            return '<span title="' + _esc((r.file || '') + ' · ' + (r.at || '')) + '" style="white-space:nowrap;">🧬 <b>' + _esc(p) + '</b> '
                 + _esc((r.name || r.vendor || '') + ' · ' + (r.checksum || '') + ' · ' + _t('모드 ', '') + ((r.modes || []).length)
                 + _t('개', ' modes')) + '</span>';
        }).join(' &nbsp; ');
    };

    window.resEdidPick = function () {
        var inp = document.createElement('input');
        inp.type = 'file';      // accept 비움 — 앱 규칙(무엇이든 받고, 못 읽으면 이유를 말한다)
        inp.onchange = function () { if (inp.files && inp.files[0]) window.resEdidLoadFile(inp.files[0]); };
        inp.click();
    };

    var _edidPending = null;   // { res, file, port, portSrc, offMissing }

    window.resEdidLoadFile = function (file) {
        if (!window.EDID) { _toast(_t('EDID 판독기(js/77)가 안 불렸습니다 — 새로고침해 주세요.', 'EDID parser missing'), 'error'); return; }
        if (file.size > 64 * 1024) {
            _toast(_t('EDID 파일로 보기엔 너무 큽니다(' + Math.round(file.size / 1024) + 'KB) — EDID 는 보통 128~512바이트, 16진 덤프여도 몇 KB 입니다.',
                      'Too large for an EDID file'), 'error');
            return;
        }
        var fr = new FileReader();
        fr.onload = function () { window.resEdidLoadBytes(new Uint8Array(fr.result), file.name); };
        fr.onerror = function () { _toast(_t('파일을 읽지 못했습니다.', 'Could not read the file.'), 'error'); };
        fr.readAsArrayBuffer(file);
    };

    /** 바이트(또는 16진 글자) → 미리보기. 하네스도 이 입구로 들어온다. */
    window.resEdidLoadBytes = function (data, fileName) {
        var res = window.EDID.parse(data);
        if (!res.ok) { _toast('🧬 ' + res.error, 'error'); return null; }
        var byName = _edidPortFromName(fileName);
        var port = byName || res.portGuess || '';
        _edidPending = {
            res: res, file: fileName || '', port: port, offMissing: false,
            portSrc: byName ? _t('파일 이름', 'file name') : (res.portGuess ? (res.iface ? _t('EDID 입력 종류', 'EDID interface') : _t('아날로그 입력', 'analog input')) : '')
        };
        _edidRender();
        return res;
    };

    window.resEdidSetPort = function (p) { if (_edidPending) { _edidPending.port = p; _edidRender(); } };
    window.resEdidSetOff = function (on) { if (_edidPending) { _edidPending.offMissing = !!on; } };
    window.resEdidSetWriteSum = function (on) { if (_edidPending) { _edidPending.writeSum = !!on; _edidPending.sumTouched = true; } };
    window.resEdidClose = function () {
        _edidPending = null;
        var ov = document.getElementById('resedid-overlay');
        if (ov) ov.style.display = 'none';
    };

    // EDID 모드 → { key, label(목록 이름), inList }
    var _edidRowOf = function (m) {
        var key = window.resKeyOf(m.label);
        var hit = window.resAllRows().filter(function (r) { return r.key === key; })[0];
        return { key: key, label: hit ? hit.label : m.label, inList: !!hit, g: hit ? hit.g : '' };
    };

    // ── 📝 [2026-11-25] Customer SPEC `EDID Check Sum` 칸 자동 채우기 (사용자: "그 칸도 자동으로 채워줘")
    //   값 = 이 모델에 불러 둔 포트마다 `포트 0x체크섬`(확장 블록이 있으면 `/0x..` 로 블록 순서대로), RES_PORTS 순서, ' · ' 로 잇는다.
    //   ⚠️ 사람이 적은 값은 함부로 덮지 않는다 — 칸이 비었거나 **지난번에 앱이 적은 그대로**일 때만 자동으로 쓰고,
    //      사람이 다른 값을 적어 뒀으면 미리보기에 둘을 나란히 보여 주고 [덮어쓰기] 를 사람이 켤 때만 쓴다.
    //   ⚠️ Customer SPEC 은 저장할 때 **화면 표를 다시 읽는다**(js/22g collectTabData) — 그래서 데이터와 화면 칸을 **둘 다** 고친다.
    //   항목 이름은 데이터(js/43 BS_EXTRA_ITEMS 가 만드는 그 항목) — 없으면 `_bsEnsureExtraItems` 로 제자리에 만든다.
    window.RES_EDID_SPEC_ITEM = window.RES_EDID_SPEC_ITEM || ['EDID Check Sum', 'EDID CHECK SUM', 'EDID Checksum'];
    var _specNorm = function (s) { return String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase(); };
    var _isSumType = function (t) {
        var n = _specNorm(t);
        return !!n && (window.RES_EDID_SPEC_ITEM || []).some(function (x) { return _specNorm(x) === n; });
    };
    var _specSumDomTr = function () {
        var tb = document.getElementById('briefspec-body');
        if (!tb) return null;
        var trs = tb.querySelectorAll('tr');
        for (var i = 0; i < trs.length; i++) {
            var ti = trs[i].querySelector('input[data-field="type"]');
            if (ti && _isSumType(ti.value)) return trs[i];
        }
        return null;
    };
    var _specSumDataRow = function () {
        return (_td().briefSpec || []).filter(function (r) { return r && _isSumType(r.type); })[0] || null;
    };
    /** 지금 칸 값 — 화면 표가 있으면 화면이 진실(저장이 화면을 읽는다), 없으면 데이터. 항목 자체가 없으면 null */
    window.resEdidSpecSumCurrent = function () {
        var tb = document.getElementById('briefspec-body');
        if (tb && tb.querySelector('input[data-field="type"]')) {
            var tr = _specSumDomTr();
            if (tr) { var inp = tr.querySelector('input[data-field="modelA"]'); return inp ? String(inp.value || '').trim() : ''; }
            return null;
        }
        var row = _specSumDataRow();
        return row ? String(row.modelA != null ? row.modelA : (row.desc || '')).trim() : null;
    };
    var _sumOfHex = function (hex) {
        var r = window.EDID ? window.EDID.parse(hex) : null;
        return (r && r.ok) ? r.checksums.map(function (c) { return c.value; }).join('/') : '';
    };
    /** 칸에 쓸 글 — 저장된 포트들 + (있으면) 지금 적용하려는 포트를 그 EDID 로 바꿔 넣은 결과 */
    window.resEdidSpecSumText = function (pendingPort, pendingRes) {
        var st = _edidStore(false), parts = [];
        var order = (window.RES_PORTS || []).map(function (p) { return p.key; });
        Object.keys(st).concat(pendingPort ? [pendingPort] : []).forEach(function (p) { if (order.indexOf(p) < 0) order.push(p); });
        order.forEach(function (p) {
            var sum = (p === pendingPort && pendingRes) ? pendingRes.checksums.map(function (c) { return c.value; }).join('/')
                    : (st[p] && st[p].hex ? _sumOfHex(st[p].hex) : '');
            if (sum) parts.push(p + ' ' + sum);
        });
        return parts.join(' · ');
    };
    var _lastSumStore = function () { var td = _td(); td.resolutionEdidSpecSum = td.resolutionEdidSpecSum || {}; return td.resolutionEdidSpecSum; };
    /** 자동으로 써도 되나 — 비었거나·항목이 없거나·지난번 앱이 쓴 값 그대로거나·이미 같은 값 */
    var _specSumAuto = function (cur, next) {
        var last = _lastSumStore()[window.resActiveUnit()] || '';
        return cur === null || cur === '' || (last && cur === last) || _specNorm(cur) === _specNorm(next);
    };
    /** 칸에 쓴다 → { ok, added } (데이터 + 화면 칸 둘 다) */
    window.resEdidWriteSpecSum = function (text) {
        var tb = document.getElementById('briefspec-body');
        var hasDom = !!(tb && tb.querySelector('input[data-field="type"]'));
        // 화면에서 사람이 고친 칸이 사라지지 않게 화면 → 데이터를 먼저 담는다 — 아래에서 다시 그릴(populateTabData) 수 있어
        //   Customer SPEC 만이 아니라 **모든 탭**을(자동저장이 쓰는 그 함수, js/43 이 감싸 제품구분자 칸에도 담는다)
        if (hasDom) {
            try { if (window.collectTabData) window.collectTabData(); else if (window.bsCommitCurrent) window.bsCommitCurrent(); }
            catch (e) { console.warn('[res edid spec collect]', e); }
        }
        var td = _td();
        if (!Array.isArray(td.briefSpec)) td.briefSpec = [];
        var row = _specSumDataRow(), added = false;
        if (!row && window._bsEnsureExtraItems) { try { window._bsEnsureExtraItems(); } catch (e) { /* 아래에서 직접 */ } row = _specSumDataRow(); added = !!row; }
        if (!row) { row = { type: (window.RES_EDID_SPEC_ITEM || ['EDID Check Sum'])[0], sub: '', modelA: '', note: '' }; td.briefSpec.push(row); added = true; }
        row.modelA = text;
        if (window.bsSyncAlias) { try { window.bsSyncAlias(); } catch (e) { /* 별칭 실패가 흐름을 막지 않게 */ } }
        var tr = hasDom && !added ? _specSumDomTr() : null;
        if (tr) {
            var inp = tr.querySelector('input[data-field="modelA"]');
            if (inp) inp.value = text;
            tr.style.display = '';                // 값이 없어 숨겨져 있던 줄을 드러낸다
        } else if (tb) {
            // 화면에 그 줄이 없다(새로 만든 항목·빈 표) → 데이터대로 다시 그린다(제품구분자 전환이 쓰는 그 함수)
            if (window.populateTabData) { try { window.populateTabData(); } catch (e) { console.warn('[res edid spec]', e); } }
        }
        _lastSumStore()[window.resActiveUnit()] = text;
        _markDirty();
        return { ok: true, added: added };
    };

    var _edidRender = function () {
        var P = _edidPending;
        if (!P) return;
        var ov = document.getElementById('resedid-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'resedid-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9510; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="resedid-box" style="pointer-events:all; position:fixed; left:50%; top:9%;'
                + ' transform:translateX(-50%); width:min(820px,95vw); max-height:82vh; display:flex; flex-direction:column;'
                + ' background:#fff; border:1px solid #a3d9e0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden;">'
                + '<div id="resedid-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between;'
                + ' padding:9px 12px; background:#e0f5f7; border-bottom:1px solid #a3d9e0; color:#00707d; font-weight:bold; font-size:13px; cursor:grab;">'
                + '<span id="resedid-title"></span><button onclick="window.resEdidClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                + '<div id="resedid-body" style="flex:1; min-height:0; overflow-y:auto; padding:10px 12px; font-size:12px;"></div>'
                + '<div id="resedid-foot" style="flex-shrink:0; padding:8px 12px; border-top:1px solid #cfe3e5; background:#eef6f7;'
                + ' display:flex; align-items:center; gap:10px; font-size:12px;"></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('resedid-box', 'resedid-head'); } catch (e) { /* 〃 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('resedid-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        if (window.bringModalToFront) { try { window.bringModalToFront('resedid-overlay'); } catch (e) { /* 〃 */ } }

        var r = P.res, unit = window.resActiveUnit();
        document.getElementById('resedid-title').textContent = '🧬 ' + _t('EDID 로 지원 해상도 채우기', 'Fill resolutions from EDID')
            + (unit && unit !== '_' ? ' — ' + unit : '');

        var cell = 'border:1px solid #cfe3e5; padding:4px 6px;';
        var th = cell + ' background:#eef6f7; text-align:left;';
        var h = '';
        // ── 머리 정보
        h += '<table style="border-collapse:collapse; width:100%; margin-bottom:8px;">'
           + '<tr><td style="' + th + ' width:110px;">' + _esc(_t('파일', 'File')) + '</td><td style="' + cell + '">' + _esc(P.file || '—') + '</td></tr>'
           + '<tr><td style="' + th + '">' + _esc(_t('모니터', 'Monitor')) + '</td><td style="' + cell + '">'
           + _esc((r.name || '—') + '  ·  ' + r.vendor + ' ' + r.product + '  ·  EDID ' + r.version + '  ·  ' + r.year + _t('년 ', ' wk') + r.week + _t('주', '')
                  + '  ·  ' + r.sizeCm[0] + '×' + r.sizeCm[1] + ' cm  ·  ' + (r.digital ? _t('디지털', 'digital') : _t('아날로그', 'analog'))
                  + (r.blocks > 1 ? '  ·  ' + _t('확장 ', 'ext ') + (r.blocks - 1) : '')) + '</td></tr>'
           + '<tr><td style="' + th + '">' + _esc(_t('체크섬', 'Checksum')) + '</td><td style="' + cell + '">'
           + r.checksums.map(function (c) {
                 return (r.blocks > 1 ? _esc(_t('블록 ', 'block ') + c.block + ' ') : '') + '<b>' + _esc(c.value) + '</b>'
                      + (c.valid ? ' <span style="color:#2b8a3e;">✓</span>' : ' <span style="color:#c92a2a;">✗ ' + _esc(_t('맞지 않음', 'invalid')) + '</span>');
             }).join(' · ');
        h += '</td></tr>';
        // ── 📝 Customer SPEC EDID Check Sum 칸 — 포트를 골라야 무엇을 쓸지 정해진다
        if (P.port) {
            var curSum = window.resEdidSpecSumCurrent(), nextSum = window.resEdidSpecSumText(P.port, r);
            var autoOk = _specSumAuto(curSum, nextSum);
            if (!P.sumTouched) P.writeSum = autoOk;
            var sameSum = curSum !== null && _specNorm(curSum) === _specNorm(nextSum);
            h += '<tr><td style="' + th + '">Customer SPEC</td><td style="' + cell + '">'
               + 'EDID Check Sum: ' + (curSum === null ? '<span style="color:#868e96;">' + _esc(_t('(항목 없음 — 만들어서 적습니다)', '(no row — will add)')) + '</span>'
                                       : '<b>' + _esc(curSum || _t('(비어 있음)', '(empty)')) + '</b>')
               + (sameSum ? ' <span style="color:#2b8a3e;">✓ ' + _esc(_t('같음', 'same')) + '</span>'
                  : ' → <b style="color:#2b8a3e;">' + _esc(nextSum) + '</b>'
                    + (autoOk ? ' <span style="color:#868e96;">(' + _esc(_t('적용하면 자동으로 적습니다', 'written on apply')) + ')</span>'
                       : '<div style="margin-top:4px; color:#c92a2a;">' + _esc(_t('사람이 적은 값과 다릅니다 — 문서 값이라 기본으로 그대로 둡니다.', 'A person wrote a different value — kept by default.'))
                         + ' <label style="cursor:pointer; color:#333;"><input type="checkbox" id="resedid-sum"' + (P.writeSum ? ' checked' : '')
                         + ' onchange="window.resEdidSetWriteSum(this.checked)"> ' + _esc(_t('EDID 값으로 덮어쓰기', 'Overwrite with EDID')) + '</label></div>'))
               + '</td></tr>';
            P.sumNext = sameSum ? '' : nextSum;
        }
        // ── 포트
        var ports = window.RES_PORTS || [];
        h += '<tr><td style="' + th + '">' + _esc(_t('입력 포트', 'Port')) + '</td><td style="' + cell + '">'
           + ports.map(function (p) {
                 return '<label style="margin-right:12px; cursor:pointer; white-space:nowrap;"><input type="radio" name="resedid-port"'
                      + ' data-port="' + _esc(p.key) + '"' + (P.port === p.key ? ' checked' : '')
                      + ' onchange="window.resEdidSetPort(this.getAttribute(\'data-port\'))"> <b>' + _esc(p.label) + '</b></label>';
             }).join('')
           + (P.port ? (P.portSrc ? '<span style="color:#868e96;">(' + _esc(P.portSrc + _t('에서 추정 — 맞는지 확인하세요', ' — please confirm')) + ')</span>' : '')
                     : '<span style="color:#c92a2a; font-weight:bold;">' + _esc(_t('← 어느 입력의 EDID 인지 골라 주세요', '← choose the port')) + '</span>')
           + '</td></tr></table>';

        // ── 이전 EDID 와 비교 (같은 모델·포트)
        var prev = P.port ? _edidStore(false)[P.port] : null;
        if (prev && prev.hex) {
            var pr = window.EDID.parse(prev.hex);
            if (pr.ok) {
                var nowL = r.modes.map(function (m) { return window.resKeyOf(m.label); });
                var prevL = pr.modes.map(function (m) { return window.resKeyOf(m.label); });
                var added = r.modes.filter(function (m, i) { return prevL.indexOf(nowL[i]) < 0; }).map(function (m) { return m.label; });
                var gone = pr.modes.filter(function (m, i) { return nowL.indexOf(prevL[i]) < 0; }).map(function (m) { return m.label; });
                h += '<div style="margin:0 0 8px; padding:6px 8px; border:1px solid #ffd8a8; background:#fff9db; border-radius:6px;">'
                   + _esc(_t('이전 EDID(', 'Previous EDID (') + (prev.file || '') + ', ' + (prev.checksum || '') + ', ' + String(prev.at || '').slice(0, 10) + ') ')
                   + (prev.checksum === r.checksum && !added.length && !gone.length
                        ? _esc(_t('와 같습니다.', ': identical.'))
                        : _esc(_t('와 다릅니다 — ', ': differs — '))
                          + (added.length ? '➕ ' + _esc(added.join(', ')) + ' ' : '')
                          + (gone.length ? '➖ ' + _esc(gone.join(', ')) : '')
                          + (!added.length && !gone.length ? _esc(_t('모드는 같고 다른 바이트가 바뀌었습니다.', 'same modes, other bytes changed.')) : ''))
                   + '</div>';
            }
        }

        // ── EDID 모드 표
        h += '<div style="font-weight:bold; color:#00707d; margin:4px 0;">' + _esc(_t('EDID 가 광고하는 모드 ', 'Modes in EDID ') + r.modes.length + _t('개', '')) + '</div>'
           + '<table style="border-collapse:collapse; width:100%;"><thead><tr>'
           + '<th style="' + th + '">' + _esc(_t('해상도', 'Mode')) + '</th>'
           + '<th style="' + th + '">' + _esc(_t('출처', 'Source')) + '</th>'
           + '<th style="' + th + '">' + _esc(_t('타이밍', 'Timing')) + '</th>'
           + '<th style="' + th + '">' + _esc(_t('목록', 'List')) + '</th>'
           + '<th style="' + th + '">' + _esc(P.port || _t('포트', 'Port')) + '</th></tr></thead><tbody>';
        var nNew = 0, nAdd = 0;
        r.modes.forEach(function (m) {
            var row = _edidRowOf(m);
            var on = P.port && window.resPortOn(row.key, P.port);
            if (!row.inList) nAdd++;
            if (P.port && !on) nNew++;
            var t = m.timing;
            h += '<tr' + (m.native ? ' style="background:#f3fbfc;"' : '') + '>'
               + '<td style="' + cell + '"><b>' + _esc(m.label) + '</b>' + (m.native ? ' <span style="color:#00707d;">★ ' + _esc(_t('기본', 'native')) + '</span>' : '') + '</td>'
               + '<td style="' + cell + ' color:#555;">' + _esc(m.srcs.join(', ')) + '</td>'
               + '<td style="' + cell + ' color:#555; font-size:11px;">' + (t ? _esc(t.pclkMHz.toFixed(2) + ' MHz · ' + t.khz.toFixed(2) + ' kHz · '
                     + t.hTotal + '×' + t.vTotal + (t.hPol ? ' · ' + t.hPol + 'H' + t.vPol + 'V' : '')) : '—') + '</td>'
               + '<td style="' + cell + '">' + (row.inList ? _esc(row.label) : '<span style="color:#e8590c;">➕ ' + _esc(_t('CUSTOMER 에 추가', 'add to CUSTOMER')) + '</span>') + '</td>'
               + '<td style="' + cell + ' text-align:center;">' + (!P.port ? '·' : on ? '<span style="color:#868e96;">' + _esc(_t('이미 체크', 'already')) + '</span>'
                     : '<b style="color:#2b8a3e;">' + _esc(_t('켬', 'on')) + '</b>') + '</td></tr>';
        });
        h += '</tbody></table>';

        // ── 체크돼 있지만 EDID 에 없는 것
        if (P.port) {
            var edidKeys = r.modes.map(function (m) { return window.resKeyOf(m.label); });
            var missing = window.resSelectedRows().filter(function (s) { return s.ports[P.port] && edidKeys.indexOf(s.key) < 0; });
            if (missing.length) {
                h += '<div style="margin-top:10px; padding:6px 8px; border:1px solid #cfe3e5; border-radius:6px;">'
                   + '<b>' + _esc(_t('체크돼 있지만 EDID 에 없는 ' + P.port + ' 해상도 ', 'Checked for ' + P.port + ' but not in EDID: ') + missing.length + _t('개', '')) + '</b> — '
                   + _esc(missing.map(function (x) { return x.label; }).join(', '))
                   + '<div style="margin-top:4px; color:#555;">' + _esc(_t('스케일러는 EDID 에 없는 입력도 받는 경우가 많아 기본으로 그대로 둡니다.',
                        'Scalers often accept modes not in EDID, so they are kept by default.')) + '</div>'
                   + '<label style="cursor:pointer;"><input type="checkbox" id="resedid-off"' + (P.offMissing ? ' checked' : '')
                   + ' onchange="window.resEdidSetOff(this.checked)"> ' + _esc(_t('이 ' + missing.length + '개의 ' + P.port + ' 체크를 끄기', 'Uncheck them')) + '</label></div>';
            }
        }
        if (r.warn.length || r.notes.length) {
            h += '<div style="margin-top:10px; color:#c92a2a;">' + r.warn.map(function (w) { return '⚠️ ' + _esc(w); }).join('<br>') + '</div>'
               + '<div style="margin-top:4px; color:#868e96;">' + r.notes.map(function (w) { return 'ℹ️ ' + _esc(w); }).join('<br>') + '</div>';
        }
        document.getElementById('resedid-body').innerHTML = h;

        document.getElementById('resedid-foot').innerHTML =
            '<span style="color:#555;">' + _esc(P.port
                ? _t(P.port + ' 에 ' + nNew + '개를 새로 켜고, 목록에 없는 ' + nAdd + '개는 CUSTOMER RESOLUTION 에 더합니다.',
                     'Turn on ' + nNew + ', add ' + nAdd + ' to CUSTOMER.')
                : _t('포트를 고르면 적용할 수 있습니다.', 'Choose a port to apply.')) + '</span>'
            + '<button onclick="window.resEdidClose()" style="margin-left:auto; padding:5px 14px; font-size:12px; cursor:pointer;'
            + ' border:1px solid #ced4da; background:#fff; color:#495057; border-radius:5px;">' + _esc(_t('취소', 'Cancel')) + '</button>'
            + '<button id="resedid-apply" onclick="window.resEdidApply()"' + (P.port ? '' : ' disabled')
            + ' style="padding:5px 14px; font-size:12px; cursor:pointer; border:1px solid #00707d; background:#00707d; color:#fff;'
            + ' border-radius:5px; font-weight:bold;">' + _esc(_t('적용', 'Apply')) + '</button>';
    };

    window.resEdidApply = function () {
        var P = _edidPending;
        if (!P || !P.port) return false;
        var r = P.res, port = P.port;
        var custom = window.resCustomList();
        var nOn = 0, nAdd = 0, nOff = 0;
        r.modes.forEach(function (m) {
            var row = _edidRowOf(m);
            if (!row.inList) {
                // 목록에 없으면 CUSTOMER 에 한 줄 — 열쇠가 같은 줄이 이미 있으면 더하지 않는다
                var has = custom.some(function (c) { return c && window.resKeyOf(c) === row.key; });
                if (!has) { custom.push(m.label); nAdd++; }
            }
            if (!window.resPortOn(row.key, port)) { window.resSetPort(row.key, row.label, port, true); nOn++; }
        });
        if (P.offMissing) {
            var edidKeys = r.modes.map(function (m) { return window.resKeyOf(m.label); });
            window.resSelectedRows().forEach(function (s) {
                if (s.ports[port] && edidKeys.indexOf(s.key) < 0) { window.resSetPort(s.key, s.label, port, false); nOff++; }
            });
        }
        _edidStore(true)[port] = {
            file: P.file, checksum: r.checksum, name: r.name || '', vendor: r.vendor, product: r.product, version: r.version,
            hex: window.EDID.hex(r.bytes), at: new Date().toISOString(),
            modes: r.modes.map(function (m) { return m.label; }), native: r.native ? r.native.label : ''
        };
        // 📝 Customer SPEC EDID Check Sum 칸 — 미리보기가 정한 대로(자동 또는 사람이 덮어쓰기를 켠 경우만)
        var sumWritten = '';
        if (P.writeSum && P.sumNext) {
            try { window.resEdidWriteSpecSum(P.sumNext); sumWritten = P.sumNext; } catch (eS) { console.warn('[res edid spec]', eS); }
        }
        _markDirty();
        window.resEdidClose();
        var ov = document.getElementById('respick-overlay');
        if (ov && ov.style.display !== 'none') { _paintRows(); _paintFoot(); _paintEdidStatus(); }
        _toast('🧬 ' + port + ' — ' + _t('EDID 적용: ' + nOn + '개 켬' + (nAdd ? ', CUSTOMER ' + nAdd + '줄 추가' : '') + (nOff ? ', ' + nOff + '개 끔' : ''),
                                          'EDID applied: ' + nOn + ' on' + (nAdd ? ', ' + nAdd + ' added' : '') + (nOff ? ', ' + nOff + ' off' : ''))
               + (sumWritten ? _t(' · Customer SPEC EDID Check Sum = ', ' · Customer SPEC checksum = ') + sumWritten : ''), 'success');
        return { on: nOn, added: nAdd, off: nOff, sum: sumWritten };
    };
})();
