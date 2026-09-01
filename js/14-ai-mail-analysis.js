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

window.saveFeedbackLog = function(rating) {
    if (!window._mailAnalyzedResult) return;
    const log = JSON.parse(localStorage.getItem(_PF_KEY) || '[]');
    const uid = 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    log.unshift({
        uid: uid,
        date: new Date().toISOString(),
        promptVersion: window._promptVersion,
        mailRaw: window._mailParsedRaw || null,
        aiResult: window._aiResultSnapshot ? JSON.parse(JSON.stringify(window._aiResultSnapshot)) : null,
        userResult: JSON.parse(JSON.stringify(window._mailAnalyzedResult)),
        userComment: '',
        rating: rating,
        improved: false
    });
    if (log.length > 200) log.splice(200);
    localStorage.setItem(_PF_KEY, JSON.stringify(log));

    const _en = window._currentLang === 'en';
    const goodBtn = document.getElementById('fb-good-btn');
    const badBtn  = document.getElementById('fb-bad-btn');
    const triggerRow = document.getElementById('fb-improve-trigger-row');

    if (rating === 'good') {
        window._lastFeedbackUid = null;
        if (triggerRow) triggerRow.style.display = 'none';
        if (goodBtn) { goodBtn.style.background = '#c9ecd3'; goodBtn.style.borderColor = '#7cc494'; goodBtn.style.color = '#1f7a3d'; }
        if (badBtn)  { badBtn.style.background = '#fbe4e2'; badBtn.style.borderColor = '#eeb0ac'; badBtn.style.color = '#b1432f'; }
        if (window.showToast) window.showToast(_en ? '👍 Feedback saved.' : '👍 피드백이 저장되었습니다.');
    } else {
        window._lastFeedbackUid = uid;
        if (triggerRow) triggerRow.style.display = 'block'; // 💡 나쁨 선택 시에만 개선요청 버튼 노출
        if (badBtn)  { badBtn.style.background = '#f5c2bd'; badBtn.style.borderColor = '#e08f87'; badBtn.style.color = '#b1432f'; }
        if (goodBtn) { goodBtn.style.background = '#e6f6ea'; goodBtn.style.borderColor = '#a8dab8'; goodBtn.style.color = '#1f7a3d'; }
    }
};

// ── 💡 개선 요청 코멘트 입력 모달 ───────────────────────────────────
// 💡 [2026-08-24 UX 개선] 다른 팝업들처럼 표준 모달 기능(드래그 이동, 배경 흐림/딤 처리로 뒤 화면
//    조작 차단, 배경 클릭 시 닫기, 우상단 ✕ 버튼)을 적용 — 예전엔 헤더/오버레이 없이 텍스트 박스만
//    화면 중앙에 떠 있고 뒤 배경도 그대로 조작 가능해서 다른 모달들과 이질감이 있었음.
window.openImproveCommentModal = function() {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('improve-comment-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'improve-comment-modal';
        // 💡 [2026-08-24] 처음엔 backdrop-filter:blur(3px)를 넣었는데, 개선 요청 코멘트를 쓰려면
        //    뒤에 있는 분석 결과 내용을 보면서 참고해야 하는데 블러 때문에 안 읽혀서 제거함
        //    (배경 톤만 살짝 남기고 흐림 효과는 뺌 — 뒤 내용이 그대로 읽힘).
        // 💡 [2026-08-24] 배경 클릭 시 닫히던 걸 제거함 — 코멘트를 쓰다가 뒤 분석 결과를 참고하려고
        //    배경을 클릭했는데 모달이 닫혀버리는 게 불편하다는 피드백. 이제 ✕ 버튼으로만 닫힘.
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9250; background:rgba(255,218,185,0.22);';
        modal.innerHTML = `
        <div id="improve-comment-box" onclick="event.stopPropagation()" style="position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:200px;">
            <div id="improve-comment-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span>✏️ <span id="improve-comment-title"></span></span>
                <button onclick="event.stopPropagation(); document.getElementById('improve-comment-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div style="padding:18px;">
                <textarea id="improve-comment-input" placeholder="${_en ? 'e.g. Extracted the wrong date from the forwarding chain (optional)' : '예: 포워딩 체인에서 날짜를 잘못 추출함 (선택 입력)'}"
                    style="width:100%; min-height:80px; font-size:13px; border:1px solid #ced4da; border-radius:6px; padding:8px; box-sizing:border-box; resize:vertical;"></textarea>
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <button onclick="window.submitImproveComment()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:9px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🤖 ${_en ? 'Request' : '요청'}</button>
                    <button onclick="document.getElementById('improve-comment-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:9px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">✖ ${_en ? 'Cancel' : '취소'}</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('improve-comment-box', 'improve-comment-drag');
        window._bindClickToFront('improve-comment-modal');
    }
    document.getElementById('improve-comment-title').textContent =
        _en ? 'What was the problem?' : '어떤 부분이 문제였나요?';
    document.getElementById('improve-comment-input').value = '';
    modal.style.display = 'block';
    if (window.bringModalToFront) window.bringModalToFront('improve-comment-modal');
};

window.submitImproveComment = function() {
    const comment = document.getElementById('improve-comment-input').value.trim();
    document.getElementById('improve-comment-modal').style.display = 'none';

    if (window._lastFeedbackUid) {
        const log = JSON.parse(localStorage.getItem(_PF_KEY) || '[]');
        const it = log.find(function(x) { return x.uid === window._lastFeedbackUid; });
        if (it) { it.userComment = comment; localStorage.setItem(_PF_KEY, JSON.stringify(log)); }
    }
    window.triggerPromptImprove('instant', comment);
};

// 💡 다운스트림 코드가 의존하는 필수 구조 요소가 개선된 프롬프트에도 살아있는지 검사
window.validatePromptStructure = function(promptText) {
    const requiredJsonKeys = ['업무명', '시작일', '완료일', '상태', '개발단계', '담당구분', '상세내용', 'wbs레벨'];
    const requiredTags = ['[핵심내용]', '[To do]', '[출처]'];
    const missing = [];
    requiredJsonKeys.forEach(function(k) {
        if (promptText.indexOf('"' + k + '"') === -1) missing.push('JSON 키: "' + k + '"');
    });
    requiredTags.forEach(function(t) {
        if (promptText.indexOf(t) === -1) missing.push('태그: ' + t);
    });
    return missing; // 빈 배열이면 이상 없음
};

window.triggerPromptImprove = async function(mode, instantComment) {
    const _en = window._currentLang === 'en';
    const currentPrompt = localStorage.getItem('gantt_mail_prompt') || window._defaultPromptTemplate || '';
    const apiKey = window.getActiveAiKey(); // 💡 선택된 provider(Gemini/Groq/Mistral)에 맞는 키를 정식 헬퍼로 조회
    let casesText = '';
    let targetUids = [];

    if (mode === 'instant') {
        // 즉시 모드: 현재 분석 케이스 1건
        const snap = window._aiResultSnapshot;
        const cur  = window._mailAnalyzedResult;
        const raw  = window._mailParsedRaw;
        if (!snap || !cur) { alert(_en ? 'No analysis result found.' : '분석 결과가 없습니다.'); return; }
        casesText = `[케이스 1]\n메일원문:\n${raw ? raw.body2000 : '(없음)'}\n\nAI 원본 결과:\n상세내용: ${snap['상세내용'] || ''}\n\n사용자 수정 결과:\n상세내용: ${cur['상세내용'] || ''}\n\n사용자 코멘트: ${instantComment || '(없음)'}`;
        targetUids = window._lastFeedbackUid ? [window._lastFeedbackUid] : [];
    } else {
        // 배치 모드: improved:false 케이스 최대 10건
        const log = JSON.parse(localStorage.getItem(_PF_KEY) || '[]');
        const pending = log.filter(function(x) { return x.rating === 'bad' && !x.improved; }).slice(0, 10);
        targetUids = pending.map(function(x) { return x.uid; });
        if (!pending.length) {
            alert(_en ? '⚠️ No pending feedback cases to improve.' : '⚠️ 개선할 피드백 케이스가 없습니다.\n먼저 분석 결과에서 👎 버튼을 눌러 케이스를 쌓아주세요.');
            return;
        }
        casesText = pending.map(function(fb, i) {
            const snap = fb.aiResult || {};
            const cur  = fb.userResult || {};
            const raw  = fb.mailRaw || {};
            // 10건 초과 방지용 — mailRaw는 5건까지만 포함
            const bodyPart = (i < 5 && raw.body2000) ? `메일원문:\n${raw.body2000}\n\n` : '';
            return `[케이스 ${i+1}] (${fb.date ? fb.date.slice(0,10) : ''})\n${bodyPart}AI 원본 상세내용: ${snap['상세내용'] || ''}\n사용자 수정 상세내용: ${cur['상세내용'] || ''}\n사용자 코멘트: ${fb.userComment || '(없음)'}`;
        }).join('\n\n---\n\n');
    }

    // 💡 JSON 대신 구분자 방식 — 프롬프트 원문의 줄바꿈/따옴표로 인한 이스케이프 깨짐 방지
    // 💡 이 구조(JSON 키/브래킷 태그/enum)는 다른 코드가 직접 파싱하므로 AI가 절대 바꾸면 안 됨
    const PROTECTED_STRUCTURE_RULE = `\n\n🔒 절대 변경 금지 규칙 (반드시 준수):\n프롬프트 내용을 개선하되, 아래 구조적 요소는 절대 이름/형식을 바꾸지 마세요. 이 값들은 다른 프로그램 코드가 그대로 파싱하고 있어서, 조금이라도 바뀌면 시스템이 깨집니다.\n1. 최종 JSON 응답의 키 이름은 정확히 이 8개만 사용: "업무명","시작일","완료일","상태","개발단계","담당구분","상세내용","wbs레벨" (키 이름 변경/추가/삭제 금지)\n2. "상태" 값은 반드시 진행/대기/완료/보류 중 하나\n3. "담당구분" 값은 반드시 PM/기구/HW/FW/BLU/TSP/LCM/Slimming/Cutting/Tooling/영업/CS/FA/미분류 중 하나 (이 목록 자체는 자유롭게 다듬어도 되지만, 필드 자체를 삭제하면 안 됨)\n4. "상세내용" 안의 대괄호 태그는 정확히 이 이름 그대로 사용: [핵심내용] [To do] [출처] [문제점] [대책] (태그명 변경 금지, 새 태그 추가는 가능하나 기존 태그명은 유지)\n5. 날짜 형식은 반드시 "YYYY-MM-DD" 또는 "날짜확인필요"\n표현/설명/추출 로직 등 나머지 부분은 자유롭게 개선해도 됩니다.`;

    const improvePrompt = `당신은 AI 프롬프트 개선 전문가입니다.\n아래는 현재 사용 중인 메일 분석 프롬프트와, 이 프롬프트로 분석했을 때 사용자가 수정한 실패 케이스입니다.\n\n=== 현재 프롬프트 ===\n${currentPrompt}\n\n=== 실패 케이스 ===\n${casesText}${PROTECTED_STRUCTURE_RULE}\n\n위 케이스에서 프롬프트의 어떤 부분이 문제인지 분석하고, 개선된 프롬프트 전문을 제안해주세요.\n\n반드시 아래 형식 그대로만 응답하세요. JSON이나 코드블록(\`\`\`)은 절대 사용하지 마세요.\n\n===ANALYSIS===\n(여기에 문제점 분석을 3줄 이내로 작성)\n===PROMPT===\n(여기에 개선된 프롬프트 전문을 기존과 동일한 형식으로 작성)\n===END===`;

    window.showToast(_en ? '🤖 Requesting AI improvement...' : '🤖 AI 개선 요청 중...');
    try {
        const callResult = await window.callAiBackend(apiKey, improvePrompt);
        if (!callResult.ok) throw callResult.error;
        const data = callResult.data;
        const text = data.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const cleaned = text.replace(/```[a-z]*|```/gi, '').trim();
        const analysisMatch = cleaned.match(/===ANALYSIS===([\s\S]*?)===PROMPT===/);
        const promptMatch   = cleaned.match(/===PROMPT===([\s\S]*?)(===END===|$)/);
        const analysis = analysisMatch ? analysisMatch[1].trim() : '';
        const improvedPrompt = promptMatch ? promptMatch[1].trim() : '';
        const isTruncated = !/===END===/.test(cleaned); // 💡 종료 마커 없으면 잘림 의심

        if (!improvedPrompt) {
            throw new Error(_en ? 'Could not parse AI response (format mismatch).' : 'AI 응답 형식을 해석하지 못했습니다.');
        }
        // 💡 구조 손상 여부 검증 — 다운스트림 코드가 의존하는 필수 요소가 빠졌는지 확인
        const structIssues = window.validatePromptStructure(improvedPrompt);
        // 💡 원본 프롬프트를 같이 넘겨서 미리보기에서 변경사항 비교(diff) 가능하게 함
        window.showImprovePreviewModal(analysis, improvedPrompt, targetUids, currentPrompt, isTruncated, structIssues);
    } catch(e) {
        alert((_en ? '❌ AI improvement failed: ' : '❌ AI 개선 요청 실패: ') + e.message);
    }
};

// ── 💡 라인 단위 diff 계산 (LCS 알고리즘) ────────────────────────────
window._simpleLineDiff = function(oldText, newText) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');
    const n = oldLines.length, m = newLines.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = oldLines[i] === newLines[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
        }
    }
    let i = 0, j = 0;
    const result = [];
    while (i < n && j < m) {
        if (oldLines[i] === newLines[j]) { result.push({ type: 'same', line: oldLines[i] }); i++; j++; }
        else if (dp[i+1][j] >= dp[i][j+1]) { result.push({ type: 'del', line: oldLines[i] }); i++; }
        else { result.push({ type: 'add', line: newLines[j] }); j++; }
    }
    while (i < n) { result.push({ type: 'del', line: oldLines[i] }); i++; }
    while (j < m) { result.push({ type: 'add', line: newLines[j] }); j++; }
    return result;
};

// ── 💡 diff 결과를 HTML로 렌더 (동일 라인 3줄 이상 연속되면 접어서 표시) ──
window.renderPromptDiffHtml = function(oldText, newText) {
    const diff = window._simpleLineDiff(oldText, newText);
    let html = '';
    let sameBuf = [];
    const flushSame = function() {
        if (!sameBuf.length) return;
        if (sameBuf.length > 3) {
            html += `<div style="color:#adb5bd; font-size:11px; padding:2px 8px;">… ${sameBuf.length}${window._currentLang === 'en' ? ' unchanged lines' : '줄 동일'} …</div>`;
        } else {
            sameBuf.forEach(function(l) {
                html += `<div style="color:#868e96; padding:1px 8px; white-space:pre-wrap;">${escapeHtml(l) || '&nbsp;'}</div>`;
            });
        }
        sameBuf = [];
    };
    diff.forEach(function(d) {
        if (d.type === 'same') { sameBuf.push(d.line); return; }
        flushSame();
        if (d.type === 'del') {
            html += `<div style="background:#ffe3e3; color:#c92a2a; padding:1px 8px; white-space:pre-wrap; text-decoration:line-through;">- ${escapeHtml(d.line) || '&nbsp;'}</div>`;
        } else {
            html += `<div style="background:#d3f9d8; color:#2b8a3e; padding:1px 8px; white-space:pre-wrap;">+ ${escapeHtml(d.line) || '&nbsp;'}</div>`;
        }
    });
    flushSame();
    return html || `<div style="color:#adb5bd; padding:8px;">${window._currentLang === 'en' ? 'No differences.' : '변경사항이 없습니다.'}</div>`;
};

