/* ================================================================
   44-backlog-consolidate.js
   📦 미분류 백로그 일괄 정리 — 규칙 취합 → AI 취합 → 확인 1회 → 일괄 생성
   ================================================================
   · 왜: Phase 9(js/29)가 만드는 unmatchedClusters는 "업무명에서 뽑은 토큰"이 키라서,
     한 프로젝트가 수십 조각으로 흩어진다. 실측(2026-10-21) 494개 군집 중 ZITRO ICONIC
     계열만 14개 키(ICONIC 41 · ZITRO 22 · SPLENDIDUM 13 · SPECIAL 13 · 사전조립 9 …
     합계 약 155건)로 쪼개져 있었다. 그 상태로 배너의 [새 프로젝트 만들기]를 누르면
     한 프로젝트를 14번 만들어야 하고, 자동 생성으로 바꾸면 "발주서"·"아트워크"·
     "프론티어" 같은 프로젝트가 아닌 것까지 만들어져 후보 목록을 영구히 오염시킨다.
   · 그래서 자동화할 지점은 "생성"이 아니라 "취합"이다. 조각을 실제 프로젝트 정체로
     묶어서 6~8줄로 줄이고, 사람은 그 표를 한 번만 확인한다(33번 → 1번).
   ----------------------------------------------------------------
   순서 (CLAUDE.md "결정론 먼저" 원칙)
   ① 규칙: 프로젝트가 아닌 군집을 결정론으로 걸러낸다(어휘 카탈로그 · 자재 PN 패턴)
   ② 규칙: 고객사 사전(기존 프로젝트 + 주소록)으로 1차 그룹핑 — AI 없이 묶이는 건 여기서 끝
   ③ AI: ①②로 못 가른 것만 1회 호출로 묶음·고객사·모델명 확정 (군집당 1회가 아니라 전체 1회)
   ④ 확인 1회: 표 + 체크박스
   ⑤ 일괄 생성: 검증된 저장 경로(saveToGoogleDrive) 재사용 · MP(EC) 임시로 등록
   ⑥ 큐 별용: 생성된 묶음의 모든 키 → created, 기각 묶음 → dismissed
   ----------------------------------------------------------------
   · window._bcOpenModal()        진입점 (메일 서버 탭 버튼)
   · window._bcAnalyze()          규칙+AI 취합만 수행 (생성 안 함, 테스트/미리보기용)
   · window._bcRuleClassify(cs)   ① 결정론 분류 — 순수함수(노드에서 테스트 가능)
   · window._bcRuleGroup(cs)      ② 결정론 그룹핑 — 순수함수
================================================================ */

(function() {
'use strict';

var _en = function() { return window._currentLang === 'en'; };
var _t  = function(ko, en) { return _en() ? en : ko; };

// ── 설정값 (데이터로 분리 — 하드코딩 지양) ─────────────────────────────
var _BC_MIN_COUNT   = 3;   // 이 건수 미만 군집은 취합 입력에서 제외(1~2건은 노이즈가 대부분)
var _BC_MAX_AI_INPUT = 90; // AI 프롬프트에 넣을 군집 수 상한(토큰 보호)
var _BC_MAX_CREATE  = 20;  // 한 번에 생성할 프로젝트 수 상한(사고 시 피해 한정)

// ⚠️ "프로젝트가 아닌 것" 어휘 — 실측 pending 목록에서 관찰된 것들.
//    업무 유형·사내 활동·문서 종류는 어느 프로젝트에나 붙으므로 프로젝트 이름이 될 수 없다.
//    오탐이 보이면 이 배열만 고친다(코드 정규식 금지).
var _BC_NON_PROJECT_WORDS = [
    // 업무 유형 / 문서 종류
    '발주서','견적서','거래명세서','시험의뢰','아트워크','대체품','고객사','자재','단가','납기','수량',
    '도면','사양','사양서','승인원','환경자료','보고','회의','회의록','공지','안내','요청','확인','검토',
    '회신','답변','전달','공유','제출','송부','문의','문의사항','진행','완료','변경','추가','수정','일정',
    'DESCRIPTION','SITE','CALIBRATION','SPEC','QUOTE','QUOTATION','INQUIRY','REQUEST','REPORT','NOTICE',
    'MEETING','MINUTES','UPDATE','INFO','MOLD',
    // 사내 활동 (프로젝트 아님)
    '프론티어','FRONTIER','교육','세미나','워크샵','동호회','경조사','휴가','연차','근태','연장근로',
    '참여율','신청서','출입','규정','정산','법인카드',
    // 2026-10-21 실측 결과 표에서 관찰된 범용 토큰 (키로 쓰이면 서로 다른 건이 섞인다)
    '담당자','스케쥴','스케줄','업데이트','주간업무보고','주간보고','업무보고','월간보고','2027년','2026년'
];
var _BC_NON_PROJECT_SET = {};
_BC_NON_PROJECT_WORDS.forEach(function(w) { _BC_NON_PROJECT_SET[_bcNorm(w)] = true; });

function _bcNorm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, ''); }

// ── ① 결정론 분류: 이 군집은 프로젝트가 될 수 있는가 ──────────────────
/**
 * 자재/부품 PN처럼 보이는가 — 프로젝트가 아니라 "품목"이다.
 * 실측 예: S315DJ1A01(INX 패널), LM230WF3SLP8(LG 패널), 162582350(PN 1625823-50)
 * 판정: ①숫자만 7자리 이상 ②영문 1~4 + 숫자 6자리 이상 혼합 ③영숫자 8자 이상에 숫자 4개 이상
 */
function _bcLooksMaterialPn(token) {
    var t = _bcNorm(token);
    if (!t) return false;
    if (/^[0-9]{7,}$/.test(t)) return true;
    if (/^[A-Z]{1,4}[0-9]{6,}/.test(t)) return true;
    if (t.length >= 8 && /^[A-Z0-9]+$/.test(t) && (t.replace(/[^0-9]/g, '').length >= 4)) return true;
    return false;
}

