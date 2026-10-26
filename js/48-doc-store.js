/* ================================================================
   48-doc-store.js
   📁 문서 저장소 — 사내 네트워크 공유(UNC)를 앱에서 쓰기
   ================================================================
   · 왜: 사양서 PDF·사진을 Google Drive에 쌓으면 용량이 걱정된다는 요청.
     사내 공유에 패널 SPEC이 이미 PN 파일명으로 정리돼 있어서(실측 평균 1.5MB/건),
     거기 그대로 두면 용량 문제도 없고 팀 공유도 이미 된다.
   · ⚠️ 브라우저는 UNC(\\서버\공유)를 직접 못 읽는다(Chrome 차단). 로컬 백엔드(5000)가
     중계한다 — 엔드포인트는 kortek_backend.py의 /doc/* (경로·폴더는 거기 설정 파일에).
   · 텍스트 추출은 **여기(브라우저)** 가 한다 — pdf.js·XLSX가 이미 있고, 백엔드에 PDF
     라이브러리를 새로 깔면 팀원 PC마다 설치 부담이 생긴다. 추출기는 js/42의 것을 그대로
     쓴다(window._pxExtractText) — 복제하면 "여기선 읽히는데 저기선 안 읽힌다"로 갈라진다.
   ----------------------------------------------------------------
   · window._dsOpenSettings()        저장소 설정(경로·폴더)
   · window._dsOpenPicker(opts)      공유에서 파일 고르기
   · window._dsFileOf(folder,name)   공유 파일 → File 객체(기존 불러오기 경로에 그대로 투입)
   · window._dsTextOf(folder,name)   추출 텍스트(캐시 우선, 없으면 뽑아서 캐시에 저장)
   · window._dsOpenPanelSpec(pn)     패널 PN으로 사양서 찾아 열기
   · window._dsScanNew(folder)       마지막 확인 이후 새로 들어온 파일(자동 등록용)
================================================================ */

(function () {
'use strict';

var _en = function () { return window._currentLang === 'en'; };
var _t  = function (ko, en) { return _en() ? en : ko; };
var DS  = 'http://127.0.0.1:5000';
var LAST_SEEN_KEY = 'gantt_docstore_last_seen_v1';   // { folder: ISO }

function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _toast(msg, kind, ms) {
    if (window.showToast) window.showToast(msg, kind || 'info', ms || 4000);
    else console.log('[문서저장소]', msg);
}
function _kb(n) {
    n = Number(n) || 0;
    return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
}

// ── 백엔드 호출 ───────────────────────────────────────────────────────
//    ⚠️ 백엔드가 꺼져 있을 수 있다 — 실패를 "빈 결과"로 삼키지 않고 사유를 그대로 올린다.
async function _api(path, opts) {
    var res;
    try {
        res = await fetch(DS + path, Object.assign({ signal: AbortSignal.timeout(30000) }, opts || {}));
    } catch (e) {
        throw new Error(_t('로컬 백엔드(127.0.0.1:5000)에 연결할 수 없습니다 — 실행 중인지 확인해주세요.',
                           'Cannot reach the local backend (127.0.0.1:5000) — is it running?'));
    }
    var j = null;
    try { j = await res.json(); } catch (e) { /* 바이너리 응답 */ }
    // 🐛 [2026-10-22, 사용자 제보] 화면에 "HTTP 404"만 떠서 뭘 해야 할지 알 수 없었다.
    //    /doc/* 에서 404는 거의 항상 **백엔드가 옛 버전**이라는 뜻이다(연결은 됐는데 라우트가 없음).
    //    연결 실패(위 catch)와는 원인도 조치도 다르므로 갈라서 알려준다.
    if (res.status === 404 && !(j && j.error)) {
        throw new Error(_t(
            '백엔드에 이 기능이 없습니다 — 실행 중인 백엔드가 옛 버전입니다. 백엔드를 재시작해주세요.',
            'The backend does not have this endpoint — it is running an older version. Please restart it.'));
    }
    if (!res.ok || (j && j.ok === false)) throw new Error((j && j.error) || ('HTTP ' + res.status));
    return j;
}

window._dsConfig = function () { return _api('/doc/config'); };
window._dsList   = function (folder, since) {
    return _api('/doc/list?folder=' + encodeURIComponent(folder) + (since ? '&since=' + encodeURIComponent(since) : ''));
};

/** 공유 파일을 File 객체로 — 기존 불러오기 경로(pageExcelImport 등)에 그대로 넣을 수 있다 */
window._dsFileOf = async function (folder, name) {
    var url = DS + '/doc/get?folder=' + encodeURIComponent(folder) + '&name=' + encodeURIComponent(name);
    var res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) {
        var msg = '';
        try { msg = (await res.json()).error; } catch (e) { /* ignore */ }
        throw new Error(msg || ('파일을 받지 못했습니다 (HTTP ' + res.status + ')'));
    }
    return new File([await res.blob()], name);
};

/** 그 파일을 여는 주소 — `<a href>`에 그대로 박을 수 있다(클릭 시점에 찾지 않아도 되게) */
window._dsFileUrl = function (folder, name) {
    return DS + '/doc/get?folder=' + encodeURIComponent(folder) + '&name=' + encodeURIComponent(name);
};

/** 브라우저에서 바로 열기(PDF 뷰어 등) — 받아서 여는 게 아니라 백엔드 URL을 그대로 연다 */
window._dsOpenInNewTab = function (folder, name) {
    window.open(window._dsFileUrl(folder, name), '_blank');
};

/**
 * 추출 텍스트 — 캐시에 있으면 그걸 쓰고, 없으면 원본을 받아 뽑은 뒤 캐시에 넣는다.
 * 캐시는 공유에 있으므로 **팀원 중 한 사람만 뽑으면 나머지는 그냥 받아 쓴다.**
 */
window._dsTextOf = async function (folder, name, onStep) {
    try {
        var hit = await _api('/doc/text?folder=' + encodeURIComponent(folder) + '&name=' + encodeURIComponent(name));
        if (hit && hit.text) return hit.text;
    } catch (e) { /* no_cache — 아래에서 뽑는다 */ }

    if (onStep) onStep(_t('원본을 받는 중…', 'Downloading…'));
    var file = await window._dsFileOf(folder, name);
    if (typeof window._pxExtractText !== 'function') {
        throw new Error(_t('텍스트 추출기를 불러오지 못했습니다(js/42).', 'Text extractor not loaded (js/42).'));
    }
    if (onStep) onStep(_t('글자를 뽑는 중…', 'Extracting text…'));
    var wb = null;
    if (/\.(xlsx|xls|csv)$/i.test(name) && window.XLSX) {
        try { wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' }); } catch (e) { /* ignore */ }
    }
    var text = await window._pxExtractText(file, wb);
    if (!String(text || '').trim()) throw new Error(_t('읽을 글자가 없습니다(스캔 이미지일 수 있습니다).', 'No readable text (may be a scanned image).'));

    // 캐시 저장 실패는 치명적이지 않다 — 이번엔 그냥 쓰고 다음에 다시 시도한다
    try {
        await _api('/doc/text', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: folder, name: name, text: text })
        });
    } catch (e) { console.warn('[문서저장소] 텍스트 캐시 저장 실패(무시):', e.message); }
    return text;
};

