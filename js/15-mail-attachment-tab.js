
// =========================================================
// 📎 메일 파일 첨부 탭 기능 (v3 - 좌우분할)
// =========================================================

// 프로젝트 키워드를 globalData에서 동적으로 생성

window.parseGeminiTask = function(rawText) {
    if (!rawText) return null;
    let text = rawText.replace(/```json|```/g, '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let jsonStr = m[0];

    // 1차: 그대로 시도
    try { let p = JSON.parse(jsonStr); return Array.isArray(p) ? p[0] : p; } catch(e) {}

    // 2차: 제어문자 제거 + 개행 이스케이프 후 시도
    try {
        let c = jsonStr
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/\r/g, '')
            .replace(/\n/g, '\\n')
            .replace(/\\\\n/g, '\\n');
        let p = JSON.parse(c); return Array.isArray(p) ? p[0] : p;
    } catch(e) {}

    // 3차: 필드별 정규식 직접 추출 (최후 안전장치)
    const g = (re) => (jsonStr.match(re) || [])[1] || '';
    const task = {
        '업무명':     g(/"업무명"\s*:\s*"([^"]*)"/),
        '시작일':     g(/"시작일"\s*:\s*"([^"]*)"/),
        '완료일':     g(/"완료일"\s*:\s*"([^"]*)"/),
        '상태':       g(/"상태"\s*:\s*"([^"]*)"/) || '진행',
        '개발단계':   g(/"개발단계"\s*:\s*"([^"]*)"/),
        '담당구분':   g(/"담당구분"\s*:\s*"([^"]*)"/) || '미분류',
        '상세내용':   g(/"상세내용"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/).replace(/\\n/g, '\n'),
        'wbs레벨':    parseInt(g(/"wbs레벨"\s*:\s*(\d)/) || '4'),
        '마감일임박도': parseInt(g(/"마감일임박도"\s*:\s*(\d+)/) || '0'),
        '업무영향도':   parseInt(g(/"업무영향도"\s*:\s*(\d+)/) || '0'),
    };
    return task['업무명'] ? task : null;
};

function mfBuildProjectKeywords() {
    const map = {};
    if (!globalData || globalData.length <= 1) return map;

    const header = globalData[0];
    // L0(개발단계) 컬럼과 모델명 컬럼 인덱스 찾기
    const l0Idx    = header.findIndex(h => /^l0$|개발단계/i.test(h));
    const modelIdx = colIdx.model ?? header.findIndex(h => /모델|model/i.test(h));

    const seen = new Set();
    for (let i = 1; i < globalData.length; i++) {
        const row = globalData[i];
        if (!row) continue;

        // L0(개발단계) 값을 프로젝트 키로 사용
        const key = (l0Idx >= 0 ? row[l0Idx] : '') ||
                    (modelIdx >= 0 ? row[modelIdx] : '');
        if (!key || seen.has(key)) continue;
        seen.add(key);

        // 프로젝트명에서 토큰 분리 → RegExp 패턴 자동 생성
        const tokens = key.split(/[\s_\-\.]+/).filter(t => t.length >= 2);
        const patterns = [new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')];
        tokens.forEach(t => {
            patterns.push(new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));
        });
        map[key] = patterns;
    }
    return map;
}

// 현재 오른쪽 패널에 표시 중인 항목 인덱스
window._mfCurrentIdx = -1;
window._mfFiles      = [];
window._mfResults    = [];

// ─── 3개 탭 전환 및 디자인 스타일 동적 변경 함수 ─────────────────────────────────────────
// 💡 [2026-08-29 파스텔 통일] 탭별 고유 파스텔 색(파랑/초록/주황) — 선택 시 짙은 톤, 대기 시 옅은 톤,
//    호버 시 그보다 한 단계 더 짙은 톤. switchMailTab()과 아래 _mtTabHover/_mtTabUnhover가 공용으로
//    참조하도록 window에 붙여둠(예전엔 함수 안 지역변수라 호버 핸들러에서 못 썼음 — 그래서 탭 3개에
//    호버가 안 먹던 문제의 원인).
window._mtPalette = {
    paste:  { light:'#e8f4fd', active:'#cfe6fa', hover:'#b3d9f5', borderLight:'#a5c8f0', borderActive:'#7fb0dd', borderHover:'#5f96c9', text:'#1a4f7a' },
    file:   { light:'#e6f6ea', active:'#c9ecd3', hover:'#a8ddb5', borderLight:'#a8dab8', borderActive:'#7cc494', borderHover:'#5aab76', text:'#1f7a3d' },
    server: { light:'#fbead9', active:'#f4d9b3', hover:'#eec48a', borderLight:'#edbf85', borderActive:'#dba354', borderHover:'#c88a34', text:'#a85d0a' }
};
window._mailActiveTab = 'paste';

// 탭 위에 마우스를 올렸을 때: 선택/대기 상태와 무관하게 항상 가장 짙은 호버 톤으로
window._mtTabHover = function(el, key) {
    const p = window._mtPalette[key];
    if (!p) return;
    el.style.background = p.hover;
    el.style.borderColor = p.borderHover;
};
// 마우스가 빠져나갈 때: 지금 선택된 탭이면 "선택" 톤으로, 아니면 "대기" 톤으로 복귀
window._mtTabUnhover = function(el, key) {
    const p = window._mtPalette[key];
    if (!p) return;
    if (window._mailActiveTab === key) {
        el.style.background = p.active;
        el.style.borderColor = p.borderActive;
    } else {
        el.style.background = p.light;
        el.style.borderColor = p.borderLight;
    }
};

window.switchMailTab = function(tab) {
    // 1. 콘텐츠 화면 제어
    const pc = document.getElementById('mail-tab-paste-content');
    const fc = document.getElementById('mail-tab-file-content');
    const sc = document.getElementById('mail-tab-server-content');
    if (pc) pc.style.display = tab === 'paste'  ? 'flex' : 'none';
    if (fc) fc.style.display = tab === 'file'   ? 'flex' : 'none';
    if (sc) sc.style.display = tab === 'server' ? 'flex' : 'none';
    if (tab === 'server' && window._msRefreshServerAccountStatus) window._msRefreshServerAccountStatus();

    window._mailActiveTab = tab;

    // 2. 탭 버튼 오브젝트 수집
    const pt = document.getElementById('mail-tab-paste');
    const ft = document.getElementById('mail-tab-file');
    const st = document.getElementById('mail-tab-server');

    [
        { el: pt, key: 'paste',  active: tab === 'paste'  },
        { el: ft, key: 'file',   active: tab === 'file'   },
        { el: st, key: 'server', active: tab === 'server' }
    ].forEach(({ el, key, active }) => {
        if (!el) return;
        const p = window._mtPalette[key];
        el.style.color = p.text;
        el.style.boxShadow = 'none';
        if (active) {
            // 선택된 탭 스타일 (짙은 파스텔 채움)
            el.style.background   = p.active;
            el.style.borderColor  = p.borderActive;
            el.style.fontWeight   = 'bold';
        } else {
            // 선택되지 않은 대기 탭 스타일 (옅은 파스텔 + 옅은 테두리)
            el.style.background   = p.light;
            el.style.borderColor  = p.borderLight;
            el.style.fontWeight   = 'bold';
        }
    });
};

// showMailAnalyzer 래핑
const _origShowMailAnalyzer = window.showMailAnalyzer;
window.showMailAnalyzer = function() {
    window.closeAllTopbarMenus(); // ✅ 업무 추가 창 열릴 때 업무 드롭다운 자동 닫기
    _origShowMailAnalyzer();
    // 탭 초기 스타일 강제 설정
    setTimeout(() => {
        window.switchMailTab('paste');
    }, 50);
};

// ─── 공통 오른쪽 패널 표시 함수 ────────────────────────────
function mailShowRightDetail(subject, sender, date, body, project, task, onInsert, mailRaw) {
    // 💡 개선요청 기능용: AI 원본 스냅샷 + 파싱원문 세팅 (누락되면 "분석 결과가 없습니다" 오류남)
    window._aiResultSnapshot = task ? JSON.parse(JSON.stringify(task)) : null;
    window._mailParsedRaw = mailRaw || null;
    window._lastFeedbackUid = null; // 새 항목 열 때는 이전 항목의 피드백 uid 초기화

    // 메일 정보 헤더
    const info = document.getElementById('mail-right-info');
    if (info) {
        const _d = date ? new Date(date) : null;
        const _dateStr = (_d && !isNaN(_d)) 
            ? (_d.getFullYear() + '-' + String(_d.getMonth()+1).padStart(2,'0') + '-' + String(_d.getDate()).padStart(2,'0')
               + ' ' + String(_d.getHours()).padStart(2,'0') + ':' + String(_d.getMinutes()).padStart(2,'0'))
            : (date || '');
        info.innerHTML = `<b>📨 ${escapeHtml(subject)}</b> 
            <span style="color:#888;">${escapeHtml(sender||'')} ${_dateStr?'| '+_dateStr:''}</span>
            ${project ? ` | <span style="color:#0056b3;font-weight:bold;">${escapeHtml(project)}</span>` : ''}`;
    }
    // 원본 메일
    const origBody = document.getElementById('mail-original-body');
    if (origBody) {
        // 💡 [2026-08-24 버그 수정] 백엔드/원문보기 모달은 15000자까지 보존하도록 이미 확장됐는데,
        //    이 "▼ 원본 메일" 토글 섹션만 2000자로 재차 잘라서 표시하고 있었음(AI 입력용 2000자
        //    캡과는 무관한 별개 변수인데 실수로 같은 숫자를 재사용한 것으로 보임) — 15000자로 통일.
        const bodyFormatted = (body||'')
            .substring(0, 15000)
            .replace(/\. /g, '.\n')
            .replace(/([^\n])\[/g, '$1\n[')
            .trim();
        origBody.textContent = `제목: ${subject}\n발신: ${sender||''}\n날짜: ${date||''}\n\n${bodyFormatted}`;
        origBody.style.maxHeight = '600px';
        origBody.style.display = 'none';
        const arrow = document.getElementById('mail-original-arrow');
        if (arrow) arrow.textContent = '▼';
    }
    // 분석결과 렌더링
    window._mailAnalyzedResult = JSON.parse(JSON.stringify(task));
    window.renderMailResult(task);
    // 삽입 위치
    window.populateInsertPosition();
    const hasDate = task['시작일'] && !task['시작일'].includes('날짜확인필요');
    if (hasDate) window.autoSetInsertPosition(task['시작일'], false);
    // 콜백 저장
    window._mailRightInsertCallback = onInsert;
    // 패널 전환
    document.getElementById('mail-right-empty').style.display  = 'none';
    document.getElementById('mail-right-detail').style.display = 'flex';
}

window.mailRightInsert = function() {
    const s = window._mailAnalyzedResult['시작일'];
    const p = window._mailAnalyzedResult['완료일'];
    
    if ((s||'').includes('날짜확인필요') || (p||'').includes('날짜확인필요')) {
        alert('⚠️ 시작일 또는 완료일을 먼저 선택해주세요.');
        return;
    }

    if (window._mailRightInsertCallback) {
        window._mailRightInsertCallback();
        window._mailRightInsertCallback = null;
    } else {
        window.insertMailTask();
    }
};

// ─── 직접입력 결과 목록 관리 ─────────────────────────────
window._pasteResults = [];

window.pasteClearResults = function() {
    window._pasteResults = [];
    document.getElementById('paste-result-list').style.display = 'none';
    document.getElementById('paste-result-header').style.display = 'none';
    document.getElementById('paste-result-count').textContent = '0';
    document.getElementById('mail-right-empty').style.display = 'flex';
    document.getElementById('mail-right-detail').style.display = 'none';
};

function pasteAddResult(task, mailText) {
    const idx = window._pasteResults.length;
    // 💡 [최신 항목 상단 표시] 예전엔 push라 아래로만 쌓였음 — 방금 분석한 게 위로 오도록 unshift
    window._pasteResults.unshift({ idx, task, mailText, mailRaw: window._mailParsedRaw || null, selected: !!task, registered: false });
    pasteRenderResultList();
}

// ─── 직접입력 누적 결과 목록 렌더링 (파일첨부/메일서버와 동일한 UI: 체크박스+번호+이름+상태pill+×삭제) ─────
function pasteRenderResultList() {
    const list = document.getElementById('paste-result-list');
    const header = document.getElementById('paste-result-header');
    const count = document.getElementById('paste-result-count');
    const batchBtn = document.getElementById('paste-batch-btn');
    const arr = window._pasteResults || [];

    if (!arr.length) {
        list.style.display = 'none';
        header.style.display = 'none';
        batchBtn.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    list.style.display = 'block';
    header.style.display = 'block';
    batchBtn.style.display = 'block';
    count.textContent = arr.length;

    list.innerHTML = arr.map((r, i) => `
        <div id="paste-item-${i}" data-idx="${i}"
             style="display:flex; align-items:center; gap:6px; padding:7px 8px; border-bottom:1px solid #f0f0f0;
                    background:${r.registered ? '#d4edda' : '#fff'}; cursor:pointer; transition:background 0.15s;">
            <input type="checkbox" data-idx="${i}" ${r.selected ? 'checked':''} style="flex-shrink:0;">
            <span style="font-size:10px; color:#aaa; flex-shrink:0; width:16px;">${i+1}</span>
            <span style="flex:1; min-width:0; font-size:12px; font-weight:bold; color:#333;
                         white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
                  title="${escapeHtml(r.task['업무명']||'새업무')}">
                ${escapeHtml(r.task['업무명']||'새업무')} 📧
            </span>
            <span style="flex-shrink:0; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:12px;
                         ${r.registered ? 'background:#28a745; color:#fff;' : 'background:#f1f3f5; color:#888;'}">
                ${r.registered ? '✅ 완료' : '⬜ 미등록'}
            </span>
            <button data-del-idx="${i}" title="목록에서 삭제"
                    style="flex-shrink:0; background:#fff; border:1px solid #e03131; color:#e03131; border-radius:4px;
                           width:20px; height:20px; line-height:1; cursor:pointer;">×</button>
        </div>
    `).join('');

    // 이벤트 연결 (체크박스 / 삭제 / 행클릭 미리보기)
    arr.forEach((r, i) => {
        const row = document.getElementById(`paste-item-${i}`);
        if (!row) return;

        row.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox' || e.target.dataset.delIdx !== undefined) return;
            mailShowRightDetail('직접입력', '', '', r.mailText||'', null, r.task, () => {
                window.insertMailTask();
                r.registered = true;
                pasteRenderResultList();
                document.getElementById('mail-right-empty').style.display  = 'flex';
                document.getElementById('mail-right-detail').style.display = 'none';
            }, r.mailRaw);
        });

        const cb = row.querySelector('input[type=checkbox]');
        if (cb) cb.addEventListener('change', function() { window.pasteToggleCheck(i, this.checked); });

        const delBtn = row.querySelector('[data-del-idx]');
        if (delBtn) delBtn.addEventListener('click', function(e) { e.stopPropagation(); window.pasteDeleteResult(i); });
    });

    window.pasteSyncCheckAll();
}

window.pasteToggleCheck = function(idx, checked) {
    if (window._pasteResults[idx]) window._pasteResults[idx].selected = checked;
    window.pasteSyncCheckAll();
};

window.pasteSyncCheckAll = function() {
    const all = document.querySelectorAll('#paste-result-list input[type=checkbox]');
    const chk = document.querySelectorAll('#paste-result-list input[type=checkbox]:checked');
    const ca  = document.getElementById('paste-check-all');
    if (ca) ca.checked = all.length > 0 && all.length === chk.length;
};

window.pasteSelectAll = function(select) {
    document.querySelectorAll('#paste-result-list input[type=checkbox]').forEach(cb => {
        cb.checked = select;
        const idx = parseInt(cb.dataset.idx);
        if (!isNaN(idx) && window._pasteResults[idx]) window._pasteResults[idx].selected = select;
    });
};

// ─── 목록에서 항목 하나 삭제 (Gantt에 이미 등록된 실제 데이터는 지워지지 않음) ─────
window.pasteDeleteResult = function(idx) {
    const r = window._pasteResults[idx];
    if (!r) return;
    if (!confirm(`"${r.task['업무명']||'새업무'}"\n이 분석 항목을 목록에서 삭제하시겠습니까?\n(등록된 항목이라도 Gantt Chart의 실제 데이터는 지워지지 않습니다)`)) return;
    window._pasteResults.splice(idx, 1);
    pasteRenderResultList();
};

// ─── 선택항목 연속등록 (파일첨부 탭의 mfDirectInsert 로직 재사용) ─────
window.pasteBatchInsert = function() {
    const validTargets = window._pasteResults.filter(r =>
        r.selected && r.task && !r.registered &&
        !( (r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요') )
    );
    const excludedCount = window._pasteResults.filter(r => r.selected && r.task && !r.registered).length - validTargets.length;

    if (!validTargets.length) {
        alert(excludedCount > 0 ? '⚠️ 날짜가 없는 항목은 등록할 수 없습니다. (제외됨)' : '등록할 항목을 체크해주세요.');
        return;
    }

    let previewMsg = `✅ 총 ${validTargets.length}개 항목을 일괄 등록합니다.\n`;
    if (excludedCount > 0) previewMsg += `\n⚠️ 날짜가 없는 ${excludedCount}개 항목은 자동으로 제외되었습니다.`;
    previewMsg += '\n\n[등록할 업무 목록]\n' + validTargets.map(r => '• ' + (r.task['업무명']||'새업무')).join('\n');
    if (!confirm(previewMsg + '\n\n위 내용으로 등록하시겠습니까?')) return;

    for (let i = window._pasteResults.length - 1; i >= 0; i--) {
        const r = window._pasteResults[i];
        if (r.selected && r.task && !r.registered) {
            if (mfDirectInsert(r.task, r.mailRaw)) {
                r.registered = true;
                r.selected = false;
            }
        }
    }

    pasteRenderResultList();
    window.recalculateSchedules();
    window.showToast(window._currentLang === 'en' ? `✅ ${validTargets.length} task(s) registered!` : `✅ ${validTargets.length}개 항목이 등록되었습니다!`);
};

// ─── 파일 선택 ───────────────────────────────────────────
window.mfHandleFiles = function(files) {
    if (!files || files.length === 0) return;

    // 💡 추가: MSG 파일 걸러내기 (경고 알림 후 해당 파일만 목록에서 제외)
    const validFiles = Array.from(files).filter(f => {
        if (f.name.toLowerCase().endsWith('.msg')) {
            alert(`⚠️ '${f.name}'은 MSG 파일입니다.\nMSG 파일은 '메일 서버 탭'을 이용해 주세요.`);
            return false; // 목록에서 제외
        }
        return true;
    });

    if (validFiles.length === 0) return; // 유효한 파일이 없으면 종료

    const newFiles = validFiles.slice(0, 500);
    window._mfFiles = (window._mfFiles || []).concat(newFiles).slice(0, 500); 
    const arr = window._mfFiles;

    document.getElementById('mf-file-count').textContent = arr.length;
    
    // 💡 변경된 부분: 버튼 하나가 아니라 '버튼 그룹' 전체를 화면에 띄웁니다 (flex 사용)
    const btnGroup = document.getElementById('mf-analyze-group');
    if (btnGroup) btnGroup.style.display = arr.length ? 'flex' : 'none';

    document.getElementById('mf-result-list').style.display  = 'none';
    document.getElementById('mf-list-header').style.display  = 'none';
    document.getElementById('mf-batch-btn').style.display    = 'none';
    document.getElementById('mf-batch-inbox-btn').style.display = 'none';
    document.getElementById('mail-right-empty').style.display  = 'flex';
    document.getElementById('mail-right-detail').style.display = 'none';
    window._mfCurrentIdx = -1;

    const dz = document.getElementById('mf-dropzone');
    if (dz) {
        dz.innerHTML = `
            <div style="font-size:20px;">📁</div>
            <div style="font-weight:bold; color:#e67e22; font-size:12px; margin-top:3px;">
                ${arr.length}개 선택됨 (클릭하여 추가 변경)
            </div>`;
    }
    document.getElementById('mf-input').value = '';
    // 💡 추가된 파일 목록을 아래에 펼쳐서 보여줌 (개별 분석/제외 가능)
    mfRenderPendingList();
};

// ─── 파일 목록 전체 비우기 (새로 추가된 기능) ─────────────────
window.mfClearFiles = function() {
    if (window._mfFiles && window._mfFiles.length > 0) {
        // 💡 다시 올리면 그만이라 확인창 없이 바로 진행
    }
    
    // 1. 메모리에서 파일 목록 삭제
    window._mfFiles = []; 
    
    // 2. 드롭존 화면 원래대로 복구
    const dz = document.getElementById('mf-dropzone');
    if (dz) {
        const _dzEn = window._currentLang === 'en';
        dz.innerHTML = `
            <div style="font-size:20px;">📁</div>
            <div style="font-weight:bold; color:#e67e22; font-size:11px; margin-top:2px;">${_dzEn ? 'Click or drag files here' : '클릭하거나 파일을 드래그하세요'}</div>
            <div style="font-size:10px; color:#aaa;">${_dzEn ? '.eml / .html / .txt up to 500 files' : '.eml / .html / .txt 최대 500개'}</div>`;
    }
        
    // 3. 버튼 및 결과창 숨기기
    const btnGroup = document.getElementById('mf-analyze-group');
    if (btnGroup) btnGroup.style.display = 'none';
    
    document.getElementById('mf-result-list').style.display = 'none';
    document.getElementById('mf-list-header').style.display = 'none';
    document.getElementById('mf-batch-btn').style.display = 'none';
    document.getElementById('mf-batch-inbox-btn').style.display = 'none';
    document.getElementById('mail-right-empty').style.display = 'flex';
    document.getElementById('mail-right-detail').style.display = 'none';
    document.getElementById('mf-input').value = '';
    // 💡 추가된 파일 목록도 함께 비움
    mfRenderPendingList();
};

// ─── 파일첨부 분석결과 목록 초기화 (업로드 대기 파일과 별개, 진짜로 결과 배열을 비움) ─────
window.mfClearResults = function() {
    if (!window._mfResults || !window._mfResults.length) return;
    // 💡 등록된 항목의 실제 Gantt 데이터는 지워지지 않아 확인창 없이 바로 진행
    window._mfResults = [];
    document.getElementById('mf-result-list').style.display = 'none';
    document.getElementById('mf-list-header').style.display = 'none';
    document.getElementById('mf-batch-btn').style.display = 'none';
    document.getElementById('mf-batch-inbox-btn').style.display = 'none';
    document.getElementById('mail-right-empty').style.display = 'flex';
    document.getElementById('mail-right-detail').style.display = 'none';
};

// ─── 대기 중인(분석 전) 파일 목록 렌더링 (개별 분석/제외 가능) ─────────
function mfRenderPendingList() {
    const box = document.getElementById('mf-pending-list');
    if (!box) return;
    const arr = window._mfFiles || [];
    if (!arr.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'block';
    box.innerHTML = arr.map((f, i) => `
        <div id="mf-pending-item-${i}" style="display:flex; align-items:center; gap:6px; padding:5px 8px; border-bottom:1px solid #f0f0f0; font-size:11px;">
            <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(f.name)}">${i+1}. ${escapeHtml(f.name)}</span>
            <button id="mf-pending-analyze-${i}" onclick="window.mfAnalyzeSingle(${i})" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="min-width:60px; padding:2px 8px; font-size:10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🤖 분석</button>
            <button id="mf-pending-remove-${i}" onclick="window.mfRemoveFile(${i})" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" title="목록에서 제외 (잘못 올린 파일 삭제)"
                style="background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:4px; width:20px; height:20px; line-height:1; font-weight:bold; cursor:pointer; flex-shrink:0; transition:background .15s, border-color .15s;">×</button>
        </div>
    `).join('');
}

// ─── 목록에서 특정 파일 하나 제외 (실수로 잘못 올린 파일 제거용) ─────────
window.mfRemoveFile = function(idx) {
    if (!window._mfFiles) return;
    window._mfFiles.splice(idx, 1);
    const arr = window._mfFiles;
    document.getElementById('mf-file-count').textContent = arr.length;
    const btnGroup = document.getElementById('mf-analyze-group');
    if (btnGroup) btnGroup.style.display = arr.length ? 'flex' : 'none';
    const dz = document.getElementById('mf-dropzone');
    if (dz) {
        dz.innerHTML = arr.length
            ? `<div style="font-size:20px;">📁</div>
               <div style="font-weight:bold; color:#e67e22; font-size:12px; margin-top:3px;">${arr.length}개 선택됨 (클릭하여 추가 변경)</div>`
            : `<div style="font-size:20px;">📁</div>
               <div style="font-weight:bold; color:#2c5f8a; font-size:11px; margin-top:2px;">${window._currentLang === 'en' ? 'Click or drag files here' : '클릭하거나 파일을 드래그하세요'}</div>
               <div style="font-size:10px; color:#aaa;">${window._currentLang === 'en' ? '.eml / .html / .txt up to 500 files' : '.eml / .html / .txt 최대 500개'}</div>`;
    }
    mfRenderPendingList();
};

// ─── 파일 1개만 개별 분석 (일괄 분석 버튼과 별개) ─────────────────
window.mfAnalyzeSingle = async function(idx) {
    const apiKey = window.getActiveAiKey();
    if (!apiKey) { alert('Gemini API 키를 먼저 저장해주세요.'); return; }
    const f = window._mfFiles && window._mfFiles[idx];
    if (!f) return;

    // 💡 클릭한 버튼에 즉시 로딩 상태 표시 (진행 중임을 눈으로 확인 가능하게)
    //    X(제외) 버튼은 분석 중에도 항상 눌리도록 절대 비활성화하지 않음
    const btn = document.getElementById(`mf-pending-analyze-${idx}`);
    const originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ 분석중...'; btn.style.opacity = '0.7'; }

    let parsed = null;
    let result;
    try {
        parsed = await mfParseFile(f);
    } catch (e) {
        if (!window._mfFiles.includes(f)) return; // 💡 그 사이 X로 제외됨 → 결과 버리고 조용히 종료
        result = {
            idx: window._mfResults.length, fileName: f.name, subject: f.name, sender:'', date:'', body:'',
            project:null, task:null, selected:false, registered:false, error: '파일 읽기 실패: ' + e.message
        };
        window._mfResults.unshift(result); // 💡 [최신 항목 상단 표시]
        document.getElementById('mf-result-count').textContent = window._mfResults.length;
        mfRenderList(window._mfResults);
        const btnAfter = document.getElementById(`mf-pending-analyze-${idx}`);
        if (btnAfter) { btnAfter.disabled = false; btnAfter.innerHTML = originalBtnHtml; btnAfter.style.opacity = ''; }
        return;
    }

    try {
        const { task, projectTag } = await mfCallGemini(apiKey, parsed);
        if (!window._mfFiles.includes(f)) return; // 💡 분석 중 X로 제외됨 → 결과 버리고 조용히 종료
        // 💡 [매칭/점수 통일화] .eml엔 To/Cc/중요도 헤더가 없어 규칙점수 일부(수신방식·중요도)는 제외하고 계산
        const priorityConfig = task ? await window.loadPriorityConfig() : null;
        const scoreResult = task ? window._msComputeTotalScore(
            { subject: parsed.subject, body: parsed.body, sender: parsed.sender, isToMe: false, isCcMe: false, importance: false },
            task, priorityConfig) : null;
        result = {
            idx: window._mfResults.length, fileName: f.name,
            subject: parsed.subject, sender: parsed.sender, date: parsed.date, body: parsed.body,
            // 💡 [2026-08-24 버그 수정] ms 탭과 동일한 사고 — 이 필드가 없어서 "⚡ 선택항목 연속등록"이
            //    엉뚱한(직접입력 탭 전용) window._mailParsedRaw로 대체하려다 실패해 "📧 원문 보기"가 사라졌었다.
            mailRaw: { subject: parsed.subject, sender: parsed.sender, date: parsed.date, body2000: parsed.body, fileName: f.name },
            project: window._msProjectTagLabel(projectTag), task, selected: !!task, registered: false,
            _projectTag: projectTag,
            _score: scoreResult ? scoreResult.total : null,
            _scoreGrade: scoreResult ? window._msScoreGrade(scoreResult.total, priorityConfig.cutline) : null,
            _scoreBreakdown: scoreResult ? scoreResult.breakdown : null,
            _alarmWorthy: !!(scoreResult && priorityConfig && scoreResult.total >= priorityConfig.cutline),
            error: !task ? 'AI 분석 실패 (재시도 후에도 실패 / 본문은 아래에서 확인 가능)' : null
        };
    } catch (e) {
        if (!window._mfFiles.includes(f)) return; // 💡 분석 중 X로 제외됨 → 결과 버리고 조용히 종료
        result = {
            idx: window._mfResults.length, fileName: f.name,
            subject: parsed.subject || f.name, sender: parsed.sender || '', date: parsed.date || '', body: parsed.body || '',
            mailRaw: { subject: parsed.subject || f.name, sender: parsed.sender || '', date: parsed.date || '', body2000: parsed.body || '', fileName: f.name },
            project:null, task:null, selected:false, registered:false, error: e.message
        };
    }
    window._mfResults.unshift(result); // 💡 [최신 항목 상단 표시]
    document.getElementById('mf-result-count').textContent = window._mfResults.length;
    mfRenderList(window._mfResults);

    // 💡 [완전자동] mail_mode='full'이면 TaskInbox 대기 없이 바로 Gantt 등록 시도
    window._msTryFullAutoRegister(result,
        { subject: result.subject, sender: result.sender, date: result.date, body2000: result.body, fileName: f.name },
        () => mfRenderList(window._mfResults));

    // 💡 완료 후 버튼 상태 복구 + 완료 표시 (성공/실패 색상 구분)
    //    이 시점에 idx 위치의 파일이 이미 제외/변경됐을 수 있으므로 요소 존재만 확인 후 갱신
    const btnAfter = document.getElementById(`mf-pending-analyze-${idx}`);
    if (btnAfter) {
        btnAfter.disabled = false;
        btnAfter.style.opacity = '';
        btnAfter.innerHTML = result.task ? '✅ 완료' : '⚠️ 실패(재분석)';
        // 💡 [2026-08-29 파스텔 통일] 완료=초록/실패=빨강 파스텔 — 호버 핸들러도 최종 색에 맞게 재설정
        const _p = result.task
            ? { bg:'#e6f6ea', border:'#a8dab8', text:'#1f7a3d', hoverBg:'#c9ecd3', hoverBorder:'#7cc494' }
            : { bg:'#fbe4e2', border:'#eeb0ac', text:'#b1432f', hoverBg:'#f5c2bd', hoverBorder:'#e08f87' };
        btnAfter.style.background = _p.bg;
        btnAfter.style.borderColor = _p.border;
        btnAfter.style.color = _p.text;
        btnAfter.onmouseover = function() { btnAfter.style.background = _p.hoverBg; btnAfter.style.borderColor = _p.hoverBorder; };
        btnAfter.onmouseout  = function() { btnAfter.style.background = _p.bg; btnAfter.style.borderColor = _p.border; };
    }
};

// 💡 [2026-08-25 버그 수정] "원문 보기"에서 메일 속 표(HTML table)가 다 깨져 보인다는 지적 — 원인은
//    아래 innerText 뒤에 무조건 .replace(/\s+/g, ' ')로 모든 공백(탭·줄바꿈 포함)을 한 칸 스페이스로
//    뭉개버리던 것. innerText는 표를 뽑을 때 셀 사이에 탭(\t), 행 사이에 줄바꿈(\n)을 이미 넣어주는데
//    이 처리가 그 구조를 통째로 지워서 표뿐 아니라 문단 구분까지 한 줄로 뭉개졌었다. 탭/줄바꿈 "구조"는
//    보존하고, "같은 줄 안의 불필요한 연속 스페이스"와 "3줄 이상 이어지는 빈 줄"만 정리하도록 순화한다.
// 💡 [2026-08-26 버그 수정] DOMParser로 만든 문서는 실제 화면에 붙어 렌더링되지 않는 "떠 있는" 문서라,
//    innerText가 기대하는 "레이아웃 계산 결과 기반" 줄바꿈/탭 삽입(문단 사이 개행, 표 셀 사이 탭)이
//    브라우저 구현에 따라 제대로 안 나올 수 있다(실측 결과 표 칸 구분 없이 셀 내용이 뒤죽박죽 나옴) —
//    대신 DOM을 직접 순회하며 줄바꿈/탭이 필요한 자리(<br>/<p>/<div>/<tr>/<td>/<th>/<table>)에
//    우리가 직접 텍스트 노드를 끼워넣은 뒤, 레이아웃에 전혀 의존하지 않는 textContent로 뽑는다
//    (HTML 엔티티 디코딩은 파싱 단계에서 이미 되므로 그대로 유지됨). kortek_backend.py의 정규식
//    기반 표 처리와 같은 철학 — 구조를 "렌더링에 맡기지" 않고 우리가 명시적으로 보장한다.
// 💡 [2026-08-26 버그 수정 ②] 위 구조 삽입만으로는 부족했다 — 실제 메일(특히 Outlook)의 표 HTML은
//    보통 예쁘게 들여쓰기되어 있어서 <td>...</td> 사이에 "줄바꿈+공백"으로만 이루어진 텍스트 노드가
//    이미 원본에 끼어있다. insertAdjacentText로 넣은 우리 탭(\t)이 하필 그 원본 줄바꿈 바로 앞에
//    붙게 되고, 아래 _mfNormalizeBody의 "줄 끝 trailing space/탭 제거" 규칙이 그 탭까지 "줄 끝
//    찌꺼기"로 착각해 같이 지워버려서 — 칸 구분자였던 탭이 사라지고 칸마다 다시 다른 줄로 떨어졌다.
//    → 구조를 끼워넣기 "전에" 원본에 있던 공백/줄바꿈만으로 된 텍스트 노드를 먼저 다 걷어내서,
//    최종적으로 남는 탭·줄바꿈은 전부 우리가 의도적으로 넣은 것만 남게 한다.
function _mfStripInsignificantWhitespace(root) {
    if (!root) return;
    const doc = root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toRemove = [];
    let node;
    while ((node = walker.nextNode())) {
        if (/^\s+$/.test(node.nodeValue)) toRemove.push(node);
    }
    toRemove.forEach(function(n) { n.remove(); });
}
// 💡 [2026-08-26] 칸 구분자를 탭(\t) 대신 눈에 보이는 경계문자 " │ "(U+2502)로 변경 — 탭은 값 길이가
//    다르면 세로줄이 안 맞아 보일 수 있는데, │는 정렬 목적이 아니라 "여기서 칸이 나뉜다"만 항상
//    명확하게 표시하고, 실제 메일 본문에 이 문자가 등장할 일이 거의 없어 원본 내용과도 안 헷갈린다.
const MF_CELL_BOUNDARY = ' │ ';
// 💡 [2026-08-28 버그 수정] "표 있는 메일이 여전히 못 알아보게 나온다"는 지적 — 표 칸(<td>/<th>) 안의
//    글자를 Outlook은 보통 <p>로 한 번 더 감싸는데(헤더 칸은 <p>가 여러 개인 경우도 흔함), 그 <p>가
//    표 밖 문단과 똑같이 "afterend에 개행 삽입"을 당하면 그 개행이 </td>가 찍어주는 MF_CELL_BOUNDARY
//    "보다 먼저" 칸 안에 끼어들어 버린다 — 그러면 "칸 경계"가 "줄 경계"와 뒤섞여 표를 알아볼 수 없게
//    된다(kortek_backend.py extract_body와 동일한 원인·동일한 수정). 표 칸 안에서는 <br>/<p>/<div>를
//    개행 대신 공백으로 합쳐서 "칸 하나 = 항상 한 줄"이 되게 하고, 실제 줄바꿈은 행 경계(<tr>)에서만 만든다.
function _mfInsertStructureBreaks(root) {
    if (!root) return;
    root.querySelectorAll('br').forEach(function(el) { el.replaceWith(el.closest('td, th') ? ' ' : '\n'); });
    root.querySelectorAll('td, th').forEach(function(el) { el.insertAdjacentText('afterend', MF_CELL_BOUNDARY); });
    root.querySelectorAll('p, div').forEach(function(el) { el.insertAdjacentText('afterend', el.closest('td, th') ? ' ' : '\n'); });
    root.querySelectorAll('tr, table').forEach(function(el) { el.insertAdjacentText('afterend', '\n'); });
}
function _mfExtractText(root) {
    if (!root) return '';
    root.querySelectorAll('script, style').forEach(function(el) { el.remove(); });
    _mfStripInsignificantWhitespace(root);
    _mfInsertStructureBreaks(root);
    return root.textContent || '';
}

function _mfNormalizeBody(text) {
    return (text || '')
        .replace(/\r\n?/g, '\n')
        // 줄 끝 trailing space/경계문자 제거 — 각 행의 "마지막 칸" 뒤에는 다음 칸이 없어 경계문자가
        // 덜렁 남는데($ 도 같이 매칭해서 문자열 맨 끝인 경우까지 처리), 그걸 정리한다.
        .replace(/[ \t│]+(\n|$)/g, '$1')
        .replace(/ {2,}/g, ' ')  // 같은 줄 안의 연속 스페이스(2칸 이상)만 1칸으로 — 경계문자( │ )는 건드리지 않음
        .replace(/\n{3,}/g, '\n\n')      // 빈 줄 3개 이상 → 2개로
        .trim();
}

// ─── 파일 파싱 ───────────────────────────────────────────
function mfParseFile(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        const ext = file.name.split('.').pop().toLowerCase();
        reader.onload = e => {
            // 💡 .eml은 원본 바이트를 1바이트=1문자로 보존하는 latin1로 읽음 (charset을 알아낸 뒤 정확히 재해석하기 위함)
            //    .html/.txt는 지금까지 잘 동작하던 UTF-8 읽기를 그대로 유지 (회귀 방지)
            const text = (ext === 'eml') ? bytesToLatin1String(e.target.result) : e.target.result;
            let subject = file.name.replace(/\.[^.]+$/, '');
            let sender  = '';
            let date    = ''; // ✅ date 변수 선언 추가
            let body    = '';

            // ── MIME 헤더 디코딩 ──────────────────────
            function decodeMimeHeader(str) {
                if (!str) return '';
                return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset, enc, data) => {
                    try {
                        if (enc.toUpperCase() === 'B') {
                            const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
                            return new TextDecoder(charset).decode(bytes);
                        } else {
                            return decodeURIComponent(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, '%$1'));
                        }
                    } catch { return data; }
                });
            }

            // ── Base64 본문 디코딩 ────────────────────
            function decodeBase64Body(raw) {
                try {
                    const bytes = Uint8Array.from(atob(raw.replace(/\s/g, '')), c => c.charCodeAt(0));
                    try { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); } catch {}
                    try { return new TextDecoder('euc-kr').decode(bytes); } catch {}
                    return new TextDecoder('utf-8', {fatal:false}).decode(bytes);
                } catch { return raw; }
            }

            // ── Quoted-Printable 디코딩 ───────────────
            function decodeQP(str) {
                return str
                    .replace(/=\r?\n/g, '')
                    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
            }

            // 💡 charset을 반영해서 본문을 최종 디코딩 (base64/QP/순수 8bit 공통 처리)
            //    모르는 인코딩이면 원문(latin1) 그대로 반환 — 최소한 ASCII 부분은 안 깨짐
            function decodeBodyWithCharset(raw, transferEncoding, charset) {
                const te = (transferEncoding || '').trim().toLowerCase();
                const cs = charset || 'utf-8';
                try {
                    if (te.includes('base64')) return decodeBase64Body(raw.trim());
                    if (te.includes('quoted-printable')) {
                        const decoded = decodeQP(raw);
                        return new TextDecoder(cs).decode(Uint8Array.from(decoded, c => c.charCodeAt(0)));
                    }
                    // 인코딩 표기가 없는 순수 7bit/8bit 본문 — 원본 바이트 그대로 읽어왔으므로 charset으로 재해석
                    return new TextDecoder(cs).decode(Uint8Array.from(raw, c => c.charCodeAt(0)));
                } catch (e) {
                    return raw;
                }
            }

            // ── 중첩 multipart에서 text/html 재귀 추출(표 구조 보존), 없으면 text/plain로 대체 ──
            // 💡 [2026-08-28 버그 수정] "표(HTML table) 있는 메일이 여전히 못 알아보게 나온다"는 지적 —
            //    원인은 이 함수가 text/plain을 최우선으로 골라 쓰던 것. multipart/alternative 메일은
            //    보통 text/plain도 같이 들어있는데, 그건 메일 클라이언트가 표를 이미 한 줄씩 늘어놓은
            //    형태로 "미리 납작하게" 만들어둔 버전이라 칸 구분 정보가 아예 없다(kortek_backend.py
            //    extract_body와 동일한 원인·동일한 수정). 표 구조가 살아있는 text/html을 우선으로 쓰고,
            //    text/html이 없을 때만 text/plain으로 폴백하도록 순서를 뒤집는다.
            function extractPlainText(content, boundary) {
                const parts = content.split(new RegExp('--' + boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
                let plainFallback = null; // 💡 text/html을 끝내 못 찾았을 때 대신 쓸 text/plain 내용
                for (const part of parts) {
                    if (!part || part.trim() === '--') continue;
                    const pEnd = part.search(/\r?\n\r?\n/);
                    if (pEnd < 0) continue;
                    const pHeader  = part.substring(0, pEnd);
                    const pBody    = part.substring(pEnd + 2);
                    const pHeaderL = pHeader.toLowerCase();
                    if (pHeaderL.includes('multipart')) {
                        const innerCt = pHeader.match(/Content-Type:[^\r\n]+(\r?\n\s+[^\r\n]+)*/i)?.[0] || '';
                        const innerBm = innerCt.match(/boundary="?([^";\r\n]+)"?/i);
                        if (innerBm) {
                            const result = extractPlainText(pBody, innerBm[1].trim());
                            if (result) return result;
                        }
                        continue;
                    }
                    const pte = (pHeaderL.match(/content-transfer-encoding:\s*(\S+)/)||[])[1]||'';
                    const pcs = (pHeader.match(/charset="?([^";\s]+)"?/i)||[])[1]||'utf-8';
                    const decodePart = () => decodeBodyWithCharset(pBody, pte, pcs);
                    if (pHeaderL.includes('text/html')) return decodePart();
                    // 💡 text/plain 파트는 일단 저장해두고 계속 찾다가, text/html이 끝내 없으면 이걸 씀
                    if (!plainFallback && pHeaderL.includes('text/plain')) plainFallback = decodePart();
                }
                return plainFallback || '';
            }

            if (ext === 'eml') {
                const headerEnd  = text.search(/\r?\n\r?\n/);
                const headerPart = headerEnd > 0 ? text.substring(0, headerEnd) : text;
                const bodyPart   = headerEnd > 0 ? text.substring(headerEnd + 2) : '';

                const headers = {};
                headerPart.replace(/\r\n/g, '\n').split('\n').forEach(line => {
                    if (/^\s/.test(line)) {
                        const lastKey = Object.keys(headers).pop();
                        if (lastKey) headers[lastKey] += ' ' + line.trim();
                    } else {
                        const m = line.match(/^([^:]+):\s*(.*)/);
                        if (m) headers[m[1].toLowerCase()] = m[2];
                    }
                });

                subject = decodeMimeHeader(headers['subject'] || subject);
                sender  = decodeMimeHeader(headers['from']    || '');
                date    = headers['date'] || ''; // ✅ 헤더에서 날짜 정보 추출

                const ct = headers['content-type'] || '';
                const te = (headers['content-transfer-encoding'] || '').trim().toLowerCase();
                const outerCharset = (ct.match(/charset="?([^";\s]+)"?/i)||[])[1] || 'utf-8';

                if (ct.includes('multipart')) {
                    const bm = ct.match(/boundary="?([^";\r\n]+)"?/i);
                    if (bm) {
                        body = extractPlainText(bodyPart, bm[1].trim());
                    }
                } else {
                    body = decodeBodyWithCharset(bodyPart, te, outerCharset);
                }

                // HTML 태그 및 숨은 CSS/JS 코드 찌꺼기 완벽 청소
                try {
                    let cleaner = new DOMParser().parseFromString(body, 'text/html');
                    body = _mfNormalizeBody(_mfExtractText(cleaner.body));
                } catch(e) {
                    // 1. 정규식으로 스타일/스크립트/XML/주석 제거 (RegExp 생성자 방식으로 HTML 파서 충돌 방지)
                    const reStyle   = new RegExp('<style[^>]*>[\\s\\S]*?<\\/style>', 'gi');
                    const reScript  = new RegExp('<script[^>]*>[\\s\\S]*?<\\/script>', 'gi');
                    const reXml     = new RegExp('<xml[^>]*>[\\s\\S]*?<\\/xml>', 'gi');
                    const reXmp     = new RegExp('<x:xmpmeta[^>]*>[\\s\\S]*?<\\/x:xmpmeta>', 'gi');
                    const reComment = new RegExp('<!--[\\s\\S]*?-->', 'g');
                    const rePI      = new RegExp('<\\?[^>]+\\?>', 'g');
                    body = body.replace(reStyle, ' ')
                               .replace(reScript, ' ')
                               .replace(reXml, ' ')
                               .replace(reXmp, ' ')
                               .replace(reComment, ' ')
                               .replace(rePI, ' ');
                    // 2. 정규식 제거 후 DOMParser 재시도
                    try {
                        let cleaner2 = new DOMParser().parseFromString(body, 'text/html');
                        body = _mfNormalizeBody(_mfExtractText(cleaner2.body));
                    } catch(e2) {
                        // 3. 최후 수단: 모든 태그 제거
                        body = _mfNormalizeBody(body.replace(/<[^>]+>/g, ' '));
                    }
                }

            } else if (ext === 'html' || ext === 'htm') {
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const t   = doc.querySelector('title');
                if (t) subject = t.textContent.trim();
                body = _mfNormalizeBody(_mfExtractText(doc.body));
            } else {
                const sm = text.match(/Subject[:\s]+(.+)/i);
                const fm = text.match(/From[:\s]+(.+)/i);
                if (sm) subject = sm[1].trim();
                if (fm) sender  = fm[1].trim();
                body = _mfNormalizeBody(text);
            }

            // 💡 [2026-08-24] "원문 보기"용 저장 한도(6000→15000, 메일서버 탭 kortek_backend.py와 동일 기준으로 통일).
            //    AI 분석 입력은 msCallGemini가 이 값과 무관하게 항상 별도로 window.getAiMailMaxLen()
            //    (⚙️ 설정 → AI 분석 설정, 기본 2000자)으로 다시 잘라 쓰므로 영향 없음.
            resolve({ subject, sender, date, body: body.substring(0, 15000), fileName: file.name });
        };
        if (ext === 'eml') reader.readAsArrayBuffer(file);
        else reader.readAsText(file, 'utf-8');
    });
}

