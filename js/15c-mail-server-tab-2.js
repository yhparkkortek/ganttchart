// [분리됨] 원본: js/15-mail-attachment-tab.js 의 3072~4539행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 메일 서버 탭 기능 2/2
window._msExtractSuspiciousTokens = function(text) {
    const s = String(text || '');
    const found = new Set();
    window._MS_SUSPICIOUS_PATTERNS.forEach(function(re) {
        (s.match(re) || []).forEach(function(t) {
            const trimmed = t.trim();
            if (trimmed.length < MS_MIN_KEYWORD_LEN || window._MS_KW_STOPWORDS.has(trimmed.toLowerCase())) return;
            if (window._MS_DOC_ID_PATTERN.test(trimmed)) return; // 행정 문서번호(예: OW-20260814-013) 제외
            found.add(trimmed);
        });
    });
    return Array.from(found);
};

// 💡 [추천] "의심 후보" 키워드가 있는 메일 안에서, 열려있는 프로젝트들 중 어느 프로젝트의
//    기존 키워드/모델명 조각이 가장 많이 같이 등장하는지(co-occurrence)로 대상 프로젝트를 추정.
//    확신 있는 신호가 하나도 없으면 null(추천 안 함 — 검토 화면에서 사람이 직접 골라야 함)
window._msRecommendProjectFor = function(mail, openProjects, excludeToken) {
    const haystack = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
    let best = null, bestScore = 0;
    openProjects.forEach(function(p) {
        let score = 0;
        const frags = [];
        if (p.model) { frags.push(p.model); p.model.split(/[\s\/]+/).forEach(function(w) { if (w) frags.push(w); }); }
        (p.keywords || []).forEach(function(k) { frags.push(k); });
        frags.forEach(function(f) {
            const ff = String(f).trim();
            if (!ff || ff.length < MS_MIN_KEYWORD_LEN || ff.toLowerCase() === excludeToken.toLowerCase()) return;
            if (window._msKeywordMatches(haystack, ff)) score++;
        });
        if (score > bestScore) { bestScore = score; best = p; }
    });
    return best;
};

window._msSuggestKeywordsForUnmatched = async function() {
    const unmatched = (window._msResults || []).filter(r => !r.project);
    if (!unmatched.length) return [];
    const projectList = await window._msLoadProjectIndex();
    const openIds = new Set((window._sheets || []).map(s => s.fileId));
    const openProjects = projectList.filter(p => openIds.has(p.drive_file_id));
    window._msKwOpenProjects = openProjects; // 제안 목록의 프로젝트 선택 드롭다운에서 재사용
    if (!openProjects.length) return [];
    // 💡 전체 프로젝트(열려있지 않은 것 포함)의 고객사명은 "제목분석" 후보에서도 미리 제외 —
    //    LNW처럼 여러 프로젝트가 공유하는 고객사명을 키워드로 넣으면 확실히 오매칭을 유발함
    const knownCustomers = new Set(projectList.map(p => (p.customer || '').toLowerCase()).filter(Boolean));
    // 💡 [노이즈 제거] 주소록에 등록된 사람 이름 조각(성/이름 낱말)은 제품 키워드가 아니라 발신자/수신자
    //    이름일 뿐이므로 후보에서 제외 — "Jun","Leader","Anthony"처럼 사람 이름이 회의 스레드에서
    //    프로젝트 키워드와 같이 등장했다는 이유만으로 추천되던 문제를 막음
    const knownNameTokens = new Set();
    ((window.AddressBook && window.AddressBook.load) ? window.AddressBook.load() : []).forEach(function(p) {
        [p.name, p.nameEn].forEach(function(n) {
            String(n || '').split(/[\s,]+/).forEach(function(part) {
                if (part) knownNameTokens.add(part.toLowerCase());
            });
        });
    });

    const suggestions = [];
    unmatched.forEach(function(mail) {
        const haystack = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
        const certainKeywordsThisMail = new Set(); // 💡 ①에서 이미 확실히 처리된 건 ②에서 중복 제안 안 함

        // ① 확실한 제안 — 열려있는 프로젝트의 모델명 조각이 메일에 등장.
        //    💡 고객사명(customer)은 후보에서 제외 — 한 고객사가 여러 프로젝트를 갖는 경우가
        //    흔해서(project_index.json 빌드 규칙과 동일 이유) 키워드로 쓰면 프로젝트 간 오매칭 유발
        openProjects.forEach(function(p) {
            const existingKw = new Set((p.keywords || []).map(k => String(k).toLowerCase()));
            const candidates = [];
            if (p.model) {
                candidates.push(p.model);
                p.model.split(/[\s\/]+/).forEach(function(w) { if (w) candidates.push(w); });
            }
            candidates.forEach(function(cand) {
                const c = String(cand).trim();
                if (c.length < MS_MIN_KEYWORD_LEN || existingKw.has(c.toLowerCase())) return;
                if (window._msKeywordMatches(haystack, c)) {
                    suggestions.push({ subject: mail.subject, driveFileId: p.drive_file_id, projectLabel: (p.model || p.customer), keyword: c, certain: true });
                    certainKeywordsThisMail.add(c.toLowerCase());
                }
            });
        });

        // ② 의심 후보 — 제목 + 본문 앞부분을 패턴 분석해서 모델코드처럼 보이는 토큰을 추가로 뽑음
        //    (예전엔 제목만 봐서 놓치는 게 많았음 — 본문 앞 500자까지 확대, 너무 길면 인용된 옛
        //    메일 스레드까지 섞여 노이즈가 커지니 일부러 제한). 확실하게 어느 프로젝트 것인지는
        //    모르니, 같은 메일에 같이 등장하는 다른 신호로 "추천"만 하고 최종 선택은 검토 화면에서
        const scanText = (mail.subject || '') + ' ' + (mail.body || '').substring(0, 500);
        window._msExtractSuspiciousTokens(scanText).forEach(function(tok) {
            if (certainKeywordsThisMail.has(tok.toLowerCase())) return; // ①과 대소문자만 다른 중복 방지
            if (knownCustomers.has(tok.toLowerCase())) return; // 고객사명은 후보에서 제외
            if (knownNameTokens.has(tok.toLowerCase())) return; // 주소록에 있는 사람 이름은 제외
            const alreadyRegistered = openProjects.some(function(p) {
                return (p.keywords || []).some(function(k) { return String(k).toLowerCase() === tok.toLowerCase(); });
            });
            if (alreadyRegistered) return;
            // 💡 [핵심 노이즈 제거] 열려있는 어떤 프로젝트와도 같이 등장하는 다른 신호가 하나도 없으면
            //    아예 제안하지 않음 — 회사 서명란(Kortek/Incheon/Korea 등)이나 완전히 무관한 다른
            //    업체 얘기(Cosmic Upright, CSOT 패널문의 등)가 후보로 쏟아지던 근본 원인이었음
            const rec = window._msRecommendProjectFor(mail, openProjects, tok);
            if (!rec) return;
            suggestions.push({
                subject: mail.subject, driveFileId: null, projectLabel: null, keyword: tok, certain: false,
                recommendedFileId: rec.drive_file_id,
                recommendedLabel: (rec.model || rec.customer)
            });
        });
    });

    // 같은 (프로젝트 or 미지정, 키워드) 제안이 메일마다 중복되니 1건으로 합치고 매칭건수만 카운트
    const dedupMap = new Map();
    suggestions.forEach(function(s) {
        const key = (s.driveFileId || '?') + '|' + s.keyword.toLowerCase();
        if (!dedupMap.has(key)) dedupMap.set(key, Object.assign({ count: 0, sampleSubject: s.subject }, s));
        dedupMap.get(key).count++;
    });
    // 💡 [노이즈 제거] 서로 무관한 메일 10건 넘게 걸리는 단어는 특정 프로젝트를 식별하는 고유 키워드가
    //    아니라 서명란/상투어일 가능성이 매우 높음(진짜 프로젝트 용어는 그 프로젝트 관련 메일 몇 건에만
    //    집중적으로 등장함) — 안전망으로 제외. "확실한" 제안(모델명 조각)은 원래도 근거가 확실해 그대로 둠
    const MAX_SUGGESTION_COUNT = 10;
    const list = Array.from(dedupMap.values()).filter(function(s) { return s.certain || s.count <= MAX_SUGGESTION_COUNT; });
    list.sort(function(a, b) { return (b.certain ? 1 : 0) - (a.certain ? 1 : 0); }); // 확실한 제안을 위로
    return list;
};

// project_index.json의 특정 프로젝트 항목 keywords 배열에 1개 append (전체 rebuild 아님 — 수동 추가분 보존)
window._msAppendProjectKeyword = async function(driveFileId, keyword) {
    try {
        const tokenObj = gapi.client.getToken();
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token || !driveFileId || !keyword) return false;
        const indexFileId = await window.findProjectIndexFile(token);
        if (!indexFileId) return false;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data || !Array.isArray(data.projects)) return false;
        const entry = data.projects.find(function(p) { return p.drive_file_id === driveFileId; });
        if (!entry) return false;
        entry.keywords = entry.keywords || [];
        if (!entry.keywords.some(function(k) { return String(k).toLowerCase() === keyword.toLowerCase(); })) entry.keywords.push(keyword);
        entry.updated_at = new Date().toISOString();
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${indexFileId}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        window._projectIndexCache = { data: null, at: 0 }; // 캐시 무효화 — 다음 매칭부터 바로 반영

        // 열려있는 시트 중 해당 프로젝트가 있으면 "메일키워드" 필드에도 반영 — 나중에 그 프로젝트를
        // Summary에서 저장해도(→ updateProjectIndexEntry가 projectMeta로 rebuild) 방금 추가한 키워드가 안 사라지게
        (window._sheets || []).forEach(function(s) {
            const pm = s.fileId === driveFileId ? (s.snapshot && s.snapshot.projectMeta) : null;
            if (!pm) return;
            const existing = window._parseMailKeywords(pm.메일키워드);
            if (!existing.some(function(k) { return k.toLowerCase() === keyword.toLowerCase(); })) {
                existing.push(keyword);
                pm.메일키워드 = existing.join(', ');
            }
        });
        if (window.currentDriveFileId === driveFileId && window.projectMeta) {
            const existing = window._parseMailKeywords(window.projectMeta.메일키워드);
            if (!existing.some(function(k) { return k.toLowerCase() === keyword.toLowerCase(); })) {
                existing.push(keyword);
                window.projectMeta.메일키워드 = existing.join(', ');
                const el = document.getElementById('sum-mail-keywords');
                if (el) el.value = window.projectMeta.메일키워드;
            }
        }
        return true;
    } catch (e) { console.warn('project_index.json 키워드 추가 실패:', e.message); return false; }
};

// 키워드 추가 후, 지금 미분류로 쌓여있는 메일들을 즉시 재매칭 — 방금 추가한 키워드로 걸리면 바로 이동
window._msRecheckUnmatched = async function() {
    window._projectIndexCache = { data: null, at: 0 };
    const projectList = await window._msLoadProjectIndex();
    let movedCount = 0;
    (window._msResults || []).forEach(function(r) {
        if (r.project) return;
        const matched = window._msMatchProjects({ subject: r.subject, body: r.body }, projectList);
        if (matched.length) {
            const tag = matched.length === 1 ? { status: 'matched', candidates: matched } : { status: 'ambiguous', candidates: matched };
            r.project = window._msProjectTagLabel(tag); // 💡 화면 표시용 문자열 — 객체를 그대로 넣으면 "[object Object]"로 렌더됨
            r._projectTag = tag;
            movedCount++;
        }
    });
    if (movedCount) {
        window._msSaveQueueToStorage();
        if (typeof msRenderList === 'function') msRenderList(window._msResults);
    }
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    return movedCount;
};