// ── 💡 개선 결과 미리보기 모달 ──────────────────────────────────────────
window.showImprovePreviewModal = function(analysis, improvedPrompt, targetUids, originalPrompt, isTruncated, structIssues) {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('prompt-improve-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'prompt-improve-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="prompt-improve-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
            <div id="prompt-improve-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span>🤖 ${_en ? 'AI Prompt Improvement Suggestion' : 'AI 프롬프트 개선 제안'}</span>
                <button onclick="document.getElementById('prompt-improve-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="improve-truncate-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:12px; color:#856404;"></div>
            <div id="improve-struct-warning" style="display:none; margin:10px 16px 0; padding:8px 12px; background:#ffe3e3; border:1px solid #e03131; border-radius:6px; font-size:12px; color:#c92a2a;"></div>
            <div style="padding:12px 16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                <div>
                    <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔍 ${_en ? 'Problem Analysis' : '문제점 분석'}</div>
                    <div id="improve-analysis-text" style="font-size:12px; color:#333; background:#f8f9fb; border:1px solid #e6e9ef; border-radius:6px; padding:10px; white-space:pre-wrap; line-height:1.6;"></div>
                </div>
                <div>
                    <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">🔀 ${_en ? 'Changes vs Original' : '변경사항 (원본 대비)'}
                        <span style="font-weight:normal; color:#999;">(${_en ? 'red = removed, green = added' : '빨강=삭제, 초록=추가'})</span>
                    </div>
                    <div id="improve-diff-view" style="max-height:220px; overflow-y:auto; font-size:11.5px; font-family:'Malgun Gothic',monospace; border:1px solid #e6e9ef; border-radius:6px; line-height:1.5; background:#fff;"></div>
                </div>
                <div style="flex:1; display:flex; flex-direction:column;">
                    <div style="font-size:12px; font-weight:bold; color:#495057; margin-bottom:4px;">✏️ ${_en ? 'Improved Prompt (editable)' : '개선된 프롬프트 (수정 가능)'}</div>
                    <textarea id="improve-prompt-textarea" style="flex:1; min-height:200px; font-size:12px; font-family:'Malgun Gothic',monospace; border:1px solid #ced4da; border-radius:6px; padding:10px; resize:vertical; line-height:1.6;"></textarea>
                </div>
            </div>
            <div style="padding:12px 16px; display:flex; gap:8px; border-top:1px solid #eee;">
                <button onclick="window.applyImprovedPrompt()" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1; padding:10px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ ${_en ? 'Adopt' : '채택'}</button>
                <button onclick="document.getElementById('prompt-improve-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1; padding:10px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:13px; cursor:pointer; transition:background .15s, border-color .15s;">❌ ${_en ? 'Discard' : '무시'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('prompt-improve-box', 'prompt-improve-drag');
        window._bindClickToFront('prompt-improve-modal');
    }
    const _en2 = window._currentLang === 'en';
    const warnBar = document.getElementById('improve-truncate-warning');
    warnBar.textContent = _en2
        ? '⚠️ The AI response may have been cut off (no end marker found). Please check the end of the prompt below before adopting.'
        : '⚠️ AI 응답이 중간에 잘렸을 수 있습니다 (종료 마커 없음). 채택 전 아래 프롬프트 끝부분을 꼭 확인하세요.';
    warnBar.style.display = isTruncated ? 'block' : 'none';

    const structBar = document.getElementById('improve-struct-warning');
    if (structIssues && structIssues.length) {
        structBar.innerHTML = (_en2
            ? '🚨 Structural elements required by other code appear to be missing: '
            : '🚨 다른 코드가 의존하는 필수 요소가 빠진 것 같습니다: ') + '<b>' + structIssues.join(', ') + '</b>';
        structBar.style.display = 'block';
    } else {
        structBar.style.display = 'none';
    }



    document.getElementById('improve-diff-view').innerHTML = window.renderPromptDiffHtml(originalPrompt || '', improvedPrompt);
    document.getElementById('improve-analysis-text').textContent = analysis;
    document.getElementById('improve-prompt-textarea').value = improvedPrompt;
    modal._targetUids = targetUids || [];
    modal.style.display = 'block';
    window.bringModalToFront('prompt-improve-modal');
};

// ── 💡 개선 프롬프트 채택 ───────────────────────────────────────────────
window.applyImprovedPrompt = async function() {
    const _en = window._currentLang === 'en';
    const text = document.getElementById('improve-prompt-textarea').value.trim();
    if (!text) { alert(_en ? 'Prompt is empty.' : '프롬프트가 비어있습니다.'); return; }

    // 💡 [2026-08-24 안전장치 추가] 팀 공용 프롬프트를 덮어쓰는 파괴적 액션이라, 수동 편집(✏️ 프롬프트
    //    편집 모달의 "🔒 수정하기")과 동일하게 관리자 비밀번호 인증을 요구함.
    if (!window.verifyAdminPassword(_en ? '🔒 Enter the admin password to adopt the improved prompt.\n(case-insensitive)' : '🔒 개선된 프롬프트를 채택하려면 관리자 비밀번호를 입력하세요.\n(대/소문자 구분 없음)')) {
        alert(_en ? '❌ Authentication failed. Adoption cancelled.' : '❌ 비밀번호 인증 실패. 채택이 취소되었습니다.');
        return;
    }

    // 버전 증가
    window._promptVersion = (window._promptVersion || 1) + 1;
    localStorage.setItem('gantt_prompt_version', String(window._promptVersion));

    // 기존 savePrompt 로직 재사용 (로그 + localStorage + Drive)
    const oldPrompt = localStorage.getItem('gantt_mail_prompt') || '';
    let promptLogs = JSON.parse(localStorage.getItem('gantt_prompt_logs') || '[]');
    promptLogs.push({
        time: new Date().toLocaleString('ko-KR'),
        userName: (window.currentUserName || '알 수 없음') + ' (AI개선 채택 v' + window._promptVersion + ')',
        oldPrompt: oldPrompt.substring(0, 200) + (oldPrompt.length > 200 ? '...' : ''),
        newPrompt: text.substring(0, 200) + (text.length > 200 ? '...' : '')
    });
    if (promptLogs.length > 20) promptLogs = promptLogs.slice(-20);
    localStorage.setItem('gantt_prompt_logs', JSON.stringify(promptLogs));
    localStorage.setItem('gantt_mail_prompt', text);

    // 💡 전체 텍스트 버전 스냅샷 저장 (복원 가능하도록)
    window.savePromptVersionSnapshot(text, 'AI개선 채택 v' + window._promptVersion);

    // improved: true 마킹
    const modal = document.getElementById('prompt-improve-modal');
    const uids = (modal && modal._targetUids) || [];
    if (uids.length) {
        const log = JSON.parse(localStorage.getItem(_PF_KEY) || '[]');
        uids.forEach(function(uid) {
            const it = log.find(function(x) { return x.uid === uid; });
            if (it) it.improved = true;
        });
        localStorage.setItem(_PF_KEY, JSON.stringify(log));
    }

    // Drive 저장
    // 💡 [2026-08-24 버그 수정] 드라이브 미연동 상태거나 업로드가 실패하면 방금 채택한 내용이 로컬에만
    //    남는데 — 이후 드라이브가 연결되면 loadPromptFromDrive()가 (옛) 드라이브 버전을 그대로 받아와
    //    이 로컬 변경을 조용히 덮어써버리는 문제가 있었음("채택했는데 다시 들어오면 저장 안 되어 있음").
    //    "아직 드라이브에 못 올린 변경이 있다"는 표시를 남겨서, 다음 로드 시 덮어쓰는 대신 먼저 이
    //    변경을 드라이브로 올리도록 함.
    if (window.isDriveConnected && window.savePromptToDrive) {
        const ok = await window.savePromptToDrive(text);
        if (ok) {
            localStorage.removeItem('gantt_mail_prompt_pending_push');
            alert(_en ? '✅ Improved prompt adopted & saved to Drive. (v' + window._promptVersion + ')' : '✅ 개선된 프롬프트가 채택되어 드라이브에 저장되었습니다. (v' + window._promptVersion + ')');
        } else {
            localStorage.setItem('gantt_mail_prompt_pending_push', '1');
            alert(_en ? '⚠️ Adopted locally, but Drive upload failed. Will retry automatically next time Drive connects.' : '⚠️ 로컬에는 저장됐지만 드라이브 업로드에 실패했습니다. 다음 드라이브 연결 시 자동으로 다시 시도합니다.');
        }
    } else {
        localStorage.setItem('gantt_mail_prompt_pending_push', '1');
        alert(_en ? '✅ Improved prompt adopted. (v' + window._promptVersion + ')\n(Drive not connected — will sync to the team on next connect)' : '✅ 개선된 프롬프트가 채택되었습니다. (v' + window._promptVersion + ')\n(현재 드라이브 미연동 — 다음 연결 시 팀 공용으로 자동 반영됩니다)');
    }
    modal.style.display = 'none';
};

window.showPromptLogs = function() {
    let logs = JSON.parse(localStorage.getItem('gantt_prompt_logs') || '[]');
    let versions = JSON.parse(localStorage.getItem('gantt_prompt_versions') || '[]');
    if (logs.length === 0) { alert('프롬프트 변경 이력이 없습니다.'); return; }

    let logModal = document.getElementById('prompt-log-modal');
    if (!logModal) {
        logModal = document.createElement('div');
        logModal.id = 'prompt-log-modal';
        // 💡 [2026-08-24 UI 버그 수정] 이 모달만 예전 스타일(검은 배경 0.6 딤 + 드래그 불가)로 남아있어서
        //    다른 모달들(손 커서로 드래그 이동 가능, 배경은 보이고 조작도 가능)과 이질감이 있었음 —
        //    같은 표준 패턴(pointer-events:none 오버레이 + cursor:grab 드래그 헤더)으로 통일.
        //    또한 헤더에 ✕ 닫기 버튼이 실수로 2개(제대로 된 버튼 + 남아있던 잔여 ✖ span) 겹쳐 있던
        //    버그도 여기서 같이 제거함.
        logModal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9200; pointer-events:none; background:none; align-items:center; justify-content:center;';
        logModal.innerHTML = `
            <div id="prompt-log-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); resize:both; overflow:hidden; min-width:400px; min-height:300px;">
                <div id="prompt-log-drag" style="padding:13px 18px;border-bottom:1px solid #ffe08a;font-weight:bold;font-size:14px;background:#fff8e6;color:#7a5210;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;">
                    <span>🕒 프롬프트 변경 이력</span>
                    <button onclick="event.stopPropagation(); document.getElementById('prompt-log-modal').style.display='none'"
                        style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px;
                               color:var(--modal-icon-text); font-size:16px; cursor:pointer;
                               width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;
                               display:flex; align-items:center; justify-content:center; transition:0.15s;"
                        onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';"
                        onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';"
                        title="닫기">✕</button>
                </div>
                <div id="prompt-log-content" style="padding:15px;overflow-y:auto;flex:1;"></div>
                <div style="padding:15px;border-top:1px solid #dee2e6;display:flex;gap:6px;">
                    <button onclick="window.clearPromptLogs()" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:1;padding:10px;background:#fbe4e2;color:#b1432f;border:1px solid #eeb0ac;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;transition:background .15s, border-color .15s;">🗑️ 이력 삭제</button>
                    <button onclick="document.getElementById('prompt-log-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="flex:1;padding:10px;background:#f8f9fa;color:#555;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;transition:background .15s, border-color .15s;">닫기</button>
                </div>
            </div>`;
        document.body.appendChild(logModal);
        window._makeDraggable('prompt-log-box', 'prompt-log-drag');
        window._bindClickToFront('prompt-log-modal');
    }

    // 💡 [2026-08-31 버그 수정] table-layout이 auto(기본값)이던 상태에서 "변경일시"/"수정자" 칸에
    //    white-space:nowrap을 걸어두니, 칸이 좁아질 때 그 글자가 줄바꿈되는 대신 칸 경계를 넘어
    //    옆 칸(다음 열) 위에 겹쳐 보이는 버그가 있었음("...8:20박용훈"처럼 시각과 이름이 붙어 보임).
    //    table-layout:fixed + colgroup으로 각 열 너비를 고정폭 비율로 미리 확보해서, 브라우저가
    //    내용 길이에 따라 열 너비를 제멋대로 줄이지 못하게 막는다.
    let html = '<table style="width:100%; table-layout:fixed; border-collapse:collapse; font-size:12px;"><colgroup><col style="width:14%;"><col style="width:11%;"><col style="width:33%;"><col style="width:33%;"><col style="width:9%;"></colgroup>';
    html += '<tr style="background:#f8f9fa;"><th style="padding:8px;border:1px solid #dee2e6;">변경일시</th><th style="padding:8px;border:1px solid #dee2e6;">수정자</th><th style="padding:8px;border:1px solid #dee2e6;">변경 전 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">변경 후 (앞 200자)</th><th style="padding:8px;border:1px solid #dee2e6;">복원</th></tr>';
    [...logs].reverse().forEach((log, revIdx) => {
        // 💡 시간 문자열로 versions 배열에서 대응하는 전체 텍스트 스냅샷 매칭 (없으면 복원 버튼 비활성)
        const matched = versions.find(v => v.time === log.time);
        const restoreBtn = matched
            ? `<button onclick="window.restorePromptVersion(${matched.version})" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="font-size:11px; padding:4px 8px; background:#e6f6ea; color:#1f7a3d; border:1px solid #a8dab8; border-radius:4px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:background .15s, border-color .15s;">🔄 복원</button>`
            : `<span style="font-size:10px; color:#ccc;">-</span>`;
        html += `<tr>
            <td style="padding:8px;border:1px solid #dee2e6;color:#6c757d; word-break:break-word;">${log.time}</td>
            <td style="padding:8px;border:1px solid #dee2e6;font-weight:bold;color:#0056b3; word-break:break-word;">${log.userName}</td>
            <td style="padding:8px;border:1px solid #dee2e6;font-size:11px;color:#dc3545;word-break:break-all;">${log.oldPrompt}</td>
            <td style="padding:8px;border:1px solid #dee2e6;font-size:11px;color:#0f5132;word-break:break-all;">${log.newPrompt}</td>
            <td style="padding:8px;border:1px solid #dee2e6;text-align:center;">${restoreBtn}</td>
        </tr>`;
    });
    html += '</table>';

    document.getElementById('prompt-log-content').innerHTML = html;
    logModal.style.display = 'flex';
};

// 💡 특정 버전으로 복원 — 즉시 저장하지 않고 편집창에 불러와서 검토 후 저장하도록 유도
window.restorePromptVersion = function(version) {
    const versions = JSON.parse(localStorage.getItem('gantt_prompt_versions') || '[]');
    const target = versions.find(v => v.version === version);
    if (!target) { alert('해당 버전을 찾을 수 없습니다.'); return; }

    document.getElementById('prompt-log-modal').style.display = 'none';

    const textarea = document.getElementById('prompt-edit-textarea');
    if (textarea) textarea.value = target.prompt;
    // 편집 잠금 상태였다면 저장 버튼 노출 (unlockPrompt와 동일 효과)
    const saveBtn = document.getElementById('prompt-save-btn');
    const unlockBtn = document.getElementById('prompt-unlock-btn');
    if (saveBtn) saveBtn.style.display = 'block';
    if (unlockBtn) unlockBtn.style.display = 'none';

    alert('📋 v' + version + ' 버전을 불러왔습니다.\n내용을 확인한 후 [💾 저장] 버튼을 눌러야 최종 반영됩니다.');
};

window.clearPromptLogs = function() {
    localStorage.removeItem('gantt_prompt_logs');
    localStorage.removeItem('gantt_prompt_versions');
    document.getElementById('prompt-log-modal').style.display = 'none';
    alert('✅ 이력이 삭제되었습니다.');
};
        
// 💡 [2026-08-20][WBS 레벨 추정] AI의 wbs레벨 판단은 프롬프트에 뚜렷한 기준이 없어 3/4에만 몰리는
//    문제가 있었음 → "업무명이 대상 시트에 이미 있는 L1~L3 제목과 같으면 L4(그 밑 하위업무로),
//    완전히 새 제목이면 L3(새 세부업무)"로, AI 추측 대신 실제 시트 데이터를 근거로 판정.
//    recalculateSchedules()가 _origT1~T3를 각 행까지 forward-fill 해두므로, 레벨 상관없이 모든 행을
//    훑으면 "현재 존재하는 L1~L3 제목 전체"를 얻을 수 있음.
window._msGuessWbsLevel = function(taskName, gd) {
    const norm = s => String(s || '').replace(/\s+/g, '').replace(/[＊*]?AI📧$/, '').toLowerCase();
    const target = norm(taskName);
    if (!target || !gd) return 3;
    for (let i = 1; i < gd.length; i++) {
        const row = gd[i];
        if (!row) continue;
        if (norm(row._origT1) === target || norm(row._origT2) === target || norm(row._origT3) === target) {
            return 4; // 기존 제목과 일치 → 그 아래 하위업무로
        }
    }
    return 3; // 완전히 새 제목 → 새 세부업무로
};

// ✅ [공용] 분석 결과(r) → 간트 행 객체 생성 (개별 등록 / 보관함 배치 / 타 프로젝트 배분 공용)
//    gd/ci 생략 시 현재 프로젝트(globalData/colIdx) 기준으로 동작
window.buildMailTaskRow = function(r, gd, ci, mailRaw) {
    gd = gd || globalData;
    ci = ci || colIdx;
    // 💡 사용자가 미리보기에서 드롭다운으로 직접 고른 값이거나(_wbsLevelUserSet) AI가 0~2(대분류~
    //    소분류2)로 판단한 경우는 그대로 존중. 그 외(3/4/미지정)는 실제 시트 기준으로 재추정.
    const _aiWbsLevel = parseInt(r['wbs레벨'] ?? 4);
    const wbsLevel = (r['_wbsLevelUserSet'] || _aiWbsLevel <= 2)
        ? _aiWbsLevel
        : (window._msGuessWbsLevel ? window._msGuessWbsLevel(r['업무명'], gd) : _aiWbsLevel);

    let newRow = new Array(gd[0].length).fill("");
    newRow._level = wbsLevel;
    newRow._origDev = ""; newRow._origT1 = ""; newRow._origT2 = ""; newRow._origT3 = ""; newRow._origT4 = "";
    // ✅ 메일 추가 항목임을 표시하기 위해 📧 처리 (사용자가 확인 후 제거 가능)
    // ✅ ＊AI 마커: 병렬(_isParallel) 판정에 걸려서, 실수로 잠금이 풀려도 다른 형제 업무 일정을 밀지 않고 이 업무 하나만 영향받음 + 화면에서 AI가 넣은 업무임을 구분 가능
    const taskName = (r['업무명'] || "새 업무") + ' ＊AI📧';
    if (wbsLevel === 0) newRow._origDev = taskName;
    else if (wbsLevel === 1) newRow._origT1 = taskName;
    else if (wbsLevel === 2) newRow._origT2 = taskName;
    else if (wbsLevel === 3) newRow._origT3 = taskName;
    else if (wbsLevel === 4) newRow._origT4 = taskName;

    newRow._startForced = false; newRow._planForced = false;

    // ✅ 고객/모델/인치/담당자는 대상 데이터의 기존 행에서 직접 복사
    let refRow = null;
    for (let i = 1; i < gd.length; i++) {
        if (gd[i]) { refRow = gd[i]; break; }
    }
    // 💡 [담당구분] AI가 판정한 담당구분(예: LCM)이 있고 Summary에 해당 담당자가 등록돼 있으면
    //    그 담당자로 배정 — 없으면 기존처럼 대상 프로젝트의 기존 행(refRow) 담당자를 그대로 승계
    const _catAssignee = window._msResolveCategoryAssignee ? window._msResolveCategoryAssignee(r['담당구분']) : null;
    if (ci.assignee !== -1) newRow[ci.assignee] = _catAssignee ? _catAssignee.name : (refRow ? (refRow[ci.assignee] || "") : "");
    // 💡 [2026-08-28 버그 수정] r['담당구분']은 AI가 프롬프트 그대로("영업"/"기구"/"Tooling" 등 정식
    //    명칭으로) 응답한 원본값 — WBS 배지/드롭다운 짧은 코드(SAL/ME/TOOL 등)와 다른 문자열이라, 별칭
    //    변환 없이 그대로 저장하면 드롭다운에 "SAL"과 "영업"이 같은 뜻인데 서로 다른 값으로 중복 표시됐다.
    //    window._normalizeWbsDiscipline로 변환해서 저장(위 _catAssignee 조회는 원본 명칭 기준 매핑표를
    //    쓰므로 그대로 r['담당구분']을 넘긴 채 유지 — 여기 저장값만 바꾼다).
    newRow._담당구분 = window._normalizeWbsDiscipline ? window._normalizeWbsDiscipline(r['담당구분']) : (r['담당구분'] || '');
    if (ci.customer !== -1) newRow[ci.customer] = refRow ? (refRow[ci.customer] || "") : "";
    if (ci.model !== -1) newRow[ci.model] = refRow ? (refRow[ci.model] || "") : "";
    if (ci.inch !== -1) newRow[ci.inch] = refRow ? (refRow[ci.inch] || "") : "";
    // ✅ 분석 결과 매핑
    const _fixYear = (d) => {
    if (!d) return d;
    const m = d.match(/^(\d{4})([-\/]\d{1,2}[-\/]\d{1,2})$/);
    if (m && parseInt(m[1]) < new Date().getFullYear() - 1)
        return new Date().getFullYear() + m[2];
    return d;
    };
    if (ci.start !== -1 && r['시작일']) { newRow[ci.start] = _fixYear(r['시작일']); newRow._startForced = true; }
    if (ci.plan !== -1 && r['완료일']) { newRow[ci.plan] = _fixYear(r['완료일']); newRow._planForced = true; }
    if (ci.status !== -1) newRow[ci.status] = (r['상태'] || "진행").toString().trim();
    if (ci.devStage !== -1) newRow[ci.devStage] = (r['개발단계'] || "").toString().trim();
    if (ci.content !== -1) newRow[ci.content] = (r['상세내용'] || "").toString().trim().replace(/\\n/g, '\n');

    // 소요일 설정
    if (wbsLevel === 1 && ci.dur1 !== -1) newRow[ci.dur1] = "1";
    else if (wbsLevel === 2 && ci.dur2 !== -1) newRow[ci.dur2] = "1";
    else if (wbsLevel === 3 && ci.dur3 !== -1) newRow[ci.dur3] = "1";
    else if (wbsLevel === 4 && ci.dur4 !== -1) newRow[ci.dur4] = "1";
    else if (ci.period !== -1) newRow[ci.period] = "1";

    newRow._mailRaw = mailRaw || null;
    // 💡 [2026-08-24 신규] AI가 처음 뽑아낸 시작일/완료일 원본을 별도 백업 — 이후 자동 일정계산(특히
    //    ＊AI마커로 인한 _isParallel 처리, 아래 taskName 참고)으로 화면상 날짜가 틀어져도, "📅 AI 분석
    //    날짜로 복원" 버튼(window.restoreAiTaskDate)으로 이 원본값에 언제든 다시 맞출 수 있게 한다.
    //    완료일을 AI가 못 뽑은 경우(_aiOrigPlan이 없음)는 원래도 자동계산에 맡겨진 상태이므로 정상이다.
    newRow._aiOrigStart = r['시작일'] ? _fixYear(r['시작일']) : null;
    newRow._aiOrigPlan  = r['완료일'] ? _fixYear(r['완료일']) : null;
    return { row: newRow, taskName: taskName };
};

// ✅ [공용] L0~L4 구간(개발단계 devStage는 하위 레벨까지 forward-fill 되어 있음) 내에서
//    시작일 기준 최적 삽입 위치를 계산. useAuto=false 또는 조건 미충족 시 "구간 끝"으로 fallback.
// 💡 다른 프로젝트에서 방금 불러온 데이터는 화면에 표시된 적이 없어 _calcStartTs가 비어있을 수 있음.
//    recalculateSchedules()의 핵심 계산 로직만 뽑아와서, DOM/로그 등 부작용 없이 순수하게
//    각 행의 _calcStartTs / _calcPlanTs 만 채워주는 함수. (셀 값 자체는 건드리지 않음)
window.computeCalcDatesForRows = function(rows, ci) {
    if (!rows || rows.length === 0) return;
    let tree = []; let stack = {}; let fileGlobalStartTs = null;

    for (let row of rows) {
        if (!row) continue;
        let rawStart = ci.start !== -1 ? row[ci.start] : ""; let pDateStart = parseDateValue(rawStart); let parsedStartTs = pDateStart ? pDateStart.ts : null;
        let rawPlan = ci.plan !== -1 ? row[ci.plan] : ""; let pDatePlan = parseDateValue(rawPlan); let parsedPlanTs = pDatePlan ? pDatePlan.ts : null;
        let dur1 = ci.dur1 !== -1 ? getDurationDays(row[ci.dur1]) : null; let dur2 = ci.dur2 !== -1 ? getDurationDays(row[ci.dur2]) : null; let dur3 = ci.dur3 !== -1 ? getDurationDays(row[ci.dur3]) : null; let dur4 = ci.dur4 !== -1 ? getDurationDays(row[ci.dur4]) : null; let pDur = ci.period !== -1 ? getDurationDays(row[ci.period]) : null;
        let planStr = rawPlan !== null && rawPlan !== undefined ? rawPlan.toString().trim() : ""; let match = planStr.match(/^(\d+)(일|days)?$/i);
        let finalDur = 0; let hasDuration = (dur1 !== null || dur2 !== null || dur3 !== null || dur4 !== null || pDur !== null || match);

        if (row._level === 1 && dur1 !== null) finalDur = dur1; else if (row._level === 2 && dur2 !== null) finalDur = dur2; else if (row._level === 3 && dur3 !== null) finalDur = dur3; else if (row._level === 4 && dur4 !== null) finalDur = dur4; else if (pDur !== null) finalDur = pDur; else if (match && parseInt(match[1], 10) < 10000) finalDur = parseInt(match[1], 10);

        row._finalDuration = finalDur;
        row._isExplicitZero = (finalDur === 0 && (dur1 === 0 || dur2 === 0 || dur3 === 0 || dur4 === 0 || pDur === 0 || (match && parseInt(match[1], 10) === 0)));

        if (row._level === 0 || row._startForced || !hasDuration) row._explicitStartTs = parsedStartTs; else row._explicitStartTs = null;
        if (row._level === 0 || row._planForced || !hasDuration) row._explicitPlanTs = parsedPlanTs; else row._explicitPlanTs = null;
        if (row._explicitStartTs && row._explicitPlanTs && row._explicitPlanTs < row._explicitStartTs) row._explicitPlanTs = row._explicitStartTs;

        if (row._explicitStartTs) {
            if (fileGlobalStartTs === null || row._explicitStartTs < fileGlobalStartTs) fileGlobalStartTs = row._explicitStartTs;
        }

        let taskName = "";
        if (row._level === 0) taskName = row._origDev || ""; else if (row._level === 1) taskName = row._origT1 || ""; else if (row._level === 2) taskName = row._origT2 || ""; else if (row._level === 3) taskName = row._origT3 || ""; else if (row._level === 4) taskName = row._origT4 || "";
        let contentStr = ci.content !== -1 ? (row[ci.content] || "").toString() : "";
        row._isParallel = taskName.includes('*') || taskName.includes('＊') || contentStr.includes('*') || contentStr.includes('＊');

        let node = { row: row, level: row._level, isParallel: row._isParallel, explicitStartTs: row._explicitStartTs, explicitPlanTs: row._explicitPlanTs, duration: row._finalDuration, children: [], startTs: null, endTs: null };

        if (node.level === 0) { tree.push(node); stack[0] = node; stack[1] = null; stack[2] = null; stack[3] = null; stack[4] = null; }
        else {
            let parentLvl = node.level - 1; while (parentLvl >= 0 && !stack[parentLvl]) parentLvl--;
            if (parentLvl >= 0 && stack[parentLvl]) stack[parentLvl].children.push(node); else tree.push(node);
            stack[node.level] = node; for (let l = node.level + 1; l <= 4; l++) stack[l] = null;
        }
    }

    function propagateZero(node) {
        if (node.children.length === 0) return !!node.row._isExplicitZero;
        let allZero = true; for (let i = 0; i < node.children.length; i++) { if (!propagateZero(node.children[i])) allZero = false; }
        node.row._isExplicitZero = allZero; return allZero;
    }
    for (let i = 0; i < tree.length; i++) propagateZero(tree[i]);

    function scheduleNode(node, inheritedStartTs) {
        if (node.explicitStartTs) node.startTs = node.explicitStartTs; else node.startTs = inheritedStartTs || new Date().setHours(0,0,0,0);
        if (node.children.length === 0) {
            let dur = node.duration || 0;
            if (node.explicitPlanTs && (node.level === 0 || dur === 0 || node.row._planForced)) {
                node.endTs = node.explicitPlanTs; node.row._finalDuration = countWorkingDays(node.startTs, node.endTs);
            } else if (dur > 0) { node.endTs = addWorkingDays(node.startTs, dur - 1); }
            else { node.endTs = node.startTs; }
            return;
        }
        let currentWaterfallStart = node.startTs; let maxChildEnd = node.startTs; let groupStartTs = node.startTs; let isFirstValid = true;
        for (let i = 0; i < node.children.length; i++) {
            let child = node.children[i];
            if (child.row._isExplicitZero) { scheduleNode(child, currentWaterfallStart); continue; }
            let intendedStart;
            if (isFirstValid) intendedStart = node.startTs;
            else if (child.isParallel) intendedStart = groupStartTs;
            else intendedStart = currentWaterfallStart;
            scheduleNode(child, intendedStart);
            if (isFirstValid) { groupStartTs = child.startTs; isFirstValid = false; }
            else if (!child.isParallel) { groupStartTs = child.startTs; }
            if (child.endTs > maxChildEnd) maxChildEnd = child.endTs;
            currentWaterfallStart = addWorkingDays(maxChildEnd, 1);
        }
        node.endTs = maxChildEnd;
    }

    let currentL0Start = fileGlobalStartTs || new Date().setHours(0,0,0,0);
    let maxL0End = currentL0Start; let groupL0StartTs = currentL0Start; let isFirstValidL0 = true;
    for (let i = 0; i < tree.length; i++) {
        let l0Node = tree[i];
        if (l0Node.row._isExplicitZero) { scheduleNode(l0Node, currentL0Start); continue; }
        let intendedStart;
        if (isFirstValidL0) intendedStart = currentL0Start;
        else if (l0Node.isParallel) intendedStart = groupL0StartTs;
        else intendedStart = currentL0Start;
        scheduleNode(l0Node, intendedStart);
        if (isFirstValidL0) { groupL0StartTs = l0Node.startTs; isFirstValidL0 = false; }
        else if (!l0Node.isParallel) { groupL0StartTs = l0Node.startTs; }
        if (l0Node.endTs > maxL0End) maxL0End = l0Node.endTs;
        currentL0Start = addWorkingDays(maxL0End, 1);
    }

    function applyDatesToRow(node) {
        node.row._calcStartTs = node.startTs;
        node.row._calcPlanTs = node.endTs;
        for (let child of node.children) applyDatesToRow(child);
    }
    for (let l0Node of tree) applyDatesToRow(l0Node);
};

// 💡 공용: L0(개발단계) 구간별 이름 + 날짜범위(계산된 시작~완료 기준)를 함께 뽑아줌
//    devStage 컬럼 모드/WBS 단일컬럼 모드 모두 지원. 현재 프로젝트/다른 프로젝트 공용.
window.buildL0SectionInfo = function(rows, ci) {
    const out = [];
    const findOrAdd = function(name) {
        for (let i = 0; i < out.length; i++) { if (out[i].name === name) return out[i]; }
        const e = { name: name, startTs: null, endTs: null };
        out.push(e);
        return e;
    };
    const feed = function(name, row) {
        if (!name) return;
        const e = findOrAdd(name);
        const s = row._calcStartTs, p = row._calcPlanTs;
        if (s && (e.startTs === null || s < e.startTs)) e.startTs = s;
        if (p && (e.endTs === null || p > e.endTs)) e.endTs = p;
    };

    if (!rows || rows.length <= 1 || !ci) return out;
    if (ci.devStage !== -1) {
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            feed((row[ci.devStage] || '').toString().trim(), row);
        }
    } else if (ci.wbs !== -1) {
        let curName = null;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            if (row._level === 0) curName = (row._origDev || row[ci.wbs] || '').toString().trim();
            feed(curName, row);
        }
    }
    return out;
};

