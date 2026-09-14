/* ================================================================
   29-new-project-cluster-detect.js
   [Phase 9] 완전 미분류(근접 후보조차 없는) 메일 군집 감지 → 신규(파생) 프로젝트 생성 제안
   ================================================================
   · 27-topic-contamination.js가 이미 "근접 후보(모델명/키워드가 실제로 등장)가 있는" 미분류
     메일을 그 근접 프로젝트의 학습 로그(no_match)로 기록하고 있다 — 이 파일은 정반대 경우,
     즉 근접 후보가 하나도 없는(=정말 시스템에 등록 안 된 신규 건일 가능성이 있는) 미분류
     메일만 다룬다.
   · 그런 메일을 (업무명 기반) 결정론적 키로 군집화해서 Drive(project_index.json의
     unmatchedClusters)에 팀 전체 공유로 누적한다 — AI 호출 없음, 30초 디바운스.
   · 한 군집이 임계치(10건)를 넘으면 그제서야 AI에게 "신규 파생 프로젝트로 보이는지"
     1회만 확인시킨다(군집당 1회, 건당이 아님 — 무료 API 절약).
   · 실제 Drive 프로젝트 파일 생성은 이 파일이 스스로 하지 않는다 — 메일서버 탭 상단 배너의
     [새 프로젝트 만들기] 버튼을 사람이 눌러 기존 28-new-project-wizard.js의
     _npwOpen(prefill, 'MP(EC)') 마법사를 직접 검토·완료해야만 이뤄진다. 잘못된 프로젝트를
     자동 생성하면 되돌리기 비용이 다른 자동화(재분석/프로파일 캐시)보다 훨씬 크기 때문.
   ------------------------------------------------------------------
   · window._ncdRecordCandidate(task)     완전 미분류 메일 1건을 군집 버퍼에 기록
   · window._ncdCheckAndSuggest()         임계치 넘은 군집을 AI로 재확인 후 배너 갱신
   · window._ncdRenderBanner(clusters)    메일서버 탭 상단 배너 다시 그리기
   · window._ncdOpenWizardForCluster(key) 제안 수락 → 새 프로젝트 마법사 열기
   · window._ncdDismissCluster(key)       제안 기각(다시 안 뜨게)
*/
(function() {
    var _NCD_THRESHOLD       = 10;    // 같은 군집으로 묶이는 미분류 메일 건수 기준
    var _NCD_FLUSH_DELAY_MS  = 30000; // project_index.json 갱신 디바운스 (토픽 신호와 동일 관례)

    var _buffer = {}; // { key: { count, samples:[{subject,snippet,date}], lastSeen } }
    var _flushTimer = null;

    // ── ① 결정론적 키워드 추출 (AI 호출 없음) ───────────────────────────
    var _GENERIC_WORDS = ['확인','요청','검토','회신','안내','공유','승인원','견적','문의','회의','자료','작업','일정','보고','완료','진행','참고','송부','제출'];
    function _normalize(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, ''); }
    /** 단어가 "모델명/코드처럼 특이해 보이는지" 점수화 — 높을수록 군집 키로 적합 */
    function _specificity(w) {
        var hasDigit = /\d/.test(w), hasAlpha = /[A-Za-z]/.test(w);
        var score = w.length;
        if (hasDigit && hasAlpha) score += 10;                       // 영숫자 혼합(모델명/코드 패턴) 우대
        if (/^[A-Za-z0-9\-]+$/.test(w) && w.length >= 4) score += 5; // 순수 영숫자 코드 패턴
        if (_GENERIC_WORDS.indexOf(w) !== -1) score -= 100;
        if (window._tpIsGenericKeyword && window._tpIsGenericKeyword(w)) score -= 100; // Phase6 범용 WBS 용어 재사용
        return score;
    }
    /** task(AI 파싱 결과)의 업무명에서 가장 특이한 단어 하나를 군집 키로 뽑는다. 없으면 null. */
    function _extractKey(task) {
        var words = [];
        String((task && task['업무명']) || '').replace(/[<>【】\[\]\(\)「」『』\/\\|,;:]/g, ' ').split(/\s+/).forEach(function(w) {
            w = w.trim();
            if (w.length >= 3 && !/^\d+$/.test(w)) words.push(w);
        });
        if (!words.length) return null;
        words.sort(function(a, b) { return _specificity(b) - _specificity(a); });
        var best = words[0];
        return _specificity(best) > 0 ? _normalize(best) : null;
    }

    // ── ② 버퍼 기록 + Drive 디바운스 flush (js/26-topic-profile.js _tpFlushSignals와 동일 패턴) ──
    window._ncdRecordCandidate = function(task) {
        var key = _extractKey(task);
        if (!key) return; // 특이 키워드가 없으면 군집화 불가 — 조용히 스킵
        var b = _buffer[key] || (_buffer[key] = { count: 0, samples: [] });
        b.count++;
        if (b.samples.length < 10) {
            var snippet = (task['_aiMeta'] && task['_aiMeta'].snippet) || task['상세내용'] || '';
            b.samples.push({ subject: String(task['업무명'] || '').slice(0, 80), snippet: String(snippet).slice(0, 150), date: task['시작일'] || '' });
        }
        b.lastSeen = new Date().toISOString();
        clearTimeout(_flushTimer);
        _flushTimer = setTimeout(_flush, _NCD_FLUSH_DELAY_MS);
    };

    async function _flush() {
        var buf = _buffer; _buffer = {};
        var keys = Object.keys(buf);
        if (!keys.length) return;
        try {
            var tokenObj = gapi.client.getToken && gapi.client.getToken();
            var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return;
            var indexFileId = await window.findProjectIndexFile(token);
            if (!indexFileId) return;
            var res = await fetch('https://www.googleapis.com/drive/v3/files/' + indexFileId + '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
            var indexData = await res.json();
            if (!indexData) return;
            indexData.unmatchedClusters = indexData.unmatchedClusters || [];
            keys.forEach(function(key) {
                var incoming = buf[key];
                var entry = indexData.unmatchedClusters.find(function(c) { return c.key === key; });
                if (!entry) {
                    entry = { key: key, count: 0, samples: [], status: 'pending', firstSeen: new Date().toISOString() };
                    indexData.unmatchedClusters.push(entry);
                }
                if (entry.status === 'created') return; // 이미 프로젝트로 만들어졌으면 더 안 쌓음
                entry.count = (entry.count || 0) + incoming.count;
                entry.samples = (entry.samples || []).concat(incoming.samples).slice(-10);
                entry.lastSeen = incoming.lastSeen;
            });
            await fetch('https://www.googleapis.com/upload/drive/v3/files/' + indexFileId + '?uploadType=media&supportsAllDrives=true', {
                method: 'PATCH', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(indexData)
            });
            if (window._invalidatePiModalCache) window._invalidatePiModalCache();
            console.log('[신규프로젝트감지] project_index.json 갱신 완료:', keys.length + '개 군집');
            window._ncdCheckAndSuggest();
        } catch (e) { console.warn('[신규프로젝트감지] 버퍼 flush 실패(무시):', e); }
    }

    // ── ③ 임계치 확인 + AI 재확인 (군집당 1회만 — 판정 후엔 재판정 안 함) ─────
    window._ncdCheckAndSuggest = async function() {
        try {
            var tokenObj = gapi.client.getToken && gapi.client.getToken();
            var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return;
            var indexFileId = await window.findProjectIndexFile(token);
            if (!indexFileId) return;
            var res = await fetch('https://www.googleapis.com/drive/v3/files/' + indexFileId + '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
            var indexData = await res.json();
            var clusters = (indexData && indexData.unmatchedClusters) || [];
            var pending = clusters.filter(function(c) { return c.count >= _NCD_THRESHOLD && c.status === 'pending'; });
            if (!pending.length) { window._ncdRenderBanner(clusters); return; }

            var apiKey = window.getActiveAiKey && window.getActiveAiKey();
            if (!apiKey) { window._ncdRenderBanner(clusters); return; } // 키 없으면 판정만 보류, 다음 기회에 재시도

            for (var i = 0; i < pending.length; i++) {
                var cluster = pending[i];
                var verdict = await _judgeCluster(cluster, apiKey);
                cluster.aiVerdict = verdict;
                // 💡 [알려진 한계] 한 번 'reviewed_no'로 판정되면 이후 count가 더 늘어도 재판정하지 않는다
                //    (군집당 무한 재판정으로 인한 토큰 낭비 방지). 필요하면 나중에 "count가 2배 이상 늘면
                //    재판정" 같은 조건을 추가할 수 있다.
                cluster.status = (verdict && verdict.looksNewProject && verdict.confidence !== '하') ? 'suggested' : 'reviewed_no';
                cluster.judgedAt = new Date().toISOString();
            }
            await fetch('https://www.googleapis.com/upload/drive/v3/files/' + indexFileId + '?uploadType=media&supportsAllDrives=true', {
                method: 'PATCH', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(indexData)
            });
            if (window._invalidatePiModalCache) window._invalidatePiModalCache();
            window._ncdRenderBanner(clusters);
        } catch (e) { console.warn('[신규프로젝트감지] 판정 실패(무시):', e); }
    };

    async function _judgeCluster(cluster, apiKey) {
        var samples = (cluster.samples || []).slice(0, 10);
        var prompt = [
            '아래는 지금까지 등록된 어떤 프로젝트와도 관련이 없다고(미분류) 판단된 메일 ' + cluster.count + '건 중 최근 샘플입니다.',
            '이 메일들이 "아직 간트차트에 등록되지 않은 새로운 하드웨어 개발 프로젝트(또는 기존 프로젝트의 파생/EC 모델)" 하나를 공통으로 가리키는지 판단해 주세요.',
            '단순히 같은 부서·같은 발신자라서 우연히 섞인 잡다한 문의일 수도 있으니 신중하게 판단하세요.',
            '',
            '[군집 추정 키워드] ' + cluster.key,
            '',
            '[메일 샘플]',
            samples.map(function(s, i) { return (i + 1) + '. 업무명: ' + s.subject + (s.snippet ? ('\n   내용: ' + s.snippet) : ''); }).join('\n'),
            '',
            '아래 JSON 형식으로만 응답하세요:',
            '{',
            '  "looksNewProject": true 또는 false,',
            '  "confidence": "상/중/하",',
            '  "reason": "판단 이유 한 문장",',
            '  "customer": "고객사 추정 (불확실하면 빈 값)",',
            '  "model": "모델명 추정 (불확실하면 빈 값)",',
            '  "summary": "이 프로젝트로 추정되는 것에 대한 한 문장 요약"',
            '}'
        ].join('\n');
        try {
            var result = await window.callAiBackend(apiKey, prompt, { isCancelled: function() { return false; } });
            if (!result || !result.ok) return null;
            var text = (result.data && result.data.result && result.data.result.candidates &&
                        result.data.result.candidates[0] && result.data.result.candidates[0].content &&
                        result.data.result.candidates[0].content.parts && result.data.result.candidates[0].content.parts[0].text) || '';
            var m = text.match(/\{[\s\S]*\}/);
            return m ? JSON.parse(m[0]) : null;
        } catch (e) { console.warn('[신규프로젝트감지] AI 판정 실패:', cluster.key, e); return null; }
    }

    // ── ④ 배너 렌더 (메일서버 탭 상단 #ncd-suggestion-banner) ───────────────
    window._ncdRenderBanner = function(clusters) {
        var el = document.getElementById('ncd-suggestion-banner');
        if (!el) return;
        var suggested = (clusters || []).filter(function(c) { return c.status === 'suggested'; });
        if (!suggested.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
        var _en = window._currentLang === 'en';
        el.style.cssText = 'display:block; margin-bottom:10px; padding:10px 12px; background:#eaf7ea; border:1px solid #a8dab8; border-radius:6px; font-size:11.5px; color:#1f6a3a;';
        el.innerHTML = suggested.map(function(c) {
            var v = c.aiVerdict || {};
            var safeKey = String(c.key).replace(/'/g, '');
            var label = v.summary || c.key;
            var countLabel = _en ? (c.count + ' unclassified mail(s)') : ('미분류 메일 ' + c.count + '건');
            return '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px; flex-wrap:wrap;">' +
                '<span>🆕 <b>' + label + '</b> — ' + countLabel + '</span>' +
                '<span style="display:flex; gap:4px; flex-shrink:0;">' +
                    '<button onclick="window._ncdOpenWizardForCluster(\'' + safeKey + '\')" style="padding:3px 10px; background:#28a745; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">' + (_en ? 'Create project' : '새 프로젝트 만들기') + '</button>' +
                    '<button onclick="window._ncdDismissCluster(\'' + safeKey + '\')" style="padding:3px 10px; background:#f8f9fa; color:#888; border:1px solid #dee2e6; border-radius:4px; font-size:11px; cursor:pointer;">' + (_en ? 'Dismiss' : '무시') + '</button>' +
                '</span>' +
            '</div>';
        }).join('');
    };

    // ── ⑤ 제안 수락 — 새 프로젝트 마법사 열기 (실제 Drive 파일 생성은 사람이 마법사에서 완료) ──
    window._ncdOpenWizardForCluster = async function(key) {
        try {
            var tokenObj = gapi.client.getToken && gapi.client.getToken();
            var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            var indexFileId = token && await window.findProjectIndexFile(token);
            var indexData = null;
            if (indexFileId) {
                var res = await fetch('https://www.googleapis.com/drive/v3/files/' + indexFileId + '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
                indexData = await res.json();
            }
            var cluster = indexData && (indexData.unmatchedClusters || []).find(function(c) { return c.key === key; });
            var v = (cluster && cluster.aiVerdict) || {};
            var prefill = { customer: v.customer || '', model: v.model || '', keywords: [cluster ? cluster.key : key] };
            if (cluster && indexFileId) {
                cluster.status = 'created';
                cluster.createdAt = new Date().toISOString();
                await fetch('https://www.googleapis.com/upload/drive/v3/files/' + indexFileId + '?uploadType=media&supportsAllDrives=true', {
                    method: 'PATCH', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(indexData)
                });
                if (window._invalidatePiModalCache) window._invalidatePiModalCache();
            }
            if (window._openAsNewSheet) window._openAsNewSheet('new_' + Date.now(), null, null);
            if (window._resetToBlankNoConfirm) window._resetToBlankNoConfirm(true);
            if (window._npwOpen) window._npwOpen(prefill, 'MP(EC)');
            var banner = document.getElementById('ncd-suggestion-banner');
            if (banner) banner.style.display = 'none';
        } catch (e) {
            console.warn('[신규프로젝트감지] 마법사 열기 실패:', e);
            if (window._npwOpen) window._npwOpen({}, 'MP(EC)');
        }
    };

    // ── ⑥ 제안 기각 — 다시 안 뜨게 상태만 표시(군집 자체는 삭제하지 않음, 이력 보존) ──
    window._ncdDismissCluster = async function(key) {
        try {
            var tokenObj = gapi.client.getToken && gapi.client.getToken();
            var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return;
            var indexFileId = await window.findProjectIndexFile(token);
            if (!indexFileId) return;
            var res = await fetch('https://www.googleapis.com/drive/v3/files/' + indexFileId + '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
            var indexData = await res.json();
            var cluster = indexData && (indexData.unmatchedClusters || []).find(function(c) { return c.key === key; });
            if (!cluster) return;
            cluster.status = 'dismissed';
            cluster.dismissedAt = new Date().toISOString();
            await fetch('https://www.googleapis.com/upload/drive/v3/files/' + indexFileId + '?uploadType=media&supportsAllDrives=true', {
                method: 'PATCH', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(indexData)
            });
            if (window._invalidatePiModalCache) window._invalidatePiModalCache();
            window._ncdRenderBanner(indexData.unmatchedClusters);
            if (window.showToast) window.showToast(window._t('군집 제안을 무시했습니다', 'Dismissed the suggestion'), 'info', 2500);
        } catch (e) { console.warn('[신규프로젝트감지] 무시 처리 실패:', e); }
    };

    // ── ⑦ 훅 A: _msResolveAiProjectMatch가 "근접 후보조차 없는" 완전 미분류를 반환할 때 기록 ──
    //    27-topic-contamination.js가 이미 "근접 후보 있는" 경우를 학습 로그에 기록하므로,
    //    이 파일은 그 반대(근접 후보가 하나도 없는) 경우만 다룬다 — 근접 후보 판정 로직은
    //    27번 파일의 것과 동일한 문자열 포함 검사를 그대로 재사용(파일 간 결합을 늘리지 않기 위해
    //    이 파일 안에서 다시 계산 — 가벼운 연산이라 중복 비용은 무시할 만함).
    (function() {
        var _origResolve = window._msResolveAiProjectMatch;
        if (typeof _origResolve !== 'function') return;
        window._msResolveAiProjectMatch = function(task, candidatesForAI) {
            var result = _origResolve.call(this, task, candidatesForAI);
            if (!result && task && (task['매칭근거'] || task['업무명'])) {
                var snippet = (task['_aiMeta'] && task['_aiMeta'].snippet) || task['상세내용'] || '';
                var snippetLow = String(snippet).toLowerCase();
                var hasNearCandidate = (candidatesForAI || []).some(function(c) {
                    var frags = (c.model || '').toLowerCase().split(/[\s\-_\/]+/).filter(function(f) { return f.length >= 3; });
                    var kws = (c.keywords || []).map(function(k) { return String(k).toLowerCase().trim(); });
                    return frags.some(function(f) { return snippetLow.includes(f); }) ||
                           kws.some(function(k) { return k.length >= 3 && snippetLow.includes(k); });
                });
                if (!hasNearCandidate) window._ncdRecordCandidate(task);
            }
            return result;
        };
    })();

    // ── 훅 B: 메일서버 탭(AI 업무 분석 모달)이 열릴 때마다 최신 배너 반영 ───────
    //    다른 팀원 세션이 이미 임계치를 넘겨 Drive에 'suggested'로 표시해둔 군집도 보이게 함.
    (function() {
        var _origShow = window.showMailAnalyzer;
        if (typeof _origShow !== 'function') return;
        window.showMailAnalyzer = function() {
            _origShow.apply(this, arguments);
            setTimeout(function() { window._ncdCheckAndSuggest(); }, 100);
        };
    })();
})();
