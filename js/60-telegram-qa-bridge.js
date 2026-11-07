/* ============================================================================
   🤖📱 js/60-telegram-qa-bridge.js — 텔레그램 ↔ AI 문답 다리 (2026-11-08, 사용자 요청)

   "텔레그램에서 문의·명령을 하면 AI 문답창에도 결과가 보이고, 텔레그램으로도 결과를 받는다."

   구조(백엔드 `_tg_ai_handle` 주석과 한 쌍):
     폰  ──/ai 질문──▶ 텔레그램 ──▶ 담당 PC 백엔드(getUpdates)
                                     └▶ NAS  App_Config/TelegramAI/<key>__<id>.json   (접수)
     이 파일(열린 앱) ── 15초마다 목록 ──▶ 내 key 의 요청을 집어
                      ── 먼저 지우고(선점) ── `sendGanttQaMessage()` 로 **진짜 AI 문답 경로** 실행
                      ── 새로 생긴 말풍선을 모아 ──▶ 텔레그램 회신(`_qaTelegramSendText`)
                      ── 2분마다 `online__<key>.json` 을 찍어 "앱이 켜져 있다" 를 알린다

   ⚠️ AI 문답을 **베끼지 않는다.** 입력창에 넣고 `sendGanttQaMessage()` 를 부른다 —
      로컬 명령·SAP·그룹웨어·도구 루프·라우터가 전부 그 한 입구 뒤에 있다(js/33 도
      같은 방식으로 감싼다). 그래서 앱에서 되는 질문은 텔레그램에서도 그대로 된다.
   ⚠️ **쓰기(확인 버튼)는 폰에서 못 누른다** — 그런 답엔 "PC 에서 버튼을 눌러 달라" 를
      덧붙인다. 텔레그램은 조회·질문 통로다(초안→사람 확인 1회 원칙은 그대로).
   ⚠️ 요청은 **먼저 지우고 답한다**(선점) — 같은 사람이 탭을 둘 열어 두면 둘이 같은 질문에
      답한다. 지우기 실패면 답하지 않는다(다음 바퀴에 다시).
   ⚠️ 사람이 치던 입력은 **되돌려 놓는다**. 사람이 보내는 중(`_ganttQaSending`)이면 기다린다.
   ⚠️ 저장소 길(`window.nasAppFile`)이 없으면(드라이브 모드·휴대폰) 아무것도 안 한다.
   ⚠️ 수치·문구는 `TG_QA_BRIDGE`(데이터). 끄기: localStorage `gantt_tgqa_off='1'`.

   검증: node tests/telegram-qa-bridge.test.js (가짜는 NAS·텔레그램 발송·sendGanttQaMessage 경계만)
         브라우저: tests/telegram-qa-bridge.browser.js (진짜 앱에서 요청 파일을 떨어뜨려 본다)
   ============================================================================ */