// 💡 공용: 업무의 시작일이 어느 구간 범위 안에 드는지 찾아서 이름을 반환 (없으면 __END__)
window.pickL0SectionByDate = function(l0List, taskDateStr) {
    const taskTs = (taskDateStr && !taskDateStr.includes('날짜확인필요') && typeof parseDateValue === 'function' && parseDateValue(taskDateStr))
        ? parseDateValue(taskDateStr).ts : null;
    if (!taskTs || !l0List || !l0List.length) return '__END__';

    // 1순위: 업무 시작일이 날짜범위 안에 드는 구간
    let matched = l0List.find(function(sec) { return sec.startTs && sec.endTs && taskTs >= sec.startTs && taskTs <= sec.endTs; });
    // 2순위: 없으면 업무 시작일 이후 가장 가까운 시일에 시작하는 구간
    if (!matched) {
        const later = l0List.filter(function(sec) { return sec.startTs && sec.startTs >= taskTs; })
                             .sort(function(a, b) { return a.startTs - b.startTs; });
        matched = later[0];
    }
    // 3순위: 그래도 없으면 가장 늦게 끝나는 구간
    if (!matched) {
        const latest = l0List.slice().sort(function(a, b) { return (b.endTs || 0) - (a.endTs || 0); });
        matched = latest[0];
    }
    return matched ? matched.name : '__END__';
};

// 💡 타임스탬프 → "YYYY/MM" 형식으로 간단 표기
window.formatYM = function(ts) {
    if (!ts) return '?';
    const d = new Date(ts);
    return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0');
};

window.computeL0InsertPos = function(rows, ci, l0Value, startDateStr, useAuto) {
    if (l0Value === '__END__' || !rows || rows.length <= 1) {
        return { pos: rows ? rows.length : 0, usedDateMatch: false, previewLabel: '📍 맨 끝에 추가' };
    }
    // 구간 범위 탐색
    let first = -1, last = -1;
    if (ci.devStage !== -1) {
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            if ((row[ci.devStage] || '').toString().trim() === l0Value) { if (first === -1) first = i; last = i; }
        }
    } else if (ci.wbs !== -1) {
        // 💡 단일 "개발업무(WBS)" 열 모드: LEVEL 0 행을 찾아서, 다음 LEVEL 0 행 전까지를 그 구간으로 간주
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            if (row._level === 0) {
                const label = (row._origDev || row[ci.wbs] || '').toString().trim();
                if (label === l0Value) {
                    first = i; last = i;
                    for (let j = i + 1; j < rows.length; j++) {
                        const r2 = rows[j]; if (!r2) continue;
                        if (r2._level === 0) break;
                        last = j;
                    }
                    break;
                }
            }
        }
    }
    if (first === -1) {
        return { pos: rows.length, usedDateMatch: false, previewLabel: '⚠️ 해당 구간을 찾지 못해 맨 끝에 추가됩니다.' };
    }
    const fallback = { pos: last + 1, usedDateMatch: false, previewLabel: `📍 [${l0Value}] 구간 끝에 추가` };
    if (!useAuto) return fallback;

    const startTs = (startDateStr && !startDateStr.includes('날짜확인필요') && typeof parseDateValue === 'function' && parseDateValue(startDateStr))
        ? parseDateValue(startDateStr).ts : null;
    if (!startTs) return fallback; // 날짜 미확정 → fallback 유지

    let bestIndex = -1;
    for (let i = first; i <= last; i++) {
        const row = rows[i]; if (!row) continue;
        const rowStartTs = row._calcStartTs;
        if (rowStartTs && rowStartTs > startTs) { bestIndex = i - 1; break; }
    }
    if (bestIndex === -1) return fallback; // 구간 내 모든 행보다 늦은 날짜 → 결과적으로 구간 끝과 동일

    const pos = Math.max(bestIndex + 1, first);
    const anchorRow = rows[pos];
    const anchorName = anchorRow ? (anchorRow._origDev || anchorRow._origT1 || anchorRow._origT2 || anchorRow._origT3 || anchorRow._origT4 || '') : '';
    return { pos: pos, usedDateMatch: true, previewLabel: `🎯 [${l0Value}] 구간 내 "${anchorName || (pos + '행')}" 앞에 자동 삽입` };
};

window.insertMailTask = function() {
    if (!window._mailAnalyzedResult) { alert('먼저 분석을 실행해주세요.'); return; }
    if (!globalData || globalData.length <= 1) { alert('먼저 엑셀 파일을 로드해주세요.'); return; }

    const r = window._mailAnalyzedResult;
    // ✅ 날짜 미입력 시 삽입 차단 (필드 매핑 전에 선검증)
    if ((r['시작일'] || '').includes('날짜확인필요') || (r['완료일'] || '').includes('날짜확인필요')) {
        alert('⚠️ 시작일 또는 완료일을 먼저 입력해주세요.');
        return;
    }

    const insertAfter = parseInt(document.getElementById('mail-insert-position').value);
    const built = window.buildMailTaskRow(r, undefined, undefined, window._mailParsedRaw);

    const pos = insertAfter === -1 ? globalData.length : insertAfter + 1;
    globalData.splice(pos, 0, built.row);

    logChange(pos, -1, "없음", `메일 분석으로 추가: ${built.taskName}`);
    window.closeMailAnalyzer();
    window.recalculateSchedules();
    alert(`✅ "${built.taskName}" 업무가 추가되었습니다!`);
};

