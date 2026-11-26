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
        // 📅 [2026-11-23 사용자 요청] 전일·금일·전주·금주·전월·금월 — `prev*` 는 같은 단위를 한 칸 앞으로 민 것.
        //    ⚠️ 금일/금주/금월의 id 는 옛 'day'/'week'/'month' 그대로(저장된 모드·캐시·문답 경로가 그 이름을 쓴다).
        periods: [
            // 🗣 [2026-11-23 사용자 요청] 전일·금일… → 어제·오늘·지난주·이번주·지난달·이번달(일일보고 칩도 같은 말)
            { id: 'prevday', ko: '어제', en: 'Yesterday' }, { id: 'day', ko: '오늘', en: 'Today' },
            { id: 'prevweek', ko: '지난주', en: 'Last week' }, { id: 'week', ko: '이번주', en: 'This week' },
            { id: 'prevmonth', ko: '지난달', en: 'Last month' }, { id: 'month', ko: '이번달', en: 'This month' }
        ],
        customId: 'custom',                    // 📅 기간 직접 설정(시작~끝)
        legacyId: 'legacy',
        /**
         * 📊 '일정 현황'(옛 AI 요약 — 지연·임박·리스크·담당자별 액션) 을 보일 것인가.
         *
         * ⚠️ [2026-11-09] **끈다.** 그 모드는 간트의 `상태`·`완료일` 칸을 근거로 삼는데, 실측하니
         *    그 칸이 관리되지 않는다 — 내 프로젝트 7개 **리프 2,272행 중 '완료' 는 80행(3.5%)**,
         *    두 프로젝트는 **전 행이 '진행'** 이고, 그래서 '지연' 으로 잡히는 행이 **1,501건**
         *    (STELLAR32 는 827행 중 764행, 가장 오래된 '지연' 이 2026-02-22). 그건 늦은 게
         *    아니라 **아무도 행을 닫지 않은 것**이다. 그 위에 AI 를 돌리면 "지연 764건" 으로
         *    시작하는 그럴듯한 거짓말이 나온다.
         * ⚠️ "현 실정에 맞게 고칠" 길은, 관리되는 유일한 신호(메일 분석 `[핵심내용]`/`[To do]`/
         *    `[문제점]`) 위에 다시 세우는 것인데 — 그게 바로 **일일/주간/월간이 이미 하는 일**이다.
         *    그래서 고치는 게 아니라 **접는다.** 코드는 남겨 두고 스위치만 끈다(간트 일정 관리가
         *    자리잡으면 `showLegacy: true` 한 줄로 돌아온다).
         */
        showLegacy: false,
        defaultMode: 'week',
        modeKey: 'gantt_ps_mode',
        filterKey: 'gantt_ps_filter',          // 담당자·프로젝트·직접 기간 — 이 브라우저에 기억
        scanProjects: true,                    // 🗂 내가 맡은 **다른** 프로젝트도 모은다(js/59 공용 스캐너)
        // 🪐 [2026-11-17 사용자 요청] JIRA 변경사항도 같은 사실 목록에 — **열린 프로젝트의
        //    결정론 연결(프로젝트 코드, js/70)만** 쓴다. 수동 키·검색어·메일 추정은 모델끼리
        //    섞이는 사고가 있어(js/70 헤더 주석) 사람이 "더 찾기"를 눌러야만 도는데, 여긴 그
        //    버튼이 없으니 섞인 걸 걸러낼 길이 없다 → 자동으로는 결정론 하나만.
        //    ⚠️ 범위는 **열린 프로젝트뿐**이다 — 다른 팀 프로젝트의 jiraLinksByUnit 을 읽으려면
        //    그 프로젝트 전체를 또 열어야 해서(js/59 스캐너는 globalData/projectMeta만 돌려준다)
        //    비용이 크다. 모르면 안 넣는다 — 다음에 필요해지면 ctx 에 jiraLinks 를 더해 확장.
        jiraEnabled: true,
        jiraMaxIssues: 40,
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
    /** 🎨 [2026-11-25] 날짜 글자색 클래스 — 일요일·공휴일=빨강, 토요일=파랑, 평일=회색(Daily Report·Calendar 와 같은 규칙, 색은 styles.css/js/21). */
    //    판정은 공용 `window._dateDayCls`(js/04a) 한 곳 — 여기선 그 결과 이름만 이 페이지 범위 클래스(ps-date-*)로 바꾼다.
    function dateCls(s) {
        var c = window._dateDayCls ? window._dateDayCls(s) : '';
        return c ? c.replace('date-day-', 'ps-date-') : '';
    }
    function mode() {
        var m = null;
        try { m = localStorage.getItem(P.modeKey); } catch (e) { /* 아래 */ }
        // ⚠️ 꺼 둔 모드가 저장돼 있으면 **기본 모드로 되돌린다** — 안 그러면 숨긴 화면에
        //    갇혀서 돌아올 버튼이 없다(그 사람만 앱이 고장 난 것처럼 보인다).
        if (m === P.legacyId && !P.showLegacy) return P.defaultMode;
        return m || P.defaultMode;
    }
    window._psMode = mode;

    /**
     * 🔍 보는 조건 — 담당자(PM) / 프로젝트 / 업무 담당자(보조) / 직접 기간.
     * ⚠️ 모달을 다시 그려도 살아 있어야 해서 localStorage 에 둔다(모듈 변수는 새로고침에 날아간다).
     *
     * 💡 [2026-11-11 사용자 요청] "개발3팀 > 프로젝트 담당자 > 프로젝트 선택" 흐름이 기본이다 —
     *    `pm`(=projectMeta.프로젝트담당자, 그 프로젝트를 총괄하는 사람)으로 먼저 거르고, 그 사람
     *    소속 프로젝트만 고를 수 있게 한다. 예전부터 있던 `who`(행의 `_담당구분`을 그 분야 담당자로
     *    푼 값 — HW/FW 등 **업무** 단위 사람, PM과 다를 수 있다)는 **보조 필터**로 남긴다.
     */
    function filt() {
        try {
            var o = JSON.parse(localStorage.getItem(P.filterKey) || 'null');
            if (o && typeof o === 'object') return { pm: o.pm || '', who: o.who || '', proj: o.proj || '', from: o.from || '', to: o.to || '', q: o.q || '' };
        } catch (e) { /* 아래 */ }
        return { pm: '', who: '', proj: '', from: '', to: '', q: '' };
    }
    window._psFilter = filt;
    window._psSetFilter = function (patch) {
        var f = filt();
        Object.keys(patch || {}).forEach(function (k) { f[k] = patch[k]; });
        try { localStorage.setItem(P.filterKey, JSON.stringify(f)); } catch (e) { /* 무시 */ }
        if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
    };
    /** 화면의 날짜칸 두 개를 읽어 적용 — 둘 다 차야 움직인다(한쪽만이면 기간이 아니다). */
    /** 📅 기간설정 날짜 칸이 열려 있나 — 처음 고를 때·다시 누를 때만 연다. */
    var _psCustomOpen = false;
    window._psCustomClick = function () {
        if (mode() === P.customId) _psCustomOpen = !_psCustomOpen;   // 이미 기간설정이면 칸만 열고 닫는다
        else _psCustomOpen = true;
        window._psSetMode(P.customId);
    };
    window._psApplyCustom = function () {
        var a = document.getElementById('ps-from'), b = document.getElementById('ps-to');
        var from = a ? String(a.value || '').trim() : '', to = b ? String(b.value || '').trim() : '';
        if (!from || !to) {
            if (window.showToast) window.showToast(T('시작일과 종료일을 모두 골라주세요.', 'Pick both a start and an end date.'), 'info');
            return;
        }
        if (from > to) { var x = from; from = to; to = x; }   // 거꾸로 골라도 되게
        _psCustomOpen = false;   // 📅 [2026-11-23] 적용하면 날짜 칸을 접는다 — 기간은 아래 제목 줄에 보인다
        window._psSetFilter({ from: from, to: to });
    };
    window._psSetMode = function (m) { try { localStorage.setItem(P.modeKey, m); } catch (e) { /* 무시 */ } if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody(); };
    /**
     * ☑ [2026-11-23 사용자 요청] 기간 버튼 **중복 선택** — 전일+금일, 전주+금주 처럼 누르면 켜고/끈다.
     *    모드는 'prevday+day' 처럼 `+` 로 이은 한 문자열이라 캐시 열쇠(aiPeriodSummary[kind])·저장이 그대로 돈다.
     *    순서는 P.periods 순으로 정규화(같은 조합이 두 열쇠가 되지 않게). 마지막 하나는 끌 수 없다.
     */
    function periodIds() { return P.periods.map(function (p) { return p.id; }); }
    function splitKinds(kind) {
        var ids = periodIds();
        return String(kind || '').split('+').filter(function (k) { return ids.indexOf(k) >= 0; });
    }
    window._psToggleMode = function (id) {
        var ids = periodIds();
        var cur = splitKinds(mode());
        var i = cur.indexOf(id);
        if (i >= 0) { if (cur.length > 1) cur.splice(i, 1); }
        else cur.push(id);
        cur.sort(function (a, c) { return ids.indexOf(a) - ids.indexOf(c); });
        window._psSetMode(cur.join('+'));
    };

    // ── 기간 ────────────────────────────────────────────────────────────────────
    window._psRange = function (kind, base) {
        var b = base ? new Date(base) : new Date(); b.setHours(0, 0, 0, 0);
        var from = new Date(b), to = new Date(b), key, label;
        // ☑ 여러 기간을 골랐으면 각각 구해 **가장 이른 시작 ~ 가장 늦은 끝**으로 합친다.
        if (String(kind).indexOf('+') >= 0) {
            var parts = splitKinds(kind).map(function (k) { return window._psRange(k, base); });
            if (parts.length) {
                var f0 = parts.reduce(function (m, r) { return r.from < m ? r.from : m; }, parts[0].from);
                var t0 = parts.reduce(function (m, r) { return r.to > m ? r.to : m; }, parts[0].to);
                key = ymd(f0) + '~' + ymd(t0);
                // 🗜 [2026-11-23 사용자 요청 "컴팩트하게"] 기간마다 날짜를 다 적지 않고 합친 범위 하나 + 고른 이름만.
                var en0 = window._currentLang === 'en';
                label = splitKinds(kind).map(function (k) {
                    var p = P.periods.filter(function (x) { return x.id === k; })[0];
                    return p ? (en0 ? p.en : p.ko) : k;
                }).join('·') + ' ' + key;
                return { kind: kind, from: new Date(f0), to: new Date(t0), key: key, label: label };
            }
        }
        if (kind === P.customId) {
            // 📅 직접 설정 — 아직 안 골랐으면 **오늘 하루**로 둔다(빈 기간을 만들지 않는다).
            var f = filt();
            var fd = f.from ? new Date(f.from + 'T00:00:00') : new Date(b);
            var td = f.to ? new Date(f.to + 'T00:00:00') : new Date(b);
            if (isNaN(fd)) fd = new Date(b);
            if (isNaN(td)) td = new Date(b);
            from = fd; to = td;
            key = ymd(from) + '~' + ymd(to);
            label = T('기간 ' + key, 'Range ' + key);
            to.setHours(23, 59, 59, 999);
            return { kind: kind, from: from, to: to, key: key, label: label };
        }
        // ⏪ 전일/전주/전월 — 기준일을 한 단위 앞으로 옮긴 뒤 같은 계산을 탄다(계산을 두 벌로 두지 않는다).
        var prev = /^prev/.test(kind);
        var unit = prev ? kind.slice(4) : kind;
        if (prev) {
            if (unit === 'day') b.setDate(b.getDate() - 1);
            else if (unit === 'month') b = new Date(b.getFullYear(), b.getMonth() - 1, 1);
            else b.setDate(b.getDate() - 7);
            from = new Date(b); to = new Date(b);
        }
        if (unit === 'day') { key = ymd(b); label = prev ? T('어제 ' + key, 'Yesterday ' + key) : T('오늘 ' + key, 'Today ' + key); }
        else if (unit === 'month') {
            from = new Date(b.getFullYear(), b.getMonth(), 1); to = new Date(b.getFullYear(), b.getMonth() + 1, 0);
            key = b.getFullYear() + '-' + pad(b.getMonth() + 1); label = (prev ? T('지난달 ', 'Last month ') : '') + T(key.replace('-', '년 ') + '월', key);
        } else {
            var dow = b.getDay(), back = P.weekStartsMonday ? (dow + 6) % 7 : dow;
            from = new Date(b); from.setDate(b.getDate() - back); to = new Date(from); to.setDate(from.getDate() + 6);
            key = ymd(from) + '~' + ymd(to); label = prev ? T('지난주 ' + key, 'Last week ' + key) : T('이번주 ' + key, 'This week ' + key);
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
        // 📅 [2026-11-21] 칸 내용([출처] 꼬리의 날짜) 을 **먼저** — 메일 유래 판정과 같은 규칙(표식 `_mailRaw` 는 2026-11-04 에 통째로 날아간 전력이 있다). 없을 때만 표식.
        var src = String(content || '').match(/\[출처\][^\n]*?_((?:\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{4}[-./]\d{1,2}[-./]\d{1,2})[^_\n]*)_/);
        if (src) d = parseAnyDate(src[1]);
        if (!d && row && row._mailRaw && row._mailRaw.date) d = parseAnyDate(row._mailRaw.date);
        if (!d && row && row._calcStartTs) { var t = new Date(row._calcStartTs); d = new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
        if (!d && ci && ci.start != null && ci.start !== -1 && row) d = parseAnyDate(row[ci.start]);
        return d;
    };
    function cut(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    /**
     * 한 프로젝트분 사실 — 열린 프로젝트든 NAS 에서 읽은 파일이든 **같은 함수**로 훑는다.
     * `ctx` = { rows, ci, meta, members3, project }
     */
    function collectFrom(ctx, R) {
        // ⚠️ `R` 이 없으면 **기간을 안 거른다** — 다른 프로젝트는 "한 번 읽어 전부 모아 두고"
        //    기간은 화면에서 거른다(아래 `_psScan` 주석 참고).
        var gd = ctx.rows, ci = ctx.ci || {};
        var out = [], scanned = 0;
        if (!Array.isArray(gd)) return { facts: out, scanned: 0 };
        for (var i = 1; i < gd.length; i++) {
            var row = gd[i]; if (!row || row._level === undefined) continue;
            var content = (ci.content != null && ci.content !== -1) ? String(row[ci.content] || '') : '';
            var p = window._mailContentParse ? window._mailContentParse(content) : { isMail: /\[출처\]|\[핵심내용\]/.test(content) };
            if (!p.isMail && !(P.includeNonMail && content.trim())) continue;
            scanned++;
            var d = window._psFactDate(row, content, ci);
            if (!d) continue;
            if (R && (d < R.from || d > R.to)) continue;
            var people = window._extractMailSenderReceiver ? window._extractMailSenderReceiver(content) : { sender: p.from || '', receiver: p.to || '' };
            var cat = String(row._담당구분 || '').trim();
            out.push({
                idx: i, date: ymd(d), _ts: d.getTime(),
                task: taskName(row) || T('(제목 없음)', '(untitled)'),
                cat: cat,
                // 👤 담당자(기본 필터) — 그 **프로젝트**를 총괄하는 사람(projectMeta.프로젝트담당자).
                //    👷 업무 담당자(보조 필터) — 역할(`_담당구분`)을 그 프로젝트의 projectMeta 로 푼
                //    값으로, 행마다(HW/FW 등 분야별로) 다를 수 있다. 둘은 다른 사람일 수 있다.
                //    ⚠️ 해석기는 js/59 `_dailyCatAssignee` 하나를 빌려 쓴다(두 벌이면 화면마다 다른 사람이 나온다).
                pm: String((ctx.meta || {}).프로젝트담당자 || '').trim(),
                // 👤 담당자 직접 지정(`row._담당자`)이 있으면 그 이름이 역할보다 먼저(js/04k setRowAssignee).
                // 📧 [2026-11-24] 그다음은 **상세내용**(`[요청][보낸이 → 받는이]` 줄) — 메일이 실제로 누구에게
                //    일을 넘겼는지가 역할(HW·FW)→Summary 멤버보다 정확하다(사용자 지적: 검토요청 받은 사람이 아니라
                //    HW 담당자가 나왔다). 못 찾으면 예전처럼 역할로.
                assignee: (row._담당자 && String(row._담당자).trim()) || contentOwner(people, p) || roleOwner(cat, ctx.meta, ctx.members3),
                manual: !!(row._담당자 && String(row._담당자).trim()),
                fromContent: !(row._담당자 && String(row._담당자).trim()) && !!contentOwner(people, p),
                project: ctx.project || '',
                local: !!ctx.local,          // 열린 프로젝트의 행인가(#G 링크는 그때만 뜻이 있다)
                status: (ci.status != null && ci.status !== -1) ? String(row[ci.status] || '').trim() : '',
                sender: people.sender || p.from || '', receiver: people.receiver || p.to || '',
                core: cut(p.core, P.maxCore), todo: cut(p.todo, P.maxTodo), issue: cut(p.issue, P.maxIssue), fix: cut(p.fix, P.maxIssue),
                answer: (ci.answer != null && ci.answer !== -1) ? cut(row[ci.answer], P.maxTodo) : '',
                mailRaw: row._mailRaw || null     // 📧 원문보기용(참조만 — 복사하지 않는다)
            });
        }
        return { facts: out, scanned: scanned };
    }

    // 📧 상세내용 → 업무 담당자 판정은 js/59 `_mailContentOwner` **한 곳**(일일보고·아침 브리핑과 같은 규칙).
    function contentOwner(people, p) { return window._mailContentOwnerFrom ? window._mailContentOwnerFrom(people, p) : ''; }
    window._psContentOwner = contentOwner;   // 하네스용

    /** 역할 → 그 프로젝트의 담당자 이름. 못 풀면 빈 값(=미지정, 거르지 않는다). */
    function roleOwner(cat, meta, members3) {
        var raw = String(cat || '').trim();
        if (!raw) return '';
        var norm = (typeof window._normalizeWbsDiscipline === 'function') ? window._normalizeWbsDiscipline(raw) : raw;
        var parts = String(norm || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        for (var i = 0; i < parts.length; i++) {
            var n = (typeof window._dailyCatAssignee === 'function')
                ? window._dailyCatAssignee(parts[i], meta, members3) : '';
            if (n) return n;
        }
        return '';
    }

    // 🗂 내 팀 **다른** 프로젝트의 사실 — 뒤에서 모아 둔다(키는 기간).
    //    `entries` = 그 팀의 project_index 항목(team/assignee/file_name) — **사실이 0건인 프로젝트도**
    //    PM·프로젝트 선택지에 보이게 하려고 따로 들고 있는다(아래 `_psCollectFacts` 참고).
    var _psOther = { key: '', facts: [], scanned: 0, projects: [], entries: [], busy: false, loaded: false,
                     done: 0, total: 0, errs: [] };
    window._psOtherScan = _psOther;

    /** 🧹 사람이 바뀌면(js/64) 모아 둔 사실은 앞사람 기준이다 — 버린다. */
    window._psResetScan = function () {
        _psOther = { key: '', facts: [], scanned: 0, projects: [], entries: [], busy: false, loaded: false,
                     done: 0, total: 0, errs: [] };
        window._psOtherScan = _psOther;
    };

    /**
     * **개발팀 전체**(내가 속한 팀, 완료 제외)의 사실을 **한 번만** 읽어 전부 모아 둔다.
     * 기간은 화면에서 거른다.
     *
     * 💡 [2026-11-11 사용자 요청] "개발3팀 > 프로젝트 담당자(PM) > 프로젝트 선택" 이 기본 흐름이라,
     *    PM을 고르기 **전에** 그 팀의 모든 PM/프로젝트가 선택지에 있어야 한다 — 그래서
     *    `dailyScanMyProjects` 를 `{onlyMyProjects:false}` 로 불러 "내가 맡은 것"이 아니라
     *    **내 팀 전체**(js/59 `DAILY_SCAN.myTeamOnly` 는 그대로 — 남의 팀 폴더는 ACL 로도 막힌다)를
     *    읽는다. 전역 `DAILY_SCAN.onlyMyProjects` 자체는 건드리지 않는다 — js/59 자신의 "오늘 할
     *    일" 후보 스캔은 여전히 "내 프로젝트만"이어야 한다(안 그러면 남의 업무 170건이 섞인다).
     *
     * ⚠️⚠️ [2026-11-09 신고 "일일/주간/월간/기간설정마다 동작이 이상함"] 처음엔 캐시 열쇠에
     *    **기간**을 넣어서, 일일↔주간↔월간을 누를 때마다 프로젝트 파일 13개를 **전부 다시
     *    읽었다**(실측 1.0~7.5초). 그 동안 화면은 "0건 · 담당자 전체(선택지 없음)" 였고,
     *    사람 눈엔 **못 가져오는 것처럼** 보였다. 파일은 그대로인데 날짜 조건만 달라지는 것이니
     *    다시 읽을 이유가 없다 → 전 기간을 한 벌 들고 메모리에서 거른다(실측 7개 프로젝트
     *    1,433건, 몇 MB 가 안 된다).
     * ⚠️ 기다리게 하지 않는다 — 한 건 끝날 때마다 **바로 합치고** 다시 그린다(전엔 전부 끝난
     *    뒤에야 합쳐서, 3초 내내 아무것도 안 보였다).
     */
    window._psOrdinalSeq = window._psOrdinalSeq || 0;
    window._psScan = function () {
        if (!P.scanProjects || typeof window.dailyScanMyProjects !== 'function') return;
        if (_psOther.busy || _psOther.loaded) return;
        _psOther = { key: 'all', facts: [], scanned: 0, projects: [], entries: [], busy: true, loaded: false,
                     done: 0, total: 0, errs: [] };
        window._psOtherScan = _psOther;
        var mine = _psOther;
        function repaint() {
            if (window._renderAiProjectSummaryBody && mode() !== P.legacyId) window._renderAiProjectSummaryBody();
        }
        // 번호 대역은 훑기가 거듭돼도 겹치지 않게 계속 늘린다(캐시로 돌아온 옛 사실의 번호와 부딪히지 않게).
        var merged = [];   // 이번 훑기에서 콜백으로 합친 것
        window.dailyScanMyProjects('psfacts', function (ctx) {
            var g = collectFrom(ctx, null);          // 기간은 여기서 안 거른다
            // 🔢 [2026-11-21] 다른 프로젝트 행의 `idx` 는 그 파일 안 행 번호라 열린 프로젝트와 **겹친다** — 프롬프트에 #G12 가 둘,
            //    `_psGround` 는 어느 쪽이든 통과, 요약 링크는 열린 프로젝트 행으로 튄다. 프로젝트마다 다른 대역을 준다
            //    (JIRA 는 100000+, 여기는 200000 + 5000×n — 행 5,000 미만 전제·`local:false` 라 링크는 안 만든다).
            var base = 200000 + 5000 * (++window._psOrdinalSeq);
            g.facts.forEach(function (f) { if (!f.local) { f.rowIdx = f.idx; f.idx = base + f.idx; } });
            var got = { project: ctx.project, facts: g.facts, scanned: g.scanned };
            // 한 건 끝나자마자 합친다 — 화면이 차오르는 게 보여야 "도는 중" 임을 안다.
            mine.facts = mine.facts.concat(got.facts);
            mine.scanned += got.scanned;
            if (got.facts.length) mine.projects.push(got.project);
            merged.push(got);
            return got;
        }, function (st) {
            mine.done = st.done; mine.total = st.total;
            repaint();
        }, { onlyMyProjects: false, includeOpen: true }).then(function (r) {
            mine.errs = r.errs;
            // 🐞 [2026-11-23] 스캐너는 같은 파일을 **캐시**로 돌려줄 땐 콜백을 안 부른다 — 훑기를 초기화(사람 전환 등)하고
            //    다시 훑으면 사실이 0건이 됐다. 콜백으로 못 받은 결과는 여기서 합친다(번호는 첫 수집 때 이미 옮겨져 있다).
            (r.results || []).forEach(function (got) {
                if (!got || got._skipped || merged.indexOf(got) !== -1 || !Array.isArray(got.facts)) return;
                mine.facts = mine.facts.concat(got.facts);
                mine.scanned += got.scanned || 0;
                if (got.facts.length) mine.projects.push(got.project);
            });
            // 📁 [2026-11-11] project_index 항목(팀 전체) — **사실이 0건이어도** PM·프로젝트
            //    선택지에 나와야 하니, 사실과 별도로 그대로 들고 있는다.
            mine.entries = r.entries || [];
            mine.busy = false;
            mine.loaded = true;
            repaint();
        }).catch(function (e) {
            mine.errs.push(String(e && e.message || e));
            mine.busy = false;
            repaint();
        });
    };

    /** 🧹 다시 읽어야 할 때(사람이 바뀌었다·새로고침 요청) — 캐시를 버린다. */
    window._psReloadScan = function () {
        _psOther = { key: '', facts: [], scanned: 0, projects: [], busy: false, loaded: false,
                     done: 0, total: 0, errs: [] };
        window._psOtherScan = _psOther;
        window._psScan();
    };

    // 🪐 [2026-11-17] JIRA — 열린 프로젝트의 결정론 연결(프로젝트 코드)만, 캐시는 그 코드
    //    집합이 바뀔 때만 다시 받는다(모델을 바꾸거나 연결 설정을 고치면 `sig` 가 달라진다).
    var _psJira = { key: '', issues: [], busy: false, loaded: false, err: '' };
    window._psJiraScan = _psJira;

    /** 🧹 사람이 바뀌면(js/64) 앞사람 기준 캐시는 버린다 — `_psResetScan` 과 짝. */
    window._psResetJiraScan = function () {
        _psJira = { key: '', issues: [], busy: false, loaded: false, err: '' };
        window._psJiraScan = _psJira;
    };

    window._psScanJira = function () {
        if (!P.jiraEnabled || typeof window._jiraProjectKeysOf !== 'function' || typeof window._jiraFetchIssuesByKeys !== 'function') return;
        var keys = window._jiraProjectKeysOf((window.tabData || {}).jiraLinksByUnit);
        var sig = keys.slice().sort().join(',');
        if (_psJira.key === sig && (_psJira.loaded || _psJira.busy)) return;
        if (!keys.length) {
            _psJira = { key: sig, issues: [], busy: false, loaded: true, err: '' };
            window._psJiraScan = _psJira;
            return;
        }
        _psJira = { key: sig, issues: [], busy: true, loaded: false, err: '' };
        window._psJiraScan = _psJira;
        var mine = _psJira;
        window._jiraFetchIssuesByKeys(keys, { maxResults: P.jiraMaxIssues }).then(function (r) {
            mine.issues = r.issues || [];
            mine.err = r.ok ? '' : (r.error || '');
            mine.busy = false;
            mine.loaded = true;
            if (window._renderAiProjectSummaryBody && mode() !== P.legacyId) window._renderAiProjectSummaryBody();
        }).catch(function (e) {
            mine.err = String(e && e.message || e);
            mine.busy = false;
            mine.loaded = true;
        });
    };

    /** JIRA 이슈 한 건 → 사실 객체(기존 메일 사실과 **같은 모양**이라 렌더·프롬프트·접지검사를
     *  손 안 대고 그대로 탄다). `idx` 는 간트 행 인덱스와 안 겹치게 10만을 더한다 — `local:false`
     *  라 `link()` 를 안 타므로(위 `collectFrom` 의 `f.local` 분기) 클릭 이동은 안 되지만, 라벨에
     *  이미 JIRA 키가 박혀 있어 어떤 이슈인지는 바로 보인다. */
    function jiraToFact(iss, i, openName, pmName) {
        var d = parseAnyDate(iss.updated) || new Date();
        var bits = [];
        if (iss.status) bits.push(iss.status);
        if (iss.resolution) bits.push(T('해결: ', 'Resolved: ') + iss.resolution);
        if (iss.milestone) bits.push('MS ' + iss.milestone);
        if (iss.components && iss.components.length) bits.push(iss.components.join(', '));
        return {
            idx: 100000 + i, date: ymd(d), _ts: d.getTime(),
            task: '[' + (iss.key || '') + '] ' + (iss.summary || ''),
            // 🧑‍💼 pm 은 **그 프로젝트를 총괄하는 사람**(JIRA 는 모른다) — 비워 두면 PM 으로
            //    거를 때마다 JIRA 사실이 통째로 사라진다(위 `afterPm` 필터). 열린 프로젝트
            //    것이니 그 프로젝트 PM 을 그대로 물려준다.
            cat: 'JIRA', pm: pmName || '', assignee: iss.assignee || '',
            project: openName, local: false,
            status: iss.status || '', sender: '', receiver: '',
            core: bits.join(' · '), todo: '', issue: '', fix: '', answer: ''
        };
    }

    /**
     * 화면·AI·글이 **모두 이걸** 쓴다 — 열린 프로젝트 + 모아 둔 다른 프로젝트, 그리고 필터 적용.
     * ⚠️ 동기 함수다(렌더가 바로 부른다). 다른 프로젝트는 `_psScan` 이 뒤에서 채운 것을 꺼내 쓴다.
     */
    /**
     * 🔑 [2026-11-23 신고 "기간에 업무가 있는데 0건"] 열린 프로젝트 이름 — **파일 id 로** 색인에서 찾은 이름이 1순위.
     *    `currentDriveFileName` 이 경로·꼬리를 달고 오면(팀 폴더/…, 사본 등) 열린 프로젝트 업무가 다른 이름으로 들어가
     *    프로젝트 필터에 걸리고, 훑기는 같은 파일을 id 로 "열린 것"이라 빼서 **양쪽에서 다 빠졌다**.
     */
    function openProjectName() {
        var id = String(window.currentDriveFileId || '').trim();
        var ents = (_psOther && _psOther.entries) || [];
        var relOf = function (x) { try { return (window._storageRelOfId && x) ? String(window._storageRelOfId(x) || '') : ''; } catch (e) { return ''; } };
        // ⚠️ [2026-11-23 2차] id 형식이 색인과 다를 수 있다(NAS 경로형 id ↔ 옛 Drive id) — **NAS 경로**로도 맞춘다.
        var myRel = relOf(id);
        var nm = function (e) { return String(e.file_name || '').replace(/\.json$/i, '').trim(); };
        for (var i = 0; i < ents.length; i++) {
            var e = ents[i]; if (!e) continue;
            if (id && String(e.drive_file_id || '').trim() === id) return nm(e);
            if (myRel && (relOf(e.drive_file_id) === myRel || ((e.team ? e.team + '/' : '') + e.file_name) === myRel)) return nm(e);
        }
        // 색인에서 못 찾으면 NAS 경로의 파일 이름(실제 파일) → 그다음 화면에 적힌 이름 순.
        var base = String(myRel || window.currentDriveFileName || '').split('/').pop().replace(/\.json$/i, '').trim();
        return base;
    }
    window._psOpenProjectName = openProjectName;
    window._psCollectFacts = function (kind, base) {
        var R = window._psRange(kind, base);
        var gd = (typeof globalData !== 'undefined' && globalData) ? globalData : (window.globalData || []);
        var ci = window.colIdx || (typeof colIdx !== 'undefined' ? colIdx : {}) || {};
        var openName = openProjectName();
        var here = collectFrom({ rows: gd, ci: ci, meta: window.projectMeta || {},
                                 members3: (window.tabData && window.tabData.projectMembers3) || [],
                                 project: openName, local: true }, R);
        var other = _psOther;
        // 🗓 모아 둔 건 **전 기간**이다 — 보는 기간만 여기서 거른다(NAS 를 다시 읽지 않는다).
        var inRange = (other.facts || []).filter(function (f) {
            // 🔁 [2026-11-23 "엑셀에 근거가 2번"] 훑기는 **그때** 열린 프로젝트만 뺀다 — 그 뒤 다른 프로젝트를 열면
            //    같은 행이 열린 프로젝트(here)와 훑은 사본 양쪽에 들어가 AI 가 둘 다 근거로 집었다. 열린 쪽이 이긴다.
            if (openName && f.project === openName) return false;
            return f._ts >= R.from.getTime() && f._ts <= R.to.getTime();
        });
        // 🪐 JIRA — 열린 프로젝트의 결정론 연결만, 이미 받아 둔 것(비동기)만 이 기간으로 거른다.
        var pmName = String((window.projectMeta || {}).프로젝트담당자 || '').trim();
        var jiraFacts = (P.jiraEnabled ? (_psJira.issues || []) : [])
            .map(function (iss, i) { return jiraToFact(iss, i, openName, pmName); })
            .filter(function (f) { return f._ts >= R.from.getTime() && f._ts <= R.to.getTime(); });
        var all = here.facts.concat(inRange).concat(jiraFacts);
        var scanned = here.scanned + other.scanned;

        var F = filt();
        // 📁 [2026-11-11 신고 "담당자가 지금 접속한 나만 보인다 — 개발3팀 전부·프로젝트 전부가
        //    보여야 한다"] PM·프로젝트 선택지는 **기간과 무관하게** 스캔한 개발팀 전체에서 만든다.
        //    전엔 `all`(기간이 이미 적용된 사실)에서 뽑아서, 이번 주에 메일이 없는 프로젝트는
        //    선택지에 아예 안 보였다(실제로 그 프로젝트엔 PM도 있고 업무도 있는데, 그 주에만
        //    메일 유래 행이 0건이면 "없는 셈" 취급됐다). → 열린 프로젝트는 사실이 0건이어도
        //    자기 자신을, 다른 프로젝트는 `_psOther.entries`(project_index, 팀 전체)의 pm/project
        //    를 더한다 — **사실이 없어도** 선택할 수 있어야 그 프로젝트를 고른 뒤 "이 기간엔 없음"
        //    을 보여줄 수 있다(실제 사실 목록 `out` 은 여전히 기간을 지킨다).
        var projDir = {};   // project(파일명) → pm, 기간과 무관
        if (openName) projDir[openName] = String((window.projectMeta || {}).프로젝트담당자 || '').trim();
        (other.entries || []).forEach(function (e) {
            var proj = String((e && e.file_name) || '').replace(/\.json$/i, '').trim();
            if (proj && !(proj in projDir)) projDir[proj] = String((e && e.assignee) || '').trim();
        });
        // 보강 — index 에 아직 없거나(캐시 지연) 못 읽은 경우에도, 실제 사실에 찍힌 pm/project 로 채운다.
        here.facts.concat(other.facts || []).forEach(function (f) {
            if (f.project && !(f.project in projDir)) projDir[f.project] = f.pm || '';
        });

        var pms = {};
        Object.keys(projDir).forEach(function (p) { if (projDir[p]) pms[projDir[p]] = 1; });

        // 프로젝트 선택지는 PM 을 고르면 그 PM 소속으로 좁힌다(캐스케이딩) — 역시 기간과 무관.
        // 👷 [2026-11-23 사용자 요청] 업무 담당자를 고르면 그 사람 업무가 있는 프로젝트만 —
        //    사람의 업무는 사실(기간 적용)에만 있으므로 이 줄만은 기간을 따른다.
        var hasWho = function (f) {
            return String(f.assignee || '').split(',').map(function (x) { return x.trim(); }).indexOf(F.who) !== -1;
        };
        var whoProj = null;
        if (F.who) {
            whoProj = {};
            all.forEach(function (f) { if (f.project && hasWho(f)) whoProj[f.project] = 1; });
        }
        var projs = {};
        Object.keys(projDir).forEach(function (p) {
            if (F.pm && projDir[p] !== F.pm) return;
            if (whoProj && !whoProj[p]) return;
            projs[p] = 1;
        });
        if (F.proj) projs[F.proj] = 1;   // 고른 값은 목록에서 사라지지 않게(드롭다운이 '전체'로 보이는 착시 방지)

        // 👷 업무 담당자(보조)는 여전히 **기간이 적용된** 사실(`all`)에서, PM·프로젝트까지 거른 뒤 만든다.
        var afterPm = all.filter(function (f) { return !F.pm || String(f.pm || '') === F.pm; });
        var afterProj = afterPm.filter(function (f) { return !F.proj || String(f.project || '') === F.proj; });
        var people = {};
        afterProj.forEach(function (f) {
            if (f.assignee) f.assignee.split(',').forEach(function (n) { n = n.trim(); if (n) people[n] = 1; });
        });
        if (F.who) people[F.who] = 1;

        // 🔍 [2026-11-23 사용자 요청] 일일보고의 '업무 검색' 을 이어받는다 — 띄어쓰기로 나눈 낱말이 **모두** 들어 있는 사실만.
        var qWords = String(F.q || '').toLowerCase().split(/\s+/).filter(Boolean);
        var out = afterProj.filter(function (f) {
            if (F.who) {
                var list = String(f.assignee || '').split(',').map(function (x) { return x.trim(); });
                if (list.indexOf(F.who) === -1) return false;
            }
            if (qWords.length) {
                var hay = [f.task, f.cat, f.core, f.todo, f.issue, f.fix, f.answer, f.sender, f.receiver, f.project, f.assignee].join(' ').toLowerCase();
                if (!qWords.every(function (w) { return hay.indexOf(w) !== -1; })) return false;
            }
            return true;
        });
        out.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : a.idx - b.idx); });
        return {
            range: R, facts: out.slice(0, P.maxFacts), total: out.length, scanned: scanned,
            pms: Object.keys(pms).sort(), people: Object.keys(people).sort(), projects: Object.keys(projs).sort(),
            filtered: !!(F.pm || F.who || F.proj || F.q), filter: F,
            // 🔑 AI 요약 캐시 열쇠 — 기간뿐 아니라 **필터도** 들어가야 한다(다른 조건의 요약을
            //    같은 것으로 보여 주면 조용한 오답이다).
            // 📏 [2026-11-21] 사실 **개수**도 열쇠에 — 다른 프로젝트 훑기가 덜 끝났을 때 만든 요약이 끝난 뒤에도 "최신" 으로 남았다
            sig: R.key + (F.pm ? '|pm=' + F.pm : '') + (F.proj ? '|p=' + F.proj : '') + (F.who ? '|w=' + F.who : '') + (F.q ? '|q=' + F.q : '') + '|j=' + _psJira.key + '|n=' + out.length,
            scan: other,
            // 🪐 화면의 "로딩 중"·개수 표시용 — `out` 안의 jira 건수와 받는 중인지 둘 다 필요하다.
            // 🧮 0건일 때 "어느 조건에서 빠졌나" — 화면이 그대로 말한다(조용한 0건 금지).
            funnel: { all: all.length, pm: afterPm.length, proj: afterProj.length, out: out.length, open: openName, local: here.facts.length },
            jiraCount: out.filter(function (f) { return f.cat === 'JIRA'; }).length,
            jiraScan: _psJira
        };
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
        var hasJira = col.facts.some(function (f) { return f.cat === 'JIRA'; });
        return (en
            ? (hasJira ? 'You are summarizing a project\'s email-derived task log and its linked JIRA issue changes.' : 'You are summarizing a project\'s email-derived task log.') + ' Use ONLY the facts below. Do not add, infer, evaluate or predict anything that is not literally in the list. No counts or status statistics.'
            : (hasJira ? '당신은 프로젝트의 메일 유래 업무 기록과 연결된 JIRA 이슈 변경사항을 요약합니다.' : '당신은 프로젝트의 메일 유래 업무 기록을 요약합니다.') + ' **아래 사실 목록에 있는 내용만** 쓰세요. 목록에 없는 정보·추정·평가·전망·일정 판단을 넣지 마세요. 완료/진행/지연 같은 집계 숫자도 쓰지 마세요.') +
            '\n\n[프로젝트] ' + (pm.고객사 || '') + ' ' + (pm.고객모델명 || pm.모델명 || '') + '\n[기간] ' + col.range.label + ' (사실 ' + col.facts.length + '건)\n\n[사실 목록]\n' + (lines || '(없음)') +
            '\n\n[규칙]\n- 문장마다 근거가 된 사실의 "#G숫자" 를 **반드시** 그대로 붙이세요(예: "… 요청받음 #G12"). 근거 번호 없는 문장은 버려집니다.\n' +
            '- 같은 업무의 여러 사실은 한 행으로 묶어도 됩니다(번호를 모두 넣으세요).\n- 사람 이름·모델명·수치는 목록의 표기 그대로.\n' +
            (en ? '- Write the sentence VALUES in English (keep #G numbers as they are).\n' : '') +
            // 📊 [2026-11-23 사용자 요청 "엑셀 표처럼 · 한일/할일/막힌일 분류"] 문단 셋 대신 **행 목록**.
            //    AI 는 분류·내용·근거만 낸다 — 프로젝트·담당자·날짜는 **코드가 근거 사실에서** 채운다(지어낼 수 없게).
            '- 분류는 넷 중 하나: "한 일"(이 기간에 처리·회신·완료된 것) · "할 일"(To do·앞으로 해야 할 것) · "막힌 일"(문제점·답을 기다리는 것·미해결) · "결정·요청"(고객/상대의 요청, 정해진 사항).\n' +
            '- 여러 프로젝트에 걸친 **같은 이슈**는 한 행으로 합치고 근거 번호를 모두 넣으세요(공통 이슈로 표시됩니다).\n' +
            // 📋 [2026-11-26 사용자 요청 "팀장·파트장이 팀원과 회의할 때 쓰는 자료 — 어떤 업무를 어떻게 진행하는지·이슈·해결할 일"]
            //    화면(회의 브리핑)은 이 행들을 **업무 단위**로 묶어 보여 준다 → 한 업무의 문장끼리 같은 업무의 근거만 달아야 묶인다.
            '- 이 요약은 팀장·파트장이 팀원과 회의할 때 쓰는 자료입니다. 분류별 문장의 뜻: "한 일" = 그 업무가 **지금 어디까지 진행됐는지**(상태 한 문장) · "막힌 일" = **무엇이 왜 막혔는지**(누구의 회신·결정을 기다리는지) · "할 일" = **다음 조치**(사실에 담당자·기한이 있으면 문장에 포함) · "결정·요청" = 회의에서 **정해야 할 것** 또는 상대의 요청.\n' +
            '- 한 업무는 분류마다 **한 행씩**만 쓰세요(같은 업무의 메일 여러 통은 합쳐서). 한 행의 근거는 **같은 업무의 사실 번호끼리만** 묶고, 서로 다른 업무를 한 행에 섞지 마세요(여러 프로젝트에 걸친 같은 이슈만 예외). 근거 번호는 그 업무의 대표 사실을 맨 앞에.\n' +
            '- "내용"은 회의 자료에 그대로 쓸 한 문장(60자 안팎). 최대 ' + (P.maxItems || 30) + '행.\n' +
            '\n다음 JSON 으로만 답하세요:\n{\n  "items": [\n    {"분류": "한 일", "내용": "…", "근거": ["#G12", "#G15"]}\n  ]\n}';
    };

    // ── 📊 행 목록 · 보관함 ─────────────────────────────────────────────────────
    //  분류 어휘는 데이터(일일보고 칸 이름과 같은 말 + 회의에 꼭 필요한 '결정·요청' 하나).
    P.summaryCats = P.summaryCats || [
        { id: 'done',     ko: '한 일',     en: 'Done',     color: '#2f9e44', bg: '#ebfbee', words: /한\s*일|완료|처리|회신|done/i },
        { id: 'todo',     ko: '할 일',     en: 'To do',    color: '#1971c2', bg: '#e7f5ff', words: /할\s*일|to\s*do|예정|todo/i },
        { id: 'blocked',  ko: '막힌 일',   en: 'Blocked',  color: '#c92a2a', bg: '#fff5f5', words: /막힌|미해결|문제|이슈|blocked|issue/i },
        { id: 'decision', ko: '결정·요청', en: 'Decision', color: '#7048e8', bg: '#f3f0ff', words: /결정|요청|decision|request/i }
    ];
    P.archiveDir = P.archiveDir || 'App_Config/AiSummary';   // 팀 공용 — 같은 조건이면 누구의 요약이든 다시 쓴다
    P.archiveLocalKey = P.archiveLocalKey || 'gantt_ps_archive_v1';
    P.archiveLocalMax = P.archiveLocalMax || 30;
    P.maxItems = P.maxItems || 30;
    P.promptVer = P.promptVer || 3;   // 3 = 회의용 문장(2026-11-26). 그보다 옛 보관본은 보여 주되 **재사용으로 AI 를 건너뛰지는 않는다**
    function catOf(id) { return P.summaryCats.filter(function (c) { return c.id === id; })[0] || P.summaryCats[0]; }
    function catName(id) { var c = catOf(id); return window._currentLang === 'en' ? c.en : c.ko; }
    function catFromText(s) {
        s = String(s || '');
        for (var i = 0; i < P.summaryCats.length; i++) if (s === P.summaryCats[i].ko || s === P.summaryCats[i].en) return P.summaryCats[i].id;
        for (var j = 0; j < P.summaryCats.length; j++) if (P.summaryCats[j].words.test(s)) return P.summaryCats[j].id;
        return 'done';
    }
    function uniq(a) { var o = {}, r = []; a.forEach(function (x) { x = String(x || '').trim(); if (x && !o[x]) { o[x] = 1; r.push(x); } }); return r; }
    /** 한 행의 정체 = 프로젝트 + 그 파일 안 행 번호(열린 프로젝트는 idx 가 곧 행 번호, 훑은 사본은 rowIdx). */
    function factKeyRaw(f) { return String(f.project || '') + '#' + (f.rowIdx != null ? f.rowIdx : f.idx); }
    function refKeyRaw(x) { return String(x.p || '') + '#' + (x.row != null ? x.row : x.g); }
    function factKey(f) { return fnv8(factKeyRaw(f)); }
    /** 옛 보관본에 이미 들어간 겹친 근거도 화면·엑셀에서 하나로. */
    function uniqRefs(refs) { var o = {}; return (refs || []).filter(function (x) { var k = refKeyRaw(x); if (o[k]) return false; o[k] = 1; return true; }); }

    /**
     * AI 응답 → 표 행. 근거(#G)가 사실 목록에 하나도 없으면 **버린다**(_psGround 와 같은 규칙).
     * 옛 모양({요약,요청·결정,미해결})도 받는다 — 보관본·하네스·옛 캐시가 그 모양이다.
     */
    window._psRowsFromAi = function (j, facts) {
        var byIdx = {}; (facts || []).forEach(function (f) { byIdx[f.idx] = f; });
        var items = [];
        if (j && Array.isArray(j.items)) items = j.items;
        else if (j) {
            [['요약', 'done'], ['요청·결정', 'decision'], ['요청/결정', 'decision'], ['결정', 'decision'], ['미해결', 'blocked']].forEach(function (p) {
                (Array.isArray(j[p[0]]) ? j[p[0]] : []).forEach(function (s) { items.push({ 분류: catOf(p[1]).ko, 내용: s, 근거: [] }); });
            });
        }
        var rows = [], dropped = 0;
        items.forEach(function (it) {
            if (!it) { dropped++; return; }
            var text = String(it['내용'] || it.text || it.content || '');
            var refsRaw = [].concat(it['근거'] || it.refs || []).join(' ') + ' ' + text;
            var ids = uniq((refsRaw.match(/#G(\d+)/g) || []).map(function (r) { return r.slice(2); }))
                .map(Number).filter(function (n) { return byIdx[n]; });
            if (!ids.length) { dropped++; return; }
            var seen = {};
            var fs = ids.map(function (n) { return byIdx[n]; }).filter(function (f) {
                var k = factKeyRaw(f); if (seen[k]) return false; seen[k] = 1; return true;   // 같은 행의 두 사본은 하나로
            });
            var projects = uniq(fs.map(function (f) { return f.project; }));
            var people = uniq([].concat.apply([], fs.map(function (f) { return String(f.assignee || '').split(','); })));
            var dates = fs.map(function (f) { return f.date; }).filter(Boolean).sort();
            rows.push({
                cat: catFromText(it['분류'] || it.cat || ''),
                text: text.replace(/\s*#G\d+[,\s]*/g, ' ').replace(/\s+/g, ' ').trim(),
                projects: projects, people: people,
                date: dates.length ? dates[dates.length - 1] : '',
                common: projects.length > 1,
                refs: fs.map(function (f) { return { g: f.idx, p: f.project || '', row: f.rowIdx != null ? f.rowIdx : f.idx, task: f.task || '' }; })
            });
        });
        return { rows: rows.slice(0, P.maxItems * 2), dropped: dropped };
    };
    /** 옛 화면·텔레그램 글이 쓰는 세 칸을 행에서 다시 만든다(같은 내용이 두 벌로 갈리지 않게 **파생**만). */
    function compatArrays(rows) {
        var s = function (r) { return r.text + ' ' + r.refs.map(function (x) { return '#G' + x.g; }).join(' '); };
        return {
            요약: rows.filter(function (r) { return r.cat === 'done' || r.cat === 'todo'; }).map(s),
            요청결정: rows.filter(function (r) { return r.cat === 'decision'; }).map(s),
            미해결: rows.filter(function (r) { return r.cat === 'blocked'; }).map(s)
        };
    }

    // 📚 보관함 — AI 호출이 아까우니 만든 요약은 버리지 않는다(사용자 요청).
    //    NAS 면 팀 공용 폴더에 1건 1파일(이름에 조건 해시 → 목록 1콜로 같은 조건을 찾는다),
    //    NAS 가 아니면 이 브라우저(localStorage)에. 실패는 저장만 못 할 뿐 화면은 막지 않는다.
    function fnv8(s) { var h = 0x811c9dc5; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
    function useNas() { return !!(window.nasAppFile && window._storageMode && window._storageMode() === 'nas'); }
    function stamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
    /** 보관본 열쇠에서 **사실 수(n)·JIRA(j)** 를 뺀 것 — 메일이 한 통 더 와도 '같은 기간·같은 필터' 로 본다. */
    function baseSigOf(x) { return String(x || '').replace(/\|j=.*$/, ''); }
    function archNameOf(rec) {
        var f = rec.filter || {};
        var tail = [rec.label, f.pm, f.proj, f.who].filter(Boolean).join('_').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 90);
        return stamp(new Date(rec.at)) + '__' + fnv8(rec.sig) + '__' + fnv8(baseSigOf(rec.sig)) + '__' + tail + '.json';
    }
    window._psArchiveParseName = function (name) {
        var m = String(name || '').match(/^(\d{8})_(\d{4})\d*__([0-9a-f]{8})__(?:([0-9a-f]{8})__)?(.*)\.json$/);   // 둘째 해시(기간·필터)는 2026-11-26 부터 — 옛 이름엔 없다
        if (!m) return null;
        return { at: m[1].slice(0, 4) + '-' + m[1].slice(4, 6) + '-' + m[1].slice(6) + ' ' + m[2].slice(0, 2) + ':' + m[2].slice(2), hash: m[3], base: m[4] || '', title: m[5].replace(/_/g, ' ') };
    };
    var _psArch = { names: null, at: 0, busy: null };
    function localArch() { try { return JSON.parse(localStorage.getItem(P.archiveLocalKey) || '[]') || []; } catch (e) { return []; } }
    window._psArchiveList = async function (force) {
        if (!force && _psArch.names && Date.now() - _psArch.at < 60000) return _psArch.names;
        if (_psArch.busy) return _psArch.busy;
        _psArch.busy = (async function () {
            var names;
            if (useNas()) {
                var items = await window.nasAppFile.list(P.archiveDir);
                names = items.map(function (it) { return it && it.name; }).filter(function (n) { return /\.json$/.test(n || ''); });
            } else {
                names = localArch().map(function (r) { return r.name; });
            }
            names.sort().reverse();   // 이름이 시각으로 시작한다 → 최신이 위
            _psArch.names = names; _psArch.at = Date.now();
            return names;
        })();
        try { return await _psArch.busy; } finally { _psArch.busy = null; }
    };
    window._psArchiveGet = async function (name) {
        if (useNas()) return await window.nasAppFile.get(P.archiveDir + '/' + name, { json: true });
        return localArch().filter(function (r) { return r.name === name; })[0] || null;
    };
    window._psArchivePut = async function (rec) {
        rec.name = archNameOf(rec);
        if (useNas()) await window.nasAppFile.put(P.archiveDir + '/' + rec.name, rec);
        else {
            var a = localArch().filter(function (r) { return r.name !== rec.name; });
            a.push(rec);
            while (a.length > P.archiveLocalMax) a.shift();
            try { localStorage.setItem(P.archiveLocalKey, JSON.stringify(a)); } catch (e) { /* 꽉 차면 이번 것만 못 남긴다 */ }
        }
        if (_psArch.names) { _psArch.names.unshift(rec.name); }
        _psLooked = {};   // 새 보관본이 생겼으니 "찾아봤는데 없더라" 기억은 버린다
        return rec.name;
    };
    /** 같은 조건(sig)으로 만든 보관본이 있으면 가장 최신 것을 — **AI 를 다시 부르지 않기 위해서**. */
    window._psArchiveFind = async function (sig) {
        var h = fnv8(sig);
        var names = await window._psArchiveList();
        for (var i = 0; i < names.length; i++) {
            if (names[i].indexOf('__' + h + '__') < 0) continue;
            try {
                var rec = await window._psArchiveGet(names[i]);
                if (rec && rec.sig === sig && Array.isArray(rec.rows)) return rec;   // 해시가 겹쳐도 열쇠로 한 번 더
            } catch (e) { /* 다음 후보 */ }
        }
        return null;
    };
    /**
     * 💾 [2026-11-26 사용자 요청 "한번 요약하고 버리지 말고 저장해 두었다가 재활용"] 같은 **기간·필터**인데 사실 수·JIRA 만 달라진 보관본 중 가장 최신 것.
     *  정확히 같은 조건(`_psArchiveFind`)이 없을 때 쓴다 — 메일이 한 통만 더 와도 조건이 달라져 "보관본이 없는 것처럼" 보이던 것을 막는다.
     *  화면은 이걸 "그 뒤 사실이 N→M건으로 바뀜 — 새로 생성하면 반영" 으로 보여 주고, AI 는 부르지 않는다.
     */
    window._psArchiveFindNear = async function (sig) {
        var bh = fnv8(baseSigOf(sig));
        var names = await window._psArchiveList();
        for (var i = 0; i < names.length; i++) {
            var pn = window._psArchiveParseName(names[i]);
            if (!pn || pn.base !== bh) continue;   // 옛 이름(둘째 해시 없음)은 못 찾는다 — 정확히 같은 조건일 때만 재사용된다
            try {
                var rec = await window._psArchiveGet(names[i]);
                if (rec && Array.isArray(rec.rows) && baseSigOf(rec.sig) === baseSigOf(sig)) return rec;
            } catch (e) { /* 다음 후보 */ }
        }
        return null;
    };
    function adoptRec(kind, rec) {
        window.projectMeta = window.projectMeta || {};
        window.projectMeta.aiPeriodSummary = window.projectMeta.aiPeriodSummary || {};
        var c = compatArrays(rec.rows || []);
        window.projectMeta.aiPeriodSummary[kind] = {
            rangeKey: rec.sig, at: rec.at, factCount: rec.factCount, rows: rec.rows, dropped: rec.dropped || 0,
            by: rec.by || '', archived: rec.name || '', reused: !!rec._reused, pv: rec.pv || 0,
            요약: c.요약, 요청결정: c.요청결정, 미해결: c.미해결
        };
        return window.projectMeta.aiPeriodSummary[kind];
    }
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

    window.generatePeriodSummary = async function (kind, opts) {
        kind = kind || mode();
        opts = opts || {};
        var col = window._psCollectFacts(kind);
        if (!col.facts.length) { if (window.showToast) window.showToast(T('이 기간에 메일 분석으로 들어온 업무가 없습니다 — 요약할 사실이 없습니다.', 'No mail-derived tasks in this period — nothing to summarize.'), 'info'); return null; }
        // ♻️ 같은 조건(기간·필터·사실 수)의 보관본이 있으면 AI 를 부르지 않는다 — `force` 일 때만 새로.
        if (!opts.force) {
            var old = null;
            try { old = await window._psArchiveFind(col.sig); } catch (e) { old = null; }
            if (old && (old.pv || 0) >= P.promptVer) {
                old._reused = true;
                var c0 = adoptRec(kind, old);
                if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
                if (window.showToast) window.showToast(T('♻️ 같은 조건의 보관된 요약을 다시 썼습니다 (AI 호출 0회)', '♻️ Reused the archived summary (0 AI calls)'), 'info');
                return c0;
            }
        }
        var key = window.getActiveAiKey ? window.getActiveAiKey() : null;
        if (!key) { alert(T('먼저 [🤖 AI 도구 → ⚙️ 설정 → AI 분석 설정]에서 AI API 키를 입력하고 저장해주세요.', 'Please set your AI API key first.')); return null; }
        var btn = genBtn();
        if (btn) { btn.disabled = true; btn.textContent = T('⏳ 생성 중...', '⏳ Generating...'); }
        try {
            var res = await window.callAiBackend(key, window._psBuildPrompt(col), { feature: 'period-summary' });
            if (!res || !res.ok) throw (res && res.error) || new Error(T('알 수 없는 오류', 'Unknown error'));
            var text = (res.data && res.data.result && res.data.result.candidates && res.data.result.candidates[0] && res.data.result.candidates[0].content && res.data.result.candidates[0].content.parts && res.data.result.candidates[0].content.parts[0] && res.data.result.candidates[0].content.parts[0].text) || '';
            var m = String(text).replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
            if (!m) throw new Error(T('AI 응답에서 JSON 을 찾지 못했습니다.', 'No JSON in the AI response.'));
            var j = JSON.parse(m[0]);
            var conv = window._psRowsFromAi(j, col.facts);
            var F0 = filt();
            var rec = {
                v: 2, pv: P.promptVer, sig: col.sig, kind: kind, label: col.range.label,
                range: { from: ymd(col.range.from), to: ymd(col.range.to) },
                filter: { pm: F0.pm || '', proj: F0.proj || '', who: F0.who || '' },
                at: new Date().toISOString(), by: window._appUserKey || window.currentUserName || '',
                factCount: col.facts.length, rows: conv.rows, dropped: conv.dropped
            };
            // 📚 보관 — 실패해도 요약은 보여 준다(다음에 같은 조건이면 그때 또 부를 뿐이다).
            var savedOk = false;
            try { await window._psArchivePut(rec); savedOk = true; }
            catch (e) { console.warn('[기간 요약] 보관 실패:', e && e.message); if (window._issueLog) try { window._issueLog({ domain: 'ai', kind: 'ps_archive_fail', rid: '', route: '', params: { msg: String(e && e.message || e).slice(0, 200) } }); } catch (e2) { /* 무시 */ } }
            adoptRec(kind, rec);
            if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
            if (window.showToast) window.showToast(T('🤖 ' + col.range.label + ' 요약을 만들었습니다' + (savedOk ? ' · 📚 보관함에 저장 — 같은 조건이면 다시 열어도 AI 0회' : ' (보관함 저장은 실패)'), '🤖 Summary generated' + (savedOk ? ' · saved to archive' : ' (archive save failed)')) + (window.projectMeta.aiPeriodSummary[kind].dropped ? T(' (근거 없는 문장 ' + window.projectMeta.aiPeriodSummary[kind].dropped + '개 제거)', ' (' + window.projectMeta.aiPeriodSummary[kind].dropped + ' ungrounded sentence(s) removed)') : ''), 'info');
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
        if (cache && cache.rangeKey === col.sig) {
            if (Array.isArray(cache.rows)) {
                // 📊 행 목록 — 분류별로 묶어 글로(텔레그램·문답). 표와 **같은 행**이다.
                P.summaryCats.forEach(function (c) {
                    var rs = cache.rows.filter(function (r) { return r.cat === c.id; });
                    if (!rs.length) return;
                    L.push('', '**' + catName(c.id) + '**');
                    rs.forEach(function (r) {
                        L.push('- ' + (r.common ? '[' + T('공통', 'Common') + '] ' : (r.projects.length ? '[' + r.projects[0] + '] ' : '')) + r.text +
                               (r.people.length ? ' (' + r.people.join(', ') + ')' : '') + ' ' + r.refs.map(function (x) { return '#G' + x.g; }).join(' '));
                    });
                });
            } else {
                var sec = function (title, arr) { if (arr && arr.length) { L.push('', '**' + title + '**'); arr.forEach(function (s) { L.push('- ' + s); }); } };
                sec(T('요약', 'Summary'), cache.요약); sec(T('요청·결정', 'Requests / decisions'), cache.요청결정); sec(T('미해결', 'Open issues'), cache.미해결);
            }
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
    function toolbarHtml(cur, col) {
        var en = window._currentLang === 'en';
        var btn = function (id, label, on) {
            // 💊 모양은 앱 공용 한 벌(js/04a `_uiPillStyle`) — 일일보고 칩과 같다.
            return '<button onclick="window._psSetMode(\'' + id + '\')" style="' + window._uiPillStyle(on) + '">' + esc(label) + '</button>';
        };
        var curKinds = splitKinds(cur);
        var b = P.periods.map(function (p) {
            return btn(p.id, en ? p.en : p.ko, curKinds.indexOf(p.id) >= 0).replace('window._psSetMode(', 'window._psToggleMode(');
        }).join('');
        b += btn(P.customId, en ? '📅 Range' : '📅 기간설정', cur === P.customId).replace("window._psSetMode('" + P.customId + "')", 'window._psCustomClick()');
        if (P.showLegacy) {
            b += '<span style="flex:1"></span>' + btn(P.legacyId, en ? '📊 Schedule view' : '📊 일정 현황', cur === P.legacyId);
        }
        if (cur === P.legacyId) {
            return '<div id="ps-period-toolbar" style="display:flex; gap:6px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">' + b + '</div>';
        }

        // 🔍 담당자(PM, 기본) · 프로젝트(PM 소속으로 캐스케이딩) · 업무 담당자(보조, 선택) —
        //    선택지는 **그 앞 단계까지 거른** 목록에서 만든다(_psCollectFacts 참고).
        var F = filt();
        var sel = function (id, label, cur2, opts, allLabel, resetKeys, extraStyle) {
            var o = '<option value="">' + esc(allLabel) + '</option>' + opts.map(function (v) {
                return '<option value="' + esc(v) + '"' + (v === cur2 ? ' selected' : '') + '>' + esc(v) + '</option>';
            }).join('');
            // 💡 캐스케이딩 — 상위 선택이 바뀌면 그 아래(하위) 선택은 더 이상 안 맞을 수 있어 같이 비운다.
            var patch = '{' + id + ': this.value' + (resetKeys || []).map(function (k) { return ', ' + k + ": ''"; }).join('') + '}';
            return '<select onchange="window._psSetFilter(' + patch + ')" title="' + esc(label) + '" ' +
                   'style="' + window._uiSelectStyle(!!cur2) + ' max-width:220px;' + (extraStyle || '') + '">' + o + '</select>';
        };
        var sc = (col && col.scan) || {};
        // 💡 [2026-11-23 사용자 요청] 1줄 = 기간(전일~금월·기간설정+달력), 2줄 = 필터.
        //    필터는 이름표를 붙여 "프로젝트 담당자 / 프로젝트 / 업무 담당자" 가 무엇인지 보이게 한다.
        // 📅 기간설정 — 시작·끝 두 칸을 그 버튼 바로 옆에. 아직 안 골랐으면 지금 기간을 채워 둔다
        //    (빈 칸부터 시작하면 무엇을 고르라는 건지 알 수 없다).
        // 날짜 칸은 열려 있을 때만(아직 기간을 안 골랐으면 늘 연다) — 적용하면 접혀 버튼만 남는다.
        if (cur === P.customId && (_psCustomOpen || !F.from || !F.to)) {
            var R = (col && col.range) || window._psRange(cur);
            var inp = function (id, v) {
                return '<input id="' + id + '" type="date" value="' + esc(v) + '" style="' + window._uiInputStyle() + ' width:120px; padding:0 4px;' + '">';
            };
            b += '<span style="display:inline-flex; gap:2px; align-items:center; font-size:11px; color:#555; white-space:nowrap;">' +
                 inp('ps-from', F.from || ymd(R.from)) + '~' + inp('ps-to', F.to || ymd(R.to)) +
                 '<button onclick="window._psApplyCustom()" style="' + window._uiBtnStyle('accent') + '">' +
                   esc(T('적용', 'Apply')) + '</button></span>';
        }
        var lab = function (s) { return '<span style="font-size:11px; color:#666; white-space:nowrap;">' + esc(s) + '</span>'; };
        var slash = '<span style="color:#bbb;">/</span>';
        var f2 = '<span style="font-size:11px; color:#888;">🔍</span>' +
             lab(T('프로젝트 담당자', 'Project owner')) +
             sel('pm', T('프로젝트 담당자', 'Project owner'), F.pm, (col && col.pms) || [], T('전체', 'All'), ['proj', 'who'], ' max-width:95px;') + slash +
             lab(T('프로젝트', 'Project')) +
             sel('proj', T('프로젝트', 'Project'), F.proj, (col && col.projects) || [], T('전체', 'All'), [], ' max-width:150px;') + slash +
             lab(T('업무 담당자', 'Task assignee')) +
             sel('who', T('업무 담당자', 'Task assignee'), F.who, (col && col.people) || [], T('전체', 'All'), [], ' max-width:95px;') +
             // 🔍 업무 검색 — 일일보고와 같은 모양(입력칸 + 🔍), Enter 나 🔍 로 적용(타자마다 다시 그리면 포커스가 날아간다).
             '<input id="ps-q" value="' + esc(F.q || '') + '" placeholder="' + esc(T('업무 검색', 'Search tasks')) + '" onkeydown="if(event.key===\'Enter\') window._psSetFilter({q:this.value.trim()})" style="' + window._uiInputStyle() + ' width:130px;' + '">' +
             '<button onclick="window._psSetFilter({q:(document.getElementById(\'ps-q\')||{}).value.trim()})" title="' + esc(T('업무 검색', 'Search tasks')) + '" style="' + window._uiBtnStyle('accent') + '">🔍</button>' +
             (col && col.filtered ? '<button onclick="window._psSetFilter({pm:\'\', who:\'\', proj:\'\', q:\'\'})" title="' + esc(T('필터 해제', 'Clear filters')) + '" style="' + window._uiBtnStyle('danger') + '">↺</button>' : '') +
             (sc.busy ? '<span style="font-size:11px; color:#aaa;">' + esc(T('개발팀 전체 ' + sc.done + '/' + sc.total + ' 확인 중…', 'Scanning ' + sc.done + '/' + sc.total + '…')) + '</span>' : '') +
             ((sc.errs && sc.errs.length) ? '<span style="font-size:11px; color:#b1432f;">⚠️ ' + esc(T('못 읽은 프로젝트 ' + sc.errs.length + '건', sc.errs.length + ' unreadable')) + '</span>' : '');

        // 📐 [2026-11-23 사용자 요청] 필터 줄을 기간 칩 줄 **오른쪽**으로 — 한 줄로(좁으면 접힌다).
        return '<div id="ps-period-toolbar" style="display:flex; gap:3px; align-items:center; margin-bottom:8px; flex-wrap:wrap; row-gap:5px;">' + b +
               '<span style="display:inline-block; width:1px; height:16px; background:#cfd8e3; margin:0 8px;"></span>' +
               '<span id="ps-filter-toolbar" style="display:contents;">' + f2 + '</span></div>';   // contents — 묶음째 다음 줄로 밀리지 않고 항목별로 흐른다
    }
    function link(idx) {
        return window._linkifyTaskRefs ? window._linkifyTaskRefs(esc('#G' + idx)) : esc('#G' + idx);
    }
    function renderPeriod(body, kind) {
        var col = window._psCollectFacts(kind);
        // 🗂 다른 프로젝트는 뒤에서 — 기다리지 않는다(끝나면 스스로 다시 그린다).
        try { window._psScan(); } catch (e) { /* 훑기 실패가 화면을 막지는 않는다 */ }
        try { window._psScanJira(); } catch (e) { /* JIRA 훑기 실패가 화면을 막지는 않는다 */ }
        var pm = window.projectMeta || {};
        var cache = (pm.aiPeriodSummary || {})[kind];
        // ⚠️ 캐시는 **기간 + 필터**가 같을 때만 "이 화면의 요약" 이다.
        var fresh = cache && cache.rangeKey === col.sig;
        // 🕰 [2026-11-23] 기간·필터가 같고 **사실 수·JIRA 만** 달라졌으면(JIRA 가 늦게 들어오거나 프로젝트를 열어 행이 더해짐)
        //    요약을 숨기지 않고 보여 주되 "바뀌었다" 고 말한다 — 숨기면 다시 AI 를 불러야 했다.
        var baseSig = function (x) { return String(x || '').replace(/\|j=.*$/, ''); };
        var near = !fresh && cache && Array.isArray(cache.rows) && baseSig(cache.rangeKey) === baseSig(col.sig);
        var h = [];
        h.push('<div id="ai-summary-report-content">');
        // 🗜 [2026-11-23 사용자 요청 "컴팩트하게"] 기간 · 건수를 한 줄에, 말은 짧게(뜻은 title 말풍선에).
        // 📌 [2026-11-23 "첨부 영역은 스크롤 시 고정"] 기간 제목 줄은 아래 고정 머리(#ps-sticky)로 간다.
        var headHtml = ('<div style="display:flex; gap:10px; flex-wrap:wrap; align-items:baseline; margin-bottom:4px;"><div style="font-size:12.5px; font-weight:bold; color:#2c5f8a; white-space:nowrap;">📅 ' + esc(col.range.label) + '</div>' +
               '<div style="font-size:11px; color:#777;" title="' + esc(T('메일 유래 업무 / 전체 메일 업무', 'mail-derived tasks / all mail tasks')) + '">' + esc(T('메일 ' + (col.total > col.facts.length ? col.facts.length + '(상한)' : col.facts.length) + '/' + col.scanned + '건' + (col.jiraCount ? ' · JIRA ' + col.jiraCount : '') + (col.projects.length > 1 ? ' · 프로젝트 ' + col.projects.length : '') + (col.filtered ? ' · 필터' : ''), 'Mail ' + col.facts.length + '/' + col.scanned + (col.jiraCount ? ' · JIRA ' + col.jiraCount : '') + (col.projects.length > 1 ? ' · ' + col.projects.length + ' projects' : '') + (col.filtered ? ' · filtered' : ''))) +
               (col.jiraScan && col.jiraScan.busy ? ' <span style="color:#1971c2;">⏳ ' + esc(T('JIRA 확인 중…', 'Checking JIRA…')) + '</span>' : '') +
               (col.jiraScan && col.jiraScan.err ? ' <span style="color:#b1432f;">⚠️ JIRA: ' + esc(col.jiraScan.err) + '</span>' : '') +
               '<!--psmeta--></div>' + archivePillHtml() + '</div>');
        // 🖥 표가 들어가니 모달을 한 번 넓힌다(사람이 줄여 둔 폭은 그 뒤로 건드리지 않는다).
        try {
            var box = pageActive() ? null : document.getElementById('ai-summary-modal'); box = box && box.firstElementChild;
            if (box && !box._psWide) { box._psWide = 1; if (box.getBoundingClientRect().width < 900) box.style.width = 'min(1040px, 94vw)'; }
        } catch (e) { /* 폭은 못 바꿔도 된다 */ }
        var openName = openProjectName();
        var shown = null;   // 지금 표로 그릴 것: { rows, at, by, factCount, dropped, reused, archiveView }
        if (_psView) {
            shown = { rows: _psView.rows || [], at: _psView.at, by: _psView.by, factCount: _psView.factCount, dropped: _psView.dropped, archiveView: _psView, pv: _psView.pv || 0 };
        } else if (fresh || near) {
            var rows0 = Array.isArray(cache.rows) ? cache.rows
                : window._psRowsFromAi({ '요약': cache.요약, '요청·결정': cache.요청결정, '미해결': cache.미해결 }, col.facts).rows;   // 옛 캐시
            shown = { rows: rows0, at: cache.at, by: cache.by, factCount: cache.factCount, dropped: cache.dropped, reused: cache.reused, pv: cache.pv || 0,
                      stale: near ? { from: cache.factCount, to: col.facts.length } : null };
        } else if (col.facts.length && !_psLooked[col.sig]) {
            // ♻️ 같은 조건의 보관본이 있으면 버튼을 안 눌러도 바로 보여 준다(AI 0회).
            _psLooked[col.sig] = 1;
            var sigNow = col.sig;
            window._psArchiveFind(sigNow).then(function (rec) {
                return rec || window._psArchiveFindNear(sigNow);   // 💾 사실 수만 달라졌으면 가장 최근 것을 "바뀜" 표시와 함께
            }).then(function (rec) {
                if (!rec || mode() !== kind) return;
                if (window._psCollectFacts(kind).sig !== sigNow) return;
                rec._reused = true; adoptRec(kind, rec);
                if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
            }).catch(function () { /* 보관함을 못 읽으면 그냥 버튼을 누르면 된다 */ });
        }
        var factByKey = {}; (col.facts || []).forEach(function (f) { factByKey[factKey(f)] = f; });
        _psLast = { shown: shown, openName: openName, label: shown && shown.archiveView ? shown.archiveView.label : col.range.label, kind: kind, factByKey: factByKey, col: col };
        var secHtml = '<div id="ps-ai-sec">' + aiSectionHtml() + '</div>';   // 분류 칩·엑셀·보관함 — 고정 머리로
        // 📌 표는 고정 머리 **바로 아래**(틈 0) — 틈이 있으면 스크롤 첫 몇 px 동안 머리글이 따라 올라가다 멈춰 "같이 움직인다"(2026-11-23 실측 9px).
        if (shown && shown.rows.length) h.push('<div id="ps-ai-tbl" style="margin-bottom:10px;">' + tableHtml() + '</div>');
        if (shown && shown.rows.length) h.push('<details id="ps-facts-det" style="margin-top:4px;"><summary style="cursor:pointer; font-size:12px; color:#2c5f8a; font-weight:bold;">📋 ' + esc(T('근거 사실 목록 ' + col.facts.length + '건 (AI 없이 만든 원본)', 'Source facts (' + col.facts.length + ', no AI)')) + '</summary>');
        if (!col.facts.length) {
            // ⚠️ 훑는 중에 "없습니다" 라고 하면 **없는 것과 아직 못 읽은 것**을 구분할 수 없다.
            //    (그게 "못 가져오는 건지 표현이 안 되는 건지 모르겠다" 는 신고의 정체였다)
            h.push(col.scan && col.scan.busy
                ? '<div style="padding:24px 10px; text-align:center; color:#1971c2; font-size:12px;">⏳ ' +
                  esc(T('내 프로젝트를 확인하는 중입니다… ' + (col.scan.done || 0) + ' / ' + (col.scan.total || 0),
                        'Scanning my projects… ' + (col.scan.done || 0) + ' / ' + (col.scan.total || 0))) + '</div>'
                : (col.funnel && col.funnel.all
                    // 🧮 기간엔 업무가 있는데 조건에서 다 빠진 경우 — 어디서 빠졌는지 숫자로 말한다.
                    ? '<div style="padding:18px 10px; text-align:center; color:#b1432f; font-size:12px; line-height:1.7;">' +
                      esc(T('이 기간 업무 ' + col.funnel.all + '건 → 프로젝트 담당자 조건 ' + col.funnel.pm + '건 → 프로젝트 조건 ' + col.funnel.proj + '건 → 업무 담당자·검색 조건 ' + col.funnel.out + '건',
                            col.funnel.all + ' in period → owner ' + col.funnel.pm + ' → project ' + col.funnel.proj + ' → assignee/search ' + col.funnel.out)) +
                      '<br><span style="color:#888;">' + esc(T('열린 프로젝트: ' + (col.funnel.open || '(없음)') + ' · 그 업무 ' + col.funnel.local + '건 — 조건을 바꾸거나 ↺ 로 해제하세요', 'Open project: ' + (col.funnel.open || '(none)') + ' · ' + col.funnel.local + ' tasks')) + '</span></div>'
                    : '<div style="padding:24px 10px; text-align:center; color:#999; font-size:12.5px;">' + esc(T('이 기간에 메일 분석으로 들어온 업무가 없습니다.', 'No mail-derived tasks in this period.')) + (P.includeNonMail ? '' : '<br>' + esc(T('(사람이 직접 적은 업무는 세지 않습니다 — PERIOD_SUMMARY.includeNonMail)', '(hand-typed tasks are not counted)'))) + '</div>'));
        } else {
            var factsShown = _psTbl.pinned ? col.facts.filter(factPinned) : col.facts;
            // ✅ [2026-11-26] 현황이 '완료' 인 업무는 회의에서 정리된 것 — 기본으로 숨기고 "숨김 N건 보기" 로 되돌린다(열린 프로젝트는 지금 간트 값).
            var doneAll = col.facts.filter(function (f) { return window._rr.isDone(factGanttRow(f), f.status); }).length;
            if (!_psTbl.showDone) factsShown = factsShown.filter(function (f) { return !window._rr.isDone(factGanttRow(f), f.status); });
            if (doneAll) h.push('<div style="margin:0 0 5px;"><button onclick="window._psTblSet({showDone:' + (!_psTbl.showDone) + '})" title="' + esc(T('간트 상태가 완료인 업무 — 회의에서 정리된 것', 'Gantt status = Done')) + '" style="' + window._uiPillStyle(!!_psTbl.showDone) + '">✅ ' + esc(_psTbl.showDone ? T('완료 ' + doneAll + '건 포함 중 — 숨기기', 'Done ' + doneAll + ' shown — hide') : T('완료 ' + doneAll + '건 숨김 — 보기', 'Done ' + doneAll + ' hidden — show')) + '</button></div>');
            _psLast.factsShown = factsShown;   // 표를 다시 그릴 때(정렬·필터) 쓴다 — paintFacts
            if (_psTbl.pinned && !factsShown.length) h.push('<div style="padding:24px 10px; text-align:center; color:#999; font-size:12.5px;">' + esc(T('📌 핀셋을 켠 업무가 없습니다 — 열린 프로젝트의 업무만 셉니다', 'No pinned tasks (open project only)')) + '</div>');
            else h.push('<div id="ps-facts-body">' + factsTableHtml(factsShown) + '</div>');
        }
        if (shown && shown.rows.length) h.push('</details>');
        h.push('</div>');
        // 📌 고정 머리 — 기간 칩·필터·기간 제목·(표가 있으면) 분류 칩·엑셀·보관함. 스크롤해도 위에 남는다.
        //    본문 상자(.concept-section)의 안쪽 여백만큼 음수 여백으로 넓혀 위·옆 틈 없이 덮는다.
        // 📌 [2026-11-23 "BOM 헤더와 차이가 뭐야"] BOM 과 같은 구조 — 조작 영역은 스크롤 **밖**(#ps-sticky),
        //    표·근거 목록만 따로 스크롤(#ps-scroll)하고 표 머리글은 그 상자 맨 위(top:0)에 붙는다.
        //    (전엔 한 상자 안에서 같이 스크롤하며 머리 높이를 재서 맞췄다 — 화면마다 어긋나 머리글이 움직였다.)
        // 🐛 [2026-11-23 "이번엔 투명하게 비침"] 바깥 상자가 스크롤되면(옛 CSS 가 남은 브라우저) 표가 배경 없는 머리 밑으로 비쳤다 →
        //    ① 페이지면 바깥 상자의 '스크롤 안 함 + 세로 배치' 를 **여기서 직접** 건다(CSS 가 늦게 와도 같은 결과)
        //    ② 머리에 불투명 팔레트 배경(#e0f5f7 — js/21 이 테마색으로 바꾼다)과 쌓임 순서.
        if (body.id === 'psummary-page') { body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.overflow = 'hidden'; body.style.minHeight = '0'; }
        body.innerHTML = '<div id="ps-sticky" style="flex-shrink:0; position:relative; z-index:6; background:#e0f5f7; padding-bottom:4px; margin-bottom:6px; border-bottom:1px solid #a3d9e0;">' +
            toolbarHtml(kind, col) + headHtml.replace('<!--psmeta-->', summaryMetaHtml(shown)) + secHtml + '<div id="ps-meet-slot"></div></div>' +
            '<div id="ps-scroll" style="flex:1; min-height:0; overflow:auto;">' + h.join('') + '</div>';
        if (!(shown && shown.rows.length)) _psMeetHtml = '';   // 표가 없으면 회의 상자도 없다(지난번 것이 남지 않게)
        paintMeet();
        syncHeadH();
        fillArchiveSelect();
    }

    // ── 📊 AI 요약 표 ───────────────────────────────────────────────────────────
    var _psTbl = { sort: 'cat', dir: 1, cats: {}, proj: '', who: '', q: '', common: false, pinned: false, view: 'brief', by: 'proj', big: false, showDone: false };
    var _psView = null;      // 📚 보관본을 열어 보는 중이면 그 기록
    var _psLooked = {};      // 같은 조건으로 보관함을 이미 찾아봤는가(렌더마다 NAS 를 두드리지 않게)
    var _psLast = null;
    window._psTblState = function () { return _psTbl; };

    function rowProj(r) { return r.common ? T('공통', 'Common') + ' (' + r.projects.length + ')' : (r.projects[0] || ''); }
    function viewRows(ignoreCats) {
        var rows = (_psLast && _psLast.shown && _psLast.shown.rows) || [];
        var anyCat = !ignoreCats && Object.keys(_psTbl.cats).some(function (k) { return _psTbl.cats[k]; });   // 브리핑은 분류 칩이 없다
        // 🔍 [2026-11-25] 표 찾기는 다른 페이지와 **같은 공용 규칙**(js/04a: 낱말 AND/OR·쉼표·날짜 기간) — 예전엔 글자 그대로 부분일치 하나뿐이었다.
        var toks = (window._searchTokens && String(_psTbl.q || '').trim()) ? window._searchTokens(_psTbl.q) : [];
        var out = rows.filter(function (r) {
            if (anyCat && !_psTbl.cats[r.cat]) return false;
            if (_psTbl.common && !r.common) return false;
            if (_psTbl.pinned && !rowPinned(r)) return false;
            if (_psTbl.proj && r.projects.indexOf(_psTbl.proj) < 0) return false;
            if (_psTbl.who && peopleOf(r).indexOf(_psTbl.who) < 0) return false;
            if (toks.length) {
                var hay = r.text + ' ' + r.projects.join(' ') + ' ' + r.people.join(' ') + ' ' + r.refs.map(function (x) { return x.task; }).join(' ');
                // 📅 날짜는 글로 안 싣고 따로 넘긴다(숫자 낱말 오탐 방지 — js/04a 주석)
                var span = (window._searchSpan && r.date) ? window._searchSpan(new Date(r.date + 'T00:00:00').getTime()) : null;
                if (!window._searchMatchAll(hay, toks, span)) return false;
            }
            return true;
        });
        var catIdx = {}; P.summaryCats.forEach(function (c, i) { catIdx[c.id] = i; });
        var key = {
            cat: function (r) { return pad(catIdx[r.cat] || 0) + (r.date ? '' : ''); },
            proj: function (r) { return (r.common ? '0' : '1') + rowProj(r); },
            who: function (r) { return peopleOf(r).join(', ') || ('~' + rolesOf(r).join(', ')); },
            date: function (r) { return r.date || ''; },
            text: function (r) { return r.text; }
        }[_psTbl.sort] || function () { return ''; };
        var d = _psTbl.dir;
        return out.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
            var x = key(a.r), y = key(b.r);
            if (x !== y) return (x < y ? -1 : 1) * d;
            // 같으면 최근 날짜가 위, 그다음 원래 순서
            if ((a.r.date || '') !== (b.r.date || '')) return (a.r.date || '') < (b.r.date || '') ? 1 : -1;
            return a.i - b.i;
        }).map(function (o) { return o.r; });
    }
    /**
     * 👷 [2026-11-23 사용자 요청 "업무 담당자를 바꾸고 원본에도 반영"] 담당자는 간트 행의 **담당 구분**(`_담당구분`,
     *    HW/FW/PM…)을 그 프로젝트의 Summary ▸ 프로젝트 멤버로 푼 값이다. 그래서 바꾸는 곳은 **간트 행의 담당 구분** —
     *    간트 드롭다운과 같은 `setWbsDiscipline`(상세내용 [담당구분] 태그·변경 이력까지)을 부른다.
     *    ⚠️ 쓰기는 **지금 열린 프로젝트 행만**(다른 프로젝트 파일을 고치면 그걸 열어 둔 앱이 옛 값으로 되돌린다).
     *    표의 담당자는 저장된 요약이 아니라 **지금 사실**에서 다시 읽는다 — 간트를 고치면 표가 바로 따라온다.
     */
    function factForRef(x) {
        var m = (_psLast && _psLast.factByKey) || {};
        {
            var f = m[fnv8(refKeyRaw(x))];
            // ⚠️ 행 번호가 밀렸으면(요약 뒤에 행을 넣거나 지움) 같은 번호의 **다른 업무**가 잡힌다 —
            //    업무명이 다르면 같은 프로젝트에서 업무명이 **하나뿐인** 사실을 찾는다(쓰기 쪽 resolveGanttRows 와 같은 규칙).
            if (f && x.task && f.task !== x.task) f = null;
            if (!f && x.task) {
                var hits = Object.keys(m).map(function (k) { return m[k]; }).filter(function (y) { return y.project === x.p && y.task === x.task; });
                if (hits.length === 1) f = hits[0];
            }
            return f || null;
        }
    }
    function liveFacts(r) { return uniqRefs(r.refs).map(factForRef).filter(Boolean); }
    function peopleOf(r) {
        var fs = liveFacts(r);
        if (!fs.length) return r.people || [];
        return uniq([].concat.apply([], fs.map(function (f) { return String(f.assignee || '').split(','); })));
    }
    function rolesOf(r) { return uniq(liveFacts(r).map(function (f) { return f.cat; })); }
    function localRefs(r) {
        var open = _psLast && _psLast.openName;
        return open ? uniqRefs(r.refs).filter(function (x) { return x.p === open; }) : [];
    }
    function whoCellHtml(r, ai) {
        var ppl = peopleOf(r), roles = rolesOf(r);
        var txt = ppl.length ? esc(ppl.join(', ')) : (roles.length ? '<span style="color:#aaa;" title="' + esc(T('담당 구분은 있지만 Summary ▸ 프로젝트 멤버에 그 역할의 담당자가 없습니다', 'Role has no assignee in project members')) + '">' + esc(roles.join(', ')) + '</span>' : '');
        // 보관본 보기에서도 된다 — 바뀌는 건 보관본이 아니라 간트 행이다.
        var canEdit = localRefs(r).length && typeof window.setWbsDiscipline === 'function';
        if (!canEdit) {
            // 📂 [2026-11-26 사용자 요청 "자동으로 열어주고 안내문 삭제"] 안내 띠 대신 칸을 누르면 그 프로젝트를 연다 → 열리면 고르기 상자가 된다.
            var pn = (uniqRefs(r.refs).filter(function (x) { return x.p; })[0] || {}).p || '';
            if (!pn || typeof window.setWbsDiscipline !== 'function') return '<span>' + txt + '</span>';
            var oi = _psOpenNames.indexOf(pn); if (oi < 0) oi = _psOpenNames.push(pn) - 1;
            return '<span onclick="window._psOpenProjectName(' + oi + ')" title="' + esc(T('누르면 ' + pn + ' 을(를) 열어 여기서 바로 바꿀 수 있습니다', 'Click to open ' + pn + ' and edit here')) + '" style="cursor:pointer; border-bottom:1px dotted #8aa;">' + (txt || '<span style="color:#aaa;">—</span>') + ' <span style="font-size:10px; opacity:.6;">📂</span></span>';
        }
        var meta = window.projectMeta || {}, m3 = (window.tabData && window.tabData.projectMembers3) || [];
        var manualNow = liveFacts(r).some(function (f) { return f.manual; });
        // 📧 상세내용에서 나온 담당자면 역할 칸을 고른 채로 두지 않는다 — 그러면 "HW · 역할 담당자" 가 보여 틀려 보인다.
        var contentNow = !manualNow && liveFacts(r).some(function (f) { return f.fromContent; });
        var cur = (!manualNow && !contentNow && roles.length === 1) ? roles[0] : '';
        var opts = (window.WBS_DISCIPLINE_CATEGORIES || []).map(function (c) {
            var who = roleOwner(c, meta, m3);
            return '<option value="' + esc(c) + '"' + (c === cur ? ' selected' : '') + '>' + esc(c + (who ? ' · ' + who : '')) + '</option>';
        }).join('');
        // 첫 칸 — 직접 지정이면 "👤 이름", 역할이 여럿이면 그대로(고르면 전부 그 역할로 맞춘다).
        if (cur === '') opts = '<option value="" selected>' + esc(manualNow ? '👤 ' + ppl.join(', ') : contentNow ? '📧 ' + (roles.length ? roles.join(', ') + ' · ' : '') + ppl.join(', ') : ((roles.length ? roles.join(', ') : T('(없음)', '(none)')) + (ppl.length ? ' · ' + ppl.join(', ') : ''))) + '</option>' + opts;
        // 👤 [2026-11-23] 담당자 직접 입력 / 해제 — 간트 행의 `_담당자` 에 쓴다(js/04k setRowAssignee).
        opts += '<option value="__manual__">' + esc(T('✏️ 담당자 직접 입력…', '✏️ Type assignee…')) + '</option>';
        if (manualNow) opts += '<option value="__clear__">' + esc(T('↺ 직접 지정 해제(역할로)', '↺ Clear (use role)')) + '</option>';
        // 칸 하나 — 고르기 상자 자체가 "역할 · 이름" 을 보여 준다(행 높이를 늘리지 않는다).
        return '<select onchange="window._psSetRole(' + ai + ', this.value)" title="' + esc(T('담당 구분 바꾸기 또는 담당자 직접 입력 — 간트 행에 바로 반영됩니다', 'Change role or type an assignee — written to the Gantt row')) + '" style="' + window._uiSelectStyle(manualNow) + ' height:20px; font-size:11px; max-width:140px; cursor:pointer;">' + opts + '</select>';
    }
    /** 이 요약 행의 근거 → 지금 간트의 행 번호들. 행 번호가 밀렸으면 업무명이 **하나뿐인** 행을 찾고, 없으면 빼고 센다. */
    var _psOpenNames = [];   // 담당자 칸이 순번으로 집는다(이름에 따옴표·> 가 들어 있다)
    function resolveGanttRows(r) {
        var gd = (typeof globalData !== 'undefined' && globalData) ? globalData : window.globalData;
        var out = [], lost = 0;
        localRefs(r).forEach(function (x) {
            var ri = x.row;
            if (!gd || !gd[ri] || (x.task && taskName(gd[ri]) !== x.task)) {
                ri = -1;
                var hits = [];
                for (var i = 1; x.task && gd && i < gd.length; i++) if (gd[i] && gd[i]._level !== undefined && taskName(gd[i]) === x.task) hits.push(i);
                if (hits.length === 1) ri = hits[0];
            }
            if (ri < 0) lost++; else if (out.indexOf(ri) === -1) out.push(ri);
        });
        return { rows: out, lost: lost, gd: gd };
    }
    window._psSetRole = function (ai, role) {
        var r = _psLast && _psLast.shown && _psLast.shown.rows && _psLast.shown.rows[ai];
        if (!r || !role) return;
        var res = resolveGanttRows(r), gd = res.gd, n = 0, msg = '';
        if (!res.rows.length && !res.lost) return;
        if (role === '__manual__') {
            var curNames = peopleOf(r).join(', ');
            var v = prompt(T('담당자 이름(여러 명은 쉼표). 비우면 담당 구분(역할)으로 되돌립니다.', 'Assignee name (comma for several). Empty = back to the role.'), curNames);
            if (v === null) { if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody(); return; }
            res.rows.forEach(function (ri) { if (window.setRowAssignee(ri, v)) n++; });
            msg = String(v).trim() ? T('✅ 간트 ' + n + '행의 담당자를 ' + String(v).trim() + ' 로 직접 지정했습니다', 'Set assignee on ' + n + ' row(s)') : T('✅ 간트 ' + n + '행을 담당 구분(역할)으로 되돌렸습니다', 'Cleared ' + n + ' row(s)');
        } else if (role === '__clear__') {
            res.rows.forEach(function (ri) { if (window.setRowAssignee(ri, '')) n++; });
            msg = T('✅ 간트 ' + n + '행의 직접 지정을 해제했습니다(역할로)', 'Cleared ' + n + ' row(s)');
        } else {
            res.rows.forEach(function (ri) {
                // 역할을 고르면 직접 지정은 푼다 — 안 풀면 이름이 그대로라 "골랐는데 안 바뀐다" 가 된다.
                var changed = false;
                if (gd[ri]._담당자 && window.setRowAssignee) changed = window.setRowAssignee(ri, '') || changed;
                if (String(gd[ri]._담당구분 || '') !== role) { window.setWbsDiscipline(ri, role); changed = true; }
                if (changed) n++;
            });
            var who = roleOwner(role, window.projectMeta || {}, (window.tabData && window.tabData.projectMembers3) || []);
            msg = n ? T('✅ 간트 ' + n + '행의 담당 구분을 ' + role + (who ? '(' + who + ')' : '') + ' 로 바꿨습니다', 'Changed ' + n + ' Gantt row(s) to ' + role) : T('이미 그 담당 구분입니다', 'Already that role');
        }
        if (res.lost && window.showToast) window.showToast(T('⚠️ 근거 행 ' + res.lost + '개는 간트에서 같은 업무를 찾지 못해 바꾸지 않았습니다', '⚠️ ' + res.lost + ' source row(s) not found in the Gantt — skipped'), 'info');
        if (window.showToast) window.showToast(msg, 'info');
        if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
    };
    // 📌 [2026-11-24 사용자 요청 "프로젝트 리뷰에서 검색된 업무를 핀셋 처리 가능하도록"] — 간트 No. 칸의 핀셋 막대와
    //    **같은 데이터**(`row._알림`, js/04e wrToggleAlarm)를 켜고 끈다. 담당자 편집과 같은 안전장치: 열린 프로젝트의 행만
    //    (다른 프로젝트 파일을 고치면 그걸 열어 둔 앱이 옛 값으로 되돌린다 — 2026-10-29).
    function factGanttRow(f) {
        var gd = (typeof globalData !== 'undefined' && globalData) ? globalData : window.globalData;
        var open = _psLast && _psLast.openName;
        if (!f || !gd || !(f.local || (open && f.project === open))) return -1;
        var ri = f.rowIdx != null ? f.rowIdx : f.idx;
        if (gd[ri] && (!f.task || taskName(gd[ri]) === f.task)) return ri;
        var hits = [];
        for (var i = 1; f.task && i < gd.length; i++) if (gd[i] && gd[i]._level !== undefined && taskName(gd[i]) === f.task) hits.push(i);
        return hits.length === 1 ? hits[0] : -1;
    }
    /** rows: 간트 행 번호들 → 칸 하나(켜짐/꺼짐/일부). onclick 은 미리 만든 호출문. */
    // 🚩 [2026-11-26 사용자 요청 "핀셋 아이콘 말고 간트처럼 붉은색 바로 통일"] 버튼 → 칸 왼쪽의 붉은 바(js/80 `_rr.barHtml`, `.rp-bar`).
    //    onclick 인자는 옛 호출부 모양을 지키려고 남겼다 — 바는 자기 레지스트리(행 번호 + 그때의 업무명)로 눌린다. 쓰는 칸엔 `rp-cell` 클래스가 있어야 한다.
    function pinBtnHtml(rows, onclick, closedWhy) { return window._rr.barHtml(rows, closedWhy); }
    function applyPins(rows, lost) { window._rrPinRows(rows, lost); }   // 켜고 끄기·간트/알람 탭/보고 화면 새로고침은 js/80 한 곳
    /** 📌 이 요약 행(근거 간트 행 중 하나라도) / 이 사실이 핀셋 켜져 있나 — '핀셋만' 필터가 쓴다. */
    function rowPinned(r) {
        var res = resolveGanttRows(r);
        return res.rows.some(function (ri) { return res.gd[ri] && res.gd[ri]._알림; });
    }
    function factPinned(f) {
        var gd = (typeof globalData !== 'undefined' && globalData) ? globalData : window.globalData;
        var ri = factGanttRow(f);
        return ri >= 0 && !!(gd[ri] && gd[ri]._알림);
    }
    window._psFactPinned = factPinned;   // 하네스용
    /** 📌 핀셋만 체크 — 표가 없을 때도(사실 목록만) 보인다. 열린 프로젝트 것만 셀 수 있다. */
    function pinFilterHtml(n) {
        return '<label title="' + esc(T('핀셋(알람)을 켠 업무만 — 표와 아래 사실 목록 둘 다. 열린 프로젝트의 업무만 알 수 있습니다', 'Pinned tasks only (table and fact list) — open project only')) + '" style="font-size:11px; color:#c25e00; display:inline-flex; align-items:center; gap:2px; cursor:pointer; margin-left:2px; white-space:nowrap;"><input type="checkbox"' + (_psTbl.pinned ? ' checked' : '') + ' onchange="window._psTblSet({pinned:this.checked})">📌 ' + esc(T('핀셋만', 'Pinned only')) + ' ' + n + '</label>';
    }
    window._psPinRow = function (ai) {
        var r = _psLast && _psLast.shown && _psLast.shown.rows && _psLast.shown.rows[ai];
        if (!r) return;
        var res = resolveGanttRows(r);
        applyPins(res.rows, res.lost);
    };
    window._psPinFact = function (key) {
        var f = _psLast && _psLast.factByKey && _psLast.factByKey[key];
        var ri = factGanttRow(f);
        applyPins(ri >= 0 ? [ri] : [], 0);
    };
    /** 🎯 근거 = 아래 사실 카드로 가는 단추(간트 이동은 카드의 #G 링크가 한다). */
    function refHtml(x, showProj, rowI) {
        var title = esc((x.p ? x.p + ' · ' : '') + (x.task || '') + ' — ' + T('눌러서 상세 보기', 'click for details'));
        var lf = factForRef(x);
        var key = lf ? factKey(lf) : fnv8(refKeyRaw(x));   // 행 번호가 밀렸어도 그 업무의 카드로
        return '<a href="javascript:void(0)" onclick="window._psGoFact(\'' + key + '\', ' + rowI + ')" title="' + title + '" style="color:var(--ui-accent, #00707d); text-decoration:underline dotted; white-space:nowrap; cursor:pointer;">' +
               (showProj ? esc(x.p || '?') + ' ' : '') + '#' + esc(x.row != null ? x.row : x.g) + '</a>';
    }
    // 📋 [2026-11-26 사용자 요청 "업무 내용을 도표로, 오름·내림 필터, 일일보고와 통일"] 근거 사실 목록 = 카드 → **표**.
    //    정렬·필터·모양은 공용 엔진(js/79 `_ft`) — 일일보고의 간트에서 불러오기와 같은 표다.
    //    ⚠️ 행 id(`ps-fact-<열쇠>`)·`#G` 링크·📌 핀셋·📧 원문은 카드 때와 똑같이 둔다(표의 근거 → 이 행으로 이동/돌아오기가 그 id 를 쓴다).
    function factsCfg() {
        var thisProj = String(window.currentDriveFileName || '').replace(/\.json$/i, '');
        return {
            defaultSort: { col: 'date', dir: -1 },
            empty: T('이 기간에 메일 분석으로 들어온 업무가 없습니다.', 'No mail-derived tasks in this period.'),
            repaint: function () { paintFacts(); },
            rowClass: function (f) { return factPinned(f) ? 'rp-on' : ''; },   // 핀셋 켠 행은 간트처럼 행 전체가 옅게 물든다
            rowAttr: function (f) { return 'id="ps-fact-' + factKey(f) + '" onclick="window._psFactBack(event)" style="transition:box-shadow .3s, background .3s;"'; },
            // 🔗≈ [2026-11-26 사용자 요청 "프로젝트 리뷰도 비슷한 기능"] 같은 메일 묶기·비슷한 업무 알림 — 일일보고와 같은 공용 모듈(js/81). 펼친 자식 줄도 근거 이동 id 를 갖는다.
            children: function (f) { return window._fdup.children('ps-facts', f); },
            childAttr: function (f) { return 'id="ps-fact-' + factKey(f) + '" onclick="window._psFactBack(event)" style="background:#f6f9fb; transition:box-shadow .3s, background .3s;"'; },
            cols: [
                { id: 'date', label: T('날짜', 'Date'),
                  // 🚩 머리글 전체 바 — 간트 No. 머리글의 막대와 같다(하나라도 켜져 있으면 전체 해제, 아니면 전체 켜기 — 이 목록의 행만)
                  thHtml: function (view) { return window._rr.headHtml(view.map(factGanttRow).filter(function (ri) { return ri >= 0; })); }, w: '82px', nowrap: true, align: 'center', firstDir: -1, sort: function (f) { return f.date || ''; },
                  // 🚩 붉은 바는 **첫 칸 왼쪽 끝**에(간트 No. 칸과 같은 구조 — 별도 칸·테두리 없이)
                  tdCls: function (f) { return dateCls(f.date) + ' rp-cell rp-pad'; },
                  html: function (f) { var ri = factGanttRow(f); return pinBtnHtml(ri >= 0 ? [ri] : [], "window._psPinFact('" + factKey(f) + "')") + esc(f.date || ''); } },
                { id: 'cat', label: T('구분', 'Role'), w: '58px', nowrap: true, align: 'center', sort: function (f) { return f.cat || '~'; }, opt: function (f) { return window._fdup.members(f).map(function (m) { return m.cat || ''; }); },
                  html: function (f) { return f.cat ? '<span style="' + window._uiBadgeStyle() + ' background:#eef3f7; color:#2c5f8a;">' + esc(f.cat) + '</span>' : ''; } },
                { id: 'who', label: T('담당자', 'Assignee'), w: '92px', nowrap: true, align: 'center', sort: function (f) { return f.assignee || '~'; },
                  opt: function (f) { return [].concat.apply([], window._fdup.members(f).map(function (m) { return String(m.assignee || '').split(',').map(function (x) { return x.trim(); }); })); },
                  // 👤 이름이 많으면 면적을 다 먹었다(2026-11-26 신고) — 첫 이름 + "외 N", 전체는 말풍선
                  html: function (f) { return whoTip(String(f.assignee || '').split(',').map(function (x) { return x.trim(); }), []); } },
                { id: 'proj', label: T('프로젝트', 'Project'), sort: function (f) { return f.project || ''; }, opt: function (f) { return f._g ? f._g.projects : (f.project || ''); },
                  html: function (f, i, isChild) {
                      var more = (!isChild && f._g && f._g.projects.length > 1) ? ' <span style="color:#888;" title="' + esc(f._g.projects.join('\n')) + '">' + esc(T('외 ' + (f._g.projects.length - 1), '+' + (f._g.projects.length - 1))) + '</span>' : '';
                      return '<span style="font-size:11.5px;">' + esc(f.project || '') + (f.project && f.project === thisProj ? ' <span title="' + esc(T('지금 열린 프로젝트', 'Open project')) + '">📂</span>' : '') + more + '</span>';
                  } },
                { id: 'task', label: T('업무', 'Task'), w: '24%', sort: function (f) { return f.task || ''; }, html: function (f, i, isChild) {
                    return (isChild ? window._fdup.childMark(f) : '') + (f.local ? link(f.idx) : '<span style="color:#bbb;">#G' + f.idx + '</span>') + ' <b>' + esc(f.task) + '</b>' + window._fdup.cellHtml('ps-facts', f, isChild) +
                           ((f.sender || f.receiver) ? '<div style="color:#888; font-size:11px;">' + esc(f.sender || '?') + ' → ' + esc(f.receiver || '?') + '</div>' : '');
                } },
                { id: 'text', label: T('내용', 'Content'), w: '38%', sort: function (f) { return f.core || f.todo || f.issue || ''; }, html: function (f) {
                    return '<span data-ft-main="1"></span>' +
                           (f.core ? '<div style="color:#222;">' + esc(f.core) + '</div>' : '') +
                           (f.todo ? '<div style="color:#1971c2; margin-top:2px;">To do: ' + esc(f.todo) + '</div>' : '') +
                           (f.issue ? '<div style="color:#b1432f; margin-top:2px;">⚠️ ' + esc(f.issue) + (f.fix ? ' → ' + esc(f.fix) : '') + '</div>' : '') +
                           (f.answer ? '<div style="color:#2f9e44; margin-top:2px;">↩ ' + esc(f.answer) + '</div>' : '');
                } },
                // 🚩 [2026-11-26] 회의하며 바로 — 현황(간트 상태 칸)을 바꾸거나 간트 행을 지운다. 완료로 보내면 이 목록에서 숨는다.
                { id: 'ops', label: T('현황·삭제', 'Status'), w: '112px', nowrap: true, align: 'center', html: function (f) {
                    var ri = factGanttRow(f);
                    return window._rr.opsHtml(ri >= 0 ? [ri] : [], f.status);
                } },
                { id: 'src', label: T('원문', 'Source'), w: '66px', nowrap: true, align: 'center', html: function (f) {
                    return (f.mailRaw && window.showMailRawModal)
                        ? '<button onclick="event.stopPropagation(); window._psShowMail(\'' + factKey(f) + '\')" style="' + window._uiBtnStyle() + ' height:20px; line-height:18px; background:#fff8e6; border-color:#ffe08a; color:#7a5210;">📧 ' + esc(T('원문', 'Source')) + '</button>' : '';
                } }
            ]
        };
    }
    function factsTableHtml(facts) {
        // 🔗≈ 묶기·비슷한 업무는 **표 엔진 앞에서**(js/81) — 대표 줄만 엔진에 넣고, 칩 줄을 표 위에 둔다. 열린 프로젝트의 사실이 대표(간트 조작이 거기서만 된다).
        var dup = window._fdup.build('ps-facts', facts, {
            name: function (f) { return f.task; }, core: function (f) { return f.core; }, mail: function (f) { return f.mailRaw; }, project: function (f) { return f.project; },
            prefer: function (f) { return factGanttRow(f) >= 0; },
            repaint: paintFacts
        });
        var chips = window._fdup.chipsHtml('ps-facts');
        return (chips ? '<div style="margin:0 0 5px; display:flex; gap:5px; flex-wrap:wrap;">' + chips + '</div>' : '') + window._ft.build('ps-facts', factsCfg(), dup.rows).html;
    }
    function paintFacts() {
        var el = document.getElementById('ps-facts-body');
        if (el && _psLast && _psLast.factsShown) el.innerHTML = factsTableHtml(_psLast.factsShown);
    }
    // 📋 [2026-11-26 사용자 요청 "회의용 — 팀장·파트장이 어떤 업무를 어떻게 진행 중인지·이슈·해결할 일"] **회의 브리핑** 보기.
    //    ⚠️ AI 가 새로 내는 것은 **문장**뿐이다(분류·내용·근거 — 지금과 같은 행 목록). 브리핑은 그 행을 **업무 단위로 다시 묶어 보는 화면**이라
    //       접지 검사·보관함·엑셀·핀셋·담당자 편집 같은 기존 장치가 전부 그대로 돈다(행 목록 보기에서).
    //    · 업무 = 행의 첫 근거 사실의 업무명(프로젝트 + 업무명). 한 업무의 한 일/막힌 일/할 일/결정·요청 문장이 한 줄에 모인다.
    //    · 열: 한 일 → 지금 상태 · 막힌 일 → 이슈 · 할 일 + 결정·요청 → 필요한 조치(결정은 배지).
    //    · "N일 경과" 는 코드가 근거 사실 중 가장 이른 날짜로 센다(AI 가 지어내지 않는다).
    //    · 맨 위 "오늘 회의에서 정할 것" = 막힌 일·결정·요청 중 오래된 순 상위 P.meetingTop 건.
    P.meetingTop = P.meetingTop || 6;
    var _psBriefTasks = [], _psMeetTargets = [], _psMeetBack = null;   // 핀셋 단추·회의 줄이 순번으로 집는다(이름에 따옴표가 들어 있다)
    // 🚩→📋 [2026-11-26 사용자 요청] "오늘 회의에서 정할 것" 한 줄을 누르면 아래 그 업무 줄로 가서 깜빡이고, 그 줄을 누르면 돌아온다.
    window._psGoBrief = function (i) {
        var el = document.getElementById('ps-brief-' + _psMeetTargets[i]);
        if (!el) return;
        _psMeetBack = i;
        var old = document.getElementById('ps-meet-hint'); if (old) old.remove();
        el.firstElementChild.insertAdjacentHTML('afterbegin', '<div id="ps-meet-hint" style="float:right; font-size:10.5px; color:#1971c2;">↩ ' + esc(T('누르면 위로 돌아갑니다', 'Click to go back')) + '</div>');
        el.style.cursor = 'pointer';
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(el, '#fff3bf');
    };
    window._psBriefBack = function (ev) {
        if (_psMeetBack == null) return;
        var t = ev && ev.target;
        if (t && t.closest && t.closest('button, a, select, input, textarea, .rp-bar') && !t.closest('#ps-meet-hint')) return;   // 줄 안 단추는 그대로
        var back = document.getElementById('ps-meet-' + _psMeetBack);
        _psMeetBack = null;
        var hint = document.getElementById('ps-meet-hint'); if (hint) { var tr = hint.closest('tr'); hint.remove(); if (tr) tr.style.cursor = ''; }
        if (!back) return;
        back.scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(back, '#ffe3e3');
    };
    function daysSince(d) {
        if (!d) return 0;
        var n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate()), x = new Date(d + 'T00:00:00');
        return isNaN(x.getTime()) ? 0 : Math.max(0, Math.round((t - x) / 86400000));
    }
    function rowAge(r) {
        var ds = liveFacts(r).map(function (f) { return f.date; }).filter(Boolean).sort();
        var d = ds[0] || r.date || '';
        return d ? daysSince(d) : 0;
    }
    function ganttRowsOfTask(t) {
        var all = (_psLast && _psLast.shown && _psLast.shown.rows) || [], rows = [], lost = 0;
        t.ai.forEach(function (ai) {
            var res = resolveGanttRows(all[ai] || { refs: [] });
            lost += res.lost;
            res.rows.forEach(function (ri) { if (rows.indexOf(ri) < 0) rows.push(ri); });
        });
        return { rows: rows, lost: lost };
    }
    window._psPinBrief = function (n) {
        var t = _psBriefTasks[n]; if (!t) return;
        var res = ganttRowsOfTask(t);
        applyPins(res.rows, res.lost);
    };
    function briefModel(rows, all) {
        var by = _psTbl.by === 'who' ? 'who' : 'proj', groups = {}, order = [];
        rows.forEach(function (r) {
            var ai = all.indexOf(r), rr = uniqRefs(r.refs), t0 = rr[0] || {}, ppl = peopleOf(r), roles = rolesOf(r);
            var gkeys = by === 'who'
                ? (ppl.length ? ppl : [roles.length ? '(' + roles.join(', ') + ')' : T('(담당 미지정)', '(Unassigned)')])
                : [r.common ? '\u0000' + T('공통 이슈', 'Common issues') : (r.projects[0] || T('(프로젝트 미상)', '(Unknown project)'))];
            gkeys.forEach(function (gk) {
                var g = groups[gk];
                if (!g) { g = groups[gk] = { name: gk.replace(/^\u0000/, ''), common: gk.charAt(0) === '\u0000', tasks: {}, torder: [], score: 0, nb: 0, nd: 0 }; order.push(gk); }
                var tk = r.common ? 'c' + ai : (t0.task ? (r.projects[0] || '') + '\u0001' + t0.task : 'n' + ai);
                var t = g.tasks[tk];
                if (!t) {
                    t = g.tasks[tk] = { task: r.common ? T('🔗 공통 이슈', '🔗 Common issue') : (t0.task || T('(업무명 없음)', '(untitled)')),
                        proj: r.projects[0] || '', sub: r.common ? r.projects.join(', ') : '', ai: [], rows: { done: [], blocked: [], todo: [], decision: [] },
                        people: [], roles: [], refs: [], date: '', score: 0, age: 0 };
                    g.torder.push(tk);
                }
                t.ai.push(ai);
                (t.rows[r.cat] || t.rows.done).push(r);
                t.people = uniq(t.people.concat(ppl)); t.roles = uniq(t.roles.concat(roles));
                t.refs = uniqRefs(t.refs.concat(rr));
                if ((r.date || '') > t.date) t.date = r.date || '';
                var w = r.cat === 'blocked' ? 3 : r.cat === 'decision' ? 2 : r.cat === 'todo' ? 1 : 0;
                t.score += w; g.score += w;
                if (r.cat === 'blocked') { t.age = Math.max(t.age, rowAge(r)); g.nb++; }
                if (r.cat === 'decision') g.nd++;
            });
        });
        var gl = order.map(function (k) {
            var g = groups[k];
            g.list = g.torder.map(function (tk) { return g.tasks[tk]; }).sort(function (a, b) { return (b.score - a.score) || ((a.date < b.date) ? 1 : -1); });
            return g;
        }).sort(function (a, b) { return (b.score - a.score) || (a.name < b.name ? -1 : 1); });
        return gl;
    }
    function briefLines(rs, decBadge) {
        if (!rs.length) return '<span style="color:#ccc;">—</span>';
        return rs.map(function (r) {
            return '<div style="margin-bottom:3px;">' + (decBadge && r.cat === 'decision' ? '<span style="' + window._uiBadgeStyle() + ' background:#fff3bf; color:#8f5a00;">' + esc(T('결정 필요', 'Decide')) + '</span> ' : '') + esc(r.text) + '</div>';
        }).join('');
    }
    function briefHtml() {
        var all = (_psLast && _psLast.shown && _psLast.shown.rows) || [];
        var rows = viewRows(true);
        findSync(rows.length, all.length);
        var fs = _psTbl.big ? 14.5 : 12.5, by = _psTbl.by === 'who' ? 'who' : 'proj';
        if (!rows.length) return '<div style="padding:18px 10px; text-align:center; color:#999; font-size:12.5px;">' + esc(all.length ? T('조건에 맞는 행이 없습니다', 'No rows match') : T('근거 있는 항목이 없었습니다 — 아래 사실 목록을 보세요', 'No grounded items')) + '</div>';
        var groups = briefModel(rows, all);
        _psBriefTasks = [];
        // 🔗≈ [2026-11-26 사용자 요청 "브리핑에도 넣기"] 근거 사실 표와 **같은 공용 모듈(js/81)** — 같은 메일이 여러 프로젝트로 간 업무는 한 줄(🔗 ×N, 펼치면 프로젝트별),
        //    같은 프로젝트에서 업무명 낱말이 2개 이상 겹치면 ≈ 로 알리기만. 프로젝트별 보기에서만(담당자별은 같은 업무가 사람마다 따로 있어야 한다).
        var dupChips = '';
        if (by === 'proj' && window._fdup) {
            var flat = []; groups.forEach(function (g) { g.list.forEach(function (t) { flat.push(t); }); });
            var taskMail = function (t) {
                var m = null;
                t.ai.forEach(function (ai) { if (!m && all[ai]) liveFacts(all[ai]).forEach(function (f) { if (!m && f.mailRaw) m = f.mailRaw; }); });
                return m;
            };
            var dupB = window._fdup.build('ps-brief', flat, {
                // 🔗 공통 이슈 줄은 이미 여러 프로젝트를 한 줄로 묶은 것이고 이름("공통 이슈")이 다 같다 — 묶기·비슷 판정에서 뺀다(서로 다른 문장이 하나로 합쳐졌다, 실측)
                name: function (t) { return t.sub ? '\u0001' + t.ai.join('_') : t.task; },
                core: function (t) { return t.ai.map(function (ai) { return (all[ai] || {}).text || ''; }).join('|'); },
                mail: taskMail,
                project: function (t) { return t.proj; },
                prefer: function (t) { return ganttRowsOfTask(t).rows.length > 0; },   // 열린 프로젝트 업무가 대표(간트 조작이 거기서만 된다)
                repaint: rerenderAi
            });
            var keepT = new Set(dupB.rows);
            groups.forEach(function (g) { g.list = g.list.filter(function (t) { return keepT.has(t); }); });
            groups = groups.filter(function (g) { return g.list.length; });
            dupChips = window._fdup.chipsHtml('ps-brief');
        }
        // ── 오늘 회의에서 정할 것 ──
        var items = rows.filter(function (r) { return r.cat === 'blocked' || r.cat === 'decision'; }).map(function (r) {
            return { r: r, age: rowAge(r), ai: all.indexOf(r) };
        }).sort(function (a, b) {
            var ka = (a.r.cat === 'blocked' ? 1000 : 500) + a.age, kb = (b.r.cat === 'blocked' ? 1000 : 500) + b.age;
            return kb - ka;
        }).slice(0, P.meetingTop);
        var box = '';
        _psMeetTargets = [];
        function meetBox() {   // 표(업무 줄 번호)가 먼저 만들어져야 각 줄이 갈 자리를 안다
        if (items.length) {
            box = '<div style="border:1px solid #f1b8b8; background:#fff5f5; border-radius:8px; padding:8px 12px; margin:6px 0 2px; max-height:32vh; overflow:auto; font-size:' + fs + 'px;">' +
                '<div style="font-weight:bold; color:#c92a2a; margin-bottom:4px;">🚩 ' + esc(T('오늘 회의에서 정할 것 ' + items.length + '건', 'To settle in the meeting: ' + items.length)) + '</div>' +
                // ▥ [2026-11-26 사용자 요청 "전체 페이지면 분할로 — 분홍 면적이 아깝다"] 전체 화면이면 2단(위→아래로 번호 순), 좁아지면(상자 폭 1422px 미만) 1단 — 3단은 쓰지 않는다(사용자 결정).
                '<div style="columns:700px 2; column-gap:22px;">' +
                items.map(function (it, i) {
                    var r = it.r, ppl = peopleOf(r), roles = rolesOf(r);
                    var tn = -1; _psBriefTasks.forEach(function (t, n) { if (tn < 0 && t.ai.indexOf(it.ai) >= 0) tn = n; });
                    if (tn < 0) _psBriefTasks.forEach(function (t, n) { if (tn < 0 && ((t._g && t._g.members) || []).concat((t._sim && t._sim.members) || []).some(function (m) { return m.ai.indexOf(it.ai) >= 0; })) tn = n; });   // 🔗 묶음 안에 접혀 있으면 대표 줄로
                    _psMeetTargets[i] = tn;
                    return '<div id="ps-meet-' + i + '" onclick="window._psGoBrief(' + i + ')" title="' + esc(T('누르면 아래 그 업무 줄로 갑니다', 'Click to jump to the task')) + '" style="line-height:1.65; cursor:pointer; border-radius:4px; padding:0 4px; margin:0 -4px; break-inside:avoid; transition:background .4s;">' + (i + 1) + '. <b style="color:#555;">[' + esc(r.common ? T('공통', 'Common') : (r.projects[0] || '')) + ']</b> ' + esc(r.text) + ' ' +
                        '<span style="' + window._uiBadgeStyle() + ' background:' + (r.cat === 'blocked' ? '#ffe3e3; color:#c92a2a' : '#fff3bf; color:#8f5a00') + ';">' + esc(r.cat === 'blocked' ? T('막힘', 'Blocked') : T('결정 필요', 'Decide')) + '</span>' +
                        (it.age >= 1 ? ' <span style="color:#c92a2a; font-size:11px;" title="' + esc(T('근거 메일 중 가장 이른 날짜 기준', 'Since the earliest source mail')) + '">' + esc(T(it.age + '일 경과', it.age + 'd')) + '</span>' : '') +
                        (ppl.length || roles.length ? ' <span style="color:#555; font-size:11.5px;">· ' + whoTip(ppl, roles) + '</span>' : '') + '</div>';
                }).join('') + '</div></div>';
        }
        }
        // ── 표 ──
        var td = 'padding:6px 8px; border-right:1px solid var(--ui-cell-line, #cfe3e5); border-bottom:1px solid var(--ui-cell-line, #cfe3e5); vertical-align:top; font-size:' + fs + 'px; line-height:1.5;';
        var allRg = [];
        var th = function (label, w, pre) { return '<th style="position:sticky; top:0; z-index:20; width:' + w + '; padding:10px 8px; background:#eef6f7; color:#2c5f8a; border-right:1px solid var(--ui-cell-line, #cfe3e5); border-bottom:1px solid var(--ui-cell-line, #cfe3e5); font-size:12.5px; font-weight:600; text-align:center; white-space:nowrap;">' + (pre || '') + esc(label) + '</th>'; };
        var body = '';
        groups.forEach(function (g) {
            body += '<tr><td colspan="5" style="padding:6px 8px; background:#e3eef6; border-bottom:1px solid var(--ui-cell-line, #cfe3e5); font-weight:bold; color:#2c5f8a; font-size:' + fs + 'px;">' +
                (g.common ? '🔗 ' : (by === 'who' ? '👤 ' : '📁 ')) + esc(g.name) +
                ' <span style="font-weight:normal; color:#667; font-size:11.5px;">· ' + esc(T('업무 ' + g.list.length + (g.nb ? ' · 막힘 ' + g.nb : '') + (g.nd ? ' · 결정 ' + g.nd : ''), g.list.length + ' tasks' + (g.nb ? ' · ' + g.nb + ' blocked' : '') + (g.nd ? ' · ' + g.nd + ' to decide' : ''))) + '</span></td></tr>';
            g.list.forEach(function (t, ti) {
                taskRow(t, ti, false);
                if (by === 'proj' && window._fdup) window._fdup.children('ps-brief', t).forEach(function (k) { taskRow(k, ti, true); });
            });
        });
        function taskRow(t, ti, isChild) {
                var n = _psBriefTasks.push(t) - 1;
                var rg = ganttRowsOfTask(t).rows;
                rg.forEach(function (ri) { if (allRg.indexOf(ri) < 0) allRg.push(ri); });
                var sub = by === 'who' ? (t.proj ? '<div style="color:#888; font-size:11px;">' + esc(t.proj) + '</div>' : '') :
                    (t.sub ? '<div style="color:#888; font-size:11px;">' + esc(t.sub) + '</div>' : ((t.people.length || t.roles.length) ? '<div style="color:#666; font-size:11.5px;">' + whoTip(t.people, t.roles) + '</div>' : ''));
                if (isChild && t._ck === 'grp' && t.proj) sub = '<div style="color:#2c5f8a; font-size:11px;">📁 ' + esc(t.proj) + '</div>' + sub;   // 🔗 펼친 줄 = 다른 프로젝트
                var allOn = rg.length && rg.every(function (ri) { var g0 = (typeof globalData !== 'undefined' && globalData) ? globalData : window.globalData; return g0[ri] && g0[ri]._알림; });
                body += '<tr id="ps-brief-' + n + '" onclick="window._psBriefBack(event)"' + (ti % 2 || allOn ? ' class="' + (ti % 2 ? 'ft-zebra-b ' : '') + (allOn ? 'rp-on' : '') + '"' : '') + ' style="transition:background .4s;">' +
                    '<td class="rp-cell rp-pad" style="' + td + '">' + pinBtnHtml(rg, 'window._psPinBrief(' + n + ')') + (isChild ? window._fdup.childMark(t) : '') + '<b>' + esc(t.task) + '</b>' +
                      (by === 'proj' && window._fdup ? window._fdup.cellHtml('ps-brief', t, isChild) : '') + sub + '</td>' +
                    '<td style="' + td + '">' + briefLines(t.rows.done) + '</td>' +
                    '<td style="' + td + '">' + briefLines(t.rows.blocked) +
                      (t.age >= 1 && t.rows.blocked.length ? '<span style="' + window._uiBadgeStyle() + ' background:#ffe3e3; color:#c92a2a;" title="' + esc(T('근거 메일 중 가장 이른 날짜 기준', 'Since the earliest source mail')) + '">' + esc(T(t.age + '일 경과', t.age + 'd')) + '</span>' : '') + '</td>' +
                    '<td style="' + td + '">' + briefLines(t.rows.todo.concat(t.rows.decision), true) + '</td>' +
                    '<td style="' + td + ' font-size:11px;">' + t.refs.map(function (x) { return refHtml(x, t.refs.some(function (y) { return y.p !== t.refs[0].p; }), t.ai[0]); }).join('<br>') +
                      (rg.length ? '<div style="margin-top:5px;">' + window._rr.opsHtml(rg, '') + '</div>' : '') + '</td></tr>';
        }
        meetBox();
        _psMeetHtml = box;   // 📌 회의 상자는 표와 같이 스크롤하지 않는다 — 고정 머리(#ps-meet-slot)에 따로 그린다(paintMeet)
        return (dupChips ? '<div style="margin:2px 0 5px; display:flex; gap:5px; flex-wrap:wrap;">' + dupChips + '</div>' : '') + '<table class="ui-round-tbl" style="width:100%; border-collapse:separate; border-spacing:0; border-left:1px solid var(--ui-cell-line, #cfe3e5); border-top:1px solid var(--ui-cell-line, #cfe3e5); table-layout:fixed; background:#fff;"><thead><tr>' +
            th(T('업무', 'Task'), '22%', window._rr.headHtml(allRg)) + th(T('지금 상태', 'Status'), '25%') + th(T('이슈·막힌 점', 'Issues'), '21%') + th(T('필요한 조치', 'Next actions'), '23%') + th(T('근거', 'Source'), '9%') +
            '</tr></thead><tbody>' + body + '</tbody></table>' +
            '<div style="font-size:11px; color:#888; margin-top:4px;">' + esc(T(rows.length + ' / ' + all.length + '행 · 문장마다 근거(#번호)가 있고 근거 없는 문장은 제거됩니다 · 담당자·경과일은 코드가 계산 · 담당자 변경은 📊 행 목록에서', rows.length + ' / ' + all.length + ' rows')) + '</div>';
    }
    /** 담당자 칸 — 이름이 많아도 면적을 안 먹게 첫 이름 + "외 N", 전체는 말풍선. */
    function whoTip(ppl, roles) {
        ppl = (ppl || []).filter(Boolean);
        if (!ppl.length) return (roles && roles.length) ? '<span style="color:#aaa;" title="' + esc(T('담당 구분은 있지만 Summary ▸ 프로젝트 멤버에 그 역할의 담당자가 없습니다', 'Role has no assignee in project members')) + '">' + esc(roles.join(', ')) + '</span>' : '';
        return '<span title="' + esc(ppl.join(', ')) + '" style="white-space:nowrap; cursor:default;"><span style="display:inline-block; max-width:84px; overflow:hidden; text-overflow:ellipsis; vertical-align:bottom;">' + esc(ppl[0]) + '</span>' +
               (ppl.length > 1 ? '<span style="color:#888;"> ' + esc(T('외 ' + (ppl.length - 1), '+' + (ppl.length - 1))) + '</span>' : '') + '</span>';
    }
    // 📌 [2026-11-26 사용자 요청 "오늘 회의에서 정할 것은 고정"] 브리핑의 회의 상자는 스크롤 밖 고정 머리(#ps-sticky 안 #ps-meet-slot)에 둔다.
    //    표를 다시 그리는 모든 길이 tableHtml() 을 지나므로 여기서 같이 칠한다(첫 그리기는 body 를 만든 뒤 한 번 더 — paintMeet).
    var _psMeetHtml = '';
    function paintMeet() { var s = document.getElementById('ps-meet-slot'); if (s) s.innerHTML = _psMeetHtml; }
    function tableHtml() {
        _psMeetHtml = '';
        var html = _psTbl.view === 'rows' ? rowsTableHtml() : briefHtml();
        paintMeet();
        return html;
    }
    function rowsTableHtml() {
        var rows = viewRows();
        var all = (_psLast && _psLast.shown && _psLast.shown.rows) || [];
        var th = function (id, label, w, pre) {
            var on = _psTbl.sort === id;
            return '<th onclick="window._psTblSort(\'' + id + '\')" style="position:sticky; top:0; z-index:20; cursor:pointer; user-select:none; white-space:nowrap; padding:10px 8px; background:#eef6f7; color:#2c5f8a; border-right:1px solid var(--ui-cell-line, #cfe3e5); border-bottom:1px solid var(--ui-cell-line, #cfe3e5); font-size:12.5px; font-weight:600; text-align:center;' + (w ? ' width:' + w + ';' : '') + '" title="' + esc(T('눌러서 정렬 (오름↔내림)', 'Click to sort (asc/desc)')) + '">' +
                   (pre ? '<span style="display:inline-flex; align-items:center; gap:4px;">' + pre + esc(label) + (on ? window._uiSortMark(_psTbl.dir > 0) : '') + '</span>' : esc(label) + (on ? window._uiSortMark(_psTbl.dir > 0) : '')) + '</th>';
        };
        var td = 'padding:6px 8px; border-right:1px solid var(--ui-cell-line, #cfe3e5); border-bottom:1px solid var(--ui-cell-line, #cfe3e5); vertical-align:top; font-size:12.5px;';
        // 🦓 [2026-11-24] 다른 페이지와 같은 흰색 + 팔레트 제브라 — 색은 **tr** 에(td 에 칠하면
        //    근거에서 돌아올 때 tr 에 거는 노란 깜빡임(flash)이 가려진다). 색은 styles.css / js/21.
        var body = rows.map(function (r, vi) {
            var c = catOf(r.cat);
            var ai = all.indexOf(r);   // 돌아올 자리 — 정렬·필터가 바뀌어도 같은 행을 가리키게 원본 순번
            return '<tr id="ps-row-' + ai + '"' + (vi % 2 || rowPinned(r) ? ' class="' + (vi % 2 ? 'ps-zebra-b ' : '') + (rowPinned(r) ? 'rp-on' : '') + '"' : '') + ' style="transition:background .4s;">' +
                '<td class="rp-cell rp-pad" style="' + td + ' white-space:nowrap;">' + pinBtnHtml(resolveGanttRows(r).rows, 'window._psPinRow(' + ai + ')') + '<span style="padding:1px 7px; border-radius:9px; font-size:11px; font-weight:bold; color:' + c.color + '; background:' + c.bg + ';">' + esc(catName(r.cat)) + '</span></td>' +
                '<td style="' + td + '" title="' + esc(r.projects.join('\n')) + '">' + (r.common ? '<span style="padding:1px 6px; border-radius:8px; background:#fff3bf; color:#8f5a00; font-size:11px; font-weight:bold;">🔗 ' + esc(rowProj(r)) + '</span>' : esc(r.projects[0] || '')) + '</td>' +
                '<td style="' + td + '">' + whoCellHtml(r, ai) + '</td>' +
                '<td class="' + dateCls(r.date) + '" style="' + td + ' white-space:nowrap; color:#555;">' + esc(r.date || '') + '</td>' +
                '<td style="' + td + ' color:#222;">' + esc(r.text) + '</td>' +
                '<td style="' + td + ' font-size:11px;">' + uniqRefs(r.refs).map(function (x) { return refHtml(x, r.common, ai); }).join(r.common ? '<br>' : ' ') + '</td></tr>';
        }).join('');
        findSync(rows.length, all.length);   // 🔍 헤더 찾기 버튼의 개수·입력칸을 지금 표와 맞춘다
        if (!rows.length) body = '<tr><td colspan="6" style="' + td + ' text-align:center; color:#999; padding:24px 10px;">' + esc(all.length ? T('조건에 맞는 행이 없습니다', 'No rows match') : T('근거 있는 항목이 없었습니다 — 아래 사실 목록을 보세요', 'No grounded items')) + '</td></tr>';
        // ⭕ [2026-11-24] 모서리 둥글게 — sticky 머리글이라 overflow:hidden 상자로 못 감싼다 → 표·모서리 칸에 R(.ui-round-tbl)
        return '<table class="ui-round-tbl" style="width:100%; border-collapse:separate; border-spacing:0; border-left:1px solid var(--ui-cell-line, #cfe3e5); border-top:1px solid var(--ui-cell-line, #cfe3e5); table-layout:auto; background:#fff;"><thead><tr>' +
            th('cat', T('분류', 'Type'), '74px', window._rr.headHtml([].concat.apply([], rows.map(function (r) { return resolveGanttRows(r).rows; })))) + th('proj', T('프로젝트', 'Project'), '') + th('who', T('업무 담당자', 'Assignee'), '') + th('date', T('날짜', 'Date'), '82px') + th('text', T('내용', 'Content'), '46%') +
            '<th style="position:sticky; top:0; z-index:20; padding:10px 8px; background:#eef6f7; color:#2c5f8a; border-right:1px solid var(--ui-cell-line, #cfe3e5); border-bottom:1px solid var(--ui-cell-line, #cfe3e5); font-size:12.5px; font-weight:600; text-align:center; white-space:nowrap;">' + esc(T('근거', 'Source')) + '</th>' +
            '</tr></thead><tbody>' + body + '</tbody></table>' +
            '<div style="font-size:11px; color:#888; margin-top:4px;">' + esc(T(rows.length + ' / ' + all.length + '행', rows.length + ' / ' + all.length + ' rows')) + '</div>';
    }
    function aiSectionHtml() {
        var s = _psLast && _psLast.shown;
        if (!s) {
            // 🧹 [2026-11-23 사용자 요청] 안내문은 지웠다 — 보관함 고르기만 남긴다.
            var nPinF = ((_psLast && _psLast.col && _psLast.col.facts) || []).filter(factPinned).length;
            return '<div style="display:flex; justify-content:flex-end; align-items:center; gap:6px; margin-bottom:6px;">' + pinFilterHtml(nPinF) + archiveSelectHtml() + '</div>';
        }
        var all = s.rows;
        var cnt = {}; all.forEach(function (r) { cnt[r.cat] = (cnt[r.cat] || 0) + 1; });
        var chips = P.summaryCats.map(function (c) {
            var on = !!_psTbl.cats[c.id];
            return '<button onclick="window._psTblSet({toggleCat:\'' + c.id + '\'})" style="' + window._uiPillStyle(on, { color: c.color, bg: c.bg }) + '">' + esc(catName(c.id)) + ' ' + (cnt[c.id] || 0) + '</button>';
        }).join('');
        var nCommon = all.filter(function (r) { return r.common; }).length;
        var projs = uniq([].concat.apply([], all.map(function (r) { return r.projects; }))).sort();
        var people = uniq([].concat.apply([], all.map(function (r) { return peopleOf(r); }))).sort();
        var opt = function (list, cur, allLabel) { return '<option value="">' + esc(allLabel) + '</option>' + list.map(function (v) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); };
        var selS = function (on) { return window._uiSelectStyle(!!on) + ' max-width:150px;'; };   // 고르면 켜진 표시(다른 필터 상자와 같게)
        var smallBtn = window._uiBtnStyle();
        var meta = '';   // 🗜 [2026-11-26] 요약 정보는 기간 제목 줄 한 줄로 옮겼다(summaryMetaHtml)
        // 📚 보관본 안내는 기간 제목 줄로 옮겼다(archivePillHtml).
        var banner = '';
        var _oldBanner = false
            ? '<div style="padding:5px 10px; margin-bottom:6px; background:#fff9db; border:1px solid #ffe066; border-radius:6px; font-size:11.5px; color:#8f5a00;">📚 ' +
              esc(T('보관본을 보는 중: ', 'Viewing archived: ') + (s.archiveView.label || '') + ([s.archiveView.filter && s.archiveView.filter.pm, s.archiveView.filter && s.archiveView.filter.proj, s.archiveView.filter && s.archiveView.filter.who].filter(Boolean).length ? ' · ' + [s.archiveView.filter.pm, s.archiveView.filter.proj, s.archiveView.filter.who].filter(Boolean).join(' / ') : '')) +
              ' <button onclick="window._psCloseArchive()" style="' + smallBtn + ' margin-left:6px;">✕ ' + esc(T('현재 조건으로', 'Back to current')) + '</button></div>'
            : '';
        // ✏️ [2026-11-23 신고 "담당자 칸이 안 바뀐다" — 실측: 새로고침 뒤라 **열린 프로젝트가 없었다**]
        //    편집은 열린 프로젝트 행만 된다(안전장치). 막혀 있는 이유와 여는 버튼을 같이 보여 준다.
        {
            var openNow = (_psLast && _psLast.openName) || '';
            var closed = uniq([].concat.apply([], all.map(function (r) { return localRefs(r).length ? [] : uniqRefs(r.refs).map(function (x) { return x.p; }); })));
            if (_psLast) _psLast.closed = closed;   // 버튼은 이름 대신 순번을 넘긴다(이름에 따옴표·> 가 들어 있다)
            // 🧹 [2026-11-26 사용자 요청] "프로젝트를 열어야 바꿀 수 있다" 안내 띠는 지웠다 — 담당자 칸을 누르면 그 프로젝트를 연다(_psOpenProjectName).
        }
        var isBrief = _psTbl.view !== 'rows';
        var tg = function (label, on, call) { return '<button onclick="window._psTblSet(' + call + ')" style="' + window._uiPillStyle(on) + '">' + esc(label) + '</button>'; };
        var viewBar = tg(T('📋 회의 브리핑', '📋 Briefing'), isBrief, "{view:'brief'}") + tg(T('📊 행 목록', '📊 Rows'), !isBrief, "{view:'rows'}") +
            (isBrief ? '<span style="display:inline-block; width:1px; height:16px; background:#cfd8e3; margin:0 4px;"></span>' +
                tg(T('프로젝트별', 'By project'), _psTbl.by !== 'who', "{by:'proj'}") + tg(T('담당자별', 'By person'), _psTbl.by === 'who', "{by:'who'}") +
                tg(T('🔎 크게', '🔎 Large'), !!_psTbl.big, '{big:' + (!_psTbl.big) + '}') : '') +
            '<span style="display:inline-block; width:1px; height:16px; background:#cfd8e3; margin:0 4px;"></span>';
        return banner +
            '<div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-bottom:5px;">' + viewBar + (isBrief ? '' : chips) +
            (nCommon ? '<label style="font-size:11px; color:#8f5a00; display:inline-flex; align-items:center; gap:2px; cursor:pointer; margin-left:2px;"><input type="checkbox"' + (_psTbl.common ? ' checked' : '') + ' onchange="window._psTblSet({common:this.checked})">🔗 ' + esc(T('공통 이슈만', 'Common only')) + ' ' + nCommon + '</label>' : '') +
            pinFilterHtml(all.filter(rowPinned).length) +
            '<select onchange="window._psTblSet({proj:this.value})" title="' + esc(T('프로젝트', 'Project')) + '" style="' + selS(_psTbl.proj) + '">' + opt(projs, _psTbl.proj, T('프로젝트 전체', 'All projects')) + '</select>' +
            '<select onchange="window._psTblSet({who:this.value})" title="' + esc(T('업무 담당자', 'Assignee')) + '" style="' + selS(_psTbl.who) + '">' + opt(people, _psTbl.who, T('담당자 전체', 'All assignees')) + '</select>' +
            '<button onclick="window._psTblSet({reset:1})" title="' + esc(T('표 필터·정렬 초기화', 'Reset table filters')) + '" style="' + window._uiBtnStyle('danger') + '">↺</button>' +
            '<span style="flex:1;"></span>' +
            (s.archiveView ? '' : '<button onclick="window._psRegenerate()" style="' + smallBtn + '" title="' + esc(T('보관본을 두고 AI 로 새로 만든다', 'Generate again with AI')) + '">🔄 ' + esc(T('새로 생성', 'Regenerate')) + '</button>') +
            archiveSelectHtml() +
            '</div>';
    }
    /** 🗜 [2026-11-26 사용자 요청 "안내문 중복을 줄이고 1줄로"] AI 요약 정보 — 기간 제목 줄(📅 … · 메일 N건) 뒤에 이어 붙인다.
     *  옛 줄은 "🤖 사실 20건만으로 · 시각 · 사람 · ♻️ 보관본 재사용 (AI 0회) · ⚠️ 그 뒤 사실이 20→25건으로 바뀜 — 🔄 새로 생성하면 반영" 으로
     *  메일 건수와 겹치고 길었다 → 짧은 말 + 자세한 뜻은 말풍선(title). */
    function summaryMetaHtml(s) {
        if (!s) return '';
        var at = String(s.at || '').replace('T', ' ').slice(5, 16);   // 11-26 04:38
        var tip = T('AI 요약: 사실 ' + (s.factCount || 0) + '건으로 만듦 · ' + String(s.at || '').replace('T', ' ').slice(0, 16) + (s.by ? ' · ' + s.by : '') +
                    (s.dropped ? ' · 근거 없는 항목 ' + s.dropped + '개 제거' : '') + (s.reused ? ' · 보관본 재사용(AI 0회)' : ''),
                    'AI summary from ' + (s.factCount || 0) + ' facts · ' + String(s.at || '').replace('T', ' ').slice(0, 16));
        var parts = ['🤖 ' + esc(T('요약 ', 'Summary ') + at) + (s.by ? ' ' + esc(s.by) : '')];
        if (s.reused) parts.push('<span style="color:#2f9e44;">♻️ ' + esc(T('보관본', 'archived')) + '</span>');
        if (s.dropped) parts.push(esc(T('근거 없음 ' + s.dropped + ' 제거', s.dropped + ' ungrounded')));
        var warn = [];
        if ((s.pv || 0) < P.promptVer) warn.push(T('옛 형식', 'old format'));
        if (s.stale) warn.push(T('사실 ' + s.stale.from + '→' + s.stale.to + '건', 'facts ' + s.stale.from + '→' + s.stale.to));
        if (warn.length) parts.push('<b style="color:#c77700;" title="' + esc(T('🔄 새로 생성하면 반영됩니다', 'Regenerate to include')) + '">⚠️ ' + esc(warn.join(' · ')) + ' — 🔄 ' + esc(T('새로 생성', 'regenerate')) + '</b>');
        return ' · <span title="' + esc(tip) + '">' + parts.join(' · ') + '</span>';
    }
    /** 📚 보관본을 보는 중이면 기간 제목 줄 오른쪽에 작은 띠(칩과 같은 높이). */
    function archivePillHtml() {
        var v = _psView;
        if (!v) return '';
        var f = v.filter || {};
        var cond = [f.pm, f.proj, f.who].filter(Boolean).join(' / ');
        return '<span style="display:inline-flex; align-items:center; gap:6px; height:22px; box-sizing:border-box; padding:0 3px 0 10px; border:1px solid #ffe066; background:#fff9db; border-radius:11px; font-size:11px; color:#8f5a00; white-space:nowrap; max-width:100%; overflow:hidden;" title="' + esc((v.label || '') + (cond ? ' · ' + cond : '')) + '">📚 ' +
            esc(T('보관본: ', 'Archived: ') + (v.label || '') + (cond ? ' · ' + cond : '')) +
            '<button onclick="window._psCloseArchive()" style="' + window._uiBtnStyle() + ' height:18px; line-height:16px; padding:0 8px;">✕ ' + esc(T('현재 조건으로', 'Back to current')) + '</button></span>';
    }
    function archiveSelectHtml() {
        return '<select id="ps-arch-sel" onchange="if(this.value) window._psOpenArchive(this.value)" title="' + esc(T('보관된 AI 요약 — 골라서 다시 보기(AI 0회)', 'Archived summaries')) + '" style="' + window._uiSelectStyle(false) + ' max-width:180px; background:#fffbea; border-color:#e0c97a;' + '"><option value="">📚 ' + esc(T('보관함', 'Archive')) + '</option></select>';
    }
    function fillArchiveSelect() {
        var fill = function (names) {
            var el = document.getElementById('ps-arch-sel');
            if (!el) return;
            var cur = _psView && _psView.name;
            el.innerHTML = '<option value="">📚 ' + esc(T('보관함', 'Archive')) + ' (' + names.length + ')</option>' + names.slice(0, 60).map(function (n) {
                var p = window._psArchiveParseName(n);
                return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(p ? p.at + ' · ' + p.title : n) + '</option>';
            }).join('');
        };
        if (_psArch.names) fill(_psArch.names);
        window._psArchiveList().then(fill).catch(function () { /* 보관함을 못 읽어도 화면은 그대로 */ });
    }
    function rerenderAi() {
        var sec = document.getElementById('ps-ai-sec');
        if (sec) { sec.innerHTML = aiSectionHtml(); fillArchiveSelect(); }
        var t = document.getElementById('ps-ai-tbl'); if (t) t.innerHTML = tableHtml();
        syncHeadH();
    }
    /** 표 머리글이 고정 머리 **바로 아래**에 붙게 그 높이를 알려 준다(칩 줄이 접혀 높이가 바뀔 수 있다). */
    function syncHeadH() {
        return;   // 표가 자기 스크롤 상자(#ps-scroll) 안에 있어 머리글은 top:0 — 잴 것이 없다(아래는 옛 방식, 안 쓴다)
        var st = document.getElementById('ps-sticky');
        if (!st || !st.parentNode) return;
        st.parentNode.style.setProperty('--ps-head-h', Math.max(0, st.offsetHeight - 12) + 'px');
        // 🐛 [2026-11-23 "헤더가 움직인다"] 한 번 재고 끝내면 창 폭·줄바꿈·늦게 들어온 글(JIRA 확인 중 등)로 높이가 바뀔 때
        //    표 머리글과 틈이 생기거나 겹쳤다 → 높이가 바뀔 때마다 다시 잰다(요소가 새로 그려지면 새로 붙는다).
        if (window.ResizeObserver && !st._psRO) { st._psRO = new ResizeObserver(function () { syncHeadH(); }); st._psRO.observe(st); }
    }
    window._psTblSort = function (col) {
        if (_psTbl.sort === col) _psTbl.dir = -_psTbl.dir; else { _psTbl.sort = col; _psTbl.dir = (col === 'date') ? -1 : 1; }
        var t = document.getElementById('ps-ai-tbl'); if (t) t.innerHTML = tableHtml();
    };
    // 🔍 [2026-11-25 "기간·검색 통합"] 표 찾기를 **헤더의 🔍 버튼 하나**로 — 주간 보고(js/20)·일일 보고·캘린더와 같은 공용 위젯(js/22b `_hdrFindWidget`).
    //    예전엔 표 위 줄에 입력칸이 따로 있었다(2026-11-24 "검색 UI 를 헤더로" 규칙에서 빠져 있던 곳).
    //    ⚠️ 이건 **화면만 거르는** 찾기다. 표 위 줄의 `업무 검색`(#ps-q, Enter)은 **요약 범위를 바꾸는 조건**(AI 요약 캐시 열쇠에 들어간다)이라 그대로 둔다.
    var _psFind = null;
    function findEnsure() {
        if (_psFind) return _psFind;
        var tab = document.getElementById('tab-psummary');
        var hdr = tab ? tab.querySelector('.concept-header-box') : null;
        if (!hdr || !window._hdrFindWidget) return null;
        var en = window._currentLang === 'en';
        _psFind = window._hdrFindWidget({ inputId: 'ps-tbl-q', countId: 'ps-tbl-count', dates: true,
            ko: '🔍 찾기 — 내용·프로젝트·담당자…', en: '🔍 Find — content, project, assignee…',
            inputTitle: en ? 'Filters the table on screen only (the summary itself is not regenerated)' : '표만 화면에서 거릅니다 — 요약은 다시 만들지 않습니다' });
        window._hdrFindMount(hdr, _psFind.el);
        _psFind.input.addEventListener('input', function () { window._psTblSearch(_psFind.input.value); });
        _psFind.input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && _psFind.input.value) { _psFind.input.value = ''; window._psTblSearch(''); _psFind.sync(); } });
        return _psFind;
    }
    /** 표가 다시 그려질 때 — 개수 표시 + (초기화 ↺ 등으로) 표의 찾기어가 바뀐 경우 입력칸도 같이 비운다. */
    function findSync(n, total) {
        var f = findEnsure(); if (!f) return;
        if (document.activeElement !== f.input && f.input.value !== _psTbl.q) f.input.value = _psTbl.q;
        var on = !!String(_psTbl.q || '').trim();
        f.count.textContent = on ? (n + ' / ' + total + (window._currentLang === 'en' ? '' : '건')) : '';
        f.sync();
    }
    window._psTblSearch = function (v) {
        _psTbl.q = String(v || '');
        var t = document.getElementById('ps-ai-tbl'); if (t) t.innerHTML = tableHtml();   // 입력칸은 그대로 둔다(포커스 유지)
    };
    window._psTblSet = function (patch) {
        patch = patch || {};
        if (patch.reset) _psTbl = { sort: 'cat', dir: 1, cats: {}, proj: '', who: '', q: '', common: false, pinned: false, view: _psTbl.view, by: _psTbl.by, big: _psTbl.big, showDone: false };   // 보기 방식은 필터가 아니라 유지
        if (patch.toggleCat) _psTbl.cats[patch.toggleCat] = !_psTbl.cats[patch.toggleCat];
        ['proj', 'who', 'common', 'pinned', 'view', 'by', 'big', 'showDone'].forEach(function (k) { if (k in patch) _psTbl[k] = patch[k]; });
        // 📌 핀셋만 / 초기화는 아래 사실 카드도 거르므로 전체를 다시 그린다.
        if (('pinned' in patch || 'showDone' in patch || patch.reset) && window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
        else rerenderAi();
    };
    // 🎯 [2026-11-23 사용자 요청] 근거 → 그 사실 카드로 이동(상세·📧 원문) → 카드를 누르면 표의 그 행으로 돌아온다.
    var _psBackRow = null;
    // ✨ [2026-11-26 사용자 요청 "너무 빨리 사라진다 — 유지했다가 다른 곳을 누르거나 돌아가면 사라지게"]
    //    세 번 깜빡인 뒤 **켜진 채로 둔다**. 지우는 건 ① 다른 곳을 누를 때(그 칸 안을 누르면 유지 — 돌아가기 단추가 거기 있다)
    //    ② 다른 칸이 하이라이트될 때(돌아가기) — 한 번에 하나만.
    var _psHold = null;
    function unflash() {
        var el = _psHold; _psHold = null;
        if (el) { el.style.background = ''; el.style.boxShadow = ''; }
    }
    function flash(el, color) {
        if (!el) return;
        unflash();
        _psHold = el;
        el.style.background = color; el.style.boxShadow = '0 0 0 2px #1971c2';
        try { el.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 500, iterations: 3 }); } catch (e) { /* 애니메이션 없는 브라우저 — 색은 남는다 */ }
    }
    document.addEventListener('mousedown', function (ev) {
        if (_psHold && !(ev.target && _psHold.contains(ev.target))) unflash();
    }, true);
    window._psGoFact = function (key, rowI) {
        var det = document.getElementById('ps-facts-det');
        if (det) det.open = true;
        var el = document.getElementById('ps-fact-' + key);
        // 🔗≈ 접힌 묶음 안의 행이면 펼친 뒤 다시 찾는다(펼치면 표가 다시 그려진다)
        if (!el && window._fdup.reveal('ps-facts', function (f) { return factKey(f) === key; })) el = document.getElementById('ps-fact-' + key);
        if (!el) {
            if (window.showToast) window.showToast(T('이 근거는 지금 조건의 사실 목록에 없습니다(보관본이 다른 조건으로 만들어졌거나 그 사이 바뀜).', 'This source is not in the current fact list.'), 'info');
            return;
        }
        _psBackRow = rowI;
        var old = document.getElementById('ps-back-hint'); if (old) old.remove();
        // 표 행(TR) 안에 div 를 바로 넣을 수 없다 → 내용 칸(td)에 넣는다
        var host = el.tagName === 'TR' ? (el.querySelector('[data-ft-main]') || el.lastElementChild).parentNode : el;
        host.insertAdjacentHTML('afterbegin', '<div id="ps-back-hint" style="float:right; font-size:10.5px; color:#1971c2; cursor:pointer;">↩ ' + esc(T('누르면 표로 돌아갑니다', 'Click to go back')) + '</div>');
        el.style.cursor = 'pointer';
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(el, '#e7f5ff');
    };
    window._psFactBack = function (ev) {
        if (_psBackRow == null) return;
        var t = ev && ev.target;
        if (t && t.closest && t.closest('button, a, select, input, textarea') && !t.closest('#ps-back-hint')) return;   // 카드 안 단추(원문·간트)는 그대로
        var row = document.getElementById('ps-row-' + _psBackRow);
        _psBackRow = null;
        var hint = document.getElementById('ps-back-hint'); if (hint) { var card = hint.closest('[id^="ps-fact-"]'); hint.remove(); if (card) card.style.cursor = ''; }
        if (!row) return;
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(row, '#fff3bf');
    };
    window._psShowMail = function (key) {
        var f = _psLast && _psLast.factByKey && _psLast.factByKey[key];
        if (f && f.mailRaw && window.showMailRawModal) window.showMailRawModal(f.mailRaw);
        else if (window.showToast) window.showToast(T('메일 원문이 없습니다', 'No mail source'), 'info');
    };
    /** 📂 그 프로젝트를 앱의 평소 열기 경로(executeLoadFile)로 연다 — 열리면 표가 다시 그려져 담당자 칸이 고르기 상자가 된다. */
    window._psOpenProject = function (pi) { return openProjectByName(_psLast && _psLast.closed && _psLast.closed[pi]); };
    window._psOpenProjectName = function (oi) { return openProjectByName(_psOpenNames[oi]); };
    var _psOpening = false;
    async function openProjectByName(name) {
        if (!name || _psOpening) return;   // 두 번 눌러도 한 번만 연다
        _psOpening = true;
        try {
            var files = (typeof window._listProjectFiles === 'function') ? await window._listProjectFiles() : [];
            var f = (files || []).filter(function (x) { return String(x.name || '').replace(/\.json$/i, '') === name; })[0];
            if (!f) {
                var e = ((_psOther && _psOther.entries) || []).filter(function (x) { return String(x.file_name || '').replace(/\.json$/i, '') === name; })[0];
                if (e) f = { id: e.drive_file_id, name: e.file_name };
            }
            if (!f || typeof window.executeLoadFile !== 'function') throw new Error(T('프로젝트 파일을 찾지 못했습니다: ', 'Project not found: ') + name);
            if (window.showToast) window.showToast(T('📂 ' + name + ' 여는 중…', 'Opening ' + name + '…'), 'info');
            // 보던 표를 기억해 둔다 — 열면 그 프로젝트 행·JIRA 가 더해져 조건(사실 수)이 달라지고, 같은 요약이 사라져
            //    다시 AI 를 불러야 했다. 근거는 프로젝트#행 열쇠라 열고 나서도 그대로 맞물린다.
            var keepShown = _psLast && _psLast.shown, keepKind = _psLast && _psLast.kind;
            await window.executeLoadFile(f.id, f.name, true);
            if (keepShown && !keepShown.archiveView && keepKind && keepKind === mode()) {
                var sigNow = window._psCollectFacts(keepKind).sig;
                var have = ((window.projectMeta || {}).aiPeriodSummary || {})[keepKind];
                if (!have || have.rangeKey !== sigNow) {
                    adoptRec(keepKind, { sig: sigNow, at: keepShown.at, by: keepShown.by, factCount: keepShown.factCount, rows: keepShown.rows, dropped: keepShown.dropped, _reused: true });
                }
            }
            var m = document.getElementById('ai-summary-modal');
            if ((pageActive() || (m && m.style.display !== 'none')) && window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
        } catch (err) {
            if (window.showToast) window.showToast('⚠️ ' + (err && err.message || err), 'error');
        } finally { _psOpening = false; }
    }
    window._psRegenerate = function () {
        return window.generatePeriodSummary(mode(), { force: true });
    };
    window._psOpenArchive = async function (name) {
        try {
            var rec = await window._psArchiveGet(name);
            if (!rec || !Array.isArray(rec.rows)) throw new Error(T('보관본을 읽지 못했습니다', 'Could not read the archive'));
            rec.name = rec.name || name;
            _psView = rec;
            if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
        } catch (e) {
            if (window.showToast) window.showToast('⚠️ ' + (e && e.message || e), 'error');
        }
    };
    window._psCloseArchive = function () {
        _psView = null;
        if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
    };
    /** 📗 지금 보이는 행(필터·정렬 그대로)을 엑셀로 — 회의 자료로 바로 쓰게 머리글 고정·자동 필터·줄바꿈. */
    window._psTblExcel = function () {
        var X = window.XLSX;
        if (!X) { alert(T('엑셀 라이브러리를 불러오지 못했습니다.', 'Excel library not loaded.')); return; }
        if (!(_psLast && _psLast.shown && _psLast.shown.rows && _psLast.shown.rows.length)) {   // 헤더 버튼이라 표가 없을 때도 눌린다
            if (window.showToast) window.showToast(T('먼저 🤖 AI 요약 생성으로 표를 만드세요(같은 조건의 보관본이 있으면 AI 없이 바로 나옵니다).', 'Generate the summary table first.'), 'info');
            return;
        }
        var rows = viewRows();
        var head = [T('분류', 'Type'), T('프로젝트', 'Project'), T('업무 담당자', 'Assignee'), T('날짜', 'Date'), T('내용', 'Content'), T('근거', 'Source')];
        var aoa = [[(_psLast && _psLast.label) || ''], head].concat(rows.map(function (r) {
            return [catName(r.cat), r.common ? T('공통', 'Common') + ': ' + r.projects.join(', ') : (r.projects[0] || ''), peopleOf(r).join(', ') || rolesOf(r).join(', '), r.date || '', r.text,
                    uniqRefs(r.refs).map(function (x) { return (x.p ? x.p + ' ' : '') + '#' + (x.row != null ? x.row : x.g) + (x.task ? ' ' + x.task : ''); }).join('\n')];
        }));
        var ws = X.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 10 }, { wch: 26 }, { wch: 16 }, { wch: 11 }, { wch: 60 }, { wch: 40 }];
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
        ws['!autofilter'] = { ref: 'A2:F' + Math.max(2, aoa.length) };
        var border = { top: { style: 'thin', color: { rgb: 'C9D3DD' } }, bottom: { style: 'thin', color: { rgb: 'C9D3DD' } }, left: { style: 'thin', color: { rgb: 'C9D3DD' } }, right: { style: 'thin', color: { rgb: 'C9D3DD' } } };
        var catFill = {}; P.summaryCats.forEach(function (c) { catFill[catName(c.id)] = c.bg.replace('#', '').toUpperCase(); });
        for (var R = 0; R < aoa.length; R++) for (var C = 0; C < 6; C++) {
            var ref = X.utils.encode_cell({ r: R, c: C });
            if (!ws[ref]) ws[ref] = { t: 's', v: '' };
            if (R === 0) ws[ref].s = { font: { bold: true, sz: 13, color: { rgb: '2C5F8A' } } };
            else if (R === 1) ws[ref].s = { font: { bold: true, color: { rgb: '2C5F8A' } }, fill: { fgColor: { rgb: 'E7EFF8' } }, border: border, alignment: { vertical: 'center' } };
            else ws[ref].s = { border: border, alignment: { vertical: 'top', wrapText: true }, fill: (C === 0 && catFill[aoa[R][0]]) ? { fgColor: { rgb: catFill[aoa[R][0]] } } : undefined };
        }
        var wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, T('AI 요약', 'AI summary'));
        var name = (T('AI요약_', 'AI_summary_') + ((_psLast && _psLast.label) || '')).replace(/[\\/:*?"<>|\s]+/g, '_') + '.xlsx';
        X.writeFile(wb, name);
    };
    /**
     * ✏️ 프롬프트 · 📊 PPT 는 **'일정 현황' 리포트 전용**이다.
     * ⚠️ 기간 모드에서 눌러도 `projectMeta.aiSummaryReport`(옛 리포트)를 보므로 "먼저 리포트를
     *    만들어주세요" 같은 엉뚱한 소리만 한다 — 눌러서 아무 일도 안 나는 버튼은 없느니만 못하다.
     *    🖨️ PDF 는 `#ai-summary-report-content` 를 찍으므로 기간 모드에서도 멀쩡하다 → 남긴다.
     */
    function paintModeOnlyButtons(cur) {
        var show = (cur === P.legacyId);
        var p = document.getElementById('ai-summary-open-prompt-btn');
        if (p) p.style.display = show ? '' : 'none';
        var ppt = document.querySelector('#ai-summary-modal [onclick*="exportAiProjectSummaryPPT"]');
        if (ppt) ppt.style.display = show ? '' : 'none';
    }

    /** 🗂 지금 보이는 곳의 생성 버튼 — 프로젝트 요약 페이지가 열려 있으면 그 버튼, 아니면 옛 모달 버튼. */
    function genBtn() { return (pageActive() && document.getElementById('ps-page-gen-btn')) || document.getElementById('ai-summary-generate-btn'); }
    function pageActive() { var t = document.getElementById('tab-psummary'); return !!(t && t.classList.contains('active')); }
    function setGenerateLabel(cur) {
        var btn = genBtn();
        if (!btn || btn.disabled) return;
        btn.textContent = cur === P.legacyId ? T('🔄 다시 생성', '🔄 Regenerate') : T('🤖 AI 요약 생성', '🤖 Generate AI summary');
    }

    function wrapRender() {
        var orig = window._renderAiProjectSummaryBody;
        if (typeof orig !== 'function' || orig._psWrapped) return false;
        window._renderAiProjectSummaryBody = function () {
            // 🗂 [2026-11-23] 프로젝트 요약 **페이지**가 열려 있으면 거기에 그린다. 같은 화면이 두 군데 있으면
            //    내부 id(ps-*)가 겹쳐 엉뚱한 쪽을 집으므로, 페이지가 주인일 땐 모달 쪽은 비운다.
            var page = pageActive() ? document.getElementById('psummary-page') : null;
            var body = page || document.getElementById('ai-summary-body');
            var cur = mode();
            if (page) {
                var mb = document.getElementById('ai-summary-body'); if (mb && mb.innerHTML) mb.innerHTML = '';
                var mm = document.getElementById('ai-summary-modal'); if (mm) mm.style.display = 'none';
                if (cur === P.legacyId) cur = P.defaultMode;
                try { renderPeriod(page, cur); setGenerateLabel(cur); } catch (e) { console.warn('[프로젝트 요약] 렌더 실패:', e && e.message); page.innerHTML = '<div style="padding:20px; color:#b1432f;">⚠️ ' + esc(String(e && e.message || e)) + '</div>'; }
                return;
            }
            // 페이지도 모달도 안 보이면 그리지 않는다(뒤에서 도는 훑기가 숨은 모달에 같은 id 화면을 또 만들지 않게).
            var mmv = document.getElementById('ai-summary-modal');
            if (document.getElementById('tab-psummary') && (!mmv || mmv.style.display === 'none' || !mmv.style.display) && !P.showLegacy) return;
            if (!body) return orig.apply(this, arguments);
            paintModeOnlyButtons(cur);
            if (cur !== P.legacyId) { try { renderPeriod(body, cur); setGenerateLabel(cur); return; } catch (e) { console.warn('[기간 요약] 렌더 실패 — 일정 현황으로:', e.message); } }
            var r = orig.apply(this, arguments);
            // 숫자 네 칸 숨기기 + 모드 툴바
            try {
                if (P.showCounts === false) {
                    body.querySelectorAll('#ai-summary-report-content > div').forEach(function (d) {
                        if (/repeat\(4,\s*1fr\)/.test(d.getAttribute('style') || '')) d.remove();
                    });
                }
                body.insertAdjacentHTML('afterbegin', toolbarHtml(P.legacyId, null));
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
                // ⚠️ [2026-11-21] 저장은 `col.sig`, 비교는 `col.range.key` 였다 — 둘이 같을 수 없어 문답 "주간 요약" 마다 AI 를 새로 불렀다(무료 키 하루 한도)
                if (col.facts.length && window.getActiveAiKey && window.getActiveAiKey() && !(cache && cache.rangeKey === col.sig)) {
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
    /** 🗂 탭 진입(js/23 switchTab) — 다시 그린다. */
    window._psOnTabShown = function () {
        findEnsure();
        if (window._renderAiProjectSummaryBody) window._renderAiProjectSummaryBody();
    };
    /** 옛 진입로(🤖 AI 도구 ▸ AI 요약)는 페이지로 보낸다 — 화면이 두 벌이면 id 가 겹친다. 일정 현황(legacy)을 켠 경우만 모달. */
    function wrapOpen() {
        var orig = window.openAiProjectSummaryModal;
        if (typeof orig !== 'function' || orig._psWrapped) return false;
        window.openAiProjectSummaryModal = function () {
            if (!P.showLegacy && document.getElementById('tab-psummary') && typeof window.switchTab === 'function') { window.switchTab('psummary'); return; }
            return orig.apply(this, arguments);
        };
        window.openAiProjectSummaryModal._psWrapped = true;
        return true;
    }
    window._periodSummaryInstall = function () { return { render: wrapRender(), generate: wrapGenerate(), qa: wrapQa(), open: wrapOpen() }; };
    (function install(tries) {
        window._periodSummaryInstall();
        var done = window._renderAiProjectSummaryBody && window._renderAiProjectSummaryBody._psWrapped && window.generateAiProjectSummary && window.generateAiProjectSummary._psWrapped && window.sendGanttQaMessage && window.sendGanttQaMessage._psWrapped && window.openAiProjectSummaryModal && window.openAiProjectSummaryModal._psWrapped;
        // ⚠️ 마지막 탭 복원(js/23)이 이 파일보다 **먼저** 돌아 프로젝트 요약이 이미 열려 있으면 스스로 그린다(js/59 와 같은 처지).
        if (tries === 0 && pageActive() && window._renderAiProjectSummaryBody && window._renderAiProjectSummaryBody._psWrapped) { try { window._psOnTabShown(); } catch (e) { /* 다음 진입 때 그린다 */ } }
        if (!done && tries < 20 && typeof setTimeout === 'function') setTimeout(function () { install(tries + 1); }, 500);
    })(0);
    try {
        if (window.STORAGE_REGISTRY && !window.STORAGE_REGISTRY.some(function (r) { return r.key === P.modeKey; })) {
            window.STORAGE_REGISTRY.push({ key: P.modeKey, label: 'AI 요약 모달 마지막 모드', labelEn: 'AI summary last mode', cls: 'setting', strategy: { type: 'keep' } });
        }
    } catch (e) { /* 레지스트리 없음 */ }
})();
