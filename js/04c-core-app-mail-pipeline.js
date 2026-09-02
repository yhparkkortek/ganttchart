// [분리됨] 원본: js/04-core-app.js 의 1182~2811행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: project_index.json 메일 자동처리 파이프라인용 경량 프로젝트 인덱스
    // ============================================================
    // 💡 project_index.json — 메일 자동처리 파이프라인용 경량 프로젝트 인덱스
    //    각 프로젝트 저장 시(saveToGoogleDrive 성공 직후) 이 인덱스에 해당 프로젝트
    //    항목만 upsert 한다. Flask 백엔드가 이 파일 하나만 읽어서 메일↔프로젝트를
    //    매칭하므로, 매칭 때마다 전체 프로젝트 파일을 열 필요가 없다.
    //    (사전 협의: ① 저장 시 자동 갱신 A안 채택, Flask 쪽 일 1회 보정 스캔은 백엔드 작업)
    // ============================================================
    const PROJECT_INDEX_FILENAME = 'project_index.json';
    const PRIORITY_CONFIG_FILENAME = 'PriorityScore_Shared.json';

    // 💡 [우선순위 점수] 회사 전체 공유 설정 — 직함별 점수, 긴급키워드 사전, 커트라인
    //    Holidays_Shared.json과 동일한 find/create 패턴
    window._priorityConfigDefault = function() {
        return {
            titleScores: {
                '경영진 (회장·이사·본부장·연구소장)': 10,
                '관리직 (팀장·파트장·섹션리더·감사)': 8,
                '실무직 (매니저·조장·사원)': 5
            },
            externalCustomerScore: 10,   // 발신자 도메인이 kortek.co.kr이 아니면 가산
            urgentKeywords: [
                { word: '긴급', score: 8 },
                { word: '중요', score: 6 },
                { word: '공지', score: 4 },
                { word: '알림', score: 3 }
            ],
            toMeScore: 10,     // 내가 To(직접수신)
            ccMeScore: 3,      // 내가 Cc(참조)
            importanceHighScore: 5,  // 발신자가 Outlook 등에서 '중요! 높음'으로 표시
            cutline: 50        // 💡 이 점수 이상이면 우선순위 높음으로 표시 — PM이 UI에서 직접 조정
        };
    };

    window.findPriorityConfigFile = async function(token) {
        const folderId = await window.getOrCreateConfigFolder(token);
        return window._findOrMigrateFile(token, PRIORITY_CONFIG_FILENAME, folderId);
    };

    window.loadPriorityConfig = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return window._priorityConfigDefault();
            const fileId = await window.findPriorityConfigFile(token);
            if (!fileId) return window._priorityConfigDefault();
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            // 누락 필드는 기본값으로 보강 (신규 필드 추가돼도 기존 저장 파일과 호환)
            const merged = Object.assign(window._priorityConfigDefault(), data);
            // 💡 1회성 마이그레이션 — localStorage 중요 키워드 → urgentKeywords로 이전
            const legacyKw = localStorage.getItem('mail_global_important_kw');
            if (legacyKw) {
                const legacyList = legacyKw.split(',').map(s => s.trim()).filter(Boolean);
                const existing = (merged.urgentKeywords || []).map(k => k.word.toLowerCase());
                legacyList.forEach(word => {
                    if (!existing.includes(word.toLowerCase())) {
                        merged.urgentKeywords.push({ word, score: 7 });
                    }
                });
                localStorage.removeItem('mail_global_important_kw');
                window.savePriorityConfig(merged); // fire-and-forget
                console.log(`💡 중요 키워드 마이그레이션 완료: ${legacyList.join(', ')}`);
            }
            return merged;
        } catch(e) { console.warn('PriorityScore_Shared.json 로드 실패, 기본값 사용:', e); return window._priorityConfigDefault(); }
    };

    window.savePriorityConfig = async function(config) {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;
            const fileId = await window.findPriorityConfigFile(token);
            const body = JSON.stringify(config);
            if (fileId) {
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: body
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'priority_config_boundary';
                const metadata = { name: PRIORITY_CONFIG_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body
                    + "\r\n--" + boundary + "--";
                await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: multipartBody
                });
            }
            return true;
        } catch(e) { console.error('PriorityScore_Shared.json 저장 실패:', e); return false; }
    };

    // 💡 [성능 수정] AddressBook._driveFileId/폴더 캐시와 동일한 이유 — 이 파일 ID는 세션 중 바뀌지 않는데,
    //    캐시가 없어서 저장(updateProjectIndexEntry)할 때마다 매번 files.list 조회(최대 2번, 루트 이동
    //    마이그레이션까지 겹치면 3번)를 새로 하고 있었다. "저장 한 번에 API를 몇 번이나 두드리냐"는
    //    질문의 답 중 하나 — 이 조회만 캐싱해도 저장마다 1~2콜이 줄어든다.
    window._projectIndexFileId = null;
    window.findProjectIndexFile = async function(token) {
        if (window._projectIndexFileId) return window._projectIndexFileId;
        const folderId = await window.getOrCreateConfigFolder(token);
        const id = await window._findOrMigrateFile(token, PROJECT_INDEX_FILENAME, folderId);
        if (id) window._projectIndexFileId = id;
        return id;
    };

    // 쉼표로 구분된 메일키워드 문자열 → 정제된 배열 (공백 제거, 빈 항목 제거, 중복 제거)
    window._parseMailKeywords = function(raw) {
        if (!raw) return [];
        const seen = new Set();
        raw.split(',').forEach(function(s) {
            const v = s.trim();
            if (v) seen.add(v);
        });
        return Array.from(seen);
    };

    // 💡 [2026-08-29 신규] "발신인 이름만으로 오매칭됐다"는 지적 대응 — 사람이 보내는 메일에는 본인
    //    이름이 서명란에 항상 등장하므로, 그 사람 이름이 어느 프로젝트의 "메일키워드"에 등록돼 있으면
    //    그 사람이 보내는 모든 메일(내용과 무관하게)이 그 프로젝트로 자동 매칭돼버린다. 이미
    //    _msSuggestKeywordsForUnmatched(20195줄 부근)가 "키워드 제안" 단계에서 주소록 이름을 걸러내는
    //    knownNameTokens 로직을 갖고 있었지만, 그건 ①AI가 아직 못 찾은 메일에서 "새 키워드를 제안할 때"만
    //    적용되고 ②영문 패턴(A-Z 정규식)만 훑어서 한글 이름("박용훈")은 애초에 후보로도 안 잡혔다 —
    //    그래서 "메일키워드" 칸에 누군가(예: 담당자 본인)가 직접 한글 이름을 수동으로 입력해두면 이 필터를
    //    완전히 우회해서 그대로 매칭에 쓰였다. 여기서는 실제로 "이 사람이 보낸 메일과 매칭시킬 키워드
    //    목록"을 만드는 지점(buildProjectIndexEntry) 자체에서 주소록에 등록된 이름과 겹치는 키워드를
    //    걸러내서, 어떤 경로로 이름이 끼어들었든(수동 입력·붙여넣기·향후 다른 자동 제안 경로) 매칭에는
    //    절대 안 쓰이게 막는다. Summary 탭의 "메일키워드" 입력값 자체는 지우지 않음 — 매칭에서만 뺀다.
    window._msIsKnownPersonName = function(token) {
        const t = String(token || '').trim().toLowerCase();
        if (!t) return false;
        const book = (window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : [];
        for (let i = 0; i < book.length; i++) {
            const p = book[i];
            for (const n of [p.name, p.nameEn]) {
                const full = String(n || '').trim().toLowerCase();
                if (!full) continue;
                if (full === t) return true;
                // 성/이름을 띄어쓰기로 등록해뒀으면(예: "Jun Kim") 낱말 단위로도 같은 사람으로 간주
                if (full.split(/[\s,]+/).filter(Boolean).indexOf(t) !== -1) return true;
            }
        }
        return false;
    };

    // 현재 열려 있는 프로젝트의 인덱스 항목 생성 (모델/고객사/담당자/인치 4필드 + 커스텀 키워드)
    // 💡 [긴급 버그 수정] pmOverride를 안 넘기면 window.projectMeta(전역, 실시간)를 읽는데, 이 함수의
    //    호출부(updateProjectIndexEntry)에 await가 여러 번 있어서 그 사이 다른 프로젝트로 시트가
    //    전환되면 "옛 프로젝트의 driveFileId"에 "이미 바뀐 새 프로젝트의 projectMeta"가 합쳐져
    //    project_index.json에 저장되는 사고가 실제로 있었음(파일명↔모델명이 서로 안 맞는 항목들로 확인됨).
    //    호출부에서 await 전에 미리 캡처한 스냅샷을 pmOverride로 넘겨서 이 드리프트를 원천 차단한다.
    window.buildProjectIndexEntry = function(driveFileId, dynamicFileName, pmOverride, materialsOverride) {
        const pm = pmOverride || window.projectMeta || {};
        // 💡 고객사명은 매칭 키워드에서 제외 — 한 고객사가 여러 프로젝트를 가진 경우
        //    (예: LNW의 STELLAR32/OBSIDIAN) 전부 후보로 묶여버려 변별력이 없음.
        //    customer 필드 자체는 화면 표시용으로만 남기고, keywords 배열엔 안 넣음.
        const baseFields = [pm.모델명, pm.고객모델명, pm.인치, pm.프로젝트명].filter(Boolean);
        // 💡 [2026-08-29 버그 수정] "발신인 이름만으로 오매칭됐다"는 지적 — 메일키워드 칸에 사람 이름이
        //    (직접 입력 등으로) 들어가 있으면, 그 사람이 보내는 모든 메일이 서명란 때문에 내용과 무관하게
        //    이 프로젝트로 매칭돼버린다. 주소록에 등록된 이름과 겹치는 항목은 매칭용 키워드에서 제외
        //    (Summary 탭 입력값 자체는 그대로 둠 — window._msIsKnownPersonName 참고).
        const customKeywords = window._parseMailKeywords(pm.메일키워드).filter(function(kw) { return !window._msIsKnownPersonName(kw); });
        // 💡 [2026-08-20] "분석용" 체크된 주요 자재의 PN/설명도 매칭 키워드로 편입 — 공용 부품은
        //    체크 안 하는 게 원칙이므로, 여기 들어오는 건 이 프로젝트를 특정할 만한 것들만 남음.
        const materials = materialsOverride || (window.tabData && window.tabData.projectMaterials) || [];
        const materialKeywords = materials
            .filter(function(m) { return m && m.useForAnalysis; })
            .flatMap(function(m) { return [m.ktkPn, m.description].filter(Boolean); });
        const keywords = Array.from(new Set(baseFields.concat(customKeywords).concat(materialKeywords)));
        return {
            drive_file_id: driveFileId,
            file_name: dynamicFileName,
            model: pm.모델명 || pm.고객모델명 || '',
            customer: pm.고객사 || '',
            assignee: pm.프로젝트담당자 || '',
            inch: pm.인치 || '',
            keywords: keywords,          // Stage 1 AI 매칭에 사용할 전체 키워드 (4필드 + 커스텀)
            completed: pm.완료여부 === '완료', // 💡 [2026-08-29 신규] 완료 프로젝트 메일 자동매칭 제외용 — _msMatchProjects 참고
            // ✅ [폴더 로드맵] team 필드 — 지금은 Drive 폴더를 건드리지 않고 인덱스에만 팀 구분을 심어둠.
            //    물리적 폴더 분리 전에도 팀별 그룹핑·필터링을 UI에서 쓸 수 있게 하고,
            //    나중에 폴더 분리가 확정되면 이 필드 값을 기준으로 일괄 이동(migration)하면 된다.
            //    Summary 탭 "팀" 항목(pm.팀 또는 pm.개발팀)이 있으면 그 값을 사용한다.
            team: pm.팀 || pm.개발팀 || '',
            updated_at: new Date().toISOString()
        };
    };

    // 💡 [팀 그룹핑] 모달 열기 시 project_index.json을 가볍게 읽어 팀 정보를 보강.
    //    appProperties.team이 없는 기존 파일도 인덱스에서 팀을 찾아 표시할 수 있게 함.
    //    5분 캐시 — 같은 세션에서 여러 번 모달을 열어도 중복 API 호출 없음.
    window._piModalCache    = null;
    window._piModalCacheTs  = 0;
    window._loadProjectIndexForModal = async function() {
        const TTL = 5 * 60 * 1000;
        if (window._piModalCache && (Date.now() - window._piModalCacheTs < TTL)) return window._piModalCache;
        try {
            const tokenObj = gapi.client.getToken ? gapi.client.getToken() : null;
            const token = (tokenObj && tokenObj.access_token) || window.googleAccessToken;
            if (!token) return [];
            const indexFileId = await window.findProjectIndexFile(token);
            if (!indexFileId) return [];
            const res = await fetch('https://www.googleapis.com/drive/v3/files/' + indexFileId + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } });
            if (!res.ok) return [];
            const data = await res.json();
            window._piModalCache   = (data && data.projects) || [];
            window._piModalCacheTs = Date.now();
            return window._piModalCache;
        } catch(e) { return []; }
    };
    // project_index.json 저장 성공 시 캐시 무효화 (updateProjectIndexEntry 뒤에서 호출)
    window._invalidatePiModalCache = function() { window._piModalCache = null; window._piModalCacheTs = 0; };

    // project_index.json을 통째로 읽어와서 해당 프로젝트 항목만 upsert 후 다시 통째로 저장
    // (프로젝트 수가 많지 않은 전제 — 수백 개 넘어가면 서버 사이드 부분갱신 방식으로 전환 필요)
    window.updateProjectIndexEntry = async function(driveFileId, dynamicFileName) {
        // 💡 [긴급 버그 수정] await 시작 전에 지금 이 저장이 실제로 속한 projectMeta를 즉시 스냅샷.
        //    아래 await들(findProjectIndexFile/fetch) 도중 다른 시트로 전환돼도 이 스냅샷은 안 바뀌므로,
        //    엉뚱한 프로젝트의 최신 정보가 이 driveFileId 밑에 섞여 들어가는 사고를 막는다.
        const pmSnapshot = Object.assign({}, window.projectMeta || {});
        // 💡 주요 자재 목록도 같은 이유로 await 전에 스냅샷 — 그 사이 다른 시트로 전환돼도 안전하게
        const materialsSnapshot = ((window.tabData && window.tabData.projectMaterials) || []).slice();
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token || !driveFileId) return false;

            const indexFileId = await window.findProjectIndexFile(token);
            let indexData = { projects: [] };
            if (indexFileId) {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&supportsAllDrives=true`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const loaded = await res.json();
                if (loaded && Array.isArray(loaded.projects)) indexData = loaded;
            }

            const entry = window.buildProjectIndexEntry(driveFileId, dynamicFileName, pmSnapshot, materialsSnapshot);
            const idx = indexData.projects.findIndex(function(p) { return p.drive_file_id === driveFileId; });
            if (idx === -1) indexData.projects.push(entry);
            else indexData.projects[idx] = entry;

            const body = JSON.stringify(indexData);
            if (indexFileId) {
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media&supportsAllDrives=true`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: body
                });
            } else {
                const folderId = await window.getOrCreateConfigFolder(token);
                const boundary = 'proj_index_boundary';
                const metadata = { name: PROJECT_INDEX_FILENAME, mimeType: 'application/json', parents: [folderId] };
                const multipartBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                    + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + body
                    + "\r\n--" + boundary + "--";
                const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: multipartBody
                });
                const created = await createRes.json();
                if (created && created.id) window._projectIndexFileId = created.id; // 💡 방금 만든 파일 ID를 캐시에 반영
            }
            if (window._invalidatePiModalCache) window._invalidatePiModalCache(); // 팀 그룹핑 캐시 무효화
            return true;
        } catch (err) { console.error('project_index.json 갱신 실패 (메일 자동처리 매칭에 영향 — 저장 자체는 정상 완료됨):', err); return false; }
    };

    // 💡 화면/데이터를 빈 상태로 초기화 (확인창 없이) — startNewProject과 [멀티시트] 마지막 시트를 닫았을 때 공용으로 사용
    window._resetToBlankNoConfirm = function(skipModal) {
        globalData = []; existingDevStages = []; filterColumns = []; currentFilters = {}; window.projectDistributions = [];
        colIdx = { no: -1, bogo: -1, start: -1, plan: -1, period: -1, dur1: -1, dur2: -1, dur3: -1, dur4: -1, assignee: -1, taskType1: -1, taskType2: -1, taskType3: -1, taskType4: -1, status: -1, customer: -1, model: -1, inch: -1, devStage: -1, content: -1, answer: -1, chart: -1, wbs: -1 };
        window.changeLogs = []; window.lastSavedLogCount = 0;
        window.currentDriveFileId = null; window.currentDriveFileName = null;
        window.projectMeta = {}; window.tabData = {};
        window._compareTargetId = null;
        if (window.loadScheduleBaselines) window.loadScheduleBaselines(); // 💡 [버그 수정] 프로젝트별 계획 분리

        if (typeof renderTable === 'function') renderTable(globalData);
        if (window.clearAllTabFields) window.clearAllTabFields(); // 💡 Summary/Brief SPEC/M.C Table/Address까지 함께 비움
        window.updateCurrentFileLabel();
        window.renderSheetTabsBar();
        if (!skipModal) document.getElementById('new-project-modal-overlay').style.display = 'flex';
    };

    // 💡 새 프로젝트 시작: 현재 화면/데이터를 완전히 초기화 (Gantt + 다른 모든 탭) — [멀티시트] 새 빈 시트로 추가
    //    🔒 [설계 변경] 비밀번호 보호를 "이 버튼을 눌렀을 때"가 아니라, 실제로 새 드라이브 파일이
    //    "생성되는 순간"(_saveToGoogleDriveRaw, !fileId일 때)으로 옮겼다. 예전엔 이 버튼에만 걸려있어서,
    //    버튼을 거치지 않고 그냥 초기/빈 상태(프로젝트 아무것도 없거나 전부 닫은 상태)에서 곧바로
    //    타이핑하거나 엑셀을 드래그해 저장하면 비밀번호 확인 없이 새 프로젝트가 등록되는 구멍이 있었다.
    //    "새 프로젝트 만들기"라는 화면 초기화 자체는 아직 아무것도 만든 게 아니므로(저장 전까지는
    //    로컬 뷰만 비우는 것) 여기서는 더 이상 비밀번호를 묻지 않고, 실제로 등록(첫 저장)될 때 막는다.
    window.startNewProject = function() {
        if (!confirm(window._t('현재 화면의 내용을 모두 지우고(간트/Summary/Customer SPEC/M.C Table/Address 포함) 새 프로젝트를 시작하시겠습니까?\n(저장하지 않은 변경사항은 사라집니다)', 'Clear all data (Gantt/Summary/Customer SPEC/M.C Table/Address) and start a new project?\n(Unsaved changes will be lost)'))) return;

        window._openAsNewSheet('new_' + Date.now(), null, null);
        window._resetToBlankNoConfirm();
    };

    // ═══════════════════════════════════════════════════════════
    // 🚀 [새 프로젝트 자동 시작] "참조 엑셀 다운로드 → 작성 → 화면에 드래그"를 수동으로 하는 기존 방식은
    //    그대로 두고, 구글 드라이브 연동이 이미 되어 있는 사용자는 참조 엑셀을 바로 가져와 화면에
    //    반영할 수 있게 한다. (다운로드/재업로드 왕복 없이, 이미 화면에 있는 handleFiles() 가져오기
    //    파이프라인을 그대로 재사용 — 드래그로 불러온 것과 완전히 동일하게 처리됨)
    // ═══════════════════════════════════════════════════════════
    window.REFERENCE_SHEET_ID = '1lhg8Usuj-SP9Bsp_gs8Cnz9jnvQF3D7T';
    window.autoImportReferenceExcel = async function() {
        const btn = document.getElementById('new-project-auto-import-btn');
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;

        // 💡 구글 드라이브 미연동 상태면 자동 가져오기가 불가능 — 연동을 제안하고, 원치 않으면
        //    기존처럼 아래 "참조 엑셀 다운로드" 링크로 수동 진행하면 됨(이 버튼은 아무것도 건드리지 않음)
        if (!token) {
            if (confirm(window._t(
                '자동으로 가져오려면 먼저 구글 드라이브 연동이 필요합니다.\n지금 연동하시겠습니까? (연동 후 이 버튼을 다시 눌러주세요)',
                'Connecting Google Drive is required to auto-import.\nConnect now? (After connecting, click this button again.)'
            ))) {
                if (window.handleAuthClick) window.handleAuthClick();
            }
            return;
        }

        if (btn) { btn.disabled = true; btn.textContent = window._t('⏳ 가져오는 중...', '⏳ Importing...'); }

        // 💡 응답 실패 시 Drive가 돌려준 실제 오류 메시지(권한 없음/파일 없음 등)까지 최대한 뽑아냄 —
        //    "HTTP 403"만으로는 원인 파악이 안 돼서, 이 앱의 다른 Drive 호출부(주소록 불러오기 등)와
        //    동일하게 error.message까지 붙여서 보여준다.
        async function describeFailure(resp) {
            let detail = '';
            try { const j = await resp.json(); detail = (j && j.error && j.error.message) || ''; } catch (e) {}
            return 'HTTP ' + resp.status + (detail ? ' - ' + detail : '');
        }

        try {
            const authHeader = { 'Authorization': `Bearer ${token}` };
            let blob = null; let lastErr = '';

            // 1차: 참조 파일이 "구글 시트"(네이티브 문서)라고 가정하고 xlsx로 변환(export)해서 받는다.
            //    docs.google.com/.../export 링크(수동 다운로드용)는 브라우저 직접 이동만 되고 CORS 때문에
            //    fetch()로는 못 읽으므로, 이미 연동된 OAuth 토큰으로 Drive REST API를 직접 호출한다.
            try {
                const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                const exportUrl = `https://www.googleapis.com/drive/v3/files/${window.REFERENCE_SHEET_ID}/export?mimeType=${encodeURIComponent(mimeType)}`;
                const resp1 = await fetch(exportUrl, { headers: authHeader });
                if (resp1.ok) blob = await resp1.blob();
                else lastErr = await describeFailure(resp1);
            } catch (e) { lastErr = e.message; }

            // 2차 폴백: 만약 참조 파일이 실제로는 이미 업로드된 xlsx 원본이라면(구글 시트가 아니라면)
            //    export가 아니라 원본 그대로 받는 alt=media가 맞다 — 이 앱의 주소록 불러오기와 동일 패턴.
            if (!blob) {
                try {
                    const mediaUrl = `https://www.googleapis.com/drive/v3/files/${window.REFERENCE_SHEET_ID}?alt=media&supportsAllDrives=true`;
                    const resp2 = await fetch(mediaUrl, { headers: authHeader });
                    if (resp2.ok) blob = await resp2.blob();
                    else lastErr += ' / ' + await describeFailure(resp2);
                } catch (e) { lastErr += ' / ' + e.message; }
            }

            if (!blob) throw new Error(lastErr || '알 수 없는 오류');

            const file = new File([blob], '참조_엑셀.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            document.getElementById('new-project-modal-overlay').style.display = 'none';
            // 💡 드래그로 불러올 때와 동일한 진입점 — 컬럼 매핑/레벨 판별/초기 잠금 등 기존 로직을 100% 재사용
            handleFiles({ target: { files: [file] } });
            if (window.showToast) window.showToast(window._t(
                '📥 참조 엑셀을 자동으로 불러왔습니다. 내용을 채워서 진행해주세요.',
                '📥 Reference Excel imported automatically. Fill it in to continue.'
            ));
        } catch (err) {
            console.error('참조 엑셀 자동 가져오기 실패:', err);
            alert(window._t(
                '⚠️ 참조 엑셀을 자동으로 가져오지 못했습니다.\n(' + err.message + ')\n\n아래 "참조 엑셀 다운로드" 링크로 수동 진행해주세요.',
                '⚠️ Failed to auto-import the reference Excel.\n(' + err.message + ')\n\nPlease use the "Download Reference Excel" link below instead.'
            ));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = window._t('🚀 자동으로 가져오기', '🚀 Auto Import'); }
        }
    };

    // 💡 [2026-08-24] 멤버-1,2 담당자 라벨(sum-*-label)의 기본 텍스트 — clearAllTabFields(새 프로젝트
    //    시작)와 populateTabData(시트 전환/프로젝트 로드) 양쪽에서 공유하는 단일 출처. 예전엔 각자
    //    따로 관리돼서, 시트 전환 시 이 기본값을 몰라 빈 값이면 그냥 건너뛰거나(→ 이전 시트의 라벨이
    //    그대로 남는 사고) 무조건 지워버리는(→ 매번 빈칸이 되는 사고) 문제가 있었음.
    window.DEFAULT_MEMBER_LABELS = {
        'sum-pm-label': '프로젝트 담당자',
        'sum-mech-label': '기구 담당자',
        'sum-hw-label': 'H/W 담당자',
        'sum-fw-label': 'F/W 담당자',
        'sum-module-label': 'BLU 담당자',
        'sum-tsp-label': 'TSP 담당자',
        'sum-lcm-label': 'LCM 담당자',
        'sum-slimming-label': 'Slimming 담당자',
        'sum-cutting-label': 'Cutting 담당자',
        'sum-tooling-label': 'Tooling 담당자'
    };
    // 💡 Summary/Brief SPEC/M.C Table/Address 탭 필드를 전부 비움 (populateTabData는 "채우기"만 하고
    //    비어있는 값은 건너뛰기 때문에, 새 프로젝트 시작 시 기존 값이 그대로 남는 문제를 방지)
    window.clearAllTabFields = function() {
        document.querySelectorAll('#tab-summary input, #tab-summary textarea').forEach(function(el) { el.value = ''; });
        // 💡 프로젝트 멤버-1,2의 담당자 라벨(sum-*-label)은 자유롭게 수정할 수 있지만,
        //    새 프로젝트를 시작할 때는 항상 아래 기본 라벨로 복원되어야 한다.
        Object.keys(window.DEFAULT_MEMBER_LABELS).forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = window.DEFAULT_MEMBER_LABELS[id];
        });
        ['briefspec-body', 'address-table-body', 'mctable-body'].forEach(function(id) {
            const el = document.getElementById(id); if (el) el.innerHTML = '';
        });
        if (window.renderMember3Rows) window.renderMember3Rows([]);
    };

    // 💡 저장 성공처럼 "확인" 없이 넘어가도 되는 알림 — 잠깐 떴다가 자동으로 사라짐
    window._toastStack = [];
    window._toastH = 64; // 토스트 1개 높이 — 아래 showToast의 고정 크기(width/max-height)와 일치시켜야 스택이 안 겹침

    window._toastReposition = function() {
        window._toastStack.forEach(function(el, i) {
            const bottom = 24 + i * (window._toastH + 8);
            el.style.bottom = bottom + 'px';
        });
    };

    window.showToast = function(message, type, duration) {
        type = type || 'success';
        // 💡 [2026-08-29 파스텔 통일] 채도 높은 solid 배경(빨강/주황/진남색)+흰 글자 대신, 다른 곳과 동일한
        //    4색 파스텔 기준(옅은 배경 + 진한 글자 + 옅은 테두리)으로 교체.
        const themeMap = {
            error:   { bg: '#fbe4e2', text: '#b1432f', border: '#eeb0ac' },
            info:    { bg: '#eef1f3', text: '#495057', border: '#ced4da' },
            warning: { bg: '#fbead9', text: '#a85d0a', border: '#edbf85' },
            success: { bg: '#e8f4fd', text: '#1a4f7a', border: '#a5c8f0' },
        };
        const theme = themeMap[type] || themeMap.success;
        const ms = duration || (type === 'error' ? 5000 : type === 'info' ? 2500 : 3000);
        const toast = document.createElement('div');
        toast.textContent = message;
        const initBottom = 24 + window._toastStack.length * (window._toastH + 8);
        // 💡 [2026-08-29 크기 통일] min/max-width 범위 + 줄 수 제한 없음이라 메시지 길이에 따라 토스트마다
        //    폭·높이가 들쭉날쭉했다(길게 줄바꿈되면 아래 토스트와 겹치기도 함). width 고정 + 최대 2줄까지만
        //    보이고 넘치면 …로 잘라서, 메시지 길이와 무관하게 항상 같은 크기의 토스트가 뜨도록 통일.
        // 💡 [2026-08-30 수정] 2줄 제한이었는데 메시지가 3줄로 꺾이는 경우가 종종 있어 3번째 줄이 통째로
        //    잘려 안 보이는 문제 — 토스트 바깥 크기(320×64)는 그대로 고정하고, 안쪽 여백을 살짝 줄이고
        //    글자 크기/줄간격을 낮춰서 같은 박스 안에 3줄까지 들어가도록 조정.
        toast.style.cssText = `
            position:fixed; bottom:${initBottom}px; right:24px; z-index:999999;
            background:${theme.bg}; color:${theme.text}; border:1px solid ${theme.border};
            padding:10px 16px; border-radius:8px; font-size:11px; font-weight:bold; line-height:1.3;
            box-shadow:0 4px 14px rgba(0,0,0,0.18); width:320px; height:64px; white-space:pre-line;
            display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
            opacity:0; transform:translateY(8px); box-sizing:border-box;
            transition:opacity 0.25s, transform 0.25s, bottom 0.25s;
        `;
        document.body.appendChild(toast);
        window._toastStack.push(toast);
        requestAnimationFrame(function() {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(function() {
                toast.remove();
                const idx = window._toastStack.indexOf(toast);
                if (idx !== -1) window._toastStack.splice(idx, 1);
                window._toastReposition();
            }, 300);
        }, ms);
    };

    // 💡 [긴급 버그 수정] 저장 함수 내부에 여러 await 지점(mergeRemoteDistributions, fetch)이 있는데,
    //    그 사이에 "다른 프로젝트 시트로 전환"이 끼어들면 globalData/currentDriveFileId 등 전역 변수가
    //    통째로 바뀐 뒤, 이 저장이 (전환 전에 캡처해둔) 옛 fileId로 완료되면서 "전환된 새 프로젝트의
    //    데이터"를 "원래 프로젝트의 파일"에 덮어쓰는 심각한 사고가 날 수 있었음(fileId는 초반에,
    //    globalData 등 내용은 await 이후에 읽다 보니 서로 다른 시점의 상태가 섞임). 게다가 저장이 끝나며
    //    window.currentDriveFileId/lastSavedLogCount를 다시 덮어써서, 이미 전환된 새 시트의 상태까지
    //    같이 오염시켰음. 저장·시트전환을 전부 하나의 대기열로 직렬화해서 절대 겹치지 않게 한다.
    window._saveQueue = Promise.resolve();
    window._runSerialized = function(fn) {
        const next = window._saveQueue.then(fn, fn);
        window._saveQueue = next.catch(function() {}); // 큐가 끊기지 않도록(실패해도 다음 작업은 진행)
        return next;
    };

    // 💡 [2026-08-25 공용화] "지금 화면에 마지막 저장 이후 실제로 안 저장한 변경사항이 있는가"를 판단하는
    //    단일 기준 — closeSheet/switchToSheetWithSave/selectProject 세 곳에서 각자 똑같은 식을 복붙해
    //    쓰고 있던 걸 한 곳으로 모았다(따로 관리하면 한쪽만 고치고 잊어버리는 드리프트 위험이 있음).
    //    ⚠️ 이름이 비슷한 _hasUnsavedProjectData()와는 다른 개념이다 — 그쪽은 "화면에 저장할 내용이
    //    조금이라도 있는가"(완전히 빈 화면인지 판정용)이고, 이건 "마지막 저장 시점 대비 바뀐 게 있는가"다.
    window._hasUnsavedChangesNow = function() {
        const currentLogs = window.changeLogs ? window.changeLogs.length : 0;
        const savedLogs = window.lastSavedLogCount || 0;
        return currentLogs > savedLogs || !!window._nonGanttDirty || !!window._cpThemeDirty;
    };

    // 💡 [버그 수정] "프로젝트 열기"가 시트 전환 전에 현재 작업을 자동 저장하려다가, 빈/기본 시트에서도
    //    "필수 정보 입력" 검증부터 걸려서 프로젝트 목록 자체를 못 여는 문제가 있었음(아래 selectProject 참고).
    //    저장할 실제 내용이 있는지부터 판단하는 로직을 별도 함수로 빼서 저장 전에 미리 확인할 수 있게 한다.
    window._hasUnsavedProjectData = function() {
        const hasGanttData = globalData && globalData.length > 1;
        if (hasGanttData) return true;
        const td = window.collectTabData ? window.collectTabData() : (window.tabData || {});
        const pm = window.projectMeta || {};
        // 💡 [버그 수정] Brief SPEC / M.C Table은 화면에 "빈 입력 행"이 기본으로 깔려 있는데,
        //    _readRowsFromTbody()가 내용 유무와 무관하게 <tr>이 있으면 무조건 담기 때문에, 아무것도
        //    입력하지 않은 초기 화면에서도 mcTable.length === 1({category:""} 한 줄)이 되어 "저장할
        //    데이터가 있다"로 잘못 판정됐다(실측 확인). 그래서 프로젝트를 하나도 안 연 none 페이지에서
        //    "프로젝트 열기"·"저장"을 누르면 곧바로 필수항목 안내가 떴다.
        //    → 행의 "존재"가 아니라 실제로 채워진 "내용"이 하나라도 있는지로 판단한다.
        const _rowsHaveContent = function(rows) {
            return !!(rows && rows.some(function(r) {
                return r && Object.keys(r).some(function(k) {
                    const v = r[k];
                    return v !== null && v !== undefined && String(v).trim() !== '';
                });
            }));
        };
        // 💡 [빈틈 보완] td.mcTable은 mcRevisions['R1']의 별칭일 뿐이라, R2~R5에서 작업했거나
        //    제품구분자(mcRevisionsByUnit)별로 작업한 내용은 여기에 안 잡혔다. 모든 리비전·모든
        //    제품구분자를 훑어서 하나라도 내용이 있으면 "저장할 데이터 있음"으로 본다.
        const _anyMcContent = function() {
            const buckets = [];
            if (td.mcRevisions) buckets.push(td.mcRevisions);
            const byUnit = td.mcRevisionsByUnit || {};
            Object.keys(byUnit).forEach(function(u) { if (byUnit[u]) buckets.push(byUnit[u]); });
            return buckets.some(function(revMap) {
                return Object.keys(revMap).some(function(rev) { return _rowsHaveContent(revMap[rev]); });
            });
        };
        return !!(
            _rowsHaveContent(td.briefSpec) ||
            _rowsHaveContent(td.mcTable) ||
            _anyMcContent() ||
            // 💡 [버그 수정] pm.memberLabels(담당자 "라벨" 텍스트 — 기본값이라도 항상 채워져 있음, 예:
            //    "프로젝트 담당자")가 객체라서 String(pm[k])가 "[object Object]"로 항상 참(truthy)이 되어,
            //    아무것도 입력한 적 없는 완전히 빈 화면(구글 드라이브 연동 직후, 또는 모든 시트를 닫은
            //    직후)에서도 "저장할 데이터가 있다"로 잘못 판정되고 있었다. 그 결과 "프로젝트 열기"·
            //    "저장" 버튼이 빈 화면인데도 매번 "새 프로젝트 등록" 취급을 하며 필수 항목(PROTO Start 등)을
            //    요구했다. 실제 사용자가 입력한 "문자열" 값만 데이터로 인정하도록 좁힌다.
            Object.keys(pm).some(function(k) { const v = pm[k]; return typeof v === 'string' && v.trim(); }) ||
            (td.summary && Object.keys(td.summary).some(function(k) {
                const v = td.summary[k];
                return k !== 'milestones' && v && String(v).trim();
            }))
        );
    };

    // 💡 opts.suppressAlert: 저장이 막힌 경우(필수정보 미입력/비밀번호 실패) 여기서 직접 alert을 띄우지 않고
    //    사유만 window._lastSaveBlockReason에 담아 돌려준다. "프로젝트 열기" 전 자동저장처럼, 호출한 쪽이
    //    자기 안내와 합쳐서 모달을 "한 번만" 띄우고 싶을 때 사용 (모달이 두 번 겹쳐 뜨던 문제 해결).
    window._saveToGoogleDriveRaw = async function(opts) {
        opts = opts || {};
        window._lastSaveBlockReason = '';
        // 💡 [성능 수정] "저장" 버튼엔 3분 자동저장과 달리 변경 여부 확인이 전혀 없어서, 아무것도 안
        //    바꾸고 그냥 다시 눌러도(예: 불안해서 여러 번 누르는 경우) 매번 백업 파일을 통째로 새로
        //    만들고 있었다 — 이 함수가 changeLogs/lastSavedLogCount를 갱신하기 "전"인 지금 시점의
        //    상태를 미리 캡처해서, 성공 후 실제로 바뀐 게 있었는지 판단하는 데 쓴다.
        const _preSaveHadChanges = ((window.changeLogs ? window.changeLogs.length : 0) > (window.lastSavedLogCount || 0)) || !!window._nonGanttDirty || !!window._cpThemeDirty;
        try {
            if (window.collectTabData) window.collectTabData();
            window._ensureRowUids(); // 🔀 이번에 저장될 모든 행이 고유 uid를 갖도록 보장(3-way 병합의 전제조건)

            // 💡 저장할 실제 내용이 없으면(빈 기본 시트) 필수 정보 검증까지 갈 필요도 없이 바로 종료 —
            //    예전엔 이 체크가 필수 정보 검증 "뒤"에 있어서, 빈 시트인데도 "필수 정보를 입력하세요"라는
            //    엉뚱한 알림부터 뜨는 문제가 있었다(순서를 앞으로 당김).
            if (!window._hasUnsavedProjectData()) { alert("저장할 데이터가 존재하지 않습니다."); return false; }

            // 💡 저장(=프로젝트 등록/파일 생성) 전에 Summary 탭의 필수 정보가 입력되어 있는지 검증한다.
            //    비어 있으면 "All_All_All" 같은 의미 없는 파일명으로 저장되므로 여기서 막는다.
            const requiredInfoError = window.validateRequiredProjectInfo ? window.validateRequiredProjectInfo() : '';
            if (requiredInfoError) {
                window._lastSaveBlockReason = requiredInfoError;
                if (!opts.suppressAlert) {
                    alert(requiredInfoError);
                    if (window.switchTab) window.switchTab('summary');
                }
                return false;
            }
            if (typeof updatePrintTitle === 'function') updatePrintTitle(); 
            const _svEn = window._currentLang === 'en';
            
            let dynamicFileName = (window.driveSaveFilenameStr || window.exportFilenameStr || "GanttChart_Project") + ".json";
            
            // 💡 [수정] 현재 불러와서 작업 중인 고유 파일 ID가 있다면 그것을 끝까지 유지하고, 없을 때만 이름으로 새로 검색합니다.
            if (!window.currentDriveFileId) {
                window.currentDriveFileId = await window.findSaveFile(dynamicFileName);
            }
            let fileId = window.currentDriveFileId;

            // 🔒 [새 프로젝트 생성 보호] 드라이브에 아직 없는(=fileId가 없는) 프로젝트를 처음 등록(파일 생성)
            //    하는 바로 이 순간에만 관리자 비밀번호를 확인한다. "➕ 새 프로젝트" 버튼을 거쳤든, 그냥 빈
            //    화면에서 곧바로 입력/드래그해서 저장했든 — 실제로 새 파일이 만들어지는 지점 하나만 지키면
            //    진입 경로에 상관없이 항상 막힌다(예전엔 버튼에만 걸려있어서 버튼을 안 거치면 그냥 통과됐음).
            if (!fileId) {
                if (!verifyAdminPassword(window._t('🔒 새 프로젝트를 등록하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)', '🔒 Enter the admin password to register a new project.\n(case-insensitive)'))) {
                    const _pwFail = window._t('❌ 비밀번호 인증 실패. 새 프로젝트 등록이 취소되었습니다.', '❌ Authentication failed. New project registration cancelled.');
                    window._lastSaveBlockReason = _pwFail;
                    if (!opts.suppressAlert) alert(_pwFail);
                    return false;
                }
            }

            // 📥 [Phase 2.5] 저장 직전, 내가 파일을 연 이후 도착한 배분 업무를 원격 원장에서 찾아 자동 병합
            //    💡 [2026-08-25 신규] 이 호출이 이미 "원격 파일이 마지막 확인 이후 바뀌었는지" 알아내므로,
            //    같은 정보로 "다른 사용자가 먼저 저장한 것 같은데 그래도 덮어쓸까?" 경고를 함께 띄운다
            //    (멀티유저 동시편집 최소 안전장치 — 배분 이력 외 나머지 내용은 병합되지 않고 덮어써지므로).
            if (fileId) {
                const _mergeResult = await window.mergeRemoteDistributions(fileId);
                if (_mergeResult && _mergeResult.hadBaseline && _mergeResult.remoteChanged && !opts.skipConflictCheck) {
                    // 🔀 [2026-08-27 신규] 통째로 막기 전에, 먼저 필드/셀 단위 3-way 병합을 시도한다.
                    //    base(_mergeBaselines — 마지막 저장 성공 시점 스냅샷)가 있어야 시도 가능하고,
                    //    없거나(이번 세션 첫 저장) 헤더 구조가 달라졌으면 병합을 포기하고 기존처럼
                    //    "그래도 저장/취소" 확인모달로 안전하게 폴백한다.
                    const _tokenObjEarly = gapi.client.getToken();
                    const _tokenEarly = (_tokenObjEarly ? _tokenObjEarly.access_token : null) || window.googleAccessToken;
                    const _merge3 = _tokenEarly ? await window._tryThreeWayMergeOnConflict(fileId, _tokenEarly) : { applied: false };
                    if (_merge3.applied) {
                        const _hasTrueConflict = _merge3.merge.cellConflicts.length || _merge3.merge.editVsDeleteConflicts.length;
                        if (_hasTrueConflict) {
                            // 진짜 충돌(같은 칸을 서로 다르게 고침/삭제-수정 충돌)은 놓치면 안 되므로 alert로 확실히 보여줌
                            alert(_merge3.summaryMsg + '\n\n(자세한 내용은 하단 [🕒 변경 이력 확인]에서 확인할 수 있습니다)');
                        } else {
                            window.showToast(_merge3.summaryMsg, 'info');
                        }
                    } else {
                        const _proceed = await window._showSaveConflictModal(dynamicFileName);
                        if (!_proceed) {
                            const _conflictMsg = window._t(
                                '⚠️ 다른 사용자가 마지막 확인 이후 이 프로젝트를 저장하여, 충돌을 피하기 위해 저장을 취소했습니다.\n(최신 내용을 받으려면 이 프로젝트를 다시 열어주세요)',
                                '⚠️ Save cancelled — another user saved this project since your last check.\n(Reopen the project to pick up the latest content.)'
                            );
                            window._lastSaveBlockReason = _conflictMsg;
                            if (!opts.suppressAlert) alert(_conflictMsg);
                            return false;
                        }
                    }
                }
            }

            // 🆕 [새 프로젝트 최초 등록] 드라이브에 아직 없던(=fileId가 없는) 프로젝트를 처음 등록하는 순간,
            //    Summary 탭 PROTO Start(계획) 날짜를 Gantt Chart 시작일 기준(anchor)으로 반영해 전체 일정을
            //    자동 계산하고, 그 결과를 "최초 계획"으로 저장한다. 이미 계획이 하나라도 있으면(=재등록/이후
            //    저장) 건드리지 않고 딱 1회, 최초 등록 시점에만 실행됨.
            if (!fileId && (!window._scheduleBaselines || window._scheduleBaselines.length === 0) && window._registerNewProjectInitialPlan) {
                window._registerNewProjectInitialPlan();
            }

            let serializedGlobalData = globalData.map(row => {
                let obj = { data: Array.from(row) };
                for (let key in row) { if (key.startsWith('_')) obj[key] = row[key]; }
                return obj;
            });

            let saveData = { globalData: serializedGlobalData, changeLogs: window.changeLogs, colIdx: colIdx, filterColumns: filterColumns, projectMeta: window.projectMeta || {}, tabData: window.collectTabData ? window.collectTabData() : (window.tabData || {}), distributions: window.projectDistributions || [], scheduleBaselines: window._scheduleBaselinesForSave ? window._scheduleBaselinesForSave() : (window._scheduleBaselines || []),
                // ✅ [AI 학습 Phase 3] 학습 데이터를 프로젝트 JSON에 포함 → 저장마다 Drive에 자동 동기화
                aiLearning: window._alGetEntriesForSave ? window._alGetEntriesForSave(window.currentDriveFileName || window.currentDriveFileId || '') : [] };
            let boundary = 'foo_bar_baz';
            // 💡 [2026-08-29 신규] completed appProperty — "프로젝트 불러오기" 목록이 파일 내용을 통째로
            //    안 받고도(가벼운 메타데이터 조회만으로) 완료된 프로젝트를 구분 표시할 수 있게, pm과 같은
            //    방식으로 완료 여부도 같이 태운다. Drive appProperties 값은 문자열만 허용되므로 '1'/''로 기록.
            // 💡 [2026-08-30 신규] themeColor도 appProperties에 같이 태운다 — "프로젝트 열기/삭제/복원"
            // 목록이 파일 내용을 통째로 안 받아도(가벼운 메타데이터 조회만으로) 그 프로젝트의 저장된
            // 테마 색을 바로 알 수 있게 하기 위함(showDriveFileModal/showBackupFileModal에서 사용).
            // 💡 [이중 방어선 구축] 토큰 추출 실패를 원천 봉쇄합니다. (팀 폴더 생성에도 필요하므로 먼저 추출)
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;

            if (!token) {
                window.showToast(_svEn ? "🔒 Auth token lost. Please reconnect Google Drive." : "🔒 구글 인증 토큰을 확보하지 못했습니다. 연동 버튼을 다시 클릭해 주세요.", 'error');
                window._handleDriveDisconnected('save-no-token');
                return false;
            }

            let metadata = { name: dynamicFileName, mimeType: 'application/json', appProperties: { pm: (window.projectMeta || {}).프로젝트담당자 || '', completed: (window.projectMeta || {}).완료여부 === '완료' ? '1' : '', themeColor: (window.tabData || {}).themeColor || '', team: (window.projectMeta || {}).팀 || '' } };
            // 💡 [팀 폴더 자동 배치] 신규 파일 → 팀 폴더에 직접 생성 / 기존 파일 → 저장 후 fire-and-forget 이동
            if (!fileId) {
                const _pmTeam = (window.projectMeta || {}).팀 || '';
                let _targetParent = SHARED_FOLDER_ID;
                if (_pmTeam && window._getOrCreateNamedFolder) {
                    try { _targetParent = (await window._getOrCreateNamedFolder(token, _pmTeam)) || SHARED_FOLDER_ID; }
                    catch(e) { console.warn('[팀 폴더] 신규 파일 팀 폴더 생성 실패 — 루트에 저장:', e); }
                }
                metadata.parents = [_targetParent];
            }

            let multipartRequestBody = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(saveData) + "\r\n--" + boundary + "--";

            // 💡 [성능 수정] fields=id,modifiedTime을 붙여서 저장 응답에 modifiedTime을 함께 받는다 —
            //    mergeRemoteDistributions()가 "마지막으로 내가 저장한 시점" 캐시로 쓰기 위함(별도 호출 불필요).
            let url = 'https://www.googleapis.com/upload/drive/v3/files' + (fileId ? '/' + fileId : '') + '?uploadType=multipart&supportsAllDrives=true&fields=id,modifiedTime';

            // 💡 [진단용 계측] "저장이 느리다"의 원인이 업로드 자체인지(=구글/네트워크), 아니면 그 앞단
            //    처리인지 바로 구분할 수 있게 업로드 구간과 전송 크기를 따로 잰다.
            const _tUp0 = performance.now();
            let response = await fetch(url, {
                method: fileId ? 'PATCH' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary="${boundary}"`
                },
                body: multipartRequestBody
            });
            const _upMs = Math.round(performance.now() - _tUp0);
            const _upKB = Math.round(multipartRequestBody.length / 1024);
            console.info(`[저장 계측] 업로드: ${_upMs}ms · 전송크기: ${_upKB}KB (${(_upKB / Math.max(_upMs,1) * 1000 / 1024).toFixed(1)}MB/s)`);
            if (_upMs > 3000) console.warn(`[저장 계측] ⚠️ 업로드에만 ${_upMs}ms — 전송크기(${_upKB}KB) 대비 느리면 구글/네트워크 지연입니다.`);

            let file = await response.json();
            window.currentDriveFileName = dynamicFileName;
            window.updateCurrentFileLabel();

            if (response.ok && file && file.id) {
                // 💡 [2026-08-25 신규] 방금 정상적으로 Drive에 저장됐으니, 이 프로젝트에 대해 남아있을 수
                //    있는 로컬 백업(연결 끊김 등으로 저장 못 했던 시점의 스냅샷)은 이제 낡은 것이므로 정리.
                //    저장 전 fileId(신규 프로젝트면 아직 null → 'new' 버킷)를 기준으로 지워야 정확히 맞는다.
                window._clearLocalBackup(fileId);
                window.currentDriveFileId = file.id;
                window.lastSavedLogCount = window.changeLogs.length;
                window._nonGanttDirty = false; // 💡 Summary 탭(주요자재 등) 편집도 저장됐으니 함께 리셋
                // 💡 [2026-08-30] 방금 저장된 테마 색을 "저장된 기준값"으로 갱신 — 팔레트에서 색을
                // 이리저리 바꿔보다가 결국 이 값으로 되돌아오면 dirty 취급하지 않기 위한 기준점.
                window._cpSavedThemeHex = (window.tabData && window.tabData.themeColor) || null;
                window._cpThemeDirty = false; // 방금 저장됐으니 테마 dirty도 같이 리셋
                // 💡 [버그 수정] 새 프로젝트를 처음 저장하면 currentDriveFileId/Name은 바로 갱신되는데,
                //    시트 탭 바가 읽는 window._sheets 배열의 해당 항목(fileId/fileName)은 안 바뀌었다 —
                //    그 배열은 "다른 시트로 전환할 때"(_commitActiveSheet)만 동기화돼서, 저장 직후엔 탭이
                //    여전히 "(새 프로젝트)"로 보이고 다른 시트로 갔다 와야만(그 전환 순간에) 파일명으로
                //    바뀌었다. 저장 성공 시점에 지금 활성 시트 항목을 직접 갱신하고 탭 바를 다시 그린다.
                const _activeSheet = window._sheets && window._activeSheetKey
                    ? window._sheets.find(function(s) { return s.key === window._activeSheetKey; })
                    : null;
                if (_activeSheet) {
                    _activeSheet.fileId = file.id;
                    _activeSheet.fileName = dynamicFileName;
                    if (window.renderSheetTabsBar) window.renderSheetTabsBar();
                }
                // 💡 [성능 수정] 방금 내가 저장한 시점을 캐시해둬서, 다음 저장 때 mergeRemoteDistributions가
                //    "그 사이 아무도 안 건드렸으면" 무거운 전체 다운로드를 건너뛸 수 있게 한다.
                if (file.modifiedTime) { window._distMergeModifiedTime = window._distMergeModifiedTime || {}; window._distMergeModifiedTime[file.id] = file.modifiedTime; }
                // 🔀 [2026-08-27 신규] 방금 저장한 내용을 다음 저장 때 3-way 병합의 base로 쓰도록 캡처.
                window._captureMergeBaseline(file.id);
                // 💡 [성능 수정] 실제로 바뀐 내용이 있었을 때(또는 방금 처음 만든 새 파일일 때, !fileId)만
                //    백업을 만든다 — 변경 없이 저장 버튼만 다시 누른 경우까지 전체 데이터를 통째로 한 번
                //    더 업로드할 필요는 없다. (Backups 폴더는 실수 복구용이라, 내용이 같은 백업이 계속
                //    쌓이는 건 용량/API 호출만 낭비하고 복구에는 도움이 안 됨)
                if (_preSaveHadChanges || !fileId) {
                    window.backupToDrive(saveData, dynamicFileName); // 💡 드라이브 Backups 폴더에 타임스탬프 백업 (1주 보관)
                } else {
                    console.info('[저장 계측] 변경사항 없음 — 백업 생략');
                }
                // 💡 [성능 수정] 백업과 동일한 이유 — 바뀐 게 없으면 담당자/주요자재 등 인덱스에 들어가는
                //    내용도 지난 저장 때와 같을 수밖에 없다. 변경 없이 재저장할 때마다 공용 인덱스 파일을
                //    통째로 내려받고 다시 올릴 필요는 없다.
                if (_preSaveHadChanges || !fileId) {
                    window.updateProjectIndexEntry(file.id, dynamicFileName); // 💡 메일 자동처리용 project_index.json 갱신 (fire-and-forget, 저장 완료 자체는 막지 않음)
                } else {
                    console.info('[저장 계측] 변경사항 없음 — project_index.json 갱신 생략');
                }
                // 💡 [팀 폴더] 기존 파일(fileId 있음) 재저장 시 — 팀 폴더로 이동 (fire-and-forget, 저장 결과에 영향 없음)
                const _existingFileTeam = (window.projectMeta || {}).팀 || '';
                if (fileId && _existingFileTeam && window._moveFileToTeamFolder) {
                    window._moveFileToTeamFolder(token, file.id, _existingFileTeam);
                }
                window.showToast(window._currentLang === 'en'
                    ? `🎉 Saved as [${dynamicFileName}] in the shared team folder!`
                    : `🎉 팀 공용 폴더에 [${dynamicFileName}] 파일로 안전하게 저장되었습니다!`);
                return true;
            } else {
                console.error("구글 저장 실패 상세 정보:", file);
                let errorMsg = "공유 폴더의 '편집자' 권한이 없거나 업로드 중 오류가 발생했습니다.";
                
                const status = response.status || (file && file.error ? file.error.code : 0);
                if (status === 401) {
                    errorMsg = "🔒 구글 인증 세션이 만료되었습니다.\n\n상단의 [🔵 구글 드라이브 연동하기] 버튼을 다시 눌러 로그인을 완료한 후 저장해 주세요.";
                    const authBtn = document.getElementById('auth_button');
                    if (authBtn) {
                        authBtn.disabled = false;
                        authBtn.innerText = window._currentLang === 'en' ? "🔄 Reconnect required (click)" : "🔄 재연동 필요 (클릭)";
                        authBtn.style.borderColor = '#e67e22';
                        authBtn.style.color = '#e67e22';
                    }
                    // 💡 [2026-08-25 신규] 저장 시도 중 발견된 401도 "연결 끊김"으로 취급 — 상단 표시등/토스트/
                    //    (설정된 경우) 텔레그램 알림까지 한 번에 처리해서, 사람이 401을 눈치채기 전에 먼저 알려준다.
                    window._handleDriveDisconnected('save-401');
                } else if (status === 403) {
                    errorMsg = "🚫 공유 폴더 접근 권한이 거부되었습니다.\n\n공유 폴더('1ldb3Bc7dNNSKKgmNviw43aCgrvxQG9bS')에 본인 계정이 '편집자'로 등록되어 있는지 관리자에게 확인해 주세요.";
                } else if (file && file.error) {
                    errorMsg = `구글 드라이브 에러 (${status}): ${file.error.message}`;
                }
                
                alert(_svEn ? `❌ Save failed\n\n${errorMsg}` : `❌ 저장 실패\n\n${errorMsg}`);
            }
        } catch (err) {
            alert(_svEn ? "Google Drive system error: " + err.message : "구글 드라이브 전송 시스템 에러: " + err.message);
            return false;
        }
    }

    // 💡 공개 진입점 — 실제로는 항상 대기열을 거쳐서, 다른 저장/시트전환 작업과 절대 안 겹치게 함
    //    (3분 자동저장 타이머 등 기존 호출부는 전부 그대로 이 이름을 부르므로 별도 수정 불필요)
    window.saveToGoogleDrive = function(opts) {
        return window._runSerialized(function() { return window._saveToGoogleDriveRaw(opts); });
    };

    // 💡 Backups 폴더의 백업 목록 조회
    window.loadBackupList = async function() {
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) { alert("🔒 구글 인증이 필요합니다. 상단의 연동 버튼을 눌러주세요."); return; }
            const folderId = await window.getOrCreateBackupFolder(token);
            let response = await gapi.client.drive.files.list({
                q: `mimeType='application/json' and trashed=false and '${folderId}' in parents`,
                fields: 'files(id, name, createdTime, appProperties)', orderBy: 'createdTime desc', corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true
            });
            let files = response.result.files;
            if (!files || files.length === 0) {
                window.showToast(window._currentLang === 'en' ? "No backup files found. Save once to create a backup." : "저장된 백업이 없습니다. 저장을 한 번 하면 백업이 생성됩니다.", 'error');
                return;
            }
            // 💡 [팀 그룹핑] project_index 캐시 로드 (병렬 — 백업 목록 조회와 겹쳐서 지연 없음)
            const indexProjects = window._loadProjectIndexForModal ? await window._loadProjectIndexForModal().catch(function() { return []; }) : [];
            window.showBackupFileModal(files, indexProjects);
            window.showToast(window._currentLang === 'en' ? "🔄 Backup list loaded. Select a point to restore." : "🔄 백업 목록을 불러왔습니다. 복원할 시점을 선택해 주세요.");
        } catch (err) { alert("백업 목록 조회 실패: " + err.message); }
    };

    // 💡 백업 파일명(백업_<원본이름>_<YYYYMMDD>_<HHMM>.json)에서 원본 프로젝트 파일명을 복원
    window._backupOrigFileName = function(backupFileName) {
        return backupFileName.replace(/^백업_/, '').replace(/_\d{8}_\d{4}\.json$/i, '') + '.json';
    };

    // 💡 [프로젝트 복원] 팀(외부) → 프로젝트(내부) → 백업 시점 행 — showDriveFileModal과 동일한 2단 구조.
    //    indexProjects: project_index entries (팀 정보 조회용, 없으면 빈 배열 전달)
    window.showBackupFileModal = function(files, indexProjects) {
        indexProjects = Array.isArray(indexProjects) ? indexProjects : (window._piModalCache || []);
        const _en = window._currentLang === 'en';
        let listContainer = document.getElementById('drive-file-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        // 모달 제목/설명 설정 (showDriveFileModal과 같은 요소 공유)
        const _title = document.getElementById('drive-modal-title');
        if (_title) _title.textContent = _en ? '🔄 Project Restore' : '🔄 프로젝트 복원';
        const _desc = document.getElementById('drive-modal-desc');
        if (_desc) _desc.textContent = _en ? 'Select a backup to restore. Opens as a new sheet — press [Save] to apply.' : '복원할 백업 시점을 선택해 주세요. 새 시트로 열리며, 확인 후 [저장]을 눌러야 드라이브에 반영됩니다.';
        const _actionSlot = document.getElementById('drive-modal-action-slot');
        if (_actionSlot) _actionSlot.innerHTML = ''; // 복원 모달엔 액션 버튼 없음

        // ── 팀 팔레트 (showDriveFileModal과 동일한 상수) ─────────────────────────────────
        const _TEAM_PAL = [
            { h:'#cfe6fa', b:'#a5c8f0', t:'#1a4f7a', hv:'#b8d8f0' },
            { h:'#c9ecd3', b:'#a8dab8', t:'#1a6640', hv:'#b0dfc0' },
            { h:'#ffe3b3', b:'#ffc078', t:'#7a4800', hv:'#ffd090' },
            { h:'#e0d8ff', b:'#b8a9f0', t:'#3a2080', hv:'#cec4ff' },
            { h:'#ffd6d0', b:'#f0a9a5', t:'#7a2020', hv:'#ffc0b8' },
            { h:'#c8f0e8', b:'#80d0c0', t:'#005040', hv:'#b0e8dc' },
            { h:'#fdf0b0', b:'#f0d060', t:'#604800', hv:'#fbe898' },
            { h:'#e8d8f0', b:'#c0a0d8', t:'#501060', hv:'#d8c4e8' },
            { h:'#d8f0d8', b:'#90d090', t:'#205020', hv:'#c4e8c4' },
        ];
        function _pal(teamName) {
            if (!teamName) return { h:'#e9ecef', b:'#ced4da', t:'#495057', hv:'#dee2e6' };
            const m = teamName.match(/(\d+)/);
            if (m) return _TEAM_PAL[(parseInt(m[1], 10) - 1) % _TEAM_PAL.length];
            let hsh = 0;
            for (let i = 0; i < teamName.length; i++) hsh = (hsh * 31 + teamName.charCodeAt(i)) & 0xffff;
            return _TEAM_PAL[hsh % _TEAM_PAL.length];
        }
        const UNASSIGNED_TEAM = _en ? '(No Team)' : '미지정 팀';

        // ── 팀 → { origName → {pm, files[]} } 구조 구성 ────────────────────────────────
        const teamMap = {};
        files.forEach(function(file) {
            const origName = window._backupOrigFileName(file.name);
            // project_index에서 원본 파일명으로 팀 조회
            let team = '', pm = '';
            if (indexProjects.length) {
                const entry = indexProjects.find(function(p) { return p.file_name === origName; });
                if (entry) { team = entry.team || ''; pm = entry.assignee || ''; }
            }
            team = team || UNASSIGNED_TEAM;
            if (!teamMap[team]) teamMap[team] = {};
            if (!teamMap[team][origName]) teamMap[team][origName] = { pm: pm, files: [] };
            teamMap[team][origName].files.push(file);
        });

        // 팀 정렬
        const teamNames = Object.keys(teamMap).sort(function(a, b) {
            if (a === UNASSIGNED_TEAM) return 1;
            if (b === UNASSIGNED_TEAM) return -1;
            const na = parseInt((a.match(/\d+/) || ['0'])[0], 10);
            const nb = parseInt((b.match(/\d+/) || ['0'])[0], 10);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
            return a.localeCompare(b, 'ko');
        });

        // ── 팀 아코디온 렌더링 ─────────────────────────────────────────────────────────
        teamNames.forEach(function(teamName) {
            const projMap = teamMap[teamName];
            const teamAllFiles = Object.values(projMap).reduce(function(acc, g) { return acc.concat(g.files); }, []);
            const pal = teamName === UNASSIGNED_TEAM ? { h:'#e9ecef', b:'#ced4da', t:'#495057', hv:'#dee2e6' } : _pal(teamName);

            const teamWrap = document.createElement('div');
            teamWrap.style.cssText = 'border:1.5px solid ' + pal.b + '; border-radius:10px; overflow:hidden;';

            const teamHdr = document.createElement('div');
            teamHdr.style.cssText = 'padding:10px 14px; background:' + pal.h + '; cursor:pointer; display:flex; align-items:center; gap:8px; user-select:none;';
            teamHdr.onmouseover = function() { teamHdr.style.background = pal.hv; };
            teamHdr.onmouseout  = function() { teamHdr.style.background = pal.h; };
            const teamArrow = document.createElement('span');
            teamArrow.style.cssText = 'font-size:12px; color:' + pal.t + '; width:14px; display:inline-block;';
            teamArrow.textContent = '▾';
            const teamLbl = document.createElement('span');
            teamLbl.style.cssText = 'font-size:14px; font-weight:bold; color:' + pal.t + '; flex:1;';
            teamLbl.textContent = '🏢 ' + teamName + ' (' + Object.keys(projMap).length + (_en ? ' projects)' : '개 프로젝트)');
            teamHdr.appendChild(teamArrow);
            teamHdr.appendChild(teamLbl);

            const teamBody = document.createElement('div');
            teamBody.style.cssText = 'display:flex; flex-direction:column; gap:6px; padding:8px; background:#fafafa;';

            teamHdr.onclick = function() {
                const c = teamBody.style.display === 'none';
                teamBody.style.display = c ? 'flex' : 'none';
                teamArrow.textContent = c ? '▾' : '▸';
            };

            // ── 프로젝트 서브 아코디온 ────────────────────────────────────────────────────
            const projNames = Object.keys(projMap).sort(function(a, b) { return a.localeCompare(b, 'ko'); });
            projNames.forEach(function(origName) {
                const grp = projMap[origName];
                const projWrap = document.createElement('div');
                projWrap.style.cssText = 'border:1px solid #e0e0e0; border-radius:8px; overflow:hidden;';
                const projHdr = document.createElement('div');
                projHdr.style.cssText = 'padding:8px 12px; background:#f2f4f6; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:bold; font-size:12.5px; color:#444; user-select:none; transition:background .15s;';
                projHdr.onmouseover = function() { projHdr.style.background = '#e8eaed'; };
                projHdr.onmouseout  = function() { projHdr.style.background = '#f2f4f6'; };
                const projArrow = document.createElement('span');
                projArrow.style.cssText = 'font-size:10px; width:12px; display:inline-block;';
                projArrow.textContent = '▸';
                const projLbl = document.createElement('span');
                // 담당자(PM)가 있으면 괄호 안에 표시
                projLbl.textContent = '📄 ' + origName + ' (' + grp.files.length + ')' + (grp.pm ? ' · 👤 ' + grp.pm : '');
                projHdr.appendChild(projArrow);
                projHdr.appendChild(projLbl);
                const projBody = document.createElement('div');
                projBody.style.cssText = 'display:none; flex-direction:column; gap:8px; padding:8px;';
                projHdr.onclick = function() {
                    const c = projBody.style.display === 'none';
                    projBody.style.display = c ? 'flex' : 'none';
                    projArrow.textContent = c ? '▾' : '▸';
                };
                grp.files.forEach(function(file) {
                    const d = new Date(file.createdTime);
                    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
                    const rowC = window._driveRowThemeColors ? window._driveRowThemeColors(file) : { bg:'#e8f4fd', border:'#a5c8f0', hoverBg:'#cfe6fa', hoverBorder:'#7fb0dd' };
                    const fileBtn = document.createElement('div');
                    fileBtn.style.cssText = 'padding:9px 14px; border:1px solid ' + rowC.border + '; border-radius:8px; cursor:pointer; transition:background .15s, border-color .15s; display:flex; justify-content:space-between; align-items:center; background:' + rowC.bg + ';';
                    fileBtn.onmouseover = function() { this.style.background = rowC.hoverBg; this.style.borderColor = rowC.hoverBorder; };
                    fileBtn.onmouseout  = function() { this.style.background = rowC.bg;      this.style.borderColor = rowC.border; };
                    fileBtn.onclick = function() { window.executeRestoreBackup(file.id, file.name); };
                    fileBtn.innerHTML = '<div style="font-weight:bold; color:#333; font-size:14px;">🗄 ' + escapeHtml(file.name) + '</div><div style="font-size:12px; color:#868e96;">' + dateStr + '</div>';
                    projBody.appendChild(fileBtn);
                });
                projWrap.appendChild(projHdr);
                projWrap.appendChild(projBody);
                teamBody.appendChild(projWrap);
            });

            teamWrap.appendChild(teamHdr);
            teamWrap.appendChild(teamBody);
            listContainer.appendChild(teamWrap);
        });

        document.getElementById('drive-file-modal-overlay').style.display = 'flex';
    };

    window.executeRestoreBackup = async function(fileId, fileName) {
        window.closeDriveModal();
        if (!confirm(window._t(`[${fileName}] 백업으로 복원하시겠습니까?\n새 시트로 열리며, 확인 후 [저장]을 눌러야 드라이브에 반영됩니다.`, `Restore from backup [${fileName}]?\nOpens as a new sheet — press [Save] afterward to apply to Drive.`))) return;
        try {
            const tokenObj = gapi.client.getToken();
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            let response = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true });
            let saveData = response.result;
            if (saveData && saveData.globalData) {
                // 💡 [버그 수정] 예전엔 currentDriveFileId를 그대로 둔 채 지금 화면 위에 복원 데이터만
                //    덮어썼음 — "저장"을 누르면 그 순간 열려있던 "다른" 프로젝트의 Drive 파일에 이
                //    백업 내용이 통째로 덮어써질 위험이 있었다(AMUSNET 사고의 유력한 원인). 이제는:
                //    ① 항상 새 시트로 열어서 지금 보던 화면은 그대로 보존하고,
                //    ② 백업의 원본 파일명으로 "지금 살아있는" 파일을 찾아 있으면 그 파일로, 없으면
                //       (원본이 삭제된 경우 등) 새 파일로 저장되도록 currentDriveFileId를 정확히 맞춘다.
                const origName = window._backupOrigFileName(fileName);
                let existingFileId = null;
                try { existingFileId = token ? await window.findSaveFile(origName) : null; } catch (e) {}

                const sheetKey = 'restore_' + fileId;
                window._openAsNewSheet(sheetKey, existingFileId, origName);

                globalData = saveData.globalData.map(function(obj) {
                    let row = obj.data;
                    for (let key in obj) { if (key !== 'data') row[key] = obj[key]; }
                    return row;
                });
                window.changeLogs = saveData.changeLogs || [];
                window.lastSavedLogCount = 0; // 복원본은 아직 Drive에 저장 안 된 상태이므로 "변경사항 있음"으로 취급
                window._nonGanttDirty = true;
                colIdx = saveData.colIdx || colIdx;
                filterColumns = saveData.filterColumns || filterColumns;
                window.projectMeta = saveData.projectMeta || window.projectMeta || {};
                window.tabData = saveData.tabData || window.tabData || {};
                window.projectDistributions = saveData.distributions || [];
                window.mcNormalizeAfterLoad();
                if (window.populateTabData) window.populateTabData();
                window.currentDriveFileId = existingFileId; // 있으면 그 파일로 갱신 저장, 없으면(null) 저장 시 새 파일 생성
                window.currentDriveFileName = origName;
                window.updateCurrentFileLabel();
                window.recalculateSchedules();
                window.renderSheetTabsBar();
                window._compareTargetId = null;
                if (saveData.scheduleBaselines && saveData.scheduleBaselines.length) {
                    window._scheduleBaselines = saveData.scheduleBaselines;
                    if (typeof persistScheduleBaselines === 'function') persistScheduleBaselines();
                } else if (window.loadScheduleBaselines) {
                    window.loadScheduleBaselines();
                }

                const msg = existingFileId
                    ? window._t(`🎉 [${fileName}] 백업으로 복원되었습니다 (원본: ${origName}). 확인 후 [저장]을 누르면 그 프로젝트에 반영됩니다.`, `🎉 Restored from [${fileName}] (original: ${origName}). Press [Save] to apply to that project.`)
                    : window._t(`🎉 [${fileName}] 백업으로 복원되었습니다. 원본 "${origName}"이 지금 존재하지 않아 [저장] 시 새 파일로 생성됩니다.`, `🎉 Restored from [${fileName}]. Original "${origName}" no longer exists — [Save] will create a new file.`);
                window.showToast(msg);
            }
        } catch (err) { alert("백업 복원 실패: " + err.message); }
    };

    // ═══════════════════════════════════════════════════════════
    // 📑 [멀티 시트] 여러 프로젝트를 엑셀 워크북 시트처럼 한 탭에서 동시에 열어두기
    //    구조: 실제 편집/렌더링 로직(수천 곳)은 지금처럼 전역 변수(globalData/colIdx/...)를
    //    그대로 쓰고, "시트 전환"은 그 전역 변수 묶음을 통째로 저장했다가 다시 꽂아넣는 방식.
    //    → 기존 코드는 단 한 줄도 안 건드리고, 로드/전환 시점만 감싸서 다중 시트를 흉내냄.
    // ═══════════════════════════════════════════════════════════
    window._sheets = window._sheets || [];       // [{ key, fileId, fileName, snapshot }]
    window._activeSheetKey = window._activeSheetKey || null;

    // 현재 화면에 떠 있는 전역 상태를 통째로 캡처 (참조만 저장 — 시트 전환 중엔 해당 시트가 "비활성"이라 아무도 안 건드림)
    window._snapshotCurrentSheet = function() {
        return {
            globalData, colIdx, filterColumns, currentFilters, existingDevStages,
            projectMeta: window.projectMeta, tabData: window.tabData,
            projectDistributions: window.projectDistributions,
            changeLogs: window.changeLogs, lastSavedLogCount: window.lastSavedLogCount,
            currentDriveFileId: window.currentDriveFileId, currentDriveFileName: window.currentDriveFileName,
        };
    };

    // 스냅샷을 전역 변수에 다시 꽂아넣고 화면을 그 시점으로 되돌림 (executeLoadFile 성공 시 하던 일과 동일)
    window._restoreSheetSnapshot = function(snap) {
        globalData = snap.globalData; colIdx = snap.colIdx; filterColumns = snap.filterColumns;
        currentFilters = snap.currentFilters; existingDevStages = snap.existingDevStages;
        window.projectMeta = snap.projectMeta; window.tabData = snap.tabData;
        window.projectDistributions = snap.projectDistributions;
        window.changeLogs = snap.changeLogs; window.lastSavedLogCount = snap.lastSavedLogCount;
        window.currentDriveFileId = snap.currentDriveFileId; window.currentDriveFileName = snap.currentDriveFileName;
        // 💡 [버그 수정] 계획(Baseline)은 프로젝트별로 분리 저장되므로, 시트를 전환하면 그 시트(프로젝트) 것으로 다시 로드
        //    (예전엔 브라우저 전체에 계획 목록이 하나뿐이라, 시트를 바꿔도 같은 계획이 그대로 보였음)
        window._compareTargetId = null;
        if (window.loadScheduleBaselines) window.loadScheduleBaselines();

        window.mcNormalizeAfterLoad();
        if (window.populateTabData) window.populateTabData();
        window.updateCurrentFileLabel();
        window.recalculateSchedules();
        if (typeof renderTable === 'function') renderTable(globalData);
        window.renderSheetTabsBar();
        // 💡 [멀티시트] 알람 탭은 collectAlarmItems()가 매번 새로 훑는 캐시성 뷰라, 시트를 전환해도
        //    자동으로 안 다시 그려서 "이전 시트의 알람 목록이 그대로 남는" 버그가 있었음 — 지금 알람 탭이
        //    열려있으면(Alarm/Notice 어느 쪽이든) 새 시트 기준으로 즉시 다시 그림
        const tabAlarmEl = document.getElementById('tab-alarm');
        if (tabAlarmEl && tabAlarmEl.classList.contains('active')) {
            if (window._alarmView === 'notice' && window.renderNoticeTab) window.renderNoticeTab();
            else if (window.renderAlarmTab) window.renderAlarmTab();
        }
        // 💡 [멀티시트 버그 수정] Calendar/Weekly Report도 알람 탭처럼 매번 새로 훑어 그리는 캐시성 뷰라,
        //    시트를 전환해도 자동으로 안 다시 그려서 "이전 시트의 일정이 그대로 남는" 버그가 있었음
        //    (switchTab()이 탭 진입 시 하는 갱신과 동일 — 지금 그 탭이 열려있으면 새 시트 기준으로 즉시 다시 그림)
        const tabCalEl = document.getElementById('tab-calendar');
        if (tabCalEl && tabCalEl.classList.contains('active') && window.calRender) window.calRender();
        const tabWeeklyEl = document.getElementById('tab-weekly');
        if (tabWeeklyEl && tabWeeklyEl.classList.contains('active') && window.showWeeklyReport) window.showWeeklyReport();
    };

    // fileId 기준으로 이미 열려있는 시트 찾기
    window._findSheetByFileId = function(fileId) {
        return window._sheets.find(function(s) { return s.fileId === fileId; });
    };

    // 지금 활성 시트가 있으면 현재 화면 상태를 그 시트 슬롯에 저장(전환 전 항상 호출)
    window._commitActiveSheet = function() {
        if (!window._activeSheetKey) return;
        const cur = window._sheets.find(function(s) { return s.key === window._activeSheetKey; });
        if (cur) { cur.snapshot = window._snapshotCurrentSheet(); cur.fileName = window.currentDriveFileName || cur.fileName; }
    };

    // key로 시트 전환 (메모리 스냅샷만 — Drive 저장 없음. 배경 알람체크가 시트를 빠르게
    // 훑고 지나가려고 내부적으로 쓰는 저수준 함수라 여기서 저장까지 하면 안 됨)
    window.switchToSheet = function(key) {
        if (key === window._activeSheetKey) return;
        window._commitActiveSheet();
        const target = window._sheets.find(function(s) { return s.key === key; });
        if (!target) return;
        window._activeSheetKey = key;
        window._restoreSheetSnapshot(target.snapshot);
    };

    // 💡 [사용자 전환] 사람이 직접 다른 프로젝트 시트로 넘어갈 때 쓰는 진입점 — 지금 보던 시트에
    //    "저장 안 한 변경사항"이 있을 때만 Google Drive에 먼저 저장한 뒤 전환한다.
    //    💡 [속도 개선] 예전엔 매번 무조건 저장해서 전환이 느렸음 — 3분 자동저장/창닫기 경고와
    //    똑같은 기준(changeLogs.length가 마지막 저장 시점보다 늘었는지)으로 "진짜 변경됐을 때만" 저장
    // 💡 [긴급 버그 수정] 저장(_saveToGoogleDriveRaw)과 시트전환(switchToSheet)을 한 덩어리로 묶어서
    //    같은 대기열(_runSerialized)에 넣는다 — 이렇게 해야 "저장이 끝나고 전환하기 직전"에 다른
    //    저장(3분 자동저장 등)이 끼어들어 서로 다른 시점의 데이터가 뒤섞이는 사고를 막을 수 있음.
    //    (공개 saveToGoogleDrive()는 안 부르고 raw를 직접 호출 — 같은 대기열에 재진입하면 데드락 남)
    window.switchToSheetWithSave = function(key, silent) {
        return window._runSerialized(async function() {
            if (key === window._activeSheetKey) return;
            const _en = window._currentLang === 'en';
            // 💡 [버그 수정] "저장할 변경사항이 있는지"를 currentDriveFileId 존재 여부로도 같이 걸었었다.
            //    그런데 아직 한 번도 저장한 적 없는 "새 프로젝트"는 fileId가 없어서 이 조건이 항상 거짓이
            //    되어, 다른 시트로 전환할 때 저장 시도 자체를 건너뛰고 조용히 넘어갔다 — 새 프로젝트에
            //    쏟은 작업이 아무 경고도 없이 사라질 수 있는 유실 지점이었다(어제 버전부터 있던 문제,
            //    오늘 손댄 코드는 아니지만 마침 오늘 다룬 영역이라 같이 발견됨). fileId 유무와 무관하게
            //    실제로 바뀐 게 있으면 저장을 시도한다.
            const hasUnsavedChanges = window._hasUnsavedChangesNow();
            if (hasUnsavedChanges) {
                if (silent) {
                    // 💡 [2026-08-25] "전체 프로젝트 한 번에 열기" 같은 배치 흐름에서 호출될 때(silent=true)는
                    //    파일마다 모달이 뜨면 자동화가 끊기므로, 예전처럼 조용히 저장만 시도하고 진행한다.
                    const ok = await window._saveToGoogleDriveRaw({ suppressAlert: true });
                    if (!ok) {
                        const _why = window._lastSaveBlockReason || '';
                        if (!confirm((_why ? _why + '\n\n' : '') + (_en
                            ? 'Save failed. Move to another project anyway?\n(Current screen content is kept in memory)'
                            : '저장에 실패했습니다. 그래도 다른 프로젝트로 이동할까요?\n(지금 화면 내용은 메모리에 임시 보관됩니다)'))) return;
                    }
                } else {
                    // 💡 [2026-08-25 신규] 사람이 직접 탭을 클릭해 이동할 때는 무조건 조용히 저장하지 않고,
                    //    "저장하고 이동 / 저장 안 함 / 취소" 3지선다 모달로 직접 고르게 한다(closeSheet와 동일 패턴).
                    const cur = window._sheets.find(function(s) { return s.key === window._activeSheetKey; });
                    const choice = await window._showSaveChoiceModal(cur && cur.fileName, 'switch');
                    if (choice === 'cancel') return;
                    if (choice === 'save') {
                        if (window.showToast) window.showToast(_en ? '💾 Saving...' : '💾 변경사항 저장 중...', 'info');
                        const ok = await window._saveToGoogleDriveRaw({ suppressAlert: true });
                        if (!ok) {
                            const _why = window._lastSaveBlockReason || '';
                            if (!confirm((_why ? _why + '\n\n' : '') + (_en
                                ? 'Save failed. Move to another project anyway?\n(Current screen content is kept in memory)'
                                : '저장에 실패했습니다. 그래도 다른 프로젝트로 이동할까요?\n(지금 화면 내용은 메모리에 임시 보관됩니다)'))) return;
                        }
                    }
                    // choice === 'discard' → 저장 없이 그대로 이동
                }
            }
            window.switchToSheet(key);
        });
    };

    // 💡 [2026-08-25 신규 → 2026-08-25 범용화] 원래 시트 탭 "✕" 닫기 전용이었는데, "프로젝트 열기"·
    //    "Sheet 이동" 등 저장 여부를 물어야 하는 다른 곳에서도 그대로 재사용하도록 action 파라미터로
    //    문구만 갈아끼울 수 있게 일반화했다. 브라우저 기본 confirm()은 OK/Cancel 2개뿐이라
    //    "저장하고 진행 / 저장 안 하고 진행 / 취소" 3가지를 표현할 수 없어 직접 만듦.
    //    Promise로 감싸서 호출부에서 await로 선택 결과('save'|'discard'|'cancel')를 그대로 받는다.
    window._SAVE_CHOICE_LABELS = {
        close:  { ko: { title: '닫기 전에 변경사항을 저장할까요?', save: '저장하고 닫기' },
                  en: { title: 'Save changes before closing?',   save: 'Save & Close' } },
        switch: { ko: { title: '이동하기 전에 변경사항을 저장할까요?', save: '저장하고 이동' },
                  en: { title: 'Save changes before switching?',      save: 'Save & Switch' } },
        open:   { ko: { title: '프로젝트 목록을 열기 전에 변경사항을 저장할까요?', save: '저장하고 열기' },
                  en: { title: 'Save changes before opening the project list?',    save: 'Save & Open' } },
    };
    window._showSaveChoiceModal = function(fileName, action) {
        action = action || 'close';
        return new Promise(function(resolve) {
            const _en = window._currentLang === 'en';
            const labels = (window._SAVE_CHOICE_LABELS[action] || window._SAVE_CHOICE_LABELS.close)[_en ? 'en' : 'ko'];
            let modal = document.getElementById('sheet-close-choice-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'sheet-close-choice-modal';
                modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; background:rgba(0,0,0,0.35); align-items:center; justify-content:center;';
                document.body.appendChild(modal);
            }
            const label = fileName || (_en ? 'this project' : '이 프로젝트');
            modal.innerHTML = `
                <div onclick="event.stopPropagation()" style="background:#fff; border-radius:10px; width:min(var(--modal-w-sm), 92vw); box-shadow:0 8px 32px rgba(0,0,0,0.3); padding:22px 24px;">
                    <div style="font-size:15px; font-weight:bold; color:#333; margin-bottom:10px;">💾 ${labels.title}</div>
                    <div style="font-size:13px; color:#666; line-height:1.6; margin-bottom:18px; white-space:pre-wrap;">${_en
                        ? `You have unsaved changes in "${escapeHtml(label)}".`
                        : `"${escapeHtml(label)}"에 저장하지 않은 변경사항이 있습니다.`}</div>
                    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                        <button id="scc-cancel" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:8px 14px; background:#f8f9fa; color:#666; border:1px solid #ccc; border-radius:6px; font-size:12.5px; cursor:pointer; transition:background .15s;">${_en ? 'Cancel' : '취소'}</button>
                        <button id="scc-discard" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="padding:8px 14px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? "Don't Save" : '저장 안 함'}</button>
                        <button id="scc-save" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:8px 14px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${labels.save}</button>
                    </div>
                </div>`;
            modal.style.display = 'flex';
            function done(v) { modal.style.display = 'none'; resolve(v); }
            document.getElementById('scc-cancel').onclick = function() { done('cancel'); };
            document.getElementById('scc-discard').onclick = function() { done('discard'); };
            document.getElementById('scc-save').onclick = function() { done('save'); };
            modal.onclick = function() { done('cancel'); }; // 배경(바깥) 클릭 = 취소
        });
    };

    // 💡 [2026-08-25 신규] 멀티유저 동시편집 최소 안전장치 — 저장이 그냥 파일을 통째로 덮어쓰는
    // 구조라(버전/락 없음), 내가 마지막으로 확인한 시점 이후 "다른 사람이 이미 저장"했으면 그냥 조용히
    // 덮어쓰지 않고 한 번 물어본다. _saveToGoogleDriveRaw가 mergeRemoteDistributions의 결과로 감지.
    window._showSaveConflictModal = function(fileName) {
        return new Promise(function(resolve) {
            const _en = window._currentLang === 'en';
            let modal = document.getElementById('save-conflict-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'save-conflict-modal';
                modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9600; background:rgba(0,0,0,0.4); align-items:center; justify-content:center;';
                document.body.appendChild(modal);
            }
            const label = fileName || (_en ? 'this project' : '이 프로젝트');
            modal.innerHTML = `
                <div onclick="event.stopPropagation()" style="background:#fff; border-radius:10px; width:min(var(--modal-w-sm), 92vw); box-shadow:0 8px 32px rgba(0,0,0,0.3); padding:22px 24px; border-top:5px solid #e67e22;">
                    <div style="font-size:15px; font-weight:bold; color:#b85c00; margin-bottom:10px;">⚠️ ${_en ? 'Someone else saved more recently' : '다른 사용자가 더 최근에 저장했습니다'}</div>
                    <div style="font-size:13px; color:#555; line-height:1.7; margin-bottom:18px; white-space:pre-wrap;">${_en
                        ? `Since you last opened/saved "${escapeHtml(label)}", another user has already saved changes to it.\n\nIf you continue, your save will overwrite their changes (only the task-distribution log is safely merged — everything else is not).`
                        : `"${escapeHtml(label)}"를(을) 마지막으로 열람/저장한 이후, 다른 사용자가 이미 이 프로젝트를 저장했습니다.\n\n지금 그대로 저장하면 그 사람의 변경사항을 덮어쓰게 됩니다(업무 배분 이력만 자동 병합되고, 나머지 내용은 병합되지 않습니다).`}</div>
                    <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
                        <button id="scf-cancel" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:8px 14px; background:#f8f9fa; color:#666; border:1px solid #ccc; border-radius:6px; font-size:12.5px; cursor:pointer; transition:background .15s;">${_en ? 'Cancel (recommended)' : '취소 (권장)'}</button>
                        <button id="scf-overwrite" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="padding:8px 14px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? 'Save anyway (overwrite)' : '그래도 저장 (덮어쓰기)'}</button>
                    </div>
                </div>`;
            modal.style.display = 'flex';
            function done(v) { modal.style.display = 'none'; resolve(v); }
            document.getElementById('scf-cancel').onclick = function() { done(false); };
            document.getElementById('scf-overwrite').onclick = function() { done(true); };
            modal.onclick = function() { done(false); };
        });
    };

    // 💡 [2026-08-20 → 2026-08-25 재도입] 2026-08-20엔 "닫을지 확인" 창을 없애고 무조건 저장 후
    //    닫도록 바꿨었는데, 이번에 다시 "저장하고 닫기 / 저장 안 하고 닫기 / 취소" 3지선다 모달로 복원한다.
    //    이전 동작 대신, 저장 안 한 변경사항이 있을 때만 사람이 직접 고르게 한다.
    //    비활성 탭은 switchToSheetWithSave에서 전환 시점에 이미 저장됐어야 하므로 별도 확인 불필요.
    //    저장+닫기를 한 대기열(_runSerialized)로 묶어서 다른 저장 작업과 겹치는 사고를 막음
    //    (switchToSheetWithSave와 동일 패턴 — raw 저장 함수를 직접 호출, 공개 saveToGoogleDrive()는
    //    같은 대기열에 재진입하면 데드락 나므로 사용 안 함).
    window.closeSheet = function(key) {
        return window._runSerialized(async function() {
            const idx = window._sheets.findIndex(function(s) { return s.key === key; });
            if (idx === -1) return;
            const wasActive = (key === window._activeSheetKey);
            const _en = window._currentLang === 'en';

            if (wasActive) {
                // 💡 [버그 수정] switchToSheetWithSave와 동일한 문제 — currentDriveFileId 없는(=아직
                //    한 번도 저장 안 한) 새 프로젝트는 이 탭을 "✕"로 닫아도 저장 시도 없이 그대로 사라졌다.
                const hasUnsavedChanges = window._hasUnsavedChangesNow();
                if (hasUnsavedChanges) {
                    const sheetEntry = window._sheets[idx];
                    const choice = await window._showSaveChoiceModal(sheetEntry && sheetEntry.fileName, 'close');
                    if (choice === 'cancel') return;
                    if (choice === 'save') {
                        if (window.showToast) window.showToast(_en ? '💾 Saving before close...' : '💾 저장 후 닫는 중...', 'info');
                        const ok = await window._saveToGoogleDriveRaw({ suppressAlert: true });
                        if (!ok) {
                            const _why = window._lastSaveBlockReason || '';
                            if (!confirm((_why ? _why + '\n\n' : '') + (_en
                                ? 'Save failed. Close this tab anyway?\n(Unsaved changes will be lost)'
                                : '저장에 실패했습니다. 그래도 이 시트를 닫을까요?\n(저장하지 않은 변경사항은 사라집니다)'))) return;
                        }
                    }
                    // choice === 'discard' → 저장 없이 그대로 닫기 진행
                }
            }

            window._sheets.splice(idx, 1);
            if (wasActive) {
                if (window._sheets.length) {
                    const next = window._sheets[Math.min(idx, window._sheets.length - 1)];
                    window._activeSheetKey = null; // commit 스킵(닫은 시트는 방금 저장했으니 다시 커밋할 필요 없음)
                    window._activeSheetKey = next.key;
                    window._restoreSheetSnapshot(next.snapshot);
                } else {
                    window._activeSheetKey = null;
                    window._resetToBlankNoConfirm(true); // 💡 마지막 시트를 닫음 — 안내 모달 없이 빈 화면으로
                }
            } else {
                window.renderSheetTabsBar();
            }
        });
    };

    // 새 시트를 등록하고 그 시트로 전환 (프로젝트 로드/신규생성 시 호출)
    window._openAsNewSheet = function(key, fileId, fileName) {
        window._commitActiveSheet();
        window._sheets.push({ key, fileId, fileName, snapshot: null });
        window._activeSheetKey = key;
    };

    // 탭 바 렌더링
    window.renderSheetTabsBar = function() {
        const bar = document.getElementById('sheet-tabs-bar');
        if (!bar) return;
        const count = window._sheets.length;
        // 💡 [UI 수정] 예전엔 시트가 2개 이상일 때만(count > 1) 탭 바를 보여줘서, 프로젝트가 딱 하나만
        //    열려 있을 땐 지금 무슨 파일을 열어둔 건지 탭으로 확인할 방법이 없었다. 1개만 열려 있어도
        //    보이도록 기준을 낮춘다(count >= 1) — 0개(아직 아무 것도 안 연 초기 화면)일 때만 숨김.
        const showBar = count >= 1;
        document.body.classList.toggle('has-multi-sheet-bar', showBar); // 💡 간트 표 높이를 그만큼 줄이기 위한 훅
        if (!showBar) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';

        // 💡 [자동 크기조정] 7개까지는 기존 고정 크기(160px) 그대로. 8개부터는 시트탭 줄(bar)이
        //    실제 쓸 수 있는 폭(#app-main 폭, 사이드바 접힘 상태 반영)을 넘지 않도록 탭 폭을 균등 축소한다.
        //    스크롤바를 일부러 숨겨놔서(위 CSS 주석 참고) 넘치면 뒤 탭이 안 보이는지도 모르는 문제였음.
        //    70px 밑으로는 글자가 안 보일 정도로 뭉개지므로 그 아래론 줄이지 않고(그 다음부턴 가로 스크롤 허용).
        const DEFAULT_TAB_W = 160, MIN_TAB_W = 70, ADD_BTN_W = 28, GAP = 3;
        let tabW = DEFAULT_TAB_W;
        if (count > 7) {
            const available = bar.clientWidth || (bar.parentElement && bar.parentElement.clientWidth) || (DEFAULT_TAB_W * 7);
            const usable = available - ADD_BTN_W - GAP * (count + 1);
            tabW = Math.max(MIN_TAB_W, Math.min(DEFAULT_TAB_W, Math.floor(usable / count)));
        }
        const labelW = Math.max(30, tabW - 40); // 패딩+닫기버튼+gap 몫만큼 라벨 폭에서 뺌(기존 160/120 비율과 동일)

        // 💡 [2026-08-29 파스텔 통일 v3] 선택 안 된 탭=흰 배경, 선택된 탭=제목 상자와 동일한 배경색
        //    (.concept-header-box와 동일한 #e0f5f7/#a3d9e0/#00707d, 청록톤)으로 통일 + 두 상태 모두 호버 추가.
        // 🐛 [버그 수정] 예전엔 이 색들이 하드코딩 hex라 (a) 팔레트로 다른 테마를 골라도 안 바뀌고,
        // (b) onmouseover가 style을 직접 건드리는 순간 브라우저가 style 속성 전체를 rgb(...)로 재직렬화
        // 해버려서 CSS 쪽 [style*="#hex"] 오버라이드도 못 따라가 마우스를 올리면 도로 청록으로 보였다.
        // _cpRoleHex()를 직접 호출해 항상 "지금 테마"의 실제 색을 즉석에서 계산해 넣는다.
        const _cpHex = window._cpRoleHex || function(k) { return { bg: '#e0f5f7', hoverBg: '#a3d9e0', border: '#a3d9e0', hoverBorder: '#52a5af', darkText: '#00707d' }[k]; };
        const _cpHexFor = window._cpRoleHexFor || function(k) { return _cpHex(k); };
        // 💡 [2026-08-30 신규] "테마가 프로젝트마다 저장되니, 시트 탭 색만 보고도 그 프로젝트가 어떤
        // 테마인지 알아보고 싶다"는 요청 — 지금 활성화된(보고 있는) 시트의 테마가 아니라, 각 탭이
        // "자기 자신의" 저장된 테마(활성 시트는 실시간 tabData, 비활성 시트는 전환 시 떠둔 snapshot의
        // tabData)를 각자 따로 읽어서 그 색으로 그린다 — 전환 안 해도 탭 색만으로 구분 가능해짐.
        bar.innerHTML = window._sheets.map(function(s) {
            const active = s.key === window._activeSheetKey;
            const label = s.fileName || '(새 프로젝트)';
            const sheetOwnTabData = active ? window.tabData : (s.snapshot && s.snapshot.tabData);
            const sheetThemeHex = sheetOwnTabData ? sheetOwnTabData.themeColor : null; // 없으면 기본 청록
            const bg = active ? _cpHexFor('bg', sheetThemeHex) : '#fff';
            const border = _cpHexFor('hoverBg', sheetThemeHex);
            const hoverBg = active ? _cpHexFor('zebraB', sheetThemeHex) : _cpHexFor('bg', sheetThemeHex);
            const hoverBorder = _cpHexFor('hoverBorder', sheetThemeHex);
            return `<div onclick="window.switchToSheetWithSave('${s.key}')"
                title="${escapeHtml(label)}"
                onmouseover="this.style.background='${hoverBg}'; this.style.borderColor='${hoverBorder}';"
                onmouseout="this.style.background='${bg}'; this.style.borderColor='${border}';"
                style="display:flex; align-items:center; gap:6px; padding:6px 10px; border-radius:8px 8px 0 0; cursor:pointer; font-size:12px; white-space:nowrap; max-width:${tabW}px; transition:background .15s, border-color .15s;
                       background:${bg}; color:${_cpHexFor('darkText', sheetThemeHex)}; font-weight:${active ? 'bold' : 'normal'};
                       border:1px solid ${border}; border-bottom:1px solid ${bg}; margin-bottom:-1px;">
                <span style="overflow:hidden; text-overflow:ellipsis; max-width:${labelW}px;">📄 ${escapeHtml(label)}</span>
                <span onclick="event.stopPropagation(); window.closeSheet('${s.key}');"
                    onmouseover="event.stopPropagation(); this.style.background='${hoverBg}'; this.style.color='${_cpHexFor('darkText', sheetThemeHex)}';"
                    onmouseout="this.style.background='transparent'; this.style.color='${hoverBorder}';"
                    style="color:${hoverBorder}; background:transparent; border-radius:4px; padding:0 3px; font-size:13px; line-height:1.4; flex-shrink:0; transition:background .15s, color .15s;">✕</span>
            </div>`;
        }).join('') + `<div onclick="window.selectProject()" title="새 시트로 프로젝트 열기"
                onmouseover="this.style.background='${_cpHex('bg')}';"
                onmouseout="this.style.background='transparent';"
                style="display:flex; align-items:center; justify-content:center; width:28px; flex-shrink:0; padding:6px 4px; cursor:pointer; font-size:14px; color:${_cpHex('darkText')}; font-weight:bold; border-radius:6px; transition:background .15s;">+</div>`;
    };

    // 💡 [버그 수정 v2] 탭 폭 자동조정은 지금까지 시트가 새로 열리거나 닫힐 때, 그리고(직전 수정으로)
    //    window resize 이벤트가 발생할 때만 재계산됐음. 그런데 resize 이벤트는 "브라우저 창 자체의
    //    크기"가 바뀔 때만 발동하고, 사이드바 접기/펴기 같은 순수 CSS 레이아웃 변화(margin-left만 바뀜)는
    //    원래 resize를 발생시키지 않는다(toggleSidebar()가 예외적으로 수동 dispatch해줘서 그 경우만
    //    우연히 됐던 것 — 그 외 폭이 바뀌는 다른 모든 경우, 예를 들어 초기 레이아웃이 뒤늦게 자리잡는
    //    경우 등은 여전히 못 잡았음). → window resize 대신, 탭 바 자신의 "실제 렌더링 폭"을
    //    ResizeObserver로 직접 감시해서 원인과 무관하게 폭이 바뀌면 항상 재계산하도록 바꾼다.
    let _sheetTabsResizeTimer = null;
    window._lastSheetTabsBarWidth = null;
    window._scheduleSheetTabsResize = function() {
        if (!window._sheets || window._sheets.length <= 1) return;
        clearTimeout(_sheetTabsResizeTimer);
        _sheetTabsResizeTimer = setTimeout(function() { window.renderSheetTabsBar(); }, 150);
    };
    window.addEventListener('resize', window._scheduleSheetTabsResize); // 창 크기 변경 — 추가 안전망으로 계속 유지
    if (window.ResizeObserver) {
        const _sheetTabsBarEl = document.getElementById('sheet-tabs-bar');
        if (_sheetTabsBarEl) {
            new ResizeObserver(function(entries) {
                const w = Math.round(entries[0].contentRect.width);
                // 💡 폭이 실제로 안 바뀌었으면 무시 — renderSheetTabsBar() 자신이 내용을 다시 그리면서
                //    (높이 등) 아주 미세하게 박스가 흔들려 이 옵저버를 스스로 재호출하는 걸 막기 위함
                if (w === window._lastSheetTabsBarWidth) return;
                window._lastSheetTabsBarWidth = w;
                window._scheduleSheetTabsResize();
            }).observe(_sheetTabsBarEl);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🩺 [진단] "느린 게 정말 구글 드라이브 문제인가?"를 객관적으로 판별하는 도구.
    //    콘솔에서 diagnoseDriveSpeed() 실행 — 프로젝트를 하나 연 상태에서 호출.
    //    메타 조회(순수 왕복 지연) · 전체 다운로드 반복(속도제한 편차) · 비-구글 대조군(내 인터넷
    //    자체가 느린 건지 구글만 느린 건지)까지 함께 재서 자동으로 판정 문구를 찍어준다.
    window.diagnoseDriveSpeed = async function(rounds) {
        rounds = rounds || 3;
        const fileId = window.currentDriveFileId;
        if (!fileId) { console.log('%c⚠️ 먼저 프로젝트를 하나 열고 실행해주세요.', 'color:#e03131;font-weight:bold'); return; }
        const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { console.log('%c⚠️ 구글 드라이브 연동 후 실행해주세요.', 'color:#e03131;font-weight:bold'); return; }

        console.log('%c🩺 드라이브 속도 진단 시작 — 잠시만 기다려주세요...', 'color:#2c5f8a;font-weight:bold');

        let fname = '', sizeKB = null;
        try {
            const m = await gapi.client.drive.files.get({ fileId: fileId, fields: 'name,size', supportsAllDrives: true });
            fname = m.result.name || '';
            if (m.result.size) sizeKB = Math.round(Number(m.result.size) / 1024);
        } catch (e) {}

        // ① 메타 조회 = 거의 데이터 없는 요청 → 순수 왕복 지연
        const metaMs = [];
        for (let i = 0; i < rounds; i++) {
            const t = performance.now();
            try { await gapi.client.drive.files.get({ fileId: fileId, fields: 'id', supportsAllDrives: true }); metaMs.push(Math.round(performance.now() - t)); }
            catch (e) { metaMs.push('ERR ' + (e && e.status ? e.status : '')); }
        }

        // ② 파일 전체 다운로드 = 대역폭 + 속도제한 확인
        const contentRuns = [];
        let rateLimited = false;
        for (let i = 0; i < rounds; i++) {
            const t = performance.now();
            try {
                const r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
                if (!r.ok) {
                    if (r.status === 429 || r.status === 403) rateLimited = true;
                    let why = '';
                    try { const j = await r.json(); why = (j && j.error && j.error.message) || ''; } catch (e2) {}
                    contentRuns.push({ ms: Math.round(performance.now() - t), kb: 0, err: 'HTTP ' + r.status + (why ? ' — ' + why : '') });
                    continue;
                }
                const txt = await r.text();
                const ms = Math.round(performance.now() - t);
                const kb = Math.round(txt.length / 1024);
                contentRuns.push({ ms: ms, kb: kb, kbps: Math.round(kb / Math.max(ms, 1) * 1000) });
            } catch (e) { contentRuns.push({ ms: Math.round(performance.now() - t), kb: 0, err: String(e && e.message) }); }
        }

        // ④ 대조군: 구글이 아닌 곳(이 페이지 자체)에서 비슷한 크기 받아보기
        const ctrlRuns = [];
        for (let i = 0; i < 2; i++) {
            const t = performance.now();
            try {
                const r = await fetch(location.pathname + '?nocache=' + Date.now(), { cache: 'no-store' });
                const txt = await r.text();
                const ms = Math.round(performance.now() - t);
                const kb = Math.round(txt.length / 1024);
                ctrlRuns.push({ ms: ms, kb: kb, kbps: Math.round(kb / Math.max(ms, 1) * 1000) });
            } catch (e) { ctrlRuns.push({ err: String(e && e.message) }); }
        }

        const okRuns = contentRuns.filter(function(r) { return !r.err; });
        const avg = function(a) { return a.length ? Math.round(a.reduce(function(s, v) { return s + v; }, 0) / a.length) : 0; };
        const driveKbps = avg(okRuns.map(function(r) { return r.kbps; }));
        const ctrlOk = ctrlRuns.filter(function(r) { return !r.err; });
        const ctrlKbps = avg(ctrlOk.map(function(r) { return r.kbps; }));
        const numericMeta = metaMs.filter(function(v) { return typeof v === 'number'; });
        const metaAvg = avg(numericMeta);
        const msList = okRuns.map(function(r) { return r.ms; });
        const spread = msList.length > 1 ? Math.max.apply(null, msList) - Math.min.apply(null, msList) : 0;

        console.log('%c━━━━━━━━━━ 🩺 드라이브 속도 진단 결과 ━━━━━━━━━━', 'color:#2c5f8a;font-weight:bold');
        console.log('대상 파일       : ' + fname + (sizeKB !== null ? ' (' + sizeKB + 'KB)' : ''));
        console.log('① 메타 조회     : ' + metaMs.join(' / ') + ' ms   ← 데이터 거의 없는 요청');
        console.log('② 전체 다운로드 : ' + contentRuns.map(function(r) { return r.err ? r.err : r.ms + 'ms(' + r.kb + 'KB, ' + r.kbps + 'KB/s)'; }).join(' / '));
        console.log('③ 반복 편차     : ' + spread + 'ms   ← 크면 속도제한 신호');
        console.log('④ 대조군(비구글): ' + ctrlRuns.map(function(r) { return r.err ? r.err : r.ms + 'ms(' + r.kb + 'KB, ' + r.kbps + 'KB/s)'; }).join(' / '));
        console.log('%c─────────────────── 판정 ───────────────────', 'color:#2c5f8a;font-weight:bold');

        const verdict = [];
        if (rateLimited) verdict.push('🚨 구글이 속도제한(HTTP 403/429)을 응답했습니다 → 구글 드라이브 문제 확정');
        if (metaAvg > 2000) verdict.push('🚨 데이터가 거의 없는 메타 요청조차 평균 ' + metaAvg + 'ms → 파일 크기와 무관한 구글/네트워크 응답 지연');
        if (spread > 5000) verdict.push('🚨 같은 파일인데 실행마다 ' + spread + 'ms나 차이 → 크기 문제가 아니라 구글 쪽 변동(속도제한 유력)');
        if (ctrlKbps > 0 && driveKbps > 0 && ctrlKbps > driveKbps * 5) verdict.push('🚨 내 인터넷은 ' + ctrlKbps + 'KB/s인데 드라이브만 ' + driveKbps + 'KB/s → 인터넷이 아니라 구글 드라이브가 느림');
        if (ctrlKbps > 0 && driveKbps > 0 && ctrlKbps < driveKbps * 1.5) verdict.push('ℹ️ 드라이브(' + driveKbps + 'KB/s)와 일반 다운로드(' + ctrlKbps + 'KB/s) 속도가 비슷 → 구글이 아니라 현재 네트워크 전반이 느림');
        if (sizeKB !== null && sizeKB > 1000) verdict.push('⚠️ 파일이 ' + sizeKB + 'KB로 큽니다 → 크기 자체도 지연에 기여(수정이력 누적 등 정리 필요)');
        if (!verdict.length) verdict.push('✅ 지금은 정상 범위입니다. 느릴 때 다시 실행해서 비교해주세요.');
        verdict.forEach(function(v) { console.log(v); });
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color:#2c5f8a;font-weight:bold');

        return { file: fname, sizeKB: sizeKB, metaMs: metaMs, content: contentRuns, control: ctrlRuns, driveKbps: driveKbps, controlKbps: ctrlKbps, rateLimited: rateLimited };
    };


    // 💡 silent=true면 개별 "로드 완료" 토스트를 생략 — 담당자 이름 클릭으로 여러 프로젝트를 한 번에 열 때
    //    파일마다 토스트가 쌓이는 걸 막고, 호출한 쪽에서 요약 토스트 하나만 띄우도록 함
    window.executeLoadFile = async function(fileId, fileName, silent) {
        window.closeDriveModal();
        // 💡 [멀티시트] 이미 열려있는 프로젝트면 다시 안 받아오고 그 시트로 전환만
        // 💡 [버그 수정] 예전 조건은 `already.snapshot`이 있어야만 재다운로드를 건너뛰었다. 그런데 스냅샷은
        //    "그 시트에서 다른 시트로 넘어갈 때" 비로소 채워지므로, 지금 보고 있는(활성) 시트는 항상
        //    snapshot === null 이다. 그래서 같은 프로젝트를 한 번 더 열라고 하면 이 검사를 통과해버려
        //    똑같은 파일을 통째로 다시 받았다("전체 프로젝트 한 번에 열기"에서 모든 파일이 정확히 2번씩
        //    다운로드되던 원인 — 실측 로그로 확인). 이미 열려 있으면 어떤 상태든 다시 받지 않는다.
        const already = window._findSheetByFileId(fileId);
        if (already) {
            if (already.key === window._activeSheetKey) return;                 // 지금 보고 있는 바로 그 프로젝트
            if (already.snapshot) { await window.switchToSheetWithSave(already.key, silent); return; }
        }
        // 💡 [진단용 계측] "프로젝트가 늦게 열린다"는 신고가 반복돼서, 실제 Drive 파일 다운로드 자체가
        //    느린 건지(=구글 쪽 지연) 그 이후 화면 렌더링이 느린 건지 구분할 수 있게 시간을 잰다.
        const _tFetch0 = performance.now();
        try {
            let response = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true });
            const _fetchMs = Math.round(performance.now() - _tFetch0);
            // 💡 fileId도 같이 남긴다 — 같은 이름의 파일이 드라이브에 중복 생성된 경우(서로 다른 id)와
            //    같은 파일을 두 번 받는 경우를 로그만 보고 구분할 수 있게.
            console.info(`[프로젝트 열기 계측] "${fileName}" (id:${String(fileId).slice(-6)}) Drive 다운로드: ${_fetchMs}ms`);
            if (_fetchMs > 3000) console.warn(`[프로젝트 열기 계측] ⚠️ Drive 다운로드가 ${_fetchMs}ms나 걸림 — 파일 크기 또는 구글 쪽 응답 지연 가능성`);
            const _tRender0 = performance.now();
            let saveData = response.result;
            if (saveData && saveData.globalData) {
                window._openAsNewSheet(fileId, fileId, fileName); // 💡 [멀티시트] 지금 보던 시트를 저장하고 새 시트로 등록
                globalData = saveData.globalData.map(obj => {
                    let row = obj.data;
                    for (let key in obj) { if (key !== 'data') row[key] = obj[key]; }
                    return row;
                });
                window.changeLogs = saveData.changeLogs || [];
                window.lastSavedLogCount = window.changeLogs.length;
                window._nonGanttDirty = false; // 💡 방금 로드한 프로젝트는 아직 아무것도 안 건드렸으니 깨끗한 상태로 시작
                colIdx = saveData.colIdx || colIdx;
                filterColumns = saveData.filterColumns || filterColumns;
                window.projectMeta = saveData.projectMeta || window.projectMeta || {};
                window.tabData = saveData.tabData || window.tabData || {};
                window.projectDistributions = saveData.distributions || []; // 📥 [Phase 2.5] 배분 원장 보관 (병합 기준점)
                window.mcNormalizeAfterLoad();
                if (window.populateTabData) window.populateTabData();
                window.currentDriveFileId = fileId;
                window.currentDriveFileName = fileName;
                window.updateCurrentFileLabel();
                window.recalculateSchedules();
                window.renderSheetTabsBar(); // 💡 [멀티시트]
                // 💡 [버그 수정] 계획(Baseline)은 프로젝트별로 분리 저장되므로, 프로젝트가 바뀌면 그 프로젝트 것으로 다시 로드
                window._compareTargetId = null;
                // 🆕 계획(Baseline)은 이제 드라이브 JSON에도 함께 저장됨 — 있으면 그걸 그대로 신뢰(팀 공용),
                //    없으면(예: 이 기능 이전에 저장된 옛 파일) 이 브라우저의 localStorage 기록으로 대체
                if (saveData.scheduleBaselines && saveData.scheduleBaselines.length) {
                    window._scheduleBaselines = saveData.scheduleBaselines;
                    if (typeof persistScheduleBaselines === 'function') persistScheduleBaselines();
                } else if (window.loadScheduleBaselines) {
                    window.loadScheduleBaselines();
                }
                // 💡 [성능] 방금 이 파일의 내용을 통째로 받아왔으므로, 우리 메모리 상태 == 그 시점 원격 상태다.
                //    그 시점의 modifiedTime(목록 조회 때 이미 받아둔 값)을 배분 병합 캐시 기준으로 심어두면,
                //    파일을 연 직후 첫 저장에서 불필요한 전체 재다운로드를 건너뛸 수 있다.
                //    (목록 조회 이후 누가 수정했다면 값이 달라 캐시 미스 → 정상적으로 다시 받아오므로 안전)
                const _seedMt = (window._driveListModifiedTimes || {})[fileId];
                if (_seedMt) { window._distMergeModifiedTime = window._distMergeModifiedTime || {}; window._distMergeModifiedTime[fileId] = _seedMt; }
                console.info(`[프로젝트 열기 계측] "${fileName}" 화면 렌더링: ${Math.round(performance.now() - _tRender0)}ms`);
                if (!silent) window.showToast(window._currentLang === 'en' ? `✅ Drive sync complete: ${fileName}` : `✅ 공용 드라이브 동기화 완료: ${fileName}`);
                // ✅ [AI 학습 Phase 3] Drive에서 받아온 학습 데이터를 localStorage와 병합 (팀 공유)
                if (saveData.aiLearning && saveData.aiLearning.length && window._alMergeFromDrive) {
                    window._alMergeFromDrive(saveData.aiLearning, fileName);
                }
                // ✅ [AI 학습 Phase 1] 재배치 대기 알림 (Phase 1에서는 04b에도 있지만 주 로드 경로는 여기)
                if (window._checkReassignQueueOnLoad) window._checkReassignQueueOnLoad();

                // 💡 [2026-08-25 신규] 이 프로젝트에 대해 이 브라우저에 남은(=연결 끊김 등으로 저장 못 했던)
                //    로컬 백업이 있으면 복원 여부를 물어봄 — 방금 받아온 원격 내용이 이미 최신이면 자동 정리됨.
                if (window._checkLocalBackupOnOpen) window._checkLocalBackupOnOpen(fileId, window.changeLogs.length);
            }
        } catch (err) { alert("파일 로드 실패: " + err.message); }
    }

    // 💡 [팀 그룹핑] showDriveFileModal — 팀(외부 아코디온) → 담당자(내부 아코디온) → 파일 행
    //    3rd param indexProjects: project_index.json entries (team 보강용).
    //    appProperties.team이 없는 기존 파일도 index 기준으로 팀을 표시할 수 있음.
    window.showDriveFileModal = function(files, mode, indexProjects) {
        mode = mode || 'open'; // 'open' | 'delete'
        indexProjects = Array.isArray(indexProjects) ? indexProjects : (window._piModalCache || []);
        let listContainer = document.getElementById('drive-file-list');
        if(!listContainer) return;
        listContainer.innerHTML = '';
        const _dmEn = window._currentLang === 'en';
        const _dmTitle = document.getElementById('drive-modal-title');
        if (_dmTitle) _dmTitle.textContent = mode === 'delete'
            ? (_dmEn ? '🗑️ Delete Project' : '🗑️ 프로젝트 삭제')
            : (_dmEn ? '📂 Open Project' : '📂 프로젝트 불러오기');
        const _dmDesc = document.getElementById('drive-modal-desc');
        if (_dmDesc) _dmDesc.textContent = mode === 'delete'
            ? (_dmEn ? '⚠️ Select a project file to delete. This cannot be undone from within the app.' : '⚠️ 삭제할 프로젝트 파일을 선택해 주세요. 앱 안에서는 되돌릴 수 없습니다.')
            : (_dmEn ? 'Select a project file to open.' : '불러올 프로젝트 파일을 선택해 주세요.');

        // 💡 modifiedTime 캐시 (기존 성능 최적화 유지)
        window._driveListModifiedTimes = window._driveListModifiedTimes || {};
        files.forEach(function(f) { if (f && f.id && f.modifiedTime) window._driveListModifiedTimes[f.id] = f.modifiedTime; });

        // ── 팀 팔레트 (개발N팀 번호 기준, 나머지는 해시) ──────────────────────────────────
        const _TEAM_PAL = [
            { h:'#cfe6fa', b:'#a5c8f0', t:'#1a4f7a', hv:'#b8d8f0' }, // 1 파랑
            { h:'#c9ecd3', b:'#a8dab8', t:'#1a6640', hv:'#b0dfc0' }, // 2 초록
            { h:'#ffe3b3', b:'#ffc078', t:'#7a4800', hv:'#ffd090' }, // 3 주황
            { h:'#e0d8ff', b:'#b8a9f0', t:'#3a2080', hv:'#cec4ff' }, // 4 보라
            { h:'#ffd6d0', b:'#f0a9a5', t:'#7a2020', hv:'#ffc0b8' }, // 5 빨강
            { h:'#c8f0e8', b:'#80d0c0', t:'#005040', hv:'#b0e8dc' }, // 6 청록
            { h:'#fdf0b0', b:'#f0d060', t:'#604800', hv:'#fbe898' }, // 7 노랑
            { h:'#e8d8f0', b:'#c0a0d8', t:'#501060', hv:'#d8c4e8' }, // 8 자주
            { h:'#d8f0d8', b:'#90d090', t:'#205020', hv:'#c4e8c4' }, // 9 연두
        ];
        function _pal(teamName) {
            if (!teamName) return { h:'#e9ecef', b:'#ced4da', t:'#495057', hv:'#dee2e6' };
            const m = teamName.match(/(\d+)/);
            if (m) return _TEAM_PAL[(parseInt(m[1], 10) - 1) % _TEAM_PAL.length];
            let hsh = 0;
            for (let i = 0; i < teamName.length; i++) hsh = (hsh * 31 + teamName.charCodeAt(i)) & 0xffff;
            return _TEAM_PAL[hsh % _TEAM_PAL.length];
        }

        // ── 팀 결정 헬퍼 (appProperties.team → index → 없으면 '') ────────────────────────
        function _fileTeam(file) {
            const t = file.appProperties && file.appProperties.team;
            if (t) return t;
            if (indexProjects.length) {
                const e = indexProjects.find(function(p) { return p.drive_file_id === file.id; });
                if (e && e.team) return e.team;
            }
            return '';
        }

        const UNASSIGNED_TEAM = _dmEn ? '(No Team)' : '미지정 팀';
        const UNASSIGNED_PM   = _dmEn ? 'Unassigned' : '미지정';

        // ── 팀 → { pm → [files] } 2단 맵 구성 ──────────────────────────────────────────
        const teamMap = {};
        files.forEach(function(file) {
            const team = _fileTeam(file) || UNASSIGNED_TEAM;
            const pm   = (file.appProperties && file.appProperties.pm) ? file.appProperties.pm.trim() : UNASSIGNED_PM;
            if (!teamMap[team]) teamMap[team] = {};
            if (!teamMap[team][pm]) teamMap[team][pm] = [];
            teamMap[team][pm].push(file);
        });

        // 팀 정렬: 개발N팀 번호순, 미지정은 맨 뒤
        const teamNames = Object.keys(teamMap).sort(function(a, b) {
            if (a === UNASSIGNED_TEAM) return 1;
            if (b === UNASSIGNED_TEAM) return -1;
            const na = parseInt((a.match(/\d+/) || ['0'])[0], 10);
            const nb = parseInt((b.match(/\d+/) || ['0'])[0], 10);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
            return a.localeCompare(b, 'ko');
        });

        // ── action-slot 정리: open 모드면 "새 프로젝트 등록" 버튼, delete면 비움 ─────────
        const _actionSlot = document.getElementById('drive-modal-action-slot');
        if (_actionSlot) {
            _actionSlot.innerHTML = '';
            if (mode === 'open') {
                const newProjectBtn = document.createElement('div');
                newProjectBtn.style.cssText = 'padding:6px 14px; border:1px solid #a8dab8; border-radius:8px; cursor:pointer; font-size:12.5px; font-weight:bold; color:#1f7a3d; background:#e6f6ea; transition:background .15s, border-color .15s; white-space:nowrap;';
                newProjectBtn.textContent = _dmEn ? '➕ New Project' : '➕ 새 프로젝트 등록';
                newProjectBtn.onmouseover = function() { this.style.background = '#c9ecd3'; this.style.borderColor = '#7cc494'; };
                newProjectBtn.onmouseout  = function() { this.style.background = '#e6f6ea'; this.style.borderColor = '#a8dab8'; };
                newProjectBtn.onclick = function() { window.closeDriveModal(); window.startNewProject(); };
                _actionSlot.appendChild(newProjectBtn);
            }
        }

        // ── 파일 행(fileBtn) 생성 공통 헬퍼 ────────────────────────────────────────────
        function _makeFileRow(file) {
            const d = new Date(file.modifiedTime);
            const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
            const isCompleted = !!(file.appProperties && file.appProperties.completed === '1');
            const doneBadge = isCompleted ? ` <span style="font-size:10.5px; font-weight:bold; color:#2f9e44; background:#e7f6ec; border-radius:9px; padding:1px 8px; vertical-align:middle;">✅ ${_dmEn ? 'Done' : '완료'}</span>` : '';
            const rowC = window._driveRowThemeColors ? window._driveRowThemeColors(file) : { bg: '#e8f4fd', border: '#a5c8f0', hoverBg: '#cfe6fa', hoverBorder: '#7fb0dd' };
            const fileBtn = document.createElement('div');
            if (mode === 'delete') {
                const delBg = isCompleted ? '#fff' : rowC.bg, delBorder = isCompleted ? '#ced4da' : rowC.border;
                fileBtn.style.cssText = 'padding:9px 14px; border:1px solid ' + delBorder + '; border-radius:8px; display:flex; justify-content:space-between; align-items:center; gap:10px; background:' + delBg + '; transition:background .15s, border-color .15s;';
                const infoWrap = document.createElement('div');
                infoWrap.style.cssText = 'flex:1; min-width:0; display:flex; justify-content:space-between; align-items:center; gap:12px;';
                infoWrap.innerHTML = '<div style="font-weight:bold; color:#333; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📄 ' + escapeHtml(file.name) + doneBadge + '</div><div style="font-size:12px; color:#868e96; flex-shrink:0;">' + dateStr + '</div>';
                const delBtn = document.createElement('button');
                delBtn.textContent = _dmEn ? '🗑 Delete' : '🗑 삭제';
                delBtn.style.cssText = 'flex-shrink:0; padding:6px 14px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;';
                delBtn.onmouseover = function() { this.style.background = '#f5c2bd'; this.style.borderColor = '#e08f87'; };
                delBtn.onmouseout  = function() { this.style.background = '#fbe4e2'; this.style.borderColor = '#eeb0ac'; };
                delBtn.onclick = function(e) { e.stopPropagation(); window._confirmDeleteProjectFile(file); };
                fileBtn.appendChild(infoWrap); fileBtn.appendChild(delBtn);
            } else {
                const openBg = isCompleted ? '#f8f9fa' : rowC.bg, openBorder = isCompleted ? '#ced4da' : rowC.border;
                const openHoverBg = isCompleted ? '#e9ecef' : rowC.hoverBg, openHoverBorder = isCompleted ? '#adb5bd' : rowC.hoverBorder;
                fileBtn.style.cssText = 'padding:9px 14px; border:1px solid ' + openBorder + '; border-radius:8px; cursor:pointer; transition:background .15s, border-color .15s; display:flex; justify-content:space-between; align-items:center; background:' + openBg + ';';
                fileBtn.onmouseover = function() { this.style.background = openHoverBg; this.style.borderColor = openHoverBorder; };
                fileBtn.onmouseout  = function() { this.style.background = openBg;      this.style.borderColor = openBorder; };
                fileBtn.onclick = function() { window.executeLoadFile(file.id, file.name); };
                fileBtn.innerHTML = '<div style="font-weight:bold; color:' + (isCompleted ? '#868e96' : '#333') + '; font-size:14px;">📄 ' + escapeHtml(file.name) + doneBadge + '</div><div style="font-size:12px; color:#868e96;">' + dateStr + '</div>';
            }
            return fileBtn;
        }

        // ── 팀 아코디온 렌더링 ─────────────────────────────────────────────────────────
        // 팀이 1개(또는 모두 미지정)이면 팀 헤더를 열어서 보여줌, 여러 팀이면 기본 열림(▾)
        const expandTeam = true; // 기본 펼침 — 팀 목록 스캔이 더 직관적임
        teamNames.forEach(function(teamName) {
            const pmMap = teamMap[teamName];
            const teamFiles = [].concat.apply([], Object.values(pmMap));
            const pal = teamName === UNASSIGNED_TEAM ? { h:'#e9ecef', b:'#ced4da', t:'#495057', hv:'#dee2e6' } : _pal(teamName);

            // 팀 외부 래퍼
            const teamWrap = document.createElement('div');
            teamWrap.style.cssText = 'border:1.5px solid ' + pal.b + '; border-radius:10px; overflow:hidden;';

            // 팀 헤더
            const teamHdr = document.createElement('div');
            teamHdr.style.cssText = 'padding:10px 14px; background:' + pal.h + '; cursor:pointer; display:flex; align-items:center; gap:8px; user-select:none;';
            teamHdr.onmouseover = function() { teamHdr.style.background = pal.hv; };
            teamHdr.onmouseout  = function() { teamHdr.style.background = pal.h; };
            const teamArrow = document.createElement('span');
            teamArrow.style.cssText = 'font-size:12px; color:' + pal.t + '; width:14px; display:inline-block;';
            teamArrow.textContent = expandTeam ? '▾' : '▸';
            const teamLbl = document.createElement('span');
            teamLbl.style.cssText = 'font-size:14px; font-weight:bold; color:' + pal.t + '; flex:1;';
            teamLbl.textContent = '🏢 ' + teamName + ' (' + teamFiles.length + (_dmEn ? ' projects)' : '개)');
            teamHdr.appendChild(teamArrow);
            teamHdr.appendChild(teamLbl);
            // 팀 전체 열기 버튼 (open 모드, 2개 이상)
            if (mode === 'open' && teamFiles.length > 1) {
                const tBtn = document.createElement('span');
                tBtn.style.cssText = 'font-size:11.5px; color:' + pal.t + '; opacity:0.75; cursor:pointer; padding:2px 8px; border:1px solid ' + pal.b + '; border-radius:9px; transition:opacity .15s; flex-shrink:0;';
                tBtn.textContent = _dmEn ? 'Open all ' + teamFiles.length : '전체 ' + teamFiles.length + '개 열기';
                tBtn.title = _dmEn ? 'Open all ' + teamName + ' projects as separate sheets' : '[' + teamName + '] 전체 ' + teamFiles.length + '개를 한 번에 열기';
                tBtn.onmouseover = function() { this.style.opacity = '1'; };
                tBtn.onmouseout  = function() { this.style.opacity = '0.75'; };
                tBtn.onclick = async function(e) {
                    e.stopPropagation();
                    if (!confirm(_dmEn ? 'Open all ' + teamFiles.length + ' project(s) in [' + teamName + '] as separate sheets?' : '[' + teamName + '] 전체 프로젝트 ' + teamFiles.length + '개를 모두 새 시트로 여시겠습니까?')) return;
                    window.closeDriveModal();
                    for (const f of teamFiles) { await window.executeLoadFile(f.id, f.name, true); }
                    if (window.showToast) window.showToast(_dmEn ? '✅ Opened all ' + teamFiles.length + ' project(s) in ' + teamName : '✅ [' + teamName + '] 프로젝트 ' + teamFiles.length + '개 열기 완료', 'info');
                };
                teamHdr.appendChild(tBtn);
            }

            // 팀 바디 (PM 서브 아코디온 포함)
            const teamBody = document.createElement('div');
            teamBody.style.cssText = 'display:' + (expandTeam ? 'flex' : 'none') + '; flex-direction:column; gap:6px; padding:8px; background:#fafafa;';

            // 팀 헤더 클릭 → 팀 접기/펴기
            teamHdr.onclick = function() {
                const c = teamBody.style.display === 'none';
                teamBody.style.display = c ? 'flex' : 'none';
                teamArrow.textContent = c ? '▾' : '▸';
            };

            // ── PM 서브 아코디온 ────────────────────────────────────────────────────────
            const pmNames = Object.keys(pmMap).sort(function(a, b) {
                if (a === UNASSIGNED_PM) return 1;
                if (b === UNASSIGNED_PM) return -1;
                return a.localeCompare(b, 'ko');
            });

            pmNames.forEach(function(pmName) {
                const pmFiles = pmMap[pmName];
                const pmWrap = document.createElement('div');
                pmWrap.style.cssText = 'border:1px solid #e0e0e0; border-radius:8px; overflow:hidden;';
                const pmHdr = document.createElement('div');
                pmHdr.style.cssText = 'padding:8px 12px; background:#f2f4f6; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:bold; font-size:12.5px; color:#444; user-select:none; transition:background .15s;';
                pmHdr.onmouseover = function() { pmHdr.style.background = '#e8eaed'; };
                pmHdr.onmouseout  = function() { pmHdr.style.background = '#f2f4f6'; };
                const pmArrow = document.createElement('span');
                pmArrow.style.cssText = 'font-size:10px; width:12px; display:inline-block;';
                pmArrow.textContent = '▸';
                const pmLbl = document.createElement('span');
                pmLbl.textContent = '👤 ' + pmName + ' (' + pmFiles.length + ')';
                // PM 이름 클릭 → PM 전체 열기 (open 모드, 미지정 아닐 때)
                if (pmName !== UNASSIGNED_PM && mode === 'open') {
                    pmLbl.style.cssText = 'text-decoration:underline; text-decoration-style:dotted; text-underline-offset:3px; cursor:pointer;';
                    pmLbl.title = _dmEn ? 'Open all ' + pmFiles.length + ' project(s) for ' + pmName : '[' + pmName + '] 담당 프로젝트 ' + pmFiles.length + '개를 한 번에 엽니다';
                    pmLbl.onclick = async function(e) {
                        e.stopPropagation();
                        if (!confirm(_dmEn ? 'Open all ' + pmFiles.length + ' project(s) for [' + pmName + ']?' : '[' + pmName + '] 담당 프로젝트 ' + pmFiles.length + '개를 전부 새 시트로 여시겠습니까?')) return;
                        window.closeDriveModal();
                        for (const f of pmFiles) { await window.executeLoadFile(f.id, f.name, true); }
                        if (window.showToast) window.showToast(_dmEn ? '✅ Opened ' + pmFiles.length + ' project(s) for ' + pmName : '✅ [' + pmName + '] 프로젝트 ' + pmFiles.length + '개 열기 완료', 'info');
                    };
                }
                pmHdr.appendChild(pmArrow); pmHdr.appendChild(pmLbl);
                const pmBody = document.createElement('div');
                pmBody.style.cssText = 'display:none; flex-direction:column; gap:8px; padding:8px;'; // 기본 접힘
                pmHdr.onclick = function() {
                    const c = pmBody.style.display === 'none';
                    pmBody.style.display = c ? 'flex' : 'none';
                    pmArrow.textContent = c ? '▾' : '▸';
                };
                pmFiles.forEach(function(file) { pmBody.appendChild(_makeFileRow(file)); });
                pmWrap.appendChild(pmHdr); pmWrap.appendChild(pmBody);
                teamBody.appendChild(pmWrap);
            });

            teamWrap.appendChild(teamHdr);
            teamWrap.appendChild(teamBody);
            listContainer.appendChild(teamWrap);
        });

        document.getElementById('drive-file-modal-overlay').style.display = 'flex';
    }
    
    window.closeDriveModal = function() {
        document.getElementById('drive-file-modal-overlay').style.display = 'none';
    }

