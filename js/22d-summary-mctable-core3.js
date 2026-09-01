// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 3651~4856행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 탭 · 서머리 · M.C테이블 렌더링 3/4
window._panelFlatFields = function() {
    const out = [];
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) { sec.fields.forEach(function(f) { out.push(f[0]); }); });
    return out;
};

// ─── 팀 공용 패널 스펙 라이브러리 (AddressBook/project_index.json과 동일한 Drive 위치·업서트 패턴) ───
const PANEL_LIB_FILENAME = 'PanelSpecLibrary_Shared.json';
window._panelLibFileId = null;
window.findPanelLibFile = async function(token) {
    if (window._panelLibFileId) return window._panelLibFileId;
    const folderId = await window.getOrCreateConfigFolder(token);
    const id = await window._findOrMigrateFile(token, PANEL_LIB_FILENAME, folderId);
    if (id) window._panelLibFileId = id;
    return id;
};
window._panelLibNamesMatch = function(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); };
window.findPanelInLibrary = function(lib, model) {
    // 💡 [2026-08-27] Summary 주요자재 PANEL 설명칸에 코드 유무가 오락가락해도 찾을 수 있도록,
    //    CONV/AD BD와 동일한 범용 매처(_epFlexibleFind)를 재사용한다(완전일치 우선, 실패 시 코드/이름 분리 대조).
    const panels = (lib && lib.panels) || [];
    return window._epFlexibleFind(
        panels, model,
        function(p) { return p.model; },
        function(p) { return p.specs && p.specs['Item Code']; },
        function(p) { return p.specs && p.specs['Part Name']; }
    );
};
window.loadPanelLibrary = async function() {
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return { panels: [] };
        const fileId = await window.findPanelLibFile(token);
        if (!fileId) return { panels: [] };
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return (data && Array.isArray(data.panels)) ? data : { panels: [] };
    } catch (e) { console.warn('패널 라이브러리 로드 실패:', e.message); return { panels: [] }; }
};
window.upsertPanelLibraryEntry = async function(entry) {
    const _en = window._currentLang === 'en';
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { alert(_en ? '🔒 Please connect Google Drive first.' : '🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return false; }
        const fileId = await window.findPanelLibFile(token);
        let lib = { panels: [] };
        if (fileId) {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } });
            const loaded = await res.json();
            if (loaded && Array.isArray(loaded.panels)) lib = loaded;
        }
        const idx = lib.panels.findIndex(function(p) { return window._panelLibNamesMatch(p.model, entry.model); });
        entry.updatedAt = new Date().toISOString();
        entry.updatedBy = window.currentUserName || '';
        if (idx === -1) lib.panels.push(entry); else lib.panels[idx] = entry;
        const body = JSON.stringify(lib);
        if (fileId) {
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body
            });
        } else {
            const folderId = await window.getOrCreateConfigFolder(token);
            const boundary = 'panel_lib_boundary';
            const metadata = { name: PANEL_LIB_FILENAME, mimeType: 'application/json', parents: [folderId] };
            const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body + "\r\n--" + boundary + "--";
            const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` }, body: multipartBody
            });
            const created = await createRes.json();
            if (created && created.id) window._panelLibFileId = created.id;
        }
        return true;
    } catch (e) { alert((_en ? 'Failed to save panel library: ' : '패널 라이브러리 저장 실패: ') + e.message); return false; }
};

// 💡 [2026-08-25 신규] 스펙 수정 중 모델명을 바꾼 경우, 예전 이름의 라이브러리 항목을 정리하기 위해
//    사용 — 실패해도 조용히 넘어간다(라이브러리에 옛 이름 항목이 하나 남는 정도라 저장 자체는 막지 않음).
window._panelLibRemoveEntry = async function(model) {
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return false;
        const fileId = await window.findPanelLibFile(token);
        if (!fileId) return true;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } });
        const loaded = await res.json();
        if (!loaded || !Array.isArray(loaded.panels)) return true;
        const before = loaded.panels.length;
        loaded.panels = loaded.panels.filter(function(p) { return !window._panelLibNamesMatch(p.model, model); });
        if (loaded.panels.length === before) return true;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(loaded)
        });
        return true;
    } catch (e) { console.warn('패널 라이브러리 항목 삭제 실패:', e.message); return false; }
};

// ─── AI 추출: 붙여넣은 스펙 텍스트 → 113개 항목 JSON (기존 callAiBackend/getActiveAiKey 재사용) ───
// 💡 [2026-08-25] 예전엔 8000자로 자르고 있었는데, PDF 데이터시트(pdf.js로 뽑으면 페이지마다
//    머리말/꼬리말까지 다 들어가 금방 길어짐)는 이 정도로는 스펙 표 뒷부분이 통째로 잘려서 분석이
//    안 되는 문제가 있었다. 4배로 올리고(대부분의 AI 제공사 무료/저가 모델도 이 정도 입력은 소화함),
//    아래 _pcCleanExtractedText로 반복되는 페이지 머리말/꼬리말 노이즈부터 걷어내 같은 글자수 예산
//    안에 실제 스펙 내용이 더 많이 들어가게 한다.
window._PANEL_EXTRACT_TEXT_LIMIT = 32000;
window._panelBuildExtractPrompt = function(rawText) {
    const fields = window._panelFlatFields();
    const keyListText = fields.map(function(f) { return '- "' + f + '"'; }).join('\n');
    return `당신은 LCD/OLED 디스플레이 패널 데이터시트 분석 전문가입니다.
아래 [원문 텍스트]는 panelook.com 페이지 또는 패널 데이터시트에서 사용자가 복사한 내용입니다.
여기서 패널 스펙 정보를 추출해서, 아래 키 목록을 정확히 그대로 사용한 하나의 JSON 객체로만 답하세요(다른 설명이나 마크다운 코드블럭 없이 JSON 객체 하나만).

키 목록(최상위 1개 + 스펙 항목들):
- "Model Name" (패널의 정확한 모델명, 예: DV430FHM-NN1)
${keyListText}

규칙:
1. 텍스트 안에서 찾을 수 없는 항목은 반드시 정확히 "-" 하나로 채우세요. 추측하거나 지어내지 마세요.
2. 값은 원문 표기(단위 포함)를 최대한 그대로 유지하세요.
3. 위에 나열된 키 이름을 한 글자도 다르지 않게 정확히 그대로 사용하세요.
4. "Model Name"도 못 찾으면 "-"로 답하세요.
5. ⚠️ 이 텍스트는 웹페이지를 인쇄/저장해서 뽑은 것이라, 항목명(라벨)들이 한 곳에 몰려 나오고 실제 값들은
   전혀 다른 위치에 순서대로만 나열되어 있는 경우가 있습니다(예: 라벨 목록 "Panel Brand / Panel Type / ..."이
   먼저 다 나온 뒤, 한참 뒤에 값 목록 "BOE / a-Si TFT-LCD / ..."가 나옴). 이런 경우 값의 형식(온도 범위,
   %, 해상도, mm 단위, 색상 좌표 등)과 패널 스펙 도메인 지식을 활용해 각 값이 실제로 어느 항목에 해당하는지
   판단해서 정확히 매칭하세요 — 텍스트 안에서의 물리적 인접성만으로 판단하지 마세요.

[원문 텍스트]
${(rawText || '').substring(0, window._PANEL_EXTRACT_TEXT_LIMIT)}`;
};

// 💡 PDF(특히 pdf.js로 뽑은 텍스트)는 페이지마다 반복되는 머리말/꼬리말/워터마크 줄이 그대로 다 붙어나와
//    같은 문장이 페이지 수만큼 중복되는 경우가 흔하다 — 실제 스펙 내용은 안 늘고 글자수만 차지해서
//    위 글자수 제한에 더 쉽게 걸리게 만든다. 8자 넘는 줄이 3번 이상 똑같이 반복되면 첫 등장만 남기고
//    나머지는 지운다(짧은 줄은 표의 값/단위처럼 정상적으로 반복될 수 있어 건드리지 않음).
window._pcCleanExtractedText = function(raw) {
    if (!raw) return '';
    const lines = String(raw).split('\n').map(function(l) { return l.replace(/[ \t]+/g, ' ').trim(); });
    const counts = {};
    lines.forEach(function(l) { if (l.length > 8) counts[l] = (counts[l] || 0) + 1; });
    const seen = {};
    const filtered = lines.filter(function(l) {
        if (l.length > 8 && counts[l] >= 3) {
            seen[l] = (seen[l] || 0) + 1;
            return seen[l] === 1; // 반복되는 줄은 처음 한 번만 남김
        }
        return true;
    });
    return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
window._panelParseAiJson = function(text) {
    if (!text) return null;
    let s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = s.indexOf('{'); const end = s.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
};

// ─── 탭 렌더링 ───
window._pcExpanded = false;
window._panelCompareLibCache = null;
window.renderPanelCompareTab = async function() {
    const _en = window._currentLang === 'en';
    const theadEl = document.getElementById('pc-thead');
    const tbodyEl = document.getElementById('pc-tbody');
    const emptyEl = document.getElementById('pc-empty-msg');
    if (!theadEl || !tbodyEl) return;

    window.tabData = window.tabData || {};
    window.tabData.panelCompare = window.tabData.panelCompare || { selectedModels: [], lastAutoSeed: null, notes: {} };
    const pc = window.tabData.panelCompare;
    pc.notes = pc.notes || {};

    // 💡 Summary 주요자재 PANEL 구분 행 자동 반영 — 등록된 모델명이 새로 생기거나 바뀌면 비교표 맨 앞에 자동 추가.
    //    (한 번 자동 추가된 뒤 사람이 일부러 뺐으면, 같은 값일 때는 다시 억지로 넣지 않는다 — lastAutoSeed로 추적)
    const materials = window.collectMaterialRows ? window.collectMaterialRows() : (window.tabData.projectMaterials || []);
    const panelMat = (materials || []).find(function(m) { return m.category === 'PANEL'; });
    const registeredModel = panelMat && panelMat.description ? panelMat.description.trim() : '';
    if (registeredModel && registeredModel !== pc.lastAutoSeed) {
        if (pc.selectedModels.indexOf(registeredModel) === -1) pc.selectedModels.unshift(registeredModel);
        pc.lastAutoSeed = registeredModel;
    }

    // 💡 [2026-08-25] 예전엔 선택된 패널이 0개면 표 자체를 숨기고 안내문만 보여줬는데, 이제는 "기본 4열"
    //    (라벨/슬롯1/슬롯2/Note)을 항상 그려서 빈 슬롯 헤더 자체가 "패널 추가" 진입점 역할을 하게 한다.
    if (emptyEl) emptyEl.style.display = 'none';
    theadEl.innerHTML = `<tr><th colspan="99" style="padding:16px; text-align:center; color:#999; background:#fff;">${_en ? 'Loading…' : '불러오는 중...'}</th></tr>`;
    tbodyEl.innerHTML = '';
    const lib = await window.loadPanelLibrary();
    window._panelCompareLibCache = lib;

    const selected = pc.selectedModels.slice(0, 10);
    const slotCount = Math.max(2, selected.length); // 💡 기본 최소 2개 비교 슬롯(3열)을 항상 보여줌
    const entries = selected.map(function(m) { return window.findPanelInLibrary(lib, m); });
    const totalCols = 1 + slotCount + 1; // 라벨 + 슬롯들 + Note

    let headHtml = '<tr>';
    headHtml += `<th style="min-width:140px;">Comparison table</th>`;
    for (let i = 0; i < slotCount; i++) {
        const m = selected[i];
        if (m) {
            const url = 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(m);
            const has = !!entries[i];
            headHtml += `<th style="min-width:120px; padding-left:6px; padding-right:6px; padding-top:4px !important; padding-bottom:4px !important;">
                <a href="${url}" target="_blank" rel="noopener" title="${_en ? 'Open panelook.com search results' : 'panelook.com 검색결과 열기'}" style="color:#2c5f8a; text-decoration:underline; font-weight:bold; word-break:break-all;">${escapeHtml(m)}</a>
                <div style="margin-top:2px; display:flex; gap:4px; justify-content:center; align-items:center; flex-wrap:wrap;">
                    ${has ? `<button data-pc-edit="${escapeHtml(m)}" title="${_en ? 'Edit spec / rename' : '스펙 수정 / 이름 변경'}" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="background:#fbead9; border:1px solid #edbf85; border-radius:3px; color:#a85d0a; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">✏️</button>` : ''}
                    <button data-pc-reextract="${escapeHtml(m)}" title="${_en ? 'Re-extract / refresh' : '다시 추출/갱신'}" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:3px; color:#1a4f7a; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">🔄</button>
                    <button data-pc-remove="${escapeHtml(m)}" title="${_en ? 'Remove from this comparison' : '이 프로젝트에서 제거'}" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="background:#fbe4e2; border:1px solid #eeb0ac; border-radius:3px; color:#b1432f; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">🗑</button>
                    ${!has ? `<span style="font-size:9.5px; color:#e67e22; font-weight:bold; white-space:nowrap;">⚠ ${_en ? 'Not extracted' : '미추출'}</span>` : ''}
                </div>
            </th>`;
        } else {
            headHtml += `<th class="pc-slot-empty" style="min-width:120px; cursor:pointer;" onclick="window.panelCompareOpenAddModal()" title="${_en ? 'Click to add a panel' : '클릭해서 패널 추가'}">
                ${_en ? '+ Add' : '+ 추가'}
            </th>`;
        }
    }
    headHtml += `<th style="min-width:130px;">Note</th>`;
    headHtml += '</tr>';
    theadEl.innerHTML = headHtml;

    let html = '';
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) {
        html += `<tr class="pc-section-row"><td colspan="${totalCols}" style="background:#fff8e6; color:#7a5210; font-weight:bold; padding:5px 10px; border:1px solid #e3e6ea;">[${escapeHtml(sec.section)}]</td></tr>`;
        sec.fields.forEach(function(f) {
            const label = f[0], priority = f[1];
            const rowStyle = priority === 2 ? ('display:' + (window._pcExpanded ? 'table-row' : 'none') + ';') : '';
            html += `<tr class="${priority === 2 ? 'pc-p2-row' : ''}" style="${rowStyle}">`;
            html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px; color:#555; white-space:nowrap;">${escapeHtml(label)}</td>`;
            for (let i = 0; i < slotCount; i++) {
                const entry = entries[i];
                const v = entry && entry.specs && entry.specs[label] != null && entry.specs[label] !== '' ? entry.specs[label] : '-';
                html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px;">${selected[i] ? escapeHtml(String(v)) : ''}</td>`;
            }
            const noteVal = pc.notes[label] || '';
            html += `<td style="border:1px solid #e9ecef; padding:2px 4px; font-size:12px;"><input type="text" value="${escapeHtml(noteVal)}" onchange="window.panelCompareSetNote(${escapeHtml(JSON.stringify(label))}, this.value)" style="width:100%; box-sizing:border-box; border:none; font-size:11.5px; padding:2px 4px; background:transparent; text-align:center;"></td>`;
            html += '</tr>';
        });
    });
    tbodyEl.innerHTML = html;
    window._pcApplyZebra();

    const toggleBtn = document.getElementById('pc-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = window._pcExpanded ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
};

