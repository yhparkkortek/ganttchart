/* ============================================================================
   📥📔 폰에서 대기 메일 배분(js/60 action) + "오늘 보고 초안"(js/63) — 진짜 앱 하네스 (2026-11-08)

   앱(kortek_pm.html)을 열고 콘솔에 붙여넣는다. **NAS 가 없어도 돈다** — 저장소 길(`nasAppFile`)이
   없으면 메모리 가짜를 끼운다(바깥 경계). 가짜는 셋뿐이다:
     ① NAS(`nasAppFile`, 없을 때만) ② 텔레그램 발송(`_qaTelegramSendText`) ③ 프로젝트 쓰기(`_msAutoRegisterToProject`)
   안쪽은 진짜다 — 바퀴(`_tgqaPollTick`)·선점·동작 레지스트리·**진짜 TaskInbox**(localStorage)·
   문답 입구(`sendGanttQaMessage`)·js/59 초안 모으기.
   ⚠️ 프로젝트가 안 열려 있으면 간트 초안이 비므로, 그때만 `dailyBuildDraft` 를 한 건짜리로 바꿔 돌린다
      (결과에 `stub-data` 로 표시된다). 회사 PC 에선 프로젝트를 열고 돌리면 진짜 데이터로 간다.
   ⚠️ 실제 텔레그램으로는 아무것도 안 나가고, 끝나면 보관함 시험 항목·가짜·타이머를 원상복구한다.
   ============================================================================ */
