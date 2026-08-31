// ════════════════════════════════════════════════════
// Calendar 탭 — Gantt chart 업무를 월간 캘린더로 표시
// 1) 시작일 기준 표시, 클릭 시 완료일까지 기간을 막대+화살표로 표시 (기본은 숨김)
// 2) 하루에 표시할 수 없을 만큼 많으면 "+N개 더보기" → 팝업으로 전체 목록
// 3) Gantt의 🔔 알림(_알림) 표시와 동기화
// 4) Google Calendar 연동: .ics 파일로 내보내기 (구글 캘린더에서 가져오기로 바로 추가 가능)
// ════════════════════════════════════════════════════
window.calState = window.calState || { year: new Date().getFullYear(), month: new Date().getMonth(), selectedIdx: null, viewMode: 'month', weekStart: null, levelFilter: [3, 4] };

// 💡 [2026-08-21][WBS 레벨 필터] 캘린더에 표시할 업무를 L0~L4 중 선택한 레벨로만 좁힘. 기본값 L3/L4.
//    (Gantt 차트 상단의 LEVEL(WBS) 필터와 동일한 filter-group/filter-label/btn 스타일을 그대로 사용)
window.calSyncLevelFilterUI = function() {
    const group = document.getElementById('cal-level-filter-group');
    if (!group) return;
    const arr = window.calState.levelFilter || [];
    group.querySelectorAll('.btn[data-level]').forEach(function(btn) {
        btn.classList.toggle('active', arr.indexOf(Number(btn.dataset.level)) !== -1);
    });
    const label = document.getElementById('cal-level-all-label');
    if (label) label.classList.toggle('active', arr.length === 5);
    // 💡 [수정] Calendar는 기본값 자체가 "전체(All)"가 아니라 L3/L4라서, Gantt와 같은 기준으로
    //    "전체가 아니면 강조"를 적용하면 평소에도 계속 파란 배경으로 보여 Gantt WBS 버튼(평소엔
    //    흰 바탕, 마우스 올릴 때만 파란 바탕)과 다르게 보였음 — 강조 없이 항상 기본 action-btn
    //    모양(흰 바탕/파란 글씨 → 호버 시 파란 바탕/흰 글씨)만 쓰도록 되돌림.
};
window.calToggleLevel = function(level) {
    const arr = window.calState.levelFilter;
    const idx = arr.indexOf(level);
    if (idx === -1) arr.push(level); else arr.splice(idx, 1);
    window.calSyncLevelFilterUI();
    window.calRender();
};
// LEVEL(WBS) 라벨 클릭 — 전체(0~4) 선택 ↔ 직전 선택 상태 토글 (Gantt 필터 라벨과 동일한 동작)
window.calToggleLevelAll = function() {
    const cur = window.calState.levelFilter || [];
    if (cur.length === 5) {
        window.calState.levelFilter = (window._calLevelFilterPrev && window._calLevelFilterPrev.length) ? window._calLevelFilterPrev.slice() : [3, 4];
    } else {
        window._calLevelFilterPrev = cur.slice();
        window.calState.levelFilter = [0, 1, 2, 3, 4];
    }
    window.calSyncLevelFilterUI();
    window.calRender();
};

// 💡 [주 단위 보기] 날짜가 속한 주의 일요일 자정 타임스탬프
function calGetWeekStart(d) {
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    dt.setDate(dt.getDate() - dt.getDay());
    return dt.getTime();
}