(function () {
    'use strict';

    window.TG_QA_BRIDGE = window.TG_QA_BRIDGE || {
        dir: 'App_Config/TelegramAI',               // 백엔드 TG_AI_QUEUE_DIR 와 같아야 한다
        answersDir: 'App_Config/TelegramAI/answers', // reply:'file' 요청의 답(폰이 아니라 스크립트·다른 도구용)
        pollMs: 15000,
        bootDelayMs: 8000,                           // 부팅 직후 NAS 신원·프로젝트가 자리 잡을 시간
        heartbeatMs: 120000,                         // 백엔드 TG_AI_ONLINE_STALE_SEC(300) 보다 짧게
        maxAgeMin: 120,                              // 이보다 오래된 요청은 답하지 않고 사유만 보낸다
        settleStepMs: 500,
        settleMaxMs: 180000,                         // SAP 조회·도구 루프가 길 수 있다(실측 BOM 20초)
        settleQuietMs: 1500,                         // 마지막 말풍선 뒤 이만큼 조용하면 끝난 것으로
        maxAnswerChars: 12000,                       // 텔레그램 4,096자 × 3 메시지쯤
        offKey: 'gantt_tgqa_off'
    };
    var C = window.TG_QA_BRIDGE;

    function T(ko, en) { return window._t ? window._t(ko, en) : ko; }
    function ready() { return !!window.nasAppFile; }
    function isOff() { try { return localStorage.getItem(C.offKey) === '1'; } catch (e) { return false; } }
    function myKey() { return window._dailyMyKey ? window._dailyMyKey() : ''; }
    async function ensureKey() {
        if (window.dailyEnsureIdentity) { try { return await window.dailyEnsureIdentity(); } catch (e) { /* 아래 */ } }
        return myKey();
    }
    function hist() { window._ganttQaHistory = window._ganttQaHistory || []; return window._ganttQaHistory; }
    function render() { if (window._renderGanttQaMessages) { try { window._renderGanttQaMessages(); } catch (e) { /* 화면 없음 */ } } }
    function note(text, extra) {
        var m = Object.assign({ role: 'ai', tgResult: true, text: text }, extra || {});
        hist().push(m); render(); return m;
    }
    function issue(kind, params) {
        try { if (window._issueLog) window._issueLog({ domain: 'tgqa', kind: kind, rid: '', route: '', params: params || {} }); } catch (e) { /* 수집 실패 무시 */ }
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /** 요청 파일 이름 → {key, id}. 신호 파일(online__*)·답 폴더는 요청이 아니다. */
    function parseName(name) {
        var m = /^([a-z0-9._-]+)__([A-Za-z0-9._-]+)\.json$/.exec(String(name || ''));
        if (!m || m[1] === 'online') return null;
        return { key: m[1], id: m[2] };
    }
    window._tgqaParseName = parseName;

    // ── 💓 "앱이 켜져 있다" 신호 ───────────────────────────────────────────────
    var _lastHb = 0;
    async function heartbeat(key) {
        if (Date.now() - _lastHb < C.heartbeatMs) return;
        try {
            await window.nasAppFile.put(C.dir + '/online__' + key + '.json',
                { key: key, at: new Date().toISOString(), project: window.currentDriveFileName || '' });
            _lastHb = Date.now();
        } catch (e) {
            console.warn('[텔레그램AI] 온라인 신호 쓰기 실패:', e.message);
        }
    }

    // ── 🙋 AI 문답 한 바퀴 — **사람이 지나는 입구**(sendGanttQaMessage) 그대로 ─────
    async function waitIdle() {
        var until = Date.now() + C.settleMaxMs;
        while (Date.now() < until) {
            var H = hist();
            var pend = H.length && H[H.length - 1] && H[H.length - 1].pending;
            if (!window._ganttQaSending && !pend) return true;
            await sleep(C.settleStepMs);
        }
        return false;
    }

    /** n 번째 이후 말풍선이 더 안 생기고 pending 도 없을 때까지. */
    async function settle(n) {
        var start = Date.now(), lastLen = -1, quietSince = Date.now();
        while (Date.now() - start < C.settleMaxMs) {
            var H = hist(), after = H.slice(n);
            var pend = window._ganttQaSending || after.some(function (m) { return m && m.pending; });
            if (H.length !== lastLen) { lastLen = H.length; quietSince = Date.now(); }
            var hasAi = after.some(function (m) { return m && m.role === 'ai' && !m.pending && !m.tgResult; });
            if (!pend && hasAi && Date.now() - quietSince >= C.settleQuietMs) return true;
            // 아무 답도 안 생긴 채 조용하면(질문이 삼켜졌다) 그만 기다린다
            if (!pend && !hasAi && Date.now() - quietSince >= C.settleQuietMs * 4) return false;
            await sleep(C.settleStepMs);
        }
        return false;
    }

    /** n 번째 이후의 답 말풍선을 텔레그램 한 통으로. 칩 표는 `tgText`(마크다운) 를 쓴다. */
    function collect(n) {
        var H = hist(), parts = [], needConfirm = false, rawOnly = false;
        for (var i = n; i < H.length; i++) {
            var m = H[i];
            if (!m || m.role !== 'ai' || m.pending || m.tgResult) continue;
            if (m.confirmButtonsId) needConfirm = true;
            var t = m.rawHtml ? String(m.tgText || '') : String(m.text || '');
            if (!t.trim()) { if (m.rawHtml) rawOnly = true; continue; }
            parts.push(t);
        }
        var text = parts.join('\n\n');
        if (text.length > C.maxAnswerChars) {
            text = text.slice(0, C.maxAnswerChars) + '\n…\n' + T('(길어서 잘랐습니다 — 전문은 PC 앱의 AI 문답창에 있습니다)',
                                                                   '(truncated — the full answer is in the app\'s AI Q&A window)');
        }
        if (needConfirm || rawOnly) {
            text += (text ? '\n\n' : '') + '⚠️ ' + T('확인·선택이 필요한 단계입니다 — PC 앱의 AI 문답창에서 버튼을 눌러 주세요.',
                                                     'This step needs a confirmation/choice — press the button in the app\'s AI Q&A window.');
        }
        if (!text.trim()) text = T('(답변이 비어 있습니다 — PC 앱의 AI 문답창을 확인해 주세요)', '(empty answer — check the app\'s AI Q&A window)');
        return { text: text, needConfirm: needConfirm, count: parts.length };
    }
    window._tgqaCollect = collect;

    window._tgqaAsk = async function (req) {
        if (typeof window.sendGanttQaMessage !== 'function') throw new Error('sendGanttQaMessage 미로드');
        var modal = document.getElementById('gantt-qa-modal');
        if ((!modal || modal.style.display === 'none') && window.openGanttQaModal) window.openGanttQaModal();
        var input = document.getElementById('gantt-qa-input');
        if (!input) throw new Error('gantt-qa-input 없음');
        if (!await waitIdle()) throw new Error(T('AI 문답이 다른 작업으로 바쁩니다', 'AI Q&A is busy'));
        note('📱 ' + T('텔레그램에서 온 질문입니다 — 답은 텔레그램으로도 보냅니다.', 'Question from Telegram — the answer also goes back to Telegram.')
             + (req.name ? ' (' + req.name + ')' : ''));
        var keep = input.value, n = hist().length;
        input.value = String(req.text || '');
        // 🔔 입구가 말풍선 대신 `alert()`/토스트로만 말하고 끝나는 길이 있다(실측: AI 키 없음 →
        //    alert 한 번, 말풍선 0개). 폰에는 그게 안 보이므로 **가로채서 답에 싣는다**.
        //    사람 화면엔 원래대로 토스트를 띄워 준다(alert 는 폰 질문 중엔 막는다 — 모달이 떠서
        //    앱이 멈추면 다음 요청까지 막힌다).
        var alerts = [], toasts = [], origAlert = window.alert, origToast = window.showToast;
        window.alert = function (m) { alerts.push(String(m == null ? '' : m)); };
        window.showToast = function (m, k) { toasts.push({ m: String(m == null ? '' : m), k: k }); if (origToast) { try { return origToast.apply(this, arguments); } catch (e) { /* 화면 없음 */ } } };
        try {
            await window.sendGanttQaMessage();
            await settle(n);
        } finally {
            window.alert = origAlert; window.showToast = origToast;
            // 사람이 치던 글을 되돌린다 — 우리가 넣은 질문이 남아 있거나 비었을 때만
            if (input.value === '' || input.value === String(req.text || '')) input.value = keep;
        }
        var ans = collect(n);
        var notes = alerts.slice();
        if (!ans.count) notes = notes.concat(toasts.filter(function (t) { return t.k === 'error' || t.k === 'warn' || t.k === 'warning' || !t.k; }).map(function (t) { return t.m; }));
        notes = notes.filter(function (s, i, a) { return s.trim() && a.indexOf(s) === i; }).slice(0, 4);
        if (notes.length) {
            var tail = notes.map(function (s) { return 'ℹ️ ' + T('앱 알림: ', 'App notice: ') + s; }).join('\n');
            ans.text = ans.count ? ans.text + '\n\n' + tail : tail;
            ans.notices = notes;
            note(tail);
        }
        return ans;
    };

    // ── 📤 회신 — 텔레그램(기본) 또는 파일(reply:'file', 스크립트·다른 도구용) ──
    async function reply(req, text) {
        if (req.reply === 'file') {
            var rel = C.answersDir + '/' + String(req.id) + '.json';
            await window.nasAppFile.put(rel, { id: req.id, key: req.key, question: req.text, text: text, at: new Date().toISOString() });
            note('📄 ' + T('답을 파일로 남겼습니다', 'Answer written to file') + ' (' + rel + ')');
            return { ok: true, file: rel };
        }
        var msg = window._mdToTelegramText ? window._mdToTelegramText(text) : text;
        var r = await window._qaTelegramSendText(msg, req.chatId);
        if (r && r.ok) {
            note('✅ ' + T('텔레그램으로 회신했습니다', 'Replied on Telegram') + ' (' + msg.length + T('자', ' chars') + (r.total > 1 ? ', ' + r.total + T('개 메시지', ' messages') : '') + ')');
        } else {
            note('⚠️ ' + T('텔레그램 회신 실패: ', 'Telegram reply failed: ') + ((r && r.errDesc) || ''), { error: true });
            issue('reply_failed', { id: req.id, err: (r && r.errDesc) || '' });
        }
        return r;
    }

    // ── 🧾 요청 하나 처리 — 읽고 → 지우고(선점) → 묻고 → 되보낸다 ───────────────
    window._tgqaProcess = async function (name) {
        var rel = C.dir + '/' + name, req;
        try { req = await window.nasAppFile.get(rel, { json: true }); }
        catch (e) { console.warn('[텔레그램AI] 요청 읽기 실패:', e.message); return { skipped: 'read' }; }
        if (!req || !req.text) return { skipped: 'empty' };
        try { await window.nasAppFile.del(rel); }
        catch (e) { console.warn('[텔레그램AI] 선점(삭제) 실패 — 답하지 않습니다:', e.message); return { skipped: 'claim' }; }
        var ageMin = (Date.now() - Date.parse(req.at || '')) / 60000;
        if (isFinite(ageMin) && ageMin > C.maxAgeMin) {
            await reply(req, '⏰ ' + T('질문이 ' + Math.round(ageMin / 60) + '시간 전 것이라 처리하지 않았습니다 — 다시 보내 주세요.',
                                        'That question is ' + Math.round(ageMin / 60) + 'h old, so it was not processed — please send it again.'));
            return { skipped: 'expired' };
        }
        var ans;
        try { ans = await window._tgqaAsk(req); }
        catch (e) {
            issue('ask_failed', { id: req.id, err: e.message });
            ans = { text: '⚠️ ' + T('앱에서 질문을 처리하지 못했습니다: ', 'The app could not process the question: ') + e.message, count: 0 };
        }
        var r = await reply(req, ans.text);
        return { ok: !!(r && r.ok), answer: ans, req: req };
    };

    // ── ⏱ 바퀴 — 내 key 의 요청만, 이름순으로 하나씩 ───────────────────────────
    var _busy = false, _seen = {};
    window._tgqaPollTick = async function () {
        if (_busy || isOff() || !ready()) return { skipped: _busy ? 'busy' : (isOff() ? 'off' : 'no-storage') };
        var key = await ensureKey();
        if (!key) return { skipped: 'no-key' };
        _busy = true;
        var done = [];
        try {
            await heartbeat(key);
            var items = await window.nasAppFile.list(C.dir);
            var mine = (items || []).map(function (it) { return { name: it && it.name, p: parseName(it && it.name) }; })
                .filter(function (x) { return x.p && x.p.key === key && !_seen[x.name]; })
                .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
            for (var i = 0; i < mine.length; i++) {
                _seen[mine[i].name] = 1;
                done.push(await window._tgqaProcess(mine[i].name));
            }
        } catch (e) {
            console.warn('[텔레그램AI] 바퀴 건너뜀:', e.message);
        } finally {
            _busy = false;
        }
        return { key: key, done: done };
    };

    var _timer = null;
    window._tgqaStart = function () {
        if (_timer) return;
        _timer = setInterval(function () { window._tgqaPollTick(); }, C.pollMs);
    };
    window._tgqaStop = function () { if (_timer) { clearInterval(_timer); _timer = null; } };

    if (typeof setTimeout === 'function' && !window._tgqaNoAutoStart) {
        setTimeout(function () { window._tgqaStart(); window._tgqaPollTick(); }, C.bootDelayMs);
    }

    // 🧹 저장소 의사(js/34)에 킬스위치 키를 알린다 — 새 localStorage 키는 레지스트리에 적는 규칙
    try {
        if (window.STORAGE_REGISTRY && !window.STORAGE_REGISTRY.some(function (r) { return r.key === C.offKey; })) {
            window.STORAGE_REGISTRY.push({ key: C.offKey, label: '텔레그램 AI 다리 끄기 스위치', labelEn: 'Telegram AI bridge kill switch', cls: 'setting', strategy: { type: 'keep' } });
        }
    } catch (e) { /* 레지스트리 없음 */ }
})();