/** 업로드 — 같은 이름이 있으면 백엔드가 409로 막는다(팀 공유라 조용히 덮으면 복구가 어렵다) */
window._dsPut = async function (folder, file, overwrite) {
    if (window._dsInvalidateList) window._dsInvalidateList(folder);   // 방금 올린 파일이 바로 보이게
    var fd = new FormData();
    fd.append('file', file, file.name);
    var url = '/doc/put?folder=' + encodeURIComponent(folder) + '&name=' + encodeURIComponent(file.name)
            + (overwrite ? '&overwrite=1' : '');
    return _api(url, { method: 'POST', body: fd });
};

// ── 🔎 패널 PN → 사양서 ───────────────────────────────────────────────
//    파일명이 곧 패널 PN이라(DV320FHM-NN0.pdf, LC430EQZ-SHM1.pdf) 따로 색인이 필요 없다.
//    표기 차이(점·하이픈·공백·대소문자)는 무시하고 맞춘다 — "G101EVN01.0" ↔ "G101EVN010".
function _pnKey(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

// 📄 패널 데이터시트·비교표가 있는 폴더. 2026-10-22에 사람이 루트 `PANEL\` 을 `PARTS\PANEL\`
//    안으로 옮겼다 — js/23 `ELEC_CATEGORY_META['PANEL'].nasFull` 과 js/49 `PP_FOLDER` 도 같은 값.
var PANEL_FOLDER = 'PARTS/PANEL';
window._dsPanelFolder = function () { return PANEL_FOLDER; };

// ── 📌 프로젝트별 하위 폴더 (2026-10-26) ────────────────────────────────
//    메일(MAIL/<프로젝트>)처럼, 나머지 자료실 폴더(CUSTOMER·MC·SUMMARY 등)도 지금 열린
//    프로젝트 이름으로 한 단계 하위 폴더를 쓴다. 백엔드는 이미 1단계 하위 폴더를 허용하므로
//    (2026-10-22, PARTS/<구분>용 `_docstore_folder_segs`) 백엔드는 그대로 두고 프런트에서
//    기본 폴더와 탭만 바꾼다.
//    ⚠️ 이미 하위 폴더가 있는 베이스(PARTS/<구분> 등)에는 적용하지 않는다 — 백엔드가 2단계까지만
//    허용해서 `PARTS/<구분>/<프로젝트>`(3단계)는 거부당한다.
var _NAS_PROJ_BAD = '/:*?"<>|' + String.fromCharCode(92);
window._dsCurrentProjectFolderName = function () {
    var raw = String(window.currentDriveFileName || '').replace(/\.json$/i, '').trim();
    if (!raw) return null;
    var safe = raw.split('').map(function (ch) { return _NAS_PROJ_BAD.indexOf(ch) === -1 ? ch : ' '; })
        .join('').replace(/ +/g, ' ').trim();
    return safe || null;
};

/** baseFolder가 아직 하위 폴더를 쓰지 않을 때만 탭을 만든다. 아니면 null
 *  (null이면 부르는 쪽이 기존 동작 그대로 — 탭 없이 baseFolder 하나).
 *  categories를 주면(예: Customer SPEC의 ELECTRICAL/MECHANICAL) 프로젝트 폴더 아래 그 구분별
 *  탭을 만들고, 안 주면 프로젝트 폴더 탭 하나만 만든다. 어느 쪽이든 끝에 "전체" 탭을 더한다. */
window._dsProjectAwareFolders = function (baseFolder, categories) {
    if (!baseFolder || baseFolder.indexOf('/') !== -1) return null;
    var proj = window._dsCurrentProjectFolderName();
    if (!proj) return null;
    var tabs = (categories && categories.length)
        ? categories.map(function (c) { return { f: baseFolder + '/' + proj + '/' + c.f, label: c.label }; })
        : [{ f: baseFolder + '/' + proj, label: '📌 ' + proj }];
    tabs.push({ f: baseFolder, label: '📁 ' + baseFolder + ' (' + _t('전체', 'all') + ')' });
    return tabs;
};

// 📋 폴더 목록 짧은 캐시 — 같은 폴더를 연달아 묻는 화면용.
//    ⚠️ NAS 목록은 네트워크 왕복이다. 백엔드를 고쳐 198개가 0.04초로 내려왔지만(2026-10-22,
//    그전엔 7초), 그래도 그릴 때마다 부를 이유는 없다. 올리기·이식 직후엔 _dsInvalidateList 로 버린다.
var _DS_LIST_TTL = 60000;
var _dsListCache = {};
async function _dsListCached(folder) {
    var hit = _dsListCache[folder];
    if (hit && (Date.now() - hit.at) < _DS_LIST_TTL) return hit.data;
    var data = await window._dsList(folder);
    _dsListCache[folder] = { at: Date.now(), data: data };
    return data;
}
window._dsInvalidateList = function (folder) {
    if (folder) delete _dsListCache[folder]; else _dsListCache = {};
};

window._dsFindPanelSpec = async function (pn, folder) {
    folder = folder || PANEL_FOLDER;
    var key = _pnKey(pn);
    if (key.length < 4) return null;                  // 너무 짧으면 아무거나 걸린다
    var j = await window._dsList(folder);
    var files = (j && j.files) || [];
    var exact = null, partial = null;
    files.forEach(function (f) {
        var fk = _pnKey(f.name.replace(/\.[^.]+$/, ''));
        if (fk === key) exact = f;
        else if (!partial && (fk.indexOf(key) !== -1 || key.indexOf(fk) !== -1)) partial = f;
    });
    return exact || partial;
};

/**
 * 여러 패널 PN의 사양서를 **한 번의 목록 조회**로 찾는다 → { PN: 파일명 }.
 * 비교표 머리글 10칸마다 _dsFindPanelSpec 을 부르면 같은 목록을 10번 받는다.
 * 백엔드가 꺼져 있거나 폴더가 없으면 **빈 객체** — 부르는 쪽이 기본 링크로 떨어지게 한다.
 */
window._dsFindPanelSpecs = async function (pns, folder) {
    folder = folder || PANEL_FOLDER;
    var out = {};
    var list;
    // 비교표는 뷰 전환·언어 전환·이식 직후마다 다시 그려진다 — 그때마다 같은 목록을 받지 않게
    // 짧게 들고 있는다. 파일 고르기 창(_dsList 직접 호출)은 캐시를 안 타므로 늘 최신이다.
    try { list = await _dsListCached(folder); } catch (e) { return out; }
    var files = (list && list.files) || [];
    var byKey = {};
    files.forEach(function (f) {
        var fk = _pnKey(f.name.replace(/\.[^.]+$/, ''));
        if (fk && !byKey[fk]) byKey[fk] = f.name;
    });
    var keys = Object.keys(byKey);
    (pns || []).forEach(function (pn) {
        var key = _pnKey(pn);
        if (key.length < 4) return;
        if (byKey[key]) { out[pn] = byKey[key]; return; }
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf(key) !== -1 || key.indexOf(keys[i]) !== -1) { out[pn] = byKey[keys[i]]; return; }
        }
    });
    return out;
};

