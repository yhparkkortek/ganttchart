/* ================================================================
   49-panel-project-dict.js
   🏷 사내 프로젝트 사전 — "Panel Comparison Table"의 PROJECT 시트를 읽어온다
   ================================================================
   · 왜: 미분류 메일로 몇 시간을 씨름하고 보니, **사용자가 이미 엑셀로 프로젝트 목록을
     관리하고 있었다.** 앱에 등록된 건 13개뿐인데 그 엑셀엔 18개가 들어 있었고,
     백로그에서 주인을 못 찾던 건들(COSMIC·ZITRO·SLIM_SLOT_IDECK·K_27·BTN_14·IVIEW_6.2)이
     전부 거기 있었다. 앱만 그걸 몰랐다.
   · 그래서 "새 사전을 만들자"가 아니라 **이미 있는 그 표를 그대로 읽는다.**
     복사본을 만들면 사용자가 엑셀을 고쳐도 앱은 옛것을 보게 된다.
   ----------------------------------------------------------------
   PROJECT 시트 모양
     R2      : 열마다 프로젝트명  "[LNW]COSMIC_UP"  (대괄호 = 고객사)
     R3~     : 그 열 아래로 패널 PN. "●" 는 채택된 것. A열은 INCH.
   ----------------------------------------------------------------
   · window._ppList()            [{name, customer, model, panels[]}] (캐시)
   · window._ppCustomers()       고객사 이름 목록 — 백로그 취합 사전 보강용
   · window._ppMatchText(text)   본문/제목에서 가장 그럴듯한 프로젝트 1건
   · window._ppOpenPicker(cb)    목록에서 고르기 → 마법사 pre-fill
================================================================ */

