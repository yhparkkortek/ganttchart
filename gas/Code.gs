// =====================================================================
// KORTEK Gantt — AI 프록시 (Google Apps Script 웹앱)
// 프런트엔드 js/14a-ai-mail-analysis-1.js의 callAiBackend가 POST {userApiKey, prompt, provider, model}로 호출.
// 응답: 성공 {status:'success', result:{candidates:[{content:{parts:[{text}]}, finishReason}]}}
//       실패 {status:'error', message:'Error: [HTTP 429] ...'}  ← 프런트가 정규식으로 할당량/크기/키 오류를 분류하므로
//                                                                  HTTP 상태코드를 메시지 앞에 항상 붙인다.
// 배포: Apps Script 편집기에 이 파일 내용을 붙여넣고 [배포 → 배포 관리 → 기존 배포 ✏️ 편집 → 버전: 새 버전 → 배포]
//       (새 배포를 만들면 URL이 바뀌어 앱의 기본 GAS URL과 어긋남 — 반드시 "기존 배포 편집")
//
// 2026-09-22 변경:
//  - 사용되지 않던 action:'fetchMail' 제거 — 인증 없이 배포자 Gmail 본문을 반환하는 구멍이었다(URL이 공개 저장소에 있음).
//  - ADMIN_API_KEY 대체 사용 제거 — 키 없이 호출하면 배포자 키/한도를 누구나 쓸 수 있었다. 앱은 항상 개인 키를 보냄.
//  - 응답이 JSON이 아니면(JSON.parse 예외) 원인을 알 수 없는 SyntaxError가 나던 것 → HTTP 코드+본문 앞부분으로 오류.
//  - 답변 텍스트가 비면 성공으로 넘기지 않고 오류(finish_reason 포함) — 예전엔 "(빈 응답)"이 성공처럼 보여 폴백도 안 됐다.
//  - Groq gpt-oss(추론 모델): reasoning_effort 'low' — max_tokens 안에서 추론이 토큰을 다 써 content가 비는 것 방지.
//  - Mistral 오류 본문(detail/message/error.message) 모두 해석. Gemini 키는 URL 대신 헤더로.
// =====================================================================