// =========================================================
// 📥 [Phase 1] 업무 보관함 (Task Inbox) — 프로젝트 독립 스테이징
// =========================================================
window.TaskInbox = {
    KEY: 'gantt_task_inbox',
    _driveFileId: null,
    _syncTimer: null,
    _fileName: function() {
        const name = (window.currentUserName || '').replace(/[\\\/:*?"<>|]/g, '').trim();
        return (name && name !== '비로그인 (로컬)') ? ('TaskInbox_' + name + '.json') : null;
    },
    load: function() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch(e) { return []; }
    },
    save: function(list, skipSync) {
        localStorage.setItem(this.KEY, JSON.stringify(list));
        window.updateInboxBadge();
        if (!skipSync) this.scheduleDriveSync(); // 💡 저장할 때마다 드라이브 자동 동기화 (3초 디바운스)
        // 💡 [실시간 반영] add/remove/setStatus 등 어디서 저장이 일어나든, 업무 보관함 모달이 지금 열려있으면
        //    그 자리에서 바로 다시 그려줌 — 예전엔 batchToInbox 한 곳에서만 이 처리를 해서, 완전자동 등록이나
        //    자동틱처럼 다른 경로로 담긴 항목은 모달을 닫았다 다시 열어야만 보였음
        const ov = document.getElementById('task-inbox-overlay');
        if (ov && ov.style.display === 'flex' && window.renderTaskInbox) window.renderTaskInbox();
    },
    add: function(task, meta) {
        const list = this.load();
        list.unshift({
            uid: 'ib_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            task: JSON.parse(JSON.stringify(task)),
            source: (meta && meta.source) || '메일분석',
            addedAt: new Date().toISOString(),
            status: '대기',            // 대기 | 배치됨 (Phase2에서 '전송됨' 추가)
            history: [],
            mailRaw: (meta && meta.mailRaw) ? meta.mailRaw : null,  // 💡 파싱 원문 보관 (없으면 null)
            // 💡 [매칭/점수 통일화] Stage1 매칭결과를 소스 라벨(텍스트)뿐 아니라 구조화 데이터로도 보관
            //    — 이게 없으면 "다른 프로젝트로 전송" 버튼이 매칭결과를 몰라서 매번 전체 목록을 새로 뒤져야 함
            matchedProject: (meta && meta.matchedProject) ? meta.matchedProject : null,
            alarmWorthy: !!(meta && meta.alarmWorthy)
        });
        this.save(list);
    },
    remove: function(uid) {
        this.save(this.load().filter(it => it.uid !== uid));
    },
    setStatus: function(uid, status, historyEntry) {
        const list = this.load();
        const it = list.find(x => x.uid === uid);
        if (!it) return;
        // 💡 [처리됨 자동삭제 모드] "대기"가 아닌 상태(=처리 완료)로 바뀌는 순간, 모드가 'auto'면
        //    [🧹 처리됨 정리]를 기다리지 않고 바로 목록에서 제거한다. (window.getInboxCleanupMode 참고)
        if (status !== '대기' && window.getInboxCleanupMode && window.getInboxCleanupMode() === 'auto') {
            this.save(list.filter(x => x.uid !== uid));
            return;
        }
        it.status = status;
        if (historyEntry) (it.history = it.history || []).push(historyEntry);
        this.save(list);
    },
    // ── 💡 [A안] 구글 드라이브 개인 보관함 동기화 ──
    _token: function() {
        try { const t = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null; return (t ? t.access_token : null) || window.googleAccessToken || null; } catch(e) { return window.googleAccessToken || null; }
    },
    scheduleDriveSync: function() {
        const self = this;
        if (self._syncTimer) clearTimeout(self._syncTimer);
        self._syncTimer = setTimeout(function() { self.syncToDrive(); }, 3000);
    },
    syncToDrive: async function() {
        const fname = this._fileName(); const token = this._token();
        if (!fname || !token) return; // 비로그인: localStorage 단독 동작
        try {
            const folderId = await window.getOrCreateTaskInboxFolder(token);
            if (!this._driveFileId) this._driveFileId = await window._findOrMigrateFile(token, fname, folderId);
            const boundary = 'inbox_sync_boundary';
            const metadata = { name: fname, mimeType: 'application/json' };
            if (!this._driveFileId) metadata.parents = [folderId];
            const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ inbox: this.load(), savedAt: new Date().toISOString() }) + "\r\n--" + boundary + "--";
            const url = 'https://www.googleapis.com/upload/drive/v3/files' + (this._driveFileId ? '/' + this._driveFileId : '') + '?uploadType=multipart&supportsAllDrives=true';
            const resp = await fetch(url, { method: this._driveFileId ? 'PATCH' : 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, body: body });
            const file = await resp.json();
            if (resp.ok && file && file.id) this._driveFileId = file.id;
        } catch (e) { console.warn('보관함 드라이브 동기화 실패(로컬에는 저장됨):', e); }
    },
    loadFromDrive: async function() {
        const fname = this._fileName(); const token = this._token();
        if (!fname || !token) return;
        try {
            const folderId = await window.getOrCreateTaskInboxFolder(token);
            this._driveFileId = await window._findOrMigrateFile(token, fname, folderId);
            if (!this._driveFileId) { this.scheduleDriveSync(); return; } // 첫 사용: 로컬 내용을 드라이브로 업로드
            const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + this._driveFileId + '?alt=media&supportsAllDrives=true', { headers: { 'Authorization': 'Bearer ' + token } });
            if (!resp.ok) return;
            const data = await resp.json();
            const remote = (data && data.inbox) || [];
            // 💡 uid 기준 병합: 같은 항목은 로컬 우선(현재 기기에서 조작한 상태가 최신), 드라이브에만 있으면 복원
            const local = this.load(); const byUid = {};
            remote.forEach(function(it) { if (it && it.uid) byUid[it.uid] = it; });
            local.forEach(function(it) { if (it && it.uid) byUid[it.uid] = it; });
            const merged = Object.keys(byUid).map(function(k) { return byUid[k]; }).sort(function(a, b) { return (b.addedAt || '').localeCompare(a.addedAt || ''); });
            this.save(merged, true);
            this.scheduleDriveSync();
            const ov = document.getElementById('task-inbox-overlay');
            if (window.renderTaskInbox && ov && ov.style.display === 'flex') window.renderTaskInbox();
        } catch (e) { console.warn('보관함 드라이브 복원 실패(로컬 유지):', e); }
    }
};

// 💡 공용: 모달을 열 때마다 그 순간 가장 높은 z-index를 부여해서 항상 맨 위로 오게 함
window._topModalZ = window._topModalZ || 9999;
window.bringModalToFront = function(overlayId) {
    const el = document.getElementById(overlayId);
    if (!el) return;
    window._topModalZ += 1;
    el.style.zIndex = String(window._topModalZ);
};

// 열려있는 모달을 클릭하면 항상 최상단으로 (겹칠 때 마지막 클릭한 창이 위로)
window._bindClickToFront = function(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    el.addEventListener('mousedown', function() {
        window._topModalZ = (window._topModalZ || 9999) + 1;
        el.style.zIndex = String(window._topModalZ);
    });
};
['alarm-settings-modal', 'mail-analyzer-modal', 'task-inbox-modal', 'alarm-modal', 'alarm-schedule-modal', 'notice-modal'].forEach(window._bindClickToFront);

window.updateInboxBadge = function() {
    const badge = document.getElementById('inbox-badge');
    if (!badge) return;
    const n = window.TaskInbox.load().filter(it => it.status === '대기').length;
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-block' : 'none';
};

window.openTaskInbox = function() {
    window.closeAllTopbarMenus(); // ✅ 업무 보관함 열릴 때 업무 드롭다운 자동 닫기
    window.renderTaskInbox();
    if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); // 💡 미분류/신규발신자 배지가 이제 여기 있음
    if (window.refreshInboxCleanupModeButton) window.refreshInboxCleanupModeButton(); // 💡 처리됨 자동삭제/보관 토글 버튼 상태 갱신
    document.getElementById('task-inbox-overlay').style.display = 'flex';
    window.bringModalToFront('task-inbox-overlay');
};
window.closeTaskInbox = function() {
    document.getElementById('task-inbox-overlay').style.display = 'none';
};

// 현재 프로젝트의 개발단계(L0) 목록 수집
window.getCurrentL0List = function() {
    if (!globalData || globalData.length <= 1 || !colIdx) return [];
    return window.buildL0SectionInfo(globalData, colIdx);
};

// 💡 [버그 수정] "▼ 상세 보기"로 펼친 상태는 지금까지 DOM(display:none/block)에만 있었는데,
//    renderTaskInbox()는 목록 전체를 innerHTML로 통째로 새로 그리기 때문에, 버튼 하나(현재 Proj 전송/
//    매칭 Proj 전송/🗑 등)를 눌러 목록이 다시 그려지는 순간 펼쳐놨던 상세 내용이 전부 접혀버렸음.
//    → 어떤 카드를 펼쳤는지 uid 기준으로 별도 기억해뒀다가, 다시 그릴 때 그 상태를 그대로 복원한다.
window._ibExpandedUids = window._ibExpandedUids || new Set();
window._ibToggleDetail = function(uid, linkEl) {
    const d = document.getElementById('inbox-detail-' + uid);
    if (!d) return;
    const open = d.style.display === 'none';
    d.style.display = open ? 'block' : 'none';
    const _en = window._currentLang === 'en';
    linkEl.textContent = open ? (_en ? '▲ Collapse' : '▲ 상세 접기') : (_en ? '▼ Details' : '▼ 상세 보기');
    if (open) window._ibExpandedUids.add(uid); else window._ibExpandedUids.delete(uid);
};

window.renderTaskInbox = function() {
    const listEl = document.getElementById('inbox-list');
    if (!listEl) return;
    // 💡 목록을 통째로 다시 그리기 전에, 여러 카드가 공유하는 dist-step2가
    //    현재 어느 카드 안에 들어있든 함께 파괴되지 않도록 body로 먼저 대피
    const step2 = document.getElementById('dist-step2');
    if (step2 && step2.parentElement && step2.parentElement.id !== 'inbox-dist-overlay') {
        step2.style.display = 'none';
        document.body.appendChild(step2);
    }
    const items = window.TaskInbox.load();
    const _ibEn = window._currentLang === 'en';
    if (items.length === 0) {
        listEl.innerHTML = '<div style="padding:40px 0; text-align:center; color:#aaa; font-size:13px;">' + (_ibEn ? 'Inbox is empty.<br>Use the [📥 Inbox] button in the mail analysis screen to add tasks.' : '보관함이 비어 있습니다.<br>메일 분석 화면에서 [📥 보관함] 버튼으로 업무를 담아주세요.') + '</div>';
        return;
    }
    const l0List = window.getCurrentL0List();
    const statusStyle = { '대기': 'background:#fff3e0;color:#e67e22;', '배치됨': 'background:#d4edda;color:#2f9e44;', '전송됨': 'background:#e7f3ff;color:#1971c2;', '자동배치됨': 'background:#f3f0ff;color:#7048e8;' };
    const statusLabel = _ibEn
        ? { '대기': 'Pending', '배치됨': 'Placed', '전송됨': 'Sent', '자동배치됨': 'Auto-placed' }
        : { '대기': '대기', '배치됨': '배치됨', '전송됨': '전송됨', '자동배치됨': '자동배치됨' };
    let html = '';
    items.forEach(function(it) {
        const t = it.task || {};
        // 💡 업무의 개발단계 값이 실제 구간명과 정확히 일치하면 그걸 우선 쓰고,
        //    아니면(AI분석 업무는 대부분 여기 해당) 날짜 기반으로 알맞은 구간을 자동 선택
        const devStageVal = (t['개발단계'] || '').trim();
        const wantName = l0List.some(function(sec) { return sec.name === devStageVal; })
            ? devStageVal
            : window.pickL0SectionByDate(l0List, t['시작일'] || '');
        const l0Options = ['<option value="__END__">' + (_ibEn ? '(Append at end)' : '(맨 끝에 추가)') + '</option>']
            .concat(l0List.map(function(sec) {
                const selAttr = (sec.name === wantName) ? ' selected' : '';
                const range = window.formatYM(sec.startTs) + '~' + window.formatYM(sec.endTs);
                return '<option value="' + escapeHtml(sec.name) + '"' + selAttr + '>' + escapeHtml(sec.name) + (_ibEn ? ' end (' : ' 구간 끝 (') + range + ')</option>';
            })).join('');
        const dateStr = (t['시작일'] || '?') + ' ~ ' + (t['완료일'] || '?');
        const when = it.addedAt ? new Date(it.addedAt).toLocaleString() : '';
        // 💡 [담당구분] 매칭된 프로젝트가 지금 열려있는 시트와 같을 때만 실제 담당자명까지 붙임
        //    (다른 프로젝트로 매칭된 항목은 그 프로젝트의 Summary 정보가 메모리에 없어 이름을 알 수 없음)
        const catVal = (t['담당구분'] || '').trim();
        let assigneeBadge = '';
        if (catVal && catVal !== '미분류') {
            const isCurProj = it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0]
                && it.matchedProject.candidates[0].drive_file_id === window.currentDriveFileId;
            const resolved = isCurProj && window._msResolveCategoryAssignee ? window._msResolveCategoryAssignee(catVal) : null;
            assigneeBadge = ' · 담당: ' + escapeHtml(catVal) + (resolved && resolved.name ? ' (' + escapeHtml(resolved.name) + ')' : '');
        }
        html += `
        <div style="border:1px solid #e0e0e0; border-radius:8px; padding:10px 12px; margin-bottom:8px; background:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
                    <span style="font-size:13px; font-weight:bold; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t['업무명'] || '새 업무')} 📧</span>
                    <a href="javascript:void(0)" onclick="window._ibToggleDetail('${it.uid}', this)" style="flex-shrink:0; font-size:11px; color:#1971c2; text-decoration:none; font-weight:bold; white-space:nowrap;">${window._ibExpandedUids.has(it.uid) ? (_ibEn ? '▲ Collapse' : '▲ 상세 접기') : (_ibEn ? '▼ Details' : '▼ 상세 보기')}</a>
                    <button onclick="window.extractInboxForAI('${it.uid}')" onmouseover="this.style.background='#e4dbff'; this.style.borderColor='#b8a4f0';" onmouseout="this.style.background='#f3f0ff'; this.style.borderColor='#d0bfff';" title="${_ibEn ? 'Copy mail source + analysis result to clipboard, to discuss a mismatch with AI' : '메일 원문 + 분석 결과를 복사해서 AI에게 오매칭 여부를 문의할 수 있습니다'}" style="flex-shrink:0; font-size:11px; padding:2px 8px; background:#f3f0ff; color:#5f3dc4; border:1px solid #d0bfff; border-radius:5px; cursor:pointer; font-weight:bold; white-space:nowrap; transition:background .15s, border-color .15s;">📋 ${_ibEn ? 'Extract' : '추출'}</button>
                </div>
                <span style="flex-shrink:0; font-size:10px; font-weight:bold; padding:2px 8px; border-radius:10px; white-space:nowrap; ${statusStyle[it.status] || statusStyle['대기']}">${statusLabel[it.status] || it.status}</span>
            </div>
            <div style="font-size:11px; color:#888; margin-top:3px;">
                ${dateStr}${t['개발단계'] ? ' · L0: ' + escapeHtml(t['개발단계']) : ''}${assigneeBadge} · ${escapeHtml(it.source || '')} · ${when}
            </div>
            <div id="inbox-detail-${it.uid}" style="display:${window._ibExpandedUids.has(it.uid) ? 'block' : 'none'}; margin-top:6px; padding:8px 10px; background:#f8f9fb; border:1px solid #e6e9ef; border-radius:6px; font-size:11.5px; color:#444; line-height:1.6;">
                <div><b>${_ibEn ? 'Task' : '업무명'}</b> : ${escapeHtml(t['업무명'] || '')}</div>
                <div><b>${_ibEn ? 'Detail' : '상세내용'}</b> : <span style="white-space:pre-wrap;">${escapeHtml((t['상세내용'] || '').toString())}</span></div>
                <div><b>${_ibEn ? 'Period' : '기간'}</b> : ${escapeHtml(t['시작일'] || '?')} ~ ${escapeHtml(t['완료일'] || '?')} · <b>${_ibEn ? 'Status' : '상태'}</b> : ${escapeHtml(t['상태'] || '진행')} · <b>${_ibEn ? 'WBS Level' : 'WBS레벨'}</b> : L${escapeHtml(String(t['wbs레벨'] !== undefined ? t['wbs레벨'] : 4))}</div>
                ${(it.history && it.history.length) ? '<div style="margin-top:4px;"><b>' + (_ibEn ? 'History' : '이력') + '</b> : ' + it.history.map(function(h){ return escapeHtml((h.time || '') + ' ' + (h.type || '') + ' → ' + (h.target || '')); }).join('<br>　　　　') + '</div>' : ''}
                ${it.mailRaw ? `<div style="margin-top:6px;"><button onclick="window.showInboxMailRaw('${it.uid}')" style="font-size:11px; padding:3px 10px; background:#e7f3ff; color:#1971c2; border:1px solid #a5c8f0; border-radius:5px; cursor:pointer;">📧 ${_ibEn ? 'View Mail Source' : '원문 보기'}</button></div>` : ''}
            </div>
            ${(it.history && it.history.length) ? `<div style="font-size:10px; color:#1971c2; margin-top:2px;">↳ ${it.history.map(function(h){ return escapeHtml((h.type || '') + ': ' + (h.target || '')); }).join(' / ')}</div>` : ''}
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; align-items:center;">
                <select id="inbox-l0-${it.uid}" onchange="window.inboxRecomputePreview('${it.uid}')" style="flex:0 1 200px; min-width:60px; max-width:220px; padding:0 3px; height:31px; box-sizing:border-box; border:1px solid #ced4da; border-radius:6px; font-size:11px; background:#fff;">${l0Options}</select>
                <button onclick="window.inboxPlaceToCurrent('${it.uid}')" onmouseover="this.style.background='#cfe6fa'; this.style.borderColor='#7fb0dd';" onmouseout="this.style.background='#e8f4fd'; this.style.borderColor='#a5c8f0';" style="flex:1.6 1 0; min-width:0; font-size:12px; white-space:nowrap; padding:0 6px; height:31px; box-sizing:border-box; border:1px solid #a5c8f0; border-radius:6px; background:#e8f4fd; color:#1a4f7a; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">➡️ ${_ibEn ? 'Current Proj' : '현재 Proj 전송'}</button>
                ${(it.matchedProject && it.matchedProject.status === 'matched' && it.matchedProject.candidates && it.matchedProject.candidates[0] && it.matchedProject.candidates[0].drive_file_id)
                    ? `<button onclick="window.inboxQuickRegisterMatched('${it.uid}')" title="${escapeHtml((it.matchedProject.candidates[0].model || it.matchedProject.candidates[0].customer || '') + ' (' + (it.matchedProject.candidates[0].assignee || '') + ')')}" onmouseover="this.style.background='#c9ecd3'; this.style.borderColor='#7cc494';" onmouseout="this.style.background='#e6f6ea'; this.style.borderColor='#a8dab8';" style="flex:1.6 1 0; min-width:0; font-size:12px; white-space:nowrap; padding:0 6px; height:31px; box-sizing:border-box; border:1px solid #a8dab8; border-radius:6px; background:#e6f6ea; color:#1f7a3d; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">✅ ${_ibEn ? 'Send to matched' : '매칭 Proj 전송'}</button>`
                    : ''}
                <button onclick="window.inboxOpenDistribute('${it.uid}')" onmouseover="this.style.background='#f4d9b3'; this.style.borderColor='#dba354';" onmouseout="this.style.background='#fbead9'; this.style.borderColor='#edbf85';" style="flex:1.6 1 0; min-width:0; font-size:12px; white-space:nowrap; padding:0 6px; height:31px; box-sizing:border-box; border:1px solid #edbf85; border-radius:6px; background:#fbead9; color:#a85d0a; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">📤 ${_ibEn ? 'Other Proj' : '다른 Proj 선택'}</button>
                <button onclick="window._ibExpandedUids.delete('${it.uid}'); window.TaskInbox.remove('${it.uid}'); window.renderTaskInbox();" onmouseover="this.style.background='#f5c2bd'; this.style.borderColor='#e08f87';" onmouseout="this.style.background='#fbe4e2'; this.style.borderColor='#eeb0ac';" style="flex:0 0 auto; font-size:13px; padding:0 12px; height:31px; box-sizing:border-box; border:1px solid #eeb0ac; border-radius:6px; background:#fbe4e2; color:#b1432f; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">🗑</button>
            </div>
            <div id="inbox-dist-inline-${it.uid}" style="display:none; margin-top:8px; padding:8px; background:#fff8f0; border:1px solid #f5c68a; border-radius:8px; max-height:260px; overflow-y:auto;"></div>
            <div id="inbox-cur-auto-row-${it.uid}" style="display:flex; align-items:center; gap:6px; margin-top:6px; font-size:11px; color:#555;">
                <label style="display:flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
                    <input type="checkbox" id="inbox-auto-${it.uid}" checked onchange="window.inboxRecomputePreview('${it.uid}')" style="cursor:pointer;">
                    ${_ibEn ? '🎯 Auto-position in current project (by start date)' : '🎯 현재 프로젝트 자동위치(시작일 기준)'}
                </label>
                <span id="inbox-preview-${it.uid}" style="color:#1971c2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
            </div>
        </div>`;
    });
    listEl.innerHTML = html;
    items.forEach(function(it) { window.inboxRecomputePreview(it.uid); }); // 초기 미리보기 계산
};