function calStatusCls(status) {
    if (!status) return '';
    const s = status.toString().trim().toLowerCase();
    if (['완료','done'].indexOf(s) !== -1)                      return ' chip-done';
    if (['지연','보류','delay','on hold'].indexOf(s) !== -1)    return ' chip-delay';
    if (['대기','pending'].indexOf(s) !== -1)                   return ' chip-pending';
    return ''; // 진행/In Progress/On going → 기본 파란색 유지
}
function calBuildEvents() {
    const events = [];
    if (typeof globalData === 'undefined' || !globalData || !globalData.length) return events;
    for (let i = 1; i < globalData.length; i++) {
        const row = globalData[i];
        if (!row) continue;
        const myLevel = (typeof row._level === 'number') ? row._level : 4;
        const nextRow = globalData[i + 1];
        const nextLevel = (nextRow && typeof nextRow._level === 'number') ? nextRow._level : -1;
        const isLeaf = !(nextRow && nextLevel > myLevel);
        if (!isLeaf) continue;
        // 💡 [WBS 레벨 필터] 선택한 레벨(기본 L3/L4)에 해당하는 업무만 캘린더에 표시
        if (window.calState.levelFilter && window.calState.levelFilter.indexOf(myLevel) === -1) continue;
        const name = (typeof wrTaskName === 'function') ? wrTaskName(row) : '';
        if (!name) continue;
        const s = row._calcStartTs;
        if (!s) continue;
        const e = row._calcPlanTs || s;

        function cleanText(v) {
            return v ? v.toString().trim().replace(/\r/g, '').replace(/(\n[ \t]*){2,}/g, '\n').replace(/ {2,}/g, ' ') : '';
        }
        const contentText = (colIdx.content !== -1) ? cleanText(row[colIdx.content]) : '';

        events.push({
            idx: i, name: name, start: s, end: e,
            assignee: window.getSummaryAssignee(),
            status: (typeof colIdx !== 'undefined' && colIdx.status !== -1) ? (row[colIdx.status] || '') : '',
            alarm: !!row._알림,
            content: contentText
        });
    }
    return events;
}

function calDateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function calTsToKey(ts) { return calDateKey(new Date(ts)); }

window.calChangeMonth = function(delta) {
    window.calState.month += delta;
    if (window.calState.month < 0) { window.calState.month = 11; window.calState.year--; }
    if (window.calState.month > 11) { window.calState.month = 0; window.calState.year++; }
    window.calState.selectedIdx = null;
    window.calRender();
};
// 💡 [주 단위 보기] "◀ 이전"/"다음 ▶" 버튼 공용 진입점 — 월 모드면 한 달씩, 주 모드면 한 주씩 이동
window.calChangePeriod = function(delta) {
    if (window.calState.viewMode === 'week') {
        const d = new Date(window.calState.weekStart || calGetWeekStart(new Date()));
        d.setDate(d.getDate() + delta * 7);
        window.calState.weekStart = d.getTime();
        window.calState.selectedIdx = null;
        window.calRender();
    } else {
        window.calChangeMonth(delta);
    }
};
window.calSetViewMode = function(mode) {
    if (window.calState.viewMode === mode) return;
    window.calState.viewMode = mode;
    if (mode === 'week' && !window.calState.weekStart) {
        window.calState.weekStart = calGetWeekStart(new Date(window.calState.year, window.calState.month, 1));
    }
    window.calState.selectedIdx = null;
    window.calRender();
};
window.calGoToday = function() {
    const t = new Date();
    window.calState.year = t.getFullYear(); window.calState.month = t.getMonth();
    window.calState.weekStart = calGetWeekStart(t);
    window.calState.selectedIdx = null;
    window.calRender();
};
window.calSelectEvent = function(idx) {
    // 💡 [2026-08-21] 같은 업무를 다시 클릭하면(=선택 해제) 팝업도 같이 닫히도록 함
    const wasSelected = (window.calState.selectedIdx === idx);
    window.calState.selectedIdx = wasSelected ? null : idx;
    window.calRender();
    if (wasSelected) {
        window.closeCalDayPopup();
    } else {
        // 💡 업무(칩)를 클릭하면 기간 라인 표시 + 상세내용 팝업까지 함께 — 날짜 숫자 클릭(목록 팝업)은 그대로 둠
        const ev = calBuildEvents().find(function(e) { return e.idx === idx; });
        if (ev) window.calShowDayPopup(calTsToKey(ev.end), idx);
    }
};

