/* ============================================================================
   📅 js/62-period-summary.js — AI 요약 모달의 **일일 / 주간 / 월간 요약** (2026-11-08, 사용자 요청)

   "간트 관리가 소홀해서 완료·진행·대기·지연 숫자는 쓰지 말고, 메일 분석으로 쌓인 **상세내용**을
    토대로 사실에 입각한 요약을" — 그래서 이 모듈은:
     ① 상태 숫자 네 칸을 **숨긴다**(`PERIOD_SUMMARY.showCounts`, 화면·PPT 같은 스위치)
     ② 기간(오늘 / 이번 주 / 이번 달)에 든 **메일 유래 업무**를 골라 사실 목록을 만든다 — 날짜는
        `_mailRaw.date` → `[출처]` 날짜 → 시작일 순, 내용은 `[핵심내용]`/`[To do]`/`[문제점]`(js/59 `_mailContentParse`)
     ③ 사실 목록은 **AI 없이** 항상 그린다(날짜별, #G 번호 클릭 → 그 행으로)
     ④ AI 요약은 **사실 목록만** 주고 "목록에 없는 말 금지·문장마다 #G 근거" 를 요구한 뒤, 돌아온 문장 중
        **유효한 #G 를 하나도 안 단 문장은 버린다**(접지 검사). 버린 수를 화면에 적는다.
     ⑤ AI 문답에서 "주간 요약" 이라고 치면 같은 것을 글로 준다 → 텔레그램 다리(js/60)로 폰에서도 받는다.

   ⚠️ 기존 AI 요약(일정 현황: 지연·임박·리스크)은 지우지 않고 **"📊 일정 현황" 모드**로 남긴다 — 프롬프트
      편집·피드백·PPT 가 그 모드에 붙어 있다. 두 함수(`_renderAiProjectSummaryBody`·`generateAiProjectSummary`)를
      감싸서 모드에 따라 가른다(js/43 방식). 캐시는 `projectMeta.aiPeriodSummary[kind]`(프로젝트와 함께 저장).
   검증: tests/period-summary.browser.js (진짜 앱, AI 는 가짜) · node tests/period-summary.test.js
   ============================================================================ */