// 💡 [매칭/점수 통일화] Stage1이 단일 프로젝트로 확정한 항목은 "다른 프로젝트" 모달로 전체 목록을
//    다시 뒤질 필요 없이, 이미 알고 있는 drive_file_id로 바로 전송 — _msAutoRegisterToProject(자동틱과 동일 로직) 재사용
window.inboxQuickRegisterMatched = async function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const mp = it.matchedProject;
    if (!mp || mp.status !== 'matched' || !mp.candidates || !mp.candidates[0] || !mp.candidates[0].drive_file_id) {
        alert('매칭된 프로젝트 정보가 없습니다. [📤 다른 프로젝트]로 직접 선택해주세요.');
        return;
    }
    const target = mp.candidates[0];
    if ((it.task['시작일'] || '').includes('날짜확인필요') || (it.task['완료일'] || '').includes('날짜확인필요')) {
        alert('⚠️ 시작일/완료일이 미확정(날짜확인필요) 상태입니다.\n메일 분석 화면에서 날짜를 확정한 후 다시 시도해주세요.');
        return;
    }
    if (!confirm(`"${it.task['업무명'] || '새 업무'}" 업무를 매칭된 프로젝트\n[${target.file_name}]\n로 바로 전송할까요?`)) return;

    const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) { alert('🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return; }

    const result = await window._msAutoRegisterToProject(uid, it.task, target.drive_file_id, target.file_name, it.mailRaw, 0, !!it.alarmWorthy);
    if (result.ok) {
        window.TaskInbox.setStatus(uid, '배치됨', { type: '매칭프로젝트 즉시전송', target: target.file_name, at: new Date().toISOString() });
        window.renderTaskInbox();
        const msg = `✅ "${it.task['업무명'] || '새 업무'}" → ${target.file_name} 전송 완료 (${result.label || ''})`;
        if (window.showToast) window.showToast(msg, 'info'); else alert(msg);
    } else {
        alert('❌ 전송 실패: ' + (result.reason || '알 수 없는 오류'));
    }
};

// 💡 [완전자동 백필] 완전자동 기능이 생기기 전부터 쌓여있던 '대기' 항목들은 그때는 자동전송 대상이 아니었으므로
//    새로 분석되는 메일과 달리 저절로 넘어가지 않는다 — 매칭 확정 + 날짜 확정된 기존 대기 항목을 한 번에 훑어서 전송
window.inboxBatchRegisterMatched = async function() {
    const _en = window._currentLang === 'en';
    const targets = window.TaskInbox.load().filter(function(it) {
        return it.status === '대기' && it.matchedProject && it.matchedProject.status === 'matched'
            && it.matchedProject.candidates && it.matchedProject.candidates[0] && it.matchedProject.candidates[0].drive_file_id
            && !String((it.task || {})['시작일'] || '').includes('날짜확인필요')
            && !String((it.task || {})['완료일'] || '').includes('날짜확인필요');
    });
    if (!targets.length) {
        alert(_en
            ? 'Nothing to batch-send.\n(Only "Pending" items with a single confirmed match + confirmed dates qualify — multiple candidates/unmatched/undated items still need manual handling.)'
            : '일괄전송할 항목이 없습니다.\n(매칭이 단일 확정 + 날짜 확정된 "대기" 항목만 대상 — 후보 다수/미매칭/날짜미확정 건은 여전히 직접 처리해야 합니다.)');
        return;
    }
    if (!confirm(_en
        ? `Send ${targets.length} confirmed-match pending item(s) to their matched project(s) now?`
        : `매칭 확정된 대기 항목 ${targets.length}건을 지금 각자 매칭된 프로젝트로 전송할까요?`)) return;

    const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) { alert(_en ? '🔒 Please connect Google Drive first from the top menu.' : '🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return; }

    let okCount = 0; const fails = [];
    for (const it of targets) {
        const target = it.matchedProject.candidates[0];
        try {
            const result = await window._msAutoRegisterToProject(it.uid, it.task, target.drive_file_id, target.file_name, it.mailRaw, 0, !!it.alarmWorthy);
            if (result.ok) {
                window.TaskInbox.setStatus(it.uid, '자동배치됨', { type: '일괄전송', target: target.file_name, at: new Date().toISOString() });
                okCount++;
            } else {
                fails.push(`${it.task['업무명'] || (_en ? '(untitled)' : '(제목없음)')}: ${result.reason || (_en ? 'unknown' : '알수없음')}`);
            }
        } catch (e) {
            fails.push(`${it.task['업무명'] || (_en ? '(untitled)' : '(제목없음)')}: ${e.message}`);
        }
    }
    window.renderTaskInbox();
    let msg = _en ? `✅ ${okCount} sent` : `✅ ${okCount}건 전송 완료`;
    if (fails.length) {
        msg += (_en ? `\n❌ ${fails.length} failed:\n` : `\n❌ ${fails.length}건 실패:\n`) + fails.slice(0, 5).join('\n')
            + (fails.length > 5 ? (_en ? `\n...and ${fails.length - 5} more` : `\n...외 ${fails.length - 5}건`) : '');
        console.warn('[업무 보관함] 일괄전송 실패 목록:', fails);
    }
    alert(msg);
};

window.showMailRawModal = function(r) {
    if (!r) return;
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('inbox-mailraw-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'inbox-mailraw-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9100; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="inbox-mailraw-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:340px; min-height:400px;">
            <div id="inbox-mailraw-drag" style="padding:13px 18px; border-bottom:1px solid #ffe08a; font-weight:bold; font-size:14px; background:#fff8e6; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#7a5210;">
                <span id="inbox-mailraw-title">📧 메일 원문</span>
                <button onclick="document.getElementById('inbox-mailraw-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="inbox-mailraw-meta" style="padding:8px 16px; font-size:11.5px; color:#555; background:#fafafa; border-bottom:1px solid #eee;"></div>
            <!-- 💡 [2026-08-24] wrap="off" + white-space:pre 조합이 줄바꿈을 강제로 막아서, 모달을 아무리 넓게
                 늘려도 긴 줄은 늘 원래 길이 그대로 남아 좌우 스크롤이 필요했다. white-space:pre-wrap으로
                 바꿔서 원문의 줄바꿈(엔터)은 그대로 보존하되, 한 줄이 너무 길면 모달 폭에 맞춰 자동으로
                 접히도록(wrap) 한다 — wrap="off" 속성도 제거(기본값 soft로 줄바꿈 허용). -->
            <textarea id="inbox-mailraw-body" readonly style="flex:1; margin:12px; font-size:12px; font-family:Consolas,'D2Coding','Courier New',monospace,'Malgun Gothic'; white-space:pre-wrap; word-break:break-word; tab-size:4; border:1px solid #ced4da; border-radius:6px; padding:10px; resize:none; overflow:auto; line-height:1.5; background:#f8f9fa; color:#333;"></textarea>
            <div style="padding:10px 16px; text-align:right; border-top:1px solid #eee;">
                <button onclick="document.getElementById('inbox-mailraw-modal').style.display='none'" onmouseover="this.style.background='#e9ecef'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#ccc';" style="padding:7px 18px; background:#f8f9fa; color:#555; border:1px solid #ccc; border-radius:6px; font-size:12px; cursor:pointer; transition:background .15s, border-color .15s;">✖ ${_en ? 'Close' : '닫기'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('inbox-mailraw-box', 'inbox-mailraw-drag');
        window._bindClickToFront('inbox-mailraw-modal');
    }
    const _en2 = window._currentLang === 'en';
    document.getElementById('inbox-mailraw-title').textContent = '📧 ' + (_en2 ? 'Mail Source' : '메일 원문');
    document.getElementById('inbox-mailraw-meta').innerHTML =
        `<b>${_en2 ? 'Subject' : '제목'}</b>: ${escapeHtml(r.subject || '-')}&nbsp;&nbsp;|&nbsp;&nbsp;<b>${_en2 ? 'Sender' : '발신'}</b>: ${escapeHtml(r.sender || '-')}&nbsp;&nbsp;|&nbsp;&nbsp;<b>${_en2 ? 'Date' : '날짜'}</b>: ${escapeHtml(r.date || '-')}`;
    document.getElementById('inbox-mailraw-body').value = r.body2000 || '';
    modal.style.display = 'block';
    window.bringModalToFront('inbox-mailraw-modal');
};

window.showInboxMailRaw = function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it || !it.mailRaw) return;
    window.showMailRawModal(it.mailRaw);
};

// 💡 [추출] 업무 보관함 카드의 "메일 원문 + AI 분석 결과"를 한 텍스트로 정리.
//    클립보드 복사(다른 곳에 붙여넣기용)와, 앱 안에서 바로 AI에게 "왜 이렇게 분석했는지" 물어보는
//    미니 채팅 모달 양쪽에서 공용으로 쓰는 컨텍스트 빌더 — 내용이 어긋나지 않도록 한 곳에서만 만든다.
window._ibBuildAnalysisContext = function(it) {
    const t = it.task || {};
    const _en = window._currentLang === 'en';
    const lines = [];
    lines.push(_en ? '[Analysis result]' : '[분석 결과]');
    lines.push((_en ? 'Task name: ' : '업무명: ') + (t['업무명'] || ''));
    lines.push((_en ? 'Detail: ' : '상세내용: ') + (t['상세내용'] || ''));
    lines.push((_en ? 'Start: ' : '시작일: ') + (t['시작일'] || '?') + (_en ? ' ~ End: ' : ' ~ 완료일: ') + (t['완료일'] || '?'));
    lines.push((_en ? 'Status: ' : '상태: ') + (t['상태'] || ''));
    lines.push((_en ? 'Dev stage(L0): ' : '개발단계(L0): ') + (t['개발단계'] || ''));
    lines.push((_en ? 'Assignee category: ' : '담당구분: ') + (t['담당구분'] || ''));
    lines.push('WBS' + (_en ? ' level: L' : '레벨: L') + (t['wbs레벨'] !== undefined ? t['wbs레벨'] : 4));
    // 💡 [2026-08-28 버그 수정] 여기 담당자(assignee)를 후보 옆에 괄호로 보여주고 있었는데, 실제 매칭
    //    프롬프트(window.getSystemPrompt 뒤에 붙는 "프로젝트 매칭 판단 요청" 섹션)는 model/inch/customer/
    //    keywords만 AI에게 보여주고 assignee는 애초에 넘기지도 않는다 — 그런데도 여기 담당자 이름이
    //    같이 보이니, 이 "왜 매칭됐어?" 미니 채팅 AI가 실제 근거 대신 담당자 이름을 근거로 지어내
    //    답하는 사고(오탐 설명)로 이어졌다. 실제 매칭에 쓰인 근거(keywords)로 바꾸고, 담당자는 매칭과
    //    무관하다는 점을 명시해서 AI가 엉뚱한 근거를 만들어내지 못하게 막는다.
    if (it.matchedProject) {
        const _stLabel = it.matchedProject.status === 'matched'
            ? (_en ? 'Auto-confirmed (AI confidence: high/"상")' : '자동 확정 (AI 신뢰도: 상)')
            : (it.matchedProject.status || '');
        lines.push((_en ? 'Matched project status: ' : '매칭 프로젝트 상태: ') + _stLabel);
        if (it.matchedProject.candidates && it.matchedProject.candidates.length) {
            lines.push(_en
                ? 'Matched candidates (ACTUAL matching evidence — only model name/inch/customer/registered keywords are used for matching. Assignee/owner name is NEVER used for matching, even if shown elsewhere — do not cite it as a reason.):'
                : '매칭 후보(실제 매칭에 쓰인 근거 — 모델명/인치/고객사/등록 키워드만 매칭에 사용됨. 담당자 이름은 다른 곳에 보이더라도 매칭 근거로 절대 쓰이지 않으니 이유로 들지 말 것):');
            it.matchedProject.candidates.forEach(function(c) {
                const kw = (c.keywords && c.keywords.length)
                    ? c.keywords.slice(0, 8).join(', ')
                    : (_en ? '(no keywords registered)' : '(등록된 키워드 없음)');
                lines.push('  - ' + (c.file_name || c.model || c.customer || '')
                    + (c.inch ? ` (${c.inch}${_en ? '"' : '인치'})` : '')
                    + (_en ? ' | registered keywords: ' : ' | 등록 키워드: ') + kw);
            });
        }
    }
    lines.push('');
    if (it.mailRaw) {
        lines.push(_en ? '[Original mail]' : '[메일 원문]');
        lines.push((_en ? 'Subject: ' : '제목: ') + (it.mailRaw.subject || ''));
        lines.push((_en ? 'Sender: ' : '발신: ') + (it.mailRaw.sender || ''));
        lines.push((_en ? 'Date: ' : '날짜: ') + (it.mailRaw.date || ''));
        lines.push('');
        lines.push(it.mailRaw.body2000 || '');
    } else {
        lines.push(_en ? '[No mail source attached to this task]' : '[이 업무에는 메일 원문이 없습니다]');
    }
    return lines.join('\n');
};

// 💡 클릭 한 번으로 ① 클립보드 복사(다른 AI 채팅창에 붙여넣고 싶을 때 대비)와
//    ② 앱 안에서 바로 AI에게 "왜 이렇게 분석됐는지" 물어보는 미니 채팅 모달을 동시에 띄운다.
window.extractInboxForAI = async function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const _en = window._currentLang === 'en';
    const context = window._ibBuildAnalysisContext(it);
    const closingQuestion = _en
        ? 'Does the analysis result above correctly match the mail content? If it is a mismatch, please point out exactly which part is wrong.'
        : '위 분석 결과가 메일 원문 내용과 잘 맞게 추출된 것인지 확인해줘. 오매칭이라면 어느 부분이 왜 잘못됐는지 짚어줘.';

    // ① 클립보드 복사는 되든 안 되든(권한 문제 등) 채팅 모달 진행을 막지 않음 — 실패해도 조용히 넘어감
    try {
        await navigator.clipboard.writeText(
            (_en ? '===== Please review this AI mail-analysis result for mismatches =====' : '===== AI 메일 업무분석 결과 오매칭 검토 요청 =====')
            + '\n\n' + context + '\n\n' + closingQuestion
        );
        if (window.showToast) window.showToast(_en ? '📋 Copied to clipboard as well.' : '📋 클립보드에도 복사해뒀습니다.', 'info');
    } catch (e) { /* 클립보드 실패는 무시 — 아래 채팅 모달이 주 경로 */ }

    // ② 앱 내 AI 채팅 모달을 열고, 오매칭 여부를 묻는 첫 질문을 바로 전송
    if (!(window.getActiveAiKey && window.getActiveAiKey())) {
        alert(_en ? '⚠️ No AI API key configured. Set one in Settings first (mail analysis screen).' : '⚠️ AI API 키가 설정되어 있지 않습니다. 메일 분석 화면 상단 설정에서 먼저 키를 등록해주세요.');
        return;
    }
    window._ibAiChatState = window._ibAiChatState || {};
    window._ibAiChatState[uid] = { context: context, messages: [] };
    window._ibOpenAiChatModal(uid);
    window._ibSendAiChatTurn(uid, closingQuestion);
};

