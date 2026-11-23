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
window.__mailRoutingTestBody = async function () {
    // 실행마다 다른 열쇠 — 같은 페이지에서 두 번 돌리면 7-1(10분 중복 차단)·7-4b(앞 실행의 교정)가 가짜로 실패했다(2026-11-23 실측)
    const RUN = Date.now().toString(36);
    const HOOK_SUBJ = 'hook test ' + RUN, THREAD_KEY = 'kthread' + RUN;
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
    ok(j.decision === 'auto' && j.target.drive_file_id === 'S4' && /identifier$/.test(j.basis), '2-1 "4.3\\" Shuffler" → SHUFFLER 4.3 식별자', j);
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
    ok(j.decision === 'auto' && j.basis === 'family_all' && j.target && (j.extra || []).length === 2 && [j.target].concat(j.extra).every(c => /^A/.test(c.drive_file_id)), '3-1 [2026-11-23 사용자 결정] AMUSNET 공통 메일 · 대표 없음 → 형제 3곳 모두에 배치', j);
    j = J(M('Amusnet 55 Series 조립용 샘플 cable 발주', '공통'), cands, AI(0, '중'));
    ok(j.decision === 'auto' && j.basis === 'family_all', '3-2 가족 확정 + AI 중(55FLAT, 본문 근거 없음) → AI 하나를 따르지 않고 형제 모두에', j);
    j = J(M('Amusnet 55 Series 조립용 샘플 cable 발주', '공통'), cands, AI(7, '상'));
    ok(j.decision === 'auto' && j.basis === 'family_all' && /^A/.test(j.target.drive_file_id), '3-3 AI 가 가족 밖(STELLAR32)을 "상" 으로 찍어도 따르지 않는다(AMUSNET 형제에)', j);
    // 3-7~9 [2026-11-23] 가족별 '대기' · 모델명 앞부분 형제 · 상한
    {
        const c0 = JSON.parse(JSON.stringify(window.mailRoutingConfig()));
        await window.mailRoutingSaveConfig({ families: { 'AMUSNET': { members: ['A1', 'A2', 'A3'], primary: '', mode: 'wait' } } }).catch(() => {});
        j = J(M('Amusnet 55 Series 조립용 샘플 cable 발주', '공통'), cands, null);
        ok(j.decision === 'wait' && j.basis === 'family_unresolved', "3-7 가족에 '대기' 를 고르면 형제 모두에 넣지 않고 대기", j);
        await window.mailRoutingSaveConfig(c0).catch(() => {});
        const PX = [C('P1', 'AM_55F.json', 'AMUSNET 55FLAT', 'AMUSNET', '55', ['Georgi']), C('P2', 'AM_55C.json', 'AMUSNET 55C-R2100', 'AMUSNET', '55', ['Konstantin']),
                    C('Q1', 'LNW_X.json', 'STELLAR32', 'LNW>STELLAR32', '32', ['STELLAR32'])];
        const famPX = window.mailRoutingFamilies(PX).filter(f => f.members.length > 1);
        ok(famPX.length === 1 && famPX[0].members.length === 2, '3-8 공유 키워드가 없어도 같은 고객 + 모델명 앞부분(amusnet55)이 같으면 형제', famPX.map(f => f.members.map(m => m.drive_file_id)));
        const BIG = ['B1', 'B2', 'B3', 'B4'].map((id, k) => C(id, 'BIG_' + k + '.json', 'BIGLINE MODEL' + k, 'BIGCO>BIGLINE', '' + (10 + k), ['BIGLINE', 'BIGCO-A', 'BIGCO-B', 'BIGCO-C', 'BIGCO-D']));
        j = J(M('BIGLINE 공통 일정', ''), BIG, null);
        ok(j.decision === 'wait', '3-9 형제가 상한(3)보다 많으면 모두에 뿌리지 않고 대기', j);
        const NS = [C('N1', 'AM_F.json', 'AMUSNET 55FLAT', 'AMUSNET', '55', ['502638']), C('N2', 'AM_C.json', 'AMUSNET 55C-R2100', 'AMUSNET', '55', ['502637']),
                    C('N3', 'AM_J.json', 'AMUSNET 55J-R1500', 'AMUSNET', '55', ['502639'])];
        j = J(M('[부족자재 일정 확인 요청] Amusnet 55 Series (55F 502638 / 55C 502637)', ''), NS, null);
        const nsT = j.target ? [j.target].concat(j.extra || []).map(c => c.drive_file_id).sort() : [];
        ok(j.decision === 'auto' && j.basis.indexOf('family_named') !== -1 && JSON.stringify(nsT) === JSON.stringify(['N1', 'N2']),
           '3-10 메일에 형제 둘의 코드가 적혀 있으면 그 둘에만(적히지 않은 55J 는 빼고)', { b: j.basis, t: nsT });
    }
    // 가족 대표 설정 → 자동
    const cfg0 = JSON.parse(JSON.stringify(window.mailRoutingConfig()));
    window._mailRoutingTestSetCfg = null;
    await window.mailRoutingSaveConfig({ families: { 'AMUSNET': { members: ['A1', 'A2', 'A3'], primary: 'A1' } } }).catch(() => {});
    j = J(M('Amusnet 55 Series 조립용 샘플 cable 발주', '공통'), cands, null);
    ok(j.decision === 'auto' && j.target.drive_file_id === 'A1' && /family_primary$/.test(j.basis), '3-4 가족 대표(55FLAT)를 정하면 모델 단서 없는 공통 메일은 대표로 배치', j);
    await window.mailRoutingSaveConfig(cfg0).catch(() => {});
    j = J(M('[코텍_일신] 26년 10월 BOX SPL 요청의 건_LNW>ODB>MVD>270>FA', '박스 2EA'), cands, AI(5, '상'));
    ok(j.decision === 'wait' && j.basis === 'customer_only', '3-5 [2026-11-23 바뀜] AI 상이라도 인용 근거가 없으면 고객 안에서 고르지 않는다 — 옛: LNW 만 확정(제품 단서 없음) + AI 상(OBSIDIAN27) → 같은 고객 안 AI 상 → 배치', j);
    j = J(M('[코텍_일신] 26년 10월 BOX SPL 요청의 건_LNW', '박스 2EA'), cands, AI(5, '중'));
    ok(j.decision === 'wait' && j.basis === 'customer_only', '3-6 [2026-11-23 바뀜] AI 가 하나 골라도(중) 본문 근거가 없으면 대기 — 옛: LNW 만 확정 + AI 가 하나만 고름(중) → 배치(2026-11-23 사용자 결정)', j);
    j = J(M('[코텍_일신] 26년 10월 BOX SPL 요청의 건_LNW>ODB>MVD>270>FA', '박스 2EA'), cands, AI(5, '상', 'agree_strong'));
    ok(j.decision === 'auto' && j.target.drive_file_id === 'O1' && j.basis === 'customer_ai', '3-5b AI 상 + 결정론 기록이 같은 후보(agree_strong) → 배치', j);
    j = J(M('[코텍_일신] 26년 10월 BOX SPL 요청의 건_LNW', '박스 2EA'), cands, AI(5, '중', 'promote'));
    ok(j.decision === 'auto' && j.target.drive_file_id === 'O1' && j.basis === 'customer_ai_single', '3-6a AI 가 하나 고름(중) + 결정론 기록 일치(promote) → 배치', j);
    { const t = { 근거인용: ['이 문장은 메일 본문에 없는 지어낸 문장입니다 OBSIDIAN AG/AR/AF'] };
      j = J(M('[코텍_일신] BOX SPL 요청의 건_LNW', '박스 2EA 요청드립니다'), cands, Object.assign(AI(5, '상'), { task: t }));
      ok(j.decision !== 'auto', '3-6d AI 가 본문에 없는 문장을 인용하면(환각) 따르지 않는다', j); }
    j = J(M('[코텍_일신] 26년 10월 BOX SPL 요청의 건_LNW', '박스 2EA'), cands,
          { status: 'ambiguous', candidates: [cands[5], cands[6]], confidence: '중', matchBasis: 'ai' });
    ok(j.decision === 'wait' && j.basis === 'customer_only', '3-6b LNW 만 확정 + AI 가 둘 이상을 후보로(중) → 대기(그 고객 후보만)', j);
    j = J(M('[코텍_일신] 26년 10월 BOX SPL 요청의 건_LNW', '박스 2EA'), cands, AI(5, '하'));
    ok(j.decision === 'wait' && j.basis === 'customer_only', '3-6c LNW 만 확정 + AI 하 → 대기', j);

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
    // 📋 [2026-11-23 사용자 결정] 공통 건(회의록·로드맵) + 한 고객사 → 그 고객사 프로젝트 전부
    const lnwIds = ['S3', 'S4', 'O1', 'D1', 'T1'];
    const allOf = (jj) => [jj.target].concat(jj.extra || []).filter(Boolean).map(c => c.drive_file_id).sort();
    j = J(M('Kortek- Weekly L&W Meet', 'Agenda: STELLAR32 schedule / Obsidian Digital Wheel proto'), cands, null);
    ok(j.decision === 'auto' && j.basis === 'common_customer' && JSON.stringify(allOf(j)) === JSON.stringify(lnwIds.slice().sort()), '4-6 주간 회의(Weekly Meet) + LNW 두 제품 → LNW 프로젝트 5곳 모두에', { basis: j.basis, ids: allOf(j) });
    j = J(M('RE: Panel Roadmap - Sep 2026 > LD550EQE-FPA1 for Obsidian55', 'AMUSNET 55FLAT 55C-R2100 / Obsidian Digital Wheel'), cands, null);
    ok(j.decision === 'wait', '4-7 로드맵이어도 고객사가 둘(AMUSNET·LNW)이면 대기 — 팀 전체 배분은 사람이', { d: j.decision, basis: j.basis });
    j = J(M('STELLAR32 / Obsidian Digital Wheel 동시 출하 문의', ''), cands, null);
    ok(j.decision === 'wait' && j.basis !== 'common_customer', '4-8 공통 건 어휘가 없으면 같은 고객사 충돌도 그대로 대기', { d: j.decision, basis: j.basis });
    ok(!window._mailRouteIsCommonSubject('Momentum 시험 결과') && !window._mailRouteIsCommonSubject('Homeland 1500R') && window._mailRouteIsCommonSubject('RE: Road Map 공유') && window._mailRouteIsCommonSubject('12/1 회의록 송부'),
       '4-9 공통 건 어휘는 낱말 경계(Momentum·Homeland 는 아님, Road Map·회의록은 맞음)');
    j = J(M('STELLAR32 진행 회의록', ''), cands, null);
    ok(j.decision === 'auto' && j.basis !== 'common_customer' && j.target.drive_file_id === 'T1', '4-10 회의록이어도 한 프로젝트가 분명하면 그 한 곳(뿌리지 않는다)', { basis: j.basis, t: j.target && j.target.drive_file_id });
    // 📐 [2026-11-23 사용자 결정] 고객만 확정 + 그 고객 안 유일 인치 → 배치
    j = J(M('[LNW] PO.214477 NRE 확인요청', 'LNW 3.0” AD BD NRE 비용 확인 부탁드립니다.'), cands, null);
    ok(j.decision === 'auto' && j.basis === 'customer_inch' && j.target.drive_file_id === 'S3', '4-11 고객(LNW)만 확정 + 3.0” → LNW 안 3인치는 SHUFFLER 3.0 하나뿐 → 배치', { d: j.decision, basis: j.basis, t: j.target && j.target.drive_file_id });
    j = J(M('[LNW] 패널 문의', 'LNW 32" 패널 수급 문의드립니다.'), cands, null);
    ok(j.decision === 'wait', '4-12 같은 인치(32") 프로젝트가 둘(STELLAR32·Digital Wheel) → 대기', { d: j.decision, basis: j.basis });
    j = J(M('[LNW] 견적 요청', 'LNW 3.0” 와 27” 견적 요청'), cands, null);
    ok(j.decision === 'wait', '4-13 메일에 인치가 둘(3.0”·27”) → 대기', { d: j.decision, basis: j.basis });
    j = J(M('[LNW] NRE 확인요청 (GABKJ-3)', 'LNW NRE 비용 확인'), cands, null);
    ok(j.basis !== 'customer_inch', '4-14 단위 없는 숫자(-3)는 인치로 안 읽는다', { d: j.decision, basis: j.basis });
    // 실데이터에서 인치만 보고 틀린 4건 — 막아야 한다
    j = J(M('LNW>K27 3종>FA Sample 출고 문의', 'LNW 27inch BOE suffix 변경당시 K27은 FA Sample도 제작'), cands, null);
    ok(j.basis !== 'customer_inch', '4-16 모델 코드 K27(프로젝트 없음)이 있으면 27인치로 OBSIDIAN27 에 보내지 않는다', { d: j.decision, basis: j.basis });
    j = J(M('1570975-ALT3 Various > Kortek2', 'LNW quote: 1. Variant of 27” SSBT w/Touch'), cands, null);
    ok(j.basis !== 'customer_inch', '4-17 크기 옆 낱말(27” SSBT)이 그 프로젝트 단어가 아니면 안 보낸다', { d: j.decision, basis: j.basis });
    j = J(M('[LNW] 패널 #509999 문의', 'LNW 3.0” AD BD 샘플'), cands, null);
    ok(j.basis !== 'customer_inch', '4-18 어느 프로젝트에도 없는 관리번호(#509999)가 있으면 안 보낸다', { d: j.decision, basis: j.basis });
    const candsDW = cands.concat([C('L7', 'LNW_L7 Jackpot Wheel_31.5.json', 'L7 Jackpot Wheel', 'LNW>L7 Jackpot Wheel', '31.5', ['L7 Jackpot Wheel'])]);
    candsDW.forEach(c => { if (c.drive_file_id === 'D1') c.keywords = c.keywords.concat(['Obsidian Digital Wheel 31.5"']); });
    j = J(M('[LNW] 31.5" UHD LCM 개선 요청', 'LNW 31.5" UHD LCM'), candsDW, null);
    ok(j.basis !== 'customer_inch', '4-19 같은 인치가 다른 프로젝트 키워드에도 있으면(31.5" Digital Wheel) 안 보낸다', { d: j.decision, basis: j.basis, t: j.target && j.target.drive_file_id });
    candsDW.forEach(c => { if (c.drive_file_id === 'D1') c.keywords = c.keywords.filter(k => k !== 'Obsidian Digital Wheel 31.5"'); });
    j = J(M('RE: New Traceability Requirements for Molded Plastic Components', 'LNW supplier reminder'), cands, null);
    ok(j.decision === 'auto' && j.basis === 'common_customer' && JSON.stringify(allOf(j)) === JSON.stringify(lnwIds.slice().sort()), '4-15 고객 전반 요구사항(Requirements) → LNW 프로젝트 전부', { d: j.decision, basis: j.basis, ids: allOf(j) });

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
        window._msAutoRegisterToProject = async (uid, task, fid, fname, mr, att, al, opts) => { placed.push({ uid, fid, fname, opts }); return { ok: true, label: 'fake' }; };
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
        ok(placed[0] && placed[0].opts && placed[0].opts.noTopicRegen === true, '6-3b 재판정 배치는 토픽 프로파일 AI 재생성을 건너뛴다(건당 몇 분·무료 한도)', placed[0] && placed[0].opts);
        ok(store.find(x => x.uid === 'u2').status === '대기', '6-4 단서 없는 건은 대기 그대로');
        // 6-5 [2026-11-23] 재판정이 형제 모두 배치를 실제로 한다(대표는 카드, 나머지는 _msRegisterToProjectTargets 로 새 카드)
        {
            store = [{ uid: 'fa1', status: '대기', task: { 업무명: '라벨', 시작일: '2026-11-01', 완료일: '2026-11-02', 상세내용: 'x' },
                       mailRaw: { subject: 'Amusnet 55 Series 라벨 사양 확인 요청', date: '2026-11-01 09:00', sender: 'f <f@x.com>', body2000: '확인 부탁드립니다' },
                       matchedProject: { status: 'ambiguous', candidates: [cands[0]], confidence: '중', matchBasis: 'ai' } }];
            placed.length = 0;
            await window.mailRouteRejudgePending({ force: true, toast: false });
            await new Promise(r => setTimeout(r, 800));
            const fids = placed.map(p => p.fid).sort();
            ok(JSON.stringify(fids) === JSON.stringify(['A1', 'A2', 'A3']), '6-5 대표 없는 가족 메일은 재판정에서 형제 3곳 모두에 배치된다', fids);
        }
        // 7. 쓰기 훅 — 성공한 배치가 기록·신호 사슬을 지난다 (기록은 계정이 있어야 적힌다 — 없으면 하네스 계정)
        const realUserKey = window._appUserKey; if (!window._appUserKey && !window._nasAccount) window._appUserKey = 'harness';
        let sig = 0; const realSig = window._tpAppendMailSignal;
        window._tpAppendMailSignal = function () { sig++; };
        window._mailRoutePlaced('S4', 'LNW_SHUFFLER_04.3.json', { 업무명: 't' }, { subject: HOOK_SUBJ, date: '2026-11-01 10:00', sender: 'c <c@x.com>' }, 'auto');
        window._mailRoutePlaced('S4', 'LNW_SHUFFLER_04.3.json', { 업무명: 't' }, { subject: HOOK_SUBJ, date: '2026-11-01 10:00', sender: 'c <c@x.com>' }, 'auto');
        ok(sig === 1, '7-1 같은 메일·같은 프로젝트는 신호 사슬을 한 번만 지난다(10분 내 중복 차단)', sig);
        window._tpAppendMailSignal = realSig;
        const routes = window._mailRoutes();
        ok(routes.some(e => e.type === 'placed' && e.fid === 'S4'), '7-2 팀 공용 기록 버퍼에 placed 가 적힌다(계정이 있을 때)', routes.length);
        window.mailRouteCorrect('S4', { subject: HOOK_SUBJ, date: '2026-11-01 10:00', sender: 'c <c@x.com>' }, '오매칭');
        ok(window._mailRoutes().some(e => e.type === 'correct' && e.fid === 'S4'), '7-3 교정이 기록된다');
        // 7-4 진짜 스레드(In-Reply-To/References → refs) — 제목이 범용이어도 기록된 메일의 key 와 맞으면 그 프로젝트
        window._mailRoutePlaced('S3', 'LNW_SHUFFLER_03.0.json', { 업무명: 'root', _routing: { basis: 'identifier' } }, { subject: '회의록', date: '2026-11-02 10:00', sender: 'd <d@x.com>', key: THREAD_KEY }, 'auto');
        let jt = J(M('Re: 회의록', '네 확인했습니다'), cands, null);
        ok(jt.decision !== 'auto', '7-4a 범용 제목만으론 스레드로 안 묶는다(threadMinLen)', jt);
        jt = J({ subject: 'Re: 회의록', body: '네 확인했습니다', sender: 'e <e@x.com>', refs: [THREAD_KEY] }, cands, null);
        ok(jt.decision === 'auto' && jt.target.drive_file_id === 'S3' && jt.basis === 'thread', '7-4b refs 가 기록된 메일을 가리키면 그 프로젝트로(진짜 스레드)', jt);
        window.mailRouteCorrect('S3', { subject: '회의록', date: '2026-11-02 10:00', sender: 'd <d@x.com>', key: THREAD_KEY }, '오매칭');
        jt = J({ subject: 'Re: 회의록', body: '네', sender: 'e <e@x.com>', refs: [THREAD_KEY] }, cands, null);
        ok(jt.decision !== 'auto', '7-4c 교정된 스레드는 근거로 안 쓴다', jt);
        // 7-4d [2026-11-23] AI 판단으로 배치된 기록은 스레드 근거가 되지 않는다(추측이 결정론으로 둔갑하지 않게) — 사람 배치는 된다
        const TK2 = 'kthreadai' + RUN;
        window._mailRoutePlaced('S3', 'LNW_SHUFFLER_03.0.json', { 업무명: 'r', _routing: { basis: 'family_ai' } }, { subject: '샘플 회의록', date: '2026-11-03 10:00', sender: 'd <d@x.com>', key: TK2 }, 'auto');
        jt = J({ subject: 'Re: 샘플 회의록', body: '네', sender: 'e <e@x.com>', refs: [TK2] }, cands, null);
        ok(jt.decision !== 'auto', '7-4d AI 판단(family_ai)으로 배치된 스레드는 근거로 안 쓴다', jt);
        const TK3 = 'kthreadhu' + RUN;
        window._mailRoutePlaced('S3', 'LNW_SHUFFLER_03.0.json', { 업무명: 'r', _routing: { basis: 'family_ai' } }, { subject: '샘플 회의록2', date: '2026-11-03 11:00', sender: 'd <d@x.com>', key: TK3 }, 'human');
        jt = J({ subject: 'Re: 샘플 회의록2', body: '네', sender: 'e <e@x.com>', refs: [TK3] }, cands, null);
        ok(jt.decision === 'auto' && jt.target.drive_file_id === 'S3' && jt.basis === 'thread', '7-4e 사람이 배치한 스레드는 근거가 된다', jt);
        window._appUserKey = realUserKey;

        // ── 9. [2026-11-23] 실데이터 재생(박용훈 보관함 대기 144건)에서 찾은 세 가지 ─────────
        const KD = C('KD', 'KORTEK_개발업무.json', '개발업무', 'KORTEK>개발업무', '', ['개발업무', '개발지원', 'Roadmap', 'FYI']);
        const H1 = C('H1', 'LNW_HORIZON_75.json', 'HORIZON75', 'LNW>HORIZON', '75', ['HORIZON 75']);
        const cands9 = cands.concat([KD, H1]);
        let j9 = J(M('Shuffler 4.3" ESD 협의', '4.3" Shuffler ESD 결과입니다.\nBest regards,\nKortek Corp.'), cands9, null);
        ok(j9.decision === 'auto' && j9.target.drive_file_id === 'S4', '9-1 서명의 "Kortek" 은 고객 단서가 아니다(사내 공용 프로젝트와 충돌 안 함)', j9);
        //  ⚠️ 실제 사고 모양 그대로 — 고유 식별자 없이 **고객 이름만** 있는 메일(①이 아니라 ③을 지난다).
        //     식별자가 있는 메일로 시험하면 "Kortek" 토큰 1개는 ①의 '2개 이상' 문턱에 안 걸려 버그가 있어도 통과한다(실측).
        j9 = J(M('KGI sample request > KORTEK', 'Dear Kortek team, please check the KGI sample.'), cands9, null);
        ok(j9.decision === 'auto' && j9.target.drive_file_id === 'G1', '9-2 고객 이름(KGI)+제목 꼬리 "> KORTEK" → "여러 고객" 충돌이 아니라 KGI', j9);
        j9 = J(M('Re: 4.3" Shuffler horizontal line issue', 'horizontal lines on panel'), cands9, null);
        ok(j9.decision === 'auto' && j9.target.drive_file_id === 'S4', '9-3 "horizontal" 안의 horizon 은 HORIZON 식별자가 아니다(낱말 경계)', j9);
        j9 = J(M('HORIZON 75 일정', 'HORIZON75 샘플'), cands9, null);
        ok(j9.decision === 'auto' && j9.target.drive_file_id === 'H1', '9-3b 진짜 "HORIZON 75" 는 그대로 잡힌다', j9);
        // 9-5 제목 먼저 — 본문(인용)에 다른 프로젝트 단어가 많아도 제목의 고유 번호가 이긴다
        j9 = J(M('[회의록] LNW Obsidian 27" with DB (#502627) 후속 생산 계획', '> Obsidian Digital Wheel ODW SUNON 1576437 STELLAR32 ADONIS-QLW 회의 참석'), cands9, null);
        ok(j9.decision === 'auto' && j9.target.drive_file_id === 'O1' && /^subject_/.test(j9.basis), '9-5 제목의 고유 번호(#502627)가 본문 인용의 다른 프로젝트 단어를 이긴다', j9);
        j9 = J(M('ZITRO ICONIC & LnW STELLAR32 & Obsidian Digital Wheel 일정', ''), cands9, null);
        ok(j9.decision !== 'auto', '9-6 제목에 여러 프로젝트가 같이 나오면 한 곳으로 보내지 않는다', j9);
        // 9-6b [2026-11-23] 제목에서 여러 다른 가족이 함께 가진 단어('LNW')는 다른 프로젝트의 증거가 아니다
        const SG = C('SG', 'LNW(SG)_SSBT_27.0.json', 'SSBT(FHD,QHD,UHD)', 'LNW(SG)>SSBT(FHD,QHD,UHD)', '27', ['SSBT']);
        j9 = J(M('LNW UK 견적 의뢰(27" SSBT 사양)', '견적 부탁드립니다'), cands9.concat([SG]), null);
        ok(j9.decision === 'auto' && j9.target.drive_file_id === 'SG' && /^subject_/.test(j9.basis), '9-6b 제목의 공통 고객 이름(LNW)은 SSBT 의 충돌 근거가 아니다', j9);
        j9 = J(M('Panel Roadmap - Sep 2026', 'LNW Obsidian 55 panel 대체: AMUSNET 55FLAT 적용 검토'), cands9, null);
        ok(j9.decision !== 'auto', '9-6c 본문에선 공통 단어(LNW·Obsidian)도 여러 프로젝트 신호로 센다(로드맵 표 부품 하나로 배치 안 함)', j9);
        // 9-7 가족 안 인치로 형제 가르기
        j9 = J(M('Shuffler Display 4.3" ESD 관련 논의', '첨부 참조'), cands9, null);
        ok(j9.decision === 'auto' && j9.target.drive_file_id === 'S4' && /family_inch$/.test(j9.basis), '9-7 SHUFFLER 가족 + 4.3" → 4.3 (인치로 형제 가름)', j9);
        j9 = J(M('Shuffler 3" 와 4.3" 비교', ''), cands9, null);
        ok(j9.decision !== 'auto' || j9.basis.indexOf('inch') === -1, '9-7b 두 인치가 같이 나오면 인치로 고르지 않는다', j9);
        j9 = J(M('[JIRA 알림] (SHUF-3) Shuffler TSP 검토', ''), cands9, null);
        ok(!(j9.decision === 'auto' && /inch$/.test(j9.basis)), '9-7c 코드 속 숫자(SHUF-3)는 인치가 아니다(정수 인치는 단위가 붙어야)', j9);
        j9 = J(M('Shuffler 3인치 샘플 일정', ''), cands9, null);
        ok(j9.decision === 'auto' && j9.target.drive_file_id === 'S3', '9-7d "3인치" 는 3.0 으로(단위 붙은 정수 인치)', j9);
        j9 = J(M('Shuffler firmware V4.3 배포', ''), cands9, null);
        ok(!(j9.decision === 'auto' && /inch$/.test(j9.basis)), '9-7e 버전 표기(V4.3)는 인치가 아니다', j9);
        // 9-8 사유 글이 재판정마다 겹겹이 길어지지 않는다
        store = [{ uid: 'g1', status: '대기', task: { 업무명: 'x', 시작일: '2026-11-01', 완료일: '2026-11-02' }, mailRaw: { subject: '단서 없는 메일', body2000: '안녕하세요' },
                   matchedProject: { status: 'ambiguous', candidates: [cands[4]], confidence: '중', matchBasis: '🧭 이전 판정 · 🤖 AI 사유 원문', routing: { basis: 'ai_low', aiConfidence: '중' } } }];
        await window.mailRouteRejudgePending({ force: true, toast: false });
        await window.mailRouteRejudgePending({ force: true, toast: false });
        const mb9 = store[0].matchedProject.matchBasis;
        ok((mb9.match(/🤖/g) || []).length === 1 && mb9.indexOf('AI 사유 원문') !== -1, '9-8 재판정을 두 번 해도 사유의 🤖 는 한 번만', mb9);
        ok(store[0].matchedProject.routing.v === window.MAIL_ROUTING_RULE_V, '9-9 재판정한 카드에 규칙 버전이 적힌다', store[0].matchedProject.routing);
        const rBg = await window.mailRouteRejudgePending({ toast: false });
        ok(rBg.looked === 0 && rBg.skipped.same_rule === 1, '9-10 배경 재판정은 같은 규칙으로 본 카드를 다시 안 본다', rBg);
        // 12. [2026-11-23] 📭 미분류(메일 서버 큐, 후보 0개) 재판정 — AI 없이 결정론으로 확정되는 것만 보관함에 넣고 배치
        {
            const realQ = window._msResults, realSaveQ = window._msSaveQueueToStorage, realBadge = window._msRefreshQueueBadges;
            window._msSaveQueueToStorage = () => {}; window._msRefreshQueueBadges = () => {};
            store = []; placed.length = 0;
            const T12 = { 업무명: 'ESD', 시작일: '2026-11-01', 완료일: '2026-11-02', 상세내용: 'x' };
            window._msResults = [
                { fileName: 'q1', key: 'kq1' + RUN, subject: 'Re: Shuffler Display 4.3" ESD 결과', sender: 'a <a@x.com>', date: '2026-11-01 09:00', body: '첨부', project: null, task: Object.assign({}, T12) },
                { fileName: 'q2', key: 'kq2' + RUN, subject: '회의 일정 안내', sender: 'b <b@x.com>', date: '2026-11-01 09:00', body: '안녕하세요', project: null, task: Object.assign({}, T12) },
                { fileName: 'q3', key: 'kq3' + RUN, subject: 'STELLAR32 일정', sender: 'c <c@x.com>', date: '2026-11-01 09:00', body: '', project: null, task: null },
                { fileName: 'q4', key: 'kq4' + RUN, subject: 'STELLAR32 확인', sender: 'd <d@x.com>', date: '2026-11-01 09:00', body: '', project: 'STELLAR32', task: Object.assign({}, T12) }
            ];
            try {
                const ru = await window.mailRouteRejudgeUnmatched({ force: true, toast: false });
                ok(ru.looked === 3 && ru.placed === 2 && ru.still === 1 && ru.noTask === 0 && ru.builtNoAi === 1, '12-1 미분류 3건 — 확정 2(그중 AI 실패 1건은 메일 그대로 업무로)·그대로 1', ru);
                ok(placed.length === 2 && placed.some(p => p.fid === 'S4') && placed.some(p => p.fid === 'T1'), '12-2 확정된 메일은 보관함을 거쳐 배치된다(SHUFFLER 4.3·STELLAR32, 진짜 _msAutoPlaceNewInboxItem)', placed);
                ok(store.length === 2 && store.every(x => x.status === '자동배치됨' && x.matchedProject.routing && /subject_/.test(x.matchedProject.routing.basis)), '12-3 보관함 카드가 생기고 결정론 근거로 자동배치됨 표시', store.map(x => x.status));
                ok(window._msResults[0].project && !window._msResults[1].project && window._msResults[2].project, '12-4 확정된 줄만 미분류에서 빠진다(나머지는 그대로)', window._msResults.map(r => r.project));
                const bt = (store.find(x => x.mailRaw && x.mailRaw.subject === 'STELLAR32 일정') || {}).task || {};
                ok(bt._noAi && bt['업무명'] === 'STELLAR32 일정' && String(bt['상세내용'] || '').indexOf('[출처]STELLAR32 일정_') !== -1 && bt['시작일'] === '2026-11-01' && !!bt['완료일'],
                   '12-6 AI 실패 메일은 AI 없이 메일 그대로 업무(업무명=제목·[출처] 태그·수신일·기본 마감일)', bt);
                ok(placed[0] && placed[0].opts && placed[0].opts.coalesce === false && !placed[0].opts.byHuman, '12-5 자동 배치로 기록된다(사람 배치 아님)', placed[0] && placed[0].opts);
            } finally { window._msResults = realQ; window._msSaveQueueToStorage = realSaveQ; window._msRefreshQueueBadges = realBadge; }
        }
        // 13. [2026-11-23 사용자 결정] ♻️ 하나 — "이 프로젝트 아님, 빼고 다시 판단". 진짜 inboxQuickClassify(14c + 74 래퍼) 를 누른다.
        {
            const realSync = TI.syncNow, realRender = window.renderTaskInbox, realLearn = window._writeLearningEntry;
            let learned = 0;
            TI.syncNow = async () => 'ok'; window.renderTaskInbox = () => {}; window._writeLearningEntry = () => { learned++; };
            const T13 = () => ({ 업무명: 'x', 시작일: '2026-11-01', 완료일: '2026-11-02', 상세내용: 'x' });
            store = [
                { uid: 'r1', status: '대기', task: T13(), mailRaw: { subject: 'Shuffler Display 4.3" ESD 결과', sender: 'a <a@x.com>', date: '2026-11-01 09:00', body2000: '첨부', key: 'kr1' + RUN },
                  matchedProject: { status: 'ambiguous', candidates: [cands[4]], confidence: '중', matchBasis: 'ai', routing: { basis: 'ai_low', v: 'old' } } },
                { uid: 'r2', status: '대기', task: T13(), mailRaw: { subject: 'STELLAR32 일정 확인', sender: 'b <b@x.com>', date: '2026-11-01 09:00', body2000: '확인 부탁', key: 'kr2' + RUN },
                  matchedProject: { status: 'ambiguous', candidates: [cands[5]], confidence: '중', matchBasis: 'ai', routing: { basis: 'ai_low', v: 'old' } } },
                { uid: 'r3', status: '대기', task: T13(), mailRaw: { subject: '공지', sender: 'c <c@x.com>', date: '2026-11-01 09:00', body2000: '', key: 'kr3' + RUN },
                  matchedProject: { status: 'ambiguous', candidates: [], confidence: '' } }
            ];
            placed.length = 0;
            try {
                window.inboxQuickClassify('r2', '오매칭');
                await new Promise(r => setTimeout(r, 1500));
                const c2 = store.find(x => x.uid === 'r2');
                ok(c2 && c2.excludedFids && c2.excludedFids.indexOf('O1') !== -1, '13-1 ♻️ 는 카드를 지우지 않고 보이던 후보(O1)를 제외 목록에 넣는다', c2 && c2.excludedFids);
                ok(placed.length === 1 && placed[0].fid === 'T1' && c2.status === '자동배치됨', '13-2 제외 뒤 고유 식별자(STELLAR32)가 있으면 그 프로젝트로 다시 배치', placed);
                window.inboxQuickClassify('r1', '오매칭');
                await new Promise(r => setTimeout(r, 1500));
                const c1 = store.find(x => x.uid === 'r1');
                ok(c1.status === '대기' && placed.length === 1, '13-3 같은 가족의 남은 형제(SHUFFLER 3.0)로는 자동배치하지 않는다(메일엔 4.3" — 추측 금지)', { st: c1.status, placed: placed.length });
                ok(c1.matchedProject && c1.matchedProject.candidates.length && c1.matchedProject.candidates.every(c => c.drive_file_id !== 'S4'), '13-4 제외한 후보(S4)는 새 후보에 다시 나오지 않는다', c1.matchedProject && c1.matchedProject.candidates.map(c => c.drive_file_id));
                window.inboxQuickClassify('r3', '오매칭');
                const c3 = store.find(x => x.uid === 'r3');
                ok(c3 && c3.status === '대기' && !c3.excludedFids, '13-5 후보가 없는 카드는 ♻️ 를 눌러도 바뀌지 않는다(지우지 않음)', c3);
                ok(learned === 2, '13-6 학습 기록은 뺀 후보마다 한 번(r2·r1)', learned);
                ok(window._mailRoutes().some(e => e.type === 'correct' && e.fid === 'S4'), '13-7 교정 기록이 남는다(같은 스레드의 다음 메일도 그 프로젝트로 안 간다)');
                const rb = await window.mailRouteRejudgePending({ force: true, toast: false });
                const c1b = store.find(x => x.uid === 'r1');
                ok(c1b.matchedProject.candidates.every(c => c.drive_file_id !== 'S4'), '13-8 다음 재판정에서도 제외 목록은 유지된다', c1b.matchedProject.candidates.map(c => c.drive_file_id));
                const l0 = learned;
                window.inboxQuickClassify('r3', '불필요');
                ok(!store.find(x => x.uid === 'r3') && learned === l0 + 1, '13-9 🗑 삭제는 카드를 바로 지우고 학습 기록(불필요)을 남긴다', { left: store.map(x => x.uid), learned });
            } finally { TI.syncNow = realSync; window.renderTaskInbox = realRender; window._writeLearningEntry = realLearn; }
        }
        // 9-4 유휴 스윕이 'none'(매칭 확정 건 없음)을 돌려줘도 재판정은 돈다 — 대기가 전부 모호할 때가 그 때다
        store = [{ uid: 'n1', status: '대기', task: { 업무명: 'x', 시작일: '2026-11-01', 완료일: '2026-11-02' }, mailRaw: { subject: 'x' },
                   matchedProject: { status: 'ambiguous', candidates: [cands[4]], confidence: '중' } }];
        const realRj = window.mailRouteRejudgePending, realTok = window.googleAccessToken;
        let rj = 0;
        window.mailRouteRejudgePending = async () => { rj++; return {}; };
        if (!window.googleAccessToken) window.googleAccessToken = 'harness';
        const realOff = localStorage.getItem('gantt_autoplace_sweep_off'); localStorage.removeItem('gantt_autoplace_sweep_off');
        try {
            const sw = await window._ibAutoPlaceSweep({ force: true });
            ok(sw && sw.skipped === 'none' && rj === 1, '9-4 스윕 결과가 none 이어도 재판정이 한 번 돈다', { sw, rj });
        } finally { window.mailRouteRejudgePending = realRj; window.googleAccessToken = realTok; if (realOff != null) localStorage.setItem('gantt_autoplace_sweep_off', realOff); }
    } finally {
        TI.load = realLoad; TI.save = realSave; TI.setStatus = realSetStatus;
        window._msAutoRegisterToProject = realReg; window.isAutoRegisterEnabled = realEnabled;
        window._msLoadProjectIndex = realLoadIdx; window._msFilterCandidateProjects = realFilter; window._ibRepairDatesFromMail = realRepair;
    }

    // ── 10. [2026-11-23 사용자 지시] 결정론 판정 먼저, AI 는 업무 정리만 — 진짜 msCallGemini(15c) → 진짜 resolve(15b·61·74)
    //     가짜는 AI 호출(callAiBackend) 하나 — 받은 프롬프트를 기록하고 정해진 JSON 을 돌려준다.
    if (typeof window.msCallGemini === 'function') {
        const realAi = window.callAiBackend;
        const prompts = [];
        window.callAiBackend = async (key, prompt) => {
            prompts.push(String(prompt));
            const txt = JSON.stringify({ 업무명: 'ESD 재시험', 상세내용: '[핵심내용] 재시험', 시작일: '2026-11-20', 완료일: '2026-11-21', 담당구분: 'HW',
                                         주매칭프로젝트번호: 5, 매칭신뢰도: '중', 매칭근거: 'fake' });
            return { ok: true, data: { result: { candidates: [{ content: { parts: [{ text: txt }] } }] } } };
        };
        try {
            const parsed = (subj) => ({ subject: subj, sender: 'a <a@customer.com>', date: '2026-11-20 10:00', body: '본문입니다. 확인 부탁드립니다.', to: '', cc: '', key: '', refs: [] });
            const realSum = cands[4].topicSummary; cands[4].topicSummary = 'SHUFFLER 4.3 하네스 요약 문장'; cands[4].topicKeywords = ['TULIP-4.3', 'ESD'];
            const r1 = await window.msCallGemini('fake-key', parsed('Re: Shuffler Display 4.3" ESD 재시험 결과'), cands, null, null);
            const p1 = prompts[prompts.length - 1] || '';
            ok(r1 && r1._preRouted && r1._preRouted.fid === 'S4', '10-1 결정론으로 확정되면 AI 호출 전에 프로젝트가 정해진다(_preRouted=S4)', r1 && r1._preRouted);
            ok(p1.indexOf('주매칭프로젝트번호') === -1 && p1.indexOf('규칙으로 이미 정해졌습니다') !== -1, '10-2 그때 프롬프트엔 후보 목록·매칭 지시가 없다(업무 정리만)', p1.slice(-300));
            ok(p1.indexOf('SHUFFLER 4.3 하네스 요약 문장') !== -1 && p1.indexOf('TULIP-4.3') !== -1 && p1.indexOf('SHUFFLER 4.3 하네스 요약 문장') < p1.lastIndexOf('이메일:'), '10-2b 확정된 프로젝트의 토픽 요약·키워드가 메일 본문 앞 맥락으로 들어간다', p1.slice(0, 200));
            cands[4].topicSummary = realSum; delete cands[4].topicKeywords;
            const t1 = window._msResolveAiProjectMatch(r1, cands);
            ok(t1 && t1.status === 'matched' && t1.candidates[0].drive_file_id === 'S4' && t1.routing && t1.routing.pre, '10-3 resolve 는 AI 답(5번·중)을 무시하고 결정론 판정 그대로 확정', t1 && t1.routing);
            const r2 = await window.msCallGemini('fake-key', parsed('회의 일정 안내'), cands, null, null);
            const p2 = prompts[prompts.length - 1] || '';
            ok(r2 && !r2._preRouted && p2.indexOf('주매칭프로젝트번호') !== -1, '10-4 결정론으로 못 정하면 예전처럼 후보 목록을 주고 AI 가 고른다', p2.length);
            ok(p1.length < p2.length, '10-5 확정된 메일의 프롬프트가 더 짧다(후보 목록이 빠짐)', [p1.length, p2.length]);
        } finally { window.callAiBackend = realAi; }
    } else { ok(false, '10-0 msCallGemini 가 전역에 없음'); }

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

