// [분리됨] 원본: js/14-ai-mail-analysis.js 의 773~1559행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 메일 분석 → 간트차트 자동 추가 (Gemini AI) 2/2
window.saveFeedbackLog = function(rating) {
    if (!window._mailAnalyzedResult) return;
    const log = JSON.parse(localStorage.getItem(_PF_KEY) || '[]');
    const uid = 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    log.unshift({
        uid: uid,
        date: new Date().toISOString(),
        promptVersion: window._promptVersion,
        mailRaw: window._mailParsedRaw || null,
        aiResult: window._aiResultSnapshot ? JSON.parse(JSON.stringify(window._aiResultSnapshot)) : null,
        userResult: JSON.parse(JSON.stringify(window._mailAnalyzedResult)),
        userComment: '',
        rating: rating,
        improved: false
    });
    if (log.length > 200) log.splice(200);
    localStorage.setItem(_PF_KEY, JSON.stringify(log));

    const _en = window._currentLang === 'en';
    const goodBtn = document.getElementById('fb-good-btn');
    const badBtn  = document.getElementById('fb-bad-btn');
    const triggerRow = document.getElementById('fb-improve-trigger-row');

    if (rating === 'good') {
        window._lastFeedbackUid = null;
        if (triggerRow) triggerRow.style.display = 'none';
        if (goodBtn) { goodBtn.style.background = '#c9ecd3'; goodBtn.style.borderColor = '#7cc494'; goodBtn.style.color = '#1f7a3d'; }
        if (badBtn)  { badBtn.style.background = '#fbe4e2'; badBtn.style.borderColor = '#eeb0ac'; badBtn.style.color = '#b1432f'; }
        if (window.showToast) window.showToast(_en ? '👍 Feedback saved.' : '👍 피드백이 저장되었습니다.');
    } else {
        window._lastFeedbackUid = uid;
        if (triggerRow) triggerRow.style.display = 'block'; // 💡 나쁨 선택 시에만 개선요청 버튼 노출
        if (badBtn)  { badBtn.style.background = '#f5c2bd'; badBtn.style.borderColor = '#e08f87'; badBtn.style.color = '#b1432f'; }
        if (goodBtn) { goodBtn.style.background = '#e6f6ea'; goodBtn.style.borderColor = '#a8dab8'; goodBtn.style.color = '#1f7a3d'; }
    }
};

