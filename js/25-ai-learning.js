/* ================================================================
   25-ai-learning.js
   AI 학습 데이터 관리 — 오매칭/재배치 피드백 저장, 삭제 피드백 팝업
   ================================================================
   · window._writeLearningEntry(projectKey, entry)  학습 데이터 기록
   · window._alGetEntries(projectKey)               학습 데이터 조회
   · window._showAiDeleteFeedback(index)            AI 업무 삭제 피드백 팝업
   · window._getPendingReassignQueue()              재배치 대기 큐 조회 (로드 시 호출)
*/

// ─── 1. 학습 데이터 저장 (localStorage, Phase 2에서 Drive 동기화 예정) ─────────

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
        // Phase 2: Drive 동기화 훅 예정
        console.log('[AI학습] 기록 완료:', entry.type, '/', projectKey, '/', entry.taskName);
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
        modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.52);display:flex;align-items:center;justify-content:center;';

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
            '<div style="background:#fff;border-radius:14px;padding:28px 32px;min-width:380px;max-width:500px;' +
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
            var projectKey = window.currentDriveFileName || window.currentDriveFileId || '__unknown__';
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

    /** 재배치 업무를 현재 프로젝트 globalData에 바로 삽입 */
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
})();
