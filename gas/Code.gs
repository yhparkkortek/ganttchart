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
    Logger.log('[doPost] provider=' + params.provider + ' model=' + params.model + ' promptLen=' + String(params.prompt || '').length);

    var userKey  = params.userApiKey;
    var prompt   = params.prompt;
    var model    = params.model;
    var provider = params.provider || 'gemini';

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
    } else {
      text = callGemini_(userKey, prompt, model);
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

function callGemini_(apiKey, prompt, model) {
  var geminiModel = model || 'gemini-3.5-flash-lite';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + geminiModel + ':generateContent';
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode(), raw = res.getContentText(), body = parseJsonSafe_(raw);
  if (code !== 200 || !body) throw new Error(errorMessage_('Gemini', code, body, raw));

  var cand = body.candidates && body.candidates[0];
  var parts = (cand && cand.content && cand.content.parts) || [];
  // 추론(thought) 파트는 빼고 실제 답변 텍스트만 이어붙인다
  var text = parts.filter(function (p) { return p && p.text && !p.thought; }).map(function (p) { return p.text; }).join('');
  var finish = cand ? cand.finishReason : (body.promptFeedback && body.promptFeedback.blockReason) || 'NO_CANDIDATE';
  if (!text) throw new Error('[HTTP 200] Gemini 빈 응답 (finishReason=' + finish + ')');
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
