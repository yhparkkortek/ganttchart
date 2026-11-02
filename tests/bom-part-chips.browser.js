/* 🔎 BOM 부품 찾기 → 행 클릭 칩 — 앱 안에서 실제 경로로 돌리는 검증 (2026-11-02)
 *
 *   쓰는 법: 앱을 열고 **AI 문답 창을 띄운 뒤** 콘솔에 이 파일 전체를 붙여넣는다.
 *            SAP·NAS·백엔드가 없어도 된다(가짜는 아래 바깥 경계뿐).
 *
 * 무엇을 보나 — "표가 그려진다"가 아니라 **사람이 지나는 경로 한 줄기**:
 *   질문 → 결정론 블록 → 칩 표 → 행 click() → 나온 칩 값을 sendGanttQaMessage() 로.
 *   2026-10-29 칩 표 사고(렌더러만 직접 불러 "된다"고 보고했는데 정작 루프→부착 연결이
 *   끊겨 있었다, CLAUDE.md "고쳤다의 정의")와 같은 자리를 노린다.
 *
 * 가짜는 바깥 경계에만:
 *   · `fetch`                     — /sap-bom 은 가짜 BOM 텍스트, 그 밖의 주소는 **전부 차단**
 *                                   (차단해 둬야 칩을 눌러도 SAP·그룹웨어로 실제 요청이 안 간다)
 *   · `_dsList`                   — NAS 파일 목록(사양서 찾기 안쪽 코드는 진짜로 돈다)
 *   · `window.open`/`_dsOpenNative`/`_dsOpenPicker` — 창을 띄우는 자리
 *                                   (⚠️ `_dsOpenInNewTab` 은 **진짜**로 돌린다 — 팝업 차단 폴백이
 *                                    거기 있어서, 그걸 가짜로 바꾸면 새 코드를 안 지나간다)
 *   · `_sapSelectMaterial`        — 기존 SAP 자재 메뉴(메뉴 자체는 js/04g 기존 기능)
 *   · `switchTab`/`plSearch`      — Project list 페이지
 *   · `navigator.clipboard.writeText`
 *   그 안쪽(종류 판정·자재그룹 가르기·이름 추출·칩 목록·라우팅·표 렌더)은 전부 진짜 코드다.
 */
