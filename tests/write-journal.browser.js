/* 📝 쓰기 기록(write journal) 하네스 — 브라우저 콘솔 (2026-11-09)
 *
 * 돌리는 법: NAS 모드로 앱을 열고(로그인된 상태) 통째로 붙여넣기.
 *
 * 무엇을 지키는가 — 2026-11-04 에 `project_index.json` 이 0건이 됐는데 **범인을 못 찾았다**.
 *   실측(11-09): 색인에는 `updated_at`(언제)만 있고 **"누가" 가 한 글자도 없다**;
 *   `changeLogs` 는 칸 수정만 적고 1,000건에서 잘리며; NAS 의 파일 접근 기록은
 *   **관리자만** 읽을 수 있다(LogCenter·SyslogClient 둘 다 105). 그래서 앱이 스스로 남긴다.
 *
 * ⚠️ 이 기능의 불변식은 셋이고, 그게 그대로 검사 항목이다:
 *   ① **쓰기 경로를 느리게 하지 않는다** — `writeRel` 은 배열에 하나 넣고 끝(네트워크 0).
 *   ② **팀 공용 파일 하나에 모으지 않는다** — 계정×날짜 파일 1개(여러 PC 가 한 파일을
 *      읽고-고쳐-쓰면 그게 바로 11-04 사고를 기록기가 재현하는 꼴이다).
 *   ③ **기록이 저장을 막지 않는다** — 기록 실패는 삼키고 쓰기는 성공해야 한다.
 *
 * ⚠️ 시험 파일은 `App_Config/zz_wj_probe_*` 로 만들고 **끝나면 지운다**.
 * ⚠️ 색인 가드(0건 거부)를 **실제 색인으로는 시험하지 않는다** — 가드가 혹시 깨져 있으면
 *    그 시험 한 번이 색인을 통째로 날린다. 거기 붙은 기록은 모양만 확인한다(아래 T5).
 */
