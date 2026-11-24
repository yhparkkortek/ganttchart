/* ============================================================================
   tests/approval-intake.browser.js — 📋 전자결재 → 프로젝트 배치(js/75) 브라우저 하네스
   ----------------------------------------------------------------------------
   앱 탭 콘솔(F12)에 붙여넣고 `await __approvalIntakeTest()`.
   · 그룹웨어·NAS·AI **없이** 돈다. 가짜는 **경계에만**:
       fetch(`/gw/status`·`/gw/approval/doclist`) · `_msLoadProjectIndex`(NAS 색인) ·
       `_msAutoRegisterToProject`/`_msRegisterToProjectTargets`(프로젝트 파일 쓰기) · `isAutoRegisterEnabled` ·
       TaskInbox 저장 열쇠(임시 키, 드라이브 동기화 끔) · 장부 열쇠(임시 키)
   · 안쪽은 진짜: js/75 스캔·장부·중복·양식 제외 → js/74 판정기 → js/15b `_msAutoPlaceNewInboxItem` → TaskInbox.add
   · 가짜 fetch 는 **주소로** 분기한다(호출 순서에 기대지 않는다 — CLAUDE.md 검증 규칙).
   ============================================================================ */
window.__approvalIntakeTest = async function () {
    const out = []; let pass = 0, fail = 0;
    const ok = (c, msg, extra) => { if (c) { pass++; out.push('✅ ' + msg); } else { fail++; out.push('❌ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 300) : '')); } };
    if (!window.approvalIntakeRun || !window.mailRouteJudge) { console.error('js/75 또는 js/74 가 로드되지 않았습니다'); return { pass: 0, fail: 1 }; }

    const C = (id, file, model, customer, inch, kws) => ({ drive_file_id: id, file_name: file, model, customer, inch, keywords: kws, assignee: 'x', team: '개발3팀' });
    const amusKw = (own) => ['AMUSNET 55FLAT', 'AMUSNET 55C-R2100', 'AMUSNET 55J-R1500', 'Georgi', 'AMUSNET 55 Series'].concat(own);
    const cands = [
        C('A1', 'AMUSNET_55FLAT.json', 'AMUSNET 55FLAT', 'AMUSNET', '55', amusKw(['55F'])),
        C('A2', 'AMUSNET_55C.json', 'AMUSNET 55C-R2100', 'AMUSNET', '55', amusKw(['125202'])),
        C('A3', 'AMUSNET_55J.json', 'AMUSNET 55J-R1500', 'AMUSNET', '55', amusKw(['55J'])),
        C('T1', 'LNW_STELLAR32_32.0.json', '1641445-ALT1', 'LNW>STELLAR32', '32', ['STELLAR32', 'S32', '131769']),
        C('K1', 'KONAMI_KGP-4_55.0.json', 'KGP-4', 'KONAMI>KGP-4', '55', ['KGP-4', 'Narrow', '1500R'])
    ];
    const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 19);
    const D = (id, title, formName, status, daysAgo, extra) => Object.assign({ id, docNum: 'RD3-TEST-' + id, title, formName, status, apprStatus: '',
        drafterName: '홍길동', drafterDept: '개발3팀', draftedAt: iso(daysAgo), attachCount: 0, currentUsers: '', url: 'https://gw.example/app/approval/document/' + id }, extra || {});
    let boxes = {
        draft: [D('901', 'STELLAR32 Proto B 시제품 제작의뢰', '기안서', '완료', 2)],
        approve: [D('902', 'Amusnet 55 Series 공통 cable 구매', '구매품의서', '진행중', 3),
                  D('901', 'STELLAR32 Proto B 시제품 제작의뢰', '기안서', '완료', 2),          // 다른 문서함에 같은 문서
                  D('905', 'STELLAR32 vs KGP-4 패널 비교 검토', '기안서', '진행중', 4)],
        viewer: [D('903', '연차 휴가 신청', '휴가신청서', '완료', 1),
                 D('904', '사무용품 구매', '구매품의서', '완료', 1),
                 D('906', 'STELLAR32 옛 문서', '기안서', '완료', 400),
                 D('908', 'KGP-4 75" C EC PANEL 변경 검토', '업무협조전', '진행중', 1)]   // 크기 어긋남(KGP-4 는 55")
    };
    let gwOk = true, boxFail = '';
    const calls = { status: 0, list: [], place: [], extras: [] };

    // ── 가짜(경계) ─────────────────────────────────────────────────────────
    const save = {
        fetch: window.fetch, idx: window._msLoadProjectIndex, reg: window._msAutoRegisterToProject, regT: window._msRegisterToProjectTargets,
        auto: window.isAutoRegisterEnabled, ibKey: window.TaskInbox.KEY, sync: window.TaskInbox.scheduleDriveSync, storeKey: window.APPROVAL_INTAKE.storeKey,
        toast: window.showToast
    };
    const RUN = Date.now().toString(36);
    // 킬스위치는 원래 값을 되돌린다 — 실제 데이터가 든 탭에서 일부러 꺼 둔 것을 하네스가 켜 버리면 배경 스캔이 진짜로 돈다
    const offWas = localStorage.getItem(window.APPROVAL_INTAKE.offKey);
    localStorage.removeItem(window.APPROVAL_INTAKE.offKey);
    window.TaskInbox.KEY = 'zz_apv_test_inbox_' + RUN;
    window.TaskInbox.scheduleDriveSync = function () {};
    window.APPROVAL_INTAKE.storeKey = 'zz_apv_test_store_' + RUN;
    window.showToast = function () {};
    window.isAutoRegisterEnabled = () => true;
    window._msLoadProjectIndex = async () => cands.slice();
    window._msAutoRegisterToProject = async (uid, task, fid, fname) => { calls.place.push({ fid, name: task['업무명'] }); return { ok: true }; };
    window._msRegisterToProjectTargets = (targets) => { calls.extras.push(targets.filter(Boolean).map(t => t.drive_file_id)); };
    window.fetch = async function (url, opt) {
        const u = String(url);
        const J = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (/\/gw\/status/.test(u)) { calls.status++; return J({ ok: gwOk }); }
        let m = /\/gw\/approval\/doclist\?box=(\w+)/.exec(u);
        if (m) { calls.list.push(m[1]); if (boxFail === m[1]) return J({ ok: false, message: 'boom' }); return J({ ok: true, docs: (boxes[m[1]] || []).slice() }); }
        return save.fetch.apply(this, arguments);
    };
    const inbox = () => window.TaskInbox.load();
    const card = (id) => inbox().find(it => it.mailRaw && it.mailRaw.key === 'apv_' + id);

    try {
        // ── 1. 배경 + 그룹웨어 미로그인 → 아무것도 안 함(로그인 시도 없음) ─────────
        gwOk = false;
        let r = await window.approvalIntakeRun({ manual: false, toast: false });
        ok(r.skipped === 'gw_not_ready' && calls.list.length === 0 && inbox().length === 0, '1-1 배경 스캔은 그룹웨어가 안 붙어 있으면 문서함을 부르지 않는다', r);
        gwOk = true;

        // ── 2. 첫 스캔 ─────────────────────────────────────────────────────
        r = await window.approvalIntakeRun({ manual: false, toast: false });
        ok(calls.list.join(',') === 'draft,approve,viewer', '2-1 기안·결재·참조/열람 세 문서함을 부른다(임시저장 제외)', calls.list);
        ok(r.looked === 8, '2-2 목록 8건을 봤다', r);
        const c901 = card('901');
        ok(!!c901 && calls.place.some(p => p.fid === 'T1'), '2-3 STELLAR32 문서 → 보관함 카드 + STELLAR32 프로젝트에 자동배치', { c901: !!c901, place: calls.place });
        ok(inbox().filter(it => it.mailRaw && it.mailRaw.key === 'apv_901').length === 1, '2-4 두 문서함에 있는 같은 문서는 카드 하나', inbox().map(i => i.mailRaw && i.mailRaw.key));
        ok(c901 && c901.task['상태'] === '완료' && /\[출처\]/.test(c901.task['상세내용']) && /approval\/document\/901/.test(c901.task['상세내용']), '2-5 업무: 완료 문서는 상태 완료 · [출처] 태그 · 원문 링크', c901 && c901.task);
        ok(c901 && c901.status === '자동배치됨' && c901.mailRaw.approval && c901.mailRaw.approval.docNum === 'RD3-TEST-901', '2-6 카드 상태 자동배치됨 · 원문에 결재 정보(문서번호)', c901 && { st: c901.status, a: c901.mailRaw.approval });
        ok(!!card('902') && calls.place.some(p => /^A/.test(p.fid)) && calls.extras.length === 1 && calls.extras[0].length === 2, '2-7 AMUSNET 공통 문서 → 대표 배치 + 형제 2곳 추가', { place: calls.place, extras: calls.extras });
        const c905 = card('905');
        ok(!!c905 && c905.status === '대기' && c905.matchedProject && c905.matchedProject.status === 'ambiguous', '2-8 두 가족이 섞인 문서 → 보관함 대기(후보 붙음), 배치 안 함', c905 && { st: c905.status, mp: c905.matchedProject });
        ok(!card('903') && r.skippedForm === 1, '2-9 휴가신청서 양식은 가져오지 않는다', r);
        ok(!card('904') && r.noMatch === 1, '2-10 후보 없는 문서(사무용품)는 카드를 만들지 않는다', r);
        ok(!card('906') && r.old === 1, '2-11 소급 기간보다 오래된 문서는 가져오지 않는다', r);
        ok(r.placed === 2 && r.pending === 2, '2-12 집계: 배치 2 · 대기 2', r);
        const c908 = card('908');
        ok(!!c908 && c908.status === '대기' && c908.matchedProject.routing.basis === 'size_mismatch' && !calls.place.some(p => p.fid === 'K1'), '2-13 📐 제목 크기(75")가 대상(KGP-4 55")과 다르면 자동배치 대신 대기', c908 && c908.matchedProject);
        const S = window._approvalSizesIn;
        ok(S('LNW>HORIZON>23.8" BTN@VINA').join() === '23.8' && S('KGI>32TPR (502579)').join() === '32' && S('Shuffler display 4.3in>ESD').join() === '4.3' && S('자재 추가 및 삭제 요청 (502626)').length === 0 && S('AI 프론티어 2기 29대').length === 0, '2-14 크기 읽기: 23.8" · 32TPR · 4.3in 은 크기, 관리번호·수량은 아님');

        // ── 3. 두 번째 스캔 → 새 것 없음 ───────────────────────────────────────
        const n0 = inbox().length, p0 = calls.place.length;
        r = await window.approvalIntakeRun({ manual: false, toast: false });
        ok(r.fresh === 0 && inbox().length === n0 && calls.place.length === p0, '3-1 다시 훑어도 이미 본 문서는 다시 넣지 않는다', r);

        // ── 4. 새 문서 + 한 문서함 오류 ─────────────────────────────────────
        boxes.draft.push(D('907', 'KGP-4 1500R 금형 수정 품의', '기안서', '진행중', 0));
        boxFail = 'viewer';
        r = await window.approvalIntakeRun({ manual: false, toast: false });
        ok(r.fresh === 1 && !!card('907') && calls.place.some(p => p.fid === 'K1'), '4-1 새로 생긴 KGP-4 문서만 처리 → KGP-4 에 배치(크기 55" 일치 문구 없음)', r);
        ok(r.boxErrors.length === 1 && /참조/.test(r.boxErrors[0]), '4-2 한 문서함이 실패해도 나머지는 돌고, 실패를 드러낸다', r.boxErrors);
        boxFail = '';

        // ── 5. 장부를 지워도 보관함 카드 열쇠로 중복이 막힌다 ────────────────────
        window.approvalIntakeReset();
        const n1 = inbox().length;
        r = await window.approvalIntakeRun({ manual: false, toast: false });
        ok(inbox().length === n1 && r.dup >= 4, '5-1 장부를 비워도 이미 카드가 있는 문서는 다시 안 넣는다', { r, before: n1, after: inbox().length });

        // ── 6. 끄기 ─────────────────────────────────────────────────────────
        localStorage.setItem(window.APPROVAL_INTAKE.offKey, '1');
        r = await window.approvalIntakeRun({ manual: true, toast: false });
        ok(r.skipped === 'off', '6-1 킬스위치가 켜지면 아무것도 안 한다', r);
        localStorage.removeItem(window.APPROVAL_INTAKE.offKey);
    } catch (e) {
        ok(false, '하네스 예외: ' + e.message, String(e.stack || '').slice(0, 300));
    } finally {
        try { localStorage.removeItem(window.TaskInbox.KEY); localStorage.removeItem(window.APPROVAL_INTAKE.storeKey); } catch (e) { /* 무시 */ }
        try { if (offWas !== null) localStorage.setItem(window.APPROVAL_INTAKE.offKey, offWas); else localStorage.removeItem(window.APPROVAL_INTAKE.offKey); } catch (e) { /* 무시 */ }
        window.fetch = save.fetch; window._msLoadProjectIndex = save.idx; window._msAutoRegisterToProject = save.reg;
        window._msRegisterToProjectTargets = save.regT; window.isAutoRegisterEnabled = save.auto; window.TaskInbox.KEY = save.ibKey;
        window.TaskInbox.scheduleDriveSync = save.sync; window.APPROVAL_INTAKE.storeKey = save.storeKey; window.showToast = save.toast;
        try { window.updateInboxBadge && window.updateInboxBadge(); } catch (e) { /* 무시 */ }
    }
    console.log(out.join('\n'));
    console.log('📋 전자결재 가져오기 하네스: ' + pass + ' 통과 / ' + fail + ' 실패');
    return { pass, fail, out };
};
