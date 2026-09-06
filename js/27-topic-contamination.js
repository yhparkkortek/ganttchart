/* ================================================================
   27-topic-contamination.js
   Phase 8: 토픽 오염 감지 + AI 자가진단
   ================================================================
   · window._tcGetScore(key?)          오염 지수 계산 → {score, level, negCount, noMatchCount, totalCount, hiConfNeg}
   · window._tcCheckAndAlert(key?)     지수 체크 → 배지·토스트 갱신 (자동 연동)
   · window._tcRunDiagnosis(key?)      AI 진단 실행 → 결과 모달 표시
   · window._tcGetStats(key?)          현황 통계 반환 (감독용 뷰어)
   · window._tcRefreshBadge(key?)      오염 배지 DOM 갱신

   [연동]
   · _writeLearningEntry 완료 시 자동 _tcCheckAndAlert 호출 (래핑)
   · _msResolveAiProjectMatch 래핑: null 반환(미분류) 시 'no_match' 자동 기록
   · showMailAnalyzer 호출 시 _tcRefreshBadge 호출 (14a에서 이미 호출)
   · Phase 3 학습 데이터(_alGetEntries) 재사용 — 별도 저장소 없음

   [두 가지 신호 분리]
   · negative_match: 오염 (토픽이 너무 넓어서 엉뚱한 메일 흡수)
   · no_match:       커버리지 갭 (토픽이 너무 좁아서 관련 메일을 못 잡음)
*/