(function () {
    'use strict';

    window.PERIOD_SUMMARY = window.PERIOD_SUMMARY || {
        showCounts: false,                     // 완료/진행/대기/지연 네 칸 — 화면·PPT 공통
        periods: [{ id: 'day', ko: '일일', en: 'Daily' }, { id: 'week', ko: '주간', en: 'Weekly' }, { id: 'month', ko: '월간', en: 'Monthly' }],
        legacyId: 'legacy',
        defaultMode: 'week',
        modeKey: 'gantt_ps_mode',
        includeNonMail: false,                 // true 면 메일 유래가 아닌 업무(사람이 친 것)도 사실 목록에
        weekStartsMonday: true,
        maxFacts: 80,
        maxCore: 180, maxTodo: 140, maxIssue: 140,
        qaRe: /^\s*(일일|주간|월간|오늘|이번\s*주|이번\s*달|daily|weekly|monthly)\s*(업무\s*)?(요약|summary)\s*(해\s*줘|해줘|부탁해?|좀)?\s*$/i
    };
    var P = window.PERIOD_SUMMARY;
    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function mode() {
        try { var m = localStorage.getItem(P.modeKey); if (m) return m; } catch (e) { /* 아래 */ }
        return P.defaultMode;
    }
    window._psMode = mode;
    window._psSetMode = function (m) { try { localStorage.setItem(P.modeKey, m); } catch (e) { /* 무시 */ } if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody(); };

    // ── 기간 ────────────────────────────────────────────────────────────────────
    window._psRange = function (kind, base) {
        var b = base ? new Date(base) : new Date(); b.setHours(0, 0, 0, 0);
        var from = new Date(b), to = new Date(b), key, label;
        if (kind === 'day') { key = ymd(b); label = T('오늘 ' + ymd(b), 'Today ' + ymd(b)); }
        else if (kind === 'month') {
            from = new Date(b.getFullYear(), b.getMonth(), 1); to = new Date(b.getFullYear(), b.getMonth() + 1, 0);
            key = b.getFullYear() + '-' + pad(b.getMonth() + 1); label = T(key.replace('-', '년 ') + '월', key);
        } else {
            var dow = b.getDay(), back = P.weekStartsMonday ? (dow + 6) % 7 : dow;
            from = new Date(b); from.setDate(b.getDate() - back); to = new Date(from); to.setDate(from.getDate() + 6);
            key = ymd(from) + '~' + ymd(to); label = T('이번 주 ' + key, 'This week ' + key);
        }
        to.setHours(23, 59, 59, 999);
        return { kind: kind, from: from, to: to, key: key, label: label };
    };

    // ── 사실 목록 ───────────────────────────────────────────────────────────────
    function taskName(row) {
        if (!row) return '';
        var k = ['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'][row._level];
        var n = k ? (row[k] || '') : '';
        return String(n).replace(/\s*＊AI📧?\s*$/, '').trim();
    }
    function parseAnyDate(s) {
        var t = String(s || '').trim();
        if (!t) return null;
        var m = t.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        if (window.parseMailDateToYMD) { try { var y = window.parseMailDateToYMD(t); if (y) { var mm = y.match(/(\d{4})-(\d{2})-(\d{2})/); if (mm) return new Date(+mm[1], +mm[2] - 1, +mm[3]); } } catch (e) { /* 아래 */ } }
        var d = new Date(t); return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    /** 사실의 날짜 — 메일 발송일이 1순위(그 업무가 "언제 들어온 사실"인지), 없으면 [출처] 꼬리, 없으면 시작일. */
    window._psFactDate = function (row, content, ci) {
        var d = null;
        if (row && row._mailRaw && row._mailRaw.date) d = parseAnyDate(row._mailRaw.date);
        if (!d) {
            var src = String(content || '').match(/\[출처\][^\n]*?_((?:\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{4}[-./]\d{1,2}[-./]\d{1,2})[^_\n]*)_/);
            if (src) d = parseAnyDate(src[1]);
        }
        if (!d && row && row._calcStartTs) { var t = new Date(row._calcStartTs); d = new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
        if (!d && ci && ci.start != null && ci.start !== -1 && row) d = parseAnyDate(row[ci.start]);
        return d;
    };
    function cut(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    window._psCollectFacts = function (kind, base) {
        var R = window._psRange(kind, base);
        var gd = (typeof globalData !== 'undefined' && globalData) ? globalData : (window.globalData || []);
        var ci = window.colIdx || (typeof colIdx !== 'undefined' ? colIdx : {}) || {};
        var out = [];
        if (!Array.isArray(gd)) return { range: R, facts: out, scanned: 0 };
        var scanned = 0;
        for (var i = 1; i < gd.length; i++) {
            var row = gd[i]; if (!row || row._level === undefined) continue;
            var content = (ci.content != null && ci.content !== -1) ? String(row[ci.content] || '') : '';
            var p = window._mailContentParse ? window._mailContentParse(content) : { isMail: /\[출처\]|\[핵심내용\]/.test(content) };
            if (!p.isMail && !(P.includeNonMail && content.trim())) continue;
            scanned++;
            var d = window._psFactDate(row, content, ci);
            if (!d || d < R.from || d > R.to) continue;
            var people = window._extractMailSenderReceiver ? window._extractMailSenderReceiver(content) : { sender: p.from || '', receiver: p.to || '' };
            out.push({
                idx: i, date: ymd(d), task: taskName(row) || T('(제목 없음)', '(untitled)'),
                cat: String(row._담당구분 || '').trim(),
                status: (ci.status != null && ci.status !== -1) ? String(row[ci.status] || '').trim() : '',
                sender: people.sender || p.from || '', receiver: people.receiver || p.to || '',
                core: cut(p.core, P.maxCore), todo: cut(p.todo, P.maxTodo), issue: cut(p.issue, P.maxIssue), fix: cut(p.fix, P.maxIssue),
                answer: (ci.answer != null && ci.answer !== -1) ? cut(row[ci.answer], P.maxTodo) : ''
            });
        }
        out.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : a.idx - b.idx); });
        return { range: R, facts: out.slice(0, P.maxFacts), total: out.length, scanned: scanned };
    };

    // ── AI 프롬프트(사실만) + 접지 검사 ──────────────────────────────────────────
    window._psBuildPrompt = function (col) {
        var pm = window.projectMeta || {};
        var en = window._currentLang === 'en';
        var lines = col.facts.map(function (f) {
            var s = '- #G' + f.idx + ' [' + f.date + '] ' + f.task + (f.cat ? ' (' + f.cat + ')' : '');
            if (f.sender || f.receiver) s += ' | ' + (f.sender || '?') + ' → ' + (f.receiver || '?');
            if (f.core) s += ' | 핵심: ' + f.core;
            if (f.todo) s += ' | To do: ' + f.todo;
            if (f.issue) s += ' | 문제점: ' + f.issue;
            if (f.fix) s += ' | 대책: ' + f.fix;
            if (f.answer) s += ' | 대응: ' + f.answer;
            return s;
        }).join('\n');
        return (en
            ? 'You are summarizing a project\'s email-derived task log. Use ONLY the facts below. Do not add, infer, evaluate or predict anything that is not literally in the list. No counts or status statistics.'
            : '당신은 프로젝트의 메일 유래 업무 기록을 요약합니다. **아래 사실 목록에 있는 내용만** 쓰세요. 목록에 없는 정보·추정·평가·전망·일정 판단을 넣지 마세요. 완료/진행/지연 같은 집계 숫자도 쓰지 마세요.') +
            '\n\n[프로젝트] ' + (pm.고객사 || '') + ' ' + (pm.고객모델명 || pm.모델명 || '') + '\n[기간] ' + col.range.label + ' (사실 ' + col.facts.length + '건)\n\n[사실 목록]\n' + (lines || '(없음)') +
            '\n\n[규칙]\n- 문장마다 근거가 된 사실의 "#G숫자" 를 **반드시** 그대로 붙이세요(예: "… 요청받음 #G12"). 근거 번호 없는 문장은 버려집니다.\n' +
            '- 같은 업무의 여러 사실은 한 문장으로 묶어도 됩니다(번호를 모두 붙이세요).\n- 사람 이름·모델명·수치는 목록의 표기 그대로.\n- 각 배열 최대 8개. 해당 없으면 빈 배열 [].\n' +
            (en ? '- Write the sentence VALUES in English (keep #G numbers as they are).\n' : '') +
            '\n다음 JSON 으로만 답하세요:\n{\n  "요약": ["이 기간에 무엇이 들어왔고 무엇이 진행됐는지 사실 문장 #G.."],\n  "요청·결정": ["누가 무엇을 요청/결정/회신했는지 #G.."],\n  "미해결": ["문제점·대책이 적힌 것 중 아직 답이 없는 것 #G.."]\n}';
    };
    /** AI 문장 중 사실 목록에 **있는** #G 를 하나도 안 단 문장은 버린다. */
    window._psGround = function (arr, facts) {
        var ok = {}; (facts || []).forEach(function (f) { ok[f.idx] = 1; });
        var kept = [], dropped = 0;
        (Array.isArray(arr) ? arr : []).forEach(function (s) {
            var refs = String(s || '').match(/#G(\d+)/g) || [];
            var good = refs.some(function (r) { return ok[+r.slice(2)]; });
            if (good) kept.push(String(s)); else dropped++;
        });
        return { kept: kept, dropped: dropped };
    };

    window.generatePeriodSummary = async function (kind) {
        kind = kind || mode();
        var key = window.getActiveAiKey ? window.getActiveAiKey() : null;
        if (!key) { alert(T('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.', 'Please set your AI API key first.')); return null; }
        var col = window._psCollectFacts(kind);
        if (!col.facts.length) { if (window.showToast) window.showToast(T('이 기간에 메일 분석으로 들어온 업무가 없습니다 — 요약할 사실이 없습니다.', 'No mail-derived tasks in this period — nothing to summarize.'), 'info'); return null; }
        var btn = document.getElementById('ai-summary-generate-btn');
        if (btn) { btn.disabled = true; btn.textContent = T('⏳ 생성 중...', '⏳ Generating...'); }
        try {
            var res = await window.callAiBackend(key, window._psBuildPrompt(col), { feature: 'period-summary' });
            if (!res || !res.ok) throw (res && res.error) || new Error(T('알 수 없는 오류', 'Unknown error'));
            var text = (res.data && res.data.result && res.data.result.candidates && res.data.result.candidates[0] && res.data.result.candidates[0].content && res.data.result.candidates[0].content.parts && res.data.result.candidates[0].content.parts[0] && res.data.result.candidates[0].content.parts[0].text) || '';
            var m = String(text).replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
            if (!m) throw new Error(T('AI 응답에서 JSON 을 찾지 못했습니다.', 'No JSON in the AI response.'));
            var j = JSON.parse(m[0]);
            var g1 = window._psGround(j['요약'], col.facts), g2 = window._psGround(j['요청·결정'] || j['요청/결정'] || j['결정'], col.facts), g3 = window._psGround(j['미해결'], col.facts);
            window.projectMeta = window.projectMeta || {};
            window.projectMeta.aiPeriodSummary = window.projectMeta.aiPeriodSummary || {};
            window.projectMeta.aiPeriodSummary[kind] = {
                rangeKey: col.range.key, at: new Date().toISOString(), factCount: col.facts.length,
                요약: g1.kept, 요청결정: g2.kept, 미해결: g3.kept, dropped: g1.dropped + g2.dropped + g3.dropped
            };
            if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
            if (window.showToast) window.showToast(T('🤖 ' + col.range.label + ' 요약을 만들었습니다', '🤖 Summary generated') + (window.projectMeta.aiPeriodSummary[kind].dropped ? T(' (근거 없는 문장 ' + window.projectMeta.aiPeriodSummary[kind].dropped + '개 제거)', ' (' + window.projectMeta.aiPeriodSummary[kind].dropped + ' ungrounded sentence(s) removed)') : ''), 'info');
            return window.projectMeta.aiPeriodSummary[kind];
        } catch (e) {
            alert(T('⚠️ 요약 생성 실패: ', '⚠️ Summary failed: ') + (e && e.message ? e.message : e));
            return null;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = T('🤖 AI 요약 생성', '🤖 Generate AI summary'); }
        }
    };

    // ── 글(마크다운) — AI 문답·텔레그램용 ─────────────────────────────────────────
    window.periodSummaryText = function (kind, col) {
        kind = kind || mode();
        col = col || window._psCollectFacts(kind);
        var pm = window.projectMeta || {};
        var cache = ((pm.aiPeriodSummary || {})[kind]);
        var L = ['📅 **' + col.range.label + ' ' + T('업무 요약', 'summary') + '** — ' + (pm.고객사 || '') + ' ' + (pm.고객모델명 || pm.모델명 || '') + ' (' + T('메일 유래 업무 ', 'mail-derived tasks: ') + col.facts.length + T('건', '') + ')'];
        if (cache && cache.rangeKey === col.range.key) {
            var sec = function (title, arr) { if (arr && arr.length) { L.push('', '**' + title + '**'); arr.forEach(function (s) { L.push('- ' + s); }); } };
            sec(T('요약', 'Summary'), cache.요약); sec(T('요청·결정', 'Requests / decisions'), cache.요청결정); sec(T('미해결', 'Open issues'), cache.미해결);
            if (cache.dropped) L.push('', '_' + T('근거 없는 문장 ' + cache.dropped + '개는 제거됨', cache.dropped + ' ungrounded sentence(s) removed') + '_');
        } else {
            L.push('', '_' + T('AI 요약은 아직 없습니다 — 아래는 사실 목록입니다.', 'No AI summary yet — facts below.') + '_');
        }
        var byDate = {};
        col.facts.forEach(function (f) { (byDate[f.date] = byDate[f.date] || []).push(f); });
        Object.keys(byDate).sort().reverse().forEach(function (d) {
            L.push('', '**' + d + '**');
            byDate[d].forEach(function (f) {
                var s = '- #G' + f.idx + ' ' + f.task + (f.cat ? ' (' + f.cat + ')' : '') + (f.sender ? ' · ' + f.sender + (f.receiver ? '→' + f.receiver : '') : '');
                if (f.core) s += '\n  · ' + f.core;
                if (f.todo) s += '\n  · To do: ' + f.todo;
                if (f.issue) s += '\n  · ⚠️ ' + f.issue + (f.fix ? ' → ' + f.fix : '');
                L.push(s);
            });
        });
        if (col.total > col.facts.length) L.push('', T('… 외 ' + (col.total - col.facts.length) + '건', '… and ' + (col.total - col.facts.length) + ' more'));
        return L.join('\n');
    };

    // ── 화면 ───────────────────────────────────────────────────────────────────
    function toolbarHtml(cur) {
        var en = window._currentLang === 'en';
        var btn = function (id, label, on) {
            return '<button onclick="window._psSetMode(\'' + id + '\')" style="padding:4px 12px; border:1px solid ' + (on ? '#1971c2' : '#cfd8e3') + '; background:' + (on ? '#1971c2' : '#fff') + '; color:' + (on ? '#fff' : '#2c5f8a') + '; border-radius:14px; font-size:12px; font-weight:bold; cursor:pointer;">' + esc(label) + '</button>';
        };
        var b = P.periods.map(function (p) { return btn(p.id, en ? p.en : p.ko, cur === p.id); }).join('');
        b += '<span style="flex:1"></span>' + btn(P.legacyId, en ? '📊 Schedule view' : '📊 일정 현황', cur === P.legacyId);
        return '<div id="ps-period-toolbar" style="display:flex; gap:6px; align-items:center; margin-bottom:12px; flex-wrap:wrap;">' + b + '</div>';
    }
    function link(idx) {
        return window._linkifyTaskRefs ? window._linkifyTaskRefs(esc('#G' + idx)) : esc('#G' + idx);
    }
    function renderPeriod(body, kind) {
        var col = window._psCollectFacts(kind);
        var pm = window.projectMeta || {};
        var cache = (pm.aiPeriodSummary || {})[kind];
        var fresh = cache && cache.rangeKey === col.range.key;
        var h = [];
        h.push('<div id="ai-summary-report-content">');
        h.push('<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;"><div style="font-size:13.5px; font-weight:bold; color:#2c5f8a;">📅 ' + esc(col.range.label) + '</div>' +
               '<div style="font-size:11.5px; color:#777;">' + esc(T('메일 유래 업무 ' + col.facts.length + '건' + (col.total > col.facts.length ? ' (표시 상한 ' + col.facts.length + ')' : '') + ' · 전체 메일 업무 ' + col.scanned + '건 중', col.facts.length + ' mail-derived tasks of ' + col.scanned)) + '</div></div>');
        if (fresh) {
            var li = function (s) { var c = esc(s); return '<li style="margin-bottom:4px;">' + (window._linkifyTaskRefs ? window._linkifyTaskRefs(c) : c) + '</li>'; };
            var sec = function (icon, title, arr) { if (!arr || !arr.length) return ''; return '<div style="margin-bottom:10px;"><div style="font-size:12.5px; font-weight:bold; color:#2c5f8a; margin-bottom:4px;">' + icon + ' ' + esc(title) + '</div><ul style="margin:0; padding-left:18px; font-size:12.5px;">' + arr.map(li).join('') + '</ul></div>'; };
            h.push('<div style="padding:12px 14px; background:#f3f8ff; border:1px solid #d6e6fb; border-radius:8px; margin-bottom:14px;">' +
                   '<div style="font-size:11px; color:#999; margin-bottom:8px;">🤖 ' + esc(T('AI 요약 · 사실 목록 ' + cache.factCount + '건만으로 · ', 'AI summary from ' + cache.factCount + ' facts · ') + String(cache.at).replace('T', ' ').slice(0, 16)) + (cache.dropped ? ' · ' + esc(T('근거 없는 문장 ' + cache.dropped + '개 제거', cache.dropped + ' ungrounded removed')) : '') + '</div>' +
                   sec('📝', T('요약', 'Summary'), cache.요약) + sec('📨', T('요청·결정', 'Requests / decisions'), cache.요청결정) + sec('⚠️', T('미해결', 'Open issues'), cache.미해결) +
                   ((!cache.요약.length && !cache.요청결정.length && !cache.미해결.length) ? '<div style="font-size:12px; color:#999;">' + esc(T('근거 있는 문장이 없었습니다 — 사실 목록을 직접 보세요.', 'No grounded sentences — see the facts below.')) + '</div>' : '') +
                   '</div>');
        } else {
            h.push('<div style="padding:10px 14px; background:#fafafa; border:1px dashed #ddd; border-radius:8px; margin-bottom:14px; font-size:12px; color:#777;">' +
                   esc(T('AI 요약은 아래 [🤖 AI 요약 생성] 을 누르면 이 기간의 사실 목록만으로 만듭니다(목록 밖의 말은 버립니다). 아래 사실 목록은 AI 없이 그린 것입니다.', 'Press [🤖 Generate AI summary] to summarize only the facts below (ungrounded sentences are dropped). The fact list needs no AI.')) + '</div>');
        }
        if (!col.facts.length) {
            h.push('<div style="padding:24px 10px; text-align:center; color:#999; font-size:12px;">' + esc(T('이 기간에 메일 분석으로 들어온 업무가 없습니다.', 'No mail-derived tasks in this period.')) + (P.includeNonMail ? '' : '<br>' + esc(T('(사람이 직접 적은 업무는 세지 않습니다 — PERIOD_SUMMARY.includeNonMail)', '(hand-typed tasks are not counted)'))) + '</div>');
        } else {
            var byDate = {};
            col.facts.forEach(function (f) { (byDate[f.date] = byDate[f.date] || []).push(f); });
            Object.keys(byDate).sort().reverse().forEach(function (d) {
                h.push('<div style="font-size:12px; font-weight:bold; color:#555; margin:10px 0 4px; border-bottom:1px solid #eee; padding-bottom:2px;">' + esc(d) + ' <span style="font-weight:normal; color:#999;">(' + byDate[d].length + ')</span></div>');
                byDate[d].forEach(function (f) {
                    h.push('<div style="font-size:12px; padding:6px 8px; margin-bottom:4px; background:#fff; border:1px solid #eef1f4; border-radius:6px;">' +
                           '<div>' + link(f.idx) + ' <b>' + esc(f.task) + '</b>' + (f.cat ? ' <span style="font-size:10.5px; padding:1px 6px; border-radius:8px; background:#eef3f7; color:#2c5f8a;">' + esc(f.cat) + '</span>' : '') +
                           ((f.sender || f.receiver) ? ' <span style="color:#888;">' + esc(f.sender || '?') + ' → ' + esc(f.receiver || '?') + '</span>' : '') + '</div>' +
                           (f.core ? '<div style="color:#333; margin-top:2px;">' + esc(f.core) + '</div>' : '') +
                           (f.todo ? '<div style="color:#1971c2; margin-top:2px;">To do: ' + esc(f.todo) + '</div>' : '') +
                           (f.issue ? '<div style="color:#b1432f; margin-top:2px;">⚠️ ' + esc(f.issue) + (f.fix ? ' → ' + esc(f.fix) : '') + '</div>' : '') +
                           (f.answer ? '<div style="color:#2f9e44; margin-top:2px;">↩ ' + esc(f.answer) + '</div>' : '') +
                           '</div>');
                });
            });
        }
        h.push('</div>');
        body.innerHTML = toolbarHtml(kind) + h.join('');
    }
    function setGenerateLabel(cur) {
        var btn = document.getElementById('ai-summary-generate-btn');
        if (!btn || btn.disabled) return;
        btn.textContent = cur === P.legacyId ? T('🔄 다시 생성', '🔄 Regenerate') : T('🤖 AI 요약 생성', '🤖 Generate AI summary');
    }

    function wrapRender() {
        var orig = window._renderAiProjectSummaryBody;
        if (typeof orig !== 'function' || orig._psWrapped) return false;
        window._renderAiProjectSummaryBody = function () {
            var body = document.getElementById('ai-summary-body');
            var cur = mode();
            if (!body) return orig.apply(this, arguments);
            if (cur !== P.legacyId) { try { renderPeriod(body, cur); setGenerateLabel(cur); return; } catch (e) { console.warn('[기간 요약] 렌더 실패 — 일정 현황으로:', e.message); } }
            var r = orig.apply(this, arguments);
            // 숫자 네 칸 숨기기 + 모드 툴바
            try {
                if (P.showCounts === false) {
                    body.querySelectorAll('#ai-summary-report-content > div').forEach(function (d) {
                        if (/repeat\(4,\s*1fr\)/.test(d.getAttribute('style') || '')) d.remove();
                    });
                }
                body.insertAdjacentHTML('afterbegin', toolbarHtml(P.legacyId));
            } catch (e) { /* 화면 손질 실패는 치명적이지 않다 */ }
            setGenerateLabel(P.legacyId);
            return r;
        };
        window._renderAiProjectSummaryBody._psWrapped = true;
        return true;
    }
    function wrapGenerate() {
        var orig = window.generateAiProjectSummary;
        if (typeof orig !== 'function' || orig._psWrapped) return false;
        window.generateAiProjectSummary = async function () {
            var cur = mode();
            if (cur !== P.legacyId) return window.generatePeriodSummary(cur);
            return orig.apply(this, arguments);
        };
        window.generateAiProjectSummary._psWrapped = true;
        return true;
    }
    // AI 문답 "주간 요약" — 입구를 감싸 로컬(AI 선택)로 처리한다(js/33 과 같은 자리). 텔레그램 다리도 이 입구를 지난다.
    function wrapQa() {
        var orig = window.sendGanttQaMessage;
        if (typeof orig !== 'function' || orig._psWrapped) return false;
        window.sendGanttQaMessage = async function () {
            var input = document.getElementById('gantt-qa-input');
            var q = input ? input.value.trim() : '';
            var m = q.match(P.qaRe);
            if (!m) return orig.apply(this, arguments);
            var kind = /일일|오늘|daily/i.test(m[1]) ? 'day' : (/월간|이번\s*달|monthly/i.test(m[1]) ? 'month' : 'week');
            var H = window._ganttQaHistory = window._ganttQaHistory || [];
            if (window._ganttQaRecordQuestionFreq) { try { window._ganttQaRecordQuestionFreq(q); } catch (e) { /* 무시 */ } }
            input.value = '';
            H.push({ role: 'user', text: q });
            var pend = { role: 'ai', pending: true, text: '⏳ ' + T('기간 요약을 만드는 중…', 'Building the period summary…') };
            H.push(pend); if (window._renderGanttQaMessages) window._renderGanttQaMessages();
            var txt;
            try {
                var col = window._psCollectFacts(kind);
                var cache = ((window.projectMeta || {}).aiPeriodSummary || {})[kind];
                if (col.facts.length && window.getActiveAiKey && window.getActiveAiKey() && !(cache && cache.rangeKey === col.range.key)) {
                    await window.generatePeriodSummary(kind);
                }
                txt = window.periodSummaryText(kind, col);
            } catch (e) { txt = '⚠️ ' + T('기간 요약 실패: ', 'Period summary failed: ') + e.message; }
            var at = H.indexOf(pend); if (at >= 0) H.splice(at, 1);
            H.push({ role: 'ai', text: txt });
            if (window._renderGanttQaMessages) window._renderGanttQaMessages();
            if (input) input.focus();
        };
        window.sendGanttQaMessage._psWrapped = true;
        return true;
    }
    window._periodSummaryInstall = function () { return { render: wrapRender(), generate: wrapGenerate(), qa: wrapQa() }; };
    (function install(tries) {
        window._periodSummaryInstall();
        var done = window._renderAiProjectSummaryBody && window._renderAiProjectSummaryBody._psWrapped && window.generateAiProjectSummary && window.generateAiProjectSummary._psWrapped && window.sendGanttQaMessage && window.sendGanttQaMessage._psWrapped;
        if (!done && tries < 20 && typeof setTimeout === 'function') setTimeout(function () { install(tries + 1); }, 500);
    })(0);
    try {
        if (window.STORAGE_REGISTRY && !window.STORAGE_REGISTRY.some(function (r) { return r.key === P.modeKey; })) {
            window.STORAGE_REGISTRY.push({ key: P.modeKey, label: 'AI 요약 모달 마지막 모드', labelEn: 'AI summary last mode', cls: 'setting', strategy: { type: 'keep' } });
        }
    } catch (e) { /* 레지스트리 없음 */ }
})();