window._dsOpenPanelSpec = async function (pn) {
    try {
        var hit = await window._dsFindPanelSpec(pn);
        if (!hit) {
            _toast(_t('"' + pn + '" 사양서를 NAS에서 찾지 못했습니다.', 'No spec found for "' + pn + '".'), 'error');
            return false;
        }
        window._dsOpenInNewTab(PANEL_FOLDER, hit.name);
        return true;
    } catch (e) {
        _toast('❌ ' + e.message, 'error', 7000);
        return false;
    }
};

// ── 🆕 공유에 새로 들어온 파일 (자동 등록) ─────────────────────────────
function _lastSeen() { try { return JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || '{}'); } catch (e) { return {}; } }
function _setLastSeen(folder, iso) {
    var m = _lastSeen(); m[folder] = iso;
    try { localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
}

/** 마지막 확인 이후 새로 들어온 파일 목록. mark=true면 "봤다"고 기록한다. */
window._dsScanNew = async function (folder, mark) {
    var since = _lastSeen()[folder] || '';
    var j = await window._dsList(folder, since);
    var files = (j && j.files) || [];
    if (mark) _setLastSeen(folder, new Date().toISOString());
    return files;
};

// ── ⚙️ 설정 ───────────────────────────────────────────────────────────
window._dsOpenSettings = async function () {
    var m = document.getElementById('ds-cfg-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'ds-cfg-modal';
        m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9550; pointer-events:none;';
        m.innerHTML =
          '<div id="ds-cfg-box" onclick="event.stopPropagation()" style="pointer-events:auto; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);'
        + ' background:#fff; border-radius:10px; width:var(--modal-w-md, 620px); max-width:94vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); overflow:hidden; min-width:360px; min-height:240px;">'
        + '  <div id="ds-cfg-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff;'
        + '       border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">'
        + '    <span>📁 <span>' + _t('NAS 문서 저장소 설정', 'NAS document store settings') + '</span></span>'
        + '    <button onclick="document.getElementById(\'ds-cfg-modal\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
        + '       border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; display:flex; align-items:center; justify-content:center;">✕</button>'
        + '  </div>'
        + '  <div style="padding:16px 18px;">'
        + '    <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:5px;">' + _t('NAS 경로', 'NAS path') + '</div>'
        + '    <input id="ds-cfg-root" type="text" placeholder="\\\\서버\\공유\\...\\SPEC" style="width:100%; box-sizing:border-box; padding:8px 11px; border:1.5px solid #a5c8f0; border-radius:7px; font-size:12.5px; font-family:monospace;">'
        + '    <div style="font-size:11px; color:#888; margin-top:4px; line-height:1.6;">'
        + _t('이 PC에서 탐색기로 열리는 경로여야 합니다. 브라우저가 아니라 <b>로컬 백엔드</b>가 읽습니다.',
             'Must be reachable from this PC. The <b>local backend</b> reads it, not the browser.') + '</div>'
        + '    <div style="font-size:12px; font-weight:bold; color:#333; margin:14px 0 5px;">' + _t('폴더 (쉼표로 구분)', 'Folders (comma separated)') + '</div>'
        + '    <input id="ds-cfg-folders" type="text" placeholder="PANEL, CUSTOMER, PARTS, MC" style="width:100%; box-sizing:border-box; padding:8px 11px; border:1.5px solid #a5c8f0; border-radius:7px; font-size:12.5px;">'
        + '    <div style="font-size:11px; color:#888; margin-top:4px;">'
        + _t('사진 등 새 분류가 필요하면 여기에 이름만 추가하면 됩니다(폴더는 자동 생성).',
             'Add a name here for new categories such as photos (folders are created automatically).') + '</div>'
        + '    <div id="ds-cfg-status" style="margin-top:12px; font-size:11.5px; color:#555; min-height:18px;"></div>'
        + '  </div>'
        + '  <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px; justify-content:flex-end;">'
        + '    <button onclick="window._dsCfgTest()" style="padding:6px 14px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; cursor:pointer;">🔌 ' + _t('연결 확인', 'Test') + '</button>'
        + '    <button onclick="window._dsCfgSave()" style="padding:6px 16px; background:#28a745; color:#fff; border:none; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">' + _t('저장', 'Save') + '</button>'
        + '  </div>'
        + '</div>';
        document.body.appendChild(m);
        if (window._makeDraggable) window._makeDraggable('ds-cfg-box', 'ds-cfg-drag');
        if (window._bindClickToFront) window._bindClickToFront('ds-cfg-modal');
    }
    m.style.display = 'block';
    if (window.bringModalToFront) window.bringModalToFront('ds-cfg-modal');
    try {
        var c = await window._dsConfig();
        document.getElementById('ds-cfg-root').value = c.root || '';
        document.getElementById('ds-cfg-folders').value = (c.folders || []).join(', ');
        document.getElementById('ds-cfg-status').innerHTML = c.configured
            ? (c.reachable ? '<span style="color:#1f7a3d;">✅ ' + _t('연결됨', 'Connected') + '</span>'
                           : '<span style="color:#c00;">⚠️ ' + _t('경로에 접근할 수 없습니다(사내망/권한 확인)', 'Path unreachable') + '</span>')
            : '<span style="color:#888;">' + _t('아직 설정되지 않았습니다.', 'Not configured yet.') + '</span>';
    } catch (e) {
        document.getElementById('ds-cfg-status').innerHTML = '<span style="color:#c00;">❌ ' + _esc(e.message) + '</span>';
    }
};

window._dsCfgTest = async function () {
    var el = document.getElementById('ds-cfg-status');
    el.textContent = '⏳ ' + _t('확인 중…', 'Testing…');
    try {
        await window._dsCfgSave(true);
        var c = await window._dsConfig();
        if (!c.reachable) { el.innerHTML = '<span style="color:#c00;">⚠️ ' + _t('경로에 접근할 수 없습니다.', 'Path unreachable.') + '</span>'; return; }
        var lines = [];
        for (var i = 0; i < (c.folders || []).length; i++) {
            try { var j = await window._dsList(c.folders[i]); lines.push(c.folders[i] + ' ' + j.count + _t('개', '')); }
            catch (e) { lines.push(c.folders[i] + ' ❌'); }
        }
        el.innerHTML = '<span style="color:#1f7a3d;">✅ ' + _t('연결됨 — ', 'Connected — ') + _esc(lines.join(' · ')) + '</span>';
    } catch (e) {
        el.innerHTML = '<span style="color:#c00;">❌ ' + _esc(e.message) + '</span>';
    }
};

window._dsCfgSave = async function (quiet) {
    var root = (document.getElementById('ds-cfg-root').value || '').trim();
    var folders = (document.getElementById('ds-cfg-folders').value || '').split(',')
        .map(function (s) { return s.trim(); }).filter(Boolean);
    var r = await _api('/doc/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: root, folders: folders })
    });
    if (!quiet) _toast('✅ ' + _t('저장했습니다.', 'Saved.'), 'info');
    return r;
};

