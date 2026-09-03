// [분리됨] 원본: js/04-core-app.js 의 8434~9662행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 파일 업로드 및 유틸리티 로직 4/5
    window.setAiMailMaxLen = function(v) {
        localStorage.setItem('gantt_ai_mail_maxlen', String(v));
    };

    // 💡 [2026-08-31 신규] "AI 요약이 오늘 위주로만 요약하고 21일치를 안 본다"는 지적 — 실제 원인은
    //    _buildProjectSummaryData의 임박 마감 목록이 diffDays<=7로, 지연 목록은 기간 제한 없이(지연일수
    //    큰 순) 하드코딩돼 있어서, 프롬프트 문구가 "±21일"이라 안내해도 정작 AI에게 전달되는 데이터
    //    자체가 그 범위를 담고 있지 않았던 것. 하드코딩 대신 사용자가 조절 가능한 설정값으로 뺌
    //    (지연/임박 양쪽에 동일하게 적용 — ±기간이라는 개념이 자연스럽게 대칭이 되도록).
    window._AI_SUMMARY_RANGE_DAYS_DEFAULT = 21;
    window.getAiSummaryRangeDays = function() {
        const v = parseInt(localStorage.getItem('gantt_ai_summary_range_days'), 10);
        return (v && v >= 1) ? v : window._AI_SUMMARY_RANGE_DAYS_DEFAULT;
    };
    window.setAiSummaryRangeDays = function(v) {
        localStorage.setItem('gantt_ai_summary_range_days', String(v));
    };

    // 💡 [2026-08-31 신규] "검색 범위(며칠치를 볼지)"와 "임박 마감(그중 특히 급한 것)"은 서로 다른
    //    개념이라는 지적 — 위 rangeDays 하나로 퉁치면 범위를 넓힐수록(예: 21일) "D-21도 임박"이라고
    //    부르는 셈이 되어 어색함. 별도의 "임박(긴급) 기준"을 둬서, 예정 마감 목록(rangeDays 범위 내)
    //    중에서도 이 기준 이내인 건만 🔴로 따로 표시하도록 분리.
    window._AI_URGENT_DAYS_DEFAULT = 7;
    window.getAiUrgentDays = function() {
        const v = parseInt(localStorage.getItem('gantt_ai_urgent_days'), 10);
        return (v && v >= 1) ? v : window._AI_URGENT_DAYS_DEFAULT;
    };
    window.setAiUrgentDays = function(v) {
        localStorage.setItem('gantt_ai_urgent_days', String(v));
    };

    // 💡 [2026-08-28 개편] "AI 도구 → 설정"에서 흩어져 있던 AI 관련 설정을 한 곳으로 모음 —
    //    ① AI 모델 선택(원래 AI 업무분석 팝업에 있던 AI 선택/모델/API 키를 이리로 이동)
    //    ② AI 글자 수 설정(기존 메일 분석/요약·문답 최대 글자 수)
    //    "메일 자동배치 설정"과 동일한 펼치기/접기 아코디언 구조(window._toggleAlarmSection 재사용)로
    //    만들어서, 나중에 설정 항목이 늘어나도 그룹만 추가하면 되게 함.
    window.openAiToolsSettingsModal = function() {
        let modal = document.getElementById('ai-tools-settings-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ai-tools-settings-modal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9160; pointer-events:none; background:none;';
            modal.innerHTML = `
            <div id="ai-tools-settings-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:300px;">
                <div id="ai-tools-settings-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2; flex-shrink:0;">
                    <span>⚙️ AI 분석 설정</span>
                    <button onclick="document.getElementById('ai-tools-settings-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
                </div>
                <div style="overflow-y:auto; flex:1; padding:14px 18px; display:flex; flex-direction:column; gap:10px;">

                    <!-- ══ 그룹1: AI 모델 선택 (기본 접힘) — 원래 AI 업무분석 팝업에 있던 것을 이동 ══ -->
                    <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                        <div onclick="window._toggleAlarmSection('ai-set-sec-model')"
                             style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                            <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">🤖 AI 모델 선택</span>
                            <span id="ai-set-sec-model-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                        </div>
                        <div id="ai-set-sec-model" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                            <div style="font-size:11px; color:#2c5f8a; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                                <span id="mail-ai-section-label" style="white-space:nowrap; width:70px; flex-shrink:0; display:inline-block;">🤖 AI 선택</span>
                                <select id="mail-ai-provider" onchange="window.onAiProviderChange()"
                                        style="flex:1; min-width:0; padding:4px 6px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                                    <option value="gemini">Gemini (Google)</option>
                                    <option value="groq">Groq — 오픈모델 무료 호스팅</option>
                                    <option value="mistral">Mistral (프랑스 AI, 무료)</option>
                                    <option value="openai">OpenAI (GPT, 유료·카드등록 필요)</option>
                                </select>
                            </div>
                            <div style="font-size:11px; color:#2c5f8a; font-weight:bold; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                                <span id="mail-ai-model-label" style="white-space:nowrap; width:70px; flex-shrink:0; display:inline-block;">🔧 모델 선택</span>
                                <select id="mail-ai-model" onchange="window.onAiModelChange()"
                                        style="flex:1; min-width:0; padding:4px 6px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                                </select>
                            </div>
                            <div id="mail-model-guide" style="display:none; font-size:10px; color:#555; background:#fffbe6; border:1px solid #ffe066; border-radius:4px; padding:5px 8px; margin-bottom:4px; line-height:1.5;"></div>
                            <div style="font-size:11px; color:#2c5f8a; font-weight:bold; margin-bottom:4px; display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <span id="mail-key-label">🔑 Gemini API</span>
                                <div style="display:flex; gap:4px;">
                                    <button id="mail-cache-clear-btn" onclick="window.clearGeminiCache()"
                                            onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';"
                                            title="같은 메일을 다시 분석해도 캐시된 예전 결과가 아니라 새로 계산하게 함"
                                            style="height:26px; padding:0 8px; font-size:11px; font-weight:bold; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:4px; cursor:pointer; white-space:nowrap; box-sizing:border-box; transition:background .15s, border-color .15s;">
                                        🗑️ 캐시 초기화
                                    </button>
                                    <button id="mail-key-link-btn" onclick="window.open('https://aistudio.google.com/apikey', '_blank')"
                                            onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                                            title=""
                                            style="height:26px; padding:0 8px; font-size:11px; font-weight:bold; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; cursor:pointer; white-space:nowrap; box-sizing:border-box; transition:background .15s, border-color .15s;">
                                        🔗 발급받기
                                    </button>
                                </div>
                            </div>
                            <div id="mail-key-guide" style="display:none;"></div>
                            <div style="display:flex; gap:4px;">
                                <input id="mail-gemini-key" type="password" placeholder="AIza..."
                                    style="flex:1; min-width:0; box-sizing:border-box; height:26px; padding:0 8px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
                                <button id="mail-key-save-btn" onclick="window.saveGeminiKey()"
                                        onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';"
                                        title="API 키 저장"
                                        style="height:26px; padding:0 10px; font-size:11px; font-weight:bold; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; cursor:pointer; white-space:nowrap; box-sizing:border-box; transition:background .15s, border-color .15s;">
                                    💾 저장
                                </button>
                                <button onclick="window.clearGeminiKey()"
                                        onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';"
                                        title="API 키 삭제"
                                        style="height:26px; padding:0 8px; font-size:11px; background:#fbe4e2; color:#b1432f; border:1px solid #eeb0ac; border-radius:4px; cursor:pointer; box-sizing:border-box; transition:background .15s, border-color .15s;">
                                    🗑️
                                </button>
                            </div>
                            <div id="mail-key-status" style="font-size:11px; margin-top:3px; color:#28a745;"></div>
                        </div>
                    </div>

                    <!-- ══ 그룹2: AI 글자 수 설정 (기본 접힘) — 기존 메일분석/요약·문답 최대 글자 수 통합 ══ -->
                    <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                        <div onclick="window._toggleAlarmSection('ai-set-sec-maxlen')"
                             style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                            <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">🔢 AI 글자 수 설정</span>
                            <span id="ai-set-sec-maxlen-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                        </div>
                        <div id="ai-set-sec-maxlen" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                            <label style="display:block; font-size:12.5px; font-weight:bold; color:#333; margin-bottom:6px;">AI 업무 분석(메일) 최대 글자 수</label>
                            <div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">🤖 AI 업무 분석이 메일 본문을 AI(Gemini)에게 보낼 때 최대 몇 자까지 보낼지 정합니다. 너무 짧으면 본문 뒷부분 내용이 잘려서 분석이 부실해지고, 너무 길면 토큰 사용량이 늘고 분석 시간이 느려지거나 실패할 수 있습니다.</div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <input id="ai-mail-maxlen-input" type="number" min="500" max="5000" step="100" style="flex:1; min-width:0; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                                <button onclick="document.getElementById('ai-mail-maxlen-input').value=window._AI_MAIL_MAXLEN_DEFAULT;" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="flex-shrink:0; padding:8px 12px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 기본값</button>
                            </div>
                            <div style="font-size:10.5px; color:#aaa; margin-top:4px;">권장값: 2000자 (기본값)</div>
                            <div style="border-top:1px solid #eee; margin:16px 0;"></div>
                            <label style="display:block; font-size:12.5px; font-weight:bold; color:#333; margin-bottom:6px;">AI 요약·문답 최대 글자 수 (업무 상세내용/답변)</label>
                            <div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">🤖 AI 요약 · 💬 AI 문답이 각 업무의 "상세내용"/"답변" 필드를 읽을 때 최대 몇 자까지 참고할지 정합니다. 너무 짧으면 세부 내용(수치·번호 등)이 잘려서 답변이 부실해지고, 너무 길면 업무가 많을 때 응답이 느려지거나 실패할 수 있습니다.</div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <input id="ai-content-maxlen-input" type="number" min="100" max="3000" step="50" style="flex:1; min-width:0; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                                <button onclick="document.getElementById('ai-content-maxlen-input').value=window._AI_CONTENT_MAXLEN_DEFAULT;" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="flex-shrink:0; padding:8px 12px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 기본값</button>
                            </div>
                            <div style="font-size:10.5px; color:#aaa; margin-top:4px;">권장값: 500자 (기본값)</div>
                        </div>
                    </div>

                    <!-- ══ 그룹3: AI 요약 기간 설정 (기본 접힘) — "검색 범위"(며칠치를 볼지)와 "임박(긴급)
                         기준"(그중 특히 급한 것)은 서로 다른 개념이라 두 값을 분리해서 둠 ══ -->
                    <div style="border:1px solid #e0e0e0; border-radius:6px; overflow:hidden;">
                        <div onclick="window._toggleAlarmSection('ai-set-sec-range')"
                             style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f0f4f8; cursor:pointer; user-select:none; transition:background .15s;" onmouseover="this.style.background='#e4eaf1'" onmouseout="this.style.background='#f0f4f8'">
                            <span style="font-size:12.5px; font-weight:bold; color:#2c5f8a;">📅 AI 요약 기간 설정</span>
                            <span id="ai-set-sec-range-arrow" style="font-size:11px; color:#888;">▶ 펼치기</span>
                        </div>
                        <div id="ai-set-sec-range" style="display:none; padding:12px 14px; border-top:1px solid #e8e8e8;">
                            <label style="display:block; font-size:12.5px; font-weight:bold; color:#333; margin-bottom:6px;">🔍 검색 범위 (오늘 기준 ±일)</label>
                            <div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">🤖 AI 요약이 "지연 업무"/"예정 마감" 목록을 뽑을 때, 오늘 날짜 기준으로 며칠 이내 업무까지 담을지 정합니다. 값을 늘리면 더 먼 미래의 예정 마감과 더 오래된 지연 업무까지 AI에게 전달되어 요약이 길어지고, 줄이면 당장 가까운 업무 위주로만 짧게 요약됩니다.</div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <input id="ai-summary-range-days-input" type="number" min="1" max="90" step="1" style="flex:1; min-width:0; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                                <button onclick="document.getElementById('ai-summary-range-days-input').value=window._AI_SUMMARY_RANGE_DAYS_DEFAULT;" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="flex-shrink:0; padding:8px 12px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 기본값</button>
                            </div>
                            <div style="font-size:10.5px; color:#aaa; margin-top:4px;">권장값: 21일 (기본값) — "검색 범위"는 얼마나 넓게 훑어볼지를 정할 뿐, 급한 정도와는 무관합니다.</div>
                            <div style="border-top:1px solid #eee; margin:16px 0;"></div>
                            <label style="display:block; font-size:12.5px; font-weight:bold; color:#333; margin-bottom:6px;">🚨 임박(긴급) 마감 기준 (D-며칠 이내)</label>
                            <div style="font-size:11px; color:#888; margin-bottom:10px; line-height:1.5;">🔍 검색 범위 안에 있는 예정 마감 중에서도, 이 기준 이내로 남은 것만 "🔴 임박"으로 따로 표시해 AI가 우선적으로 다루게 합니다. 검색 범위보다 항상 같거나 좁아야 의미가 있습니다(예: 검색 범위 21일 중 D-7 이내만 임박 표시).</div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <input id="ai-summary-urgent-days-input" type="number" min="1" max="90" step="1" style="flex:1; min-width:0; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                                <button onclick="document.getElementById('ai-summary-urgent-days-input').value=window._AI_URGENT_DAYS_DEFAULT;" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="flex-shrink:0; padding:8px 12px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 기본값</button>
                            </div>
                            <div style="font-size:10.5px; color:#aaa; margin-top:4px;">권장값: 7일 (기본값)</div>
                        </div>
                    </div>

                </div>
                <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px; flex-shrink:0;">
                    <button onclick="window.saveAiToolsSettings()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:6px 18px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold; transition:background .15s, border-color .15s;">저장</button>
                    <button onclick="document.getElementById('ai-tools-settings-modal').style.display='none'" onmouseover="this.style.background='#e9ecef';" onmouseout="this.style.background='#f8f9fa';" style="padding:6px 14px; border:1px solid #ccc; background:#f8f9fa; border-radius:4px; cursor:pointer; font-size:12.5px; transition:background .15s;">닫기</button>
                </div>
            </div>`;
            document.body.appendChild(modal);
            window._makeDraggable('ai-tools-settings-box', 'ai-tools-settings-drag');
            window._bindClickToFront('ai-tools-settings-modal');
        }
        document.getElementById('ai-mail-maxlen-input').value = window.getAiMailMaxLen();
        document.getElementById('ai-content-maxlen-input').value = window.getAiContentMaxLen();
        document.getElementById('ai-summary-range-days-input').value = window.getAiSummaryRangeDays();
        document.getElementById('ai-summary-urgent-days-input').value = window.getAiUrgentDays();
        // 💡 이 모달로 옮겨온 mail-ai-provider/mail-ai-model/mail-gemini-key 등은 원래 AI 업무분석
        //    팝업이 열릴 때만 채워지던 값들이라, 여기서도 열릴 때마다 새로 채워줘야 함.
        if (window.refreshAiKeyPanel) window.refreshAiKeyPanel();
        if (window.refreshAiModelDropdown) window.refreshAiModelDropdown();
        modal.style.display = 'block';
        window.bringModalToFront('ai-tools-settings-modal');
    };

    window.saveAiToolsSettings = function() {
        const mailInput = document.getElementById('ai-mail-maxlen-input');
        let mv = parseInt(mailInput.value, 10);
        if (!mv || mv < 500) mv = 500;
        if (mv > 5000) mv = 5000;
        mailInput.value = mv;
        window.setAiMailMaxLen(mv);

        const input = document.getElementById('ai-content-maxlen-input');
        let v = parseInt(input.value, 10);
        if (!v || v < 100) v = 100;
        if (v > 3000) v = 3000;
        input.value = v;
        window.setAiContentMaxLen(v);

        const rangeInput = document.getElementById('ai-summary-range-days-input');
        let rd = parseInt(rangeInput.value, 10);
        if (!rd || rd < 1) rd = 1;
        if (rd > 90) rd = 90;
        rangeInput.value = rd;
        window.setAiSummaryRangeDays(rd);

        // 💡 "임박 기준"은 개념상 "검색 범위"보다 넓으면 의미가 없음(범위 밖은 애초에 예정 마감
        //    목록에 들어오지도 않으므로) — 범위를 넘으면 자동으로 범위값까지 줄여줌.
        const urgentInput = document.getElementById('ai-summary-urgent-days-input');
        let ud = parseInt(urgentInput.value, 10);
        if (!ud || ud < 1) ud = 1;
        if (ud > rd) ud = rd;
        urgentInput.value = ud;
        window.setAiUrgentDays(ud);

        if (window.showToast) window.showToast('✅ 설정을 저장했습니다. (메일 분석 최대 ' + mv + '자 · 업무 상세내용 최대 ' + v + '자 · 검색 범위 ±' + rd + '일 · 임박 기준 D-' + ud + ')', 'info');
    };

    // 🤖 [2026-08-27] "AI 요약"/"AI 문답"/"AI 분석 설정"은 상단 메뉴 "🤖 AI 도구"(및 "⚙️ 설정")로
    //    이동 배치됨 — window.openAiProjectSummaryModal() / window.openGanttQaModal() /
    //    window.openAiToolsSettingsModal()을 각 버튼이 직접 호출.

    function logChange(rowIndex, colIndex, oldVal, newVal, reason) {
        if (!globalData || globalData.length === 0) return;
        let colName = colIndex === -1 ? "행 조작" : (globalData[0][colIndex] || `Col ${colIndex}`);
        let rowName = rowIndex; 
        let tr = document.querySelector(`tr[data-row-index="${rowIndex}"]`);
        if (tr) {
            let noTd = tr.querySelector('.no-td');
            if (noTd) {
                let span = noTd.querySelector('.row-num-span');
                if (span && span.textContent) rowName = span.textContent.trim();
                else if (noTd.textContent) rowName = noTd.textContent.replace(/➕|➖|◀|▶/g, '').trim() || rowIndex;
            }
        } else if (globalData[rowIndex]) { rowName = globalData[rowIndex][colIdx.no] || rowIndex; }
        
        window.changeLogs.push({ 
            time: new Date().toLocaleString('ko-KR'), userName: window.currentUserName || "비로그인 (로컬)", rowName: rowName, colName: colName, oldVal: oldVal, newVal: newVal, reason: reason || ''
        });
    }

    // ✅ [공용] 선택적 사유 입력 — 비워두면 "사유 미기재"로 자동 기록.
    //    Gantt(changeLogs)뿐 아니라 M.C Table 등 다른 이력 페이지에서도 동일하게 재사용.
    //    취소(Cancel) 시 null 반환 → 호출부는 작업 자체를 중단하도록 처리할 것.
    window.promptOptionalReason = function(actionLabel) {
        const input = prompt(`📝 ${actionLabel} 사유를 입력해주세요.\n(선택 입력 — 비워두고 확인을 누르면 "사유 미기재"로 기록됩니다)`, '');
        if (input === null) return null;
        const trimmed = input.trim();
        return trimmed ? trimmed : '사유 미기재';
    };


    // 💡 Gantt 변경 이력 — M.C Table과 동일하게 표 하단 펼침 박스 형태로 표시
    window.ganttToggleHistoryBox = function() {
        const body = document.getElementById('gantt-history-body');
        const icon = document.getElementById('gantt-history-toggle-icon');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (icon) icon.textContent = isOpen ? '▶' : '▼';
        if (!isOpen && window.showHistoryModal) {
            // 💡 기존 showHistoryModal()의 렌더링 로직을 그대로 재사용하되, 모달을 띄우지 않고 박스 안의 #history-content만 채움
            window.showHistoryModal();
        }
    };


    // 💡 수정이력 — 비밀번호 확인 후 날짜 구간 내 기록 삭제 (Gantt changeLogs + M.C Table mcChangeLog 둘 다 정리)