// 💡 [2026-08-25 신규] Note 열 — 사용자가 프로젝트별로 자유롭게 남기는 메모(패널과 무관, 항목별 1개).
window.panelCompareSetNote = function(label, value) {
    window.tabData = window.tabData || {};
    window.tabData.panelCompare = window.tabData.panelCompare || { selectedModels: [], notes: {} };
    window.tabData.panelCompare.notes = window.tabData.panelCompare.notes || {};
    const oldVal = window.tabData.panelCompare.notes[label] || '';
    window.tabData.panelCompare.notes[label] = value;
    window.pcLogChange(label, 'Note', oldVal, value);
    // 💡 dirty 표시는 #tab-elecparts가 _NON_GANTT_DIRTY_SELECTORS에 포함돼 있어 change 이벤트로 자동 처리됨
};

// ── Panel Compare 탭 변경이력 (토글/기록/렌더링/삭제) — Summary/Brief SPEC/M.C Table과 동일 패턴 ──
window.pcToggleHistoryBox = function() {
    const body = document.getElementById('pc-history-body');
    const icon = document.getElementById('pc-history-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
    if (!isOpen && window.pcRenderHistoryTable) window.pcRenderHistoryTable();
};

window.pcLogChange = function(rowLabel, field, oldVal, newVal) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.panelCompareChangeLog = window.tabData.panelCompareChangeLog || [];
    window.tabData.panelCompareChangeLog.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal
    });
};