// 💡 바이트 배열 → latin1 문자열 (1바이트=1문자, 정보 손실 없이 나중에 charset별로 재해석 가능)
function bytesToLatin1String(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    const CHUNK = 0x8000; // 한 번에 너무 많이 넘기면 콜스택 초과날 수 있어 청크로 처리
    for (let i = 0; i < bytes.length; i += CHUNK) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return s;
}

// 💡 공용: AI가 프롬프트 지시를 따라 스스로 만들어 넣은 [출처] 줄이 있으면 제거 (코드가 만드는 것과 중복 방지)
window.stripAiGeneratedSourceTag = function(text) {
    return (text || '').replace(/\n?\[출처\][^\n]*/g, '').trim();
};
// 💡 공용: 메일 날짜 문자열에서 요일/초/타임존 부분을 없애고 간단히 표기
//    "Tue, 7 Jul 2026 14:48:16 +0900 (KST)" → "7 Jul 2026 14:48"
window.cleanMailDateForTag = function(dateStr) {
    if (!dateStr) return '';
    return dateStr
        .replace(/^[A-Za-z]{3},\s*/, '')
        .replace(/(:\d{2})\s*[+-]\d{4}\s*\([^)]*\)\s*$/, '')
        .trim();
};

// 💡 RFC 2822 메일 날짜 문자열 → YYYY-MM-DD 변환 (AI 프롬프트용)
//    변환 실패 시 null 반환 → getSystemPrompt 내에서 todayStr로 폴백
window.parseMailDateToYMD = function(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    // 로컬 시간 기준으로 날짜 추출 (UTC 변환 금지)
    return d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
};


// ─── 메일 본문 정제 (AI 입력 토큰 절약 + 품질 향상) ──────────
function cleanMailBody(raw) {
    if (!raw) return '';
    let s = String(raw);

    // 1) 과거 메일 이력(인용/포워딩) 시작 지점 찾기 — 새 요청은 보통 상단
    const markers = [
        /-{3,}\s*Original Message\s*-{3,}/i,
        /-{3,}\s*Forwarded message\s*-{3,}/i,
        /-{2,}\s*원본\s*메일\s*-{2,}/,
        /_{10,}/,
        /\n\*{0,2}\s*보낸\s*사람\s*:/,
        /\n\s*보낸\s*날짜\s*:/,
        /\n\s*발신\s*:/,
        /\n\s*Sent\s*:\s/i,
        /\n\s*From:\s.+\n\s*(Sent|To|보낸\s*날짜)\s*:/i,
        /\n[^\n]{0,80}\d{4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}[^\n]{0,40}(작성|wrote)\s*:/i,
        /\nOn\s.+\swrote:/i
    ];
    const _findCut = (str) => {
        let idx = str.length;
        for (const re of markers) {
            const m = str.match(re);
            if (m && m.index < idx) idx = m.index;
        }
        return idx;
    };
    let cutIdx = _findCut(s);
    let head = s.slice(0, cutIdx);
    // 💡 윗부분에 새 내용이 거의 없는 "순수 포워딩" 대비
    //    기존엔 원문 전체를 썼으나, 그러면 체인 맨 아래 과거 메일 날짜까지 AI에 노출됨.
    //    → 가장 최근 인용 메일 1건까지만 사용하도록 제한.
    if (head.trim().length < 40) {
        if (cutIdx < s.length) {
            const rest = s.slice(cutIdx + 1);
            head = s.slice(0, cutIdx + 1 + _findCut(rest));
        } else {
            head = s;
        }
    }
    s = head;

    // 2) 인용 라인(> ...) 제거
    // 💡 [2026-08-21][버그 수정] 일부 메일 클라이언트(Outlook 등)는 회신 시 새로 쓴 내용까지 본문 전체를
    //    ">"로 감싸서 렌더링함 — 이 경우 아래 filter()가 본문을 통째로 삭제해서 AI에 빈 본문만 전달되는
    //    사고가 실제로 있었음(예: 제목엔 오타, 본문엔 정상 기재된 프로젝트명이 이 단계에서 사라짐).
    //    → 인용줄 제거 후 남는 내용이 거의 없으면(=사실상 이게 본문 전부라는 뜻) 통째로 버리지 말고
    //    ">" 표시만 벗겨내서 실제 내용은 보존한다.
    const _withoutQuoteLines = s.split('\n').filter(l => !/^\s*>/.test(l)).join('\n');
    s = (_withoutQuoteLines.trim().length < 40)
        ? s.split('\n').map(l => l.replace(/^\s*>+\s?/, '')).join('\n')
        : _withoutQuoteLines;

    // 3) base64 덩어리·초장문 URL·data URI 노이즈 제거
    s = s.replace(/\bdata:[^\s]+/g, ' ')
         .replace(/[A-Za-z0-9+/]{200,}={0,2}/g, ' ')
         .replace(/https?:\/\/\S{80,}/g, ' ');

    // 5) 수신/참조/발신 등 헤더 라인 제거 — 발신자는 별도 파라미터로 이미 AI에 전달되므로 본문에서는 불필요
    s = s.split('\n').filter(l => !/^\s*(수신|참조|발신|received|Cc|To)\s*[:：]/i.test(l)).join('\n');

    // 6) 기밀유지 문구(Confidentiality Statement 등 법무 상용구) 이후는 전부 잘라냄 — 항상 뒤쪽에 붙는 상용구라 뒷내용 손실 없음
    const confIdx = s.search(/Confidentiality\s*Statement|기밀\s*유지|부정경쟁방지/i);
    if (confIdx > -1) s = s.slice(0, confIdx);

    // 7) 장식용 구분선(*,-,= 반복) 제거 — 정보 없이 글자수만 차지
    s = s.split('\n').filter(l => !/^[*\-=_]{5,}\s*$/.test(l.trim())).join('\n');

    // 4) 공백 정리
    s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    return s;
}

// ─── Gemini 분석 ─────────────────────────────────────────
// 💡 Gemini 분석 캐시(sessionStorage) 전체 삭제 — 버전 상관없이 gemini_cache로 시작하는 키 모두 제거
window.clearGeminiCache = function() {
    let count = 0;
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('gemini_cache')) { sessionStorage.removeItem(k); count++; }
    }
    alert(count > 0 ? `🗑️ 분석 캐시 ${count}건을 초기화했습니다.\n다음 분석부터는 새로 계산됩니다.` : '초기화할 캐시가 없습니다.');
};

// 💡 완료일이 AI 분석/파일첨부 등 어떤 경로로 와도 공통 적용되는 기본값 로직
//    시작일은 있는데 완료일을 못 찾았으면 시작일+1일로 잠정 채움 (사용자가 나중에 달력에서 수정 가능)
window._applyDefaultDueDate = function(result) {
    if (!result) return result;
    const hasStart = result['시작일'] && !String(result['시작일']).includes('날짜확인필요');
    const needsDue = !result['완료일'] || String(result['완료일']).includes('날짜확인필요');
    if (hasStart && needsDue) {
        const planDate = new Date(new Date(result['시작일']).getTime() + 1 * 24 * 60 * 60 * 1000);
        result['완료일'] = planDate.getFullYear() + '-' + String(planDate.getMonth()+1).padStart(2,'0') + '-' + String(planDate.getDate()).padStart(2,'0');
    }
    return result;
};