window.deleteHistoryByDateRange = function() {
    const pwEl = document.getElementById('history-del-pw');
    const pw = pwEl ? pwEl.value : '';
    if (pw.toLowerCase() !== getAdminPassword().toLowerCase()) {
        if (window.bmAlertModal) window.bmAlertModal('비밀번호가 올바르지 않습니다.'); else alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    const fromStr = (document.getElementById('history-del-from') || {}).value;
    const toStr = (document.getElementById('history-del-to') || {}).value;
    if (!fromStr || !toStr) {
        if (window.bmAlertModal) window.bmAlertModal('시작일과 종료일을 모두 선택해주세요.'); else alert('시작일과 종료일을 모두 선택해주세요.');
        return;
    }
    const fromTs = new Date(fromStr + 'T00:00:00').getTime();
    const toTs = new Date(toStr + 'T23:59:59').getTime();
    if (fromTs > toTs) {
        if (window.bmAlertModal) window.bmAlertModal('시작일이 종료일보다 늦을 수 없습니다.'); else alert('시작일이 종료일보다 늦을 수 없습니다.');
        return;
    }

    // 💡 "2026. 6. 28. 오후 3:24:00" 형식(toLocaleString('ko-KR'))의 시각 문자열을 직접 파싱
    const parseKoDateTime = function(str) {
        const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        if (!m) return null;
        let h = parseInt(m[5], 10);
        if (m[4] === '오후' && h < 12) h += 12;
        if (m[4] === '오전' && h === 12) h = 0;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, parseInt(m[6], 10), parseInt(m[7], 10)).getTime();
    };
    const inRange = function(log) {
        const ts = parseKoDateTime(log.time);
        return ts !== null && ts >= fromTs && ts <= toTs;
    };

    const doDelete = function() {
        let removedCount = 0;
        if (window.changeLogs && window.changeLogs.length) {
            const before = window.changeLogs.length;
            window.changeLogs = window.changeLogs.filter(function(log) { return !inRange(log); });
            removedCount += before - window.changeLogs.length;
        }
        if (window.tabData && window.tabData.mcChangeLog && window.tabData.mcChangeLog.length) {
            const before2 = window.tabData.mcChangeLog.length;
            window.tabData.mcChangeLog = window.tabData.mcChangeLog.filter(function(log) { return !inRange(log); });
            removedCount += before2 - window.tabData.mcChangeLog.length;
        }
        if (pwEl) pwEl.value = '';
        window.showHistoryModal();
        const msg = removedCount + '건의 기록을 삭제했습니다.';
        if (window.bmAlertModal) window.bmAlertModal(msg); else alert(msg);
    };

    const confirmMsg = fromStr + ' ~ ' + toStr + ' 구간의 수정이력을 삭제하시겠습니까? (되돌릴 수 없습니다)';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doDelete);
    else if (confirm(confirmMsg)) doDelete();
};

    window.showHistoryModal = function() {
        let content = document.getElementById('history-content');
        if (!window.changeLogs || window.changeLogs.length === 0) {
            content.innerHTML = '<div style="padding:10px; color:#999;">' + window._t('수정 이력이 없습니다.', 'No change history.') + '</div>';
        } else {
            // 🐛 [2026-08-30 버그 수정] 원래 이 선언이 아래 템플릿 문자열 "안"에 들어가 있었다
            // (`<tr>` 다음 줄). 문자열 안이라 실제로 실행되지 않으므로 _hisEn은 선언된 적이 없고,
            // 바로 다음 줄의 ${_hisEn ? ...}에서 ReferenceError가 나서 — 변경 이력이 1건이라도
            // 있으면 Gantt "변경 이력 확인" 내용이 통째로 안 그려졌다(빈 이력일 때만 정상 동작).
            const _hisEn = window._currentLang === 'en';
            let html = `
                <table class="history-table">
                    <thead>
                        <tr>
                            <th style="width:13%;">${_hisEn ? 'Date/Time' : '변경 일시'}</th>
                            <th style="width:10%;">${_hisEn ? 'Editor' : '수정자'}</th>
                            <th style="width:8%;">${_hisEn ? 'No (Row)' : 'No (행)'}</th>
                            <th style="width:11%;">${_hisEn ? 'Changed Field' : '변경 항목'}</th>
                            <th style="width:21%;">${_hisEn ? 'Before (Old)' : '변경 전 (Old)'}</th>
                            <th style="width:21%;">${_hisEn ? 'After (New)' : '변경 후 (New)'}</th>
                            <th style="width:16%;">${_hisEn ? 'Reason' : '사유'}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            let reversedLogs = [...window.changeLogs].reverse();
            reversedLogs.forEach(log => {
                html += `
                    <tr>
                        <td style="color:#6c757d; font-size:11px;">${log.time}</td>
                        <td style="font-weight:bold; color:#0056b3;">${escapeHtml(log.userName || (_hisEn ? "Unknown" : "알 수 없음"))}</td>
                        <td style="font-weight:bold;">${escapeHtml(log.rowName)}</td>
                        <td><span class="badge" style="background:#e7f1ff; color:#0056b3;">${escapeHtml(log.colName)}</span></td>
                        <td class="val-old">${escapeHtml(log.oldVal || "-")}</td>
                        <td class="val-new">${escapeHtml(log.newVal || "-")}</td>
                        <td style="color:#6c757d; font-size:11px;">${escapeHtml(log.reason || "-")}</td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
            content.innerHTML = html;
        }
    };

    window.closeHistoryModal = function(e) {
        if (e && e.target !== document.getElementById('history-overlay')) return;
        document.getElementById('history-overlay').style.display = 'none';
    };

    window.toggleRowActions = function(td, rowIndex) {
    let popup = document.getElementById('row-action-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'row-action-popup';
        popup.className = 'row-action-popup';
        popup.innerHTML = `
           <div style="display:grid; grid-template-columns:repeat(3,33px); grid-template-rows:repeat(2,33px); gap:4px; align-items:center; justify-items:center; user-select:none; -webkit-user-select:none;">
    
            <span id="rap-up"    class="rap-btn" title="위로 이동"><i class="ti ti-chevron-up"></i></span>
            <span id="rap-left"  class="rap-btn" title="WBS 레벨 올리기"><i class="ti ti-chevron-left"></i></span>
            <span id="rap-right" class="rap-btn" title="WBS 레벨 내리기"><i class="ti ti-chevron-right"></i></span>
            <span id="rap-dn"    class="rap-btn" title="아래로 이동"><i class="ti ti-chevron-down"></i></span>
            <span id="rap-add"   class="rap-btn rap-btn-add" title="행 추가"><i class="ti ti-plus"></i></span>
            <span id="rap-del"   class="rap-btn rap-btn-danger" title="행 삭제"><i class="ti ti-minus"></i></span>

        </div>`;
        document.body.appendChild(popup);
        _makeFloatingPopupDraggable(popup);

        // 외부 클릭 시 닫기
        document.addEventListener('click', function(e) {
        if (!popup.contains(e.target) && !e.target.closest('.no-td')
            && !e.target.closest('#confirm-delete-modal')
            && !e.target.closest('#confirm-level0-modal')) {
            popup.style.display = 'none';
            window.clearRowHighlight();
        }
    });
    }

    // 현재 팝업이 같은 행이면 닫기
    if (popup.style.display === 'block' && popup.dataset.rowIndex === String(rowIndex)) {
        popup.style.display = 'none';
        window.clearRowHighlight();
        return;
    }

    popup.dataset.rowIndex = rowIndex;
    window.highlightRow(rowIndex);

    // 버튼 이벤트 재등록
    let actions = {
        'rap-up':    () => {
            if (window._selectedRows && window._selectedRows.size >= 2) { const ni = window.moveSelectedRows(-1); if (ni != null) rowIndex = ni; }
            else { const ni = window.moveRow(rowIndex, -1); if (ni != null) rowIndex = ni; window._selectedRows = new Set(); }
            popup.dataset.rowIndex = rowIndex; window.paintRowSelection(); window.highlightRow(rowIndex);
        },
        'rap-dn':    () => {
            if (window._selectedRows && window._selectedRows.size >= 2) { const ni = window.moveSelectedRows(+1); if (ni != null) rowIndex = ni; }
            else { const ni = window.moveRow(rowIndex, +1); if (ni != null) rowIndex = ni; window._selectedRows = new Set(); }
            popup.dataset.rowIndex = rowIndex; window.paintRowSelection(); window.highlightRow(rowIndex);
        },
        'rap-del':   () => {
            if (window._selectedRows && window._selectedRows.size >= 2) { window.deleteSelectedRows(); popup.style.display='none'; window.clearRowHighlight(); return; }
            window._selectedRows = new Set();
            window.deleteRow(rowIndex); setTimeout(() => { if(document.querySelector(`tr[data-row-index="${rowIndex}"]`)) { popup.dataset.rowIndex = rowIndex; window.highlightRow(rowIndex); } else { popup.style.display='none'; window.clearRowHighlight(); } }, 20);
        },
        'rap-left':  () => {
            if (window._selectedRows && window._selectedRows.size > 1) { window.changeSelectedRowsLevel(-1); }
            else { window.changeRowLevel(rowIndex, -1); }
            popup.dataset.rowIndex = rowIndex; window.paintRowSelection(); window.highlightRow(rowIndex);
        },
        'rap-right': () => {
            if (window._selectedRows && window._selectedRows.size > 1) { window.changeSelectedRowsLevel(+1); }
            else { window.changeRowLevel(rowIndex, +1); }
            popup.dataset.rowIndex = rowIndex; window.paintRowSelection(); window.highlightRow(rowIndex);
        },
        'rap-add':   () => { window.addRow(rowIndex); rowIndex++; popup.dataset.rowIndex = rowIndex; window.highlightRow(rowIndex); },
        'rap-del':   () => {
            if (window._selectedRows && window._selectedRows.size > 1) { window.deleteSelectedRows(); popup.style.display='none'; window.clearRowHighlight(); return; }
            window.deleteRow(rowIndex); setTimeout(() => { if(document.querySelector(`tr[data-row-index="${rowIndex}"]`)) { popup.dataset.rowIndex = rowIndex; window.highlightRow(rowIndex); } else { popup.style.display='none'; window.clearRowHighlight(); } }, 20);
        },
    };
    Object.entries(actions).forEach(([id, fn]) => {
        let btn = document.getElementById(id);
        let newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        document.getElementById(id).addEventListener('click', fn);
    });

    // 📌 상하좌우+- 는 WBS(레벨/순서) 관련 기능이므로, No 셀이 아니라 같은 행의 WBS 셀 옆에 뜨도록 앵커
    const wbsCellForPopup = td.closest('tr') ? td.closest('tr').querySelector('.wbs-cell') : null;
    let rect = (wbsCellForPopup || td).getBoundingClientRect();
    popup.style.display = 'block';
    let popupW = popup.offsetWidth;
    let popupH = popup.offsetHeight;
    let top = rect.top + window.scrollY;
    // 💡 업무명 텍스트에 더 가깝게 — 버튼 크기(33px)의 2배만큼 기존 위치보다 왼쪽(안쪽)으로 당김
    const RAP_BTN_SIZE = 33;
    let left = rect.right + window.scrollX + 5 - (RAP_BTN_SIZE * 2);

    // 화면 밖으로 나가면 왼쪽에 표시
    if (left + popupW > window.innerWidth) left = rect.left + window.scrollX - popupW - 5;
    // 아래로 넘치면 위로 올림
    if (top + popupH > window.innerHeight + window.scrollY) top = rect.bottom + window.scrollY - popupH;

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
};

    window.addRow = function(index) {
        if (index <= 0) { alert("최상단 행에는 추가할 수 없습니다."); return; }
        if (document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display = 'none';
        
        let parentRow = globalData[index]; let newRow = new Array(globalData[0].length).fill("");
        newRow._level = parentRow._level; if (colIdx.status !== -1) newRow[colIdx.status] = parentRow[colIdx.status] || "진행";
        
        for(let i=0; i<globalData[0].length; i++) {
            if ([colIdx.no, colIdx.bogo, colIdx.start, colIdx.plan, colIdx.period, colIdx.dur1, colIdx.dur2, colIdx.dur3, colIdx.dur4, colIdx.chart, colIdx.content, colIdx.answer, colIdx.devStage, colIdx.taskType1, colIdx.taskType2, colIdx.taskType3, colIdx.taskType4].includes(i)) continue;
            newRow[i] = parentRow[i] || "";
        }

        newRow._origDev = ""; newRow._origT1 = ""; newRow._origT2 = ""; newRow._origT3 = ""; newRow._origT4 = "";
        let newTaskName = "새로운 업무";

        if (newRow._level === 0) newRow._origDev = newTaskName; else if (newRow._level === 1) newRow._origT1 = newTaskName; else if (newRow._level === 2) newRow._origT2 = newTaskName; else if (newRow._level === 3) newRow._origT3 = newTaskName; else if (newRow._level === 4) newRow._origT4 = newTaskName;
        
        newRow._explicitStartTs = null; newRow._explicitPlanTs = null; newRow._finalDuration = 1;
        if (colIdx.period !== -1) newRow[colIdx.period] = "1";
        if (newRow._level === 1 && colIdx.dur1 !== -1) newRow[colIdx.dur1] = "1";
        if (newRow._level === 2 && colIdx.dur2 !== -1) newRow[colIdx.dur2] = "1";
        if (newRow._level === 3 && colIdx.dur3 !== -1) newRow[colIdx.dur3] = "1";
        if (newRow._level === 4 && colIdx.dur4 !== -1) newRow[colIdx.dur4] = "1";

        globalData.splice(index + 1, 0, newRow); 
        logChange(index + 1, -1, "없음", "행 추가됨");
        window.recalculateSchedules();
    };

    window.changeRowLevel = function(index, direction) {
        if (document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display = 'none';
        let row = globalData[index]; if (!row) return;

        let oldLevel = row._level;
        let newLevel = Math.max(0, Math.min(4, oldLevel + direction));
        if (newLevel === oldLevel) return;

        let taskTxt = "";
        if (oldLevel === 0) taskTxt = row._origDev; else if (oldLevel === 1) taskTxt = row._origT1; else if (oldLevel === 2) taskTxt = row._origT2; else if (oldLevel === 3) taskTxt = row._origT3; else if (oldLevel === 4) taskTxt = row._origT4;
        taskTxt = (taskTxt || "").toString().trim() || "새로운 업무";

        let processChange = function() {
            row._level = newLevel;
            row._origDev = ""; row._origT1 = ""; row._origT2 = ""; row._origT3 = ""; row._origT4 = "";
            if (newLevel === 0) row._origDev = taskTxt; else if (newLevel === 1) row._origT1 = taskTxt; else if (newLevel === 2) row._origT2 = taskTxt; else if (newLevel === 3) row._origT3 = taskTxt; else if (newLevel === 4) row._origT4 = taskTxt;
            
            let currentDur = row._finalDuration || 1;
            if (colIdx.dur1 !== -1) row[colIdx.dur1] = (newLevel === 1) ? currentDur.toString() : "";
            if (colIdx.dur2 !== -1) row[colIdx.dur2] = (newLevel === 2) ? currentDur.toString() : "";
            if (colIdx.dur3 !== -1) row[colIdx.dur3] = (newLevel === 3) ? currentDur.toString() : "";
            if (colIdx.dur4 !== -1) row[colIdx.dur4] = (newLevel === 4) ? currentDur.toString() : "";

            let levelLabels = ["대분류(0)", "소요1(1)", "소요2(2)", "소요3(3)", "소요4(4)"];
            logChange(index, -1, `계층 변경`, `${levelLabels[oldLevel]} → ${levelLabels[newLevel]}`);
            window.recalculateSchedules();
        };

        if (newLevel === 0 && oldLevel > 0) {
            let modal = document.getElementById('confirm-level0-modal');
            if (!modal) {
                modal = document.createElement('div'); modal.id = 'confirm-level0-modal';
                modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
                modal.innerHTML = `
                    <div style="background:#fff;border-radius:10px;padding:28px 32px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;">
                        <div style="font-size:20px;margin-bottom:8px;">⚠️ 최상위 레벨 이동</div>
                        <div style="font-size:14px;color:#495057;margin-bottom:20px;">해당 업무를 대분류(개발단계)로 이동하시겠습니까?<br><span style="color:#e03131;font-size:12px;">이동 시 기존 필터 기준이 변경될 수 있습니다.</span></div>
                        <div style="display:flex;gap:12px;justify-content:center;">
                            <button id="confirm-level0-ok" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="padding:9px 28px;background:#e8f4fd;color:#1a4f7a;border:1px solid #a5c8f0;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s, border-color .15s;">이동</button>
                            <button id="confirm-level0-cancel" onmouseover="this.style.background='#ced4da';" onmouseout="this.style.background='#dee2e6';" style="padding:9px 28px;background:#dee2e6;color:#333;border:none;border-radius:7px;font-size:14px;cursor:pointer;transition:background .15s;">취소</button>
                        </div></div>`;
                document.body.appendChild(modal);
            }
            modal.style.display = 'flex';
            let okBtn = document.getElementById('confirm-level0-ok'); let cancelBtn = document.getElementById('confirm-level0-cancel');
            let newOk = okBtn.cloneNode(true); okBtn.parentNode.replaceChild(newOk, okBtn);
            let newCancel = cancelBtn.cloneNode(true); cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            document.getElementById('confirm-level0-ok').addEventListener('click', function() { modal.style.display = 'none'; processChange(); });
            document.getElementById('confirm-level0-cancel').addEventListener('click', function() { modal.style.display = 'none'; });
        } else { processChange(); }
    };

    window.deleteRow = function(index) {
        if (document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display = 'none';

        // ✅ [AI 학습 Phase 1] AI가 자동 등록한 업무면 오매칭/재배치 피드백 팝업 표시
        //    피드백 팝업이 직접 행 삭제까지 처리하므로 여기서 바로 return.
        if (globalData[index] && globalData[index]._aiRegistered && window._showAiDeleteFeedback) {
            window._showAiDeleteFeedback(index);
            return;
        }

        let tr = document.querySelector(`tr[data-row-index="${index}"]`); let rowName = index;
        if (tr) {
            let noTd = tr.querySelector('.no-td');
            if (noTd) {
                let span = noTd.querySelector('.row-num-span');
                rowName = span && span.textContent ? span.textContent.trim() : noTd.textContent.replace(/➕|➖|◀|▶/g, '').trim();
            }
        }

        let modal = document.getElementById('confirm-delete-modal');
        if (!modal) {
            modal = document.createElement('div'); modal.id = 'confirm-delete-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = `
                <div style="background:#fff;border-radius:10px;padding:28px 32px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.18);text-align:center;">
                    <div style="font-size:20px;margin-bottom:8px;">🗑️ 행 삭제</div>
                    <div id="confirm-delete-msg" style="font-size:14px;color:#495057;margin-bottom:20px;"></div>
                    <div style="display:flex;gap:12px;justify-content:center;">
                        <button id="confirm-delete-ok" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="padding:9px 28px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:7px;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s, border-color .15s;">삭제</button>
                        <button id="confirm-delete-cancel" onmouseover="this.style.background='#ced4da';" onmouseout="this.style.background='#dee2e6';" style="padding:9px 28px;background:#dee2e6;color:#333;border:none;border-radius:7px;font-size:14px;cursor:pointer;transition:background .15s;">취소</button>
                    </div></div>`;
            document.body.appendChild(modal);
        }
        document.getElementById('confirm-delete-msg').textContent = `${rowName}번 행(업무)을 삭제하시겠습니까?`;
        modal.style.display = 'flex';

        let okBtn = document.getElementById('confirm-delete-ok'); let cancelBtn = document.getElementById('confirm-delete-cancel');
        let newOk = okBtn.cloneNode(true); okBtn.parentNode.replaceChild(newOk, okBtn);
        let newCancel = cancelBtn.cloneNode(true); cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
        document.getElementById('confirm-delete-ok').addEventListener('click', function() {
            modal.style.display = 'none'; let deleted = globalData.splice(index, 1); let taskName = "알 수 없는 업무";
            if (deleted[0]) {
                let l = deleted[0]._level; taskName = (l===0?deleted[0]._origDev:(l===1?deleted[0]._origT1:(l===2?deleted[0]._origT2:(l===3?deleted[0]._origT3:deleted[0]._origT4)))) || "빈 업무";
            }
            window.changeLogs.push({ time: new Date().toLocaleString('ko-KR'), userName: window.currentUserName || "비로그인", rowName: rowName, colName: "행 조작", oldVal: taskName, newVal: "삭제됨" });
            window.recalculateSchedules();
        });
        document.getElementById('confirm-delete-cancel').addEventListener('click', function() { modal.style.display = 'none'; });
    };

   window.moveRow = function(index, direction) {
        if (document.getElementById('calendar-popup')) document.getElementById('calendar-popup').style.display = 'none';
        window.getSelection().removeAllRanges();
        const rows = globalData;
        const cur = rows[index];
        if (!cur) return;
        const lvOf = (r) => (r && typeof r._level === 'number') ? r._level : 4;
        const L = lvOf(cur);
        let e = index;
        for (let j = index + 1; j < rows.length; j++) { if (lvOf(rows[j]) > L) e = j; else break; }
        let newStart;
        if (direction < 0) {
            if (index <= 1) return;
            let h = -1;
            for (let j = index - 1; j >= 1; j--) { const lv = lvOf(rows[j]); if (lv > L) continue; h = j; break; }
            if (h === -1) h = 1;
            const b = rows.splice(index, e - index + 1);
            rows.splice(h, 0, ...b);
            newStart = h;
        } else {
            if (e >= rows.length - 1) return;
            const nextStart = e + 1;
            const nl = lvOf(rows[nextStart]);
            let ne = nextStart;
            for (let j = nextStart + 1; j < rows.length; j++) { if (lvOf(rows[j]) > nl) ne = j; else break; }
            const nextLen = ne - nextStart + 1;
            const b = rows.splice(index, e - index + 1);
            rows.splice(index + nextLen, 0, ...b);
            newStart = index + nextLen;
        }
        logChange(index, -1, '행 이동', `${direction > 0 ? '아래' : '위'}로 이동 (하위 포함)`);

        // 🔧 연속 이동 감지 debounce — 500ms 이내 재클릭이 감지되면 "연속 이동 중"으로 판정.
        //    recalculateSchedules 내부의 토스트를 억제하고, 연속이 끝난 후 한 번만 표시한다.
        //    첫 클릭은 빠르게 토스트가 표시되고, 이후 연속 클릭 구간은 마지막에 한 번만 표시됨.
        const _now = Date.now();
        const _isRapid = window._lastRowMoveTime && (_now - window._lastRowMoveTime < 500);
        window._lastRowMoveTime = _now;
        if (_isRapid) {
            // 연속 이동 중: 토스트 억제 플래그 유지 + debounce 타이머 리셋
            window._rowMoving = true;
            clearTimeout(window._rowMoveToastTimer);
            window._rowMoveToastTimer = setTimeout(function() {
                window._rowMoving = false;
                if (window.showToast) window.showToast(window._currentLang === 'en' ? "✅ Schedule updated." : "✅ 일정이 업데이트 되었습니다.");
            }, 500);
        } else {
            // 첫 이동 또는 간격이 충분히 벌어진 이동: 토스트 억제 없이 즉시 표시
            window._rowMoving = false;
            clearTimeout(window._rowMoveToastTimer);
            window._rowMoveToastTimer = null;
        }

        window.recalculateSchedules();
        return newStart;
    };

    // ─── 시작일 기준 정렬 (WBS 계층 유지) ──────────────────────────
    window.sortRowsByStartDate = function() {
        if (!globalData || globalData.length <= 2) { alert('정렬할 데이터가 없습니다.'); return; }

        const header = globalData[0];
        const rows   = globalData.slice(1);

        // 정렬 키: 계산된 시작일(_calcStartTs). 날짜 없는 행은 맨 뒤로.
        const startTs = (row) => (row && typeof row._calcStartTs === 'number') ? row._calcStartTs : Infinity;

        // 1) _level 기반 트리 구성 (부모 = 바로 위의 더 낮은 레벨 행)
        const roots = [];
        const stack = [];
        for (const row of rows) {
            const node = { row, children: [] };
            const lv = (typeof row._level === 'number') ? row._level : 4;
            while (stack.length && stack[stack.length - 1].level >= lv) stack.pop();
            if (stack.length === 0) roots.push(node);
            else stack[stack.length - 1].node.children.push(node);
            stack.push({ node, level: lv });
        }

        // 2) 형제끼리 시작일 오름차순 정렬 (재귀)
        const sortNodes = (nodes) => {
            nodes.sort((a, b) => startTs(a.row) - startTs(b.row));
            for (const n of nodes) sortNodes(n.children);
        };
        sortNodes(roots);

        // 3) 평탄화하여 globalData 재구성
        const out = [];
        const flatten = (nodes) => { for (const n of nodes) { out.push(n.row); flatten(n.children); } };
        flatten(roots);

        globalData = [header, ...out];
        logChange(0, -1, '날짜 정렬', '시작일 기준 정렬');
        window.recalculateSchedules();
    };

    // ─── 🔀 [부분 정렬] 지정한 인덱스 구간(fromIdx~toIdx)만 시작일 기준으로 재정렬 ───
    //     "선택 구간 재계산" 직후, 영향받은 구간만 순서를 정리할 때 사용. 구간 밖은 절대 건드리지 않음.
    window._sortSubRangeByStartDate = function(fromIdx, toIdx) {
        if (!globalData || fromIdx == null || toIdx == null || fromIdx > toIdx) return;
        fromIdx = Math.max(1, fromIdx); toIdx = Math.min(globalData.length - 1, toIdx);
        if (fromIdx > toIdx) return;

        const slice = globalData.slice(fromIdx, toIdx + 1);
        const startTs = (row) => (row && typeof row._calcStartTs === 'number') ? row._calcStartTs : Infinity;

        const roots = [];
        const stack = [];
        for (const row of slice) {
            const node = { row, children: [] };
            const lv = (typeof row._level === 'number') ? row._level : 4;
            while (stack.length && stack[stack.length - 1].level >= lv) stack.pop();
            if (stack.length === 0) roots.push(node);
            else stack[stack.length - 1].node.children.push(node);
            stack.push({ node, level: lv });
        }
        const sortNodes = (nodes) => {
            nodes.sort((a, b) => startTs(a.row) - startTs(b.row));
            for (const n of nodes) sortNodes(n.children);
        };
        sortNodes(roots);

        const out = [];
        const flatten = (nodes) => { for (const n of nodes) { out.push(n.row); flatten(n.children); } };
        flatten(roots);

        for (let i = 0; i < out.length; i++) globalData[fromIdx + i] = out[i];
    };

    window.currentCalendarTarget = null; window.currentCalendarTs = null; window.currentViewYear = null; window.currentViewMonth = null; window.currentCalendarRow = null; window.currentCalendarCol = null;

    window.showCalendar = function(btn, ts, rowIndex, colIndex) {
        window.currentCalendarTarget = btn; window.currentCalendarTs = Number(ts); window.currentCalendarRow = rowIndex; window.currentCalendarCol = colIndex;
        // 💡 통합 캘린더 — 이전에 열려있던 다른 모드(메일분석/범용 input)의 잔여 플래그를 항상 초기화
        window.currentCalendarMailField = null;
        window.currentCalendarGenericInput = null;
        let d = new Date(window.currentCalendarTs);
        window.currentViewYear = d.getFullYear(); window.currentViewMonth = d.getMonth();
        window.calendarFixedPos = null; renderCalendar(false);
    };

    // 💡 업무 추가(직접입력/파일첨부/메일서버) AI분석 결과의 시작일·완료일 달력 진입점
    //    selectDateFromCalendar()의 currentCalendarMailField 분기와 짝을 이루는 함수
    window.showMailCalendar = function(el, ts, fieldKey) {
        window.showCalendar(el, ts, null, null);
        window.currentCalendarMailField = fieldKey; // showCalendar가 초기화한 뒤 다시 지정
    };

    // 💡 [통합 캘린더] 앱 전체의 <input type="date"> 필드를 이 하나의 팝업으로 통일
    //    input에 readonly를 걸고(네이티브 달력 차단) 클릭 시 이 함수를 호출하도록 연결하면
    //    선택한 날짜가 자동으로 그 input의 value에 채워지고 change/input 이벤트도 함께 발생함
    window.showGenericCalendar = function(inputEl) {
        if (!inputEl) return;
        let ts = inputEl.value ? new Date(inputEl.value).getTime() : Date.now();
        if (isNaN(ts)) ts = Date.now();
        window.showCalendar(inputEl, ts, null, null);
        window.currentCalendarGenericInput = inputEl; // showCalendar가 초기화한 뒤 다시 지정
    };

    // 💡 [2026-08-30 신규] Summary 마일스톤 날짜칸을 기본 readonly(한 번 클릭 = 달력 팝업)로 바꾸면서,
    // "직접 타이핑도 하고 싶을 때"를 위해 더블클릭하면 잠깐 readonly를 풀고 포커스를 준다 — 입력을
    // 끝내고 포커스를 벗어나면(blur) 다시 readonly로 돌아가 항상 "클릭=달력"이 기본 동작이 되게 한다.
    window._msEnableDirectEdit = function(el) {
        if (!el) return;
        el.removeAttribute('readonly');
        el.focus();
        el.select();
        const reReadonly = function() {
            el.setAttribute('readonly', 'readonly');
            el.removeEventListener('blur', reReadonly);
        };
        el.addEventListener('blur', reReadonly);
    };

    // 💡 [2026-08-30 신규] 개발기간(일) 자동 계산 — 계획/실적 각각 "기획Start ~ PRA" 사이 날짜 차이를
    // 계산해서 표 오른쪽 열에 보여준다. 이전엔 사용자가 숫자를 직접 타이핑했는데, 이미 표에 있는
    // 날짜로부터 계산 가능한 값을 또 손으로 넣게 하면 표와 어긋날 위험(오차/깜빡함)이 있어 자동 계산으로 전환.
    window._sumDevDaysBetween = function(startStr, endStr) {
        if (!startStr || !endStr) return null;
        const s = new Date(startStr), e = new Date(endStr);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
        const days = Math.round((e.getTime() - s.getTime()) / 86400000);
        return days >= 0 ? days : null;
    };
    window._sumDevDaysUnitLabels = {
        day:   { ko: '소요(일)',   en: 'Days' },
        week:  { ko: '소요(주)',   en: 'Weeks' },
        month: { ko: '소요(개월)', en: 'Months' }
    };
    window._sumDevDaysUnit = (function() {
        try { return localStorage.getItem('gantt_sum_devdays_unit') || 'day'; } catch (e) { return 'day'; }
    })();
    // 💡 개월은 달력상 "몇 월 며칠"까지 정확히 세지 않고, 이해하기 쉬운 근사치(1개월=30일)로 단순 환산한다
    //    — 대략적인 개발기간 감을 잡는 용도라 정밀한 캘린더 개월 계산까지는 필요 없다고 판단.
    window._sumFormatDevDays = function(days) {
        if (days === null || days === undefined) return '-';
        const _en = window._currentLang === 'en';
        const unit = window._sumDevDaysUnit;
        if (unit === 'week') return Math.round(days / 7) + (_en ? 'w' : '주');
        if (unit === 'month') return Math.round(days / 30) + (_en ? 'mo' : '개월');
        return days + (_en ? 'd' : '일');
    };
    window.sumToggleDevDaysUnit = function(ev) {
        if (ev) ev.stopPropagation();
        const order = ['day', 'week', 'month'];
        const idx = order.indexOf(window._sumDevDaysUnit);
        window._sumDevDaysUnit = order[(idx + 1) % order.length];
        try { localStorage.setItem('gantt_sum_devdays_unit', window._sumDevDaysUnit); } catch (e) {}
        window.sumRecalcDevDays();
    };
    window.sumRecalcDevDays = function() {
        const labelEl = document.getElementById('sum-devdays-unit-label');
        if (labelEl) {
            const _en = window._currentLang === 'en';
            const lbl = window._sumDevDaysUnitLabels[window._sumDevDaysUnit] || window._sumDevDaysUnitLabels.day;
            labelEl.textContent = (_en ? lbl.en : lbl.ko) + ' 🔄';
        }
        const planStart = document.querySelector('#sum-milestone-body [data-stage="기획Start"][data-field="date"]');
        const planEnd = document.querySelector('#sum-milestone-body [data-stage="PRA"][data-field="date"]');
        const actualStart = document.querySelector('#sum-milestone-body-actual [data-stage="기획Start"][data-field="actualDate"]');
        const actualEnd = document.querySelector('#sum-milestone-body-actual [data-stage="PRA"][data-field="actualDate"]');
        const planDays = window._sumDevDaysBetween(planStart && planStart.value, planEnd && planEnd.value);
        const actualDays = window._sumDevDaysBetween(actualStart && actualStart.value, actualEnd && actualEnd.value);
        const planTd = document.getElementById('sum-devdays-plan');
        const actualTd = document.getElementById('sum-devdays-actual');
        if (planTd) planTd.textContent = window._sumFormatDevDays(planDays);
        if (actualTd) actualTd.textContent = window._sumFormatDevDays(actualDays);
    };
    // 💡 계획/실적 날짜칸 18개 중 어느 것을 고치든(달력 선택 = input 이벤트 발생, 더블클릭 직접입력 모두
    // 포함) 한 곳에서 감시해서 다시 계산 — 18곳에 각각 이벤트를 붙이는 대신 이벤트 위임으로 한 번에 처리.
    document.addEventListener('input', function(e) {
        if (e.target && e.target.closest && e.target.closest('#sum-milestone-body, #sum-milestone-body-actual')) {
            window.sumRecalcDevDays();
        }
    });

    window.changeCalendarMonth = function(e, deltaMonth, deltaYear) {
        if (e) e.stopPropagation();
        let d = new Date(window.currentViewYear + deltaYear, window.currentViewMonth + deltaMonth, 1);
        window.currentViewYear = d.getFullYear(); window.currentViewMonth = d.getMonth();
        renderCalendar(true);
    };

   window.selectDateFromCalendar = function(y, m, d) {
        let str = y + "-" + String(m+1).padStart(2, '0') + "-" + String(d).padStart(2, '0');

        // ✅ [통합 캘린더] 범용 input 모드인 경우 — 그 input에 값만 채우고 change/input 이벤트 발생
        if (window.currentCalendarGenericInput) {
            const el = window.currentCalendarGenericInput;
            window.currentCalendarGenericInput = null;
            el.value = str;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('calendar-popup').style.display = 'none';
            var _calOvlG = document.getElementById('calendar-bg-overlay'); if (_calOvlG) _calOvlG.remove();
            return;
        }

        // ✅ 메일 분석 팝업창용 달력인 경우 (중요 수정)
        if (window.currentCalendarMailField) {
            const fieldKey = window.currentCalendarMailField;
            window._mailAnalyzedResult[fieldKey] = str;
            window.currentCalendarMailField = null;

            const spanEl = document.getElementById(`mail-date-${fieldKey}`);
            if (spanEl) spanEl.innerHTML = `<span style="color:#0056b3; font-weight:bold;">${str}</span>`;

            const warnEl = spanEl ? spanEl.closest('td') : null;
            if (warnEl) {
                const warnDiv = warnEl.querySelector('div[style*="e67e22"]');
                if (warnDiv) warnDiv.remove();
            }

            // 시작일 선택 시 완료일 자동 설정 (시작일 + 3일)
            if (fieldKey === '시작일') {
                const planDate = new Date(new Date(str).getTime() + 1 * 24 * 60 * 60 * 1000);
                const planStr = planDate.getFullYear() + '-' + String(planDate.getMonth()+1).padStart(2,'0') + '-' + String(planDate.getDate()).padStart(2,'0');
                window._mailAnalyzedResult['완료일'] = planStr;
                const planSpan = document.getElementById('mail-date-완료일');
                if (planSpan) planSpan.innerHTML = `<span style="color:#0056b3; font-weight:bold;">${planStr}</span>`;
            }

            document.getElementById('calendar-popup').style.display = 'none';
            var _calOvl = document.getElementById('calendar-bg-overlay'); if (_calOvl) _calOvl.remove();
            window.autoSetInsertPosition(str);
            return;
        }
    
        if (window.currentCalendarRow !== undefined && window.currentCalendarCol !== undefined && window.currentCalendarRow !== null) {
            let r = window.currentCalendarRow; let c = window.currentCalendarCol;
            let selectedTs = new Date(y, m, d).setHours(0,0,0,0);

            let oldVal = globalData[r][c] || "";
            logChange(r, c, oldVal, str);
            globalData[r][c] = str;
            if (c === colIdx.start) {
                globalData[r]._startForced = true; globalData[r]._planForced = false;
                if (colIdx.plan !== -1) {
                    // 💡 완료일을 무조건 비우면 기간 정보가 없는 행은 완료일=시작일로 붕괴됨.
                    //    변경 전 소요일(근무일 기준)을 구해서 새 시작일에 그대로 이어붙여 완료일도 같이 밀리게 함.
                    const oldStartTs = globalData[r]._calcStartTs; const oldPlanTs = globalData[r]._calcPlanTs;
                    const oldDur = (oldStartTs && oldPlanTs) ? countWorkingDays(oldStartTs, oldPlanTs) : 0;
                    if (oldDur > 0) {
                        const newPlanTs = addWorkingDays(selectedTs, oldDur - 1);
                        const pd = new Date(newPlanTs);
                        globalData[r][colIdx.plan] = pd.getFullYear() + '-' + String(pd.getMonth()+1).padStart(2,'0') + '-' + String(pd.getDate()).padStart(2,'0');
                    } else {
                        globalData[r][colIdx.plan] = ""; // 💡 소요일 정보가 아예 없던 행(신규 행 등)은 기존처럼 자동계산에 맡김
                    }
                }
            }
            if (c === colIdx.plan)  { globalData[r]._planForced = true; globalData[r]._startForced = false; if (colIdx.dur1 !== -1) globalData[r][colIdx.dur1] = ""; if (colIdx.dur2 !== -1) globalData[r][colIdx.dur2] = ""; if (colIdx.dur3 !== -1) globalData[r][colIdx.dur3] = ""; if (colIdx.dur4 !== -1) globalData[r][colIdx.dur4] = ""; if (colIdx.period !== -1) globalData[r][colIdx.period] = ""; }

            document.getElementById('calendar-popup').style.display = 'none';
            var _calOvl = document.getElementById('calendar-bg-overlay'); if (_calOvl) _calOvl.remove();
            window.recalculateSchedules();
        }
    };

    window.renderCalendar = function(keepPos) {
        let popup = document.getElementById('calendar-popup');
        if (!popup) { popup = document.createElement('div'); popup.id = 'calendar-popup'; popup.className = 'calendar-popup'; document.body.appendChild(popup); }

        let year = window.currentViewYear; let month = window.currentViewMonth;
        let targetDate = new Date(window.currentCalendarTs);
        let targetY = targetDate.getFullYear(); let targetM = targetDate.getMonth(); let targetD = targetDate.getDate();

        let firstDay = new Date(year, month, 1).getDay(); let daysInMonth = new Date(year, month + 1, 0).getDate(); let prevDays = new Date(year, month, 0).getDate();

        let html = `
            <div class="cal-header">
                <div><span class="cal-nav" onclick="changeCalendarMonth(event, 0, -1)" title="이전 년도">⏪</span><span class="cal-nav" onclick="changeCalendarMonth(event, -1, 0)" title="이전 달">◀</span></div>
                <span style="margin: 0 10px;">${year}년 ${month + 1}월</span>
                <div style="display:flex; align-items:center;"><span class="cal-nav" onclick="changeCalendarMonth(event, 1, 0)" title="다음 달">▶</span><span class="cal-nav" onclick="changeCalendarMonth(event, 0, 1)" title="다음 년도">⏩</span><span class="cal-close" onclick="event.stopPropagation(); document.getElementById('calendar-popup').style.display='none'; var o=document.getElementById('calendar-bg-overlay'); if(o) o.remove();" title="닫기">✖</span></div>
            </div>
            <div class="cal-grid"><div class="cal-day" style="color:#e03131;">일</div><div class="cal-day">월</div><div class="cal-day">화</div><div class="cal-day">수</div><div class="cal-day">목</div><div class="cal-day">금</div><div class="cal-day" style="color:#0056b3;">토</div>
        `;

        let cellCount = 0;
        for (let i = firstDay - 1; i >= 0; i--) { html += `<div class="cal-date dim">${prevDays - i}</div>`; cellCount++; }
        for (let i = 1; i <= daysInMonth; i++) {
            let isTarget = (year === targetY && month === targetM && i === targetD) ? 'active' : '';
            let isSunday = (cellCount % 7 === 0) ? 'color:#e03131;' : ''; let isSaturday = (cellCount % 7 === 6) ? 'color:#0056b3;' : '';
            // 💡 [통합 캘린더] 공휴일 표시 — 평일이어도 공휴일이면 일요일과 같은 빨간색 + 아래 점(●) 표시
            let dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(i).padStart(2, '0');
            let isHol = (window.isHoliday && window.isHoliday(dateStr));
            let holStyle = isHol ? 'color:#e03131;' : '';
            let holDot = isHol ? '<span style="display:block; font-size:8px; line-height:1; margin-top:1px;">●</span>' : '';
            html += `<div class="cal-date ${isTarget}" style="${isTarget ? '' : (holStyle || isSunday + isSaturday)}" onclick="selectDateFromCalendar(${year}, ${month}, ${i})" title="${isHol ? '공휴일' : ''}">${i}${holDot}</div>`;
            cellCount++;
        }
        let nextDay = 1; while (cellCount % 7 !== 0) { html += `<div class="cal-date dim">${nextDay++}</div>`; cellCount++; } html += `</div>`;

        popup.innerHTML = html; popup.style.display = 'block';

        // 배경 클릭 시 달력 닫기 — 오버레이 방식
        let calOvl = document.getElementById('calendar-bg-overlay');
        if (!calOvl) {
            calOvl = document.createElement('div');
            calOvl.id = 'calendar-bg-overlay';
            calOvl.style.cssText = 'position:fixed; inset:0; z-index:999999; background:transparent; cursor:default;';
            calOvl.addEventListener('click', function() {
                popup.style.display = 'none';
                calOvl.remove();
            });
            document.body.appendChild(calOvl);
        }
        // popup은 오버레이 위에 떠야 함
        popup.style.zIndex = '1000000';

        if (!keepPos && window.currentCalendarTarget) {
            let rect = window.currentCalendarTarget.getBoundingClientRect();
            popup.style.top = '0px'; popup.style.left = '0px'; 
            let popupH = popup.offsetHeight; let topPos = rect.bottom + window.scrollY + 5;
            if (rect.bottom + popupH + 15 > window.innerHeight) topPos = Math.max(window.scrollY + 5, rect.top + window.scrollY - popupH - 5);
            let leftPos = Math.min(rect.left + window.scrollX, window.innerWidth - popup.offsetWidth - 20);
            window.calendarFixedPos = { top: topPos, left: leftPos };
        }
        if (window.calendarFixedPos) { popup.style.top  = window.calendarFixedPos.top  + 'px'; popup.style.left = window.calendarFixedPos.left + 'px'; }
    };

    // 💡 [버그 수정] 달력을 "여는" click과 "바깥 클릭이라 닫는" 이 리스너가 같은 이벤트 버블링 한 번에
    //    같이 실행됐다. showGenericCalendar(input)로 여는 경우(input의 onclick → 통합 캘린더 오픈)
    //    이 click 이벤트가 그대로 document까지 버블링되는데, 그 트리거였던 input 자신은 .date-clickable
    //    클래스가 없어(그건 메인 Gantt 표 셀 전용) "바깥 클릭"으로 오인되어 열리자마자 곧바로 닫혔다 —
    //    즉 팝업이 화면에 그려지기도 전에 block→none으로 바뀌어 "달력이 아예 안 뜨는" 것처럼 보였다.
    //    (Summary 마일스톤 날짜칸뿐 아니라 히스토리 삭제범위·공휴일 등록 등 showGenericCalendar를 쓰는
    //    모든 기존 필드가 똑같이 영향받고 있었음 — 재현 테스트로 확인)
    //    지금 막 이 팝업을 연 그 input(currentCalendarGenericInput) 클릭은 "바깥 클릭"에서 제외한다.
    document.addEventListener('click', function(e) {
        const popup = document.getElementById('calendar-popup');
        if (popup && popup.style.display === 'block') {
            // 💡 트리거가 input 자신인 경우(showGenericCalendar(this))뿐 아니라, Summary 마일스톤 날짜칸의
            //    "📅 아이콘"처럼 별도 요소를 눌러 여는 경우도 있다 — 그 아이콘(.ms-cal-btn) 클릭도 함께 제외.
            const isCalendarTriggerInput = window.currentCalendarGenericInput && e.target === window.currentCalendarGenericInput;
            const isCalendarTriggerIcon = e.target.closest && e.target.closest('.ms-cal-btn');
            if (!popup.contains(e.target) && !e.target.closest('.date-clickable') && !isCalendarTriggerInput && !isCalendarTriggerIcon) popup.style.display = 'none';
        }
        if (!e.target.closest('.no-td')) document.querySelectorAll('.row-actions.show').forEach(el => el.classList.remove('show'));
    });

    function escapeHtml(unsafe) { if (!unsafe) return ""; return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

    // 💡 [2026-08-27] boldBrackets 매개변수 추가 — "업무 상세내용"만 [대괄호] Bold 처리를 끄기 위함.
    //    기본값 true로 기존 호출부(답변/기타 텍스트/번역 결과 등)는 전부 그대로 동작함.
    function linkifyAndEscape(text, boldBrackets) {
        if (boldBrackets === undefined) boldBrackets = true;
        if (!text) return ""; let safeText = escapeHtml(text);
        const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gim; safeText = safeText.replace(emailPattern, '<a href="mailto:$1" style="color:#2c5f8a; text-decoration:underline;">$1</a>');
        const urlPattern = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim; safeText = safeText.replace(urlPattern, '<a href="$1" target="_blank" style="text-decoration: none; display: inline-block; margin-left: 2px; font-size:11px;" title="$1">⬇️</a>');
        const pseudoUrlPattern = /(^|[^\/a-zA-Z0-9])(www\.[\S]+(\b|$))/gim; safeText = safeText.replace(pseudoUrlPattern, '$1<a href="http://$2" target="_blank" style="text-decoration: none; display: inline-block; margin-left: 2px; font-size:11px;" title="$2">⬇️</a>');
        safeText = safeText.replace(/\r/g, '');
        safeText = safeText.replace(/(\n[ \t]*){2,}/g, '\n'); // 💡 줄바꿈 사이의 공백까지 포함하여 압축
        // ✅ [추가할 코드] 2칸 이상 연속된 공백(스페이스)을 1칸으로 압축
        safeText = safeText.replace(/ {2,}/g, ' ');
        // ✅ [대괄호 단어] Bold 처리 (boldBrackets=false면 건너뜀)
        if (boldBrackets) safeText = safeText.replace(/(\[[^\]]+\])/g, '<b>$1</b>');
        return safeText.replace(/\n/g, '<br>');
    }  // ← 이 닫는 괄호가 빠져있음

    function injectMailRawBtn(html, row, rowIndex) {
        // 💡 [2026-08-28 버그 수정] 예전엔 `if (!row._mailRaw) return html;`로 함수 맨 앞에서 막아서,
        //    _mailRaw가 안 남은(원문 백업 이전에 등록됐거나 어떤 이유로 유실된) 과거 메일분석 업무는
        //    "AI 분석 날짜로 복원" 버튼까지 통째로 안 보였다 — "항상 노출하기로 했다"던 지난 수정이 이
        //    가드 때문에 실제로는 과거 업무에 적용이 안 되고 있었음. "원문 보기"는 원문 자체가 없으면
        //    보여줄 게 없어 _mailRaw가 있을 때만 노출하되, "AI 분석 날짜로 복원"은 _mailRaw 없이도
        //    _aiOrigStart/_aiOrigPlan 백업이나 상세내용에서 추출한 날짜만으로 동작 가능하므로 그 중
        //    하나라도 있으면 노출한다.
        const hasMailRaw = !!row._mailRaw;
        const canRestoreDate = !!(row._aiOrigStart || row._aiOrigPlan || window._extractAiOrigStartFromContent(row));
        if (!hasMailRaw && !canRestoreDate) return html;

        const _en = window._currentLang === 'en';
        let btn = '';
        if (hasMailRaw) {
            btn += `<button class="detail-inline-action-btn" onclick="window.showGanttMailRaw(${rowIndex}); event.stopPropagation();" style="font-size:11px; padding:2px 8px; margin-left:6px; background:#e7f3ff; color:#1971c2; border:1px solid #a5c8f0; border-radius:5px; cursor:pointer; vertical-align:middle;">📧 ${_en ? 'View Mail Source' : '원문 보기'}</button>`;
        }
        if (canRestoreDate) {
            // 💡 [2026-08-24 신규] 백업(_aiOrigStart/_aiOrigPlan)이 없으면 window.restoreAiTaskDate()가
            //    "상세내용" 첫 줄에 항상 같이 적히는 [업무유형][발신자→수신자] YYYY-MM-DD 형식에서
            //    시작일을 추출해 대신 복원한다(완료일은 이 형식에 없어 과거 업무는 복원 대상 제외).
            //    (Ctrl/Shift+클릭 시 다중 선택된 행 전부 일괄 복원 — window.restoreAiTaskDate 참고)
            btn += `<button class="detail-inline-action-btn" onclick="window.restoreAiTaskDate(${rowIndex}, event); event.stopPropagation();" title="${_en ? 'Restore to the start/end date AI originally extracted from the mail (falls back to the date embedded in the detail text for older tasks without a backup). Ctrl/Shift+click to apply to all currently selected rows.' : '시작일/완료일을 메일 분석 당시 AI가 뽑았던 원본 날짜로 되돌립니다 (백업이 없는 과거 업무는 상세내용에 적힌 날짜에서 시작일만 추출해 복원). Ctrl(⌘) 또는 Shift를 누른 채 클릭하면 지금 선택된 행 전부에 한 번에 적용됩니다.'}" style="font-size:11px; padding:2px 8px; margin-left:${hasMailRaw ? '4' : '6'}px; background:#fff3e0; color:#b85c00; border:1px solid #ffcc80; border-radius:5px; cursor:pointer; vertical-align:middle;">📅 ${_en ? 'Restore AI Date' : 'AI 분석 날짜로 복원'}</button>`;
        }
        if (!btn) return html;

        // 💡 [2026-08-27 버그 수정] "업무 상세내용"의 [대괄호] Bold 처리를 껐더니(linkifyAndEscape의
        //    boldBrackets=false) [출처]가 더 이상 <b>[출처]</b>로 안 나와서, <b> 태그를 필수로 찾던 이
        //    정규식이 매치를 못 해 버튼이 통째로 안 그려지고 있었다. <b> 요구조건은 제거했고, 그마저도
        //    [출처] 자체가 없는(더 옛날 형식) 콘텐츠는 정규식이 아예 매치 안 되어 조용히 무시됐었으므로,
        //    그 경우엔 그냥 맨 끝에 버튼을 붙인다(위치만 다를 뿐 항상 노출은 보장).
        if (/\[출처\]/.test(html)) {
            return html.replace(/(\[출처\](?:<\/b>)?[\s\S]*?)(<br>|$)/, function(m, p1, p2) { return p1 + btn + p2; });
        }
        return html + btn;
    }

    function parseDateValue(value) {
        if (value === "" || value === null || value === undefined) return null;
        let y, m, d;
        if (typeof value === 'number') {
            const date = new Date((value - 25569) * 86400 * 1000); y = date.getUTCFullYear(); m = date.getUTCMonth(); d = date.getUTCDate();
        } else if (typeof value === 'string') {
            let str = value.trim(); let matchMMDD = str.match(/^(\d{1,2})[-/.](\d{1,2})$/);
            if (matchMMDD) { y = new Date().getFullYear(); m = parseInt(matchMMDD[1], 10) - 1; d = parseInt(matchMMDD[2], 10); } 
            else {
                let match = str.match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})/);
                if (match) { y = parseInt(match[1], 10); if (y < 100) y += 2000; m = parseInt(match[2], 10) - 1; d = parseInt(match[3], 10); } else return null;
            }
        } else return null;
        if (y < 2010) y = new Date().getFullYear(); if (y < 2000 || y > 2100) return null; 
        let dt = new Date(y, m, d); dt.setHours(0,0,0,0); return { ts: dt.getTime() };
    }

    function formatTableDate(ts) {
        if (!ts) return ""; let d = new Date(ts); if (isNaN(d.getTime())) return "";
        const mmdd = String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
        // 💡 연도 표시가 없으면 연말~연초에 걸친 일정에서 어느 날짜가 더 빠른지 헷갈림 —
        //    작은 글씨(2자리 연도)로 옆에 붙여서 표는 여전히 빽빽하지 않게 유지
        const yy = String(d.getFullYear()).slice(-2);
        return mmdd + `<span style="font-size:9px; color:#999; margin-left:1px;">'${yy}</span>`;
    }

    function formatTsToYMD(ts) {
        if (!ts) return ""; let d = new Date(ts);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
    }

    function getDurationDays(val) {
        if (val === undefined || val === null || val.toString().trim() === '') return null;
        let match = val.toString().trim().match(/^(\d+)(일|days)?$/i);
        if (match) { let days = parseInt(match[1], 10); if (days < 10000) return days; } return null;
    }

    function checkStrikeThrough(worksheet, r, c) {
        try {
            if (c === -1 || c === undefined) return false;
            let cellAddress = XLSX.utils.encode_cell({r: r, c: c}); let cell = worksheet[cellAddress];
            if (!cell) return false;
            if (cell.s && cell.s.font && cell.s.font.strike) return true;
            if (cell.r && Array.isArray(cell.r) && cell.r.some(run => run.s && run.s.strike)) return true;
            if (cell.h && typeof cell.h === 'string' && (cell.h.includes('<s') || cell.h.includes('strike') || cell.h.includes('line-through'))) return true;
        } catch (e) { } return false;
    }

    // 💡 [버그 수정] 헤더로 "전체 펼치기"를 켜둔 상태인지 재렌더링을 넘나들며 기억하는 플래그.
    //    renderTable()이 매번 여기 값을 보고 펼침 class를 다시 적용한다(위 renderTable 참고).
    window._allDetailExpanded = false;

    // 💡 [2026-08-24 재도입] 개별 셀 클릭 = 그 셀만 접기/펼치기, 헤더 클릭 = 전체 접기/펼치기(기준 재정립).
    //    예전 버전(제거 전)의 진짜 문제는 "개별 클릭 자체"가 아니라 두 가지였다:
    //    ① 셀을 하나 클릭하면 이전에 펼쳐져 있던 "다른" 셀들이 전부 자동으로 접혔음(한 번에 하나만
    //       펼침 유지) — 여러 행을 나란히 펼쳐두고 비교하고 싶을 때 불편했다.
    //    ② 개별 클릭이 window._allDetailExpanded(전체 펼치기 플래그)를 무조건 false로 되돌려서,
    //       "전체 펼치기"를 켜둔 상태에서 셀 하나만 눌러도 다른 모든 행이 통째로 접혀버렸다.
    //    이번엔 개별 토글이 "그 셀 하나만" 건드리고 다른 셀·전체 플래그는 전혀 손대지 않는다 —
    //    헤더와 개별 셀은 완전히 독립된 두 개의 스위치. 추가로, 텍스트를 드래그해서 선택하려던
    //    클릭(=드래그 후 선택 영역이 남아있는 클릭)은 토글에서 제외해 "읽으려고 클릭했는데 접힌다"는
    //    구버전의 원래 불편함도 같이 없앤다.
    window.toggleDetailExpand = function(td, event, rowIndex, cellIndex) {
        if (event) event.stopPropagation();
        // 💡 [2026-08-24 버그 수정] 위 stopPropagation 때문에 document의 "바깥 클릭 시 팝업 닫기"
        //    리스너(toggleRowActions 안)가 이 클릭을 못 보게 됨 — 그래서 WBS 상하좌우+- 팝업을 열어둔
        //    채로 상세내용 셀을 클릭하면 팝업이 안 닫히는 사고가 있었다(재도입 때 이 처리가 누락됨).
        //    여기서 직접 닫아줘서 다른 곳 클릭했을 때와 동일하게 동작하도록 한다.
        const wbsPopup = document.getElementById('row-action-popup');
        if (wbsPopup && wbsPopup.style.display !== 'none') { wbsPopup.style.display = 'none'; window.clearRowHighlight(); }
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0 && td.contains(sel.anchorNode)) return; // 텍스트 선택 중이면 펼치기/접기 토글은 생략
        const nowExpanded = td.classList.toggle('detail-td-expanded');
        // 💡 [2026-08-25 버그 수정] 개별 셀 펼침은 DOM class에만 있어서, WBS 상하좌우+-(행 이동/레벨
        //    변경/추가/삭제)가 recalculateSchedules()→renderTable()로 tbody를 통째로 새로 그릴 때마다
        //    사라졌다("전체 펼치기"만 window._allDetailExpanded로 재렌더링에도 살아남았음). 행 객체
        //    (globalData[rowIndex])에도 같이 저장해서, 재렌더링 후에도 이 셀은 계속 펼쳐진 채로 나오게 한다.
        if (typeof globalData !== 'undefined' && globalData[rowIndex]) {
            const row = globalData[rowIndex];
            row._expandedDetailCols = row._expandedDetailCols || {};
            if (nowExpanded) row._expandedDetailCols[cellIndex] = true; else delete row._expandedDetailCols[cellIndex];
        }
    };
    // 상세내용 헤더 클릭 — 전체 펼치기/접기 토글 (개별 셀 상태와 무관하게 항상 "전부"를 한 방향으로 맞춤)
    window.toggleAllDetailExpand = function(th, event) {
        if (event) event.stopPropagation();
        const allDetail = document.querySelectorAll('td.detail-td');
        const arrow = document.getElementById('detail-th-arrow');
        if (window._allDetailExpanded) {
            allDetail.forEach(el => el.classList.remove('detail-td-expanded'));
            if (arrow) arrow.textContent = '▼';
            window._allDetailExpanded = false;
            // 💡 "전체 접기"는 개별로 펼쳐뒀던 셀의 기억(row._expandedDetailCols)도 같이 지운다 —
            //    안 지우면 다른 행을 이동시키는 등 다음 재렌더링 때 그 셀들만 도로 펼쳐져서 혼란스러움.
            if (typeof globalData !== 'undefined') globalData.forEach(function(r) { if (r) r._expandedDetailCols = {}; });
        } else {
            allDetail.forEach(el => el.classList.add('detail-td-expanded'));
            if (arrow) arrow.textContent = '▲';
            window._allDetailExpanded = true;
        }
    };

    window.makeEditable = function(td) {
        if(td.getAttribute('contenteditable') === 'true') return;
        // 💡 [2026-08-24] 편집 시작 전 "개별 클릭으로 이미 펼쳐둔 상태였는지"를 기억해둔다 — 안 그러면
        //    편집 끝나고 blurCell에서 무조건 접어버려서, 일부러 펼쳐놓고 고치던 칸이 편집 후 도로 접혀버림.
        td.dataset._wasExpanded = td.classList.contains('detail-td-expanded') ? '1' : '0';
        td.classList.add('detail-td-expanded'); // 💡 편집 중엔 접혀서 잘리지 않도록 자동으로 펼침
        td.dataset.displayHtml = td.innerHTML; td.setAttribute('contenteditable', 'true');
        let raw = td.getAttribute('data-raw'); if (raw) td.innerText = decodeURIComponent(raw); else td.innerText = "";
        td.focus(); let range = document.createRange(); let sel = window.getSelection(); range.selectNodeContents(td); sel.removeAllRanges(); sel.addRange(range);

        // ⌨️ Enter = 편집 완료(저장), Shift+Enter = 줄바꿈 삽입
        td.onkeydown = function(ev) {
            if (ev.key === 'Enter') {
                if (ev.shiftKey) {
                    ev.preventDefault();
                    document.execCommand('insertText', false, '\n');
                } else {
                    ev.preventDefault();
                    td.blur();
                }
            }
        };
    };

    window.blurCell = function(td, rowIndex, colIndex) {
        td.removeAttribute('contenteditable');
        // 💡 편집 종료 시 기본 높이로 복귀 — 단, "전체 펼치기" 모드 중이었거나(_allDetailExpanded),
        //    편집 시작 전에 이미 개별 클릭으로 펼쳐둔 칸이었다면(_wasExpanded) 접지 않고 그대로 유지.
        if (!window._allDetailExpanded && td.dataset._wasExpanded !== '1') td.classList.remove('detail-td-expanded');
        delete td.dataset._wasExpanded;
        let newText = td.innerText.trim(); let rawAttr = td.getAttribute('data-raw'); let oldText = rawAttr ? decodeURIComponent(rawAttr).trim() : "";
        
        if (newText !== oldText) {
            logChange(rowIndex, colIndex, oldText, newText); globalData[rowIndex][colIndex] = newText; let row = globalData[rowIndex];
            
            if (colIndex === colIdx.devStage) row._origDev = newText;
            if (colIndex === colIdx.taskType1) row._origT1 = newText;
            if (colIndex === colIdx.taskType2) row._origT2 = newText;
            if (colIndex === colIdx.taskType3) row._origT3 = newText;
            if (colIndex === colIdx.taskType4) row._origT4 = newText;
            // 💡 단일 "개발업무(WBS)" 열 모드: 레벨로 어느 필드를 수정한 것인지 판단
            if (colIndex === colIdx.wbs && colIdx.devStage === -1) {
                if (row._level === 0) row._origDev = newText;
                else if (row._level === 1) row._origT1 = newText;
                else if (row._level === 2) row._origT2 = newText;
                else if (row._level === 3) row._origT3 = newText;
                else row._origT4 = newText;
            }
            
            if (colIndex === colIdx.plan) {
                if (colIdx.period !== -1) globalData[rowIndex][colIdx.period] = "";
                if (colIdx.dur1 !== -1) globalData[rowIndex][colIdx.dur1] = "";
                if (colIdx.dur2 !== -1) globalData[rowIndex][colIdx.dur2] = "";
                if (colIdx.dur3 !== -1) globalData[rowIndex][colIdx.dur3] = "";
                if (colIdx.dur4 !== -1) globalData[rowIndex][colIdx.dur4] = "";
                globalData[rowIndex]._planForced = true; globalData[rowIndex]._startForced = false; 
            }
            if (colIndex === colIdx.start) {
                globalData[rowIndex]._startForced = true; globalData[rowIndex]._planForced = false;
                if (colIdx.plan !== -1) globalData[rowIndex][colIdx.plan] = "";
            }
            if (colIndex === colIdx.period || colIndex === colIdx.dur1 || colIndex === colIdx.dur2 || colIndex === colIdx.dur3 || colIndex === colIdx.dur4) {
                globalData[rowIndex]._planForced = false; if (colIdx.plan !== -1) globalData[rowIndex][colIdx.plan] = "";
                // 💡 편집한 칸이 실제로 반영되도록, 같은 행의 다른 레벨별 숨겨진 소요일 칸(dur1~4)도 함께 비움
                //    (레벨별 dur 칸이 화면의 period 칸보다 우선순위가 높아 남아있으면 편집이 무시됨)
                if (colIdx.dur1 !== -1 && colIndex !== colIdx.dur1) globalData[rowIndex][colIdx.dur1] = "";
                if (colIdx.dur2 !== -1 && colIndex !== colIdx.dur2) globalData[rowIndex][colIdx.dur2] = "";
                if (colIdx.dur3 !== -1 && colIndex !== colIdx.dur3) globalData[rowIndex][colIdx.dur3] = "";
                if (colIdx.dur4 !== -1 && colIndex !== colIdx.dur4) globalData[rowIndex][colIdx.dur4] = "";
            }

            td.setAttribute('data-raw', encodeURIComponent(newText));
            
            if ([colIdx.start, colIdx.plan, colIdx.period, colIdx.dur1, colIdx.dur2, colIdx.dur3, colIdx.dur4, colIdx.devStage, colIdx.taskType1, colIdx.taskType2, colIdx.taskType3, colIdx.taskType4, colIdx.wbs].includes(colIndex)) {
                window.recalculateSchedules();
            } else { renderTable(globalData); applyFilters(); window.pushUndoSnapshot(); }
        } else { td.innerHTML = td.dataset.displayHtml || oldText; }
   };  // ← blurCell 끝

    window.updateStatus = function(select, rowIndex, colIndex) {
        const newVal = select.value;
        const oldVal = decodeURIComponent(select.closest('td').getAttribute('data-raw') || '');
        if (newVal !== oldVal) {
            // 하위 행도 함께 변경
            window.applyStatusToChildren(rowIndex, colIndex, newVal);
            renderTable(globalData); applyFilters();
            window.pushUndoSnapshot();
        }
    };

