// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 2441~3650행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 탭 · 서머리 · M.C테이블 렌더링 2/4
window.collectAlarmItems = function() {
    // 최신 Summary 입력값을 projectMeta에 반영
    if (window.collectTabData) window.collectTabData();

    const items  = [];
    const pm     = window.projectMeta || {};
    const ci     = window.colIdx || {};
    const gdata  = window.globalData || [];
    const today  = new Date(); today.setHours(0,0,0,0);

    // 💡 담당자명 → 이메일 매핑은 주소록(Address Book) 기준으로 통일 — 한글 이름 없으면 영문 이름으로 폴백
    //    (Summary 탭 담당자 이메일 텍스트필드는 더 이상 참조하지 않음 — 이름은 여전히 Summary/업무 내용에서 옴)
    const lookupEmail = function(name) {
        if (!name) return '';
        const trimmed = name.trim();
        // 이름 자리에 이미 이메일 주소가 들어있으면 주소록 조회 없이 그대로 사용
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed;
        const found = window._addrFindByName(trimmed);
        return found ? (found.email || '') : '';
    };

    // 💡 [2026-08-31] 수신 대상(CC)은 업무마다 다를 수 있음 — 기본수신(전역 공용 명단, 대부분의
    //    업무가 여기 해당)이거나 개별수신(그 업무의 row._알림수신자)이거나. 행마다 아래서 계산.
    const defaultCcList = (window.loadAlarmSettings ? window.loadAlarmSettings() : {}).ccList || [];

    document.querySelectorAll('#table-body tr').forEach(function(tr) {
        // dataset.rowIndex → globalData 인덱스 (1-based, 0번은 헤더)
        const rowIdx = parseInt(tr.dataset.rowIndex);
        if (isNaN(rowIdx) || rowIdx < 1) return;
        const row = gdata[rowIdx];
        if (!row) return;

        // _알림 또는 알림메일 시트 로드 데이터 체크
        // _알림(토글) 또는 알림메일 시트 복합키 매칭
        if (!row._알림) return;

        // 완료 예정일 (plan 컬럼 = YYYY-MM-DD)
        // 💡 자동(🔓) 모드 행은 plan 셀이 비어있고 _calcPlanTs(계산값)만 갖고 있으므로 폴백 처리
        let dueRaw = String(row[ci.plan] || '').trim();
        if ((!dueRaw || dueRaw === '-') && row._calcPlanTs) {
            dueRaw = formatTsToYMD(row._calcPlanTs);
        }
        if (!dueRaw || dueRaw === '-') return;
        const dueDate = new Date(dueRaw);
        if (isNaN(dueDate)) return;
        dueDate.setHours(0,0,0,0);
        const diffDays = Math.round((dueDate - today) / 86400000);
        const dueStr   = `${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}-${String(dueDate.getDate()).padStart(2,'0')}`;

        // 업무명 (WBS 컬럼)
        // 💡 [2026-08-29 버그 수정] 예전엔 화면 테이블의 "6번째 <td>"라는 위치 가정만으로 textContent를
        //    그대로 긁어왔는데, 그 셀 안에 다른 요소(예: 숨은 텍스트·아이콘)가 같이 들어있으면 상세내용
        //    등 엉뚱한 텍스트가 업무명에 섞여 들어오는 문제가 있었다. colIdx.wbs(헤더 "개발업무(WBS)"로
        //    찾은 실제 데이터 컬럼)에서 직접 읽도록 바꾸고, 혹시 못 찾을 때만 예전 방식으로 폴백한다.
        // 💡 [2026-08-29 재수정] row._origDev는 "레벨0(개발단계) 행의 이름"일 뿐인데 무조건 row[ci.wbs]보다
        //    먼저 확인해버려서, 실제 업무(레벨0이 아닌 핀셋 걸린 행)까지 개발단계명("PROTO A" 등)으로
        //    표시되는 사고가 났다. 다른 곳들(_origDev 참고하는 모든 코드)과 동일하게 row._level===0일
        //    때만 _origDev를 쓰고, 그 외엔 항상 row[ci.wbs](실제 WBS 업무명)를 먼저 쓰도록 순서를 바로잡음.
        // 🐛 [버그 수정] ci.wbs(단일 "개발업무(WBS)" 열 모드)만 확인하고, 레벨별로 나뉜 열(개발단계/1~4차
        // 업무) 모드는 전혀 안 봐서 — 레벨0이 아닌 실제(본인에게 할당된) 업무는 항상 비어 매칭 실패 →
        // 아래 td[5] 폴백으로 넘어가면서 결국 레벨0(예: "PROTO B*") 이름이 잡히고 있었다. Gantt 렌더
        // 코드(window.renderTable 안 wbsColIdx 계산)와 동일한 레벨별 열 결정 로직을 그대로 재사용.
        // 🐛 [2026-08-30 재수정] 위 수정 이후에도 "단일 WBS 열" 모드 프로젝트에서는 여전히 0레벨 이름이
        // 잡히는 문제가 남아있었다 — 원인은 이 함수가 아니라 window.recalculateSchedules()에 있었음:
        // 그 함수가 "개발단계 필터"를 최신 상태로 유지하려고 단일 WBS 열 모드에서 row[colIdx.wbs] 전체를
        // 매번 "가장 가까운 0레벨 조상의 이름"으로 덮어써서(레벨 무관하게), 행 자신의 실제 텍스트가
        // 그 칸에서 사라지고 있었다(칸이 "표시용 텍스트"와 "필터 그룹 키"라는 두 역할을 동시에 하다가
        // 후자가 전자를 지워버린 셈). 반면 row._origDev/_origT1~4는 이 파일 다른 모든 곳(코드 13885,
        // 14930 등)에서 이미 "그 행 자신의, 자기 레벨 텍스트"로 정확히 유지되고 있으므로, 컬럼값보다
        // _orig*를 먼저 신뢰하도록 순서를 바꾼다(컬럼값은 _orig*가 비어있는 극히 드문 경우의 폴백으로만 사용).
        const origByLevel = row._level === 0 ? row._origDev : (row._level === 1 ? row._origT1 : (row._level === 2 ? row._origT2 : (row._level === 3 ? row._origT3 : row._origT4)));
        let wbsColIdx = (row._level === 0) ? ci.devStage : (row._level === 1 ? ci.taskType1 : (row._level === 2 ? ci.taskType2 : (row._level === 3 ? ci.taskType3 : ci.taskType4)));
        if ((wbsColIdx === undefined || wbsColIdx === -1) && ci.wbs !== -1) wbsColIdx = ci.wbs;
        let taskName = (origByLevel || '') || (wbsColIdx !== undefined && wbsColIdx > -1 ? row[wbsColIdx] : '') || '';
        taskName = taskName.toString().trim();
        if (!taskName) {
            const taskTd = tr.querySelectorAll('td')[5];
            taskName = taskTd ? taskTd.textContent.trim() : '';
        }
        taskName = taskName.replace(/^🌐\s*/, '') || '-';

        // 업무 내용
        const contentRaw = String(row[ci.content] || '').trim();

        // [발신인→수신인] 패턴 추출
        // 💡 [2026-08-24 버그 수정] 수신인 쪽에 "[개발] 박성준, 김진석, 박용훈"처럼 부서 태그가 앞에
        //    붙는 경우, 기존 [^\]]+(닫는 대괄호 나오면 무조건 멈춤)로는 바깥쪽 ]가 아니라 "[개발]"의
        //    안쪽 ]에서 먼저 멈춰버려 이름을 하나도 못 뽑고 "[개발"만 미등록으로 남았다.
        //    (?:\[[^\]]*\]|[^\]])+ 로 중첩 대괄호 한 겹까지는 통째로 건너뛰도록 허용해 바깥쪽 ]까지 정상 포착.
        const arrowMatch  = contentRaw.match(/\[([^\]→]+)→((?:\[[^\]]*\]|[^\]])+)\]/);
        // 💡 위에서 포착된 발신/수신 문자열 앞에 "[개발]"처럼 남아있는 부서 태그는 사람 이름이 아니므로
        //    이름 분리(_addrSplitNames) 전에 떼어낸다. (trim을 먼저 해야 앞의 공백 때문에 ^\[ 매칭이
        //    실패하는 일이 없음 — arrowMatch[2]는 보통 " [개발] ..."처럼 공백으로 시작함)
        const stripTag = function(s) { return String(s || '').trim().replace(/^\[[^\]]*\]\s*/, ''); };
        const senderRaw   = arrowMatch ? stripTag(arrowMatch[1]).trim() : String(row[ci.assignee] || '-').trim();
        const receiverRaw = arrowMatch ? stripTag(arrowMatch[2]).trim() : '';
        // 발신인/수신인 다중 지원 — "정민희/임희철", "박용훈 외 다수" 같은 패턴도 개별 이름으로 분리(위 _addrSplitNames 참고)
        const senderNames   = window._addrSplitNames(senderRaw);
        const receiverNames = window._addrSplitNames(receiverRaw);
        // 발신인 + 수신인 전원
        const allPeople  = [...new Set([...senderNames, ...receiverNames].filter(Boolean))];
        const toEmails   = [...new Set(allPeople.map(n => lookupEmail(n)).filter(Boolean))];
        const missingPeople = allPeople.filter(n => !lookupEmail(n));

        const assignee       = senderNames.join(', ') || '-';
        const assigneeEmail  = [...new Set(senderNames.map(n => lookupEmail(n)).filter(Boolean))].join(',');
        const receiverStr    = receiverNames.join(', ') || '-';
        // 수신인 이메일만 (표시용) — 화면 표시는 도메인 차단과 무관하게 실제 등록된 이메일을 그대로 보여줌
        const receiverEmails = [...new Set(receiverNames.map(n => lookupEmail(n)).filter(Boolean))];
        const receiverEmail  = receiverEmails.join(',');
        // 🌐 외부 도메인 발송 게이트 — @kortek.co.kr 이외 도메인은 알람 설정에서 허용 체크한 도메인만 실제 발송 대상
        const blockedByDomain = [...new Set([assigneeEmail, ...receiverEmails].filter(e => e && !window._isAlarmDomainAllowed(e)))];
        // 실제 발송 = 발신인 + 수신인 전원 중 발송 허용된 이메일만
        const toEmail        = [...new Set([assigneeEmail, ...receiverEmails].filter(e => e && window._isAlarmDomainAllowed(e)))].join(',');
        // 텔레그램 발송 대상 — 이메일이 등록돼 있는데 도메인이 차단 상태면 제외, 이메일 미등록이면 판단 불가로 허용
        const allowedPeople  = allPeople.filter(function(n) {
            const em = lookupEmail(n);
            return !em || window._isAlarmDomainAllowed(em);
        });

        // 💡 이 업무만 별도로 설정한 알람 일정이 있으면 그걸 쓰고, 없으면 기본값(ALARM_DAYS) 사용
        const alarmDays = (row._알림일정 && row._알림일정.length) ? row._알림일정.slice() : ALARM_DAYS.slice();

        // 이 업무의 수신 대상(기본수신 전역 공용 명단 / 개별수신 이 업무만의 명단)
        const ccSource     = (row._알림수신자모드 === 'custom') ? (row._알림수신자 || []) : defaultCcList;
        const ccRecipients = ccSource.map(window._normalizeRecipRow);
        const ccMails      = ccRecipients.filter(r => r.email && r.emailOn && window._isAlarmDomainAllowed(r.email)).map(r => r.email).join(',');

        // 발송 이력
        // 💡 [멀티탭 대비] rowId에 프로젝트 식별자가 없으면, 서로 다른 프로젝트의 같은 행번호+마감일이
        //    우연히 겹칠 때 localStorage 발송기록이 프로젝트 간에 충돌해서 한쪽이 조용히 스킵될 수 있음
        //    (여러 프로젝트를 각자 탭에 열어두고 동시에 알람을 돌리는 구성에서 특히 위험)
        const projKey = window.currentDriveFileId || window.currentDriveFileName || 'local';
        const rowId   = projKey + '_' + rowIdx + '_' + dueStr;
        const sentLog = {};
        alarmDays.forEach(d => {
            const v = localStorage.getItem('gantt_alarm_' + rowId + '_' + d + 'd');
            if (v) sentLog[d] = v;
        });
        const bulkV   = localStorage.getItem('gantt_alarm_' + rowId + '_bulk');
        if (bulkV)   sentLog['bulk']   = bulkV;
        const manualV = localStorage.getItem('gantt_alarm_' + rowId + '_manual');
        if (manualV) sentLog['manual'] = manualV;
        // 사용자가 "발송 상태" 클릭으로 토글해서 임시로 미발송 취급 중인지 여부 (이력은 보존됨)
        const sentHidden = !!localStorage.getItem('gantt_alarm_' + rowId + '_hidden');

        const statusVal = ci.status >= 0 ? String(row[ci.status] || '').trim() : '';
        // 💡 [2026-09-01 신규] 알람 일정 모달의 "업무 정보" 편집칸에서 이 알람만을 위해 제목/내용을
        //    덮어썼으면(row._알림제목오버라이드/_알림내용오버라이드) 발신인/수신인 추출 등 나머지 계산은
        //    전부 원본 contentRaw 기준 그대로 두고, 실제로 메일에 표시/발송되는 taskName/content만 덮어쓴다.
        items.push({
            rowId, rowIdx, taskName: row._알림제목오버라이드 || taskName,
            status: statusVal,
            assignee, assigneeEmail,
            receiverStr, receiverEmail,
            missingPeople, blockedByDomain,
            toEmail, allPeople, allowedPeople,
            ccMails, ccRecipients, dueStr, dueDate, diffDays, alarmDays,
            content: row._알림내용오버라이드 || contentRaw, sentLog, sentHidden, tr,
            mailRaw: row._mailRaw || null // 💡 메일분석으로 자동등록된 업무면 원문 메일(제목/발신/날짜/본문) 보관
        });
    });
    return items;
};