// ── 📂 파일 고르기 ────────────────────────────────────────────────────
//    opts: { folder, onPick(folder,name), title, newOnly }
var _dsPick = null;

window._dsOpenPicker = async function (opts) {
    _dsPick = opts || {};
    window._dsPickLast = _dsPick;   // ↻ 다시 시도에서 같은 조건(onPick 포함)으로 재진입
    var m = document.getElementById('ds-pick-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'ds-pick-modal';
        m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9560; pointer-events:none;';
        m.innerHTML =
          '<div id="ds-pick-box" onclick="event.stopPropagation()" style="pointer-events:auto; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);'
        + ' background:#fff; border-radius:10px; width:var(--modal-w-lg, 760px); max-width:94vw; max-height:84vh; display:flex; flex-direction:column;'
        + ' box-shadow:0 8px 32px rgba(0,0,0,0.22); overflow:hidden; min-width:400px; min-height:320px;">'
        + '  <div id="ds-pick-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff;'
        + '       border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">'
        + '    <span>📂 <span id="ds-pick-title">' + _t('NAS에서 파일 고르기', 'Pick a file from the NAS') + '</span></span>'
        + '    <button onclick="document.getElementById(\'ds-pick-modal\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
        + '       border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; display:flex; align-items:center; justify-content:center;">✕</button>'
        + '  </div>'
        + '  <div style="padding:9px 14px; border-bottom:1px solid #eee; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">'
        // 구분이 13개라 한 줄에 안 들어간다 — 줄바꿈시키고, 모달 안 다른 버튼과 같은 꼴로 보인다.
        + '    <span id="ds-pick-tabs" style="display:flex; gap:5px; flex-wrap:wrap; row-gap:5px; flex:1 1 100%;"></span>'
        + '    <input id="ds-pick-q" type="text" placeholder="' + _t('이름으로 검색', 'Search by name') + '" style="flex:1; min-width:140px; padding:5px 9px; border:1px solid #ccc; border-radius:6px; font-size:12px;">'
        + '    <button onclick="window._dsPickNewFolder()" title="' + _t('지금 보고 있는 폴더 안에 새 폴더를 만듭니다', 'Create a new folder inside the one shown') + '" style="padding:5px 9px; background:#fff7e6; color:#8a6300; border:1px solid #ffe08a; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer; white-space:nowrap;">📁+ ' + _t('새 폴더', 'New folder') + '</button>'
        // ⬆ 는 지금 폴더로, ▾ 는 다른 페이지 폴더를 골라서 — 탭을 옮기지 않고 넣을 수 있게.
        + '    <span style="position:relative; display:inline-flex;">'
        + '      <button onclick="window._dsPickUpload()" title="' + _t('지금 보고 있는 폴더에 올립니다', 'Upload to the folder shown') + '" style="padding:5px 9px 5px 11px; background:#eaf7ea; color:#1f6a3a; border:1px solid #a8dab8; border-right:none; border-radius:6px 0 0 6px; font-size:11.5px; font-weight:bold; cursor:pointer;">⬆ ' + _t('올리기', 'Upload') + '</button>'
        + '      <button onclick="window._dsToggleUploadMenu(event)" title="' + _t('다른 폴더에 올리기', 'Upload to another folder') + '" style="padding:5px 7px; background:#eaf7ea; color:#1f6a3a; border:1px solid #a8dab8; border-radius:0 6px 6px 0; font-size:10px; cursor:pointer;">▾</button>'
        + '      <div id="ds-pick-upmenu" style="display:none; position:absolute; top:100%; right:0; margin-top:3px; background:#fff; border:1px solid #d7dde2; border-radius:7px; box-shadow:0 6px 18px rgba(0,0,0,0.14); padding:4px; z-index:9570; max-height:280px; overflow:auto;"></div>'
        + '    </span>'
        + '  </div>'
        // 📂 [2026-10-26] 지금 보고 있는 폴더가 탭 하나보다 더 깊을 때(사람이 NAS에서 직접 만든
        //    하위 폴더로 들어갔을 때)만 보인다 — 평소엔 탭만으로 충분하다.
        + '  <div id="ds-pick-crumb" style="display:none; padding:6px 14px; font-size:11.5px; color:#666; border-bottom:1px solid #eee; background:#fcfcfc;"></div>'
        + '  <div id="ds-pick-body" style="overflow:auto; flex:1; background:#fafafa;"></div>'
        + '  <div id="ds-pick-foot" style="padding:8px 16px; border-top:1px solid #eee; font-size:11.5px; color:#666;"></div>'
        + '</div>';
        document.body.appendChild(m);
        if (window._makeDraggable) window._makeDraggable('ds-pick-box', 'ds-pick-drag');
        if (window._bindClickToFront) window._bindClickToFront('ds-pick-modal');
        document.getElementById('ds-pick-q').addEventListener('input', function () { _dsRenderList(); });
        document.getElementById('ds-pick-body').addEventListener('click', function (e) {
            var dirRow = e.target.closest ? e.target.closest('.ds-dir-row') : null;
            if (dirRow) { window._dsPickEnterDir(dirRow.dataset.dir); return; }
            var row = e.target.closest ? e.target.closest('.ds-row') : null;
            if (!row) return;
            var name = row.dataset.name;
            if (e.target.closest('.ds-open')) { window._dsOpenInNewTab(_dsPick.folder, name); return; }
            document.getElementById('ds-pick-modal').style.display = 'none';
            if (_dsPick.onPick) _dsPick.onPick(_dsPick.folder, name);
        });
    }
    m.style.display = 'block';
    if (window.bringModalToFront) window.bringModalToFront('ds-pick-modal');
    if (_dsPick.title) document.getElementById('ds-pick-title').textContent = _dsPick.title;
    document.getElementById('ds-pick-q').value = '';

    var cfg;
    try { cfg = await window._dsConfig(); }
    catch (e) {
        // 백엔드를 켜거나 재시작한 뒤 창을 닫았다 다시 열어야만 했다 — 그 자리에서 다시 시도하게 한다
        document.getElementById('ds-pick-body').innerHTML = _dsErrHtml(e.message,
            '<button onclick="window._dsOpenPicker(window._dsPickLast)" style="margin-top:10px; padding:5px 13px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; cursor:pointer;">↻ '
            + _t('다시 시도', 'Retry') + '</button>');
        return;
    }
    if (!cfg.configured) {
        document.getElementById('ds-pick-body').innerHTML = _dsErrHtml(
            _t('문서 저장소가 아직 설정되지 않았습니다.', 'The document store is not configured yet.'),
            '<button onclick="window._dsOpenSettings()" style="margin-top:8px; padding:5px 12px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; cursor:pointer;">📁 ' + _t('설정 열기', 'Open settings') + '</button>');
        return;
    }
    // 📁 [2026-10-22] 부르는 쪽이 탭 목록을 줄 수 있다 — PARTS 탭은 부품 종류별 **하위**
    //    폴더(PARTS/PANEL …)를 쓰는데 그 이름들은 설정(cfg.folders)에 없다. 문자열과
    //    {f,label} 쌍을 둘 다 받아 {f,label}로 눕힌다(탭에 긴 경로 대신 이름을 보이게).
    _dsPick.folders = ((_dsPick.folders && _dsPick.folders.length) ? _dsPick.folders : (cfg.folders || []))
        .map(function (x) { return (typeof x === 'string') ? { f: x, label: x } : { f: x.f, label: x.label || x.f }; });
    var _fkeys = _dsPick.folders.map(function (x) { return x.f; });
    if (!_dsPick.folder || _fkeys.indexOf(_dsPick.folder) === -1) _dsPick.folder = _fkeys[0] || '';
    _dsRenderTabs();
    await _dsLoadFolder();
};

