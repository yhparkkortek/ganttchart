/* ============================================================================
   tests/mail-routing.browser.js — 🧭 메일 배분 판정(js/74) 브라우저 하네스
   ----------------------------------------------------------------------------
   앱 탭 콘솔(F12)에 붙여넣고 `await __mailRoutingTest()`.
   · 백엔드·NAS·AI **없이** 돈다 — 판정은 순수 함수고, 후보는 실데이터(NAS 스냅샷 11-05 색인)의
     모양을 **합성**한 것이다(실제 고객 파일은 저장소에 안 넣는다).
   · 가짜는 셋뿐: `_msAutoRegisterToProject`(쓰기)·`TaskInbox` 저장(localStorage 임시 키)·`isAutoRegisterEnabled`.
     판정·재판정·훅 사슬은 **진짜 js/74 코드**를 지난다.
   · 끝나면 가짜를 전부 되돌린다. 실제 프로젝트가 열려 있어도 아무것도 쓰지 않는다.
   ============================================================================ */
window.__mailRoutingTest = async function () {
    const out = []; let pass = 0, fail = 0;
    const ok = (c, msg, extra) => { if (c) { pass++; out.push('✅ ' + msg); } else { fail++; out.push('❌ ' + msg + (extra ? ' — ' + JSON.stringify(extra).slice(0, 200) : '')); } };
    const J = window.mailRouteJudge;
    if (!J) { console.error('js/74 가 로드되지 않았습니다'); return { pass: 0, fail: 1 }; }

    // ── 후보: 실데이터 모양(키워드 공유 구조 그대로, 이름만 합성) ──────────────
    const C = (id, file, model, customer, inch, kws) => ({ drive_file_id: id, file_name: file, model, customer, inch, keywords: kws, assignee: 'x', team: '개발3팀' });
    const amusKw = (own) => ['AMUSNET 55FLAT', 'AMUSNET 55C-R2100', 'AMUSNET 55J-R1500', 'Georgi', 'Konstantin', 'ICE', 'AMUSNET 55 Series'].concat(own);
    const cands = [
        C('A1', 'AMUSNET_AMUSNET 55FLAT_55.0.json',   'AMUSNET 55FLAT',   'AMUSNET', '55', amusKw(['55F'])),
        C('A2', 'AMUSNET_AMUSNET 55C-R2100_55.0.json','AMUSNET 55C-R2100','AMUSNET', '55', amusKw(['125202'])),
        C('A3', 'AMUSNET_AMUSNET 55J-R1500_55.0.json','AMUSNET 55J-R1500','AMUSNET', '55', amusKw(['55J'])),
        C('S3', 'LNW_SHUFFLER_03.0.json', 'SHUFFLER', 'LNW>SHUFFLER', '3.0', ['SHUFFLER 3', '3인치 Shuffler', '3.0" Shuffler', '1640993-ALT1']),
        C('S4', 'LNW_SHUFFLER_04.3.json', 'SHUFFLER', 'LNW>SHUFFLER', '4.3', ['SHUFFLER 4.3', '4.3인치 Shuffler', '4.3" Shuffler', '1640994-ALT1']),
        C('O1', 'LNW_OBSIDIAN27_DB_27.0.json', 'OBSIDIAN AG/AR/AF', 'LNW', '27', ['AGARAF', 'AG/AR/AF', 'DB/AR/AG/AF', '124968', 'FOG IPS>MV270FHB-N20(B10),1920X1080,-,-=', '502627']),
        C('D1', 'LNW_Digital Wheel Back-Box Display_32.0.json', 'Digital Wheel Back-Box Display', 'LNW', '32', ['Obsidian 32"', 'Obsidian Digital Wheel', 'ODW', 'SUNON', '1576437']),
        C('T1', 'LNW_STELLAR32_32.0.json', '1641445-ALT1', 'LNW>STELLAR32', '32', ['STELLAR32', 'S32', 'SL-1 32"', 'ADONIS-QLW', '131769', 'MV315QHB-N41-A000']),
        C('K1', 'KONAMI_KGP-4_55.0.json', 'KGP-4', 'KONAMI>KGP-4', '55', ['KGP-4', 'Narrow', 'slim', 'C Curved', '1500R']),
        C('G1', 'KGI_dimension EC_75.0.json', 'dimension EC', 'KGI', '75', ['KGI 75C', 'KGI 75"'])
    ];
    const M = (subject, body, sender) => ({ subject, body: body || '', sender: sender || 'someone@customer.com' });
    const AI = (idx, conf, evidence) => ({ status: conf === '상' ? 'matched' : 'ambiguous', candidates: [cands[idx]], confidence: conf, matchBasis: 'ai', evidence: evidence || '' });

    // ── 1. 가족 묶기 ────────────────────────────────────────────────────────
    const fams = window.mailRoutingFamilies(cands);
    const famOf = (id) => fams.find(f => f.members.some(m => m.drive_file_id === id));
    ok(famOf('A1') === famOf('A2') && famOf('A2') === famOf('A3'), '1-1 AMUSNET 55F/55C/55J 는 한 가족(식별자 공유)');
    ok(famOf('S3') === famOf('S4'), '1-2 SHUFFLER 3.0/4.3 은 한 가족(고객사 칸 LNW>SHUFFLER 동일)');
    ok(famOf('T1') !== famOf('O1') && famOf('O1') !== famOf('D1'), '1-3 STELLAR32·OBSIDIAN27·Digital Wheel 은 서로 다른 가족');
    ok(fams.filter(f => f.members.length > 1).length === 2, '1-4 형제 가족은 정확히 둘', fams.map(f => f.label + ':' + f.members.length));

    // ── 2. 식별자 → 배치 ──────────────────────────────────────────────────────
    let j = J(M('Re: 4.3" Shuffler ESD 재시험 일정', '첨부 참고'), cands, null);
    ok(j.decision === 'auto' && j.target.drive_file_id === 'S4' && j.basis === 'identifier', '2-1 "4.3\\" Shuffler" → SHUFFLER 4.3 식별자', j);
    j = J(M('관리번호 #125202 샘플 입고', 'AMUSNET 샘플'), cands, null);
    ok(j.decision === 'auto' && j.target.drive_file_id === 'A2', '2-2 관리번호 125202 → 55C(형제 중 고유 코드)', j);
    j = J(M('부품 1125202X 확인', ''), cands, null);
    ok(!(j.decision === 'auto' && j.target && j.target.drive_file_id === 'A2'), '2-3 숫자 코드는 앞뒤가 숫자면 안 걸린다(1125202 ⊄ 125202)', j);
    j = J(M('STELLAR32 Proto B DFM 회신', 'MV315QHB-N41-A000 패널'), cands, null);
    ok(j.decision === 'auto' && j.target.drive_file_id === 'T1', '2-4 STELLAR32 → 식별자 배치', j);
    j = J(M('Obsidian Digital Wheel 금형 T/O 일정', ''), cands, null);
    ok(j.decision === 'auto' && j.target.drive_file_id === 'D1', '2-5 "Obsidian Digital Wheel" → Digital Wheel(고유 두 낱말 조각)', j);

    // ── 3. 가족 확정 + 모델 미확정 ──────────────────────────────────────────
    j = J(M('Amusnet 55 Series 조립용 샘플 cable 발주', '55F / 55C / 55J 공통'), cands, null);
    ok(j.decision === 'wait' && j.basis === 'family_unresolved' && j.candidates.length === 3, '3-1 AMUSNET 공통 메일 · 대표 없음 · AI 없음 → 가족 3개를 후보로 대기', j);
    j = J(M('Amusnet 55 Series 조립용 샘플 cable 발주', '공통'), cands, AI(0, '중'));
    ok(j.decision === 'auto' && j.target.drive_file_id === 'A1' && j.basis === 'family_ai', '3-2 같은 메일 + AI 중(55FLAT) → 가족 안이면 AI 픽으로 배치(대기 아님)', j);
    j = J(M('Amusnet 55 Series 조립용 샘플 cable 발주', '공통'), cands, AI(7, '상'));
    ok(j.decision === 'wait', '3-3 AI 가 가족 밖(STELLAR32)을 "상" 으로 찍어도 따르지 않는다(대기)', j);
    // 가족 대표 설정 → 자동
    const cfg0 = JSON.parse(JSON.stringify(window.mailRoutingConfig()));
    window._mailRoutingTestSetCfg = null;
    await window.mailRoutingSaveConfig({ families: { 'AMUSNET': { members: ['A1', 'A2', 'A3'], primary: 'A1' } } }).catch(() => {});
    j = J(M('Amusnet 55 Series 조립용 샘플 cable 발주', '공통'), cands, null);
    ok(j.decision === 'auto' && j.target.drive_file_id === 'A1' && j.basis === 'family_primary', '3-4 가족 대표(55FLAT)를 정하면 모델 단서 없는 공통 메일은 대표로 배치', j);
    await window.mailRoutingSaveConfig(cfg0).catch(() => {});
    j = J(M('[코텍_일신] 26년 10월 BOX SPL 요청의 건_LNW>ODB>MVD>270>FA', '박스 2EA'), cands, AI(5, '상'));
    ok(j.decision === 'auto' && j.target.drive_file_id === 'O1', '3-5 LNW 만 확정(제품 단서 없음) + AI 상(OBSIDIAN27) → 같은 고객 안 AI 상 → 배치', j);
    j = J(M('[코텍_일신] 26년 10월 BOX SPL 요청의 건_LNW', '박스 2EA'), cands, AI(5, '중'));
    ok(j.decision === 'wait' && j.basis === 'customer_only', '3-6 LNW 만 확정 + AI 중 → 대기(그 고객 후보만)', j);

    // ── 4. 충돌·미분류 ──────────────────────────────────────────────────────
    j = J(M('4.3" Shuffler 와 KGI 75C 동시 출하 문의', ''), cands, AI(9, '상'));
    ok(j.decision === 'wait' && j.basis === 'conflict', '4-1 서로 다른 가족의 고유 식별자가 함께 → 대기(AI 상이어도)', j);
    j = J(M('KGI 75C 출하 — AMUSNET 55C-R2100 55J-R1500 과 같은 포장', ''), cands, null);
    ok(j.decision === 'wait' && j.basis === 'conflict', '4-1b 식별자는 한 곳(KGI)인데 다른 가족 단어가 여럿(AMUSNET 모델 2개) → 대기', j);
    j = J(M('KGI 75C 출하 문의 (AMUSNET 때처럼)', ''), cands, null);
    ok(j.decision === 'auto' && j.target.drive_file_id === 'G1', '4-1c 다른 고객 이름 한 번 지나가는 언급은 봐준다 → KGI 배치', j);
    j = J(M('Panel Roadmap - Nov 2026', 'Thank you John!'), cands, null);
    ok(j.decision === 'none', '4-2 아무 단서 없음 → 미분류', j);
    j = J(M('Dice Popper Marquee RFQ', 'G150XCE-LM1'), cands, AI(1, '상'));
    ok(j.decision === 'wait' && j.basis === 'ai_unverified', '4-3 단서 0 + AI 상(인용 미검증) → 대기(오배송 대신)', j);
    j = J(M('Dice Popper Marquee RFQ', 'G150XCE-LM1'), cands, AI(1, '상', 'cited'));
    ok(j.decision === 'auto' && j.basis === 'ai_cited', '4-4 단서 0 + AI 상 + 인용 검증 통과 → 배치', j);
    j = J(M('Dice Popper Marquee RFQ', ''), cands, { status: 'matched', candidates: [cands[0]], extraCandidates: [cands[1], cands[2]], multi: true, confidence: '상' });
    ok(j.decision !== 'auto' || (j.candidates.length === 1), '4-5 복수 후보 "상" 이어도 여러 곳 동시 배치는 없다', j);

    // ── 5. 열쇠 ────────────────────────────────────────────────────────────────
    const k1 = window.mailKeyOf({ subject: 'RE: LNW K27 iDeck v1.4', date: '2026-09-03 08:39', sender: 'a <a@x.com>' });
    const k2 = window.mailKeyOf({ subject: 'RE: LNW K27 iDeck v1.4', date: '2026-09-03 20:13', sender: 'a <a@x.com>' });
    ok(k1 && k2 && k1 !== k2, '5-1 같은 제목·다른 시각 → 다른 열쇠(fileName 충돌 해소)', [k1, k2]);
    ok(window.mailKeyOf({ key: 'abc' }) === 'abc', '5-2 백엔드 key 가 있으면 그대로');
    ok(window.mailKeyOf({ subject: 'x', date: '2026-01-01 00:00' }) === window.mailKeyOf({ subject: ' x ', date: '2026-01-01 00:00' }), '5-3 제목 공백 정리는 같은 열쇠');

    // ── 6. 재판정(AI 없이) — 가짜 쓰기 위에서 ─────────────────────────────────
    const TI = window.TaskInbox;
    const realLoad = TI.load, realSave = TI.save, realSetStatus = TI.setStatus;
    const realReg = window._msAutoRegisterToProject, realEnabled = window.isAutoRegisterEnabled;
    const realLoadIdx = window._msLoadProjectIndex, realFilter = window._msFilterCandidateProjects, realRepair = window._ibRepairDatesFromMail;
    let store = [];
    try {
        TI.load = () => store.map(x => JSON.parse(JSON.stringify(x)));
        TI.save = (l) => { store = l.map(x => JSON.parse(JSON.stringify(x))); };
        TI.setStatus = (uid, st, h) => { const it = store.find(x => x.uid === uid); if (it) { it.status = st; (it.history = it.history || []).push(h); } };
        const placed = [];
        window._msAutoRegisterToProject = async (uid, task, fid, fname) => { placed.push({ uid, fid, fname }); return { ok: true, label: 'fake' }; };
        window.isAutoRegisterEnabled = () => true;
        window._msLoadProjectIndex = async () => cands;
        window._msFilterCandidateProjects = (l) => l;
        window._ibRepairDatesFromMail = () => true;
        store = [
            { uid: 'u1', status: '대기', task: { 업무명: 'ESD 재시험', 시작일: '2026-11-01', 완료일: '2026-11-02', 상세내용: '[출처]Re: 4.3" Shuffler ESD 재시험_2026-11-01 09:00_a' },
              mailRaw: { subject: 'Re: 4.3" Shuffler ESD 재시험', date: '2026-11-01 09:00', sender: 'a <a@x.com>', body2000: '첨부' },
              matchedProject: { status: 'ambiguous', candidates: [cands[3], cands[4]], confidence: '중', matchBasis: 'ai' } },
            { uid: 'u2', status: '대기', task: { 업무명: 'Roadmap', 시작일: '2026-11-01', 완료일: '2026-11-02', 상세내용: 'x' },
              mailRaw: { subject: 'Panel Roadmap', date: '2026-11-01 09:00', sender: 'b <b@x.com>', body2000: 'Thank you' },
              matchedProject: null },
            { uid: 'u3', status: '자동배치됨', task: { 업무명: 'done' }, mailRaw: { subject: 'done' }, matchedProject: null }
        ];
        const r = await window.mailRouteRejudgePending({ force: true, toast: false });
        ok(r.looked === 2, '6-1 대기 2건만 본다(처리된 건은 안 본다)', r);
        ok(placed.length === 1 && placed[0].uid === 'u1' && placed[0].fid === 'S4', '6-2 식별자(4.3" Shuffler)가 있는 대기 건은 SHUFFLER 4.3 으로 배치', placed);
        ok(store.find(x => x.uid === 'u1').status === '자동배치됨', '6-3 배치된 건의 상태가 바뀐다');
        ok(store.find(x => x.uid === 'u2').status === '대기', '6-4 단서 없는 건은 대기 그대로');
        // 7. 쓰기 훅 — 성공한 배치가 기록·신호 사슬을 지난다 (기록은 계정이 있어야 적힌다 — 없으면 하네스 계정)
        const realUserKey = window._appUserKey; if (!window._appUserKey && !window._nasAccount) window._appUserKey = 'harness';
        let sig = 0; const realSig = window._tpAppendMailSignal;
        window._tpAppendMailSignal = function () { sig++; };
        window._mailRoutePlaced('S4', 'LNW_SHUFFLER_04.3.json', { 업무명: 't' }, { subject: 'hook test', date: '2026-11-01 10:00', sender: 'c <c@x.com>' }, 'auto');
        window._mailRoutePlaced('S4', 'LNW_SHUFFLER_04.3.json', { 업무명: 't' }, { subject: 'hook test', date: '2026-11-01 10:00', sender: 'c <c@x.com>' }, 'auto');
        ok(sig === 1, '7-1 같은 메일·같은 프로젝트는 신호 사슬을 한 번만 지난다(10분 내 중복 차단)', sig);
        window._tpAppendMailSignal = realSig;
        const routes = window._mailRoutes();
        ok(routes.some(e => e.type === 'placed' && e.fid === 'S4'), '7-2 팀 공용 기록 버퍼에 placed 가 적힌다(계정이 있을 때)', routes.length);
        window.mailRouteCorrect('S4', { subject: 'hook test', date: '2026-11-01 10:00', sender: 'c <c@x.com>' }, '오매칭');
        ok(window._mailRoutes().some(e => e.type === 'correct' && e.fid === 'S4'), '7-3 교정이 기록된다');
        // 7-4 진짜 스레드(In-Reply-To/References → refs) — 제목이 범용이어도 기록된 메일의 key 와 맞으면 그 프로젝트
        window._mailRoutePlaced('S3', 'LNW_SHUFFLER_03.0.json', { 업무명: 'root' }, { subject: '회의록', date: '2026-11-02 10:00', sender: 'd <d@x.com>', key: 'kthreadroot00001' }, 'auto');
        let jt = J(M('Re: 회의록', '네 확인했습니다'), cands, null);
        ok(jt.decision !== 'auto', '7-4a 범용 제목만으론 스레드로 안 묶는다(threadMinLen)', jt);
        jt = J({ subject: 'Re: 회의록', body: '네 확인했습니다', sender: 'e <e@x.com>', refs: ['kthreadroot00001'] }, cands, null);
        ok(jt.decision === 'auto' && jt.target.drive_file_id === 'S3' && jt.basis === 'thread', '7-4b refs 가 기록된 메일을 가리키면 그 프로젝트로(진짜 스레드)', jt);
        window.mailRouteCorrect('S3', { subject: '회의록', date: '2026-11-02 10:00', sender: 'd <d@x.com>', key: 'kthreadroot00001' }, '오매칭');
        jt = J({ subject: 'Re: 회의록', body: '네', sender: 'e <e@x.com>', refs: ['kthreadroot00001'] }, cands, null);
        ok(jt.decision !== 'auto', '7-4c 교정된 스레드는 근거로 안 쓴다', jt);
        window._appUserKey = realUserKey;
    } finally {
        TI.load = realLoad; TI.save = realSave; TI.setStatus = realSetStatus;
        window._msAutoRegisterToProject = realReg; window.isAutoRegisterEnabled = realEnabled;
        window._msLoadProjectIndex = realLoadIdx; window._msFilterCandidateProjects = realFilter; window._ibRepairDatesFromMail = realRepair;
    }

    // ── 8. 감싸기가 실제로 설치됐나 ─────────────────────────────────────────
    ok(window._msResolveAiProjectMatch && window._msResolveAiProjectMatch._mrWrapped, '8-1 _msResolveAiProjectMatch 를 js/74 가 감쌌다(가장 바깥)');
    ok(window._msAutoRegisterToProject && window._msAutoRegisterToProject._mrWrapped, '8-2 _msAutoRegisterToProject 쓰기 훅 설치');
    ok(window.distSendTaskToTargets && window.distSendTaskToTargets._mrWrapped, '8-3 distSendTaskToTargets 쓰기 훅 설치');
    ok(window.inboxQuickClassify && window.inboxQuickClassify._mrWrapped, '8-4 ❌오매칭 → 교정 기록 연결');
    ok(window._ibAutoPlaceSweep && window._ibAutoPlaceSweep._mrWrapped, '8-5 유휴 스윕에 재판정 편승');
    ok(typeof window._msMailAlreadyInInbox === 'function' && typeof window._msAutoPlaceNewInboxItem === 'function', '8-6 15b 공용 헬퍼(보관함 중복·즉시 배치)');
    ok(!(window._ncdEnabled && window._ncdEnabled()) && !(window._tcEnabled && window._tcEnabled()) && window._AI_RETRY_AUTO_DEFAULT === false, '8-7 군집 감지·오염 진단·재시도 엔진 기본 OFF');

    console.log(out.join('\n'));
    console.log(`🧭 mail-routing: ${pass}/${pass + fail}`);
    return { pass, fail, lines: out };
};