/** 군집 키의 토큰들이 전부 "프로젝트 아님" 신호면 사유를, 아니면 '' */
window._bcRuleClassify = function(cluster) {
    var toks = String((cluster && cluster.key) || '').split('|').filter(Boolean);
    if (!toks.length) return 'empty_key';
    var reasons = [];
    for (var i = 0; i < toks.length; i++) {
        if (_BC_NON_PROJECT_SET[_bcNorm(toks[i])]) { reasons.push('어휘:' + toks[i]); continue; }
        if (_bcLooksMaterialPn(toks[i]))          { reasons.push('자재PN:' + toks[i]); continue; }
        return ''; // 하나라도 "프로젝트가 될 수 있는" 토큰이 있으면 후보로 남긴다
    }
    return reasons.join(' / ');
};

// ── ② 결정론 그룹핑: 고객사 사전으로 묶는다 ───────────────────────────
/**
 * 고객사 사전 — 기존 project_index의 customer + 주소록 회사명. 하드코딩 아님.
 * 실측에서 ZITRO/LNW/IGT는 전부 기존 프로젝트나 주소록에 이미 있는 이름이었다.
 */
/**
 * 🐛 [2026-10-21 버그수정, 실사용] 첫 구현은 주소록 이메일 도메인도 고객사 후보로 넣었다.
 *    주소록은 대부분 **협력사·공급사**라서 ILLOIND(48건)·WINDTECH(15)·TAWHALES(7)·
 *    KOREA-EMS(7) 같은 "고객사가 아닌 묶음"이 만들어졌다. 고객사는 등록된 프로젝트의
 *    customer 필드가 유일한 근거다 — 주소록은 쓰지 않는다.
 */
window._bcCustomerDict = function(projects) {
    var set = {};
    (projects || []).forEach(function(p) {
        var c = String(p.customer || '').trim();
        if (c.length < 2) return;
        var k = _bcNorm(c);
        if (k) set[k] = c;
    });
    return set;
};

/**
 * 군집에서 사전에 있는 고객사명을 찾는다.
 * 🐛 [2026-10-21 버그수정] 첫 구현은 샘플 제목·본문까지 뒤졌다. 사내 메일엔 자사명(코텍)이
 *    거의 항상 들어 있어서 KORTEK 하나가 377건을 삼켰고, ZITRO 건(ICONIC·SPLENDIDUM)까지
 *    그 밑으로 빨려 들어갔다. 근거를 **군집 키와 AI 요약**으로 좁힌다 — 둘 다 "이 군집이
 *    무엇인가"를 직접 말하는 값이고, 본문처럼 지나가는 언급이 섞이지 않는다.
 */
function _bcDetectCustomer(cluster, dict) {
    var hay = _bcNorm([
        cluster.key,
        ((cluster.aiVerdict || {}).customer || ''),
        ((cluster.aiVerdict || {}).summary || '')
    ].join(' '));
    if (!hay) return '';
    var best = '', bestLen = 0;
    Object.keys(dict).forEach(function(k) {
        // 긴 이름 우선 — 짧은 약칭이 긴 정식명을 가로채지 않게
        if (k.length >= 3 && k.length > bestLen && hay.indexOf(k) !== -1) { best = dict[k]; bestLen = k.length; }
    });
    return best;
}

/**
 * 💡 [2026-10-21 신규] 변별력 없는 이름 제거 — 자사명(코텍)처럼 거의 모든 군집에 걸리는 이름은
 *    묶는 기준이 될 수 없다. 자사명을 코드에 박는 대신(법인이 여럿이고 팀마다 다름) "전체 군집의
 *    _BC_DOMINANT_RATIO 이상에 걸리면 변별력 없음"이라는 규칙으로 데이터에서 찾아낸다.
 *    실측에서 KORTEK이 90개 중 377건분을 삼킨 것이 정확히 이 경우였다.
 */
var _BC_DOMINANT_RATIO = 0.4;
function _bcDropDominant(dict, clusters) {
    var n = (clusters || []).length;
    if (n < 5) return dict;                       // 표본이 적으면 판단하지 않는다
    var hit = {};
    clusters.forEach(function(c) {
        var hay = _bcNorm([c.key, ((c.aiVerdict || {}).customer || ''), ((c.aiVerdict || {}).summary || '')].join(' '));
        Object.keys(dict).forEach(function(k) { if (hay.indexOf(k) !== -1) hit[k] = (hit[k] || 0) + 1; });
    });
    var out = {}, dropped = [];
    Object.keys(dict).forEach(function(k) {
        if ((hit[k] || 0) / n >= _BC_DOMINANT_RATIO) { dropped.push(dict[k] + '(' + hit[k] + '/' + n + ')'); return; }
        out[k] = dict[k];
    });
    if (dropped.length) console.info('[백로그 취합] 변별력 없어 제외한 이름:', dropped.join(', '));
    return out;
}

/**
 * ①②를 한 번에 — 결정론만으로 갈 수 있는 데까지 간다.
 * 반환: { rejected:[], groups:[{customer, members, count, keys}], unresolved:[] }
 *  · rejected  = 프로젝트 아님(①)
 *  · groups    = 같은 고객사로 묶인 것(②) — AI는 "이 안에서 모델이 몇 개인가"만 본다
 *  · unresolved = 고객사를 못 찾은 것 — AI가 전부 판단
 */
window._bcRuleGroup = function(clusters, dict) {
    var rejected = [], byCustomer = {}, unresolved = [];
    (clusters || []).forEach(function(c) {
        var why = window._bcRuleClassify(c);
        if (why) { rejected.push({ cluster: c, reason: why }); return; }
        var cust = _bcDetectCustomer(c, dict || {});
        if (!cust) { unresolved.push(c); return; }
        (byCustomer[cust] = byCustomer[cust] || []).push(c);
    });
    var groups = Object.keys(byCustomer).map(function(cust) {
        var ms = byCustomer[cust];
        return {
            customer: cust,
            members: ms,
            keys: ms.map(function(m) { return m.key; }),
            count: ms.reduce(function(s, m) { return s + (m.count || 0); }, 0)
        };
    }).sort(function(a, b) { return b.count - a.count; });
    return { rejected: rejected, groups: groups, unresolved: unresolved };
};