function _dsErrHtml(msg, extra) {
    return '<div style="padding:22px; font-size:12.5px; color:#8a4b00; background:#fff8e6; border:1px solid #ffe08a; border-radius:8px; margin:12px; line-height:1.7;">'
        + '⚠️ ' + _esc(msg) + (extra || '') + '</div>';
}

function _dsRenderTabs() {
    // 이름에 따옴표나 '/'가 들어와도 깨지지 않게 인자는 JSON으로 넘긴다(하위 폴더가 생겼다).
    document.getElementById('ds-pick-tabs').innerHTML = (_dsPick.folders || []).map(function (x) {
        var on = x.f === _dsPick.folder;
        return '<span class="ds-tab" data-f="' + _esc(x.f) + '" title="' + _esc(x.f) + '" onclick="window._dsPickTab(' + _esc(JSON.stringify(x.f)) + ')" style="padding:6px 10px; border-radius:6px; font-size:11.5px; font-weight:bold; white-space:nowrap; cursor:pointer; transition:background .15s; border:1px solid '
            + (on ? '#1971c2; background:#e7f3ff; color:#1971c2;' : '#d7dde2; background:#fafbfc; color:#5b6b76;') + '">' + _esc(x.label) + '</span>';
    }).join('');
}

window._dsPickTab = async function (f) { _dsPick.folder = f; _dsRenderTabs(); await _dsLoadFolder(); };

/** 폴더 행을 눌러 하위 폴더로 들어간다 — 사람이 NAS에서 직접 만든 폴더도 그대로 읽힌다. */
window._dsPickEnterDir = async function (name) {
    _dsPick.folder = (_dsPick.folder ? _dsPick.folder + '/' : '') + name;
    _dsRenderTabs();   // 탭 중 하나와 더 이상 안 맞을 수 있으니 선택 표시를 지운다
    await _dsLoadFolder();
};

/** 📂 빵부스러기(breadcrumb)에서 상위 구간을 눌러 그 자리로 돌아간다. */
window._dsPickCrumb = async function (path) {
    _dsPick.folder = path;
    _dsRenderTabs();
    await _dsLoadFolder();
};

