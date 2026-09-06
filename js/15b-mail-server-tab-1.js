// [분리됨] 원본: js/15-mail-attachment-tab.js 의 1429~3071행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 메일 서버 탭 기능 1/2
// =========================================================
// 🌐 메일 서버 탭 기능
// =========================================================

const MS_SERVER_URL = 'http://127.0.0.1:5000';
window._msResults   = [];
window._msCurrentIdx = -1;

// 💡 [메일 자동처리 ①] 자동수집 전용 큐 영속성 — 새로고침해도 검토 대기 목록 유지
const MS_QUEUE_STORAGE_KEY     = 'ms_pending_queue';
const MS_LAST_AUTO_FETCH_KEY   = 'ms_last_auto_fetch_at';

window._msSaveQueueToStorage = function() {
    try {
        // task/AI분석 실패 없이 원문만 있는 것도 포함, 최대 300건만 보관(용량 방어)
        const trimmed = (window._msResults || []).slice(-300);
        localStorage.setItem(MS_QUEUE_STORAGE_KEY, JSON.stringify(trimmed));
    } catch(e) { console.warn('큐 저장 실패:', e); }
};

window._msLoadQueueFromStorage = function() {
    try {
        const raw = localStorage.getItem(MS_QUEUE_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) {
            window._msResults = saved;
            if (typeof msRenderList === 'function') msRenderList(window._msResults);
        }
    } catch(e) { console.warn('큐 복원 실패:', e); }
};

// ─── 메일 서버 계정 상태 표시 + 초기값 세팅 ────────────────────
// 💡 [2026-08-31] POP3(메일 수신, 이 탭)와 SMTP(메일 발송, 알람 설정) 계정을 실제로 테스트해보니
//    같은 메일 계정(예: yhpark@kortek.co.kr)으로 둘 다 로그인된다 — 회사 메일함 하나를 프로토콜만
//    다르게 접근하는 구조라 당연한 결과. 그래서 여기서 따로 아이디/비번을 입력·저장받지 않고,
//    알람 설정(⚙️ 알람 설정 → 📧 이메일 알람 → 🖥️ 이메일 서버 설정)에 저장된 계정을 그대로 재사용한다.
window._msRefreshServerAccountStatus = function() {
    const el = document.getElementById('ms-account-status-text');
    if (!el) return;
    const _en = window._currentLang === 'en';
    const smtp = (window.loadAlarmSettings ? window.loadAlarmSettings() : {}).smtp || {};
    if (smtp.user && smtp.pass) {
        el.textContent = _en ? `✅ Mail account: ${smtp.user}` : `✅ 메일 계정: ${smtp.user}`;
        el.style.color = '#27ae60';
    } else {
        el.textContent = _en ? '⚠️ No mail account configured — set it up with the button on the right.' : '⚠️ 메일 계정이 설정되지 않았습니다 — 오른쪽 버튼으로 먼저 설정해주세요.';
        el.style.color = '#e67e22';
    }
};

// 알람 설정 모달을 열고 "📧 이메일 알람" 섹션을 강제로 펼쳐서 보여줌 (이미 펼쳐져 있어도 그대로 유지)
window.msOpenEmailServerSettings = function() {
    if (window.openAlarmSettings) window.openAlarmSettings();
    const sec = document.getElementById('sec-email');
    if (sec && sec.style.display === 'none' && window._toggleAlarmSection) window._toggleAlarmSection('sec-email');
};

    (function() {
    // 저장된 API 키 상태 표시 (선택된 AI 제공사 기준)
    const savedKey = window.getActiveAiKey();
    const keyInput  = document.getElementById('ms-personal-apikey');
    const keyStatus = document.getElementById('ms-key-status');
    if (savedKey && keyInput) {
        keyInput.value = savedKey;
        if (keyStatus) {
            keyStatus.textContent = '✅ 저장된 키 있음';
            keyStatus.style.color = '#28a745';
        }
    } else if (keyStatus) {
        keyStatus.textContent = window._currentLang === 'en' ? '⚠️ Please enter your API key' : '⚠️ API 키를 입력해주세요';
        keyStatus.style.color = '#e67e22';
    }
    // 날짜 기본값: 오늘 기준
    const today = new Date();
    const week  = new Date(today);
    const fmt   = d => d.toISOString().split('T')[0];
    const sd = document.getElementById('ms-start-date');
    const ed = document.getElementById('ms-end-date');
    if (sd) sd.value = fmt(today);
    if (ed) ed.value = fmt(today);
})();

// ─── 메일 가져오기 ───────────────────────────────────────
window.msFetchMail = async function() {
    // 💡 아이디/비번은 더 이상 이 탭에서 따로 입력받지 않고, 알람 설정(이메일 서버 설정)의 SMTP
    //    계정을 그대로 재사용한다 — 같은 메일 계정이 POP3(수신)/SMTP(발송) 둘 다에 로그인됨을 확인함.
    const smtp = (window.loadAlarmSettings ? window.loadAlarmSettings() : {}).smtp || {};
    const userid   = (smtp.user || '').trim();
    const password = smtp.pass || '';
    const startDate = document.getElementById('ms-start-date').value;
    const endDate   = document.getElementById('ms-end-date').value;

    if (!userid || !password) {
        alert('먼저 이메일 서버 계정을 설정해주세요 (⚙️ 이메일 서버 설정 버튼).');
        window.msOpenEmailServerSettings();
        return;
    }
    if (!startDate || !endDate) { alert('날짜를 선택해주세요.'); return; }

    // UI 초기화
    window._msAnalyzeCancelled = false;
    const _msEn0 = window._currentLang === 'en';
    document.getElementById('ms-status').textContent   = _msEn0 ? '📡 Connecting to server...' : '📡 서버에 연결 중...';
    document.getElementById('ms-progress').style.display = 'block';
    document.getElementById('ms-result-list').innerHTML = ''; document.getElementById('ms-list-header').style.display = 'none';
    document.getElementById('ms-batch-btn').style.display = 'none';
    document.getElementById('ms-batch-inbox-btn').style.display = 'none';
    document.getElementById('ms-prog-bar').style.width = '10%';
    document.getElementById('ms-prog-text').textContent = _msEn0 ? 'Fetching mails...' : '메일 가져오는 중...';

    try {
        // 1단계: 메일 수집
        const res = await fetch(`${MS_SERVER_URL}/fetch-mail`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
            mailUser:     userid,
            mailPw:       password,
            startDate,
            endDate,
            keyword:      document.getElementById('ms-keyword')?.value?.trim() || '',
            keywordFrom:  document.getElementById('ms-keyword-from')?.value?.trim() || '',
            keywordBody:  document.getElementById('ms-keyword-body')?.value?.trim() || '',
            maxCount:     500
            })
        });
        const data = await res.json();

        if (data.status !== 'success') throw new Error(data.message);

        document.getElementById('ms-prog-bar').style.width  = '30%';
        document.getElementById('ms-prog-text').textContent = _msEn0 ? `${data.count} collected — AI analyzing...` : `${data.count}개 수집 완료 — AI 분석 중...`;
        document.getElementById('ms-status').textContent    = _msEn0 ? `✅ ${data.count} mails collected` : `✅ ${data.count}개 메일 수집 완료`;
        document.getElementById('ms-result-count').textContent = data.count;

        // 💡 건별로 채워나갈 배열 (중단하더라도 여기까지 담긴 내용은 그대로 표시됨)
        window._msResults = [];
        document.getElementById('ms-list-header').style.display = 'block'; // 0개부터 바로 보여줌

        // 2단계: AI 분석 전 API 키 확인
        const apiKey = window.getActiveAiKey();
        if (!apiKey) {
            document.getElementById('ms-status').textContent = _msEn0 ? '✅ Mails collected (AI analysis skipped — API key not set)' : '✅ 메일 수집 완료 (AI 분석 생략 — API 키 미설정)';
            document.getElementById('ms-progress').style.display = 'none';
            document.getElementById('ms-list-header').style.display = 'block';
            document.getElementById('ms-batch-btn').style.display = 'block';
            document.getElementById('ms-batch-inbox-btn').style.display = 'block';
            // 수집된 메일을 분석 없이 목록에 표시 (AI 없이도 키워드 매칭 배지는 표시)
            const projectListNoAi = await window._msLoadProjectIndex();
            window._msResults = data.data.map((mail, i) => {
                const matched = window._msMatchProjects(mail, projectListNoAi);
                const projectTag = matched.length === 0 ? null
                    : matched.length === 1 ? { status: 'matched', candidates: matched }
                    : { status: 'ambiguous', candidates: matched };
                return {
                    idx: i, fileName: mail.fileName,
                    subject: mail.subject, sender: mail.sender, date: mail.date,
                    body: mail.body, project: window._msProjectTagLabel(projectTag), task: null,
                    _projectTag: projectTag,
                    selected: false, registered: false, error: 'API키 미설정'
                };
            });
            if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 미분류 배지 갱신
            msRenderList(window._msResults);
            return;
        }

        // 💡 [매칭/점수 통일화] 자동틱과 동일하게, 분석 루프 시작 전 프로젝트 인덱스·우선순위 설정을 1회 로드
        // 💡 [2026-08-29 신규] "완료" 표시된 프로젝트는 여기서 미리 걸러서(_msFilterCandidateProjects),
        //    아래 candidatesForAI(AI 직접매칭 후보)에도, 키워드 배지 표시용 _msMatchProjects 호출에도
        //    처음부터 안 들어가게 한다.
        const projectList    = window._msFilterCandidateProjects(await window._msLoadProjectIndex());
        const priorityConfig = await window.loadPriorityConfig();

        // 2단계: 각 메일 AI 분석 (파일첨부 탭과 동일 로직) — 1건씩 완료될 때마다 화면 갱신
        for (let i = 0; i < data.data.length; i++) {
            if (window._msAnalyzeCancelled) {
                document.getElementById('ms-prog-text').textContent = _msEn0 ? `⏹ Stopped (${i}/${data.data.length} analyzed)` : `⏹ 중단됨 (${i}/${data.data.length}건 분석 완료)`;
                break;
            }

            const mail = data.data[i];
            document.getElementById('ms-prog-bar').style.width =
                `${30 + Math.round((i / data.data.length) * 65)}%`;
            document.getElementById('ms-prog-text').textContent =
                (_msEn0 ? `AI analyzing... ${i+1}/${data.data.length} — ${mail.subject.substring(0,20)}` : `AI 분석 중... ${i+1}/${data.data.length} — ${mail.subject.substring(0,20)}`);

            let item;
            try {
                // 💡 [AI 직접 매칭] 키워드 사전매칭 없이, 활성 프로젝트 전체를 후보로 AI에게 넘겨 판단시킴
                const candidatesForAI = projectList.length ? projectList : null;

                const task = await msCallGemini(apiKey, {
                    subject: mail.subject,
                    sender:  mail.sender,
                    to:      mail.to,   // 💡 [2026-09-06 신규] 본문에 "수신:" 줄이 없을 때의 폴백 근거
                    cc:      mail.cc,
                    date:    mail.date,
                    body:    mail.body,
                    fileName: mail.fileName
                }, candidatesForAI, null);

                // 💡 AI가 반환한 매칭신뢰도/주매칭프로젝트번호로 최종 확정 (mf/자동틱과 동일 공용 헬퍼)
                const projectTag = window._msResolveAiProjectMatch(task, candidatesForAI);

                // 💡 [매칭/점수 통일화] 규칙점수(직급/외부/긴급키워드/수신방식/중요도) + AI점수(마감임박도/업무영향도) 합산
                const scoreResult = task ? window._msComputeTotalScore(mail, task, priorityConfig) : null;

                item = {
                    idx: i, fileName: mail.fileName,
                    subject: mail.subject, sender: mail.sender, date: mail.date,
                    body: mail.body,
                    // 💡 [2026-08-24 버그 수정] 이 필드가 없어서 "⚡ 선택항목 연속등록"(AR.batchInsert)이
                    //    r.mailRaw를 못 찾고 엉뚱한(직접입력 탭 전용) window._mailParsedRaw로 대체하려다
                    //    실패 → Gantt에 꽂힌 행에 _mailRaw가 안 남아 "📧 원문 보기" 버튼이 사라졌었다.
                    mailRaw: { subject: mail.subject, sender: mail.sender, date: mail.date, body2000: mail.body, fileName: mail.fileName },
                    project: window._msProjectTagLabel(projectTag), task,
                    _projectTag: projectTag,
                    _score: scoreResult ? scoreResult.total : null,
                    _scoreGrade: scoreResult ? window._msScoreGrade(scoreResult.total, priorityConfig.cutline) : null,
                    _scoreBreakdown: scoreResult ? scoreResult.breakdown : null,
                    _alarmWorthy: !!(scoreResult && priorityConfig && scoreResult.total >= priorityConfig.cutline),
                    selected: !!task,
                    registered: false,
                    error: !task ? 'AI분석실패' : null,
                    matchReason: (task && task['매칭근거']) || '' // 💡 [2026-09-01 신규] "왜 이 프로젝트로(또는 미분류로) 판단했는지" AI 근거 — 미분류 큐에서 노출
                };
            } catch(e) {
                item = {
                    idx: i, fileName: mail.fileName,
                    subject: mail.subject, sender: mail.sender, date: mail.date,
                    body: mail.body,
                    mailRaw: { subject: mail.subject, sender: mail.sender, date: mail.date, body2000: mail.body, fileName: mail.fileName },
                    project: null, task: null,
                    selected: false, registered: false, error: e.message
                };
            }

            // 💡 1건 끝날 때마다 바로 목록에 반영 (진행상황 실시간 확인)
            // 💡 [최신 항목 상단 표시]
            window._msResults.unshift(item);
            const analyzedSoFar = window._msResults.filter(r => r.task).length;
            document.getElementById('ms-analyzed-count').textContent = analyzedSoFar;
            msRenderList(window._msResults);

            // 💡 [완전자동] mail_mode='full'이면 TaskInbox 대기 없이 바로 Gantt 등록 시도
            window._msTryFullAutoRegister(item,
                { subject: mail.subject, sender: mail.sender, date: mail.date, body2000: mail.body, fileName: mail.fileName },
                () => msRenderList(window._msResults));

            if (i < data.data.length - 1 && !window._msAnalyzeCancelled) await new Promise(r => setTimeout(r, 4000));
        }

        document.getElementById('ms-prog-bar').style.width  = '100%';
        document.getElementById('ms-prog-text').textContent = window._msAnalyzeCancelled ? (_msEn0 ? '⏹ Stopped (results so far shown below)' : '⏹ 중단됨 (아래는 여기까지 분석된 내용)') : (_msEn0 ? 'Analysis complete!' : '분석 완료!');
        document.getElementById('ms-progress').style.display = 'none';
        document.getElementById('ms-list-header').style.display = 'block';
        document.getElementById('ms-batch-btn').style.display   = 'block';
        document.getElementById('ms-batch-inbox-btn').style.display = 'block';
        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 미분류 배지 갱신

    } catch(e) {
        document.getElementById('ms-status').textContent = (_msEn0 ? `❌ Error: ${e.message}` : `❌ 오류: ${e.message}`);
        document.getElementById('ms-progress').style.display = 'none';
        // 💡 오류가 나도, 그 전까지 수집/분석된 내용이 있으면 화면에 표시
        if (window._msResults && window._msResults.length) {
            document.getElementById('ms-list-header').style.display = 'block';
            document.getElementById('ms-batch-btn').style.display   = 'block';
            document.getElementById('ms-batch-inbox-btn').style.display = 'block';
            msRenderList(window._msResults);
            if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 미분류 배지 갱신
        }
    }
};

// ─── [메일 자동처리 ②] Stage 0 룰 필터 — AI 호출 전 걸러내기 ──
// 💡 [2026-08-20] 하드코딩 상수는 "최초 기본값"으로만 쓰고, 실제 판정은 localStorage에 저장된
//    규칙(사용자가 📬 미분류/신규발신자 UI에서 추가·삭제 가능)을 우선 사용하도록 변경.
const MS_AUTO_SUBJECT_KW_DEFAULT = [
    'automatic reply', 'auto reply', 'auto-reply', 'out of office',
    '부재중', '자동회신', '[광고]', '[ad]', 'unsubscribe', 'do not reply'
];
const MS_NOREPLY_PATTERNS_DEFAULT = ['noreply', 'no-reply', 'donotreply', 'mailer-daemon', 'postmaster'];
const MS_NEW_SENDER_QUEUE_KEY = 'ms_new_sender_queue';
const MS_DISCARD_QUEUE_KEY = 'ms_discard_queue';
const MS_FILTER_RULES_KEY = 'ms_filter_rules';