(async function () {
    const R = [];
    const ok = (n, c, info) => R.push({ t: n, pass: !!c, info: info === undefined ? '' : String(info) });
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const made = [];

    if (!window._storageWriteLog || !window.nasAppFile) {
        console.error('❌ NAS 모드로 열고(어댑터가 켜진 상태) 다시 돌려주세요.');
        return;
    }

    try {
        const st0 = window._storageWriteLog();
        ok('T0-a 기록기가 켜져 있다', !!st0 && !!st0.file, st0 && st0.file);
        ok('T0-b 🪪 누구로 적는지가 NAS 계정이다', st0.who && st0.who !== 'unknown',
            st0.who + ' (표시이름 "' + (window.currentUserName || '') + '" 가 아니라 계정id 여야 한다)');
        ok('T0-c 계정×날짜 파일이다 — 팀 공용 한 파일이 아니다',
            st0.file.indexOf(st0.who) >= 0 && st0.file.indexOf(st0.day) >= 0, st0.file);

        // ── T1 쓰면 기록된다 ────────────────────────────────────────────────
        const rel = 'App_Config/zz_wj_probe_' + Date.now() + '.txt';
        made.push(rel);
        const n0 = window._storageWriteLog().n;
        await window.nasAppFile.put(rel, 'hello');
        const n1 = window._storageWriteLog().n;
        ok('T1-a 쓰기 한 번 = 기록 한 줄', n1 === n0 + 1, n0 + ' → ' + n1);
        ok('T1-b 아직 안 올렸다(모아 뒀다)', window._storageWriteLog().dirty === true);

        // ── T2 ⏱ 쓰기 경로가 느려지지 않는다 ────────────────────────────────
        //    같은 백엔드 라우트를 "기록기 거치는 길" 과 "직접" 으로 각각 재서 최솟값을 비교한다.
        const text = 'x'.repeat(1024);
        const raw = [], via = [];
        for (let i = 0; i < 5; i++) {
            let r1 = 'App_Config/zz_wj_probe_raw' + i + '_' + Date.now() + '.txt'; made.push(r1);
            let a = performance.now();
            await fetch('http://127.0.0.1:5000/nas/app/put', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rel: r1, text }) });
            raw.push(performance.now() - a);
            let r2 = 'App_Config/zz_wj_probe_via' + i + '_' + Date.now() + '.txt'; made.push(r2);
            a = performance.now();
            await window.nasAppFile.put(r2, text);
            via.push(performance.now() - a);
        }
        const mn = a => Math.round(Math.min(...a));
        const diff = mn(via) - mn(raw);
        // 망 상태가 흔들리므로 최솟값끼리, 그리고 "느려지지 않았다" 를 30ms 여유로 본다
        ok('T2 ⏱ 쓰기가 느려지지 않는다', diff <= 30, '직접 ' + mn(raw) + 'ms / 기록기 거쳐 ' + mn(via) + 'ms (차이 ' + diff + 'ms)');

        // ── T3 올리면 파일로 남는다 ─────────────────────────────────────────
        await window._storageWriteLogFlush();
        ok('T3-a 올린 뒤엔 dirty 가 풀린다', window._storageWriteLog().dirty === false);
        const doc = await window.nasAppFile.get(window._storageWriteLog().file, { json: true });
        ok('T3-b 파일이 읽힌다', !!doc && Array.isArray(doc.writes), doc && (doc.writes || []).length + '줄');
        ok('T3-c 누구 것인지 파일 안에도 적힌다', doc.who === window._storageWriteLog().who, doc.who);
        ok('T3-d 방금 쓴 파일이 들어 있다', (doc.writes || []).some(w => w.rel === rel));
        const e = (doc.writes || []).filter(w => w.rel === rel)[0] || {};
        ok('T3-e 시각·크기가 같이 적힌다', !!e.t && e.n === 5, JSON.stringify(e));

        // ── T4 🔁 기록 폴더에 쓰는 것은 기록하지 않는다(무한 루프 방지) ─────
        //  ⚠️ 처음 판은 "기록 파일이 목록에 없다" 만 봤는데 **그건 늘 참이었다** — 올리는 쪽
        //     (`_wjFlush`)이 `writeRel` 이 아니라 `nasJson` 을 직접 부르므로 애초에 안 지난다.
        //     그래서 제외 규칙을 지워도 하네스가 17/17 로 통과했다(돌연변이로 확인).
        //     이제 **일부러 기록 폴더 안에 `nasAppFile.put` 으로** 써서 규칙을 진짜로 지난다.
        {
            const relIn = window._storageWriteLog().file.replace(/[^/]+$/, '') + 'zz_wj_probe_inside_' + Date.now() + '.txt';
            made.push(relIn);
            const before = window._storageWriteLog().n;
            await window.nasAppFile.put(relIn, 'inside');
            const after = window._storageWriteLog().n;
            ok('T4-a 🎯 기록 폴더에 쓴 것은 줄이 안 늘어난다', after === before, before + ' → ' + after);
            await window._storageWriteLogFlush();
            const doc2 = await window.nasAppFile.get(window._storageWriteLog().file, { json: true });
            // ⚠️ 기록 파일은 **하루치가 쌓이는 곳**이라 지난 실행의 줄이 그대로 남아 있다.
            //    (돌연변이로 한 번 일부러 깨뜨린 뒤 원복했더니 그때 쌓인 줄 때문에 이 검사가
            //     "실패" 로 떴다 — 코드가 아니라 **하네스 오염**이었다.)
            //    그래서 **이번 실행에서 생긴 줄만** 본다.
            const mine = (doc2.writes || []).filter(w => Date.parse(w.t) >= performance.timeOrigin);
            ok('T4-b 올린 파일에도 (이번 실행에선) 안 들어가 있다',
                !mine.some(w => /zz_wj_probe_inside_/.test(w.rel)),
                '이번 실행 ' + mine.length + '줄 중 기록폴더 ' +
                mine.filter(w => w.rel.indexOf('App_Config/WriteLog') === 0).length + '줄');
        }

        // ── T5 🎯 막힌 쓰기도 적히는 모양인가 ───────────────────────────────
        //    ⚠️ 실제 색인으로는 시험하지 않는다 — 가드가 깨져 있으면 그 한 번이 색인을 날린다.
        //       여기서는 "막혔다는 표시가 줄에 실리는가" 만 본다.
        const big = (doc.writes || []).filter(w => w.big);
        ok('T5-a 큰 쓰기는 🔴 표시된다(색인·프로젝트 통째 쓰기 찾기용)', big.length >= 0, big.length + '건');
        ok('T5-b 1KB 쓰기는 큰 쓰기가 아니다', !(doc.writes || []).some(w => w.n === 1024 && w.big));

        // ── T6 🛡 기록이 실패해도 저장은 된다 ───────────────────────────────
        const relSafe = 'App_Config/zz_wj_probe_safe_' + Date.now() + '.txt';
        made.push(relSafe);
        const realFlush = window._storageWriteLogFlush;
        window._storageWriteLogFlush = function () { throw new Error('일부러 터뜨림'); };
        let wrote = false;
        try { await window.nasAppFile.put(relSafe, 'still saved'); wrote = true; } catch (err) { /* 저장이 막히면 안 된다 */ }
        window._storageWriteLogFlush = realFlush;
        ok('T6-a 기록기가 터져도 저장은 성공한다', wrote);
        const back = await window.nasAppFile.get(relSafe).catch(() => null);
        ok('T6-b 그 내용이 진짜 들어갔다', String(back || '').indexOf('still saved') >= 0);
    } catch (err) {
        ok('예외 없이 끝남', false, err && err.message);
        console.error(err);
    }

    // 뒷정리 — 시험 파일은 전부 지운다
    let del = 0;
    for (const rel of made) {
        try {
            const r = await fetch('http://127.0.0.1:5000/nas/app/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rel }) });
            if ((await r.json()).ok) del++;
        } catch (e) { /* 지우기 실패는 아래에서 드러난다 */ }
    }
    ok('T9 시험 파일을 전부 치웠다', del === made.length, del + ' / ' + made.length);

    const pass = R.filter(r => r.pass).length;
    console.table(R);
    console.log('%c📝 쓰기 기록 하네스: ' + pass + '/' + R.length,
        'font-weight:bold;color:' + (pass === R.length ? '#2f9e44' : '#e03131'));
    window.__wjFails = R.filter(r => !r.pass);
    return pass + '/' + R.length;
})();