// 💡 [2026-08-30 신규] 알람 목록 행 클릭/더블클릭 구분 — 한 클릭이면 기존처럼 상세 모달을 열고,
// 두 번 빠르게 클릭(더블클릭)하면 모달을 열지 않고 바로 Gantt chart의 해당 업무 행으로 이동한다.
// 그냥 onclick+ondblclick을 같이 달면 더블클릭 시 click이 먼저 2번 발생해 모달이 열렸다 닫히는 등
// 지저분해지므로, 클릭을 살짝(250ms) 지연시켜 그 사이 두 번째 클릭(dblclick)이 오면 취소하는 방식.
window._alarmRowClickTimer = null;
window._alarmRowClick = function(idx) {
    if (window._alarmRowClickTimer) { clearTimeout(window._alarmRowClickTimer); window._alarmRowClickTimer = null; return; }
    window._alarmRowClickTimer = setTimeout(function() {
        window._alarmRowClickTimer = null;
        window.openAlarmModal(idx);
    }, 250);
};
window._alarmRowDblClick = function(idx, rowIdx) {
    if (window._alarmRowClickTimer) { clearTimeout(window._alarmRowClickTimer); window._alarmRowClickTimer = null; }
    if (window._aiJumpToRow) window._aiJumpToRow(rowIdx);
};

// 알람 탭 렌더링
window.renderAlarmTab = async function() {
    const tbody = document.getElementById('alarm-table-body');
    if (!tbody) return;

    // 서버 상태 확인
    const statusEl = document.getElementById('alarm-server-status');
    const _isEn = window._currentLang === 'en';
    try {
        const r = await fetch('http://127.0.0.1:5000/health', { signal: AbortSignal.timeout(2000) });
        const d = await r.json();
        if (statusEl) statusEl.innerHTML = _isEn
            ? '<span style="color:#00707d;">● Mail server connected</span>'
            : '<span style="color:#00707d;">● 메일 서버 연결됨</span>';
    } catch(e) {
        if (statusEl) statusEl.innerHTML = _isEn
            ? '<span style="color:#00707d;">● Mail server not connected — Please run kortek_backend.bat</span>'
            : '<span style="color:#00707d;">● 메일 서버 미연결 — kortek_backend.bat을 실행하세요</span>';
    }

    const items = window.collectAlarmItems();
    if (!items.length) {
        tbody.innerHTML = _isEn
            ? '<tr><td colspan="11" style="text-align:center; padding:40px; color:#aaa;">📌 No Gantt items with alarm configured.</td></tr>'
            : '<tr><td colspan="11" style="text-align:center; padding:40px; color:#aaa;">📌 알람이 설정된 Gantt 항목이 없습니다.</td></tr>';
        return;
    }

    window.dDayLabel = (d) => {
        if (d === 0)  return '<span style="color:#e03131; font-weight:bold;">D-Day</span>';
        if (d < 0)    return '<span style="color:#888;">D+' + Math.abs(d) + '</span>';
        if (d <= 3)   return '<span style="color:#e03131; font-weight:bold;">D-' + d + '</span>';
        if (d <= 7)   return '<span style="color:#e67e22; font-weight:bold;">D-' + d + '</span>';
        return 'D-' + d;
    };
    // 💡 이메일 제목/본문처럼 HTML 태그 없이 순수 텍스트로 D+/D-를 표시할 때 씀
    window.dDayPlain = (d) => (d === 0) ? 'D-Day' : (d < 0 ? 'D+' + Math.abs(d) : 'D-' + d);
    const dDayLabel = window.dDayLabel, dDayPlain = window.dDayPlain;

    const sentStatus = (sentLog, diffDays, sentHidden, idx) => {
        const keys = Object.keys(sentLog);
        if (!keys.length) {
            if (diffDays <= 7 && diffDays >= 0) return '<span style="color:#e03131;">⚠ 미발송</span>';
            return '<span style="color:#aaa;">-</span>';
        }
        const toggleIcon = `<span onclick="event.stopPropagation(); window.toggleAlarmSent(${idx});" title="클릭하면 발송/미발송 상태가 토글됩니다 (이력은 삭제되지 않음, 상세보기는 칸의 다른 부분을 클릭하세요)" style="cursor:pointer; margin-left:5px; color:#999; font-size:11px;">🔄</span>`;
        if (sentHidden) {
            return '<span style="color:#e67e22;">◻ 미발송 처리됨</span>' + toggleIcon;
        }
        const dayKeys = keys.filter(k => !isNaN(Number(k))).map(Number).sort((a,b) => a-b);
        const parts = dayKeys.map(d => '<span style="color:#27ae60; font-size:11px;">✓ D-' + d + '전</span>');
        if (keys.includes('bulk') || keys.includes('manual')) {
            parts.push('<span style="color:#27ae60; font-size:11px;">✓ 기 발송됨</span>');
        }
        return parts.join('<br>') + toggleIcon;
    };

    const lastSent = (sentLog) => {
        const times = Object.values(sentLog);
        if (!times.length) return '-';
        return times.sort().reverse()[0].substring(0, 16).replace('T', ' ');
    };

    const emailCell = (email, missing) => {
        if (email) return `<span style="font-size:11px;">${email}</span>`;
        if (missing && missing.length) return `<span style="color:#e03131; font-size:11px;">미등록: ${missing.join(', ')}</span>`;
        return `<span style="color:#e03131; font-size:11px;">미입력</span>`;
    };

    // 이름 목록 → "첫번째 외 N명" + tooltip
    const nameCell = (nameStr) => {
        if (!nameStr || nameStr === '-') return '-';
        const names = nameStr.split(/[,，]/).map(n => n.trim()).filter(Boolean);
        if (names.length <= 1) return `<span style="white-space:nowrap;">${names[0] || '-'}</span>`;
        return `<span title="${names.join('\n')}" style="cursor:help; border-bottom:1px dashed #aaa; white-space:nowrap;">${names[0]} 외 ${names.length-1}명</span>`;
    };
    // 🌐 도메인 차단으로 인해 실제 발송에서 제외된 이메일이 있으면 배지로 표시
    const domainBadge = (blocked) => (blocked && blocked.length)
        ? `<span title="🌐 외부 도메인 차단됨(알람 설정에서 허용 가능): ${blocked.join(', ')}" style="margin-left:4px; font-size:10px; color:#e67e22; cursor:help;">🌐🚫</span>` : '';
    const emailCell2 = (email, missing, blocked) => {
        if (!email) {
            if (missing && missing.length) return `<span style="color:#e03131; font-size:11px; white-space:nowrap;" title="${missing.join('\n')} 이메일 미등록">미등록 ⚠</span>`;
            return `<span style="color:#e03131; font-size:11px; white-space:nowrap;">미입력</span>`;
        }
        const emails = email.split(',').map(e => e.trim()).filter(Boolean);
        if (emails.length <= 1) return `<span style="font-size:11px; white-space:nowrap;">${emails[0]}</span>${domainBadge(blocked)}`;
        return `<span style="font-size:11px; cursor:help; border-bottom:1px dashed #aaa; white-space:nowrap;" title="${emails.join('\n')}">${emails[0]} 외 ${emails.length-1}</span>${domainBadge(blocked)}`;
    };

    tbody.innerHTML = items.map((item, idx) => `
        <tr class="${idx % 2 === 1 ? 'mc-zebra-b' : 'mc-zebra-a'}" style="cursor:pointer; border-bottom:1px solid #cfe3e5;"
            onmouseover="this.style.background='#d3ecef'" onmouseout="this.style.background=''"
            title="더블클릭하면 Gantt chart의 해당 업무로 이동합니다"
            onclick="window._alarmRowClick(${idx})" ondblclick="window._alarmRowDblClick(${idx}, ${item.rowIdx})">
            <td style="padding:7px 10px; font-size:12px;">${item.taskName}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${item.status || '-'}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${nameCell(item.assignee)}</td>
            <td style="padding:7px 10px; font-size:11px; color:#555;">${emailCell2(item.assigneeEmail, item.missingPeople, item.blockedByDomain)}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${nameCell(item.receiverStr)}</td>
            <td style="padding:7px 10px; font-size:11px; color:#555;">${emailCell2(item.receiverEmail, item.missingPeople, item.blockedByDomain)}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${item.dueStr}</td>
            <td style="padding:7px 10px; text-align:center;">${dDayLabel(item.diffDays)}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11.5px;">${sentStatus(item.sentLog, item.diffDays, item.sentHidden, idx)}</td>
            <td style="padding:7px 10px; text-align:center; font-size:11px; color:#888;">${lastSent(item.sentLog)}</td>
            <td style="padding:7px 10px; text-align:center;">
                <span onclick="event.stopPropagation(); window.openAlarmScheduleModal(${idx});" title="이 업무만 알람 일정을 다르게 설정" style="cursor:pointer; font-size:14px;">${item.alarmDays.length !== 3 || item.alarmDays.slice().sort((a,b)=>a-b).join(',') !== '1,3,7' ? '⚙️<span style="color:#2c5f8a; font-size:9px; vertical-align:top;">●</span>' : '⚙️'}</span>
                <span id="as-recur-badge-${idx}"></span>
            </td>
        </tr>`).join('');

    window._alarmItems = items;
    // 💡 [2026-08-31 신규] 이 업무들 중 "기간·반복" 예약(백엔드 /schedule, type='alarm')이 걸려있는
    //    행에 ⏰ 배지 표시 — 렌더링 자체를 막지 않도록 fire-and-forget(비동기, 결과 기다리지 않음)
    window._alarmAnnotateRecurBadges();
};