(function() {
    'use strict';

    // ── 상수 ──────────────────────────────────────────────────────────────────
    var LOOKBACK_MS    = 30 * 24 * 60 * 60 * 1000; // 30일
    var THRESHOLD_WARN = 0.25;  // 🟡 주의
    var THRESHOLD_CAUTION = 0.40;  // 🟠 경고
    var THRESHOLD_CRIT = 0.55;  // 🔴 위험
    var MIN_SAMPLES    = 3;     // 최소 학습 데이터 수 (미달 시 N/A)

    // ── 토스트 쿨다운 (프로젝트 키 → 마지막 알람 타임스탬프) ──────────────────
    // 같은 프로젝트에 대해 5분 이내 중복 알람 억제 — 연속 스캔·일괄재분석 시 폭탄 방지
    var _TC_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5분
    var _tcLastAlertTs = {}; // { projectKey: Date.now() }

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
        var result = { score: 0, level: 'ok', negCount: 0, noMatchCount: 0, totalCount: 0,
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

        // 오매칭(negative_match) + 미분류(no_match) 집계
        var weightedNeg = 0;
        var weightedTotal = 0;
        recent.forEach(function(e) {
            // no_match는 오염 지수 계산에서 제외 (별도 커버리지 갭 지표로 관리)
            if (e.type === 'no_match') { result.noMatchCount++; return; }
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
     * 오염 배지 DOM 갱신 (AI 업무 보관함 토픽 영역에 항상 표시)
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

        // 미분류(커버리지 갭) 정보 suffix
        var noMatchSuffix = st.noMatchCount > 0 ? ' · 📭미분류 ' + st.noMatchCount + '건' : '';

        badge.innerHTML = icon + ' ' + text + noMatchSuffix;
        badge.style.color = color;

        // 💡 [2026-09-04] 진단 버튼은 항상 표시 — 조건부 show/hide 제거
        // (버튼은 Task Inbox 토픽 영역에 고정 위치로 이동)
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

        // ── 쿨다운 체크: 5분 이내 이미 알람을 표시했으면 배지만 갱신하고 토스트는 생략 ──
        // 연속 메일 스캔·일괄 재분석 시 수십 개 토스트 폭탄 방지
        var _now = Date.now();
        var _inCooldown = (_now - (_tcLastAlertTs[key] || 0)) < _TC_ALERT_COOLDOWN_MS;

        var _alerted = false;

        if (!_inCooldown) {
            if (st.level === 'critical') {
                if (window.showToast) {
                    window.showToast(
                        '🔴 토픽 오염 위험 — 최근 오매칭 ' + st.negCount + '건 (연속 ' + st.consecutive + '건). AI 진단을 권장합니다.',
                        'error', 8000
                    );
                    _alerted = true;
                }
            } else if (st.level === 'caution' && st.consecutive >= 2) {
                if (window.showToast) {
                    window.showToast(
                        '🟠 토픽 오염 경고 — 오매칭이 반복되고 있습니다 (' + st.negCount + '건). 메일 분석기에서 AI 진단을 실행해주세요.',
                        'warn', 5000
                    );
                    _alerted = true;
                }
            } else if (st.level === 'warn' && st.hiConfNeg >= 2) {
                if (window.showToast) {
                    window.showToast('🟡 고신뢰도 오매칭 ' + st.hiConfNeg + '건 — 토픽 프로파일 점검을 권장합니다.', 'info', 4000);
                    _alerted = true;
                }
            }
        }

        // 커버리지 갭 알람: 미분류 누적 5/10건 시 별도 토스트
        // (exact equality라 자연적으로 1회성 — 쿨다운과 별도로 항상 허용)
        if (!_inCooldown && (st.noMatchCount === 5 || st.noMatchCount === 10)) {
            if (window.showToast) {
                window.showToast(
                    '📭 미분류 누적 ' + st.noMatchCount + '건 — 토픽 키워드가 실제 메일 패턴을 못 잡고 있을 수 있습니다. AI 진단으로 보완 키워드를 확인해보세요.',
                    'warn', 6000
                );
                _alerted = true;
            }
        }

        if (_alerted) _tcLastAlertTs[key] = _now;
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
        }).slice(0, 15); // 최대 15건

        // 💡 [버그 수정 2026-09-06] no_match 자동기록 버그(위 _msResolveAiProjectMatch 래핑 주석 참고)로
        //    이미 쌓인 로그에는 이 프로젝트와 전혀 무관한 다른 프로젝트 얘기가 섞여있을 수 있다. 진단
        //    프롬프트에 넣기 전에 "이 프로젝트 자신의 키워드/요약/판별단서가 실제로 스니펫·업무명에
        //    등장하는" 항목만 남기고 걸러낸다 — 안 그러면 무관한 프로젝트(Amusnet 등) 얘기가 "이
        //    프로젝트의 커버리지 갭"으로 오진단되는 사고가 재현된다.
        var _selfTerms = (profile.keywords || [])
            .concat(profile.distinguishers || [])
            .map(function(k) { return String(k).toLowerCase().trim(); })
            .filter(function(k) { return k.length >= 2; });
        function _looksRelevantToThisProject(e) {
            if (!_selfTerms.length) return true; // 자기 키워드가 아예 없으면 걸러낼 기준이 없으니 통과
            var text = ((e.sourceSnippet || '') + ' ' + (e.taskName || '')).toLowerCase();
            return _selfTerms.some(function(t) { return text.includes(t); });
        }

        // 💡 미분류(no_match) 항목도 함께 진단 — 토픽 커버리지 갭 분석
        var _noMatchAll = entries.filter(function(e) {
            return e.type === 'no_match' &&
                   e.ts && (now - new Date(e.ts).getTime()) < LOOKBACK_MS;
        });
        var noMatchEntries = _noMatchAll.filter(_looksRelevantToThisProject).slice(0, 10); // 최대 10건
        var _noMatchFilteredOutCount = _noMatchAll.length - noMatchEntries.length;
        if (_noMatchFilteredOutCount > 0) {
            console.info('[토픽 오염 진단] 이 프로젝트와 무관해 보이는 미분류 로그 ' + _noMatchFilteredOutCount + '건 제외됨 (오귀속 의심)');
        }

        if (!negEntries.length && !noMatchEntries.length) {
            alert('30일 이내 오매칭·미분류 기록이 없습니다.'); return;
        }

        var st = window._tcGetScore(key);

        // 프롬프트 구성
        var prompt =
            '당신은 AI 매칭 시스템의 토픽 프로파일 품질 진단 전문가입니다.\n\n' +
            '=== 현재 토픽 프로파일 ===\n' +
            '요약: ' + (profile.summary || '') + '\n' +
            '키워드: ' + (profile.keywords || []).join(', ') + '\n' +
            '업무 유형: ' + (profile.topics || []).join('; ') + '\n\n';

        if (negEntries.length) {
            prompt +=
                '=== [오염 신호] 최근 30일 오매칭 리턴 로그 (' + negEntries.length + '건) ===\n' +
                '(이 프로젝트로 잘못 배치된 후 사용자가 수거한 메일 — 토픽이 너무 넓거나 잘못된 키워드를 포함)\n' +
                negEntries.map(function(e, i) {
                    return (i + 1) + '. 업무명: "' + (e.taskName || '') + '"' +
                        ', AI신뢰도: ' + (e.confidence || '?') +
                        ', 매칭근거: ' + (e.matchBasis || '') +
                        (e.matchKeywords && e.matchKeywords.length ? ', 매칭키워드: [' + e.matchKeywords.join(', ') + ']' : '');
                }).join('\n') + '\n\n';
        }

        if (noMatchEntries.length) {
            prompt +=
                '=== [커버리지 갭] 최근 30일 미분류 로그 (' + noMatchEntries.length + '건) ===\n' +
                '(어느 프로젝트에도 매칭되지 않아 미분류 큐에 남은 메일 — 토픽 키워드가 실제 메일 패턴을 못 잡음)\n' +
                noMatchEntries.map(function(e, i) {
                    return (i + 1) + '. 업무명: "' + (e.taskName || '') + '"' +
                        ', AI 판단 근거: ' + (e.matchBasis || '없음') +
                        (e.sourceSnippet ? ', 메일 요약: ' + e.sourceSnippet.substring(0, 80) : '');
                }).join('\n') + '\n\n';
        }

        prompt +=
            '=== 통계 ===\n' +
            '오염 지수: ' + Math.round(st.score * 100) + '%, 고신뢰도 오탐: ' + st.hiConfNeg + '건, 연속 오매칭: ' + st.consecutive + '건, 미분류: ' + st.noMatchCount + '건\n\n' +
            '두 가지 문제를 모두 진단하여 다음 JSON 형식으로만 답해주세요:\n' +
            '{\n' +
            '  "diagnosis": "문제 원인을 한 문장으로 진단 (오염·커버리지 갭 중 더 심각한 것 우선)",\n' +
            '  "root_cause": "토픽의 어느 부분이 문제인지 구체적으로",\n' +
            '  "remove_keywords": ["오탐 유발 키워드 — 제거해야 할 목록"],\n' +
            '  "add_keywords": ["미분류 메일을 잡으려면 추가해야 할 구체적 키워드"],\n' +
            '  "remove_topics": ["제거할 업무 유형"],\n' +
            '  "coverage_gap": "미분류가 많은 원인 한 문장 (없으면 빈 문자열)",\n' +
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
        _showDiagnosisModal(suggestion, profile, key, _noMatchFilteredOutCount);
    };

    // ─────────────────────────────────────────────────────────────────────────
    /** AI 진단 결과 모달 표시 */
    function _showDiagnosisModal(suggestion, profile, key, filteredOutCount) {
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

            (filteredOutCount > 0 ?
              '<div style="background:#e8f4fd;border:1px solid #a5c8f0;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:11.5px;color:#1a4f7a;">' +
              '🧹 이 프로젝트와 무관해 보이는 미분류 로그 ' + filteredOutCount + '건은 진단에서 제외했습니다 ' +
              '(예전 버전의 자동기록 버그로 다른 프로젝트 관련 메일이 잘못 섞여있던 것 — 지금은 수정됨).' +
              '</div>' : '') +

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

            (suggestion.coverage_gap ?
                '<div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:10px;margin-bottom:14px;">' +
                '<div style="font-size:11px;font-weight:bold;color:#0d47a1;margin-bottom:4px;">📭 커버리지 갭</div>' +
                '<div style="font-size:12px;color:#333;line-height:1.6;">' + esc(suggestion.coverage_gap) + '</div>' +
                '</div>' : '') +

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
            // 오매칭·미분류 기록 후 오염 체크 + 배지 갱신
            if (entry && (entry.type === 'negative_match' || entry.type === 'no_match')) {
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

    // ── _msResolveAiProjectMatch 래핑 — 미분류(null 반환) 시 no_match 자동 기록 ──
    // 15b-mail-server-tab-1.js의 _msResolveAiProjectMatch가 null 반환하는 경우:
    //   → AI가 주매칭프로젝트번호=0 으로 판단 (어떤 프로젝트도 적합하지 않음)
    //   → task에 '매칭근거' 필드가 있다면 AI가 분석은 했으나 매칭을 못한 것 → no_match 기록
    (function() {
        var _origResolve = window._msResolveAiProjectMatch;
        if (typeof _origResolve !== 'function') return;
        window._msResolveAiProjectMatch = function(task, candidatesForAI) {
            var result = _origResolve.call(this, task, candidatesForAI);
            // 반환값이 null(미분류) & task에 '매칭근거'(AI가 분석했음)가 있을 때만 기록
            if (!result && task && (task['매칭근거'] || task['업무명'])) {
                // 💡 [버그 수정 2026-09-06] 예전엔 이 no_match를 "지금 화면에 열려있는 프로젝트"
                //    (window.currentDriveFileId)로 무조건 기록했음. 그런데 자동수집/배치분석은 열려있는
                //    프로젝트와 무관하게 전체 후보를 대상으로 도는 백그라운드 작업이라, 미분류 메일이
                //    화면에 열려있는 프로젝트와 아무 상관이 없는 경우가 대부분이었다. 실제로 이 버그 때문에
                //    "STELLAR32를 열어둔 채 자동수집이 돌면 Amusnet 관련 미분류 메일까지 STELLAR32의
                //    학습 로그에 쌓이고, 나중에 🔬AI 진단이 그 오염된 로그를 보고 STELLAR32에게 엉뚱하게
                //    Amusnet/ZITRO 등 다른 프로젝트 키워드를 추가하라고 제안하는" 사고가 실제로 확인됨.
                //    → candidatesForAI 중 메일 스니펫에 그 프로젝트 자신의 모델명/키워드가 실제로 등장하는
                //    "근접 후보"에만 기록한다(하이브리드-A와 동일한 문자열 포함 판정). 근접 후보가 하나도
                //    없으면(정말 시스템 전체에 등록 안 된 신규 건) 아예 기록하지 않는다 — 엉뚱한 프로젝트에
                //    잘못 붙이는 것보다 기록을 포기하는 편이 안전하다.
                var snippet    = (task['_aiMeta'] && task['_aiMeta'].snippet) || '';
                var snippetLow = snippet.toLowerCase();
                var nearCandidates = (candidatesForAI || []).filter(function(c) {
                    var frags = (c.model || '').toLowerCase().split(/[\s\-_\/]+/).filter(function(f) { return f.length >= 3; });
                    var kws   = (c.keywords || []).map(function(k) { return String(k).toLowerCase().trim(); });
                    return frags.some(function(f) { return snippetLow.includes(f); }) ||
                           kws.some(function(k) { return k.length >= 3 && snippetLow.includes(k); });
                });
                nearCandidates.forEach(function(c) {
                    var projectKey = c.drive_file_id || c.file_name || '';
                    if (projectKey && typeof window._writeLearningEntry === 'function') {
                        window._writeLearningEntry(projectKey, {
                            type:         'no_match',
                            reason:       '미분류(근접 후보)',
                            taskName:     task['업무명'] || '',
                            confidence:   task['매칭신뢰도'] || '',
                            matchBasis:   task['매칭근거'] || '',
                            matchKeywords: [],
                            sourceSnippet: snippet
                        });
                    }
                });
            }
            return result;
        };
    })();

})();