// ── ③ AI 취합 — 전체 1회 호출 ─────────────────────────────────────────
function _bcSamplesOf(cluster, n) {
    return (cluster.samples || []).slice(0, n || 2)
        .map(function(s) { return String(s.subject || '').slice(0, 70); })
        .filter(Boolean);
}

function _bcBuildPrompt(ruleResult, existingProjects) {
    var lines = [];
    // 규칙이 고객사로 묶어둔 것 — AI는 "이 안에 모델이 몇 개인가"를 가른다
    ruleResult.groups.forEach(function(g, i) {
        lines.push('[그룹 ' + (i + 1) + '] 고객사(규칙 판정): ' + g.customer + ' · 미분류 ' + g.count + '건');
        g.members.slice(0, 12).forEach(function(m) {
            lines.push('  - 키 "' + m.key + '" (' + (m.count || 0) + '건): ' + _bcSamplesOf(m, 2).join(' / '));
        });
    });
    // 규칙이 고객사를 못 찾은 것 — AI가 전부 판단
    if (ruleResult.unresolved.length) {
        lines.push('[미판정] 규칙이 고객사를 못 찾은 군집:');
        ruleResult.unresolved.slice(0, 40).forEach(function(m) {
            lines.push('  - 키 "' + m.key + '" (' + (m.count || 0) + '건): ' + _bcSamplesOf(m, 2).join(' / '));
        });
    }
    var existing = (existingProjects || []).map(function(p) {
        return (p.customer || '') + ' / ' + (p.model || '') + (p.inch ? ' ' + p.inch + '인치' : '');
    }).filter(function(s) { return s.trim() !== '/'; });

    return '당신은 디스플레이 제조사(코텍)의 프로젝트 관리자입니다. 아래는 "어느 프로젝트에도 매칭되지 않은 메일"들을\n'
        + '업무명 토큰으로 묶어둔 군집 목록입니다. 같은 프로젝트 얘기가 토큰이 달라 여러 군집으로 흩어져 있습니다.\n'
        + '이것들을 **실제 프로젝트 단위로 다시 묶어** 주세요.\n\n'
        + '【이미 등록된 프로젝트 — 여기에 해당하는 건 새로 만들면 안 됩니다】\n'
        + (existing.length ? existing.join('\n') : '(없음)') + '\n\n'
        + '【취합할 군집】\n' + lines.join('\n') + '\n\n'
        + '규칙:\n'
        + '1. 같은 제품/모델을 다루는 군집은 하나로 합치세요. 공정 단계(E3·양산·사전조립)나 부품(파워보드·LED)은\n'
        + '   별개 프로젝트가 아니라 같은 프로젝트의 업무입니다 — 반드시 합치세요.\n'
        + '2. 고객사가 같아도 제품이 다르면(예: 같은 고객의 27인치 모니터 / 49인치 사이니지) 나누세요.\n'
        + '3. 프로젝트가 아닌 것(업무 유형·자재 품번·사내 활동·일반 문의)은 isProject를 false로 두세요.\n'
        + '4. 위 "이미 등록된 프로젝트"와 같은 건이면 isProject를 false로 하고 reason에 어느 프로젝트인지 적으세요.\n'
        + '5. model은 파일명이 되므로 **제품을 특정하는 짧은 이름**으로 쓰세요(공정·부품·수식어 금지).\n\n'
        + '아래 JSON 배열만 출력하세요(설명·코드블록 금지):\n'
        + '[{"customer":"고객사","model":"제품/모델명","isProject":true,"confidence":"상|중|하",\n'
        + '  "reason":"왜 이렇게 묶었는지 1문장","keys":["포함한 군집 키","..."]}]';
}

/**
 * AI 취합 1회. 성공하면 배열, 실패하면 {error:'사유'} — null을 돌려주지 않는다.
 * 🐛 [2026-10-21 버그수정] 첫 구현이 callAiBackend의 반환을 문자열로 취급해 String(raw)를 했다.
 *    이 함수는 {ok, data, modelUsed, …} 객체를 돌려주므로 String()이 "[object Object]"가 되고,
 *    거기에 '['와 ']'가 들어 있어서 그 구간을 JSON.parse 하다 매번 터졌다 — 즉 AI 호출은 늘
 *    성공했는데 결과를 통째로 버리고 "AI 취합 실패"로 표시하고 있었다.
 *    다른 호출부와 동일하게 window._aiExtractText(r.data)로 꺼낸다(제공사 공통 추출기).
 */
async function _bcAiConsolidate(ruleResult, existingProjects, apiKey) {
    if (!window.callAiBackend) return { error: 'callAiBackend 없음' };
    var prompt = _bcBuildPrompt(ruleResult, existingProjects);
    var fail = function(why, extra) {
        console.warn('[백로그 취합] AI 취합 실패:', why, extra || '');
        if (window._issueLog) window._issueLog({
            domain: 'ai', kind: 'bc_consolidate_failed', route: 'backlog-consolidate',
            result: { errorRaw: String(why) }, env: { promptKB: Math.round(prompt.length / 1024) }
        });
        return { error: String(why) };
    };
    var r;
    try {
        r = await window.callAiBackend(apiKey, prompt, { isCancelled: function() { return false; }, feature: 'backlog-consolidate' });
    } catch (err) {
        return fail((err && err.message) || err);
    }
    if (!r || !r.ok) return fail((r && (r.error || r.message)) || 'AI 응답 실패', r);
    var txt = (window._aiExtractText ? window._aiExtractText(r.data) : '') || '';
    if (!txt.trim()) return fail('AI가 빈 응답을 반환했습니다', r);
    txt = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
    // 설명문 안의 대괄호에 속지 않도록, '['마다 끝에서부터 줄여가며 파싱을 시도한다
    for (var s = txt.indexOf('['); s !== -1; s = txt.indexOf('[', s + 1)) {
        for (var e = txt.lastIndexOf(']'); e > s; e = txt.lastIndexOf(']', e - 1)) {
            try {
                var arr = JSON.parse(txt.slice(s, e + 1));
                if (Array.isArray(arr) && arr.length) return arr;
            } catch (ignore) { /* 다음 후보 구간 */ }
        }
    }
    return fail('응답에서 JSON 배열을 찾지 못했습니다', txt.slice(0, 200));
}

