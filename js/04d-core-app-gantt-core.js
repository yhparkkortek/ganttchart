// [분리됨] 원본: js/04-core-app.js 의 2812~3408행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 날짜 및 일정(Gantt) 코어 로직
    // =========================================================
    // 🛠️ 날짜 및 일정(Gantt) 코어 로직
    // =========================================================
    window.KOR_HOLIDAYS = [
        "2024-01-01", "2024-02-09", "2024-02-12", "2024-03-01", "2024-04-10", "2024-05-05", "2024-05-06", "2024-05-15", "2024-06-06", "2024-08-15", "2024-09-16", "2024-09-17", "2024-09-18", "2024-10-03", "2024-10-09", "2024-12-25",
        "2025-01-01", "2025-01-28", "2025-01-29", "2025-01-30", "2025-03-01", "2025-03-03", "2025-05-05", "2025-05-06", "2025-06-06", "2025-08-15", "2025-10-03", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08", "2025-10-09", "2025-12-25",
        "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-06", "2026-08-15", "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-09", "2026-12-25",
        "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-03-03", "2027-05-05", "2027-05-13", "2027-06-06", "2027-08-15", "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-04", "2027-10-09", "2027-10-11", "2027-12-25",
        "2028-01-01", "2028-01-25", "2028-01-26", "2028-01-27", "2028-03-01", "2028-05-02", "2028-05-05", "2028-06-06", "2028-08-15", "2028-10-02", "2028-10-03", "2028-10-04", "2028-10-05", "2028-10-09", "2028-12-25",
        "2029-01-01", "2029-02-12", "2029-02-13", "2029-02-14", "2029-03-01", "2029-05-05", "2029-05-07", "2029-05-20", "2029-05-21", "2029-06-06", "2029-08-15", "2029-09-21", "2029-09-22", "2029-09-23", "2029-09-24", "2029-10-03", "2029-10-09", "2029-12-25",
        "2030-01-01", "2030-02-02", "2030-02-03", "2030-02-04", "2030-02-05", "2030-03-01", "2030-05-05", "2030-05-06", "2030-05-09", "2030-06-06", "2030-08-15", "2030-09-11", "2030-09-12", "2030-09-13", "2030-10-03", "2030-10-09", "2030-12-25",
        "2031-01-01", "2031-01-22", "2031-01-23", "2031-01-24", "2031-03-01", "2031-03-03", "2031-05-05", "2031-05-28", "2031-06-06", "2031-08-15", "2031-09-30", "2031-10-01", "2031-10-02", "2031-10-03", "2031-10-09", "2031-12-25",
        "2032-01-01", "2032-02-10", "2032-02-11", "2032-02-12", "2032-03-01", "2032-05-05", "2032-05-16", "2032-05-17", "2032-06-06", "2032-08-15", "2032-08-16", "2032-09-18", "2032-09-19", "2032-09-20", "2032-09-21", "2032-10-03", "2032-10-04", "2032-10-09", "2032-10-11", "2032-12-25",
        "2033-01-01", "2033-01-30", "2033-01-31", "2033-02-01", "2033-03-01", "2033-05-05", "2033-05-06", "2033-06-06", "2033-08-15", "2033-10-03", "2033-10-06", "2033-10-07", "2033-10-08", "2033-10-09", "2033-10-10", "2033-12-25",
        "2034-01-01", "2034-02-18", "2034-02-19", "2034-02-20", "2034-02-21", "2034-03-01", "2034-05-05", "2034-05-25", "2034-06-06", "2034-08-15", "2034-09-26", "2034-09-27", "2034-09-28", "2034-10-03", "2034-10-09", "2034-12-25",
        "2035-01-01", "2035-02-07", "2035-02-08", "2035-02-09", "2035-03-01", "2035-05-05", "2035-05-07", "2035-05-15", "2035-06-06", "2035-08-15", "2035-09-15", "2035-09-16", "2035-09-17", "2035-09-18", "2035-10-03", "2035-10-09", "2035-12-25"
    ];

    // 💡 기본 공휴일(KOR_HOLIDAYS) + 사용자가 등록한 추가 휴일을 합쳐서 판별
    window.getCustomHolidays = function() {
        try { return JSON.parse(localStorage.getItem('gantt_custom_holidays') || '[]'); }
        catch (e) { return []; }
    };
    window.isHoliday = function(dateStr) {
        if (window.KOR_HOLIDAYS.includes(dateStr)) return true;
        return window.getCustomHolidays().some(function(h) {
            const end = h.endDate || h.date;
            return dateStr >= h.date && dateStr <= end; // "YYYY-MM-DD" 문자열은 그대로 비교해도 날짜 순서와 일치함
        });
    };

    function addWorkingDays(startDateTs, daysToAdd) {
        let currentDate = new Date(startDateTs); currentDate.setHours(0,0,0,0);
        if (daysToAdd <= 0) return currentDate.getTime(); 
        let addedDays = 0;
        while (addedDays < daysToAdd) {
            currentDate.setDate(currentDate.getDate() + 1); let dayOfWeek = currentDate.getDay(); 
            let dateStr = currentDate.getFullYear() + "-" + String(currentDate.getMonth() + 1).padStart(2, '0') + "-" + String(currentDate.getDate()).padStart(2, '0');
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !window.isHoliday(dateStr)) { addedDays++; }
        }
        return currentDate.getTime();
    }

    function countWorkingDays(startTs, endTs) {
        if (!startTs || !endTs) return 0;
        let count = 0; let cur = new Date(startTs); cur.setHours(0,0,0,0); let end = new Date(endTs); end.setHours(0,0,0,0);
        if (cur > end) return 0;
        while (cur <= end) {
            let dayOfWeek = cur.getDay(); let dateStr = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, '0') + "-" + String(cur.getDate()).padStart(2, '0');
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !window.isHoliday(dateStr)) { count++; }
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    }

    // ─── 🗓️ 휴일 등록 모달 (KOR_HOLIDAYS 기본값 + 사용자 추가 휴일, JSON 파일로 내보내기/불러오기) ───
    const _hEsc = function(s) { return (s || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

    window.saveCustomHolidays = function(list) {
        list.sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
        localStorage.setItem('gantt_custom_holidays', JSON.stringify(list));
    };

    window._hDayDiff = function(d1, d2) { return Math.round((new Date(d2) - new Date(d1)) / 86400000); };

    window.renderCustomHolidayList = function() {
        const container = document.getElementById('holiday-list-container');
        const countLabel = document.getElementById('holiday-count-label');
        if (!container) return;
        const list = window.getCustomHolidays();
        if (countLabel) {
            const totalDays = list.reduce(function(sum, h) { return sum + window._hDayDiff(h.date, h.endDate || h.date) + 1; }, 0);
            countLabel.textContent = list.length + '건 (총 ' + totalDays + '일) 등록됨';
        }
        if (!list.length) {
            container.innerHTML = '<div style="text-align:center; color:#adb5bd; padding:20px 0; font-size:12px;">등록된 추가 휴일이 없습니다.</div>';
            return;
        }
        container.innerHTML = list.map(function(h, idx) {
            const rangeLabel = (h.endDate && h.endDate !== h.date) ? (h.date + ' ~ ' + h.endDate) : h.date;
            return '<div style="display:flex; align-items:center; justify-content:space-between; padding:6px 4px; border-bottom:1px solid #f1f3f5; font-size:12px;">'
                + '<span><b style="color:#2c5f8a;">' + rangeLabel + '</b> &nbsp; ' + (h.name ? _hEsc(h.name) : '<span style="color:#adb5bd;">(사유 없음)</span>') + '</span>'
                + '<button onclick="window.removeCustomHoliday(' + idx + ')" onmouseover="this.style.background=\'#fbe4e2\';" onmouseout="this.style.background=\'none\';" style="border:none; background:none; color:#b1432f; cursor:pointer; font-size:13px; border-radius:4px; padding:2px 5px; transition:background .15s;">🗑️</button>'
                + '</div>';
        }).join('');
    };

    window.addCustomHoliday = async function() {
        const dateEl = document.getElementById('holiday-add-date');
        const endDateEl = document.getElementById('holiday-add-end-date');
        const nameEl = document.getElementById('holiday-add-name');
        const date = dateEl.value;
        let endDate = endDateEl.value;
        if (!date) { alert('시작일을 선택해주세요.'); return; }
        if (endDate && endDate < date) { alert('종료일이 시작일보다 빠릅니다.'); return; }
        if (!endDate) endDate = date;

        const list = window.getCustomHolidays();
        const dup = list.some(function(h) { return h.date === date && (h.endDate || h.date) === endDate; });
        if (dup) { alert('이미 등록된 기간입니다.'); return; }

        const entry = { date: date, name: (nameEl.value || '').trim() };
        if (endDate !== date) entry.endDate = endDate; // 하루짜리는 기존처럼 endDate 없이 저장 (호환성 유지)
        list.push(entry);
        window.saveCustomHolidays(list);
        dateEl.value = ''; endDateEl.value = ''; nameEl.value = '';
        window.renderCustomHolidayList();
        if (window.recalculateSchedules) window.recalculateSchedules(); // 💡 등록 즉시 일정에 반영

        // ✅ 팀 공용 드라이브 파일에도 반영
        if (window.isDriveConnected) {
            const ok = await window.saveHolidaysToDrive(list);
            if (!ok) alert('⚠️ 드라이브 저장에 실패했습니다. 다시 시도해주세요.');
        } else {
            alert('⚠️ 구글 드라이브 미연동 상태라 팀과 공유되지 않습니다.\n[파일 → 🔵 드라이브 연동하기] 후 다시 등록해주세요.');
        }
    };

    window.removeCustomHoliday = async function(idx) {
        const list = window.getCustomHolidays();
        list.splice(idx, 1);
        window.saveCustomHolidays(list);
        window.renderCustomHolidayList();
        if (window.recalculateSchedules) window.recalculateSchedules();

        if (window.isDriveConnected) {
            const ok = await window.saveHolidaysToDrive(list);
            if (!ok) alert('⚠️ 드라이브 저장에 실패했습니다. 다시 시도해주세요.');
        }
    };

    window.openHolidayManager = async function() {
        window.closeAllTopbarMenus();
        const _hEn = window._currentLang === 'en';
        let modal = document.getElementById('holiday-manager-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'holiday-manager-modal';
            modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:none; pointer-events:none; z-index:99999; align-items:center; justify-content:center;';
            modal.innerHTML =
                '<div id="holiday-modal-box" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-sm); max-width:92vw; max-height:82vh; display:flex; flex-direction:column; box-shadow:0 4px 24px rgba(0,0,0,0.25);">'
                + '<div id="holiday-drag-handle" style="padding:13px 18px; cursor:grab; background:#fff8e6; border-radius:10px 10px 0 0; border-bottom:1px solid #ffe08a; display:flex; justify-content:space-between; align-items:center;">'
                + '<span style="font-size:14px; font-weight:bold; color:#7a5210;">' + (_hEn ? '🗓️ Holiday Registration' : '🗓️ 휴일 등록 (추가 휴일)') + '</span>'
                + '<button onclick="document.getElementById(\'holiday-manager-modal\').style.display=\'none\'"'
                + ' style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;"'
                + ' onmouseover="this.style.background=\'var(--modal-icon-hover-bg)\'; this.style.borderColor=\'#adb5bd\';"'
                + ' onmouseout="this.style.background=\'var(--modal-icon-bg)\'; this.style.borderColor=\'var(--modal-icon-border)\';"'
                + ' title="닫기">✕</button>'
                + '</div>'
                + '<div id="holiday-sync-notice" style="padding:12px 18px; font-size:11px; color:#888; line-height:1.5; border-bottom:1px solid #f1f3f5;">'
                + (_hEn ? 'Public holidays through 2035 are already built in. Register additional days off here — company founding day, temporary holidays, etc.' : '기본 공휴일은 2035년까지 이미 반영되어 있습니다. 여기서는 회사 창립일, 임시공휴일처럼 추가로 쉬는 날을 등록합니다.')
                + '</div>'
                + '<div style="padding:12px 18px; border-bottom:1px solid #f1f3f5;">'
                + '<div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">'
                + '<input type="date" readonly onclick="window.showGenericCalendar(this)" id="holiday-add-date" style="flex:1; padding:6px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; cursor:pointer;">'
                + '<span style="color:#888; font-size:12px;">~</span>'
                + '<input type="date" readonly onclick="window.showGenericCalendar(this)" id="holiday-add-end-date" title="' + (_hEn ? 'End date for range (leave blank for single day)' : '기간으로 등록할 경우 종료일 (비워두면 하루만 등록)') + '" style="flex:1; padding:6px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; cursor:pointer;">'
                + '</div>'
                + '<div style="display:flex; gap:6px;">'
                + '<input type="text" id="holiday-add-name" placeholder="' + (_hEn ? 'Reason (e.g. Summer vacation)' : '사유 (예: 하계휴가)') + '" style="flex:1; min-width:0; padding:6px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px;">'
                + '<button onclick="window.addCustomHoliday()" onmouseover="this.style.background=\'#cfe6fa\'; this.style.borderColor=\'#7fb0dd\';" onmouseout="this.style.background=\'#e8f4fd\'; this.style.borderColor=\'#a5c8f0\';" style="padding:6px 12px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➕ ' + (_hEn ? 'Add' : '추가') + '</button>'
                + '</div>'
                + '</div>'
                + '<div id="holiday-list-container" style="flex:1; overflow-y:auto; padding:8px 18px;"></div>'
                + '<div style="padding:12px 18px; border-top:1px solid #dee2e6; display:flex; gap:8px; justify-content:space-between; align-items:center;">'
                + '<button onclick="window.loadHolidaysFromDrive()" onmouseover="this.style.background=\'#c9ecd3\'; this.style.borderColor=\'#7cc494\';" onmouseout="this.style.background=\'#e6f6ea\'; this.style.borderColor=\'#a8dab8\';" style="padding:6px 12px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🔄 ' + (_hEn ? 'Refresh' : '새로고침') + '</button>'
                + '<span style="font-size:11px; color:#868e96;" id="holiday-count-label"></span>'
                + '</div>'
                + '</div>';
            document.body.appendChild(modal);
            window._makeDraggable('holiday-modal-box', 'holiday-drag-handle');
        }
        modal.style.display = 'flex';

        const notice = document.getElementById('holiday-sync-notice');
        if (window.isDriveConnected) {
            if (notice) notice.textContent = _hEn ? '🔄 Loading shared team holiday list...' : '🔄 팀 공용 휴일 목록을 불러오는 중...';
            await window.loadHolidaysFromDrive();
            if (notice) notice.textContent = _hEn ? '☁️ This is the shared team holiday list (Drive). Changes sync with the whole team.' : '☁️ 팀 공용(드라이브) 휴일 목록입니다. 등록/삭제하면 전체 팀과 공유됩니다.';
        } else if (notice) {
            notice.textContent = _hEn ? '⚠️ Google Drive not connected. Changes will not be shared with the team.' : '⚠️ 구글 드라이브 미연동 상태입니다. [파일 → 🔵 드라이브 연동하기]를 먼저 눌러주세요. 지금 등록해도 팀과 공유되지 않습니다.';
        }
        window.renderCustomHolidayList();
    };

    // 💡 두 날짜 사이의 "근무일 기준 부호 있는 이동량" — toTs가 fromTs보다 늦으면 양수, 빠르면 음수
    //    (계획 대비 시작/완료/소요 배지를 전부 같은 근무일 기준으로 맞추기 위한 함수)
    function workdayShift(fromTs, toTs) {
        if (!fromTs || !toTs || fromTs === toTs) return 0;
        const oneDayLater = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); d.setDate(d.getDate() + 1); return d.getTime(); };
        if (toTs > fromTs) return countWorkingDays(oneDayLater(fromTs), toTs);
        return -countWorkingDays(oneDayLater(toTs), fromTs);
    }

    // 🔑 관리자 비밀번호 — localStorage에 JSON으로 저장, "파일 > 비밀번호 변경" 메뉴에서 변경 가능
    //    저장된 값이 없으면 기존 기본값 'kortek'을 그대로 사용 (기존 사용자와 100% 호환)
    const ADMIN_PW_STORAGE_KEY = 'gantt_admin_pw';
    function getAdminPassword() {
        try {
            const saved = JSON.parse(localStorage.getItem(ADMIN_PW_STORAGE_KEY) || 'null');
            return (saved && saved.pw) ? saved.pw : 'kortek';
        } catch(e) { return 'kortek'; }
    }
    function setAdminPassword(newPw) {
        try { localStorage.setItem(ADMIN_PW_STORAGE_KEY, JSON.stringify({ pw: newPw, updatedAt: Date.now() })); return true; }
        catch(e) { return false; }
    }
    function verifyAdminPassword(promptMessage) {
        let pw = prompt(promptMessage);
        if (!pw) return false;
        const target = getAdminPassword().toLowerCase();
        let maxTry = 5;
        for (let i = 0; i < maxTry; i++) {
            if (pw.toLowerCase() === target) return true;
            let remain = maxTry - i - 1;
            if (remain === 0) break;
            pw = prompt(window._currentLang === 'en' ? `❌ Incorrect password. (case-insensitive)\nAttempts remaining: ${remain}\n\nEnter password again.` : `❌ 비밀번호가 틀렸습니다. (대/소문자 구분 없음)\n남은 시도: ${remain}회\n\n비밀번호를 다시 입력하세요.`);
            if (!pw) break;
        }
        return false;
    }
    window.changeAdminPassword = async function() {
        const oldPw = getAdminPassword();
        const _cpEn = window._currentLang === 'en';
        if (!verifyAdminPassword(_cpEn ? '🔑 Enter current admin password to change it.\n(case-insensitive)' : '🔑 비밀번호를 변경하려면 현재 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
            alert(_cpEn ? '❌ Authentication failed. Change cancelled.' : '❌ 비밀번호 인증 실패. 변경이 취소되었습니다.');
            return;
        }
        let newPw = prompt(_cpEn ? '🔑 Enter new password.' : '🔑 새 비밀번호를 입력하세요.');
        if (!newPw || !newPw.trim()) return;
        const confirmPw = prompt(_cpEn ? '🔑 Enter new password again. (confirm)' : '🔑 새 비밀번호를 한 번 더 입력하세요. (확인)');
        if (newPw !== confirmPw) { alert(_cpEn ? '❌ Passwords do not match. Change cancelled.' : '❌ 입력한 두 비밀번호가 서로 다릅니다. 변경이 취소되었습니다.'); return; }
        newPw = newPw.trim();
        if (!setAdminPassword(newPw)) { alert(_cpEn ? '❌ Failed to save password.' : '❌ 비밀번호 저장에 실패했습니다.'); return; }
        window.showToast(_cpEn ? '✅ Password changed.' : '✅ 비밀번호가 변경되었습니다.');
        // Drive 연동 상태면 자동 재암호화 + 해시 동기화
        try {
            const tokenObj  = gapi.client.getToken();
            const driveToken = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!driveToken) return; // Drive 미연동 — 종료

            const folderId  = await window.getOrCreateBackupFolder(driveToken);
            const encFileId = await window._findDriveFile(driveToken, folderId, 'telegram_secure.enc');

            if (encFileId) {
                // ① 구 비밀번호로 복호화
                const encText = await window._downloadDriveFile(driveToken, encFileId);
                const decRes  = await fetch('http://127.0.0.1:5000/telegram/decrypt', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: oldPw, encrypted: encText })
                });
                const decData = await decRes.json();
                if (!decData.ok) throw new Error('복호화 실패: ' + decData.error);

                // ② 새 비밀번호로 재암호화
                const mData  = await (await fetch('http://127.0.0.1:5000/telegram/members')).json();
                const encRes = await fetch('http://127.0.0.1:5000/telegram/encrypt', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        password: newPw,
                        config: { token: decData.token || '', default_chat_id: decData.default_chat_id || '', members: mData.members || [] }
                    })
                });
                const encData = await encRes.json();
                if (!encData.ok) throw new Error('재암호화 실패: ' + encData.error);

                // ③ telegram_secure.enc Drive 재업로드
                await window._uploadDriveFile(driveToken, folderId, encFileId, 'telegram_secure.enc', encData.encrypted);
            }

            // ④ mail_secure.enc 재암호화 및 재업로드
            const mailFileId = await window._findDriveFile(driveToken, folderId, 'mail_secure.enc');
            if (mailFileId) {
                const mailEncText = await window._downloadDriveFile(driveToken, mailFileId);
                const mailDecRes  = await fetch('http://127.0.0.1:5000/mail/decrypt', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ password: oldPw, encrypted: mailEncText })
                });
                const mailDecData = await mailDecRes.json();
                if (mailDecData.ok) {
                    const mailReEncRes = await fetch('http://127.0.0.1:5000/mail/encrypt', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ password: newPw })
                    });
                    const mailReEncData = await mailReEncRes.json();
                    if (mailReEncData.ok) {
                        await window._uploadDriveFile(driveToken, folderId, mailFileId,
                            'mail_secure.enc', mailReEncData.encrypted);
                    }
                }
            }

            // ⑤ 새 비밀번호 해시 Drive 저장 (팀원 동기화용)
            const newHash    = await window._sha256hex(newPw);
            const hashFileId = await window._findDriveFile(driveToken, folderId, 'gantt_pw_sync.json');
            await window._uploadDriveFile(driveToken, folderId, hashFileId, 'gantt_pw_sync.json',
                JSON.stringify({ hash: newHash, updatedAt: new Date().toISOString() }));

            alert('☁️ SMTP + Telegram 전체 설정이 새 비밀번호로 자동 업데이트 완료!');
        } catch(e) {
            alert('⚠️ Drive 자동 업데이트 실패: ' + e.message + '\n수동으로 [Drive에 암호화 저장]을 눌러주세요.');
        }
    };

    // ════════════════════════════════════════════════════════════
    // 📌 일정 계산 규칙 (MS Project 방식: Auto ↔ Manual 자동 전환)
    //
    //  · 시작일/완료일 셀이 "비어 있으면" → 자동계산(Auto) 대상.
    //    앞 형제가 끝난 다음날부터, 또는 부모 시작일부터 워터폴로 계산됨.
    //    → 다른 행이 추가/삭제/정렬되면 날짜가 같이 움직일 수 있음.
    //
    //  · 시작일/완료일 셀에 "날짜가 직접 입력되어 있으면" → 확정(Manual) 상태.
    //    이후 어떤 변경이 생겨도 이 날짜는 절대 자동으로 바뀌지 않음.
    //
    //  · 날짜를 지우면 → 다시 Auto로 전환되어 자동계산을 따라감.
    //  · 날짜를 입력하면 → 그 즉시 Manual로 고정됨.
    //
    //  즉 "날짜를 삭제하면 자동계산되고, 날짜가 채워져 있으면(고정되면)
    //  다른 행이 바뀌어도 자동계산되지 않는다."
    // ════════════════════════════════════════════════════════════
    window.recalculateSchedules = function() {
        if (globalData.length <= 1) return;

        setTimeout(() => {
            let curD0 = "", curT1 = "", curT2 = "", curT3 = "", curT4 = "";
            for (let i = 1; i < globalData.length; i++) {
                let row = globalData[i]; if (!row) continue;
                let text = "";
                if (row._level === 0) text = row._origDev; else if (row._level === 1) text = row._origT1; else if (row._level === 2) text = row._origT2; else if (row._level === 3) text = row._origT3; else if (row._level === 4) text = row._origT4;
                text = text || "";

                if (row._level === 0) { curD0 = text; curT1 = ""; curT2 = ""; curT3 = ""; curT4 = ""; }
                else if (row._level === 1) { curT1 = text; curT2 = ""; curT3 = ""; curT4 = ""; }
                else if (row._level === 2) { curT2 = text; curT3 = ""; curT4 = ""; }
                else if (row._level === 3) { curT3 = text; curT4 = ""; }
                else if (row._level === 4) { curT4 = text; }
                
                row._l0Group = curD0; // 💡 계획(Baseline) 키 충돌 방지용
                row._origDev = curD0; if (colIdx.devStage !== -1) row[colIdx.devStage] = curD0;
                row._origT1 = curT1; if (colIdx.taskType1 !== -1) row[colIdx.taskType1] = curT1;
                row._origT2 = curT2; if (colIdx.taskType2 !== -1) row[colIdx.taskType2] = curT2;
                row._origT3 = curT3; if (colIdx.taskType3 !== -1) row[colIdx.taskType3] = curT3;
                row._origT4 = curT4; if (colIdx.taskType4 !== -1) row[colIdx.taskType4] = curT4;
                if (colIdx.wbs !== -1 && colIdx.devStage === -1) row[colIdx.wbs] = curD0; // 💡 단일 WBS 열 모드: 0레벨 그룹명을 하위 행까지 다시 채워서 개발단계 필터가 최신 상태로 갱신되게 함
                if (colIdx.bogo !== -1) row[colIdx.bogo] = row._level; 
            }

            generateFilters(globalData);

            let validRows = globalData.slice(1);
            let tree = []; let stack = {}; let fileGlobalStartTs = null;

            for (let row of validRows) {
                let rawStart = colIdx.start !== -1 ? row[colIdx.start] : ""; let pDateStart = parseDateValue(rawStart); let parsedStartTs = pDateStart ? pDateStart.ts : null;
                let rawPlan = colIdx.plan !== -1 ? row[colIdx.plan] : ""; let pDatePlan = parseDateValue(rawPlan); let parsedPlanTs = pDatePlan ? pDatePlan.ts : null;
                let dur1 = colIdx.dur1 !== -1 ? getDurationDays(row[colIdx.dur1]) : null; let dur2 = colIdx.dur2 !== -1 ? getDurationDays(row[colIdx.dur2]) : null; let dur3 = colIdx.dur3 !== -1 ? getDurationDays(row[colIdx.dur3]) : null; let dur4 = colIdx.dur4 !== -1 ? getDurationDays(row[colIdx.dur4]) : null; let pDur = colIdx.period !== -1 ? getDurationDays(row[colIdx.period]) : null;
                let planStr = rawPlan !== null && rawPlan !== undefined ? rawPlan.toString().trim() : ""; let match = planStr.match(/^(\d+)(일|days)?$/i); 
                let finalDur = 0; let hasDuration = (dur1 !== null || dur2 !== null || dur3 !== null || dur4 !== null || pDur !== null || match);
                
                if (row._level === 1 && dur1 !== null) finalDur = dur1; else if (row._level === 2 && dur2 !== null) finalDur = dur2; else if (row._level === 3 && dur3 !== null) finalDur = dur3; else if (row._level === 4 && dur4 !== null) finalDur = dur4; else if (pDur !== null) finalDur = pDur; else if (match && parseInt(match[1], 10) < 10000) finalDur = parseInt(match[1], 10);
                
                row._finalDuration = finalDur;
                row._isExplicitZero = (finalDur === 0 && (dur1 === 0 || dur2 === 0 || dur3 === 0 || dur4 === 0 || pDur === 0 || (match && parseInt(match[1], 10) === 0)));

                if (row._level === 0 || row._startForced || !hasDuration) row._explicitStartTs = parsedStartTs; else row._explicitStartTs = null;
                if (row._level === 0 || row._planForced || !hasDuration) row._explicitPlanTs = parsedPlanTs; else row._explicitPlanTs = null;
                                
                if (row._explicitStartTs) {
                    if (fileGlobalStartTs === null || row._explicitStartTs < fileGlobalStartTs) {
                        fileGlobalStartTs = row._explicitStartTs;
                    }
                }

                let taskName = "";
                if (row._level === 0) taskName = row._origDev || ""; else if (row._level === 1) taskName = row._origT1 || ""; else if (row._level === 2) taskName = row._origT2 || ""; else if (row._level === 3) taskName = row._origT3 || ""; else if (row._level === 4) taskName = row._origT4 || "";
                
                let contentStr = colIdx.content !== -1 ? (row[colIdx.content] || "").toString() : "";
                row._isParallel = taskName.includes('*') || taskName.includes('＊') || contentStr.includes('*') || contentStr.includes('＊');

                let node = { row: row, level: row._level, isParallel: row._isParallel, explicitStartTs: row._explicitStartTs, explicitPlanTs: row._explicitPlanTs, duration: row._finalDuration, children: [], startTs: null, endTs: null };

                if (node.level === 0) { tree.push(node); stack[0] = node; stack[1] = null; stack[2] = null; stack[3] = null; stack[4] = null; } 
                else {
                    let parentLvl = node.level - 1; while (parentLvl >= 0 && !stack[parentLvl]) parentLvl--;
                    if (parentLvl >= 0 && stack[parentLvl]) stack[parentLvl].children.push(node); else tree.push(node); 
                    stack[node.level] = node; for (let l = node.level + 1; l <= 4; l++) stack[l] = null; 
                }
            }

            function markLastChild(node) {
                if (!node.children || node.children.length === 0) return;
                for (let i = 0; i < node.children.length; i++) { node.children[i].row._isLastChild = (i === node.children.length - 1); markLastChild(node.children[i]); }
            }
            for (let l0Node of tree) markLastChild(l0Node);

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
                    } else if (dur > 0) {
                        node.endTs = addWorkingDays(node.startTs, dur - 1);
                    } else { node.endTs = node.startTs; }
                    return;
                }
                
                let currentWaterfallStart = node.startTs; 
                let maxChildEnd = node.startTs; 
                let groupStartTs = node.startTs; 
                let isFirstValid = true;

                for (let i = 0; i < node.children.length; i++) {
                    let child = node.children[i];
                    if (child.row._isExplicitZero) { scheduleNode(child, currentWaterfallStart); continue; }
                    
                    let intendedStart;
                    if (isFirstValid) intendedStart = node.startTs;
                    else if (child.isParallel) intendedStart = groupStartTs;
                    else intendedStart = currentWaterfallStart;
                    
                    scheduleNode(child, intendedStart);
                    
                    if (isFirstValid) {
                        groupStartTs = child.startTs;
                        isFirstValid = false;
                    } else if (!child.isParallel) {
                        groupStartTs = child.startTs;
                    }
                    
                    if (child.endTs > maxChildEnd) maxChildEnd = child.endTs;
                    currentWaterfallStart = addWorkingDays(maxChildEnd, 1);
                }
                node.endTs = maxChildEnd;
            }

            let currentL0Start = fileGlobalStartTs || new Date().setHours(0,0,0,0); 
            let maxL0End = currentL0Start; 
            let groupL0StartTs = currentL0Start; 
            let isFirstValidL0 = true;

            for (let i = 0; i < tree.length; i++) {
                let l0Node = tree[i];
                if (l0Node.row._isExplicitZero) { scheduleNode(l0Node, currentL0Start); continue; }
                
                let intendedStart;
                if (isFirstValidL0) intendedStart = currentL0Start;
                else if (l0Node.isParallel) intendedStart = groupL0StartTs;
                else intendedStart = currentL0Start;
                
                scheduleNode(l0Node, intendedStart);
                
                if (isFirstValidL0) {
                    groupL0StartTs = l0Node.startTs;
                    isFirstValidL0 = false;
                } else if (!l0Node.isParallel) {
                    groupL0StartTs = l0Node.startTs;
                }
                
                if (l0Node.endTs > maxL0End) maxL0End = l0Node.endTs;
                currentL0Start = addWorkingDays(maxL0End, 1);
            }

            let _newlyFrozenCount = 0;
            function applyDatesToRow(node) {
                node.row._calcStartTs = node.startTs;
                node.row._calcPlanTs = node.endTs;

                // 🔒 [일정 고정] 리프(자식 없는) 행이 날짜를 새로 계산받으면 그 즉시 셀에 값을 써넣고
                //     Forced로 전환해 굳힙니다. 이후 새 업무가 들어오거나 다른 행이 움직여도
                //     이 행은 재계산에서 제외되며, "선택 구간 재계산"으로 명시적으로 풀었을 때만 다시 계산됩니다.
                //     부모/중간 레벨(자식이 있는 행)은 자식의 변화를 계속 반영해야 하므로 굳히지 않습니다.
                if (node.children.length === 0 && !node.row._isExplicitZero && !node.row._scheduleModeManual) {
                    const wasFrozen = node.row._startForced || node.row._planForced;
                    if (!wasFrozen) {
                        if (colIdx.start !== -1 && node.startTs) node.row[colIdx.start] = formatTsToYMD(node.startTs);
                        if (colIdx.plan  !== -1 && node.endTs)   node.row[colIdx.plan]  = formatTsToYMD(node.endTs);
                        node.row._startForced = true;
                        node.row._planForced  = true;
                        _newlyFrozenCount++;
                    }
                }

                for (let child of node.children) applyDatesToRow(child);
            }
            for (let l0Node of tree) applyDatesToRow(l0Node);

            // 🔒 여러 건이 한 번에 새로 고정된 경우(최초 로드/대량 가져오기 등) 요약 로그 1건만 남김.
            //    새 업무 1건이 추가되며 조용히 고정되는 일상적인 경우는 로그를 남기지 않음(노이즈 방지).
            //    "선택 구간 재계산"이 자체적으로 상세 로그를 남기는 동안에는 window._suppressFreezeLog로 중복 억제.
            if (_newlyFrozenCount >= 2 && !window._suppressFreezeLog) {
                window.changeLogs.push({
                    time: new Date().toLocaleString('ko-KR'),
                    userName: window.currentUserName || '비로그인 (로컬)',
                    rowName: '-', colName: '일정 고정',
                    oldVal: '자동 계산 상태', newVal: `일정 자동 고정: ${_newlyFrozenCount}건`, reason: ''
                });
            }

            // 💡 축 범위(현재 일정 + 비교 계획 포함) 재계산 — window.recomputeGanttViewRange()로 분리됨
            window.recomputeGanttViewRange();

            renderTable(globalData); applyFilters();
            window.pushUndoSnapshot();
            
            window.showToast(window._currentLang === 'en' ? "✅ Schedule updated." : "✅ 일정이 업데이트 되었습니다.");

            if (typeof window.syncRowHighlight === 'function') {
                window.syncRowHighlight();
            }

            // 💡 [2026-08-24 버그 수정] Summary "개발 진척 현황" 타임라인은 예전엔 Summary 탭에 "들어올
            //    때"만 다시 그려져서, 이미 Summary 탭을 보고 있는 중에 다른 경로(메일 완전자동 배치,
            //    셀 편집, 선택 구간 재계산 등)로 일정이 바뀌면 화면이 갱신 안 된 채로 남아있었다 —
            //    Alarm/Calendar 탭이 시트 전환 시 이미 하던 "지금 보이는 탭이면 즉시 다시 그림" 패턴을
            //    여기(모든 일정 변경이 결국 거쳐가는 recalculateSchedules)에도 적용해 실시간으로 맞춘다.
            const tabSummaryEl = document.getElementById('tab-summary');
            if (tabSummaryEl && tabSummaryEl.classList.contains('active') && window.renderSummaryTimeline) {
                window.renderSummaryTimeline();
            }
        }, 10);
    };