function doPost(e) {
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var params = JSON.parse(rawBody);
    // 🔎 [2026-11-17] action 필드로 분기 — 없으면(기존 프런트) 그대로 AI 생성 경로. Tavily 검색은
    //    LLM 생성이 아니라 "우리가 직접 검색"이라 그 결과(제목/URL/본문 일부)를 그대로 돌려준다.
    if (params.action === 'tavilySearch') {
      return json_(tavilySearch_(params.tavilyKey, params.query));
    }
    Logger.log('[doPost] provider=' + params.provider + ' model=' + params.model + ' promptLen=' + String(params.prompt || '').length);

    var userKey    = params.userApiKey;
    var prompt     = params.prompt;
    var model      = params.model;
    var provider   = params.provider || 'gemini';
    var imageParts = params.imageParts || null; // [{mimeType, data}] — Gemini 비전 전용
    var webSearch  = !!params.search; // 🔎 [2026-11-17] "추론" 모드에서만 프런트가 켜서 보냄 — Gemini 전용(Grounding with Google Search)

    if (!userKey) throw new Error('[HTTP 401] API 키가 없습니다 — 앱의 ⚙️ AI 분석 설정에서 개인 API 키를 저장하세요.');
    if (!prompt) throw new Error('[HTTP 400] 프롬프트가 비어 있습니다.');

    var text;
    if (provider === 'groq') {
      text = callOpenAiCompatible_('Groq', 'https://api.groq.com/openai/v1/chat/completions', userKey, prompt,
        model || 'openai/gpt-oss-120b', { max_tokens: 3000, reasoning_effort: /gpt-oss/.test(model || 'gpt-oss') ? 'low' : undefined });
    } else if (provider === 'mistral') {
      text = callOpenAiCompatible_('Mistral', 'https://api.mistral.ai/v1/chat/completions', userKey, prompt,
        model || 'mistral-small-latest', { max_tokens: 3000 });
    } else if (provider === 'openai') {
      text = callOpenAiCompatible_('OpenAI', 'https://api.openai.com/v1/chat/completions', userKey, prompt,
        model || 'gpt-5.6-luna', { max_completion_tokens: 8192 });
    } else if (provider === 'openrouter') {
      text = callOpenAiCompatible_('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', userKey, prompt,
        model || 'deepseek/deepseek-r1:free', { max_tokens: 4096 });
    } else if (provider === 'glm') {
      // 🔎 [2026-11-17] GLM(Zhipu/Z.ai) — OpenAI 호환 엔드포인트라 Groq/Mistral과 같은 공용 함수 재사용.
      text = callOpenAiCompatible_('GLM', 'https://api.z.ai/api/paas/v4/chat/completions', userKey, prompt,
        model || 'glm-4.5-flash', { max_tokens: 4096 });
    } else {
      text = callGemini_(userKey, prompt, model, imageParts, webSearch);
    }

    return json_({ status: 'success', result: { candidates: [{ content: { parts: [{ text: text.text }] }, finishReason: text.finish }] } });
  } catch (err) {
    return json_({ status: 'error', message: err.toString() });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 응답 본문을 안전하게 JSON으로 — 실패하면 null(본문은 오류 메시지에 앞부분만 싣는다) */
function parseJsonSafe_(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

/** 제공사별 오류 본문에서 사람이 읽을 메시지 추출 */
function errorMessage_(label, code, body, raw) {
  var msg = '';
  if (body) {
    if (body.error && body.error.message) msg = body.error.message;
    else if (typeof body.error === 'string') msg = body.error;
    else if (body.message) msg = typeof body.message === 'string' ? body.message : JSON.stringify(body.message);
    else if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail).slice(0, 300);
  }
  if (!msg) msg = label + ' 통신 오류' + (raw ? ' — ' + String(raw).slice(0, 200) : '');
  return '[HTTP ' + code + '] ' + msg;
}

/** 🔎 [2026-11-17] Tavily 검색 — LLM 생성이 아니라 "우리가 직접 검색"(월 1,000회 무료, 카드 불필요로
 *  알려짐). 결과는 생성하지 않고 그대로 반환 — 프런트가 이 텍스트를 프롬프트에 붙여 기존 무료 LLM한테
 *  넘긴다(RAG). 실패는 throw로(doPost 바깥 catch가 {status:'error'}로 포장). */
function tavilySearch_(apiKey, query) {
  if (!apiKey) throw new Error('[HTTP 401] Tavily API 키가 없습니다 — ⚙️ AI 분석 설정의 🔎 실시간 웹검색에서 저장하세요.');
  if (!query) throw new Error('[HTTP 400] 검색어가 비어 있습니다.');
  var res = UrlFetchApp.fetch('https://api.tavily.com/search', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify({ query: query, search_depth: 'basic', max_results: 5, include_answer: false }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode(), raw = res.getContentText(), body = parseJsonSafe_(raw);
  if (code !== 200 || !body) throw new Error(errorMessage_('Tavily', code, body, raw));
  var results = (body.results || []).map(function (r) {
    return { title: r.title || '', url: r.url || '', content: String(r.content || '').slice(0, 500) };
  });
  return { status: 'success', query: query, results: results };
}

/** Gemini generateContent 1회 호출 — {code, raw, body} 그대로 반환(오류 판단은 호출부가) */
function _fetchGemini_(url, apiKey, payload) {
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode(), raw = res.getContentText();
  return { code: code, raw: raw, body: parseJsonSafe_(raw) };
}

function callGemini_(apiKey, prompt, model, imageParts, webSearch) {
  var geminiModel = model || 'gemini-3.5-flash-lite';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + geminiModel + ':generateContent';
  // 이미지가 있으면 image parts 먼저, 그 다음 텍스트 프롬프트 (Gemini Vision)
  var parts = [];
  if (imageParts && imageParts.length) {
    imageParts.forEach(function(img) {
      parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.data } });
    });
  }
  parts.push({ text: prompt });
  var payload = {
    contents: [{ parts: parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
  };
  // 🔎 [2026-11-17] "추론" 모드 — 구글 웹 Gemini가 쓰는 "Grounding with Google Search"와 같은
  //    tools 옵션. 기본 generateContent 호출엔 안 붙어 있어 날씨처럼 실시간 정보가 필요한 질문에
  //    모델이 "모른다"고만 답했었다 — 사용자가 추론 모드로 명시 선택했을 때만 켠다(무료 한도 보호,
  //    이미지 분석(imageParts)엔 안 붙인다 — 비전 호출은 검색이 필요한 경로가 아님).
  var wantsSearch = webSearch && !(imageParts && imageParts.length);
  if (wantsSearch) payload.tools = [{ google_search: {} }];

  var r = _fetchGemini_(url, apiKey, payload);
  // 🐛 [2026-11-17 실사용 확인] Grounding with Google Search는 무료 등급 키 중 일부(빌링 미연결
  //    프로젝트)에서 "exceeded your current quota / check your plan and billing"로 거부됐다 —
  //    하루 요청 수 한도와 똑같은 문구라 구분이 안 되지만, 검색 tools를 붙였을 때만 나는 오류라면
  //    tools를 빼고 한 번 더 시도해서 "검색 기능이 없어서 전체가 막히는 것"을 막는다(사람에게는
  //    평소처럼 일반 지식 답변이라도 가게). 진짜 하루 한도 소진이면 이 재시도도 똑같이 막혀 원래
  //    오류 그대로 올라간다 — 조용히 삼키지 않는다.
  var searchDenied = false;
  if (wantsSearch && (r.code === 429 || r.code === 403 || r.code === 400)) {
    var payloadNoTools = JSON.parse(JSON.stringify(payload));
    delete payloadNoTools.tools;
    var r2 = _fetchGemini_(url, apiKey, payloadNoTools);
    if (r2.code === 200 && r2.body) { r = r2; searchDenied = true; }
  }
  var code = r.code, raw = r.raw, body = r.body;
  if (code !== 200 || !body) throw new Error(errorMessage_('Gemini', code, body, raw));

  var cand = body.candidates && body.candidates[0];
  var parts = (cand && cand.content && cand.content.parts) || [];
  // 추론(thought) 파트는 빼고 실제 답변 텍스트만 이어붙인다
  var text = parts.filter(function (p) { return p && p.text && !p.thought; }).map(function (p) { return p.text; }).join('');
  var finish = cand ? cand.finishReason : (body.promptFeedback && body.promptFeedback.blockReason) || 'NO_CANDIDATE';
  if (!text) throw new Error('[HTTP 200] Gemini 빈 응답 (finishReason=' + finish + ')');
  // 💡 [2026-11-17 사용자 요청] "왜 날씨를 못 알려주는지" 매번 다시 물어보게 하지 않고, 그라운딩이
  //    막혀서 일반 지식으로만 답한 바로 그 대답에 이유를 적어 둔다 — 코드 문제가 아니라 구글
  //    정책(무료=빌링 미연결 프로젝트는 Grounding 할당량 0)이라는 것과 해결책(유료 결제)까지.
  if (searchDenied) {
    text += '\n\n💡 (실시간 웹검색 없이 일반 지식으로만 답했습니다 — 무료 등급 키는 구글 정책상 Grounding with Google Search 기능이 막혀 있습니다(할당량 0). 실시간 정보가 꼭 필요하면 Google Cloud 프로젝트에 결제수단을 등록해 유료 등급으로 전환해야 합니다.)';
  }
  return { text: text, finish: finish };
}

/** Groq / Mistral / OpenAI 공용(OpenAI 호환 chat/completions) */
function callOpenAiCompatible_(label, url, apiKey, prompt, model, extra) {
  var payload = { model: model, messages: [{ role: 'user', content: prompt }], temperature: 0.1 };
  for (var k in extra) if (extra[k] !== undefined) payload[k] = extra[k];
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode(), raw = res.getContentText(), body = parseJsonSafe_(raw);
  if (code !== 200 || !body) throw new Error(errorMessage_(label, code, body, raw));

  var choice = body.choices && body.choices[0];
  var content = choice && choice.message ? choice.message.content : '';
  if (Object.prototype.toString.call(content) === '[object Array]') {
    // 일부 모델(Mistral 추론 모델 등)은 content를 조각 배열로 준다 — 텍스트 조각만 합침
    content = content.map(function (c) { return (c && c.type !== 'thinking' && c.text) || ''; }).join('');
  }
  var finish = choice ? choice.finish_reason : 'NO_CHOICE';
  if (!content) throw new Error('[HTTP 200] ' + label + ' 빈 응답 (finish_reason=' + finish + ')');
  return { text: content, finish: finish };
}