// ── 💡 개선 요청 코멘트 입력 모달 ───────────────────────────────────
// 💡 [2026-08-24 UX 개선] 다른 팝업들처럼 표준 모달 기능(드래그 이동, 배경 흐림/딤 처리로 뒤 화면
//    조작 차단, 배경 클릭 시 닫기, 우상단 ✕ 버튼)을 적용 — 예전엔 헤더/오버레이 없이 텍스트 박스만
//    화면 중앙에 떠 있고 뒤 배경도 그대로 조작 가능해서 다른 모달들과 이질감이 있었음.
window.openImproveCommentModal = function() {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('improve-comment-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'improve-comment-modal';
        // 💡 [2026-08-24] 처음엔 backdrop-filter:blur(3px)를 넣었는데, 개선 요청 코멘트를 쓰려면
        //    뒤에 있는 분석 결과 내용을 보면서 참고해야 하는데 블러 때문에 안 읽혀서 제거함
        //    (배경 톤만 살짝 남기고 흐림 효과는 뺌 — 뒤 내용이 그대로 읽힘).
        // 💡 [2026-08-24] 배경 클릭 시 닫히던 걸 제거함 — 코멘트를 쓰다가 뒤 분석 결과를 참고하려고
        //    배경을 클릭했는데 모달이 닫혀버리는 게 불편하다는 피드백. 이제 ✕ 버튼으로만 닫힘.
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9250; background:rgba(255,218,185,0.22);';
        modal.innerHTML = `
        <div id="improve-comment-box" onclick="event.stopPropagation()" style="position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:200px;">
            <div id="improve-comment-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span>✏️ <span id="improve-comment-title"></span></span>
                <button onclick="event.stopPropagation(); document.getElementById('improve-comment-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div style="padding:18px;">
                <textarea id="improve-comment-input" placeholder="${_en ? 'e.g. Extracted the wrong date from the forwarding chain (optional)' : '예: 포워딩 체인에서 날짜를 잘못 추출함 (선택 입력)'}"
                    style="width:100%; min-height:80px; font-size:13px; border:1px solid #ced4da; border-radius:6px; padding:8px; box-sizing:border-box; resize:vertical;"></textarea>
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <button onclick="window.submitImproveComment()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🤖 ${_en ? 'Request' : '요청'}</button>
                    <button onclick="document.getElementById('improve-comment-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:9px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">✖ ${_en ? 'Cancel' : '취소'}</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('improve-comment-box', 'improve-comment-drag');
        window._bindClickToFront('improve-comment-modal');
    }
    document.getElementById('improve-comment-title').textContent =
        _en ? 'What was the problem?' : '어떤 부분이 문제였나요?';
    document.getElementById('improve-comment-input').value = '';
    modal.style.display = 'block';
    if (window.bringModalToFront) window.bringModalToFront('improve-comment-modal');
};

window.submitImproveComment = function() {
    const comment = document.getElementById('improve-comment-input').value.trim();
    document.getElementById('improve-comment-modal').style.display = 'none';

    if (window._lastFeedbackUid) {
        const log = JSON.parse(localStorage.getItem(_PF_KEY) || '[]');
        const it = log.find(function(x) { return x.uid === window._lastFeedbackUid; });
        if (it) { it.userComment = comment; localStorage.setItem(_PF_KEY, JSON.stringify(log)); }
    }
    window.triggerPromptImprove('instant', comment);
};

// 💡 다운스트림 코드가 의존하는 필수 구조 요소가 개선된 프롬프트에도 살아있는지 검사
window.validatePromptStructure = function(promptText) {
    const requiredJsonKeys = ['업무명', '시작일', '완료일', '상태', '개발단계', '담당구분', '상세내용', 'wbs레벨'];
    const requiredTags = ['[핵심내용]', '[To do]', '[출처]'];
    const missing = [];
    requiredJsonKeys.forEach(function(k) {
        if (promptText.indexOf('"' + k + '"') === -1) missing.push('JSON 키: "' + k + '"');
    });
    requiredTags.forEach(function(t) {
        if (promptText.indexOf(t) === -1) missing.push('태그: ' + t);
    });
    return missing; // 빈 배열이면 이상 없음
};

window.triggerPromptImprove = async function(mode, instantComment) {
    const _en = window._currentLang === 'en';
    const currentPrompt = localStorage.getItem('gantt_mail_prompt') || window._defaultPromptTemplate || '';
    const apiKey = window.getActiveAiKey(); // 💡 선택된 provider(Gemini/Groq/Mistral)에 맞는 키를 정식 헬퍼로 조회
    let casesText = '';
    let targetUids = [];

    if (mode === 'instant') {
        // 즉시 모드: 현재 분석 케이스 1건
        const snap = window._aiResultSnapshot;
        const cur  = window._mailAnalyzedResult;
        const raw  = window._mailParsedRaw;
        if (!snap || !cur) { alert(_en ? 'No analysis result found.' : '분석 결과가 없습니다.'); return; }
        casesText = `[케이스 1]\n메일원문:\n${raw ? raw.body2000 : '(없음)'}\n\nAI 원본 결과:\n상세내용: ${snap['상세내용'] || ''}\n\n사용자 수정 결과:\n상세내용: ${cur['상세내용'] || ''}\n\n사용자 코멘트: ${instantComment || '(없음)'}`;
        targetUids = window._lastFeedbackUid ? [window._lastFeedbackUid] : [];
    } else {
        // 배치 모드: improved:false 케이스 최대 10건
        const log = JSON.parse(localStorage.getItem(_PF_KEY) || '[]');
        const pending = log.filter(function(x) { return x.rating === 'bad' && !x.improved; }).slice(0, 10);
        targetUids = pending.map(function(x) { return x.uid; });
        if (!pending.length) {
            alert(_en ? '⚠️ No pending feedback cases to improve.' : '⚠️ 개선할 피드백 케이스가 없습니다.\n먼저 분석 결과에서 👎 버튼을 눌러 케이스를 쌓아주세요.');
            return;
        }
        casesText = pending.map(function(fb, i) {
            const snap = fb.aiResult || {};
            const cur  = fb.userResult || {};
            const raw  = fb.mailRaw || {};
            // 10건 초과 방지용 — mailRaw는 5건까지만 포함
            const bodyPart = (i < 5 && raw.body2000) ? `메일원문:\n${raw.body2000}\n\n` : '';
            return `[케이스 ${i+1}] (${fb.date ? fb.date.slice(0,10) : ''})\n${bodyPart}AI 원본 상세내용: ${snap['상세내용'] || ''}\n사용자 수정 상세내용: ${cur['상세내용'] || ''}\n사용자 코멘트: ${fb.userComment || '(없음)'}`;
        }).join('\n\n---\n\n');
    }

    // 💡 JSON 대신 구분자 방식 — 프롬프트 원문의 줄바꿈/따옴표로 인한 이스케이프 깨짐 방지
    // 💡 이 구조(JSON 키/브래킷 태그/enum)는 다른 코드가 직접 파싱하므로 AI가 절대 바꾸면 안 됨
    const PROTECTED_STRUCTURE_RULE = `\n\n🔒 절대 변경 금지 규칙 (반드시 준수):\n프롬프트 내용을 개선하되, 아래 구조적 요소는 절대 이름/형식을 바꾸지 마세요. 이 값들은 다른 프로그램 코드가 그대로 파싱하고 있어서, 조금이라도 바뀌면 시스템이 깨집니다.\n1. 최종 JSON 응답의 키 이름은 정확히 이 8개만 사용: "업무명","시작일","완료일","상태","개발단계","담당구분","상세내용","wbs레벨" (키 이름 변경/추가/삭제 금지)\n2. "상태" 값은 반드시 진행/대기/완료/보류 중 하나\n3. "담당구분" 값은 반드시 PM/기구/HW/FW/BLU/TSP/LCM/Slimming/Cutting/Tooling/영업/CS/FA/미분류 중 하나 (이 목록 자체는 자유롭게 다듬어도 되지만, 필드 자체를 삭제하면 안 됨)\n4. "상세내용" 안의 대괄호 태그는 정확히 이 이름 그대로 사용: [핵심내용] [To do] [출처] [문제점] [대책] (태그명 변경 금지, 새 태그 추가는 가능하나 기존 태그명은 유지)\n5. 날짜 형식은 반드시 "YYYY-MM-DD" 또는 "날짜확인필요"\n표현/설명/추출 로직 등 나머지 부분은 자유롭게 개선해도 됩니다.`;

    const improvePrompt = `당신은 AI 프롬프트 개선 전문가입니다.\n아래는 현재 사용 중인 메일 분석 프롬프트와, 이 프롬프트로 분석했을 때 사용자가 수정한 실패 케이스입니다.\n\n=== 현재 프롬프트 ===\n${currentPrompt}\n\n=== 실패 케이스 ===\n${casesText}${PROTECTED_STRUCTURE_RULE}\n\n위 케이스에서 프롬프트의 어떤 부분이 문제인지 분석하고, 개선된 프롬프트 전문을 제안해주세요.\n\n반드시 아래 형식 그대로만 응답하세요. JSON이나 코드블록(\`\`\`)은 절대 사용하지 마세요.\n\n===ANALYSIS===\n(여기에 문제점 분석을 3줄 이내로 작성)\n===PROMPT===\n(여기에 개선된 프롬프트 전문을 기존과 동일한 형식으로 작성)\n===END===`;

    window.showToast(_en ? '🤖 Requesting AI improvement...' : '🤖 AI 개선 요청 중...');
    try {
        const callResult = await window.callAiBackend(apiKey, improvePrompt);
        if (!callResult.ok) throw callResult.error;
        const data = callResult.data;
        const text = data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const cleaned = text.replace(/```[a-z]*|```/gi, '').trim();
        const analysisMatch = cleaned.match(/===ANALYSIS===([\s\S]*?)===PROMPT===/);
        const promptMatch   = cleaned.match(/===PROMPT===([\s\S]*?)(===END===|$)/);
        const analysis = analysisMatch ? analysisMatch[1].trim() : '';
        const improvedPrompt = promptMatch ? promptMatch[1].trim() : '';
        const isTruncated = !/===END===/.test(cleaned); // 💡 종료 마커 없으면 잘림 의심

        if (!improvedPrompt) {
            throw new Error(_en ? 'Could not parse AI response (format mismatch).' : 'AI 응답 형식을 해석하지 못했습니다.');
        }
        // 💡 구조 손상 여부 검증 — 다운스트림 코드가 의존하는 필수 요소가 빠졌는지 확인
        const structIssues = window.validatePromptStructure(improvedPrompt);
        // 💡 원본 프롬프트를 같이 넘겨서 미리보기에서 변경사항 비교(diff) 가능하게 함
        window.showImprovePreviewModal(analysis, improvedPrompt, targetUids, currentPrompt, isTruncated, structIssues);
    } catch(e) {
        alert((_en ? '❌ AI improvement failed: ' : '❌ AI 개선 요청 실패: ') + e.message);
    }
};

// ── 💡 라인 단위 diff 계산 (LCS 알고리즘) ────────────────────────────
window._simpleLineDiff = function(oldText, newText) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');
    const n = oldLines.length, m = newLines.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = oldLines[i] === newLines[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
        }
    }
    let i = 0, j = 0;
    const result = [];
    while (i < n && j < m) {
        if (oldLines[i] === newLines[j]) { result.push({ type: 'same', line: oldLines[i] }); i++; j++; }
        else if (dp[i+1][j] >= dp[i][j+1]) { result.push({ type: 'del', line: oldLines[i] }); i++; }
        else { result.push({ type: 'add', line: newLines[j] }); j++; }
    }
    while (i < n) { result.push({ type: 'del', line: oldLines[i] }); i++; }
    while (j < m) { result.push({ type: 'add', line: newLines[j] }); j++; }
    return result;
};