// 💡 관리 가능한 필터 규칙 3종: 제목 키워드 차단 / 발신자 패턴 차단(noreply류) / 발신자 도메인 완전차단(신규 추가)
window._msGetFilterRules = function() {
    try {
        const saved = JSON.parse(localStorage.getItem(MS_FILTER_RULES_KEY) || 'null');
        if (saved && Array.isArray(saved.subjectKeywords) && Array.isArray(saved.noreplyPatterns) && Array.isArray(saved.blockedDomains)) {
            return saved;
        }
    } catch(e) {}
    return { subjectKeywords: MS_AUTO_SUBJECT_KW_DEFAULT.slice(), noreplyPatterns: MS_NOREPLY_PATTERNS_DEFAULT.slice(), blockedDomains: [] };
};
window._msSaveFilterRules = function(rules) {
    localStorage.setItem(MS_FILTER_RULES_KEY, JSON.stringify(rules));
    window._msScheduleFilterRulesDriveSync(rules); // 💡 회사/집 등 다른 PC에서도 같은 규칙이 적용되도록 팀 공용 Drive에도 반영
};
// 💡 [자동 등록] 검토 큐(폐기/신규발신자)에서 "이 조건으로 앞으로도 자동 걸러줘" 클릭 시 호출 —
//    type: 'subjectKeywords'|'noreplyPatterns'|'blockedDomains'
window._msAddFilterRule = function(type, value) {
    const v = String(value || '').trim();
    if (!v) return false;
    const rules = window._msGetFilterRules();
    const listLower = rules[type].map(x => x.toLowerCase());
    if (listLower.includes(v.toLowerCase())) return false; // 중복
    rules[type].push(v);
    window._msSaveFilterRules(rules);
    return true;
};

// ═══════════════════════════════════════════════════════════
// ☁️ [자동폐기 필터 규칙 — 팀 공용 Drive 동기화]
//    이전엔 localStorage에만 저장돼 "회사 PC에서 차단 도메인 등록해도 집 PC엔 없음" 문제가 있었음.
//    AddressBook과 동일한 패턴: localStorage를 빠른 로컬 캐시로 계속 쓰되(동기 호출부 변경 불필요),
//    저장할 때마다 디바운스로 Drive에도 올리고, Drive 연동 시점에 팀 최신본과 로컬을 합쳐서 복원.
// ═══════════════════════════════════════════════════════════
const MS_FILTER_RULES_DRIVE_FILENAME = 'MailFilterRules_Shared.json';
window._msFilterRulesDriveFileId = null;
window._msFilterRulesSyncTimer = null;

window._msScheduleFilterRulesDriveSync = function(rules) {
    if (window._msFilterRulesSyncTimer) clearTimeout(window._msFilterRulesSyncTimer);
    window._msFilterRulesSyncTimer = setTimeout(function() { window._msSyncFilterRulesToDrive(rules); }, 3000);
};

window._msSyncFilterRulesToDrive = async function(rules) {
    try {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return; // 비로그인: localStorage 단독 동작 (다음 Drive 연동 시 자동 병합됨)
        const folderId = await window.getOrCreateConfigFolder(token);
        if (!window._msFilterRulesDriveFileId) window._msFilterRulesDriveFileId = await window._findOrMigrateFile(token, MS_FILTER_RULES_DRIVE_FILENAME, folderId);
        const boundary = 'ms_filter_rules_boundary';
        const metadata = { name: MS_FILTER_RULES_DRIVE_FILENAME, mimeType: 'application/json' };
        if (!window._msFilterRulesDriveFileId) metadata.parents = [folderId];
        const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                   + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(rules)
                   + "\r\n--" + boundary + "--";
        const url = 'https://www.googleapis.com/upload/drive/v3/files' + (window._msFilterRulesDriveFileId ? '/' + window._msFilterRulesDriveFileId : '') + '?uploadType=multipart&supportsAllDrives=true';
        const resp = await fetch(url, { method: window._msFilterRulesDriveFileId ? 'PATCH' : 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, body: body });
        const file = await resp.json();
        if (file && file.id) window._msFilterRulesDriveFileId = file.id;
    } catch(e) { console.warn('자동폐기 필터 규칙 Drive 동기화 실패:', e.message); }
};

// 💡 Drive 연동 후 호출 — 팀 공용 규칙과 로컬 규칙을 합집합으로 병합해 로컬 캐시 갱신
//    (다른 PC에서 등록한 규칙도 반영되고, 이 PC에서만 등록했던 규칙도 유실되지 않음)
window.loadFilterRulesFromDrive = async function() {
    try {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return null;
        const folderId = await window.getOrCreateConfigFolder(token);
        if (!window._msFilterRulesDriveFileId) window._msFilterRulesDriveFileId = await window._findOrMigrateFile(token, MS_FILTER_RULES_DRIVE_FILENAME, folderId);
        if (!window._msFilterRulesDriveFileId) return null;
        const response = await gapi.client.drive.files.get({ fileId: window._msFilterRulesDriveFileId, alt: 'media', supportsAllDrives: true });
        const remote = response.result;
        if (!remote || !Array.isArray(remote.subjectKeywords)) return null;

        const local = window._msGetFilterRules();
        const mergeUnique = function(a, b) {
            const seen = new Set(a.map(function(x) { return x.toLowerCase(); }));
            const out = a.slice();
            b.forEach(function(x) { if (!seen.has(x.toLowerCase())) { seen.add(x.toLowerCase()); out.push(x); } });
            return out;
        };
        const merged = {
            subjectKeywords: mergeUnique(remote.subjectKeywords || [], local.subjectKeywords || []),
            noreplyPatterns: mergeUnique(remote.noreplyPatterns || [], local.noreplyPatterns || []),
            blockedDomains:  mergeUnique(remote.blockedDomains  || [], local.blockedDomains  || [])
        };
        localStorage.setItem(MS_FILTER_RULES_KEY, JSON.stringify(merged)); // 💡 직접 저장 — _msSaveFilterRules를 쓰면 다시 Drive 업로드가 예약되어 불필요한 왕복이 생김
        return merged;
    } catch(e) { console.warn('자동폐기 필터 규칙 Drive 조회 실패:', e.message); return null; }
};

window._msParseSenderEmail = function(senderStr) {
    const m = String(senderStr || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0].toLowerCase() : '';
};

// 💡 [버그 수정] 예전엔 "지금 열려있는 시트"의 tabData.addressBook(프로젝트 파일에 박혀있는
//    스냅샷 — 마지막 저장 시점 이후로 갱신 안 됨)만 봐서, 다른 프로젝트/최근에 주소록에 추가된
//    사람의 도메인이 반영 안 돼 "신규발신자"로 오탐되는 경우가 많았음. 주소록은 프로젝트와
//    무관한 공용 단일 소스(window.AddressBook)이므로 그걸 기준으로 삼는다.
window._msGetWhitelistDomains = function() {
    const ab = (window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : ((window.tabData || {}).addressBook || []);
    const domains = new Set();
    ab.forEach(p => {
        const email = (p.email || '').toLowerCase();
        const at = email.indexOf('@');
        if (at !== -1) domains.add(email.slice(at + 1));
    });
    return domains;
};

// 반환: {action:'discard'|'new_sender'|'pass', reason:string}
window._msStage0Filter = function(mail) {
    const rules = window._msGetFilterRules();
    const subject = (mail.subject || '').toLowerCase();
    for (const kw of rules.subjectKeywords) {
        if (subject.includes(kw.toLowerCase())) return { action: 'discard', reason: 'subject_kw:' + kw };
    }

    const fromEmail = window._msParseSenderEmail(mail.sender);
    for (const p of rules.noreplyPatterns) {
        if (fromEmail.includes(p.toLowerCase())) return { action: 'discard', reason: 'noreply:' + p };
    }

    const domain = fromEmail.split('@')[1] || '';
    // 💡 [신규] 사용자가 직접 등록한 도메인 완전차단 목록 — 신규발신자 검토 후 "이 도메인 영구차단" 클릭으로 쌓임
    if (domain && rules.blockedDomains.some(d => d.toLowerCase() === domain)) {
        return { action: 'discard', reason: 'blocked_domain:' + domain };
    }

    const whitelist = window._msGetWhitelistDomains();
    // 💡 whitelist가 비어있을 때(주소록 미입력 또는 tabData 로딩 타이밍 이슈)도
    //    "통과"가 아니라 "신규발신자 보류"로 처리 — 안전한 기본값(fail-safe)
    if (!domain || !whitelist.has(domain)) {
        return { action: 'new_sender', reason: whitelist.size === 0 ? 'whitelist_empty' : 'unknown_domain:' + domain };
    }

    return { action: 'pass', reason: 'ok' };
};

window._msSaveNewSenderQueue = function(list) {
    try {
        const existing = JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]');
        // 💡 [2026-08-24 방어선] fileName 기준으로 이미 있는 건 건너뛴다 — 호출부의 중복제거가 뚫려도
        //    여기서 한 번 더 막아서 같은 메일이 큐에 여러 번 쌓이는 사고를 방지.
        const existingNames = new Set(existing.map(r => r.fileName));
        const freshOnly = list.filter(function(r) { return !existingNames.has(r.fileName); });
        // 💡 [최신 항목 상단 표시] 새로 들어온 걸 앞에 두고, 200건 넘으면 뒤(오래된 것)부터 잘라냄
        const merged = freshOnly.concat(existing).slice(0, 200);
        localStorage.setItem(MS_NEW_SENDER_QUEUE_KEY, JSON.stringify(merged));
    } catch(e) { console.warn('신규 발신자 큐 저장 실패:', e); }
};

// 💡 [신규] Stage0에서 'discard'(자동폐기) 판정된 메일도 조용히 버리지 않고 로그로 남겨서
//    나중에 "혹시 잘못 걸러진 게 있는지" 검토할 수 있게 함 (기존엔 카운트만 하고 내용은 사라졌음)
window._msSaveDiscardQueue = function(list) {
    try {
        const existing = JSON.parse(localStorage.getItem(MS_DISCARD_QUEUE_KEY) || '[]');
        // 💡 [2026-08-24 방어선] fileName 기준으로 이미 있는 건 건너뛴다 — 백엔드가 날짜 단위로만 필터링해서
        //    같은 날 안에서 자동틱이 돌 때마다 이미 폐기한 메일을 다시 만나 또 쌓는 사고가 있었음(원인은
        //    _autoMailFetchTick의 중복확인 범위를 넓혀 고쳤지만, 여기서도 한 번 더 막아 이중 방어).
        const existingNames = new Set(existing.map(r => r.fileName));
        const freshOnly = list.filter(function(r) { return !existingNames.has(r.fileName); });
        const merged = freshOnly.concat(existing).slice(0, 200);
        localStorage.setItem(MS_DISCARD_QUEUE_KEY, JSON.stringify(merged));
    } catch(e) { console.warn('자동폐기 큐 저장 실패:', e); }
};

// ─── [메일 자동처리 ③] Stage 1 프로젝트 매칭 — project_index.json 대조 ──
const PROJECT_INDEX_FETCH_CACHE_MS = 5 * 60 * 1000; // 5분 캐시 — 자동틱마다 매번 Drive 조회 안 하도록
window._projectIndexCache = { data: null, at: 0 };

window._msLoadProjectIndex = async function() {
    const now = Date.now();
    if (window._projectIndexCache.data && (now - window._projectIndexCache.at) < PROJECT_INDEX_FETCH_CACHE_MS) {
        return window._projectIndexCache.data;
    }
    try {
        const tokenObj = gapi.client.getToken();
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token || !window.findProjectIndexFile) return [];
        const indexFileId = await window.findProjectIndexFile(token);
        if (!indexFileId) return [];
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const projects = (data && Array.isArray(data.projects)) ? data.projects : [];

        // 💡 [2026-08-27] 드라이브에서 프로젝트 파일이 삭제됐는데(앱의 "🗑️ 프로젝트 삭제"를 거치지
        //    않고 드라이브에서 직접 지웠거나, 이 정리 기능이 생기기 전에 지워진 경우) project_index.json
        //    엔 항목이 유령으로 남아있어서, 존재하지 않는 프로젝트로 메일이 계속 자동배치되는 문제가
        //    있었다. 실제 공용 폴더의 프로젝트 파일 목록과 대조해서, 더 이상 없는 파일을 가리키는
        //    항목은 후보에서 제외하고(당장 오배치를 막음) project_index.json에도 정리된 목록을 다시
        //    저장해서(유령 항목 영구 제거) 다음부터는 이 필터링 자체가 필요 없게 만든다.
        let validProjects = projects;
        try {
            const realFiles = await window._listProjectFiles();
            const validIds = new Set(realFiles.map(function(f) { return f.id; }));
            const ghostEntries = projects.filter(function(p) { return !p || !validIds.has(p.drive_file_id); });
            if (ghostEntries.length) {
                validProjects = projects.filter(function(p) { return p && validIds.has(p.drive_file_id); });
                console.warn('project_index.json에서 존재하지 않는 프로젝트 항목 ' + ghostEntries.length + '건 제거:',
                    ghostEntries.map(function(p) { return p && p.file_name; }));
                fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.assign({}, data, { projects: validProjects }))
                }).catch(function(e) { console.warn('project_index.json 유령 항목 정리 저장 실패(다음 로드에서 다시 시도됨):', e.message); });
            }
        } catch (e) { console.warn('project_index.json 유효성 검증 실패 — 원본 목록 그대로 사용:', e.message); }

        // 💡 [2026-09-06] 실사용 데이터 확인 결과 — Summary 탭에 인치를 채운 뒤 저장(buildProjectIndexEntry의
        //    파일명 폴백 포함)해야만 project_index.json의 inch가 갱신되는데, 그 프로젝트를 다시 저장하기
        //    전까지는 예전에 저장된 빈 inch("")가 그대로 남아있다(SHUFFLER 3.0"/4.3", POLED 등 대부분 해당 —
        //    STELLAR32만 우연히 Summary 탭에 인치를 채워놔서 비어있지 않았을 뿐). 그 결과 매칭 프롬프트
        //    (_msBuildProjectMatchSection)의 "(N인치)" 표시와 토픽 프로파일 뷰어 카드 제목 양쪽 다 인치가
        //    안 보여서, 모델명이 같은 형제 프로젝트를 구분할 근거가 사라진다. 원본 저장을 기다리지 않고
        //    "읽는 시점"에 즉석으로 파일명에서 보정해서, 재저장 전에도 항상 정확히 표시/매칭되게 한다.
        if (window._inchFromFileName) {
            validProjects.forEach(function(p) {
                if (p && !p.inch) p.inch = window._inchFromFileName(p.file_name) || '';
            });
        }

        window._projectIndexCache = { data: validProjects, at: now };
        return validProjects;
    } catch(e) { console.warn('project_index.json 로드 실패:', e); return []; }
};

// 메일 제목+본문과 각 프로젝트 keywords 배열 대조 → 매칭된 프로젝트 배열 반환 (0개/1개/N개)
// 💡 3자 미만 키워드(예: 인치값 "32" 단독)는 오탐 위험이 커서 매칭 대상에서 제외
const MS_MIN_KEYWORD_LEN = 3;

// 대소문자·앞뒤공백만 관대하게 비교 (완전히 다른 이름/오타는 여기서 못 잡음 — Summary 탭 안내문으로 예방)
window._msNamesMatch = function(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
};