// 💡 알람 목록 각 행에 "기간·반복" 예약 등록 여부(⏰)를 표시 — 백엔드 /schedule 규칙과 driveFileId+rowIdx로 매칭
window._alarmAnnotateRecurBadges = async function() {
    if (window.loadScheduleRulesFromBackend) await window.loadScheduleRulesFromBackend();
    const rules = window._scheduleRules || [];
    const driveFileId = window.currentDriveFileId;
    (window._alarmItems || []).forEach((item, idx) => {
        const badge = document.getElementById(`as-recur-badge-${idx}`);
        if (!badge) return;
        const has = rules.some(r => r.type === 'alarm' && r.driveFileId === driveFileId && r.rowIdx === item.rowIdx && r.enabled !== false);
        badge.innerHTML = has ? '<span title="기간·반복 예약 등록됨" style="color:#2c5f8a; font-size:9px;">⏰</span>' : '';
    });
};

// 💡 업무별 커스텀 알람 일정 — 체크박스 상태를 폼에 채움 + 이 업무에 이미 등록된 "기간·반복"
//    예약(백엔드 /schedule)이 있으면 그 값도 불러와 채운다.
window.openAlarmScheduleModal = async function(idx) {
    const item = (window._alarmItems || [])[idx];
    if (!item) return;
    window._alarmScheduleItem = item;

    const current = new Set(item.alarmDays.map(Number));
    document.querySelectorAll('.alarm-sched-cb').forEach(cb => {
        cb.checked = current.has(Number(cb.value));
        current.delete(Number(cb.value));
    });
    // 프리셋(14/7/3/1/0)에 없는 나머지 숫자는 공지 등록과 동일하게 태그로 표시
    window._asCustomDays = Array.from(current).sort((a,b) => a-b);
    window._asRenderCustomTags();

    // 기간·반복 필드 초기화 (매번 신규 상태로 리셋 후, 기존 규칙이 있으면 아래서 덮어씀)
    window._asSpecificDates = [];
    window._asRenderSpecificDateTags();
    document.getElementById('as-mode-dday').checked = true;
    document.getElementById('as-datemode-range').checked = true;
    ['as-recur-start','as-recur-end'].forEach(i => { const el=document.getElementById(i); if(el) el.value=''; });
    document.getElementById('as-recur-day-interval').value = 1;
    document.getElementById('as-recur-send-time').value = '09:00';
    document.getElementById('as-schedule-rule-id').value = '';
    document.getElementById('as-delete-rule-btn').style.display = 'none';

    // 이 업무(driveFileId+rowIdx)에 이미 등록된 "기간·반복" 규칙이 있으면 불러와 채움
    if (window.loadScheduleRulesFromBackend) await window.loadScheduleRulesFromBackend();
    const driveFileId = window.currentDriveFileId;
    const existing = (window._scheduleRules || []).find(r => r.type === 'alarm' && r.driveFileId === driveFileId && r.rowIdx === item.rowIdx);
    if (existing) {
        document.getElementById('as-mode-recur').checked = true;
        document.getElementById('as-schedule-rule-id').value = existing.id;
        if (existing.dateMode === 'specific') {
            document.getElementById('as-datemode-specific').checked = true;
            window._asSpecificDates = (existing.specificDates || []).slice();
            window._asRenderSpecificDateTags();
        } else {
            document.getElementById('as-recur-start').value = existing.startDate || '';
            document.getElementById('as-recur-end').value = existing.endDate || '';
            document.getElementById('as-recur-day-interval').value = existing.dayInterval || 1;
        }
        // 💡 예전 규칙(시간창)에서 넘어온 경우 hourStart를 발송 시각으로 사용
        document.getElementById('as-recur-send-time').value = existing.hourStart || '09:00';
        document.getElementById('as-delete-rule-btn').style.display = 'block';
    }
    window._asToggleMode();
    window._asToggleDateMode();

    // 수신 대상 — 이 업무가 개별수신으로 지정돼 있으면 그 상태로, 아니면 기본수신으로 열기
    const recipRow = (window.globalData || [])[item.rowIdx];
    const isCustomRecip = recipRow && recipRow._알림수신자모드 === 'custom';
    document.getElementById('as-recip-mode-default').checked = !isCustomRecip;
    document.getElementById('as-recip-mode-custom').checked  = !!isCustomRecip;
    window._asRenderRecipList();

    // 💡 [2026-09-01] 업무 정보 — 예전엔 읽기 전용 표시였는데, 이 알람 발송에만 쓰일 제목/내용을 직접
    //    다듬을 수 있게 편집 가능한 입력칸으로 변경. row._알림제목오버라이드/_알림내용오버라이드에 저장된
    //    "이 알람만의 덮어쓰기"가 있으면 그걸 먼저 보여주고, 없으면 Gantt 업무에서 가져온 값을 기본값으로
    //    보여준다(Gantt 원본 업무 자체는 건드리지 않음 — window.saveAlarmSchedule 참고).
    document.getElementById('as-info-title').value = (recipRow && recipRow._알림제목오버라이드) || item.taskName || '';
    document.getElementById('as-info-content').value = (recipRow && recipRow._알림내용오버라이드)
        || (item.content ? (window.alarmFormatContent ? window.alarmFormatContent(item.content) : item.content) : '');
    document.getElementById('as-info-mailraw-wrap').style.display = item.mailRaw ? 'block' : 'none';

    document.getElementById('alarm-schedule-title').textContent = '⚙️ ' + item.taskName + (window._currentLang === 'en' ? ' — Alarm Schedule' : ' — 알람 일정');
    document.getElementById('alarm-schedule-overlay').style.display = 'flex';
    // 💡 반드시 'flex'로 열어야 헤더/본문 스크롤/푸터 3단 레이아웃(flex-direction:column)이 적용됨
    document.getElementById('alarm-schedule-modal').style.display = 'flex';
    window.bringModalToFront('alarm-schedule-modal');
};

// 기본값(7/3/1) 체크 상태로 폼만 되돌림 — 저장 버튼을 눌러야 실제 반영됨
window.resetAlarmScheduleForm = function() {
    document.querySelectorAll('.alarm-sched-cb').forEach(cb => {
        cb.checked = ['7', '3', '1'].includes(cb.value);
    });
    window._asCustomDays = [];
    window._asRenderCustomTags();
};

window.closeAlarmScheduleModal = function() {
    document.getElementById('alarm-schedule-overlay').style.display = 'none';
    document.getElementById('alarm-schedule-modal').style.display = 'none';
    window._alarmScheduleItem = null;
};

// ── 발송 방식(D-day 목록 / 기간·반복) 및 날짜 지정방식(기간 / 특정 날짜) 토글 ──────
// ── 커스텀 D-day 태그 관리 (notice-modal의 _nmCustomDays와 동일 패턴으로 통일) ──────
window._asCustomDays = [];
const AS_DDAY_PRESETS = [14, 7, 3, 1, 0];

window._asAddCustomDay = function() {
    const input = document.getElementById('as-d-custom');
    const val   = parseInt(input?.value);
    if (!val || val < 1 || val > 365) { input && input.focus(); return; }
    // 기본 체크박스와 중복 방지
    if (AS_DDAY_PRESETS.includes(val)) {
        const cb = document.getElementById(`as-d${val}`);
        if (cb) { cb.checked = true; input.value = ''; return; }
    }
    if (window._asCustomDays.includes(val)) { input.value = ''; return; }
    window._asCustomDays.push(val);
    window._asRenderCustomTags();
    input.value = '';
};

window._asRenderCustomTags = function() {
    const wrap = document.getElementById('as-d-custom-tags');
    if (!wrap) return;
    wrap.innerHTML = window._asCustomDays.sort((a,b)=>b-a).map(d =>
        `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:#e8f0fb;border:1px solid #b0c4e8;border-radius:12px;font-size:11.5px;color:#2c5f8a;">
          D-${d}
          <button type="button" onclick="window._asRemoveCustomDay(${d})"
                  style="background:none;border:none;cursor:pointer;color:#888;font-size:11px;padding:0;line-height:1;">✕</button>
        </span>`
    ).join('');
};

window._asRemoveCustomDay = function(d) {
    window._asCustomDays = window._asCustomDays.filter(x => x !== d);
    window._asRenderCustomTags();
};

window._asToggleMode = function() {
    const isRecur  = document.getElementById('as-mode-recur')?.checked;
    const ddayEl   = document.getElementById('as-dday-fields');
    const recurEl  = document.getElementById('as-recur-fields');
    const resetBtn = document.getElementById('as-reset-btn');
    if (ddayEl)   ddayEl.style.display   = isRecur ? 'none' : 'block';
    if (recurEl)  recurEl.style.display  = isRecur ? 'block' : 'none';
    if (resetBtn) resetBtn.style.display = isRecur ? 'none' : 'inline-block';
};

window._asToggleDateMode = function() {
    const isSpecific = document.getElementById('as-datemode-specific')?.checked;
    const rangeEl = document.getElementById('as-daterange-fields');
    const specEl  = document.getElementById('as-specific-dates-fields');
    // 💡 [2026-09-01] 두 필드 모두 발송 시각과 한 줄에 나란히 배치되는 flex 아이템이라 'grid'/'block'
    //    대신 'flex'로 토글(위 HTML의 새 레이아웃 참고, notice-modal의 _nmToggleDateMode와 동일 패턴).
    if (rangeEl) rangeEl.style.display = isSpecific ? 'none' : 'flex';
    if (specEl)  specEl.style.display  = isSpecific ? 'flex' : 'none';
};

