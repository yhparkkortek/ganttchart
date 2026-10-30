/* 기안 작성 실행 루프 — 사람이 지나는 입구(window._apvApply)부터 통째로 돌린다.
 *
 * 쓰는 법: 앱을 열고 브라우저 콘솔에 이 파일 내용을 통째로 붙여넣는다.
 *          그룹웨어도 AI 키도 필요 없다 — 가짜는 바깥 경계(fetch · callAiBackend)에만 둔다.
 *
 * 확인하는 것
 *   A 실패 없음        → AI 안 부르고 바로 저장
 *   B 값/라벨 실패      → AI가 후보 중 고른 값으로 다시 채우고 저장
 *   C AI가 없는 칸 지어냄 → 버리고, 재시도하지 않고, 정직하게 보고
 *   D 구조 문제         → AI 아예 안 부름(다시 해도 같으므로)
 *   E 계속 실패         → 상한(APV_LOOP.maxRetries)에서 멈춤  ← 가장 중요
 *   공통               → /gw/approval/copy 는 딱 한 번(문서 id 가 하나만 생긴다)
 *
 * ⚠️ 스텁은 호출 '순서'가 아니라 '내용'으로 갈리게 할 것. 순서로 갈리게 했다가
 *    다른 경로가 첫 호출을 먹어 가짜 실패가 난 적이 있다(2026-10-29).
 */
(async function () {
    const realFetch = window.fetch;
    const realToast = window.showToast;
    const realKey = window.getActiveAiKey;
    const realAi = window.callAiBackend;
    const realTO = window._withTimeout;
    const realPending = window._apvPending;

    const NAMES = ['프로젝트 코드', '모델 담당자', '제품 코드'];
    const OK = [{ field: '제목', ok: true }, { field: '프로젝트 코드', ok: true }];
    const BAD = [{ field: '제목', ok: true },
                 { field: '프로젝트 코드', ok: false, why: '해당 칸 없음' }];
    const STRUCT = [{ field: '제목', ok: true },
                    { field: '본문', ok: false, why: 'DEXT5 본문 에디터를 찾지 못했습니다.' }];

    const fillReply = (log, notes) => ({
        ok: true, source: { formId: 5138, deptId: 245 }, notes: notes || [],
        draft: { ok: true, step: 'filled', log: log, fieldNames: NAMES },
        log: log, fieldNames: NAMES
    });
    const saveReply = (log) => ({ ok: true, step: 'saved', docId: '900', log: log });

    // reply(body) — 호출 '내용'으로 갈린다. dryRun === false 면 저장 호출이다.
    async function run(name, reply, aiText) {
        const H = { calls: [], ai: 0, toasts: [] };
        window.showToast = (m, k) => H.toasts.push({ m: String(m), k: k });
        window.getActiveAiKey = () => 'TEST-KEY';
        window._withTimeout = (p) => p;
        window.fetch = async (url, opt) => {
            const u = String(url);
            if (u.indexOf('127.0.0.1:5000') < 0) return realFetch(url, opt);
            const b = JSON.parse(opt.body);
            H.calls.push({ path: u.split('5000')[1], save: b.dryRun === false,
                           reuse: !!b.reuseScreen, fields: Object.assign({}, b.fields) });
            return { json: async () => reply(b, H.calls.length) };
        };
        window.callAiBackend = async () => {
            H.ai++;
            return { ok: true, data: { result: { candidates: [{ content: { parts: [{ text: aiText }] } }] } } };
        };
        window._apvPending = {
            docNum: '', docId: '220640', form: '기안서', asIs: true, material: '', src: {},
            rows: [{ label: '제목', value: 'T', isSubject: true },
                   { label: '프로젝트 코드', value: '' }]
        };
        await window._apvApply();
        const opens = H.calls.filter(c => c.path.indexOf('/copy') >= 0).length;
        const refills = H.calls.filter(c => c.path.indexOf('/draft-fill') >= 0 && !c.save).length;
        const saves = H.calls.filter(c => c.save).length;
        const noStrayNav = H.calls.every(c => c.path.indexOf('/copy') >= 0 || c.reuse === true);
        return { name, opens, refills, saves, ai: H.ai, noStrayNav,
                 toast: (H.toasts[0] || {}).m || '', kind: (H.toasts[0] || {}).k || '' };
    }

    const MAX = (window.APV_LOOP || {}).maxRetries || 0;
    const R = [];

    R.push([await run('A 실패 없음', (b) => b.dryRun === false ? saveReply(OK) : fillReply(OK), '{}'),
            r => r.ai === 0 && r.opens === 1 && r.refills === 0 && r.saves === 1 && r.kind === 'success']);

    R.push([await run('B AI가 메움', (b, n) => {
                if (b.dryRun === false) return saveReply(OK);
                return n === 1 ? fillReply(BAD, ['원본 본문을 그대로 새 기안 본문에 넣었습니다.']) : fillReply(OK);
            }, '{"프로젝트 코드":"G26LWTN"}'),
            r => r.ai === 1 && r.opens === 1 && r.refills === 1 && r.saves === 1 && /AI가 1칸/.test(r.toast)]);

    R.push([await run('C 지어낸 칸', (b) => b.dryRun === false ? saveReply(BAD) : fillReply(BAD),
                      '{"없는칸이름":"지어낸값"}'),
            r => r.ai === 1 && r.refills === 0 && /버렸습니다/.test(r.toast) && r.kind === 'info']);

    R.push([await run('D 구조 문제', (b) => b.dryRun === false ? saveReply(STRUCT) : fillReply(STRUCT),
                      '{"프로젝트 코드":"X"}'),
            r => r.ai === 0 && r.refills === 0 && /재시도 안 함/.test(r.toast)]);

    R.push([await run('E 상한', (b) => b.dryRun === false ? saveReply(BAD) : fillReply(BAD),
                      '{"모델 담당자":"장영익"}'),
            r => r.ai === MAX && r.refills === MAX && r.saves === 1]);

    window.fetch = realFetch; window.showToast = realToast; window.getActiveAiKey = realKey;
    window.callAiBackend = realAi; window._withTimeout = realTO; window._apvPending = realPending;

    let pass = 0;
    R.forEach(([r, check]) => {
        const good = !!check(r);
        if (good) pass++;
        console.log((good ? '✅' : '❌') + ' ' + r.name,
                    '| 열기 ' + r.opens + ' 재채움 ' + r.refills + ' 저장 ' + r.saves + ' AI ' + r.ai,
                    '| ' + r.toast);
    });
    console.log((pass === R.length ? '✅ 전부 통과' : '❌ 실패 있음') + ' — ' + pass + '/' + R.length
                + ' (상한 ' + MAX + ')');
    return pass === R.length;
})();