// 💡 [2026-08-20][AI 직접 매칭 v3] 예전엔 키워드 사전매칭으로 프로젝트를 먼저 좁혀놓고 AI에겐
//    후보가 2개 이상일 때만 판단을 맡겼음 — project_index.json 키워드 목록이 실제 업무 언어를
//    못 따라가면(노후화) AI가 좋은 배경정보 없이 시작하는 구조적 병목이었음.
//    → 키워드 사전 게이트를 없애고, 활성 프로젝트 전체(보통 20~30개 수준, 프롬프트에 다 넣어도
//      토큰 부담 적음)를 매번 AI에게 후보로 주고 AI가 직접 판단(+신뢰도)하게 통일.
//    최종 판정은 window._msResolveAiProjectMatch(task, candidatesForAI)에서 신뢰도 기준으로 확정.
// 💡 [B안 통일화] 어디서 호출하든(자동/일괄/단건) 동일한 로직으로 AI 프롬프트에 넣을 후보 목록을 결정하는 공용 함수
window._msResolveMatchAndContext = async function(mail) {
    // 💡 [2026-08-29 신규] 파일첨부/직접입력 탭(mfCallGemini 경유)도 여기 하나만 거쳐가므로, "완료"
    //    표시된 프로젝트 제외를 여기서 한 번만 적용하면 이 경로 전체(파일첨부+직접입력)에 다 적용된다.
    const projectList = window._msFilterCandidateProjects(await window._msLoadProjectIndex());
    const candidatesForAI = projectList.length ? projectList : null;
    // 💡 사전에 확정된 매칭이 없으므로 배경정보(contextOverride)도 항상 null —
    //    AI가 후보 목록을 보고 스스로 판단한 뒤, 결과(매칭신뢰도)로 사후 확정한다.
    return { projectTag: null, candidatesForAI, contextOverride: null };
};

// 💡 AI가 반환한 매칭신뢰도/주매칭프로젝트번호로 최종 projectTag를 확정하는 공용 헬퍼.
//    신뢰도 "상"만 자동배치급 matched로 승격하고, 그 외(중/하)는 사람 확인이 필요한 ambiguous로 남긴다.
//    (ms/mf/자동틱 3곳의 중복 로직을 여기로 통일 — 한 곳만 고치면 전체에 적용됨)
// 💡 [복수 프로젝트 매칭] 주매칭이 "상"으로 확정된 경우에만, AI가 별도로 확신한 추가 프로젝트를
//    extraCandidates로 함께 반환한다. 주매칭 자체가 불확실(중/하)하면 그 위에 추가매칭을 얹지 않고
//    무시한다(불확실한 기준 위에 더 쌓지 않기 위한 안전장치). 폭주 방지를 위해 최대 2개까지만 허용.
window._msResolveAiProjectMatch = function(task, candidatesForAI) {
    if (!task || !candidatesForAI || !candidatesForAI.length) return null;
    const conf = task['매칭신뢰도'];
    const pickedIdx = parseInt(task['주매칭프로젝트번호'], 10);
    if (!conf || !pickedIdx) return null;
    const picked = (pickedIdx >= 1 && pickedIdx <= candidatesForAI.length) ? candidatesForAI[pickedIdx - 1] : null;
    if (!picked) return null;

    let extraCandidates = [];
    if (conf === '상' && Array.isArray(task['추가매칭프로젝트번호목록'])) {
        const seen = new Set([pickedIdx]);
        task['추가매칭프로젝트번호목록'].forEach(function(n) {
            if (extraCandidates.length >= 2) return; // 최대 2개(주매칭 포함 총 3개 프로젝트)까지만
            const idx = parseInt(n, 10);
            if (idx >= 1 && idx <= candidatesForAI.length && !seen.has(idx)) {
                seen.add(idx);
                extraCandidates.push(candidatesForAI[idx - 1]);
            }
        });
    }

    return conf === '상'
        ? { status: 'matched', candidates: [picked], extraCandidates: extraCandidates }
        : { status: 'ambiguous', candidates: [picked], extraCandidates: [] };
};

// 💡 [매칭/점수 통일화] projectTag({status,candidates}) → 리스트 배지에 쓸 표시용 문자열
window._msProjectTagLabel = function(projectTag) {
    if (!projectTag) return null;
    if (projectTag.status === 'matched') {
        const c = projectTag.candidates[0];
        const name = c.model || c.customer || '매칭됨';
        const extra = (projectTag.extraCandidates && projectTag.extraCandidates.length)
            ? ` (+${projectTag.extraCandidates.length}개 프로젝트 추가매칭)` : '';
        return name + (c.inch ? ` (${c.inch}인치)` : '') + extra;
    }
    return `❓후보 ${projectTag.candidates.length}개`;
};

// 💡 점수 등급 이모지 — 자동틱과 동일 기준(커트라인 이상 🔴 / 60% 이상 🟡 / 미만 ⚪)
window._msScoreGrade = function(total, cutline) {
    return total >= cutline ? '🔴' : (total >= cutline * 0.6 ? '🟡' : '⚪');
};

// 💡 [업무 담당구분] AI가 메일 분석 시 판정한 담당구분(예: "LCM")을 Summary 탭에 이미 등록된
//    프로젝트 멤버 필드로 매핑해서 실제 담당자 이름/이메일을 찾아준다.
//    - 고정 구분(PM/기구/HW/FW/BLU/TSP/LCM/Slimming/Cutting/Tooling)은 projectMeta 필드로 바로 매핑
//    - 자유 구분(영업/CS/FA 등)은 Summary "프로젝트 멤버-3(자유추가)"에서 역할명에 해당 키워드가
//      포함된 행을 찾아 사용 (자유추가는 역할명이 사람마다 다르게 입력되므로 키워드 포함 매칭)
window._MS_CATEGORY_FIELD_MAP = {
    'PM':       { name: '프로젝트담당자', email: '프로젝트담당자이메일' },
    '기구':     { name: '기구담당자',     email: '기구담당자이메일' },
    'HW':       { name: 'HW담당자',       email: 'HW담당자이메일' },
    'FW':       { name: 'FW담당자',       email: 'FW담당자이메일' },
    'BLU':      { name: 'Module담당자',   email: 'Module담당자이메일' },
    'TSP':      { name: 'TSP담당자',      email: 'TSP담당자이메일' },
    'LCM':      { name: 'LCM담당자',      email: 'LCM담당자이메일' },
    'Slimming': { name: 'Slimming담당자', email: 'Slimming담당자이메일' },
    'Cutting':  { name: 'Cutting담당자',  email: 'Cutting담당자이메일' },
    'Tooling':  { name: 'Tooling담당자',  email: 'Tooling담당자이메일' }
};
// 💡 [2026-08-25] "담당구분"이 이제 "HW, FW"처럼 콤마로 구분된 복수 값일 수 있음(메일 하나에
//    실질적으로 두 영역이 걸친 경우만 AI가 최대 2개까지 기재 — 프롬프트에서 엄격히 제한).
//    배지/담당자 표시는 여전히 "대표 담당자 한 명"이 필요하므로, 앞에서부터 순서대로 실제 등록된
//    담당자를 찾아 맨 처음 매칭되는 값을 대표로 반환한다(전부 미등록이면 null).
window._msResolveCategoryAssignee = function(category) {
    const raw = (category || '').toString().trim();
    if (!raw || raw === '미분류') return null;
    const parts = raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    const pm = window.projectMeta || {};
    const members3 = (window.tabData && window.tabData.projectMembers3) || [];
    for (let i = 0; i < parts.length; i++) {
        const cat = parts[i];
        const fixed = window._MS_CATEGORY_FIELD_MAP[cat];
        if (fixed) {
            const name = (pm[fixed.name] || '').toString().trim();
            if (name) return { category: cat, name: name, email: (pm[fixed.email] || '').toString().trim() };
        }
        // 자유추가 멤버(프로젝트 멤버-3)에서 역할명 키워드로 검색
        const hit = members3.find(function(m) { return m && m.role && m.role.indexOf(cat) !== -1 && m.name; });
        if (hit) return { category: cat, name: hit.name.toString().trim(), email: (hit.email || '').toString().trim() };
    }
    return null;
};

window._msFilterMyProjects = function(projectList) {
    const me = window.currentUserName || '';
    const mine = projectList.filter(p => window._msNamesMatch(p.assignee, me));
    if (mine.length === 0) {
        console.warn(`⚠️ [메일 자동처리] 담당자 필터 결과 0건 — currentUserName("${me}")과 일치하는 프로젝트 없음. ` +
            `Summary 탭 "프로젝트 담당자" 입력값 확인 필요. (전체 등록 프로젝트: ${projectList.length}개)`);
    }
    return mine;
};

// 💡 [버그B 수정] 키워드를 공백 기준 토큰으로 쪼개서, 순서 상관없이 토큰이 전부 들어있으면 매칭
//    예: 키워드 "4.3\" Shuffler" ↔ 본문 "Shuffler Display 4.3\"" → 어순 달라도 매칭됨
window._msKeywordMatches = function(haystack, kw) {
    const tokens = String(kw).toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    return tokens.every(t => haystack.includes(t));
};

// 💡 [2026-08-29 신규] "완료"로 표시된 프로젝트를 메일 매칭 후보에서 빼는 공용 필터 — 키워드 사전매칭
//    (_msMatchProjects, 바로 아래)과 AI 직접매칭(완전자동 tick / 파일첨부·메일서버 배치분석이 candidatesForAI를
//    만드는 지점, msCallGemini 호출 직전) 양쪽에서 공용으로 쓴다. 한 곳만 고치면 다른 경로가 여전히 완료
//    프로젝트를 후보로 넘겨서 오매칭이 재발할 수 있으므로, 매칭 후보 목록을 만드는 모든 지점에서 이 함수를
//    거치게 한다. [설정 → 메일 자동배치 설정 → 수집설정 → "완료 프로젝트도 수집 대상에 포함"]을 켜면 그대로 통과.
window._msFilterCandidateProjects = function(projectList) {
    const includeCompleted = !!(window.getMailAutoCollectCompleted && window.getMailAutoCollectCompleted());
    return includeCompleted ? (projectList || []) : (projectList || []).filter(function(p) { return !p.completed; });
};

window._msMatchProjects = function(mail, projectList) {
    const haystack = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
    // 💡 [버그A 수정] 담당자 필터를 여기서 제거 — 전체 프로젝트 대상으로 후보를 추림.
    //    "내 프로젝트가 아니면 후보에서 빠지는" 문제를 근본적으로 없앰.
    //    자동배치(완전자동) 시점에만 "내 담당인지"를 별도로 체크함(_autoMailFetchTick 참고)

    // 1차: 키워드 매칭 + 프로젝트별 매칭된 키워드 중 가장 긴(구체적인) 것 기록
    const scored = window._msFilterCandidateProjects(projectList)
        .map(p => {
            const matched = (p.keywords || []).filter(kw =>
                kw && String(kw).length >= MS_MIN_KEYWORD_LEN && window._msKeywordMatches(haystack, kw)
            );
            const maxLen = matched.reduce((m, kw) => Math.max(m, String(kw).length), 0);
            return { project: p, matched, maxLen };
        })
        .filter(s => s.matched.length > 0);

    if (scored.length <= 1) return scored.map(s => s.project);

    // 💡 [구체적 키워드 우선] 여러 프로젝트가 후보에 걸렸을 때, 가장 긴(구체적) 키워드로 매칭된
    //    후보만 남기고, 짧은/공용 키워드만 걸린 후보는 제외 — "SHUFFLER"(공용) 때문에
    //    "SHUFFLER 4.3"(구체적)까지 같이 ambiguous 되던 문제 해결
    const globalMax = Math.max(...scored.map(s => s.maxLen));
    const filtered = scored.filter(s => s.maxLen === globalMax);
    return filtered.map(s => s.project);
};

// ─── [⑥] 우선순위 점수 설정 UI ──
window.openPriorityConfigModal = async function() {
    const cfg = await window.loadPriorityConfig();
    let modal = document.getElementById('priority-config-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'priority-config-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="priority-config-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:300px;">
            <div id="priority-config-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span>⭐ 우선순위 점수 설정</span>
                <button onclick="document.getElementById('priority-config-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div style="overflow-y:auto; flex:1; padding:14px 18px;">
                <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">👤 직급별 점수</div>
                <div id="pc-title-rows" style="margin-bottom:14px;"></div>
                <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">🚨 긴급 키워드 사전</div>
                <div id="pc-keyword-rows" style="margin-bottom:6px;"></div>
                <button onclick="window._pcAddKeywordRow('', 5)" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:4px 10px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; margin-bottom:14px; transition:background .15s, border-color .15s;">+ 키워드 추가</button>
                <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin:10px 0 6px;">⚙️ 기타 점수</div>
                <div style="display:grid; grid-template-columns:1fr 60px; gap:6px 10px; align-items:center; font-size:12px; margin-bottom:14px;">
                    <span>외부(고객사) 발신 가산</span><input id="pc-external" type="number" style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
                    <span>To(직접수신) 가산</span><input id="pc-tome" type="number" style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
                    <span>Cc(참조) 가산</span><input id="pc-ccme" type="number" style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
                    <span>중요도 헤더(Outlook 높음) 가산</span><input id="pc-importance" type="number" style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
                </div>
                <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:6px;">🎯 커트라인 (이 점수 이상 🔴 긴급)</div>
                <input id="pc-cutline" type="number" min="0" max="100" style="width:80px; padding:5px 8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
            </div>
            <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px;">
                <button onclick="window._pcSave()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:6px 18px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">저장</button>
                <button onclick="document.getElementById('priority-config-modal').style.display='none'" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s;">닫기</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('priority-config-box', 'priority-config-drag');
        window._bindClickToFront('priority-config-modal');
    }

    window._pcCurrentConfig = cfg;
    window._pcRenderTitleRows(cfg.titleScores);
    window._pcRenderKeywordRows(cfg.urgentKeywords);
    document.getElementById('pc-external').value = cfg.externalCustomerScore;
    document.getElementById('pc-tome').value = cfg.toMeScore;
    document.getElementById('pc-ccme').value = cfg.ccMeScore;
    document.getElementById('pc-importance').value = cfg.importanceHighScore;
    document.getElementById('pc-cutline').value = cfg.cutline;

    modal.style.display = 'block';
    window.bringModalToFront('priority-config-modal');
};

window._pcRenderTitleRows = function(titleScores) {
    const box = document.getElementById('pc-title-rows');
    box.innerHTML = Object.keys(titleScores).map(title => `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:12px;">
            <span style="flex:1;">${title}</span>
            <input class="pc-title-score" data-title="${title}" type="number" value="${titleScores[title]}"
                style="width:60px; padding:3px 5px; border:1px solid #ccc; border-radius:4px;">
        </div>`).join('');
};

window._pcAddKeywordRow = function(word, score) {
    const box = document.getElementById('pc-keyword-rows');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';
    row.innerHTML = `
        <input class="pc-kw-word" type="text" value="${word}" placeholder="키워드"
            style="flex:1; padding:4px 7px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
        <input class="pc-kw-score" type="number" value="${score}"
            style="width:55px; padding:4px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
        <button onclick="this.parentElement.remove()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:11px; transition:background .15s, border-color .15s;">🗑</button>`;
    box.appendChild(row);
};

window._pcRenderKeywordRows = function(urgentKeywords) {
    document.getElementById('pc-keyword-rows').innerHTML = '';
    (urgentKeywords || []).forEach(kw => window._pcAddKeywordRow(kw.word, kw.score));
};

window._pcSave = async function() {
    const titleScores = {};
    document.querySelectorAll('.pc-title-score').forEach(el => {
        titleScores[el.dataset.title] = parseInt(el.value, 10) || 0;
    });
    const urgentKeywords = [];
    document.querySelectorAll('#pc-keyword-rows > div').forEach(row => {
        const word = row.querySelector('.pc-kw-word').value.trim();
        const score = parseInt(row.querySelector('.pc-kw-score').value, 10) || 0;
        if (word) urgentKeywords.push({ word, score });
    });
    const newConfig = {
        titleScores,
        urgentKeywords,
        externalCustomerScore: parseInt(document.getElementById('pc-external').value, 10) || 0,
        toMeScore: parseInt(document.getElementById('pc-tome').value, 10) || 0,
        ccMeScore: parseInt(document.getElementById('pc-ccme').value, 10) || 0,
        importanceHighScore: parseInt(document.getElementById('pc-importance').value, 10) || 0,
        cutline: Math.max(0, Math.min(100, parseInt(document.getElementById('pc-cutline').value, 10) || 50))
    };
    const ok = await window.savePriorityConfig(newConfig);
    if (window.showToast) {
        window.showToast(ok ? '✅ 우선순위 점수 설정이 저장되었습니다.' : '⚠️ 저장 실패 (콘솔 확인)', ok ? 'info' : 'error');
    }
    if (ok) document.getElementById('priority-config-modal').style.display = 'none';
};

// ─── [메일 자동처리 ④] 우선순위 점수 — 규칙(직급/외부고객/긴급키워드/커스텀키워드/수신방식/중요도헤더) + AI(마감임박도/업무영향도) ──
const MS_INTERNAL_DOMAIN = 'kortek.co.kr';
const MS_CUSTOM_KEYWORD_SCORE = 7;

