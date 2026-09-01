// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 4857~6049행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 탭 · 서머리 · M.C테이블 렌더링 4/4
window._epBuildExtractPrompt = function(type, rawText) {
    const cfg = window.ELEC_PART_TYPES[type];
    const fields = window._epFlatFields(type);
    const keyListText = fields.map(function(f) {
        return '- "' + f[0] + '"' + (f[2] === 'enum' ? ' (값은 ' + f[3].join('/') + ' 중 하나를 우선 쓰고, 둘 다 아니면 문서에 표현된 실제 값을 그대로)' : '');
    }).join('\n');
    // 💡 [2026-08-28 신규] "Output Channels(채널 수)를 못 가져오는 경우가 많다"는 지적 — 실측해보니
    //    실제 승인원/SPEC 문서에는 "Output Channels: 4"처럼 라벨을 달고 나오는 경우가 없고, 대신
    //    ① 승인원 표지의 "Sub-Description"란에 다른 값들과 콤마로 묶여 "0.48A,4CH,ADM"처럼 압축
    //    표기되거나, ② 그마저 없으면 "Suitable Load"의 스트링 수(예: "4strings x 1bar"의 4)로만
    //    간접적으로 드러난다(이 보드류는 통상 1 string = 1 channel). 이 두 단서를 명시적으로 알려주지
    //    않으면 AI가 "Output Channels"라는 문구 자체를 찾다가 못 찾고 빈칸으로 남겼다.
    const hasOutputChannels = fields.some(function(f) { return f[0] === 'Output Channels'; });
    const outputChannelsRule = hasOutputChannels
        ? '\n8. "Output Channels"(채널 수)는 문서에 그 문구 그대로 나오는 경우가 드뭅니다. 아래 순서로 값을 찾으세요:\n   ① "Sub-Description"/"Item Description" 등에 다른 값과 콤마로 묶여 나오는 "N CH"/"NCH" 표기(예: "0.48A,4CH,ADM"의 "4CH") → 숫자만 취해 "4"로 답하세요.\n   ② ①이 없으면 "Suitable Load"에 적힌 스트링(string) 개수(예: "4strings x 1bar"의 "4")를 채널 수로 간주하세요(이 보드류는 보통 1 string = 1 channel).\n   ③ 위 두 방법으로도 근거를 못 찾으면 "-"로 답하세요(지어내지 마세요).'
        : '';
    return `당신은 디스플레이용 ${cfg.domain}(${cfg.label}) 데이터시트 분석 전문가입니다.
아래 [원문 텍스트]는 ${cfg.label} 스펙 문서(승인원, Specification 등)에서 사용자가 복사했거나 PDF에서 추출한 내용입니다.
여기서 스펙 정보를 추출해서, 아래 형식의 JSON 객체 하나로만 답하세요(다른 설명이나 마크다운 코드블럭 없이 JSON 객체 하나만).

최상위 키:
1. 스펙 항목들(키 이름을 한 글자도 다르지 않게 정확히 그대로 사용):
${keyListText}
2. "Connectors": 입력/출력 커넥터별 핀맵 배열. 각 원소는 다음 형태:
   { "name": "J1", "role": "INPUT 또는 OUTPUT 등", "model": "커넥터 모델명(예: 12505WR-12A)", "pins": [ { "no": "핀번호(예: 1,2,3)", "symbol": "핀 심볼(예: VIN)", "desc": "설명" }, ... ] }
   "role"은 문서에 적힌 표기를 있는 그대로 쓰세요 — OUTPUT이 여러 개라 문서가 "OUTPUT 1"/"OUTPUT 2"처럼 번호를 붙여 구분해뒀다면(예: "6.2 OUTPUT 1: ...(J2)", "6.3 OUTPUT 2: ...(J5)") 그 번호까지 그대로 유지하세요(예: "OUTPUT 1", "OUTPUT 2") — 커넥터 이름(J2 vs J5)이 달라도 "OUTPUT"으로 뭉뚱그리면 문서가 구분해둔 정보가 사라집니다. 문서에 번호가 없으면 번호 없이 "INPUT"/"OUTPUT"만 쓰세요.
   문서에 커넥터/핀 테이블이 없으면 빈 배열 []로 답하세요.

규칙:
1. 텍스트 안에서 찾을 수 없는 스펙 항목은 반드시 정확히 "-" 하나로 채우세요. 추측하거나 지어내지 마세요.
2. 값은 원문 표기(단위 포함)를 최대한 그대로 유지하세요.
3. "Input Voltage (Min/Typ/Max)"처럼 Min/Typ/Max가 나뉜 항목은 "10.8V / 12~24V / 26.4V" 형식처럼 " / "로 이어붙여 하나의 값으로 답하세요. 값이 없는 자리는 "-"로 채우세요(예: "10.8V / - / 26.4V").
4. "Brand"는 문서에 제조사명이 명시되어 있으면 그대로 쓰고, 없으면 "-"로 답하세요(내부 제작 문서라면 회사명이 곧 Brand입니다).
5. "Item Code"는 사내 관리번호(예: 301782)처럼 숫자/코드 형태의 고유 식별자, "Part Name"은 제품/모델 명칭(예: KCB-02508B-60, GH765A(A1))입니다 — 문서에 원래 하나로만 표기되어 있어도 이 두 성격에 맞게 나눠서 채우세요.
6. 위에 나열된 스펙 키 이름을 한 글자도 다르지 않게 정확히 그대로 사용하세요. "Connectors"의 하위 키(name/role/model/pins/no/symbol/desc)도 정확히 그대로 사용하세요.
7. 한 항목에 값이 여러 줄/여러 개로 나열된 경우(예: "Suitable Load"가 "8strings x 2bars"와 "4strings x 4bars"처럼 서로 다른 두 가지 구성으로 표기된 경우) — 절대 하나만 골라서 답하거나 빈칸("-")으로 남기지 말고, 발견한 값 전부를 세미콜론과 공백("; ")으로 이어붙여 하나의 문자열로 답하세요(예: "8strings x 2bars; 4strings x 4bars"). 이 규칙은 위 3번(Min/Typ/Max 전용 " / " 구분자)과는 별개이며, Min/Typ/Max처럼 정해진 자리가 없는 임의 개수의 나열형 값에 적용합니다.${outputChannelsRule}

[원문 텍스트]
${(rawText || '').substring(0, window._EP_EXTRACT_TEXT_LIMIT)}`;
};
window._epParseAiJson = function(text) {
    if (!text) return null;
    let s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = s.indexOf('{'); const end = s.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
};