// ── 💡 diff 결과를 HTML로 렌더 (동일 라인 3줄 이상 연속되면 접어서 표시) ──
window.renderPromptDiffHtml = function(oldText, newText) {
    const diff = window._simpleLineDiff(oldText, newText);
    let html = '';
    let sameBuf = [];
    const flushSame = function() {
        if (!sameBuf.length) return;
        if (sameBuf.length > 3) {
            html += `<div style="color:#adb5bd; font-size:11px; padding:2px 8px;">… ${sameBuf.length}${window._currentLang === 'en' ? ' unchanged lines' : '줄 동일'} …</div>`;
        } else {
            sameBuf.forEach(function(l) {
                html += `<div style="color:#868e96; padding:1px 8px; white-space:pre-wrap;">${escapeHtml(l) || '&nbsp;'}</div>`;
            });
        }
        sameBuf = [];
    };
    diff.forEach(function(d) {
        if (d.type === 'same') { sameBuf.push(d.line); return; }
        flushSame();
        if (d.type === 'del') {
            html += `<div style="background:#ffe3e3; color:#c92a2a; padding:1px 8px; white-space:pre-wrap; text-decoration:line-through;">- ${escapeHtml(d.line) || '&nbsp;'}</div>`;
        } else {
            html += `<div style="background:#d3f9d8; color:#2b8a3e; padding:1px 8px; white-space:pre-wrap;">+ ${escapeHtml(d.line) || '&nbsp;'}</div>`;
        }
    });
    flushSame();
    return html || `<div style="color:#adb5bd; padding:8px;">${window._currentLang === 'en' ? 'No differences.' : '변경사항이 없습니다.'}</div>`;
};

// ── 💡 개선 결과 미리보기 모달 ──────────────────────────────────────────
window.showImprovePreviewModal = function(analysis, improvedPrompt, targetUids, originalPrompt, isTruncated, structIssues) {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('prompt-improve-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'prompt-improve-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="prompt-improve-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
            <div id="prompt-improve-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span>🤖 ${_en ? 'AI Prompt Improvement Suggestion' : 'AI 프롬프트 개선 제안'}</span>
                <button onclick="document.getElementById('prompt-improve-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="improve-truncate-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:12px; color:#856404;"></div>
            <div id="improve-struct-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#ffe3e3; border:1px solid #e03131; border-radius:6px; font-size:12px; color:#c92a2a;"></div>
            <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                <div>
                    <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔍 ${_en ? 'Problem Analysis' : '문제점 분석'}</div>
                    <div id="improve-analysis-text" style="font-size:12px; color:#333; background:#f8f9fb; border:1px solid #e6e9ef; border-radius:6px; padding:10px; white-space:pre-wrap; line-height:1.6;"></div>
                </div>
                <div>
                    <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔀 ${_en ? 'Changes vs Original' : '변경사항 (원본 대비)'}
                        <span style="font-weight:normal; color:#999;">(${_en ? 'red = removed, green = added' : '빨강=삭제, 초록=추가'})</span>
                    </div>
                    <div id="improve-diff-view" style="max-height:220px; overflow-y:auto; font-size:11.5px; font-family:'Malgun Gothic',monospace; border:1px solid #e6e9ef; border-radius:6px; line-height:1.5; background:#fff;"></div>
                </div>
                <div style="flex:1; display:flex; flex-direction:column;">
                    <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">✏️ ${_en ? 'Improved Prompt (editable)' : '개선된 프롬프트 (수정 가능)'}</div>
                    <textarea id="improve-prompt-textarea" style="flex:1; min-height:200px; font-size:12px; font-family:'Malgun Gothic',monospace; border:1px solid #ced4da; border-radius:6px; padding:10px; resize:vertical; line-height:1.6;"></textarea>
                </div>
            </div>
            <div style="padding:12px 16px; display:flex; gap:8px; border-top:1px solid #eee;">
                <button onclick="window.applyImprovedPrompt()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ ${_en ? 'Adopt' : '채택'}</button>
                <button onclick="document.getElementById('prompt-improve-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:10px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">❌ ${_en ? 'Discard' : '무시'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('prompt-improve-box', 'prompt-improve-drag');
        window._bindClickToFront('prompt-improve-modal');
    }
    const _en2 = window._currentLang === 'en';
    const warnBar = document.getElementById('improve-truncate-warning');
    warnBar.textContent = _en2
        ? '⚠️ The AI response may have been cut off (no end marker found). Please check the end of the prompt below before adopting.'
        : '⚠️ AI 응답이 중간에 잘렸을 수 있습니다 (종료 마커 없음). 채택 전 아래 프롬프트 끝부분을 꼭 확인하세요.';
    warnBar.style.display = isTruncated ? 'block' : 'none';

    const structBar = document.getElementById('improve-struct-warning');
    if (structIssues && structIssues.length) {
        structBar.innerHTML = (_en2
            ? '🚨 Structural elements required by other code appear to be missing: '
            : '🚨 다른 코드가 의존하는 필수 요소가 빠진 것 같습니다: ') + '<b>' + structIssues.join(', ') + '</b>';
        structBar.style.display = 'block';
    } else {
        structBar.style.display = 'none';
    }



    document.getElementById('improve-diff-view').innerHTML = window.renderPromptDiffHtml(originalPrompt || '', improvedPrompt);
    document.getElementById('improve-analysis-text').textContent = analysis;
    document.getElementById('improve-prompt-textarea').value = improvedPrompt;
    modal._targetUids = targetUids || [];
    modal.style.display = 'block';
    window.bringModalToFront('prompt-improve-modal');
};

// ── 💡 개선 프롬프트 채택 ───────────────────────────────────────────────
window.applyImprovedPrompt = async function() {
    const _en = window._currentLang === 'en';
    const text = document.getElementById('improve-prompt-textarea').value.trim();
    if (!text) { alert(_en ? 'Prompt is empty.' : '프롬프트가 비어있습니다.'); return; }

    // 💡 [2026-08-24 안전장치 추가] 팀 공용 프롬프트를 덮어쓰는 파괴적 액션이라, 수동 편집(✏️ 프롬프트
    //    편집 모달의 "🔒 수정하기")과 동일하게 관리자 비밀번호 인증을 요구함.
    if (!window.verifyAdminPassword(_en ? '🔒 Enter the admin password to adopt the improved prompt.\n(case-insensitive)' : '🔒 개선된 프롬프트를 채택하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
        alert(_en ? '❌ Authentication failed. Adoption cancelled.' : '❌ 비밀번호 인증 실패. 채택이 취소되었습니다.');
        return;
    }

    // 버전 증가
    window._promptVersion = (window._promptVersion || 1) + 1;
    localStorage.setItem('gantt_prompt_version', String(window._promptVersion));

    // 기존 savePrompt 로직 재사용 (로그 + localStorage + Drive)
    const oldPrompt = localStorage.getItem('gantt_mail_prompt') || '';
    let promptLogs = JSON.parse(localStorage.getItem('gantt_prompt_logs') || '[]');
    promptLogs.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: (window.currentUserName || '알 수 없음') + ' (AI개선 채택 v' + window._promptVersion + ')',
        oldPrompt: oldPrompt.substring(0, 200) + (oldPrompt.length > 200 ? '...' : ''),
        newPrompt: text.substring(0, 200) + (text.length > 200 ? '...' : '')
    });
    if (promptLogs.length > 20) promptLogs = promptLogs.slice(-20);
    localStorage.setItem('gantt_prompt_logs', JSON.stringify(promptLogs));
    localStorage.setItem('gantt_mail_prompt', text);

    // 💡 전체 텍스트 버전 스냅샷 저장 (복원 가능하도록)
    window.savePromptVersionSnapshot(text, 'AI개선 채택 v' + window._promptVersion);

    // improved: true 마킹
    const modal = document.getElementById('prompt-improve-modal');
    const uids = (modal && modal._targetUids) || [];
    if (uids.length) {
        const log = JSON.parse(localStorage.getItem(_PF_KEY) || '[]');
        uids.forEach(function(uid) {
            const it = log.find(function(x) { return x.uid === uid; });
            if (it) it.improved = true;
        });
        localStorage.setItem(_PF_KEY, JSON.stringify(log));
    }

    // Drive 저장
    // 💡 [2026-08-24 버그 수정] 드라이브 미연동 상태거나 업로드가 실패하면 방금 채택한 내용이 로컬에만
    //    남는데 — 이후 드라이브가 연결되면 loadPromptFromDrive()가 (옛) 드라이브 버전을 그대로 받아와
    //    이 로컬 변경을 조용히 덮어써버리는 문제가 있었음("채택했는데 다시 들어오면 저장 안 되어 있음").
    //    "아직 드라이브에 못 올린 변경이 있다"는 표시를 남겨서, 다음 로드 시 덮어쓰는 대신 먼저 이
    //    변경을 드라이브로 올리도록 함.
    if (window.isDriveConnected && window.savePromptToDrive) {
        const ok = await window.savePromptToDrive(text);
        if (ok) {
            localStorage.removeItem('gantt_mail_prompt_pending_push');
            alert(_en ? '✅ Improved prompt adopted & saved to Drive. (v' + window._promptVersion + ')' : '✅ 개선된 프롬프트가 채택되어 드라이브에 저장되었습니다. (v' + window._promptVersion + ')');
        } else {
            localStorage.setItem('gantt_mail_prompt_pending_push', '1');
            alert(_en ? '⚠️ Adopted locally, but Drive upload failed. Will retry automatically next time Drive connects.' : '⚠️ 로컬에는 저장됐지만 드라이브 업로드에 실패했습니다. 다음 드라이브 연결 시 자동으로 다시 시도합니다.');
        }
    } else {
        localStorage.setItem('gantt_mail_prompt_pending_push', '1');
        alert(_en ? '✅ Improved prompt adopted. (v' + window._promptVersion + ')\n(Drive not connected — will sync to the team on next connect)' : '✅ 개선된 프롬프트가 채택되었습니다. (v' + window._promptVersion + ')\n(현재 드라이브 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다)');
    }
    modal.style.display = 'none';
};