(async function () {
    'use strict';
    var pass = 0, fail = 0, out = [];
    function ok(name, cond, detail) { if (cond) { pass++; out.push('  OK   ' + name); } else { fail++; out.push('  FAIL ' + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : '')); } }
    var C = window.TG_QA_BRIDGE;
    if (!C || !window._tgqaPollTick || !window.TG_QA_ACTIONS) { console.error('js/60 이 로드되지 않았다(또는 옛 버전)'); return; }
    if (!window.DAILY_DRAFT_QA || !window.dailyDraftQa) { console.error('js/63 이 로드되지 않았다'); return; }
    if (!window.TaskInbox) { console.error('TaskInbox(js/14c) 가 없다'); return; }

    // ── 경계 가짜 ────────────────────────────────────────────────────────────
    var restore = [];
    function stub(obj, key, val) { var had = Object.prototype.hasOwnProperty.call(obj, key), old = obj[key]; obj[key] = val; restore.push(function () { if (had) obj[key] = old; else delete obj[key]; }); }
    var FAKE_NAS = false;
    // 저장소 길이 있어도 **쓰지 못하면**(백엔드는 떠 있는데 NAS 루트·로그인이 없는 PC) 가짜로 간다 — 신호 파일 하나로 재 본다
    if (window.nasAppFile) {
        try { await window.nasAppFile.put(C.dir + '/online__' + (window._dailyMyKey && window._dailyMyKey() || 'probe') + '.json', { probe: true, at: new Date().toISOString() }); }
        catch (e) { console.warn('[하네스] NAS 쓰기 불가 → 메모리 가짜로 돈다:', e.message); FAKE_NAS = true; }
    }
    if (!window.nasAppFile || FAKE_NAS) {
        FAKE_NAS = true;
        var files = {};
        stub(window, 'nasAppFile', {
            get: async function (rel, o) { if (!(rel in files)) return null; return (o && o.json) ? JSON.parse(files[rel]) : files[rel]; },
            put: async function (rel, data) { files[rel] = typeof data === 'string' ? data : JSON.stringify(data); return { ok: true }; },
            del: async function (rel) { delete files[rel]; return { ok: true }; },
            list: async function (dir) { var p = String(dir).replace(/\/+$/, '') + '/'; return Object.keys(files).filter(function (k) { return k.indexOf(p) === 0 && k.slice(p.length).indexOf('/') < 0; }).map(function (k) { return { name: k.slice(p.length), size: files[k].length }; }); }
        });
    }
    if (!(window._dailyMyKey && window._dailyMyKey())) stub(window, '_nasAccount', 'tester');
    var key = window.dailyEnsureIdentity ? await window.dailyEnsureIdentity() : window._dailyMyKey();
    if (!key) { console.error('내 계정을 정하지 못했다'); restore.forEach(function (f) { f(); }); return; }
    var SENT = [];
    stub(window, '_qaTelegramSendText', async function (text, chatId) { SENT.push({ text: text, chatId: chatId }); return { ok: true, sent: 1, total: 1 }; });
    var REG = [];
    stub(window, '_msAutoRegisterToProject', async function (uid, task, fid, fname, raw, attempt, alarm, opts) { REG.push({ uid: uid, fid: fid, fname: fname, hasRaw: !!raw, alarm: alarm, opts: opts }); return { ok: true, label: '하네스' }; });
    stub(window.TaskInbox, 'scheduleDriveSync', function () { /* 시험 항목을 드라이브/NAS 로 올리지 않는다 */ });
    var timerWasOn = true; window._tgqaStop();
    var stamp = Date.now();
    var hist0 = (window._ganttQaHistory || []).length;

    // 보관함 시험 항목 — 진짜 TaskInbox.add
    var inbox0 = window.TaskInbox.load().map(function (x) { return x.uid; });
    window.TaskInbox.add({ '업무명': '하네스 CTR 납품 일정', '상세내용': '[출처] 하네스', '시작일': '2026-11-08', '완료일': '2026-11-10', '상태': '진행' }, {
        source: '하네스', mailRaw: { subject: 'Re: 하네스 STELLAR32 CTR 납품', sender: 'vendor@example.com', date: '2026-11-07 09:12', body2000: 'x' },
        matchedProject: { status: 'ambiguous', confidence: '중', matchBasis: '하네스 — 후보 둘', candidates: [
            { drive_file_id: 'harness_fidA', file_name: 'HARNESS_A.json', model: 'ALPHA', inch: '32' },
            { drive_file_id: 'harness_fidB', file_name: 'HARNESS_B.json', model: 'BETA', inch: '43' }] }
    });
    var mine = window.TaskInbox.load().filter(function (x) { return inbox0.indexOf(x.uid) < 0; });
    var uid = mine[0] && mine[0].uid;
    function item() { return window.TaskInbox.load().filter(function (x) { return x.uid === uid; })[0]; }
    async function drop(req) { var name = key + '__' + req.id + '.json'; await window.nasAppFile.put(C.dir + '/' + name, Object.assign({ key: key, chatId: '000', name: '하네스', via: 'telegram', reply: 'telegram', at: new Date().toISOString() }, req)); return name; }
    var stubDraft = false;
    try {
        ok('보관함에 시험 항목이 들어갔다(uid ' + uid + ')', !!uid);

        // [1] 이름 가르기 — 신호 파일은 요청이 아니다
        ok('parseName: pending__/online__ 는 요청이 아니다', window._tgqaParseName('pending__' + key + '.json') === null && window._tgqaParseName('online__' + key + '.json') === null);
        ok('parseName: <key>__cb123.json 은 요청이다', (window._tgqaParseName(key + '__cb123.json') || {}).id === 'cb123');

        // [2] 대기 목록 쓰기
        var w = await window._tgqaWritePending(key);
        var pend = await window.nasAppFile.get(C.dir + '/pending__' + key + '.json', { json: true });
        var pi = pend && (pend.items || []).filter(function (x) { return x.uid === uid; })[0];
        ok('pending__<key>.json 이 생겼고 내 항목이 들어 있다', !!pi, w);
        ok('항목: 제목·발신·후보 2(id 포함)·counts', pi && /STELLAR32/.test(pi.subject) && pi.from === 'vendor@example.com' && pi.cands.length === 2 && pi.cands[1].id === 'harness_fidB' && pend.counts.waiting >= 1 && pend.counts.withCands >= 1, pi);
        ok('후보 라벨은 모델+인치', pi && pi.cands[0].label === 'ALPHA 32"', pi && pi.cands);

        // [3] 동작 place — 폰이 2번 후보(BETA)를 골랐다
        SENT.length = 0; REG.length = 0;
        var n1 = await drop({ id: 'cb' + stamp, action: 'place', uid: uid, cand: { id: 'harness_fidB', name: 'HARNESS_B.json', label: 'BETA 43"', idx: 1 }, subject: 'Re: 하네스', text: '[배분] 하네스 → BETA' });
        var r1 = await window._tgqaPollTick();
        ok('바퀴가 동작 요청을 집었다', r1 && r1.done && r1.done.length >= 1, r1);
        ok('요청 파일이 지워졌다(선점)', !(await window.nasAppFile.list(C.dir)).some(function (f) { return f.name === n1; }));
        ok('기존 배치 함수가 **고른 후보(fidB)** 로 1회 불렸다', REG.length === 1 && REG[0].uid === uid && REG[0].fid === 'harness_fidB' && REG[0].fname === 'HARNESS_B.json' && REG[0].hasRaw && REG[0].opts && REG[0].opts.coalesce === false, REG);
        var it1 = item();
        ok('보관함 상태 배치됨(또는 자동정리로 제거)', !it1 || it1.status === '배치됨', it1 && it1.status);
        ok('상태 이력에 📱 텔레그램 배분', !it1 || (it1.history || []).some(function (h) { return /텔레그램 배분/.test(h.type || ''); }), it1 && it1.history);
        ok('텔레그램 회신 ✅ + 업무명 + 대상', SENT.length === 1 && /✅/.test(SENT[0].text) && /하네스 CTR/.test(SENT[0].text) && /BETA/.test(SENT[0].text) && SENT[0].chatId === '000', SENT);
        var pend2 = await window.nasAppFile.get(C.dir + '/pending__' + key + '.json', { json: true });
        ok('대기 목록이 바로 갱신돼 그 항목이 빠졌다', pend2 && !(pend2.items || []).some(function (x) { return x.uid === uid; }), pend2 && pend2.items);
        var H = window._ganttQaHistory || [];
        ok('문답창에 "텔레그램에서 배분 지시" 안내', H.slice(hist0).some(function (m) { return m.tgResult && /배분 지시/.test(m.text); }));

        // [4] 모르는 uid → 실행 안 함
        SENT.length = 0; REG.length = 0;
        await drop({ id: 'cb' + (stamp + 1), action: 'place', uid: 'ib_0_nope', cand: { id: 'harness_fidA' }, text: '[배분] x' });
        await window._tgqaPollTick();
        ok('없는 uid → 배치 함수 0회 · ⚠️ 회신(다시 /배분)', REG.length === 0 && SENT.length === 1 && /⚠️/.test(SENT[0].text) && /배분/.test(SENT[0].text), SENT);

        // [5] 후보 id 가 지금 후보와 다르면 안 한다
        window.TaskInbox.add({ '업무명': '하네스 둘째', '상세내용': '', '시작일': '2026-11-08', '완료일': '2026-11-08', '상태': '진행' }, {
            source: '하네스', mailRaw: { subject: '하네스 둘째', sender: 'v@example.com', date: '2026-11-08', body2000: '' },
            matchedProject: { status: 'ambiguous', confidence: '중', candidates: [{ drive_file_id: 'harness_fidC', file_name: 'HARNESS_C.json', model: 'GAMMA' }] } });
        var uid2 = window.TaskInbox.load().filter(function (x) { return inbox0.indexOf(x.uid) < 0 && x.uid !== uid; })[0].uid;
        SENT.length = 0; REG.length = 0;
        await drop({ id: 'cb' + (stamp + 2), action: 'place', uid: uid2, cand: { id: 'harness_fidZ', name: 'Z.json', label: 'Z', idx: 0 }, text: '[배분] y' });
        await window._tgqaPollTick();
        var it2 = window.TaskInbox.load().filter(function (x) { return x.uid === uid2; })[0];
        ok('후보가 바뀐 요청 → 배치 함수 0회 · 상태 대기 그대로 · ⚠️ 회신', REG.length === 0 && it2 && it2.status === '대기' && SENT.length === 1 && /후보에 없/.test(SENT[0].text), { reg: REG, st: it2 && it2.status, sent: SENT });

        // [6] 모르는 동작
        SENT.length = 0;
        await drop({ id: 'cb' + (stamp + 3), action: 'nuke', text: 'x' });
        await window._tgqaPollTick();
        ok('모르는 action → "모르는 동작" 회신(실행 없음)', SENT.length === 1 && /모르는 동작/.test(SENT[0].text), SENT);

        // [7] 보고 초안 — 어휘(데이터)
        var re = window.DAILY_DRAFT_QA.re;
        ['오늘 보고 초안', '보고 초안 만들어줘', '어제 일일 업무 보고 초안 보여줘', '2026-11-07 보고 초안', 'daily report draft', '보고서 초안 뽑아 줘'].forEach(function (q) { ok('어휘 ✓ "' + q + '"', re.test(q)); });
        ['보고서 작성법 알려줘', '주간 요약해줘', '초안 보고', '이 프로젝트 이름이 뭐야'].forEach(function (q) { ok('어휘 ✗ "' + q + '"', !re.test(q)); });
        ok('날짜 풀기: 어제·2026.11.7', /^\d{4}-\d{2}-\d{2}$/.test(window._dailyDraftDateOf('어제')) && window._dailyDraftDateOf('2026.11.7') === '2026-11-07');

        // [8] 초안 서식 — 백엔드 `_daily_apply_text` 가 읽는 모양 그대로, 안내문은 섞이지 않는다
        var D = window._dailyDraftTexts.draft({ items: [{ name: 'A 업무', core: '회의', todo: '납기 확인', issue: '' }, { name: 'B 업무', core: '', todo: '', issue: '회신 없음' }], touched: [{ name: 'C 업무' }] });
        ok('업무 이름 줄 + 한일:/할일:/막힌일: (빈 태그는 한일: 만)', D === 'A 업무\n한일: 회의\n할일: 납기 확인\n\nB 업무\n한일: \n막힌일: 회신 없음\n\nC 업무\n한일: ', JSON.stringify(D));
        var I = window._dailyDraftTexts.info({ date: '2026-11-08', items: [{ name: 'A', project: 'P1.json' }], more: 0, touched: [], saved: { items: [{ name: '이미' }] }, partial: true, errs: [] });
        ok('안내: 건수·프로젝트·이미 적은 것·덜 모았다는 표시', /내 업무 1건/.test(I) && /P1/.test(I) && /이미 적은 보고 1건/.test(I) && /끝나기 전/.test(I) && /접두어 없이/.test(I), I);

        // [9] 입구 한 바퀴 — 폰에서 `/ai 오늘 보고 초안`
        var realDraft = window.dailyBuildDraft(new Date().toISOString().slice(0, 10));
        if (!realDraft || !(realDraft.mine || []).length) {
            stubDraft = true;
            stub(window, 'dailyBuildDraft', function () { return { mine: [{ name: '하네스 업무', project: 'HARNESS', cat: 'HW', core: '[핵심] 점검', todo: '납기', issue: '' }], others: [], touched: [] }; });
        }
        SENT.length = 0;
        var n9 = await drop({ id: 'tg' + (stamp + 4), text: '오늘 보고 초안' });
        var t0 = performance.now();
        await window._tgqaPollTick();
        var ms = Math.round(performance.now() - t0);
        ok('초안 요청이 처리됐다(' + ms + 'ms' + (stubDraft ? ', stub-data' : ', 진짜 간트') + ')', !(await window.nasAppFile.list(C.dir)).some(function (f) { return f.name === n9; }));
        ok('텔레그램 2통 — ① 안내 ② 복사용 글(따로)', SENT.length === 2 && /보고 초안/.test(SENT[0].text) && /한일:/.test(SENT[1].text) && !/접두어/.test(SENT[1].text), SENT.map(function (s) { return s.text.slice(0, 80); }));
        ok('문답창에 복사용 말풍선(tgSeparate)', (window._ganttQaHistory || []).slice(hist0).some(function (m) { return m.tgSeparate && m.dailyDraft; }));

        // [10] 돌연변이 — 어휘가 안 맞으면 초안 길로 안 가고 다른 길(AI 등)로 샌다
        var savedRe = window.DAILY_DRAFT_QA.re;
        window.DAILY_DRAFT_QA.re = /^$/;
        SENT.length = 0;
        await drop({ id: 'tg' + (stamp + 5), text: '오늘 보고 초안' });
        await window._tgqaPollTick();
        window.DAILY_DRAFT_QA.re = savedRe;
        ok('(돌연변이) 어휘를 비우면 복사용 글(한일:)이 안 나온다 — 하네스가 그 차이를 본다', !SENT.some(function (s) { return /한일:/.test(s.text); }), SENT.map(function (s) { return s.text.slice(0, 60); }));
    } finally {
        // 원상복구 — 시험 항목은 묘비 없이 조용히 뺀다(드라이브 동기화도 막아 뒀다)
        try { window.TaskInbox.save(window.TaskInbox.load().filter(function (x) { return inbox0.indexOf(x.uid) >= 0; }), true); } catch (e) { console.warn('보관함 복구 실패', e); }
        try { var left = await window.nasAppFile.list(C.dir); for (var i = 0; i < left.length; i++) { if (/__(cb|tg)\d{13}\.json$/.test(left[i].name)) await window.nasAppFile.del(C.dir + '/' + left[i].name); } } catch (e) { /* 가짜/없음 */ }
        if (!FAKE_NAS) { try { await window._tgqaWritePending(key); } catch (e) { /* 다음 신호 때 */ } }
        restore.reverse().forEach(function (f) { f(); });
        if (timerWasOn) window._tgqaStart();
    }
    console.log(out.join('\n') + '\n결과: ' + pass + '/' + (pass + fail) + ' 통과' + (FAKE_NAS ? ' (NAS 는 메모리 가짜)' : ' (NAS 진짜)') + (stubDraft ? ' · 간트 초안은 stub-data' : ''));
    return { pass: pass, fail: fail, sent: SENT };
})();
