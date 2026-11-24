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
        toast: window.showToast, gget: (window.gapi && gapi.client && gapi.client.drive && gapi.client.drive.files) ? gapi.client.drive.files.get : null,
        bomKey: window.APPROVAL_INTAKE.bomCacheKey
    };
    const RUN = Date.now().toString(36);
    // 킬스위치는 원래 값을 되돌린다 — 실제 데이터가 든 탭에서 일부러 꺼 둔 것을 하네스가 켜 버리면 배경 스캔이 진짜로 돈다
    const offWas = localStorage.getItem(window.APPROVAL_INTAKE.offKey);
    localStorage.removeItem(window.APPROVAL_INTAKE.offKey);
    window.TaskInbox.KEY = 'zz_apv_test_inbox_' + RUN;
    window.TaskInbox.scheduleDriveSync = function () {};
    window.APPROVAL_INTAKE.storeKey = 'zz_apv_test_store_' + RUN;
    window.APPROVAL_INTAKE.bomCacheKey = 'zz_apv_test_bom_' + RUN;
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

        // ── 7. 🧱 원자재 코드 → 저장된 BOM 한 프로젝트 ─────────────────────────
        cands.forEach(c => { c.updated_at = '2026-11-20T00:00:00Z'; });
        const PROJ = {
            T1: { projectMeta: { '프로젝트담당자': '홍길동', '회로담당자': '이영희, 박민수' }, tabData: { bomByUnit: { MVD: { rows: [{ code: '133152' }, { code: '133022' }, { code: '300001' }] } } },
                  globalData: [], changeLogs: [{ note: '메일에 133500 언급' }] },   // ⚠️ 파일 전체엔 133500 이 있지만 BOM 엔 없다 → 근거 아님
            K1: { projectMeta: { '프로젝트담당자': '김철수' }, tabData: { bomByUnit: { A: { rows: [{ code: '300001' }, { code: '133500' }] } } } }
        };
        const reads = [];
        window.gapi = window.gapi || {}; gapi.client = gapi.client || {}; gapi.client.drive = gapi.client.drive || {}; gapi.client.drive.files = gapi.client.drive.files || {};
        gapi.client.drive.files.get = async (o) => { reads.push(o.fileId); const doc = PROJ[o.fileId] || { tabData: {} }; return { result: JSON.parse(JSON.stringify(doc)) }; };
        localStorage.removeItem(window.APPROVAL_INTAKE.bomCacheKey);
        boxes.draft.push(D('911', 'Customer Approval Sheet[133152]', '원자재 승인 결과서', '완료', 0));
        boxes.draft.push(D('912', 'Customer Approval Sheet[133152 300001]', '원자재 승인 결과서', '완료', 0));          // 300001 은 공용
        boxes.draft.push(D('913', 'Customer Approval Sheet[133500]', '원자재 승인 결과서', '완료', 0));                 // 홍길동은 K1 담당자 아님
        boxes.draft.push(D('914', 'Customer Approval Sheet[133999]', '원자재 승인 결과서', '완료', 0));                 // 어느 BOM 에도 없음
        const p1 = calls.place.length;
        r = await window.approvalIntakeRun({ manual: false, toast: false });
        const c911 = card('911');
        ok(!!c911 && c911.status === '자동배치됨' && c911.matchedProject.routing.basis === 'material_bom' && calls.place.slice(p1).some(p => p.fid === 'T1'),
           '7-1 코드가 한 프로젝트 BOM 에만 있고 기안자가 담당자 → 그 프로젝트에 자동배치', c911 && c911.matchedProject);
        ok(!card('912') && r.materialMiss && r.materialMiss.shared_code === 1, '7-2 공용 코드가 하나라도 섞이면 카드를 안 만든다(대기도 아님)', r);
        const c913 = card('913');
        ok(!!c913 && c913.status === '대기' && c913.matchedProject.routing.basis === 'material_bom_member' && !calls.place.slice(p1).some(p => p.fid === 'K1'),
           '7-3 기안자가 그 프로젝트 담당자 칸에 없으면 자동 대신 대기', c913 && c913.matchedProject);
        ok(!card('914') && r.materialMiss.code_not_in_bom === 1, '7-4 어느 BOM 에도 없는 코드는 그냥 둔다(파일 전체에 언급돼 있어도 근거로 안 씀)', r.materialMiss);
        ok(reads.filter(x => x === 'T1').length === 1 && reads.indexOf('A1') !== -1, '7-5 색인은 이번 실행에서 한 번만 만든다(프로젝트마다 1번 읽기)', reads);
        const n2 = reads.length;
        boxes.draft.push(D('915', 'Customer Approval Sheet[133022]', '원자재 승인 결과서', '완료', 0));
        r = await window.approvalIntakeRun({ manual: false, toast: false });
        ok(!!card('915') && reads.length === n2, '7-6 다음 실행은 updated_at 이 같으면 파일을 다시 안 읽는다(캐시)', { reads: reads.length - n2 });
        cands.find(c => c.drive_file_id === 'T1').updated_at = '2026-11-24T00:00:00Z';
        boxes.draft.push(D('916', 'Customer Approval Sheet[133152]_V02', '원자재 승인 결과서', '완료', 0));
        r = await window.approvalIntakeRun({ manual: false, toast: false });
        ok(reads.length === n2 + 1 && reads[reads.length - 1] === 'T1', '7-7 저장 시각이 바뀐 프로젝트만 다시 읽는다', reads.slice(n2));
        const CI = window._approvalCodesIn;
        ok(CI('Sheet[133007 133008,133009]').join() === '133007,133008,133009' && CI('(502509, KTC490DPZ01)').length === 0 && CI('1330071').length === 0,
           '7-8 코드 읽기: 1xxxxx·3xxxxx 6자리만, 관리번호(50xxxx)·7자리 숫자는 아님');

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
        try { if (save.gget) gapi.client.drive.files.get = save.gget; } catch (e) { /* 무시 */ }
        try { localStorage.removeItem(window.APPROVAL_INTAKE.bomCacheKey); } catch (e) { /* 무시 */ }   // 하네스가 만든 가짜 색인을 남기지 않는다
        window.APPROVAL_INTAKE.bomCacheKey = save.bomKey;
        try { window.updateInboxBadge && window.updateInboxBadge(); } catch (e) { /* 무시 */ }
    }
    console.log(out.join('\n'));
    console.log('📋 전자결재 가져오기 하네스: ' + pass + ' 통과 / ' + fail + ' 실패');
    return { pass, fail, out };
};