window.pcRenderHistoryTable = function() {
    const table = document.getElementById('pc-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.panelCompareChangeLog) || [];
    const _hisEn = window._currentLang === 'en';
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">' + (_hisEn ? 'No change history.' : '수정 이력이 없습니다.') + '</td></tr>'; return; }
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Panel / Item' : '패널 / 항목') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Field' : '필드') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Before' : '변경 전') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'After' : '변경 후') + '</th>'
        + '</tr></thead><tbody>';
    logs.slice().reverse().forEach(function(log) {
        html += '<tr><td style="padding:4px 8px; color:#6c757d;">' + log.time + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold; color:#0056b3;">' + (log.userName || (_hisEn ? 'Unknown' : '알 수 없음')) + '</td>'
            + '<td style="padding:4px 8px; font-weight:bold;">' + (log.row || '') + '</td>'
            + '<td style="padding:4px 8px;"><span class="badge" style="background:#e7f1ff; color:#0056b3;">' + (log.field || '') + '</span></td>'
            + '<td style="padding:4px 8px; color:#c92a2a;">' + (log.oldVal || '-') + '</td>'
            + '<td style="padding:4px 8px; color:#2f9e44;">' + (log.newVal || '-') + '</td></tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
};

window.deletePcHistoryByDateRange = function() {
    const pwEl = document.getElementById('pc-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) { if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.'); return; }
    const fromStr = (document.getElementById('pc-history-del-from') || {}).value;
    const toStr = (document.getElementById('pc-history-del-to') || {}).value;
    if (!fromStr || !toStr) { if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.'); return; }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) { if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.'); return; }
    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) { const ts = parseKoDateTime(log.time); return ts !== null && ts >= fromTs && ts <= toTs; };
    const doDelete = function() {
        let removedCount = 0;
        if (window.tabData && window.tabData.panelCompareChangeLog && window.tabData.panelCompareChangeLog.length) {
            const before = window.tabData.panelCompareChangeLog.length;
            window.tabData.panelCompareChangeLog = window.tabData.panelCompareChangeLog.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.panelCompareChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        if (window.pcRenderHistoryTable) window.pcRenderHistoryTable();
        const msg = removedCount + '건의 Panel Compare 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };
    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 Panel Compare 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

window.panelCompareToggleExpand = function() {
    window._pcExpanded = !window._pcExpanded;
    document.querySelectorAll('#pc-table .pc-p2-row').forEach(function(tr) { tr.style.display = window._pcExpanded ? 'table-row' : 'none'; });
    const toggleBtn = document.getElementById('pc-toggle-btn');
    const _en = window._currentLang === 'en';
    if (toggleBtn) toggleBtn.textContent = window._pcExpanded ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
    window._pcApplyZebra(); // 💡 펼침/접힘으로 보이는 행이 바뀌면 줄무늬도 다시 계산해야 깨지지 않음
};

// 💡 지브라 줄무늬 — 숨겨진(display:none) 부가 스펙 행이나 섹션 구분 행은 세지 않고, "실제로 보이는
//    데이터 행"만 순서대로 흰색/연회색을 번갈아 매긴다. 그래야 부가 스펙을 접었다 펼쳐도 줄무늬가 안 깨짐.
window._pcApplyZebra = function() {
    const rows = document.querySelectorAll('#pc-table tbody tr:not(.pc-section-row)');
    let i = 0;
    rows.forEach(function(tr) {
        tr.classList.remove('mc-zebra-a', 'mc-zebra-b');
        if (tr.style.display === 'none') return;
        tr.classList.add(i % 2 === 0 ? 'mc-zebra-a' : 'mc-zebra-b');
        i++;
    });
};

window.panelCompareRemove = function(model) {
    if (!window.tabData || !window.tabData.panelCompare) return;
    window.tabData.panelCompare.selectedModels = window.tabData.panelCompare.selectedModels.filter(function(m) { return m !== model; });
    window.pcLogChange(model, window._currentLang === 'en' ? 'Comparison table' : '비교표', window._currentLang === 'en' ? 'Included' : '포함', window._currentLang === 'en' ? 'Removed' : '제거');
    window.renderPanelCompareTab();
};

window.panelCompareAddFromLibrary = function(model) {
    const _en = window._currentLang === 'en';
    window.tabData = window.tabData || {};
    window.tabData.panelCompare = window.tabData.panelCompare || { selectedModels: [], lastAutoSeed: null };
    const sel = window.tabData.panelCompare.selectedModels;
    if (sel.indexOf(model) !== -1) { if (window.showToast) window.showToast(_en ? 'Already in the comparison table.' : '이미 비교표에 있습니다.', 'info'); return; }
    if (sel.length >= 10) { alert(_en ? 'Maximum 10 panels per comparison table. Remove one first.' : '비교표는 최대 10개까지입니다. 하나를 먼저 제거해주세요.'); return; }
    sel.push(model);
    window.pcLogChange(model, _en ? 'Comparison table' : '비교표', '-', _en ? 'Added' : '추가');
    const addModal = document.getElementById('pc-add-modal'); if (addModal) addModal.style.display = 'none';
    window.renderPanelCompareTab();
};

window.panelCompareReextract = async function(model) {
    await window.panelCompareOpenAddModal();
    window._pcPendingReextractModel = model;
    const paste = document.getElementById('pc-add-paste');
    if (paste) paste.focus();
    if (window.showToast) {
        window.showToast(window._currentLang === 'en' ? `Paste the latest spec text for "${model}" and extract.` : `"${model}"의 최신 스펙 텍스트를 붙여넣고 추출하세요.`, 'info');
    }
};

// 💡 [2026-08-25 신규] "저장한 스펙/모델명을 수정할 수 없다"는 지적에 대한 대응 — 다시 붙여넣어 AI로
//    재추출하지 않아도, 라이브러리에 있는 현재 값을 그대로 불러와 각 항목을 직접 고칠 수 있게 한다.
//    모델명도 이 폼에서 바꿀 수 있고, 저장 시 이름이 바뀌었으면 예전 이름의 라이브러리 항목은 정리한다.
window.panelCompareOpenEditModal = async function(model) {
    const _en = window._currentLang === 'en';
    // 💡 [버그 수정] 캐시(_panelCompareLibCache)는 마지막 탭 렌더링 시점 스냅샷이라, 그 사이 다른 곳에서
    //    라이브러리가 바뀌었으면 낡은 값을 편집 폼에 채우게 된다 — 수정할 때는 항상 최신을 다시 받는다.
    const lib = await window.loadPanelLibrary();
    window._panelCompareLibCache = lib;
    const entry = window.findPanelInLibrary(lib, model);
    if (!entry) { alert(_en ? 'This panel was not found in the library.' : '라이브러리에서 이 패널을 찾을 수 없습니다.'); return; }
    await window.panelCompareOpenAddModal();
    window._pcPendingReextractModel = entry.model; // 모델명 입력칸 미리 채움(기존과 동일한 메커니즘 재사용)
    window._pcEditingOriginalModel = entry.model;   // 저장할 때 "이름이 바뀐 수정"인지 판단하는 기준값
    window._pcRenderPreviewForm(entry.specs || {});
    if (window.showToast) window.showToast(_en ? `Loaded the current spec for "${entry.model}" — edit and save.` : `"${entry.model}"의 현재 스펙을 불러왔습니다 — 수정 후 저장하세요.`, 'info');
};

// ─── "➕ 패널 추가" 모달: 라이브러리 검색 + 새 패널 AI 추출 ───
window.panelCompareOpenAddModal = async function() {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('pc-add-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pc-add-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="pc-add-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
            <div id="pc-add-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="pc-add-title">🖥️ ${_en ? 'Add Panel' : '패널 추가'}</span>
                <button onclick="document.getElementById('pc-add-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div style="padding:12px 16px; border-bottom:1px solid #eee; flex-shrink:0;">
                <input id="pc-add-search" type="text" placeholder="${_en ? 'Search library by model name...' : '라이브러리에서 모델명 검색...'}" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #ced4da; border-radius:6px; font-size:13px;" oninput="window._pcRenderLibList(this.value)">
                <div id="pc-add-lib-list" style="margin-top:8px; max-height:160px; overflow-y:auto;"></div>
            </div>
            <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; min-height:0;">
                <div id="pc-add-extract-label" style="font-size:12px; font-weight:bold; color:#555; margin-bottom:6px;">${_en ? 'Or extract a new panel with AI' : '또는 새 패널을 AI로 추출'}</div>
                <input type="file" id="pc-add-file" accept=".pdf,.txt,.html,.htm" style="display:none;" onchange="window._pcHandleFileUpload(this)">
                <div id="pc-add-dropzone"
                     style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-shrink:0; padding:8px 10px; border:1.5px dashed #2c5f8a; border-radius:6px; background:#f8f9fa; cursor:pointer; transition:0.15s;"
                     onclick="document.getElementById('pc-add-file').click()"
                     ondragover="event.preventDefault(); this.style.background='#e9eef3';"
                     ondragleave="this.style.background='#f8f9fa';"
                     ondrop="event.preventDefault(); event.stopPropagation(); this.style.background='#f8f9fa'; window._pcHandleFileDrop(event.dataTransfer.files);">
                    <button type="button" id="pc-add-file-btn" onclick="event.stopPropagation(); document.getElementById('pc-add-file').click()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex-shrink:0; padding:6px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📄 ${_en ? 'Attach PDF/TXT/HTML' : 'PDF/TXT/HTML 첨부'}</button>
                    <span id="pc-add-file-name" style="font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_en ? 'or drag & drop a file here' : '또는 파일을 여기로 드래그하세요'}</span>
                </div>
                <div style="font-size:10.5px; color:#999; margin-bottom:6px;">
                    <span onclick="window.open('https://www.panelook.com/', '_blank', 'noopener')" class="inbox-help-ico" style="cursor:pointer; margin-left:0; font-size:10.5px; font-weight:bold; color:#2c5f8a; text-decoration:underline; text-underline-offset:2px;">
                        💡 ${_en ? 'Extract panel SPEC from panelook.com' : 'panelook.com 에서 패널 SPEC 추출'}
                        <span class="inbox-help-tip" style="top:16px;">
                            ${_en
                                ? '① Go to the panelook.com page below (#1) — the model shown may not be the latest — click the <b>"+"</b> button next to the searched panel name to add it (it may already be checked), then click the <b>"compare"</b> button in the "Panel Compare" box at the top right of the page.<br>&nbsp;&nbsp;→ A "slide to verify you\'re human" check may appear — only a human can pass it, so this step cannot be automated.<br>&nbsp;&nbsp;→ After it passes you land on the spec comparison page. Press <b>Ctrl+S</b> there and save it as <mark style="background:#ffe066; color:#7a5210; padding:0 3px; border-radius:3px;">"Webpage, Complete"</mark>.<br>② Attach the saved <b>.html file</b> (the file itself, not its folder) below and extract — AI will process it.<br><br><a href="https://www.panelook.com/" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="color:#8ecdf7;">🔗 #1 panelook.com (open &amp; copy manually)</a>'
                                : '① 아래 #1 panelook.com 페이지로 접속해서(최신은 없을 수도 있음), 검색된 패널명 앞의 <b>"+"</b> 버튼을 눌러 추가한 뒤(이미 눌려져 있을 수도 있음), 페이지 오른쪽 상단 "Panel Compare" 상자의 <b>"compare"</b> 버튼을 클릭하세요.<br>&nbsp;&nbsp;→ "사람인지 확인" 슬라이드 캡차가 뜰 수 있는데, 사람만 통과할 수 있어 자동화할 수 없습니다.<br>&nbsp;&nbsp;→ 통과하면 스펙 비교 페이지로 이동합니다. 그 페이지에서 <b>Ctrl+S</b>를 눌러 <mark style="background:#ffe066; color:#7a5210; padding:0 3px; border-radius:3px;">"웹페이지,전부 HTML"</mark>으로 저장하세요.<br>② 아래에 저장한 <b>.html 파일</b>(폴더 제외)을 첨부하여 추출하면, AI가 처리합니다.<br><br><a href="https://www.panelook.com/" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="color:#8ecdf7;">🔗 #1 panelook.com에서 직접 확인·복사</a>'}
                        </span>
                    </span>
                </div>
                <textarea id="pc-add-paste" placeholder="${_en ? 'Paste the panel spec text copied from panelook.com or a datasheet, or attach a PDF/TXT/HTML file above...' : 'panelook.com이나 데이터시트에서 복사한 패널 스펙 텍스트를 붙여넣거나, 위에서 PDF/TXT/HTML 파일을 첨부하세요...'}" style="width:100%; box-sizing:border-box; min-height:90px; border:1px solid #ced4da; border-radius:6px; padding:8px; font-size:12px; resize:vertical;"></textarea>
                <button id="pc-add-extract-btn" onclick="window._pcRunExtract()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="margin-top:8px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; flex-shrink:0; transition:background .15s, border-color .15s;">🤖 ${_en ? 'Extract with AI' : 'AI로 추출'}</button>
                <div id="pc-add-preview" style="margin-top:10px;"></div>
            </div>
            <div id="pc-add-footer" style="display:none; padding:12px 16px; border-top:1px solid #eee; flex-shrink:0;">
                <button id="pc-save-btn" onclick="window._pcSaveNewPanel()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="width:100%; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? 'Save' : '저장'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('pc-add-box', 'pc-add-drag');
        window._bindClickToFront('pc-add-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    window.bringModalToFront('pc-add-modal');
    document.getElementById('pc-add-search').value = '';
    document.getElementById('pc-add-paste').value = '';
    document.getElementById('pc-add-preview').innerHTML = '';
    const pcFooterEl = document.getElementById('pc-add-footer'); if (pcFooterEl) pcFooterEl.style.display = 'none';
    const fileNameEl = document.getElementById('pc-add-file-name'); if (fileNameEl) fileNameEl.textContent = _en ? 'or drag & drop a file here' : '또는 파일을 여기로 드래그하세요';
    const fileInputEl = document.getElementById('pc-add-file'); if (fileInputEl) fileInputEl.value = '';
    // 💡 [버그 방지] 이 모달을 여는 기본값은 "새로 추가"다 — panelCompareOpenEditModal()은 이 함수를
    //    먼저 부른 "다음"에 아래 두 플래그를 다시 세팅하므로, 여기서 매번 초기화해도 편집 흐름은 안 깨진다.
    //    초기화 안 하면, 편집을 한 번 연 뒤 취소하고 "새 패널 추가"를 열었을 때도 예전 편집 상태가 남아
    //    엉뚱한 이름의 라이브러리 항목을 지워버리는 사고로 이어질 수 있었다.
    window._pcEditingOriginalModel = null;
    const lib = await window.loadPanelLibrary();
    window._panelCompareLibCache = lib;
    window._pcRenderLibList('');
};

// 💡 [2026-08-27] 모델명뿐 아니라 제조사(Panel Brand)·인치(Diagonal Size)로도 검색되게 확장 —
//    검색어를 공백으로 나눠 각 단어를 모델명/브랜드/인치 어디서든 찾으면 되는 AND 매칭이라,
//    "BOE 15.6"처럼 여러 조건을 같이 입력해도(단어 순서·필드 구분 없이) 전부 만족하는 패널만 남는다.
window._pcLibSearchHaystack = function(p) {
    const specs = p.specs || {};
    return [p.model, p.brand, specs['Panel Brand'], specs['Diagonal Size'], specs['Panel Type']]
        .filter(Boolean).join(' ').toLowerCase();
};
window._pcRenderLibList = function(filterText) {
    const list = document.getElementById('pc-add-lib-list');
    if (!list) return;
    const _en = window._currentLang === 'en';
    const lib = window._panelCompareLibCache || { panels: [] };
    const terms = (filterText || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = (lib.panels || []).filter(function(p) {
        if (!terms.length) return true;
        const hay = window._pcLibSearchHaystack(p);
        return terms.every(function(t) { return hay.indexOf(t) !== -1; });
    }).slice(0, 30);
    if (!filtered.length) {
        list.innerHTML = `<div style="padding:8px; color:#999; font-size:12px;">${_en ? 'No matches in the library.' : '라이브러리에 일치하는 패널이 없습니다.'}</div>`;
        return;
    }
    // 💡 [버그 수정] 이 목록은 event.stopPropagation()이 걸린 모달 박스(pc-add-box) 안에 있어서,
    //    document 전역 클릭 위임(data-pc-lib-add)이 여기까지 절대 도달하지 못한다(전파가 그 박스에서
    //    끊김). 그래서 이 안의 버튼만은 위임 대신 직접 onclick으로 호출한다.
    list.innerHTML = filtered.map(function(p) {
        const size = (p.specs && p.specs['Diagonal Size'] && p.specs['Diagonal Size'] !== '-') ? p.specs['Diagonal Size'] : '';
        const meta = [p.brand, size].filter(Boolean).join(' · ');
        return `<div onclick="window.panelCompareAddFromLibrary(${escapeHtml(JSON.stringify(p.model))})" style="padding:6px 8px; border-bottom:1px solid #f0f0f0; cursor:pointer; font-size:12.5px; display:flex; justify-content:space-between;"
            onmouseover="this.style.background='#f4f8fc'" onmouseout="this.style.background='transparent'">
            <span><b>${escapeHtml(p.model)}</b> <span style="color:#888;">${escapeHtml(meta)}</span></span>
            <span style="color:#2c5f8a;">${_en ? '+ Add' : '+ 추가'}</span>
        </div>`;
    }).join('');
};

// 💡 [2026-08-25 신규] 패널 데이터시트는 대부분 PDF라 텍스트 붙여넣기만으론 불편하다는 요청 —
//    클라이언트 사이드 pdf.js(전역 pdfjsLib, 서버 없이 브라우저에서 텍스트만 뽑아냄)로 PDF/TXT
//    파일을 첨부하면 본문을 자동으로 붙여넣기 칸에 채워준다. 이후 흐름(AI로 추출)은 그대로 재사용.
// 💡 [2026-08-28 버그 수정] "Suitable Load"처럼 한 항목의 값이 PDF 원본에서 여러 줄로 나뉘어 있으면
//    (예: "8strings x 2bars" / "4strings x 4bars" 두 줄) AI 추출이 빈칸("-")으로 남기는 문제 — 원인은
//    이 함수가 페이지의 모든 텍스트 조각(items)을 줄바꿈 정보 없이 스페이스 하나로만 다 이어붙이고
//    있었던 것. 그러면 "2. Suitable Load 8strings x 2bars 4strings x 4bars 3. Electrical..."처럼
//    줄 구분이 통째로 사라진 한 덩어리 문장이 되어, AI가 어디까지가 이 항목의 값인지 판단할 근거
//    자체를 잃는다(값이 한 줄뿐인 항목은 우연히 살아남아 "1개는 되고 2개는 안 되는" 것처럼 보였음).
//    pdf.js의 각 텍스트 조각은 transform[5]에 y좌표를 담고 있으므로, 같은 줄(y좌표가 거의 동일)이면
//    스페이스로, 줄이 바뀌면(y좌표가 달라지면) 개행으로 이어붙여 원본의 줄 구조를 최대한 복원한다.
window._pcExtractPdfText = async function(file) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let lastY = null;
        content.items.forEach(function(it) {
            const y = (it.transform && typeof it.transform[5] === 'number') ? it.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 1) {
                text += '\n';
            } else if (text && !/[\n ]$/.test(text)) {
                text += ' ';
            }
            text += it.str;
            if (y !== null) lastY = y;
        });
        text += '\n';
    }
    return text;
};

// 💡 [2026-08-25 실측 확인] panelook.com 비교 페이지는 라벨(#left_attr_table의 <li>)과 값
//    (#right_attr_table의 <dl>, 값은 그 안의 .vartd)이 완전히 분리된 두 DOM 서브트리다 — 그냥
//    textContent만 뽑으면 "라벨 129개가 통째로 먼저, 그다음 값 129개가 통째로" 나와버려서 순서가
//    아예 다르다(실제 저장된 HTML로 확인함). 다행히 두 목록의 "행 순서(li/dl 등장 순서)"는 정확히
//    1:1로 대응하므로, 인덱스로 짝지어 "라벨 : 값" 형태로 재구성하면 완벽하게 복원된다(129/129 확인).
//    이 구조가 아니면(다른 사이트 등) null을 반환해 호출부가 일반 텍스트 추출로 폴백하게 한다.
window._pcExtractPanelookHtml = function(doc) {
    const leftItems = doc.querySelectorAll('#left_attr_table > li');
    const rightRows = doc.querySelectorAll('#right_attr_table > dl');
    if (!leftItems.length || !rightRows.length) return null;
    const n = Math.min(leftItems.length, rightRows.length);
    const lines = [];
    for (let i = 0; i < n; i++) {
        const li = leftItems[i];
        const dl = rightRows[i];
        const sectionEl = li.querySelector('.class_name');
        if (sectionEl) { lines.push(sectionEl.textContent.replace(/\s+/g, ' ').trim()); continue; }
        const labelEl = li.querySelector('.bar');
        if (!labelEl) continue; // 맨 위 빈 헤더 스페이서 행 등
        const label = labelEl.textContent.replace(/\s+/g, ' ').trim();
        // 여러 패널을 비교 중이면 panel_dd_0, panel_dd_1... 안에 각각 .vartd가 있음 — 전부 이어붙임
        const values = Array.from(dl.querySelectorAll('.vartd'))
            .map(function(v) { return v.textContent.replace(/\s+/g, ' ').trim(); })
            .filter(Boolean);
        lines.push(label + ' ' + (values.length ? values.join(' | ') : '-'));
    }
    return lines.join('\n');
};

// 💡 [2026-08-25 신규] "다른 이름으로 저장 → 웹페이지 HTML" 파일에서 텍스트만 뽑아낸다. panelook.com
//    특유의 구조(위 함수)가 감지되면 그걸로 정확히 재구성하고, 아니면 DOMParser로 script/style/svg만
//    걷어낸 뒤 순수 텍스트만 추출하는 일반적인 방식으로 폴백한다.
window._pcExtractHtmlText = function(htmlString) {
    try {
        const doc = new DOMParser().parseFromString(htmlString, 'text/html');
        const panelookLines = window._pcExtractPanelookHtml(doc);
        if (panelookLines) return panelookLines;

        doc.querySelectorAll('script, style, noscript, svg').forEach(function(el) { el.remove(); });
        return (doc.body ? doc.body.textContent : doc.documentElement.textContent) || '';
    } catch (e) {
        console.warn('HTML 텍스트 추출 실패:', e.message);
        return '';
    }
};

// 💡 [2026-08-25 신규] 버튼 클릭(input[type=file])과 드래그앤드롭 둘 다 같은 처리 로직을 타도록,
//    "File 객체 하나를 받아 읽어서 붙여넣기 칸을 채우는" 부분을 공통 함수로 분리했다.
window._pcProcessFile = async function(file) {
    const _en = window._currentLang === 'en';
    const paste = document.getElementById('pc-add-paste');
    const fileNameEl = document.getElementById('pc-add-file-name');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (fileNameEl) fileNameEl.textContent = '📄 ' + file.name;
    try {
        let text = '';
        if (ext === 'pdf') {
            if (!window.pdfjsLib) {
                alert(_en ? '⚠️ The PDF reader library failed to load (check your network) — paste the text manually instead.' : '⚠️ PDF 읽기 라이브러리를 불러오지 못했습니다(네트워크 확인) — 대신 텍스트를 직접 붙여넣어주세요.');
                return;
            }
            if (paste) paste.value = _en ? 'Reading PDF…' : 'PDF 읽는 중...';
            text = await window._pcExtractPdfText(file);
        } else if (ext === 'html' || ext === 'htm') {
            // 💡 [2026-08-25 신규] panelook.com 비교표 페이지는 라벨 열이 CSS sticky라서, 브라우저로
            //    "인쇄→PDF"하면 페이지가 나뉠 때마다 라벨 열이 처음부터 다시 그려져 값과 순서가 완전히
            //    어긋나는 걸 실제 파일로 확인함(라벨 12개 정도만 반복되고 나머지 값은 짝 없이 흩어짐).
            //    반면 "다른 이름으로 저장→웹페이지 HTML"은 화면에 그려진 CSS 배치가 아니라 원본 문서(DOM)
            //    순서 그대로 저장되므로, sticky 여부와 무관하게 라벨 바로 다음에 그 값이 나오는 원래
            //    순서가 보존된다. DOMParser로 파싱해 script/style만 제거하고 텍스트만 뽑아낸다.
            const htmlStr = await file.text();
            text = window._pcExtractHtmlText(htmlStr);
        } else {
            text = await file.text();
        }
        // 💡 PDF는 페이지마다 반복되는 머리말/꼬리말이 그대로 다 붙어나와 글자수만 불필요하게 늘리는
        //    경우가 흔해서, AI에게 보내기 전 글자수 예산을 아끼도록 미리 한 번 정리해둔다.
        const cleaned = window._pcCleanExtractedText(text);
        if (paste) paste.value = cleaned;
        const savedChars = text.length - cleaned.length;
        if (window.showToast) {
            window.showToast((_en ? '📄 Loaded text from "' : '📄 "') + file.name + (_en ? '"' : '"에서 텍스트를 불러왔습니다')
                + (savedChars > 200 ? (_en ? ` (removed ${savedChars.toLocaleString()} repeated chars)` : ` (반복 ${savedChars.toLocaleString()}자 정리됨)`) : ''), 'info');
        }
    } catch (e) {
        if (paste) paste.value = '';
        alert((_en ? 'Failed to read the file: ' : '파일을 읽지 못했습니다: ') + e.message);
    }
};

window._pcHandleFileUpload = async function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
        await window._pcProcessFile(file);
    } finally {
        input.value = ''; // 같은 파일을 다시 선택해도 change 이벤트가 재발생하도록
    }
};