window._msShowKeywordSuggestModal = async function() {
    let modal = document.getElementById('ms-kwsuggest-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ms-kwsuggest-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ms-kwsuggest-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:220px;">
            <!-- 💡 [2026-08-30 모달 헤더 정리] AI 계열 모달은 하늘색으로 통일(원래 색이 테마 역할값과
                 겹쳐 팔레트 색 변경에 의도치 않게 같이 바뀌던 부작용도 같이 해결). -->
            <div id="ms-kwsuggest-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span id="ms-kwsuggest-title">🔑 키워드 제안</span>
                <button onclick="document.getElementById('ms-kwsuggest-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="ms-kwsuggest-body" style="overflow-y:auto; flex:1; background:#fafafa;"></div>
            <div style="padding:10px 16px; border-top:1px solid #eee;">
                <button id="ms-kwsuggest-all-btn" onclick="window._msApplyAllKeywordSuggestions()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="width:100%; padding:7px 14px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ 전체 추가</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ms-kwsuggest-box', 'ms-kwsuggest-drag');
        window._bindClickToFront('ms-kwsuggest-modal');
    }
    modal.style.display = 'block';
    window.bringModalToFront('ms-kwsuggest-modal');
    const body = document.getElementById('ms-kwsuggest-body');
    body.innerHTML = '<div style="padding:24px; text-align:center; color:#999; font-size:12px;">⏳ 열려있는 프로젝트 대비 분석 중...</div>';
    window._msKwSuggestions = await window._msSuggestKeywordsForUnmatched();
    window._msRenderKeywordSuggestList();
};

window._msRenderKeywordSuggestList = function() {
    const body = document.getElementById('ms-kwsuggest-body');
    const title = document.getElementById('ms-kwsuggest-title');
    const list = window._msKwSuggestions || [];
    const openProjects = window._msKwOpenProjects || [];
    if (title) title.textContent = `🔑 키워드 제안 (${list.length}건)`;
    if (!list.length) {
        body.innerHTML = '<div style="padding:24px; text-align:center; color:#999; font-size:12px;">제안할 키워드가 없습니다.<br>(열려있는 프로젝트와 겹치는 미분류 메일이 없거나, 이미 다 등록돼 있습니다)</div>';
        return;
    }
    body.innerHTML = list.map(function(s, i) {
        // 💡 [추천] 같이 등장한 다른 신호로 대상 프로젝트를 추정했으면 드롭다운에 미리 선택해둠 —
        //    사람은 "확인만" 하면 되고, 추천이 틀렸으면 직접 바꾸면 됨
        const projOptions = openProjects.map(function(p) {
            const sel = (!s.certain && s.recommendedFileId === p.drive_file_id) ? ' selected' : '';
            return `<option value="${p.drive_file_id}"${sel}>${_msQEsc(p.model || p.customer)}</option>`;
        }).join('');
        const targetHtml = s.certain
            ? `→ <b style="color:#0056b3;">${_msQEsc(s.projectLabel)}</b>`
            : `→ <select class="ms-kwsuggest-proj-select" data-idx="${i}" style="font-size:11px; padding:1px 4px; border:1px solid #ccc; border-radius:4px; max-width:150px;">
                   <option value=""${s.recommendedFileId ? '' : ' selected'}>프로젝트 선택...</option>${projOptions}
               </select>${s.recommendedFileId ? ` <span style="font-size:9.5px; color:#2f9e44; font-weight:bold;">✓추천: ${_msQEsc(s.recommendedLabel)}</span>` : ''}`;
        return `
        <div style="padding:8px 10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="min-width:0; flex:1;">
                <div style="font-size:12px; display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                    <span title="${s.certain ? '열려있는 프로젝트 모델명 조각과 일치' : '제목·본문 패턴 분석으로 추출 — 추천된 프로젝트를 확인하고 필요하면 바꾸세요'}"
                        style="background:${s.certain ? '#d4edda' : '#ffe8cc'}; color:${s.certain ? '#2f9e44' : '#c9640a'}; padding:1px 5px; border-radius:3px; font-size:9.5px; font-weight:bold; white-space:nowrap;">${s.certain ? '확실' : '제목·본문분석'}</span>
                    <span style="background:#fff3cd; color:#856404; padding:1px 5px; border-radius:3px; font-weight:bold;">${_msQEsc(s.keyword)}</span>
                    ${targetHtml}
                </div>
                <div style="font-size:10.5px; color:#999; margin-top:2px; overflow-wrap:break-word;">${_msQEsc(s.count)}건 · 예: ${_msQEsc(s.sampleSubject)}</div>
            </div>
            <div style="flex-shrink:0; display:flex; gap:4px;">
                <button data-idx="${i}" class="ms-kwsuggest-add-btn" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:5px 10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➕ 추가</button>
                <button data-idx="${i}" class="ms-kwsuggest-del-btn" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" title="이 제안 무시" style="padding:5px 8px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🗑</button>
            </div>
        </div>`;
    }).join('');
    body.querySelectorAll('.ms-kwsuggest-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { window._msApplyOneKeywordSuggestion(Number(btn.dataset.idx)); });
    });
    body.querySelectorAll('.ms-kwsuggest-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { window._msDismissKeywordSuggestion(Number(btn.dataset.idx)); });
    });
};

window._msDismissKeywordSuggestion = function(idx) {
    window._msKwSuggestions = (window._msKwSuggestions || []).filter(function(_, i) { return i !== idx; });
    window._msRenderKeywordSuggestList();
};

window._msApplyOneKeywordSuggestion = async function(idx) {
    const s = (window._msKwSuggestions || [])[idx];
    if (!s) return;
    let driveFileId = s.driveFileId;
    let projectLabel = s.projectLabel;
    if (!s.certain) {
        const sel = document.querySelector('.ms-kwsuggest-proj-select[data-idx="' + idx + '"]');
        driveFileId = sel ? sel.value : '';
        if (!driveFileId) { alert('먼저 대상 프로젝트를 선택해주세요.'); return; }
        const p = (window._msKwOpenProjects || []).find(function(pp) { return pp.drive_file_id === driveFileId; });
        projectLabel = p ? (p.model || p.customer) : driveFileId;
    }
    const ok = await window._msAppendProjectKeyword(driveFileId, s.keyword);
    if (ok) {
        window._msKwSuggestions = window._msKwSuggestions.filter(function(_, i) { return i !== idx; });
        const moved = await window._msRecheckUnmatched();
        if (window.showToast) window.showToast(`✅ "${s.keyword}" → ${projectLabel}에 추가됨` + (moved ? ` (미분류 ${moved}건 재매칭됨)` : ''), 'info');
        window._msRenderKeywordSuggestList();
    } else if (window.showToast) {
        window.showToast('❌ 키워드 추가 실패 — 콘솔 확인', 'error');
    }
};

window._msApplyAllKeywordSuggestions = async function() {
    const list = window._msKwSuggestions || [];
    if (!list.length) return;
    // 💡 "제목분석" 후보는 대상 프로젝트를 미리 선택해둔 것만 일괄 적용 대상에 포함 — 안 고른 건 건너뜀
    const applicable = list.map(function(s, i) {
        if (s.certain) return { i: i, driveFileId: s.driveFileId, keyword: s.keyword };
        const sel = document.querySelector('.ms-kwsuggest-proj-select[data-idx="' + i + '"]');
        return sel && sel.value ? { i: i, driveFileId: sel.value, keyword: s.keyword } : null;
    }).filter(Boolean);
    const skipped = list.length - applicable.length;
    if (!applicable.length) { alert('적용할 항목이 없습니다. "제목분석" 후보는 먼저 대상 프로젝트를 선택해주세요.'); return; }
    if (!confirm(`${applicable.length}건의 키워드를 추가할까요?` + (skipped ? ` (프로젝트 미선택 ${skipped}건은 건너뜁니다)` : ''))) return;
    let okCount = 0;
    for (const s of applicable) {
        const ok = await window._msAppendProjectKeyword(s.driveFileId, s.keyword);
        if (ok) okCount++;
    }
    const appliedIdx = new Set(applicable.map(function(a) { return a.i; }));
    const moved = await window._msRecheckUnmatched();
    window._msKwSuggestions = list.filter(function(_, i) { return !appliedIdx.has(i); });
    window._msRenderKeywordSuggestList();
    if (window.showToast) window.showToast(`✅ 키워드 ${okCount}건 추가 완료` + (moved ? ` (미분류 ${moved}건 재매칭됨)` : ''), 'info');
};

// ═══════════════════════════════════════════════════════════════════
// 💡 [신규발신자 → 주소록 일괄추가] 큐에 쌓인 신규발신자를 이메일 기준으로 정리(중복제거)해서
//    공용 주소록(window.AddressBook)에 일괄 등록 — 등록되면 다음부터 화이트리스트에 자동 포함됨
// ═══════════════════════════════════════════════════════════════════
window._msSuggestAddressEntries = function() {
    const queue = JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]');
    const existingEmails = new Set((window.AddressBook.load() || []).map(function(p) { return (p.email || '').toLowerCase(); }));
    const seen = new Map();
    queue.forEach(function(r) {
        const email = window._msParseSenderEmail(r.sender);
        if (!email || existingEmails.has(email) || seen.has(email)) return;
        let name = String(r.sender || '').replace(/<.*?>/, '').replace(/["']/g, '').trim();
        if (!name || name.toLowerCase() === email) name = email.split('@')[0];
        seen.set(email, { name: name, email: email, sampleSubject: r.subject });
    });
    return Array.from(seen.values());
};

window._msAddToAddressBook = function(entries) {
    const list = window.AddressBook.load();
    const existingEmails = new Set(list.map(function(p) { return (p.email || '').toLowerCase(); }));
    let added = 0;
    entries.forEach(function(e) {
        if (existingEmails.has(e.email.toLowerCase())) return;
        list.push({ name: e.name, nameEn: '', dept: '', title: '', email: e.email, mobile: '', phone: '', telegramId: '' });
        existingEmails.add(e.email.toLowerCase());
        added++;
    });
    window.AddressBook.save(list); // 3초 디바운스 후 공용 Drive 파일에 동기화
    window.tabData = window.tabData || {};
    window.tabData.addressBook = list;
    if (window.renderAddressTable) window.renderAddressTable();
    const addedEmails = new Set(entries.map(function(e) { return e.email.toLowerCase(); }));
    const remaining = (JSON.parse(localStorage.getItem(MS_NEW_SENDER_QUEUE_KEY) || '[]'))
        .filter(function(r) { return !addedEmails.has(window._msParseSenderEmail(r.sender)); });
    localStorage.setItem(MS_NEW_SENDER_QUEUE_KEY, JSON.stringify(remaining));
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    return added;
};

window._msShowAddressSuggestModal = function() {
    let modal = document.getElementById('ms-addrsuggest-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ms-addrsuggest-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="ms-addrsuggest-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:220px;">
            <!-- 💡 [2026-08-30 모달 헤더 정리] AI 계열 모달은 하늘색으로 통일. -->
            <div id="ms-addrsuggest-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span id="ms-addrsuggest-title">📇 주소록 추가 제안</span>
                <button onclick="document.getElementById('ms-addrsuggest-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="ms-addrsuggest-body" style="overflow-y:auto; flex:1; background:#fafafa;"></div>
            <div style="padding:10px 16px; border-top:1px solid #eee;">
                <button id="ms-addrsuggest-all-btn" onclick="window._msApplyAllAddressSuggestions()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="width:100%; padding:7px 14px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ 전체 주소록에 추가</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('ms-addrsuggest-box', 'ms-addrsuggest-drag');
        window._bindClickToFront('ms-addrsuggest-modal');
    }
    modal.style.display = 'block';
    window.bringModalToFront('ms-addrsuggest-modal');
    window._msAddrSuggestions = window._msSuggestAddressEntries();
    window._msRenderAddressSuggestList();
};

window._msRenderAddressSuggestList = function() {
    const body = document.getElementById('ms-addrsuggest-body');
    const title = document.getElementById('ms-addrsuggest-title');
    const list = window._msAddrSuggestions || [];
    if (title) title.textContent = `📇 주소록 추가 제안 (${list.length}건)`;
    if (!list.length) {
        body.innerHTML = '<div style="padding:24px; text-align:center; color:#999; font-size:12px;">추가할 신규 발신자가 없습니다.<br>(이미 주소록에 있거나, 대기 중인 신규발신자가 없습니다)</div>';
        return;
    }
    body.innerHTML = list.map(function(e, i) {
        return `
        <div style="padding:8px 10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="min-width:0; flex:1;">
                <div style="font-size:12px; font-weight:bold;">${_msQEsc(e.name)}</div>
                <div style="font-size:11px; color:#777; margin-top:1px;">${_msQEsc(e.email)}</div>
                <div style="font-size:10.5px; color:#999; margin-top:2px; overflow-wrap:break-word;">예: ${_msQEsc(e.sampleSubject)}</div>
            </div>
            <div style="flex-shrink:0; display:flex; gap:4px;">
                <button data-idx="${i}" class="ms-addrsuggest-add-btn" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="padding:5px 10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➕ 추가</button>
                <button data-idx="${i}" class="ms-addrsuggest-del-btn" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" title="이 제안 무시" style="padding:5px 8px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🗑</button>
            </div>
        </div>`;
    }).join('');
    body.querySelectorAll('.ms-addrsuggest-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = Number(btn.dataset.idx);
            const e = window._msAddrSuggestions[idx];
            window._msAddToAddressBook([e]);
            window._msAddrSuggestions = window._msAddrSuggestions.filter(function(_, i) { return i !== idx; });
            window._msRenderAddressSuggestList();
            if (window.showToast) window.showToast(`✅ "${e.name}" 주소록에 추가됨`, 'info');
        });
    });
    body.querySelectorAll('.ms-addrsuggest-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = Number(btn.dataset.idx);
            window._msAddrSuggestions = window._msAddrSuggestions.filter(function(_, i) { return i !== idx; });
            window._msRenderAddressSuggestList();
        });
    });
};

