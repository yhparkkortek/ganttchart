/* ============================================================================
   74-mail-routing.js — 🧭 메일 배분 판정 **한 곳** · 쓰기 훅 **한 곳** · 기록 **한 곳**
   (2026-11-21, 사용자 지시: "분석은 했는데 이런 저런 이유로 배치를 못하고 망설이거나 사람을
    기다리는 메일이 너무 많다 / 오배송도 여전하다 / 코드·판단·UI 가 겹쳐 복잡하다 → 재편")
   ============================================================================
   실데이터(NAS 스냅샷 11-05)로 확인한 사실 — `docs/mail-distribution-audit-2026-11-21.md`:
     · 오배송의 대부분은 **같은 가족 안의 형제 모델** 사이(AMUSNET 55F/55C/55J·SHUFFLER 3.0/4.3·
       OBSIDIAN27/Digital Wheel). 가족이 다른 프로젝트로 간 건은 12개 파일에서 1~3건뿐.
     · 대기 322건 중 "상" 97건 — AI 가 불확실해서가 아니라 **경로별 정책**(일괄재분석은 자동배치 없음) 때문.
     · 메일 열쇠(fileName=날짜+제목20자)가 8.5% 충돌 → 두 번째 메일이 조용히 버려짐.
     · 학습로그 1,300건 중 사람 교정 4건. 되돌림 훅은 연결돼 있지 않았다.

   그래서 이 파일이 하는 일(원칙은 CLAUDE.md 최우선 방향 그대로 — 결정론 먼저, AI 는 후보, 자동배치는 코드가 결정):
   ① 판정 `mailRouteJudge` — **가족(고객·프로젝트) → 모델(제품구분자)** 두 단계.
        가족은 결정론 식별자로 거의 늘 확정된다. 가족 안에서 모델은 **고유 식별자 → 가족 대표 → AI 픽** 순.
        형제 사이의 오배송은 담당자가 같아 피해가 작으므로 **망설이지 않고 배치**한다(사용자 지적: 대기 과다).
        대기는 **가족조차 못 가를 때**(서로 다른 가족의 식별자가 충돌·AI 만 있고 인용 검증 실패)만.
        복수 프로젝트 동시 자동배치는 없다(대기+후보 목록).
   ② 열쇠 `mailKeyOf` — 백엔드 `key`(Message-ID 해시) 우선, 없으면 제목+시각+발신자 해시. fileName 은 표시용.
   ③ 쓰기 훅 `_mailRoutePlaced` — `_msAutoRegisterToProject`·`distSendTaskToTargets` 를 감싸 **성공한 배치 전부**가
        팀 공용 기록 + 토픽 신호 + NAS .eml 이동(기존 `_tpAppendMailSignal` 사슬)을 지나게 한다.
        (예전엔 건수 최다인 자동틱 주매칭 경로가 그 훅을 안 불렀다.)
   ④ 팀 공용 기록 `App_Config/MailRoutes/<YYYY_MM>__<계정>.json` — 배치·교정·되돌림. 계정×월 1파일(단일 작성자,
        일일보고와 같은 설계)이라 RMW 충돌이 없다. 스레드 규칙(같은 제목이 어디로 갔나)은 여기서 읽는다 —
        PC 로컬 기록(js/61)은 보조로만.
   ⑤ 대기 재판정 `mailRouteRejudgePending` — 이미 보관함에 쌓인 '대기' 를 **AI 없이** 새 규칙으로 다시 보고,
        자동 조건이 되면 그 자리에서 배치한다(유휴 스윕에 편승 + 설정 버튼).
   ⑥ 교정 `mailRouteCorrect` — 사람이 "아니다" 라고 한 것(❌오매칭·🚨신고·되돌림)을 기록에 적고 js/61 의
        로컬 근거도 지운다(틀린 배분이 스레드 근거로 번식하지 않게).

   ⚠️ 이 파일은 **감싸기만** 한다(15b/14c/14d 의 함수를 베끼지 않는다). 로드는 61 뒤.
   ⚠️ 끄기: localStorage.gantt_mail_routing_off='1' → 판정은 예전 그대로(AI 상=자동), 훅·기록은 유지.
   ============================================================================ */
