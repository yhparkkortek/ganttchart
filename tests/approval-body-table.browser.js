// 📝 기안 작성 — 본문 표 칸 채우기 + 선행 문서 참조(from:'doc') 검증 하네스
//
//  돌리는 법: 앱(kortek_pm.html)을 열고 브라우저 콘솔에 이 파일을 붙여넣는다.
//            → `await __apvBodyTest()`
//
//  ■ 무엇을 진짜로 돌리나 (CLAUDE.md "고쳤다의 정의")
//    · **본문 표 짝짓기 규칙은 gw_bridge.py 에서 읽어 와 돌린다** — 하네스가 제 사본을 갖지
//      않는다. 사본을 두면 "하네스는 통과하는데 실제로는 다른 칸에 들어가는" 바로 그 고장을
//      테스트가 못 잡는다(그래서 애초에 규칙을 한 벌로 묶었다).
//    · js/47 은 진짜다 — `_resolveOne`·`_apvPrefetchRefDocs`·`_apvApply`·미리보기 렌더까지
//      실제 경로를 지난다. 가짜는 **바깥 경계 셋**뿐:
//        ① `window.fetch` 의 127.0.0.1:5000 호출  ② `_gwEnsureLogin`  ③ `collectTabData`/토스트
//    · 그래서 **그룹웨어에 아무 요청도 가지 않고, 기안 문서가 하나도 안 생긴다.**
//
//  ■ 확인 못 하는 것 (정직하게)
//    실제 그룹웨어 작성 화면에 값이 들어가는 것 자체는 여기서 확인할 수 없다 —
//    `/gw/approval/copy` 는 dryRun 이어도 **빈 기안 문서 id 를 발급**하므로 함부로 부르지 않는다.
//    그건 사람이 한 번 끝까지 눌러 봐야 한다.
//
//  ■ 픽스처는 **합성**이다 — 사내 문서 본문 HTML 을 저장소에 넣지 않는다(GitHub Pages 공개).
//    구조(라벨 칸 = inline 회색 배경 / 값 칸 = 배경 없음)와 칸 이름만 실측과 똑같이 맞췄다.
(function () {
    'use strict';

    var OK = 0, FAIL = 0, LOG = [];
    var ok = function (name, cond, extra) {
        if (cond) { OK++; LOG.push('  ✅ ' + name); }
        else { FAIL++; LOG.push('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
    };
    var eq = function (name, got, want) {
        ok(name + ' (' + JSON.stringify(want) + ')', String(got) === String(want), '실제: ' + JSON.stringify(got));
    };

    // ── 합성 본문 표 ────────────────────────────────────────────────────
    //  ⚠️ 라벨 칸의 배경은 **inline `background: rgb(242,242,242)`** 로 준다 — 실측 문서가
    //     그 모양이다(class 0개). 클래스로 주면 실제와 다른 것을 시험하게 된다.
    var LAB = 'background: rgb(242, 242, 242); border: 1px solid windowtext;';
    var VAL = 'border: 1px solid windowtext;';
    var _syntheticBody = function (opts) {
        opts = opts || {};
        var lab = opts.allPainted ? LAB : LAB;
        var val = opts.allPainted ? LAB : VAL;   // 돌연변이: 값 칸까지 칠하면 구분이 깨진다
        return ''
            + '<table border="1" cellspacing="0" cellpadding="0">'
            // 구역 머리글 — 칸이 하나뿐이라 표가 끊긴다
            + '<tr><td colspan="4" style="' + lab + '">시제품 제작의뢰서</td></tr>'
            // 가로: 라벨 | 값 | 라벨 | 값
            + '<tr><td style="' + lab + '">프로젝트 코드</td><td style="' + val + '">G9999OLD</td>'
            +     '<td style="' + lab + '">모델 담당자</td><td style="' + val + '">옛담당</td></tr>'
            + '<tr><td style="' + lab + '">제품 코드</td><td style="' + val + '">999999</td>'
            +     '<td style="' + lab + '">모 델 명</td><td style="' + val + '">OLD-MODEL</td></tr>'
            + '<tr><td style="' + lab + '">B U Y E R</td><td style="' + val + '">OLDBUYER</td>'
            +     '<td style="' + lab + '">FW Ver</td><td style="' + val + '">OLDFW</td></tr>'
            // 빈 값 칸 — 원본에서 비어 있던 칸도 **채울 수 있어야** 한다
            + '<tr><td style="' + lab + '">기구 담당자</td><td style="' + val + '"></td>'
            +     '<td style="' + lab + '">FW 담당자</td><td style="' + val + '"></td></tr>'
            + '</table>'
            // 열 머리글 꼴: 첫 칸이 라벨, 윗줄이 전부 칠해진 머리글
            + '<table border="1" cellspacing="0" cellpadding="0">'
            + '<tr><td colspan="3" style="' + lab + '"># 주요자재</td></tr>'
            + '<tr><td style="' + lab + '">항목</td><td style="' + lab + '">코드</td><td style="' + lab + '">부품 명</td></tr>'
            + '<tr><td style="' + lab + '">LCM(Panel)</td><td style="' + val + '">111111</td>'
            +     '<td style="' + val + '">OLD PANEL DESC</td></tr>'
            + '<tr><td style="' + lab + '">A/D Board</td><td style="' + val + '">222222</td>'
            +     '<td style="' + val + '">OLD ADB DESC</td></tr>'
            + '</table>';
    };

    // ── gw_bridge.py 에서 **진짜 규칙**을 읽어 온다 ─────────────────────
    //  앱은 저장소 루트를 http.server 로 서빙하므로 소스를 그대로 받을 수 있다.
    var _loadRealPairFn = async function () {
        var r = await fetch('gw_bridge.py?_cb=' + Math.random());
        if (!r.ok) throw new Error('gw_bridge.py 를 못 읽었습니다 (' + r.status + ') — 저장소 루트에서 서빙 중인지 확인하세요.');
        var src = await r.text();
        var m = src.match(/_BODY_PAIR_FN = r"""([\s\S]*?)"""/);
        if (!m) throw new Error('gw_bridge.py 에서 _BODY_PAIR_FN 을 못 찾았습니다 — 이름이 바뀌었나요?');
        var body = m[1];
        if (body.indexOf('__kpmBodyPairs') < 0) throw new Error('_BODY_PAIR_FN 안에 __kpmBodyPairs 가 없습니다.');
        // 그 안에서 선언되는 const 를 꺼내 쓴다(코드는 손대지 않는다).
        /* eslint-disable no-new-func */
        return (new Function(body + '\n; return __kpmBodyPairs;'))();
    };

    // ── A. 본문 표 짝짓기 + 값 바꿔치기 ─────────────────────────────────
    var _testPairing = async function () {
        LOG.push('── A. 본문 표 짝짓기 (gw_bridge.py 의 진짜 규칙) ──');
        var pairFn;
        try { pairFn = await _loadRealPairFn(); }
        catch (e) { ok('gw_bridge.py 에서 규칙 읽기', false, String(e && e.message || e)); return; }
        ok('gw_bridge.py 에서 규칙 읽기', typeof pairFn === 'function');

        var holder = document.createElement('div');
        // ⚠️ 숙기지 않는다 — `visibility:hidden` 이므 innerText 가 별 문자여상 라벨/값을 못 가른다.
        holder.style.cssText = 'position:absolute; left:-99999px; top:0; width:1200px;';
        holder.innerHTML = _syntheticBody();
        document.body.appendChild(holder);
        try {
            var res = pairFn(holder, window);
            var byLabel = {};
            res.pairs.forEach(function (p) { if (!byLabel[p.label]) byLabel[p.label] = p; });

            eq('프로젝트 코드 값', (byLabel['프로젝트 코드'] || {}).value, 'G9999OLD');
            eq('모델 담당자 값', (byLabel['모델 담당자'] || {}).value, '옛담당');
            eq('B U Y E R 값', (byLabel['B U Y E R'] || {}).value, 'OLDBUYER');
            // 열 머리글 꼴 — '항목 + 머리글' 로 합쳐진 라벨이 나와야 한다
            eq('LCM(Panel) 코드 값', (byLabel['LCM(Panel) 코드'] || {}).value, '111111');
            eq('A/D Board 부품 명 값', (byLabel['A/D Board 부품 명'] || {}).value, 'OLD ADB DESC');
            // ⚠️ 빈 값 칸도 **짝으로 나와야** 한다 — 원본에서 비어 있던 칸이 바로 채울 칸이다.
            ok('빈 값 칸도 짝에 포함(기구 담당자)', !!byLabel['기구 담당자'],
               '짝 라벨: ' + Object.keys(byLabel).join(' / '));
            // 라벨끼리 짝지어지지 않아야 한다(머리글 = 머리글 가짜 값 방지)
            ok('라벨끼리 짝지어지지 않음', !byLabel['항목'] || byLabel['항목'].value !== '코드',
               JSON.stringify((byLabel['항목'] || {}).value));

            // ── 값 바꿔치기(쓰기 쪽이 하는 일 그대로) ──
            var edits = { '프로젝트 코드': 'G2509OB', '기구 담당자': '이재우', 'LCM(Panel) 코드': '131475' };
            Object.keys(edits).forEach(function (k) {
                if (byLabel[k]) byLabel[k].cell.textContent = edits[k];
            });
            var after = holder.innerHTML;
            ok('값 칸이 바뀐다', after.indexOf('G2509OB') >= 0 && after.indexOf('131475') >= 0);
            ok('빈 칸도 채워진다', after.indexOf('이재우') >= 0);
            ok('바꾸지 않은 값은 그대로', after.indexOf('OLDBUYER') >= 0 && after.indexOf('OLD ADB DESC') >= 0);
            // ⚠️⚠️ 라벨 칸은 **절대** 건드리면 안 된다 — 라벨이 값으로 덮이면 양식이 깨진다.
            ok('라벨 칸은 그대로', after.indexOf('>프로젝트 코드<') >= 0 && after.indexOf('>B U Y E R<') >= 0);
            ok('옛 값은 사라진다', after.indexOf('G9999OLD') === -1);
        } finally { holder.remove(); }

        // ── 돌연변이: 값 칸까지 칠하면 라벨/값 구분이 깨진다 → 짝이 없어야 한다 ──
        var h2 = document.createElement('div');
        h2.style.cssText = 'position:absolute; left:-99999px; top:0; width:1200px;';
        h2.innerHTML = _syntheticBody({ allPainted: true });
        document.body.appendChild(h2);
        try {
            var broken = pairFn(h2, window).pairs;
            ok('돌연변이(전부 칠함) → 짝 0개로 떨어진다', broken.length === 0,
               '짝 ' + broken.length + '개: ' + broken.slice(0, 3).map(function (p) { return p.label; }).join(','));
        } finally { h2.remove(); }

        // ── 돌연변이: 붙이지 않은 div 에서는 배경색을 못 읽는다 → 판정이 깨진다 ──
        //    (쓰기 쪽이 오프스크린에 **붙이는** 이유가 이것이다)
        var h3 = document.createElement('div');
        h3.innerHTML = _syntheticBody();
        var detached = pairFn(h3, window).pairs;
        ok('돌연변이(DOM 에 안 붙임) → 짝이 깨진다', detached.length === 0,
           '짝 ' + detached.length + '개 — 붙이지 않아도 되는 거라면 쓰기 쪽 주석이 틀렸다');
    };

    // ── B. js/47 경로 — 진짜 _resolveOne / 참조 사다리 / bodyEdits 분리 ──
    var SRC_DOC = {
        ok: true, docId: '100001',
        meta: { docNum: 'RD3-TEST-001', formName: '기안서', id: 100001,
                title: '[시제품 제작의뢰서]TESTPROJ 15.6"' },
        subject: '[시제품 제작의뢰서]TESTPROJ 15.6"',
        fields: { '문서번호': 'RD3-TEST-001', '작 성 일': '2026-01-01(목)', '작 성 자': '옛사람',
                  '작성부서': '개발3팀', '제 목': '[시제품 제작의뢰서]TESTPROJ 15.6"' },
        bodyFields: {
            '프로젝트 코드': 'G9999OLD', '제품 코드': '999999', '모 델 명': 'OLD-MODEL',
            'B U Y E R': 'OLDBUYER', '모델 담당자': '옛담당', '기구 담당자': '옛기구',
            'FW 담당자': '옛FW', 'FW Ver': 'OLDFW', 'X': '0.111', 'Y': '0.222', 'Lv': '100~200',
            '개발 단계': 'Proto A', '총 제작수량': '99 (옛수량)', '출고 요청일': '2026-01-02',
            'LCM(Panel) 코드': '111111', 'LCM(Panel) 부품 명': 'OLD PANEL DESC',
            'A/D Board 코드': '222222', 'A/D Board 부품 명': 'OLD ADB DESC',
            'EDID CHECK SUM': 'DP'
        },
        bodyRows: [['시제품 제작의뢰서']], body: '시제품 제작의뢰서\n프로젝트 코드 | G9999OLD',
        bodyPairCount: 19, checks: [], attachments: []
    };
    // 이 프로젝트의 선행 문서들 — doclist 가 돌려줄 목록
    var PROJ_DOCS = [
        { docNum: 'RD3-TEST-010', formName: '프로젝트코드 등록 신청서', id: 100010,
          title: '프로젝트코드 등록신청서 TESTPROJ', draftedAt: '2025-06-11T10:00:00+09:00' },
        { docNum: 'RD3-TEST-020', formName: '제품코드 등록 신청서', id: 100020,
          title: '제품코드 등록 신청서[TESTPROJ]', draftedAt: '2025-06-18T10:00:00+09:00' },
        // ⚠️ 같은 '기안서' 인데 표준원가 문서 — 틀/참조로 **집히면 안 된다**
        { docNum: 'RD3-TEST-030', formName: '기안서', id: 100030,
          title: '개발3팀_TESTPROJ_E2 BOM(비용)', draftedAt: '2025-09-25T10:00:00+09:00' },
        { docNum: 'RD3-TEST-040', formName: '기안서', id: 100040,
          title: '[시제품 제작의뢰서]TESTPROJ 15.6"', draftedAt: '2026-01-01T10:00:00+09:00' }
    ];
    var REF_READS = {
        'RD3-TEST-010': { ok: true, meta: { docNum: 'RD3-TEST-010', formName: '프로젝트코드 등록 신청서' },
                          fields: { '프로젝트 코드': 'G2509OB', '프로젝트 명칭': 'TESTPROJ', '고객사': 'TESTBUYER' },
                          bodyFields: {} },
        'RD3-TEST-020': { ok: true, meta: { docNum: 'RD3-TEST-020', formName: '제품코드 등록 신청서' },
                          fields: { '자재코드': '502469', 'Description': 'BTN-P>KTBR14DPS01,TEST@VINA' },
                          bodyFields: {} }
    };

    var _testCompose = async function () {
        LOG.push('── B. js/47 경로 (진짜 _resolveOne · 참조 사다리 · bodyEdits) ──');
        if (typeof window.apvComposeFrom !== 'function') {
            ok('js/47 로드됨', false, 'apvComposeFrom 이 없습니다'); return;
        }

        // 가짜는 **바깥 경계에만** — fetch / 로그인 / collectTabData / 토스트
        var origFetch = window.fetch, origEnsure = window._gwEnsureLogin,
            origCollect = window.collectTabData, origToast = window.showToast,
            origMeta = window.projectMeta, origTab = window.tabData,
            origUser = window.currentUserName, origPending = window._apvPending;
        var posts = [];
        window._gwEnsureLogin = async function () { return { ok: true }; };
        window.collectTabData = function () { /* 화면을 읽지 않는다 — 아래 값을 쓴다 */ };
        window.showToast = function () {};
        window.currentUserName = '시험자';

        // 지금 열린 프로젝트(진짜 구조 그대로)
        window.projectMeta = {
            프로젝트코드: 'G-APP-META', 프로젝트명: 'TESTBUYER>TESTPROJ(15.6)',
            고객사: 'TESTBUYER', 모델명: 'TESTPROJ', KTK모델명: 'KTBR14DPS01',
            PN_모델명: 'BTN-P>KTBR14DPS01,TEST@VINA', KTKPN: '502469',
            프로젝트담당자: '박용훈', HW담당자: '박용훈', 기구담당자: '이재우', FW담당자: '권제영',
            팀: '개발3팀', 메일키워드: 'TESTPROJ'
        };
        window.tabData = {
            summary: {},
            briefSpec: [
                { type: 'Optical', sub: '휘도', modelA: '500~550' },
                { type: 'Optical', sub: 'Resolution', modelA: '1920x510' }
            ],
            projectModels: [{ materials: [
                { category: 'PANEL',         ktkPn: '131475', description: 'FOG IPS>PXD-C0I-140N01A,1920X510,-,LVDS' },
                { category: 'AD BOARD',      ktkPn: '303194', description: 'PBA-AD>VIDEO,TULIP-15.6L,R1,V01' },
                { category: 'CONVERTER',     ktkPn: '303237', description: 'PBA-CNV>LEDRV,KCB-02204U-60' },
                { category: 'TOUCH / GLASS', ktkPn: '303245', description: 'TSP PCT ASSY>PP156KT0728LW' },
                { category: 'TOUCH CTRL',    ktkPn: '303223', description: 'PBA-T>FLAMINGO-MB,R0,V00' }
            ] }]
        };

        window.fetch = async function (url, init) {
            var u = String(url);
            var J = function (o) { return { ok: true, status: 200, json: async function () { return o; },
                                            text: async function () { return JSON.stringify(o); } }; };
            if (u.indexOf('127.0.0.1:5000') < 0) return origFetch.apply(window, arguments);
            if (u.indexOf('/gw/approval/doclist') >= 0) {
                var kw = decodeURIComponent((u.match(/keyword=([^&]*)/) || [])[1] || '');
                // ⚠⚠ 키워드가 **없으면** 진짜 그룹웨어처럼 전건을 돌려주어야 한다 —
                //   분얼 배열을 돌려주면 "남의 프로젝트 문서를 집는가"를 **가를 수 없다**
                //   (필터링이 없는 구현도 같이 통과하는 가짜 통과가 된다).
                if (!kw) return J({ ok: true, docs: PROJ_DOCS });
                return J({ ok: true, docs: (kw === 'TESTPROJ') ? PROJ_DOCS : [] });
            }
            if (u.indexOf('/gw/approval/read') >= 0) {
                var n = decodeURIComponent((u.match(/docNum=([^&]*)/) || [])[1] || '');
                if (REF_READS[n]) return J(REF_READS[n]);
                return J(SRC_DOC);
            }
            if (u.indexOf('/gw/approval/copy') >= 0 || u.indexOf('/gw/approval/draft-fill') >= 0) {
                posts.push({ url: u, body: JSON.parse((init && init.body) || '{}') });
                return J({ ok: true, source: { formId: 1, deptId: 2 }, notes: [],
                           draft: { ok: true, log: [], fieldNames: [] }, log: [] });
            }
            return J({ ok: false, message: 'unexpected ' + u });
        };

        try {
            await window.apvComposeFrom('RD3-TEST-001', {});
            var p = window._apvPending;
            ok('미리보기가 열렸다', !!p, String(p));
            if (!p) return;

            // ① 양식 열쇠 — 제목 접두어까지 봐야 한다
            eq('양식 열쇠', p.form, '기안서[시제품 제작의뢰서]');

            var byLabel = {};
            p.rows.forEach(function (r) { byLabel[r.label] = r; });

            // ② 본문 표 칸이 행으로 올라왔다
            var bodyRows = p.rows.filter(function (r) { return r.isBody; });
            ok('본문 표 칸이 미리보기 행에 있다 (19개)', bodyRows.length === 19, '실제 ' + bodyRows.length + '개');

            // ③ 선행 문서 참조 — 채번된 코드가 **문서에서** 온다
            eq('프로젝트 코드 = 선행 문서 값', (byLabel['프로젝트 코드'] || {}).value, 'G2509OB');
            ok('프로젝트 코드 출처에 문서번호가 보인다',
               /RD3-TEST-010/.test((byLabel['프로젝트 코드'] || {}).from || ''),
               (byLabel['프로젝트 코드'] || {}).from);
            eq('제품 코드 = 제품코드 등록 신청서의 자재코드', (byLabel['제품 코드'] || {}).value, '502469');
            eq('모 델 명 = 그 문서의 Description', (byLabel['모 델 명'] || {}).value, 'BTN-P>KTBR14DPS01,TEST@VINA');

            // ④ 앱이 원본인 값
            eq('B U Y E R = 프로젝트 고객사', (byLabel['B U Y E R'] || {}).value, 'TESTBUYER');
            eq('기구 담당자 = 프로젝트 기구담당자', (byLabel['기구 담당자'] || {}).value, '이재우');
            eq('FW 담당자 = 프로젝트 FW담당자', (byLabel['FW 담당자'] || {}).value, '권제영');

            // ⑤ 주요자재 — Summary 고정 구분과 1:1
            eq('LCM(Panel) 코드 = 주요자재 PANEL', (byLabel['LCM(Panel) 코드'] || {}).value, '131475');
            eq('A/D Board 코드 = 주요자재 AD BOARD', (byLabel['A/D Board 코드'] || {}).value, '303194');
            ok('LCM 부품명이 주요자재 내역에서 온다',
               /PXD-C0I-140N01A/.test((byLabel['LCM(Panel) 부품 명'] || {}).value || ''),
               (byLabel['LCM(Panel) 부품 명'] || {}).value);

            // ⑥ Customer SPEC
            eq('Lv = Customer SPEC 휘도', (byLabel['Lv'] || {}).value, '500~550');

            // ⑦ 참조 문서에 없는 확정값은 **비운다**(원본을 물려받지 않는다)
            eq('FW Ver 는 비운다(선행 문서 없음)', (byLabel['FW Ver'] || {}).value, '');
            ok('FW Ver 가 왜 비었는지 적혀 있다',
               !!((byLabel['FW Ver'] || {}).note || (byLabel['FW Ver'] || {}).from),
               JSON.stringify(byLabel['FW Ver']));

            // ⑧ 사람이 정하는 칸은 **원본 유지**
            eq('총 제작수량은 원본 유지', (byLabel['총 제작수량'] || {}).value, '99 (옛수량)');
            eq('개발 단계는 원본 유지', (byLabel['개발 단계'] || {}).value, 'Proto A');
            eq('EDID CHECK SUM 은 원본 유지', (byLabel['EDID CHECK SUM'] || {}).value, 'DP');

            // ⑨ 참조 검색어가 화면에 적혔다
            eq('참조 검색어', (p.ctx || {}).refKeyword, 'TESTPROJ');

            // ── 적용 — bodyEdits 와 fields 가 **갈려서** 나가야 한다 ──
            posts.length = 0;
            await window._apvApply();
            var copyPost = posts.filter(function (x) { return x.url.indexOf('/copy') >= 0; })[0];
            ok('copy 호출이 있었다', !!copyPost, JSON.stringify(posts.map(function (x) { return x.url; })));
            if (copyPost) {
                var be = copyPost.body.bodyEdits || {};
                var fl = copyPost.body.fields || {};
                eq('bodyEdits.프로젝트 코드', be['프로젝트 코드'], 'G2509OB');
                eq('bodyEdits.제품 코드', be['제품 코드'], '502469');
                eq('bodyEdits.기구 담당자', be['기구 담당자'], '이재우');
                eq('bodyEdits.LCM(Panel) 코드', be['LCM(Panel) 코드'], '131475');
                // ⚠️ 안 바뀐 칸은 보내지 않는다
                ok('안 바뀐 칸(총 제작수량)은 bodyEdits 에 없다', !('총 제작수량' in be), JSON.stringify(Object.keys(be)));
                ok('안 바뀐 칸(개발 단계)은 bodyEdits 에 없다', !('개발 단계' in be));
                // ⚠️⚠️ 본문 칸이 fields 로 새면 "해당 칸 없음"으로 떨어지고 AI 루프만 태운다
                ok('본문 칸이 fields 로 새지 않았다', !('프로젝트 코드' in fl) && !('LCM(Panel) 코드' in fl),
                   JSON.stringify(Object.keys(fl)));
                ok('fields 에는 입력칸만 있다', Object.keys(fl).length === 0, JSON.stringify(Object.keys(fl)));
                // FW Ver 는 비우는 게 의도 — 빈 값으로 **보내야** 원본 값이 안 남는다
                ok('FW Ver 는 빈 값으로 보낸다', be['FW Ver'] === '', JSON.stringify(be['FW Ver']));
            }

            // ── 돌연변이 확인: 다른 프로젝트면 참조 문서를 못 찾아야 한다 ──
            window.projectMeta.메일키워드 = 'OTHERPROJ';
            window.projectMeta.모델명 = 'OTHERPROJ';
            window.projectMeta.프로젝트명 = 'X>OTHERPROJ';
            window.projectMeta.KTK모델명 = 'OTHERMODEL';
            window.projectMeta.고객모델명 = '';
            window._apvPending = null;
            await window.apvComposeFrom('RD3-TEST-001', {});
            var p2 = window._apvPending;
            if (p2) {
                var b2 = {};
                p2.rows.forEach(function (r) { b2[r.label] = r; });
                // 남의 프로젝트 코드를 가져오면 **안 된다** → 앱 값(meta)으로 내려가야 한다
                eq('다른 프로젝트: 선행 문서 못 찾으면 앱 값으로', (b2['프로젝트 코드'] || {}).value, 'G-APP-META');
                ok('다른 프로젝트: G2509OB 가 새지 않는다',
                   (b2['프로젝트 코드'] || {}).value !== 'G2509OB', (b2['프로젝트 코드'] || {}).value);
                ok('다른 프로젝트: 왜 참조를 못 했는지 적혀 있다', !!(p2.ctx || {}).refNote, JSON.stringify(p2.ctx));
            } else { ok('돌연변이 미리보기가 열렸다', false); }
        } finally {
            window.fetch = origFetch; window._gwEnsureLogin = origEnsure;
            window.collectTabData = origCollect; window.showToast = origToast;
            window.projectMeta = origMeta; window.tabData = origTab;
            window.currentUserName = origUser; window._apvPending = origPending;
            try { window._apvClose(); } catch (e) {}
        }
    };

    // ── C. 양식 열쇠 판정 (js/52) ───────────────────────────────────────
    var _testFormKey = async function () {
        LOG.push('── C. 양식 열쇠 — formName + 제목 접두어 (js/52) ──');
        if (typeof window._apvFormKey !== 'function') { ok('js/52 로드됨', false); return; }
        eq('기안서 + [시제품 제작의뢰서]',
           window._apvFormKey('기안서', '[시제품 제작의뢰서]LNW>COSMIC SLIM SLOT'), '기안서[시제품 제작의뢰서]');
        // ⚠️⚠️ 같은 '기안서' 인데 표준원가 문서는 **다른 양식**이다
        eq('기안서 + 표준원가(접두어 없음)',
           window._apvFormKey('기안서', '개발3팀_LNW SLIM SLOT_E2 BOM(비용)'), '기안서');
        eq('접두어 없는 양식은 그대로',
           window._apvFormKey('프로젝트코드 등록 신청서', '프로젝트코드 등록신청서 LNW'), '프로젝트코드 등록 신청서');
        // 제목을 안 주면 접두어 항목을 고르지 않는다(모르는 상태로 매핑을 쓰면 안 된다)
        eq('제목 없으면 접두어 항목을 고르지 않는다', window._apvFormKey('기안서', ''), '기안서');
        // 부분문자열 오매칭 방지(기존 보장)
        eq('제품코드 vs 원자재/반제품 구분',
           window._apvFormKey('제품코드 등록 신청서', '제품코드 등록 신청서[X]'), '제품코드 등록 신청서');
        // ⚠️⚠️ 봉투 이름만 들어오면 **짐작하지 않고 되물어야** 한다 —
        //   예전엔 "아무 기안서나 최근 것"을 틀로 집어 **표준원가 문서가 틀**이 됐다(사고 220176 모양).
        //   실제로 js/04h 가 `_apvType.form`('기안서')만 넘기고 있었다(2026-11-09 실측으로 걸렸다).
        if (typeof window.apvComposeByForm === 'function') {
            var amb = await window.apvComposeByForm('기안서', {});
            ok('봉투 이름만 들어오면 짐작하지 않고 되묻는다',
               !!(amb && amb.ok === false && /봉투/.test(String(amb.message || ''))), JSON.stringify(amb));
            ok('되묻는 문구에 후보가 들어 있다',
               /시제품 제작의뢰서/.test(String((amb || {}).message || '')), String((amb || {}).message || ''));
        }
        // 🔗 호출부(js/04h)가 접두어를 잃지 않는지 — 열쇠를 만드는 함수가 있어야 한다
        ok('_apvTypeKey 가 공개되어 있다(04h 가 이걸로 열쇠를 만든다)',
           typeof window._apvTypeKey === 'function');
        var _tk = window._apvTypeKey && window._apvTypeKey(window._apvDocTypeHit
            ? window._apvDocTypeHit('시제품 제작의뢰서 기안 작성해줘') : null);
        eq('"시제품 제작의뢰서 기안 작성해줘" → 열쇠', _tk, '기안서[시제품 제작의뢰서]');
        var t = window._apvDocTypeByForm('기안서', '[시제품 제작의뢰서]X');
        ok('카탈로그가 본문 양식임을 알고 있다', !!(t && t.bodyForm), JSON.stringify(t && t.form));
        ok('본문 칸 이름을 실측해 들고 있다', !!(t && (t.bodyFields || []).length >= 25),
           String(t && (t.bodyFields || []).length));
    };

    window.__apvBodyTest = async function () {
        OK = 0; FAIL = 0; LOG = [];
        LOG.push('📝 기안 본문 표 + 선행 문서 참조 검증');
        LOG.push('');
        await _testPairing();
        LOG.push('');
        await _testFormKey();
        LOG.push('');
        await _testCompose();
        LOG.push('');
        LOG.push('━'.repeat(60));
        LOG.push((FAIL ? '❌' : '✅') + ' ' + OK + '/' + (OK + FAIL) + ' 통과'
                 + (FAIL ? ('  (실패 ' + FAIL + '건)') : ''));
        console.log(LOG.join('\n'));
        return { ok: OK, fail: FAIL };
    };

    console.log('📝 준비됨 — `await __apvBodyTest()` 를 실행하세요.');
})();
