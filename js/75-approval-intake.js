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
        listLimit: 40,                 // 문서함마다 최근 몇 건을 보나(최신순)
        backfillDays: 30,              // 처음 켤 때 소급해서 가져올 기간 — 그보다 오래된 건 '본 것'으로만 표시
        maxAgeDays: 120,               // 그 뒤에도 이보다 오래된 문서가 새로 보이면(참조로 뒤늦게 추가 등) 가져오지 않는다
        maxPerRun: 25,                 // 한 번에 처리할 새 문서 상한
        firstDelaySec: 90,             // 앱을 연 뒤 첫 배경 스캔까지
        intervalMin: 120,              // 배경 스캔 간격(그룹웨어가 로그인돼 있을 때만)
        skipForms: ['휴가', '연차', '반차', '근태', '경조', '조퇴', '외출'],  // 양식 이름에 이 말이 있으면 가져오지 않는다
        seenMax: 4000,                 // 장부 상한(오래된 것부터 버린다)
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
        memberCheck: true                                  // 기안자가 그 프로젝트 담당자 칸에 없으면 자동 대신 대기
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
    function taskOf(d, boxLabel) {
        var ts = docTs(d), ymd = ymdOf(ts);
        var title = stripTags(d.title) || stripTags(d.formName) || String(d.docNum || d.id);
        var dateTag = ymd + (d.draftedAt && /\d{2}:\d{2}/.test(d.draftedAt) ? ' ' + /\d{2}:\d{2}/.exec(d.draftedAt)[0] : '');
        var t = {
            '업무명': ('[' + T('결재', 'Approval') + '] ' + title).slice(0, 90),
            '시작일': ymd, '완료일': statusOf(d) === '완료' ? ymd : '', '상태': statusOf(d),
            '개발단계': '', '담당구분': '미분류', 'wbs레벨': 4,
            '상세내용': '[핵심내용] ' + stripTags(d.formName) + (d.docNum ? ' ' + d.docNum : '') + ' · ' +
                       T('기안', 'drafter') + ' ' + (d.drafterName || '') + ' · ' + [d.status, d.apprStatus].filter(Boolean).join('/') +
                       '\n🔗 ' + (d.url || '') +
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
            if (opts.manual && window._gwEnsureLogin) {
                var g = await window._gwEnsureLogin(function (m) { if (window.showToast) window.showToast(m, 'info'); });
                if (!g || !g.ok) { res.skipped = 'gw_login'; res.message = (g && g.message) || ''; return finish(res, opts); }
            } else {
                var st = null;
                try { st = await fetch(BASE + '/gw/status').then(function (r) { return r.json(); }); } catch (e) { st = null; }
                if (!st || !st.ok) { res.skipped = 'gw_not_ready'; return finish(res, opts); }
            }
            // ② 후보 프로젝트 — 메일과 같은 색인
            var cands = [];
            try { cands = window._msFilterCandidateProjects(await window._msLoadProjectIndex()) || []; } catch (e) { cands = []; }
            if (!cands.length) { res.skipped = 'no_candidates'; return finish(res, opts); }

            var store = loadStore();
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
                    if (store.seen[d.id]) { store.seen[d.id].st = d.status || store.seen[d.id].st; return; }
                    fresh.push({ d: d, box: box.label });
                });
            }
            // 오래된 것부터 처리(카드가 시간 순으로 쌓이게)
            fresh.sort(function (a, c) { return docTs(a.d) - docTs(c.d); });

            var done = 0, bi = null;   // bi: BOM 코드 색인 — 이번 실행에서 처음 필요할 때 한 번만 만든다
            for (var i = 0; i < fresh.length; i++) {
                var d = fresh[i].d, boxLabel = fresh[i].box, ts = docTs(d);
                var mark = function (r) { store.seen[d.id] = { at: new Date().toISOString(), st: d.status || '', res: r, box: boxLabel }; };
                if (ts && ts < cutoff) { res.old++; mark('old'); continue; }
                if (isSkipForm(d)) { res.skippedForm++; mark('skip_form'); continue; }
                if (done >= P.maxPerRun) break;   // 나머지는 다음 번에(장부에 안 적었으니 다시 보인다)
                done++; res.fresh++;
                var key = keyOf(d);
                if (inInbox(key)) { res.dup++; mark('dup'); continue; }

                var mail = mailOf(d), pre = null, jd = null, tag = null;
                try { pre = window.mailRoutePreJudge ? window.mailRoutePreJudge(mail, cands) : null; } catch (e) { pre = null; }
                if (!pre) { try { jd = window.mailRouteJudge(mail, cands, null); } catch (e) { jd = null; } }
                if (pre && sizeMismatch(mail.subject, pre.target)) {
                    // 자동 확정을 대기로 내린다 — 후보로는 남긴다(사람이 맞다고 보면 한 번에 보낼 수 있게)
                    jd = { candidates: [pre.target].concat(pre.extra || []), basis: 'size_mismatch', family: pre.family,
                           reason: T('제목 크기(' + sizesIn(mail.subject).join('/') + '")가 ' + (pre.target.model || '') + '(' + pre.target.inch + '") 와 다름 — 원래 판정: ', 'size in title differs from target — was: ') + pre.reason };
                    pre = null;
                    tag = waitTag(jd);
                }
                if (pre) tag = autoTag(pre);
                else if (jd && jd.decision === 'auto' && jd.target) tag = waitTag({ candidates: [jd.target], reason: jd.reason, basis: jd.basis, family: jd.family });
                else if (jd && jd.decision === 'wait' && jd.candidates && jd.candidates.length) tag = waitTag(jd);
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
                var task = taskOf(d, boxLabel), raw = mailRawOf(d, boxLabel);
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
    function finish(res, opts) {
        try { console.info('[결재 가져오기]', JSON.stringify(res)); } catch (e) { /* 무시 */ }
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

    // ── 배경 스케줄 ────────────────────────────────────────────────────────
    function tick() { if (!off() && !document.hidden) window.approvalIntakeRun({ manual: false }).catch(function (e) { console.warn('[결재 가져오기]', e); }); }
    setTimeout(function () {
        tick();
        setInterval(tick, Math.max(10, P.intervalMin) * 60000);
    }, Math.max(10, P.firstDelaySec) * 1000);
})();