// ─── 업무 보관함 "📋 추출" → AI 미니 채팅 모달 ──────────────────────────────
window._ibOpenAiChatModal = function(uid) {
    const _en = window._currentLang === 'en';
    let modal = document.getElementById('inbox-ai-chat-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'inbox-ai-chat-modal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9110; pointer-events:none; background:none;';
        modal.innerHTML = `
        <div id="inbox-ai-chat-box" onclick="event.stopPropagation()" style="pointer-events:all; position:fixed; background:#fff; border-radius:10px; width:var(--modal-w-md); max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.22); top:50%; left:50%; transform:translate(-50%,-50%); resize:both; overflow:hidden; min-width:360px; min-height:440px;">
            <!-- 💡 [2026-08-30 모달 헤더 정리] 이 모달의 원래 색(#e0f5f7 등)이 하필 스와핑 테마 역할값과
                 똑같아서, 팔레트로 다른 색을 고르면 이 AI 모달만 의도치 않게 같이 바뀌고 있었음 —
                 AI 계열 모달은 전부 하늘색(#e7f3ff)으로 통일하는 게 맞아서 옮기는 김에 그 부작용도 해결됨. -->
            <div id="inbox-ai-chat-drag" style="padding:13px 18px; border-bottom:1px solid #a5c8f0; font-weight:bold; font-size:14px; background:#e7f3ff; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1971c2;">
                <span>🤖 AI 분석 근거 문의</span>
                <button onclick="document.getElementById('inbox-ai-chat-modal').style.display='none'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border); border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:0.15s;" onmouseover="this.style.background='var(--modal-icon-hover-bg)'; this.style.borderColor='#adb5bd';" onmouseout="this.style.background='var(--modal-icon-bg)'; this.style.borderColor='var(--modal-icon-border)';">✕</button>
            </div>
            <div id="inbox-ai-chat-log" style="flex:1; overflow-y:auto; padding:12px 14px; background:#fafafa;"></div>
            <div style="padding:10px; border-top:1px solid #eee; display:flex; gap:6px; align-items:flex-end;">
                <textarea id="inbox-ai-chat-input" placeholder="${_en ? 'Ask a follow-up (Enter to send, Shift+Enter for newline)' : '추가로 물어볼 내용을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)'}" style="flex:1; resize:none; height:40px; font-size:12px; padding:6px 8px; border:1px solid #ced4da; border-radius:6px; font-family:inherit;" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); window._ibSubmitAiChatInput(this); }"></textarea>
                <button onclick="window._ibSubmitAiChatInput(document.getElementById('inbox-ai-chat-input'))" onmouseover="this.style.background='#dcd0f5'; this.style.borderColor='#a98ce0';" onmouseout="this.style.background='#ede9fb'; this.style.borderColor='#c9b8f0';" style="flex-shrink:0; padding:8px 14px; height:40px; background:#ede9fb; color:#6741d9; border:1px solid #c9b8f0; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s, border-color .15s;">${_en ? 'Send' : '전송'}</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        window._makeDraggable('inbox-ai-chat-box', 'inbox-ai-chat-drag');
        window._bindClickToFront('inbox-ai-chat-modal');
    }
    modal.dataset.uid = uid;
    window._ibRenderAiChatLog(uid);
    modal.style.display = 'block';
    window.bringModalToFront('inbox-ai-chat-modal');
};

window._ibRenderAiChatLog = function(uid) {
    const state = window._ibAiChatState && window._ibAiChatState[uid];
    const log = document.getElementById('inbox-ai-chat-log');
    if (!state || !log) return;
    const wasAtBottom = (log.scrollTop + log.clientHeight) >= (log.scrollHeight - 20);
    log.innerHTML = state.messages.map(function(m) {
        const isUser = m.role === 'user';
        return `<div style="display:flex; justify-content:${isUser ? 'flex-end' : 'flex-start'}; margin-bottom:8px;">
            <div style="max-width:85%; padding:8px 12px; border-radius:10px; white-space:pre-wrap; font-size:12.5px; line-height:1.6; ${isUser ? 'background:#ede9fb; border:1px solid #c9b8f0; color:#6741d9;' : 'background:#fff; border:1px solid #e0e0e0; color:#333;'}">${escapeHtml(m.text)}</div>
        </div>`;
    }).join('') + (state.loading ? '<div style="color:#888; font-size:12px; padding:4px 0;">🤖 ' + (window._currentLang === 'en' ? 'Thinking…' : '생각 중...') + '</div>' : '');
    if (wasAtBottom || state.loading) log.scrollTop = log.scrollHeight;
};

window._ibSetAiChatLoading = function(uid, loading) {
    const state = window._ibAiChatState && window._ibAiChatState[uid];
    if (state) state.loading = loading;
    const modal = document.getElementById('inbox-ai-chat-modal');
    const btn = modal ? modal.querySelector('button[onclick*="_ibSubmitAiChatInput"]') : null;
    const input = document.getElementById('inbox-ai-chat-input');
    if (btn) btn.disabled = loading;
    if (input) input.disabled = loading;
    window._ibRenderAiChatLog(uid);
};

window._ibSendAiChatTurn = async function(uid, userText) {
    const state = window._ibAiChatState && window._ibAiChatState[uid];
    if (!state) return;
    const _en = window._currentLang === 'en';
    state.messages.push({ role: 'user', text: userText });
    window._ibRenderAiChatLog(uid);
    window._ibSetAiChatLoading(uid, true);

    const apiKey = window.getActiveAiKey ? window.getActiveAiKey() : null;
    if (!apiKey) {
        state.messages.push({ role: 'ai', text: _en ? '⚠️ No AI API key configured.' : '⚠️ AI API 키가 설정되어 있지 않습니다.' });
        window._ibSetAiChatLoading(uid, false);
        return;
    }
    const transcript = state.messages.map(function(m) {
        return (m.role === 'user' ? (_en ? '[User question] ' : '[사용자 질문] ') : (_en ? '[AI answer] ' : '[AI 답변] ')) + m.text;
    }).join('\n\n');
    const prompt = state.context + '\n\n' + transcript + '\n\n' + (_en
        ? 'Based on the context above, answer the last [User question] in plain natural-language text (no JSON), citing concrete evidence from the mail/analysis result.'
        : '위 맥락을 참고해서 마지막 [사용자 질문]에 대해, 메일 원문/분석 결과의 구체적인 근거를 들어 자연스러운 설명 텍스트로만(JSON 금지) 답변해줘.');

    let result;
    try {
        result = await window.callAiBackend(apiKey, prompt);
    } catch (e) {
        result = { ok: false, error: e };
    }
    if (!result.ok) {
        state.messages.push({ role: 'ai', text: (_en ? '⚠️ AI call failed: ' : '⚠️ AI 호출 실패: ') + (result.error && result.error.message || (_en ? 'Unknown error' : '알 수 없는 오류')) });
    } else {
        const text = result.data.result?.candidates?.[0]?.content?.parts?.[0]?.text || (_en ? '(empty response)' : '(응답 없음)');
        state.messages.push({ role: 'ai', text: text.trim() });
    }
    window._ibSetAiChatLoading(uid, false);
};

window._ibSubmitAiChatInput = function(textarea) {
    const modal = document.getElementById('inbox-ai-chat-modal');
    const uid = modal ? modal.dataset.uid : null;
    if (!uid) return;
    const val = (textarea.value || '').trim();
    if (!val) return;
    textarea.value = '';
    window._ibSendAiChatTurn(uid, val);
};

window.showGanttMailRaw = function(rowIndex) {
    const row = globalData[rowIndex];
    if (!row || !row._mailRaw) return;
    window.showMailRawModal(row._mailRaw);
};

// 💡 [2026-08-24 신규] "📅 AI 분석 날짜로 복원" — 메일 자동등록 시 buildMailTaskRow/mfDirectInsert가
//    같이 남겨둔 _aiOrigStart/_aiOrigPlan(AI가 원래 뽑았던 값)으로 시작일/완료일을 되돌린다.
//    단순히 셀 값만 바꾸면 다음 자동 일정계산 때 다시 틀어질 수 있어(특히 ＊AI마커로 _isParallel이
//    켜진 업무는, 시작일이 강제(forced)되어 있지 않으면 "이전 형제 업무와 같은 시작일"로 다시 흡수됨),
//    값과 함께 _startForced/_planForced도 같이 다시 켜서 재계산에도 안 풀리게 고정한다.
//    Ctrl(⌘) 또는 Shift를 누른 채 클릭하면, 지금 다중 선택(window._selectedRows)돼 있는 행 전부에
//    한 번에 적용한다 — No. 칸 Ctrl/Shift 클릭으로 여러 행을 먼저 선택해두고 이 버튼을 누르면 됨.
//
// 💡 [2026-08-27 신규] _aiOrigStart 백업이 없는 과거 업무(이 백업 기능이 생기기 전에 메일로 자동등록된
//    업무) 대응 — AI 분석 프롬프트가 "상세내용" 첫 줄에 항상 [업무유형][발신자→수신자] YYYY-MM-DD
//    형식으로 시작일을 같이 적어두므로(getMailAnalysisPrompt 참고), 백업이 없으면 거기서 시작일만
//    추출해 복원한다. 완료일은 이 형식에 아예 포함되지 않아(AI가 완료일을 못 뽑은 메일이 대부분이라
//    처음부터 정보 자체가 없었음) 과거 업무는 복원 대상에서 제외 — 새로 생긴 정보가 아니라 원래 없던 값.
window._extractAiOrigStartFromContent = function(row) {
    if (!row) return null;
    const contentStr = colIdx.content !== -1 ? (row[colIdx.content] || '').toString() : '';
    if (!contentStr) return null;
    const firstLine = contentStr.split('\n')[0] || '';
    const m = firstLine.match(/\]\s*(\d{4}-\d{2}-\d{2})\b/);
    return m ? m[1] : null;
};
window._getAiOrigStart = function(row) {
    return (row && row._aiOrigStart) || window._extractAiOrigStartFromContent(row);
};
window.restoreAiTaskDate = function(rowIndex, event) {
    if (event) event.stopPropagation();
    const bulk = !!(event && (event.ctrlKey || event.metaKey || event.shiftKey));
    const targets = (bulk && window._selectedRows && window._selectedRows.size)
        ? Array.from(window._selectedRows)
        : [rowIndex];

    let restoredCount = 0, skippedCount = 0;
    targets.forEach(function(idx) {
        const row = globalData[idx];
        const origStart = window._getAiOrigStart(row);
        if (!row || (!origStart && !row._aiOrigPlan)) { skippedCount++; return; }
        const oldStart = colIdx.start !== -1 ? row[colIdx.start] : '';
        const oldPlan  = colIdx.plan  !== -1 ? row[colIdx.plan]  : '';
        let changed = false;
        if (origStart && colIdx.start !== -1 && row[colIdx.start] !== origStart) {
            row[colIdx.start] = origStart;
            row._startForced = true;
            changed = true;
        }
        if (row._aiOrigPlan && colIdx.plan !== -1 && row[colIdx.plan] !== row._aiOrigPlan) {
            row[colIdx.plan] = row._aiOrigPlan;
            row._planForced = true;
            changed = true;
        }
        if (changed) {
            logChange(idx, colIdx.start, `${oldStart || '-'} ~ ${oldPlan || '-'}`, `${row[colIdx.start] || '-'} ~ ${row[colIdx.plan] || '-'}`, 'AI 분석 날짜로 복원');
        }
        restoredCount++;
    });

    if (!restoredCount) {
        alert('⚠️ 복원할 AI 분석 원본 날짜가 없습니다.\n(백업도 없고, 상세내용에서 날짜를 추출할 수도 없는 업무입니다.)');
        return;
    }

    window.recalculateSchedules();
    if (window.showToast) {
        const msg = (targets.length > 1)
            ? `📅 선택된 ${restoredCount}건의 날짜를 AI 분석 원본으로 복원했습니다.${skippedCount ? ` (백업 없는 ${skippedCount}건 제외)` : ''}`
            : '📅 AI 분석 원본 날짜로 복원했습니다.';
        window.showToast(msg, 'info');
    }
};

// 💡 [2026-08-25 신규] "🛠️ 일정 도구" 메뉴 전용 — 위 restoreAiTaskDate()는 행을 미리 선택해야 하는데,
//    "일단 이 프로젝트 전체를 AI 원본 날짜로 되돌리고 싶다"는 요청이 있어 표 전체(선택 여부 무관)를
//    한 번에 훑어서 백업(_aiOrigStart/_aiOrigPlan)이 있는 업무만 전부 복원하는 버전을 추가한다.
//    핵심 로직(값+forced 플래그 동시 복원)은 동일 — 선택 없이 globalData 전체를 순회할 뿐.
window.restoreAiTaskDateAll = function() {
    const _en = window._currentLang === 'en';
    if (!globalData || globalData.length <= 1) return;
    // 💡 [2026-08-27] _aiOrigStart 백업이 없어도 상세내용에서 시작일을 추출할 수 있으면 대상에 포함
    const eligibleCount = globalData.slice(1).filter(function(row) { return row && (window._getAiOrigStart(row) || row._aiOrigPlan); }).length;
    if (!eligibleCount) {
        alert(_en
            ? '⚠️ No AI-analyzed original dates to restore.\n(No backup, and no date could be extracted from the detail text either.)'
            : '⚠️ 복원할 AI 분석 원본 날짜가 없습니다.\n(백업도 없고, 상세내용에서 날짜를 추출할 수도 없는 업무입니다.)');
        return;
    }
    const confirmMsg = _en
        ? `Restore AI-analyzed original dates for ${eligibleCount} task(s) in this project?\nRestored dates will be locked (forced) again so auto-recalculation doesn't move them.`
        : `이 프로젝트의 업무 ${eligibleCount}건을 AI 분석 원본 날짜로 복원할까요?\n복원된 날짜는 자동 재계산에 밀리지 않도록 다시 고정(잠금)됩니다.`;
    const doRestore = function() {
        let restoredCount = 0;
        for (let idx = 1; idx < globalData.length; idx++) {
            const row = globalData[idx];
            const origStart = window._getAiOrigStart(row);
            if (!row || (!origStart && !row._aiOrigPlan)) continue;
            const oldStart = colIdx.start !== -1 ? row[colIdx.start] : '';
            const oldPlan  = colIdx.plan  !== -1 ? row[colIdx.plan]  : '';
            let changed = false;
            if (origStart && colIdx.start !== -1 && row[colIdx.start] !== origStart) {
                row[colIdx.start] = origStart;
                row._startForced = true;
                changed = true;
            }
            if (row._aiOrigPlan && colIdx.plan !== -1 && row[colIdx.plan] !== row._aiOrigPlan) {
                row[colIdx.plan] = row._aiOrigPlan;
                row._planForced = true;
                changed = true;
            }
            if (changed) {
                logChange(idx, colIdx.start, `${oldStart || '-'} ~ ${oldPlan || '-'}`, `${row[colIdx.start] || '-'} ~ ${row[colIdx.plan] || '-'}`, 'AI 분석 날짜로 복원(전체)');
                restoredCount++;
            }
        }
        window.recalculateSchedules();
        if (window.showToast) {
            window.showToast(_en
                ? `📅 Restored AI-analyzed original dates for ${restoredCount} task(s).`
                : `📅 ${restoredCount}건의 날짜를 AI 분석 원본으로 복원했습니다.`, 'info');
        }
    };
    const _restoreOkLabel = _en ? 'Restore' : '복원';
    if (window.bmConfirmModal) window.bmConfirmModal(confirmMsg, doRestore, _restoreOkLabel, '#0056b3');
    else if (confirm(confirmMsg)) doRestore();
};

window.inboxRecomputePreview = function(uid) {
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const sel = document.getElementById('inbox-l0-' + uid);
    const autoEl = document.getElementById('inbox-auto-' + uid);
    const previewEl = document.getElementById('inbox-preview-' + uid);
    if (!sel || !previewEl) return;
    const info = window.computeL0InsertPos(globalData, colIdx, sel.value, it.task['시작일'], autoEl ? autoEl.checked : true);
    previewEl.textContent = info.previewLabel;
};

window.inboxPlaceToCurrent = function(uid) {
    if (!globalData || globalData.length <= 1) { alert('먼저 프로젝트(엑셀 또는 드라이브)를 로드해주세요.'); return; }
    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const r = it.task;
    if ((r['시작일'] || '').includes('날짜확인필요') || (r['완료일'] || '').includes('날짜확인필요')) {
        alert('⚠️ 시작일/완료일이 미확정(날짜확인필요) 상태입니다.\n메일 분석 화면에서 날짜를 확정한 후 보관함에 담아주세요.');
        return;
    }
    const sel = document.getElementById('inbox-l0-' + uid);
    const autoEl = document.getElementById('inbox-auto-' + uid);
    const chosenL0 = sel ? sel.value : '__END__';
    const useAuto = autoEl ? autoEl.checked : true;

    const built = window.buildMailTaskRow(r, undefined, undefined, it.mailRaw);
    const posInfo = window.computeL0InsertPos(globalData, colIdx, chosenL0, r['시작일'], useAuto);
    const pos = posInfo.pos;
    if (chosenL0 !== '__END__' && colIdx.devStage !== -1) {
        built.row[colIdx.devStage] = chosenL0; // 배치 구간과 개발단계 값 일치시킴
    }
    globalData.splice(pos, 0, built.row);

    logChange(pos, -1, "없음", `보관함에서 배치: ${built.taskName}`);
    window.recalculateSchedules();
    window.TaskInbox.setStatus(uid, '배치됨', {
        type: '현재프로젝트배치',
        target: (window.projectMeta || {}).프로젝트명 || '현재 프로젝트',
        at: new Date().toISOString()
    });
    window.renderTaskInbox();
    alert(`✅ "${built.taskName}" 업무가 배치되었습니다.\n(${posInfo.previewLabel})`);
};

// ─── 💡 [처리됨 정리 모드] 처리됨(대기 아닌 상태) 항목을 어떻게 다룰지 두 모드 ─────────────────
//    - keep(처리됨 보관, 기본값): 지금까지 동작 그대로 — 처리돼도 목록에 남고, 사람이 각 행의 🗑로
//      직접 훑어보고 지운다.
//    - auto(처리됨 자동삭제): TaskInbox.setStatus()로 상태가 "대기"가 아닌 값(배치됨/자동배치됨/전송됨 등)으로
//      바뀌는 그 순간 바로 목록에서 제거 — 직접 지울 필요 없이 처리 즉시 사라짐.
//    💡 [2026-08-29] 이 모드를 켜고 끄던 업무 보관함 헤더의 토글 버튼은 삭제하고, 설정(⚙️ 메일 자동배치
//    설정 → ⏱️ 수집설정)의 체크박스(mac-cleanup-auto)로 이동함 — 값은 그대로 localStorage 사용.
window.getInboxCleanupMode = function() {
    return localStorage.getItem('inbox_cleanup_mode') || 'keep'; // 기본값: 보관(기존 동작 유지)
};

window.mailRightToInbox = function() {
    if (!window._mailAnalyzedResult) { alert('먼저 분석을 실행해주세요.'); return; }
    window.TaskInbox.add(window._mailAnalyzedResult, { source: '업무 추가(메일분석)', mailRaw: window._mailParsedRaw || null });
    // 💡 상단바 배지 카운트 즉시 갱신
    if (window.updateInboxBadge) window.updateInboxBadge();
    // 💡 업무 보관함이 지금 열려있다면(둘 다 열어둔 상태), 그 자리에서 바로 목록도 갱신
    const ov = document.getElementById('task-inbox-overlay');
    if (ov && ov.style.display === 'flex' && window.renderTaskInbox) window.renderTaskInbox();
    alert(`📥 "${window._mailAnalyzedResult['업무명'] || '새 업무'}" 업무를 보관함에 담았습니다.\n상단바 [업무 보관함]에서 프로젝트별로 배치할 수 있습니다.`);
};

// 💡 원본 메일 보기 접기/펼치기 — 헤더는 한 번 클릭, 본문은 더블클릭으로 토글(2026-08-28 변경: 본문을
//    드래그해서 원문을 복사하려 하면 드래그 끝의 클릭이 토글까지 같이 터뜨려 바로 접혀버리던 문제 수정 —
//    본문은 더블클릭에만 반응하도록 바꿔서 한 번의 드래그 선택으로는 더 이상 안 접힘).
window.toggleMailOriginal = function() {
    const b = document.getElementById('mail-original-body');
    const a = document.getElementById('mail-original-arrow');
    if (!b || !a) return;
    const open = b.style.display !== 'none';
    b.style.display = open ? 'none' : 'block';
    a.textContent = open ? '▼' : '▲';
};

// =========================================================
// 📤 [Phase 2] 드라이브 백그라운드 배분 + 배분 원장(distributions)
// =========================================================
window._distCtx = null;

window.closeInboxDist = function() {
    document.getElementById('inbox-dist-overlay').style.display = 'none';
    // 💡 dist-step2를 안전한 곳으로 옮긴 뒤, 열려있던 카드의 인라인 패널을 접음
    const step2 = document.getElementById('dist-step2');
    if (step2) { step2.style.display = 'none'; document.body.appendChild(step2); }
    if (window._distCtx && window._distCtx.uid) {
        const inlineEl = document.getElementById('inbox-dist-inline-' + window._distCtx.uid);
        if (inlineEl) { inlineEl.style.display = 'none'; inlineEl.innerHTML = ''; }
        const curAutoRow = document.getElementById('inbox-cur-auto-row-' + window._distCtx.uid);
        if (curAutoRow) curAutoRow.style.display = 'flex';
    }
    window._distCtx = null;
};

window.inboxOpenDistribute = async function(uid) {
    const tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) { alert('🔒 먼저 상단의 [🔵 드라이브 연동하기]로 구글 로그인을 완료해주세요.'); return; }

    const it = window.TaskInbox.load().find(function(x) { return x.uid === uid; });
    if (!it) return;
    const r = it.task;
    if ((r['시작일'] || '').includes('날짜확인필요') || (r['완료일'] || '').includes('날짜확인필요')) {
        alert('⚠️ 시작일/완료일이 미확정(날짜확인필요) 상태입니다.\n메일 분석 화면에서 날짜를 확정한 후 보관함에 담아주세요.');
        return;
    }

    // 💡 같은 항목에서 다시 누르면 인라인 목록을 접기 (토글)
    const inlineEl = document.getElementById('inbox-dist-inline-' + uid);
    if (!inlineEl) return;
    const alreadyOpen = inlineEl.style.display !== 'none' && inlineEl.dataset.uid === uid;

    // 💡 dist-step2는 여러 항목이 재사용하는 단일 요소라, 다른 항목 슬롯을 비우기 전에
    //    잠시 안전한 곳(body)으로 옮겨둬서 innerHTML='' 처리 때 함께 삭제되지 않게 보호
    const step2 = document.getElementById('dist-step2');
    if (step2) { step2.style.display = 'none'; document.body.appendChild(step2); }

    // 다른 항목에서 열려있던 인라인 목록은 닫기 (+ 그 항목들의 "현재 프로젝트" 자동위치 줄 복원)
    document.querySelectorAll('[id^="inbox-dist-inline-"]').forEach(function(el) {
        el.style.display = 'none'; el.innerHTML = '';
        const otherUid = el.id.replace('inbox-dist-inline-', '');
        const otherRow = document.getElementById('inbox-cur-auto-row-' + otherUid);
        if (otherRow) otherRow.style.display = 'flex';
    });
    if (alreadyOpen) { const r2 = document.getElementById('inbox-cur-auto-row-' + uid); if (r2) r2.style.display = 'flex'; return; }

    window._distCtx = { uid: uid, task: JSON.parse(JSON.stringify(r)), taskName: (r['업무명'] || '새 업무') };
    inlineEl.dataset.uid = uid;
    inlineEl.style.display = 'block';
    // 💡 "다른 프로젝트" 패널이 펼쳐진 동안은 "현재 프로젝트"용 자동위치 줄을 숨겨 중복처럼 안 보이게 함
    const curAutoRow = document.getElementById('inbox-cur-auto-row-' + uid);
    if (curAutoRow) curAutoRow.style.display = 'none';
    inlineEl.innerHTML = '<div style="padding:12px; text-align:center; color:#888; font-size:12px;">📂 프로젝트 목록을 불러오는 중...</div>';

    try {
        const resp = await gapi.client.drive.files.list({
            q: `mimeType='application/json' and trashed=false and '${SHARED_FOLDER_ID}' in parents`,
            fields: 'files(id, name, modifiedTime, appProperties)', orderBy: 'modifiedTime desc',
            corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true
        });
        // 💡 업무 보관함 백업 / AI프롬프트 / 휴일 / 주소록 / 우선순위설정 / 프로젝트인덱스 등 비-프로젝트 파일은 전송 대상에서 제외
        const files = (resp.result.files || []).filter(function(f) {
            return !f.name.startsWith('TaskInbox_')
                && f.name !== PROMPT_DRIVE_FILENAME
                && f.name !== HOLIDAY_DRIVE_FILENAME
                && f.name !== PRIORITY_CONFIG_FILENAME
                && f.name !== PROJECT_INDEX_FILENAME
                && f.name !== MS_FILTER_RULES_DRIVE_FILENAME
                && f.name !== (window.AddressBook ? window.AddressBook.FILE_NAME : 'AddressBook_Shared.json');
        });
        inlineEl.innerHTML = '';
        if (!files.length) {
            inlineEl.innerHTML = '<div style="padding:12px; text-align:center; color:#aaa; font-size:12px;">공용 폴더에 프로젝트 파일이 없습니다.</div>';
            return;
        }

        // 💡 담당자(appProperties.pm) 기준 그룹핑 — "프로젝트 불러오기"와 동일한 방식
        const UNASSIGNED = '미지정';
        const groups = {};
        files.forEach(function(f) {
            const pmName = (f.appProperties && f.appProperties.pm) ? f.appProperties.pm.trim() : '';
            const key = pmName || UNASSIGNED;
            if (!groups[key]) groups[key] = [];
            groups[key].push(f);
        });
        const groupNames = Object.keys(groups).sort(function(a, b) {
            if (a === UNASSIGNED) return 1;
            if (b === UNASSIGNED) return -1;
            return a.localeCompare(b, 'ko');
        });

        groupNames.forEach(function(pmName) {
            const groupFiles = groups[pmName];
            const groupWrap = document.createElement('div');
            groupWrap.style.cssText = 'border:1px solid #eee; border-radius:6px; overflow:hidden; margin-bottom:6px;';

            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'padding:6px 10px; background:#f8f9fa; cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:bold; font-size:11.5px; color:#555; user-select:none; transition:background .15s;';
            headerRow.onmouseover = function() { headerRow.style.background = '#eef0f2'; };
            headerRow.onmouseout  = function() { headerRow.style.background = '#f8f9fa'; };
            const arrow = document.createElement('span');
            arrow.textContent = '▾';
            arrow.style.cssText = 'font-size:10px;';
            const label = document.createElement('span');
            label.textContent = pmName + ' (' + groupFiles.length + ')';
            headerRow.appendChild(arrow); headerRow.appendChild(label);

            const body = document.createElement('div');
            body.style.cssText = 'display:flex; flex-direction:column; gap:5px; padding:6px;';

            groupFiles.forEach(function(f) {
                const d = new Date(f.modifiedTime);
                const div = document.createElement('div');
                div.className = 'dist-file-item';
                // 💡 [2026-08-24 UX 개선] 클릭해서 고른 항목이 "지금 마우스가 올려진 것"과 구분이 안 돼서
                //    선택됐는지 헷갈린다는 피드백 — hover는 옅은 파란색, 선택은 진한 파란색 배경+굵은 테두리
                //    +체크마크로 시각적으로 확실히 다르게 하고, 마우스를 치워도(mouseout) 선택 상태는 유지한다.
                div.style.cssText = 'padding:8px 10px; border:2px solid #ced4da; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#fff; font-size:12px; transition:0.15s;';
                div.innerHTML = '<span style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'
                    + '<span class="dist-file-check" style="display:none; color:#1971c2;">✅ </span>📄 ' + escapeHtml(f.name) + '</span>'
                    + '<span style="color:#999; white-space:nowrap; margin-left:8px; font-size:11px;">' + d.toLocaleString() + '</span>';
                const checkEl = div.querySelector('.dist-file-check');
                const applyStyle = function() {
                    if (div.classList.contains('dist-file-selected')) {
                        div.style.background = '#d0ebff'; div.style.borderColor = '#1971c2';
                        checkEl.style.display = 'inline';
                    } else {
                        div.style.background = '#fff'; div.style.borderColor = '#ced4da';
                        checkEl.style.display = 'none';
                    }
                };
                div.onmouseover = function() { if (!div.classList.contains('dist-file-selected')) { this.style.background = '#eef6ff'; this.style.borderColor = '#74b3f0'; } };
                div.onmouseout  = applyStyle;
                div.addEventListener('click', function() {
                    // 같은 목록(모든 그룹 포함) 안의 이전 선택은 해제 — 한 번에 하나만 선택된 상태로 보이게
                    inlineEl.querySelectorAll('.dist-file-item.dist-file-selected').forEach(function(prev) {
                        prev.classList.remove('dist-file-selected');
                        const prevCheck = prev.querySelector('.dist-file-check');
                        if (prevCheck) prevCheck.style.display = 'none';
                        prev.style.background = '#fff'; prev.style.borderColor = '#ced4da';
                    });
                    div.classList.add('dist-file-selected');
                    applyStyle();
                    // 💡 [2026-08-24 UX 개선] "대상 선택 + 전송 실행" 패널(dist-step2)이 항상 목록 맨 끝에
                    //    붙어 있어서, 그룹이 여러 개거나 목록이 길면 방금 고른 항목과 실제 조작할 패널이
                    //    화면상 멀리 떨어져 "선택은 됐는데 뭘 눌러야 하는지" 헷갈렸다. 클릭한 항목 바로
                    //    아래로 옮겨서, 선택 즉시 그 자리에서 이어서 조작할 수 있게 한다.
                    const step2El = document.getElementById('dist-step2');
                    if (step2El) { div.insertAdjacentElement('afterend', step2El); step2El.style.display = 'none'; }
                    window.inboxDistPickFile(f.id, f.name);
                });
                body.appendChild(div);
            });

            headerRow.onclick = function() {
                const collapsed = body.style.display === 'none';
                body.style.display = collapsed ? 'flex' : 'none';
                arrow.textContent = collapsed ? '▾' : '▸';
            };

            groupWrap.appendChild(headerRow);
            groupWrap.appendChild(body);
            inlineEl.appendChild(groupWrap);
        });

        // 💡 상세 배치 단계(개발단계 선택 + 전송실행)를 팝업이 아니라 이 카드 안으로 이동
        inlineEl.appendChild(document.getElementById('dist-step2'));
    } catch (err) {
        inlineEl.innerHTML = '<div style="padding:12px; text-align:center; color:#e03131; font-size:12px;">❌ 목록 호출 실패: 드라이브 연동 상태 또는 권한을 확인해주세요.</div>';
    }
};