(async function () {
    'use strict';
    const input = document.getElementById('gantt-qa-input');
    if (!input) { console.error('❌ AI 문답 창을 먼저 열어주세요 (#gantt-qa-input 없음)'); return; }

    let fails = 0, passes = 0;
    const ok = (c, label, extra) => {
        if (c) { passes++; console.log('%c ✅ ' + label, 'color:#1f7a3d'); }
        else { fails++; console.log('%c ❌ ' + label + (extra ? ' — ' + extra : ''), 'color:#c92a2a'); }
    };
    const lastAi = () => {
        const h = window._ganttQaHistory.filter(m => m.role === 'ai' && !m.pending);
        return h[h.length - 1] || {};
    };
    const flat = (s) => String(s || '').replace(/\s+/g, ' ');

    // ⚠️ 자재코드·모델명은 **전부 지어낸 값**이다(저장소가 공개돼 있다 — CLAUDE.md).
    //    모양만 2026-11-02 실측 응답 그대로다: `[ N ]\t코드\t내역\t상태\t수량\t단위\t대분류/중분류`.
    //    패널은 **5단계 아래**에 있고(단층으로는 안 나온다), 이름이 없는 행도 섞어 둔다.
    const BOM = [
        '[SAP BOM 전개(ZPP033): 자재 999001, 플랜트 1000]',
        '',
        'STUFE\tIDNRK\tOJTXP\tMMSTA\tMENGE\tMMEIN\tWGBEZ60\tMTSTB',
        '[ 1     ]\t900101\tTSP CURVED>TOUCH,ZZ999TOUCH01,43",=\tX1\t1\tEA\t전장자재/TOUCH SCREEN MODULE\t관리자재',
        '[ 2     ]\t900105\tG/PNL MOD>PC+GF10%,-,-,-,BLK,PAD,430,V1\tX1\t1\tEA\t기구자재/BM PART MODULE\t관리자재',
        '[ 5     ]\t900106\tFOG IPS>ZZ999PANEL-X9,3840X2160,-,-,VB=\tX1\t1\tEA\tDISPLAY/FOG\t관리자재',
        '[ 5     ]\t900107\tFOG IPS>-,1920X1080,-,-,VB\tX1\t2\tEA\tDISPLAY/FOG\t관리자재',
        '[ 1     ]\t900108\tFAN>ZZ99FAN,DC24V,80x80x25,2P\tX1\t1\tEA\t전장자재/FAN\t관리자재'
    ].join('\n');

    // NAS 파일 목록(가짜) — 이름이 같은 파일 1장 + 다른 패널 1장.
    const NAS = {
        'PARTS/PANEL': [
            { name: 'ZZ999PANEL-X9_DATASHEET.pdf', mtime: '2026-10-01T00:00:00' },
            { name: 'ZZ111OTHER-A1.pdf', mtime: '2026-09-01T00:00:00' }
        ]
    };

    const orig = {
        fetch: window.fetch, hist: window._ganttQaHistory, dsList: window._dsList,
        open: window.open, native: window._dsOpenNative, picker: window._dsOpenPicker,
        sap: window._sapSelectMaterial, tab: window.switchTab, plSearch: window.plSearch,
        clip: (navigator.clipboard && navigator.clipboard.writeText) || null
    };
    let bomCalls = 0, blocked = [], opened = null, picked = null, sapOpened = null,
        plWanted = null, copied = null, clipOk = false,
        popupBlocked = false, opens = 0, nativeCall = null;

    const seed = async () => {
        window._ganttQaHistory = [];
        bomCalls = 0; blocked = []; opened = null; picked = null;
        sapOpened = null; plWanted = null; copied = null; opens = 0; nativeCall = null;
        window._ganttQaPendingConfirmButtons = null;
        input.value = '999001 제품에 사용된 패널명 확인해줘';
        await window.sendGanttQaMessage();
    };
    const clickRow = (i) => {
        const trs = [...document.getElementById('gantt-qa-messages').querySelectorAll('tbody tr[onclick]')];
        if (!trs[i]) return null;
        trs[i].click();                                  // 사람이 누르는 그대로
        return window._ganttQaPendingConfirmButtons;
    };
    const chip = (cb, token) => (cb ? cb.buttons : []).find(b => String(b.value).indexOf(token) === 0);
    const press = async (b) => { input.value = b.value; await window.sendGanttQaMessage(); };

    try {
        window.fetch = async (url, opts) => {
            const u = String(url);
            if (u.indexOf('/sap-bom') >= 0) {
                bomCalls++;
                return { ok: true, json: async () => ({ ok: true, text: BOM }) };
            }
            blocked.push(u);                             // 칩을 눌러도 밖으로 안 나가게
            return { ok: true, json: async () => ({ ok: false, error: '(하네스: 네트워크 차단) ' + u }) };
        };
        window._dsList = async (folder) => ({ ok: true, files: NAS[folder] || [], dirs: [] });
        //  창을 띄우는 **바깥 경계**만 가짜 — `_dsOpenInNewTab` 자체는 진짜로 돌아야
        //  팝업 차단 폴백(2026-11-02)이 검증된다. `popupBlocked` 로 차단을 재현한다.
        window.open = (u) => {
            opens++;
            if (popupBlocked) return null;               // 크롬은 막히면 null 을 준다
            opened = decodeURIComponent(String(u).replace(/^.*folder=/, '').replace(/&name=/, '/'));
            return { focus: function () { /* 창 객체 흉내 */ } };
        };
        window._dsOpenNative = async (f, n, o) => { nativeCall = { f: f, n: n, o: o }; return true; };
        window._dsOpenPicker = (o) => { picked = o; };
        window._sapSelectMaterial = (m) => { sapOpened = m; };
        window.switchTab = () => {};
        window.plSearch = (v) => { plWanted = v; };
        try {
            navigator.clipboard.writeText = async (t) => { copied = t; };
            clipOk = true;
        } catch (e) { clipOk = false; }

        // ① 질문 한 줄이 칩 표가 되는가 (예전엔 마크다운 표 글이었다)
        console.log('%c① 부품 칩 표', 'font-weight:bold');
        await seed();
        const box = document.getElementById('gantt-qa-messages');
        ok(bomCalls === 1, 'BOM 을 한 번 전개한다 (' + bomCalls + ')');
        ok(box.querySelectorAll('table').length === 1, '표가 하나 그려졌다');
        ok(box.querySelectorAll('tbody tr[onclick]').length === 2, '패널 2행이 클릭 가능하다 ('
            + box.querySelectorAll('tbody tr[onclick]').length + ')');
        ok(lastAi().rawHtml === true, '칩 표(rawHtml) 말풍선이다 — 마크다운 글이 아니다');
        ok(/ZZ999PANEL-X9/.test(lastAi().tgText || ''), '텔레그램용 마크다운(tgText)이 같이 실려 있다');
        //  ⚠️ `innerHTML` 로 보면 안 된다 — 표가 `>` 를 `&gt;` 로 **이스케이프**해서 넣는다
        //     (처음에 innerHTML 로 적었다가 멀쩡한 코드가 실패로 나왔다 — 하네스 쪽 버그였다).
        ok(/FOG IPS>/.test(box.textContent), '내역을 **보이는 칸으로** 유지한다(이름만 믿지 않게)');
        ok(/자른 것입니다|truncated/.test(box.textContent), 'ALV 가 자른 행을 밝힌다');

        // ② 칩 목록이 행마다 다른가 — 이름이 없는 행엔 이름 쓰는 칩이 없어야 한다
        console.log('%c② 행마다 다른 칩', 'font-weight:bold');
        const cb0 = clickRow(0), cb1 = clickRow(1);
        ok(!!chip(cb0, '__bomPartSpec__'), '이름이 있으면 NAS 사양서 칩이 있다');
        ok(!!chip(cb0, '__bomPartCopy__') && !!chip(cb0, '__bomPartPl__'), '복사·Project list 칩이 있다');
        ok(!chip(cb1, '__bomPartSpec__') && !chip(cb1, '__bomPartCopy__'),
           '이름을 못 찾은 행엔 이름 쓰는 칩이 없다(지어낸 이름으로 뒤지지 않게)');
        ok(!!chip(cb1, '__sapPickMat__'), '이름이 없어도 SAP 자재 메뉴는 있다');
        const kindOf = (id) => window.BOM_PART_KINDS.find(k => k.id === id);
        ok(window._bomPartNasFolders(kindOf('panel'))[0].folder === 'PARTS/PANEL',
           '사양서 폴더를 PARTS 구분 카탈로그에서 읽어 온다',
           JSON.stringify(window._bomPartNasFolders(kindOf('panel'))));
        ok(window._bomPartNasFolders(kindOf('fan')).length === 0, '폴더가 없는 종류는 칩을 안 낸다');

        // ③ 📄 NAS 사양서 — 1건이면 바로 열고, 0건이면 뒤진 폴더를 밝힌다
        console.log('%c③ NAS 사양서', 'font-weight:bold');
        await seed(); await press(chip(clickRow(0), '__bomPartSpec__'));
        ok(opened === 'PARTS/PANEL/ZZ999PANEL-X9_DATASHEET.pdf', '그 이름의 파일을 열었다 (' + opened + ')');
        ok(/NAS 파일 1건|1 file/.test(lastAi().text || ''), '몇 장을 열었는지 적는다', flat(lastAi().text));
        NAS['PARTS/PANEL'] = [{ name: 'ZZ111OTHER-A1.pdf', mtime: '2026-09-01T00:00:00' }];
        await seed(); await press(chip(clickRow(0), '__bomPartSpec__'));
        ok(opened === null, '안 걸리면 아무것도 열지 않는다 (' + opened + ')');
        ok(/찾지 못했|No NAS file/.test(lastAi().text || '') && /PARTS\/PANEL/.test(lastAi().text || ''),
           '조용히 0건으로 끝내지 않고 뒤진 폴더를 밝힌다', flat(lastAi().text));
        NAS['PARTS/PANEL'] = [
            { name: 'ZZ999PANEL-X9_DATASHEET.pdf', mtime: '2026-10-01T00:00:00' },
            { name: 'ZZ999PANEL-X9_도면.pdf', mtime: '2026-10-02T00:00:00' }
        ];
        await seed(); await press(chip(clickRow(0), '__bomPartSpec__'));
        ok(!!picked && picked.q === 'ZZ999PANEL-X9' && picked.folder === 'PARTS/PANEL',
           '여러 장이면 고르기 창을 띄운다', JSON.stringify(picked && picked.q));

        // ③-b 팝업이 막혔을 때 — 조용히 아무 일도 안 나면 안 된다(2026-11-02 사용자 요청)
        console.log('%c③-b 팝업 차단 → 연결 프로그램', 'font-weight:bold');
        NAS['PARTS/PANEL'] = [{ name: 'ZZ999PANEL-X9_DATASHEET.pdf', mtime: '2026-10-01T00:00:00' }];
        popupBlocked = true;
        await seed(); await press(chip(clickRow(0), '__bomPartSpec__'));
        ok(!!nativeCall && nativeCall.n === 'ZZ999PANEL-X9_DATASHEET.pdf',
           '연결 프로그램으로 넘긴다', JSON.stringify(nativeCall && nativeCall.n));
        ok(!!nativeCall && nativeCall.o && nativeCall.o.noTabFallback === true,
           '되돌아오지 못하게 막는다(무한 재귀 방지)');
        ok(/연결 프로그램|local app/.test(lastAi().text || ''),
           '"새 창에서 열었다"고 거짓말하지 않는다', flat(lastAi().text));
        // 팝업도 막히고 연결 프로그램도 실패하면 — 한 번만 시도하고 사유를 밝힌다
        window._dsOpenNative = async () => { throw new Error('(하네스) 백엔드 꺼짐'); };
        opens = 0;
        let threw = null;
        try { await window._dsOpenInNewTab('PARTS/PANEL', 'ZZ999PANEL-X9_DATASHEET.pdf'); }
        catch (e) { threw = String(e); }
        await new Promise(r => setTimeout(r, 300));
        ok(opens === 1 && !threw, '둘 다 안 되면 한 번만 시도하고 멈춘다 (open ' + opens + '회)', threw);
        window._dsOpenNative = async (f, n, o) => { nativeCall = { f: f, n: n, o: o }; return true; };
        popupBlocked = false;

        // ④ 📋 복사 · 📒 Project list
        console.log('%c④ 복사 · Project list', 'font-weight:bold');
        await seed(); await press(chip(clickRow(0), '__bomPartCopy__'));
        if (clipOk) ok(copied === 'ZZ999PANEL-X9', '이름을 클립보드에 넣는다 (' + copied + ')');
        else console.log('%c ⏭ 클립보드는 이 브라우저에서 가짜로 못 바꿔 건너뜀', 'color:#888');
        await seed(); await press(chip(clickRow(0), '__bomPartPl__'));
        ok(plWanted === 'ZZ999PANEL-X9', 'Project list 를 그 이름으로 검색한다 (' + plWanted + ')');

        // ⑤ 🏭 SAP 칩 — 기존 자재 메뉴로 넘긴다(메뉴를 새로 만들지 않는다)
        console.log('%c⑤ SAP 자재 메뉴로 잇기', 'font-weight:bold');
        await seed(); await press(chip(clickRow(0), '__sapPickMat__'));
        ok(sapOpened === '900106', '그 행의 자재코드로 메뉴가 열린다 (' + sapOpened + ')');

        // ⑥ 평문 칩(사용처·가격)이 **이 기능으로 되돌아오지 않는가** — notKw 가 하는 일
        console.log('%c⑥ 사용처·가격 칩은 다른 조회로 간다', 'font-weight:bold');
        await seed();
        const cbP = clickRow(0);
        const whereChip = (cbP.buttons || []).find(b => /사용처|Where used/.test(b.label));
        const priceChip = (cbP.buttons || []).find(b => /가격|Price/.test(b.label));
        ok(!!whereChip && !!priceChip, '사용처·가격 칩이 있다');
        [whereChip, priceChip].forEach(function (b) {
            const v = String(b.value);
            ok(window._sapCapKwHit(v, 'bom_part') === false, '"' + v + '" 는 부품 찾기로 안 걸린다');
        });
        const before = bomCalls;
        await press(whereChip);
        ok(bomCalls === before, '눌러도 BOM 을 다시 전개하지 않는다 (' + bomCalls + '/' + before + ')');
        ok(blocked.some(u => /sap-/.test(u)) || /사용처|Where/.test(flat(lastAi().text)),
           'SAP 조회 경로로 넘어갔다', blocked.slice(-1)[0] || flat(lastAi().text).slice(0, 60));

        // ⑦ 행 정보가 사라진 경우 — 조용히 아무 일도 안 일어나면 안 된다
        console.log('%c⑦ 행 정보가 없을 때', 'font-weight:bold');
        window._ganttQaHistory = [];
        input.value = '__bomPartSpec__999999'; await window.sendGanttQaMessage();
        ok(lastAi().error === true && /다시 조회|look up/.test(lastAi().text), '다시 조회해달라고 알린다');
    } catch (e) {
        fails++; console.error('❌ 하네스가 예외로 멈췄다:', e);
    } finally {
        window.fetch = orig.fetch; window._ganttQaHistory = orig.hist;
        window._dsList = orig.dsList; window.open = orig.open; window._dsOpenNative = orig.native;
        window._dsOpenPicker = orig.picker; window._sapSelectMaterial = orig.sap;
        window.switchTab = orig.tab; window.plSearch = orig.plSearch;
        if (clipOk && orig.clip) { try { navigator.clipboard.writeText = orig.clip; } catch (e) { /* 되돌릴 수 없으면 둔다 */ } }
        window._ganttQaPendingConfirmButtons = null;
        window._renderGanttQaMessages();
    }
    console.log('%c' + (fails ? '❌ 실패 ' + fails + '건' : '✅ 전부 통과') + ' (통과 ' + passes + '건)',
        'font-weight:bold; font-size:13px; color:' + (fails ? '#c92a2a' : '#1f7a3d'));
})();
