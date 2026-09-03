/* ================================================================
   27-topic-contamination.js
   Phase 8: 토픽 오염 감지 + AI 자가진단
   ================================================================
   · window._tcGetScore(key?)          오염 지수 계산 → {score, level, negCount, totalCount, hiConfNeg}
   · window._tcCheckAndAlert(key?)     지수 체크 → 배지·토스트 갱신 (자동 연동)
   · window._tcRunDiagnosis(key?)      AI 진단 실행 → 결과 모달 표시
   · window._tcGetStats(key?)          현황 통계 반환 (감독용 뷰어)
   · window._tcRefreshBadge(key?)      오염 배지 DOM 갱신

   [연동]
   · _writeLearningEntry 완료 시 자동 _tcCheckAndAlert 호출 (래핑)
   · showMailAnalyzer 호출 시 _tcRefreshBadge 호출 (14a에서 이미 호출)
   · Phase 3 학습 데이터(_alGetEntries) 재사용 — 별도 저장소 없음
*/

(function() {
    'use strict';

    // ── 상수 ──────────────────────────────────────────────────────────────────
    var LOOKBACK_MS    = 30 * 24 * 60 * 60 * 1000; // 30일
    var THRESHOLD_WARN = 0.25;  // 🟡 주의
    var THRESHOLD_CAUTION = 0.40;  // 🟠 경고
    var THRESHOLD_CRIT = 0.55;  // 🔴 위험
    var MIN_SAMPLES    = 3;     // 최소 학습 데이터 수 (미달 시 N/A)

    // ── 프로젝트 키 헬퍼 ──────────────────────────────────────────────────────
    function _key() {
        // Phase 6와 동일: fileId 우선 (fileName 공유 충돌 방지)
        return window.currentDriveFileId || window.currentDriveFileName || '';
    }

    // ── 신뢰도별 가중치 ───────────────────────────────────────────────────────
    function _weight(conf) {
        return conf === '상' ? 2.0 : conf === '중' ? 1.5 : 1.0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    /**
     * 오염 지수 계산
     * @param {string} [key]  프로젝트 키 (생략 시 현재 프로젝트)
     * @returns {{ score:number, level:string, negCount:number, totalCount:number,
     *             hiConfNeg:number, consecutive:number, sampleOk:boolean }}
     */
    window._tcGetScore = function(key) {
        key = key || _key();
        var result = { score: 0, level: 'ok', negCount: 0, totalCount: 0,
                       hiConfNeg: 0, consecutive: 0, sampleOk: false };
        if (!key) return result;

        var entries = (window._alGetEntries && window._alGetEntries(key)) || [];
        if (!entries.length) return result;

        var now = Date.now();
        var cutoff = now - LOOKBACK_MS;

        // 30일 이내 항목만
        var recent = entries.filter(function(e) {
            return e.ts && new Date(e.ts).getTime() >= cutoff;
        });

        result.totalCount = recent.length;
        result.sampleOk   = recent.length >= MIN_SAMPLES;

        // 오매칭(negative_match) 집계
        var weightedNeg = 0;
        var weightedTotal = 0;
        recent.forEach(function(e) {
            var w = _weight(e.confidence);
            weightedTotal += w;
            if (e.type === 'negative_match') {
                weightedNeg += w;
                result.negCount++;
                if (e.confidence === '상') result.hiConfNeg++;
            }
        });

        // 기본 오염율
        var baseScore = weightedTotal > 0 ? weightedNeg / weightedTotal : 0;

        // 고신뢰도 오탐 부스트: AI가 "확실하다"고 한 것이 틀린 경우 — 토픽이 AI를 잘못 확신시킨 신호
        if (result.hiConfNeg >= 2) baseScore = Math.min(1, baseScore + 0.12);

        // 연속 오매칭 패턴 감지 (최근 5건 중 연속 negative_match)
        var last5 = recent.slice(0, 5);
        var streak = 0;
        for (var i = 0; i < last5.length; i++) {
            if (last5[i].type === 'negative_match') streak++;
            else break;
        }
        result.consecutive = streak;
        if (streak >= 3) baseScore = Math.min(1, baseScore + 0.10);

        result.score = Math.round(baseScore * 100) / 100;

        // 레벨 분류
        if (!result.sampleOk) {
            result.level = 'insufficient'; // 데이터 부족
        } else if (result.score < THRESHOLD_WARN) {
            result.level = 'ok';
        } else if (result.score < THRESHOLD_CAUTION) {
            result.level = 'warn';
        } else if (result.score < THRESHOLD_CRIT) {
            result.level = 'caution';
        } else {
            result.level = 'critical';
        }

        return result;
    };

    // ─────────────────────────────────────────────────────────────────────────
    /**
     * 오염 배지 DOM 갱신 (메일 분석기 열릴 때 호출)
     */
    window._tcRefreshBadge = function(key) {
        var badge = document.getElementById('topic-contamination-badge');
        var diagBtn = document.getElementById('topic-diagnosis-btn');
        if (!badge) return;

        key = key || _key();
        var st = window._tcGetScore(key);

        var icon, color, text;
        if (!key) {
            icon = ''; text = ''; color = '#aaa';
        } else if (!st.sampleOk) {
            icon = '⬜'; text = '학습 데이터 부족 (' + st.totalCount + '/' + MIN_SAMPLES + ')'; color = '#aaa';
        } else if (st.level === 'ok') {
            icon = '🟢'; text = '오염 없음 (' + Math.round(st.score * 100) + '%)'; color = '#1f6a3a';
        } else if (st.level === 'warn') {
            icon = '🟡'; text = '주의 — 오염 ' + Math.round(st.score * 100) + '% (오매칭 ' + st.negCount + '건)'; color = '#856404';
        } else if (st.level === 'caution') {
            icon = '🟠'; text = '경고 — 오염 ' + Math.round(st.score * 100) + '% (오매칭 ' + st.negCount + '건)'; color = '#9b4000';
        } else {
            icon = '🔴'; text = '위험 — 오염 ' + Math.round(st.score * 100) + '% (오매칭 ' + st.negCount + '건, 연속 ' + st.consecutive + '건)'; color = '#b91c1c';
        }

        badge.innerHTML = icon + ' ' + text;
        badge.style.color = color;

        // 진단 버튼 노출
        if (diagBtn) {
            var showBtn = st.sampleOk && st.level !== 'ok' && st.level !== 'insufficient';
            diagBtn.style.display = showBtn ? 'inline-block' : 'none';
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    /**
     * 오염 지수 체크 → 임계값 초과 시 토스트 알람
     * _writeLearningEntry 래핑에서 자동 호출
     */
    window._tcCheckAndAlert = function(key) {
        key = key || _key();
        if (!key) return;

        var st = window._tcGetScore(key);
        window._tcRefreshBadge(key);

        if (!st.sampleOk) return;

        if (st.level === 'critical') {
            if (window.showToast) {
                window.showToast(
                    '🔴 토픽 오염 위험 — 최근 오매칭 ' + st.negCount + '건 (연속 ' + st.consecutive + '건). AI 진단을 권장합니다.',
                    'error', 8000
                );
            }
        } else if (st.level === 'caution' && st.consecutive >= 2) {
            if (window.showToast) {
                window.showToast(
                    '🟠 토픽 오염 경고 — 오매칭이 반복되고 있습니다 (' + st.negCount + '건). 메일 분석기에서 AI 진단을 실행해주세요.',
                    'warn', 5000
                );
            }
        } else if (st.level === 'warn' && st.hiConfNeg >= 2) {
            if (window.showToast) {
                window.showToast('🟡 고신뢰도 오매칭 ' + st.hiConfNeg + '건 — 토픽 프로파일 점검을 권장합니다.', 'info', 4000);
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    /**
     * AI 진단 실행 — 현재 토픽 + 오매칭 패턴 → Gemini 분석 → 결과 모달
     */
    window._tcRunDiagnosis = async function(key) {
        key = key || _key();
        if (!key) { alert('프로젝트를 먼저 불러오세요.'); return; }

        var apiKey = window.getActiveAiKey && window.getActiveAiKey();
        if (!apiKey) { alert('AI API 키를 먼저 설정해주세요.'); return; }

        var profile = window._getTopicProfile && window._getTopicProfile(key);
        if (!profile) {
            alert('토픽 프로파일이 없습니다. 먼저 토픽 프로파일을 생성해주세요.'); return;
        }

        var entries = (window._alGetEntries && window._alGetEntries(key)) || [];
        var now = Date.now();
        var negEntries = entries.filter(function(e) {
            return e.type === 'negative_match' &&
                   e.ts && (now - new Date(e.ts).getTime()) < LOOKBACK_MS;
        }).slice(0, 20); // 최대 20건

        if (!negEntries.length) {
            alert('30일 이내 오매칭 기록이 없습니다.'); return;
        }

        var st = window._tcGetScore(key);

        // 프롬프트 구성
        var prompt =
            '당신은 AI 매칭 시스템의 토픽 프로파일 품질 진단 전문가입니다.\n\n' +
            '=== 현재 토픽 프로파일 ===\n' +
            '요약: ' + (profile.summary || '') + '\n' +
            '키워드: ' + (profile.keywords || []).join(', ') + '\n' +
            '업무 유형: ' + (profile.topics || []).join('; ') + '\n\n' +
            '=== 최근 30일 오매칭 리턴 로그 (' + negEntries.length + '건) ===\n' +
            negEntries.map(function(e, i) {
                return (i + 1) + '. 업무명: "' + (e.taskName || '') + '"' +
                    ', AI신뢰도: ' + (e.confidence || '?') +
                    ', 매칭근거: ' + (e.matchBasis || '') +
                    (e.matchKeywords && e.matchKeywords.length ? ', 매칭키워드: [' + e.matchKeywords.join(', ') + ']' : '');
            }).join('\n') + '\n\n' +
            '=== 오염 통계 ===\n' +
            '오염 지수: ' + Math.round(st.score * 100) + '%, 고신뢰도 오탐: ' + st.hiConfNeg + '건, 연속 오매칭: ' + st.consecutive + '건\n\n' +
            '위 패턴을 분석하여 다음 JSON 형식으로만 답해주세요:\n' +
            '{\n' +
            '  "diagnosis": "오탐 원인을 한 문장으로 진단",\n' +
            '  "root_cause": "토픽의 어느 부분이 AI를 잘못 유도했는지 구체적으로",\n' +
            '  "remove_keywords": ["제거해야 할 키워드 목록"],\n' +
            '  "add_keywords": ["보완해야 할 구체적 키워드 목록"],\n' +
            '  "remove_topics": ["제거할 업무 유형"],\n' +
            '  "confidence": "high|medium|low"\n' +
            '}';

        if (window.showToast) window.showToast('🔬 토픽 오염 진단 중...', 'info', 20000);

        var result = await window.callAiBackend(apiKey, prompt, {});
        if (!result || !result.ok) {
            if (window.showToast) window.showToast('❌ AI 진단 실패', 'error');
            return;
        }

        var text = (result.data && result.data.result &&
                    result.data.result.candidates && result.data.result.candidates[0] &&
                    result.data.result.candidates[0].content &&
                    result.data.result.candidates[0].content.parts &&
                    result.data.result.candidates[0].content.parts[0].text) || '';

        var suggestion = null;
        try {
            var m = text.match(/\{[\s\S]*\}/);
            if (m) suggestion = JSON.parse(m[0]);
        } catch(e) {}

        if (!suggestion) {
            if (window.showToast) window.showToast('❌ AI 응답을 파싱할 수 없습니다', 'error');
            return;
        }

        if (window.showToast) window.showToast('🔬 진단 완료', 'info', 2000);
        _showDiagnosisModal(suggestion, profile, key);
    };

    // ─────────────────────────────────────────────────────────────────────────
    /** AI 진단 결과 모달 표시 */
    function _showDiagnosisModal(suggestion, profile, key) {
        var existing = document.getElementById('tc-diagnosis-modal');
        if (existing) existing.remove();

        function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

        var confColor = suggestion.confidence === 'high' ? '#1f6a3a' :
                        suggestion.confidence === 'medium' ? '#856404' : '#b91c1c';
        var confLabel = suggestion.confidence === 'high' ? '높음' :
                        suggestion.confidence === 'medium' ? '보통' : '낮음';

        var remKw = (suggestion.remove_keywords || []).join(', ');
        var addKw = (suggestion.add_keywords    || []).join(', ');
        var remTp = (suggestion.remove_topics   || []).join(', ');

        var modal = document.createElement('div');
        modal.id = 'tc-diagnosis-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:200000;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';

        modal.innerHTML =
            '<div style="background:#fff;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.28);' +
            'max-width:560px;width:95%;max-height:90vh;overflow-y:auto;padding:24px;font-family:\'Malgun Gothic\',sans-serif;">' +

            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
            '<span style="font-size:20px;">🔬</span>' +
            '<h3 style="margin:0;font-size:16px;color:#1a1a2e;">토픽 오염 AI 진단 결과</h3>' +
            '<span style="margin-left:auto;font-size:11px;font-weight:bold;color:' + confColor + ';">진단 신뢰도: ' + confLabel + '</span>' +
            '</div>' +

            '<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;margin-bottom:14px;">' +
            '<div style="font-size:12px;font-weight:bold;color:#5d4037;margin-bottom:4px;">📋 진단 요약</div>' +
            '<div style="font-size:13px;color:#333;line-height:1.6;">' + esc(suggestion.diagnosis) + '</div>' +
            '</div>' +

            '<div style="background:#fce4ec;border:1px solid #f48fb1;border-radius:8px;padding:12px;margin-bottom:14px;">' +
            '<div style="font-size:12px;font-weight:bold;color:#880e4f;margin-bottom:4px;">🔍 오염 원인</div>' +
            '<div style="font-size:12px;color:#444;line-height:1.6;">' + esc(suggestion.root_cause) + '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">' +

            '<div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:8px;padding:10px;">' +
            '<div style="font-size:11px;font-weight:bold;color:#b71c1c;margin-bottom:6px;">❌ 제거할 키워드</div>' +
            '<div style="font-size:12px;color:#333;">' + (remKw || '—') + '</div>' +
            (remTp ? '<div style="font-size:11px;color:#666;margin-top:6px;border-top:1px solid #ef9a9a;padding-top:4px;">업무유형: ' + esc(remTp) + '</div>' : '') +
            '</div>' +

            '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:10px;">' +
            '<div style="font-size:11px;font-weight:bold;color:#1b5e20;margin-bottom:6px;">✅ 추가할 키워드</div>' +
            '<div style="font-size:12px;color:#333;">' + (addKw || '—') + '</div>' +
            '</div>' +

            '</div>' +

            '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button id="tc-diag-reject" style="padding:8px 18px;background:#f1f3f5;color:#495057;border:1px solid #dee2e6;border-radius:6px;font-size:13px;cursor:pointer;">취소</button>' +
            '<button id="tc-diag-apply" style="padding:8px 18px;background:#1971c2;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;">✅ 토픽에 적용</button>' +
            '</div>' +

            '</div>';

        document.body.appendChild(modal);

        document.getElementById('tc-diag-reject').addEventListener('click', function() {
            modal.remove();
        });
        document.getElementById('tc-diag-apply').addEventListener('click', function() {
            window._tcApplyFix(suggestion, profile, key);
            modal.remove();
        });
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.remove();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    /**
     * AI 진단 결과를 현재 토픽 프로파일에 적용
     */
    window._tcApplyFix = function(suggestion, profile, key) {
        key = key || _key();
        if (!key || !suggestion || !profile) return;

        var kw   = (profile.keywords || []).slice();
        var tp   = (profile.topics   || []).slice();

        // 제거
        (suggestion.remove_keywords || []).forEach(function(rk) {
            kw = kw.filter(function(k) { return k.toLowerCase() !== rk.toLowerCase(); });
        });
        (suggestion.remove_topics || []).forEach(function(rt) {
            tp = tp.filter(function(t) { return t.toLowerCase() !== rt.toLowerCase(); });
        });

        // 추가 (중복 방지)
        (suggestion.add_keywords || []).forEach(function(ak) {
            if (!kw.some(function(k) { return k.toLowerCase() === ak.toLowerCase(); })) {
                kw.push(ak);
            }
        });

        profile.keywords = kw;
        profile.topics   = tp;
        profile.ts       = new Date().toISOString();
        profile._diagHistory = profile._diagHistory || [];
        profile._diagHistory.push({
            ts:         profile.ts,
            diagnosis:  suggestion.diagnosis,
            removed_kw: suggestion.remove_keywords || [],
            added_kw:   suggestion.add_keywords    || []
        });

        // Phase 6 저장소에 반영
        try {
            var store = JSON.parse(localStorage.getItem('gantt_topic_profile_v1')) || {};
            store[key] = profile;
            localStorage.setItem('gantt_topic_profile_v1', JSON.stringify(store));
        } catch(e) {}

        if (window.showToast) window.showToast('✅ 토픽 프로파일이 AI 진단 기준으로 갱신됐습니다.', 'info', 4000);
        window._tcRefreshBadge(key);
        if (window._refreshTopicProfileBadge) window._refreshTopicProfileBadge();

        console.info('[Phase 8] 토픽 수정 적용:', {removed: suggestion.remove_keywords, added: suggestion.add_keywords});
    };

    // ─────────────────────────────────────────────────────────────────────────
    /**
     * 현황 통계 반환 (콘솔/감독 뷰어용)
     */
    window._tcGetStats = function(key) {
        key = key || _key();
        var st = window._tcGetScore(key);
        var entries = (window._alGetEntries && window._alGetEntries(key)) || [];
        var now = Date.now();
        var recent = entries.filter(function(e) {
            return e.ts && (now - new Date(e.ts).getTime()) < LOOKBACK_MS;
        });

        // 유형별 분포
        var dist = {};
        recent.forEach(function(e) { dist[e.type] = (dist[e.type] || 0) + 1; });

        return {
            projectKey:   key,
            score:        st.score,
            level:        st.level,
            negCount:     st.negCount,
            totalCount:   st.totalCount,
            hiConfNeg:    st.hiConfNeg,
            consecutive:  st.consecutive,
            sampleOk:     st.sampleOk,
            distribution: dist,
            lastEntry:    entries[0] ? entries[0].ts : null
        };
    };

    // ── _writeLearningEntry 래핑 — Phase 3 기록 후 자동 오염 체크 ─────────────
    // (26-topic-profile.js가 getSystemPrompt를 래핑한 것과 동일한 패턴)
    (function() {
        var _orig = window._writeLearningEntry;
        if (typeof _orig !== 'function') return;
        window._writeLearningEntry = function(projectKey, entry) {
            _orig.call(this, projectKey, entry);
            // 오매칭 유형 기록 후에만 오염 체크 실행 (성능 최적화)
            if (entry && entry.type === 'negative_match') {
                setTimeout(function() {
                    window._tcCheckAndAlert(projectKey);
                }, 300);
            }
        };
    })();

    // ── showMailAnalyzer 래핑 — 모달 열 때 배지 자동 갱신 ───────────────────
    // 14a-ai-mail-analysis-1.js에서 이미 _refreshTopicProfileBadge를 호출하지만,
    // 오염 배지는 별도 함수(14a 수정 없이 여기서 래핑)
    (function() {
        var _orig = window.showMailAnalyzer;
        if (typeof _orig !== 'function') return;
        window.showMailAnalyzer = function() {
            _orig.apply(this, arguments);
            setTimeout(function() { window._tcRefreshBadge(); }, 50);
        };
    })();

})();