// ─── 탭 렌더링 ───
window._epExpanded = {}; // type별 부가스펙 펼침 상태
window._epLibCache = {}; // type별 라이브러리 캐시
window._epRenderedEntries = {}; // type별로 마지막에 그려진 entries — 사진 순환 클릭 시 재조회 없이 참조
window.renderElecCompareTab = async function(type) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    const theadEl = document.getElementById('ep-' + type + '-thead');
    const tbodyEl = document.getElementById('ep-' + type + '-tbody');
    if (!theadEl || !tbodyEl || !cfg || !cfg.schema) return;

    window.tabData = window.tabData || {};
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare[type] = window.tabData.elecCompare[type] || { selectedModels: [], notes: {} };
    const ec = window.tabData.elecCompare[type];
    ec.notes = ec.notes || {};

    theadEl.innerHTML = `<tr><th colspan="99" style="padding:16px; text-align:center; color:#999; background:#fff;">${_en ? 'Loading…' : '불러오는 중...'}</th></tr>`;
    tbodyEl.innerHTML = '';
    const lib = await window.loadElecPartLibrary(type);
    window._epLibCache[type] = lib;

    const selected = ec.selectedModels.slice(0, 10);
    const slotCount = Math.max(2, selected.length); // 💡 기본 최소 2개 비교 슬롯을 항상 보여줌
    const entries = selected.map(function(m) { return window.findElecPartInLibrary(lib, m); });
    const totalCols = 1 + slotCount + 1; // 라벨 + 슬롯들 + Note

    let headHtml = '<tr>';
    headHtml += `<th style="min-width:140px;">Comparison table</th>`;
    for (let i = 0; i < slotCount; i++) {
        const m = selected[i];
        if (m) {
            const has = !!entries[i];
            const entry = entries[i];
            const displayName = entry ? (window._epPartNameOf(entry.specs) || m) : m;
            // 💡 [2026-08-27] Item Code(6자리 숫자)는 표 아래 Basic Information 행에 이미 나오므로
            //    헤더에 중복 표시할 필요 없음 — 요청에 따라 헤더에서는 뺌.
            headHtml += `<th style="min-width:130px; padding-left:6px; padding-right:6px; padding-top:4px !important; padding-bottom:4px !important;">
                <span style="color:#2c5f8a; font-weight:bold; word-break:break-all;">${escapeHtml(displayName)}</span>
                <div style="margin-top:2px; display:flex; gap:4px; justify-content:center; align-items:center; flex-wrap:wrap;">
                    ${has ? `<button data-ep-edit="${escapeHtml(type)}|${escapeHtml(m)}" title="${_en ? 'Edit spec' : '스펙 수정'}" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="background:#fbead9; border:1px solid #edbf85; border-radius:3px; color:#a85d0a; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">✏️</button>` : ''}
                    <button data-ep-reextract="${escapeHtml(type)}|${escapeHtml(m)}" title="${_en ? 'Re-extract / refresh' : '다시 추출/갱신'}" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:3px; color:#1a4f7a; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">🔄</button>
                    <button data-ep-remove="${escapeHtml(type)}|${escapeHtml(m)}" title="${_en ? 'Remove from this comparison' : '이 프로젝트에서 제거'}" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="background:#fbe4e2; border:1px solid #eeb0ac; border-radius:3px; color:#b1432f; font-size:10px; cursor:pointer; padding:0 3px; line-height:1.6; transition:background .15s, border-color .15s;">🗑</button>
                    ${!has ? `<span style="font-size:9.5px; color:#e67e22; font-weight:bold; white-space:nowrap;">⚠ ${_en ? 'Not extracted' : '미추출'}</span>` : ''}
                </div>
            </th>`;
        } else {
            headHtml += `<th class="ep-slot-empty" style="min-width:120px; cursor:pointer;" onclick="window.elecCompareOpenAddModal(${escapeHtml(JSON.stringify(type))})" title="${_en ? 'Click to add' : '클릭해서 추가'}">
                ${_en ? '+ Add' : '+ 추가'}
            </th>`;
        }
    }
    headHtml += `<th style="min-width:130px;">Note</th>`;
    headHtml += '</tr>';
    theadEl.innerHTML = headHtml;

    let html = '';
    cfg.schema.forEach(function(sec) {
        html += `<tr class="ep-section-row"><td colspan="${totalCols}" style="background:#fff8e6; color:#7a5210; font-weight:bold; padding:5px 10px; border:1px solid #e3e6ea;">[${escapeHtml(sec.section)}]</td></tr>`;
        sec.fields.forEach(function(f) {
            const label = f[0], priority = f[1];
            const rowStyle = priority === 2 ? ('display:' + (window._epExpanded[type] ? 'table-row' : 'none') + ';') : '';
            html += `<tr class="${priority === 2 ? 'ep-p2-row' : ''}" style="${rowStyle}">`;
            html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px; color:#555; white-space:nowrap;">${escapeHtml(label)}</td>`;
            for (let i = 0; i < slotCount; i++) {
                const entry = entries[i];
                const v = entry && entry.specs && entry.specs[label] != null && entry.specs[label] !== '' ? entry.specs[label] : '-';
                html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px;">${selected[i] ? escapeHtml(String(v)) : ''}</td>`;
            }
            const noteVal = ec.notes[label] || '';
            html += `<td style="border:1px solid #e9ecef; padding:2px 4px; font-size:12px;"><input type="text" value="${escapeHtml(noteVal)}" onchange="window.elecCompareSetNote(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(label))}, this.value)" style="width:100%; box-sizing:border-box; border:none; font-size:11.5px; padding:2px 4px; background:transparent; text-align:center;"></td>`;
            html += '</tr>';
        });
        // 💡 Interface 섹션에만 "핀맵 보기" 요약 행을 하나 추가 — 스키마 필드는 아니지만, AI 추출 시
        //    함께 저장해둔 entry.connectors(J1/J2/J3 등 전체 핀아웃)를 여기서만 볼 수 있게 한다.
        if (sec.section === 'Interface') {
            html += `<tr><td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px; color:#555; white-space:nowrap;">Pin map</td>`;
            for (let i = 0; i < slotCount; i++) {
                const entry = entries[i];
                const hasConn = entry && Array.isArray(entry.connectors) && entry.connectors.length;
                html += `<td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px;">`;
                if (selected[i]) {
                    html += hasConn
                        ? `<button data-ep-pinmap="${escapeHtml(type)}|${escapeHtml(selected[i])}" class="ep-theme-hover-btn" style="background:#e8f4fd; border:1px solid #a5c8f0; border-radius:4px; color:#1a4f7a; font-size:10.5px; cursor:pointer; padding:2px 8px; transition:background .15s, border-color .15s;">🔌 ${_en ? 'View' : '보기'}</button>`
                        : `<span style="color:#bbb;">-</span>`;
                }
                html += `</td>`;
            }
            html += `<td style="border:1px solid #e9ecef;"></td></tr>`;
        }
    });
    // 💡 [2026-08-26 신규] 사진(최대 2장) — 도표 맨 하단에 한 행으로. 한 번에 1장만 보여주고
    //    클릭하면 다음 장으로 순환(마지막 다음은 다시 1장) — window._epCycleImage가 재렌더 없이 img만 갱신.
    html += `<tr class="ep-section-row"><td colspan="${totalCols}" style="background:#fff8e6; color:#7a5210; font-weight:bold; padding:5px 10px; border:1px solid #e3e6ea;">[Picture]</td></tr>`;
    html += `<tr><td style="border:1px solid #e9ecef; padding:3px 6px; font-size:12px; color:#555; white-space:nowrap;">Picture</td>`;
    for (let i = 0; i < slotCount; i++) {
        const entry = entries[i];
        const images = (entry && Array.isArray(entry.images)) ? entry.images : [];
        html += `<td style="border:1px solid #e9ecef; padding:4px 6px;">`;
        if (selected[i] && images.length) {
            html += `<img id="ep-img-thumb-${escapeHtml(type)}-${i}" src="${images[0].data}" data-idx="0"
                    onclick="window._epCycleImage(${escapeHtml(JSON.stringify(type))}, ${i})"
                    ondblclick="event.stopPropagation(); window.showElecPhotoLightbox(${escapeHtml(JSON.stringify(type))}, ${i})"
                    title="${_en ? 'Click for next photo, double-click to zoom in' : '클릭하면 다음 사진, 더블클릭하면 크게 보기'}"
                    style="max-width:120px; max-height:88px; cursor:pointer; border:1px solid #ced4da; border-radius:4px; object-fit:cover;">`;
            if (images.length > 1) html += `<div id="ep-img-counter-${escapeHtml(type)}-${i}" style="font-size:9.5px; color:#999; margin-top:2px;">1/${images.length}</div>`;
        } else if (selected[i]) {
            html += `<span style="color:#bbb;">-</span>`;
        }
        html += `</td>`;
    }
    html += `<td style="border:1px solid #e9ecef;"></td></tr>`;
    tbodyEl.innerHTML = html;
    window._epRenderedEntries[type] = entries; // _epCycleImage가 재조회 없이 바로 참조하도록 캐시
    window._epApplyZebra(type);

    const toggleBtn = document.getElementById('ep-' + type + '-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = window._epExpanded[type] ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
};

window.elecCompareSetNote = function(type, label, value) {
    window.tabData = window.tabData || {};
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare[type] = window.tabData.elecCompare[type] || { selectedModels: [], notes: {} };
    const ec = window.tabData.elecCompare[type];
    ec.notes = ec.notes || {};
    const oldVal = ec.notes[label] || '';
    ec.notes[label] = value;
    window.epLogChange(type, label, 'Note', oldVal, value);
};

window.elecCompareToggleExpand = function(type) {
    window._epExpanded[type] = !window._epExpanded[type];
    document.querySelectorAll('#ep-' + type + '-table .ep-p2-row').forEach(function(tr) { tr.style.display = window._epExpanded[type] ? 'table-row' : 'none'; });
    const toggleBtn = document.getElementById('ep-' + type + '-toggle-btn');
    const _en = window._currentLang === 'en';
    if (toggleBtn) toggleBtn.textContent = window._epExpanded[type] ? (_en ? '🔼 Collapse' : '🔼 접기') : (_en ? '🔽 Expand' : '🔽 펼치기');
    window._epApplyZebra(type);
};

window._epApplyZebra = function(type) {
    const rows = document.querySelectorAll('#ep-' + type + '-table tbody tr:not(.ep-section-row)');
    let i = 0;
    rows.forEach(function(tr) {
        tr.classList.remove('mc-zebra-a', 'mc-zebra-b');
        if (tr.style.display === 'none') return;
        tr.classList.add(i % 2 === 0 ? 'mc-zebra-a' : 'mc-zebra-b');
        i++;
    });
};

// 💡 사진 클릭 → 다음 장으로 순환. 표 전체를 다시 그리지 않고 그 셀의 img/카운터만 갱신한다.
window._epCycleImage = function(type, i) {
    const entries = window._epRenderedEntries[type];
    const entry = entries && entries[i];
    const images = entry && Array.isArray(entry.images) ? entry.images : [];
    if (images.length < 2) return; // 0~1장이면 순환할 게 없음
    const imgEl = document.getElementById('ep-img-thumb-' + type + '-' + i);
    if (!imgEl) return;
    const nextIdx = (parseInt(imgEl.dataset.idx || '0', 10) + 1) % images.length;
    imgEl.dataset.idx = nextIdx;
    imgEl.src = images[nextIdx].data;
    const counterEl = document.getElementById('ep-img-counter-' + type + '-' + i);
    if (counterEl) counterEl.textContent = (nextIdx + 1) + '/' + images.length;
};

