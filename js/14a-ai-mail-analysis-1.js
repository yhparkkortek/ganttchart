// [분리됨] 원본: js/14-ai-mail-analysis.js 의 1~772행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: 메일 분석 → 간트차트 자동 추가 (Gemini AI) 1/2
// =========================================================
// 📧 메일 분석 → 간트차트 자동 추가 (Gemini AI)
// =========================================================

window.showMailAnalyzer = function() {
    // API 키 로드 (선택된 AI 제공사 기준)
    window.refreshAiKeyPanel();

    // 위치 선택 드롭다운 채우기
        window.populateInsertPosition();
    // ✅ 기본 프롬프트 미리 설정
    // 💡 [버그 수정] getSystemPrompt()가 아니라 _msBuildDefaultPrompt()를 직접 호출 — localStorage에
    //    저장된(오염됐을 수 있는) 프롬프트를 거치지 않고 항상 진짜 코드 기본값을 담도록 함
        if (!window._defaultPromptTemplate) {
        window._defaultPromptTemplate = window._msBuildDefaultPrompt('${projectAssignee}', '${projectCustomer}', '${projectModel}', '${projectInch}', '${mailText}').replace(new Date().toISOString().split('T')[0], '${todayStr}');
    }

    // 초기화
    document.getElementById('mail-content-input').value = '';
    document.getElementById('mail-result-section').style.display = 'none';
    document.getElementById('mail-error').style.display = 'none';
    document.getElementById('mail-analyzer-overlay').style.display = 'flex';
    window.bringModalToFront('mail-analyzer-overlay');

    // 💡 새로 열 때는 "AI 분석" 버튼이 다시 전체 폭 단일 버튼으로 시작
    const analyzeBtn = document.getElementById('mail-analyze-btn');
    if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = window._currentLang === 'en' ? '🤖 AI Analyze' : '🤖 AI 분석';
        analyzeBtn.style.background = '#e8f4fd';
        analyzeBtn.style.borderColor = '#a5c8f0';
    }
    const loadingDiv = document.getElementById('mail-loading');
    if (loadingDiv) loadingDiv.style.display = 'none';
};

// 💡 텍스트박스에 다시 타이핑 시작하면, 이전 분석 결과 표시(✅완료/⚠️실패)로 남아있던
//    AI 분석 버튼을 원래 상태로 되돌림 (한 번만 등록되도록 플래그로 방지)
if (!window._mailInputListenerBound) {
    window._mailInputListenerBound = true;
    document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'mail-content-input') {
            const btn = document.getElementById('mail-analyze-btn');
            if (btn && !btn.disabled) {
                btn.innerHTML = window._currentLang === 'en' ? '🤖 AI Analyze' : '🤖 AI 분석';
                btn.style.background = '#e8f4fd';
                btn.style.borderColor = '#a5c8f0';
            }
        }
    });
}

window.closeMailAnalyzer = function(e) {
    if (e) return; // 배경 클릭 무시, X 버튼으로만 닫기
    document.getElementById('mail-analyzer-overlay').style.display = 'none';
};

window.saveGeminiKey = function() {
    const key = document.getElementById('mail-gemini-key').value.trim();
    if (!key) { alert('API 키를 입력해주세요.'); return; }
    const cfg = window.AI_PROVIDERS[window.getActiveAiProvider()] || window.AI_PROVIDERS.gemini;
    localStorage.setItem(cfg.keyName, key);
    const status = document.getElementById('mail-key-status');
    status.textContent = '✅ API 키가 저장되었습니다.';
    status.style.color = '#28a745';
};

window.clearGeminiKey = function() {
    const cfg = window.AI_PROVIDERS[window.getActiveAiProvider()] || window.AI_PROVIDERS.gemini;
    localStorage.removeItem(cfg.keyName);
    document.getElementById('mail-gemini-key').value = '';
    const status = document.getElementById('mail-key-status');
    status.textContent = '🗑️ API 키가 삭제되었습니다.';
    status.style.color = '#dc3545';
};

