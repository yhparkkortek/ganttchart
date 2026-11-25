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
        customerUniqueInch: true,  // [2026-11-23 사용자 결정] 고객만 확정 + 그 고객 안에서 인치가 맞는 프로젝트가 하나뿐 → 배치('LNW 3.0” AD BD' → SHUFFLER 3.0)
        customerAiSingleMid: true, // [2026-11-23 사용자 결정] 고객만 확정 + AI 가 그 고객 안에서 하나만 고름(중) → 배치
        subjectFirst: true,      // [2026-11-23] 제목만으로 결정론 판정이 나오면 본문(인용·서명)보다 우선
        deterministicFirst: true, // [2026-11-23 사용자 지시] AI 호출 전 결정론 판정 → 확정되면 AI 는 업무 정리만(후보 목록 안 줌)
        aiRequiresCitation: true, // [2026-11-23 사용자 지시] AI 가 고른 후보는 본문 근거(인용 검증·결정론 기록)가 있을 때만 따른다
        headlessTopicRegen: false, // [2026-11-23] 다른 프로젝트 파일에 배치할 때 토픽 프로파일 AI 재생성을 기다리지 않는다(js/15b)
        familyAllWhenNoPrimary: true, // [2026-11-23 사용자 결정] 가족은 확정·모델 단서 없음·대표 없음 → 형제 **모두**에 배치(가족별로 '대기' 선택 가능)
        familyAllMax: 3,          // 형제 모두 배치의 상한 — 이보다 큰 가족은 모두에 뿌리지 않고 대기
        familyModelPrefixMin: 9,
        // [2026-11-25 실측] '강한 단서' 로 칠 숫자 — 제품 관리번호(5xxxxx)·고객 PN(7자리+)만. 반제품·원자재 코드(30xxxx·13xxxx)는
        //  여러 제품이 같이 쓴다 — SSBT 견적 메일 본문의 보드 코드 302601·303033 이 OBSIDIAN27 DB 로 끌고 갔다.
        strongNumRe: '^(?:5\\d{5}|\\d{7,})$',
        commonToCustomer: true,   // [2026-11-23 사용자 결정] 회의록·로드맵 같은 공통 건(제목 어휘 MAIL_ROUTING_COMMON_WORDS)이 한 고객사로 모이면 그 고객사 프로젝트 **전부**에
        commonCustomerMax: 20,    // 공통 건을 뿌릴 고객사 프로젝트 수 상한 — 넘으면 대기(사유에 적는다). 12 였는데 K27 등록으로 LNW 가 13곳이 되자 회의록이 조용히 대기로 빠졌다(2026-11-23)  // 같은 고객 + 모델명 앞부분(정규화)이 이만큼 같으면 형제('AMUSNET 55…' → 'amusnet55')
        routeDir: 'App_Config/MailRoutes',
        flushSec: 60,
        reloadMin: 10,
        rejudgeMax: 20,          // 한 번 재판정에서 배치 시도 상한(스윕 비용)
        autoKeywordSignal: false // js/26 의 "메일 제목 단어를 토픽 키워드에 자동 누적" — 끈다(범용어 흡수·15개 동결)
    };
    var P = window.MAIL_ROUTING_POLICY;
    // 판정 규칙 버전 — 카드의 routing.v 에 적는다. 배경 재판정은 같은 버전으로 이미 본 카드를 건너뛴다.
    //  ⚠️ 판정 규칙(식별자·가족·문턱)을 바꾸면 이 값을 올릴 것 — 안 올리면 옛 판정 카드가 배경에서 다시 안 보인다.
    var RULE_V = '2026-11-25d';
    window.MAIL_ROUTING_RULE_V = RULE_V;
    /** 카드의 사유 글에서 AI 사유만 — 재판정마다 '🧭 판정 · 🤖 (이전 사유 전체)' 로 겹겹이 길어지던 것(실측) */
    function aiReasonOnly(mb) {
        var t = String(mb || '');
        var k = t.lastIndexOf(' · 🤖 ');
        if (k !== -1) t = t.slice(k + 5);
        else if (/^\s*🧭/.test(t)) t = '';
        return t.slice(0, 400);
    }
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
        'digital', 'landscape', 'dimension', 'roadmap',
        // [2026-11-24 실측] 패널 제조사 — 여러 제품이 같은 패널사를 쓴다. Obsidian55 키워드 'CSOT' 가 Cosmic Upright 49" 결재 문서
        //  ('EC Panel(CSOT) + AD BD 변경')에 걸려 충돌했다. 3자 이하(BOE·AUO·INX)는 이미 길이 규칙에 걸린다.
        'csot', 'innolux', 'tianma', 'sharp', 'samsung', 'lgdisplay',
        // [2026-11-24 실측] 형태·곡률을 말하는 낱말 — KGP-4 키워드 'slim'·'1500R' 이 LNW Slim Slot 결재 4건·Amusnet 55J1500R 결재 3건을
        //  KGP-4 로 끌고 갔다(메일도 같은 판정). 'curved' 는 위에 이미 있다. 곡률(R)은 흔한 값만 적는다.
        'slim', 'narrow', 'ultraslim', 'thin', 'ccurved', 'jcurved', 'scurved', '1000r', '1500r', '1650r', '1800r', '2300r', '3000r', '4000r',
        // [2026-11-24 실측] 회사 공통 낱말 — 새 프로젝트 SLIM SLOT IDECK 키워드의 'GAME'(모든 ECO 제목 머리 'GAME_')·'VINA'(베트남 공장) 가
        //  식별자로 잡혀 실문서 287건 중 6건이 잘못 자동배치·13건이 대기로 떨어졌다. 'gaming' 도 같은 뜻으로 쓰인다.
        'game', 'gaming', 'vina', 'vietnam',
        // [2026-11-25 실측] 'data' 가 사람 배치 2건으로 STELLAR32 의 '배운 단서'가 되어 공지('마감 일정')·Sustainability Data 메일 등
        //  10건을 STELLAR32 로 끌고 갔다. 새 프로젝트 키워드의 문서 종류·부품 종류 낱말('환경 대응'·'신뢰성 시험'·'EC Panel'·'AD BD')도
        //  Cosmic Dual 결재를 Cosmic iDeck 로 보냈다 — 여러 프로젝트가 같이 쓰는 말이라 식별자가 아니다.
        'data', 'request', 'report', 'notice', 'schedule', 'information',
        '환경대응', '신뢰성시험', '분쟁광물', '제품인정시험', 'fai샘플', 'rohs', 'reach', 'ecpanel', 'adbd',
        // [2026-11-25 실측] 제품 형태 이름 — 새 프로젝트 'UNIDESA>BTN' 의 'btn' 이 "Dual MVD, TOPPER, BTN" 이 적힌 L&W 공통 메일 3건을 끌고 갔다.
        'btn', 'mvd', 'mvdc', 'tvd', 'tpr'
    ];
    var STOP = {}; window.MAIL_ROUTING_STOPWORDS.forEach(function (w) { STOP[norm(w)] = 1; });
    // [2026-11-23] 우리 회사 이름 — 서명·제목("> KORTEK")·주소에 **모든 메일**에 나온다. 고객/가족 단서로 쓰면
    //  사내 공용 프로젝트(KORTEK>개발업무)가 늘 "다른 고객"으로 같이 걸려 거의 모든 메일이 충돌(대기)이 됐다(실측 60/144).
    window.MAIL_ROUTING_SELF_ORG = window.MAIL_ROUTING_SELF_ORG || ['kortek', '코텍'];
    var SELF = {}; window.MAIL_ROUTING_SELF_ORG.forEach(function (w) { SELF[norm(w)] = 1; });
    // [2026-11-23] 사내 공용(잡무) 프로젝트 — 모델명이나 고객사 칸 끝 조각이 이 이름이면 그 키워드(부탁·FYI·agile·cs…)는
    //  식별자·가족 토큰으로 쓰지 않는다. 실측: Cosmic Upright 메일이 'agile' 하나로 "식별자는 한 곳(agile)" 충돌.
    //  이 프로젝트로는 스레드 기록·사람 배치·근거 검증된 AI 선택으로만 간다. 데이터 — 이름만 더하면 된다.
    window.MAIL_ROUTING_CATCHALL = window.MAIL_ROUTING_CATCHALL || ['개발업무'];
    var CATCH = {}; window.MAIL_ROUTING_CATCHALL.forEach(function (w) { CATCH[norm(w)] = 1; });
    /** 📋 [2026-11-23 사용자 결정] 공통 건 어휘 — **제목**에 이 말이 있으면 "여러 프로젝트에 공통인 메일"로 본다(데이터).
     *  영문은 낱말 경계, 한글은 부분 일치. 본문은 안 본다(본문엔 meeting 같은 말이 흔하다). */
    window.MAIL_ROUTING_COMMON_WORDS = window.MAIL_ROUTING_COMMON_WORDS ||
        ['회의록', '주간회의', '주간 회의', '정기회의', '로드맵', 'weekly', 'meeting', 'meet', 'minutes', 'mom', 'roadmap', 'road map',
         '요구사항', 'requirement', 'requirements'];   // [2026-11-23] 'New Traceability Requirements …' 같은 고객 전반 요구사항
    function isCommonSubject(subj) {
        var t = String(subj || '').toLowerCase();
        if (!t) return false;
        return window.MAIL_ROUTING_COMMON_WORDS.some(function (w) {
            w = String(w || '').toLowerCase().trim();
            if (!w) return false;
            if (/[가-힣]/.test(w)) return t.indexOf(w) !== -1;
            return new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*') + '([^a-z0-9]|$)').test(t);
        });
    }
    window._mailRouteIsCommonSubject = isCommonSubject;
    window._mailRouteIsCatchAll = function (c) { return isCatchAll(c); };
    function isCatchAll(c) { return !!(c && (CATCH[norm(c.model)] || CATCH[norm(String(c.customer || '').split('>').pop())])); }
    /** 배치 기록(fid·파일 이름)이 잡무 프로젝트를 가리키는가 — 후보 목록에서 찾고, 없으면 파일 이름에 잡무 이름이 있는지로. */
    function catchAllFid(fid, fname, cands) {
        var c = (cands || []).filter(function (x) { return x && ((fid && x.drive_file_id === fid) || (fname && x.file_name === fname)); })[0];
        if (c) return isCatchAll(c);
        var n = norm(fname || '');
        return !!n && Object.keys(CATCH).some(function (w) { return w && n.indexOf(w) !== -1; });
    }
    window._mailRouteIsCatchAllRecord = catchAllFid;

    /** 후보 1개의 식별자 토큰(정규화) — 모델·고객모델명·코드류 keywords(+낱말·연속 두 낱말 조각).
     *  사람 이름·자재내역·범용어·짧은 것 제외. 고유한지(다른 후보에 없는지)는 부르는 쪽이 가른다. */
    function identsOf(c) {
        var out = {};
        if (isCatchAll(c)) return out;
        var root = customerRoot(c.customer);
        var add = function (k, src) {
            if (k == null) return;
            var raw = String(k).trim();
            if (!raw || looksMaterialDesc(raw) || isPerson(raw) || isGeneric(raw)) return;
            var n = norm(raw);
            // [2026-11-24] 'K43'·'K27' 처럼 영문 1~2자+숫자 2자 이상인 모델 코드는 3자라도 식별자 — 4자 규칙에 걸려
            //  'LNW K43 Main (HQ#501823)' 메일이 K43 프로젝트를 못 찾고 '고객만 확정'으로 대기했다(실측). 숫자 뒤 경계는 hit() 가 본다.
            if (n.length < P.identMinLen && !(P.shortModelCode !== false && /^[a-z]{1,2}\d{2,}$/.test(n))) return;
            if (n === root || STOP[n] || SELF[n]) return;    // 고객사명 자체는 가족 토큰(아래) · 우리 회사 이름은 단서 아님
            if (/^\d+$/.test(n) && n.length < 5) return;     // "4.3"·"2026" 류
            out[n] = src;
        };
        var addPieces = function (k, src) {
            var words = String(k || '').split(/[^0-9A-Za-z가-힣.]+/).filter(Boolean);
            words.forEach(function (w) { if (norm(w).length >= 6 && !/^\d+$/.test(norm(w))) add(w, src + ':w'); });
            // [2026-11-24] 첫 낱말이 고객사 이름이면 붙이지 않는다 — 'LnW>Obsidian' 의 'lnwobsidian' 이 제목 'LNW>Obsidian Digital Wheel'
            //  에 걸려 Obsidian55 가 Digital Wheel 과 충돌했다(실측). 고객사+낱말은 가족 단서지 제품 식별자가 아니다.
            //  단 뒤 낱말에 숫자가 있으면(AMUSNET 55J) 모델 식별자라 남긴다 — 다 빼면 Amusnet 55J 문서가 KONAMI 로 갔다(실측).
            for (var i = 0; i + 1 < words.length; i++) { if (root && norm(words[i]) === root && !/\d/.test(words[i + 1])) continue; add(words[i] + words[i + 1], src + ':2'); }
        };
        add(c.model, 'model'); addPieces(c.model, 'model');
        // 🔤 [2026-11-24 사용자 지적 "메일 키워드를 계속 고치지 않고 코드로 찾아야"] 'STELLAR32' 처럼 **글자 5자+ 뒤에 숫자**인
        //  모델 이름이면 글자 부분('stellar')도 식별자로 — 결재 제목은 'LNW Stellar Proto B 샘플 의뢰서' 처럼 숫자를 뗀다(실측 4건).
        //  고유한지(다른 후보에 없는지)는 부르는 쪽이 가르므로 'obsidian27'·'obsidian55' 처럼 형제가 공유하는 글자는 저절로 빠진다.
        //  모델명·고객사 칸 끝 조각만 본다(키워드는 안 본다 — 사람이 적은 자유 낱말이라 범위가 넓다). 끄기: P.alphaStemIdent=false
        var addStem = function (k) {
            if (P.alphaStemIdent === false) return;
            String(k || '').split(/[^0-9A-Za-z]+/).forEach(function (w) {
                var m = norm(w).match(/^([a-z]{5,})\d{1,3}$/);
                if (m) add(m[1], 'stem');
            });
        };
        addStem(c.model);
        String(c.customer || '').split('>').slice(1).forEach(addStem);
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
    /** 가족별 방식(설정 화면) — 'all'(형제 모두) · 'wait'(대기) · ''(기본 = P.familyAllWhenNoPrimary) */
    function familyModeOf(fam) { var nm = fam && (fam.name || fam.label); var f = nm ? _cfg.families[nm] : null; return (f && f.mode) || ''; }

    /** 고객사 칸들의 공통 앞부분('LNW>SHUFFLER 4.3"' · 'LNW>SHUFFLER 3.0"' → 'LNW>SHUFFLER') */
    function commonCustomerLabel(list) {
        var segs = (list || []).map(function (c) { return String(c || '').split('>').map(function (x) { return x.trim(); }); });
        if (!segs.length) return '';
        var out = [];
        for (var k = 0; k < segs[0].length; k++) {
            var v = segs[0][k];
            if (segs.every(function (s) { return s[k] === v; })) { out.push(v); continue; }
            var pre = v;
            segs.forEach(function (s) { var t = s[k] || '', j = 0; while (j < pre.length && j < t.length && pre[j] === t[j]) j++; pre = pre.slice(0, j); });
            pre = pre.replace(/[\s\-_.(\[\"'”]+$/, '').trim();
            if (pre.length >= 2) out.push(pre);
            break;
        }
        return out.join('>');
    }
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
                if (shared >= P.familyShareMin) { union(i, j); continue; }
                // [2026-11-23] 같은 고객 + 모델명 앞부분이 길게 같으면 형제 — 실제 앱에선 주소록의 사람 이름(Georgi 등)이 식별자에서 빠져
                //  AMUSNET 55FLAT 이 공유 단어 4개를 못 채우고 떨어져 나갔다('Amusnet 55 Series' 메일이 두 가족 충돌로 대기).
                var ma = norm(a.model), mb = norm(b.model), pl = 0;
                while (pl < ma.length && pl < mb.length && ma[pl] === mb[pl]) pl++;
                if (pl >= (P.familyModelPrefixMin || 9)) union(i, j);
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
            // [2026-11-23] 가족 이름은 형제들 고객사 칸의 **공통 앞부분** — 첫 프로젝트 칸을 그대로 쓰면
            //  'LNW>SHUFFLER 4.3"' 처럼 한 형제 이름이 가족 이름이 돼 설정 화면에서 헷갈렸다(사용자 지적).
            f.label = f.name || commonCustomerLabel(f.members.map(function (i) { return cands[i].customer; })) || (String(c0.customer || '').split('>').slice(0, 2).join('>') || c0.model || '').trim();
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
            if (isCatchAll(c)) return;
            if (root && root.length >= 3 && !SELF[root]) toks[root] = 1;
            String(c.customer || '').split('>').slice(1).forEach(function (p) { var n = norm(p); if (n.length >= 3 && !SELF[n] && !STOP[n]) toks[n] = 1; });   // [2026-11-25] 'UNIDESA>BTN' 의 'btn' 처럼 범용어 조각은 가족 단어가 아니다
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
            if (/\d$/.test(tok) && e0 + 1 < hay.raw.length && /\d/.test(hay.raw[e0 + 1])) continue;   // 'k43' ⊄ "K430"
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
    /** 🧷 [2026-11-23 사용자 지시 "분류 배치에 환각이 작용되지 않도록"] AI 가 고른 후보를 따르기 전에 **본문 근거**를 확인한다.
     *  통과 조건(하나라도): ① 이 앱의 결정론 기록이 같은 후보를 가리킴(js/61 evidence agree_strong·promote)
     *  ② AI 가 낸 "근거인용" 이 본문에 글자 그대로 있고, 그 문장에 **형제(group) 중 이 후보만 가진 단어**가 들어 있음
     *     (js/61 mailEvidenceVerifyCitation, group 을 후보 목록으로 넘겨 형제끼리의 구별을 본다).
     *  예전엔 js/61 이 AI "상" 에만 이 검사를 해서, AI "중" 으로 형제를 고른 family_ai·customer_ai_single 은 근거 없이 배치됐다.
     *  끄기: P.aiRequiresCitation=false. 검증 모듈(js/61)이 없으면 **통과시키지 않는다**(모르면 따르지 않는다). */
    function aiGrounded(aiTag, mail, group, target) {
        if (P.aiRequiresCitation === false) return { ok: true, reason: 'off' };
        if (!aiTag || !target) return { ok: false, reason: 'no_ai' };
        if (aiTag.evidence === 'agree_strong' || aiTag.evidence === 'promote') return { ok: true, reason: aiTag.evidence };
        if (!window.mailEvidenceVerifyCitation || !window.mailEvidenceFor) return { ok: false, reason: 'no_verifier' };
        var task = aiTag.task || null;
        if (!task || !task['근거인용']) return { ok: false, reason: 'no_citation' };
        try {
            var g = (group && group.length) ? group : [target];
            var ev = window.mailEvidenceFor({ subject: (mail && mail.subject) || '', sender: (mail && mail.sender) || '', body: (mail && mail.body) || '' }, g);
            var v = window.mailEvidenceVerifyCitation(task, ev, g, g.indexOf(target));
            return { ok: !!(v.ok && v.specific), reason: v.reason };
        } catch (e) { return { ok: false, reason: 'verify_error:' + e.message }; }
    }
    /** 🆕 본문의 6자리 관리번호(#502246 등)가 **어느 후보 키워드에도 없으면** — 등록된 프로젝트가 없는 제품일 수 있다 */
    function unknownCodeHint(raw, cands) {
        var codes = {}; var re = /#\s?(\d{6})(?!\d)/g, m;
        while ((m = re.exec(raw))) codes[m[1]] = 1;
        var known = {};
        cands.forEach(function (c) { (c.keywords || []).forEach(function (k) { var mm = String(k).match(/\d{6}/g); (mm || []).forEach(function (x) { known[x] = 1; }); }); });
        var unk = Object.keys(codes).filter(function (k) { return !known[k]; });
        return unk.length ? T(' · 관리번호 #' + unk.slice(0, 2).join(', #') + ' 는 어느 프로젝트에도 등록돼 있지 않음 — 새 프로젝트가 필요할 수 있음',
                              ' · control no. #' + unk.slice(0, 2).join(', #') + ' is not registered in any project — may need a new project') : '';
    }
    /** 인치 값이 본문에 "크기"로 나오나 — 4.3 → 4.3" / 4.3” / 4.3인치 / 4.3 inch / 4.3 (앞뒤가 숫자·점 아님).
     *  3.0 처럼 .0 이면 "3\"" "3인치" 처럼 단위가 붙은 3 도 받는다(단위 없는 3 은 너무 흔하다). */
    function inchHit(raw, inch) {
        var v = String(inch || '').trim();
        if (!/^\d+(\.\d+)?$/.test(v)) return false;
        // [2026-11-23] 정수 인치(3·27·55, 또는 3.0)는 **단위가 붙었을 때만**("3\"·3인치·3 inch") — 맨 숫자로 받으니
        //  `(GABKJ-3)` 의 -3 이 3인치로 읽혀 SHUFFLER 3.0 에 갈 뻔했다(실측). 소수(4.3)는 단위 없이도 받되
        //  앞이 글자·하이픈·숫자·점이면 안 받는다("V4.3", "ALT-4.3" 같은 버전·코드).
        var m = /^(\d+)(?:\.0)?$/.exec(v);
        if (m) return new RegExp('(^|[^0-9A-Za-z.\\-])' + m[1] + '(?:\\.0)?\\s*(["”″]|인치|inch)', 'i').test(raw);
        var esc = v.replace('.', '\\.');
        return new RegExp('(^|[^0-9A-Za-z.\\-])' + esc + '(?![0-9])(?!\\.[0-9])').test(raw);
    }
    /** 📐 [2026-11-23 사용자 결정] 고객만 확정된 메일에서 **인치로 한 프로젝트**를 고른다(결정론). 못 고르면 null.
     *  실데이터로 돌려 보니 인치만 보면 5건 중 4건이 틀렸다 — 그래서 막는 조건이 넷이다:
     *   ① 메일의 인치(단위 붙은 3.0”·소수 4.3)가 그 고객 안 **한 프로젝트**의 인치와만 맞을 것(둘 이상 크기가 걸리면 안 씀)
     *   ② 그 인치를 가진 프로젝트가 고객 안에 **하나뿐**일 것 — 인치 칸뿐 아니라 키워드·모델명에 적힌 크기도 센다
     *      ('Obsidian Digital Wheel 31.5"' 가 키워드에 있어 INX 31.5" 메일이 L7 Jackpot Wheel 로 가면 안 된다)
     *   ③ 메일에 **문자+그 숫자** 모델 코드(K27·S32·ALT3)가 있는데 그 프로젝트 단어가 아니면 안 씀 — 프로젝트가 없는 제품(K27)이다
     *   ④ 크기 바로 앞뒤의 영문 낱말이 일반어(MAIL_ROUTING_INCH_GENERIC)·그 프로젝트 단어가 아니면 안 씀 — '27” SSBT'·'INX 31.5"'
     *   ⑤ 어느 프로젝트에도 없는 관리번호(50xxxx)가 있으면 안 씀 — 다른 제품 얘기다 */
    window.MAIL_ROUTING_INCH_GENERIC = window.MAIL_ROUTING_INCH_GENERIC ||
        ['lcd', 'lcds', 'lcm', 'panel', 'panels', 'display', 'displays', 'monitor', 'screen', 'uhd', 'fhd', 'qhd', 'hd', '4k', 'tft', 'oled', 'touch',
         'ad', 'bd', 'board', 'adbd', 'nre', 'sample', 'samples', 'w', 'with', 'and', 'or', 'the', 'a', 'of', 'for', 'to', 'in', 'is', 'inch', 'size',
         'kortek', 'ktk', 'mvd', 'tvd', 'ptd', 'set', 'sets', 'model', 'pcb', 'cover', 'glass', 'lcm'];
    function inchesOf(c) {
        var out = {}, v = String((c && c.inch) || '').trim();
        if (/^\d+(\.\d+)?$/.test(v)) out[String(parseFloat(v))] = 1;
        var txt = [c && c.model, c && c.customer].concat((c && c.keywords) || []).join(' | ');
        var re = /(^|[^0-9.])(\d{1,3}(?:\.\d+)?)\s*(?:["”″]|''|인치|inch)/gi, m;
        while ((m = re.exec(txt))) out[String(parseFloat(m[2]))] = 1;
        return out;
    }
    function customerInchPick(raw, grp, allCands) {
        var gIn = grp.filter(function (c) { return !isCatchAll(c) && /^\d+(\.\d+)?$/.test(String(c.inch || '').trim()); });
        var gHit = gIn.filter(function (c) { return inchHit(raw, c.inch); });
        if (gHit.length !== 1) return null;
        var t = gHit[0], iv = String(parseFloat(t.inch));
        if (grp.filter(function (c) { return !isCatchAll(c) && inchesOf(c)[iv]; }).length !== 1) return null;          // ②
        var tTok = norm([t.model, t.customer, t.file_name].concat(t.keywords || []).join(' '));
        var GEN = {}; window.MAIL_ROUTING_INCH_GENERIC.forEach(function (w) { GEN[String(w).toLowerCase()] = 1; });
        var okWord = function (w) { w = String(w || '').toLowerCase(); return !w || GEN[w] || tTok.indexOf(norm(w)) !== -1; };
        var reCode = /(^|[^A-Za-z0-9])([A-Za-z]{1,8})(\d{1,3}(?:\.\d+)?)(?![0-9.])/g, m;                                 // ③
        while ((m = reCode.exec(raw))) { if (String(parseFloat(m[3])) === iv && !okWord(m[2] + m[3])) return null; }
        var ivEsc = iv.replace('.', '\.') + (iv.indexOf('.') === -1 ? '(?:\.0)?' : '');                               // ④
        var reAdj = new RegExp('([A-Za-z][A-Za-z0-9]*)?[^A-Za-z0-9.]{0,2}' + ivEsc + '\s*(?:["”″]|인치|inch)?[^A-Za-z0-9가-힣]{0,2}([A-Za-z][A-Za-z0-9]*)?', 'gi');
        var reUnit = new RegExp('(^|[^0-9A-Za-z.\-])' + ivEsc + '\s*(["”″]|인치|inch)', 'i');
        while ((m = reAdj.exec(raw))) {
            if (!reUnit.test(m[0]) && iv.indexOf('.') === -1) continue;            // 단위 없는 정수는 크기 언급이 아니다
            if (!okWord(m[1]) || !okWord(m[2])) return null;
            if (reAdj.lastIndex === m.index) reAdj.lastIndex++;
        }
        var known = {}; (allCands || grp).forEach(function (c) {                              // ⑤
            (c.keywords || []).forEach(function (k) { (String(k).match(/\d{6}/g) || []).forEach(function (x) { known[x] = 1; }); }); });
        var codes = raw.match(/(^|[^0-9])(50\d{4})(?![0-9])/g) || [];
        if (codes.some(function (x) { return !known[x.replace(/\D/g, '')]; })) return null;
        return t;
    }
    /** 📨 [2026-11-23] 제목 먼저 — 제목만으로 **결정론**(식별자·단독 가족·가족 인치·가족 대표)으로 한 곳이 나오면 그걸로 정한다.
     *  본문엔 인용된 옛 메일·서명·참조 목록이 섞여 다른 프로젝트 단어가 거의 늘 있다 — 그 때문에 제목에 고유 번호(#502627)가
     *  있는 메일도 "다른 프로젝트 단어도 여럿" 충돌로 대기였다(실측 대기 96건 중 다수). 제목으로 안 정해지면 예전처럼 제목+본문. */
    var SUBJECT_FIRST_BASES = { identifier: 1, family: 1, family_inch: 1, family_primary: 1 };
    window.mailRouteJudge = function (mail, cands, aiTag) {
        if (P.subjectFirst !== false && mail && mail.subject) {
            var js = judgeCore({ subject: mail.subject, body: '', sender: mail.sender, refs: [] }, cands, null, true);
            if (js.decision === 'auto' && SUBJECT_FIRST_BASES[js.basis]) {
                js.basis = 'subject_' + js.basis;
                js.reason = T('제목: ', 'subject: ') + js.reason;
                return sizeGuard(js, mail);
            }
        }
        return sizeGuard(commonToCustomer(judgeCore(mail, cands, aiTag), mail, cands), mail);
    };
    /** 📐 [2026-11-25 실측] 제목에 크기가 적혀 있는데 자동 대상의 크기와 하나도 안 맞으면 대기 — 결재 가져오기(js/75)에만 있던
     *  크기 가드를 판정기 자체에 둔다. 배경 재판정은 이 함수만 거치므로, 없으면 'KONAMI>75" C Curved' 결재가
     *  'konami' 한 단어로 KGP-4(55") 에 들어갔다. 크기 읽기는 js/75 `_approvalSizesIn` 하나(규칙 두 벌 금지), 오차는 0.6(색인은 반올림). */
    function sizeGuard(j, mail) {
        if (!j || j.decision !== 'auto' || !j.target || P.sizeGuard === false) return j;
        if (j.extra && j.extra.length) return j;   // 여러 곳에 뿌리는 판정(공통 건·형제 모두)은 사람이 정한 규칙이라 크기로 막지 않는다
        var f = window._approvalSizesIn; if (typeof f !== 'function') return j;
        var tin = parseFloat(j.target.inch); if (!tin) return j;
        var ss = f(String((mail && mail.subject) || '')) || [];
        if (!ss.length || ss.some(function (x) { return Math.abs(parseFloat(x) - tin) <= (P.sizeTolerance || 0.6); })) return j;
        return { decision: 'wait', target: null, candidates: [j.target].concat(j.candidates || []).filter(function (c, i, a) { return a.indexOf(c) === i; }).slice(0, 6),
            basis: 'size_mismatch', family: j.family || null, hits: j.hits,
            reason: T('제목의 크기(' + ss.join('·') + '")가 ' + (j.target.file_name || '') + '(' + tin + '")와 다름 — 사람이 고른다',
                'subject size (' + ss.join('/') + '") differs from ' + (j.target.file_name || '') + ' (' + tin + '") — needs a person') };
    }
    /** 📋 [2026-11-23 사용자 결정 "회의록·Road map 같은 공통 건은 고객사 형제 프로젝트로"] 결정론 판정이 '여러 프로젝트라 대기'
     *  (conflict·customer_only·family_unresolved)로 끝났고, 제목이 공통 건 어휘이고, 걸린 후보가 **한 고객사**뿐이면
     *  그 고객사의 프로젝트 **전부**에 배치한다. 고객사가 둘 이상이면 그대로 대기(사람이 카드에서 '팀 전체 배분' 등으로 정한다).
     *  잡무 프로젝트(MAIL_ROUTING_CATCHALL)·자기 회사(SELF_ORG)는 빼고, 상한(commonCustomerMax)을 넘으면 뿌리지 않는다. */
    var COMMON_FROM = { conflict: 1, customer_only: 1, family_unresolved: 1 };
    function commonToCustomer(j, mail, cands) {
        if (!j || j.decision !== 'wait' || !COMMON_FROM[j.basis] || P.commonToCustomer === false) return j;
        // 가족을 고를 때 **다른 고객**의 단어도 있었으면(로드맵 표에 LNW·AMUSNET 이 같이) 한 고객사 건이 아니다 — 하네스 9-6c
        if (j.otherCustomer) return j;
        if (!mail || !isCommonSubject(mail.subject)) return j;
        var roots = {};
        (j.candidates || []).forEach(function (c) { var r = customerRoot(c && c.customer); if (r) roots[r] = 1; });
        var rk = Object.keys(roots);
        if (rk.length !== 1 || SELF[rk[0]]) return j;
        var grp = customerGroup(cands || [], rk[0]).filter(function (c) { return c && c.drive_file_id && !isCatchAll(c); });
        if (!grp.length) return j;
        if (grp.length > (P.commonCustomerMax || 20)) {   // 조용히 빠지지 않게 — 사유에 상한을 적는다
            j.reason = (j.reason || '') + T(' · 공통 건이지만 고객사 프로젝트가 ' + grp.length + '곳(상한 ' + (P.commonCustomerMax || 20) + ')이라 모두에 뿌리지 않음',
                                            ' · common mail but the customer has ' + grp.length + ' projects (limit ' + (P.commonCustomerMax || 20) + ')');
            return j;
        }
        var lbl = commonCustomerLabel(grp.map(function (c) { return c.customer; })) || rk[0].toUpperCase();
        return { decision: 'auto', target: grp[0], extra: grp.slice(1), candidates: grp, basis: 'common_customer', family: null, hits: j.hits,
            reason: T('공통 건(회의록·로드맵 등) · 고객사 ' + lbl + ' 프로젝트 ' + grp.length + '곳 모두에', 'common mail (minutes/roadmap) · all ' + grp.length + ' projects of ' + lbl) };
    }
    /** 🧭 [2026-11-23 사용자 지시 "결정론 판정 먼저 하고 AI 는 업무 정리만"] AI 호출 **전에** 부른다(js/15c msCallGemini).
     *  AI 없이(aiTag=null) 판정해 결정론 근거로 한 곳이 확정되면 {target, basis, reason, family}, 아니면 null.
     *  null 이면 호출부가 예전처럼 후보 목록을 주고 AI 에게 고르게 한다. 끄기: P.deterministicFirst=false 또는 offKey. */
    var PRE_BASES = { identifier: 1, family: 1, family_inch: 1, family_primary: 1, thread: 1, family_all: 1, family_named: 1, common_customer: 1, customer_inch: 1 };
    window.mailRoutePreJudge = function (mail, cands) {
        if (off() || P.deterministicFirst === false || !cands || !cands.length || !mail) return null;
        var j = window.mailRouteJudge(mail, cands, null);
        if (j.decision !== 'auto' || !j.target || !j.target.drive_file_id) return null;
        if (!PRE_BASES[String(j.basis || '').replace(/^subject_/, '')]) return null;
        return { target: j.target, extra: (j.extra || []).slice(), basis: j.basis, reason: j.reason, family: j.family || null };
    };
    // ⚡ [2026-11-23] 후보 목록이 같으면 식별자·가족·가족 토큰을 다시 만들지 않는다 — 실측(대기 96건·후보 29개):
    //  판정 1건 24ms 의 대부분이 메일마다 29개 후보의 식별자(사람 이름 판정 포함)를 새로 만드는 비용이었다.
    //  열쇠는 배열 참조 + 길이·id 서명 + 가족 설정 버전(설정을 바꾸면 다시 만든다).
    var _cfgVer = 0;
    var _famCache = (typeof WeakMap === 'function') ? new WeakMap() : null;
    /** 🎓 [2026-11-24 사용자 결정 "사람 배치에서 단서를 배우기"] 사람이 직접 배치한 메일·결재의 **제목 낱말** 중
     *  한 프로젝트로만 간 것을 그 프로젝트의 식별자로 쓴다 — 'Artwork & PCB 제작 발주 의뢰서(LNW>STELLA32 …)' 를 사람이
     *  STELLAR32 에 배치하면 다음엔 'stella32' 로 찾는다(오타·별칭·모델명에 없는 이름). 사람의 배치가 곧 승인이다.
     *  안전장치: ① 사람 배치(how='human')·교정의 옮긴 곳(toFid)만 가르침 — 자동 배치는 가르치지 않는다(추측이 번식하지 않게)
     *  ② 그 낱말이 **다른 프로젝트로 간 기록이 한 번이라도** 있으면(자동 포함) 안 쓴다 ③ 글자만인 낱말은 사람 배치 2번 이상,
     *  숫자가 섞인 코드형(stella32·sbea26)은 1번 ④ 교정(correct)된 배치는 빼고 ⑤ 기존 고유 규칙(다른 후보 식별자와 겹치면 안 씀)을 그대로 지난다.
     *  수치는 P.learn*(데이터), 끄기 P.learnFromHuman=false. 확인: window.mailRouteLearnedAliases() */
    var _learn = { n: -1, map: {} };
    function subjWords(raw) {
        var out = [];
        String(raw || '').split(/[^0-9A-Za-z가-힣]+/).forEach(function (w) {
            var n = norm(w);
            if (!n || !/[a-z0-9]/.test(n) || /[가-힣]/.test(n)) return;            // 영문·숫자 낱말만 — 한글 낱말은 범용어가 대부분(의뢰서·신청서)
            if (n.length < P.identMinLen && !/^[a-z]{1,2}\d{2,}$/.test(n)) return;
            if (/^\d+$/.test(n) && n.length < 5) return;
            if (/^2\d(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(n)) return;   // [2026-11-25] YYMMDD 날짜 꼴('_LNW_260909' PO 날짜)
            if (/^20\d{6}$/.test(n) || /^(rev|ver|v|r|ecr|eco)\d+$/.test(n) || /^(eco|ecr)\d{4}[a-z]{2}\d{2}$/.test(n)) return;   // 날짜·리비전·ECO 번호
            if (STOP[n] || SELF[n] || CATCH[n] || isGeneric(w) || isPerson(w)) return;
            if (out.indexOf(n) === -1) out.push(n);
        });
        return out;
    }
    function learnedAliases() {
        var E = (_routes && _routes.entries) || [];
        if (P.learnFromHuman === false) return {};
        if (_learn.n === E.length) return _learn.map;
        var since = Date.now() - P.threadDays * 86400000;
        var teach = {}, anyFid = {}, bad = {};
        E.forEach(function (e) { if (e && e.type === 'correct' && e.fid) bad[(e.key || e.subj || '') + '|' + e.fid] = 1; });
        E.forEach(function (e) {
            if (!e || !e.s || Date.parse(e.at || 0) < since) return;
            var fid = e.type === 'placed' ? e.fid : (e.type === 'correct' ? e.toFid : '');
            if (!fid) return;
            var human = (e.type === 'placed' && e.how === 'human') || e.type === 'correct';
            if (e.type === 'placed' && bad[(e.key || e.subj || '') + '|' + fid]) return;
            subjWords(e.s).forEach(function (t) {
                (anyFid[t] = anyFid[t] || {})[fid] = 1;
                if (human) { teach[t] = teach[t] || {}; teach[t][fid] = (teach[t][fid] || 0) + 1; }
            });
        });
        var map = {};
        Object.keys(teach).forEach(function (t) {
            var fids = Object.keys(anyFid[t] || {});
            if (fids.length !== 1 || !teach[t][fids[0]]) return;
            var need = /\d/.test(t) && /[a-z]/.test(t) ? (P.learnMinCode || 1) : (P.learnMinPlain || 2);
            if (teach[t][fids[0]] >= need) map[t] = fids[0];
        });
        _learn = { n: E.length, map: map };
        return map;
    }
    window.mailRouteLearnedAliases = function () { return Object.assign({}, learnedAliases()); };
    function prepared(cands) {
        var learned = learnedAliases(), learnedN = Object.keys(learned).length;
        var sig = _cfgVer + '|L' + _learn.n + '|' + cands.length + '|' + cands.map(function (c) { return (c.drive_file_id || c.file_name || '') + ':' + (c.updated_at || '') + ':' + ((c.keywords || []).length); }).join(',');
        var hitC = _famCache && _famCache.get(cands);
        if (hitC && hitC.sig === sig) return hitC;
        var F = buildFamilies(cands);
        // 🎓 배운 단서 — 가족 묶기(buildFamilies)엔 안 넣는다(사람 배치 몇 건이 형제 관계를 바꾸면 안 된다). 식별자로만.
        if (learnedN) Object.keys(learned).forEach(function (t) {
            var i = cands.findIndex(function (c) { return c.drive_file_id === learned[t]; });
            if (i >= 0 && !F.idents[i][t]) F.idents[i][t] = 'learned';
        });
        var owner = {};
        F.idents.forEach(function (m, i) { for (var k in m) owner[k] = (owner[k] === undefined) ? i : -1; });
        var famToks = {};
        Object.keys(F.fams).forEach(function (fid) { famToks[fid] = Object.keys(familyTokens(cands, F.fams[fid], F.idents)); });
        var rec = { sig: sig, F: F, owner: owner, famToks: famToks };
        if (_famCache) _famCache.set(cands, rec);
        return rec;
    }
    function judgeCore(mail, cands, aiTag, strictOther) {
        var raw = String((mail && mail.subject) || '') + '\n' + String((mail && mail.body) || '');
        var hayNorm = buildHay(raw), hayRaw = raw.replace(/\s+/g, ' ');
        cands = cands || [];
        var PR = prepared(cands);
        var F = PR.F;
        var idents = F.idents;
        // 어느 후보에도 겹치지 않는 "고유" 식별자 vs 공유 식별자
        var owner = PR.owner;
        var uniqHits = cands.map(function () { return []; });
        var famHit = {};   // famId → hits
        idents.forEach(function (m, i) {
            for (var k in m) if (owner[k] === i && hit(hayNorm, hayRaw, k)) uniqHits[i].push(k);
        });
        Object.keys(F.fams).forEach(function (fid) {
            var hs = PR.famToks[fid].filter(function (k) { return hit(hayNorm, hayRaw, k); });
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
            // [2026-11-23] 내 가족도 맞은 단어(고객 root 'lnw'·공통 'obsidian' 등)는 "다른 가족의 증거"로 세지 않는다 —
            //  안 빼면 제목에 고유 번호(#502627)가 있는 OBSIDIAN27 메일이 Digital Wheel 의 lnw·obsidian 2개로 충돌이 됐다(실측).
            var mine = {}; (famHit[myFam] || []).forEach(function (t) { mine[t] = 1; }); uniqHits[i1].forEach(function (t) { mine[t] = 1; });
            // [2026-11-23] 다른 가족 **둘 이상**이 함께 가진 단어(고객 root 'lnw' 처럼)도 "특정 다른 프로젝트"의 증거가 아니다 —
            //  실측: SSBT(고객 root 'lnwsg') 제목의 'LNW' 가 다른 LNW 가족 9곳에 하나씩 걸려 제목 판정이 충돌이 됐다.
            var famsOfTok = {};
            Object.keys(famHit).forEach(function (f) { if (f !== myFam) famHit[f].forEach(function (t) { famsOfTok[t] = (famsOfTok[t] || 0) + 1; }); });
            //  ⚠️ **제목 판정에서만** — 본문(인용·표)에선 이 공통 단어들이 "여러 프로젝트 얘기" 라는 실제 신호라 그대로 센다
            //  (본문에까지 적용했더니 'Panel Roadmap … for Obsidian55' 가 로드맵 표의 패널 부품번호 하나로 AMUSNET 55FLAT 에 갔다 — 실측).
            if (strictOther) Object.keys(famsOfTok).forEach(function (t) { if (famsOfTok[t] >= 2) mine[t] = 1; });
            var otherStrong = Object.keys(famHit).filter(function (f) {
                // 제목 판정(strictOther)에선 다른 프로젝트 단어가 **하나**만 있어도 충돌 — 제목은 짧아서 거기 나온 다른 프로젝트는
                //  지나가는 언급이 아니다("ZITRO ICONI & LnW STELLAR & LnW OBSIDIAN…" 가 한 곳으로 가면 안 된다).
                return f !== myFam && famHit[f].filter(function (t) { return !mine[t]; }).length >= (strictOther ? 1 : 2);
            });
            if (otherStrong.length) {
                return out({ decision: 'wait', target: null,
                    candidates: [cands[i1]].concat(otherStrong.slice(0, 2).reduce(function (a, f) { return a.concat(F.fams[f].members.map(function (i) { return cands[i]; })); }, [])).slice(0, 6),
                    basis: 'conflict', reason: T('식별자는 한 곳(' + uniqHits[i1][0] + ')인데 다른 프로젝트 단어도 여럿 — 사람이 고른다', 'identifier points to one project but another project is also discussed — needs a person') });
            }
            return out({ decision: 'auto', target: cands[i1], candidates: [cands[i1]], basis: 'identifier',
                reason: T('식별자 일치: ', 'identifier: ') + uniqHits[i1].slice(0, 3).join(', ')
                    + (uniqHits[i1].some(function (t) { return idents[i1][t] === 'learned'; }) ? T(' (사람 배치에서 배운 단서)', ' (learned from a person)') : ''), family: myFam });
        }
        // ②-0 [2026-11-24 실측 — L7 Jackpot Wheel 결재 4장 충돌] 강한 단서가 한 후보에만 있으면 그 후보 — 키워드 **통째**
        //  = **관리번호(숫자 5자리+)나 모델명 통째**만. 키워드 통째는 강하다고 보지 않는다 — KONAMI 키워드 '1500R'(곡률 사양)이
        //  'Amusnet 55J1500R' 에 걸려 그쪽으로 갈 뻔했다(실측). 공통 건 제목(회의록 등)엔 쓰지 않는다 — 고객사 전부로 가야 한다.
        //  'LNW_L7 Jackpot Wheel 31.5in_502582' 는 L7 의 502582·모델명 통째에 걸리는데 Digital Wheel 의 키워드
        //  'Obsidian Digital Wheel 31.5"' 를 쪼갠 'wheel315' 하나 때문에 충돌이 됐다. 약한 쪽 조각은 이 판정에서 뺀다.
        if (withUniq.length > 1 && famKeys.length > 1 && P.strongBeatsPieces !== false && !isCommonSubject((mail && mail.subject) || '')) {
            var isStrong = function (i, t) { var src = idents[i][t] || ''; return new RegExp(P.strongNumRe || '^\\d{5,}$').test(t) || src === 'model' || t === norm(cands[i].model || ''); };
            var strongIdx = withUniq.filter(function (i) { return uniqHits[i].some(function (t) { return isStrong(i, t); }); });
            if (strongIdx.length === 1) {
                var weakToks = {};
                withUniq.forEach(function (i) { if (i !== strongIdx[0]) { uniqHits[i].forEach(function (t) { weakToks[t] = 1; }); uniqHits[i] = []; } });
                Object.keys(famHit).forEach(function (f) { famHit[f] = famHit[f].filter(function (t) { return !weakToks[t]; }); if (!famHit[f].length) delete famHit[f]; });
                var w0 = strongIdx[0];
                withUniq = [w0]; famsWithUniq = {}; famsWithUniq[famOfIdx(w0)] = 1; famKeys = Object.keys(famsWithUniq);
                var mine2 = {}; (famHit[famOfIdx(w0)] || []).forEach(function (t) { mine2[t] = 1; }); uniqHits[w0].forEach(function (t) { mine2[t] = 1; });
                var famsOfTok2 = {};
                Object.keys(famHit).forEach(function (f) { if (f !== famOfIdx(w0)) famHit[f].forEach(function (t) { famsOfTok2[t] = (famsOfTok2[t] || 0) + 1; }); });
                if (strictOther) Object.keys(famsOfTok2).forEach(function (t) { if (famsOfTok2[t] >= 2) mine2[t] = 1; });
                var other2 = Object.keys(famHit).filter(function (f) { return f !== famOfIdx(w0) && famHit[f].filter(function (t) { return !mine2[t]; }).length >= (strictOther ? 1 : 2); });
                if (!other2.length) return out({ decision: 'auto', target: cands[w0], candidates: [cands[w0]], basis: 'identifier',
                    reason: T('식별자 일치(강한 단서): ', 'identifier (strong): ') + uniqHits[w0].slice(0, 3).join(', '), family: famOfIdx(w0) });
            }
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
        var otherCustomer = false;   // 가족을 고를 때 다른 고객의 단어도 있었나(형제 모두 배치를 막는다)
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
                if (score[fk[0]] >= 1 && score[fk[0]] >= 2 * score[fk[1]]) {
                    famId = fk[0];
                    // [2026-11-23] 다른 **고객**의 단어도 함께 있었다면 기록 — 형제 모두 배치(family_all)는 이때 하지 않는다
                    //  ('Panel Roadmap … LNW Obsidian 55 … AMUSNET 55FLAT' 이 AMUSNET 형제 3곳에 뿌려질 뻔했다 — 하네스 9-6c).
                    var myRoot = customerRoot(cands[F.fams[famId].members[0]].customer);
                    otherCustomer = fk.some(function (f) { return f !== famId && F.fams[f].members.some(function (i) { return customerRoot(cands[i].customer) !== myRoot; }); });
                }
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
            // 📐 [2026-11-23 사용자 결정] 결정론 먼저 — 그 고객 안에서 메일의 인치(단위 붙은 3.0” · 소수 4.3)와 맞는 프로젝트가
            //  **하나뿐**이고 그 인치를 가진 프로젝트도 그 하나뿐이면 배치. 인치가 둘 이상 걸리거나(인용된 다른 크기) 같은 인치
            //  프로젝트가 둘이면(STELLAR32·Digital Wheel 둘 다 32) 안 쓴다. 잡무 프로젝트는 뺀다.
            if (P.customerUniqueInch) {
                var cInch = customerInchPick(raw, grp, cands);
                if (cInch) {
                    return out({ decision: 'auto', target: cInch, candidates: grp, basis: 'customer_inch',
                        reason: T('고객 확정(' + custOnly.toUpperCase() + ') · 그 고객의 ' + cInch.inch + '인치 프로젝트는 하나뿐', 'customer ' + custOnly.toUpperCase() + ' · only one ' + cInch.inch + '" project'),
                        family: famOfIdx(cands.indexOf(cInch)) });
                }
            }
            var gC = (aiIdx !== -1) ? aiGrounded(aiTag, mail, grp, cands[aiIdx]) : null;
            if (aiIdx !== -1 && customerRoot(cands[aiIdx].customer) === custOnly && aiConf === '상' && gC.ok) {
                return out({ decision: 'auto', target: cands[aiIdx], candidates: grp, basis: 'customer_ai',
                    reason: T('고객 확정(' + custOnly.toUpperCase() + ') · 제품은 AI 판단(상)', 'customer ' + custOnly.toUpperCase() + ' confirmed · product by AI (high)'), family: famOfIdx(aiIdx) });
            }
            // [2026-11-23 사용자 결정] 고객 확정 + AI 가 그 고객 안에서 **하나만** 골랐으면 "중" 이어도 배치.
            //  AI 가 둘 이상을 후보로 냈으면(못 좁혔으면) 그대로 대기. 스위치는 P.customerAiSingleMid(데이터).
            if (P.customerAiSingleMid && aiIdx !== -1 && aiConf === '중' && customerRoot(cands[aiIdx].customer) === custOnly) {
                var aiInCust = (aiTag.candidates || []).filter(function (c) { return customerRoot(c.customer) === custOnly; });
                if (aiInCust.length === 1 && gC.ok) {
                    return out({ decision: 'auto', target: cands[aiIdx], candidates: grp, basis: 'customer_ai_single',
                        reason: T('고객 확정(' + custOnly.toUpperCase() + ') · AI 가 제품 하나를 고름(중)', 'customer ' + custOnly.toUpperCase() + ' confirmed · AI picked one product (med)'), family: famOfIdx(aiIdx) });
                }
            }
            return out({ decision: 'wait', target: null, candidates: grp.slice(0, 6), basis: 'customer_only',
                reason: T('고객(' + custOnly.toUpperCase() + ')은 확실한데 어느 제품인지 단서가 없음', 'customer ' + custOnly.toUpperCase() + ' is clear but not which product')
                        + (gC && !gC.ok && (aiConf === '상' || aiConf === '중') ? T(' · AI 선택(' + (cands[aiIdx].model || '') + ')은 본문 근거가 없어 따르지 않음', ' · AI pick ignored: no grounding in the mail') : '')
                        + unknownCodeHint(raw, cands) });
        }
        if (famId) {
            var fam = F.fams[famId];
            var members = fam.members.map(function (i) { return cands[i]; });
            if (fam.members.length === 1) {
                return out({ decision: 'auto', target: members[0], candidates: members, basis: 'family',
                    reason: T('프로젝트 단어 일치: ', 'project words: ') + (famHit[famId] || []).slice(0, 3).join(', '), family: famId });
            }
            // 형제가 여럿 — 모델 식별자(여러 형제가 동시에 맞은 경우는 위 ②에서 걸러짐·여기선 0개)
            // 📐 [2026-11-23] 형제가 인치로 갈리면(SHUFFLER 3.0/4.3) 색인의 inch 칸으로 가른다 — "4.3" 은 숫자가
            //  짧아 식별자에서 빠지므로 "Shuffler Display 4.3\" ESD" 가 가족까지만 확정되고 대기였다(실측).
            //  가족이 이미 확정된 뒤에만 쓴다(아무 메일의 "4.3" 으로 프로젝트를 고르지 않는다). 둘 이상 맞으면 안 쓴다.
            var inchHits = fam.members.filter(function (i) { return inchHit(raw, cands[i].inch); });
            var inchVals = {}; fam.members.forEach(function (i) { inchVals[String(cands[i].inch || '')] = 1; });
            if (inchHits.length === 1 && Object.keys(inchVals).length === fam.members.length) {
                return out({ decision: 'auto', target: cands[inchHits[0]], candidates: members, basis: 'family_inch',
                    reason: T('가족 확정(' + fam.label + ') · 인치 ' + cands[inchHits[0]].inch + ' 로 모델 확정', 'family ' + fam.label + ' · model by size ' + cands[inchHits[0]].inch), family: famId });
            }
            // [2026-11-23] 메일이 형제 **여럿의** 고유 식별자를 직접 적었으면(“55F 502638 / 55C-R2100 / 55J-R1500”) 그 적힌 형제 모두에 —
            //  AI 가 그중 하나를 골라도(근거가 있어도) 하나만 넣으면 나머지 형제 업무가 빠진다.
            var namedSibs = withUniq.filter(function (i) { return famOfIdx(i) === famId; });
            // 📐 [2026-11-24 사용자 결정] 형제 인치를 **여럿** 적었으면("Shuffler display 4.3\" 3.0\"") 그것도 이름으로 적은 것이다.
            if (inchHits.length > 1 && Object.keys(inchVals).length === fam.members.length)
                inchHits.forEach(function (i) { if (namedSibs.indexOf(i) === -1) namedSibs.push(i); });
            // ⚠️ 가족이 '대기' 여도 적힌 형제엔 넣는다 — '대기' 는 **모델을 모를 때 추측하지 말라**는 뜻이지,
            //    문서가 형제를 직접 적은 경우까지 막는 뜻이 아니다(사용자 결정 2026-11-24: SHUFFLER 3.0·4.3 결재 카드).
            if (namedSibs.length > 1 && !otherCustomer && namedSibs.length <= (P.familyAllMax || 3)) {
                return out({ decision: 'auto', target: cands[namedSibs[0]], extra: namedSibs.slice(1).map(function (i) { return cands[i]; }), candidates: members, basis: 'family_named',
                    reason: T('가족 확정(' + fam.label + ') · 메일에 적힌 모델 ' + namedSibs.length + '곳 모두에', 'family ' + fam.label + ' · all ' + namedSibs.length + ' models named in the mail'), family: famId });
            }
            if (fam.primary != null) {
                return out({ decision: 'auto', target: cands[fam.primary], candidates: members, basis: 'family_primary',
                    reason: T('가족 확정(' + fam.label + ') · 모델 단서 없음 → 가족 대표로', 'family ' + fam.label + ' confirmed, no model cue → family primary'), family: famId });
            }
            var gF = (aiIdx !== -1 && famOfIdx(aiIdx) === famId) ? aiGrounded(aiTag, mail, members, cands[aiIdx]) : null;
            if (P.familyAiAuto && gF && gF.ok && (aiConf === '상' || aiConf === '중')) {
                return out({ decision: 'auto', target: cands[aiIdx], candidates: members, basis: 'family_ai',
                    reason: T('가족 확정(' + fam.label + ') · 모델은 AI 판단(' + aiConf + ')', 'family ' + fam.label + ' confirmed · model by AI (' + aiConf + ')'), family: famId });
            }
            // 👨‍👩‍👧 [2026-11-23 사용자 결정] 대표가 없으면 **형제 모두**에 — 형제 사이 오배송은 담당자가 같아 피해가 작고,
            //  "어느 모델인지 모르면 사람이 고른다" 보다 "형제 모두에 넣어 두고 아니면 ♻️" 가 낫다는 판단. 가족별로 '대기' 를 고를 수 있다
            //  (잘못 묶인 가족 대비). 상한(familyAllMax)을 넘는 큰 가족은 뿌리지 않는다.
            var famMode = familyModeOf(fam);
            if (famMode !== 'wait' && (famMode === 'all' || P.familyAllWhenNoPrimary) && members.length <= (P.familyAllMax || 3) && !otherCustomer) {
                return out({ decision: 'auto', target: members[0], extra: members.slice(1), candidates: members, basis: 'family_all',
                    reason: T('가족 확정(' + fam.label + ') · 모델 단서 없음 → 형제 ' + members.length + '곳 모두에', 'family ' + fam.label + ' · no model cue → all ' + members.length + ' siblings'), family: famId });
            }
            return out({ decision: 'wait', target: null, candidates: members, basis: 'family_unresolved', otherCustomer: otherCustomer,
                reason: T('가족은 확정(' + fam.label + ')인데 어느 모델인지 단서가 없음 — 설정에서 가족 대표를 정하면 자동 배치', 'family ' + fam.label + ' confirmed but model unknown — set a family primary in settings to auto-place')
                        + (gF && !gF.ok ? T(' · AI 선택(' + (cands[aiIdx].model || '') + ')은 본문 근거가 없어 따르지 않음', ' · AI pick ignored: no grounding in the mail') : ''), family: famId });
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
    }

    // ── 판정 → projectTag(15b 모양) ────────────────────────────────────────
    function tagFromJudge(j, aiTag) {
        var conf = aiTag && aiTag.confidence;
        var basisTxt = '🧭 ' + j.reason + (aiTag && aiTag.matchBasis ? ' · 🤖 ' + aiTag.matchBasis : '');
        if (j.decision === 'auto') {
            return { status: 'matched', candidates: [j.target], extraCandidates: (j.extra || []).slice(), confidence: '상',
                     matchBasis: basisTxt, routing: { basis: j.basis, family: j.family, aiConfidence: conf || '', v: RULE_V } };
        }
        if (j.decision === 'wait') {
            return { status: 'ambiguous', candidates: j.candidates, extraCandidates: [], confidence: conf || '중',
                     matchBasis: basisTxt, routing: { basis: j.basis, family: j.family, aiConfidence: conf || '', v: RULE_V },
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
        try { var d = await window.nasAppFile.get(CFG_REL, { json: true }); if (d && typeof d === 'object') { _cfg = { families: d.families || {} }; _cfgVer++; } }
        catch (e) { console.warn('[메일 배분] 가족 설정 읽기 실패(기본값):', e && e.message); }
        return _cfg;
    };
    window.mailRoutingSaveConfig = async function (cfg) {
        _cfg = { families: (cfg && cfg.families) || {} }; _cfgVer++;
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
    var TRUSTED_PLACE_BASES = { identifier: 1, family: 1, family_inch: 1, family_primary: 1, thread: 1 };
    function trustedPlacement(e) {
        if (e.how === 'human') return true;
        var b = e.routing && e.routing.basis ? String(e.routing.basis).replace(/^subject_/, '').replace(/^pre_/, '') : '';
        return !!TRUSTED_PLACE_BASES[b];
    }
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
            // 🧷 [2026-11-23] 표만 믿을 만한 배치에서 받는다 — 사람이 배치했거나 결정론 근거로 배치된 것.
            //  AI 판단으로 배치된 기록(옛 규칙의 AI "상"·family_ai 등, routing 없음 포함)을 스레드 근거로 쓰면
            //  AI 의 추측이 "같은 스레드가 여기로 갔다"는 **결정론 근거로 둔갑**해 번식한다. 교정(correct/undo)은 그대로 본다.
            if (e.type === 'placed' && e.fid && trustedPlacement(e)) {
                // 🗂 [2026-11-25 사용자 결정] 잡무 프로젝트(MAIL_ROUTING_CATCHALL)로 간 자동 배치는 표로 안 센다 — 실측: UL Draft 메일이
                //  옛 규칙('kortek' 낱말)으로 개발업무에 잘못 가자, 같은 발신자의 다음 메일까지 그쪽 근거가 됐다. 사람이 넣은 것만 센다.
                if (e.how !== 'human' && catchAllFid(e.fid, e.fname, cands)) return;
                votes[e.fid] = (votes[e.fid] || 0) + 1;
            }
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
            record({ type: 'placed', key: key, subj: normSubject(mailRaw && mailRaw.subject), s: String((mailRaw && mailRaw.subject) || (task && task['업무명']) || '').slice(0, 200), from: senderEmail(mailRaw && mailRaw.sender),
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
            record({ type: 'correct', key: window.mailKeyOf(mailRaw), subj: normSubject(mailRaw && mailRaw.subject), s: String((mailRaw && mailRaw.subject) || '').slice(0, 200),
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
            // 🧭 [2026-11-23] AI 호출 전에 결정론으로 이미 정해진 건(js/15c 가 task._preRouted 를 단다) — AI 매칭 해석(15b·61)을
            //  건너뛰고 그 판정 그대로. AI 는 이 메일에서 프로젝트 후보를 보지도 않았다(업무 정리만 했다).
            if (!off() && task && task._preRouted && task._preRouted.fid && cands && cands.length) {
                var pr = task._preRouted;
                var tgt = cands.filter(function (c) { return c.drive_file_id === pr.fid; })[0];
                if (tgt) {
                    task._routing = { basis: pr.basis, decision: 'auto', reason: pr.reason };
                    bump('auto:pre_' + pr.basis);
                    var extras = (pr.extraFids || []).map(function (f) { return cands.filter(function (c) { return c.drive_file_id === f; })[0]; }).filter(Boolean);
                    var pt = tagFromJudge({ decision: 'auto', target: tgt, extra: extras, candidates: [tgt].concat(extras), basis: pr.basis, reason: pr.reason + ' (AI 매칭 생략)', family: pr.family }, null);
                    pt.routing.pre = true;
                    return pt;
                }
            }
            var tag = orig.apply(this, arguments);
            if (off() || !cands || !cands.length) return tag;
            try {
                var mail = recall(task, cands);
                if (!mail) return tag;
                var j = window.mailRouteJudge(mail, cands, tag ? Object.assign({}, tag, { task: task }) : null);   // task: AI 근거인용 검증용
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
        window._msAutoRegisterToProject = async function (uid, task, driveFileId, fileName, mailRaw, attempt, setAlarm, opts) {
            var r = await orig.apply(this, arguments);
            // [2026-11-23] 보관함에서 사람이 누른 배치(opts.byHuman, js/14c)는 'human' 으로 적는다 — 스레드 근거로 믿을 수 있는 건
            //  사람·결정론 배치뿐이라(trustedPlacement), 이게 'auto' 로 적히면 사람의 교정이 근거로 쌓이지 않는다.
            try { if (r && r.ok && !r.alreadyPlaced) window._mailRoutePlaced(driveFileId, fileName, task, mailRaw, (opts && opts.byHuman) ? 'human' : 'auto'); } catch (e) { /* 무시 */ }
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
                        // [2026-11-23] ♻️ 는 보이는 후보 **전부**를 뺀다(js/14c) — 교정 기록도 후보마다
                        var mcs = (it && it.matchedProject && it.matchedProject.candidates) || [];
                        if (it) mcs.filter(function (c) { return c && c.drive_file_id; }).forEach(function (c) { window.mailRouteCorrect(c.drive_file_id, it.mailRaw, '오매칭'); });
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
        // ⚡ [2026-11-23] "앱을 쓸 수 없을 만큼 느림" 대응 — 실측(대기 96건): 판정 24ms×96 + 건마다 보관함(1.3MB) 읽기·쓰기가
        //  한 덩어리로 화면을 붙잡았고, 그게 유휴 스윕마다(10분) 반복됐다.
        //  · 보관함은 **한 번** 읽고, 바뀐 카드는 모아 두었다가 배치 직전·끝에 **한 번에** 쓴다(그 사이 다른 경로가 바꾼 건 덮지 않게
        //    쓰기 직전에 다시 읽어 '대기' 인 카드에만 얹는다).
        //  · 몇 건마다 화면에 양보한다.
        //  · 스윕(배경)은 **지금 규칙으로 이미 판정한 카드는 건너뛴다**(routing.v === RULE_V). 버튼(force)은 전부 본다.
        var list = window.TaskInbox.load();
        var pend = list.filter(function (it) { return it.status === '대기' && it.task && (!opts.onlyUid || it.uid === opts.onlyUid); });
        var max = opts.max || P.rejudgeMax, tried = 0;
        var pendingTags = {};   // uid → 새 matchedProject
        var flushTags = function () {
            var uids = Object.keys(pendingTags);
            if (!uids.length) return;
            var fresh = window.TaskInbox.load();
            var n = 0;
            fresh.forEach(function (x) { if (pendingTags[x.uid] && x.status === '대기') { x.matchedProject = pendingTags[x.uid]; n++; } });
            pendingTags = {};
            if (n) window.TaskInbox.save(fresh);
        };
        var yieldUi = function () { return new Promise(function (r2) { setTimeout(r2, 0); }); };
        for (var i = 0; i < pend.length && tried < max; i++) {
            var it = pend[i];
            var mp = it.matchedProject || null;
            // ♻️ [2026-11-23] 사람이 "이 프로젝트 아님" 으로 뺀 후보는 이 카드의 판정에서 영영 뺀다(excludedFids, js/14c)
            var cc = (it.excludedFids && it.excludedFids.length)
                ? cands.filter(function (c) { return it.excludedFids.indexOf(c.drive_file_id) === -1; }) : cands;
            if (!opts.force && mp && mp.routing && mp.routing.v === RULE_V) { res.skipped.same_rule = (res.skipped.same_rule || 0) + 1; continue; }
            if (i % 5 === 4) await yieldUi();
            res.looked++;
            var mr = it.mailRaw || {};
            var body = mr.body2000 || (it.task && it.task['상세내용']) || '';
            // 📄 결재 카드에 붙인 그룹웨어 본문은 재판정에 쓰지 않는다 — 판정은 js/75 의 좁은 조건(bodyResolve)만(사양표 오배송 실측)
            if (window.APPROVAL_BODY_MARK && body.indexOf(window.APPROVAL_BODY_MARK) !== -1) body = body.slice(0, body.indexOf(window.APPROVAL_BODY_MARK));
            var mail = { subject: mr.subject || (it.task && it.task['업무명']) || '', sender: mr.sender || '', body: body, refs: mr.refs || [] };
            // 저장돼 있던 AI 판정을 되살려 AI 보조로만 쓴다(후보 참조는 지금 색인으로 다시 맞춘다)
            var aiTag = null;
            if (mp && mp.candidates && mp.candidates.length) {
                var live = mp.candidates.map(function (c) { return cc.filter(function (x) { return x.drive_file_id === c.drive_file_id; })[0]; }).filter(Boolean);
                var conf = mp.routing ? mp.routing.aiConfidence : mp.confidence;
                if (live.length) aiTag = { status: (conf === '상' && live.length === 1) ? 'matched' : 'ambiguous', candidates: live, confidence: conf || '', matchBasis: aiReasonOnly(mp.matchBasis), task: it.task };
            }
            var j;
            try { j = window.mailRouteJudge(mail, cc, aiTag); } catch (e) { res.failed++; res.skipped.judge_error = (res.skipped.judge_error || 0) + 1; continue; }
            // ♻️ 사람이 "이 판단은 틀렸다" 고 한 카드 — 가족·고객 수준 근거로 남은 형제에게 넘기면 추측이다
            //  ("Shuffler 4.3\" ESD" 에서 4.3 을 빼면 SHUFFLER 가족에 3.0 만 남아 '단독 가족' 으로 3.0 에 갈 뻔했다).
            //  고유 식별자·믿을 만한 스레드 기록일 때만 다시 자동, 그 외엔 새 후보로 보여 주고 대기.
            //  ⚠️ "고유" 는 **제외 전 전체 후보** 기준으로 본다 — 형제를 빼고 나면 둘이 함께 쓰던 'shuffler' 가 남은 3.0 만의
            //  고유 식별자처럼 보여 identifier 로 3.0 에 갔다(하네스 13-3 이 잡았다). 전체 후보로 다시 판정해 그 후보에
            //  고유 식별자가 실제로 있었을 때만 식별자 근거로 인정한다.
            var fullUniqOk = true;
            if (it.excludedFids && it.excludedFids.length && j.decision === 'auto' && /identifier$/.test(String(j.basis || '')) && j.target) {
                var jf = null; try { jf = window.mailRouteJudge(mail, cands, null); } catch (e) { jf = null; }
                var ti = cands.indexOf(j.target);
                fullUniqOk = !!(jf && jf.hits && jf.hits.uniq && ti >= 0 && jf.hits.uniq[ti] && jf.hits.uniq[ti].length);
            }
            if (it.excludedFids && it.excludedFids.length && j.decision === 'auto' && (!/(identifier|thread)$/.test(String(j.basis || '')) || !fullUniqOk)) {
                j = { decision: 'wait', target: null, candidates: [j.target], basis: 'excluded_suggest', family: j.family || null,
                      reason: T('오매칭 뒤 다시 본 후보: ' + (j.target.model || j.target.file_name) + ' (확정 근거가 약해 사람 확인)',
                                'after exclusion, candidate: ' + (j.target.model || j.target.file_name) + ' (weak evidence — needs a person)') };
            }
            if (opts.onlyUid) res.target = (j.decision === 'auto' && j.target) ? (j.target.model || j.target.file_name) : '';
            var newTag = tagFromJudge(j, aiTag);
            if (!newTag) {
                // 'none' 도 "지금 규칙으로 봤다" 는 표시는 남긴다(다음 스윕이 또 보지 않게) — 후보·사유는 원래 것 그대로
                newTag = Object.assign({}, mp || { status: 'ambiguous', candidates: [], confidence: '' });
                newTag.routing = Object.assign({}, (mp && mp.routing) || {}, { basis: 'none' });
                if (mp && mp.routing && mp.routing.basis === 'excluded') {
                    newTag.matchBasis = String(newTag.matchBasis || '').replace(' — 다시 판단 중', ' — 다른 곳으로 확정할 근거 없음 ([📤 다른 Proj]·[➕ 새 Proj])')
                                                                        .replace(' — judging again', ' — no other project confirmed');
                }
            }
            newTag.routing.v = RULE_V;
            var sameTag = mp && mp.routing && mp.routing.v === RULE_V && mp.routing.basis === newTag.routing.basis
                && (mp.candidates || []).map(function (c) { return c.drive_file_id; }).join('|')
                   === (newTag.candidates || []).map(function (c) { return c.drive_file_id; }).join('|');
            if (!sameTag) { pendingTags[it.uid] = newTag; res.changed++; }
            if (j.decision !== 'auto' || !j.target || !j.target.drive_file_id) continue;
            // 한 카드 재판정(♻️)은 자동배치 모드가 꺼져 있으면 배치하지 않고 새 판정만 보여 준다
            if (opts.onlyUid && !(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled())) continue;
            flushTags();   // 배치 경로가 보관함을 읽고 쓰기 전에, 모아 둔 카드 갱신을 먼저 쓴다
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
                    placeExtras(j, t, it.mailRaw, '🧭 재판정(' + j.basis + ')', !!it.alarmWorthy, res);
                } else {
                    res.failed++;
                    if (window._ibMarkAutoPlaceFail) window._ibMarkAutoPlaceFail(it.uid, (r && r.reason) || 'rejudge_failed');
                }
            } catch (e) { res.failed++; }
            await new Promise(function (r2) { setTimeout(r2, 400); });
        }
        flushTags();
        try { console.info('[메일 배분] 대기 재판정:', JSON.stringify(res)); } catch (e) { /* 무시 */ }
        if (typeof window.renderTaskInbox === 'function') { try { window.renderTaskInbox(); } catch (e) { /* 무시 */ } }
        if (opts.toast !== false && window.showToast && (res.placed || opts.force)) {
            window.showToast(T('🧭 대기 ' + res.looked + '건 재판정 — 배치 ' + res.placed + '건' + (res.failed ? ' · 실패 ' + res.failed : ''),
                              '🧭 Re-judged ' + res.looked + ' pending — placed ' + res.placed + (res.failed ? ' · failed ' + res.failed : '')), 'info', 6000);
        }
        return res;
    };
    // ── ⑤-b 📭 미분류 재판정 — 메일 서버 큐(js/15b _msResults)에서 프로젝트가 빈 줄을 AI 없이 결정론으로만 다시 본다 ──
    /** [2026-11-23 사용자 요청] 미분류(후보 0개)는 보관함에 안 들어가서 대기 재판정을 못 받았다. 오늘 규칙(제목 먼저·인치·
     *  믿을 만한 스레드)이면 정해지는 메일이 거기 남아 있을 수 있다.
     *  · 확정(mailRoutePreJudge — 결정론 근거만, AI 판단 없음)되는 줄만 보관함에 넣고 평소 자동배치와 같은 함수로 배치한다.
     *  · 확정 안 되는 줄은 그대로 둔다(미분류 유지). AI 분석이 실패해 업무 내용(task)이 없는 줄은 넣을 게 없어 건드리지 않는다.
     *  @returns {looked, placed, pending, still, noTask, dup, failed} */
    /** 👨‍👩‍👧 형제 모두 배치 — 대표 배치가 끝난 뒤 나머지 형제에도 같은 업무를(카드 하나씩, 기존 _msRegisterToProjectTargets 로) */
    function placeExtras(j, task, mailRaw, sourceLabel, alarm, res) {
        var ex = (j && j.extra) || [];
        if (!ex.length || typeof window._msRegisterToProjectTargets !== 'function') return;
        var t2 = Object.assign({}, task, { _routing: { basis: j.basis, decision: 'auto', reason: 'family_all extra' } });
        // _msRegisterToProjectTargets 는 첫 대상을 '주' 로 표시한다 — 여기선 전부 추가분이라 자리표시 null 을 앞에 둔다
        window._msRegisterToProjectTargets([null].concat(ex), t2, mailRaw, sourceLabel, alarm, '형제 모두 배치(' + j.basis + ')', function (tg, r2) {
            if (tg && r2 && r2.ok) res.placedExtra = (res.placedExtra || 0) + 1;
        });
    }
    /** AI 없이 메일에서 그대로 만든 업무 — 업무명=제목(RE:/FW: 접두어만 뗌), 상세=본문 앞부분 + [출처](15c 와 같은 모양 —
     *  중복 판정이 이 태그를 본다), 날짜=메일 수신일(+기본 마감일). 담당구분은 모르면 '미분류'. 해석·요약은 하지 않는다. */
    function buildTaskFromMail(r) {
        try {
            var subj = String(r.subject || '').trim();
            if (!subj) return null;
            var name = subj;
            for (var k = 0; k < 6; k++) name = name.replace(/^\s*((re|fw|fwd|답장|전달|회신)\s*(\[\d+\])?\s*:\s*)/i, '');
            name = name.trim().slice(0, 80) || subj.slice(0, 80);
            var body = String(r.body || '');
            try { if (typeof window.cleanMailBody === 'function') body = window.cleanMailBody(body); } catch (e) { /* 원문 그대로 */ }
            body = body.replace(/\s+/g, ' ').trim().slice(0, 400);
            var ymd = window.parseMailDateToYMD ? window.parseMailDateToYMD(r.date) : '';
            var src = '[출처]' + subj + '_' + (window.cleanMailDateForTag ? window.cleanMailDateForTag(r.date) : String(r.date || '')) + '_' + (r.sender || '');
            var t = {
                '업무명': name, '시작일': ymd || '', '완료일': '', '상태': '진행', '개발단계': '', '담당구분': '미분류', 'wbs레벨': 4,
                '상세내용': T('[핵심내용] (AI 분석 실패 — 메일 원문으로 만든 업무) ', '[Key] (AI analysis failed — task made from the mail as-is) ') + body + '\n' + src,
                _noAi: true
            };
            if (window._applyDefaultDueDate) window._applyDefaultDueDate(t);
            if (window._applyMailDateFallback) window._applyMailDateFallback(t, r.date, { allowToday: true });
            return t;
        } catch (e) { return null; }
    }
    window.mailRouteRejudgeUnmatched = async function (opts) {
        opts = opts || {};
        var res = { looked: 0, placed: 0, pending: 0, still: 0, noTask: 0, dup: 0, failed: 0 };
        if (off() || !window.TaskInbox || !Array.isArray(window._msResults)) return res;
        if (!(window.isAutoRegisterEnabled && window.isAutoRegisterEnabled()) && !opts.force) { res.skipped = 'mode_off'; return res; }
        var cands;
        try { cands = window._msFilterCandidateProjects(await window._msLoadProjectIndex()); } catch (e) { cands = []; }
        if (!cands || !cands.length) { res.skipped = 'no_candidates'; return res; }
        var rows = window._msResults.filter(function (r) { return r && !r.project && !r.registered; });
        var max = opts.max || P.rejudgeMax, moved = 0, changedQueue = false;
        for (var i = 0; i < rows.length && moved < max; i++) {
            var r = rows[i];
            if (i % 5 === 4) await new Promise(function (r2) { setTimeout(r2, 0); });
            res.looked++;
            var mail = { subject: r.subject || '', sender: r.sender || '', body: r.body || '', refs: r.refs || [] };
            var pre = null;
            try { pre = window.mailRoutePreJudge(mail, cands); } catch (e) { pre = null; }
            if (!pre) { res.still++; continue; }
            if (!r.task) {
                // 🧾 [2026-11-23 사용자 결정] AI 분석이 실패해 업무 내용이 없는 메일 — 결정론으로 프로젝트가 확정됐으면
                //  AI 없이 **메일 그대로** 업무를 만든다(지어내는 내용 없음). 확정 안 되는 메일은 위에서 이미 건너뛰었다.
                r.task = buildTaskFromMail(r);
                if (!r.task) { res.noTask++; continue; }
                res.builtNoAi = (res.builtNoAi || 0) + 1;
            }
            var tag = tagFromJudge({ decision: 'auto', target: pre.target, candidates: [pre.target], basis: pre.basis,
                                     reason: pre.reason + T(' (미분류 재판정)', ' (unclassified re-judge)'), family: pre.family }, null);
            var label = window._msProjectTagLabel ? window._msProjectTagLabel(tag) : (pre.target.model || pre.target.file_name);
            r.project = label; r._projectTag = tag; changedQueue = true;   // 미분류 목록에서 빠진다
            if (window._msMailAlreadyInInbox && window._msMailAlreadyInInbox(r)) { res.dup++; continue; }
            moved++;
            var task = r.task;
            task._routing = { basis: pre.basis, decision: 'auto', reason: pre.reason };
            var mailRawObj = { subject: r.subject, sender: r.sender, to: r.to, cc: r.cc, date: r.date, body2000: r.body, fileName: r.fileName, key: r.key || '', refs: r.refs || [] };
            try {
                window.TaskInbox.add(task, { source: '🧭 ' + T('미분류 재판정', 'unclassified re-judge') + '(' + (pre.target.model || pre.target.file_name || '') + ')', mailRaw: mailRawObj, matchedProject: tag, alarmWorthy: false });
                var st = window._msAutoPlaceNewInboxItem ? await window._msAutoPlaceNewInboxItem(task, tag, mailRawObj, '미분류 재판정(' + pre.basis + ')') : 'pending';
                if (st === 'placed') { res.placed++; placeExtras({ extra: pre.extra, basis: pre.basis }, task, mailRawObj, '🧭 ' + T('미분류 재판정', 'unclassified re-judge'), false, res); }
                else if (st === 'failed') res.failed++; else res.pending++;
            } catch (e) { res.failed++; }
            await new Promise(function (r2) { setTimeout(r2, 400); });
        }
        if (changedQueue) {
            try { if (window._msSaveQueueToStorage) window._msSaveQueueToStorage(); } catch (e) { /* 무시 */ }
            try { if (window._msRefreshQueueBadges) window._msRefreshQueueBadges(); } catch (e) { /* 무시 */ }
        }
        try { console.info('[메일 배분] 미분류 재판정:', JSON.stringify(res)); } catch (e) { /* 무시 */ }
        if (opts.toast !== false && window.showToast && (res.placed || res.pending || opts.force)) {
            window.showToast(T('📭 미분류 ' + res.looked + '건 재판정 — 배치 ' + res.placed + '건' + (res.pending ? ' · 보관함 대기 ' + res.pending : '') +
                               (res.builtNoAi ? ' · AI 분석 실패 메일 ' + res.builtNoAi + '건은 메일 그대로 업무로' : '') + (res.noTask ? ' · 업무를 못 만들어 건너뜀 ' + res.noTask : '') + (res.failed ? ' · 실패 ' + res.failed : ''),
                               '📭 Re-judged ' + res.looked + ' unclassified — placed ' + res.placed + (res.pending ? ' · pending ' + res.pending : '') +
                               (res.noTask ? ' · skipped (AI failed) ' + res.noTask : '') + (res.failed ? ' · failed ' + res.failed : '')), 'info', 7000);
        }
        return res;
    };
    /** ♻️ 한 카드만 지금 다시 판정 — js/14c inboxQuickClassify('오매칭') 이 부른다. @returns {placed, target} */
    window.mailRouteRejudgeOne = async function (uid) {
        var r = await window.mailRouteRejudgePending({ force: true, toast: false, onlyUid: uid, max: 1 });
        return { placed: r.placed || 0, target: r.target || '' };
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
                if (!off() && r && (!r.skipped || r.skipped === 'none')) {
                    await window.mailRouteRejudgePending({ toast: false, max: 5 });
                    await window.mailRouteRejudgeUnmatched({ toast: false, max: 5 });   // [2026-11-23] 📭 미분류도
                }
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
    // ══════════════════════════════════════════════════════════════════════
    // 🆕 [2026-11-23 사용자 요청] 새 프로젝트 제안 — **AI 없이** 보관함 대기 카드에서 찾는다.
    //  실측(K27): 대기 카드 5장이 '어느 프로젝트에도 없는' 모델 코드(K27)·관리번호(#502246)를 되풀이했다.
    //  그런 단서를 **같은 고객사 안에서** 2장 이상이 나눠 가지면 "새 프로젝트가 필요해 보인다" 로 묶고,
    //  마법사에 넣을 값(고객사·모델·키워드·KTK PN·담당자)을 메일에서 그대로 꺼낸다.
    //  ⚠️ 프로젝트를 만드는 건 여전히 사람 — 마법사 + 관리자 비밀번호. 여기는 **제안만** 한다.
    //  ⚠️ Phase 9(js/29)와 다르다: 그쪽은 AI 판정을 스윕마다 돌려 하루 한도를 태웠다(2026-10-21). 여긴 AI 0회.
    // ══════════════════════════════════════════════════════════════════════
    P.newProjectMinCards = P.newProjectMinCards || 2;          // 같은 단서를 나눠 가진 대기 카드가 이만큼이면 제안
    /** 모델 코드로 보지 않을 앞글자(데이터) — 'ALT3'·'PO21'·'FY26'·'W47' 같은 것 */
    window.MAIL_ROUTING_NEWPROJ_STOP = window.MAIL_ROUTING_NEWPROJ_STOP ||
        ['ALT', 'PO', 'PI', 'FY', 'Q', 'W', 'WK', 'CW', 'R', 'REV', 'V', 'VER', 'NO', 'NR', 'RE', 'FW', 'ID', 'EA', 'PCS', 'H', 'M', 'D', 'T', 'P', 'S', 'X'];
    function npKnownTokens(cands) {
        // ⚠️ 낱말 단위로 본다 — 이어 붙인 문자열의 부분일치로 보면 'LANDMARK276' 안의 'k27' 때문에 K27 이 '아는 단어' 가 됐다(실측).
        var hay = ' ' + cands.map(function (c) { return [c.model, c.customer, c.file_name].concat(c.keywords || []).join(' '); }).join(' ').toLowerCase().replace(/[^0-9a-z가-힣]+/g, ' ') + ' ';
        var codes = {};
        cands.forEach(function (c) { (c.keywords || []).forEach(function (k) { (String(k).match(/\d{6}/g) || []).forEach(function (x) { codes[x] = 1; }); }); });
        return { hay: hay, codes: codes };
    }
    /** 한 메일에서 "어느 프로젝트에도 없는" 단서 — 제목의 모델 코드(K27), 제목·본문의 관리번호(50xxxx) */
    function npUnknownClues(subject, body, known) {
        var out = [], seen = {};
        var STOP = {}; window.MAIL_ROUTING_NEWPROJ_STOP.forEach(function (w) { STOP[String(w).toUpperCase()] = 1; });
        var re = /(^|[^A-Za-z0-9])([A-Z]{1,3})(\d{2,3})(?![0-9A-Za-z])/g, m;
        while ((m = re.exec(String(subject || '')))) {
            var tok = m[2] + m[3];
            if (STOP[m[2]] || seen[tok] || known.hay.indexOf(' ' + tok.toLowerCase() + ' ') !== -1) continue;
            seen[tok] = 1; out.push({ kind: 'model', tok: tok });
        }
        var reN = /(^|[^0-9])(50\d{4})(?![0-9])/g;
        var txt = String(subject || '') + '\n' + String(body || '');
        while ((m = reN.exec(txt))) {
            if (seen[m[2]] || known.codes[m[2]]) continue;
            seen[m[2]] = 1; out.push({ kind: 'code', tok: m[2] });
        }
        return out;
    }
    /** 메일이 어느 고객사 얘긴가 — 후보들의 고객사 첫 마디 중 **하나만** 걸려야 한다(둘이면 모른다) */
    function npCustomerOf(raw, cands) {
        var roots = {};
        cands.forEach(function (c) { var r = customerRoot(c.customer); if (r && r.length >= 3 && !SELF[r] && !isCatchAll(c)) roots[r] = 1; });   // 우리 회사(서명마다 나온다)·잡무는 고객사 아님
        var hay = buildHay(raw), hr = raw.replace(/\s+/g, ' ');
        var hits = Object.keys(roots).filter(function (r) { return hit(hay, hr, r); });
        // 'lnw' 와 'lnwsg' 가 함께 걸리면 긴 쪽(더 구체적)이 이긴다
        hits = hits.filter(function (r) { return !hits.some(function (o) { return o !== r && o.indexOf(r) === 0; }); });
        return hits.length === 1 ? hits[0] : '';
    }
    function npCustomerLabel(root, cands) {
        var cnt = {};
        cands.forEach(function (c) { if (customerRoot(c.customer) === root) { var l = String(c.customer || '').split('>')[0].trim(); if (l) cnt[l] = (cnt[l] || 0) + 1; } });
        var ks = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
        return ks[0] || root.toUpperCase();
    }
    /** 담당자 — 카드들을 보낸 **사내** 사람 중 주소록에서 우리 팀인 사람(가장 자주 나온 사람). 모르면 ''(지어내지 않는다) */
    function npAssignee(cards, team) {
        var book = (window.tabData && window.tabData.addressBook) || [];
        if (!book.length || !team) return '';
        var cnt = {};
        cards.forEach(function (it) {
            var s = String((it.mailRaw && it.mailRaw.sender) || '');
            var em = (s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/) || [''])[0].toLowerCase();
            if (!em) return;
            var p = book.find(function (x) { return String(x.email || '').toLowerCase() === em; });
            if (p && p.name && String(p.dept || '').indexOf(team) !== -1) cnt[p.name] = (cnt[p.name] || 0) + 1;
        });
        var ks = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
        if (ks.length) return ks[0];
        // 보낸 사람 중 우리 팀이 없으면 — 본문에 이름이 나온 우리 팀 사람("임희철매니저님" 처럼). 카드 **2장 이상**에 나와야 한다
        //  (한 장뿐이면 지나가는 참조일 수 있다). 그래도 없으면 비워 둔다 — 사람이 마법사에서 고른다.
        //  이름 = 부서인 행(그룹 메일 주소)은 사람이 아니다. 여러 명이 같은 장수면 비운다.
        var mates = book.filter(function (x) { var n = String(x.name || '').trim(); return n.length >= 2 && n !== String(x.dept || '').trim() && String(x.dept || '').indexOf(team) !== -1; });
        var cards2 = {}, times = {};
        cards.forEach(function (it) {
            var t = String((it.mailRaw && (it.mailRaw.body2000 || it.mailRaw.body)) || '') + ' ' + String((it.task && it.task['상세내용']) || '');
            mates.forEach(function (x) {
                var n = String(x.name).trim(), k = t.split(n).length - 1;
                if (k) { cards2[n] = (cards2[n] || 0) + 1; times[n] = (times[n] || 0) + k; }
            });
        });
        //  ⚠️ 언급 횟수로 가르지 않는다 — 실측(K27)에서 "정민희책임님" 처럼 **부르는 상대**가 가장 많이 나와 담당자(임희철)가 아닌 사람을 골랐다.
        var score = function (n) { return cards2[n]; };
        var ks2 = Object.keys(cards2).filter(function (n) { return cards2[n] >= 2; }).sort(function (a, b) { return score(b) - score(a); });
        return (ks2.length && (ks2.length === 1 || score(ks2[0]) > score(ks2[1]))) ? ks2[0] : '';
    }
    /**
     * @param items  보관함 항목(TaskInbox.load())
     * @param cands  팀 후보 프로젝트(project_index 항목)
     * @returns [{ key, customer, clues:[tok], cards:[uid], subjects, prefill }]  — 카드 수 많은 순
     */
    window.mailRouteNewProjectProposals = function (items, cands) {
        cands = cands || [];
        if (!cands.length) return [];
        var known = npKnownTokens(cands);
        var teamCnt = {}; cands.forEach(function (c) { if (c.team) teamCnt[c.team] = (teamCnt[c.team] || 0) + 1; });
        var team = Object.keys(teamCnt).sort(function (a, b) { return teamCnt[b] - teamCnt[a]; })[0] || '';
        var hidden = {};
        try { (JSON.parse(localStorage.getItem('gantt_newproj_hidden_v1') || '[]') || []).forEach(function (k) { hidden[k] = 1; }); } catch (e) { /* 없음 */ }
        // 1) 카드마다 (고객사, 단서들)
        var rows = [];
        (items || []).forEach(function (it) {
            if (!it || it.status !== '대기') return;
            var mr = it.mailRaw || {};
            var subj = mr.subject || (it.task && it.task['업무명']) || '';
            var body = mr.body2000 || (it.task && it.task['상세내용']) || '';
            // 📄 결재 카드에 붙인 그룹웨어 본문은 재판정에 쓰지 않는다 — 판정은 js/75 의 좁은 조건(bodyResolve)만(사양표 오배송 실측)
            if (window.APPROVAL_BODY_MARK && body.indexOf(window.APPROVAL_BODY_MARK) !== -1) body = body.slice(0, body.indexOf(window.APPROVAL_BODY_MARK));
            var root = npCustomerOf(subj + '\n' + body, cands);
            if (!root) return;
            var clues = npUnknownClues(subj, body, known);
            if (!clues.length) return;
            rows.push({ it: it, root: root, clues: clues, subj: subj });
        });
        // 2) 같은 고객사 + 같은 단서를 나눠 가진 카드끼리 묶는다(이어진 것은 한 덩어리 — K27 과 #502246 이 한 제안으로)
        var parent = rows.map(function (_, i) { return i; });
        var find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
        var byClue = {};
        rows.forEach(function (r, i) { r.clues.forEach(function (c) { var k = r.root + '|' + c.tok; (byClue[k] = byClue[k] || []).push(i); }); });
        Object.keys(byClue).forEach(function (k) { var a = byClue[k]; for (var j = 1; j < a.length; j++) parent[find(a[j])] = find(a[0]); });
        var groups = {};
        rows.forEach(function (r, i) { var g = find(i); (groups[g] = groups[g] || []).push(i); });
        var out = [];
        Object.keys(groups).forEach(function (g) {
            var idx = groups[g];
            if (idx.length < P.newProjectMinCards) return;
            var root = rows[idx[0]].root;
            // 그 카드에만 나온 단서는 이름·키워드로 안 쓴다 — 2장 이상이 나눈 것만
            var shared = {};
            Object.keys(byClue).forEach(function (k) {
                if (k.indexOf(root + '|') !== 0) return;
                var a = byClue[k].filter(function (i) { return idx.indexOf(i) !== -1; });
                if (a.length >= 2) shared[k.slice(root.length + 1)] = a.length;
            });
            var toks = Object.keys(shared);
            if (!toks.length) return;
            toks.sort(function (a, b) { var am = /^\d/.test(a), bm = /^\d/.test(b); if (am !== bm) return am ? 1 : -1; return shared[b] - shared[a]; });
            var key = root + '|' + toks.slice().sort().join(',');
            if (hidden[key]) return;
            var cards = idx.map(function (i) { return rows[i].it; });
            var model = toks.filter(function (t) { return !/^\d/.test(t); })[0] || '';
            var nums = toks.filter(function (t) { return /^\d/.test(t); });
            var custLabel = npCustomerLabel(root, cands);
            out.push({
                key: key, customer: custLabel, clues: toks, cards: cards.map(function (c) { return c.uid; }),
                subjects: idx.map(function (i) { return rows[i].subj; }),
                prefill: {
                    customer: custLabel + (model ? '>' + model : ''),
                    model: model,
                    ktkpn: nums.length === 1 ? nums[0] : '',
                    keywords: toks.slice(),
                    assignee: npAssignee(cards, team)
                }
            });
        });
        out.sort(function (a, b) { return b.cards.length - a.cards.length; });
        return out;
    };
    /** 제안 숨기기 — 이 PC 에만(localStorage). 단서가 바뀌면(키가 달라지면) 다시 뜬다. */
    window.mailRouteNewProjectHide = function (key) {
        var a = [];
        try { a = JSON.parse(localStorage.getItem('gantt_newproj_hidden_v1') || '[]') || []; } catch (e) { a = []; }
        if (a.indexOf(key) === -1) a.push(key);
        try { localStorage.setItem('gantt_newproj_hidden_v1', JSON.stringify(a.slice(-200))); } catch (e) { /* 꽉 참 */ }
    };
    /** 팀 후보 프로젝트(캐시) — 보관함 요약처럼 **동기**로 그려야 하는 곳용. 없으면 null 을 주고 뒤에서 읽어 onReady 를 부른다. */
    var _npCands = null, _npCandsAt = 0, _npCandsP = null;
    window.mailRouteTeamCandsSync = function (onReady) {
        if (_npCands && Date.now() - _npCandsAt < 5 * 60000) return _npCands;
        if (!_npCandsP && window._msLoadProjectIndex && window._msFilterCandidateProjects) {
            _npCandsP = window._msLoadProjectIndex().then(function (idx) {
                _npCands = window._msFilterCandidateProjects(idx) || []; _npCandsAt = Date.now();
                if (onReady) { try { onReady(); } catch (e) { /* 그리기 실패는 무시 */ } }
            }).catch(function () { /* 다음에 다시 */ }).then(function () { _npCandsP = null; });
        }
        return _npCands;
    };
    window.mailRouteTeamCandsReset = function () { _npCands = null; _npCandsAt = 0; };

    window._mailRoutingNorm = { norm: norm, normSubject: normSubject, buildFamilies: buildFamilies, identsOf: identsOf };
})();