async function mfCallGemini(apiKey, parsed) {
    // 동일 메일 캐싱 (제목+발신자+본문 앞 200자 해시)
    // 💡 v2: 출처 태그 로직 추가로 캐시 포맷이 바뀌어서, 예전 캐시가 섞이지 않도록 버전 마커 포함
    const _ck_d = parsed.date ? (() => { const _d = new Date(parsed.date); return isNaN(_d) ? (parsed.date||'') : (_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0')+'T'+String(_d.getHours()).padStart(2,'0')+':'+String(_d.getMinutes()).padStart(2,'0')); })() : '';
    const cacheKey = 'gemini_cache_v2_' + btoa(encodeURIComponent(
        _ck_d + (parsed.subject || '') + (parsed.sender || '') + (parsed.body || '').substring(0, 200)
    ).substring(0, 100));
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { try { return JSON.parse(cached); } catch(e) {} }

    // 💡 [B안 통일화] 자체 프롬프트 생성/GAS 호출 로직 전부 제거. Stage1 매칭 먼저 하고,
    //    msCallGemini(자동파이프라인과 동일 함수)에 위임 — 프로젝트 배경정보가 메일마다 올바르게 반영됨
    let { candidatesForAI, contextOverride } = await window._msResolveMatchAndContext({
        subject: parsed.subject, body: parsed.body
    });
    const result = await msCallGemini(apiKey, parsed, candidatesForAI, contextOverride);
    let projectTag = null;
    if (result) {
        // 💡 AI가 반환한 매칭신뢰도/주매칭프로젝트번호로 최종 확정 (ms/자동틱과 동일 공용 헬퍼)
        projectTag = window._msResolveAiProjectMatch(result, candidatesForAI);
        // 💡 AI가 프롬프트 지시대로 스스로 만든 [출처]가 있으면 지우고, 코드에서 만든 깨끗한 것만 남김
        result['상세내용'] = window.stripAiGeneratedSourceTag(result['상세내용']);
        const srcTag = `[출처]${parsed.subject || ''}_${window.cleanMailDateForTag(parsed.date)}_${parsed.sender || ''}`;
        result['상세내용'] = (result['상세내용'] || '') + '\n' + srcTag;
    }
    // 💡 [매칭/점수 통일화] 예전엔 task만 반환해서 파일첨부 탭에서 매칭결과가 통째로 버려졌음 — projectTag도 함께 반환
    const wrapped = { task: result, projectTag };
    if (result) { try { sessionStorage.setItem(cacheKey, JSON.stringify(wrapped)); } catch(e) {} }
    return wrapped;
}

// ─── 일괄 분석 ───────────────────────────────────────────
window.mfAnalyze = async function() {
    const apiKey = window.getActiveAiKey();
    if (!apiKey)  { alert('Gemini API 키를 먼저 저장해주세요.'); return; }
    if (!window._mfFiles.length) { alert('파일을 선택해주세요.'); return; }

    document.getElementById('mf-analyze-btn').disabled  = true;
    document.getElementById('mf-progress').style.display = 'block';
    document.getElementById('mf-result-list').style.display = 'none';
    document.getElementById('mf-list-header').style.display = 'none';
    document.getElementById('mf-batch-btn').style.display   = 'none';
    document.getElementById('mf-batch-inbox-btn').style.display = 'none';
    document.getElementById('mail-right-empty').style.display  = 'flex';
    document.getElementById('mail-right-detail').style.display = 'none';
    window._mfCurrentIdx = -1;

    const progBar  = document.getElementById('mf-prog-bar');
    const progText = document.getElementById('mf-prog-text');
    const results  = [];

    window._mfAnalyzeCancelled = false;
    const priorityConfig = await window.loadPriorityConfig(); // 💡 [매칭/점수 통일화]
    for (let i=0; i<window._mfFiles.length; i++) {
        if (window._mfAnalyzeCancelled) break;
        const f = window._mfFiles[i];
        progText.textContent = `${i+1}/${window._mfFiles.length} — ${f.name}`;
        progBar.style.width  = `${Math.round(((i+1)/window._mfFiles.length)*100)}%`;
        let parsed = null;
        try {
            parsed = await mfParseFile(f);
        } catch (e) {
            results.push({
                idx:i, fileName:f.name, subject:f.name, sender:'', date:'', body:'',
                project:null, task:null, selected:false, registered:false, error:'파일 읽기 실패: ' + e.message
            });
            if (i < window._mfFiles.length-1) await new Promise(r=>setTimeout(r,400));
            continue;
        }
        try {
            if (i > 0) await new Promise(r => setTimeout(r, 2000)); // 1.5초 딜레이
            const { task, projectTag } = await mfCallGemini(apiKey, parsed);
            // 💡 [매칭/점수 통일화] .eml엔 To/Cc/중요도 헤더가 없어 규칙점수 일부(수신방식·중요도)는 제외하고 계산
            const scoreResult = task ? window._msComputeTotalScore(
                { subject: parsed.subject, body: parsed.body, sender: parsed.sender, isToMe: false, isCcMe: false, importance: false },
                task, priorityConfig) : null;
            results.push({
                idx: i, fileName: f.name,
                subject: parsed.subject,
                sender: parsed.sender,
                date: parsed.date,
                body: parsed.body,   // ← 추가
                project: window._msProjectTagLabel(projectTag), task,
                _projectTag: projectTag,
                _score: scoreResult ? scoreResult.total : null,
                _scoreGrade: scoreResult ? window._msScoreGrade(scoreResult.total, priorityConfig.cutline) : null,
                _scoreBreakdown: scoreResult ? scoreResult.breakdown : null,
                _alarmWorthy: !!(scoreResult && priorityConfig && scoreResult.total >= priorityConfig.cutline),
                selected: !!task,
                registered: false,
                error: !task ? 'AI 분석 실패 (본문은 아래에서 확인 가능)' : null
            });
        } catch(e) {
            // ✅ Gemini 호출 자체가 실패해도, 이미 추출된 메일 본문(parsed)은 그대로 보존
            results.push({
                idx:i, fileName:f.name,
                subject: parsed.subject || f.name,
                sender: parsed.sender || '',
                date: parsed.date || '',
                body: parsed.body || '',
                project:null, task:null, selected:false, registered:false, error: e.message
            });
        }
        if (i < window._mfFiles.length-1)
            await new Promise(r=>setTimeout(r,400));
    }

    const startIdx = window._mfResults.length;
    results.forEach((r, i) => { r.idx = startIdx + i; });
    // 💡 [최신 항목 상단 표시] 방금 분석한 배치를 기존 목록 위(앞)에 붙임
    window._mfResults = [...results, ...window._mfResults];
    document.getElementById('mf-analyze-btn').disabled   = false;
    document.getElementById('mf-progress').style.display  = 'none';
    document.getElementById('mf-result-count').textContent = results.length;
    mfRenderList(results);

    // 💡 [완전자동] mail_mode='full'이면 TaskInbox 대기 없이 바로 Gantt 등록 시도 (건별)
    results.forEach(function(r) {
        window._msTryFullAutoRegister(r,
            { subject: r.subject, sender: r.sender, date: r.date, body2000: r.body, fileName: r.fileName },
            () => mfRenderList(window._mfResults));
    });
};

// ─── 파일 일괄 분석 강제 중단/초기화 ─────────────────────────
window.mfResetAnalysis = function() {
    window._mfAnalyzeCancelled = true; // 다음 루프 반복에서 멈춤
    document.getElementById('mf-analyze-btn').disabled  = false;
    document.getElementById('mf-progress').style.display = 'none';
    document.getElementById('mf-prog-bar').style.width    = '0%';
};

// ─── 왼쪽 목록 렌더링 ───────────────────────────────────

window.mfDeleteItem = function(idx) {
    const r = window._mfResults[idx];
    if (!r) return;
    const label = r.task ? (r.task['업무명'] || '새업무') : r.subject;
    if (!confirm(`"${label}"\n이 분석 항목을 목록에서 삭제하시겠습니까?\n(등록된 항목이라도 Gantt Chart의 실제 데이터는 지워지지 않습니다)`)) return;
    window._mfResults.splice(idx, 1);
    mfRenderList(window._mfResults);
};
function mfRenderList(results) {
    const list = document.getElementById('mf-result-list');
    let html = '';
    results.forEach((r, i) => {
        const canSel = !!r.task;  // 프로젝트 미매칭이어도 task 있으면 클릭 가능
        const bg     = r.registered ? '#d4edda'
                     : canSel       ? '#fff'
                     :                '#fafafa';
        const taskName = r.task ? (r.task['업무명']||'새업무') : null;
        html += `
        <div id="mf-list-item-${i}" data-idx="${i}"
             style="display:flex; align-items:center; gap:6px;
                    padding:7px 8px; border-bottom:1px solid #f0f0f0;
                    background:${bg}; cursor:pointer; transition:background 0.15s;">

            <!-- 체크박스 -->
            <input type="checkbox" data-idx="${i}"
                   ${canSel && r.selected ? 'checked':''}
                   ${canSel ? '' : 'disabled'}
                   style="flex-shrink:0;">

            <!-- 번호 -->
            <span style="font-size:10px; color:#aaa; flex-shrink:0; width:16px;">${i+1}</span>

            <!-- 내용 -->
            <div style="flex:1; min-width:0;">
                <div style="font-size:12px; font-weight:${canSel?'bold':'normal'};
                            color:${canSel?'#333':'#aaa'};
                            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${canSel
                        ? escapeHtml(taskName) + ' 📧'
                        : escapeHtml(r.subject.substring(0,35))}
                </div>
                <div style="display:flex; gap:4px; margin-top:2px; flex-wrap:wrap;">
                    ${r.project
                        ? `<span style="background:#e7f3ff; color:#0056b3; padding:1px 5px;
                                        border-radius:3px; font-size:10px; font-weight:bold;">
                               ${r.project}</span>`
                        : `<span style="color:#dc3545; font-size:10px;">${r.error||''}</span>`}
                    ${r.task && r.task['시작일']
                        ? `<span style="font-size:10px; color:#888;">
                               ${r.task['시작일'].includes('날짜확인필요')
                                   ? '⚠️날짜필요' : r.task['시작일']}</span>`
                        : ''}
                    ${r.registered
                        ? `<span style="color:#28a745; font-size:10px; font-weight:bold;">✅등록완료</span>`
                        : `<span style="color:#999; font-size:10px;">⬜미등록</span>`}
                </div>
            </div>
            <button data-del-idx="${i}" title="목록에서 삭제"
                    style="flex-shrink:0; border:none; background:none; color:#bbb; cursor:pointer; font-size:13px; padding:2px 4px;"
                    onmouseover="this.style.color='#dc3545'" onmouseout="this.style.color='#bbb'">🗑</button>
        </div>`;
    });

    list.innerHTML = html || '<div style="padding:20px; text-align:center; color:#aaa;">결과 없음</div>';
    document.getElementById('mf-list-header').style.display = 'flex';
    list.style.display   = 'block';
    document.getElementById('mf-batch-btn').style.display   = 'block';
    document.getElementById('mf-batch-inbox-btn').style.display = 'block';
    window.mfSyncCheckAll();

    // ✅ innerHTML 렌더링 후 이벤트 직접 연결
    results.forEach((r, i) => {
        const row = document.getElementById(`mf-list-item-${i}`);
        if (!row) return;

        // 행 클릭
        row.addEventListener('click', function(e) {
            // 체크박스·삭제버튼 클릭은 제외
            if (e.target.type === 'checkbox' || e.target.dataset.delIdx !== undefined) return;
            window.mfSelectItem(i);
        });

        // 삭제 버튼
        const delBtn = row.querySelector('[data-del-idx]');
        if (delBtn) {
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                window.mfDeleteItem(i);
            });
        }

        // 체크박스 변경
        const cb = row.querySelector('input[type=checkbox]');
        if (cb) {
            cb.addEventListener('change', function() {
                window.mfToggleCheck(i, this.checked);
            });
        }

        // 호버
        row.addEventListener('mouseover', function() {
            if (!this.classList.contains('mf-active'))
                this.style.background = '#e7f3ff';
        });
        row.addEventListener('mouseout', function() {
            if (!this.classList.contains('mf-active')) {
                const rr = window._mfResults[i];
                this.style.background = rr.registered ? '#d4edda' : (rr.task ? '#fff' : '#fafafa');
            }
        });
    });
}

window.mfToggleCheck = function(idx, checked) {
    if (window._mfResults && window._mfResults[idx] !== undefined) {
        window._mfResults[idx].selected = checked;
    }
    window.mfSyncCheckAll();
};

window.mfSyncCheckAll = function() {
    const all = document.querySelectorAll('#mf-result-list input[type=checkbox]:not(:disabled)');
    const chk = document.querySelectorAll('#mf-result-list input[type=checkbox]:not(:disabled):checked');
    const ca  = document.getElementById('mf-check-all');
    if (ca) ca.checked = all.length > 0 && all.length === chk.length;
};

window.mfSelectAll = function(select) {
    document.querySelectorAll('#mf-result-list input[type=checkbox]:not(:disabled)')
        .forEach(cb => {
            cb.checked = select;
            const idx = parseInt(cb.dataset.idx);
            if (!isNaN(idx)) window._mfResults[idx].selected = select;
        });
};

// ─── 행 클릭 → 오른쪽 패널 표시 ────────────────────────
window.mfSelectItem = function(idx) {
    const r = window._mfResults[idx];
    if (!r) return;

    // task 없으면 안내 + 확보된 본문(있다면)과 수동 전환 버튼 표시
    if (!r.task) {
        const _mfEn = window._currentLang === 'en';
        const emptyEl = document.getElementById('mail-right-empty');
        if (emptyEl) emptyEl.innerHTML =
            `<div style="font-size:32px;">⚠️</div>
             <div style="font-size:13px; font-weight:bold; color:#dc3545; margin-top:8px;">${escapeHtml(r.error || (_mfEn ? 'AI analysis failed' : 'AI 분석 실패'))}</div>
             <div style="font-size:11px; color:#aaa; margin-top:4px;">${escapeHtml(r.subject)}</div>
             ${r.body ? `
             <div style="text-align:left; width:100%; align-self:stretch; box-sizing:border-box; margin-top:14px; padding-top:10px; border-top:1px solid #eee; display:flex; flex-direction:column; flex:1; min-height:0;">
                <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px; flex-shrink:0;">📄 ${_mfEn ? 'Extracted mail body (kept even if analysis failed)' : '추출된 메일 본문 (분석 실패 시에도 원문은 보존됩니다)'}</div>
                <div style="flex:1; min-height:80px; max-height:45vh; overflow-y:auto; overflow-x:hidden; font-size:11px; color:#666; white-space:pre-wrap; overflow-wrap:break-word; word-break:break-word; background:#f8f9fa; border:1px solid #eee; border-radius:6px; padding:8px; box-sizing:border-box;">${escapeHtml(r.body)}</div>
                <button class="action-btn" onclick="window.mfRetryAsManual(${idx})" style="margin-top:8px; font-size:13px; width:100%; box-sizing:border-box; flex-shrink:0;">✏️ ${_mfEn ? 'Register as-is (manual)' : '본문으로 직접 등록'}</button>
                <button class="action-btn" onclick="AR.moveToDirectInput('mf', ${idx})" style="margin-top:4px; font-size:13px; width:100%; box-sizing:border-box; background:#fff; color:#2c5f8a; border-color:#2c5f8a; flex-shrink:0;">🔄 ${_mfEn ? 'Move to Direct Input & re-analyze' : '직접 입력 탭으로 이동해서 AI 분석'}</button>
             </div>` : `<div style="font-size:11px; color:#bbb; margin-top:10px;">${_mfEn ? 'Could not extract body.' : '본문을 추출하지 못했습니다.'}</div>`}`;
        document.getElementById('mail-right-empty').style.display = 'flex';
        document.getElementById('mail-right-detail').style.display = 'none';
        return;
    }

    // 활성 항목 하이라이트
    if (window._mfCurrentIdx >= 0) {
        const prev = document.getElementById(`mf-list-item-${window._mfCurrentIdx}`);
        if (prev) { prev.classList.remove('mf-active'); prev.style.background = window._mfResults[window._mfCurrentIdx]?.registered ? '#d4edda' : '#fff'; }
    }
    window._mfCurrentIdx = idx;
    const cur = document.getElementById(`mf-list-item-${idx}`);
    if (cur) { cur.classList.add('mf-active'); cur.style.background = '#fff3e0'; }

    // 공통 오른쪽 패널 표시
    mailShowRightDetail(r.subject, r.sender, r.date||'', r.body||'', r.project, r.task, () => {
        r.task = JSON.parse(JSON.stringify(window._mailAnalyzedResult));
        if (!mfDirectInsert(r.task, r.mailRaw || window._mailParsedRaw)) return;
        window._mfResults.splice(idx, 1);
        mfRenderList(window._mfResults);
        document.getElementById('mail-right-empty').style.display = 'flex';
        document.getElementById('mail-right-detail').style.display = 'none';
        window._mfCurrentIdx = -1;
        window.recalculateSchedules();
    }, r.mailRaw);
};

// ✅ AI 분석 실패 항목을, 추출된 본문을 상세내용에 채운 "빈 업무" 상태로 전환해 수동 입력 흐름으로 넘김
window.mfRetryAsManual = function(idx) {
    const r = window._mfResults[idx];
    if (!r) return;
    r.task = {
        '업무명': r.subject || '새 업무',
        '시작일': '날짜확인필요', '완료일': '날짜확인필요',
        '상태': '진행', '개발단계': '', '상세내용': r.body || '',
        'wbs레벨': 4
    };
    r.selected = true;
    r.error = null;
    mfRenderList(window._mfResults); // 좌측 목록 체크박스/스타일 갱신
    window.mfSelectItem(idx);
};

// mfRightInsert → mailRightInsert 으로 통합

window.mfBatchInsert = async function() {
    // 1. 제외 로직: 날짜가 없는 항목 필터링
    const validTargets = window._mfResults.filter(r => 
        r.selected && r.task && !r.registered &&
        !( (r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요') )
    );

    const excludedCount = window._mfResults.filter(r => r.selected && r.task && !r.registered).length - validTargets.length;

    if (!validTargets.length) {
        alert(excludedCount > 0 ? '⚠️ 날짜가 없는 항목은 등록할 수 없습니다. (제외됨)' : '등록할 항목을 체크해주세요.');
        return;
    }

    // 2. 미리보기 검토 안전장치
    let previewMsg = `✅ 총 ${validTargets.length}개 항목을 일괄 등록합니다.\n`;
    if (excludedCount > 0) previewMsg += `\n⚠️ 날짜가 없는 ${excludedCount}개 항목은 자동으로 제외되었습니다.`;
    previewMsg += '\n\n[등록할 업무 목록]\n' + validTargets.map(r => '• ' + (r.task['업무명']||'새업무')).join('\n');
    
    if (!confirm(previewMsg + '\n\n위 내용으로 등록하시겠습니까?')) return;

    // 3. 등록 실행
    // mfBatchInsert 함수 루프 부분 수정
    for (let i = window._mfResults.length - 1; i >= 0; i--) {
        const r = window._mfResults[i];
        if (r.selected && r.task && !r.registered) {
            // 💡 중요: 만약 분석 창을 통해 수정한 데이터가 있다면 그것을 task에 덮어씌움
            if (window._mfCurrentIdx === i && window._mailAnalyzedResult) {
                r.task = window._mailAnalyzedResult;
            }
            
            if (mfDirectInsert(r.task, r.mailRaw)) {
                r.registered = true;
                r.selected = false;
            }
        }
    }

    mfRenderList(window._mfResults);
    window.recalculateSchedules();
    alert(`✅ ${validTargets.length}개 항목이 등록되었습니다!`);
};

// 날짜체크 없이 직접 삽입
function mfDirectInsert(task, mailRaw, setAlarm) {
    if (!globalData || globalData.length <= 1) { 
        alert('먼저 Gantt Chart 파일을 불러와주세요.'); 
        return false; 
    }

    // 💡 AI 분석값(3 등)과 무관하게 항상 가장 낮은 레벨(4)로 등록
    const level = 4;
    // ✅ 엑셀의 전체 열 개수만큼 빈 배열 생성 (공간 부족 방지)
    let newRow = new Array(globalData[0].length).fill("");
    newRow._level = level;
    
    // 업무명 설정
    const taskName = (task['업무명']||'새 업무') + ' 📧';
    if      (level===0) newRow._origDev=taskName;
    else if (level===1) newRow._origT1 =taskName;
    else if (level===2) newRow._origT2 =taskName;
    else if (level===3) newRow._origT3 =taskName;
    else                newRow._origT4 =taskName;

    // 기본값 매핑 (참조할 행이 있는 경우에만 복사)
    let ref = globalData[1]; 
    if (ref) {
        ['assignee','customer','model','inch'].forEach(k=>{
            const ki=colIdx[k]; 
            if(ki >= 0 && ki < newRow.length) newRow[ki] = ref[ki] || "";
        });
    }

    // 💡 날짜 데이터 강제 삽입 (검토한 데이터를 확실하게 반영)
    // colIdx가 -1(열 없음)이면 무시하고 진행하도록 안전 조건 추가
    if (colIdx.start >= 0 && colIdx.start < newRow.length) {
        newRow[colIdx.start] = task['시작일'] || "";
        newRow._startForced = true;
    }
    if (colIdx.plan >= 0 && colIdx.plan < newRow.length) {
        newRow[colIdx.plan] = task['완료일'] || "";
        newRow._planForced = true;
    }
    // 💡 [2026-08-24 신규] buildMailTaskRow와 동일한 AI 원본 날짜 백업 — "📅 AI 분석 날짜로 복원"용
    newRow._aiOrigStart = task['시작일'] || null;
    newRow._aiOrigPlan  = task['완료일'] || null;
    if (colIdx.status >= 0 && colIdx.status < newRow.length) 
        newRow[colIdx.status] = (task['상태'] || "진행");
    if (colIdx.devStage >= 0 && colIdx.devStage < newRow.length) 
        newRow[colIdx.devStage] = (task['개발단계'] || "");
    if (colIdx.content >= 0 && colIdx.content < newRow.length) 
        newRow[colIdx.content] = (task['상세내용'] || "").replace(/\\n/g, '\n');

    // 소요일 설정
    const dm={1:'dur1',2:'dur2',3:'dur3',4:'dur4'};
    const di=colIdx[dm[level]||'dur3']; 
    if(di >= 0 && di < newRow.length) newRow[di] = '1';

    // 삽입 위치 결정 (mail-insert-position select 값 참조)
    const insertSelect = document.getElementById('mail-insert-position');
    const insertAfter = insertSelect ? parseInt(insertSelect.value) : -1;
    const pos = insertAfter === -1 ? globalData.length : insertAfter + 1;
    newRow._mailRaw = mailRaw || null;
    if (setAlarm) newRow._알림 = true; // 💡 [매칭/점수 통일화] 커트라인 이상 점수면 D-7/3/1 알림 대상으로 자동 설정
    globalData.splice(pos, 0, newRow);
    logChange(pos,-1,'없음',`메일파일 등록: ${taskName}`);
    return true;
}
// =========================================================
// 🌐 메일 서버 탭 기능
// =========================================================

const MS_SERVER_URL = 'http://127.0.0.1:5000';
window._msResults   = [];
window._msCurrentIdx = -1;

// 💡 [메일 자동처리 ①] 자동수집 전용 큐 영속성 — 새로고침해도 검토 대기 목록 유지
const MS_QUEUE_STORAGE_KEY     = 'ms_pending_queue';
const MS_LAST_AUTO_FETCH_KEY   = 'ms_last_auto_fetch_at';

window._msSaveQueueToStorage = function() {
    try {
        // task/AI분석 실패 없이 원문만 있는 것도 포함, 최대 300건만 보관(용량 방어)
        const trimmed = (window._msResults || []).slice(-300);
        localStorage.setItem(MS_QUEUE_STORAGE_KEY, JSON.stringify(trimmed));
    } catch(e) { console.warn('큐 저장 실패:', e); }
};

window._msLoadQueueFromStorage = function() {
    try {
        const raw = localStorage.getItem(MS_QUEUE_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) {
            window._msResults = saved;
            if (typeof msRenderList === 'function') msRenderList(window._msResults);
        }
    } catch(e) { console.warn('큐 복원 실패:', e); }
};

// ─── 메일 서버 계정 상태 표시 + 초기값 세팅 ────────────────────
// 💡 [2026-08-31] POP3(메일 수신, 이 탭)와 SMTP(메일 발송, 알람 설정) 계정을 실제로 테스트해보니
//    같은 메일 계정(예: yhpark@kortek.co.kr)으로 둘 다 로그인된다 — 회사 메일함 하나를 프로토콜만
//    다르게 접근하는 구조라 당연한 결과. 그래서 여기서 따로 아이디/비번을 입력·저장받지 않고,
//    알람 설정(⚙️ 알람 설정 → 📧 이메일 알람 → 🖥️ 이메일 서버 설정)에 저장된 계정을 그대로 재사용한다.
window._msRefreshServerAccountStatus = function() {
    const el = document.getElementById('ms-account-status-text');
    if (!el) return;
    const _en = window._currentLang === 'en';
    const smtp = (window.loadAlarmSettings ? window.loadAlarmSettings() : {}).smtp || {};
    if (smtp.user && smtp.pass) {
        el.textContent = _en ? `✅ Mail account: ${smtp.user}` : `✅ 메일 계정: ${smtp.user}`;
        el.style.color = '#27ae60';
    } else {
        el.textContent = _en ? '⚠️ No mail account configured — set it up with the button on the right.' : '⚠️ 메일 계정이 설정되지 않았습니다 — 오른쪽 버튼으로 먼저 설정해주세요.';
        el.style.color = '#e67e22';
    }
};

// 알람 설정 모달을 열고 "📧 이메일 알람" 섹션을 강제로 펼쳐서 보여줌 (이미 펼쳐져 있어도 그대로 유지)
window.msOpenEmailServerSettings = function() {
    if (window.openAlarmSettings) window.openAlarmSettings();
    const sec = document.getElementById('sec-email');
    if (sec && sec.style.display === 'none' && window._toggleAlarmSection) window._toggleAlarmSection('sec-email');
};

    (function() {
    // 저장된 API 키 상태 표시 (선택된 AI 제공사 기준)
    const savedKey = window.getActiveAiKey();
    const keyInput  = document.getElementById('ms-personal-apikey');
    const keyStatus = document.getElementById('ms-key-status');
    if (savedKey && keyInput) {
        keyInput.value = savedKey;
        if (keyStatus) {
            keyStatus.textContent = '✅ 저장된 키 있음';
            keyStatus.style.color = '#28a745';
        }
    } else if (keyStatus) {
        keyStatus.textContent = window._currentLang === 'en' ? '⚠️ Please enter your API key' : '⚠️ API 키를 입력해주세요';
        keyStatus.style.color = '#e67e22';
    }
    // 날짜 기본값: 오늘 기준
    const today = new Date();
    const week  = new Date(today);
    const fmt   = d => d.toISOString().split('T')[0];
    const sd = document.getElementById('ms-start-date');
    const ed = document.getElementById('ms-end-date');
    if (sd) sd.value = fmt(today);
    if (ed) ed.value = fmt(today);
})();

// ─── 메일 가져오기 ───────────────────────────────────────
window.msFetchMail = async function() {
    // 💡 아이디/비번은 더 이상 이 탭에서 따로 입력받지 않고, 알람 설정(이메일 서버 설정)의 SMTP
    //    계정을 그대로 재사용한다 — 같은 메일 계정이 POP3(수신)/SMTP(발송) 둘 다에 로그인됨을 확인함.
    const smtp = (window.loadAlarmSettings ? window.loadAlarmSettings() : {}).smtp || {};
    const userid   = (smtp.user || '').trim();
    const password = smtp.pass || '';
    const startDate = document.getElementById('ms-start-date').value;
    const endDate   = document.getElementById('ms-end-date').value;

    if (!userid || !password) {
        alert('먼저 이메일 서버 계정을 설정해주세요 (⚙️ 이메일 서버 설정 버튼).');
        window.msOpenEmailServerSettings();
        return;
    }
    if (!startDate || !endDate) { alert('날짜를 선택해주세요.'); return; }

    // UI 초기화
    window._msAnalyzeCancelled = false;
    const _msEn0 = window._currentLang === 'en';
    document.getElementById('ms-status').textContent   = _msEn0 ? '📡 Connecting to server...' : '📡 서버에 연결 중...';
    document.getElementById('ms-progress').style.display = 'block';
    document.getElementById('ms-result-list').innerHTML = ''; document.getElementById('ms-list-header').style.display = 'none';
    document.getElementById('ms-batch-btn').style.display = 'none';
    document.getElementById('ms-batch-inbox-btn').style.display = 'none';
    document.getElementById('ms-prog-bar').style.width = '10%';
    document.getElementById('ms-prog-text').textContent = _msEn0 ? 'Fetching mails...' : '메일 가져오는 중...';

    try {
        // 1단계: 메일 수집
        const res = await fetch(`${MS_SERVER_URL}/fetch-mail`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
            mailUser:     userid,
            mailPw:       password,
            startDate,
            endDate,
            keyword:      document.getElementById('ms-keyword')?.value?.trim() || '',
            keywordFrom:  document.getElementById('ms-keyword-from')?.value?.trim() || '',
            keywordBody:  document.getElementById('ms-keyword-body')?.value?.trim() || '',
            maxCount:     500
            })
        });
        const data = await res.json();

        if (data.status !== 'success') throw new Error(data.message);

        document.getElementById('ms-prog-bar').style.width  = '30%';
        document.getElementById('ms-prog-text').textContent = _msEn0 ? `${data.count} collected — AI analyzing...` : `${data.count}개 수집 완료 — AI 분석 중...`;
        document.getElementById('ms-status').textContent    = _msEn0 ? `✅ ${data.count} mails collected` : `✅ ${data.count}개 메일 수집 완료`;
        document.getElementById('ms-result-count').textContent = data.count;

        // 💡 건별로 채워나갈 배열 (중단하더라도 여기까지 담긴 내용은 그대로 표시됨)
        window._msResults = [];
        document.getElementById('ms-list-header').style.display = 'block'; // 0개부터 바로 보여줌

        // 2단계: AI 분석 전 API 키 확인
        const apiKey = window.getActiveAiKey();
        if (!apiKey) {
            document.getElementById('ms-status').textContent = _msEn0 ? '✅ Mails collected (AI analysis skipped — API key not set)' : '✅ 메일 수집 완료 (AI 분석 생략 — API 키 미설정)';
            document.getElementById('ms-progress').style.display = 'none';
            document.getElementById('ms-list-header').style.display = 'block';
            document.getElementById('ms-batch-btn').style.display = 'block';
            document.getElementById('ms-batch-inbox-btn').style.display = 'block';
            // 수집된 메일을 분석 없이 목록에 표시 (AI 없이도 키워드 매칭 배지는 표시)
            const projectListNoAi = await window._msLoadProjectIndex();
            window._msResults = data.data.map((mail, i) => {
                const matched = window._msMatchProjects(mail, projectListNoAi);
                const projectTag = matched.length === 0 ? null
                    : matched.length === 1 ? { status: 'matched', candidates: matched }
                    : { status: 'ambiguous', candidates: matched };
                return {
                    idx: i, fileName: mail.fileName,
                    subject: mail.subject, sender: mail.sender, date: mail.date,
                    body: mail.body, project: window._msProjectTagLabel(projectTag), task: null,
                    _projectTag: projectTag,
                    selected: false, registered: false, error: 'API키 미설정'
                };
            });
            if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 미분류 배지 갱신
            msRenderList(window._msResults);
            return;
        }

        // 💡 [매칭/점수 통일화] 자동틱과 동일하게, 분석 루프 시작 전 프로젝트 인덱스·우선순위 설정을 1회 로드
        // 💡 [2026-08-29 신규] "완료" 표시된 프로젝트는 여기서 미리 걸러서(_msFilterCandidateProjects),
        //    아래 candidatesForAI(AI 직접매칭 후보)에도, 키워드 배지 표시용 _msMatchProjects 호출에도
        //    처음부터 안 들어가게 한다.
        const projectList    = window._msFilterCandidateProjects(await window._msLoadProjectIndex());
        const priorityConfig = await window.loadPriorityConfig();

        // 2단계: 각 메일 AI 분석 (파일첨부 탭과 동일 로직) — 1건씩 완료될 때마다 화면 갱신
        for (let i = 0; i < data.data.length; i++) {
            if (window._msAnalyzeCancelled) {
                document.getElementById('ms-prog-text').textContent = _msEn0 ? `⏹ Stopped (${i}/${data.data.length} analyzed)` : `⏹ 중단됨 (${i}/${data.data.length}건 분석 완료)`;
                break;
            }

            const mail = data.data[i];
            document.getElementById('ms-prog-bar').style.width =
                `${30 + Math.round((i / data.data.length) * 65)}%`;
            document.getElementById('ms-prog-text').textContent =
                (_msEn0 ? `AI analyzing... ${i+1}/${data.data.length} — ${mail.subject.substring(0,20)}` : `AI 분석 중... ${i+1}/${data.data.length} — ${mail.subject.substring(0,20)}`);

            let item;
            try {
                // 💡 [AI 직접 매칭] 키워드 사전매칭 없이, 활성 프로젝트 전체를 후보로 AI에게 넘겨 판단시킴
                const candidatesForAI = projectList.length ? projectList : null;

                const task = await msCallGemini(apiKey, {
                    subject: mail.subject,
                    sender:  mail.sender,
                    date:    mail.date,
                    body:    mail.body,
                    fileName: mail.fileName
                }, candidatesForAI, null);

                // 💡 AI가 반환한 매칭신뢰도/주매칭프로젝트번호로 최종 확정 (mf/자동틱과 동일 공용 헬퍼)
                const projectTag = window._msResolveAiProjectMatch(task, candidatesForAI);

                // 💡 [매칭/점수 통일화] 규칙점수(직급/외부/긴급키워드/수신방식/중요도) + AI점수(마감임박도/업무영향도) 합산
                const scoreResult = task ? window._msComputeTotalScore(mail, task, priorityConfig) : null;

                item = {
                    idx: i, fileName: mail.fileName,
                    subject: mail.subject, sender: mail.sender, date: mail.date,
                    body: mail.body,
                    // 💡 [2026-08-24 버그 수정] 이 필드가 없어서 "⚡ 선택항목 연속등록"(AR.batchInsert)이
                    //    r.mailRaw를 못 찾고 엉뚱한(직접입력 탭 전용) window._mailParsedRaw로 대체하려다
                    //    실패 → Gantt에 꽂힌 행에 _mailRaw가 안 남아 "📧 원문 보기" 버튼이 사라졌었다.
                    mailRaw: { subject: mail.subject, sender: mail.sender, date: mail.date, body2000: mail.body, fileName: mail.fileName },
                    project: window._msProjectTagLabel(projectTag), task,
                    _projectTag: projectTag,
                    _score: scoreResult ? scoreResult.total : null,
                    _scoreGrade: scoreResult ? window._msScoreGrade(scoreResult.total, priorityConfig.cutline) : null,
                    _scoreBreakdown: scoreResult ? scoreResult.breakdown : null,
                    _alarmWorthy: !!(scoreResult && priorityConfig && scoreResult.total >= priorityConfig.cutline),
                    selected: !!task,
                    registered: false,
                    error: !task ? 'AI분석실패' : null,
                    matchReason: (task && task['매칭근거']) || '' // 💡 [2026-09-01 신규] "왜 이 프로젝트로(또는 미분류로) 판단했는지" AI 근거 — 미분류 큐에서 노출
                };
            } catch(e) {
                item = {
                    idx: i, fileName: mail.fileName,
                    subject: mail.subject, sender: mail.sender, date: mail.date,
                    body: mail.body,
                    mailRaw: { subject: mail.subject, sender: mail.sender, date: mail.date, body2000: mail.body, fileName: mail.fileName },
                    project: null, task: null,
                    selected: false, registered: false, error: e.message
                };
            }

            // 💡 1건 끝날 때마다 바로 목록에 반영 (진행상황 실시간 확인)
            // 💡 [최신 항목 상단 표시]
            window._msResults.unshift(item);
            const analyzedSoFar = window._msResults.filter(r => r.task).length;
            document.getElementById('ms-analyzed-count').textContent = analyzedSoFar;
            msRenderList(window._msResults);

            // 💡 [완전자동] mail_mode='full'이면 TaskInbox 대기 없이 바로 Gantt 등록 시도
            window._msTryFullAutoRegister(item,
                { subject: mail.subject, sender: mail.sender, date: mail.date, body2000: mail.body, fileName: mail.fileName },
                () => msRenderList(window._msResults));

            if (i < data.data.length - 1 && !window._msAnalyzeCancelled) await new Promise(r => setTimeout(r, 4000));
        }

        document.getElementById('ms-prog-bar').style.width  = '100%';
        document.getElementById('ms-prog-text').textContent = window._msAnalyzeCancelled ? (_msEn0 ? '⏹ Stopped (results so far shown below)' : '⏹ 중단됨 (아래는 여기까지 분석된 내용)') : (_msEn0 ? 'Analysis complete!' : '분석 완료!');
        document.getElementById('ms-progress').style.display = 'none';
        document.getElementById('ms-list-header').style.display = 'block';
        document.getElementById('ms-batch-btn').style.display   = 'block';
        document.getElementById('ms-batch-inbox-btn').style.display = 'block';
        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 미분류 배지 갱신

    } catch(e) {
        document.getElementById('ms-status').textContent = (_msEn0 ? `❌ Error: ${e.message}` : `❌ 오류: ${e.message}`);
        document.getElementById('ms-progress').style.display = 'none';
        // 💡 오류가 나도, 그 전까지 수집/분석된 내용이 있으면 화면에 표시
        if (window._msResults && window._msResults.length) {
            document.getElementById('ms-list-header').style.display = 'block';
            document.getElementById('ms-batch-btn').style.display   = 'block';
            document.getElementById('ms-batch-inbox-btn').style.display = 'block';
            msRenderList(window._msResults);
            if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 미분류 배지 갱신
        }
    }
};

// ─── [메일 자동처리 ②] Stage 0 룰 필터 — AI 호출 전 걸러내기 ──
// 💡 [2026-08-20] 하드코딩 상수는 "최초 기본값"으로만 쓰고, 실제 판정은 localStorage에 저장된
//    규칙(사용자가 📬 미분류/신규발신자 UI에서 추가·삭제 가능)을 우선 사용하도록 변경.
const MS_AUTO_SUBJECT_KW_DEFAULT = [
    'automatic reply', 'auto reply', 'auto-reply', 'out of office',
    '부재중', '자동회신', '[광고]', '[ad]', 'unsubscribe', 'do not reply'
];
const MS_NOREPLY_PATTERNS_DEFAULT = ['noreply', 'no-reply', 'donotreply', 'mailer-daemon', 'postmaster'];
const MS_NEW_SENDER_QUEUE_KEY = 'ms_new_sender_queue';
const MS_DISCARD_QUEUE_KEY = 'ms_discard_queue';
const MS_FILTER_RULES_KEY = 'ms_filter_rules';

// 💡 관리 가능한 필터 규칙 3종: 제목 키워드 차단 / 발신자 패턴 차단(noreply류) / 발신자 도메인 완전차단(신규 추가)
window._msGetFilterRules = function() {
    try {
        const saved = JSON.parse(localStorage.getItem(MS_FILTER_RULES_KEY) || 'null');
        if (saved && Array.isArray(saved.subjectKeywords) && Array.isArray(saved.noreplyPatterns) && Array.isArray(saved.blockedDomains)) {
            return saved;
        }
    } catch(e) {}
    return { subjectKeywords: MS_AUTO_SUBJECT_KW_DEFAULT.slice(), noreplyPatterns: MS_NOREPLY_PATTERNS_DEFAULT.slice(), blockedDomains: [] };
};
window._msSaveFilterRules = function(rules) {
    localStorage.setItem(MS_FILTER_RULES_KEY, JSON.stringify(rules));
    window._msScheduleFilterRulesDriveSync(rules); // 💡 회사/집 등 다른 PC에서도 같은 규칙이 적용되도록 팀 공용 Drive에도 반영
};
// 💡 [자동 등록] 검토 큐(폐기/신규발신자)에서 "이 조건으로 앞으로도 자동 걸러줘" 클릭 시 호출 —
//    type: 'subjectKeywords'|'noreplyPatterns'|'blockedDomains'
window._msAddFilterRule = function(type, value) {
    const v = String(value || '').trim();
    if (!v) return false;
    const rules = window._msGetFilterRules();
    const listLower = rules[type].map(x => x.toLowerCase());
    if (listLower.includes(v.toLowerCase())) return false; // 중복
    rules[type].push(v);
    window._msSaveFilterRules(rules);
    return true;
};

// ═══════════════════════════════════════════════════════════
// ☁️ [자동폐기 필터 규칙 — 팀 공용 Drive 동기화]
//    이전엔 localStorage에만 저장돼 "회사 PC에서 차단 도메인 등록해도 집 PC엔 없음" 문제가 있었음.
//    AddressBook과 동일한 패턴: localStorage를 빠른 로컬 캐시로 계속 쓰되(동기 호출부 변경 불필요),
//    저장할 때마다 디바운스로 Drive에도 올리고, Drive 연동 시점에 팀 최신본과 로컬을 합쳐서 복원.
// ═══════════════════════════════════════════════════════════
const MS_FILTER_RULES_DRIVE_FILENAME = 'MailFilterRules_Shared.json';
window._msFilterRulesDriveFileId = null;
window._msFilterRulesSyncTimer = null;

window._msScheduleFilterRulesDriveSync = function(rules) {
    if (window._msFilterRulesSyncTimer) clearTimeout(window._msFilterRulesSyncTimer);
    window._msFilterRulesSyncTimer = setTimeout(function() { window._msSyncFilterRulesToDrive(rules); }, 3000);
};

window._msSyncFilterRulesToDrive = async function(rules) {
    try {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return; // 비로그인: localStorage 단독 동작 (다음 Drive 연동 시 자동 병합됨)
        const folderId = await window.getOrCreateConfigFolder(token);
        if (!window._msFilterRulesDriveFileId) window._msFilterRulesDriveFileId = await window._findOrMigrateFile(token, MS_FILTER_RULES_DRIVE_FILENAME, folderId);
        const boundary = 'ms_filter_rules_boundary';
        const metadata = { name: MS_FILTER_RULES_DRIVE_FILENAME, mimeType: 'application/json' };
        if (!window._msFilterRulesDriveFileId) metadata.parents = [folderId];
        const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                   + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(rules)
                   + "\r\n--" + boundary + "--";
        const url = 'https://www.googleapis.com/upload/drive/v3/files' + (window._msFilterRulesDriveFileId ? '/' + window._msFilterRulesDriveFileId : '') + '?uploadType=multipart&supportsAllDrives=true';
        const resp = await fetch(url, { method: window._msFilterRulesDriveFileId ? 'PATCH' : 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, body: body });
        const file = await resp.json();
        if (file && file.id) window._msFilterRulesDriveFileId = file.id;
    } catch(e) { console.warn('자동폐기 필터 규칙 Drive 동기화 실패:', e.message); }
};

// 💡 Drive 연동 후 호출 — 팀 공용 규칙과 로컬 규칙을 합집합으로 병합해 로컬 캐시 갱신
//    (다른 PC에서 등록한 규칙도 반영되고, 이 PC에서만 등록했던 규칙도 유실되지 않음)
window.loadFilterRulesFromDrive = async function() {
    try {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return null;
        const folderId = await window.getOrCreateConfigFolder(token);
        if (!window._msFilterRulesDriveFileId) window._msFilterRulesDriveFileId = await window._findOrMigrateFile(token, MS_FILTER_RULES_DRIVE_FILENAME, folderId);
        if (!window._msFilterRulesDriveFileId) return null;
        const response = await gapi.client.drive.files.get({ fileId: window._msFilterRulesDriveFileId, alt: 'media', supportsAllDrives: true });
        const remote = response.result;
        if (!remote || !Array.isArray(remote.subjectKeywords)) return null;

        const local = window._msGetFilterRules();
        const mergeUnique = function(a, b) {
            const seen = new Set(a.map(function(x) { return x.toLowerCase(); }));
            const out = a.slice();
            b.forEach(function(x) { if (!seen.has(x.toLowerCase())) { seen.add(x.toLowerCase()); out.push(x); } });
            return out;
        };
        const merged = {
            subjectKeywords: mergeUnique(remote.subjectKeywords || [], local.subjectKeywords || []),
            noreplyPatterns: mergeUnique(remote.noreplyPatterns || [], local.noreplyPatterns || []),
            blockedDomains:  mergeUnique(remote.blockedDomains  || [], local.blockedDomains  || [])
        };
        localStorage.setItem(MS_FILTER_RULES_KEY, JSON.stringify(merged)); // 💡 직접 저장 — _msSaveFilterRules를 쓰면 다시 Drive 업로드가 예약되어 불필요한 왕복이 생김
        return merged;
    } catch(e) { console.warn('자동폐기 필터 규칙 Drive 조회 실패:', e.message); return null; }
};

window._msParseSenderEmail = function(senderStr) {
    const m = String(senderStr || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0].toLowerCase() : '';
};

