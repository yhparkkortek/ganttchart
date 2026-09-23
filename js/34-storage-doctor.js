/* ════════════════════════════════════════════════════════════════════
   저장소 닥터 (2026-09-21) — "업무 보관함 저장 공간이 가득 찼습니다"가 계속 뜨는데 🧹 정리 버튼은 "정리할 항목 없음"만 답하던 문제

   원인: 브라우저 localStorage(약 5MB)는 앱의 모든 기능이 함께 쓴다. 그런데 정리 버튼은 업무 보관함 항목만 봤고,
   실제로 공간을 차지하는 건 AI 학습 로그(프로젝트별 200건 × 프로젝트 수 무제한)·문답 피드백·메일 큐 같은 다른 키일 수 있어서
   보관함이 깨끗해도 경고가 계속됐다.

   해결(학습·데이터 우선 원칙): 정리 대상을 코드가 아니라 **레지스트리(데이터)**로 선언한다 — 키마다 방법(drop/최근 N건 유지).
   새로 쌓이는 저장소가 생기면 레지스트리에 한 줄 추가(window.STORAGE_REGISTRY.push)하면 된다.
   - 🧹 버튼: 저장소 전체 사용량 + 큰 항목 순위를 보여주고, 정리 가능한 항목을 (줄어드는 크기와 함께) 확인받아 정리한다.
   - 저장 실패 시: 다시 만들 수 있는 캐시(cls:'cache')만 자동으로 비우고 재시도한다(로그류는 사람이 확인한 뒤에만).
   - 어떤 키가 공간을 차지했는지는 Phase 10 이슈 이벤트(storage_report)로 남겨 다음 "이슈 정리"에서 원인을 본다.
   ════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }

    // ── 레지스트리(데이터) ──────────────────────────────────────────────
    // cls: cache(다시 만들 수 있음 — 자동 정리 가능) | log(학습/이력 — 확인 후에만)
    // strategy: {type:'drop'} | {type:'fn', fn:'전역함수명'} | {type:'array', keep, order:'newest-first'|'newest-last'} | {type:'byProject', perProject, maxProjects}
    window.STORAGE_REGISTRY = window.STORAGE_REGISTRY || [
        { key: 'gantt_folder_cache_v1',           label: 'Drive 폴더 캐시',                 labelEn: 'Drive folder cache',      cls: 'cache', strategy: { type: 'drop' } },
        { key: 'gantt_ai_usage_v1',               label: 'AI 사용량 원장(최근 7일, 일일 한도 소진 표시)', labelEn: 'AI usage ledger (7 days)', cls: 'cache', strategy: { type: 'drop' } },
        { key: 'gantt_qa_cluster_cache_v1',       label: '자주 묻는 질문 묶기 캐시',        labelEn: 'FAQ grouping cache',      cls: 'cache', strategy: { type: 'drop' } },
        // 🐛 [2026-09-23 누락 보완] "자주 쓰는 질문" 원본 기록은 프로젝트별로 최대 150건씩 무한 누적되는데
        //    레지스트리에 빠져 있었다 — 저장소가 꽉 차면 이 키 저장이 조용히 실패(_qaFreqSaveStore의 catch)해
        //    "자주 쓰는 질문이 저장이 안 된다"로 이어질 수 있어서, 🧹 정리 대상에 포함시킨다(로그류이므로 확인 후 정리).
        { key: 'gantt_qa_question_freq_v2',       label: '자주 쓰는 질문 기록(프로젝트별)',  labelEn: 'Frequent questions log',  cls: 'log',   strategy: { type: 'byProject', perProject: 60, maxProjects: 30 } },
        { key: 'gantt_ai_learning_v1',            label: 'AI 학습 로그(프로젝트별)',         labelEn: 'AI learning log',         cls: 'log',   strategy: { type: 'byProject', perProject: 60, maxProjects: 30 } },
        { key: 'gantt_qa_feedback',               label: 'AI 문답 피드백(질문·답변 포함)',   labelEn: 'AI Q&A feedback',         cls: 'log',   strategy: { type: 'array', keep: 60, order: 'newest-first' } },
        { key: 'gantt_project_summary_feedback',  label: 'AI 요약 피드백',                   labelEn: 'AI summary feedback',     cls: 'log',   strategy: { type: 'array', keep: 60, order: 'newest-first' } },
        // ⭐ [2026-09-23 신규] 보관함 삭제 묘비 — 기기 간 "지운 건"을 전파하는 기록(uid+시각).
        //    코드 자체가 90일/1000건으로 자체 정리하지만, 그래도 누적되는 키라 레지스트리에 넣어 둔다.
        //    지우면 다른 기기에 남은 항목이 되살아날 수 있으므로 cache가 아니라 log로 두고 오래된 것부터 줄인다.
        { key: 'gantt_task_inbox_deleted',        label: '보관함 삭제 기록(기기 간 동기화용)', labelEn: 'Inbox deletion tombstones', cls: 'log', strategy: { type: 'array', keep: 300, order: 'newest-last' } },
        { key: 'ms_discard_queue',                label: '자동 폐기된 메일 목록',            labelEn: 'Auto-discarded mails',    cls: 'log',   strategy: { type: 'array', keep: 50, order: 'newest-first' } },
        // 메일 서버 검토 큐 — 등록 완료 건의 본문을 줄이고 예산 초과분(오래된 것부터)을 뺀다(js/15b _msSlimQueue). 검토 대기 건 본문은 보존.
        { key: 'ms_pending_queue',                label: '메일 검토 큐(등록 완료 메일 본문 축소)', labelEn: 'Mail review queue (shrink done mails)', cls: 'log', strategy: { type: 'fn', fn: '_msSlimQueue' } }
    ];

    function sizeOf(key) { try { return (localStorage.getItem(key) || '').length; } catch (e) { return 0; } }
    function kb(chars) { return Math.round(chars / 1024); }
    function label(r) { return T(r.label, r.labelEn || r.label); }

    /** 전체 사용량 — 키별 크기(문자 수, 키+값)와 합계. */
    function analyze() {
        var items = [], total = 0;
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i), v = localStorage.getItem(k) || '';
                var n = k.length + v.length; total += n; items.push({ key: k, chars: n });
            }
        } catch (e) { /* ignore */ }
        items.sort(function (a, b) { return b.chars - a.chars; });
        return { total: total, items: items };
    }
    /** 남은 용량 측정 — 임시 키에 크기를 늘려가며 써 본다(버튼/경고 때만 호출). */
    function probeFree() {
        var k = '__storage_probe__', a = 0, b = 1;
        try {
            while (b <= 8 * 1024 * 1024) { localStorage.setItem(k, new Array(b + 1).join('x')); a = b; b *= 2; }
        } catch (e) { /* b에서 실패 */ }
        for (var i = 0; i < 14 && b - a > 1024; i++) {
            var mid = (a + b) >> 1;
            try { localStorage.setItem(k, new Array(mid + 1).join('x')); a = mid; } catch (e) { b = mid; }
        }
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
        return a;
    }

    // ── 정리 계획 ───────────────────────────────────────────────────────
    function newestTs(arr) { var t = ''; (arr || []).forEach(function (x) { var v = x && (x.ts || x.date || x.addedAt || x.at) || ''; if (v > t) t = v; }); return t; }
    /** 전략을 적용했을 때의 새 값(문자열)을 돌려준다. 바꿀 게 없거나 구조가 예상과 다르면 null. */
    function shrunk(raw, st) {
        if (st.type === 'drop') return '';
        var data; try { data = JSON.parse(raw); } catch (e) { return null; }
        if (st.type === 'fn') {   // 데이터 전용 축소 함수(window[fn](배열) → {json}) — 항목 구조를 아는 쪽이 정의한다
            if (!Array.isArray(data) || typeof window[st.fn] !== 'function') return null;
            try { return window[st.fn](data).json; } catch (e) { return null; }
        }
        if (st.type === 'array') {
            if (!Array.isArray(data) || data.length <= st.keep) return null;
            return JSON.stringify(st.order === 'newest-last' ? data.slice(-st.keep) : data.slice(0, st.keep));
        }
        if (st.type === 'byProject') {
            if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
            var keys = Object.keys(data).filter(function (k) { return Array.isArray(data[k]); });
            var changed = false;
            keys.sort(function (a, b) { return newestTs(data[b].slice(0, 3)) < newestTs(data[a].slice(0, 3)) ? -1 : 1; });   // 최근 활동 프로젝트 먼저
            var out = {};
            keys.forEach(function (k, i) {
                if (i >= st.maxProjects) { changed = true; return; }
                var arr = data[k];
                if (arr.length > st.perProject) { arr = arr.slice(0, st.perProject); changed = true; }
                out[k] = arr;
            });
            Object.keys(data).forEach(function (k) { if (!Array.isArray(data[k])) out[k] = data[k]; });
            return changed ? JSON.stringify(out) : null;
        }
        return null;
    }
    function plan(onlyCls) {
        var out = [];
        window.STORAGE_REGISTRY.forEach(function (r) {
            if (onlyCls && r.cls !== onlyCls) return;
            var raw; try { raw = localStorage.getItem(r.key); } catch (e) { return; }
            if (raw == null) return;
            var next = shrunk(raw, r.strategy);
            if (next === null) return;
            var saved = raw.length - next.length;
            if (saved > 0) out.push({ entry: r, before: raw.length, after: next.length, next: next, saved: saved });
        });
        return out.sort(function (a, b) { return b.saved - a.saved; });
    }
    function apply(pl) {
        var freed = 0;
        pl.forEach(function (p) {
            try {
                if (p.entry.strategy.type === 'drop') localStorage.removeItem(p.entry.key); else localStorage.setItem(p.entry.key, p.next);
                freed += p.saved;
            } catch (e) { console.warn('[저장소 닥터] 정리 실패:', p.entry.key, e); }
        });
        return freed;
    }
    /** 저장 실패 시 자동 복구용 — 다시 만들 수 있는 캐시만. */
    window._storageDoctorAuto = function () {
        try { var pl = plan('cache'); return pl.length ? apply(pl) > 0 : false; } catch (e) { return false; }
    };

    // ── 안내 문구 / 이벤트 ───────────────────────────────────────────────
    function topList(an, n) { return an.items.slice(0, n).map(function (x) { return x.key + ' ' + kb(x.chars) + 'KB'; }); }
    /** 업무 보관함 저장 실패 토스트 — 원인(어느 키가 큰지)까지 보여준다. */
    window._storageDoctorWarnText = function () {
        try {
            var an = analyze(), inboxKb = kb(sizeOf('gantt_task_inbox'));
            logReport('storage_full', an);
            return T('⚠️ 브라우저 저장 공간이 가득 찼습니다 (업무 보관함 ' + inboxKb + 'KB · 전체 약 ' + (an.total / 1048576).toFixed(1) + 'MB). 큰 항목: ' + topList(an, 3).join(', ') + '. [업무 보관함] 헤더의 🧹 저장공간 정리 버튼으로 정리해주세요.',
                '⚠️ Browser storage is full (inbox ' + inboxKb + 'KB · total ~' + (an.total / 1048576).toFixed(1) + 'MB). Largest: ' + topList(an, 3).join(', ') + '. Use the 🧹 storage cleanup button in the Task Inbox header.');
        } catch (e) { return null; }
    };
    var _lastLogAt = 0;
    function logReport(kind, an, extra) {
        try {
            if (!window._issueLog || Date.now() - _lastLogAt < 60000) return;   // 1분에 한 번만
            _lastLogAt = Date.now();
            window._issueLog({ domain: 'qa', kind: kind, rid: '', route: '',
                params: Object.assign({ totalKB: kb(an.total), top: an.items.slice(0, 6).map(function (x) { return { key: x.key, kb: kb(x.chars) }; }) }, extra || {}) });
        } catch (e) { /* ignore */ }
    }

    // ⭐ [2026-09-23 신규] 선제 점검 — 가득 차고 나서가 아니라, 차기 전에 줄인다.
    //    근거(Phase 10 학습 자료 digest_20260923): storage_full 5건 + storage_report 1건이
    //    같은 사용자에게서 연달아 기록됐고, 그때 저장소는 5116KB로 사실상 한도(≈5MB)에 붙어
    //    있었다(ms_pending_queue 2394KB + gantt_task_inbox 1624KB). 지금 구조는 **저장이
    //    실패한 뒤에야**(_storageDoctorAuto) 캐시를 비우므로, 그 사이 업무 보관함 저장이
    //    조용히 실패하는 구간이 생긴다 — 실제로 "보관함 저장이 안 된다"로 나타났다.
    //    → 주기적으로 사용량을 재서 임계치를 넘으면 캐시류를 먼저 자동 정리하고,
    //      그래도 높으면 하루 한 번만 안내한다(반복 토스트로 사람을 괴롭히지 않는다).
    //    probeFree()는 큰 문자열을 실제로 써 보는 방식이라 여기서는 쓰지 않고(스스로 저장소를
    //    흔들 수 있음), 브라우저 통상 한도 5MB를 기준치로 삼는다.
    var SD_BUDGET = 5 * 1024 * 1024;   // 기준 한도(문자 수) — 대부분의 브라우저가 5MB
    var SD_WARN_PCT = 0.8;             // 이 이상이면 자동 정리 시도
    var SD_NOTICE_KEY = 'gantt_storage_notice_day';

    /** 선제 점검 1회. 반환: {pct, freed, notified} (문제 없으면 notified=false) */
    window._storageDoctorCheck = function (opts) {
        opts = opts || {};
        try {
            // 항상 숫자로 고정 — 0을 넘기면 `0 || 0.8`로 기본값이 되어버려 테스트가 헛도는 함정
            var th = (typeof opts.threshold === 'number') ? opts.threshold : SD_WARN_PCT;
            var an = analyze();
            var pct = an.total / SD_BUDGET;
            if (pct < th) return { pct: pct, freed: 0, notified: false };

            // ① 다시 만들 수 있는 캐시부터 조용히 정리
            var freed = 0;
            try { var pl = plan('cache'); if (pl.length) freed = apply(pl); } catch (e) { /* 계속 */ }

            // ② 그래도 높으면 하루 한 번만 안내 — 어떤 키가 큰지까지 같이 알려준다
            var an2 = analyze();
            var pct2 = an2.total / SD_BUDGET;
            var notified = false;
            if (pct2 >= th) {
                logReport('storage_report', an2, { pct: Math.round(pct2 * 100), proactive: true, freedKB: kb(freed) });
                var today = new Date().toISOString().slice(0, 10);
                var last = '';
                try { last = localStorage.getItem(SD_NOTICE_KEY) || ''; } catch (e) { /* ignore */ }
                if (last !== today && window.showToast) {
                    try { localStorage.setItem(SD_NOTICE_KEY, today); } catch (e) { /* ignore */ }
                    window.showToast(T(
                        '🧹 브라우저 저장 공간이 ' + Math.round(pct2 * 100) + '% 찼습니다 (' + topList(an2, 2).join(' · ') +
                        '). 업무 보관함의 [🧹 저장공간 정리]로 줄여주세요 — 이대로 두면 보관함 저장이 실패할 수 있습니다.',
                        '🧹 Browser storage is ' + Math.round(pct2 * 100) + '% full (' + topList(an2, 2).join(' · ') +
                        '). Use [🧹 Clean Up Storage] in the Task Inbox — otherwise inbox saves may start failing.'), 'error', 8000);
                    notified = true;
                }
            }
            if (freed) console.info('[저장소 닥터] 선제 정리로 ' + kb(freed) + 'KB 확보 (사용량 ' +
                Math.round(pct * 100) + '% → ' + Math.round(pct2 * 100) + '%)');
            return { pct: pct2, freed: freed, notified: notified };
        } catch (e) { console.warn('[저장소 닥터] 선제 점검 실패(무시):', e.message); return null; }
    };

    // 로드 직후엔 다른 초기화(드라이브 연동·프로젝트 로드)와 겹치지 않게 2분 뒤 첫 점검,
    // 이후 30분마다. 화면을 오래 켜 두는 사용 패턴(메일 자동수집)이라 주기 점검이 의미가 있다.
    setTimeout(function () { window._storageDoctorCheck(); }, 2 * 60 * 1000);
    setInterval(function () { window._storageDoctorCheck(); }, 30 * 60 * 1000);

    // ── 🧹 버튼 흐름 ────────────────────────────────────────────────────
    function inboxHasCleanable() {
        try {
            var list = window.TaskInbox.load(), keepMax = window.TaskInbox.KEEP_PENDING_RAW_MAX || 200;
            var stripped = list.filter(function (it) { return it.status !== '대기' && it.mailRaw; }).length;
            var done = list.filter(function (it) { return it.status !== '대기'; }).length;
            var stale = Math.max(0, list.filter(function (it) { return it.status === '대기' && it.mailRaw && it.mailRaw.body2000; }).length - keepMax);
            return !!(stripped || done > 300 || stale);
        } catch (e) { return true; }
    }
    (function wrapCleanup(tries) {
        if (typeof window.inboxCleanupStorage !== 'function') { if (tries < 20) setTimeout(function () { wrapCleanup(tries + 1); }, 500); return; }
        if (window.inboxCleanupStorage._doctorWrapped) return;
        var orig = window.inboxCleanupStorage;
        window.inboxCleanupStorage = function () {
            try {
                var an = analyze(), free = probeFree(), cap = an.total + free, pct = cap ? Math.round(an.total / cap * 100) : 0;
                var pl = plan(), inboxClean = inboxHasCleanable();
                var head = T('브라우저 저장소 사용량: 약 ' + (an.total / 1048576).toFixed(1) + 'MB / ' + (cap / 1048576).toFixed(1) + 'MB (' + pct + '%)\n큰 항목:\n', 'Browser storage: ~' + (an.total / 1048576).toFixed(1) + 'MB / ' + (cap / 1048576).toFixed(1) + 'MB (' + pct + '%)\nLargest:\n') +
                    topList(an, 5).map(function (x, i) { return ' ' + (i + 1) + '. ' + x; }).join('\n');
                logReport('storage_report', an, { pct: pct, plan: pl.map(function (p) { return { key: p.entry.key, savedKB: kb(p.saved) }; }) });
                if (pl.length && (pct >= 50 || !inboxClean)) {
                    var lines = pl.map(function (p) { return ' • ' + label(p.entry) + ' — ' + kb(p.before) + 'KB → ' + kb(p.after) + 'KB'; }).join('\n');
                    var ask = head + '\n\n' + T('정리 가능한 항목(최근 것만 남기고 오래된 것을 줄입니다):\n', 'Cleanable items (keeps the most recent, trims old ones):\n') + lines + '\n\n' + T('정리할까요?', 'Clean up now?');
                    if (!confirm(ask)) return;
                    var freed = apply(pl);
                    var msg = T('🧹 저장소 정리 완료 — 약 ' + kb(freed) + 'KB 확보', '🧹 Storage cleanup done — freed ~' + kb(freed) + 'KB');
                    if (window.showToast) window.showToast(msg, 'info'); else alert(msg);
                    if (inboxClean) return orig.apply(this, arguments);   // 보관함 자체도 정리할 게 있으면 이어서
                    return;
                }
                if (!pl.length && !inboxClean) {
                    alert(T('정리할 수 있는 항목이 없습니다 — 업무 보관함에 정리할 원문이 없고, 정리 대상으로 등록된 저장 데이터도 없습니다.\n\n', 'Nothing to clean — the inbox has nothing to trim and no registered data is over its limit.\n\n') + head +
                        '\n\n' + T('위 "큰 항목"이 공간을 차지하고 있습니다. 이 목록은 이슈 리포트로 수집되어 원인 분석에 쓰입니다.', 'The largest items above are using the space. This list is collected for analysis.'));
                    return;
                }
            } catch (e) { console.warn('[저장소 닥터] 오류 — 기존 정리로 진행:', e); }
            return orig.apply(this, arguments);
        };
        window.inboxCleanupStorage._doctorWrapped = true;
    })(0);

    window._storageDoctor = { analyze: analyze, probeFree: probeFree, plan: plan, apply: apply };
})();