// 💡 pc-add-dropzone에 파일을 끌어다 놓았을 때 — 확장자를 먼저 확인해 지원하지 않는 파일이면
//    조용히 무시하지 않고 바로 알려준다(버튼/클릭 경로는 accept 속성이 브라우저에서 걸러주지만,
//    드래그앤드롭은 그 필터를 타지 않으므로 여기서 직접 검사해야 함).
window._pcHandleFileDrop = async function(fileList) {
    const _en = window._currentLang === 'en';
    const file = fileList && fileList[0];
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'txt', 'html', 'htm'].indexOf(ext) === -1) {
        alert(_en ? '⚠️ Only PDF/TXT/HTML files are supported.' : '⚠️ PDF/TXT/HTML 파일만 지원합니다.');
        return;
    }
    await window._pcProcessFile(file);
};

window._pcRunExtract = async function() {
    const _en = window._currentLang === 'en';
    const raw = (document.getElementById('pc-add-paste') || {}).value || '';
    if (!raw.trim()) { alert(_en ? 'Please paste the panel spec text first.' : '먼저 패널 스펙 텍스트를 붙여넣어 주세요.'); return; }
    // 💡 이 길이를 넘으면 프롬프트에서 뒷부분이 잘려나가 그 뒤에 나오는 스펙은 분석되지 않는다 —
    //    조용히 자르는 대신 미리 알려주고, 계속할지 사람이 고르게 한다(취소하면 직접 텍스트를 다듬을 수 있음).
    if (raw.length > window._PANEL_EXTRACT_TEXT_LIMIT) {
        const proceed = confirm(_en
            ? `The pasted text is ${raw.length.toLocaleString()} characters, but only the first ${window._PANEL_EXTRACT_TEXT_LIMIT.toLocaleString()} will be analyzed (AI input limit) — specs beyond that point may be missed.\n\nContinue anyway? (Cancel to trim the text yourself first, e.g. remove cover pages or repeated boilerplate.)`
            : `붙여넣은 텍스트가 ${raw.length.toLocaleString()}자인데, AI 분석에는 앞부분 ${window._PANEL_EXTRACT_TEXT_LIMIT.toLocaleString()}자까지만 사용됩니다 — 그 뒤에 있는 스펙은 누락될 수 있습니다.\n\n그래도 진행할까요? (취소하고 표지/반복되는 문구 등을 직접 지워서 줄여보세요.)`);
        if (!proceed) return;
    }
    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) { alert(_en ? '⚠️ No AI API key configured. Set one in the mail analysis screen first.' : '⚠️ AI API 키가 설정되어 있지 않습니다. 메일 분석 화면에서 먼저 키를 등록해주세요.'); return; }
    const btn = document.getElementById('pc-add-extract-btn');
    if (btn) { btn.disabled = true; btn.textContent = '🤖 ' + (_en ? 'Extracting…' : '추출 중...'); }
    try {
        const prompt = window._panelBuildExtractPrompt(raw);
        const result = await window.callAiBackend(apiKey, prompt);
        if (!result.ok) { alert((_en ? 'AI call failed: ' : 'AI 호출 실패: ') + (result.error && result.error.message || (_en ? 'Unknown error' : '알 수 없는 오류'))); return; }
        const text = result.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = window._panelParseAiJson(text);
        if (!parsed) alert(_en ? 'Could not parse the AI response. Please try again, or fill in the form manually below.' : 'AI 응답을 해석하지 못했습니다. 다시 시도하거나 아래 폼에 직접 입력해주세요.');
        window._pcRenderPreviewForm(parsed || {});
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🤖 ' + (_en ? 'Extract with AI' : 'AI로 추출'); }
    }
};