// 💡 [버그 수정] 예전엔 "지금 열려있는 시트"의 tabData.addressBook(프로젝트 파일에 박혀있는
//    스냅샷 — 마지막 저장 시점 이후로 갱신 안 됨)만 봐서, 다른 프로젝트/최근에 주소록에 추가된
//    사람의 도메인이 반영 안 돼 "신규발신자"로 오탐되는 경우가 많았음. 주소록은 프로젝트와
//    무관한 공용 단일 소스(window.AddressBook)이므로 그걸 기준으로 삼는다.
window._msGetWhitelistDomains = function() {
    const ab = (window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : ((window.tabData || {}).addressBook || []);
    const domains = new Set();
    ab.forEach(p => {
        const email = (p.email || '').toLowerCase();
        const at = email.indexOf('@');
        if (at !== -1) domains.add(email.slice(at + 1));
    });
    return domains;
};

// 반환: {action:'discard'|'new_sender'|'pass', reason:string}
window._msStage0Filter = function(mail) {
    const rules = window._msGetFilterRules();
    const subject = (mail.subject || '').toLowerCase();
    for (const kw of rules.subjectKeywords) {
        if (subject.includes(kw.toLowerCase())) return { action: 'discard', reason: 'subject_kw:' + kw };
    }

    const fromEmail = window._msParseSenderEmail(mail.sender);
    for (const p of rules.noreplyPatterns) {
        if (fromEmail.includes(p.toLowerCase())) return { action: 'discard', reason: 'noreply:' + p };
    }

    const domain = fromEmail.split('@')[1] || '';
    // 💡 [신규] 사용자가 직접 등록한 도메인 완전차단 목록 — 신규발신자 검토 후 "이 도메인 영구차단" 클릭으로 쌓임
    if (domain && rules.blockedDomains.some(d => d.toLowerCase() === domain)) {
        return { action: 'discard', reason: 'blocked_domain:' + domain };
    }

    const whitelist = window._msGetWhitelistDomains();
    // 💡 whitelist가 비어있을 때(주소록 미입력 또는 tabData 로딩 타이밍 이슈)도
    //    "통과"가 아니라 "신규발신자 보류"로 처리 — 안전한 기본값(fail-safe)
    if (!domain || !whitelist.has(domain)) {
        return { action: 'new_sender', reason: whitelist.size === 0 ? 'whitelist_empty' : 'unknown_domain:' + domain };
    }

    return { action: 'pass', reason: 'ok' };
};

window._msSaveNewSenderQueue = function(list) {
    try {
        const existing = JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]');
        // 💡 [2026-08-24 방어선] fileName 기준으로 이미 있는 건 건너뛴다 — 호출부의 중복제거가 뚫려도
        //    여기서 한 번 더 막아서 같은 메일이 큐에 여러 번 쌓이는 사고를 방지.
        const existingNames = new Set(existing.map(r => r.fileName));
        const freshOnly = list.filter(function(r) { return !existingNames.has(r.fileName); });
        // 💡 [최신 항목 상단 표시] 새로 들어온 걸 앞에 두고, 200건 넘으면 뒤(오래된 것)부터 잘라냄
        const merged = freshOnly.concat(existing).slice(0, 200);
        localStorage.setItem(MS_NEW_SENDER_QUEUE_KEY, JSON.stringify(merged));
    } catch(e) { console.warn('신규 발신자 큐 저장 실패:', e); }
};

// 💡 [신규] Stage0에서 'discard'(자동폐기) 판정된 메일도 조용히 버리지 않고 로그로 남겨서
//    나중에 "혹시 잘못 걸러진 게 있는지" 검토할 수 있게 함 (기존엔 카운트만 하고 내용은 사라졌음)
window._msSaveDiscardQueue = function(list) {
    try {
        const existing = JSON.parse(localStorage.getItem(MS_DISCARD_QUEUE_KEY) || '[]');
        // 💡 [2026-08-24 방어선] fileName 기준으로 이미 있는 건 건너뛴다 — 백엔드가 날짜 단위로만 필터링해서
        //    같은 날 안에서 자동틱이 돌 때마다 이미 폐기한 메일을 다시 만나 또 쌓는 사고가 있었음(원인은
        //    _autoMailFetchTick의 중복확인 범위를 넓혀 고쳤지만, 여기서도 한 번 더 막아 이중 방어).
        const existingNames = new Set(existing.map(r => r.fileName));
        const freshOnly = list.filter(function(r) { return !existingNames.has(r.fileName); });
        const merged = freshOnly.concat(existing).slice(0, 200);
        localStorage.setItem(MS_DISCARD_QUEUE_KEY, JSON.stringify(merged));
    } catch(e) { console.warn('자동폐기 큐 저장 실패:', e); }
};

// ─── [메일 자동처리 ③] Stage 1 프로젝트 매칭 — project_index.json 대조 ──
const PROJECT_INDEX_FETCH_CACHE_MS = 5 * 60 * 1000; // 5분 캐시 — 자동틱마다 매번 Drive 조회 안 하도록
window._projectIndexCache = { data: null, at: 0 };

window._msLoadProjectIndex = async function() {
    const now = Date.now();
    if (window._projectIndexCache.data && (now - window._projectIndexCache.at) < PROJECT_INDEX_FETCH_CACHE_MS) {
        return window._projectIndexCache.data;
    }
    try {
        const tokenObj = gapi.client.getToken();
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token || !window.findProjectIndexFile) return [];
        const indexFileId = await window.findProjectIndexFile(token);
        if (!indexFileId) return [];
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const projects = (data && Array.isArray(data.projects)) ? data.projects : [];

        // 💡 [2026-08-27] 드라이브에서 프로젝트 파일이 삭제됐는데(앱의 "🗑️ 프로젝트 삭제"를 거치지
        //    않고 드라이브에서 직접 지웠거나, 이 정리 기능이 생기기 전에 지워진 경우) project_index.json
        //    엔 항목이 유령으로 남아있어서, 존재하지 않는 프로젝트로 메일이 계속 자동배치되는 문제가
        //    있었다. 실제 공용 폴더의 프로젝트 파일 목록과 대조해서, 더 이상 없는 파일을 가리키는
        //    항목은 후보에서 제외하고(당장 오배치를 막음) project_index.json에도 정리된 목록을 다시
        //    저장해서(유령 항목 영구 제거) 다음부터는 이 필터링 자체가 필요 없게 만든다.
        let validProjects = projects;
        try {
            const realFiles = await window._listProjectFiles();
            const validIds = new Set(realFiles.map(function(f) { return f.id; }));
            const ghostEntries = projects.filter(function(p) { return !p || !validIds.has(p.drive_file_id); });
            if (ghostEntries.length) {
                validProjects = projects.filter(function(p) { return p && validIds.has(p.drive_file_id); });
                console.warn('project_index.json에서 존재하지 않는 프로젝트 항목 ' + ghostEntries.length + '건 제거:',
                    ghostEntries.map(function(p) { return p && p.file_name; }));
                fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.assign({}, data, { projects: validProjects }))
                }).catch(function(e) { console.warn('project_index.json 유령 항목 정리 저장 실패(다음 로드에서 다시 시도됨):', e.message); });
            }
        } catch (e) { console.warn('project_index.json 유효성 검증 실패 — 원본 목록 그대로 사용:', e.message); }

        window._projectIndexCache = { data: validProjects, at: now };
        return validProjects;
    } catch(e) { console.warn('project_index.json 로드 실패:', e); return []; }
};

// 메일 제목+본문과 각 프로젝트 keywords 배열 대조 → 매칭된 프로젝트 배열 반환 (0개/1개/N개)
// 💡 3자 미만 키워드(예: 인치값 "32" 단독)는 오탐 위험이 커서 매칭 대상에서 제외
const MS_MIN_KEYWORD_LEN = 3;

// 대소문자·앞뒤공백만 관대하게 비교 (완전히 다른 이름/오타는 여기서 못 잡음 — Summary 탭 안내문으로 예방)
window._msNamesMatch = function(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
};

// 💡 [2026-08-20][AI 직접 매칭 v3] 예전엔 키워드 사전매칭으로 프로젝트를 먼저 좁혀놓고 AI에겐
//    후보가 2개 이상일 때만 판단을 맡겼음 — project_index.json 키워드 목록이 실제 업무 언어를
//    못 따라가면(노후화) AI가 좋은 배경정보 없이 시작하는 구조적 병목이었음.
//    → 키워드 사전 게이트를 없애고, 활성 프로젝트 전체(보통 20~30개 수준, 프롬프트에 다 넣어도
//      토큰 부담 적음)를 매번 AI에게 후보로 주고 AI가 직접 판단(+신뢰도)하게 통일.
//    최종 판정은 window._msResolveAiProjectMatch(task, candidatesForAI)에서 신뢰도 기준으로 확정.
// 💡 [B안 통일화] 어디서 호출하든(자동/일괄/단건) 동일한 로직으로 AI 프롬프트에 넣을 후보 목록을 결정하는 공용 함수
window._msResolveMatchAndContext = async function(mail) {
    // 💡 [2026-08-29 신규] 파일첨부/직접입력 탭(mfCallGemini 경유)도 여기 하나만 거쳐가므로, "완료"
    //    표시된 프로젝트 제외를 여기서 한 번만 적용하면 이 경로 전체(파일첨부+직접입력)에 다 적용된다.
    const projectList = window._msFilterCandidateProjects(await window._msLoadProjectIndex());
    const candidatesForAI = projectList.length ? projectList : null;
    // 💡 사전에 확정된 매칭이 없으므로 배경정보(contextOverride)도 항상 null —
    //    AI가 후보 목록을 보고 스스로 판단한 뒤, 결과(매칭신뢰도)로 사후 확정한다.
    return { projectTag: null, candidatesForAI, contextOverride: null };
};

// 💡 AI가 반환한 매칭신뢰도/주매칭프로젝트번호로 최종 projectTag를 확정하는 공용 헬퍼.
//    신뢰도 "상"만 자동배치급 matched로 승격하고, 그 외(중/하)는 사람 확인이 필요한 ambiguous로 남긴다.
//    (ms/mf/자동틱 3곳의 중복 로직을 여기로 통일 — 한 곳만 고치면 전체에 적용됨)
// 💡 [복수 프로젝트 매칭] 주매칭이 "상"으로 확정된 경우에만, AI가 별도로 확신한 추가 프로젝트를
//    extraCandidates로 함께 반환한다. 주매칭 자체가 불확실(중/하)하면 그 위에 추가매칭을 얹지 않고
//    무시한다(불확실한 기준 위에 더 쌓지 않기 위한 안전장치). 폭주 방지를 위해 최대 2개까지만 허용.
window._msResolveAiProjectMatch = function(task, candidatesForAI) {
    if (!task || !candidatesForAI || !candidatesForAI.length) return null;
    const conf = task['매칭신뢰도'];
    const pickedIdx = parseInt(task['주매칭프로젝트번호'], 10);
    if (!conf || !pickedIdx) return null;
    const picked = (pickedIdx >= 1 && pickedIdx <= candidatesForAI.length) ? candidatesForAI[pickedIdx - 1] : null;
    if (!picked) return null;

    let extraCandidates = [];
    if (conf === '상' && Array.isArray(task['추가매칭프로젝트번호목록'])) {
        const seen = new Set([pickedIdx]);
        task['추가매칭프로젝트번호목록'].forEach(function(n) {
            if (extraCandidates.length >= 2) return; // 최대 2개(주매칭 포함 총 3개 프로젝트)까지만
            const idx = parseInt(n, 10);
            if (idx >= 1 && idx <= candidatesForAI.length && !seen.has(idx)) {
                seen.add(idx);
                extraCandidates.push(candidatesForAI[idx - 1]);
            }
        });
    }

    return conf === '상'
        ? { status: 'matched', candidates: [picked], extraCandidates: extraCandidates }
        : { status: 'ambiguous', candidates: [picked], extraCandidates: [] };
};

// 💡 [매칭/점수 통일화] projectTag({status,candidates}) → 리스트 배지에 쓸 표시용 문자열
window._msProjectTagLabel = function(projectTag) {
    if (!projectTag) return null;
    if (projectTag.status === 'matched') {
        const c = projectTag.candidates[0];
        const name = c.model || c.customer || '매칭됨';
        const extra = (projectTag.extraCandidates && projectTag.extraCandidates.length)
            ? ` (+${projectTag.extraCandidates.length}개 프로젝트 추가매칭)` : '';
        return name + (c.inch ? ` (${c.inch}인치)` : '') + extra;
    }
    return `❓후보 ${projectTag.candidates.length}개`;
};

// 💡 점수 등급 이모지 — 자동틱과 동일 기준(커트라인 이상 🔴 / 60% 이상 🟡 / 미만 ⚪)
window._msScoreGrade = function(total, cutline) {
    return total >= cutline ? '🔴' : (total >= cutline * 0.6 ? '🟡' : '⚪');
};

// 💡 [업무 담당구분] AI가 메일 분석 시 판정한 담당구분(예: "LCM")을 Summary 탭에 이미 등록된
//    프로젝트 멤버 필드로 매핑해서 실제 담당자 이름/이메일을 찾아준다.
//    - 고정 구분(PM/기구/HW/FW/BLU/TSP/LCM/Slimming/Cutting/Tooling)은 projectMeta 필드로 바로 매핑
//    - 자유 구분(영업/CS/FA 등)은 Summary "프로젝트 멤버-3(자유추가)"에서 역할명에 해당 키워드가
//      포함된 행을 찾아 사용 (자유추가는 역할명이 사람마다 다르게 입력되므로 키워드 포함 매칭)
window._MS_CATEGORY_FIELD_MAP = {
    'PM':       { name: '프로젝트담당자', email: '프로젝트담당자이메일' },
    '기구':     { name: '기구담당자',     email: '기구담당자이메일' },
    'HW':       { name: 'HW담당자',       email: 'HW담당자이메일' },
    'FW':       { name: 'FW담당자',       email: 'FW담당자이메일' },
    'BLU':      { name: 'Module담당자',   email: 'Module담당자이메일' },
    'TSP':      { name: 'TSP담당자',      email: 'TSP담당자이메일' },
    'LCM':      { name: 'LCM담당자',      email: 'LCM담당자이메일' },
    'Slimming': { name: 'Slimming담당자', email: 'Slimming담당자이메일' },
    'Cutting':  { name: 'Cutting담당자',  email: 'Cutting담당자이메일' },
    'Tooling':  { name: 'Tooling담당자',  email: 'Tooling담당자이메일' }
};
// 💡 [2026-08-25] "담당구분"이 이제 "HW, FW"처럼 콤마로 구분된 복수 값일 수 있음(메일 하나에
//    실질적으로 두 영역이 걸친 경우만 AI가 최대 2개까지 기재 — 프롬프트에서 엄격히 제한).
//    배지/담당자 표시는 여전히 "대표 담당자 한 명"이 필요하므로, 앞에서부터 순서대로 실제 등록된
//    담당자를 찾아 맨 처음 매칭되는 값을 대표로 반환한다(전부 미등록이면 null).
window._msResolveCategoryAssignee = function(category) {
    const raw = (category || '').toString().trim();
    if (!raw || raw === '미분류') return null;
    const parts = raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    const pm = window.projectMeta || {};
    const members3 = (window.tabData && window.tabData.projectMembers3) || [];
    for (let i = 0; i < parts.length; i++) {
        const cat = parts[i];
        const fixed = window._MS_CATEGORY_FIELD_MAP[cat];
        if (fixed) {
            const name = (pm[fixed.name] || '').toString().trim();
            if (name) return { category: cat, name: name, email: (pm[fixed.email] || '').toString().trim() };
        }
        // 자유추가 멤버(프로젝트 멤버-3)에서 역할명 키워드로 검색
        const hit = members3.find(function(m) { return m && m.role && m.role.indexOf(cat) !== -1 && m.name; });
        if (hit) return { category: cat, name: hit.name.toString().trim(), email: (hit.email || '').toString().trim() };
    }
    return null;
};

window._msFilterMyProjects = function(projectList) {
    const me = window.currentUserName || '';
    const mine = projectList.filter(p => window._msNamesMatch(p.assignee, me));
    if (mine.length === 0) {
        console.warn(`⚠️ [메일 자동처리] 담당자 필터 결과 0건 — currentUserName("${me}")과 일치하는 프로젝트 없음. ` +
            `Summary 탭 "프로젝트 담당자" 입력값 확인 필요. (전체 등록 프로젝트: ${projectList.length}개)`);
    }
    return mine;
};

// 💡 [버그B 수정] 키워드를 공백 기준 토큰으로 쪼개서, 순서 상관없이 토큰이 전부 들어있으면 매칭
//    예: 키워드 "4.3\" Shuffler" ↔ 본문 "Shuffler Display 4.3\"" → 어순 달라도 매칭됨
window._msKeywordMatches = function(haystack, kw) {
    const tokens = String(kw).toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    return tokens.every(t => haystack.includes(t));
};

// 💡 [2026-08-29 신규] "완료"로 표시된 프로젝트를 메일 매칭 후보에서 빼는 공용 필터 — 키워드 사전매칭
//    (_msMatchProjects, 바로 아래)과 AI 직접매칭(완전자동 tick / 파일첨부·메일서버 배치분석이 candidatesForAI를
//    만드는 지점, msCallGemini 호출 직전) 양쪽에서 공용으로 쓴다. 한 곳만 고치면 다른 경로가 여전히 완료
//    프로젝트를 후보로 넘겨서 오매칭이 재발할 수 있으므로, 매칭 후보 목록을 만드는 모든 지점에서 이 함수를
//    거치게 한다. [설정 → 메일 자동배치 설정 → 수집설정 → "완료 프로젝트도 수집 대상에 포함"]을 켜면 그대로 통과.
window._msFilterCandidateProjects = function(projectList) {
    const includeCompleted = !!(window.getMailAutoCollectCompleted && window.getMailAutoCollectCompleted());
    return includeCompleted ? (projectList || []) : (projectList || []).filter(function(p) { return !p.completed; });
};

window._msMatchProjects = function(mail, projectList) {
    const haystack = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
    // 💡 [버그A 수정] 담당자 필터를 여기서 제거 — 전체 프로젝트 대상으로 후보를 추림.
    //    "내 프로젝트가 아니면 후보에서 빠지는" 문제를 근본적으로 없앰.
    //    자동배치(완전자동) 시점에만 "내 담당인지"를 별도로 체크함(_autoMailFetchTick 참고)

    // 1차: 키워드 매칭 + 프로젝트별 매칭된 키워드 중 가장 긴(구체적인) 것 기록
    const scored = window._msFilterCandidateProjects(projectList)
        .map(p => {
            const matched = (p.keywords || []).filter(kw =>
                kw && String(kw).length >= MS_MIN_KEYWORD_LEN && window._msKeywordMatches(haystack, kw)
            );
            const maxLen = matched.reduce((m, kw) => Math.max(m, String(kw).length), 0);
            return { project: p, matched, maxLen };
        })
        .filter(s => s.matched.length > 0);

    if (scored.length <= 1) return scored.map(s => s.project);

    // 💡 [구체적 키워드 우선] 여러 프로젝트가 후보에 걸렸을 때, 가장 긴(구체적) 키워드로 매칭된
    //    후보만 남기고, 짧은/공용 키워드만 걸린 후보는 제외 — "SHUFFLER"(공용) 때문에
    //    "SHUFFLER 4.3"(구체적)까지 같이 ambiguous 되던 문제 해결
    const globalMax = Math.max(...scored.map(s => s.maxLen));
    const filtered = scored.filter(s => s.maxLen === globalMax);
    return filtered.map(s => s.project);
};

// ─── [⑥] 우선순위 점수 설정 UI ──
window.openPriorityConfigModal = async function() {
    const cfg = await window.loadPriorityConfig();
    let modal = document.getElementById('priority-config-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'priority-config-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="priority-config-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:300px;">
            <div id="priority-config-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span>⭐ 우선순위 점수 설정</span>
                <button onclick="document.getElementById('priority-config-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div style="overflow-y:auto; flex:1; padding:14px 18px;">
                <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">👤 직급별 점수</div>
                <div id="pc-title-rows" style="margin-bottom:14px;"></div>
                <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">🚨 긴급 키워드 사전</div>
                <div id="pc-keyword-rows" style="margin-bottom:6px;"></div>
                <button onclick="window._pcAddKeywordRow('', 5)" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:4px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; margin-bottom:14px; transition:background .15s, border-color .15s;">+ 키워드 추가</button>
                <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin:10px 0 6px;">⚙️ 기타 점수</div>
                <div style="display:grid; grid-template-columns:1fr 60px; gap:6px 10px; align-items:center; font-size:12px; margin-bottom:14px;">
                    <span>외부(고객사) 발신 가산</span><input id="pc-external" type="number" style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
                    <span>To(직접수신) 가산</span><input id="pc-tome" type="number" style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
                    <span>Cc(참조) 가산</span><input id="pc-ccme" type="number" style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
                    <span>중요도 헤더(Outlook 높음) 가산</span><input id="pc-importance" type="number" style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
                </div>
                <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">🎯 커트라인 (이 점수 이상 🔴 긴급)</div>
                <input id="pc-cutline" type="number" min="0" max="100" style="width:80px; padding:5px 8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
            </div>
            <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px;">
                <button onclick="window._pcSave()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:6px 18px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">저장</button>
                <button onclick="document.getElementById('priority-config-modal').style.display='none'" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s;">닫기</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('priority-config-box', 'priority-config-drag');
        window._bindClickToFront('priority-config-modal');
    }

    window._pcCurrentConfig = cfg;
    window._pcRenderTitleRows(cfg.titleScores);
    window._pcRenderKeywordRows(cfg.urgentKeywords);
    document.getElementById('pc-external').value = cfg.externalCustomerScore;
    document.getElementById('pc-tome').value = cfg.toMeScore;
    document.getElementById('pc-ccme').value = cfg.ccMeScore;
    document.getElementById('pc-importance').value = cfg.importanceHighScore;
    document.getElementById('pc-cutline').value = cfg.cutline;

    modal.style.display = 'block';
    window.bringModalToFront('priority-config-modal');
};

window._pcRenderTitleRows = function(titleScores) {
    const box = document.getElementById('pc-title-rows');
    box.innerHTML = Object.keys(titleScores).map(title => `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:12px;">
            <span style="flex:1;">${title}</span>
            <input class="pc-title-score" data-title="${title}" type="number" value="${titleScores[title]}"
                style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
        </div>`).join('');
};

window._pcAddKeywordRow = function(word, score) {
    const box = document.getElementById('pc-keyword-rows');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';
    row.innerHTML = `
        <input class="pc-kw-word" type="text" value="${word}" placeholder="키워드"
            style="flex:1; padding:4px 7px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
        <input class="pc-kw-score" type="number" value="${score}"
            style="width:55px; padding:4px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
        <button onclick="this.parentElement.remove()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:11px; transition:background .15s, border-color .15s;">🗑</button>`;
    box.appendChild(row);
};

window._pcRenderKeywordRows = function(urgentKeywords) {
    document.getElementById('pc-keyword-rows').innerHTML = '';
    (urgentKeywords || []).forEach(kw => window._pcAddKeywordRow(kw.word, kw.score));
};

window._pcSave = async function() {
    const titleScores = {};
    document.querySelectorAll('.pc-title-score').forEach(el => {
        titleScores[el.dataset.title] = parseInt(el.value, 10) || 0;
    });
    const urgentKeywords = [];
    document.querySelectorAll('#pc-keyword-rows > div').forEach(row => {
        const word = row.querySelector('.pc-kw-word').value.trim();
        const score = parseInt(row.querySelector('.pc-kw-score').value, 10) || 0;
        if (word) urgentKeywords.push({ word, score });
    });
    const newConfig = {
        titleScores,
        urgentKeywords,
        externalCustomerScore: parseInt(document.getElementById('pc-external').value, 10) || 0,
        toMeScore: parseInt(document.getElementById('pc-tome').value, 10) || 0,
        ccMeScore: parseInt(document.getElementById('pc-ccme').value, 10) || 0,
        importanceHighScore: parseInt(document.getElementById('pc-importance').value, 10) || 0,
        cutline: Math.max(0, Math.min(100, parseInt(document.getElementById('pc-cutline').value, 10) || 50))
    };
    const ok = await window.savePriorityConfig(newConfig);
    if (window.showToast) {
        window.showToast(ok ? '✅ 우선순위 점수 설정이 저장되었습니다.' : '⚠️ 저장 실패 (콘솔 확인)', ok ? 'info' : 'error');
    }
    if (ok) document.getElementById('priority-config-modal').style.display = 'none';
};

// ─── [메일 자동처리 ④] 우선순위 점수 — 규칙(직급/외부고객/긴급키워드/커스텀키워드/수신방식/중요도헤더) + AI(마감임박도/업무영향도) ──
const MS_INTERNAL_DOMAIN = 'kortek.co.kr';
const MS_CUSTOM_KEYWORD_SCORE = 7;

window._msFindSenderTitle = function(senderStr) {
    const email = window._msParseSenderEmail(senderStr);
    const ab = (window.tabData || {}).addressBook || [];
    const found = ab.find(p => (p.email || '').toLowerCase() === email);
    return found ? (found.title || found.직함 || '') : '';
};

window._msComputeRuleScore = function(mail, priorityConfig) {
    let score = 0;
    const breakdown = {};

    const title = window._msFindSenderTitle(mail.sender);
    if (title && priorityConfig.titleScores[title]) {
        breakdown.title = priorityConfig.titleScores[title];
        score += breakdown.title;
    }

    const fromEmail = window._msParseSenderEmail(mail.sender);
    const domain = fromEmail.split('@')[1] || '';
    if (domain && domain !== MS_INTERNAL_DOMAIN) {
        breakdown.external = priorityConfig.externalCustomerScore;
        score += breakdown.external;
    }

    const haystack = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
    let urgentScore = 0;
    (priorityConfig.urgentKeywords || []).forEach(kw => {
        if (kw.word && haystack.includes(String(kw.word).toLowerCase())) urgentScore += (kw.score || 0);
    });
    if (urgentScore) { breakdown.urgentKeywords = urgentScore; score += urgentScore; }

    if (mail.isToMe) { breakdown.recipient = priorityConfig.toMeScore; score += priorityConfig.toMeScore; }
    else if (mail.isCcMe) { breakdown.recipient = priorityConfig.ccMeScore; score += priorityConfig.ccMeScore; }

    if (mail.importance) { breakdown.importanceHeader = priorityConfig.importanceHighScore; score += priorityConfig.importanceHighScore; }

    return { score, breakdown };
};

window._msComputeTotalScore = function(mail, task, priorityConfig) {
    const rule = window._msComputeRuleScore(mail, priorityConfig);
    const deadline = task && task.마감일임박도 ? parseInt(task.마감일임박도, 10) || 0 : 0;
    const impact = task && task.업무영향도 ? parseInt(task.업무영향도, 10) || 0 : 0;
    const total = Math.max(0, Math.min(100, rule.score + deadline + impact));
    return { total, breakdown: Object.assign({}, rule.breakdown, { deadline, impact }) };
};