window._msApplyAllAddressSuggestions = function() {
    const list = window._msAddrSuggestions || [];
    if (!list.length) return;
    if (!confirm(`${list.length}명을 전부 주소록에 추가할까요?`)) return;
    const added = window._msAddToAddressBook(list);
    window._msAddrSuggestions = [];
    window._msRenderAddressSuggestList();
    if (window.showToast) window.showToast(`✅ 주소록에 ${added}명 추가 완료`, 'info');
};

window.msShowUnmatchedModal = function() {
    window._msRenderQueueModal('unmatched');
};

// 💡 [테스트용] 캐시 초기화 후 즉시 재수집 — 그동안 콘솔에서 반복 실행하던 스크립트를 버튼화
window.msForceRefetchForTest = async function() {
    const ok = confirm('⚠️ 테스트 재수집\n\n마지막 수집 기록을 초기화하고 즉시 다시 수집합니다.\nAI 분석이 다시 돌아 API 호출 비용이 발생할 수 있습니다.\n\n계속할까요?');
    if (!ok) return;

    const btn = document.getElementById('ms-test-refetch-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 수집 중...'; }

    try {
        localStorage.removeItem(MS_LAST_AUTO_FETCH_KEY);
        localStorage.removeItem(MS_QUEUE_STORAGE_KEY);
        window._msResults = [];
        const listEl = document.getElementById('ms-result-list');
        if (listEl) listEl.innerHTML = '';
        window._projectIndexCache = { data: null, at: 0 };

        await window._autoMailFetchTick();

        if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
        if (window.showToast) {
            window.showToast(window._currentLang === 'en' ? '✅ Test refetch complete' : '✅ 테스트 재수집 완료', 'info');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🧪 테스트 재수집'; }
    }
};

// ─── 메일 자동배치 설정 모달 ──────────────────────────────────────────
// 💡 [2026-08-20] 이 함수(및 아래 _macRenderTitleRows/_macAddKeywordRow/_macRenderKeywordRows/
//    _macClearQueue/_macSave)가 통째로 중복 정의돼 있던 걸 발견해서 정리함. 이전 사본에는
//    "그룹5: 미분류/신규발신자" 섹션이 있었는데, 마지막 정의(=실제로 실행되는 쪽)엔 빠져 있어서
//    설정 모달에서 그 버튼들이 아예 안 보이는 상태였음 — 죽은 사본을 지우면서 그룹5(+신규 그룹6)를
//    살아있는 쪽에 이식.
window.openMailAutoConfigModal = async function() {
    const cfg = await window.loadPriorityConfig();
    let modal = document.getElementById('mail-auto-config-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mail-auto-config-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="mail-auto-config-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:300px;">
            <div id="mail-auto-config-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span>⚙️ 메일 자동배치 설정</span>
                <button onclick="document.getElementById('mail-auto-config-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div style="overflow-y:auto; flex:1; padding:14px 18px; display:flex; flex-direction:column; gap:10px;">

                <!-- ══ 큰그룹1: 수집설정 (기본 접힘) — 옛 그룹1 ══ -->
                <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                    <div onclick="window._toggleAlarmSection('mac-sec-collect')"
                         style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                        <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">⏱️ 수집설정</span>
                        <span id="mac-sec-collect-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                    </div>
                    <div id="mac-sec-collect" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                        <div style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:8px;">
                            <span style="flex:1;">수집 주기</span>
                            <select id="mac-interval" style="padding:3px 6px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                                <option value="10">10분</option>
                                <option value="15">15분</option>
                                <option value="30">30분</option>
                                <option value="60">60분</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:8px;">
                            <span style="flex:1;">📌 핀셋 기준점수 <span style="font-weight:normal; color:#888; font-size:11px;">(이 점수 이상 긴급)</span></span>
                            <input id="mac-cutline" type="number" min="0" max="100" style="width:64px; min-width:0; box-sizing:border-box; padding:3px 6px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                        </div>
                        <!-- 💡 [2026-08-29 신규] "완료로 표시된 프로젝트도 메일 자동매칭 대상에 포함할지"는
                             팀 전체가 아니라 이 브라우저를 쓰는 사람 개인의 선택이라(수집 주기와 같은 성격),
                             mac-interval과 동일하게 localStorage에 개인별로 저장한다(_macSave/getMailAutoCollectCompleted 참고). -->
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
                            <input id="mac-collect-completed" type="checkbox" style="width:15px; height:15px; cursor:pointer;">
                            <span style="flex:1;">EOL 프로젝트도 수집 대상에 포함</span>
                        </label>
                        <div style="font-size:10.5px; color:#999; margin-top:4px; padding-left:23px;">기본값(체크 해제)은 Summary 탭에서 "EOL"로 표시한 프로젝트를 새 메일 자동매칭에서 제외합니다(이미 끝난 프로젝트에 실수로 새 업무가 등록되는 걸 방지). 체크하면 EOL 프로젝트도 계속 매칭 대상에 포함됩니다. MP(EC) 프로젝트는 이 설정과 무관하게 항상 매칭 대상에 포함됩니다.</div>
                        <!-- 💡 [2026-08-29 이동] AI 업무 보관함 헤더에 있던 "🟠 처리됨 보관 / 🟢 처리됨 자동삭제" 토글을 여기로 옮김 -->
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; margin-top:10px;">
                            <input id="mac-cleanup-auto" type="checkbox" style="width:15px; height:15px; cursor:pointer;">
                            <span style="flex:1;">처리된 업무는 보관함에서 자동삭제</span>
                        </label>
                        <div style="font-size:10.5px; color:#999; margin-top:4px; padding-left:23px;">기본값(체크 해제)은 AI 업무 보관함의 처리된(배치됨/전송됨 등) 항목을 목록에 남겨두고 각 행의 🗑로 직접 지웁니다. 체크하면 처리되는 즉시 목록에서 자동으로 사라집니다.</div>
                        <!-- 💡 [무료 API 절약] 토픽 프로파일 자동 생성 완전 비활성화 옵션 -->
                        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; margin-top:10px;">
                            <input id="mac-topic-auto-disable" type="checkbox" style="width:15px; height:15px; cursor:pointer;">
                            <span style="flex:1;">🧠 토픽 프로파일 자동 생성 끄기</span>
                        </label>
                        <div style="font-size:10.5px; color:#999; margin-top:4px; padding-left:23px;">체크하면 프로젝트 로드 시 및 AI 업무 누적 시 자동 토픽 프로파일 생성을 완전히 끕니다. 수동 생성(토픽 프로파일 뷰어 내 버튼)은 계속 사용할 수 있습니다. 무료 API 한도가 빠듯할 때 권장.</div>
                    </div>
                </div>

                <!-- ══ 큰그룹2: 가산점수 (기본 접힘) — 옛 그룹2(점수 가산 키워드)+그룹3(우선순위 점수)+그룹4(직급별 점수) 통합 ══ -->
                <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                    <div onclick="window._toggleAlarmSection('mac-sec-score')"
                         style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                        <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">⭐ 가산점수</span>
                        <span id="mac-sec-score-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                    </div>
                    <div id="mac-sec-score" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                        <div style="margin-bottom:14px;">
                            <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:8px;">🚨 점수 가산 키워드 <span style="font-weight:normal; color:#888; font-size:11px;">(키워드별 점수 지정)</span></div>
                            <div id="mac-keyword-rows" style="margin-bottom:4px;"></div>
                            <button onclick="window._macAddKeywordRow('',5)" style="padding:3px 10px; background:#fff; border:1px solid #ccc; border-radius:6px; font-size:11px; cursor:pointer; margin-top:2px;">+ 키워드 추가</button>
                        </div>
                        <div style="margin-bottom:14px;">
                            <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:10px;">📊 우선순위 점수</div>
                            <div style="display:grid; grid-template-columns:1fr 64px; gap:6px 10px; align-items:center; font-size:12px;">
                                <span>외부(고객사) 발신 가산</span><input id="mac-external" type="number" style="width:100%; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                                <span>To(직접수신) 가산</span><input id="mac-tome" type="number" style="width:100%; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                                <span>Cc(참조) 가산</span><input id="mac-ccme" type="number" style="width:100%; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                                <span>중요도 헤더(Outlook 높음) 가산</span><input id="mac-importance" type="number" style="width:100%; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
                            </div>
                        </div>
                        <div>
                            <div style="font-size:12px; font-weight:bold; color:#2c5f8a; margin-bottom:8px;">👤 직급별 점수</div>
                            <div id="mac-title-rows" style="max-height:140px; overflow-y:auto; margin-bottom:4px; padding-right:4px;"></div>
                        </div>
                    </div>
                </div>

                <!-- 💡 [2026-08-20] "미분류/신규발신자/자동폐기 열람" 그룹은 업무 보관함 모달에도 동일하게
                     있어서(중복) 사용자 요청으로 여기서는 제거 — 그 큐들은 업무 보관함 쪽에서만 연다. -->

                <!-- ══ 큰그룹3: 자동폐기 필터 (기본 접힘) — 옛 그룹5 ══ -->
                <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                    <div onclick="window._toggleAlarmSection('mac-sec-filter')"
                         style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                        <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">🚫 자동폐기 필터</span>
                        <span id="mac-sec-filter-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                    </div>
                    <div id="mac-sec-filter" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                        <div style="font-size:10.5px; color:#999; margin-bottom:8px;">완전자동 수집 시 AI 호출 전에 이 규칙에 걸리면 조용히 버려집니다(비용 절감). 🗑 자동폐기/👤 신규발신자 큐에서도 "규칙 추가"로 바로 등록할 수 있습니다.</div>

                        <div style="margin-bottom:10px;">
                            <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px;">제목 키워드</div>
                            <div id="mac-filter-subject-rows" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;"></div>
                            <div style="display:flex; gap:4px;">
                                <input id="mac-filter-subject-input" type="text" placeholder="예: [광고]" style="flex:1; padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px;">
                                <button onclick="window._macAddFilterRuleFromInput('subjectKeywords','mac-filter-subject-input')" style="padding:3px 10px; background:#fff; border:1px solid #ccc; border-radius:6px; font-size:11px; cursor:pointer;">+ 추가</button>
                            </div>
                        </div>

                        <div style="margin-bottom:10px;">
                            <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px;">발신자 패턴 (noreply 등)</div>
                            <div id="mac-filter-noreply-rows" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;"></div>
                            <div style="display:flex; gap:4px;">
                                <input id="mac-filter-noreply-input" type="text" placeholder="예: noreply" style="flex:1; padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px;">
                                <button onclick="window._macAddFilterRuleFromInput('noreplyPatterns','mac-filter-noreply-input')" style="padding:3px 10px; background:#fff; border:1px solid #ccc; border-radius:6px; font-size:11px; cursor:pointer;">+ 추가</button>
                            </div>
                        </div>

                        <div>
                            <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px;">발신자 도메인 완전차단</div>
                            <div id="mac-filter-domain-rows" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;"></div>
                            <div style="display:flex; gap:4px;">
                                <input id="mac-filter-domain-input" type="text" placeholder="예: spam-mailer.com" style="flex:1; padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px;">
                                <button onclick="window._macAddFilterRuleFromInput('blockedDomains','mac-filter-domain-input')" style="padding:3px 10px; background:#fff; border:1px solid #ccc; border-radius:6px; font-size:11px; cursor:pointer;">+ 추가</button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px;">
                <button onclick="window._macSave()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:6px 18px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold; transition:background .15s, border-color .15s;">저장</button>
                <button onclick="document.getElementById('mail-auto-config-modal').style.display='none'" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; border:1px solid #ccc; background:#f8f9fa; color:#555; border-radius:4px; cursor:pointer; font-size:12.5px; transition:background .15s;">닫기</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('mail-auto-config-box', 'mail-auto-config-drag');
        window._bindClickToFront('mail-auto-config-modal');
    }

    // 값 채우기
    document.getElementById('mac-interval').value = window.getMailAutoInterval ? window.getMailAutoInterval() : 30;
    document.getElementById('mac-collect-completed').checked = window.getMailAutoCollectCompleted ? window.getMailAutoCollectCompleted() : false;
    document.getElementById('mac-cleanup-auto').checked = (window.getInboxCleanupMode ? window.getInboxCleanupMode() : 'keep') === 'auto';
    document.getElementById('mac-topic-auto-disable').checked = window.getTopicProfileAutoDisabled ? window.getTopicProfileAutoDisabled() : false;
    document.getElementById('mac-external').value   = cfg.externalCustomerScore;
    document.getElementById('mac-tome').value       = cfg.toMeScore;
    document.getElementById('mac-ccme').value       = cfg.ccMeScore;
    document.getElementById('mac-importance').value = cfg.importanceHighScore;
    document.getElementById('mac-cutline').value    = cfg.cutline;
    window._macRenderTitleRows(cfg.titleScores);
    window._macRenderKeywordRows(cfg.urgentKeywords);
    // 💡 미분류/신규발신자/자동폐기 큐 열람은 업무 보관함 모달에만 있음(중복 제거) — 이 모달에선 필터 규칙만 갱신
    if (window._macRenderFilterRules) window._macRenderFilterRules();

    modal.style.display = 'block';
    window.bringModalToFront('mail-auto-config-modal');
};

window._macRenderTitleRows = function(titleScores) {
    document.getElementById('mac-title-rows').innerHTML =
        Object.keys(titleScores).map(t => `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:12px;">
            <span style="flex:1;">${t}</span>
            <input class="mac-title-score" data-title="${t}" type="number" value="${titleScores[t]}"
                style="width:64px; min-width:0; box-sizing:border-box; padding:3px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px; text-align:center;">
        </div>`).join('');
};

window._macAddKeywordRow = function(word, score) {
    const box = document.getElementById('mac-keyword-rows');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';
    row.innerHTML = `
        <input class="mac-kw-word" type="text" value="${word}" placeholder="키워드"
            style="flex:1; padding:4px 7px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
        <input class="mac-kw-score" type="number" value="${score}"
            style="width:64px; min-width:0; box-sizing:border-box; padding:4px 5px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
        <button onclick="this.parentElement.remove()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="background:#fbe4e2; border:1px solid #eeb0ac; color:#b1432f; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:11px; transition:background .15s, border-color .15s;">🗑</button>`;
    box.appendChild(row);
};

window._macRenderKeywordRows = function(kws) {
    document.getElementById('mac-keyword-rows').innerHTML = '';
    (kws || []).forEach(k => window._macAddKeywordRow(k.word, k.score));
};

window._macClearQueue = function(type) {
    const label = type === 'unmatched' ? '미분류' : type === 'discarded' ? '자동폐기' : '신규발신자';
    if (!confirm(`${label} 큐를 초기화할까요?`)) return;
    if (type === 'unmatched') {
        window._msResults = (window._msResults || []).filter(r => r.project);
        window._msSaveQueueToStorage();
    } else if (type === 'discarded') {
        localStorage.removeItem('ms_discard_queue');
    } else {
        localStorage.removeItem('ms_new_sender_queue');
    }
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges();
    if (window.showToast) window.showToast(`✅ ${label} 초기화 완료`, 'info');
};

// 💡 [신규] 필터 규칙 3종(제목키워드/발신자패턴/도메인차단)을 칩 형태로 렌더링 + 개별 삭제
window._macRenderFilterRules = function() {
    const rules = window._msGetFilterRules();
    const renderChips = (containerId, type, list) => {
        const box = document.getElementById(containerId);
        if (!box) return;
        box.innerHTML = list.length ? list.map((v, i) => `
            <span style="display:inline-flex; align-items:center; gap:2px; background:#f1f3f5; border:1px solid #dee2e6; border-radius:12px; padding:2px 4px 2px 8px; font-size:11px;">
                ${_msQEsc(v)}
                <button onclick="window._macRemoveFilterRule('${type}', ${i})" title="삭제" style="background:none; border:none; color:#e03131; cursor:pointer; font-size:13px; line-height:1; padding:0 4px;">×</button>
            </span>`).join('') : '<span style="font-size:10.5px; color:#bbb;">등록된 규칙 없음(기본값 사용 안 함)</span>';
    };
    renderChips('mac-filter-subject-rows', 'subjectKeywords', rules.subjectKeywords);
    renderChips('mac-filter-noreply-rows', 'noreplyPatterns', rules.noreplyPatterns);
    renderChips('mac-filter-domain-rows', 'blockedDomains', rules.blockedDomains);
};

window._macAddFilterRuleFromInput = function(type, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const v = input.value.trim();
    if (!v) return;
    const added = window._msAddFilterRule(type, v);
    input.value = '';
    window._macRenderFilterRules();
    if (window.showToast) window.showToast(added ? `✅ 규칙 추가됨: ${v}` : `이미 등록된 규칙입니다`, added ? 'info' : 'error');
};

window._macRemoveFilterRule = function(type, idx) {
    const rules = window._msGetFilterRules();
    rules[type].splice(idx, 1);
    window._msSaveFilterRules(rules);
    window._macRenderFilterRules();
};

window._macSave = async function() {
    // 수집 주기
    const sel = document.getElementById('mac-interval');
    if (sel) {
        localStorage.setItem('mail_auto_process_interval_min', sel.value);
        const orig = document.getElementById('mail-process-interval');
        if (orig) orig.value = sel.value;
    }

    // 완료 프로젝트 수집 여부
    const collectCompletedEl = document.getElementById('mac-collect-completed');
    if (collectCompletedEl) localStorage.setItem('mail_auto_collect_completed', collectCompletedEl.checked ? '1' : '0');

    // 처리됨 업무 자동삭제 여부 (예전엔 업무 보관함 헤더의 토글 버튼 — 2026-08-29 여기로 이동)
    const cleanupAutoEl = document.getElementById('mac-cleanup-auto');
    if (cleanupAutoEl) localStorage.setItem('inbox_cleanup_mode', cleanupAutoEl.checked ? 'auto' : 'keep');

    // 토픽 프로파일 자동 생성 비활성화
    const topicAutoDisableEl = document.getElementById('mac-topic-auto-disable');
    if (topicAutoDisableEl) localStorage.setItem('topic_profile_auto_disabled', topicAutoDisableEl.checked ? '1' : '0');

    // 우선순위 점수
    const titleScores = {};
    document.querySelectorAll('.mac-title-score').forEach(el => {
        titleScores[el.dataset.title] = parseInt(el.value, 10) || 0;
    });
    const urgentKeywords = [];
    document.querySelectorAll('#mac-keyword-rows > div').forEach(row => {
        const word = row.querySelector('.mac-kw-word').value.trim();
        const score = parseInt(row.querySelector('.mac-kw-score').value, 10) || 0;
        if (word) urgentKeywords.push({ word, score });
    });
    const newConfig = {
        titleScores,
        urgentKeywords,
        externalCustomerScore: parseInt(document.getElementById('mac-external').value, 10) || 0,
        toMeScore:             parseInt(document.getElementById('mac-tome').value, 10) || 0,
        ccMeScore:             parseInt(document.getElementById('mac-ccme').value, 10) || 0,
        importanceHighScore:   parseInt(document.getElementById('mac-importance').value, 10) || 0,
        cutline: Math.max(0, Math.min(100, parseInt(document.getElementById('mac-cutline').value, 10) || 50))
    };
    const ok = await window.savePriorityConfig(newConfig);
    if (window.showToast) window.showToast(ok ? '✅ 저장 완료' : '⚠️ 저장 실패 (콘솔 확인)', ok ? 'info' : 'error');
    if (ok) document.getElementById('mail-auto-config-modal').style.display = 'none';
};

window.msShowNewSenderModal = function() {
    window._msRenderQueueModal('newsender');
};

window.msShowDiscardedModal = function() {
    window._msRenderQueueModal('discarded');
};

// ─── [메일 자동처리 ①] 스케줄러 — 1분마다 체크, 설정된 주기(기본 30분) 경과 시에만 실행 ──
window._startMailAutoScheduler = function() {
    setInterval(function() {
        const intervalMin = window.getMailAutoInterval ? window.getMailAutoInterval() : 30;
        const lastAt = localStorage.getItem(MS_LAST_AUTO_FETCH_KEY);
        const elapsedMin = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 60000 : Infinity;
        if (elapsedMin >= intervalMin) window._autoMailFetchTick();
    }, 60 * 1000);
};

// ─── 메일서버 분석 중단 (지금까지 분석된 내용은 그대로 유지) ─────────
window.msStopAnalysis = function() {
    window._msAnalyzeCancelled = true;
};

// ─── 메일서버 강제 초기화 (로딩 멈춤 시 탈출용) ──────────────
window.msForceReset = function() {
    window._msAnalyzeCancelled = true;
    window._msResults = [];
    document.getElementById('ms-progress').style.display      = 'none';
    document.getElementById('ms-list-header').style.display   = 'none';
    document.getElementById('ms-result-list').innerHTML       = '';
    document.getElementById('ms-result-list').style.display   = 'none';
    document.getElementById('ms-batch-btn').style.display     = 'none';
    document.getElementById('ms-batch-inbox-btn').style.display = 'none';
    document.getElementById('ms-status').textContent          = (window._currentLang === 'en' ? '🔄 Reset complete' : '🔄 초기화 완료');
    document.getElementById('ms-prog-bar').style.width        = '0%';
};

// ─── 메일서버 분석결과 목록 초기화 ─────────────────────────
window.msClearResults = function() {
    if (!window._msResults || !window._msResults.length) return;
    // 💡 등록된 항목의 실제 Gantt 데이터는 지워지지 않아 확인창 없이 바로 진행
    window._msResults = [];
    document.getElementById('ms-result-list').style.display = 'none';
    document.getElementById('ms-list-header').style.display = 'none';
    document.getElementById('ms-batch-btn').style.display = 'none';
    document.getElementById('ms-batch-inbox-btn').style.display = 'none';
    document.getElementById('mail-right-empty').style.display = 'flex';
    document.getElementById('mail-right-detail').style.display = 'none';
};

// ─── 목록 렌더링 (파일첨부 탭과 동일 구조) ──────────────

window.msDeleteItem = function(idx) {
    const r = window._msResults[idx];
    if (!r) return;
    const label = r.task ? (r.task['업무명'] || '새업무') : r.subject;
    if (!confirm(`"${label}"\n이 분석 항목을 목록에서 삭제하시겠습니까?\n(등록된 항목이라도 Gantt Chart의 실제 데이터는 지워지지 않습니다)`)) return;
    window._msResults.splice(idx, 1);
    msRenderList(window._msResults);
};
function msRenderList(results) {
    const list = document.getElementById('ms-result-list');
    let html = '';
    results.forEach((r, i) => {
        const canSel = !!r.task;
        const bg     = r.registered ? '#d4edda' : canSel ? '#fff' : '#fafafa';
        const taskName = r.task ? (r.task['업무명'] || '새업무') : null;
        html += `
        <div id="ms-list-item-${i}" data-idx="${i}"
             style="display:flex; align-items:center; gap:6px;
                    padding:7px 8px; border-bottom:1px solid #f0f0f0;
                    background:${bg}; cursor:pointer;">
            <input type="checkbox" data-idx="${i}"
                   ${canSel && r.selected ? 'checked' : ''}
                   ${canSel ? '' : 'disabled'} style="flex-shrink:0;">
            <span style="font-size:10px; color:#aaa; flex-shrink:0; width:16px;">${i+1}</span>
            <div style="flex:1; min-width:0;">
                <div style="font-size:12px; font-weight:${canSel?'bold':'normal'};
                            color:${canSel?'#333':'#aaa'};
                            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${canSel ? escapeHtml(taskName) + ' 📧' : escapeHtml(r.subject.substring(0,35))}
                </div>
                <div style="display:flex; gap:4px; margin-top:2px; flex-wrap:wrap; align-items:center;">
                    <span style="font-size:10px; color:#aaa;">${r.date||''}</span>
                    ${r.project
                        ? `<span style="background:#e7f3ff; color:#0056b3; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold;">${r.project}</span>`
                        : `<span style="color:#dc3545; font-size:10px;">${r.error||''}</span>`}
                    ${(window._confBadge && r.task) ? window._confBadge((r.task['_aiMeta'] && r.task['_aiMeta'].confidence) || r.task['매칭신뢰도'] || '') : ''}
                    ${r.registered
                        ? `<span style="color:#28a745; font-size:10px; font-weight:bold;">✅등록완료</span>`
                        : `<span style="color:#999; font-size:10px;">⬜미등록</span>`}
                </div>
            </div>
            <button data-del-idx="${i}" title="목록에서 삭제"
                    style="flex-shrink:0; border:none; background:none; color:#bbb; cursor:pointer; font-size:13px; padding:2px 4px;"
                    onmouseover="this.style.color='#dc3545'" onmouseout="this.style.color='#bbb'">🗑</button>
        </div>`;
    });

    list.innerHTML = html || '<div style="padding:20px; text-align:center; color:#aaa;">결과 없음</div>';

    results.forEach((r, i) => {
        const row = document.getElementById(`ms-list-item-${i}`);
        if (!row) return;
        row.addEventListener('click', function(e) {
            if (e.target.type === 'checkbox' || e.target.dataset.delIdx !== undefined) return;
            window.msSelectItem(i);
        });
        const delBtn = row.querySelector('[data-del-idx]');
        if (delBtn) {
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                window.msDeleteItem(i);
            });
        }
        const cb = row.querySelector('input[type=checkbox]');
        if (cb) cb.addEventListener('change', function() {
            window._msResults[i].selected = this.checked;
            window.msSyncCheckAll();
        });
        row.addEventListener('mouseover', function() {
            if (!this.classList.contains('ms-active')) this.style.background = '#e7f3ff';
        });
        row.addEventListener('mouseout', function() {
            if (!this.classList.contains('ms-active')) {
                this.style.background = window._msResults[i].registered ? '#d4edda' : (window._msResults[i].task ? '#fff' : '#fafafa');
            }
        });
    });
}