// ── 취합 본체 (생성 안 함 — 미리보기/테스트용으로 따로 노출) ───────────
window._bcAnalyze = async function() {
    var tokenObj = (typeof gapi !== 'undefined' && gapi.client) ? gapi.client.getToken() : null;
    var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
    if (!token) throw new Error(_t('구글 드라이브 연동이 필요합니다.', 'Google Drive must be connected.'));
    var indexFileId = await window.findProjectIndexFile(token);
    if (!indexFileId) throw new Error('project_index.json을 찾지 못했습니다.');
    var res = await fetch('https://www.googleapis.com/drive/v3/files/' + indexFileId + '?alt=media&supportsAllDrives=true',
        { headers: { Authorization: 'Bearer ' + token } });
    var indexData = await res.json();
    var all = (indexData && indexData.unmatchedClusters) || [];
    var projects = (indexData && indexData.projects) || [];

    // 이미 처리된 것(created/dismissed)은 제외. 건수 하한 미만도 제외(노이즈).
    var live = all.filter(function(c) {
        return c.status !== 'created' && c.status !== 'dismissed' && (c.count || 0) >= _BC_MIN_COUNT;
    }).sort(function(a, b) { return (b.count || 0) - (a.count || 0); }).slice(0, _BC_MAX_AI_INPUT);

    var dict = _bcDropDominant(window._bcCustomerDict(projects), live);
    var ruleResult = window._bcRuleGroup(live, dict);

    var apiKey = window.getActiveAiKey && window.getActiveAiKey();
    var ai = apiKey ? await _bcAiConsolidate(ruleResult, projects, apiKey)
                    : { error: _t('AI API 키가 설정되지 않았습니다.', 'No AI API key is set.') };
    var aiErr = (ai && ai.error) ? ai.error : '';
    var aiRows = Array.isArray(ai) ? ai : null;

    return {
        indexFileId: indexFileId, indexData: indexData,
        totalClusters: all.length, consideredClusters: live.length,
        rule: ruleResult, ai: aiRows, aiError: aiErr,
        rows: aiRows ? _bcBuildRows(ruleResult, aiRows, live) : []
    };
};

/** AI 결과 + 규칙 결과를 화면에 그릴 행으로 합친다. AI가 없으면 규칙 그룹을 그대로 쓴다. */
function _bcBuildRows(ruleResult, ai, live) {
    var byKey = {};
    live.forEach(function(c) { byKey[c.key] = c; });
    var rows = [];
    if (ai && ai.length) {
        ai.forEach(function(r) {
            var keys = (r.keys || []).filter(function(k) { return byKey[k]; });
            if (!keys.length) return;
            rows.push({
                customer: String(r.customer || '').trim(),
                model: String(r.model || '').trim(),
                isProject: r.isProject !== false,
                confidence: r.confidence || '',
                reason: String(r.reason || '').slice(0, 120),
                keys: keys,
                count: keys.reduce(function(s, k) { return s + (byKey[k].count || 0); }, 0),
                source: 'ai'
            });
        });
        // AI가 빠뜨린 군집은 규칙 그룹으로 보완 — 조용히 사라지면 큐가 안 비워진다
        var used = {};
        rows.forEach(function(r) { r.keys.forEach(function(k) { used[k] = true; }); });
        ruleResult.groups.forEach(function(g) {
            var left = g.keys.filter(function(k) { return !used[k]; });
            if (!left.length) return;
            rows.push({ customer: g.customer, model: '', isProject: true, confidence: '하',
                reason: _t('AI가 다루지 않음 — 규칙(고객사 일치)으로 묶음', 'Not covered by AI — grouped by customer rule'),
                keys: left, count: left.reduce(function(s, k) { return s + (byKey[k].count || 0); }, 0), source: 'rule' });
        });
    } else {
        ruleResult.groups.forEach(function(g) {
            rows.push({ customer: g.customer, model: '', isProject: true, confidence: '하',
                reason: _t('규칙(고객사 일치)으로 묶음 — AI 취합 없음', 'Grouped by customer rule — no AI consolidation'),
                keys: g.keys, count: g.count, source: 'rule' });
        });
    }
    // 규칙이 "프로젝트 아님"으로 판정한 것은 한 줄로 묶어 일괄 기각 대상으로
    if (ruleResult.rejected.length) {
        rows.push({
            customer: '', model: _t('[프로젝트 아님] 업무유형 · 자재 품번 · 사내 활동', '[Not a project] task types · material PNs · internal activities'),
            isProject: false, confidence: '상',
            reason: ruleResult.rejected.slice(0, 6).map(function(x) { return x.reason; }).join(' / '),
            keys: ruleResult.rejected.map(function(x) { return x.cluster.key; }),
            count: ruleResult.rejected.reduce(function(s, x) { return s + (x.cluster.count || 0); }, 0),
            source: 'rule-reject'
        });
    }
    return rows.sort(function(a, b) {
        if (a.isProject !== b.isProject) return a.isProject ? -1 : 1;
        return b.count - a.count;
    });
}

// ── ⑤ 일괄 생성 ───────────────────────────────────────────────────────
/**
 * 프로젝트 1개를 "마법사와 동일한 방식"으로 만든다.
 * ⚠️ projectMeta를 직접 쓰면 안 된다 — saveToGoogleDrive가 내부에서 collectTabData()로
 *    DOM을 읽어 projectMeta를 덮어쓰기 때문(04c:632). 그래서 Summary DOM을 채운 뒤 저장한다.
 *    (js/28 마법사의 _fillSummaryFields와 같은 이유·같은 방식)
 */