window._pcRenderPreviewForm = function(specs) {
    const _en = window._currentLang === 'en';
    const preview = document.getElementById('pc-add-preview');
    if (!preview) return;
    const presetModel = window._pcPendingReextractModel || ((specs['Model Name'] && specs['Model Name'] !== '-') ? specs['Model Name'] : '');
    window._pcPendingReextractModel = null;
    let html = '';
    html += `<div style="margin-bottom:10px;"><label style="font-size:11px; font-weight:bold; color:#555;">${_en ? 'Model name *' : '모델명 *'}</label>
        <input id="pc-form-model" type="text" value="${escapeHtml(presetModel)}" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1.5px solid #2c5f8a; border-radius:5px; font-size:13px; margin-top:2px;" placeholder="${_en ? 'e.g. DV430FHM-NN1' : '예: DV430FHM-NN1'}"></div>`;
    window.PANEL_SPEC_SCHEMA.forEach(function(sec, si) {
        html += `<details ${si === 0 ? 'open' : ''} style="margin-bottom:6px;"><summary style="cursor:pointer; font-weight:bold; font-size:12px; color:#2c5f8a; padding:4px 0;">[${escapeHtml(sec.section)}]</summary>`;
        sec.fields.forEach(function(f) {
            const label = f[0];
            const val = specs[label] != null ? specs[label] : '-';
            html += `<div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
                <label style="flex:0 0 170px; font-size:10.5px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(label)}">${escapeHtml(label)}</label>
                <input data-pc-field="${escapeHtml(label)}" type="text" value="${escapeHtml(String(val))}" style="flex:1; padding:4px 6px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px; min-width:0;">
            </div>`;
        });
        html += '</details>';
    });
    preview.innerHTML = html;
    // 💡 [2026-08-27] 저장 버튼은 폼 맨 아래(스크롤 영역 안)에 있으면 항목이 많을 때 스크롤해야 보였다 —
    //    "저장 버튼이 사라진 것 같다"는 문의가 있어, 모달 하단 고정 푸터(pc-add-footer)로 옮겼다.
    const footer = document.getElementById('pc-add-footer');
    if (footer) footer.style.display = 'block';
};