// 대상 파일 선택 → 내용/시점 확보 → L0 선택 단계 표시
window.inboxDistPickFile = async function(fileId, fileName) {
    const ctx = window._distCtx;
    if (!ctx) return;
    document.getElementById('dist-step2').style.display = 'none';
    try {
        // 💡 [성능] metadata/content 두 호출을 순차 await 하면 alt=media 지연이 그대로 두 번 더해짐 —
        //    서로 독립적인 호출이므로 병렬로 보내 대기 시간을 절반 가까이 줄임
        const [metaResp, contentResp] = await Promise.all([
            gapi.client.drive.files.get({ fileId: fileId, fields: 'modifiedTime', supportsAllDrives: true }),
            gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true })
        ]);
        // 💡 [버그 수정] alt=media는 수 초~수십 초 걸릴 수 있는데, 그동안 사용자가 패널을 닫거나
        //    (closeInboxDist → window._distCtx = null) 다른 업무의 "다른 프로젝트 선택"을 열면
        //    (inboxOpenDistribute → window._distCtx = 새 객체) window._distCtx가 이 요청을 시작할
        //    때와 달라진다. 그 상태로 그대로 진행하면 inboxDistFillL0Select()가 null이거나
        //    엉뚱한 업무의 window._distCtx를 읽어 "Cannot read properties of null (reading 'saveData')"
        //    로 크래시하거나, 최악의 경우 다른 업무의 ctx에 이 파일 데이터를 덮어씀 — 응답이 온 시점에
        //    여전히 같은 요청인지(참조가 동일한지) 확인해서 아니면 조용히 무시
        if (window._distCtx !== ctx) return;
        const saveData = contentResp.result;
        if (!saveData || !saveData.globalData || !saveData.colIdx) {
            alert('⚠️ 대상 파일에 간트 데이터가 없거나 구조를 해석할 수 없습니다.');
            return;
        }
        ctx.fileId = fileId;
        ctx.fileName = fileName;
        ctx.fetchedModifiedTime = metaResp.result.modifiedTime;
        ctx.saveData = saveData;
        ctx.rows = saveData.globalData.map(function(obj) {
            let row = obj.data;
            for (let k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        // 💡 저장된 스냅샷의 _calcStartTs를 그대로 믿지 않고, 방금 불러온 데이터로 직접 재계산
        window.computeCalcDatesForRows(ctx.rows.slice(1), ctx.saveData.colIdx);
        window.inboxDistFillL0Select(undefined);
        document.getElementById('dist-target-name').textContent = fileName;
        document.getElementById('dist-step2').style.display = 'block';
    } catch (err) {
        if (window._distCtx !== ctx) return; // 이미 패널을 닫고 나간 뒤라면 에러 알림도 띄우지 않음
        alert('대상 프로젝트 로드 실패: ' + err.message);
    }
};

// 대상 프로젝트의 L0 목록으로 드롭다운 구성 (preferred 값 우선 선택)
window.inboxDistFillL0Select = function(preferred) {
    const ctx = window._distCtx;
    const tCol = ctx.saveData.colIdx;
    const l0s = window.buildL0SectionInfo(ctx.rows, tCol);

    let want = preferred;
    if (want === undefined) want = window.pickL0SectionByDate(l0s, ctx.task['시작일'] || '');

    const sel = document.getElementById('dist-l0-select');
    sel.innerHTML = '<option value="__END__">(맨 끝에 추가)</option>' + l0s.map(function(sec) {
        const range = window.formatYM(sec.startTs) + '~' + window.formatYM(sec.endTs);
        return '<option value="' + escapeHtml(sec.name) + '"' + (sec.name === want ? ' selected' : '') + '>' + escapeHtml(sec.name) + ' 구간 끝 (' + range + ')</option>';
    }).join('');
    sel.onchange = window.distRecomputePreview;
    window.distRecomputePreview();
};

window.distRecomputePreview = function() {
    const ctx = window._distCtx;
    const sel = document.getElementById('dist-l0-select');
    const autoEl = document.getElementById('dist-auto-position');
    const previewEl = document.getElementById('dist-position-preview');
    if (!ctx || !ctx.saveData || !sel || !previewEl) return;
    const info = window.computeL0InsertPos(ctx.rows, ctx.saveData.colIdx, sel.value, ctx.task['시작일'], autoEl ? autoEl.checked : true);
    previewEl.textContent = info.previewLabel;
};

// 충돌 감지 시 최신본 재확보
window.inboxDistReload = async function(prevL0) {
    const ctx = window._distCtx;
    if (!ctx) return false;
    try {
        // 💡 [성능] inboxDistPickFile과 동일하게 병렬 호출
        const [metaResp, contentResp] = await Promise.all([
            gapi.client.drive.files.get({ fileId: ctx.fileId, fields: 'modifiedTime', supportsAllDrives: true }),
            gapi.client.drive.files.get({ fileId: ctx.fileId, alt: 'media', supportsAllDrives: true })
        ]);
        // 💡 대기 중 패널이 닫히거나 다른 업무로 전환됐으면 중단 (동일한 크래시 방지 목적)
        if (window._distCtx !== ctx) return false;
        const saveData = contentResp.result;
        if (!saveData || !saveData.globalData || !saveData.colIdx) { alert('⚠️ 최신본 구조를 해석할 수 없습니다.'); return false; }
        ctx.saveData = saveData;
        ctx.rows = saveData.globalData.map(function(obj) {
            let row = obj.data;
            for (let k in obj) { if (k !== 'data') row[k] = obj[k]; }
            return row;
        });
        // 💡 여기서도 최신본 기준으로 재계산
        window.computeCalcDatesForRows(ctx.rows.slice(1), ctx.saveData.colIdx);
        ctx.fetchedModifiedTime = metaResp.result.modifiedTime;
        window.inboxDistFillL0Select(prevL0);
        const sel = document.getElementById('dist-l0-select');
        if (prevL0 !== '__END__' && sel.value !== prevL0) {
            alert('⚠️ 최신본에서 선택했던 개발단계 구간이 사라졌습니다.\n구간을 다시 선택한 후 전송해주세요.');
            return false;
        }
        return true;
    } catch (err) {
        if (window._distCtx !== ctx) return false;
        alert('최신본 확보 실패: ' + err.message); return false;
    }
};

// 전송 실행 (attempt: 충돌 자동 재시도 횟수)
window.inboxDistExecute = async function(attempt) {
    const ctx = window._distCtx;
    if (!ctx || !ctx.fileId) return;
    const btn = document.getElementById('dist-exec-btn');
    btn.disabled = true; btn.textContent = '⏳ 전송 중...';
    try {
        const chosenL0 = document.getElementById('dist-l0-select').value;

        // (a) 충돌 검사: 전송 직전 modifiedTime 재확인
        const mResp = await gapi.client.drive.files.get({ fileId: ctx.fileId, fields: 'modifiedTime', supportsAllDrives: true });
        if (mResp.result.modifiedTime !== ctx.fetchedModifiedTime) {
            if ((attempt || 0) >= 2) {
                alert('⚠️ 대상 파일이 계속 갱신되고 있어 전송을 중단했습니다.\n잠시 후 다시 시도해주세요.');
                return;
            }
            alert('⚠️ 대상 파일이 방금 다른 사용자에 의해 갱신되었습니다.\n최신본을 받아 자동 재시도합니다.');
            const ok = await window.inboxDistReload(chosenL0);
            if (!ok) return;
            return await window.inboxDistExecute((attempt || 0) + 1);
        }

        // 행 생성 — 대상 프로젝트의 컬럼 구조(colIdx) 기준
        const tCol = ctx.saveData.colIdx;
        const built = window.buildMailTaskRow(ctx.task, ctx.rows, tCol);
        built.row._알림 = true; // ✅ 배분 업무는 대상 프로젝트에서 D-7/3/1 알림 대상으로 자동 설정

        // L0~4 구간 내 시작일 기준 최적 위치 계산 (자동 미충족 시 구간 끝 fallback)
        const autoEl = document.getElementById('dist-auto-position');
        const posInfo = window.computeL0InsertPos(ctx.rows, tCol, chosenL0, ctx.task['시작일'], autoEl ? autoEl.checked : true);
        const pos = posInfo.pos;
        if (chosenL0 !== '__END__' && tCol.devStage !== -1) {
            built.row[tCol.devStage] = chosenL0;
        }
        ctx.rows.splice(pos, 0, built.row);

        // 배분 원장 + 대상 프로젝트 수정이력 기록
        const nowIso = new Date().toISOString();
        const userName = window.currentUserName || '비로그인 (로컬)';
        ctx.saveData.distributions = ctx.saveData.distributions || [];
        const distUid = 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        ctx.saveData.distributions.push({
            uid: distUid, inboxUid: ctx.uid,
            task: JSON.parse(JSON.stringify(ctx.task)),
            taskName: built.taskName, targetL0: chosenL0,
            insertedAt: nowIso, by: userName, source: '업무보관함', processed: false
        });
        ctx.saveData.changeLogs = ctx.saveData.changeLogs || [];
        ctx.saveData.changeLogs.push({
            time: new Date().toLocaleString('ko-KR'), userName: userName,
            rowName: pos, colName: '행 조작', oldVal: '없음',
            newVal: `보관함에서 배분 추가: ${built.taskName}`
        });

        // 직렬화 (saveToGoogleDrive와 동일 규격)
        ctx.saveData.globalData = ctx.rows.map(function(row) {
            let o = { data: Array.from(row) };
            for (let k in row) { if (k.startsWith('_')) o[k] = row[k]; }
            return o;
        });

        // PATCH 업로드
        const tokenObj = gapi.client.getToken();
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) { alert('🔒 구글 인증 토큰이 유실되었습니다. 상단 연동 버튼으로 재로그인 후 시도해주세요.'); return; }
        const boundary = 'inbox_dist_boundary';
        const metadata = { name: ctx.fileName, mimeType: 'application/json' };
        const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                   + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(ctx.saveData)
                   + "\r\n--" + boundary + "--";
        const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + ctx.fileId + '?uploadType=multipart&supportsAllDrives=true', {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
            body: body
        });
        const file = await resp.json();
        if (resp.ok && file && file.id) {
            window.TaskInbox.setStatus(ctx.uid, '전송됨', { type: '드라이브전송', target: ctx.fileName, distUid: distUid, at: nowIso });
            alert(`🎉 "${built.taskName}" 업무가 [${ctx.fileName}] 프로젝트로 전송되었습니다!\n(${posInfo.previewLabel})\n(📌 알림 자동 설정 · 수정이력/배분원장 기록 완료)`);
            window.closeInboxDist();
            window.renderTaskInbox();
        } else {
            const status = resp.status || (file && file.error ? file.error.code : 0);
            let msg = '업로드 중 오류가 발생했습니다.';
            if (status === 401) msg = '🔒 구글 인증 세션이 만료되었습니다. 상단 연동 버튼으로 재로그인 후 시도해주세요.';
            else if (status === 403) msg = '🚫 공유 폴더의 편집자 권한이 없습니다.';
            else if (file && file.error) msg = `구글 드라이브 에러 (${status}): ${file.error.message}`;
            alert('❌ 전송 실패\n\n' + msg);
        }
    } catch (err) {
        alert('전송 시스템 에러: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = '🚀 전송 실행';
    }
};