// ─── 항목 선택 → 오른쪽 패널 ────────────────────────────
window.msSelectItem = function(idx) {
    const r = window._msResults[idx];
    if (!r || !r.task) return;

    // 활성 항목 하이라이트
    if (window._msCurrentIdx >= 0) {
        const prev = document.getElementById(`ms-list-item-${window._msCurrentIdx}`);
        if (prev) { prev.classList.remove('ms-active'); prev.style.background = window._msResults[window._msCurrentIdx]?.registered ? '#d4edda' : '#fff'; }
    }
    window._msCurrentIdx = idx;
    const cur = document.getElementById(`ms-list-item-${idx}`);
    if (cur) { cur.classList.add('ms-active'); cur.style.background = '#fff3e0'; }

    // 공통 오른쪽 패널 표시
    mailShowRightDetail(r.subject, r.sender, r.date||'', r.body||'', r.project, r.task, () => {
        r.task = JSON.parse(JSON.stringify(window._mailAnalyzedResult));
        if (!mfDirectInsert(r.task, r.mailRaw || window._mailParsedRaw)) return;
        r.registered = true;
        const item = document.getElementById(`mf-list-item-${idx}`);
        if (item) {
            item.style.background = '#d4edda';
            const badge = item.querySelector('div > div:last-child');
            if (badge) {
                const existing = badge.querySelector('.reg-badge');
                if (!existing) badge.innerHTML += `<span class="reg-badge" style="color:#dc3545;font-size:10px;font-weight:bold;">🔴 개별등록완료</span>`;
            }
            const cb = item.querySelector('input[type=checkbox]');
            if (cb) cb.checked = false;
        }
        window._mfResults[idx].selected = false;
        window._msCurrentIdx = -1;
        mfDirectInsert(r.task, r.mailRaw);
        window.recalculateSchedules();
    }, r.mailRaw);
};