window.showPromptLogs = function() {
    let logs = JSON.parse(localStorage.getItem('gantt_prompt_logs') || '[]');
    let versions = JSON.parse(localStorage.getItem('gantt_prompt_versions') || '[]');
    if (logs.length === 0) { alert('프롬프트 변경 이력이 없습니다.'); return; }

    let logModal = document.getElementById('prompt-log-modal');
    if (!logModal) {
        logModal = document.createElement('div');
        logModal.id = 'prompt-log-modal';
        // 💡 [2026-08-24 UI 버그 수정] 이 모달만 예전 스타일(검은 배경 0.6 딤 + 드래그 불가)로 남아있어서
        //    다른 모달들(손 커서로 드래그 이동 가능, 배경은 보이고 조작도 가능)과 이질감이 있었음 —
        //    같은 표준 패턴(pointer-events:none 오버레이 + cursor:grab 드래그 헤더)으로 통일.
        //    또한 헤더에 ✕ 닫기 버튼이 실수로 2개(제대로 된 버튼 + 남아있던 잔여 ✖ span) 겹쳐 있던
        //    버그도 여기서 같이 제거함.
        logModal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none; align-items:center; justify-content:center;';
        logModal.innerHTML = `
            <div id="prompt-log-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                <div id="prompt-log-drag" style="padding:13px 18px;border-bottom:1px solid #ffe08a;font-weight:bold;font-size:14px;background:#fff8e6;color:#7a5210;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
                    <span>🕒 프롬프트 변경 이력</span>
                    <button onclick="event.stopPropagation(); document.getElementById('prompt-log-modal').style.display='none'"
                        style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px;
                               color:var(--modal-icon-text); font-size:16px; cursor:pointer;
                               width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;
                               display:flex; align-items:center; justify-content:center; transition:0.15s;"
                        onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';"
                        onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';"
                        title="닫기">✕</button>
                </div>
                <div id="prompt-log-content" style="padding:15px;overflow-y:auto;flex:1;"></div>
                <div style="padding:15px;border-top:1px solid #dee2e6;display:flex;gap:6px;">
                    <button onclick="window.clearPromptLogs()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1;padding:10px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;transition:background .15s, border-color .15s;">🗑️ 이력 삭제</button>
                    <button onclick="document.getElementById('prompt-log-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;transition:background .15s, border-color .15s;">닫기</button>
                </div>
            </div>`;
        document.body.appendChild(logModal);
        window._makeDraggable('prompt-log-box', 'prompt-log-drag');
        window._bindClickToFront('prompt-log-modal');
    }

    // 💡 [2026-08-31 버그 수정] table-layout이 auto(기본값)이던 상태에서 "변경일시"/"수정자" 칸에
    //    white-space:nowrap을 걸어두니, 칸이 좁아질 때 그 글자가 줄바꿈되는 대신 칸 경계를 넘어
    //    옆 칸(다음 열) 위에 겹쳐 보이는 버그가 있었음("...8:20박용훈"처럼 시각과 이름이 붙어 보임).
    //    table-layout:fixed + colgroup으로 각 열 너비를 고정폭 비율로 미리 확보해서, 브라우저가
    //    내용 길이에 따라 열 너비를 제멋대로 줄이지 못하게 막는다.
    let html = '<table style="width:100%; table-layout:fixed; border-collapse:collapse; font-size:12px;"><colgroup><col style="width:14%;"><col style="width:11%;"><col style="width:33%;"><col style="width:33%;"><col style="width:9%;"></colgroup>';
    html += '<tr style="background:#f8f9fa;"><th style="padding:8px;border:1px solid #dee2e6;">변경일시</th><th style="padding:8px;border:1px solid #dee2e6;">수정자</th><th style="padding:8px;border:1px solid #dee2e6;">변경 전 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">변경 후 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">복원</th></tr>';
    [...logs].reverse().forEach((log, revIdx) => {
        // 💡 시간 문자열로 versions 배열에서 대응하는 전체 텍스트 스냅샷 매칭 (없으면 복원 버튼 비활성)
        const matched = versions.find(v => v.time === log.time);
        const restoreBtn = matched
            ? `<button onclick="window.restorePromptVersion(${matched.version})" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11px; padding:4px 8px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:4px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 복원</button>`
            : `<span style="font-size:10px; color:#ccc;">-</span>`;
        html += `<tr>
            <td style="padding:8px;border:1px solid #dee2e6;color:#6c757d; word-break:break-word;">${log.time}</td>
            <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;color:#0056b3; word-break:break-word;">${log.userName}</td>
            <td style="padding:8px;border:1px solid #dee2e6;font-size:11px;color:#dc3545;word-break:break-all;">${log.oldPrompt}</td>
            <td style="padding:8px;border:1px solid #dee2e6;font-size:11px;color:#0f5132;word-break:break-all;">${log.newPrompt}</td>
            <td style="padding:8px;border:1px solid #dee2e6;text-align:center;">${restoreBtn}</td>
        </tr>`;
    });
    html += '</table>';

    document.getElementById('prompt-log-content').innerHTML = html;
    logModal.style.display = 'flex';
};