function _dsRenderCrumb() {
    var el = document.getElementById('ds-pick-crumb');
    if (!el) return;
    var segs = String(_dsPick.folder || '').split('/').filter(Boolean);
    // 탭 하나가 이미 전체 경로를 보여주므로, 1~2단계(폴더 자신 혹은 그 바로 아래)까지는 굳이 안 보인다.
    if (segs.length <= 2) { el.style.display = 'none'; el.innerHTML = ''; return; }
    var acc = '', parts = [];
    segs.forEach(function (s, i) {
        acc = acc ? (acc + '/' + s) : s;
        var last = (i === segs.length - 1);
        parts.push(last
            ? '<span style="color:#555; font-weight:bold;">' + _esc(s) + '</span>'
            : '<span onclick="window._dsPickCrumb(' + _esc(JSON.stringify(acc)) + ')" style="cursor:pointer; color:#1971c2; text-decoration:underline;">' + _esc(s) + '</span>');
    });
    el.style.display = 'block';
    el.innerHTML = '📂 ' + parts.join('<span style="color:#aaa; margin:0 3px;">/</span>');
}

/** 지금 보고 있는 폴더 안에 하위 폴더를 만든다 — 만들고 나면 그 폴더는 ⬆ 올리기·파일 넣기 대상이 된다. */
window._dsPickNewFolder = async function () {
    var name = (prompt(_t('새 폴더 이름을 입력하세요.', 'Enter the new folder name.')) || '').trim();
    if (!name) return;
    try {
        await _api('/doc/mkdir', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder: _dsPick.folder, name: name })
        });
        if (window._dsInvalidateList) window._dsInvalidateList(_dsPick.folder);
        await _dsLoadFolder();
    } catch (e) { _toast('❌ ' + e.message, 'error', 6000); }
};

async function _dsLoadFolder() {
    var body = document.getElementById('ds-pick-body');
    body.innerHTML = '<div style="padding:20px; color:#888; font-size:12px;">⏳ ' + _t('목록을 받는 중…', 'Loading…') + '</div>';
    try {
        var j = await window._dsList(_dsPick.folder);
        _dsPick.files = j.files || [];
        _dsPick.dirs = j.dirs || [];
        _dsRenderCrumb();
        _dsRenderList();
    } catch (e) { body.innerHTML = _dsErrHtml(e.message); }
}

function _dsRenderList() {
    var q = (document.getElementById('ds-pick-q').value || '').trim().toLowerCase();
    var dirs = (_dsPick.dirs || []).filter(function (d) { return !q || d.name.toLowerCase().indexOf(q) !== -1; });
    var files = (_dsPick.files || []).filter(function (f) { return !q || f.name.toLowerCase().indexOf(q) !== -1; });
    var body = document.getElementById('ds-pick-body');
    var html = dirs.map(function (d) {
        // 📁 사람이 NAS에서 직접 만든 폴더 — 앱이 미리 아는 이름이 아니어도 그대로 보여주고 들어갈 수 있다.
        return '<div class="ds-dir-row" data-dir="' + _esc(d.name) + '" style="display:flex; align-items:center; gap:8px; padding:6px 12px; border-bottom:1px solid #f0f0f0; background:#f3f8ff; cursor:pointer;">'
            + '<span style="font-size:13px;">📁</span>'
            + '<span style="flex:1; min-width:0; font-size:12px; font-weight:bold; color:#1971c2; overflow-wrap:anywhere;">' + _esc(d.name) + '</span>'
            + '<span style="font-size:11px; color:#9bb3cc; flex-shrink:0;">▸</span>'
            + '</div>';
    }).join('');
    if (!dirs.length && !files.length) {
        html += '<div style="padding:20px; color:#999; font-size:12px;">'
            + (q ? _t('검색 결과가 없습니다.', 'No match.') : _t('이 폴더에 파일이 없습니다.', 'This folder is empty.')) + '</div>';
    } else {
        html += files.map(function (f) {
            return '<div class="ds-row" data-name="' + _esc(f.name) + '" style="display:flex; align-items:center; gap:8px; padding:6px 12px; border-bottom:1px solid #f0f0f0; background:#fff; cursor:pointer;">'
                + '<span style="flex:1; min-width:0; font-size:12px; overflow-wrap:anywhere;">' + _esc(f.name) + '</span>'
                + (f.hasText ? '<span title="' + _t('텍스트 캐시 있음', 'text cached') + '" style="font-size:10px; color:#1f7a3d;">📝</span>' : '')
                + '<span style="font-size:11px; color:#aaa; flex-shrink:0;">' + _kb(f.size) + '</span>'
                + '<span style="font-size:10.5px; color:#bbb; flex-shrink:0;">' + _esc(String(f.mtime || '').slice(0, 10)) + '</span>'
                + '<button class="ds-open" title="' + _t('새 창에서 열기', 'Open in a new tab') + '" style="flex-shrink:0; background:#e8f4fd; border:1px solid #a5c8f0; color:#1a4f7a; border-radius:5px; width:24px; height:24px; padding:0; cursor:pointer; font-size:11px;">↗</button>'
                + '</div>';
        }).join('');
    }
    body.innerHTML = html;
    document.getElementById('ds-pick-foot').textContent =
        _t(_dsPick.folder + ' — 폴더 ' + dirs.length + '개 · 파일 ' + files.length + '개' + (q ? ' (검색중)' : ''),
           _dsPick.folder + ' — ' + dirs.length + ' folder(s) · ' + files.length + ' file(s)' + (q ? ' (filtered)' : ''));
}

/**
 * 파일 올리기. `folder` 를 주면 거기로, 안 주면 지금 보고 있는 탭으로.
 * ⬆ 버튼 옆 ▾ 로 **다른 페이지 폴더에 바로** 넣을 수 있다 — 탭을 옮겨 다니지 않아도 되게.
 */
