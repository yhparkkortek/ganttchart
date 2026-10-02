/* ════════════════════════════════════════════════════════════════════
   🧺 자재 보관함 (Material Cart) — 2026-10-02, 사용자 요청
   설계 기록: docs/sap-lookup.md "자재청구/자재입고 청구서" 절

   목적: 자재를 **여러 번 검색해 가며 담아 두었다가**, 모아서 한 번에
   MB21 예약(계정대체 청구서)을 만든다. 최종 산출물은 ZMM019 PDF.

   ⚠️ 이름 주의 — Phase 1의 "업무 보관함"(js/14c-task-inbox.js)과 **다른 물건**이다.
      그쪽은 메일→업무 스테이징, 이쪽은 SAP 자재 청구용 장바구니.

   담는 곳: 자재 선택 칩 팝업(js/04g `_sapSelectMaterial`)의 "🧺 담기".
   꺼내는 곳: 화면 우하단 칩 — 담긴 게 있을 때만 "📤 자재청구(951)/📥 자재입고(907)"가 뜬다.

   데이터는 전부 js/32: SAP_MOVEMENT_TYPES(이동유형 84종) · SAP_STORAGE_LOCATIONS ·
   SAP_RESERVATION_PURPOSES(목적) · SAP_COST_CENTERS · SAP_PLANT_FIXED · SAP_RESERVATION_MAX_ITEMS.
   저장: localStorage(기기 로컬). STORAGE_REGISTRY(js/34)에 등록되어 🧹 정리 대상.
   ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var API = 'http://127.0.0.1:5000';
    var ITEMS_KEY = 'gantt_matcart_items_v1';
    // 💡 사유 예시 — placeholder로 보이고, 빈 칸에서 → 를 누르면 그대로 채워진다(사용자 요청 형식).
    var REASON_EXAMPLE = 'PS00/RD00/LNW>STELLAR32>PROTO B 샘플 (US)';
    var HDR_KEY   = 'gantt_matcart_hdr_v1';

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function plant() { return window.SAP_PLANT_FIXED || '1000'; }

    // 🔍 [2026-10-02] 프로젝트 코드 조회 결과는 **다시 조회하기 전까지 그대로 둔다**.
    //    예전엔 코드를 고르면 _mcHdrChange→render가 돌면서 목록이 사라져, 다른 코드를
    //    보려면 매번 돋보기를 다시 눌러야 했다(사용자 지적). 그래서 render 바깥에 보관한다.
    var orderResultsHtml = '';

    // 💡 [2026-10-02] 사유(텍스트) 입력 도우미 — 빈 칸에서 → (오른쪽 방향키)를 누르면
    //    예시(placeholder)가 그대로 채워진다. 셸 자동완성과 같은 감각.
    window._mcHintKey = function (ev, el) {
        if (!ev || ev.key !== 'ArrowRight' || !el) return;
        if (String(el.value || '').length) return;              // 이미 쓴 글자가 있으면 커서 이동 그대로
        ev.preventDefault();
        el.value = el.placeholder || '';
        if (el.onchange) el.onchange();
    };

    // ── 저장소 ────────────────────────────────────────────────────────
    function load(key, dflt) {
        try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? dflt : v; }
        catch (e) { return dflt; }
    }
    function save(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); return true; }
        catch (e) {
            console.warn('[자재 보관함] 저장 실패:', e && e.message);
            if (window.showToast) window.showToast(T('자재 보관함 저장 실패 — 저장 공간을 확인해주세요(🧹).', 'Cart save failed — check storage (🧹).'), 'error');
            return false;
        }
    }
    function items() { var a = load(ITEMS_KEY, []); return Array.isArray(a) ? a : []; }
    function setItems(a) { save(ITEMS_KEY, a); refreshChip(); }

    function hdr() {
        var h = load(HDR_KEY, {}) || {};
        if (!h.bwart) h.bwart = '951';
        // 자재 수령인은 접속자 이름으로 자동 — 사람이 고쳤으면(h.wempfEdited) 건드리지 않는다
        if (!h.wempfEdited) h.wempf = window.currentUserName || h.wempf || '';
        return h;
    }
    function setHdr(h) { save(HDR_KEY, h); }

    /** 이동유형의 기본 저장위치 — 코드가 아니라 js/32 카탈로그(데이터)에서 읽는다. */
    window._mcDefaultLgort = function (bwart) {
        var list = window.SAP_MB21_MOVEMENT_TYPES || [];
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].bwart) === String(bwart)) return list[i].defaultLgort || '';
        }
        return '';
    };
    function mvLabel(code) {
        var list = window.SAP_MOVEMENT_TYPES || [];
        for (var i = 0; i < list.length; i++) if (list[i].code === String(code)) return list[i].label;
        return String(code);
    }

    // ── 공개 API ──────────────────────────────────────────────────────
    window._mcAdd = function (matnr, maktx, opts) {
        matnr = String(matnr || '').trim();
        if (!matnr) return false;
        opts = opts || {};
        var qty = Number(opts.qty);
        if (!isFinite(qty) || qty <= 0) qty = 1;
        var list = items(), hit = null;
        for (var i = 0; i < list.length; i++) { if (list[i].matnr === matnr) { hit = list[i]; break; } }
        if (hit) {
            hit.qty = Number(hit.qty || 0) + qty;
            if (maktx && !hit.maktx) hit.maktx = String(maktx);
        } else {
            list.push({ matnr: matnr, maktx: String(maktx || ''), qty: qty,
                        unit: String(opts.unit || 'EA'), sgtxt: '', addedAt: Date.now() });
        }
        setItems(list);
        if (window.showToast) {
            window.showToast('🧺 ' + T('자재 보관함에 담았습니다: ', 'Added to cart: ') + matnr
                + ' (' + T('총 ', 'total ') + list.length + T('건)', ' items)'), 'success');
        }
        var m = document.getElementById('matcart-modal');
        if (m && m.style.display !== 'none') render();
        return true;
    };
    window._mcRemove = function (matnr) {
        setItems(items().filter(function (x) { return x.matnr !== String(matnr); }));
        render();
    };
    window._mcSetField = function (matnr, field, value) {
        var list = items();
        for (var i = 0; i < list.length; i++) {
            if (list[i].matnr === String(matnr)) {
                if (field === 'qty') {
                    var n = Number(value);
                    list[i].qty = (isFinite(n) && n > 0) ? n : 1;
                } else { list[i][field] = String(value || ''); }
                break;
            }
        }
        setItems(list);
    };
    window._mcClear = function () {
        if (!items().length) return;
        if (!confirm(T('자재 보관함을 비울까요? 담아둔 항목이 모두 사라집니다.', 'Empty the cart? All staged items will be removed.'))) return;
        setItems([]); render();
    };
    window._mcCount = function () { return items().length; };
    window._mcList  = function () { return items(); };

    // ── 우하단 칩 — 담긴 게 있을 때만 "자재청구/자재입고"가 활성화된다 ──
    function refreshChip() {
        var n = items().length;
        var bar = document.getElementById('matcart-chipbar');
        if (!n) { if (bar) bar.style.display = 'none'; return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'matcart-chipbar';
            bar.style.cssText = 'position:fixed; right:18px; bottom:76px; z-index:9000; display:flex; gap:6px;';
            document.body.appendChild(bar);
        }
        bar.style.display = 'flex';
        function chip(label, bg, bd, fg, onclick) {
            return '<button onclick="' + onclick + '" style="padding:7px 13px; background:' + bg
                + '; border:1px solid ' + bd + '; border-radius:20px; cursor:pointer; font-size:12.5px;'
                + ' font-weight:bold; color:' + fg + '; box-shadow:0 2px 8px rgba(0,0,0,.18);"'
                + ' onmouseover="this.style.filter=\'brightness(.96)\'" onmouseout="this.style.filter=\'\'">'
                + label + '</button>';
        }
        bar.innerHTML =
            chip('🧺 ' + T('자재 보관함 ', 'Cart ') + n + T('건', ''), '#fff3e0', '#e8b974', '#8a5a12', 'window._mcOpen()')
            + chip('📤 ' + T('자재청구', 'Goods issue'), '#e7f3ff', '#a5c8f0', '#1971c2', "window._mcOpenWith('951')")
            + chip('📥 ' + T('자재입고', 'Goods receipt'), '#e6f6ea', '#a8dab8', '#1f7a3d', "window._mcOpenWith('907')");
    }
    window._mcRefreshChip = refreshChip;

    /** 자재청구(951)/자재입고(907) 칩 — 이동유형을 정해서 보관함을 연다. */
    window._mcOpenWith = function (bwart) {
        var h = hdr();
        h.bwart = String(bwart);
        h.lgort = window._mcDefaultLgort(h.bwart);   // 유형이 바뀌면 기본창고도 따라간다
        setHdr(h);
        window._mcOpen();
    };

    // ── 모달 (docs/ui-conventions.md 패턴: 투명 래퍼 + 내부 박스) ──────
    window._mcOpen = function () {
        var wrap = document.getElementById('matcart-modal');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'matcart-modal';
            wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
            wrap.innerHTML =
                '<div id="matcart-box" style="pointer-events:all; position:fixed; left:50%; top:52%;'
                + ' transform:translate(-50%,-50%); width:min(820px,94vw); height:min(640px,86vh);'
                + ' background:#fff; box-shadow:0 8px 30px rgba(0,0,0,.3); resize:both; overflow:hidden;'
                + ' border-radius:10px; min-width:460px; min-height:420px; display:flex; flex-direction:column;">'
                // 헤더 — AI/SAP 계열이라 하늘색(ui-conventions.md)
                + '<div id="matcart-drag" style="padding:10px 14px; background:#e7f3ff;'
                + ' border-bottom:1px solid #a5c8f0; color:#1971c2; cursor:move; display:flex;'
                + ' align-items:center; gap:8px; flex:0 0 auto;">'
                + '<b style="font-size:14px;">🧺 ' + T('자재 보관함', 'Material Cart') + '</b>'
                + '<span id="matcart-count" style="font-size:12px; opacity:.8;"></span>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="document.getElementById(\'matcart-modal\').style.display=\'none\'"'
                + ' onmouseover="this.style.filter=\'brightness(.93)\'" onmouseout="this.style.filter=\'\'"'
                + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer;'
                + ' width:28px; height:28px;">✕</button>'
                + '</div>'
                + '<div id="matcart-body" style="overflow:auto; flex:1 1 auto; padding:13px 15px;"></div>'
                + '<div id="matcart-status" style="display:none; padding:8px 15px; border-top:1px solid #eee;'
                + ' font-size:12px; background:#f7f9fc; flex:0 0 auto; max-height:150px; overflow:auto;"></div>'
                + '<div style="padding:9px 15px; border-top:1px solid #eee; display:flex; gap:8px; flex:0 0 auto;">'
                + '<button onclick="window._mcClear()" onmouseover="this.style.filter=\'brightness(.95)\'" onmouseout="this.style.filter=\'\'"'
                + ' style="padding:8px 14px; background:#fdecea; color:#a3281c; border:1px solid #f0b4ad;'
                + ' border-radius:6px; font-size:12px; cursor:pointer;">🗑 ' + T('비우기', 'Empty') + '</button>'
                + '<span style="flex:1;"></span>'
                + '<button id="matcart-submit" onclick="window._mcSubmit()" onmouseover="this.style.filter=\'brightness(.95)\'" onmouseout="this.style.filter=\'\'"'
                + ' style="padding:8px 18px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0;'
                + ' border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">📄 '
                + T('청구서 만들기', 'Create reservation') + '</button>'
                + '</div></div>';
            document.body.appendChild(wrap);
            if (window._makeDraggable) window._makeDraggable('matcart-box', 'matcart-drag');
            if (window._bindClickToFront) window._bindClickToFront('matcart-modal');
        }
        render();
        wrap.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('matcart-modal');
    };

    /** 보관함 모달 안 상태줄 — 채팅창이 닫혀 있어도 진행/결과가 보이게 한다.
     *  (예전엔 결과와 🖨 버튼을 채팅 히스토리에만 넣어서, 보관함에서 작업하던 사람은
     *   "MB21까지 하고 멈춘 것"처럼 보였다 — 2026-10-02 제보) */
    function status(html, keep) {
        var el = document.getElementById('matcart-status');
        if (!el) return;
        el.style.display = html ? 'block' : 'none';
        el.innerHTML = keep ? (el.innerHTML + html) : html;
        el.scrollTop = el.scrollHeight;
    }
    window._mcStatus = status;

    function optsOf(rows, sel, codeKey, labelKey) {
        return (rows || []).map(function (r) {
            var code = r[codeKey || 'code'];
            var lab = window._currentLang === 'en' ? (r[(labelKey || 'label') + 'En'] || r[labelKey || 'label']) : r[labelKey || 'label'];
            return '<option value="' + esc(code) + '"' + (String(sel) === String(code) ? ' selected' : '') + '>'
                + esc(code + ' — ' + lab) + '</option>';
        }).join('');
    }
    /** YYYYMMDD ↔ YYYY-MM-DD (달력 input은 하이픈 형식만 받는다) */
    function toDateInput(v) {
        v = String(v || '').replace(/\D/g, '');
        return v.length === 8 ? v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8) : '';
    }
    function fromDateInput(v) { return String(v || '').replace(/\D/g, ''); }

    function render() {
        var body = document.getElementById('matcart-body');
        if (!body) return;
        var list = items(), h = hdr();
        var MAX = (window.SAP_RESERVATION_MAX_ITEMS || 43);
        var cnt = document.getElementById('matcart-count');
        if (cnt) {
            cnt.textContent = list.length + T('건', ' items')
                + (list.length > MAX ? '  ·  ' + T('예약 ', '') + Math.ceil(list.length / MAX) + T('건으로 분할', ' reservations') : '');
        }
        if (!list.length) {
            body.innerHTML = '<div style="padding:30px 8px; text-align:center; color:#888; font-size:12.5px;">'
                + T('담아둔 자재가 없습니다.', 'The cart is empty.') + '<br><br>'
                + T('자재를 조회한 뒤 결과에서 "🧺 담기"를 누르면 여기에 쌓입니다.', 'Look up a material and press "🧺 Add" in the result.')
                + '</div>';
            return;
        }

        var inp = 'padding:4px 6px; border:1px solid #ccd3dd; border-radius:4px; font-size:12px; box-sizing:border-box;';
        var lab = 'font-size:11.5px; color:#555; display:block; margin-bottom:2px;';
        var cell = 'padding:4px 6px; border-bottom:1px solid #eef0f3;';

        var html = ''
            + '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(168px,1fr)); gap:9px; margin-bottom:11px;">'
            + '<div style="grid-column:span 2;"><label style="' + lab + '">' + T('이동유형', 'Movement type') + '</label>'
            + '<select id="mc-bwart" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;">'
            + optsOf(window.SAP_MOVEMENT_TYPES, h.bwart) + '</select></div>'
            + '<div><label style="' + lab + '">' + T('기본 저장위치', 'Default storage loc.') + '</label>'
            + '<select id="mc-lgort" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;">'
            + optsOf(window.SAP_STORAGE_LOCATIONS, h.lgort || window._mcDefaultLgort(h.bwart)) + '</select></div>'
            + '<div><label style="' + lab + '">' + T('필요일', 'Required date') + '</label>'
            + '<input id="mc-rsdat" type="date" value="' + esc(toDateInput(h.rsdat)) + '" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;"></div>'
            + '<div><label style="' + lab + '">' + T('자재 수령인', 'Recipient') + '</label>'
            + '<input id="mc-wempf" value="' + esc(h.wempf || '') + '" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;"></div>'
            + '<div><label style="' + lab + '">' + T('오더(프로젝트 코드)', 'Order (project code)') + '</label>'
            + '<div style="display:flex; gap:4px;">'
            + '<input id="mc-aufnr" value="' + esc(h.aufnr || '') + '" onchange="window._mcHdrChange()" style="' + inp + ' flex:1; min-width:0;">'
            + '<button onclick="window._mcFindOrder()" title="' + T('프로젝트 코드 조회', 'Look up project code') + '"'
            + ' style="padding:3px 8px; border:1px solid #a5c8f0; background:#e7f3ff; border-radius:4px; cursor:pointer;">🔍</button>'
            + '</div></div>'
            + '<div><label style="' + lab + '">' + T('코스트센터(조직)', 'Cost center') + '</label>'
            + '<div style="display:flex; gap:4px;">'
            + '<input id="mc-kostl" value="' + esc(h.kostl || '') + '" onchange="window._mcHdrChange()" style="' + inp + ' flex:1; min-width:0;">'
            + '<select onchange="if(this.value){document.getElementById(\'mc-kostl\').value=this.value;window._mcHdrChange();}"'
            + ' title="' + T('조직 선택 ([미사용] 제외 69건)', 'Pick org (69 active)') + '"'
            + ' style="' + inp + ' width:66px;"><option value="">▾</option>'
            + optsOf(window.SAP_COST_CENTERS, '') + '</select>'
            + '</div></div>'
            + '<div><label style="' + lab + '">' + T('목적(용도)', 'Purpose') + '</label>'
            + '<select id="mc-purpose" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;">'
            + '<option value="">' + T('— 선택 —', '— select —') + '</option>'
            + optsOf(window.SAP_RESERVATION_PURPOSES, h.purpose) + '</select></div>'
            + '</div>'
            + '<div id="mc-order-results">' + orderResultsHtml + '</div>'
            // ── 품목 표 — 저장위치 열은 "기본 저장위치"와 중복이라 뺐다(사용자 지적) ──
            + '<div style="border:1px solid #ddd; border-radius:5px; overflow:hidden;">'
            + '<table style="width:100%; table-layout:fixed; border-collapse:collapse; font-size:12px;">'
            + '<colgroup><col style="width:90px;"><col><col style="width:62px;"><col style="width:52px;"><col style="width:36%;"><col style="width:28px;"></colgroup>'
            + '<thead><tr style="background:#eef3fa;">'
            + '<th style="padding:5px 6px; text-align:left; border-bottom:1px solid #cdd7e3;">' + T('자재번호', 'Material') + '</th>'
            + '<th style="padding:5px 6px; text-align:left; border-bottom:1px solid #cdd7e3;">' + T('자재내역', 'Description') + '</th>'
            + '<th style="padding:5px 6px; border-bottom:1px solid #cdd7e3;">' + T('수량', 'Qty') + '</th>'
            + '<th style="padding:5px 6px; border-bottom:1px solid #cdd7e3;">' + T('단위', 'Unit') + '</th>'
            + '<th style="padding:5px 6px; text-align:left; border-bottom:1px solid #cdd7e3;">' + T('사유(텍스트) *', 'Reason (text) *') + '</th>'
            + '<th style="padding:5px 2px; border-bottom:1px solid #cdd7e3;"></th>'
            + '</tr></thead><tbody>';
        list.forEach(function (it, i) {
            var bg = i % 2 === 0 ? '#fff' : '#f7f9fc';
            var over = i >= MAX ? ' background:#fffbe6;' : '';
            var noTxt = it.sgtxt ? '' : ' border-color:#e8a1a1; background:#fff8f8;';
            html += '<tr style="background:' + bg + ';' + over + '">'
                + '<td style="' + cell + ' font-family:monospace; overflow:hidden; text-overflow:ellipsis;">' + esc(it.matnr) + '</td>'
                + '<td style="' + cell + ' overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + esc(it.maktx) + '">' + esc(it.maktx) + '</td>'
                + '<td style="' + cell + '"><input type="number" min="1" step="1" value="' + esc(it.qty) + '"'
                + ' onchange="window._mcSetField(\'' + esc(it.matnr) + '\',\'qty\',this.value)" style="' + inp + ' width:100%;"></td>'
                + '<td style="' + cell + '"><input value="' + esc(it.unit || 'EA') + '" title="' + T('SAP 기본단위(MM03 MEINS). 대부분 EA.', 'Base unit (MM03 MEINS), usually EA.') + '"'
                + ' onchange="window._mcSetField(\'' + esc(it.matnr) + '\',\'unit\',this.value.toUpperCase()||\'EA\')"'
                + ' style="' + inp + ' width:100%; text-align:center;"></td>'
                + '<td style="' + cell + '"><input value="' + esc(it.sgtxt) + '" placeholder="' + esc(REASON_EXAMPLE) + '"'
                + ' title="' + T('→ (오른쪽 방향키)를 누르면 예시가 그대로 채워집니다', 'Press → to fill the example') + '"'
                + ' onkeydown="window._mcHintKey(event, this)"'
                + ' onchange="window._mcSetField(\'' + esc(it.matnr) + '\',\'sgtxt\',this.value); window._mcRender();"'
                + ' style="' + inp + noTxt + ' width:100%;"></td>'
                + '<td style="' + cell + ' text-align:center;">'
                + '<button onclick="window._mcRemove(\'' + esc(it.matnr) + '\')" title="' + T('빼기', 'Remove') + '"'
                + ' style="border:none; background:none; cursor:pointer; color:#b0392c; font-size:14px;">×</button></td>'
                + '</tr>';
        });
        html += '</tbody></table></div>';
        if (list.length > MAX) {
            html += '<div style="margin-top:7px; font-size:11.5px; color:#8a6d1a; background:#fffbe6;'
                + ' border:1px solid #f0dca0; border-radius:4px; padding:6px 9px;">⚠️ '
                + T('MB21 한 화면에 ' + MAX + '건까지만 들어갑니다 — 노란 줄부터는 다음 예약으로 나눠 생성됩니다.',
                    'MB21 fits ' + MAX + ' items per screen — highlighted rows go into a follow-up reservation.')
                + '</div>';
        }
        html += '<div style="margin-top:8px; font-size:11.5px; color:#666;">'
            + '💡 ' + T('사유 칸에서 → (오른쪽 방향키)를 누르면 예시가 채워집니다.', 'Press → in the Reason box to fill the example.') + '<br>'
            + '🏭 ' + T('플랜트 ', 'Plant ') + plant() + T(' 고정', ' (fixed)')
            + '  ·  📄 ' + T('만들어진 예약은 ZMM019(계정대체청구서)에서 PDF로 출력합니다.', 'Reservations are printed as PDF from ZMM019.')
            + '</div>';
        body.innerHTML = html;
    }
    window._mcRender = render;

    window._mcHdrChange = function () {
        var h = hdr(), prevBwart = h.bwart;
        function v(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
        h.bwart   = v('mc-bwart') || h.bwart;
        h.lgort   = v('mc-lgort');
        h.rsdat   = fromDateInput(v('mc-rsdat'));
        var w = v('mc-wempf');
        if (w !== (window.currentUserName || '')) h.wempfEdited = true;   // 사람이 고쳤으면 자동기입 중단
        h.wempf   = w;
        h.aufnr   = v('mc-aufnr');
        h.kostl   = v('mc-kostl');
        h.purpose = v('mc-purpose');
        if (h.bwart !== prevBwart) h.lgort = window._mcDefaultLgort(h.bwart) || h.lgort;
        setHdr(h);
        render();
    };

    /** 🔍 오더(프로젝트 코드) 조회 — 기존 /sap-project-codes 재사용. 결과를 눌러 채운다. */
    window._mcFindOrder = async function () {
        var box = document.getElementById('mc-order-results');
        function put(h) { orderResultsHtml = h; if (box) box.innerHTML = h; }
        var pattern = (document.getElementById('mc-aufnr') || {}).value || '';
        pattern = String(pattern).trim();
        if (!pattern) {
            put('<div style="font-size:11.5px; color:#a3281c; margin:-5px 0 9px;">'
                + T('오더 칸에 검색어를 넣고 🔍를 눌러주세요 (예: G26 또는 STELLAR).', 'Type a search term in the Order box first (e.g. G26 or STELLAR).') + '</div>');
            return;
        }
        put('<div style="font-size:11.5px; color:#666; margin:-5px 0 9px;">⏳ '
            + T('프로젝트 코드 조회 중...', 'Looking up project codes...') + '</div>');
        // 숫자가 섞여 있으면 오더번호 칸, 문자만이면 내역 칸 — docs/sap-lookup.md의 기존 규칙과 동일
        var by = /\d/.test(pattern) ? 'order' : 'desc';
        try {
            var res = await window._withTimeout(
                fetch(API + '/sap-project-codes?by=' + by + '&pattern=' + encodeURIComponent(pattern)),
                120000, T('프로젝트 코드 조회 시간 초과', 'Project code lookup timed out'));
            var data = await res.json();
            if (!data.ok) throw new Error(data.error || T('조회 실패', 'lookup failed'));
            var rows = data.items || (data.codes || []).map(function (c) { return { code: c, desc: '' }; });
            if (!rows.length) {
                put('<div style="font-size:11.5px; color:#a3281c; margin:-5px 0 9px;">'
                    + T('"' + pattern + '" 매치 없음 — SAP 검색은 대소문자를 구분합니다(영문은 대문자).',
                        'No match for "' + pattern + '" — SAP search is case-sensitive (use uppercase).') + '</div>');
                return;
            }
            var h2 = '<div style="margin:-5px 0 9px; border:1px solid #cdd7e3; border-radius:5px; max-height:150px; overflow:auto;">'
                + '<div style="padding:4px 8px; background:#eef3fa; font-size:11.5px; color:#444;">🗂 '
                + T('프로젝트 코드 ', 'Project codes ') + rows.length + T('건 — 클릭하면 오더에 들어갑니다', ' — click to fill Order') + '</div>';
            rows.slice(0, 80).forEach(function (r, i) {
                h2 += '<div onclick="window._mcPickOrder(\'' + esc(r.code).replace(/'/g, "") + '\')"'
                    + ' onmouseover="this.style.background=\'#d4eaf8\'" onmouseout="this.style.background=\'' + (i % 2 ? '#f7f9fc' : '#fff') + '\'"'
                    + ' style="padding:4px 8px; font-size:12px; cursor:pointer; background:' + (i % 2 ? '#f7f9fc' : '#fff') + ';">'
                    + '<span style="font-family:monospace;">' + esc(r.code) + '</span>'
                    + (r.desc ? '<span style="color:#666;">  ' + esc(r.desc) + '</span>' : '') + '</div>';
            });
            put(h2 + '</div>');
        } catch (e) {
            put('<div style="font-size:11.5px; color:#a3281c; margin:-5px 0 9px;">⚠️ '
                + esc(e && e.message ? e.message : e) + '</div>');
        }
    };
    window._mcPickOrder = function (code) {
        var el = document.getElementById('mc-aufnr');
        if (el) { el.value = code; window._mcHdrChange(); }
    };

    // ── 전송 ──────────────────────────────────────────────────────────
    window._mcSubmit = async function () {
        var list = items(), h = hdr();
        if (!list.length) return;
        var missing = [];
        if (!h.aufnr)   missing.push(T('오더', 'Order'));
        if (!h.kostl)   missing.push(T('코스트센터', 'Cost center'));
        if (!h.purpose) missing.push(T('목적(용도)', 'Purpose'));
        var noTxt = list.filter(function (x) { return !String(x.sgtxt || '').trim(); });
        if (noTxt.length) missing.push(T('사유(텍스트) — ' + noTxt.length + '개 품목 비어 있음', 'Reason text — ' + noTxt.length + ' item(s) empty'));
        if (missing.length) { alert(T('다음 항목이 필요합니다:\n', 'Required:\n') + '· ' + missing.join('\n· ')); return; }

        var MAX = (window.SAP_RESERVATION_MAX_ITEMS || 43);
        var batches = [];
        for (var i = 0; i < list.length; i += MAX) batches.push(list.slice(i, i + MAX));

        var msg = T('이동유형 ', 'Movement type ') + h.bwart + ' (' + mvLabel(h.bwart) + ')\n'
            + T('품목 ', 'Items: ') + list.length + T('건', '')
            + (batches.length > 1 ? T(' → 예약 ', ' → ') + batches.length + T('건으로 분할', ' reservations') : '') + '\n'
            + T('오더 ', 'Order ') + h.aufnr + ' / ' + T('코스트센터 ', 'Cost center ') + h.kostl
            + ' / ' + T('목적 ', 'Purpose ') + h.purpose + '\n\n'
            + T('⚠️ SAP에 실제 예약(청구서)을 생성합니다. 진행할까요?', '⚠️ This creates real reservations in SAP. Proceed?');
        if (!confirm(msg)) return;

        var btn = document.getElementById('matcart-submit');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + T('생성 중...', 'Creating...'); }
        var created = [], failed = [], warns = [];
        try {
            for (var b = 0; b < batches.length; b++) {
                var payload = {
                    bwart: h.bwart, werks: plant(),
                    lgort_default: h.lgort || window._mcDefaultLgort(h.bwart),
                    rsdat: h.rsdat || '', wempf: h.wempf || '',
                    order_number: h.aufnr, cost_center: h.kostl, purpose: h.purpose,
                    items: batches[b].map(function (x) {
                        return { matnr: x.matnr, qty: String(x.qty), unit: x.unit || 'EA', sgtxt: x.sgtxt || '' };
                    })
                };
                try {
                    var res = await window._withTimeout(fetch(API + '/sap-create-reservation', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }), 240000, T('예약 생성 시간 초과', 'Reservation creation timed out'));
                    var data = await res.json();
                    if (data.ok && data.rsnum) {
                        created.push(data.rsnum);
                        if (data.purposeWarning) warns.push(data.rsnum + ': ' + data.purposeWarning);
                        if (data.textWarning)    warns.push(data.rsnum + ': ' + data.textWarning);
                    } else {
                        failed.push((data && data.error) || T('알 수 없는 오류', 'unknown error'));
                    }
                } catch (e) { failed.push(e && e.message ? e.message : String(e)); }
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '📄 ' + T('청구서 만들기', 'Create reservation'); }
        }

        // 🔗 [2026-10-02 제보 "MB21까지 하고 멈춤"] 예약만 만들고 끊지 않는다.
        //    CLAUDE.md 구매오더 원칙과 동일: **확인 1회 후 끝까지 자동**(임의 정지 금지).
        //    최종 산출물은 ZMM019 청구서이므로 생성된 예약마다 바로 출력까지 이어간다.
        var printed = [], printFailed = [];
        for (var p = 0; p < created.length; p++) {
            status('<div style="color:#1a4f7a;">⏳ ' + T('ZMM019 청구서 출력 중… ', 'Printing via ZMM019… ')
                + '(' + (p + 1) + '/' + created.length + ') ' + T('예약 ', '') + esc(created[p]) + '</div>');
            try {
                var pr = await window._mcPrint(created[p], { quiet: true });
                if (pr && pr.ok) printed.push(created[p]);
                else printFailed.push(created[p] + ': ' + ((pr && pr.text) || T('출력 실패', 'print failed')));
            } catch (e) {
                printFailed.push(created[p] + ': ' + (e && e.message ? e.message : e));
            }
        }

        var out = '';
        if (created.length) {
            out += '✅ ' + T('예약(청구서) 생성 완료: ', 'Reservation(s) created: ') + created.join(', ');
            if (printed.length) out += '\n🖨 ' + T('ZMM019 청구서 출력 완료: ', 'Printed via ZMM019: ') + printed.join(', ');
            if (printFailed.length) out += '\n⚠️ ' + T('청구서 출력 실패: ', 'Print failed: ') + printFailed.join(' / ')
                + '\n   ' + T('아래 🖨 버튼으로 다시 시도할 수 있습니다.', 'Retry with the 🖨 button below.');
            if (!failed.length) { setItems([]); render(); }
        }
        if (warns.length)  out += (out ? '\n' : '') + '⚠️ ' + warns.join(' / ');
        if (failed.length) out += (out ? '\n' : '') + '⚠️ ' + T('실패 ', 'Failed ') + failed.length + T('건: ', ': ') + failed.join(' / ');
        if (window._ganttQaHistory) {
            if (created.length) {
                var btns = created.map(function (rs) {
                    return '<button onclick="window._mcPrint(\'' + rs + '\')" style="margin:3px 5px 0 0; padding:4px 11px;'
                        + ' background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:5px;'
                        + ' font-size:11.5px; cursor:pointer;">🖨 ' + rs + ' ' + T('청구서 출력', 'Print') + '</button>';
                }).join('');
                window._ganttQaHistory.push({ role: 'ai', rawHtml: true,
                    text: '<div style="font-size:12.5px; white-space:pre-wrap;">' + esc(out) + '</div>'
                        + '<div style="margin-top:6px;">' + btns + '</div>' });
            } else {
                window._ganttQaHistory.push({ role: 'ai', text: out });
            }
            if (window._renderGanttQaMessages) window._renderGanttQaMessages();
        }
        // 채팅창이 닫혀 있어도 보이도록 모달 안에도 결과 + 재출력 버튼을 남긴다
        if (created.length) {
            status('<div style="white-space:pre-wrap;">' + esc(out) + '</div>'
                + '<div style="margin-top:6px;">' + created.map(function (rs) {
                    return '<button onclick="window._mcPrint(\'' + rs + '\')" style="margin:3px 5px 0 0; padding:4px 11px;'
                        + ' background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:5px;'
                        + ' font-size:11.5px; cursor:pointer;">🖨 ' + rs + ' ' + T('다시 출력', 'Re-print') + '</button>';
                }).join('') + '</div>');
        } else {
            status('<div style="white-space:pre-wrap; color:#a3281c;">' + esc(out) + '</div>');
        }
        if (window.showToast) window.showToast(out, created.length && !failed.length && !printFailed.length ? 'success' : 'error', 6000);
    };

    /** 🖨 ZMM019 "청구서출력" — 계정대체 청구의 최종 산출물.
     *  opts.quiet=true면 채팅에 넣지 않고 결과만 돌려준다(자동 연결에서 호출부가 직접 표시). */
    window._mcPrint = async function (rsnum, opts) {
        opts = opts || {};
        if (!opts.quiet && window._ganttQaHistory) {
            window._ganttQaHistory.push({ role: 'ai', pending: true,
                text: '⏳ ' + T('ZMM019에서 예약번호 ' + rsnum + ' 청구서를 출력하는 중...', 'Printing reservation ' + rsnum + ' from ZMM019...') });
            if (window._renderGanttQaMessages) window._renderGanttQaMessages();
        }
        var reply, okFlag = false;   // 성공 여부는 문자열이 아니라 플래그로 판정한다
        try {
            var res = await window._withTimeout(
                fetch(API + '/sap-print-reservation?rsnum=' + encodeURIComponent(rsnum) + '&werks=' + encodeURIComponent(plant())),
                95000, T('청구서 출력 시간 초과', 'Print timed out'));
            var data = await res.json();
            okFlag = !!(data && data.ok);
            reply = okFlag ? ('🖨 ' + (data.text || T('청구서를 출력했습니다.', 'Printed.')))
                           : ('⚠️ ' + ((data && data.error) || T('청구서 출력 실패', 'Print failed')));
        } catch (e) {
            reply = '⚠️ ' + T('청구서 출력 실패: ', 'Print failed: ') + (e && e.message ? e.message : e);
        }
        if (!opts.quiet && window._ganttQaHistory) {
            window._ganttQaHistory.pop();
            window._ganttQaHistory.push({ role: 'ai', text: reply });
            if (window._renderGanttQaMessages) window._renderGanttQaMessages();
        }
        return { ok: okFlag, text: reply };
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshChip);
    else refreshChip();
})();