window.calShowDayPopup = function(dateKey, targetIdx) {
    const allEvents = calBuildEvents();
    const overlay = document.getElementById('cal-day-popup-overlay');
    const body = document.getElementById('cal-day-popup-body');
    const title = document.getElementById('cal-day-popup-title');
    if (!overlay || !body || !title) return;

    if (targetIdx !== undefined) {
        // 업무 버튼 클릭 → 상세내용 표시 (뒤로가기 포함)
        const ev = allEvents.find(function(e) { return e.idx === targetIdx; });
        if (!ev) return;
        const row = globalData[ev.idx];
        const sMap = (typeof LANG !== 'undefined' && window._currentLang && LANG[window._currentLang]) ? LANG[window._currentLang].statusMap : null;
        const statusLabel = (sMap && sMap[ev.status]) || ev.status || '-';
        
        // ✅ [수정된 부분] \r 제거, 다중 줄바꿈 압축, 다중 공백 압축을 먼저 수행한 뒤 기존 로직 처리
        const contentText = (colIdx.content !== -1 && row[colIdx.content]) 
            ? row[colIdx.content].toString().trim()
                .replace(/\r/g, '')
                .replace(/(\n[ \t]*){2,}/g, '\n')
                .replace(/ {2,}/g, ' ')
                .replace(/\n/g, ' · \n') 
            : '';
            
        title.textContent = '📋 ' + ev.name;
        body.innerHTML =
            '<div style="margin-bottom:10px;">'
            + '<button onclick="window.calShowDayPopup(\'' + dateKey + '\')" onmouseover="this.style.background=\'#cfe6fa\'; this.style.borderColor=\'#7fb0dd\';" onmouseout="this.style.background=\'#e8f4fd\'; this.style.borderColor=\'#a5c8f0\';" style="font-size:11.5px; padding:3px 10px; border:1px solid #a5c8f0; border-radius:4px; background:#e8f4fd; color:#1a4f7a; cursor:pointer; transition:background .15s, border-color .15s;">◀ 목록으로</button>'
            + '</div>'
            + '<div style="margin-bottom:8px; font-size:12px; color:#777;">'
            + '📅 ' + wrFormatMD(ev.start) + ' ~ ' + wrFormatMD(ev.end)
            + (ev.assignee ? ' &nbsp;·&nbsp; 👤 ' + escapeHtml(ev.assignee) : '')
            + ' &nbsp;·&nbsp; ' + escapeHtml(statusLabel)
            + '</div>'
            + (contentText ? '<div style="font-size:12px; white-space:pre-line; line-height:1.5; margin-bottom:6px;">' + escapeHtml(contentText) + '</div>' : '')
            + (!contentText ? '<div style="color:#aaa; padding:24px; text-align:center; font-size:12px;">상세 내용 없음</div>' : '')
            + (row._mailRaw ? '<button onclick="window.showGanttMailRaw(' + ev.idx + '); event.stopPropagation();" onmouseover="this.style.background=\'#cfe6fa\'; this.style.borderColor=\'#7fb0dd\';" onmouseout="this.style.background=\'#e7f3ff\'; this.style.borderColor=\'#a5c8f0\';" style="font-size:11px; padding:3px 10px; background:#e7f3ff; color:#1971c2; border:1px solid #a5c8f0; border-radius:5px; cursor:pointer; transition:background .15s, border-color .15s;">📧 ' + (window._currentLang === 'en' ? 'Original' : '원본') + '</button>' : '');
    } else {
        // 날짜 숫자 클릭 → 업무 목록을 버튼으로 표시
        const events = allEvents.filter(function(ev) {
            const dk1 = calTsToKey(ev.start), dk2 = calTsToKey(ev.end);
            return dateKey >= dk1 && dateKey <= dk2;
        }).sort(function(a, b) { return a.start - b.start; });
        title.textContent = '📅 ' + dateKey + ' 업무 (' + events.length + '건)';
        if (events.length === 0) {
            body.innerHTML = '<div style="color:#999; padding:20px; text-align:center;">해당 날짜에 업무가 없습니다.</div>';
        } else {
            const sMap = (typeof LANG !== 'undefined' && window._currentLang && LANG[window._currentLang]) ? LANG[window._currentLang].statusMap : null;
            body.innerHTML = events.map(function(ev) {
                const statusLabel = (sMap && sMap[ev.status]) || ev.status || '-';
                const alarmCls = ev.alarm ? ' cal-alarm-on' : '';
                const bell = ev.alarm ? '📌 ' : '';
                return '<div class="cal-day-popup-item' + alarmCls + '" onclick="window.calShowDayPopup(\'' + dateKey + '\', ' + ev.idx + ');">'
                    + '<div style="font-weight:bold; margin-bottom:3px;">' + bell + escapeHtml(ev.name) + '</div>'
                    + '<div style="color:#777; font-size:11px;">' + wrFormatMD(ev.start) + ' ~ ' + wrFormatMD(ev.end)
                    + (ev.assignee ? ' · ' + escapeHtml(ev.assignee) : '') + ' · ' + escapeHtml(statusLabel) + '</div>'
                    + '</div>';
            }).join('');
        }
    }
    overlay.style.display = 'flex';
};
window.closeCalDayPopup = function(e) {
    if (e && e.target !== document.getElementById('cal-day-popup-overlay')) return;
    const overlay = document.getElementById('cal-day-popup-overlay');
    if (overlay) overlay.style.display = 'none';
};