// ── 수신 대상: 기본수신(전체 공용 CC 명단) / 개별수신(이 업무만의 명단) ─────────
// 라디오를 바꾸면 그 시점의 저장된 값으로 목록을 다시 그린다(전환 중 미저장 편집은 버려짐 — D-day
// 체크박스처럼 "저장" 눌러야 확정되는 폼이라 자연스러운 동작).
window._asToggleRecipMode = function() {
    window._asRenderRecipList();
};

window._asRenderRecipList = function() {
    const list = document.getElementById('as-recip-list');
    if (!list) return;
    list.innerHTML = '';
    const isDefault = document.getElementById('as-recip-mode-default')?.checked;
    const descEl = document.getElementById('as-recip-mode-desc');
    let rows;
    if (isDefault) {
        rows = window._computeDefaultCcList();
        if (descEl) descEl.textContent = '기본수신: 모든 업무가 함께 쓰는 공통 명단 — 여기서 고치면 다른 업무에도 함께 적용됩니다.';
    } else {
        const item = window._alarmScheduleItem;
        const row  = item ? (window.globalData || [])[item.rowIdx] : null;
        if (row && Array.isArray(row._알림수신자) && row._알림수신자.length) {
            rows = row._알림수신자.map(window._normalizeRecipRow);
        } else {
            // 💡 [2026-09-01] 예전엔 저장된 개별수신 명단이 없으면 완전히 빈 목록으로 시작했음(notice-modal의
            //    개별수신은 Summary 담당자를 자동으로 불러왔는데 이쪽만 안 그랬음) — 통일: Summary 담당자를
            //    자동으로 불러오되, 채널 체크(이메일/텔레그램)는 기본수신과 동일하게 꺼진 상태로 시작.
            const seen = new Set();
            rows = (window._autoRegisterCcFromMembers ? window._autoRegisterCcFromMembers() : [])
                .filter(m => { if (seen.has(m.email)) return false; seen.add(m.email); return true; })
                .map(m => {
                    const p = window._addrFindByName ? window._addrFindByName(m.name) : null;
                    return { name: m.name, email: m.email, telegramId: p ? (p.telegramId || '') : '', emailOn: false, tgOn: false, auto: true };
                });
        }
        if (descEl) descEl.textContent = '개별수신: 이 업무에만 적용되는 명단입니다.';
    }
    rows.forEach(r => window._asRecipAddRow('as-recip-list', r));
    window._asSyncRecipHeaderPad('as-recip-list');
};

// 저장 시점 화면 상태를 실제로 반영 — 기본수신이면 전체 공용 명단(gantt_alarm_settings.ccList)을
// 갱신, 개별수신이면 이 업무의 행(row._알림수신자)에 기록. 반환값은 이번에 저장된 수신자 배열
// (기간·반복 규칙 저장 시 백엔드로 그대로 스냅샷해서 보냄).
window._asPersistRecipients = function() {
    const item = window._alarmScheduleItem;
    if (!item) return [];
    const row  = (window.globalData || [])[item.rowIdx];
    const isDefault = document.getElementById('as-recip-mode-default')?.checked;
    const rows = window._asRecipCollect('as-recip-list');
    if (isDefault) {
        const cfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
        cfg.ccList = rows;
        localStorage.setItem('gantt_alarm_settings', JSON.stringify(cfg));
        if (row) { delete row._알림수신자모드; delete row._알림수신자; }
    } else if (row) {
        row._알림수신자모드 = 'custom';
        row._알림수신자 = rows;
    }
    return rows;
};

// ── 특정 날짜 태그 관리 (notice-modal의 _nmSpecificDates와 동일 패턴) ──────────
window._asSpecificDates = [];

window._asAddSpecificDate = function() {
    const input = document.getElementById('as-specific-date-input');
    const val = input?.value;
    if (!val) { input && input.focus(); return; }
    if (window._asSpecificDates.includes(val)) { input.value = ''; return; }
    window._asSpecificDates.push(val);
    window._asSpecificDates.sort();
    window._asRenderSpecificDateTags();
    input.value = '';
};

window._asRenderSpecificDateTags = function() {
    const wrap = document.getElementById('as-specific-date-tags');
    if (!wrap) return;
    wrap.innerHTML = window._asSpecificDates.map(d =>
        `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:#e8f0fb;border:1px solid #b0c4e8;border-radius:12px;font-size:11.5px;color:#2c5f8a;">
          ${d}
          <button type="button" onclick="window._asRemoveSpecificDate('${d}')"
                  style="background:none;border:none;cursor:pointer;color:#888;font-size:11px;padding:0;line-height:1;">✕</button>
        </span>`
    ).join('');
};

window._asRemoveSpecificDate = function(d) {
    window._asSpecificDates = window._asSpecificDates.filter(x => x !== d);
    window._asRenderSpecificDateTags();
};