/* ⚠️⚠️ [2026-11-23] 진짜 NAS 를 절대 건드리지 않는다 — 회사 PC(NAS 연결됨)에서 돌렸더니
   3-4 의 mailRoutingSaveConfig 가 **팀 공용** App_Config/MailRouting_Shared.json 을 썼고,
   7절의 가짜 배치·교정 18건이 **사람의 실제 배분 기록**(MailRoutes/<월>__<계정>.json)에 올라갔다.
   또 실행 도중 js/74 의 NAS 재로딩이 하네스의 메모리 상태를 덮어써 3-4·7-4b 가 가짜로 실패했다.
   → 실행 동안 nasAppFile 을 메모리 가짜로 바꾸고, 하네스가 만든 기록은 그 가짜로 flush 한 뒤에 되돌린다. */
window.__mailRoutingTest = async function () {
    const realNas = window.nasAppFile, mem = {};
    window.nasAppFile = {
        get: async (rel) => { if (!(rel in mem)) { const e = new Error('404 (harness memory)'); e.status = 404; throw e; } return JSON.parse(mem[rel]); },
        put: async (rel, doc) => { mem[rel] = JSON.stringify(doc); return { ok: true }; },
        list: async (dir) => Object.keys(mem).filter(k => k.indexOf(dir + '/') === 0).map(k => ({ name: k.split('/').pop() }))
    };
    try {
        if (window._mailRoutesReload) await window._mailRoutesReload();   // 진짜 기록을 메모리에서 비우고 시작
        if (window.mailRoutingLoadConfig) await window.mailRoutingLoadConfig();
        return await window.__mailRoutingTestBody();
    } finally {
        try { if (window._mailRoutesFlush) await window._mailRoutesFlush(); } catch (e) { /* 가짜로 */ }
        window.nasAppFile = realNas;
        try { if (window._mailRoutesReload) await window._mailRoutesReload(); } catch (e) { /* 무시 */ }
        try { if (window.mailRoutingLoadConfig) await window.mailRoutingLoadConfig(); } catch (e) { /* 무시 */ }
        const wrote = Object.keys(mem);
        console.log('🧪 하네스가 쓴 파일(메모리에만, NAS 아님):', wrote);
    }
};