// 💡 특정 버전으로 복원 — 즉시 저장하지 않고 편집창에 불러와서 검토 후 저장하도록 유도
window.restorePromptVersion = function(version) {
    const versions = JSON.parse(localStorage.getItem('gantt_prompt_versions') || '[]');
    const target = versions.find(v => v.version === version);
    if (!target) { alert('해당 버전을 찾을 수 없습니다.'); return; }

    document.getElementById('prompt-log-modal').style.display = 'none';

    const textarea = document.getElementById('prompt-edit-textarea');
    if (textarea) textarea.value = target.prompt;
    // 편집 잠금 상태였다면 저장 버튼 노출 (unlockPrompt와 동일 효과)
    const saveBtn = document.getElementById('prompt-save-btn');
    const unlockBtn = document.getElementById('prompt-unlock-btn');
    if (saveBtn) saveBtn.style.display = 'block';
    if (unlockBtn) unlockBtn.style.display = 'none';

    alert('📋 v' + version + ' 버전을 불러왔습니다.\n내용을 확인한 후 [💾 저장] 버튼을 눌러야 최종 반영됩니다.');
};

window.clearPromptLogs = function() {
    localStorage.removeItem('gantt_prompt_logs');
    localStorage.removeItem('gantt_prompt_versions');
    document.getElementById('prompt-log-modal').style.display = 'none';
    alert('✅ 이력이 삭제되었습니다.');
};
        
// 💡 [2026-08-20][WBS 레벨 추정] AI의 wbs레벨 판단은 프롬프트에 뚜렷한 기준이 없어 3/4에만 몰리는
//    문제가 있었음 → "업무명이 대상 시트에 이미 있는 L1~L3 제목과 같으면 L4(그 밑 하위업무로),
//    완전히 새 제목이면 L3(새 세부업무)"로, AI 추측 대신 실제 시트 데이터를 근거로 판정.
//    recalculateSchedules()가 _origT1~T3를 각 행까지 forward-fill 해두므로, 레벨 상관없이 모든 행을
//    훑으면 "현재 존재하는 L1~L3 제목 전체"를 얻을 수 있음.
window._msGuessWbsLevel = function(taskName, gd) {
    const norm = s => String(s || '').replace(/\s+/g, '').replace(/[＊*]?AI📧$/, '').toLowerCase();
    const target = norm(taskName);
    if (!target || !gd) return 3;
    for (let i = 1; i < gd.length; i++) {
        const row = gd[i];
        if (!row) continue;
        if (norm(row._origT1) === target || norm(row._origT2) === target || norm(row._origT3) === target) {
            return 4; // 기존 제목과 일치 → 그 아래 하위업무로
        }
    }
    return 3; // 완전히 새 제목 → 새 세부업무로
};