// msRightInsert → mailRightInsert 으로 통합

window.msBatchInsert = async function() {
    // 1. 제외 로직: 날짜가 없는 항목 필터링
    const validTargets = window._msResults.filter(r => 
        r.selected && r.task && !r.registered &&
        !( (r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요') )
    );

    const excludedCount = window._msResults.filter(r => r.selected && r.task && !r.registered).length - validTargets.length;

    if (!validTargets.length) {
        alert(excludedCount > 0 ? '⚠️ 날짜가 없는 항목은 등록할 수 없습니다. (제외됨)' : '등록할 항목을 체크해주세요.');
        return;
    }

    // 2. 미리보기 검토 안전장치
    let previewMsg = `✅ 총 ${validTargets.length}개 항목을 일괄 등록합니다.\n`;
    if (excludedCount > 0) previewMsg += `\n⚠️ 날짜가 없는 ${excludedCount}개 항목은 자동으로 제외되었습니다.`;
    previewMsg += '\n\n[등록할 업무 목록]\n' + validTargets.map(r => '• ' + (r.task['업무명']||'새업무')).join('\n');
    
    if (!confirm(previewMsg + '\n\n위 내용으로 등록하시겠습니까?')) return;

    // 3. 등록 실행
    for (let i = window._msResults.length - 1; i >= 0; i--) {
        const r = window._msResults[i];
        if (validTargets.includes(r)) {
            try {
                if (mfDirectInsert(r.task, r.mailRaw)) {
                    r.registered = true;
                    r.selected = false;
                }
            } catch(e) { console.error(e); }
        }
    }

    msRenderList(window._msResults);
    window.recalculateSchedules();
    alert(`✅ ${validTargets.length}개 항목이 등록되었습니다!`);
};

window.msSyncCheckAll = function() {
    const all = document.querySelectorAll('#ms-result-list input[type=checkbox]:not(:disabled)');
    const chk = document.querySelectorAll('#ms-result-list input[type=checkbox]:not(:disabled):checked');
    const ca  = document.getElementById('ms-check-all');
    if (ca) ca.checked = all.length > 0 && all.length === chk.length;
};

window.msSelectAll = function(select) {
    document.querySelectorAll('#ms-result-list input[type=checkbox]:not(:disabled)')
        .forEach(cb => {
            cb.checked = select;
            const idx = parseInt(cb.dataset.idx);
            if (!isNaN(idx)) window._msResults[idx].selected = select;
        });
};

// ═══════════════════════════════════════════════════════════
// 🧩 AR: 직접입력/파일첨부/메일서버 3탭 공용 분석결과 목록 엔진
//    렌더링/체크박스/삭제/일괄등록/실패항목 수동전환을 여기 한 곳에서만 관리.
//    아래에서 mf*/ms*/paste* 기존 함수들을 이 엔진으로 재연결합니다.
// ═══════════════════════════════════════════════════════════
window._pasteCurrentIdx = -1;

const AR = {
    cfg: {
        mf: {
            getArr: () => window._mfResults,
            listId: 'mf-result-list', headerId: 'mf-list-header', checkAllId: 'mf-check-all',
            batchBtnId: 'mf-batch-btn', batchInboxBtnId: 'mf-batch-inbox-btn', countId: 'mf-result-count', activeClass: 'mf-active',
            getCurIdx: () => window._mfCurrentIdx, setCurIdx: (v) => window._mfCurrentIdx = v,
        },
        ms: {
            getArr: () => window._msResults,
            listId: 'ms-result-list', headerId: 'ms-list-header', checkAllId: 'ms-check-all',
            batchBtnId: 'ms-batch-btn', batchInboxBtnId: 'ms-batch-inbox-btn', countId: null, activeClass: 'ms-active',
            getCurIdx: () => window._msCurrentIdx, setCurIdx: (v) => window._msCurrentIdx = v,
        },
        paste: {
            getArr: () => window._pasteResults,
            listId: 'paste-result-list', headerId: 'paste-result-header', checkAllId: 'paste-check-all',
            batchBtnId: 'paste-batch-btn', batchInboxBtnId: 'paste-batch-inbox-btn', countId: 'paste-result-count', activeClass: 'paste-active',
            getCurIdx: () => window._pasteCurrentIdx, setCurIdx: (v) => window._pasteCurrentIdx = v,
        },
    },

    render(tabKey) {
        const c = AR.cfg[tabKey];
        const arr = c.getArr() || [];
        const list = document.getElementById(c.listId);
        const header = document.getElementById(c.headerId);
        const batchBtn = document.getElementById(c.batchBtnId);
        const batchInboxBtn = document.getElementById(c.batchInboxBtnId);
        if (!list) return;

        if (!arr.length) {
            list.style.display = 'none';
            if (header) header.style.display = 'none';
            if (batchBtn) batchBtn.style.display = 'none';
            if (batchInboxBtn) batchInboxBtn.style.display = 'none';
            list.innerHTML = '';
            return;
        }

        list.innerHTML = arr.map((r, i) => {
            const canSel = !!r.task;
            const bg = r.registered ? '#d4edda' : canSel ? '#fff' : '#fafafa';
            const taskName = r.task ? (r.task['업무명'] || '새업무') : null;
            return `
            <div id="${tabKey}-list-item-${i}" data-idx="${i}"
                 style="display:flex; align-items:center; gap:6px; padding:7px 8px; border-bottom:1px solid #f0f0f0;
                        background:${bg}; cursor:pointer; transition:background 0.15s;">
                <input type="checkbox" data-idx="${i}" ${canSel && r.selected ? 'checked':''} ${canSel ? '' : 'disabled'} style="flex-shrink:0;">
                <span style="font-size:10px; color:#aaa; flex-shrink:0; width:16px;">${i+1}</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:12px; font-weight:${canSel?'bold':'normal'}; color:${canSel?'#333':'#aaa'};
                                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${canSel ? escapeHtml(taskName) + ' 📧' : escapeHtml((r.subject||'').substring(0,35))}
                    </div>
                    <div style="display:flex; gap:4px; margin-top:2px; flex-wrap:wrap;">
                        ${r.date ? `<span style="font-size:10px; color:#aaa;">${r.date}</span>` : ''}
                        ${r.project
                            ? `<span style="background:#e7f3ff; color:#0056b3; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold;">${r.project}</span>`
                            : (!canSel ? `<span style="color:#dc3545; font-size:10px;">${r.error||''}</span>` : '')}
                        ${typeof r._score === 'number'
                            ? `<span title="우선순위 점수" style="background:#fff3cd; color:#856404; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold;">${r._scoreGrade||''}${r._score}점</span>`
                            : ''}
                        ${(function() {
                            const cat = r.task && (r.task['담당구분'] || '').trim();
                            if (!cat || cat === '미분류') return '';
                            const isCurProj = r._projectTag && r._projectTag.candidates && r._projectTag.candidates[0]
                                && r._projectTag.candidates[0].drive_file_id === window.currentDriveFileId;
                            const resolved = isCurProj && window._msResolveCategoryAssignee ? window._msResolveCategoryAssignee(cat) : null;
                            return `<span title="담당구분" style="background:#f1ebff; color:#6f42c1; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:bold;">👤${escapeHtml(cat)}${resolved && resolved.name ? ' ('+escapeHtml(resolved.name)+')' : ''}</span>`;
                        })()}
                        ${r.task && r.task['시작일']
                            ? `<span style="font-size:10px; color:#888;">${r.task['시작일'].includes('날짜확인필요') ? '⚠️날짜필요' : r.task['시작일']}</span>`
                            : ''}
                        ${r.registered
                            ? `<span style="color:#28a745; font-size:10px; font-weight:bold;">✅등록완료</span>`
                            : `<span style="color:#999; font-size:10px;">⬜미등록</span>`}
                    </div>
                </div>
                <button data-del-idx="${i}" title="목록에서 삭제"
                        style="flex-shrink:0; border:none; background:none; color:#bbb; cursor:pointer; font-size:13px; padding:2px 4px;"
                        onmouseover="this.style.color='#dc3545'" onmouseout="this.style.color='#bbb'">🗑</button>
            </div>`;
        }).join('');

        if (header) header.style.display = 'flex';
        list.style.display = 'block';
        if (batchBtn) batchBtn.style.display = 'block';
        if (batchInboxBtn) batchInboxBtn.style.display = 'block';
        if (c.countId) { const el = document.getElementById(c.countId); if (el) el.textContent = arr.length; }
        AR.syncCheckAll(tabKey);

        arr.forEach((r, i) => {
            const row = document.getElementById(`${tabKey}-list-item-${i}`);
            if (!row) return;
            row.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox' || e.target.dataset.delIdx !== undefined) return;
                AR.selectItem(tabKey, i);
            });
            const delBtn = row.querySelector('[data-del-idx]');
            if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); AR.deleteItem(tabKey, i); });
            const cb = row.querySelector('input[type=checkbox]');
            if (cb) cb.addEventListener('change', function() { AR.toggleCheck(tabKey, i, this.checked); });
            row.addEventListener('mouseover', function() { if (!this.classList.contains(c.activeClass)) this.style.background = '#e7f3ff'; });
            row.addEventListener('mouseout', function() {
                if (!this.classList.contains(c.activeClass)) {
                    const rr = c.getArr()[i];
                    this.style.background = rr.registered ? '#d4edda' : (rr.task ? '#fff' : '#fafafa');
                }
            });
        });
    },

    toggleCheck(tabKey, idx, checked) {
        const arr = AR.cfg[tabKey].getArr();
        if (arr && arr[idx]) arr[idx].selected = checked;
        AR.syncCheckAll(tabKey);
    },

    syncCheckAll(tabKey) {
        const c = AR.cfg[tabKey];
        const all = document.querySelectorAll(`#${c.listId} input[type=checkbox]:not(:disabled)`);
        const chk = document.querySelectorAll(`#${c.listId} input[type=checkbox]:not(:disabled):checked`);
        const ca = document.getElementById(c.checkAllId);
        if (ca) ca.checked = all.length > 0 && all.length === chk.length;
    },

    selectAll(tabKey, select) {
        const c = AR.cfg[tabKey];
        const arr = c.getArr();
        document.querySelectorAll(`#${c.listId} input[type=checkbox]:not(:disabled)`).forEach(cb => {
            cb.checked = select;
            const idx = parseInt(cb.dataset.idx);
            if (!isNaN(idx) && arr[idx]) arr[idx].selected = select;
        });
    },

    deleteItem(tabKey, idx) {
        const arr = AR.cfg[tabKey].getArr();
        const r = arr[idx];
        if (!r) return;
        // 💡 목록에서 빼는 것뿐, 등록된 항목의 실제 Gantt 데이터는 지워지지 않아 확인창 없이 바로 진행
        arr.splice(idx, 1);
        AR.render(tabKey);
    },

    retryAsManual(tabKey, idx) {
        const r = AR.cfg[tabKey].getArr()[idx];
        if (!r) return;
        r.task = {
            '업무명': r.subject || '새 업무',
            '시작일': '날짜확인필요', '완료일': '날짜확인필요',
            '상태': '진행', '개발단계': '', '상세내용': r.body || '',
            'wbs레벨': 4
        };
        r.selected = true;
        r.error = null;
        AR.render(tabKey);
        AR.selectItem(tabKey, idx);
    },

    moveToDirectInput(tabKey, idx) {
        const r = AR.cfg[tabKey].getArr()[idx];
        if (!r || !r.body) return;
        // 직접 입력 탭으로 전환
        window.switchMailTab('paste');
        // 본문 복사
        const inp = document.getElementById('mail-content-input');
        if (inp) {
            inp.value = (r.subject ? r.subject + '\n\n' : '') + r.body;
            inp.dispatchEvent(new Event('input'));
        }
        // 오른쪽 패널 초기화
        const emptyEl = document.getElementById('mail-right-empty');
        const detailEl = document.getElementById('mail-right-detail');
        if (emptyEl) emptyEl.style.display = 'flex';
        if (detailEl) detailEl.style.display = 'none';
    },

    selectItem(tabKey, idx) {
        const c = AR.cfg[tabKey];

        // 📌 다른 항목으로 넘어가기 전에, 지금 보고 있던 항목에서 고친 내용(날짜 등)을 먼저 저장
        //    (안 그러면 "등록" 없이 목록만 이동해도 방금 고친 날짜/내용이 사라짐)
        const prevIdxForSave = c.getCurIdx();
        if (prevIdxForSave >= 0 && prevIdxForSave !== idx && window._mailAnalyzedResult) {
            const prevArr = c.getArr();
            if (prevArr[prevIdxForSave] && prevArr[prevIdxForSave].task) {
                prevArr[prevIdxForSave].task = JSON.parse(JSON.stringify(window._mailAnalyzedResult));
            }
        }
        const r = c.getArr()[idx];
        if (!r) return;

        if (!r.task) {
            const _mfEn2 = window._currentLang === 'en';
            const bodyTooShort = !r.body || r.body.trim().length < 20;
            const mfHint = (tabKey === 'mf' && bodyTooShort)
                ? `<div style="font-size:11px; color:#e67e22; margin-top:8px; padding:6px 8px; background:#fff8e6; border-radius:4px;">
                     💡 ${_mfEn2 ? 'Very little body text was extracted. If this is an IMAP account mail, retrying from the [Mail Server] tab above may recognize it better.' : '본문이 거의 추출되지 않았습니다. 이 메일이 IMAP 계정 메일이라면 상단 [메일서버] 탭에서 다시 시도하면 더 잘 인식될 수 있습니다.'}
                   </div>`
                : '';
            const emptyEl = document.getElementById('mail-right-empty');
            if (emptyEl) emptyEl.innerHTML =
                `<div style="font-size:32px;">⚠️</div>
                 <div style="font-size:13px; font-weight:bold; color:#dc3545; margin-top:8px;">${escapeHtml(r.error || (_mfEn2 ? 'AI analysis failed' : 'AI 분석 실패'))}</div>
                 <div style="font-size:11px; color:#aaa; margin-top:4px;">${escapeHtml(r.subject||'')}</div>
                 ${mfHint}
                 ${r.body ? `
                 <div style="text-align:left; width:100%; align-self:stretch; box-sizing:border-box; margin-top:14px; padding-top:10px; border-top:1px solid #eee; display:flex; flex-direction:column; flex:1; min-height:0;">
                    <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:4px; flex-shrink:0;">📄 ${_mfEn2 ? 'Extracted mail body (kept even if analysis failed)' : '추출된 메일 본문 (분석 실패 시에도 원문은 보존됩니다)'}</div>
                    <div style="flex:1; min-height:80px; max-height:45vh; overflow-y:auto; overflow-x:hidden; font-size:11px; color:#666; white-space:pre-wrap; overflow-wrap:break-word; word-break:break-word; background:#f8f9fa; border:1px solid #eee; border-radius:6px; padding:8px; box-sizing:border-box;">${escapeHtml(r.body)}</div>
                    <button class="action-btn" onclick="AR.retryAsManual('${tabKey}', ${idx})" style="margin-top:8px; font-size:13px; width:100%; box-sizing:border-box; flex-shrink:0;">✏️ ${_mfEn2 ? 'Register as-is (manual)' : '본문으로 직접 등록'}</button>
                    <button class="action-btn" onclick="AR.moveToDirectInput('${tabKey}', ${idx})" style="margin-top:4px; font-size:13px; width:100%; box-sizing:border-box; background:#fff; color:#2c5f8a; border-color:#2c5f8a; flex-shrink:0;">🔄 ${_mfEn2 ? 'Move to Direct Input & re-analyze' : '직접 입력 탭으로 이동해서 AI 분석'}</button>
                 </div>` : `<div style="font-size:11px; color:#bbb; margin-top:10px;">${_mfEn2 ? 'Could not extract body.' : '본문을 추출하지 못했습니다.'}</div>`}`;
            document.getElementById('mail-right-empty').style.display = 'flex';
            document.getElementById('mail-right-detail').style.display = 'none';
            return;
        }

        const prevIdx = c.getCurIdx();
        if (prevIdx >= 0) {
            const prev = document.getElementById(`${tabKey}-list-item-${prevIdx}`);
            const prevR = c.getArr()[prevIdx];
            if (prev) { prev.classList.remove(c.activeClass); prev.style.background = prevR?.registered ? '#d4edda' : '#fff'; }
        }
        c.setCurIdx(idx);
        const cur = document.getElementById(`${tabKey}-list-item-${idx}`);
        if (cur) { cur.classList.add(c.activeClass); cur.style.background = '#fff3e0'; }

        mailShowRightDetail(r.subject||'직접입력', r.sender||'', r.date||'', r.body||r.mailText||'', r.project, r.task, () => {
            if (window._mailAnalyzedResult) r.task = JSON.parse(JSON.stringify(window._mailAnalyzedResult));
            if (!mfDirectInsert(r.task, r.mailRaw || window._mailParsedRaw, r._alarmWorthy)) return;
            r.registered = true;
            r.selected = false;
            c.setCurIdx(-1);
            AR.render(tabKey);
            document.getElementById('mail-right-empty').style.display = 'flex';
            document.getElementById('mail-right-detail').style.display = 'none';
            window.recalculateSchedules();
        }, r.mailRaw);
    },

    batchInsert(tabKey) {
        const c = AR.cfg[tabKey];
        const arr = c.getArr();
        const validTargets = arr.filter(r =>
            r.selected && r.task && !r.registered &&
            !( (r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요') )
        );
        const excludedCount = arr.filter(r => r.selected && r.task && !r.registered).length - validTargets.length;

        if (!validTargets.length) {
            alert(excludedCount > 0 ? '⚠️ 날짜가 없는 항목은 등록할 수 없습니다. (제외됨)' : '등록할 항목을 체크해주세요.');
            return;
        }

        let previewMsg = `✅ 총 ${validTargets.length}개 항목을 일괄 등록합니다.\n`;
        if (excludedCount > 0) previewMsg += `\n⚠️ 날짜가 없는 ${excludedCount}개 항목은 자동으로 제외되었습니다.`;
        previewMsg += '\n\n[등록할 업무 목록]\n' + validTargets.map(r => '• ' + (r.task['업무명']||'새업무')).join('\n');
        if (!confirm(previewMsg + '\n\n위 내용으로 등록하시겠습니까?')) return;

        for (let i = arr.length - 1; i >= 0; i--) {
            const r = arr[i];
            if (r.selected && r.task && !r.registered) {
                if (c.getCurIdx() === i && window._mailAnalyzedResult) r.task = window._mailAnalyzedResult;
                if (mfDirectInsert(r.task, r.mailRaw || window._mailParsedRaw, r._alarmWorthy)) { r.registered = true; r.selected = false; }
            }
        }

        AR.render(tabKey);
        window.recalculateSchedules();
        alert(`✅ ${validTargets.length}개 항목이 등록되었습니다!`);
    },

    // 💡 체크한 항목들을 Gantt에 등록하지 않고 "업무 보관함"으로 한 번에 이동
    batchToInbox(tabKey) {
        const c = AR.cfg[tabKey];
        const arr = c.getArr();
        const validTargets = arr.filter(r => r.selected && r.task && !r.registered);
        if (!validTargets.length) { alert('보관함으로 옮길 항목을 체크해주세요.'); return; }

        // 💡 날짜 미확정 항목이 섞여 있으면 미리 알려줌 — "다른 프로젝트 전송" 시점까지 기다리지 않게
        const incomplete = validTargets.filter(r =>
            (r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요')
        );
        let previewMsg = `📥 총 ${validTargets.length}개 항목을 업무 보관함으로 이동합니다.\n\n[이동할 업무 목록]\n`
            + validTargets.map(r => '• ' + (r.task['업무명']||'새업무') + (
                ((r.task['시작일']||'').includes('날짜확인필요') || (r.task['완료일']||'').includes('날짜확인필요')) ? ' ⚠️날짜확인필요' : ''
              )).join('\n');
        if (incomplete.length) {
            previewMsg += `\n\n⚠️ ${incomplete.length}개 항목은 시작일/완료일이 미확정 상태입니다.\n보관함에는 담을 수 있지만, "다른 프로젝트로 전송" 시에는 날짜를 먼저 확정해야 합니다.`;
        }
        if (!confirm(previewMsg + '\n\n위 내용으로 이동하시겠습니까?')) return;

        let count = 0;
        for (const r of validTargets) {
            const idx = arr.indexOf(r);
            const task = (c.getCurIdx() === idx && window._mailAnalyzedResult) ? window._mailAnalyzedResult : r.task;
            const _batchRaw = (r.mailRaw) ? r.mailRaw : ((c.getCurIdx() === idx && window._mailParsedRaw) ? window._mailParsedRaw : null);
            // 💡 [매칭/점수 통일화] 점수가 계산된 항목이면 자동틱과 동일한 형식(등급+점수+매칭프로젝트)으로 라벨 표시
            const _srcLabel = (typeof r._score === 'number')
                ? `${r._scoreGrade || ''}${r._score}점 메일분석(${r.project || '미분류'})`
                : '업무 추가(메일분석 일괄)';
            window.TaskInbox.add(task, {
                source: _srcLabel, mailRaw: _batchRaw,
                matchedProject: r._projectTag || null,
                alarmWorthy: !!r._alarmWorthy
            });
            r.selected = false;
            count++;
        }

        if (window.updateInboxBadge) window.updateInboxBadge();
        const ov = document.getElementById('task-inbox-overlay');
        if (ov && ov.style.display === 'flex' && window.renderTaskInbox) window.renderTaskInbox();

        AR.render(tabKey);
                window.showToast(window._currentLang === 'en' ? `📥 ${count} task(s) moved to inbox.` : `📥 ${count}개 업무를 보관함에 담았습니다.`);
    },
};

// ── 3탭 기존 함수명은 그대로 유지하되(다른 곳에서 호출하는 이름 그대로), 내부는 전부 AR로 위임 ──
window.mfRenderList    = () => AR.render('mf');
window.mfToggleCheck   = (idx, checked) => AR.toggleCheck('mf', idx, checked);
window.mfSyncCheckAll  = () => AR.syncCheckAll('mf');
window.mfSelectAll     = (select) => AR.selectAll('mf', select);
window.mfDeleteItem    = (idx) => AR.deleteItem('mf', idx);
window.mfSelectItem    = (idx) => AR.selectItem('mf', idx);
window.mfRetryAsManual = (idx) => AR.retryAsManual('mf', idx);
window.mfBatchInsert   = () => AR.batchInsert('mf');
window.mfBatchToInbox  = () => AR.batchToInbox('mf');

window.msRenderList    = () => AR.render('ms');
window.msSyncCheckAll  = () => AR.syncCheckAll('ms');
window.msSelectAll     = (select) => AR.selectAll('ms', select);
window.msDeleteItem    = (idx) => AR.deleteItem('ms', idx);
window.msSelectItem    = (idx) => AR.selectItem('ms', idx);
window.msRetryAsManual = (idx) => AR.retryAsManual('ms', idx);
window.msBatchInsert   = () => AR.batchInsert('ms');
window.msBatchToInbox  = () => AR.batchToInbox('ms');

window.pasteRenderResultList = () => AR.render('paste');
window.pasteToggleCheck      = (idx, checked) => AR.toggleCheck('paste', idx, checked);
window.pasteSyncCheckAll     = () => AR.syncCheckAll('paste');
window.pasteSelectAll        = (select) => AR.selectAll('paste', select);
window.pasteDeleteResult     = (idx) => AR.deleteItem('paste', idx);
window.pasteSelectItem       = (idx) => AR.selectItem('paste', idx);
window.pasteRetryAsManual    = (idx) => AR.retryAsManual('paste', idx);
window.pasteBatchInsert      = () => AR.batchInsert('paste');
window.pasteBatchToInbox     = () => AR.batchToInbox('paste');

// 💡 [2026-08-28 신규] 메일 본문에 자주 등장하는 사내 관리번호("#502319"류)를 결정론적으로 추출.
//    프로젝트 매칭 시 브랜드명/크기만으로 오매칭되는 걸 막기 위해 msCallGemini에서 사용 —
//    이 번호가 등록된 후보가 있으면 우선하고, 없으면 브랜드/크기만으로 섣불리 매칭하지 말라고 경고한다.
window._msExtractCodeTokens = function(text) {
    const s = String(text || '');
    const found = new Set();
    const re = /#\s?(\d{4,7})\b/g;
    let m;
    while ((m = re.exec(s))) found.add(m[1]);
    return Array.from(found);
};

// 💡 [2026-09-06 신규] 국내 비즈니스 메일 관행상 본문 맨 위에 "수신 : OOO님" / "참조 : OOO"처럼
//    수신인·참조인을 직접 적어두는 경우가 흔한데, cleanMailBody()가 "발신자는 이미 별도 전달되니
//    본문엔 불필요"라는 이유로 이 줄을 통째로 삭제해버려서(15a-mail-attachment-tab.js의 헤더 라인
//    제거 규칙) AI가 수신자를 판별할 유일한 단서를 못 받는 경우가 실제로 확인됨(→ "수신자 미지정"
//    "수신자 제위" 남발의 원인 중 하나). cleanMailBody가 지우기 전에 먼저 뽑아서 발신자와 동일한
//    방식으로 별도 필드로 AI에게 명시 전달한다. 인용/포워딩 체인 안의 옛 헤더를 잘못 집지 않도록
//    본문 맨 위 12줄까지만 확인한다.
window._msExtractRecipientHint = function(rawBody) {
    const lines = String(rawBody || '').split(/\r?\n/).slice(0, 12);
    let to = '', cc = '';
    for (const line of lines) {
        const m = line.match(/^\s*(수신|참조|To|Cc)\s*[:：]\s*(.+)$/i);
        if (!m) continue;
        const label = m[1].toLowerCase();
        const val = m[2].trim();
        if (!val) continue;
        if ((label === '수신' || label === 'to') && !to) to = val;
        else if ((label === '참조' || label === 'cc') && !cc) cc = val;
    }
    return { to, cc };
};

// 💡 [버그 수정 2026-09-06] 후보 프로젝트 매칭 섹션(하이브리드 힌트 4종 + 매칭 필드 요청)을 프롬프트에
//    덧붙이는 로직 — 원래 msCallGemini 안에 인라인으로만 있었는데, 25-ai-learning.js의 Phase 4 재시도
//    엔진이 도입 시점(커밋 00bf23a)부터 이 이름의 함수를 호출하도록 작성돼 있었음에도 실제로는 정의된
//    적이 없었다. 그 결과 재시도 엔진이 후보 목록 없이 AI를 호출해 매칭신뢰도 필드 자체를 못 받고
//    "재분석 완료 — 신뢰도 변경 없음"만 반복하는, 처음부터 죽어있던 기능이었음. msCallGemini의 인라인
//    로직을 이 함수로 그대로 옮기고 양쪽(msCallGemini / 재시도 엔진)에서 공용으로 쓰게 한다.
window._msBuildProjectMatchSection = function(candidateProjects, mailText, userHint) {
    if (!candidateProjects || !candidateProjects.length) return '';
    mailText = mailText || '';

    // 💡 [하이브리드-B] 토픽 프로파일 스토어 로드 — 각 프로젝트에 저장된 AI 토픽 키워드를 후보 목록에 주입
    const _tpStore = (function() {
        try { return JSON.parse(localStorage.getItem('gantt_topic_profile_v1')) || {}; }
        catch(e) { return {}; }
    })();
    const numbered = candidateProjects.map((c, i) => {
        // ✅ [토픽 프로파일] 1순위: project_index.json topicKeywords (모든 프로젝트, Drive에서 사전 저장됨)
        //                   2순위: localStorage 캐시 (이 세션에서 로드한 프로젝트)
        const _tpKw = (function() {
            if (c.topicKeywords && c.topicKeywords.length)
                return ' | 🔑토픽: ' + c.topicKeywords.slice(0, 8).join(', ');
            const _cached = _tpStore[c.drive_file_id];
            if (_cached && _cached.keywords && _cached.keywords.length)
                return ' | 🔑토픽: ' + _cached.keywords.slice(0, 8).join(', ');
            return '';
        })();
        return `${i + 1}. ${c.model || c.customer}${c.inch ? ' (' + c.inch + '인치)' : ''}${c.customer && c.model ? ' / 고객사: ' + c.customer : ''}${(c.keywords && c.keywords.length) ? ' — 참고 키워드: ' + c.keywords.slice(0, 6).join(', ') : ''}${_tpKw} [파일: ${c.file_name}]`;
    }).join('\n');
    // 💡 [하이브리드-A] 키워드 사전매칭 힌트 — 모델명·키워드가 메일 본문에 직접 등장하는 후보를
    //    AI에게 알려줌(강제 override 아님 — 맥락이 다르면 무시 가능). 후보의 40% 이하일 때만 표시
    //    (너무 많이 걸리면 힌트 의미 없어짐 — 전부 다 매칭이면 정보가 아님).
    const _mailBodyLow = mailText.toLowerCase();
    const _kwCertain = candidateProjects.map(function(c, i) {
        const _frags = (c.model || '').toLowerCase().split(/[\s\-\_\/]+/).filter(function(f) { return f.length >= 3; });
        const _kws   = (c.keywords || []).map(function(k) { return String(k).toLowerCase().trim(); });
        const _hit   = _frags.some(function(f) { return _mailBodyLow.includes(f); }) ||
                       _kws.some(function(k)   { return k.length >= 3 && _mailBodyLow.includes(k); });
        return _hit ? (i + 1) + '번(' + (c.model || c.customer) + ')' : null;
    }).filter(Boolean);
    let kwPreHint = '';
    if (_kwCertain.length > 0 && _kwCertain.length <= Math.ceil(candidateProjects.length * 0.4)) {
        kwPreHint = '\n⭐ [키워드 사전매칭 힌트] 메일 본문에 모델명·키워드가 직접 등장하는 후보: ' +
            _kwCertain.join(', ') +
            ' — 우선 검토하되, 실제 메일 맥락이 다르면 무시하고 0으로 답해도 됩니다.\n';
    }

    // 💡 [2026-08-28 신규] 브랜드명(고객사)+크기(인치)만 같으면 실제 관리번호(#502319류)가 어느
    //    후보에도 등록 안 돼 있어도 AI가 "이름/크기가 비슷하니까" 매칭해버리는 오탐이 실제로
    //    확인됨(예: "LNW 27 UHD #502319"가 다른 27인치 LNW 프로젝트로 오매칭). 메일 본문에서
    //    "#숫자" 관리번호를 결정론적으로 뽑아, 등록된 후보가 있으면 그쪽을 우선하도록, 없으면
    //    브랜드/크기만으로 섣불리 매칭하지 말라고 명시적으로 경고한다(강제 override는 아니고
    //    AI 판단을 돕는 강한 힌트 — 이 앱의 기존 "키워드는 힌트일 뿐" 철학과 동일).
    const mailCodes = window._msExtractCodeTokens ? window._msExtractCodeTokens(mailText) : [];
    let codeHint = '';
    if (mailCodes.length) {
        const hasCode = function(c, code) { return (c.keywords || []).some(function(k) { return String(k).includes(code); }); };
        const withCode = candidateProjects
            .map(function(c, i) { return { no: i + 1, c: c }; })
            .filter(function(x) { return mailCodes.some(function(code) { return hasCode(x.c, code); }); });
        if (withCode.length) {
            codeHint = `\n⚠️ [관리번호 우선 근거] 메일에 등장하는 관리번호(${mailCodes.map(function(c){return '#'+c;}).join(', ')})가 등록된 후보: ` +
                withCode.map(function(x) { return x.no + '번(' + x.c.file_name + ')'; }).join(', ') +
                ' — 브랜드명·크기만 비슷한 다른 후보보다 이 근거를 우선하세요.\n';
        } else {
            codeHint = `\n⚠️ [관리번호 불일치 주의] 메일에 관리번호(${mailCodes.map(function(c){return '#'+c;}).join(', ')})가 등장하지만 아래 후보 중 이 번호가 등록된 곳이 없습니다. ` +
                '이럴 땐 브랜드명(고객사)·크기(인치)만 비슷하다고 섣불리 매칭하지 마세요 — 본문에 다른 확실한 근거가 없으면 매칭신뢰도를 "중" 이하로 낮추거나 0(해당없음)으로 답하세요.\n';
        }
    }

    // 💡 [2026-09-01 신규] 사용자가 "📭 미분류 메일" 큐에서 [🔄 재분석 요청]으로 남긴 힌트(사람의 판단) —
    //    있으면 프로젝트 후보 목록보다도 먼저 보여줘서 최우선 근거로 삼게 한다. 위 관리번호 규칙과
    //    상충하면(예: 사용자가 지목한 프로젝트에 그 관리번호가 없음) 사용자 힌트를 우선하되, 그 사실을
    //    "매칭근거"에 남기도록 유도한다(아래 매칭근거 필드 설명 참고).
    const userHintBlock = userHint
        ? `\n⚠️ [사용자 재분석 요청 — 사람의 판단, 최우선 근거] 이 메일은 한 번 미분류로 판정됐고, 사용자가 아래처럼 직접 의견을 남기며 다시 판단해달라고 요청했습니다:\n"${userHint}"\n이 의견을 다른 어떤 근거보다도 우선해서 반영하세요. 사용자가 특정 프로젝트를 지목했다면 아래 후보 목록에서 그 프로젝트를 찾아 그 번호로 응답하고 신뢰도를 "상"으로 두세요(후보 목록에 없는 프로젝트를 말하는 것 같으면 0으로 두고 매칭근거에 그렇게 적으세요).\n`
        : '';

    return `\n\n--- 프로젝트 매칭 판단 요청 (현재 등록된 활성 프로젝트 전체 목록) ---\n` + userHintBlock +
        `후보 프로젝트 목록:\n${numbered}\n` + codeHint + kwPreHint +
        `이 메일이 실제로 다루는 "핵심 주제"가 위 목록 중 하나로 명확한지 판단하세요. 목록의 "참고 키워드"는 힌트일 뿐이니,\n` +
        `본문 맥락상 명백히 그 프로젝트 얘기면 키워드가 없어도 선택하세요. 반대로 키워드가 우연히 겹쳐도 실제 핵심 주제가 아니면 고르지 마세요.\n` +
        `※ 브랜드명(고객사)이나 크기(인치)가 같다는 이유만으로 매칭하지 마세요 — 같은 브랜드가 여러 프로젝트를 가질 수 있습니다. 본문의 구체적 내용(모델 고유 코드, 요청 사항 등)까지 확인하세요.\n` +
        `※ 후보 중 이름이 같은 것들은 인치(크기)로 구별하세요.\n` +
        `- 핵심 주제가 명확하면: 해당 후보의 번호를 아래 필드에 적으세요.\n` +
        `- 목록 어디에도 해당 안 되거나(신규/미등록 프로젝트), 회의록처럼 여러 프로젝트가 대등하게 다뤄지거나, 판단이 애매하면: 0으로 적으세요.\n` +
        `- ⚠️ [복수 프로젝트] 이 메일이 서로 다른 프로젝트 여러 개에 대해 "각각 명확하고 독립적인" 실행 항목(To do)을 담고 있을 때만` +
        `(예: 한 메일 안에 프로젝트 A 용건과 프로젝트 B 용건이 완전히 별개의 문단으로 따로 존재) — 위 "주매칭프로젝트번호"로 답한 것 외에` +
        ` 그만큼 확실한 프로젝트가 더 있다면 그 번호(들)를 "추가매칭프로젝트번호목록" 배열에 적으세요. 각 번호는 반드시 "상" 신뢰도에 준하는` +
        ` 확신이 있을 때만 넣고, 조금이라도 애매하면 절대 넣지 마세요. 단순히 다른 프로젝트가 언급되거나(참고·비교 목적), 회의록처럼 여러` +
        ` 프로젝트가 대등하게 나열만 된 경우는 포함하지 마세요 — 그럴 땐 이 배열을 반드시 빈 배열 []로 두세요.\n` +
        `위 JSON에 아래 네 필드를 추가로 포함해서 응답하세요:\n` +
        `"주매칭프로젝트번호": 1 (해당 번호, 애매하거나 목록에 없으면 0),\n` +
        `"매칭신뢰도": "상 또는 중 또는 하 (핵심 주제가 명확할수록 상)",\n` +
        `"매칭근거": "왜 이 번호를(또는 왜 0을) 선택했는지 1~2문장으로 구체적으로 설명 — 관리번호 일치/불일치, 본문의 어떤 문장·키워드가 결정적이었는지, 후보들과 왜 헷갈렸는지 등을 담아서. 사용자가 이 근거만 보고 재분석 여부를 판단할 수 있게 구체적으로 쓰세요.",\n` +
        `"추가매칭프로젝트번호목록": [] (독립적인 실행 항목이 있는 추가 프로젝트 번호만, 없으면 반드시 빈 배열 [])`;
};

async function msCallGemini(apiKey, parsed, candidateProjects, projectContextOverride, userHint) {
    const GAS_URL = localStorage.getItem("gas_server_url") || "https://script.google.com/macros/s/AKfycbzB1f7lKdYRmJM5Iu38qUVGKat_51ggZR3_4aOsITjiqBuXN1wBAzixNp1CmgO_eJICfg/exec";

    // 💡 [2026-08-21][긴급 버그 수정] 예전엔 매칭된 프로젝트 정보가 없으면 "현재 열린 프로젝트" 기준으로
    //    폴백했음 — Phase A(AI 직접매칭) 도입 이후 ms/mf/paste/자동틱 4곳 전부 projectContextOverride를
    //    항상 null로 넘기게 바뀌었는데, 이 폴백은 그대로 남아있어서 **매번** "지금 화면에 열려있는 아무
    //    프로젝트"의 담당자/고객사/모델명/인치가 배경정보로 새 들어가는 사고가 실제로 있었음
    //    (예: STELLAR32를 열어둔 채 자동수집이 돌면, LNW의 전혀 다른 프로젝트 메일도 "고객사: LNW,
    //    모델명: STELLAR32"라는 배경정보를 받아 AI가 STELLAR32로 오매칭 — 실제 재현 확인됨).
    //    Phase A는 애초에 "특정 프로젝트로 미리 단정 짓지 않고 전체 후보 중에서 공정하게 고르게" 하는
    //    설계라, 이 폴백 자체가 설계 취지를 정면으로 훼손함 → 폴백 제거, 매칭 정보 없으면 그냥 빈 값.
    let assignee = (projectContextOverride && projectContextOverride.assignee) || '';
    let customer = (projectContextOverride && projectContextOverride.customer) || '';
    let model = (projectContextOverride && projectContextOverride.model) || '';
    let inch = (projectContextOverride && projectContextOverride.inch) || '';

    const _msDateYMD = window.parseMailDateToYMD(parsed.date);
    // 💡 [2026-09-06] cleanMailBody가 본문의 "수신/참조" 줄을 지우기 전에 먼저 뽑아 별도 필드로 전달
    //    (근거: window._msExtractRecipientHint 주석 참고 — 발신자→수신자 판별의 "수신자 미지정" 오남용 완화)
    const _recipHint = window._msExtractRecipientHint ? window._msExtractRecipientHint(parsed.body) : { to: '', cc: '' };
    const _recipLine = (_recipHint.to || _recipHint.cc)
        ? ('받는사람: ' + (_recipHint.to || '(본문에 명시 안 됨)') + (_recipHint.cc ? '\n참조: ' + _recipHint.cc : '') + '\n')
        : '';
    // 💡 [2026-08-27] 하드코딩된 2000자를 "⚙️ 설정 → AI 분석 설정"에서 조절 가능하도록 변경
    const mailText = parsed.subject + '\n' + parsed.sender + '\n' + _recipLine + (_msDateYMD ? '발송일: ' + _msDateYMD + '\n' : '') + cleanMailBody(parsed.body).substring(0, window.getAiMailMaxLen());
    // 💡 파싱 원문 전역 보관
    window._mailParsedRaw = { subject: parsed.subject || '', sender: parsed.sender || '', date: parsed.date || '', body2000: mailText };
    let prompt = window.getSystemPrompt(assignee, customer, model, inch, mailText, _msDateYMD || null);

    // 💡 [2026-08-20][AI 직접 매칭 v3] 예전엔 키워드 사전매칭으로 후보가 2개 이상 걸릴 때만 AI에게
    //    맥락 판단을 맡겼음 — project_index.json 키워드 목록이 노후화되면 AI가 애초에 이 판단 기회조차
    //    못 받는 구조적 병목이었음. → 이제 활성 프로젝트 전체를 항상 후보로 주고 AI가 직접 판단(+신뢰도).
    //    오탐 방지를 위해 "상" 신뢰도일 때만 자동확정에 사용(호출부에서 처리), 그 외엔 사람 확인으로 넘김.
    // 💡 [버그 수정] 후보 프로젝트명이 서로 같을 수 있어(예: SHUFFLER 3인치/4.3인치 둘 다 "SHUFFLER")
    //    이름이 아니라 "번호"로 답하게 해서 확실히 구별함. 인치 정보 + 등록된 키워드도 참고용으로 같이 제공
    //    (키워드는 더 이상 매칭 게이트가 아니라, AI 판단을 돕는 힌트일 뿐 — 없어도 다른 근거로 고를 수 있음).
    //    → 실제 힌트 조립 로직은 window._msBuildProjectMatchSection()으로 분리(재시도 엔진과 공용).
    prompt += window._msBuildProjectMatchSection(candidateProjects, mailText, userHint);

    const callResult = await window.callAiBackend(apiKey, prompt);
    if (!callResult.ok) {
        console.error(`Gemini 분석 최종 실패`, callResult.error && callResult.error.message);
        return null;
    }
    let text = callResult.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = window.parseGeminiTask(text);
    if (result) {
        // 💡 [B안] 시작일은 AI 추론 대신 메일 발송일로 확정
        //    (인용/포워딩 체인에 섞인 과거 날짜를 집는 오류 원천 차단. 사용자가 달력에서 수정 가능)
        if (_msDateYMD) {
            result['시작일'] = _msDateYMD;
            const _p = result['완료일'];
            if (_p && !String(_p).includes('날짜확인필요') && _p < _msDateYMD) result['완료일'] = _msDateYMD;
        }
        // 💡 완료일을 못 찾았으면 시작일+1일로 기본값 채움
        window._applyDefaultDueDate(result);
        // 💡 AI가 프롬프트 지시대로 스스로 만든 [출처]가 있으면 지우고, 코드에서 만든 깨끗한 것만 남김
        result['상세내용'] = window.stripAiGeneratedSourceTag(result['상세내용']);
        // 💡 [2026-08-25 신규] AI가 판정한 "담당구분"(예: HW)은 지금까지 배지/보관함 메타 정보로만
        //    보여지고, 정작 저장되는 상세내용 텍스트 안에는 없었다 — Gantt 셀/엑셀 export/"추출" 등
        //    상세내용 텍스트만 따라가는 곳에서는 이 분류가 통째로 사라졌다. [출처]와 같은 방식으로
        //    태그 한 줄을 상세내용에 함께 새겨서, 텍스트가 어디로 옮겨져도 분류 정보가 유지되게 한다.
        //    (담당자 "이름"까지는 안 넣는다 — 이름은 실제로 어느 프로젝트에 등록되느냐에 따라 달라지는
        //    화면 표시용 해석값이라, 분석 시점에 고정해서 저장하면 나중에 다른 프로젝트로 매칭될 때 틀어짐)
        const catTag = (result['담당구분'] && result['담당구분'] !== '미분류') ? `[담당구분]${result['담당구분']}` : '';
        const srcTag = `[출처]${parsed.subject || ''}_${window.cleanMailDateForTag(parsed.date)}_${parsed.sender || ''}`;
        result['상세내용'] = (result['상세내용'] || '') + (catTag ? '\n' + catTag : '') + '\n' + srcTag;

        // ✅ [AI 학습 Phase 1] AI 등록 메타데이터 첨부 — buildMailTaskRow()가 읽어서 row._aiRegistered 등으로 저장.
        //    재배치/오매칭 삭제 피드백 시 이 데이터로 학습 항목을 기록한다.
        if (candidateProjects && candidateProjects.length > 0) {
            const _mIdx = parseInt(result['주매칭프로젝트번호'] || 0, 10) - 1;
            const _mProj = (_mIdx >= 0 && _mIdx < candidateProjects.length) ? candidateProjects[_mIdx] : null;
            result['_aiMeta'] = {
                confidence      : result['매칭신뢰도'] || '',
                matchedProjectId  : _mProj ? (_mProj.drive_file_id || '') : '',
                matchedProjectName: _mProj ? (_mProj.file_name || '') : '',
                matchBasis      : result['매칭근거'] || '',
                keywords        : _mProj ? (_mProj.keywords || []).slice(0, 8) : [],
                snippet         : ((parsed && parsed.subject) || '') + ' | ' +
                                  ((parsed && parsed.body) || '').substring(0, 150)
            };
        }
    }
    return result;
}