// ─── 🤖 AI 제공사 설정 (Gemini / Groq / Mistral) ───
window.AI_PROVIDERS = {
    gemini:  { label: 'Gemini (Google)',  keyName: 'gemini_api_key',  defaultModel: 'gemini-3.5-flash-lite',
               placeholder: 'AIza...', guideUrl: 'https://aistudio.google.com/apikey',
               guideText: '① aistudio.google.com 접속 → 구글 계정 로그인\n② 좌측 메뉴 [Get API key] → [Create API key] 클릭\n③ 생성된 키(AIza로 시작)를 복사 → 아래 입력란에 붙여넣고 저장\n※ 무료 발급 가능 (카드 등록 불필요)',
               guideTextEn: '① Go to aistudio.google.com → Sign in with Google\n② Left menu [Get API key] → [Create API key]\n③ Copy the key (starts with AIza) → paste below and save\n※ Free, no card required',
               // 💡 [2026-08-20] gemini-2.5-flash-lite가 "신규 사용자"에게 차단되는 게 확인되어(기존 사용자만 유예)
               //    3.x 세대로 전면 교체. 무료 등급 RPM/일일 한도 숫자는 구버전 값을 그대로 옮긴 추정치이므로
               //    실제 한도가 다르면 aistudio.google.com에서 재확인 필요.
               models: [
                   { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', tier: 'free',         note: '🟢 무료 · 가장 빠름' },
                   { id: 'gemini-3.5-flash',      label: 'Gemini 3.5 Flash',      tier: 'free_limited', note: '🟡 무료(제한) · 균형' },
                   { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro',        tier: 'paid',         note: '🔴 유료 · 최고 품질' },
               ]},
    groq:    { label: 'Groq (오픈모델 무료 호스팅)',    keyName: 'groq_api_key',    defaultModel: 'openai/gpt-oss-120b',
               placeholder: 'gsk_로 시작하는 Groq API 키', guideUrl: 'https://console.groq.com/keys',
               guideText: '💡 Groq는 오픈소스 모델을 무료로 호스팅하는 플랫폼입니다.\n   키 1개로 아래 모든 모델 사용 가능\n\n① console.groq.com 접속 → 이메일 또는 구글 계정으로 로그인\n② 좌측 메뉴 [API Keys] → [Create API Key] 클릭\n③ 생성된 키(gsk_로 시작)를 복사 → 아래 입력란에 붙여넣고 저장\n※ 무료 발급 가능 (카드 등록 불필요)',
               guideTextEn: '💡 Groq is a platform that hosts open-source models for free.\n   One key covers all models below.\n\n① Go to console.groq.com → Sign in with email or Google\n② Left menu [API Keys] → [Create API Key]\n③ Copy the key (starts with gsk_) → paste below and save\n※ Free, no card required',
               // 💡 [2026-08-20] 기존 llama-3.3-70b-versatile / llama-4-maverick / deepseek-r1-distill-llama-70b가
               //    Groq 공식 지원 모델 목록(console.groq.com/docs/models)에서 전부 빠짐(사용중단) → 현재 목록으로 교체.
               //    Groq 모델 라인업은 자주 바뀌므로 또 실패하면 위 문서에서 최신 model ID 재확인 필요.
               models: [
                   { id: 'openai/gpt-oss-120b',  label: 'GPT-OSS 120B (OpenAI 오픈모델)', tier: 'free', note: '🟢 무료 · 범용 추천' },
                   { id: 'openai/gpt-oss-20b',   label: 'GPT-OSS 20B (경량)',              tier: 'free', note: '🟢 무료 · 빠름' },
                   { id: 'groq/compound',        label: 'Groq Compound (도구 연동 에이전트)', tier: 'free', note: '🟢 무료 · 웹검색 등 도구 사용' },
               ]},
    mistral: { label: 'Mistral (프랑스 AI)',  keyName: 'mistral_api_key', defaultModel: 'mistral-small-latest',
               placeholder: '(Mistral API 키)', guideUrl: 'https://console.mistral.ai/api-keys',
               guideText: '① console.mistral.ai 접속 → 계정 로그인\n② 좌측 메뉴 [API Keys] → [Create new key] 클릭\n③ 생성된 키를 복사 → 아래 입력란에 붙여넣고 저장\n※ Experiment 요금제 무료 (카드 등록 불필요)',
               guideTextEn: '① Go to console.mistral.ai → Sign in\n② Left menu [API Keys] → [Create new key]\n③ Copy the key → paste below and save\n※ Free under Experiment plan, no card required',
               models: [
                   { id: 'mistral-small-latest', label: 'Mistral Small', tier: 'free', note: '🟢 무료 · 속도 우선' },
                   { id: 'mistral-large-latest', label: 'Mistral Large', tier: 'paid', note: '🔴 유료 · 품질 우선' },
               ]},
    openai:  { label: 'OpenAI (GPT)',  keyName: 'openai_api_key', defaultModel: 'gpt-5.6-luna',
               placeholder: 'sk-로 시작하는 OpenAI API 키', guideUrl: 'https://platform.openai.com/api-keys',
               // 💡 다른 3곳(Gemini/Groq/Mistral)과 달리 OpenAI는 무료 등급이 없음 — 반드시 결제수단(카드) 등록 필요.
               guideText: '⚠️ 다른 AI와 달리 무료 등급이 없습니다 — 카드 등록(결제수단 연결) 후 사용량만큼 과금됩니다.\n\n① platform.openai.com/api-keys 접속 → OpenAI 계정 로그인(없으면 가입)\n② 좌측 메뉴 [Billing]에서 카드 등록 (결제수단 미등록 시 키가 있어도 호출 실패)\n③ [+ Create new secret key] 클릭 → 생성된 키(sk-로 시작)를 복사\n④ 아래 입력란에 붙여넣고 저장\n※ 신규 가입 시 소액 무료 크레딧이 한시적으로 제공될 수 있으나, 소진 후에는 카드로 과금됩니다.',
               guideTextEn: '⚠️ Unlike the other providers, OpenAI has no free tier — you must add a payment method; usage is billed.\n\n① Go to platform.openai.com/api-keys → Sign in (or sign up)\n② Left menu [Billing] → add a card (calls fail without a payment method, even with a valid key)\n③ Click [+ Create new secret key] → copy the key (starts with sk-)\n④ Paste below and save\n※ New accounts may get a small temporary free credit, but billing applies afterward.',
               models: [
                   { id: 'gpt-5.6-luna',  label: 'GPT-5.6 Luna',  tier: 'paid', note: '🟡 저비용 · 대량처리용' },
                   { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', tier: 'paid', note: '🟠 균형 · 비용대비 성능' },
                   { id: 'gpt-5.6-sol',   label: 'GPT-5.6 Sol',   tier: 'paid', note: '🔴 최고 품질 · 고비용' },
               ]}
};

window.getActiveAiProvider = function() {
    return localStorage.getItem('ai_provider') || 'gemini';
};
window.getActiveAiKey = function() {
    const cfg = window.AI_PROVIDERS[window.getActiveAiProvider()] || window.AI_PROVIDERS.gemini;
    return localStorage.getItem(cfg.keyName);
};
// 💡 [2026-08-20] 예전에 저장해둔 모델 선택값이 그 사이 제공사 쪽에서 사용중단된 경우를 대비한 목록.
//    getActiveAiModel()이 이 목록에 걸리면 저장값을 무시하고 현재 defaultModel로 자동 교체(+localStorage 갱신)해서,
//    "예전에 한 번 저장해둔 사용자"가 계속 같은 오류를 겪는 걸 막는다.
window._AI_DEPRECATED_MODEL_IDS = [
    'gemini-2.5-flash-lite', 'gemini-2.5-flash',
    'llama-3.3-70b-versatile', 'llama-4-maverick', 'deepseek-r1-distill-llama-70b'
];
window.getActiveAiModel = function() {
    const provider = window.getActiveAiProvider();
    const cfg = window.AI_PROVIDERS[provider] || window.AI_PROVIDERS.gemini;
    const saved = localStorage.getItem('ai_model_' + provider);
    if (saved && window._AI_DEPRECATED_MODEL_IDS.indexOf(saved) !== -1) {
        console.warn(`[AI 모델] 저장된 모델("${saved}")이 사용중단되어 기본값("${cfg.defaultModel}")으로 자동 교체합니다.`);
        localStorage.setItem('ai_model_' + provider, cfg.defaultModel);
        return cfg.defaultModel;
    }
    return saved || cfg.defaultModel;
};

// 💡 [2026-08-20] [자동 모델 페일오버] AI 제공사가 예고 없이 특정 모델을 사용중단시켜도
//    AI 분석 기능 전체가 죽지 않도록 하는 공용 네트워크 호출 헬퍼. 붙여넣기분석/AI프롬프트개선/
//    메일자동처리(ms) 3곳이 전부 이걸 거친다 — 한 곳만 고치면 전체에 적용됨.
//    - "모델이 사용중단/존재하지 않음" 유형 에러를 감지하면, 3초 대기 재시도 없이 같은 provider의
//      다음 후보 모델로 즉시 전환해서 재시도한다.
//    - 전환해서 성공하면 그 모델을 localStorage에 새 기본값으로 저장 — 다음 호출부터는 바로 그 모델 사용
//      (사람이 코드를 고치기 전까지 매번 실패→전환을 반복하지 않도록 자가치유).
//    - 그 외 에러(키 오류/네트워크 일시 오류 등)는 같은 모델로 기존처럼 짧게 재시도.
window._AI_MODEL_DEPRECATED_RE = /does not exist|no longer available|decommissioned|not found|deprecated/i;

window.callAiBackend = async function(apiKey, prompt, opts) {
    opts = opts || {};
    const provider = window.getActiveAiProvider();
    const cfg = window.AI_PROVIDERS[provider] || window.AI_PROVIDERS.gemini;
    const GAS_URL = localStorage.getItem('gas_server_url') ||
        'https://script.google.com/macros/s/AKfycbzB1f7lKdYRmJM5Iu38qUVGKat_51ggZR3_4aOsITjiqBuXN1wBAzixNp1CmgO_eJICfg/exec';

    const activeModel = window.getActiveAiModel();
    // 시도 순서: 현재 활성 모델 → 나머지 후보 모델(같은 provider, 중복 제거)
    const candidates = [activeModel].concat((cfg.models || []).map(m => m.id).filter(id => id !== activeModel));

    const maxRetryPerModel = opts.maxRetryPerModel || 2;
    const retryDelayMs = opts.retryDelayMs != null ? opts.retryDelayMs : 3000;
    let lastErr = null;

    for (let ci = 0; ci < candidates.length; ci++) {
        const model = candidates[ci];
        let isDeprecated = false;
        for (let attempt = 1; attempt <= maxRetryPerModel; attempt++) {
            if (opts.isCancelled && opts.isCancelled()) return { ok: false, error: new Error('사용자가 중단함') };
            try {
                const res = await fetch(GAS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ userApiKey: apiKey, prompt, provider, model })
                });
                const data = await res.json();
                if (data.status !== 'success') throw new Error(data.message || '구글 서버 응답 오류');
                if (model !== activeModel) {
                    console.warn(`[AI 모델 자동전환] "${activeModel}" 실패 → "${model}"로 전환 성공. 기본값을 갱신합니다.`);
                    localStorage.setItem('ai_model_' + provider, model);
                    if (window.showToast) {
                        window.showToast(`⚠️ AI 모델("${activeModel}")이 사용 중단되어 "${model}"로 자동 전환했습니다.`);
                    }
                }
                return { ok: true, data, modelUsed: model, switched: model !== activeModel };
            } catch (err) {
                lastErr = err;
                isDeprecated = window._AI_MODEL_DEPRECATED_RE.test(err.message || '');
                if (isDeprecated) break; // 이 모델은 재시도해도 소용없음 → 바로 다음 후보 모델로
                if (attempt < maxRetryPerModel && !(opts.isCancelled && opts.isCancelled())) {
                    await new Promise(r => setTimeout(r, retryDelayMs));
                }
            }
        }
        // 💡 모델 자체가 죽은 게 아니라 키 오류/네트워크 등 다른 이유로 실패했다면,
        //    다른 모델로 바꿔봐야 소용없으므로 후보를 계속 순회하지 않고 여기서 바로 실패 처리
        if (!isDeprecated) return { ok: false, error: lastErr || new Error('알 수 없는 오류') };
    }
    return { ok: false, error: lastErr || new Error('알 수 없는 오류') };
};

