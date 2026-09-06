/* ================================================================
   25-ai-learning.js
   AI 학습 데이터 관리 — 오매칭/재배치 피드백 저장, 삭제 피드백 팝업
   ================================================================
   · window._writeLearningEntry(projectKey, entry)    학습 데이터 기록
   · window._alGetEntries(projectKey)                 학습 데이터 조회
   · window._alGetEntriesForSave(projectKey)          저장 시 직렬화용 항목 배열 반환
   · window._alMergeFromDrive(driveEntries, key)      Drive 로드 후 병합
   · window._showAiDeleteFeedback(index)              AI 업무 삭제 피드백 팝업
   · window._getPendingReassignQueue()                재배치 대기 큐 조회 (로드 시 호출)
   · window._checkReassignQueueOnLoad()               프로젝트 로드 시 재배치 알림
*/

// ─── 1. 학습 데이터 저장 (localStorage ↔ Drive 동기화, Phase 3) ───────────────

(function() {
    var _AL_KEY  = 'gantt_ai_learning_v1';
    var _RQ_KEY  = 'gantt_ai_reassign_queue_v1';

    function _getStore() {
        try { return JSON.parse(localStorage.getItem(_AL_KEY)) || {}; } catch(e) { return {}; }
    }
    function _saveStore(store) {
        try { localStorage.setItem(_AL_KEY, JSON.stringify(store)); } catch(e) {}
    }

    /** 프로젝트 키별 학습 항목 배열 반환 (최신순, 최대 200개) */
    window._alGetEntries = function(projectKey) {
        if (!projectKey) return [];
        return _getStore()[projectKey] || [];
    };

    /**
     * 학습 데이터 1건 기록
     * @param {string} projectKey  window.currentDriveFileName 등 프로젝트 식별자
     * @param {object} entry       { type, reason, taskName, confidence, matchedProjectName, ... }
     */
    window._writeLearningEntry = function(projectKey, entry) {
        if (!projectKey || !entry) return;
        var store = _getStore();
        if (!store[projectKey]) store[projectKey] = [];
        entry.id = entry.id || (Date.now() + '_' + Math.random().toString(36).slice(2, 7));
        entry.ts = entry.ts || new Date().toISOString();
        store[projectKey].unshift(entry);                          // 최신순 prepend
        if (store[projectKey].length > 200) store[projectKey] = store[projectKey].slice(0, 200);
        _saveStore(store);
        console.log('[AI학습] 기록 완료:', entry.type, '/', projectKey, '/', entry.taskName);
        // Phase 4: 학습 갱신 시 저신뢰도 큐 재분석 트리거
        _alTriggerRetry();
    };

    // ─── Phase 4: 재시도 엔진 — 저신뢰도(중/하/미분류) AI 업무 자동 재분석 ────────

    /**
     * globalData에서 AI 등록 + 저신뢰도 행을 스캔하여, 재분석 배너를 표시한다.
     * _writeLearningEntry 호출 직후 자동으로 실행됨.
     */
    function _alTriggerRetry() {
        // globalData가 없거나 비어있으면 스킵
        if (typeof globalData === 'undefined' || !globalData || globalData.length <= 1) return;
        var lowRows = [];
        for (var i = 1; i < globalData.length; i++) {
            var row = globalData[i];
            if (!row || !row._aiRegistered) continue;
            var conf = row._aiConfidence || '';
            if (conf === '상') continue; // 상은 이미 확정
            lowRows.push({ idx: i, taskName: row._origT3 || row._origT2 || row._origT1 || row._origT4 || row._origDev || '업무', conf: conf, snippet: row._aiSourceSnippet || '' });
        }
        if (!lowRows.length) return;
        _showRetryBanner(lowRows);
    }

    /** 재분석 제안 배너 (비침습적 — 자동 닫힘 15초, 수동 닫기 또는 실행 가능) */
    function _showRetryBanner(lowRows) {
        var existing = document.getElementById('al-retry-banner');
        if (existing) existing.remove();

        var banner = document.createElement('div');
        banner.id = 'al-retry-banner';
        banner.style.cssText =
            'position:fixed;top:56px;right:16px;z-index:99500;max-width:340px;' +
            'background:#fff8e1;border:1px solid #ffe082;border-radius:10px;' +
            'padding:12px 16px;box-shadow:0 4px 16px rgba(0,0,0,0.14);font-family:sans-serif;';
        banner.innerHTML =
            '<div style="font-size:13px;font-weight:700;color:#856404;margin-bottom:6px;">📊 AI 학습 갱신됨</div>' +
            '<div style="font-size:12px;color:#6c4a00;margin-bottom:10px;">저신뢰도 AI 업무 <b>' + lowRows.length + '건</b>을 재분석해 정확도를 높일 수 있습니다.</div>' +
            '<div style="display:flex;gap:8px;">' +
              '<button id="al-retry-run-btn" style="flex:1;padding:7px 0;background:#ffe082;color:#4a3500;border:1px solid #ffc107;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">🔄 재분석 실행</button>' +
              '<button id="al-retry-close-btn" style="padding:7px 12px;background:#f8f9fa;color:#888;border:1px solid #dee2e6;border-radius:6px;font-size:12px;cursor:pointer;">닫기</button>' +
            '</div>';
        document.body.appendChild(banner);

        document.getElementById('al-retry-close-btn').addEventListener('click', function() { banner.remove(); });
        document.getElementById('al-retry-run-btn').addEventListener('click', function() {
            banner.remove();
            _alRunRetry(lowRows);
        });
        setTimeout(function() { if (banner.parentNode) banner.remove(); }, 15000);
    }

    /**
     * 저신뢰도 행을 AI로 재분석하여 신뢰도가 올라오면 row._aiConfidence를 갱신한다.
     * snippet(_aiSourceSnippet)이 있는 행만 재분석 가능.
     */
    window._alRunRetry = async function(lowRows) {
        var apiKey = window.getActiveAiKey && window.getActiveAiKey();
        if (!apiKey) { _showToast('⚠️ AI API 키를 먼저 설정해주세요'); return; }

        var rows = (lowRows || []).filter(function(r) { return r.snippet && r.snippet.length > 10; });
        if (!rows.length) { _showToast('재분석할 수 있는 업무(원문 있음)가 없습니다'); return; }

        _showToast('🔄 저신뢰도 ' + rows.length + '건 재분석 중...', 6000);

        // 💡 [무료 API 절약] 건당 2000ms 딜레이 — 무료 Gemini 한도 준수 (메일 분석의 4000ms 기준 완화)
        var _RETRY_DELAY_MS = 2000;
        var improved = 0;
        for (var ri = 0; ri < rows.length; ri++) {
            var item = rows[ri];
            // 첫 번째 건은 딜레이 없이 바로, 이후 건부터 딜레이
            if (ri > 0) await new Promise(function(res) { setTimeout(res, _RETRY_DELAY_MS); });
            try {
                var candidatesForAI = null;
                if (window._msLoadProjectIndex && window._msFilterCandidateProjects) {
                    candidatesForAI = window._msFilterCandidateProjects(await window._msLoadProjectIndex()) || null;
                }
                var _retrySnippet = item.snippet.substring(0, 2000);
                var prompt = window.getSystemPrompt
                    ? window.getSystemPrompt('', '', '', '', _retrySnippet, null)
                    : _retrySnippet;
                // 💡 [버그 수정 2026-09-06] _msBuildProjectMatchSection이 실제로 정의된 적이 없어서(15c-mail-server-tab-2.js
                //    참고) 이 조건이 항상 false로 빠져 재시도가 후보 목록 없이 돌아갔다 — 함수 정의 후 두 번째
                //    인자(mailText)를 반드시 같이 넘겨야 "키워드 사전매칭/관리번호" 하이브리드 힌트가 계산된다.
                if (candidatesForAI && candidatesForAI.length && window._msBuildProjectMatchSection) {
                    prompt += window._msBuildProjectMatchSection(candidatesForAI, _retrySnippet, null);
                }
                var result = await window.callAiBackend(apiKey, prompt, { isCancelled: function() { return false; } });
                if (!result || !result.ok) continue;
                var text = (result.data && result.data.result && result.data.result.candidates &&
                            result.data.result.candidates[0] &&
                            result.data.result.candidates[0].content &&
                            result.data.result.candidates[0].content.parts &&
                            result.data.result.candidates[0].content.parts[0].text) || '';
                var parsed = window.parseGeminiTask ? window.parseGeminiTask(text) : null;
                if (!parsed) continue;
                var newConf = parsed['매칭신뢰도'] || parsed['_aiMeta']?.confidence || '';
                var row = typeof globalData !== 'undefined' && globalData[item.idx];
                if (row && row._aiRegistered && newConf && newConf !== item.conf) {
                    row._aiConfidence = newConf;
                    improved++;
                    console.info('[재시도 엔진] 신뢰도 갱신:', item.taskName, item.conf, '→', newConf);
                }
            } catch(e) { console.warn('[재시도 엔진] 실패:', item.taskName, e); }
        }
        if (improved > 0) {
            if (window.recalculateSchedules) window.recalculateSchedules();
            _showToast('✅ ' + improved + '건 신뢰도 갱신 완료');
        } else {
            _showToast('재분석 완료 — 신뢰도 변경 없음');
        }
    };

    // ─── 재배치 큐 ──────────────────────────────────────────────────────────

    function _saveReassignQueue(queue) {
        try { localStorage.setItem(_RQ_KEY, JSON.stringify(queue)); } catch(e) {}
    }

    window._getPendingReassignQueue = function() {
        try { return JSON.parse(localStorage.getItem(_RQ_KEY)) || []; } catch(e) { return []; }
    };

    /** 재배치 큐에서 현재 프로젝트로 온 항목 추출 (로드 시 호출) */
    window._popReassignQueueForProject = function(targetProjectId) {
        if (!targetProjectId) return [];
        var queue = window._getPendingReassignQueue();
        var mine = queue.filter(function(q) { return q.targetProjectId === targetProjectId && q.status === 'pending'; });
        if (!mine.length) return [];
        // 꺼낸 항목은 processed로 표시
        mine.forEach(function(q) { q.status = 'processed'; });
        _saveReassignQueue(queue);
        return mine;
    };

    function _pushReassignQueue(entry) {
        var queue = window._getPendingReassignQueue();
        queue.push(entry);
        _saveReassignQueue(queue);
    }

    // ─── 2. 실제 행 삭제 (changeLogs 기록 포함) ─────────────────────────────

    function _doDeleteRow(index, row, taskName) {
        var deleted = globalData.splice(index, 1);
        var name = taskName || '알 수 없는 업무';
        window.changeLogs.push({
            time: new Date().toLocaleString('ko-KR'),
            userName: window.currentUserName || '비로그인',
            rowName: index, colName: '행 조작',
            oldVal: name, newVal: '삭제됨(AI피드백)'
        });
        window.recalculateSchedules();
    }

    // ─── 3. AI 등록 업무 삭제 피드백 팝업 ───────────────────────────────────

    /**
     * AI가 등록한 업무 삭제 시 이유+재배치 피드백을 받는 팝업.
     * deleteRow()에서 row._aiRegistered===true 인 경우 이 함수로 분기됨.
     * @param {number} index  globalData 인덱스
     */
    window._showAiDeleteFeedback = async function(index) {
        var row = globalData[index];
        if (!row) return;
        var l = row._level;
        var taskName = (l===0 ? row._origDev : l===1 ? row._origT1 : l===2 ? row._origT2 : l===3 ? row._origT3 : row._origT4) || '업무';

        // 프로젝트 목록 로드 (재배치 드롭다운용)
        var projectList = [];
        try {
            if (window._msLoadProjectIndex) {
                var idx = await window._msLoadProjectIndex();
                projectList = (idx || []).filter(function(p) { return p && !p.completed; });
            }
        } catch(e) { /* 로드 실패 시 빈 목록으로 진행 */ }

        // 기존 팝업 제거
        var existing = document.getElementById('ai-delete-feedback-modal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'ai-delete-feedback-modal';
        // 💡 [2026-09-06] 사용자 확인 후 "배경조작 허용"으로 결정 — 이 팝업이 뜬 동안 배경에서
        //    같은 행이 삭제/이동되면 "그냥 삭제"/"학습+삭제" 클릭이 옛 인덱스를 참조할 수 있다는
        //    점은 감수하기로 함(사용자 승인). 배경 클릭으로 안 닫히는 기존 동작(아래 "의도적으로
        //    닫기 막음")은 그대로 유지 — 버튼으로만 닫힘.
        modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:none;pointer-events:none;display:flex;align-items:center;justify-content:center;';

        var confBadge = row._aiConfidence === '상' ? '🟢 상' :
                        row._aiConfidence === '중' ? '🟡 중' :
                        row._aiConfidence === '하' ? '🔴 하' : '';
        var regDate = row._aiRegisteredAt ? new Date(row._aiRegisteredAt).toLocaleDateString('ko-KR') : '';
        var basisHtml = row._aiMatchBasis
            ? '<div style="color:#666;font-size:11px;margin-top:6px;border-top:1px solid #e9ecef;padding-top:6px;line-height:1.5;">📎 ' + _esc(row._aiMatchBasis) + '</div>'
            : '';

        // 현재 프로젝트를 제외한 재배치 후보 목록
        var curId = window.currentDriveFileId || '';
        var curName = window.currentDriveFileName || '';
        var optionsHtml = '<option value="">-- 선택 안 함 (학습만 기록) --</option>';
        if (projectList.length) {
            projectList.forEach(function(p) {
                var pid = p.drive_file_id || p.file_name || '';
                if (pid === curId || p.file_name === curName) return; // 현재 프로젝트 제외
                var label = _esc(p.file_name || '알 수 없음') + (p.inch ? ' (' + _esc(p.inch) + '인치)' : '');
                optionsHtml += '<option value="' + _esc(pid) + '">' + label + '</option>';
            });
        } else {
            optionsHtml += '<option value="" disabled>(프로젝트 목록 로드 실패)</option>';
        }

        modal.innerHTML =
            '<div style="pointer-events:all;background:#fff;border-radius:14px;padding:28px 32px;min-width:380px;max-width:500px;' +
            'box-shadow:0 10px 44px rgba(0,0,0,0.22);font-family:sans-serif;max-height:90vh;overflow-y:auto;">' +
              '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">🤖 AI 등록 업무 삭제</div>' +
              '<div style="font-size:12px;color:#888;margin-bottom:14px;">이유를 알려주시면 다음 분석 정확도가 높아집니다.</div>' +
              '<div style="background:#f8f9fa;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;">' +
                '<div style="font-weight:600;margin-bottom:4px;">' + _esc(taskName) + '</div>' +
                '<div style="color:#888;font-size:11px;">' +
                  (confBadge ? '신뢰도: ' + confBadge + '&nbsp;&nbsp;' : '') +
                  (regDate ? 'AI 등록일: ' + regDate : '') +
                '</div>' +
                basisHtml +
              '</div>' +
              '<div style="font-size:13px;font-weight:600;margin-bottom:10px;">삭제 이유</div>' +
              '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">' +
                '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">' +
                  '<input type="radio" name="ai-del-reason" value="오매칭"> ❌ 오매칭 — 이 프로젝트 업무가 아님</label>' +
                '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">' +
                  '<input type="radio" name="ai-del-reason" value="중복"> ♻️ 중복 — 이미 등록된 업무</label>' +
                '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">' +
                  '<input type="radio" name="ai-del-reason" value="불필요"> 🚫 불필요 — 등록할 필요 없는 내용</label>' +
                '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">' +
                  '<input type="radio" name="ai-del-reason" value="기타"> 💬 기타</label>' +
              '</div>' +
              '<div id="ai-del-reassign-area" style="display:none;background:#eef3ff;border-radius:8px;padding:12px 14px;margin-bottom:16px;">' +
                '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">🔀 올바른 프로젝트로 재배치</div>' +
                '<select id="ai-del-target-project" style="width:100%;padding:7px 10px;border-radius:6px;' +
                'border:1px solid #b8c8f0;font-size:13px;background:#fff;">' + optionsHtml + '</select>' +
                '<div style="font-size:11px;color:#6c757d;margin-top:6px;">' +
                  '선택 시: 해당 프로젝트를 열면 수신 대기 알림이 표시됩니다' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">' +
                '<button id="ai-del-cancel-btn" style="padding:9px 20px;background:#dee2e6;color:#333;border:none;border-radius:7px;font-size:13px;cursor:pointer;">취소</button>' +
                '<button id="ai-del-plain-btn" style="padding:9px 18px;background:#f8f9fa;color:#495057;border:1px solid #ced4da;border-radius:7px;font-size:13px;cursor:pointer;">그냥 삭제</button>' +
                '<button id="ai-del-learn-btn" style="padding:9px 20px;background:#d63384;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;">📚 학습+삭제</button>' +
              '</div>' +
            '</div>';

        document.body.appendChild(modal);

        // 오매칭 선택 → 재배치 영역 토글
        modal.querySelectorAll('input[name="ai-del-reason"]').forEach(function(radio) {
            radio.addEventListener('change', function() {
                document.getElementById('ai-del-reassign-area').style.display =
                    this.value === '오매칭' ? '' : 'none';
            });
        });

        function closeModal() { modal.remove(); }

        document.getElementById('ai-del-cancel-btn').addEventListener('click', closeModal);

        // 그냥 삭제 (학습 없이)
        document.getElementById('ai-del-plain-btn').addEventListener('click', function() {
            closeModal();
            _doDeleteRow(index, row, taskName);
        });

        // 학습 + 삭제
        document.getElementById('ai-del-learn-btn').addEventListener('click', function() {
            var reasonEl = modal.querySelector('input[name="ai-del-reason"]:checked');
            var reason = reasonEl ? reasonEl.value : '';
            var targetProjectVal = document.getElementById('ai-del-target-project').value || '';
            var targetProject = projectList.find(function(p) {
                return (p.drive_file_id || p.file_name || '') === targetProjectVal;
            }) || null;

            // ① 학습 데이터 기록
            // 💡 [버그 수정 2026-09-06] fileId 우선 → fileName 우선을 뒤집었던 걸 되돌림. 26-topic-profile.js/
            //    27-topic-contamination.js는 처음부터 "fileId 우선"(팀 폴더 구조에서 파일명 충돌 방지)인데
            //    여기만 fileName을 먼저 봐서, 학습 기록과 오염 진단/저장(Drive aiLearning 직렬화)이 서로 다른
            //    키를 보게 되는 사고가 실제로 확인됨(같은 프로젝트인데 fileId 키 130건 vs fileName 키 1건으로
            //    쪼개짐 → 저장 시 fileName 키만 반영돼 나머지 130건이 Drive에 영영 안 실림). 아래 4곳
            //    (25-ai-learning.js 나머지 2곳, 26-gantt-search.js, 04c-core-app-mail-pipeline.js 2곳) 전부
            //    동일하게 fileId 우선으로 통일.
            var projectKey = window.currentDriveFileId || window.currentDriveFileName || '__unknown__';
            window._writeLearningEntry(projectKey, {
                type: reason === '오매칭' ? 'negative_match' :
                      reason === '중복'   ? 'duplicate' :
                      reason === '불필요' ? 'irrelevant' : 'other',
                reason: reason,
                taskName: taskName,
                confidence: row._aiConfidence || '',
                matchedProjectId: row._aiMatchedProjectId || '',
                matchedProjectName: row._aiMatchedProjectName || projectKey,
                matchBasis: row._aiMatchBasis || '',
                matchKeywords: row._aiMatchKeywords || [],
                sourceSnippet: row._aiSourceSnippet || '',
                registeredAt: row._aiRegisteredAt || '',
                correctProjectId: (reason === '오매칭' && targetProjectVal) ? targetProjectVal : '',
                correctProjectName: (reason === '오매칭' && targetProject) ? (targetProject.file_name || '') : ''
            });

            // ② 재배치 큐에 추가 (오매칭 + 프로젝트 선택됨)
            if (reason === '오매칭' && targetProjectVal) {
                _pushReassignQueue({
                    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    ts: new Date().toISOString(),
                    targetProjectId: targetProjectVal,
                    targetProjectName: targetProject ? (targetProject.file_name || targetProjectVal) : targetProjectVal,
                    taskData: {
                        업무명: taskName.replace(/\s*＊AI📧\s*$/, '').trim(),
                        상세내용: row._aiSourceSnippet || '',
                        시작일: row._aiOrigStart || '',
                        완료일: row._aiOrigPlan  || '',
                        wbs레벨: row._level != null ? String(row._level) : '3',
                        _aiMeta: {
                            confidence: '재배치',
                            matchBasis: '오매칭 삭제 후 수동 재배치',
                            keywords: row._aiMatchKeywords || [],
                            snippet: row._aiSourceSnippet || ''
                        }
                    },
                    status: 'pending'
                });
                _showToast('📚 학습 기록 완료 — ' + (targetProject ? targetProject.file_name : targetProjectVal) + '을 열면 수신 알림이 표시됩니다');
            } else {
                _showToast('📚 학습 데이터가 기록됐습니다');
            }

            closeModal();
            _doDeleteRow(index, row, taskName);
        });

        // 팝업 배경 클릭으로 닫기 방지 (실수 방지)
        modal.addEventListener('click', function(e) {
            if (e.target === modal) { /* 의도적으로 닫기 막음 */ }
        });
    };

    // ─── 4. 재배치 큐 알림 (프로젝트 로드 시 호출) ──────────────────────────

    /**
     * 현재 프로젝트 ID로 대기 중인 재배치 항목이 있으면 알림 배너를 표시한다.
     * 04b-core-app-drive-sync.js의 프로젝트 로드 완료 이벤트 또는 renderGantt 직후에 연결.
     */
    window._checkReassignQueueOnLoad = function() {
        var curId = window.currentDriveFileId || '';
        var curName = window.currentDriveFileName || '';
        if (!curId && !curName) return;

        var queue = window._getPendingReassignQueue();
        var mine = queue.filter(function(q) {
            return q.status === 'pending' &&
                   (q.targetProjectId === curId || q.targetProjectId === curName);
        });
        if (!mine.length) return;

        // 처리됨으로 마킹
        mine.forEach(function(q) { q.status = 'notified'; });
        _saveReassignQueue(queue);

        // 알림 배너
        var banner = document.createElement('div');
        banner.style.cssText =
            'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:99000;' +
            'background:#1a73e8;color:#fff;padding:10px 22px;border-radius:10px;' +
            'font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.2);' +
            'cursor:pointer;display:flex;gap:10px;align-items:center;';
        banner.innerHTML =
            '📬 오매칭으로 삭제된 업무 <b>' + mine.length + '건</b>이 재배치 대기 중입니다' +
            '<button style="background:#fff;color:#1a73e8;border:none;border-radius:5px;' +
            'padding:3px 10px;font-size:12px;font-weight:700;cursor:pointer;">확인</button>';
        document.body.appendChild(banner);

        banner.querySelector('button').addEventListener('click', function() {
            banner.remove();
            if (window._openReassignInbox) window._openReassignInbox(mine);
            else _applyReassignedTasks(mine);
        });
        setTimeout(function() { if (banner.parentNode) banner.remove(); }, 12000);
    };

    /**
     * "📬 재배치 대기" 알림 배너의 [확인] 클릭 시 호출됨(_checkReassignQueueOnLoad 참고).
     * 💡 [버그 수정 2026-09-06] 사용자 제보: "다른 프로젝트를 열었을 때 AI 업무 보관함 모달이
     *    안 열림 / 상단 AI 도구로 들어가면 열림". 원인 확인 — 이 함수(window._openReassignInbox)가
     *    처음부터 정의된 적이 없었다(_checkReassignQueueOnLoad에서 `if (window._openReassignInbox)`로
     *    존재 여부만 체크하고 있어서 에러 없이 조용히 `else _applyReassignedTasks(mine)` 폴백으로
     *    빠졌음). 그 결과 다른 프로젝트를 열어 재배치 알림 배너가 뜨고 [확인]을 눌러도, 보관함
     *    모달은 전혀 안 열리고 업무가 Gantt 맨 끝에 조용히 꽂히기만 했다 — "AI 도구" 메뉴로 직접
     *    열면 되는 이유는 그건 이 버그와 무관하게 openTaskInbox()를 곧장 호출하는 별개 경로이기 때문.
     *    → 재배치 업무를 즉시 Gantt에 꽂는 대신 업무 보관함(TaskInbox)에 "대기"로 담아, 사용자가
     *    L0 구간 등을 직접 확인하고 배치할 수 있도록 모달을 바로 열어준다.
     */
    window._openReassignInbox = function(items) {
        (items || []).forEach(function(item) {
            if (!item.taskData) return;
            window.TaskInbox.add(item.taskData, {
                source: '🔀 오매칭 재배치' + (item.targetProjectName ? '(' + item.targetProjectName + ')' : ''),
                matchedProject: item.targetProjectId
                    ? { status: 'matched', candidates: [{ drive_file_id: item.targetProjectId, file_name: item.targetProjectName || '' }] }
                    : null
            });
        });
        if (window.openTaskInbox) window.openTaskInbox();
    };

    /** 재배치 업무를 현재 프로젝트 globalData에 바로 삽입 (위 _openReassignInbox가 없을 때의 폴백) */
    function _applyReassignedTasks(items) {
        if (!items || !items.length) return;
        var added = 0;
        items.forEach(function(item) {
            if (!item.taskData) return;
            try {
                var built = window.buildMailTaskRow(item.taskData, undefined, undefined, item.taskData.상세내용 || '');
                if (!built || !built.row) return;
                globalData.push(built.row);
                added++;
                window.changeLogs.push({
                    time: new Date().toLocaleString('ko-KR'),
                    userName: window.currentUserName || '비로그인',
                    rowName: globalData.length, colName: '행 조작',
                    oldVal: '없음', newVal: '재배치: ' + built.taskName
                });
            } catch(e) { console.warn('[재배치] 삽입 실패:', e); }
        });
        if (added > 0) {
            window.recalculateSchedules();
            _showToast('✅ 재배치 업무 ' + added + '건이 추가됐습니다');
        }
    }

    // ─── 유틸 ────────────────────────────────────────────────────────────────

    function _saveReassignQueue(queue) {
        try { localStorage.setItem(_RQ_KEY, JSON.stringify(queue)); } catch(e) {}
    }

    function _esc(s) {
        if (!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _showToast(msg, ms) {
        ms = ms || 2800;
        // 전역 토스트가 있으면 재사용, 없으면 생성
        var el = document.getElementById('gantt-ai-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'gantt-ai-toast';
            el.style.cssText =
                'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
                'background:#323232;color:#fff;padding:10px 22px;border-radius:24px;' +
                'font-size:13px;z-index:200000;pointer-events:none;' +
                'transition:opacity .3s;opacity:0;';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        clearTimeout(el._tt);
        el._tt = setTimeout(function() { el.style.opacity = '0'; }, ms);
    }

    // 전역 노출 (다른 파일에서 사용 가능하게)
    window._showAiToast = _showToast;

    // ─── Phase 3: Drive 동기화 헬퍼 ─────────────────────────────────────────

    /**
     * 저장 시 호출 — 현재 프로젝트의 학습 항목 배열을 반환하여 saveData.aiLearning에 담음.
     * Drive JSON에 포함되어 다음 로드 시 팀원과 공유됨.
     */
    window._alGetEntriesForSave = function(projectKey) {
        // 💡 [버그 수정 2026-09-06] fileId 우선으로 통일 (위 "학습+삭제" 핸들러 주석 참고)
        var key = projectKey || window.currentDriveFileId || window.currentDriveFileName || '';
        return window._alGetEntries(key);
    };

    /**
     * 프로젝트 로드 시 호출 — Drive에서 받아온 항목을 localStorage와 병합.
     * id 기준으로 중복 제거 후 최신 ts 우선, 최대 200건 유지.
     * @param {Array}  driveEntries  saveData.aiLearning (Drive에서 받은 항목 배열)
     * @param {string} projectKey   로드된 프로젝트의 fileId 권장(window.currentDriveFileId 설정 전에 호출하면 직접 전달) — fileName은 팀 폴더 간 충돌 위험이 있어 비권장
     */
    window._alMergeFromDrive = function(driveEntries, projectKey) {
        if (!driveEntries || !driveEntries.length) return;
        // 💡 [버그 수정 2026-09-06] fileId 우선으로 통일 (위 "학습+삭제" 핸들러 주석 참고)
        var key = projectKey || window.currentDriveFileId || window.currentDriveFileName || '';
        if (!key) return;

        var local = _getStore()[key] || [];

        // id 기준 union — 같은 id면 ts가 더 최신인 쪽 채택
        var byId = {};
        local.forEach(function(e) { if (e && e.id) byId[e.id] = e; });
        driveEntries.forEach(function(e) {
            if (!e || !e.id) return;
            var existing = byId[e.id];
            if (!existing || ((e.ts || '') > (existing.ts || ''))) byId[e.id] = e;
        });

        // ts 내림차순 정렬, 최대 200건
        var merged = Object.values(byId).sort(function(a, b) {
            return (b.ts || '') > (a.ts || '') ? 1 : -1;
        }).slice(0, 200);

        var store = _getStore();
        store[key] = merged;
        _saveStore(store);
        console.log('[AI학습 Phase 3] Drive 병합 완료:', merged.length, '건 /', key,
                    '(Drive:', driveEntries.length, '+ Local:', local.length, ')');
    };
})();