/**
 * 참조 엑셀을 불러오고 "실제로 반영될 때까지" 기다린다.
 * 반영 판정은 Customer SPEC 표준 서식(TYPE/TYPE2가 있는 행)이 생겼는지로 본다 —
 * 그게 바로 뒤의 AI 매핑이 필요로 하는 것이고, colIdx만 보면 Gantt만 들어와도 통과해 버린다.
 * 못 기다리면 false를 돌려주고, 호출부는 그 프로젝트를 "서식 없음"으로 보고한다(조용히 넘기지 않는다).
 */
async function _bcImportReferenceAndWait(timeoutMs) {
    if (!window.autoImportReferenceExcel) return false;
    const hasTpl = function() {
        const rows = ((window.tabData || {}).briefSpec) || [];
        return rows.some(function(r) { return r && (String(r.type || '').trim() || String(r.sub || '').trim()); });
    };
    if (hasTpl()) return true;
    try { window.autoImportReferenceExcel(); } catch (e) { return false; }
    const until = Date.now() + (timeoutMs || 20000);
    while (Date.now() < until) {
        await new Promise(function(r) { setTimeout(r, 400); });
        if (hasTpl()) {
            // 파싱이 끝난 직후 populate가 한 틱 더 필요한 경우가 있어 살짝 더 준다
            await new Promise(function(r) { setTimeout(r, 400); });
            return true;
        }
    }
    return false;
}