(function () {
'use strict';

var _en = function () { return window._currentLang === 'en'; };
var _t  = function (ko, en) { return _en() ? en : ko; };

// 📄 원본 파일 — 이름이 바뀌면 여기만 고친다(폴더 안에서 접두어로 찾으므로 날짜가 바뀌어도 된다)
var PP_FOLDER = 'PANEL';
var PP_PREFIX = 'Panel Comparison Table';
var PP_SHEET  = 'PROJECT';
var PP_CACHE  = 'gantt_panel_proj_dict_v1';   // { mtime, items }

function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _norm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/** "[LNW]COSMIC_UP" → { customer:'LNW', model:'COSMIC UP' } */
function _splitName(name) {
    var m = String(name || '').match(/^\s*\[([^\]]+)\]\s*(.*)$/);
    var cust = m ? m[1].trim() : '';
    var model = (m ? m[2] : String(name || '')).trim().replace(/^_+|_+$/g, '').replace(/_/g, ' ');
    return { customer: cust, model: model };
}

// ── 읽기 ──────────────────────────────────────────────────────────────
function _cacheGet() { try { return JSON.parse(localStorage.getItem(PP_CACHE) || 'null'); } catch (e) { return null; } }
function _cacheSet(v) { try { localStorage.setItem(PP_CACHE, JSON.stringify(v)); } catch (e) { /* 용량 초과는 무시 */ } }

/** 공유에서 비교표 파일을 찾는다(이름 앞부분만 맞으면 됨 — 날짜가 붙어 바뀐다) */
async function _findFile() {
    if (!window._dsList) throw new Error(_t('문서 저장소(js/48)가 없습니다.', 'Document store (js/48) missing.'));
    var j = await window._dsList(PP_FOLDER);
    var hit = ((j && j.files) || []).filter(function (f) {
        return f.name.indexOf(PP_PREFIX) === 0 && /\.xls[xm]$/i.test(f.name);
    }).sort(function (a, b) { return String(b.mtime).localeCompare(String(a.mtime)); })[0];
    if (!hit) throw new Error(_t('"' + PP_PREFIX + '..." 파일을 ' + PP_FOLDER + ' 폴더에서 찾지 못했습니다.',
                                 'Could not find "' + PP_PREFIX + '..." in ' + PP_FOLDER + '.'));
    return hit;
}

/**
 * 사전을 읽는다. 파일 수정시각이 같으면 캐시를 쓴다 —
 * 사용자가 엑셀을 고치면 자동으로 다시 읽는다(복사본을 두지 않는 이유).
 */
window._ppLoad = async function (force) {
    var hit = await _findFile();
    var cached = _cacheGet();
    if (!force && cached && cached.mtime === hit.mtime && (cached.items || []).length) return cached.items;

    if (!window.XLSX) throw new Error(_t('엑셀 파서(XLSX)가 아직 로드되지 않았습니다.', 'XLSX not loaded yet.'));
    var file = await window._dsFileOf(PP_FOLDER, hit.name);
    var wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    var sh = wb.Sheets[PP_SHEET];
    if (!sh) throw new Error(_t('"' + PP_SHEET + '" 시트가 없습니다.', 'No "' + PP_SHEET + '" sheet.'));
    var aoa = window.XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
    if (aoa.length < 3) throw new Error(_t('PROJECT 시트가 비어 있습니다.', 'PROJECT sheet is empty.'));

    var header = aoa[1] || [];           // R2 = 프로젝트명
    var items = [];
    for (var c = 1; c < header.length; c++) {
        var nm = String(header[c] || '').trim();
        if (!nm || nm === '-' || nm === 'ALL' || nm === 'INCH') continue;
        var panels = [];
        for (var r = 2; r < aoa.length; r++) {
            var v = String((aoa[r] || [])[c] || '').trim();
            if (!v || v === '-') continue;
            var chosen = v.charAt(0) === '●';                 // ● = 채택
            var mm = v.replace(/^●/, '').trim().match(/^([A-Za-z0-9][A-Za-z0-9.\-]*)/);
            if (!mm || mm[1].length < 5) continue;
            panels.push({ pn: mm[1], chosen: chosen, inch: String((aoa[r] || [])[0] || '').trim() });
        }
        if (!panels.length) continue;
        var sp = _splitName(nm);
        items.push({ name: nm, customer: sp.customer, model: sp.model, panels: panels });
    }
    _cacheSet({ mtime: hit.mtime, file: hit.name, items: items });
    console.log('[프로젝트 사전] ' + items.length + '개 / 패널 ' +
                items.reduce(function (s, x) { return s + x.panels.length; }, 0) + '건 — ' + hit.name);
    return items;
};

/** 캐시만 — 네트워크를 안 탄다(동기 호출부에서 쓴다) */
window._ppCached = function () { var c = _cacheGet(); return (c && c.items) || []; };

/** 고객사 이름 목록 — 백로그 취합(js/44)의 사전을 보강한다 */
window._ppCustomers = function () {
    var out = {};
    window._ppCached().forEach(function (p) { if (p.customer) out[_norm(p.customer)] = p.customer; });
    return out;
};

// ── 🔎 본문 → 프로젝트 추정 ───────────────────────────────────────────
/**
 * 제목/본문에서 사전의 프로젝트를 찾는다. 결정론만 쓴다(AI 호출 없음).
 * 근거는 셋: ① 모델명 토큰 ② 패널 PN ③ 고객사+인치.
 * ⚠️ 고객사만 맞는 건 근거로 치지 않는다 — LNW 하나가 18개 중 16개라 변별력이 없다.
 */
window._ppMatchText = function (text) {
    var hayRaw = String(text || '');
    var hay = _norm(hayRaw);
    if (hay.length < 6) return null;
    var best = null;
    window._ppCached().forEach(function (p) {
        var score = 0, why = [];
        // ① 모델명 통째 — "K_27" 은 토큰으로 쪼개면 K(1) + 27(2) 둘 다 3글자 미만이라 전부 탈락한다.
        //    그런데 정규화하면 "K27"이고 본문의 "LNW K27 iDeck"에 그대로 들어 있다.
        //    (실측: 이 케이스를 놓쳐서 추가함)
        var whole = _norm(p.model);
        if (whole.length >= 3 && hay.indexOf(whole) !== -1) {
            score += 10; why.push(_t('모델명 일치', 'model match'));
        } else {
            // ①-2 토큰별 — "COSMIC UP" 처럼 여러 낱말인 경우. 3글자 이상 토큰만 본다.
            var toks = String(p.model || '').split(/\s+/).map(_norm).filter(function (t) { return t.length >= 3; });
            var hitToks = toks.filter(function (t) { return hay.indexOf(t) !== -1; });
            if (toks.length && hitToks.length === toks.length) { score += 10; why.push(_t('모델명 전체 일치', 'full model match')); }
            else if (hitToks.length) { score += 4 * hitToks.length; why.push(hitToks.join('+')); }
        }
        // ② 패널 PN — 가장 강한 근거다(그 프로젝트 전용인 경우가 많다)
        var pnHit = p.panels.filter(function (x) { return hay.indexOf(_norm(x.pn)) !== -1; });
        if (pnHit.length) { score += 8 * pnHit.length; why.push(_t('패널 ', 'panel ') + pnHit[0].pn); }
        // ③ 고객사는 **단독으로는 점수를 주지 않는다** — 위에서 뭔가 걸렸을 때만 가산
        if (score > 0 && p.customer && hay.indexOf(_norm(p.customer)) !== -1) {
            score += 2; why.push(p.customer);
        }
        if (score > 0 && (!best || score > best.score)) best = { project: p, score: score, why: why };
    });
    // 근거가 하나뿐이고 약하면(토큰 1개) 버린다 — 틀린 제안이 맞는 제안보다 해롭다
    return (best && best.score >= 8) ? best : null;
};

// ── 📋 목록에서 고르기 (마법사 pre-fill) ──────────────────────────────
window._ppOpenPicker = async function (onPick) {
    var m = document.getElementById('pp-pick-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'pp-pick-modal';
        m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9610; pointer-events:none;';
        m.innerHTML =
          '<div id="pp-pick-box" onclick="event.stopPropagation()" style="pointer-events:auto; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);'
        + ' background:#fff; border-radius:10px; width:var(--modal-w-md, 620px); max-width:94vw; max-height:84vh; display:flex; flex-direction:column;'
        + ' box-shadow:0 8px 32px rgba(0,0,0,0.22); overflow:hidden; min-width:360px; min-height:300px;">'
        + '  <div id="pp-pick-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff;'
        + '       border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">'
        + '    <span>🏷 <span>' + _t('사내 프로젝트 목록', 'In-house project list') + '</span></span>'
        + '    <button onclick="document.getElementById(\'pp-pick-modal\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
        + '       border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; display:flex; align-items:center; justify-content:center;">✕</button>'
        + '  </div>'
        + '  <div style="padding:8px 14px; border-bottom:1px solid #eee; display:flex; gap:8px; align-items:center;">'
        + '    <input id="pp-pick-q" type="text" placeholder="' + _t('이름·패널 PN으로 검색', 'search by name or panel PN') + '" style="flex:1; padding:5px 9px; border:1px solid #ccc; border-radius:6px; font-size:12px;">'
        + '    <button onclick="window._ppRefresh()" title="' + _t('엑셀에서 다시 읽기', 'Reload from Excel') + '" style="padding:5px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11.5px; cursor:pointer;">↻</button>'
        + '  </div>'
        + '  <div id="pp-pick-body" style="overflow:auto; flex:1; background:#fafafa;"></div>'
        + '  <div id="pp-pick-foot" style="padding:8px 14px; border-top:1px solid #eee; font-size:11px; color:#888;"></div>'
        + '</div>';
        document.body.appendChild(m);
        if (window._makeDraggable) window._makeDraggable('pp-pick-box', 'pp-pick-drag');
        if (window._bindClickToFront) window._bindClickToFront('pp-pick-modal');
        document.getElementById('pp-pick-q').addEventListener('input', _ppRender);
        document.getElementById('pp-pick-body').addEventListener('click', function (e) {
            var row = e.target.closest ? e.target.closest('.pp-row') : null;
            if (!row) return;
            var p = (window._ppCached() || [])[Number(row.dataset.i)];
            if (!p) return;
            document.getElementById('pp-pick-modal').style.display = 'none';
            if (window._ppOnPick) window._ppOnPick(p);
        });
    }
    window._ppOnPick = onPick;
    m.style.display = 'block';
    if (window.bringModalToFront) window.bringModalToFront('pp-pick-modal');
    document.getElementById('pp-pick-q').value = '';
    document.getElementById('pp-pick-body').innerHTML =
        '<div style="padding:20px; color:#888; font-size:12px;">⏳ ' + _t('엑셀을 읽는 중…', 'Reading the Excel…') + '</div>';
    try { await window._ppLoad(); _ppRender(); }
    catch (e) {
        document.getElementById('pp-pick-body').innerHTML =
            '<div style="padding:18px; font-size:12.5px; color:#8a4b00; background:#fff8e6; border:1px solid #ffe08a; border-radius:8px; margin:12px; line-height:1.7;">⚠️ '
            + _esc(e.message) + '</div>';
    }
};

window._ppRefresh = async function () {
    document.getElementById('pp-pick-body').innerHTML =
        '<div style="padding:20px; color:#888; font-size:12px;">⏳ ' + _t('다시 읽는 중…', 'Reloading…') + '</div>';
    try { await window._ppLoad(true); _ppRender(); }
    catch (e) { if (window.showToast) window.showToast('❌ ' + e.message, 'error', 7000); }
};

function _ppRender() {
    var q = _norm((document.getElementById('pp-pick-q') || {}).value || '');
    var all = window._ppCached();
    var body = document.getElementById('pp-pick-body');
    var rows = all.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) {
        if (!q) return true;
        if (_norm(x.p.name).indexOf(q) !== -1) return true;
        return x.p.panels.some(function (pn) { return _norm(pn.pn).indexOf(q) !== -1; });
    });
    body.innerHTML = rows.length ? rows.map(function (x) {
        var p = x.p;
        var picked = p.panels.filter(function (y) { return y.chosen; });
        return '<div class="pp-row" data-i="' + x.i + '" style="padding:8px 13px; border-bottom:1px solid #f0f0f0; background:#fff; cursor:pointer;">'
            + '<div style="font-size:12.5px; font-weight:bold; color:#1a4f7a;">' + _esc(p.name) + '</div>'
            + '<div style="font-size:11px; color:#777; margin-top:2px;">'
            + (p.customer ? _t('고객사 ', 'customer ') + _esc(p.customer) + ' · ' : '')
            + _t('패널 ', 'panels ') + p.panels.length + _t('개', '')
            + (picked.length ? ' · ● ' + _esc(picked.map(function (y) { return y.pn; }).slice(0, 3).join(', ')) : '')
            + '</div></div>';
    }).join('') : '<div style="padding:20px; color:#999; font-size:12px;">' + _t('없습니다.', 'No match.') + '</div>';
    document.getElementById('pp-pick-foot').textContent =
        _t(rows.length + ' / ' + all.length + '개 — 고르면 새 프로젝트 입력칸이 채워집니다',
           rows.length + ' / ' + all.length + ' — picking one fills the wizard');
}

// ── 시작 시 캐시만 조용히 준비 ────────────────────────────────────────
//    ⚠️ 실패해도 아무 말 하지 않는다 — 저장소 미설정·백엔드 미기동은 흔한 상태이고,
//    이 사전이 없다고 앱이 못 쓰는 건 아니다.
setTimeout(function () {
    if (!window._dsList) return;
    window._ppLoad().catch(function (e) { console.debug('[프로젝트 사전] 준비 건너뜀:', e && e.message); });
}, 6000);

})();