window.onAiProviderChange = function() {
    const sel = document.getElementById('mail-ai-provider');
    if (!sel) return;
    localStorage.setItem('ai_provider', sel.value);
    window.refreshAiKeyPanel();
    window.refreshAiModelDropdown();
    // 모델 행 표시 보장 (provider 변경 시 숨겨진 경우 대비)
    const modelRow = document.getElementById('mail-ai-model-row');
    if (modelRow) modelRow.style.display = 'flex';
};

window.refreshAiModelDropdown = function() {
    const provider = window.getActiveAiProvider();
    const cfg = window.AI_PROVIDERS[provider] || window.AI_PROVIDERS.gemini;
    const modelSel = document.getElementById('mail-ai-model');
    if (!modelSel) return;
    const savedModel = window.getActiveAiModel(); // 💡 사용중단 모델 자동교체 로직을 타도록 직접 localStorage 대신 이 헬퍼 사용
    modelSel.innerHTML = cfg.models.map(m =>
        `<option value="${m.id}" ${m.id === savedModel ? 'selected' : ''}>${m.label} — ${m.note}</option>`
    ).join('');
};

// 모델별 추가 안내 (Groq 전용 — OpenAI 오픈모델(gpt-oss)은 Groq API 키로 사용)
window._MODEL_GUIDE = {
    'openai/gpt-oss-120b': { ko: '💡 Groq API 키로 사용합니다. OpenAI가 공개한 오픈소스 모델로 별도 발급 불필요 — Groq 키 하나로 이용 가능합니다.', en: '💡 Uses your Groq API key. An open-weight model released by OpenAI — no separate key needed.' },
    'openai/gpt-oss-20b':   { ko: '💡 Groq API 키로 사용합니다. 120B의 경량 버전으로 속도가 더 빠릅니다 — Groq 키 하나로 이용 가능합니다.', en: '💡 Uses your Groq API key. A lighter, faster variant of the 120B model.' },
    'groq/compound':        { ko: '💡 Groq API 키로 사용합니다. 웹검색 등 도구를 자동으로 함께 사용하는 에이전트형 시스템입니다.', en: '💡 Uses your Groq API key. An agentic system that can auto-use tools like web search.' },
};

window.onAiModelChange = function() {
    const provider = window.getActiveAiProvider();
    const modelSel = document.getElementById('mail-ai-model');
    if (!modelSel) return;
    localStorage.setItem('ai_model_' + provider, modelSel.value);

    // 모델별 추가 안내 표시
    const guideEl = document.getElementById('mail-model-guide');
    if (guideEl) {
        const g = window._MODEL_GUIDE[modelSel.value];
        if (g) {
            guideEl.textContent = (window._currentLang === 'en' && g.en) ? g.en : g.ko;
            guideEl.style.display = 'block';
        } else {
            guideEl.style.display = 'none';
        }
    }
};

