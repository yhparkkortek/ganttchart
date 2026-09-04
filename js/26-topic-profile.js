/* ================================================================
   26-topic-profile.js
   프로젝트 토픽 프로파일 — Gantt 업무 데이터 → Gemini AI 요약 → 맥락 저장
   ================================================================
   · window._generateTopicProfile()         현재 프로젝트의 토픽 프로파일 생성 (AI 호출)
   · window._getTopicProfile(key?)          저장된 프로파일 조회
   · window._topicProfileSnippet(key?)      프롬프트 주입용 단문 요약 반환
   · window._clearTopicProfile(key?)        프로파일 삭제
*/

(function() {
    var _TP_KEY = 'gantt_topic_profile_v1';

    function _getStore() {
        try { return JSON.parse(localStorage.getItem(_TP_KEY)) || {}; } catch(e) { return {}; }
    }
    function _saveStore(store) {
        try { localStorage.setItem(_TP_KEY, JSON.stringify(store)); } catch(e) {}
    }
    function _currentKey() {
        // 💡 [버그 수정] fileName 우선 → fileId 우선으로 변경.
        //    팀 폴더 구조에서 다른 팀의 파일이 같은 이름('project.json')을 가질 수 있어,
        //    fileName을 키로 쓰면 서로 다른 프로젝트가 같은 토픽 프로파일을 공유하는 버그 발생.
        //    fileId는 Drive에서 전역 고유값이므로 항상 안전.
        return window.currentDriveFileId || window.currentDriveFileName || '';
    }

    /** 저장된 토픽 프로파일 반환 (없으면 null) */
    window._getTopicProfile = function(key) {
        key = key || _currentKey();
        if (!key) return null;
        return _getStore()[key] || null;
    };

    /** 프롬프트 주입용 단문 요약 ("" = 프로파일 없음) */
    window._topicProfileSnippet = function(key) {
        var profile = window._getTopicProfile(key);
        if (!profile) return '';
        var kw            = (profile.keywords       || []).slice(0, 12).join(', ');
        var topics        = (profile.topics         || []).slice(0,  4).join('; ');
        var distinguish   = (profile.distinguishers || []).slice(0,  5).join('; ');
        var currentPhase  = profile.current_phase   || '';
        var summary       = profile.summary         || '';
        var parts         = [];
        if (summary)       parts.push('📌 ' + summary);
        if (currentPhase)  parts.push('🔄 현재 단계: ' + currentPhase);
        if (kw)            parts.push('🔑 고유 식별 키워드: ' + kw);
        if (distinguish)   parts.push('📧 메일 판별 단서: ' + distinguish);
        if (topics)        parts.push('📂 주요 업무 유형: ' + topics);
        return parts.length ? '[프로젝트 토픽 프로파일]\n' + parts.join('\n') : '';
    };

    /** 프로파일 삭제 */
    window._clearTopicProfile = function(key) {
        key = key || _currentKey();
        if (!key) return;
        var store = _getStore();
        delete store[key];
        _saveStore(store);
    };

    /**
     * 현재 프로젝트의 Gantt 업무를 AI로 분석하여 토픽 프로파일을 생성·저장.
     * 성공 시 profile 객체를 반환, 실패 시 null.
     */
    window._generateTopicProfile = async function() {
        var key = _currentKey();
        if (!key) { alert('프로젝트를 먼저 불러오세요.'); return null; }

        if (typeof globalData === 'undefined' || !globalData || globalData.length <= 1) {
            alert('간트차트에 업무 데이터가 없습니다.'); return null;
        }

        var apiKey = window.getActiveAiKey && window.getActiveAiKey();
        if (!apiKey) { alert('AI API 키를 먼저 설정해주세요.'); return null; }

        // ① Gantt 업무명 수집 — 2-레이어 방식
        //    · allTaskNames  : 전체 (최대 120개) — 모델명·고객사 등 고유 식별자 추출용
        //    · recentTaskNames: 최근 90일 이내 종료 또는 현재 진행 중인 업무 — 현재 단계 파악용
        //    두 레이어를 AI 프롬프트에 명확히 분리해서 전달
        var _RECENT_DAYS   = 90;  // 현재 단계로 간주할 최대 업무 기간 (일)
        var _recentCutoff  = Date.now() - _RECENT_DAYS * 24 * 60 * 60 * 1000;
        var seen = {};
        var allTaskNames    = []; // 전체 업무명 (고유 식별자·키워드용)
        var recentTaskNames = []; // 최근 90일 종료/진행 업무 (현재 단계 파악용)
        var _recentSeenInAll = {}; // recentTaskNames가 allTaskNames와 겹치는지 추적

        for (var i = 1; i < globalData.length; i++) {
            var row = globalData[i];
            if (!row) continue;
            var name = row._origT1 || row._origT2 || row._origT3 || row._origT4 || row._origDev || '';
            name = (name || '').replace(/\s*＊AI📧\s*$/, '').trim();
            if (!name) continue;

            // 최근 업무 판별: 계획 완료일(_calcPlanTs)이 cutoff 이후 OR 아직 완료일 미설정(진행중)
            var planTs  = row._calcPlanTs  || 0;
            var startTs = row._calcStartTs || 0;
            var isRecent = (planTs >= _recentCutoff)   // 90일 이내에 끝나는/끝난 업무
                        || (startTs >= _recentCutoff)  // 90일 이내에 시작한 업무
                        || (!planTs && !startTs);      // 날짜 미입력(자동계산 대기) → 현재 업무로 간주

            if (!seen[name]) {
                seen[name] = true;
                if (allTaskNames.length < 120) allTaskNames.push(name);
            }
            if (isRecent && !_recentSeenInAll[name] && recentTaskNames.length < 60) {
                _recentSeenInAll[name] = true;
                recentTaskNames.push(name);
            }
        }
        var taskNames = allTaskNames; // 이하 기존 코드 호환성 유지
        if (!taskNames.length) { alert('수집할 업무명이 없습니다.'); return null; }

        // ② 프로젝트 메타 요약
        var pm = window.projectMeta || {};
        var metaParts = [];
        if (pm.프로젝트담당자) metaParts.push('PM: ' + pm.프로젝트담당자);
        if (pm.고객사명)       metaParts.push('고객사: ' + pm.고객사명);
        if (pm.모델명)         metaParts.push('모델: ' + pm.모델명);
        var metaLine = metaParts.length ? '프로젝트 정보: ' + metaParts.join(', ') + '\n' : '';

        // ③ project_index.json에 누적된 mail 신호 키워드 주입
        //    다른 사용자가 메일 분류 시 기록한 키워드들 — Gantt 업무명만으로 못 잡는 실제 메일 언어 반영
        //    _projectIndexCache(5분 캐시)가 있으면 재사용, 없으면 Drive에서 직접 조회
        var mailSignalLine = '';
        try {
            var _myKey = _currentKey();
            // 캐시 우선 → 없으면 _msLoadProjectIndex() 호출 (이미 async 함수 안이므로 await 가능)
            var _piAll = (window._projectIndexCache && window._projectIndexCache.data)
                ? window._projectIndexCache.data
                : (window._msLoadProjectIndex ? await window._msLoadProjectIndex() : []);
            var _piEntry = (_piAll || []).find(function(p) { return p.drive_file_id === _myKey; });
            var _piKws = (_piEntry && _piEntry.topicKeywords && _piEntry.topicKeywords.length)
                ? _piEntry.topicKeywords.slice()
                : [];
            // project_index에 신호가 없으면 기존 프로파일 keywords를 참고 (이미 학습된 것 유지)
            if (!_piKws.length) {
                var _oldProf = _getStore()[_myKey];
                _piKws = (_oldProf && _oldProf.keywords) ? _oldProf.keywords.slice() : [];
            }
            if (_piKws.length) {
                mailSignalLine = '\n\n※ 참고: 실제 수신된 메일에서 이 프로젝트와 연관되어 관찰된 키워드 (mail 신호, Drive 누적):\n' +
                    _piKws.join(', ') + '\n위 키워드를 keywords 생성 시 참고하되, 간트 업무 목록이 우선입니다.';
            }
        } catch(_piE) { console.warn('[토픽 프로파일] mail 신호 조회 실패 (무시):', _piE); }

        // ④ 프롬프트 조립 — 전체 업무(식별자용) + 최근 90일 업무(현 단계용) 분리
        var recentLabel = recentTaskNames.length
            ? '【최근 ' + _RECENT_DAYS + '일 이내 업무 — 현재 단계 파악용 (' + recentTaskNames.length + '개)】\n' +
              recentTaskNames.map(function(n) { return '- ' + n; }).join('\n')
            : '(최근 ' + _RECENT_DAYS + '일 이내 업무 없음 — 전체 목록으로 단계 추정)';

        var prompt = metaLine +
            '아래는 제품 개발 프로젝트 간트차트의 업무 목록입니다.\n\n' +
            '⚠️ 중요 지시사항:\n' +
            '① keywords에는 "이 프로젝트를 다른 하드웨어 개발 프로젝트와 구분하는 고유 식별자"를 우선 포함해 주세요.\n' +
            '   → 모델명(STELLAR32 등), 고객사명, 공급사·협력사명, 부품 코드, 특정 테스트 표준, 프로젝트 고유 약어 등\n' +
            '   → "RFQ, PROTO, TOOLING, DESIGN, SPEC, MP, EMC, 신뢰성" 같이 모든 하드웨어 프로젝트에 공통인\n' +
            '     일반 용어는 keywords에서 제외하세요 (→ topics에는 써도 됩니다).\n' +
            '② current_phase는 【최근 ' + _RECENT_DAYS + '일 이내 업무】 섹션을 기준으로 현재 어느 단계인지 서술해 주세요.\n' +
            '③ distinguishers에는 수신 메일에서 이 프로젝트임을 판별하는 구체적 단서를 적어주세요.\n\n' +
            '【전체 업무 목록 — 고유 식별자·키워드 추출용 (' + taskNames.length + '개)】\n' +
            taskNames.map(function(n, i) { return (i+1) + '. ' + n; }).join('\n') + '\n\n' +
            recentLabel +
            mailSignalLine + '\n\n' +
            '아래 JSON 형식으로만 반환해 주세요:\n' +
            '{\n' +
            '  "keywords":       ["이 프로젝트 고유 식별자·명칭 (일반 하드웨어 용어 제외) 10~15개"],\n' +
            '  "topics":         ["반복되는 업무 유형·카테고리 4~6가지"],\n' +
            '  "patterns":       ["이 프로젝트의 특이점·패턴 2~3가지"],\n' +
            '  "current_phase":  "현재 개발 단계 한 문장 (최근 ' + _RECENT_DAYS + '일 업무 기준)",\n' +
            '  "distinguishers": ["메일에서 이 프로젝트임을 판별하는 고유 단서 3~5가지"],\n' +
            '  "summary":        "한 문장으로 이 프로젝트를 설명"\n' +
            '}';

        if (window.showToast) window.showToast('🔍 토픽 프로파일 생성 중...', 'info', 20000);

        var result = await window.callAiBackend(apiKey, prompt, { isCancelled: function() { return false; } });
        if (!result || !result.ok) {
            if (window.showToast) window.showToast('❌ 토픽 프로파일 생성 실패', 'error');
            return null;
        }

        var text = (result.data && result.data.result &&
                    result.data.result.candidates && result.data.result.candidates[0] &&
                    result.data.result.candidates[0].content &&
                    result.data.result.candidates[0].content.parts &&
                    result.data.result.candidates[0].content.parts[0].text) || '';

        var profile = null;
        try {
            var m = text.match(/\{[\s\S]*\}/);
            if (m) profile = JSON.parse(m[0]);
        } catch(e) {}

        if (!profile || !profile.keywords) {
            if (window.showToast) window.showToast('❌ AI 응답을 파싱할 수 없습니다', 'error');
            return null;
        }

        profile.ts           = new Date().toISOString();
        profile.taskCount    = taskNames.length;
        // 수집 기간 메타데이터 — 배지·신선도 경고에 사용
        profile.collectedPeriod = {
            recentDays:   _RECENT_DAYS,
            recentCount:  recentTaskNames.length,
            totalCount:   taskNames.length,
            from:         new Date(_recentCutoff).toISOString().slice(0, 10),
            to:           new Date().toISOString().slice(0, 10)
        };

        var store = _getStore();
        store[key] = profile;
        _saveStore(store);

        if (window.showToast) {
            window.showToast('✅ 토픽 프로파일 생성 완료 — 키워드 ' + (profile.keywords || []).length + '개', 'info', 4000);
        }
        console.info('[토픽 프로파일]', profile);

        // 💡 [2026-09-03] 미분류 메일이 쌓여있으면 새 프로파일로 재분석 제안
        //    (자동으로는 재스캔되지 않으므로 사용자에게 직접 제안)
        var unmatchedCount = (window._msResults || []).filter(function(r) { return !r.project; }).length;
        if (unmatchedCount > 0 && typeof window._msBulkReanalyzeUnmatched === 'function') {
            setTimeout(function() {
                if (confirm('토픽 프로파일이 갱신됐습니다.\n현재 미분류 메일 ' + unmatchedCount + '건을 새 프로파일로 재분석할까요?')) {
                    window._msBulkReanalyzeUnmatched();
                }
            }, 600);
        }

        return profile;
    };

    /** 메일 분석기가 열릴 때 프로파일 배지 갱신 (showMailAnalyzer에서 호출) */
    window._refreshTopicProfileBadge = function() {
        var badge = document.getElementById('topic-profile-badge');
        if (!badge) return;
        var profile = window._getTopicProfile();
        if (profile && profile.ts) {
            var d    = new Date(profile.ts);
            var ageMin  = Math.round((Date.now() - d) / 60000);
            var ageDays = Math.round(ageMin / 1440);
            var ageLabel = ageMin < 60  ? ageMin + '분 전'
                         : ageMin < 1440 ? Math.round(ageMin / 60) + '시간 전'
                         :                 ageDays + '일 전';

            // 수집 기간 메타 (구버전 프로파일엔 없을 수 있음)
            var cp = profile.collectedPeriod;
            var periodLabel = cp
                ? ' · 최근 ' + cp.recentDays + '일/' + cp.recentCount + '건 + 전체 ' + cp.totalCount + '건'
                : (profile.taskCount ? ' · ' + profile.taskCount + '개 업무' : '');

            // 신선도 경고: 30일 초과 시 ⚠️
            var stale = ageDays >= 30;
            badge.innerHTML = (stale ? '⚠️ ' : '✅ ') + ageLabel + '에 생성됨' + periodLabel;
            badge.style.color = stale ? '#a85d0a' : '#1f6a3a';
            badge.title = stale
                ? '프로파일이 ' + ageDays + '일 지났습니다. 재생성을 권장합니다.'
                : '생성: ' + d.toLocaleDateString() + (cp ? ' (최근 ' + cp.recentDays + '일 업무 기준)' : '');
        } else {
            badge.textContent = '⚪ 프로파일 없음';
            badge.style.color = '#aaa';
        }
    };

    // ── 토픽 프로파일 뷰어 모달 ─────────────────────────────────────────────────
    window._showTopicProfileViewer = async function() {
        var existing = document.getElementById('tp-viewer-overlay');
        if (existing) { existing.remove(); return; }

        var overlay = document.createElement('div');
        overlay.id = 'tp-viewer-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99997;display:flex;align-items:center;justify-content:center;';
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;border:1.5px solid #a5c8f0;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.18);' +
            'width:520px;max-width:96vw;max-height:82vh;display:flex;flex-direction:column;font-family:\'Malgun Gothic\',sans-serif;overflow:hidden;';
        overlay.appendChild(box);

        // ── 헤더 ──
        var hdr = document.createElement('div');
        hdr.style.cssText = 'background:#e7f3ff;color:#1971c2;padding:13px 18px;font-size:14px;font-weight:bold;border-bottom:1px solid #a5c8f0;' +
            'border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px;flex-shrink:0;';
        hdr.innerHTML = '<span style="flex:1;">📊 토픽 프로파일 뷰어</span>';
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;font-size:16px;cursor:pointer;color:#888;padding:0 4px;';
        closeBtn.onclick = function() { overlay.remove(); };
        hdr.appendChild(closeBtn);
        box.appendChild(hdr);

        // ── 스크롤 영역 ──
        var body = document.createElement('div');
        body.style.cssText = 'flex:1;overflow-y:auto;padding:16px 18px;';
        box.appendChild(body);

        // 모든 프로젝트 프로파일 로드
        var store = _getStore();
        var keys = Object.keys(store);

        // project_index에서 이름 매핑 시도
        var nameMap = {};
        try {
            var pi = await window._msLoadProjectIndex();
            if (pi && pi.projects) {
                pi.projects.forEach(function(p) {
                    if (p.drive_file_id) nameMap[p.drive_file_id] = (p.model || p.customer || p.file_name || p.drive_file_id);
                });
            }
        } catch(e) {}

        if (!keys.length) {
            body.innerHTML = '<div style="text-align:center;padding:30px;color:#888;font-size:13px;">⚪ 저장된 토픽 프로파일이 없습니다.<br><br>' +
                '<button onclick="window._generateTopicProfile && window._generateTopicProfile()" ' +
                'style="padding:8px 18px;background:#eaf7ea;color:#1f6a3a;border:1px solid #a8dab8;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;">📊 현재 프로젝트 프로파일 생성</button></div>';
            document.body.appendChild(overlay);
            return;
        }

        var curKey = _currentKey();
        // 현재 프로젝트를 맨 위로
        keys.sort(function(a, b) {
            if (a === curKey) return -1;
            if (b === curKey) return 1;
            return 0;
        });

        var html = '';
        keys.forEach(function(k) {
            var p = store[k];
            if (!p) return;
            var isCur = k === curKey;
            var projName = nameMap[k] || k;
            var d = p.ts ? new Date(p.ts) : null;
            var ago = d ? (function() {
                var min = Math.round((Date.now() - d) / 60000);
                return min < 60 ? min + '분 전' : min < 1440 ? Math.round(min/60) + '시간 전' : Math.round(min/1440) + '일 전';
            })() : '';
            var kwChips = (p.keywords || []).map(function(kw) {
                return '<span style="display:inline-block;padding:2px 8px;margin:2px 2px 2px 0;background:#e8f4fd;color:#1a4f7a;border-radius:10px;font-size:11.5px;">' + kw + '</span>';
            }).join('');
            var topics = (p.topics || []).map(function(t) {
                return '<span style="display:block;font-size:12px;color:#333;padding:2px 0;">• ' + t + '</span>';
            }).join('');
            var patterns = (p.patterns || []).map(function(t) {
                return '<span style="display:block;font-size:11.5px;color:#666;padding:2px 0;">↳ ' + t + '</span>';
            }).join('');

            html += '<div style="border:' + (isCur ? '2px solid #1971c2' : '1px solid #dee2e6') + ';border-radius:10px;padding:12px 14px;margin-bottom:12px;background:' + (isCur ? '#f0f8ff' : '#fafafa') + ';">' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                  '<span style="font-size:13px;font-weight:bold;color:' + (isCur ? '#1971c2' : '#333') + ';flex:1;">' + (isCur ? '🔵 ' : '') + projName + '</span>' +
                  (isCur ? '<button onclick="window._clearTopicProfile();document.getElementById(\'tp-viewer-overlay\').remove();window._refreshTopicProfileBadge();" title="이 프로파일 삭제" style="padding:2px 8px;font-size:11px;color:#e03131;background:#fff5f5;border:1px solid #f5c6cb;border-radius:6px;cursor:pointer;">🗑 삭제</button>' : '') +
                  '<span style="font-size:10px;color:#aaa;">' + (ago ? ago + ' 생성' : '') + (p.taskCount ? ' · ' + p.taskCount + '개 업무' : '') + '</span>' +
                '</div>' +
                (p.summary ? '<div style="font-size:12px;color:#2c5f8a;background:#e7f3ff;padding:6px 10px;border-radius:6px;margin-bottom:8px;">' + p.summary + '</div>' : '') +
                (kwChips ? '<div style="margin-bottom:6px;"><div style="font-size:11px;color:#888;margin-bottom:3px;">🔑 키워드</div>' + kwChips + '</div>' : '') +
                (topics ? '<div style="margin-bottom:4px;"><div style="font-size:11px;color:#888;margin-bottom:2px;">📂 업무 유형</div>' + topics + '</div>' : '') +
                (patterns ? '<div><div style="font-size:11px;color:#888;margin-bottom:2px;">💡 패턴</div>' + patterns + '</div>' : '') +
                '</div>';
        });
        body.innerHTML = html;
        document.body.appendChild(overlay);
    };

    // ── 메일 매칭 신호 → project_index.json 실시간 갱신 ────────────────────────
    // 메일이 Project X에 배치될 때마다 키워드를 Drive에 기록 → PC꺼도 소멸 없음.
    // 다른 사용자가 project_index 읽으면 즉시 반영 (project_index.json은 공유 Drive 파일).
    var _tpSignalBuffer = {};   // { driveFileId: Set<keyword> }
    var _tpSignalTimer  = null;

    // 메일 업무명·제목에서 의미 있는 단어 추출 (AI 없음, 결정론적)
    function _tpExtractMailKw(task, mailRaw) {
        var kws = [];
        var push = function(str) {
            String(str || '').replace(/[<>【】\[\]\(\)「」『』\/\\|,;:]/g, ' ')
                .split(/\s+/).forEach(function(w) {
                    w = w.trim();
                    // 숫자만·1글자·불용어 제외
                    if (w.length >= 2 && !/^\d+$/.test(w)) kws.push(w);
                });
        };
        push(task && task['업무명']);
        push(mailRaw && mailRaw.subject);
        return Array.from(new Set(kws)).slice(0, 8);
    }

    window._tpAppendMailSignal = function(driveFileId, task, mailRaw) {
        if (!driveFileId) return;
        var kws = _tpExtractMailKw(task, mailRaw);
        if (!kws.length) return;
        _tpSignalBuffer[driveFileId] = _tpSignalBuffer[driveFileId] || new Set();
        kws.forEach(function(k) { _tpSignalBuffer[driveFileId].add(k); });
        // localStorage 즉시 갱신 — 현재 세션에서 바로 효과
        try {
            var store = JSON.parse(localStorage.getItem('gantt_topic_profile_v1')) || {};
            if (store[driveFileId]) {
                var m = new Set(store[driveFileId].keywords || []);
                kws.forEach(function(k) { m.add(k); });
                store[driveFileId].keywords = Array.from(m).slice(0, 15);
                localStorage.setItem('gantt_topic_profile_v1', JSON.stringify(store));
            }
        } catch(e) {}
        // Drive 갱신 디바운스 30초 — 메일마다 Drive 호출하지 않고 묶어서 처리
        clearTimeout(_tpSignalTimer);
        _tpSignalTimer = setTimeout(_tpFlushSignals, 30000);
    };

    async function _tpFlushSignals() {
        var buf = _tpSignalBuffer;
        _tpSignalBuffer = {};
        var fids = Object.keys(buf);
        if (!fids.length) return;
        try {
            var tokenObj = gapi.client.getToken && gapi.client.getToken();
            var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return;
            var indexFileId = await window.findProjectIndexFile(token);
            if (!indexFileId) return;
            var res = await fetch('https://www.googleapis.com/drive/v3/files/' + indexFileId +
                '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
            var indexData = await res.json();
            if (!indexData || !Array.isArray(indexData.projects)) return;
            var changed = false;
            fids.forEach(function(fid) {
                var entry = indexData.projects.find(function(p) { return p.drive_file_id === fid; });
                if (!entry) return;
                var merged = new Set(entry.topicKeywords || []);
                buf[fid].forEach(function(k) { merged.add(k); });
                entry.topicKeywords = Array.from(merged).slice(0, 15);
                changed = true;
            });
            if (!changed) return;
            await fetch('https://www.googleapis.com/upload/drive/v3/files/' + indexFileId +
                '?uploadType=media&supportsAllDrives=true', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify(indexData)
            });
            if (window._invalidatePiModalCache) window._invalidatePiModalCache();
            var totalKw = fids.reduce(function(s, f) { return s + buf[f].size; }, 0);
            console.log('[토픽 신호] project_index.json 갱신 완료:', fids.length + '개 프로젝트, ' + totalKw + '개 키워드');
        } catch(e) { console.warn('[토픽 신호] project_index 갱신 실패:', e); }
    }

    // ── A: 현재 프로젝트 AI 업무 추가 시 자동 프로파일 갱신 ─────────────────────
    // AI가 등록한 업무가 5개 이상 새로 추가될 때마다 프로파일 백그라운드 재생성
    window._tpCheckAutoRegen = function() {
        if (!window._generateTopicProfile || !window.globalData) return;
        var aiCount = (window.globalData || []).filter(function(r) { return r && r._aiRegistered; }).length;
        var lastCount = window._tpLastRegenCount || 0;
        if (aiCount < lastCount + 5) return;  // 아직 +5개 미만
        window._tpLastRegenCount = aiCount;
        setTimeout(function() {
            var apiKey = window.getActiveAiKey && window.getActiveAiKey();
            if (!apiKey) return;
            console.log('[토픽 자동갱신] AI 업무 ' + aiCount + '개 증가 → 프로파일 재생성');
            window._generateTopicProfile().then(function(prof) {
                if (prof && window.currentDriveFileId && window.saveToGoogleDrive) {
                    window.saveToGoogleDrive({ suppressAlert: true });
                }
            }).catch(function(e) { console.warn('[토픽 자동갱신] 실패', e); });
        }, 5000); // 5초 딜레이 (렌더링 먼저 완료 후)
    };

    // ── 토픽 프로파일을 getSystemPrompt에 자동 주입 ───────────────────────────
    // getSystemPrompt가 이미 정의된 뒤에 래핑 (04a-core-app-globals.js가 먼저 로드됨)
    (function() {
        var _orig = window.getSystemPrompt;
        if (typeof _orig !== 'function') return; // 아직 없으면 스킵 (DOMContentLoaded 후 재시도)
        window.getSystemPrompt = function(assignee, customer, model, inch, mailText, mailDate) {
            var base = _orig.call(this, assignee, customer, model, inch, mailText, mailDate);
            var snippet = window._topicProfileSnippet ? window._topicProfileSnippet() : '';
            if (!snippet) return base;
            // 💡 [버그 수정] 이전엔 base 맨 끝에 붙여서 메일 본문 이후(97% 위치)에 삽입됐음.
            //    AI가 이미 JSON 형식을 준비한 후 컨텍스트를 보게 되는 문제 발생.
            //    → '\n이메일:' 마커를 찾아 메일 본문 바로 앞(시스템 컨텍스트 구역)에 주입.
            //    마커를 못 찾으면 기존 방식(맨 끝 추가)으로 폴백.
            var marker = '\n이메일:';
            var idx = base.lastIndexOf(marker);
            if (idx === -1) return base + '\n\n' + snippet;
            return base.substring(0, idx) + '\n\n' + snippet + base.substring(idx);
        };
    })();
})();
