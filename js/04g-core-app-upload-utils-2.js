// [분리됨] 원본: js/04-core-app.js 의 5786~7094행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 파일 업로드 및 유틸리티 로직 2/5
    window.resetProjectSummaryPromptInModal = function() {
        if (!confirm('편집 중인 내용을 버리고 기본 프롬프트로 되돌릴까요?')) return;
        // 💡 리셋도 되돌릴 수 있도록, 리셋 전 현재 프롬프트를 스냅샷으로 남김
        const current = localStorage.getItem('gantt_project_summary_prompt');
        if (current) window.savePsPromptVersionSnapshot(current, '기본값 초기화 전 백업');
        document.getElementById('ai-summary-prompt-textarea').value = window._defaultProjectSummaryPromptTemplate || '';
    };

    // ── 💡 프롬프트 변경 이력 모달 — 메일분석의 방금 고친(단일 ✕, 드래그 가능, 배경 비차단) 표준
    //    패턴을 그대로 따름 ──────────────────────────────────────────────
    window.showPsPromptLogs = function() {
        let logs = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_logs') || '[]');
        let versions = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_versions') || '[]');
        if (logs.length === 0) { alert('프롬프트 변경 이력이 없습니다.'); return; }

        let logModal = document.getElementById('ps-prompt-log-modal');
        if (!logModal) {
            logModal = document.createElement('div');
            logModal.id = 'ps-prompt-log-modal';
            logModal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9260; pointer-events:none; background:none; align-items:center; justify-content:center;';
            logModal.innerHTML = `
                <div id="ps-prompt-log-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                    <div id="ps-prompt-log-drag" style="padding:13px 18px;border-bottom:1px solid #a5c8f0;font-weight:bold;font-size:14px;background:#e7f3ff;color:#1971c2;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
                        <span>🕒 AI 요약 — 프롬프트 변경 이력</span>
                        <button onclick="event.stopPropagation(); document.getElementById('ps-prompt-log-modal').style.display='none'"
                            style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px;
                                   color:var(--modal-icon-text); font-size:16px; cursor:pointer;
                                   width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;
                                   display:flex; align-items:center; justify-content:center; transition:0.15s;"
                            onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';"
                            onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';"
                            title="닫기">✕</button>
                    </div>
                    <div id="ps-prompt-log-content" style="padding:15px;overflow-y:auto;flex:1;"></div>
                    <div style="padding:15px;border-top:1px solid #dee2e6;display:flex;gap:6px;">
                        <button onclick="window.clearPsPromptLogs()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1;padding:10px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;transition:background .15s, border-color .15s;">🗑️ 이력 삭제</button>
                        <button onclick="document.getElementById('ps-prompt-log-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;transition:background .15s, border-color .15s;">닫기</button>
                    </div>
                </div>`;
            document.body.appendChild(logModal);
            window._makeDraggable('ps-prompt-log-box', 'ps-prompt-log-drag');
            window._bindClickToFront('ps-prompt-log-modal');
        }

        // 💡 [2026-08-31 버그 수정] table-layout이 auto(기본값)이던 상태에서 "변경일시"/"수정자" 칸에
        //    white-space:nowrap을 걸어두니, 칸이 좁아질 때 그 글자가 줄바꿈되는 대신 칸 경계를 넘어
        //    옆 칸(다음 열) 위에 겹쳐 보이는 버그가 있었음("...8:20박용훈"처럼 시각과 이름이 붙어 보임).
        //    table-layout:fixed + colgroup으로 각 열 너비를 고정폭 비율로 미리 확보해서, 브라우저가
        //    내용 길이에 따라 열 너비를 제멋대로 줄이지 못하게 막는다.
        let html = '<table style="width:100%; table-layout:fixed; border-collapse:collapse; font-size:12px;"><colgroup><col style="width:14%;"><col style="width:11%;"><col style="width:33%;"><col style="width:33%;"><col style="width:9%;"></colgroup>';
        html += '<tr style="background:#f8f9fa;"><th style="padding:8px;border:1px solid #dee2e6;">변경일시</th><th style="padding:8px;border:1px solid #dee2e6;">수정자</th><th style="padding:8px;border:1px solid #dee2e6;">변경 전 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">변경 후 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">복원</th></tr>';
        [...logs].reverse().forEach((log) => {
            const matched = versions.find(v => v.time === log.time);
            const restoreBtn = matched
                ? `<button onclick="window.restorePsPromptVersion(${matched.version})" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11px; padding:4px 8px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:4px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 복원</button>`
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

        document.getElementById('ps-prompt-log-content').innerHTML = html;
        logModal.style.display = 'flex';
        window.bringModalToFront('ps-prompt-log-modal');
    };

    // 💡 특정 버전으로 복원 — 즉시 저장하지 않고 편집창에 불러와서 검토 후 저장하도록 유도
    window.restorePsPromptVersion = function(version) {
        const versions = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_versions') || '[]');
        const target = versions.find(v => v.version === version);
        if (!target) { alert('해당 버전을 찾을 수 없습니다.'); return; }

        document.getElementById('ps-prompt-log-modal').style.display = 'none';
        const textarea = document.getElementById('ai-summary-prompt-textarea');
        if (textarea) textarea.value = target.prompt;
        alert('📋 v' + version + ' 버전을 불러왔습니다.\n내용을 확인한 후 [💾 팀 공용으로 저장] 버튼을 눌러야 최종 반영됩니다.');
    };

    window.clearPsPromptLogs = function() {
        if (!confirm('프롬프트 변경 이력을 전부 삭제할까요? 되돌릴 수 없습니다.')) return;
        localStorage.removeItem('gantt_project_summary_prompt_logs');
        localStorage.removeItem('gantt_project_summary_prompt_versions');
        document.getElementById('ps-prompt-log-modal').style.display = 'none';
        alert('✅ 이력이 삭제되었습니다.');
    };

    // ── 💡 [2026-08-24 신규] AI 요약 피드백(👍/👎) + AI 프롬프트 자동개선 요청 ─────────────
    //    메일분석의 피드백/개선 시스템(saveFeedbackLog / triggerPromptImprove / _simpleLineDiff /
    //    renderPromptDiffHtml / showImprovePreviewModal / applyImprovedPrompt)과 완전히 동일한
    //    설계를 그대로 재사용하되, 이 기능엔 "사용자가 수정하는 편집 가능 필드"가 없으므로(읽기
    //    전용 AI 리포트) "AI 원본 vs 사용자 수정본" diff 대신 "리포트 결과 + 사용자 코멘트"만 기록.
    //    diff 유틸(_simpleLineDiff/renderPromptDiffHtml)은 범용이라 그대로 재사용.
    const _PSF_KEY = 'gantt_project_summary_feedback';
    window._projectSummaryPromptVersion = parseInt(localStorage.getItem('gantt_project_summary_prompt_version') || '1', 10);
    window._lastPsFeedbackUid = null; // 방금 저장한 피드백 uid (개선 요청 시 코멘트를 채워넣을 대상)

    window.saveProjectSummaryFeedback = function(rating) {
        const r = (window.projectMeta || {}).aiSummaryReport;
        if (!r) return;
        const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
        const uid = 'psfb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        log.unshift({
            uid: uid,
            date: new Date().toISOString(),
            promptVersion: window._projectSummaryPromptVersion,
            report: { 신호등: r.신호등, 총평: r.총평, 리스크: r.리스크, 액션추천: r.액션추천 },
            userComment: '',
            rating: rating,
            improved: false
        });
        if (log.length > 200) log.splice(200);
        localStorage.setItem(_PSF_KEY, JSON.stringify(log));

        const goodBtn = document.getElementById('ps-fb-good-btn');
        const badBtn  = document.getElementById('ps-fb-bad-btn');
        const triggerRow = document.getElementById('ps-fb-improve-trigger-row');

        if (rating === 'good') {
            window._lastPsFeedbackUid = null;
            if (triggerRow) triggerRow.style.display = 'none';
            if (goodBtn) { goodBtn.style.background = '#c9ecd3'; goodBtn.style.color = '#1f7a3d'; goodBtn.dataset.active = '1'; }
            if (badBtn)  { badBtn.style.background = '#fbe4e2'; badBtn.style.color = '#b1432f'; delete badBtn.dataset.active; }
            if (window.showToast) window.showToast('👍 피드백이 저장되었습니다.', 'info');
        } else {
            window._lastPsFeedbackUid = uid;
            if (triggerRow) triggerRow.style.display = 'block'; // 💡 나쁨 선택 시에만 개선요청 버튼 노출
            if (badBtn)  { badBtn.style.background = '#f5c2bd'; badBtn.style.color = '#b1432f'; badBtn.dataset.active = '1'; }
            if (goodBtn) { goodBtn.style.background = '#e6f6ea'; goodBtn.style.color = '#1f7a3d'; delete goodBtn.dataset.active; }
        }
    };

    // ── 💡 개선 요청 코멘트 입력 모달 (메일분석의 improve-comment-modal과 별도 — id 충돌 방지) ──
    // 💡 [2026-08-24 UX 개선] 다른 팝업들처럼 표준 모달 기능(드래그 이동, 배경 흐림/딤 처리로 뒤 화면
    //    조작 차단, 배경 클릭 시 닫기, 우상단 ✕ 버튼)을 적용 — 메일분석의 improve-comment-modal과
    //    동일한 처리를 적용함(디자인 일관성).
    window.openPsImproveCommentModal = function() {
        let modal = document.getElementById('ps-improve-comment-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ps-improve-comment-modal';
            // 💡 [2026-08-24] 처음엔 backdrop-filter:blur(3px)를 넣었는데, 개선 요청 코멘트를 쓰려면
            //    뒤에 있는 리포트/분석 결과 내용을 보면서 참고해야 하는데 블러 때문에 안 읽혀서 제거함
            //    (배경 톤만 살짝 남기고 흐림 효과는 뺌 — 뒤 내용이 그대로 읽힘).
            // 💡 [2026-08-24] 배경 클릭 시 닫히던 걸 제거함 — 코멘트를 쓰다가 뒤 리포트를 참고하려고
            //    배경을 클릭했는데 모달이 닫혀버리는 게 불편하다는 피드백. 이제 ✕ 버튼으로만 닫힘.
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9250; background:rgba(255,218,185,0.22);';
            modal.innerHTML = `
            <div id="ps-improve-comment-box" onclick="event.stopPropagation()" style="position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:200px;">
                <div id="ps-improve-comment-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>✏️ 어떤 부분이 문제였나요?</span>
                    <button onclick="event.stopPropagation(); document.getElementById('ps-improve-comment-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                </div>
                <div style="padding:18px;">
                    <textarea id="ps-improve-comment-input" placeholder="예: 완료율이 높은데도 신호등을 🔴로 판단함 (선택 입력)"
                        style="width:100%; min-height:80px; font-size:13px; border:1px solid #ced4da; border-radius:6px; padding:8px; box-sizing:border-box; resize:vertical;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:12px;">
                        <button onclick="window.submitPsImproveComment()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🤖 요청</button>
                        <button onclick="document.getElementById('ps-improve-comment-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:9px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">✖ 취소</button>
                    </div>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('ps-improve-comment-box', 'ps-improve-comment-drag');
            window._bindClickToFront('ps-improve-comment-modal');
        }
        document.getElementById('ps-improve-comment-input').value = '';
        modal.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('ps-improve-comment-modal');
    };

    window.submitPsImproveComment = function() {
        const comment = document.getElementById('ps-improve-comment-input').value.trim();
        document.getElementById('ps-improve-comment-modal').style.display = 'none';

        if (window._lastPsFeedbackUid) {
            const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
            const it = log.find(function(x) { return x.uid === window._lastPsFeedbackUid; });
            if (it) { it.userComment = comment; localStorage.setItem(_PSF_KEY, JSON.stringify(log)); }
        }
        window.triggerProjectSummaryPromptImprove('instant', comment);
    };

    // 💡 다운스트림 코드가 의존하는 필수 구조(JSON 4개 키) + 데이터 치환용 플레이스홀더가
    //    개선된 프롬프트에도 살아있는지 검사 (메일분석 validatePromptStructure와 동일한 목적)
    window.validateProjectSummaryPromptStructure = function(promptText) {
        const requiredJsonKeys = ['신호등', '총평', '리스크', '액션추천'];
        const requiredPlaceholders = ['${customer}', '${model}', '${pm}', '${totalTasks}', '${countDone}', '${countProgress}', '${countPending}', '${countDelay}', '${delayedList}', '${dueSoonList}', '${recentLogs}'];
        const missing = [];
        requiredJsonKeys.forEach(function(k) {
            if (promptText.indexOf('"' + k + '"') === -1) missing.push('JSON 키: "' + k + '"');
        });
        requiredPlaceholders.forEach(function(p) {
            if (promptText.indexOf(p) === -1) missing.push('플레이스홀더: ' + p);
        });
        return missing; // 빈 배열이면 이상 없음
    };

    window.triggerProjectSummaryPromptImprove = async function(mode, instantComment) {
        const currentPrompt = localStorage.getItem('gantt_project_summary_prompt') || window._defaultProjectSummaryPromptTemplate || '';
        const apiKey = window.getActiveAiKey(); // 💡 선택된 provider(Gemini/Groq/Mistral)에 맞는 키를 정식 헬퍼로 조회
        let casesText = '';
        let targetUids = [];

        if (mode === 'instant') {
            // 즉시 모드: 방금 남긴 피드백 1건만
            const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
            const fb = window._lastPsFeedbackUid ? log.find(function(x) { return x.uid === window._lastPsFeedbackUid; }) : null;
            const rep = (fb && fb.report) || (window.projectMeta || {}).aiSummaryReport || {};
            targetUids = window._lastPsFeedbackUid ? [window._lastPsFeedbackUid] : [];
            // 💡 이 기능엔 "사용자 수정본"이 없으므로(읽기전용 리포트), AI가 만든 리포트 결과 + 사용자 코멘트만 케이스로 제공
            casesText = `[케이스 1]\n생성된 리포트:\n신호등: ${rep.신호등 || ''}\n총평: ${rep.총평 || ''}\n리스크: ${(rep.리스크 || []).join(' / ') || '(없음)'}\n액션추천: ${(rep.액션추천 || []).join(' / ') || '(없음)'}\n\n사용자 코멘트: ${instantComment || '(없음)'}`;
        } else {
            // 💡 [2026-08-24 신규] 배치 모드 — 지금까지 쌓인 👎 피드백(improved:false) 케이스를 모아
            //    한 번에 개선 요청 (메일분석 프롬프트의 "🤖 일괄개선"과 동일한 개념)
            const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
            const pending = log.filter(function(x) { return x.rating === 'bad' && !x.improved; }).slice(0, 10);
            targetUids = pending.map(function(x) { return x.uid; });
            if (!pending.length) {
                alert('⚠️ 개선할 피드백 케이스가 없습니다.\n먼저 리포트 결과에서 👎 버튼을 눌러 케이스를 쌓아주세요.');
                return;
            }
            casesText = pending.map(function(fb, i) {
                const rep = fb.report || {};
                return `[케이스 ${i + 1}] (${fb.date ? fb.date.slice(0, 10) : ''})\n신호등: ${rep.신호등 || ''}\n총평: ${rep.총평 || ''}\n리스크: ${(rep.리스크 || []).join(' / ') || '(없음)'}\n액션추천: ${(rep.액션추천 || []).join(' / ') || '(없음)'}\n사용자 코멘트: ${fb.userComment || '(없음)'}`;
            }).join('\n\n---\n\n');
        }

        // 💡 JSON 대신 구분자 방식 — 프롬프트 원문의 줄바꿈/따옴표로 인한 이스케이프 깨짐 방지
        // 💡 이 구조(JSON 키/플레이스홀더)는 다른 코드가 직접 파싱/치환하므로 AI가 절대 바꾸면 안 됨
        const PROTECTED_STRUCTURE_RULE = `\n\n🔒 절대 변경 금지 규칙 (반드시 준수):\n프롬프트 내용을 개선하되, 아래 구조적 요소는 절대 이름/형식을 바꾸지 마세요. 이 값들은 다른 프로그램 코드가 그대로 파싱/치환하고 있어서, 조금이라도 바뀌면 시스템이 깨집니다.\n1. 최종 JSON 응답의 키 이름은 정확히 이 4개만 사용: "신호등","총평","리스크","액션추천" (키 이름 변경/추가/삭제 금지)\n2. "신호등" 값은 반드시 🟢 또는 🟡 또는 🔴 중 하나\n3. 아래 플레이스홀더는 정확히 이 이름 그대로 유지해야 합니다 (삭제/이름변경 금지): \${customer} \${model} \${pm} \${totalTasks} \${countDone} \${countProgress} \${countPending} \${countDelay} \${delayedList} \${dueSoonList} \${recentLogs}\n표현/지시문/설명 등 나머지는 자유롭게 개선해도 됩니다.`;

        const improvePrompt = `당신은 AI 프롬프트 개선 전문가입니다.\n아래는 현재 사용 중인 "AI 프로젝트 요약 리포트" 프롬프트와, 이 프롬프트로 생성했을 때 사용자가 "나쁨"으로 평가한 사례입니다.\n\n=== 현재 프롬프트 ===\n${currentPrompt}\n\n=== 실패 케이스 ===\n${casesText}${PROTECTED_STRUCTURE_RULE}\n\n위 케이스에서 프롬프트의 어떤 부분이 문제인지 분석하고, 개선된 프롬프트 전문을 제안해주세요.\n\n반드시 아래 형식 그대로만 응답하세요. JSON이나 코드블록(\`\`\`)은 절대 사용하지 마세요.\n\n===ANALYSIS===\n(여기에 문제점 분석을 3줄 이내로 작성)\n===PROMPT===\n(여기에 개선된 프롬프트 전문을 기존과 동일한 형식으로 작성)\n===END===`;

        if (window.showToast) window.showToast('🤖 AI 개선 요청 중...', 'info');
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
                throw new Error('AI 응답 형식을 해석하지 못했습니다.');
            }
            // 💡 구조 손상 여부 검증 — 다운스트림 코드가 의존하는 필수 요소가 빠졌는지 확인
            const structIssues = window.validateProjectSummaryPromptStructure(improvedPrompt);
            window.showPsImprovePreviewModal(analysis, improvedPrompt, targetUids, currentPrompt, isTruncated, structIssues);
        } catch(e) {
            alert('❌ AI 개선 요청 실패: ' + (e && e.message ? e.message : e));
        }
    };

    // ── 💡 개선 결과 미리보기 모달 (diff 유틸은 메일분석과 공유, 모달 자체는 별도) ──────────
    window.showPsImprovePreviewModal = function(analysis, improvedPrompt, targetUids, originalPrompt, isTruncated, structIssues) {
        let modal = document.getElementById('ps-improve-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ps-improve-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9300; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="ps-improve-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                <div id="ps-improve-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>🤖 AI 프롬프트 개선 제안 (프로젝트 요약)</span>
                    <button onclick="document.getElementById('ps-improve-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                </div>
                <div id="ps-improve-truncate-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:12px; color:#856404;"></div>
                <div id="ps-improve-struct-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#ffe3e3; border:1px solid #e03131; border-radius:6px; font-size:12px; color:#c92a2a;"></div>
                <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔍 문제점 분석</div>
                        <div id="ps-improve-analysis-text" style="font-size:12px; color:#333; background:#f8f9fb; border:1px solid #e6e9ef; border-radius:6px; padding:10px; white-space:pre-wrap; line-height:1.6;"></div>
                    </div>
                    <div>
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔀 변경사항 (원본 대비)
                            <span style="font-weight:normal; color:#999;">(빨강=삭제, 초록=추가)</span>
                        </div>
                        <div id="ps-improve-diff-view" style="max-height:220px; overflow-y:auto; font-size:11.5px; font-family:'Malgun Gothic',monospace; border:1px solid #e6e9ef; border-radius:6px; line-height:1.5; background:#fff;"></div>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column;">
                        <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">✏️ 개선된 프롬프트 (수정 가능)</div>
                        <textarea id="ps-improve-prompt-textarea" style="flex:1; min-height:200px; font-size:12px; font-family:'Malgun Gothic',monospace; border:1px solid #ced4da; border-radius:6px; padding:10px; resize:vertical; line-height:1.6;"></textarea>
                    </div>
                </div>
                <div style="padding:12px 16px; display:flex; gap:8px; border-top:1px solid #eee;">
                    <button onclick="window.applyImprovedPsPrompt()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ 채택</button>
                    <button onclick="document.getElementById('ps-improve-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:10px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">❌ 무시</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('ps-improve-box', 'ps-improve-drag');
            window._bindClickToFront('ps-improve-modal');
        }

        const warnBar = document.getElementById('ps-improve-truncate-warning');
        warnBar.textContent = '⚠️ AI 응답이 중간에 잘렸을 수 있습니다 (종료 마커 없음). 채택 전 아래 프롬프트 끝부분을 꼭 확인하세요.';
        warnBar.style.display = isTruncated ? 'block' : 'none';

        const structBar = document.getElementById('ps-improve-struct-warning');
        if (structIssues && structIssues.length) {
            structBar.innerHTML = '🚨 다른 코드가 의존하는 필수 요소가 빠진 것 같습니다: <b>' + structIssues.join(', ') + '</b>';
            structBar.style.display = 'block';
        } else {
            structBar.style.display = 'none';
        }

        document.getElementById('ps-improve-diff-view').innerHTML = window.renderPromptDiffHtml(originalPrompt || '', improvedPrompt);
        document.getElementById('ps-improve-analysis-text').textContent = analysis;
        document.getElementById('ps-improve-prompt-textarea').value = improvedPrompt;
        modal._targetUids = targetUids || [];
        modal.style.display = 'block';
        window.bringModalToFront('ps-improve-modal');
    };

    // ── 💡 개선 프롬프트 채택 ───────────────────────────────────────────────
    window.applyImprovedPsPrompt = async function() {
        const text = document.getElementById('ps-improve-prompt-textarea').value.trim();
        if (!text) { alert('프롬프트가 비어있습니다.'); return; }

        // 💡 [2026-08-24 안전장치 추가] 팀 공용 프롬프트를 덮어쓰는 파괴적 액션이라, 수동 편집(✏️ 프롬프트
        //    편집 모달의 "🔒 수정하기")과 동일하게 관리자 비밀번호 인증을 요구함.
        if (!window.verifyAdminPassword('🔒 개선된 프롬프트를 채택하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
            alert('❌ 비밀번호 인증 실패. 채택이 취소되었습니다.');
            return;
        }

        // 버전 증가
        const oldPrompt = localStorage.getItem('gantt_project_summary_prompt') || window._defaultProjectSummaryPromptTemplate || '';
        window._projectSummaryPromptVersion = (window._projectSummaryPromptVersion || 1) + 1;
        localStorage.setItem('gantt_project_summary_prompt_version', String(window._projectSummaryPromptVersion));
        localStorage.setItem('gantt_project_summary_prompt', text);

        // ✅ 변경 이력 저장 (지금까지 AI 개선 채택 시 버전 번호만 올라가고 실제 이력/복원 기능은 빠져 있었음)
        let psLogs = JSON.parse(localStorage.getItem('gantt_project_summary_prompt_logs') || '[]');
        psLogs.push({
            time: new Date().toLocaleString('ko-KR'),
            userName: (window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음') + ' (AI개선 채택 v' + window._projectSummaryPromptVersion + ')',
            oldPrompt: oldPrompt.substring(0, 200) + (oldPrompt.length > 200 ? '...' : ''),
            newPrompt: text.substring(0, 200) + (text.length > 200 ? '...' : '')
        });
        if (psLogs.length > 20) psLogs = psLogs.slice(-20);
        localStorage.setItem('gantt_project_summary_prompt_logs', JSON.stringify(psLogs));
        window.savePsPromptVersionSnapshot(text, 'AI개선 채택 v' + window._projectSummaryPromptVersion);

        // improved: true 마킹
        const modal = document.getElementById('ps-improve-modal');
        const uids = (modal && modal._targetUids) || [];
        if (uids.length) {
            const log = JSON.parse(localStorage.getItem(_PSF_KEY) || '[]');
            uids.forEach(function(uid) {
                const it = log.find(function(x) { return x.uid === uid; });
                if (it) it.improved = true;
            });
            localStorage.setItem(_PSF_KEY, JSON.stringify(log));
        }

        // Drive 저장 (팀 공용 프롬프트 파일에 반영)
        // 💡 [2026-08-24 버그 수정] 드라이브 미연동 상태거나 업로드가 실패하면, 방금 채택한 내용이
        //    로컬에만 남는데 — 이후 드라이브가 연결되면 loadProjectSummaryPromptFromDrive()가 (옛)
        //    드라이브 버전을 그대로 받아와 이 로컬 변경을 조용히 덮어써버리는 문제가 있었음
        //    ("채택했는데 다시 들어오면 저장 안 되어 있음"). "아직 드라이브에 못 올린 변경이 있다"는
        //    표시를 남겨서, 다음 로드 시 덮어쓰는 대신 먼저 이 변경을 드라이브로 올리도록 함.
        if (window.isDriveConnected && window.saveProjectSummaryPromptToDrive) {
            const ok = await window.saveProjectSummaryPromptToDrive(text);
            if (ok) {
                localStorage.removeItem('gantt_project_summary_prompt_pending_push');
                alert('✅ 개선된 프롬프트가 채택되어 드라이브에 저장되었습니다. (v' + window._projectSummaryPromptVersion + ')');
            } else {
                localStorage.setItem('gantt_project_summary_prompt_pending_push', '1');
                alert('⚠️ 로컬에는 저장됐지만 드라이브 업로드에 실패했습니다. 다음 드라이브 연결 시 자동으로 다시 시도합니다.');
            }
        } else {
            localStorage.setItem('gantt_project_summary_prompt_pending_push', '1');
            alert('✅ 개선된 프롬프트가 채택되었습니다. (v' + window._projectSummaryPromptVersion + ')\n(현재 드라이브 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다)');
        }
        modal.style.display = 'none';
    };

    // 💡 [PDF] 리포트 카드만 별도 인쇄영역(#ai-summary-print-area)에 복제해서 window.print() —
    //    Gantt 표 전용 인쇄 규칙(zoom 0.7 등)과 안 섞이도록 별도 영역/모드 클래스 사용
    window.printAiProjectSummary = function() {
        const content = document.getElementById('ai-summary-report-content');
        if (!content) { alert('먼저 [🔄 다시 생성]으로 리포트를 만들어주세요.'); return; }
        let printArea = document.getElementById('ai-summary-print-area');
        if (!printArea) { printArea = document.createElement('div'); printArea.id = 'ai-summary-print-area'; document.body.appendChild(printArea); }
        const pm = window.projectMeta || {};
        const title = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';
        printArea.innerHTML = `<div style="padding:10px; font-family:'맑은 고딕',sans-serif; color:#333;">
            <h2 style="margin:0 0 4px; color:#2c5f8a;">🤖 AI 요약 — ${escapeHtml(title)}</h2>
            <div>${content.innerHTML}</div>
        </div>`;
        document.body.classList.add('ai-summary-printing-mode');
        window.print();
    };

    // 💡 [PPT] 신호등/총평/통계/리스크/액션추천을 2슬라이드짜리 PowerPoint로 — Weekly Report PPT 내보내기와
    //    동일 라이브러리(PptxGenJS, 이미 로드돼 있음) 재사용, 색상/여백은 이 리포트 전용으로 단순화
    window.exportAiProjectSummaryPPT = function() {
        if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로드에 실패했습니다. 새로고침 후 다시 시도해주세요.'); return; }
        const r = (window.projectMeta || {}).aiSummaryReport;
        if (!r) { alert('먼저 [🔄 다시 생성]으로 리포트를 만들어주세요.'); return; }
        const d = r.dataSnapshot || { counts: {}, project: {} };
        const pm = window.projectMeta || {};
        const title = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';

        const pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
        pptx.layout = 'WIDE';
        const SKY = '2C5F8A';

        const slide = pptx.addSlide();
        slide.addText(`🤖 AI 요약 — ${title}`, { x: 0.4, y: 0.3, w: 12.5, h: 0.6, fontSize: 22, bold: true, color: SKY });
        slide.addText(`${r.신호등 || ''}  ${r.총평 || ''}`, { x: 0.4, y: 1.0, w: 12.5, h: 0.6, fontSize: 16, bold: true, color: '333333' });

        const statLabels = ['완료', '진행', '대기', '지연'];
        const statColors = ['2F9E44', '1971C2', 'B85C00', 'E03131'];
        statLabels.forEach(function(label, i) {
            slide.addShape(pptx.ShapeType.roundRect, { x: 0.4 + i * 3.1, y: 1.8, w: 2.9, h: 1.0, fill: { color: 'F5F5F5' }, line: { color: 'DDDDDD', width: 0.5 } });
            slide.addText(String((d.counts && d.counts[label]) || 0), { x: 0.4 + i * 3.1, y: 1.85, w: 2.9, h: 0.55, align: 'center', fontSize: 24, bold: true, color: statColors[i] });
            slide.addText(label, { x: 0.4 + i * 3.1, y: 2.4, w: 2.9, h: 0.35, align: 'center', fontSize: 12, color: '666666' });
        });

        slide.addText('⚠️ 주요 리스크', { x: 0.4, y: 3.1, w: 6.0, h: 0.4, fontSize: 14, bold: true, color: SKY });
        slide.addText((r.리스크 && r.리스크.length ? r.리스크 : ['특별한 리스크 없음']).map(function(x) { return { text: x, options: { bullet: true, breakLine: true, fontSize: 11 } }; }),
            { x: 0.4, y: 3.5, w: 6.0, h: 3.3, valign: 'top' });

        slide.addText('✅ 담당자별 액션 추천', { x: 6.9, y: 3.1, w: 6.0, h: 0.4, fontSize: 14, bold: true, color: SKY });
        slide.addText((r.액션추천 && r.액션추천.length ? r.액션추천 : ['추천 액션 없음']).map(function(x) { return { text: x, options: { bullet: true, breakLine: true, fontSize: 11 } }; }),
            { x: 6.9, y: 3.5, w: 6.0, h: 3.3, valign: 'top' });

        const fileBase = 'AI프로젝트요약_' + title.replace(/[\\\/:*?"<>|]/g, '');
        pptx.writeFile({ fileName: `${fileBase}.pptx` });
    };

    // ═══════════════════════════════════════════════════════════
    // 💡 [2026-08-26 신규] 💬 Gantt AI 문답 — "AI 프로젝트 요약"이 지연/임박 업무만 정해진 형식으로
    //    보여주는 것과 달리, 여기서는 사용자가 이 프로젝트의 Gantt 데이터에 대해 자유로운 형식으로
    //    무엇이든 물어보고 AI가 실제 업무 목록 데이터를 근거로 답변한다. 대화는 채팅 형태로 이어지며,
    //    AI 프로젝트 요약과 동일한 백엔드 호출(window.callAiBackend/getActiveAiKey)을 그대로 재사용.
    //    GAS 백엔드가 단일 prompt 문자열만 받으므로, 매 턴마다 [업무 목록 + 지금까지의 대화 + 새 질문]을
    //    하나의 프롬프트로 합쳐서 보낸다(멀티턴을 흉내). 대화 내용은 저장하지 않는 휘발성 세션 상태.
    // ═══════════════════════════════════════════════════════════
    window._ganttQaHistory = [];
    // 💡 [2026-09-01 신규] "📤 메일 작성/발송" 기능이 [[MAIL_DRAFT]]로 만든, 아직 발송 확정 전인
    //    초안 1건(이름→이메일까지 resolve된 구조화 데이터) — 발송/취소/새 초안 생성 시 교체·소진됨.
    window._ganttQaPendingMailDraft = null;
    // 💡 [2026-09-01 신규] "📢 공지 등록"/"📌 알람 세부 설정" 기능도 메일 초안과 동일한 2단계
    //    (초안 → 사람 확인) 왕복 구조를 쓴다 — 각각 아직 확정 전인 초안 1건만 보관.
    window._ganttQaPendingNoticeDraft = null;
    window._ganttQaPendingAlarmDraft = null;

    // 💡 [2026-08-29 신규 — 버그 수정] "다른 프로젝트로 이동해서 물어보면 응답이 없다(⏳가 멈추지 않음).
    //    내용을 지우고 다시 물으면 답한다"는 제보 — 프로젝트를 전환한 직후엔 구글 드라이브 토큰이 막
    //    갱신 중이거나 네트워크가 일시적으로 불안정한 경우가 있는데, fetch 자체엔 타임아웃이 없어서
    //    (아래 Elec Parts 라이브러리 조회, callAiBackend의 GAS 호출 등) 요청이 "실패"도 "성공"도 아닌
    //    채로 영원히 멈춰버릴 수 있다 — try/catch로는 못 잡는다(예외가 안 나고 그냥 응답이 안 오는 것).
    //    그러면 "⏳ 답변 생성 중..." 표시가 영원히 안 바뀌어 사용자 눈엔 "응답 없음"으로 보인다.
    //    지정 시간 안에 안 끝나면 강제로 실패 처리(reject)하는 범용 타임아웃 래퍼를 만들어서, 오래 걸리는
    //    비동기 호출들을 감싸 "무한 대기"를 "명확한 오류 메시지"로 바꾼다(사용자가 재시도할 수 있게).
    window._withTimeout = function(promise, ms, timeoutMessage) {
        return new Promise(function(resolve, reject) {
            const timer = setTimeout(function() { reject(new Error(timeoutMessage || `요청이 ${Math.round(ms / 1000)}초 안에 끝나지 않았습니다. 네트워크 상태를 확인하고 다시 시도해주세요.`)); }, ms);
            promise.then(function(v) { clearTimeout(timer); resolve(v); }, function(e) { clearTimeout(timer); reject(e); });
        });
    };

    // 💡 Gantt 원본 전체를 보내면 너무 크므로, 업무 1건당 한 줄로 압축해서 최대 MAX_TASKS건까지만 포함
    window._buildGanttQaContext = async function() {
        // 🐛 [2026-08-30 버그 수정] 위 _buildProjectSummaryData와 동일한 원인 — Summary 탭 입력값은
        // collectTabData()를 거쳐야 window.projectMeta/window.tabData.summary에 반영되는데, AI 문답도
        // 이걸 안 부르고 있어서 "정보를 고쳤는데도 AI가 예전 정보로 답한다"는 문제가 있었다.
        if (window.collectTabData) window.collectTabData();
        const pm = window.projectMeta || {};
        // 💡 [2026-08-28 신규] "이 업무 알람 걸어줘" 같은 실행 요청을 처리하려면 AI가 각 업무를 어느
        //    globalData 인덱스로 다시 가리켜야 하는지 알아야 한다 — filter로 빠지는 행이 있어 slice
        //    순서만으론 원래 인덱스를 복원할 수 없으므로, filter 전에 원래 인덱스(idx)를 먼저 붙여둔다.
        const rows = (typeof globalData !== 'undefined' && globalData)
            ? globalData.map(function(r, i) { return { row: r, idx: i }; }).slice(1).filter(function(x) { return x.row && x.row._level !== undefined; })
            : [];
        const koMap = (typeof LANG !== 'undefined' && LANG.ko && LANG.ko.statusMap) ? LANG.ko.statusMap : {};

        const normStatus = function(raw) {
            const s = (raw || '').toString().trim();
            if (!s) return '(미지정)';
            const key = Object.keys(koMap).find(function(k) { return k.toLowerCase() === s.toLowerCase(); });
            return key ? koMap[key] : s;
        };
        const taskLabel = function(row) {
            if (row._level === 0) return row._origDev || '';
            if (row._level === 1) return row._origT1 || '';
            if (row._level === 2) return row._origT2 || '';
            if (row._level === 3) return row._origT3 || '';
            return row._origT4 || '';
        };

        // 💡 [버그 수정] "오늘 업무 정리해줘"/"이번주 마감" 같은 상대 날짜 질문에 AI가 답하려면 "오늘이
        //    몇 일인지"를 알아야 하는데, 지금까지 프롬프트 어디에도 실제 날짜를 문자로 넣어주지 않았음
        //    (지연/D-day 계산에 today 변수는 썼지만 AI에게 보여주진 않았음) — AI 입장에선 "오늘"이 뭔지
        //    알 방법이 없으니, "추측하지 말라"는 지시를 충실히 따라 매번 "데이터에서 확인되지 않습니다"로
        //    답한 것. 오늘 날짜/요일을 프롬프트에 명시해서 상대 날짜 추론이 가능하도록 함.
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const _weekdayKo = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} (${_weekdayKo}요일)`;
        const MAX_TASKS = 300; // 프롬프트 크기 보호 — 이보다 많으면 뒤는 생략하고 건수만 알림
        const lines = [];
        rows.slice(0, MAX_TASKS).forEach(function(x) {
            const row = x.row;
            const label = taskLabel(row) || '(제목없음)';
            const status = normStatus(colIdx.status !== -1 ? row[colIdx.status] : '');
            const assignee = (colIdx.assignee !== -1 && row[colIdx.assignee]) ? row[colIdx.assignee] : '미지정';
            const start = (colIdx.start !== -1 && row[colIdx.start]) ? row[colIdx.start] : '';
            const plan = (colIdx.plan !== -1 && row[colIdx.plan]) ? row[colIdx.plan] : (row._calcPlanTs ? formatTsToYMD(row._calcPlanTs) : '');
            // 💡 [버그 수정] 120자로 너무 짧게 잘라서, "요약해줘" 질문에 AI가 실제 내용(무슨 이슈인지)을
            //    읽고 종합할 재료가 부족해 이름/날짜/상태만 재나열하는 결과로 이어졌음 — 특히 메일 자동
            //    등록 업무(＊AI📧)는 상세내용에 실제 이슈 내용이 들어있는데 이게 대부분 잘려나갔었음.
            //    고정값 대신 [🤖 AI 도구 > ⚙️ 설정]에서 사용자가 정한 길이(기본 500자)를 씀.
            const _qaMaxLen = window.getAiContentMaxLen ? window.getAiContentMaxLen() : 500;
            const content = (colIdx.content !== -1 && row[colIdx.content]) ? String(row[colIdx.content]).replace(/\s+/g, ' ').trim().slice(0, _qaMaxLen) : '';
            const answer = (colIdx.answer !== -1 && row[colIdx.answer]) ? String(row[colIdx.answer]).replace(/\s+/g, ' ').trim().slice(0, _qaMaxLen) : '';

            let dueTag = '';
            if (status !== '완료' && plan) {
                const pd = new Date(plan);
                if (!isNaN(pd)) {
                    pd.setHours(0, 0, 0, 0);
                    const diff = Math.round((pd - today) / 86400000);
                    if (diff < 0) dueTag = ` [지연 ${-diff}일]`;
                    else if (diff <= 7) dueTag = ` [D-${diff}]`;
                }
            }
            const alarmTag = row._알림 ? ' [알람ON]' : '';
            // 💡 [2026-08-28 신규] "원문 메일도 봐줘" 질문에 AI가 답하려면 이 업무에 원본 이메일이
            //    저장돼 있는지부터 알아야 한다 — 전문을 매번 다 넣으면(업무당 최대 수천 자) 프롬프트가
            //    폭발하므로, 목록에는 있음/없음 표시만 두고 실제 전문은 AI가 [[ACTION:VIEW_MAIL:번호]]
            //    태그로 "요청"할 때만 별도 조회해서 후속 프롬프트에 끼워넣는다(아래 _buildGanttQaPrompt/
            //    sendGanttQaMessage 참고, SET_ALARM 태그와 같은 패턴).
            const mailTag = row._mailRaw ? ' [원문有]' : '';
            // 💡 [2026-08-28 신규] "시작:2026-08-26 | 계획:2026-08-27"처럼 풀어쓰던 것을 "기간:8/26~8/27"
            //    형태로 압축(window._fmtDateRangeShort) — AI가 답변에 옮겨 적을 때도 이 짧은 표기를
            //    그대로 쓰도록 프롬프트 지시문에서 유도한다(아래 _buildGanttQaPrompt 참고).
            const dateRange = window._fmtDateRangeShort(start, plan) || '-';
            // 💡 [2026-08-28 신규] "담당자/발신인/수신인 기준으로 검색해줘"에 답 못하던 문제 수정 —
            //    window._extractMailSenderReceiver 참고.
            const mailPeople = window._extractMailSenderReceiver(colIdx.content !== -1 ? row[colIdx.content] : '');
            let line = `- #G${x.idx} Lv${row._level} "${label}" | 담당:${assignee} | 상태:${status}${dueTag}${alarmTag}${mailTag} | 기간:${dateRange}`;
            if (mailPeople.sender) line += ` | 발신:${mailPeople.sender}`;
            if (mailPeople.receiver) line += ` | 수신:${mailPeople.receiver}`;
            if (content) line += ` | 내용:${content}`;
            if (answer) line += ` | 대응:${answer}`;
            lines.push(line);
        });
        const omittedNote = rows.length > MAX_TASKS ? `\n...(그 외 ${rows.length - MAX_TASKS}건은 용량 제한으로 생략됨)` : '';

        const recentLogs = (window.changeLogs || []).slice(-20).reverse().map(function(l) {
            return `${l.time} ${l.userName} — ${l.rowName}/${l.colName}: ${l.oldVal} → ${l.newVal}`;
        });

        // 💡 [버그 수정] 처음엔 Gantt 업무 목록만 컨텍스트로 넣었는데, "Summary" 탭에 있는 프로젝트 개요/
        //    담당자/주요 자재 등을 물어보면 이 데이터가 아예 없어서 AI가 무조건 "데이터에서 확인되지
        //    않습니다"라고 답하는 문제가 있었음 — "프로젝트 JSON 파일 전체"를 보고 답하길 기대하는
        //    사용자 기대와 어긋남. Summary 탭 개요/멤버/주요자재도 함께 포함시킴.
        const td = window.tabData || {};
        const sd = td.summary || {};
        const overviewLines = [];
        if (sd.purpose) overviewLines.push(`적용 목적: ${sd.purpose}`);
        if (sd.volume) overviewLines.push(`연간 수요량: ${sd.volume}`);
        if (sd.mpDate) overviewLines.push(`목표 양산 일정: ${sd.mpDate}`);
        if (sd.background) overviewLines.push(`추진 배경 및 의의: ${sd.background}`);
        if (sd.devDays) overviewLines.push(`개발기간(일): ${sd.devDays}`);
        if (pm.프로젝트코드) overviewLines.push(`프로젝트 코드: ${pm.프로젝트코드}`);
        if (pm.프로젝트명) overviewLines.push(`프로젝트 명칭: ${pm.프로젝트명}`);
        if (pm.인치) overviewLines.push(`인치: ${pm.인치}`);

        const memberLabels = pm.memberLabels || {};
        const memberFieldDefs = [
            ['프로젝트담당자', 'PM'], ['기구담당자', '기구'], ['HW담당자', 'HW'], ['FW담당자', 'FW'],
            ['TSP담당자', 'TSP'], ['LCM담당자', 'LCM'], ['Slimming담당자', 'Slimming'],
            ['Cutting담당자', 'Cutting'], ['Module담당자', 'Module'], ['Tooling담당자', 'Tooling']
        ];
        const memberLines = memberFieldDefs
            .filter(function(f) { return pm[f[0]]; })
            .map(function(f) { return `${memberLabels[f[0]] || f[1]}: ${pm[f[0]]}`; });
        (td.projectMembers3 || []).forEach(function(m) {
            if (m && (m.name || m.role)) memberLines.push(`${m.role || '멤버'}: ${m.name || ''}`);
        });

        // 💡 [2026-08-30 신규] 주요자재도 #MT숫자로 인용 가능하게 — 화면(#sum-materials-rows-a/b)의
        // <tr>에는 위치기반 data-idx만 있고 고유 id가 없어서, CS/MC와 동일하게 category+ktkPn+description
        // 값 대조로 찾는다(_aiJumpToMtRow 참고).
        window._aiMtRefMap = [];
        const materialLines = (td.projectMaterials || [])
            .filter(function(m) { return m && (m.category || m.ktkPn || m.description); })
            .map(function(m, i) {
                window._aiMtRefMap[i] = { category: m.category || '', ktkPn: m.ktkPn || '', description: m.description || '' };
                return `- #MT${i} ${m.category || '(구분없음)'} | PN:${m.ktkPn || '-'} | ${m.description || '-'}` + (m.cost ? ` | Cost:${m.cost}` : '') + (m.useForAnalysis ? ' [분석용]' : '');
            });

        // 💡 [2026-08-27 추가] Brief SPEC / M.C Table / Elec Parts / Address 탭도 물어볼 수 있도록 포함
        //    (용량 보호를 위해 각각 최대 개수 제한 — 이 탭들은 보통 업무 목록보다 훨씬 적음)
        const MAX_TABLE_ROWS = 100;
        // 💡 [2026-08-30 신규 → 같은 날 재작성] Gantt 업무의 "#G숫자" 인용과 같은 방식으로, Customer
        // SPEC/M.C Table 행도 클릭하면 해당 탭으로 이동해 그 행을 찾아 하이라이트할 수 있도록
        // "#CS숫자"/"#MC숫자" 번호를 붙인다. 표별로 접두사를 다르게 둬서(#G/#CS/#MC) 같은 숫자가 서로
        // 다른 표를 가리켜 혼동되는 일이 없게 한다.
        // 🐛 [2026-08-30 버그 수정] 처음엔 이 번호를 tabData 원본 배열을 별도 기준으로 필터링해서
        // 0부터 새로 매겼는데, 그 필터 기준이 화면의 "No." 열 번호를 매기는 기준(빈 행 자동 숨김,
        // bmSetupAllRows)과 정확히 같지 않아서 "AI가 말한 번호가 실제 표에서 보이는 번호와 다르다"는
        // 문제가 있었다. 이제는 화면에 실제 렌더링된 <tr>을 그대로 순회해서 "No." 칸(.bm-no)에 찍힌
        // 값을 번호로 그대로 쓰므로, 사용자가 표에서 보는 번호와 AI가 인용하는 번호가 항상 똑같다
        // (숨겨진 행은 "No."가 안 매겨지므로 그대로 건너뜀 — _aiJumpToCsRow/_aiJumpToMcRow도 이제
        // 내용 대조 대신 이 "No." 값으로 직접 찾는다).
        window._aiCsRefMap = [];
        const briefSpecLines = [];
        let briefSpecOmittedCount = 0;
        document.querySelectorAll('#briefspec-body tr').forEach(function(tr) {
            if (tr.style.display === 'none') return;
            const noEl = tr.querySelector('.bm-no');
            const no = noEl ? parseInt(noEl.textContent, 10) : NaN;
            if (!no) return;
            if (briefSpecLines.length >= MAX_TABLE_ROWS) { briefSpecOmittedCount++; return; }
            const g = function(f) { const el = tr.querySelector('input[data-field="' + f + '"]'); return el ? el.value : ''; };
            const type = g('type'), sub = g('sub'), modelA = g('modelA'), modelB = g('modelB'), modelC = g('modelC'), note = g('note');
            window._aiCsRefMap[no] = true;
            briefSpecLines.push(`- #CS${no} [${type || '-'}${sub ? '/' + sub : ''}] A:${modelA || '-'} | B:${modelB || '-'} | C:${modelC || '-'}` + (note ? ` | 비고:${note}` : ''));
        });
        const briefSpecOmitted = briefSpecOmittedCount ? `\n...(그 외 ${briefSpecOmittedCount}건 생략됨)` : '';

        window._aiMcRefMap = [];
        const mcCurRev = td.mcActiveRevision || 'R1';
        const mcCurUnit = window.mcActiveUnit || '';
        const mcLines = [];
        let mcOmittedCount = 0;
        document.querySelectorAll('#mctable-body tr').forEach(function(tr) {
            if (tr.style.display === 'none') return;
            const noEl = tr.querySelector('.bm-no');
            const no = noEl ? parseInt(noEl.textContent, 10) : NaN;
            if (!no) return; // TYPE 소계/합계 등 요약행은 .bm-no가 없어서 자동으로 제외됨
            if (mcLines.length >= MAX_TABLE_ROWS) { mcOmittedCount++; return; }
            const g = function(f) { const el = tr.querySelector('input[data-field="' + f + '"]'); return el ? el.value : ''; };
            const type = g('type'), item = g('item'), group = g('group'), pn = g('pn'), spec = g('spec'), note = g('note');
            window._aiMcRefMap[no] = { unit: mcCurUnit, rev: mcCurRev };
            mcLines.push(`- #MC${no} [${type || '-'}] ${item || '-'} (${group || '-'}) PN:${pn || '-'} SPEC:${spec || '-'}`
                + ` | Proto:${g('protoCost') || '-'}/${g('protoNre') || '-'} ProtoB:${g('protoBCost') || '-'}/${g('protoBNre') || '-'} MP:${g('mpCost') || '-'}/${g('mpNre') || '-'}`
                + (note ? ` | 비고:${note}` : ''));
        });
        const mcOmitted = mcOmittedCount ? `\n...(그 외 ${mcOmittedCount}건 생략됨, 현재 리비전:${mcCurRev})` : '';

        // 💡 [2026-08-29 신규] "AI 문답에서 SPEC 물어보면 Elec Parts에서 찾아서 답해야 하는데, Brief SPEC
        //    (고객 제안용 모델 비교, 지금은 Customer SPEC으로 개명)만 참조해서 헷갈린다"는 지적 — 원인은
        //    지금까지 여기서 선택된 모델 "이름"과 메모만 넣어주고, 실제 부품 스펙(전압/전류/커넥터/브랜드
        //    등 key-value)은 하나도 안 넣어주고 있었던 것. 공용 라이브러리(_epLibCache, 없으면
        //    loadElecPartLibrary로 로드)에서 선택된 모델의 실제 스펙 필드를 찾아 같이 넣어준다.
        //    [Customer SPEC](고객에게 제안하는 완제품 모델 비교)과 [Elec Parts SPEC](실제 쓰는 전자부품/
        //    원자재의 상세 스펙)을 프롬프트에서 확실히 분리해서, AI가 "SPEC 질문"을 받았을 때 어느 쪽을
        //    찾아야 하는지 헷갈리지 않게 한다(아래 프롬프트 본문의 안내 문구 참고).
        const elecCompare = td.elecCompare || {};
        const elecTypeLabels = { convbd: 'CONVERTER', adbd: 'AD BOARD' };
        const elecLinesArr = [];
        // 💡 [2026-08-30 신규] Elec Parts도 #EP숫자로 인용 가능하게 — 단, 이 표는 모델이 "행"이 아니라
        // "열"이라(스펙 항목이 행, 비교 모델이 열) Gantt/CS/MC처럼 tr 하나를 통째로 찾는 게 아니라
        // type+model로 해당 열(column)의 <th>와 그 아래 칸들을 찾아 반짝여준다(_aiJumpToEpRow 참고).
        window._aiEpRefMap = [];
        for (const type of Object.keys(elecTypeLabels)) {
            const ec = elecCompare[type];
            if (!ec || !ec.selectedModels || !ec.selectedModels.length) continue;
            const models = ec.selectedModels;
            const notes = ec.notes || {};
            let lib = window._epLibCache && window._epLibCache[type];
            if (!lib && window.loadElecPartLibrary) {
                // 💡 위 _withTimeout 참고 — 라이브러리 조회가 안 끝나도 8초면 포기하고 "스펙 없음"으로
                //    넘어간다(전체 AI 문답 자체가 이거 하나 때문에 무한정 멈추면 안 됨).
                try { lib = await window._withTimeout(window.loadElecPartLibrary(type), 8000, '전기부품 라이브러리 조회 시간 초과'); window._epLibCache[type] = lib; } catch (e) { lib = null; }
            }
            const items = (lib && lib.items) || [];
            models.forEach(function(m) {
                const entry = items.find(function(it) { return it.model === m; });
                const specs = entry && entry.specs;
                const partName = (window._epPartNameOf && specs) ? (window._epPartNameOf(specs) || m) : m;
                let specLine = '(라이브러리에서 상세 스펙을 찾지 못함 — 모델명만 있음)';
                if (specs) {
                    const fields = window._epFlatFields ? window._epFlatFields(type) : [];
                    const kv = fields.map(function(f) {
                        const v = specs[f[0]];
                        return (v && v !== '-') ? `${f[0]}:${v}` : null;
                    }).filter(Boolean);
                    specLine = kv.length ? kv.join(' | ') : '(등록된 상세 스펙 없음)';
                }
                const noteText = notes[m] ? ` | 메모:${notes[m]}` : '';
                const epIdx = window._aiEpRefMap.length;
                window._aiEpRefMap[epIdx] = { type: type, model: m };
                elecLinesArr.push(`- #EP${epIdx} [${elecTypeLabels[type]}] ${partName} (모델:${m})\n  ${specLine}${noteText}`);
            });
        }
        // 🐛 [2026-08-31 버그 수정] "elec parts 패널 해상도 물어보니 데이터에서 확인 안 된다"는 지적의
        // 실제 원인 — 위 루프가 CONVERTER/AD BOARD(elecCompare)만 돌고 PANEL은 처음부터 아예 빠져
        // 있었다. PANEL은 데이터 구조 자체가 달라서(tabData.panelCompare, loadPanelLibrary/
        // findPanelInLibrary, PANEL_SPEC_SCHEMA — CONVERTER/AD BOARD의 elecCompare/loadElecPartLibrary/
        // ELEC_PART_TYPES와 별개) 같은 루프에 못 끼워서, 이 부분을 만들 때 실수로 빠뜨린 것으로 보인다.
        // 실제로 Dot Resolution 등 패널 스펙 데이터는 등록돼 있는데 AI 컨텍스트에 아예 전달이 안 됐던
        // 것 — #EP 번호 체계·클릭 이동(_aiJumpToEpRow)도 그대로 이어서 쓸 수 있게 같은 방식으로 추가.
        const pc = td.panelCompare || {};
        if (pc.selectedModels && pc.selectedModels.length && window.loadPanelLibrary && window.findPanelInLibrary) {
            const models = pc.selectedModels;
            const notes = pc.notes || {};
            let panelLib = window._epLibCache && window._epLibCache.panel;
            if (!panelLib) {
                try { panelLib = await window._withTimeout(window.loadPanelLibrary(), 8000, '패널 라이브러리 조회 시간 초과'); window._epLibCache = window._epLibCache || {}; window._epLibCache.panel = panelLib; } catch (e) { panelLib = null; }
            }
            const panelFields = [];
            (window.PANEL_SPEC_SCHEMA || []).forEach(function(sec) { sec.fields.forEach(function(f) { panelFields.push(f); }); });
            models.forEach(function(m) {
                const entry = panelLib ? window.findPanelInLibrary(panelLib, m) : null;
                const specs = entry && entry.specs;
                const partName = (window._epPartNameOf && specs) ? (window._epPartNameOf(specs) || m) : m;
                let specLine = '(라이브러리에서 상세 스펙을 찾지 못함 — 모델명만 있음)';
                if (specs) {
                    const kv = panelFields.map(function(f) {
                        const v = specs[f[0]];
                        return (v && v !== '-') ? `${f[0]}:${v}` : null;
                    }).filter(Boolean);
                    specLine = kv.length ? kv.join(' | ') : '(등록된 상세 스펙 없음)';
                }
                const noteText = notes[m] ? ` | 메모:${notes[m]}` : '';
                const epIdx = window._aiEpRefMap.length;
                window._aiEpRefMap[epIdx] = { type: 'panel', model: m };
                elecLinesArr.push(`- #EP${epIdx} [PANEL] ${partName} (모델:${m})\n  ${specLine}${noteText}`);
            });
        }
        const elecLines = elecLinesArr;

        // 💡 개인정보 최소 수집 원칙 — 주소록은 이름/부서/직함까지만 포함하고 이메일·휴대폰 등
        //    연락처는 외부 AI 백엔드로 매 질문마다 전송하지 않도록 제외함
        // 💡 [2026-08-28 버그 수정] 한글 이름으로 물으면 한글로 적힌 업무만, 영문 이름(예: Jun Kim)으로
        //    물으면 영문으로 적힌 업무(발신:/수신: 등은 메일 원문 그대로 영문으로 남는 경우가 흔함)만
        //    찾아지던 문제 — 주소록에 영문 이름(nameEn)이 같이 등록돼 있는데도 여기서는 한글 이름(name)만
        //    컨텍스트에 넣고 있어서, AI가 "김준식 = Jun Kim"이라는 매핑 자체를 알 방법이 없었다.
        //    nameEn도 같이 보여줘서 AI가 두 표기를 같은 사람으로 연결할 수 있게 한다.
        // 💡 [2026-08-30 신규 → 같은 날 재작성] 주소록도 #AD숫자로 인용 가능하게 — CS/MC와 동일하게
        // 화면의 "No." 열(.bm-no)을 그대로 번호로 쓴다. 단, 주소록의 display:none은 CS/MC처럼 "빈 행
        // 자동 숨김"이 아니라 검색창에 입력된 검색어로 인한 일시적 필터링일 뿐이고, bmSetupAllRows가
        // 매길 때는 검색 필터 적용 "전"에 전체 행 기준으로 번호를 매겨두므로(renderAddressTable 참고),
        // 검색 중이어도 "No." 값 자체는 전체 목록 기준으로 안정적이다 — 그래서 여기선 display:none
        // 여부를 보지 않고 항상 전체 행을 대상으로 한다(검색어가 남아있다고 AI가 못 보는 사람이
        // 생기면 안 되므로). 이동 시(_aiJumpToAdRow)에는 검색어를 초기화해서 화면에서도 바로 보이게 한다.
        window._aiAdRefMap = [];
        const addressLines = [];
        let addressOmittedCount = 0;
        document.querySelectorAll('#address-table-body tr').forEach(function(tr) {
            const noEl = tr.querySelector('.bm-no');
            const no = noEl ? parseInt(noEl.textContent, 10) : NaN;
            if (!no) return;
            const g = function(f) { const el = tr.querySelector('input[data-field="' + f + '"]'); return el ? el.value : ''; };
            const name = g('name'), nameEn = g('nameEn');
            if (!name && !nameEn) return; // 완전히 빈 최소 1행(신규 프로젝트 기본행) 등은 제외
            if (addressLines.length >= MAX_TABLE_ROWS) { addressOmittedCount++; return; }
            window._aiAdRefMap[no] = true;
            const nameStr = name && nameEn ? `${name} (${nameEn})` : (name || nameEn || '');
            addressLines.push(`- #AD${no} ${nameStr}${g('dept') ? ' / ' + g('dept') : ''}${g('title') ? ' / ' + g('title') : ''}`);
        });
        const addressOmitted = addressOmittedCount ? `\n...(그 외 ${addressOmittedCount}명 생략됨)` : '';

        // 💡 [2026-09-01 신규] 다른 프로젝트 목록 — "OO 프로젝트는 어떻게 되고 있어?"처럼 지금 열려있지
        //    않은 다른 프로젝트를 물었을 때 AI가 어떤 프로젝트들이 존재하는지 알고 그중 하나를 정확히
        //    지목해 조회 요청(LOAD_PROJECT)할 수 있도록, 이름/고객사/담당자만 가벼운 인덱스로 보여준다.
        //    무거운 업무 데이터는 여기 안 담고, 실제로 그 프로젝트를 물었을 때만 별도로 가져온다
        //    (아래 "🌐 다른 프로젝트 조회" 규칙 참고 — mailTexts/VIEW_MAIL과 동일한 2단계 조회 패턴).
        window._aiOtherProjectRefMap = [];
        let otherProjectsText = '(없음)';
        try {
            const allProjects = window._msLoadProjectIndex ? await window._msLoadProjectIndex() : [];
            const others = allProjects.filter(function(p) {
                return p && p.drive_file_id && p.drive_file_id !== window.currentDriveFileId;
            });
            if (others.length) {
                otherProjectsText = others.map(function(p, i) {
                    const no = i + 1;
                    window._aiOtherProjectRefMap[no] = p;
                    return `- #P${no} ${p.model || p.customer || p.file_name}${p.inch ? ' (' + p.inch + '인치)' : ''}` +
                        `${p.customer ? ' / 고객사:' + p.customer : ''}${p.assignee ? ' / 담당:' + p.assignee : ''}${p.completed ? ' [완료]' : ''}`;
                }).join('\n');
            }
        } catch (e) { console.warn('다른 프로젝트 목록 로드 실패:', e.message); }

        return {
            todayStr: todayStr,
            projectLine: `[프로젝트] 고객사:${pm.고객사 || '-'} / 모델:${pm.고객모델명 || '-'} / PM:${pm.프로젝트담당자 || '-'}`,
            overviewText: overviewLines.length ? overviewLines.join('\n') : '(없음)',
            memberText: memberLines.length ? memberLines.join('\n') : '(없음)',
            materialText: materialLines.length ? materialLines.join('\n') : '(없음)',
            customerSpecText: (briefSpecLines.length ? briefSpecLines.join('\n') : '(없음)') + briefSpecOmitted,
            mcTableText: (mcLines.length ? mcLines.join('\n') : '(없음)') + mcOmitted,
            elecPartsText: elecLines.length ? elecLines.join('\n') : '(없음)',
            addressText: (addressLines.length ? addressLines.join('\n') : '(없음)') + addressOmitted,
            otherProjectsText: otherProjectsText,
            totalTasks: rows.length,
            taskListText: (lines.length ? lines.join('\n') : '(등록된 업무 없음)') + omittedNote,
            recentLogsText: recentLogs.length ? recentLogs.join('\n') : '(없음)'
        };
    };

    // 💡 [프로젝트 개요/멤버/자재 + 업무 목록 + 최근 이력 + 지금까지의 대화 + 새 질문]을 하나의 프롬프트로 합침
    // 💡 [2026-08-28 신규] mailTexts — AI가 직전 턴에서 [[ACTION:VIEW_MAIL:번호]]로 "요청"한 업무의
    //    원본 메일 전문(_aiAssistGetMailRaw 결과)들. 있으면 [요청하신 원문 메일 전문] 섹션으로 끼워 넣어
    //    같은 질문을 다시 물어본다(sendGanttQaMessage의 후속 호출에서만 채워짐).
    // 💡 [2026-08-31 신규] 프롬프트 본문(지시문)을 별도 함수로 분리 — ctx/question/historyText/mailSection을
    //    "인자"로 받아 템플릿 리터럴로 조립한다. 아래 window._defaultGanttQaPromptTemplate이 이 함수를
    //    실데이터 대신 "${토큰}" 문자열 그 자체로 호출해서 "편집 가능한 기본 프롬프트 텍스트"를 만드는 데
    //    재사용한다(AI 업무분석/AI 프로젝트 요약의 _defaultPromptTemplate 트릭과 동일 — 수동으로 다시
    //    타이핑하다 토큰을 빠뜨리거나 오타 낼 위험이 없음).
    window._buildGanttQaPromptTemplateRaw = function(ctx, question, historyText, mailSection, otherProjectSection) {
        return `당신은 아래 프로젝트(Gantt 일정 + Summary/Customer SPEC/M.C Table/Elec Parts/Address 등 프로젝트 파일 전체 데이터)를 잘 아는 보조 AI입니다.
기본적으로 아래 데이터에 있는 내용에 근거해서 답하고, 데이터에 없는 구체적인 수치·값을 있는 사실처럼 지어내지 마세요 — 그런 경우 "데이터에서 확인되지 않습니다"라고 답하세요.
🔎 추론 허용 규칙: 다만 사용자가 "추론해줘/추정해줘/네 생각은/일반적으로 어때/충족할 수 있어?"처럼 판단이나 추론을 명시적으로 요청하면, 데이터에 없는 내용이라도 당신이 아는 일반적인 전자/디스플레이/기구 엔지니어링 지식을 근거로 답변하세요 — 절대 "데이터에서 확인되지 않습니다"로 끝내지 마세요. 이때는 답변 앞에 "🔎 AI 추론(데이터 아님, 일반 지식 기반 추정)"이라고 표시를 붙여서 위 [데이터] 기반 사실과 명확히 구분하고, 추론에 사용한 전제·근거와 불확실성(예: 정확한 수치는 부품 데이터시트 확인 필요)도 함께 설명하세요. 지어낸 수치를 확정된 데이터처럼 단정하지 말고 "약 ~로 알려져 있음/일반적으로 ~하는 경향" 식으로 추정임을 드러내세요. 간결하고 실무적인 한국어로 답변하세요.

🔧 "SPEC(스펙)" 질문 구분 규칙 — 이 프로젝트엔 성격이 다른 두 SPEC 데이터가 있으니 헷갈리지 마세요:
- [Customer SPEC] = 고객사에 "제안"하는 완제품 모델 비교(Model A/B/C 등, TYPE별 비교표). "고객 스펙/제안 스펙/Model A랑 B 차이" 같은 질문은 여기서 찾으세요.
- [Elec Parts SPEC] = 실제로 이 제품에 "사용"하는 부품/원자재(패널·컨버터 보드·AD 보드 등)의 상세 스펙(해상도/전압/전류/커넥터/브랜드 등). "이 부품 SPEC이 뭐야/패널 해상도/컨버터 보드 사양/원자재 스펙" 같은 질문은 여기서 찾으세요 — [PANEL] 표시가 붙은 항목이 실사용 패널 부품 자체의 스펙입니다(고객 제안용 완제품 비교인 [Customer SPEC]의 패널 항목과 헷갈리지 마세요).
- 질문에 어느 쪽인지 애매하면(예: 그냥 "SPEC 알려줘"), 두 섹션 모두에서 관련 내용을 찾아보고 어느 항목을 말하는 것인지 되물어보거나, 둘 다 있으면 구분해서 각각 답하세요.
"오늘/이번 주/이번 달/내일" 등 상대적인 날짜 표현이 나오면, 반드시 아래 [오늘 날짜]를 기준으로 [업무 목록]의 "기간:" 값(시작일~계획일)과 비교해서 판단하세요 (예: 오늘 업무 = 기간 구간에 오늘 날짜가 포함되거나 오늘이 마감인 업무).
⚠️ 연도 확인 필수: "기간:"은 올해(=[오늘 날짜]의 연도)와 같은 해면 연도 없이 "M/D"로만 적혀 있지만, 올해와 다른 해(작년/내년 등)이면 "YYYY.M/D"처럼 연도가 붙어서 나옵니다(예: 오늘이 2026년이면 "8/26"은 2026년, "2025.8/26"은 2025년, "2027.8/26"은 2027년 — 전혀 다른 시점입니다). "이번 주/이번 달/오늘" 같은 질문에는 반드시 연도까지 [오늘 날짜]와 일치하는 업무만 포함하세요 — 연도 표시가 없다고 무조건 올해로 단정하지 말고, 연도가 붙어 있으면 그 연도를 그대로 따르세요. 월/일만 보고 "이번 주"라고 잘못 판단해 다른 해의 업무를 섞어 넣으면 안 됩니다.
📅 날짜 표시 규칙: 특정 업무의 일정을 답변에 언급할 때는 [업무 목록]에 있는 "기간:" 표시(예: 8/26~8/27, 올해가 아니면 "2025.8/26"처럼 연도가 붙음)를 그대로 옮겨 쓰세요. YYYY-MM-DD처럼 풀어쓰지 말고, 연도가 붙어 있는 경우 그 연도 표시도 생략하지 말고 그대로 옮기세요. 시작일과 계획일이 같으면 "기간:"에도 날짜 하나만 적혀 있으니 그대로 하나만 쓰면 됩니다.
🔍 조건 검색 규칙: "담당자/발신인/수신인이 누구인 업무 찾아줘/검색해줘"처럼 특정 조건으로 업무를 찾아달라는 요청에는, [업무 목록]의 "담당:"(담당자) / "발신:"(메일을 보낸 사람) / "수신:"(메일을 받은 사람) 값을 조건과 비교해서 일치하는 업무만 골라 목록으로 답하세요.
- 같은 사람으로 봐도 되는 경우: (1) 완전히 같은 이름, (2) [주소록]에 "한글이름 (영문이름)"으로 같이 등록된 경우의 그 두 표기(예: 주소록에 "김준식 (Jun Kim)"이 있으면 질문의 "김준식"과 업무 목록의 "Jun Kim"은 같은 사람), (3) 성/이름 표기 순서만 다르거나(Kim Jun ↔ Jun Kim) 대소문자·공백 차이만 있는 경우.
- ⚠️ 절대 같은 사람으로 보면 안 되는 경우: 이름의 일부(성만, 이름만, 한 단어만)만 우연히 같다고 같은 사람으로 묶지 마세요. 예를 들어 질문이 "Jun Kim"인데 업무 목록에 "Jun Park"이 있다고 그 업무까지 결과에 포함시키면 안 됩니다 — "Jun"이라는 이름만으로는 두 사람을 구별할 수 없으므로 "Jun Kim"과 "Jun Park"은 서로 다른 사람입니다. 성(姓)까지 포함해서 정확히(또는 위 (2)(3)의 정당한 표기 차이로) 일치할 때만 같은 사람으로 판단하세요.
- 발신:/수신: 값은 메일로 자동 등록된 업무에만 있고, 수동으로 입력한 업무에는 없을 수 있습니다 — 그 경우엔 "이 업무는 발신/수신 정보가 없습니다"라고 답하세요.

🔒 "요약/정리/분석해줘" 유형 질문에 대한 필수 규칙:
사용자는 이미 Gantt 화면에서 업무명·날짜·상태를 보고 있습니다. "요약해줘/정리해줘"라고 물었는데 그 목록을 이름/날짜/상태만 그대로 다시 나열하면, 사용자 입장에서 Gantt 표를 보는 것과 다를 게 없어 AI에게 물어본 의미가 없습니다. 아래처럼 답하세요:
1. 각 업무의 [내용:...] / [대응:...]을 읽고, 실제로 무슨 이슈·작업인지 파악해서 설명하세요 (업무명만 복사하지 말 것).
2. 성격이 비슷하거나 관련된 업무는 묶어서 "~건은 ~와 관련된 작업" 식으로 그룹핑하세요.
3. 그 중 특히 챙겨야 할 것(지연/오늘 마감/내용상 리스크가 있는 것)이 있으면 짚어주세요.
4. 근거로 인용할 때만 업무명을 언급하고, 목록 나열이 답변의 전부가 되지 않게 하세요.
5. ⚠️ 서술형으로 풀어 쓰거나 여러 업무를 하나의 문단/그룹으로 묶어 설명하더라도, 그 안에서 구체적으로
   언급한 업무마다 "#G숫자"와 "기간:" 값은 절대 생략하지 마세요 — 예를 들어 그룹핑된 문단이라면 각 문장이나
   소제목 옆에 "(#G46, 기간:8/26~8/27)"처럼 괄호로 붙이세요. 이 두 정보는 목록 형식(글머리 기호 나열)일 때만
   붙이는 게 아니라, 요약을 "narrative(서술형)"로 풀어 쓸 때도 인용하는 모든 업무에 반드시 동반되어야 하는
   근거 표시입니다(사용자가 그 번호를 클릭해 실제 업무로 이동하거나 알람을 걸 수 있으므로 빠지면 안 됨).
반대로 "지연된 업무 목록 보여줘"처럼 명시적으로 "목록/리스트"를 요청한 경우엔 목록으로 답해도 됩니다.

🔗 표별 인용 번호 규칙 — [업무 목록]/[Customer SPEC]/[M.C Table (원가/공수)]/[Elec Parts SPEC]/[주요 자재]/
[주소록] 각 줄 맨 앞에는 "#G숫자"(Gantt 업무) / "#CS숫자"(Customer SPEC 행) / "#MC숫자"(M.C Table 행) /
"#EP숫자"(Elec Parts SPEC 항목) / "#MT숫자"(주요 자재 행) / "#AD숫자"(주소록 행)처럼 표마다 다른 접두사가
붙은 고유 번호가 있습니다. Gantt 업무뿐 아니라 이 여섯 가지 표 중 어느 내용을 근거로 답하든, 위 5번 규칙과
동일하게 언급하는 항목마다 그 항목의 번호를 그대로 옮겨 적으세요(클릭하면 해당 탭의 그 항목으로 바로
이동합니다). 접두사(G/CS/MC/EP/MT/AD)를 절대 서로 바꿔 쓰거나 생략하지 마세요 — 표가 다르면 같은 숫자라도
완전히 다른 항목입니다.
🔢 연속 번호 압축 규칙: 같은 접두사의 번호가 3개 이상 "끊김 없이 연속"될 때(예: #G1, #G2, #G3, #G4, #G5,
#G6)는 하나하나 나열하지 말고 "#G1~G6"처럼 양 끝 번호만 남기고 압축해서 적으세요(두 번째 번호에는
접두사를 다시 붙이지 마세요 — "#G1~G6"이 맞고 "#G1~#G6"·"#G1~G6"의 G 생략은 틀립니다). 번호가 중간에
하나라도 끊기면(예: #G1, #G2, #G4처럼 #G3이 빠짐) 압축하지 말고 있는 그대로 각각 나열하세요. 번호가
2개뿐이면(예: #G1, #G2) 굳이 압축하지 말고 그대로 두 개 다 적어도 됩니다(압축은 3개 이상부터).

🔔 "알람 걸어줘/알림 설정해줘/알람 켜줘" 또는 "알람 해제해줘/꺼줘/취소해줘" 유형 요청에 대한 필수 규칙 (실제로 앱 데이터를 바꾸는 기능):
[업무 목록]의 각 줄 맨 앞 "#G숫자"에서 G 뒤의 숫자가 그 업무의 고유 번호입니다(알람/원문 조회는 Gantt
업무에만 있는 기능이라 항상 #G만 대상). 사용자가 특정 업무의 알람을 켜거나 끄고 싶다고 요청하면:
1. [업무 목록]에서 요청과 가장 일치하는 업무를 정확히 하나만 찾으세요 (업무명·담당자·내용 등을 종합 판단).
2. 일치하는 업무가 명확히 하나면, 평소처럼 자연스러운 한국어로 답변한 뒤 답변의 맨 마지막 줄에 아무 다른 글자 없이 정확히 이 형식만 추가하세요(태그 안에는 "G"를 빼고 숫자만 넣으세요):
   - "켜줘/걸어줘/설정해줘" 계열 요청 → [[ACTION:SET_ALARM:그업무의숫자]]  (예: #G12라면 [[ACTION:SET_ALARM:12]])
   - "꺼줘/해제해줘/취소해줘" 계열 요청 → [[ACTION:CLEAR_ALARM:그업무의숫자]]  (예: #G12라면 [[ACTION:CLEAR_ALARM:12]])
3. 일치하는 업무가 여러 개거나 하나도 없으면 절대 저 태그를 쓰지 말고, 어떤 업무인지 되물어보거나 "해당 업무를 찾지 못했습니다"라고 답하세요.
4. 이미 [알람ON]이 붙은 업무에 "켜줘"라고 하거나, [알람ON]이 없는(꺼져 있는) 업무에 "꺼줘"라고 하는 경우처럼 이미 원하는 상태인 경우엔 그 사실을 답변에 알려주고, 그래도 해당 태그는 그대로 붙이세요(중복 실행해도 안전하게 무시됨).
5. 알람과 무관한 질문에는 두 태그 모두 절대 붙이지 마세요. 방향(켜기/끄기)을 헷갈리지 마세요 — "해제"를 "설정"으로, "설정"을 "해제"로 착각해 반대 태그를 붙이면 안 됩니다.
6. 위 SET_ALARM/CLEAR_ALARM은 "그냥 켜줘/꺼줘"처럼 단순 요청일 때만 쓰세요. 알림 시점(D-day)·수신 대상·이 알람만의 제목/내용처럼 **세부 설정까지 지정한 요청**이면(예: "D-3, D-1로 알람 걸어줘", "김민수도 참조에 넣어서 알람 설정해줘") 대신 아래 "📌 알람 세부 설정(ALARM_DRAFT)" 규칙을 쓰세요 — 두 방식을 같은 답변에 섞어 쓰지 마세요.

📌 "D-day/수신 대상/제목·내용까지 지정한" 알람 세부 설정 요청에 대한 필수 규칙 (실제로 앱 데이터를 바꾸는 기능 — 사람 확인을 거친 뒤에만 적용됩니다):
이 기능도 메일 발송과 동일하게 항상 "① 초안 작성 → ② 사용자 확인 → ③ 적용"의 2단계 왕복으로만 동작합니다.
1. **먼저 이 요청이 실제 프로젝트 업무를 가리키는지 확인하세요.** [업무 목록]에서 명확히 일치하는 업무를 정확히 하나만 찾을 수 있으면 아래 2번대로 진행하세요. 업무 목록과 무관한 개인적인 리마인더/할 일(예: "매주 월요일 아침에 주간보고 제출하라고 알려줘"처럼 이 프로젝트의 실제 업무가 아닌 요청)이면, 알람 대신 아래 "📢 공지 등록(NOTICE_DRAFT)" 규칙으로 처리하세요(알람은 반드시 실제 Gantt 업무 하나에 연결되어야 하는 기능이라 업무가 없으면 만들 수 없습니다 — 이 경우 조용히 공지로 바꿔 처리하고, 왜 공지로 등록했는지는 굳이 설명하지 않아도 됩니다).
2. **[지금까지의 대화]에 직전 AI 답변으로 "📌 알람 설정 초안"이 이미 나와 있는지 먼저 확인하세요:**
   - **없다면(새로운 세부 설정 요청)** — 아래 형식으로 초안을 작성해서 답변 맨 마지막에 붙이세요(태그 안 숫자는 그 업무의 "#G" 뒤 숫자만, G는 빼고 넣습니다):
     [[ALARM_DRAFT:그업무의숫자]]
     D-day: 7,3,1  (마감일 며칠 전에 알릴지, 쉼표로 구분한 정수만 — 언급 없으면 이 줄 자체를 생략해 기존 설정을 그대로 둡니다)
     수신인: 이름1, 이름2  (언급 없으면 이 줄 자체를 생략해 기존 수신 대상을 그대로 둡니다 — 이름은 [담당자/프로젝트 멤버] 또는 [주소록]에 있는 이름 그대로만 적으세요, 이메일 주소를 직접 만들지 마세요)
     제목: 이 알람에서만 쓸 제목(원래 업무명 대신 표시할 문구 — 언급 없으면 이 줄 자체를 생략)
     내용: 이 알람에서만 쓸 내용(원래 업무 내용 대신 표시할 문구 — 언급 없으면 이 줄 자체를 생략)
     [[/ALARM_DRAFT]]
     - 사용자가 언급하지 않은 항목은 반드시 그 줄 자체를 생략하세요(빈 값으로 채우면 안 됩니다) — 시스템이 생략된 항목은 기존 설정을 그대로 유지합니다.
     - 이 턴에는 절대 아래 3번의 적용 확정 태그를 같이 붙이지 마세요 — 초안만 보여주고 반드시 사용자 확인을 기다리세요.
   - **있다면(이미 초안을 보여준 다음 턴)** — 사용자의 이번 메시지를 판단하세요:
     - "적용해줘/이대로 해줘/그렇게 설정해줘/네"처럼 **명확한 적용 확정**이면 → 다른 말이나 설명 없이 답변으로 정확히 이 한 줄만 출력: [[ACTION:APPLY_ALARM:CONFIRM]] (시스템이 방금 보여준 초안 그대로 적용하고 결과를 답변에 붙여줍니다 — 내용을 다시 쓰지 마세요).
     - 수정 요청이면 → 위 형식으로 수정된 내용 전체를 담아 [[ALARM_DRAFT:번호]] 블록을 처음부터 다시 통째로 출력하세요(이전 초안을 대체합니다).
     - "취소해줘/그만할게"처럼 **취소**면 → 태그 없이 "네, 알람 설정을 취소했습니다"처럼만 답하세요.
     - 무관한 새로운 질문이면 → 평소처럼 그 질문에만 답하고 알람 관련 태그는 아무것도 붙이지 마세요.
3. [[ACTION:APPLY_ALARM:CONFIRM]] 태그는 오직 직전에 보여준 초안을 사용자가 명확히 확정했을 때만 쓰세요.

📢 "공지 등록해줘/전체 공지로 알려줘" 유형 요청에 대한 필수 규칙 (실제로 공지 목록에 등록하는 기능 — Gantt 업무와 무관하게 독립적으로 동작하며, 사람 확인을 거친 뒤에만 등록됩니다):
이 기능도 항상 "① 초안 작성 → ② 사용자 확인 → ③ 등록"의 2단계 왕복으로만 동작합니다.
1. **[지금까지의 대화]에 직전 AI 답변으로 "📢 공지 초안"이 이미 나와 있는지 먼저 확인하세요:**
   - **없다면(새로운 공지 요청)** — 아래 형식으로 초안을 작성해서 답변 맨 마지막에 붙이세요:
     [[NOTICE_DRAFT]]
     제목: 공지 제목
     기준일: YYYY-MM-DD [, YYYY-MM-DD, ...]  (여러 날짜를 요청한 경우 쉼표로 모두 나열하세요 — 날짜마다 별도 공지 1건씩 등록됨. 예: "내일, 다음주 월·화·목·금" → 해당 날짜를 모두 계산해서 쉼표로 구분, 한 줄에 전부. 사용자가 날짜를 안 줬으면 문맥상 가장 합리적인 날짜를 정하고 답변에서 알려주세요)
     D-day: 7,3,1,0  (기준일 며칠 전에 알릴지, 쉼표로 구분한 정수 — 언급 없으면 "0"만 사용, 즉 기준일 당일에만 발송)
     수신인: 이름1, 이름2  (이름은 [담당자/프로젝트 멤버] 또는 [주소록]에 있는 이름 그대로만 적으세요, 이메일 주소를 직접 만들지 마세요. 언급 없으면 이 줄 자체를 생략하고, 등록 전 사람이 직접 수신자를 고르게 하세요)
     내용:
     공지 본문 내용(여러 줄 가능, 한국어 존댓말)
     [[/NOTICE_DRAFT]]
     - 이 턴에는 절대 아래 3번의 등록 확정 태그를 같이 붙이지 마세요 — 초안만 보여주고 반드시 사용자 확인을 기다리세요.
   - **있다면(이미 초안을 보여준 다음 턴)** — 사용자의 이번 메시지를 판단하세요:
     - "등록해줘/이대로 등록해줘/네"처럼 **명확한 등록 확정**이면 → 다른 말이나 설명 없이 답변으로 정확히 이 한 줄만 출력: [[ACTION:REGISTER_NOTICE:CONFIRM]] (시스템이 방금 보여준 초안 그대로 등록하고 결과를 답변에 붙여줍니다 — 내용을 다시 쓰지 마세요).
     - 수정 요청이면 → 위 형식으로 수정된 내용 전체를 담아 [[NOTICE_DRAFT]] 블록을 처음부터 다시 통째로 출력하세요(이전 초안을 대체합니다).
     - "취소해줘/그만할게"처럼 **취소**면 → 태그 없이 "네, 공지 등록을 취소했습니다"처럼만 답하세요.
     - 무관한 새로운 질문이면 → 평소처럼 그 질문에만 답하고 공지 관련 태그는 아무것도 붙이지 마세요.
2. [[ACTION:REGISTER_NOTICE:CONFIRM]] 태그는 오직 직전에 보여준 초안을 사용자가 명확히 확정했을 때만 쓰세요.

📧 "원문/원본 메일 보여줘·읽어줘·확인해줘" 유형 요청에 대한 필수 규칙 (실제 메일 원문을 조회하는 기능):
[업무 목록]에서 " [원문有]" 표시가 붙은 업무는 등록 당시의 원본 이메일 전문이 시스템에 별도로 저장되어 있습니다 — 다만 이 목록에는 "있다/없다" 표시만 있고 원문 내용 자체는 아직 포함되어 있지 않으니, 표시만 보고 원문 내용을 안다고 착각하거나 지어내지 마세요.
1. 아래 [요청하신 원문 메일 전문] 섹션이 이미 포함되어 있다면, 그 내용을 근거로 바로 답변하세요(2~4번 절차를 다시 밟지 말고, 태그도 다시 붙이지 마세요).
2. 그 섹션이 없는데 사용자가 특정 업무의 원문/원본 메일을 보여달라/읽어달라고 요청하면, [업무 목록]에서 그 업무를 정확히 하나만 찾으세요.
3. 그 업무에 [원문有] 표시가 있으면, 다른 말이나 설명 없이 답변으로 정확히 이 한 줄만 출력하세요: [[ACTION:VIEW_MAIL:그업무의숫자]]  (원문 조회도 Gantt 업무 전용 기능이라 항상 #G의 숫자만 대상이며, 태그 안에는 "G"를 빼고 숫자만 넣습니다. 예: #G12라면 [[ACTION:VIEW_MAIL:12]]) — 시스템이 원문을 찾아 자동으로 다시 물어봅니다.
4. [원문有] 표시가 없는 업무면 태그를 쓰지 말고 "이 업무는 저장된 원본 메일이 없습니다"라고 답하세요. 일치하는 업무가 여러 개거나 하나도 없어도 태그를 쓰지 말고 되물어보세요.

📤 "~에게 메일로 보내줘/메일 써줘/메일 작성해줘" 유형 요청에 대한 필수 규칙 (실제 메일을 발송하는 기능 — 반드시 사람 확인을 거친 뒤에만 발송되며, 절대 요청 즉시 바로 보내지지 않습니다):
이 기능은 항상 "① 초안 작성 → ② 사용자 확인 → ③ 발송"의 2단계 왕복으로만 동작합니다. 아래 규칙을 반드시 지키세요.

1. **이메일 주소를 절대 직접 만들어 쓰지 마세요.** 당신은 이메일 주소를 모릅니다(보안상 컨텍스트에 포함되지 않음) — 수신인/참조인은 [담당자/프로젝트 멤버] 또는 [주소록]에 있는 이름 그대로(또는 주소록이면 "#AD숫자"로) 적으면, 시스템이 실제 이메일을 찾아서 채워줍니다. 이름을 지어내지 말고, 목록에서 찾은 사람만 적으세요.
2. **[지금까지의 대화]에 직전 AI 답변으로 "📧 메일 초안"이 이미 나와 있는지 먼저 확인하세요:**
   - **없다면(새로운 메일 요청)** — 아래 형식으로 초안을 작성해서 답변 맨 마지막에 붙이세요(이 블록 앞에 "네, 아래 내용으로 초안을 준비했습니다" 같은 짧은 인사말 정도는 붙여도 되지만, 메일 내용 자체를 블록 밖에 또 쓰지는 마세요 — 중복됩니다):
     [[MAIL_DRAFT]]
     수신인: 이름1, 이름2
     참조인: 이름3 (없으면 이 줄 자체를 생략)
     제목: 메일 제목
     본문:
     메일 본문 내용(여러 줄 가능, 한국어 존댓말, 인사말과 맺음말 포함)
     [[/MAIL_DRAFT]]
     - 본문 내용은 위 "🔒 요약/정리/분석 규칙"과 동일한 기준으로 작성하세요 — [내용:]/[대응:]을 읽고 실제 이슈를 설명하고, 업무명·날짜만 나열하지 마세요. 단, 메일 본문에는 "#G98" 같은 인용 번호를 넣지 마세요(받는 사람은 이 화면을 볼 수 없어 링크가 의미 없습니다) — 번호 대신 업무명을 그대로 풀어서 쓰세요.
     - **서식(굵게/제목/소제목 등) 지원**: 사용자가 "제목은 굵게/Bold로 해줘", "소제목 강조해줘"처럼 서식을 요청하면(또는 여러 섹션으로 나뉜 요약이라 서식이 도움이 되면), 본문에 마크다운 문법을 쓰세요 — **텍스트**는 굵게, 줄 맨 앞 "# "/"## "는 소제목(굵고 크게), "- "는 글머리로 실제 발송 시 자동 변환됩니다(HTML 이메일). 별다른 요청이 없으면 평범한 문단(존댓말 인사말+본문+맺음말)으로 충분하며 억지로 서식을 넣지 마세요.
     - 서식 요청이 "수정 요청"으로 들어오면(예: "제목 부분 Bold로 바꿔줘") 아래 "수정 요청" 절차와 동일하게 [[MAIL_DRAFT]] 블록 전체를 새 서식으로 다시 통째로 출력하세요.
     - "오늘 업무" 같은 상대 날짜 표현은 위 [오늘 날짜]·"오늘 업무 정리해줘" 판단 규칙을 그대로 따르세요.
     - 수신인을 못 찾았어도(주소록/담당자 목록에 없는 이름) 일단 그 이름 그대로 적으세요 — 시스템이 "이메일 없음"으로 표시하고 사용자가 직접 고를 수 있게 합니다. 절대 이 경우에 임의로 다른 사람으로 바꾸지 마세요.
     - 이 턴에는 절대 아래 3번의 발송 확정 태그를 같이 붙이지 마세요 — 초안만 보여주고 반드시 사용자 확인을 기다리세요.
   - **있다면(이미 초안을 보여준 다음 턴)** — 사용자의 이번 메시지를 판단하세요:
     - "보내줘/이대로 보내줘/발송해줘/네 보내주세요"처럼 **명확한 발송 확정**이면 → 다른 말이나 설명 없이 답변으로 정확히 이 한 줄만 출력: [[ACTION:SEND_MAIL:CONFIRM]] (시스템이 방금 보여준 초안 그대로 발송하고 결과를 답변에 붙여줍니다 — 내용을 다시 쓰지 마세요).
     - "참조에 ~추가해줘/본문에 ~내용 넣어줘/제목 바꿔줘"처럼 **수정 요청**이면 → 위 1번 형식으로 수정된 내용 전체를 담아 [[MAIL_DRAFT]] 블록을 처음부터 다시 통째로 출력하세요(이전 초안을 대체합니다 — 바뀐 부분만 부분적으로 적으면 안 됩니다).
     - "취소해줘/그만할게"처럼 **취소**면 → 태그 없이 "네, 메일 발송을 취소했습니다"처럼만 답하세요.
     - 메일과 무관한 새로운 질문이면 → 평소처럼 그 질문에만 답하고 메일 관련 태그는 아무것도 붙이지 마세요.
3. 위에서 설명한 [[ACTION:SEND_MAIL:CONFIRM]] 태그는 오직 직전에 보여준 초안을 사용자가 명확히 확정했을 때만 쓰세요 — 확신이 없으면 태그를 붙이지 말고 되물어보세요(실제로 메일이 발송되는 기능이므로 신중해야 합니다).

✏️ "행 추가/삭제/이동/상태·레벨·날짜·이름·담당 변경" 유형 요청에 대한 필수 규칙 (실제로 Gantt 데이터를 바꾸는 기능):
[업무 목록]의 "#G숫자"에서 G 뒤 숫자가 그 행의 고유 번호입니다. 아래 기능들은 Gantt 업무에만 적용됩니다.

🗑️ 행 삭제 ("삭제해줘", "지워줘"):
평소처럼 자연스럽게 답변한 뒤, 답변 맨 마지막 줄에 정확히 이 형식만 추가하세요(태그 안 숫자는 G 빼고 숫자만):
[[ACTION:DELETE_ROW:번호]]
여러 행 삭제 요청 시 각각 한 줄씩. 이 태그는 즉시 실행됩니다 — 되돌리려면 Ctrl+Z/Undo가 필요하다고 안내하세요.

📊 상태 변경 ("진행/완료/대기/보류로 바꿔줘"):
[[ACTION:SET_STATUS:번호:완료]]  (상태값은 반드시 진행/완료/대기/보류 중 정확히 하나)
여러 행은 각각 한 줄씩.

🔒 일정 잠금 토글 ("잠금/고정 걸어줘", "열쇠 표시해줘", "자동으로 바꿔줘", "잠금 해제해줘"):
[[ACTION:TOGGLE_KEY:번호]]
이미 잠겨있으면 자동으로 해제, 자동이면 잠금으로 전환합니다.

📐 WBS 레벨 변경 ("레벨 2로 바꿔줘", "한 단계 낮춰줘/높여줘"):
[[ACTION:SET_LEVEL:번호:레벨]]  (레벨은 정수 0~4)
현재 레벨에서 "한 단계"는 ±1, 절대값 지정이면 그 숫자를 바로 넣으세요.

⬆️⬇️ 행 이동 ("위로/아래로 N칸 이동해줘", "10칸 위로"):
[[ACTION:MOVE_ROW:번호:UP:칸수]]  또는  [[ACTION:MOVE_ROW:번호:DOWN:칸수]]
칸수 생략 시 1칸으로 처리. 예: "#G176을 3칸 위로" → [[ACTION:MOVE_ROW:176:UP:3]]

🔀 특정 행 앞(위)에 배치 ("176을 190 위에/앞에 놓아줘", "190번 전에 넣어줘"):
[[ACTION:MOVE_ROW_BEFORE:이동할번호:기준번호]]
예: "#G176을 #G190 위에" → [[ACTION:MOVE_ROW_BEFORE:176:190]]
주의: 두 행이 같은 WBS 트리 내에 있을 때만 의도대로 작동합니다.

위 6가지 태그(DELETE_ROW/SET_STATUS/TOGGLE_KEY/SET_LEVEL/MOVE_ROW/MOVE_ROW_BEFORE)는 확인 없이 즉시 실행됩니다. 요청이 불분명하면 먼저 확인을 구하세요.

📝 행 추가 / 업무명·날짜·담당 수정 (사람 확인을 거친 뒤에만 적용):
아래 두 기능은 "① 초안 작성 → ② 사용자 확인 → ③ 적용"의 2단계 왕복으로만 동작합니다.

**새 행 추가 요청** — 아래 형식으로 초안을 작성해 답변 맨 마지막에 붙이세요:
[[GANTT_ADD_DRAFT]]
위치: 번호 (이 번호의 행 바로 아래에 삽입 — 생략하면 마지막에 추가)
업무명: 새 업무명
레벨: 1 (0~4, 생략하면 1)
담당: 담당자 이름 (생략 가능)
시작일: YYYY-MM-DD (생략 가능)
완료일: YYYY-MM-DD (생략 가능)
상태: 진행 (생략하면 진행)
내용: 업무 상세 내용 (생략 가능)
[[/GANTT_ADD_DRAFT]]
- 이 턴에는 확정 태그를 붙이지 마세요 — 초안만 보여주고 사용자 확인을 기다리세요.
- 사용자가 "추가해줘/이대로 해줘/네" 등으로 확정하면 → [[ACTION:APPLY_GANTT_ADD:CONFIRM]]

**기존 행 수정 요청 (업무명·담당·날짜·상태·내용 변경)** — 아래 형식으로 초안을 작성해 답변 맨 마지막에 붙이세요:
[[GANTT_EDIT_DRAFT:번호]]
업무명: 바꿀 이름 (생략하면 변경 안 함)
담당: 바꿀 담당자 (생략하면 변경 안 함)
시작일: YYYY-MM-DD (생략하면 변경 안 함)
완료일: YYYY-MM-DD (생략하면 변경 안 함)
상태: 완료 (생략하면 변경 안 함)
내용: 바꿀 내용 (생략하면 변경 안 함)
[[/GANTT_EDIT_DRAFT]]
- 사용자가 명시한 항목만 적고, 변경 안 할 항목의 줄은 통째로 생략하세요.
- 이 턴에는 확정 태그를 붙이지 마세요 — 초안만 보여주고 사용자 확인을 기다리세요.
- 사용자가 "적용해줘/이대로 해줘/네" 등으로 확정하면 → [[ACTION:APPLY_GANTT_EDIT:CONFIRM]]
- 수정 요청이 오면 → 해당 블록을 처음부터 다시 통째로 출력하세요(이전 초안 대체).
- 취소 요청이면 → 태그 없이 "네, 수정을 취소했습니다"라고만 답하세요.

🌐 다른 프로젝트 조회 규칙 (기본은 항상 지금 열려있는 이 프로젝트 기준으로 답변하되, 사용자가 다른 프로젝트를 물으면 전체 프로젝트를 열람해서 답할 수 있는 기능):
아래 [다른 프로젝트 목록]은 지금 열려있는 이 프로젝트를 제외한, 전체 등록된 다른 프로젝트들의 가벼운 목록(이름/고객사/담당자)입니다 — 이 목록엔 업무 상세 데이터가 없으니, 목록만 보고 다른 프로젝트의 업무 내용을 안다고 착각하거나 지어내지 마세요.
1. **기본값**: 질문에 특정 프로젝트를 콕 집어 언급하지 않았거나, [다른 프로젝트 목록]에 없는 "이 프로젝트"를 가리키는 표현(예: "이 프로젝트", "여기", 프로젝트명 언급 없음)이면 — 항상 지금까지처럼 위쪽 [프로젝트]/[업무 목록] 등 "지금 열려있는 이 프로젝트" 데이터만 근거로 답하세요. 다른 프로젝트 조회는 시도하지 마세요.
2. **다른 프로젝트를 물었을 때**: 사용자의 질문이 [다른 프로젝트 목록]에 있는 것으로 보이는 이름(모델명/고객사 등)을 언급하면(예: "OO 프로젝트는 일정이 어떻게 돼?", "△△ 고객사 건 지연된 거 있어?"):
   - 아래 [요청하신 다른 프로젝트 상세 데이터] 섹션에 그 프로젝트 데이터가 이미 포함되어 있다면, 그 내용을 근거로 바로 답변하세요(아래 절차를 다시 밟지 말고 태그도 다시 붙이지 마세요).
   - 그 섹션이 아직 없다면, [다른 프로젝트 목록]에서 요청과 가장 일치하는 프로젝트를 정확히 하나만(또는 질문이 여러 프로젝트에 걸치면 그만큼 여러 개를) 찾아, 다른 말이나 설명 없이 답변으로 정확히 이 형식만 출력하세요: [[ACTION:LOAD_PROJECT:그프로젝트의번호]] (여러 개면 각각 한 줄씩, 예: [[ACTION:LOAD_PROJECT:3]]\n[[ACTION:LOAD_PROJECT:7]]) — "P"는 빼고 숫자만 넣습니다(#P3이면 LOAD_PROJECT:3). 시스템이 해당 프로젝트 데이터를 찾아 자동으로 다시 물어봅니다.
   - 일치하는 프로젝트가 없으면 태그를 쓰지 말고 "그런 프로젝트를 찾지 못했습니다"라고 답하고, 비슷한 이름이 있으면 후보로 보여주며 되물어보세요. 여러 개가 애매하게 겹치면(예: 같은 이름의 프로젝트가 2개) 태그를 쓰지 말고 어느 쪽인지 되물어보세요.
3. 다른 프로젝트의 업무를 언급할 때는 "#G숫자" 같은 클릭 인용 번호를 절대 붙이지 마세요(그 번호는 지금 열려있는 이 프로젝트의 업무에만 유효합니다 — 다른 프로젝트 업무는 그냥 업무명으로 설명하세요). 답변 안에서 지금 프로젝트 얘기와 다른 프로젝트 얘기가 섞이면 "(OO 프로젝트)"처럼 어느 프로젝트 얘기인지 매번 명확히 구분해서 헷갈리지 않게 하세요.

[오늘 날짜]
${ctx.todayStr}

${ctx.projectLine}

[프로젝트 개요]
${ctx.overviewText}

[담당자/프로젝트 멤버]
${ctx.memberText}

[주요 자재]
${ctx.materialText}

[Customer SPEC — 고객 제안용 완제품 모델 비교]
${ctx.customerSpecText}

[M.C Table (원가/공수)]
${ctx.mcTableText}

[Elec Parts SPEC — 실사용 전자부품(원자재)의 상세 스펙]
${ctx.elecPartsText}

[주소록 — 이름/부서/직함만 포함, 연락처는 미포함]
${ctx.addressText}

[다른 프로젝트 목록 — 지금 열려있는 이 프로젝트 제외, 업무 상세 데이터 없음]
${ctx.otherProjectsText}
${otherProjectSection}
전체 업무 수: ${ctx.totalTasks}건

[업무 목록]
${ctx.taskListText}
${mailSection}
[최근 변경 이력]
${ctx.recentLogsText}

[지금까지의 대화]
${historyText}

[사용자의 새 질문]
${question}

위 질문에 대한 답변만 작성하세요. 데이터 값을 담는 JSON 응답은 쓰지 마세요(단, 위 규칙에 따른 [[ACTION:SET_ALARM:번호]] / [[ACTION:CLEAR_ALARM:번호]] / [[ACTION:VIEW_MAIL:번호]] / [[MAIL_DRAFT]]...[[/MAIL_DRAFT]] / [[ACTION:SEND_MAIL:CONFIRM]] / [[ACTION:LOAD_PROJECT:번호]] / [[ACTION:DELETE_ROW:번호]] / [[ACTION:SET_STATUS:번호:상태]] / [[ACTION:TOGGLE_KEY:번호]] / [[ACTION:SET_LEVEL:번호:레벨]] / [[ACTION:MOVE_ROW:번호:방향:칸수]] / [[ACTION:MOVE_ROW_BEFORE:번호:번호]] / [[GANTT_EDIT_DRAFT:번호]]...[[/GANTT_EDIT_DRAFT]] / [[ACTION:APPLY_GANTT_EDIT:CONFIRM]] / [[GANTT_ADD_DRAFT]]...[[/GANTT_ADD_DRAFT]] / [[ACTION:APPLY_GANTT_ADD:CONFIRM]] 태그는 예외입니다). 가독성을 위한 마크다운은 적극 사용하세요: 굵게(**제목**)로 소제목을 달고, "- " 글머리 기호로 항목을 나열하고, 필요하면 그 아래 두 칸 들여쓴 "  - "로 하위 항목(내용/조치 사항 등)을 붙이세요. 여러 이슈를 정리할 때는 이슈별로 소제목(굵게) 하나 + 하위 글머리 기호 여러 개 구조를 기본으로 쓰세요.`;
    };

    // 💡 위 원본 함수를 실데이터 대신 "${토큰}" 문자열 그 자체로 호출해서, 사용자가 편집할 수 있는
    //    "기본 프롬프트 텍스트"를 자동 생성한다. 아래 목록의 각 ${...}가 [🤖 AI 문답 → 📝 프롬프트]
    //    편집창에서 그대로 유지해야 하는 데이터 삽입 자리다(값 자체는 코드가 매번 새로 채워 넣음).
    window._defaultGanttQaPromptTemplate = window._buildGanttQaPromptTemplateRaw({
        todayStr: '${todayStr}', projectLine: '${projectLine}', overviewText: '${overviewText}',
        memberText: '${memberText}', materialText: '${materialText}', customerSpecText: '${customerSpecText}',
        mcTableText: '${mcTableText}', elecPartsText: '${elecPartsText}', addressText: '${addressText}',
        otherProjectsText: '${otherProjectsText}',
        totalTasks: '${totalTasks}', taskListText: '${taskListText}', recentLogsText: '${recentLogsText}'
    }, '${question}', '${historyText}', '${mailSection}', '${otherProjectSection}');

    // 💡 [2026-08-31 신규] AI 문답 프롬프트도 AI 업무분석/AI 프로젝트 요약과 동일하게 "팀 공용(Drive)
    //    프롬프트 텍스트 + 데이터 토큰 치환" 구조로 전환 — 문구 수정이 이제 코드 변경 없이
    //    [💬 AI 문답 → 📝 프롬프트]에서 가능하다. ctx(표/목록 데이터) 자체는 여전히 코드가 매번 새로
    //    만든다(사용자가 직접 타이핑할 수 없는 부분이므로) — 편집 가능한 건 지시문/설명 텍스트뿐이다.
    window._buildGanttQaPrompt = async function(question, priorHistory, mailTexts, otherProjectTexts) {
        const ctx = await window._buildGanttQaContext();
        const historyText = (priorHistory && priorHistory.length)
            ? priorHistory.map(function(h) { return (h.role === 'user' ? '사용자' : 'AI') + ': ' + h.text; }).join('\n')
            : '(없음)';
        const mailSection = (mailTexts && mailTexts.length)
            ? `\n[요청하신 원문 메일 전문]\n${mailTexts.join('\n\n---\n\n')}\n`
            : '';
        // 💡 [2026-09-01 신규] "🌐 다른 프로젝트 조회" — [[ACTION:LOAD_PROJECT:번호]] 후속 호출에서만
        //    채워짐(sendGanttQaMessage 참고, VIEW_MAIL의 mailTexts와 동일한 2단계 조회 패턴).
        const otherProjectSection = (otherProjectTexts && otherProjectTexts.length)
            ? `\n[요청하신 다른 프로젝트 상세 데이터]\n${otherProjectTexts.join('\n\n---\n\n')}\n`
            : '';

        const savedTemplate = localStorage.getItem('gantt_qa_prompt');
        const template = savedTemplate || window._defaultGanttQaPromptTemplate;
        // 💡 String.replace(문자열, ...)는 첫 매치만 치환한다 — 같은 토큰이 편집된 프롬프트에 두 번 이상
        //    쓰이면 나머지가 안 바뀌는, AI 프로젝트 요약에서 발견됐던 것과 같은 버그를 피하려고 처음부터
        //    split/join 기반 rep()으로 전체 치환한다.
        const rep = function(str, token, value) { return str.split(token).join(String(value)); };
        let result = template;
        result = rep(result, '${todayStr}', ctx.todayStr);
        result = rep(result, '${projectLine}', ctx.projectLine);
        result = rep(result, '${overviewText}', ctx.overviewText);
        result = rep(result, '${memberText}', ctx.memberText);
        result = rep(result, '${materialText}', ctx.materialText);
        result = rep(result, '${customerSpecText}', ctx.customerSpecText);
        result = rep(result, '${mcTableText}', ctx.mcTableText);
        result = rep(result, '${elecPartsText}', ctx.elecPartsText);
        result = rep(result, '${addressText}', ctx.addressText);
        result = rep(result, '${otherProjectsText}', ctx.otherProjectsText);
        result = rep(result, '${totalTasks}', ctx.totalTasks);
        result = rep(result, '${taskListText}', ctx.taskListText);
        result = rep(result, '${mailSection}', mailSection);
        result = rep(result, '${otherProjectSection}', otherProjectSection);
        result = rep(result, '${recentLogsText}', ctx.recentLogsText);
        result = rep(result, '${historyText}', historyText);
        result = rep(result, '${question}', question);
        return result;
    };

    // 💡 [2026-08-28 신규] AI 요약/AI 문답 답변에 나오는 "#98" 같은 업무 번호(컨텍스트의 taskListText가
    //    항상 "#숫자" 형태로 붙여주는 그 번호, [[ACTION:...]] 태그가 가리키는 번호와 동일)를 클릭하면
    //    그 업무로 실제 이동(스크롤+하이라이트)할 수 있게 링크로 바꿔준다 — "분석 내용이 원본과 맞는지
    //    확인하고 싶다"는 요청 대응. escapeHtml()을 거친 텍스트 위에서만 동작하고 \d+만 캡처하므로
    //    삽입 위험 없이 안전하게 재사용 가능(_mdToHtml/AI 요약 리포트 양쪽에서 공용으로 씀).
    // 💡 [2026-08-28 추가 → 같은 날 수정] "#98" 옆에 바로 알람을 켤 수 있는 아이콘도 같이 붙인다 —
    //    사용자가 매번 "이 업무 알람 걸어줘"라고 말로 다시 요청하지 않아도, 이미 구현된 알람 설정
    //    기능(아래 window._aiAssistSetAlarm)을 클릭 한 번으로 바로 실행할 수 있게 한다. 처음엔 🔔(종)을
    //    썼는데, 이 앱은 "No." 칸의 행별 알람 토글(window.wrToggleAlarm, 10824줄)부터 캘린더/텔레그램
    //    알람 알림까지 이미 전부 📌(압정)로 알람을 표시하고 있어서, 그 관례에 맞춰 📌으로 통일한다.
    // 💡 [2026-08-30 신규] "#98" 인용 옆에 원문 메일 링크와 발신인 이름도 같이 보여달라는 요청 —
    // AI가 자기 답변 텍스트에 직접 "발신:이름"을 적게 하면(다른 프롬프트 필드들처럼) 옮겨 적는 과정에서
    // 틀리거나 빠뜨릴 위험이 있으므로, #98처럼 실제 globalData[rowIndex]에서 프로그램적으로 정확한 값을
    // 읽어와 붙인다(📌 알람 아이콘과 동일한 이유). 원문이 없거나 발신인을 못 찾으면 그 부분만 조용히 생략.
    // 💡 [2026-08-30 신규] 인용 하나("#G105" 등)를 HTML로 만드는 로직을 함수로 분리 — 원래
    // _linkifyTaskRefs 안에서 정규식 콜백 하나로만 쓰던 걸, "#G1~G6" 압축 표시(아래
    // _linkifyTaskRefs의 range 분기)에서도 "양 끝 번호 두 개"를 똑같이 그리는 데 재사용하기 위해 뺐다.
    const _simpleRefJump = { CS: ['window._aiJumpToCsRow', 'Click to jump to this Customer SPEC row', '클릭하면 이 Customer SPEC 행으로 이동합니다'],
        MC: ['window._aiJumpToMcRow', 'Click to jump to this M.C Table row', '클릭하면 이 M.C Table 행으로 이동합니다'],
        EP: ['window._aiJumpToEpRow', 'Click to jump to this Elec Parts spec column', '클릭하면 이 Elec Parts 스펙 열로 이동합니다'],
        MT: ['window._aiJumpToMtRow', 'Click to jump to this material row', '클릭하면 이 주요 자재 행으로 이동합니다'],
        AD: ['window._aiJumpToAdRow', 'Click to jump to this address book row', '클릭하면 이 주소록 행으로 이동합니다'] };
    // 💡 [2026-09-03 수정] wrapBefore/wrapAfter 파라미터 추가 — _linkifyTaskRefs 가 ref 전후에
    //    붙어있는 괄호/마침표 등의 구두점을 캡처해서 chip 안에 같이 포함시킴(chip 숨김 시 함께 숨겨짐).
    window._renderOneAiRef = function(p, n, wrapBefore, wrapAfter) {
        const _en = window._currentLang === 'en';
        const idx = parseInt(n, 10);
        const wb = wrapBefore || '';
        const wa = wrapAfter || '';
        if (_simpleRefJump[p]) {
            const def = _simpleRefJump[p];
            return `<span class="ai-ref-chip" style="display:none">${wb}<span class="ai-task-ref" onclick="${def[0]}(${idx}); event.stopPropagation();" title="${_en ? def[1] : def[2]}" style="color:#0056b3; font-weight:bold; cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px;">#${p}${n}</span>${wa}</span>`;
        }
        const rowIndex = idx;
        const row = (typeof globalData !== 'undefined' && globalData) ? globalData[rowIndex] : null;
        // 💡 [2026-08-30 재작성] 요약/문답 답변에 "#G105, #G106, #G108"처럼 인용이 여러 개 연달아
        // 나오면, 매번 붙던 📌(알람)/📧(원문)/발신인 이름까지 다 펼쳐져 한 줄이 너무 길어져 보기
        // 불편하다는 지적 — M.C Table 제품구분자 패널과 같은 방식으로, 평소엔 작은 화살표(▶)만
        // 보이고 눌러야 그 안의 내용이 옆으로 슬라이드 펼쳐지게(◀ 누르면 다시 접힘) 바꿨다.
        let extra = `<span class="ai-alarm-ref" onclick="window._aiSetAlarmFromRef(${n}, event);" title="${_en ? 'Click to toggle this task\'s alarm on/off' : '클릭하면 이 업무의 알람을 켜고 끕니다(토글)'}" style="cursor:pointer; font-size:11px; vertical-align:middle;">📌</span>`;
        if (row) {
            if (row._mailRaw) {
                // 💡 [2026-08-30 축소] "📧원문"이었던 걸 아이콘만(📧)으로 — 글자 최소화 요청
                extra += `<span class="ai-mail-ref" onclick="window._showAiTaskMailModal(${rowIndex}); event.stopPropagation();" title="${_en ? 'View the original mail for this task' : '이 업무의 원본 메일 보기'}" style="cursor:pointer; margin-left:4px; font-size:11px;">📧</span>`;
            }
            const contentStr = (typeof colIdx !== 'undefined' && colIdx.content !== -1) ? (row[colIdx.content] || '').toString() : '';
            const mailPeople = window._extractMailSenderReceiver ? window._extractMailSenderReceiver(contentStr) : { sender: '' };
            if (mailPeople.sender) {
                // 💡 [2026-08-30 축소] "발신:김철수"였던 걸 "김철수"로 — 글자 최소화 요청("발신" 라벨 생략)
                extra += `<span style="color:#888; font-size:11px; margin-left:4px;">${escapeHtml(mailPeople.sender)}</span>`;
            }
        }
        // 💡 [2026-09-03 수정] 기간 배지를 chip 바깥으로 이동 — 항상 작은 회색 글씨로 표시되어
        //    chip 숨김/보임 여부와 무관하게 날짜를 확인할 수 있음. AI 응답 텍스트의 "기간:X~Y" 중복은
        //    _mdToHtml 에서 제거한다(아래 주석 참고).
        const s2 = (typeof colIdx !== 'undefined' && colIdx.start !== -1 && row) ? (row[colIdx.start] || '') : '';
        const e2 = (typeof colIdx !== 'undefined' && colIdx.plan !== -1 && row) ? (row[colIdx.plan] || '') : '';
        const dateStr2 = (window._fmtDateRangeShort && (s2 || e2)) ? window._fmtDateRangeShort(s2, e2) : '';
        // 기간 배지는 chip 밖에 위치 — display:inline-block 으로 chip 숨김과 무관하게 항상 보임
        const dateBadge = dateStr2 ? `<span class="ai-ref-date-badge" style="color:#999; font-size:10.5px; margin-left:2px;">(${dateStr2})</span>` : '';
        // chip 구조: [wb구두점][#G링크][▶토글][extra][wa구두점]  /  chip 밖: [기간 배지 — 항상 보임]
        return `<span class="ai-ref-chip" style="display:none">${wb}<span class="ai-task-ref" onclick="window._aiJumpToRow(${n}); event.stopPropagation();" title="${_en ? 'Click to jump to this task' : '클릭하면 이 업무로 이동합니다'}" style="color:#0056b3; font-weight:bold; cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px;">#G${n}</span><span class="ai-ref-toggle" onclick="window._aiToggleRefExtra(this); event.stopPropagation();" title="${_en ? 'Show/hide alarm · mail · sender' : '펼치기/접기(알람·원문·발신인)'}">▶</span><span class="ai-ref-extra">${extra}</span>${wa}</span>${dateBadge}`;
    };
    window._linkifyTaskRefs = function(escapedText) {
        // 💡 [2026-08-30 확장] 표별 접두사(#G=Gantt, #CS=Customer SPEC, #MC=M.C Table, #EP=Elec Parts SPEC,
        //    #MT=주요 자재, #AD=주소록) 지원. 접두사 없는 bare "#숫자"는 더 이상 생성하지 않지만
        //    (과거 AI 응답/히스토리 호환 목적으로) #G와 동일하게 처리한다.
        // 💡 [2026-08-30 신규] "#G1~G6"(연속된 업무 6개를 AI가 범위로 압축해 적은 것 — 아래 프롬프트
        // 규칙 참고) 표시 지원. range 분기를 single 분기보다 정규식 앞쪽 대안(먼저 시도되는 alternation)
        // 에 둬서, "#G1~G6"이 "#G1"(단일)로 잘못 먼저 매칭되고 "~G6"만 텍스트로 남는 일이 없게 한다.
        // 양 끝(G1/G6)만 실제 클릭 가능한 번호+화살표로 그리고, 그 사이(G2~G5)는 숫자 자체를 아예
        // 만들지 않는다(사용자가 필요하면 G1이나 G6으로 가서 확인).
        // 💡 [2026-09-03 신규] ref 직전 '(' / 직후 ')' '.' 를 chip 안에 포함 — chip이 숨겨질 때
        //    이 구두점도 같이 사라져서 ", ." 등이 홀로 남아 어색해 보이는 문제를 방지.
        //    캡처 그룹이 늘어난 만큼 콜백 인자 순서도 변경됨: preR, rPrefix, rStart, rEnd, postR,
        //    preS, sPrefix, sNum, postS.
        return String(escapedText || '').replace(
            /(\()?#(G|CS|MC|EP|MT|AD)(\d+)~#?(?:G|CS|MC|EP|MT|AD)?(\d+)\b([).]*)?|(\()?#(G|CS|MC|EP|MT|AD)?(\d+)\b([).]*)?/g,
            function(m, preR, rPrefix, rStart, rEnd, postR, preS, sPrefix, sNum, postS) {
                if (rPrefix !== undefined) {
                    // range: '('는 첫 번째 chip 에, ').' 등은 마지막 chip 에 포함
                    return window._renderOneAiRef(rPrefix, rStart, preR||'', '') + '~' + window._renderOneAiRef(rPrefix, rEnd, '', postR||'');
                }
                return window._renderOneAiRef(sPrefix || 'G', sNum, preS||'', postS||'');
            }
        );
    };
    // 💡 위 "#G숫자 ▶" 화살표 클릭 시, 바로 옆 .ai-ref-extra(📌/📧/발신인)를 슬라이드로 펼치거나 접는다
    // (M.C Table의 mcToggleUnitActions와 동일한 max-width 트랜지션 패턴).
    window._aiToggleRefExtra = function(toggleEl) {
        const extra = toggleEl.nextElementSibling;
        if (!extra || !extra.classList.contains('ai-ref-extra')) return;
        const open = extra.classList.toggle('ai-ref-extra-open');
        toggleEl.textContent = open ? '◀' : '▶';
    };
    // 💡 [2026-09-03 신규/수정] 문장/항목 클릭 시 그 안의 .ai-ref-chip(기본 숨김 상태인 #G{n} 뱃지)을
    //    일괄 토글. chip 내부 요소(링크·▶) 클릭은 stopPropagation 으로 막혀 있으므로 별도 예외 불필요.
    //    클릭 시 문장 하이라이트(연한 파랑 배경)를 주고, 닫으면 다시 제거한다.
    window._aiToggleLineRefs = function(el, event) {
        if (event) event.stopPropagation();
        const chips = el.querySelectorAll('.ai-ref-chip');
        if (!chips.length) return;
        const nowShowing = chips[0].style.display === 'none'; // 현재 숨김 → 열기
        chips.forEach(function(c) { c.style.display = nowShowing ? 'inline' : 'none'; });
        // 열려있는 동안 문장 배경 하이라이트
        el.dataset.refsShown = nowShowing ? '1' : '';
        el.style.background = nowShowing ? 'rgba(44,95,138,0.07)' : '';
    };
    // 💡 위 "원문" 링크 클릭 시 뜨는 가벼운 읽기전용 모달 — Elec Parts 라이트박스(ep-lightbox-modal)와
    // 동일한 드래그 가능 팝업 패턴 재사용. Mail Analyzer 전체 작업공간을 여는 mailShowRightDetail은
    // 여기엔 과함(삽입/편집 기능까지 딸려 있음)이라 별도로 만듦.
    window._showAiTaskMailModal = function(rowIndex) {
        const _en = window._currentLang === 'en';
        const row = (typeof globalData !== 'undefined' && globalData) ? globalData[rowIndex] : null;
        const mr = row && row._mailRaw;
        if (!mr) { if (window.showToast) window.showToast(_en ? '⚠️ No original mail saved for this task.' : '⚠️ 이 업무에는 저장된 원본 메일이 없습니다.', 'warning'); return; }
        let modal = document.getElementById('ai-mail-view-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ai-mail-view-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="ai-mail-view-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:280px;">
                <div id="ai-mail-view-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; color:#7a5210; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab;">
                    <span id="ai-mail-view-title">📧 ${_en ? 'Original mail' : '원본 메일'}</span>
                    <button onclick="document.getElementById('ai-mail-view-modal').style.display='none'" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
                </div>
                <div id="ai-mail-view-body" style="padding:14px 18px; flex:1; overflow-y:auto; font-size:12.5px; white-space:pre-wrap; line-height:1.6; color:#333;"></div>
            </div>`;
            document.body.appendChild(modal);
            if (window._makeDraggable) window._makeDraggable('ai-mail-view-box', 'ai-mail-view-drag');
            if (window._bindClickToFront) window._bindClickToFront('ai-mail-view-modal');
            modal.onclick = function() { modal.style.display = 'none'; };
        }
        const bodyEl = document.getElementById('ai-mail-view-body');
        bodyEl.textContent = (_en ? 'Subject: ' : '제목: ') + (mr.subject || '-') + '\n'
            + (_en ? 'Sender: ' : '발신: ') + (mr.sender || '-') + '\n'
            + (_en ? 'Date: ' : '날짜: ') + (mr.date || '-') + '\n\n'
            + (mr.body2000 || (_en ? '(No body)' : '(본문 없음)'));
        modal.style.display = 'block';
        if (window.bringModalToFront) window.bringModalToFront('ai-mail-view-modal');
    };

    // 💡 [버그 수정] AI에게 마크다운(굵게/글머리 기호)으로 답하라고 프롬프트에 지시해도, 채팅창이
    //    escapeHtml()로 그대로 이스케이프해 white-space:pre-wrap으로만 찍고 있어서 "**제목**", "- 항목"
    //    같은 마크다운 기호가 글자 그대로 화면에 보였음 — Gemini 앱에서 보던 것처럼 소제목/글머리
    //    기호가 실제로 정리되어 보이려면 여기서 최소한의 마크다운을 HTML로 변환해줘야 함.
    //    보안: escapeHtml을 먼저 거친 뒤 그 결과 위에서만 **...**/글머리 기호 패턴을 치환하므로,
    //    AI 응답에 <script> 등이 섞여 있어도 이미 이스케이프된 텍스트라 안전함.
    window._mdToHtml = function(raw) {
        let escaped = escapeHtml(raw || '');
        escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); // **굵게**
        // 💡 [2026-09-03 신규] AI가 답변 텍스트에 직접 쓰는 "기간:X/Y~X/Y" 또는 "기간:X/Y" 패턴을
        //    제거 — ref chip 바깥에 항상 표시되는 기간 배지(ai-ref-date-badge)와 중복되기 때문.
        //    앞의 ", " 또는 " " 도 같이 제거해서 "읽다가 (, 기간:...) 가 남는" 어색함을 방지.
        escaped = escaped.replace(/,?\s*기간:\d+\/\d+(?:~\d+\/\d+)?/g, '');
        escaped = window._linkifyTaskRefs(escaped); // #G{n} → 클릭 이동 링크(chip 포함)
        const lines = escaped.split('\n');
        // 💡 [2026-09-03 신규/수정] 문장/글머리 div 에 onclick(_aiToggleLineRefs) + hover 하이라이트 추가.
        //    — 마우스 올리면 연한 파랑, 클릭해서 ref 가 열리면 약간 더 진한 파랑 배경 유지.
        const _lineOnClick = 'window._aiToggleLineRefs(this, event);';
        const _lineHover   = "this.style.background=this.dataset.refsShown?'rgba(44,95,138,0.12)':'rgba(44,95,138,0.04)';";
        const _lineOut     = "this.style.background=this.dataset.refsShown?'rgba(44,95,138,0.07)':'';";
        return lines.map(function(line) {
            const heading = line.match(/^(#{1,4})\s+(.*)$/);
            if (heading) return `<div style="font-weight:bold; margin:8px 0 3px;">${heading[2]}</div>`;
            const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
            if (bullet) {
                const depth = Math.floor(bullet[1].length / 2);
                const mark = depth > 0 ? '◦' : '•';
                const pad = 14 + depth * 16;
                return `<div style="padding-left:${pad}px; text-indent:-14px; margin-bottom:2px; cursor:pointer; border-radius:3px; transition:background .12s;" onmouseover="${_lineHover}" onmouseout="${_lineOut}" onclick="${_lineOnClick}">${mark}&nbsp;${bullet[2]}</div>`;
            }
            if (line.trim() === '') return '<div style="height:6px;"></div>';
            return `<div style="margin-bottom:2px; cursor:pointer; border-radius:3px; transition:background .12s;" onmouseover="${_lineHover}" onmouseout="${_lineOut}" onclick="${_lineOnClick}">${line}</div>`;
        }).join('');
    };

    window._renderGanttQaMessages = function() {
        const box = document.getElementById('gantt-qa-messages');
        if (!box) return;
        if (!window._ganttQaHistory.length) {
            box.innerHTML = '<div style="padding:30px 10px; text-align:center; color:#999; font-size:12px; line-height:1.6;">이 프로젝트의 Gantt 업무 · 개요 · 멤버 · 주요 자재에 대해 자유롭게 질문해보세요.<br>예) "김철수님 담당 업무 중 지연된 게 있어?"<br>예) "이 프로젝트 연간 수요량이 얼마야?"<br>예) "기구 담당자가 누구야?"</div>';
            return;
        }
        box.innerHTML = window._ganttQaHistory.map(function(m) {
            const isUser = m.role === 'user';
            // 💡 [2026-08-29 버그 수정] 원색 파랑(#0056b3) 배경 + 흰 글자 조합이었는데, 대부분의 브라우저
            //    기본 텍스트 선택(드래그) 하이라이트도 비슷한 파란 계열이라 이미 파란 배경 위에서는
            //    "지금 어디까지 선택됐는지"가 거의 안 보였다 — 그래서 복사하려고 드래그해도 선택 범위를
            //    확인할 수 없었음. 배경을 흐린 파랑으로, 글자는 진한 파랑으로 바꿔서 선택 하이라이트가
            //    배경과 뚜렷이 구분되게 한다(선택 안 된 상태에서도 읽기 편함은 그대로 유지).
            const bg = isUser ? '#e7f3ff' : (m.error ? '#fff0f0' : '#f1f3f5');
            const fg = isUser ? '#0056b3' : (m.error ? '#c92a2a' : '#333');
            const body = isUser
                ? `<div style="white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.text)}</div>`
                : `<div style="word-break:break-word;">${window._mdToHtml(m.text)}</div>`;
            // 💡 [2026-08-31 신규] AI 요약의 👍/👎 피드백 + 일괄개선과 동일한 개념을 AI 문답에도 적용 —
            //    답변 하나하나(m.uid, sendGanttQaMessage에서 부여)에 평가를 남기면, 쌓인 👎 케이스를
            //    [📝 프롬프트 → 🤖 일괄개선]에서 한 번에 모아 프롬프트 개선을 요청할 수 있다.
            const feedbackHtml = (!isUser && !m.pending && !m.error && m.uid) ? (function() {
                const fb = window._qaFeedbackFor(m.uid);
                const goodActive = fb && fb.rating === 'good';
                const badActive = fb && fb.rating === 'bad';
                return `<div style="display:flex; justify-content:flex-end; gap:4px; margin-top:4px; align-items:center;">
                    <span style="font-size:10px; color:#aaa; margin-right:2px;">도움이 되었나요?</span>
                    <button onclick="window.saveGanttQaFeedback('${m.uid}','good')" style="font-size:11px; padding:2px 8px; border:1px solid #a8dab8; background:${goodActive ? '#c9ecd3' : '#e6f6ea'}; color:#1f7a3d; border-radius:5px; font-weight:bold; cursor:pointer;">👍</button>
                    <button onclick="window.saveGanttQaFeedback('${m.uid}','bad')" style="font-size:11px; padding:2px 8px; border:1px solid #eeb0ac; background:${badActive ? '#f5c2bd' : '#fbe4e2'}; color:#b1432f; border-radius:5px; font-weight:bold; cursor:pointer;">👎</button>
                    ${badActive ? `<button onclick="window.openQaImproveCommentModal('${m.uid}')" style="font-size:10.5px; padding:2px 8px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; cursor:pointer; white-space:nowrap;">💡 의견</button>` : ''}
                </div>`;
            })() : '';
            // 💡 [2026-09-01 신규] "📤 메일 작성/발송" — 이 메시지가 만든 초안이 아직 pending 중일 때만
            //    버튼을 보여줌(그 사이 새 초안이 생기거나 이미 발송/취소됐으면 id가 안 맞아 자동으로 사라짐).
            const mailDraftHtml = (!isUser && m.mailDraftId && window._ganttQaPendingMailDraft && window._ganttQaPendingMailDraft.id === m.mailDraftId)
                ? `<div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                    <button onclick="window._aiSendPendingMailDraft('${m.mailDraftId}', this)" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11.5px; padding:5px 12px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📤 이대로 보내기</button>
                    <button onclick="window._aiCancelPendingMailDraft('${m.mailDraftId}')" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="font-size:11.5px; padding:5px 12px; border:1px solid #ccc; background:#f8f9fa; color:#555; border-radius:6px; cursor:pointer; transition:background .15s;">취소</button>
                </div>`
                : '';
            // 💡 [2026-09-01 신규] "📢 공지 등록"/"📌 알람 세부 설정" — 메일 초안과 동일한 방식으로,
            //    이 메시지가 만든 초안이 아직 pending 중일 때만 버튼을 보여준다.
            const noticeDraftHtml = (!isUser && m.noticeDraftId && window._ganttQaPendingNoticeDraft && window._ganttQaPendingNoticeDraft.id === m.noticeDraftId)
                ? `<div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                    <button onclick="window._aiRegisterPendingNoticeDraft('${m.noticeDraftId}', this)" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11.5px; padding:5px 12px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📢 이대로 등록</button>
                    <button onclick="window._aiCancelPendingNoticeDraft('${m.noticeDraftId}')" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="font-size:11.5px; padding:5px 12px; border:1px solid #ccc; background:#f8f9fa; color:#555; border-radius:6px; cursor:pointer; transition:background .15s;">취소</button>
                </div>`
                : '';
            const alarmDraftHtml = (!isUser && m.alarmDraftId && window._ganttQaPendingAlarmDraft && window._ganttQaPendingAlarmDraft.id === m.alarmDraftId)
                ? `<div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                    <button onclick="window._aiApplyPendingAlarmDraft('${m.alarmDraftId}', this)" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11.5px; padding:5px 12px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📌 이대로 적용</button>
                    <button onclick="window._aiCancelPendingAlarmDraft('${m.alarmDraftId}')" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="font-size:11.5px; padding:5px 12px; border:1px solid #ccc; background:#f8f9fa; color:#555; border-radius:6px; cursor:pointer; transition:background .15s;">취소</button>
                </div>`
                : '';
            // 💡 [2026-09-03 신규] Gantt 수정 초안 버튼 (✏️ 이대로 적용 / 취소)
            const ganttEditDraftHtml = (!isUser && m.ganttEditDraftId && window._ganttQaPendingEditDraft && window._ganttQaPendingEditDraft.id === m.ganttEditDraftId)
                ? `<div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                    <button onclick="window._aiApplyPendingGanttEditDraft('${m.ganttEditDraftId}', this)" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11.5px; padding:5px 12px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✏️ 이대로 적용</button>
                    <button onclick="window._aiCancelPendingGanttEditDraft('${m.ganttEditDraftId}')" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="font-size:11.5px; padding:5px 12px; border:1px solid #ccc; background:#f8f9fa; color:#555; border-radius:6px; cursor:pointer; transition:background .15s;">취소</button>
                </div>`
                : '';
            // 💡 [2026-09-03 신규] Gantt 새 행 추가 초안 버튼 (➕ 이대로 추가 / 취소)
            const ganttAddDraftHtml = (!isUser && m.ganttAddDraftId && window._ganttQaPendingAddDraft && window._ganttQaPendingAddDraft.id === m.ganttAddDraftId)
                ? `<div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                    <button onclick="window._aiApplyPendingGanttAddDraft('${m.ganttAddDraftId}', this)" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11.5px; padding:5px 12px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:6px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➕ 이대로 추가</button>
                    <button onclick="window._aiCancelPendingGanttAddDraft('${m.ganttAddDraftId}')" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="font-size:11.5px; padding:5px 12px; border:1px solid #ccc; background:#f8f9fa; color:#555; border-radius:6px; cursor:pointer; transition:background .15s;">취소</button>
                </div>`
                : '';
            return `<div style="display:flex; flex-direction:column; align-items:${isUser ? 'flex-end' : 'flex-start'}; margin-bottom:10px;">
                <div style="max-width:82%; padding:9px 12px; border-radius:10px; background:${bg}; color:${fg}; font-size:12.5px; line-height:1.55;">${body}</div>
                ${feedbackHtml ? `<div style="max-width:82%; width:100%;">${feedbackHtml}</div>` : ''}
                ${mailDraftHtml ? `<div style="max-width:82%; width:100%;">${mailDraftHtml}</div>` : ''}
                ${noticeDraftHtml ? `<div style="max-width:82%; width:100%;">${noticeDraftHtml}</div>` : ''}
                ${alarmDraftHtml ? `<div style="max-width:82%; width:100%;">${alarmDraftHtml}</div>` : ''}
                ${ganttEditDraftHtml ? `<div style="max-width:82%; width:100%;">${ganttEditDraftHtml}</div>` : ''}
                ${ganttAddDraftHtml ? `<div style="max-width:82%; width:100%;">${ganttAddDraftHtml}</div>` : ''}
            </div>`;
        }).join('');
        box.scrollTop = box.scrollHeight;
    };

    // 💡 [2026-08-28 신규] AI 문답이 실제로 앱 데이터를 바꿀 수 있는 유일한 통로 — AI 답변 끝에 붙는
    //    [[ACTION:SET_ALARM:번호]] 태그를 찾아 그 행의 알람(_알림)을 실제로 켠다. wrToggleAlarm()과
    //    달리 "토글"이 아니라 "설정"이라서 이미 켜져 있으면 아무 것도 건드리지 않고 그 사실만 알려준다
    //    (안전한 재실행). rowIndex가 잘못됐거나(응답 이후 행이 삭제됨 등) 유효하지 않으면 실패로 반환.
    window._aiAssistSetAlarm = function(rowIndex) {
        const row = globalData && globalData[rowIndex];
        if (!row || row._level === undefined) return { ok: false };
        const label = (row._level === 0 ? row._origDev : row._level === 1 ? row._origT1
            : row._level === 2 ? row._origT2 : row._level === 3 ? row._origT3 : row._origT4) || '(제목없음)';
        const alreadyOn = !!row._알림;
        if (!alreadyOn) {
            row._알림 = true;
            logChange(rowIndex, -1, '알림 설정', '알림 켜짐', 'AI 문답으로 설정');
            renderTable(globalData);
            applyFilters();
            if (window.paintRowSelection) window.paintRowSelection();
            const alarmPanel = document.getElementById('tab-alarm');
            if (alarmPanel && alarmPanel.classList.contains('active') && window.renderAlarmTab) window.renderAlarmTab();
        }
        return { ok: true, alreadyOn: alreadyOn, taskName: label };
    };

    // 💡 [2026-08-28 신규] 위 window._aiAssistSetAlarm의 "끄기" 짝 — "알람 해제해줘/꺼줘/취소해줘" 요청에
    //    대응한다. 이미 꺼져 있으면(원래부터 알람이 없던 업무 포함) 아무 것도 건드리지 않고 그 사실만
    //    알려준다(안전한 재실행 — SET_ALARM과 대칭되는 설계).
    window._aiAssistClearAlarm = function(rowIndex) {
        const row = globalData && globalData[rowIndex];
        if (!row || row._level === undefined) return { ok: false };
        const label = (row._level === 0 ? row._origDev : row._level === 1 ? row._origT1
            : row._level === 2 ? row._origT2 : row._level === 3 ? row._origT3 : row._origT4) || '(제목없음)';
        const alreadyOff = !row._알림;
        if (!alreadyOff) {
            row._알림 = false;
            logChange(rowIndex, -1, '알림 설정', '알림 꺼짐', 'AI 문답으로 설정');
            renderTable(globalData);
            applyFilters();
            if (window.paintRowSelection) window.paintRowSelection();
            const alarmPanel = document.getElementById('tab-alarm');
            if (alarmPanel && alarmPanel.classList.contains('active') && window.renderAlarmTab) window.renderAlarmTab();
        }
        return { ok: true, alreadyOff: alreadyOff, taskName: label };
    };

    // ── 💡 [2026-09-03 신규] AI 문답 Gantt 직접 조작 헬퍼 ──────────────────────────────────────
    //    알람(SET/CLEAR_ALARM)과 동일한 설계 — globalData를 직접 수정하고 recalculateSchedules 호출.
    //    오류 시 { ok: false } 반환, 성공 시 { ok: true, taskName, ... } 반환.

    // 공통: 레벨별 업무명 추출 (내부 유틸 — 아래 함수들이 공유)
    const _aiGetTaskLabel = function(row) {
        if (!row) return '(알 수 없음)';
        return (row._level === 0 ? row._origDev : row._level === 1 ? row._origT1
            : row._level === 2 ? row._origT2 : row._level === 3 ? row._origT3 : row._origT4) || '(제목없음)';
    };

    // 🗑️ 행 삭제 — 확인 모달 없이 즉시 삭제 (AI 문답 전용 경로 / Undo로 복구 가능)
    window._aiAssistDeleteRow = function(rowIndex) {
        const row = typeof globalData !== 'undefined' && globalData && globalData[rowIndex];
        if (!row || row._level === undefined) return { ok: false };
        const label = _aiGetTaskLabel(row);
        globalData.splice(rowIndex, 1);
        window.changeLogs.push({
            time: new Date().toLocaleString('ko-KR'),
            userName: window.currentUserName || '비로그인',
            rowName: rowIndex,
            colName: '행 조작',
            oldVal: label,
            newVal: 'AI 문답으로 삭제됨'
        });
        window.recalculateSchedules();
        return { ok: true, taskName: label };
    };

    // 📊 상태 변경 (진행/완료/대기/보류)
    window._aiAssistSetStatus = function(rowIndex, status) {
        const row = typeof globalData !== 'undefined' && globalData && globalData[rowIndex];
        if (!row || row._level === undefined) return { ok: false };
        if (typeof colIdx === 'undefined' || colIdx.status === -1) return { ok: false, error: '상태 열 없음' };
        const label = _aiGetTaskLabel(row);
        const oldStatus = row[colIdx.status] || '';
        row[colIdx.status] = status;
        logChange(rowIndex, colIdx.status, '상태 변경', `${oldStatus} → ${status}`, 'AI 문답으로 변경');
        window.recalculateSchedules();
        return { ok: true, taskName: label, from: oldStatus, to: status };
    };

    // 🔒 일정 잠금/해제 토글 (열쇠 표시)
    window._aiAssistToggleKey = function(rowIndex) {
        const row = typeof globalData !== 'undefined' && globalData && globalData[rowIndex];
        if (!row || row._level === undefined) return { ok: false };
        const label = _aiGetTaskLabel(row);
        const wasLocked = !!(row._startForced && row._planForced);
        if (window._applyScheduleLockToIndices) {
            window._applyScheduleLockToIndices([rowIndex], !wasLocked, true);
        } else {
            // 폴백: 직접 처리
            if (!wasLocked) {
                if (typeof colIdx !== 'undefined' && colIdx.start !== -1 && row._calcStartTs) row[colIdx.start] = formatTsToYMD(row._calcStartTs);
                if (typeof colIdx !== 'undefined' && colIdx.plan !== -1 && row._calcPlanTs) row[colIdx.plan] = formatTsToYMD(row._calcPlanTs);
                row._startForced = true; row._planForced = true;
            } else {
                row._startForced = false; row._planForced = false;
            }
        }
        logChange(rowIndex, -1, '일정 모드', (!wasLocked ? '🔒 고정' : '🔓 자동') + ' (AI 문답으로 변경)');
        window.recalculateSchedules();
        return { ok: true, taskName: label, locked: !wasLocked };
    };

    // 📐 WBS 레벨 변경 (0~4)
    window._aiAssistSetLevel = function(rowIndex, newLevel) {
        const row = typeof globalData !== 'undefined' && globalData && globalData[rowIndex];
        if (!row || row._level === undefined) return { ok: false };
        newLevel = Math.max(0, Math.min(4, parseInt(newLevel, 10)));
        if (isNaN(newLevel)) return { ok: false, error: '잘못된 레벨 값' };
        const oldLevel = row._level;
        if (oldLevel === newLevel) return { ok: true, taskName: _aiGetTaskLabel(row), sameLevel: true };
        const taskTxt = (_aiGetTaskLabel(row) || '새로운 업무').trim();
        row._level = newLevel;
        row._origDev = ''; row._origT1 = ''; row._origT2 = ''; row._origT3 = ''; row._origT4 = '';
        if (newLevel === 0) row._origDev = taskTxt;
        else if (newLevel === 1) row._origT1 = taskTxt;
        else if (newLevel === 2) row._origT2 = taskTxt;
        else if (newLevel === 3) row._origT3 = taskTxt;
        else row._origT4 = taskTxt;
        const dur = row._finalDuration || 1;
        if (typeof colIdx !== 'undefined') {
            if (colIdx.dur1 !== -1) row[colIdx.dur1] = (newLevel === 1) ? dur.toString() : '';
            if (colIdx.dur2 !== -1) row[colIdx.dur2] = (newLevel === 2) ? dur.toString() : '';
            if (colIdx.dur3 !== -1) row[colIdx.dur3] = (newLevel === 3) ? dur.toString() : '';
            if (colIdx.dur4 !== -1) row[colIdx.dur4] = (newLevel === 4) ? dur.toString() : '';
        }
        logChange(rowIndex, -1, '계층 변경', `Lv${oldLevel} → Lv${newLevel}`, 'AI 문답으로 변경');
        window.recalculateSchedules();
        return { ok: true, taskName: taskTxt, from: oldLevel, to: newLevel };
    };

    // ⬆️⬇️ 행 N칸 이동 (direction: 'UP'|'DOWN', steps: 칸 수)
    window._aiAssistMoveRow = function(rowIndex, direction, steps) {
        if (typeof globalData === 'undefined' || !globalData || !globalData[rowIndex]) return { ok: false };
        const label = _aiGetTaskLabel(globalData[rowIndex]);
        steps = Math.max(1, Math.min(50, parseInt(steps, 10) || 1));
        const dir = String(direction).toUpperCase() === 'DOWN' ? 1 : -1;
        let cur = rowIndex;
        for (let i = 0; i < steps; i++) {
            const next = window.moveRow(cur, dir);
            if (next == null) break;
            cur = next;
        }
        return { ok: true, taskName: label };
    };

    // 🔀 행 srcIdx를 targetIdx 바로 앞으로 이동 (서브트리 포함)
    window._aiAssistMoveRowBefore = function(srcIdx, targetIdx) {
        if (typeof globalData === 'undefined' || !globalData) return { ok: false };
        const srcRow = globalData[srcIdx]; const tgtRow = globalData[targetIdx];
        if (!srcRow || srcRow._level === undefined || !tgtRow || tgtRow._level === undefined) return { ok: false };
        if (srcIdx === targetIdx) return { ok: false, error: '같은 행입니다' };
        const srcLabel = _aiGetTaskLabel(srcRow); const tgtLabel = _aiGetTaskLabel(tgtRow);
        // src 서브트리 범위 계산
        const srcLv = srcRow._level;
        let srcEnd = srcIdx;
        for (let j = srcIdx + 1; j < globalData.length; j++) {
            if (typeof globalData[j]._level === 'number' && globalData[j]._level > srcLv) srcEnd = j;
            else break;
        }
        const srcBlock = globalData.splice(srcIdx, srcEnd - srcIdx + 1);
        // 제거 후 targetIdx 재계산
        let newTarget = targetIdx > srcIdx ? targetIdx - srcBlock.length : targetIdx;
        newTarget = Math.max(1, Math.min(globalData.length, newTarget)); // 0번(헤더) 앞엔 불가
        globalData.splice(newTarget, 0, ...srcBlock);
        logChange(srcIdx, -1, '행 이동', `"${srcLabel}" → "${tgtLabel}" 앞으로 이동`, 'AI 문답으로 변경');
        window.recalculateSchedules();
        return { ok: true, srcName: srcLabel, tgtName: tgtLabel };
    };

    // 💡 [2026-08-28 신규 → 같은 날 수정] 위 window._linkifyTaskRefs가 "#98" 옆에 붙여주는 📌 아이콘의
    //    클릭 핸들러 — 처음엔 window._aiAssistSetAlarm(항상 "켜기"만 하고 이미 켜져 있으면 그 사실만
    //    알려줌)을 그대로 썼는데, "한 번 클릭하면 켜고 한 번 더 클릭하면 꺼지게(토글) 해달라"는 피드백으로
    //    "No." 칸의 행별 알람 핀(window.wrToggleAlarm, 5649줄)과 동일한 진짜 토글 방식으로 바꿨다.
    //    (AI가 "알람 걸어줘" 같은 말로 요청했을 때 처리하는 [[ACTION:SET_ALARM]] 쪽은 "걸어줘"라는 표현
    //    자체가 켜기를 의미하므로 그대로 "켜기 전용" 동작을 유지 — window._aiAssistSetAlarm은 안 건드림.)