window._msFindSenderTitle = function(senderStr) {
    const email = window._msParseSenderEmail(senderStr);
    const ab = (window.tabData || {}).addressBook || [];
    const found = ab.find(p => (p.email || '').toLowerCase() === email);
    return found ? (found.title || found.직함 || '') : '';
};

window._msComputeRuleScore = function(mail, priorityConfig) {
    let score = 0;
    const breakdown = {};

    const title = window._msFindSenderTitle(mail.sender);
    if (title && priorityConfig.titleScores[title]) {
        breakdown.title = priorityConfig.titleScores[title];
        score += breakdown.title;
    }

    const fromEmail = window._msParseSenderEmail(mail.sender);
    const domain = fromEmail.split('@')[1] || '';
    if (domain && domain !== MS_INTERNAL_DOMAIN) {
        breakdown.external = priorityConfig.externalCustomerScore;
        score += breakdown.external;
    }

    const haystack = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
    let urgentScore = 0;
    (priorityConfig.urgentKeywords || []).forEach(kw => {
        if (kw.word && haystack.includes(String(kw.word).toLowerCase())) urgentScore += (kw.score || 0);
    });
    if (urgentScore) { breakdown.urgentKeywords = urgentScore; score += urgentScore; }

    if (mail.isToMe) { breakdown.recipient = priorityConfig.toMeScore; score += priorityConfig.toMeScore; }
    else if (mail.isCcMe) { breakdown.recipient = priorityConfig.ccMeScore; score += priorityConfig.ccMeScore; }

    if (mail.importance) { breakdown.importanceHeader = priorityConfig.importanceHighScore; score += priorityConfig.importanceHighScore; }

    return { score, breakdown };
};

window._msComputeTotalScore = function(mail, task, priorityConfig) {
    const rule = window._msComputeRuleScore(mail, priorityConfig);
    const deadline = task && task.마감일임박도 ? parseInt(task.마감일임박도, 10) || 0 : 0;
    const impact = task && task.업무영향도 ? parseInt(task.업무영향도, 10) || 0 : 0;
    const total = Math.max(0, Math.min(100, rule.score + deadline + impact));
    return { total, breakdown: Object.assign({}, rule.breakdown, { deadline, impact }) };
};

// ─── [완전자동] 커트라인 이상 → Gantt 자동배치 + 알림 자동설정 ──
//    기존 "다른 프로젝트로 전송"(inboxDistExecute) 로직을 헤드리스로 재구성 — DOM 의존 없음
window._msAutoRegisterToProject = async function(uid, task, driveFileId, fileName, mailRaw, attempt, setAlarm) {
    try {
        // 💡 지금 브라우저에 열려있는 바로 그 프로젝트면, Drive 직접쓰기 대신 화면(globalData)에 바로 꽂고
        //    즉시 저장 — 헤드리스로 Drive만 건드리면 화면이 예전 상태로 남아있다가, 사용자가 저장할 때
        //    방금 자동배치한 내용이 통째로 덮어써져서 사라지는 심각한 문제가 생김
        if (driveFileId === window.currentDriveFileId && globalData && globalData.length) {
            try {
                const l0s = window.buildL0SectionInfo(globalData, colIdx);
                const chosenL0 = window.pickL0SectionByDate(l0s, task['시작일'] || '') || '__END__';
                const built = window.buildMailTaskRow(task, undefined, undefined, mailRaw);
                if (setAlarm) built.row._알림 = true;
                const posInfo = window.computeL0InsertPos(globalData, colIdx, chosenL0, task['시작일'], true);
                const pos = posInfo.pos;
                if (chosenL0 !== '__END__' && colIdx.devStage !== -1) built.row[colIdx.devStage] = chosenL0;
                globalData.splice(pos, 0, built.row);
                logChange(pos, -1, "없음", `메일 자동처리(완전자동)로 배치: ${built.taskName}`);
                window.recalculateSchedules();
                if (window.renderGantt) window.renderGantt();
                // ✅ [A: 토픽 자동갱신] AI 업무 5개 추가마다 현재 프로젝트 프로파일 백그라운드 재생성
                if (window._tpCheckAutoRegen) window._tpCheckAutoRegen();
                await window.saveToGoogleDrive(); // 💡 화면에 즉시 반영 + 곧바로 Drive 저장까지
                return { ok: true, label: posInfo.previewLabel, targetL0: chosenL0 };
            } catch (e) { return { ok: false, reason: 'current_project_insert_failed: ' + e.message }; }
        }

        const tokenObj = gapi.client.getToken();
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return { ok: false, reason: 'no_token' };

        const metaResp    = await gapi.client.drive.files.get({ fileId: driveFileId, fields: 'modifiedTime', supportsAllDrives: true });
        const contentResp = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media', supportsAllDrives: true });
        const saveData = contentResp.result;
        if (!saveData || !saveData.globalData || !saveData.colIdx) return { ok: false, reason: 'bad_structure' };

        const rows = saveData.globalData.map(function(obj) {
            let row = obj.data;
            for (let k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        window.computeCalcDatesForRows(rows.slice(1), saveData.colIdx);

        const l0s = window.buildL0SectionInfo(rows, saveData.colIdx);
        const chosenL0 = window.pickL0SectionByDate(l0s, task['시작일'] || '') || '__END__';

        const built = window.buildMailTaskRow(task, rows, saveData.colIdx, mailRaw);
        if (setAlarm) built.row._알림 = true; // 💡 커트라인 이상일 때만 자동알람(D-7/3/1) 대상으로 설정

        const posInfo = window.computeL0InsertPos(rows, saveData.colIdx, chosenL0, task['시작일'], true);
        const pos = posInfo.pos;
        if (chosenL0 !== '__END__' && saveData.colIdx.devStage !== -1) {
            built.row[saveData.colIdx.devStage] = chosenL0;
        }
        rows.splice(pos, 0, built.row);

        const nowIso = new Date().toISOString();
        const userName = window.currentUserName || '비로그인 (로컬)';
        saveData.distributions = saveData.distributions || [];
        const distUid = 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        saveData.distributions.push({
            uid: distUid, inboxUid: uid,
            task: JSON.parse(JSON.stringify(task)),
            taskName: built.taskName, targetL0: chosenL0,
            insertedAt: nowIso, by: userName, source: '메일자동처리(커트라인)', processed: false
        });
        saveData.changeLogs = saveData.changeLogs || [];
        saveData.changeLogs.push({
            time: new Date().toLocaleString('ko-KR'), userName: userName,
            rowName: pos, colName: '행 조작', oldVal: '없음',
            newVal: `메일 자동처리(커트라인)로 자동 배치: ${built.taskName}`
        });

        saveData.globalData = rows.map(function(row) {
            let o = { data: Array.from(row) };
            for (let k in row) { if (k.startsWith('_')) o[k] = row[k]; }
            return o;
        });

        // 💡 충돌 검사 — PATCH 직전 재확인, 충돌 시 1회만 재시도
        const checkResp = await gapi.client.drive.files.get({ fileId: driveFileId, fields: 'modifiedTime', supportsAllDrives: true });
        if (checkResp.result.modifiedTime !== metaResp.result.modifiedTime) {
            if ((attempt || 0) >= 1) return { ok: false, reason: 'conflict_retry_exhausted' };
            return await window._msAutoRegisterToProject(uid, task, driveFileId, fileName, mailRaw, (attempt || 0) + 1, setAlarm);
        }

        const boundary = 'ms_auto_register_boundary';
        const metadata = { name: fileName, mimeType: 'application/json' };
        const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                   + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(saveData)
                   + "\r\n--" + boundary + "--";
        const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + driveFileId + '?uploadType=multipart&supportsAllDrives=true', {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
            body: body
        });
        const file = await resp.json();
        if (resp.ok && file && file.id) return { ok: true, label: posInfo.previewLabel, targetL0: chosenL0 };
        return { ok: false, reason: 'upload_failed' };
    } catch (e) { return { ok: false, reason: e.message }; }
};

// 💡 [복수 프로젝트 매칭] 같은 메일 업무를 여러 프로젝트에 각각 등록할 때 공용으로 쓰는 헬퍼.
//    "한 uid가 여러 프로젝트를 가리키는" 구조 변경 대신, 프로젝트마다 독립된 TaskInbox 항목(uid)을 만들어
//    각자 상태/이력을 따로 추적한다(기존 "uid=1건=1프로젝트" 설계를 그대로 유지). targets[0]이 주매칭, 나머지가
//    AI가 "상" 신뢰도로 확신한 추가매칭(최대 2개, _msResolveAiProjectMatch에서 이미 캡 걸림).
//    onEachDone(target, result, idx)는 대상 하나가 끝날 때마다(성공/실패 무관) 호출됨.
window._msRegisterToProjectTargets = function(targets, task, mailRawObj, sourceLabel, alarmWorthy, historyType, onEachDone) {
    targets.forEach(function(target, idx) {
        if (!target || !target.drive_file_id) { if (onEachDone) onEachDone(target, { ok: false, reason: 'no_drive_file_id' }, idx); return; }
        const isExtra = idx > 0;
        window.TaskInbox.add(task, {
            source: isExtra ? `${sourceLabel} [추가매칭: ${target.model || target.customer || target.file_name}]` : sourceLabel,
            mailRaw: mailRawObj,
            matchedProject: { status: 'matched', candidates: [target] },
            alarmWorthy: !!alarmWorthy
        });
        const newUid = window.TaskInbox.load()[0].uid; // add()는 unshift라 항상 맨 앞이 방금 추가한 항목
        window._msAutoRegisterToProject(newUid, task, target.drive_file_id, target.file_name, mailRawObj, 0, !!alarmWorthy)
            .then(function(result) {
                if (result.ok) {
                    window.TaskInbox.setStatus(newUid, '자동배치됨', { type: historyType, target: target.file_name, at: new Date().toISOString() });
                    // ✅ [토픽 신호] 배치 성공 → 해당 프로젝트의 topicKeywords Drive 갱신 (30초 디바운스)
                    //    PC가 꺼져도 Drive에 남아있어 다른 사용자도 혜택을 받음
                    if (window._tpAppendMailSignal) window._tpAppendMailSignal(target.drive_file_id, task, mailRawObj);
                } else {
                    console.warn('[메일 자동처리] 자동배치 실패, TaskInbox 대기 상태로 유지:', result.reason);
                }
                if (onEachDone) onEachDone(target, result, idx);
            });
    });
};

// 💡 [완전자동] mail_mode='full'이면 메일서버/파일첨부 탭(수동 분석)도 자동틱과 동일 기준으로
//    TaskInbox 대기 없이 바로 Gantt에 등록 — 매칭 확정(단일후보) + 내 담당 + 날짜확정일 때만.
//    (그 외엔 기존처럼 TaskInbox '대기'로 쌓여서, 사람이 [✅매칭전송]/[📤다른 프로젝트]로 직접 처리)
//    💡 [복수 프로젝트 매칭] AI가 "상" 신뢰도로 확신한 추가 프로젝트가 있으면(item._projectTag.extraCandidates)
//    같은 업무를 그 프로젝트들에도 각각 독립적으로 등록한다(최대 총 3개 프로젝트).
//    반환: true면 완전자동 처리를 "시도"함(성공여부는 비동기), false면 조건 미충족으로 건너뜀
window._msTryFullAutoRegister = function(item, mailRawObj, onDone) {
    const taskName = (item && item.task && item.task['업무명']) || '(제목없음)';
    const skip = function(reason) { console.info(`[메일 완전자동] 건너뜀 (${reason}): "${taskName}"`); return false; };

    if (!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled())) return skip('완전자동 모드 아님');
    if (!item || !item.task) return skip('AI 분석 결과 없음');
    if (!item._projectTag || item._projectTag.status !== 'matched') return skip(`매칭 미확정(status=${item._projectTag ? item._projectTag.status : '없음'})`);
    const primary = (item._projectTag.candidates || [])[0];
    if (!primary || !primary.drive_file_id) return skip('매칭 후보에 drive_file_id 없음');
    const hasValidDate = !String(item.task['시작일'] || '').includes('날짜확인필요')
        && !String(item.task['완료일'] || '').includes('날짜확인필요');
    if (!hasValidDate) return skip('날짜확인필요 상태');
    // 💡 [정책 변경] 완전자동은 "내 담당" 여부와 무관하게, 매칭이 단일 확정되면 그 프로젝트로 바로 배치한다.
    //    TaskInbox(업무 보관함)는 매칭 자체가 안 된(프로젝트 미등록/미분류) 업무만 남기는 용도로 좁힌다.

    const extraTargets = (item._projectTag.extraCandidates || []).filter(function(t) { return t && t.drive_file_id; });
    const targets = [primary].concat(extraTargets);
    console.info(`[메일 완전자동] 등록 시도: "${taskName}" → ${targets.map(function(t) { return t.file_name; }).join(', ')}`);
    const srcLabel = `${item._scoreGrade || ''}${item._score != null ? item._score + '점 ' : ''}메일분석(${item.project || primary.model || ''})`;

    let doneCount = 0;
    window._msRegisterToProjectTargets(targets, item.task, mailRawObj, srcLabel, item._alarmWorthy, '메일완전자동', function(target, result) {
        doneCount++;
        const multiSuffix = targets.length > 1 ? ` (${doneCount}/${targets.length}개 프로젝트)` : '';
        if (result.ok) {
            if (window.showToast) window.showToast(`🎯 "${taskName}" 완전자동 배치 완료 → ${target.file_name}${multiSuffix} (${result.label || ''})`, 'info');
        } else {
            if (window.showToast) window.showToast(`⚠️ "${taskName}" → ${target ? target.file_name : '?'} 완전자동 등록 실패 (${result.reason || '알 수 없는 오류'}) — 보관함에서 [✅매칭전송]으로 직접 처리해주세요.`, 'error');
        }
        if (doneCount === targets.length) {
            item.registered = true;
            item.selected = false;
            if (onDone) onDone();
        }
    });
    return true;
};

// ─── [메일 자동처리 ①] 자동 수집 틱 — 저장된 계정으로 백그라운드 수집, 기존 큐에 append만 ──
window._autoMailFetchTick = async function() {
    // 💡 [중복 메일 버그 수정] 메일 1건당 AI 분석에 4초+ 걸려 신규 메일이 많으면 한 틱 실행 시간이
    //    스케줄러 점검 주기(60초, _startMailAutoScheduler)보다 길어질 수 있음. 마지막 수집시각(MS_LAST_AUTO_FETCH_KEY)은
    //    틱이 "끝날 때"만 갱신되므로, 이전 틱이 아직 안 끝난 상태에서 스케줄러가 또 틱을 실행시키면
    //    두 틱이 같은 신규 메일을 각자 중복 없다고 판단해 미분류 큐(_msResults)에 동시에 쌓는다.
    //    → 재진입 가드로 이전 틱이 실행 중이면 새 틱을 건너뛴다.
    if (window._msAutoTickRunning) return;
    window._msAutoTickRunning = true;
    try {
    const savedUser = localStorage.getItem('ms_saved_userid');
    const savedPwB64 = localStorage.getItem('ms_saved_pw');
    if (!savedUser || !savedPwB64) return; // 저장된 로그인 정보 없으면 자동수집 불가 → 조용히 스킵

    let password = '';
    try { password = decodeURIComponent(escape(atob(savedPwB64))); }
    catch(e) { password = savedPwB64; }

    // 마지막 자동수집 시각 이후 ~ 오늘까지 (없으면 오늘 하루만)
    const lastAt = localStorage.getItem(MS_LAST_AUTO_FETCH_KEY);
    const fmt = d => d.toISOString().split('T')[0];
    const startDate = lastAt ? fmt(new Date(lastAt)) : fmt(new Date());
    const endDate    = fmt(new Date());

    try {
        const res = await fetch(`${MS_SERVER_URL}/fetch-mail`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                mailUser: savedUser, mailPw: password,
                startDate, endDate,
                keyword: '', keywordFrom: '', keywordBody: '',
                maxCount: 500
            })
        });
        const data = await res.json();
        if (data.status !== 'success' || !data.data || !data.data.length) {
            localStorage.setItem(MS_LAST_AUTO_FETCH_KEY, new Date().toISOString());
            return;
        }

        // 💡 [2026-08-24 버그 수정] fileName 기준 중복 제거 — 백엔드 /fetch-mail이 날짜(day) 단위로만
        //    필터링해서(시:분:초 없음), 하루 안에서는 자동틱이 돌 때마다 그날 메일 전체를 매번 다시
        //    받아온다. 이전엔 _msResults(매칭/미분류 큐)만 "이미 처리함" 판정 기준으로 써서, 폐기(discard)나
        //    신규발신자(new_sender)로 분류된 메일은 여기 안 들어가므로 다음 틱에서 "처음 보는 메일"로
        //    오인돼 Stage0 필터를 다시 타고 또 폐기 큐에 쌓이는 사고가 있었음(같은 메일이 규칙에 반복해서
        //    걸리며 계속 늘어남). 세 큐(미분류/매칭·폐기·신규발신자) 전부를 "이미 처리한 메일" 판정에 포함한다.
        window._msResults = window._msResults || [];
        const discardedNames = (JSON.parse(localStorage.getItem(MS_DISCARD_QUEUE_KEY) || '[]')).map(r => r.fileName);
        const newSenderNames = (JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]')).map(r => r.fileName);
        const existingNames = new Set([
            ...window._msResults.map(r => r.fileName),
            ...discardedNames,
            ...newSenderNames
        ]);
        const dedupedMails = data.data.filter(m => !existingNames.has(m.fileName));
        if (!dedupedMails.length) {
            localStorage.setItem(MS_LAST_AUTO_FETCH_KEY, new Date().toISOString());
            return;
        }

        // 💡 [메일 자동처리 ②] Stage 0 필터 — discard(폐기)/new_sender(보류)/pass(AI분석 진행)
        const newMails = [];
        const newSenderBatch = [];
        const discardBatch = []; // 💡 [신규] 폐기도 카운트만 하지 않고 로그로 남겨 검토 가능하게 함
        dedupedMails.forEach(mail => {
            const verdict = window._msStage0Filter(mail);
            if (verdict.action === 'discard') { discardBatch.push(Object.assign({ filteredReason: verdict.reason }, mail)); return; }
            if (verdict.action === 'new_sender') {
                newSenderBatch.push(Object.assign({ filteredReason: verdict.reason }, mail));
                return;
            }
            newMails.push(mail);
        });
        if (newSenderBatch.length) window._msSaveNewSenderQueue(newSenderBatch);
        if (discardBatch.length) window._msSaveDiscardQueue(discardBatch);
        const discardCount = discardBatch.length;

        if (!newMails.length) {
            localStorage.setItem(MS_LAST_AUTO_FETCH_KEY, new Date().toISOString());
            if ((discardCount || newSenderBatch.length) && window.showToast) {
                window.showToast(window._currentLang === 'en'
                    ? `🧹 Filtered out: ${discardCount} discarded, ${newSenderBatch.length} new-sender held`
                    : `🧹 필터링: 폐기 ${discardCount}건, 신규발신자 보류 ${newSenderBatch.length}건`, 'info');
            }
            return;
        }

        const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
        // 💡 [2026-08-29 신규] "완료" 표시된 프로젝트는 완전자동 매칭 후보에서도 미리 제외
        //    (_msFilterCandidateProjects — 설정에서 끄면 그대로 통과).
        const projectList = window._msFilterCandidateProjects(await window._msLoadProjectIndex()); // 💡 Stage 1: 매칭용 인덱스 1회 로드
        const priorityConfig = await window.loadPriorityConfig(); // 💡 [④] 우선순위 점수 설정 로드
        let addedCount = 0;

        for (const mail of newMails) {
            // 💡 [AI 직접 매칭] 키워드 사전매칭 없이, 활성 프로젝트 전체를 후보로 AI에게 넘겨 판단시킴
            const candidatesForAI = projectList.length ? projectList : null;

            let item;
            if (!apiKey) {
                item = {
                    idx: window._msResults.length, fileName: mail.fileName,
                    subject: mail.subject, sender: mail.sender, date: mail.date, body: mail.body,
                    project: null, _projectTag: null,
                    task: null, selected: false, registered: false, error: 'API키 미설정'
                };
            } else {
                try {
                    const task = await msCallGemini(apiKey, {
                        subject: mail.subject, sender: mail.sender, to: mail.to, cc: mail.cc, date: mail.date,
                        body: mail.body, fileName: mail.fileName
                    }, candidatesForAI, null);

                    // 💡 AI가 반환한 매칭신뢰도/주매칭프로젝트번호로 최종 확정 (ms/mf와 동일 공용 헬퍼)
                    const resolvedProjectTag = window._msResolveAiProjectMatch(task, candidatesForAI);
                    if (resolvedProjectTag && resolvedProjectTag.status === 'matched') {
                        console.log(`[메일 자동처리] AI 맥락판단으로 프로젝트 확정: "${mail.subject.substring(0,30)}" → ${resolvedProjectTag.candidates[0].model} (신뢰도 상)`);
                    }

                    item = {
                        idx: window._msResults.length, fileName: mail.fileName,
                        subject: mail.subject, sender: mail.sender, date: mail.date, body: mail.body,
                        project: window._msProjectTagLabel(resolvedProjectTag), _projectTag: resolvedProjectTag,
                        task, selected: !!task, registered: false,
                        error: !task ? 'AI분석실패' : null,
                        matchReason: (task && task['매칭근거']) || '' // 💡 [2026-09-01 신규] "왜 이 프로젝트로(또는 미분류로) 판단했는지" AI 근거 — 미분류 큐에서 노출
                    };
                } catch(e) {
                    item = {
                        idx: window._msResults.length, fileName: mail.fileName,
                        subject: mail.subject, sender: mail.sender, date: mail.date, body: mail.body,
                        project: null, _projectTag: null,
                        task: null, selected: false, registered: false, error: e.message
                    };
                }
                await new Promise(r => setTimeout(r, 4000)); // 기존 수동 흐름과 동일한 API 호출 간격
            }

            // 💡 [메일 자동처리] 프로젝트가 매칭됐고 AI 추출까지 성공한 건만 개인 TaskInbox로 자동 이동
            //    (미분류는 프로젝트를 모르니 보관함에 넣지 않고 로컬 큐에만 남김 — 검토 큐 UI에서 노출 예정)
            //    💡 fileName 기준 중복 체크 — 큐가 초기화돼도(캐시삭제 등) 같은 메일이 보관함에 재등록되지 않도록
            const finalProjectTag = item._projectTag;
            if (item.task && finalProjectTag && window.TaskInbox) {
                const alreadyInInbox = window.TaskInbox.load().some(function(it) {
                    return it.mailRaw && it.mailRaw.fileName === mail.fileName;
                });
                if (!alreadyInInbox) {
                    // 💡 [④] 우선순위 점수 계산 — 라벨 맨 앞에 등급 표시
                    const scoreResult = window._msComputeTotalScore(mail, item.task, priorityConfig);
                    const grade = scoreResult.total >= priorityConfig.cutline ? '🔴' : (scoreResult.total >= priorityConfig.cutline * 0.6 ? '🟡' : '⚪');
                    const candidateNames = finalProjectTag.candidates.map(function(c) { return c.model || c.customer; }).join(', ');
                    const sourceLabel = finalProjectTag.status === 'ambiguous'
                        ? `${grade}${scoreResult.total}점 메일자동분석(AI판단 후보: ${candidateNames})`
                        : `${grade}${scoreResult.total}점 메일자동분석(${candidateNames})`;
                    const mailRawObj = { subject: mail.subject, sender: mail.sender, date: mail.date, body2000: mail.body, fileName: mail.fileName };
                    window.TaskInbox.add(item.task, {
                        source: sourceLabel, mailRaw: mailRawObj,
                        matchedProject: finalProjectTag,
                        alarmWorthy: scoreResult.total >= priorityConfig.cutline
                    });
                    const newUid = window.TaskInbox.load()[0].uid; // add()는 unshift라 항상 맨 앞이 방금 추가한 항목

                    // 💡 [완전자동] 매칭 확정(단일 후보) + 날짜 확정 → 무조건 배치. 커트라인 이상이면 추가로 알림도 켬
                    const hasValidDate = !String(item.task['시작일'] || '').includes('날짜확인필요')
                        && !String(item.task['완료일'] || '').includes('날짜확인필요');
                    const setAlarm = scoreResult.total >= priorityConfig.cutline; // 💡 배치는 무조건, 알림만 커트라인으로 결정
                    // 💡 [정책 변경] "내 담당" 여부와 무관하게, 매칭이 단일 확정되면 완전자동으로 그 프로젝트에 바로 배치한다.
                    //    TaskInbox(업무 보관함)는 매칭 자체가 안 된(프로젝트 미등록/미분류) 업무만 남기는 용도로 좁힌다.
                    if (window.isAutoRegisterEnabled && window.isAutoRegisterEnabled()
                        && finalProjectTag.status === 'matched' && hasValidDate) {
                        const target = finalProjectTag.candidates[0];
                        window._msAutoRegisterToProject(newUid, item.task, target.drive_file_id, target.file_name, mailRawObj, 0, setAlarm)
                            .then(function(result) {
                                if (result.ok) {
                                    window.TaskInbox.setStatus(newUid, '자동배치됨', {
                                        type: '메일자동처리(커트라인)', target: target.file_name, at: new Date().toISOString()
                                    });
                                    if (window.showToast) {
                                        window.showToast(`🎯 "${item.task['업무명']}" 자동배치 완료 → ${target.file_name} (${result.label})`, 'info');
                                    }
                                } else {
                                    console.warn('[메일 자동처리] 자동배치 실패, TaskInbox 대기 상태 유지:', result.reason);
                                }
                            });
                    }

                    // 💡 [복수 프로젝트 매칭] AI가 "상" 신뢰도로 추가 확신한 프로젝트가 있으면(최대 2개, 캡은
                    //    _msResolveAiProjectMatch에서 이미 걸림) 그 프로젝트들에도 같은 업무를 독립된 TaskInbox
                    //    항목으로 추가한다 — 항상 "대기"로는 추가해서 사람이 확인할 수 있게 하고, 완전자동
                    //    조건까지 충족하면 주매칭과 동일하게 바로 그 프로젝트 파일에도 등록까지 진행한다.
                    const extraTargets = (finalProjectTag.status === 'matched' ? (finalProjectTag.extraCandidates || []) : [])
                        .filter(function(t) { return t && t.drive_file_id; });
                    if (extraTargets.length) {
                        const fullAuto = !!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled() && hasValidDate);
                        window._msRegisterToProjectTargets(
                            fullAuto ? extraTargets : [], // 💡 완전자동이 아니면 자동등록은 안 하고, 아래에서 대기 항목만 추가
                            item.task, mailRawObj, sourceLabel, setAlarm, '메일자동처리(커트라인,추가매칭)',
                            function(target, result) {
                                if (window.showToast) {
                                    window.showToast(result.ok
                                        ? `🎯 "${item.task['업무명']}" 추가매칭 자동배치 완료 → ${target.file_name} (${result.label || ''})`
                                        : `⚠️ "${item.task['업무명']}" 추가매칭 등록 실패 → ${target ? target.file_name : '?'} (${result.reason || ''})`, result.ok ? 'info' : 'error');
                                }
                            }
                        );
                        if (!fullAuto) {
                            // 반자동: 자동등록 없이 "대기" 상태로만 추가 — 사람이 보관함에서 [✅매칭전송]으로 직접 처리
                            extraTargets.forEach(function(target) {
                                window.TaskInbox.add(item.task, {
                                    source: `${sourceLabel} [추가매칭: ${target.model || target.customer || target.file_name}]`,
                                    mailRaw: mailRawObj,
                                    matchedProject: { status: 'matched', candidates: [target] },
                                    alarmWorthy: setAlarm
                                });
                            });
                        }
                    }
                }
            }

            window._msResults.unshift(item); // 💡 [최신 항목 상단 표시]
            addedCount++;
        }

        window._msSaveQueueToStorage();
        if (typeof msRenderList === 'function') msRenderList(window._msResults);
        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 [B/C] 배지 숫자 갱신
        localStorage.setItem(MS_LAST_AUTO_FETCH_KEY, new Date().toISOString());

        if (addedCount > 0 && window.showToast) {
            const filterNote = (discardCount || newSenderBatch.length)
                ? (window._currentLang === 'en'
                    ? ` (filtered: ${discardCount} discarded, ${newSenderBatch.length} new-sender)`
                    : ` (필터링: 폐기 ${discardCount} / 신규발신자 ${newSenderBatch.length})`)
                : '';
            window.showToast(window._currentLang === 'en'
                ? `📬 ${addedCount} new mail(s) auto-collected — pending review${filterNote}`
                : `📬 신규 메일 ${addedCount}건 자동수집·분석 완료 — 검토 대기${filterNote}`, 'info');
        }
    } catch(e) {
        console.warn('[메일 자동처리] 자동 수집 실패:', e.message);
        // 실패해도 last_fetch_at은 갱신하지 않음 → 다음 틱에서 같은 구간 재시도
    }
    } finally {
        window._msAutoTickRunning = false; // 다음 스케줄러 틱이 다시 실행될 수 있도록 항상 해제
    }
};