window._pcSaveNewPanel = async function() {
    const _en = window._currentLang === 'en';
    const modelInput = document.getElementById('pc-form-model');
    const model = (modelInput ? modelInput.value : '').trim();
    if (!model) { alert(_en ? 'Please enter the model name.' : '모델명을 입력해주세요.'); if (modelInput) modelInput.focus(); return; }
    const specs = {};
    document.querySelectorAll('#pc-add-preview [data-pc-field]').forEach(function(inp) { specs[inp.dataset.pcField] = inp.value; });
    const brand = (specs['Panel Brand'] && specs['Panel Brand'] !== '-') ? specs['Panel Brand'] : '';
    const entry = {
        model: model, brand: brand,
        sourceUrl: 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(model),
        specs: specs
    };
    // 💡 [2026-08-25 신규] "✏️ 수정" 경로로 들어와서 모델명 자체를 바꾼 경우 — 새 이름으로 저장하는 것과
    //    별개로, 예전 이름의 라이브러리 항목이 유령으로 남지 않도록 지우고, 이 프로젝트의 selectedModels/
    //    lastAutoSeed도 옛 이름 → 새 이름으로 교체한다(그냥 "추가"로 취급해 중복 슬롯이 생기지 않도록).
    const originalModel = window._pcEditingOriginalModel;
    window._pcEditingOriginalModel = null; // 1회성 소비 — 다음 저장부터는 다시 "신규 추가"로 동작
    const isRename = !!(originalModel && originalModel !== model);

    const ok = await window.upsertPanelLibraryEntry(entry);
    if (!ok) return;
    if (isRename) await window._panelLibRemoveEntry(originalModel);

    window.tabData = window.tabData || {};
    window.tabData.panelCompare = window.tabData.panelCompare || { selectedModels: [], lastAutoSeed: null };
    const sel = window.tabData.panelCompare.selectedModels;
    if (isRename) {
        const idx = sel.indexOf(originalModel);
        if (idx !== -1) sel[idx] = model; else if (sel.indexOf(model) === -1 && sel.length < 10) sel.push(model);
        window.pcLogChange(originalModel, _en ? 'Model name' : '모델명', originalModel, model);
        if (window.tabData.panelCompare.lastAutoSeed === originalModel) window.tabData.panelCompare.lastAutoSeed = model;
    } else if (sel.indexOf(model) === -1) {
        if (sel.length >= 10) {
            alert(_en ? 'This project already has 10 panels in the comparison table (maximum). It was saved to the library, but not added here — remove one first.' : '이미 이 프로젝트의 비교표에 패널 10개(최대)가 있습니다. 라이브러리엔 저장됐지만 여기엔 추가되지 않았습니다 — 하나를 먼저 제거해주세요.');
        } else {
            sel.push(model);
            window.pcLogChange(model, _en ? 'Comparison table' : '비교표', '-', _en ? 'Added' : '추가');
        }
    }
    const modal = document.getElementById('pc-add-modal'); if (modal) modal.style.display = 'none';
    window.renderPanelCompareTab();
    if (window.showToast) window.showToast((_en ? '✅ Saved: ' : '✅ 저장 완료: ') + model, 'info');
};