async function _bcCreateOne(row) {
    var setVal = function(id, v) {
        var el = document.getElementById(id);
        if (!el) return;
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window._openAsNewSheet('bc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), null, null);
    window._resetToBlankNoConfirm(true);

    // 🐛 [2026-10-21 버그수정, 사용자 제보 "불러오기 AI 분석이 실패함"]
    //    빈 시트에서 바로 저장하면 Gantt 컬럼(colIdx)도, Customer SPEC 표준 서식(TYPE/TYPE2)도
    //    없는 껍데기 프로젝트가 만들어진다. 그러면 나중에 Customer SPEC [불러오기]의 AI 매핑이
    //    'fill'(있는 항목의 빈칸만 채움) 모드라 채울 항목이 없어 실패한다.
    //    마법사(js/28)는 _npwOpen에서 참조 엑셀을 불러오고 사람이 5단계를 걷는 동안 그게 끝나지만,
    //    일괄 생성은 사람 대기 시간이 없어 그대로 저장돼 버렸다 — 같은 단계를 넣고 **기다린다.**
    //    ⚠️ autoImportReferenceExcel은 끝에서 handleFiles()를 await 없이 부르므로 함수가 끝나도
    //    파싱은 진행 중이다. 그래서 반환을 기다리지 않고 "실제로 들어왔는지"를 폴링한다.
    const tplOk = await _bcImportReferenceAndWait();

    // 모델 카드(고객모델명이 실제로 사는 곳) — 마법사와 동일 구조
    window.tabData = window.tabData || {};
    window.tabData.projectModels = [{
        unitId: '', 고객모델명: row.model, 프로젝트코드: '', 프로젝트명칭: '', KTKPN: '', KTK모델명: ''
    }];
    if (window.renderProjectModels) window.renderProjectModels();

    setVal('sum-customer', row.customer);
    setVal('sum-mail-keywords', row.keywords || '');
    // 🟢 MP(EC) 임시 — KTK PN·담당자·PROTO Start 없이 등록되는 단계(js/04k 등록 게이트 참고)
    setVal('sum-project-status', 'MP(EC)');
    // 자동완성 추천 박스가 떠 있을 수 있음(마법사와 같은 처리)
    var ac = document.getElementById('addr-autocomplete-dropdown');
    if (ac) ac.style.display = 'none';
    if (window._checkAllRequiredFields) window._checkAllRequiredFields();

    var ok = await window.saveToGoogleDrive({ suppressAlert: true });
    return ok ? { fileId: window.currentDriveFileId, fileName: window.currentDriveFileName, tplOk: tplOk } : null;
}

/**
 * 선택된 행들을 일괄 처리한다.
 * · isProject=true  → 프로젝트 생성 + 그 행의 모든 키를 created로
 * · isProject=false → 생성 없이 그 행의 모든 키를 dismissed로
 * 마지막에 원래 보던 시트로 돌아오고, 큐 별용은 index 1회 PATCH로 한꺼번에 반영한다.
 */
window._bcApply = async function(ctx, selectedRows) {
    var create = selectedRows.filter(function(r) { return r.isProject; }).slice(0, _BC_MAX_CREATE);
    var reject = selectedRows.filter(function(r) { return !r.isProject; });
    var prevKey = window._activeSheetKey;
    window._commitActiveSheet();

    // 🔒 배치 예고 — 04c의 새 파일 비밀번호 게이트가 "첫 파일에서 한 번 묻고, 남은 건수만큼만
    //    재확인 생략"하도록 알린다. 게이트를 건너뛰는 게 아니라 첫 1회는 반드시 묻는다.
    window._batchPwPending = create.length;
    window._batchPwToken = null;

    var made = [], failed = [];
    for (var i = 0; i < create.length; i++) {
        var row = create[i];
        _bcStatus(_t('생성 중 ', 'Creating ') + (i + 1) + '/' + create.length + ' — ' + row.customer + ' ' + row.model);
        try {
            var r = await _bcCreateOne(row);
            if (r && r.fileId) made.push({ row: row, fileId: r.fileId, fileName: r.fileName });
            else failed.push({ row: row, why: window._lastSaveBlockReason || _t('저장 실패', 'save failed') });
        } catch (e) {
            failed.push({ row: row, why: String((e && e.message) || e) });
        }
    }
    // 🔒 배치 토큰은 반드시 여기서 회수한다 — 남겨두면 이후 평상시 저장이 비밀번호 없이 통과한다
    window._batchPwToken = null;
    window._batchPwPending = 0;

    // 원래 보던 시트로 복귀 — 생성 때문에 사람이 있던 자리를 잃지 않게
    if (prevKey && window.switchToSheet) { try { window.switchToSheet(prevKey); } catch (e) { /* ignore */ } }

    // 큐 별용 — 최신 인덱스를 다시 읽어서(그 사이 다른 PC가 건드렸을 수 있음) 1회 PATCH
    _bcStatus(_t('큐 정리 중...', 'Cleaning up the queue...'));
    try {
        var tokenObj = gapi.client.getToken();
        var token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        var res = await fetch('https://www.googleapis.com/drive/v3/files/' + ctx.indexFileId + '?alt=media&supportsAllDrives=true',
            { headers: { Authorization: 'Bearer ' + token } });
        var fresh = await res.json();
        fresh.unmatchedClusters = fresh.unmatchedClusters || [];
        var mark = function(keys, status, note) {
            keys.forEach(function(k) {
                var c = fresh.unmatchedClusters.find(function(x) { return x.key === k; });
                if (!c) return;
                c.status = status;
                c[status === 'created' ? 'createdAt' : 'dismissedAt'] = new Date().toISOString();
                if (note) c.bcNote = note;
            });
        };
        made.forEach(function(m) { mark(m.row.keys, 'created', m.fileName || ''); });
        reject.forEach(function(r) { mark(r.keys, 'dismissed', 'backlog-consolidate: not a project'); });
        await fetch('https://www.googleapis.com/upload/drive/v3/files/' + ctx.indexFileId + '?uploadType=media&supportsAllDrives=true',
            { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(fresh) });
        if (window._invalidatePiModalCache) window._invalidatePiModalCache();
    } catch (e) {
        console.warn('[백로그 취합] 큐 별용 실패 — 생성된 프로젝트는 그대로 남아 있습니다:', e);
    }
    return { made: made, failed: failed, rejected: reject };
};

// ── ④ 확인 1회 UI ─────────────────────────────────────────────────────
function _bcStatus(msg) {
    var el = document.getElementById('bc-status');
    if (el) el.textContent = msg;
}
function _bcEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window._bcOpenModal = async function() {
    var m = document.getElementById('bc-modal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'bc-modal';
        m.style.cssText = 'display:none; position:fixed; inset:0; z-index:9500; pointer-events:none;';
        m.innerHTML =
        '<div id="bc-box" onclick="event.stopPropagation()" style="pointer-events:auto; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);'
        + ' background:#fff; border-radius:10px; width:var(--modal-w-lg, 880px); max-width:94vw; max-height:86vh; display:flex; flex-direction:column;'
        + ' box-shadow:0 8px 32px rgba(0,0,0,0.22); overflow:hidden; resize:both; min-width:420px; min-height:320px;">'
        + '  <div id="bc-drag" style="padding:13px 18px; border-bottom:1px solid #a8dab8; font-weight:bold; font-size:14px; background:#eaf7ea;'
        + '       border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; color:#1f6a3a;">'
        + '    <span>📦 <span id="bc-title">' + _t('미분류 백로그 일괄 정리', 'Consolidate unclassified backlog') + '</span></span>'
        + '    <button onclick="document.getElementById(\'bc-modal\').style.display=\'none\'" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
        + '       border-radius:6px; color:var(--modal-icon-text); font-size:16px; cursor:pointer; width:28px; height:28px; padding:0; line-height:1; flex-shrink:0;'
        + '       display:flex; align-items:center; justify-content:center;">✕</button>'
        + '  </div>'
        + '  <div id="bc-status" style="padding:8px 18px; font-size:11.5px; color:#1f6a3a; background:#f4fbf4; border-bottom:1px solid #e5f3e5;"></div>'
        + '  <div id="bc-body" style="overflow:auto; flex:1; padding:10px 14px; background:#fafafa;"></div>'
        + '  <div style="padding:10px 16px; border-top:1px solid #eee; display:flex; gap:8px; align-items:center;">'
        + '    <span id="bc-summary" style="font-size:11.5px; color:#666; flex:1;"></span>'
        + '    <button id="bc-apply-btn" onclick="window._bcApplyClick()" style="padding:7px 16px; background:#28a745; color:#fff; border:none;'
        + '       border-radius:6px; font-size:12.5px; font-weight:bold; cursor:pointer;">' + _t('선택 항목 적용', 'Apply selected') + '</button>'
        + '    <button onclick="document.getElementById(\'bc-modal\').style.display=\'none\'" style="padding:7px 14px; background:#f8f9fa; color:#555;'
        + '       border:1px solid #ccc; border-radius:6px; font-size:12px; cursor:pointer;">' + _t('닫기', 'Close') + '</button>'
        + '  </div>'
        + '</div>';
        document.body.appendChild(m);
        if (window._makeDraggable) window._makeDraggable('bc-box', 'bc-drag');
        if (window._bindClickToFront) window._bindClickToFront('bc-modal');
    }
    m.style.display = 'block';
    if (window.bringModalToFront) window.bringModalToFront('bc-modal');
    document.getElementById('bc-body').innerHTML = '';
    _bcStatus(_t('① 규칙으로 분류하고 ② AI로 취합하는 중... (AI 호출 1회)', '① Rule classification, ② AI consolidation... (1 AI call)'));

    try {
        var ctx = await window._bcAnalyze();
        window._bcCtx = ctx;
        _bcRender(ctx);
    } catch (e) {
        _bcStatus('❌ ' + String((e && e.message) || e));
    }
};

function _bcRender(ctx) {
    var rows = ctx.rows;
    // ⚠️ [2026-10-21] AI 취합이 실패하면 표를 그리지 않는다.
    //    규칙만으로 묶은 결과는 "같은 고객사면 전부 한 줄"이라 제품이 섞인다(실측에서 ZITRO의
    //    여러 제품이 한 줄로, 다른 고객 건까지 함께 들어왔다). 그 표로 프로젝트를 만들면
    //    잘못된 프로젝트가 후보 목록에 영구히 남으므로, 나쁜 폴백은 없느니만 못하다.
    if (ctx.aiError) {
        _bcStatus('⚠️ ' + _t('AI 취합 실패 — ', 'AI consolidation failed — ') + ctx.aiError);
        document.getElementById('bc-body').innerHTML =
            '<div style="padding:18px; font-size:12.5px; color:#8a4b00; background:#fff8e6; border:1px solid #ffe08a; border-radius:8px; line-height:1.7;">'
            + '<b>' + _t('AI 취합이 실패해서 표를 만들지 않았습니다.', 'The table was not built because AI consolidation failed.') + '</b><br>'
            + _t('규칙만으로는 같은 고객사의 서로 다른 제품이 한 줄로 섞여, 잘못된 프로젝트가 만들어질 수 있습니다.',
                 'Rules alone merge different products of the same customer into one row, which would create wrong projects.') + '<br><br>'
            + '<code style="background:#fff; padding:3px 6px; border-radius:4px; display:inline-block; max-width:100%; overflow-wrap:break-word;">'
            + _bcEsc(ctx.aiError) + '</code><br><br>'
            + _t('AI 상태를 확인한 뒤 다시 열어주세요.', 'Check the AI status and reopen.') + '</div>';
        var _sum0 = document.getElementById('bc-summary');
        if (_sum0) _sum0.textContent = '';
        return;
    }
    _bcStatus(_t(
        '군집 ' + ctx.totalClusters + '개 중 ' + ctx.consideredClusters + '개(' + _BC_MIN_COUNT + '건 이상)를 취합 → ' + rows.length + '줄'
        + (ctx.ai ? ' · AI 취합 적용됨' : ' · ⚠️ AI 취합 실패 — 규칙 결과만'),
        ctx.totalClusters + ' clusters, ' + ctx.consideredClusters + ' considered → ' + rows.length + ' rows'
        + (ctx.ai ? ' · AI applied' : ' · ⚠️ AI failed, rules only')));

    var html = '<table style="width:100%; border-collapse:collapse; font-size:12px; background:#fff;">'
        + '<thead><tr style="background:#f1f3f5; text-align:left;">'
        // 💡 [2026-10-21] 헤더 체크박스로 전체 선택/해제 — 줄이 수십 개라 하나씩 누르면 못 쓴다.
        //    일부만 선택된 상태는 indeterminate(―)로 보여준다.
        + '<th style="padding:6px 8px; width:34px;"><input type="checkbox" id="bc-chk-all" title="'
        + _t('전체 선택 / 해제', 'Select / clear all') + '" style="cursor:pointer;"></th>'
        + '<th style="padding:6px 8px;">' + _t('고객사', 'Customer') + '</th>'
        + '<th style="padding:6px 8px;">' + _t('제품/모델명', 'Product / model') + '</th>'
        + '<th style="padding:6px 8px; width:60px; text-align:right;">' + _t('메일', 'Mails') + '</th>'
        + '<th style="padding:6px 8px; width:44px;">' + _t('확신', 'Conf.') + '</th>'
        + '<th style="padding:6px 8px;">' + _t('근거 / 포함된 군집', 'Reason / clusters') + '</th>'
        + '</tr></thead><tbody>';
    rows.forEach(function(r, i) {
        var bad = !r.isProject;
        // 기본 선택: 프로젝트는 확신 '상'만, 기각 줄은 기본 선택(큐를 비우는 게 목적)
        var checked = bad ? true : (r.confidence === '상' && r.customer && r.model);
        html += '<tr style="border-bottom:1px solid #f0f0f0; background:' + (bad ? '#fdf6f5' : '#fff') + ';">'
            + '<td style="padding:6px 8px;"><input type="checkbox" class="bc-chk" data-idx="' + i + '"' + (checked ? ' checked' : '') + '></td>'
            + '<td style="padding:6px 8px;">' + (bad ? '—' : '<input class="bc-cust" data-idx="' + i + '" value="' + _bcEsc(r.customer) + '" style="width:100%; box-sizing:border-box; padding:3px 5px; border:1px solid #ddd; border-radius:4px; font-size:11.5px;">') + '</td>'
            + '<td style="padding:6px 8px;">' + (bad ? '<b>' + _bcEsc(r.model) + '</b>' : '<input class="bc-model" data-idx="' + i + '" value="' + _bcEsc(r.model) + '" style="width:100%; box-sizing:border-box; padding:3px 5px; border:1px solid #ddd; border-radius:4px; font-size:11.5px;">') + '</td>'
            + '<td style="padding:6px 8px; text-align:right; font-weight:bold;">' + r.count + '</td>'
            + '<td style="padding:6px 8px; text-align:center;">' + _bcEsc(r.confidence) + '</td>'
            + '<td style="padding:6px 8px; color:#666; font-size:11px;">' + _bcEsc(r.reason)
            + '<div style="color:#aaa; margin-top:2px;">' + _bcEsc(r.keys.slice(0, 8).join(', ')) + (r.keys.length > 8 ? ' … +' + (r.keys.length - 8) : '') + '</div></td>'
            + '</tr>';
    });
    html += '</tbody></table>'
        + '<div style="margin-top:8px; font-size:11px; color:#888; line-height:1.6;">'
        + _t('· 고객사·모델명은 직접 고칠 수 있습니다 — 그 값이 파일명이 됩니다(고객사_모델).<br>'
          + '· 생성되는 프로젝트는 🟢 <b>MP(EC)(임시)</b>입니다. KTK PN·담당자는 🔵 DV 승격 때 입력하면 됩니다.<br>'
          + '· 붉은 줄(프로젝트 아님)은 생성하지 않고 큐에서만 기각합니다.',
            '· Customer/model are editable — they become the file name (customer_model).<br>'
          + '· Projects are created as 🟢 <b>MP(EC)</b> (draft). KTK PN / owner are required only when promoting to 🔵 DV.<br>'
          + '· Red rows are dismissed from the queue without creating anything.') + '</div>';
    document.getElementById('bc-body').innerHTML = html;
    _bcUpdateSummary();
    // 💡 위임 한 곳에서 처리 — 헤더 체크박스면 전체 토글, 아니면 요약만 갱신
    document.getElementById('bc-body').addEventListener('change', function(e) {
        if (e.target && e.target.id === 'bc-chk-all') {
            var on = e.target.checked;
            document.querySelectorAll('#bc-body .bc-chk').forEach(function(c) { c.checked = on; });
        }
        _bcUpdateSummary();
    });
}

/** 헤더 체크박스 상태를 개별 선택에 맞춘다 (전부/일부/없음) */
function _bcSyncHeaderCheckbox() {
    var all = document.querySelectorAll('#bc-body .bc-chk');
    var head = document.getElementById('bc-chk-all');
    if (!head || !all.length) return;
    var on = 0;
    all.forEach(function(c) { if (c.checked) on++; });
    head.checked = (on === all.length);
    head.indeterminate = (on > 0 && on < all.length);
}

function _bcSelected() {
    var ctx = window._bcCtx;
    if (!ctx) return [];
    var out = [];
    document.querySelectorAll('#bc-body .bc-chk').forEach(function(chk) {
        if (!chk.checked) return;
        var i = Number(chk.dataset.idx);
        var r = Object.assign({}, ctx.rows[i]);
        var cu = document.querySelector('#bc-body .bc-cust[data-idx="' + i + '"]');
        var mo = document.querySelector('#bc-body .bc-model[data-idx="' + i + '"]');
        if (cu) r.customer = cu.value.trim();
        if (mo) r.model = mo.value.trim();
        // 메일 키워드 씨앗 — 군집 키의 토큰을 그대로 넣어두면 다음 매칭부터 바로 쓰인다
        r.keywords = r.keys.join('|').split('|').filter(Boolean).slice(0, 12).join(', ');
        out.push(r);
    });
    return out;
}

function _bcUpdateSummary() {
    var sel = _bcSelected();
    var mk = sel.filter(function(r) { return r.isProject; });
    var rj = sel.filter(function(r) { return !r.isProject; });
    var keys = sel.reduce(function(s, r) { return s + r.keys.length; }, 0);
    _bcSyncHeaderCheckbox();
    var el = document.getElementById('bc-summary');
    if (el) el.textContent = _t(
        '생성 ' + mk.length + '개 · 기각 ' + rj.length + '줄 · 큐에서 비워질 군집 ' + keys + '개',
        'create ' + mk.length + ' · dismiss ' + rj.length + ' · clusters cleared ' + keys);
}

window._bcApplyClick = async function() {
    var ctx = window._bcCtx;
    if (!ctx) return;
    var sel = _bcSelected();
    var mk = sel.filter(function(r) { return r.isProject; });
    var bad = mk.filter(function(r) { return !r.customer || !r.model; });
    if (bad.length) {
        alert(_t('고객사와 제품/모델명이 둘 다 있어야 생성됩니다 — 비어 있는 줄 ' + bad.length + '개를 채우거나 선택을 해제하세요.',
                 'Customer and product/model are both required — fill in or deselect ' + bad.length + ' row(s).'));
        return;
    }
    if (!sel.length) return;
    // ⚠️ 확인은 여기 한 번뿐이다(기능의 취지). 그래서 무엇이 생기는지 전부 보여준다.
    var msg = _t('아래 ' + mk.length + '개 프로젝트를 🟢 MP(EC)(임시)로 생성하고, 선택한 군집을 큐에서 비웁니다.\n\n',
                 'Create the following ' + mk.length + ' project(s) as 🟢 MP(EC) (draft) and clear the selected clusters.\n\n')
        + mk.map(function(r) { return '· ' + r.customer + '_' + r.model + ' (' + r.count + _t('건', '') + ')'; }).join('\n')
        + _t('\n\n팀 공용 드라이브에 파일이 생성됩니다. 계속할까요?', '\n\nFiles will be created in the shared team Drive. Continue?');
    if (!confirm(msg)) return;

    var btn = document.getElementById('bc-apply-btn');
    if (btn) { btn.disabled = true; btn.textContent = _t('적용 중...', 'Applying...'); }
    try {
        var out = await window._bcApply(ctx, sel);
        var txt = _t('✅ 생성 ' + out.made.length + '개 · 기각 ' + out.rejected.length + '줄',
                     '✅ created ' + out.made.length + ' · dismissed ' + out.rejected.length);
        if (out.failed.length) txt += _t(' · ❌ 실패 ' + out.failed.length + '개', ' · ❌ failed ' + out.failed.length);
        // 표준 서식이 안 들어온 프로젝트는 조용히 넘기지 않는다 — 나중에 Customer SPEC 불러오기가 실패한다
        var _noTpl = out.made.filter(function(m) { return !m.tplOk; });
        if (_noTpl.length) txt += _t(' · ⚠️ 표준 서식 없음 ' + _noTpl.length + '개(참조 엑셀 미반영 — 해당 프로젝트에서 [📥 참조 엑셀 가져오기] 필요)',
                                     ' · ⚠️ ' + _noTpl.length + ' without the standard template (import the reference Excel there)');
        _bcStatus(txt);
        if (out.failed.length) console.warn('[백로그 취합] 생성 실패 목록:', out.failed);
        if (window.showToast) window.showToast(txt, out.failed.length ? 'warning' : 'info', 6000);
        if (window._ncdCheckAndSuggest) window._ncdCheckAndSuggest(); // 배너 갱신
        // 적용 후 다시 분석해서 남은 것만 보여준다
        var ctx2 = await window._bcAnalyze();
        window._bcCtx = ctx2;
        _bcRender(ctx2);
    } catch (e) {
        _bcStatus('❌ ' + String((e && e.message) || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = _t('선택 항목 적용', 'Apply selected'); }
    }
};

})();