// ─── 🔓 선택 구간 일정 재계산 (Ctrl/Shift로 선택한 행만 잠금 해제 후 다시 계산) ───
    window.recalcSelectedRange = function() {
        const sel = window._selectedRows;
        if (!sel || sel.size === 0) { alert('먼저 재계산할 행을 선택해주세요. (Ctrl/Shift로 여러 행 선택 가능)'); return; }
        const indices = Array.from(sel).sort(function(a,b){ return a-b; });

        // 💡 실행취소(Ctrl+Z)로 복구 가능해서 확인창 없이 바로 진행

        const reason = window.promptOptionalReason('선택 구간 일정 재계산');
        if (reason === null) return; // 취소

        // 재계산 전 스냅샷 (변경 여부 판정용)
        const before = {};
        indices.forEach(function(i) {
            const row = globalData[i]; if (!row) return;
            before[i] = {
                start: row._calcStartTs, plan: row._calcPlanTs,
                startStr: colIdx.start !== -1 ? (row[colIdx.start] || '') : '',
                planStr:  colIdx.plan  !== -1 ? (row[colIdx.plan]  || '') : ''
            };
        });

        // 선택 행만 잠금 해제 후 재계산
        indices.forEach(function(i) {
            const row = globalData[i]; if (!row) return;
            row._startForced = false; row._planForced = false;
            if (colIdx.start !== -1) row[colIdx.start] = "";
            if (colIdx.plan  !== -1) row[colIdx.plan]  = "";
        });

        // 이 액션 전체(재계산+정렬)를 하나의 Undo 단위로 묶기 위해, 중간 자동 스냅샷을 잠시 억제
        window._isRestoringUndo = true;
        window._suppressFreezeLog = true; // 아래에서 상세 로그를 남기므로 일괄 요약 로그는 생략
        window.recalculateSchedules();
        window._suppressFreezeLog = false;

        // 실제로 날짜가 바뀐 행만 로그
        let changedCount = 0;
        indices.forEach(function(i) {
            const row = globalData[i]; const b = before[i];
            if (!row || !b) return;
            if (b.start !== row._calcStartTs || b.plan !== row._calcPlanTs) {
                changedCount++;
                const oldTxt = `시작 ${b.startStr || (b.start ? formatTsToYMD(b.start) : '-')} · 완료 ${b.planStr || (b.plan ? formatTsToYMD(b.plan) : '-')}`;
                const newTxt = `시작 ${colIdx.start !== -1 ? (row[colIdx.start] || '-') : '-'} · 완료 ${colIdx.plan !== -1 ? (row[colIdx.plan] || '-') : '-'}`;
                window.changeLogs.push({
                    time: new Date().toLocaleString('ko-KR'),
                    userName: window.currentUserName || '비로그인 (로컬)',
                    rowName: i, colName: '일정 재계산',
                    oldVal: oldTxt, newVal: newTxt, reason: reason
                });
            }
        });

        // 🔀 영향받은 구간(최소~최대 선택 인덱스)만 시작일 기준으로 행 순서 정리 (구간 밖은 그대로 유지)
        const fromIdx = indices[0], toIdx = indices[indices.length - 1];
        window._sortSubRangeByStartDate(fromIdx, toIdx);
        window.recalculateSchedules();

        window._isRestoringUndo = false;
        window.pushUndoSnapshot(); // 재계산+정렬 전체를 하나의 Undo 단위로 기록

        window._selectedRows = new Set();
        if (typeof window.syncRowHighlight === 'function') window.syncRowHighlight();
        alert(changedCount > 0 ? `✅ ${changedCount}건의 일정이 재계산되고, 구간 내 행 순서도 정리되었습니다.\n(사유: ${reason})` : 'ℹ️ 선택한 구간의 일정에 변경이 없어 순서만 정리되었습니다.');
    };