window._dsPickUpload = function (folder) {
    var dest = folder || _dsPick.folder;
    var inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.onchange = async function () {
        var fs = Array.prototype.slice.call(inp.files || []);
        if (!fs.length) return;
        var ok = 0, dup = [], fail = [];
        for (var i = 0; i < fs.length; i++) {
            try { await window._dsPut(dest, fs[i]); ok++; }
            catch (e) {
                if (/이미 있습니다|already/.test(e.message)) dup.push(fs[i].name);
                else fail.push(fs[i].name + ': ' + e.message);
            }
        }
        var msg = '✅ ' + dest + ' — ' + ok + _t('개 올렸습니다', ' uploaded');
        if (dup.length) msg += ' · ' + _t('같은 이름이라 건너뜀 ' + dup.length + '개', dup.length + ' skipped (name exists)');
        if (fail.length) msg += ' · ❌ ' + fail.length;
        _toast(msg, fail.length ? 'warning' : 'info', 6000);
        if (fail.length) console.warn('[문서저장소] 업로드 실패:', fail);
        // 보고 있는 폴더에 넣었을 때만 목록을 다시 받는다(다른 폴더면 화면이 안 바뀐다).
        if (dest === _dsPick.folder) await _dsLoadFolder();
    };
    inp.click();
};

/** ⬆ 옆 ▾ — 어느 폴더에 올릴지 고르는 목록 */
window._dsToggleUploadMenu = function (ev) {
    if (ev) ev.stopPropagation();
    var m = document.getElementById('ds-pick-upmenu');
    if (!m) return;
    if (m.style.display === 'block') { m.style.display = 'none'; return; }
    var here = _dsPick.folder;
    // 지금 창의 탭 + 페이지 폴더 전부 — 창이 한 페이지 것만 보여줘도 다른 데 넣을 수 있게.
    var items = (_dsPick.folders || []).slice();
    (window._dsAllPageFolders ? window._dsAllPageFolders() : []).forEach(function (f) {
        if (!items.some(function (x) { return x.f === f.f; })) items.push(f);
    });
    m.innerHTML = items.map(function (x) {
        var on = x.f === here;
        return '<div onclick="document.getElementById(\'ds-pick-upmenu\').style.display=\'none\'; window._dsPickUpload('
            + _esc(JSON.stringify(x.f)) + ')" style="padding:6px 11px; cursor:pointer; white-space:nowrap; font-size:12px; border-radius:4px;'
            + (on ? ' font-weight:bold; color:#1f6a3a;' : ' color:#444;') + '"'
            + ' onmouseover="this.style.background=\'#f1f3f5\'" onmouseout="this.style.background=\'transparent\'">'
            + _esc(x.label) + (on ? ' ✓' : '') + '</div>';
    }).join('');
    m.style.display = 'block';
    if (!window._dsUpMenuBound) {
        window._dsUpMenuBound = true;
        document.addEventListener('click', function () {
            var mm = document.getElementById('ds-pick-upmenu');
            if (mm) mm.style.display = 'none';
        });
    }
};

/** 페이지별 자료실 폴더 전부 — 올리기 목록용(js/42 스펙 + js/53 카탈로그) */
window._dsAllPageFolders = function () {
    var out = [], seen = {};
    var add = function (f, label) {
        if (!f || seen[f]) return;
        seen[f] = true;
        out.push({ f: f, label: label || f });
    };
    (window.PAGE_EXCEL_SPECS || []).forEach(function (sp) {
        var f = sp.nasFolder;
        if (typeof f === 'function') { try { f = f(); } catch (e) { f = null; } }
        if (f) add(f);
    });
    (window.PAGE_NAS_FOLDERS || []).forEach(function (p) { add(p.folder); });
    return out;
};

/**
 * 📁 자료실로 열기 — 고르면 **새 창에서 연다**(페이지로 불러오지 않는다).
 * 되돌려 넣을 곳이 없는 페이지(캘린더·주간보고·알람)가 쓴다.
 */
window._dsOpenBrowser = function (folder, opts) {
    opts = opts || {};
    var folders = opts.folders || window._dsProjectAwareFolders(folder);
    var openFolder = (folders && folders[0] && folders[0].f) || folder;
    window._dsOpenPicker({
        folder: openFolder,
        folders: folders,
        title: opts.title || _t('NAS 자료실', 'NAS files'),
        onPick: function (f, name) { window._dsOpenInNewTab(f, name); }
    });
};

// ── 🔗 Customer SPEC 불러오기와 연결 ──────────────────────────────────
//    js/42의 pageExcelImport(id, file)가 File을 받으므로 공유 파일을 그대로 넣으면 된다.
//    💡 [2026-10-22] 페이지마다 자료가 모여 있는 폴더가 다르다 — M.C Table을 열었는데 고객 사양서
//    폴더가 뜨면 매번 탭을 옮겨야 한다. 어느 페이지가 어느 폴더를 먼저 보여줄지는 **데이터**다
//    (PAGE_EXCEL_SPECS 의 nasFolder). 없으면 CUSTOMER로 떨어지고, 창에서 탭으로 옮기면 된다.
window._dsPageFolder = function (pageId) {
    try {
        var sp = (window.PAGE_EXCEL_SPECS || []).filter(function (s) { return s.id === pageId; })[0];
        // 📁 [2026-10-22] 화면 상태에 따라 폴더가 달라지는 페이지가 있다(PARTS 탭은 지금 고른
        //    부품 종류의 하위 폴더로 들어간다) — 그래서 함수도 받는다.
        var f = sp && sp.nasFolder;
        if (typeof f === 'function') f = f();
        if (f) return f;
    } catch (e) { /* 설정이 없으면 기본값 */ }
    return 'CUSTOMER';
};

/** 고르기 창에 띄울 탭 목록 — 페이지가 정해 주면 그걸, 아니면 null(설정된 폴더 전체) */
window._dsPageFolders = function (pageId) {
    try {
        var sp = (window.PAGE_EXCEL_SPECS || []).filter(function (s) { return s.id === pageId; })[0];
        var fs = sp && sp.nasFolders;
        if (typeof fs === 'function') fs = fs();
        if (fs && fs.length) return fs;
    } catch (e) { /* 없으면 설정된 폴더로 */ }
    return null;
};

window._dsImportToPage = async function (pageId, folder) {
    var base = folder || window._dsPageFolder(pageId);
    // 페이지가 직접 탭을 정해 주면(PARTS의 부품 구분별 하위 폴더) 그걸 그대로 쓰고,
    // 아니면 지금 열린 프로젝트 이름으로 [프로젝트 탭, 전체 탭]을 만든다.
    var folders = window._dsPageFolders(pageId) || window._dsProjectAwareFolders(base);
    window._dsOpenPicker({
        folder: folder || (folders && folders[0] && folders[0].f) || base,
        folders: folders,
        title: _t('NAS에서 불러오기', 'Import from the NAS'),
        onPick: async function (f, name) {
            try {
                _toast('⏳ ' + _t('"' + name + '" 받는 중…', 'Fetching "' + name + '"…'), 'info');
                var file = await window._dsFileOf(f, name);
                if (window.pageExcelImport) await window.pageExcelImport(pageId, file);
            } catch (e) { _toast('❌ ' + e.message, 'error', 7000); }
        }
    });
};