// ── 기간·반복 예약 저장/해제 (백엔드 /schedule API, type='alarm') ─────────────
// 💡 공지(notice)와 달리 title/message/recipients를 고정 저장하지 않는다 — driveFileId+rowIdx만
//    기억해두면 백엔드가 발송 직전 구글드라이브에서 이 업무의 최신 상태를 다시 읽는다
//    (kortek_backend.py의 _fire_alarm_rule/_build_alarm_task_snapshot 참고).
window._asSaveRecurRule = async function() {
    const item = window._alarmScheduleItem;
    if (!item) return;
    const driveFileId = window.currentDriveFileId;
    if (!driveFileId) {
        const msg = '이 프로젝트가 구글드라이브에 저장된 후에만 기간·반복 예약이 가능합니다. 먼저 저장해주세요.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
        return;
    }

    const dateMode = document.getElementById('as-datemode-specific')?.checked ? 'specific' : 'range';
    let startDate = '', endDate = '', dayInterval = 1;
    if (dateMode === 'range') {
        startDate = document.getElementById('as-recur-start').value;
        endDate   = document.getElementById('as-recur-end').value;
        if (!startDate || !endDate) { alert('시작일/종료일을 입력해주세요.'); return; }
        if (startDate > endDate) { alert('종료일이 시작일보다 빠릅니다.'); return; }
        dayInterval = parseInt(document.getElementById('as-recur-day-interval').value, 10) || 1;
    } else {
        if (!window._asSpecificDates.length) { alert('특정 날짜를 1개 이상 추가해주세요.'); return; }
    }

    // 💡 [2026-08-31] 시간창(시작~종료+몇시간마다) 대신 "발송 시각" 하나만 받음 — 백엔드 스키마는
    //    그대로 두고(hourStart/hourEnd/hourInterval), 시작=종료=이 시각으로 보내 하루 1번만 걸리게 함
    //    (_rule_today_buckets가 시작==종료면 그 시각 1개만 버킷으로 만듦 — kortek_backend.py 참고).
    const sendTime     = document.getElementById('as-recur-send-time').value || '09:00';
    const hourStart    = sendTime;
    const hourEnd      = sendTime;
    const hourInterval = 1;
    const ruleId       = document.getElementById('as-schedule-rule-id').value || undefined;

    // 💡 업무 정보(제목/내용) 덮어쓰기도 D-day 저장과 동일하게 여기서 함께 반영
    window._asPersistTitleContentOverride();
    const rowForSnapshot = (window.globalData || [])[item.rowIdx];

    // 💡 수신 대상(기본수신/개별수신)을 지금 화면 상태로 저장(전역 CC 명단 갱신 또는 이 업무에만 기록)
    const ccRecipients = window._asPersistRecipients ? (window._asPersistRecipients() || []) : [];

    // 💡 CC 명단/외부도메인 허용목록은 브라우저 localStorage(알람 설정)에만 있어 서버가 못 보므로,
    //    저장 시점 값을 그대로 스냅샷해서 같이 보낸다 (담당자/마감일/업무내용과 달리 자주 안 바뀌는 값).
    const cfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
    const payload = {
        id: ruleId, type: 'alarm',
        driveFileId, rowIdx: item.rowIdx,
        taskNameSnapshot: (rowForSnapshot && rowForSnapshot._알림제목오버라이드) || item.taskName,
        ccRecipientsSnapshot: ccRecipients,
        allowedExternalDomainsSnapshot: cfg.allowedExternalDomains || [],
        dateMode, startDate, endDate, specificDates: window._asSpecificDates.slice(),
        dayInterval, hourStart, hourEnd, hourInterval, enabled: true
    };

    try {
        const health = await fetch(`${MAIL_SERVER}/health`, { signal: AbortSignal.timeout(2000) });
        if (!health.ok) throw new Error();
    } catch (e) {
        alert('❌ 메일 서버(kortek_backend.py)가 실행되지 않았습니다.\n기간·반복 예약은 이 서버가 켜져 있어야 등록/동작합니다.');
        return;
    }

    try {
        const res = await fetch(`${MAIL_SERVER}/schedule`, {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        window.closeAlarmScheduleModal();
        await window.loadScheduleRulesFromBackend();
        window.renderAlarmTab();
        if (window.showToast) window.showToast('✅ 기간·반복 예약이 저장되었습니다.');
    } catch (e) {
        alert('❌ 예약 규칙 저장 실패: ' + e.message);
    }
};

window._asDeleteRecurRule = async function() {
    const ruleId = document.getElementById('as-schedule-rule-id').value;
    if (!ruleId) return;
    if (!confirm('이 업무의 기간·반복 예약을 해제할까요?')) return;
    try {
        await fetch(`${MAIL_SERVER}/schedule/${ruleId}`, { method: 'DELETE' });
    } catch (e) {}
    window.closeAlarmScheduleModal();
    await window.loadScheduleRulesFromBackend();
    window.renderAlarmTab();
};

// 💡 [2026-09-01 신규] "업무 정보" 제목/내용 입력칸을 다듬었으면(원본 업무 값과 다르면) row에
//    "이 알람만의 덮어쓰기"로 저장 — 그대로 두면(원본과 동일/빈칸) 덮어쓰기를 지워서 항상 Gantt 원본을
//    따라가게 함. D-day 저장(아래 saveAlarmSchedule)과 기간·반복 저장(_asSaveRecurRule) 양쪽에서 공용.
window._asPersistTitleContentOverride = function() {
    const item = window._alarmScheduleItem;
    if (!item) return;
    const row = (window.globalData || [])[item.rowIdx];
    if (!row) return;
    const titleEl = document.getElementById('as-info-title');
    const contentEl = document.getElementById('as-info-content');
    const titleVal = (titleEl?.value || '').trim();
    const contentVal = (contentEl?.value || '').trim();
    if (titleVal && titleVal !== (item.taskName || '').trim()) row._알림제목오버라이드 = titleVal;
    else delete row._알림제목오버라이드;
    const origContent = (item.content ? (window.alarmFormatContent ? window.alarmFormatContent(item.content) : item.content) : '').trim();
    if (contentVal && contentVal !== origContent) row._알림내용오버라이드 = contentVal;
    else delete row._알림내용오버라이드;
};

// 저장: D-day 목록 모드면 row._알림일정에 기록(기본값(7/3/1)과 완전히 같으면 커스텀 설정을 지워서
// "기본값 사용" 상태로 되돌림), 기간·반복 모드면 백엔드 예약 규칙 저장으로 위임
window.saveAlarmSchedule = function() {
    if (document.getElementById('as-mode-recur')?.checked) { window._asSaveRecurRule(); return; }

    const item = window._alarmScheduleItem;
    if (!item) return;
    const row = (window.globalData || [])[item.rowIdx];
    if (!row) return;

    window._asPersistTitleContentOverride();

    const checked = Array.from(document.querySelectorAll('.alarm-sched-cb:checked')).map(cb => Number(cb.value));
    const finalDays = Array.from(new Set([...checked, ...(window._asCustomDays || [])])).sort((a, b) => b - a);
    if (!finalDays.length) {
        const msg = '최소 1개 이상의 알람 시점을 선택해주세요.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
        return;
    }

    const isDefault = finalDays.length === ALARM_DAYS.length && finalDays.slice().sort((a,b)=>a-b).join(',') === ALARM_DAYS.slice().sort((a,b)=>a-b).join(',');
    if (isDefault) {
        delete row._알림일정; // 기본값과 같으면 커스텀 설정 자체를 지움
    } else {
        row._알림일정 = finalDays;
    }

    if (window._asPersistRecipients) window._asPersistRecipients(); // 수신 대상(기본수신/개별수신)도 함께 저장

    if (window.logChange) window.logChange(item.rowIdx, -1, '알람 일정', isDefault ? '기본값으로 복원' : '커스텀 설정: ' + finalDays.map(d => d === 0 ? 'D-Day' : ('D-' + d)).join(', '));

    window.closeAlarmScheduleModal();
    window.renderAlarmTab();
};

// 발송 이력 초기화 (오발송 등 재발송이 필요할 때)
// 발송 상태 토글 — 실제 이력은 지우지 않고 "미발송 취급" 여부만 켜고 끔 (실수 클릭 대비 가역적)
window.toggleAlarmSent = function(idx) {
    const item = (window._alarmItems || [])[idx];
    if (!item || !Object.keys(item.sentLog).length) return;
    const key = `gantt_alarm_${item.rowId}_hidden`;
    const wasHidden = item.sentHidden;
    if (wasHidden) {
        localStorage.removeItem(key); // 복원: 다시 "발송됨"으로 표시
    } else {
        localStorage.setItem(key, '1'); // 토글: 임시로 "미발송"으로 표시 (이력은 유지)
    }
    window.renderAlarmTab();

    // 📌 "미발송 처리됨"으로 바꾼 순간 바로 체크해서 발송 — 단, 자동 메일 발송이 OFF면
    //    이 토글도 "자동" 성격이므로 보내지 않고 플래그만 켜둠 (즉시발송/일괄발송 버튼은 항상 별개로 동작)
    if (!wasHidden) {
        const autoCfg = window.loadAlarmSettings ? window.loadAlarmSettings() : {};
        if (autoCfg.autoSend !== false && window.checkAndSendAlarms) {
            window.checkAndSendAlarms(true);
        }
    }
};

// 모달 열기
window.openAlarmModal = function(idx) {
    const item = (window._alarmItems || [])[idx];
    if (!item) return;
    window._alarmCurrentItem = item;

    const _amEn = window._currentLang === 'en';   // ← 여기로 이동
    const pm        = window.projectMeta || {};
    const projTitle = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';
    const _amEn2 = window._currentLang === 'en';
    const dayKeys   = Object.keys(item.sentLog).filter(k => !isNaN(Number(k))).map(Number).sort((a,b) => a-b);
    const sentParts = dayKeys.map(d => `✓ D-${d}일 전 발송 (${item.sentLog[d].substring(0,16).replace('T',' ')})`);
    if (item.sentLog.manual) sentParts.push(`✓ ${_amEn2 ? 'Manual send' : '즉시 발송'} (${item.sentLog.manual.substring(0,16).replace('T',' ')})`);
    if (item.sentLog.bulk)   sentParts.push(`✓ ${_amEn2 ? 'Batch send' : '일괄 발송'} (${item.sentLog.bulk.substring(0,16).replace('T',' ')})`);
    const sentHtml  = sentParts.length ? sentParts.join('<br>') : (_amEn2 ? 'No send history' : '발송 이력 없음');

    // 업무내용 줄바꿈: 날짜 이후, [섹션키워드] 이전에 개행
    const formattedContent = item.content ? window.alarmFormatContent(item.content) : '';

    const _isBlockedEmail = (email) => (item.blockedByDomain || []).some(b => (email || '').split(',').map(e=>e.trim()).includes(b));
    const emailWarn = (email, name) => email
        ? `<span style="color:#27ae60;">${email}</span>${_isBlockedEmail(email) ? ' <span title="🌐 외부 도메인 차단됨 — 실제 알람은 발송되지 않습니다 (알람 설정에서 허용 가능)" style="font-size:10px; color:#e67e22; cursor:help;">🌐🚫 차단</span>' : ''}`
        : `<span style="color:#e03131;">미등록 — Summary 탭에 <b>${name}</b> 이메일을 입력해 주세요</span>`;
    document.getElementById('alarm-modal-title').textContent = '🔔 ' + item.taskName;
    document.getElementById('alarm-modal-body').innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:12.5px; line-height:1.6;">
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold; width:100px;">프로젝트</td><td style="padding:6px 10px;">${projTitle}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">업무명</td><td style="padding:6px 10px;">${item.taskName}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">업무상태</td><td style="padding:6px 10px;">${item.status || '-'}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">발신인</td><td style="padding:6px 10px;">${item.assignee} &nbsp; ${emailWarn(item.assigneeEmail, item.assignee)}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">수신인</td><td style="padding:6px 10px;">${item.receiverStr} &nbsp; ${emailWarn(item.receiverEmail, item.receiverStr)}</td></tr>
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold;">완료 예정일</td><td style="padding:6px 10px; color:#e03131; font-weight:bold;">${item.dueStr} (${dDayLabel(item.diffDays)})</td></tr>
            ${formattedContent ? `<tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold; vertical-align:top;">업무 내용</td><td style="padding:6px 10px; white-space:pre-wrap; font-size:12px; color:#444;">${formattedContent}${item.mailRaw ? `<div style="margin-top:6px; white-space:normal;"><button onclick="window.showMailRawModal(window._alarmCurrentItem.mailRaw)" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="font-size:11px; padding:3px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📧 ${_amEn2 ? 'View Mail Source' : '메일 원문 보기'}</button></div>` : ''}</td></tr>` : ''}
            <tr><td style="padding:6px 10px; background:#f4f6f8; font-weight:bold; vertical-align:top;">발송 이력</td><td style="padding:6px 10px; color:#555; font-size:12px;">${sentHtml}</td></tr>
        </table>`;

    document.getElementById('alarm-modal-overlay').style.display = 'flex';
    document.getElementById('alarm-modal').style.display = 'block';
    window.bringModalToFront('alarm-modal');
};

// 모달 닫기
window.closeAlarmModal = function() {
    document.getElementById('alarm-modal-overlay').style.display = 'none';
    document.getElementById('alarm-modal').style.display = 'none';
    window._alarmCurrentItem = null;
};

// 개별 즉시 발송
window.sendSingleAlarm = async function(sendAll) {
    const item = window._alarmCurrentItem;
    if (!item) return;

    const pm        = window.projectMeta || {};
    const projTitle = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';

    // ALL 모드: 프로젝트 전체 멤버 이메일 (멤버-3 자유 추가 인원 포함)
    const allMemberEmails = [
        pm.프로젝트담당자이메일, pm.기구담당자이메일,
        pm.HW담당자이메일, pm.FW담당자이메일, pm.TSP담당자이메일,
        pm.LCM담당자이메일, pm.Slimming담당자이메일,
        pm.Cutting담당자이메일, pm.Module담당자이메일, pm.Tooling담당자이메일,
        ...((window.tabData || {}).projectMembers3 || []).map(m => m.email),
    ].flatMap(e => (e || '').split(/[,，]/).map(x => x.trim()))
     .filter(e => e && e.includes('@'))
     .filter(window._isAlarmDomainAllowed); // 🌐 외부 도메인 차단

    // 일반 모드: 발신인 + 수신인만
    const allEmails = sendAll
        ? [...new Set(allMemberEmails)].join(',')
        : item.toEmail || [...new Set(allMemberEmails)].join(',');

    if (!allEmails) {
        if (window.bmAlertModal) window.bmAlertModal('Summary 탭에 이메일 주소를 먼저 입력해 주세요.');
        else alert('Summary 탭에 이메일 주소를 먼저 입력해 주세요.');
        return;
    }

    const dDay    = item.diffDays;
    const subject = `[Gantt 알람] ${projTitle} — "${item.taskName}" 완료일 ${dDayPlain(dDay)}`;
    const body    = `<div style="font-family:'맑은 고딕',sans-serif; font-size:14px; color:#333;">
  <p><b>${item.assignee}님께</b></p>
  <p>아래 업무의 완료 예정일이 <b style="color:#e74c3c;">${dDayPlain(dDay)}일 (${item.dueStr})</b>입니다.</p>
  <table style="border-collapse:collapse; margin:12px 0; border:1px solid #dcdde1; width:100%; max-width:1000px;">
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">프로젝트</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${projTitle}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">업무</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.taskName}</td></tr>
    ${item.content ? `<tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; vertical-align:top; border:1px solid #dcdde1; width:90px; white-space:nowrap;">내용</td><td style="padding:6px 12px; white-space:normal; border:1px solid #dcdde1; word-break:break-word;">${window.alarmFormatContent(item.content).replace(/\n/g, '<br>')}</td></tr>` : ''}
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">담당자</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.assignee}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">완료 예정일</td><td style="padding:6px 12px; color:#e74c3c; border:1px solid #dcdde1;"><b>${item.dueStr}</b></td></tr>
  </table>
  <p style="color:#888; font-size:12px;">본 메일은 Gantt Chart 알람 시스템에서 자동 발송되었습니다.</p>
</div>`;

    const btn = document.getElementById('alarm-modal-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = '발송 중...'; }

    try {
        const res = await fetch('http://127.0.0.1:5000/send-mail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: allEmails, cc: item.ccMails || '', subject, body })
        });
        const data = await res.json();
        if (data.ok) {
            // 발송 이력 저장
            const key = `gantt_alarm_${item.rowId}_manual`;
            localStorage.setItem(key, new Date().toISOString());
            item.sentLog['manual'] = new Date().toISOString();

            // 💡 텔레그램 발송 — 주소록 telegramId 기준으로 수신자 매칭 (🌐 외부 도메인 차단된 사람은 제외)
            //    + 수신 대상(CC)에 텔레그램이 켜진 사람도 함께 (2026-08-31: 기본수신/개별수신 신설)
            const ccTgChatIds2 = (item.ccRecipients || [])
                .filter(r => r.tgOn && r.telegramId && (!r.email || window._isAlarmDomainAllowed(r.email)))
                .map(r => r.telegramId);
            const tgChatIds = [...new Set([
                ...(item.allowedPeople || item.allPeople || [item.assignee]).map(n => { const p = window._addrFindByName(n); return p ? p.telegramId : ''; }),
                ...ccTgChatIds2
            ])].filter(Boolean);
            if (tgChatIds.length && window.sendTelegramAlarm) {
                // 💡 [2026-08-24] 위 자동알람과 동일 기준으로 100자 → 2000자 확대
                const _tgContent2 = item.content ? '\n내용: ' + item.content.replace(/\n/g,' ').substring(0,2000) + (item.content.length>2000?'…':'') : '';
                const tgMsg = `📌 [Gantt 알람] ${projTitle}\n업무: ${item.taskName}\n담당: ${item.assignee}\n기한: ${item.dueStr} (${dDayPlain(item.diffDays)})${_tgContent2}`;
                tgChatIds.forEach(chatId => window.sendTelegramAlarm(tgMsg, { chatId }));
            }

            window.closeAlarmModal();
            window.renderAlarmTab();
            window.showToast(window._currentLang === 'en' ? '✅ Sent!' : '✅ 발송 완료!');
        } else {
            throw new Error(data.error);
        }
    } catch(e) {
        if (window.bmAlertModal) window.bmAlertModal('발송 실패: ' + e.message);
        else alert('발송 실패: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📧 즉시 발송'; }
    }
};

// 미발송 일괄 발송 (수동 버튼 — 과거 미발송 포함)
window.sendAllPendingAlarms = async function() {
    const items = window.collectAlarmItems();
    const pending = items.filter(item => {
        // D-7 이하인데 한 번도 발송 안 된 항목
        return item.diffDays <= 7 && Object.keys(item.sentLog).length === 0;
    });

    if (!pending.length) {
        if (window.bmAlertModal) window.bmAlertModal('미발송 항목이 없습니다.');
        else alert('미발송 항목이 없습니다.');
        return;
    }

    const pm        = window.projectMeta || {};
    const projTitle = [pm.고객사, pm.고객모델명].filter(Boolean).join(' > ') || '프로젝트';

    let sentCount = 0;
    for (const item of pending) {
        // 업무별 발신인/수신인이 없으면 이 건은 건너뜀 (더 이상 Summary 멤버 전체로 대체 발송하지 않음)
        if (!item.toEmail) continue;
        const subject = `[Gantt 알람] ${projTitle} — "${item.taskName}" 완료일 ${dDayPlain(item.diffDays)}`;
        const body    = `<div style="font-family:'맑은 고딕',sans-serif; font-size:14px; color:#333;">
  <p><b>${item.assignee}님께</b></p>
  <p>아래 업무의 완료 예정일이 <b style="color:#e74c3c;">${dDayPlain(item.diffDays)}일 (${item.dueStr})</b>입니다.</p>
  <table style="border-collapse:collapse; margin:12px 0; border:1px solid #dcdde1; width:100%; max-width:1000px;">
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">프로젝트</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${projTitle}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">업무</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.taskName}</td></tr>
    ${item.content ? `<tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; vertical-align:top; border:1px solid #dcdde1; width:90px; white-space:nowrap;">내용</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.content}</td></tr>` : ''}
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">담당자</td><td style="padding:6px 12px; border:1px solid #dcdde1; word-break:break-word;">${item.assignee}</td></tr>
    <tr><td style="padding:6px 12px; background:#f0f8ff; font-weight:bold; border:1px solid #dcdde1; width:90px; white-space:nowrap;">완료 예정일</td><td style="padding:6px 12px; color:#e74c3c; border:1px solid #dcdde1;"><b>${item.dueStr}</b></td></tr>
  </table>
  <p style="color:#888; font-size:12px;">본 메일은 Gantt Chart 알람 시스템에서 자동 발송되었습니다.</p>
</div>`;

        try {
            const res = await fetch('http://127.0.0.1:5000/send-mail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: item.toEmail, cc: item.ccMails || '', subject, body })
            });
            const data = await res.json();
            if (data.ok) {
                localStorage.setItem(`gantt_alarm_${item.rowId}_bulk`, new Date().toISOString());
                sentCount++;
            }
        } catch(e) {
            console.warn('일괄 발송 실패:', item.taskName, e.message);
        }
    }

    window.renderAlarmTab();
    const msg = sentCount > 0 ? `${sentCount}건 발송 완료!` : '발송 실패. 메일 서버를 확인해 주세요.';
    if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
};

// 💡 프로젝트 멤버-3 (자유 추가 인원) 행 렌더링
window.renderMember3Rows = function(rows) {
    const colA = document.getElementById('sum-member3-col-a');
    const colB = document.getElementById('sum-member3-col-b');
    if (!colA || !colB) {
        console.warn('⚠️ sum-member3-col-a/b 요소를 찾지 못했습니다. Summary 멤버-3 HTML(2열 구조) diff가 적용됐는지 확인해주세요.');
        return;
    }
    window.tabData = window.tabData || {};
    window.tabData.projectMembers3 = rows || [];

    const build = function(r, idx) {
        return '<input type="text" data-idx="' + idx + '" data-field="role" class="u-input mem-label" value="' + _escTabVal(r.role) + '" placeholder="예: PCB 설계">'
            + '<input type="text" data-idx="' + idx + '" data-field="name" class="u-input" value="' + _escTabVal(r.name) + '" placeholder="예: 홍길동">'
            + '<div style="position:relative; display:flex; align-items:center;">'
            +   '<input type="email" data-idx="' + idx + '" data-field="email" class="u-input" value="' + _escTabVal(r.email) + '" placeholder="email@company.com" style="width:100%; padding-right:24px; box-sizing:border-box;">'
            +   '<button type="button" onclick="window.deleteMember3Row(' + idx + ')" title="이 인원 삭제"'
            +     ' style="position:absolute; right:3px; top:50%; transform:translateY(-50%); border:1px solid #ccc; border-radius:3px; background:#fff; color:#999; cursor:pointer; font-size:13px; line-height:1; width:18px; height:18px; padding:0; display:flex; align-items:center; justify-content:center;"'
            +     ' onmouseover="this.style.background=\'#e03131\'; this.style.borderColor=\'#e03131\'; this.style.color=\'#fff\';" onmouseout="this.style.background=\'#fff\'; this.style.borderColor=\'#ccc\'; this.style.color=\'#999\';">－</button>'
            + '</div>';
    };

    let htmlA = '', htmlB = '';
    (rows || []).forEach(function(r, idx) {
        if (idx % 2 === 0) htmlA += build(r, idx); else htmlB += build(r, idx);
    });
    colA.innerHTML = htmlA;
    colB.innerHTML = htmlB;
};

window.addMember3Row = function() {
    window.tabData = window.tabData || {};
    window.tabData.projectMembers3 = window.tabData.projectMembers3 || [];
    window.tabData.projectMembers3.push({ role: '', name: '', email: '' });
    window.renderMember3Rows(window.tabData.projectMembers3);
};

window.deleteMember3Row = function(idx) {
    window.tabData = window.tabData || {};
    // 💡 collectTabData() 전체를 부르지 않고, member-3 DOM만 직접 읽어서 최신 배열을 만듦 (다른 탭 로직과 완전 분리)
    const m3map = {};
    document.querySelectorAll('#sum-member3-col-a [data-idx], #sum-member3-col-b [data-idx]').forEach(function(el) {
        const i = el.dataset.idx;
        m3map[i] = m3map[i] || {};
        m3map[i][el.dataset.field] = el.value;
    });
    const current = Object.keys(m3map)
        .sort(function(a, b) { return Number(a) - Number(b); })
        .map(function(k) { return { role: m3map[k].role || '', name: m3map[k].name || '', email: m3map[k].email || '' }; });

    console.log('🗑 삭제 전 인원 수:', current.length, '삭제할 idx:', idx);
    current.splice(idx, 1);
    console.log('🗑 삭제 후 인원 수:', current.length);

    window.tabData.projectMembers3 = current;
    window.renderMember3Rows(current);
};

// 💡 [2026-08-20] 주요 자재 목록 — 고정 13개 구분(항상 존재·삭제불가) + 자유추가 행.
//    메일 분석 시 AI 배경정보로 함께 제공(_msBuildDefaultPrompt 참고)해서, 메일 본문에 실제
//    언급된 자재/PN을 상세내용에 정확히 반영하도록 돕는 용도.
//    💡 [분석용 체크] 자재는 여러 프로젝트가 공용으로 쓰는 경우가 흔해서(POWER/METAL/MOLD 등),
//    전부 "이 프로젝트 확증 신호"로 AI에게 주면 오매칭 위험이 있음 → PN이 겹칠 확률이 낮은 PANEL만
//    기본으로 체크해서 "분석용"(신뢰 가능한 식별 신호)으로, 나머지는 기본 미체크(참고용만)로 시작.
//    체크 여부는 프로젝트마다 사용자가 직접 조정 가능.
window.MATERIAL_FIXED_CATEGORIES = ['PANEL','SLIM/CUT','TOUCH / GLASS','TOUCH CTRL','AD BOARD','CONVERTER','BLU','POWER','METAL','MOLD','DIE CAST','PACKING','ETC'];
// 💡 구분명 변경(SLIMMING/CUTTING → SLIM/CUT) 이전에 이미 저장된 데이터도 그대로 이어받기 위한 별칭
window._MATERIAL_CATEGORY_ALIASES = { 'SLIM/CUT': ['SLIMMING/CUTTING'] };

// 💡 화면 DOM에서 현재 입력 중인 값을 그대로 읽어 배열로 재구성 (add/delete 시 다른 행의
//    미저장 편집내용이 날아가지 않도록 collectTabData() 전체를 부르지 않고 이 테이블만 직접 읽음)
// 💡 [2026-08-25 버그 수정] keepEmptyExtras가 false(기본값·저장 시 사용)면 완전히 빈 자유추가 행은
//    자동 정리했는데, "+ 자재 추가"가 이 함수로 "지금 몇 행이 있는지"를 센 뒤 그 위에 한 행을 얹는
//    방식이라 — 방금 추가해서 아직 아무것도 안 적은 빈 행이 바로 다음 호출에서 사라져버려, 연속으로
//    눌러도 매번 "빈 칸 1개"로 되돌아가는 것처럼 보였다(실제로는 늘었다 지워지길 반복). "+ 자재 추가"/
//    "－ 삭제"처럼 화면에 지금 있는 행 그대로를 기준으로 조작할 때는 keepEmptyExtras=true로 불러서
//    빈 행도 그대로 유지한 채 개수를 센다. 실제 저장(collectTabData 등)은 그대로 기본값(정리함)을 쓴다.
window.collectMaterialRows = function(keepEmptyExtras) {
    const map = {};
    document.querySelectorAll('#sum-materials-rows-a [data-idx], #sum-materials-rows-b [data-idx]').forEach(function(el) {
        const i = Number(el.dataset.idx);
        map[i] = map[i] || {};
        map[i][el.dataset.field] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    const fixedCount = window.MATERIAL_FIXED_CATEGORIES.length;
    const idxs = Object.keys(map).map(Number);
    const maxIdx = idxs.length ? Math.max(fixedCount - 1, Math.max.apply(null, idxs)) : fixedCount - 1;
    const result = [];
    for (let i = 0; i <= maxIdx; i++) {
        const r = map[i] || {};
        const isFixed = i < fixedCount;
        const category = isFixed ? window.MATERIAL_FIXED_CATEGORIES[i] : (r.category || '');
        const ktkPn = r.ktkPn || '', description = r.description || '', cost = r.cost || '';
        const useForAnalysis = !!r.useForAnalysis;
        // 고정 행은 항상 유지, 자유추가 행은 완전히 빈 채로 남으면 저장 시 자동 정리(단, keepEmptyExtras면 유지)
        if (isFixed || keepEmptyExtras || category || ktkPn || description || cost) {
            result.push({ category: category, ktkPn: ktkPn, description: description, cost: cost, useForAnalysis: useForAnalysis });
        }
    }
    return result;
};

window.renderMaterialRows = function(rows) {
    const tbodyA = document.getElementById('sum-materials-rows-a');
    const tbodyB = document.getElementById('sum-materials-rows-b');
    if (!tbodyA || !tbodyB) return;
    window.tabData = window.tabData || {};
    rows = rows || [];
    const _matEn = window._currentLang === 'en';

    // 고정 13개: 저장된 데이터에서 구분명으로 값을 이어받고(순서는 항상 고정 목록 순), 없으면 빈 값.
    // useForAnalysis: 저장된 값이 있으면 그대로, 없으면(=신규 프로젝트) PANEL만 기본 체크
    const fixedRows = window.MATERIAL_FIXED_CATEGORIES.map(function(cat) {
        const aliases = window._MATERIAL_CATEGORY_ALIASES[cat] || [];
        const found = rows.find(function(r) { return r.category === cat || aliases.indexOf(r.category) !== -1; });
        const defaultChecked = cat === 'PANEL';
        return {
            category: cat, ktkPn: found ? (found.ktkPn || '') : '', description: found ? (found.description || '') : '', cost: found ? (found.cost || '') : '',
            useForAnalysis: found ? !!found.useForAnalysis : defaultChecked, locked: true
        };
    });
    // 자유추가: 고정 목록에도, 별칭에도 없는 구분명을 가진 행
    const allAliasNames = Object.keys(window._MATERIAL_CATEGORY_ALIASES).reduce(function(acc, k) { return acc.concat(window._MATERIAL_CATEGORY_ALIASES[k]); }, []);
    const extraRows = rows.filter(function(r) { return window.MATERIAL_FIXED_CATEGORIES.indexOf(r.category) === -1 && allAliasNames.indexOf(r.category) === -1; })
        .map(function(r) { return { category: r.category, ktkPn: r.ktkPn, description: r.description, cost: r.cost, useForAnalysis: !!r.useForAnalysis, locked: false }; });
    const allRows = fixedRows.concat(extraRows);
    window.tabData.projectMaterials = allRows.map(function(r) { return { category: r.category, ktkPn: r.ktkPn, description: r.description, cost: r.cost, useForAnalysis: r.useForAnalysis }; });

    // 💡 [2열 배치] 프로젝트 멤버-1/2와 같은 느낌으로 좌우 분할. 고정 13개(ETC 제외 12개) 중
    //    왼쪽 7개/오른쪽 5개로 나누고, 자유추가 행은 아래에서 지그재그로 배정한다.
    const splitAt = Math.ceil(window.MATERIAL_FIXED_CATEGORIES.length / 2); // 7
    const rowHtml = function(r, idx, pos) {
        // 💡 [2026-08-29 색상 정리] TYPE 칸이 제브라와 무관하게 항상 헤더색(#eef6f7)으로 고정돼 있어서,
        //    같은 행 안에서 TYPE 칸만 따로 노는 것처럼 보였음 — 헤더 배경(#eef6f7)은 <thead>에만 쓰고,
        //    본문 행은 TYPE 칸도 나머지 칸과 동일하게 제브라(A=#fff/B=#e8f2f3)를 따르도록 통일.
        // 💡 [2026-08-30 수정] 제브라를 "고정 13개 목록에서의 논리적 idx"로 계산했더니, 오른쪽 표는
        //    항상 idx=7부터 시작(홀수)이라 첫 행부터 음영이 깔려 왼쪽 표(idx=0, 첫 행 흰색)와 줄무늬가
        //    어긋나 보였음 — 화면에 실제로 그려지는 위치(pos, 각 표 안에서 0부터 시작)로 계산해서
        //    좌우 표가 항상 같은 행 번호끼리 같은 색이 되도록 통일.
        const _zebraBg = pos % 2 === 1 ? '#e8f2f3' : '#fff';
        const catCell = r.locked
            ? '<td style="padding:4px 6px; border:1px solid #cfe3e5; background:' + _zebraBg + '; font-weight:bold; white-space:nowrap; text-align:center;">' + escapeHtml(r.category) + '</td>'
            : '<td style="padding:2px; border:1px solid #cfe3e5; background:' + _zebraBg + ';"><input type="text" data-idx="' + idx + '" data-field="category" class="u-input" value="' + _escTabVal(r.category) + '" placeholder="' + (_matEn ? 'Category' : '구분명') + '" style="border:none; width:100%; box-sizing:border-box; text-align:center; background:transparent; font-weight:bold;"></td>';
        // 💡 [2026-08-25 UX 개선] 예전엔 "삭제 버튼"이 맨 오른쪽 체크박스 칸에 있어서 눈에 잘 안 띈다는
        //    지적이 있었음 — PANEL 행의 🔎(스펙 미리보기) 버튼과 같은 자리(설명 입력칸 바로 옆)로 옮겨서,
        //    자유추가 행을 열 때 바로 보이는 "행 액션 버튼" 자리로 통일했다.
        const delBtn = r.locked ? '' : '<button type="button" onclick="window.deleteMaterialRow(' + idx + ')" title="' + (_matEn ? 'Delete this row' : '이 행 삭제') + '" style="flex-shrink:0; border:1px solid #ccc; border-radius:3px; background:#fff; color:#999; cursor:pointer; font-size:11px; width:20px; height:20px; line-height:1; padding:0;">－</button>';
        // 💡 [2026-08-25 신규 — Panel Compare 연동] PANEL 구분 행에 모델명이 적혀 있으면, 그 옆에
        //    스펙 미리보기 버튼을 붙인다 — 클릭하면 패널 스펙 라이브러리에서 조회해 보여주고,
        //    Panel Compare 탭 비교표에 없으면 바로 추가할 수 있게 한다.
        // 💡 [2026-08-26 신규 — Elec Parts 연동] CONVERTER/AD BOARD 구분 행도 PANEL과 완전히 동일한
        //    규칙 — 값이 있을 때만 돋보기를 보여준다(showElecPartSpecModal 내부에서 빈칸/미등록 두
        //    경우 모두 "붙여넣어 AI로 추출" 흐름으로 이어주지만, 버튼 노출 자체는 PANEL과 통일).
        //    구분명 → Elec Parts 타입 매핑이라 나중에 부품 종류가 늘어도 이 한 줄만 추가하면 됨.
        const _epRowType = { 'CONVERTER': 'convbd', 'AD BOARD': 'adbd' };
        // 💡 [2026-09-01 신규] 돋보기 노출 조건을 "description 있음"에서 "description 또는 ktkPn 있음"으로
        //    확장 — ktk pn만 먼저 적어놓고 이름은 아직 안 적은 경우에도 코드만으로 라이브러리 검색 가능.
        //    검색 자체는 description(이름 식별자)은 그대로 두고 ktkPn을 별도 "코드 힌트"로 같이 넘겨서
        //    showPanelSpecModal/showElecPartSpecModal 내부에서 "코드_이름" 조합으로 라이브러리를 찾게
        //    한다(비교표 식별자로 쓰이는 model 문자열 자체는 안 건드려서, 이미 비교표에 등록된 항목과의
        //    대조·재추출 흐름은 그대로 유지됨).
        const _hasSpecKey = !!(r.description || r.ktkPn);
        const descInputCell = '<td style="padding:2px; border:1px solid #cfe3e5;"><div style="display:flex; align-items:center; gap:2px;">'
            + '<input type="text" data-idx="' + idx + '" data-field="description" class="u-input" value="' + _escTabVal(r.description) + '" placeholder="' + (_matEn ? 'e.g. MV315QHM-N41' : '예: MV315QHM-N41') + '" style="border:none; width:100%; box-sizing:border-box; background:transparent;" '
            + ((r.category === 'PANEL' || _epRowType[r.category]) ? 'onchange="window.renderMaterialRows(window.collectMaterialRows(true));"' : '') + '>'
            + ((r.category === 'PANEL' && _hasSpecKey)
                ? '<button type="button" onclick="window.showPanelSpecModal(' + escapeHtml(JSON.stringify(r.description)) + ', ' + escapeHtml(JSON.stringify(r.ktkPn || '')) + ')" title="' + (_matEn ? 'Panel spec preview' : '패널 스펙 미리보기') + '" style="flex-shrink:0; border:1px solid #2c5f8a; border-radius:3px; background:#fff; color:#2c5f8a; cursor:pointer; font-size:11px; width:20px; height:20px; line-height:1; padding:0;">🔎</button>'
                : ((_epRowType[r.category] && _hasSpecKey)
                    ? '<button type="button" onclick="window.showElecPartSpecModal(' + escapeHtml(JSON.stringify(_epRowType[r.category])) + ', ' + escapeHtml(JSON.stringify(r.description)) + ', ' + escapeHtml(JSON.stringify(r.ktkPn || '')) + ')" title="' + (_matEn ? 'Spec preview' : '스펙 미리보기') + '" style="flex-shrink:0; border:1px solid #2c5f8a; border-radius:3px; background:#fff; color:#2c5f8a; cursor:pointer; font-size:11px; width:20px; height:20px; line-height:1; padding:0;">🔎</button>'
                    : ''))
            + delBtn
            + '</div></td>';
        return '<tr style="background:' + _zebraBg + ';">' + catCell
            + '<td style="padding:2px; border:1px solid #cfe3e5;"><input type="text" data-idx="' + idx + '" data-field="ktkPn" class="u-input" value="' + _escTabVal(r.ktkPn) + '" maxlength="6" style="border:none; width:100%; box-sizing:border-box; background:transparent;" '
            + ((r.category === 'PANEL' || _epRowType[r.category]) ? 'onchange="window.renderMaterialRows(window.collectMaterialRows(true));"' : '') + '></td>'
            + descInputCell
            + '<td style="padding:2px; border:1px solid #cfe3e5;"><input type="text" data-idx="' + idx + '" data-field="cost" class="u-input" value="' + _escTabVal(r.cost) + '" style="border:none; width:100%; box-sizing:border-box; background:transparent;"></td>'
            + '<td style="border:1px solid #cfe3e5; text-align:center; white-space:nowrap;"><input type="checkbox" data-idx="' + idx + '" data-field="useForAnalysis" ' + (r.useForAnalysis ? 'checked' : '') + ' title="' + (_matEn ? 'Check to trust mentions of this PN as a project-identifying signal (uncheck for shared/common parts)' : '체크하면 이 PN 언급을 프로젝트 식별 신호로 신뢰함(공용 부품이면 체크 해제 권장)') + '"></td>'
            + '</tr>';
    };

    // 💡 [2026-08-25 UX 개선] 자유추가 행을 전부 오른쪽에만 쌓으면 오른쪽만 계속 길어지고 왼쪽엔
    //    빈 공간이 남는다는 지적이 있었음 — 왼쪽 고정 7개/오른쪽 고정 5개(+ETC)는 그대로 두고,
    //    새로 추가되는 자유추가 행은 항상 "더 짧은 쪽"에 지그재그로 배정해서 두 표의 높이가 비슷하게
    //    유지되도록 한다(아래 그리디 로직 참고). ETC는 항상 오른쪽 표 맨 마지막에 고정. data-idx는
    //    원래 논리적 위치(고정 목록에서의 자리) 그대로 유지해서 collectMaterialRows()의 위치 기반 해석이 깨지지 않는다.
    const logicalRows = allRows.map(function(r, i) { return { r: r, idx: i }; });
    const etcEntry = logicalRows.find(function(e) { return e.r.category === 'ETC'; });
    const nonEtcRows = logicalRows.filter(function(e) { return e.r.category !== 'ETC'; });
    const fixedNonEtc = nonEtcRows.slice(0, window.MATERIAL_FIXED_CATEGORIES.length - 1); // 고정 12개(ETC 제외)
    const extrasList = nonEtcRows.slice(window.MATERIAL_FIXED_CATEGORIES.length - 1);     // 자유추가 행들
    const leftFixed = fixedNonEtc.slice(0, splitAt);   // PANEL~BLU (7개)
    const rightFixed = fixedNonEtc.slice(splitAt);     // POWER~PACKING (5개)

    // 💡 왼쪽이 고정 7개로 시작해 오른쪽(5개)보다 2개 더 많으므로, 단순 홀짝 교대(왼→오→왼→오)로는
    //    그 격차가 끝까지 안 좁혀진다. 대신 "지금 더 짧은 쪽에 추가, 같으면 왼쪽"으로 매번 판단하는
    //    그리디 방식을 쓰면 처음엔 오른쪽에 2개 연속 붙어 격차를 메운 뒤(→R,R), 그 다음부턴 자연스럽게
    //    한 칸씩 번갈아 붙는다(→L,R,L,R…) — 두 표의 높이가 항상 최대 1행 차이로 유지된다.
    const extraLeft = [], extraRight = [];
    let _matLeftCount = leftFixed.length, _matRightCount = rightFixed.length;
    extrasList.forEach(function(e) {
        if (_matLeftCount <= _matRightCount) { extraLeft.push(e); _matLeftCount++; }
        else { extraRight.push(e); _matRightCount++; }
    });

    const displayLeft = leftFixed.concat(extraLeft);
    const displayRight = rightFixed.concat(extraRight);
    if (etcEntry) displayRight.push(etcEntry);

    tbodyA.innerHTML = displayLeft.map(function(e, pos) { return rowHtml(e.r, e.idx, pos); }).join('');
    tbodyB.innerHTML = displayRight.map(function(e, pos) { return rowHtml(e.r, e.idx, pos); }).join('');
};

window.addMaterialRow = function() {
    const current = window.collectMaterialRows(true); // 지금 화면에 입력 중인 값 보존(빈 자유추가 행도 유지해야 연속 클릭 시 계속 늘어남)
    current.push({ category: '', ktkPn: '', description: '', cost: '', useForAnalysis: false });
    window.tabData.projectMaterials = current;
    window.renderMaterialRows(current);
};

window.deleteMaterialRow = function(idx) {
    if (idx < window.MATERIAL_FIXED_CATEGORIES.length) return; // 고정 구분은 삭제 불가(안전장치)
    const current = window.collectMaterialRows(true); // 다른 빈 자유추가 행이 먼저 정리되면 idx가 어긋나므로 그대로 유지한 채 삭제
    current.splice(idx, 1);
    window.tabData.projectMaterials = current;
    window.renderMaterialRows(current);
};

// ═══════════════════════════════════════════════════════════════════
// 🖥️ [2026-08-25 신규] Panel Compare — panelook.com을 참고한 패널 스펙 비교표
//    - 패널 스펙 자체는 팀 공용 Drive 라이브러리(PanelSpecLibrary_Shared.json)에 모델명 기준으로 저장
//      → 한 번 AI로 추출한 패널은 다른 프로젝트에서도 재사용 가능 (AddressBook/project_index.json과 동일 패턴)
//    - 프로젝트는 "이 비교표에 어떤 모델을 골라뒀는지"(최대 10개)만 자기 tabData.panelCompare에 저장
//    - panelook.com은 봇 차단(캡차)이 있고 모델명만으로 상세페이지 직접링크를 만들 수 없어서,
//      스펙은 사용자가 붙여넣은 텍스트를 AI로 추출하고, 모델명 헤더는 검색결과 링크로 연결한다.
// ═══════════════════════════════════════════════════════════════════

// 💡 첨부 샘플 엑셀("PANEL COMP TABLE" 시트)의 11개 섹션·113개 항목을 그대로 옮긴 고정 템플릿.
//    각 항목의 두 번째 값(1|2)은 표시 우선순위 — 1=핵심스펙(항상 표시), 2=부가스펙(기본 접힘).
//    원본의 "[Electronics Feure]" 오타는 "Electronics Features"로, "Rec.2020 voverage"/"Late Time Order"
//    같은 명백한 오타도 새로 만드는 템플릿이니 정리했다(사용자 확인됨).
window.PANEL_SPEC_SCHEMA = [
    { section: 'Basic Information', fields: [
        ['Panel Brand', 1], ['Item Code', 1], ['Part Name', 1], ['Revision', 1], ['Panel Type', 1], ['Composition', 1], ['Shipping Mode', 2],
        ['Operating Temperature', 2], ['Storage Temperature', 2], ['Vibration Level', 2],
        ['RoHS State', 2], ['Application', 2], ['Specific Feature', 2], ['Remarks', 2],
    ]},
    { section: 'Mechanical Features', fields: [
        ['Diagonal Size', 1], ['Dot Resolution', 1], ['Pixel Configuration', 1], ['Aspect Ratio', 1],
        ['Form Factor', 1], ['Dot Pitch (HxV)', 1], ['Weight', 2], ['Surface Glare', 1],
        ['Surface Hardness', 1], ['Surface Reflection', 2], ['Active Area (HxV)', 1],
        ['Bezel Area (HxV)', 2], ['Outline Dimension (HxV)', 1], ['Outline Depth', 1],
        ['Substrate Thickness', 2], ['Shape Style', 2], ['Mount & Brackets', 2], ['Landscape or Portrait', 1],
    ]},
    { section: 'Touch Panel', fields: [
        ['Touch Panel', 1], ['Simultaneously Touch', 2], ['Touch Signal Type', 2],
        ['Touch Interface Type', 2], ['Touch Controller', 2], ['Touch OS System', 2],
    ]},
    { section: 'Optical Features', fields: [
        ['Display Mode', 1], ['Brightness (Min/Typ) (cd/m²)', 1], ['HDR Peak', 2],
        ['Transmissive Contrast Ratio', 1], ['Display Color', 1], ['Gray Method', 1],
        ['Low Blue Light', 2], ['NTSC Ratio', 1], ['sRGB Coverage', 2], ['Adobe Coverage', 2],
        ['DCI-P3 Coverage', 2], ['Rec.2020 Coverage', 2], ['Viewing Angle (L/R/U/D)', 1],
        ['Viewing Direction', 2], ['Response Time', 1], ['Color Temperature', 1],
        ['White Color Coordinates', 1], ['White Variation (Max/Min)', 1], ['Transmissivity (%)', 1],
        ['Reflectance Ratio (%)', 2], ['Sunlight Readable', 2],
    ]},
    { section: 'Electronics Features', fields: [
        ['Vertical Frequency', 1], ['Sync Type', 2], ['Scan Direction', 1], ['Reverse Scan', 1],
        ['Total Power Consumption', 2], ['Driver IC', 2], ['T-CON', 2],
    ]},
    { section: 'Backlight System', fields: [
        ['Lamp Position', 1], ['Lamp Type', 2], ['Lamp Amount', 2], ['Lamp Shape', 2],
        ['Lamp Life Time (Hrs)', 1], ['Lamp Voltage', 2], ['Lamp Current', 2],
        ['Lamps Power Consumption', 2], ['Lamp Driver Board', 1], ['Input Voltage of Lamp Driver', 2],
        ['Input Current of Lamp Driver', 2], ['BLU Power Consumption', 2], ['PWM Duty Ratio', 2],
        ['PWM Frequency', 2], ['BLU Interface Type', 2], ['BLU Interface Position', 2],
        ['BLU Interface Brand', 2], ['BLU Interface Model', 2], ['BLU Interface Pin Pitch', 2],
        ['BLU Interface Amount', 2], ['Pin Amount of BLU Interface', 2], ['BLU Interface Pin Configuration', 2],
    ]},
    { section: 'Signal Interface', fields: [
        ['Signal Interface Category', 1], ['Signal Interface Class', 1], ['Input Voltage for Panel', 1],
        ['Input Current for Panel', 2], ['Panel Power Consumption', 2], ['Voltage for Display Signals', 2],
        ['Signal Interface Type', 2], ['Signal Interface Position', 2], ['Signal Interface Brand', 2],
        ['Signal Interface Model', 2], ['Signal Interface Pin Pitch', 2], ['Signal Interface Amount', 2],
        ['Signal Interface Pins', 1], ['Signal Pin Configuration', 2],
    ]},
    { section: 'Packing Form', fields: [ ['Minimum Package', 2] ] },
    { section: 'Datasheet Source', fields: [
        ['Document Language', 2], ['Datasheet Version', 2], ['Issue Date', 2],
    ]},
    { section: 'Production State', fields: [
        ['Customer Sample', 2], ['Mass Production', 2], ['Last Time Order', 2],
        ['Last Time Shipment', 2], ['Production State Now', 1],
    ]},
    { section: 'Other', fields: [
        ['Expected Price', 1], ['Expected Price (Cutting/Slimming)', 2], ['Investment', 2], ['Note', 1],
    ]},
];