window.refreshAiKeyPanel = function() {
    const provider = window.getActiveAiProvider();
    const cfg = window.AI_PROVIDERS[provider] || window.AI_PROVIDERS.gemini;
    const sel = document.getElementById('mail-ai-provider');
    if (sel) sel.value = provider;

    const labelEl = document.getElementById('mail-key-label');
    if (labelEl) labelEl.textContent = `🔑 ${cfg.label.split(' ')[0]} API`;
    const guideEl = document.getElementById('mail-key-guide');
    if (guideEl) guideEl.style.display = 'none';
    const linkBtn = document.getElementById('mail-key-link-btn');
    if (linkBtn) {
        linkBtn.setAttribute('onclick', `window.open('${cfg.guideUrl}', '_blank')`);
        linkBtn.title = (window._currentLang === 'en' && cfg.guideTextEn) ? cfg.guideTextEn : cfg.guideText;
    }

    const keyInput = document.getElementById('mail-gemini-key');
    const keyStatus = document.getElementById('mail-key-status');
    if (keyInput) {
        keyInput.placeholder = cfg.placeholder;
        keyInput.value = localStorage.getItem(cfg.keyName) || '';
    }
    if (keyStatus) {
        const savedKey = localStorage.getItem(cfg.keyName);
        const _ksEn = window._currentLang === 'en';
        if (savedKey) { keyStatus.textContent = _ksEn ? '✅ Saved' : '✅ 저장됨'; keyStatus.style.color = '#28a745'; }
        else { keyStatus.textContent = _ksEn ? '⚠️ Please enter your API key' : '⚠️ API 키를 입력해주세요'; keyStatus.style.color = '#e67e22'; }
    }
};

window.populateInsertPosition = function() {
    const select = document.getElementById('mail-insert-position');
    select.innerHTML = '<option value="-1">맨 마지막에 추가</option>';
    if (!globalData || globalData.length <= 1) return;
    
    for (let i = 1; i < globalData.length; i++) {
        let row = globalData[i]; if (!row) continue;
        let level = row._level || 0;
        let taskName = "";
        if (level === 0) taskName = row._origDev || "";
        else if (level === 1) taskName = row._origT1 || "";
        else if (level === 2) taskName = row._origT2 || "";
        else if (level === 3) taskName = row._origT3 || "";
        else if (level === 4) taskName = row._origT4 || "";
        if (!taskName) taskName = `행 ${i}`;

        // ✅ 레벨별 들여쓰기 + 특수문자
        let indent = '\u00A0'.repeat(level * 4);
        let prefix = level === 0 ? '■ ' : (row._isLastChild ? '└ ' : '├ ');
        let levelBadge = `[L${level}]`;

        select.innerHTML += `<option value="${i}">${i}행 ${indent}${prefix}${levelBadge} ${taskName}</option>`;
    }
};

window.analyzeMailContent = async function() {
    const apiKey = window.getActiveAiKey();
    if (!apiKey) { alert('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.'); return; }

    const mailText = document.getElementById('mail-content-input').value.trim();
    if (!mailText) { alert('메일 내용을 입력해주세요.'); return; }

    const analyzeBtn = document.getElementById('mail-analyze-btn');
    const loadingDiv = document.getElementById('mail-loading');
    // 💡 두 버튼 모두 flex:1 + min-width:0 (정적 스타일)로 1:1 균등분배되므로
    //    여기서 width를 강제로 덮어쓰지 않음 (예전 2:1 calc 분할은 제거)
    analyzeBtn.style.width = '';
    loadingDiv.style.display = 'block';
    loadingDiv.style.width = '';
    document.getElementById('mail-result-section').style.display = 'none';
    document.getElementById('mail-error').style.display = 'none';

    // 💡 파일첨부 탭 개별 버튼과 동일한 스타일: 버튼 자체가 진행 상태를 표시
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = window._currentLang === 'en' ? '⏳ Analyzing...' : '⏳ 분석중...';
    analyzeBtn.style.background = '#6c86a3';
    analyzeBtn.style.borderColor = '#6c86a3';

    // ✅ 프로젝트 정보 — 기존 엑셀 행 스캔은 폴백으로 유지, 우선은 Stage1 매칭 결과 사용
    let projectAssignee = "";
    let projectCustomer = "";
    let projectModel = "";
    let projectInch = "";
    if (globalData && globalData.length > 1) {
        for (let i = 1; i < globalData.length; i++) {
            let r = globalData[i]; if (!r) continue;
            if (!projectAssignee && colIdx.assignee !== -1 && r[colIdx.assignee]) projectAssignee = r[colIdx.assignee].toString().trim();
            if (!projectCustomer && colIdx.customer !== -1 && r[colIdx.customer]) projectCustomer = r[colIdx.customer].toString().trim();
            if (!projectModel && colIdx.model !== -1 && r[colIdx.model]) projectModel = r[colIdx.model].toString().trim();
            if (!projectInch && colIdx.inch !== -1 && r[colIdx.inch]) projectInch = r[colIdx.inch].toString().trim();
            if (projectAssignee && projectCustomer && projectModel && projectInch) break;
        }
    }

    // 💡 파일 첨부 탭과 동일하게, Gemini로 보내는 본문은 최대 글자 수로 제한 (응답 잘림/실패 방지)
    //    [2026-08-27] 하드코딩된 2000자를 "⚙️ 설정 → AI 분석 설정"에서 조절 가능하도록 변경
    const mailTextForPrompt = mailText.substring(0, window.getAiMailMaxLen());

    // 💡 [B안 통일화] Stage1 매칭으로 실제 어느 프로젝트 얘기인지 확인 → 단일 확정되면 그 프로젝트 정보로 덮어씀
    //    (매칭 안 되면 위에서 구한 현재 프로젝트 정보를 그대로 폴백으로 사용 — 최종 등록은 사람이 직접 프로젝트 골라서 하므로
    //     여기선 AI 배경정보 정확도만 개선하는 목적)
    try {
        const { contextOverride } = await window._msResolveMatchAndContext({ subject: '', body: mailTextForPrompt });
        if (contextOverride) {
            if (contextOverride.model) projectModel = contextOverride.model;
            if (contextOverride.customer) projectCustomer = contextOverride.customer;
            if (contextOverride.assignee) projectAssignee = contextOverride.assignee;
            if (contextOverride.inch) projectInch = contextOverride.inch;
        }
    } catch (e) { console.warn('붙여넣기 분석 - 프로젝트 매칭 실패, 기존 방식으로 폴백:', e.message); }

    const prompt = window.getSystemPrompt(projectAssignee, projectCustomer, projectModel, projectInch, mailTextForPrompt, null);

    // ✅ 공용 헬퍼(모델 사용중단 자동 페일오버 포함)로 구글 앱스 스크립트(GAS)에 전송
    let lastErr = null;
    let parsed = null;

    window._mailAnalyzeCancelled = false;
    const callResult = await window.callAiBackend(apiKey, prompt, { isCancelled: () => window._mailAnalyzeCancelled });
    if (callResult.ok) {
        const text = callResult.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        parsed = window.parseGeminiTask(text);
        if (!parsed) lastErr = new Error('JSON 형식을 찾을 수 없습니다.');
    } else {
        lastErr = callResult.error;
    }

    analyzeBtn.disabled = false;
    // 💡 성공/실패 모두 2:1 분리 레이아웃을 유지 (버튼 하나로 다시 합쳐지지 않음)

    if (!parsed) {
        analyzeBtn.innerHTML = window._currentLang === 'en' ? '⚠️ Failed (Retry)' : '⚠️ 실패(재시도)';
        analyzeBtn.style.background = '#fbe4e2';
        analyzeBtn.style.borderColor = '#eeb0ac';
        analyzeBtn.style.color = '#b1432f';
        const errDiv = document.getElementById('mail-error');
        errDiv.style.display = 'block';
        errDiv.textContent = '❌ 분석 실패: ' + (lastErr ? lastErr.message : '알 수 없는 오류') + ' (재시도 후에도 실패)';
        return;
    }

    analyzeBtn.innerHTML = window._currentLang === 'en' ? '✅ Re-Analyze' : '✅ AI 재분석';
    analyzeBtn.style.background = '#e8f4fd';
    analyzeBtn.style.borderColor = '#a5c8f0';
    analyzeBtn.style.color = '#1a4f7a';

    window._mailAnalyzedResult = parsed;
    window._aiResultSnapshot = JSON.parse(JSON.stringify(parsed)); // 💡 AI 원본 스냅샷 (수정 감지용)
    // 💡 파일첨부/메일서버와 동일하게: 자동으로 오른쪽 패널 열지 않고, 목록에만 추가
    //    (미리보기는 목록에서 항목을 클릭했을 때만 표시됨)
    const mailInput = document.getElementById('mail-content-input');
    const mailTextDisplay = mailInput ? mailInput.value : '';
    pasteAddResult(parsed, mailTextDisplay);
};

