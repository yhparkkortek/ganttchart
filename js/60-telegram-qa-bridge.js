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

   📥 (같은 날 5차, ai-expansion-review §3-1 ②) **폰에서 대기 메일 배분**
     이 파일이 2분마다 `pending__<key>.json` 에 보관함 **대기**(후보 있는 것만)를 올려 두면,
     백엔드가 `/배분` 에 그 목록을 inline 버튼으로 보여 주고, 버튼 답(callback)을 같은 큐에
     `action:'place'` 요청으로 떨어뜨린다 → 이 파일이 `TG_QA_ACTIONS.place` 로 **기존 배치
     함수**(`_msAutoRegisterToProject`, PC 보관함 [📤] 와 같은 길)를 부르고 결과를 되보낸다.
     ⚠️ 고르는 건 사람, 실행은 기존 함수, AI 는 없다. 후보 id 가 지금 후보와 다르면 **안 한다**.
   📔 (①) `/ai 오늘 보고 초안` 은 js/63 의 문답 로컬 명령이 답한다 — 이 파일은 그 답의 두
      번째 말풍선(`tgSeparate`)을 **따로 한 통**으로 보낼 뿐이다.

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
        pendingMax: 8,                               // 폰에 올리는 대기 메일 상한(백엔드 TG_DIST.max 가 한 번에 보여 주는 수는 따로)
        pendingMaxCands: 4,                          // 항목당 후보 버튼 상한
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
        if (!m || m[1] === 'online' || m[1] === 'pending') return null;
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
        try { await window._tgqaWritePending(key); }
        catch (e) { console.warn('[텔레그램AI] 대기 목록 쓰기 실패:', e.message); }
    }

    // ── 📥 보관함 대기 목록 → NAS (백엔드 `/배분` 이 읽는다) ───────────────────
    function cut(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function candLabel(c) {
        return ([c.model, c.inch ? c.inch + '"' : ''].filter(Boolean).join(' ')) || c.customer || String(c.file_name || '').replace(/\.json$/i, '');
    }
    /** 보관함 **대기** 중 후보(drive_file_id)가 있는 것만. 폰에 보여 줄 만큼만 자른다(제목·발신·후보). */
    function pendingItems() {
        var TI = window.TaskInbox;
        if (!TI || typeof TI.load !== 'function') return null;
        var list; try { list = TI.load() || []; } catch (e) { return null; }
        var waiting = list.filter(function (it) { return it && it.status === '대기'; });
        var items = [];
        waiting.forEach(function (it) {
            var mp = it.matchedProject || {};
            var cands = (mp.candidates || []).filter(function (c) { return c && c.drive_file_id; });
            if (!cands.length) return;
            var raw = it.mailRaw || {}, t = it.task || {};
            items.push({
                uid: it.uid,
                subject: cut(raw.subject || t['업무명'] || '', 120),
                from: cut(raw.sender || raw.from || '', 60),
                date: cut(raw.date || it.addedAt || '', 16),
                task: cut(t['업무명'] || '', 80),
                basis: cut(mp.matchBasis || it.source || '', 160),
                conf: mp.confidence || '', status: mp.status || '',
                cands: cands.slice(0, C.pendingMaxCands).map(function (c) {
                    return { id: c.drive_file_id, name: c.file_name || '', label: cut(candLabel(c), 40) };
                })
            });
        });
        var uncl = 0;
        try { (window._msResults || []).forEach(function (r) { if (r && r.task && !r.project && !r._projectTag) uncl++; }); } catch (e) { /* 큐 없음 */ }
        return { items: items.slice(0, C.pendingMax), counts: { waiting: waiting.length, withCands: items.length, unclassified: uncl } };
    }
    window._tgqaPendingItems = pendingItems;
    window._tgqaWritePending = async function (key) {
        var p = pendingItems();
        if (!p) return { skipped: 'no-inbox' };
        await window.nasAppFile.put(C.dir + '/pending__' + key + '.json',
            Object.assign({ key: key, at: new Date().toISOString(), project: window.currentDriveFileName || '' }, p));
        return { ok: true, n: p.items.length, counts: p.counts };
    };

    // ── 🎛 앱 동작(action) — 폰 버튼이 고른 것을 **기존 함수**로 실행한다 ─────────
    window.TG_QA_ACTIONS = window.TG_QA_ACTIONS || {};
    /** 보관함 대기 항목을 고른 후보 프로젝트로 — PC 보관함 [📤 AI 후보로 전송] 과 같은 길. */
    window.TG_QA_ACTIONS.place = async function (req) {
        var TI = window.TaskInbox;
        if (!TI || typeof TI.load !== 'function') return '⚠️ ' + T('업무 보관함이 없습니다', 'Task Inbox is not loaded');
        var it = (TI.load() || []).filter(function (x) { return x && x.uid === req.uid; })[0];
        if (!it) return '⚠️ ' + T('그 메일은 보관함에 없습니다(이미 처리됐거나 지워졌습니다) — /배분 으로 목록을 다시 받아 주세요.',
                                 'That mail is no longer in the inbox (already handled or removed) — send /배분 again for a fresh list.');
        if (it.status !== '대기') return 'ℹ️ ' + T('이미 "' + it.status + '" 상태입니다 — 다시 배치하지 않았습니다.', 'Already "' + it.status + '" — not placed again.');
        var cands = ((it.matchedProject || {}).candidates || []);
        var want = req.cand && req.cand.id;
        var target = cands.filter(function (c) { return c && c.drive_file_id && c.drive_file_id === want; })[0];
        if (!target) return '⚠️ ' + T('고른 프로젝트가 지금 후보에 없습니다(후보가 바뀌었습니다) — PC 앱의 업무 보관함에서 배치해 주세요.',
                                     'The chosen project is not among the current candidates — place it from the app\'s Task Inbox.');
        if (window._ibRepairDatesFromMail) { try { window._ibRepairDatesFromMail(it); } catch (e) { /* 보수 실패는 아래 검사로 */ } }
        var t = it.task || {};
        if (String(t['시작일'] || '').indexOf('날짜확인필요') >= 0 || String(t['완료일'] || '').indexOf('날짜확인필요') >= 0) {
            return '⚠️ ' + T('시작일/완료일이 미확정(날짜확인필요)이라 폰에서는 배치하지 않습니다 — PC 메일 분석 화면에서 날짜를 확정해 주세요.',
                             'Start/end date is unconfirmed, so it is not placed from the phone — confirm the dates in the app first.');
        }
        if (typeof window._msAutoRegisterToProject !== 'function') return '⚠️ ' + T('배치 함수가 로드되지 않았습니다', 'placement function not loaded');
        var name = t['업무명'] || T('새 업무', 'task'), tname = candLabel(target) || target.file_name;
        var stamp = new Date().toISOString();
        TI.setStatus(req.uid, '전송 중', { type: '📱 텔레그램 배분', target: target.file_name, at: stamp });
        if (window.renderTaskInbox) { try { window.renderTaskInbox(); } catch (e) { /* 화면 없음 */ } }
        note('📱 ' + T('텔레그램에서 배분 지시: ', 'Placement chosen on Telegram: ') + '"' + name + '" → ' + tname);
        var result;
        try { result = await window._msAutoRegisterToProject(req.uid, it.task, target.drive_file_id, target.file_name, it.mailRaw, 0, !!it.alarmWorthy, { coalesce: false }); }
        catch (e) { result = { ok: false, reason: e.message }; }
        if (result && result.ok) {
            TI.setStatus(req.uid, '배치됨', { type: '📱 텔레그램 배분', target: target.file_name, at: new Date().toISOString() });
            if (window.renderTaskInbox) { try { window.renderTaskInbox(); } catch (e) { /* 화면 없음 */ } }
            return '✅ "' + name + '" → ' + tname + ' ' + T('배치 완료', 'placed') + (result.label ? ' (' + result.label + ')' : '');
        }
        TI.setStatus(req.uid, '대기', { type: '전송실패', reason: (result && result.reason) || '', at: new Date().toISOString() });
        if (window.renderTaskInbox) { try { window.renderTaskInbox(); } catch (e) { /* 화면 없음 */ } }
        issue('place_failed', { uid: req.uid, err: (result && result.reason) || '' });
        return '❌ ' + T('배치 실패: ', 'Placement failed: ') + ((result && result.reason) || T('알 수 없는 오류', 'unknown error'))
             + ' — ' + T('PC 앱 업무 보관함에서 다시 시도해 주세요.', 'retry from the app\'s Task Inbox.');
    };

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

    /** n 번째 이후의 답 말풍선을 텔레그램 메시지로. 칩 표는 `tgText`(마크다운) 를 쓴다.
     *  `tgSeparate` 말풍선(복사용 글 등)은 **따로 한 통**이 된다 — `messages` 순서대로 보낸다. */
    function collect(n) {
        var H = hist(), groups = [[]], needConfirm = false, rawOnly = false, count = 0;
        for (var i = n; i < H.length; i++) {
            var m = H[i];
            if (!m || m.role !== 'ai' || m.pending || m.tgResult) continue;
            if (m.confirmButtonsId) needConfirm = true;
            var t = m.rawHtml ? String(m.tgText || '') : String(m.text || '');
            if (!t.trim()) { if (m.rawHtml) rawOnly = true; continue; }
            count++;
            if (m.tgSeparate) { groups.push([t]); groups.push([]); }
            else groups[groups.length - 1].push(t);
        }
        var messages = groups.map(function (g) { return g.join('\n\n'); }).filter(function (s) { return s.trim(); });
        var text = messages.join('\n\n');
        if (text.length > C.maxAnswerChars) {
            text = text.slice(0, C.maxAnswerChars) + '\n…\n' + T('(길어서 잘랐습니다 — 전문은 PC 앱의 AI 문답창에 있습니다)',
                                                                   '(truncated — the full answer is in the app\'s AI Q&A window)');
            messages = [text];
        }
        if (needConfirm || rawOnly) {
            var warn = '⚠️ ' + T('확인·선택이 필요한 단계입니다 — PC 앱의 AI 문답창에서 버튼을 눌러 주세요.',
                                 'This step needs a confirmation/choice — press the button in the app\'s AI Q&A window.');
            text += (text ? '\n\n' : '') + warn;
            if (messages.length) messages[messages.length - 1] += '\n\n' + warn; else messages = [warn];
        }
        if (!text.trim()) { text = T('(답변이 비어 있습니다 — PC 앱의 AI 문답창을 확인해 주세요)', '(empty answer — check the app\'s AI Q&A window)'); messages = [text]; }
        return { text: text, messages: messages, needConfirm: needConfirm, count: count };
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
            ans.messages = ans.count ? ans.messages.slice(0, -1).concat([ans.messages[ans.messages.length - 1] + '\n\n' + tail]) : [tail];
            ans.notices = notes;
            note(tail);
        }
        return ans;
    };

    // ── 📤 회신 — 텔레그램(기본) 또는 파일(reply:'file', 스크립트·다른 도구용) ──
    async function reply(req, ans) {
        if (typeof ans === 'string') ans = { text: ans, messages: [ans] };
        var text = ans.text, messages = (ans.messages && ans.messages.length) ? ans.messages : [text];
        if (req.reply === 'file') {
            var rel = C.answersDir + '/' + String(req.id) + '.json';
            await window.nasAppFile.put(rel, { id: req.id, key: req.key, question: req.text, text: text, messages: messages, at: new Date().toISOString() });
            note('📄 ' + T('답을 파일로 남겼습니다', 'Answer written to file') + ' (' + rel + ')');
            return { ok: true, file: rel };
        }
        var r = null, total = 0, chars = 0;
        for (var i = 0; i < messages.length; i++) {
            var msg = window._mdToTelegramText ? window._mdToTelegramText(messages[i]) : messages[i];
            chars += msg.length;
            r = await window._qaTelegramSendText(msg, req.chatId);
            if (!r || !r.ok) break;
            total += r.total || 1;
        }
        if (r && r.ok) {
            note('✅ ' + T('텔레그램으로 회신했습니다', 'Replied on Telegram') + ' (' + chars + T('자', ' chars') + (total > 1 ? ', ' + total + T('개 메시지', ' messages') : '') + ')');
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
        if (!req || (!req.text && !req.action)) return { skipped: 'empty' };
        try { await window.nasAppFile.del(rel); }
        catch (e) { console.warn('[텔레그램AI] 선점(삭제) 실패 — 답하지 않습니다:', e.message); return { skipped: 'claim' }; }
        var ageMin = (Date.now() - Date.parse(req.at || '')) / 60000;
        if (isFinite(ageMin) && ageMin > C.maxAgeMin) {
            await reply(req, '⏰ ' + T('질문이 ' + Math.round(ageMin / 60) + '시간 전 것이라 처리하지 않았습니다 — 다시 보내 주세요.',
                                        'That question is ' + Math.round(ageMin / 60) + 'h old, so it was not processed — please send it again.'));
            return { skipped: 'expired' };
        }
        var ans;
        if (req.action) {
            // 🎛 폰 버튼이 고른 동작 — 레지스트리에 있는 것만, 결과 한 줄을 되보낸다
            var fn = window.TG_QA_ACTIONS && window.TG_QA_ACTIONS[req.action];
            if (typeof fn !== 'function') {
                ans = { text: '⚠️ ' + T('앱이 모르는 동작입니다: ', 'Unknown action: ') + req.action, count: 0 };
            } else {
                try { ans = { text: String(await fn(req)), count: 1 }; }
                catch (e) { issue('action_failed', { id: req.id, action: req.action, err: e.message }); ans = { text: '⚠️ ' + T('동작 실패: ', 'Action failed: ') + e.message, count: 0 }; }
            }
            if (req.action === 'place') { try { await window._tgqaWritePending(req.key); } catch (e) { /* 다음 신호 때 */ } }
        } else {
            try { ans = await window._tgqaAsk(req); }
            catch (e) {
                issue('ask_failed', { id: req.id, err: e.message });
                ans = { text: '⚠️ ' + T('앱에서 질문을 처리하지 못했습니다: ', 'The app could not process the question: ') + e.message, count: 0 };
            }
        }
        var r = await reply(req, ans);
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