// ─── [완전자동] 커트라인 이상 → Gantt 자동배치 + 알림 자동설정 ──
//    기존 "다른 프로젝트로 전송"(inboxDistExecute) 로직을 헤드리스로 재구성 — DOM 의존 없음
window._msAutoRegisterToProject = async function(uid, task, driveFileId, fileName, mailRaw, attempt, setAlarm) {
    try {
        // 💡 지금 브라우저에 열려있는 바로 그 프로젝트면, Drive 직접쓰기 대신 화면(globalData)에 바로 꽂고
        //    즉시 저장 — 헤드리스로 Drive만 건드리면 화면이 예전 상태로 남아있다가, 사용자가 저장할 때
        //    방금 자동배치한 내용이 통째로 덮어써져서 사라지는 심각한 문제가 생김
        if (driveFileId === window.currentDriveFileId && globalData && globalData.length) {
            try {
                const l0s = window.buildL0SectionInfo(globalData, colIdx);
                const chosenL0 = window.pickL0SectionByDate(l0s, task['시작일'] || '') || '__END__';
                const built = window.buildMailTaskRow(task, undefined, undefined, mailRaw);
                if (setAlarm) built.row._알림 = true;
                const posInfo = window.computeL0InsertPos(globalData, colIdx, chosenL0, task['시작일'], true);
                const pos = posInfo.pos;
                if (chosenL0 !== '__END__' && colIdx.devStage !== -1) built.row[colIdx.devStage] = chosenL0;
                globalData.splice(pos, 0, built.row);
                logChange(pos, -1, "없음", `메일 자동처리(완전자동)로 배치: ${built.taskName}`);
                window.recalculateSchedules();
                if (window.renderGantt) window.renderGantt();
                await window.saveToGoogleDrive(); // 💡 화면에 즉시 반영 + 곧바로 Drive 저장까지
                return { ok: true, label: posInfo.previewLabel, targetL0: chosenL0 };
            } catch (e) { return { ok: false, reason: 'current_project_insert_failed: ' + e.message }; }
        }

        const tokenObj = gapi.client.getToken();
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return { ok: false, reason: 'no_token' };

        const metaResp    = await gapi.client.drive.files.get({ fileId: driveFileId, fields: 'modifiedTime', supportsAllDrives: true });
        const contentResp = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media', supportsAllDrives: true });
        const saveData = contentResp.result;
        if (!saveData || !saveData.globalData || !saveData.colIdx) return { ok: false, reason: 'bad_structure' };

        const rows = saveData.globalData.map(function(obj) {
            let row = obj.data;
            for (let k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        window.computeCalcDatesForRows(rows.slice(1), saveData.colIdx);

        const l0s = window.buildL0SectionInfo(rows, saveData.colIdx);
        const chosenL0 = window.pickL0SectionByDate(l0s, task['시작일'] || '') || '__END__';

        const built = window.buildMailTaskRow(task, rows, saveData.colIdx, mailRaw);
        if (setAlarm) built.row._알림 = true; // 💡 커트라인 이상일 때만 자동알람(D-7/3/1) 대상으로 설정

        const posInfo = window.computeL0InsertPos(rows, saveData.colIdx, chosenL0, task['시작일'], true);
        const pos = posInfo.pos;
        if (chosenL0 !== '__END__' && saveData.colIdx.devStage !== -1) {
            built.row[saveData.colIdx.devStage] = chosenL0;
        }
        rows.splice(pos, 0, built.row);

        const nowIso = new Date().toISOString();
        const userName = window.currentUserName || '비로그인 (로컬)';
        saveData.distributions = saveData.distributions || [];
        const distUid = 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        saveData.distributions.push({
            uid: distUid, inboxUid: uid,
            task: JSON.parse(JSON.stringify(task)),
            taskName: built.taskName, targetL0: chosenL0,
            insertedAt: nowIso, by: userName, source: '메일자동처리(커트라인)', processed: false
        });
        saveData.changeLogs = saveData.changeLogs || [];
        saveData.changeLogs.push({
            time: new Date().toLocaleString('ko-KR'), userName: userName,
            rowName: pos, colName: '행 조작', oldVal: '없음',
            newVal: `메일 자동처리(커트라인)로 자동 배치: ${built.taskName}`
        });

        saveData.globalData = rows.map(function(row) {
            let o = { data: Array.from(row) };
            for (let k in row) { if (k.startsWith('_')) o[k] = row[k]; }
            return o;
        });

        // 💡 충돌 검사 — PATCH 직전 재확인, 충돌 시 1회만 재시도
        const checkResp = await gapi.client.drive.files.get({ fileId: driveFileId, fields: 'modifiedTime', supportsAllDrives: true });
        if (checkResp.result.modifiedTime !== metaResp.result.modifiedTime) {
            if ((attempt || 0) >= 1) return { ok: false, reason: 'conflict_retry_exhausted' };
            return await window._msAutoRegisterToProject(uid, task, driveFileId, fileName, mailRaw, (attempt || 0) + 1, setAlarm);
        }

        const boundary = 'ms_auto_register_boundary';
        const metadata = { name: fileName, mimeType: 'application/json' };
        const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                   + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(saveData)
                   + "\r\n--" + boundary + "--";
        const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + driveFileId + '?uploadType=multipart&supportsAllDrives=true', {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
            body: body
        });
        const file = await resp.json();
        if (resp.ok && file && file.id) return { ok: true, label: posInfo.previewLabel, targetL0: chosenL0 };
        return { ok: false, reason: 'upload_failed' };
    } catch (e) { return { ok: false, reason: e.message }; }
};

// 💡 [복수 프로젝트 매칭] 같은 메일 업무를 여러 프로젝트에 각각 등록할 때 공용으로 쓰는 헬퍼.
//    "한 uid가 여러 프로젝트를 가리키는" 구조 변경 대신, 프로젝트마다 독립된 TaskInbox 항목(uid)을 만들어
//    각자 상태/이력을 따로 추적한다(기존 "uid=1건=1프로젝트" 설계를 그대로 유지). targets[0]이 주매칭, 나머지가
//    AI가 "상" 신뢰도로 확신한 추가매칭(최대 2개, _msResolveAiProjectMatch에서 이미 캡 걸림).
//    onEachDone(target, result, idx)는 대상 하나가 끝날 때마다(성공/실패 무관) 호출됨.
window._msRegisterToProjectTargets = function(targets, task, mailRawObj, sourceLabel, alarmWorthy, historyType, onEachDone) {
    targets.forEach(function(target, idx) {
        if (!target || !target.drive_file_id) { if (onEachDone) onEachDone(target, { ok: false, reason: 'no_drive_file_id' }, idx); return; }
        const isExtra = idx > 0;
        window.TaskInbox.add(task, {
            source: isExtra ? `${sourceLabel} [추가매칭: ${target.model || target.customer || target.file_name}]` : sourceLabel,
            mailRaw: mailRawObj,
            matchedProject: { status: 'matched', candidates: [target] },
            alarmWorthy: !!alarmWorthy
        });
        const newUid = window.TaskInbox.load()[0].uid; // add()는 unshift라 항상 맨 앞이 방금 추가한 항목
        window._msAutoRegisterToProject(newUid, task, target.drive_file_id, target.file_name, mailRawObj, 0, !!alarmWorthy)
            .then(function(result) {
                if (result.ok) {
                    window.TaskInbox.setStatus(newUid, '자동배치됨', { type: historyType, target: target.file_name, at: new Date().toISOString() });
                } else {
                    console.warn('[메일 자동처리] 자동배치 실패, TaskInbox 대기 상태로 유지:', result.reason);
                }
                if (onEachDone) onEachDone(target, result, idx);
            });
    });
};

// 💡 [완전자동] mail_mode='full'이면 메일서버/파일첨부 탭(수동 분석)도 자동틱과 동일 기준으로
//    TaskInbox 대기 없이 바로 Gantt에 등록 — 매칭 확정(단일후보) + 내 담당 + 날짜확정일 때만.
//    (그 외엔 기존처럼 TaskInbox '대기'로 쌓여서, 사람이 [✅매칭전송]/[📤다른 프로젝트]로 직접 처리)
//    💡 [복수 프로젝트 매칭] AI가 "상" 신뢰도로 확신한 추가 프로젝트가 있으면(item._projectTag.extraCandidates)
//    같은 업무를 그 프로젝트들에도 각각 독립적으로 등록한다(최대 총 3개 프로젝트).
//    반환: true면 완전자동 처리를 "시도"함(성공여부는 비동기), false면 조건 미충족으로 건너뜀
window._msTryFullAutoRegister = function(item, mailRawObj, onDone) {
    const taskName = (item && item.task && item.task['업무명']) || '(제목없음)';
    const skip = function(reason) { console.info(`[메일 완전자동] 건너뜀 (${reason}): "${taskName}"`); return false; };

    if (!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled())) return skip('완전자동 모드 아님');
    if (!item || !item.task) return skip('AI 분석 결과 없음');
    if (!item._projectTag || item._projectTag.status !== 'matched') return skip(`매칭 미확정(status=${item._projectTag ? item._projectTag.status : '없음'})`);
    const primary = (item._projectTag.candidates || [])[0];
    if (!primary || !primary.drive_file_id) return skip('매칭 후보에 drive_file_id 없음');
    const hasValidDate = !String(item.task['시작일'] || '').includes('날짜확인필요')
        && !String(item.task['완료일'] || '').includes('날짜확인필요');
    if (!hasValidDate) return skip('날짜확인필요 상태');
    // 💡 [정책 변경] 완전자동은 "내 담당" 여부와 무관하게, 매칭이 단일 확정되면 그 프로젝트로 바로 배치한다.
    //    TaskInbox(업무 보관함)는 매칭 자체가 안 된(프로젝트 미등록/미분류) 업무만 남기는 용도로 좁힌다.

    const extraTargets = (item._projectTag.extraCandidates || []).filter(function(t) { return t && t.drive_file_id; });
    const targets = [primary].concat(extraTargets);
    console.info(`[메일 완전자동] 등록 시도: "${taskName}" → ${targets.map(function(t) { return t.file_name; }).join(', ')}`);
    const srcLabel = `${item._scoreGrade || ''}${item._score != null ? item._score + '점 ' : ''}메일분석(${item.project || primary.model || ''})`;

    let doneCount = 0;
    window._msRegisterToProjectTargets(targets, item.task, mailRawObj, srcLabel, item._alarmWorthy, '메일완전자동', function(target, result) {
        doneCount++;
        const multiSuffix = targets.length > 1 ? ` (${doneCount}/${targets.length}개 프로젝트)` : '';
        if (result.ok) {
            if (window.showToast) window.showToast(`🎯 "${taskName}" 완전자동 배치 완료 → ${target.file_name}${multiSuffix} (${result.label || ''})`, 'info');
        } else {
            if (window.showToast) window.showToast(`⚠️ "${taskName}" → ${target ? target.file_name : '?'} 완전자동 등록 실패 (${result.reason || '알 수 없는 오류'}) — 보관함에서 [✅매칭전송]으로 직접 처리해주세요.`, 'error');
        }
        if (doneCount === targets.length) {
            item.registered = true;
            item.selected = false;
            if (onDone) onDone();
        }
    });
    return true;
};

// ─── [메일 자동처리 ①] 자동 수집 틱 — 저장된 계정으로 백그라운드 수집, 기존 큐에 append만 ──
window._autoMailFetchTick = async function() {
    // 💡 [중복 메일 버그 수정] 메일 1건당 AI 분석에 4초+ 걸려 신규 메일이 많으면 한 틱 실행 시간이
    //    스케줄러 점검 주기(60초, _startMailAutoScheduler)보다 길어질 수 있음. 마지막 수집시각(MS_LAST_AUTO_FETCH_KEY)은
    //    틱이 "끝날 때"만 갱신되므로, 이전 틱이 아직 안 끝난 상태에서 스케줄러가 또 틱을 실행시키면
    //    두 틱이 같은 신규 메일을 각자 중복 없다고 판단해 미분류 큐(_msResults)에 동시에 쌓는다.
    //    → 재진입 가드로 이전 틱이 실행 중이면 새 틱을 건너뛴다.
    if (window._msAutoTickRunning) return;
    window._msAutoTickRunning = true;
    try {
    const savedUser = localStorage.getItem('ms_saved_userid');
    const savedPwB64 = localStorage.getItem('ms_saved_pw');
    if (!savedUser || !savedPwB64) return; // 저장된 로그인 정보 없으면 자동수집 불가 → 조용히 스킵

    let password = '';
    try { password = decodeURIComponent(escape(atob(savedPwB64))); }
    catch(e) { password = savedPwB64; }

    // 마지막 자동수집 시각 이후 ~ 오늘까지 (없으면 오늘 하루만)
    const lastAt = localStorage.getItem(MS_LAST_AUTO_FETCH_KEY);
    const fmt = d => d.toISOString().split('T')[0];
    const startDate = lastAt ? fmt(new Date(lastAt)) : fmt(new Date());
    const endDate    = fmt(new Date());

    try {
        const res = await fetch(`${MS_SERVER_URL}/fetch-mail`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                mailUser: savedUser, mailPw: password,
                startDate, endDate,
                keyword: '', keywordFrom: '', keywordBody: '',
                maxCount: 500
            })
        });
        const data = await res.json();
        if (data.status !== 'success' || !data.data || !data.data.length) {
            localStorage.setItem(MS_LAST_AUTO_FETCH_KEY, new Date().toISOString());
            return;
        }

        // 💡 [2026-08-24 버그 수정] fileName 기준 중복 제거 — 백엔드 /fetch-mail이 날짜(day) 단위로만
        //    필터링해서(시:분:초 없음), 하루 안에서는 자동틱이 돌 때마다 그날 메일 전체를 매번 다시
        //    받아온다. 이전엔 _msResults(매칭/미분류 큐)만 "이미 처리함" 판정 기준으로 써서, 폐기(discard)나
        //    신규발신자(new_sender)로 분류된 메일은 여기 안 들어가므로 다음 틱에서 "처음 보는 메일"로
        //    오인돼 Stage0 필터를 다시 타고 또 폐기 큐에 쌓이는 사고가 있었음(같은 메일이 규칙에 반복해서
        //    걸리며 계속 늘어남). 세 큐(미분류/매칭·폐기·신규발신자) 전부를 "이미 처리한 메일" 판정에 포함한다.
        window._msResults = window._msResults || [];
        const discardedNames = (JSON.parse(localStorage.getItem(MS_DISCARD_QUEUE_KEY) || '[]')).map(r => r.fileName);
        const newSenderNames = (JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]')).map(r => r.fileName);
        const existingNames = new Set([
            ...window._msResults.map(r => r.fileName),
            ...discardedNames,
            ...newSenderNames
        ]);
        const dedupedMails = data.data.filter(m => !existingNames.has(m.fileName));
        if (!dedupedMails.length) {
            localStorage.setItem(MS_LAST_AUTO_FETCH_KEY, new Date().toISOString());
            return;
        }

        // 💡 [메일 자동처리 ②] Stage 0 필터 — discard(폐기)/new_sender(보류)/pass(AI분석 진행)
        const newMails = [];
        const newSenderBatch = [];
        const discardBatch = []; // 💡 [신규] 폐기도 카운트만 하지 않고 로그로 남겨 검토 가능하게 함
        dedupedMails.forEach(mail => {
            const verdict = window._msStage0Filter(mail);
            if (verdict.action === 'discard') { discardBatch.push(Object.assign({ filteredReason: verdict.reason }, mail)); return; }
            if (verdict.action === 'new_sender') {
                newSenderBatch.push(Object.assign({ filteredReason: verdict.reason }, mail));
                return;
            }
            newMails.push(mail);
        });
        if (newSenderBatch.length) window._msSaveNewSenderQueue(newSenderBatch);
        if (discardBatch.length) window._msSaveDiscardQueue(discardBatch);
        const discardCount = discardBatch.length;

        if (!newMails.length) {
            localStorage.setItem(MS_LAST_AUTO_FETCH_KEY, new Date().toISOString());
            if ((discardCount || newSenderBatch.length) && window.showToast) {
                window.showToast(window._currentLang === 'en'
                    ? `🧹 Filtered out: ${discardCount} discarded, ${newSenderBatch.length} new-sender held`
                    : `🧹 필터링: 폐기 ${discardCount}건, 신규발신자 보류 ${newSenderBatch.length}건`, 'info');
            }
            return;
        }

        const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
        // 💡 [2026-08-29 신규] "완료" 표시된 프로젝트는 완전자동 매칭 후보에서도 미리 제외
        //    (_msFilterCandidateProjects — 설정에서 끄면 그대로 통과).
        const projectList = window._msFilterCandidateProjects(await window._msLoadProjectIndex()); // 💡 Stage 1: 매칭용 인덱스 1회 로드
        const priorityConfig = await window.loadPriorityConfig(); // 💡 [④] 우선순위 점수 설정 로드
        let addedCount = 0;

        for (const mail of newMails) {
            // 💡 [AI 직접 매칭] 키워드 사전매칭 없이, 활성 프로젝트 전체를 후보로 AI에게 넘겨 판단시킴
            const candidatesForAI = projectList.length ? projectList : null;

            let item;
            if (!apiKey) {
                item = {
                    idx: window._msResults.length, fileName: mail.fileName,
                    subject: mail.subject, sender: mail.sender, date: mail.date, body: mail.body,
                    project: null, _projectTag: null,
                    task: null, selected: false, registered: false, error: 'API키 미설정'
                };
            } else {
                try {
                    const task = await msCallGemini(apiKey, {
                        subject: mail.subject, sender: mail.sender, date: mail.date,
                        body: mail.body, fileName: mail.fileName
                    }, candidatesForAI, null);

                    // 💡 AI가 반환한 매칭신뢰도/주매칭프로젝트번호로 최종 확정 (ms/mf와 동일 공용 헬퍼)
                    const resolvedProjectTag = window._msResolveAiProjectMatch(task, candidatesForAI);
                    if (resolvedProjectTag && resolvedProjectTag.status === 'matched') {
                        console.log(`[메일 자동처리] AI 맥락판단으로 프로젝트 확정: "${mail.subject.substring(0,30)}" → ${resolvedProjectTag.candidates[0].model} (신뢰도 상)`);
                    }

                    item = {
                        idx: window._msResults.length, fileName: mail.fileName,
                        subject: mail.subject, sender: mail.sender, date: mail.date, body: mail.body,
                        project: window._msProjectTagLabel(resolvedProjectTag), _projectTag: resolvedProjectTag,
                        task, selected: !!task, registered: false,
                        error: !task ? 'AI분석실패' : null,
                        matchReason: (task && task['매칭근거']) || '' // 💡 [2026-09-01 신규] "왜 이 프로젝트로(또는 미분류로) 판단했는지" AI 근거 — 미분류 큐에서 노출
                    };
                } catch(e) {
                    item = {
                        idx: window._msResults.length, fileName: mail.fileName,
                        subject: mail.subject, sender: mail.sender, date: mail.date, body: mail.body,
                        project: null, _projectTag: null,
                        task: null, selected: false, registered: false, error: e.message
                    };
                }
                await new Promise(r => setTimeout(r, 4000)); // 기존 수동 흐름과 동일한 API 호출 간격
            }

            // 💡 [메일 자동처리] 프로젝트가 매칭됐고 AI 추출까지 성공한 건만 개인 TaskInbox로 자동 이동
            //    (미분류는 프로젝트를 모르니 보관함에 넣지 않고 로컬 큐에만 남김 — 검토 큐 UI에서 노출 예정)
            //    💡 fileName 기준 중복 체크 — 큐가 초기화돼도(캐시삭제 등) 같은 메일이 보관함에 재등록되지 않도록
            const finalProjectTag = item._projectTag;
            if (item.task && finalProjectTag && window.TaskInbox) {
                const alreadyInInbox = window.TaskInbox.load().some(function(it) {
                    return it.mailRaw && it.mailRaw.fileName === mail.fileName;
                });
                if (!alreadyInInbox) {
                    // 💡 [④] 우선순위 점수 계산 — 라벨 맨 앞에 등급 표시
                    const scoreResult = window._msComputeTotalScore(mail, item.task, priorityConfig);
                    const grade = scoreResult.total >= priorityConfig.cutline ? '🔴' : (scoreResult.total >= priorityConfig.cutline * 0.6 ? '🟡' : '⚪');
                    const candidateNames = finalProjectTag.candidates.map(function(c) { return c.model || c.customer; }).join(', ');
                    const sourceLabel = finalProjectTag.status === 'ambiguous'
                        ? `${grade}${scoreResult.total}점 메일자동분석(AI판단 후보: ${candidateNames})`
                        : `${grade}${scoreResult.total}점 메일자동분석(${candidateNames})`;
                    const mailRawObj = { subject: mail.subject, sender: mail.sender, date: mail.date, body2000: mail.body, fileName: mail.fileName };
                    window.TaskInbox.add(item.task, {
                        source: sourceLabel, mailRaw: mailRawObj,
                        matchedProject: finalProjectTag,
                        alarmWorthy: scoreResult.total >= priorityConfig.cutline
                    });
                    const newUid = window.TaskInbox.load()[0].uid; // add()는 unshift라 항상 맨 앞이 방금 추가한 항목

                    // 💡 [완전자동] 매칭 확정(단일 후보) + 날짜 확정 → 무조건 배치. 커트라인 이상이면 추가로 알림도 켬
                    const hasValidDate = !String(item.task['시작일'] || '').includes('날짜확인필요')
                        && !String(item.task['완료일'] || '').includes('날짜확인필요');
                    const setAlarm = scoreResult.total >= priorityConfig.cutline; // 💡 배치는 무조건, 알림만 커트라인으로 결정
                    // 💡 [정책 변경] "내 담당" 여부와 무관하게, 매칭이 단일 확정되면 완전자동으로 그 프로젝트에 바로 배치한다.
                    //    TaskInbox(업무 보관함)는 매칭 자체가 안 된(프로젝트 미등록/미분류) 업무만 남기는 용도로 좁힌다.
                    if (window.isAutoRegisterEnabled && window.isAutoRegisterEnabled()
                        && finalProjectTag.status === 'matched' && hasValidDate) {
                        const target = finalProjectTag.candidates[0];
                        window._msAutoRegisterToProject(newUid, item.task, target.drive_file_id, target.file_name, mailRawObj, 0, setAlarm)
                            .then(function(result) {
                                if (result.ok) {
                                    window.TaskInbox.setStatus(newUid, '자동배치됨', {
                                        type: '메일자동처리(커트라인)', target: target.file_name, at: new Date().toISOString()
                                    });
                                    if (window.showToast) {
                                        window.showToast(`🎯 "${item.task['업무명']}" 자동배치 완료 → ${target.file_name} (${result.label})`, 'info');
                                    }
                                } else {
                                    console.warn('[메일 자동처리] 자동배치 실패, TaskInbox 대기 상태 유지:', result.reason);
                                }
                            });
                    }

                    // 💡 [복수 프로젝트 매칭] AI가 "상" 신뢰도로 추가 확신한 프로젝트가 있으면(최대 2개, 캡은
                    //    _msResolveAiProjectMatch에서 이미 걸림) 그 프로젝트들에도 같은 업무를 독립된 TaskInbox
                    //    항목으로 추가한다 — 항상 "대기"로는 추가해서 사람이 확인할 수 있게 하고, 완전자동
                    //    조건까지 충족하면 주매칭과 동일하게 바로 그 프로젝트 파일에도 등록까지 진행한다.
                    const extraTargets = (finalProjectTag.status === 'matched' ? (finalProjectTag.extraCandidates || []) : [])
                        .filter(function(t) { return t && t.drive_file_id; });
                    if (extraTargets.length) {
                        const fullAuto = !!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled() && hasValidDate);
                        window._msRegisterToProjectTargets(
                            fullAuto ? extraTargets : [], // 💡 완전자동이 아니면 자동등록은 안 하고, 아래에서 대기 항목만 추가
                            item.task, mailRawObj, sourceLabel, setAlarm, '메일자동처리(커트라인,추가매칭)',
                            function(target, result) {
                                if (window.showToast) {
                                    window.showToast(result.ok
                                        ? `🎯 "${item.task['업무명']}" 추가매칭 자동배치 완료 → ${target.file_name} (${result.label || ''})`
                                        : `⚠️ "${item.task['업무명']}" 추가매칭 등록 실패 → ${target ? target.file_name : '?'} (${result.reason || ''})`, result.ok ? 'info' : 'error');
                                }
                            }
                        );
                        if (!fullAuto) {
                            // 반자동: 자동등록 없이 "대기" 상태로만 추가 — 사람이 보관함에서 [✅매칭전송]으로 직접 처리
                            extraTargets.forEach(function(target) {
                                window.TaskInbox.add(item.task, {
                                    source: `${sourceLabel} [추가매칭: ${target.model || target.customer || target.file_name}]`,
                                    mailRaw: mailRawObj,
                                    matchedProject: { status: 'matched', candidates: [target] },
                                    alarmWorthy: setAlarm
                                });
                            });
                        }
                    }
                }
            }

            window._msResults.unshift(item); // 💡 [최신 항목 상단 표시]
            addedCount++;
        }

        window._msSaveQueueToStorage();
        if (typeof msRenderList === 'function') msRenderList(window._msResults);
        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 [B/C] 배지 숫자 갱신
        localStorage.setItem(MS_LAST_AUTO_FETCH_KEY, new Date().toISOString());

        if (addedCount > 0 && window.showToast) {
            const filterNote = (discardCount || newSenderBatch.length)
                ? (window._currentLang === 'en'
                    ? ` (filtered: ${discardCount} discarded, ${newSenderBatch.length} new-sender)`
                    : ` (필터링: 폐기 ${discardCount} / 신규발신자 ${newSenderBatch.length})`)
                : '';
            window.showToast(window._currentLang === 'en'
                ? `📬 ${addedCount} new mail(s) auto-collected — pending review${filterNote}`
                : `📬 신규 메일 ${addedCount}건 자동수집·분석 완료 — 검토 대기${filterNote}`, 'info');
        }
    } catch(e) {
        console.warn('[메일 자동처리] 자동 수집 실패:', e.message);
        // 실패해도 last_fetch_at은 갱신하지 않음 → 다음 틱에서 같은 구간 재시도
    }
    } finally {
        window._msAutoTickRunning = false; // 다음 스케줄러 틱이 다시 실행될 수 있도록 항상 해제
    }
};

// ─── [메일 자동처리 B/C] 미분류·신규발신자 배지 갱신 + 읽기전용 검토 모달 ──
window._msRefreshQueueBadges = function() {
    const unmatchedCount = (window._msResults || []).filter(r => !r.project).length;
    const newSenderCount = (JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]')).length;
    const discardedCount = (JSON.parse(localStorage.getItem(MS_DISCARD_QUEUE_KEY) || '[]')).length;
    // 💡 [버그 수정] 이 배지들이 화면에 2벌(⚙️ 설정 모달 + 📥 업무 보관함 모달) 존재하는데
    //    id가 중복돼서 하나만 갱신되고 있었음 — 두 번째 사본은 "-2" 접미사로 분리해서 같이 갱신
    ['ms-unmatched-count', 'ms-unmatched-count-2'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = unmatchedCount;
    });
    ['ms-newsender-count', 'ms-newsender-count-2'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = newSenderCount;
    });
    ['ms-discarded-count', 'ms-discarded-count-2'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = discardedCount;
    });
};

const _msQEsc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// 💡 타입별 데이터 소스 — 'unmatched'는 세션큐+로컬스토리지, 'newsender'/'discarded'는 로컬스토리지 전용
window._msQueueGetRows = function(type) {
    if (type === 'unmatched') {
        return (window._msResults || []).filter(r => !r.project);
    }
    if (type === 'discarded') {
        return JSON.parse(localStorage.getItem(MS_DISCARD_QUEUE_KEY) || '[]');
    }
    return JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]');
};

window._msQueueDeleteOne = function(type, fileName) {
    if (type === 'unmatched') {
        window._msResults = (window._msResults || []).filter(r => r.fileName !== fileName);
        window._msSaveQueueToStorage();
    } else {
        const key = type === 'discarded' ? MS_DISCARD_QUEUE_KEY : MS_NEW_SENDER_QUEUE_KEY;
        const list = JSON.parse(localStorage.getItem(key) || '[]').filter(r => r.fileName !== fileName);
        localStorage.setItem(key, JSON.stringify(list));
    }
};

window._msQueueDeleteAll = function(type) {
    if (type === 'unmatched') {
        window._msResults = (window._msResults || []).filter(r => r.project); // 미분류만 제거, 매칭된 건 유지
        window._msSaveQueueToStorage();
    } else {
        localStorage.setItem(type === 'discarded' ? MS_DISCARD_QUEUE_KEY : MS_NEW_SENDER_QUEUE_KEY, '[]');
    }
};

// 💡 filteredReason(예: 'subject_kw:[광고]', 'unknown_domain:xxx.com')을 사람이 읽을 문구로 변환
// 💡 [2026-09-01 개선] 'unmatched'는 예전엔 "신뢰도 낮음/해당없음"이라는 뭉뚱그린 고정 문구만 보여줘서,
//    사용자가 "왜" 미분류됐는지 실제 근거를 알 수 없었음 — AI가 매칭 판단 시 함께 만든 실제 근거
//    (r.matchReason, msCallGemini 프롬프트의 "매칭근거" 필드)가 있으면 그걸 그대로 보여주고,
//    옛날에 분석돼서 이 필드가 없는 항목만 예전 고정 문구로 폴백한다.
window._msQueueRowHint = function(type, r) {
    const reason = r.filteredReason || '';
    if (reason.startsWith('subject_kw:')) return `제목 키워드 "${reason.slice(11)}" 규칙에 걸려 자동폐기됨`;
    if (reason.startsWith('noreply:')) return `발신자 패턴 "${reason.slice(8)}" 규칙에 걸려 자동폐기됨`;
    if (reason.startsWith('blocked_domain:')) return `차단 등록된 도메인(${reason.slice(15)})이라 자동폐기됨`;
    if (reason.startsWith('unknown_domain:')) return `주소록에 없는 발신자 도메인(${reason.slice(15)}) — 정상 거래처면 주소록에 추가 필요`;
    if (reason === 'whitelist_empty') return '주소록이 비어있어 전부 신규발신자로 분류됨';
    if (type === 'unmatched') return r.matchReason || '등록된 프로젝트 후보 중 AI가 확신 있게 고르지 못함(신뢰도 낮음/해당없음) — 이 메일은 옛날 버전 분석이라 상세 근거가 없습니다. 🔄 재분석 요청으로 다시 분석하면 근거가 표시됩니다.';
    return '';
};

// 💡 [2026-08-25 신규] 큐 종류(type) → 모달 헤더 문구. 예전엔 호출부(msShowUnmatchedModal 등)가
//    한글 문자열을 직접 넘겨서 영문 모드로 전환해도 이 헤더만 한글로 남아있었다 — type만 넘기면
//    현재 언어에 맞는 제목을 여기서 고르도록 바꿔서, 언어 전환 시에도 다시 열면 바로 맞는 언어로 나온다.
window._msQueueTypeLabel = function(type) {
    const _en = window._currentLang === 'en';
    if (type === 'unmatched') return _en ? '📭 Unclassified Mail' : '📭 미분류 메일';
    if (type === 'newsender') return _en ? '👤 New Sender Mail' : '👤 신규발신자 메일';
    if (type === 'discarded') return _en ? '🗑 Auto-discarded Mail' : '🗑 자동폐기 메일';
    return '';
};

window._msRenderQueueModal = function(type) {
    const _msQEn = window._currentLang === 'en';
    const title = window._msQueueTypeLabel(type);
    const rows = window._msQueueGetRows(type);

    window._msQueueRows = rows; // 💡 "원문 보기" 클릭 시 참조용 (onclick 문자열에 본문을 직접 못 넣으니 인덱스로 조회)
    const bodyHtml = rows.length
        ? rows.map((r, i) => {
            // 💡 [자동 등록] 신규발신자 큐에서만 "이 도메인 영구차단" 버튼 제공 — 검토 후 확정된 스팸이면
            //    한 번의 클릭으로 자동폐기 필터 규칙에 등록(다음부터는 조용히 걸러짐, AI 호출도 안 됨)
            const domain = (window._msParseSenderEmail(r.sender) || '').split('@')[1] || '';
            // 💡 [2026-08-24 버그 수정] 이 사각 아이콘 버튼들이 flex-centering 없이 UA 기본 정렬에만
            //    의존하고 있어서(width/height만 지정) 📧/🚫 아이콘이 중앙이 아니라 오른쪽으로 치우쳐
            //    보였음(🗑는 우연히 괜찮아 보였을 뿐). display:inline-flex + align/justify-content:center로
            //    명시 중앙정렬하면 셋 다 동일하게 정중앙에 옴 — 실측(getBoundingClientRect)으로 좌우
            //    여백이 거의 동일해지는 것까지 확인함.
            const ruleBtn = (type === 'newsender' && domain)
                ? `<button class="ms-queue-rule-btn" data-idx="${i}" data-domain="${_msQEsc(domain)}"
                        onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';"
                        title="이 발신자 도메인을 자동폐기 규칙에 영구 등록" style="display:inline-flex; align-items:center; justify-content:center; background:#fbead9; border:1px solid #edbf85; color:#a85d0a; border-radius:6px; width:26px; height:26px; padding:0; cursor:pointer; font-size:12px; transition:background .15s, border-color .15s;">🚫</button>`
                : '';
            // 💡 [2026-09-01 신규] 미분류 메일 전용 — 위 💡 근거를 읽어보고, 사람이 판단한 의견(힌트)을 남겨서
            //    AI에게 그 메일 하나만 다시 판단시킴(_msQueueReanalyze). 근거 없이 "그냥 다시 해봐"도 가능.
            const reanalyzeBtn = (type === 'unmatched')
                ? `<button class="ms-queue-reanalyze-btn" data-filename="${_msQEsc(r.fileName)}"
                        onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';"
                        title="사용자 의견을 참고해서 프로젝트 매칭 재분석 요청" style="display:inline-flex; align-items:center; justify-content:center; background:#e6f6ea; border:1px solid #a8dab8; color:#1f7a3d; border-radius:6px; width:26px; height:26px; padding:0; cursor:pointer; font-size:12px; transition:background .15s, border-color .15s;">🔄</button>`
                : '';
            return `
            <div style="padding:8px 10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div style="min-width:0; flex:1;">
                    <div style="font-size:12px; font-weight:bold; overflow-wrap:break-word;">${_msQEsc(r.subject)}</div>
                    <div style="font-size:11px; color:#777; margin-top:2px;">${_msQEsc(r.sender)} · ${_msQEsc(r.date)}</div>
                    <div style="font-size:11px; color:#e67e22; margin-top:2px;">💡 ${window._msQueueRowHint(type, r)}</div>
                </div>
                <div style="flex-shrink:0; display:flex; gap:4px;">
                    <button class="ms-queue-view-btn" data-idx="${i}"
                        onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                        title="원문 보기" style="display:inline-flex; align-items:center; justify-content:center; background:#e8f4fd; border:1px solid #a5c8f0; color:#1a4f7a; border-radius:6px; width:26px; height:26px; padding:0; cursor:pointer; font-size:12px; transition:background .15s, border-color .15s;">📧</button>
                    ${ruleBtn}
                    ${reanalyzeBtn}
                    <button class="ms-queue-del-btn" data-filename="${_msQEsc(r.fileName)}"
                        onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';"
                        title="삭제" style="display:inline-flex; align-items:center; justify-content:center; background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:6px; width:26px; height:26px; padding:0; cursor:pointer; font-size:12px; transition:background .15s, border-color .15s;">🗑</button>
                </div>
            </div>`;
        }).join('')
        : '<div style="padding:24px; text-align:center; color:#999; font-size:12px;">' + (_msQEn ? 'No pending items.' : '대기 중인 항목이 없습니다') + '</div>';

    let modal = document.getElementById('ms-queue-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ms-queue-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ms-queue-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:200px;">
            <div id="ms-queue-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span id="ms-queue-title">📭 미분류 메일</span>
                <button onclick="document.getElementById('ms-queue-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="ms-queue-body" style="overflow-y:auto; flex:1; background:#fafafa;"></div>
            <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px;">
                <button id="ms-queue-suggest-btn" onclick="window._msQueueSuggestClick()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:7px 10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;"></button>
                <button id="ms-queue-clear-all-btn" onclick="window._msQueueClearAll()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1; padding:7px 14px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:12px; cursor:pointer; transition:background .15s, border-color .15s;"></button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ms-queue-box', 'ms-queue-drag');
        window._bindClickToFront('ms-queue-modal');
        // 💡 삭제 버튼은 이벤트 위임으로 처리 — data-filename 속성 사용, onclick 문자열 조립 안 함(따옴표 깨짐 방지)
        document.getElementById('ms-queue-body').addEventListener('click', function(e) {
            const delBtn = e.target.closest('.ms-queue-del-btn');
            if (delBtn) { window._msQueueRemoveRow(window._msQueueCurrentType, delBtn.dataset.filename); return; }
            const viewBtn = e.target.closest('.ms-queue-view-btn');
            if (viewBtn) {
                const r = window._msQueueRows && window._msQueueRows[Number(viewBtn.dataset.idx)];
                if (r && window.showMailRawModal) window.showMailRawModal({ subject: r.subject, sender: r.sender, date: r.date, body2000: r.body });
                return;
            }
            // 💡 [2026-09-01 신규] "🔄 재분석 요청" — 미분류 사유를 읽고 사용자 의견(선택)을 남긴 뒤 그 메일만 다시 판단
            const reanalyzeBtn = e.target.closest('.ms-queue-reanalyze-btn');
            if (reanalyzeBtn) { window._msOpenReanalyzeHintModal(reanalyzeBtn.dataset.filename); return; }
            // 💡 [자동 등록] 신규발신자 검토 중 "이 도메인 영구차단" — 필터 규칙에 추가 + 큐에서도 제거
            const ruleBtn = e.target.closest('.ms-queue-rule-btn');
            if (ruleBtn) {
                const domain = ruleBtn.dataset.domain;
                if (!domain) return;
                if (!confirm(`"${domain}" 도메인을 자동폐기 규칙에 영구 등록할까요?\n앞으로 이 도메인에서 오는 메일은 AI 분석 없이 조용히 폐기됩니다.`)) return;
                window._msAddFilterRule('blockedDomains', domain);
                const r = window._msQueueRows && window._msQueueRows[Number(ruleBtn.dataset.idx)];
                if (r) window._msQueueRemoveRow(window._msQueueCurrentType, r.fileName);
                if (window.showToast) window.showToast(`🚫 "${domain}" 도메인 자동폐기 규칙에 등록됨`, 'info');
            }
        });
    }

    window._msQueueCurrentType = type;
    document.getElementById('ms-queue-title').textContent = title + (_msQEn ? ' (' + rows.length + ')' : ' (' + rows.length + '건)');
    document.getElementById('ms-queue-body').innerHTML = bodyHtml;
    const suggestBtn = document.getElementById('ms-queue-suggest-btn');
    if (suggestBtn) {
        // 💡 '자동폐기' 큐는 제안 기능이 없으므로(이미 규칙에 걸려서 폐기된 것) 버튼 자체를 숨김
        suggestBtn.style.display = type === 'discarded' ? 'none' : '';
        suggestBtn.textContent = type === 'unmatched'
            ? (_msQEn ? '🔑 Suggest Keywords' : '🔑 키워드 제안')
            : (_msQEn ? '📇 Suggest Contacts' : '📇 주소록 제안');
    }
    const clearAllBtn = document.getElementById('ms-queue-clear-all-btn');
    if (clearAllBtn) clearAllBtn.textContent = _msQEn ? '🗑 Clear All' : '🗑 일괄삭제';
    modal.style.display = 'block';
    window.bringModalToFront('ms-queue-modal'); // 💡 열 때 즉시 맨 앞으로 (클릭 안 해도)
};

window._msQueueSuggestClick = function() {
    if (window._msQueueCurrentType === 'unmatched') window._msShowKeywordSuggestModal();
    else window._msShowAddressSuggestModal();
};

window._msQueueRemoveRow = function(type, fileName) {
    window._msQueueDeleteOne(type, fileName);
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    window._msRenderQueueModal(type);
};

window._msQueueClearAll = function() {
    const type = window._msQueueCurrentType;
    const _msQEn = window._currentLang === 'en';
    if (!confirm(_msQEn ? 'Delete all pending items? This cannot be undone.' : '대기 중인 항목을 전부 삭제할까요? 되돌릴 수 없습니다.')) return;
    window._msQueueDeleteAll(type);
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    window._msRenderQueueModal(type);
};