// ─── 📷 사진 크게 보기(라이트박스) — 여러 장이면 좌우로 이동 가능. Elec Parts 표뿐 아니라 Summary
//    제품사진에서도 그대로 재사용할 수 있게, "이미지 배열 하나 크게 보여주기"라는 범용 코어(_openImageLightbox)와
//    호출부(사진 위치를 어디서 가져오는지)를 분리했다. 모달 자체는 다른 Elec Parts 모달과 동일한 기본
//    패턴을 따른다: 드래그 가능한 헤더, ✕/바깥 클릭으로 닫기, bringModalToFront로 항상 맨 위에 오게.
window._epLightboxState = null; // { images: [...], idx, onSync? } — onSync(idx)는 작은 썸네일 등 호출부 UI 동기화용(선택)
window._openImageLightbox = function(images, startIdx, title, onSync) {
    if (!images || !images.length) return;
    window._epLightboxState = {
        images: images,
        idx: ((startIdx % images.length) + images.length) % images.length,
        onSync: onSync || null
    };

    let modal = document.getElementById('ep-lightbox-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ep-lightbox-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ep-lightbox-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:280px;">
            <div id="ep-lightbox-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="ep-lightbox-title">📷 Picture</span>
                <button onclick="document.getElementById('ep-lightbox-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div style="position:relative; flex:1; display:flex; align-items:center; justify-content:center; padding:16px; overflow:auto; background:#fff; min-height:200px;">
                <button id="ep-lightbox-prev" onclick="window._epLightboxNav(-1)" title="Previous" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.85); border:1px solid #ddd; border-radius:50%; width:34px; height:34px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">‹</button>
                <img id="ep-lightbox-img" style="max-width:100%; max-height:70vh; object-fit:contain;">
                <button id="ep-lightbox-next" onclick="window._epLightboxNav(1)" title="Next" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.85); border:1px solid #ddd; border-radius:50%; width:34px; height:34px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">›</button>
            </div>
            <div id="ep-lightbox-counter" style="text-align:center; padding:8px; font-size:12px; color:#666; flex-shrink:0;"></div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ep-lightbox-box', 'ep-lightbox-drag');
        window._bindClickToFront('ep-lightbox-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
        // 열려있는 동안엔 좌우 화살표 키/Esc로도 넘기고 닫을 수 있게
        document.addEventListener('keydown', function(e) {
            if (!window._epLightboxState) return;
            const m = document.getElementById('ep-lightbox-modal');
            if (!m || m.style.display === 'none') return;
            if (e.key === 'ArrowLeft') window._epLightboxNav(-1);
            else if (e.key === 'ArrowRight') window._epLightboxNav(1);
            else if (e.key === 'Escape') m.style.display = 'none';
        });
    }
    modal.style.display = 'block';
    window.bringModalToFront('ep-lightbox-modal');
    const titleEl = document.getElementById('ep-lightbox-title');
    if (titleEl) titleEl.textContent = '📷 ' + (title || '');
    window._epRenderLightbox();
};

// 💡 라이트박스 이미지/카운터/이전·다음 버튼을 현재 idx에 맞춰 갱신하고, onSync가 있으면 호출부(작은
//    썸네일 등)도 같은 위치로 동기화한다 — 그래야 라이트박스를 닫고 다시 열었을 때 이어서 보여줄 수 있다.
window._epRenderLightbox = function() {
    const st = window._epLightboxState;
    if (!st) return;
    const images = st.images || [];
    if (!images.length) return;
    const idx = ((st.idx % images.length) + images.length) % images.length;
    st.idx = idx;
    const imgEl = document.getElementById('ep-lightbox-img');
    if (imgEl) imgEl.src = images[idx].data;
    const multi = images.length > 1;
    const counterEl = document.getElementById('ep-lightbox-counter');
    if (counterEl) counterEl.textContent = multi ? (idx + 1) + ' / ' + images.length : '';
    const prevBtn = document.getElementById('ep-lightbox-prev');
    const nextBtn = document.getElementById('ep-lightbox-next');
    if (prevBtn) prevBtn.style.display = multi ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = multi ? 'flex' : 'none';
    if (st.onSync) st.onSync(idx);
};
window._epLightboxNav = function(dir) {
    if (!window._epLightboxState) return;
    window._epLightboxState.idx += dir;
    window._epRenderLightbox();
};

// 💡 Elec Parts 표의 작은 사진 썸네일 전용 진입점 — 라이트박스에서 넘긴 위치를 작은 썸네일에도
//    그대로 동기화해서, 닫고 표에서 다시 클릭했을 때도 이어서 순환되게 한다.
window.showElecPhotoLightbox = function(type, i) {
    const entries = window._epRenderedEntries[type];
    const entry = entries && entries[i];
    const images = entry && Array.isArray(entry.images) ? entry.images : [];
    if (!images.length) return;
    const thumbEl = document.getElementById('ep-img-thumb-' + type + '-' + i);
    const startIdx = thumbEl ? parseInt(thumbEl.dataset.idx || '0', 10) : 0;
    const title = window._epPartNameOf(entry.specs) || entry.model || '';
    window._openImageLightbox(images, startIdx, title, function(idx) {
        if (!thumbEl) return;
        thumbEl.dataset.idx = idx;
        thumbEl.src = images[idx].data;
        const thumbCounter = document.getElementById('ep-img-counter-' + type + '-' + i);
        if (thumbCounter) thumbCounter.textContent = (idx + 1) + '/' + images.length;
    });
};

window.elecCompareRemove = function(type, model) {
    if (!window.tabData || !window.tabData.elecCompare || !window.tabData.elecCompare[type]) return;
    window.tabData.elecCompare[type].selectedModels = window.tabData.elecCompare[type].selectedModels.filter(function(m) { return m !== model; });
    window.epLogChange(type, model, window._currentLang === 'en' ? 'Comparison table' : '비교표', window._currentLang === 'en' ? 'Included' : '포함', window._currentLang === 'en' ? 'Removed' : '제거');
    window.renderElecCompareTab(type);
};

window.elecCompareAddFromLibrary = function(type, model) {
    const _en = window._currentLang === 'en';
    window.tabData = window.tabData || {};
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare[type] = window.tabData.elecCompare[type] || { selectedModels: [], notes: {} };
    const sel = window.tabData.elecCompare[type].selectedModels;
    if (sel.indexOf(model) !== -1) { if (window.showToast) window.showToast(_en ? 'Already in the comparison table.' : '이미 비교표에 있습니다.', 'info'); return; }
    if (sel.length >= 10) { alert(_en ? 'Maximum 10 items per comparison table. Remove one first.' : '비교표는 최대 10개까지입니다. 하나를 먼저 제거해주세요.'); return; }
    sel.push(model);
    window.epLogChange(type, model, _en ? 'Comparison table' : '비교표', '-', _en ? 'Added' : '추가');
    const addModal = document.getElementById('ep-add-modal'); if (addModal) addModal.style.display = 'none';
    window.renderElecCompareTab(type);
};

window.elecCompareReextract = async function(type, model) {
    await window.elecCompareOpenAddModal(type);
    // 💡 사진은 AI가 텍스트에서 재추출할 수 있는 정보가 아니므로, 스펙만 새로 붙여넣게 하고
    //    이미 등록돼 있던 사진은 그대로 유지한다(openAddModal이 방금 빈 슬롯으로 초기화했으므로 덮어씀).
    const lib = window._epLibCache[type] || await window.loadElecPartLibrary(type);
    const existing = window.findElecPartInLibrary(lib, model);
    if (existing && Array.isArray(existing.images) && existing.images.length) {
        window._epPendingImages = [existing.images[0] || null, existing.images[1] || null];
        window._epSyncImageSlotsUI();
    }
    window._epPendingReextractModel = model;
    const paste = document.getElementById('ep-add-paste');
    if (paste) paste.focus();
    if (window.showToast) {
        window.showToast(window._currentLang === 'en' ? `Paste the latest spec text for "${model}" and extract.` : `"${model}"의 최신 스펙 텍스트를 붙여넣고 추출하세요.`, 'info');
    }
};

// 💡 [2026-08-26] 저장된 스펙/모델명을 다시 붙여넣어 AI로 재추출하지 않아도, 라이브러리에 있는 현재
//    값을 그대로 불러와 각 항목을 직접 고칠 수 있게 한다(Panel Compare의 panelCompareOpenEditModal과 동일).
window.elecCompareOpenEditModal = async function(type, model) {
    const _en = window._currentLang === 'en';
    const lib = await window.loadElecPartLibrary(type);
    window._epLibCache[type] = lib;
    const entry = window.findElecPartInLibrary(lib, model);
    if (!entry) { alert(_en ? 'This item was not found in the library.' : '라이브러리에서 이 항목을 찾을 수 없습니다.'); return; }
    await window.elecCompareOpenAddModal(type);
    window._epPendingReextractModel = entry.model;
    window._epEditingOriginalModel = entry.model;
    window._epPendingConnectors = entry.connectors || [];
    window._epPendingImages = [(entry.images && entry.images[0]) || null, (entry.images && entry.images[1]) || null];
    window._epSyncImageSlotsUI();
    window._epRenderPreviewForm(type, entry.specs || {});
    if (window.showToast) window.showToast(_en ? `Loaded the current spec for "${entry.model}" — edit and save.` : `"${entry.model}"의 현재 스펙을 불러왔습니다 — 수정 후 저장하세요.`, 'info');
};