// ✅ [공용] 분석 결과(r) → 간트 행 객체 생성 (개별 등록 / 보관함 배치 / 타 프로젝트 배분 공용)
//    gd/ci 생략 시 현재 프로젝트(globalData/colIdx) 기준으로 동작
window.buildMailTaskRow = function(r, gd, ci, mailRaw) {
    gd = gd || globalData;
    ci = ci || colIdx;
    // 💡 사용자가 미리보기에서 드롭다운으로 직접 고른 값이거나(_wbsLevelUserSet) AI가 0~2(대분류~
    //    소분류2)로 판단한 경우는 그대로 존중. 그 외(3/4/미지정)는 실제 시트 기준으로 재추정.
    const _aiWbsLevel = parseInt(r['wbs레벨'] ?? 4);
    const wbsLevel = (r['_wbsLevelUserSet'] || _aiWbsLevel <= 2)
        ? _aiWbsLevel
        : (window._msGuessWbsLevel ? window._msGuessWbsLevel(r['업무명'], gd) : _aiWbsLevel);

    let newRow = new Array(gd[0].length).fill("");
    newRow._level = wbsLevel;
    newRow._origDev = ""; newRow._origT1 = ""; newRow._origT2 = ""; newRow._origT3 = ""; newRow._origT4 = "";
    // ✅ 메일 추가 항목임을 표시하기 위해 📧 처리 (사용자가 확인 후 제거 가능)
    // ✅ ＊AI 마커: 병렬(_isParallel) 판정에 걸려서, 실수로 잠금이 풀려도 다른 형제 업무 일정을 밀지 않고 이 업무 하나만 영향받음 + 화면에서 AI가 넣은 업무임을 구분 가능
    const taskName = (r['업무명'] || "새 업무") + ' ＊AI📧';
    if (wbsLevel === 0) newRow._origDev = taskName;
    else if (wbsLevel === 1) newRow._origT1 = taskName;
    else if (wbsLevel === 2) newRow._origT2 = taskName;
    else if (wbsLevel === 3) newRow._origT3 = taskName;
    else if (wbsLevel === 4) newRow._origT4 = taskName;

    newRow._startForced = false; newRow._planForced = false;

    // ✅ 고객/모델/인치/담당자는 대상 데이터의 기존 행에서 직접 복사
    let refRow = null;
    for (let i = 1; i < gd.length; i++) {
        if (gd[i]) { refRow = gd[i]; break; }
    }
    // 💡 [담당구분] AI가 판정한 담당구분(예: LCM)이 있고 Summary에 해당 담당자가 등록돼 있으면
    //    그 담당자로 배정 — 없으면 기존처럼 대상 프로젝트의 기존 행(refRow) 담당자를 그대로 승계
    const _catAssignee = window._msResolveCategoryAssignee ? window._msResolveCategoryAssignee(r['담당구분']) : null;
    if (ci.assignee !== -1) newRow[ci.assignee] = _catAssignee ? _catAssignee.name : (refRow ? (refRow[ci.assignee] || "") : "");
    // 💡 [2026-08-28 버그 수정] r['담당구분']은 AI가 프롬프트 그대로("영업"/"기구"/"Tooling" 등 정식
    //    명칭으로) 응답한 원본값 — WBS 배지/드롭다운 짧은 코드(SAL/ME/TOOL 등)와 다른 문자열이라, 별칭
    //    변환 없이 그대로 저장하면 드롭다운에 "SAL"과 "영업"이 같은 뜻인데 서로 다른 값으로 중복 표시됐다.
    //    window._normalizeWbsDiscipline로 변환해서 저장(위 _catAssignee 조회는 원본 명칭 기준 매핑표를
    //    쓰므로 그대로 r['담당구분']을 넘긴 채 유지 — 여기 저장값만 바꾼다).
    newRow._담당구분 = window._normalizeWbsDiscipline ? window._normalizeWbsDiscipline(r['담당구분']) : (r['담당구분'] || '');
    if (ci.customer !== -1) newRow[ci.customer] = refRow ? (refRow[ci.customer] || "") : "";
    if (ci.model !== -1) newRow[ci.model] = refRow ? (refRow[ci.model] || "") : "";
    if (ci.inch !== -1) newRow[ci.inch] = refRow ? (refRow[ci.inch] || "") : "";
    // ✅ 분석 결과 매핑
    const _fixYear = (d) => {
    if (!d) return d;
    const m = d.match(/^(\d{4})([-\/]\d{1,2}[-\/]\d{1,2})$/);
    if (m && parseInt(m[1]) < new Date().getFullYear() - 1)
        return new Date().getFullYear() + m[2];
    return d;
    };
    if (ci.start !== -1 && r['시작일']) { newRow[ci.start] = _fixYear(r['시작일']); newRow._startForced = true; }
    if (ci.plan !== -1 && r['완료일']) { newRow[ci.plan] = _fixYear(r['완료일']); newRow._planForced = true; }
    if (ci.status !== -1) newRow[ci.status] = (r['상태'] || "진행").toString().trim();
    if (ci.devStage !== -1) newRow[ci.devStage] = (r['개발단계'] || "").toString().trim();
    if (ci.content !== -1) newRow[ci.content] = (r['상세내용'] || "").toString().trim().replace(/\\n/g, '\n');

    // 소요일 설정
    if (wbsLevel === 1 && ci.dur1 !== -1) newRow[ci.dur1] = "1";
    else if (wbsLevel === 2 && ci.dur2 !== -1) newRow[ci.dur2] = "1";
    else if (wbsLevel === 3 && ci.dur3 !== -1) newRow[ci.dur3] = "1";
    else if (wbsLevel === 4 && ci.dur4 !== -1) newRow[ci.dur4] = "1";
    else if (ci.period !== -1) newRow[ci.period] = "1";

    newRow._mailRaw = mailRaw || null;
    // 💡 [2026-08-24 신규] AI가 처음 뽑아낸 시작일/완료일 원본을 별도 백업 — 이후 자동 일정계산(특히
    //    ＊AI마커로 인한 _isParallel 처리, 아래 taskName 참고)으로 화면상 날짜가 틀어져도, "📅 AI 분석
    //    날짜로 복원" 버튼(window.restoreAiTaskDate)으로 이 원본값에 언제든 다시 맞출 수 있게 한다.
    //    완료일을 AI가 못 뽑은 경우(_aiOrigPlan이 없음)는 원래도 자동계산에 맡겨진 상태이므로 정상이다.
    newRow._aiOrigStart = r['시작일'] ? _fixYear(r['시작일']) : null;
    newRow._aiOrigPlan  = r['완료일'] ? _fixYear(r['완료일']) : null;

    // ✅ [AI 학습 Phase 1] _aiMeta가 첨부된 경우 AI 등록 표식과 매칭 정보를 row에 저장.
    //    오매칭 삭제 시 window._showAiDeleteFeedback()이 이 필드들을 읽어 학습 데이터를 기록한다.
    if (r['_aiMeta']) {
        newRow._aiRegistered        = true;
        newRow._aiConfidence        = r['_aiMeta'].confidence        || '';
        newRow._aiMatchedProjectId  = r['_aiMeta'].matchedProjectId  || '';
        newRow._aiMatchedProjectName= r['_aiMeta'].matchedProjectName|| '';
        newRow._aiMatchBasis        = r['_aiMeta'].matchBasis        || '';
        newRow._aiMatchKeywords     = r['_aiMeta'].keywords          || [];
        newRow._aiSourceSnippet     = r['_aiMeta'].snippet           || '';
        newRow._aiRegisteredAt      = new Date().toISOString();
    }

    return { row: newRow, taskName: taskName };
};

