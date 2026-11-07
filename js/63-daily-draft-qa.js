/* ============================================================================
   📔 js/63-daily-draft-qa.js — AI 문답 로컬 명령 "오늘 보고 초안" (2026-11-08, docs/ai-expansion-review.md §3-1 ①)

   "폰에서 `/ai 오늘 보고 초안` → 오늘 일일보고 초안을 받고, 고쳐서 접두어 없이 답장하면 저장된다."

   AI 호출 0회. 재료는 전부 js/59 가 이미 만든다:
     `dailyBuildDraft(date)`          — 열린 프로젝트에서 내 업무·오늘 손댄 업무(간트 기준)
     `dailyScanOtherProjects(date)`   — 내가 맡은 **다른** 프로젝트 파일(NAS, 캐시)
     `dailyLoad(date)`                — 이미 적은 오늘 보고
   이 파일은 그 셋을 **텔레그램 서식**(업무 이름 줄 + `한일:`/`할일:`/`막힌일:`)으로 적어
   말풍선 두 개로 내놓는다 — ① 안내(어디서 몇 건, 이미 적은 것) ② **복사해 보낼 글만**.
   ⚠️ 둘을 가르는 이유: 텔레그램 다리(js/60)는 ②를 **따로 한 통**으로 보낸다(`tgSeparate`) —
      한 통에 섞여 가면 사람이 안내문까지 답장에 붙여 보내고, 백엔드는 태그 없는 줄을 전부
      **업무 이름**으로 받는다(`_daily_apply_text`).
   ⚠️ 입구는 js/62 와 같은 자리 — `sendGanttQaMessage` 를 감싼다. 그래서 앱 문답창에서 "보고
      초안 보여줘" 라고 쳐도, 폰에서 `/ai 오늘 보고 초안` 이라고 해도 같은 글이 나온다.
   ⚠️ 다른 프로젝트 훑기는 `scanWaitMs` 까지만 기다린다(실측 12개 2.0초) — 넘으면 그때까지
      모인 것으로 쓰고 **덜 모았다고 적는다**(조용히 빠지면 "원래 없는 것" 과 구분이 안 된다).
   어휘·상한은 `DAILY_DRAFT_QA`(데이터).

   검증: tests/telegram-dist-and-draft.browser.js (진짜 js/59·js/60 입구, 가짜는 NAS·텔레그램 발송·프로젝트 쓰기 경계만)
   ============================================================================ */
