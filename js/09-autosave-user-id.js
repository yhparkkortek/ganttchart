    // =========================================================
    // ⏰ 1분 자동 저장, 👤 로컬 사용자 식별, 🛡️ 안전장치 통합
    // =========================================================

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
