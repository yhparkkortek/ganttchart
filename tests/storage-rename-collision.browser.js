/* ============================================================================
   tests/storage-rename-collision.browser.js — 🛑 이름 바꾸기가 남의 파일을 덮어쓰지 않는가 (js/57)
   ----------------------------------------------------------------------------
   2026-11-24 실사고: 파일명 규칙(고객사>프로젝트명_인치)이 형제 프로젝트(AMUSNET 55C·55J)에 **같은 이름**을 주어,
   저장 때 이름 바꾸기가 55C 를 'AMUSNET_55.0.json' 으로 옮긴 6초 뒤 55J 가 **그 위에** 옮겨져 55C 가 사라졌다.
   앱 탭 콘솔(NAS 모드)에서 `await __renameCollisionTest()`.
   · **진짜 NAS·진짜 어댑터**, 가짜 0개. 앱이 저장할 때 쓰는 그 PATCH(새 이름 + 내용)를 그대로 보낸다.
   · 시험 파일은 `App_Config/zz_rename_collision_<시각>/` 에만 만들고 끝나면 지운다(프로젝트 목록이 훑지 않는 곳).
   · id 지도는 건드리지 않는다 — 충돌이면 이름을 안 바꾸므로 지도 옮기기까지 가지 않는다(1절 정상 이름 바꾸기는 하지 않는다).
   ============================================================================ */
window.__renameCollisionTest = async function () {
    const out = []; let pass = 0, fail = 0;
    const ok = (c, m, x) => { if (c) { pass++; out.push('✅ ' + m); } else { fail++; out.push('❌ ' + m + (x !== undefined ? ' — ' + JSON.stringify(x).slice(0, 300) : '')); } };
    const B = 'http://127.0.0.1:5000';
    const SA = window.STORAGE_ADAPTER, F = SA && SA._fn;
    if (!SA || !F || !SA.installed) { console.error('어댑터가 NAS 모드로 설치되지 않았다'); return { pass: 0, fail: 1 }; }
    const DIR = 'App_Config/zz_rename_collision_' + Date.now().toString(36);
    const dirId = F.idOf(DIR, true);
    const mp = (meta, body) => '\r\n--b\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
                               '\r\n--b\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + body + '\r\n--b--';
    const H = { 'Content-Type': 'multipart/related; boundary="b"' };
    const list = async () => { const r = await fetch(B + '/nas/app/list?rel=' + encodeURIComponent(DIR) + '&_cb=' + Math.random()); const j = await r.json(); return (j.items || []).filter(i => !i.isdir).map(i => i.name).sort(); };
    const readFile = async (name) => { const r = await fetch(B + '/nas/app/get?rel=' + encodeURIComponent(DIR + '/' + name) + '&_cb=' + Math.random(), { cache: 'no-store' }); return r.ok ? await r.text() : null; };
    const create = async (name, body) => {
        const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
            { method: 'POST', headers: H, body: mp({ name, mimeType: 'application/json', parents: [dirId] }, body) });
        return (await r.json()).id;
    };
    let toast = '';
    const svToast = window.showToast; window.showToast = (m) => { toast = String(m); };
    try {
        await fetch(B + '/nas/app/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rel: DIR }) });
        // 형제 둘 — 55C(먼저 새 이름으로 옮겨져 있는 쪽)와 55J
        const idC = await create('AMUSNET_55.0.json', '{"project":"55C"}');
        const idJ = await create('AMUSNET_AMUSNET 55J-R1500_55.0.json', '{"project":"55J","v":1}');
        ok(JSON.stringify(await list()) === JSON.stringify(['AMUSNET_55.0.json', 'AMUSNET_AMUSNET 55J-R1500_55.0.json']), '0 (전제) 두 프로젝트 파일', await list());

        // 1) 55J 를 저장 — 앱이 조립한 새 이름이 55C 와 같다(그날 12:52:49 와 같은 PATCH)
        const r = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + idJ + '?uploadType=multipart&supportsAllDrives=true',
            { method: 'PATCH', headers: H, body: mp({ name: 'AMUSNET_55.0.json', mimeType: 'application/json' }, '{"project":"55J","v":2}') });
        const up = await r.json();
        ok(r.ok, '1 저장 요청 자체는 성공한다(내용은 저장)', { status: r.status, up });
        ok((await readFile('AMUSNET_55.0.json')) === '{"project":"55C"}', '2 🛑 55C 파일은 **덮어쓰이지 않는다**', await readFile('AMUSNET_55.0.json'));
        ok((await readFile('AMUSNET_AMUSNET 55J-R1500_55.0.json')) === '{"project":"55J","v":2}', '3 55J 는 옛 이름 그대로 **새 내용**으로 저장됐다', await readFile('AMUSNET_AMUSNET 55J-R1500_55.0.json'));
        ok(JSON.stringify(await list()) === JSON.stringify(['AMUSNET_55.0.json', 'AMUSNET_AMUSNET 55J-R1500_55.0.json']), '4 파일은 여전히 둘(하나로 합쳐지지 않음)', await list());
        ok(up && up.name === 'AMUSNET_AMUSNET 55J-R1500_55.0.json', '5 돌려받는 이름은 옛 이름(앱이 이름이 안 바뀐 걸 안다)', up && up.name);
        ok(/파일 이름은 바꾸지 않았습니다/.test(toast) && /고객사>프로젝트명/.test(toast), '6 사람에게 이유와 할 일을 알린다', toast);
        // 7) 대소문자만 다른 이름도 충돌로 본다(Windows 탐색기·SMB 는 대소문자를 안 가린다)
        toast = '';
        await fetch('https://www.googleapis.com/upload/drive/v3/files/' + idJ + '?uploadType=multipart&supportsAllDrives=true',
            { method: 'PATCH', headers: H, body: mp({ name: 'amusnet_55.0.json', mimeType: 'application/json' }, '{"project":"55J","v":3}') }).then(x => x.json());
        ok((await readFile('AMUSNET_55.0.json')) === '{"project":"55C"}' && JSON.stringify(await list()) === JSON.stringify(['AMUSNET_55.0.json', 'AMUSNET_AMUSNET 55J-R1500_55.0.json']),
           '7 대소문자만 다른 이름도 덮어쓰지 않는다', await list());
        void idC;
    } catch (e) {
        ok(false, '하네스 예외: ' + e.message);
    } finally {
        window.showToast = svToast;
        for (const n of await list().catch(() => [])) {
            await fetch(B + '/nas/app/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rel: DIR + '/' + n }) }).catch(() => {});
        }
        await fetch(B + '/nas/app/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rel: DIR }) }).catch(() => {});
    }
    console.log(out.join('\n'));
    console.log('🛑 이름 바꾸기 충돌 하네스: ' + pass + ' 통과 / ' + fail + ' 실패');
    return { pass, fail, out };
};