(function () {
    'use strict';

    window.MAIL_ROUTING_POLICY = window.MAIL_ROUTING_POLICY || {
        offKey: 'gantt_mail_routing_off',
        identMinLen: 4,          // 식별자 토큰(정규화) 최소 길이
        familyShareMin: 4,       // 같은 고객 아래서 식별자를 이만큼 공유하면 "형제"(실측: 형제 6~11, 비형제 ≤3)
        threadMinLen: 12,        // 스레드 규칙에 쓰는 제목(정규화) 최소 길이 — 짧은 제목은 범용이라 안 쓴다
        threadDays: 180,         // 이보다 오래된 기록은 스레드 근거로 안 쓴다
        familyAiAuto: true,      // 가족 확정 + 모델 식별자 없음 + 대표 없음 → AI 픽(상/중)으로 배치
        aiCitedAuto: true,       // 가족 근거도 없을 때 AI 상 + 인용 검증(특정 토큰 포함) → 배치
        customerAiSingleMid: true, // [2026-11-23 사용자 결정] 고객만 확정 + AI 가 그 고객 안에서 하나만 고름(중) → 배치
        routeDir: 'App_Config/MailRoutes',
        flushSec: 60,
        reloadMin: 10,
        rejudgeMax: 20,          // 한 번 재판정에서 배치 시도 상한(스윕 비용)
        autoKeywordSignal: false // js/26 의 "메일 제목 단어를 토픽 키워드에 자동 누적" — 끈다(범용어 흡수·15개 동결)
    };
    var P = window.MAIL_ROUTING_POLICY;
    function off() { try { return localStorage.getItem(P.offKey) === '1'; } catch (e) { return false; } }
    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }

    // ── 정규화 ────────────────────────────────────────────────────────────
    function norm(s) { return String(s || '').toLowerCase().replace(/[^0-9a-zㄱ-ㆎ가-힣]+/g, ''); }
    function normSubject(s) {
        var t = String(s || '');
        for (var i = 0; i < 6; i++) t = t.replace(/^\s*((re|fw|fwd|답장|전달|회신)\s*(\[\d+\])?\s*:\s*)/i, '');
        return norm(t);
    }
    function senderEmail(s) { var m = /<([^>]+)>/.exec(String(s || '')); return (m ? m[1] : String(s || '')).trim().toLowerCase(); }
    function customerRoot(c) { return norm(String(c || '').split('>')[0]); }
    function fnv(str) {   // 64-bit FNV-1a → 16 hex (sync, 외부 의존 없음)
        var h1 = 0x811c9dc5, h2 = 0x01000193;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0;
            h2 ^= (c * 31) & 0xffff; h2 = Math.imul(h2, 2246822519) >>> 0;
        }
        return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
    }
    /** 🔑 메일 열쇠 — 백엔드 key 우선. 없으면(옛 데이터·.eml 탭·직접입력) 제목+시각+발신자. 아무것도 없으면 ''. */
    window.mailKeyOf = function (mr) {
        if (!mr) return '';
        if (mr.key) return String(mr.key);
        var subj = String(mr.subject || '').replace(/\s+/g, ' ').trim();
        var date = String(mr.date || '').trim();
        var from = senderEmail(mr.sender);
        if (!subj && !date) return '';
        return 'f' + fnv(date + '|' + from + '|' + subj).slice(1);
    };

    // ── 후보의 식별자 ───────────────────────────────────────────────────────
    /** SAP 자재내역처럼 메일에 그 모양으로 나타날 수 없는 긴 설명 문자열인가 */
    function looksMaterialDesc(k) {
        var s = String(k || '');
        return (s.indexOf('>') !== -1 && s.indexOf(',') !== -1) || (s.length > 28 && /[,=]/.test(s));
    }
    function isPerson(k) {
        try { if (window._msIsKnownPersonName && window._msIsKnownPersonName(k)) return true; } catch (e) { /* 무시 */ }
        try { if (window._tpIsPersonName && window._tpIsPersonName(k)) return true; } catch (e) { /* 무시 */ }
        return false;
    }
    function isGeneric(k) { try { return !!(window._tpIsGenericKeyword && window._tpIsGenericKeyword(k)); } catch (e) { return false; } }
    // 모델명 낱말 조각에서 식별자로 삼지 않는 범용어(소문자·정규화). 데이터 — 늘려도 코드는 그대로.
    window.MAIL_ROUTING_STOPWORDS = window.MAIL_ROUTING_STOPWORDS || [
        'display', 'displays', 'series', 'model', 'project', 'board', 'panel', 'module', 'monitor', 'sample', 'system',
        'glass', 'touch', 'curved', 'flat', 'upright', 'topper', 'wheel', 'back', 'box', 'with', 'and', 'the', 'type',
        '모니터', '디스플레이', '프로젝트', '모델', '패널', '샘플', '시제품',
        // [2026-11-23 실측] 보관함 대기 144건 재생에서 "고유 식별자"로 잘못 잡혀 충돌을 만든 범용 영단어.
        //  모델명 조각에서 나온 것이라 두 낱말 조각('digitalwheel'·'32landscape'·'dimensionec')은 그대로 남는다.
        'digital', 'landscape', 'dimension', 'roadmap'
    ];
    var STOP = {}; window.MAIL_ROUTING_STOPWORDS.forEach(function (w) { STOP[norm(w)] = 1; });
    // [2026-11-23] 우리 회사 이름 — 서명·제목("> KORTEK")·주소에 **모든 메일**에 나온다. 고객/가족 단서로 쓰면
    //  사내 공용 프로젝트(KORTEK>개발업무)가 늘 "다른 고객"으로 같이 걸려 거의 모든 메일이 충돌(대기)이 됐다(실측 60/144).
    window.MAIL_ROUTING_SELF_ORG = window.MAIL_ROUTING_SELF_ORG || ['kortek', '코텍'];
    var SELF = {}; window.MAIL_ROUTING_SELF_ORG.forEach(function (w) { SELF[norm(w)] = 1; });

    /** 후보 1개의 식별자 토큰(정규화) — 모델·고객모델명·코드류 keywords(+낱말·연속 두 낱말 조각).
     *  사람 이름·자재내역·범용어·짧은 것 제외. 고유한지(다른 후보에 없는지)는 부르는 쪽이 가른다. */
    function identsOf(c) {
        var out = {};
        var root = customerRoot(c.customer);
        var add = function (k, src) {
            if (k == null) return;
            var raw = String(k).trim();
            if (!raw || looksMaterialDesc(raw) || isPerson(raw) || isGeneric(raw)) return;
            var n = norm(raw);
            if (n.length < P.identMinLen) return;
            if (n === root || STOP[n] || SELF[n]) return;    // 고객사명 자체는 가족 토큰(아래) · 우리 회사 이름은 단서 아님
            if (/^\d+$/.test(n) && n.length < 5) return;     // "4.3"·"2026" 류
            out[n] = src;
        };
        var addPieces = function (k, src) {
            var words = String(k || '').split(/[^0-9A-Za-z가-힣.]+/).filter(Boolean);
            words.forEach(function (w) { if (norm(w).length >= 6 && !/^\d+$/.test(norm(w))) add(w, src + ':w'); });
            for (var i = 0; i + 1 < words.length; i++) add(words[i] + words[i + 1], src + ':2');
        };
        add(c.model, 'model'); addPieces(c.model, 'model');
        (c.keywords || []).forEach(function (k) { add(k, 'kw'); if (!looksMaterialDesc(k)) addPieces(k, 'kw'); });
        String(c.customer || '').split('>').slice(1).forEach(function (p) { add(p, 'cust'); });
        return out;
    }
    /** 사람이 정한 가족 설정(App_Config/MailRouting_Shared.json) — {families:{<famName>:{members:[fid], primary:fid}}} */
    var _cfg = { families: {} };
    function explicitFamilyOf(c) {
        var fid = c.drive_file_id || '';
        for (var name in _cfg.families) { var f = _cfg.families[name]; if (f && (f.members || []).indexOf(fid) !== -1) return name; }
        return c.family || '';
    }
    function explicitPrimary(name) { var f = _cfg.families[name]; return (f && f.primary) || ''; }

    /** 가족 묶기 — 사람 설정 > 고객사 칸이 통째로 같음(LNW>SHUFFLER) > 같은 고객 아래 식별자 공유 ≥ familyShareMin.
     *  결과: {famOf:{fid:famId}, fams:{famId:{members:[idx], primary:idx|null, label, name}}, idents} */
    function buildFamilies(cands) {
        var ids = cands.map(identsOf);
        var par = cands.map(function (_, i) { return i; });
        function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
        function union(a, b) { a = find(a); b = find(b); if (a !== b) par[b] = a; }
        var exp = cands.map(explicitFamilyOf);
        for (var i = 0; i < cands.length; i++) {
            for (var j = i + 1; j < cands.length; j++) {
                var a = cands[i], b = cands[j];
                if (exp[i] && exp[j]) { if (norm(exp[i]) === norm(exp[j])) union(i, j); continue; }   // 사람이 정했으면 그것만
                var ra = customerRoot(a.customer), rb = customerRoot(b.customer);
                if (!ra || ra !== rb) continue;
                var ca = norm(a.customer), cb = norm(b.customer);
                if (ca.indexOf(ra) === 0 && ca.length > ra.length && ca === cb) { union(i, j); continue; }  // "LNW>SHUFFLER" 둘
                var shared = 0;
                for (var k in ids[i]) if (ids[j][k]) shared++;
                if (shared >= P.familyShareMin) union(i, j);
            }
        }
        var fams = {}, famOf = {};
        cands.forEach(function (c, i) {
            var r = 'f' + find(i);
            famOf[c.drive_file_id || c.file_name || i] = r;
            fams[r] = fams[r] || { members: [], primary: null, label: '', name: exp[i] || '' };
            fams[r].members.push(i);
            if (fams[r].primary == null) {
                var pf = exp[i] ? explicitPrimary(exp[i]) : '';
                if ((pf && pf === c.drive_file_id) || c.familyPrimary) fams[r].primary = i;
            }
        });
        Object.keys(fams).forEach(function (r) {
            var f = fams[r], c0 = cands[f.members[0]];
            f.label = f.name || (String(c0.customer || '').split('>').slice(0, 2).join('>') || c0.model || '').trim();
            if (f.members.length === 1) f.label = (c0.model || c0.customer || c0.file_name || '').trim();
        });
        return { famOf: famOf, fams: fams, idents: ids };
    }
    /** 가족 토큰 — 형제가 여럿이면 2개 이상이 공유하는 식별자, 단독 가족이면 자기 식별자 전부. + 고객사 root·고객사 칸 조각. */
    function familyTokens(cands, fam, idents) {
        var toks = {}, cnt = {}, k;
        fam.members.forEach(function (i) { for (k in idents[i]) cnt[k] = (cnt[k] || 0) + 1; });
        for (k in cnt) if (fam.members.length === 1 || cnt[k] >= 2) toks[k] = 1;
        fam.members.forEach(function (i) {
            var c = cands[i], root = customerRoot(c.customer);
            if (root && root.length >= 3 && !SELF[root]) toks[root] = 1;
            String(c.customer || '').split('>').slice(1).forEach(function (p) { var n = norm(p); if (n.length >= 3 && !SELF[n]) toks[n] = 1; });
        });
        return toks;
    }
    /** 고객 root 가 같은 후보들(가족과 무관하게) — "고객은 알겠는데 어느 제품인지 모를 때" 쓴다 */
    function customerGroup(cands, rootN) { return cands.filter(function (c) { return customerRoot(c.customer) === rootN; }); }
    /** 토큰이 본문에 있나 — 숫자만인 토큰은 앞뒤가 숫자가 아닌 자리에서만(654321 ⊂ 1654321 오탐 방지) */
    //  [2026-11-23] 영문자로 시작/끝나는 토큰은 **낱말 경계**도 본다 — 정규화(공백 제거) 문자열에서 부분일치만 보면
    //  'horizon' ⊂ "horizontal", 'kgi' ⊂ "check gift" 처럼 남의 낱말 속에서 걸려 거짓 충돌이 났다(실측).
    //  한글 쪽 경계는 보지 않는다(조사가 붙는다: "LNW향").
    function buildHay(raw) {
        var n = '', pos = [];
        for (var i = 0; i < raw.length; i++) {
            var ch = raw[i].toLowerCase();
            if (/[0-9a-zㄱ-ㆎ가-힣]/.test(ch)) { n += ch; pos.push(i); }
        }
        return { n: n, pos: pos, raw: raw };
    }
    function hit(hay, hayRaw, tok) {
        if (/^\d+$/.test(tok)) { return new RegExp('(^|\\D)' + tok + '(\\D|$)').test(hayRaw); }
        var hn = hay.n, from = 0, at;
        var lb = /^[a-z]/.test(tok), rb = /[a-z]$/.test(tok);
        while ((at = hn.indexOf(tok, from)) !== -1) {
            from = at + 1;
            var s0 = hay.pos[at], e0 = hay.pos[at + tok.length - 1];
            if (lb && s0 > 0 && /[A-Za-z]/.test(hay.raw[s0 - 1])) continue;
            if (rb && e0 + 1 < hay.raw.length && /[A-Za-z]/.test(hay.raw[e0 + 1])) continue;
            return true;
        }
        return false;
    }

    // ── 판정 ────────────────────────────────────────────────────────────────
    /**
     * @param mail  {subject, sender, body}
     * @param cands project_index 항목 배열(프롬프트 번호 순)
     * @param aiTag _msResolveAiProjectMatch 결과(있으면) — {status, candidates, confidence, evidence?}
     * @returns {decision:'auto'|'wait'|'none', target, candidates, basis, reason, family, hits}
     */
    window.mailRouteJudge = function (mail, cands, aiTag) {
        var raw = String((mail && mail.subject) || '') + '\n' + String((mail && mail.body) || '');
        var hayNorm = buildHay(raw), hayRaw = raw.replace(/\s+/g, ' ');
        var F = buildFamilies(cands || []);
        var idents = F.idents;
        // 어느 후보에도 겹치지 않는 "고유" 식별자 vs 공유 식별자
        var owner = {};
        idents.forEach(function (m, i) { for (var k in m) owner[k] = (owner[k] === undefined) ? i : -1; });
        var uniqHits = cands.map(function () { return []; });
        var famHit = {};   // famId → hits
        idents.forEach(function (m, i) {
            for (var k in m) if (owner[k] === i && hit(hayNorm, hayRaw, k)) uniqHits[i].push(k);
        });
        Object.keys(F.fams).forEach(function (fid) {
            var toks = familyTokens(cands, F.fams[fid], idents);
            var hs = [];
            for (var k in toks) if (hit(hayNorm, hayRaw, k)) hs.push(k);
            if (hs.length) famHit[fid] = hs;
        });
        var famOfIdx = function (i) { var c = cands[i]; return F.famOf[c.drive_file_id || c.file_name || i]; };
        var withUniq = []; cands.forEach(function (_, i) { if (uniqHits[i].length) withUniq.push(i); });
        var famsWithUniq = {}; withUniq.forEach(function (i) { famsWithUniq[famOfIdx(i)] = 1; });
        var famKeys = Object.keys(famsWithUniq);
        var out = function (d) { d.family = d.family || null; d.hits = { uniq: uniqHits, fam: famHit }; return d; };

        // ① 고유 식별자가 정확히 한 후보 → 배치. 단, **다른 가족**의 토큰이 2개 이상 같이 있으면(고객사 이름 한 번은
        //    "AMUSNET 처럼" 같은 지나가는 언급일 수 있어 봐준다) 충돌로 보고 사람에게 넘긴다.
        if (withUniq.length === 1) {
            var i1 = withUniq[0], myFam = famOfIdx(i1);
            var otherStrong = Object.keys(famHit).filter(function (f) { return f !== myFam && famHit[f].length >= 2; });
            if (otherStrong.length) {
                return out({ decision: 'wait', target: null,
                    candidates: [cands[i1]].concat(otherStrong.slice(0, 2).reduce(function (a, f) { return a.concat(F.fams[f].members.map(function (i) { return cands[i]; })); }, [])).slice(0, 6),
                    basis: 'conflict', reason: T('식별자는 한 곳(' + uniqHits[i1][0] + ')인데 다른 프로젝트 단어도 여럿 — 사람이 고른다', 'identifier points to one project but another project is also discussed — needs a person') });
            }
            return out({ decision: 'auto', target: cands[i1], candidates: [cands[i1]], basis: 'identifier',
                reason: T('식별자 일치: ', 'identifier: ') + uniqHits[i1].slice(0, 3).join(', '), family: myFam });
        }
        // ② 고유 식별자가 여러 후보 — 가족이 다르면 충돌(대기), 같으면 가족 확정
        if (withUniq.length > 1 && famKeys.length > 1) {
            return out({ decision: 'wait', target: null, candidates: withUniq.map(function (i) { return cands[i]; }), basis: 'conflict',
                reason: T('서로 다른 프로젝트의 식별자가 함께 있음 — 사람이 고른다', 'identifiers of different projects present — needs a person') });
        }
        var famId = famKeys.length === 1 ? famKeys[0] : null;
        var aiPick = (aiTag && aiTag.candidates && aiTag.candidates[0]) || null;
        var aiIdx = aiPick ? cands.findIndex(function (c) { return c === aiPick || (aiPick.drive_file_id && c.drive_file_id === aiPick.drive_file_id); }) : -1;
        var aiConf = aiTag ? (aiTag.confidence || '') : '';
        var custOnly = null;   // 고객만 확정된 경우의 root
        // ③ 가족 토큰으로만 가족 확정(정확히 한 가족)
        if (!famId) {
            var fk = Object.keys(famHit);
            if (fk.length === 1) famId = fk[0];
            else if (fk.length > 1) {
                // 고객사 root(lnw 같은) 처럼 여러 가족이 공유하는 토큰은 가족을 못 가른다 — 가족을 가르는 토큰만 센다
                var tokFams = {};
                fk.forEach(function (f) { famHit[f].forEach(function (t) { tokFams[t] = (tokFams[t] || 0) + 1; }); });
                var score = {}; fk.forEach(function (f) { score[f] = famHit[f].filter(function (t) { return tokFams[t] === 1; }).length; });
                fk.sort(function (a, b) { return score[b] - score[a]; });
                if (score[fk[0]] >= 1 && score[fk[0]] >= 2 * score[fk[1]]) famId = fk[0];
                else {
                    // 가르는 토큰이 없다 = 같은 고객의 여러 제품(STELLAR32·OBSIDIAN…)만 같이 걸림.
                    var roots = {}; fk.forEach(function (f) { F.fams[f].members.forEach(function (i) { roots[customerRoot(cands[i].customer)] = 1; }); });
                    var rk = Object.keys(roots).filter(Boolean);
                    if (rk.length === 1) custOnly = rk[0];
                    else return out({ decision: 'wait', target: null,
                        candidates: fk.slice(0, 3).reduce(function (a, f) { return a.concat(F.fams[f].members.map(function (i) { return cands[i]; })); }, []),
                        basis: 'conflict', reason: T('여러 고객의 단어가 함께 있음', 'several customers mentioned') });
                }
            }
        }
        if (custOnly) {
            // 고객은 확정, 제품은 미확정 — 같은 고객 안에서 AI 가 "상"(인용 검증까지 통과) 이면 따른다. 그 외는 대기(그 고객 후보만).
            var grp = customerGroup(cands, custOnly);
            if (aiIdx !== -1 && customerRoot(cands[aiIdx].customer) === custOnly && aiConf === '상' && (!aiTag.evidence || aiTag.evidence === 'cited' || aiTag.evidence === 'agree_strong')) {
                return out({ decision: 'auto', target: cands[aiIdx], candidates: grp, basis: 'customer_ai',
                    reason: T('고객 확정(' + custOnly.toUpperCase() + ') · 제품은 AI 판단(상)', 'customer ' + custOnly.toUpperCase() + ' confirmed · product by AI (high)'), family: famOfIdx(aiIdx) });
            }
            // [2026-11-23 사용자 결정] 고객 확정 + AI 가 그 고객 안에서 **하나만** 골랐으면 "중" 이어도 배치.
            //  AI 가 둘 이상을 후보로 냈으면(못 좁혔으면) 그대로 대기. 스위치는 P.customerAiSingleMid(데이터).
            if (P.customerAiSingleMid && aiIdx !== -1 && aiConf === '중' && customerRoot(cands[aiIdx].customer) === custOnly) {
                var aiInCust = (aiTag.candidates || []).filter(function (c) { return customerRoot(c.customer) === custOnly; });
                if (aiInCust.length === 1) {
                    return out({ decision: 'auto', target: cands[aiIdx], candidates: grp, basis: 'customer_ai_single',
                        reason: T('고객 확정(' + custOnly.toUpperCase() + ') · AI 가 제품 하나를 고름(중)', 'customer ' + custOnly.toUpperCase() + ' confirmed · AI picked one product (med)'), family: famOfIdx(aiIdx) });
                }
            }
            return out({ decision: 'wait', target: null, candidates: grp.slice(0, 6), basis: 'customer_only',
                reason: T('고객(' + custOnly.toUpperCase() + ')은 확실한데 어느 제품인지 단서가 없음', 'customer ' + custOnly.toUpperCase() + ' is clear but not which product') });
        }
        if (famId) {
            var fam = F.fams[famId];
            var members = fam.members.map(function (i) { return cands[i]; });
            if (fam.members.length === 1) {
                return out({ decision: 'auto', target: members[0], candidates: members, basis: 'family',
                    reason: T('프로젝트 단어 일치: ', 'project words: ') + (famHit[famId] || []).slice(0, 3).join(', '), family: famId });
            }
            // 형제가 여럿 — 모델 식별자(여러 형제가 동시에 맞은 경우는 위 ②에서 걸러짐·여기선 0개)
            if (fam.primary != null) {
                return out({ decision: 'auto', target: cands[fam.primary], candidates: members, basis: 'family_primary',
                    reason: T('가족 확정(' + fam.label + ') · 모델 단서 없음 → 가족 대표로', 'family ' + fam.label + ' confirmed, no model cue → family primary'), family: famId });
            }
            if (P.familyAiAuto && aiIdx !== -1 && famOfIdx(aiIdx) === famId && (aiConf === '상' || aiConf === '중')) {
                return out({ decision: 'auto', target: cands[aiIdx], candidates: members, basis: 'family_ai',
                    reason: T('가족 확정(' + fam.label + ') · 모델은 AI 판단(' + aiConf + ')', 'family ' + fam.label + ' confirmed · model by AI (' + aiConf + ')'), family: famId });
            }
            return out({ decision: 'wait', target: null, candidates: members, basis: 'family_unresolved',
                reason: T('가족은 확정(' + fam.label + ')인데 어느 모델인지 단서가 없음 — 설정에서 가족 대표를 정하면 자동 배치', 'family ' + fam.label + ' confirmed but model unknown — set a family primary in settings to auto-place'), family: famId });
        }
        // ④ 스레드(팀 공용 기록) — 같은 제목이 이미 확정돼 간 곳
        var th = threadTarget(mail, cands);
        if (th) {
            return out({ decision: 'auto', target: th.cand, candidates: [th.cand], basis: 'thread',
                reason: T('같은 제목 스레드가 이미 이 프로젝트로 배분됨(' + th.n + '건)', 'same-subject thread already routed here (' + th.n + ')'), family: famOfIdx(cands.indexOf(th.cand)) });
        }
        // ⑤ AI 만 있다 — 단, js/61 근거층이 **결정론 기록**(스레드·관리번호·발신자)으로 이미 올렸거나 확인한 것은 따른다
        if (aiTag && aiTag.status === 'matched' && aiPick) {
            var ev = aiTag.evidence || '';
            if (ev === 'promote' || ev === 'agree_strong') {
                return out({ decision: 'auto', target: aiPick, candidates: [aiPick], basis: 'evidence',
                    reason: T('배분 기록 근거(스레드·관리번호·발신자)가 이 프로젝트를 가리킴', 'routing history (thread/code/sender) points here') });
            }
            if (P.aiCitedAuto && ev === 'cited') {
                return out({ decision: 'auto', target: aiPick, candidates: [aiPick], basis: 'ai_cited',
                    reason: T('AI 판단(상) + 본문 인용 검증 통과', 'AI (high) + citation verified') });
            }
            return out({ decision: 'wait', target: null, candidates: [aiPick].concat(aiTag.extraCandidates || []).slice(0, 4), basis: 'ai_unverified',
                reason: T('AI 판단(상)인데 본문에 이 프로젝트를 특정하는 단어가 없음 — 사람 확인', 'AI (high) but no project-specific token in the mail — needs review') });
        }
        if (aiTag && aiTag.status === 'ambiguous' && aiTag.candidates && aiTag.candidates.length) {
            return out({ decision: 'wait', target: null, candidates: aiTag.candidates.slice(0, 5), basis: 'ai_low',
                reason: T('AI 판단 신뢰도 ' + (aiConf || '?') + ' · 결정론 근거 없음', 'AI confidence ' + (aiConf || '?') + ' · no deterministic cue') });
        }
        return out({ decision: 'none', target: null, candidates: [], basis: 'none',
            reason: T('어느 프로젝트의 식별자·고객·스레드도 없음', 'no identifier, customer or thread cue') });
    };

    // ── 판정 → projectTag(15b 모양) ────────────────────────────────────────
    function tagFromJudge(j, aiTag) {
        var conf = aiTag && aiTag.confidence;
        var basisTxt = '🧭 ' + j.reason + (aiTag && aiTag.matchBasis ? ' · 🤖 ' + aiTag.matchBasis : '');
        if (j.decision === 'auto') {
            return { status: 'matched', candidates: [j.target], extraCandidates: [], confidence: '상',
                     matchBasis: basisTxt, routing: { basis: j.basis, family: j.family, aiConfidence: conf || '' } };
        }
        if (j.decision === 'wait') {
            return { status: 'ambiguous', candidates: j.candidates, extraCandidates: [], confidence: conf || '중',
                     matchBasis: basisTxt, routing: { basis: j.basis, family: j.family, aiConfidence: conf || '' },
                     ambiguousReason: j.basis };
        }
        return null;
    }

    // ── 최근 분석 메일 고리 — 싱글톤(_mailParsedRaw) 레이스를 피한다 ─────────
    //    build 시점의 메일을 제목으로 적어 두고, resolve 시점엔 task 의 [출처] 제목으로 되찾는다.
    var _ring = [];
    function remember(mail, cands) {
        _ring.unshift({ mail: mail, cands: cands, subjN: normSubject(mail.subject), at: Date.now() });
        if (_ring.length > 30) _ring.length = 30;
    }
    function recall(task, cands) {
        var d = String((task && task['상세내용']) || '');
        var m = /\[출처\]([\s\S]*?)_\d{4}-\d{2}-\d{2}/.exec(d);
        var subjN = m ? normSubject(m[1]) : '';
        var now = Date.now();
        for (var i = 0; i < _ring.length; i++) {
            var r = _ring[i];
            if (now - r.at > 15 * 60000) break;
            if (r.cands === cands && (!subjN || r.subjN === subjN)) return r.mail;
        }
        // 제목으로 못 찾았으면 같은 후보 배열의 가장 최근 1건(옛 동작과 같다 — 동시 분석이 없을 때만 맞다)
        return (_ring[0] && _ring[0].cands === cands && now - _ring[0].at < 15 * 60000) ? _ring[0].mail : null;
    }

    // ── 팀 공용 기록 ────────────────────────────────────────────────────────
    var _routes = { loaded: 0, entries: [] };     // 팀 전체(읽기)
    var _buf = [];                                 // 내 것(쓰기 대기)
    function acct() {
        var k = window._dailyMyKey ? window._dailyMyKey() : String(window._appUserKey || window._nasAccount || '').toLowerCase();
        return String(k || '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function monthOf(d) { d = d || new Date(); return d.getFullYear() + '_' + ('0' + (d.getMonth() + 1)).slice(-2); }
    function myRel(d) { return P.routeDir + '/' + monthOf(d) + '__' + acct() + '.json'; }
    function storageReady() { return !!(window.nasAppFile && window.nasAppFile.get && window.nasAppFile.put && window.nasAppFile.list); }

    /** 기록 1건 — type 'placed'|'correct'|'undo'. 사람이 누구인지 모르면(계정 없음) 적지 않는다(남의 파일에 쓰지 않는다). */
    function record(e) {
        if (!acct()) return false;
        e.at = e.at || new Date().toISOString(); e.by = e.by || acct();
        _buf.push(e); _routes.entries.push(e);
        return true;
    }
    async function flush() {
        if (!_buf.length || !storageReady()) return false;
        var mine = _buf; _buf = [];
        try {
            var rel = myRel();
            var cur = null;
            try { cur = await window.nasAppFile.get(rel, { json: true }); } catch (e) { cur = null; }
            var doc = (cur && Array.isArray(cur.entries)) ? cur : { v: 1, acct: acct(), month: monthOf(), entries: [] };
            doc.entries = doc.entries.concat(mine);
            if (doc.entries.length > 5000) doc.entries = doc.entries.slice(doc.entries.length - 5000);
            doc.savedAt = new Date().toISOString();
            await window.nasAppFile.put(rel, doc);
            return true;
        } catch (e) {
            _buf = mine.concat(_buf);     // 다음에 다시
            console.warn('[메일 배분 기록] 올리기 실패(다음에 다시):', e && e.message);
            return false;
        }
    }
    async function reload() {
        if (!storageReady()) return;
        try {
            var items = await window.nasAppFile.list(P.routeDir);
            var want = {}; var d = new Date(); want[monthOf(d)] = 1; d.setMonth(d.getMonth() - 1); want[monthOf(d)] = 1;
            var files = (items || []).filter(function (it) {
                var n = String((it && (it.name || it.path)) || '');
                var m = /^(\d{4}_\d{2})__/.exec(n.split('/').pop());
                return m && want[m[1]] && /\.json$/i.test(n);
            });
            var all = [];
            for (var i = 0; i < files.length; i++) {
                var n = String(files[i].name || files[i].path).split('/').pop();
                try {
                    var doc = await window.nasAppFile.get(P.routeDir + '/' + n, { json: true });
                    if (doc && Array.isArray(doc.entries)) all = all.concat(doc.entries);
                } catch (e) { /* 한 파일 실패가 전체를 막지 않는다 */ }
            }
            _routes = { loaded: Date.now(), entries: all.concat(_buf) };
        } catch (e) {
            if (e && e.status === 404) { _routes.loaded = Date.now(); return; }   // 폴더가 아직 없다 — 정상
            console.warn('[메일 배분 기록] 읽기 실패:', e && e.message);
        }
    }
    window._mailRoutes = function () { return _routes.entries.slice(); };
    window._mailRoutesFlush = flush;
    window._mailRoutesReload = reload;

    // 가족 설정 파일 — 설정 화면(js/15c)이 쓰고 여기서 읽는다. Drive 모드(nasAppFile 없음)면 빈 설정.
    var CFG_REL = 'App_Config/MailRouting_Shared.json';
    window._mailRoutingCfgRel = CFG_REL;
    window.mailRoutingLoadConfig = async function () {
        if (!storageReady()) return _cfg;
        try { var d = await window.nasAppFile.get(CFG_REL, { json: true }); if (d && typeof d === 'object') _cfg = { families: d.families || {} }; }
        catch (e) { console.warn('[메일 배분] 가족 설정 읽기 실패(기본값):', e && e.message); }
        return _cfg;
    };
    window.mailRoutingSaveConfig = async function (cfg) {
        _cfg = { families: (cfg && cfg.families) || {} };
        if (!storageReady()) return false;
        await window.nasAppFile.put(CFG_REL, { v: 1, savedAt: new Date().toISOString(), families: _cfg.families });
        return true;
    };
    window.mailRoutingConfig = function () { return _cfg; };
    /** 설정 화면용 — 지금 후보들을 가족으로 묶어 보여준다(자동 묶음 + 사람 설정 반영) */
    window.mailRoutingFamilies = function (cands) {
        var F = buildFamilies(cands || []);
        return Object.keys(F.fams).map(function (r) {
            var f = F.fams[r];
            return { id: r, label: f.label, name: f.name, primary: f.primary != null ? cands[f.primary] : null,
                     members: f.members.map(function (i) { return cands[i]; }) };
        }).sort(function (a, b) { return b.members.length - a.members.length; });
    };

    /** 같은 스레드가 이미 확정돼 간 곳 — ① In-Reply-To/References(백엔드 `refs`, Message-ID 해시)가 기록된 메일의 key 와 맞으면
     *  **진짜 스레드**(JWZ 알고리즘의 핵심 — 제목이 범용이어도 틀리지 않는다) ② 없으면 정규화 제목(길이 ≥ threadMinLen).
     *  교정(correct/undo)된 스레드는 제외. 두 프로젝트로 갈렸으면 null. */
    function threadTarget(mail, cands) {
        var refs = (mail && Array.isArray(mail.refs)) ? mail.refs : [];
        var sn = normSubject(mail && mail.subject);
        var bySubject = sn.length >= P.threadMinLen;
        if (!refs.length && !bySubject) return null;
        var since = Date.now() - P.threadDays * 86400000;
        var votes = {}, bad = {};
        _routes.entries.forEach(function (e) {
            if (!e) return;
            var hit = (refs.length && e.key && refs.indexOf(e.key) !== -1) || (bySubject && e.subj === sn);
            if (!hit) return;
            if (Date.parse(e.at || 0) < since) return;
            if (e.type === 'correct' || e.type === 'undo') { bad[e.fid] = 1; return; }
            if (e.type === 'placed' && e.fid) votes[e.fid] = (votes[e.fid] || 0) + 1;
        });
        var fids = Object.keys(votes).filter(function (f) { return !bad[f]; });
        if (fids.length !== 1) return null;
        var cand = cands.filter(function (c) { return c.drive_file_id === fids[0]; })[0];
        return cand ? { cand: cand, n: votes[fids[0]] } : null;
    }

    // ── ③ 쓰기 훅 — 성공한 배치 1건 ─────────────────────────────────────────
    var _placedSeen = {};   // key|fid → ts (한 세션에서 같은 배치를 두 번 기록하지 않는다)
    window._mailRoutePlaced = function (fid, fname, task, mailRaw, how) {
        try {
            var key = window.mailKeyOf(mailRaw);
            var sig = (key || norm((mailRaw && mailRaw.subject) || (task && task['업무명']) || '')) + '|' + fid;
            if (_placedSeen[sig] && Date.now() - _placedSeen[sig] < 10 * 60000) return false;
            _placedSeen[sig] = Date.now();
            record({ type: 'placed', key: key, subj: normSubject(mailRaw && mailRaw.subject), from: senderEmail(mailRaw && mailRaw.sender),
                     fid: fid || '', fname: fname || '', how: how || 'auto',
                     routing: (task && task._routing) || null });
            // 기존 사슬(26 토픽 신호 → 48 NAS .eml 이동 → 61 로컬 근거 기록)을 **한 번** 부른다
            if (window._tpAppendMailSignal && fid) {
                var r = Object.assign({}, mailRaw || {});
                window._tpAppendMailSignal(fid, task, r);
            }
            return true;
        } catch (e) { console.warn('[메일 배분 기록] 훅 실패(배치는 그대로):', e && e.message); return false; }
    };
    /** ⑥ 사람의 교정 — "그 프로젝트가 아니다" */
    window.mailRouteCorrect = function (fid, mailRaw, reason, toFid) {
        try {
            record({ type: 'correct', key: window.mailKeyOf(mailRaw), subj: normSubject(mailRaw && mailRaw.subject),
                     from: senderEmail(mailRaw && mailRaw.sender), fid: fid || '', toFid: toFid || '', reason: reason || '' });
            if (window.mailEvidenceForget) window.mailEvidenceForget(fid || '', mailRaw || {});
            return true;
        } catch (e) { return false; }
    };

    // ── 🧹 색인 다이어트 — unmatchedClusters(군집 백로그)를 색인에서 떼어 보관 파일로 ─────
    //    실측: 색인 780KB 중 532KB 가 군집 803개(전부 count≤4 잡음)였고 메일 분석마다 통째로 내려받았다.
    //    군집 감지(js/29)가 꺼진 상태에서만 권장. 색인은 `projects` 만 남긴다(다른 열쇠는 그대로).
    //    ⚠️ 쓰기 직전에 **다시 읽어** 그 위에 얹는다(그 사이 다른 PC 저장이 사라지지 않게) — 11-04 색인 유실의 교훈.
    window.mailRoutingCompactIndex = async function () {
        if (!storageReady()) return { ok: false, reason: 'NAS 저장소가 아니다(Drive 모드에선 안 한다)' };
        var IDX = 'App_Config/project_index.json', ARC = 'App_Config/unmatchedClusters_archive.json';
        var idx = await window.nasAppFile.get(IDX, { json: true });
        if (!idx || !Array.isArray(idx.projects) || !idx.projects.length) return { ok: false, reason: '색인을 읽지 못했거나 projects 가 비어 있다 — 건드리지 않는다' };
        var clusters = Array.isArray(idx.unmatchedClusters) ? idx.unmatchedClusters : [];
        if (!clusters.length) return { ok: false, reason: '떼어낼 군집이 없다' };
        var beforeKB = Math.round(JSON.stringify(idx).length / 1024);
        var arc = null;
        try { arc = await window.nasAppFile.get(ARC, { json: true }); } catch (e) { arc = null; }
        arc = (arc && Array.isArray(arc.clusters)) ? arc : { v: 1, clusters: [] };
        var seen = {}; arc.clusters.forEach(function (c) { if (c && c.key) seen[c.key] = 1; });
        clusters.forEach(function (c) { if (c && !(c.key && seen[c.key])) arc.clusters.push(c); });
        arc.savedAt = new Date().toISOString();
        await window.nasAppFile.put(ARC, arc);
        var fresh = await window.nasAppFile.get(IDX, { json: true });   // 다시 읽고 그 위에
        if (!fresh || !Array.isArray(fresh.projects) || !fresh.projects.length) return { ok: false, reason: '쓰기 직전 재확인에서 색인이 비어 있었다 — 중단' };
        fresh.unmatchedClusters = [];
        fresh.clustersArchivedAt = arc.savedAt;
        await window.nasAppFile.put(IDX, fresh);
        try { window._projectIndexCache = { data: null, at: 0 }; } catch (e) { /* 무시 */ }
        return { ok: true, moved: clusters.length, beforeKB: beforeKB, afterKB: Math.round(JSON.stringify(fresh).length / 1024) };
    };

    // ── 감싸기 ──────────────────────────────────────────────────────────────
    function wrapBuild() {
        var orig = window._msBuildProjectMatchSection;
        if (typeof orig !== 'function' || orig._mrWrapped) return false;
        window._msBuildProjectMatchSection = function (cands, mailText, hint) {
            try {
                var raw = window._mailParsedRaw || {};
                var lines = String(mailText || '').split('\n');
                remember({ subject: raw.subject || lines[0] || '', sender: raw.sender || lines[1] || '', body: mailText || '', refs: raw.refs || [] }, cands);
            } catch (e) { /* 기억 실패는 판정을 막지 않는다 */ }
            return orig.apply(this, arguments);
        };
        window._msBuildProjectMatchSection._mrWrapped = true;
        window._msBuildProjectMatchSection._meWrapped = !!orig._meWrapped;   // js/61 설치 루프가 "이미 감쌌다" 를 알아보게 표식을 물려준다
        return true;
    }
    function wrapResolve() {
        var orig = window._msResolveAiProjectMatch;
        if (typeof orig !== 'function' || orig._mrWrapped) return false;
        window._msResolveAiProjectMatch = function (task, cands) {
            var tag = orig.apply(this, arguments);
            if (off() || !cands || !cands.length) return tag;
            try {
                var mail = recall(task, cands);
                if (!mail) return tag;
                var j = window.mailRouteJudge(mail, cands, tag);
                var out = tagFromJudge(j, tag);
                if (task && typeof task === 'object') task._routing = { basis: j.basis, decision: j.decision, reason: j.reason };
                bump(j.decision + ':' + j.basis);
                return out;
            } catch (e) { console.warn('[메일 배분 판정] 실패(AI 판정 그대로):', e && e.message); return tag; }
        };
        window._msResolveAiProjectMatch._mrWrapped = true;
        window._msResolveAiProjectMatch._meWrapped = !!orig._meWrapped;
        return true;
    }
    function wrapRegister() {
        var orig = window._msAutoRegisterToProject;
        if (typeof orig !== 'function' || orig._mrWrapped) return false;
        window._msAutoRegisterToProject = async function (uid, task, driveFileId, fileName, mailRaw) {
            var r = await orig.apply(this, arguments);
            try { if (r && r.ok && !r.alreadyPlaced) window._mailRoutePlaced(driveFileId, fileName, task, mailRaw, 'auto'); } catch (e) { /* 무시 */ }
            return r;
        };
        window._msAutoRegisterToProject._mrWrapped = true;
        return true;
    }
    function wrapDist() {
        var orig = window.distSendTaskToTargets;
        if (typeof orig !== 'function' || orig._mrWrapped) return false;
        window.distSendTaskToTargets = async function (task, targets, opts) {
            var r = await orig.apply(this, arguments);
            try {
                var okNames = (r && r.okNames) || [];
                (targets || []).forEach(function (t) {
                    if (okNames.indexOf(t.name) !== -1) window._mailRoutePlaced(t.id, t.name, task, (opts && opts.mailRaw) || (task && task._mailRaw) || null, 'human');
                });
            } catch (e) { /* 무시 */ }
            return r;
        };
        window.distSendTaskToTargets._mrWrapped = true;
        return true;
    }
    /** 같은 (fid, 메일) 신호를 한 세션에서 한 번만 — 여러 경로가 중복해 부르던 것을 여기서 접는다 */
    function wrapSignal() {
        var orig = window._tpAppendMailSignal;
        if (typeof orig !== 'function' || orig._mrWrapped) return false;
        var seen = {};
        window._tpAppendMailSignal = function (fid, task, mailRaw) {
            var sig = fid + '|' + (window.mailKeyOf(mailRaw) || norm((mailRaw && mailRaw.subject) || ''));
            if (seen[sig] && Date.now() - seen[sig] < 10 * 60000) return;
            seen[sig] = Date.now();
            return orig.apply(this, arguments);
        };
        window._tpAppendMailSignal._mrWrapped = true;
        window._tpAppendMailSignal._meWrapped = !!orig._meWrapped;
        return true;
    }
    /** 사람의 "아니다" 두 입구를 교정 기록으로 잇는다 */
    function wrapCorrections() {
        var done = 0;
        if (typeof window.inboxQuickClassify === 'function' && !window.inboxQuickClassify._mrWrapped) {
            var o1 = window.inboxQuickClassify;
            window.inboxQuickClassify = function (uid, reason) {
                try {
                    if (reason === '오매칭' && window.TaskInbox) {
                        var it = window.TaskInbox.load().filter(function (x) { return x.uid === uid; })[0];
                        var mc = it && it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0];
                        if (it) window.mailRouteCorrect((mc && mc.drive_file_id) || '', it.mailRaw, '오매칭');
                    }
                } catch (e) { /* 무시 */ }
                return o1.apply(this, arguments);
            };
            window.inboxQuickClassify._mrWrapped = true; done++;
        }
        if (typeof window.inboxReportFalseMatch === 'function' && !window.inboxReportFalseMatch._mrWrapped) {
            var o2 = window.inboxReportFalseMatch;
            window.inboxReportFalseMatch = function (uid) {
                try {
                    if (window.TaskInbox) {
                        var it = window.TaskInbox.load().filter(function (x) { return x.uid === uid; })[0];
                        var mc = it && it.matchedProject && it.matchedProject.candidates && it.matchedProject.candidates[0];
                        if (it) window.mailRouteCorrect((mc && mc.drive_file_id) || window.currentDriveFileId || '', it.mailRaw, '오매칭 신고');
                    }
                } catch (e) { /* 무시 */ }
                return o2.apply(this, arguments);
            };
            window.inboxReportFalseMatch._mrWrapped = true; done++;
        }
        return done;
    }

    // ── 집계 ────────────────────────────────────────────────────────────────
    var STATS_KEY = 'gantt_mail_routing_stats_v1';
    function bump(k) {
        try {
            var s = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
            s[k] = (s[k] || 0) + 1; s.at = new Date().toISOString();
            localStorage.setItem(STATS_KEY, JSON.stringify(s));
        } catch (e) { /* 꽉 참 */ }
    }
    window.mailRouteStats = function () { try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch (e) { return {}; } };

    // ── ⑤ 대기 재판정 — AI 없이, 지금 규칙으로 ─────────────────────────────
    /** @returns {looked, placed, changed, skipped:{...}} */
    window.mailRouteRejudgePending = async function (opts) {
        opts = opts || {};
        var res = { looked: 0, placed: 0, changed: 0, failed: 0, skipped: {} };
        if (off() || !window.TaskInbox) { res.skipped.off = 1; return res; }
        if (!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled()) && !opts.force) { res.skipped.mode_off = 1; return res; }
        var cands;
        try { cands = window._msFilterCandidateProjects(await window._msLoadProjectIndex()); } catch (e) { cands = []; }
        if (!cands || !cands.length) { res.skipped.no_candidates = 1; return res; }
        var list = window.TaskInbox.load();
        var pend = list.filter(function (it) { return it.status === '대기' && it.task; });
        var max = opts.max || P.rejudgeMax, tried = 0;
        for (var i = 0; i < pend.length && tried < max; i++) {
            var it = pend[i];
            res.looked++;
            var mr = it.mailRaw || {};
            var body = mr.body2000 || (it.task && it.task['상세내용']) || '';
            var mail = { subject: mr.subject || (it.task && it.task['업무명']) || '', sender: mr.sender || '', body: body, refs: mr.refs || [] };
            // 저장돼 있던 AI 판정을 되살려 AI 보조로만 쓴다(후보 참조는 지금 색인으로 다시 맞춘다)
            var mp = it.matchedProject || null;
            var aiTag = null;
            if (mp && mp.candidates && mp.candidates.length) {
                var live = mp.candidates.map(function (c) { return cands.filter(function (x) { return x.drive_file_id === c.drive_file_id; })[0]; }).filter(Boolean);
                var conf = mp.routing ? mp.routing.aiConfidence : mp.confidence;
                if (live.length) aiTag = { status: (conf === '상' && live.length === 1) ? 'matched' : 'ambiguous', candidates: live, confidence: conf || '', matchBasis: mp.matchBasis || '' };
            }
            var j;
            try { j = window.mailRouteJudge(mail, cands, aiTag); } catch (e) { res.failed++; continue; }
            var newTag = tagFromJudge(j, aiTag);
            // 판정 결과를 카드에 반영(후보·근거) — 사람이 "왜 대기인지" 를 새 규칙으로 본다
            // [2026-11-23] 판정이 그대로면 저장하지 않는다 — 이제 스윕마다(10분) 돌기 때문에, 대기 144건이면
            //  보관함 통째(실측 2MB) 읽기·쓰기를 매번 144번 하게 된다(14c 가 경고한 "화면이 멈춤" 의 그 비용).
            var sameTag = newTag && mp && mp.routing && mp.routing.basis === newTag.routing.basis
                && (mp.candidates || []).map(function (c) { return c.drive_file_id; }).join('|')
                   === (newTag.candidates || []).map(function (c) { return c.drive_file_id; }).join('|');
            if (newTag && !sameTag) {
                var fresh = window.TaskInbox.load();
                var cur = fresh.filter(function (x) { return x.uid === it.uid; })[0];
                if (cur) { cur.matchedProject = newTag; window.TaskInbox.save(fresh); res.changed++; }
            }
            if (j.decision !== 'auto' || !j.target || !j.target.drive_file_id) continue;
            var t = it.task;
            if (window._ibRepairDatesFromMail) { try { window._ibRepairDatesFromMail(it.uid); } catch (e) { /* 무시 */ } }
            var fresh2 = window.TaskInbox.load().filter(function (x) { return x.uid === it.uid; })[0];
            t = (fresh2 && fresh2.task) || t;
            if (String(t['시작일'] || '').indexOf('날짜확인필요') !== -1 || String(t['완료일'] || '').indexOf('날짜확인필요') !== -1) { res.skipped.date = (res.skipped.date || 0) + 1; continue; }
            tried++;
            t._routing = { basis: j.basis, decision: j.decision, reason: j.reason };
            try {
                var r = await window._msAutoRegisterToProject(it.uid, t, j.target.drive_file_id, j.target.file_name, it.mailRaw, 0, !!it.alarmWorthy, { coalesce: false, noTopicRegen: true });
                if (r && r.ok) {
                    window.TaskInbox.setStatus(it.uid, '자동배치됨', { type: '재판정 배치(' + j.basis + ')', target: j.target.file_name, at: new Date().toISOString() });
                    res.placed++;
                } else {
                    res.failed++;
                    if (window._ibMarkAutoPlaceFail) window._ibMarkAutoPlaceFail(it.uid, (r && r.reason) || 'rejudge_failed');
                }
            } catch (e) { res.failed++; }
            await new Promise(function (r2) { setTimeout(r2, 400); });
        }
        if (typeof window.renderTaskInbox === 'function') { try { window.renderTaskInbox(); } catch (e) { /* 무시 */ } }
        if (opts.toast !== false && window.showToast && (res.placed || opts.force)) {
            window.showToast(T('🧭 대기 ' + res.looked + '건 재판정 — 배치 ' + res.placed + '건' + (res.failed ? ' · 실패 ' + res.failed : ''),
                              '🧭 Re-judged ' + res.looked + ' pending — placed ' + res.placed + (res.failed ? ' · failed ' + res.failed : '')), 'info', 6000);
        }
        return res;
    };
    /** 유휴 스윕(js/14c)에 편승 — 스윕이 돌 때 재판정도 한 번(상한 안에서) */
    function wrapSweep() {
        var orig = window._ibAutoPlaceSweep;
        if (typeof orig !== 'function' || orig._mrWrapped) return false;
        window._ibAutoPlaceSweep = async function (opts) {
            var r = await orig.apply(this, arguments);
            try {
                // [2026-11-23] 'none'(자동배치할 '매칭 확정' 건이 없다)도 돌린다 — 대기가 전부 모호(ambiguous)일 때가 바로
                //  재판정이 필요한 때인데, 예전엔 그 경우 스윕이 'none' 을 돌려줘 재판정이 한 번도 안 돌았다(실측: 대기 144건 중 routing 0).
                if (!off() && r && (!r.skipped || r.skipped === 'none')) await window.mailRouteRejudgePending({ toast: false, max: 5 });
            } catch (e) { /* 무시 */ }
            return r;
        };
        window._ibAutoPlaceSweep._mrWrapped = true;
        return true;
    }

    // ── 설치 ────────────────────────────────────────────────────────────────
    window._mailRoutingInstall = function () {
        return { build: wrapBuild(), resolve: wrapResolve(), register: wrapRegister(), dist: wrapDist(),
                 signal: wrapSignal(), corrections: wrapCorrections(), sweep: wrapSweep() };
    };
    (function install(tries) {
        window._mailRoutingInstall();
        var done = window._msResolveAiProjectMatch && window._msResolveAiProjectMatch._mrWrapped
                && window._msBuildProjectMatchSection && window._msBuildProjectMatchSection._mrWrapped
                && window._msAutoRegisterToProject && window._msAutoRegisterToProject._mrWrapped;
        if (!done && tries < 20) setTimeout(function () { install(tries + 1); }, 500);
    })(0);
    setTimeout(function () { window.mailRoutingLoadConfig(); reload(); }, 12000);
    setInterval(function () { flush(); }, Math.max(15, P.flushSec) * 1000);
    setInterval(function () { if (!document.hidden) reload(); }, Math.max(2, P.reloadMin) * 60000);
    window.addEventListener('pagehide', function () { try { flush(); } catch (e) { /* 닫는 중 */ } });

    try {
        if (window.STORAGE_REGISTRY && !window.STORAGE_REGISTRY.some(function (x) { return x.key === STATS_KEY; })) {
            window.STORAGE_REGISTRY.push({ key: STATS_KEY, label: '메일 배분 판정 집계', labelEn: 'Mail routing stats', cls: 'cache', strategy: { type: 'drop' } });
            window.STORAGE_REGISTRY.push({ key: P.offKey, label: '메일 배분 판정 끄기 스위치', labelEn: 'Mail routing kill switch', cls: 'setting', strategy: { type: 'keep' } });
        }
    } catch (e) { /* 레지스트리 없음 */ }
    window._mailRoutingNorm = { norm: norm, normSubject: normSubject, buildFamilies: buildFamilies, identsOf: identsOf };
})();