// ─── Summary 주요자재 PANEL 행 🔎 버튼 → 패널 스펙 미리보기 모달 ───
// 💡 [2026-09-01 신규] codeHint(주요자재 표의 ktk pn, 보통 6자리 관리코드) — 검색에만 쓰고 비교표
//    등록/재추출 등 "식별자"로는 절대 안 씀(식별자는 항상 entry.model 또는 사용자가 적은 description
//    그대로 — ktk pn이 섞여 들어가면 이미 비교표에 있는 같은 패널을 "없음"으로 오판하거나, 비교표에
//    코드가 섞인 이름으로 등록되는 부작용이 생기므로 분리함).
window.showPanelSpecModal = async function(model, codeHint) {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('pc-spec-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pc-spec-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="pc-spec-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:300px;">
            <div id="pc-spec-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="pc-spec-title">🖥️ ${_en ? 'Panel Spec' : '패널 스펙'}</span>
                <button onclick="document.getElementById('pc-spec-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div id="pc-spec-body" style="padding:12px 16px; flex:1; overflow-y:auto; font-size:12px;"></div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('pc-spec-box', 'pc-spec-drag');
        window._bindClickToFront('pc-spec-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    window.bringModalToFront('pc-spec-modal');
    const bodyEl = document.getElementById('pc-spec-body');
    bodyEl.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">${_en ? 'Loading…' : '불러오는 중...'}</div>`;
    const lib = await window.loadPanelLibrary();
    // 💡 ktk pn(codeHint)이 있으면 "코드_이름"으로 합쳐서 검색 — findPanelInLibrary가 이미
    //    _epFlexibleFind로 코드/이름을 분리 대조하므로 이 조합만으로 ktk pn도 검색 근거가 된다.
    const searchQuery = codeHint ? (codeHint + (model ? '_' + model : '')) : model;
    const entry = window.findPanelInLibrary(lib, searchQuery);
    // 💡 식별자(제목 표시/비교표 등록·재추출/URL)는 검색 성공 시 라이브러리의 정확한 모델명(entry.model)을,
    //    실패 시 사용자가 적은 description(비어있으면 ktk pn)을 그대로 사용 — 검색용 codeHint 조합 문자열이
    //    비교표 등 다른 곳으로 새어나가지 않게 분리함.
    const model_display = entry ? entry.model : (model || codeHint || '');
    const url = 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(model_display);
    if (!entry) {
        // 💡 [2026-08-25] 두 요소를 헷갈려서(링크=panelook.com 이동, 버튼=로컬 붙여넣기/AI추출) "추출하기를
        //    눌렀는데 홈페이지에서 멈춘다"는 문의가 있었음 — panelook.com은 자동화 접근을 막는 슬라이더
        //    캡차가 있어서(사람이 직접 풀어야 함), 저 링크는 "사람이 직접 확인·복사하러 가는 창구"일 뿐이고
        //    실제 추출은 아래 버튼(붙여넣기 → AI)에서만 일어난다는 걸 문구로 명확히 구분해뒀다.
        bodyEl.innerHTML = `
            <div style="font-size:13px; font-weight:bold; margin-bottom:8px;">${escapeHtml(model_display)}</div>
            <div style="color:#888; margin-bottom:14px;">${_en ? 'No spec has been extracted for this panel yet.' : '아직 이 패널의 스펙이 추출되지 않았습니다.'}</div>
            <div style="font-size:11.5px; color:#666; line-height:1.7; background:#f8f9fa; border-radius:6px; padding:8px 10px; margin-bottom:12px;">
                ${_en
                    ? '① Go to the panelook.com page below (#1) — the model shown may not be the latest — click the <b>"+"</b> button next to the searched panel name to add it (it may already be checked), then click the <b>"compare"</b> button in the "Panel Compare" box at the top right of the page.<br>&nbsp;&nbsp;→ A "slide to verify you\'re human" check may appear — only a human can pass it, so this step cannot be automated.<br>&nbsp;&nbsp;→ After it passes you land on the spec comparison page. Press <b>Ctrl+S</b> there and save it as <mark style="background:#ffe066; color:#7a5210; padding:0 3px; border-radius:3px;">"Webpage, Complete"</mark>.<br>② Click the button below (#2), then attach the saved <b>.html file</b> (the file itself, not its folder) and extract — AI will process it.'
                    : '① 아래 #1 panelook.com 페이지로 접속해서(최신은 없을 수도 있음), 검색된 패널명 앞의 <b>"+"</b> 버튼을 눌러 추가한 뒤(이미 눌려져 있을 수도 있음), 페이지 오른쪽 상단 "Panel Compare" 상자의 <b>"compare"</b> 버튼을 클릭하세요.<br>&nbsp;&nbsp;→ "사람인지 확인" 슬라이드 캡차가 뜰 수 있는데, 사람만 통과할 수 있어 자동화할 수 없습니다.<br>&nbsp;&nbsp;→ 통과하면 스펙 비교 페이지로 이동합니다. 그 페이지에서 <b>Ctrl+S</b>를 눌러 <mark style="background:#ffe066; color:#7a5210; padding:0 3px; border-radius:3px;">"웹페이지,전부 HTML"</mark>으로 저장하세요.<br>② 아래 #2 버튼을 누른 뒤, 저장한 <b>.html 파일</b>(폴더 제외)을 첨부하여 추출하면, AI가 처리합니다.'}
            </div>
            <a href="${url}" target="_blank" rel="noopener" style="display:inline-block; margin-bottom:10px; color:#2c5f8a;">🔗 #1 panelook.com${_en ? ' (open & copy manually)' : '에서 직접 확인·복사'}</a><br>
            <button onclick="document.getElementById('pc-spec-modal').style.display='none'; window.panelCompareReextract(${escapeHtml(JSON.stringify(model_display))});" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:8px 14px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">🤖 #2 ${_en ? 'Attach the HTML file & extract with AI' : 'HTML 파일 첨부 후 AI로 추출'}</button>
        `;
        return;
    }
    const inCompare = !!(window.tabData && window.tabData.panelCompare && window.tabData.panelCompare.selectedModels && window.tabData.panelCompare.selectedModels.indexOf(model_display) !== -1);
    let html = `<div style="font-size:13px; font-weight:bold; margin-bottom:2px;">${escapeHtml(entry.model)}</div>
        <div style="color:#888; margin-bottom:8px;">${escapeHtml(entry.brand || '')}</div>
        <a href="${escapeHtml(entry.sourceUrl || url)}" target="_blank" rel="noopener" style="color:#2c5f8a;">🔗 panelook.com ${_en ? 'search' : '검색'}</a>
        <div style="margin:10px 0;">
            ${inCompare
                ? `<span style="color:#2f9e44; font-weight:bold;">✓ ${_en ? 'Already in this project\'s comparison table' : '이 프로젝트 비교표에 있음'}</span>`
                : `<button onclick="window.panelCompareAddFromLibrary(${escapeHtml(JSON.stringify(model_display))}); document.getElementById('pc-spec-modal').style.display='none';" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">➕ ${_en ? 'Add to comparison table' : '비교표에 추가'}</button>`}
        </div>
        <div style="font-size:10px; color:#aaa; margin-bottom:8px;">${_en ? 'Updated' : '갱신'}: ${escapeHtml(entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '-')}</div>`;
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) {
        let secHtml = '';
        sec.fields.forEach(function(f) {
            const label = f[0];
            const v = (entry.specs && entry.specs[label] != null && entry.specs[label] !== '') ? entry.specs[label] : '-';
            if (v === '-') return; // 미리보기는 값이 있는 항목만 (한눈에 보기 편하게)
            secHtml += `<div style="display:flex; gap:6px; padding:2px 0;"><span style="flex:0 0 140px; color:#777;">${escapeHtml(label)}</span><span style="flex:1;">${escapeHtml(String(v))}</span></div>`;
        });
        if (secHtml) html += `<div style="font-weight:bold; color:#7a5210; margin-top:8px; padding:3px 0; border-top:1px solid #eee;">[${escapeHtml(sec.section)}]</div>` + secHtml;
    });
    bodyEl.innerHTML = html;
};

// 💡 비교표 헤더의 제거·재추출 버튼 — 표가 innerHTML로 통째로 다시 그려지므로 개별 리스너 대신
//    전역 위임 클릭으로 한 번만 바인딩. (⚠️ 모달 안쪽 버튼은 모달 박스의 event.stopPropagation()에
//    막혀 여기까지 전파되지 않으므로, 라이브러리 목록/스펙 모달의 버튼들은 인라인 onclick으로 직접 호출함)
document.addEventListener('click', function(e) {
    const rm = e.target.closest('[data-pc-remove]');
    if (rm) { window.panelCompareRemove(rm.dataset.pcRemove); return; }
    const re = e.target.closest('[data-pc-reextract]');
    if (re) { window.panelCompareReextract(re.dataset.pcReextract); return; }
    const ed = e.target.closest('[data-pc-edit]');
    if (ed) { window.panelCompareOpenEditModal(ed.dataset.pcEdit); return; }
});

// ─── 엑셀로 내보내기 (기존 exportToExcel과 동일하게 xlsx-js-style 재사용 — 섹션 헤더 파란 배경 + 모델명 하이퍼링크) ───
window.exportPanelCompareToExcel = async function() {
    const _en = window._currentLang === 'en';
    const pc = (window.tabData && window.tabData.panelCompare) || { selectedModels: [] };
    const models = (pc.selectedModels || []).slice(0, 10);
    if (!models.length) { alert(_en ? 'No panels in the comparison table yet.' : '비교표에 패널이 없습니다.'); return; }
    const lib = await window.loadPanelLibrary();
    const entries = models.map(function(m) { return window.findPanelInLibrary(lib, m); });
    const notes = pc.notes || {}; // 💡 화면의 Note 열(자유 메모)도 함께 내보냄

    const aoa = [];
    aoa.push(['Comparison table'].concat(models).concat(['Note']));
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) {
        aoa.push(['[' + sec.section + ']'].concat(models.map(function() { return ''; })).concat(['']));
        sec.fields.forEach(function(f) {
            const label = f[0];
            const row = [label];
            entries.forEach(function(entry) {
                const v = (entry && entry.specs && entry.specs[label] != null && entry.specs[label] !== '') ? entry.specs[label] : '-';
                row.push(String(v));
            });
            row.push(notes[label] || '');
            aoa.push(row);
        });
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 26 }].concat(models.map(function() { return { wch: 22 }; })).concat([{ wch: 24 }]);

    const sectionRowIdx = [];
    let rPtr = 1;
    window.PANEL_SPEC_SCHEMA.forEach(function(sec) { sectionRowIdx.push(rPtr); rPtr += 1 + sec.fields.length; });

    const range = XLSX.utils.decode_range(ws['!ref']);
    const thinBorder = { style: 'thin', color: { rgb: 'DDDDDD' } };
    for (let ri = 0; ri <= range.e.r; ri++) {
        const isHeader = ri === 0;
        const isSection = sectionRowIdx.indexOf(ri) !== -1;
        for (let ci = 0; ci <= range.e.c; ci++) {
            const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
            if (!cell) continue;
            // 💡 헤더 행("Comparison table"+모델명)은 회색, 구분(섹션) 행만 흐린 살구색 — 화면 표시와 통일
            cell.s = {
                font: { name: '맑은 고딕', sz: 10, bold: isHeader || isSection, color: { rgb: isSection ? '7A5210' : (isHeader ? '333333' : '1F2937') } },
                fill: isSection ? { patternType: 'solid', fgColor: { rgb: 'FFF8E6' } } : (isHeader ? { patternType: 'solid', fgColor: { rgb: window._cpXlsxRole('headerTint') } } : undefined),
                alignment: { vertical: 'center', horizontal: ci === 0 ? 'left' : 'center', wrapText: true },
                border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
            };
            if (isHeader && ci > 0 && ci <= models.length) { // 💡 맨 끝 Note 헤더 칸은 모델이 아니므로 제외
                const model = models[ci - 1];
                cell.l = { Target: 'https://www.panelook.com/modelsearch.php?keyword=' + encodeURIComponent(model), Tooltip: 'panelook.com search' };
            }
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PANEL COMP TABLE');
    const fileName = (window.driveSaveFilenameStr || window.exportFilenameStr || 'Panel') + '_비교표.xlsx';
    XLSX.writeFile(wb, fileName);
};

// ═══════════════════════════════════════════════════════════════════
// ⚡ [2026-08-26 신규] Elec Parts — Panel Compare와 동일한 패턴의 전기부품(CONV BD/AD BD...) 스펙 비교표.
//    Panel Compare 코드를 그대로 복제하지 않고 ELEC_PART_TYPES 설정(스키마+라이브러리 파일명)으로
//    여러 부품 종류를 하나의 엔진(window.ep*, window.elecCompare*)이 돌리게 만들었다 — 나중에
//    AD BD를 추가할 때는 스키마만 채우고 ELEC_PART_TYPES.adbd.schema에 넣으면 끝난다.
//    - 라이브러리 항목 키(model)는 "Item Code_Part Name" 결합 문자열(예: 301782_KCB-02508B-60).
//    - Electrical Spec의 Min/Typ/Max는 패널의 "Brightness (Min/Typ)"처럼 한 필드에 " / "로 결합.
//    - 커넥터 핀아웃(J1/J2/J3 등)은 비교표엔 요약 행만 노출하고, 항목별 전체 핀맵은 entry.connectors에
//      구조화된 채로 저장해뒀다가 "🔌 핀맵 보기" 모달에서만 펼쳐 보여준다(완제품 SPEC 자동 생성 기능에서
//      이 데이터를 그대로 재사용할 예정).
//    - PDF/HTML → 텍스트 추출은 Panel Compare가 만들어둔 window._pcExtractPdfText / _pcExtractHtmlText /
//      _pcCleanExtractedText를 그대로 재사용한다(패널 전용 로직이 아니라 범용 텍스트 추출이라 재사용 가능).
// ═══════════════════════════════════════════════════════════════════

window.CONV_BD_SPEC_SCHEMA = [
    { section: 'Basic Information', fields: [
        ['Brand', 1], ['Item Code', 1], ['Part Name', 1], ['Revision', 1], ['Item Description', 2],
    ]},
    { section: 'Application / Load', fields: [
        ['Suitable Load', 1], ['Application', 2],
    ]},
    { section: 'Electrical Specification', fields: [
        ['Input Voltage (Min/Typ/Max)', 1], ['Input Current (Max)', 1],
        ['Output Voltage (Min/Max)', 1], ['String Output Current (Min/Typ/Max)', 1],
        ['Output Power (Max)', 1], ['ON Signal (Min/Max)', 1], ['OFF Signal (Min/Max)', 1],
        ['Dimming Signal (Min/Max)', 1], ['Operating Temperature (Min/Max)', 1],
    ]},
    { section: 'Dimension', fields: [
        ['Board Size (WxH)', 1], ['Outline Depth', 1],
    ]},
    { section: 'Interface', fields: [
        ['Input Connector (Model/Pins)', 2], ['Output Connector (Model/Pins/Qty)', 2],
        ['Output Channels', 1], ['Control Signals', 2],
    ]},
    { section: 'Other', fields: [
        ['Expected Price', 1], ['Note', 1],
    ]},
];

// 💡 [2026-08-26 신규] AD BD(스케일러 보드, 예: ADONIS-QHD) 스펙 스키마. 필드 튜플의 3·4번째 값은
//    드롭다운 선택 지원용 — ['라벨', 우선순위, 'enum', ['Enable','Disable']] 형태면 미리보기 폼에서
//    Enable/Disable/기타(자유 텍스트) 드롭다운으로 렌더링된다(그 외 필드는 CONV BD와 동일하게 자유 텍스트).
window.AD_BD_SPEC_SCHEMA = [
    { section: 'Basic Information', fields: [
        ['Brand', 1], ['Item Code', 1], ['Part Name', 1], ['Revision', 1], ['Item Description', 2],
    ]},
    { section: 'Application', fields: [
        ['Application', 2], ['Max/Native Resolution', 1],
    ]},
    { section: 'Video Processing', fields: [
        ['Scaler IC', 1],
        ['Input Signal', 1], ['Output Signal', 1],
        ['Color Depth', 2], ['OSD Support', 2],
        ['Resize Function', 1, 'enum', ['Enable', 'Disable']],
        ['Flip/Mirror Function', 1, 'enum', ['Enable', 'Disable']],
        ['OSD Rotation Function', 1, 'enum', ['Enable', 'Disable']],
    ]},
    { section: 'Electrical Specification', fields: [
        ['Input Voltage', 1], ['Input Power/Current', 2], ['DPMS Support', 2],
    ]},
    { section: 'Dimension', fields: [
        ['Board Size (WxH)', 1], ['Outline Depth', 1],
    ]},
    { section: 'Interface', fields: [
        ['Input Connector (Model/Pins)', 2], ['Output Connector (Model/Pins)', 2],
        ['Power Connector', 2], ['Control Connector', 2], ['OSD Key Count', 2],
    ]},
    { section: 'Other', fields: [
        ['Expected Price', 1], ['Note', 1],
    ]},
];

window.ELEC_PART_TYPES = {
    convbd: { label: 'CONV', icon: '🔌', domain: 'LED 드라이버/컨버터 보드', libFilename: 'ElecPartLib_CONVBD_Shared.json', schema: window.CONV_BD_SPEC_SCHEMA },
    adbd: { label: 'AD BD', icon: '🔲', domain: '스케일러(A/D) 보드', libFilename: 'ElecPartLib_ADBD_Shared.json', schema: window.AD_BD_SPEC_SCHEMA },
};

// 💡 [2026-08-26] 예전엔 라벨 문자열만 뽑았는데, enum 필드(Resize Function 등)의 허용값을 AI 프롬프트에도
//    알려주려면 필드 튜플 전체([라벨, 우선순위, type?, options?])가 필요해서 원본 튜플을 그대로 반환하게 바꿨다.
window._epFlatFields = function(type) {
    const cfg = window.ELEC_PART_TYPES[type];
    const out = [];
    ((cfg && cfg.schema) || []).forEach(function(sec) { sec.fields.forEach(function(f) { out.push(f); }); });
    return out;
};

// ─── 팀 공용 전기부품 스펙 라이브러리 (AddressBook/project_index.json·Panel Compare와 동일한 Drive 업서트 패턴) ───
window._epLibFileIds = {};
window.findElecPartLibFile = async function(type, token) {
    if (window._epLibFileIds[type]) return window._epLibFileIds[type];
    const cfg = window.ELEC_PART_TYPES[type];
    if (!cfg || !cfg.libFilename) return null;
    const folderId = await window.getOrCreateConfigFolder(token);
    const id = await window._findOrMigrateFile(token, cfg.libFilename, folderId);
    if (id) window._epLibFileIds[type] = id;
    return id;
};
window._epNamesMatch = function(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); };
// 💡 [2026-08-27 신규 — 안전장치] "PBA Name" → "Part Name" 필드명 변경 이전에 이미 라이브러리에
//    저장된 항목(옛 키로 저장됨)도 화면에서 계속 정상적으로 표시되도록, 새 키가 없으면 옛 키로 폴백한다.
//    새로 AI 추출하는 항목은 프롬프트가 이미 "Part Name"으로 답하므로 이 폴백을 안 타게 된다.
window._epPartNameOf = function(specs) {
    if (!specs) return '';
    if (specs['Part Name'] && specs['Part Name'] !== '-') return specs['Part Name'];
    if (specs['PBA Name'] && specs['PBA Name'] !== '-') return specs['PBA Name'];
    return '';
};

// 💡 [2026-08-27 신규 — 안전장치] Summary 주요자재 설명칸에 "코드_이름"(예: 301782_KCB-02508B-60),
//    "이름만"(예: MV315QHB-N41-A000), "코드만"(예: 303222) 중 무엇을 적어도 🔎가 라이브러리에서
//    찾아내도록 하는 범용 매처. 완전일치(대소문자·공백 차이 무시)를 먼저 시도하고, 실패하면 쿼리를
//    "6자리 코드" + "나머지 이름"으로 쪼개 Item Code/Part Name 필드와 각각 대조한다.
window._epNormalizeKey = function(s) {
    return String(s || '').trim().toUpperCase()
        .replace(/\s*-\s*/g, '-')   // "A - B" -> "A-B"
        .replace(/\s*_\s*/g, '_')   // "A _ B" -> "A_B"
        .replace(/\s+/g, ' ')
        .trim();
};
window._epFlexibleFind = function(items, query, getModel, getItemCode, getPartName) {
    const norm = window._epNormalizeKey;
    const q = norm(query);
    if (!q || !items || !items.length) return null;

    // 1) 완전일치 — 기존 동작 그대로(대소문자/공백 차이만 무시)
    let hit = items.find(function(it) { return norm(getModel(it)) === q; });
    if (hit) return hit;

    // 쿼리 맨 앞의 6자리 숫자(Item Code)와 나머지(이름)를 분리 시도
    const m = q.match(/^(\d{6})[_\-\s]+(.+)$/);
    const qCode = m ? m[1] : (/^\d{6}$/.test(q) ? q : null);
    const qName = m ? m[2] : (/^\d{6}$/.test(q) ? '' : q);

    // 2) 코드만 입력된 경우 — Item Code로 매칭
    if (qCode && !qName) {
        hit = items.find(function(it) { return norm(getItemCode(it)) === qCode; });
        if (hit) return hit;
    }
    // 3) 코드+이름이 모두 있는 경우 — 코드 일치 우선(이름 표기 차이는 무시)
    if (qCode && qName) {
        hit = items.find(function(it) { return norm(getItemCode(it)) === qCode; });
        if (hit) return hit;
    }
    // 4) 이름만 입력된 경우(코드 없이) — Part Name 또는 "코드_이름" 형태 모델 키의 뒷부분과 대조
    if (qName) {
        hit = items.find(function(it) { return norm(getPartName(it)) === qName; });
        if (hit) return hit;
        hit = items.find(function(it) {
            const modelNorm = norm(getModel(it));
            return modelNorm === qName || modelNorm.endsWith('_' + qName) || modelNorm.endsWith('-' + qName);
        });
        if (hit) return hit;
    }
    return null;
};
window.findElecPartInLibrary = function(lib, model) {
    const items = (lib && lib.items) || [];
    return window._epFlexibleFind(
        items, model,
        function(p) { return p.model; },
        function(p) { return p.specs && p.specs['Item Code']; },
        function(p) { return window._epPartNameOf(p.specs); }
    );
};
window.loadElecPartLibrary = async function(type) {
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return { items: [] };
        const fileId = await window.findElecPartLibFile(type, token);
        if (!fileId) return { items: [] };
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return (data && Array.isArray(data.items)) ? data : { items: [] };
    } catch (e) { console.warn('전기부품 라이브러리 로드 실패:', e.message); return { items: [] }; }
};
// 💡 [2026-08-31 신규 — 사고 방지] "파일이 있는지 찾아보고 없으면 만든다"는 흐름 사이에 잠금장치가
//    없어서, 두 사람(또는 탭 2개)이 거의 동시에 저장하면 둘 다 "없다"고 판단해 똑같은 이름의 파일을
//    2개씩 만들어버리는 사고가 실제로 있었다(ElecPartLib_ADBD_Shared.json이 2개 생성됨). AddressBook의
//    낙관적 동시성 제어(_lastKnownSavedAt)와 동일한 아이디어를, 전체 내용을 다시 받을 필요 없이
//    Drive의 modifiedTime 메타데이터만으로 가볍게 구현 — ①읽을 때 그 시점의 modifiedTime을 기억해두고,
//    ②쓰기 직전 한 번 더 확인해서 그 사이 바뀌었으면(=남이 먼저 저장함) 내 오래된 내용으로 덮어쓰지
//    않고 중단, 최신본을 다시 불러오게 안내한다.
window._epLibKnownModifiedTime = {};

window._epFetchModifiedTime = async function(fileId, token) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime&supportsAllDrives=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return data && data.modifiedTime;
};

window.upsertElecPartLibraryEntry = async function(type, entry) {
    const _en = window._currentLang === 'en';
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { alert(_en ? '🔒 Please connect Google Drive first.' : '🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return false; }
        let fileId = await window.findElecPartLibFile(type, token);
        let lib = { items: [] };
        let knownModifiedTime = null;
        if (fileId) {
            const [res, modifiedTime] = await Promise.all([
                fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } }),
                window._epFetchModifiedTime(fileId, token)
            ]);
            const loaded = await res.json();
            if (loaded && Array.isArray(loaded.items)) lib = loaded;
            knownModifiedTime = modifiedTime;
        }
        const idx = lib.items.findIndex(function(p) { return window._epNamesMatch(p.model, entry.model); });
        entry.updatedAt = new Date().toISOString();
        entry.updatedBy = window.currentUserName || '';
        if (idx === -1) lib.items.push(entry); else lib.items[idx] = entry;
        const body = JSON.stringify(lib);
        const cfg = window.ELEC_PART_TYPES[type];
        if (fileId) {
            // 낙관적 동시성 제어 — 쓰기 직전, 내가 읽은 이후로 다른 사람이 먼저 저장하지 않았는지 재확인
            try {
                const currentModifiedTime = await window._epFetchModifiedTime(fileId, token);
                if (knownModifiedTime && currentModifiedTime && currentModifiedTime !== knownModifiedTime) {
                    const msg = _en
                        ? '⚠️ This library was just updated by someone else. Your changes were NOT saved — please reload and try again.'
                        : '⚠️ 다른 팀원이 방금 이 라이브러리를 먼저 저장했습니다. 오래된 내용으로 덮어쓰지 않기 위해 저장을 중단했습니다 — 다시 불러온 뒤 시도해주세요.';
                    if (window.showToast) window.showToast(msg, 'warning', 6000); else alert(msg);
                    return false; // 캐시된 파일 id 자체는 안 바뀌므로 window._epLibFileIds는 그대로 둬도 됨 — 다음 저장 때 다시 최신 내용을 읽어옴
                }
            } catch (checkErr) { console.warn('전기부품 라이브러리 동시성 확인 실패(그냥 진행):', checkErr.message); }

            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body
            });
        } else {
            // 생성 직전 한 번 더 재확인 — 그 사이 다른 사람이 이미 만들었으면 새로 만들지 않고 그 파일에 이어서 저장(중복 생성 방지)
            const folderId = await window.getOrCreateConfigFolder(token);
            const recheckId = await window._findOrMigrateFile(token, cfg.libFilename, folderId);
            if (recheckId) {
                window._epLibFileIds[type] = recheckId;
                return window.upsertElecPartLibraryEntry(type, entry); // 방금 알아낸 fileId로 update 경로를 다시 탐
            }
            const boundary = 'elec_part_lib_boundary';
            const metadata = { name: cfg.libFilename, mimeType: 'application/json', parents: [folderId] };
            const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body + "\r\n--" + boundary + "--";
            const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` }, body: multipartBody
            });
            const created = await createRes.json();
            if (created && created.id) window._epLibFileIds[type] = created.id;
        }
        return true;
    } catch (e) { alert((_en ? 'Failed to save library: ' : '라이브러리 저장 실패: ') + e.message); return false; }
};
window._epLibRemoveEntry = async function(type, model) {
    try {
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return false;
        const fileId = await window.findElecPartLibFile(type, token);
        if (!fileId) return true;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } });
        const loaded = await res.json();
        if (!loaded || !Array.isArray(loaded.items)) return true;
        const before = loaded.items.length;
        loaded.items = loaded.items.filter(function(p) { return !window._epNamesMatch(p.model, model); });
        if (loaded.items.length === before) return true;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(loaded)
        });
        return true;
    } catch (e) { console.warn('전기부품 라이브러리 항목 삭제 실패:', e.message); return false; }
};

// ─── AI 추출: 붙여넣은 스펙 텍스트 → 스키마 필드 JSON + 커넥터 핀맵 구조 ───
window._EP_EXTRACT_TEXT_LIMIT = 32000;