// ─── "➕ 추가" 모달: 라이브러리 검색 + 새 항목 AI 추출 (Panel Compare와 동일 UI, type만 다름) ───
window.elecCompareOpenAddModal = async function(type) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    window._epActiveType = type;
    let modal = document.getElementById('ep-add-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ep-add-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ep-add-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
            <div id="ep-add-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="ep-add-title">⚡ ${_en ? 'Add Item' : '항목 추가'}</span>
                <button onclick="document.getElementById('ep-add-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div style="padding:12px 16px; border-bottom:1px solid #eee; flex-shrink:0;">
                <input id="ep-add-search" type="text" placeholder="${_en ? 'Search library...' : '라이브러리에서 검색...'}" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #ced4da; border-radius:6px; font-size:13px;" oninput="window._epRenderLibList(this.value)">
                <div id="ep-add-lib-list" style="margin-top:8px; max-height:160px; overflow-y:auto;"></div>
            </div>
            <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; min-height:0;">
                <div style="font-size:12px; font-weight:bold; color:#555; margin-bottom:6px;">📷 ${_en ? 'Photos (up to 2)' : '사진 (최대 2장)'}</div>
                <div style="display:flex; gap:8px; margin-bottom:12px; flex-shrink:0;">
                    <div class="ep-img-slot" data-slot="0" style="position:relative; width:104px; height:78px; border:1.5px dashed #ced4da; border-radius:6px; cursor:pointer; overflow:hidden; background:#f8f9fa; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <input type="file" accept="image/*" style="display:none;">
                        <img class="ep-img-preview" style="display:none; width:100%; height:100%; object-fit:cover;">
                        <span class="ep-img-placeholder" style="font-size:22px; color:#bbb;">📷</span>
                        <button type="button" class="ep-img-del-btn" style="display:none; position:absolute; top:2px; right:2px; width:18px; height:18px; border:none; border-radius:50%; background:rgba(177,67,47,0.85); color:#fff; font-size:11px; cursor:pointer; line-height:18px; padding:0;">✕</button>
                    </div>
                    <div class="ep-img-slot" data-slot="1" style="position:relative; width:104px; height:78px; border:1.5px dashed #ced4da; border-radius:6px; cursor:pointer; overflow:hidden; background:#f8f9fa; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <input type="file" accept="image/*" style="display:none;">
                        <img class="ep-img-preview" style="display:none; width:100%; height:100%; object-fit:cover;">
                        <span class="ep-img-placeholder" style="font-size:22px; color:#bbb;">📷</span>
                        <button type="button" class="ep-img-del-btn" style="display:none; position:absolute; top:2px; right:2px; width:18px; height:18px; border:none; border-radius:50%; background:rgba(177,67,47,0.85); color:#fff; font-size:11px; cursor:pointer; line-height:18px; padding:0;">✕</button>
                    </div>
                </div>
                <div id="ep-add-extract-label" style="font-size:12px; font-weight:bold; color:#555; margin-bottom:6px;">${_en ? 'Or extract a new item with AI' : '또는 새 항목을 AI로 추출'}</div>
                <input type="file" id="ep-add-file" accept=".pdf,.txt,.html,.htm" style="display:none;" onchange="window._epHandleFileUpload(this)">
                <div id="ep-add-dropzone"
                     style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-shrink:0; padding:8px 10px; border:1.5px dashed #2c5f8a; border-radius:6px; background:#f8f9fa; cursor:pointer; transition:0.15s;"
                     onclick="document.getElementById('ep-add-file').click()"
                     ondragover="event.preventDefault(); this.style.background='#e9eef3';"
                     ondragleave="this.style.background='#f8f9fa';"
                     ondrop="event.preventDefault(); event.stopPropagation(); this.style.background='#f8f9fa'; window._epHandleFileDrop(event.dataTransfer.files);">
                    <button type="button" id="ep-add-file-btn" onclick="event.stopPropagation(); document.getElementById('ep-add-file').click()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex-shrink:0; padding:6px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📄 ${_en ? 'Attach PDF/TXT/HTML' : 'PDF/TXT/HTML 첨부'}</button>
                    <span id="ep-add-file-name" style="font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_en ? 'or drag & drop a file here' : '또는 파일을 여기로 드래그하세요'}</span>
                </div>
                <textarea id="ep-add-paste" placeholder="${_en ? 'Paste the spec text copied from a datasheet, or attach a PDF/TXT/HTML file above...' : '데이터시트에서 복사한 스펙 텍스트를 붙여넣거나, 위에서 PDF/TXT/HTML 파일을 첨부하세요...'}" style="width:100%; box-sizing:border-box; min-height:90px; border:1px solid #ced4da; border-radius:6px; padding:8px; font-size:12px; resize:vertical;"></textarea>
                <button id="ep-add-extract-btn" onclick="window._epRunExtract()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="margin-top:8px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; flex-shrink:0; transition:background .15s, border-color .15s;">🤖 ${_en ? 'Extract with AI' : 'AI로 추출'}</button>
                <div id="ep-add-preview" style="margin-top:10px;"></div>
            </div>
            <div id="ep-add-footer" style="display:none; padding:12px 16px; border-top:1px solid #eee; flex-shrink:0;">
                <button id="ep-save-btn" onclick="window._epSaveNewItem(window._epActiveType)" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="width:100%; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? 'Save' : '저장'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ep-add-box', 'ep-add-drag');
        window._bindClickToFront('ep-add-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
        window._epInitImageSlots();
    }
    const titleEl = document.getElementById('ep-add-title');
    if (titleEl) titleEl.textContent = cfg.icon + ' ' + (_en ? 'Add ' + cfg.label : cfg.label + ' 추가');
    modal.style.display = 'block';
    window.bringModalToFront('ep-add-modal');
    document.getElementById('ep-add-search').value = '';
    document.getElementById('ep-add-paste').value = '';
    document.getElementById('ep-add-preview').innerHTML = '';
    const epFooterEl = document.getElementById('ep-add-footer'); if (epFooterEl) epFooterEl.style.display = 'none';
    const fileNameEl = document.getElementById('ep-add-file-name'); if (fileNameEl) fileNameEl.textContent = _en ? 'or drag & drop a file here' : '또는 파일을 여기로 드래그하세요';
    const fileInputEl = document.getElementById('ep-add-file'); if (fileInputEl) fileInputEl.value = '';
    window._epEditingOriginalModel = null;
    window._epPendingConnectors = [];
    window._epPendingImages = [null, null];
    window._epSyncImageSlotsUI();
    const lib = await window.loadElecPartLibrary(type);
    window._epLibCache[type] = lib;
    window._epRenderLibList('');
};

// 💡 [2026-08-26 신규] 사진 슬롯(최대 2장) — Summary 탭의 initProductImageSlots와 동일한 방식
//    (업로드 시 최대 1000px로 리사이즈 + JPEG 0.8 압축해 base64로 tabData 대신 라이브러리 항목에 저장).
//    모델과 무관하게 모달 DOM은 한 번만 만들어지므로, 리스너도 한 번만 붙이고 이후엔 항상
//    window._epPendingImages(현재 편집 중인 항목의 사진)만 읽고 쓴다.
window._epInitImageSlots = function() {
    document.querySelectorAll('#ep-add-modal .ep-img-slot').forEach(function(slot) {
        const i = parseInt(slot.dataset.slot, 10);
        const fileInput = slot.querySelector('input[type="file"]');
        const del = slot.querySelector('.ep-img-del-btn');
        slot.addEventListener('click', function(e) {
            if (e.target === del) return;
            fileInput.click();
        });
        fileInput.addEventListener('change', function() {
            const file = fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                const tempImg = new Image();
                tempImg.onload = function() {
                    const MAX = 1000;
                    let w = tempImg.width, h = tempImg.height;
                    if (w > MAX || h > MAX) {
                        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                        else        { w = Math.round(w * MAX / h); h = MAX; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(tempImg, 0, 0, w, h);
                    const b64 = canvas.toDataURL('image/jpeg', 0.80);
                    window._epPendingImages = window._epPendingImages || [null, null];
                    window._epPendingImages[i] = { data: b64, w: w, h: h };
                    window._epSyncImageSlotsUI();
                };
                tempImg.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            fileInput.value = ''; // 같은 파일 재선택 허용
        });
        del.addEventListener('click', function(e) {
            e.stopPropagation();
            window._epPendingImages = window._epPendingImages || [null, null];
            window._epPendingImages[i] = null;
            window._epSyncImageSlotsUI();
        });
    });
};
window._epSyncImageSlotsUI = function() {
    const imgs = window._epPendingImages || [null, null];
    document.querySelectorAll('#ep-add-modal .ep-img-slot').forEach(function(slot) {
        const i = parseInt(slot.dataset.slot, 10);
        const img = slot.querySelector('.ep-img-preview');
        const ph = slot.querySelector('.ep-img-placeholder');
        const del = slot.querySelector('.ep-img-del-btn');
        const data = imgs[i];
        if (data && data.data) {
            img.src = data.data; img.style.display = 'block';
            ph.style.display = 'none'; del.style.display = 'block';
        } else {
            img.src = ''; img.style.display = 'none';
            ph.style.display = 'flex'; del.style.display = 'none';
        }
    });
};

window._epRenderLibList = function(filterText) {
    const list = document.getElementById('ep-add-lib-list');
    if (!list) return;
    const _en = window._currentLang === 'en';
    const type = window._epActiveType;
    const lib = window._epLibCache[type] || { items: [] };
    const q = (filterText || '').trim().toLowerCase();
    const filtered = (lib.items || []).filter(function(p) { return !q || (p.model || '').toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
    if (!filtered.length) {
        list.innerHTML = `<div style="padding:8px; color:#999; font-size:12px;">${_en ? 'No matches in the library.' : '라이브러리에 일치하는 항목이 없습니다.'}</div>`;
        return;
    }
    // 💡 [2026-08-28 신규] "등록된 품목을 삭제할 방법이 없다"는 지적 — 지금까지는 이 목록에서 항목을
    //    클릭해 비교표에 "추가"만 할 수 있었고, 팀 공용 라이브러리(Drive) 자체에서 항목을 완전히 지우는
    //    UI가 없었다(window._epLibRemoveEntry 함수 자체는 있었지만 "이름 변경" 흐름에서만 내부적으로
    //    쓰이고 있었음). 각 행에 🗑 삭제 버튼을 추가 — event.stopPropagation()으로 행 클릭(추가)과
    //    분리해서, 삭제 버튼만 눌렀을 때는 추가되지 않게 한다.
    list.innerHTML = filtered.map(function(p) {
        return `<div style="padding:6px 8px; border-bottom:1px solid #f0f0f0; font-size:12.5px; display:flex; justify-content:space-between; align-items:center;"
            onmouseover="this.style.background='#f4f8fc'" onmouseout="this.style.background='transparent'">
            <span onclick="window.elecCompareAddFromLibrary(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(p.model))})" style="cursor:pointer; flex:1; min-width:0;">
                <b>${escapeHtml(window._epPartNameOf(p.specs) || p.model)}</b> <span style="color:#888;">${escapeHtml((p.specs && p.specs['Brand']) || '')}</span>
            </span>
            <span onclick="window.elecCompareAddFromLibrary(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(p.model))})" style="color:#2c5f8a; cursor:pointer; flex-shrink:0; margin-left:8px;">${_en ? '+ Add' : '+ 추가'}</span>
            <button type="button" onclick="event.stopPropagation(); window._epDeleteLibEntry(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(p.model))});" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" title="${_en ? 'Permanently delete from the shared library' : '공용 라이브러리에서 완전히 삭제'}" style="flex-shrink:0; margin-left:6px; background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; padding:2px 6px; transition:background .15s, border-color .15s;">🗑</button>
        </div>`;
    }).join('');
};

// 💡 [2026-08-28 신규] 위 🗑 버튼의 실행부 — 공용 라이브러리(Drive)에서 항목을 완전히 삭제한다.
//    되돌릴 수 없는 파괴적 동작이라 confirm으로 한 번 더 확인한다. 삭제 후에는 로컬 캐시(_epLibCache)와
//    현재 프로젝트의 비교표 선택(selectedModels)에서도 같이 제거해서, 다시 불러오지 않아도 화면이
//    바로 일치하게 만든다(이미 라이브러리에서 지워진 모델을 비교표가 계속 참조하면 "미추출"로 깨져 보임).
window._epDeleteLibEntry = async function(type, model) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    const displayName = (function() {
        const lib = window._epLibCache[type] || { items: [] };
        const p = (lib.items || []).find(function(x) { return x.model === model; });
        return (p && window._epPartNameOf(p.specs)) || model;
    })();
    const ok = confirm(_en
        ? `Permanently delete "${displayName}" from the shared ${cfg.label} library?\nThis cannot be undone and affects everyone on the team.`
        : `공용 ${cfg.label} 라이브러리에서 "${displayName}"을(를) 완전히 삭제할까요?\n되돌릴 수 없으며 팀 전체에 영향을 줍니다.`);
    if (!ok) return;

    const success = await window._epLibRemoveEntry(type, model);
    if (!success) {
        alert(_en ? '⚠️ Failed to delete from the library. Please check your Drive login and try again.' : '⚠️ 라이브러리 삭제에 실패했습니다. 드라이브 로그인 상태를 확인하고 다시 시도해주세요.');
        return;
    }

    const lib = window._epLibCache[type];
    if (lib && Array.isArray(lib.items)) lib.items = lib.items.filter(function(p) { return p.model !== model; });

    const ec = window.tabData && window.tabData.elecCompare && window.tabData.elecCompare[type];
    if (ec && Array.isArray(ec.selectedModels) && ec.selectedModels.indexOf(model) !== -1) {
        ec.selectedModels = ec.selectedModels.filter(function(m) { return m !== model; });
        window.renderElecCompareTab(type);
    }

    const searchInput = document.getElementById('ep-add-search');
    window._epRenderLibList(searchInput ? searchInput.value : '');
    if (window.showToast) window.showToast((_en ? '🗑 Deleted from library: ' : '🗑 라이브러리에서 삭제했습니다: ') + displayName, 'info');
};

window._epHandleFileUpload = async function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try { await window._epProcessFile(file); } finally { input.value = ''; }
};
window._epHandleFileDrop = async function(fileList) {
    const _en = window._currentLang === 'en';
    const file = fileList && fileList[0];
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'txt', 'html', 'htm'].indexOf(ext) === -1) {
        alert(_en ? '⚠️ Only PDF/TXT/HTML files are supported.' : '⚠️ PDF/TXT/HTML 파일만 지원합니다.');
        return;
    }
    await window._epProcessFile(file);
};
window._epProcessFile = async function(file) {
    const _en = window._currentLang === 'en';
    const paste = document.getElementById('ep-add-paste');
    const fileNameEl = document.getElementById('ep-add-file-name');
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
            const htmlStr = await file.text();
            text = window._pcExtractHtmlText(htmlStr);
        } else {
            text = await file.text();
        }
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

window._epRunExtract = async function() {
    const _en = window._currentLang === 'en';
    const type = window._epActiveType;
    const raw = (document.getElementById('ep-add-paste') || {}).value || '';
    if (!raw.trim()) { alert(_en ? 'Please paste the spec text first.' : '먼저 스펙 텍스트를 붙여넣어 주세요.'); return; }
    if (raw.length > window._EP_EXTRACT_TEXT_LIMIT) {
        const proceed = confirm(_en
            ? `The pasted text is ${raw.length.toLocaleString()} characters, but only the first ${window._EP_EXTRACT_TEXT_LIMIT.toLocaleString()} will be analyzed (AI input limit) — specs beyond that point may be missed.\n\nContinue anyway?`
            : `붙여넣은 텍스트가 ${raw.length.toLocaleString()}자인데, AI 분석에는 앞부분 ${window._EP_EXTRACT_TEXT_LIMIT.toLocaleString()}자까지만 사용됩니다 — 그 뒤에 있는 스펙은 누락될 수 있습니다.\n\n그래도 진행할까요?`);
        if (!proceed) return;
    }
    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) { alert(_en ? '⚠️ No AI API key configured. Set one in the mail analysis screen first.' : '⚠️ AI API 키가 설정되어 있지 않습니다. 메일 분석 화면에서 먼저 키를 등록해주세요.'); return; }
    const btn = document.getElementById('ep-add-extract-btn');
    if (btn) { btn.disabled = true; btn.textContent = '🤖 ' + (_en ? 'Extracting…' : '추출 중...'); }
    try {
        const prompt = window._epBuildExtractPrompt(type, raw);
        const result = await window.callAiBackend(apiKey, prompt);
        if (!result.ok) { alert((_en ? 'AI call failed: ' : 'AI 호출 실패: ') + (result.error && result.error.message || (_en ? 'Unknown error' : '알 수 없는 오류'))); return; }
        const text = result.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = window._epParseAiJson(text);
        if (!parsed) alert(_en ? 'Could not parse the AI response. Please try again, or fill in the form manually below.' : 'AI 응답을 해석하지 못했습니다. 다시 시도하거나 아래 폼에 직접 입력해주세요.');
        window._epPendingConnectors = (parsed && Array.isArray(parsed.Connectors)) ? parsed.Connectors : [];
        window._epRenderPreviewForm(type, parsed || {});
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🤖 ' + (_en ? 'Extract with AI' : 'AI로 추출'); }
    }
};

// 💡 enum 필드 드롭다운 변경 핸들러 — "기타" 선택 시 옆의 자유 텍스트 칸을 열어서 직접 입력받고,
//    Enable/Disable/- 선택 시엔 그 값을 바로 히든 입력칸에 채우고 자유 텍스트 칸은 숨긴다.
window._epHandleEnumChange = function(selectEl) {
    const wrap = selectEl.parentElement;
    const hiddenInput = wrap.querySelector('input[data-ep-field]');
    if (!hiddenInput) return;
    if (selectEl.value === '__other__') {
        hiddenInput.style.display = '';
        hiddenInput.value = '';
        hiddenInput.focus();
    } else {
        hiddenInput.style.display = 'none';
        hiddenInput.value = selectEl.value;
    }
};

window._epRenderPreviewForm = function(type, specs) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    const preview = document.getElementById('ep-add-preview');
    if (!preview) return;
    // 💡 모델(라이브러리 키)은 "Item Code_Part Name" 결합 — 재추출/수정 흐름이면 기존 키를 그대로 보존.
    const itemCode = (specs['Item Code'] && specs['Item Code'] !== '-') ? specs['Item Code'] : '';
    const partName = window._epPartNameOf(specs);
    const autoModel = [itemCode, partName].filter(Boolean).join('_');
    const presetModel = window._epPendingReextractModel || autoModel;
    window._epPendingReextractModel = null;
    let html = '';
    html += `<div style="margin-bottom:10px;"><label style="font-size:11px; font-weight:bold; color:#555;">${_en ? 'Library key (Item Code_Part Name) *' : '라이브러리 키(Item Code_Part Name) *'}</label>
        <input id="ep-form-model" type="text" value="${escapeHtml(presetModel)}" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1.5px solid #2c5f8a; border-radius:5px; font-size:13px; margin-top:2px;" placeholder="${_en ? 'e.g. 301782_KCB-02508B-60' : '예: 301782_KCB-02508B-60'}"></div>`;
    (cfg.schema || []).forEach(function(sec, si) {
        html += `<details ${si === 0 ? 'open' : ''} style="margin-bottom:6px;"><summary style="cursor:pointer; font-weight:bold; font-size:12px; color:#2c5f8a; padding:4px 0;">[${escapeHtml(sec.section)}]</summary>`;
        sec.fields.forEach(function(f) {
            const label = f[0];
            const val = specs[label] != null ? String(specs[label]) : '-';
            // 💡 [2026-08-26 신규] enum 필드(Resize Function 등)는 Enable/Disable/기타(자유 텍스트) 드롭다운으로.
            //    실제 저장값은 그대로 data-ep-field 히든 입력칸에 두고(_epSaveNewItem이 이 값을 그대로 읽음),
            //    드롭다운은 그 칸을 채우는 UI일 뿐이라 저장 로직은 일반 텍스트 필드와 완전히 동일하다.
            if (f[2] === 'enum') {
                const opts = f[3] || [];
                const isKnown = opts.indexOf(val) !== -1;
                const isOther = !isKnown && val !== '-';
                html += `<div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
                    <label style="flex:0 0 190px; font-size:10.5px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(label)}">${escapeHtml(label)}</label>
                    <select onchange="window._epHandleEnumChange(this)" style="flex:0 0 120px; padding:4px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px;">
                        <option value="-" ${val === '-' ? 'selected' : ''}>-</option>
                        ${opts.map(function(o) { return `<option value="${escapeHtml(o)}" ${o === val ? 'selected' : ''}>${escapeHtml(o)}</option>`; }).join('')}
                        <option value="__other__" ${isOther ? 'selected' : ''}>${_en ? 'Other…' : '기타(직접입력)'}</option>
                    </select>
                    <input data-ep-field="${escapeHtml(label)}" type="text" value="${escapeHtml(val)}" placeholder="${_en ? 'Enter value' : '값 입력'}" style="flex:1; padding:4px 6px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px; min-width:0; ${isOther ? '' : 'display:none;'}">
                </div>`;
            } else {
                html += `<div style="display:flex; align-items:center; gap:6px; margin:3px 0;">
                    <label style="flex:0 0 190px; font-size:10.5px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(label)}">${escapeHtml(label)}</label>
                    <input data-ep-field="${escapeHtml(label)}" type="text" value="${escapeHtml(val)}" style="flex:1; padding:4px 6px; border:1px solid #ced4da; border-radius:4px; font-size:11.5px; min-width:0;">
                </div>`;
            }
        });
        html += '</details>';
    });
    const connCount = (window._epPendingConnectors || []).length;
    html += `<div style="font-size:11px; color:#888; margin:6px 0 2px;">🔌 ${_en ? 'Pin map extracted' : '추출된 핀맵'}: ${connCount ? (connCount + (_en ? ' connector(s)' : '개 커넥터')) : (_en ? 'none' : '없음')}</div>`;
    preview.innerHTML = html;
    // 💡 [2026-08-27] 저장 버튼은 폼 맨 아래(스크롤 영역 안)에 있으면 항목이 많을 때 스크롤해야 보였다 —
    //    "저장 버튼이 사라진 것 같다"는 문의가 있어, 모달 하단 고정 푸터(ep-add-footer)로 옮겼다.
    const footer = document.getElementById('ep-add-footer');
    if (footer) footer.style.display = 'block';
};

window._epSaveNewItem = async function(type) {
    const _en = window._currentLang === 'en';
    const modelInput = document.getElementById('ep-form-model');
    const model = (modelInput ? modelInput.value : '').trim();
    if (!model) { alert(_en ? 'Please enter the library key.' : '라이브러리 키를 입력해주세요.'); if (modelInput) modelInput.focus(); return; }
    const specs = {};
    document.querySelectorAll('#ep-add-preview [data-ep-field]').forEach(function(inp) { specs[inp.dataset.epField] = inp.value; });
    const entry = { model: model, specs: specs, connectors: window._epPendingConnectors || [], images: (window._epPendingImages || []).filter(Boolean) };
    const originalModel = window._epEditingOriginalModel;
    window._epEditingOriginalModel = null;
    const isRename = !!(originalModel && originalModel !== model);

    const ok = await window.upsertElecPartLibraryEntry(type, entry);
    if (!ok) return;
    if (isRename) await window._epLibRemoveEntry(type, originalModel);

    window.tabData = window.tabData || {};
    window.tabData.elecCompare = window.tabData.elecCompare || {};
    window.tabData.elecCompare[type] = window.tabData.elecCompare[type] || { selectedModels: [], notes: {} };
    const sel = window.tabData.elecCompare[type].selectedModels;
    if (isRename) {
        const idx = sel.indexOf(originalModel);
        if (idx !== -1) sel[idx] = model; else if (sel.indexOf(model) === -1 && sel.length < 10) sel.push(model);
        window.epLogChange(type, originalModel, _en ? 'Library key' : '라이브러리 키', originalModel, model);
    } else if (sel.indexOf(model) === -1) {
        if (sel.length >= 10) {
            alert(_en ? 'This project already has 10 items in the comparison table (maximum). It was saved to the library, but not added here — remove one first.' : '이미 이 프로젝트의 비교표에 10개(최대)가 있습니다. 라이브러리엔 저장됐지만 여기엔 추가되지 않았습니다 — 하나를 먼저 제거해주세요.');
        } else {
            sel.push(model);
            window.epLogChange(type, model, _en ? 'Comparison table' : '비교표', '-', _en ? 'Added' : '추가');
        }
    }
    const modal = document.getElementById('ep-add-modal'); if (modal) modal.style.display = 'none';
    window.renderElecCompareTab(type);
    if (window.showToast) window.showToast((_en ? '✅ Saved: ' : '✅ 저장 완료: ') + model, 'info');
};

// ─── 🔌 핀맵 보기 모달 (읽기전용) ───
window.showElecPinMapModal = async function(type, model) {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('ep-pinmap-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ep-pinmap-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ep-pinmap-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:280px;">
            <div id="ep-pinmap-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="ep-pinmap-title">🔌 ${_en ? 'Pin Map' : '핀맵'}</span>
                <button onclick="document.getElementById('ep-pinmap-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div id="ep-pinmap-body" style="padding:12px 16px; flex:1; overflow-y:auto; font-size:12px;"></div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ep-pinmap-box', 'ep-pinmap-drag');
        window._bindClickToFront('ep-pinmap-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    window.bringModalToFront('ep-pinmap-modal');
    const bodyEl = document.getElementById('ep-pinmap-body');
    bodyEl.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">${_en ? 'Loading…' : '불러오는 중...'}</div>`;
    const lib = window._epLibCache[type] || await window.loadElecPartLibrary(type);
    const entry = window.findElecPartInLibrary(lib, model);
    const titleEl = document.getElementById('ep-pinmap-title');
    if (titleEl) titleEl.textContent = '🔌 ' + escapeHtml((entry && window._epPartNameOf(entry.specs)) || model);
    const connectors = (entry && Array.isArray(entry.connectors)) ? entry.connectors : [];
    if (!connectors.length) {
        bodyEl.innerHTML = `<div style="color:#888; padding:10px 0;">${_en ? 'No pin map extracted for this item.' : '이 항목에서 추출된 핀맵이 없습니다.'}</div>`;
        return;
    }
    let html = '';
    connectors.forEach(function(conn) {
        html += `<div style="font-weight:bold; color:#2c5f8a; margin:10px 0 4px;">${escapeHtml(conn.name || '')} ${conn.role ? '· ' + escapeHtml(conn.role) : ''} ${conn.model ? '<span style="color:#888; font-weight:normal;">(' + escapeHtml(conn.model) + ')</span>' : ''}</div>`;
        html += `<table style="width:100%; border-collapse:collapse; font-size:11.5px;"><thead><tr>
            <th style="border:1px solid #e9ecef; padding:3px 6px; background:#f4f6f8;">PIN NO.</th>
            <th style="border:1px solid #e9ecef; padding:3px 6px; background:#f4f6f8;">Symbol</th>
            <th style="border:1px solid #e9ecef; padding:3px 6px; background:#f4f6f8;">Description</th>
            </tr></thead><tbody>`;
        (conn.pins || []).forEach(function(p) {
            html += `<tr><td style="border:1px solid #e9ecef; padding:3px 6px; text-align:center;">${escapeHtml(p.no || '')}</td>
                <td style="border:1px solid #e9ecef; padding:3px 6px; text-align:center;">${escapeHtml(p.symbol || '')}</td>
                <td style="border:1px solid #e9ecef; padding:3px 6px;">${escapeHtml(p.desc || '')}</td></tr>`;
        });
        html += '</tbody></table>';
    });
    bodyEl.innerHTML = html;
};

// ─── Summary 주요자재 CONVERTER 행 🔎 버튼 → 전기부품 스펙 미리보기 모달 (showPanelSpecModal과 동일 패턴) ───
// 💡 [2026-09-01 신규] codeHint(ktk pn) — 검색에만 쓰고, "찾지 못했을 때"의 표시/재추출용 식별자로만
//    보조적으로 쓴다(찾았을 때의 비교표 등록/핀맵 등은 이미 entry.model을 쓰고 있어서 그대로 안전함).
window.showElecPartSpecModal = async function(type, model, codeHint) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    let modal = document.getElementById('ep-spec-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ep-spec-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ep-spec-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:300px;">
            <div id="ep-spec-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                <span id="ep-spec-title">⚡ ${_en ? 'Elec Part Spec' : '전기부품 스펙'}</span>
                <button onclick="document.getElementById('ep-spec-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
            </div>
            <div id="ep-spec-body" style="padding:12px 16px; flex:1; overflow-y:auto; font-size:12px;"></div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ep-spec-box', 'ep-spec-drag');
        window._bindClickToFront('ep-spec-modal');
        modal.onclick = function() { modal.style.display = 'none'; };
    }
    modal.style.display = 'block';
    window.bringModalToFront('ep-spec-modal');
    const titleEl = document.getElementById('ep-spec-title');
    if (titleEl) titleEl.textContent = cfg.icon + ' ' + cfg.label + ' ' + (_en ? 'Spec' : '스펙');
    const bodyEl = document.getElementById('ep-spec-body');
    bodyEl.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">${_en ? 'Loading…' : '불러오는 중...'}</div>`;
    const lib = await window.loadElecPartLibrary(type);
    window._epLibCache[type] = lib;
    // 💡 ktk pn(codeHint)이 있으면 "코드_이름"으로 합쳐서 검색 — findElecPartInLibrary도 PANEL과 동일하게
    //    _epFlexibleFind로 코드/이름을 분리 대조하므로 이 조합만으로 ktk pn도 검색 근거가 된다.
    const searchQuery = codeHint ? (codeHint + (model ? '_' + model : '')) : model;
    const entry = searchQuery ? window.findElecPartInLibrary(lib, searchQuery) : null;
    const model_display = model || codeHint || '';
    if (!entry) {
        // 💡 Panel Compare의 showPanelSpecModal과 동일한 자리 — 값이 비어있든(설명 미입력) 라이브러리에
        //    없는 값이든, 여기선 똑같이 "붙여넣어 AI로 추출" 흐름(elecCompareReextract)으로 이어준다.
        bodyEl.innerHTML = `
            <div style="font-size:13px; font-weight:bold; margin-bottom:8px;">${model_display ? escapeHtml(model_display) : (_en ? '(No description entered)' : '(설명 미입력)')}</div>
            <div style="color:#888; margin-bottom:14px;">${model_display
                ? (_en ? `No spec has been extracted for "${model_display}" yet.` : `"${model_display}"의 스펙이 아직 추출되지 않았습니다.`)
                : (_en ? 'Not extracted yet — search the library or extract a new one below.' : '아직 추출된 스펙이 없습니다 — 아래에서 라이브러리를 검색하거나 새로 추출하세요.')}</div>
            <button onclick="document.getElementById('ep-spec-modal').style.display='none'; window.elecCompareReextract(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(model_display))});" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:8px 14px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">🤖 ${_en ? 'Paste spec text & extract with AI' : '스펙 텍스트 붙여넣고 AI로 추출'}</button>
        `;
        return;
    }
    const ec = (window.tabData && window.tabData.elecCompare && window.tabData.elecCompare[type]) || { selectedModels: [] };
    const inCompare = (ec.selectedModels || []).indexOf(entry.model) !== -1;
    const partName = window._epPartNameOf(entry.specs) || entry.model;
    const brand = (entry.specs && entry.specs['Brand'] && entry.specs['Brand'] !== '-') ? entry.specs['Brand'] : '';
    let html = `<div style="font-size:13px; font-weight:bold; margin-bottom:2px;">${escapeHtml(partName)}</div>
        <div style="color:#888; margin-bottom:8px;">${escapeHtml(brand)}</div>`;
    if (Array.isArray(entry.images) && entry.images.length && entry.images[0] && entry.images[0].data) {
        html += `<img src="${entry.images[0].data}" style="max-width:160px; max-height:110px; border:1px solid #ced4da; border-radius:4px; margin-bottom:8px; display:block; object-fit:cover;">`;
    }
    html += `<div style="margin:10px 0;">
            ${inCompare
                ? `<span style="color:#2f9e44; font-weight:bold;">✓ ${_en ? 'Already in this project\'s comparison table' : '이 프로젝트 비교표에 있음'}</span>`
                : `<button onclick="window.elecCompareAddFromLibrary(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(entry.model))}); document.getElementById('ep-spec-modal').style.display='none';" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">➕ ${_en ? 'Add to comparison table' : '비교표에 추가'}</button>`}
        </div>
        <div style="font-size:10px; color:#aaa; margin-bottom:8px;">${_en ? 'Updated' : '갱신'}: ${escapeHtml(entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '-')}</div>`;
    (cfg.schema || []).forEach(function(sec) {
        let secHtml = '';
        sec.fields.forEach(function(f) {
            const label = f[0];
            const v = (entry.specs && entry.specs[label] != null && entry.specs[label] !== '') ? entry.specs[label] : '-';
            if (v === '-') return; // 미리보기는 값이 있는 항목만 (한눈에 보기 편하게)
            secHtml += `<div style="display:flex; gap:6px; padding:2px 0;"><span style="flex:0 0 170px; color:#777;">${escapeHtml(label)}</span><span style="flex:1;">${escapeHtml(String(v))}</span></div>`;
        });
        if (secHtml) html += `<div style="font-weight:bold; color:#7a5210; margin-top:8px; padding:3px 0; border-top:1px solid #eee;">[${escapeHtml(sec.section)}]</div>` + secHtml;
    });
    if (Array.isArray(entry.connectors) && entry.connectors.length) {
        html += `<div style="margin-top:10px;"><button onclick="window.showElecPinMapModal(${escapeHtml(JSON.stringify(type))}, ${escapeHtml(JSON.stringify(entry.model))})" class="ep-theme-hover-btn" style="padding:5px 10px; background:#e8f4fd; border:1px solid #a5c8f0; color:#1a4f7a; border-radius:5px; cursor:pointer; font-size:11.5px; transition:background .15s, border-color .15s;">🔌 ${_en ? 'View pin map' : '핀맵 보기'}</button></div>`;
    }
    bodyEl.innerHTML = html;
};

// 💡 비교표 헤더/핀맵 버튼 — 표가 innerHTML로 통째로 다시 그려지므로 전역 위임 클릭으로 한 번만 바인딩.
document.addEventListener('click', function(e) {
    const rm = e.target.closest('[data-ep-remove]');
    if (rm) { const parts = rm.dataset.epRemove.split('|'); window.elecCompareRemove(parts[0], parts.slice(1).join('|')); return; }
    const re = e.target.closest('[data-ep-reextract]');
    if (re) { const parts = re.dataset.epReextract.split('|'); window.elecCompareReextract(parts[0], parts.slice(1).join('|')); return; }
    const ed = e.target.closest('[data-ep-edit]');
    if (ed) { const parts = ed.dataset.epEdit.split('|'); window.elecCompareOpenEditModal(parts[0], parts.slice(1).join('|')); return; }
    const pm = e.target.closest('[data-ep-pinmap]');
    if (pm) { const parts = pm.dataset.epPinmap.split('|'); window.showElecPinMapModal(parts[0], parts.slice(1).join('|')); return; }
});

// ── Elec Parts 탭 변경이력 (토글/기록/렌더링/삭제) — Panel Compare와 동일 패턴, type별로 기록 ──
window.epToggleHistoryBox = function(type) {
    const body = document.getElementById('ep-' + type + '-history-body');
    const icon = document.getElementById('ep-' + type + '-history-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
    if (!isOpen) window.epRenderHistoryTable(type);
};
window.epLogChange = function(type, rowLabel, field, oldVal, newVal) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.elecCompareChangeLog = window.tabData.elecCompareChangeLog || {};
    window.tabData.elecCompareChangeLog[type] = window.tabData.elecCompareChangeLog[type] || [];
    window.tabData.elecCompareChangeLog[type].push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal
    });
};
window.epRenderHistoryTable = function(type) {
    const table = document.getElementById('ep-' + type + '-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.elecCompareChangeLog && window.tabData.elecCompareChangeLog[type]) || [];
    const _hisEn = window._currentLang === 'en';
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">' + (_hisEn ? 'No change history.' : '수정 이력이 없습니다.') + '</td></tr>'; return; }
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Item / Field' : '항목') + '</th>'
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
window.deleteEpHistoryByDateRange = function(type) {
    const pwEl = document.getElementById('ep-' + type + '-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) { if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.'); return; }
    const fromStr = (document.getElementById('ep-' + type + '-history-del-from') || {}).value;
    const toStr = (document.getElementById('ep-' + type + '-history-del-to') || {}).value;
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
        const logs = window.tabData && window.tabData.elecCompareChangeLog && window.tabData.elecCompareChangeLog[type];
        if (logs && logs.length) {
            const before = logs.length;
            window.tabData.elecCompareChangeLog[type] = logs.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.elecCompareChangeLog[type].length;
        }
        if (pwEl) pwEl.value = '';
        window.epRenderHistoryTable(type);
        const msg = removedCount + '건의 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };
    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

// ── 엑셀로 내보내기 (Panel Compare의 exportPanelCompareToExcel과 동일 패턴) ──
window.exportElecCompareToExcel = async function(type) {
    const _en = window._currentLang === 'en';
    const cfg = window.ELEC_PART_TYPES[type];
    const ec = (window.tabData && window.tabData.elecCompare && window.tabData.elecCompare[type]) || { selectedModels: [] };
    const models = (ec.selectedModels || []).slice(0, 10);
    if (!models.length) { alert(_en ? 'No items in the comparison table yet.' : '비교표에 항목이 없습니다.'); return; }
    const lib = await window.loadElecPartLibrary(type);
    const entries = models.map(function(m) { return window.findElecPartInLibrary(lib, m); });
    const notes = ec.notes || {};

    const aoa = [];
    aoa.push(['Comparison table'].concat(models).concat(['Note']));
    (cfg.schema || []).forEach(function(sec) {
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
    (cfg.schema || []).forEach(function(sec) { sectionRowIdx.push(rPtr); rPtr += 1 + sec.fields.length; });

    const range = XLSX.utils.decode_range(ws['!ref']);
    const thinBorder = { style: 'thin', color: { rgb: 'DDDDDD' } };
    for (let ri = 0; ri <= range.e.r; ri++) {
        const isHeader = ri === 0;
        const isSection = sectionRowIdx.indexOf(ri) !== -1;
        for (let ci = 0; ci <= range.e.c; ci++) {
            const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
            if (!cell) continue;
            cell.s = {
                font: { name: '맑은 고딕', sz: 10, bold: isHeader || isSection, color: { rgb: isSection ? '7A5210' : (isHeader ? '333333' : '1F2937') } },
                fill: isSection ? { patternType: 'solid', fgColor: { rgb: 'FFF8E6' } } : (isHeader ? { patternType: 'solid', fgColor: { rgb: window._cpXlsxRole('headerTint') } } : undefined),
                alignment: { vertical: 'center', horizontal: ci === 0 ? 'left' : 'center', wrapText: true },
                border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
            };
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.label.substring(0, 28));
    const fileName = (window.driveSaveFilenameStr || window.exportFilenameStr || cfg.label) + '_' + cfg.label + '_비교표.xlsx';
    XLSX.writeFile(wb, fileName);
};

// ── Summary 탭 변경이력 (토글/기록/렌더링/삭제) — Brief SPEC/M.C Table과 동일 패턴 ──
window.sumToggleHistoryBox = function() {
    const body = document.getElementById('sum-history-body');
    const icon = document.getElementById('sum-history-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▶' : '▼';
    if (!isOpen && window.sumRenderHistoryTable) window.sumRenderHistoryTable();
};

window.sumLogChange = function(rowLabel, field, oldVal, newVal) {
    if (String(oldVal || '') === String(newVal || '')) return;
    window.tabData = window.tabData || {};
    window.tabData.sumChangeLog = window.tabData.sumChangeLog || [];
    window.tabData.sumChangeLog.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: window.currentUserName || '비로그인',
        row: rowLabel, field: field, oldVal: oldVal, newVal: newVal
    });
};

window.sumRenderHistoryTable = function() {
    const table = document.getElementById('sum-history-table');
    if (!table) return;
    const logs = (window.tabData && window.tabData.sumChangeLog) || [];
    if (!logs.length) { table.innerHTML = '<tr><td style="padding:10px; color:#999;">' + (window._currentLang === 'en' ? 'No change history.' : '수정 이력이 없습니다.') + '</td></tr>'; return; }
    const _hisEn = window._currentLang === 'en';
    let html = '<thead><tr>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Time' : '시간') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Editor' : '수정자') + '</th>'
        + '<th style="padding:4px 8px;">' + (_hisEn ? 'Item' : '항목') + '</th>'
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

window.deleteSumHistoryByDateRange = function() {
    const pwEl = document.getElementById('sum-history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) { if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.'); return; }
    const fromStr = (document.getElementById('sum-history-del-from') || {}).value;
    const toStr = (document.getElementById('sum-history-del-to') || {}).value;
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
        if (window.tabData && window.tabData.sumChangeLog && window.tabData.sumChangeLog.length) {
            const before = window.tabData.sumChangeLog.length;
            window.tabData.sumChangeLog = window.tabData.sumChangeLog.filter(function(log) { return !inRange(log); });
            removedCount = before - window.tabData.sumChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        if (window.sumRenderHistoryTable) window.sumRenderHistoryTable();
        const msg = removedCount + '건의 Summary 수정이력을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };
    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 Summary 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

// 💡 Summary 입력칸 변경 감지 (탭 전체에 이벤트 위임 — 필드별 data-field 구조가 제각각이라 유형별로 라벨을 찾아냄)
(function() {
    const wrap = document.getElementById('tab-summary');
    if (!wrap) return;

    const findFieldLabel = function(el) {
        // 1) 마일스톤 표 (data-stage 보유)
        if (el.dataset && el.dataset.stage) {
            const rowType = el.closest('#sum-milestone-body-actual') ? '실적' : '계획';
            return { row: el.dataset.stage, field: rowType };
        }
        // 2) 멤버-3 (자유 추가, data-idx + data-field 보유)
        if (el.dataset && el.dataset.idx !== undefined && el.dataset.field) {
            const group = el.closest('.concept-grid') || el.parentElement;
            const roleInput = group ? group.querySelector('[data-idx="' + el.dataset.idx + '"][data-field="role"]') : null;
            const roleName = (roleInput && roleInput.value) ? roleInput.value : ('인원 ' + (Number(el.dataset.idx) + 1));
            const fieldLabel = { role: '역할', name: '이름', email: '이메일' }[el.dataset.field] || el.dataset.field;
            return { row: roleName, field: fieldLabel };
        }
        // 3) 멤버-1/2 (고정 3열: 역할라벨 input / 이름 input / 이메일 input)
        const memGrid = el.closest('.concept-grid-mem');
        if (memGrid) {
            const children = Array.prototype.filter.call(memGrid.children, function(c) { return c.tagName === 'INPUT'; });
            const idx = children.indexOf(el);
            if (idx !== -1) {
                const groupStart = Math.floor(idx / 3) * 3;
                const roleInput = children[groupStart];
                const roleName = (roleInput && roleInput.value) ? roleInput.value : '담당자';
                const fieldLabel = idx % 3 === 0 ? '역할명' : (idx % 3 === 1 ? '이름' : '이메일');
                return { row: roleName, field: fieldLabel };
            }
        }
        // 4) 일반 <label> 형제가 있는 입력칸
        const prev = el.previousElementSibling;
        if (prev && prev.tagName === 'LABEL') {
            const section = el.closest('.concept-section');
            const h3 = section ? section.querySelector('h3') : null;
            return { row: h3 ? h3.textContent.trim() : '프로젝트 개요', field: prev.textContent.trim() };
        }
        // 5) 그 외 (예: 추진 배경 textarea) — 가장 가까운 h3를 항목명으로 사용
        const section2 = el.closest('.concept-section');
        const h3b = section2 ? section2.querySelector('h3') : null;
        return { row: h3b ? h3b.textContent.trim() : 'Summary', field: el.id || '내용' };
    };

    wrap.addEventListener('focusin', function(e) {
        const el = e.target;
        if (!el.matches || !el.matches('input[type="text"], input[type="email"], textarea')) return;
        el.dataset._histOld = el.value;
    });
    wrap.addEventListener('change', function(e) {
        const el = e.target;
        if (!el.matches || !el.matches('input[type="text"], input[type="email"], textarea')) return;
        const oldVal = el.dataset._histOld !== undefined ? el.dataset._histOld : '';
        if (String(oldVal) === String(el.value)) return;
        const info = findFieldLabel(el);
        window.sumLogChange(info.row, info.field, oldVal, el.value);
        el.dataset._histOld = el.value;
    });
})();

