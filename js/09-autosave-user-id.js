    // =========================================================
    // ⏰ 1분 자동 저장, 👤 로컬 사용자 식별, 🛡️ 안전장치 통합
    // =========================================================

    // =========================================================
    // 👥 [2026-09-07 신규] "내 팀" 자동 인식 — 팀별 업무 범위 제한(AI 매칭 등)의 기초 데이터.
    //    로그인 이메일(개인 Gmail)과 주소록 이메일(회사 메일 @kortek.co.kr)이 서로 다른 체계라
    //    이메일로는 매칭이 안 됨 — 대신 로그인 시 확보되는 실명(currentUserName, Drive about.get의
    //    displayName)을 주소록(Address Book)의 name/nameEn과 대조해서 dept(부서/팀)를 가져온다.
    //    자동 인식은 어디까지나 "기본값 추정"이고, 사람이 ⚙️ 설정 > 👥 내 팀에서 언제든 직접
    //    바꿀 수 있다 — 한 번이라도 수동으로 정하면(gantt_my_team_manual) 그 뒤로는 로그인해도
    //    자동 인식이 덮어쓰지 않는다.
    // =========================================================
    window.getMyTeam = function() {
        try { return localStorage.getItem('gantt_my_team') || ''; } catch(e) { return ''; }
    };
    window.setMyTeam = function(team, isManual) {
        try {
            localStorage.setItem('gantt_my_team', team || '');
            if (isManual) localStorage.setItem('gantt_my_team_manual', '1');
        } catch(e) {}
        window._updateMyTeamLabel();
    };
    window._updateMyTeamLabel = function() {
        const el = document.getElementById('my-team-label');
        if (el) el.textContent = window.getMyTeam() || (window._currentLang === 'en' ? 'Not set' : '미설정');
    };
    /** 로그인 성공 직후(또는 주소록이 새로 로드된 직후) 호출 — 이름으로 주소록을 찾아 팀을 추정 */
    window._autoDetectMyTeam = function() {
        try {
            let isManual = false;
            try { isManual = localStorage.getItem('gantt_my_team_manual') === '1'; } catch(e) {}
            if (isManual) return; // 사람이 이미 직접 정해뒀으면 자동 인식이 덮어쓰지 않음
            const myName = (window.currentUserName || '').trim();
            if (!myName || myName === '비로그인 (로컬)' || myName === '익명 사용자') return;
            const list = (window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : [];
            const hit = list.find(function(p) {
                return p && ((p.name || '').trim() === myName || (p.nameEn || '').trim() === myName);
            });
            if (hit && hit.dept && hit.dept.trim()) {
                window.setMyTeam(hit.dept.trim(), false); // 자동 추정 — manual 플래그는 안 세움
                console.info('[내 팀 자동인식] "' + myName + '" → "' + hit.dept.trim() + '"');
            }
        } catch(e) { console.warn('[내 팀 자동인식] 실패:', e); }
    };
    window._updateMyTeamLabel(); // 페이지 로드 시 저장된 값 즉시 표시

    // 💡 팀 선택 모달 — project_index.json에서 실제 존재하는 팀 목록을 뽑아 고르기 쉽게 하고,
    //    목록에 없는 팀(신설팀 등)은 직접 입력도 허용한다. 자동/직접입력 여부와 무관하게 저장하면
    //    항상 "수동 설정"으로 취급(gantt_my_team_manual=1) — 이후 로그인해도 자동인식이 안 덮어씀.
    window.openMyTeamModal = async function() {
        const _en = window._currentLang === 'en';
        let modal = document.getElementById('my-team-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'my-team-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9270; pointer-events:none; background:none; align-items:center; justify-content:center;';
            document.body.appendChild(modal);
            window._bindClickToFront && window._bindClickToFront('my-team-modal');
        }
        const isManual = (function() { try { return localStorage.getItem('gantt_my_team_manual') === '1'; } catch(e) { return false; } })();
        const current = window.getMyTeam();
        modal.innerHTML = `
            <div id="my-team-drag" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:min(var(--modal-w-sm), 92vw); box-shadow:0 8px 32px rgba(0,0,0,0.3); top:50%; left:50%; transform:translate(-50%,-50%);">
                <div style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                    <span>👥 ${_en ? 'My Team' : '내 팀 설정'}</span>
                    <button onclick="document.getElementById('my-team-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;">✕</button>
                </div>
                <div style="padding:18px;">
                    <div style="font-size:11.5px; color:#888; margin-bottom:12px; line-height:1.6;">${_en
                        ? 'This computer/browser\'s team. Used later to scope AI mail matching, etc. Auto-guessed from your login name via the Address Book — you can override it here any time.'
                        : '이 컴퓨터(브라우저)가 속한 팀입니다. 앞으로 AI 메일 매칭 범위 제한 등에 쓰일 예정입니다. 로그인 이름을 주소록과 대조해 자동으로 추정되며, 여기서 언제든 직접 바꿀 수 있습니다.'}</div>
                    <div style="font-size:12px; font-weight:bold; color:#333; margin-bottom:6px;">${_en ? 'Current' : '현재 설정'}: <span style="color:#1971c2;">${escapeHtml(current || (_en ? '(not set)' : '(미설정)'))}</span> ${isManual ? '' : (_en ? '(auto-guessed)' : '(자동 추정)')}</div>
                    <div id="my-team-options" style="display:flex; flex-direction:column; gap:6px; margin:10px 0; max-height:180px; overflow-y:auto;">
                        <div style="font-size:11px; color:#aaa;">${_en ? 'Loading team list...' : '팀 목록 불러오는 중...'}</div>
                    </div>
                    <label style="font-size:11px; color:#888; display:block; margin-bottom:4px;">${_en ? 'Or type directly' : '또는 직접 입력'}</label>
                    <input id="my-team-custom-input" type="text" value="${escapeHtml(current)}" placeholder="${_en ? 'e.g. Dev Team 3' : '예: 개발3팀'}" style="width:100%; box-sizing:border-box; padding:7px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
                        <button onclick="document.getElementById('my-team-modal').style.display='none'" style="padding:7px 16px; background:#f8f9fa; color:#666; border:1px solid #ccc; border-radius:6px; font-size:12.5px; cursor:pointer;">${_en ? 'Cancel' : '취소'}</button>
                        <button onclick="window._saveMyTeamFromModal()" style="padding:7px 16px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">${_en ? 'Save' : '저장'}</button>
                    </div>
                </div>
            </div>`;
        modal.style.display = 'flex';
        window.bringModalToFront && window.bringModalToFront('my-team-modal');

        // 팀 목록은 project_index.json에서 비동기로 채움(모달은 먼저 열어서 반응성 확보)
        try {
            const idx = window._msLoadProjectIndex ? await window._msLoadProjectIndex() : [];
            const teams = Array.from(new Set((idx || []).map(function(p) { return (p && p.team || '').trim(); }).filter(Boolean)))
                .sort(function(a, b) {
                    const na = parseInt((a.match(/\d+/) || ['0'])[0], 10), nb = parseInt((b.match(/\d+/) || ['0'])[0], 10);
                    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
                    return a.localeCompare(b, 'ko');
                });
            const optWrap = document.getElementById('my-team-options');
            if (optWrap) {
                optWrap.innerHTML = teams.length ? teams.map(function(t) {
                    const active = t === current;
                    return `<div onclick="document.getElementById('my-team-custom-input').value='${escapeHtml(t).replace(/'/g, "\\'")}'"
                        style="padding:7px 10px; border-radius:6px; cursor:pointer; font-size:12.5px; border:1px solid ${active ? '#a5c8f0' : '#e0e0e0'}; background:${active ? '#e8f4fd' : '#fff'}; color:${active ? '#1a4f7a' : '#333'};"
                        onmouseover="this.style.background='#f0f6fc';" onmouseout="this.style.background='${active ? '#e8f4fd' : '#fff'}';">${escapeHtml(t)}</div>`;
                }).join('') : `<div style="font-size:11px; color:#aaa;">${_en ? 'No team found in Drive projects.' : 'Drive 프로젝트에서 확인된 팀이 없습니다.'}</div>`;
            }
        } catch(e) { console.warn('[내 팀 설정] 팀 목록 로드 실패:', e); }
    };
    window._saveMyTeamFromModal = function() {
        const input = document.getElementById('my-team-custom-input');
        const val = (input ? input.value : '').trim();
        window.setMyTeam(val, true); // 모달에서 저장하면 항상 수동 설정으로 취급
        const modal = document.getElementById('my-team-modal');
        if (modal) modal.style.display = 'none';
        if (window.showToast) window.showToast((window._currentLang === 'en' ? '✅ My team set to: ' : '✅ 내 팀이 저장되었습니다: ') + (val || (window._currentLang === 'en' ? '(none)' : '(없음)')), 'info');
    };

    // 로컬 이름 묻기
    window.getActiveUserName = function() {
        if (window.currentUserName && window.currentUserName !== "비로그인 (로컬)" && window.currentUserName !== "익명 사용자") {
            return window.currentUserName;
        }
        let localName = localStorage.getItem('gantt_local_user');
        if (!localName) {
            localName = prompt("드라이브 미연동 상태입니다.\n수정이력에 기록될 PC(또는 사용자) 이름을 입력해주세요.", "로컬 사용자");
            if (!localName) localName = "로컬 사용자";
            localStorage.setItem('gantt_local_user', localName);
        }
        return localName + " (PC)";
    };

    const originalDeleteRow = window.deleteRow;
    window.deleteRow = function(index) {
        let tempUser = window.currentUserName; 
        window.currentUserName = window.getActiveUserName(); 
        originalDeleteRow(index); 
        window.currentUserName = tempUser; 
    };

  // 3분 자동 저장 (마지막 저장 기록 대비 수정이 있을 때만 작동)
    let inactivityTimer = null;
    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            let currentLogs = window.changeLogs ? window.changeLogs.length : 0;
            let savedLogs = window.lastSavedLogCount || 0;
            // 💡 Gantt 표 편집뿐 아니라 Summary/Brief SPEC/M.C Table 편집도 같이 확인
            const hasChanges = currentLogs > savedLogs || window._nonGanttDirty || window._cpThemeDirty;
            if (!hasChanges) return;
            if (window.currentDriveFileId) {
                saveToGoogleDrive();
            } else if (window.showToast) {
                // 💡 [버그 수정] 아직 한 번도 저장 안 한 "새 프로젝트"는 자동저장을 그대로 걸면 3분 타이머가
                //    느닷없이 관리자 비밀번호 입력창(prompt)을 띄우게 되어 당황스럽다. 대신 조용한 알림으로
                //    "저장 안 됐다"는 사실만 계속 상기시킨다 — 예전엔 이 경우 자동저장도, 알림도 전혀 없이
                //    조용히 넘어가서 작업 내용이 사라져도 알아챌 방법이 없었다.
                window.showToast(window._t('💾 아직 저장 안 된 새 프로젝트 작업이 있습니다 — 수동으로 저장해주세요', '💾 You have unsaved work on a new project — please save manually'), 'warning', 6000);
                // 💡 [2026-08-25 신규] Drive에 올릴 곳(fileId)이 아직 없는 새 프로젝트는 saveToGoogleDrive() 자체를
                //    안 타서 위 disconnect 경로도 안 거친다 — 그래도 브라우저가 꺼지면 그대로 유실되므로 이 경로에서도
                //    별도로 로컬 백업을 남겨 최소한의 안전장치를 확보한다.
                if (window._saveLocalBackup) window._saveLocalBackup('new-project-no-drive-file');
            }
        }, 180000);
    }
    ['mousemove', 'keydown', 'click', 'scroll', 'wheel'].forEach(evt => window.addEventListener(evt, resetInactivityTimer));
    resetInactivityTimer();

    // 안전장치: 뒤로가기(백스페이스) 차단
    window.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' || e.keyCode === 8) {
            let activeEl = document.activeElement;
            let isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable || activeEl.getAttribute('contenteditable') === 'true';
            if (!isInput) e.preventDefault();
        }
    });

    // 안전장치: 저장 안 하고 창 닫을 때 경고
    window.addEventListener('beforeunload', function (e) {
        let currentLogs = window.changeLogs ? window.changeLogs.length : 0;
        let savedLogs = window.lastSavedLogCount || 0;
        // 💡 Gantt 표 편집뿐 아니라 Summary/Brief SPEC/M.C Table 편집도 같이 확인
        let hasUnsaved = currentLogs > savedLogs || window._nonGanttDirty || window._cpThemeDirty;
        // 💡 [버그 수정] 지금 활성 시트만 확인했는데, [멀티시트]로 백그라운드에 잠들어있는 다른 시트
        //    (특히 fileId가 없어 어디서도 자동저장되지 않는 "새 프로젝트")에 저장 안 한 변경사항이 있어도
        //    감지하지 못했다 — 그 상태로 탭/창을 닫으면 경고 없이 그대로 사라졌다. 백그라운드 시트의
        //    스냅샷(전환 시점에 캡처된 changeLogs)까지 함께 확인한다.
        if (!hasUnsaved && window._sheets) {
            hasUnsaved = window._sheets.some(function(s) {
                if (!s || s.key === window._activeSheetKey || !s.snapshot) return false;
                const sLogs = s.snapshot.changeLogs ? s.snapshot.changeLogs.length : 0;
                const sSaved = s.snapshot.lastSavedLogCount || 0;
                return sLogs > sSaved;
            });
        }
        if (hasUnsaved) {
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    });