// ── 📬 분류 확정 메일을 프로젝트 폴더로 보관 ──────────────────────────
//    ⚠️ 훅을 "배치하는 코드마다" 심지 않는다 — docs/mail-pipeline.md의 mailRaw 사고가
//    정확히 그 패턴이다(경유지가 늘 때마다 하나씩 빠뜨려 원문이 조용히 사라짐).
//    대신 _tpAppendMailSignal 하나를 감싼다: 이 함수는 "메일이 어느 프로젝트로 확정됐다"는
//    바로 그 순간에만 불리고(14c 3곳 · 15b 2곳), 새 배치 경로를 만들어도 관례상 같이 부른다.
//    키는 mailRaw.fileName — 프런트의 모든 경로가 이미 들고 다니는 유일한 식별자다.
(function () {
    var _orig = window._tpAppendMailSignal;
    if (typeof _orig !== 'function') return;     // js/26 로드 전이면 감싸지 않는다
    window._tpAppendMailSignal = function (driveFileId, task, mailRaw) {
        _orig.apply(this, arguments);   // 원래 동작이 최우선 — 여기서 실패하면 그대로 올린다
        try {
            var fn = mailRaw && mailRaw.fileName;
            if (!fn || !driveFileId) return;
            // 프로젝트 "이름"이 필요하다 — 인덱스에서 찾고, 못 찾으면 보관을 건너뛴다(추측 금지)
            Promise.resolve(window._msLoadProjectIndex ? window._msLoadProjectIndex() : [])
                .then(function (list) {
                    var hit = (list || []).filter(function (p) { return p.drive_file_id === driveFileId; })[0];
                    var proj = hit && String(hit.file_name || '').replace(/\.json$/i, '');
                    if (!proj) return;
                    return fetch(DS + '/doc/mail-assign', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileName: fn, project: proj }),
                        signal: AbortSignal.timeout(20000)
                    });
                })
                // 저장소 미설정·백엔드 미기동은 흔한 상태다 — 메일 배치를 막지 않고 조용히 넘긴다
                .catch(function (e) { console.debug('[문서저장소] 메일 보관 건너뜀:', e && e.message); });
        } catch (e) { console.debug('[문서저장소] 메일 보관 훅 오류(무시):', e); }
    };
})();

/**
 * staging 정리 — 아직 어느 큐엔가 살아 있는 메일은 넘기지 않는다.
 * 기본은 dry-run(무엇을 지울지만 확인). 실제 삭제는 apply=true.
 * ⚠️ 기간은 최후 방어선일 뿐이다. 실측에서 신규발신자 큐에 한 달 넘게 남은 메일이 있었고,
 *    "프로젝트를 나중에 만들고 과거 메일을 재분류"가 이 앱의 정상 워크플로다.
 */
/** 이 메일의 원본 .eml 이 NAS 에 보관돼 있는지 → {found, project, name, staged, size} */
window._dsMailFind = function (fileName) {
    return _api('/doc/mail-find?fileName=' + encodeURIComponent(fileName));
};
/** 보관된 .eml 을 풀어 전문 본문 + 첨부 목록을 받는다(PC에 사본을 안 만든다) */
window._dsMailParse = function (fileName) {
    return _api('/doc/mail-parse?fileName=' + encodeURIComponent(fileName));
};
/** 첨부 하나를 NAS 원본에서 바로 여는 주소 — PDF·그림은 브라우저에서 그냥 보인다 */
window._dsMailAttachUrl = function (fileName, idx) {
    return DS + '/doc/mail-attach?fileName=' + encodeURIComponent(fileName) + '&idx=' + encodeURIComponent(idx);
};

/** NAS 원본을 **그 자리에서** 아웃룩으로 — 백엔드가 연다(다운로드 사본이 안 생긴다) */
window._dsMailLaunch = function (fileName) {
    return _api('/doc/mail-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: fileName })
    });
};

/** 그 .eml 을 통째로 받는 주소 — 메일 프로그램으로 열고 싶을 때(PC에 사본이 생긴다) */
window._dsMailOpenUrl = function (fileName) {
    return DS + '/doc/mail-open?fileName=' + encodeURIComponent(fileName);
};

window._dsMailGc = async function (apply) {
    var alive = [];
    var push = function (arr, get) {
        (arr || []).forEach(function (x) { var v = get(x); if (v) alive.push(v); });
    };
    push(window._msResults, function (r) { return r.fileName; });
    try { push(JSON.parse(localStorage.getItem('ms_new_sender_queue') || '[]'), function (r) { return r.fileName; }); } catch (e) { /* ignore */ }
    try { push(JSON.parse(localStorage.getItem('ms_discard_queue') || '[]'), function (r) { return r.fileName; }); } catch (e) { /* ignore */ }
    try {
        push(window.TaskInbox && window.TaskInbox.load ? window.TaskInbox.load() : [],
             function (it) { return it.mailRaw && it.mailRaw.fileName; });
    } catch (e) { /* ignore */ }

    var r = await _api('/doc/mail-gc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alive: alive, apply: !!apply })
    });
    console.log('[문서저장소] 메일 staging 현황', r);
    _toast((apply ? '🧹 ' : '🔍 ') + _t(
        'staging ' + r.stagedTotal + '건 / ' + r.totalMB + 'MB — 큐에 살아있음 ' + r.keptAlive
            + ' · 아직 기간 내 ' + r.keptFresh + ' · ' + (apply ? '삭제 ' + r.deleted : '지울 것 ' + r.wouldDelete),
        'staging ' + r.stagedTotal + ' / ' + r.totalMB + 'MB — alive ' + r.keptAlive
            + ' · fresh ' + r.keptFresh + ' · ' + (apply ? 'deleted ' + r.deleted : 'would delete ' + r.wouldDelete)
    ), 'info', 8000);
    return r;
};

})();
