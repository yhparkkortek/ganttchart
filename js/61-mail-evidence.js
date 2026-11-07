/* ============================================================================
   📎 js/61-mail-evidence.js — 메일 → 프로젝트 배분의 **결정론 근거층** (2026-11-08, 사용자 요청
   "오배송·구분못함 대기 메일이 많다 — 적확하게 분석해서 안전하게 배분")

   지금까지 배분은 AI 한 명이 판정했다(js/15c `_msBuildProjectMatchSection` → 매칭신뢰도 상/중/하,
   js/15b `_msResolveAiProjectMatch` 가 상만 자동배치). 힌트(키워드·관리번호·토픽)는 있었지만
   **이 앱이 이미 알고 있는 사실**은 안 쓰고 있었다:
     ① 같은 제목의 스레드(Re:/Fw:)가 이미 어느 프로젝트로 배분됐는가
     ② 이 발신자의 최근 메일이 어느 프로젝트로 갔는가
     ③ 관리번호·모델 코드가 어느 후보의 키워드와 **정확히** 맞는가(띄어쓰기·하이픈 무시)
   이 셋은 AI 추론이 아니라 **기록·대조**다. 그래서 여기서 계산해 세 군데에 쓴다:
     (a) AI 프롬프트에 "📎 결정론 근거" 로 **보여 준다**(AI 가 맨손으로 시작하지 않게)
     (b) AI 가 "상" 으로 골랐는데 근거가 **다른** 프로젝트를 가리키면 → 자동배치를 막고 대기로(오배송 방지)
     (c) AI 가 "중"/0 인데 근거가 **한 프로젝트**를 가리키면 → 승격(중→자동배치) / 제안(0→대기 후보)
   (b)(c) 의 문턱은 전부 `MAIL_EVIDENCE_POLICY`(데이터).

   ⚠️ 기존 함수를 베끼지 않고 **감싼다**(`_msBuildProjectMatchSection`·`_msResolveAiProjectMatch`) —
      ms/mf/자동틱/재분석 네 경로가 전부 그 두 함수를 지나므로 한 곳에서 다 잡힌다(js/43 방식).
   ⚠️ 기록은 `_tpAppendMailSignal` **한 곳만** 감싼다 — docs/doc-store.md 가 정한 "확정 배분의 훅".
      자동배치·재분석 확정·사람 배분이 전부 거기를 지난다.
   ⚠️ 사람이 되돌린 것(재배치·오매칭 삭제)은 그 스레드의 옛 기록을 **지운다** — 틀린 기록이 근거가 되면
      오배송이 **학습**된다.
   ⚠️ 근거가 서로 다투면(두 프로젝트에 강한 근거) 아무것도 승격하지 않는다 — 대기(사람).
   끄기: localStorage `gantt_mail_evidence_off='1'`. 검증: node tests/mail-evidence.test.js
   ============================================================================ */