// =========================================================
// 📥 [Phase 2.5] 저장 시 배분 원장 자동 병합
//    낡은 사본으로 저장해도 "내가 연 이후 배분된 업무"가 유실되지 않도록 방어
// =========================================================
// 💡 [성능 수정] 이 함수가 저장할 때마다 프로젝트 파일 전체를 통째로 다시 다운로드하고 있었다
//    (실측: 같은 파일을 "프로젝트 열기"로 받을 때 1초 남짓 걸리던 게, 저장 직전엔 이 중복 다운로드
//    까지 겹쳐서 "프로젝트 열기" 버튼의 "전환 전 저장" 단계가 3~4초, 응답이 느릴 땐 47초까지도
//    걸렸다). 배분 원장(distributions)에 새 항목이 왔는지 확인하려고 매번 파일 전체를 받을 필요는
//    없다 — 가벼운 modifiedTime만 먼저 확인해서, 마지막으로 내가 저장(또는 확인)한 이후 파일이 실제로
//    바뀐 적이 없으면(=다른 사람이 그 사이 배분한 적이 없으면) 무거운 전체 다운로드를 건너뛴다.
//    (이 코드베이스의 다른 곳 — 업무 보관함 배분 충돌 감지 등 — 에서 이미 쓰던 modifiedTime 선확인
//    패턴과 동일)
window._distMergeModifiedTime = window._distMergeModifiedTime || {};
// 💡 [2026-08-25] 반환값에 remoteChanged/hadBaseline을 추가 — "배분 이력 병합" 원래 목적과 별개로,
//    이 함수가 이미 하고 있던 "마지막으로 내가 확인한 이후 원격 파일이 바뀌었는가" 체크가 그대로
//    "다른 사용자가 먼저 저장했는지" 판단에도 쓸 수 있는 정보라, _saveToGoogleDriveRaw의 저장 충돌
//    경고에 재사용한다(네트워크 왕복을 늘리지 않고 기존 체크에 얹음).
//    - hadBaseline: 비교할 이전 값 자체가 없었으면(신규 세션 등) false → 이땐 "충돌"이라 단정할 근거가
//      약하므로 경고를 띄우지 않는다(오탐 방지).
//    - remoteChanged: hadBaseline이 true인데 그 값과 지금 원격 modifiedTime이 다르면 true.
window.mergeRemoteDistributions = async function(fileId) {
    try {
        const _tM0 = performance.now();
        const metaResp = await gapi.client.drive.files.get({ fileId: fileId, fields: 'modifiedTime', supportsAllDrives: true });
        const remoteModifiedTime = metaResp.result.modifiedTime;
        const _hadBaseline = window._distMergeModifiedTime[fileId] !== undefined;
        const _remoteChanged = _hadBaseline && window._distMergeModifiedTime[fileId] !== remoteModifiedTime;
        if (window._distMergeModifiedTime[fileId] === remoteModifiedTime) {
            console.info(`[저장 계측] 배분 병합 확인: ${Math.round(performance.now() - _tM0)}ms (변경 없음 → 전체 다운로드 생략)`);
            return { remoteChanged: false, hadBaseline: _hadBaseline }; // 마지막 확인 이후 파일이 안 바뀜 → 전체 다운로드 생략
        }
        window._distMergeModifiedTime[fileId] = remoteModifiedTime;

        const resp = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true });
        console.info(`[저장 계측] 배분 병합 확인: ${Math.round(performance.now() - _tM0)}ms (파일이 바뀌어 전체 다운로드 수행)`);
        const remote = resp.result || {};
        const remoteDists = remote.distributions || [];
        if (!remoteDists.length) return;

        window.projectDistributions = window.projectDistributions || [];
        const knownUids = {};
        window.projectDistributions.forEach(function(d) { if (d && d.uid) knownUids[d.uid] = true; });

        let mergedNames = [];
        remoteDists.forEach(function(d) {
            if (!d || !d.uid || knownUids[d.uid]) return; // 이미 아는 배분 → 로컬 상태 존중 (삭제했다면 삭제 유지)

            // 원장 엔트리 자체는 무조건 보존 (내 저장으로 원격 이력이 지워지는 것 방지)
            window.projectDistributions.push(d);
            knownUids[d.uid] = true;
            if (d.processed === true || !d.task) return;

            // 내 데이터에 없는 배분 업무 행 재삽입 (L0 일치 구간 끝)
            const built = window.buildMailTaskRow(d.task);
            built.row._알림 = true;
            let pos = globalData.length;
            if (d.targetL0 && d.targetL0 !== '__END__' && colIdx.devStage !== -1) {
                let last = -1;
                for (let i = 1; i < globalData.length; i++) {
                    const row = globalData[i]; if (!row) continue;
                    if ((row[colIdx.devStage] || '').toString().trim() === d.targetL0) last = i;
                }
                if (last !== -1) pos = last + 1;
                built.row[colIdx.devStage] = d.targetL0;
            }
            globalData.splice(pos, 0, built.row);

            window.changeLogs.push({
                time: new Date().toLocaleString('ko-KR'),
                userName: '자동 병합',
                rowName: pos, colName: '행 조작', oldVal: '없음',
                newVal: `배분 업무 자동 병합: ${built.taskName} (배분자: ${d.by || '알수없음'})`
            });
            mergedNames.push(built.taskName);
        });

        // 원장 크기 제한: 최근 100건만 유지 (파일 비대화 방지)
        if (window.projectDistributions.length > 100) {
            window.projectDistributions = window.projectDistributions.slice(-100);
        }

        if (mergedNames.length) {
            window.recalculateSchedules();
            alert(`📥 작업하는 동안 다른 사용자가 배분한 업무 ${mergedNames.length}건이 자동 병합되어 함께 저장됩니다.\n\n· ${mergedNames.join('\n· ')}`);
        }
        return { remoteChanged: _remoteChanged, hadBaseline: _hadBaseline };
    } catch (err) {
        // 병합 확인 실패해도 저장 자체는 막지 않음 (기존 저장 동작 보존) — 충돌 여부도 알 수 없으니 경고하지 않음
        console.warn('배분 원장 병합 확인 실패(저장은 계속 진행):', err);
        return { remoteChanged: false, hadBaseline: false, error: err };
    }
};

// ═══════════════════════════════════════════════════════════
// 🔀 [2026-08-27 신규] 필드/셀 단위 3-way 병합 — "다른 사용자 저장 시 통째로 덮어쓰기/취소" 둘 중
//    하나뿐이던 것을, base(내가 마지막으로 저장을 확인한 시점) / mine(지금 내 화면) / theirs(방금
//    확인한 드라이브 최신본) 세 가지를 놓고 Git처럼 비교해서, 서로 다른 셀을 고친 거면 자동으로
//    합치고 "진짜로 같은 셀"을 양쪽이 다르게 고쳤을 때만 충돌로 집계한다.
//    위 mergeRemoteDistributions()가 배분원장 하나에만 하던 걸 표 전체로 넓힌 버전.
//
//    전제: 각 행을 위치(배열 인덱스)가 아니라 고유 _rowUid로 식별해야 행 추가/삭제/이동이 섞여도
//    "같은 행"을 정확히 매칭할 수 있다. _rowUid는 다른 "_"로 시작하는 필드처럼 저장/불러오기 때
//    자동으로 함께 저장·복원된다(serializedGlobalData 로직 재사용, 별도 배선 불필요).
// ═══════════════════════════════════════════════════════════
window._newRowUid = function() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

// 옛 프로젝트(이 기능 이전에 저장된 파일)나 이 함수를 거치지 않고 만들어진 행 등, uid가 없는 행에
// 새로 부여한다. 저장 직전(_saveToGoogleDriveRaw)에 항상 호출해서 "저장되는 모든 행은 uid를 가진다"를 보장.
window._ensureRowUids = function() {
    if (!globalData) return;
    for (let i = 1; i < globalData.length; i++) {
        const row = globalData[i];
        if (row && !row._rowUid) row._rowUid = window._newRowUid();
    }
};

// 저장된(=드라이브 JSON 원형) globalData 배열을 화면에서 쓰는 행 배열 형태로 복원. executeLoadFile 등
// 기존 로드 코드의 "obj.data + '_'로 시작하는 키 복사" 패턴과 동일 — 병합에서 "theirs"를 읽을 때 재사용.
window._deserializeGlobalDataForMerge = function(savedArr) {
    if (!Array.isArray(savedArr)) return null;
    return savedArr.map(function(obj) {
        if (!obj || !obj.data) return null;
        const row = obj.data.slice();
        for (let key in obj) { if (key !== 'data') row[key] = obj[key]; }
        return row;
    });
};

// 병합용 경량 스냅샷: uid → 셀값 배열. 저장 성공 직후("이제부터 이게 서버와 일치하는 상태") 캡처해두고,
// 다음 저장 때 3-way 병합의 base로 쓴다. 파일(fileId)별로 보관 — 멀티시트로 여러 프로젝트를 동시에
// 열어놔도 서로 섞이지 않음.
window._mergeBaselines = window._mergeBaselines || {};
window._captureMergeBaseline = function(fileId) {
    if (!fileId || !globalData) return;
    const map = {};
    for (let i = 1; i < globalData.length; i++) {
        const row = globalData[i];
        if (row && row._rowUid) map[row._rowUid] = Array.from(row);
    }
    window._mergeBaselines[fileId] = map;
};

// base(baselineMap) / mine(globalData 현재 상태) / theirs(방금 받은 드라이브 최신 globalData)를 놓고
// 3-way 병합. 헤더(0행=컬럼 구조)가 다르면 셀 비교 자체가 위험하므로 포기(null 반환 → 호출부가 기존
// 방식인 확인모달로 폴백).
window._threeWayMergeGlobalData = function(baselineMap, mineGd, theirsGd) {
    const result = { mergedGd: null, addedByThem: [], deletedByThemHonored: [], deletedByMeHonored: [],
        editVsDeleteConflicts: [], cellConflicts: [] };
    if (!theirsGd || !theirsGd[0] || !mineGd || !mineGd[0]) return result;
    if (JSON.stringify(theirsGd[0]) !== JSON.stringify(Array.from(mineGd[0]))) return result;

    baselineMap = baselineMap || {};
    const mineMap = {};
    for (let i = 1; i < mineGd.length; i++) { const r = mineGd[i]; if (r && r._rowUid) mineMap[r._rowUid] = r; }
    const theirsMap = {}; const theirsOrder = [];
    for (let i = 1; i < theirsGd.length; i++) {
        const r = theirsGd[i]; const uid = r && r._rowUid;
        if (uid) { theirsMap[uid] = r; theirsOrder.push(uid); }
    }

    const mergedRows = [];
    const findMergedPos = function(uid) { return mergedRows.findIndex(function(r) { return r && r._rowUid === uid; }); };
    // theirs 순서상 이웃(앞→뒤 순으로 탐색)이 이미 병합 결과에 있으면 그 옆에 끼워 넣고, 못 찾으면 맨 뒤에 붙인다.
    const insertNearTheirsPosition = function(uid, rowToInsert) {
        const idx = theirsOrder.indexOf(uid);
        for (let k = idx - 1; k >= 0; k--) {
            const pos = findMergedPos(theirsOrder[k]);
            if (pos !== -1) { mergedRows.splice(pos + 1, 0, rowToInsert); return; }
        }
        for (let k = idx + 1; k < theirsOrder.length; k++) {
            const pos = findMergedPos(theirsOrder[k]);
            if (pos !== -1) { mergedRows.splice(pos, 0, rowToInsert); return; }
        }
        mergedRows.push(rowToInsert);
    };

    // 1) 내 현재 순서를 뼈대로 진행 — 각 행을 base/theirs와 대조
    for (let i = 1; i < mineGd.length; i++) {
        const mineRow = mineGd[i];
        const uid = mineRow && mineRow._rowUid;
        if (!uid) { mergedRows.push(mineRow); continue; } // uid 없는 비정상 행은 그대로 통과(발생 안 하는 게 정상)

        const baseRow = baselineMap[uid];
        const theirsRow = theirsMap[uid];

        if (!theirsRow) {
            if (baseRow) {
                // base엔 있었는데 theirs엔 없음 = 그들이 삭제함
                const mineChanged = JSON.stringify(baseRow) !== JSON.stringify(Array.from(mineRow));
                if (mineChanged) {
                    // 삭제 vs 편집 충돌 → 내용을 지키는 쪽 우선(조용한 유실 방지)
                    result.editVsDeleteConflicts.push({ uid, side: 'theirsDeleted' });
                    mergedRows.push(mineRow);
                } else {
                    result.deletedByThemHonored.push(uid); // 나도 안 건드렸으면 그들의 삭제를 존중
                }
            } else {
                mergedRows.push(mineRow); // base에도 theirs에도 없음 = 내가 새로 만든 행
            }
            continue;
        }
        if (!baseRow) { mergedRows.push(mineRow); continue; } // base엔 없는데 양쪽 다 있음(사실상 불가능) → mine 신뢰

        // 셀 단위 3-way 비교
        const baseCells = baseRow, mineCells = Array.from(mineRow), theirsCells = Array.from(theirsRow);
        for (let c = 0; c < mineCells.length; c++) {
            const b = baseCells[c], m = mineCells[c], t = theirsCells[c];
            if (m === t) continue; // 이미 같으면 볼 것 없음
            const mineChanged = m !== b, theirsChanged = t !== b;
            if (theirsChanged && !mineChanged) {
                mineRow[c] = t; // 나는 안 건드림, 그들만 바꿈 → 그들 값 채택
            } else if (mineChanged && theirsChanged) {
                result.cellConflicts.push({ uid, col: c, base: b, mine: m, theirs: t }); // 둘 다 다르게 바꿈 → 진짜 충돌(내 값 유지)
            }
            // mineChanged && !theirsChanged → 이미 mineRow[c]가 내 값이므로 그대로 둠
        }
        mergedRows.push(mineRow);
    }

    // 2) theirs에만 새로 생긴 행(base에도 mine에도 없음) → union add, theirs 순서상 위치 근처에 삽입
    theirsOrder.forEach(function(uid) {
        if (mineMap[uid] || baselineMap[uid]) return;
        result.addedByThem.push(uid);
        insertNearTheirsPosition(uid, theirsMap[uid]);
    });

    // 3) base엔 있었는데 mine엔 없고(내가 지움) theirs엔 있는 행
    Object.keys(baselineMap).forEach(function(uid) {
        if (mineMap[uid]) return; // 내가 안 지움(이미 위에서 처리됨)
        const theirsRow = theirsMap[uid];
        if (!theirsRow) return; // 그들도 지움 → 삭제 합의, 처리 끝
        const theirsChanged = JSON.stringify(baselineMap[uid]) !== JSON.stringify(Array.from(theirsRow));
        if (theirsChanged) {
            result.editVsDeleteConflicts.push({ uid, side: 'mineDeleted' });
            insertNearTheirsPosition(uid, theirsRow); // 내가 지웠지만 그들이 편집 → 내용 보존을 위해 되살림
        } else {
            result.deletedByMeHonored.push(uid); // 그들도 안 건드렸으면 내 삭제를 존중
        }
    });

    result.mergedGd = [mineGd[0]].concat(mergedRows);
    return result;
};

// 저장 중 충돌이 감지됐을 때 위 3-way 병합을 실제로 시도. 성공하면 globalData를 병합 결과로 교체하고
// { applied:true, summaryMsg } 반환 — 실패/불가능(baseline 없음·헤더 구조 다름 등)하면 { applied:false }를
// 반환해서 호출부가 기존의 "그래도 저장/취소" 확인모달로 안전하게 폴백하도록 한다.
window._tryThreeWayMergeOnConflict = async function(fileId, token) {
    try {
        const baselineMap = window._mergeBaselines[fileId];
        if (!baselineMap) return { applied: false }; // 이번 세션에서 아직 한 번도 저장 성공한 적 없음 → 비교 기준 없음

        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) return { applied: false };
        const remote = await resp.json();
        const theirsGd = window._deserializeGlobalDataForMerge(remote.globalData);
        if (!theirsGd) return { applied: false };

        window._ensureRowUids();
        const merge = window._threeWayMergeGlobalData(baselineMap, globalData, theirsGd);
        if (!merge.mergedGd) return { applied: false }; // 헤더 구조가 달라 병합 불가

        globalData = merge.mergedGd;

        merge.cellConflicts.forEach(function(cf) {
            const rowIdx = globalData.findIndex(function(r) { return r && r._rowUid === cf.uid; });
            logChange(rowIdx, cf.col, cf.theirs, cf.mine, '⚠️ 동시편집 충돌 — 내 값 유지 (상대방 값: ' + (cf.theirs === '' || cf.theirs == null ? '(빈값)' : cf.theirs) + ')');
        });
        merge.editVsDeleteConflicts.forEach(function(ec) {
            const rowIdx = globalData.findIndex(function(r) { return r && r._rowUid === ec.uid; });
            logChange(rowIdx, -1, '-', '-', ec.side === 'theirsDeleted'
                ? '⚠️ 상대방이 이 업무를 삭제했지만, 내가 수정한 내용이 있어 삭제하지 않고 보존함'
                : '⚠️ 내가 이 업무를 삭제했지만, 상대방이 수정한 내용이 있어 삭제를 취소하고 복원함');
        });

        window.recalculateSchedules();

        const parts = [];
        if (merge.addedByThem.length) parts.push(`다른 사용자가 추가한 업무 ${merge.addedByThem.length}건`);
        if (merge.deletedByThemHonored.length) parts.push(`다른 사용자가 삭제한 업무 ${merge.deletedByThemHonored.length}건`);
        if (merge.editVsDeleteConflicts.length) parts.push(`⚠️ 삭제/수정 충돌 ${merge.editVsDeleteConflicts.length}건(내용 보존)`);
        if (merge.cellConflicts.length) parts.push(`⚠️ 같은 칸 동시수정 충돌 ${merge.cellConflicts.length}건(내 값 유지, 변경이력에서 상대값 확인 가능)`);
        const summaryMsg = parts.length
            ? '🔀 다른 사용자의 변경사항과 자동 병합했습니다: ' + parts.join(' · ')
            : '🔀 다른 사용자의 변경사항과 자동 병합했습니다 (겹치는 수정 없음).';

        return { applied: true, summaryMsg: summaryMsg, merge: merge };
    } catch (err) {
        console.warn('3-way 병합 실패(기존 충돌 확인 모달로 대체):', err);
        return { applied: false };
    }
};

// 페이지 로드 시 뱃지 초기화
window.updateInboxBadge();