// ─── [메일 자동처리 B/C] 미분류·신규발신자 배지 갱신 + 읽기전용 검토 모달 ──
window._msRefreshQueueBadges = function() {
    const unmatchedCount = (window._msResults || []).filter(r => !r.project).length;
    const newSenderCount = (JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]')).length;
    const discardedCount = (JSON.parse(localStorage.getItem(MS_DISCARD_QUEUE_KEY) || '[]')).length;
    // 💡 [버그 수정] 이 배지들이 화면에 2벌(⚙️ 설정 모달 + 📥 업무 보관함 모달) 존재하는데
    //    id가 중복돼서 하나만 갱신되고 있었음 — 두 번째 사본은 "-2" 접미사로 분리해서 같이 갱신
    ['ms-unmatched-count', 'ms-unmatched-count-2'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = unmatchedCount;
    });
    ['ms-newsender-count', 'ms-newsender-count-2'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = newSenderCount;
    });
    ['ms-discarded-count', 'ms-discarded-count-2'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = discardedCount;
    });
};

const _msQEsc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// 💡 [2026-09-06 신규] 미분류/신규발신자/자동폐기 큐 상단에 붙는 집계 요약 — 사용자 피드백:
//    "미분류 업무가 너무 많고 대기도 너무 많아서 뭐가 문제인지 분석 조차도 분별이 힘든 상황"
//    → 카드를 하나씩 읽지 않고도 발신 도메인·미분류 사유 패턴이 상위 몇 개에 몰려있는지 한눈에 보이게 함.
// 💡 [2026-09-06 개선] "필터 버튼 아니냐"는 피드백 — 실제로 AI 업무 보관함 요약과 같은 클릭 필터로
//    동작하게 함. window._msQueueFilter = { kind:'domain'|'reason', value } 를 window._msApplyQueueFilter가
//    아래 목록에 적용하고, 요약 자체는 항상 전체(rows) 기준으로 그려서 다른 칩으로 바로 갈아탈 수 있게 유지.
window._msQueueFilter = window._msQueueFilter || null;
window._msSetQueueFilter = function(kind, value) {
    if (window._msQueueFilter && window._msQueueFilter.kind === kind && window._msQueueFilter.value === value) {
        window._msQueueFilter = null; // 같은 칩 다시 클릭 → 토글 해제
    } else {
        window._msQueueFilter = { kind: kind, value: value };
    }
    window._msRenderQueueModal(window._msQueueCurrentType);
};
window._msClearQueueFilter = function() {
    window._msQueueFilter = null;
    window._msRenderQueueModal(window._msQueueCurrentType);
};
/** 사유 칩 값 계산 — 요약 집계와 필터 적용 양쪽에서 동일 규칙을 써야 하므로 공용 함수로 뺌 */
window._msQueueReasonBucket = function(r) {
    const s = (r.matchReason || '').trim();
    return s ? s.slice(0, 34) + (s.length > 34 ? '…' : '') : '(근거없음/구버전분석 — 🔄 재분석하면 근거 표시됨)';
};
/** 도메인 칩 값 계산 — 위와 동일한 이유로 공용 함수 */
window._msQueueDomain = function(r) {
    const m = (r.sender || '').match(/@([\w.-]+)/);
    return m ? m[1] : '(파싱안됨)';
};
/** 현재 필터를 rows에 적용해서 아래 목록에 실제로 보여줄 부분집합을 반환 */
window._msApplyQueueFilter = function(rows) {
    const f = window._msQueueFilter;
    if (!f) return rows;
    if (f.kind === 'domain') return rows.filter(r => window._msQueueDomain(r) === f.value);
    if (f.kind === 'reason') return rows.filter(r => window._msQueueReasonBucket(r) === f.value);
    return rows;
};
window._msBuildQueueSummaryHtml = function(type, rows) {
    if (!rows || !rows.length) return '';
    function topCount(arr, keyFn, limit) {
        const m = {};
        arr.forEach(x => { const k = keyFn(x) || '(없음)'; m[k] = (m[k] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, limit || 5);
    }
    const filter = window._msQueueFilter;
    function chip(label, count, kind) {
        const active = filter && filter.kind === kind && filter.value === label;
        return `<span class="ms-queue-chip" data-kind="${_msQEsc(kind)}" data-value="${_msQEsc(label)}" ` +
            `title="클릭하면 아래 목록을 이 항목만 보여줍니다" ` +
            `style="display:inline-block;background:#eef3ff;color:#1a4f7a;border-radius:10px;padding:2px 8px;margin:2px 4px 2px 0;` +
            `font-size:11px;white-space:nowrap;cursor:pointer;${active ? 'outline:2px solid #1a4f7a;' : ''}">${_msQEsc(label)} <b>${count}</b></span>`;
    }
    const domainTop = topCount(rows, r => window._msQueueDomain(r), 5);
    const dates = rows.map(r => (r.date || '').slice(0, 10)).filter(Boolean).sort();
    const dateRange = dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '';

    let reasonHtml = '';
    if (type === 'unmatched') {
        // 💡 매칭근거 앞부분 34자로 뭉뚱그려 dedup — 완전히 같은 문장은 드물어도 "메일 본문에 XX 언급"류
        //    패턴이 반복되면 상위에 잡혀서, 사유 없이 뭉뚱그려진 문구인지/특정 프로젝트가 등록 안 된 건지 등을
        //    카드를 일일이 열어보지 않고도 짐작할 수 있게 해줌.
        const reasonTop = topCount(rows, r => window._msQueueReasonBucket(r), 6);
        reasonHtml = reasonTop.length
            ? `<div style="margin-top:6px;"><b>사유 상위:</b><br>${reasonTop.map(e => chip(e[0], e[1], 'reason')).join('')}</div>`
            : '';
    }

    let filterHtml = '';
    if (filter) {
        filterHtml = `<div style="margin-top:8px;"><span style="font-size:11px;color:#1971c2;font-weight:bold;">🔎 필터링 중: ${_msQEsc(filter.value)}</span></div>`;
    }

    return `<div id="ms-queue-summary-inner" style="padding:10px 14px;background:#f8faff;border-bottom:1px solid #e3ecfa;font-size:11.5px;color:#333;">` +
        `<div><span class="ms-queue-clear-filter" title="클릭하면 전체보기(필터 해제)" style="cursor:pointer;text-decoration:underline dotted;"><b>총 ${rows.length}건</b></span>${dateRange ? ' · ' + _msQEsc(dateRange) : ''}</div>` +
        (domainTop.length ? `<div style="margin-top:6px;"><b>발신 도메인:</b> ${domainTop.map(e => chip(e[0], e[1], 'domain')).join('')}</div>` : '') +
        reasonHtml +
        filterHtml +
        `</div>`;
};

// 💡 타입별 데이터 소스 — 'unmatched'는 세션큐+로컬스토리지, 'newsender'/'discarded'는 로컬스토리지 전용
window._msQueueGetRows = function(type) {
    if (type === 'unmatched') {
        return (window._msResults || []).filter(r => !r.project);
    }
    if (type === 'discarded') {
        return JSON.parse(localStorage.getItem(MS_DISCARD_QUEUE_KEY) || '[]');
    }
    return JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]');
};

window._msQueueDeleteOne = function(type, fileName) {
    if (type === 'unmatched') {
        window._msResults = (window._msResults || []).filter(r => r.fileName !== fileName);
        window._msSaveQueueToStorage();
    } else {
        const key = type === 'discarded' ? MS_DISCARD_QUEUE_KEY : MS_NEW_SENDER_QUEUE_KEY;
        const list = JSON.parse(localStorage.getItem(key) || '[]').filter(r => r.fileName !== fileName);
        localStorage.setItem(key, JSON.stringify(list));
    }
};

window._msQueueDeleteAll = function(type) {
    if (type === 'unmatched') {
        window._msResults = (window._msResults || []).filter(r => r.project); // 미분류만 제거, 매칭된 건 유지
        window._msSaveQueueToStorage();
    } else {
        localStorage.setItem(type === 'discarded' ? MS_DISCARD_QUEUE_KEY : MS_NEW_SENDER_QUEUE_KEY, '[]');
    }
};

// 💡 filteredReason(예: 'subject_kw:[광고]', 'unknown_domain:xxx.com')을 사람이 읽을 문구로 변환
// 💡 [2026-09-01 개선] 'unmatched'는 예전엔 "신뢰도 낮음/해당없음"이라는 뭉뚱그린 고정 문구만 보여줘서,
//    사용자가 "왜" 미분류됐는지 실제 근거를 알 수 없었음 — AI가 매칭 판단 시 함께 만든 실제 근거
//    (r.matchReason, msCallGemini 프롬프트의 "매칭근거" 필드)가 있으면 그걸 그대로 보여주고,
//    옛날에 분석돼서 이 필드가 없는 항목만 예전 고정 문구로 폴백한다.
window._msQueueRowHint = function(type, r) {
    const reason = r.filteredReason || '';
    if (reason.startsWith('subject_kw:')) return `제목 키워드 "${reason.slice(11)}" 규칙에 걸려 자동폐기됨`;
    if (reason.startsWith('noreply:')) return `발신자 패턴 "${reason.slice(8)}" 규칙에 걸려 자동폐기됨`;
    if (reason.startsWith('blocked_domain:')) return `차단 등록된 도메인(${reason.slice(15)})이라 자동폐기됨`;
    if (reason.startsWith('unknown_domain:')) return `주소록에 없는 발신자 도메인(${reason.slice(15)}) — 정상 거래처면 주소록에 추가 필요`;
    if (reason === 'whitelist_empty') return '주소록이 비어있어 전부 신규발신자로 분류됨';
    if (type === 'unmatched') return r.matchReason || '등록된 프로젝트 후보 중 AI가 확신 있게 고르지 못함(신뢰도 낮음/해당없음) — 이 메일은 옛날 버전 분석이라 상세 근거가 없습니다. 🔄 재분석 요청으로 다시 분석하면 근거가 표시됩니다.';
    return '';
};

// 💡 [2026-08-25 신규] 큐 종류(type) → 모달 헤더 문구. 예전엔 호출부(msShowUnmatchedModal 등)가
//    한글 문자열을 직접 넘겨서 영문 모드로 전환해도 이 헤더만 한글로 남아있었다 — type만 넘기면
//    현재 언어에 맞는 제목을 여기서 고르도록 바꿔서, 언어 전환 시에도 다시 열면 바로 맞는 언어로 나온다.
window._msQueueTypeLabel = function(type) {
    const _en = window._currentLang === 'en';
    if (type === 'unmatched') return _en ? '📭 Unclassified Mail' : '📭 미분류 메일';
    if (type === 'newsender') return _en ? '👤 New Sender Mail' : '👤 신규발신자 메일';
    if (type === 'discarded') return _en ? '🗑 Auto-discarded Mail' : '🗑 자동폐기 메일';
    return '';
};

window._msRenderQueueModal = function(type) {
    const _msQEn = window._currentLang === 'en';
    // 💡 [2026-09-06 신규] 다른 큐(미분류→신규발신자 등)로 전환하면 이전 필터는 의미가 없으니 초기화.
    //    같은 타입으로 다시 그리는 경우(삭제/재분석 등 액션 후 재렌더)는 필터를 유지해야 하므로
    //    "타입이 바뀌었을 때만" 초기화한다.
    if (window._msQueueCurrentType && window._msQueueCurrentType !== type) window._msQueueFilter = null;
    const title = window._msQueueTypeLabel(type);
    const allRows = window._msQueueGetRows(type);
    const rows = window._msApplyQueueFilter(allRows); // 필터가 적용된, 실제로 카드로 그릴 목록

    window._msQueueRows = rows; // 💡 "원문 보기" 클릭 시 참조용 (onclick 문자열에 본문을 직접 못 넣으니 인덱스로 조회)
    const bodyHtml = rows.length
        ? rows.map((r, i) => {
            // 💡 [자동 등록] 신규발신자 큐에서만 "이 도메인 영구차단" 버튼 제공 — 검토 후 확정된 스팸이면
            //    한 번의 클릭으로 자동폐기 필터 규칙에 등록(다음부터는 조용히 걸러짐, AI 호출도 안 됨)
            const domain = (window._msParseSenderEmail(r.sender) || '').split('@')[1] || '';
            // 💡 [2026-08-24 버그 수정] 이 사각 아이콘 버튼들이 flex-centering 없이 UA 기본 정렬에만
            //    의존하고 있어서(width/height만 지정) 📧/🚫 아이콘이 중앙이 아니라 오른쪽으로 치우쳐
            //    보였음(🗑는 우연히 괜찮아 보였을 뿐). display:inline-flex + align/justify-content:center로
            //    명시 중앙정렬하면 셋 다 동일하게 정중앙에 옴 — 실측(getBoundingClientRect)으로 좌우
            //    여백이 거의 동일해지는 것까지 확인함.
            const ruleBtn = (type === 'newsender' && domain)
                ? `<button class="ms-queue-rule-btn" data-idx="${i}" data-domain="${_msQEsc(domain)}"
                        onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';"
                        title="이 발신자 도메인을 자동폐기 규칙에 영구 등록" style="display:inline-flex; align-items:center; justify-content:center; background:#fbead9; border:1px solid #edbf85; color:#a85d0a; border-radius:6px; width:26px; height:26px; padding:0; cursor:pointer; font-size:12px; transition:background .15s, border-color .15s;">🚫</button>`
                : '';
            // 💡 [2026-09-01 신규] 미분류 메일 전용 — 위 💡 근거를 읽어보고, 사람이 판단한 의견(힌트)을 남겨서
            //    AI에게 그 메일 하나만 다시 판단시킴(_msQueueReanalyze). 근거 없이 "그냥 다시 해봐"도 가능.
            const reanalyzeBtn = (type === 'unmatched')
                ? `<button class="ms-queue-reanalyze-btn" data-filename="${_msQEsc(r.fileName)}"
                        onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';"
                        title="사용자 의견을 참고해서 프로젝트 매칭 재분석 요청" style="display:inline-flex; align-items:center; justify-content:center; background:#e6f6ea; border:1px solid #a8dab8; color:#1f7a3d; border-radius:6px; width:26px; height:26px; padding:0; cursor:pointer; font-size:12px; transition:background .15s, border-color .15s;">🔄</button>`
                : '';
            return `
            <div style="padding:8px 10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div style="min-width:0; flex:1;">
                    <div style="font-size:12px; font-weight:bold; overflow-wrap:break-word;">${_msQEsc(r.subject)}</div>
                    <div style="font-size:11px; color:#777; margin-top:2px;">${_msQEsc(r.sender)} · ${_msQEsc(r.date)}</div>
                    <div style="font-size:11px; color:#e67e22; margin-top:2px;">💡 ${window._msQueueRowHint(type, r)}</div>
                </div>
                <div style="flex-shrink:0; display:flex; gap:4px;">
                    <button class="ms-queue-view-btn" data-idx="${i}"
                        onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                        title="원문 보기" style="display:inline-flex; align-items:center; justify-content:center; background:#e8f4fd; border:1px solid #a5c8f0; color:#1a4f7a; border-radius:6px; width:26px; height:26px; padding:0; cursor:pointer; font-size:12px; transition:background .15s, border-color .15s;">📧</button>
                    ${ruleBtn}
                    ${reanalyzeBtn}
                    <button class="ms-queue-del-btn" data-filename="${_msQEsc(r.fileName)}"
                        onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';"
                        title="삭제" style="display:inline-flex; align-items:center; justify-content:center; background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:6px; width:26px; height:26px; padding:0; cursor:pointer; font-size:12px; transition:background .15s, border-color .15s;">🗑</button>
                </div>
            </div>`;
        }).join('')
        : '<div style="padding:24px; text-align:center; color:#999; font-size:12px;">' +
          (window._msQueueFilter
              ? (_msQEn ? 'No items match the current filter.' : '이 필터에 해당하는 항목이 없습니다')
              : (_msQEn ? 'No pending items.' : '대기 중인 항목이 없습니다')) + '</div>';

    let modal = document.getElementById('ms-queue-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ms-queue-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ms-queue-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:320px; min-height:200px;">
            <div id="ms-queue-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span id="ms-queue-title">📭 미분류 메일</span>
                <button onclick="document.getElementById('ms-queue-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="ms-queue-summary" style="flex-shrink:0;"></div>
            <div id="ms-queue-body" style="overflow-y:auto; flex:1; background:#fafafa;"></div>
            <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px;">
                <button id="ms-queue-suggest-btn" onclick="window._msQueueSuggestClick()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:7px 10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;"></button>
                <button id="ms-queue-reanalyze-all-btn" onclick="window._msBulkReanalyzeUnmatched()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="display:none; flex:1; padding:7px 10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🔄 전체 재분석</button>
                <button id="ms-queue-clear-all-btn" onclick="window._msQueueClearAll()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1; padding:7px 14px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:12px; cursor:pointer; transition:background .15s, border-color .15s;"></button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ms-queue-box', 'ms-queue-drag');
        window._bindClickToFront('ms-queue-modal');
        // 💡 삭제 버튼은 이벤트 위임으로 처리 — data-filename 속성 사용, onclick 문자열 조립 안 함(따옴표 깨짐 방지)
        document.getElementById('ms-queue-body').addEventListener('click', function(e) {
            const delBtn = e.target.closest('.ms-queue-del-btn');
            if (delBtn) { window._msQueueRemoveRow(window._msQueueCurrentType, delBtn.dataset.filename); return; }
            const viewBtn = e.target.closest('.ms-queue-view-btn');
            if (viewBtn) {
                const r = window._msQueueRows && window._msQueueRows[Number(viewBtn.dataset.idx)];
                if (r && window.showMailRawModal) window.showMailRawModal({ subject: r.subject, sender: r.sender, date: r.date, body2000: r.body });
                return;
            }
            // 💡 [2026-09-01 신규] "🔄 재분석 요청" — 미분류 사유를 읽고 사용자 의견(선택)을 남긴 뒤 그 메일만 다시 판단
            const reanalyzeBtn = e.target.closest('.ms-queue-reanalyze-btn');
            if (reanalyzeBtn) { window._msOpenReanalyzeHintModal(reanalyzeBtn.dataset.filename); return; }
            // 💡 [자동 등록] 신규발신자 검토 중 "이 도메인 영구차단" — 필터 규칙에 추가 + 큐에서도 제거
            const ruleBtn = e.target.closest('.ms-queue-rule-btn');
            if (ruleBtn) {
                const domain = ruleBtn.dataset.domain;
                if (!domain) return;
                if (!confirm(`"${domain}" 도메인을 자동폐기 규칙에 영구 등록할까요?\n앞으로 이 도메인에서 오는 메일은 AI 분석 없이 조용히 폐기됩니다.`)) return;
                window._msAddFilterRule('blockedDomains', domain);
                const r = window._msQueueRows && window._msQueueRows[Number(ruleBtn.dataset.idx)];
                if (r) window._msQueueRemoveRow(window._msQueueCurrentType, r.fileName);
                if (window.showToast) window.showToast(`🚫 "${domain}" 도메인 자동폐기 규칙에 등록됨`, 'info');
            }
        });
        // 💡 [2026-09-06 신규] 요약 칩(발신 도메인/사유 상위) 클릭 필터 — AI 업무 보관함 요약과 동일한 방식
        document.getElementById('ms-queue-summary').addEventListener('click', function(e) {
            if (e.target.closest('.ms-queue-clear-filter')) { window._msClearQueueFilter(); return; }
            const chipEl = e.target.closest('.ms-queue-chip');
            if (chipEl) window._msSetQueueFilter(chipEl.dataset.kind, chipEl.dataset.value);
        });
    }

    window._msQueueCurrentType = type;
    document.getElementById('ms-queue-title').textContent = title + (_msQEn ? ' (' + rows.length + ')' : ' (' + rows.length + '건)');
    // 💡 요약은 항상 전체(allRows) 기준으로 그린다 — 필터가 걸려 있어도 다른 칩으로 바로 갈아탈 수 있어야 함
    document.getElementById('ms-queue-summary').innerHTML = window._msBuildQueueSummaryHtml(type, allRows);
    document.getElementById('ms-queue-body').innerHTML = bodyHtml;
    const suggestBtn = document.getElementById('ms-queue-suggest-btn');
    if (suggestBtn) {
        // 💡 '자동폐기' 큐는 제안 기능이 없으므로(이미 규칙에 걸려서 폐기된 것) 버튼 자체를 숨김
        suggestBtn.style.display = type === 'discarded' ? 'none' : '';
        suggestBtn.textContent = type === 'unmatched'
            ? (_msQEn ? '🔑 Suggest Keywords' : '🔑 키워드 제안')
            : (_msQEn ? '📇 Suggest Contacts' : '📇 주소록 제안');
    }
    const clearAllBtn = document.getElementById('ms-queue-clear-all-btn');
    if (clearAllBtn) clearAllBtn.textContent = _msQEn ? '🗑 Clear All' : '🗑 일괄삭제';
    const reanalyzeAllBtn = document.getElementById('ms-queue-reanalyze-all-btn');
    if (reanalyzeAllBtn) {
        reanalyzeAllBtn.style.display = (type === 'unmatched' && rows.length) ? '' : 'none';
        reanalyzeAllBtn.textContent = _msQEn ? `🔄 Reanalyze All (${rows.length})` : `🔄 전체 재분석 (${rows.length}건)`;
    }
    modal.style.display = 'block';
    window.bringModalToFront('ms-queue-modal'); // 💡 열 때 즉시 맨 앞으로 (클릭 안 해도)
};

window._msQueueSuggestClick = function() {
    if (window._msQueueCurrentType === 'unmatched') window._msShowKeywordSuggestModal();
    else window._msShowAddressSuggestModal();
};

window._msQueueRemoveRow = function(type, fileName) {
    window._msQueueDeleteOne(type, fileName);
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    window._msRenderQueueModal(type);
};

window._msQueueClearAll = function() {
    const type = window._msQueueCurrentType;
    const _msQEn = window._currentLang === 'en';
    if (!confirm(_msQEn ? 'Delete all pending items? This cannot be undone.' : '대기 중인 항목을 전부 삭제할까요? 되돌릴 수 없습니다.')) return;
    window._msQueueDeleteAll(type);
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    window._msRenderQueueModal(type);
};

// ═══════════════════════════════════════════════════════════════════
// 💡 [2026-09-03 신규] 미분류 큐 전체 일괄 재분석
//    - 현재 큐의 미분류 메일 전부를 최신 토픽 프로파일+프로젝트 인덱스로 순차 재분석
//    - 토픽 프로파일 갱신 직후 자동 제안 or 큐 모달 하단 "🔄 전체 재분석" 버튼으로 수동 실행
//    ※ 토픽 학습 자체가 자동 재스캔을 일으키지 않음 — 이 함수 호출 시에만 재분석이 시작됨
// ═══════════════════════════════════════════════════════════════════
// opts.noConfirm = true : 토픽 프로파일 갱신 후 자동 호출 경로 — confirm/alert 없이 시작
// 💡 [2026-09-07 무료 API 절약] 토픽 프로파일이 자동 재생성될 때마다(26-topic-profile.js의
//    _tpCheckAutoRegen, +10업무·쿨다운10분 기준) 이 함수가 noConfirm:true로 무조건 자동 호출돼
//    "그 순간 미분류인 메일 전부"를 처음부터 다시 AI에 태웠다 — 새 프로파일이 나온다고 방금 전에도
//    실패한 미분류 메일이 갑자기 풀리는 경우는 드문데, 프로젝트가 여러 개 활발히 돌아가면 이 자동
//    재생성이 하루에도 여러 번 발생해서 "미분류 30건 × 매번 재분석"처럼 API 호출이 기하급수로
//    낭비됨(실제 사용자 제보: 무료 한도 초과 오류). 자동 호출(noConfirm)일 때만, 최근에 이미
//    재분석을 시도했는데도 여전히 미분류인 건은 건너뛴다 — r.reanalyzedAt은 ms_pending_queue에
//    저장돼 새로고침에도 살아남으므로, 세션이 끊겨도(쿨다운 변수가 초기화돼도) 계속 보호된다.
//    수동 [🔄 전체 재분석] 버튼(noConfirm:false)은 사용자가 명시적으로 원한 것이므로 그대로 전량 처리.
var MS_AUTO_REANALYZE_SKIP_MS = 60 * 60 * 1000; // 1시간 이내 재시도 이력 있으면 자동 흐름에서 스킵
window._msBulkReanalyzeUnmatched = async function(opts) {
    const _noConfirm = !!(opts && opts.noConfirm);
    let unmatched = (window._msResults || []).filter(r => !r.project);
    let skippedRecent = 0;
    if (_noConfirm) {
        const _now = Date.now();
        unmatched = unmatched.filter(function(r) {
            if (!r.reanalyzedAt) return true;
            const isRecent = (_now - new Date(r.reanalyzedAt).getTime()) < MS_AUTO_REANALYZE_SKIP_MS;
            if (isRecent) skippedRecent++;
            return !isRecent;
        });
    }
    if (!unmatched.length) {
        if (!_noConfirm && window.showToast) window.showToast('미분류 메일이 없습니다.', 'info');
        else if (skippedRecent && window.showToast) window.showToast('🔄 자동 재분석 — 전부 최근에 이미 시도한 건이라 건너뜁니다(' + skippedRecent + '건, API 절약).', 'info', 4000);
        return;
    }

    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) {
        if (window.showToast) window.showToast('⚠️ AI API 키를 먼저 설정해주세요.', 'error');
        return;
    }

    // 수동 버튼 클릭(noConfirm=false)일 때만 confirm — 자동 흐름에서는 생략
    if (!_noConfirm) {
        if (!confirm(`미분류 메일 ${unmatched.length}건을 최신 토픽 프로파일로 재분석합니다.\n시간이 걸릴 수 있습니다 (건당 약 3~5초) — 계속할까요?`)) return;
    }

    const btn = document.getElementById('ms-queue-reanalyze-all-btn');
    const origBtnText = btn ? btn.textContent : '';
    let matched = 0, failed = 0;

    try {
        // 프로젝트 인덱스·설정은 한 번만 로드 (5분 캐시 활용)
        const projectList     = await window._msLoadProjectIndex();
        const candidates      = window._msFilterCandidateProjects(projectList || []);
        const candidatesForAI = candidates.length ? candidates : null;

        if (!candidatesForAI) {
            if (window.showToast) window.showToast(
                '⚠️ 매칭 가능한 진행 중 프로젝트가 없습니다. project_index.json 및 완료 여부를 확인해주세요.',
                'error', 6000);
            return;
        }

        const priorityConfig = await window.loadPriorityConfig();

        for (let i = 0; i < unmatched.length; i++) {
            const r = unmatched[i];
            if (btn) btn.textContent = `⏳ ${i + 1}/${unmatched.length} 재분석 중...`;

            try {
                const task = await msCallGemini(apiKey,
                    { subject: r.subject, sender: r.sender, date: r.date, body: r.body, fileName: r.fileName },
                    candidatesForAI, null, null);

                const projectTag   = window._msResolveAiProjectMatch(task, candidatesForAI);
                const wasUnmatched = !r.project;
                r.task        = task || r.task;
                r.project     = window._msProjectTagLabel(projectTag);
                r._projectTag = projectTag;
                r.matchReason = (task && task['매칭근거']) || r.matchReason || '';
                r.error       = !task ? 'AI분석실패' : null;
                r.selected    = !!task;
                r.reanalyzedAt = new Date().toISOString();

                if (task && priorityConfig) {
                    const scoreResult = window._msComputeTotalScore(r, task, priorityConfig);
                    r._score          = scoreResult.total;
                    r._scoreGrade     = window._msScoreGrade(scoreResult.total, priorityConfig.cutline);
                    r._scoreBreakdown = scoreResult.breakdown;
                    r._alarmWorthy    = scoreResult.total >= priorityConfig.cutline;
                }

                if (wasUnmatched && projectTag && task && window.TaskInbox) {
                    const alreadyInInbox = window.TaskInbox.load().some(
                        it => it.mailRaw && it.mailRaw.fileName === r.fileName);
                    if (!alreadyInInbox) {
                        const grade          = r._scoreGrade || '⚪';
                        const candidateNames = projectTag.candidates.map(c => c.model || c.customer).join(', ');
                        const sourceLabel    = `${grade}${r._score || 0}점 메일자동분석(일괄재분석` +
                            (projectTag.status === 'ambiguous'
                                ? `, AI판단 후보: ${candidateNames})` : `, ${candidateNames})`);
                        const mailRawObj = { subject: r.subject, sender: r.sender, date: r.date, body2000: r.body, fileName: r.fileName };
                        window.TaskInbox.add(task, { source: sourceLabel, mailRaw: mailRawObj, matchedProject: projectTag, alarmWorthy: !!r._alarmWorthy });
                    }
                }

                if (r.project) matched++;
            } catch (e) {
                failed++;
                console.warn('[일괄재분석 오류]', r.fileName, e);
            }

            // API 과부하 방지: 무료 티어 15 RPM = 4초에 1회 허용
            // 이전 500ms(=120 RPM)는 무료 한도 8배 초과 → 4000ms로 조정
            if (i < unmatched.length - 1) await new Promise(res => setTimeout(res, 4000));
        }
    } finally {
        window._msSaveQueueToStorage();
        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
        if (window._msQueueCurrentType === 'unmatched') window._msRenderQueueModal('unmatched');
        if (btn) btn.textContent = origBtnText;
        const remaining = (window._msResults || []).filter(r => !r.project).length;
        if (window.showToast) {
            window.showToast(
                `🔄 일괄 재분석 완료 — ${unmatched.length}건 중 ${matched}건 매칭됨` +
                (remaining ? `, ${remaining}건 여전히 미분류` : ', 모두 매칭됨! 🎉') +
                (failed ? ` (${failed}건 오류)` : ''),
                matched > 0 ? 'info' : 'warning', 6000);
        }
    }
};