(function () {
    'use strict';

    window.DAILY_DRAFT_QA = window.DAILY_DRAFT_QA || {
        // "오늘 보고 초안" · "보고 초안 만들어줘" · "어제 일일 업무 보고 초안 보여줘" · "2026-11-07 보고 초안" · "daily report draft"
        re: /^\s*(?:(오늘|어제|today|yesterday|\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2})\s*(?:의|자)?\s*)?(?:일일\s*)?(?:업무\s*)?(?:보고서?\s*초안|daily\s*(?:report\s*)?draft)(?:\s*(?:을|를)?(?:\s*(?:만들어|보여|뽑아|작성해|써|줘|주세요|해줘|부탁해?|좀|해))*)?\s*$/i,
        maxItems: 15,            // 초안에 담는 업무 상한(폰 한 화면)
        scanWaitMs: 25000,       // 다른 프로젝트 훑기를 이만큼만 기다린다
        includeTouched: true,    // 오늘 손댄 업무(일정과 무관)도 이름만 담는다
        maxLine: 140
    };
    var P = window.DAILY_DRAFT_QA;

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function dateOf(word) {
        var w = String(word || '').trim().toLowerCase();
        if (!w || w === '오늘' || w === 'today') return ymd();
        if (w === '어제' || w === 'yesterday') { var d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); }
        var m = w.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})$/);
        return m ? (m[1] + '-' + pad(m[2]) + '-' + pad(m[3])) : ymd();
    }
    window._dailyDraftDateOf = dateOf;
    function cut(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function withTimeout(p, ms) {
        return Promise.race([p, new Promise(function (r) { setTimeout(function () { r({ timeout: true }); }, ms); })]);
    }
    function pjName(s) { return String(s || '').replace(/\.json$/i, '').trim(); }

    /** 초안 재료를 모은다 — AI 없음. {date, items, touched, saved, partial, errs, info, draft} */
    window.dailyDraftQa = async function (dateStr) {
        var date = dateStr || ymd();
        var out = { date: date, items: [], more: 0, touched: [], saved: null, partial: false, errs: [], info: '', draft: '' };
        if (typeof window.dailyBuildDraft !== 'function') throw new Error(T('일일보고 모듈(js/59)이 없습니다', 'daily-report module (js/59) is missing'));
        var key = window.dailyEnsureIdentity ? await window.dailyEnsureIdentity() : (window._dailyMyKey ? window._dailyMyKey() : '');
        if (!key) throw new Error(T('내 계정을 알 수 없습니다 — 🔑 설정에서 NAS 로그인 후 다시 시도해 주세요.', 'Your account is unknown — log in to the NAS (🔑 settings) and try again.'));
        if (window.dailyLoadRoster) { try { await window.dailyLoadRoster(); } catch (e) { out.errs.push(e.message); } }

        var d = window.dailyBuildDraft(date) || { mine: [], others: [], touched: [] };
        var other = { mine: [], others: [], errs: [] };
        if (typeof window.dailyScanOtherProjects === 'function') {
            try {
                var r = await withTimeout(window.dailyScanOtherProjects(date), P.scanWaitMs);
                if (r && r.timeout) { out.partial = true; other = window._dailyOtherScan || other; }
                else { other = r || other; if (other.busy || (other.total && other.done < other.total)) out.partial = true; }
            } catch (e) { out.errs.push(e.message); }
        }
        var seen = {}, items = [];
        [].concat(d.mine || [], other.mine || []).forEach(function (it) {
            if (!it || !it.name) return;
            var k = it.name + '|' + pjName(it.project);
            if (seen[k]) return;
            seen[k] = 1; items.push(it);
        });
        out.items = items.slice(0, P.maxItems);
        out.more = Math.max(0, items.length - out.items.length);
        if (P.includeTouched) {
            out.touched = (d.touched || []).filter(function (t) { return t && t.name && !seen[t.name + '|' + pjName(t.project)]; });
        }
        if (window.dailyLoad) { try { out.saved = await window.dailyLoad(date); } catch (e) { out.errs.push(e.message); } }
        out.errs = out.errs.concat((other.errs || []).map(String));
        out.info = infoText(out);
        out.draft = draftText(out);
        return out;
    };

    /** ① 안내 — 마크다운(문답창·텔레그램 둘 다 읽힌다) */
    function infoText(o) {
        var L = [];
        L.push('📔 **' + o.date + ' ' + T('보고 초안', 'report draft') + '** — ' + T('간트 기준, AI 없음', 'from the Gantt, no AI'));
        var pjs = {}; o.items.forEach(function (it) { var p = pjName(it.project); if (p) pjs[p] = 1; });
        var pjList = Object.keys(pjs);
        L.push('• ' + T('내 업무 ', 'My tasks: ') + (o.items.length + o.more) + T('건', '') + (pjList.length ? ' — ' + pjList.slice(0, 6).join(', ') + (pjList.length > 6 ? ' …' : '') : ''));
        if (o.touched.length) L.push('• ' + T('오늘 손댄 업무 ', 'Touched today: ') + o.touched.length + T('건', ''));
        var savedItems = (o.saved && o.saved.items) || [];
        if (savedItems.length) {
            L.push('• ' + T('이미 적은 보고 ', 'Already written: ') + savedItems.length + T('건', '') + ' — ' + savedItems.slice(0, 5).map(function (it) { return cut(it.name, 30); }).join(', ') + (savedItems.length > 5 ? ' …' : ''));
        } else {
            L.push('• ' + T('이미 적은 보고: 없음', 'Already written: none'));
        }
        if (o.partial) L.push('⚠️ ' + T('다른 프로젝트 훑기가 끝나기 전 것입니다 — 잠시 뒤 다시 물으면 더 나옵니다.', 'Other projects were still being scanned — ask again shortly for more.'));
        if (o.errs.length) L.push('⚠️ ' + T('못 읽은 것 ', 'Unreadable: ') + o.errs.length + T('건', '') + ': ' + cut(o.errs[0], 80));
        if (!o.items.length && !o.touched.length) {
            L.push('');
            L.push(T('오늘 일정에 걸린 내 업무가 없습니다 — 직접 적어 보내면 됩니다(업무 이름 줄 + `한일:`).', 'No task of yours falls on this date — just write it (task-name line + `한일:`).'));
        } else {
            L.push('');
            L.push('→ ' + T('다음 글을 복사해 고친 뒤 **접두어 없이** 보내면 오늘 보고로 저장됩니다. 빈 칸은 지우거나 채우세요.', 'Copy the next message, edit it, and send it back **without a prefix** to save it as today\'s report.'));
            if (o.date !== ymd()) L.push('⚠️ ' + T('텔레그램 답장은 **오늘** 보고에 들어갑니다 — 다른 날짜는 PC 앱 📔 일일보고에서.', 'A Telegram reply goes into **today\'s** report — use the PC app for other dates.'));
            L.push(T('PC 에선 📔 일일보고 ▸ [간트에서 불러오기] 가 같은 목록입니다.', 'In the app: 📔 Daily report ▸ [Load from Gantt] shows the same list.'));
        }
        return L.join('\n');
    }

    /** ② 복사해 보낼 글 — 백엔드 `_daily_apply_text` 서식 그대로. 안내 문장은 **한 줄도 섞지 않는다**. */
    function draftText(o) {
        var B = [];
        o.items.forEach(function (it) {
            var b = [cut(it.name, P.maxLine)];
            b.push('한일: ' + cut(it.core || '', P.maxLine));
            if (it.todo) b.push('할일: ' + cut(it.todo, P.maxLine));
            if (it.issue) b.push('막힌일: ' + cut(it.issue, P.maxLine));
            B.push(b.join('\n'));
        });
        o.touched.slice(0, Math.max(0, P.maxItems - o.items.length)).forEach(function (t) {
            B.push(cut(t.name, P.maxLine) + '\n한일: ');
        });
        return B.join('\n\n');
    }
    window._dailyDraftTexts = { info: infoText, draft: draftText };

    // ── 입구 — `sendGanttQaMessage` 를 감싼다(js/62 와 같은 자리). 텔레그램 다리도 이 입구를 지난다. ──
    function render() { if (window._renderGanttQaMessages) { try { window._renderGanttQaMessages(); } catch (e) { /* 화면 없음 */ } } }
    function wrapQa() {
        var orig = window.sendGanttQaMessage;
        if (typeof orig !== 'function' || orig._ddWrapped) return false;
        window.sendGanttQaMessage = async function () {
            var input = document.getElementById('gantt-qa-input');
            var q = input ? input.value.trim() : '';
            var m = q.match(P.re);
            if (!m) return orig.apply(this, arguments);
            var H = window._ganttQaHistory = window._ganttQaHistory || [];
            if (window._ganttQaRecordQuestionFreq) { try { window._ganttQaRecordQuestionFreq(q); } catch (e) { /* 무시 */ } }
            input.value = '';
            H.push({ role: 'user', text: q });
            var pend = { role: 'ai', pending: true, text: '⏳ ' + T('간트에서 보고 초안을 모으는 중…', 'Collecting the draft from the Gantt…') };
            H.push(pend); render();
            var res;
            try { res = await window.dailyDraftQa(dateOf(m[1])); }
            catch (e) { res = { info: '⚠️ ' + T('보고 초안 실패: ', 'Draft failed: ') + e.message, draft: '' }; }
            var at = H.indexOf(pend); if (at >= 0) H.splice(at, 1);
            H.push({ role: 'ai', text: res.info, dailyDraft: true });
            // 복사용 글은 **따로 한 말풍선** — 다리가 따로 한 통으로 보낸다(tgSeparate)
            if (res.draft) H.push({ role: 'ai', text: res.draft, tgSeparate: true, dailyDraft: true });
            render();
            if (input) input.focus();
        };
        window.sendGanttQaMessage._ddWrapped = true;
        return true;
    }
    window._dailyDraftQaInstall = wrapQa;
    (function install(tries) {
        if (wrapQa() || tries <= 0) return;
        setTimeout(function () { install(tries - 1); }, 500);
    })(40);
})();