(function () {
    'use strict';

    window.MAIL_EVIDENCE_POLICY = window.MAIL_EVIDENCE_POLICY || {
        offKey: 'gantt_mail_evidence_off',
        historyKey: 'gantt_mail_route_history_v1',
        statsKey: 'gantt_mail_evidence_stats_v1',
        historyMax: 2000,
        historyDays: 240,
        internalDomains: ['kortek.co.kr'],
        tokenMinLen: 5,          // 영숫자·한글만 남긴 뒤 이 길이 이상인 키워드만 "정확 일치" 근거로
        tokenMaxHits: 2,         // 후보 3개 이상에 걸리는 토큰은 공용어 — 근거 아님
        threadMin: 1,            // 같은 제목 스레드가 이만큼 이미 배분돼 있으면 강한 근거
        senderMin: 4,            // 발신자 기록이 이 건수 이상이고
        senderShare: 0.85,       //   그중 이 비율 이상이 한 프로젝트면 강한 근거(사내 발신자는 제외)
        promote: true,           // AI "중" → 근거 일치 시 자동배치 승격
        downgrade: true,         // AI "상" → 근거 충돌 시 대기로 내림
        suggest: true,           // AI 0 → 근거 한 곳이면 그 후보로 대기
        sweepDelayMs: 40000,     // 켠 뒤 이만큼 지나 미분류 큐를 한 번 훑는다(AI 없음)
        maxLines: 6
    };
    var P = window.MAIL_EVIDENCE_POLICY;

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function isOff() { try { return localStorage.getItem(P.offKey) === '1'; } catch (e) { return false; } }
    function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 꽉 참 — 닥터가 정리 */ } }

    // ── 정규화 ────────────────────────────────────────────────────────────────
    /** Re:/Fw:/답장:/전달: 류 접두어(반복·[n]·괄호)를 떼고 공백을 눕힌 제목. 너무 짧으면 ''. */
    function normSubject(s) {
        var t = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        var re = /^(?:\(?(?:re|fw|fwd|aw|wg|tr|sv|답장|회신|전달|참조)\s*(?:\[\d+\]|\(\d+\)|\^\d+)?\s*[:：]\s*\)?)+/i;
        var prev;
        do { prev = t; t = t.replace(re, '').trim(); } while (t !== prev);
        t = t.replace(/^\[\s*(?:외부|external|spam|광고)\s*\]\s*/i, '').trim();
        return t.length >= 4 ? t : '';
    }
    function senderEmail(s) {
        if (window._msParseSenderEmail) { try { var e = window._msParseSenderEmail(s); if (e) return String(e).toLowerCase(); } catch (er) { /* 아래 */ } }
        var m = String(s || '').match(/[\w.+-]+@[\w.-]+\.\w+/);
        return m ? m[0].toLowerCase() : '';
    }
    function isInternal(email) {
        var d = String(email || '').split('@')[1] || '';
        return !!d && (P.internalDomains || []).some(function (x) { return d === x || d.endsWith('.' + x); });
    }
    function normToken(s) { return String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, ''); }
    window._meNormSubject = normSubject;
    window._meNormToken = normToken;

    // ── 📜 배분 기록 — {subj, from, fid, fname, how, at} ──────────────────────
    function loadHist() { var a = lsGet(P.historyKey, []); return Array.isArray(a) ? a : []; }
    function saveHist(a) {
        var cut = Date.now() - P.historyDays * 86400000;
        a = a.filter(function (h) { return h && Date.parse(h.at || 0) >= cut; });
        if (a.length > P.historyMax) a = a.slice(a.length - P.historyMax);
        lsSet(P.historyKey, a);
    }
    /** 확정 배분 1건을 적는다. 같은 메일(fileName)·같은 프로젝트는 한 번만. */
    window.mailEvidenceRecord = function (fid, fname, mailRaw, how) {
        if (!fid && !fname) return false;
        var subj = normSubject(mailRaw && mailRaw.subject), from = senderEmail(mailRaw && mailRaw.sender);
        if (!subj && !from) return false;
        var a = loadHist(), key = String((mailRaw && mailRaw.fileName) || '') ;
        if (key && a.some(function (h) { return h.key === key && (h.fid === fid || h.fname === fname); })) return false;
        a.push({ key: key, subj: subj, from: from, fid: fid || '', fname: fname || '', how: how || 'auto', at: new Date().toISOString() });
        saveHist(a);
        scheduleSweep();
        return true;
    };
    /** 사람이 "그 프로젝트가 아니다" 라고 한 것 — 그 스레드·그 메일의 기록을 지운다(틀린 근거가 학습되지 않게). */
    window.mailEvidenceForget = function (fid, mailRaw) {
        var subj = normSubject(mailRaw && mailRaw.subject), key = String((mailRaw && mailRaw.fileName) || '');
        var a = loadHist(), n = a.length;
        a = a.filter(function (h) { return !((h.fid === fid || !fid) && ((key && h.key === key) || (subj && h.subj === subj))); });
        if (a.length !== n) saveHist(a);
        return n - a.length;
    };
    window._mailEvidenceHistory = loadHist;

    // ── 📎 근거 계산 ──────────────────────────────────────────────────────────
    /**
     * @param mail {subject, sender, body}  @param cands project_index 항목 배열(프롬프트 번호 순서 그대로)
     * @returns {per:[{thread,sender,senderTotal,senderShare,codes,tokens,strong,score,lines}], strongIdx:[], best, text}
     */
    window.mailEvidenceFor = function (mail, cands) {
        cands = cands || [];
        var subj = normSubject(mail && mail.subject), from = senderEmail(mail && mail.sender);
        var hay = String((mail && mail.subject) || '') + '\n' + String((mail && mail.body) || '');
        var hayNorm = normToken(hay);
        var hist = loadHist();
        var byFid = function (h, c) { return (h.fid && h.fid === c.drive_file_id) || (h.fname && h.fname === c.file_name); };
        var threadHist = subj ? hist.filter(function (h) { return h.subj === subj; }) : [];
        var senderHist = (from && !isInternal(from)) ? hist.filter(function (h) { return h.from === from; }) : [];
        var codes = window._msExtractCodeTokens ? window._msExtractCodeTokens(hay) : [];
        // 토큰 적중 — 공용어(여러 후보에 걸리는 것)는 먼저 센다
        var tokHits = cands.map(function (c) {
            return (c.keywords || []).map(String).filter(function (kw) {
                var n = normToken(kw); return n.length >= P.tokenMinLen && hayNorm.indexOf(n) !== -1;
            });
        });
        var tokCount = {};
        tokHits.forEach(function (list) { list.forEach(function (kw) { var n = normToken(kw); tokCount[n] = (tokCount[n] || 0) + 1; }); });
        var per = cands.map(function (c, i) {
            var th = threadHist.filter(function (h) { return byFid(h, c); }).length;
            var sd = senderHist.filter(function (h) { return byFid(h, c); }).length;
            var share = senderHist.length ? sd / senderHist.length : 0;
            var senderStrong = senderHist.length >= P.senderMin && share >= P.senderShare && sd > 0;
            var cd = codes.filter(function (code) { return (c.keywords || []).some(function (k) { return String(k).indexOf(code) !== -1; }); });
            var tk = tokHits[i].filter(function (kw) { return tokCount[normToken(kw)] <= P.tokenMaxHits; });
            var strong = th >= P.threadMin || cd.length > 0 || senderStrong;
            var score = th * 3 + cd.length * 3 + Math.min(tk.length, 3) + (senderStrong ? 2 : 0);
            var lines = [];
            if (th) lines.push(T('같은 제목 스레드 ' + th + '건이 이미 이 프로젝트로 배분됨', 'same-subject thread already routed here ×' + th));
            if (cd.length) lines.push(T('관리번호 #' + cd.join(', #') + ' 가 이 프로젝트 키워드에 등록됨', 'control no. #' + cd.join(', #') + ' registered here'));
            if (senderStrong) lines.push(T('발신자 ' + from + ' 의 최근 ' + senderHist.length + '건 중 ' + sd + '건이 이 프로젝트', 'sender ' + from + ': ' + sd + '/' + senderHist.length + ' recent mails here'));
            else if (sd) lines.push(T('발신자 기록 ' + sd + '/' + senderHist.length + '건(약함)', 'sender history ' + sd + '/' + senderHist.length + ' (weak)'));
            if (tk.length) lines.push(T('본문에 고유 키워드 일치: ' + tk.slice(0, 3).join(', '), 'exact keyword hit: ' + tk.slice(0, 3).join(', ')));
            return { i: i, thread: th, sender: sd, senderTotal: senderHist.length, senderShare: share, senderStrong: senderStrong,
                     codes: cd, tokens: tk, strong: strong, score: score, lines: lines };
        });
        var strongIdx = per.filter(function (e) { return e.strong; }).map(function (e) { return e.i; });
        var best = per.slice().sort(function (a, b) { return b.score - a.score; })[0] || null;
        if (best && !best.score) best = null;
        var textLines = per.filter(function (e) { return e.lines.length; })
            .sort(function (a, b) { return b.score - a.score; }).slice(0, P.maxLines)
            .map(function (e) { var c = cands[e.i]; return '- ' + (e.i + 1) + '번(' + (c.model || c.customer || c.file_name) + '): ' + e.lines.join(' · '); });
        var text = textLines.length
            ? '\n📎 [결정론 근거 — 이 앱의 과거 배분 기록·코드 대조, AI 추론이 아닙니다]\n' + textLines.join('\n') +
              '\n  스레드 기록·관리번호 일치는 강한 근거입니다 — 본문이 명백히 다른 얘기가 아니면 그 후보를 고르고 신뢰도를 올리세요. 서로 다른 후보에 강한 근거가 갈리면 0으로 두고 매칭근거에 그 사실을 적으세요.\n'
            : '';
        return { per: per, strongIdx: strongIdx, best: best, text: text, subj: subj, from: from };
    };

    // ── 📊 집계 ───────────────────────────────────────────────────────────────
    function bump(k, extra) {
        var s = lsGet(P.statsKey, {});
        s[k] = (s[k] || 0) + 1; s.at = new Date().toISOString();
        if (extra) { s.last = s.last || []; s.last.unshift(Object.assign({ k: k, at: s.at }, extra)); s.last = s.last.slice(0, 30); }
        lsSet(P.statsKey, s);
    }
    window.mailEvidenceStats = function () { return lsGet(P.statsKey, {}); };

    // ── (a) 프롬프트에 근거 싣기 + (b)(c) 판정 보정 — 두 함수를 감싼다 ───────────
    var _last = null;      // {cands, ev, at} — 같은 후보 배열(참조)로 들어온 판정에만 쓴다
    function wrapBuild() {
        var orig = window._msBuildProjectMatchSection;
        if (typeof orig !== 'function' || orig._meWrapped) return false;
        window._msBuildProjectMatchSection = function (cands, mailText, hint) {
            var out = orig.apply(this, arguments);
            if (isOff() || !cands || !cands.length) { _last = null; return out; }
            try {
                var raw = window._mailParsedRaw || {};
                var lines = String(mailText || '').split('\n');
                var mail = { subject: raw.subject || lines[0] || '', sender: raw.sender || lines[1] || '', body: mailText || '' };
                var ev = window.mailEvidenceFor(mail, cands);
                _last = { cands: cands, ev: ev, at: Date.now() };
                return out + ev.text;
            } catch (e) { console.warn('[메일 근거] 계산 실패(원본 프롬프트 그대로):', e.message); _last = null; return out; }
        };
        window._msBuildProjectMatchSection._meWrapped = true;
        return true;
    }
    function wrapResolve() {
        var orig = window._msResolveAiProjectMatch;
        if (typeof orig !== 'function' || orig._meWrapped) return false;
        window._msResolveAiProjectMatch = function (task, cands) {
            var tag = orig.apply(this, arguments);
            if (isOff() || !cands || !cands.length) return tag;
            var L = _last;
            if (!L || L.cands !== cands || Date.now() - L.at > 10 * 60000) return tag;   // 다른 메일의 근거를 섞지 않는다
            try { return window.mailEvidenceAdjust(tag, L.ev, cands, task); }
            catch (e) { console.warn('[메일 근거] 보정 실패(AI 판정 그대로):', e.message); return tag; }
        };
        window._msResolveAiProjectMatch._meWrapped = true;
        return true;
    }

    /** 순수 함수 — 하네스가 직접 두드린다. tag(AI 판정) + ev(근거) → 보정된 tag. */
    window.mailEvidenceAdjust = function (tag, ev, cands, task) {
        var strong = ev.strongIdx || [];
        var idxOf = function (c) { return cands.indexOf(c); };
        var note = function (i) { return (ev.per[i].lines || []).join(' · '); };
        if (tag && tag.multi) { bump('multi'); return tag; }

        // (b) AI "상" 인데 근거가 다른 후보를 가리킨다 → 대기(오배송 방지)
        if (tag && tag.status === 'matched' && P.downgrade) {
            var pi = idxOf(tag.candidates[0]);
            var others = strong.filter(function (i) { return i !== pi; });
            var mineWeak = pi < 0 || (!ev.per[pi].strong && !ev.per[pi].tokens.length);
            if (others.length && mineWeak) {
                var extra = others.slice(0, 2).map(function (i) { return cands[i]; });
                bump('conflict', { ai: tag.candidates[0].file_name, ev: extra.map(function (c) { return c.file_name; }) });
                try { if (window._issueLog) window._issueLog({ domain: 'mail', kind: 'evidence_conflict', rid: '', route: '', params: { ai: tag.candidates[0].file_name, ev: extra.map(function (c) { return c.file_name; }), subj: (ev.subj || '').slice(0, 60) } }); } catch (e) { /* 수집 실패 무시 */ }
                return { status: 'ambiguous', candidates: [tag.candidates[0]].concat(extra), extraCandidates: [], confidence: '중',
                         matchBasis: (tag.matchBasis || '') + ' ⚠️ ' + T('근거 충돌: 이 앱의 배분 기록은 ', 'Evidence conflict: routing history points to ') +
                                     extra.map(function (c, k) { return (c.model || c.file_name) + '(' + note(others[k]) + ')'; }).join(', ') +
                                     T(' 을 가리킵니다 — 자동배치를 막고 사람 확인으로 남깁니다.', ' — auto-placement blocked, left for a person.'),
                         evidence: 'conflict' };
            }
            bump(strong.indexOf(pi) >= 0 ? 'agree_strong' : 'agree');
            tag.evidence = strong.indexOf(pi) >= 0 ? 'agree_strong' : 'agree';
            return tag;
        }
        // (c-1) AI "중" 한 후보 — 근거가 같은 후보를 강하게 가리키고 다투는 후보가 없으면 승격
        if (tag && tag.status === 'ambiguous' && tag.candidates.length === 1 && tag.confidence === '중' && P.promote) {
            var ai = idxOf(tag.candidates[0]);
            if (ai >= 0 && ev.per[ai].strong && strong.length === 1 && strong[0] === ai) {
                bump('promote', { to: tag.candidates[0].file_name });
                return { status: 'matched', candidates: [tag.candidates[0]], extraCandidates: [], confidence: '상',
                         matchBasis: (tag.matchBasis || '') + ' ✅ ' + T('근거 일치로 승격: ', 'Promoted by evidence: ') + note(ai), evidence: 'promote' };
            }
            if (ai >= 0 && strong.length && strong.indexOf(ai) < 0) {
                // AI 의 "중" 후보와 근거 후보가 다르다 — 둘 다 보여 주고 대기
                var alt = strong.slice(0, 2).map(function (i) { return cands[i]; });
                bump('ambig_alt');
                return Object.assign({}, tag, { candidates: [tag.candidates[0]].concat(alt),
                    matchBasis: (tag.matchBasis || '') + ' 📎 ' + T('배분 기록은 ', 'History points to ') + alt.map(function (c, k) { return (c.model || c.file_name) + '(' + note(strong[k]) + ')'; }).join(', ') + T(' 쪽', ''), evidence: 'alt' });
            }
            bump('ambig'); return tag;
        }
        // (c-2) AI 0 — 근거가 정확히 한 후보를 강하게 가리키면 그 후보로 대기(미분류 대신)
        if (!tag && P.suggest && strong.length === 1) {
            var si = strong[0];
            bump('suggest', { to: cands[si].file_name });
            return { status: 'ambiguous', candidates: [cands[si]], extraCandidates: [], confidence: '중',
                     matchBasis: ((task && task['매칭근거']) ? String(task['매칭근거']) + ' ' : '') + '📎 ' + T('AI 는 0 이었지만 배분 기록이 이 프로젝트를 가리킵니다: ', 'AI said none, but history points here: ') + note(si),
                     evidence: 'suggest' };
        }
        bump(tag ? 'other' : 'none');
        return tag;
    };

    // ── 📜 기록 훅 — 확정 배분의 한 곳 `_tpAppendMailSignal(fileId, task, mailRaw)` ──
    function wrapSignal() {
        var orig = window._tpAppendMailSignal;
        if (typeof orig !== 'function' || orig._meWrapped) return false;
        window._tpAppendMailSignal = function (fid, task, mailRaw) {
            try {
                var fname = '';
                var idx = (window._projectIndexCache && window._projectIndexCache.data) || [];
                var hit = idx.filter(function (p) { return p && p.drive_file_id === fid; })[0];
                if (hit) fname = hit.file_name;
                if (!isOff()) window.mailEvidenceRecord(fid, fname, mailRaw, 'placed');
            } catch (e) { /* 기록 실패가 신호를 막지 않는다 */ }
            return orig.apply(this, arguments);
        };
        window._tpAppendMailSignal._meWrapped = true;
        return true;
    }
    // 사람의 되돌림 — 재배치 큐(js/25)에 넣는 순간이 "틀렸다" 는 신호
    function wrapReassign() {
        var orig = window._pushReassignQueue;
        if (typeof orig !== 'function' || orig._meWrapped) return false;
        window._pushReassignQueue = function (item) {
            try { if (item && item.mailRaw) window.mailEvidenceForget(item.fromProjectId || item.sourceProjectId || '', item.mailRaw); } catch (e) { /* 무시 */ }
            return orig.apply(this, arguments);
        };
        window._pushReassignQueue._meWrapped = true;
        return true;
    }

    // ── 🧹 미분류 큐 훑기 — AI 없이 근거만으로 "이 후보일 것" 을 붙여 보관함 대기로 ─────
    var _sweepTimer = null;
    function scheduleSweep(ms) {
        if (typeof setTimeout !== 'function') return;
        clearTimeout(_sweepTimer);
        _sweepTimer = setTimeout(function () { window.mailEvidenceSweep().catch(function () {}); }, ms == null ? 15000 : ms);
    }
    window.mailEvidenceSweep = async function () {
        var out = { looked: 0, suggested: 0, skipped: 'off' };
        if (isOff() || !P.suggest) return out;
        var list = window._msResults;
        if (!Array.isArray(list) || !list.length || !window._msLoadProjectIndex) { out.skipped = 'no-queue'; return out; }
        var cands = window._msFilterCandidateProjects ? window._msFilterCandidateProjects(await window._msLoadProjectIndex()) : await window._msLoadProjectIndex();
        if (!cands || !cands.length) { out.skipped = 'no-candidates'; return out; }
        out.skipped = '';
        var changed = false;
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (!r || r.project || r._projectTag || !r.task || r._evidenceChecked) continue;
            out.looked++;
            var ev = window.mailEvidenceFor({ subject: r.subject, sender: r.sender, body: r.body }, cands);
            r._evidenceChecked = new Date().toISOString();
            changed = true;
            var tag = window.mailEvidenceAdjust(null, ev, cands, r.task);
            if (!tag) continue;
            r._projectTag = tag;
            r.project = window._msProjectTagLabel ? window._msProjectTagLabel(tag) : (tag.candidates[0].model || tag.candidates[0].file_name);
            r.matchReason = tag.matchBasis;
            if (window.TaskInbox) {
                var already = window.TaskInbox.load().some(function (it) { return it.mailRaw && it.mailRaw.fileName === r.fileName; });
                if (!already) {
                    var c0 = tag.candidates[0];
                    window.TaskInbox.add(r.task, {
                        source: '📎 ' + T('배분 기록 근거(AI 0 → 후보: ', 'evidence (AI none → candidate: ') + (c0.model || c0.customer || c0.file_name) + ')',
                        mailRaw: { subject: r.subject, sender: r.sender, to: r.to, cc: r.cc, date: r.date, body2000: r.body, fileName: r.fileName },
                        matchedProject: tag, alarmWorthy: !!r._alarmWorthy
                    });
                }
            }
            out.suggested++;
        }
        if (changed) {
            try { if (window._msSaveQueueToStorage) window._msSaveQueueToStorage(); } catch (e) { /* 저장 실패는 다음에 */ }
            try { if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); } catch (e) { /* 화면 없음 */ }
        }
        if (out.suggested) bump('sweep_suggested', { n: out.suggested });
        return out;
    };

    // ── 설치 — 늦게 정의되는 함수가 있어 몇 번 되돌아본다 ──────────────────────
    window._mailEvidenceInstall = function () {
        return { build: wrapBuild(), resolve: wrapResolve(), signal: wrapSignal(), reassign: wrapReassign() };
    };
    (function install(tries) {
        var r = window._mailEvidenceInstall();
        var done = window._msBuildProjectMatchSection && window._msBuildProjectMatchSection._meWrapped
                && window._msResolveAiProjectMatch && window._msResolveAiProjectMatch._meWrapped
                && window._tpAppendMailSignal && window._tpAppendMailSignal._meWrapped;
        if (!done && tries < 20 && typeof setTimeout === 'function') setTimeout(function () { install(tries + 1); }, 500);
        void r;
    })(0);
    if (typeof setTimeout === 'function' && !window._mailEvidenceNoAutoSweep) scheduleSweep(P.sweepDelayMs);

    try {
        if (window.STORAGE_REGISTRY) {
            [{ key: P.historyKey, label: '메일 배분 기록(근거층)', labelEn: 'Mail routing history (evidence)', cls: 'log', strategy: { type: 'drop' } },
             { key: P.statsKey, label: '메일 근거 판정 집계', labelEn: 'Mail evidence stats', cls: 'cache', strategy: { type: 'drop' } },
             { key: P.offKey, label: '메일 근거층 끄기 스위치', labelEn: 'Mail evidence kill switch', cls: 'setting', strategy: { type: 'keep' } }]
            .forEach(function (r) { if (!window.STORAGE_REGISTRY.some(function (x) { return x.key === r.key; })) window.STORAGE_REGISTRY.push(r); });
        }
    } catch (e) { /* 레지스트리 없음 */ }
})();