// ✅ [공용] L0~L4 구간(개발단계 devStage는 하위 레벨까지 forward-fill 되어 있음) 내에서
//    시작일 기준 최적 삽입 위치를 계산. useAuto=false 또는 조건 미충족 시 "구간 끝"으로 fallback.
// 💡 다른 프로젝트에서 방금 불러온 데이터는 화면에 표시된 적이 없어 _calcStartTs가 비어있을 수 있음.
//    recalculateSchedules()의 핵심 계산 로직만 뽑아와서, DOM/로그 등 부작용 없이 순수하게
//    각 행의 _calcStartTs / _calcPlanTs 만 채워주는 함수. (셀 값 자체는 건드리지 않음)
window.computeCalcDatesForRows = function(rows, ci) {
    if (!rows || rows.length === 0) return;
    let tree = []; let stack = {}; let fileGlobalStartTs = null;

    for (let row of rows) {
        if (!row) continue;
        let rawStart = ci.start !== -1 ? row[ci.start] : ""; let pDateStart = parseDateValue(rawStart); let parsedStartTs = pDateStart ? pDateStart.ts : null;
        let rawPlan = ci.plan !== -1 ? row[ci.plan] : ""; let pDatePlan = parseDateValue(rawPlan); let parsedPlanTs = pDatePlan ? pDatePlan.ts : null;
        let dur1 = ci.dur1 !== -1 ? getDurationDays(row[ci.dur1]) : null; let dur2 = ci.dur2 !== -1 ? getDurationDays(row[ci.dur2]) : null; let dur3 = ci.dur3 !== -1 ? getDurationDays(row[ci.dur3]) : null; let dur4 = ci.dur4 !== -1 ? getDurationDays(row[ci.dur4]) : null; let pDur = ci.period !== -1 ? getDurationDays(row[ci.period]) : null;
        let planStr = rawPlan !== null && rawPlan !== undefined ? rawPlan.toString().trim() : ""; let match = planStr.match(/^(\d+)(일|days)?$/i);
        let finalDur = 0; let hasDuration = (dur1 !== null || dur2 !== null || dur3 !== null || dur4 !== null || pDur !== null || match);

        if (row._level === 1 && dur1 !== null) finalDur = dur1; else if (row._level === 2 && dur2 !== null) finalDur = dur2; else if (row._level === 3 && dur3 !== null) finalDur = dur3; else if (row._level === 4 && dur4 !== null) finalDur = dur4; else if (pDur !== null) finalDur = pDur; else if (match && parseInt(match[1], 10) < 10000) finalDur = parseInt(match[1], 10);

        row._finalDuration = finalDur;
        row._isExplicitZero = (finalDur === 0 && (dur1 === 0 || dur2 === 0 || dur3 === 0 || dur4 === 0 || pDur === 0 || (match && parseInt(match[1], 10) === 0)));

        if (row._level === 0 || row._startForced || !hasDuration) row._explicitStartTs = parsedStartTs; else row._explicitStartTs = null;
        if (row._level === 0 || row._planForced || !hasDuration) row._explicitPlanTs = parsedPlanTs; else row._explicitPlanTs = null;
        if (row._explicitStartTs && row._explicitPlanTs && row._explicitPlanTs < row._explicitStartTs) row._explicitPlanTs = row._explicitStartTs;

        if (row._explicitStartTs) {
            if (fileGlobalStartTs === null || row._explicitStartTs < fileGlobalStartTs) fileGlobalStartTs = row._explicitStartTs;
        }

        let taskName = "";
        if (row._level === 0) taskName = row._origDev || ""; else if (row._level === 1) taskName = row._origT1 || ""; else if (row._level === 2) taskName = row._origT2 || ""; else if (row._level === 3) taskName = row._origT3 || ""; else if (row._level === 4) taskName = row._origT4 || "";
        let contentStr = ci.content !== -1 ? (row[ci.content] || "").toString() : "";
        row._isParallel = taskName.includes('*') || taskName.includes('＊') || contentStr.includes('*') || contentStr.includes('＊');

        let node = { row: row, level: row._level, isParallel: row._isParallel, explicitStartTs: row._explicitStartTs, explicitPlanTs: row._explicitPlanTs, duration: row._finalDuration, children: [], startTs: null, endTs: null };

        if (node.level === 0) { tree.push(node); stack[0] = node; stack[1] = null; stack[2] = null; stack[3] = null; stack[4] = null; }
        else {
            let parentLvl = node.level - 1; while (parentLvl >= 0 && !stack[parentLvl]) parentLvl--;
            if (parentLvl >= 0 && stack[parentLvl]) stack[parentLvl].children.push(node); else tree.push(node);
            stack[node.level] = node; for (let l = node.level + 1; l <= 4; l++) stack[l] = null;
        }
    }

    function propagateZero(node) {
        if (node.children.length === 0) return !!node.row._isExplicitZero;
        let allZero = true; for (let i = 0; i < node.children.length; i++) { if (!propagateZero(node.children[i])) allZero = false; }
        node.row._isExplicitZero = allZero; return allZero;
    }
    for (let i = 0; i < tree.length; i++) propagateZero(tree[i]);

    function scheduleNode(node, inheritedStartTs) {
        if (node.explicitStartTs) node.startTs = node.explicitStartTs; else node.startTs = inheritedStartTs || new Date().setHours(0,0,0,0);
        if (node.children.length === 0) {
            let dur = node.duration || 0;
            if (node.explicitPlanTs && (node.level === 0 || dur === 0 || node.row._planForced)) {
                node.endTs = node.explicitPlanTs; node.row._finalDuration = countWorkingDays(node.startTs, node.endTs);
            } else if (dur > 0) { node.endTs = addWorkingDays(node.startTs, dur - 1); }
            else { node.endTs = node.startTs; }
            return;
        }
        let currentWaterfallStart = node.startTs; let maxChildEnd = node.startTs; let groupStartTs = node.startTs; let isFirstValid = true;
        for (let i = 0; i < node.children.length; i++) {
            let child = node.children[i];
            if (child.row._isExplicitZero) { scheduleNode(child, currentWaterfallStart); continue; }
            let intendedStart;
            if (isFirstValid) intendedStart = node.startTs;
            else if (child.isParallel) intendedStart = groupStartTs;
            else intendedStart = currentWaterfallStart;
            scheduleNode(child, intendedStart);
            if (isFirstValid) { groupStartTs = child.startTs; isFirstValid = false; }
            else if (!child.isParallel) { groupStartTs = child.startTs; }
            if (child.endTs > maxChildEnd) maxChildEnd = child.endTs;
            currentWaterfallStart = addWorkingDays(maxChildEnd, 1);
        }
        node.endTs = maxChildEnd;
    }

    let currentL0Start = fileGlobalStartTs || new Date().setHours(0,0,0,0);
    let maxL0End = currentL0Start; let groupL0StartTs = currentL0Start; let isFirstValidL0 = true;
    for (let i = 0; i < tree.length; i++) {
        let l0Node = tree[i];
        if (l0Node.row._isExplicitZero) { scheduleNode(l0Node, currentL0Start); continue; }
        let intendedStart;
        if (isFirstValidL0) intendedStart = currentL0Start;
        else if (l0Node.isParallel) intendedStart = groupL0StartTs;
        else intendedStart = currentL0Start;
        scheduleNode(l0Node, intendedStart);
        if (isFirstValidL0) { groupL0StartTs = l0Node.startTs; isFirstValidL0 = false; }
        else if (!l0Node.isParallel) { groupL0StartTs = l0Node.startTs; }
        if (l0Node.endTs > maxL0End) maxL0End = l0Node.endTs;
        currentL0Start = addWorkingDays(maxL0End, 1);
    }

    function applyDatesToRow(node) {
        node.row._calcStartTs = node.startTs;
        node.row._calcPlanTs = node.endTs;
        for (let child of node.children) applyDatesToRow(child);
    }
    for (let l0Node of tree) applyDatesToRow(l0Node);
};

