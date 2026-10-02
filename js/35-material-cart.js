/* ════════════════════════════════════════════════════════════════════
   🧺 자재 보관함 (Material Cart) — 2026-10-02, 사용자 요청
   설계 기록: docs/sap-lookup.md "자재청구/자재입고 청구서" 절

   목적: 자재를 **여러 번 검색해 가며 담아 두었다가**, 모아서 한 번에
   MB21 예약(계정대체 청구서)을 만든다. 최종 산출물은 ZMM019 PDF.

   ⚠️ 이름 주의 — Phase 1의 "업무 보관함"(js/14c-task-inbox.js)과 **다른 물건**이다.
      그쪽은 메일→업무 스테이징, 이쪽은 SAP 자재 청구용 장바구니.

   담는 곳(진입점): 자재 선택 칩 팝업(js/04g `_sapSelectMaterial`)의 "🧺 담기",
                    자재내역 패턴조회 결과 표의 행 버튼.
   꺼내는 곳: 화면 우하단 🧺 칩 → 이 모달.

   저장: localStorage(기기 로컬). STORAGE_REGISTRY(js/34)에 등록되어 🧹 정리 대상.
   ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var API = 'http://127.0.0.1:5000';
    var ITEMS_KEY = 'gantt_matcart_items_v1';
    var HDR_KEY   = 'gantt_matcart_hdr_v1';

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

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

    /** 헤더(공통 입력값) — 마지막에 쓴 값을 기억해 다음 청구 때 그대로 띄운다. */
    function hdr() {
        var h = load(HDR_KEY, {}) || {};
        if (!h.bwart) h.bwart = '951';
        if (!h.werks) h.werks = '1000';
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
    function mvTitle(bwart) {
        var list = window.SAP_MB21_MOVEMENT_TYPES || [];
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].bwart) === String(bwart)) {
                return window._currentLang === 'en' ? (list[i].titleEn || list[i].title) : list[i].title;
            }
        }
        return bwart;
    }

    // ── 공개 API ──────────────────────────────────────────────────────
    /** 보관함에 담는다. 이미 있으면 수량을 더한다(장바구니 통상 동작). */
    window._mcAdd = function (matnr, maktx, opts) {
        matnr = String(matnr || '').trim();
        if (!matnr) return false;
        opts = opts || {};
        var qty = Number(opts.qty);
        if (!isFinite(qty) || qty <= 0) qty = 1;
        var list = items();
        var hit = null;
        for (var i = 0; i < list.length; i++) { if (list[i].matnr === matnr) { hit = list[i]; break; } }
        if (hit) {
            hit.qty = Number(hit.qty || 0) + qty;
            if (maktx && !hit.maktx) hit.maktx = String(maktx);
        } else {
            list.push({
                matnr: matnr,
                maktx: String(maktx || ''),
                qty: qty,
                unit: String(opts.unit || 'EA'),
                lgort: String(opts.lgort || ''),     // 비우면 전송 시 이동유형 기본값이 적용된다
                charg: String(opts.charg || ''),
                addedAt: Date.now()
            });
        }
        setItems(list);
        if (window.showToast) {
            window.showToast('🧺 ' + T('자재 보관함에 담았습니다: ', 'Added to cart: ') + matnr
                + ' (' + T('총 ', 'total ') + list.length + T('건)', ' items)'), 'success');
        }
        if (document.getElementById('matcart-modal') &&
            document.getElementById('matcart-modal').style.display === 'block') render();
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
                } else {
                    list[i][field] = String(value || '');
                }
                break;
            }
        }
        setItems(list);
    };
    window._mcClear = function () {
        if (!items().length) return;
        if (!confirm(T('자재 보관함을 비울까요? 담아둔 항목이 모두 사라집니다.', 'Empty the cart? All staged items will be removed.'))) return;
        setItems([]);
        render();
    };
    window._mcCount = function () { return items().length; };
    window._mcList = function () { return items(); };

    // ── 우하단 칩 ─────────────────────────────────────────────────────
    function refreshChip() {
        var n = items().length;
        var chip = document.getElementById('matcart-chip');
        if (!n) { if (chip) chip.style.display = 'none'; return; }
        if (!chip) {
            chip = document.createElement('div');
            chip.id = 'matcart-chip';
            chip.style.cssText = 'position:fixed; right:18px; bottom:76px; z-index:9000; padding:8px 14px;'
                + 'background:#fff3e0; border:1px solid #e8b974; border-radius:20px; cursor:pointer;'
                + 'font-size:12.5px; font-weight:bold; color:#8a5a12; box-shadow:0 2px 8px rgba(0,0,0,.18);';
            chip.onclick = function () { window._mcOpen(); };
            document.body.appendChild(chip);
        }
        chip.style.display = 'block';
        chip.textContent = '🧺 ' + T('자재 보관함 ', 'Cart ') + n + T('건', '');
    }
    window._mcRefreshChip = refreshChip;

    // ── 모달 ──────────────────────────────────────────────────────────
    window._mcOpen = function () {
        var modal = document.getElementById('matcart-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'matcart-modal';
            modal.style.cssText = 'display:none; position:fixed; z-index:10050; left:0; top:0; width:100%; height:100%; pointer-events:none;';
            modal.innerHTML =
                '<div id="matcart-box" style="pointer-events:auto; position:absolute; left:50%; top:52%;'
                + ' transform:translate(-50%,-50%); width:min(760px,94vw); max-height:88vh; background:#fff;'
                + ' border-radius:10px; box-shadow:0 8px 30px rgba(0,0,0,.3); display:flex; flex-direction:column;">'
                + '<div id="matcart-drag" style="padding:12px 16px; border-bottom:1px solid #eee; cursor:move;'
                + ' display:flex; align-items:center; gap:8px;">'
                + '<b style="font-size:14px;">🧺 ' + T('자재 보관함', 'Material Cart') + '</b>'
                + '<span id="matcart-count" style="font-size:12px; color:#777;"></span>'
                + '<span style="flex:1;"></span>'
                + '<button onclick="document.getElementById(\'matcart-modal\').style.display=\'none\'"'
                + ' style="border:none; background:none; font-size:18px; cursor:pointer; color:#888;">×</button>'
                + '</div>'
                + '<div id="matcart-body" style="overflow-y:auto; flex:1; padding:14px 16px;"></div>'
                + '<div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px;">'
                + '<button onclick="window._mcClear()" style="padding:8px 14px; background:#fdecea; color:#a3281c;'
                + ' border:1px solid #f0b4ad; border-radius:6px; font-size:12px; cursor:pointer;">🗑 '
                + T('비우기', 'Empty') + '</button>'
                + '<span style="flex:1;"></span>'
                + '<button id="matcart-submit" onclick="window._mcSubmit()" style="padding:8px 18px; background:#e8f4fd;'
                + ' color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold;'
                + ' cursor:pointer;">📄 ' + T('청구서 만들기', 'Create reservation') + '</button>'
                + '</div></div>';
            document.body.appendChild(modal);
            if (window._makeDraggable) window._makeDraggable('matcart-box', 'matcart-drag');
            if (window._bindClickToFront) window._bindClickToFront('matcart-modal');
        }
        render();
        modal.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('matcart-modal');
    };

    /** 데이터(js/32)로 만든 datalist — 드롭다운으로 고르되 직접 입력도 된다(VINA 등 해외 플랜트). */
    function dataListHtml(id, rows) {
        var h = '<datalist id="' + id + '">';
        (rows || []).forEach(function (r) {
            h += '<option value="' + esc(r.code) + '">' + esc(r.code + ' — ' + (window._currentLang === 'en' ? (r.labelEn || r.label) : r.label)) + '</option>';
        });
        return h + '</datalist>';
    }

    function render() {
        var body = document.getElementById('matcart-body');
        if (!body) return;
        var list = items(), h = hdr();
        var cnt = document.getElementById('matcart-count');
        var MAX = (window.SAP_RESERVATION_MAX_ITEMS || 28);
        if (cnt) {
            cnt.textContent = list.length + T('건', ' items')
                + (list.length > MAX ? '  ·  ' + T('예약 ', '') + Math.ceil(list.length / MAX) + T('건으로 나눠 생성됩니다', ' reservations (split)') : '');
        }

        if (!list.length) {
            body.innerHTML = '<div style="padding:28px 8px; text-align:center; color:#888; font-size:12.5px;">'
                + T('담아둔 자재가 없습니다.', 'The cart is empty.') + '<br><br>'
                + T('자재를 조회한 뒤 결과에서 "🧺 담기"를 누르면 여기에 쌓입니다.', 'Look up a material and press "🧺 Add" in the result.')
                + '</div>';
            return;
        }

        var mv = window.SAP_MB21_MOVEMENT_TYPES || [];
        var mvOpts = mv.map(function (m) {
            return '<option value="' + esc(m.bwart) + '"' + (String(h.bwart) === String(m.bwart) ? ' selected' : '') + '>'
                + esc(m.bwart + ' — ' + (window._currentLang === 'en' ? (m.titleEn || m.title) : m.title)) + '</option>';
        }).join('');

        var inp = 'padding:4px 6px; border:1px solid #ccd3dd; border-radius:4px; font-size:12px;';
        var lab = 'font-size:11.5px; color:#555; display:block; margin-bottom:2px;';

        var html = ''
            + dataListHtml('matcart-plants', window.SAP_PLANTS)
            + dataListHtml('matcart-lgorts', window.SAP_STORAGE_LOCATIONS)
            // ── 공통 헤더 ──
            + '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:9px; margin-bottom:12px;">'
            + '<div><label style="' + lab + '">' + T('이동유형', 'Movement type') + '</label>'
            + '<select id="mc-bwart" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;">' + mvOpts + '</select></div>'
            + '<div><label style="' + lab + '">' + T('플랜트', 'Plant') + '</label>'
            + '<input id="mc-werks" list="matcart-plants" value="' + esc(h.werks || '1000') + '" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;"></div>'
            + '<div><label style="' + lab + '">' + T('기본 저장위치', 'Default storage loc.') + '</label>'
            + '<input id="mc-lgort" list="matcart-lgorts" value="' + esc(h.lgort || window._mcDefaultLgort(h.bwart)) + '" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;"></div>'
            + '<div><label style="' + lab + '">' + T('필요일(YYYYMMDD)', 'Required date') + '</label>'
            + '<input id="mc-rsdat" value="' + esc(h.rsdat || '') + '" placeholder="' + T('비우면 오늘', 'blank = today') + '" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;"></div>'
            + '<div><label style="' + lab + '">' + T('자재 수령인', 'Recipient') + '</label>'
            + '<input id="mc-wempf" value="' + esc(h.wempf || '') + '" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;"></div>'
            + '<div><label style="' + lab + '">' + T('오더(내부오더)', 'Order') + '</label>'
            + '<input id="mc-aufnr" value="' + esc(h.aufnr || '') + '" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;"></div>'
            + '<div><label style="' + lab + '">' + T('코스트센터', 'Cost center') + '</label>'
            + '<input id="mc-kostl" value="' + esc(h.kostl || '') + '" onchange="window._mcHdrChange()" style="' + inp + ' width:100%;"></div>'
            + '</div>'
            // ── 품목 표 ──
            + '<div style="border:1px solid #ddd; border-radius:5px; overflow:hidden;">'
            + '<table style="width:100%; border-collapse:collapse; font-size:12px;">'
            + '<thead><tr style="background:#eef3fa;">'
            + '<th style="padding:5px 8px; text-align:left; border-bottom:1px solid #cdd7e3;">' + T('자재번호', 'Material') + '</th>'
            + '<th style="padding:5px 8px; text-align:left; border-bottom:1px solid #cdd7e3;">' + T('자재내역', 'Description') + '</th>'
            + '<th style="padding:5px 8px; width:78px; border-bottom:1px solid #cdd7e3;">' + T('수량', 'Qty') + '</th>'
            + '<th style="padding:5px 8px; width:82px; border-bottom:1px solid #cdd7e3;">' + T('저장위치', 'SLoc') + '</th>'
            + '<th style="padding:5px 4px; width:34px; border-bottom:1px solid #cdd7e3;"></th>'
            + '</tr></thead><tbody>';
        list.forEach(function (it, i) {
            var bg = i % 2 === 0 ? '#fff' : '#f7f9fc';
            var over = i >= MAX ? ' background:#fffbe6;' : '';
            html += '<tr style="background:' + bg + ';' + over + '">'
                + '<td style="padding:4px 8px; font-family:monospace; border-bottom:1px solid #eef0f3;">' + esc(it.matnr) + '</td>'
                + '<td style="padding:4px 8px; border-bottom:1px solid #eef0f3;">' + esc(it.maktx) + '</td>'
                + '<td style="padding:3px 6px; border-bottom:1px solid #eef0f3;">'
                + '<input type="number" min="1" step="1" value="' + esc(it.qty) + '"'
                + ' onchange="window._mcSetField(\'' + esc(it.matnr) + '\',\'qty\',this.value)"'
                + ' style="' + inp + ' width:100%;"></td>'
                + '<td style="padding:3px 6px; border-bottom:1px solid #eef0f3;">'
                + '<input list="matcart-lgorts" value="' + esc(it.lgort) + '" placeholder="' + T('기본', 'dflt') + '"'
                + ' onchange="window._mcSetField(\'' + esc(it.matnr) + '\',\'lgort\',this.value)"'
                + ' style="' + inp + ' width:100%;"></td>'
                + '<td style="padding:3px 4px; text-align:center; border-bottom:1px solid #eef0f3;">'
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
        html += '<div style="margin-top:8px; font-size:11.5px; color:#666;">📄 '
            + T('만들어진 예약은 ZMM019(계정대체청구서)에서 PDF로 출력합니다.', 'Reservations are printed as PDF from ZMM019.')
            + '</div>';
        body.innerHTML = html;
    }
    window._mcRender = render;

    /** 헤더 입력 변경 — 이동유형을 바꾸면 기본 저장위치를 그 유형의 값으로 되돌린다. */
    window._mcHdrChange = function () {
        var h = hdr();
        var prevBwart = h.bwart;
        function v(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
        h.bwart = v('mc-bwart') || h.bwart;
        h.werks = v('mc-werks');
        h.lgort = v('mc-lgort');
        h.rsdat = v('mc-rsdat');
        h.wempf = v('mc-wempf');
        h.aufnr = v('mc-aufnr');
        h.kostl = v('mc-kostl');
        if (h.bwart !== prevBwart) h.lgort = window._mcDefaultLgort(h.bwart);   // 951↔907 전환 시 기본창고 교체
        setHdr(h);
        render();
    };

    // ── 전송 ──────────────────────────────────────────────────────────
    window._mcSubmit = async function () {
        var list = items(), h = hdr();
        if (!list.length) return;
        var missing = [];
        if (!h.aufnr) missing.push(T('오더', 'Order'));
        if (!h.kostl) missing.push(T('코스트센터', 'Cost center'));
        if (missing.length) {
            alert(T('다음 항목이 필요합니다: ', 'Required: ') + missing.join(', '));
            return;
        }
        var MAX = (window.SAP_RESERVATION_MAX_ITEMS || 28);
        var batches = [];
        for (var i = 0; i < list.length; i += MAX) batches.push(list.slice(i, i + MAX));

        var msg = T('이동유형 ', 'Movement type ') + h.bwart + ' (' + mvTitle(h.bwart) + ')\n'
            + T('품목 ', 'Items: ') + list.length + T('건', '')
            + (batches.length > 1 ? T(' → 예약 ', ' → ') + batches.length + T('건으로 분할', ' reservations') : '') + '\n'
            + T('오더 ', 'Order ') + h.aufnr + ' / ' + T('코스트센터 ', 'Cost center ') + h.kostl + '\n\n'
            + T('⚠️ SAP에 실제 예약(청구서)을 생성합니다. 진행할까요?', '⚠️ This creates real reservations in SAP. Proceed?');
        if (!confirm(msg)) return;

        var btn = document.getElementById('matcart-submit');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + T('생성 중...', 'Creating...'); }
        var created = [], failed = [];
        try {
            for (var b = 0; b < batches.length; b++) {
                var payload = {
                    bwart: h.bwart, werks: h.werks || '1000',
                    lgort_default: h.lgort || window._mcDefaultLgort(h.bwart),
                    rsdat: h.rsdat || '', wempf: h.wempf || '',
                    order_number: h.aufnr, cost_center: h.kostl,
                    items: batches[b].map(function (x) {
                        return { matnr: x.matnr, qty: String(x.qty), unit: x.unit || 'EA', lgort: x.lgort || '' };
                    })
                };
                try {
                    var res = await window._withTimeout(fetch(API + '/sap-create-reservation', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }), 180000, T('예약 생성 시간 초과', 'Reservation creation timed out'));
                    var data = await res.json();
                    if (data.ok && data.rsnum) created.push(data.rsnum);
                    else failed.push((data && data.error) || T('알 수 없는 오류', 'unknown error'));
                } catch (e) { failed.push(e && e.message ? e.message : String(e)); }
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '📄 ' + T('청구서 만들기', 'Create reservation'); }
        }

        var out = '';
        if (created.length) {
            out += '✅ ' + T('예약(청구서) 생성 완료: ', 'Reservation(s) created: ') + created.join(', ');
            // 전부 성공했을 때만 보관함을 비운다 — 실패분이 남아 있으면 사람이 다시 시도할 수 있어야 한다
            if (!failed.length) { setItems([]); render(); }
        }
        if (failed.length) out += (out ? '\n' : '') + '⚠️ ' + T('실패 ', 'Failed ') + failed.length + T('건: ', ': ') + failed.join(' / ');
        if (window._ganttQaHistory) {
            window._ganttQaHistory.push({ role: 'ai', text: out });
            if (window._renderGanttQaMessages) window._renderGanttQaMessages();
        }
        if (window.showToast) window.showToast(out, created.length && !failed.length ? 'success' : 'error', 6000);
    };

    // 첫 로드 시 칩 복원(이전 세션에 담아둔 게 있으면 보이게)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshChip);
    } else {
        refreshChip();
    }
})();