// ─── 직접입력 분석 강제 중단/초기화 ─────────────────────────
window.mailResetAnalysis = function() {
    window._mailAnalyzeCancelled = true;
    // 💡 2:1 분리 레이아웃은 유지, 라벨/색상만 초기 상태로
    const analyzeBtn = document.getElementById('mail-analyze-btn');
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = window._currentLang === 'en' ? '🤖 AI Analyze' : '🤖 AI 분석';
    analyzeBtn.style.background = '#e8f4fd';
    analyzeBtn.style.borderColor = '#a5c8f0';
    const errDiv = document.getElementById('mail-error');
    errDiv.style.display = 'block';
    errDiv.textContent = '⏹ 분석을 중단하고 초기 상태로 되돌렸습니다.';
};

window.renderMailResult = function(result) {
    // 💡 [핵심 수정] 데이터가 들어오는 즉시 WBS 레벨을 강제로 4로 세팅합니다.
    if (result) {
        result['wbs레벨'] = 4;
    }
    if (window._mailAnalyzedResult) {
        window._mailAnalyzedResult['wbs레벨'] = 4;
    }

    const _isEn = window._currentLang === 'en';
    const fields = [
        { key: '업무명',   label: _isEn ? '📌 Task Name' : '📌 업무명' },
        { key: '시작일',   label: _isEn ? '📅 Start Date' : '📅 시작일' },
        { key: '완료일',   label: _isEn ? '📅 Due Date' : '📅 완료일' },
        { key: '상태',     label: _isEn ? '🔖 Status' : '🔖 상태',     type: 'select',
          options: ['진행','대기','완료','보류'],
          optLabels: { '진행': _isEn ? 'On going' : '진행', '대기': _isEn ? 'Pending' : '대기', '완료': _isEn ? 'Done' : '완료', '보류': _isEn ? 'On Hold' : '보류' } },
        { key: '개발단계', label: _isEn ? '🏗️ Dev Phase' : '🏗️ 개발단계', type: 'select',
          options: ['','RFI','RFQ','NRE','AWARD','KICK-OFF','DESIGN','SAMPLE','EVT','ES','DVT','PVT','FAI','PP','SOP','MP','EC','RMA','EOL'] },
        { key: '상세내용', label: _isEn ? '📝 Details' : '📝 상세내용' },
    ];

    let html = '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
    fields.forEach(f => {
        // 날짜 확인 필요 여부 체크
        const needsCheck = (result[f.key] || '').includes('날짜확인필요');
        const warnStyle = needsCheck ? 'background:#fff3cd; border:1px solid #ffc107; border-radius:4px;' : '';
        const isDateField = (f.key === '시작일' || f.key === '완료일');
        const dateVal = result[f.key] || '';
        const dateParsed = isDateField ? parseDateValue(dateVal) : null;
        const dateTsArg = dateParsed ? dateParsed.ts : new Date().setHours(0,0,0,0);
        const displayDate = (isDateField && dateVal && !dateVal.includes('날짜확인필요'))
            ? dateVal
            : `<span style="color:#e67e22; font-weight:bold;">📅 ${_isEn ? 'Please select a date' : '날짜를 선택해주세요'}</span>`;

        // 💡 여기가 핵심 수정 부분입니다.
        let inputType = isDateField
            ? `<div style="display:flex; align-items:center; gap:8px; ${warnStyle} padding:2px 4px; border-radius:4px;">
                <span class="date-clickable" id="mail-date-${f.key}" 
                    style="cursor:pointer; font-size:13px; font-weight:bold; color:#0056b3; user-select:none; -webkit-user-select:none;"
                    onclick="window.showMailCalendar(this, ${dateTsArg}, '${f.key}')">
                    ${displayDate}
                </span>
               </div>`
            : f.type === 'select'
                ? `<select data-field="${f.key}" style="width:100%; border:1px solid #ced4da; border-radius:4px; padding:5px; font-size:13px; box-sizing:border-box;" 
                   onchange="window._mailAnalyzedResult['${f.key}'] = this.value">
                    ${f.options.map(o => `<option value="${o}" ${result[f.key]===o?'selected':''}>${(f.optLabels ? f.optLabels[o] : o) || (_isEn ? '(Unspecified)' : '(미지정)')}</option>`).join('')}
                   </select>`
                : f.key === '상세내용' 
                    ? `<textarea data-field="${f.key}" style="width:100%; border:1px solid #ced4da; border-radius:4px; padding:5px; font-size:13px; min-height:100px; box-sizing:border-box; resize:vertical;" 
                       onchange="window._mailAnalyzedResult['${f.key}'] = this.value">${escapeHtml(result[f.key] || '')}</textarea>`
                    : `<input type="text" value="${escapeHtml(result[f.key] || '')}" data-field="${f.key}" 
                       style="width:100%; border:1px solid #ced4da; border-radius:4px; padding:5px; font-size:13px; box-sizing:border-box;" 
                       onchange="window._mailAnalyzedResult['${f.key}'] = this.value">`;

        html += `<tr>
            <td style="padding:7px 10px; background:#f8f9fa; border:1px solid #dee2e6; font-weight:bold; width:128px; white-space:nowrap;">${f.label}</td>
            <td style="padding:7px 10px; border:1px solid #dee2e6;">${inputType}</td>
        </tr>`;
    });

    // ✅ WBS 레벨 선택
    // 💡 [2026-08-20] 예전엔 값이 없으면 무조건 4로 강제 고정했었음 — AI의 판단 기준이 약해서
    //    어차피 3/4에 몰리는데, 그마저도 여기서 한 번 더 4로 덮어써서 사실상 항상 L4였음.
    //    → "업무명이 표에 이미 있는 L1~L3 제목과 같으면 L4(하위 붙이기), 완전히 새 제목이면
    //    L3(새 세부업무)"로 실제 데이터 기반 추정으로 교체. 단, 사용자가 드롭다운에서 직접
    //    고른 값(_wbsLevelUserSet)이거나 AI가 0~2(대분류~소분류2)로 판단한 경우는 그대로 존중.
    let currentLevel = result['wbs레벨'];
    const _wbsUserSet = !!result['_wbsLevelUserSet'];
    if (!_wbsUserSet && (currentLevel === undefined || currentLevel === null || currentLevel === '' || currentLevel >= 3)) {
        currentLevel = window._msGuessWbsLevel ? window._msGuessWbsLevel(result['업무명'], globalData) : 4;
        window._mailAnalyzedResult['wbs레벨'] = currentLevel; // 데이터에도 즉시 반영 (사용자가 안 건드리면 이 값으로 등록됨)
    }

    let levelOptions = [0,1,2,3,4].map(n => 
        `<option value="${n}" ${currentLevel == n ? 'selected' : ''}>Level ${n} ${_isEn ? ['(Category)','(Sub 1)','(Sub 2)','(Detail Task)','(Sub-task)'][n] : ['(대분류)','(소분류1)','(소분류2)','(세부업무)','(하위업무)'][n]}</option>`
    ).join('');
    
    html += `<tr>
        <td style="padding:7px 10px; background:#f8f9fa; border:1px solid #dee2e6; font-weight:bold; width:128px; white-space:nowrap;">${_isEn ? '📊 WBS Level' : '📊 WBS 레벨'}</td>
        <td style="padding:7px 10px; border:1px solid #dee2e6;">
            <select style="width:100%; border:1px solid #ced4da; border-radius:4px; padding:4px; font-size:13px; box-sizing:border-box;" 
                onchange="window._mailAnalyzedResult['wbs레벨'] = parseInt(this.value); window._mailAnalyzedResult['_wbsLevelUserSet'] = true;">
                ${levelOptions}
            </select>
        </td>
    </tr>`;
    const _fbEn = window._currentLang === 'en';
    html += `<tr>
        <td colspan="2" style="padding:8px 10px; border:1px solid #dee2e6; background:#f8f9fa;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; color:#888;">${_fbEn ? 'Was this analysis helpful?' : 'AI 분석 결과가 도움이 되었나요?'}</span>
                <div>
                    <button onclick="window.saveFeedbackLog('good')" id="fb-good-btn"
                        onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';"
                        style="font-size:12px; padding:3px 12px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; font-weight:bold; cursor:pointer; margin-right:4px; transition:background .15s, border-color .15s;">
                        👍 ${_fbEn ? 'Good' : '좋음'}
                    </button>
                    <button onclick="window.saveFeedbackLog('bad')" id="fb-bad-btn"
                        onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';"
                        style="font-size:12px; padding:3px 12px; border:1px solid #eeb0ac; background:#fbe4e2; color:#b1432f; border-radius:5px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">
                        👎 ${_fbEn ? 'Bad' : '나쁨'}
                    </button>
                </div>
            </div>
            <div id="fb-improve-trigger-row" style="display:none; margin-top:8px; text-align:right;">
                <button onclick="window.openImproveCommentModal()"
                    onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';"
                    style="font-size:12px; padding:5px 14px; border:1px solid #a8dab8; background:#e6f6ea; color:#1f7a3d; border-radius:5px; cursor:pointer; font-weight:bold; transition:background .15s, border-color .15s;">
                    💡 ${_fbEn ? 'Leave feedback and request AI improvement' : '의견 남기고 AI 개선 요청'}
                </button>
            </div>
        </td>
    </tr>`;
    html += '</table>';

    document.getElementById('mail-result-table').innerHTML = html;
    document.getElementById('mail-result-section').style.display = 'block';

    const hasDate = result['시작일'] && !result['시작일'].includes('날짜확인필요');

    if (hasDate && (!result['완료일'] || result['완료일'].includes('날짜확인필요'))) {
        const planDate = new Date(new Date(result['시작일']).getTime() + 1 * 24 * 60 * 60 * 1000);
        const planStr = planDate.getFullYear() + '-' + String(planDate.getMonth()+1).padStart(2,'0') + '-' + String(planDate.getDate()).padStart(2,'0');
        result['완료일'] = planStr;
        window._mailAnalyzedResult['완료일'] = planStr;
        const planSpan = document.getElementById('mail-date-완료일');
        if (planSpan) {
            planSpan.innerHTML = `<span style="color:#0056b3; font-weight:bold;">${planStr}</span>`;
            // 자동 날짜 설정 시 경고 배경 제거
            const planDiv = planSpan.closest('div');
            if (planDiv) { planDiv.style.background = ''; planDiv.style.border = ''; }
        }
    }

    window.autoSetInsertPosition(result['시작일'], hasDate);
};

    window.autoSetInsertPosition = function(startDateStr, showAlert) {
        window.populateInsertPosition();
        
        const select = document.getElementById('mail-insert-position');
        if (globalData.length <= 1) { select.value = '-1'; return; }

        // 1순위: 분석된 시작일 / 2순위: 오늘 날짜
        const todayStr = new Date().toISOString().split('T')[0];
        const effectiveStr = (startDateStr && !startDateStr.includes('날짜확인필요'))
            ? startDateStr : todayStr;

        const startTs = parseDateValue(effectiveStr) ? parseDateValue(effectiveStr).ts : null;
        if (!startTs) { select.value = '-1'; return; }
    
        let bestIndex = -1;
        for (let i = 1; i < globalData.length; i++) {
            let row = globalData[i]; if (!row) continue;
            let rowStartTs = row._calcStartTs;
            if (rowStartTs && rowStartTs > startTs) {
                bestIndex = i - 1;
                break;
            }
        }
    
        select.value = bestIndex !== -1 ? String(bestIndex) : '-1';
    };

