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
        return window.currentDriveFileName || window.currentDriveFileId || '';
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

    // ── 토픽 프로파일을 getSystemPrompt에 자동 주입 ───────────────────────────
    // getSystemPrompt가 이미 정의된 뒤에 래핑 (04a-core-app-globals.js가 먼저 로드됨)
    (function() {
        var _orig = window.getSystemPrompt;
        if (typeof _orig !== 'function') return; // 아직 없으면 스킵 (DOMContentLoaded 후 재시도)
        window.getSystemPrompt = function(assignee, customer, model, inch, mailText, mailDate) {
            var base = _orig.call(this, assignee, customer, model, inch, mailText, mailDate);
            var snippet = window._topicProfileSnippet ? window._topicProfileSnippet() : '';
            if (!snippet) return base;
            // 프롬프트의 메일 본문 삽입 구역 바로 앞에 토픽 프로파일 주입
            return base + '\n\n' + snippet;
        };
    })();
})();