// ═══════════════════════════════════════════════════════════════════
// 💡 [2026-09-01 신규] "📭 미분류 메일" 재분석 요청 — 왜 미분류됐는지(💡 근거, matchReason)를 사용자가
//    읽어보고, 자기 판단(예: "관리번호는 다르지만 실제로 이 프로젝트 맞음")을 남겨서 그 메일 1건만
//    다시 AI에게 판단시킨다. 힌트는 선택 입력 — 비워도 그냥 재시도로 동작한다(msCallGemini의 5번째
//    인자 userHint로 전달되어 프롬프트에서 최우선 근거로 취급됨. 위 msCallGemini 프롬프트 수정 참고).
window._msOpenReanalyzeHintModal = function(fileName) {
    const r = (window._msResults || []).find(x => x.fileName === fileName);
    if (!r) return;
    window._msReanalyzeTarget = fileName;
    let modal = document.getElementById('ms-reanalyze-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ms-reanalyze-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9260; background:rgba(0,0,0,0.25);';
        modal.innerHTML = `
        <div id="ms-reanalyze-box" onclick="event.stopPropagation()" style="position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:220px;">
            <div id="ms-reanalyze-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span>🔄 프로젝트 매칭 재분석 요청</span>
                <button onclick="event.stopPropagation(); document.getElementById('ms-reanalyze-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div style="padding:18px;">
                <div id="ms-reanalyze-subject" style="font-size:12px; color:#555; margin-bottom:6px; overflow-wrap:break-word;"></div>
                <div id="ms-reanalyze-prev-reason" style="font-size:11.5px; color:#a85d0a; background:#fff8e6; border:1px solid #ffe08a; border-radius:6px; padding:8px 10px; margin-bottom:10px; display:none;"></div>
                <label style="font-size:11.5px; color:#888; display:block; margin-bottom:4px;">위 근거를 참고해서, 실제로 어느 프로젝트 건인지(또는 왜 미분류가 맞는지) 의견을 남겨주세요 — 선택 입력, 비워두면 힌트 없이 그냥 다시 판단합니다.</label>
                <textarea id="ms-reanalyze-hint" placeholder="예: 관리번호는 다르지만 실제로는 STELLAR32 건 맞음 / 예: 회의록이라 여러 프로젝트가 섞여있어서 미분류가 맞음"
                    style="width:100%; min-height:80px; font-size:13px; border:1px solid #ced4da; border-radius:6px; padding:8px; box-sizing:border-box; resize:vertical;"></textarea>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                    <button onclick="window._msSubmitReanalyze()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:6px 18px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">재분석 요청</button>
                    <button onclick="document.getElementById('ms-reanalyze-modal').style.display='none'" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s;">취소</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ms-reanalyze-box', 'ms-reanalyze-drag');
        window._bindClickToFront('ms-reanalyze-modal');
    }
    document.getElementById('ms-reanalyze-subject').textContent = '📧 ' + (r.subject || '(제목없음)');
    const prevReasonEl = document.getElementById('ms-reanalyze-prev-reason');
    if (r.matchReason) { prevReasonEl.style.display = 'block'; prevReasonEl.textContent = '💡 이전 판단 근거: ' + r.matchReason; }
    else { prevReasonEl.style.display = 'none'; }
    document.getElementById('ms-reanalyze-hint').value = '';
    modal.style.display = 'block';
    window.bringModalToFront('ms-reanalyze-modal');
};

window._msSubmitReanalyze = async function() {
    const fileName = window._msReanalyzeTarget;
    const hint = (document.getElementById('ms-reanalyze-hint').value || '').trim();
    document.getElementById('ms-reanalyze-modal').style.display = 'none';
    await window._msQueueReanalyze(fileName, hint);
};

// 💡 미분류 메일 1건을 (선택적 사용자 힌트와 함께) 다시 분석해서 그 자리에서 결과를 갱신한다.
//    새로 매칭되면 다른 자동 경로(자동틱/배치분석)와 동일하게 업무 보관함(TaskInbox)에도 추가한다
//    (이미 보관함에 있으면 중복 추가하지 않음 — fileName 기준 대조, 기존 자동 경로와 동일 규칙).
window._msQueueReanalyze = async function(fileName, hint) {
    const r = (window._msResults || []).find(x => x.fileName === fileName);
    if (!r) return;
    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) { alert('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.'); return; }
    if (window.showToast) window.showToast('🔄 재분석 중... "' + (r.subject || '').substring(0, 24) + '"', 'info');
    try {
        const candidateList = window._msFilterCandidateProjects(await window._msLoadProjectIndex());
        const candidatesForAI = candidateList.length ? candidateList : null;
        const task = await msCallGemini(apiKey, {
            subject: r.subject, sender: r.sender, date: r.date, body: r.body, fileName: r.fileName
        }, candidatesForAI, null, hint || null);

        const projectTag = window._msResolveAiProjectMatch(task, candidatesForAI);
        const wasUnmatched = !r.project;
        r.task = task;
        r.project = window._msProjectTagLabel(projectTag);
        r._projectTag = projectTag;
        r.matchReason = (task && task['매칭근거']) || '';
        r.error = !task ? 'AI분석실패' : null;
        r.selected = !!task;
        r.reanalyzedAt = new Date().toISOString();
        r.reanalyzeHint = hint || '';

        if (task) {
            const priorityConfig = await window.loadPriorityConfig();
            const scoreResult = window._msComputeTotalScore(r, task, priorityConfig);
            r._score = scoreResult.total;
            r._scoreGrade = window._msScoreGrade(scoreResult.total, priorityConfig.cutline);
            r._scoreBreakdown = scoreResult.breakdown;
            r._alarmWorthy = scoreResult.total >= priorityConfig.cutline;
        }

        if (wasUnmatched && projectTag && task && window.TaskInbox) {
            const alreadyInInbox = window.TaskInbox.load().some(it => it.mailRaw && it.mailRaw.fileName === r.fileName);
            if (!alreadyInInbox) {
                const grade = r._scoreGrade || '⚪';
                const candidateNames = projectTag.candidates.map(c => c.model || c.customer).join(', ');
                const sourceLabel = `${grade}${r._score || 0}점 메일자동분석(재분석` + (projectTag.status === 'ambiguous' ? `, AI판단 후보: ${candidateNames})` : `, ${candidateNames})`);
                const mailRawObj = { subject: r.subject, sender: r.sender, date: r.date, body2000: r.body, fileName: r.fileName };
                window.TaskInbox.add(task, { source: sourceLabel, mailRaw: mailRawObj, matchedProject: projectTag, alarmWorthy: !!r._alarmWorthy });
            }
        }

        window._msSaveQueueToStorage();
        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
        window._msRenderQueueModal('unmatched');
        if (window.showToast) {
            if (task && projectTag && projectTag.status === 'matched') {
                window.showToast(`✅ 재분석 완료 — "${window._msProjectTagLabel(projectTag)}"로 매칭되어 업무 보관함에 추가됨`, 'info');
            } else if (task) {
                window.showToast('🔄 재분석 완료 — 여전히 미분류입니다(근거를 다시 확인해보세요)', 'warning');
            } else {
                window.showToast('⚠️ 재분석 실패(AI 분석에 실패했습니다)', 'error');
            }
        }
    } catch (e) {
        if (window.showToast) window.showToast('⚠️ 재분석 중 오류: ' + e.message, 'error');
    }
};

// ═══════════════════════════════════════════════════════════════════
// 💡 [미분류 → 키워드 제안] 지금 열려있는(멀티시트) 프로젝트들의 model/customer 조각이
//    미분류 메일 본문에 등장하는데 project_index.json의 keywords엔 없는 경우를 찾아서 제안.
//    실제 반영은 project_index.json의 해당 항목 keywords 배열에 append (승인 없이 자동으로
//    project_index.json 전체를 rebuild하지 않음 — Summary "메일키워드" 필드에도 함께 반영해서
//    나중에 그 프로젝트를 저장해도 유실되지 않게 함)
// ═══════════════════════════════════════════════════════════════════
// 💡 "모델코드처럼 보이는" 패턴을 뽑아내는 로컬 휴리스틱 (AI 호출 없음, 글자수 하한은 기존
//    매칭 로직과 동일하게 MS_MIN_KEYWORD_LEN=3 그대로 사용):
//    - 소수점 규격 표기 (4.3, 31.5, 32.0", 31.5MVD)
//    - 영문+숫자 조합 코드 (STELLAR32, S32, KTS320DPS01)
//    - 대문자 3자+ 제품라인명 (OBSIDIAN, SHUFFLER — 전부 대문자로만 쓰인 경우)
//    - Title Case 단어 (Obsidian, Shuffler처럼 첫 글자만 대문자인 실제 표기 — 흔한 인사말/상투어는
//      스톱워드로 제외). 예전엔 전부 대문자 패턴만 잡아서 "Obsidian"처럼 자주 쓰이는 실제 표기를 놓쳤음
// 💡 대소문자를 섞어 적든(Design/DESIGN) 상관없이 걸러지도록, 목록은 소문자로 저장하고 조회할 때도
//    소문자로 비교한다(예전엔 대소문자가 정확히 일치할 때만 걸러져서 "PROTO"는 막아도 "Proto"는
//    새고, 그 반대도 마찬가지인 허점이 있었음).
window._MS_KW_STOPWORDS = new Set([
    'Hi','Hello','Dear','Regards','Thanks','Thank','Please','Best','Kind','Sincerely',
    'From','Subject','Date','To','Cc','Re','Fwd','Fw','The','This','That','With','For',
    'And','Are','Was','Were','You','Your','We','Our','Team','Email','Mail','Meeting',
    'Update','Review','Request','Attached','File','Files','Report','Today','Tomorrow',
    'Yesterday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
    'January','February','March','April','May','June','July','August','September',
    'October','November','December','Project','Info','Information',
    'Sample','Samples','Regarding','Check','Spec','Specs','Sheet','Follow','Kindly',
    'Confirm','Details','Comments','Comment','Question','Questions','Issue','Issues',
    'Status','Progress','Schedule','Timeline','Reminder','Feedback','Action','Items',
    'Item','Result','Results','Summary','Overview','Note','Notes','Draft','Final',
    'Version','New','Old','Next','Last','First','Second','Week','Weekly','Monthly',
    // 💡 [노이즈 제거] 회사 서명란/주소 블록 — 거의 모든 메일 하단에 반복돼서 "매우 자주 등장하는
    //    키워드"처럼 보이지만 실제로는 특정 프로젝트와 아무 상관 없는 상투어
    'Kortek','Corp','Corporation','Venture','Town','Yeonsu','Incheon','Korea','Seoul','Songdo',
    'Tel','Fax','Phone','Mobile','Home','Website','Address','Center','Confidentiality',
    'Statement','Sent','Original','Message','Disclaimer','Copyright','Rights','Reserved',
    // 💡 직급/호칭 — 사람 이름과 함께 자주 등장하지만 프로젝트 식별과 무관
    'Manager','Senior','Director','Leader','Head','Engineer','Chief','President','Staff',
    'Sales','Marketing','Department','Division','Group','Representative','Executive',
    // 💡 개발단계(WBS L0) 용어 — 모든 프로젝트가 공통으로 쓰는 범용 단계명이라 특정 프로젝트를
    //    식별하지 못함 (getSystemPrompt의 개발단계 목록과 동일)
    'Proto','RFI','RFQ','NRE','Award','Kick','Off','Design','EVT','ES','DVT','PVT','FAI',
    'PP','SOP','MP','EC','RMA','EOL',
    // 💡 전자제품 업계 범용 스펙/부품 용어 — 특정 프로젝트가 아니라 업계 전체에서 공용으로 쓰임
    'Panel','Touch','Glass','Black','White','Blue','Red','Green','Yellow','Size','Type',
    'Price','Color','Gamut','Resolution','Frequency','Interface','Board','Cable','Bracket',
    'Cover','Base','Source','Contents','Model','Code','Vendor','Production','Technology',
    'Curved','Maker','Remark','Slim','Driving','Luminance','Contrast','Ratio','Application',
    'Expected','LED','PCB','BOM','CAD','USB','LCM','OSD','LGD','BOE','REV','Tool','Firmware',
    'Bezel','Scaler','Dir','Anthony'
].map(function(w) { return w.toLowerCase(); }));
// 💡 [노이즈 제거] 승인시스템 문서번호 패턴(예: OW-20260814-013, PE-20260818-038)처럼 날짜가 박힌
//    사무행정 문서 ID는 프로젝트 키워드가 아니라 그 자체로 걸러야 함
window._MS_DOC_ID_PATTERN = /^[A-Z]{1,3}-\d{8}-\d{2,4}$/;
window._MS_SUSPICIOUS_PATTERNS = [
    /\b\d{1,3}\.\d{1,2}\s*(?:"|인치|MVD)?/g,
    /\b[A-Z][A-Z0-9\-]{1,}[0-9]\b/g,
    /\b[A-Z]{3,}\b/g,
    /\b[A-Z][a-z]{2,}\b/g
];
window._msExtractSuspiciousTokens = function(text) {
    const s = String(text || '');
    const found = new Set();
    window._MS_SUSPICIOUS_PATTERNS.forEach(function(re) {
        (s.match(re) || []).forEach(function(t) {
            const trimmed = t.trim();
            if (trimmed.length < MS_MIN_KEYWORD_LEN || window._MS_KW_STOPWORDS.has(trimmed.toLowerCase())) return;
            if (window._MS_DOC_ID_PATTERN.test(trimmed)) return; // 행정 문서번호(예: OW-20260814-013) 제외
            found.add(trimmed);
        });
    });
    return Array.from(found);
};

// 💡 [추천] "의심 후보" 키워드가 있는 메일 안에서, 열려있는 프로젝트들 중 어느 프로젝트의
//    기존 키워드/모델명 조각이 가장 많이 같이 등장하는지(co-occurrence)로 대상 프로젝트를 추정.
//    확신 있는 신호가 하나도 없으면 null(추천 안 함 — 검토 화면에서 사람이 직접 골라야 함)
window._msRecommendProjectFor = function(mail, openProjects, excludeToken) {
    const haystack = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
    let best = null, bestScore = 0;
    openProjects.forEach(function(p) {
        let score = 0;
        const frags = [];
        if (p.model) { frags.push(p.model); p.model.split(/[\s\/]+/).forEach(function(w) { if (w) frags.push(w); }); }
        (p.keywords || []).forEach(function(k) { frags.push(k); });
        frags.forEach(function(f) {
            const ff = String(f).trim();
            if (!ff || ff.length < MS_MIN_KEYWORD_LEN || ff.toLowerCase() === excludeToken.toLowerCase()) return;
            if (window._msKeywordMatches(haystack, ff)) score++;
        });
        if (score > bestScore) { bestScore = score; best = p; }
    });
    return best;
};

window._msSuggestKeywordsForUnmatched = async function() {
    const unmatched = (window._msResults || []).filter(r => !r.project);
    if (!unmatched.length) return [];
    const projectList = await window._msLoadProjectIndex();
    const openIds = new Set((window._sheets || []).map(s => s.fileId));
    const openProjects = projectList.filter(p => openIds.has(p.drive_file_id));
    window._msKwOpenProjects = openProjects; // 제안 목록의 프로젝트 선택 드롭다운에서 재사용
    if (!openProjects.length) return [];
    // 💡 전체 프로젝트(열려있지 않은 것 포함)의 고객사명은 "제목분석" 후보에서도 미리 제외 —
    //    LNW처럼 여러 프로젝트가 공유하는 고객사명을 키워드로 넣으면 확실히 오매칭을 유발함
    const knownCustomers = new Set(projectList.map(p => (p.customer || '').toLowerCase()).filter(Boolean));
    // 💡 [노이즈 제거] 주소록에 등록된 사람 이름 조각(성/이름 낱말)은 제품 키워드가 아니라 발신자/수신자
    //    이름일 뿐이므로 후보에서 제외 — "Jun","Leader","Anthony"처럼 사람 이름이 회의 스레드에서
    //    프로젝트 키워드와 같이 등장했다는 이유만으로 추천되던 문제를 막음
    const knownNameTokens = new Set();
    ((window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : []).forEach(function(p) {
        [p.name, p.nameEn].forEach(function(n) {
            String(n || '').split(/[\s,]+/).forEach(function(part) {
                if (part) knownNameTokens.add(part.toLowerCase());
            });
        });
    });

    const suggestions = [];
    unmatched.forEach(function(mail) {
        const haystack = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
        const certainKeywordsThisMail = new Set(); // 💡 ①에서 이미 확실히 처리된 건 ②에서 중복 제안 안 함

        // ① 확실한 제안 — 열려있는 프로젝트의 모델명 조각이 메일에 등장.
        //    💡 고객사명(customer)은 후보에서 제외 — 한 고객사가 여러 프로젝트를 갖는 경우가
        //    흔해서(project_index.json 빌드 규칙과 동일 이유) 키워드로 쓰면 프로젝트 간 오매칭 유발
        openProjects.forEach(function(p) {
            const existingKw = new Set((p.keywords || []).map(k => String(k).toLowerCase()));
            const candidates = [];
            if (p.model) {
                candidates.push(p.model);
                p.model.split(/[\s\/]+/).forEach(function(w) { if (w) candidates.push(w); });
            }
            candidates.forEach(function(cand) {
                const c = String(cand).trim();
                if (c.length < MS_MIN_KEYWORD_LEN || existingKw.has(c.toLowerCase())) return;
                if (window._msKeywordMatches(haystack, c)) {
                    suggestions.push({ subject: mail.subject, driveFileId: p.drive_file_id, projectLabel: (p.model || p.customer), keyword: c, certain: true });
                    certainKeywordsThisMail.add(c.toLowerCase());
                }
            });
        });

        // ② 의심 후보 — 제목 + 본문 앞부분을 패턴 분석해서 모델코드처럼 보이는 토큰을 추가로 뽑음
        //    (예전엔 제목만 봐서 놓치는 게 많았음 — 본문 앞 500자까지 확대, 너무 길면 인용된 옛
        //    메일 스레드까지 섞여 노이즈가 커지니 일부러 제한). 확실하게 어느 프로젝트 것인지는
        //    모르니, 같은 메일에 같이 등장하는 다른 신호로 "추천"만 하고 최종 선택은 검토 화면에서
        const scanText = (mail.subject || '') + ' ' + (mail.body || '').substring(0, 500);
        window._msExtractSuspiciousTokens(scanText).forEach(function(tok) {
            if (certainKeywordsThisMail.has(tok.toLowerCase())) return; // ①과 대소문자만 다른 중복 방지
            if (knownCustomers.has(tok.toLowerCase())) return; // 고객사명은 후보에서 제외
            if (knownNameTokens.has(tok.toLowerCase())) return; // 주소록에 있는 사람 이름은 제외
            const alreadyRegistered = openProjects.some(function(p) {
                return (p.keywords || []).some(function(k) { return String(k).toLowerCase() === tok.toLowerCase(); });
            });
            if (alreadyRegistered) return;
            // 💡 [핵심 노이즈 제거] 열려있는 어떤 프로젝트와도 같이 등장하는 다른 신호가 하나도 없으면
            //    아예 제안하지 않음 — 회사 서명란(Kortek/Incheon/Korea 등)이나 완전히 무관한 다른
            //    업체 얘기(Cosmic Upright, CSOT 패널문의 등)가 후보로 쏟아지던 근본 원인이었음
            const rec = window._msRecommendProjectFor(mail, openProjects, tok);
            if (!rec) return;
            suggestions.push({
                subject: mail.subject, driveFileId: null, projectLabel: null, keyword: tok, certain: false,
                recommendedFileId: rec.drive_file_id,
                recommendedLabel: (rec.model || rec.customer)
            });
        });
    });

    // 같은 (프로젝트 or 미지정, 키워드) 제안이 메일마다 중복되니 1건으로 합치고 매칭건수만 카운트
    const dedupMap = new Map();
    suggestions.forEach(function(s) {
        const key = (s.driveFileId || '?') + '|' + s.keyword.toLowerCase();
        if (!dedupMap.has(key)) dedupMap.set(key, Object.assign({ count: 0, sampleSubject: s.subject }, s));
        dedupMap.get(key).count++;
    });
    // 💡 [노이즈 제거] 서로 무관한 메일 10건 넘게 걸리는 단어는 특정 프로젝트를 식별하는 고유 키워드가
    //    아니라 서명란/상투어일 가능성이 매우 높음(진짜 프로젝트 용어는 그 프로젝트 관련 메일 몇 건에만
    //    집중적으로 등장함) — 안전망으로 제외. "확실한" 제안(모델명 조각)은 원래도 근거가 확실해 그대로 둠
    const MAX_SUGGESTION_COUNT = 10;
    const list = Array.from(dedupMap.values()).filter(function(s) { return s.certain || s.count <= MAX_SUGGESTION_COUNT; });
    list.sort(function(a, b) { return (b.certain ? 1 : 0) - (a.certain ? 1 : 0); }); // 확실한 제안을 위로
    return list;
};

// project_index.json의 특정 프로젝트 항목 keywords 배열에 1개 append (전체 rebuild 아님 — 수동 추가분 보존)
window._msAppendProjectKeyword = async function(driveFileId, keyword) {
    try {
        const tokenObj = gapi.client.getToken();
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token || !driveFileId || !keyword) return false;
        const indexFileId = await window.findProjectIndexFile(token);
        if (!indexFileId) return false;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data || !Array.isArray(data.projects)) return false;
        const entry = data.projects.find(function(p) { return p.drive_file_id === driveFileId; });
        if (!entry) return false;
        entry.keywords = entry.keywords || [];
        if (!entry.keywords.some(function(k) { return String(k).toLowerCase() === keyword.toLowerCase(); })) entry.keywords.push(keyword);
        entry.updated_at = new Date().toISOString();
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        window._projectIndexCache = { data: null, at: 0 }; // 캐시 무효화 — 다음 매칭부터 바로 반영

        // 열려있는 시트 중 해당 프로젝트가 있으면 "메일키워드" 필드에도 반영 — 나중에 그 프로젝트를
        // Summary에서 저장해도(→ updateProjectIndexEntry가 projectMeta로 rebuild) 방금 추가한 키워드가 안 사라지게
        (window._sheets || []).forEach(function(s) {
            const pm = s.fileId === driveFileId ? (s.snapshot && s.snapshot.projectMeta) : null;
            if (!pm) return;
            const existing = window._parseMailKeywords(pm.메일키워드);
            if (!existing.some(function(k) { return k.toLowerCase() === keyword.toLowerCase(); })) {
                existing.push(keyword);
                pm.메일키워드 = existing.join(', ');
            }
        });
        if (window.currentDriveFileId === driveFileId && window.projectMeta) {
            const existing = window._parseMailKeywords(window.projectMeta.메일키워드);
            if (!existing.some(function(k) { return k.toLowerCase() === keyword.toLowerCase(); })) {
                existing.push(keyword);
                window.projectMeta.메일키워드 = existing.join(', ');
                const el = document.getElementById('sum-mail-keywords');
                if (el) el.value = window.projectMeta.메일키워드;
            }
        }
        return true;
    } catch (e) { console.warn('project_index.json 키워드 추가 실패:', e.message); return false; }
};

// 키워드 추가 후, 지금 미분류로 쌓여있는 메일들을 즉시 재매칭 — 방금 추가한 키워드로 걸리면 바로 이동
window._msRecheckUnmatched = async function() {
    window._projectIndexCache = { data: null, at: 0 };
    const projectList = await window._msLoadProjectIndex();
    let movedCount = 0;
    (window._msResults || []).forEach(function(r) {
        if (r.project) return;
        const matched = window._msMatchProjects({ subject: r.subject, body: r.body }, projectList);
        if (matched.length) {
            const tag = matched.length === 1 ? { status: 'matched', candidates: matched } : { status: 'ambiguous', candidates: matched };
            r.project = window._msProjectTagLabel(tag); // 💡 화면 표시용 문자열 — 객체를 그대로 넣으면 "[object Object]"로 렌더됨
            r._projectTag = tag;
            movedCount++;
        }
    });
    if (movedCount) {
        window._msSaveQueueToStorage();
        if (typeof msRenderList === 'function') msRenderList(window._msResults);
    }
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    return movedCount;
};

window._msShowKeywordSuggestModal = async function() {
    let modal = document.getElementById('ms-kwsuggest-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ms-kwsuggest-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ms-kwsuggest-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:220px;">
            <!-- 💡 [2026-08-30 모달 헤더 정리] AI 계열 모달은 하늘색으로 통일(원래 색이 테마 역할값과
                 겹쳐 팔레트 색 변경에 의도치 않게 같이 바뀌던 부작용도 같이 해결). -->
            <div id="ms-kwsuggest-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span id="ms-kwsuggest-title">🔑 키워드 제안</span>
                <button onclick="document.getElementById('ms-kwsuggest-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="ms-kwsuggest-body" style="overflow-y:auto; flex:1; background:#fafafa;"></div>
            <div style="padding:10px 16px; border-top:1px solid #eee;">
                <button id="ms-kwsuggest-all-btn" onclick="window._msApplyAllKeywordSuggestions()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="width:100%; padding:7px 14px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ 전체 추가</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ms-kwsuggest-box', 'ms-kwsuggest-drag');
        window._bindClickToFront('ms-kwsuggest-modal');
    }
    modal.style.display = 'block';
    window.bringModalToFront('ms-kwsuggest-modal');
    const body = document.getElementById('ms-kwsuggest-body');
    body.innerHTML = '<div style="padding:24px; text-align:center; color:#999; font-size:12px;">⏳ 열려있는 프로젝트 대비 분석 중...</div>';
    window._msKwSuggestions = await window._msSuggestKeywordsForUnmatched();
    window._msRenderKeywordSuggestList();
};

window._msRenderKeywordSuggestList = function() {
    const body = document.getElementById('ms-kwsuggest-body');
    const title = document.getElementById('ms-kwsuggest-title');
    const list = window._msKwSuggestions || [];
    const openProjects = window._msKwOpenProjects || [];
    if (title) title.textContent = `🔑 키워드 제안 (${list.length}건)`;
    if (!list.length) {
        body.innerHTML = '<div style="padding:24px; text-align:center; color:#999; font-size:12px;">제안할 키워드가 없습니다.<br>(열려있는 프로젝트와 겹치는 미분류 메일이 없거나, 이미 다 등록돼 있습니다)</div>';
        return;
    }
    body.innerHTML = list.map(function(s, i) {
        // 💡 [추천] 같이 등장한 다른 신호로 대상 프로젝트를 추정했으면 드롭다운에 미리 선택해둠 —
        //    사람은 "확인만" 하면 되고, 추천이 틀렸으면 직접 바꾸면 됨
        const projOptions = openProjects.map(function(p) {
            const sel = (!s.certain && s.recommendedFileId === p.drive_file_id) ? ' selected' : '';
            return `<option value="${p.drive_file_id}"${sel}>${_msQEsc(p.model || p.customer)}</option>`;
        }).join('');
        const targetHtml = s.certain
            ? `→ <b style="color:#0056b3;">${_msQEsc(s.projectLabel)}</b>`
            : `→ <select class="ms-kwsuggest-proj-select" data-idx="${i}" style="font-size:11px; padding:1px 4px; border:1px solid #ccc; border-radius:4px; max-width:150px;">
                   <option value=""${s.recommendedFileId ? '' : ' selected'}>프로젝트 선택...</option>${projOptions}
               </select>${s.recommendedFileId ? ` <span style="font-size:9.5px; color:#2f9e44; font-weight:bold;">✓추천: ${_msQEsc(s.recommendedLabel)}</span>` : ''}`;
        return `
        <div style="padding:8px 10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="min-width:0; flex:1;">
                <div style="font-size:12px; display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                    <span title="${s.certain ? '열려있는 프로젝트 모델명 조각과 일치' : '제목·본문 패턴 분석으로 추출 — 추천된 프로젝트를 확인하고 필요하면 바꾸세요'}"
                        style="background:${s.certain ? '#d4edda' : '#ffe8cc'}; color:${s.certain ? '#2f9e44' : '#c9640a'}; padding:1px 5px; border-radius:3px; font-size:9.5px; font-weight:bold; white-space:nowrap;">${s.certain ? '확실' : '제목·본문분석'}</span>
                    <span style="background:#fff3cd; color:#856404; padding:1px 5px; border-radius:3px; font-weight:bold;">${_msQEsc(s.keyword)}</span>
                    ${targetHtml}
                </div>
                <div style="font-size:10.5px; color:#999; margin-top:2px; overflow-wrap:break-word;">${_msQEsc(s.count)}건 · 예: ${_msQEsc(s.sampleSubject)}</div>
            </div>
            <div style="flex-shrink:0; display:flex; gap:4px;">
                <button data-idx="${i}" class="ms-kwsuggest-add-btn" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:5px 10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➕ 추가</button>
                <button data-idx="${i}" class="ms-kwsuggest-del-btn" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" title="이 제안 무시" style="padding:5px 8px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🗑</button>
            </div>
        </div>`;
    }).join('');
    body.querySelectorAll('.ms-kwsuggest-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { window._msApplyOneKeywordSuggestion(Number(btn.dataset.idx)); });
    });
    body.querySelectorAll('.ms-kwsuggest-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { window._msDismissKeywordSuggestion(Number(btn.dataset.idx)); });
    });
};

window._msDismissKeywordSuggestion = function(idx) {
    window._msKwSuggestions = (window._msKwSuggestions || []).filter(function(_, i) { return i !== idx; });
    window._msRenderKeywordSuggestList();
};

window._msApplyOneKeywordSuggestion = async function(idx) {
    const s = (window._msKwSuggestions || [])[idx];
    if (!s) return;
    let driveFileId = s.driveFileId;
    let projectLabel = s.projectLabel;
    if (!s.certain) {
        const sel = document.querySelector('.ms-kwsuggest-proj-select[data-idx="' + idx + '"]');
        driveFileId = sel ? sel.value : '';
        if (!driveFileId) { alert('먼저 대상 프로젝트를 선택해주세요.'); return; }
        const p = (window._msKwOpenProjects || []).find(function(pp) { return pp.drive_file_id === driveFileId; });
        projectLabel = p ? (p.model || p.customer) : driveFileId;
    }
    const ok = await window._msAppendProjectKeyword(driveFileId, s.keyword);
    if (ok) {
        window._msKwSuggestions = window._msKwSuggestions.filter(function(_, i) { return i !== idx; });
        const moved = await window._msRecheckUnmatched();
        if (window.showToast) window.showToast(`✅ "${s.keyword}" → ${projectLabel}에 추가됨` + (moved ? ` (미분류 ${moved}건 재매칭됨)` : ''), 'info');
        window._msRenderKeywordSuggestList();
    } else if (window.showToast) {
        window.showToast('❌ 키워드 추가 실패 — 콘솔 확인', 'error');
    }
};

window._msApplyAllKeywordSuggestions = async function() {
    const list = window._msKwSuggestions || [];
    if (!list.length) return;
    // 💡 "제목분석" 후보는 대상 프로젝트를 미리 선택해둔 것만 일괄 적용 대상에 포함 — 안 고른 건 건너뜀
    const applicable = list.map(function(s, i) {
        if (s.certain) return { i: i, driveFileId: s.driveFileId, keyword: s.keyword };
        const sel = document.querySelector('.ms-kwsuggest-proj-select[data-idx="' + i + '"]');
        return sel && sel.value ? { i: i, driveFileId: sel.value, keyword: s.keyword } : null;
    }).filter(Boolean);
    const skipped = list.length - applicable.length;
    if (!applicable.length) { alert('적용할 항목이 없습니다. "제목분석" 후보는 먼저 대상 프로젝트를 선택해주세요.'); return; }
    if (!confirm(`${applicable.length}건의 키워드를 추가할까요?` + (skipped ? ` (프로젝트 미선택 ${skipped}건은 건너뜁니다)` : ''))) return;
    let okCount = 0;
    for (const s of applicable) {
        const ok = await window._msAppendProjectKeyword(s.driveFileId, s.keyword);
        if (ok) okCount++;
    }
    const appliedIdx = new Set(applicable.map(function(a) { return a.i; }));
    const moved = await window._msRecheckUnmatched();
    window._msKwSuggestions = list.filter(function(_, i) { return !appliedIdx.has(i); });
    window._msRenderKeywordSuggestList();
    if (window.showToast) window.showToast(`✅ 키워드 ${okCount}건 추가 완료` + (moved ? ` (미분류 ${moved}건 재매칭됨)` : ''), 'info');
};

// ═══════════════════════════════════════════════════════════════════
// 💡 [신규발신자 → 주소록 일괄추가] 큐에 쌓인 신규발신자를 이메일 기준으로 정리(중복제거)해서
//    공용 주소록(window.AddressBook)에 일괄 등록 — 등록되면 다음부터 화이트리스트에 자동 포함됨
// ═══════════════════════════════════════════════════════════════════
window._msSuggestAddressEntries = function() {
    const queue = JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]');
    const existingEmails = new Set((window.AddressBook.load() || []).map(function(p) { return (p.email || '').toLowerCase(); }));
    const seen = new Map();
    queue.forEach(function(r) {
        const email = window._msParseSenderEmail(r.sender);
        if (!email || existingEmails.has(email) || seen.has(email)) return;
        let name = String(r.sender || '').replace(/<.*?>/, '').replace(/["']/g, '').trim();
        if (!name || name.toLowerCase() === email) name = email.split('@')[0];
        seen.set(email, { name: name, email: email, sampleSubject: r.subject });
    });
    return Array.from(seen.values());
};

window._msAddToAddressBook = function(entries) {
    const list = window.AddressBook.load();
    const existingEmails = new Set(list.map(function(p) { return (p.email || '').toLowerCase(); }));
    let added = 0;
    entries.forEach(function(e) {
        if (existingEmails.has(e.email.toLowerCase())) return;
        list.push({ name: e.name, nameEn: '', dept: '', title: '', email: e.email, mobile: '', phone: '', telegramId: '' });
        existingEmails.add(e.email.toLowerCase());
        added++;
    });
    window.AddressBook.save(list); // 3초 디바운스 후 공용 Drive 파일에 동기화
    window.tabData = window.tabData || {};
    window.tabData.addressBook = list;
    if (window.renderAddressTable) window.renderAddressTable();
    const addedEmails = new Set(entries.map(function(e) { return e.email.toLowerCase(); }));
    const remaining = (JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]'))
        .filter(function(r) { return !addedEmails.has(window._msParseSenderEmail(r.sender)); });
    localStorage.setItem(MS_NEW_SENDER_QUEUE_KEY, JSON.stringify(remaining));
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    return added;
};

window._msShowAddressSuggestModal = function() {
    let modal = document.getElementById('ms-addrsuggest-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ms-addrsuggest-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ms-addrsuggest-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:220px;">
            <!-- 💡 [2026-08-30 모달 헤더 정리] AI 계열 모달은 하늘색으로 통일. -->
            <div id="ms-addrsuggest-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span id="ms-addrsuggest-title">📇 주소록 추가 제안</span>
                <button onclick="document.getElementById('ms-addrsuggest-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="ms-addrsuggest-body" style="overflow-y:auto; flex:1; background:#fafafa;"></div>
            <div style="padding:10px 16px; border-top:1px solid #eee;">
                <button id="ms-addrsuggest-all-btn" onclick="window._msApplyAllAddressSuggestions()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="width:100%; padding:7px 14px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ 전체 주소록에 추가</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ms-addrsuggest-box', 'ms-addrsuggest-drag');
        window._bindClickToFront('ms-addrsuggest-modal');
    }
    modal.style.display = 'block';
    window.bringModalToFront('ms-addrsuggest-modal');
    window._msAddrSuggestions = window._msSuggestAddressEntries();
    window._msRenderAddressSuggestList();
};

window._msRenderAddressSuggestList = function() {
    const body = document.getElementById('ms-addrsuggest-body');
    const title = document.getElementById('ms-addrsuggest-title');
    const list = window._msAddrSuggestions || [];
    if (title) title.textContent = `📇 주소록 추가 제안 (${list.length}건)`;
    if (!list.length) {
        body.innerHTML = '<div style="padding:24px; text-align:center; color:#999; font-size:12px;">추가할 신규 발신자가 없습니다.<br>(이미 주소록에 있거나, 대기 중인 신규발신자가 없습니다)</div>';
        return;
    }
    body.innerHTML = list.map(function(e, i) {
        return `
        <div style="padding:8px 10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="min-width:0; flex:1;">
                <div style="font-size:12px; font-weight:bold;">${_msQEsc(e.name)}</div>
                <div style="font-size:11px; color:#777; margin-top:1px;">${_msQEsc(e.email)}</div>
                <div style="font-size:10.5px; color:#999; margin-top:2px; overflow-wrap:break-word;">예: ${_msQEsc(e.sampleSubject)}</div>
            </div>
            <div style="flex-shrink:0; display:flex; gap:4px;">
                <button data-idx="${i}" class="ms-addrsuggest-add-btn" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:5px 10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➕ 추가</button>
                <button data-idx="${i}" class="ms-addrsuggest-del-btn" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" title="이 제안 무시" style="padding:5px 8px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🗑</button>
            </div>
        </div>`;
    }).join('');
    body.querySelectorAll('.ms-addrsuggest-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = Number(btn.dataset.idx);
            const e = window._msAddrSuggestions[idx];
            window._msAddToAddressBook([e]);
            window._msAddrSuggestions = window._msAddrSuggestions.filter(function(_, i) { return i !== idx; });
            window._msRenderAddressSuggestList();
            if (window.showToast) window.showToast(`✅ "${e.name}" 주소록에 추가됨`, 'info');
        });
    });
    body.querySelectorAll('.ms-addrsuggest-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = Number(btn.dataset.idx);
            window._msAddrSuggestions = window._msAddrSuggestions.filter(function(_, i) { return i !== idx; });
            window._msRenderAddressSuggestList();
        });
    });
};

window._msApplyAllAddressSuggestions = function() {
    const list = window._msAddrSuggestions || [];
    if (!list.length) return;
    if (!confirm(`${list.length}명을 전부 주소록에 추가할까요?`)) return;
    const added = window._msAddToAddressBook(list);
    window._msAddrSuggestions = [];
    window._msRenderAddressSuggestList();
    if (window.showToast) window.showToast(`✅ 주소록에 ${added}명 추가 완료`, 'info');
};

window.msShowUnmatchedModal = function() {
    window._msRenderQueueModal('unmatched');
};

// 💡 [테스트용] 캐시 초기화 후 즉시 재수집 — 그동안 콘솔에서 반복 실행하던 스크립트를 버튼화
window.msForceRefetchForTest = async function() {
    const ok = confirm('⚠️ 테스트 재수집\n\n마지막 수집 기록을 초기화하고 즉시 다시 수집합니다.\nAI 분석이 다시 돌아 API 호출 비용이 발생할 수 있습니다.\n\n계속할까요?');
    if (!ok) return;

    const btn = document.getElementById('ms-test-refetch-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 수집 중...'; }

    try {
        localStorage.removeItem(MS_LAST_AUTO_FETCH_KEY);
        localStorage.removeItem(MS_QUEUE_STORAGE_KEY);
        window._msResults = [];
        const listEl = document.getElementById('ms-result-list');
        if (listEl) listEl.innerHTML = '';
        window._projectIndexCache = { data: null, at: 0 };

        await window._autoMailFetchTick();

        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
        if (window.showToast) {
            window.showToast(window._currentLang === 'en' ? '✅ Test refetch complete' : '✅ 테스트 재수집 완료', 'info');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🧪 테스트 재수집'; }
    }
};

// ─── 메일 자동배치 설정 모달 ──────────────────────────────────────────
// 💡 [2026-08-20] 이 함수(및 아래 _macRenderTitleRows/_macAddKeywordRow/_macRenderKeywordRows/
//    _macClearQueue/_macSave)가 통째로 중복 정의돼 있던 걸 발견해서 정리함. 이전 사본에는
//    "그룹5: 미분류/신규발신자" 섹션이 있었는데, 마지막 정의(=실제로 실행되는 쪽)엔 빠져 있어서
//    설정 모달에서 그 버튼들이 아예 안 보이는 상태였음 — 죽은 사본을 지우면서 그룹5(+신규 그룹6)를
//    살아있는 쪽에 이식.
window.openMailAutoConfigModal = async function() {
    const cfg = await window.loadPriorityConfig();
    let modal = document.getElementById('mail-auto-config-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mail-auto-config-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="mail-auto-config-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:300px;">
            <div id="mail-auto-config-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span>⚙️ 메일 자동배치 설정</span>
                <button onclick="document.getElementById('mail-auto-config-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div style="overflow-y:auto; flex:1; padding:14px 18px; display:flex; flex-direction:column; gap:10px;">

                <!-- ══ 큰그룹1: 수집설정 (기본 접힘) — 옛 그룹1 ══ -->
                <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                    <div onclick="window._toggleAlarmSection('mac-sec-collect')"
                         style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                        <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">⏱️ 수집설정</span>
                        <span id="mac-sec-collect-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                    </div>
                    <div id="mac-sec-collect" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                        <div style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:8px;">
                            <span style="flex:1;">수집 주기</span>
                            <select id="mac-interval" style="padding:3px 6px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                                <option value="10">10분</option>
                                <option value="15">15분</option>
                                <option value="30">30분</option>
                                <option value="60">60분</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:8px;">
                            <span style="flex:1;">📌 핀셋 기준점수 <span style="font-weight:normal; color:#888; font-size:11px;">(이 점수 이상 긴급)</span></span>
                            <input id="mac-cutline" type="number" min="0" max="100" style="width:64px; min-width:0; box-sizing:border-box; padding:3px 6px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                        </div>
                        <!-- 💡 [2026-08-29 신규] "완료로 표시된 프로젝트도 메일 자동매칭 대상에 포함할지"는
                             팀 전체가 아니라 이 브라우저를 쓰는 사람 개인의 선택이라(수집 주기와 같은 성격),
                             mac-interval과 동일하게 localStorage에 개인별로 저장한다(_macSave/getMailAutoCollectCompleted 참고). -->
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input id="mac-collect-completed" type="checkbox" style="width:15px; height:15px; cursor:pointer;">
                            <span style="flex:1;">완료 프로젝트도 수집 대상에 포함</span>
                        </label>
                        <div style="font-size:10.5px; color:#999; margin-top:4px; padding-left:23px;">기본값(체크 해제)은 Summary 탭에서 "완료"로 표시한 프로젝트를 새 메일 자동매칭에서 제외합니다(이미 끝난 프로젝트에 실수로 새 업무가 등록되는 걸 방지). 체크하면 완료 프로젝트도 계속 매칭 대상에 포함됩니다.</div>
                        <!-- 💡 [2026-08-29 이동] AI 업무 보관함 헤더에 있던 "🟠 처리됨 보관 / 🟢 처리됨 자동삭제" 토글을 여기로 옮김 -->
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; margin-top:10px;">
                            <input id="mac-cleanup-auto" type="checkbox" style="width:15px; height:15px; cursor:pointer;">
                            <span style="flex:1;">처리된 업무는 보관함에서 자동삭제</span>
                        </label>
                        <div style="font-size:10.5px; color:#999; margin-top:4px; padding-left:23px;">기본값(체크 해제)은 AI 업무 보관함의 처리된(배치됨/전송됨 등) 항목을 목록에 남겨두고 각 행의 🗑로 직접 지웁니다. 체크하면 처리되는 즉시 목록에서 자동으로 사라집니다.</div>
                    </div>
                </div>

                <!-- ══ 큰그룹2: 가산점수 (기본 접힘) — 옛 그룹2(점수 가산 키워드)+그룹3(우선순위 점수)+그룹4(직급별 점수) 통합 ══ -->
                <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                    <div onclick="window._toggleAlarmSection('mac-sec-score')"
                         style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                        <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">⭐ 가산점수</span>
                        <span id="mac-sec-score-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                    </div>
                    <div id="mac-sec-score" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                        <div style="margin-bottom:14px;">
                            <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:8px;">🚨 점수 가산 키워드 <span style="font-weight:normal; color:#888; font-size:11px;">(키워드별 점수 지정)</span></div>
                            <div id="mac-keyword-rows" style="margin-bottom:4px;"></div>
                            <button onclick="window._macAddKeywordRow('',5)" style="padding:3px 10px; background:#fff; border:1px solid #ccc; border-radius:6px; font-size:11px; cursor:pointer; margin-top:2px;">+ 키워드 추가</button>
                        </div>
                        <div style="margin-bottom:14px;">
                            <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:10px;">📊 우선순위 점수</div>
                            <div style="display:grid; grid-template-columns:1fr 64px; gap:6px 10px; align-items:center; font-size:12px;">
                                <span>외부(고객사) 발신 가산</span><input id="mac-external" type="number" style="width:100%; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                                <span>To(직접수신) 가산</span><input id="mac-tome" type="number" style="width:100%; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                                <span>Cc(참조) 가산</span><input id="mac-ccme" type="number" style="width:100%; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                                <span>중요도 헤더(Outlook 높음) 가산</span><input id="mac-importance" type="number" style="width:100%; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                            </div>
                        </div>
                        <div>
                            <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:8px;">👤 직급별 점수</div>
                            <div id="mac-title-rows" style="max-height:140px; overflow-y:auto; margin-bottom:4px; padding-right:4px;"></div>
                        </div>
                    </div>
                </div>

                <!-- 💡 [2026-08-20] "미분류/신규발신자/자동폐기 열람" 그룹은 업무 보관함 모달에도 동일하게
                     있어서(중복) 사용자 요청으로 여기서는 제거 — 그 큐들은 업무 보관함 쪽에서만 연다. -->

                <!-- ══ 큰그룹3: 자동폐기 필터 (기본 접힘) — 옛 그룹5 ══ -->
                <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                    <div onclick="window._toggleAlarmSection('mac-sec-filter')"
                         style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                        <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">🚫 자동폐기 필터</span>
                        <span id="mac-sec-filter-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                    </div>
                    <div id="mac-sec-filter" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                        <div style="font-size:10.5px; color:#999; margin-bottom:8px;">완전자동 수집 시 AI 호출 전에 이 규칙에 걸리면 조용히 버려집니다(비용 절감). 🗑 자동폐기/👤 신규발신자 큐에서도 "규칙 추가"로 바로 등록할 수 있습니다.</div>

                        <div style="margin-bottom:10px;">
                            <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px;">제목 키워드</div>
                            <div id="mac-filter-subject-rows" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;"></div>
                            <div style="display:flex; gap:4px;">
                                <input id="mac-filter-subject-input" type="text" placeholder="예: [광고]" style="flex:1; padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px;">
                                <button onclick="window._macAddFilterRuleFromInput('subjectKeywords','mac-filter-subject-input')" style="padding:3px 10px; background:#fff; border:1px solid #ccc; border-radius:6px; font-size:11px; cursor:pointer;">+ 추가</button>
                            </div>
                        </div>

                        <div style="margin-bottom:10px;">
                            <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px;">발신자 패턴 (noreply 등)</div>
                            <div id="mac-filter-noreply-rows" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;"></div>
                            <div style="display:flex; gap:4px;">
                                <input id="mac-filter-noreply-input" type="text" placeholder="예: noreply" style="flex:1; padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px;">
                                <button onclick="window._macAddFilterRuleFromInput('noreplyPatterns','mac-filter-noreply-input')" style="padding:3px 10px; background:#fff; border:1px solid #ccc; border-radius:6px; font-size:11px; cursor:pointer;">+ 추가</button>
                            </div>
                        </div>

                        <div>
                            <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px;">발신자 도메인 완전차단</div>
                            <div id="mac-filter-domain-rows" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;"></div>
                            <div style="display:flex; gap:4px;">
                                <input id="mac-filter-domain-input" type="text" placeholder="예: spam-mailer.com" style="flex:1; padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px;">
                                <button onclick="window._macAddFilterRuleFromInput('blockedDomains','mac-filter-domain-input')" style="padding:3px 10px; background:#fff; border:1px solid #ccc; border-radius:6px; font-size:11px; cursor:pointer;">+ 추가</button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px;">
                <button onclick="window._macSave()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:6px 18px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold; transition:background .15s, border-color .15s;">저장</button>
                <button onclick="document.getElementById('mail-auto-config-modal').style.display='none'" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; border:1px solid #ccc; background:#f8f9fa; color:#555; border-radius:4px; cursor:pointer; font-size:12.5px; transition:background .15s;">닫기</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('mail-auto-config-box', 'mail-auto-config-drag');
        window._bindClickToFront('mail-auto-config-modal');
    }

    // 값 채우기
    document.getElementById('mac-interval').value = window.getMailAutoInterval ? window.getMailAutoInterval() : 30;
    document.getElementById('mac-collect-completed').checked = window.getMailAutoCollectCompleted ? window.getMailAutoCollectCompleted() : false;
    document.getElementById('mac-cleanup-auto').checked = (window.getInboxCleanupMode ? window.getInboxCleanupMode() : 'keep') === 'auto';
    document.getElementById('mac-external').value   = cfg.externalCustomerScore;
    document.getElementById('mac-tome').value       = cfg.toMeScore;
    document.getElementById('mac-ccme').value       = cfg.ccMeScore;
    document.getElementById('mac-importance').value = cfg.importanceHighScore;
    document.getElementById('mac-cutline').value    = cfg.cutline;
    window._macRenderTitleRows(cfg.titleScores);
    window._macRenderKeywordRows(cfg.urgentKeywords);
    // 💡 미분류/신규발신자/자동폐기 큐 열람은 업무 보관함 모달에만 있음(중복 제거) — 이 모달에선 필터 규칙만 갱신
    if (window._macRenderFilterRules) window._macRenderFilterRules();

    modal.style.display = 'block';
    window.bringModalToFront('mail-auto-config-modal');
};

window._macRenderTitleRows = function(titleScores) {
    document.getElementById('mac-title-rows').innerHTML =
        Object.keys(titleScores).map(t => `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:12px;">
            <span style="flex:1;">${t}</span>
            <input class="mac-title-score" data-title="${t}" type="number" value="${titleScores[t]}"
                style="width:64px; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px; text-align:center;">
        </div>`).join('');
};

window._macAddKeywordRow = function(word, score) {
    const box = document.getElementById('mac-keyword-rows');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';
    row.innerHTML = `
        <input class="mac-kw-word" type="text" value="${word}" placeholder="키워드"
            style="flex:1; padding:4px 7px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
        <input class="mac-kw-score" type="number" value="${score}"
            style="width:64px; min-width:0; box-sizing:border-box; padding:4px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
        <button onclick="this.parentElement.remove()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:11px; transition:background .15s, border-color .15s;">🗑</button>`;
    box.appendChild(row);
};

window._macRenderKeywordRows = function(kws) {
    document.getElementById('mac-keyword-rows').innerHTML = '';
    (kws || []).forEach(k => window._macAddKeywordRow(k.word, k.score));
};

window._macClearQueue = function(type) {
    const label = type === 'unmatched' ? '미분류' : type === 'discarded' ? '자동폐기' : '신규발신자';
    if (!confirm(`${label} 큐를 초기화할까요?`)) return;
    if (type === 'unmatched') {
        window._msResults = (window._msResults || []).filter(r => r.project);
        window._msSaveQueueToStorage();
    } else if (type === 'discarded') {
        localStorage.removeItem('ms_discard_queue');
    } else {
        localStorage.removeItem('ms_new_sender_queue');
    }
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    if (window.showToast) window.showToast(`✅ ${label} 초기화 완료`, 'info');
};

// 💡 [신규] 필터 규칙 3종(제목키워드/발신자패턴/도메인차단)을 칩 형태로 렌더링 + 개별 삭제
window._macRenderFilterRules = function() {
    const rules = window._msGetFilterRules();
    const renderChips = (containerId, type, list) => {
        const box = document.getElementById(containerId);
        if (!box) return;
        box.innerHTML = list.length ? list.map((v, i) => `
            <span style="display:inline-flex; align-items:center; gap:2px; background:#f1f3f5; border:1px solid #dee2e6; border-radius:12px; padding:2px 4px 2px 8px; font-size:11px;">
                ${_msQEsc(v)}
                <button onclick="window._macRemoveFilterRule('${type}', ${i})" title="삭제" style="background:none; border:none; color:#e03131; cursor:pointer; font-size:13px; line-height:1; padding:0 4px;">×</button>
            </span>`).join('') : '<span style="font-size:10.5px; color:#bbb;">등록된 규칙 없음(기본값 사용 안 함)</span>';
    };
    renderChips('mac-filter-subject-rows', 'subjectKeywords', rules.subjectKeywords);
    renderChips('mac-filter-noreply-rows', 'noreplyPatterns', rules.noreplyPatterns);
    renderChips('mac-filter-domain-rows', 'blockedDomains', rules.blockedDomains);
};

window._macAddFilterRuleFromInput = function(type, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const v = input.value.trim();
    if (!v) return;
    const added = window._msAddFilterRule(type, v);
    input.value = '';
    window._macRenderFilterRules();
    if (window.showToast) window.showToast(added ? `✅ 규칙 추가됨: ${v}` : `이미 등록된 규칙입니다`, added ? 'info' : 'error');
};

window._macRemoveFilterRule = function(type, idx) {
    const rules = window._msGetFilterRules();
    rules[type].splice(idx, 1);
    window._msSaveFilterRules(rules);
    window._macRenderFilterRules();
};

window._macSave = async function() {
    // 수집 주기
    const sel = document.getElementById('mac-interval');
    if (sel) {
        localStorage.setItem('mail_auto_process_interval_min', sel.value);
        const orig = document.getElementById('mail-process-interval');
        if (orig) orig.value = sel.value;
    }

    // 완료 프로젝트 수집 여부
    const collectCompletedEl = document.getElementById('mac-collect-completed');
    if (collectCompletedEl) localStorage.setItem('mail_auto_collect_completed', collectCompletedEl.checked ? '1' : '0');

    // 처리됨 업무 자동삭제 여부 (예전엔 업무 보관함 헤더의 토글 버튼 — 2026-08-29 여기로 이동)
    const cleanupAutoEl = document.getElementById('mac-cleanup-auto');
    if (cleanupAutoEl) localStorage.setItem('inbox_cleanup_mode', cleanupAutoEl.checked ? 'auto' : 'keep');

    // 우선순위 점수
    const titleScores = {};
    document.querySelectorAll('.mac-title-score').forEach(el => {
        titleScores[el.dataset.title] = parseInt(el.value, 10) || 0;
    });
    const urgentKeywords = [];
    document.querySelectorAll('#mac-keyword-rows > div').forEach(row => {
        const word = row.querySelector('.mac-kw-word').value.trim();
        const score = parseInt(row.querySelector('.mac-kw-score').value, 10) || 0;
        if (word) urgentKeywords.push({ word, score });
    });
    const newConfig = {
        titleScores,
        urgentKeywords,
        externalCustomerScore: parseInt(document.getElementById('mac-external').value, 10) || 0,
        toMeScore:             parseInt(document.getElementById('mac-tome').value, 10) || 0,
        ccMeScore:             parseInt(document.getElementById('mac-ccme').value, 10) || 0,
        importanceHighScore:   parseInt(document.getElementById('mac-importance').value, 10) || 0,
        cutline: Math.max(0, Math.min(100, parseInt(document.getElementById('mac-cutline').value, 10) || 50))
    };
    const ok = await window.savePriorityConfig(newConfig);
    if (window.showToast) window.showToast(ok ? '✅ 저장 완료' : '⚠️ 저장 실패 (콘솔 확인)', ok ? 'info' : 'error');
    if (ok) document.getElementById('mail-auto-config-modal').style.display = 'none';
};

window.msShowNewSenderModal = function() {
    window._msRenderQueueModal('newsender');
};

window.msShowDiscardedModal = function() {
    window._msRenderQueueModal('discarded');
};

// ─── [메일 자동처리 ①] 스케줄러 — 1분마다 체크, 설정된 주기(기본 30분) 경과 시에만 실행 ──
window._startMailAutoScheduler = function() {
    setInterval(function() {
        const intervalMin = window.getMailAutoInterval ? window.getMailAutoInterval() : 30;
        const lastAt = localStorage.getItem(MS_LAST_AUTO_FETCH_KEY);
        const elapsedMin = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 60000 : Infinity;
        if (elapsedMin >= intervalMin) window._autoMailFetchTick();
    }, 60 * 1000);
};

// ─── 메일서버 분석 중단 (지금까지 분석된 내용은 그대로 유지) ─────────
window.msStopAnalysis = function() {
    window._msAnalyzeCancelled = true;
};

// ─── 메일서버 강제 초기화 (로딩 멈춤 시 탈출용) ──────────────
window.msForceReset = function() {
    window._msAnalyzeCancelled = true;
    window._msResults = [];
    document.getElementById('ms-progress').style.display      = 'none';
    document.getElementById('ms-list-header').style.display   = 'none';
    document.getElementById('ms-result-list').innerHTML       = '';
    document.getElementById('ms-result-list').style.display   = 'none';
    document.getElementById('ms-batch-btn').style.display     = 'none';
    document.getElementById('ms-batch-inbox-btn').style.display = 'none';
    document.getElementById('ms-status').textContent          = (window._currentLang === 'en' ? '🔄 Reset complete' : '🔄 초기화 완료');
    document.getElementById('ms-prog-bar').style.width        = '0%';
};

// ─── 메일서버 분석결과 목록 초기화 ─────────────────────────
window.msClearResults = function() {
    if (!window._msResults || !window._msResults.length) return;
    // 💡 등록된 항목의 실제 Gantt 데이터는 지워지지 않아 확인창 없이 바로 진행
    window._msResults = [];
    document.getElementById('ms-result-list').style.display = 'none';
    document.getElementById('ms-list-header').style.display = 'none';
    document.getElementById('ms-batch-btn').style.display = 'none';
    document.getElementById('ms-batch-inbox-btn').style.display = 'none';
    document.getElementById('mail-right-empty').style.display = 'flex';
    document.getElementById('mail-right-detail').style.display = 'none';
};

// ─── 목록 렌더링 (파일첨부 탭과 동일 구조) ──────────────

window.msDeleteItem = function(idx) {
    const r = window._msResults[idx];
    if (!r) return;
    const label = r.task ? (r.task['업무명'] || '새업무') : r.subject;
    if (!confirm(`"${label}"\n이 분석 항목을 목록에서 삭제하시겠습니까?\n(등록된 항목이라도 Gantt Chart의 실제 데이터는 지워지지 않습니다)`)) return;
    window._msResults.splice(idx, 1);
    msRenderList(window._msResults);
};
function msRenderList(results) {
    const list = document.getElementById('ms-result-list');
    let html = '';
    results.forEach((r, i) => {
        const canSel = !!r.task;
        const bg     = r.registered ? '#d4edda' : canSel ? '#fff' : '#fafafa';
        const taskName = r.task ? (r.task['업무명'] || '새업무') : null;
        html += `
        <div id="ms-list-item-${i}" data-idx="${i}"
             style="display:flex; align-items:center; gap:6px;
                    padding:7px 8px; border-bottom:1px solid #f0f0f0;
                    background:${bg}; cursor:pointer;">
            <input type="checkbox" data-idx="${i}"
                   ${canSel && r.selected ? 'checked' : ''}
                   ${canSel ? '' : 'disabled'} style="flex-shrink:0;">
            <span style="font-size:10px; color:#aaa; flex-shrink:0; width:16px;">${i+1}</span>
            <div style="flex:1; min-width:0;">
                <div style="font-size:12px; font-weight:${canSel?'bold':'normal'};
                            color:${canSel?'#333':'#aaa'};
                            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${canSel ? escapeHtml(taskName) + ' 📧' : escapeHtml(r.subject.substring(0,35))}
                </div>
                <div style="display:flex; gap:4px; margin-top:2px; flex-wrap:wrap;">
                    <span style="font-size:10px; color:#aaa;">${r.date||''}</span>
                    ${r.project
                        ? `<span style="background:#e7f3ff; color:#0056b3; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold;">${r.project}</span>`
                        : `<span style="color:#dc3545; font-size:10px;">${r.error||''}</span>`}
                    ${r.registered
                        ? `<span style="color:#28a745; font-size:10px; font-weight:bold;">✅등록완료</span>`
                        : `<span style="color:#999; font-size:10px;">⬜미등록</span>`}
                </div>
            </div>
            <button data-del-idx="${i}" title="목록에서 삭제"
                    style="flex-shrink:0; border:none; background:none; color:#bbb; cursor:pointer; font-size:13px; padding:2px 4px;"
                    onmouseover="this.style.color='#dc3545'" onmouseout="this.style.color='#bbb'">🗑</button>
        </div>`;
    });

    list.innerHTML = html || '<div style="padding:20px; text-align:center; color:#aaa;">결과 없음</div>';

    results.forEach((r, i) => {
        const row = document.getElementById(`ms-list-item-${i}`);
        if (!row) return;
        row.addEventListener('click', function(e) {
            if (e.target.type === 'checkbox' || e.target.dataset.delIdx !== undefined) return;
            window.msSelectItem(i);
        });
        const delBtn = row.querySelector('[data-del-idx]');
        if (delBtn) {
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                window.msDeleteItem(i);
            });
        }
        const cb = row.querySelector('input[type=checkbox]');
        if (cb) cb.addEventListener('change', function() {
            window._msResults[i].selected = this.checked;
            window.msSyncCheckAll();
        });
        row.addEventListener('mouseover', function() {
            if (!this.classList.contains('ms-active')) this.style.background = '#e7f3ff';
        });
        row.addEventListener('mouseout', function() {
            if (!this.classList.contains('ms-active')) {
                this.style.background = window._msResults[i].registered ? '#d4edda' : (window._msResults[i].task ? '#fff' : '#fafafa');
            }
        });
    });
}

// ─── 항목 선택 → 오른쪽 패널 ────────────────────────────
window.msSelectItem = function(idx) {
    const r = window._msResults[idx];
    if (!r || !r.task) return;

    // 활성 항목 하이라이트
    if (window._msCurrentIdx >= 0) {
        const prev = document.getElementById(`ms-list-item-${window._msCurrentIdx}`);
        if (prev) { prev.classList.remove('ms-active'); prev.style.background = window._msResults[window._msCurrentIdx]?.registered ? '#d4edda' : '#fff'; }
    }
    window._msCurrentIdx = idx;
    const cur = document.getElementById(`ms-list-item-${idx}`);
    if (cur) { cur.classList.add('ms-active'); cur.style.background = '#fff3e0'; }

    // 공통 오른쪽 패널 표시
    mailShowRightDetail(r.subject, r.sender, r.date||'', r.body||'', r.project, r.task, () => {
        r.task = JSON.parse(JSON.stringify(window._mailAnalyzedResult));
        if (!mfDirectInsert(r.task, r.mailRaw || window._mailParsedRaw)) return;
        r.registered = true;
        const item = document.getElementById(`mf-list-item-${idx}`);
        if (item) {
            item.style.background = '#d4edda';
            const badge = item.querySelector('div > div:last-child');
            if (badge) {
                const existing = badge.querySelector('.reg-badge');
                if (!existing) badge.innerHTML += `<span class="reg-badge" style="color:#dc3545;font-size:10px;font-weight:bold;">🔴 개별등록완료</span>`;
            }
            const cb = item.querySelector('input[type=checkbox]');
            if (cb) cb.checked = false;
        }
        window._mfResults[idx].selected = false;
        window._msCurrentIdx = -1;
        mfDirectInsert(r.task, r.mailRaw);
        window.recalculateSchedules();
    }, r.mailRaw);
};

// msRightInsert → mailRightInsert 으로 통합

window.msBatchInsert = async function() {
    // 1. 제외 로직: 날짜가 없는 항목 필터링
    const validTargets = window._msResults.filter(r => 
        r.selected && r.task && !r.registered &&
        !( (r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요') )
    );

    const excludedCount = window._msResults.filter(r => r.selected && r.task && !r.registered).length - validTargets.length;

    if (!validTargets.length) {
        alert(excludedCount > 0 ? '⚠️ 날짜가 없는 항목은 등록할 수 없습니다. (제외됨)' : '등록할 항목을 체크해주세요.');
        return;
    }

    // 2. 미리보기 검토 안전장치
    let previewMsg = `✅ 총 ${validTargets.length}개 항목을 일괄 등록합니다.\n`;
    if (excludedCount > 0) previewMsg += `\n⚠️ 날짜가 없는 ${excludedCount}개 항목은 자동으로 제외되었습니다.`;
    previewMsg += '\n\n[등록할 업무 목록]\n' + validTargets.map(r => '• ' + (r.task['업무명']||'새업무')).join('\n');
    
    if (!confirm(previewMsg + '\n\n위 내용으로 등록하시겠습니까?')) return;

    // 3. 등록 실행
    for (let i = window._msResults.length - 1; i >= 0; i--) {
        const r = window._msResults[i];
        if (validTargets.includes(r)) {
            try {
                if (mfDirectInsert(r.task, r.mailRaw)) {
                    r.registered = true;
                    r.selected = false;
                }
            } catch(e) { console.error(e); }
        }
    }

    msRenderList(window._msResults);
    window.recalculateSchedules();
    alert(`✅ ${validTargets.length}개 항목이 등록되었습니다!`);
};

window.msSyncCheckAll = function() {
    const all = document.querySelectorAll('#ms-result-list input[type=checkbox]:not(:disabled)');
    const chk = document.querySelectorAll('#ms-result-list input[type=checkbox]:not(:disabled):checked');
    const ca  = document.getElementById('ms-check-all');
    if (ca) ca.checked = all.length > 0 && all.length === chk.length;
};

window.msSelectAll = function(select) {
    document.querySelectorAll('#ms-result-list input[type=checkbox]:not(:disabled)')
        .forEach(cb => {
            cb.checked = select;
            const idx = parseInt(cb.dataset.idx);
            if (!isNaN(idx)) window._msResults[idx].selected = select;
        });
};

// ═══════════════════════════════════════════════════════════
// 🧩 AR: 직접입력/파일첨부/메일서버 3탭 공용 분석결과 목록 엔진
//    렌더링/체크박스/삭제/일괄등록/실패항목 수동전환을 여기 한 곳에서만 관리.
//    아래에서 mf*/ms*/paste* 기존 함수들을 이 엔진으로 재연결합니다.
// ═══════════════════════════════════════════════════════════
window._pasteCurrentIdx = -1;

const AR = {
    cfg: {
        mf: {
            getArr: () => window._mfResults,
            listId: 'mf-result-list', headerId: 'mf-list-header', checkAllId: 'mf-check-all',
            batchBtnId: 'mf-batch-btn', batchInboxBtnId: 'mf-batch-inbox-btn', countId: 'mf-result-count', activeClass: 'mf-active',
            getCurIdx: () => window._mfCurrentIdx, setCurIdx: (v) => window._mfCurrentIdx = v,
        },
        ms: {
            getArr: () => window._msResults,
            listId: 'ms-result-list', headerId: 'ms-list-header', checkAllId: 'ms-check-all',
            batchBtnId: 'ms-batch-btn', batchInboxBtnId: 'ms-batch-inbox-btn', countId: null, activeClass: 'ms-active',
            getCurIdx: () => window._msCurrentIdx, setCurIdx: (v) => window._msCurrentIdx = v,
        },
        paste: {
            getArr: () => window._pasteResults,
            listId: 'paste-result-list', headerId: 'paste-result-header', checkAllId: 'paste-check-all',
            batchBtnId: 'paste-batch-btn', batchInboxBtnId: 'paste-batch-inbox-btn', countId: 'paste-result-count', activeClass: 'paste-active',
            getCurIdx: () => window._pasteCurrentIdx, setCurIdx: (v) => window._pasteCurrentIdx = v,
        },
    },

    render(tabKey) {
        const c = AR.cfg[tabKey];
        const arr = c.getArr() || [];
        const list = document.getElementById(c.listId);
        const header = document.getElementById(c.headerId);
        const batchBtn = document.getElementById(c.batchBtnId);
        const batchInboxBtn = document.getElementById(c.batchInboxBtnId);
        if (!list) return;

        if (!arr.length) {
            list.style.display = 'none';
            if (header) header.style.display = 'none';
            if (batchBtn) batchBtn.style.display = 'none';
            if (batchInboxBtn) batchInboxBtn.style.display = 'none';
            list.innerHTML = '';
            return;
        }

        list.innerHTML = arr.map((r, i) => {
            const canSel = !!r.task;
            const bg = r.registered ? '#d4edda' : canSel ? '#fff' : '#fafafa';
            const taskName = r.task ? (r.task['업무명'] || '새업무') : null;
            return `
            <div id="${tabKey}-list-item-${i}" data-idx="${i}"
                 style="display:flex; align-items:center; gap:6px; padding:7px 8px; border-bottom:1px solid #f0f0f0;
                        background:${bg}; cursor:pointer; transition:background 0.15s;">
                <input type="checkbox" data-idx="${i}" ${canSel && r.selected ? 'checked':''} ${canSel ? '' : 'disabled'} style="flex-shrink:0;">
                <span style="font-size:10px; color:#aaa; flex-shrink:0; width:16px;">${i+1}</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:12px; font-weight:${canSel?'bold':'normal'}; color:${canSel?'#333':'#aaa'};
                                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${canSel ? escapeHtml(taskName) + ' 📧' : escapeHtml((r.subject||'').substring(0,35))}
                    </div>
                    <div style="display:flex; gap:4px; margin-top:2px; flex-wrap:wrap;">
                        ${r.date ? `<span style="font-size:10px; color:#aaa;">${r.date}</span>` : ''}
                        ${r.project
                            ? `<span style="background:#e7f3ff; color:#0056b3; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold;">${r.project}</span>`
                            : (!canSel ? `<span style="color:#dc3545; font-size:10px;">${r.error||''}</span>` : '')}
                        ${typeof r._score === 'number'
                            ? `<span title="우선순위 점수" style="background:#fff3cd; color:#856404; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold;">${r._scoreGrade||''}${r._score}점</span>`
                            : ''}
                        ${(function() {
                            const cat = r.task && (r.task['담당구분'] || '').trim();
                            if (!cat || cat === '미분류') return '';
                            const isCurProj = r._projectTag && r._projectTag.candidates && r._projectTag.candidates[0]
                                && r._projectTag.candidates[0].drive_file_id === window.currentDriveFileId;
                            const resolved = isCurProj && window._msResolveCategoryAssignee ? window._msResolveCategoryAssignee(cat) : null;
                            return `<span title="담당구분" style="background:#f1ebff; color:#6f42c1; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold;">👤${escapeHtml(cat)}${resolved && resolved.name ? ' ('+escapeHtml(resolved.name)+')' : ''}</span>`;
                        })()}
                        ${r.task && r.task['시작일']
                            ? `<span style="font-size:10px; color:#888;">${r.task['시작일'].includes('날짜확인필요') ? '⚠️날짜필요' : r.task['시작일']}</span>`
                            : ''}
                        ${r.registered
                            ? `<span style="color:#28a745; font-size:10px; font-weight:bold;">✅등록완료</span>`
                            : `<span style="color:#999; font-size:10px;">⬜미등록</span>`}
                    </div>
                </div>
                <button data-del-idx="${i}" title="목록에서 삭제"
                        style="flex-shrink:0; border:none; background:none; color:#bbb; cursor:pointer; font-size:13px; padding:2px 4px;"
                        onmouseover="this.style.color='#dc3545'" onmouseout="this.style.color='#bbb'">🗑</button>
            </div>`;
        }).join('');

        if (header) header.style.display = 'flex';
        list.style.display = 'block';
        if (batchBtn) batchBtn.style.display = 'block';
        if (batchInboxBtn) batchInboxBtn.style.display = 'block';
        if (c.countId) { const el = document.getElementById(c.countId); if (el) el.textContent = arr.length; }
        AR.syncCheckAll(tabKey);

        arr.forEach((r, i) => {
            const row = document.getElementById(`${tabKey}-list-item-${i}`);
            if (!row) return;
            row.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox' || e.target.dataset.delIdx !== undefined) return;
                AR.selectItem(tabKey, i);
            });
            const delBtn = row.querySelector('[data-del-idx]');
            if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); AR.deleteItem(tabKey, i); });
            const cb = row.querySelector('input[type=checkbox]');
            if (cb) cb.addEventListener('change', function() { AR.toggleCheck(tabKey, i, this.checked); });
            row.addEventListener('mouseover', function() { if (!this.classList.contains(c.activeClass)) this.style.background = '#e7f3ff'; });
            row.addEventListener('mouseout', function() {
                if (!this.classList.contains(c.activeClass)) {
                    const rr = c.getArr()[i];
                    this.style.background = rr.registered ? '#d4edda' : (rr.task ? '#fff' : '#fafafa');
                }
            });
        });
    },

    toggleCheck(tabKey, idx, checked) {
        const arr = AR.cfg[tabKey].getArr();
        if (arr && arr[idx]) arr[idx].selected = checked;
        AR.syncCheckAll(tabKey);
    },

    syncCheckAll(tabKey) {
        const c = AR.cfg[tabKey];
        const all = document.querySelectorAll(`#${c.listId} input[type=checkbox]:not(:disabled)`);
        const chk = document.querySelectorAll(`#${c.listId} input[type=checkbox]:not(:disabled):checked`);
        const ca = document.getElementById(c.checkAllId);
        if (ca) ca.checked = all.length > 0 && all.length === chk.length;
    },

    selectAll(tabKey, select) {
        const c = AR.cfg[tabKey];
        const arr = c.getArr();
        document.querySelectorAll(`#${c.listId} input[type=checkbox]:not(:disabled)`).forEach(cb => {
            cb.checked = select;
            const idx = parseInt(cb.dataset.idx);
            if (!isNaN(idx) && arr[idx]) arr[idx].selected = select;
        });
    },

    deleteItem(tabKey, idx) {
        const arr = AR.cfg[tabKey].getArr();
        const r = arr[idx];
        if (!r) return;
        // 💡 목록에서 빼는 것뿐, 등록된 항목의 실제 Gantt 데이터는 지워지지 않아 확인창 없이 바로 진행
        arr.splice(idx, 1);
        AR.render(tabKey);
    },

    retryAsManual(tabKey, idx) {
        const r = AR.cfg[tabKey].getArr()[idx];
        if (!r) return;
        r.task = {
            '업무명': r.subject || '새 업무',
            '시작일': '날짜확인필요', '완료일': '날짜확인필요',
            '상태': '진행', '개발단계': '', '상세내용': r.body || '',
            'wbs레벨': 4
        };
        r.selected = true;
        r.error = null;
        AR.render(tabKey);
        AR.selectItem(tabKey, idx);
    },

    moveToDirectInput(tabKey, idx) {
        const r = AR.cfg[tabKey].getArr()[idx];
        if (!r || !r.body) return;
        // 직접 입력 탭으로 전환
        window.switchMailTab('paste');
        // 본문 복사
        const inp = document.getElementById('mail-content-input');
        if (inp) {
            inp.value = (r.subject ? r.subject + '\n\n' : '') + r.body;
            inp.dispatchEvent(new Event('input'));
        }
        // 오른쪽 패널 초기화
        const emptyEl = document.getElementById('mail-right-empty');
        const detailEl = document.getElementById('mail-right-detail');
        if (emptyEl) emptyEl.style.display = 'flex';
        if (detailEl) detailEl.style.display = 'none';
    },

    selectItem(tabKey, idx) {
        const c = AR.cfg[tabKey];

        // 📌 다른 항목으로 넘어가기 전에, 지금 보고 있던 항목에서 고친 내용(날짜 등)을 먼저 저장
        //    (안 그러면 "등록" 없이 목록만 이동해도 방금 고친 날짜/내용이 사라짐)
        const prevIdxForSave = c.getCurIdx();
        if (prevIdxForSave >= 0 && prevIdxForSave !== idx && window._mailAnalyzedResult) {
            const prevArr = c.getArr();
            if (prevArr[prevIdxForSave] && prevArr[prevIdxForSave].task) {
                prevArr[prevIdxForSave].task = JSON.parse(JSON.stringify(window._mailAnalyzedResult));
            }
        }
        const r = c.getArr()[idx];
        if (!r) return;

        if (!r.task) {
            const _mfEn2 = window._currentLang === 'en';
            const bodyTooShort = !r.body || r.body.trim().length < 20;
            const mfHint = (tabKey === 'mf' && bodyTooShort)
                ? `<div style="font-size:11px; color:#e67e22; margin-top:8px; padding:6px 8px; background:#fff8e6; border-radius:4px;">
                     💡 ${_mfEn2 ? 'Very little body text was extracted. If this is an IMAP account mail, retrying from the [Mail Server] tab above may recognize it better.' : '본문이 거의 추출되지 않았습니다. 이 메일이 IMAP 계정 메일이라면 상단 [메일서버] 탭에서 다시 시도하면 더 잘 인식될 수 있습니다.'}
                   </div>`
                : '';
            const emptyEl = document.getElementById('mail-right-empty');
            if (emptyEl) emptyEl.innerHTML =
                `<div style="font-size:32px;">⚠️</div>
                 <div style="font-size:13px; font-weight:bold; color:#dc3545; margin-top:8px;">${escapeHtml(r.error || (_mfEn2 ? 'AI analysis failed' : 'AI 분석 실패'))}</div>
                 <div style="font-size:11px; color:#aaa; margin-top:4px;">${escapeHtml(r.subject||'')}</div>
                 ${mfHint}
                 ${r.body ? `
                 <div style="text-align:left; width:100%; align-self:stretch; box-sizing:border-box; margin-top:14px; padding-top:10px; border-top:1px solid #eee; display:flex; flex-direction:column; flex:1; min-height:0;">
                    <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px; flex-shrink:0;">📄 ${_mfEn2 ? 'Extracted mail body (kept even if analysis failed)' : '추출된 메일 본문 (분석 실패 시에도 원문은 보존됩니다)'}</div>
                    <div style="flex:1; min-height:80px; max-height:45vh; overflow-y:auto; overflow-x:hidden; font-size:11px; color:#666; white-space:pre-wrap; overflow-wrap:break-word; word-break:break-word; background:#f8f9fa; border:1px solid #eee; border-radius:6px; padding:8px; box-sizing:border-box;">${escapeHtml(r.body)}</div>
                    <button class="action-btn" onclick="AR.retryAsManual('${tabKey}', ${idx})" style="margin-top:8px; font-size:13px; width:100%; box-sizing:border-box; flex-shrink:0;">✏️ ${_mfEn2 ? 'Register as-is (manual)' : '본문으로 직접 등록'}</button>
                    <button class="action-btn" onclick="AR.moveToDirectInput('${tabKey}', ${idx})" style="margin-top:4px; font-size:13px; width:100%; box-sizing:border-box; background:#fff; color:#2c5f8a; border-color:#2c5f8a; flex-shrink:0;">🔄 ${_mfEn2 ? 'Move to Direct Input & re-analyze' : '직접 입력 탭으로 이동해서 AI 분석'}</button>
                 </div>` : `<div style="font-size:11px; color:#bbb; margin-top:10px;">${_mfEn2 ? 'Could not extract body.' : '본문을 추출하지 못했습니다.'}</div>`}`;
            document.getElementById('mail-right-empty').style.display = 'flex';
            document.getElementById('mail-right-detail').style.display = 'none';
            return;
        }

        const prevIdx = c.getCurIdx();
        if (prevIdx >= 0) {
            const prev = document.getElementById(`${tabKey}-list-item-${prevIdx}`);
            const prevR = c.getArr()[prevIdx];
            if (prev) { prev.classList.remove(c.activeClass); prev.style.background = prevR?.registered ? '#d4edda' : '#fff'; }
        }
        c.setCurIdx(idx);
        const cur = document.getElementById(`${tabKey}-list-item-${idx}`);
        if (cur) { cur.classList.add(c.activeClass); cur.style.background = '#fff3e0'; }

        mailShowRightDetail(r.subject||'직접입력', r.sender||'', r.date||'', r.body||r.mailText||'', r.project, r.task, () => {
            if (window._mailAnalyzedResult) r.task = JSON.parse(JSON.stringify(window._mailAnalyzedResult));
            if (!mfDirectInsert(r.task, r.mailRaw || window._mailParsedRaw, r._alarmWorthy)) return;
            r.registered = true;
            r.selected = false;
            c.setCurIdx(-1);
            AR.render(tabKey);
            document.getElementById('mail-right-empty').style.display = 'flex';
            document.getElementById('mail-right-detail').style.display = 'none';
            window.recalculateSchedules();
        }, r.mailRaw);
    },

    batchInsert(tabKey) {
        const c = AR.cfg[tabKey];
        const arr = c.getArr();
        const validTargets = arr.filter(r =>
            r.selected && r.task && !r.registered &&
            !( (r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요') )
        );
        const excludedCount = arr.filter(r => r.selected && r.task && !r.registered).length - validTargets.length;

        if (!validTargets.length) {
            alert(excludedCount > 0 ? '⚠️ 날짜가 없는 항목은 등록할 수 없습니다. (제외됨)' : '등록할 항목을 체크해주세요.');
            return;
        }

        let previewMsg = `✅ 총 ${validTargets.length}개 항목을 일괄 등록합니다.\n`;
        if (excludedCount > 0) previewMsg += `\n⚠️ 날짜가 없는 ${excludedCount}개 항목은 자동으로 제외되었습니다.`;
        previewMsg += '\n\n[등록할 업무 목록]\n' + validTargets.map(r => '• ' + (r.task['업무명']||'새업무')).join('\n');
        if (!confirm(previewMsg + '\n\n위 내용으로 등록하시겠습니까?')) return;

        for (let i = arr.length - 1; i >= 0; i--) {
            const r = arr[i];
            if (r.selected && r.task && !r.registered) {
                if (c.getCurIdx() === i && window._mailAnalyzedResult) r.task = window._mailAnalyzedResult;
                if (mfDirectInsert(r.task, r.mailRaw || window._mailParsedRaw, r._alarmWorthy)) { r.registered = true; r.selected = false; }
            }
        }

        AR.render(tabKey);
        window.recalculateSchedules();
        alert(`✅ ${validTargets.length}개 항목이 등록되었습니다!`);
    },

    // 💡 체크한 항목들을 Gantt에 등록하지 않고 "업무 보관함"으로 한 번에 이동
    batchToInbox(tabKey) {
        const c = AR.cfg[tabKey];
        const arr = c.getArr();
        const validTargets = arr.filter(r => r.selected && r.task && !r.registered);
        if (!validTargets.length) { alert('보관함으로 옮길 항목을 체크해주세요.'); return; }

        // 💡 날짜 미확정 항목이 섞여 있으면 미리 알려줌 — "다른 프로젝트 전송" 시점까지 기다리지 않게
        const incomplete = validTargets.filter(r =>
            (r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요')
        );
        let previewMsg = `📥 총 ${validTargets.length}개 항목을 업무 보관함으로 이동합니다.\n\n[이동할 업무 목록]\n`
            + validTargets.map(r => '• ' + (r.task['업무명']||'새업무') + (
                ((r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요')) ? ' ⚠️날짜확인필요' : ''
              )).join('\n');
        if (incomplete.length) {
            previewMsg += `\n\n⚠️ ${incomplete.length}개 항목은 시작일/완료일이 미확정 상태입니다.\n보관함에는 담을 수 있지만, "다른 프로젝트로 전송" 시에는 날짜를 먼저 확정해야 합니다.`;
        }
        if (!confirm(previewMsg + '\n\n위 내용으로 이동하시겠습니까?')) return;

        let count = 0;
        for (const r of validTargets) {
            const idx = arr.indexOf(r);
            const task = (c.getCurIdx() === idx && window._mailAnalyzedResult) ? window._mailAnalyzedResult : r.task;
            const _batchRaw = (r.mailRaw) ? r.mailRaw : ((c.getCurIdx() === idx && window._mailParsedRaw) ? window._mailParsedRaw : null);
            // 💡 [매칭/점수 통일화] 점수가 계산된 항목이면 자동틱과 동일한 형식(등급+점수+매칭프로젝트)으로 라벨 표시
            const _srcLabel = (typeof r._score === 'number')
                ? `${r._scoreGrade || ''}${r._score}점 메일분석(${r.project || '미분류'})`
                : '업무 추가(메일분석 일괄)';
            window.TaskInbox.add(task, {
                source: _srcLabel, mailRaw: _batchRaw,
                matchedProject: r._projectTag || null,
                alarmWorthy: !!r._alarmWorthy
            });
            r.selected = false;
            count++;
        }

        if (window.updateInboxBadge) window.updateInboxBadge();
        const ov = document.getElementById('task-inbox-overlay');
        if (ov && ov.style.display === 'flex' && window.renderTaskInbox) window.renderTaskInbox();

        AR.render(tabKey);
                window.showToast(window._currentLang === 'en' ? `📥 ${count} task(s) moved to inbox.` : `📥 ${count}개 업무를 보관함에 담았습니다.`);
    },
};

// ── 3탭 기존 함수명은 그대로 유지하되(다른 곳에서 호출하는 이름 그대로), 내부는 전부 AR로 위임 ──
window.mfRenderList    = () => AR.render('mf');
window.mfToggleCheck   = (idx, checked) => AR.toggleCheck('mf', idx, checked);
window.mfSyncCheckAll  = () => AR.syncCheckAll('mf');
window.mfSelectAll     = (select) => AR.selectAll('mf', select);
window.mfDeleteItem    = (idx) => AR.deleteItem('mf', idx);
window.mfSelectItem    = (idx) => AR.selectItem('mf', idx);
window.mfRetryAsManual = (idx) => AR.retryAsManual('mf', idx);
window.mfBatchInsert   = () => AR.batchInsert('mf');
window.mfBatchToInbox  = () => AR.batchToInbox('mf');

window.msRenderList    = () => AR.render('ms');
window.msSyncCheckAll  = () => AR.syncCheckAll('ms');
window.msSelectAll     = (select) => AR.selectAll('ms', select);
window.msDeleteItem    = (idx) => AR.deleteItem('ms', idx);
window.msSelectItem    = (idx) => AR.selectItem('ms', idx);
window.msRetryAsManual = (idx) => AR.retryAsManual('ms', idx);
window.msBatchInsert   = () => AR.batchInsert('ms');
window.msBatchToInbox  = () => AR.batchToInbox('ms');

window.pasteRenderResultList = () => AR.render('paste');
window.pasteToggleCheck      = (idx, checked) => AR.toggleCheck('paste', idx, checked);
window.pasteSyncCheckAll     = () => AR.syncCheckAll('paste');
window.pasteSelectAll        = (select) => AR.selectAll('paste', select);
window.pasteDeleteResult     = (idx) => AR.deleteItem('paste', idx);
window.pasteSelectItem       = (idx) => AR.selectItem('paste', idx);
window.pasteRetryAsManual    = (idx) => AR.retryAsManual('paste', idx);
window.pasteBatchInsert      = () => AR.batchInsert('paste');
window.pasteBatchToInbox     = () => AR.batchToInbox('paste');

// 💡 [2026-08-28 신규] 메일 본문에 자주 등장하는 사내 관리번호("#502319"류)를 결정론적으로 추출.
//    프로젝트 매칭 시 브랜드명/크기만으로 오매칭되는 걸 막기 위해 msCallGemini에서 사용 —
//    이 번호가 등록된 후보가 있으면 우선하고, 없으면 브랜드/크기만으로 섣불리 매칭하지 말라고 경고한다.
window._msExtractCodeTokens = function(text) {
    const s = String(text || '');
    const found = new Set();
    const re = /#\s?(\d{4,7})\b/g;
    let m;
    while ((m = re.exec(s))) found.add(m[1]);
    return Array.from(found);
};

async function msCallGemini(apiKey, parsed, candidateProjects, projectContextOverride, userHint) {
    const GAS_URL = localStorage.getItem("gas_server_url") || "https://script.google.com/macros/s/AKfycbzB1f7lKdYRmJM5Iu38qUVGKat_51ggZR3_4aOsITjiqBuXN1wBAzixNp1CmgO_eJICfg/exec";

    // 💡 [2026-08-21][긴급 버그 수정] 예전엔 매칭된 프로젝트 정보가 없으면 "현재 열린 프로젝트" 기준으로
    //    폴백했음 — Phase A(AI 직접매칭) 도입 이후 ms/mf/paste/자동틱 4곳 전부 projectContextOverride를
    //    항상 null로 넘기게 바뀌었는데, 이 폴백은 그대로 남아있어서 **매번** "지금 화면에 열려있는 아무
    //    프로젝트"의 담당자/고객사/모델명/인치가 배경정보로 새 들어가는 사고가 실제로 있었음
    //    (예: STELLAR32를 열어둔 채 자동수집이 돌면, LNW의 전혀 다른 프로젝트 메일도 "고객사: LNW,
    //    모델명: STELLAR32"라는 배경정보를 받아 AI가 STELLAR32로 오매칭 — 실제 재현 확인됨).
    //    Phase A는 애초에 "특정 프로젝트로 미리 단정 짓지 않고 전체 후보 중에서 공정하게 고르게" 하는
    //    설계라, 이 폴백 자체가 설계 취지를 정면으로 훼손함 → 폴백 제거, 매칭 정보 없으면 그냥 빈 값.
    let assignee = (projectContextOverride && projectContextOverride.assignee) || '';
    let customer = (projectContextOverride && projectContextOverride.customer) || '';
    let model = (projectContextOverride && projectContextOverride.model) || '';
    let inch = (projectContextOverride && projectContextOverride.inch) || '';

    const _msDateYMD = window.parseMailDateToYMD(parsed.date);
    // 💡 [2026-08-27] 하드코딩된 2000자를 "⚙️ 설정 → AI 분석 설정"에서 조절 가능하도록 변경
    const mailText = parsed.subject + '\n' + parsed.sender + '\n' + (_msDateYMD ? '발송일: ' + _msDateYMD + '\n' : '') + cleanMailBody(parsed.body).substring(0, window.getAiMailMaxLen());
    // 💡 파싱 원문 전역 보관
    window._mailParsedRaw = { subject: parsed.subject || '', sender: parsed.sender || '', date: parsed.date || '', body2000: mailText };
    let prompt = window.getSystemPrompt(assignee, customer, model, inch, mailText, _msDateYMD || null);

    // 💡 [2026-08-20][AI 직접 매칭 v3] 예전엔 키워드 사전매칭으로 후보가 2개 이상 걸릴 때만 AI에게
    //    맥락 판단을 맡겼음 — project_index.json 키워드 목록이 노후화되면 AI가 애초에 이 판단 기회조차
    //    못 받는 구조적 병목이었음. → 이제 활성 프로젝트 전체를 항상 후보로 주고 AI가 직접 판단(+신뢰도).
    //    오탐 방지를 위해 "상" 신뢰도일 때만 자동확정에 사용(호출부에서 처리), 그 외엔 사람 확인으로 넘김.
    if (candidateProjects && candidateProjects.length > 0) {
        // 💡 [버그 수정] 후보 프로젝트명이 서로 같을 수 있어(예: SHUFFLER 3인치/4.3인치 둘 다 "SHUFFLER")
        //    이름이 아니라 "번호"로 답하게 해서 확실히 구별함. 인치 정보 + 등록된 키워드도 참고용으로 같이 제공
        //    (키워드는 더 이상 매칭 게이트가 아니라, AI 판단을 돕는 힌트일 뿐 — 없어도 다른 근거로 고를 수 있음).
        const numbered = candidateProjects.map((c, i) =>
            `${i + 1}. ${c.model || c.customer}${c.inch ? ' (' + c.inch + '인치)' : ''}${c.customer && c.model ? ' / 고객사: ' + c.customer : ''}${(c.keywords && c.keywords.length) ? ' — 참고 키워드: ' + c.keywords.slice(0, 6).join(', ') : ''} [파일: ${c.file_name}]`
        ).join('\n');

        // 💡 [2026-08-28 신규] 브랜드명(고객사)+크기(인치)만 같으면 실제 관리번호(#502319류)가 어느
        //    후보에도 등록 안 돼 있어도 AI가 "이름/크기가 비슷하니까" 매칭해버리는 오탐이 실제로
        //    확인됨(예: "LNW 27 UHD #502319"가 다른 27인치 LNW 프로젝트로 오매칭). 메일 본문에서
        //    "#숫자" 관리번호를 결정론적으로 뽑아, 등록된 후보가 있으면 그쪽을 우선하도록, 없으면
        //    브랜드/크기만으로 섣불리 매칭하지 말라고 명시적으로 경고한다(강제 override는 아니고
        //    AI 판단을 돕는 강한 힌트 — 이 앱의 기존 "키워드는 힌트일 뿐" 철학과 동일).
        const mailCodes = window._msExtractCodeTokens ? window._msExtractCodeTokens(mailText) : [];
        let codeHint = '';
        if (mailCodes.length) {
            const hasCode = function(c, code) { return (c.keywords || []).some(function(k) { return String(k).includes(code); }); };
            const withCode = candidateProjects
                .map(function(c, i) { return { no: i + 1, c: c }; })
                .filter(function(x) { return mailCodes.some(function(code) { return hasCode(x.c, code); }); });
            if (withCode.length) {
                codeHint = `\n⚠️ [관리번호 우선 근거] 메일에 등장하는 관리번호(${mailCodes.map(function(c){return '#'+c;}).join(', ')})가 등록된 후보: ` +
                    withCode.map(function(x) { return x.no + '번(' + x.c.file_name + ')'; }).join(', ') +
                    ' — 브랜드명·크기만 비슷한 다른 후보보다 이 근거를 우선하세요.\n';
            } else {
                codeHint = `\n⚠️ [관리번호 불일치 주의] 메일에 관리번호(${mailCodes.map(function(c){return '#'+c;}).join(', ')})가 등장하지만 아래 후보 중 이 번호가 등록된 곳이 없습니다. ` +
                    '이럴 땐 브랜드명(고객사)·크기(인치)만 비슷하다고 섣불리 매칭하지 마세요 — 본문에 다른 확실한 근거가 없으면 매칭신뢰도를 "중" 이하로 낮추거나 0(해당없음)으로 답하세요.\n';
            }
        }

        // 💡 [2026-09-01 신규] 사용자가 "📭 미분류 메일" 큐에서 [🔄 재분석 요청]으로 남긴 힌트(사람의 판단) —
        //    있으면 프로젝트 후보 목록보다도 먼저 보여줘서 최우선 근거로 삼게 한다. 위 관리번호 규칙과
        //    상충하면(예: 사용자가 지목한 프로젝트에 그 관리번호가 없음) 사용자 힌트를 우선하되, 그 사실을
        //    "매칭근거"에 남기도록 유도한다(아래 매칭근거 필드 설명 참고).
        const userHintBlock = userHint
            ? `\n⚠️ [사용자 재분석 요청 — 사람의 판단, 최우선 근거] 이 메일은 한 번 미분류로 판정됐고, 사용자가 아래처럼 직접 의견을 남기며 다시 판단해달라고 요청했습니다:\n"${userHint}"\n이 의견을 다른 어떤 근거보다도 우선해서 반영하세요. 사용자가 특정 프로젝트를 지목했다면 아래 후보 목록에서 그 프로젝트를 찾아 그 번호로 응답하고 신뢰도를 "상"으로 두세요(후보 목록에 없는 프로젝트를 말하는 것 같으면 0으로 두고 매칭근거에 그렇게 적으세요).\n`
            : '';
        prompt += `\n\n--- 프로젝트 매칭 판단 요청 (현재 등록된 활성 프로젝트 전체 목록) ---\n` + userHintBlock +
            `후보 프로젝트 목록:\n${numbered}\n` + codeHint +
            `이 메일이 실제로 다루는 "핵심 주제"가 위 목록 중 하나로 명확한지 판단하세요. 목록의 "참고 키워드"는 힌트일 뿐이니,\n` +
            `본문 맥락상 명백히 그 프로젝트 얘기면 키워드가 없어도 선택하세요. 반대로 키워드가 우연히 겹쳐도 실제 핵심 주제가 아니면 고르지 마세요.\n` +
            `※ 브랜드명(고객사)이나 크기(인치)가 같다는 이유만으로 매칭하지 마세요 — 같은 브랜드가 여러 프로젝트를 가질 수 있습니다. 본문의 구체적 내용(모델 고유 코드, 요청 사항 등)까지 확인하세요.\n` +
            `※ 후보 중 이름이 같은 것들은 인치(크기)로 구별하세요.\n` +
            `- 핵심 주제가 명확하면: 해당 후보의 번호를 아래 필드에 적으세요.\n` +
            `- 목록 어디에도 해당 안 되거나(신규/미등록 프로젝트), 회의록처럼 여러 프로젝트가 대등하게 다뤄지거나, 판단이 애매하면: 0으로 적으세요.\n` +
            `- ⚠️ [복수 프로젝트] 이 메일이 서로 다른 프로젝트 여러 개에 대해 "각각 명확하고 독립적인" 실행 항목(To do)을 담고 있을 때만` +
            `(예: 한 메일 안에 프로젝트 A 용건과 프로젝트 B 용건이 완전히 별개의 문단으로 따로 존재) — 위 "주매칭프로젝트번호"로 답한 것 외에` +
            ` 그만큼 확실한 프로젝트가 더 있다면 그 번호(들)를 "추가매칭프로젝트번호목록" 배열에 적으세요. 각 번호는 반드시 "상" 신뢰도에 준하는` +
            ` 확신이 있을 때만 넣고, 조금이라도 애매하면 절대 넣지 마세요. 단순히 다른 프로젝트가 언급되거나(참고·비교 목적), 회의록처럼 여러` +
            ` 프로젝트가 대등하게 나열만 된 경우는 포함하지 마세요 — 그럴 땐 이 배열을 반드시 빈 배열 []로 두세요.\n` +
            `위 JSON에 아래 네 필드를 추가로 포함해서 응답하세요:\n` +
            `"주매칭프로젝트번호": 1 (해당 번호, 애매하거나 목록에 없으면 0),\n` +
            `"매칭신뢰도": "상 또는 중 또는 하 (핵심 주제가 명확할수록 상)",\n` +
            `"매칭근거": "왜 이 번호를(또는 왜 0을) 선택했는지 1~2문장으로 구체적으로 설명 — 관리번호 일치/불일치, 본문의 어떤 문장·키워드가 결정적이었는지, 후보들과 왜 헷갈렸는지 등을 담아서. 사용자가 이 근거만 보고 재분석 여부를 판단할 수 있게 구체적으로 쓰세요.",\n` +
            `"추가매칭프로젝트번호목록": [] (독립적인 실행 항목이 있는 추가 프로젝트 번호만, 없으면 반드시 빈 배열 [])`;
    }

    const callResult = await window.callAiBackend(apiKey, prompt);
    if (!callResult.ok) {
        console.error(`Gemini 분석 최종 실패`, callResult.error && callResult.error.message);
        return null;
    }
    let text = callResult.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = window.parseGeminiTask(text);
    if (result) {
        // 💡 [B안] 시작일은 AI 추론 대신 메일 발송일로 확정
        //    (인용/포워딩 체인에 섞인 과거 날짜를 집는 오류 원천 차단. 사용자가 달력에서 수정 가능)
        if (_msDateYMD) {
            result['시작일'] = _msDateYMD;
            const _p = result['완료일'];
            if (_p && !String(_p).includes('날짜확인필요') && _p < _msDateYMD) result['완료일'] = _msDateYMD;
        }
        // 💡 완료일을 못 찾았으면 시작일+1일로 기본값 채움
        window._applyDefaultDueDate(result);
        // 💡 AI가 프롬프트 지시대로 스스로 만든 [출처]가 있으면 지우고, 코드에서 만든 깨끗한 것만 남김
        result['상세내용'] = window.stripAiGeneratedSourceTag(result['상세내용']);
        // 💡 [2026-08-25 신규] AI가 판정한 "담당구분"(예: HW)은 지금까지 배지/보관함 메타 정보로만
        //    보여지고, 정작 저장되는 상세내용 텍스트 안에는 없었다 — Gantt 셀/엑셀 export/"추출" 등
        //    상세내용 텍스트만 따라가는 곳에서는 이 분류가 통째로 사라졌다. [출처]와 같은 방식으로
        //    태그 한 줄을 상세내용에 함께 새겨서, 텍스트가 어디로 옮겨져도 분류 정보가 유지되게 한다.
        //    (담당자 "이름"까지는 안 넣는다 — 이름은 실제로 어느 프로젝트에 등록되느냐에 따라 달라지는
        //    화면 표시용 해석값이라, 분석 시점에 고정해서 저장하면 나중에 다른 프로젝트로 매칭될 때 틀어짐)
        const catTag = (result['담당구분'] && result['담당구분'] !== '미분류') ? `[담당구분]${result['담당구분']}` : '';
        const srcTag = `[출처]${parsed.subject || ''}_${window.cleanMailDateForTag(parsed.date)}_${parsed.sender || ''}`;
        result['상세내용'] = (result['상세내용'] || '') + (catTag ? '\n' + catTag : '') + '\n' + srcTag;
    }
    return result;
}