window.editPrompt = async function() {
    let modal = document.getElementById('prompt-edit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'prompt-edit-modal';
        // 💡 [2026-08-27] 원래는 부모 컨테이너를 display:flex로 만들어 가운데 정렬했었는데, resize:both를
        //    쓰려면 다른 모달들처럼 박스 자체에 top:50%/left:50%/transform으로 직접 중앙 정렬하는 게
        //    더 안전함(크기 조절 중 static-position 재계산에 기대는 방식보다 확실함) — 표준 패턴으로 통일.
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:99999; background:none; pointer-events:none;';
        modal.innerHTML = `
            <div id="prompt-edit-modal-box" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); resize:both; overflow:hidden; min-width:360px; min-height:400px;">
                <div id="prompt-drag-handle" style="padding:13px 18px;border-bottom:1px solid #a5c8f0;font-weight:bold;font-size:14px;background:#e7f3ff;color:#1971c2;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
                    <span id="prompt-modal-title">✏️ AI 업무 분석 — 프롬프트 편집</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button id="prompt-history-btn" onclick="event.stopPropagation(); window.showPromptLogs()" onmouseover="this.style.background='#cfe6fa';" onmouseout="this.style.background='#e8f4fd';" title="지금까지의 변경 이력 보기 · 이전 버전으로 복원" style="background:#e8f4fd; border:none; border-radius:6px; color:#1a4f7a; font-size:11px; font-weight:bold; cursor:pointer; padding:0 10px; height:28px; white-space:nowrap; transition:background .15s;">🕒 이력</button>
                        <button onclick="document.getElementById('prompt-edit-modal').style.display='none'"
                            style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px;
                                   color:var(--modal-icon-text); font-size:16px; cursor:pointer;
                                   width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;
                                   display:flex; align-items:center; justify-content:center; transition:0.15s;"
                            onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';"
                            onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';"
                            title="닫기">✕</button>
                    </div>
                </div>
                <div id="prompt-edit-notice" style="margin:10px 18px 0; padding:8px 12px; font-size:11px; color:#495057; background:#eef3f8; border-radius:6px; line-height:1.5;">
                    <span id="prompt-notice-default">💡 현재 사용 중인 프롬프트입니다. 수정하려면 관리자 비밀번호가 필요합니다.</span>
                </div>
                <div id="prompt-edit-meta" style="padding:4px 18px 0; font-size:10.5px; color:#aaa;"></div>
                <div style="padding:10px 18px; flex:1; overflow:hidden; display:flex; flex-direction:column;">
                    <textarea id="prompt-edit-textarea" readonly style="flex:1;width:100%;font-size:13px;font-family:Consolas,'D2Coding','Courier New',monospace,'Malgun Gothic';border:1px solid #ced4da;border-radius:6px;padding:10px;box-sizing:border-box;resize:none;line-height:1.5;background:#f8f9fa;color:#555;"></textarea>
                    <input id="prompt-save-memo" type="text" maxlength="40" placeholder="💬 이번 저장 메모 (선택, 예: 우선순위 점수 필드 추가 v1)"
                        style="display:none; width:100%; margin-top:8px; padding:7px 10px; border:1px solid #ced4da; border-radius:6px; font-size:12px; box-sizing:border-box; flex-shrink:0;">
                </div>
                <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="prompt-unlock-btn" onclick="window.unlockPrompt()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" title="비밀번호 필요" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔒 수정하기</button>
                    <button id="prompt-save-btn" onclick="window.savePrompt()" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1; min-width:120px; padding:8px; background:#e8f4fd; color:#1a4f7a; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">저장</button>
                    <button id="prompt-reset-btn" onclick="window.resetPrompt()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; min-width:120px; padding:8px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; display:none; transition:background .15s, border-color .15s;">🔄 기본값으로 초기화</button>
                    <button id="prompt-ai-improve-btn" onclick="window.triggerPromptImprove('batch')" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" title="쌓인 👎 피드백 케이스를 모아 한번에 프롬프트 개선" style="flex:1; min-width:120px; padding:8px 14px; background:#fbead9; color:#a85d0a; border:1px solid #edbf85; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🤖 일괄개선</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('prompt-edit-modal-box', 'prompt-drag-handle');
    }

    modal.style.display = 'block';

    // 💡 언어 전환 시 버튼 텍스트 즉시 반영
    const _pEn = window._currentLang === 'en';
    const _pTexts = {
        'prompt-modal-title':  _pEn ? '✏️ AI Work Analysis — Prompt Edit' : '✏️ AI 업무 분석 — 프롬프트 편집',
        'prompt-unlock-btn':   _pEn ? '🔒 Edit'                      : '🔒 수정하기',
        'prompt-save-btn':     _pEn ? '💾 Save'                      : '💾 저장',
        'prompt-reset-btn':    _pEn ? '🔄 Reset to Default'          : '🔄 기본값으로 초기화',
        'prompt-history-btn':  _pEn ? '🕒 History'                   : '🕒 이력',
        'prompt-ai-improve-btn': _pEn ? '🤖 Batch Improve'           : '🤖 일괄개선',
    };
    Object.entries(_pTexts).forEach(([id, txt]) => { const el = document.getElementById(id); if (el) el.textContent = txt; });

    const notice = document.getElementById('prompt-edit-notice');

    // ✅ 드라이브 연동 시 열 때마다 팀 공용 최신 프롬프트로 동기화
    if (window.isDriveConnected) {
        if (notice) notice.textContent = '🔄 팀 공용 프롬프트를 불러오는 중...';
        await window.loadPromptFromDrive();
    }

    // ✅ 현재 프롬프트 표시 (동기화 후 저장된 것 or 기본값)
    const savedPrompt = localStorage.getItem('gantt_mail_prompt');
    document.getElementById('prompt-edit-textarea').value = savedPrompt || window._defaultPromptTemplate || '';

    // 💡 "마지막 수정: 누가 · 언제" — AI 프로젝트 요약 프롬프트 편집창과 동일한 메타 정보 표시
    const _pMeta = window._promptDriveMeta;
    const _pMetaEl = document.getElementById('prompt-edit-meta');
    if (_pMetaEl) _pMetaEl.textContent = (_pMeta && _pMeta.updatedBy) ? `마지막 수정: ${_pMeta.updatedBy} · ${_pMeta.updatedAt}` : '';

    // ✅ 잠금 상태로 초기화 (배너 색상도 함께 원복 — 직전에 🔒 수정하기로 파란 배너로 바뀐 채 남아있을 수 있음)
    document.getElementById('prompt-edit-textarea').readOnly = true;
    document.getElementById('prompt-edit-textarea').style.background = '#f8f9fa';
    document.getElementById('prompt-edit-textarea').style.color = '#555';
    document.getElementById('prompt-unlock-btn').style.display = 'block';
    document.getElementById('prompt-save-btn').style.display = 'none';
    document.getElementById('prompt-reset-btn').style.display = 'none';
    const _pnEn = window._currentLang === 'en';
    document.getElementById('prompt-edit-notice').style.background = '#eef3f8';
    document.getElementById('prompt-edit-notice').style.color = '#495057';
    document.getElementById('prompt-edit-notice').textContent = window.isDriveConnected
        ? (_pnEn ? '💡 This is the shared team prompt (Drive). Admin password required to edit.' : '💡 팀 공용(드라이브) 프롬프트입니다. 수정하려면 관리자 비밀번호가 필요합니다.')
        : (_pnEn ? '⚠️ Google Drive not connected — saved locally only, not shared with team. Admin password required to edit.' : '⚠️ 구글 드라이브 미연동 상태 — 이 PC에만 저장되며 팀과 공유되지 않습니다. 수정하려면 관리자 비밀번호가 필요합니다.');
};

window.unlockPrompt = function() {
    const success = verifyAdminPassword('🔒 프롬프트 수정을 위해 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)');
    if (!success) { alert('❌ 비밀번호 인증 실패. 프롬프트 수정이 취소되었습니다.'); return; }

    document.getElementById('prompt-edit-textarea').readOnly = false;
    document.getElementById('prompt-edit-textarea').style.background = '#fffde7';
    document.getElementById('prompt-edit-textarea').style.color = '#333';
    document.getElementById('prompt-unlock-btn').style.display = 'none';
    document.getElementById('prompt-save-btn').style.display = 'block';
    const memoEl = document.getElementById('prompt-save-memo');
    if (memoEl) memoEl.style.display = 'block';
    document.getElementById('prompt-reset-btn').style.display = 'block';
    document.getElementById('prompt-edit-notice').textContent = window._currentLang === 'en'
        ? '✏️ Edit freely. Keep variables like ${mailText}, ${projectAssignee} as-is.'
        : '✏️ 프롬프트를 자유롭게 수정하세요. ${mailText}, ${projectAssignee} 등 변수는 그대로 유지하세요.';
    document.getElementById('prompt-edit-notice').style.color = '#0056b3';
    document.getElementById('prompt-edit-notice').style.background = '#e7f1ff';
};

// 💡 전체 텍스트 버전 스냅샷 저장 (복원용) — 최대 20개, 초과분은 오래된 것부터 삭제
window.savePromptVersionSnapshot = function(promptText, note) {
    window._promptVersion = (window._promptVersion || 1);
    let versions = JSON.parse(localStorage.getItem('gantt_prompt_versions') || '[]');
    versions.push({
        version: window._promptVersion,
        time: new Date().toLocaleString('ko-KR'),
        userName: (window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음') + (note ? ' (' + note + ')' : ''),
        prompt: promptText
    });
    if (versions.length > 20) versions = versions.slice(-20);
    localStorage.setItem('gantt_prompt_versions', JSON.stringify(versions));
};

window.savePrompt = async function() {
    const text = document.getElementById('prompt-edit-textarea').value.trim();
    if (!text) { alert('프롬프트가 비어있습니다.'); return; }

    // ✅ 변경 이력 저장
    const oldPrompt = localStorage.getItem('gantt_mail_prompt') || window._defaultPromptTemplate || '';
    if (oldPrompt !== text) {
        let promptLogs = JSON.parse(localStorage.getItem('gantt_prompt_logs') || '[]');
        promptLogs.push({
            time: new Date().toLocaleString('ko-KR'),
            userName: window.currentUserName || localStorage.getItem('gantt_local_user') || '알 수 없음',
            oldPrompt: oldPrompt.substring(0, 200) + (oldPrompt.length > 200 ? '...' : ''),
            newPrompt: text.substring(0, 200) + (text.length > 200 ? '...' : '')
        });
        // 최대 20개 유지
        if (promptLogs.length > 20) promptLogs = promptLogs.slice(-20);
        localStorage.setItem('gantt_prompt_logs', JSON.stringify(promptLogs));

        // 💡 버전 증가 + 전체 텍스트 스냅샷 저장 (복원 가능하도록)
        window._promptVersion = (window._promptVersion || 1) + 1;
        localStorage.setItem('gantt_prompt_version', String(window._promptVersion));
        const memoEl = document.getElementById('prompt-save-memo');
        const memo = memoEl && memoEl.value.trim() ? ': ' + memoEl.value.trim() : '';
        window.savePromptVersionSnapshot(text, '수동 저장 v' + window._promptVersion + memo);
        if (memoEl) memoEl.value = ''; // 다음 저장을 위해 비워둠
    }

    localStorage.setItem('gantt_mail_prompt', text);
    document.getElementById('prompt-edit-modal').style.display = 'none';

    // ✅ 드라이브 연동 시 팀 공용 파일에도 업로드
    if (window.isDriveConnected) {
        const ok = await window.savePromptToDrive(text);
        alert(ok ? '✅ 프롬프트가 저장되고, 팀 공용(드라이브)에도 반영되었습니다.'
                  : '⚠️ 로컬에는 저장됐지만 드라이브 업로드에 실패했습니다. (콘솔 로그 확인)');
    } else {
        alert('✅ 프롬프트가 이 PC에 저장되었습니다.\n⚠️ 드라이브 미연동 상태라 팀과 공유되지는 않습니다.');
    }
};

window.resetPrompt = function() {
    // 💡 리셋도 되돌릴 수 있도록, 리셋 전 현재 프롬프트를 스냅샷으로 남김
    const current = localStorage.getItem('gantt_mail_prompt');
    if (current) window.savePromptVersionSnapshot(current, '기본값 초기화 전 백업');

    localStorage.removeItem('gantt_mail_prompt');
    document.getElementById('prompt-edit-textarea').value = window._defaultPromptTemplate || '';
    alert('✅ 기본 프롬프트로 초기화되었습니다.\n(초기화 전 프롬프트는 "변경 이력"에서 복원할 수 있습니다)');
};

// ── 💡 [Phase2/3] 프롬프트 피드백 로그 ──────────────────────────────
const _PF_KEY = 'gantt_prompt_feedback';
window._promptVersion = parseInt(localStorage.getItem('gantt_prompt_version') || '1', 10);
window._lastFeedbackUid = null; // 방금 저장한 fb 항목 uid (개선 요청 시 코멘트 채워넣을 대상)