// 💡 공용: L0(개발단계) 구간별 이름 + 날짜범위(계산된 시작~완료 기준)를 함께 뽑아줌
//    devStage 컬럼 모드/WBS 단일컬럼 모드 모두 지원. 현재 프로젝트/다른 프로젝트 공용.
window.buildL0SectionInfo = function(rows, ci) {
    const out = [];
    const findOrAdd = function(name) {
        for (let i = 0; i < out.length; i++) { if (out[i].name === name) return out[i]; }
        const e = { name: name, startTs: null, endTs: null };
        out.push(e);
        return e;
    };
    const feed = function(name, row) {
        if (!name) return;
        const e = findOrAdd(name);
        const s = row._calcStartTs, p = row._calcPlanTs;
        if (s && (e.startTs === null || s < e.startTs)) e.startTs = s;
        if (p && (e.endTs === null || p > e.endTs)) e.endTs = p;
    };

    if (!rows || rows.length <= 1 || !ci) return out;
    if (ci.devStage !== -1) {
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            feed((row[ci.devStage] || '').toString().trim(), row);
        }
    } else if (ci.wbs !== -1) {
        let curName = null;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            if (row._level === 0) curName = (row._origDev || row[ci.wbs] || '').toString().trim();
            feed(curName, row);
        }
    }
    return out;
};

// 💡 공용: 업무의 시작일이 어느 구간 범위 안에 드는지 찾아서 이름을 반환 (없으면 __END__)
window.pickL0SectionByDate = function(l0List, taskDateStr) {
    const taskTs = (taskDateStr && !taskDateStr.includes('날짜확인필요') && typeof parseDateValue === 'function' && parseDateValue(taskDateStr))
        ? parseDateValue(taskDateStr).ts : null;
    if (!taskTs || !l0List || !l0List.length) return '__END__';

    // 1순위: 업무 시작일이 날짜범위 안에 드는 구간
    let matched = l0List.find(function(sec) { return sec.startTs && sec.endTs && taskTs >= sec.startTs && taskTs <= sec.endTs; });
    // 2순위: 없으면 업무 시작일 이후 가장 가까운 시일에 시작하는 구간
    if (!matched) {
        const later = l0List.filter(function(sec) { return sec.startTs && sec.startTs >= taskTs; })
                             .sort(function(a, b) { return a.startTs - b.startTs; });
        matched = later[0];
    }
    // 3순위: 그래도 없으면 가장 늦게 끝나는 구간
    if (!matched) {
        const latest = l0List.slice().sort(function(a, b) { return (b.endTs || 0) - (a.endTs || 0); });
        matched = latest[0];
    }
    return matched ? matched.name : '__END__';
};

// 💡 타임스탬프 → "YYYY/MM" 형식으로 간단 표기
window.formatYM = function(ts) {
    if (!ts) return '?';
    const d = new Date(ts);
    return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0');
};

window.computeL0InsertPos = function(rows, ci, l0Value, startDateStr, useAuto) {
    if (l0Value === '__END__' || !rows || rows.length <= 1) {
        return { pos: rows ? rows.length : 0, usedDateMatch: false, previewLabel: '📍 맨 끝에 추가' };
    }
    // 구간 범위 탐색
    let first = -1, last = -1;
    if (ci.devStage !== -1) {
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            if ((row[ci.devStage] || '').toString().trim() === l0Value) { if (first === -1) first = i; last = i; }
        }
    } else if (ci.wbs !== -1) {
        // 💡 단일 "개발업무(WBS)" 열 모드: LEVEL 0 행을 찾아서, 다음 LEVEL 0 행 전까지를 그 구간으로 간주
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            if (row._level === 0) {
                const label = (row._origDev || row[ci.wbs] || '').toString().trim();
                if (label === l0Value) {
                    first = i; last = i;
                    for (let j = i + 1; j < rows.length; j++) {
                        const r2 = rows[j]; if (!r2) continue;
                        if (r2._level === 0) break;
                        last = j;
                    }
                    break;
                }
            }
        }
    }
    if (first === -1) {
        return { pos: rows.length, usedDateMatch: false, previewLabel: '⚠️ 해당 구간을 찾지 못해 맨 끝에 추가됩니다.' };
    }
    const fallback = { pos: last + 1, usedDateMatch: false, previewLabel: `📍 [${l0Value}] 구간 끝에 추가` };
    if (!useAuto) return fallback;

    const startTs = (startDateStr && !startDateStr.includes('날짜확인필요') && typeof parseDateValue === 'function' && parseDateValue(startDateStr))
        ? parseDateValue(startDateStr).ts : null;
    if (!startTs) return fallback; // 날짜 미확정 → fallback 유지

    let bestIndex = -1;
    for (let i = first; i <= last; i++) {
        const row = rows[i]; if (!row) continue;
        // 🔧 [버그수정] _calcStartTs 우선, 없으면 셀 값에서 직접 파싱
        let rowStartTs = row._calcStartTs;
        if (!rowStartTs && ci.start !== -1 && row[ci.start]) {
            const _p = (typeof parseDateValue === 'function') ? parseDateValue(row[ci.start]) : null;
            if (_p) rowStartTs = _p.ts;
        }
        if (rowStartTs && rowStartTs > startTs) { bestIndex = i - 1; break; }
    }
    if (bestIndex === -1) return fallback; // 구간 내 모든 행보다 늦은 날짜 → 결과적으로 구간 끝과 동일

    const pos = Math.max(bestIndex + 1, first);
    const anchorRow = rows[pos];
    const anchorName = anchorRow ? (anchorRow._origDev || anchorRow._origT1 || anchorRow._origT2 || anchorRow._origT3 || anchorRow._origT4 || '') : '';
    return { pos: pos, usedDateMatch: true, previewLabel: `🎯 [${l0Value}] 구간 내 "${anchorName || (pos + '행')}" 앞에 자동 삽입` };
};

window.insertMailTask = function() {
    if (!window._mailAnalyzedResult) { alert('먼저 분석을 실행해주세요.'); return; }
    if (!globalData || globalData.length <= 1) { alert('먼저 엑셀 파일을 로드해주세요.'); return; }

    const r = window._mailAnalyzedResult;
    // ✅ 날짜 미입력 시 삽입 차단 (필드 매핑 전에 선검증)
    if ((r['시작일'] || '').includes('날짜확인필요') || (r['완료일'] || '').includes('날짜확인필요')) {
        alert('⚠️ 시작일 또는 완료일을 먼저 입력해주세요.');
        return;
    }

    const insertAfter = parseInt(document.getElementById('mail-insert-position').value);
    const built = window.buildMailTaskRow(r, undefined, undefined, window._mailParsedRaw);

    const pos = insertAfter === -1 ? globalData.length : insertAfter + 1;
    globalData.splice(pos, 0, built.row);

    logChange(pos, -1, "없음", `메일 분석으로 추가: ${built.taskName}`);
    window.closeMailAnalyzer();
    window.recalculateSchedules();
    alert(`✅ "${built.taskName}" 업무가 추가되었습니다!`);
};

