// [분리됨] 원본: js/15-mail-attachment-tab.js 의 1~1428행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 메일 파일 첨부 탭 기능 (v3 - 좌우분할)

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
    // Phase 7: 다중 프로젝트 배분 드롭다운 초기화 (비동기, 렌더링 차단 안 함)
    if (window._initMultiProjectArea) window._initMultiProjectArea();
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

// ─── 신뢰도 배지 헬퍼 (파일첨부 · 직접입력 · 메일서버 공용) ───────────────────
function _confBadge(conf) {
    if (!conf) return '';
    const cfg = conf === '상' ? { bg:'#d4edda', color:'#155724', icon:'🟢' }
              : conf === '중' ? { bg:'#fff3cd', color:'#856404', icon:'🟡' }
              : conf === '하' ? { bg:'#f8d7da', color:'#721c24', icon:'🔴' }
              :                 { bg:'#f1f3f5', color:'#6c757d', icon:'⚪' };
    return `<span style="flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:${cfg.bg};color:${cfg.color};">${cfg.icon}${conf}</span>`;
}
window._confBadge = _confBadge; // 전역 노출 (msRenderList 등 다른 파일에서도 사용)

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
            ${_confBadge((r.task['_aiMeta'] && r.task['_aiMeta'].confidence) || r.task['매칭신뢰도'] || '')}
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
                <div style="display:flex; gap:4px; margin-top:2px; flex-wrap:wrap; align-items:center;">
                    ${r.project
                        ? `<span style="background:#e7f3ff; color:#0056b3; padding:1px 5px;
                                        border-radius:3px; font-size:10px; font-weight:bold;">
                               ${r.project}</span>`
                        : `<span style="color:#dc3545; font-size:10px;">${r.error||''}</span>`}
                    ${_confBadge(r.task && ((r.task['_aiMeta'] && r.task['_aiMeta'].confidence) || r.task['매칭신뢰도']) || '')}
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
