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
        var kw      = (profile.keywords || []).slice(0, 12).join(', ');
        var topics  = (profile.topics   || []).slice(0,  4).join('; ');
        var summary = profile.summary   || '';
        var parts   = [];
        if (summary) parts.push('📌 ' + summary);
        if (kw)      parts.push('🔑 키워드: ' + kw);
        if (topics)  parts.push('📂 주요 업무 유형: ' + topics);
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

        // ① Gantt 업무명 수집 (최대 120개, 중복 제거)
        var seen = {};
        var taskNames = [];
        for (var i = 1; i < globalData.length; i++) {
            var row = globalData[i];
            if (!row) continue;
            var name = row._origT1 || row._origT2 || row._origT3 || row._origT4 || row._origDev || '';
            name = (name || '').replace(/\s*＊AI📧\s*$/, '').trim();
            if (!name || seen[name]) continue;
            seen[name] = true;
            taskNames.push(name);
            if (taskNames.length >= 120) break;
        }
        if (!taskNames.length) { alert('수집할 업무명이 없습니다.'); return null; }

        // ② 프로젝트 메타 요약
        var pm = window.projectMeta || {};
        var metaParts = [];
        if (pm.프로젝트담당자) metaParts.push('PM: ' + pm.프로젝트담당자);
        if (pm.고객사명)       metaParts.push('고객사: ' + pm.고객사명);
        if (pm.모델명)         metaParts.push('모델: ' + pm.모델명);
        var metaLine = metaParts.length ? '프로젝트 정보: ' + metaParts.join(', ') + '\n' : '';

        var prompt = metaLine +
            '아래는 제품 개발 프로젝트 간트차트의 업무 목록입니다.\n' +
            '이 프로젝트를 특징짓는 핵심 정보를 아래 JSON 형식으로만 반환해 주세요.\n\n' +
            '업무 목록(' + taskNames.length + '개):\n' +
            taskNames.map(function(n, i) { return (i+1) + '. ' + n; }).join('\n') + '\n\n' +
            '{\n' +
            '  "keywords": ["이 프로젝트에서 자주 언급될 핵심 단어 12~15개"],\n' +
            '  "topics":   ["반복되는 업무 유형·카테고리 4~6가지"],\n' +
            '  "patterns": ["이 프로젝트의 특이점·패턴 2~3가지"],\n' +
            '  "summary":  "한 문장으로 이 프로젝트를 설명"\n' +
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

        profile.ts        = new Date().toISOString();
        profile.taskCount = taskNames.length;

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
            var d = new Date(profile.ts);
            var ago = Math.round((Date.now() - d) / 60000);
            var label = ago < 60 ? ago + '분 전'
                      : ago < 1440 ? Math.round(ago/60) + '시간 전'
                      : Math.round(ago/1440) + '일 전';
            badge.textContent = '✅ 프로파일 있음 (' + label + ')';
            badge.style.color = '#1f6a3a';
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