// ═══════════════════════════════════════════════════════════════════
// 💡 [2026-09-01 신규] "📭 미분류 메일" 재분석 요청 — 왜 미분류됐는지(💡 근거, matchReason)를 사용자가
//    읽어보고, 자기 판단(예: "관리번호는 다르지만 실제로 이 프로젝트 맞음")을 남겨서 그 메일 1건만
//    다시 AI에게 판단시킨다. 힌트는 선택 입력 — 비워도 그냥 재시도로 동작한다(msCallGemini의 5번째
//    인자 userHint로 전달되어 프롬프트에서 최우선 근거로 취급됨. 위 msCallGemini 프롬프트 수정 참고).
window._msOpenReanalyzeHintModal = function(fileName) {
    const r = (window._msResults || []).find(x => x.fileName === fileName);
    if (!r) return;
    window._msReanalyzeTarget = fileName;
    let modal = document.getElementById('ms-reanalyze-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ms-reanalyze-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9260; pointer-events:none;';
        modal.innerHTML = `
        <div id="ms-reanalyze-box" onclick="event.stopPropagation()" style="position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:220px; pointer-events:auto;">
            <div id="ms-reanalyze-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span>🔄 프로젝트 매칭 재분석 요청</span>
                <button onclick="event.stopPropagation(); document.getElementById('ms-reanalyze-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div style="padding:18px;">
                <div id="ms-reanalyze-subject" style="font-size:12px; color:#555; margin-bottom:6px; overflow-wrap:break-word;"></div>
                <div id="ms-reanalyze-prev-reason" style="font-size:11.5px; color:#a85d0a; background:#fff8e6; border:1px solid #ffe08a; border-radius:6px; padding:8px 10px; margin-bottom:10px; display:none;"></div>
                <label style="font-size:11.5px; color:#888; display:block; margin-bottom:6px;">위 근거를 참고해서, 실제로 어느 프로젝트 건인지(또는 왜 미분류가 맞는지) 의견을 남겨주세요 — 선택 입력, 비워두면 힌트 없이 그냥 다시 판단합니다.</label>
                <div style="margin-bottom:6px;">
                    <button id="ms-proj-picker-btn" onclick="window._msToggleProjPicker()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="font-size:12px; padding:4px 12px; height:28px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:5px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">📋 프로젝트 선택 ▾</button>
                    <div id="ms-proj-picker-list" style="display:none; margin-top:4px; border:1px solid #ced4da; border-radius:6px; max-height:160px; overflow-y:auto; background:#fff; font-size:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08);"></div>
                </div>
                <textarea id="ms-reanalyze-hint" placeholder="예: 관리번호는 다르지만 실제로는 STELLAR32 건 맞음 / 예: 회의록이라 여러 프로젝트가 섞여있어서 미분류가 맞음"
                    style="width:100%; min-height:70px; font-size:13px; border:1px solid #ced4da; border-radius:6px; padding:8px; box-sizing:border-box; resize:vertical;"></textarea>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                    <button onclick="window._msSubmitReanalyze()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:6px 18px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">재분석 요청</button>
                    <button onclick="document.getElementById('ms-reanalyze-modal').style.display='none'" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s;">취소</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ms-reanalyze-box', 'ms-reanalyze-drag');
        window._bindClickToFront('ms-reanalyze-modal');
    }
    document.getElementById('ms-reanalyze-subject').textContent = '📧 ' + (r.subject || '(제목없음)');
    const prevReasonEl = document.getElementById('ms-reanalyze-prev-reason');
    if (r.matchReason) { prevReasonEl.style.display = 'block'; prevReasonEl.textContent = '💡 이전 판단 근거: ' + r.matchReason; }
    else { prevReasonEl.style.display = 'none'; }
    document.getElementById('ms-reanalyze-hint').value = '';
    modal.style.display = 'block';
    window.bringModalToFront('ms-reanalyze-modal');
};

window._msSubmitReanalyze = async function() {
    const fileName = window._msReanalyzeTarget;
    const hint = (document.getElementById('ms-reanalyze-hint').value || '').trim();
    document.getElementById('ms-reanalyze-modal').style.display = 'none';
    await window._msQueueReanalyze(fileName, hint);
};

// 💡 [2026-09-03 신규] 재분석 모달 "프로젝트 선택 ▾" 드롭다운 — Drive 프로젝트 목록을 로딩해서 보여주고
//    클릭 한 번으로 textarea 힌트 자동 채움 (직접 입력보다 빠르고 오타 없음)
window._msToggleProjPicker = async function() {
    const listEl = document.getElementById('ms-proj-picker-list');
    const btn    = document.getElementById('ms-proj-picker-btn');
    if (!listEl) return;

    // 이미 열려있으면 닫기
    if (listEl.style.display !== 'none') {
        listEl.style.display = 'none';
        if (btn) btn.textContent = '📋 프로젝트 선택 ▾';
        return;
    }

    listEl.style.display = 'block';
    listEl.innerHTML = '<div style="padding:10px; text-align:center; color:#888; font-size:12px;">⏳ 목록 로딩 중...</div>';
    if (btn) btn.textContent = '📋 프로젝트 선택 ▴';

    try {
        const projects   = await window._msLoadProjectIndex();
        const candidates = window._msFilterCandidateProjects(projects || []);
        window._msProjPickerCache = candidates; // _msSelectProjPickerItem에서 참조

        if (!candidates || !candidates.length) {
            listEl.innerHTML = '<div style="padding:10px; text-align:center; color:#aaa; font-size:12px;">등록된 프로젝트가 없습니다.</div>';
            return;
        }

        // 💡 [2026-09-03] 맨 위에 "새 프로젝트 AI 추출" 고정 항목 추가
        const newProjItem = '<div onclick="window._msPickNewProject()"'
            + ' onmouseover="this.style.background=\'#e6f6ea\';" onmouseout="this.style.background=\'#f6fff8\';"'
            + ' style="padding:8px 12px; cursor:pointer; border-bottom:2px solid #a8dab8; background:#f6fff8; transition:background .1s;">'
            + '<span style="font-weight:bold; color:#1f7a3d; font-size:12.5px;">➕ 새 프로젝트 AI 추출 — 이 메일로 프로젝트 정보 자동 분석</span>'
            + '<div style="font-size:10.5px; color:#888; margin-top:2px;">Gemini가 메일 내용을 분석해 프로젝트 정보를 채워줍니다. 검토 후 등록하세요.</div>'
            + '</div>';

        listEl.innerHTML = newProjItem + candidates.map(function(c, i) {
            // 표시 레이블: 모델명+인치 (없으면 파일명), 부제: 고객사 · 담당자
            const label = [c.model, c.inch ? c.inch + '"' : ''].filter(Boolean).join(' ') || c.file_name || '(프로젝트)';
            const sub   = [c.customer, c.assignee ? '담당: ' + c.assignee : ''].filter(Boolean).join(' · ');
            return '<div onclick="window._msSelectProjPickerItem(' + i + ')"'
                + ' onmouseover="this.style.background=\'#e8f4fd\';" onmouseout="this.style.background=\'#fff\';"'
                + ' style="padding:7px 12px; cursor:pointer; border-bottom:1px solid #f0f0f0; transition:background .1s; line-height:1.4;">'
                + '<span style="font-weight:bold; color:#1a4f7a;">' + escapeHtml(label) + '</span>'
                + (sub ? '&nbsp;<span style="font-size:11px; color:#888;">· ' + escapeHtml(sub) + '</span>' : '')
                + '</div>';
        }).join('');
    } catch(e) {
        listEl.innerHTML = '<div style="padding:10px; text-align:center; color:#e03131; font-size:12px;">로딩 실패 — 드라이브 연동 상태 확인 필요</div>';
        console.warn('[재분석 프로젝트 선택]', e);
    }
};

// 선택된 프로젝트 → textarea에 힌트 자동 삽입 후 드롭다운 닫기
window._msSelectProjPickerItem = function(idx) {
    const c = window._msProjPickerCache && window._msProjPickerCache[idx];
    if (!c) return;
    const label    = [c.model, c.inch ? c.inch + '"' : ''].filter(Boolean).join(' ') || c.file_name || '해당 프로젝트';
    const hintText = '이 메일은 ' + label + (c.customer ? ' (' + c.customer + ')' : '') + ' 건임';
    const ta = document.getElementById('ms-reanalyze-hint');
    if (ta) { ta.value = hintText; ta.focus(); }
    const listEl = document.getElementById('ms-proj-picker-list');
    const btn    = document.getElementById('ms-proj-picker-btn');
    if (listEl) listEl.style.display = 'none';
    if (btn) btn.textContent = '📋 프로젝트 선택 ▾';
};

// ─── 💡 [2026-09-03] "새 프로젝트 AI 추출" — 미분류 메일 재분석 모달에서 선택 시
//    1. 드롭다운 닫기
//    2. Gemini로 메일 내용 분석 → 프로젝트 필드 추출
//    3. 28-new-project-wizard.js의 _npwOpen으로 위자드 열기 (MP(EC) 상태, AI pre-fill)
window._msPickNewProject = async function() {
    // 드롭다운 닫기
    const listEl = document.getElementById('ms-proj-picker-list');
    const btn    = document.getElementById('ms-proj-picker-btn');
    if (listEl) listEl.style.display = 'none';
    if (btn) btn.textContent = '📋 프로젝트 선택 ▾';

    // 💡 [2026-09-04 버그 수정] 새 시트 분리 확인 — 현재 프로젝트를 덮어쓰지 않도록 사전 확인
    if (!confirm('이 메일로 새 프로젝트를 생성합니다.\n현재 프로젝트는 탭에 유지됩니다.\n\n계속하시겠습니까?')) return;

    // 새 시트 생성 + 화면 초기화 (startNewProject와 동일 패턴)
    if (window._openAsNewSheet) window._openAsNewSheet('new_' + Date.now(), null, null);
    if (window._resetToBlankNoConfirm) window._resetToBlankNoConfirm(true);

    // 재분석 모달 닫기 (위자드가 별도 창으로 열림)
    var _reanalModal = document.getElementById('ms-reanalyze-modal');
    if (_reanalModal) _reanalModal.style.display = 'none';

    const fileName = window._msReanalyzeTarget;
    const r = (window._msResults || []).find(function(x) { return x.fileName === fileName; });
    if (!r) {
        if (window._npwOpen) window._npwOpen({}, 'MP(EC)');
        return;
    }

    // 로딩 표시
    if (btn) { btn.textContent = '⏳ AI 분석 중...'; btn.disabled = true; }
    try {
        let prefill = {};
        if (window._npwExtractFromMail) {
            prefill = await window._npwExtractFromMail(r);
        }
        if (btn) { btn.textContent = '📋 프로젝트 선택 ▾'; btn.disabled = false; }

        // 위자드 열기 (MP(EC) 상태 자동 설정)
        if (window._npwOpen) {
            window._npwOpen(prefill, 'MP(EC)');
        } else {
            alert('위자드 모듈이 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.');
        }
    } catch (e) {
        if (btn) { btn.textContent = '📋 프로젝트 선택 ▾'; btn.disabled = false; }
        console.warn('[_msPickNewProject]', e);
        // 추출 실패 시 빈 위자드라도 열기
        if (window._npwOpen) window._npwOpen({}, 'MP(EC)');
    }
};

// 💡 미분류 메일 1건을 (선택적 사용자 힌트와 함께) 다시 분석해서 그 자리에서 결과를 갱신한다.
//    새로 매칭되면 다른 자동 경로(자동틱/배치분석)와 동일하게 업무 보관함(TaskInbox)에도 추가한다
//    (이미 보관함에 있으면 중복 추가하지 않음 — fileName 기준 대조, 기존 자동 경로와 동일 규칙).
window._msQueueReanalyze = async function(fileName, hint) {
    const r = (window._msResults || []).find(x => x.fileName === fileName);
    if (!r) return;
    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) { alert('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.'); return; }
    if (window.showToast) window.showToast('🔄 재분석 중... "' + (r.subject || '').substring(0, 24) + '"', 'info');
    try {
        const candidateList = window._msFilterCandidateProjects(await window._msLoadProjectIndex());
        const candidatesForAI = candidateList.length ? candidateList : null;
        const task = await msCallGemini(apiKey, {
            subject: r.subject, sender: r.sender, date: r.date, body: r.body, fileName: r.fileName
        }, candidatesForAI, null, hint || null);

        const projectTag = window._msResolveAiProjectMatch(task, candidatesForAI);
        const wasUnmatched = !r.project;
        r.task = task;
        r.project = window._msProjectTagLabel(projectTag);
        r._projectTag = projectTag;
        r.matchReason = (task && task['매칭근거']) || '';
        r.error = !task ? 'AI분석실패' : null;
        r.selected = !!task;
        r.reanalyzedAt = new Date().toISOString();
        r.reanalyzeHint = hint || '';

        // 💡 [2026-09-06 신규 → 2026-09-07 보완] 사용자가 직접 입력한 힌트("이 메일은 실제로 STELLAR32
        //    건 맞음" 등)는 이 1회 재분석 호출의 프롬프트에만 쓰이고 끝나면 그냥 버려지고 있었음 —
        //    실제로는 사람이 직접 확인해준 정답에 가까운 데이터라, 학습 로그(오매칭 신고와 같은 저장소)에
        //    남기고, 그 프로젝트의 토픽 키워드에도 반영한다(_tpAppendMailSignal — 메일 자동배치 성공 시와
        //    동일한, 이미 검증된 파이프라인 재사용).
        //    💡 [2026-09-07 사용자 피드백] "중/하로 분류돼 대기로 남는 업무는 확정이 아니니 학습에 쓰면
        //    안 될 것 같다" — 전적으로 동의. status==='matched'(AI 신뢰도 '상')로 확정된 경우에만 기록
        //    한다. 힌트를 줬는데도 여전히 애매(ambiguous)하거나 미분류로 남았다면, 사람이 준 정보조차
        //    AI를 확신시키지 못한 것이므로 확정된 사실로 취급하지 않고 아예 기록하지 않는다.
        if (hint && window._writeLearningEntry && projectTag && projectTag.status === 'matched') {
            const _rc = projectTag.candidates[0];
            if (_rc && _rc.drive_file_id) {
                window._writeLearningEntry(_rc.drive_file_id, {
                    type: 'reanalyze_hint',
                    reason: '미분류 재분석 힌트(확정)',
                    taskName: (task && task['업무명']) || '',
                    confidence: (task && task['매칭신뢰도']) || '',
                    matchedProjectId: _rc.drive_file_id,
                    matchedProjectName: _rc.file_name || _rc.model || _rc.customer || '',
                    matchBasis: _rc.model || _rc.customer || '',
                    matchKeywords: _rc.keywords ? _rc.keywords.slice(0, 8) : [],
                    sourceSnippet: (r.body || '').slice(0, 300),
                    userHint: hint
                });
                if (window._tpAppendMailSignal) {
                    window._tpAppendMailSignal(_rc.drive_file_id, task, { subject: r.subject, sender: r.sender, date: r.date, body2000: r.body, fileName: r.fileName });
                }
            }
        }

        if (task) {
            const priorityConfig = await window.loadPriorityConfig();
            const scoreResult = window._msComputeTotalScore(r, task, priorityConfig);
            r._score = scoreResult.total;
            r._scoreGrade = window._msScoreGrade(scoreResult.total, priorityConfig.cutline);
            r._scoreBreakdown = scoreResult.breakdown;
            r._alarmWorthy = scoreResult.total >= priorityConfig.cutline;
        }

        if (wasUnmatched && projectTag && task && window.TaskInbox) {
            const alreadyInInbox = window.TaskInbox.load().some(it => it.mailRaw && it.mailRaw.fileName === r.fileName);
            if (!alreadyInInbox) {
                const grade = r._scoreGrade || '⚪';
                const candidateNames = projectTag.candidates.map(c => c.model || c.customer).join(', ');
                const sourceLabel = `${grade}${r._score || 0}점 메일자동분석(재분석` + (projectTag.status === 'ambiguous' ? `, AI판단 후보: ${candidateNames})` : `, ${candidateNames})`);
                const mailRawObj = { subject: r.subject, sender: r.sender, date: r.date, body2000: r.body, fileName: r.fileName };
                window.TaskInbox.add(task, { source: sourceLabel, mailRaw: mailRawObj, matchedProject: projectTag, alarmWorthy: !!r._alarmWorthy });
            }
        }

        window._msSaveQueueToStorage();
        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
        window._msRenderQueueModal('unmatched');
        if (window.showToast) {
            if (task && projectTag && projectTag.status === 'matched') {
                window.showToast(`✅ 재분석 완료 — "${window._msProjectTagLabel(projectTag)}"로 매칭되어 업무 보관함에 추가됨`, 'info');
            } else if (task) {
                window.showToast('🔄 재분석 완료 — 여전히 미분류입니다(근거를 다시 확인해보세요)', 'warning');
            } else {
                window.showToast('⚠️ 재분석 실패(AI 분석에 실패했습니다)', 'error');
            }
        }
    } catch (e) {
        if (window.showToast) window.showToast('⚠️ 재분석 중 오류: ' + e.message, 'error');
    }
};

// ═══════════════════════════════════════════════════════════════════
// 💡 [미분류 → 키워드 제안] 지금 열려있는(멀티시트) 프로젝트들의 model/customer 조각이
//    미분류 메일 본문에 등장하는데 project_index.json의 keywords엔 없는 경우를 찾아서 제안.
//    실제 반영은 project_index.json의 해당 항목 keywords 배열에 append (승인 없이 자동으로
//    project_index.json 전체를 rebuild하지 않음 — Summary "메일키워드" 필드에도 함께 반영해서
//    나중에 그 프로젝트를 저장해도 유실되지 않게 함)
// ═══════════════════════════════════════════════════════════════════
// 💡 "모델코드처럼 보이는" 패턴을 뽑아내는 로컬 휴리스틱 (AI 호출 없음, 글자수 하한은 기존
//    매칭 로직과 동일하게 MS_MIN_KEYWORD_LEN=3 그대로 사용):
//    - 소수점 규격 표기 (4.3, 31.5, 32.0", 31.5MVD)
//    - 영문+숫자 조합 코드 (STELLAR32, S32, KTS320DPS01)
//    - 대문자 3자+ 제품라인명 (OBSIDIAN, SHUFFLER — 전부 대문자로만 쓰인 경우)
//    - Title Case 단어 (Obsidian, Shuffler처럼 첫 글자만 대문자인 실제 표기 — 흔한 인사말/상투어는
//      스톱워드로 제외). 예전엔 전부 대문자 패턴만 잡아서 "Obsidian"처럼 자주 쓰이는 실제 표기를 놓쳤음
// 💡 대소문자를 섞어 적든(Design/DESIGN) 상관없이 걸러지도록, 목록은 소문자로 저장하고 조회할 때도
//    소문자로 비교한다(예전엔 대소문자가 정확히 일치할 때만 걸러져서 "PROTO"는 막아도 "Proto"는
//    새고, 그 반대도 마찬가지인 허점이 있었음).
window._MS_KW_STOPWORDS = new Set([
    'Hi','Hello','Dear','Regards','Thanks','Thank','Please','Best','Kind','Sincerely',
    'From','Subject','Date','To','Cc','Re','Fwd','Fw','The','This','That','With','For',
    'And','Are','Was','Were','You','Your','We','Our','Team','Email','Mail','Meeting',
    'Update','Review','Request','Attached','File','Files','Report','Today','Tomorrow',
    'Yesterday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
    'January','February','March','April','May','June','July','August','September',
    'October','November','December','Project','Info','Information',
    'Sample','Samples','Regarding','Check','Spec','Specs','Sheet','Follow','Kindly',
    'Confirm','Details','Comments','Comment','Question','Questions','Issue','Issues',
    'Status','Progress','Schedule','Timeline','Reminder','Feedback','Action','Items',
    'Item','Result','Results','Summary','Overview','Note','Notes','Draft','Final',
    'Version','New','Old','Next','Last','First','Second','Week','Weekly','Monthly',
    // 💡 [노이즈 제거] 회사 서명란/주소 블록 — 거의 모든 메일 하단에 반복돼서 "매우 자주 등장하는
    //    키워드"처럼 보이지만 실제로는 특정 프로젝트와 아무 상관 없는 상투어
    'Kortek','Corp','Corporation','Venture','Town','Yeonsu','Incheon','Korea','Seoul','Songdo',
    'Tel','Fax','Phone','Mobile','Home','Website','Address','Center','Confidentiality',
    'Statement','Sent','Original','Message','Disclaimer','Copyright','Rights','Reserved',
    // 💡 직급/호칭 — 사람 이름과 함께 자주 등장하지만 프로젝트 식별과 무관
    'Manager','Senior','Director','Leader','Head','Engineer','Chief','President','Staff',
    'Sales','Marketing','Department','Division','Group','Representative','Executive',
    // 💡 개발단계(WBS L0) 용어 — 모든 프로젝트가 공통으로 쓰는 범용 단계명이라 특정 프로젝트를
    //    식별하지 못함 (getSystemPrompt의 개발단계 목록과 동일)
    'Proto','RFI','RFQ','NRE','Award','Kick','Off','Design','EVT','ES','DVT','PVT','FAI',
    'PP','SOP','MP','EC','RMA','EOL',
    // 💡 전자제품 업계 범용 스펙/부품 용어 — 특정 프로젝트가 아니라 업계 전체에서 공용으로 쓰임
    'Panel','Touch','Glass','Black','White','Blue','Red','Green','Yellow','Size','Type',
    'Price','Color','Gamut','Resolution','Frequency','Interface','Board','Cable','Bracket',
    'Cover','Base','Source','Contents','Model','Code','Vendor','Production','Technology',
    'Curved','Maker','Remark','Slim','Driving','Luminance','Contrast','Ratio','Application',
    'Expected','LED','PCB','BOM','CAD','USB','LCM','OSD','LGD','BOE','REV','Tool','Firmware',
    'Bezel','Scaler','Dir','Anthony'
].map(function(w) { return w.toLowerCase(); }));
// 💡 [노이즈 제거] 승인시스템 문서번호 패턴(예: OW-20260814-013, PE-20260818-038)처럼 날짜가 박힌
//    사무행정 문서 ID는 프로젝트 키워드가 아니라 그 자체로 걸러야 함
window._MS_DOC_ID_PATTERN = /^[A-Z]{1,3}-\d{8}-\d{2,4}$/;
window._MS_SUSPICIOUS_PATTERNS = [
    /\b\d{1,3}\.\d{1,2}\s*(?:"|인치|MVD)?/g,
    /\b[A-Z][A-Z0-9\-]{1,}[0-9]\b/g,
    /\b[A-Z]{3,}\b/g,
    /\b[A-Z][a-z]{2,}\b/g
];
