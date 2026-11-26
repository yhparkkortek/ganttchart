// =========================================================
// 📋 [2026-11-24] 전자결재 문서 → 프로젝트 배치 (메일 배분과 같은 길)
// =========================================================
// 사용자 요청: "그룹웨어 전자결재 문서를 Email 가져오는 것처럼 가져와서 프로젝트에 배치 —
//   기안·결재·참조/열람·수신 문서함 모두 스캔 또는 매일 확인". 1차는 "구성부터, 확인하며 다듬는다".
//
// 흐름(새 판정기·새 보관함을 만들지 않는다):
//   ① 문서함 목록 — 이미 있는 백엔드 `/gw/approval/doclist?box=` (읽기 전용, 재시작 불필요)
//   ② 처음 보는 문서만 — 장부(`gantt_apv_intake_v1`, 문서 id 기준) + 보관함 카드 열쇠(`apv_<id>`) 이중 확인
//   ③ 판정 — 메일과 **같은 결정론 판정기**(js/74 `mailRoutePreJudge`/`mailRouteJudge`), AI 0회
//      결재 문서를 메일 모양(제목=문서 제목, 본문=양식·문서번호·기안부서, 보낸이=기안자)으로 넘긴다
//   ④ 확정 → 보관함 카드 + 자동배치(`_msAutoPlaceNewInboxItem`, 메일과 같은 문턱 — 자동등록 모드가 꺼져 있으면 대기)
//      애매 → 보관함 '대기'(후보 붙음) · 후보 0 → 카드를 만들지 않고 장부에만 'no_match' (휴가·공지성 결재가 보관함을 덮지 않게)
//
// ⚠️ 1차에서 일부러 안 한 것(확인하며 다듬기):
//   · 수신 문서함 — 그 화면이 부르는 API 주소를 아직 관찰하지 못했다. 추측 경로는 쓰지 않는다(추측 12개가 전부 404 였던 전력).
//     주소가 확인되면 `APPROVAL_INTAKE.boxes` 에 한 줄 + gw_bridge `_APPR_BOXES` 에 한 줄.
//   · 본문 읽기 — `/gw/approval/read` 는 그룹웨어 탭을 그 문서로 **이동**시킨다(사람이 보던 화면이 바뀐다). 그래서 제목·양식으로만 판정.
//   · 상태 변경 반영(진행→완료/반려) — 장부엔 상태를 적어 두지만 이미 넣은 간트 행은 아직 안 고친다.
//   · 백그라운드 스캔은 그룹웨어가 **이미 로그인돼 있을 때만** 돈다 — 자동 로그인을 배경에서 걸지 않는다(계정 잠금 규칙).
//     사람이 [📋 결재 가져오기] 를 누를 때만 `_gwEnsureLogin`(1회 시도·재시도 금지) 게이트를 지난다.
// ⚠️ 쓰기는 하지 않는다(그룹웨어 쪽). 앱 쪽 쓰기는 보관함·간트 배치뿐이고 그 경로는 메일과 같다.
(function () {
    'use strict';

    /** 정책(데이터) — 고치려면 여기 한 곳 */
    window.APPROVAL_INTAKE = window.APPROVAL_INTAKE || {
        enabled: true,
        offKey: 'gantt_apv_intake_off',          // '1' 이면 아무것도 안 한다
        storeKey: 'gantt_apv_intake_v1',
        // 문서함 — gw_bridge `_APPR_BOXES` 의 열쇠. 임시저장(tempsave)은 아직 문서가 아니라 뺀다.
        // 📥 [2026-11-24] 수신 문서함 — 화면 코드에서 주소 확인(개인 doclist/reception · 부서 deptfolder/receive/<부서id>).
        //    부서 수신함엔 열람 권한이 없는 문서가 섞여 온다(실측 40건 중 2건만 보임) → `readable:false` 는 건너뛴다.
        //    ⚠️ 두 문서함은 **백엔드 재시작 뒤에** 열린다(gw_bridge 새 코드) — 그 전엔 '재시작 필요' 로 드러낸다.
        boxes: [
            { key: 'draft',       label: '기안 문서함' },
            { key: 'approve',     label: '결재 문서함' },
            { key: 'viewer',      label: '참조/열람 문서함' },
            { key: 'reception',   label: '수신 문서함' },
            { key: 'deptreceive', label: '부서 수신함' }
        ],
        listLimit: 100,                // 문서함마다 최근 몇 건을 보나(최신순) — 실측: 기안함 40건 ≈ 77일 치라 90일 소급엔 모자랐다
        backfillDays: 90,              // 처음 켤 때 소급해서 가져올 기간 — 그보다 오래된 건 '본 것'으로만 표시 (2026-11-24 사용자 요청 30→90)
        maxAgeDays: 120,               // 그 뒤에도 이보다 오래된 문서가 새로 보이면(참조로 뒤늦게 추가 등) 가져오지 않는다
        maxPerRun: 100,                // 한 번에 처리할 새 문서 상한 (2026-11-24 사용자 요청 25→100 — 90일 소급을 한 번에)
        firstDelaySec: 90,             // 앱을 연 뒤 첫 배경 스캔까지
        bgAutoLogin: true,             // 배경 확인도 그룹웨어 자동 로그인 게이트(_gwEnsureLogin, 실패 후 재시도 금지)를 쓴다 — 2026-11-26 사용자 결정
        intervalMin: 30,               // 배경 스캔 간격(그룹웨어가 로그인돼 있을 때만) — 2026-11-26 120→30: 목록 읽기 5번뿐이라 가볍고, 2시간이면 창이 켜진 틈을 놓쳤다
        // 🩺 [2026-11-26 사용자 "결재 건이 없는 건지 안 가져오는 건지 알 수가 없다"] 배경 확인이 건너뛴 이유를 사람 말로(데이터).
        //    건너뛰기도 장부에 남기고(lastTryAt/lastSkip) 보관함 [📋 결재 가져오기] 칩에 마지막 확인 시각·멈춘 이유를 보인다.
        skipLabels: {
            gw_not_ready:  ['그룹웨어 창이 꺼져 있거나 로그인 안 됨', 'groupware window closed or signed out'],
            gw_login:      ['그룹웨어 자동 로그인 실패(잠금 방지로 다시 시도 안 함 — 🔑에서 직접 로그인)', 'groupware auto sign-in failed (no retry — sign in via 🔑)'],
            no_candidates: ['후보 프로젝트 목록을 못 읽음', 'could not load candidate projects'],
            no_router:     ['판정기 준비 안 됨', 'router not ready']
        },
        // 양식 이름에 이 말이 있으면 가져오지 않는다 — 프로젝트와 무관한 개인 근무·인사 결재
        //  (2026-11-24 사용자 지적 "연장근로·근무계획은 왜 배치되나" → 근무시간 계열 추가)
        skipForms: ['휴가', '연차', '반차', '근태', '경조', '조퇴', '외출', '연장근로', '연장근무', '근무계획', '근무 계획', '시간외', '특근', '휴일근무', '당직',
                    // 👥 (같은 날 "연차·휴가·인사 관련도") 인사 서류 — 양식 이름에만 맞춘다(제목 아님)
                    '근무변동', '인사', '급여', '연말정산', '복리후생', '건강검진', '휴직', '퇴직', '사직', '재직증명', '경력증명'],
        seenMax: 4000,                 // 장부 상한(오래된 것부터 버린다)
        taskNameMax: 40,               // 업무명(카드 제목)에 쓰는 문서 제목 최대 글자 — 넘으면 '…' (전체 제목은 [출처] 에)
        // 🚫 [2026-11-24 실측] 메일용 "공통 건(회의록·로드맵) → 고객사 프로젝트 전부" 규칙(js/74 commonToCustomer)을 결재엔 안 쓴다.
        //    결재 회의록은 특정 회의 문서다 — '[회의록] LNW>L7 Jackpot Wheel>31.5MVD(502582)…' 한 건이 LNW 14곳 전부에 들어갔다.
        //    끄면 판정은 원래대로(여러 후보 = 대기) 남는다.
        noCommonFanout: true,
        // 🧹 일회성 정리(데이터) — 위 규칙으로 잘못 퍼진 결재 행을 그 프로젝트를 열 때 뺀다. keepIds/keepModel 에 맞는 프로젝트엔 남긴다.
        cleanupPlacements: [
            { key: 'apv_218142', keepIds: ['1Y_eHKUWFxdKcqRI1XegFDZIu-teMuf6D'], keepModel: 'L7 Jackpot Wheel',
              why: '[회의록] L7 Jackpot Wheel 31.5MVD 점검회의 — 회의록 공통 규칙으로 LNW 14곳에 퍼짐(2026-11-24)' },
            // 🧲 (같은 날) KGP-4 키워드의 범용어('slim'·'1500R')가 식별자로 잡혀 KGP-4 에 들어간 8건 — js/74 STOPWORDS 에 그 낱말을 넣었다.
            //    fromIds = **그 프로젝트에서만** 뺀다(나중에 사람이 다른 곳에 두면 건드리지 않는다).
            //    rejudge = 다음 결재 가져오기 때 **한 번** 다시 판정한다(장부·옛 보관함 카드를 무시) → Amusnet 은 AMUSNET 55J 로, 나머지는 판정대로.
            { key: 'apv_214611', fromIds: ['185G159z0S0YYHoH0F4KJx2jdlrarwkGQ'], rejudge: true, why: 'LNW SLIM SLOT 개발 완료 보고서 — slim' },
            { key: 'apv_214658', fromIds: ['185G159z0S0YYHoH0F4KJx2jdlrarwkGQ'], rejudge: true, why: 'LNW Slim Slot ECO — slim' },
            { key: 'apv_214784', fromIds: ['185G159z0S0YYHoH0F4KJx2jdlrarwkGQ'], rejudge: true, why: 'LNW Slim Slot FA 샘플 — slim' },
            { key: 'apv_215137', fromIds: ['185G159z0S0YYHoH0F4KJx2jdlrarwkGQ'], rejudge: true, why: 'LNW SLIM SLOT 환경 대응 — slim' },
            { key: 'apv_216524', fromIds: ['185G159z0S0YYHoH0F4KJx2jdlrarwkGQ'], rejudge: true, why: 'Amusnet 55J1500R ICE 샘플 — 1500R' },
            { key: 'apv_216804', fromIds: ['185G159z0S0YYHoH0F4KJx2jdlrarwkGQ'], rejudge: true, why: 'Amusnet 55J1500R 개발 의뢰 — 1500R' },
            { key: 'apv_217288', fromIds: ['185G159z0S0YYHoH0F4KJx2jdlrarwkGQ'], rejudge: true, why: 'Amusnet 55J(P)1500R 금형 — 1500R' },
            { key: 'apv_222074', fromIds: ['185G159z0S0YYHoH0F4KJx2jdlrarwkGQ'], rejudge: true, why: 'KONAMI 75" C EC PANEL — 75" 인데 KGP-4 는 55"' },
            // 🩹 AMUSNET 55C 소실(12:52 이름 충돌)로 행이 사라졌는데 복사할 사본이 없는 결재 — 다시 판정만(fromIds 빈 목록 = 어디서도 안 뺀다)
            { key: 'apv_221969', fromIds: [], rejudge: true, why: '55C 소실로 사라진 결재 행 — 다시 가져오기' },
            { key: 'apv_222465', fromIds: [], rejudge: true, why: '55C 소실로 사라진 결재 행 — 다시 가져오기' }
        ],
        // 결재엔 쓰지 않을 판정 근거 — 자동 대신 대기. 'customer_inch'(고객사 + 그 고객사의 유일한 인치) 는 같은 인치의 **다른 제품**
        // (실측 LNW SLIM SLOT BTN 15.6" → COSMIC UPRIGHT BTN 15.6")을 집는다. 메일 판정은 그대로(js/74).
        waitBases: ['customer_inch'],
        // 📐 크기 가드(2026-11-24 실문서 120건 판정에서 찾음) — 제목에 크기가 적혀 있는데 대상 프로젝트 크기와 하나도 안 맞으면
        //    자동배치하지 않고 대기. 실측 오배치 3건: HORIZON 23.8" → 75" 프로젝트 · KGI>32TPR → 75" · KONAMI 75" → 55" KGP-4.
        //    단위 없는 숫자는 크기로 안 본다 — 단, 아래 접미어가 바로 붙으면 크기다(32TPR·75MVD).
        sizeGuard: true,
        sizeSuffixes: ['TPR', 'MVD', 'TVD', 'BTN', 'UPR', 'LWR', 'MAIN', 'TOP'],
        // 🧱 원자재 코드 연결(2026-11-24 사용자 결정 "넣어줘") — 제목에 원자재 코드만 있는 승인원(Customer Approval Sheet[133152])은
        //    판정기가 못 잡는다. 그 코드가 **저장된 BOM**(tabData.bomByUnit·elecBomByType) 중 정확히 한 프로젝트에만 있을 때만 그 프로젝트로.
        //    실측: BOM 코드 763개 중 34% 가 여러 프로젝트 공용 → 공용 코드가 하나라도 있으면 아무것도 안 한다(대기도 안 만든다).
        //    프로젝트 파일 **전체**(메일 본문 포함)는 근거로 안 쓴다 — 메일에 남의 코드가 섞여 거의 다 '여러 곳'이 된다(실측).
        materialLink: true,
        materialCodeRe: '(^|[^0-9])([13]\\d{5})(?![0-9])',   // 원자재 코드 모양(1xxxxx·3xxxxx). 50xxxx 관리번호는 판정기 몫
        bomCacheKey: 'gantt_apv_bom_codes_v1',             // 프로젝트별 BOM 코드·멤버 — updated_at 이 같으면 파일을 다시 안 읽는다
        memberCheck: true,                                 // 기안자가 그 프로젝트 담당자 칸에 없으면 자동 대신 대기
        // 📄 [2026-11-24 사용자 요청 "결재 카드도 메일처럼 본문을"] 제목만으로 확정 안 된 문서는 본문 글자 + 첨부 이름을 받아
        //    (/gw/approval/body-text, 화면 이동 없음·문서당 0.31초 실측) **좁은 조건**에서만 판정에 쓰고, 카드에는 항상 보여 준다.
        //    ⚠️ 본문을 메일처럼 통째로 쓰면 안 된다 — 실측 대기 21장 중 8장이 바뀌었는데 절반 이상이 오배송이었다
        //    (사양표의 'AG/AR/AF' → OBSIDIAN27 · 출장 보고서의 제품 나열 → POLED · ECO 표의 여러 모델).
        //    따르는 조건: 제목이 이미 고객/가족까지 정했고(충돌 아님) · 본문 판정이 그 안의 후보이고 · 관리번호(5자리+)나
        //    모델명 통째로 맞았거나 가족 안 여러 모델을 이름으로 적었을 때(family_named). 양식 이름에 bodySkipForms 가 있으면 안 쓴다.
        bodyFetch: true,
        bodyMax: 2000,
        bodySkipForms: ['출장', '교육', '세미나'],
        bodyMark: '──── 📄 본문(그룹웨어) ────'
    };
    var P = window.APPROVAL_INTAKE;
    var BASE = window.BACKEND_BASE || 'http://127.0.0.1:5000';
    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function off() { try { return !P.enabled || localStorage.getItem(P.offKey) === '1'; } catch (e) { return false; } }

    // ── 장부 ─────────────────────────────────────────────────────────────
    function loadStore() {
        try { var s = JSON.parse(localStorage.getItem(P.storeKey) || 'null'); if (s && s.seen) return s; } catch (e) { /* 새로 */ }
        return { seen: {}, log: [], firstRunAt: '', lastRunAt: '' };
    }
    function saveStore(s) {
        var ids = Object.keys(s.seen);
        if (ids.length > P.seenMax) {
            ids.sort(function (a, b) { return String(s.seen[a].at || '').localeCompare(String(s.seen[b].at || '')); });
            ids.slice(0, ids.length - P.seenMax).forEach(function (k) { delete s.seen[k]; });
        }
        if (s.log.length > 200) s.log = s.log.slice(-200);
        try { localStorage.setItem(P.storeKey, JSON.stringify(s)); } catch (e) { console.warn('[결재 가져오기] 장부 저장 실패:', e.message); }
    }
    /** 콘솔 점검용 — 최근 처리 기록 */
    window.approvalIntakeLog = function () { return loadStore().log.slice(-50); };
    /** 장부를 비운다(다시 처음부터 소급) — 보관함 카드 열쇠로 중복은 그래도 막힌다 */
    window.approvalIntakeReset = function () { try { localStorage.removeItem(P.storeKey); } catch (e) { /* 무시 */ } return true; };

    // ── 문서 → 메일 모양 / 업무 ────────────────────────────────────────────
    function docTs(d) {
        var s = String((d && d.draftedAt) || '');
        var t = Date.parse(s);
        if (!isNaN(t)) return t;
        var m = /(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/.exec(s);
        return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
    }
    function ymdOf(ts) {
        if (!ts) return '';
        var d = new Date(ts);
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim(); }
    function isSkipForm(d) {
        var f = stripTags(d.formName);
        return (P.skipForms || []).some(function (w) { return w && f.indexOf(w) !== -1; });
    }
    function mailOf(d) {
        return {
            subject: stripTags(d.title),
            body: [stripTags(d.formName), d.docNum || '', d.drafterDept || ''].join(' '),
            sender: d.drafterName || '',
            refs: []
        };
    }
    function statusOf(d) {
        var s = String(d.status || '') + ' ' + String(d.apprStatus || '');
        if (/완료|종결|승인완료/.test(s)) return '완료';
        return '진행';
    }
    function keyOf(d) { return 'apv_' + String(d.id || d.docNum || ''); }
    function mailRawOf(d, boxLabel) {
        var ts = docTs(d);
        var info = [
            T('양식', 'Form') + ': ' + stripTags(d.formName),
            T('문서번호', 'Doc no.') + ': ' + (d.docNum || T('(채번 전)', '(not numbered)')),
            T('기안', 'Drafter') + ': ' + (d.drafterName || '') + (d.drafterDept ? ' / ' + d.drafterDept : ''),
            T('상태', 'Status') + ': ' + [d.status, d.apprStatus].filter(Boolean).join(' · '),
            T('문서함', 'Box') + ': ' + boxLabel,
            (d.currentUsers ? T('현재 결재자', 'Now with') + ': ' + d.currentUsers : ''),
            (d.attachCount ? T('첨부', 'Attachments') + ': ' + d.attachCount : ''),
            '🔗 ' + (d.url || '')
        ].filter(Boolean).join('\n');
        return {
            subject: stripTags(d.title), sender: d.drafterName || '', to: '', cc: '',
            date: d.draftedAt || ymdOf(ts), body2000: info,
            fileName: '전자결재_' + (d.docNum || d.id), key: keyOf(d), refs: [],
            approval: { id: d.id, docNum: d.docNum || '', formName: stripTags(d.formName), status: d.status || '',
                        apprStatus: d.apprStatus || '', box: boxLabel, url: d.url || '', drafter: d.drafterName || '' }
        };
    }
    /** ✂️ [2026-11-24 사용자 지적 "카드 제목이 너무 길다"] 업무명용 짧은 제목.
     *  ① 맨 앞 [ … ] 가 양식 이름이거나 '…서/요청/신청/의뢰/회의록' 으로 끝나면 뗀다 — 양식은 상세내용 [핵심내용] 에 이미 있다
     *  ② 끝의 판 번호(V00·_REV00)를 뗀다 ③ 그래도 길면 P.taskNameMax 에서 자르고 '…' (전체 제목은 [출처] 에 그대로 남는다) */
    function shortTitle(d) { return shortTitleOf(d.title, d.formName) || stripTags(d.formName) || String(d.docNum || d.id); }
    function shortTitleOf(title, formName) {
        var d = { title: title, formName: formName || '' };
        var t = stripTags(d.title), f = stripTags(d.formName).replace(/\s/g, '');
        var m = /^\s*\[([^\]]{1,40})\][\s_\-]*/.exec(t);   // '[개발 완료 보고서]_LNW…' 의 밑줄까지 뗀다
        if (m) {
            var b = m[1].replace(/\s/g, '');
            if ((f && (b.indexOf(f) !== -1 || f.indexOf(b) !== -1)) || /(서|요청|신청|의뢰|회의록)$/.test(b)) {
                // 양식 이름을 통째로 빼면 무슨 문서인지 모른다('[결재] LNW_SHUFFLER 4.3"') → 끝말(의뢰서·요청서…)만 뗀 짧은 꼬리표로
                var tag = m[1].replace(/\s*(요청서|신청서|의뢰서|결과서|품의서|보고서|통지서|등록서|요청|신청|의뢰|서)\s*$/, '').trim();
                t = (tag ? tag + ' · ' : '') + t.slice(m[0].length);
            }
        }
        t = t.replace(/[\s_]*(REV|V)\d{2}\s*$/i, '').replace(/\s+/g, ' ').trim();
        if (!t) t = stripTags(d.title);
        var max = P.taskNameMax || 40;
        if (t.length > max) t = t.slice(0, max - 1).trim() + '…';
        return t;
    }
    window._approvalShortTitle = shortTitleOf;   // 하네스용 (title, formName)
    function taskOf(d, boxLabel) {
        var ts = docTs(d), ymd = ymdOf(ts);
        var title = stripTags(d.title) || stripTags(d.formName) || String(d.docNum || d.id);
        var dateTag = ymd + (d.draftedAt && /\d{2}:\d{2}/.test(d.draftedAt) ? ' ' + /\d{2}:\d{2}/.exec(d.draftedAt)[0] : '');
        var t = {
            '업무명': '[' + T('결재', 'Approval') + '] ' + shortTitle(d),
            '시작일': ymd, '완료일': statusOf(d) === '완료' ? ymd : '', '상태': statusOf(d),
            '개발단계': '', '담당구분': '미분류', 'wbs레벨': 4,
            '상세내용': '[핵심내용] ' + stripTags(d.formName) + (d.docNum ? ' ' + d.docNum : '') + ' · ' +
                       T('기안', 'drafter') + ' ' + (d.drafterName || '') + ' · ' + [d.status, d.apprStatus].filter(Boolean).join('/') +
                       (d.url ? ' 🔗 ' + d.url : '') +   // 줄을 바꾸지 않고 문장 끝에(사용자 요청 2026-11-24) — 화면은 주소를 ⬇️ 링크로 그린다(js/04i)
                       '\n[출처]' + title + '_' + dateTag + '_' + (d.drafterName || ''),
            _noAi: true, _approval: true
        };
        try { if (!t['완료일'] && window._applyDefaultDueDate) window._applyDefaultDueDate(t); } catch (e) { /* 기본 마감일 없음 */ }
        return t;
    }
    function waitTag(j) {
        return { status: 'ambiguous', candidates: j.candidates, extraCandidates: [], confidence: '중',
                 matchBasis: '🧭 ' + (j.reason || ''), routing: { basis: j.basis, family: j.family, aiConfidence: '', v: window.MAIL_ROUTING_RULE_V || '' },
                 ambiguousReason: j.basis };
    }
    function autoTag(pre) {
        return { status: 'matched', candidates: [pre.target], extraCandidates: (pre.extra || []).slice(), confidence: '상',
                 matchBasis: '🧭 ' + (pre.reason || ''), routing: { basis: pre.basis, family: pre.family, aiConfidence: '', v: window.MAIL_ROUTING_RULE_V || '' } };
    }
    /** 제목에 적힌 크기(인치) 목록 — 23.8" · 75인치 · 4.3in · 32TPR */
    function sizesIn(title) {
        var s = String(title || ''), out = {}, m;
        var re1 = /(^|[^0-9.])(\d{1,3}(?:\.\d)?)\s*(?:"|”|″|''|inch|인치|in(?![a-z]))/gi;
        while ((m = re1.exec(s))) out[String(parseFloat(m[2]))] = 1;
        var suf = (P.sizeSuffixes || []).join('|');
        if (suf) {
            var re2 = new RegExp('(^|[^0-9.A-Za-z])(\\d{2}(?:\\.\\d)?)(?:' + suf + ')(?![a-z])', 'gi');
            while ((m = re2.exec(s))) out[String(parseFloat(m[2]))] = 1;
        }
        return Object.keys(out);
    }
    /** 크기가 어긋나나 — 제목에 크기가 있고, 대상의 크기를 알고, 하나도 안 맞으면 true */
    function sizeMismatch(title, target) {
        if (!P.sizeGuard || !target) return false;
        var tin = parseFloat(target.inch);
        if (!tin) return false;
        var ss = sizesIn(title);
        if (!ss.length) return false;
        // 색인의 크기는 반올림돼 있다(31.5" 모델이 32) — 0.6 안쪽이면 같은 크기로 본다
        return !ss.some(function (x) { return Math.abs(parseFloat(x) - tin) <= (P.sizeTolerance || 0.6); });
    }
    window._approvalSizesIn = sizesIn;   // 하네스용

    // ── 📄 본문 받기 + 좁은 조건의 본문 판정 ───────────────────────────────
    window.APPROVAL_BODY_MARK = P.bodyMark;
    var _bodyRouteMissing = false;
    async function fetchBody(id) {
        if (!P.bodyFetch || _bodyRouteMissing || !id) return null;
        try {
            var r = await fetch(BASE + '/gw/approval/body-text?docId=' + encodeURIComponent(id));
            if (r.status === 404) { _bodyRouteMissing = true; console.info('[결재 가져오기] 본문 라우트 없음(백엔드 재시작 전) — 제목만으로 판정'); return null; }
            var j = await r.json();
            if (!j || !j.ok) { console.info('[결재 가져오기] 본문 못 받음:', j && j.message); return null; }
            return { text: String(j.text || '').slice(0, P.bodyMax || 2000), attaches: j.attaches || [] };
        } catch (e) { return null; }
    }
    function bodySkip(formName) { var f = String(formName || ''); return (P.bodySkipForms || []).some(function (w) { return w && f.indexOf(w) !== -1; }); }
    function bodyMailOf(mail, bd) { return { subject: mail.subject, sender: mail.sender, refs: [], body: mail.body + '\n' + bd.text + '\n' + bd.attaches.join('\n') }; }
    function nrm(s) { return String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]+/g, ''); }
    /** 제목 판정(jd)이 정한 무리 안에서만, 강한 단서일 때만 본문 판정을 따른다. 따르면 pre 모양, 아니면 null */
    function bodyResolve(mail, jd, cands, bd) {
        if (!jd || !jd.candidates || !jd.candidates.length || !bd || !(bd.text || bd.attaches.length)) return null;
        if (!/^(customer_only|family_unresolved|ai_low|customer_ai_low)$/.test(String(jd.basis || ''))) return null;   // 충돌은 본문이 더 헷갈리게 한다
        var group = {}; jd.candidates.forEach(function (c) { if (c && c.drive_file_id) group[c.drive_file_id] = 1; });
        var j2; try { j2 = window.mailRouteJudge(bodyMailOf(mail, bd), cands, null); } catch (e) { return null; }
        if (!j2 || j2.decision !== 'auto' || !j2.target || !group[j2.target.drive_file_id]) return null;
        if ((j2.extra || []).some(function (c) { return !group[c.drive_file_id]; })) return null;
        var ok = /family_named$/.test(String(j2.basis || ''));
        if (!ok && j2.hits && j2.hits.uniq) {
            var ti = cands.indexOf(j2.target), hs = (ti >= 0 && j2.hits.uniq[ti]) || [];
            ok = hs.some(function (t) { return /^\d{5,}$/.test(t) || t === nrm(j2.target.model); });
        }
        if (!ok) return null;
        return { target: j2.target, extra: j2.extra || [], basis: 'body_' + j2.basis, family: j2.family,
                 reason: T('본문: ', 'body: ') + (j2.reason || '') };
    }
    function withBody(raw, bd) {
        if (!bd) return raw;
        raw.body2000 = String(raw.body2000 || '') + '\n\n' + P.bodyMark + '\n' + bd.text +
            (bd.attaches.length ? '\n[' + T('첨부', 'Attachments') + '] ' + bd.attaches.join(' · ') : '');
        raw.bodyFetchedAt = new Date().toISOString();
        return raw;
    }
    window._approvalBodyResolve = bodyResolve;   // 하네스용

    // ── 🧱 원자재 코드 → 프로젝트(저장된 BOM 만) ───────────────────────────
    function scanCodes(text) {
        var re = new RegExp(P.materialCodeRe, 'g'), out = {}, m;
        var s = String(text || '');
        while ((m = re.exec(s))) { out[m[2]] = 1; re.lastIndex = m.index + m[0].length; }
        return Object.keys(out);
    }
    window._approvalCodesIn = scanCodes;   // 하네스용
    function isCatchAllCand(c) {
        var CA = window.MAIL_ROUTING_CATCHALL || [];
        var n = function (s) { return String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]+/g, ''); };
        return CA.some(function (w) { return w && (n(c.model) === n(w) || n(String(c.customer || '').split('>').pop()) === n(w)); });
    }
    /** 프로젝트 파일 하나 읽기(Drive·NAS 둘 다 같은 길 — 어댑터가 gapi 를 감싼다) */
    async function readProjectDoc(fileId) {
        var r = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true });
        return r && (r.result || (typeof r.body === 'string' ? JSON.parse(r.body) : null));
    }
    /** 담당자 이름들 — projectMeta 의 '…담당자' 칸(쉼표·슬래시 다중) */
    function membersOf(pm) {
        var out = {};
        Object.keys(pm || {}).forEach(function (k) {
            if (!/담당자$/.test(k)) return;
            String(pm[k] || '').split(/[,\/·;.]+/)   /* 실측: '김충식.김태홍' 처럼 점으로 잇는 칸이 있다 */.forEach(function (n) { n = n.trim(); if (n) out[n] = 1; });
        });
        return Object.keys(out);
    }
    /** 후보 프로젝트들의 BOM 코드 색인 — { index: {code: [fileId…]}, members: {fileId: [이름…]}, read, cached, failed } */
    async function bomIndex(cands) {
        var cache = {};
        try { cache = JSON.parse(localStorage.getItem(P.bomCacheKey) || '{}') || {}; } catch (e) { cache = {}; }
        var out = { index: {}, members: {}, read: 0, cached: 0, failed: 0 }, next = {};
        for (var i = 0; i < cands.length; i++) {
            var c = cands[i];
            if (!c || !c.drive_file_id || isCatchAllCand(c)) continue;
            var id = c.drive_file_id, u = String(c.updated_at || '');
            var ent = cache[id];
            if (!(ent && u && ent.u === u)) {
                try {
                    var doc = await readProjectDoc(id);
                    var td = (doc && doc.tabData) || {};
                    ent = { u: u, codes: scanCodes(JSON.stringify([td.bomByUnit || {}, td.elecBomByType || {}])),
                            members: membersOf(doc && doc.projectMeta) };
                    out.read++;
                } catch (e) {
                    out.failed++;
                    console.warn('[결재 가져오기] BOM 읽기 실패 — 이 프로젝트는 코드 연결에서 빠집니다:', c.file_name, e && e.message);
                    continue;   // 실패는 캐시하지 않는다
                }
            } else out.cached++;
            next[id] = ent;
            out.members[id] = ent.members || [];
            (ent.codes || []).forEach(function (code) { (out.index[code] = out.index[code] || []).push(id); });
        }
        try { localStorage.setItem(P.bomCacheKey, JSON.stringify(next)); } catch (e) { /* 캐시 못 써도 판정은 한다 */ }
        return out;
    }
    /** 코드들 → 한 프로젝트, 아니면 사유. 공용 코드가 하나라도 있거나 코드끼리 다른 곳을 가리키면 고르지 않는다. */
    function materialPick(codes, bi, cands) {
        var hits = codes.filter(function (k) { return bi.index[k] && bi.index[k].length; });
        if (!hits.length) return { why: 'code_not_in_bom' };
        if (hits.some(function (k) { return bi.index[k].length > 1; })) return { why: 'shared_code' };
        var ids = {}; hits.forEach(function (k) { ids[bi.index[k][0]] = 1; });
        var keys = Object.keys(ids);
        if (keys.length !== 1) return { why: 'codes_disagree' };
        var target = cands.filter(function (c) { return c.drive_file_id === keys[0]; })[0];
        return target ? { target: target, hits: hits } : { why: 'no_candidate' };
    }

    /** 🔗 그룹웨어 원문 열기 — 사람이 로그인해 둔 전용 크롬(CDP)에 새 탭으로(/gw/open-doc, js/67 의뢰서 열기와 같은 길).
     *  일반 새 탭은 로그인 화면만 뜬다 → 백엔드가 안 될 때만 폴백. @param apv {id, docNum, url} */
    /** 📄 이미 보관함에 '대기' 로 있는 결재 카드에 본문을 채우고, 좁은 조건이면 배치한다(🧭 재판정 버튼이 먼저 부른다).
     *  본문을 한 번 받은 카드는 다시 받지 않는다(bodyFetchedAt). 반환 {looked, filled, placed} */
    window.approvalBodySweep = async function (opts) {
        opts = opts || {};
        var res = { looked: 0, filled: 0, placed: 0 };
        if (!P.bodyFetch || !window.TaskInbox || !window.mailRouteJudge) return res;
        var cands;
        try { cands = window._msFilterCandidateProjects(await window._msLoadProjectIndex()); } catch (e) { cands = []; }
        if (!cands || !cands.length) return res;
        var list = window.TaskInbox.load().filter(function (it) {
            return it && it.status === '대기' && it.mailRaw && /^apv_/.test(it.mailRaw.key || '') && !it.mailRaw.bodyFetchedAt;
        }).slice(0, opts.max || 40);
        for (var i = 0; i < list.length; i++) {
            var it = list[i], ap = it.mailRaw.approval || {};
            res.looked++;
            if (bodySkip(ap.formName)) continue;
            var bd = await fetchBody(ap.id || String(it.mailRaw.key).slice(4));
            if (!bd) { if (_bodyRouteMissing) break; continue; }
            var fresh = window.TaskInbox.load(), x = fresh.filter(function (y) { return y.uid === it.uid; })[0];
            if (!x || x.status !== '대기') continue;
            withBody(x.mailRaw, bd); window.TaskInbox.save(fresh); res.filled++;
            var mail = { subject: x.mailRaw.subject || '', sender: x.mailRaw.sender || '', body: [ap.formName || '', ap.docNum || ''].join(' '), refs: [] };
            var jd = null; try { jd = window.mailRouteJudge(mail, cands, null); } catch (e) { jd = null; }
            var acc = bodyResolve(mail, jd, cands, bd);
            if (!acc || sizeMismatch(mail.subject, acc.target) || !window._msAutoRegisterToProject) continue;
            var t = Object.assign({}, x.task, { _routing: { basis: acc.basis, decision: 'auto', reason: acc.reason } });
            try {
                var r = await window._msAutoRegisterToProject(x.uid, t, acc.target.drive_file_id, acc.target.file_name, x.mailRaw, 0, false, { coalesce: false, noTopicRegen: true });
                if (r && r.ok) {
                    window.TaskInbox.setStatus(x.uid, '자동배치됨', { type: '본문 판정 배치(' + acc.basis + ')', target: acc.target.file_name, at: new Date().toISOString() });
                    res.placed++;
                    if (acc.extra.length && window._msRegisterToProjectTargets)
                        window._msRegisterToProjectTargets([null].concat(acc.extra), t, x.mailRaw, '📋 ' + T('전자결재', 'Approval'), false, '전자결재 본문 형제 배치(' + acc.basis + ')');
                }
            } catch (e) { console.warn('[결재 본문] 배치 실패:', e && e.message); }
            await new Promise(function (r2) { setTimeout(r2, 300); });
        }
        console.info('[결재 본문] 채움:', JSON.stringify(res));
        return res;
    };

    window.approvalOpenInGw = async function (apv) {
        apv = apv || {};
        var url = apv.url || (apv.id ? 'https://gw.kortek.co.kr/app/approval/document/' + apv.id : '');
        if (window.showToast) window.showToast('🔗 ' + T('그룹웨어에서 여는 중…', 'Opening in groupware…'), 'info');
        var res = null;
        try {
            res = await fetch(BASE + '/gw/open-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ docId: String(apv.id || ''), docNum: apv.docNum || '' }) }).then(function (r) { return r.json(); });
        } catch (e) { res = { ok: false, message: String((e && e.message) || e) }; }
        if (res && res.ok) { if (window.showToast) window.showToast('🔗 ' + T('그룹웨어 창(전용 크롬)에서 열었습니다.', 'Opened in the groupware window.'), 'success'); return true; }
        if (url) {
            var w = window.open(url, '_blank');
            if (window.showToast) window.showToast(w ? '🔗 ' + T('새 탭에서 열었습니다 — 그룹웨어 로그인이 필요할 수 있습니다. (전용 크롬 실패: ', 'Opened in a new tab — sign-in may be needed. (') + ((res && res.message) || '') + ')'
                                                     : '⚠️ ' + T('팝업이 막혔습니다: ', 'Popup blocked: ') + url, w ? 'info' : 'error', 8000);
            return !!w;
        }
        if (window.showToast) window.showToast('⚠️ ' + T('문서를 열지 못했습니다: ', 'Could not open: ') + ((res && res.message) || ''), 'error');
        return false;
    };

    function inInbox(key) {
        try { return window.TaskInbox.load().some(function (it) { return it && it.mailRaw && it.mailRaw.key === key; }); } catch (e) { return false; }
    }

    // ── 한 번 훑기 ─────────────────────────────────────────────────────────
    var _busy = false;
    window._approvalIntakeBusy = function () { return _busy; };
    /**
     * @param {{manual?:boolean, toast?:boolean}} opts  manual=사람이 누름(로그인 게이트 1회 허용)
     * @returns {Promise<object>} {looked, fresh, placed, pending, noMatch, skippedForm, old, dup, failed, boxErrors[]}
     */
    window.approvalIntakeRun = async function (opts) {
        opts = opts || {};
        var res = { looked: 0, fresh: 0, placed: 0, pending: 0, noMatch: 0, skippedForm: 0, old: 0, dup: 0, failed: 0, boxErrors: [] };
        if (off()) { res.skipped = 'off'; return res; }
        if (_busy) { res.skipped = 'busy'; return res; }
        if (!window.TaskInbox || typeof window.mailRouteJudge !== 'function') { res.skipped = 'no_router'; return res; }
        _busy = true;
        if (window.renderTaskInbox && document.getElementById('task-inbox-overlay') && document.getElementById('task-inbox-overlay').style.display === 'flex') window.renderTaskInbox();
        try {
            // ① 그룹웨어 — 배경은 이미 로그인된 경우만, 사람이 누르면 게이트(1회 시도)
            //    🔑 [2026-11-26 사용자 결정 "자동 로그인 켜줘"] 배경도 같은 게이트를 지난다(P.bgAutoLogin) — 창이 꺼져 있으면 크롬을 띄우고
            //    저장된 계정으로 로그인한다. 잠금 방지는 게이트 그대로: 서버까지 간 실패는 이 페이지에서 **다시 시도하지 않는다**.
            if ((opts.manual || P.bgAutoLogin) && window._gwEnsureLogin) {
                // 🔔 [2026-11-26 사용자 요청] 배경에서 실제로 로그인했으면 한 줄 알린다 — 창이 작업 중인 창 뒤에 떠서 떴는지 알 수 없었다
                var wasReady = false;
                if (!opts.manual) { try { var s0 = await fetch(BASE + '/gw/status').then(function (r) { return r.json(); }); wasReady = !!(s0 && s0.ok); } catch (e) { wasReady = false; } }
                var g = await window._gwEnsureLogin(function (m) { if (opts.manual && window.showToast) window.showToast(m, 'info'); });
                if (!opts.manual && !wasReady && g && g.ok && window.showToast && opts.toast !== false) {
                    window.showToast(T('🔑 결재 확인을 위해 그룹웨어 전용 크롬을 띄워 저장된 계정으로 로그인했습니다 — 작업표시줄의 크롬 아이콘이 그 창입니다.',
                                       '🔑 Opened the groupware Chrome window and signed in with the saved account to check approvals (see the Chrome icon in the taskbar).'), 'info', 8000);
                }
                if (!g || !g.ok) { res.skipped = 'gw_login'; res.message = (g && g.message) || ''; return finish(res, opts); }
            } else {
                var st = null;
                try { st = await fetch(BASE + '/gw/status').then(function (r) { return r.json(); }); } catch (e) { st = null; }
                if (!st || !st.ok) { res.skipped = 'gw_not_ready'; res.message = (st && st.message) || ''; return finish(res, opts); }
            }
            // ② 후보 프로젝트 — 메일과 같은 색인
            var cands = [];
            try { cands = window._msFilterCandidateProjects(await window._msLoadProjectIndex()) || []; } catch (e) { cands = []; }
            if (!cands.length) { res.skipped = 'no_candidates'; return finish(res, opts); }

            var store = loadStore();
            var REJ = {};   // 정리 목록에서 '다시 판정'(rejudge) 으로 올린 문서 열쇠
            (P.cleanupPlacements || []).forEach(function (c) { if (c && c.key && c.rejudge) REJ[c.key] = 1; });
            var firstRun = !store.firstRunAt;
            var now = Date.now();
            var cutoff = now - (firstRun ? P.backfillDays : P.maxAgeDays) * 86400000;

            // ③ 문서함 훑기 — 한 문서함이 막혀도 나머지는 계속(오류는 모아서 드러낸다)
            var fresh = [], byId = {};
            for (var b = 0; b < P.boxes.length; b++) {
                var box = P.boxes[b];
                var j = null;
                try {
                    j = await fetch(BASE + '/gw/approval/doclist?box=' + encodeURIComponent(box.key) + '&limit=' + P.listLimit + '&duration=all')
                        .then(function (r) { return r.json(); });
                } catch (e) { res.boxErrors.push(box.label + ': ' + e.message); continue; }
                if (!j || !j.ok) {
                    var msg = (j && j.message) || T('응답 없음', 'no response');
                    // 구버전 백엔드는 새 문서함 이름을 모른다(ValueError 'box는 … 중 하나') — 고장이 아니라 재시작 대기
                    if (/box는|box must/i.test(msg)) msg = T('백엔드 재시작 후 사용 가능', 'available after backend restart');
                    res.boxErrors.push(box.label + ': ' + msg); continue;
                }
                (j.docs || []).forEach(function (d) {
                    if (!d || !d.id) return;
                    // 열람 권한이 없는 문서(부서 수신함) — 제목이 가려져 판정할 게 없다. 장부에도 안 적는다(나중에 열리면 그때 본다).
                    if (d.readable === false || /열람권한이 없는/.test(String(d.title || ''))) { res.unreadable = (res.unreadable || 0) + 1; return; }
                    res.looked++;
                    if (byId[d.id]) return;
                    byId[d.id] = 1;
                    var sv = store.seen[d.id];
                    // 소급 기간을 늘리면(30→90) 예전에 '오래됨'으로만 적어 둔 문서가 새 기간 안에 들 수 있다 — 그건 다시 본다.
                    //  (안 그러면 기간을 늘려도 이미 한 번 돈 PC 에선 아무것도 안 바뀐다)
                    if (sv && sv.res === 'old' && docTs(d) >= now - P.backfillDays * 86400000) sv = null;
                    // 🧲 잘못 배치돼 정리 목록에 '다시 판정'(rejudge)으로 올린 문서 — 한 번만 장부를 무시한다
                    if (sv && REJ[keyOf(d)] && !sv.rejudged) sv = null;
                    if (sv) { sv.st = d.status || sv.st; return; }
                    fresh.push({ d: d, box: box.label });
                });
            }
            // 오래된 것부터 처리(카드가 시간 순으로 쌓이게)
            fresh.sort(function (a, c) { return docTs(a.d) - docTs(c.d); });

            var done = 0, bi = null;   // bi: BOM 코드 색인 — 이번 실행에서 처음 필요할 때 한 번만 만든다
            for (var i = 0; i < fresh.length; i++) {
                var d = fresh[i].d, boxLabel = fresh[i].box, ts = docTs(d);
                var mark = function (r) { store.seen[d.id] = { at: new Date().toISOString(), st: d.status || '', res: r, box: boxLabel, rejudged: !!REJ[keyOf(d)] || undefined }; };
                if (ts && ts < cutoff) { res.old++; mark('old'); continue; }
                if (isSkipForm(d)) { res.skippedForm++; mark('skip_form'); continue; }
                if (done >= P.maxPerRun) break;   // 나머지는 다음 번에(장부에 안 적었으니 다시 보인다)
                done++; res.fresh++;
                var key = keyOf(d);
                if (REJ[key]) {
                    // 다시 판정 — 옛(잘못된) 보관함 카드는 지운다(묘비를 남겨 다른 PC 에서도 사라진다). 한 문서에 카드가 둘이 되지 않게.
                    try { window.TaskInbox.load().filter(function (it) { return it && it.mailRaw && it.mailRaw.key === key; })
                              .forEach(function (it) { window.TaskInbox.remove(it.uid); }); } catch (e) { /* 카드 정리 실패는 판정을 막지 않는다 */ }
                    res.rejudged = (res.rejudged || 0) + 1;
                } else if (inInbox(key)) { res.dup++; mark('dup'); continue; }

                var mail = mailOf(d), pre = null, jd = null, tag = null;
                // 결재 판정 동안만 '공통 건 → 고객사 전부' 를 끈다(위 noCommonFanout). 메일 판정엔 영향 없게 바로 되돌린다.
                var MRP = window.MAIL_ROUTING_POLICY, svCommon = MRP ? MRP.commonToCustomer : undefined;
                if (MRP && P.noCommonFanout) MRP.commonToCustomer = false;
                try {
                    try { pre = window.mailRoutePreJudge ? window.mailRoutePreJudge(mail, cands) : null; } catch (e) { pre = null; }
                    if (!pre) { try { jd = window.mailRouteJudge(mail, cands, null); } catch (e) { jd = null; } }
                } finally { if (MRP && P.noCommonFanout) MRP.commonToCustomer = svCommon; }
                if (pre && sizeMismatch(mail.subject, pre.target)) {
                    // 자동 확정을 대기로 내린다 — 후보로는 남긴다(사람이 맞다고 보면 한 번에 보낼 수 있게)
                    jd = { candidates: [pre.target].concat(pre.extra || []), basis: 'size_mismatch', family: pre.family,
                           reason: T('제목 크기(' + sizesIn(mail.subject).join('/') + '")가 ' + (pre.target.model || '') + '(' + pre.target.inch + '") 와 다름 — 원래 판정: ', 'size in title differs from target — was: ') + pre.reason };
                    pre = null;
                    tag = waitTag(jd);
                }
                if (pre && (P.waitBases || []).indexOf(String(pre.basis || '').replace(/^subject_/, '')) !== -1) {
                    // 결재엔 안 쓰는 근거(waitBases) — 후보는 남기고 대기로
                    jd = { candidates: [pre.target].concat(pre.extra || []), basis: 'approval_' + String(pre.basis).replace(/^subject_/, ''), family: pre.family,
                           reason: T('결재엔 이 근거로 자동 배치하지 않음 — ', 'not auto-placed for approvals — ') + pre.reason };
                    pre = null;
                    tag = waitTag(jd);
                }
                if (pre) tag = autoTag(pre);
                else if (jd && jd.decision === 'auto' && jd.target) tag = waitTag({ candidates: [jd.target], reason: jd.reason, basis: jd.basis, family: jd.family });
                else if (jd && jd.decision === 'wait' && jd.candidates && jd.candidates.length) tag = waitTag(jd);
                // 📄 제목만으로 확정 못 했으면 본문을 받아 본다(카드에 보여 주고, 좁은 조건이면 판정도)
                var bd = null;
                if (!pre && P.bodyFetch && !bodySkip(d.formName)) {
                    bd = await fetchBody(d.id);
                    var acc = bd ? bodyResolve(mail, jd, cands, bd) : null;
                    if (acc && !sizeMismatch(mail.subject, acc.target)) { pre = acc; tag = autoTag(pre); res.body = (res.body || 0) + 1; }
                }
                // 🧱 판정기가 못 잡았으면 원자재 코드(저장된 BOM 만)로 한 번 더 — 한 프로젝트일 때만
                if (!tag && P.materialLink) {
                    var codes = scanCodes(mail.subject);
                    if (codes.length) {
                        if (!bi) bi = await bomIndex(cands);
                        var mp = materialPick(codes, bi, cands);
                        if (mp.target) {
                            var mem = bi.members[mp.target.drive_file_id] || [];
                            var drafterIn = !P.memberCheck || !d.drafterName || mem.indexOf(d.drafterName) !== -1;
                            var why = T('원자재 코드 ' + mp.hits.join(',') + ' 가 ' + (mp.target.model || mp.target.file_name) + ' BOM 에만 있음',
                                        'material code ' + mp.hits.join(',') + ' only in ' + (mp.target.model || mp.target.file_name) + ' BOM');
                            if (drafterIn) {
                                pre = { target: mp.target, extra: [], basis: 'material_bom', reason: why, family: null };
                                tag = autoTag(pre);
                            } else {
                                tag = waitTag({ candidates: [mp.target], basis: 'material_bom_member', family: null,
                                                reason: why + T(' · 기안자(' + d.drafterName + ')가 그 프로젝트 담당자 칸에 없어 대기', ' · drafter not a member — pending') });
                            }
                            res.material = (res.material || 0) + 1;
                        } else {
                            res.materialMiss = res.materialMiss || {};
                            res.materialMiss[mp.why] = (res.materialMiss[mp.why] || 0) + 1;
                        }
                    }
                }
                if (!tag) {
                    res.noMatch++; mark('no_match');
                    store.log.push({ at: new Date().toISOString(), id: d.id, docNum: d.docNum, title: mail.subject, res: 'no_match' });
                    continue;
                }
                var task = taskOf(d, boxLabel), raw = withBody(mailRawOf(d, boxLabel), bd);
                task._routing = { basis: tag.routing.basis, decision: pre ? 'auto' : 'wait', reason: tag.matchBasis };
                var tgtName = (tag.candidates[0] && (tag.candidates[0].model || tag.candidates[0].file_name)) || '';
                try {
                    window.TaskInbox.add(task, { source: '📋 ' + T('전자결재', 'Approval') + '(' + boxLabel + (pre ? ' → ' + tgtName : '') + ')',
                                                 mailRaw: raw, matchedProject: tag, alarmWorthy: false });
                    var stt = pre && window._msAutoPlaceNewInboxItem
                        ? await window._msAutoPlaceNewInboxItem(task, tag, raw, '전자결재 배치(' + pre.basis + ')') : 'pending';
                    if (stt === 'placed') {
                        res.placed++;
                        if (pre.extra && pre.extra.length && window._msRegisterToProjectTargets) {
                            var t2 = Object.assign({}, task, { _routing: { basis: pre.basis, decision: 'auto', reason: 'approval extra' } });
                            window._msRegisterToProjectTargets([null].concat(pre.extra), t2, raw, '📋 ' + T('전자결재', 'Approval'), false, '전자결재 형제 배치(' + pre.basis + ')');
                        }
                    } else if (stt === 'failed') res.failed++;
                    else res.pending++;
                    mark(stt);
                    store.log.push({ at: new Date().toISOString(), id: d.id, docNum: d.docNum, title: mail.subject, res: stt, target: tgtName, basis: tag.routing.basis });
                } catch (e) {
                    res.failed++;
                    console.warn('[결재 가져오기] 실패:', d.docNum || d.id, e);
                    // 장부에 안 적는다 — 다음 번에 다시 시도
                }
                await new Promise(function (r) { setTimeout(r, 300); });
            }
            if (firstRun) store.firstRunAt = new Date().toISOString();
            store.lastRunAt = new Date().toISOString();
            store.lastRes = res;
            saveStore(store);
            if (res.boxErrors.length && window._issueLog) {
                try { window._issueLog('approval_intake_box_error', { errors: res.boxErrors }); } catch (e) { /* 무시 */ }
            }
            return finish(res, opts);
        } finally {
            _busy = false;
            var ov = document.getElementById('task-inbox-overlay');
            if (window.renderTaskInbox && ov && ov.style.display === 'flex') window.renderTaskInbox();
        }
    };
    // 🩺 건너뛴 것도 남긴다 — 예전엔 성공한 실행만 lastRunAt 을 적어, 창이 꺼져 계속 건너뛰어도 흔적이 없었다.
    var _skipToastShown = false;
    function noteTry(res, opts) {
        if (res.skipped === 'busy' || res.skipped === 'off') return;
        var s = loadStore();
        s.lastTryAt = new Date().toISOString();
        s.lastTryManual = !!opts.manual;
        s.lastSkip = res.skipped ? { reason: res.skipped, message: String(res.message || '').slice(0, 160), at: s.lastTryAt } : null;
        saveStore(s);
        // 배경에서 처음 막혔을 때 한 번만 알린다(2시간마다 토스트가 뜨면 소음이다 — 이후는 보관함 칩이 말한다)
        if (res.skipped && !opts.manual && !_skipToastShown && opts.toast !== false && window.showToast) {
            _skipToastShown = true;
            window.showToast(T('📋 결재 자동 확인을 못 했습니다 — ' + skipLabel(res.skipped)[0] + '. 업무 보관함의 [📋 결재 가져오기]를 누르면 로그인 후 가져옵니다.',
                               '📋 Approval auto-check skipped — ' + skipLabel(res.skipped)[1] + '. Press [📋 Fetch approvals] in the Task Inbox.'), 'warning', 9000);
        }
    }
    function skipLabel(k) { var L = (P.skipLabels || {})[k]; return L || [k, k]; }
    /** 보관함 칩·콘솔 점검용 — 마지막 확인·마지막 건너뜀 */
    window.approvalIntakeStatus = function () {
        var s = loadStore();
        var lastRun = s.lastRunAt ? Date.parse(s.lastRunAt) : 0, lastTry = s.lastTryAt ? Date.parse(s.lastTryAt) : 0;
        var stuck = !!(s.lastSkip && lastTry && lastTry >= lastRun);
        return { lastRunAt: s.lastRunAt || '', lastRes: s.lastRes || null, lastTryAt: s.lastTryAt || '',
                 lastSkip: s.lastSkip || null, stuck: stuck, stuckLabel: stuck ? skipLabel(s.lastSkip.reason) : null,
                 intervalMin: P.intervalMin, firstRunAt: s.firstRunAt || '' };
    };
    function finish(res, opts) {
        try { console.info('[결재 가져오기]', JSON.stringify(res)); } catch (e) { /* 무시 */ }
        try { noteTry(res, opts); } catch (e) { /* 기록 실패는 실행을 막지 않는다 */ }
        if (opts.toast === false || !window.showToast) return res;
        if (res.skipped === 'gw_login') { window.showToast(res.message || T('⚠️ 그룹웨어 로그인이 필요합니다.', '⚠️ Groupware sign-in needed.'), 'error', 7000); return res; }
        if (res.skipped === 'no_candidates') { window.showToast(T('⚠️ 배치할 후보 프로젝트를 불러오지 못했습니다.', '⚠️ Could not load candidate projects.'), 'error'); return res; }
        if (res.skipped) { if (opts.manual) window.showToast(T('📋 결재 가져오기 건너뜀: ', '📋 Approval intake skipped: ') + res.skipped, 'info'); return res; }
        if (!opts.manual && !res.placed && !res.pending) return res;   // 배경에선 새 것이 있을 때만 말한다
        window.showToast(T('📋 전자결재 ' + res.looked + '건 확인 — 새 문서 ' + res.fresh + '건: 배치 ' + res.placed + ' · 대기 ' + res.pending +
                           ' · 후보 없음 ' + res.noMatch + (res.skippedForm ? ' · 제외 양식 ' + res.skippedForm : '') + (res.old ? ' · 오래된 문서 ' + res.old : '') +
                           (res.failed ? ' · 실패 ' + res.failed : '') + (res.boxErrors.length ? ' · ⚠️ 문서함 오류 ' + res.boxErrors.length : ''),
                           '📋 Checked ' + res.looked + ' approvals — new ' + res.fresh + ': placed ' + res.placed + ' · pending ' + res.pending +
                           ' · no match ' + res.noMatch + (res.failed ? ' · failed ' + res.failed : '') + (res.boxErrors.length ? ' · ⚠️ box errors ' + res.boxErrors.length : '')),
                         res.boxErrors.length ? 'error' : 'info', 8000);
        return res;
    }

    // ── 🩹 열린 프로젝트 스스로 바로잡기 (2026-11-24, 사용자 결정 "옮겨줘") ─────────────
    //  ① 자동배치 자리 버그(js/14b computeL0InsertPos, 2647ca8 에서 수정)로 **첫 단계 머리 위**에 꽂힌 메일·결재 행을 제 단계에 날짜 순으로 다시 넣는다
    //     (실측: 결재 12행·메일 19행). 사람이 직접 만든 행은 건드리지 않는다 — 메일 원문(_mailRaw)이나 [출처] 표시가 있는 행만.
    //  ② 결재 행의 '🔗 주소' 줄바꿈을 문장 끝으로(새 행은 처음부터 그렇게 만든다).
    //  ⚠️ **지금 이 앱에 열린 프로젝트만** 고친다 — 다른 프로젝트 파일을 스크립트로 고치면 그걸 열어 둔 앱이 옛 값으로 되돌린다(2026-10-29).
    //     그래서 프로젝트를 열 때(populateTabData) 몇 초 뒤 한 번 돈다. 고칠 게 없으면 아무것도 안 쓴다(멱등). Ctrl+Z 로 되돌릴 수 있다.
    P.repairPlacement = (P.repairPlacement !== false);
    function rowText(row, ci) { return String((ci && ci.content !== -1 && row[ci.content]) || ''); }
    function isAutoRow(row, ci) { return !!(row && (row._mailRaw || /\[출처\]/.test(rowText(row, ci)))); }
    /** @returns {{moved:number, relinked:number}} — 바꾼 게 있으면 저장까지 한다 */
    window.approvalRepairOpenProject = async function (opts) {
        opts = opts || {};
        var out = { moved: 0, relinked: 0 };
        if (off() && !opts.force) return out;
        if (typeof globalData === 'undefined' || !globalData || globalData.length <= 2 || typeof colIdx === 'undefined' || !colIdx) return out;
        var gd = globalData, ci = colIdx;
        // ② 링크 줄 붙이기 — 결재 원문 주소가 든 줄만
        for (var i = 1; i < gd.length; i++) {
            var row = gd[i]; if (!row || ci.content === -1) continue;
            var t = rowText(row, ci);
            if (t.indexOf('/app/approval/document/') === -1) continue;
            var t2 = t.replace(/\r?\n🔗 (https?:\/\/\S*\/app\/approval\/document\/\d+)/, ' 🔗 $1');
            if (t2 !== t) { row[ci.content] = t2; out.relinked++; }
        }
        // ⑥ 인사 시스템 알림 메일 행 지우기(2026-11-24 사용자 결정 "지워줘") — 메일 자동배치가 10월부터 넣은 연장근로·근무계획·연차 안내.
        //    새로 들어오는 건 js/15b Stage0 이 AI 전에 버린다. 여기선 **인사 표식**(제목 MAIL_AUTO_NOTICE_SUBJECT_MARKERS · 본문 '경로 : 인사관리')만 —
        //    Outlook 일정 갱신 등 다른 자동 알림 행은 사람이 정하지 않았으므로 건드리지 않는다. 결재 행·사람이 만든 행(_mailRaw 없음)도 제외.
        out.noticeRemoved = 0;
        var HR_SUBJ = window.MAIL_AUTO_NOTICE_SUBJECT_MARKERS || [], HR_BODY = ['경로 : 인사관리'];
        var isHrNotice = function (mr) {
            if (!mr || mr.approval) return false;
            var s = String(mr.subject || ''), b = String(mr.body2000 || '');
            return HR_SUBJ.some(function (m) { return s.indexOf(m) !== -1; }) || HR_BODY.some(function (m) { return b.indexOf(m) !== -1; });
        };
        if (P.removeHrNotices !== false) {
            for (var y = gd.length - 1; y >= 1; y--) {
                var ry = gd[y];
                if (ry && ry._level !== 0 && isHrNotice(ry._mailRaw)) { gd.splice(y, 1); out.noticeRemoved++; }
            }
        }
        // ④ 잘못 퍼진 결재 행 빼기(데이터 P.cleanupPlacements) — 지킬 프로젝트(keepIds·keepModel)면 그대로 둔다
        out.removed = 0;
        var CL = (P.cleanupPlacements || []).filter(function (c) { return c && c.key; });
        if (CL.length) {
            var fidNow = String(window.currentDriveFileId || '');
            var pm = window.projectMeta || {};
            var modelNow = [pm['모델명'], pm['고객모델명'], pm['KTK모델명'], pm['프로젝트명']].filter(Boolean).join(' ');
            for (var z = gd.length - 1; z >= 1; z--) {
                var rz = gd[z], kz = rz && rz._mailRaw && rz._mailRaw.key;
                if (!kz) continue;
                var rule = CL.filter(function (c) { return c.key === kz; })[0];
                if (!rule) continue;
                var keep = rule.fromIds
                    ? rule.fromIds.indexOf(fidNow) === -1          // fromIds: 그 프로젝트에서만 뺀다(그 밖은 남긴다)
                    : ((rule.keepIds || []).indexOf(fidNow) !== -1 || (rule.keepModel && modelNow.indexOf(rule.keepModel) !== -1));
                if (keep || !fidNow) continue;   // 어느 프로젝트인지 모르면 지우지 않는다
                gd.splice(z, 1); out.removed++;
            }
        }
        // ③ 긴 결재 업무명 줄이기(2026-11-24 사용자 지적) — 이 기능이 만든 행(_mailRaw.approval)만, 실제로 짧아질 때만.
        //    이름은 _origT* 에 있고 재계산이 화면 칸으로 베낀다. 전체 제목은 상세내용 [출처] 에 남아 있다.
        out.renamed = 0;
        var PFX = '[' + T('결재', 'Approval') + '] ', SFX = ' ＊AI📧';
        for (var q = 1; q < gd.length; q++) {
            var rw = gd[q]; if (!rw || !rw._mailRaw || !rw._mailRaw.approval) continue;
            ['_origDev', '_origT1', '_origT2', '_origT3', '_origT4'].forEach(function (f) {
                var v = String(rw[f] || '');
                if (v.indexOf(PFX) !== 0) return;
                var hasSfx = v.slice(-SFX.length) === SFX;
                var core = v.slice(PFX.length, hasSfx ? v.length - SFX.length : v.length);
                var full = String(rw._mailRaw.subject || core);   // 원래 제목(옛 행은 90자에서 잘렸을 수 있다)
                var sh = shortTitleOf(full, rw._mailRaw.approval.formName);
                // '＊AI📧' 는 결재 업무엔 안 붙인다(2026-11-24 사용자 요청) — 새 행은 js/14b 가 처음부터 안 붙이고, 옛 행은 여기서 뗀다
                var nv = PFX + ((sh && sh.length < core.length) ? sh : core);
                if (nv !== v) { rw[f] = nv; out.renamed++; }
            });
        }
        // ① 첫 단계 머리 위의 자동 행
        var firstL0 = -1;
        for (var j = 1; j < gd.length; j++) { if (gd[j] && gd[j]._level === 0) { firstL0 = j; break; } }
        if (firstL0 > 1) {
            var stray = [];
            for (var k = firstL0 - 1; k >= 1; k--) {
                var r = gd[k];
                if (r && r._level !== 0 && isAutoRow(r, ci) && ci.start !== -1 && r[ci.start]) { stray.unshift(r); gd.splice(k, 1); }
            }
            if (stray.length) {
                if (window.computeCalcDatesForRows) { try { window.computeCalcDatesForRows(gd.slice(1), ci); } catch (e) { /* 날짜 계산 실패 — 아래 셀 값으로 비교 */ } }
                stray.sort(function (a, b) { return String(a[ci.start]).localeCompare(String(b[ci.start])); });
                stray.forEach(function (r) {
                    var ds = String(r[ci.start]).slice(0, 10);
                    var L0 = window.pickL0SectionByDate(window.buildL0SectionInfo(gd, ci), ds) || '__END__';
                    var pos = window.computeL0InsertPos(gd, ci, L0, ds, true, r._mailRaw && r._mailRaw.date).pos;
                    if (L0 !== '__END__' && ci.devStage !== -1) r[ci.devStage] = L0;
                    var p = (typeof parseDateValue === 'function') ? parseDateValue(ds) : null;
                    if (p) r._calcStartTs = p.ts;   // 다음 행이 이 행을 기준으로 자리를 찾게
                    gd.splice(pos, 0, r);
                    out.moved++;
                });
            }
        }
        // ⑤ 엉뚱한 단계에 들어간 결재 행(2026-11-24 실측 STELLAR32 — 단계 고르기 버그, js/14b pickL0SectionByDate 수정)
        //    결재 행만 본다(오늘 이 기능이 넣은 것) — 사람이 손으로 옮겼을 수 있는 메일 행은 안 건드린다.
        //    단계 날짜 범위는 **결재 행을 뺀** 표로 잰다(잘못 들어간 행이 그 단계의 범위를 늘려 놓았을 수 있다).
        (function restage() {
            var sectionOf = function (rows, idx) {
                if (ci.devStage !== -1) return String(rows[idx][ci.devStage] || '').trim();
                for (var u = idx; u >= 1; u--) { var x = rows[u]; if (x && x._level === 0) return String(x._origDev || x[ci.wbs] || '').trim(); }
                return '';
            };
            var isApv = function (x) { return x && x._level !== 0 && x._mailRaw && x._mailRaw.approval && ci.start !== -1 && x[ci.start]; };
            var base = gd.filter(function (x, i) { return i === 0 || !isApv(x); });
            try { if (window.computeCalcDatesForRows) window.computeCalcDatesForRows(base.slice(1), ci); } catch (e) { return; }
            var l0s = window.buildL0SectionInfo(base, ci);
            var wrong = [];
            for (var w = 1; w < gd.length; w++) {
                if (!isApv(gd[w])) continue;
                var want = window.pickL0SectionByDate(l0s, String(gd[w][ci.start]).slice(0, 10));
                if (want && want !== '__END__' && want !== sectionOf(gd, w)) wrong.push(gd[w]);
            }
            if (!wrong.length) return;
            wrong.forEach(function (x) { var at = gd.indexOf(x); if (at > 0) gd.splice(at, 1); });
            try { if (window.computeCalcDatesForRows) window.computeCalcDatesForRows(gd.slice(1), ci); } catch (e) { /* 셀 값으로 비교 */ }
            wrong.sort(function (a, b) { return String(a[ci.start]).localeCompare(String(b[ci.start])); });
            wrong.forEach(function (x) {
                var ds = String(x[ci.start]).slice(0, 10);
                var L0 = window.pickL0SectionByDate(window.buildL0SectionInfo(gd, ci), ds) || '__END__';
                var pos = window.computeL0InsertPos(gd, ci, L0, ds, true, x._mailRaw && x._mailRaw.date).pos;
                if (L0 !== '__END__' && ci.devStage !== -1) x[ci.devStage] = L0;
                var pv = (typeof parseDateValue === 'function') ? parseDateValue(ds) : null;
                if (pv) x._calcStartTs = pv.ts;
                gd.splice(pos, 0, x);
                out.moved++;
            });
        })();
        if (!out.moved && !out.relinked && !out.renamed && !out.removed && !out.noticeRemoved) return out;
        // 💬 [2026-11-24 사용자 요청 "쉬운 말로"] '자동배치 자리' 같은 내부 말 대신 무엇을 했는지만 — 화면 알림·수정이력 같은 문장
        var partsKo = [], partsEn = [];
        if (out.moved) { partsKo.push('날짜와 맞지 않는 자리에 있던 업무 ' + out.moved + '건을 날짜에 맞는 단계로 옮겼습니다'); partsEn.push('moved ' + out.moved + ' misplaced tasks into the stage matching their date'); }
        if (out.renamed) { partsKo.push('긴 결재 업무 이름 ' + out.renamed + '건을 짧게 줄였습니다'); partsEn.push('shortened ' + out.renamed + ' long approval task names'); }
        if (out.relinked) { partsKo.push('결재 링크 ' + out.relinked + '건을 한 줄로 정리했습니다'); partsEn.push('tidied ' + out.relinked + ' approval link lines'); }
        if (out.removed) { partsKo.push('다른 프로젝트 결재 문서 ' + out.removed + '건을 이 프로젝트에서 뺐습니다'); partsEn.push('removed ' + out.removed + ' approval rows that belong to another project'); }
        if (out.noticeRemoved) { partsKo.push('프로젝트와 관계없는 인사 시스템 알림(연장근로·근무계획·연차 안내) ' + out.noticeRemoved + '건을 지웠습니다'); partsEn.push('deleted ' + out.noticeRemoved + ' HR system notices (overtime, work plan, leave reminders)'); }
        try { if (typeof logChange === 'function') logChange(1, -1, '없음', partsKo.join(' · ')); } catch (e) { /* 기록 실패는 무시 */ }
        try { if (window.recalculateSchedules) window.recalculateSchedules(); } catch (e) { console.warn('[자리 바로잡기] 재계산 실패', e); }
        try { if (window.renderGantt) window.renderGantt(); } catch (e) { /* 다음 렌더에 반영 */ }
        var okSave = true;
        if (!opts.noSave && window.saveToGoogleDrive) {
            okSave = await window.saveToGoogleDrive({ suppressAlert: true });
            if (!okSave && window._saveLocalBackup) window._saveLocalBackup('approval-repair-save-blocked');
        }
        out.saved = !!okSave;
        if (window.showToast && !opts.silent) {
            if (okSave) window.showToast(T('📋 ' + partsKo.join(' · ') + ' — 되돌리려면 Ctrl+Z', '📋 ' + partsEn.join(' · ') + ' — Ctrl+Z to undo'), 'info', 8000);
            else {
                // 💾 [2026-11-24 실측 — 개발업무] 저장이 막히면(Summary 필수 칸 비어 있음 등) 화면에서만 고쳐진 채다 — "했다" 고 말하지 않는다
                var why = String(window._lastSaveBlockReason || '').slice(0, 80);
                window.showToast(T('⚠️ 화면에서는 정리했지만 저장되지 않았습니다' + (why ? ' (' + why + ')' : '') + ' — 막힌 이유를 고친 뒤 저장하면 반영됩니다. 정리한 내용: ' + partsKo.join(' · '),
                                   '⚠️ Tidied on screen but NOT saved' + (why ? ' (' + why + ')' : '') + ' — fix the blocker and save. Changes: ' + partsEn.join(' · ')), 'error', 12000);
            }
        }
        console.info('[자리 바로잡기]', JSON.stringify(out));
        return out;
    };
    (function hookOpen() {
        var orig = window.populateTabData;
        if (typeof orig !== 'function') return;
        // 🐛 [2026-11-24 실측 — K27 을 열어도 안 고쳐졌다] 프로젝트 열기(js/04c)는 populateTabData 를 **먼저** 부르고
        //    그 뒤에 currentDriveFileId 를 새 파일로 바꾼다. 그래서 여기서 id 를 잡아 두면 **이전 프로젝트 id** 라
        //    4초 뒤 "같은 프로젝트인가" 검사가 늘 어긋나 건너뛰었다. → id 는 타이머가 울릴 때 읽고, 연달아 불리면 한 번으로 모은다.
        var timer = null;
        window.populateTabData = function () {
            var r = orig.apply(this, arguments);
            if (P.repairPlacement) {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    if (!window.currentDriveFileId) return;   // 열린 프로젝트 파일이 없으면(새 시트·엑셀만) 하지 않는다
                    window.approvalRepairOpenProject({}).catch(function (e) { console.warn('[자리 바로잡기] 실패:', e); });
                }, 4000);
            }
            return r;
        };
    })();

    // ── 배경 스케줄 ────────────────────────────────────────────────────────
    // 🙈 [2026-11-24 사용자 요청] 탭이 안 보여도 돈다 — 앱을 다른 탭 뒤에 띄워 두고 일하면 하루 종일 한 번도 안 돌았다.
    //    목록 읽기뿐이라 가볍다. 브라우저가 숨은 탭 타이머를 늦춰도(최대 1분 단위) 2시간 간격엔 영향이 없다.
    function tick() { if (!off()) window.approvalIntakeRun({ manual: false }).catch(function (e) { console.warn('[결재 가져오기]', e); }); }
    setTimeout(function () {
        tick();
        setInterval(tick, Math.max(10, P.intervalMin) * 60000);
    }, Math.max(10, P.firstDelaySec) * 1000);
})();