// 담당자 이름에서 성(첫 글자)을 뗀 표시용 이름 — "박용훈" → "용훈"
function calShortName(name) {
    const n = (name || '').trim();
    // 3글자 이상 한글 이름이면 첫 글자(성)를 제거, 2글자 이하는 그대로 표시
    return (n.length >= 3) ? n.slice(1) : n;
}

// 💡 Google Calendar 연동: 표준 .ics 파일로 내보내기 — 구글 캘린더 좌측 [+] → 가져오기로 바로 추가 가능
// (Drive 연동에 쓰는 OAuth 권한 범위를 건드리지 않는 안전한 방식. 실시간 양방향 동기화가 필요하면 별도로 Calendar API 권한 추가가 필요합니다.)
// ICS 텍스트 생성 (다운로드/Gist 업로드 공용)
function calBuildICSText() {
    const events = calBuildEvents();
    if (events.length === 0) return null;
    function icsDate(ts) { const d = new Date(ts); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
    function icsDateNext(ts) { const d = new Date(ts); d.setDate(d.getDate() + 1); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
    function esc(s) { return (s || '').toString().replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kortek Gantt Chart//Calendar Export//KO'];
    events.forEach(function(ev) {
        // 마감일(ev.end) 하루만 이벤트로 등록 — 기간 전체 막대 표시 방지
        lines.push('BEGIN:VEVENT');
        lines.push('UID:gantt-' + ev.idx + '-' + icsDate(ev.end) + '@kortek');
        lines.push('DTSTART;VALUE=DATE:' + icsDate(ev.end));
        lines.push('DTEND;VALUE=DATE:' + icsDateNext(ev.end));
        lines.push('SUMMARY:' + esc((ev.assignee ? '[' + calShortName(ev.assignee) + ']' : '') + ev.name));
        const descParts = [];
        if (ev.assignee) descParts.push('담당자: ' + ev.assignee);
        if (ev.status) descParts.push('상태: ' + ev.status);
        descParts.push('시작일: ' + wrFormatMD(ev.start) + ' / 마감일: ' + wrFormatMD(ev.end));
        if (ev.content) descParts.push('--- 내용 ---\n' + ev.content);
        if (ev.answer)  descParts.push('--- 답변/코멘트 ---\n' + ev.answer);
        lines.push('DESCRIPTION:' + esc(descParts.join('\n')));
        lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

window.calExportICS = function() {
    const icsText = calBuildICSText();
    if (!icsText) { alert('내보낼 업무가 없습니다. Gantt chart 데이터를 먼저 불러와주세요.'); return; }
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = ((window.projectMeta && window.projectMeta.프로젝트명) || 'gantt').replace(/[^\w가-힣\-]/g, '_') + '_calendar.ics';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
};

// 🔗 Google Calendar 자동 구독 동기화: GitHub Secret Gist에 ICS를 올려두고
// 구글 캘린더가 그 raw URL을 주기적으로(수시간 간격) 다시 읽어가게 하는 방식.
// - 쓰기(gist 생성/갱신): GitHub Personal Access Token(gist 권한)으로 인증
// - 읽기(구글이 가져가는 것): 인증 없는 raw URL — "링크를 아는 사람만 접근 가능" 수준이며 완전 비공개는 아님
window.calSyncToGist = async function() {
    const icsText = calBuildICSText();
    if (!icsText) { alert('내보낼 업무가 없습니다. Gantt chart 데이터를 먼저 불러와주세요.'); return; }

    let token = localStorage.getItem('gantt_gist_token');
    if (!token) {
        token = prompt('GitHub Personal Access Token을 입력하세요 (gist 권한만 필요, 최초 1회):');
        if (!token) return;
        localStorage.setItem('gantt_gist_token', token);
    }

    const filename = ((window.projectMeta && window.projectMeta.프로젝트명) || 'gantt').replace(/[^\w가-힣\-]/g, '_') + '_calendar.ics';
    let gistId = localStorage.getItem('gantt_gist_id');

    try {
        let resp;
        if (!gistId) {
            // 최초: secret gist 생성
            resp = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: 'Kortek Gantt Chart Calendar Sync (secret)',
                    public: false,
                    files: { [filename]: { content: icsText } }
                })
            });
        } else {
            // 이후: 기존 gist 갱신
            resp = await fetch('https://api.github.com/gists/' + gistId, {
                method: 'PATCH',
                headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { [filename]: { content: icsText } } })
            });
        }
        if (!resp.ok) throw new Error('GitHub API 오류: ' + resp.status);
        const data = await resp.json();
        if (!gistId) {
            gistId = data.id;
            localStorage.setItem('gantt_gist_id', gistId);
        }
        const rawUrl = data.files[filename].raw_url.replace(/\/raw\/[0-9a-f]+\//, '/raw/'); // 항상 최신본을 가리키는 URL
        prompt('구글 캘린더 좌측 [다른 캘린더 +] → "URL로 만들기"에 아래 주소를 붙여넣으세요:\n(최초 1회만 등록하면 이후 자동 갱신됩니다)', rawUrl);
    } catch (err) {
        alert('동기화 실패: ' + err.message + '\n토큰이 올바른지, gist 권한이 있는지 확인해주세요.');
    }
};

window._calSyncHelpDrag = (function() {
    let dragging = false, sx, sy, ox, oy;
    document.addEventListener('mousedown', function(e) {
        const h = document.getElementById('cal-sync-help-drag');
        if (!h || !h.contains(e.target)) return;
        const m = document.getElementById('cal-sync-help-modal');
        if (!m) return;
        const r = m.getBoundingClientRect();
        dragging = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        m.style.transform = 'none'; m.style.left = ox + 'px'; m.style.top = oy + 'px';
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        const m = document.getElementById('cal-sync-help-modal');
        if (m) { m.style.left = (ox + e.clientX - sx) + 'px'; m.style.top = (oy + e.clientY - sy) + 'px'; }
    });
    document.addEventListener('mouseup', function() { dragging = false; });
})();

window.openCalSyncHelp = function() {
    const ov = document.getElementById('cal-sync-help-overlay');
    const m  = document.getElementById('cal-sync-help-modal');
    if (m) { m.style.left = '50%'; m.style.top = '50%'; m.style.transform = 'translate(-50%,-50%)'; }
    ov.style.display = 'flex';
    window._calSyncHelpRender();
};
window.closeCalSyncHelp = function() {
    document.getElementById('cal-sync-help-overlay').style.display = 'none';
};
window._calSyncHelpRender = function() {
    const _en = window._currentLang === 'en';
    const titleEl   = document.getElementById('cal-sync-help-title');
    const icsBtn    = document.getElementById('cal-sync-ics-btn');
    const runBtn    = document.getElementById('cal-sync-run-btn');
    const body      = document.getElementById('cal-sync-help-body');
    if (titleEl) titleEl.textContent = '🔗 ' + (_en ? 'Google Auto Sync' : 'Google 자동 동기화');
    if (icsBtn)  icsBtn.textContent  = _en ? '📤 Export ICS (one-time)' : '📤 ICS 내보내기 (1회성)';
    if (runBtn)  runBtn.textContent  = _en ? '🔗 Sync Now (auto)' : '🔗 지금 동기화 실행 (자동)';
    if (!body) return;
    if (_en) {
        body.innerHTML = `
            <b>Step 1. Prepare a GitHub Token (first time only)</b>
            <ol style="margin:6px 0 14px 18px; padding:0;">
                <li>Go to <a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a> (GitHub login required)</li>
                <li>Click <b>Generate new token → Generate new token (classic)</b></li>
                <li>Note: any name (e.g. gantt-sync), Expiration: No expiration recommended</li>
                <li>Check only the <b>gist</b> scope</li>
                <li>Click <b>Generate token</b> → Copy the token (starts with ghp_) and keep it safe (you won't see it again)</li>
            </ol>
            <b>Step 2. Run Sync in the App</b>
            <ol style="margin:6px 0 14px 18px; padding:0;">
                <li>Click the <b>🔗 Auto Sync</b> button in the Calendar tab</li>
                <li>Paste the token from Step 1 when prompted (asked only once)</li>
                <li>When done, a URL (https://gist.githubusercontent.com/...) appears → Copy it all</li>
            </ol>
            <b>Step 3. Add to Google Calendar (first time only)</b>
            <ol style="margin:6px 0 14px 18px; padding:0;">
                <li>Go to <a href="https://calendar.google.com" target="_blank">calendar.google.com</a></li>
                <li>Click <b>[+]</b> next to <b>Other calendars</b> in the left sidebar</li>
                <li>Select <b>From URL</b></li>
                <li>Paste the URL from Step 2 and click <b>Add calendar</b></li>
            </ol>
            <b>After that?</b>
            <p style="margin:4px 0 14px;">Just press <b>🔗 Auto Sync</b> again whenever your data changes. You only need to register Google Calendar once — the URL stays the same. Google Calendar may take 8–24 hours to reflect changes.</p>
            <p style="margin:4px 0 0; color:#e03131;">⚠️ The token is like a password — never share it. Anyone with the gist link can view your schedule, so use with caution for sensitive projects.</p>`;
    } else {
        body.innerHTML = `
            <b>1단계. GitHub 토큰 준비 (최초 1회만)</b>
            <ol style="margin:6px 0 14px 18px; padding:0;">
                <li><a href="https://github.com/settings/tokens" target="_blank">github.com/settings/tokens</a> 접속 (GitHub 로그인 필요)</li>
                <li><b>Generate new token → Generate new token (classic)</b> 클릭</li>
                <li>Note: 아무 이름(예: gantt-sync), Expiration: No expiration 권장</li>
                <li>권한(Scopes)은 <b>gist</b> 항목 하나만 체크</li>
                <li><b>Generate token</b> 클릭 → 나오는 토큰(ghp_로 시작)을 복사해서 잘 보관 (다시 볼 수 없음)</li>
            </ol>
            <b>2단계. 앱에서 동기화 실행</b>
            <ol style="margin:6px 0 14px 18px; padding:0;">
                <li>캘린더 탭에서 <b>🔗 자동 동기화</b> 버튼 클릭</li>
                <li>토큰 입력창이 뜨면 1단계에서 복사한 토큰 붙여넣기 (최초 1회만 물어봄)</li>
                <li>완료되면 주소창(https://gist.githubusercontent.com/...)이 표시됨 → 전체 복사</li>
            </ol>
            <b>3단계. 구글 캘린더에 등록 (최초 1회만)</b>
            <ol style="margin:6px 0 14px 18px; padding:0;">
                <li><a href="https://calendar.google.com" target="_blank">calendar.google.com</a> 접속</li>
                <li>왼쪽 사이드바 <b>다른 캘린더 옆 [+]</b> 클릭</li>
                <li><b>URL로 만들기</b> 선택</li>
                <li>2단계에서 복사한 주소 붙여넣고 <b>캘린더 추가</b></li>
            </ol>
            <b>이후에는?</b>
            <p style="margin:4px 0 14px;">데이터가 바뀔 때마다 <b>🔗 자동 동기화</b> 버튼만 다시 누르면 됩니다. 구글 캘린더 등록은 최초 1회만 하면 되고, 주소도 그대로 유지됩니다. 구글 쪽 반영은 보통 8~24시간 정도 걸릴 수 있습니다.</p>
            <p style="margin:4px 0 0; color:#e03131;">⚠️ 토큰은 비밀번호와 같으니 다른 사람과 공유하지 마세요. 이 링크(gist 주소)를 아는 사람은 누구나 일정 내용을 볼 수 있으니, 민감한 프로젝트라면 사용을 신중히 결정하세요.</p>`;
    }
};

// 💡 [주/월 공용] 셀 1개(하루) HTML 생성 — opts.otherMonth: 월 모드에서 흐리게, opts.tall: 주 모드 확대 셀
function calBuildDayCell(cellDate, eventsByDay, todayKey, selectedEvent, opts) {
    opts = opts || {};
    const key = calDateKey(cellDate);
    const dow = cellDate.getDay();
    const dayEvents = (eventsByDay[key] || []).slice().sort(function(a, b) { return a.end - b.end; });

    let cls = 'cal-day-cell';
    if (opts.otherMonth) cls += ' cal-other-month';
    if (key === todayKey) cls += ' cal-today';
    if (dow === 0) cls += ' cal-weekend-sun';
    if (dow === 6) cls += ' cal-weekend-sat';
    if (dow !== 0 && dow !== 6 && window.isHoliday && window.isHoliday(key)) cls += ' cal-weekend-sun';
    if (opts.tall) cls += ' cal-day-cell-tall';

    const chipCount = dayEvents.length;
    const MAX_CHIPS = opts.tall ? 40 : (chipCount > 5 ? 10 : 5);
    const shown = dayEvents.slice(0, MAX_CHIPS);
    const gridCls = chipCount > 5 ? 'chips-double' : 'chips-single';

    const chipsHtml = '<div class="cal-chips-grid ' + gridCls + '">'
        + shown.map(function(ev) {
            const isSel = (window.calState.selectedIdx === ev.idx);
            let chipCls = 'cal-event-chip' + calStatusCls(ev.status);
            if (ev.alarm) chipCls += ' cal-alarm-on';
            if (isSel) chipCls += ' cal-selected';
            const bell = ev.alarm ? '📌' : '';
            return '<div class="' + chipCls + '" title="' + escapeHtml(ev.name) + '" onclick="event.stopPropagation(); window.calSelectEvent(' + ev.idx + ');">' + bell + escapeHtml(ev.name) + '</div>';
        }).join('')
        + '</div>';

    let barHtml = '';
    if (selectedEvent) {
        const sk = calTsToKey(selectedEvent.start), ek = calTsToKey(selectedEvent.end);
        if (key >= sk && key <= ek) {
            let barCls = 'cal-dur-bar';
            if (sk === ek) barCls += ' cal-dur-single';
            else if (key === sk) barCls += ' cal-dur-start';
            else if (key === ek) barCls += ' cal-dur-end';
            barHtml = '<div class="' + barCls + '"></div>';
        }
    }

    return '<div class="' + cls + '" onclick="window.calShowDayPopup(\'' + key + '\');">'
        + barHtml
        + '<span class="cal-day-num">' + cellDate.getDate() + '</span>'
        + chipsHtml
        + '</div>';
}

window.calRender = function() {
    window.calSyncLevelFilterUI(); // 💡 [드롭다운화] 탭을 열 때마다 트리거 버튼 강조 상태를 현재 필터와 맞춤
    const container = document.getElementById('cal-page');
    if (!container) return;
    const baseY = window.calState.year, baseM = window.calState.month;
    const events = calBuildEvents();
    const eventsByDay = {};
    events.forEach(function(ev) {
        const k = calTsToKey(ev.end); // 마감일 기준으로 캘린더에 표시
        (eventsByDay[k] = eventsByDay[k] || []).push(ev);
    });
    const todayKey = calDateKey(new Date());
    const selectedEvent = (window.calState.selectedIdx !== null) ? events.find(function(ev) { return ev.idx === window.calState.selectedIdx; }) : null;

    const headerLabel = document.getElementById('cal-header-label');
    const _calIsEn = window._currentLang === 'en';
    const _calMonthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const _calWeekdays = _calIsEn
        ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        : ['일','월','화','수','목','금','토'];

    // 💡 [주 단위 보기] 뷰 토글 버튼(월/주) 활성 상태 갱신
    const btnMonth = document.getElementById('cal-view-month-btn');
    const btnWeek = document.getElementById('cal-view-week-btn');
    const isWeekMode = window.calState.viewMode === 'week';
    if (btnMonth) btnMonth.classList.toggle('cal-view-btn-active', !isWeekMode);
    if (btnWeek) btnWeek.classList.toggle('cal-view-btn-active', isWeekMode);

    if (isWeekMode) {
        const anchorWeekStart = new Date(window.calState.weekStart || calGetWeekStart(new Date()));
        const fmtWeekLabel = function(ws) {
            const we = new Date(ws); we.setDate(we.getDate() + 6);
            return _calIsEn
                ? _calMonthNames[ws.getMonth()] + ' ' + ws.getDate() + ' - '
                  + (ws.getMonth() !== we.getMonth() ? _calMonthNames[we.getMonth()] + ' ' : '') + we.getDate() + ', ' + we.getFullYear()
                : ws.getFullYear() + '년 ' + (ws.getMonth() + 1) + '월 ' + ws.getDate() + '일 ~ '
                  + (ws.getMonth() !== we.getMonth() ? (we.getMonth() + 1) + '월 ' : '') + we.getDate() + '일';
        };
        if (headerLabel) headerLabel.textContent = fmtWeekLabel(anchorWeekStart);

        // 4주 렌더링 (현재 주 기준 앞 1주 / 현재 주 / 뒤 2주) — 월 5개월 보기와 동일한 컨셉
        let allWeekHtml = '';
        for (let wi = 0; wi < 4; wi++) {
            const ws = new Date(anchorWeekStart);
            ws.setDate(ws.getDate() + (wi - 1) * 7);
            const isCurrentWeek = (wi === 1);

            let cellsHtml = '';
            for (let c = 0; c < 7; c++) {
                const cellDate = new Date(ws);
                cellDate.setDate(cellDate.getDate() + c);
                cellsHtml += calBuildDayCell(cellDate, eventsByDay, todayKey, selectedEvent, { tall: true });
            }

            allWeekHtml += '<div class="cal-month-block cal-week-block' + (isCurrentWeek ? ' cal-month-current' : '') + '">'
                + '<div class="cal-month-title">' + fmtWeekLabel(ws) + '</div>'
                + '<div class="cal-grid-wrap">'
                + '<div class="cal-weekday-row">' + _calWeekdays.map(d => '<div>' + d + '</div>').join('') + '</div>'
                + '<div class="cal-body-row">' + cellsHtml + '</div>'
                + '</div>'
                + '</div>';
        }
        container.innerHTML = allWeekHtml;
        return;
    }

    if (headerLabel) headerLabel.textContent = _calIsEn
        ? _calMonthNames[baseM] + ' ' + baseY
        : baseY + '년 ' + (baseM + 1) + '월';

    // 5개월 렌더링 (현재 월 기준 앞 2개월 / 현재 월 / 뒤 2개월)
    let allHtml = '';
    for (let mi = 0; mi < 5; mi++) {
        let y = baseY, m = baseM + mi - 2;
        if (m < 0) { m += 12; y--; }
        if (m > 11) { m -= 12; y++; }

        const isCurrentMonth = (y === baseY && m === baseM);

        const first = new Date(y, m, 1);
        const startOffset = first.getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const monthLabel = _calIsEn
            ? _calMonthNames[m] + ' ' + y
            : y + '년 ' + (m + 1) + '월';

        let cellsHtml = '';
        for (let c = 0; c < totalCells; c++) {
            const dayNum = c - startOffset + 1;
            const cellDate = new Date(y, m, dayNum);
            const otherMonth = (dayNum < 1 || dayNum > daysInMonth);
            cellsHtml += calBuildDayCell(cellDate, eventsByDay, todayKey, selectedEvent, { otherMonth: otherMonth });
        }

        allHtml += '<div class="cal-month-block' + (isCurrentMonth ? ' cal-month-current' : '') + '">'
            + '<div class="cal-month-title">' + monthLabel + '</div>'
            + '<div class="cal-grid-wrap">'
            + '<div class="cal-weekday-row">' + _calWeekdays.map(d => '<div>' + d + '</div>').join('') + '</div>'
            + '<div class="cal-body-row">' + cellsHtml + '</div>'
            + '</div>'
            + '</div>';
    }

    container.innerHTML = allHtml;
};
